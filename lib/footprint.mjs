// The clicked building's footprint from the map's vector tiles (used by src/building.js; tested in test/footprint.mjs).
// Two things about the tiles shape this:
//   - a tile feature is often a MultiPolygon holding MANY separate buildings (neighbours merged into one feature, all
//     sharing one feature id), so a feature id never identifies a single building
//   - tiles cut a big building at tile edges, so the piece under the click can be part of a building
// So: start from the one polygon under the click, and add a piece from a neighbouring tile only when it continues that
// polygon across the shared tile edge (both sides run along the edge over the same stretch). Unrelated buildings that
// merely share the feature id are never joined.

export const tileBox = (z, x, y) => { const n = 2 ** z, lon = v => v / n * 360 - 180, lat = v => Math.atan(Math.sinh(Math.PI * (1 - 2 * v / n))) * 180 / Math.PI; return [lon(x), lat(y + 1), lon(x + 1), lat(y)]; };

// Sutherland–Hodgman clip of a closed ring to a lon/lat box
export function clipRing(ring, [x0, y0, x1, y1]) {
  let out = ring.slice(0, -1);
  for (const [inside, cut] of [[p => p[0] >= x0, (a, b) => [x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0])]], [p => p[0] <= x1, (a, b) => [x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0])]],
    [p => p[1] >= y0, (a, b) => [a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0]], [p => p[1] <= y1, (a, b) => [a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1]]]) {
    const inp = out; out = []; if (!inp.length) break;
    for (let i = 0; i < inp.length; i++) { const a = inp[(i + inp.length - 1) % inp.length], b = inp[i];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b)); }
  }
  return out.length >= 3 ? out.concat([out[0]]) : null;
}

// point-in-polygon on GeoJSON Polygon / MultiPolygon (planar; fine at parcel scale)
export function inGeom(pt, g) {
  if (!g) return false;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.some(rings => rings.reduce((ins, ring, ri) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return ri === 0 ? c : ins && !c; }, false));
}

// the polygon of a (Multi)Polygon under the point
export function partAt(g, pt) {
  if (!g || g.type !== 'MultiPolygon') return g;
  const hit = g.coordinates.find(rings => inGeom(pt, { type: 'Polygon', coordinates: rings }));
  return hit ? { type: 'Polygon', coordinates: hit } : null;
}

const EPS = 1e-9;
// the stretch [lo, hi] of a ring that runs along a tile edge (the vertical line x = v when axis 0, horizontal y = v when axis 1)
function along(ring, axis, v) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 1; i < ring.length; i++) { const a = ring[i - 1], b = ring[i];
    if (Math.abs(a[axis] - v) < EPS && Math.abs(b[axis] - v) < EPS) { const o = 1 - axis; lo = Math.min(lo, a[o], b[o]); hi = Math.max(hi, a[o], b[o]); } }
  return hi > lo ? [lo, hi] : null;
}
// does piece b continue piece a across the edge their (side-by-side) tiles share?
function continues(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y; if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
  const axis = dx ? 0 : 1, v = dx === 1 ? a.box[2] : dx === -1 ? a.box[0] : dy === 1 ? a.box[1] : a.box[3];
  const sa = along(a.rings[0], axis, v), sb = along(b.rings[0], axis, v); if (!sa || !sb) return false;
  return Math.min(sa[1], sb[1]) - Math.max(sa[0], sb[0]) > EPS; // they meet along a real stretch, not just a corner
}

// pieces: tile features with the clicked feature's id, as [{ z, x, y, geometry }] (lon/lat, unclipped tile geometry with its buffer).
// Returns the footprint (Polygon, or MultiPolygon when it spans tiles), or null when nothing sits under the point.
export function joinPieces(pieces, pt, { maxParts = 12 } = {}) {
  const z = Math.max(-1, ...pieces.map(p => p.z ?? -1)); if (z < 0) return null;
  const cands = [], seen = new Set();
  for (const p of pieces) {
    if (p.z !== z) continue;
    const box = tileBox(z, p.x, p.y), g = p.geometry, polys = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
    for (const rings of polys) {
      const cr = rings.map(r => clipRing(r, box)).filter(Boolean); if (!cr.length) continue;
      const key = p.x + '/' + p.y + '/' + cr[0][0].map(v => v.toFixed(8)).join(',') + '/' + cr[0].length; if (seen.has(key)) continue; seen.add(key);
      cands.push({ x: p.x, y: p.y, box, rings: cr });
    }
  }
  const seed = cands.find(c => inGeom(pt, { type: 'Polygon', coordinates: c.rings })); if (!seed) return null;
  const group = [seed];
  for (let i = 0; i < group.length && group.length < maxParts; i++)
    for (const c of cands) if (!group.includes(c) && continues(group[i], c)) { group.push(c); if (group.length >= maxParts) break; }
  return group.length === 1 ? { type: 'Polygon', coordinates: seed.rings } : { type: 'MultiPolygon', coordinates: group.map(c => c.rings) };
}

// ---------- several selected: where each one's number sits, and whether a click picks something already selected ----------
const allRings = g => !g ? [] : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
// where a label goes inside a shape: its center of area when that is inside and well clear of the edges (rectangles,
// most lots and buildings), otherwise the point farthest from the edges (the corner of an L, the bigger piece of a parcel
// in several pieces), ties going to the one nearer the center. Planar, longitude scaled to metres.
export function labelPoint(g) {
  const rings = allRings(g).filter(r => r.length >= 4); if (!rings.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const k = Math.cos((y0 + y1) / 2 * Math.PI / 180);
  const edge = p => { let d = Infinity; for (const r of rings) for (let i = 1; i < r.length; i++) { const a = r[i - 1], b = r[i], ax = (a[0] - p[0]) * k, ay = a[1] - p[1], bx = (b[0] - p[0]) * k, by = b[1] - p[1], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let t = L ? -(ax * dx + ay * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; d = Math.min(d, Math.hypot(ax + t * dx, ay + t * dy)); } return d; };
  // center of area (rings in opposite directions, like holes, subtract)
  let A = 0, cx = 0, cy = 0;
  for (const r of rings) for (let i = 1; i < r.length; i++) { const [xa, ya] = r[i - 1], [xb, yb] = r[i], f = (xa - x0) * (yb - y0) - (xb - x0) * (ya - y0); A += f; cx += (xa + xb - 2 * x0) * f; cy += (ya + yb - 2 * y0) * f; }
  const c = Math.abs(A) > 1e-18 ? [x0 + cx / (3 * A), y0 + cy / (3 * A)] : [(x0 + x1) / 2, (y0 + y1) / 2];
  // the point farthest from the edges: a grid search refined a few times
  let best = null, bd = -1, mx = (x0 + x1) / 2, my = (y0 + y1) / 2, w = x1 - x0, h = y1 - y0;
  const closer = p => Math.hypot((p[0] - c[0]) * k, p[1] - c[1]) < Math.hypot((best[0] - c[0]) * k, best[1] - c[1]);
  for (let pass = 0; pass < 4; pass++) {
    const n = pass ? 10 : 28;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const p = [mx - w / 2 + (i + .5) * w / n, my - h / 2 + (j + .5) * h / n]; if (!inGeom(p, g)) continue;
      const d = edge(p); if (d > bd * 1.02 || (best && d >= bd * 0.98 && closer(p))) { if (d > bd) bd = d; best = p; }
    }
    if (!best) break; mx = best[0]; my = best[1]; w = w / n * 3; h = h / n * 3;
  }
  if (inGeom(c, g) && (!best || edge(c) >= 0.5 * bd)) return c;
  return best || c;
}
// a selection: { center (the click), footprint (a building's outline, or null for open ground), parcel?: { propId, geometry },
// parcels?: [...] }. A building is the same building when either click falls in the other's outline; open ground is the
// same parcel when the click falls inside a parcel already picked as open ground (or has its property ID), or, before its
// parcel has loaded, when the two clicks are within about 5 m.
export function sameSelection(a, b) {
  if (!a || !b) return false;
  if (a.footprint || b.footprint) return !!(a.footprint && b.footprint && (a.footprint === b.footprint || inGeom(a.center, b.footprint) || inGeom(b.center, a.footprint)));
  if (a.parcel?.propId && a.parcel.propId === b.parcel?.propId) return true;
  const geoms = x => [x.parcel?.geometry, ...(x.parcels || []).map(p => p.geometry)].filter(Boolean);
  if (geoms(a).some(g => inGeom(b.center, g)) || geoms(b).some(g => inGeom(a.center, g))) return true;
  return Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]) < 0.00005;
}
