// Vercel Cron, every minute (vercel.json): one snapshot of the aircraft over the home region, the low ones
// (airborne, under 3,000 ft) counted into ~1 km cells for today in Supabase (add_air_samples). Builds the history
// behind "Low Flight Paths" and the "Air traffic" line on property cards. Vercel sends Authorization: Bearer $CRON_SECRET.
import { supa } from '../lib/supa.mjs';
import { fetchPoint, binLow } from '../lib/planes.mjs';

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
  return { day, source: snap.source, aircraft: snap.aircraft.length, low: rows.reduce((a, r) => a + r.n, 0), cells: rows.length };
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
