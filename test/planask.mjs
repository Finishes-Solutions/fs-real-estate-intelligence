// The effort levels under Build and the fact sheet sent with a question about the open plan (lib/planask.mjs), on real
// engine output: apartments on 10 acres with detention, a retail strip filled to Phase 2, a small pad under an acre,
// and a plan with a hand-placed second use.
import assert from 'node:assert/strict';
import { EFFORTS, effortOf, effortLevel, runEffort, planFacts, finFacts } from '../lib/planask.mjs';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), PF = await import('../lib/proforma.mjs'), ED = await import('../lib/siteedit.mjs');

// ---- effort ----
assert.deepEqual(EFFORTS.map(e => e.id), ['low', 'medium', 'high', 'ultra']);
for (const e of EFFORTS) { assert.ok(['low', 'medium', 'high'].includes(e.effort), e.id + ': a reasoning effort the API takes'); assert.ok(e.tip && !/reasoning|effort|token/i.test(e.tip), e.id + ': plain words'); }
const [lo, me, hi, ul] = EFFORTS;
assert.equal(lo.rounds, 0, 'Low: no review'); assert.equal(me.rounds, 1, 'Medium: one review, no revise'); assert.ok(hi.rounds === 2 && hi.revise, 'High: may revise once (the old AI-reviewed)');
assert.ok(ul.rounds > hi.rounds && ul.pool > hi.pool && ul.layout.count > 3 && ul.images > hi.images, 'Ultra does more of what High does');
// thinking before placing: none on Low; one plan on Medium and High (at their own effort); three compared at the deepest on Ultra
assert.equal(lo.plan, null, 'Low: no planning step');
assert.deepEqual([me.plan, hi.plan], [{ effort: 'medium', count: 1 }, { effort: 'high', count: 1 }]);
assert.deepEqual(ul.plan, { effort: 'xhigh', count: 3 }, 'Ultra: three plans at xhigh (steps down to high on a model without it)');
for (const e of EFFORTS.slice(1)) assert.match(e.tip, /before placing/, e.id + ': says it plans before placing');
assert.equal(effortOf('nope').id, 'high');
assert.equal(effortLevel('ultra', null), 'ultra'); assert.equal(effortLevel('medium', '0'), 'medium', 'the new setting wins over the old one');
assert.equal(effortLevel(null, '0'), 'low', 'old Quick → Low'); assert.equal(effortLevel('', '1'), 'high', 'old AI-reviewed → High'); assert.equal(effortLevel(null, null), 'high', 'default: High, as AI-reviewed was');
assert.equal(effortLevel('quick', '0'), 'low', 'junk saved: the old switch'); assert.equal(effortLevel('ultra', null, true), 'low', 'AI off: only Low runs');
assert.equal(runEffort({ effort: 'medium', aiReviewed: true }), 'medium'); assert.equal(runEffort({ aiReviewed: true }), 'high', 'an old reviewed run'); assert.equal(runEffort({ aiReviewed: false }), 'low'); assert.equal(runEffort(null), null);

// ---- the fact sheet ----
const site = (w, d, program, extra = {}) => ({ name: 'Option A', ring: [[0, 0], [w, 0], [w, d], [0, d]], front: 0, setbacks: S.SETBACKS, program, ...extra });
const build = (pl, i = 0) => { const o = L.layoutOptions(pl, pl.program)[i]; return { ...pl, elements: o.elements, recipe: o.recipe, program: o.program || pl.program, params: o.params || pl.params, variant: { key: 'k' + i, name: 'Layout ' + (i + 1) + ' · ' + o.arr }, _o: o }; };
const json = f => JSON.stringify(f);

// apartments on 10 acres: parking by the unit, detention sized from the developed land, the money, the AI's review
{ const pl0 = build(site(800, 545, { use: 'multifamily', units: 200 })), o = pl0._o; delete pl0._o;
  const pl = { ...pl0, lastRun: { ask: '200 garden apartments', note: 'Three-story garden apartments.', summary: 'Layout 1 is best: parking by the doors.', effort: 'ultra', read: { chips: ['Multifamily', '200 units'], assumed: ['1.6 spaces per unit (typical)'], miss: [], plan: { name: 'Apartments round a central clubhouse', concept: 'Three-story bars around a clubhouse, the pond at the back on the low land.', placement: [{ what: 'clubhouse and pool', where: 'middle', why: 'central to every building' }, { what: 'detention pond', where: 'back', why: 'the low corner' }], entrances: { count: 2, where: 'the main road and the side street', why: 'fire access for 200 units' }, parking: { approach: 'rows along the buildings' }, stormwater: { type: 'detention', where: 'back', why: 'the low corner' }, numbers: { check: '200 units in 3 stories is about 70,000 sf of footprint; 320 spaces; fits on 10 acres.' }, alts: ['Bars along the street'], why: 'Quieter homes.', rejected: [], risks: [] } },
    variants: [{ key: 'k0', name: pl0.variant.name, notes: o.notes, ai: { score: 82, verdict: 'Good', strengths: ['Clubhouse by the entry'], problems: ['Pond far from the homes'] } }, { key: 'k1', name: 'Layout 2 · other', m: { gfa: 1000, units: 190, spaces: 300, required: 304 }, ai: { score: 64 } }] } };
  const m = S.metrics(pl), st = S.stormOf(pl), R = PF.run(pl, PF.defaults(pl)), pieces = ED.describePlan(pl).pieces;
  const f = planFacts(pl, { site: { acres: 10.01, frontageFt: 800, widthFt: 800, depthFt: 545, city: 'Katy' }, pieces, pf: R, project: 'Katy test' });
  assert.equal(f.layout, pl.variant.name); assert.equal(f.request, '200 garden apartments'); assert.equal(f.site.city, 'Katy'); assert.match(f.site.zoning, /no zoning/, 'no zoning recorded: said so');
  assert.equal(f.parking.required, m.required); assert.equal(f.parking.provided, m.spaces); assert.equal(f.totals.units, m.units);
  assert.deepEqual(f.parking.byUse.find(u => u.use === 'Multifamily').rule, '1.6 spaces per unit', 'the rule apartments are parked by');
  assert.ok(f.parking.required > 0 && f.parking.note, 'and that it is a typical ratio');
  assert.equal(f.stormwater.approach, st.mode); assert.equal(f.stormwater.storageNeededAcreFt, Math.round(st.volume * 100) / 100); assert.equal(f.stormwater.pondAreaDrawnSf, Math.round(m.pond));
  assert.ok(st.volume > 0 && /0\.55 acre-feet/.test(f.stormwater.rule), 'detention needed, and the rule it was sized by');
  assert.equal(f.proForma.budget.totalCost, Math.round(R.budget.total)); assert.ok(f.proForma.returns.yieldOnCostPct != null && f.proForma.assumptions.exitCapPct > 0, 'returns and the assumptions behind them');
  assert.equal(f.lastBuild.thisLayout.aiScore, 82); assert.deepEqual(f.lastBuild.thisLayout.aiProblems, ['Pond far from the homes']); assert.equal(f.lastBuild.effort, 'ultra');
  const pf = f.lastBuild.plannedFirst; assert.ok(pf && /clubhouse/.test(pf.concept), 'the plan made before placing goes along');
  assert.deepEqual(pf.placement, ['middle: clubhouse and pool (central to every building)', 'back: detention pond (the low corner)']); assert.match(pf.stormwater, /^detention at the back/); assert.deepEqual(pf.otherPlansDrafted, ['Bars along the street']);
  assert.equal(f.lastBuild.otherLayouts[0].parking, '300 / 304'); assert.ok(f.lastBuild.thisLayout.engineNotes.length > 0, 'the engine’s notes on this layout');
  const club = f.pieces.find(p => /club/i.test(p.name || '')); assert.ok(club && club.at.length === 2, 'where the clubhouse sits, in street terms');
  assert.ok(f.pieces.every(p => !('id' in p)), 'no ids: the model talks in names');
  assert.ok(Array.isArray(f.checks) ? f.checks.length : /all pass/.test(f.checks), 'the checks, or that they all pass'); assert.ok(json(f).length < 40000, 'compact: ' + json(f).length);
  assert.ok(!json(f).includes('NaN') && !json(f).includes('null'), 'nothing empty or broken sent'); }

// a retail strip filled to Phase 2: what was asked for and the whole site, the ratio per 1,000 sq ft, the TestFit method
{ const pl = build(site(700, 600, { use: 'retail', gfa: 25000 }, { params: { fill: true } })); delete pl._o;
  const m = S.metrics(pl), f = planFacts(pl, { pf: PF.run(pl, { ...PF.defaults(pl), method: 'simple' }) });
  assert.equal(f.parking.byUse[0].rule, '4 spaces per 1,000 sq ft'); assert.equal(f.program.parkingRule, '4 spaces per 1,000 sq ft');
  if (pl.elements.some(e => e.phase === 2)) { assert.ok(f.totals.phase1 && f.totals.phase1.floorAreaSf < m.gfa, 'Phase 1 apart from the whole site'); assert.ok(f.parking.forWhatWasAsked, 'parking for what was asked'); }
  assert.match(f.proForma.method, /TestFit/); assert.equal(f.proForma.budget.totalCost, Math.round(PF.run(pl, { ...PF.defaults(pl), method: 'simple' }).simple.cost));
  assert.equal(f.lastBuild, undefined, 'no build recorded: nothing made up'); }

// a pad under an acre: no on-site detention, and why
{ const pl = build(site(200, 180, { use: 'restaurant', gfa: 3500 })); delete pl._o;
  const f = planFacts(pl, {}); assert.equal(f.stormwater.approach, 'none'); assert.match(f.stormwater.rule, /under an acre/); assert.equal(f.stormwater.storageNeededAcreFt, 0);
  assert.equal(f.parking.byUse[0].rule, '10 spaces per 1,000 sq ft'); assert.equal(f.proForma, undefined, 'no pro forma passed: none sent'); }

// a second use placed by hand, an out-of-date layout, setbacks and zoning as set
{ const pl = build(site(600, 420, { use: 'retail', gfa: 20000 }, { setbacks: { ...S.SETBACKS, front: 35 }, zoning: { district: 'C-2', max_far: 0.5 } })); delete pl._o;
  pl.elements = pl.elements.concat([{ id: 'x1', kind: 'building', x: 500, y: 350, w: 50, d: 60, rot: 0, use: 'office', floors: 2, name: 'Office' }]); pl.variant = { ...pl.variant, edited: true }; pl.stale = 'site';
  const f = planFacts(pl, {});
  assert.deepEqual(f.parking.byUse.map(u => u.use).sort(), ['Office', 'Retail'], 'parking by each use'); assert.equal(f.parking.byUse.find(u => u.use === 'Office').rule, '3.5 spaces per 1,000 sq ft');
  assert.equal(f.editedByHand, true); assert.match(f.outOfDate, /outline changed/); assert.equal(f.setbacksFt.front, 35); assert.equal(f.site.zoning.district, 'C-2'); assert.equal(f.site.zoning.max_far, 0.5); }

// the money alone
{ const pl = build(site(600, 420, { use: 'office', gfa: 40000, floors: 2 })); delete pl._o;
  const R = PF.run(pl, PF.defaults(pl)), F = finFacts(R); assert.equal(F.stabilizedYear.noi, Math.round(R.ops.noi)); assert.equal(F.scheduleMonths.construction, R.sched.build); assert.match(F.method, /month by month/); }

console.log('planask ok: effort levels, old settings read across, and the plan’s fact sheet on real layouts');
