// Offline tests for the clicked building's footprint from map tiles (lib/footprint.mjs).
// Regression: a tile feature id is shared by many separate buildings (the tiles merge neighbours into one MultiPolygon);
// selecting one building must never pull in the others (2026-10-05: a click in Waller selected ~260,000 sq ft of
// unrelated buildings across the screen).
import assert from 'node:assert/strict';
const { joinPieces, tileBox, inGeom, offsetGeom } = await import('../lib/footprint.mjs');

const z = 16, lon = -95.93, lat = 30.09, n = 2 ** z;
const x = Math.floor((lon + 180) / 360 * n), y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
const A = tileBox(z, x, y), B = tileBox(z, x + 1, y), L = A[2], midLat = (A[1] + A[3]) / 2;
const rect = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
// a big warehouse across the tile edge, and small unrelated buildings in both tiles, all one feature id
const big = rect(L - 0.0004, midLat, L + 0.0003, midLat + 0.0002);
const smallA = [rect(A[0] + 0.0010, midLat - 0.0010, A[0] + 0.0011, midLat - 0.0009), rect(A[0] + 0.0020, midLat + 0.0005, A[0] + 0.0021, midLat + 0.0006)];
const smallB = [rect(B[2] - 0.0010, midLat - 0.0010, B[2] - 0.0009, midLat - 0.0009)];
// a small building touching the same tile edge but further along it: shares the edge line, not the warehouse's stretch
const edgeNeighbour = rect(L, midLat - 0.0008, L + 0.0001, midLat - 0.0007);
// each tile's feature carries its buffer: the whole warehouse appears in both, unclipped
const pieces = [
  { z, x, y, geometry: { type: 'MultiPolygon', coordinates: [big, ...smallA] } },
  { z, x: x + 1, y, geometry: { type: 'MultiPolygon', coordinates: [big, ...smallB, edgeNeighbour] } },
  { z, x, y, geometry: { type: 'MultiPolygon', coordinates: [big, ...smallA] } }, // duplicate copy from querySourceFeatures
  { z: z - 1, x: x >> 1, y: y >> 1, geometry: { type: 'MultiPolygon', coordinates: [big, ...smallA, ...smallB] } } // an overzoomed parent: ignored
];
const ptIn = r => [(r[0][0][0] + r[0][2][0]) / 2, (r[0][0][1] + r[0][2][1]) / 2];
const area = g => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).reduce((s, p) => { const r = p[0]; let a = 0; for (let i = 1; i < r.length; i++) a += r[i - 1][0] * r[i][1] - r[i][0] * r[i - 1][1]; return s + Math.abs(a) / 2; }, 0);

// clicking a small building: just that building
for (const s of [...smallA, ...smallB, edgeNeighbour]) {
  const g = joinPieces(pieces, ptIn(s));
  assert.equal(g.type, 'Polygon', 'one small building, not a group'); assert.ok(Math.abs(area(g) - area({ type: 'Polygon', coordinates: s })) < 1e-12, 'its own outline');
}
// clicking either half of the warehouse: both halves, joined at the tile edge, and nothing else
for (const p of [[L - 0.0002, midLat + 0.0001], [L + 0.0002, midLat + 0.0001]]) {
  const g = joinPieces(pieces, p);
  assert.equal(g.type, 'MultiPolygon'); assert.equal(g.coordinates.length, 2, 'the two halves only');
  assert.ok(Math.abs(area(g) - area({ type: 'Polygon', coordinates: big })) < 1e-11, 'together they are the whole warehouse');
  assert.ok(![...smallA, ...smallB, edgeNeighbour].some(s => inGeom(ptIn(s), g)), 'no unrelated building included');
}
// nothing under the click
assert.equal(joinPieces(pieces, [A[0] + 0.0005, midLat + 0.0012]), null);
assert.equal(joinPieces([], [lon, lat]), null);
// the selected-building highlight: grown a fixed half metre outside every wall (never inside one), for a plain box, a concave
// L-shaped building (clockwise ring), a building with a courtyard, and the two tile-cut halves of the warehouse
{ const M = 1 / 111320 / Math.cos(lat * Math.PI / 180), N = 1 / 110540, at = (dx, dy) => [lon + dx * M, lat + dy * N];
  const box = { type: 'Polygon', coordinates: [[at(0, 0), at(20, 0), at(20, 10), at(0, 10), at(0, 0)]] };
  const ell = { type: 'Polygon', coordinates: [[at(0, 0), at(0, 30), at(10, 30), at(10, 10), at(30, 10), at(30, 0), at(0, 0)]] };
  const court = { type: 'Polygon', coordinates: [[at(0, 0), at(40, 0), at(40, 40), at(0, 40), at(0, 0)], [at(10, 10), at(10, 30), at(30, 30), at(30, 10), at(10, 10)]] };
  const half = (g, k) => g.coordinates.flatMap(r => r.slice(0, -1).map((p, i) => [(p[0] + r[i + 1][0]) / 2, (p[1] + r[i + 1][1]) / 2]));
  const metres = (a, b) => Math.hypot((a[0] - b[0]) / M, (a[1] - b[1]) / N);
  for (const g of [box, ell, court]) {
    const o = offsetGeom(g, 0.5);
    for (const p of g.coordinates.flat()) assert.ok(inGeom(p, o), 'every corner of the building is inside the highlight');
    for (const p of half(g)) { // the middle of each wall: inside the highlight, half a metre from its edge
      assert.ok(inGeom(p, o), 'wall middle inside');
      const d = Math.min(...o.coordinates.flatMap(r => r.slice(0, -1).map((q, i) => { const r2 = r[i + 1], vx = r2[0] - q[0], vy = r2[1] - q[1], t = Math.max(0, Math.min(1, ((p[0] - q[0]) * vx + (p[1] - q[1]) * vy) / (vx * vx + vy * vy))); return metres(p, [q[0] + t * vx, q[1] + t * vy]); })));
      assert.ok(Math.abs(d - 0.5) < 0.02, 'wall moved out 0.5 m, got ' + d.toFixed(3));
    }
  }
  assert.ok(!inGeom(at(20, 20), offsetGeom(court, 0.5)), 'the courtyard stays open');
  const w = offsetGeom(joinPieces(pieces, [L - 0.0002, midLat + 0.0001]), 0.5);
  assert.equal(w.type, 'MultiPolygon'); assert.ok(![...smallA, ...smallB, edgeNeighbour].some(s => inGeom(ptIn(s), w)), 'still only the warehouse'); }
console.log('footprint ok');
