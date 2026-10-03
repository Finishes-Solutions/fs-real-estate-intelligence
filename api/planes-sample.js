// Vercel Cron, every minute (vercel.json): one snapshot of the aircraft over the home region, the low ones
// (airborne, under 3,000 ft) counted into ~1 km cells for today in Supabase (add_air_samples). Builds the history
// behind "Low Flight Paths" and the "Air traffic" line on property cards. Vercel sends Authorization: Bearer $CRON_SECRET.
import { supa } from '../lib/supa.mjs';
import { fetchPoint, binLow } from '../lib/planes.mjs';
import { opsStep } from '../lib/airports.mjs';

// 100 nm around a point between Waller County and downtown Houston: all seven counties, IAH, Hobby, Sugar Land,
// Conroe and the approach paths. Override with PLANES_CENTER="lat,lon" and PLANES_NM.
export function center(env = process.env) {
  const [lat, lon] = String(env.PLANES_CENTER || '29.85,-95.65').split(',').map(Number);
  return { lat, lon, nm: Math.min(250, Math.max(25, Number(env.PLANES_NM) || 100)) };
}

export async function sample(env = process.env, fetchImpl = globalThis.fetch, now = new Date()) {
  const d = supa({ ...env, SUPABASE_URL: env.SUPABASE_URL || 'https://ytsxkipkobvcgysylfzc.supabase.co' });
  if (!d || d.via !== 'key') throw new Error('SUPABASE_SECRET_KEY is not set');
  const c = center(env), snap = await fetchPoint(c.lat, c.lon, c.nm, fetchImpl), rows = binLow(snap.aircraft);
  // the day in Central time, so a day's history lines up with the user's day
  const day = new Date(now.getTime() - 5 * 3600e3).toISOString().slice(0, 10);
  await d.rpc('add_air_samples', { p_day: day, p_rows: rows });
  // takeoffs and landings at the airports in range (best effort: the history above never waits on it)
  let ops = null; try { ops = await countOps(d, c, snap.aircraft, day); } catch (e) { ops = { error: e.message }; }
  return { day, source: snap.source, aircraft: snap.aircraft.length, low: rows.reduce((a, r) => a + r.n, 0), cells: rows.length, ops };
}

// the airports inside the sampling circle (cached for six hours in a warm instance)
let AIRPORTS = null, AIRPORTS_AT = 0;
async function airportsIn(d, c) {
  if (AIRPORTS && Date.now() - AIRPORTS_AT < 6 * 3600e3) return AIRPORTS;
  const dLat = c.nm / 60, dLon = dLat / Math.cos(c.lat * Math.PI / 180);
  const list = await d.rpc('airports_in_box', { w: c.lon - dLon, s: c.lat - dLat, e: c.lon + dLon, n: c.lat + dLat, p_types: ['large_airport', 'medium_airport', 'small_airport'] });
  AIRPORTS = (Array.isArray(list) ? list : []).map(a => ({ ident: a[0], lon: +a[3], lat: +a[4], elev: +a[7] || 0 })); AIRPORTS_AT = Date.now();
  return AIRPORTS;
}
export async function countOps(d, c, aircraft, day) {
  const airports = await airportsIn(d, c); if (!airports.length) return { airports: 0 };
  const candidates = aircraft.filter(x => x.hex && (x.ground || (x.alt != null && x.alt < 6000)));
  // what each of these planes was doing a minute ago, swapped for what they're doing now
  const prevList = await d.rpc('airport_ops_state_swap', { p_rows: [...new Map(opsStep(airports, candidates, new Map()).states.map(x => [x.hex, x])).values()] }); // one row per plane
  const prev = new Map((Array.isArray(prevList) ? prevList : []).map(p => [p.hex, p]));
  const { events } = opsStep(airports, candidates, prev);
  if (events.length) await d.rpc('airport_ops_add', { p_day: day, p_rows: events });
  return { airports: airports.length, tracked: candidates.length, takeoffs: events.reduce((a, e) => a + e.dep, 0), landings: events.reduce((a, e) => a + e.arr, 0) };
}

export default async function handler(req, res) {
  // With CRON_SECRET set in Vercel, cron calls carry it and nothing else gets in. Without it, accept Vercel's own cron
  // user agent so the history starts collecting anyway (set CRON_SECRET to lock it down).
  const secret = process.env.CRON_SECRET, ua = String(req.headers?.['user-agent'] || '');
  const ok = secret ? req.headers?.authorization === 'Bearer ' + secret : /^vercel-cron\//.test(ua);
  if (!ok) return res.status(401).json({ error: 'cron only' });
  if (!secret) console.warn('planes-sample: CRON_SECRET is not set; accepting the vercel-cron user agent');
  try { const out = await sample(); console.log('planes-sample', JSON.stringify(out)); return res.json(out); }
  catch (e) { console.error('planes-sample', e.message); return res.status(502).json({ error: e.message }); }
}
