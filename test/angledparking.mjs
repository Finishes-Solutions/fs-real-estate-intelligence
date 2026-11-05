// Angled parking (lib/siteplan.mjs ANGLED, lib/siteparking.mjs, lib/sitecenter.mjs): 60° and 45° stall rows on one-way
// aisles. The engine's count and the independent validator's count (measured from the stripes as drawn, lib/layoutcheck.mjs
// angledStalls) agree; one-way aisles meet two-way drives at both ends and the stalls lean with the traffic; the words
// ask for it ("angled parking", "60 degree parking", "grocery style parking"); a depth that suits 60° gets it without
// being asked; accessible stalls stay square. Sites are synthetic rectangles, the street on edge 0.
import assert from 'node:assert/strict';
const TURN = await import('../lib/turning.mjs'), S = await import('../lib/siteplan.mjs'), V = await import('../lib/layoutcheck.mjs'), B = await import('../lib/layoutbrief.mjs'), RUN = await import('../lib/layoutrun.mjs'), PK = await import('../lib/siteparking.mjs');

const lot = (w, h) => ({ origin: [-96.42, 30.38], ring: [[0, 0], [w, 0], [w, h], [0, h]], front: 0, streets: [], setbacks: { front: 25, side: 10, rear: 20, paving: 10 }, elements: [] });
const near = (a, b, t = 0.05) => Math.abs(a - b) <= t;

// ---- the table: one sourced set of sizes, the module and the stall's length along the aisle follow from it ----
{
  for (const a of [60, 45]) { const A = S.ANGLED[a], D = S.angledDims(a); assert.equal(A.w, 9); assert.equal(D.module, 2 * A.d + A.aisle); assert.equal(A.module, D.module); assert.ok(near(D.pitch, 9 / Math.sin(a * Math.PI / 180), 1e-9)); assert.ok(near(D.off, A.d / Math.tan(a * Math.PI / 180), 1e-9)); }
  assert.ok(S.ANGLED[60].d >= 19 && S.ANGLED[60].d <= 20 && S.ANGLED[60].aisle >= 16 && S.ANGLED[60].aisle <= 18 && S.ANGLED[60].module >= 55 && S.ANGLED[60].module <= 58, '60°: inside the published ranges');
  assert.ok(S.ANGLED[45].d >= 17 && S.ANGLED[45].d <= 18 && S.ANGLED[45].aisle >= 12 && S.ANGLED[45].aisle <= 14 && S.ANGLED[45].module >= 48 && S.ANGLED[45].module <= 51, '45°: inside the published ranges');
  assert.match(S.ANGLED.source, /Dimensions of Parking/); assert.match(S.ANGLED.source, /ITE/);
}

// ---- one row: the engine's count, the drawn marks and the validator's own measure agree ----
{
  for (const ang of [60, 45]) for (const flow of [1, -1]) for (const rot of [0, 33]) for (const w of [120, 207.5, 400]) {
    const e = { id: 'p', kind: 'parking', x: 50, y: -20, w, d: S.ANGLED[ang].d, rot, row: 1, ang, flow, islands: true, lock: true }, st = S.stalls(e);
    const n = Math.floor((w - st.off + 0.01) / st.pitch); assert.equal(st.n, n); assert.equal(st.count, n - Math.floor(n / 13), 'whole stalls, every thirteenth an island');
    assert.equal(S.stallCentres(e).length, st.count); assert.equal(S.stallLines(e).length, n + 2, 'a stripe either side of every stall and the head line');
    const m = V.angledStalls(e); assert.equal(m.length, st.count, 'the validator measures as many stalls from the stripes (' + ang + '°, ' + w + ' ft, rot ' + rot + ')');
    // every stall a parallelogram with the stall's width square to its stripes, inside the row
    for (const q of S.angledStallPolys(e)) { const [a, b, , d] = q.poly, u = [d[0] - a[0], d[1] - a[1]], L = Math.hypot(...u), gap = Math.abs((b[0] - a[0]) * u[1] - (b[1] - a[1]) * u[0]) / L; assert.ok(near(gap, 9, 0.05), 'a 9 ft stall square to its stripes: ' + gap); assert.ok(near(L, S.ANGLED[ang].d / Math.sin(ang * Math.PI / 180), 0.05)); }
  }
  // the stripes lean with the aisle's traffic: from the aisle edge, forward the way the aisle runs
  for (const flow of [1, -1]) { const e = { kind: 'parking', x: 0, y: 0, w: 200, d: 20, rot: 0, row: 1, ang: 60, flow, islands: false }, [a, h] = S.stallLines(e)[0]; assert.ok(a[1] > h[1], 'the aisle on the +v side'); assert.ok((h[0] - a[0]) * flow > 0, 'leaning with the flow ' + flow); }
  // a square row is unchanged: no slanted stripes, so the validator counts it from its marks as before
  assert.equal(V.angledStalls({ kind: 'parking', x: 0, y: 0, w: 180, d: 18, rot: 0, row: 1, islands: true, caps: true }), null);
}

// ---- accessible stalls: square to the aisle (a 90° row when there is one; else carved square out of an angled run) ----
{
  const ang = { id: 'a', kind: 'parking', x: 0, y: 0, w: 300, d: 20, rot: 0, row: 1, ang: 60, flow: 1, islands: true, lock: true }, sq = { id: 's', kind: 'parking', x: 0, y: -80, w: 180, d: 18, rot: 0, row: 1, islands: true, caps: true, lock: true };
  const bld = { id: 'b', kind: 'building', x: 0, y: 120, w: 200, d: 80, rot: 0, use: 'retail', floors: 1 };
  const A1 = S.accessible({ elements: [ang, sq, bld] }), sqBox = S.corners(sq);
  assert.ok(A1.stalls.length >= 1 && A1.stalls.every(a => a.poly.every(p => p[0] >= sqBox[0][0] - 0.1 && p[0] <= sqBox[1][0] + 0.1 && p[1] >= -89.1 && p[1] <= -70.9)), 'with a square row on the plan, the accessible stalls are in it');
  const A2 = S.accessible({ elements: [ang, bld] }), right = p => { const [a, b, c] = p; return Math.abs((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])) < 1e-6; };
  assert.equal(A2.stalls.length, S.adaCount(S.stalls(ang).count)); assert.ok(A2.stalls.every(a => right(a.poly)), 'only angled rows: the accessible stalls are drawn square');
  assert.ok(A2.stalls.every(a => a.poly.every(p => p[1] <= 10.01 && p[1] >= -10.01)), 'inside the angled row');
  const raw = S.stalls(ang).count; assert.equal(S.adaLossOf([ang], raw), 2 * S.adaLoss(raw), 'and they cost twice the square row\'s share'); assert.equal(S.adaLossOf([ang, sq], raw + S.stalls(sq).count), S.adaLoss(raw + S.stalls(sq).count));
}

// ---- the words: asked for, parsed into the brief, handed to the engine ----
{
  const g = t => S.guessProgram(t).parkAngle;
  assert.equal(g('40,000 sf retail with angled parking'), 'angled'); assert.equal(g('grocery store, grocery-style parking'), 'angled'); assert.equal(g('retail, diagonal parking'), 'angled');
  assert.equal(g('30,000 sf retail, 60 degree parking'), 60); assert.equal(g('retail with 45° parking'), 45); assert.equal(g('sixty degree parking for an office'), 60); assert.equal(g('parking at 45 degrees for a 20,000 sf retail center'), 45);
  assert.equal(g('28,000 sf retail'), undefined); assert.equal(g('a building with a 45 degree corner'), undefined, 'an angle that isn\'t the parking\'s');
  assert.equal(S.normalizeProgram({ use: 'retail' }).parkAngle, undefined, 'not asked: nothing on the program');
  const b = B.briefFromRequest('40,000 sf retail with 60 degree parking', lot(600, 435)); assert.equal(b.program.parking.angle, 60); assert.ok(B.validateBrief(b).ok);
  assert.equal(B.briefFromRequest('40,000 sf retail', lot(600, 435)).program.parking.angle, undefined);
  const bad = JSON.parse(JSON.stringify(b)); bad.program.parking.angle = 30; assert.ok(!B.validateBrief(bad).ok, 'only 60, 45 or angled');
  const ai = JSON.parse(JSON.stringify(B.briefFromRequest('40,000 sf retail', lot(600, 435)))); ai.program.parking.angle = 'angled'; const t = B.toEngine(ai); assert.equal(t.program.parkAngle, 'angled'); assert.ok(t.mapping.some(m => /Angled parking/.test(m)), 'an AI brief\'s angle reaches the engine, and it says so');
}

// ---- a run: angled parking asked for on a retail field, every check passing, counts agreeing, circulation working ----
const runOf = (ask, w, h) => { const p = lot(w, h), rec = RUN.runBrief(B.briefFromRequest(ask, p)); return { p, rec, top: rec.options[0] }; };
const checkAngled = (p, o, label) => {
  const els = o.elements, rows = els.filter(e => e.kind === 'parking' && e.ang), ow = els.filter(e => e.kind === 'drive' && e.oneWay);
  assert.ok(rows.length && ow.length, label + ': angled rows on one-way aisles');
  const v = V.validateLayout({ ...p, elements: els, program: o.program }, null);
  const one = v.checks.find(c => c.id === 'access.one-way'); assert.equal(one.status, 'pass', label + ': ' + JSON.stringify(one.features));
  const fw = v.checks.find(c => c.id === 'access.fire-width'); assert.notEqual(fw.status, 'fail', label + ': fire lanes 20 ft');
  // the engine's count and the validator's own measure, row by row
  for (const e of rows) assert.equal(V.angledStalls(e).length, S.stalls(e).count, label + ': row ' + e.id);
  const angSum = rows.reduce((t, e) => t + S.stalls(e).count, 0), valSum = rows.reduce((t, e) => t + V.angledStalls(e).length, 0); assert.equal(valSum, angSum, label + ': angled stalls, engine and validator'); // (square rows are counted from their marks as before)
  // one-way: flows marked and drawn, neighbouring aisles (in a field) alternating, the rows leaning with them
  assert.ok(S.onewayMarks({ elements: els }).length >= 3 * ow.length, label + ': arrows on every one-way aisle');
  for (const a of ow) { assert.ok(a.flow === 1 || a.flow === -1); assert.ok(TURN.oneWayLane(a) && TURN.fireRoute([a], els).length === 0, label + ': a one-way aisle is no fire lane'); }
  return v;
};
{
  const { p, rec, top } = runOf('40,000 sf retail with angled parking', 600, 435);
  assert.equal(rec.outcome, 'feasible'); assert.equal(top.validation.status, 'pass', JSON.stringify(top.validation.failed));
  assert.ok(top.notes.some(t => /Angled parking: (60|45)° stalls/.test(t) && /As asked/.test(t)), 'the plan says so');
  checkAngled(p, top, 'retail field');
  assert.deepEqual(top.validation.checks.filter(c => !c.hard && c.status === 'fail').map(c => c.id), [], 'no warnings');
  // accessible stalls sit in the square rows along the collectors
  const A = S.accessible({ ...p, elements: top.elements }), sqRows = top.elements.filter(e => e.kind === 'parking' && !e.ang);
  assert.ok(A.stalls.length && A.stalls.every(a => sqRows.some(r => S.inRing(S.centroid(a.poly), S.corners(r)))), 'accessible stalls in a square row');
  // replay: identical
  const again = RUN.runBrief(B.briefFromRequest('40,000 sf retail with angled parking', lot(600, 435)));
  assert.equal(again.rankingHash, rec.rankingHash); assert.equal(again.options[0].geometryHash, top.geometryHash);
  // the plan sheet draws the arrows (and slanted stripes)
  const { planSVG } = await import('../lib/sitesheet.mjs'), svg = planSVG({ ...p, elements: top.elements, program: top.program }, { px: 600 }).svg;
  assert.ok(svg.length > 1000);
  // the map: slanted stripes and the arrows as features
  const fc = S.planFeatures({ ...p, elements: top.elements, program: top.program }, null), arrows = S.onewayMarks({ elements: top.elements }).length;
  assert.ok(fc.features.filter(f => f.properties.k === 'stall').length >= top.elements.filter(e => e.ang).reduce((t, e) => t + S.stalls(e).n + 2, 0), 'every stripe on the map');
  assert.ok(fc.features.filter(f => f.properties.k === 'mark' && f.properties.c === '#ffffff').length >= arrows, 'the arrows on the map');
}

// ---- not asked: a field whose depth suits 60° gets it, and only where it parks what square stalls can't ----
{
  const { p, top } = runOf('30,000 sf retail', 560, 292);
  assert.equal(top.validation.status, 'pass', JSON.stringify(top.validation.failed)); assert.equal(top.quantities.totals.gfa, 30000);
  checkAngled(p, top, 'the 292 ft lot');
  assert.ok(top.notes.some(t => /Angled here because this field’s depth holds more stalls/.test(t)));
  // a deep lot keeps square stalls
  const deep = runOf('30,000 sf retail', 560, 420).top; assert.ok(!deep.elements.some(e => e.ang), 'a deep lot: square stalls');
}

// ---- the validator: a one-way aisle that ends at a curb, or stalls leaning against its traffic, fail ----
{
  const aisle = { id: 'A', kind: 'drive', x: 200, y: 100, w: 300, d: 17, rot: 0, note: '17 ft one-way drive aisle', oneWay: true, flow: 1 };
  const colL = { id: 'L', kind: 'drive', x: 37, y: 100, w: 26, d: 120, rot: 0, note: '26 ft drive' }, colR = { id: 'R', kind: 'drive', x: 363, y: 100, w: 26, d: 120, rot: 0, note: '26 ft drive' };
  const row = flow => ({ id: 'r' + flow, kind: 'parking', x: 200, y: 100 + 8.5 + 10, w: 260, d: 20, rot: 0, row: -1, ang: 60, flow, islands: true, lock: true });
  const ring = [[0, 0], [400, 0], [400, 300], [0, 300]], chk = els => V.validateLayout({ ring, front: 0, elements: els }, null).checks.find(c => c.id === 'access.one-way');
  assert.equal(chk([aisle, colL, colR, row(1)]).status, 'pass');
  assert.equal(chk([aisle, colL, row(1)]).status, 'fail', 'its +end meets no two-way drive');
  assert.match(chk([aisle, colL, colR, row(-1)]).features.join(), /leans against/);
  assert.equal(chk([{ ...aisle, flow: undefined }, colL, colR, row(1)]).status, 'fail', 'no direction marked');
  // and a one-way aisle is never a fire lane: the fire-width check leaves it out even at 17 ft
  assert.equal(V.validateLayout({ ring, front: 0, elements: [aisle, colL, colR, row(1)] }, null).checks.find(c => c.id === 'access.fire-width').status, 'pass');
  assert.equal(PK.fireReach([aisle, { id: 'b', kind: 'building', x: 200, y: 200, w: 100, d: 60, rot: 0 }]).length, 1, 'the engine\'s fire reach doesn\'t count it either');
}

// ---- a square layout laid again at an angle (a grocery-anchored center): same land, one-way aisles, ends at drives ----
{
  const els = [{ id: 'a1', kind: 'drive', x: 200, y: 50, w: 300, d: 24, rot: 0, note: '24 ft drive aisle' }, { id: 'a2', kind: 'drive', x: 200, y: 110, w: 300, d: 24, rot: 0, note: '24 ft drive aisle' },
    { id: 'cl', kind: 'drive', x: 37, y: 80, w: 26, d: 84, rot: 0, note: '26 ft drive' }, { id: 'cr', kind: 'drive', x: 363, y: 80, w: 26, d: 84, rot: 0, note: '26 ft drive' },
    { id: 'r1', kind: 'parking', x: 200, y: 29, w: 252, d: 18, rot: 0, row: 1, islands: true, caps: true, lock: true }, { id: 'r2', kind: 'parking', x: 200, y: 71, w: 252, d: 18, rot: 0, row: -1, islands: true, caps: true, lock: true },
    { id: 'r3', kind: 'parking', x: 200, y: 89, w: 252, d: 18, rot: 0, row: 1, islands: true, caps: true, lock: true }, { id: 'r4', kind: 'parking', x: 200, y: 131, w: 252, d: 18, rot: 0, row: -1, islands: true, caps: true, lock: true }];
  const rs = PK.restripeAngled(els, 60); assert.equal(rs.n, 2); assert.equal(rs.of, 2);
  const out = rs.els, ow = out.filter(e => e.oneWay), rows = out.filter(e => e.kind === 'parking');
  assert.deepEqual(ow.map(e => e.flow), [1, -1], 'neighbouring aisles run opposite ways'); assert.ok(ow.every(e => e.d >= S.ANGLED[60].aisle && near(e.d, 20)), 'the aisle what the deeper rows leave, never under 17 ft');
  assert.ok(rows.every(r => r.ang === 60 && r.d === 20), 'rows at 60°, 20 ft deep');
  for (const [r0, r] of [[els[4], rows[0]], [els[5], rows[1]]]) { const back0 = r0.row > 0 ? r0.y - 9 : r0.y + 9, back = r.row > 0 ? r.y - 10 : r.y + 10; assert.ok(near(back0, back), 'each row\'s back edge where it was'); }
  const ring = [[0, 0], [400, 0], [400, 200], [0, 200]], v = V.validateLayout({ ring, front: 0, elements: out }, null);
  assert.equal(v.checks.find(c => c.id === 'access.one-way').status, 'pass', JSON.stringify(v.checks.find(c => c.id === 'access.one-way').features));
  // an aisle with a curb at one end stays square
  const rs2 = PK.restripeAngled(els.filter(e => e.id !== 'cr'), 60); assert.equal(rs2.n, 0);
  // with land for it, a two-way drive across the open ends lets them turn
  const rs3 = PK.restripeAngled(els.filter(e => e.id !== 'cr').map(e => e.kind === 'parking' ? { ...e, w: 225, x: 186.5 } : e), 60, { clear: () => true }); assert.equal(rs3.n, 2, 'a drive across the open ends'); assert.ok(rs3.els.some(e => e.kind === 'drive' && e.note === '24 ft drive' && !els.includes(e)));
}

// ---- a grocery-anchored center with angled parking: the anchor as asked, its field angled where it parks ----
{
  const { p, top } = runOf('grocery-anchored shopping center with a 40,000 sf grocery anchor, 50,000 sf total, angled parking', 600, 435);
  assert.equal(top.validation.status, 'pass', JSON.stringify(top.validation.failed));
  assert.ok(top.elements.some(e => e.kind === 'building' && e.name === 'Anchor'), 'the anchor');
  checkAngled(p, top, 'anchored center');
  assert.ok(top.notes.some(t => /Angled parking: 60° stalls/.test(t)));
}
console.log('angled parking ok');
