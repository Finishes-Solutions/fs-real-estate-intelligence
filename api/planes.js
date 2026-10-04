// Live aircraft and the low-flight history (lib/planes.mjs).
//   GET ?bbox=w,s,e,n                     -> { time, source, center, nm, aircraft: [...] }   anywhere on Earth, CDN-cached ~8 s
//   GET ?route=CALLSIGN&lat=&lon=         -> { callsign, origin, destination, source }        adsb.lol, then adsbdb; checked against the plane's position
//   GET ?history=lon,lat&km=1&days=30     -> { low_per_day, lowest_ft, sampled_days, ... }    from Supabase (api/planes-sample.js)
//   GET ?density=w,s,e,n&days=30          -> GeoJSON cells { sightings, per_day, min_alt }    for the "Low Flight Paths" layer
//   GET ?track=a1b2c3                     -> { points: [[lon, lat, alt_ft, unix]], leg, today, desc, operator }   adsb.lol trace, 20 s
//   GET ?aircraft=a1b2c3&r=N123AB         -> { photo, manufacturer, model, owner, country }   planespotters / adsbdb, a day
//   GET ?airport=KIAH                     -> { airport: { name, city, lat, lon, elevation_ft } }   adsb.lol, a week
//   POST ?report=1 { geometry, months } -> air traffic report: sightings by hour of day, aircraft mix, low share, by month
//                                          for the ~5 km cells touching the area (air_profile; api/planes-sample.js)
//   GET ?reg=a1b2c3,N123AB,...            -> { registry, aircraft: { id: record | { found: false, us } } }   FAA registry (owner), up to 25
// History reads say { history: false, note } when the database isn't set up yet.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { supa } from '../lib/supa.mjs';
import { pointQuery, fetchPoint, boxAround, summarize, SAMPLES_PER_DAY, perDay } from '../lib/planes.mjs';
import { regKey, usHex, present, faaUrl } from '../lib/faa.mjs';
import { track, aircraftInfo, airport, okHex } from '../lib/adsblol.mjs';
import { vrsCodes, pickLeg } from '../lib/routes.mjs';
import { cleanGeometry } from './crime.js';

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

// FAA registration (registered owner, aircraft, dates) by Mode S hex or N-number, from aircraft_registry (build/live-sync.mjs).
// Each id maps to the record, or { found: false, us } (us: false = not a US aircraft, so the FAA has no record of it).
const REG_COLS = 'n_number,hex,serial,mfr,model,year_mfr,aircraft_type,engine_type,engine,seats,weight_class,airworthiness,registrant_type,name,street,city,state,zip,country,other_names,cert_issued,last_action,expires,status,fractional,kit';
export async function registration(ids, d = db()) {
  const list = [...new Set(ids.map(x => String(x || '').trim()).filter(Boolean))].slice(0, 25).map(id => ({ id, k: regKey(id) }));
  const miss = ({ k }) => ({ found: false, us: k ? !!(k.n || usHex(k.hex)) : null, ...(k?.n ? { faa_url: faaUrl(k.n) } : {}) });
  if (!d || d.via !== 'key') return { registry: false, note: 'The FAA registry needs SUPABASE_SECRET_KEY on the site.', aircraft: Object.fromEntries(list.map(x => [x.id, miss(x)])) };
  const hex = list.filter(x => x.k?.hex).map(x => x.k.hex), n = list.filter(x => x.k?.n).map(x => x.k.n);
  const or = [hex.length && 'hex.in.(' + hex.join(',') + ')', n.length && 'n_number.in.(' + n.join(',') + ')'].filter(Boolean).join(',');
  const rows = or ? await d.select('aircraft_registry', 'select=' + REG_COLS + '&or=(' + or + ')') : [];
  const byHex = new Map(rows.filter(r => r.hex).map(r => [r.hex, r])), byN = new Map(rows.map(r => [r.n_number, r]));
  return { registry: true, aircraft: Object.fromEntries(list.map(x => { const r = x.k?.hex ? byHex.get(x.k.hex) : x.k?.n ? byN.get(x.k.n) : null; return [x.id, r ? { found: true, ...present(r) } : miss(x)]; })) };
}

const MI = (a, b) => { const R = Math.PI / 180, h = Math.sin((b[1] - a[1]) * R / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin((b[0] - a[0]) * R / 2) ** 2; return 7917.6 * Math.asin(Math.sqrt(h)); };
// Route databases go stale when airlines reuse flight numbers. A route is believable when the plane is roughly on the
// way between its two airports (detour under 25% plus 100 mi) or within 60 mi of either end (taking off, landing).
// With the plane's track: away from both airports it must also be heading roughly toward the destination (within
// 100°). SWA3004 was listed MSY → MDW while flying 217° over Missouri: on the way, by distance, but going the other way.
const BRG = (a, b) => { const R = Math.PI / 180, y = Math.sin((b[0] - a[0]) * R) * Math.cos(b[1] * R), x = Math.cos(a[1] * R) * Math.sin(b[1] * R) - Math.sin(a[1] * R) * Math.cos(b[1] * R) * Math.cos((b[0] - a[0]) * R); return (Math.atan2(y, x) / R + 360) % 360; };
export function plausible(o, d, lat, lon, track) {
  if (![o?.lat, o?.lon, d?.lat, d?.lon].every(Number.isFinite) || !Number.isFinite(lat) || !Number.isFinite(lon) || (!lat && !lon)) return null;
  const p = [lon, lat], A = [o.lon, o.lat], B = [d.lon, d.lat];
  if (MI(p, A) < 60 || MI(p, B) < 60) return true;
  if (MI(p, A) + MI(p, B) > MI(A, B) * 1.25 + 100) return false;
  if (Number.isFinite(track) && MI(p, B) > 80) { const off = Math.abs(((track - BRG(p, B)) + 540) % 360 - 180); if (off > 100) return false; }
  return true;
}

const H = { 'Content-Type': 'application/json', 'User-Agent': 'FinishesSolutions-RealEstateIntel/1.0' };
const ll = v => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * 1e4) / 1e4 : null; };
// adsb.lol's route set (it has answered with an empty body for every flight since about October 2026; kept last in case it returns)
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

const within = (ms, job) => Promise.race([job, new Promise((_, no) => setTimeout(() => no(new Error('timed out')), ms))]);
// airports by ICAO code: the airports table (OurAirports, loaded nightly), else adsb.lol's airport API; cached a day
const APS = new Map();
async function airportsFor(codes, d, fetchImpl) {
  const want = [...new Set(codes)].filter(c => /^[A-Z0-9]{3,4}$/.test(c) && !(APS.has(c) && Date.now() - APS.get(c).t < 864e5));
  const row = a => ({ code: a.iata || a.icao || a.ident, icao: a.icao || a.ident, name: a.name, city: a.municipality ?? a.city ?? null, country: a.iso_country ?? a.country ?? null, lat: ll(a.lat), lon: ll(a.lon) });
  if (want.length && d) {
    try {
      const list = want.join(','), rows = await within(4000, d.select('airports', 'select=ident,icao,iata,name,municipality,iso_country,lat,lon&or=(icao.in.(' + list + '),ident.in.(' + list + '))'));
      for (const a of rows || []) for (const k of [a.icao, a.ident]) if (k && want.includes(k)) APS.set(k, { t: Date.now(), a: row(a) });
    } catch (e) { console.warn('planes route airports', e.message); }
  }
  for (const c of want.filter(c => !APS.has(c))) { try { const a = await airport(c, fetchImpl); if (a) APS.set(c, { t: Date.now(), a: row({ ...a, ident: c }) }); } catch (e) {} }
  if (APS.size > 3000) APS.delete(APS.keys().next().value);
  return codes.map(c => APS.get(c)?.a || null);
}
// VRS standing data: every stop of the flight number; the leg that fits the plane
async function vrsRoute(callsign, lat, lon, track, vs, d, fetchImpl) {
  const codes = await vrsCodes(callsign, fetchImpl); if (!codes) return null;
  const aps = await airportsFor(codes, d, fetchImpl);
  const leg = codes.length > 2 ? pickLeg(aps, lat, lon, track, vs) : aps[0] && aps[1] ? { i: 0, origin: aps[0], destination: aps[1] } : null;
  if (!leg?.origin || !leg?.destination) return null;
  return { origin: leg.origin, destination: leg.destination, source: 'vrs', stops: codes.length > 2 ? aps.map((a, i) => a?.code || codes[i]) : undefined };
}

// first route that fits the plane: VRS standing data (multi-stop, leg picked), adsbdb, adsb.lol's route set
export async function route(callsign, lat, lon, fetchImpl = globalThis.fetch, track = NaN, vs = NaN, d = db()) {
  const out = { callsign, origin: null, destination: null, plausible: null };
  const looks = [() => vrsRoute(callsign, lat, lon, track, vs, d, fetchImpl), () => dbRoute(callsign, fetchImpl), () => lolRoute(callsign, lat, lon, fetchImpl)];
  for (const look of looks) {
    let x = null; try { x = await look(); } catch (e) { console.warn('planes route', callsign, e.message); }
    if (!x) continue;
    const ok = plausible(x.origin, x.destination, lat, lon, track);
    if (ok === false) { out.rejected = (out.rejected || []).concat(x.source + ' ' + x.origin.code + '-' + x.destination.code); continue; } // stale: the plane is nowhere near that route
    return { ...out, ...x, plausible: ok };
  }
  return out;
}

export default async function handler(req, res) {
  const q = req.query || {};
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 60, perDay: 8000 })) return;
  try {
    if (q.report) {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST { geometry, months }' });
      const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}, g = cleanGeometry(b.geometry);
      if (!g) return res.status(400).json({ error: 'Send a Polygon or MultiPolygon geometry.' });
      const d = db(); if (!d || d.via !== 'key') return res.json({ history: false, note: 'The air traffic history isn’t set up on this deployment.' });
      const r = await d.rpc('air_profile_report', { p_geom: g, p_months: Math.min(13, Math.max(1, +b.months || 3)) });
      res.setHeader('Cache-Control', 'no-store'); return res.json({ history: true, ...r });
    }
    if (q.route) {
      const cs = String(q.route).trim().toUpperCase(); if (!/^[A-Z0-9]{2,8}$/.test(cs)) return res.status(400).json({ error: 'route=CALLSIGN' });
      res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600');
      return res.json(await route(cs, num(q.lat), num(q.lon), undefined, num(q.track), num(q.vs)));
    }
    if (q.track) {
      const hex = String(q.track).trim().toLowerCase().replace(/^~/, ''); if (!okHex(hex)) return res.status(400).json({ error: 'track=ICAO hex' });
      const out = await track(hex);
      res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=20, stale-while-revalidate=60'); return res.json(out);
    }
    if (q.aircraft) {
      const hex = String(q.aircraft).trim().toLowerCase().replace(/^~/, ''); if (!okHex(hex)) return res.status(400).json({ error: 'aircraft=ICAO hex' });
      const reg = /^[A-Z0-9-]{2,10}$/i.test(String(q.r || '')) ? String(q.r).toUpperCase() : null;
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400'); return res.json(await aircraftInfo(hex, reg));
    }
    if (q.airport) {
      const icao = String(q.airport).trim().toUpperCase(); if (!/^[A-Z0-9]{3,4}$/.test(icao)) return res.status(400).json({ error: 'airport=ICAO code' });
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800'); return res.json({ airport: await airport(icao) });
    }
    if (q.reg) {
      const ids = String(q.reg).split(',').filter(x => x.trim()); if (!ids.length || ids.length > 25) return res.status(400).json({ error: 'reg=hex or N-number, up to 25, comma-separated' });
      let out;
      try { out = await registration(ids); }
      catch (e) { if (!/aircraft_registry|relation|does not exist|PGRST/i.test(e.message)) throw e; out = { ...(await registration(ids, null)), note: 'The FAA registry isn’t loaded yet (apply supabase/migrations/20261011000000_aircraft_registry.sql, then run the Live data workflow).' }; }
      // the FAA publishes once a day
      res.setHeader('Cache-Control', out.registry ? 'public, max-age=3600, s-maxage=43200' : 'no-store'); return res.json(out);
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
