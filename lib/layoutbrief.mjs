// The design brief: the typed, versioned input a layout run is made from. Everything the geometry depends on is in it
// (the site in plan feet, the program with what each quantity means, the rules and their sources, locks, the solver's
// seed and budget), so a saved brief replays without an AI call or fresh data (lib/layoutrun.mjs).
//
//   request -> (words: briefFromRequest | AI: its program, then briefFromProgram) -> validateBrief -> canonicalBrief
//   -> toEngine (the existing engine's plan, program and options) -> lib/layoutrun.mjs
//
// Coordinates: a local plane in feet, x east and y north of site.origin ([lon, lat], WGS84), as lib/siteplan.mjs draws
// plans. A brief in metres (site.units 'm') is converted with the international foot (0.3048 m) before anything else.
// Stored geometry keeps PRECISION_FT (0.01 ft); display rounding never changes it. Precision is not survey accuracy:
// parcel lines from a tax map are only as good as the tax map.
//
// What a quantity means (program.uses[].quantity.mode):
//   exact    – build this many, no more and no fewer (a shortfall or excess fails the program check)
//   min      – at least this many; more is allowed (the engine fills the site)
//   max      – no more than this many
//   range    – between min and max
//   maximize – as many as the site holds (no target)
// A number in a request without a qualifier is exact. Legacy plans keep their own fill setting (fromLegacy).
import * as S from './siteplan.mjs';
import * as HY from './hydrology.mjs';
import { hashOf } from './sha256.mjs';
import { engineTarget, templatesFor, DEEP } from './bldgtemplates.mjs';
import { REF_CORRIDOR } from './reftemplates.mjs';
import * as I from './layoutintent.mjs';

export const BRIEF_SCHEMA = 'rei.brief/1';
export const PRECISION_FT = 0.01;
export const M_TO_FT = 1 / 0.3048;
export const MODES = ['exact', 'min', 'max', 'range', 'maximize'];
export const QTY_UNITS = ['units', 'sf', 'buildings'];
export const OVERLAYS = ['senior', 'student', 'affordable'];
export const officeBlend = share => +(share * 3.5 + (1 - share) * 0.6).toFixed(3); // spaces a 1,000 sf: office 3.5, warehouse 0.6 (planning assumptions)
export const PARKING_MODES = ['surface', 'tuck-under', 'garage', 'podium', 'structured', 'shared'];
// surface stalls at an angle, on one-way aisles (program.parking.angle; lib/siteplan.mjs ANGLED): 60, 45, or 'angled'
// (the engine tries both). Absent: square stalls, angled only where a field's depth parks more that way.
export const PARKING_ANGLES = [60, 45, 'angled'];

// The rules a run is checked against when the brief brings none of its own. Every value is labelled: an 'assumption'
// is a planning default, never a verified requirement; the validator reports checks against it as such.
export const DEFAULT_RULES = {
  id: 'rei.default-assumptions', version: '2026-11-03',
  values: {
    setbacks: { v: { ...S.SETBACKS }, cls: 'assumption', source: 'Engine default setbacks (lib/siteplan.mjs SETBACKS); not a zoning requirement' },
    buildingSeparation: { v: 10, units: 'ft', cls: 'assumption', source: 'Planning default between buildings; fire separation depends on construction type (IBC Table 705.5) and is not checked' },
    stall: { v: { w: 9, d: 18, aisle: 24 }, units: 'ft', cls: 'assumption', source: 'Common 90° stall and two-way aisle; local code governs' },
    parkingPerUnit: { v: null, cls: 'assumption', source: 'The engine use default (lib/siteplan.mjs USES) unless the brief sets it' },
    parkingPer1000: { v: null, cls: 'assumption', source: 'The engine use default (lib/siteplan.mjs USES) unless the brief sets it' },
    buildingToDrive: { v: 60, units: 'ft', cls: 'assumption', source: 'Planning default: every building within 60 ft of connected circulation (door-to-drive walk)' },
    fireAccess: { v: 150, units: 'ft', cls: 'assumption', source: 'IFC 503.1.1 (150 ft along an approved route); route distance is not modelled' },
    designVehicles: { v: { car: 'P', fire: 'FIRE', service: 'SU-30', truck: 'WB-67' }, cls: 'assumption', source: 'Planning defaults (lib/turning.mjs VEHICLES): AASHTO Green Book (2018) P, SU-30 and WB-67; fire apparatus 30 ft inside / 50 ft outside, 20 ft clear (IFC 503.2.1, 503.2.4, D103) unless the local fire code says otherwise' }
  }
};

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const r2 = v => Math.round(v / PRECISION_FT) * PRECISION_FT;
const fix = v => +r2(v).toFixed(2);
const ptFix = p => [fix(p[0]), fix(p[1])];

// ---------- quantities from words ----------
// "exactly 240", "at least 150", "up to 300", "200 to 240", "as many as fit"; null when the words name no quantity
export function quantityFromWords(text, unit = 'units') {
  const t = S.wordsToDigits ? S.wordsToDigits(String(text || '')) : String(text || ''), n = s => +String(s).replace(/,/g, '');
  const U = unit === 'sf' ? '(?:sf|sq\\.? ?ft|square[- ]f(?:ee|oo)t)' : unit === 'buildings' ? 'buildings?' : '(?:units?|apartments?|homes?|townhomes?|townhouses?|doors|cottages?|duplex(?:es)?)';
  const N = '(?<![\\d.])(\\d[\\d,]*)(?!\\.\\d)';
  let m;
  if ((m = new RegExp('\\b(?:between\\s+)?' + N + '\\s*(?:-|–|to|and)\\s*' + N + '\\s*(?:(?!-?(?:stor|floor|level|acre))[a-z-]+\\s+){0,2}' + U, 'i').exec(t))) return { mode: 'range', min: n(m[1]), max: n(m[2]), unit };
  if ((m = new RegExp('\\b(?:at least|minimum of|min(?:imum)?\\.?|no fewer than|no less than)\\s+' + N + '\\s*(?:(?!-?(?:stor|floor|level|acre))[a-z-]+\\s+){0,2}' + U, 'i').exec(t)) || (m = new RegExp(N + '\\s*\\+\\s*(?:(?!-?(?:stor|floor|level|acre))[a-z-]+\\s+){0,2}' + U, 'i').exec(t))) return { mode: 'min', value: n(m[1]), unit };
  if ((m = new RegExp('\\b(?:up to|at most|no more than|max(?:imum)?(?: of)?|not more than)\\s+' + N + '\\s*(?:(?!-?(?:stor|floor|level|acre))[a-z-]+\\s+){0,2}' + U, 'i').exec(t))) return { mode: 'max', value: n(m[1]), unit };
  if ((m = new RegExp('\\b(?:exactly\\s+)?' + N + '\\s*(?:(?!-?(?:stor|floor|level|acre))[a-z-]+\\s+){0,3}' + U, 'i').exec(t))) return { mode: 'exact', value: n(m[1]), unit };
  return null;
}
export const wantsMax = text => /\b(as (?:many|much|big|large) as (?:will |can |it )?(?:fits?|possible|the site (?:holds|allows))|maximi[sz]e|max(?:imum)? (?:yield|density|units)|fill the site)\b/i.test(String(text || ''));

// ---------- building forms (the capability registry, lib/layoutcaps.mjs, says what each does) ----------
// vertical mixed use: shops on the ground floor with apartments above ("ground-floor retail and 200 apartments above",
// "a mixed-use building", "retail under apartments"); first, so "a 5-story mixed-use building" isn't read as mid-rise
export const VERTICAL_WORDS = /\b(?:vertical(?:ly)? mixed[- ]use|mixed[- ]use (?:building|tower|block|mid[- ]?rise)|ground[- ]floor (?:retail|shops?|commercial|storefronts?)|(?:retail|shops?|storefronts?|commercial) (?:below|under(?:neath)?|on the ground floor)|(?:apartments|units|homes|residential|residences|flats) (?:above|over) (?:the )?(?:retail|shops?|storefronts?|commercial)|(?:apartments|units|homes|residences|flats) above\b)/i;
const FORM_WORDS = [
  ['mx-vertical', VERTICAL_WORDS], ['mf-tower-podium', /\btower\b/i], ['mf-podium-courtyard', /\bcourtyard (?:on|over|atop) (?:a |the )?(?:parking )?podium\b|\bpodium courtyard\b|\b[4-6] over [12]\b/i], ['mf-podium', /\bpodium\b/i], ['mf-wrap', /\bwrap\b/i], ['mf-tuck-under', /\btuck[- ]?under\b/i],
  ['mf-midrise', /\bmid[- ]?rise\b/i], ['mf-courtyard', /\bcourtyard\b/i], ['mf-stacked-townhome', /\bstacked town ?(?:home|house)s?\b/i],
  ['mf-townhome', /\btown ?(?:home|house)s?\b|\browhouses?\b/i], ['mf-cottage-btr', /\b(?:cottages?|build[- ]to[- ]rent|btr|detached rentals?)\b/i],
  ['mf-plex', /\b(?:duplex(?:es)?|triplex(?:es)?|fourplex(?:es)?|quadplex(?:es)?|four-?plex)\b/i], ['mf-walkup', /\bwalk[- ]?ups?\b/i], ['mf-garden', /\bgarden\b/i]
];
export function formFromWords(text) { for (const [f, re] of FORM_WORDS) if (re.test(String(text || ''))) return f; return null; }
export const overlaysFromWords = text => [...OVERLAYS].sort().filter(o => new RegExp('\\b' + (o === 'senior' ? 'senior|55\\+|age[- ]restricted' : o === 'student' ? 'student' : 'affordable|lihtc|workforce|income[- ]restricted') + '\\b', 'i').test(String(text || '')));

// ---------- making a brief ----------
// site: a plan (lib/siteplan.mjs: origin, ring in feet, front, streets, setbacks, keepout elements)
export function siteFromPlan(plan) {
  return {
    crs: 'local-ft', units: 'ft', origin: plan.origin || null, ring: (plan.ring || []).map(p => [+p[0], +p[1]]), holes: [],
    front: plan.front ?? null, streets: [...new Set([...(plan.streets || []), ...S.streetRun(plan.ring || [], plan.front ?? null)])].sort((a, b) => a - b), access: { edges: null, entrances: [] }, // (a curving frontage drawn as chords: the chords that carry the front's line on are the street too)
    setbacks: plan.setbacks ? { ...plan.setbacks } : null,
    exclusions: (plan.elements || []).filter(e => e.kind === 'keepout').map(e => ({ id: e.id || null, kind: 'keepout', ring: S.shapeOf(e).map(p => [+p[0], +p[1]]), source: e.note || e.name || 'drawn by hand' }))
  };
}

const useOf = z => z?.use || null;
// a zone's own building form, from its name or unit mix ("Studio apartment buildings", a mix mostly studios)
export function zoneForm(z) {
  const studios = Array.isArray(z.mix) ? z.mix.filter(m => /studio/i.test(m.name || '') || +m.beds === 0).reduce((t, m) => t + (+m.pct || 0), 0) : 0;
  if (/\bstudio/i.test(z.name || '') || studios >= 50) return 'mf-garden-studio';
  return z.name ? formFromWords(z.name) : null;
}
function useFromProgram(z, text, i, zi = null) {
  const unit = ['multifamily', 'townhomes', 'duplex', 'sfr'].includes(z.use) ? 'units' : 'sf';
  const target = unit === 'units' ? z.units : z.gfa, words = text ? quantityFromWords(S.tidyRequest(text), unit) : null;
  let quantity;
  if (words && (target == null || words.value === target || words.max === target || words.min === target)) quantity = words;
  else if (target != null) quantity = { mode: 'exact', value: target, unit };
  else quantity = { mode: 'maximize', unit };
  if (quantity.mode !== 'maximize' && text && wantsMax(text) && !words) quantity = { mode: 'min', value: target, unit };
  const out = { id: 'u' + (i + 1), use: z.use, quantity };
  if (zi != null) out.zone = zi; // the engine zone it is (a mixed plan's buildings carry e.zone)
  if (z.name) out.name = String(z.name).slice(0, 60);
  if (z.use === 'multifamily') { const f = zoneForm(z); if (f) out.form = f; }
  if (z.btForm) out.form = z.btForm; // (a building type's own form, lib/btypes.mjs: 'multifamily' is the engine's apartments without a reviewed template)
  if (z.use === 'retail' && +z.anchor > 0) out.anchor = { value: +z.anchor, unit: 'sf' }; // the anchor store's floor area, as the words gave it (the rest is shop space)
  if (z.floors) out.floors = z.floors;
  if (z.buildings) out.buildings = { mode: 'exact', value: z.buildings };
  if (z.mix) out.mix = z.mix;
  if (z.place) out.placement = z.place;
  if (z.phase) out.phase = z.phase;
  return out;
}

// A brief from an engine program (the words' guess or the AI's program step) and a plan. text: the original request.
export const STORMWATER = ['onsite-pond', 'underground', 'offsite'];
export function briefFromProgram(program, plan, { text: raw = '', parser = 'structured', seed = null, options = 3 } = {}) {
  const text = S.tidyRequest(String(raw || '')); // (read as tidied: "apts", "senoir", "1.5 spaces/unit"; kept as typed on the brief)
  const P = program || {}, zones = Array.isArray(P.zones) && P.zones.length > 1 ? P.zones : [P];
  const many = zones.length > 1, uses = zones.map((z, zi) => [z, zi]).filter(([z]) => useOf(z) && z.use !== 'amenity' && z.use !== 'garage').map(([z, zi], i) => useFromProgram(z, many ? null : text, i, many ? zi : null));
  const form = formFromWords(text) || (P.form === 'tower' ? 'mf-tower-podium' : P.arrangement === 'courtyard' ? 'mf-courtyard' : null);
  for (const u of uses) if (u.use === 'multifamily' && !u.form && form && form !== 'mx-vertical' && form !== 'mf-townhome' && form !== 'mf-stacked-townhome' && form !== 'mf-cottage-btr' && form !== 'mf-plex') u.form = form;
  if (form === 'mx-vertical' && uses.some(u => u.use === 'retail') && uses.some(u => u.use === 'multifamily')) for (const u of uses) if (u.use === 'retail' || u.use === 'multifamily') u.form = 'mx-vertical';
  for (const u of uses) if (!u.form) u.form = defaultForm(u.use, text);
  for (const u of uses) if (u.form === 'mf-stacked-townhome' && u.use === 'townhomes') u.use = 'multifamily'; // (stacked townhomes: two homes stacked in a bay, laid out as rows of templated bays like apartments)
  const brief = {
    schema: BRIEF_SCHEMA,
    request: { text: String(raw || ''), parser },
    site: siteFromPlan(plan),
    program: { uses, overlays: overlaysFromWords(text), parking: { mode: /\btuck[- ]?under\b/i.test(text) ? 'tuck-under' : /\bpodium\b/i.test(text) ? 'podium' : /\bgarage|structured\b/i.test(text) ? 'garage' : 'surface', ...(PARKING_ANGLES.includes(P.parkAngle) ? { angle: P.parkAngle } : {}) }, engine: stripProgram(P) },
    rules: { id: DEFAULT_RULES.id, version: DEFAULT_RULES.version, values: { ...DEFAULT_RULES.values, ...(plan.setbacks ? { setbacks: { v: { ...S.SETBACKS, ...plan.setbacks }, cls: plan.setbacksSource ? 'verified' : 'assumption', source: plan.setbacksSource || 'Setbacks on the plan (default or entered by hand); not verified against zoning' } } : {}) } },
    locks: [],
    solver: { seed: seed ?? 'rei-1', tickMs: 25, options }
  };
  // stormwater: where the site's detention goes (the words' storm mode, else the plan's Settings): 'onsite-pond' (the
  // default: a dry or wet pond drawn on the site), 'underground' (vaults under the parking: no pond drawn), 'offsite' (a
  // regional facility or the drainage district's: no storage on the site). Stated in the brief so the check reports it.
  const sm = P.storm || plan.params?.storm?.mode || null;
  // a depth chosen for corridor buildings ("83 ft deep corridor buildings", "deep corridor bars"): the reviewed bay drawn
  // that deep (lib/bldgtemplates.mjs templatesFor); stated as the person's choice, deeper than any reviewed building
  { const t = String(text || ''), m = /\b(\d{2})\s*(?:ft|feet|foot|')\s*[- ]?deep\b/i.exec(t), deep = /\bdeep(?:er)? (?:double[- ]loaded )?corridor (?:buildings?|bars?)\b/i.test(t), corr = /\bcorridor\b|\bbars?\b|\bmid[- ]?rise\b/i.test(t);
    const v = m && corr ? +m[1] : deep ? DEEP.dflt : null;
    if (v) for (const u of brief.program.uses.filter(u => u.use === 'multifamily')) { if (!u.form || u.form === 'mf-garden') u.form = 'mf-midrise'; if (DEEP.forms.includes(u.form)) u.depth = { value: Math.max(DEEP.min, Math.min(DEEP.max, v)), unit: 'ft', cls: 'assumption', source: 'the request: corridor buildings ' + v + ' ft deep, deeper than any reviewed corridor building (65 ft)' }; } }
  if (P.btRule && !P.zones && DEFAULT_RULES.values[P.btRule.key]) brief.rules.values[P.btRule.key] = { v: P.btRule.v, cls: 'assumption', source: String(P.btRule.source).slice(0, 300) }; // (a building type's parking rule, lib/btypes.mjs: the engine and the check count the same requirement)
  brief.site.stormwater = sm === 'underground' ? 'underground' : sm === 'none' ? 'offsite' : sm === 'detention' || sm === 'retention' ? 'onsite-pond' : null;
  understand(brief, P, plan, text);
  return brief;
}
// What the words say beyond the uses and their numbers, made part of the brief (lib/layoutintent.mjs): a pond's acres as
// its share of the site, a density as a count, setbacks said, where things go (program.placements, and what the engine
// can be told of them), and what was assumed where the words left things open (request.assumed, said in the plan's
// notes). The engine's own program loses the words' extra keys so a replay hands it the same thing.
function understand(brief, P, plan, text) {
  const E = brief.program.engine, acres = S.ringArea(plan.ring || []) / 43560, said = [];
  for (const k of ['pondAc', 'density', 'setbacks', 'placements']) delete E[k];
  if (+P.pondAc > 0 && acres > 0 && E.detentionPct == null) { E.detentionPct = +Math.min(60, P.pondAc / acres * 100).toFixed(1); said.push('A ' + P.pondAc + ' acre pond, as asked: ' + E.detentionPct + '% of the ' + acres.toFixed(1) + ' acre site.'); }
  if (+P.density > 0 && acres > 0) { const u = brief.program.uses.find(x => x.quantity.unit === 'units'); if (u && (u.quantity.mode === 'maximize' || u.quantity.value === Math.round(P.density))) { const n = Math.max(1, Math.round(P.density * acres)); u.quantity = { mode: 'exact', value: n, unit: 'units' }; if (brief.program.uses.length === 1) E.units = n; said.push(P.density + ' units an acre on ' + acres.toFixed(2) + ' acres: ' + n + ' units (gross acreage, an assumption).'); } }
  if (P.setbacks && typeof P.setbacks === 'object') { const sb = Object.fromEntries(Object.entries(P.setbacks).filter(([k, v]) => ['front', 'side', 'rear', 'paving'].includes(k) && +v >= 0 && +v <= 500).map(([k, v]) => [k, +v])); if (Object.keys(sb).length) { brief.rules.values.setbacks = { v: { ...brief.rules.values.setbacks.v, ...sb }, cls: 'assumption', source: 'The request (' + Object.entries(sb).map(([k, v]) => k + ' ' + v + ' ft').join(', ') + '); not verified against zoning' }; said.push('Setbacks as asked: ' + Object.entries(sb).map(([k, v]) => k + ' ' + v + ' ft').join(', ') + '.'); } }
  // what was assumed: a use with no number is as many as fit; its form and floors when the words name none
  for (const u of brief.program.uses) if (u.quantity.mode === 'maximize' && !wantsMax(text) && !P.max) said.push('No ' + (u.quantity.unit === 'units' ? 'count' : 'size') + ' given for the ' + (S.USES[u.use]?.label || u.use).toLowerCase() + ': as many as fit, for the most the land holds (give a number to hold it).');
  // where things go: the words', and the AI's (program.placements), each told to the engine where it can be
  const uses = brief.program.uses.map(u => u.use), fromAI = (Array.isArray(P.placements) ? P.placements : []).map(I.cleanPlacement).filter(Boolean);
  const words = text ? I.placementsFromWords(text, uses.concat(Array.isArray(P.zones) ? P.zones.map(z => z.use) : [])) : [];
  const ok = p => !I.USE_SUBJECTS.includes(p.subject) || uses.includes(p.subject) || p.subject === 'restaurant' && uses.includes('retail');
  const pl = I.mergePlacements(fromAI, words).filter(ok);
  // a dog park or playground asked for with no place said, on apartments: by the clubhouse (an assumption, said), so it is drawn
  if (uses.includes('multifamily')) for (const [k, re] of [['dog park', /\bdog (?:parks?|runs?)\b|\bbark park\b/i], ['playground', /\bplay ?grounds?\b|\btot lots?\b/i]]) if (re.test(text) && !pl.some(p => p.subject === k) && !/\bno (?:dog park|playground)/i.test(text)) { pl.push({ id: 'p' + (pl.length + 1), subject: k, rel: 'near', target: 'clubhouse', text: 'no place said' }); said.push('A ' + k + ' asked for with no place said: put by the clubhouse (an assumption; say where it goes to change it).'); }
  I.nameTypedZones(pl, P); // (zones of a building type the words named: the placement names the type, each such zone at that place gets its own)
  if (pl.length) { brief.program.placements = pl; said.push(...I.applyPlacements(brief)); }
  const prev = Array.isArray(brief.request.assumed) ? brief.request.assumed : [];
  if (said.length || prev.length) brief.request.assumed = [...prev, ...said];
}
function defaultForm(use, text) {
  if (use === 'multifamily') return 'mf-garden';
  if (use === 'townhomes') return /\bstacked\b/i.test(text) ? 'mf-stacked-townhome' : 'mf-townhome';
  if (use === 'duplex') return 'mf-plex';
  if (use === 'sfr') return /\brent|btr\b|\bcottages?\b/i.test(text) ? 'mf-cottage-btr' : 'sfr-subdivision';
  if (use === 'industrial') return /\bflex\b/i.test(text) ? 'flex-multi-tenant' : /\bcross[- ]?dock\b/i.test(text) ? 'ind-cross-dock' : /\bside[- ]?load(?:ed|ing)?\b/i.test(text) ? 'ind-side-load' : 'ind-warehouse';
  if (use === 'retail') return /\banchor/i.test(text) ? 'ret-anchored' : /\bpad\b/i.test(text) ? 'ret-inline-pads' : 'ret-inline';
  if (use === 'restaurant') return /\bdrive[- ]?th/i.test(text) ? 'ret-drive-through' : 'ret-restaurant';
  return use;
}
// the engine's own program, kept as it was handed over (so a replay hands the engine the same thing)
function stripProgram(P) { return JSON.parse(JSON.stringify(P || {})); }

// The words alone (the app's Low effort, the MCP tool without AI): lib/siteplan.mjs guessProgram, then the quantity
// meanings and form the words state.
export function briefFromRequest(text, plan, opts = {}) {
  let prog = S.guessProgram(String(text || ''));
  const v = I.vagueProgram(text, prog, S.ringArea(plan.ring || []) / 43560); if (v) prog = { ...v.program, ...Object.fromEntries(['perUnit', 'ratio', 'floors', 'storm', 'setbacks', 'pondAc', 'entrances'].filter(k => prog[k] != null).map(k => [k, prog[k]])) };
  const b = briefFromProgram(prog, plan, { ...opts, text, parser: 'words' });
  if (v) b.request.assumed = [...v.assumed, ...(b.request.assumed || []).filter(a => !/^No (?:count|size) given/.test(a))];
  return b;
}

// ---------- checking a brief ----------
export function validateBrief(b) {
  const errors = [], warnings = [], E = (path, msg) => errors.push({ path, msg }), W = (path, msg) => warnings.push({ path, msg });
  if (!b || typeof b !== 'object') return { ok: false, errors: [{ path: '', msg: 'No brief' }], warnings, missing: ['brief'] };
  if (b.schema !== BRIEF_SCHEMA) E('schema', 'Expected ' + BRIEF_SCHEMA);
  const s = b.site || {}, missing = [];
  if (!['ft', 'm'].includes(s.units)) E('site.units', "Units must be 'ft' or 'm'");
  if (s.crs && s.crs !== 'local-ft' && s.crs !== 'local-m') E('site.crs', 'Only a local plane (local-ft / local-m) is supported');
  if (!Array.isArray(s.ring) || s.ring.length < 3) { E('site.ring', 'The site needs a boundary of at least 3 points'); missing.push('site boundary'); }
  else {
    if (s.ring.some(p => !Array.isArray(p) || !isNum(p[0]) || !isNum(p[1]))) E('site.ring', 'Boundary points must be finite numbers');
    else if (selfCrosses(s.ring)) E('site.ring', 'The boundary crosses itself');
    else if (S.ringArea(s.ring) < 1) E('site.ring', 'The boundary has no area');
  }
  if (s.stormwater != null && !STORMWATER.includes(s.stormwater)) E('site.stormwater', "Stormwater must be one of " + STORMWATER.join(', '));
  if (s.rainfall != null && !(+s.rainfall.p > 0 && +s.rainfall.rp > 0)) E('site.rainfall', 'Rainfall needs p (the 24-hour depth, inches) and rp (the return period, years)');
  if (Array.isArray(s.parts) && s.parts.length > 1) E('site.parts', 'Sites in several separate parts are not supported by one brief yet: join them or make one brief per part');
  if (s.front != null && (!Number.isInteger(s.front) || s.front < 0 || s.front >= (s.ring || []).length)) E('site.front', 'Front must be an edge index of the boundary');
  if (s.front == null) { W('site.front', 'No street edge given: the longest edge is taken as the front (an assumption)'); }
  for (const [i, h] of (s.holes || []).entries()) if (!Array.isArray(h) || h.length < 3) E('site.holes.' + i, 'A hole needs at least 3 points');
  for (const [i, x] of (s.exclusions || []).entries()) if (!Array.isArray(x?.ring) || x.ring.length < 3) E('site.exclusions.' + i, 'An exclusion needs a ring of at least 3 points');
  if (Array.isArray(s.access?.edges)) for (const k of s.access.edges) if (!Number.isInteger(k) || k < 0 || k >= (s.ring || []).length) E('site.access.edges', 'Access edges must be edge indices');
  const uses = b.program?.uses;
  if (!Array.isArray(uses) || !uses.length) { E('program.uses', 'The program needs at least one use'); missing.push('program'); }
  for (const [i, u] of (uses || []).entries()) {
    const q = u.quantity || {}, p = 'program.uses.' + i;
    if (!u.use) E(p + '.use', 'Each use needs a use');
    if (!MODES.includes(q.mode)) E(p + '.quantity.mode', 'mode must be one of ' + MODES.join(', '));
    if (!QTY_UNITS.includes(q.unit)) E(p + '.quantity.unit', 'unit must be one of ' + QTY_UNITS.join(', '));
    if (['exact', 'min', 'max'].includes(q.mode) && !(isNum(q.value) && q.value > 0)) E(p + '.quantity.value', 'A positive number is needed for ' + q.mode);
    if (q.mode === 'range' && !(isNum(q.min) && isNum(q.max) && q.min > 0 && q.max >= q.min)) E(p + '.quantity', 'A range needs 0 < min ≤ max');
    if (u.mix && Array.isArray(u.mix)) { const t = u.mix.reduce((s2, m) => s2 + (+m.pct || 0), 0); if (Math.abs(t - 100) > 0.5) E(p + '.mix', 'Unit mix percentages add to ' + t + ', not 100'); }
    if (u.depth != null && !(isNum(u.depth.value) && u.depth.value >= DEEP.min && u.depth.value <= DEEP.max)) E(p + '.depth', 'A corridor building depth runs ' + DEEP.min + '-' + DEEP.max + ' ft');
    if (u.anchor != null && !(isNum(u.anchor.value) && u.anchor.value > 0 && (q.unit !== 'sf' || !isNum(q.mode === 'range' ? q.max : q.value) || u.anchor.value <= (q.mode === 'range' ? q.max : q.value)))) E(p + '.anchor', 'The anchor needs a positive floor area no larger than the use');
    if (u.floors != null && !(Number.isInteger(u.floors) && u.floors >= 1 && u.floors <= 60)) E(p + '.floors', 'Floors must be a whole number 1–60');
  }
  for (const o of b.program?.overlays || []) if (!OVERLAYS.includes(o)) E('program.overlays', 'Unknown overlay ' + o);
  if (b.program?.parking?.mode && !PARKING_MODES.includes(b.program.parking.mode)) E('program.parking.mode', 'Parking mode must be one of ' + PARKING_MODES.join(', '));
  if (b.program?.parking?.angle != null && !PARKING_ANGLES.includes(b.program.parking.angle)) E('program.parking.angle', 'Parking angle must be one of ' + PARKING_ANGLES.join(', '));
  for (const m of I.validatePlacements(b.program?.placements)) E('program.placements', m);
  if (!b.solver || b.solver.seed == null) E('solver.seed', 'A seed is needed so the run can be replayed');
  if (b.solver && !(+b.solver.tickMs > 0)) E('solver.tickMs', 'The evaluation budget tick must be positive');
  return { ok: !errors.length, errors, warnings, missing };
}
function selfCrosses(r) {
  const n = r.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (S.segsCross(r[i], r[(i + 1) % n], r[j], r[(j + 1) % n])) return true; }
  return false;
}

// ---------- canonical form ----------
// metres converted to feet, coordinates at PRECISION_FT, the boundary counter-clockwise (the front edge index follows
// the turn), defaults filled. Same meaning in -> same canonical brief -> same hash.
export function canonicalBrief(b0) {
  const b = JSON.parse(JSON.stringify(b0)), s = b.site, k = s.units === 'm' ? M_TO_FT : 1;
  const conv = r => r.map(p => ptFix([p[0] * k, p[1] * k]));
  let ring = conv(s.ring), front = s.front, streets = s.streets || [], edges = s.access?.edges || null;
  if (S.signedArea(ring) < 0) { // reverse the ring; edge i (p_i -> p_i+1) becomes edge n-2-i (mod n)
    const n = ring.length, map = i => ((n - 2 - i) % n + n) % n; ring = ring.slice().reverse();
    front = front == null ? null : map(front); streets = streets.map(map); edges = edges && edges.map(map);
  }
  s.ring = ring; s.front = front; s.streets = [...streets].sort((a, c) => a - c); s.access = { edges: edges ? [...edges].sort((a, c) => a - c) : null, entrances: (s.access?.entrances || []).map(e => ({ ...e, at: e.at ? ptFix([e.at[0] * k, e.at[1] * k]) : null })) };
  s.holes = (s.holes || []).map(conv); s.exclusions = (s.exclusions || []).map((x, i) => ({ id: x.id || 'x' + (i + 1), kind: x.kind || 'keepout', ring: conv(x.ring), source: x.source || 'unspecified' }));
  if (s.setbacks && k !== 1) for (const key of Object.keys(s.setbacks)) if (isNum(s.setbacks[key])) s.setbacks[key] = fix(s.setbacks[key] * k);
  s.units = 'ft'; s.crs = 'local-ft';
  if (s.origin) s.origin = [+(+s.origin[0]).toFixed(8), +(+s.origin[1]).toFixed(8)];
  b.program.uses = b.program.uses.map((u, i) => ({ ...u, id: u.id || 'u' + (i + 1) }));
  b.program.overlays = [...new Set(b.program.overlays || [])].sort();
  if (Array.isArray(b.program.placements) && !b.program.placements.length) delete b.program.placements; // (none: the brief hashes as it did before placements were read)
  b.locks = [...new Set(b.locks || [])].sort();
  b.solver = { seed: b.solver.seed, tickMs: +b.solver.tickMs || 25, options: Math.max(1, Math.min(12, +b.solver.options || 3)), ...(b.solver.engineOpts ? { engineOpts: b.solver.engineOpts } : {}) };
  return b;
}
// the hash of what the geometry depends on (the request's wording and the parser are kept but not hashed)
export const inputHash = b => hashOf({ ...canonicalBrief(b), request: undefined });

// ---------- to the existing engine ----------
// -> { plan, program, opts, mapping: [notes on how the brief was handed over] }
export function toEngine(bIn, { overshoot = true } = {}) { // overshoot: ask a templated apartment use for a little more than an exact count, so whole modules can be trimmed to it
  const b = canonicalBrief(bIn), s = b.site, mapping = [];
  const keepouts = [...s.exclusions.map(x => ({ id: x.id, kind: 'keepout', poly: x.ring, name: x.kind, note: x.source, pinned: true })),
    ...s.holes.map((h, i) => ({ id: 'hole' + (i + 1), kind: 'keepout', poly: h, name: 'Hole in the site', pinned: true }))];
  const sb = b.rules?.values?.setbacks?.v || s.setbacks || S.SETBACKS;
  const plan = { origin: s.origin || [0, 0], ring: s.ring, front: s.front ?? S.longestEdge(s.ring), streets: s.streets, setbacks: { ...S.SETBACKS, ...sb }, elements: [] };
  const P = JSON.parse(JSON.stringify(b.program.engine && Object.keys(b.program.engine).length ? b.program.engine : {}));
  if (s.stormwater) { const mode = { 'onsite-pond': P.storm === 'retention' ? 'retention' : 'detention', underground: 'underground', offsite: 'none' }[s.stormwater]; if (mode && P.storm !== mode) { P.storm = mode; mapping.push('Stormwater ' + s.stormwater + ': ' + (s.stormwater === 'offsite' ? 'no detention on the site (a regional facility; confirm with the civil engineer and the drainage district).' : s.stormwater === 'underground' ? 'detention in vaults under the parking, no pond drawn.' : 'a detention pond on the site.')); } }
  const uses = b.program.uses, single = uses.length === 1, modes = uses.map(u => u.quantity.mode);
  const setQ = (z, u) => { const q = u.quantity, tgt = q.mode === 'range' ? q.max : q.value; if (q.mode === 'maximize') { delete z.units; if (q.unit === 'sf') delete z.gfa; return; } if (q.unit === 'units') z.units = (overshoot && u.use === 'multifamily' && q.mode !== 'min' && u.form !== 'mf-wrap' && u.form !== 'mf-tuck-under' && (engineTarget(q, u.form) || (q.mode !== 'max' ? Math.ceil(tgt * 1.12) : null))) || tgt; /* (no template: a little more, then the homes sized to the count) */ else if (q.unit === 'sf') z.gfa = tgt; else z.buildings = tgt; if (u.floors) z.floors = u.floors; if (u.mix) z.mix = u.mix; };
  for (const [i, u] of uses.entries()) if (u.form === 'mf-stacked-townhome') { const z = single ? P : P.zones?.[u.zone ?? i]; if (z && z.use !== 'multifamily') { z.use = 'multifamily'; for (const k of ['lotD', 'lotW', 'lotSet', 'product', 'garage', 'garagePer', 'rearLoad', 'frontLoad']) delete z[k]; } }
  if (single) { if (!P.use) P.use = uses[0].use; setQ(P, uses[0]); if (uses[0].anchor?.value) P.anchor = uses[0].anchor.value; }
  else { if (!Array.isArray(P.zones) || P.zones.length < 2) P.zones = uses.map(u => ({ use: u.use })); uses.forEach((u, i) => setQ(P.zones[u.zone ?? i] || (P.zones[i] = { use: u.use }), u)); }
  // two zones of one use (garden and studio apartments) with no placement: the engine's band layouts can't tell them
  // apart and fall back to a simple layout (23737 FM 2920, Hockley: 18 units on 29 ac), so they get an order front to
  // back, stated as an assumption; a placement the request gives is never changed
  if (!single) { const Zs = P.zones.filter(z => z && z.use !== 'amenity' && z.use !== 'garage'), dup = Zs.some(z => Zs.filter(y => y.use === z.use).length > 1);
    if (dup && !Zs.some(z => z.place?.where)) { const order = ['front', 'middle', 'back']; let k = 0; for (const z of Zs) if (z.use === 'multifamily' || Zs.filter(y => y.use === z.use).length > 1) z.place = { where: order[Math.min(k++, 2)] };
      mapping.push('Two zones of the same use with no placement: laid out front to back in the order asked (' + Zs.filter(z => z.place).map(z => (z.name || z.use) + ' ' + z.place.where).join(', ') + '); an assumption, change it by saying where each goes.'); } }
  // a second way in planned from the start when the program will need one (IFC Appendix D: over 200 apartments, over 30
  // homes): looked for only after the layout, the street side is often already lined with buildings (Hockley: none found
  // on 1,187 ft of frontage). Estimates for open-ended sizes: 20 apartments or 8 homes an acre.
  { const ac = S.ringArea(s.ring) / 43560, fill = u => ac * (u.use === 'multifamily' ? 20 : 8) / uses.length, est = u => { const q = u.quantity; return q.mode === 'maximize' ? fill(u) : q.mode === 'range' ? q.max : q.mode === 'min' ? Math.max(q.value || 0, fill(u)) : q.value || 0; }; // (at least N: the layout fills past N where the land allows)
    const apts = uses.filter(u => u.use === 'multifamily' && u.quantity.unit === 'units').reduce((t, u) => t + est(u), 0), homes = uses.filter(u => ['townhomes', 'duplex', 'sfr'].includes(u.use) && u.quantity.unit === 'units').reduce((t, u) => t + est(u), 0);
    if ((apts > 200 || homes > 30) && !(+P.entrances >= 2)) { P.entrances = 2; mapping.push('Two ways in planned from the start: the program is over 200 apartments or 30 homes (IFC Appendix D, where adopted).'); } }
  // parking rule from the brief (else the engine's use default)
  { const ang = b.program.parking?.angle; if (PARKING_ANGLES.includes(ang)) { if (P.parkAngle == null) P.parkAngle = ang; // (angled parking asked for: the field engine lays its rows at the angle, lib/siteparking.mjs)
    mapping.push('Angled parking' + (ang === 'angled' ? '' : ' at ' + ang + '°') + ' asked for: surface stalls at the angle on one-way aisles (ULI / ITE planning sizes, lib/siteplan.mjs ANGLED), neighbouring aisles running opposite ways; accessible stalls stay square. Where angled rows can’t park the program, square stalls, and the option says so.'); } }
  const pr = b.rules?.values; if (pr?.parkingPerUnit?.v != null) P.perUnit = pr.parkingPerUnit.v; if (pr?.parkingPer1000?.v != null) P.ratio = pr.parkingPer1000.v;
  if (single && +P.btEnvelope?.f > 1 && P.gfa > 0) { P.gfa = Math.round(P.gfa * P.btEnvelope.f); if (P.btEnvelope.carve && +P.ratio > 0) P.ratio = +(P.ratio / P.btEnvelope.f).toFixed(5); } // (a building type drawn in a bigger envelope, lib/btypes.mjs: a hotel's ground floor of shops, a car wash's stacking lanes, a data centre's equipment yard; carve: the envelope's extra is cut back out after the run, so the same spaces spread over it)
  // flex: an office share parks at a blend of the office and warehouse ratios (OFFICE_BLEND, an assumption)
  uses.forEach((u, i) => { if (u.officeShare != null && u.use === 'industrial') { const z = single ? P : P.zones[i]; z.ratio = officeBlend(u.officeShare); z.flex = true; mapping.push('Flex parking at ' + z.ratio.toFixed(2) + ' a 1,000 sf for a ' + Math.round(u.officeShare * 100) + '% office share (assumption: office 3.5, warehouse 0.6 a 1,000 sf).'); } });
  // what the quantities mean, as the engine's one fill setting: it can't hold one use exact and fill another
  const fill = modes.every(m => m === 'exact' || m === 'max' || m === 'range') ? false : modes.every(m => m === 'min' || m === 'maximize') ? true : 'phase';
  if (fill === 'phase') mapping.push('The program mixes exact and open-ended quantities; the engine fills the site and marks what is past the exact asks as Phase 2. The program check judges each use by its own meaning.');
  plan.params = { ...(b.program.params || {}), fill };
  // townhome rows stand the brief's building separation apart (the validator's separation.buildings; 10 ft by default, an
  // assumption), not the engine's own 20 ft: a block's frontage holds rows end to end at the spacing the rules ask for
  if (uses.some(u => u.use === 'townhomes' || u.use === 'duplex') && +pr?.buildingSeparation?.v > 0 && plan.params.homeGap == null) plan.params.homeGap = +pr.buildingSeparation.v;
  if (s.terrain) plan.terrain = s.terrain; // the ground's fall (the pond goes on the low side), saved with the site
  // the design storm's rainfall for the detention estimate (lib/hydrology.mjs): the point estimate recorded on the brief
  // (site.rainfall, fetched from NOAA Atlas 14) or on the plan, else the regional Atlas 14 figure where the site is in one;
  // recorded on the plan so the run and its replay use the same numbers
  { const st = plan.params.storm && typeof plan.params.storm === 'object' ? plan.params.storm : {}, rr = st.rain || s.rainfall || HY.regionalRain(s.origin, st.rp || HY.HYDRO.rp);
    if (rr && !st.rain) { plan.params = { ...plan.params, storm: { ...st, rain: rr } }; mapping.push('Detention estimated by NRCS TR-55 (chapter 6) for the ' + rr.rp + '-year 24-hour storm, ' + rr.p + ' in (' + rr.source + '); an estimate for the civil engineer to confirm.'); } }
  const form = uses.find(u => u.use === 'multifamily')?.form;
  if (P.btFloors && !P.floors) P.floors = P.btFloors; // (a building type's usual floors, lib/btypes.mjs, when the words give none)
  if (form === 'mf-courtyard') P.arrangement = 'courtyard';
  if (uses.some(u => u.form === 'ind-cross-dock')) { const z = single ? P : P.zones?.[uses.findIndex(u => u.form === 'ind-cross-dock')]; if (z) z.crossDock = true; mapping.push('A cross-dock: dock doors on both long sides, a truck court on each, the car parking in front (lib/sitegencom.mjs crossDock).'); }
  if (form === 'mf-tower-podium' || form === 'mf-podium') P.form = 'tower';
  if (form === 'mf-podium-courtyard') { P.form = 'tower'; P.arrangement = 'podium-court'; if (!P.floors) { const m = /\b([4-6]) over ([12])\b/i.exec(b.request?.text || ''); P.floors = m ? +m[1] + +m[2] : 7; if (m) P.podium = +m[2]; } else { const m = /\b([4-6]) over ([12])\b/i.exec(b.request?.text || ''); if (m) P.podium = +m[2]; } } // (a courtyard on a parking podium, lib/sitegen.mjs podiumCourt: '5 over 2' is 7 floors)
  if (form === 'mf-tuck-under') { P.arrangement = 'tuck'; if (!P.floors) P.floors = 2; } // (tuck-under rows: homes over their garages, lib/sitegen.mjs tuckOf; 2 floors as the reviewed E053 row unless the words say)
  if (form === 'mf-wrap') { P.arrangement = 'wrap'; if (!P.floors) P.floors = 5; } // (a wrap: apartments round a garage, lib/sitegen.mjs wrapOf; 5 floors unless the words say)
  // vertical mixed use: one program, apartments with the shops on the ground floor (lib/sitegen.mjs verticalOf). The
  // floors are the building's, the shops' floor included ("a 5-story mixed-use building": 1 of shops, 4 of homes); 5
  // unless the words say. The shops' floor area is exact (the ground floor's retail stretch is drawn to it); parking is
  // each use at its own ratio, shared surface parking behind the building, no shared-parking reduction taken.
  if (form === 'mx-vertical') { const ru = uses.find(u => u.use === 'retail' && u.form === 'mx-vertical'), mu = uses.find(u => u.use === 'multifamily');
    if (ru && mu) { const fl = +(/(\d+)[- ](?:stor(?:y|ies)|floors?|levels?)\b/i.exec(b.request?.text || '') || [])[1] || mu.floors || 5, rz = single ? P : P.zones[ru.zone ?? uses.indexOf(ru)] || {};
      const np = { use: 'multifamily', arrangement: 'vertical', floors: Math.max(3, Math.min(8, fl)), units: mu.quantity.mode === 'maximize' ? undefined : mu.quantity.mode === 'range' ? mu.quantity.max : mu.quantity.value, groundRetail: rz.gfa ?? ru.quantity.value ?? null, ...(P.entrances ? { entrances: P.entrances } : {}), ...(P.perUnit ? { perUnit: P.perUnit } : {}) };
      for (const k of Object.keys(P)) delete P[k]; Object.assign(P, np); if (P.units == null) delete P.units;
      mapping.push('Vertical mixed use: one building along the street, ' + (P.groundRetail ? Math.round(P.groundRetail).toLocaleString('en-US') + ' sf of shops' : 'shops') + ' on its ground floor with ' + (P.floors - 1) + ' floors of apartments above, the rest of the building apartments; shared surface parking behind, each use at its own ratio (no shared-parking reduction taken: an assumption a parking study could lower).'); } }
  // the 3-5 story double-loaded corridor forms whose homes the engine counts from floor area (courtyard, wrap, courtyard on
  // a podium, vertical mixed use): the gross area a home from the reviewed dev corridor buildings (lib/reftemplates.mjs
  // REF_CORRIDOR: P28, P11, P33, all 3-4 story wood corridor buildings), unless the request or Settings give a unit size or
  // a mix. Not towers: the reviewed high-rise homes are urban and smaller (P25 899, E027 766 gross sf a home), not
  // representative of the suburban towers the engine draws, so a tower keeps the engine's default.
  if (REF_CORRIDOR && ['mf-courtyard', 'mf-wrap', 'mf-podium-courtyard', 'mx-vertical'].includes(form) && P.unitSf == null && !P.mix && !P.zones) {
    P.unitSf = Math.round(REF_CORRIDOR.gsfPerUnit * 0.85); // (the engine converts floor area to homes at 85% throughout: the unit size that gives the reviewed gross area a home)
    mapping.push('Homes sized from floor area as the reviewed corridor buildings are (' + REF_CORRIDOR.evidence.join(', ') + '): about ' + REF_CORRIDOR.gsfPerUnit.toLocaleString('en-US') + ' gross sf a home (their net share is ' + Math.round(REF_CORRIDOR.eff * 100) + '%; the engine counts at its 85%, so the unit size reads ' + Math.round(REF_CORRIDOR.gsfPerUnit * 0.85) + ' sf).'); }
  // a templated apartment form: the engine draws buildings at the template's depth, at most a whole number of modules
  // long, and sizes them by the template's gross area a unit, so snapping to modules loses little
  const tUses = uses.filter(u => u.use === 'multifamily' && templatesFor(u.form, u).length);
  for (const [n, u] of tUses.entries()) {
    const tpl = templatesFor(u.form, u)[0], m = tpl.module, gsfUnit = m.w * m.d / m.unitsPerFloor, z = single ? P : P.zones[u.zone ?? uses.indexOf(u)];
    if (n === 0) { const k = Math.min(tpl.maxModules || Infinity, Math.max(tpl.minModules + 1, Math.floor(260 / m.w))); plan.params = { ...plan.params, bldgDepth: m.d, maxLen: k * m.w, unitW: m.w, minLen: m.w * tpl.minModules, jog: false }; } // bar lengths in whole modules, never under the smallest building the evidence shows
    if (z) { z.unitSf = Math.round(gsfUnit * 0.85); z.eff = 0.85; z.depth = m.d; if (!z.floors) z.floors = tpl.floors; if (u.form === 'mf-garden-studio' && !z.mix) z.mix = [{ name: 'Studio', sf: 520, pct: 65, beds: 0 }, { name: '1 BR', sf: 700, pct: 35, beds: 1 }]; }
    mapping.push((u.name ? u.name + ': ' : '') + 'buildings sized from template ' + tpl.id + ' (' + m.w + ' × ' + m.d + ' ft ' + m.label + ', ' + m.unitsPerFloor + ' units a floor; ' + tpl.evidence_strength + ').');
  }
  const opts = { keepout: keepouts.length ? keepouts : undefined, netEvals: 6, ...(b.solver.engineOpts || {}) }; opts.count = Math.min(12, (+opts.count || b.solver.options || 3) + 2); // (two more than are shown: the run leaves out twins, a mirror image with the same numbers, and still has enough) // engineOpts: the app's own search settings, saved with the brief
  if (Array.isArray(b.pinned) && b.pinned.length) opts.pinned = b.pinned;
  // the parking asked to go behind the building ("building up front, parking behind", "retail on the street, parking in
  // the rear"): the parking-field engine lays out the building at the street with its lot behind it (lib/siteparking.mjs
  // streetFront; docs/LAYOUT-ENGINE.md item 31)
  { const L = b.program.placements || [], pk = L.find(p => p.subject === 'parking'), fieldUse = ['retail', 'restaurant', 'office', 'medical', 'hotel', 'church'];
    if (pk ? ['behind', 'back'].includes(pk.rel) : L.some(p => fieldUse.includes(p.subject) && p.rel === 'front')) { opts.parkBack = true; mapping.push('Parking asked behind the building: the building at the street, its parking behind it, where the lot allows.'); } }
  return { plan, program: P, opts, mapping };
}
