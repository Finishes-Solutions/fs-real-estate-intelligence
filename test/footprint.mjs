// Offline tests for the clicked building's footprint from map tiles (lib/footprint.mjs).
// Regression: a tile feature id is shared by many separate buildings (the tiles merge neighbours into one MultiPolygon);
// selecting one building must never pull in the others (2026-10-05: a click in Waller selected ~260,000 sq ft of
// unrelated buildings across the screen).
import assert from 'node:assert/strict';
const { joinPieces, tileBox, inGeom, labelPoint, sameSelection } = await import('../lib/footprint.mjs');

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

// ---------- several parcels picked with Shift-click (2026-10-05: Shift-clicking open ground in one Waller parcel kept
// adding it again, ten numbered dots in one parcel, each number at its click point) ----------
// a real Waller County appraisal parcel (19750 FM 362, TxGIO StratMap), with the near-duplicate corner points the data carries
const waller = { type: 'Polygon', coordinates: [[[-95.93203098486757, 30.055354739359796], [-95.9337052352497, 30.05536262895187], [-95.93371371804093, 30.056014768778997], [-95.93371374768535, 30.056017074138694],
  [-95.93235753594807, 30.056006684080234], [-95.93203939309863, 30.056001851765764], [-95.9320393859121, 30.0560013207166], [-95.93203101720691, 30.055357147368824], [-95.93203098486757, 30.055354739359796]]] };
const mid = labelPoint(waller);
assert.ok(inGeom(mid, waller));
assert.ok(Math.abs(mid[0] - (-95.93287)) < 0.00006 && Math.abs(mid[1] - 30.05568) < 0.00006, 'the number sits in the middle of the parcel: ' + mid);
// an L-shaped parcel: the vertex average falls outside it; the number must sit inside, in the thick part
const L0 = [-95.94, 30.05], u = 0.001, Lp = { type: 'Polygon', coordinates: [[[L0[0], L0[1]], [L0[0] + 4 * u, L0[1]], [L0[0] + 4 * u, L0[1] + u], [L0[0] + u, L0[1] + u], [L0[0] + u, L0[1] + 4 * u], [L0[0], L0[1] + 4 * u], [L0[0], L0[1]]]] };
const lm = labelPoint(Lp); assert.ok(inGeom(lm, Lp), 'inside the L');
const near = (p, q, tol) => Math.abs(p[0] - q[0]) < tol && Math.abs(p[1] - q[1]) < tol;
assert.ok((lm[1] > L0[1] + .3 * u && lm[1] < L0[1] + .7 * u) || (lm[0] > L0[0] + .3 * u && lm[0] < L0[0] + .7 * u), 'along the middle of an arm, clear of the edges: ' + lm);
// a parcel in two pieces (the appraisal service sends both rings in one Polygon): the number goes in the bigger piece
const two = { type: 'Polygon', coordinates: [rect(-95.95, 30.06, -95.949, 30.061)[0], rect(-95.947, 30.06, -95.9465, 30.0603)[0]] };
assert.ok(near(labelPoint(two), [-95.9495, 30.0605], 0.00006), 'middle of the bigger piece');
// a building's outline (MultiPolygon from the tiles) works the same way
assert.ok(inGeom(labelPoint({ type: 'MultiPolygon', coordinates: [big] }), { type: 'MultiPolygon', coordinates: [big] }));

// the same parcel clicked again anywhere inside it (not just within 5 m of the first click) is the same selection
const p1 = { center: [-95.9325, 30.0555], footprint: null, parcel: { propId: '29519', geometry: waller } };
assert.ok(sameSelection(p1, { center: [-95.9336, 30.0559], footprint: null }), 'a second click across the parcel, before its parcel loads');
assert.ok(sameSelection(p1, { center: [-95.9336, 30.0559], footprint: null, parcel: { propId: '29519', geometry: waller } }));
assert.ok(!sameSelection(p1, { center: [-95.9325, 30.0572], footprint: null }), 'open ground in the parcel to the north is another parcel');
assert.ok(!sameSelection(p1, { center: [-95.9325, 30.0572], footprint: null, parcel: { propId: '29520' } }));
// a building and the open ground around it are different picks; the same building twice is the same
const bA = { center: ptIn(big), footprint: { type: 'Polygon', coordinates: big } };
assert.ok(!sameSelection(bA, { center: ptIn(big), footprint: null }));
assert.ok(sameSelection(bA, { center: [ptIn(big)[0] + 0.0001, ptIn(big)[1]], footprint: { type: 'Polygon', coordinates: big } }));
assert.ok(!sameSelection(bA, { center: ptIn(smallA[0]), footprint: { type: 'Polygon', coordinates: smallA[0] } }));
console.log('footprint ok');
