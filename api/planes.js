// Live aircraft and the low-flight history (lib/planes.mjs).
//   GET ?bbox=w,s,e,n                     -> { time, source, center, nm, aircraft: [...] }   anywhere on Earth, CDN-cached ~8 s
//   GET ?route=CALLSIGN&lat=&lon=         -> { callsign, origin, destination, source }        adsb.lol, then adsbdb; checked against the plane's position
//   GET ?history=lon,lat&km=1&days=30     -> { low_per_day, lowest_ft, sampled_days, ... }    from Supabase (api/planes-sample.js)
//   GET ?density=w,s,e,n&days=30          -> GeoJSON cells { sightings, per_day, min_alt }    for the "Low Flight Paths" layer
// History reads say { history: false, note } when the database isn't set up yet.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { supa } from '../lib/supa.mjs';
import { pointQuery, fetchPoint, boxAround, summarize, SAMPLES_PER_DAY, perDay } from '../lib/planes.mjs';

const LAST = new Map(); // area -> last good aircraft snapshot in this warm instance
const num = v => (v === '' || v == null ? NaN : Number(v));
const box = s => { const b = String(s || '').split(',').map(num); return b.length === 4 && b.every(Number.isFinite) && b[0] < b[2] && b[1] < b[3] && Math.abs(b[1]) <= 90 && Math.abs(b[3]) <= 90 ? b : null; };
const db = (env = process.env) => supa({ ...env, SUPABASE_URL: env.SUPABASE_URL || 'https://ytsxkipkobvcgysylfzc.supabase.co' });
const sinceDay = days => new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);

export async function history(lon, lat, km = 1, days = 30, d = db()) {
  if (!d || d.via !== 'key') return { history: false, note: 'Flight history needs SUPABASE_SECRET_KEY on the site.' };
  const [w, s, e, n] = boxAround(lon, lat, km), since = sinceDay(days);
  const [cells, sampled] = await Promise.all([d.rpc('air_density', { w, s, e, n, since }), d.select('air_days', 'select=samples&day=gte.' + since)]);
  const samples = (sampled || []).reduce((a, r) => a + (r.samples || 0), 0);
  return { history: true, km, ...summarize((cells || []).map(c => ({ n: +c.sightings, min_alt: c.min_alt })), samples, days) };
}

export async function density(b, days = 30, d = db()) {
  if (!d || d.via !== 'key') return { history: false, note: 'Flight history needs SUPABASE_SECRET_KEY on the site.' };
  const [w, s, e, n] = b, since = sinceDay(days);
  const [cells, sampled] = await Promise.all([d.rpc('air_density', { w, s, e, n, since }), d.select('air_days', 'select=samples&day=gte.' + since)]);
  const samples = (sampled || []).reduce((a, r) => a + (r.samples || 0), 0);
  return { history: true, days, sampled_days: Math.round(samples / SAMPLES_PER_DAY * 10) / 10, type: 'FeatureCollection', features: (cells || []).map(c => {
    const x = +c.lon, y = +c.lat;
    return { type: 'Feature', properties: { sightings: +c.sightings, per_day: perDay(+c.sightings, samples) ?? 0, min_alt: c.min_alt },
      geometry: { type: 'Polygon', coordinates: [[[x, y], [x + .01, y], [x + .01, y + .01], [x, y + .01], [x, y]]] } };
  }) };
}

const MI = (a, b) => { const R = Math.PI / 180, h = Math.sin((b[1] - a[1]) * R / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin((b[0] - a[0]) * R / 2) ** 2; return 7917.6 * Math.asin(Math.sqrt(h)); };
// Route databases go stale when airlines reuse flight numbers. A route is believable when the plane is roughly on the
// way between its two airports (detour under 25% plus 100 mi) or within 60 mi of either end (taking off, landing).
export function plausible(o, d, lat, lon) {
  if (![o?.lat, o?.lon, d?.lat, d?.lon].every(Number.isFinite) || !Number.isFinite(lat) || !Number.isFinite(lon) || (!lat && !lon)) return null;
  const p = [lon, lat], A = [o.lon, o.lat], B = [d.lon, d.lat];
  return MI(p, A) < 60 || MI(p, B) < 60 || MI(p, A) + MI(p, B) <= MI(A, B) * 1.25 + 100;
}

const H = { 'Content-Type': 'application/json', 'User-Agent': 'FinishesSolutions-RealEstateIntel/1.0' };
const ll = v => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * 1e4) / 1e4 : null; };
// adsb.lol's route set (it has answered with an empty body for every flight since about October 2026)
async function lolRoute(callsign, lat, lon, fetchImpl) {
  const r = await fetchImpl('https://api.adsb.lol/api/0/routeset', { method: 'POST', signal: AbortSignal.timeout(6000), headers: H,
    body: JSON.stringify({ planes: [{ callsign, lat: Number.isFinite(lat) ? lat : 0, lng: Number.isFinite(lon) ? lon : 0 }] }) });
  if (!r.ok) throw new Error('route lookup ' + r.status);
  // an unknown callsign comes back as an empty body, not JSON: that's "no route", not an error
  const t = await r.text(); let x = null; try { x = t.trim() ? JSON.parse(t)?.[0] : null; } catch (e) { x = null; }
  let ap = (x?._airports || []).map(a => ({ code: a.iata || a.icao, name: a.name, city: a.location, country: a.countryiso2, lat: ll(a.lat), lon: ll(a.lon ?? a.lng) }));
  if (!ap.length && x?._airport_codes_iata) ap = String(x._airport_codes_iata).split('-').filter(Boolean).map(code => ({ code })); // "IAH-LHR" only
  return ap.length > 1 ? { origin: ap[0], destination: ap[ap.length - 1], source: 'adsb.lol' } : null;
}
// adsbdb.com (free, no key): the community callsign → route database
async function dbRoute(callsign, fetchImpl) {
  const r = await fetchImpl('https://api.adsbdb.com/v0/callsign/' + encodeURIComponent(callsign), { signal: AbortSignal.timeout(6000), headers: H });
  if (r.status === 404) return null; if (!r.ok) throw new Error('adsbdb ' + r.status);
  const f = (await r.json())?.response?.flightroute; if (!f?.origin || !f?.destination) return null;
  const ap = a => ({ code: a.iata_code || a.icao_code, name: a.name, city: a.municipality, country: a.country_iso_name, lat: ll(a.latitude), lon: ll(a.longitude) });
  return { origin: ap(f.origin), destination: ap(f.destination), source: 'adsbdb' };
}

export async function route(callsign, lat, lon, fetchImpl = globalThis.fetch) {
  const out = { callsign, origin: null, destination: null, plausible: null };
  for (const look of [() => lolRoute(callsign, lat, lon, fetchImpl), () => dbRoute(callsign, fetchImpl)]) {
    let x = null; try { x = await look(); } catch (e) { console.warn('planes route', callsign, e.message); }
    if (!x) continue;
    const ok = plausible(x.origin, x.destination, lat, lon);
    if (ok === false) { out.rejected = (out.rejected || []).concat(x.source + ' ' + x.origin.code + '-' + x.destination.code); continue; } // stale: the plane is nowhere near that route
    return { ...out, ...x, plausible: ok };
  }
  return out;
}

export default async function handler(req, res) {
  const q = req.query || {};
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 60, perDay: 8000 })) return;
  try {
    if (q.route) {
      const cs = String(q.route).trim().toUpperCase(); if (!/^[A-Z0-9]{2,8}$/.test(cs)) return res.status(400).json({ error: 'route=CALLSIGN' });
      res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600');
      return res.json(await route(cs, num(q.lat), num(q.lon)));
    }
    if (q.history) {
      const [lon, lat] = String(q.history).split(',').map(num); if (!Number.isFinite(lon) || !Number.isFinite(lat)) return res.status(400).json({ error: 'history=lon,lat' });
      const out = await history(lon, lat, Math.min(5, Math.max(0.25, num(q.km) || 1)), Math.min(365, Math.max(1, num(q.days) || 30)));
      res.setHeader('Cache-Control', out.history ? 'public, max-age=600, s-maxage=3600' : 'no-store'); return res.json(out);
    }
    if (q.density) {
      const b = box(q.density); if (!b || (b[2] - b[0]) * (b[3] - b[1]) > 16) return res.status(400).json({ error: 'density=w,s,e,n (up to about 4° by 4°)' });
      const out = await density(b.map(v => +v.toFixed(2)), Math.min(365, Math.max(1, num(q.days) || 30)));
      res.setHeader('Cache-Control', out.history ? 'public, max-age=600, s-maxage=3600' : 'no-store'); return res.json(out);
    }
    const b = box(q.bbox); if (!b) return res.status(400).json({ error: 'bbox=w,s,e,n' });
    const p = pointQuery(b), key = p.lat + ',' + p.lon + ',' + p.nm;
    let out;
    try { out = await fetchPoint(p.lat, p.lon, p.nm); LAST.set(key, { t: Date.now(), out }); if (LAST.size > 200) LAST.delete(LAST.keys().next().value); }
    catch (e) {
      // every feed busy or refusing: the last snapshot this instance got for the same area, up to 2 minutes old (the map
      // moves each plane along its track from there), rather than an empty sky
      const last = LAST.get(key); if (!last || Date.now() - last.t > 120e3) throw e;
      console.warn('planes: feeds failed (' + e.message + '), serving a ' + Math.round((Date.now() - last.t) / 1000) + ' s old snapshot');
      res.setHeader('Cache-Control', 'public, max-age=5, s-maxage=5');
      return res.json({ ...last.out, stale: true, center: [p.lon, p.lat], nm: p.nm });
    }
    res.setHeader('Cache-Control', 'public, max-age=5, s-maxage=8, stale-while-revalidate=30');
    return res.json({ ...out, center: [p.lon, p.lat], nm: p.nm });
  } catch (e) {
    console.error('planes', e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: /air_|function|relation|does not exist|PGRST/i.test(e.message) ? 'Flight history isn’t set up in the database yet (apply supabase/migrations/20261008000000_air_traffic.sql).' : 'The aircraft feed didn’t answer. Try again in a few seconds.' });
  }
}
