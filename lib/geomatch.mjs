// Fast "is this point inside this area?" for filings and other points against selections, counties, compare areas and
// searched places. d3.geoContains is exact on the sphere but re-projects every vertex on every call: thousands of filings
// against a county outline (Harris: ~6,000 vertices) took seconds and froze the page. Areas here are at most a few
// counties across, where a flat (lon/lat) test agrees with the spherical one, so:
//   - each geometry is prepared once (rings as flat arrays, bounding boxes) and cached by object identity,
//   - points outside the bounding box are rejected straight away,
//   - inside the box, an even-odd ray test (so ring direction and holes don't matter).
const cache = new WeakMap();

function prepRing(r) {
  const n = r.length, xs = new Float64Array(n), ys = new Float64Array(n);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { const x = r[i][0], y = r[i][1]; xs[i] = x; ys[i] = y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { xs, ys, n, box: [x0, y0, x1, y1] };
}
export function prepare(geom) {
  if (!geom || typeof geom !== 'object') return null;
  const hit = cache.get(geom); if (hit) return hit;
  const g = geom.type === 'Feature' ? geom.geometry : geom;
  const polys = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
  const out = { polys: polys.map(p => { const rings = p.filter(r => r && r.length > 2).map(prepRing); return { rings, box: rings[0]?.box || [0, 0, -1, -1] }; }).filter(p => p.rings.length) };
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of out.polys) { b[0] = Math.min(b[0], p.box[0]); b[1] = Math.min(b[1], p.box[1]); b[2] = Math.max(b[2], p.box[2]); b[3] = Math.max(b[3], p.box[3]); }
  out.box = b; cache.set(geom, out); return out;
}
function inRing(R, x, y) {
  let inside = false; const { xs, ys, n } = R;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = ys[i], yj = ys[j];
    if ((yi > y) !== (yj > y) && x < (xs[j] - xs[i]) * (y - yi) / (yj - yi) + xs[i]) inside = !inside;
  }
  return inside;
}
// pt = [lon, lat]
export function contains(geom, pt) {
  const P = geom && geom.polys ? geom : prepare(geom); if (!P || !P.polys.length) return false;
  const x = pt[0], y = pt[1], b = P.box; if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false;
  for (const p of P.polys) {
    const pb = p.box; if (x < pb[0] || x > pb[2] || y < pb[1] || y > pb[3]) continue;
    let inside = false; for (const r of p.rings) if (inRing(r, x, y)) inside = !inside; // holes flip it back
    if (inside) return true;
  }
  return false;
}
