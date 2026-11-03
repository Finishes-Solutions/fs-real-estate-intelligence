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
import { hashOf } from './sha256.mjs';
import { engineTarget, templatesFor } from './bldgtemplates.mjs';

export const BRIEF_SCHEMA = 'rei.brief/1';
export const PRECISION_FT = 0.01;
export const M_TO_FT = 1 / 0.3048;
export const MODES = ['exact', 'min', 'max', 'range', 'maximize'];
export const QTY_UNITS = ['units', 'sf', 'buildings'];
export const OVERLAYS = ['senior', 'student', 'affordable'];
export const officeBlend = share => +(share * 3.5 + (1 - share) * 0.6).toFixed(3); // spaces a 1,000 sf: office 3.5, warehouse 0.6 (planning assumptions)
export const PARKING_MODES = ['surface', 'tuck-under', 'garage', 'podium', 'structured', 'shared'];

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
    designVehicle: { v: null, cls: 'assumption', source: 'No design vehicle declared; turning movements are not checked' }
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
  const N = '(\\d[\\d,]*)';
  let m;
  if ((m = new RegExp('\\b(?:between\\s+)?' + N + '\\s*(?:-|–|to|and)\\s*' + N + '\\s*(?:[a-z-]+\\s+){0,2}' + U, 'i').exec(t))) return { mode: 'range', min: n(m[1]), max: n(m[2]), unit };
  if ((m = new RegExp('\\b(?:at least|minimum of|min(?:imum)?\\.?|no fewer than|no less than)\\s+' + N + '\\s*(?:[a-z-]+\\s+){0,2}' + U, 'i').exec(t)) || (m = new RegExp(N + '\\s*\\+\\s*(?:[a-z-]+\\s+){0,2}' + U, 'i').exec(t))) return { mode: 'min', value: n(m[1]), unit };
  if ((m = new RegExp('\\b(?:up to|at most|no more than|max(?:imum)?(?: of)?|not more than)\\s+' + N + '\\s*(?:[a-z-]+\\s+){0,2}' + U, 'i').exec(t))) return { mode: 'max', value: n(m[1]), unit };
  if ((m = new RegExp('\\b(?:exactly\\s+)?' + N + '\\s*(?:[a-z-]+\\s+){0,3}' + U, 'i').exec(t))) return { mode: 'exact', value: n(m[1]), unit };
  return null;
}
export const wantsMax = text => /\b(as (?:many|much|big|large) as (?:will |can |it )?(?:fits?|possible|the site (?:holds|allows))|maximi[sz]e|max(?:imum)? (?:yield|density|units)|fill the site)\b/i.test(String(text || ''));

// ---------- building forms (the capability registry, lib/layoutcaps.mjs, says what each does) ----------
const FORM_WORDS = [
  ['mf-tower-podium', /\btower\b/i], ['mf-podium', /\bpodium\b/i], ['mf-wrap', /\bwrap\b/i], ['mf-tuck-under', /\btuck[- ]?under\b/i],
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
    front: plan.front ?? null, streets: plan.streets || [], access: { edges: null, entrances: [] },
    setbacks: plan.setbacks ? { ...plan.setbacks } : null,
    exclusions: (plan.elements || []).filter(e => e.kind === 'keepout').map(e => ({ id: e.id || null, kind: 'keepout', ring: S.shapeOf(e).map(p => [+p[0], +p[1]]), source: e.note || e.name || 'drawn by hand' }))
  };
}

const useOf = z => z?.use || null;
function useFromProgram(z, text, i) {
  const unit = ['multifamily', 'townhomes', 'duplex', 'sfr'].includes(z.use) ? 'units' : 'sf';
  const target = unit === 'units' ? z.units : z.gfa, words = text ? quantityFromWords(text, unit) : null;
  let quantity;
  if (words && (target == null || words.value === target || words.max === target || words.min === target)) quantity = words;
  else if (target != null) quantity = { mode: 'exact', value: target, unit };
  else quantity = { mode: 'maximize', unit };
  if (quantity.mode !== 'maximize' && text && wantsMax(text) && !words) quantity = { mode: 'min', value: target, unit };
  const out = { id: 'u' + (i + 1), use: z.use, quantity };
  if (z.floors) out.floors = z.floors;
  if (z.buildings) out.buildings = { mode: 'exact', value: z.buildings };
  if (z.mix) out.mix = z.mix;
  if (z.place) out.placement = z.place;
  if (z.phase) out.phase = z.phase;
  return out;
}

// A brief from an engine program (the words' guess or the AI's program step) and a plan. text: the original request.
export function briefFromProgram(program, plan, { text = '', parser = 'structured', seed = null, options = 3 } = {}) {
  const P = program || {}, zones = Array.isArray(P.zones) && P.zones.length > 1 ? P.zones : [P];
  const uses = zones.filter(z => useOf(z) && z.use !== 'amenity' && z.use !== 'garage').map((z, i) => useFromProgram(z, zones.length > 1 ? null : text, i));
  const form = formFromWords(text) || (P.form === 'tower' ? 'mf-tower-podium' : P.arrangement === 'courtyard' ? 'mf-courtyard' : null);
  for (const u of uses) if (u.use === 'multifamily' && form && form !== 'mf-townhome' && form !== 'mf-stacked-townhome' && form !== 'mf-cottage-btr' && form !== 'mf-plex') u.form = form;
  for (const u of uses) if (!u.form) u.form = defaultForm(u.use, text);
  const brief = {
    schema: BRIEF_SCHEMA,
    request: { text: String(text || ''), parser },
    site: siteFromPlan(plan),
    program: { uses, overlays: overlaysFromWords(text), parking: { mode: /\btuck[- ]?under\b/i.test(text) ? 'tuck-under' : /\bpodium\b/i.test(text) ? 'podium' : /\bgarage|structured\b/i.test(text) ? 'garage' : 'surface' }, engine: stripProgram(P) },
    rules: { id: DEFAULT_RULES.id, version: DEFAULT_RULES.version, values: { ...DEFAULT_RULES.values, ...(plan.setbacks ? { setbacks: { v: { ...S.SETBACKS, ...plan.setbacks }, cls: plan.setbacksSource ? 'verified' : 'assumption', source: plan.setbacksSource || 'Setbacks on the plan (default or entered by hand); not verified against zoning' } } : {}) } },
    locks: [],
    solver: { seed: seed ?? 'rei-1', tickMs: 25, options }
  };
  return brief;
}
function defaultForm(use, text) {
  if (use === 'multifamily') return 'mf-garden';
  if (use === 'townhomes') return /\bstacked\b/i.test(text) ? 'mf-stacked-townhome' : 'mf-townhome';
  if (use === 'duplex') return 'mf-plex';
  if (use === 'sfr') return /\brent|btr\b/i.test(text) ? 'mf-cottage-btr' : 'sfr-subdivision';
  if (use === 'industrial') return /\bflex\b/i.test(text) ? 'flex-multi-tenant' : /\bcross[- ]?dock\b/i.test(text) ? 'ind-cross-dock' : 'ind-warehouse';
  if (use === 'retail') return /\banchor/i.test(text) ? 'ret-anchored' : /\bpad\b/i.test(text) ? 'ret-inline-pads' : 'ret-inline';
  if (use === 'restaurant') return /\bdrive[- ]?th/i.test(text) ? 'ret-drive-through' : 'ret-restaurant';
  return use;
}
// the engine's own program, kept as it was handed over (so a replay hands the engine the same thing)
function stripProgram(P) { return JSON.parse(JSON.stringify(P || {})); }

// The words alone (the app's Low effort, the MCP tool without AI): lib/siteplan.mjs guessProgram, then the quantity
// meanings and form the words state.
export function briefFromRequest(text, plan, opts = {}) {
  const prog = S.guessProgram(String(text || ''));
  return briefFromProgram(prog, plan, { ...opts, text, parser: 'words' });
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
    if (u.floors != null && !(Number.isInteger(u.floors) && u.floors >= 1 && u.floors <= 60)) E(p + '.floors', 'Floors must be a whole number 1–60');
  }
  for (const o of b.program?.overlays || []) if (!OVERLAYS.includes(o)) E('program.overlays', 'Unknown overlay ' + o);
  if (b.program?.parking?.mode && !PARKING_MODES.includes(b.program.parking.mode)) E('program.parking.mode', 'Parking mode must be one of ' + PARKING_MODES.join(', '));
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
  b.locks = [...new Set(b.locks || [])].sort();
  b.solver = { seed: b.solver.seed, tickMs: +b.solver.tickMs || 25, options: Math.max(1, Math.min(6, +b.solver.options || 3)) };
  return b;
}
// the hash of what the geometry depends on (the request's wording and the parser are kept but not hashed)
export const inputHash = b => hashOf({ ...canonicalBrief(b), request: undefined });

// ---------- to the existing engine ----------
// -> { plan, program, opts, mapping: [notes on how the brief was handed over] }
export function toEngine(bIn) {
  const b = canonicalBrief(bIn), s = b.site, mapping = [];
  const keepouts = [...s.exclusions.map(x => ({ id: x.id, kind: 'keepout', poly: x.ring, name: x.kind, note: x.source, pinned: true })),
    ...s.holes.map((h, i) => ({ id: 'hole' + (i + 1), kind: 'keepout', poly: h, name: 'Hole in the site', pinned: true }))];
  const sb = b.rules?.values?.setbacks?.v || s.setbacks || S.SETBACKS;
  const plan = { origin: s.origin || [0, 0], ring: s.ring, front: s.front ?? S.longestEdge(s.ring), streets: s.streets, setbacks: { ...S.SETBACKS, ...sb }, elements: [] };
  const P = JSON.parse(JSON.stringify(b.program.engine && Object.keys(b.program.engine).length ? b.program.engine : {}));
  const uses = b.program.uses, single = uses.length === 1, modes = uses.map(u => u.quantity.mode);
  const setQ = (z, u) => { const q = u.quantity, tgt = q.mode === 'range' ? q.max : q.value; if (q.mode === 'maximize') { delete z.units; if (q.unit === 'sf') delete z.gfa; return; } if (q.unit === 'units') z.units = (u.use === 'multifamily' && q.mode !== 'min' && engineTarget(q, u.form)) || tgt; else if (q.unit === 'sf') z.gfa = tgt; else z.buildings = tgt; if (u.floors) z.floors = u.floors; if (u.mix) z.mix = u.mix; };
  if (single) { if (!P.use) P.use = uses[0].use; setQ(P, uses[0]); }
  else { P.zones = (P.zones && P.zones.length === uses.length ? P.zones : uses.map(u => ({ use: u.use }))); uses.forEach((u, i) => setQ(P.zones[i], u)); }
  // parking rule from the brief (else the engine's use default)
  const pr = b.rules?.values; if (pr?.parkingPerUnit?.v != null) P.perUnit = pr.parkingPerUnit.v; if (pr?.parkingPer1000?.v != null) P.ratio = pr.parkingPer1000.v;
  // flex: an office share parks at a blend of the office and warehouse ratios (OFFICE_BLEND, an assumption)
  uses.forEach((u, i) => { if (u.officeShare != null && u.use === 'industrial') { const z = single ? P : P.zones[i]; z.ratio = officeBlend(u.officeShare); z.flex = true; mapping.push('Flex parking at ' + z.ratio.toFixed(2) + ' a 1,000 sf for a ' + Math.round(u.officeShare * 100) + '% office share (assumption: office 3.5, warehouse 0.6 a 1,000 sf).'); } });
  // what the quantities mean, as the engine's one fill setting: it can't hold one use exact and fill another
  const fill = modes.every(m => m === 'exact' || m === 'max' || m === 'range') ? false : modes.every(m => m === 'min' || m === 'maximize') ? true : 'phase';
  if (fill === 'phase') mapping.push('The program mixes exact and open-ended quantities; the engine fills the site and marks what is past the exact asks as Phase 2. The program check judges each use by its own meaning.');
  plan.params = { ...(b.program.params || {}), fill };
  const form = uses.find(u => u.use === 'multifamily')?.form;
  if (form === 'mf-courtyard') P.arrangement = 'courtyard';
  if (form === 'mf-tower-podium') P.form = 'tower';
  // a templated apartment form: the engine draws buildings at the template's depth, at most a whole number of modules
  // long, and sizes them by the template's gross area a unit, so snapping to modules loses little
  const tpl = templatesFor(form)[0];
  if (tpl) {
    const m = tpl.module, k = Math.max(tpl.minModules + 1, Math.floor(260 / m.w)), gsfUnit = m.w * m.d / m.unitsPerFloor, mfz = single ? P : P.zones.find(z => z.use === 'multifamily');
    plan.params = { ...plan.params, bldgDepth: m.d, maxLen: k * m.w, unitW: m.w, jog: false }; // bar lengths in whole modules (the engine's typical length is 85% of maxLen, so maxLen stays above the smallest building)
    if (mfz) { mfz.unitSf = Math.round(gsfUnit * 0.85); mfz.eff = 0.85; mfz.depth = m.d; if (!mfz.floors) mfz.floors = tpl.floors; }
    mapping.push('Apartment buildings are sized from template ' + tpl.id + ' (' + m.w + ' × ' + m.d + ' ft ' + m.label + ', ' + m.unitsPerFloor + ' units a floor; ' + tpl.evidence_strength + ').');
  }
  const opts = { keepout: keepouts.length ? keepouts : undefined, netEvals: 6 };
  if (Array.isArray(b.pinned) && b.pinned.length) opts.pinned = b.pinned;
  return { plan, program: P, opts, mapping };
}
