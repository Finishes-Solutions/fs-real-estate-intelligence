// Data pipeline for the Finishes Solutions real estate intelligence map.
//   node build.mjs             full refresh (GitHub Actions): TABS -> geocode -> AI enrichment -> change feed -> market data, then assemble
//   node build.mjs --assemble  copy src/ + committed data/ into public/ (Vercel build; no network)
// Everything slow is cached under data/cache/ and committed, so weekly runs only fetch what changed.
import fs from 'node:fs/promises';
import { geoContains } from 'd3-geo';
import { log, hash, readJSON, writeMap, writeRows, iso, fetchRetry } from './build/util.mjs';
import { listCounty, details } from './build/tabs.mjs';
import { geocodeRows, cleanStreet, parseCity } from './build/geocode.mjs';
import { buildGeo, minVertexDist } from './build/geometry.mjs';
import { enrich, aiFields, aiKey } from './build/enrich.mjs';
import { diff, appendRun } from './build/changes.mjs';
import { buildMarket } from './build/market.mjs';

const TYPE = { 9001: 'New', 9002: 'Reno', 9003: 'Addition' };
const STATUS = { 3001: 'Inspection complete', 3007: 'Closed', 3008: 'Registered', 3009: 'Review complete' };
const KEY = process.env.MAPTILER_KEY || 'vA28jXazwpYesC2b1Ccp';
const D = process.env.DATA_DIR || 'data/', C = D + 'cache/';

// ---- timeline dates: filer estimates when usable, otherwise inferred and flagged ----
const okDate = s => /^\d{4}-\d\d-\d\d$/.test(s) && +s.slice(0, 4) >= 2000 && +s.slice(0, 4) <= 2045;
const addMonths = (s, m) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + Math.round(m * 30.44)); return iso(d); };
const DUR = { New: [6, 4], Reno: [3, 2], Addition: [4, 3], Other: [4, 2] }; // months = base + k * log10(cost / $50K)
function timeline(type, cost, reg, start, end) {
  const s = okDate(start) ? start : reg, sE = !okDate(start);
  if (okDate(end) && end >= s) return { ts: s, te: end, tsE: sE, teE: false };
  const [b, k] = DUR[type] || DUR.Other, m = Math.max(2, Math.min(36, b + k * Math.log10(Math.max(cost, 5e4) / 5e4)));
  return { ts: s, te: addMonths(s, m), tsE: sE, teE: true };
}

async function assemble() {
  try { await fs.access(D + 'filings.json'); } catch (e) { throw new Error('data/filings.json is missing. Run the "Refresh data" GitHub Action (or `node build.mjs` with network access) first.'); }
  await fs.rm('public', { recursive: true, force: true });
  await fs.mkdir('public/data', { recursive: true }); await fs.mkdir('public/lib', { recursive: true });
  for (const f of await fs.readdir('src')) await fs.copyFile('src/' + f, 'public/' + f);
  for (const f of ['geo.json', 'filings.json', 'changes.json', 'market.json']) { try { await fs.copyFile(D + f, 'public/data/' + f); } catch (e) { log('assemble: no', f); } }
  for (const f of ['taxonomy.mjs', 'filter.mjs']) await fs.copyFile('lib/' + f, 'public/lib/' + f);
  log('assembled public/');
}

async function refresh() {
  const regions = await readJSON(D + 'regions.json');
  const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
  const counties = regions.counties.filter(c => !ONLY.length || ONLY.includes(c.name));
  const now = new Date();
  const endD = process.env.PERIOD_END ? new Date(process.env.PERIOD_END) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const startD = process.env.PERIOD_START ? new Date(process.env.PERIOD_START) : new Date(Date.UTC(endD.getUTCFullYear(), endD.getUTCMonth() - (regions.months - 1), 1));
  log('period', iso(startD), '→', iso(endD), '|', counties.map(c => c.name).join(', '));

  // geometry (rebuilt only when regions change)
  const rHash = hash(JSON.stringify(regions));
  let geo = await readJSON(D + 'geo.json');
  if (!geo || geo._regions !== rHash || process.env.REBUILD_GEO) { geo = { ...(await buildGeo(regions)), _regions: rHash }; await fs.writeFile(D + 'geo.json', JSON.stringify(geo)); }

  // 1. TABS list
  let rows = [];
  for (const c of counties) { const r = await listCounty(c.name, c.tabsId, startD, endD); log(c.name, r.length); rows = rows.concat(r); }
  const seen = new Set(); rows = rows.filter(r => !seen.has(r.ProjectNumber) && seen.add(r.ProjectNumber));
  const prevFile = await readJSON(D + 'filings.json', { filings: [] });
  const prevHere = prevFile.filings.filter(f => counties.some(c => c.name === f.county));
  if (prevHere.length > 200 && rows.length < prevHere.length * 0.5 && !process.env.ALLOW_SHRINK) throw new Error(`TABS returned ${rows.length} filings vs ${prevHere.length} last run; refusing to overwrite (set ALLOW_SHRINK=1 to force)`);

  // 2. detail pages (cached)
  const tabsCache = await readJSON(C + 'tabs.json', {});
  await details(rows, tabsCache);
  rows.forEach(r => { const pc = parseCity(r.cityLine || ''); r.city = pc.city; r.zip = pc.zip; r.st = cleanStreet(r.street || ''); });

  // 3. geocoding (cached)
  const geoCache = await readJSON(C + 'geocode.json', {});
  const loc = await geocodeRows(rows, geoCache, { key: KEY, bbox: regions.bbox, places: geo.places });

  // 4. AI enrichment (cached)
  const aiCache = await readJSON(C + 'ai.json', {});
  try { await enrich(rows, aiCache); } catch (e) { log('enrich stopped:', e.message); }

  // 5. compact filings
  const cg = Object.fromEntries(geo.counties.map(c => [c.name, { type: 'MultiPolygon', coordinates: c.outline }]));
  const inBox = c => c && c[0] > regions.bbox[0] && c[0] < regions.bbox[2] && c[1] > regions.bbox[1] && c[1] < regions.bbox[3];
  const fresh = rows.filter(r => inBox(loc[r.ProjectNumber]?.c)).map(r => {
    const { c, src } = loc[r.ProjectNumber]; const sq = parseInt(String(r.sqft || '').replace(/[^\d]/g, ''), 10);
    const scope = (r.scope || '').replace(/\s+/g, ' ').trim(), type = TYPE[r.TypeOfWork] || 'Other', cost = r.EstimatedCost || 0;
    const reg = (r.ProjectCreatedOn || '').slice(0, 10), start = (r.EstimatedStartDate || '').slice(0, 10), end = (r.EstimatedEndDate || '').slice(0, 10);
    const ai = aiFields(r, aiCache) || {};
    const f = { id: r.ProjectNumber, name: (r.ProjectName || '').replace(/\s+/g, ' ').trim(), county: r._county, city: r.city, addr: [r.street, r.cityLine].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
      type, cost, sqft: sq > 1 ? sq : null, owner: (r.owner || '').trim(), scope: scope.length > 260 ? scope.slice(0, 250).replace(/\s\S*$/, '') + '…' : scope,
      reg, status: STATUS[r.ProjectStatus] || '', start, end, ...timeline(type, cost, reg, start, end),
      lat: Math.round(c[1] * 1e5) / 1e5, lon: Math.round(c[0] * 1e5) / 1e5 };
    if (src === 'city') f.approx = true;
    if (cg[r._county] && !geoContains(cg[r._county], c) && minVertexDist(cg[r._county], c) > 0.12) f.misfiled = true;
    if (ai.use) Object.assign(f, { use: ai.use, sub: ai.subtype || '', ten: ai.tenant || '', dev: ai.developer || '', arch: ai.architect || (r.design || '').trim(), gc: ai.gc || '', units: ai.units ?? null, sum: ai.summary || '' });
    else if (r.design) f.arch = r.design.trim();
    return f;
  });
  const other = prevFile.filings.filter(f => !counties.some(c => c.name === f.county));
  const filings = fresh.concat(other).sort((a, b) => b.cost - a.cost);
  log('mapped', fresh.length, 'of', rows.length, '| approx', fresh.filter(f => f.approx).length, '| enriched', fresh.filter(f => f.use).length);

  // 6. change feed
  const items = diff(prevHere, fresh);
  const feed = appendRun(await readJSON(D + 'changes.json'), { built: now.toISOString(), items });
  log('changes', items.length);

  // 7. market context (best effort)
  try { const m = await buildMarket(regions, await readJSON(D + 'market.json')); await fs.writeFile(D + 'market.json', JSON.stringify(m)); }
  catch (e) { log('market skipped:', e.message); }

  // write data + caches (caches pruned to filings still in the window)
  const live = new Set(rows.map(r => r.ProjectNumber)), liveAi = new Set(rows.map(aiKey));
  for (const k of Object.keys(tabsCache)) if (!live.has(k) && !ONLY.length) delete tabsCache[k];
  for (const k of Object.keys(aiCache)) if (!liveAi.has(k) && !ONLY.length) delete aiCache[k];
  await writeMap(C + 'tabs.json', tabsCache); await writeMap(C + 'geocode.json', geoCache); await writeMap(C + 'ai.json', aiCache);
  await writeRows(D + 'filings.json', { period: { start: iso(startD), end: iso(endD) }, built: now.toISOString(), unmapped: rows.length - fresh.length }, 'filings', filings);
  await fs.writeFile(D + 'changes.json', JSON.stringify(feed));

  // optional weekly digest to a Zapier catch hook
  if (process.env.ZAPIER_DIGEST_WEBHOOK && items.length) {
    const byId = Object.fromEntries(filings.map(f => [f.id, f])), nu = items.filter(x => x.k === 'new').map(x => byId[x.id]).filter(Boolean).sort((a, b) => b.cost - a.cost);
    try { await fetchRetry(process.env.ZAPIER_DIGEST_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      built: now.toISOString(), newCount: nu.length, newValue: nu.reduce((s, f) => s + f.cost, 0), changed: items.length - nu.length,
      top: nu.slice(0, 15).map(f => ({ id: f.id, name: f.name, county: f.county, city: f.city, type: f.type, use: f.use || '', cost: f.cost, start: f.ts, link: 'https://www.tdlr.texas.gov/TABS/Projects/' + f.id })) }) }, 2); log('digest posted'); }
    catch (e) { log('digest failed:', e.message); }
  }
}

const assembleOnly = process.argv.includes('--assemble');
(assembleOnly ? assemble() : refresh().then(assemble)).catch(e => { console.error(e); process.exit(1); });
