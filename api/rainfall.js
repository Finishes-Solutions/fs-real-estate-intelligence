// The design storm's rainfall at a site, for the detention estimate (lib/hydrology.mjs): NOAA Atlas 14's point
// precipitation-frequency estimates (the Hydrometeorological Design Studies Center's PFDS, free, keyless), the 24-hour
// depths by return period.
//   GET ?lat=..&lon=..[&rp=100] -> { rain: { p, rp, duration: '24-hr', source, depths: { 1: in, 2: in, … 1000: in } } }
// When PFDS doesn't answer, the regional Atlas 14 figure where the site is in one of lib/hydrology.mjs RAIN_REGIONS
// ({ rain, fallback: true }), else { rain: null, error }. The plan records what comes back (plan.params.storm.rain), so a
// layout run and its replay use the same numbers without asking again.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { parsePFDS, regionalRain, HYDRO } from '../lib/hydrology.mjs';

export const PFDS = 'https://hdsc.nws.noaa.gov/cgi-bin/hdsc/new/cgi_readH5.py';
const UA = { 'User-Agent': 'RealEstateIntelligence/1.0 (rainfall for site detention estimates)' };
const cache = new Map(); // (lat, lon rounded to 0.01°, about a kilometre: Atlas 14's grid is coarser)

export async function atlas14(lat, lon, { fetchImpl = fetch, ms = 12000 } = {}) {
  const key = lat.toFixed(2) + ',' + lon.toFixed(2); if (cache.has(key)) return cache.get(key);
  const url = PFDS + '?' + new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4), type: 'pf', data: 'depth', units: 'english', series: 'pds' });
  const r = await fetchImpl(url, { headers: UA, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error('NOAA PFDS ' + r.status);
  const depths = parsePFDS(await r.text()); if (!depths) throw new Error('NOAA PFDS: no estimates for this point');
  cache.set(key, depths); return depths;
}

export async function rainfallFor(lat, lon, rp = HYDRO.rp, opts = {}) {
  try { const depths = await atlas14(lat, lon, opts); const p = depths[rp]; if (!(p > 0)) throw new Error('no ' + rp + '-year estimate');
    return { rain: { p, rp, duration: '24-hr', source: 'NOAA Atlas 14 point estimate at ' + lat.toFixed(4) + ', ' + lon.toFixed(4) + ' (PFDS, partial-duration series)', depths } };
  } catch (e) { const r = regionalRain([lon, lat], rp); return r ? { rain: r, fallback: true, error: String(e.message || e) } : { rain: null, error: String(e.message || e) }; }
}

export default async function handler(req, res) {
  if (!sameOrigin(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET ?lat=&lon=' });
  if (!rateLimit(req, res, { perMinute: 20, perDay: 500 })) return;
  const q = req.query || {}, lat = +q.lat, lon = +q.lon, rp = [2, 5, 10, 25, 50, 100, 500].includes(+q.rp) ? +q.rp : HYDRO.rp;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) return res.status(400).json({ error: 'Send ?lat=&lon=' });
  const out = await rainfallFor(lat, lon, rp); if (out.rain && !out.fallback) res.setHeader('Cache-Control', 'private, max-age=2592000');
  return res.json(out);
}
