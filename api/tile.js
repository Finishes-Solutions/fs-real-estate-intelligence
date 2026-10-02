// Same-origin raster tile proxy for the live layers. Keeps the TomTom key server-side, sidesteps CORS on the NOAA
// services, and lets the CDN share each tile for a few minutes (the browser adds a time bucket `t` to the URL).
//   GET ?l=radar|lightning|clouds|storms|traffic&z=&x=&y=   -> 256px PNG
//   GET (no params)                                        -> { traffic: bool }  (is a TomTom key configured)
// Sources: NOAA nowCOAST WMS (radar, lightning, GOES infrared), NOAA NHC tropical MapServer (cones, tracks), TomTom flow.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';

const NOW = 'https://nowcoast.noaa.gov/geoserver/observations/';
const WMS = { // service / layer / style, from the nowCOAST capabilities
  radar: ['weather_radar', 'conus_base_reflectivity_mosaic', 'weather_radar_base_reflectivity', 10, 240],
  lightning: ['lightning_detection', 'ldn_lightning_strike_density', 'lightning_density', 9, 600],
  clouds: ['satellite', 'goes_longwave_imagery', 'goes-lir', 9, 600]
};
const MAXZ = { ...Object.fromEntries(Object.entries(WMS).map(([k, v]) => [k, v[3]])), storms: 10, traffic: 18 };
const TTL = { ...Object.fromEntries(Object.entries(WMS).map(([k, v]) => [k, v[4]])), storms: 900, traffic: 120 };
const HALF = 20037508.342789244;

export function bbox3857(z, x, y) { const s = 2 * HALF / 2 ** z; return [-HALF + x * s, HALF - (y + 1) * s, -HALF + (x + 1) * s, HALF - y * s]; }
// tile -> lon/lat bounds, to keep the proxy to Texas and its neighbours
export function tileLonLat(z, x, y) {
  const n = 2 ** z, lon = v => v / n * 360 - 180, lat = v => Math.atan(Math.sinh(Math.PI * (1 - 2 * v / n))) * 180 / Math.PI;
  return [lon(x), lat(y + 1), lon(x + 1), lat(y)];
}
const REGION = [-108, 24, -92, 38];
export function upstream(l, z, x, y, env = process.env) {
  if (WMS[l]) { const [svc, layer, style] = WMS[l];
    return NOW + svc + '/ows?' + new URLSearchParams({ service: 'WMS', version: '1.3.0', request: 'GetMap', layers: layer, styles: style, format: 'image/png', transparent: 'true', crs: 'EPSG:3857', width: '256', height: '256', bbox: bbox3857(z, x, y).map(v => v.toFixed(2)).join(',') }); }
  if (l === 'storms') return 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer/export?' +
    new URLSearchParams({ layers: 'show:5,6,7', bbox: bbox3857(z, x, y).map(v => v.toFixed(2)).join(','), bboxSR: '3857', imageSR: '3857', size: '256,256', format: 'png32', transparent: 'true', f: 'image' });
  if (l === 'traffic') return env.TOMTOM_API_KEY ? 'https://api.tomtom.com/traffic/map/4/tile/flow/relative0/' + z + '/' + x + '/' + y + '.png?tileSize=256&key=' + encodeURIComponent(env.TOMTOM_API_KEY) : null;
  return null;
}

export default async function handler(req, res) {
  const q = req.query || {};
  if (!q.l) { res.setHeader('Cache-Control', 'public, max-age=300'); return res.json({ traffic: !!process.env.TOMTOM_API_KEY }); }
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 900, perDay: 40000 })) return;
  const l = String(q.l), z = parseInt(q.z, 10), x = parseInt(q.x, 10), y = parseInt(q.y, 10);
  if (!(l in MAXZ) || !(z >= 0 && z <= MAXZ[l]) || !(x >= 0 && x < 2 ** z) || !(y >= 0 && y < 2 ** z)) return res.status(400).json({ error: 'bad tile' });
  const b = tileLonLat(z, x, y);
  if (z >= 4 && (b[2] < REGION[0] || b[0] > REGION[2] || b[3] < REGION[1] || b[1] > REGION[3])) return res.status(204).end();
  const u = upstream(l, z, x, y); if (!u) return res.status(503).json({ error: 'Traffic needs TOMTOM_API_KEY on the server.' });
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'FinishesSolutions-RealEstateIntel/1.0' } });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !/^image\//.test(type)) throw new Error(l + ' ' + r.status + ' ' + type);
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=' + Math.min(120, TTL[l]) + ', s-maxage=' + TTL[l]);
    return res.status(200).send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    console.error('tile', e.message);
    res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ error: 'upstream tile failed' });
  }
}
