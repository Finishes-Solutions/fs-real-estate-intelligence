// Airports anywhere in the world (Supabase tables loaded nightly from OurAirports; see build/live-sync.mjs "airports").
//   GET ?box=w,s,e,n[&types=large,medium,small,heliport,seaplane]   the map layer: [[ident, name, type, lon, lat, code, scheduled, elev]]
//   GET ?near=lat,lon[&km=40&n=6&path=1]   nearest airports; path=1 also checks whether the point is under a runway's
//                                          approach / departure path (the closest 3 airports with runways)
//   GET ?id=KIAH (ident, ICAO or IATA)    one airport: runways, frequencies, FAA diagram, takeoffs and landings per day
//                                          (our ADS-B counts), the weather now (METAR), a photo, the airlines that fly there
//                                          and statistics tables (Wikipedia)
//   GET ?osm=KIAH                          the airport's layout from OpenStreetMap (runways, taxiways, aprons, terminals,
//                                          hangars, gates) as GeoJSON
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { supa } from '../lib/supa.mjs';
import { parseAirlines, parseTables, cleanWiki, underPath } from '../lib/airports.mjs';

const UA = { 'User-Agent': 'FinishesSolutions-RealEstateIntel/1.0 (airport cards; contact via finishessolutions.com)' };
const db = (env = process.env) => supa({ ...env, SUPABASE_URL: env.SUPABASE_URL || 'https://ytsxkipkobvcgysylfzc.supabase.co' });
const TYPES = { large: 'large_airport', medium: 'medium_airport', small: 'small_airport', heliport: 'heliport', seaplane: 'seaplane_base', balloon: 'balloonport' };
const getJson = async (u, opts = {}, ms = 10000, fetchImpl = fetch) => { const r = await fetchImpl(u, { ...opts, headers: { ...UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(new URL(u).host + ' ' + r.status); return r.json(); };

// ---------- Wikipedia / Wikidata: photo, airlines, statistics ----------
const WIKI = new Map(); // warm-instance cache: title -> { at, data }
export async function wikiFacts(a, fetchImpl = fetch) {
  let title = decodeURIComponent(String(a.wikipedia_link || '').split('/wiki/')[1] || '').replace(/_/g, ' '), image = null, lang = (String(a.wikipedia_link || '').match(/\/\/(\w+)\.wikipedia/) || [])[1] || 'en';
  const hit = WIKI.get(a.ident); if (hit && Date.now() - hit.at < 864e5) return hit.data;
  // Wikidata by ICAO / IATA code: the photo (P18) and, when OurAirports has no link, the English article
  const code = a.icao || (a.gps_code && /^[A-Z]{4}$/.test(a.gps_code) ? a.gps_code : null);
  if (code || a.iata) {
    try {
      const q = 'SELECT ?img ?article WHERE { ' + (code ? '?a wdt:P239 "' + code + '".' : '?a wdt:P238 "' + a.iata + '".') + ' OPTIONAL { ?a wdt:P18 ?img } OPTIONAL { ?article schema:about ?a; schema:isPartOf <https://en.wikipedia.org/> } } LIMIT 1';
      const d = await getJson('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { Accept: 'application/sparql-results+json' } }, 8000, fetchImpl);
      const b = d.results?.bindings?.[0];
      if (b?.img?.value) image = { url: b.img.value.replace(/^http:/, 'https:') + '?width=960', file: decodeURIComponent(b.img.value.split('/').pop()), credit: 'Wikimedia Commons' };
      if (!title && b?.article?.value) { title = decodeURIComponent(b.article.value.split('/wiki/')[1]).replace(/_/g, ' '); lang = 'en'; }
    } catch (e) { /* optional */ }
  }
  const out = { title: title || null, url: title ? 'https://' + lang + '.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_')) : null, image, summary: null, airlines: [], cargo: [], tables: [] };
  if (title) {
    const api = 'https://' + lang + '.wikipedia.org/w/api.php?format=json&redirects=1&action=parse&page=' + encodeURIComponent(title); // links often name a redirect
    const [sum, secs] = await Promise.all([
      getJson('https://' + lang + '.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_')), {}, 8000, fetchImpl).catch(() => null),
      getJson(api + '&prop=sections', {}, 8000, fetchImpl).catch(() => null)]);
    if (sum) { out.summary = sum.extract || null; const img = sum.originalimage?.source || sum.thumbnail?.source; if (!out.image && img && !/\.svg/i.test(img) && !/logo/i.test(img)) out.image = { url: img, credit: 'Wikipedia' }; }
    const list = secs?.parse?.sections || [], sec = re => list.find(s => re.test(cleanWiki(s.line)));
    const wt = async s => s ? (await getJson(api + '&prop=wikitext&section=' + s.index, {}, 8000, fetchImpl).catch(() => null))?.parse?.wikitext?.['*'] || '' : '';
    const pax = sec(/^Passenger/i) || sec(/^Airlines and destinations$/i), cargo = sec(/^Cargo$/i), stats = sec(/^(Statistics|Traffic and statistics|Traffic statistics)$/i);
    const [pw, cw, sw] = await Promise.all([wt(pax), cargo && cargo !== pax ? wt(cargo) : '', wt(stats)]);
    out.airlines = parseAirlines(pw).slice(0, 60); if (pw && !out.airlines.length) out.airlines_unparsed = { section: pax?.line, start: pw.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '').slice(0, 400) }; // a layout the parser doesn't know yet
    out.cargo = parseAirlines(cw).slice(0, 30); out.tables = parseTables(sw).slice(0, 5);
  }
  WIKI.set(a.ident, { at: Date.now(), data: out }); if (WIKI.size > 300) WIKI.delete(WIKI.keys().next().value);
  return out;
}
// the weather now and the forecast at the airport (aviationweather.gov; only airports with a reporting station)
export async function metar(code, fetchImpl = fetch) {
  if (!code || !/^[A-Z0-9]{3,4}$/.test(code)) return null;
  const [m, t] = await Promise.all([getJson('https://aviationweather.gov/api/data/metar?format=json&ids=' + code, {}, 8000, fetchImpl).catch(() => []), getJson('https://aviationweather.gov/api/data/taf?format=json&ids=' + code, {}, 8000, fetchImpl).catch(() => [])]);
  const x = Array.isArray(m) ? m[0] : null; if (!x) return null;
  return { raw: x.rawOb, time: x.reportTime, temp_f: x.temp != null ? Math.round(x.temp * 9 / 5 + 32) : null, wind_dir: x.wdir, wind_kt: x.wspd, gust_kt: x.wgst ?? null, visibility: x.visib, category: x.fltCat,
    clouds: (x.clouds || []).map(c => c.cover + (c.base ? ' ' + c.base + ' ft' : '')).join(', '), taf: Array.isArray(t) && t[0] ? t[0].rawTAF : null };
}
// the airport's layout from OpenStreetMap
export async function osmLayout(a, runways, fetchImpl = fetch) {
  const pts = [[a.lon, a.lat], ...runways.flatMap(r => [[r.le_lon, r.le_lat], [r.he_lon, r.he_lat]]).filter(p => p[0] != null)];
  const pad = runways.length ? 0.012 : 0.02, w = Math.min(...pts.map(p => p[0])) - pad, e = Math.max(...pts.map(p => p[0])) + pad, s = Math.min(...pts.map(p => p[1])) - pad, n = Math.max(...pts.map(p => p[1])) + pad;
  const q = '[out:json][timeout:40];(way["aeroway"~"^(runway|taxiway|apron|terminal|hangar|helipad|gate|parking_position|aerodrome)$"](' + [s, w, n, e].map(v => v.toFixed(4)).join(',') + ');relation["aeroway"~"^(terminal|apron|aerodrome)$"](' + [s, w, n, e].map(v => v.toFixed(4)).join(',') + '););out tags geom;';
  const d = await getJson('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }, 45000, fetchImpl);
  const features = [];
  for (const el of d.elements || []) {
    const t = el.tags || {}, kind = t.aeroway; if (!kind) continue;
    const ring = g => (g || []).map(p => [+p.lon.toFixed(6), +p.lat.toFixed(6)]);
    let geometry = null;
    if (el.type === 'way' && el.geometry?.length) { const c = ring(el.geometry), closed = c.length > 3 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1];
      geometry = closed && !['runway', 'taxiway'].includes(kind) ? { type: 'Polygon', coordinates: [c] } : c.length === 1 ? { type: 'Point', coordinates: c[0] } : { type: 'LineString', coordinates: c }; }
    else if (el.type === 'relation') { const outer = (el.members || []).filter(m => m.role === 'outer' && m.geometry?.length).map(m => ring(m.geometry)); if (outer.length) geometry = { type: 'MultiPolygon', coordinates: outer.map(r => [r]) }; }
    if (!geometry || kind === 'aerodrome' && geometry.type === 'LineString') continue;
    features.push({ type: 'Feature', properties: { kind, ref: t.ref || '', name: t.name || '', surface: t.surface || '', width: +t.width || null }, geometry });
  }
  return { type: 'FeatureCollection', features, attribution: '© OpenStreetMap contributors (ODbL)' };
}

export async function detail(id, d = db(), fetchImpl = fetch) {
  const x = await d.rpc('airport_detail', { p_ident: String(id).toUpperCase().slice(0, 12) }); if (!x) return null;
  const a = x.airport, code = a.icao || (a.gps_code && /^[A-Z]{4}$/.test(a.gps_code) ? a.gps_code : null) || (a.iso_country === 'US' && a.local_code ? 'K' + a.local_code : null);
  const [wiki, wx] = await Promise.all([wikiFacts(a, fetchImpl).catch(e => ({ error: e.message })), metar(code, fetchImpl).catch(() => null)]);
  return { ...x, wiki, metar: wx };
}

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 60, perDay: 3000 })) return;
  const q = req.query || {}, d = db();
  if (!d || d.via !== 'key') return res.status(503).json({ error: 'Airport data isn’t configured here (SUPABASE_SECRET_KEY).' });
  try {
    if (q.box) {
      const b = String(q.box).split(',').map(Number);
      if (b.length !== 4 || !b.every(Number.isFinite) || b[0] >= b[2] || b[1] >= b[3] || (b[2] - b[0]) * (b[3] - b[1]) > 2500) return res.status(400).json({ error: 'box=w,s,e,n (up to 50° by 50°)' });
      const types = String(q.types || '').split(',').map(t => TYPES[t]).filter(Boolean);
      const list = await d.rpc('airports_in_box', { w: b[0], s: b[1], e: b[2], n: b[3], p_types: types.length ? types : null });
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400'); return res.json({ airports: list });
    }
    if (q.near) {
      const [lat, lon] = String(q.near).split(',').map(Number); if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: 'near=lat,lon' });
      const km = Math.min(300, Math.max(1, +q.km || 40)), n = Math.min(20, Math.max(1, +q.n || 6));
      const list = await d.rpc('airports_near', { p_lon: lon, p_lat: lat, p_km: km, p_n: n, p_types: ['large_airport', 'medium_airport', 'small_airport'] });
      let path = null;
      if (q.path && Array.isArray(list) && list.length) {
        const ids = list.slice(0, 3).map(a => a.ident), rw = await d.select('airport_runways', 'select=*&airport_ident=in.(' + ids.map(encodeURIComponent).join(',') + ')');
        for (const a of list.slice(0, 3)) { const p = underPath([lon, lat], rw.filter(r => r.airport_ident === a.ident)); if (p) { path = { airport: a.ident, name: a.name, code: a.iata || a.icao || a.ident, ...p }; break; } }
      }
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=604800'); return res.json({ airports: list, path });
    }
    if (q.osm) {
      const x = await d.rpc('airport_detail', { p_ident: String(q.osm).toUpperCase().slice(0, 12) }); if (!x) return res.status(404).json({ error: 'No such airport.' });
      const out = await osmLayout(x.airport, x.runways || []);
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000'); return res.json(out);
    }
    if (q.id) {
      const x = await detail(q.id, d); if (!x) return res.status(404).json({ error: 'No airport matches “' + String(q.id).slice(0, 12) + '”.' });
      res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=1800'); return res.json(x);
    }
    return res.status(400).json({ error: 'Use box, near, id or osm.' });
  } catch (e) { console.error('airports', e.message); res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ error: 'Airport lookup failed: ' + e.message }); }
}
