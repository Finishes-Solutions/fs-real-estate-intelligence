// How hard the AI works on a build (the effort levels under Build), and the fact sheet the Ask box sends with a question
// about the open plan. No DOM here, so both can be tested in Node. Used by src/siteplan.js; api/siteplan.js reads the
// same effort names (low, medium, high) and the fact sheet's shape.
import * as S from './siteplan.mjs';
import { briefWords } from './planbrief.mjs';

// ---------- effort ----------
// Each level is work the build really does: the reasoning effort of the AI calls (OpenAI reasoning_effort: low, medium
// or high; Ultra plans at xhigh, which steps down to high on a model that doesn't take it), whether the AI thinks the site
// through before anything is placed (plan: one strategy, or three compared and one picked), how many times the AI reviews
// the drawn layouts (0 = no review; 1 = scores and a pick; 2 = it may change the program once and the new layouts are
// compared; 3 = it may change it twice), how many layouts the review sees (and with drawings), and how wide the engine's
// first search is.
//   plan: null (no planning step) or { effort, count } for the strategy call before the program
//   layout: options for the first layouts (lib/sitelayout.mjs layoutOptions: count, depth, budgetMs); {} = the usual three
//   revise: options for the layouts from a changed program
export const EFFORTS = [
  { id: 'low', label: 'Low', time: 'seconds', effort: 'low', plan: null, rounds: 0, pool: 0, images: 0, layout: {}, revise: null,
    tip: 'Fastest: the AI reads your request briefly and the layouts come back in seconds. No planning first, no review.' },
  { id: 'medium', label: 'Medium', time: '1–2 min', effort: 'medium', plan: { effort: 'medium', count: 1 }, rounds: 1, pool: 4, images: 4, layout: {}, revise: null,
    tip: 'The AI plans the site before placing anything (what goes where, the ways in, parking and the pond), then looks over the layouts once and picks the best.' },
  { id: 'high', label: 'High', time: '2–3 min', effort: 'high', plan: { effort: 'high', count: 1 }, rounds: 2, pool: 4, images: 4, layout: {}, revise: { count: 3, depth: 6, budgetMs: 6000 },
    tip: 'The AI thinks the site through carefully before placing anything and checks the numbers, reviews the layouts against its plan and, when they miss, changes the program once and lays it out again.' },
  { id: 'ultra', label: 'Ultra', time: '3–6 min', effort: 'high', plan: { effort: 'xhigh', count: 3 }, rounds: 3, pool: 6, images: 6, layout: { count: 5, depth: 6, budgetMs: 6000 }, revise: { count: 3, depth: 6, budgetMs: 9000 },
    tip: 'The most thorough: before placing anything the AI works out three different plans for the site at its deepest thinking, checks each and picks one; then a wider search gives five layouts, it reviews up to six with their drawings and can change the program twice.' }
];
export const EFFORT_KEY = 'fs-sp-effort', LEGACY_KEY = 'fs-sp-review'; // the old switch: '0' Quick, else AI-reviewed
export const effortOf = id => EFFORTS.find(e => e.id === id) || EFFORTS[2];
// the level to use: the one saved, else the old Quick / AI-reviewed switch read across (Quick = Low, AI-reviewed = High),
// else High (the old default). With the AI off only Low runs.
export function effortLevel(stored, legacy, aiOff = false) {
  if (aiOff) return 'low';
  if (EFFORTS.some(e => e.id === stored)) return stored;
  return legacy === '0' ? 'low' : 'high';
}
// what a saved run says about how it was made (older runs only say whether the AI reviewed them)
export const runEffort = run => run?.effort && EFFORTS.some(e => e.id === run.effort) ? run.effort : run?.aiReviewed ? 'high' : run ? 'low' : null;

// ---------- the fact sheet for a question about the plan ----------
const r0 = v => v == null || !isFinite(v) ? null : Math.round(v), r1 = v => v == null || !isFinite(v) ? null : Math.round(v * 10) / 10, r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
const pc = v => v == null || !isFinite(v) ? null : Math.round(v * 1000) / 10; // a share as a percent, one decimal
const txt = (s, n = 300) => s == null || s === '' ? null : String(s).slice(0, n);
const drop = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)));
// the parking rule a use is counted by, in words
function ruleOf(use, P) {
  const U = S.USES[use] || S.USES.other;
  if (use === 'multifamily') return P.perUnit + ' spaces per unit';
  if (U.garage) return U.garage + ' in each home’s garage' + (U.guest ? ' plus ' + U.guest + ' guest space a home' : '');
  return P.ratio + ' spaces per 1,000 sq ft';
}
// the plan the AI made before anything was placed (Medium and up), short: what it intended and why, so a question like
// "why is the pond at the back?" is answered from the AI's own reasoning
const plannedOf = S0 => !S0 || !(S0.concept || S0.placement?.length) ? null : drop({ name: txt(S0.name, 120), concept: txt(S0.concept, 500),
  placement: (S0.placement || []).slice(0, 8).map(q => txt([q.where, q.what].filter(Boolean).join(': ') + (q.why ? ' (' + q.why + ')' : ''), 260)),
  entrances: S0.entrances?.count ? txt(S0.entrances.count + (S0.entrances.where ? ': ' + S0.entrances.where : '') + (S0.entrances.why ? ' (' + S0.entrances.why + ')' : ''), 300) : null,
  parking: txt(S0.parking?.approach, 240), stormwater: S0.stormwater?.type ? txt(S0.stormwater.type + (S0.stormwater.where ? ' at the ' + S0.stormwater.where : '') + (S0.stormwater.why ? ' (' + S0.stormwater.why + ')' : ''), 300) : null,
  numbersCheck: txt(S0.numbers?.check, 400), otherPlansDrafted: (S0.alts || []).slice(0, 2).map(t => txt(t, 120)), whyThisOne: txt(S0.why, 300), setAside: (S0.rejected || []).slice(0, 2).map(t => txt(t, 240)), risks: (S0.risks || []).slice(0, 3).map(t => txt(t, 200)) });
// the AI's brief for a commercial site (lib/planbrief.mjs) and how the engine laid it out: what it asked for, its reason
// for each decision, what the engine changed and why, and whether that layout is the one on the screen. ai: the AI's
// layout among the build's (v.aiBrief), else the brief the build kept when none was laid out (read.brief, read.briefNote)
function aiPlanOf(vs, v, read) {
  const a = vs.find(x => x.aiBrief && x === v) || vs.find(x => x.aiBrief), B = a?.aiBrief || read?.brief || null;
  if (!B?.brief) return read?.briefNote ? { note: txt(read.briefNote, 300) } : null;
  return drop({ asked: txt(briefWords(B.brief, a?.program?.use), 600), reasons: (B.reasons || []).slice(0, 12).map(r => txt((r.what ? r.what + ': ' : '') + r.why, 300)), aiExpectedLeasableSf: r0(B.leasableSf), aiArithmetic: txt(B.check, 300),
    laidOutAs: a ? txt(a.name, 120) : null, thisLayoutIsAiPlan: a ? a === v : null, doneAsWritten: a ? !!B.met : null, changedByPlanner: (B.changed || []).slice(0, 6).map(t => txt(t, 300)), revisedBecause: txt(B.why, 300),
    floorAreaSf: a?.m ? r0(a.m.gfa) : null, leasableSf: a?.m ? r0(a.m.nrsf) : null, parking: a?.m ? a.m.spaces + ' / ' + a.m.required : null, note: a ? null : read?.briefNote ? txt(read.briefNote, 300) : 'The AI’s plan wasn’t laid out (the program it read takes no brief).' });
}
// plan: the option (ring, elements, program, setbacks, params, zoning, variant, stale, lastRun, name)
// o: { site: { acres, widthFt, depthFt, frontageFt, address, city, county }, siteFacts (short lines: flood zone, roads,
//      districts, utilities), pieces (lib/siteedit.mjs describePlan),
//      pf (lib/proforma.mjs run() for the plan, or null), variants (the build's layouts, else lastRun's), project }
export function planFacts(plan, o = {}) {
  const els = plan.elements || [], prog = S.normalizeProgram(plan.program), m = S.metrics(plan), B = els.filter(e => e.kind === 'building');
  const useOf = e => S.USES[e.use] ? e.use : prog.use;
  // parking: needed per use by the rule each is counted by, what's provided and how
  const by = new Map();
  for (const e of B) { const u = useOf(e); if (!by.has(u)) by.set(u, []); by.get(u).push(e); }
  const parkingByUse = [...by].map(([u, list]) => { const P = u === prog.use && !prog.zones ? prog : S.normalizeProgram({ use: u }), sf = list.reduce((s, e) => s + S.gfaOf(e), 0), units = list.reduce((s, e) => s + (e.units ?? 0), 0);
    return drop({ use: S.USES[u]?.label || u, buildings: list.length, floorAreaSf: r0(sf), units: units || null, rule: u === 'amenity' ? 'no parking of its own (it serves the residents)' : ruleOf(u, P) }); });
  const st = S.stormOf(plan), sb = { ...S.SETBACKS, ...(plan.setbacks || {}) }, z = plan.zoning && typeof plan.zoning === 'object' ? drop(Object.fromEntries(Object.entries(plan.zoning).slice(0, 12).map(([k, v]) => [k, typeof v === 'number' ? v : txt(v, 120)]))) : null;
  const lr = plan.lastRun || null, vs = o.variants || lr?.variants || [], key = plan.variant?.key, v = key ? vs.find(x => x.key === key) : null;
  const ph2 = B.some(e => e.phase === 2), m1 = ph2 ? S.metrics({ ...plan, elements: els.filter(e => e.phase !== 2) }) : null;
  const pieces = (o.pieces || []).slice(0, 80).map(p => drop({ name: txt(p.name, 60), kind: p.kind, use: p.use ? S.USES[p.use]?.label || p.use : null, at: p.at, size: p.size, floors: p.floors, units: p.units, note: txt(p.note, 80) }));
  const R = o.pf, fin = R ? finFacts(R) : null;
  return drop({
    project: txt(o.project, 120), option: txt(plan.name, 60), layout: v ? txt(v.name, 120) : key ? txt(plan.variant.name, 120) : els.length ? 'drawn by hand' : null,
    editedByHand: plan.variant?.edited ? true : null, outOfDate: plan.stale ? ({ site: 'the site outline changed after this layout was made', street: 'the street side changed after this layout was made', entrance: 'an entrance was added after the layouts were made' })[plan.stale] || 'the site changed' : null,
    site: drop({ acres: r2(o.site?.acres ?? m.acres), approxWidthFt: r0(o.site?.widthFt), approxDepthFt: r0(o.site?.depthFt), streetFrontageFt: r0(o.site?.frontageFt), address: txt(o.site?.address, 160), city: txt(o.site?.city, 80), county: txt(o.site?.county, 80),
      sideStreet: plan.streets?.length ? true : null, known: (o.siteFacts || []).slice(0, 14).map(t => txt(t, 300)).filter(Boolean), zoning: z && Object.keys(z).length ? z : 'none recorded (the City of Houston has no zoning; elsewhere check the city)' }),
    request: txt(lr?.ask, 600),
    program: drop({ use: S.USES[prog.use]?.label, floorAreaAskedSf: r0(prog.asked?.gfa ?? prog.gfa), unitsAsked: prog.asked?.units ?? prog.units, floors: prog.floors, buildings: prog.buildings, parkingRule: prog.use === 'amenity' ? null : ruleOf(prog.use, prog),
      stormwater: prog.storm, detentionPctAsked: prog.detentionPct, truckCourt: prog.truck || null, extras: prog.extras, fillRestOfSite: plan.params?.fill === false ? false : true,
      zones: prog.zones ? prog.zones.map(q => drop({ use: q.use === 'garage' ? 'Parking garage' : S.USES[q.use]?.label || q.use, floorAreaSf: q.gfa, units: q.units, floors: q.floors, buildings: q.buildings, items: q.items })) : null }),
    setbacksFt: { front: sb.front, side: sb.side, rear: sb.rear, pavingBuffer: sb.paving },
    totals: drop({ buildings: m.buildings, floorAreaSf: r0(m.gfa), units: m.units, unitsPerAcre: m.units ? r1(m.duAc) : null, footprintSf: r0(m.footprint), coveragePct: pc(m.coverage), far: r2(m.far), imperviousPct: pc(m.impervious), openSpacePct: pc(m.green), tallestFt: m.heightFt || null,
      phase1: m1 ? drop({ floorAreaSf: r0(m1.gfa), units: m1.units, note: 'what was asked for; the rest of the land is filled with more of the same as Phase 2' }) : null }),
    parking: drop({ required: m.required, provided: m.spaces, surfaceSpaces: m.stalls, accessibleSpaces: m.ada, inHomeGarages: m.garages || null, inParkingGarages: m.deck || null,
      forWhatWasAsked: m.p1 && (m.p1.need !== m.required || m.p1.stalls !== m.spaces) ? { required: m.p1.need, provided: m.p1.stalls } : null,
      shortBy: m.spaces < m.required ? m.required - m.spaces : null, surplus: m.spaces > m.required ? m.spaces - m.required : null, perUnit: m.units ? r2(m.perUnit) : null, per1000sf: m.gfa && !m.units ? r2(m.per1k) : null, byUse: parkingByUse,
      note: 'Ratios are typical suburban Houston-area numbers the tool uses unless the request or Settings say otherwise, not a city’s code.' }),
    stormwater: drop({ approach: st.mode, developedAcres: r2(st.acres), storageNeededAcreFt: r2(st.volume), rule: st.mode === 'none' ? (m.acres < 1 ? 'sites under an acre usually have no on-site detention' : 'none: a regional facility') : 'about ' + (plan.params?.storm?.rate ?? S.STORM.rate) + ' acre-feet of storage per developed acre (a typical Harris County figure), ' + (plan.params?.storm?.depth ?? S.STORM.depth) + ' ft deep',
      pondAreaNeededSf: st.area ? r0(st.area) : null, pondAreaDrawnSf: r0(st.pond) || 0, pondAcres: r2(st.pond / 43560) || 0, undergroundAcreFt: st.vault ? r2(st.vault) : null, detentionPctAsked: prog.detentionPct }),
    checks: (c => c.length ? c : 'all pass: inside the lot and setbacks, no overlaps, enough parking')(S.check(plan).slice(0, 12).map(i => txt(i.text, 200))),
    pieces, proForma: fin,
    lastBuild: lr || v ? drop({ effort: runEffort(lr), readAs: lr?.read?.chips?.length ? lr.read.chips.slice(0, 12) : null, assumed: lr?.read?.assumed?.slice(0, 6), notUnderstood: lr?.read?.miss?.slice(0, 6), plannedFirst: plannedOf(lr?.read?.plan), aiPlan: aiPlanOf(vs, v, lr?.read), aiNote: txt(lr?.note, 500), aiReviewSummary: txt(lr?.summary, 700),
      thisLayout: v ? drop({ name: txt(v.name, 120), engineNotes: (v.notes || []).slice(0, 8).map(t => txt(t, 240)), aiScore: v.ai?.score, aiVerdict: txt(v.ai?.verdict, 300), aiStrengths: (v.ai?.strengths || []).map(t => txt(t, 200)), aiProblems: (v.ai?.problems || []).map(t => txt(t, 220)), revisedBecause: txt(v.revisedBy, 200) }) : null,
      otherLayouts: vs.filter(x => x !== v).slice(0, 6).map(x => drop({ name: txt(x.name, 120), aiScore: x.ai?.score, floorAreaSf: r0(x.m?.gfa), units: x.m?.units, parking: x.m ? x.m.spaces + ' / ' + x.m.required : null, yieldOnCostPct: x.fin?.yoc != null ? pc(x.fin.yoc) : null })) }) : null
  });
}
// the Pro forma's numbers and the assumptions behind them (lib/proforma.mjs run())
export function finFacts(R) {
  const A = R.A || {}, simple = A.method === 'simple', S1 = R.simple || {}, ret = R.returns || {}, b = R.budget || {}, ops = R.ops || {}, sch = R.sched || {};
  const money = v => v == null || !isFinite(v) ? null : Math.round(v);
  return drop({
    method: simple ? 'TestFit one-page method (annual, no schedule; reads higher)' : 'month by month, with the construction and lease-up schedule',
    forSale: R.forSale || null,
    area: R.area ? drop({ grossBuildingSf: money(R.area.gross), leasableSf: money(R.area.leasable), hotelKeys: R.area.keys || null, basis: Object.entries(R.area.byUse || {}).filter(([, u]) => u.gross > 0).map(([k, u]) => k + ': ' + (u.basis || '')).join('; ') || null }) : null,
    budget: drop({ land: money(b.land), hardCosts: money(b.hard), hotelFfe: b.ffe > 0 ? money(b.ffe) : null, siteWorkAndParking: money(b.site), undergroundStormwater: b.storm > 0 ? money(b.storm) : null, tenantImprovements: money(b.ti), leasingCommissions: b.lc > 0 ? money(b.lc) : null, softCosts: money(b.soft), contingency: money(b.cont), developerFee: money(b.fee), interestAndLoanFees: money((b.interest || 0) + (b.loanFees || 0)), totalCost: money(simple ? S1.cost : b.total) }),
    stabilizedYear: R.forSale ? null : drop({ income: (ops.lines || []).slice(0, 8).map(l => ({ item: txt(l.k, 60), amount: money(l.v) })), vacancyAndCreditLoss: money(ops.loss), operatingExpenses: money(ops.opex), propertyTax: money(ops.tax), noi: money(simple ? S1.noi : ops.noi) }),
    returns: drop({ yieldOnCostPct: pc(simple ? S1.yoc : ret.yoc), spreadOverMarketCapPct: pc(simple ? S1.spread : ret.spread), stabilizedValue: money(simple ? S1.value : ret.value), unleveredIrrPct: pc(simple ? S1.unlevIrr : ret.unlevIrr), leveredIrrPct: pc(simple ? S1.levIrr : ret.levIrr),
      equityMultiple: r2(simple ? S1.multiple : ret.multiple), profit: money(simple ? S1.profit : ret.profit), peakEquity: money(ret.peakEquity), marginPct: R.forSale ? pc(ret.margin) : null, homeSales: R.forSale ? money(R.exit?.sales) : null }),
    scheduleMonths: drop({ designAndPermits: sch.pre, construction: sch.build, leaseUpOrSales: sch.lease, saleAtMonth: R.forSale ? null : sch.total }),
    assumptions: drop({ landPrice: money(A.landPrice), hardCostPerSf: A.hard, softCostsPct: A.softPct, contingencyPct: A.contPct, developerFeePct: A.feePct, rentsPerMonth: A.rents, commercialRentPerSfYrNNN: A.commRent, vacancyPct: A.vacancyPct, marketCapPct: A.marketCap, exitCapPct: A.exitCap,
      loanToCostPct: A.ltc, constructionRatePct: A.rate, permanentRatePct: A.permRate, holdYears: A.hold, rentGrowthPct: A.rentGrowth, note: 'Typical 2026 Houston-area defaults unless changed in the Pro forma section (' + (R.basis?.label || 'market assumptions, not verified') + '): not quotes, an appraisal or a market study.' }),
    notes: (R.warnings || []).slice(0, 8).map(w => txt(w.text, 200))
  });
}
