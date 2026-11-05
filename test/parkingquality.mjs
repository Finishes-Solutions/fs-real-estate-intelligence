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
console.log('parking quality: ok');
