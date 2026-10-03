// Live aircraft and the low-flight history (lib/planes.mjs).
//   GET ?bbox=w,s,e,n                     -> { time, source, center, nm, aircraft: [...] }   anywhere on Earth, CDN-cached ~8 s
//   GET ?route=CALLSIGN&lat=&lon=         -> { callsign, origin, destination }                adsb.lol route database, cached 1 h
//   GET ?history=lon,lat&km=1&days=30     -> { low_per_day, lowest_ft, sampled_days, ... }    from Supabase (api/planes-sample.js)
//   GET ?density=w,s,e,n&days=30          -> GeoJSON cells { sightings, per_day, min_alt }    for the "Low Flight Paths" layer
//   GET ?flight=DAL1601|N123AB              -> { current, recent, budget }   FlightAware AeroAPI (paid, hard monthly cap), cached 10-20 min
//   GET ?aeroapi=budget                   -> { month, cap, spent, calls }      this month's FlightAware spend as the cap counts it
//   GET ?reg=a1b2c3,N123AB,...            -> { registry, aircraft: { id: record | { found: false, us } } }   FAA registry (owner), up to 25
// History reads say { history: false, note } when the database isn't set up yet.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { supa } from '../lib/supa.mjs';
import { pointQuery, fetchPoint, boxAround, summarize, SAMPLES_PER_DAY, perDay } from '../lib/planes.mjs';
import { regKey, usHex, present, faaUrl } from '../lib/faa.mjs';
import { flights, budget, cleanIdent } from '../lib/aeroapi.mjs';

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

export async function route(callsign, lat, lon, fetchImpl = globalThis.fetch) {
  const r = await fetchImpl('https://api.adsb.lol/api/0/routeset', { method: 'POST', signal: AbortSignal.timeout(6000), headers: { 'Content-Type': 'application/json', 'User-Agent': 'FinishesSolutions-RealEstateIntel/1.0' },
    body: JSON.stringify({ planes: [{ callsign, lat: Number.isFinite(lat) ? lat : 0, lng: Number.isFinite(lon) ? lon : 0 }] }) });
  if (!r.ok) throw new Error('route lookup ' + r.status);
  // an unknown callsign comes back as an empty body, not JSON: that's "no route", not an error
  const t = await r.text(); let x = null; try { x = t.trim() ? JSON.parse(t)?.[0] : null; } catch (e) { x = null; }
  const ll = v => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * 1e4) / 1e4 : null; };
  let ap = (x?._airports || []).map(a => ({ code: a.iata || a.icao, name: a.name, city: a.location, country: a.countryiso2, lat: ll(a.lat), lon: ll(a.lon ?? a.lng) }));
  if (!ap.length && x?._airport_codes_iata) ap = String(x._airport_codes_iata).split('-').filter(Boolean).map(code => ({ code })); // "IAH-LHR" only
  return { callsign, origin: ap[0] || null, destination: ap[ap.length - 1] && ap.length > 1 ? ap[ap.length - 1] : null, plausible: x?.plausible ?? null };
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
    if (q.flight) {
      if (!cleanIdent(q.flight)) return res.status(400).json({ error: 'flight=CALLSIGN or N-number' });
      let out;
      try { out = await flights(q.flight, { db: db() }); }
      catch (e) {
        if (!/aeroapi_|relation|does not exist|PGRST|function/i.test(e.message)) {
          console.error('aeroapi', e.message); res.setHeader('Cache-Control', 'no-store');
          return res.status(502).json({ available: true, error: /refused the key/.test(e.message) ? 'FlightAware refused the API key.' : 'FlightAware didn’t answer. Try again shortly.' });
        }
        out = { available: false, note: 'FlightAware’s spending cap isn’t set up in the database yet (apply supabase/migrations/20261012000000_aeroapi.sql).' };
      }
      if (out.available && !out.capped && !out.busy && !out.error) out.budget = await budget(db()).catch(() => null);
      res.setHeader('Cache-Control', out.available && out.source ? 'public, max-age=120, s-maxage=300' : 'no-store'); return res.json(out);
    }
    if (q.aeroapi === 'budget') {
      const out = await budget(db()).catch(e => ({ error: /aeroapi_|function|PGRST/i.test(e.message) ? 'not set up' : e.message }));
      res.setHeader('Cache-Control', 'no-store'); return res.json({ configured: !!process.env.AEROAPI_KEY, ...out });
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
