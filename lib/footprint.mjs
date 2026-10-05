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
