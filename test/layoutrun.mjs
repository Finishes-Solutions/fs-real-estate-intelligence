// The deterministic layout contract: the brief (lib/layoutbrief.mjs), the independent validator (lib/layoutcheck.mjs)
// checked on hand-built layouts whose answers are known, building templates (lib/bldgtemplates.mjs), and runs
// (lib/layoutrun.mjs) repeated 20 times on representative briefs to prove identical geometry, quantities and ranking.
// No network, no AI.  node test/layoutrun.mjs [--quick]
import assert from 'node:assert/strict';
import { planSVG } from '../lib/sitesheet.mjs';
import crypto from 'node:crypto';
import * as CX from '../lib/enginectx.mjs';
import { sha256, hashOf } from '../lib/sha256.mjs';
import * as B from '../lib/layoutbrief.mjs';
import * as V from '../lib/layoutcheck.mjs';
import * as RUN from '../lib/layoutrun.mjs';
import * as T from '../lib/bldgtemplates.mjs';
import * as SP from '../lib/siteplan.mjs';

const QUICK = process.argv.includes('--quick');
const PF = await import('../lib/proforma.mjs');
let n = 0; const ok = (name, f) => { f(); n++; console.log('ok', n, name); };

// ---------- primitives ----------
ok('sha256 matches node:crypto', () => { for (const s of ['', 'abc', 'x'.repeat(119), 'é漢字🙂'.repeat(9)]) assert.equal(sha256(s), crypto.createHash('sha256').update(s).digest('hex')); });
ok('canonical JSON ignores key order', () => assert.equal(hashOf({ a: 1, b: [1, { d: 2, c: 3 }] }), hashOf({ b: [1, { c: 3, d: 2 }], a: 1 })));
ok('enginectx: seeded, restored, synchronous only', () => {
  const a = CX.deterministic({ seed: 7 }, () => [CX.rand(), CX.rand(), CX.now(), CX.rid()]), b = CX.deterministic({ seed: 7 }, () => [CX.rand(), CX.rand(), CX.now(), CX.rid()]);
  assert.deepEqual(a.value, b.value); assert.notDeepEqual(a.value, CX.deterministic({ seed: 8 }, () => [CX.rand(), CX.rand(), CX.now(), CX.rid()]).value);
  assert.equal(a.stats.reads, 1); assert.equal(CX.isDeterministic(), false);
  assert.throws(() => CX.deterministic({ seed: 1 }, async () => 1), /synchronous/);
  assert.equal(CX.isDeterministic(), false);
});

// ---------- the brief ----------
ok('quantities keep their meaning', () => {
  assert.deepEqual(B.quantityFromWords('exactly 240 garden apartments'), { mode: 'exact', value: 240, unit: 'units' });
  assert.deepEqual(B.quantityFromWords('at least 150 apartments'), { mode: 'min', value: 150, unit: 'units' });
  assert.deepEqual(B.quantityFromWords('up to 300 apartments'), { mode: 'max', value: 300, unit: 'units' });
  assert.deepEqual(B.quantityFromWords('200 to 240 apartments'), { mode: 'range', min: 200, max: 240, unit: 'units' });
  assert.deepEqual(B.quantityFromWords('28,000 sf of retail', 'sf'), { mode: 'exact', value: 28000, unit: 'sf' });
  assert.equal(B.quantityFromWords('apartments'), null);
  const plan = { origin: [-96, 30], ring: [[0, 0], [600, 0], [600, 400], [0, 400]], front: 0, streets: [] };
  assert.equal(B.briefFromRequest('townhomes, as many as fit', plan).program.uses[0].quantity.mode, 'maximize');
  assert.equal(B.briefFromRequest('at least 150 apartments', plan).program.uses[0].quantity.mode, 'min');
  assert.equal(B.briefFromRequest('200 garden apartments', plan).program.uses[0].quantity.mode, 'exact');
  assert.deepEqual(B.briefFromRequest('senior affordable apartments, 120 units', plan).program.overlays, ['affordable', 'senior']);
});
ok('brief validation reports what is wrong or missing', () => {
  assert.equal(B.validateBrief(null).ok, false);
  const plan = { ring: [[0, 0], [100, 0], [100, 100], [0, 100]], front: 0 };
  const b = B.briefFromRequest('100 apartments', plan);
  assert.equal(B.validateBrief(b).ok, true);
  assert.ok(B.validateBrief({ ...b, site: { ...b.site, ring: [[0, 0], [100, 100], [100, 0], [0, 100]] } }).errors.some(e => /crosses itself/.test(e.msg)));
  assert.ok(B.validateBrief({ ...b, site: { ...b.site, ring: [] } }).missing.includes('site boundary'));
  assert.ok(B.validateBrief({ ...b, program: { ...b.program, uses: [{ ...b.program.uses[0], quantity: { mode: 'range', min: 9, max: 3, unit: 'units' } }] } }).errors.some(e => /range/.test(e.msg)));
  assert.ok(B.validateBrief({ ...b, program: { ...b.program, uses: [{ ...b.program.uses[0], mix: [{ pct: 60 }, { pct: 30 }] }] } }).errors.some(e => /add to 90/.test(e.msg)));
  assert.ok(B.validateBrief({ ...b, site: { ...b.site, parts: [[], []] } }).errors.some(e => /several separate parts/.test(e.msg)));
});
ok('canonical brief: metres to feet, clockwise rings turned, same meaning -> same hash', () => {
  const ft = B.briefFromRequest('100 apartments', { ring: [[0, 0], [328.08399, 0], [328.08399, 164.041995], [0, 164.041995]], front: 0 });
  const m = JSON.parse(JSON.stringify(ft)); m.site.units = 'm'; m.site.ring = [[0, 0], [100, 0], [100, 50], [0, 50]];
  assert.equal(B.inputHash(ft), B.inputHash(m));
  const cw = JSON.parse(JSON.stringify(ft)); cw.site.ring = ft.site.ring.slice().reverse(); cw.site.front = 2; // edge 0 (bottom) of the CCW ring is edge 2 of the reversed ring
  const c = B.canonicalBrief(cw); assert.ok(SP.signedArea(c.site.ring) > 0); assert.deepEqual([c.site.ring[c.site.front], c.site.ring[(c.site.front + 1) % 4]].map(p => p[1]), [0, 0]);
  assert.notEqual(B.inputHash(ft), B.inputHash({ ...ft, solver: { ...ft.solver, seed: 'other' } }));
  assert.equal(B.inputHash(ft), B.inputHash({ ...ft, request: { text: 'reworded', parser: 'ai' } })); // wording isn't geometry
});

// ---------- the validator on layouts with known answers ----------
// a 400 x 300 ft site, street along the bottom (edge 0); setbacks front 25, side 10, rear 20, paving 10
const SITE = [[0, 0], [400, 0], [400, 300], [0, 300]];
const briefFor = (extra = {}) => B.canonicalBrief({ ...B.briefFromProgram({ use: 'retail', gfa: 6000 }, { ring: SITE, front: 0, streets: [] }), ...extra });
const good = () => [
  { id: 'entry', kind: 'drive', x: 200, y: 30, w: 24, d: 60, rot: 0, entry: true }, // from the street (y 0) to the aisle
  { id: 'aisle', kind: 'drive', x: 200, y: 72, w: 240, d: 24, rot: 0 },
  { id: 'row', kind: 'parking', x: 200, y: 93, w: 234, d: 18, rot: 0, row: -1, lock: true }, // 26 stalls, against the aisle (a row as the engine draws it)
  { id: 'shop', kind: 'building', use: 'retail', x: 200, y: 162, w: 100, d: 60, rot: 0, floors: 1 }
];
const lay = (els, extra = {}) => ({ ring: SITE, front: 0, streets: [], program: { use: 'retail' }, elements: els, ...extra });
const st = (r, id) => r.checks.find(c => c.id === id)?.status;
ok('a clean layout passes what it can measure, and says what it cannot', () => {
  const r = V.validateLayout(lay(good()), briefFor());
  for (const id of ['geometry.valid', 'site.containment', 'site.setbacks.buildings', 'overlap.level-aware', 'access.entrance', 'access.connectivity', 'access.buildings', 'parking.count', 'parking.geometry', 'program.u1']) assert.equal(st(r, id), 'pass', id + ' ' + JSON.stringify(r.checks.find(c => c.id === id)));
  assert.equal(r.quantities.parking.surface, 26); assert.equal(r.quantities.parking.required, 24); // 6,000 sf at 4 a 1,000
  assert.equal(r.quantities.totals.gfa, 6000);
  for (const id of ['eng.detention', 'eng.fire-route']) assert.equal(st(r, id), 'unknown'); // never passed
  for (const id of ['eng.turning.car', 'access.fire-width', 'access.dead-end']) assert.ok(['pass', 'n/a'].includes(st(r, id)), id + ' ' + JSON.stringify(r.checks.find(c => c.id === id))); // measured on the drawing
  assert.equal(r.status, 'pass'); assert.ok(r.restsOnAssumptions.includes('parking.count'));
});
ok('a building past the property line fails containment (concave site: inside the box, outside the L)', () => {
  const L = [[0, 0], [400, 0], [400, 150], [200, 150], [200, 300], [0, 300]];
  const els = good().filter(e => e.id !== 'shop').concat({ id: 'notch', kind: 'building', use: 'retail', x: 300, y: 225, w: 80, d: 60, rot: 0 });
  const r = V.validateLayout(lay(els, { ring: L }), B.canonicalBrief({ ...briefFor(), site: { ...briefFor().site, ring: L } }));
  assert.equal(st(r, 'site.containment'), 'fail'); assert.deepEqual(r.checks.find(c => c.id === 'site.containment').features, ['notch']); assert.equal(r.status, 'fail');
});
ok('setbacks measured edge by edge', () => {
  const els = good(); els[3] = { ...els[3], x: 55, y: 200 }; // 5 ft from the west line (side setback 10)
  const r = V.validateLayout(lay(els), briefFor()); assert.equal(st(r, 'site.setbacks.buildings'), 'fail'); assert.equal(r.checks.find(c => c.id === 'site.setbacks.buildings').measured, -5);
});
ok('overlaps are level-aware', () => {
  const two = good().concat({ id: 'shop2', kind: 'building', use: 'retail', x: 230, y: 162, w: 100, d: 60, rot: 0 });
  assert.equal(st(V.validateLayout(lay(two), briefFor()), 'overlap.level-aware'), 'fail');
  const stacked = good().concat({ id: 'flats', kind: 'building', use: 'multifamily', x: 200, y: 162, w: 100, d: 60, rot: 0, z0: 20, z1: 50, units: 12 });
  assert.equal(st(V.validateLayout(lay(stacked), briefFor()), 'overlap.level-aware'), 'pass'); // apartments over the shop
  const onParking = good().concat({ id: 'tuck', kind: 'building', use: 'multifamily', x: 200, y: 93, w: 60, d: 18, rot: 0, over: 10, floors: 2, units: 2 });
  assert.equal(st(V.validateLayout(lay(onParking), briefFor()), 'overlap.level-aware'), 'pass'); // raised over the stalls
  assert.equal(st(V.validateLayout(lay(good().concat({ ...onParking.at(-1), over: 0 })), briefFor()), 'overlap.level-aware'), 'fail');
});
ok('parking that does not reach the way in is disconnected', () => {
  const els = good().concat({ id: 'island', kind: 'parking', x: 200, y: 260, w: 90, d: 18, rot: 0, row: 1, lock: true });
  const r = V.validateLayout(lay(els), briefFor()); assert.equal(st(r, 'access.connectivity'), 'fail'); assert.deepEqual(r.checks.find(c => c.id === 'access.connectivity').features, ['island']);
});
ok('an entrance across an edge the brief does not allow fails access', () => {
  const b = briefFor(); b.site.access = { edges: [1], entrances: [] }; // only the east edge allowed
  assert.equal(st(V.validateLayout(lay(good()), b), 'access.entrance'), 'fail');
  const side = good().concat({ id: 'west', kind: 'drive', x: 15, y: 72, w: 30, d: 24, rot: 0 }); // a drive out to the west (neighbour's) line
  assert.equal(st(V.validateLayout(lay(side), briefFor()), 'access.entrance'), 'fail');
});
ok('exclusions are kept clear', () => {
  const b = briefFor(); b.site.exclusions = [{ id: 'easement', kind: 'easement', ring: [[150, 150], [400, 150], [400, 170], [150, 170]], source: 'test' }];
  const r = V.validateLayout(lay(good()), b); assert.equal(st(r, 'site.exclusions'), 'fail'); assert.match(r.checks.find(c => c.id === 'site.exclusions').features[0], /^shop on easement/);
});
ok('parking required and provided reported separately; a shortfall fails with no tolerance', () => {
  const b = briefFor(); b.rules.values.parkingPer1000 = { v: 5, cls: 'verified', source: 'Test ordinance §1' };
  const r = V.validateLayout(lay(good()), b), c = r.checks.find(x => x.id === 'parking.count');
  assert.equal(c.status, 'fail'); assert.equal(c.required, 30); assert.equal(c.measured, 25); assert.equal(c.basis, 'verified'); // (26 stalls drawn, less the accessible pair's aisle)
});
ok('missing evidence is never a pass', () => {
  const b = briefFor(); delete b.rules.values.buildingSeparation;
  assert.equal(st(V.validateLayout(lay(good()), b), 'separation.buildings'), 'unknown');
  const bm = briefFor(); bm.program.uses[0] = { ...bm.program.uses[0], use: 'mystery', quantity: { mode: 'maximize', unit: 'sf' } };
  const r = V.validateLayout(lay(good().map(e => e.id === 'shop' ? { ...e, use: 'mystery' } : e), { program: { use: 'mystery' } }), bm);
  assert.equal(st(r, 'parking.count'), 'unknown'); assert.equal(r.status, 'incomplete');
  const mf = B.canonicalBrief(B.briefFromProgram({ use: 'multifamily', units: 12 }, { ring: SITE, front: 0 }));
  const est = V.validateLayout(lay(good().map(e => e.id === 'shop' ? { ...e, use: 'multifamily', floors: 3 } : e), { program: { use: 'multifamily' } }), mf);
  assert.equal(st(est, 'program.buildings'), 'unknown'); // units estimated from floor area, not a schedule
});
ok('a use asked for but not on the plan is 0, not unknown', () => {
  const r = V.validateLayout(lay(good().filter(e => e.kind !== 'building')), briefFor()); assert.equal(st(r, 'program.u1'), 'fail'); assert.equal(r.checks.find(c => c.id === 'program.u1').measured, 0);
});
ok('quantity meanings: exact, min, max, range, maximize', () => {
  const mk = q => { const b = B.canonicalBrief(B.briefFromProgram({ use: 'multifamily', units: 10 }, { ring: SITE, front: 0 })); b.program.uses[0].quantity = q; return b; };
  const els = good().map(e => e.id === 'shop' ? { ...e, use: 'multifamily', floors: 3, units: 24 } : e), L0 = lay(els, { program: { use: 'multifamily' } });
  const s = q => st(V.validateLayout(L0, mk(q)), 'program.u1');
  assert.equal(s({ mode: 'exact', value: 24, unit: 'units' }), 'pass'); assert.equal(s({ mode: 'exact', value: 20, unit: 'units' }), 'fail');
  assert.equal(s({ mode: 'min', value: 20, unit: 'units' }), 'pass'); assert.equal(s({ mode: 'max', value: 20, unit: 'units' }), 'fail');
  assert.equal(s({ mode: 'range', min: 20, max: 30, unit: 'units' }), 'pass'); assert.equal(s({ mode: 'range', min: 25, max: 30, unit: 'units' }), 'fail');
  assert.equal(s({ mode: 'maximize', unit: 'units' }), 'pass');
});
ok('a locked piece that moved fails', () => {
  const b = briefFor(); b.locked = { shop: { shape: SP.shapeOf(good()[3]) } };
  assert.equal(st(V.validateLayout(lay(good()), b), 'locks'), 'pass');
  assert.equal(st(V.validateLayout(lay(good().map(e => e.id === 'shop' ? { ...e, x: 201 } : e)), b), 'locks'), 'fail');
  assert.equal(st(V.validateLayout(lay(good().filter(e => e.id !== 'shop')), b), 'locks'), 'fail');
});
ok('turned 33°, a layout checks the same', () => {
  const a = 33 * Math.PI / 180, R = ([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  const els = good().map(e => { const [x, y] = R([e.x, e.y]); return { ...e, x, y, rot: (e.rot || 0) + 33 }; }), ring = SITE.map(R);
  const b = briefFor(); b.site.ring = ring;
  const r0 = V.validateLayout(lay(good()), briefFor()), r1 = V.validateLayout(lay(els, { ring }), b);
  assert.deepEqual(r1.checks.map(c => [c.id, c.status]), r0.checks.map(c => [c.id, c.status]));
  assert.equal(r1.quantities.parking.surface, r0.quantities.parking.surface);
});
ok('malformed pieces are reported, not crashed on', () => {
  const r = V.validateLayout(lay(good().concat({ id: 'nan', kind: 'building', x: NaN, y: 1, w: 10, d: 10 })), briefFor());
  assert.equal(st(r, 'geometry.valid'), 'fail');
  assert.equal(V.validateLayout({ ring: [], elements: [] }, null).status, 'fail');
});

// ---------- templates ----------
ok('templated buildings are whole modules with units from the schedule', () => {
  const t = T.templateOf('mf-garden-breezeway-3s'), brief = B.canonicalBrief(B.briefFromProgram({ use: 'multifamily', units: 24, floors: 3 }, { ring: SITE, front: 0 }, { text: 'exactly 24 garden apartments' }));
  const o = { program: { use: 'multifamily' }, elements: [{ id: 'b1', kind: 'building', use: 'multifamily', x: 200, y: 150, w: t.module.w * 2 + 37, d: 65, rot: 0, floors: 3 }] };
  const r = T.applyTemplates({ ring: SITE }, o, brief), e = r.elements[0];
  assert.equal(e.w, t.module.w * 2); assert.equal(e.d, t.module.d); assert.equal(e.units, 2 * t.module.unitsPerFloor * 3); assert.equal(e.template, t.id);
  const v = V.validateLayout({ ring: SITE, front: 0, program: { use: 'multifamily' }, elements: r.elements }, brief); assert.equal(st(v, 'program.buildings'), 'pass');
  const stretched = V.validateLayout({ ring: SITE, front: 0, program: { use: 'multifamily' }, elements: [{ ...e, w: e.w + 30 }] }, brief); // stretched, schedule kept
  const short = T.applyTemplates({ ring: SITE }, { program: { use: 'multifamily' }, elements: [{ id: 'b2', kind: 'building', use: 'multifamily', x: 200, y: 150, w: t.module.w * 2 * 0.96, d: 65, rot: 0, floors: 3 }] }, brief).elements[0];
  assert.equal(short.modules, 2); assert.equal(short.w, +(t.module.w * 2 * 0.96).toFixed(2)); // 4% short of two modules: two, kept as drawn (not stretched)
  assert.equal(st(stretched, 'program.buildings'), 'fail');
});

// ---------- runs: outcomes, then 20 identical repeats ----------
const RECT = { origin: [-96.42, 30.38], ring: [[0, 0], [900, 0], [900, 500], [0, 500]], front: 0, streets: [], setbacks: { ...SP.SETBACKS } };
const LSITE = { origin: [-96.42, 30.38], ring: [[0, 0], [800, 0], [800, 380], [420, 380], [420, 700], [0, 700]], front: 0, streets: [], setbacks: { ...SP.SETBACKS } };
ok('outcomes are told apart', () => {
  assert.equal(RUN.runBrief(B.briefFromRequest('stacked townhomes, 40 homes', RECT)).outcome, 'unsupported');
  assert.equal(RUN.runBrief(B.briefFromRequest('exactly 20000 garden apartments', RECT)).outcome, 'proven-infeasible');
  assert.equal(RUN.runBrief({ ...B.briefFromRequest('100 apartments', RECT), site: { units: 'ft', ring: [] } }).outcome, 'missing-information');
});
const CASES = [['retail', '30,000 sf retail strip with 2 pad sites', RECT], ['townhomes', 'townhomes, as many as fit', LSITE], ['garden', 'garden apartments, as many as fit', RECT]];
for (const [label, ask, plan] of CASES) {
  ok('20 identical runs: ' + label, () => {
    const brief = B.briefFromRequest(ask, plan), first = RUN.runBrief(brief), reps = QUICK ? 3 : 20;
    assert.ok(first.options.length, 'options'); assert.ok(['feasible', 'needs-review', 'no-feasible-found'].includes(first.outcome));
    const sig = r => JSON.stringify([r.outcome, r.rankingHash, r.options.map(o => [o.rank, o.geometryHash, hashOf(o.quantities), o.validation.status, o.elements.map(e => e.id).join()])]);
    const s0 = sig(first);
    for (let i = 1; i < reps; i++) assert.equal(sig(RUN.runBrief(JSON.parse(JSON.stringify(brief)))), s0, 'run ' + (i + 1) + ' differs');
    const rp = RUN.replayRun(JSON.parse(JSON.stringify(first))); assert.ok(rp.identical, rp.diffs.join('; '));
    console.log('   ', label, first.outcome, first.options.map(o => o.validation.status + ' ' + (o.quantities.totals.units || o.quantities.totals.gfa)).join(' | '), 'evals', JSON.stringify(first.solver.evaluation));
  });
}
ok('studio apartment buildings are their own zone, in words', () => {
  const g = SP.guessProgram('Garden apartments, townhomes, and studio apartment buildings, as many as fits');
  assert.deepEqual(g.zones.map(z => [z.use, z.name || null, !!z.mix]), [['multifamily', 'Garden apartments', false], ['multifamily', 'Studio apartment buildings', true], ['townhomes', null, false]]);
  assert.equal(SP.guessProgram('a studio for the clubhouse').zones, undefined); assert.equal(SP.guessProgram('retail with a yoga studio').use, 'retail');
});
ok('the editor’s Build as a run: garden, studio and townhomes on a 29-acre square (23737 FM 2920, Hockley)', () => {
  // the parcel's outline in plan feet (1,187 x 1,065 ft, the street on the north edge); before: 18 apartments ("Simple
  // layout") from the engine alone, or empty parking bays once templated
  const site = { origin: [-95.7967, 30.0652], ring: [[586, 544], [-601, 521], [-584, -544], [598, -523]], front: 0, streets: [1], setbacks: { ...SP.SETBACKS }, elements: [] }; // FM 2920 on the north, Becker Road on the west
  const ask = 'Garden apartments, townhomes, and studio apartment buildings, as many as fits', r = RUN.runPlan({ ...site, params: {} }, SP.guessProgram(ask), { deeper: true }, { ask });
  assert.equal(r.outcome, 'feasible'); assert.ok(r.options.length >= 3);
  const top = r.options[0], by = k => top.elements.filter(e => e.kind === 'building' && (e.template === k || e.use === k)).reduce((t, e) => t + (e.units || 0), 0);
  assert.equal(top.check.status, 'pass', JSON.stringify(top.check));
  assert.ok(by('mf-garden-breezeway-3s') >= 96 && by('mf-garden-studio-3s') >= 96 && by('townhomes') >= 60, [by('mf-garden-breezeway-3s'), by('mf-garden-studio-3s'), by('townhomes')].join(' '));
  assert.ok(top.elements.every(e => !(e.kind === 'building' && e.use === 'multifamily') || e.modules >= 2), 'no apartment building under two stacks');
  assert.ok(top.recipe && top.run.brief && top.run.inputHash, 'the editor gets its recipe and the run');
  const again = RUN.runPlan({ ...site, params: {} }, SP.guessProgram(ask), { deeper: true }, { ask });
  assert.deepEqual(again.options.map(o => o.run.geometryHash), r.options.map(o => o.run.geometryHash));
  // over 200 apartments need a second way in: every option has one, or the check says it hasn't (never a silent pass);
  // with Becker Road every option gets one (the pond cut back where it took the side street)
  assert.ok(r.options.every(o => SP.entrancesOf(o.elements).length >= 2), r.options.map(o => SP.entrancesOf(o.elements).length).join());
  // ponds without spikes (the grey triangle on the map) and no trail piece still marked closed (the tan wedge)
  const ang = (r, i) => { const n = r.length, a = r[(i - 1 + n) % n], b = r[i], c = r[(i + 1) % n], u = [a[0] - b[0], a[1] - b[1]], v = [c[0] - b[0], c[1] - b[1]]; return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))))) * 180 / Math.PI; };
  for (const o of r.options) { for (const p of o.elements.filter(e => e.kind === 'pond' && e.poly)) assert.ok(p.poly.every((_, i) => ang(p.poly, i) >= 34), 'pond spike in ' + o.name);
    const tr = o.elements.filter(e => e.kind === 'trail'); if (tr.length > 1) assert.ok(tr.every(t => !t.closed), 'a split trail is open'); }
  const lone = RUN.runPlan({ ...site, streets: [], params: {} }, SP.guessProgram(ask), { deeper: true }, { ask });
  assert.ok(lone.options.every(o => SP.entrancesOf(o.elements).length >= 2 || o.elements.some(e => e.emergency) || o.check.failed.includes('access.second')), lone.options.map(o => o.check.failed.join()).join(' | ')); // (or a gated emergency lane)
});
ok('a courtyard building: its wings one building, shared corners once, the pool clear, exactly the units asked', () => {
  const r = RUN.runBrief(B.briefFromRequest('courtyard apartments, 150 units', RECT)), o = r.options[0];
  assert.equal(r.outcome, 'feasible'); assert.equal(o.validation.status, 'pass', o.validation.failed.join());
  assert.equal(o.quantities.totals.units, 150);
  const wings = o.elements.filter(e => e.court); assert.ok(wings.length >= 3 && new Set(wings.map(e => e.court)).size === 1, 'the wings carry one court id');
  assert.ok(wings.every(e => !e.poly), 'wings stay rectangles (3D facades and plan sets read them)');
  // one continuous building: every wing meets another end to side (no gaps, no overlaps), named as its parts
  for (const a of wings) assert.ok(wings.some(b => b !== a && SP.gapBetween(SP.shapeOf(a), SP.shapeOf(b)) < 0.5), 'a wing meets the next: ' + a.name);
  for (let i = 0; i < wings.length; i++) for (let j = i + 1; j < wings.length; j++) assert.ok(!SP.rectsOverlap(wings[i], wings[j], 1), 'wings never overlap at a corner');
  assert.ok(wings.every(e => /^Bldg A · .* wing$/.test(e.name)), wings.map(e => e.name).join());
  // the court: the pool inside it, no parking or drive inside it, the clubhouse at its gateway
  const xs = wings.flatMap(e => SP.shapeOf(e).map(p => p[0])), ys = wings.flatMap(e => SP.shapeOf(e).map(p => p[1])), inHull = e => { const c = SP.centroid(SP.shapeOf(e)); return c[0] > Math.min(...xs) && c[0] < Math.max(...xs) && c[1] > Math.min(...ys) && c[1] < Math.max(...ys); };
  assert.ok(o.elements.some(e => e.kind === 'pool' && inHull(e)), 'the pool in the court');
  assert.ok(!o.elements.some(e => (e.kind === 'parking' || e.kind === 'drive') && inHull(e)), 'no parking inside the court');
  assert.ok(o.elements.some(e => e.kind === 'building' && e.use === 'amenity' && inHull(e)), 'the clubhouse at the court');
  assert.ok(SP.planFeatures({ ...RECT, elements: o.elements, program: o.program }, null).features.filter(f => f.properties.k === 'fac').length > 100, 'the 3D facades are drawn (a joined outline had none)');
});
ok('two ways in far enough apart: the top option meets the spacing, the bigger one stays an option', () => {
  const a = 0.4, R = ([x, y]) => [+(x * Math.cos(a) - y * Math.sin(a)).toFixed(2), +(x * Math.sin(a) + y * Math.cos(a)).toFixed(2)];
  const site = { ...RECT, ring: [[0, 0], [1000, 0], [1000, 700], [0, 700]].map(R) }, r = RUN.runBrief(B.briefFromRequest('at least 200 garden apartments', site));
  const rem = o => o.validation.checks.find(c => c.id === 'access.remote');
  assert.equal(r.options[0].validation.status, 'pass'); assert.equal(rem(r.options[0]).status, 'pass', JSON.stringify(rem(r.options[0])));
  assert.ok(r.options[0].quantities.totals.units >= 200);
});
const BIG40 = { origin: [-96.42, 30.38], ring: [[0, 0], [1500, 0], [1500, 1160], [0, 1160]], front: 0, streets: [], setbacks: { front: 25, side: 10, rear: 20, paving: 10 } };
ok('an anchored center: the anchor at the size asked for and the rest in shops, not one box', () => {
  const b = B.briefFromRequest('anchored shopping center with a 40,000 sf anchor, 80,000 sf total', BIG40);
  assert.deepEqual(b.program.uses[0].anchor, { value: 40000, unit: 'sf' });
  const r = RUN.runBrief(b), o = r.options[0], bs = o.elements.filter(e => e.kind === 'building').map(e => e.gfa ?? e.w * e.d).sort((x, y) => y - x);
  assert.equal(r.outcome, 'feasible'); assert.equal(o.validation.status, 'pass', o.validation.failed.join());
  assert.equal(o.quantities.totals.gfa, 80000); assert.ok(bs.length >= 2 && Math.abs(bs[0] - 40000) <= 2000, bs.join());
  assert.ok(o.quantities.parking.provided >= o.quantities.parking.required);
  // one 80,000 sf box meets the total but not the anchor: the check says so
  const box = { ...B.toEngine(b).plan, elements: [{ id: 'b1', kind: 'building', use: 'retail', x: 700, y: 400, w: 400, d: 200, floors: 1 }] };
  const c = V.validateLayout(box, B.canonicalBrief(b)).checks.find(k => k.id === 'program.u1.anchor'); assert.equal(c.status, 'fail');
});
ok('an exact floor area lands exactly: a 250,000 sf warehouse reads 250,000, not 250,001', () => {
  const r = RUN.runBrief(B.briefFromRequest('warehouse with truck court, 250,000 sf', BIG40)), o = r.options[0];
  assert.equal(o.validation.status, 'pass', o.validation.failed.join()); assert.equal(o.quantities.byUse.industrial.gfa, 250000);
  assert.equal(RUN.replayRun(r).identical, true);
  // a stated area is taken only while the outline agrees with it: a box resized after the run reads its own area
  const w = o.elements.find(e => e.kind === 'building'), moved = { ...B.toEngine(r.brief).plan, elements: [{ ...w, w: w.w + 50 }] };
  assert.equal(V.quantities(moved, r.brief).byUse.industrial.gfa, Math.round((w.w + 50) * w.d));
});
ok('a tower on a parking podium: the podium parks the tower, exactly the units asked, modest surface rows', () => {
  const r = RUN.runBrief(B.briefFromRequest('tower on a podium, 8 stories, 300 apartments', RECT)), o = r.options[0];
  assert.equal(r.outcome, 'feasible'); assert.equal(o.validation.status, 'pass', o.validation.failed.join());
  assert.equal(o.quantities.totals.units, 300);
  const T = o.elements.filter(e => e.kind === 'building' && e.use === 'multifamily'); assert.ok(T.length && T.every(e => e.form === 'tower' && Number.isInteger(e.parkLevels) && e.parkLevels >= 1), 'every tower declares its parking levels');
  const pk = o.quantities.parking; assert.ok(pk.podium > pk.surface, 'most spaces on the podium: ' + pk.podium + ' vs ' + pk.surface + ' surface');
  assert.ok(pk.provided >= pk.required && pk.provided <= pk.required * 1.08, 'parked without over-parking: ' + pk.provided + ' / ' + pk.required);
  assert.equal(SP.metrics({ ...RECT, elements: o.elements, program: o.program }).spaces, SP.metrics({ ...RECT, elements: o.elements, program: o.program }).stalls + SP.metrics({ ...RECT, elements: o.elements, program: o.program }).deck, 'the plan counts podium spaces as deck');
  // the garage plan: 4 rows of 20 stalls, less the ramp's 12 and two cores' 3 each on every level (62), and the lobby's 9 on the ground (53)
  assert.equal(SP.podiumLevelStalls(240, 128), 62); assert.equal(SP.podiumStalls({ kind: 'building', w: 240, d: 128, floors: 8, form: 'tower', podium: 2, parkLevels: 2 }), 53 + 62);
  const g = SP.garagePlan({ w: 240, d: 128 }); assert.equal(g.rows.reduce((t, r) => t + r.slots.filter(q => !q.use).length, 0), g.typical, 'the count is the drawn stalls');
  assert.equal(g.cores.length, 2); assert.ok(g.ramp && g.lobby && g.cols.length > 20);
  for (const f of ['-u', '+u', '+v']) assert.notEqual(SP.garagePlan({ w: 240, d: 128, garageFace: f, lobbyFace: '-v' }).entry.face, '-v', 'never on the lobby face');
  // every tower's garage has a way in: a drive meets its entrance, on a face that isn't the lobby's
  for (const b of T) { assert.ok(b.lobbyFace && b.garageFace && b.garageFace !== b.lobbyFace, b.id + ' faces'); }
  assert.equal(o.validation.checks.find(c => c.id === 'access.garage').status, 'pass');
  // the check fails a garage no drive reaches: one drive up the podium's left end; the entrance there passes, at the right end fails
  const tw = { id: 't1', kind: 'building', use: 'multifamily', form: 'tower', x: 450, y: 250, w: 240, d: 128, floors: 8, podium: 2, parkLevels: 2, lobbyFace: '-v' }, dr = { id: 'd1', kind: 'drive', x: 318, y: 157, w: 24, d: 314, name: 'Main entry', entry: true };
  const gar = f => V.validateLayout({ ...RECT, elements: [{ ...tw, garageFace: f }, dr], program: o.program }, r.brief).checks.find(c => c.id === 'access.garage').status;
  assert.equal(gar('-u'), 'pass'); assert.equal(gar('+u'), 'fail');
  assert.equal(SP.podiumStalls({ kind: 'building', w: 240, d: 128, floors: 8, form: 'tower', podium: 2 }), 0, 'a tower with no parking levels declared parks nothing on its podium (as before)');
});
ok('a wrap: one building round a garage that parks it, the pool in the courtyard, exactly the units asked', () => {
  const r = RUN.runBrief(B.briefFromRequest('a wrap building with 300 apartments', RECT)), o = r.options[0];
  assert.equal(r.outcome, 'feasible'); assert.equal(o.validation.status, 'pass', o.validation.failed.join());
  assert.equal(o.quantities.totals.units, 300);
  const g = o.elements.filter(e => e.kind === 'garage'), W = o.elements.filter(e => e.kind === 'building' && e.use === 'multifamily');
  assert.equal(g.length, 1); assert.ok(g[0].grid && g[0].levels >= 2 && g[0].levels <= 6, 'a garage on the stall grid');
  assert.ok(W.length === 3 && W.every(e => e.wrap === g[0].wrap && e.court === g[0].wrap), 'three wings, one building with the garage');
  for (const e of W) assert.ok(!SP.rectsOverlap(e, g[0], 0.5), 'a wing does not overlap the garage');
  const pk = o.quantities.parking; assert.ok(pk.garage > pk.surface, 'most spaces in the garage: ' + pk.garage + ' vs ' + pk.surface);
  assert.ok(pk.provided >= pk.required && pk.provided <= pk.required * 1.08, 'parked without over-parking: ' + pk.provided + ' / ' + pk.required);
  assert.equal(SP.garageStalls(g[0]), SP.garageGrid(g[0].w, g[0].d, g[0].levels));
  assert.ok(o.elements.some(e => e.kind === 'pool'), 'the pool in the courtyard');
  assert.equal(RUN.replayRun(r).identical, true);
});
ok('parking trimmed to the need: whole stalls off the far row ends, no empty paving, the drive-thru kept', () => {
  for (const [ask, site] of [['exactly 120 garden apartments, 3 stories', RECT], ['courtyard apartments, 150 units', RECT], ['exactly 28,000 sf retail in four buildings', RECT]]) {
    const o = RUN.runBrief(B.briefFromRequest(ask, site)).options[0], pk = o.quantities.parking;
    assert.equal(o.validation.status, 'pass', ask + ': ' + o.validation.failed.join());
    assert.ok(pk.provided >= pk.required && pk.provided <= Math.ceil(pk.required * 1.05) + 1, ask + ': ' + pk.provided + ' / ' + pk.required);
    assert.ok(o.elements.every(e => e.kind), 'every piece has a kind (no bare outline)');
    assert.ok(o.elements.filter(e => e.kind === 'parking' && !e.poly).every(e => Math.floor((e.w + 0.01) / 9) >= 6), 'no row left a stub');
  }
  const pad = RUN.runBrief(B.briefFromRequest('2,500 sf restaurant with a drive-thru', { ...RECT, ring: [[0, 0], [210, 0], [210, 230], [0, 230]] })).options[0];
  assert.ok(pad.elements.some(e => e.kind === 'drive' && e.windowAt), 'the drive-thru lane asked for is kept');
});
ok('a second court that gives up its clubhouse keeps a garden; a court is never future development (Hockley, 350 courtyard units)', () => {
  const site = { origin: [-95.7967, 30.0652], ring: [[586, 544], [-601, 521], [-584, -544], [598, -523]], front: 0, streets: [1], setbacks: { front: 25, side: 10, rear: 20, paving: 10 } };
  const r = RUN.runBrief(B.briefFromRequest('courtyard apartments, 350 units', site));
  for (const o of r.options) {
    assert.equal(o.validation.status, 'pass', o.name + ': ' + o.validation.failed.join()); assert.equal(o.quantities.totals.units, 350);
    const courts = o.elements.filter(e => e.kind === 'green' && e.note === 'Courtyard');
    assert.ok(!o.elements.some(e => e.kind === 'green' && e.future && courts.some(c => SP.inRing(e.labelAt || SP.centroid(SP.shapeOf(e)), SP.shapeOf(c)))), 'no future development inside a court');
    const n = new Set(o.elements.filter(e => e.court).map(e => e.court)).size, clubs = o.elements.filter(e => e.kind === 'building' && e.use === 'amenity').length;
    if (n > clubs) assert.equal(o.elements.filter(e => e.name === 'Courtyard garden').length, n - clubs, 'each court without a clubhouse has its garden');
  }
});
ok('an entrance drawn across the street line (its apron out in the street) is a way in', () => {
  const plan = { ...RECT, elements: [{ id: 'd1', kind: 'drive', name: 'Main entry', entry: true, x: 450, y: 20, w: 24, d: 44 }, { id: 'b1', kind: 'building', use: 'retail', x: 450, y: 200, w: 100, d: 60 }] };
  const c = V.validateLayout(plan, B.canonicalBrief(B.briefFromRequest('6,000 sf retail', RECT))).checks.find(k => k.id === 'access.entrance');
  assert.equal(c.status, 'pass', JSON.stringify(c));
});
ok('mixed use on the Hockley parcel: exactly the apartments asked, no empty paved block, the check and the app count parking alike', () => {
  const site = { origin: [-95.7967, 30.0652], ring: [[586, 544], [-601, 521], [-584, -544], [598, -523]], front: 0, streets: [1], setbacks: { ...SP.SETBACKS }, elements: [] };
  const ask = '20,000 sf retail on FM 2920, 250 apartments behind', r = RUN.runPlan({ ...site, params: {} }, SP.guessProgram(ask), { deeper: true }, { ask }), o = r.options[0];
  assert.equal(r.outcome, 'feasible'); assert.equal(o.check.status, 'pass', o.check.failed.join());
  const B = o.elements.filter(e => e.kind === 'building' && e.use === 'multifamily'); assert.equal(B.reduce((t, e) => t + e.units, 0), 250);
  assert.ok(B.some(e => e.combined > 0), 'the last homes combined into larger ones (whole stacks give 252)');
  // every parking row has a building within 120 ft (trimming to the count shortens buildings, it doesn't empty a block)
  const far = o.elements.filter(e => e.kind === 'parking').filter(p => !o.elements.some(b => b.kind === 'building' && SP.gapBetween(SP.shapeOf(p), SP.shapeOf(b)) <= 120));
  assert.equal(far.length, 0, far.length + ' parking rows with no building near');
  const m = SP.metrics({ ...site, elements: o.elements, program: o.program }), q = V.quantities({ ...site, elements: o.elements, program: o.program }, o.run.brief);
  assert.equal(q.parking.provided, m.spaces, 'the validator and the app count the same spaces (accessible aisles taken out)');
  assert.ok(m.spaces >= m.required);
});
ok('a schedule that combines homes reconciles; one that combines too many does not', () => {
  const site = { ...RECT }, bl = { id: 'b', kind: 'building', use: 'multifamily', x: 450, y: 250, w: 300, d: 60, floors: 3, template: 'mf-garden-breezeway-3s', modules: 4, units: 46, tplUnits: 46, tplL: 300, combined: 2 };
  const brief = B.briefFromRequest('exactly 46 garden apartments', site), chk = els => V.validateLayout({ ...site, elements: els }, brief).checks.find(c => c.id === 'program.buildings');
  assert.equal(chk([bl]).status, 'pass'); assert.equal(chk([{ ...bl, combined: 13, units: 35, tplUnits: 35 }]).status, 'fail');
});
ok('a narrow deep lot: an emergency access lane gives the second way in, counted by the check and drawn distinctly', () => {
  const deep = { ...RECT, ring: [[0, 0], [330, 0], [330, 800], [0, 800]] }, r = RUN.runBrief(B.briefFromRequest('townhomes, as many as fit', deep)), o = r.options[0];
  const ck = id => o.validation.checks.find(c => c.id === id);
  assert.equal(o.validation.status, 'pass', o.validation.failed.join()); assert.equal(ck('access.second').status, 'pass'); assert.equal(ck('access.remote').status, 'pass', JSON.stringify(ck('access.remote')));
  const lane = o.elements.find(e => e.emergency); assert.ok(lane && lane.kind === 'drive' && lane.name === 'Emergency access', 'an emergency lane');
  assert.match(lane.note, /easement/); assert.match(ck('access.second').note, /fire official/);
  assert.ok(!o.elements.some(e => e.kind === 'building' && SP.gapBetween(SP.shapeOf(e), lane.poly) < 3), 'clear of the buildings');
  assert.equal(ck('access.entrance').status, 'pass', 'a lane on a side or rear line is not an illegal entrance');
  assert.ok(!SP.pavement({ elements: o.elements }).some(pv => SP.inRing(SP.centroid(lane.poly), pv.outer)), 'not drawn as asphalt');
  assert.match(planSVG({ ...deep, elements: o.elements, program: o.program }, { px: 400 }).svg, /EMERGENCY ACCESS/);
  assert.equal(RUN.replayRun(r).identical, true);
  // a real entrance far enough away still ranks ahead of a lane (the rotated garden site: no lane on its top option)
});
ok('a long frontage gets two real ways in far enough apart, not a gated lane (mixed use on 40 ac, a tower on 10 ac)', () => {
  const big = { ...RECT, ring: [[0, 0], [1500, 0], [1500, 1160], [0, 1160]] };
  for (const [ask, site] of [['20,000 sf retail along the main road, 240 apartments behind and 80 townhomes', big], ['tower on a podium, 8 stories, 300 apartments', RECT]]) {
    const o = RUN.runBrief(B.briefFromRequest(ask, site)).options[0], rm = o.validation.checks.find(c => c.id === 'access.remote');
    assert.equal(o.validation.status, 'pass', ask + ': ' + o.validation.failed.join()); assert.equal(rm.status, 'pass', ask + ': ' + JSON.stringify(rm));
    assert.ok(!o.elements.some(e => e.emergency), ask + ': no emergency lane where the street has room for a real entrance');
  }
});
ok('townhome rows share a stretch evenly (9 homes as 5 + 4, not 6 + a 3-home stub; a guest bay may take a home off the last)', () => {
  const site = { origin: [-95.7967, 30.0652], ring: [[586, 544], [-601, 521], [-584, -544], [598, -523]], front: 0, streets: [1], setbacks: { ...SP.SETBACKS }, elements: [] };
  const ask = 'townhomes, as many as fit', r = RUN.runPlan({ ...site, params: {} }, SP.guessProgram(ask), { deeper: true }, { ask }), o = r.options[0];
  assert.equal(o.check.status, 'pass', o.check.failed.join());
  const B = o.elements.filter(e => e.kind === 'building' && e.use === 'townhomes'); let pairs = 0;
  for (const a of B) for (const b of B) if (a !== b && a.units > b.units && SP.gapBetween(SP.shapeOf(a), SP.shapeOf(b)) < 30 && Math.abs(((a.rot || 0) - (b.rot || 0)) % 180) < 1) { pairs++; assert.ok(a.units - b.units <= 2, a.name + ' ' + a.units + ' beside ' + b.name + ' ' + b.units); }
  assert.ok(B.reduce((t, e) => t + e.units, 0) >= 307, 'no fewer homes than before');
});
ok('tuck-under rows: a garage under every home, exactly the homes asked, garages counted and capped by what fits', () => {
  const r = RUN.runBrief(B.briefFromRequest('tuck-under apartments, 120 units', RECT)), o = r.options[0];
  assert.equal(r.outcome, 'feasible'); assert.equal(o.validation.status, 'pass', o.validation.failed.join());
  assert.equal(o.quantities.totals.units, 120);
  const T = o.elements.filter(e => e.kind === 'building' && e.use === 'multifamily');
  assert.ok(T.length && T.every(e => e.tuck === e.units && e.template === 'mf-tuckunder-2s' && e.units >= 3 && e.units <= 6), 'every row a tuck-under row of 3 to 6 homes');
  const pk = o.quantities.parking; assert.equal(pk.tucked, 120); assert.ok(pk.provided >= pk.required && pk.provided <= pk.required * 1.06, pk.provided + ' / ' + pk.required);
  assert.ok(o.elements.some(e => e.kind === 'drive' && e.name === 'Garage court'), 'the garages open onto a garage court');
  assert.equal(SP.metrics({ ...RECT, elements: o.elements, program: o.program }).spaces, pk.provided, 'the app and the check count the garages alike');
  // the check never counts more garages than fit along a row (11 ft each)
  const one = { ...B.toEngine(r.brief).plan, elements: [{ id: 't', kind: 'building', use: 'multifamily', x: 450, y: 250, w: 60, d: 42, floors: 2, units: 3, tuck: 9 }] };
  assert.equal(V.quantities(one, r.brief).parking.tucked, 5);
});
ok('a cross-dock: doors and a truck court on both long sides, trailer stalls, trucks kept off the car park, exactly the floor area', () => {
  const big = { origin: [-96.42, 30.38], ring: [[0, 0], [1500, 0], [1500, 1160], [0, 1160]], front: 0, streets: [], setbacks: { front: 25, side: 10, rear: 20, paving: 10 } };
  const b = B.briefFromRequest('cross-dock warehouse, 400,000 sf', big); assert.equal(b.program.uses[0].form, 'ind-cross-dock');
  const r = RUN.runBrief(b), o = r.options[0], chk = id => o.validation.checks.find(c => c.id === 'program.u1.' + id);
  assert.equal(r.outcome, 'feasible'); assert.equal(o.validation.status, 'pass', o.validation.failed.join());
  assert.equal(o.quantities.totals.gfa, 400000);
  const X = o.elements.find(e => e.kind === 'building' && e.crossDock); assert.ok(X && X.docks.faces.length === 2 && X.docks.perFace > 40, 'dock doors on both long walls');
  assert.equal(chk('crossdock').status, 'pass'); assert.ok(chk('crossdock').measured.every(d => d >= 130), JSON.stringify(chk('crossdock').measured));
  assert.equal(chk('trailers').status, 'pass'); assert.ok(chk('trailers').measured >= X.docks.perFace, 'trailer stalls counted');
  assert.equal(chk('trucks').status, 'pass', 'no truck piece touches the car parking');
  assert.ok(o.elements.some(e => e.kind === 'drive' && e.trucks && /^Entrance\b/.test(e.name || '')) && o.elements.some(e => e.kind === 'drive' && e.name === 'Main entry' && !e.trucks), 'a truck entrance and a car entrance of their own');
  assert.ok(o.quantities.parking.provided >= o.quantities.parking.required);
  // the check reads the drawing: a warehouse with a court on one side only fails it
  const one = o.elements.filter(e => !(e.kind === 'truck' && e.x > X.x));
  assert.equal(V.validateLayout({ ...B.toEngine(r.brief).plan, elements: one, program: o.program }, r.brief).checks.find(c => c.id === 'program.u1.crossdock').status, 'fail');
});
ok('vertical mixed use: shops on the ground floor, apartments above, each use counted and parked at its own ratio', () => {
  const ask = 'a 5-story mixed-use building with 20,000 sf ground-floor retail and 200 apartments above', b = B.briefFromRequest(ask, RECT);
  assert.deepEqual(b.program.uses.map(u => [u.use, u.form]), [['retail', 'mx-vertical'], ['multifamily', 'mx-vertical']]);
  const r = RUN.runBrief(b), o = r.options[0];
  assert.equal(r.outcome, 'feasible'); assert.equal(o.validation.status, 'pass', o.validation.failed.join());
  assert.equal(o.quantities.byUse.multifamily.units, 200); assert.equal(o.quantities.byUse.retail.gfa, 20000);
  const M = o.elements.filter(e => e.kind === 'building' && e.use === 'multifamily'), shops = M.filter(e => e.ground);
  assert.equal(shops.length, 1, 'one stretch with shops below'); assert.ok(M.every(e => e.floors === 5 && e.mixed === M[0].mixed), 'one 5-story building');
  const pk = o.quantities.parking; assert.equal(pk.required, Math.ceil(200 * 1.6 + 20000 / 1000 * 4)); assert.ok(pk.provided >= pk.required && pk.provided <= pk.required * 1.06, pk.provided + ' / ' + pk.required);
  const plan = { ...RECT, elements: o.elements, program: o.program }, m = SP.metrics(plan); assert.equal(m.units, 200); assert.equal(m.required, pk.required); assert.equal(m.spaces, pk.provided, 'the app and the check count the same spaces');
  assert.match(SP.labelOf(shops[0], o.program).size, /20,000 sf retail \+ \d+ units · 5 fl/);
  assert.ok(SP.planFeatures(plan, null).features.some(f => f.properties.k === 'b3' && f.properties.part === 'storefront'), 'storefronts in 3D');
  const pm = PF.metricsOf(plan); assert.equal(Math.round(pm.uses.retail.gsf), 20000); assert.ok(pm.uses.multifamily.gsf < SP.gfaOf(shops[0]) + M.filter(e => !e.ground).reduce((t, e) => t + SP.gfaOf(e), 0));
  assert.equal(RUN.replayRun(r).identical, true);
});
ok('stormwater handled off site: the words or the typed brief, no pond drawn, the check says it is an assumption', () => {
  for (const [ask, want] of [['garden apartments, as many as fit, detention handled off site', 'offsite'], ['garden apartments, as many as fit, drains to the regional pond', 'offsite'], ['garden apartments, as many as fit, underground detention', 'underground'], ['garden apartments, as many as fit', null]]) assert.equal(B.briefFromRequest(ask, RECT).site.stormwater, want, ask);
  const b = B.briefFromRequest('exactly 120 garden apartments', RECT); b.site.stormwater = 'offsite';
  const r = RUN.runBrief(b), o = r.options[0]; assert.equal(o.validation.status, 'pass', o.validation.failed.join());
  assert.ok(!o.elements.some(e => e.kind === 'pond'), 'no pond on the site'); assert.match(o.validation.checks.find(c => c.id === 'eng.detention').note, /off site/);
  const bad = B.briefFromRequest('exactly 120 garden apartments', RECT); bad.site.stormwater = 'lake'; assert.equal(B.validateBrief(bad).ok, false);
});
ok('townhomes: an exact count lands in rows of at most 6, each home on its lot; more than fit gives the most that do, never 11-home bars', () => {
  const th = o => o.elements.filter(e => e.kind === 'building' && ['townhomes', 'multifamily'].includes(e.use));
  const fifty = RUN.runBrief(B.briefFromRequest('exactly 50 townhomes', RECT)).options[0];
  assert.equal(fifty.validation.status, 'pass', fifty.validation.failed.join()); assert.equal(fifty.quantities.totals.units, 50);
  assert.equal(fifty.elements.filter(e => e.kind === 'lot').length, 50, 'a lot for every home, none left empty by the trim');
  const fill = RUN.runBrief(B.briefFromRequest('townhomes, as many as fit', RECT)).options[0].quantities.totals.units;
  const many = RUN.runBrief(B.briefFromRequest('exactly 200 townhomes', RECT)).options[0];
  assert.ok(th(many).every(e => (e.units || 1) <= 6), 'rows of at most 6: ' + th(many).map(e => e.units).join());
  assert.ok(many.quantities.totals.units >= fill * 0.9, 'the most that fit (' + many.quantities.totals.units + ' vs ' + fill + ' as many as fit)');
  assert.equal(many.validation.checks.find(c => c.id === 'program.rowlength').status, 'pass');
  const bar = { ...RECT, elements: [{ id: 't1', kind: 'building', use: 'townhomes', x: 450, y: 250, w: 264, d: 40, units: 11, floors: 2 }] };
  assert.equal(V.validateLayout(bar, B.canonicalBrief(B.briefFromRequest('exactly 11 townhomes', RECT))).checks.find(c => c.id === 'program.rowlength').status, 'fail', 'an 11-home row is flagged');
});
ok('front-load townhomes from the reviewed row (E053): a one-car garage and a driveway a home, on lots of their own', () => {
  const b = B.briefFromRequest('front-load townhomes, as many as fit', RECT), r = RUN.runBrief(b), o = r.options[0];
  assert.equal(o.validation.status, 'pass', o.validation.failed.join());
  const T = o.elements.filter(e => e.kind === 'building' && e.use === 'townhomes'), n = T.reduce((t, e) => t + e.units, 0);
  assert.ok(n >= 60, n + ' homes'); assert.ok(T.every(e => e.garagePer === 1 && /front-load/.test(e.note) && e.template === 'th-frontload-row-2s' && e.units <= 6));
  assert.equal(o.elements.filter(e => e.kind === 'lot').length, n); assert.equal(o.elements.filter(e => e.note === 'Driveway').length, n);
  const m = SP.metrics({ ...RECT, elements: o.elements, program: o.program }); assert.equal(o.quantities.parking.provided, m.spaces, 'the check and the app count the same spaces');
  assert.ok(o.quantities.parking.privateGarages === n && o.quantities.parking.driveways === n, 'a garage and a driveway a home');
  assert.equal(RUN.replayRun(r).identical, true);
  assert.equal(SP.normalizeProgram(SP.guessProgram('fee simple townhomes with garages')).product, 'lots', 'for-sale words: lots, never the rental court');
});
ok('live mode is unchanged outside a run (fresh random ids)', () => { const a = CX.rid(), b = CX.rid(); assert.notEqual(a, b); });
console.log('layoutrun: ' + n + ' passed');
