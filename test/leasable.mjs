// Offline tests for the owner's goal on a real parcel, the 20.6-acre tract in the City of Waller on FM 2920 / Waller
// Tomball Rd (about 1,430 × 630 ft, the appraisal district's outline in feet from its centre; the Waller guardrails'
// base case: 1.00 ac-ft of detention per developed acre, a pond about 4 ft deep, 59 × 118 ft lots). The developer:
// "I still believe that we can fit more houses, future development in phase 2 should be off by default, the goal is to
// maximize the leasable sf on the property." So:
// 1. the leftover land is filled by default (no "Phase 2", no "Future development · not in this phase"), held only when
//    the words or Settings ask (lib/planruns.mjs fillParams, lib/siteplan.mjs fillMode, lib/sitelayout.mjs layoutFill);
// 2. layouts are ranked by leasable + sellable square feet after the rules (lib/siteplan.mjs metrics leasable / sellable,
//    lib/sitelayout.mjs mixedOptions, lib/sitepods.mjs planScore, lib/planpick.mjs), the pond beside the shops so the
//    homes get the full width behind;
// 3. deeper ponds (6 and 8 ft, an engineering assumption) are tried as layouts of their own, each labelled, the storage
//    rate never lowered (lib/sitelayout.mjs withDeeper, lib/guardrails.mjs withPondDepth).
import assert from 'node:assert/strict';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), G = await import('../lib/guardrails.mjs'), RUN = await import('../lib/planruns.mjs'), K = await import('../lib/planpick.mjs');

const WALLER = { ring: [[707.3, 318.3], [-597.4, 312.56], [-655.48, 311.43], [-713.5, 308.52], [-711.57, -317.94], [717.77, -310.96]], origin: [-95.902015, 30.0645665], front: 0,
  streets: [], setbacks: { ...S.SETBACKS, front: 26.25, side: 15.75, rear: 10.5, paving: 10 }, params: {}, jur: { status: 'city', road: 'FM 2920', cls: 'VERIFIED REQUIREMENT' }, elements: [], streetNames: { 0: 'Waller Tomball Rd' } };
const ASK = 'A residential neighborhood with retail in the front. along the road, 1600-2100 SF homes across 3 floorplans. Lots for residential need a minimum of 6600 SF per total lot.';
const WORDS = S.guessProgram(ASK);
// the AI's program as it answered for this request (test/homeprogram.mjs): the retail sized, the homes' size range
const AI = { use: 'retail', zones: [{ use: 'retail', gfa: 24685, floors: 1, buildings: 1, name: 'Retail along the road', place: { where: 'along', road: 'Waller Tomball Rd' } }, { use: 'sfr', name: 'Residential neighborhood', homeSfMax: 2100, place: { where: 'back' } }], homeSfMin: 1600, homeSfMax: 2100, floorPlans: 3, minLotSf: 6600 };
const AC = 43560, site = S.ringArea(WALLER.ring);
const laidOut = (prog, plan = WALLER, opts = { count: 3 }) => { const g = G.forLayout({ ...plan, program: prog }, prog, opts); return g ? { plan: g.plan, out: L.layoutOptions(g.plan, g.program, g.opts) } : { plan, out: L.layoutOptions(plan, prog, opts) }; };
const homes = o => o.elements.filter(e => e.kind === 'building' && e.use === 'sfr').length;
const retail = o => o.elements.filter(e => e.kind === 'building' && e.use === 'retail').reduce((t, e) => t + S.gfaOf(e), 0);
const pondAc = o => o.elements.filter(e => e.kind === 'pond').reduce((t, e) => t + S.elArea(e), 0) / AC;
const mOf = (plan, o) => S.metrics({ ...plan, program: o.program, elements: o.elements });
// the hard rules every layout keeps: no failing check, parking met, the detention met (or its shortfall said)
function rules(plan, o, what, need = S.stormOf({ ...plan, program: o.program, elements: o.elements }).area) { // (the detention for the land developed, as Numbers measures it)
  const p = { ...plan, program: o.program, elements: o.elements }, m = S.metrics(p);
  assert.deepEqual(S.check(p).filter(i => i.level === 'bad').map(i => i.text), [], what + ': the checks');
  assert.ok(m.spaces >= m.required, what + ': parked ' + m.spaces + '/' + m.required);
  assert.ok(m.pond >= need * 0.9 || (o.notes || []).some(n => /hold about \d+% of the detention/.test(n)), what + ': the detention (' + (m.pond / AC).toFixed(2) + ' of ' + (need / AC).toFixed(2) + ' ac)');
  return m;
}

// ---- 1. the objective's numbers: leasable + sellable, from the metrics ----
{ const hs = [{ kind: 'building', use: 'sfr', x: 0, y: 0, w: 40, d: 50, units: 1, sf: 1850, floors: 1 }, { kind: 'building', use: 'sfr', x: 100, y: 0, w: 40, d: 50, units: 1, sf: 2050, floors: 2 }, { kind: 'building', use: 'retail', x: 0, y: 300, w: 200, d: 100, floors: 1 }];
  const m = S.metrics({ ...WALLER, program: S.normalizeProgram(AI), elements: hs });
  assert.equal(m.sellable, 3900, 'sellable: the homes’ living area'); assert.equal(Math.round(m.leasable), Math.round(20000 * 0.95), 'leasable: the shops at their net share');
  assert.equal(S.lsfOf(m), m.leasable + m.sellable); assert.equal(S.lsfOf(m), m.nrsf); }

// ---- 2. the leftover land: filled unless asked (the words, Settings), whatever an AI or an earlier build set ----
{ // the saved plans for this tract (Options A–D) all carried params { fill: false }, set by the AI's plan, never by a person
  for (const params of [{ fill: false }, { fill: false, streets: 'straight' }, { fill: false, guard: { outfall: 'ditch' } }]) { const p = RUN.fillParams(params, { ask: ASK }); assert.equal(p.fill, undefined, JSON.stringify(params) + ': filled'); assert.equal(S.fillMode(p), 'fill'); assert.equal(RUN.leftoverOf(p), 'fill'); }
  assert.deepEqual(RUN.fillParams({ fill: false, guard: { outfall: 'ditch' } }, { ask: ASK }).guard, { outfall: 'ditch' }, 'the other settings kept');
  assert.equal(RUN.fillParams({ fill: false, fillBy: 'you' }, { ask: ASK }).fill, false, 'held because you set it under Settings');
  assert.equal(RUN.fillParams({ fill: 'phase', fillBy: 'you' }, { ask: ASK }).fill, 'phase');
  assert.equal(RUN.fillParams({}, { ask: ASK + ' Leave the back for a future phase.' }).fill, false, 'the words hold it'); assert.equal(RUN.fillParams({}, { ask: 'retail now, the rest as phase 2' }).fill, 'phase', 'the words mark Phase 2');
  for (const t of [ASK, '25,000 sf retail strip', 'keep the trees along the creek', 'leave the creek open']) assert.equal(RUN.holdAsked(t), null, t);
  for (const t of ['hold the back 10 acres for later', 'reserve land for future development', 'land bank the rest']) assert.equal(RUN.holdAsked(t), 'hold', t);
  assert.equal(RUN.leftoverParam('hold'), false); assert.equal(RUN.leftoverParam('phase'), 'phase'); assert.equal(RUN.leftoverParam('fill'), true);
  assert.deepEqual(RUN.LEFTOVER.map(([k]) => k), ['fill', 'phase', 'hold']); }
// on the tract: shops alone (25,000 sf asked) fill it with more of the same as one plan; held, the rest is Future development
{ const prog = { use: 'retail', gfa: 25000 };
  const filled = laidOut(prog); assert.ok(filled.out.length >= 2);
  for (const o of filled.out) { const what = 'filled · ' + o.name; rules(filled.plan, o, what);
    assert.ok(retail(o) > 25000 * 1.3, what + ': more of the shops than asked: ' + Math.round(retail(o)));
    assert.ok(!o.elements.some(e => e.phase === 2 || e.future || /^Future/.test(e.name || '') || /not in this phase|Phase 2/.test(e.note || '')), what + ': no Phase 2, no land held for later');
    assert.ok(!o.notes.some(n => /^Phase 1 is what was asked|left for a future phase|later phases/.test(n)), what + ': ' + o.notes.join(' / ')); assert.match(o.notes[0], /^Asked for 1 building, 25,000 sq ft; the land holds \d+ buildings/); }
  const held = laidOut(prog, { ...WALLER, params: { fill: false, fillBy: 'you' } });
  for (const o of held.out) { assert.ok(Math.abs(retail(o) - 25000) < 25000 * 0.05, 'held: what was asked ' + Math.round(retail(o))); assert.ok(o.elements.some(e => e.future && /^Future/.test(e.name || '')), 'held: the rest is land for later'); }
  const phased = laidOut(prog, { ...WALLER, params: { fill: 'phase', fillBy: 'you' } });
  assert.ok(phased.out.some(o => o.elements.some(e => e.phase === 2)), 'Phase 2 marked when asked');
  for (const o of phased.out) if (o.elements.some(e => e.phase === 2)) assert.match(o.notes[0], /^Phase 1 is what was asked for/); }

// ---- 3. the request on the tract, guardrails on: more homes, the rules kept, the objective leading ----
// what this request gave on the tract before (Oct 21, the engine as it was): 32 homes in every layout; the most leasable +
// sellable square feet of the three, 78,500 (the words) and 82,951 (the AI's 24,685 sf of shops)
const BEFORE = { 'the words': { homes: 32, lsf: 78500 }, 'the AI': { homes: 32, lsf: 82951 } };
const runs = {};
for (const [what, prog, ask, more] of [['the words', WORDS, 15000, 4], ['the AI', AI, 24685 * 0.97, 0]]) { // (more: homes gained at 4 ft; the AI's sized shops and the second way in leave no more room for homes there, its deeper ponds do)
  const t0 = Date.now(), { plan, out } = laidOut(prog, WALLER, { count: 3, deeper: true }), ms = Date.now() - t0; runs[what] = { plan, out };
  const base = out.filter(o => !o.pondDepth), deep = out.filter(o => o.pondDepth);
  assert.ok(base.length >= 2 && out.indexOf(base[base.length - 1]) === base.length - 1, what + ': the usual depth first, the deeper ponds after');
  for (const o of base) { const w = what + ' · ' + o.name, m = rules(plan, o, w);
    assert.ok(retail(o) >= ask, w + ': the shops asked for: ' + Math.round(retail(o)));
    assert.ok(!o.elements.some(e => e.future || e.phase === 2), w + ': nothing held for later');
    assert.ok(S.lsfOf(m) > 0 && m.sellable > 0 && m.leasable > 0, w + ': leasable and sellable'); }
  const most = Math.max(...base.map(homes));
  assert.ok(most >= BEFORE[what].homes + more, what + ': homes at the usual 4 ft pond: ' + base.map(homes).join('/'));
  assert.ok(Math.max(...base.map(o => S.lsfOf(mOf(plan, o)))) >= BEFORE[what].lsf - 1, what + ': no less leasable + sellable than before: ' + base.map(o => Math.round(S.lsfOf(mOf(plan, o)))).join(' / '));
  if (more) assert.ok(base.some(o => /pond beside the shops/.test(o.name)), what + ': the pond beside the shops among them: ' + base.map(o => o.name).join(' | '));
  if (more) assert.ok(/pond beside the shops/.test(base[0].name) || /pond beside the shops/.test(base[1].name), what + ': it leads');
  // the objective: the engine's first layout holds near the most leasable + sellable sf of them (within a few homes: a
  // second way in for fire access can put another first), and the set says which holds the most
  const l = base.map(o => S.lsfOf(mOf(plan, o))); assert.ok(l[0] >= Math.max(...l) * 0.9, what + ': the first layout near the most leasable + sellable: ' + l.map(Math.round).join(' / '));
  const vs = out.map((o, i) => ({ ...o, rank: -i, key: 'k' + i, m: mOf(plan, o), m1: null, chk: K.checksOf(S.check({ ...plan, program: o.program, elements: o.elements }), mOf(plan, o)) }));
  const bg = K.badges(vs, K.recommended(vs, null)), top = vs.map(K.lsf).indexOf(Math.max(...vs.map(K.lsf)));
  assert.ok(bg[top].includes('Most leasable + sellable sf'), what + ': the badge on the one with the most: ' + JSON.stringify(bg));
  assert.deepEqual(K.sortOrder(vs, 'lsf').map(i => Math.round(K.lsf(vs[i]))), vs.map(K.lsf).map(Math.round).sort((a, b) => b - a), what + ': sorted by it');
  // ---- 4. deeper ponds: labelled, the same storage, smaller ponds, more homes and floor area ----
  assert.ok(deep.length >= 1, what + ': a deeper pond offered: ' + out.map(o => o.name).join(' | '));
  const b = base[0], bl = S.lsfOf(mOf(plan, b));
  for (const o of deep) { const w = what + ' · ' + o.name, d = o.pondDepth, pd = G.effective(G.withPondDepth({ ...WALLER, program: prog }, d)), need = S.stormNeed(site / AC, pd.params, S.normalizeProgram(o.program), site / AC);
    assert.ok([6, 8].includes(d) && o.name.endsWith(' · ' + d + ' ft deep pond'), w + ': named for its depth');
    assert.match(o.notes[0], new RegExp('^Assumes an? ' + d + ' ft deep pond \\(average storage depth; this plan assumes 4 ft, with 4:1 side slopes\\): confirm with your civil engineer\\. A dry pond needs an outfall deep enough to drain it; a wet-bottom pond holds the storage above its normal pool\\. Against the 4 ft layout: [\\d.]+ → [\\d.]+ acres of pond for the same 20\\.6 acre-feet'), w + ': says what it assumes and buys: ' + o.notes[0]);
    assert.equal(pd.params.storm.rate, 1, w + ': the guardrail’s 1.00 ac-ft per acre, never lowered'); assert.equal(G.settingsOf(G.withPondDepth(WALLER, d)).depth, d, 'the depth on the guardrails’ setting');
    rules(plan, o, w, need.area); assert.ok(need.area < S.stormNeed(site / AC, plan.params, S.normalizeProgram(o.program), site / AC).area, w + ': a smaller footprint for the same volume');
    assert.ok(pondAc(o) < pondAc(b), w + ': less pond: ' + pondAc(o).toFixed(2) + ' vs ' + pondAc(b).toFixed(2) + ' ac');
    assert.ok(S.lsfOf(mOf(plan, o)) > bl && homes(o) >= homes(b), w + ': what it buys: ' + homes(o) + ' homes vs ' + homes(b) + ', ' + Math.round(S.lsfOf(mOf(plan, o))) + ' vs ' + Math.round(bl) + ' sf');
    assert.ok(retail(o) >= ask, w + ': the shops asked for'); assert.deepEqual(o.deeper && [o.deeper.depth, o.deeper.base], [d, 4]); }
  assert.ok(Math.max(...deep.map(homes)) >= most + 4, what + ': a deeper pond buys homes: ' + deep.map(homes).join('/') + ' vs ' + most);
  assert.ok(ms < 30000, what + ': in good time with the deeper ponds (' + ms + ' ms)');
  console.log(what + ' (guardrails): ' + out.map(o => o.name.replace(/^.*?(· pond beside the shops)?( · \d ft deep pond)?$/, (m, a, d) => (d ? d.slice(3) : '4 ft') + (a ? ' beside' : '')) + ' ' + homes(o) + ' homes, ' + Math.round(retail(o)).toLocaleString('en-US') + ' sf retail, pond ' + pondAc(o).toFixed(2) + ' ac').join(' | '));
}
// without the deeper ones asked for (Re-fit, a layout laid again): none
assert.ok(!laidOut(WORDS).out.some(o => o.pondDepth), 'deeper ponds only when the search is asked to try them');
// off the guardrails (outside the city): the plan's own depth (5 ft) is the base; a deeper pond is offered only where it buys something, else the first layout says so
{ const plan = { ...WALLER, jur: null }, out = L.layoutOptions(plan, WORDS, { count: 3, deeper: true }), base = out.filter(o => !o.pondDepth), deep = out.filter(o => o.pondDepth);
  for (const o of base) rules(plan, o, 'no guardrails · ' + o.name);
  assert.ok(Math.max(...base.map(homes)) >= 48, 'no guardrails: homes ' + base.map(homes).join('/'));
  if (deep.length) for (const o of deep) { assert.match(o.notes[0], /this plan assumes 5 ft\): confirm with your civil engineer/); assert.ok(S.lsfOf(mOf(plan, o)) > S.lsfOf(mOf(plan, base[0]))); assert.equal(G.withPondDepth(plan, o.pondDepth).params.storm.depth, o.pondDepth, 'off the guardrails: the plan’s own pond depth'); }
  else assert.ok(base[0].notes.some(n => /^A deeper pond \(6 or 8 ft\) gains no leasable or sellable floor area/.test(n)), 'says why none is offered');
  console.log('no guardrails: ' + out.map(o => (o.pondDepth || 5) + ' ft ' + homes(o) + ' homes, ' + Math.round(retail(o)).toLocaleString('en-US') + ' sf retail, pond ' + pondAc(o).toFixed(2) + ' ac').join(' | ')); }

// ---- 5. the AI is told the goal ----
{ const API = await import('../api/siteplan.js');
  assert.match(API.REVIEW_SYSTEM, /The owner's goal, what to rank by: the most leasable \+ sellable square footage/); assert.match(API.REVIEW_SYSTEM, /pondDepthFtAssumed/);
  assert.match(API.STRATEGY_SYSTEM, /The owner's goal is the most leasable and sellable square footage/);
  assert.match(API.STRATEGY_SCHEMA.properties.strategies.items.properties.settings.properties.fill.description, /only when the request asks/); }

console.log('leasable ok');
