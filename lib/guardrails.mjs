// Finishes Solutions AI site-planning guardrails (docs/waller-guardrails.md): the City of Waller / Harris County basis,
// v1.0 of Oct 18 2026. Applies only to a site inside Waller's city limits or within its extraterritorial jurisdiction
// (ETJ), or when a plan's "Waller guardrails" setting is On; every other plan passes through untouched (effective()
// hands back the very same object), so nothing else changes.
//
// What it does, with no DOM (tested in test/guardrails.mjs, used by src/siteplan.js, lib/sitesheet.mjs and api/siteplan.js):
//   - the Waller profile: every value in the document with its classification (VERIFIED REQUIREMENT, OWNER GUARDRAIL,
//     ENGINEERING ASSUMPTION, UNVERIFIED) and its source
//   - the jurisdiction test (inside the limits from US Census places; within 0.5 mile of them = the ETJ, UNVERIFIED)
//   - the three scenarios of section 11 (A maximum code envelope, B Finishes base case, C conservative) as the inputs the
//     layout engine already takes: setbacks, the parking count factor, detention volume and the pond's footprint, lot
//     rules, the zoning maximums held below, and reserves (ROW, flood, easement buffers) as keep-out land
//   - what the plan panel, the sheet and the exports show: yields, the land-use reconciliation, the unresolved-risk
//     register, the section 10 checklist, the concept label, and a filter for the conclusions the AI must never draw
import * as S from './siteplan.mjs';

// ---------- classification ----------
export const CLS = { V: 'VERIFIED REQUIREMENT', O: 'OWNER GUARDRAIL', E: 'ENGINEERING ASSUMPTION', U: 'UNVERIFIED' };
export const CLS_SHORT = { [CLS.V]: 'Verified', [CLS.O]: 'Owner guardrail', [CLS.E]: 'Eng. assumption', [CLS.U]: 'Unverified' };
export const CLS_MEANING = {
  [CLS.V]: 'Supported by a current ordinance, adopted criterion, written agency direction or project-specific approval.',
  [CLS.O]: 'A Finishes Solutions risk-control requirement that is more conservative than the verified minimum.',
  [CLS.E]: 'A preliminary design assumption requiring validation by the responsible licensed professional.',
  [CLS.U]: 'Unknown, incomplete, conflicting or awaiting confirmation. No compliance is claimed.'
};
const RANK = { [CLS.V]: 0, [CLS.O]: 1, [CLS.E]: 2, [CLS.U]: 3 };
export const weakest = (...c) => c.filter(Boolean).reduce((a, b) => RANK[b] > RANK[a] ? b : a, CLS.V); // a figure is as sure as its least sure input

// ---------- sources ----------
export const SRC = {
  guide: 'Finishes Solutions AI Site-Planning Guardrails, City of Waller / Harris County basis, v1.0 (Oct 18 2026)',
  ord424: 'City of Waller Ordinance No. 424',
  setbacks: 'City of Waller additional requirements / setback ordinance materials',
  dd: 'Internal Waller due diligence (98 Acres DDR summary)',
  fs002: 'FS002 Drainage Report, Rev. 01',
  lgc: 'Texas Local Government Code §42.021',
  census: 'US Census places (TIGERweb)',
  fema: 'FEMA National Flood Hazard Layer, at the middle of the site',
  ifc: 'International Fire Code Appendix D (confirm the code the City has adopted)',
  app: 'The app’s working number (typical suburban practice)',
  plan: 'Measured from this plan’s geometry',
  parcel: 'Parcel outline (appraisal district) or drawn on the map; no survey'
};

// ---------- the Waller profile ----------
const v = (value, cls, src, note = '') => ({ value, cls, src, ...(note ? { note } : {}) });
export const WALLER = {
  id: 'waller', name: 'City of Waller / Harris County basis', version: '1.0', effective: '2026-10-18', city: 'Waller',
  center: [-95.9269, 30.0566], // the middle of town (Business 290 at FM 362)
  etjMiles: v(0.5, CLS.U, SRC.lgc, 'A city under 5,000 people has a 0.5-mile ETJ; Waller has about 2,600–3,000. No ETJ map was checked.'),
  factor: v(0.05, CLS.O, SRC.guide + ' §03', 'Default Finishes factor: 5% above verified minimum dimensions and counts; the owner may lower it for feasibility testing.'),
  countReserve: { min: 0.03, max: 0.05, cls: CLS.O, src: SRC.guide + ' §03, §07' }, // counts ×1.03–1.05, maximums held 3–5% below
  sfr: {
    lotW: { base: v(57, CLS.V, SRC.ord424), target: v(59, CLS.O, SRC.guide + ' §06', 'where practical') },
    lotD: { base: v(114, CLS.V, SRC.ord424), target: v(118, CLS.O, SRC.guide + ' §06', 'where practical') },
    lotArea: { base: v(6498, CLS.V, 'Calculated from 57 × 114'), target: v(6962, CLS.O, 'Calculated from 59 × 118') },
    front: { base: v(25, CLS.V, SRC.setbacks), target: v(26.25, CLS.O, SRC.guide + ' §06') },
    rear: { base: v(10, CLS.V, SRC.setbacks), target: v(10.5, CLS.O, SRC.guide + ' §06') },
    side: { base: v(5, CLS.V, SRC.setbacks), target: v(5.25, CLS.O, SRC.guide + ' §06') },
    corner: { base: v(15, CLS.V, SRC.setbacks), target: v(15.75, CLS.O, SRC.guide + ' §06') }
  },
  mf: { perUnit: v(2, CLS.V, SRC.ord424, 'At least two off-street spaces per dwelling unit; verify current project-specific requirements.'), sfSetbacks: v(false, CLS.O, SRC.guide + ' §06', 'Single-family setbacks are not applied to multifamily; the controlling requirement is to be verified.') },
  commercialRatio: v(null, CLS.U, SRC.app, 'Retail, office, industrial, self-storage and mixed-use ratios are UNVERIFIED until the controlling ratio is confirmed; the app’s ratio is the working number, with the 3–5% count reserve on top.'),
  setbacks: v(null, CLS.U, SRC.app, 'Non-residential and site-boundary setbacks: the app’s working numbers; Waller’s published setbacks are residential and are not applied to other uses.'),
  detention: {
    owner: v(1.0, CLS.O, SRC.guide + ' §04', 'Not less than 1.00 ac-ft per developed acre for initial Waller-area feasibility; never reduced without documented civil-engineer and jurisdictional confirmation.'),
    ditch: v(1.0, CLS.V, SRC.fs002 + '; ' + SRC.dd, 'Roadside-ditch outfall. Project precedent, not universal law; final storage is subject to project calculations.'),
    storm: v(0.75, CLS.V, SRC.dd, 'Public underground storm system outfall, when that outfall is confirmed.'),
    unknownC: v(0.10, CLS.O, SRC.guide + ' §04, §11', 'Conservative case: 10% more storage while the outfall or allowable release is unknown.'),
    depth: v(4, CLS.E, SRC.guide + ' §04', 'Average storage depth of the basin.'),
    slope: v(4, CLS.E, SRC.guide + ' §04', 'Side slopes, horizontal to vertical.'),
    freeboard: v(1, CLS.E, SRC.guide + ' §04'),
    bench: v(15, CLS.E, SRC.guide + ' §04', 'Maintenance bench / access strip round the top of bank.'),
    allowance: v({ pct: 0.05, min: 2000 }, CLS.E, SRC.guide + ' §04', 'Outfall structure and emergency overflow: 5% of the basin with its bench, at least 2,000 sf.'),
    ratio: v(2, CLS.E, 'Basin twice as long as wide')
  },
  fire: { lane: v(26, CLS.E, SRC.ifc, 'Fire-lane width target (base and conservative cases): drives and parking aisles are laid out at least this wide; parked cars are never counted on to be absent for emergency turning.'), laneMin: v(20, CLS.U, SRC.ifc, 'Maximum code envelope: the 20 ft minimum fire apparatus road, until the City’s adopted code is confirmed.'), reach: v(150, CLS.E, SRC.ifc, 'Every part of a building within 150 ft of a fire lane (straight line here; the code measures the hose route).') },
  row: { c: v(10, CLS.O, SRC.guide + ' §08, §11', 'Conservative case: a 10 ft reserve along each street frontage while future thoroughfare dedication is unknown.') },
  flood: {
    missingC: v(0.10, CLS.O, SRC.guide + ' §05, §11', 'Conservative case: 10% of the site reserved while flood data is missing.'),
    mappedC: v(0.25, CLS.O, SRC.guide + ' §05, §11', 'Conservative case: 25% of the site reserved where the middle of the site is in the mapped floodplain.'),
    floodwayC: v(0.35, CLS.O, SRC.guide + ' §05, §11', 'Conservative case: 35% of the site reserved where a regulatory floodway is mapped at the site.')
  },
  easementBuffer: { c: v(10, CLS.O, SRC.guide + ' §08, §11', 'Conservative case: 10 ft kept clear round each drawn easement.') }
};

// ---------- the label and the conclusions never drawn ----------
export const LABEL = 'AI-ASSISTED CONCEPTUAL SITE PLAN. FOR FEASIBILITY AND PLANNING ONLY. NOT FOR PERMIT OR CONSTRUCTION. FINAL DESIGN IS SUBJECT TO CURRENT SURVEY, TITLE, CIVIL ENGINEERING, ARCHITECTURAL/ENGINEERING REVIEW, FIRE AND ACCESSIBILITY REVIEW, UTILITY CONFIRMATION, FLOODPLAIN ANALYSIS AND APPROVAL BY THE AUTHORITY HAVING JURISDICTION.';
export const LABEL_SHORT = 'AI-assisted conceptual site plan · for feasibility and planning only · not for permit or construction';
export const GRAPHIC_LABEL = 'FINISHES SOLUTIONS - AI-ASSISTED CONCEPTUAL SITE PLAN - FOR FEASIBILITY AND PLANNING ONLY - NOT FOR PERMIT OR CONSTRUCTION.';
export const PROHIBITED = ['Permit Ready', 'Construction Ready', 'Code Compliant', 'Approved', 'Engineered', 'Guaranteed yield', 'Utility capacity confirmed'];
// the phrases, as they turn up in free text, and what they become; `flag` is what the filter found
const SCRUB = [
  [/\bpermit[- ]ready\b/gi, 'conceptual (not for permit)', 'Permit Ready'],
  [/\bready (?:for|to) (?:a |the )?permit(?:ting)?\b/gi, 'conceptual (not for permit)', 'Permit Ready'],
  [/\bconstruction[- ]ready\b/gi, 'conceptual (not for construction)', 'Construction Ready'],
  [/\bready (?:for|to start) construction\b/gi, 'conceptual (not for construction)', 'Construction Ready'],
  [/\b(?:fully |code[- ])?(?:code[- ])?compliant\b/gi, 'within the planning checks (not a code review)', 'Code Compliant'],
  [/\b(?:complies|comply|complying) with (?:the |all |every )?(?:code|codes|ordinances?|regulations?|rules)\b/gi, 'is within the planning checks (not a code review)', 'Code Compliant'],
  [/\bmeets (?:the |all |every )?(?:code|codes|ordinances?|regulations?)\b/gi, 'is within the planning checks (not a code review)', 'Code Compliant'],
  [/\b(?:is|are|was|were|been|be|being|gets?|got|now|fully|already) (?:fully |already )?(?:pre-?)?approved\b/gi, 'is subject to approval by the authority having jurisdiction', 'Approved'],
  [/\b(?:pre-?)?approved (?:plan|layout|site plan|design|concept|option|program|yield|site)s?\b/gi, 'concept subject to approval', 'Approved'],
  [/\b(?<!not |never |un|dis)(?:pre-?)?approved\b/gi, 'subject to approval', 'Approved'],
  [/\b(?:is|are|was|been|be|fully|already) (?:fully )?engineered\b/gi, 'is conceptual (no engineering yet)', 'Engineered'],
  [/\bengineered (?:plan|layout|site plan|design|drawings?|solution|concept)s?\b/gi, 'conceptual layout (no engineering yet)', 'Engineered'],
  [/\b(?<!not |never |un|re|over)engineered\b/gi, 'conceptual (no engineering yet)', 'Engineered'],
  [/\bguaranteed? (?:yield|unit count|lot count|floor area)\b/gi, 'estimated yield (a range, not a guarantee)', 'Guaranteed yield'],
  [/\b(?:yield|unit count|lot count) (?:is |are )?guaranteed\b/gi, 'yield is an estimate (a range, not a guarantee)', 'Guaranteed yield'],
  [/\b(?:utility |water |sewer |sanitary )?capacity (?:is |has been |was )?(?:confirmed|verified|available|assured)\b/gi, 'utility capacity is not confirmed (written confirmation needed)', 'Utility capacity confirmed']
];
// AI text shown on a Waller plan (Ask answers, review notes): every prohibited conclusion rewritten, and listed
export function scrub(text) {
  if (text == null) return { text, flagged: [] };
  let t = String(text); const flagged = [];
  for (const [re, to, what] of SCRUB) t = t.replace(re, () => { if (!flagged.includes(what)) flagged.push(what); return to; });
  return { text: t, flagged };
}
export const scrubText = t => scrub(t).text;
// the same over an answer's lists of strings (followups, strengths, problems…)
export const scrubAll = list => Array.isArray(list) ? list.map(x => typeof x === 'string' ? scrubText(x) : x) : list;
// does any prohibited conclusion appear (for tests and the app's own strings)?
export const hasProhibited = text => SCRUB.some(([re]) => { re.lastIndex = 0; const hit = re.test(String(text || '')); re.lastIndex = 0; return hit; });

// ---------- the AI's instruction (appendix A) ----------
export const SYSTEM_TEXT = 'Use the Finishes Solutions Waller Site-Planning Guardrails as mandatory constraints. First determine jurisdiction, roadway authority, drainage authority, FEMA flood status, utility providers, title/easement constraints, applicable development agreement and current adopted standards. Classify every material input as VERIFIED REQUIREMENT, OWNER GUARDRAIL, ENGINEERING ASSUMPTION or UNVERIFIED. Apply a 5% upward reserve to minimum dimensions and minimum counts where practical; maintain a 3%-5% buffer below maximum limits; never alter prohibitions. For initial Waller-area feasibility, reserve detention storage at not less than 1.00 acre-foot per developed acre and increase it when project-specific criteria require more. Treat acre-foot as volume, not pond surface area. Do not certify floodplain/floodway land, outfall capacity, utility capacity or title constraints without supporting data. Generate Maximum Code Envelope, Finishes Base Case and Conservative Case scenarios. Reconcile gross acreage through ROW, flood reserve, detention, easements, buffers, roads, parking and net usable land. Show buildings, setbacks, parking, accessible routes, circulation, fire access, truck/loading paths, refuse, drainage, outfall, utilities and landscape/open space. Report unresolved risks and do not label any output permit-ready, engineered, approved, construction-ready or code-compliant.';

// ---------- jurisdiction ----------
const toRad = Math.PI / 180;
export const milesBetween = (a, b) => { const dLat = (b[1] - a[1]) * toRad, dLon = (b[0] - a[0]) * toRad, x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLon / 2) ** 2; return 3958.8 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); };
const isCity = (name, P) => new RegExp('^' + P.city + '$', 'i').test(String(name || '').trim());
// facts: the project's jurisdiction facts (lib/project.mjs siteFactsFrom): place ({ name } inside a city's limits, null
// outside every city, missing = not checked), near (the cities within 0.5 mile of the point; missing = not checked),
// flood, road, water, utilities. at: [lon, lat] of the site's middle, for a site whose facts predate the ETJ check.
// -> { status: 'city' | 'etj' | 'outside' | 'unknown', cls, reason, src, flood, road, water }
export function jurisdictionOf(facts, at = null, P = WALLER) {
  const f = facts || {}, near = Array.isArray(f.near) ? f.near : null, base = { flood: floodOf(f), road: f.road?.road || null, water: (f.water || []).map(w => w.name).filter(Boolean).slice(0, 3), utilities: Array.isArray(f.utilities) ? f.utilities.length : null };
  if (!facts || f.place === undefined) {
    const close = at && milesBetween(at, P.center) < 3;
    return { ...base, status: 'unknown', cls: CLS.U, src: SRC.census, reason: close ? 'The site’s jurisdiction hasn’t been checked, and it is near Waller: check it (the project’s Jurisdiction & site) or turn the Waller guardrails On.' : 'The site’s jurisdiction hasn’t been checked.' };
  }
  if (f.place && isCity(f.place.name, P)) return { ...base, status: 'city', cls: CLS.V, src: SRC.census, reason: 'Inside the City of ' + P.city + '’s limits (' + SRC.census + '; confirm with the City).' };
  if (f.place) return { ...base, status: 'outside', cls: CLS.V, src: SRC.census, reason: 'Inside the City of ' + f.place.name + '’s limits, not ' + P.city + '’s.' };
  if (near && near.some(n => isCity(n?.name ?? n, P))) return { ...base, status: 'etj', cls: CLS.U, src: SRC.census + '; ' + SRC.lgc, reason: 'Within 0.5 mile of ' + P.city + '’s city limits, outside them: treated as ' + P.city + '’s extraterritorial jurisdiction (ETJ). UNVERIFIED: ' + SRC.lgc + ' gives a city under 5,000 people a 0.5-mile ETJ and ' + P.city + ' has about 2,600–3,000; no ETJ map was checked.' };
  if (!near && at && milesBetween(at, P.center) < 3) return { ...base, status: 'unknown', cls: CLS.U, src: SRC.census, reason: 'Outside every city’s limits and near ' + P.city + ', but whether it is within 0.5 mile of them (the ETJ) wasn’t checked: refresh the project’s Jurisdiction & site, or turn the Waller guardrails On.' };
  return { ...base, status: 'outside', cls: CLS.V, src: SRC.census, reason: 'Outside ' + P.city + '’s city limits and its 0.5-mile ETJ.' };
}
// the flood status the scenarios read: missing (not looked up, or no FEMA panel), mapped (100-year floodplain at the
// middle of the site), floodway (a regulatory floodway mapped there), moderate (500-year) or minimal
function floodOf(f) {
  if (!f.flood || !f.flood.zone) return { status: 'missing', zone: null, cls: CLS.U };
  const fw = /floodway/i.test(f.flood.subtype || ''), hi = f.flood.risk === 'high' || /^(A|V)/i.test(f.flood.zone);
  return { status: fw ? 'floodway' : hi ? 'mapped' : f.flood.risk === 'moderate' ? 'moderate' : f.flood.risk === 'undetermined' ? 'missing' : 'minimal', zone: f.flood.zone, subtype: f.flood.subtype || null, cls: CLS.U };
}

// ---------- the plan's settings ----------
export const OUTFALLS = [['unknown', 'Unknown'], ['ditch', 'Roadside ditch'], ['storm', 'Public underground storm sewer'], ['channel', 'Channel']];
export const MODES = [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']];
export const SCENARIOS = {
  A: { id: 'A', name: 'Maximum code envelope', short: 'Max envelope', what: 'Verified minimums with no owner factor; detention at the verified basis for the outfall.' },
  B: { id: 'B', name: 'Finishes base case', short: 'Base case', what: 'The owner’s directional factor (5%) and at least 1.00 ac-ft of detention per developed acre.' },
  C: { id: 'C', name: 'Conservative case', short: 'Conservative', what: 'The base case plus reserves for what is unresolved: ROW, flood, easement buffers and detention while the outfall is unknown.' }
};
const num = (x, lo, hi, d) => { const n = +x; return x == null || x === '' || !Number.isFinite(n) ? d : Math.max(lo, Math.min(hi, n)); };
// pl.params.guard: { mode, factor (%), outfall, row (ft), scenario, depth (ft), slope (:1) }
export function settingsOf(plan) {
  const g = plan?.params?.guard || {};
  return { mode: ['on', 'off'].includes(g.mode) ? g.mode : 'auto', factor: num(g.factor, 0, 5, 5) / 100, outfall: OUTFALLS.some(([k]) => k === g.outfall) ? g.outfall : 'unknown',
    row: num(g.row, 0, 100, 0), scenario: SCENARIOS[g.scenario] ? g.scenario : 'B', depth: num(g.depth, 1, 12, WALLER.detention.depth.value), slope: num(g.slope, 2, 10, WALLER.detention.slope.value) };
}
// on for this plan? pl.jur: what jurisdictionOf found for its site (src/siteplan.js keeps it on the plan)
export const isOn = plan => { const g = settingsOf(plan); return g.mode === 'on' || g.mode === 'auto' && ['city', 'etj'].includes(plan?.jur?.status); };
export const withScenario = (plan, s) => ({ ...plan, params: { ...(plan.params || {}), guard: { ...(plan.params?.guard || {}), scenario: s } } });

// ---------- the directional factor (section 03) ----------
const up2 = x => Math.ceil(x * 100 - 1e-9) / 100;
export const minimum = (x, f) => up2(x * (1 + f)); // a minimum: × (1 + f), rounded up to the hundredth (25 → 26.25)
export const countReserve = f => f > 0 ? Math.min(WALLER.countReserve.max, Math.max(WALLER.countReserve.min, f)) : 0; // counts and maximums: 3–5% (none at 0)
export const count = (n, f) => Math.ceil(n * (1 + countReserve(f)) - 1e-9); // a minimum count: × 1.03–1.05, rounded up (100 → 105)
export const maximum = (x, f) => Math.floor(x * (1 - countReserve(f)) * 100 + 1e-9) / 100; // a maximum: held 3–5% below
// the single-family lot targets (59 × 118 at the full 5%), in between for a lower factor, rounded up to the foot
const lotTarget = (o, f) => Math.ceil(o.base.value + (o.target.value - o.base.value) * Math.min(1, f / WALLER.factor.value) - 1e-9);

// detention storage per developed acre for a scenario and outfall: { rate, cls, src, why }
export function detentionRate(s, outfall, userRate = null, P = WALLER) {
  const D = P.detention, ver = outfall === 'storm' ? D.storm : outfall === 'ditch' ? D.ditch : null;
  let rate, cls, why, src;
  if (s === 'A') { rate = ver ? ver.value : D.owner.value; cls = ver ? CLS.V : CLS.U; src = ver ? ver.src : D.owner.src; why = ver ? 'Verified basis for a ' + (outfall === 'storm' ? 'public underground storm sewer' : 'roadside ditch') + ' outfall' : 'Outfall ' + (outfall === 'channel' ? 'to a channel: no verified Waller basis on file' : 'unknown') + ', so no lower verified basis applies'; }
  else { rate = outfall === 'storm' ? D.storm.value : D.owner.value; cls = outfall === 'storm' ? CLS.V : outfall === 'ditch' ? CLS.O : CLS.U; src = outfall === 'storm' ? D.storm.src : D.owner.src; why = outfall === 'storm' ? '0.75 ac-ft/ac for a confirmed public underground storm sewer outfall' : 'Finishes default, at least 1.00 ac-ft per developed acre' + (outfall === 'unknown' ? ' (outfall unknown: UNVERIFIED)' : outfall === 'channel' ? ' (channel outfall: no verified basis)' : ''); }
  if (s === 'C' && outfall === 'unknown') { rate = Math.round(rate * (1 + D.unknownC.value) * 1000) / 1000; why += '; +10% while the outfall is unknown'; cls = CLS.U; }
  if (+userRate > rate + 1e-9) { rate = +userRate; why = 'The plan’s own storage (a project study or authority figure), higher than the guardrail'; cls = CLS.E; src = 'This plan’s Stormwater setting'; }
  return { rate, cls, src, why };
}

// everything a scenario sets, from the plan: the numbers and their classification
export function rulesOf(plan, s = settingsOf(plan).scenario, P = WALLER) {
  const g = settingsOf(plan), f = s === 'A' ? 0 : g.factor, cr = countReserve(f), prog = S.normalizeProgram(plan.program), use = prog.use, J = plan.jur || {};
  const userRate = plan.params?.storm?.rate != null && plan.params.storm.rate !== '' ? +plan.params.storm.rate : null;
  const det = detentionRate(s, g.outfall, userRate, P), flood = J.flood || { status: 'missing' };
  const floodPct = s !== 'C' ? 0 : flood.status === 'floodway' ? P.flood.floodwayC.value : flood.status === 'mapped' ? P.flood.mappedC.value : flood.status === 'missing' ? P.flood.missingC.value : 0;
  const row = s === 'C' ? Math.max(g.row, P.row.c.value) : g.row;
  const sfr = use === 'sfr', mfLike = use === 'multifamily';
  return { s, f, cr, use, outfall: g.outfall, det, depth: g.depth, slope: g.slope, row, floodPct, flood, easeBuf: s === 'C' ? P.easementBuffer.c.value : 0, lane: s === 'A' ? P.fire.laneMin.value : P.fire.lane.value,
    perUnit: mfLike ? Math.max(prog.perUnit, P.mf.perUnit.value) : prog.perUnit, ratio: prog.ratio,
    lot: sfr ? { minW: s === 'A' ? P.sfr.lotW.base.value : lotTarget(P.sfr.lotW, f), minD: s === 'A' ? P.sfr.lotD.base.value : lotTarget(P.sfr.lotD, f), front: minimum(P.sfr.front.base.value, f), side: minimum(P.sfr.side.base.value, f), rear: minimum(P.sfr.rear.base.value, f), corner: minimum(P.sfr.corner.base.value, f) } : null };
}

// ---------- the effective plan ----------
const SB_KEYS = ['front', 'side', 'rear', 'paving', 'paveFront', 'paveSide', 'paveRear', 'street'];
// the plan as a scenario lays it out and measures it: the same object back when the guardrails are off
export function effective(plan, P = WALLER) {
  if (!plan || plan.__guard || !isOn(plan)) return plan;
  const R = rulesOf(plan, undefined, P), prog0 = plan.program || {}, cf = 1 + R.cr;
  const sb0 = { ...S.SETBACKS, ...(plan.setbacks || {}) }, sb = { ...sb0 };
  for (const k of SB_KEYS) if (sb0[k] != null && sb0[k] !== '' && Number.isFinite(+sb0[k])) sb[k] = minimum(+sb0[k], R.f);
  if (R.row > 0) { sb.front = up2((+sb.front || 0) + R.row); sb.paveFront = up2((+(sb.paveFront ?? sb.paving) || 0) + R.row); if (sb0.street != null && sb0.street !== '') sb.street = up2(+sb.street + R.row); } // measured from the future right-of-way line
  const program = { ...prog0, ratio: Math.round(R.ratio * cf * 1e4) / 1e4, perUnit: S.USES[R.use]?.garage ? R.perUnit : Math.round(R.perUnit * cf * 1e4) / 1e4 }; // (homes park in their garages and driveways: no stall reserve)
  if (program.detentionPct != null) program.detentionPct = null; // the pond is sized from its volume, not a share of the site
  if (R.lot) { program.lot ={ minW: R.lot.minW, front: R.lot.front, side: R.lot.side }; program.lotD = Math.max(S.normalizeProgram(prog0).lotD, R.lot.minD); }
  const st0 = plan.params?.storm || {}, D = P.detention;
  const storm = { ...st0, mode: st0.mode || 'detention', rate: R.det.rate, depth: R.depth, basin: { slope: R.slope, freeboard: D.freeboard.value, bench: D.bench.value, ratio: D.ratio.value, allowPct: D.allowance.value.pct, allowMin: D.allowance.value.min } };
  const z0 = plan.zoning || null, zoning = z0 ? { ...z0 } : z0;
  if (zoning) for (const k of ['max_coverage_pct', 'max_far', 'max_building_height_ft']) if (+zoning[k] > 0) zoning[k] = maximum(+zoning[k], R.f);
  const els0 = plan.elements || [], els = els0.map(e => e.kind === 'keepout' && R.easeBuf > 0 ? { ...e, poly: S.grow(S.shapeOf(e), R.easeBuf).map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]), guardBuf: R.easeBuf } : e);
  const fr = R.floodPct > 0 ? floodReserve(plan, R.floodPct) : null; if (fr) els.push(fr);
  const recipe = plan.recipe?.prog ? { ...plan.recipe, prog: { ...plan.recipe.prog, ratio: program.ratio, perUnit: program.perUnit, ...(program.lot ? { lot: program.lot, lotD: program.lotD } : {}) } } : plan.recipe;
  const aisle = Math.max(+plan.params?.aisle || 24, R.lane); // fire lanes: a parking aisle wide enough to be one
  return { ...plan, setbacks: sb, program, params: { ...(plan.params || {}), storm, ...(aisle !== (+plan.params?.aisle || 24) ? { aisle } : {}) }, zoning, elements: els, ...(recipe !== undefined ? { recipe } : {}), __guard: { profile: P.id, scenario: R.s, f: R.f, cf, row: R.row, floodPct: R.floodPct, easeBuf: R.easeBuf, outfall: R.outfall, rate: R.det.rate, lane: R.lane } };
}
// the layout engine's arguments for a plan (layoutOptions(plan, program, opts)): null when the guardrails are off
export function forLayout(plan, program, opts = {}) {
  const base = { ...plan, program: program ?? plan.program }, e = effective(base); if (e === base) return null;
  const ko = e.elements.filter(x => x.kind === 'keepout').map(x => ({ ...x, pinned: true }));
  return { plan: e, program: e.program, opts: { ...opts, keepout: ko.length ? ko : null } };
}
// what the engine handed back, made fit to keep on the plan: the program's working numbers (not the factored ones), the
// plan's own stormwater settings, its own easements (not the buffered ones or the flood reserve, which effective() adds
// back whenever the plan is measured)
export function unapply(o, base) {
  if (!o) return o;
  const raw = base.program || {}, keep = { ratio: raw.ratio ?? null, perUnit: raw.perUnit ?? null, detentionPct: raw.detentionPct ?? null }, prog = p => { if (!p) return p; const q = { ...p, ...keep }; if (raw.lotD == null) delete q.lotD; else q.lotD = raw.lotD; if (raw.lot) q.lot = raw.lot; else delete q.lot; return q; };
  const ko = (base.elements || []).filter(e => e.kind === 'keepout');
  const out = { ...o, ...(o.program ? { program: prog(o.program) } : {}) };
  if (o.params) { out.params = { ...o.params }; for (const k of ['storm', 'aisle']) if (base.params?.[k] != null) out.params[k] = base.params[k]; else delete out.params[k]; }
  if (Array.isArray(o.elements)) out.elements = o.elements.some(e => e.kind === 'keepout') ? o.elements.filter(e => e.kind !== 'keepout').concat(ko.map(e => ({ ...e }))) : o.elements;
  if (o.recipe?.prog) out.recipe = { ...o.recipe, prog: prog(o.recipe.prog) };
  return out;
}

// ---------- reserves as keep-out land ----------
// the flood reserve (conservative case, no flood geometry): a strip across the back of the site holding `pct` of it
export function floodReserve(plan, pct) {
  const ring = plan.ring || []; if (ring.length < 3 || !(pct > 0)) return null;
  const strip = rearStrip(ring, plan.front, S.ringArea(ring) * pct); if (!strip) return null;
  const c = S.centroid(strip), xs = strip.map(p => p[0]), ys = strip.map(p => p[1]);
  return { id: 'guard-flood', kind: 'keepout', name: 'Flood reserve (conservative case)', note: Math.round(pct * 100) + '% of the site held back until a flood study', poly: strip.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]), x: c[0], y: c[1], w: Math.max(...xs) - Math.min(...xs), d: Math.max(...ys) - Math.min(...ys), rot: 0, guard: 'flood', pinned: true };
}
// the part of a ring behind a line parallel to its front, cut so it holds `area` sq ft (the back of the site)
export function rearStrip(ring, front, area) {
  const f = front != null && front < ring.length ? front : S.longestEdge(ring), a = ring[f], b = ring[(f + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  let n = [(b[1] - a[1]) / L, -(b[0] - a[0]) / L]; const c = S.centroid(ring); if ((c[0] - a[0]) * n[0] + (c[1] - a[1]) * n[1] < 0) n = [-n[0], -n[1]]; // into the site
  const depth = p => (p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1], D = Math.max(...ring.map(depth));
  const behind = t => clipHalf(ring, p => depth(p) - t); // the part deeper than t
  let lo = 0, hi = D; if (S.ringArea(behind(0)) <= area) return behind(0);
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (S.ringArea(behind(mid)) > area) lo = mid; else hi = mid; }
  const r = behind((lo + hi) / 2); return r.length >= 3 ? r : null;
}
// a ring cut by a half-plane (keep where g(p) >= 0): Sutherland–Hodgman, fine for one straight cut of any simple ring
function clipHalf(ring, g) {
  const out = [];
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length], gp = g(p), gq = g(q);
    if (gp >= 0) out.push(p); if ((gp >= 0) !== (gq >= 0)) { const t = gp / (gp - gq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); } }
  return out;
}
// the ROW reserve's land: each street frontage's length × the reserve's depth (sq ft)
export function rowArea(plan, ft) {
  if (!(ft > 0) || (plan.ring || []).length < 3) return 0;
  const rules = S.edgeRules(plan.ring, plan.front, plan.setbacks, plan.streets);
  return plan.ring.reduce((s, _, k) => s + (rules[k].role === 'front' || rules[k].street ? S.edgeLen(plan.ring, k) * ft : 0), 0);
}

// ---------- measuring a plan under the guardrails ----------
// metrics on the effective plan; parking a use's own ratio doesn't carry (mixed use, a pad of another use) gets its count
// reserve here, so the need always includes it
export function metrics(plan) {
  const e = effective(plan), m = S.metrics(e); if (e === plan || !e.__guard) return m;
  const cf = e.__guard.cf, prog = S.normalizeProgram(e.program); if (!(cf > 1)) return m;
  const B = (e.elements || []).filter(x => x.kind === 'building'), useOf = x => S.USES[x.use] ? x.use : prog.use;
  const other = prog.zones ? null : B.filter(x => useOf(x) !== prog.use && !S.USES[useOf(x)].garage && useOf(x) !== 'multifamily').reduce((t, x) => t + S.gfaOf(x) / 1000 * (S.USES[useOf(x)].ratio ?? 3), 0);
  const bump = n => prog.zones ? Math.ceil(n * cf - 0.01) : Math.ceil(n + other * (cf - 1) - 0.01);
  if (prog.zones || other > 0) { const need = bump(m.required); return { ...m, required: need, need, p1: { ...m.p1, need: m.p1.need === m.required ? need : bump(m.p1.need) } }; }
  return m;
}
// the checks on the effective plan, with the guardrails' own: parking to the scenario's count, fire access
export function check(plan) {
  const e = effective(plan), issues = S.check(e); if (e === plan || !e.__guard) return issues;
  const m = metrics(plan), out = issues.filter(i => !/^Parking is /.test(i.text));
  if (m.gfa && m.spaces < m.required) out.push({ level: 'warn', text: 'Parking is ' + S.spacesWord(m.required - m.spaces) + ' short of ' + m.required.toLocaleString('en-US') + ' required with the ' + Math.round((e.__guard.cf - 1) * 100) + '% count reserve' });
  const fa = fireAccess(e); for (const x of fa.fails) out.push({ id: x.id, level: 'warn', text: x.name + ': parts are about ' + Math.round(x.far) + ' ft from a ' + fa.lane + ' ft fire lane (150 ft at most)' });
  return out;
}
// fire access: every building within `reach` ft (straight line) of a fire lane: a drive at least the scenario's lane width
// (26 ft; 20 in the maximum code envelope), or a parking lot's aisle that wide (measured to the aisle, past the stalls:
// a parked car is never counted on to be absent)
export function fireAccess(plan, P = WALLER) {
  const els = plan.elements || [], lane = plan.__guard?.lane ?? P.fire.lane.value, reach = P.fire.reach.value, aisle0 = +plan.params?.aisle || S.STALL.aisle;
  const wide = e => (e.kind === 'drive' || e.kind === 'truck') && e.note !== 'Drive-thru lane' && (S.isFree(e) ? (e.path ? (e.width || 26) >= lane - 0.5 : true) : Math.min(e.w, e.d) >= lane - 0.5);
  const lanes = els.filter(wide).map(e => ({ r: S.shapeOf(e), pad: 0 })).concat(els.filter(e => e.kind === 'parking' && !S.isFree(e) && !e.rv && (e.sa || aisle0) >= lane - 0.5 && S.stalls(e).rows?.length >= 2).map(e => ({ r: S.shapeOf(e), pad: e.sd || S.STALL.d }))), fails = [];
  const B = els.filter(e => e.kind === 'building' && !['sfr', 'townhomes', 'duplex'].includes(e.use)); // homes face their streets
  const dist = p => Math.min(...lanes.map(({ r, pad }) => S.inRing(p, r) ? 0 : r.reduce((m, a, i) => Math.min(m, S.segDist(p, a, r[(i + 1) % r.length])), Infinity) + pad));
  B.forEach((b, i) => { const c = S.shapeOf(b), pts = c.concat(c.map((p, k) => [(p[0] + c[(k + 1) % c.length][0]) / 2, (p[1] + c[(k + 1) % c.length][1]) / 2])), far = lanes.length ? Math.max(...pts.map(dist)) : Infinity;
    if (far > reach) fails.push({ id: b.id, name: b.name || 'Building ' + (i + 1), far }); });
  return { lane, lanes: lanes.length, buildings: B.length, fails, ok: !fails.length };
}

// ---------- yields, the land table, the risks and the checklist ----------
// a laid-out plan's yield under its scenario
export function yields(plan) {
  const e = effective(plan), m = metrics(plan), sn = (e.elements || []).length ? S.stormOf(e) : null, G = e.__guard || {};
  const lots = (e.elements || []).filter(x => x.kind === 'lot').length;
  return { scenario: G.scenario || null, buildingSf: Math.round(m.gfa), leasableSf: Math.round(m.nrsf), units: m.units || 0, lots, parkingRequired: m.required, parkingProvided: m.spaces,
    imperviousPct: Math.round(m.impervious * 1000) / 10, detentionAcFt: sn ? Math.round(sn.volume * 100) / 100 : 0, detentionRate: G.rate ?? null, detentionFootprintSf: sn ? Math.round(sn.area) : 0, detentionDrawnSf: Math.round(m.pond), vaultAcFt: sn ? Math.round(sn.vault * 100) / 100 : 0 };
}
const r100 = x => Math.round(x / 100) * 100;
// a range over scenarios' yields (never one precise number while inputs are unresolved): { lo, hi } per figure
export function range(list, key) { const v = list.filter(Boolean).map(y => y[key]).filter(Number.isFinite); return v.length ? { lo: Math.min(...v), hi: Math.max(...v) } : null; }
export const rangeText = (r, unit = '', round = r100) => !r ? '—' : round(r.lo) === round(r.hi) ? '~' + round(r.lo).toLocaleString('en-US') + unit : round(r.lo).toLocaleString('en-US') + '–' + round(r.hi).toLocaleString('en-US') + unit;

// Each scenario's yield from laid-out candidates: { plan (a plan with its elements), scenario (what it was laid out
// for), onMap }. A layout made for a stricter scenario holds every looser one's rules too (the scenarios nest: A's
// minimums under B's factor under C's reserves), so each scenario takes the best layout that passes its own checks from
// those made for it or a stricter one: A ≥ B ≥ C, and each figure is a layout that really fits. -> { A, B, C }, each
// yields() plus { ok, from, onMap, cand }, or null
const ORDER = ['A', 'B', 'C'];
export function passes(plan) { const m = metrics(plan); return !check(plan).some(i => i.level === 'bad') && !(m.gfa && m.spaces < m.required); }
const evals = new WeakMap();
function evalAs(c, s) { let m = evals.get(c); if (!m) evals.set(c, m = {}); if (!m[s]) { const p = withScenario(c.plan, s); m[s] = { y: yields(p), ok: passes(p) }; } return m[s]; }
export function bestByScenario(cands) {
  const out = {}, list = (cands || []).filter(c => c?.plan?.elements?.some(e => e.kind === 'building') && ORDER.includes(c.scenario));
  for (const s of ORDER) {
    let best = null;
    for (const c of list) { if (ORDER.indexOf(c.scenario) < ORDER.indexOf(s)) continue; const r = evalAs(c, s); if (!r.ok) continue;
      if (!best || r.y.leasableSf > best.y.leasableSf + 0.5 || Math.abs(r.y.leasableSf - best.y.leasableSf) <= 0.5 && (r.y.units > best.y.units || c.onMap && !best.c.onMap)) best = { ...r, c }; }
    if (!best) { const c = list.find(x => x.scenario === s && x.onMap) || list.find(x => x.scenario === s); if (c) best = { ...evalAs(c, s), c }; }
    out[s] = best ? { ...best.y, ok: best.ok, from: best.c.scenario, onMap: !!best.c.onMap, cand: best.c } : null;
  }
  return out;
}

const ac = sf => sf / 43560;
// Gross site through ROW, flood reserve, detention, easements, buffers, roads and parking to net usable land, then the
// quantities; each row { key, label, acres, pct, qty, basis, cls }. The land rows add back up to the gross site.
export function landTable(plan) {
  const e = effective(plan), G = e.__guard || {}, R = rulesOf(plan, G.scenario || undefined), m = metrics(plan), els = e.elements || [], site = m.siteSf;
  const sum = (f, ks) => els.filter(x => ks.includes(x.kind) && f(x)).reduce((t, x) => t + (x.kind === 'building' ? S.footArea(x) : S.elArea(x)), 0), any = () => true;
  const flood = sum(x => x.guard === 'flood', ['keepout']), ease = sum(x => x.guard !== 'flood', ['keepout']), pond = m.pond;
  const road = sum(any, ['drive']), park = sum(any, ['parking', 'truck', 'garage', 'tanks']);
  const lotsSf = sum(any, ['lot']), net0 = lotsSf > 0 ? lotsSf + sum(any, ['building', 'canopy', 'plaza', 'court', 'pool', 'patio', 'play', 'trash', 'foodtruck']) - sum(x => x.use === 'sfr' || x.note === 'Driveway', ['building', 'plaza']) : sum(any, ['building', 'canopy', 'plaza', 'court', 'pool', 'patio', 'play', 'trash', 'foodtruck']);
  const row0 = rowArea(e, G.row || 0), left0 = site - flood - ease - pond - road - park - net0, row = Math.max(0, Math.min(row0, left0)), buf = Math.max(0, left0 - row), net = site - row - flood - pond - ease - buf - road - park;
  const sn = els.length ? S.stormOf(e) : null, unresolvedFlood = R.flood.status === 'missing' || R.flood.status === 'mapped' || R.flood.status === 'floodway';
  const rows = [
    { key: 'gross', label: 'Gross site', sf: site, basis: SRC.parcel, cls: CLS.U },
    { key: 'row', label: 'Less existing/proposed ROW', sf: -row, basis: G.row > 0 ? G.row + ' ft reserve along the street frontage' + (G.scenario === 'C' && settingsOf(plan).row < G.row ? ' (conservative case)' : '') : 'No future thoroughfare flagged; roadway authority not determined', cls: G.row > 0 ? CLS.O : CLS.U },
    { key: 'flood', label: 'Less flood/floodway reserve', sf: -flood, basis: flood ? Math.round(G.floodPct * 100) + '% of the site held back: ' + floodWords(R.flood) : floodWords(R.flood) + (unresolvedFlood ? ' (reserved in the conservative case)' : ''), cls: flood ? CLS.O : unresolvedFlood ? CLS.U : CLS.E },
    { key: 'detention', label: 'Less detention/drainage', sf: -pond, basis: sn && sn.mode !== 'none' ? sn.volume.toFixed(2) + ' ac-ft at ' + (G.rate ?? 0).toFixed(2) + ' ac-ft/ac; basin footprint from volume' + (sn.mode === 'underground' ? ' (underground vaults)' : '') : 'No on-site detention', cls: R.det.cls },
    { key: 'easements', label: 'Less easements/pipelines', sf: -ease, basis: ease ? 'Drawn easements' + (G.easeBuf ? ' with a ' + G.easeBuf + ' ft buffer' : '') + ', not surveyed; no title report' : 'None drawn; no title report', cls: CLS.U },
    { key: 'buffers', label: 'Less buffers/setbacks/landscape', sf: -buf, basis: 'Setbacks and landscape buffers ' + (G.f ? '× ' + (1 + G.f).toFixed(2) + ' (owner factor)' : 'at the working minimums') + '; open land left over', cls: G.f ? CLS.O : CLS.U },
    { key: 'road', label: 'Less road/circulation', sf: -road, basis: 'Drives and streets as drawn (26 ft fire-lane target)', cls: CLS.E },
    { key: 'parking', label: 'Less parking/loading', sf: -park, basis: m.spaces.toLocaleString('en-US') + ' spaces for ' + m.required.toLocaleString('en-US') + ' required' + (G.cf > 1 ? ' (×' + G.cf.toFixed(2) + ' count reserve)' : ''), cls: R.use === 'multifamily' ? (G.cf > 1 ? CLS.O : CLS.V) : CLS.U },
    { key: 'net', label: 'Net usable land', sf: net, basis: lotsSf ? 'Residential lots, building pads and amenities' : 'Building pads and amenities', cls: CLS.U, total: true }
  ].map(r => ({ ...r, sf: r.sf || 0 })).map(r => ({ ...r, acres: ac(r.sf), pct: site ? r.sf / site : 0 }));
  const lots = els.filter(x => x.kind === 'lot').length;
  const qty = [
    { key: 'units', label: 'Residential lots / multifamily units', qty: lots ? lots + ' lots' : m.units ? m.units.toLocaleString('en-US') + ' units' : 'None', basis: lots ? 'Lots at least ' + (R.lot?.minW ?? '') + ' × ' + (R.lot?.minD ?? '') + ' ft' : m.units ? 'Counted from the buildings drawn, once every site system fits' : 'No homes in this plan', cls: lots ? (G.f ? CLS.O : CLS.V) : m.units ? CLS.U : CLS.E },
    { key: 'gfa', label: 'Building square feet', qty: Math.round(m.gfa).toLocaleString('en-US') + ' sf', basis: Math.round(m.nrsf).toLocaleString('en-US') + ' sf leasable', cls: CLS.U },
    { key: 'impervious', label: 'Impervious cover', qty: ac(m.impervious * site).toFixed(2) + ' ac (' + Math.round(m.impervious * 100) + '%)', basis: 'Roofs and paving as drawn', cls: CLS.E },
    { key: 'detvol', label: 'Detention volume and footprint', qty: sn && sn.mode !== 'none' ? sn.volume.toFixed(2) + ' ac-ft · ' + ac(sn.area).toFixed(2) + ' ac needed · ' + ac(pond).toFixed(2) + ' ac drawn' : 'None', basis: 'Storage ' + R.depth + ' ft deep, ' + R.slope + ':1 slopes, 1 ft freeboard, 15 ft bench, outfall allowance', cls: CLS.E }
  ];
  return { rows, qty, siteSf: site, sum: rows.filter(r => r.key !== 'gross').reduce((t, r) => t + (r.key === 'net' ? r.sf : -r.sf), 0) };
}
const floodWords = fl => fl.status === 'missing' ? 'Flood data missing' : fl.status === 'floodway' ? 'Regulatory floodway mapped at the site (FEMA zone ' + fl.zone + ')' : fl.status === 'mapped' ? 'In the mapped 100-year floodplain at the middle of the site (FEMA zone ' + fl.zone + ')' : fl.status === 'moderate' ? 'In the 500-year floodplain at the middle of the site (zone ' + fl.zone + ')' : 'Outside the mapped floodplain at the middle of the site (zone ' + fl.zone + ')';

// the unresolved-risk register (sections 02, 10, 12): what is unknown, from the facts the app has, and why it matters.
// Each { id, title, why, cls, stop (a stop condition), escalate (a mandatory escalation) }
export function risks(plan) {
  const e = effective(plan), G = e.__guard || {}, R = rulesOf(plan, G.scenario || undefined), J = plan.jur || {}, g = settingsOf(plan), out = [];
  const add = (id, title, why, o = {}) => out.push({ id, title, why, cls: o.cls || CLS.U, stop: !!o.stop, escalate: o.escalate !== false });
  add('survey', 'No current survey', 'The site outline comes from parcel records or was drawn on the map. Acreage, frontage, setbacks and every yield here can move with a survey.');
  add('title', 'No title report', 'Recorded easements, pipelines, right-of-way, deed restrictions and any development agreement are unknown; the easements on the plan are drawn, not surveyed.');
  const fl = R.flood;
  if (fl.status === 'missing') add('flood', 'Flood data missing', 'No current FEMA designation was found for the site. Stop condition: only a constraint map and a conservative range are given; no land is certified developable until the floodplain and floodway are known.', { stop: true });
  else if (fl.status === 'floodway') add('flood', 'Regulatory floodway mapped at the site', 'No building may go in the floodway, and elevation alone doesn’t resolve access, compensating storage or drainage. Stop condition until a flood study maps the floodway on the site; the conservative case holds ' + Math.round(WALLER.flood.floodwayC.value * 100) + '% back.', { stop: true });
  else if (fl.status === 'mapped') add('flood', 'Mapped 100-year floodplain at the site', 'Zone ' + fl.zone + ' at the middle of the site. Fill, compensating storage and floodplain permits can change the layout and the yield; affected land is reserved in the conservative case until a flood study, topography and the City’s criteria are in hand.');
  if (g.outfall === 'unknown') add('outfall', 'Outfall and allowable release unknown', 'The receiving system (storm sewer, roadside ditch, channel) isn’t identified, so no discharge capacity is assumed: detention is held at 1.00 ac-ft per developed acre (10% more in the conservative case).');
  else if (g.outfall === 'channel') add('outfall', 'Channel outfall without a verified basis', 'No verified Waller storage rate is on file for a channel outfall; 1.00 ac-ft per acre is held until a drainage study and the authority confirm the basis.');
  else if (g.outfall === 'storm') add('outfall', 'Storm sewer outfall to be confirmed in writing', '0.75 ac-ft per acre applies only with documented civil-engineer and City confirmation of the public underground storm system and its capacity.', { cls: CLS.V });
  if ((e.params?.storm?.mode || '') === 'none' || S.normalizeProgram(e.program).storm === 'none') add('nodetention', 'No on-site detention', 'Regional or no detention is assumed by this plan; the Waller default of 1.00 ac-ft per developed acre is only reduced with documented confirmation.');
  add('utilities', 'Utility capacity not documented', 'An existing line doesn’t prove capacity. Water (with fire flow) and sanitary capacity, the points of connection and any lift station need written confirmation from the providers' + (J.water?.length ? ' (' + J.water.join(', ') + ')' : '') + '; no density is certified without it.');
  add('roads', 'Roadway authority not determined', 'TxDOT, Harris or Waller County, or the City' + (J.road ? ' (the busiest road nearby is ' + J.road + ')' : '') + ': driveway width, spacing, turn lanes, sight distance and any right-of-way dedication depend on who controls each frontage.');
  if (!(g.row > 0)) add('row', 'Future thoroughfare dedication not checked', 'Right-of-way along the frontage may be needed for a planned thoroughfare' + (G.row > 0 ? '; the conservative case holds ' + G.row + ' ft back' : '; none is reserved in this scenario') + '. Public right-of-way is never counted as buildable.');
  const fa = fireAccess(e); if (!fa.ok) add('fire', 'Fire access check failing', fa.fails.length + ' building' + (fa.fails.length === 1 ? '' : 's') + ' more than 150 ft from a ' + fa.lane + ' ft fire lane (' + fa.fails.map(x => x.name).slice(0, 4).join(', ') + '). Fire apparatus access and turning come before footprint; parking spaces are never counted on to be empty.');
  if (J.status === 'etj') add('jurisdiction', 'ETJ unverified', J.reason);
  else if (g.mode === 'on' && J.status !== 'city') add('jurisdiction', 'Waller guardrails turned on by hand', 'The site wasn’t found inside Waller’s limits or its 0.5-mile ETJ; the City’s requirements may not govern it.');
  if (!['sfr', 'townhomes', 'duplex', 'multifamily'].includes(R.use)) add('ratio', 'Parking ratio unverified', 'The ' + (S.USES[R.use]?.label || R.use).toLowerCase() + ' ratio (' + R.ratio + ' per 1,000 sf) is the app’s working number until the controlling Waller ratio is confirmed; the count reserve sits on top of it.');
  if (R.use === 'multifamily') add('units', 'Unit count not yet accepted', 'Two spaces per unit is the published baseline (Ord. 424); the unit count stands only once parking, fire lanes, accessible routes, refuse, mail, utilities, detention, setbacks and open space all fit, and the current project-specific requirements are verified.', { cls: CLS.V, escalate: false });
  if (!['sfr'].includes(R.use)) add('setbacks', 'Setbacks for this use unverified', 'Waller’s published setbacks are residential and aren’t applied to other uses; the plan uses the app’s working setbacks with the owner factor until the controlling requirement is confirmed.', { escalate: false });
  return out;
}

// the section 10 checklist: every item shown, unresolved, or not applicable; none left out. Each { item, status, note }
export const CHECKLIST = ['Property boundary and gross acreage', 'Road frontage and roadway authority', 'Existing and proposed right-of-way', 'Easements, pipelines and other title constraints', 'Floodplain and floodway', 'Proposed buildings and use labels', 'Setbacks and buffers', 'Parking count and accessible parking', 'Internal vehicle and pedestrian circulation', 'Fire and emergency access', 'Truck/loading movement where applicable', 'Dumpster and service areas', 'Detention location, volume assumption and estimated footprint', 'Drainage direction and outfall status', 'Utility corridors and capacity status', 'Landscape/open-space areas', 'Net developable area', 'Source and classification for each material design assumption'];
export function checklist(plan) {
  const e = effective(plan), G = e.__guard || {}, R = rulesOf(plan, G.scenario || undefined), m = metrics(plan), els = e.elements || [], has = k => els.some(x => x.kind === k), g = settingsOf(plan);
  const homes = ['sfr', 'townhomes', 'duplex'].includes(R.use), sn = els.length ? S.stormOf(e) : null, fa = fireAccess(e), front = (e.ring || []).length >= 3 ? S.edgeLen(e.ring, e.front ?? S.longestEdge(e.ring)) : 0;
  const B = els.filter(x => x.kind === 'building'), walks = els.some(x => x.kind === 'plaza' && x.note !== 'Driveway' || x.kind === 'trail');
  const st = (status, note) => ({ status, note });
  const rows = [
    st('shown', m.acres.toFixed(2) + ' ac gross, from the parcel outline (no survey)'),
    st('unresolved', Math.round(front).toLocaleString('en-US') + ' ft of frontage shown; the roadway authority is not determined'),
    G.row > 0 ? st('shown', G.row + ' ft ROW reserve along the frontage; existing ROW lines not surveyed') : st('unresolved', 'Existing ROW from parcel lines only; no future thoroughfare dedication checked'),
    st('unresolved', (has('keepout') ? els.filter(x => x.kind === 'keepout' && x.guard !== 'flood').length + ' easement(s) drawn, not surveyed' : 'None drawn') + '; no title report'),
    R.flood.status === 'missing' ? st('unresolved', 'Flood data missing (stop condition)') : st(R.flood.status === 'minimal' || R.flood.status === 'moderate' ? 'shown' : 'unresolved', floodWords(R.flood) + '; floodway not mapped on the site'),
    B.length ? st('shown', B.length + ' building' + (B.length === 1 ? '' : 's') + ', labelled by use') : st('unresolved', 'No buildings laid out yet'),
    st('shown', 'Drawn on the plan' + (G.f ? ', ' + Math.round(G.f * 100) + '% over the working minimums' : '')),
    m.required || m.spaces ? st('shown', m.spaces.toLocaleString('en-US') + ' spaces for ' + m.required.toLocaleString('en-US') + ' required' + (m.ada ? '; ' + m.ada + ' accessible' : '')) : st('na', 'No parking needed'),
    has('drive') ? st(walks ? 'shown' : 'unresolved', 'Drives shown' + (walks ? ' with walks' : '; accessible pedestrian routes not drawn')) : st('unresolved', 'No drives drawn'),
    B.length ? st(fa.ok ? 'shown' : 'unresolved', fa.ok ? 'Every building within 150 ft of a ' + fa.lane + ' ft fire lane; hydrants and turning not checked' : fa.fails.length + ' building(s) beyond 150 ft of a fire lane') : st('na', 'No buildings'),
    R.use === 'industrial' || has('truck') ? st(has('truck') ? 'shown' : 'unresolved', has('truck') ? 'Truck court shown; design-vehicle turning not checked' : 'No truck court drawn') : st('na', 'No truck or loading use'),
    homes ? st('na', 'Homes roll carts to the curb') : has('trash') ? st('shown', els.filter(x => x.kind === 'trash').length + ' enclosure(s)') : st('unresolved', 'No dumpster enclosures drawn'),
    sn && sn.mode !== 'none' ? st(has('pond') || sn.mode === 'underground' ? 'shown' : 'unresolved', sn.volume.toFixed(2) + ' ac-ft; ' + ac(sn.area).toFixed(2) + ' ac footprint needed, ' + ac(m.pond).toFixed(2) + ' ac drawn') : st('unresolved', 'No on-site detention'),
    st('unresolved', 'Outfall: ' + (OUTFALLS.find(([k]) => k === g.outfall)?.[1] || 'Unknown').toLowerCase() + '; drainage direction not determined (no topography)'),
    st('unresolved', 'Utility corridors not drawn; capacity not documented'),
    st('shown', Math.round(m.green * 100) + '% open space'),
    st('shown', 'In the land-use reconciliation'),
    st('shown', 'Each material number is tagged with its classification')
  ];
  return CHECKLIST.map((item, i) => ({ item, ...rows[i] }));
}

// the figures Numbers tags: { key -> { cls, src } }
export function tagsOf(plan) {
  const e = effective(plan), G = e.__guard || {}, R = rulesOf(plan, G.scenario || undefined), homes = ['sfr', 'townhomes', 'duplex'].includes(R.use);
  return {
    site: { cls: CLS.U, src: SRC.parcel }, gfa: { cls: CLS.U, src: SRC.plan + '; the yield is a range until the unresolved items are' }, units: { cls: CLS.U, src: 'Accepted only once every site system fits' },
    parking: { cls: R.use === 'multifamily' ? (G.cf > 1 ? CLS.O : CLS.V) : CLS.U, src: R.use === 'multifamily' ? SRC.ord424 + (G.cf > 1 ? ' × the count reserve' : '') : SRC.app + (G.cf > 1 ? ' × the count reserve' : '') },
    coverage: { cls: CLS.E, src: SRC.plan }, far: { cls: CLS.E, src: SRC.plan }, detention: { cls: R.det.cls, src: R.det.why }, impervious: { cls: CLS.E, src: SRC.plan }, open: { cls: CLS.E, src: SRC.plan }, height: { cls: CLS.E, src: 'Floors × a typical floor height' },
    setbacks: { cls: R.use === 'sfr' ? (G.f ? CLS.O : CLS.V) : G.f ? CLS.O : CLS.U, src: R.use === 'sfr' ? SRC.setbacks : SRC.app }
  };
}

// the profile values that reach the AI with the instruction (api/siteplan.js)
export function promptFor(plan, P = WALLER) {
  const g = settingsOf(plan), R = rulesOf(plan), J = plan?.jur || {};
  const lines = [
    'WALLER GUARDRAILS (' + P.name + ', v' + P.version + ', effective ' + P.effective + ') ARE ON FOR THIS PLAN.',
    SYSTEM_TEXT,
    'Active profile values (classification in brackets):',
    '- Jurisdiction: ' + (J.status === 'city' ? 'inside the City of Waller limits [' + CLS.V + ', US Census places]' : J.status === 'etj' ? 'within 0.5 mile of Waller’s limits, treated as the ETJ [' + CLS.U + ']' : 'turned on by hand [' + CLS.U + ']'),
    '- Scenario laid out: ' + R.s + ' (' + SCENARIOS[R.s].name + '); owner factor ' + Math.round(R.f * 100) + '% [' + CLS.O + ']',
    '- Minimum dimensions × ' + (1 + R.f).toFixed(2) + ' rounded up; minimum counts × ' + (1 + R.cr).toFixed(2) + ' rounded up; maximums held ' + Math.round(R.cr * 100) + '% below; prohibitions unchanged [' + CLS.O + ']',
    '- Single-family: lots 57 × 114 ft published [' + CLS.V + ', Ord. 424], target 59 × 118 [' + CLS.O + ']; setbacks front 25→26.25, rear 10→10.5, interior side 5→5.25, corner side 15→15.75 ft [published baseline ' + CLS.V + ', targets ' + CLS.O + ']',
    '- Multifamily: at least 2 off-street spaces per unit [' + CLS.V + ', Ord. 424], × the count reserve; single-family setbacks are not applied to multifamily',
    '- Retail, office, industrial, self-storage and mixed-use parking ratios: [' + CLS.U + ']; the app’s ratio is the working number',
    '- Detention: ' + R.det.rate.toFixed(2) + ' ac-ft per developed acre [' + R.det.cls + '] (' + R.det.why + '); outfall: ' + (OUTFALLS.find(([k]) => k === g.outfall)?.[1] || 'Unknown') + '; acre-feet are volume: the pond footprint comes from ' + R.depth + ' ft storage depth, ' + R.slope + ':1 side slopes, 1 ft freeboard, a 15 ft maintenance bench and an outfall allowance [' + CLS.E + ']',
    '- Fire lanes: 26 ft target; parking spaces are never relied on for emergency turning [' + CLS.E + ']',
    '- ROW reserve along frontage: ' + R.row + ' ft; flood status: ' + R.flood.status + ' [' + CLS.U + ']',
    'Classify every assumption you state as VERIFIED REQUIREMENT, OWNER GUARDRAIL, ENGINEERING ASSUMPTION or UNVERIFIED. Never call the plan or any output Permit Ready, Construction Ready, Code Compliant, Approved, Engineered, a Guaranteed yield, or say utility capacity is confirmed. Give yields as ranges while material inputs are unresolved.'
  ];
  return lines.join('\n');
}
// the guardrails a request carries to the AI (only the plan's settings and jurisdiction: the server builds the text)
export const forAI = plan => isOn(plan) ? { profile: 'waller', guard: plan.params?.guard || {}, jur: plan.jur ? { status: plan.jur.status, flood: plan.jur.flood || null, road: plan.jur.road || null } : null, program: plan.program ? { use: plan.program.use, ratio: plan.program.ratio ?? null, perUnit: plan.program.perUnit ?? null } : null } : null;
// on the server: the request's guardrails back as a plan-like object (settings checked), or null
export function fromAI(g) {
  if (!g || typeof g !== 'object' || g.profile !== 'waller') return null;
  const G = g.guard && typeof g.guard === 'object' ? g.guard : {}, J = g.jur && typeof g.jur === 'object' ? g.jur : {}, pr = g.program && typeof g.program === 'object' ? g.program : {};
  const status = ['city', 'etj'].includes(J.status) ? J.status : 'outside', fs = ['missing', 'mapped', 'floodway', 'moderate', 'minimal'].includes(J.flood?.status) ? J.flood.status : 'missing';
  return { params: { guard: { mode: 'on', factor: G.factor, outfall: G.outfall, row: G.row, scenario: G.scenario, depth: G.depth, slope: G.slope } }, jur: { status, flood: { status: fs, zone: typeof J.flood?.zone === 'string' ? J.flood.zone.slice(0, 12) : null }, road: typeof J.road === 'string' ? J.road.slice(0, 60) : null }, program: { use: S.USES[pr.use] ? pr.use : 'retail', ratio: pr.ratio, perUnit: pr.perUnit } };
}

// the land table, scenarios and risks as CSV lines (the export)
const csvCell = x => { const s = String(x ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function rowsOf(plan, scen = null) {
  const T = landTable(plan), out = [[LABEL], ['Waller guardrails (' + WALLER.name + ', v' + WALLER.version + ') · laid out as scenario ' + settingsOf(plan).scenario + ' · ' + (plan.jur?.reason || '')], [], ['Land-use reconciliation', 'Acres', '% of site', 'Basis / status', 'Classification']];
  for (const r of T.rows) out.push([r.label, r.acres.toFixed(2), (r.pct * 100).toFixed(1) + '%', r.basis, r.cls]);
  for (const q of T.qty) out.push([q.label, q.qty, '', q.basis, q.cls]);
  if (scen) { out.push([], ['Scenario', 'Building sf', 'Leasable sf', 'Units', 'Lots', 'Parking required', 'Parking provided', 'Impervious %', 'Detention ac-ft', 'Detention footprint ac']);
    for (const k of ['A', 'B', 'C']) { const y = scen[k]; out.push([k + ' ' + SCENARIOS[k].name, ...(y ? [y.buildingSf, y.leasableSf, y.units, y.lots, y.parkingRequired, y.parkingProvided, y.imperviousPct, y.detentionAcFt, +(y.detentionFootprintSf / 43560).toFixed(2)] : ['not laid out yet'])]); }
    const lr = range(['A', 'B', 'C'].map(k => scen[k]), 'leasableSf'); if (lr) out.push(['Leasable sf range (A–C)', rangeText(lr, ' sf')]); }
  out.push([], ['Unresolved risk', 'Why it matters', 'Classification', 'Stop condition']); for (const r of risks(plan)) out.push([r.title, r.why, r.cls, r.stop ? 'yes' : '']);
  out.push([], ['Required plan content (section 10)', 'Status', 'Note']); for (const c of checklist(plan)) out.push([c.item, c.status === 'na' ? 'N/A' : c.status, c.note]);
  return out;
}
export const csv = (plan, scen = null) => rowsOf(plan, scen).map(r => r.map(csvCell).join(',')).join('\n') + '\n';
