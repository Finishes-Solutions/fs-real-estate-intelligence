// Edit Shape, face drags, parking with a custom outline, Stall direction, Face the building and turn snapping, on the
// owner's Waller site (FM 362 @ Old Houston Hwy: a 1.7-acre quadrilateral turned about 15° off north). Realistic data:
// the building is a bar made an L the way the editor does it (two points added, a corner dragged in), the parking
// piece beside it is the one in the owner's screenshots (72 × 73 ft, Turn 91°, 16 spaces), an earlier try laid over
// the building (124 × 91 ft, 40 spaces, 1 problem), and rows the layout engine made on the same site.
import assert from 'node:assert/strict';
const S = await import('../lib/siteplan.mjs'), T = await import('../lib/sitetools.mjs'), STL = await import('../lib/stalls.mjs'), L = await import('../lib/sitelayout.mjs');
const G = await import('../lib/sitesheet.mjs'), PF = await import('../lib/proforma.mjs'), R = await import('../lib/render.mjs'), GR = await import('../lib/guardrails.mjs');

const TURN = 15, rp = p => S.rotPt(p, TURN), near = (a, b, t = 0.02) => Math.abs(a - b) <= t, clone = o => JSON.parse(JSON.stringify(o));
const angOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI, mod180 = a => ((a % 180) + 180) % 180, sameLine = (a, b, t = 0.05) => { const d = Math.abs(mod180(a) - mod180(b)); return Math.min(d, 180 - d) <= t; };
// a box wholly inside an outline (its edges may lie on it): corners in or on it, no outline corner inside the box, no
// edges crossing. Checked here on its own, not with lib/stalls.mjs's test.
function boxIn(box, poly, tol = 0.06) {
  const onEdge = p => poly.some((a, k) => S.segDist(p, a, poly[(k + 1) % poly.length]) < tol);
  if (!box.every(p => S.inRing(p, poly) || onEdge(p))) return false;
  const c = S.centroid(box), shrink = box.map(p => [p[0] + (c[0] - p[0]) * 0.004, p[1] + (c[1] - p[1]) * 0.004]);
  if (poly.some(p => S.inRing(p, shrink) && !onEdge(p))) return false;
  for (let i = 0; i < 4; i++) for (let k = 0; k < poly.length; k++) if (S.segsCross(shrink[i], shrink[(i + 1) % 4], poly[k], poly[(k + 1) % poly.length])) return false;
  return true;
}
// one edit as the editor makes it: the plan before (Undo), the plan after (Redo); both round trips must be exact
function undoable(plan, fn, what) {
  const before = S.undoState(plan); fn(plan); const after = S.undoState(plan);
  assert.notDeepEqual(after.data, before.data, what + ': changed something');
  S.restoreState(plan, before); assert.deepEqual(S.undoState(plan).data, before.data, what + ': undo puts it back exactly');
  S.restoreState(plan, after); assert.deepEqual(S.undoState(plan).data, after.data, what + ': redo puts it back exactly');
}
const pieceOf = (plan, id) => plan.elements.find(e => e.id === id);

// ---- the site: a quadrilateral on FM 362, about 1.7 acres, turned 15° ----
const ring = [[0, 0], [312, 0], [300, 246], [-10, 238]].map(rp).map(p => p.map(v => +v.toFixed(2)));
assert.ok(near(S.ringArea(ring) / 43560, 1.73, 0.02), 'about 1.7 acres: ' + (S.ringArea(ring) / 43560).toFixed(2));
assert.ok(Math.abs((((S.mainAngle(ring) - TURN) % 90) + 135) % 90 - 45) < 2, 'turned about 15° off north: ' + S.mainAngle(ring));
const C = rp([150, 125]), at = (u, v) => { const q = rp([u, v]); return [+(C[0] + q[0]).toFixed(2), +(C[1] + q[1]).toFixed(2)]; }; // the building's own frame

// ---- the L: a 160 × 160 ft bar given points by Edit Shape and a corner dragged in ----
function lBuilding() {
  const b = { id: 'b1', kind: 'building', use: 'retail', floors: 1, x: at(0, 0)[0], y: at(0, 0)[1], w: 160, d: 160, rot: TURN, name: 'Building 1', pinned: true };
  const o = T.asOutline(b); Object.assign(b, o.set); for (const k of o.drop) delete b[k];
  let r = T.addPoint(b, at(0, -80)); b.poly = r.poly; r = T.addPoint(b, at(80, 10)); b.poly = r.poly; // a point on the front, one on the right side
  const k = b.poly.findIndex(p => Math.hypot(p[0] - at(80, -80)[0], p[1] - at(80, -80)[1]) < 0.5); b.poly[k] = at(0, 10); // the front-right corner dragged in
  const c = S.centroid(b.poly); b.x = +c[0].toFixed(2); b.y = +c[1].toFixed(2); return b;
}
const site = () => ({ id: 'opt1', name: 'Option A', origin: [-95.9286, 30.0573], ring: clone(ring), front: 0, frontGuess: false, setbacks: { ...S.SETBACKS }, program: { use: 'retail' }, elements: [] });
const Lb = lBuilding();
assert.equal(Lb.poly.length, 6, 'an L: six points'); assert.ok(near(S.ringArea(Lb.poly), 18400, 0.5), 'an L of 160 × 160 less the 80 × 90 notch'); assert.equal(Lb.rot, TURN, 'it keeps its turn (its square for snapping)');
assert.ok(!T.selfIntersects(Lb.poly) && S.isFree(Lb), 'a clean custom outline');
const INNER = 1; // its inner face along the notch (point 1 to 2), facing +u
assert.ok(sameLine(angOf(Lb.poly[INNER], Lb.poly[INNER + 1]), TURN + 90) && near(T.faceInfo(Lb.poly, INNER).len, 90, 0.05), 'the inner face: 90 ft, square to the front');

// ---- face drags: a rectangle, the L, a building turned 91°, at odd angles ----
{ // a rectangle as an outline: a face out 12 ft, then in 30, then far in (it stops 8 ft short of the far side)
  const P = S.corners({ x: 0, y: 0, w: 120, d: 100, rot: 0 });
  let r = T.dragFace(P, 1, 12); assert.equal(r.d, 12); assert.ok(near(S.ringArea(r.poly), 132 * 100, 0.5), 'out 12: 132 × 100');
  for (let i = 0; i < 4; i++) { const a = r.poly[i], b = r.poly[(i + 1) % 4], c = r.poly[(i + 2) % 4]; assert.ok(near((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]), 0, 0.5), 'still square at every corner'); }
  r = T.dragFace(P, 1, -30); assert.ok(near(S.ringArea(r.poly), 90 * 100, 0.5), 'in 30: 90 × 100');
  r = T.dragFace(P, 1, -500); assert.ok(r.d > -113 && r.d < -111 && near(S.ringArea(r.poly), 8 * 100, 30), 'dragged right through: stops at the 8 ft minimum: ' + r.d);
  assert.ok(!T.selfIntersects(r.poly), 'never folds over');
}
{ // the L's inner face: in (the notch widens), out (it narrows), and out past the far wing (stops 8 ft short)
  const P = Lb.poly, h = (INNER + 5) % 6, j = INNER + 1, k = j + 1;
  for (const d of [-20, 30]) { const r = T.dragFace(P, INNER, d); assert.equal(r.d, d);
    assert.ok(near(S.ringArea(r.poly), 18400 + d * 90, 0.6), 'area changes by the face × the offset: ' + d);
    assert.ok(sameLine(angOf(r.poly[h], r.poly[INNER]), angOf(P[h], P[INNER])) && sameLine(angOf(r.poly[j], r.poly[k]), angOf(P[j], P[k])), 'the faces either side keep their direction');
    assert.ok(near(T.faceInfo(r.poly, INNER).len, 90, 0.05), 'the face keeps its length (its neighbours are square to it)');
    const mv = (r.poly[INNER][0] - P[INNER][0]) * T.edgeNormal(P, INNER)[0] + (r.poly[INNER][1] - P[INNER][1]) * T.edgeNormal(P, INNER)[1]; assert.ok(near(mv, d, 0.02), 'straight out along its normal');
    assert.equal(r.poly.length, 6); assert.ok(!T.selfIntersects(r.poly)); }
  const r = T.dragFace(P, INNER, 300); assert.ok(near(r.d, 72, 0.1) && near(T.faceInfo(r.poly, j).len, 8, 0.1), 'stops with 8 ft of the inner front face left: ' + r.d);
  assert.ok(!T.selfIntersects(r.poly) && r.poly.length === 6);
  const r2 = T.dragFace(P, 0, -300); assert.ok(r2.d < 0 && Math.min(...[2, 3, 4].map(m => S.segSeg(r2.poly[0], r2.poly[1], r2.poly[m], r2.poly[(m + 1) % 6]))) >= 7.99, 'the left wing pulled in from the front keeps 8 ft to the rest');
}
{ // a building turned 91°: its side (a rectangle) and the same as an outline, dragged by a pointer moving at 37°
  const e = { kind: 'building', x: 50, y: -20, w: 120, d: 80, rot: 91 }, far = T.sideMid(e, 3), n = T.sideNormal(e, 1);
  const move = [Math.cos(37 * Math.PI / 180) * 23, Math.sin(37 * Math.PI / 180) * 23], d = move[0] * n[0] + move[1] * n[1]; // what the editor reads from the drag
  const s = T.dragSide(e, 1, d), e2 = { ...e, ...s }; assert.ok(near(e2.w, 120 + d, 0.01) && near(e2.d, 80), 'the width grows by the pointer\'s move along the normal: ' + d.toFixed(2));
  assert.ok(near(T.sideMid(e2, 3)[0], far[0], 0.02) && near(T.sideMid(e2, 3)[1], far[1], 0.02), 'the opposite side stays put');
  const P = S.outline(e), r = T.dragFace(P, 1, d); assert.ok(near(S.ringArea(r.poly), (120 + d) * 80, 1), 'as an outline: the same');
  assert.ok(sameLine(angOf(r.poly[1], r.poly[2]), angOf(P[1], P[2])) && sameLine(angOf(r.poly[0], r.poly[1]), 91), 'turned 91°: faces keep their turn');
  // a slanted neighbour (a trapezoid): the moved face's ends slide along the slanted sides, which keep their angle
  const Z = [[0, 0], [100, 0], [80, 60], [20, 60]], z = T.dragFace(Z, 2, 15); assert.ok(sameLine(angOf(z.poly[1], z.poly[2]), angOf(Z[1], Z[2])) && sameLine(angOf(z.poly[3], z.poly[0]), angOf(Z[3], Z[0])), 'slanted sides stay slanted');
  assert.ok(near(z.poly[2][1], 75, 0.02) && near(z.poly[2][0], 75, 0.05), 'and the top moved 15 ft up, narrower along the slope');
}

// ---- the owner's parking piece beside the L (72 × 73 ft, Turn 91°, 16 spaces) ----
const planL = () => { const p = site(); p.elements = [clone(Lb), { id: 'p1', kind: 'parking', w: 72, d: 73, rot: 91, x: at(50, -40)[0], y: at(50, -40)[1], pinned: true }]; return p; };
{
  const plan = planL(), pk = pieceOf(plan, 'p1');
  assert.equal(S.stalls(pk).count, 16, 'the screenshot\'s 16 spaces'); assert.equal(S.check(plan).filter(i => i.id === 'p1' && i.level === 'bad').length, 0, 'clear of the building to start');
  // the stalls as they were: the rows run along the parking's 91° turn, nowhere near square to the L (15°)
  const rowsWas = S.stalls(pk).swap ? 1 : 91; assert.ok(!sameLine(rowsWas, TURN + 90, 10), 'before: the rows don\'t run along the inner face');
  // Face the building: the inner face, the stalls square to it, the first row on its side
  const f = T.nearestFace(plan, pk); assert.equal(f.b.id, 'b1'); assert.equal(f.i, INNER, 'the L\'s inner face, the one it runs along');
  undoable(plan, p => { const q = pieceOf(p, 'p1'), r = T.faceBuilding(p, q); Object.assign(q, r.set); }, 'Face the building');
  const q = pieceOf(plan, 'p1'), st = S.stalls(q);
  assert.equal(st.count, 16, 'the same 16 spaces, now facing it');
  const lines = S.stallLines(q), heads = lines.filter(l => Math.hypot(l[1][0] - l[0][0], l[1][1] - l[0][1]) > 20), stripes = lines.filter(l => near(Math.hypot(l[1][0] - l[0][0], l[1][1] - l[0][1]), 18, 0.05));
  assert.ok(heads.length && heads.every(l => sameLine(angOf(...l), TURN + 90, 0.1)), 'the rows (head lines) run along the inner face');
  assert.ok(stripes.length && stripes.every(l => sameLine(angOf(...l), TURN, 0.1)), 'the stripes are square to it: cars pull in toward the building');
  const dist = l => Math.min(...l.map(p => S.segDist(p, f.a, f.q))), nearest = heads.sort((a, b) => dist(a) - dist(b))[0], gap = Math.min(...S.shapeOf(q).map(p => S.segDist(p, f.a, f.q)));
  assert.ok(dist(nearest) - gap < 0.1, 'a row of stalls heads in at the parking\'s edge on the building side, not an aisle');
  assert.ok(gap >= T.FACE_WALK - 0.3, 'a walk\'s width off the face: ' + gap.toFixed(1));
  assert.equal(S.check(plan).filter(i => i.id === 'p1' && i.level === 'bad').length, 0, 'no problem');
  // Stall direction: the rows the other way inside the same outline, and back
  const out0 = JSON.stringify(S.shapeOf(q)); undoable(plan, p => Object.assign(pieceOf(p, 'p1'), T.turnStalls(pieceOf(p, 'p1'))), 'Stall direction');
  const q2 = pieceOf(plan, 'p1'); assert.equal(JSON.stringify(S.shapeOf(q2)), out0, 'the same outline'); assert.notEqual(S.stalls(q2).swap, st.swap, 'the rows turned 90°');
  assert.ok(S.stallLines(q2).filter(l => Math.hypot(l[1][0] - l[0][0], l[1][1] - l[0][1]) > 20).every(l => sameLine(angOf(...l), TURN, 0.1)), 'now along the front');
  Object.assign(q2, T.turnStalls(q2)); assert.equal(S.stalls(q2).swap, st.swap, 'twice: back as it was'); assert.equal(S.stalls(q2).count, 16);
}

// ---- the same parking given a custom outline (Edit Shape: a point added on its side and dragged out) ----
{
  const plan = planL(), pk = pieceOf(plan, 'p1'), was = S.stallCentres(pk);
  undoable(plan, p => { const e = pieceOf(p, 'p1'), o = T.asOutline(e); Object.assign(e, o.set); for (const k of o.drop) delete e[k]; }, 'Edit Shape on parking');
  let e = pieceOf(plan, 'p1'); assert.ok(e.poly?.length === 4 && e.stallAng != null, 'its outline as points; its rows keep their way (stallAng)');
  assert.equal(S.stalls(e).count, 16, 'the same 16 spaces'); assert.ok(was.every(p => S.stallCentres(e).some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.05)), 'in the same places');
  assert.equal(S.stalls({ ...e, rot: 0 }).count, 16, 'a copy turned to 0 (as the layout engine counts) counts the same');
  // a point added on its south side and dragged 40 ft out: a five-sided lot
  const far = T.sideMid({ ...e, w: 72, d: 73, rot: 91, x: e.x, y: e.y }, 3), n = T.sideNormal({ rot: 91 }, 3); // its south side, away from the building
  undoable(plan, p => { const q = pieceOf(p, 'p1'), r = T.addPoint(q, far); q.poly = r.poly; q.poly[r.k] = [+(far[0] + n[0] * 40).toFixed(2), +(far[1] + n[1] * 40).toFixed(2)]; }, 'a point added and dragged'); e = pieceOf(plan, 'p1');
  const f = S.stalls(e).fill, boxes = STL.boxesOf(f).flat();
  assert.ok(f.count > 16, 'more room, more stalls: ' + f.count); assert.equal(S.stalls(e).count, boxes.length);
  for (const b of boxes) { assert.ok(boxIn(b, e.poly), 'no stall crosses the outline'); assert.ok(near(Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1]), 9, 0.02) && near(Math.hypot(b[2][0] - b[1][0], b[2][1] - b[1][1]), 18, 0.02), 'whole 9 × 18 ft stalls'); }
  for (let i = 0; i < boxes.length; i++) for (let k = i + 1; k < boxes.length; k++) assert.ok(!S.rectsOverlap({ poly: boxes[i] }, { poly: boxes[k] }, 0.05), 'no two stalls overlap');
  for (const r of f.rows) { const ab = r.side > 0 ? [r.b, r.b + 24] : [r.a - 24, r.a], put = STL.putOf(f); for (const u of r.us) assert.ok(boxIn([put(u, ab[0]), put(u + 9, ab[0]), put(u + 9, ab[1]), put(u, ab[1])], e.poly), 'its aisle is inside too'); }
  assert.ok(f.rows.some(r => r.side > 0) && f.rows.some(r => r.side < 0), 'double-loaded: rows both sides of an aisle');
  // the count everywhere it's used: metrics, the check, Numbers, the pro forma, the sheet, the DXF, the map, the massing brief, the guardrails
  const m = S.metrics(plan); assert.equal(m.stalls, f.count - S.adaLoss(f.count), 'metrics (Numbers, the check): every stall, less what the accessible pairs\' aisles take');
  assert.equal(PF.metricsOf(plan).stalls, m.stalls, 'the pro forma'); assert.ok(G.sheetData(plan).parking.some(([k, v]) => /Surface stalls/.test(k) && v === String(m.stalls)), 'the PDF sheet\'s table');
  { const sv = G.planSVG(plan), back = G.turned({ ...plan, elements: [e] }, sv.turn).elements[0]; assert.ok((sv.svg.match(/<line /g) || []).length >= S.stallLines(e).length, 'the sheet draws its stripes');
    assert.equal(S.stalls(back).count, f.count, 'turned street-down for the sheet, the same stalls'); assert.ok(sameLine(S.stalls(back).fill.angle + sv.turn, f.angle, 0.01), 'running the same way on the ground'); }
  assert.ok(S.toDXF(plan).includes(f.count + ' SPACES'), 'the DXF says its count');
  assert.equal(S.planFeatures(plan, null).features.filter(x => x.properties.k === 'stall').length, S.stallLines(e).length, 'the map draws every stripe');
  assert.equal(R.briefOf(plan, { metrics: m }).parking, Math.round(m.spaces), 'the 3D / rendering massing brief');
  const wp = { ...plan, params: { guard: { mode: 'on', scenario: 'B' } }, jur: { status: 'city' } }; assert.ok(GR.isOn(wp)); assert.equal(GR.metrics(wp).stalls, m.stalls, 'the Waller guardrails count it: ' + GR.metrics(wp).stalls);
  assert.equal(GR.yields(wp).parkingProvided, GR.metrics(wp).spaces, 'and the scenario\'s parking provided');
  // accessible stalls stay, in the rows nearest the building
  const A = S.accessible(plan), cs = S.stallCentres(e), dB = p => Math.min(...Lb.poly.map((a, k) => S.segDist(p, a, Lb.poly[(k + 1) % Lb.poly.length])));
  assert.equal(A.count, S.adaCount(f.count)); assert.equal(A.stalls.length, A.count, 'every accessible stall placed');
  for (const a of A.stalls) { assert.ok(boxIn(a.poly, e.poly), 'an accessible stall is one of its stalls'); assert.ok(dB(a.sym) <= Math.min(...cs.map(dB)) + 30, 'nearest the building'); }
  // Face the building with a custom outline: turned about its middle, the rows along the inner face, still whole stalls inside
  undoable(plan, p => { const q = pieceOf(p, 'p1'); Object.assign(q, T.faceBuilding(p, q).set); }, 'Face the building (custom outline)'); e = pieceOf(plan, 'p1');
  const g = S.stalls(e).fill; assert.ok(sameLine(g.angle, TURN + 90, 0.01), 'rows along the inner face: ' + g.angle);
  assert.ok(near(S.ringArea(e.poly), S.ringArea(T.asOutline({ ...e }).set.poly), 0.5), 'its outline only turned');
  for (const b of STL.boxesOf(g).flat()) assert.ok(boxIn(b, e.poly), 'turned: still no stall across the outline');
  assert.equal(S.check(plan).filter(i => i.id === 'p1' && i.level === 'bad').length, 0);
  // Stall direction on the custom outline: 90° the other way, still inside
  undoable(plan, p => Object.assign(pieceOf(p, 'p1'), T.turnStalls(pieceOf(p, 'p1'))), 'Stall direction (custom outline)'); e = pieceOf(plan, 'p1');
  const h = S.stalls(e).fill; assert.ok(sameLine(h.angle, TURN, 0.01)); for (const b of STL.boxesOf(h).flat()) assert.ok(boxIn(b, e.poly));
  // a face of the parking dragged in: the stalls refill (fewer), never across the new outline
  const n0 = S.stalls(e).count; undoable(plan, p => { const q = pieceOf(p, 'p1'); q.poly = T.dragFace(q.poly, 0, -20).poly; }, 'a parking face dragged in'); e = pieceOf(plan, 'p1');
  assert.ok(S.stalls(e).count < n0, 'fewer stalls: ' + S.stalls(e).count + ' < ' + n0); for (const b of STL.boxesOf(S.stalls(e).fill).flat()) assert.ok(boxIn(b, e.poly));
}

// ---- the earlier try: 124 × 91 ft, Turn 91°, 40 spaces, laid over the building (1 problem) ----
{
  const plan = site(); plan.elements = [clone(Lb), { id: 'p2', kind: 'parking', w: 124, d: 91, rot: 91, x: at(30, -30)[0], y: at(30, -30)[1], pinned: true }];
  const pk = pieceOf(plan, 'p2'); assert.equal(S.stalls(pk).count, 40, 'the screenshot\'s 40 spaces');
  assert.equal(S.check(plan).filter(i => /overlaps/.test(i.text)).length, 1, '1 problem: it overlaps the building');
  Object.assign(pk, T.faceBuilding(plan, pk).set);
  assert.equal(S.check(plan).filter(i => /overlaps/.test(i.text)).length, 0, 'Face the building moves it off, a walk\'s width away');
  assert.ok(S.gapBetween(S.shapeOf(pk), Lb.poly) >= T.FACE_WALK - 0.5, 'the walk kept: ' + S.gapBetween(S.shapeOf(pk), Lb.poly).toFixed(1));
}

// ---- rows the layout engine made on this site: Edit Shape, Stall direction, turning ----
{
  const pl0 = site(), o = L.layoutOptions(pl0, { use: 'retail', gfa: 18000 }, { count: 1 })[0], plan = { ...pl0, elements: o.elements, program: o.program, recipe: o.recipe };
  const rows = plan.elements.filter(e => e.kind === 'parking' && !e.rv && S.stalls(e).count >= 8); assert.ok(rows.length, 'the engine parked it');
  for (const r of rows) {
    const n = S.stalls(r).count, sw = S.stalls(r).swap, t = T.turnStalls(r), x = { ...r, ...t }; assert.notEqual(S.stalls(x).swap, sw, 'Stall direction on an engine row');
    assert.equal(S.stalls({ ...x, ...T.turnStalls(x) }).count, n, 'and back: the engine\'s count');
    const o2 = T.asOutline(r), y = { ...r, ...o2.set }; for (const k of o2.drop) delete y[k];
    assert.ok(S.stalls(y).count >= n - (r.caps ? 2 : 0) * S.stalls(r).rows.length, 'as a custom outline it keeps its stalls (' + S.stalls(y).count + ' of ' + n + ')');
    for (const b of STL.boxesOf(S.stalls(y).fill).flat()) assert.ok(boxIn(b, y.poly));
  }
  const before = S.metrics(plan).stalls; assert.equal(S.metrics({ ...plan, elements: plan.elements.map(e => ({ ...e })) }).stalls, before, 'a plan with no custom parking counts exactly as before');
}

// ---- turning: Shift snaps to 15° steps; otherwise free, settling within 2° of the street, the site and the buildings ----
{
  const plan = planL(); plan.elements.push({ id: 'b2', kind: 'building', use: 'restaurant', name: 'Pad A', floors: 1, w: 50, d: 44, rot: 40, x: at(-40, -150)[0], y: at(-40, -150)[1] }); // a pad set at 40°
  const pk = pieceOf(plan, 'p1'), tg = T.turnTargets(plan, pk);
  assert.ok(tg.some(t => t.what === 'the street') && tg.some(t => t.what === 'Pad A') && !tg.some(t => t.what === 'Building 1'), 'targets: the street, and the pad (the L is square to the street already: one line, not two)');
  { const s = T.snapTurn(41.6, tg); assert.equal(s.r, 40); assert.equal(s.snap.what, 'Pad A', 'within 2° of the pad: exactly square to it'); }
  assert.equal(T.snapTurn(44.3, tg, { shift: true }).r, 45, 'Shift: 45°'); assert.equal(T.snapTurn(92.1, tg, { shift: true }).r, 90, 'Shift: 90°');
  for (const r of [7.4, 22.6, 61, 133, 359.2]) assert.equal(T.snapTurn(r, [], { shift: true }).r % 15, 0, 'Shift: a 15° step from ' + r);
  assert.equal(T.snapTurn(-29, [], { shift: true }).r, 330, 'and round the circle');
  const free = T.snapTurn(37.4, tg); assert.equal(free.r, 37); assert.equal(free.snap, null, 'free to the degree away from anything');
  const s1 = T.snapTurn(13.6, tg); assert.equal(s1.r, 15); assert.ok(s1.snap && ['the street', 'the site edge', 'Building 1'].includes(s1.snap.what), 'within 2° of the street\'s 15°: exactly 15 (' + s1.snap.what + ')');
  assert.equal(T.snapTurn(103.9, tg).r, 105, 'square to the street (90° to it) too');
  assert.equal(T.snapTurn(22, tg).snap, null, '4° off anything: left alone'); assert.equal(T.snapTurn(22, tg).r, 22);
  { const s = T.snapTurn(16.7, tg); assert.equal(s.snap?.what, 'the site edge', 'a slanted site edge (16.5°) is a target too'); assert.ok(near(s.r, 16.48, 0.01)); }
  // the Turn field: typed degrees, any number (a custom outline turns about its middle); Shift with its arrows: 15° steps
  assert.equal(T.turnStep(37, true), 45); assert.equal(T.turnStep(45, true), 60); assert.equal(T.turnStep(45, false), 30); assert.equal(T.turnStep(0, false), 345); assert.equal(T.turnStep(91, false), 90);
  const q = { ...Lb, stallAng: 10 }, t = T.turnPiece(q, 52.5), c0 = S.centroid(Lb.poly), c1 = S.centroid(t.poly);
  assert.equal(t.rot, 52.5); assert.ok(near(S.ringArea(t.poly), S.ringArea(Lb.poly), 0.5) && near(c0[0], c1[0], 0.05) && near(c0[1], c1[1], 0.05), 'turned about its middle, the same size');
  assert.ok(near(t.stallAng, 10 + 52.5 - TURN, 0.01), 'its stall rows turn with it');
  assert.equal(T.turnPiece({ rot: 10 }, -15).rot, 345); assert.equal(T.turnPiece({ rot: 10 }, 725).rot, 5);
  undoable(plan, p => Object.assign(pieceOf(p, 'p1'), T.turnPiece(pieceOf(p, 'p1'), T.snapTurn(44.3, tg, { shift: true }).r)), 'a Shift turn');
  assert.equal(pieceOf(plan, 'p1').rot, 45);
}

// ---- Shift on a point: whole feet, square and 45° corners ----
{
  const P = [[0, 0], [100, 0], [100, 60], [0, 60]];
  let s = T.snapPoint(P, 2, [103.4, 57.2], 0); assert.deepEqual(s.q, [100, 60], 'nearly square both ways: exactly the corner'); assert.ok(s.square);
  s = T.snapPoint(P, 2, [100.9, 71.6], 0); assert.ok(near(s.q[0], 100, 0.01) && Number.isInteger(s.q[1]), 'along the side, whole feet: ' + s.q);
  s = T.snapPoint([[0, 0], [100, 0], [130, 30], [0, 60]], 2, [131.2, 29.1], 0); assert.ok(near(s.q[0] - 100, s.q[1], 0.02), '45° from its neighbour: ' + s.q);
  // on the L, turned 15°: a corner dragged near its old place comes back square, in the building's own frame
  const k = 3, Q = Lb.poly.slice(), off = [Q[k][0] + 2.5, Q[k][1] - 1.7], s2 = T.snapPoint(Q, k, off, TURN); assert.ok(Math.hypot(s2.q[0] - Q[k][0], s2.q[1] - Q[k][1]) < 0.05, 'square in its own 15° frame');
}

// ---- hit-testing a turned piece: in and out by its outline, not its box ----
{
  const e = { kind: 'parking', x: 0, y: 0, w: 120, d: 30, rot: 45 }; assert.ok(S.hitRect(e, [30, 30]) && !S.hitRect(e, [40, -20]), 'a turned rectangle');
  const p = { ...e, poly: S.outline(e) }; assert.ok(S.hitRect(p, [30, 30]) && !S.hitRect(p, [40, -20]), 'the same as an outline');
  assert.ok(S.hitRect(Lb, at(-40, 40)) && !S.hitRect(Lb, at(40, -40)), 'the L: in its wing, not in its notch');
}
console.log('editshapes ok: face drags, custom parking, Face the building, Stall direction, turn snapping');
