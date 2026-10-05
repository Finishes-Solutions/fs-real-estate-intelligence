// Businesses and places for the seven counties -> Supabase `places` (supabase/migrations/20261016000000_places.sql).
//   1. Overture Maps Places, latest release (public S3 bucket, no key): read with DuckDB, only the region's box
//   2. Foursquare Open Source Places, latest release, when HF_TOKEN is set (Hugging Face gated dataset: free, accept the
//      terms once at huggingface.co/datasets/foursquare/fsq-os-places with the account the token belongs to)
//   3. keep places inside the seven county outlines, drop closed and doubtful ones, merge the two sources' duplicates
//   4. upsert in chunks, then drop rows this load didn't touch (refused if the new load is under half the old one)
// Run by the "Places" workflow (monthly). DuckDB isn't a dependency of the site: the workflow installs @duckdb/node-api.
// Local test: OVERTURE_PARQUET=file.parquet [FSQ_PARQUET=file.parquet] DRY=1 node build/places.mjs
import fs from 'node:fs/promises';
import { overtureRow, fsqRow, dedupe, inOutline, normName, GROUPS } from '../lib/places.mjs';
import { supa } from '../lib/supa.mjs';

const E = process.env, log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const OVERTURE_BUCKET = 'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com';
const FSQ_HF = 'https://huggingface.co/api/datasets/foursquare/fsq-os-places';

export async function latestOverture(fetchImpl = fetch) {
  const xml = await (await fetchImpl(OVERTURE_BUCKET + '/?list-type=2&prefix=release/&delimiter=/')).text();
  const rel = [...xml.matchAll(/<Prefix>release\/([^<]+)\/<\/Prefix>/g)].map(m => m[1]).filter(r => /^\d{4}-\d\d-\d\d/.test(r)).sort();
  if (!rel.length) throw new Error('no Overture releases listed'); return rel[rel.length - 1];
}
export async function latestFoursquare(token, fetchImpl = fetch) {
  const r = await fetchImpl(FSQ_HF + '/tree/main/release', { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('Hugging Face ' + r.status + (r.status === 401 || r.status === 403 ? ': accept the dataset terms with the token’s account' : ''));
  const dts = (await r.json()).map(x => String(x.path || '').match(/dt=(\d{4}-\d\d-\d\d)/)?.[1]).filter(Boolean).sort();
  if (!dts.length) throw new Error('no Foursquare releases listed'); return dts[dts.length - 1];
}

async function duck() {
  const { DuckDBInstance } = await import('@duckdb/node-api');
  const db = await DuckDBInstance.create(':memory:'), c = await db.connect();
  return { run: q => c.run(q), rows: async q => (await c.runAndReadAll(q)).getRowObjectsJson() };
}
const sq = s => "'" + String(s).replace(/'/g, "''") + "'";

export async function readOverture(d, box, { release, file } = {}) {
  const src = file ? sq(file) : sq('s3://overturemaps-us-west-2/release/' + release + '/theme=places/type=place/*');
  if (!file) await d.run("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2'; SET s3_access_key_id=''; SET s3_secret_access_key='';");
  // a local file from the dev query already has these column names
  const cols = file ? 'id, name, cat, hier, conf, web, phone, brand, addr, city, zip, status, srcs, lon, lat'
    : "id, names.primary AS name, taxonomy.primary AS cat, taxonomy.hierarchy AS hier, confidence AS conf, websites[1] AS web, phones[1] AS phone, brand.names.primary AS brand, addresses[1].freeform AS addr, addresses[1].locality AS city, addresses[1].postcode AS zip, operating_status AS status, list_transform(sources, s -> s.dataset) AS srcs, bbox.xmin AS lon, bbox.ymin AS lat";
  const where = file ? 'lon BETWEEN ' + box[0] + ' AND ' + box[2] + ' AND lat BETWEEN ' + box[1] + ' AND ' + box[3]
    : 'bbox.xmin BETWEEN ' + box[0] + ' AND ' + box[2] + ' AND bbox.ymin BETWEEN ' + box[1] + ' AND ' + box[3];
  return d.rows('SELECT ' + cols + ' FROM read_parquet(' + src + ') WHERE ' + where);
}
export async function readFoursquare(d, box, { release, token, file } = {}) {
  let src = sq(file || '');
  if (!file) { await d.run('INSTALL httpfs; LOAD httpfs; CREATE OR REPLACE SECRET hf (TYPE huggingface, TOKEN ' + sq(token) + ');'); src = sq('hf://datasets/foursquare/fsq-os-places/release/dt=' + release + '/places/parquet/*.parquet'); }
  return d.rows('SELECT fsq_place_id, name, latitude, longitude, address, locality, postcode, region, country, tel, website, date_refreshed::VARCHAR AS date_refreshed, date_closed::VARCHAR AS date_closed, fsq_category_labels FROM read_parquet(' + src + ') ' +
    'WHERE longitude BETWEEN ' + box[0] + ' AND ' + box[2] + ' AND latitude BETWEEN ' + box[1] + ' AND ' + box[3] + " AND (country = 'US' OR country IS NULL)");
}

// rows inside one of the counties get the county's FIPS; the rest are dropped
export function inCounties(rows, counties) {
  const cs = counties.map(c => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of c.outline) for (const r of p) for (const [x, y] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { ...c, b: [x0, y0, x1, y1] }; });
  const out = [];
  for (const r of rows) { const c = cs.find(c => r.lon >= c.b[0] && r.lon <= c.b[2] && r.lat >= c.b[1] && r.lat <= c.b[3] && inOutline([r.lon, r.lat], c.outline)); if (c) out.push({ ...r, county: c.fips }); }
  return out;
}
export const countyBox = counties => { let b = [Infinity, Infinity, -Infinity, -Infinity]; for (const c of counties) for (const p of c.outline) for (const r of p) for (const [x, y] of r) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]; return b.map(v => Math.round(v * 1000) / 1000); };

async function main() {
  const regions = JSON.parse(await fs.readFile('data/regions.json', 'utf8')), geo = JSON.parse(await fs.readFile('data/geo.json', 'utf8'));
  const counties = geo.counties.map(c => ({ name: c.name, outline: c.outline, fips: regions.counties.find(r => r.name === c.name)?.fips }));
  const box = countyBox(counties), d = await duck();
  log('box', box.join(','));
  const ovRel = E.OVERTURE_PARQUET ? 'local' : (E.OVERTURE_RELEASE || await latestOverture());
  const ov = await readOverture(d, box, { release: ovRel, file: E.OVERTURE_PARQUET }); log('overture', ovRel, ov.length, 'records in the box');
  let fsq = [], fsqRel = null;
  if (E.FSQ_PARQUET || E.HF_TOKEN) {
    try {
      fsqRel = E.FSQ_PARQUET ? 'local' : (E.FSQ_RELEASE || await latestFoursquare(E.HF_TOKEN));
      fsq = await readFoursquare(d, box, { release: fsqRel, token: E.HF_TOKEN, file: E.FSQ_PARQUET }); log('foursquare', fsqRel, fsq.length, 'records in the box');
    } catch (e) { log('foursquare skipped:', e.message); fsqRel = null; }
  } else log('foursquare skipped: no HF_TOKEN');
  const a = ov.map(r => overtureRow({ ...r, conf: +r.conf, lon: +r.lon, lat: +r.lat })).filter(Boolean), b = fsq.map(r => fsqRow(r)).filter(Boolean);
  log('kept', a.length, 'overture and', b.length, 'foursquare after quality filters');
  const merged = inCounties(dedupe([...a, ...b]), counties);
  const byGroup = {}, bySource = {}; for (const r of merged) { byGroup[r.grp] = (byGroup[r.grp] || 0) + 1; for (const s of r.src) bySource[s] = (bySource[s] || 0) + 1; }
  log('merged', merged.length, 'places in the counties', JSON.stringify(byGroup), JSON.stringify(bySource));
  if (E.DRY) { await fs.writeFile(E.DRY_OUT || '/tmp/places-sample.json', JSON.stringify(merged.slice(0, 2000))); log('dry run: nothing written to the database'); return; }
  const db = supa(); if (!db) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are needed to load places');
  const load = new Date().toISOString().slice(0, 16).replace(/\D/g, '');
  const rows = merged.map(r => ({ ...r, name_norm: normName(r.name), load_id: load }));
  for (let i = 0; i < rows.length; i += 1000) { await db.upsert('places', rows.slice(i, i + 1000), 'id', 1000); if (i % 50000 === 0) log('loaded', i + Math.min(1000, rows.length - i), '/', rows.length); }
  const pr = await db.rpc('places_prune', { p_load: load, p_min_keep: E.PLACES_ALLOW_SHRINK ? 0 : 0.5 });
  log('prune', JSON.stringify(pr));
  if (pr?.refused) throw new Error('This load has ' + pr.kept + ' places against ' + pr.total + ' before; old rows kept. Set PLACES_ALLOW_SHRINK=1 to accept it.');
  await db.upsert('places_loads', [{ load_id: load, overture_release: ovRel, foursquare_release: fsqRel, rows: rows.length, by_group: byGroup, by_source: bySource }], 'load_id');
  log('done:', rows.length, 'places;', Object.keys(GROUPS).length, 'groups');
}
if (import.meta.url === 'file://' + process.argv[1]) main().catch(e => { console.error(e); process.exit(1); });
