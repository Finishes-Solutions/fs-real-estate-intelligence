// Choosing between layouts (lib/planpick.mjs): the checks pill, the engine's notes by severity, Phase 1 headlines on real
// engine output (200 apartments on a big site fill it as Phase 2), the recommended layout and badges, what differs,
// identical layouts folded together, sort orders (failing ones last) and the AI's words with layout names.
import assert from 'node:assert/strict';
import * as K from '../lib/planpick.mjs';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs');

// ---- the checks pill: the same levels as the overview ----
assert.deepEqual(K.checksOf([{ level: 'bad' }, { level: 'warn' }, { level: 'bad' }], { gfa: 1, spaces: 10, required: 89 }), { bad: 2, short: 79 });
assert.deepEqual(K.checkLabel({ bad: 0, short: 0 }), { level: 'ok', text: 'Passes' });
assert.deepEqual(K.checkLabel({ bad: 0, short: 79 }), { level: 'bad', text: 'Parking short 79' });
assert.deepEqual(K.checkLabel({ bad: 1, short: 79 }), { level: 'bad', text: '2 problems' });
assert.deepEqual(K.checkLabel({ bad: 1, short: 0 }), { level: 'bad', text: '1 problem' });
assert.equal(K.checkLabel({ bad: null, short: 0 }).level, 'na'); // numbers only, never checked
assert.equal(K.passes({ bad: 0, short: 0 }), true); assert.equal(K.passes({ bad: 0, short: 3 }), false); assert.equal(K.passes({ bad: null, short: 0 }), null);

// ---- notes by severity (unknown → info, never a warning) ----
const lv = t => K.noteLevel(t);
assert.equal(lv('Parking is 79 spaces short of 93.'), 'bad');
assert.equal(lv('The program needs about 12.9 acres; it was scaled to fit 4.7.'), 'bad');
assert.equal(lv('Townhomes: 11 units didn’t fit.'), 'bad');
assert.equal(lv('Fits about 160 of the 200 units asked for.'), 'bad');
assert.equal(lv('room for 2 of the 3 buildings asked for'), 'bad');
assert.equal(lv('Mark the side street (Side Street, then its lot line) to add the pull-through drive.'), 'warn');
assert.equal(lv('Detention holds about 60% of the 3.1 acre-feet needed; plan on underground storage for the rest.'), 'warn');
assert.equal(lv('Stormwater sized for the 2.0 developed acres; later phases add their own.'), 'info');
assert.equal(lv('Stormwater: about 2.1 acre-feet of underground detention under the parking.'), 'info');
assert.equal(lv('Phase 1 is what was asked for: 7 buildings, 216 units. The rest of the site holds 31 more (997 units) as Phase 2, so no land is left over.'), 'info');
assert.equal(lv('3.2 acres are left for a future phase.'), 'info');
assert.equal(lv('Something the engine says that no rule knows'), 'info');
assert.deepEqual(K.byLevel(['Stormwater sized for the 2.0 developed acres.', 'Parking is 3 spaces short of 93.', 'Add the pull-through drive.']).map(n => n.level), ['bad', 'warn', 'info']);
const sp = K.splitNotes([['A', 'B'], ['A', 'C'], ['A']]); assert.deepEqual(sp.shared, ['A']); assert.deepEqual(sp.own, [['B'], ['C'], []]);
assert.deepEqual(K.splitNotes([['A']]).shared, []); // one layout: nothing is "shared"
assert.deepEqual(K.splitNotes([['A', 'A', 'B'], ['A', 'B']]), { shared: ['A', 'B'], own: [[], []] }); // the same note twice shows once
assert.deepEqual(K.acreageGap(['x', 'The program needs about 10.2 acres; it was scaled to fit 4.7.']), { need: 10.2, site: 4.7 });
assert.equal(K.acreageGap(['Parking is short']), null);

// ---- Phase 1 first, on real engine output: 200 apartments on a big site, the rest filled as Phase 2 ----
const mk = (o, pts) => { const k = 364567 * Math.cos(o[1] * Math.PI / 180); return { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(([x, y]) => [o[0] + x / k, o[1] + y / 364567])] }; };
const big = S.unionParcels([mk([-95.98, 30.06], [[0, 0], [1400, 0], [1400, 1350], [0, 1350]])]), plan = { ...big, front: 0, setbacks: { ...S.SETBACKS } };
const out = L.layoutOptions(plan, S.guessProgram('200 apartments, 3 stories'));
const vs = out.map((o, i) => { const p = { ...plan, program: o.program, elements: o.elements }, m = S.metrics(p), ph = o.elements.some(e => e.phase === 2);
  return { ...o, rank: -i, key: 'k' + i, m, m1: ph ? S.metrics({ ...p, elements: o.elements.filter(e => e.phase !== 2) }) : null, chk: K.checksOf(S.check(p), m) }; });
assert.ok(vs.every(v => v.m1), 'a filled site has a Phase 2');
for (const v of vs) {
  const h = K.headline(v.m, v.m1, K.askedOf(v.program));
  const n = +h.big.replace(/\D/g, ''); assert.ok(n >= 195 && n <= 230, 'Phase 1 leads with about the 200 units asked for: ' + h.big);
  assert.match(h.p2, /^\+ Phase 2: [\d,]+ more buildings?, [\d,]+ units$/);
  assert.ok(v.m.units > n, 'the full site holds more than Phase 1');
}
assert.deepEqual(K.askedOf({ asked: { units: 200 } }), { units: 200 });
assert.equal(K.askedOf({ use: 'industrial', max: true }), null);
assert.equal(K.headline({ gfa: 20000, buildings: 1, units: null }, null, { gfa: 25000 }).fit, '20,000 of 25,000 sf');
assert.equal(K.headline({ gfa: 25000, buildings: 1, units: null }, null, { gfa: 25000 }).sub, '1 building · as asked');
assert.equal(K.headline({ gfa: 140000, buildings: 6, units: 160 }, null, { units: 200 }).fit, '160 of 200 units');

// ---- recommended, badges, deltas, similar ----
const fin = (cost, yoc, profit) => ({ cost, yoc, profit, value: cost * 1.1 });
const mm = (gfa, spaces, required = 100) => ({ gfa, spaces, required, buildings: 1, coverage: 0.12, green: 0.3, units: null });
const set = [
  { key: 'a', rank: 0, m: mm(25000, 90), chk: { bad: 0, short: 10 }, fin: fin(14.28e6, 0.0202, -1e6) },
  { key: 'b', rank: -1, m: mm(25000, 107), chk: { bad: 0, short: 0 }, fin: fin(14.25e6, 0.0203, -0.9e6) },
  { key: 'c', rank: -2, m: mm(26000, 122), chk: { bad: 0, short: 0 }, fin: fin(14.31e6, 0.0201, -0.8e6) },
  { key: 'd', rank: -3, m: mm(26000, 122), chk: { bad: 0, short: 0 }, fin: fin(14.31e6, 0.0201, -0.8e6) }
];
assert.deepEqual(K.recommended(set, null), { index: 1, by: 'engine' }, 'the engine’s first layout that passes');
assert.deepEqual(K.recommended(set, 'c'), { index: 2, by: 'ai' }, 'the AI’s first choice');
assert.equal(K.recommended([set[0]], null), null, 'nothing passes: nothing recommended');
const bg = K.badges(set, K.recommended(set, null));
assert.ok(bg[1].includes('Recommended') && bg[1].includes('Best yield')); assert.ok(!bg[0].includes('Best yield'), 'a failing layout gets no badge while others pass');
assert.ok(!bg.some(b => b.includes('Most floor area')), 'a tie (c and d) has no leader');
assert.deepEqual(K.deltas(set[2], set[1]), ['+1,000 sf', '+15 spaces', '+$60k cost', '−0.02 pts yield']);
assert.deepEqual(K.deltas(set[1], set[1]), []);
assert.deepEqual(K.similar(set), [0, 1, 2, 2]);
assert.equal(K.engineReason(set, 1), 'The planner’s first layout that passes every check');
assert.equal(K.engineReason(set.slice(0, 3), 2), 'Most floor area that passes every check');
assert.equal(K.engineReason(set, 2), 'The planner’s first layout that passes every check', 'a tie for the most is no reason');

// ---- sorting: passing first; the recommended first under Recommended ----
assert.deepEqual(K.sortOrder(set, 'rec', 1), [1, 2, 3, 0]);
assert.deepEqual(K.sortOrder(set, 'profit', 1), [2, 3, 1, 0]);
assert.deepEqual(K.sortOrder(set, 'yoc', 1), [1, 2, 3, 0]);
assert.deepEqual(K.sortOrder(set, 'ratio', 1), [2, 3, 1, 0]);
assert.equal(K.SORTS.length, 7); assert.ok(!K.SORTS.some(([k]) => k === 'value'), 'no gross Value sort');

// ---- money ----
assert.equal(K.moneyDigits([14.28e6, 14.25e6, 14.31e6]), 2, 'three costs that read $14.3M need two decimals');
assert.equal(K.moneyDigits([4.2e6, 8.8e6]), 1);
assert.equal(K.fmtM(14.28e6, 2), '$14.28M'); assert.equal(K.fmtM(-9.98e6), '−$10.0M'); assert.equal(K.fmtM(950000), '$950k');
assert.equal(K.fmtPct(-0.0448), '−4.48%');

// ---- the AI's words: old letters and option numbers become layout names ----
const names = ['Layout 1', 'Layout 3', 'Layout 2'];
assert.equal(K.aiText('Option A is best; option 2 wastes frontage. Both options park well.', names), 'Layout 1 is best; Layout 2 wastes frontage. Both layouts park well.');
assert.equal(K.aiText('Option Z stays', names), 'Option Z stays');
assert.equal(K.firstSentence('Layout 2 uses the frontage best. Watch the entry.'), 'Layout 2 uses the frontage best.');
assert.equal(K.restSentences('Layout 2 uses the frontage best. Watch the entry.'), 'Watch the entry.');
assert.equal(K.programChange({ gfa: 25000 }, { gfa: 28000 }), '25,000 → 28,000 sf');
assert.equal(K.programChange({ units: 200, floors: 3 }, { units: 180, floors: 4 }), '200 → 180 units, 3 → 4 stories');

console.log('planpick ok');
// homes: the leader in units, Phase 1 said so in the differences
const ap = [{ key: 'x', rank: 0, m: { gfa: 9e5, units: 1213, spaces: 1958, required: 1941 }, m1: { gfa: 2.2e5, units: 216 }, chk: { bad: 0, short: 0 } }, { key: 'y', rank: -1, m: { gfa: 8e5, units: 1161, spaces: 1926, required: 1858 }, m1: { gfa: 2.3e5, units: 218 }, chk: { bad: 0, short: 0 } }];
assert.ok(K.badges(ap, K.recommended(ap))[1].includes('Most units'));
assert.deepEqual(K.deltas(ap[1], ap[0]), ['+2 units in Phase 1', '−32 spaces']);
console.log('planpick ok (homes)');
