// Weather for the live layers and the assistant.
//   GET ?kind=wind&bbox=w,s,e,n   -> { time, points: [{ lon, lat, mph, gust, dir }] }  current 10 m wind on a grid (Open-Meteo)
//   GET ?kind=here&at=lat,lon     -> current conditions + the rest of today at one spot (Open-Meteo)
//   GET ?kind=storms              -> active Atlantic / East Pacific tropical cyclones (NOAA NHC)
//   GET ?kind=forecast&at=lat,lon -> { days: [...] } daily forecast for today and the next 6 days (Open-Meteo)
// Open-Meteo's free API is for non-commercial use; set OPEN_METEO_API_KEY to use their paid endpoint instead.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { parsePt } from './drive.js';

const om = (env = process.env) => env.OPEN_METEO_API_KEY ? 'https://customer-api.open-meteo.com/v1/forecast?apikey=' + encodeURIComponent(env.OPEN_METEO_API_KEY) + '&' : 'https://api.open-meteo.com/v1/forecast?';
const UNITS = 'wind_speed_unit=mph&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=America%2FChicago';
const WMO = { 0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'freezing fog', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain',
  66: 'freezing rain', 67: 'heavy freezing rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 80: 'rain showers', 81: 'heavy showers', 82: 'violent showers', 95: 'thunderstorms', 96: 'thunderstorms with hail', 99: 'severe thunderstorms with hail' };
export const COMPASS = d => d == null ? '' : ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(((d % 360) + 360) % 360 / 22.5) % 16];

// grid over the view, snapped so nearby views share a CDN entry; at most 8 x 6 points
export function windGrid(bbox) {
  let [w, s, e, n] = bbox; const snap = v => Math.round(v * 4) / 4;
  w = Math.max(-107, snap(w)); e = Math.min(-93, snap(e)); s = Math.max(25, snap(s)); n = Math.min(37, snap(n));
  if (e - w < .25) e = w + .25; if (n - s < .25) n = s + .25;
  if (!(e > w && n > s) || w >= -93 || s >= 37) return [];
  const nx = Math.max(2, Math.min(8, Math.round((e - w) / 0.1))), ny = Math.max(2, Math.min(6, Math.round((n - s) / 0.1))), pts = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pts.push([+(w + (e - w) * (i + .5) / nx).toFixed(3), +(s + (n - s) * (j + .5) / ny).toFixed(3)]);
  return pts;
}
async function get(u) { const r = await fetch(u, { signal: AbortSignal.timeout(9000), headers: { 'User-Agent': 'FinishesSolutions-RealEstateIntel/1.0' } }); if (!r.ok) throw new Error(new URL(u).host + ' ' + r.status); return r.json(); }

export async function wind(bbox) {
  const pts = windGrid(bbox); if (!pts.length) return { time: null, points: [] };
  const d = await get(om() + 'latitude=' + pts.map(p => p[1]).join(',') + '&longitude=' + pts.map(p => p[0]).join(',') + '&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&' + UNITS);
  const list = Array.isArray(d) ? d : [d];
  return { time: list[0]?.current?.time || null, points: list.map((x, i) => ({ lon: pts[i][0], lat: pts[i][1], mph: Math.round(x.current?.wind_speed_10m ?? NaN), gust: Math.round(x.current?.wind_gusts_10m ?? NaN), dir: x.current?.wind_direction_10m ?? null })).filter(p => isFinite(p.mph) && p.dir != null) };
}
export async function here([lat, lon]) {
  const d = await get(om() + 'latitude=' + lat + '&longitude=' + lon + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m' +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max&forecast_days=2&' + UNITS);
  const c = d.current || {}, t = d.daily || {}, day = i => ({ date: t.time?.[i], high_f: t.temperature_2m_max?.[i], low_f: t.temperature_2m_min?.[i], rain_chance_pct: t.precipitation_probability_max?.[i], rain_in: t.precipitation_sum?.[i], max_wind_mph: t.wind_speed_10m_max?.[i], max_gust_mph: t.wind_gusts_10m_max?.[i] });
  return { time: c.time, conditions: WMO[c.weather_code] || 'unknown', temp_f: c.temperature_2m, feels_like_f: c.apparent_temperature, humidity_pct: c.relative_humidity_2m, rain_in_last_hour: c.precipitation,
    wind_mph: c.wind_speed_10m, gust_mph: c.wind_gusts_10m, wind_from: COMPASS(c.wind_direction_10m), today: day(0), tomorrow: day(1) };
}
// daily rows for several spots in one call: past `past` days (model analysis) + `ahead` days of forecast
export async function daily(spots, past = 3, ahead = 7) {
  const d = await get(om() + 'latitude=' + spots.map(p => p[1]).join(',') + '&longitude=' + spots.map(p => p[0]).join(',') +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max&past_days=' + past + '&forecast_days=' + ahead + '&' + UNITS);
  return (Array.isArray(d) ? d : [d]).map(x => { const t = x.daily || {};
    return (t.time || []).map((day, i) => ({ day, conditions: WMO[t.weather_code?.[i]] || null, high_f: t.temperature_2m_max?.[i] ?? null, low_f: t.temperature_2m_min?.[i] ?? null, rain_in: t.precipitation_sum?.[i] ?? null,
      rain_chance_pct: t.precipitation_probability_max?.[i] ?? null, max_wind_mph: t.wind_speed_10m_max?.[i] ?? null, max_gust_mph: t.wind_gusts_10m_max?.[i] ?? null })); });
}
export async function storms() {
  const d = await get('https://www.nhc.noaa.gov/CurrentStorms.json');
  return { storms: (d.activeStorms || []).slice(0, 20).map(s => ({ id: s.id, name: s.name, classification: s.classification, wind_mph: s.intensity != null ? Math.round(+s.intensity * 1.15078) : null, pressure_mb: s.pressure != null ? +s.pressure : null,
    lat: +s.latitudeNumeric, lon: +s.longitudeNumeric, moving: s.movementDir != null ? COMPASS(+s.movementDir) + ' at ' + Math.round(+s.movementSpeed * 1.15078) + ' mph' : null, updated: s.lastUpdate || null,
    advisory: s.publicAdvisory?.url || null })).filter(s => isFinite(s.lat) && isFinite(s.lon)) };
}

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 60, perDay: 3000 })) return;
  const q = req.query || {};
  try {
    if (q.kind === 'wind') {
      const b = String(q.bbox || '').split(',').map(Number); if (b.length !== 4 || !b.every(isFinite)) return res.status(400).json({ error: 'bbox=w,s,e,n' });
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=900'); return res.json(await wind(b));
    }
    if (q.kind === 'here') {
      const p = parsePt(q.at); if (!p) return res.status(400).json({ error: 'at=lat,lon' });
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600'); return res.json(await here([+p[0].toFixed(3), +p[1].toFixed(3)]));
    }
    if (q.kind === 'forecast') {
      const p = parsePt(q.at); if (!p) return res.status(400).json({ error: 'at=lat,lon' });
      const [days] = await daily([[+p[1].toFixed(3), +p[0].toFixed(3)]], 0, 7);
      res.setHeader('Cache-Control', 'public, max-age=900, s-maxage=1800'); return res.json({ days });
    }
    if (q.kind === 'storms') { res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=900'); return res.json(await storms()); }
    return res.status(400).json({ error: 'kind=wind|here|forecast|storms' });
  } catch (e) { console.error('weather', e.message); return res.status(502).json({ error: 'Weather service didn’t answer. Try again shortly.' }); }
}
