// Building height from USGS 3DEP lidar, via Microsoft Planetary Computer (free, no key):
//   collection 3dep-lidar-hag = "height above ground" rasters (≈2 m pixels) made from the 3DEP lidar point clouds.
// The data API computes statistics over the building outline server-side, so no reprojection happens here.
// Roof height = a high percentile of the pixels inside the footprint (shrunk a little so walls, trees and
// neighbouring roofs at the edge don't count). Floors are estimated from that height.
const PC = process.env.PC_API || 'https://planetarycomputer.microsoft.com/api';
const COLLECTION = '3dep-lidar-hag';

async function j(url, opts = {}, ms = 9000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { ...opts, signal: ctl.signal }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error((d.detail || d.message || 'HTTP ' + r.status).toString().slice(0, 160)); return d; }
  catch (e) { throw new Error(e.name === 'AbortError' ? 'timed out' : e.message); } finally { clearTimeout(t); }
}

// scale a polygon about its centroid (k < 1 shrinks)
export function shrink(poly, k = 0.8) {
  const ring = poly.coordinates[0]; let x = 0, y = 0; ring.forEach(p => { x += p[0]; y += p[1]; }); x /= ring.length; y /= ring.length;
  return { type: 'Polygon', coordinates: poly.coordinates.map(r => r.map(([a, b]) => [x + (a - x) * k, y + (b - y) * k])) };
}

// typical story heights: houses ~3 m, offices/retail ~4 m; first floors run taller
export function floorsFromHeight(h, use = '') {
  if (!(h > 1.5)) return null;
  const story = /house|residential|apartment|multifamily|single|senior|hotel|dorm/i.test(use) ? 3.1 : h > 30 ? 3.9 : 4.2;
  return Math.max(1, Math.round((h - 0.6) / story));
}

export async function lidarHeight(footprint, center) {
  const search = await j(PC + '/stac/v1/search', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collections: [COLLECTION], intersects: { type: 'Point', coordinates: center }, limit: 10 }) });
  const items = (search.features || []).sort((a, b) => String(b.properties.end_datetime || b.properties.datetime || '').localeCompare(String(a.properties.end_datetime || a.properties.datetime || '')));
  if (!items.length) return { source: 'none', note: 'No 3DEP lidar covers this spot.' };
  const shape = footprint?.type === 'Polygon' ? shrink(footprint, 0.8) : { type: 'Polygon', coordinates: [[-1, -1, 1, 1, -1].map((_, i, a) => [center[0] + 0.00004 * Math.cos(i * Math.PI / 2), center[1] + 0.00004 * Math.sin(i * Math.PI / 2)])] };
  for (const it of items.slice(0, 3)) {
    try {
      const q = new URLSearchParams({ collection: COLLECTION, item: it.id, assets: 'data' }); q.append('p', '50'); q.append('p', '90'); q.append('p', '98');
      const st = await j(PC + '/data/v1/item/statistics?' + q, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'Feature', properties: {}, geometry: shape }) }, 12000);
      const s = Object.values(st.properties?.statistics || st.statistics || st || {})[0];
      if (!s || !(s.count > 0) || s.max == null) continue;
      const roof = s.percentile_98 ?? s.max, p90 = s.percentile_90 ?? roof;
      return { source: '3dep-lidar', item: it.id, date: String(it.properties.end_datetime || it.properties.datetime || '').slice(0, 10), height_m: Math.round(roof * 10) / 10, p90_m: Math.round(p90 * 10) / 10, median_m: Math.round((s.percentile_50 ?? s.median ?? 0) * 10) / 10, pixels: s.count };
    } catch (e) { var last = e.message; }
  }
  return { source: 'none', note: 'Lidar lookup failed' + (typeof last === 'string' ? ': ' + last : '') };
}
