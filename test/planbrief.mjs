// Offline tests for the AI's brief on commercial sites (lib/planbrief.mjs; api/siteplan.js strategy and review; the
// fact sheet in lib/planask.mjs), with OpenAI stubbed through fetch (lib/openai.mjs) and the parking-field engine laying
// the briefs out on the realistic lots of test/parkingfield.mjs: a brief returned and used and ranked against the
// engine's own layouts on one score; a brief the engine can't meet, then the one revision; nonsense and a failed AI;
// Low never asks; floors left open (medical on 2 acres goes to two floors); pads from words; a Waller site, whose
// guardrail values reach the prompt and whose AI text is filtered.
import assert from 'node:assert/strict';
process.env.OPENAI_API_KEY = 'sk-test'; process.env.OPENAI_MODEL = 'gpt-test';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), PK = await import('../lib/siteparking.mjs'), BR = await import('../lib/planbrief.mjs');
const ASK = await import('../lib/planask.mjs'), G = await import('../lib/guardrails.mjs'), K = await import('../lib/planpick.mjs'), RUN = await import('../lib/planruns.mjs');
const API = await import('../api/siteplan.js'), handler = API.default;

// ---- the lots (test/parkingfield.mjs) ----
const LOTS = {
  lot5ac: { ring: [[0, 0], [520, 0], [540, 430], [10, 445]] },
  square2ac: { ring: [[0, 0], [300, 0], [300, 290], [0, 290]] },
  corner3ac: { ring: [[0, 0], [380, 0], [380, 340], [0, 340]], streets: [1] }
};
const planOf = (lk, program = { use: 'retail' }) => ({ origin: [-95.8245, 29.7855], front: 0, setbacks: { ...S.SETBACKS }, elements: [], program, ...LOTS[lk] });

// ---- the stubbed AI ----
let sent = [], reply = () => ({}), ip = 0;
globalThis.fetch = async (url, opts = {}) => {
  if (String(url).includes('/models/')) return Response.json({ id: 'gpt-test' });
  const b = JSON.parse(opts.body); sent.push(b); const r = reply(b);
  return r instanceof Response ? r : Response.json({ choices: [{ message: { content: JSON.stringify(r) } }] });
};
const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
const call = async body => { const res = mock(); await handler({ method: 'POST', body, headers: { 'x-forwarded-for': '10.9.' + Math.floor(++ip / 200) + '.' + (ip % 200) } }, res); return res; };
const userOf = b => JSON.parse(typeof b.messages[1].content === 'string' ? b.messages[1].content : b.messages[1].content[0].text);

// a strategy as the model writes it, carrying a brief
const strat = brief => ({ name: 'Strip at the back, pads at the street', concept: 'Shops at the back facing a field of parking, pads at the street for the drive-thru trade.', placement: [{ what: 'retail strip', where: 'back', why: 'visible across its parking' }, { what: 'detention pond', where: 'back', why: 'the low land' }],
  entrances: { count: 1, where: 'centred on the strip', why: 'one is plenty' }, parking: { approach: 'a field in front of the shops', where: 'front', spaces: 120 }, stormwater: { type: 'detention', where: 'back', why: 'the low land' },
  buildings: { count: 2, floors: 1, form: null }, numbers: { buildingSf: 24000, units: null, coveragePct: 12, fits: true, check: 'Fits.' }, settings: { streets: null, fill: null }, risks: [], rejected: [], brief });
const why = { count: 'Two buildings give the restaurant its own patio and parking.', parking: 'Parking in front: shoppers see the spaces from the road.', pond: 'The pond at the side sits on the low corner, out of the shoppers’ way.', serviceDrive: 'A rear drive keeps delivery trucks out of the parking.', pads: 'Two pads catch the drive-thru trade at the street.' };
const raw = o => ({ buildings: [{ use: 'retail', gfa: 18000, floors: 1, w: null, d: null, at: 'back', facing: 'parking', why: 'The shops sit back across the parking, seen from the road.' }, { use: 'restaurant', gfa: 6000, floors: 1, w: null, d: null, at: 'right', facing: 'parking', why: 'The restaurant at the end gets its own patio.' }],
  parking: 'front', pond: 'side', serviceDrive: true, pads: 2, why, leasableSf: 30000, check: '24,000 sf plus 2 pads needs about 160 spaces (52,000 sf) and a 0.4 ac pond on 5.3 ac.', ...o });

// the browser's part of a build, as src/siteplan.js does it: each layout's numbers and checks, the AI's plan marked
const asV = (plan, o, i, extra = {}) => { const p = { ...plan, elements: o.elements, program: o.program }, m = S.metrics(p); return { ...o, ...extra, m, chk: K.checksOf(S.check(p), m), key: (extra.aiBrief ? 'ai|' : '') + 'k' + i, name: 'Layout ' + (i + 1) + ' · ' + (o.name || '') }; };
const engineOf = (plan, prog, opts = {}) => L.layoutOptions(plan, prog, opts).map((o, i) => asV(plan, o, i));
function aiOf(plan, prog, ab) { // the AI's plan, only when the engine kept its buildings and pads (else null, as the browser shows none)
  const pk = BR.pickBriefLayout(L.layoutOptions(plan, prog, { count: 2, brief: ab.brief }), ab.brief); if (!pk.o) return null;
  const v = asV(plan, pk.o, 99, { aiBrief: ab }); v.aiBrief = { ...ab, changed: BR.changedNotes(v.notes), met: BR.briefMet(v) }; return v;
}
const pads = o => o.elements.filter(e => e.kind === 'building' && e.note === 'QSR / coffee · drive-thru');

// ---- the schemas are strict ----
const strictAll = (sc, at = 'schema') => { if (sc?.anyOf) sc.anyOf.forEach(x => strictAll(x, at)); if (sc?.type === 'object' && sc.properties) { assert.deepEqual(sc.required.slice().sort(), Object.keys(sc.properties).sort(), at + ': every property required'); assert.equal(sc.additionalProperties, false); Object.entries(sc.properties).forEach(([k, v]) => strictAll(v, at + '.' + k)); } if (sc?.items) strictAll(sc.items, at + '[]'); };
strictAll(API.BRIEF_SCHEMA, 'brief'); strictAll(API.STRATEGY_SCHEMA, 'strategy'); strictAll(API.REVIEW_SCHEMA, 'review');
assert.ok(API.STRATEGY_SCHEMA.properties.strategies.items.required.includes('brief') && API.REVIEW_SCHEMA.required.includes('brief'), 'the strategy carries the brief, the review may revise it');
assert.deepEqual(API.BRIEF_SCHEMA.properties.buildings.items.properties.use.enum, PK.FIELD_USES, 'the engine’s uses');
assert.deepEqual(API.BRIEF_SCHEMA.properties.buildings.items.properties.at.enum, PK.BRIEF_SHAPE.buildings[0].at.split('|'), 'the engine’s places');

// ---- 1. a brief returned and used ----
{
  const ask = '25,000 sf retail with 2 pad sites', plan = planOf('lot5ac'), briefFor = BR.briefContext(plan, S.guessProgram(ask), { ask });
  assert.equal(briefFor.lot.acres, 5.28); assert.equal(briefFor.lot.streetFrontageFt, 520); assert.ok(briefFor.lot.widthAlongStreetFt >= 520 && briefFor.lot.depthFromStreetFt >= 430, 'the lot in the street’s frame');
  assert.equal(briefFor.parking.spacesPer1000Sf.retail, 4); assert.equal(briefFor.parking.spacesPer1000Sf.restaurant, 10); assert.deepEqual(briefFor.parking.stallFt, [9, 18]); assert.equal(briefFor.parking.aisleFt, 24);
  assert.equal(briefFor.detention.storageAcFtPerDevelopedAcre, 0.55); assert.ok(briefFor.detention.wholeLotPondAcres > 0.5, 'the pond the lot needs'); assert.equal(briefFor.asked.pads, 2); assert.equal(briefFor.lot.corner, false);
  reply = () => ({ strategies: [strat(raw())], pick: 0, why: '' });
  sent = []; const res = await call({ mode: 'strategy', prompt: ask, site: { acres: 5.28 }, effort: 'medium', briefFor });
  assert.equal(res.code, 200, JSON.stringify(res.body)); const u = userOf(sent[0]), sys = sent[0].messages[0].content;
  assert.equal(u.briefFor.lot.acres, 5.28); assert.equal(u.briefFor.parking.spacesPer1000Sf.retail, 4); assert.equal(u.briefFor.detention.storageAcFtPerDevelopedAcre, 0.55); assert.equal(u.briefFor.asked.pads, 2);
  assert.match(sys, /Maximise the properly leasable floor area/); assert.match(sys, /one-line reason in plain words/); assert.match(sys, /floors \(null unless the request fixes them/); assert.match(sys, /ranked against the engine's own/);
  const B = res.body.strategies[0].brief; assert.ok(B?.brief, 'the brief comes back with the strategy');
  assert.equal(B.brief.buildings.length, 2); assert.equal(B.brief.pads, 2); assert.equal(B.brief.parking, 'front'); assert.equal(B.brief.pond, 'side'); assert.equal(B.brief.serviceDrive, true);
  assert.ok(B.brief.buildings.every(b => b.floors == null), 'floors the words don’t fix are left open');
  assert.equal(B.reasons.length, 7, 'a reason for each decision: ' + JSON.stringify(B.reasons.map(r => r.what)));
  assert.ok(B.reasons.some(r => /^Pond at the side$/.test(r.what) && /low corner/.test(r.why)) && B.reasons.some(r => /^Building 2: 6,000 sq ft restaurant/.test(r.what)), 'each reason says what and why');
  // laid out by the engine, beside its own search, and placed by the same score
  const prog = { use: 'retail', gfa: 25000 }; assert.ok(BR.takesBrief(prog, B.brief));
  const ai = aiOf(plan, prog, B), own = engineOf(plan, prog, { brief: BR.wordsBrief(ask) });
  assert.equal(pads(ai).length, 2, 'the AI’s two pads'); assert.equal(ai.elements.filter(e => e.kind === 'building' && !pads(ai).includes(e)).length, 2, 'and its two buildings');
  assert.ok(ai.elements.some(e => e.kind === 'building' && e.use === 'restaurant' && e.note !== 'QSR / coffee · drive-thru'), 'the restaurant as its own use');
  assert.ok(ai.aiBrief.met, 'done as written: ' + ai.notes.join(' / ')); assert.deepEqual(ai.aiBrief.changed, []);
  // the pond asked for at the back, where it doesn't fit with the pads' parking: the nearest layout keeps the buildings,
  // their uses and the pads, moves the pond, and says so (not the engine's own layout with none of them)
  const back = aiOf(plan, prog, BR.briefFrom(raw({ pond: 'back' }), { prompt: ask, siteSf: S.ringArea(plan.ring) }));
  assert.equal(pads(back).length, 2, 'the pads kept'); assert.ok(back.elements.some(e => e.kind === 'building' && e.use === 'restaurant' && !pads(back).includes(e)), 'and the restaurant');
  assert.ok(!back.aiBrief.met && back.aiBrief.changed.some(t => /^The pond is at the (side|front): no room for it at the back/.test(t)), 'the note says the pond moved: ' + back.aiBrief.changed.join(' / '));
  assert.ok(own.every(o => pads(o).length === 2 || o.notes.some(t => /pad/.test(t))), 'the engine’s own layouts carry the pads the words ask for too');
  const list = BR.placeAi(own, ai), at = list.findIndex(v => v.aiBrief), sAi = BR.fitScore(ai);
  assert.ok(list.slice(0, at).every(v => BR.fitScore(v) >= sAi) && (at === list.length - 1 || BR.fitScore(list[at + 1]) <= sAi + 1e-6), 'ranked on one score: ' + list.map(v => (v.aiBrief ? 'AI ' : '') + Math.round(BR.fitScore(v))).join(', '));
  assert.deepEqual(list.map(v => v.rank), list.map((_, i) => -i), 'ranks follow the order');
  console.log('  5-acre lot, 25,000 sf retail with 2 pads: ' + list.map(v => (v.aiBrief ? 'AI’s plan ' : 'engine ') + Math.round(v.m.nrsf).toLocaleString('en-US') + ' leasable sf, ' + v.m.spaces + '/' + v.m.required + ' spaces').join('; '));
  const rec = K.recommended(list, null); assert.equal(rec.index === at, at === 0 || !list.slice(0, at).some(v => K.passes(v.chk)), 'recommended when it is the best that passes');
  // it doesn't win automatically: a tie goes to the engine's, and the review's pick of it gives way to one that holds clearly more
  const tie = BR.placeAi([{ key: 'e', m: { gfa: 10000, nrsf: 9000, spaces: 40, required: 40 }, chk: { bad: 0, short: 0 }, elements: [{}] }], { key: 'a', aiBrief: {}, m: { gfa: 10000, nrsf: 9000, spaces: 40, required: 40 }, chk: { bad: 0, short: 0 }, elements: [{}] });
  assert.deepEqual(tie.map(v => v.key), ['e', 'a'], 'a tie: the engine’s first');
  const big = { key: 'e', m: { gfa: 30000, nrsf: 27000, spaces: 130, required: 120 }, chk: { bad: 0, short: 0 }, elements: [{}] }, small = { key: 'a', aiBrief: {}, m: { gfa: 24000, nrsf: 21600, spaces: 100, required: 96 }, chk: { bad: 0, short: 0 }, elements: [{}] };
  assert.equal(BR.fairPick([small, big], ['a', 'e']), 'e', 'the review picked the AI’s plan, but the engine’s holds 25% more');
  assert.equal(BR.fairPick([{ ...small, m: { ...big.m } }, big], ['a', 'e']), 'a', 'as good: the review’s pick stands');
  assert.equal(BR.fairPick([small, { ...big, m: { ...big.m, spaces: 80 }, chk: { bad: 0, short: 40 } }], ['a', 'e']), 'a', 'only an engine layout that passes counts');
  assert.ok(BR.fitScore({ m: { gfa: 20000, nrsf: 18000, spaces: 60, required: 80 }, chk: { bad: 0, short: 20 }, elements: [{}] }) < BR.fitScore({ m: { gfa: 15000, nrsf: 13500, spaces: 60, required: 60 }, chk: { bad: 0, short: 0 }, elements: [{}] }), 'parking short costs more than it holds');
  assert.equal(BR.fitScore({ m: { gfa: 0 }, elements: [] }), -Infinity, 'nothing on it: nothing');
  // what's kept with the run, and what Ask answers from
  const slim = RUN.slimRun({ variants: list }, ai.key); assert.ok(slim.variants.find(v => v.key === ai.key).aiBrief?.reasons?.length, 'the saved run keeps the AI’s plan');
  const pl = { ...plan, name: 'Option A', elements: ai.elements, program: ai.program, variant: { key: ai.key, name: ai.name }, lastRun: { ask, effort: 'medium', read: { ask, brief: B }, variants: list } };
  const F = ASK.planFacts(pl, { site: { acres: 5.28 } }), ap = F.lastBuild.aiPlan;
  assert.ok(ap && ap.thisLayoutIsAiPlan === true && ap.doneAsWritten === true, 'the fact sheet says this is the AI’s plan, done as written');
  assert.ok(ap.reasons.some(t => /^Pond at the side: .*low corner/.test(t)), 'with the AI’s reason for the pond: ' + ap.reasons.join(' | '));
  assert.match(ap.asked, /2 buildings: 18,000 sq ft retail, at the back, facing the parking; 6,000 sq ft restaurant/); assert.match(ap.asked, /2 pad sites/);
  const other = ASK.planFacts({ ...pl, variant: { key: own[0].key, name: own[0].name }, elements: own[0].elements }, {}); assert.equal(other.lastBuild.aiPlan.thisLayoutIsAiPlan, false, 'an engine layout on the map: it says so');
  reply = () => ({ answer: 'The AI put the pond at the side because that is the low corner.', followups: [] });
  sent = []; const qa = await call({ mode: 'ask', question: 'Why did you put the pond there?', plan: F });
  assert.equal(qa.code, 200); assert.match(sent[0].messages[1].content, /"aiPlan":\{/); assert.match(sent[0].messages[1].content, /Pond at the side: The pond at the side sits on the low corner/); assert.match(sent[0].messages[0].content, /lastBuild\.aiPlan/);
}

// ---- 2. a brief the engine can't meet: never shown as the AI's plan when the engine drew its own program; the
// engine's reason goes to the review, which revises the brief once ----
{
  const ask = '25,000 sf retail with 2 pad sites', plan = planOf('lot5ac'), prog = { use: 'retail', gfa: 25000 }, siteSf = S.ringArea(plan.ring);
  // two 60,000 sf boxes at the street with the parking behind, on 5.3 acres: the engine can only lay out its own program
  const first = BR.briefFrom(raw({ buildings: [{ use: 'retail', gfa: 60000, floors: 1, w: null, d: null, at: 'front', facing: 'street', why: 'Big boxes at the street.' }, { use: 'retail', gfa: 60000, floors: 1, w: null, d: null, at: 'front', facing: 'street', why: 'A second box.' }], parking: 'back', pond: 'back' }), { prompt: ask, siteSf });
  const out = L.layoutOptions(plan, prog, { count: 2, brief: first.brief }), pk = BR.pickBriefLayout(out, first.brief);
  assert.ok(out.length && out.every(o => o.notes.some(t => /this is the engine’s own layout for the program/.test(t)) || o.elements.filter(e => e.kind === 'building' && e.note !== 'QSR / coffee · drive-thru').length < 2 || pads(o).length < 2), 'the engine fell back to its own program (or dropped buildings or pads)');
  assert.equal(pk.o, undefined, 'so there is no AI’s plan to show'); assert.equal(aiOf(plan, prog, first), null);
  assert.match(pk.reason, /of the 120,000 sq ft parks/, 'the engine’s own reason: ' + pk.reason);
  const line = BR.droppedNote(first.brief, pk.reason);
  assert.match(line, /^The AI’s plan \(2 buildings, 120,000 sq ft, 2 pads, parking behind\) didn’t fit: only [\d,]+ of the 120,000 sq ft parks.*; these are the planner’s layouts\.$/, 'one line under Build: ' + line);
  const own = engineOf(plan, prog, { brief: BR.wordsBrief(ask) }), list = own; assert.ok(!list.some(v => v.aiBrief), 'the list holds only the planner’s layouts');
  // the review still hears why, and may revise once
  const options = own.slice(0, 3).map(v => ({ name: v.name, metrics: { floorAreaSf: Math.round(v.m.gfa), parkingSpaces: v.m.spaces, parkingRequired: v.m.required }, issues: [], notes: v.notes }));
  const rev = raw({ buildings: [{ use: 'retail', gfa: 22000, floors: null, w: null, d: null, at: 'back', facing: 'parking', why: 'One strip the lot can park.' }], parking: 'front', pond: 'side', pads: 2, why: { ...why, count: 'One strip and two pads: two 60,000 sf boxes don’t park on 5.3 acres.' } });
  reply = () => ({ reviews: options.map((o, i) => ({ option: i, score: 70 - i, verdict: 'Works.', strengths: [], problems: [] })), ranking: [0, 1, 2], revise: false, program: null, params: { fill: null, streets: null, form: null, storm: null }, why: '', summary: 'Layout 1.', brief: rev, briefWhy: 'Two 60,000 sf boxes don’t park on 5.3 acres: one 22,000 sf strip and the two pads do.' });
  const bc = { option: null, brief: first.brief, reasons: first.reasons, met: false, mayRevise: true, dropped: pk.reason };
  sent = []; let res = await call({ mode: 'review', prompt: ask, site: { acres: 5.28 }, program: prog, round: 1, rounds: 2, effort: 'high', options, briefCheck: bc });
  assert.equal(res.code, 200, JSON.stringify(res.body)); const u = userOf(sent[0]);
  assert.equal(u.briefCheck.option, null, 'none of the options is the AI’s'); assert.equal(u.briefCheck.notLaidOutBecause, pk.reason, 'the engine’s reason goes to the AI'); assert.equal(u.briefCheck.mayRevise, true); assert.equal(u.briefCheck.metAsWritten, false);
  assert.ok(u.options[0].metrics.parkingRequired > 0, 'with the engine’s options’ numbers');
  assert.match(sent[0].messages[0].content, /no credit for being the planner's/); assert.match(sent[0].messages[0].content, /briefCheck.option null/); assert.match(sent[0].messages[0].content, /briefCheck.mayRevise true/);
  assert.ok(res.body.brief?.brief?.buildings?.length === 1 && res.body.brief.brief.buildings[0].gfa === 22000 && res.body.brief.brief.pads === 2, 'the revised brief'); assert.match(res.body.briefWhy, /one 22,000 sf strip/);
  assert.ok(res.body.brief.reasons.some(r => /two 60,000 sf boxes don’t park/.test(r.why)), 'with its reasons');
  const ai2 = aiOf(plan, prog, { ...res.body.brief, revised: true, why: res.body.briefWhy });
  assert.ok(ai2, 'the revision keeps its building and pads: the AI’s plan'); assert.equal(pads(ai2).length, 2); assert.ok(ai2.m.spaces >= ai2.m.required, 'and parks');
  // a brief laid out but not quite as written (the nearest fit) is still the AI's plan, and the review may revise it
  const near = aiOf(plan, prog, BR.briefFrom(raw({ pond: 'back' }), { prompt: ask, siteSf })); assert.ok(near && !near.aiBrief.met, 'the nearest fit: the AI’s plan, not met');
  const bc2 = { option: 0, brief: near.aiBrief.brief, reasons: near.aiBrief.reasons, met: false, mayRevise: true };
  res = await call({ mode: 'review', prompt: ask, site: { acres: 5.28 }, program: prog, round: 1, rounds: 2, options, briefCheck: bc2 }); assert.ok(res.body.brief, 'a nearest fit may be revised');
  assert.equal(userOf(sent[sent.length - 1]).briefCheck.option, 0);
  // once only: the last round, a brief already met, or the browser not asking (it asked once already) never revise
  for (const [b, w] of [[{ round: 2, rounds: 2, briefCheck: bc }, 'the last round'], [{ round: 2, rounds: 2, briefCheck: bc2 }, 'the last round (laid out)'], [{ round: 1, rounds: 2, briefCheck: { ...bc2, met: true } }, 'met as written'], [{ round: 1, rounds: 3, briefCheck: { ...bc, mayRevise: false } }, 'already revised once'], [{ round: 1, rounds: 1, briefCheck: bc }, 'Medium: one round'], [{ round: 1, rounds: 2, briefCheck: { ...bc, dropped: '' } }, 'not among the options and no reason: no check']]) {
    res = await call({ mode: 'review', prompt: ask, program: prog, options, ...b }); assert.equal(res.body.brief, null, w + ': no revised brief'); assert.equal(res.body.briefWhy, ''); }
  assert.ok(!('briefCheck' in userOf(sent[sent.length - 1])), 'and nothing about one is sent');
  res = await call({ mode: 'review', prompt: ask, program: prog, options, round: 1 }); assert.equal(res.body.brief, null, 'no AI’s plan at all: none');
  // the fact sheet says what happened
  const pl = { ...plan, name: 'Option A', elements: own[0].elements, program: own[0].program, variant: { key: own[0].key, name: own[0].name }, lastRun: { ask, effort: 'high', read: { ask, brief: first, briefNote: line }, variants: own } };
  const ap = ASK.planFacts(pl, {}).lastBuild.aiPlan; assert.equal(ap.note, line, 'Ask knows the AI’s plan didn’t fit, and why'); assert.ok(!ap.laidOutAs && ap.reasons.length, 'with what it asked for and its reasons');
}

// ---- 3. nonsense, or a failed AI ----
{
  const siteSf = S.ringArea(LOTS.square2ac.ring);
  assert.equal(BR.briefFrom(null), null); assert.equal(BR.briefFrom('two pads'), null);
  assert.match(BR.briefFrom({}, { siteSf }).nonsense, /nothing/);
  assert.match(BR.briefFrom({ buildings: [{ use: 'retail', gfa: 900000 }] }, { siteSf }).nonsense, /900,000 sq ft of building on a 2\.0-acre lot/);
  assert.equal(BR.briefFrom({ buildings: [{ use: 'spaceship', gfa: 'lots', at: 'moon' }], parking: 'diagonal' }, { siteSf }).brief.buildings[0].use, null, 'what it doesn’t know is dropped, the rest kept');
  const ask = '20,000 sf retail', briefFor = BR.briefContext(planOf('square2ac'), S.guessProgram(ask), { ask });
  reply = () => ({ strategies: [strat(raw({ buildings: [{ use: 'retail', gfa: 900000, floors: 9, w: null, d: null, at: 'back', facing: 'parking', why: 'x' }] }))], pick: 0, why: '' });
  let res = await call({ mode: 'strategy', prompt: ask, effort: 'medium', briefFor });
  assert.equal(res.code, 200); assert.equal(res.body.strategies[0].brief, undefined, 'nonsense: no brief'); assert.match(res.body.strategies[0].briefNote, /didn’t make sense \(900,000 sq ft .*engine’s own layouts/, 'and one line saying so');
  reply = () => ({ strategies: [strat(null)], pick: 0, why: '' }); res = await call({ mode: 'strategy', prompt: ask, effort: 'medium', briefFor });
  assert.ok(!('brief' in res.body.strategies[0]) && !('briefNote' in res.body.strategies[0]), 'no brief given: none (the browser says the engine’s layouts stand)');
  reply = () => ({ strategies: [strat(raw())], pick: 0, why: '' }); res = await call({ mode: 'strategy', prompt: ask, effort: 'medium' });
  assert.ok(!('brief' in res.body.strategies[0]), 'not a commercial site (no briefFor): a brief the model gives anyway is dropped');
  reply = () => Response.json({ error: { message: 'boom' } }, { status: 400 }); res = await call({ mode: 'strategy', prompt: ask, effort: 'medium', briefFor });
  assert.equal(res.code, 502, 'a failed AI: an error the browser answers with the engine’s own layouts (it never blocks the build)');
  reply = () => ({ reviews: [], ranking: [0], revise: false, program: null, params: { fill: null, streets: null, form: null, storm: null }, why: '', summary: 'ok', brief: { buildings: [{ use: 'retail', gfa: 5e6 }] }, briefWhy: 'Bigger.' });
  res = await call({ mode: 'review', prompt: ask, site: { acres: 2 }, options: [{ name: 'L1' }], round: 1, rounds: 2, briefCheck: { option: 0, brief: { pads: 1 }, met: false, mayRevise: true } });
  assert.equal(res.body.brief, null, 'a revised brief that makes no sense: the first stands'); assert.equal(res.body.briefWhy, '');
}

// ---- 4. Low effort never asks for a brief ----
{
  assert.equal(ASK.effortOf('low').plan, null);
  for (const [id, want] of [['low', false], ['medium', true], ['high', true], ['ultra', true]]) assert.equal(BR.asksBrief(ASK.effortOf(id), '25,000 sf retail strip'), want, id);
  assert.equal(BR.asksBrief(ASK.effortOf('high'), '200 garden apartments'), false, 'housing: no brief');
  assert.equal(BR.asksBrief(ASK.effortOf('high'), 'a daycare for 120 children'), false, 'an AI-crafted type: no brief');
  assert.ok(BR.asksBrief(ASK.effortOf('medium'), '20,000 sf retail and 200 apartments'), 'the commercial part of a mix');
  assert.ok(!('brief' in API.SCHEMA.properties) && !('briefFor' in API.SCHEMA.properties), 'the program call (all Low makes) has no brief');
  const prog = Object.fromEntries(Object.keys(API.SCHEMA.properties).map(k => [k, null])); Object.assign(prog, { use: 'retail', gfa: 25000, extras: [], zones: [], setbacks: { front: null, side: null, rear: null, paving: null }, summary: 'A strip.', assumptions: [] });
  reply = () => prog; sent = []; const res = await call({ prompt: '25,000 sf retail with 2 pad sites', effort: 'low' });
  assert.equal(res.code, 200); assert.equal(sent.length, 1); assert.ok(!/briefFor|brief/.test(sent[0].messages[1].content) && !/briefFor/.test(sent[0].messages[0].content), 'Low: nothing about a brief');
}

// ---- 5. floors left open: medical on 2 acres reaches two floors ----
{
  const prog0 = Object.fromEntries(Object.keys(API.SCHEMA.properties).map(k => [k, null])), base = { ...prog0, extras: [], zones: [], setbacks: { front: null, side: null, rear: null, paving: null }, summary: 'A medical office.', assumptions: [] };
  reply = () => ({ ...base, use: 'medical', gfa: 20000, floors: 1 });
  let res = await call({ prompt: '20,000 sf medical office', effort: 'high' }); assert.equal(res.code, 200);
  assert.equal(res.body.program.floors, null, 'the AI’s one floor isn’t locked in: the words don’t say');
  const plan = planOf('square2ac'), o = L.layoutOptions(plan, res.body.program)[0];
  assert.equal(o.program.floors, 2, 'the engine goes up to two floors'); assert.ok(o.notes.some(t => /two floors|of the 20,000 sq ft/.test(t)), o.notes.join(' / '));
  const locked = L.layoutOptions(plan, S.normalizeProgram({ use: 'medical', gfa: 20000, floors: 1 }))[0]; assert.equal(locked.program.floors, 1, '(what a locked floor did)');
  assert.ok(S.metrics({ ...plan, elements: o.elements }).gfa > S.metrics({ ...plan, elements: locked.elements }).gfa * 1.1, 'more floor area on two floors');
  res = await call({ prompt: '20,000 sf one-story medical office', effort: 'high' }); assert.equal(res.body.program.floors, 1, 'one story asked for: one');
  reply = () => ({ ...base, use: 'office', gfa: 60000, floors: 3 }); res = await call({ prompt: '60,000 sf office', effort: 'high' }); assert.equal(res.body.program.floors, 3, 'more floors than usual, chosen by the AI: kept');
  reply = () => ({ ...base, use: 'retail', gfa: 20000, floors: 1 }); res = await call({ prompt: '20,000 sf retail', effort: 'high' }); assert.equal(res.body.program.floors, 1, 'shops: as before');
  // the brief's floors too
  const b = BR.briefFrom({ buildings: [{ use: 'medical', gfa: 20000, floors: 1, at: 'back', facing: 'parking', why: 'One building.' }], parking: 'front', pond: 'back' }, { prompt: '20,000 sf medical office', siteSf: S.ringArea(plan.ring) });
  assert.equal(b.brief.buildings[0].floors, null, 'the brief’s one floor left open');
  const ob = L.layoutOptions(plan, { use: 'medical', gfa: 20000 }, { brief: b.brief })[0]; assert.equal(ob.program.floors, 2, 'the AI’s plan goes to two floors as well');
  assert.equal(BR.briefFrom({ buildings: [{ use: 'medical', gfa: 20000, floors: 1 }] }, { prompt: '20,000 sf single story medical office' }).brief.buildings[0].floors, 1, 'one story asked for: kept');
}

// ---- 6. pads from words ----
{
  for (const [t, n] of [['25,000 sf retail with 2 pad sites', 2], ['a retail center with an outparcel', 1], ['strip center with pads', 2], ['three outparcels and a strip', 3], ['retail, two QSR pads at the street', 2], ['a concrete pad for the generator', null], ['20,000 sf office, no pad sites', 0], ['10 pads', 4], ['25,000 sf retail', null]]) assert.equal(BR.padsFromWords(t), n, t);
  assert.deepEqual(BR.wordsBrief('retail with 2 pad sites'), { pads: 2 }); assert.equal(BR.wordsBrief('retail'), null);
  const plan = planOf('lot5ac'), o = L.layoutOptions(plan, { use: 'retail', gfa: 25000 }, { brief: BR.wordsBrief('25,000 sf retail with 2 pad sites') })[0];
  assert.equal(pads(o).length, 2, 'the engine places the two pads'); assert.equal(o.elements.filter(e => e.note === 'Drive-thru lane').length, 2, 'each with its drive-thru lane');
  const c = L.layoutOptions(plan, { use: 'retail', gfa: 25000 }, { brief: BR.wordsBrief('25,000 sf retail and an outparcel') })[0]; assert.equal(pads(c).length, 1, 'an outparcel: one pad');
  const b = BR.briefFrom(raw({ pads: 0, why: { ...why, pads: 'No pads.' } }), { prompt: '25,000 sf retail with 2 pad sites', siteSf: S.ringArea(plan.ring) });
  assert.equal(b.brief.pads, 2, 'the words win over the brief'); assert.ok(b.reasons.some(r => r.what === '2 pad sites at the street' && r.why === 'As the request asks.'));
  const mix = BR.withWordsPads(S.guessProgram('20,000 sf retail and 200 apartments with 2 pad sites'), '20,000 sf retail and 200 apartments with 2 pad sites');
  assert.equal(mix.zones?.find(z => z.use === 'retail')?.pads, 2, 'a mix: on its shop zone');
}

// ---- 7. a Waller site: the guardrail values reach the prompt, and the AI's text is filtered ----
{
  const RETAIL5 = LOTS.lot5ac.ring, waller = { id: 'p', ring: RETAIL5, origin: [-95.9269, 30.0566], front: 0, setbacks: { ...S.SETBACKS }, program: { use: 'retail' }, elements: [{ id: 'ko', kind: 'keepout', name: 'Pipeline easement', x: 500, y: 220, w: 40, d: 200, rot: 0 }], params: { guard: {} }, jur: { status: 'city', flood: { status: 'minimal', zone: 'X' } } };
  assert.ok(G.isOn(waller));
  const ask = '25,000 sf retail', bf = BR.briefContext(waller, S.guessProgram(ask), { ask }), katy = BR.briefContext({ ...waller, jur: { status: 'outside' }, params: {} }, S.guessProgram(ask), { ask });
  assert.equal(bf.detention.storageAcFtPerDevelopedAcre, 1, 'the guardrails’ 1.00 ac-ft per developed acre'); assert.match(bf.detention.basis, /Waller guardrails: at least 1\.00 ac-ft per developed acre; acre-feet are volume/);
  assert.ok(bf.detention.wholeLotPondAcres > katy.detention.wholeLotPondAcres * 1.5, 'the pond from that volume: ' + bf.detention.wholeLotPondAcres + ' ac vs ' + katy.detention.wholeLotPondAcres);
  assert.equal(bf.setbacksFt.buildingFront, 26, 'the minimums × 1.05'); assert.match(bf.parking.countReserve, /5% more spaces/); assert.ok(bf.parking.spacesPer1000Sf.retail > 4, 'retail with the count reserve'); assert.ok(bf.guardrails);
  assert.deepEqual(bf.keepOuts.map(k => [k.name, k.where]), [['Pipeline easement', 'right side']], 'the easement and where it is');
  assert.equal(katy.detention.storageAcFtPerDevelopedAcre, 0.55); assert.ok(!katy.guardrails && !katy.parking.countReserve, 'outside Waller: as usual');
  reply = () => ({ strategies: [strat(raw({ why: { ...why, pond: 'The pond at the side is code compliant and approved for this lot.' } }))], pick: 0, why: 'Code compliant.' });
  sent = []; const res = await call({ mode: 'strategy', prompt: ask, effort: 'high', briefFor: bf, guardrails: G.forAI(waller) });
  assert.equal(res.code, 200, JSON.stringify(res.body)); const sys = sent[0].messages[0].content, u = userOf(sent[0]);
  assert.ok(sys.includes(G.SYSTEM_TEXT), 'appendix A in the system prompt'); assert.match(sys, /Detention: 1\.00 ac-ft per developed acre/); assert.match(sys, /WALLER GUARDRAILS/);
  assert.equal(u.briefFor.detention.storageAcFtPerDevelopedAcre, 1); assert.match(u.briefFor.detention.basis, /Waller/); assert.equal(u.briefFor.keepOuts[0].name, 'Pipeline easement');
  const out = JSON.stringify(res.body); assert.ok(!G.hasProhibited(out), 'the AI’s reasons through the banned-phrase filter: ' + res.body.strategies[0].brief.reasons.find(r => /Pond/.test(r.what)).why);
  assert.ok(res.body.strategies[0].brief.brief.pond === 'side' && res.body.strategies[0].brief.brief.parking === 'front', 'the brief’s own values untouched');
  // the review on a Waller plan: the brief check, filtered the same way
  reply = () => ({ reviews: [], ranking: [0], revise: false, program: null, params: { fill: null, streets: null, form: null, storm: null }, why: '', summary: 'ok', brief: raw({ why: { ...why, count: 'Permit ready as drawn.' } }), briefWhy: 'Engineered to fit.' });
  const r2 = await call({ mode: 'review', prompt: ask, site: { acres: 5.28 }, options: [{ name: 'L1' }], round: 1, rounds: 2, briefCheck: { option: 0, brief: res.body.strategies[0].brief.brief, met: false, mayRevise: true }, guardrails: G.forAI(waller) });
  assert.ok(r2.body.brief && !G.hasProhibited(JSON.stringify(r2.body)), 'the revised brief’s words filtered too');
}

console.log('planbrief ok: the AI’s brief written, laid out, ranked, revised once, explained; Low never asks; floors open; pads from words; Waller values in the prompt');
