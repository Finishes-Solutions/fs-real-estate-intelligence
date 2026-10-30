// Offline tests for the clicked building's footprint from map tiles (lib/footprint.mjs).
// Regression: a tile feature id is shared by many separate buildings (the tiles merge neighbours into one MultiPolygon);
// selecting one building must never pull in the others (2026-10-05: a click in Waller selected ~260,000 sq ft of
// unrelated buildings across the screen).
import assert from 'node:assert/strict';
const { joinPieces, tileBox, inGeom, offsetGeom, labelPoint, sameSelection, partAt, withTileParcel } = await import('../lib/footprint.mjs');
const { groundClick } = await import('../lib/cardclick.mjs');

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
  assert.equal(g.type, 'Polygon', 'the two halves, dissolved into one outline'); assert.equal(g.coordinates.length, 1);
  assert.ok(Math.abs(area(g) - area({ type: 'Polygon', coordinates: big })) < 1e-11, 'together they are the whole warehouse');
  assert.ok(!g.coordinates[0].some((q, i) => i && Math.abs(q[0] - L) < 1e-9 && Math.abs(g.coordinates[0][i - 1][0] - L) < 1e-9), 'no line drawn along the tile edge');
  assert.ok(![...smallA, ...smallB, edgeNeighbour].some(s => inGeom(ptIn(s), g)), 'no unrelated building included');
}
// nothing under the click
assert.equal(joinPieces(pieces, [A[0] + 0.0005, midLat + 0.0012]), null);

// A rural parcel (Sevier County, TN, 2026-10-30) across four tiles where they meet: the selection outline showed straight
// green dashed lines through it, the tile edges each piece was cut at. Each tile carries its own rounded copy of the parcel
// (points a few cm apart from the neighbour's), plus an unrelated parcel sharing the feature id.
{ const tz = 15, tn = 2 ** tz, tlon = -83.5791, tlat = 35.8402;
  const tx = Math.floor((tlon + 180) / 360 * tn), ty = Math.floor((1 - Math.log(Math.tan(tlat * Math.PI / 180) + 1 / Math.cos(tlat * Math.PI / 180)) / Math.PI) / 2 * tn);
  const T = tileBox(tz, tx, ty), cx = T[2], cy = T[1]; // the corner where tiles (tx,ty), (tx+1,ty), (tx,ty+1), (tx+1,ty+1) meet
  const parcel = [[cx - 0.0021, cy - 0.0013], [cx + 0.0008, cy - 0.0019], [cx + 0.0024, cy - 0.0004], [cx + 0.0017, cy + 0.0011], [cx + 0.0003, cy + 0.0018], [cx - 0.0016, cy + 0.0009], [cx - 0.0021, cy - 0.0013]];
  const other = [[cx - 0.0040, cy + 0.0030], [cx - 0.0030, cy + 0.0030], [cx - 0.0030, cy + 0.0040], [cx - 0.0040, cy + 0.0040], [cx - 0.0040, cy + 0.0030]];
  const jit = (r, k) => r.map(([a, b], i) => i === r.length - 1 ? null : [a + Math.sin(k * 7 + i) * 3e-7, b + Math.cos(k * 5 + i) * 3e-7]).filter(Boolean).concat([[r[0][0] + Math.sin(k * 7) * 3e-7, r[0][1] + Math.cos(k * 5) * 3e-7]]);
  const tiles = [[tx, ty], [tx + 1, ty], [tx, ty + 1], [tx + 1, ty + 1]];
  const tp = tiles.map(([px, py], k) => ({ z: tz, x: px, y: py, geometry: { type: 'MultiPolygon', coordinates: [[jit(parcel, k)], [other]] } }));
  const whole = { type: 'Polygon', coordinates: [parcel] };
  for (const click of [[cx - 0.0008, cy - 0.0004], [cx + 0.0010, cy + 0.0004], [cx + 0.0004, cy - 0.0010], [cx - 0.0005, cy + 0.0006]]) {
    const g = joinPieces(tp, click);
    assert.equal(g.type, 'Polygon', 'one outline, not four pieces'); assert.equal(g.coordinates.length, 1);
    const r = g.coordinates[0], onEdge = (a, b) => (Math.abs(a[0] - cx) < 1e-9 && Math.abs(b[0] - cx) < 1e-9) || (Math.abs(a[1] - cy) < 1e-9 && Math.abs(b[1] - cy) < 1e-9);
    { const bad = r.map((q, i) => i && onEdge(r[i - 1], q) ? Math.hypot(q[0] - r[i - 1][0], q[1] - r[i - 1][1]) : 0).filter(v => v > 1e-6); assert.ok(!bad.length, 'no line along a tile edge (only the cm jogs where the two copies meet): ' + bad); }
    assert.ok(Math.abs(area(g) - area(whole)) / area(whole) < 1e-3, 'the whole parcel: ' + area(g) / area(whole));
    assert.ok(r.length <= parcel.length + 9, 'only the parcel corners plus one jog per crossing: ' + r.length);
    assert.ok(!inGeom([cx - 0.0035, cy + 0.0035], g), 'the unrelated parcel with the same id is left out');
    for (const q of [[cx - 0.0008, cy - 0.0004], [cx + 0.0010, cy + 0.0004], [cx + 0.0004, cy - 0.0010], [cx - 0.0005, cy + 0.0006]]) assert.ok(inGeom(q, g), 'every quarter is in it');
  }
}
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
  assert.equal(w.type, 'Polygon'); assert.ok(![...smallA, ...smallB, edgeNeighbour].some(s => inGeom(ptIn(s), w)), 'still only the warehouse'); }

// ---------- the next lot takes one click (2026-10-14: with a card open, a click on an empty neighbouring lot only closed the card) ----------
// The card shows the warehouse that crosses the tile edge, on a lot that crosses it too (the lot's outline is whole: it comes from
// the appraisal data, not the tiles). The tiles still merge every neighbouring building into the one feature.
{ const lot = rect(L - 0.0007, midLat - 0.0004, L + 0.0006, midLat + 0.0005), lotShape = { type: 'Polygon', coordinates: lot };
  const warehouse = joinPieces(pieces, [L - 0.0002, midLat + 0.0001]);
  const shown = [warehouse, lotShape];
  const card = { cardOpen: true, zoom: 17.5, shapes: shown };
  const nextLot = [L + 0.0012, midLat + 0.0002]; // open ground in the lot east of it: no building drawn there
  assert.equal(groundClick({ ...card, point: nextLot }), 'open', 'one click opens the neighbouring lot while a card is open');
  assert.equal(groundClick({ ...card, point: [A[0] + 0.00005, midLat + 0.0008] }), 'open', 'and the one on the far side, in the other tile');
  // open ground inside the lot already shown (either side of the tile edge): the click still dismisses the card, as before
  assert.equal(groundClick({ ...card, point: [L - 0.0006, midLat - 0.0003] }), 'none'); assert.equal(groundClick({ ...card, point: [L + 0.0005, midLat - 0.0003] }), 'none');
  // the same click with no card open, or a card with nothing shown (a report), opens the parcel; zoomed out it opens nothing
  assert.equal(groundClick({ cardOpen: false, zoom: 17, point: nextLot }), 'open'); assert.equal(groundClick({ ...card, shapes: [], point: nextLot }), 'open');
  assert.equal(groundClick({ ...card, zoom: 15.5, point: nextLot }), 'none'); assert.equal(groundClick({ ...card, zoom: 15.5, adding: true, point: nextLot }), 'add'); assert.equal(groundClick({ ...card, zoom: 14, adding: true, point: nextLot }), 'none');
  assert.equal(groundClick({ ...card, adding: true, point: nextLot }), 'add', 'Shift-click still adds it to the selection');
  // the gap between two buildings of one merged tile feature is open ground, not a building: the parcel opens. A click on any of
  // the buildings is a building click, and its own outline is only that building (never the whole group)
  const merged = { type: 'MultiPolygon', coordinates: [big, ...smallA] }, gap = [A[0] + 0.0015, midLat - 0.0005];
  assert.equal(partAt(merged, gap), null, 'the gap is in the feature\'s box but in none of its buildings'); assert.equal(groundClick({ ...card, point: gap }), 'open');
  for (const sm of smallA) { const part = partAt(merged, ptIn(sm)); assert.ok(part && inGeom(ptIn(sm), part) && !inGeom(ptIn(big), part), 'a click on one small building is that building only'); }
}

// ---- Waller Tomball Rd (Oct 23): the statewide record for account 0422450000001 has a 128-acre outline that takes in
// several accounts the map's parcel lines (Regrid) draw separately. Picking 0422450000001, then Davis Jerry Lee's
// 0422450000072 inside that outline, dropped one of them ("the third parcel loads, then disappears"). Two accounts are two
// parcels, and the parcel line under the click decides which parcel a click picked.
{ const big = { type: 'Polygon', coordinates: [[[-95.89978, 30.05840], [-95.89137, 30.05840], [-95.89137, 30.06545], [-95.89978, 30.06545], [-95.89978, 30.05840]]] };
  const north = { type: 'Polygon', coordinates: [[[-95.89978, 30.0615], [-95.89137, 30.0615], [-95.89137, 30.06545], [-95.89978, 30.06545], [-95.89978, 30.0615]]] };
  const south = { type: 'Polygon', coordinates: [[[-95.89978, 30.05840], [-95.89137, 30.05840], [-95.89137, 30.0615], [-95.89978, 30.0615], [-95.89978, 30.05840]]] };
  const statewide = { propId: '0422450000001', owner: 'TERPSTRA PETER S TRUSTEE', situs: '30200 WALLER TOMBALL RD', county: 'HARRIS', raw: { PROP_ID: '0422450000001' }, geometry: big };
  const a = { center: [-95.896, 30.0635], footprint: null, parcel: statewide }, b = { center: [-95.896, 30.060], footprint: null, parcel: { propId: '0422450000072', geometry: south } };
  assert.ok(inGeom(b.center, big), 'the second click is inside the first record\'s outline');
  assert.ok(!sameSelection(a, b) && !sameSelection(b, a), 'two accounts are two parcels, whatever their outlines say');
  assert.ok(sameSelection(a, { center: [-95.893, 30.064], footprint: null, parcel: { propId: '0422450000001', geometry: north } }), 'the same account is the same parcel');
  // the line under the click names the account: the statewide record is kept when it is that account, with the line's outline
  const tN = { apn: '0422450000001', owner: 'TERPSTRA PETER S TRUSTEE', address: '30200 WALLER TOMBALL RD', geometry: north }, tS = { apn: '0422450000072', owner: 'DAVIS JERRY LEE', address: '0 STOKES RD', geometry: south };
  const n = withTileParcel(statewide, tN); assert.equal(n.owner, 'TERPSTRA PETER S TRUSTEE'); assert.equal(n.geometry, north, 'the outline drawn on the map, not the 128 acres');
  const s2 = withTileParcel(statewide, tS); assert.equal(s2.propId, '0422450000072'); assert.equal(s2.owner, 'DAVIS JERRY LEE'); assert.equal(s2.situs, '0 STOKES RD'); assert.equal(s2.geometry, south);
  assert.equal(s2.marketValue, undefined, 'another account\'s value is not shown as this one\'s'); assert.equal(s2.other, '0422450000001');
  assert.equal(withTileParcel(statewide, null), statewide, 'no parcel lines on: the record as it was');
  assert.equal(withTileParcel(null, tS).propId, '0422450000072', 'no record found: the line stands in');
  // a record whose number is written another way (Fort Bend: PROP_ID 89418, the map's number its geo id) but the same outline
  const fb = { propId: '89418', raw: { PROP_ID: '89418', GEO_ID: '5410-01-001-0020-914' }, owner: 'PROCTOR', geometry: south };
  assert.equal(withTileParcel(fb, { apn: '5410010010020914', geometry: south }).owner, 'PROCTOR', 'the same parcel by its geo id');
  assert.equal(withTileParcel({ ...fb, raw: {} }, { apn: 'R123', geometry: south }).owner, 'PROCTOR', 'the same parcel by its outline'); }

// ---- 31807 King Ln, Waller (Oct 23): one account (13814) in two separate pieces, two statewide records with the same
// PROP_ID and two parcels drawn on the map. With 31807 Old Washington Rd picked first, the second King Ln piece was taken
// for the first ("same account") and dropped. One account can be several pieces: a piece is the same pick only when the
// click is in its outline, or it is the same parcel line.
{ const P = c => ({ type: 'Polygon', coordinates: [c] });
  const kingA = P([[-95.92123552,30.05394793],[-95.92101297,30.05332978],[-95.92141318,30.05342835],[-95.92141212,30.05369438],[-95.92141094,30.05398865],[-95.92123552,30.05394793]]);
  const kingB = P([[-95.92137475,30.05047667],[-95.92138523,30.05047646],[-95.92141923,30.0519127],[-95.92141536,30.05288134],[-95.92141318,30.05342835],[-95.92101297,30.05332978],[-95.92040066,30.05162901],[-95.92047023,30.05049494],[-95.92137475,30.05047667]]);
  const a = { center: [-95.92126, 30.05363], footprint: null, parcel: { propId: '13814', geometry: kingA } }, bNew = { center: [-95.92098, 30.05175], footprint: null };
  assert.ok(!sameSelection(a, { ...bNew, parcel: { propId: '13814', geometry: kingB } }), 'the other piece of the same account is another pick');
  assert.ok(!sameSelection(a, bNew), 'before it loads: a click outside the first piece is another pick');
  assert.ok(sameSelection(a, { center: [-95.9213, 30.0537], footprint: null, parcel: { propId: '13814', geometry: kingA } }), 'the same piece again is the same pick');
  assert.ok(!sameSelection({ ...a, parcel: { ...a.parcel, tileId: 'uA' } }, { ...bNew, parcel: { propId: '13814', geometry: kingB, tileId: 'uB' } }), 'two parcel lines, two picks');
  assert.ok(sameSelection({ ...a, parcel: { ...a.parcel, tileId: 'uA' } }, { center: [-95.9213, 30.0537], footprint: null, parcel: { propId: '13814', tileId: 'uA' } }), 'the same parcel line, the same pick');
  assert.ok(sameSelection(a, { center: [-95.92125, 30.05362], footprint: null, parcel: { propId: '13814' } }), 'the same account with no outline yet, clicked inside the first piece');
  assert.equal(withTileParcel({ propId: '13814', raw: { PROP_ID: '13814' }, geometry: kingB }, { apn: '13814', uuid: 'uB', geometry: kingB }).tileId, 'uB', 'the parcel line\'s id rides along'); }
console.log('footprint ok');
