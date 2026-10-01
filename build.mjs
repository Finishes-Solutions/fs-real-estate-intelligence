// Build step for the Finishes construction-filings map.
// Pulls TDLR TABS registrations for Waller + 6 neighboring counties, geocodes them,
// builds county / dot-grid geometry, and writes everything to public/.
// Redeploying the site re-runs this and refreshes the data.
import fs from 'node:fs/promises';
import { geoContains, geoArea, geoCentroid } from 'd3-geo';
import { feature } from 'topojson-client';

const KEY = process.env.MAPTILER_KEY || 'vA28jXazwpYesC2b1Ccp';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const COUNTY_IDS = { Waller: '2237', Harris: '2101', 'Fort Bend': '2079', Montgomery: '2167', Austin: '2008', Washington: '2239', Grimes: '2093' };
const FIPS = { Waller: '48473', Harris: '48201', 'Fort Bend': '48157', Montgomery: '48339', Austin: '48015', Washington: '48477', Grimes: '48185' };
const RING = ['48041','48051','48287','48149','48089','48481','48039','48167','48071','48291','48407','48471','48313'];
const TYPE = { 9001: 'New', 9002: 'Reno', 9003: 'Addition' };
const STATUS = { 3001: 'Inspection complete', 3007: 'Closed', 3008: 'Registered', 3009: 'Review complete' };
const BBOX = [-97.3, 28.8, -94.3, 31.2];
const UA = { 'User-Agent': 'Mozilla/5.0 (FinishesSolutions filings map build)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('[build]', ...a);

// ---- period: env or the last 3 complete months ----
function mdY(d) { return String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + String(d.getUTCDate()).padStart(2, '0') + '/' + d.getUTCFullYear(); }
const now = new Date();
const endD = process.env.PERIOD_END ? new Date(process.env.PERIOD_END) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
const startD = process.env.PERIOD_START ? new Date(process.env.PERIOD_START) : new Date(Date.UTC(endD.getUTCFullYear(), endD.getUTCMonth() - 2, 1));
const START = mdY(startD), END = mdY(endD);

async function fetchRetry(url, opts = {}, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) } }); if (r.ok) return r; if (r.status < 500 && r.status !== 429) throw new Error(url + ' ' + r.status); }
    catch (e) { if (i === tries - 1) throw e; }
    await sleep(800 * (i + 1));
  }
  throw new Error('failed ' + url);
}
async function pool(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }

// ---- 1. TABS list ----
async function listCounty(name, id) {
  const rows = []; let start = 0;
  for (;;) {
    const body = new URLSearchParams({ draw: '1', start: String(start), length: '100', LocationCounty: id, RegistrationDateBegin: START, RegistrationDateEnd: END });
    const r = await fetchRetry('https://www.tdlr.texas.gov/TABS/Search/SearchProjects', { method: 'POST', body, headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' } });
    const d = await r.json(); (d.data || []).forEach(x => rows.push({ ...x, _county: name }));
    start += 100; if (start >= (d.recordsFiltered || 0) || !(d.data || []).length) break;
  }
  return rows;
}
// ---- 2. detail pages ----
const decode = s => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));
async function detail(p) {
  try {
    const h = await (await fetchRetry('https://www.tdlr.texas.gov/TABS/Projects/' + p.ProjectNumber)).text();
    const L = decode(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n')).split('\n').map(s => s.trim()).filter(Boolean);
    const after = (lbl, n = 1) => { const i = L.indexOf(lbl); return i < 0 ? '' : L.slice(i + 1, i + 1 + n).join(' | '); };
    const loc = after('Location Address:', 2).split(' | ');
    p.street = loc[0] || ''; p.cityLine = loc[1] || '';
    p.owner = after('Owner Name:'); p.scope = after('Scope of Work:'); p.sqft = after('Square Footage:');
  } catch (e) { p.street = p.street || ''; }
  return p;
}
// ---- 3. geocoding ----
function cleanStreet(s) {
  s = s.split(/;|,|\s#|\s(?:Suite|Ste\.?|STE|Bldg\.?|Building|BLDG|Unit|Level|Lvl)\b/i)[0];
  return s.replace(/\s*&\s*\d+/, '').replace(/(\d+)\s*1\/2/, '$1').replace(/^(\d+)-\d+/, '$1').trim();
}
function parseCity(line) { const m = line.match(/^(.*?),?\s*(?:TX|Texas)\s*(\d{5})?/i); return m ? { city: m[1].trim(), zip: m[2] || '' } : { city: '', zip: '' }; }
async function censusBatch(items) {
  const res = {};
  for (let k = 0; k < items.length; k += 1000) {
    const csv = items.slice(k, k + 1000).map(x => [x.id, x.street, x.city, 'TX', x.zip].map(v => '"' + String(v || '').replace(/"/g, '') + '"').join(',')).join('\n');
    const fd = new FormData(); fd.append('addressFile', new Blob([csv], { type: 'text/csv' }), 'a.csv'); fd.append('benchmark', 'Public_AR_Current');
    try {
      const t = await (await fetchRetry('https://geocoding.geo.census.gov/geocoder/locations/addressbatch', { method: 'POST', body: fd }, 3)).text();
      for (const line of t.split('\n')) { const c = line.match(/"([^"]*)"/g); if (!c || c.length < 6) continue; const v = c.map(x => x.slice(1, -1)); if (v[2] === 'Match' && v[5]) { const [lon, lat] = v[5].split(',').map(Number); res[v[0]] = [lon, lat]; } }
    } catch (e) { log('census batch failed', e.message); }
  }
  return res;
}
async function maptiler(q, strict) {
  const u = 'https://api.maptiler.com/geocoding/' + encodeURIComponent(q) + '.json?key=' + KEY + '&country=us&limit=1&bbox=' + BBOX.join(',');
  try { const d = await (await fetchRetry(u, {}, 2)).json(); const f = (d.features || [])[0];
    if (!f) return null; if (strict && !(f.address && (f.relevance || 0) >= 0.85)) return null; return f.center; } catch (e) { return null; }
}
async function nominatim(q) { // OpenStreetMap, max 1 request/second per usage policy
  await sleep(1100);
  try { const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' + encodeURIComponent(q), { headers: { 'User-Agent': 'FinishesSolutions-filings-map/1.0 (monthly build)' } });
    if (!r.ok) return null; const d = await r.json(); return d[0] ? [+d[0].lon, +d[0].lat] : null; } catch (e) { return null; }
}
const inBox = c => c && c[0] > BBOX[0] && c[0] < BBOX[2] && c[1] > BBOX[1] && c[1] < BBOX[3];

// ---- geometry helpers ----
function rewind(g) { // d3 wants clockwise exterior rings
  const fix = poly => { const p = { type: 'Polygon', coordinates: poly }; return geoArea(p) > 2 * Math.PI ? poly.map(r => r.slice().reverse()) : poly; };
  return g.type === 'Polygon' ? { type: 'MultiPolygon', coordinates: [fix(g.coordinates)] } : { type: 'MultiPolygon', coordinates: g.coordinates.map(fix) };
}
const round = c => Array.isArray(c[0]) ? c.map(round) : [Math.round(c[0] * 1e4) / 1e4, Math.round(c[1] * 1e4) / 1e4];
function grid(geom, step) {
  const out = []; const b = bounds(geom);
  for (let lat = Math.floor(b[1] / step) * step; lat <= b[3]; lat += step) {
    const ls = step / Math.max(Math.cos(lat * Math.PI / 180), 0.15);
    for (let lon = Math.floor(b[0] / ls) * ls; lon <= b[2]; lon += ls) if (geoContains(geom, [lon, lat])) out.push([Math.round(lon * 1e3) / 1e3, Math.round(lat * 1e3) / 1e3]);
  }
  return out;
}
function bounds(g) { let x0 = 180, y0 = 90, x1 = -180, y1 = -90; const walk = c => { if (typeof c[0] === 'number') { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); } else c.forEach(walk); }; walk(g.coordinates); return [x0, y0, x1, y1]; }
function minVertexDist(g, pt) { let m = 9; const walk = c => { if (typeof c[0] === 'number') m = Math.min(m, Math.hypot(c[0] - pt[0], c[1] - pt[1])); else c.forEach(walk); }; walk(g.coordinates); return m; }

async function main() {
  log('period', START, '→', END);
  // geometry sources
  const cj = await (await fetchRetry('https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json')).json();
  const byFips = Object.fromEntries(cj.features.filter(f => f.id.startsWith('48')).map(f => [f.id, f]));
  const counties = Object.entries(FIPS).map(([name, f]) => { const g = rewind(byFips[f].geometry); return { name, geom: g }; });
  const states = await (await fetchRetry('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json')).json();
  const texas = rewind(feature(states, states.objects.states).features.find(f => f.properties.name === 'Texas').geometry);
  const world = await (await fetchRetry('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json')).json();
  const land = feature(world, world.objects.land);
  const landGeom = land.features ? { type: 'MultiPolygon', coordinates: land.features.flatMap(f => rewind(f.geometry).coordinates) } : rewind(land.geometry);
  // places gazetteer
  let places = [];
  try {
    const t = await (await fetchRetry('https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_gaz_place_48.txt')).text();
    const rows = t.split('\n').map(l => l.split('\t').map(s => s.trim())); const h = rows[0];
    const iN = h.indexOf('NAME'), iLa = h.indexOf('INTPTLAT'), iLo = h.indexOf('INTPTLONG');
    places = rows.slice(1).filter(r => r.length > iLo).map(r => [r[iN].replace(/ (city|town|CDP|village)$/, ''), +(+r[iLo]).toFixed(5), +(+r[iLa]).toFixed(5)]).filter(p => inBox([p[1], p[2]]));
  } catch (e) { log('places failed', e.message); }

  // filings
  const names = ONLY.length ? ONLY : Object.keys(COUNTY_IDS);
  let rows = []; for (const n of names) { const r = await listCounty(n, COUNTY_IDS[n]); log(n, r.length); rows = rows.concat(r); }
  const seen = new Set(); rows = rows.filter(r => !seen.has(r.ProjectNumber) && seen.add(r.ProjectNumber));
  await pool(rows, 8, detail); log('details done', rows.length);
  rows.forEach(r => { const pc = parseCity(r.cityLine || ''); r.city = pc.city; r.zip = pc.zip; r.st = cleanStreet(r.street || ''); });
  const geo = await censusBatch(rows.map(r => ({ id: r.ProjectNumber, street: r.st, city: r.city, zip: r.zip }))); log('census matched', Object.keys(geo).length);
  const src = {}; Object.keys(geo).forEach(k => src[k] = 'address');
  const misses = rows.filter(r => !geo[r.ProjectNumber] && r.st && r.city);
  for (const r of misses) { const c = await nominatim(`${r.st}, ${r.city}, Texas`); if (inBox(c)) { geo[r.ProjectNumber] = c; src[r.ProjectNumber] = 'address'; } }
  log('nominatim matched', misses.filter(r => geo[r.ProjectNumber]).length, 'of', misses.length);
  await pool(rows.filter(r => !geo[r.ProjectNumber] && r.st && r.city), 4, async r => { const c = await maptiler(`${r.st}, ${r.city}, TX ${r.zip}`, true); if (inBox(c)) { geo[r.ProjectNumber] = c; src[r.ProjectNumber] = 'address'; } });
  const cityCache = {};
  for (const r of rows) {
    if (geo[r.ProjectNumber] || !r.city) continue;
    if (!(r.city in cityCache)) { const pl = places.find(p => p[0].toLowerCase() === r.city.toLowerCase()); cityCache[r.city] = pl ? [pl[1], pl[2]] : await maptiler(r.city + ', Texas', false); }
    const c = cityCache[r.city]; if (!inBox(c)) continue;
    let h = 0; for (const ch of r.ProjectNumber) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    geo[r.ProjectNumber] = [c[0] + ((h % 1000) / 1000 - 0.5) * 0.03, c[1] + (((h >> 10) % 1000) / 1000 - 0.5) * 0.03]; src[r.ProjectNumber] = 'city';
  }
  const cg = Object.fromEntries(counties.map(c => [c.name, c.geom]));
  const filings = rows.filter(r => inBox(geo[r.ProjectNumber])).map(r => {
    const c = geo[r.ProjectNumber]; const sq = parseInt(String(r.sqft || '').replace(/[^\d]/g, ''), 10);
    const scope = (r.scope || '').replace(/\s+/g, ' ').trim();
    const inside = geoContains(cg[r._county], c);
    return { id: r.ProjectNumber, name: (r.ProjectName || '').replace(/\s+/g, ' ').trim(), county: r._county, city: r.city, addr: [r.street, r.cityLine].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
      type: TYPE[r.TypeOfWork] || 'Other', cost: r.EstimatedCost || 0, sqft: sq > 1 ? sq : null, owner: (r.owner || '').trim(), scope: scope.length > 260 ? scope.slice(0, 250).replace(/\s\S*$/, '') + '…' : scope,
      reg: (r.ProjectCreatedOn || '').slice(0, 10), status: STATUS[r.ProjectStatus] || '', start: (r.EstimatedStartDate || '').slice(0, 10), end: (r.EstimatedEndDate || '').slice(0, 10),
      lat: Math.round(c[1] * 1e5) / 1e5, lon: Math.round(c[0] * 1e5) / 1e5, approx: src[r.ProjectNumber] === 'city', misfiled: !inside && minVertexDist(cg[r._county], c) > 0.12 };
  });
  log('mapped', filings.length, 'of', rows.length, 'approx', filings.filter(f => f.approx).length);

  const data = {
    period: { start: startD.toISOString().slice(0, 10), end: endD.toISOString().slice(0, 10) }, built: new Date().toISOString(), total: rows.length,
    filings,
    counties: counties.map(c => ({ name: c.name, outline: round(c.geom.coordinates), label: geoCentroid(c.geom).map(v => Math.round(v * 1e3) / 1e3), dots: grid(c.geom, 0.02) })),
    ring: RING.filter(f => byFips[f]).map(f => ({ name: byFips[f].properties.NAME, outline: round(rewind(byFips[f].geometry).coordinates) })),
    texas: grid(texas, 0.1), land: grid(landGeom, 1.0), places, roads: {}
  };
  await fs.mkdir('public', { recursive: true });
  await fs.writeFile('public/data.json', JSON.stringify(data));
  for (const f of ['index.html', 'app.js', 'app.css', 'logo.png']) await fs.copyFile('src/' + f, 'public/' + f);
  log('wrote public/ (data.json', Math.round(JSON.stringify(data).length / 1024), 'KB)');
}
main().catch(e => { console.error(e); process.exit(1); });
