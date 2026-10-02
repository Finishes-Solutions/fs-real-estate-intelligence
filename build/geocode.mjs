// Address geocoding with a persistent cache. Most precise source first, every hit validated:
//   1. parcel   Texas GIO StratMap parcels, matched on situs house number + street + zip → parcel centroid (the actual lot)
//   2. census   US Census batch geocoder; Exact matches, or Non_Exact only when the matched zip is the filing's zip
//   3. osm      Nominatim structured search; only house-level results in the same zip / city
//   4. maptiler strict address match
//   5. city     jittered town-center fallback (flagged approximate, not cached)
// Parcel and Census hits are trusted (they match house number, street and zip). Weaker sources (osm, maptiler, city)
// are rejected when opts.check(row, [lon, lat]) says the point is implausible (e.g. far outside the filed county).
// Cache entries: { c: [lon, lat] | null, src, at, v }. Entries from older versions are re-geocoded.
import { fetchRetry, pool, log, sleep } from './util.mjs';

export const GEO_V = 2;
const PARCELS = process.env.PARCEL_SERVICE || 'https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer/0';

export function cleanStreet(s) {
  s = s.split(/;|,|\s#|\s(?:Suite|Ste\.?|STE|Bldg\.?|Building|BLDG|Unit|Level|Lvl)\b/i)[0];
  return s.replace(/\s*&\s*\d+/, '').replace(/(\d+)\s*1\/2/, '$1').replace(/^(\d+)-\d+/, '$1').trim();
}
export function parseCity(line) { const m = line.match(/^(.*?),?\s*(?:TX|Texas)\s*(\d{5})?/i); return m ? { city: m[1].trim(), zip: m[2] || '' } : { city: '', zip: '' }; }

// ---- 1. parcels ----
const DIRS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'NORTH', 'SOUTH', 'EAST', 'WEST']);
const TYPES = new Set(['RD', 'ROAD', 'ST', 'STREET', 'DR', 'DRIVE', 'AVE', 'AVENUE', 'BLVD', 'LN', 'LANE', 'PKWY', 'PARKWAY', 'HWY', 'HIGHWAY', 'FWY', 'FREEWAY', 'CT', 'CIR', 'WAY', 'TRL', 'PL', 'LOOP', 'EXPY', 'SQ', 'TER', 'PLZ', 'CV', 'XING', 'RUN', 'PASS', 'BND', 'FM', 'CR', 'SH', 'US', 'IH', 'I', 'SPUR', 'RM', 'TX', 'STATE']);
// "1234 W Little York Rd" -> { num: '1234', core: 'LITTLE YORK' }; numbered highways keep their number ("FM 529" -> "529")
export function splitStreet(st) {
  const m = String(st || '').toUpperCase().replace(/[.,']/g, ' ').match(/^(\d+)[A-Z]?\s+(.+)$/); if (!m) return null;
  const toks = m[2].split(/\s+/).filter(Boolean), core = toks.filter(t => !DIRS.has(t) && !TYPES.has(t));
  if (!core.length) return null;
  return { num: m[1], core: core.slice(0, 2).join(' ') };
}
let pfP = null; // parcel layer field names, discovered once
const parcelFields = () => pfP || (pfP = discoverParcelFields());
async function discoverParcelFields() {
  let pf = { ok: false };
  try {
    const d = await (await fetchRetry(PARCELS + '?f=json', {}, 2)).json(), names = (d.fields || []).map(f => f.name), find = re => names.find(n => re.test(n));
    pf = { ok: true, addr: find(/^situs_addr$/i), num: find(/^situs_num/i), street: find(/^situs_(street|stre|st_?name|st_1)$/i), zip: find(/^situs_zip/i), city: find(/^situs_city$/i) };
    pf.ok = !!((pf.addr || (pf.num && pf.street)) && (pf.zip || pf.city));
    log('parcel fields:', JSON.stringify(pf));
  } catch (e) { log('parcel service unavailable:', e.message); }
  return pf;
}
const q = s => String(s).replace(/'/g, "''");
function centroid(rings) { let x = 0, y = 0, n = 0; for (const r of rings || []) for (const p of r) { x += p[0]; y += p[1]; n++; } return n ? [x / n, y / n] : null; }
async function parcelLookup(r) {
  const f = await parcelFields(), s = splitStreet(r.st); if (!f.ok || !s) return null;
  const like = s.core.split(' ').map(w => '%' + q(w)).join('') + '%';
  const where = [f.addr ? `UPPER(${f.addr}) LIKE '${q(s.num)} ${like}'` : `${f.num} = '${q(s.num)}' AND UPPER(${f.street}) LIKE '${like}'`];
  if (r.zip && f.zip) where.push(`${f.zip} LIKE '${q(r.zip)}%'`); else if (f.city && r.city) where.push(`UPPER(${f.city}) = '${q(r.city.toUpperCase())}'`); else return null;
  const p = new URLSearchParams({ where: where.join(' AND '), outFields: 'OBJECTID', returnGeometry: 'true', outSR: '4326', geometryPrecision: '6', maxAllowableOffset: '0.0001', resultRecordCount: '6', f: 'json' });
  try {
    const d = await (await fetchRetry(PARCELS + '/query?' + p, {}, 2)).json(); if (d.error) return null;
    const cs = (d.features || []).map(x => centroid(x.geometry && x.geometry.rings)).filter(Boolean); if (!cs.length) return null;
    // several parcels share the address (condos, split lots): accept only if they sit together (~300 m)
    const c = [cs.reduce((a, b) => a + b[0], 0) / cs.length, cs.reduce((a, b) => a + b[1], 0) / cs.length];
    return cs.every(p2 => Math.hypot(p2[0] - c[0], p2[1] - c[1]) < 0.003) ? c : null;
  } catch (e) { return null; }
}

// ---- 2. census ----
async function censusBatch(items) {
  const res = {};
  for (let k = 0; k < items.length; k += 1000) {
    const csv = items.slice(k, k + 1000).map(x => [x.id, x.street, x.city, 'TX', x.zip].map(v => '"' + String(v || '').replace(/"/g, '') + '"').join(',')).join('\n');
    const fd = new FormData(); fd.append('addressFile', new Blob([csv], { type: 'text/csv' }), 'a.csv'); fd.append('benchmark', 'Public_AR_Current');
    try {
      const t = await (await fetchRetry('https://geocoding.geo.census.gov/geocoder/locations/addressbatch', { method: 'POST', body: fd }, 3)).text();
      for (const line of t.split('\n')) {
        const c = line.match(/"([^"]*)"/g); if (!c || c.length < 6) continue; const v = c.map(x => x.slice(1, -1));
        if (v[2] !== 'Match' || !v[5]) continue;
        const [lon, lat] = v[5].split(',').map(Number), zip = (v[4].match(/(\d{5})\s*$/) || [])[1] || '';
        res[v[0]] = { c: [lon, lat], exact: v[3] === 'Exact', zip };
      }
    } catch (e) { log('census batch failed', e.message); }
  }
  return res;
}

// ---- 3. nominatim (max 1 request/second per usage policy) ----
async function nominatim(r) {
  await sleep(1100);
  const p = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', limit: '3', countrycodes: 'us', street: r.st, city: r.city, state: 'Texas' }); if (r.zip) p.set('postalcode', r.zip);
  try {
    const res = await fetch('https://nominatim.openstreetmap.org/search?' + p, { headers: { 'User-Agent': 'FinishesSolutions-filings-map/1.0 (nightly build)' } });
    if (!res.ok) return null; const d = await res.json();
    for (const x of d) {
      const a = x.address || {}, sameZip = r.zip && a.postcode && a.postcode.slice(0, 5) === r.zip;
      const sameCity = [a.city, a.town, a.village, a.hamlet, a.suburb].some(v => v && v.toLowerCase() === r.city.toLowerCase());
      if (a.house_number && (sameZip || sameCity)) return [+x.lon, +x.lat];
    }
  } catch (e) { /* miss */ }
  return null;
}
export async function maptiler(key, bbox, q2, strict) {
  const u = 'https://api.maptiler.com/geocoding/' + encodeURIComponent(q2) + '.json?key=' + key + '&country=us&limit=1&bbox=' + bbox.join(',');
  try { const d = await (await fetchRetry(u, {}, 2)).json(); const f = (d.features || [])[0];
    if (!f) return null; if (strict && !(f.address && (f.relevance || 0) >= 0.9)) return null; return f.center; } catch (e) { return null; }
}

const RETRY_MISS_DAYS = 60;
export const addrKey = r => (r.st + '|' + r.city + '|' + r.zip).toLowerCase().replace(/\s+/g, ' ');

// rows need st, city, zip, ProjectNumber. Returns { [ProjectNumber]: { c:[lon,lat], src:'address'|'city', via } }.
// budget (optional, shared across calls): { nominatim: max lookups left }. Addresses skipped for budget are not cached as misses.
export async function geocodeRows(rows, cache, { key, bbox, places, budget, check = () => true, parcels = true }) {
  const inBox = c => c && c[0] > bbox[0] && c[0] < bbox[2] && c[1] > bbox[1] && c[1] < bbox[3];
  const ok = (r, c) => inBox(c) && check(r, c), strong = (r, c) => inBox(c);
  const today = new Date(), stale = e => !e || e.v !== GEO_V || (!e.c && (!e.at || (today - new Date(e.at)) / 864e5 > RETRY_MISS_DAYS));
  const out = {}, need = new Map();
  for (const r of rows) {
    if (!r.st || !r.city) continue;
    const k = addrKey(r), e = cache[k];
    if (!stale(e)) { if (e.c && (e.src === 'parcel' || e.src === 'census' || check(r, e.c))) out[r.ProjectNumber] = { c: e.c, src: 'address', via: e.src }; continue; }
    if (!need.has(k)) need.set(k, r);
  }
  const todo = [...need.entries()], stamp = today.toISOString().slice(0, 10), put = (k, c, src) => { cache[k] = { c, src, at: stamp, v: GEO_V }; };
  log('geocode: cached', rows.length - todo.length, 'lookup', todo.length);
  let np = 0, nc = 0, nm = 0, mt = 0; const skipped = new Set();
  if (parcels && todo.length) {
    await pool(todo, 6, async ([k, r]) => { const c = await parcelLookup(r); if (c && strong(r, c)) { put(k, c, 'parcel'); np++; } });
  }
  const fresh = k => cache[k] && cache[k].at === stamp && cache[k].v === GEO_V && cache[k].c;
  const rest = todo.filter(([k]) => !fresh(k));
  const census = await censusBatch(rest.map(([k, r], i) => ({ id: String(i), street: r.st, city: r.city, zip: r.zip })));
  rest.forEach(([k, r], i) => { const m = census[i]; if (m && (m.exact || (r.zip && m.zip === r.zip)) && strong(r, m.c)) { put(k, m.c, 'census'); nc++; } });
  for (const [k, r] of todo) {
    if (fresh(k)) continue;
    if (budget && budget.nominatim <= 0) { skipped.add(k); continue; }
    if (budget) budget.nominatim--;
    const c = await nominatim(r); if (c && ok(r, c)) { put(k, c, 'osm'); nm++; }
  }
  await pool(todo.filter(([k]) => !fresh(k) && !skipped.has(k)), 4, async ([k, r]) => { const c = await maptiler(key, bbox, `${r.st}, ${r.city}, TX ${r.zip}`, true); if (c && ok(r, c)) { put(k, c, 'maptiler'); mt++; } });
  todo.forEach(([k]) => { if (!fresh(k) && !skipped.has(k)) put(k, null, null); });
  log('geocode: parcel', np, 'census', nc, 'nominatim', nm, 'maptiler', mt, 'missed', todo.length - np - nc - nm - mt - skipped.size, skipped.size ? '| nominatim budget used up, ' + skipped.size + ' left for a later run' : '');
  for (const r of rows) { if (out[r.ProjectNumber] || !r.st || !r.city) continue; const e = cache[addrKey(r)]; if (e?.c && (e.src === 'parcel' || e.src === 'census' || check(r, e.c))) out[r.ProjectNumber] = { c: e.c, src: 'address', via: e.src }; }

  // town-center fallback, jittered by project number so markers don't stack
  const cityCache = {};
  for (const r of rows) {
    if (out[r.ProjectNumber] || !r.city) continue;
    const ck = r.city.toLowerCase();
    if (!(ck in cityCache)) { const pl = places.find(p => p[0].toLowerCase() === ck); cityCache[ck] = pl ? [pl[1], pl[2]] : await maptiler(key, bbox, r.city + ', Texas', false); }
    const c = cityCache[ck]; if (!c || !ok(r, c)) continue;
    let h = 0; for (const ch of r.ProjectNumber) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    out[r.ProjectNumber] = { c: [c[0] + ((h % 1000) / 1000 - 0.5) * 0.02, c[1] + (((h >> 10) % 1000) / 1000 - 0.5) * 0.02], src: 'city', via: 'city' };
  }
  return out;
}
