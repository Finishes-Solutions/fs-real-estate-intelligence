// Offline tests for the Finishes Solutions Waller site-planning guardrails (lib/guardrails.mjs, docs/waller-guardrails.md)
// with realistic Waller data: a 5-acre retail lot inside the city limits near Business 290 and FM 362, a lot 0.3 mile
// outside the limits (the ETJ), a Katy lot (the guardrails stay off and nothing changes), 200 apartments, single-family
// lots, the outfall, the pond's footprint from its volume (checked by hand), the three scenarios, the land-use
// reconciliation, the concept label, and the conclusions the app must never draw.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), G = await import('../lib/guardrails.mjs');
const { sheetHTML } = await import('../lib/sitesheet.mjs'), K = await import('../lib/planpick.mjs'), PJ = await import('../lib/project.mjs');
const API = await import('../api/siteplan.js');
const noIds = x => JSON.parse(JSON.stringify(x, (k, v) => k === 'id' || k === 'ext' ? undefined : v)); // element ids are random
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ': ' + a + ' vs ' + b);

// ---- the sites ----
// Waller: the middle of town, Business 290 at FM 362 (30.0566, -95.9269), inside the city limits (US Census places)
const WALLER_AT = [-95.9269, 30.0566], ETJ_AT = [-95.9269, 30.0566 + 0.3 / 69.05 + 0.0215], KATY_AT = [-95.8245, 29.7855];
const factsWaller = PJ.siteFactsFrom({ place: { name: 'Waller', full: 'Waller city' }, near: [], flood: { zone: 'X', subtype: 'AREA OF MINIMAL FLOOD HAZARD', risk: 'minimal' }, traffic: { roads: [{ road: 'FM 362', aadt: 9800 }] }, districts: { water: [], schools: ['Waller Independent School District'] } }, { county: 'Waller' });
// 0.3 mile north of the limits: outside every city, Waller's limits within half a mile (what /api/site's `near` gives)
const factsEtj = PJ.siteFactsFrom({ place: null, near: [{ name: 'Waller', full: 'Waller city' }], flood: { zone: null } }, { county: 'Waller' });
const factsKaty = PJ.siteFactsFrom({ place: { name: 'Katy', full: 'Katy city' }, near: [], flood: { zone: 'X', risk: 'minimal' } }, { county: 'Harris' });
const RETAIL5 = [[0, 0], [520, 0], [540, 430], [10, 445]]; // 5.28 ac with 520 ft on the street
const plan = (ring, program, jur, guard = {}, at = WALLER_AT) => ({ id: 'p', ring, origin: at, front: 0, setbacks: { ...S.SETBACKS }, program, elements: [], params: { guard }, ...(jur ? { jur } : {}) });

// ---- jurisdiction: inside the limits, the ETJ, Katy, the switch ----
{ const j = G.jurisdictionOf(factsWaller, WALLER_AT);
  assert.equal(j.status, 'city'); assert.match(j.reason, /Inside the City of Waller/); assert.equal(j.flood.status, 'minimal'); assert.equal(j.road, 'FM 362');
  assert.ok(G.isOn({ jur: j }), 'inside the limits: on (Auto)');
  const e = G.jurisdictionOf(factsEtj, ETJ_AT);
  assert.equal(e.status, 'etj'); assert.equal(e.cls, G.CLS.U, 'the ETJ is UNVERIFIED'); assert.match(e.reason, /0\.5 mile/); assert.match(e.reason, /42\.021/); assert.match(e.reason, /2,600–3,000/);
  assert.equal(e.flood.status, 'missing', 'no FEMA panel: flood data missing'); assert.ok(G.isOn({ jur: e }), 'the ETJ: on (Auto)');
  const k = G.jurisdictionOf(factsKaty, KATY_AT); assert.equal(k.status, 'outside'); assert.ok(!G.isOn({ jur: k }), 'Katy: off');
  // facts from before the ETJ check, near Waller: not known, so Auto stays off (and says how to find out)
  const old = G.jurisdictionOf({ place: null }, ETJ_AT); assert.equal(old.status, 'unknown'); assert.ok(!G.isOn({ jur: old }));
  assert.equal(G.jurisdictionOf({ place: null }, KATY_AT).status, 'outside', 'unincorporated and far from Waller');
  assert.equal(G.jurisdictionOf(null).status, 'unknown');
  // inside another city within half a mile of Waller: that city's, not Waller's ETJ
  assert.equal(G.jurisdictionOf({ place: { name: 'Prairie View' }, near: ['Waller'] }).status, 'outside');
  // the override in Site parameters
  assert.ok(G.isOn({ jur: k, params: { guard: { mode: 'on' } } }), 'On: on anywhere'); assert.ok(!G.isOn({ jur: j, params: { guard: { mode: 'off' } } }), 'Off: off in Waller');
  // the project page says so
  const rows = PJ.jurisdictionRows(factsEtj); assert.ok(rows.some(r => r.id === 'guard'), 'the ETJ row'); assert.match(rows.find(r => r.id === 'city').sub, /ETJ; unverified/);
  assert.ok(!PJ.jurisdictionRows(factsKaty).some(r => r.id === 'guard'), 'no Waller row for Katy');
  assert.deepEqual(factsEtj.near, ['Waller'], 'near kept on the facts'); }

// ---- the directional factor (section 03) ----
assert.equal(G.minimum(25, 0.05), 26.25); assert.equal(G.minimum(10, 0.05), 10.5); assert.equal(G.minimum(5, 0.05), 5.25); assert.equal(G.minimum(15, 0.05), 15.75);
assert.equal(G.minimum(25, 0), 25, 'the maximum code envelope: no factor');
assert.equal(G.count(100, 0.05), 105); assert.equal(G.count(100, 0.03), 103); assert.equal(G.count(100, 0.01), 103, 'counts: at least 3%'); assert.equal(G.count(100, 0), 100); assert.equal(G.count(101, 0.05), 107, 'rounded up');
assert.equal(G.maximum(60, 0.05), 57, 'a maximum held 5% below'); assert.equal(G.maximum(60, 0.03), 58.2); assert.equal(G.maximum(60, 0), 60);
{ // a maximum: zoning's coverage cap held below in B, at the cap in A
  const z = { ...plan(RETAIL5, { use: 'retail', gfa: 25000 }, { status: 'city', flood: { status: 'minimal' } }), zoning: { max_coverage_pct: 60, max_far: 1 } };
  assert.equal(G.effective(z).zoning.max_coverage_pct, 57); assert.equal(G.effective(z).zoning.max_far, 0.95); assert.equal(G.effective(G.withScenario(z, 'A')).zoning.max_coverage_pct, 60); }
{ // a prohibition gets no maths: a floodway is a stop condition whatever the factor
  for (const f of [0, 2, 5]) for (const s of ['A', 'B', 'C']) { const r = G.risks(G.withScenario(plan(RETAIL5, { use: 'retail' }, { status: 'city', flood: { status: 'floodway', zone: 'AE' } }, { factor: f }), s)); assert.ok(r.find(x => x.id === 'flood').stop, 'floodway stop ' + s + f); } }
{ // the setbacks: minimums × 1.05; a ROW reserve measured from the future right-of-way
  const e = G.effective(plan(RETAIL5, { use: 'retail' }, { status: 'city', flood: { status: 'minimal' } }, { row: 12 }));
  assert.equal(e.setbacks.front, 26.25 + 12); assert.equal(e.setbacks.side, 10.5); assert.equal(e.setbacks.rear, 21); assert.equal(e.setbacks.paving, 10.5);
  const a = G.effective(G.withScenario(plan(RETAIL5, { use: 'retail' }, { status: 'city', flood: { status: 'minimal' } }), 'A')); assert.equal(a.setbacks.front, 25); assert.equal(a.setbacks.side, 10);
  const c = G.effective(G.withScenario(plan(RETAIL5, { use: 'retail' }, { status: 'city', flood: { status: 'minimal' } }), 'C')); assert.equal(c.setbacks.front, 26.25 + 10, 'C: a 10 ft ROW reserve');
  const f2 = G.effective(plan(RETAIL5, { use: 'retail' }, { status: 'city' }, { factor: 2 })); assert.equal(f2.setbacks.front, 25.5, 'the owner can lower the factor'); }

// ---- off: exactly today's numbers (Katy) ----
{ const base = plan(RETAIL5, { use: 'retail', gfa: 25000 }, null, undefined, KATY_AT), katy = { ...base, jur: G.jurisdictionOf(factsKaty, KATY_AT) };
  assert.equal(G.effective(katy), katy, 'off: the very same plan'); assert.equal(G.forLayout(katy, katy.program, {}), null, 'off: the engine gets what it always got');
  const a = L.layoutOptions(base, base.program, {}), b = L.layoutOptions(katy, katy.program, {});
  assert.deepEqual(noIds(b.map(o => o.elements)), noIds(a.map(o => o.elements)), 'the same layouts');
  const pa = { ...base, elements: a[0].elements, program: a[0].program }, pb = { ...katy, elements: b[0].elements, program: b[0].program };
  assert.deepEqual(G.metrics(pb), S.metrics(pa), 'the same numbers'); assert.deepEqual(noIds(G.check(pb)), noIds(S.check(pa)), 'the same checks'); assert.deepEqual(G.check(pb), S.check(pb), 'G.check is S.check');
  assert.equal(G.metrics(pb).required, 100, '25,000 sf at 4 / 1,000 sf'); assert.equal(K.checkLabel({ bad: 0, short: 0 }).text, 'Passes', 'the pill as it was');
  assert.deepEqual(S.STORM, { mode: 'detention', rate: 0.55, depth: 5 }, 'the non-Waller stormwater default');
  near(S.stormNeed(5, {}).area, 0.55 * 5 * 43560 / 5 * 1.2, 1e-6, 'and its pond');
  assert.equal(G.forAI(katy), null, 'no guardrails to the AI');
  const html = sheetHTML({ plan: pb, project: { name: 'Katy test' }, size: 'tabloid', guard: { scen: {} } });
  assert.ok(!html.includes(G.LABEL) && !/Land-use reconciliation|SP-1A|Waller/.test(html), 'a Katy sheet has none of it');
  assert.match(html, /CONCEPTUAL — FOR FEASIBILITY ONLY/, 'its own conceptual note'); }

// ---- multifamily: 2 per unit (Ord. 424) × 1.05 = 420 for 200 units; no single-family setbacks ----
{ const mf = plan([[0, 0], [1000, 0], [1010, 880], [0, 870]], { use: 'multifamily', units: 200 }, { status: 'city', flood: { status: 'minimal' } });
  const bld = i => ({ id: 'b' + i, kind: 'building', use: 'multifamily', x: 120 + i * 150, y: 300, w: 220, d: 60, floors: 3, units: 50 });
  const laid = { ...mf, elements: [0, 1, 2, 3].map(bld) };
  assert.equal(G.metrics(laid).units, 200); assert.equal(G.metrics(laid).required, 420, 'B: 200 × 2 × 1.05');
  assert.equal(G.metrics(G.withScenario(laid, 'A')).required, 400, 'A: the verified 2 per unit');
  assert.equal(G.metrics({ ...laid, jur: { status: 'outside' } }).required, 320, 'off: the app’s 1.6 per unit');
  assert.equal(G.rulesOf(mf).lot, null, 'no single-family lot rules'); assert.equal(G.effective(mf).setbacks.front, 26.25, 'the site setbacks × 1.05, not the 25 ft single-family front');
  assert.equal(G.tagsOf(laid).parking.cls, G.CLS.O); assert.equal(G.tagsOf(G.withScenario(laid, 'A')).parking.cls, G.CLS.V);
  // laid out by the engine, Phase 1 only: its need is 2.1 a unit
  const p0 = { ...mf, params: { ...mf.params, fill: false } }, a = G.forLayout(p0, p0.program, {}), out = L.layoutOptions(a.plan, a.program, a.opts).map(o => G.unapply(o, p0));
  const m = G.metrics({ ...p0, elements: out[0].elements, program: out[0].program });
  assert.ok(m.units >= 190 && m.units <= 210, 'about 200 units: ' + m.units); assert.equal(m.required, Math.ceil(m.units * 2.1 - 0.01), 'needed: ' + m.required + ' for ' + m.units);
  assert.ok(m.spaces >= m.required, 'and parked: ' + m.spaces + ' / ' + m.required);
  assert.equal(out[0].program.perUnit ?? null, null, 'the plan keeps its own working number, not the factored one'); }

// ---- single-family: 57 × 114 published, 59 × 118 target; setbacks 26.25 / 10.5 / 5.25 / 15.75 ----
{ const sf = { ...plan([[0, 0], [900, 0], [900, 760], [0, 760]], { use: 'sfr' }, { status: 'city', flood: { status: 'minimal' } }), params: { guard: { outfall: 'ditch' }, streets: 'straight' } }; // straight streets: the lots stay rectangles to measure
  assert.deepEqual(G.rulesOf(sf).lot, { minW: 59, minD: 118, front: 26.25, side: 5.25, rear: 10.5, corner: 15.75 });
  assert.deepEqual(G.rulesOf(sf, 'A').lot, { minW: 57, minD: 114, front: 25, side: 5, rear: 10, corner: 15 });
  assert.equal(G.WALLER.sfr.lotArea.base.value, 57 * 114); assert.equal(G.WALLER.sfr.lotArea.target.value, 59 * 118);
  const a = G.forLayout(sf, sf.program, {}), out = L.layoutOptions(a.plan, a.program, a.opts).map(o => G.unapply(o, sf)), els = out[0].elements;
  const lots = els.filter(e => e.kind === 'lot'), homes = els.filter(e => e.kind === 'building' && e.use === 'sfr');
  assert.ok(lots.length >= 10 && homes.length === lots.length, lots.length + ' lots, ' + homes.length + ' homes');
  assert.ok(lots.every(l => Math.min(l.w, l.d) >= 59 - 0.01), 'every lot at least 59 ft wide: ' + Math.min(...lots.map(l => Math.min(l.w, l.d))));
  assert.ok(lots.filter(l => Math.max(l.w, l.d) >= 118 - 0.5).length >= lots.length * 0.8, 'lots 118 ft deep');
  for (const h of homes) { const lot = lots.find(l => S.inRing([h.x, h.y], S.corners(l))), c = S.corners(lot), hs = S.corners(h);
    const gaps = c.map((p, i) => Math.min(...hs.map(q => S.segDist(q, p, c[(i + 1) % 4])))).sort((x, y) => x - y);
    assert.ok(gaps[0] >= 5.25 - 0.01, 'side setbacks 5.25 ft: ' + gaps.map(g => g.toFixed(2)));
    assert.ok(gaps.some(g => Math.abs(g - 26.25) < 0.05), 'the home 26.25 ft back from the street: ' + gaps.map(g => g.toFixed(2))); }
  // without the guardrails the same site gets narrower lots (the app's own)
  const off = L.layoutOptions({ ...sf, jur: { status: 'outside' } }, sf.program, {}); assert.ok(off[0].elements.some(e => e.kind === 'lot' && Math.min(e.w, e.d) < 57), 'off: 40 and 50 ft lots as before'); }

// ---- detention: unknown outfall vs a public storm sewer; acre-feet are volume ----
{ const r = (s, o, u) => G.detentionRate(s, o, u);
  assert.deepEqual([r('B', 'unknown').rate, r('B', 'unknown').cls], [1, G.CLS.U], 'unknown: 1.00, UNVERIFIED');
  assert.deepEqual([r('B', 'storm').rate, r('B', 'storm').cls], [0.75, G.CLS.V], 'public storm sewer: 0.75');
  assert.deepEqual([r('B', 'ditch').rate, r('B', 'ditch').cls], [1, G.CLS.O]); assert.equal(r('A', 'ditch').cls, G.CLS.V, 'ditch: the FS002 basis');
  assert.equal(r('C', 'unknown').rate, 1.1, 'C: +10% while the outfall is unknown'); assert.equal(r('C', 'storm').rate, 0.75);
  assert.equal(r('A', 'storm').rate, 0.75); assert.equal(r('A', 'unknown').rate, 1); assert.equal(r('B', 'channel').cls, G.CLS.U);
  assert.equal(r('B', 'unknown', 1.3).rate, 1.3, 'a higher project figure wins'); assert.equal(r('B', 'unknown', 0.55).rate, 1, 'never below the default');
  const p0 = plan(RETAIL5, { use: 'retail', gfa: 25000 }, { status: 'city', flood: { status: 'minimal' } });
  const unk = G.effective(p0), sto = G.effective({ ...p0, params: { guard: { outfall: 'storm' } } });
  assert.equal(unk.params.storm.rate, 1); assert.equal(sto.params.storm.rate, 0.75); assert.equal(unk.params.storm.depth, 4); assert.ok(unk.params.storm.basin, 'the basin footprint');
  const nu = S.stormNeed(5, unk.params, unk.program, 5.28), ns = S.stormNeed(5, sto.params, sto.program, 5.28);
  near(nu.volume, 5, 1e-9, 'unknown: 5 ac-ft for 5 developed acres'); near(ns.volume, 3.75, 1e-9, 'storm sewer: 3.75 ac-ft');
  assert.ok(nu.area > ns.area && nu.area > nu.volume * 43560 / 4, 'the footprint is more than volume ÷ depth (slopes, freeboard, bench)');
  assert.ok(G.risks(p0).some(x => x.id === 'outfall' && /unknown/.test(x.title)), 'the unknown outfall in the register');
  assert.ok(!G.risks({ ...p0, params: { guard: { outfall: 'ditch' } } }).some(x => x.id === 'outfall'), 'a ditch outfall: not unresolved');
  assert.equal(S.stormNeed(0.8, unk.params, unk.program, 0.8).mode, 'detention', 'Waller: detention under an acre too'); }

// ---- the pond's footprint from its volume, checked by hand ----
// 5 ac-ft = 217,800 cf in a basin twice as long as wide, 4 ft deep, 4:1 slopes:
//   V = 2W²·4 + 4·16·3·W + 4/3·16·64 → 8W² + 192W − 216,434.67 = 0 → W = (−192 + √(36,864 + 6,925,909.3)) / 16 = 152.92 ft, L = 305.84 ft
//   water 337.84 × 184.92; top of bank (+1 ft freeboard: 2·4·5 = 40 ft) 345.84 × 192.92 = 66,719 sf
//   with the 15 ft bench 375.84 × 222.92 = 83,781 sf; outfall allowance 5% = 4,189 sf → 87,971 sf = 2.02 ac
{ const b = S.basinFootprint(5, { depth: 4, slope: 4, freeboard: 1, bench: 15 });
  near(b.bottom[1], 152.92, 0.01, 'bottom width'); near(b.bottom[0], 305.84, 0.02, 'bottom length');
  near(b.bankArea, 66719, 2, 'top of bank'); near(b.bankArea + b.benchArea, 83781, 2, 'with the bench'); near(b.allowance, 4189, 1, 'allowance'); near(b.area, 87971, 3, 'footprint'); near(b.area / 43560, 2.02, 0.005, 'acres');
  const [L0, W0] = b.bottom; near(L0 * W0 * 4 + 4 * 16 * (L0 + W0) + 4 / 3 * 16 * 64, 217800, 0.5, 'it holds the volume');
  assert.ok(b.area / 43560 > 5 / 4, 'more land than 5 ac-ft ÷ 4 ft (1.25 ac)');
  assert.equal(S.basinFootprint(0).area, 0); assert.ok(S.basinFootprint(0.02).area >= 2000, 'a tiny one: no flat bottom, still its allowance'); }

// ---- the three scenarios on the 5-acre retail lot inside Waller: A ≥ B ≥ C ----
const waller5 = plan(RETAIL5, { use: 'retail', max: true }, G.jurisdictionOf({ ...factsWaller, flood: undefined }, WALLER_AT)); // flood not looked up: missing
const cands = [], laidAs = {};
for (const s of ['A', 'B', 'C']) {
  const p = G.withScenario(waller5, s), a = G.forLayout(p, p.program, {}), out = L.layoutOptions(a.plan, a.program, a.opts).map(o => G.unapply(o, p));
  assert.ok(out[0]?.elements.length, s + ' lays out');
  for (const o of out.slice(0, 2)) cands.push({ plan: { ...p, program: o.program, elements: o.elements }, scenario: s });
  laidAs[s] = { ...p, program: out[0].program, elements: out[0].elements };
}
{ const Y = G.bestByScenario(cands);
  assert.ok(Y.A.leasableSf >= Y.B.leasableSf && Y.B.leasableSf >= Y.C.leasableSf && Y.C.leasableSf > 0, 'A ≥ B ≥ C leasable: ' + [Y.A.leasableSf, Y.B.leasableSf, Y.C.leasableSf]);
  assert.ok(Y.A.buildingSf >= Y.C.buildingSf, 'building sf'); assert.ok(['A', 'B', 'C'].every(k => Y[k].ok), 'each passes its own checks');
  assert.ok(Y.C.detentionAcFt > 0 && Y.C.detentionRate === 1.1, 'C: 1.10 ac-ft/ac (outfall unknown)'); assert.equal(Y.B.detentionRate, 1);
  assert.ok(Y.B.parkingRequired >= Math.ceil(Y.B.buildingSf / 1000 * 4 * 1.05 - 0.01), 'B parks at 4 × 1.05');
  const yl = ['A', 'B', 'C'].map(k => Y[k]), r = G.range(yl, 'leasableSf'); assert.ok(r.lo < r.hi, 'a range, not one number'); assert.match(G.rangeText(r, ' sf'), /^\d[\d,]*–\d[\d,]* sf$/);
  const off = L.layoutOptions({ ...waller5, jur: { status: 'outside' } }, waller5.program, {}), mOff = S.metrics({ ...waller5, elements: off[0].elements, program: off[0].program });
  assert.ok(mOff.nrsf > Y.A.leasableSf, 'the guardrails cost leasable area: ' + Math.round(mOff.nrsf) + ' without them'); }
// C: the flood reserve (no flood data) and the ROW reserve as keep-out land, off the plan once laid out
{ const c = G.effective(laidAs.C), fr = c.elements.find(e => e.guard === 'flood');
  assert.ok(fr, 'the flood reserve'); near(S.elArea(fr) / S.ringArea(RETAIL5), 0.10, 0.002, '10% of the site');
  assert.ok(fr.poly.every(p => p[1] > 200), 'at the back of the site'); assert.ok(!laidAs.C.elements.some(e => e.guard), 'not kept on the plan');
  assert.ok(!c.elements.filter(e => e.kind === 'building').some(b => S.rectsOverlap(b, fr)), 'nothing built on it');
  assert.equal(c.setbacks.front, 36.25, 'a 10 ft ROW reserve + 26.25'); }

// ---- the land-use reconciliation adds back up to the gross site ----
for (const s of ['A', 'B', 'C']) {
  const T = G.landTable(laidAs[s]);
  assert.deepEqual(T.rows.map(r => r.label), ['Gross site', 'Less existing/proposed ROW', 'Less flood/floodway reserve', 'Less detention/drainage', 'Less easements/pipelines', 'Less buffers/setbacks/landscape', 'Less road/circulation', 'Less parking/loading', 'Net usable land']);
  assert.deepEqual(T.qty.map(q => q.label), ['Residential lots / multifamily units', 'Building square feet', 'Impervious cover', 'Detention volume and footprint']);
  const net = T.rows.find(r => r.key === 'net').sf, less = T.rows.filter(r => !['gross', 'net'].includes(r.key)).reduce((t, r) => t - r.sf, 0);
  near(less + net, T.siteSf, 1, s + ': the rows add back up to the gross site'); near(T.sum, T.siteSf, 1);
  assert.ok(T.rows.every(r => r.basis && Object.values(G.CLS).includes(r.cls)), s + ': each row has its basis and classification');
  assert.ok(T.rows.filter(r => r.key !== 'net' && r.key !== 'gross').every(r => r.sf <= 0) && net > 0, s + ': deductions and a net');
  if (s === 'C') { assert.ok(T.rows.find(r => r.key === 'row').sf < 0 && T.rows.find(r => r.key === 'flood').sf < 0, 'C deducts ROW and flood'); near(-T.rows.find(r => r.key === 'row').sf, 520 * 10, 1, 'ROW: 520 ft × 10 ft'); }
  else assert.equal(T.rows.find(r => r.key === 'flood').sf, 0, s + ': no flood reserve');
  assert.ok(-T.rows.find(r => r.key === 'detention').sf > 0, 'detention land is never buildable');
}
{ // easements with their conservative buffer; single-family lots sum too
  const ease = { id: 'k1', kind: 'keepout', name: 'Pipeline easement', x: 260, y: 300, w: 30, d: 400, rot: 90 }, p = { ...laidAs.C, elements: laidAs.C.elements.concat([ease]) };
  const T = G.landTable(p); near(T.sum, T.siteSf, 1, 'with an easement'); assert.ok(-T.rows.find(r => r.key === 'easements').sf > 30 * 400, 'the 10 ft buffer counts'); }

// ---- the risk register and the checklist ----
{ const R = G.risks(laidAs.B), ids = R.map(r => r.id);
  for (const id of ['survey', 'title', 'flood', 'outfall', 'utilities', 'roads', 'ratio']) assert.ok(ids.includes(id), 'risk ' + id + ': ' + ids);
  assert.ok(R.find(r => r.id === 'flood').stop, 'missing flood data: a stop condition'); assert.ok(R.every(r => r.why.length > 40), 'each says why it matters');
  assert.ok(G.risks({ ...laidAs.B, jur: { ...laidAs.B.jur, flood: { status: 'minimal', zone: 'X' } } }).every(r => r.id !== 'flood'), 'mapped outside the floodplain: no flood risk');
  const fail = { ...laidAs.B, elements: laidAs.B.elements.filter(e => e.kind !== 'drive' && e.kind !== 'parking') }; assert.ok(G.risks(fail).some(r => r.id === 'fire'), 'fire access failing');
  const C = G.checklist(laidAs.B); assert.equal(C.length, 18, 'every item of section 10'); assert.deepEqual(C.map(c => c.item), G.CHECKLIST);
  assert.ok(C.every(c => ['shown', 'unresolved', 'na'].includes(c.status) && c.note), 'each shown, unresolved or N/A, with a note');
  assert.equal(C.find(c => /Utility/.test(c.item)).status, 'unresolved'); assert.equal(C.find(c => /Truck/.test(c.item)).status, 'na', 'retail: no truck court');
  const tags = G.tagsOf(laidAs.B); assert.ok(['site', 'gfa', 'parking', 'coverage', 'detention', 'impervious'].every(k => tags[k].cls), 'every material number tagged'); }

// ---- the label, on the sheet, the export and to the AI ----
const DOC = fs.readFileSync(new URL('../docs/waller-guardrails.md', import.meta.url), 'utf8');
assert.ok(DOC.includes(G.LABEL), 'the label exactly as the document has it'); assert.ok(DOC.includes(G.SYSTEM_TEXT), 'appendix A exactly');
{ const Y = G.bestByScenario(cands), scen = { A: Y.A, B: Y.B, C: Y.C };
  const html = sheetHTML({ plan: laidAs.B, project: { name: 'Waller retail' }, planName: 'Option A', size: 'tabloid', guard: { scen } });
  assert.ok(html.includes(G.LABEL) && html.includes(G.GRAPHIC_LABEL), 'the label on the sheet and on the drawing');
  assert.ok(/Land-use reconciliation/.test(html) && /Net usable land/.test(html) && /SP-1A/.test(html) && /Unresolved risks/.test(html) && /Required plan content/.test(html), 'the land table, risks and checklist');
  const csv = G.csv(laidAs.B, scen); assert.ok(csv.startsWith('"' + G.LABEL + '"') || csv.startsWith(G.LABEL), 'the export starts with the label'); assert.match(csv, /Gross site,5\.28/); assert.match(csv, /Leasable sf range/);
  const prompt = G.promptFor(laidAs.B); assert.ok(prompt.includes(G.SYSTEM_TEXT) && /1\.00 ac-ft per developed acre/.test(prompt) && /Classify every assumption/.test(prompt), 'appendix A and the values to the AI');
  assert.ok(API.guardSys({ guardrails: G.forAI(laidAs.B) }, 'BASE').startsWith('BASE\n\n') && API.guardSys({ guardrails: G.forAI(laidAs.B) }, 'BASE').includes(G.SYSTEM_TEXT));
  assert.equal(API.guardSys({}, 'BASE'), 'BASE', 'no guardrails: the system prompt as it was');
  assert.equal(G.fromAI({ profile: 'other' }), null); assert.equal(G.fromAI(G.forAI(laidAs.B)).jur.status, 'city');

  // ---- prohibited conclusions: never in the app's own words on a Waller plan, rewritten in the AI's ----
  const own = [html.replace(/<style>[\s\S]*?<\/style>/g, ''), csv, JSON.stringify(G.risks(laidAs.B)), JSON.stringify(G.checklist(laidAs.B)), JSON.stringify(G.landTable(laidAs.B)), JSON.stringify(G.tagsOf(laidAs.B)), K.checkLabel({ bad: 0, short: 0 }, { waller: true }).text].join('\n');
  assert.ok(!G.hasProhibited(own), 'none of the prohibited conclusions in the app’s words');
  for (const w of G.PROHIBITED) assert.ok(!new RegExp('\\b' + w + '\\b', 'i').test(own.replace(/subject to approval/gi, '')), 'no “' + w + '”');
  assert.equal(K.checkLabel({ bad: 0, short: 0 }, { waller: true }).text, 'Passes the planning checks');
  const ai = 'Layout 2 is code compliant and permit-ready, an approved layout with guaranteed yield. Utility capacity is confirmed and it is fully engineered. Construction-ready.', sc = G.scrub(ai);
  assert.ok(!G.hasProhibited(sc.text), sc.text); assert.deepEqual(sc.flagged.sort(), [...G.PROHIBITED].sort(), 'each one flagged');
  assert.equal(G.scrubText('Parking is 4 per 1,000 sf, a working number.'), 'Parking is 4 per 1,000 sf, a working number.', 'other words untouched');
  assert.deepEqual(API.guardOut({ answer: 'The plan meets code.', followups: ['Is it code compliant?'], id: 'approved' }), { answer: 'The plan is within the planning checks (not a code review).', followups: ['Is it within the planning checks (not a code review)?'], id: 'approved' }); }

// ---- the ETJ lot laid out: on, UNVERIFIED, the reason carried ----
{ const etj = plan(RETAIL5, { use: 'retail', gfa: 25000 }, G.jurisdictionOf(factsEtj, ETJ_AT), {}, ETJ_AT);
  assert.ok(G.isOn(etj)); assert.ok(G.risks(etj).some(r => r.id === 'jurisdiction' && /ETJ/.test(r.title)), 'the ETJ in the register');
  const a = G.forLayout(etj, etj.program, {}); assert.ok(a && a.plan.__guard.scenario === 'B', 'laid out as B by default'); }

console.log('waller guardrails ok');
