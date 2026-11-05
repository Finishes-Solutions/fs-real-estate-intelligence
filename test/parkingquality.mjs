// Parking layout quality (docs/LAYOUT-ENGINE.md item 25): long dead-end parking aisles get a turnaround
// (lib/layoutrun.mjs longDeadAisles / aisleTurnarounds) and the independent validator warns on them
// (lib/layoutcheck.mjs parking.dead-end-aisle); stall rows end in planted islands where the parking can spare it
// (rowEndIslands); scripts/parking-metrics.mjs measures both. Synthetic sites, the street on edge 0.
import assert from 'node:assert/strict';
const S = await import('../lib/siteplan.mjs'), V = await import('../lib/layoutcheck.mjs'), B = await import('../lib/layoutbrief.mjs'), RUN = await import('../lib/layoutrun.mjs'), PM = await import('../scripts/parking-metrics.mjs');

const SB = { front: 25, side: 10, rear: 20, paving: 10 };
const lot = (w, h) => ({ origin: [-96.42, 30.38], ring: [[0, 0], [w, 0], [w, h], [0, h]], front: 0, streets: [], setbacks: { ...SB } });
// one double-loaded aisle (x0..x1 at y 150), the way in from the street near its left end, a retail building behind:
// the stalls run on ~500 ft past the driveway with no way out at the right
function oneAisle(x0, x1, { rowTo = x1, per1000 = 4 } = {}) {
  const p = lot(900, 420), L = rowTo - (x0 + 40), n = Math.floor(L / 9), w = n * 9, xc = x0 + 40 + w / 2;
  const els = [
    { id: 'aisle', kind: 'drive', x: (x0 + x1) / 2, y: 150, w: x1 - x0, d: 24, rot: 0, name: '', note: '24 ft drive aisle' },
    { id: 'entry', kind: 'drive', x: x0 + 15, y: 69, w: 30, d: 138, rot: 0, name: 'Main entry', note: '30 ft driveway', entry: true },
    { id: 'rowS', kind: 'parking', x: xc, y: 129, w, d: 18, rot: 0, row: 1, lock: true, islands: true, caps: false },
    { id: 'rowN', kind: 'parking', x: xc, y: 171, w, d: 18, rot: 0, row: -1, lock: true, islands: true, caps: false },
    { id: 'shop', kind: 'building', x: 450, y: 260, w: 300, d: 100, rot: 0, use: 'retail', floors: 1 }
  ];
  const brief = B.canonicalBrief(B.briefFromRequest('30,000 sf retail', { ...p, elements: [] }));
  brief.rules.values.parkingPer1000 = { v: per1000, cls: 'assumption', source: 'test' };
  return { plan: p, els, brief };
}
const check = (plan, els, brief) => V.validateLayout({ ...plan, elements: els, program: { use: 'retail' } }, brief);
const dead = v => v.checks.find(c => c.id === 'parking.dead-end-aisle');
const pk = (plan, els, brief) => V.quantities({ ...plan, elements: els, program: { use: 'retail' } }, brief).parking;

// ---- the validator warns on a long dead end, measures it, and never makes it a hard failure ----
{
  const { plan, els, brief } = oneAisle(60, 820, { rowTo: 815 }), v = check(plan, els, brief), c = dead(v);
  assert.equal(c.status, 'fail'); assert.equal(c.hard, false, 'a warning, not a failure');
  assert.ok(c.measured > 600 && c.measured < 760, 'stalls past the driveway: ' + c.measured);
  assert.equal(RUN.longDeadAisles(els).length, 1, 'the engine finds the same dead end');
  // a short dead end passes; a drive joining the far end passes; the driveway itself is never judged
  const short = oneAisle(60, 220, { rowTo: 215 }); assert.equal(dead(check(short.plan, short.els, short.brief)).status, 'pass');
  const joined = els.concat([{ id: 'link', kind: 'drive', x: 832, y: 200, w: 26, d: 124, rot: 0, name: '', note: '26 ft drive' }]);
  assert.equal(dead(check(plan, joined, brief)).status, 'pass', 'a drive at the far end is a way out');
  // the end of the aisle left clear of stalls for 18 ft is not a turnaround (24 ft is too narrow to turn in)
  const clear = oneAisle(60, 820, { rowTo: 800 }); assert.equal(dead(check(clear.plan, clear.els, clear.brief)).status, 'fail');
}

// ---- a turnaround past the rows where there's land: no stall lost ----
{
  const { plan, els, brief } = oneAisle(60, 820, { rowTo: 815 }), p0 = pk(plan, els, brief), o = RUN.aisleTurnarounds(plan, { elements: els, program: { use: 'retail' } }, brief);
  const pads = o.elements.filter(e => e.turn); assert.equal(pads.length, 1, 'one pad at the dead end');
  const t = pads[0]; assert.equal(t.kind, 'field'); assert.ok(t.x - t.w / 2 >= 815 - 0.5, 'past the rows'); assert.ok(t.d >= 60 - 0.01 && t.w >= RUN.TURN_PAD - 0.01, 'across the aisle and both rows, ' + RUN.TURN_PAD + ' ft along');
  assert.equal(pk(plan, o.elements, brief).provided, p0.provided, 'no stall lost');
  const v = check(plan, o.elements, brief); assert.equal(dead(v).status, 'pass'); assert.equal(v.status, 'pass', v.failed.join(', '));
  assert.ok(!v.checks.some(c => !c.hard && c.status === 'fail' && c.id.startsWith('access')), 'no access warnings');
  assert.equal(RUN.longDeadAisles(o.elements).length, 0);
}

// ---- boxed in by the paving setback: the last stalls give way, only while the parking still meets what's required ----
{
  const { plan, els, brief } = oneAisle(60, 880, { rowTo: 880 }), p0 = pk(plan, els, brief);
  const o = RUN.aisleTurnarounds(plan, { elements: els, program: { use: 'retail' } }, brief), p1 = pk(plan, o.elements, brief);
  assert.equal(o.elements.filter(e => e.turn).length, 1); assert.ok(p1.provided < p0.provided && p1.provided >= p1.required, 'stalls at the end gave way: ' + p0.provided + ' -> ' + p1.provided);
  for (const r of o.elements.filter(e => e.kind === 'parking')) assert.ok(r.x + r.w / 2 <= 880 - RUN.TURN_PAD + 0.5, 'rows stop short of the pad');
  assert.equal(dead(check(plan, o.elements, brief)).status, 'pass');
  // no stalls to spare: left as it was (and the validator still warns)
  const tight = oneAisle(60, 880, { rowTo: 880 }), need = pk(tight.plan, tight.els, tight.brief).provided;
  tight.brief.rules.values.parkingPer1000 = { v: need / 30, cls: 'assumption', source: 'test' };
  const o2 = RUN.aisleTurnarounds(tight.plan, { elements: tight.els, program: { use: 'retail' } }, tight.brief); assert.equal(o2.elements, tight.els);
}

// ---- row-end islands: from the stalls to spare, longest rows first, never below what's required ----
{
  const { plan, els, brief } = oneAisle(60, 220, { rowTo: 215, per1000: 0.5 }), p0 = pk(plan, els, brief);
  const o = RUN.rowEndIslands(plan, { elements: els, program: { use: 'retail' } }, brief), p1 = pk(plan, o.elements, brief);
  const rows = o.elements.filter(e => e.kind === 'parking'); assert.ok(rows.every(r => r.caps === 'square'), 'both rows end in planted islands');
  assert.equal(p1.provided, p0.provided - 4, 'the end stall each end of each row'); assert.ok(p1.provided >= p1.required);
  assert.equal(S.capsOf(rows[0]).length, 2, 'drawn: a planted island each end');
  // only one row's worth to spare: one row
  brief.rules.values.parkingPer1000 = { v: (p0.provided - 2) / 30, cls: 'assumption', source: 'test' };
  const o2 = RUN.rowEndIslands(plan, { elements: els, program: { use: 'retail' } }, brief);
  assert.equal(o2.elements.filter(e => e.kind === 'parking' && e.caps).length, 1); assert.ok(pk(plan, o2.elements, brief).provided >= pk(plan, o2.elements, brief).required);
  // the metrics see it
  const m0 = PM.parkingMetrics({ ...plan, elements: els }), m1 = PM.parkingMetrics({ ...plan, elements: o.elements });
  assert.equal(m0.bareEnds, 4); assert.equal(m1.bareEnds, 0); assert.ok(m1.maxRun <= 12, 'an island every 13th stall still');
}

// ---- the metrics: dead ends and walking ----
{
  const { plan, els } = oneAisle(60, 820, { rowTo: 815 }), m = PM.parkingMetrics({ ...plan, elements: els });
  assert.equal(m.deadEnd150, 1); assert.ok(m.walkMax > m.walkMed && m.walkMed > 0); assert.equal(m.tiny, 0); assert.equal(m.skew, 0); assert.equal(m.orphan, 0);
  assert.ok(m.sfStall > 250 && m.sfStall < 450, 'lot paving a stall: ' + m.sfStall);
}
// ---- round 2 (docs/LAYOUT-ENGINE.md item 28) ----
// the engine's stall count and the drawn marks agree on every square row, end caps and 13th-stall islands included
// (a row of 13n stalls with caps: its last island is its end cap, counted once)
for (let n = 1; n <= 60; n++) for (const caps of [false, true, 'square']) for (const islands of [false, true]) {
  const e = { kind: 'parking', x: 0, y: 0, w: n * 9, d: 18, rot: 0, row: 1, lock: true, caps, islands };
  assert.equal(S.stalls(e).count, S.stallCentres(e).length, 'n ' + n + ' caps ' + caps + ' islands ' + islands);
  assert.equal(S.rowStallCount(n, islands, caps), S.stallCentres(e).length);
}
assert.equal(S.rowStallCount(13, true, 'square'), 11); assert.equal(S.rowStallCount(26, true, 'square'), 23); assert.equal(S.rowStallCount(26, true, false), 24);
// row-end islands on free land at no cost: parking exactly met, both ends free -> the rows grow a stall each end, planted
{
  const t = oneAisle(60, 240, { rowTo: 190 }), need = pk(t.plan, t.els, t.brief).provided;
  t.brief.rules.values.parkingPer1000 = { v: need / 30, cls: 'assumption', source: 'test' };
  assert.equal(RUN.rowEndIslands(t.plan, { elements: t.els, program: { use: 'retail' } }, t.brief).elements, t.els, 'no stalls to spare');
  const o = RUN.growEndIslands(t.plan, { elements: t.els, program: { use: 'retail' } }, t.brief), rows = o.elements.filter(e => e.kind === 'parking');
  assert.ok(rows.length === 2 && rows.every(r => r.caps === 'square' && r.w === 90 + 18), 'grown a stall each end, capped');
  assert.equal(pk(t.plan, o.elements, t.brief).provided, need, 'no stall lost');
  rows.forEach((r, i) => { const was = t.els.find(e => e.id === r.id); assert.equal(r.x, was.x); assert.deepEqual(S.stallCentres(r).map(c => c.map(Math.round)), S.stallCentres(was).map(c => c.map(Math.round)), 'the stalls stay where they were ' + i); });
  assert.equal(PM.parkingMetrics({ ...t.plan, elements: t.els }).bareEnds, 4); assert.equal(PM.parkingMetrics({ ...t.plan, elements: o.elements }).bareEnds, 0);
  const v = check(t.plan, o.elements, t.brief), v0 = check(t.plan, t.els, t.brief); assert.deepEqual(v.failed, v0.failed, 'no check worse'); assert.ok(S.deadEnds(o.elements, 1).length <= S.deadEnds(t.els, 1).length);
  // one end blocked by a drive across the rows' start: they grow two stalls the other way, the stalls one along, the new end
  // stall on the aisle
  const blk = { id: 'blk', kind: 'drive', x: 95, y: 150, w: 9.4, d: 80, rot: 0, name: '', note: '24 ft drive' }, els2 = t.els.concat([blk]);
  const o2 = RUN.growEndIslands(t.plan, { elements: els2, program: { use: 'retail' } }, t.brief), r2 = o2.elements.filter(e => e.kind === 'parking');
  assert.ok(r2.every(r => r.caps === 'square' && Math.abs(r.x - (145 + 9)) < 0.01), 'shifted one stall toward the free end');
  assert.equal(pk(t.plan, o2.elements, t.brief).provided, need);
  // no land at either end (the paving setback and the drive): left as it was
  const tight = oneAisle(60, 880, { rowTo: 880 }); assert.equal(RUN.growEndIslands(tight.plan, { elements: tight.els.concat([{ ...blk, x: 95 }]), program: { use: 'retail' } }, tight.brief).elements.filter(e => e.caps).length, 0);
}
// the dead-end rule, one rule for the engine and the validator: an end clear of stalls for 18 ft (a hammerhead) is a way
// out on a short aisle; 16 ft is not; and on an aisle whose stalls run past 150 ft only a paved turnaround or a drive is
{
  const into = t => ({ ...t, els: t.els.map(e => e.id === 'entry' ? { ...e, y: 75, d: 150 } : e) }); // (the driveway into the aisle, not just to its edge)
  const h16 = into(oneAisle(60, 215, { rowTo: 199 })), h18 = into(oneAisle(60, 217, { rowTo: 199 })), lng = into(oneAisle(60, 820, { rowTo: 800 }));
  assert.equal(S.deadEnds(h16.els, 1).length, 1, '16 ft clear: still a dead end'); assert.equal(S.deadEnds(h18.els, 1).length, 0, '18 ft clear: a hammerhead');
  assert.ok(S.deadEnds(lng.els, 1).length >= 1, 'a long aisle needs a turnaround'); assert.equal(RUN.longDeadAisles(lng.els).length, 1); assert.equal(dead(check(lng.plan, lng.els, lng.brief)).status, 'fail');
  assert.equal(RUN.DEAD_AISLE, S.DEAD_AISLE_FT);
}
// an entrance's throat: stalls backing into the entry drive near the street are found (and the metrics count them), and
// taken out where the parking can spare them, the count kept by stalls along a drive nearer the building
{
  const p = lot(600, 420), els = [
    { id: 'entry', kind: 'drive', x: 75, y: 31, w: 30, d: 62, rot: 0, name: 'Main entry', note: '30 ft driveway', entry: true },
    { id: 'cross', kind: 'drive', x: 280, y: 61, w: 520, d: 24, rot: 0, name: '', note: '24 ft drive aisle' },
    { id: 'front', kind: 'parking', x: 153.5, y: 40, w: 117, d: 18, rot: 0, row: 1, lock: true, islands: true, caps: false },
    { id: 'back', kind: 'parking', x: 300, y: 82, w: 450, d: 18, rot: 0, row: -1, lock: true, islands: true, caps: false },
    { id: 'link', kind: 'drive', x: 528, y: 218, w: 24, d: 290, rot: 0, name: '', note: '24 ft drive' },
    { id: 'far', kind: 'parking', x: 400, y: 330, w: 180, d: 18, rot: 0, row: 1, lock: true, islands: true, caps: false },
    { id: 'farA', kind: 'drive', x: 400, y: 351, w: 280, d: 24, rot: 0, name: '', note: '24 ft drive aisle' },
    { id: 'shop', kind: 'building', x: 260, y: 190, w: 300, d: 80, rot: 0, use: 'retail', floors: 1 }
  ];
  const brief = B.canonicalBrief(B.briefFromRequest('24,000 sf retail', { ...p, elements: [] }));
  const th = RUN.entryThroats(p, els, RUN.throatNeed(100)); assert.equal(th.length, 1); assert.ok(th[0].stalls.length >= 3 && th[0].first < 50, 'stalls inside 50 ft of the street: ' + th[0].stalls.length + ' from ' + th[0].first + ' ft');
  assert.equal(RUN.throatNeed(150), 50); assert.equal(RUN.throatNeed(250), 75); assert.equal(RUN.throatNeed(600), 100);
  const m = PM.parkingMetrics({ ...p, elements: els }); assert.equal(m.entryStalls, th[0].stalls.length); assert.equal(m.throatNeed, 50);
  const n0 = pk(p, els, brief).provided; brief.rules.values.parkingPer1000 = { v: (n0 - 8) / 24, cls: 'assumption', source: 'test' };
  const o = RUN.rowsAlongDrives(p, { elements: els, program: { use: 'retail' } }, brief), p1 = pk(p, o.elements, brief);
  assert.notEqual(o.elements, els, 'changed'); assert.ok(p1.provided >= p1.required, p1.provided + ' for ' + p1.required);
  assert.equal(RUN.entryThroats(p, o.elements, RUN.throatNeed(100))[0].stalls.length, 0, 'the throat clear');
  assert.ok(PM.parkingMetrics({ ...p, elements: o.elements }).walk90 <= m.walk90, 'no farther to walk');
}
// the jurisdiction's parking rule governs: a plan under the Waller guardrails (Ord. 424: two spaces a home, the 5% count
// reserve) is laid out to 2.1 a home and judged against it; a layout parked at the engine's 1.6 fails the count
{
  const plan = { origin: [-95.93, 30.06], ring: [[0, 0], [900, 0], [900, 500], [0, 500]], front: 0, streets: [], setbacks: { ...SB }, elements: [], params: { guard: { mode: 'on' } } };
  const ask = '120 garden apartments, 3 stories', prog = S.guessProgram(ask);
  const b = RUN.governingParking(B.briefFromProgram(prog, plan, { text: ask, parser: 'app' }), plan, prog), cb = B.canonicalBrief(b);
  assert.equal(b.rules.values.parkingPerUnit.v, 2.1); assert.equal(b.rules.values.parkingPerUnit.cls, 'verified');
  const off = RUN.governingParking(B.briefFromProgram(prog, { ...plan, params: {} }, { text: ask, parser: 'app' }), { ...plan, params: {} }, prog); assert.equal(off.rules.values.parkingPerUnit.v, null, 'guardrails off: the engine default');
  const r = RUN.runPlan(plan, prog, {}, { ask }); assert.ok(r.options.length);
  for (const o of r.options) { const q = V.quantities({ ...plan, elements: o.elements, program: o.program }, cb).parking; assert.equal(q.required, 252); assert.ok(q.provided >= 252, o.name + ': ' + q.provided); assert.equal(o.check.status, 'pass'); }
  const r0 = RUN.runPlan({ ...plan, params: {} }, prog, {}, { ask }), short = r0.options.find(o => V.quantities({ ...plan, elements: o.elements, program: o.program }, cb).parking.provided < 252);
  if (short) { const v = V.validateLayout({ ...plan, elements: short.elements, program: short.program }, cb); assert.equal(v.checks.find(c => c.id === 'parking.count').status, 'fail', 'parked at 1.6 a home: short of the city’s count'); }
}
console.log('parking quality: ok');
