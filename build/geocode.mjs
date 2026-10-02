// Address geocoding with a persistent cache. Most precise source first, every hit validated:
//   1. census   US Census batch geocoder; Exact matches are accepted as is
//   2. txaddr   Texas 911 address points (TxGIO) for everything Census couldn't match exactly: the actual site point
//               (Census Non_Exact matches in the same zip are kept only when no address point is found)
//   3. osm      Nominatim structured search; only house-level results in the same zip / city
//   4. maptiler strict address match
//   5. census one-line, with spelling variants of highway names ("Interstate 45" -> "I-45", "Highway 6" -> "State Highway 6")
//   6. street        no source knows the house number (new subdivisions, addresses filed as "0 Main St" or just a street
//                    name): a point on that street in the filing's ZIP from MapTiler, when the street name and ZIP both
//                    agree (flagged prec 'street'). Probe 2026-10-02: Census and the Texas address points had no house
//                    for most of the misses, while MapTiler found the right street in the right ZIP for nearly all.
//   7. intersection  "A and B" / "Intersection of A and B": the junction node of the two roads in OpenStreetMap (Overpass;
//                    it often times out from cloud runners, so it is only used for junctions and has a hard timeout)
//   8. city     jittered town-center fallback (flagged approximate, not cached)
// A lookup that errored (service down, batch failed) is never cached as a miss, so it is retried on the next run.
// Address-point and Census hits are trusted (they match house number, street and zip). Weaker sources (osm, maptiler, city)
// are rejected when opts.check(row, [lon, lat]) says the point is implausible (e.g. far outside the filed county).
// Cache entries: { c: [lon, lat] | null, src, at, v }. Entries from older versions are re-geocoded.
import { fetchRetry, pool, log, sleep } from './util.mjs';

export const GEO_V = 3;
// misses recorded before MISS_V are retried once (v4: smaller Census batches, one-line variants, intersections, streets)
export const MISS_V = 5; // v5: street-level placement from MapTiler

export function cleanStreet(s) {
  s = s.split(/;|,|\s#|\s(?:Suite|Ste\.?|STE|Bldg\.?|Building|BLDG|Unit|Level|Lvl|Room|Rm\.?|Floors?|Fl\.?)\b/i)[0];
  return s.replace(/\s*&\s*\d+/, '').replace(/(\d+)\s*1\/2/, '$1').replace(/^(\d+)-\d+/, '$1').trim();
}
export function parseCity(line) { const m = line.match(/^(.*?),?\s*(?:TX|Texas)\s*(\d{5})?/i); return m ? { city: m[1].trim(), zip: m[2] || '' } : { city: '', zip: '' }; }

// ---- street parsing ----
const DIRS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'NORTH', 'SOUTH', 'EAST', 'WEST']);
const TYPES = new Set(['RD', 'ROAD', 'ST', 'STREET', 'DR', 'DRIVE', 'AVE', 'AVENUE', 'BLVD', 'LN', 'LANE', 'PKWY', 'PARKWAY', 'HWY', 'HIGHWAY', 'FWY', 'FREEWAY', 'CT', 'CIR', 'WAY', 'TRL', 'PL', 'LOOP', 'EXPY', 'SQ', 'TER', 'PLZ', 'CV', 'XING', 'RUN', 'PASS', 'BND', 'FM', 'CR', 'SH', 'US', 'IH', 'I', 'SPUR', 'RM', 'TX', 'STATE']);
// "1234 W Little York Rd" -> { num: '1234', core: 'LITTLE YORK' }; numbered highways keep their number ("FM 529" -> "529")
export function splitStreet(st) {
  const m = String(st || '').toUpperCase().replace(/[.,']/g, ' ').match(/^(\d+)[A-Z]?\s+(.+)$/); if (!m) return null;
  const toks = m[2].split(/\s+/).filter(Boolean), core = toks.filter(t => !DIRS.has(t) && !TYPES.has(t));
  if (!core.length) return null;
  return { num: m[1], core: core.slice(0, 2).join(' ') };
}
// Texas 911 address points (TxGIO StratMap): site-level points by house number + street name, same zip or city.
// (The StratMap parcel layer only answers map-click "identify" requests, so it can't be searched by address.)
const ADDR_PTS = process.env.ADDRESS_POINTS_SERVICE || 'https://feature.geographic.texas.gov/arcgis/rest/services/Address_Points/stratmap_address_points_48_most_recent/MapServer/0';
const q = s => String(s).replace(/'/g, "''");
let apDown = false;
async function addressPoint(r) {
  const s = splitStreet(r.st); if (!s || apDown) return null;
  const words = s.core.split(' ').filter(w => w.length > 1 || /\d/.test(w)).slice(0, 2); if (!words.length) return null;
  const where = [`add_number = '${q(s.num)}'`, ...words.map(w => `UPPER(st_name) LIKE '%${q(w)}%'`)];
  const area = [r.zip && `post_code = '${q(r.zip)}'`, r.city && `UPPER(post_comm) = '${q(r.city.toUpperCase())}'`].filter(Boolean);
  if (!area.length) return null; where.push('(' + area.join(' OR ') + ')');
  const p = new URLSearchParams({ where: where.join(' AND '), outFields: 'add_number', returnGeometry: 'true', outSR: '4326', resultRecordCount: '8', f: 'json' });
  try {
    const d = await (await fetchRetry(ADDR_PTS + '/query?' + p, {}, 2)).json();
    if (d.error) { if (/not supported/i.test(d.error.message || '')) { apDown = true; log('address points: service refuses queries; skipping'); } return null; }
    const cs = (d.features || []).map(x => x.geometry && [x.geometry.x, x.geometry.y]).filter(c => c && isFinite(c[0])); if (!cs.length) return null;
    // the same address can have several points (units, buildings): accept only when they sit together (~300 m)
    const c = [cs.reduce((a, b) => a + b[0], 0) / cs.length, cs.reduce((a, b) => a + b[1], 0) / cs.length];
    return cs.every(p2 => Math.hypot(p2[0] - c[0], p2[1] - c[1]) < 0.003) ? c : null;
  } catch (e) { return null; }
}

// ---- clean-up, variants, intersections, street-only ----
// highway spellings the Census street index knows them by
export function streetVariants(st) {
  const s = String(st || '').replace(/\s+/g, ' ').trim(), out = [s];
  const R = [[/\b(?:Interstate|IH|I)[\s-]*(\d+)\b/i, 'I-$1'], [/\b(?:Interstate|IH|I)[\s-]*(\d+)\b/i, 'Interstate Highway $1'],
    [/\b(?:State\s+)?(?:Highway|Hwy|SH)\s*(\d+)\b/i, 'State Highway $1'], [/\b(?:Highway|Hwy)\s*(\d+)\b/i, 'US Highway $1'], [/\bUS\s*(?:Hwy\s*)?(\d+)\b/i, 'US Highway $1'],
    [/\bFM\s*(\d+)(?:\s+(?:Road|Rd))?\b/i, 'FM $1'], [/\bFM\s*(\d+)(?:\s+(?:Road|Rd))?\b/i, 'Farm to Market Road $1'], [/\bRM\s*(\d+)\b/i, 'Ranch to Market Road $1'],
    [/\bLoop\s*(\d+)\b/i, 'State Loop $1'], [/\bSpur\s*(\d+)\b/i, 'State Spur $1'], [/\b(?:CR|County Road)\s*(\d+)\b/i, 'County Road $1'],
    [/\bFwy\b/i, 'Freeway'], [/\bPkwy\b/i, 'Parkway'], [/\bSam Houston (?:Tollway|Pkwy|Parkway)\b/i, 'Sam Houston Pkwy']];
  for (const [re, to] of R) if (re.test(s)) out.push(s.replace(re, to));
  return [...new Set(out)].slice(0, 6);
}
const STREETY = /\b(Street|St|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Avenue|Ave|Way|Parkway|Pkwy|Court|Ct|Circle|Cir|Trail|Trl|Place|Pl|Highway|Hwy|Freeway|Fwy|Loop|Expressway|Expy|Crossing|Xing|Bend|Cove|Run|Pass|FM\s*\d+|SH\s*\d+|US\s*\d+|IH?[-\s]*\d+)\b\.?/i;
const tidy = t => t.replace(/[.]+$/, '').replace(/\s+/g, ' ').trim();
// "Intersection of Spacek Rd. and Evergreen Falls Dr." / "Kingsland Blvd and Pappas Dr." / "Shepherd and 9th St." -> [a, b]
export function parseCross(raw) {
  const t = String(raw || '').replace(/^\s*(?:at\s+)?(?:the\s+)?(?:intersection|corner)\s+of\s+/i, '').replace(/\s+/g, ' ').trim();
  if (/^\d+\s+[A-Za-z]/.test(t) || /,.*,/.test(t) || /\b(from|to|between|multiple|various|throughout)\b/i.test(t)) return null;
  const m = t.match(/^([A-Za-z0-9 .'-]{3,40}?)\s+(?:and|&|at|@|\/)\s+([A-Za-z0-9 .'-]{3,40})$/i); if (!m) return null;
  const a = tidy(m[1]), b = tidy(m[2]);
  return STREETY.test(a) || STREETY.test(b) ? [a, b] : null;
}
// a street with no (or a zero) house number: "Bevis Street", "0 Mason Road", "Rustic Timbers Dr."
export function parseStreetOnly(raw) {
  const t = tidy(String(raw || '').replace(/^\s*0+\s+/, '').split(/,|;/)[0]);
  return /^[A-Za-z][A-Za-z0-9 .'-]{2,40}$/.test(t) && STREETY.test(t) && !/\b(and|&|from|to)\b/i.test(t) ? t : null;
}
// OpenStreetMap name pattern for a street ("Evergreen Falls Dr." -> "Evergreen Falls"); null for bare numbered highways
function nameRe(st) {
  const toks = String(st).toUpperCase().replace(/[.,']/g, ' ').split(/\s+/).filter(Boolean), core = toks.filter(t => !DIRS.has(t) && !TYPES.has(t));
  if (!core.length || core.every(t => /^\d+$/.test(t))) return null;
  return core.slice(0, 3).map(w => w.replace(/[^A-Z0-9]/g, '')).filter(Boolean).join('.*');
}
const OVERPASS = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
async function overpass(ql) {
  await sleep(600);
  const r = await fetchRetry(OVERPASS, { method: 'POST', body: new URLSearchParams({ data: ql }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(30000) }, 2);
  return (await r.json()).elements || [];
}
const box = (c, d) => [c[1] - d, c[0] - d * 1.15, c[1] + d, c[0] + d * 1.15].map(v => v.toFixed(4)).join(',');
const nearest = (pts, c) => pts.sort((p, q2) => Math.hypot(p[0] - c[0], p[1] - c[1]) - Math.hypot(q2[0] - c[0], q2[1] - c[1]))[0] || null;
async function crossing([a, b], center) {
  const ra = nameRe(a), rb = nameRe(b); if (!ra || !rb) return null;
  const els = await overpass(`[out:json][timeout:25];way["highway"]["name"~"${ra}",i](${box(center, .14)})->.a;way["highway"]["name"~"${rb}",i](${box(center, .14)})->.b;node(w.a)(w.b);out 20;`);
  return nearest(els.filter(e => e.lat != null).map(e => [e.lon, e.lat]), center);
}
async function streetPoint(st, center) {
  const r = nameRe(st); if (!r) return null;
  const els = await overpass(`[out:json][timeout:25];way["highway"]["name"~"^${r}",i](${box(center, .12)});out geom 60;`);
  const ways = els.filter(e => e.geometry?.length).map(e => e.geometry.map(g => [g.lon, g.lat]));
  if (!ways.length) return null;
  // the run of the street closest to town: middle vertex of the nearest way
  const w = ways.sort((x, y) => Math.min(...x.map(p => Math.hypot(p[0] - center[0], p[1] - center[1]))) - Math.min(...y.map(p => Math.hypot(p[0] - center[0], p[1] - center[1]))))[0];
  return w[Math.floor(w.length / 2)];
}
async function censusOne(r) {
  for (const v of streetVariants(r.st)) {
    const u = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?' + new URLSearchParams({ address: v + ', ' + r.city + ', TX ' + (r.zip || ''), benchmark: 'Public_AR_Current', format: 'json' });
    const d = await (await fetchRetry(u, {}, 2)).json(), m = d.result?.addressMatches?.[0];
    if (!m) continue;
    const zip = m.addressComponents?.zip; if (r.zip && zip && zip !== r.zip) continue;
    return [m.coordinates.x, m.coordinates.y];
  }
  return null;
}

// ---- 2. census ----
async function censusBatch(items, failed = new Set()) {
  const res = {};
  for (let k = 0; k < items.length; k += 250) {
    const csv = items.slice(k, k + 250).map(x => [x.id, x.street, x.city, 'TX', x.zip].map(v => '"' + String(v || '').replace(/"/g, '') + '"').join(',')).join('\n');
    const fd = new FormData(); fd.append('addressFile', new Blob([csv], { type: 'text/csv' }), 'a.csv'); fd.append('benchmark', 'Public_AR_Current');
    try {
      const t = await (await fetchRetry('https://geocoding.geo.census.gov/geocoder/locations/addressbatch', { method: 'POST', body: fd }, 3)).text();
      for (const line of t.split('\n')) {
        const c = line.match(/"([^"]*)"/g); if (!c || c.length < 6) continue; const v = c.map(x => x.slice(1, -1));
        if (v[2] !== 'Match' || !v[5]) continue;
        const [lon, lat] = v[5].split(',').map(Number), zip = (v[4].match(/(\d{5})\s*$/) || [])[1] || '';
        res[v[0]] = { c: [lon, lat], exact: v[3] === 'Exact', zip };
      }
    } catch (e) { log('census batch failed', e.message); items.slice(k, k + 250).forEach(x => failed.add(x.id)); }
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

// the street part of an address, without the house number ("12907-A Fry Rd" -> "Fry Rd", "0 Mason Road" -> "Mason Road")
export const streetName = st => String(st || '').replace(/^\s*\d+[a-z]?(?:-\w+)?\s+/i, '').trim();
const TYPE_OF = { RD: 'ROAD', ROAD: 'ROAD', ST: 'STREET', STREET: 'STREET', DR: 'DRIVE', DRIVE: 'DRIVE', AVE: 'AVENUE', AV: 'AVENUE', AVENUE: 'AVENUE', BLVD: 'BOULEVARD', BOULEVARD: 'BOULEVARD',
  LN: 'LANE', LANE: 'LANE', PKWY: 'PARKWAY', PARKWAY: 'PARKWAY', CT: 'COURT', COURT: 'COURT', CIR: 'CIRCLE', CIRCLE: 'CIRCLE', WAY: 'WAY', TRL: 'TRAIL', TRAIL: 'TRAIL',
  PL: 'PLACE', PLACE: 'PLACE', LOOP: 'LOOP', TER: 'TERRACE', TERRACE: 'TERRACE', CV: 'COVE', COVE: 'COVE', XING: 'CROSSING', CROSSING: 'CROSSING', BND: 'BEND', BEND: 'BEND', PASS: 'PASS', RUN: 'RUN' };
const streetType = st => { const t = String(st || '').toUpperCase().replace(/[.,']/g, ' ').split(/\s+/).filter(Boolean).filter(w => !DIRS.has(w)); return TYPE_OF[t[t.length - 1]] || null; };
const coreTokens = st => String(st).toUpperCase().replace(/[.,']/g, ' ').split(/\s+/).filter(t => t && !DIRS.has(t) && !TYPES.has(t));
// a MapTiler result that is the filing's street (every core word of the name) in the filing's ZIP (or town when no ZIP)
export function streetMatch(f, r, name) {
  if (!f || !Array.isArray(f.center)) return false;
  const types = [].concat(f.place_type || []); if (!types.some(t => /address|street|road/.test(t))) return false;
  const core = coreTokens(name); if (!core.length) return false;
  const text = String(f.text || '').toUpperCase().replace(/[.,']/g, ' ').split(/\s+/);
  if (!core.every(w => text.includes(w) || (/^\d+$/.test(w) && text.some(t => t.replace(/\D/g, '') === w)))) return false;
  // "Jebbia Court" is not "Jebbia Ln": when both name a street type, it has to be the same one
  const ta = streetType(name), tb = streetType(f.text); if (ta && tb && ta !== tb) return false;
  const zip = (f.context || []).find(c => /^postal_code/.test(c.id || ''))?.text || (String(f.place_name || '').match(/\b(7\d{4})\b/) || [])[1];
  if (r.zip) return zip === r.zip;
  return String(f.place_name || '').toLowerCase().includes(String(r.city || '').toLowerCase());
}
export async function maptilerStreet(key, bbox, r) {
  const name = streetName(r.street && /^\s*0*\s*[a-z]/i.test(r.street) ? r.street.split(/,|;/)[0] : r.st); if (!name || !coreTokens(name).length) return null;
  const u = 'https://api.maptiler.com/geocoding/' + encodeURIComponent(name + ', ' + r.city + ', TX ' + (r.zip || '')) + '.json?key=' + key + '&country=us&limit=3&bbox=' + bbox.join(',');
  const d = await (await fetchRetry(u, {}, 2)).json();
  const f = (d.features || []).find(x => streetMatch(x, r, name)); return f ? f.center : null;
}

const RETRY_MISS_DAYS = 60;
export const addrKey = r => (r.st + '|' + r.city + '|' + r.zip).toLowerCase().replace(/\s+/g, ' ');

// rows need st, city, zip, ProjectNumber. Returns { [ProjectNumber]: { c:[lon,lat], src:'address'|'city', via } }.
// budget (optional, shared across calls): { nominatim: max lookups left }. Addresses skipped for budget are not cached as misses.
export async function geocodeRows(rows, cache, { key, bbox, places, budget, check = () => true, addressPoints = true }) {
  const inBox = c => c && c[0] > bbox[0] && c[0] < bbox[2] && c[1] > bbox[1] && c[1] < bbox[3];
  const ok = (r, c) => inBox(c) && check(r, c), strong = (r, c) => inBox(c);
  const today = new Date(), stale = e => !e || e.v !== GEO_V || (!e.c && ((e.mv || 0) < MISS_V || !e.at || (today - new Date(e.at)) / 864e5 > RETRY_MISS_DAYS));
  const out = {}, need = new Map();
  for (const r of rows) {
    if (!r.st || !r.city) continue;
    const k = addrKey(r), e = cache[k];
    if (!stale(e)) { if (e.c && (e.src === 'txaddr' || e.src === 'census' || check(r, e.c))) out[r.ProjectNumber] = { c: e.c, src: 'address', via: e.src }; continue; }
    if (!need.has(k)) need.set(k, r);
  }
  const todo = [...need.entries()], stamp = today.toISOString().slice(0, 10), put = (k, c, src) => { cache[k] = { c, src, at: stamp, v: GEO_V, ...(c ? {} : { mv: MISS_V }) }; };
  log('geocode: cached', rows.length - todo.length, 'lookup', todo.length);
  let np = 0, nc = 0, nm = 0, mt = 0, n1 = 0, nx = 0, ns = 0; const skipped = new Set(), errored = new Set();
  const fresh = k => cache[k] && cache[k].at === stamp && cache[k].v === GEO_V && cache[k].c;
  const failedIds = new Set(), census = await censusBatch(todo.map(([k, r], i) => ({ id: String(i), street: r.st, city: r.city, zip: r.zip })), failedIds);
  todo.forEach(([k], i) => { if (failedIds.has(String(i))) errored.add(k); });
  const loose = new Map();
  todo.forEach(([k, r], i) => { const m = census[i]; if (!m || !strong(r, m.c)) return; if (m.exact) { put(k, m.c, 'census'); nc++; } else if (r.zip && m.zip === r.zip) loose.set(k, m.c); });
  if (addressPoints) await pool(todo.filter(([k]) => !fresh(k)), 6, async ([k, r]) => { const c = await addressPoint(r); if (c && strong(r, c)) { put(k, c, 'txaddr'); np++; } });
  for (const [k, c] of loose) if (!fresh(k)) { put(k, c, 'census'); nc++; }
  await pool(todo.filter(([k, r]) => !fresh(k) && /^\d*[1-9]\d*\s/.test(r.st)), 4, async ([k, r]) => {
    try { const c = await censusOne(r); if (c && strong(r, c)) { put(k, c, 'census'); n1++; errored.delete(k); } } catch (e) { errored.add(k); } });
  for (const [k, r] of todo) {
    if (fresh(k)) continue;
    if (budget && budget.nominatim <= 0) { skipped.add(k); continue; }
    if (budget) budget.nominatim--;
    const c = await nominatim(r); if (c && ok(r, c)) { put(k, c, 'osm'); nm++; }
  }
  await pool(todo.filter(([k]) => !fresh(k) && !skipped.has(k)), 4, async ([k, r]) => { const c = await maptiler(key, bbox, `${r.st}, ${r.city}, TX ${r.zip}`, true); if (c && ok(r, c)) { put(k, c, 'maptiler'); mt++; } });
  // no source knows the house: a point on the filing's street in its ZIP (street name and ZIP must both match)
  await pool(todo.filter(([k, r]) => !fresh(k) && !parseCross(r.street || r.st)), 4, async ([k, r]) => {
    try { const c = await maptilerStreet(key, bbox, r); if (c && ok(r, c)) { put(k, c, 'street'); ns++; errored.delete(k); } } catch (e) { errored.add(k); }
  });
  // "A and B": the junction of the two named roads, near the town (OpenStreetMap Overpass); a lone street name it
  // couldn't place above gets one more try on Overpass too
  const town = r => { const pl = places.find(p => p[0].toLowerCase() === (r.city || '').toLowerCase()); return pl ? [pl[1], pl[2]] : null; };
  await pool(todo.filter(([k]) => !fresh(k)), 2, async ([k, r]) => {
    const center = town(r); if (!center) return;
    const raw = r.street || r.st, cross = parseCross(raw), only = !cross && parseStreetOnly(raw);
    if (!cross && !only) return;
    try {
      const c = cross ? await crossing(cross, center) : await streetPoint(only, center);
      if (c && ok(r, c)) { put(k, c, cross ? 'intersection' : 'street'); cross ? nx++ : ns++; errored.delete(k); }
    } catch (e) { if (cross) errored.add(k); } // Overpass down: junctions are retried next run; a street it couldn't add to stays a miss
  });
  todo.forEach(([k]) => { if (!fresh(k) && !skipped.has(k) && !errored.has(k)) put(k, null, null); });
  const left = todo.filter(([k]) => !fresh(k)), sk = left.filter(([k]) => skipped.has(k)).length, er = left.filter(([k]) => errored.has(k) && !skipped.has(k)).length;
  log('geocode: census', nc, '(one-line', n1 + ')', 'address points', np, 'nominatim', nm, 'maptiler', mt, 'intersections', nx, 'streets', ns, 'missed', left.length - sk - er,
    sk ? '| nominatim budget used up, ' + sk + ' left for a later run' : '', er ? '| ' + er + ' errored, retried next run' : '');
  for (const r of rows) { if (out[r.ProjectNumber] || !r.st || !r.city) continue; const e = cache[addrKey(r)]; if (e?.c && (e.src === 'txaddr' || e.src === 'census' || check(r, e.c))) out[r.ProjectNumber] = { c: e.c, src: 'address', via: e.src }; }

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
