// Address geocoding with a persistent cache: Census batch, then Nominatim, then MapTiler (strict),
// then a jittered town-center fallback (not cached; it is cheap and depends on the places list).
import { fetchRetry, pool, log, sleep } from './util.mjs';

export function cleanStreet(s) {
  s = s.split(/;|,|\s#|\s(?:Suite|Ste\.?|STE|Bldg\.?|Building|BLDG|Unit|Level|Lvl)\b/i)[0];
  return s.replace(/\s*&\s*\d+/, '').replace(/(\d+)\s*1\/2/, '$1').replace(/^(\d+)-\d+/, '$1').trim();
}
export function parseCity(line) { const m = line.match(/^(.*?),?\s*(?:TX|Texas)\s*(\d{5})?/i); return m ? { city: m[1].trim(), zip: m[2] || '' } : { city: '', zip: '' }; }

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
export async function maptiler(key, bbox, q, strict) {
  const u = 'https://api.maptiler.com/geocoding/' + encodeURIComponent(q) + '.json?key=' + key + '&country=us&limit=1&bbox=' + bbox.join(',');
  try { const d = await (await fetchRetry(u, {}, 2)).json(); const f = (d.features || [])[0];
    if (!f) return null; if (strict && !(f.address && (f.relevance || 0) >= 0.85)) return null; return f.center; } catch (e) { return null; }
}
async function nominatim(q) { // OpenStreetMap, max 1 request/second per usage policy
  await sleep(1100);
  try { const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' + encodeURIComponent(q), { headers: { 'User-Agent': 'FinishesSolutions-filings-map/1.0 (weekly build)' } });
    if (!r.ok) return null; const d = await r.json(); return d[0] ? [+d[0].lon, +d[0].lat] : null; } catch (e) { return null; }
}

const RETRY_MISS_DAYS = 60;
export const addrKey = r => (r.st + '|' + r.city + '|' + r.zip).toLowerCase().replace(/\s+/g, ' ');

// rows need st, city, zip, ProjectNumber. Returns { [ProjectNumber]: { c:[lon,lat], src:'address'|'city' } }.
// budget (optional, shared across calls): { nominatim: max lookups left }. Addresses skipped for budget are not cached as misses.
export async function geocodeRows(rows, cache, { key, bbox, places, budget }) {
  const inBox = c => c && c[0] > bbox[0] && c[0] < bbox[2] && c[1] > bbox[1] && c[1] < bbox[3];
  const today = new Date(), stale = at => !at || (today - new Date(at)) / 864e5 > RETRY_MISS_DAYS;
  const out = {}, need = new Map();
  for (const r of rows) {
    if (!r.st || !r.city) continue;
    const k = addrKey(r), c = cache[k];
    if (c && c.c) { out[r.ProjectNumber] = { c: c.c, src: 'address' }; continue; }
    if (c && !stale(c.at)) continue;
    if (!need.has(k)) need.set(k, r);
  }
  const todo = [...need.entries()];
  log('geocode: cached', rows.length - todo.length, 'lookup', todo.length);
  const stamp = today.toISOString().slice(0, 10);
  const census = await censusBatch(todo.map(([k, r], i) => ({ id: String(i), street: r.st, city: r.city, zip: r.zip })));
  todo.forEach(([k], i) => { if (inBox(census[i])) cache[k] = { c: census[i], at: stamp }; });
  log('census matched', Object.keys(census).length);
  let nm = 0, mt = 0; const skipped = new Set();
  for (const [k, r] of todo) {
    if (cache[k]?.c) continue;
    if (budget && budget.nominatim <= 0) { skipped.add(k); continue; }
    if (budget) budget.nominatim--;
    const c = await nominatim(`${r.st}, ${r.city}, Texas`); if (inBox(c)) { cache[k] = { c, at: stamp }; nm++; }
  }
  await pool(todo.filter(([k]) => !cache[k]?.c), 4, async ([k, r]) => { const c = await maptiler(key, bbox, `${r.st}, ${r.city}, TX ${r.zip}`, true); if (inBox(c)) { cache[k] = { c, at: stamp }; mt++; } });
  todo.forEach(([k]) => { if (!cache[k]?.c && !skipped.has(k)) cache[k] = { c: null, at: stamp }; });
  log('nominatim matched', nm, 'maptiler matched', mt, skipped.size ? '| nominatim budget used up, ' + skipped.size + ' left for a later run' : '');
  for (const r of rows) { if (out[r.ProjectNumber] || !r.st || !r.city) continue; const c = cache[addrKey(r)]; if (c?.c) out[r.ProjectNumber] = { c: c.c, src: 'address' }; }

  // town-center fallback, jittered by project number so markers don't stack
  const cityCache = {};
  for (const r of rows) {
    if (out[r.ProjectNumber] || !r.city) continue;
    if (!(r.city in cityCache)) { const pl = places.find(p => p[0].toLowerCase() === r.city.toLowerCase()); cityCache[r.city] = pl ? [pl[1], pl[2]] : await maptiler(key, bbox, r.city + ', Texas', false); }
    const c = cityCache[r.city]; if (!inBox(c)) continue;
    let h = 0; for (const ch of r.ProjectNumber) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    out[r.ProjectNumber] = { c: [c[0] + ((h % 1000) / 1000 - 0.5) * 0.03, c[1] + (((h >> 10) % 1000) / 1000 - 0.5) * 0.03], src: 'city' };
  }
  return out;
}
