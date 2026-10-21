// Offline tests for a neighbourhood's own numbers and a mix on a shallow site (lib/siteplan.mjs homeSpec / homeProgram /
// guessProgram, lib/buildings.mjs housePlansFor, lib/sitelayout.mjs lotsIn and mixedOptions, lib/streetnet.mjs, the AI's
// program in api/siteplan.js, lib/openai.mjs withRoom), on a real parcel: a 20.6-acre tract in the City of Waller with
// about 1,430 ft on FM 2920 / Waller Tomball Rd and about 630 ft of depth (the outline is the appraisal district's, in
// feet from its centre). The request that came back with no homes at all: "A residential neighborhood with retail in
// the front. along the road, 1600-2100 SF homes across 3 floorplans. Lots for residential need a minimum of 6600 SF per
// total lot." Read from the words and from the AI (as the AI really answered: the homes' size put in the home zone's
// floor area), it now lays out the retail along the road with a neighbourhood behind it from three house plans in the
// size range, every lot at least 6,600 sf and at least the Waller guardrails' 59 × 118 ft lot, and the detention placed
// (at an end of the rows when a band across the back leaves no depth for the homes), every lot reached, no overlaps.
import assert from 'node:assert/strict';
process.env.OPENAI_API_KEY = 'sk-test'; process.env.OPENAI_MODEL = 'gpt-test';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), G = await import('../lib/guardrails.mjs'), B = await import('../lib/buildings.mjs'), RUN = await import('../lib/planruns.mjs'), OA = await import('../lib/openai.mjs');
const API = await import('../api/siteplan.js');

// ---- the site: the Waller tract on FM 2920 (front: edge 0), inside the City of Waller ----
const WALLER = { ring: [[707.3, 318.3], [-597.4, 312.56], [-655.48, 311.43], [-713.5, 308.52], [-711.57, -317.94], [717.77, -310.96]], origin: [-95.902015, 30.0645665], front: 0,
  streets: [], setbacks: { ...S.SETBACKS, front: 26.25, side: 15.75, rear: 10.5, paving: 10 }, params: {}, jur: { status: 'city', road: 'FM 2920', cls: 'VERIFIED REQUIREMENT' }, elements: [], streetNames: { 0: 'Waller Tomball Rd' } };
const ASK = 'A residential neighborhood with retail in the front. along the road, 1600-2100 SF homes across 3 floorplans. Lots for residential need a minimum of 6600 SF per total lot.';
assert.ok(Math.abs(S.ringArea(WALLER.ring) / 43560 - 20.6) < 0.1, 'the 20.6-acre tract');

// ---- helpers: the network from every way in (as test/sitepods.mjs) ----
const box = s => { const xs = s.map(p => p[0]), ys = s.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }, meet = (a, b, g = 2) => a[0] <= b[2] + g && b[0] <= a[2] + g && a[1] <= b[3] + g && b[1] <= a[3] + g;
function reachedAll(els) {
  const D = els.filter(e => e.kind === 'drive' || e.kind === 'truck'), G0 = D.map(e => e.poly ? { ...e, poly: S.grow(e.poly, 1.5) } : e.path ? { ...e, width: (e.width || 26) + 3 } : { ...e, w: e.w + 3, d: e.d + 3 }), Bx = G0.map(g => box(S.shapeOf(g)));
  const seen = new Set(S.entrancesOf(els).map(e => e.id)), st = D.filter(e => seen.has(e.id));
  while (st.length) { const e = st.pop(), i = D.indexOf(e); D.forEach((f, j) => { if (!seen.has(f.id) && meet(Bx[i], Bx[j]) && S.rectsOverlap(G0[i], G0[j], 0)) { seen.add(f.id); st.push(f); } }); }
  return { seen, D, G0, Bx };
}
// every drive and parking row reached from a way in; every home within 60 ft of a reached street, on a lot of its own;
// no two lots, no two buildings and no lot and pond overlapping
function sound(els, what) {
  const R = reachedAll(els), near = R.D.filter(d => R.seen.has(d.id)).map(d => ({ q: S.shapeOf(d), b: box(S.shapeOf(d)) }));
  assert.ok(S.entrancesOf(els).length >= 1, what + ': a way in');
  for (const d of R.D) if (d.note !== 'Drive-thru lane') assert.ok(R.seen.has(d.id), what + ': drive ' + (d.name || d.note) + ' is cut off');
  for (const e of els.filter(e => e.kind === 'parking')) { const g = { ...e, w: e.w + 3, d: e.d + 3 }, b = box(S.shapeOf(g)); assert.ok(R.D.some((d, i) => R.seen.has(d.id) && meet(b, R.Bx[i]) && S.rectsOverlap(g, R.G0[i], 0)), what + ': a parking row is off the network'); }
  const H = els.filter(e => e.kind === 'building' && e.use === 'sfr'), lots = els.filter(e => e.kind === 'lot');
  for (const h of H) { assert.ok(near.some(r => h.x > r.b[0] - 120 && h.x < r.b[2] + 120 && h.y > r.b[1] - 120 && h.y < r.b[3] + 120 && S.gapBetween(S.shapeOf(h), r.q) <= 60), what + ': ' + h.name + ' has no street');
    assert.equal(lots.filter(l => S.inRing([h.x, h.y], S.shapeOf(l))).length, 1, what + ': ' + h.name + ' on one lot of its own'); }
  const inset = e => { const q = S.shapeOf(e); return S.grow(S.signedArea(q) >= 0 ? q : q.slice().reverse(), -0.6); }, hit = (a, b) => S.rectsOverlap({ poly: inset(a) }, { poly: inset(b) }, 0); // (lots that share a line touch: only more than that is an overlap)
  const ov = list => { for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) assert.ok(!hit(list[i], list[j]), what + ': ' + (list[i].name || list[i].note || list[i].kind) + ' overlaps ' + (list[j].name || list[j].note || list[j].kind)); };
  ov(lots); ov(els.filter(e => e.kind === 'building'));
  for (const p of els.filter(e => e.kind === 'pond')) for (const l of lots) assert.ok(!hit(p, l), what + ': a pond over ' + (l.name || 'a lot'));
}
// the layout as the browser makes it on a Waller plan: the guardrails' inputs to the engine (lib/guardrails.mjs forLayout)
const laidOut = (prog, plan = WALLER) => { const g = G.forLayout({ ...plan, program: prog }, prog, { count: 3 }); return g ? { plan: g.plan, out: L.layoutOptions(g.plan, g.program, g.opts) } : { plan, out: L.layoutOptions(plan, prog, { count: 3 }) }; };
const frontDist = (plan, e) => S.segDist([e.x, e.y], plan.ring[plan.front], plan.ring[(plan.front + 1) % plan.ring.length]);
// the user's request on the tract: retail along the road, the homes behind it, as asked; the detention placed, or its shortfall said
function asked(plan, o, what, { retail, minLot, minHomes }) {
  const els = o.elements, H = els.filter(e => e.kind === 'building' && e.use === 'sfr'), R = els.filter(e => e.kind === 'building' && e.use === 'retail'), lots = els.filter(e => e.kind === 'lot'), p = { ...plan, elements: els, program: o.program };
  assert.ok(R.length && R.reduce((t, e) => t + S.gfaOf(e), 0) >= retail, what + ': the retail, ' + Math.round(R.reduce((t, e) => t + S.gfaOf(e), 0)) + ' sf');
  assert.ok(H.length >= minHomes, what + ': ' + H.length + ' homes');
  assert.ok(Math.max(...R.map(e => frontDist(plan, e))) < Math.min(...H.map(e => frontDist(plan, e))), what + ': the retail along the road, the homes behind it');
  assert.ok(H.every(h => h.sf >= 1600 && h.sf <= 2100), what + ': homes of 1,600–2,100 sf: ' + [...new Set(H.map(h => h.sf))]);
  const plans = new Set(H.map(h => h.type)); assert.equal(plans.size, 3, what + ': three floor plans: ' + [...plans]); assert.ok([...plans].every(t => B.typeById(t)?.family === 'house'), what + ': the builder’s house plans');
  assert.equal(lots.length, H.length, what + ': a lot for each home');
  const small = Math.min(...lots.map(l => S.ringArea(S.shapeOf(l)))); assert.ok(small >= minLot - 1, what + ': the smallest lot ' + Math.round(small) + ' sf (at least ' + minLot + ')');
  assert.ok(!(o.notes || []).some(n => /^No homes fit/.test(n)), what + ': homes laid out');
  assert.deepEqual(S.check(p).filter(i => i.level === 'bad').map(i => i.text), [], what + ': the checks');
  const ac = S.ringArea(plan.ring) / 43560, need = S.stormNeed(ac, plan.params || {}, S.normalizeProgram(o.program), ac).area, pond = els.filter(e => e.kind === 'pond').reduce((t, e) => t + S.elArea(e), 0);
  assert.ok(pond >= need * 0.9 || (o.notes || []).some(n => /hold about \d+% of the detention/.test(n)), what + ': the detention placed (' + Math.round(pond) + ' of ' + Math.round(need) + ' sf) or its shortfall said');
  sound(els, what);
  return { homes: H.length, smallest: Math.round(small), pond, need, plans: [...plans] };
}

// ---- 1. the words: retail at the front, the homes' size, floor plans and smallest lot (no floors, no floor area) ----
const words = S.guessProgram(ASK);
{ assert.deepEqual(words.zones.map(z => z.use), ['retail', 'sfr']); assert.equal(words.zones[0].place?.where, 'front', 'retail in the front');
  assert.equal(words.floors, undefined, '"3 floorplans" is no floors'); assert.equal(words.gfa, undefined, '"2100 sf" is a home, not floor area'); assert.ok(!words.atLeast, 'a minimum lot is no minimum floor area');
  for (const q of [words, words.zones[1]]) assert.deepEqual([q.homeSfMin, q.homeSfMax, q.floorPlans, q.minLotSf], [1600, 2100, 3, 6600]);
  assert.ok(!words.zones.some(z => z.gfa || z.floors), 'no zone sized by a home');
  const n = S.normalizeProgram(words); assert.deepEqual(RUN.notUnderstood(ASK, n), [], 'nothing left not understood');
  assert.ok(['Homes 1,600–2,100 sf', '3 floor plans', 'Lots at least 6,600 sf'].every(c => RUN.readAs(n, S.USES).includes(c)), 'read as: ' + RUN.readAs(n, S.USES));
  // more ways of saying it
  const g = t => S.guessProgram(t);
  assert.deepEqual([g('50 homes of 1,800 to 2,600 sq ft, four house plans, minimum lot 7000 sf').homeSfMin, g('50 homes of 1,800 to 2,600 sq ft, four house plans, minimum lot 7000 sf').floorPlans, g('50 homes of 1,800 to 2,600 sq ft, four house plans, minimum lot 7000 sf').minLotSf], [1800, 4, 7000]);
  assert.equal(g('50 homes of 1,800 to 2,600 sq ft').use, 'sfr'); assert.equal(g('120 homes on 7,000 sf lots').minLotSf, 7000); assert.equal(g('120 homes on 7,000 sf lots').gfa, undefined);
  assert.deepEqual([g('a subdivision with 60 x 120 lots').lotW, g('a subdivision with 60 x 120 lots').lotD], [60, 120]);
  assert.deepEqual(g('25,000 sf retail strip with 4.5/1000 parking'), { use: 'retail', gfa: 25000, ratio: 4.5 }, 'other requests as before');
  assert.equal(g('a 4 story office with 3 floor plans').floors, 4, 'stories still read');
  assert.deepEqual(RUN.notUnderstood('3 floor plans', S.normalizeProgram({ use: 'sfr' })), ['3 floor plans'], 'plans the program lacks are flagged, not read as floors'); }

// ---- 2. the safety net: a home's size given as a home zone's floor area ----
{ const z = S.normalizeProgram({ use: 'retail', zones: [{ use: 'retail', gfa: 24685 }, { use: 'sfr', gfa: 2100 }, { use: 'townhomes', gfa: 1800 }] }).zones;
  assert.deepEqual([z[1].gfa, z[1].homeSfMax, z[2].gfa, z[2].homeSfMax], [null, 2100, null, 1800], 'one home’s size, not the zone’s total');
  assert.equal(S.normalizeProgram({ use: 'retail', zones: [{ use: 'retail', gfa: 3000 }, { use: 'sfr', gfa: 40000 }] }).zones[1].gfa, 40000, 'a real total stays');
  assert.equal(S.normalizeProgram({ use: 'retail', zones: [{ use: 'retail', gfa: 3000 }, { use: 'sfr', gfa: 2100, units: 40 }] }).zones[1].gfa, 2100, 'with a count: left as it was');
  assert.equal(S.normalizeProgram({ use: 'retail', zones: [{ use: 'retail', gfa: 3000 }, { use: 'sfr' }] }).zones[1].homeSfMax, undefined, 'no keys when nothing asked (saved plans compare the same)');
  const hp = S.homeProgram(S.normalizeProgram({ use: 'retail', homeSfMin: 1600, floorPlans: 3, lot: { minW: 59, front: 26.25, side: 5.25, minSf: 6962 }, lotD: 118, zones: [{ use: 'retail', gfa: 3000 }, { use: 'sfr', gfa: 2100, minLotSf: 6600 }] }), S.normalizeProgram({ use: 'retail', zones: [{ use: 'retail', gfa: 3000 }, { use: 'sfr', gfa: 2100, minLotSf: 6600 }] }).zones[1]);
  assert.deepEqual([hp.homeSfMin, hp.homeSfMax, hp.floorPlans, hp.minLotSf, hp.lotD, hp.lot.minSf], [1600, 2100, 3, 6600, 118, 6962], 'the zone’s own, else the program’s; the lot rules kept');
  // the plans for a size range: as many as asked, spread across it, the builder's front-load plans
  const P3 = B.housePlansFor({ min: 1600, max: 2100, n: 3 }); assert.equal(P3.length, 3); assert.ok(P3.every(h => h.sf >= 1600 && h.sf <= 2100 && h.family === 'house' && !/rear-load|side-load/.test(h.id)));
  assert.ok(P3[0].sf <= 1700 && P3[2].sf >= 2000, 'one near each end: ' + P3.map(h => h.sf));
  assert.deepEqual(B.housePlansFor({}), [], 'nothing asked: the stories mix as before'); assert.equal(B.housePlansFor({ min: 5000, max: 6000, n: 2 }).length, 2, 'none that big: the nearest');
  // Waller: a mix with a neighbourhood gets the single-family lot rules too (59 × 118 ft, 6,962 sf at the full factor)
  const wp = { ...WALLER, program: S.normalizeProgram(words) }; assert.deepEqual(G.rulesOf(wp).lot && [G.rulesOf(wp).lot.minW, G.rulesOf(wp).lot.minD], [59, 118]);
  assert.equal(G.effective(wp).program.lot.minSf, 6962); assert.equal(G.effective(G.withScenario(wp, 'A')).program.lot.minSf, 6498, 'the verified 57 × 114 in the maximum envelope'); }

// ---- 3. the AI's program, as it answered (the homes' size in the zone's floor area, nothing for the plans or the lot) ----
let ip = 0; const call = async body => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; await API.default({ method: 'POST', body, headers: { 'x-forwarded-for': '10.77.' + Math.floor(++ip / 200) + '.' + (ip % 200) } }, r); return r; };
const nulls = sc => Object.fromEntries(Object.keys(sc.properties).map(k => [k, null]));
const zoneAI = o => ({ ...nulls(API.SCHEMA.properties.zones.items), items: [], placement: { where: null, road: null, next: [], side: null }, ...o });
const AI_PROGRAM = { ...nulls(API.SCHEMA), use: 'retail', gfa: 2100, floors: 2, extras: [], setbacks: { front: null, side: null, rear: null, paving: null }, storage: { climateSf: null, driveSf: null, rv: null }, foodtrucks: { trucks: null, pavilionSf: null, bar: null, barSf: null, playground: null, perTruck: null }, fuel: { pumps: null, storeSf: null, wash: null, vac: null, canopy: null, truckStop: null },
  custom: { name: null, pattern: null, buildings: [], outdoor: [], sites: { label: null, w: null, d: null, count: null }, parking: { per: null, rate: null, basis: null, label: null, plus1k: null }, figures: [] },
  zones: [zoneAI({ use: 'retail', gfa: 24685, floors: 1, buildings: 1, name: 'Retail along the road', placement: { where: 'along', road: 'Waller Tomball Rd', next: [], side: null } }), zoneAI({ use: 'sfr', gfa: 2100, name: 'Residential neighborhood', placement: { where: 'back', road: null, next: [], side: null } })],
  summary: 'Retail along the road with a neighbourhood behind it.', assumptions: [] };
let sent = [], replies = [];
globalThis.fetch = async (url, opts = {}) => { if (String(url).includes('/models')) return Response.json({ id: 'gpt-test', data: [{ id: 'gpt-test' }] }); const b = JSON.parse(opts.body); sent.push(b); const r = replies.length > 1 ? replies.shift() : replies[0]; return r(b); };
const answer = o => () => Response.json({ choices: [{ message: { content: JSON.stringify(o) }, finish_reason: 'stop' }], usage: {} });
const outOfRoom = (content = null) => () => Response.json({ choices: [{ message: { content }, finish_reason: 'length' }], usage: {} });
let aiProg;
{ replies = [answer(AI_PROGRAM)]; sent = []; const r = await call({ prompt: ASK, effort: 'high', site: { acres: 20.6, widthFt: 1430, depthFt: 630, frontageFt: 1305 } }); assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.match(sent[0].messages[0].content, /"3 floorplans" \(house plans, models\) is floorPlans 3, never floors/, 'the prompt maps plans'); assert.match(sent[0].messages[0].content, /minLotSf 6600/);
  for (const k of ['homeSfMin', 'homeSfMax', 'floorPlans', 'minLotSf', 'lotW', 'lotD']) { assert.ok(API.SCHEMA.required.includes(k) && API.SCHEMA.properties.zones.items.required.includes(k), k + ' in the schema'); }
  aiProg = r.body.program; const z = aiProg.zones;
  assert.deepEqual(z.map(q => q.use), ['retail', 'sfr']); assert.equal(z[0].gfa, 24685); assert.equal(z[1].gfa, null, 'the home zone’s "2,100 sf" is a home’s size'); assert.equal(z[1].homeSfMax, 2100);
  assert.deepEqual([aiProg.homeSfMin, aiProg.homeSfMax, aiProg.floorPlans, aiProg.minLotSf], [1600, 2100, 3, 6600], 'what the AI left out, from the words');
  assert.deepEqual(RUN.notUnderstood(ASK, S.normalizeProgram(aiProg)), [], 'no "Not understood: 6600 sf"');
  // when the AI does fill them in, they are kept (on the zone, and the program)
  replies = [answer({ ...AI_PROGRAM, homeSfMin: 1600, homeSfMax: 2100, floorPlans: 3, minLotSf: 6600, zones: [AI_PROGRAM.zones[0], zoneAI({ use: 'sfr', homeSfMin: 1600, homeSfMax: 2100, floorPlans: 3, minLotSf: 6600, lotW: 60, lotD: 120 })] })];
  const r2 = await call({ prompt: ASK }); assert.deepEqual(['homeSfMin', 'homeSfMax', 'floorPlans', 'minLotSf', 'lotW', 'lotD'].map(k => r2.body.program.zones[1][k]), [1600, 2100, 3, 6600, 60, 120]); }

// ---- 4. Ultra's strategy (and the program) ran out of room: asked again once with more room, a notch lower ----
{ const strat = { name: 'Retail front, homes behind', concept: 'Shops along FM 2920, a neighbourhood behind them.', placement: [{ what: 'retail', where: 'front', why: 'traffic' }, { what: 'homes', where: 'back', why: 'quiet' }], entrances: { count: 2, where: 'FM 2920', why: 'fire access' }, parking: { approach: 'in front of the shops', where: 'front', spaces: 100 }, stormwater: { type: 'detention', where: 'back', why: 'low side' },
    buildings: { count: 1, floors: 1, form: null }, numbers: { buildingSf: 24685, units: null, coveragePct: 10, fits: true, check: 'Fits.' }, settings: { streets: null, fill: null }, risks: [], rejected: [], brief: null };
  replies = [outOfRoom(), answer({ strategies: [strat, strat, strat], pick: 1, why: 'B.' })]; sent = [];
  let r = await call({ mode: 'strategy', prompt: ASK, effort: 'xhigh', count: 3 }); assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(sent.length, 2, 'asked again once');
  assert.deepEqual([sent[0].max_completion_tokens, sent[0].reasoning_effort], [40000, 'xhigh']); assert.deepEqual([sent[1].max_completion_tokens, sent[1].reasoning_effort], [60000, 'high'], 'more room, one notch lower');
  assert.equal(r.body.strategies.length, 3); assert.equal(r.body.pick, 1);
  replies = [outOfRoom('{"strategies":[{"name":"Ret'), answer({ strategies: [strat], pick: 0, why: '' })]; sent = []; r = await call({ mode: 'strategy', prompt: ASK, effort: 'high' }); assert.equal(r.code, 200, 'an answer cut off part-way: the same'); assert.deepEqual([sent[1].max_completion_tokens, sent[1].reasoning_effort], [30000, 'medium']);
  replies = [outOfRoom(), outOfRoom()]; sent = []; r = await call({ mode: 'strategy', prompt: ASK, effort: 'xhigh', count: 3 }); assert.equal(r.code, 502, 'twice out of room: the error, never a third try'); assert.equal(sent.length, 2);
  replies = [() => Response.json({ error: { message: 'boom' } }, { status: 400 })]; sent = []; r = await call({ mode: 'strategy', prompt: ASK, effort: 'xhigh' }); assert.equal(r.code, 502); assert.equal(sent.length, 1, 'other errors: not asked again here');
  replies = [outOfRoom(), answer(AI_PROGRAM)]; sent = []; r = await call({ prompt: ASK, effort: 'xhigh' }); assert.equal(r.code, 200, 'the program call too'); assert.deepEqual([sent[1].max_completion_tokens, sent[1].reasoning_effort], [24000, 'high']);
  // no time left for a second try: the first error stands
  let n = 0; await assert.rejects(OA.withRoom(async () => { n++; throw new Error('OpenAI returned no content (finish_reason length)'); }, { maxTokens: 40000, effort: 'xhigh', t0: Date.now() - 260000 }), /finish_reason length/); assert.equal(n, 1); }

// ---- 5. laid out on the tract, as the browser does it (Waller guardrails on: the site is inside the city) ----
const results = {};
for (const [what, prog, retail] of [['the words', words, 15000], ['the AI', aiProg, 23000]]) {
  const t0 = Date.now(), { plan, out } = laidOut(prog), ms = Date.now() - t0; assert.ok(out.length >= 2, what + ': layouts');
  assert.ok(G.isOn({ ...WALLER, program: prog }), 'the guardrails are on: inside Waller');
  const got = out.map((o, i) => asked(plan, o, what + ' · layout ' + (i + 1) + ' (' + o.name + ')', { retail, minLot: Math.max(6600, 6962), minHomes: 28 }));
  results[what] = got; console.log(what + ' (guardrails, ' + ms + ' ms): ' + got.map(g => g.homes + ' homes, lots ≥ ' + g.smallest + ' sf, pond ' + (g.pond / 43560).toFixed(1) + ' of ' + (g.need / 43560).toFixed(1) + ' ac').join(' | '));
  assert.ok(ms < 20000, what + ': in good time (' + ms + ' ms)');
}
// without the guardrails (outside the city): more homes, every lot still at least the 6,600 sf asked
{ const plan = { ...WALLER, jur: null }, out = L.layoutOptions(plan, words, { count: 3 }), got = out.map((o, i) => asked(plan, o, 'no guardrails · layout ' + (i + 1), { retail: 15000, minLot: 6600, minHomes: 38 }));
  console.log('no guardrails: ' + got.map(g => g.homes + ' homes, lots ≥ ' + g.smallest + ' sf').join(' | ')); }

// ---- 6. homes alone: the size, the plans and the smallest lot asked, on parallel streets (the tract is too shallow for
// subdivision streets) and on subdivision streets (a 30-acre tract, 1,300 × 1,000 ft) ----
{ const ask = 'a subdivision of 1,800-2,400 sf homes, 4 floor plans, lots at least 7,500 sf', p = S.guessProgram(ask);
  assert.equal(p.use, 'sfr'); assert.deepEqual([p.homeSfMin, p.homeSfMax, p.floorPlans, p.minLotSf], [1800, 2400, 4, 7500]);
  const homesOk = (o, what, min) => { const H = o.elements.filter(e => e.kind === 'building' && e.use === 'sfr'), lots = o.elements.filter(e => e.kind === 'lot');
    assert.ok(H.length >= min, what + ': ' + H.length + ' homes'); assert.ok(H.every(h => h.sf >= 1800 && h.sf <= 2400), what + ': sizes ' + [...new Set(H.map(h => h.sf))]);
    assert.equal(new Set(H.map(h => h.type)).size, 4, what + ': four plans'); const small = Math.min(...lots.map(l => S.ringArea(S.shapeOf(l)))); assert.ok(small >= 7500 * 0.99, what + ': lots ≥ 7,500 sf: ' + Math.round(small)); return H.length; };
  const out = L.layoutOptions({ ...WALLER, jur: null }, p, { count: 3 }).filter(o => o.score !== -1e9); assert.ok(out.length >= 2, 'the parallel-street layouts');
  const n1 = out.map((o, i) => homesOk(o, 'parallel streets · ' + o.name, 30));
  const R30 = { ring: [[0, 0], [1300, 0], [1300, 1000], [0, 1000]], front: 0, streets: [], setbacks: { ...S.SETBACKS }, params: {}, elements: [] }, net = L.netOnly(R30, p, { count: 2 }); assert.ok(net.length, 'subdivision streets');
  const n2 = net.map(o => homesOk(o, 'subdivision streets · ' + o.name, 40)); sound(net[0].elements, 'subdivision streets');
  console.log('homes alone: parallel streets ' + n1.join('/') + ', subdivision streets ' + n2.join('/')); }

// ---- 7. homes that truly don't fit: said, never dropped quietly ----
{ const tiny = { ring: [[0, 0], [300, 0], [300, 200], [0, 200]], front: 0, setbacks: { ...S.SETBACKS }, streets: [], elements: [] };
  const out = L.layoutOptions(tiny, { use: 'retail', zones: [{ use: 'retail', gfa: 30000 }, { use: 'sfr' }] }, { count: 3 }); assert.ok(out.some(o => !o.elements.some(e => e.kind === 'building' && e.use === 'sfr')), 'a 1.4-acre lot: no room for the homes');
  for (const o of out) if (!o.elements.some(e => e.kind === 'building' && e.use === 'sfr')) assert.ok((o.notes || []).some(n => /^No homes fit on this layout|don’t fit together/.test(n)), o.name + ': says why there are no homes: ' + (o.notes || []).join(' / ')); }

console.log('home programs ok');
