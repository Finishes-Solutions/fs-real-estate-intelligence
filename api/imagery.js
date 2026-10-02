// High-resolution site imagery (lib/hires.mjs): which dated versions exist at a spot, and a same-origin tile proxy so
// the browser can stitch tiles into one downloadable picture and show them on the map.
//   GET ?at=lon,lat                                   -> { wayback: [{ release, published, captured, res_m, provider }], naip: [{ item, date, gsd, style }] }
//   GET ?src=wb&r=<release>&z=&x=&y=                  -> Esri World Imagery Wayback tile (that archived version)
//   GET ?src=naip&item=<id>&s=tms|xyz&z=&x=&y=        -> USDA NAIP tile (Microsoft Planetary Computer)
// Archived imagery never changes, so tiles are CDN-cached for a month and catalogs for a day.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { tileLonLat, REGION } from './tile.js';
import { imageryCatalog, waybackTileUrl, naipTileUrl } from '../lib/hires.mjs';

export function upstream(q) {
  const z = parseInt(q.z, 10), x = parseInt(q.x, 10), y = parseInt(q.y, 10);
  if (!(z >= 10 && z <= 19) || !(x >= 0 && x < 2 ** z) || !(y >= 0 && y < 2 ** z)) return { error: 'bad tile' };
  const b = tileLonLat(z, x, y);
  if (b[2] < REGION[0] || b[0] > REGION[2] || b[3] < REGION[1] || b[1] > REGION[3]) return { outside: true };
  if (q.src === 'wb' && /^\d{1,6}$/.test(String(q.r || ''))) return { url: waybackTileUrl(+q.r, z, x, y) };
  if (q.src === 'naip' && /^[a-z0-9_]{6,80}$/i.test(String(q.item || '')) && z <= 18) return { url: naipTileUrl(String(q.item), q.s === 'xyz' ? 'xyz' : 'tms', z, x, y) };
  return { error: 'bad imagery source' };
}

export default async function handler(req, res) {
  const q = req.query || {};
  if (!sameOrigin(req, res)) return;
  if (q.at) {
    if (!rateLimit(req, res, { perMinute: 30, perDay: 1500 })) return;
    const [lon, lat] = String(q.at).split(',').map(Number);
    if (!(lon > REGION[0] && lon < REGION[2] && lat > REGION[1] && lat < REGION[3])) return res.status(400).json({ error: 'Imagery lookups cover Texas and its neighbours only.' });
    const out = await imageryCatalog([+lon.toFixed(5), +lat.toFixed(5)]);
    res.setHeader('Cache-Control', out.wayback.length || out.naip.length ? 'public, max-age=3600, s-maxage=86400' : 'no-store');
    return res.json(out);
  }
  if (!rateLimit(req, res, { perMinute: 900, perDay: 40000 })) return;
  const u = upstream(q);
  if (u.error) return res.status(400).json({ error: u.error });
  if (u.outside) return res.status(204).end();
  try {
    const r = await fetch(u.url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'FinishesSolutions-RealEstateIntel/1.0' } });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !/^image\//.test(type)) throw new Error(q.src + ' ' + r.status + ' ' + type);
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000');
    return res.status(200).send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    console.error('imagery', e.message);
    res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ error: 'upstream tile failed' });
  }
}
