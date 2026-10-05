// Offline tests for the clicked building's footprint from map tiles (lib/footprint.mjs).
// Regression: a tile feature id is shared by many separate buildings (the tiles merge neighbours into one MultiPolygon);
// selecting one building must never pull in the others (2026-10-05: a click in Waller selected ~260,000 sq ft of
// unrelated buildings across the screen).
import assert from 'node:assert/strict';
const { joinPieces, tileBox, inGeom } = await import('../lib/footprint.mjs');

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
console.log('footprint ok');
