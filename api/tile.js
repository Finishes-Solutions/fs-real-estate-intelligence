// Same-origin raster tile proxy for the live layers. Keeps the TomTom key server-side, sidesteps CORS on the NOAA
// services, and lets the CDN share each tile for a few minutes (the browser adds a time bucket `t` to the URL).
//   GET ?l=radar|lightning|clouds|storms|traffic&z=&x=&y=   -> 256px PNG
//   GET (no params)                                        -> { traffic: bool }  (is a TomTom key configured)
// Sources: radar from the NWS NEXRAD radars through the Iowa Environmental Mesonet tile cache: the nearest radar's own
// super-resolution scan (N0B, 250 m gates) within ~200 km, else the national 0.005° composite (N0Q), else NOAA nowCOAST's
// 1 km MRMS mosaic. NOAA nowCOAST WMS (lightning, GOES infrared), NOAA NHC tropical MapServer (cones, tracks), TomTom flow.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';

const NOW = 'https://nowcoast.noaa.gov/geoserver/observations/';
const WMS = { // service / layer / style, from the nowCOAST capabilities
  radar: ['weather_radar', 'conus_base_reflectivity_mosaic', 'weather_radar_base_reflectivity', 10, 240],
  lightning: ['lightning_detection', 'ldn_lightning_strike_density', 'lightning_density', 9, 600],
  clouds: ['satellite', 'goes_longwave_imagery', 'goes-lir', 9, 600]
};
const MAXZ = { ...Object.fromEntries(Object.entries(WMS).map(([k, v]) => [k, v[3]])), radar: 12, storms: 10, traffic: 18 };
const IEM = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/';
// NWS NEXRAD sites in and around Texas: [lat, lon]
export const NEXRAD = { HGX: [29.472, -95.079], GRK: [30.722, -97.383], EWX: [29.704, -98.029], FWS: [32.573, -97.303], DYX: [32.538, -99.254], SJT: [31.371, -100.493],
  MAF: [31.943, -102.189], LBB: [33.654, -101.814], AMA: [35.233, -101.709], EPZ: [31.873, -106.698], DFX: [29.273, -100.280], CRP: [27.784, -97.511], BRO: [25.916, -97.419],
  LCH: [30.125, -93.216], SHV: [32.451, -93.841], POE: [31.156, -92.976], FDR: [34.362, -98.976], TLX: [35.333, -97.278], FDX: [34.634, -103.619], HDX: [33.077, -106.120] };
const km = (a, b) => { const r = Math.PI / 180, h = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
export function nearestRadar(lat, lon, maxKm = 200) { let best = null; for (const [id, p] of Object.entries(NEXRAD)) { const d = km([lat, lon], p); if (d <= maxKm && (!best || d < best.km)) best = { id, km: d }; } return best; }
// where to fetch a radar tile from, best first
export function radarSources(z, x, y) {
  const b = tileLonLat(z, x, y), site = z >= 7 ? nearestRadar((b[1] + b[3]) / 2, (b[0] + b[2]) / 2) : null, t = z + '/' + x + '/' + y + '.png';
  return [site && IEM + 'ridge::' + site.id + '-N0B-0/' + t, IEM + 'nexrad-n0q-900913/' + t, upstream('radar', z, x, y)].filter(Boolean);
}
const TTL = { ...Object.fromEntries(Object.entries(WMS).map(([k, v]) => [k, v[4]])), storms: 900, traffic: 120 };
const HALF = 20037508.342789244;

export function bbox3857(z, x, y) { const s = 2 * HALF / 2 ** z; return [-HALF + x * s, HALF - (y + 1) * s, -HALF + (x + 1) * s, HALF - y * s]; }
// tile -> lon/lat bounds, to keep the proxy to Texas and its neighbours
export function tileLonLat(z, x, y) {
  const n = 2 ** z, lon = v => v / n * 360 - 180, lat = v => Math.atan(Math.sinh(Math.PI * (1 - 2 * v / n))) * 180 / Math.PI;
  return [lon(x), lat(y + 1), lon(x + 1), lat(y)];
}
export const REGION = [-108, 24, -92, 38];
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
  const list = l === 'radar' ? radarSources(z, x, y) : [upstream(l, z, x, y)].filter(Boolean);
  if (!list.length) return res.status(503).json({ error: 'Traffic needs TOMTOM_API_KEY on the server.' });
  let err = '';
  for (const u of list) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(list.length > 1 ? 6000 : 8000), headers: { 'User-Agent': 'FinishesSolutions-RealEstateIntel/1.0' } });
      const type = r.headers.get('content-type') || '';
      if (!r.ok || !/^image\//.test(type)) throw new Error(l + ' ' + r.status + ' ' + type);
      res.setHeader('Content-Type', type);
      res.setHeader('Cache-Control', 'public, max-age=' + Math.min(120, TTL[l]) + ', s-maxage=' + TTL[l]);
      res.setHeader('X-Tile-Source', new URL(u).host + (u.includes('ridge::') ? ' ' + u.split('ridge::')[1].split('/')[0] : u.includes('nexrad-n0q') ? ' n0q' : ''));
      return res.status(200).send(Buffer.from(await r.arrayBuffer()));
    } catch (e) { err = e.message; }
  }
  console.error('tile', err);
  res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ error: 'upstream tile failed' });
}
