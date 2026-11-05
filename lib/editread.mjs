// Understanding an EDIT to a laid-out site plan: the words a person types in Change With AI (src/siteplan.js aiChange) or
// an agent sends through the MCP's plan_edit (lib/mcp/plans.mjs) after a plan exists. One reading for both:
//   readEdit(words, plan, { sel })  the words read here, clause by clause (no AI): locks ("keep building 1 where it is",
//       "don't touch the retail"), settings (setbacks, parking ratio and angle, entrances), changes to the program (a count,
//       a size, a hotel's keys, the stories, one use for another, denser / less dense, more open space, use more of the
//       site), parking (add spaces, behind / in front of the buildings, fix it), places for the big pieces (the pond, a
//       use's buildings: placements the engine steers), edits on pieces (lib/siteedit.mjs ops: move to a place or by feet
//       in a compass direction, add, remove, swap, resize), the home mix and names. -> a READ (below)
//   fromAI(answer, plan)            the AI's answer (api/siteplan.js mode 'edit': ops on pieces, plus `whole`, the changes
//       across the plan, and `locks`) as the same READ
//   mergeReads(words, ai)           the AI's reading with the words' own where they read the same thing (the words' numbers
//       and places win; the AI fills what the words left)
//   programChange(plan, read)       the plan with the program and settings changes applied (laid out again by the caller:
//       lib/mcp/plans.mjs relayPlan on the server, src/siteplan.js resolve in the app)
//   verifyRead(read, before, after) each thing asked, measured on the edited plan: done, or not met and why (said in the reply)
// READ: { locks: [{ id, lock, name }], settings: {…}, program: {…}, parking: {…}, placements: [...], ops: [...], adds: [...],
//   scale: [{ id, by }], mix, names, refit, said: [what was read, in words], unclear: [...], rest }
import * as S from './siteplan.mjs';
import * as ED from './siteedit.mjs';
import * as I from './layoutintent.mjs';
import * as BT from './btypes.mjs';

const n0 = v => Math.round(+v || 0).toLocaleString('en-US');
const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50 };

// ---------- messy words (after lib/siteplan.mjs tidyRequest: "untis", "pkg", "15ksf", "bldg") ----------
const FIX = [[/\bmvoe\b|\bmvoe\b|\bmov\b/g, 'move'], [/\bteh\b|\bhte\b/g, 'the'], [/\bprk\b/g, 'park'], [/\bspcs\b|\bspc\b|\bspots\b/g, 'spaces'], [/\brmv\b|\brm\b|\bremvoe\b|\bremoev\b/g, 'remove'],
  [/\bfrnt\b|\bfornt\b/g, 'front'], [/\brr\b/g, 'rear'], [/\bangeled\b|\bangeld\b|\banlged\b/g, 'angled'], [/\bangel\b(?=\s+(?:the\s+)?(?:parking|stalls|spaces))/g, 'angle'], [/\bpl[sz]\b|\bplease\b/g, ''], [/\bcentre\b|\bcenetr\b|\bcneter\b/g, 'center'],
  [/\bsetbak\b|\bsetbck\b|\bsb\b/g, 'setback'], [/\bparkng\b|\bpakring\b|\bparkign\b/g, 'parking'], [/\bentrence\b|\bentrace\b|\bentrnace\b/g, 'entrance'], [/\bclubhose\b|\bclub house\b|\bclubhous\b/g, 'clubhouse'],
  [/\bstrys\b|\bstorys\b/g, 'stories'], [/\bstry\b/g, 'story'], [/\bbuidling\b|\bbulding\b|\bbldng\b/g, 'building'], [/\btownhome row\b/g, 'townhome row'], [/\bapt bldg\b/g, 'apt building'],
  [/\bnw\b/g, 'northwest'], [/\bne\b/g, 'northeast'], [/\bsw\b/g, 'southwest'], [/\bse\b(?=\s+corner)/g, 'southeast'], [/\s&\s/g, ' and '], [/\bw\/o\b/g, 'without'],
  [/(\d)\s*(?:'|’)(?=\s|$|,|\.)/g, '$1 ft'], [/(\d)\s*(?:ft|feet|foot)\.?(?=\s|$|,)/g, '$1 ft'], [/\b(\d+(?:\.\d+)?)\s*k\s*(?:sf|sq\.?\s*ft|square feet)\b/g, (m, n) => Math.round(+n * 1000) + ' sf'], [/\bsq\.?\s*ft\b|\bsquare feet\b/g, 'sf']];
export function tidyEdit(text) {
  let t = S.tidyRequest(String(text || '')).toLowerCase().replace(/[“”"]/g, '').replace(/\s+/g, ' ');
  for (const [re, to] of FIX) t = t.replace(re, to);
  t = t.replace(/\b(\d+(?:\.\d+)?)k\b(?!\s*(?:units|homes|keys))/g, (m, n) => Math.round(+n * 1000) + ' sf').replace(/(\d),(\d{3})\b/g, '$1$2').replace(/\b(\d+) sf sf\b/g, '$1 sf');
  return t.replace(/\s+/g, ' ').replace(/\s+([,.;])/g, '$1').trim();
}

// ---------- settings said in words (moved here from lib/mcp/plans.mjs so the app reads them the same way) ----------
const WN = { one: 1, two: 2, three: 3, four: 4 };
// (commas between digits stay: "50,000" isn't two numbers)
export const tidyRest = t => t.replace(/(?:\s*,\s*)+(?!\d{3}\b)/g, ', ').replace(/^[\s,.;]*(?:and\s+)?(?:then\s+)?/i, '').replace(/[\s,;]*(?:\band\b)?[\s,.;]*$/i, '').replace(/,\s*(?:and\s+)?,/g, ',').trim();
export function settingsFromWords(words) {
  const set = {}, sb = {}; let t = ' ' + String(words || '') + ' ';
  const take = (re, fn) => { t = t.replace(re, (...m) => { fn(m); return ' , '; }); };
  take(/\b(?:set\s+)?(?:the\s+)?parking\s+(?:stall\s+)?angle\s*(?:to\s+|at\s+)?(\d{2})\s*(?:°|deg(?:rees?)?)?/gi, m => { set.parking_angle = +m[1]; });
  take(/\b(?:make\s+(?:the\s+)?parking\s+|use\s+)?(\d{2})[- ]?(?:°|deg(?:ree)?s?)\s+(?:angled\s+)?(?:parking|stalls?|spaces?)\b/gi, m => { set.parking_angle = +m[1]; });
  take(/\b(?:make\s+|put\s+|set\s+|turn\s+)?(?:the\s+|all\s+(?:the\s+)?)?(?:parking|stalls?|spaces?)(?:\s+(?:rows?|stalls?))?\s+(?:to\s+|at\s+)?(?:a\s+)?(45|60|90)[- ]?(?:°|deg(?:ree)?s?)(?:\s+angle[ds]?)?/gi, m => { set.parking_angle = +m[1]; });
  take(/\b(?:use\s+|make\s+(?:the\s+)?parking\s+|with\s+|add\s+)?(?:angled|diagonal|slanted)\s+(?:parking|stalls?|spaces?)\b|\bmake\s+(?:the\s+|all\s+(?:the\s+)?)?parking\s+(?:angled|diagonal)\b|\bangle\s+(?:the\s+|all\s+(?:the\s+)?)?(?:parking|stalls?|spaces?)(?:\s+rows?)?\b|\bparking\s+(?:angled|diagonal)\b/gi, () => { if (set.parking_angle == null) set.parking_angle = 60; });
  take(/\b(?:straight|square|perpendicular|head[- ]in|90)\s+(?:degree\s+)?(?:parking|stalls?)\b|\bno\s+angled\s+parking\b|\bstraighten\s+(?:out\s+)?(?:the\s+)?parking\b/gi, () => { set.parking_angle = 90; });
  take(/\b(?:set\s+)?(?:the\s+)?parking\s+(?:ratio\s+)?(?:of\s+|to\s+|at\s+)?(\d+(?:\.\d+)?)\s*(?:spaces?\s+)?(?:\/|per|a|an)\s*1,?000(?:\s*sf)?/gi, m => { set.parking_per_1000 = +m[1]; });
  take(/\b(\d+(?:\.\d+)?)\s*(?:parking\s+)?(?:spaces?|stalls?)\s*(?:\/|per|a|an)\s*1,?000(?:\s*sf)?/gi, m => { set.parking_per_1000 = +m[1]; });
  take(/\b(?:(?:set\s+)?(?:the\s+)?parking\s+(?:ratio\s+)?(?:of\s+|to\s+|at\s+)?)?(\d(?:\.\d+)?)\s*(?:parking\s+)?(?:spaces?|stalls?|cars?)?\s*(?:\/|per|a|an|for each|each)\s*(?:unit|home|apartment|dwelling|du|door)\b/gi, m => { set.parking_per_unit = +m[1]; });
  take(/\b(?:set\s+)?(?:the\s+)?(front|side|rear|back|paving)\s+(?:setbacks?|yards?|building lines?)\s*(?:of\s+|to\s+|at\s+|=\s*)?(\d{1,3})\s*(?:ft|feet|')?/gi, m => { const k = m[1].toLowerCase(); sb[k === 'back' ? 'rear' : k] = +m[2]; });
  take(/\b(\d{1,3})\s*(?:ft|feet|')\s+(front|side|rear|back)\s+(?:setbacks?|yards?)\b/gi, m => { const k = m[2].toLowerCase(); sb[k === 'back' ? 'rear' : k] = +m[1]; });
  take(/\b(\d|one|two|three|four)\s+(?:entrances|entries|driveways|ways in)\b/gi, m => { set.entrances = WN[m[1].toLowerCase()] || +m[1]; });
  take(/\b(?:guardrails?|city rules?)\s+(off|on|auto)\b|\bturn\s+(off|on)\s+(?:the\s+)?(?:guardrails?|city rules?)\b/gi, m => { set.guardrails = (m[1] || m[2]).toLowerCase(); });
  take(/\bscenario\s+([abc])\b/gi, m => { set.scenario = m[1].toUpperCase(); });
  if (Object.keys(sb).length) set.setbacks = sb;
  return { set, rest: tidyRest(t) };
}

// the plan with the settings applied: { plan, did: what was set, bad: what couldn't be }
export function withSettings(plan, set = {}) {
  const did = [], bad = [], prog = { ...(plan.program || {}) }, params = { ...(plan.params || {}) }, setbacks = { ...S.SETBACKS, ...(plan.setbacks || {}) };
  const num = (v, lo, hi) => v != null && v !== '' && Number.isFinite(+v) && +v >= lo && +v <= hi ? +v : null;
  if (set.setbacks && typeof set.setbacks === 'object') for (const [k, v] of Object.entries(set.setbacks)) { if (!['front', 'side', 'rear', 'paving'].includes(k)) { bad.push('setbacks are front, side, rear and paving (not ' + k + ').'); continue; } const x = num(v, 0, 500); if (x == null) { bad.push(k + ' setback is 0 to 500 ft.'); continue; } setbacks[k] = x; did.push(k + ' setback ' + x + ' ft'); }
  if (set.parking_per_unit != null) { const x = num(set.parking_per_unit, 0, 4); if (x == null) bad.push('parking_per_unit is 0 to 4.'); else { prog.perUnit = x; prog.parkSet = true; did.push(x + ' parking spaces a home'); } }
  if (set.parking_per_1000 != null) { const x = num(set.parking_per_1000, 0, 30); if (x == null) bad.push('parking_per_1000 is 0 to 30.'); else { prog.ratio = x; prog.parkSet = true; did.push(x + ' parking spaces a 1,000 sf'); } }
  if (set.parking_angle != null) { const a = +set.parking_angle; if (a === 60 || a === 45) { prog.parkAngle = a; did.push(a + '° angled parking on one-way aisles'); } else if (a === 90 || a === 0) { delete prog.parkAngle; did.push('straight (90°) parking'); } else bad.push('parking_angle is 45, 60 or 90.'); }
  if (set.entrances != null) { const x = num(set.entrances, 1, 4); if (x == null) bad.push('entrances is 1 to 4.'); else { prog.entrances = Math.round(x); did.push(Math.round(x) + ' entrance' + (x > 1 ? 's' : '')); } }
  if (set.entrance_style != null) { if (!['auto', 'boulevard', 'narrow', 'driveway'].includes(set.entrance_style)) bad.push('entrance_style is auto, boulevard, narrow or driveway.'); else { params.entry = { ...(params.entry || {}), style: set.entrance_style }; did.push('entrance style ' + set.entrance_style); } }
  if (set.guardrails != null || set.scenario != null) { const g = { ...(params.guard || {}) };
    if (set.guardrails != null) { if (!['auto', 'on', 'off'].includes(set.guardrails)) bad.push('guardrails is auto, on or off.'); else { g.mode = set.guardrails; did.push('jurisdiction guardrails ' + set.guardrails); } }
    if (set.scenario != null) { const sc = String(set.scenario).toUpperCase(); if (!['A', 'B', 'C'].includes(sc)) bad.push('scenario is A, B or C.'); else { g.scenario = sc; did.push('guardrail scenario ' + sc); } }
    params.guard = g; }
  return { plan: { ...plan, setbacks, program: prog, params }, did, bad };
}

// ---------- a building of a type (lib/btypes.mjs presets, the editor's "Add a building by type") ----------
// a preset named by its id, label or words ("hotel", "limited-service hotel", "daycare", "car wash")
export function presetFor(w) {
  const t = String(w || '').toLowerCase().trim().replace(/^(?:an?|one|the|another|second|2nd|new)\s+/, '').replace(/^(?:an?|another|second|new)\s+/, '').replace(/\s+(?:building|pad)s?$/, ''); if (!t) return null;
  const cat = BT.presetCatalog(), toks = t.split(/[\s/-]+/).filter(x => x.length > 1);
  return cat.find(c => c.id === t) || cat.find(c => c.label.toLowerCase() === t || (BT.presetOf(c.id)?.short || '').toLowerCase() === t) || cat.find(c => toks.length && toks.every(x => c.words.includes(x))) || null;
}
// the building of the preset at its usual size, sized to the keys, units, floors or floor area asked
export function typedBuilding(id, { keys, units, floors, gfa } = {}) {
  const e = BT.presetBuilding(id); if (!e) return null;
  const gsf0 = e.w * e.d * (e.floors || 1), fl = Math.max(1, Math.min(60, Math.round(+floors || e.floors || 1)));
  const per = +keys > 0 && e.keys ? gsf0 / e.keys : +units > 0 && e.units ? gsf0 / e.units : null, gsf = per ? per * (+keys || +units) : +gfa > 0 ? +gfa : gsf0;
  if (per || +gfa > 0 || fl !== e.floors) { e.floors = fl; e.w = Math.max(30, Math.min(900, Math.round(gsf / fl / e.d))); }
  if (+keys > 0 && e.keys) e.keys = Math.round(+keys); if (+units > 0 && e.units) e.units = Math.round(+units);
  e.note = [BT.presetOf(id)?.label || e.name, e.floors + '-story', e.keys ? e.keys + ' keys' : e.units > 1 ? e.units + ' units' : n0(e.w * e.d * e.floors) + ' sf'].join(' · ');
  return e;
}
export const BT_EXTRA = ['btype', 'tc', 'floorH', 'keys', 'beds', 'children', 'students', 'note', 'form', 'ground', 'podium', 'plex'];
// "add a hotel with 120 keys at the front", "add a 120-key hotel at the back", "add a second warehouse of 50,000 sf", "add a
// building of type daycare beside the clubhouse", "add a 4-story limited-service hotel": typed adds, and the rest of the words
export function typeAddsFromWords(words) {
  const adds = []; let t = String(words || '');
  t = t.replace(/\badd\s+(?:an?\s+|one\s+)?(?:new\s+|another\s+|second\s+|2nd\s+)?(?:building\s+of\s+(?:the\s+)?type\s+)?(?:(\d+)[- ]stor(?:y|ey)\s+)?(?:(\d+)[- ](keys?|rooms?|units?)\s+)?(?:(\d+)[- ]stor(?:y|ey)\s+)?([a-z][a-z /&'-]{1,40}?)(?:\s+(?:building|pad))?(?:\s+(?:with|of)\s+(\d[\d,]*)\s*(keys|rooms|units|homes|sf))?(?:\s+(?:at|to|in|on|along)\s+(?:the\s+)?(front|back|rear|middle|center|centre|left|right|corner)(?:\s+of\s+the\s+(?:site|lot|property))?|\s+(?:beside|next to|near|by)\s+(?:the\s+)?([a-z0-9 ]{2,40}?))?(?=\s*(?:,|;|\.|\band\b|$))/gi, (m, fl, n1, u1, fl2, what, n, unit, at, near) => {
    const P = presetFor(what); if (!P) return m;
    const N = n1 ? +n1 : n ? +String(n).replace(/,/g, '') : null, U = (u1 || unit || '').toLowerCase();
    adds.push({ action: 'add', btype: P.id, ...(N ? (/key|room/.test(U) ? { keys: N } : /sf/.test(U) ? { gfa: N } : { units: N }) : {}), ...(fl || fl2 ? { floors: +(fl || fl2) } : {}), ...(at ? { to: at.toLowerCase() } : near ? { beside: near.trim() } : { to: 'front' }) }); return ' , '; });
  return { adds, rest: tidyRest(t) };
}

// a typed add (typeAddsFromWords) as an op on the plan (lib/siteedit.mjs applyEdits), the type's fields in bt; { error } when
// it can't be placed. The app and the MCP place it the same way: beside a piece named, else the part of the site said.
export function addOp(plan, a) {
  let P = presetFor(a.btype); if (!P) return { error: 'No building type “' + a.btype + '”.' };
  if (+a.keys > 0 && P.use === 'hotel' && !BT.presetBuilding(P.id)?.keys) P = presetFor('hotel-limited') || P; /* (keys asked of the plain hotel: the limited-service hotel counts them) */
  const b = typedBuilding(P.id, { keys: a.keys, units: a.units, floors: a.floors, gfa: a.gfa }); if (!b) return { error: 'The building type ' + P.id + ' has no usual size to add it at.' };
  const op = { action: 'add', kind: 'building', use: b.use, floors: b.floors, w: b.w, d: b.d, name: b.name, ...(b.units ? { units: b.units } : {}), bt: Object.fromEntries(BT_EXTRA.filter(k => b[k] != null).map(k => [k, b[k]])) };
  if (a.beside) { const t = findOne(plan, a.beside); if (t) op.with = t.id; }
  if (!op.with) { const to = spotFor(plan, a.to || 'front', { id: '_new', w: b.w, d: b.d }); if (Array.isArray(to)) { op.x = to[0]; op.y = to[1]; } else if (to?.with) op.with = to.with; }
  return { op };
}

// ---------- pieces named in words ----------
const KINDS = [[/^(?:swimming\s+)?pool(?:\s+deck)?$/, e => e.kind === 'pool'], [/^(?:(?:detention|retention|storm(?:water)?)\s+)?(?:pond|lake|basin)s?$|^detention$/, e => e.kind === 'pond'], [/^play\s?(?:ground|area|lot)s?$|^tot lot$/, e => e.kind === 'play'],
  [/^dog\s*(?:park|run)s?$/, e => /dog/i.test(e.name || '') && e.kind !== 'building'], [/^(?:club\s?house|amenity(?: building| center)?|leasing(?: office)?|community (?:center|building))$/, e => e.kind === 'building' && (e.use === 'amenity' || /club|leasing|community/i.test(e.name || ''))],
  [/^(?:pickleball |tennis |sport )?courts?$/, e => e.kind === 'court'], [/^(?:parking\s+)?garage$/, e => e.kind === 'garage'], [/^truck court$/, e => e.kind === 'truck'],
  [/^(?:main\s+)?(?:entrance|entry|driveway|way in)$/, e => S.isEntrance(e) && (e.entry === 'main' || /main/i.test(e.name || ''))], [/^(?:park|lawn|green|open space)$/, e => S.isPark(e) && !S.isMedian(e) && !/future|pad site|dog/i.test(e.name || '')]];
const USEW = [[/^(?:hotels?|the hotel building)$/, ['hotel']], [/^(?:retail|shops?|stores?|shopping(?: center)?|retail (?:building|center|strip|space)s?|strip(?: center)?|inline retail)$/, ['retail', 'restaurant']], [/^(?:restaurants?|restaurant pads?|pads?|pad sites?)$/, ['restaurant']],
  [/^(?:warehouses?|industrial(?: buildings?)?|distribution(?: building| center)?)$/, ['industrial']], [/^(?:offices?|office buildings?)$/, ['office']], [/^(?:apartments?|apartment buildings?|apts|multi-?family|buildings?|residential buildings?)$/, ['multifamily']],
  [/^(?:townhomes?|townhouses?|town homes|townhome rows?)$/, ['townhomes']], [/^(?:duplexes|duplex|cottages)$/, ['duplex']], [/^(?:homes|houses|lots)$/, ['sfr', 'townhomes', 'duplex']]];
const mainUseOf = plan => { const B = (plan.elements || []).filter(e => e.kind === 'building' && e.use !== 'amenity'), n = {}; for (const e of B) n[e.use] = (n[e.use] || 0) + 1; return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || S.normalizeProgram(plan.program || {}).use; };
// the pieces a phrase names (most specific first): "it" (the selected piece), a label ("Apt Bldg 7", "building 7", "bldg 7",
// "row 3"), a kind ("the pool", "the pond", "the dog park"), a use ("the hotel", "the retail", "the apartments"); [] when none
export function findPieces(plan, phrase, sel = null) {
  const els = plan.elements || []; let s = String(phrase || '').toLowerCase().trim().replace(/[.,;!]+$/, '').replace(/^(?:all\s+(?:of\s+)?)?(?:the|a|an|this|that|these|those)\s+/, '').replace(/^(?:all\s+(?:of\s+)?)(?:the\s+)?/, '').replace(/\s+(?:on the plan|here|there|on the site)$/, '').trim();
  if (!s) return [];
  if (/^(?:it|this|this one|that|that one|selected|the selected one|selection)$/.test(s)) return els.filter(e => e.id === sel);
  const byId = els.find(e => e.id === s); if (byId) return [byId];
  const named = els.filter(e => e.name && e.kind !== 'parking' && e.kind !== 'lot'), lab = e => ED.labelOf(e).toLowerCase();
  const exact = named.filter(e => lab(e) === s || lab(e).replace(/^apt bldg /, 'building ') === s || lab(e).replace(/\bbldg\b/, 'building') === s); if (exact.length) return exact.slice(0, 1);
  const num = s.match(/^(?:apt\s+)?(?:building|bldg|apartment building|apt building|row|townhome row|townhouse row|block|pad|lot)\s*#?\s*(\d+|[a-z])$/)?.[1];
  if (num) { const word = /row/.test(s) ? 'row' : /pad/.test(s) ? 'pad' : /lot/.test(s) ? 'lot' : '(?:bldg|building|row|pad)'; const re = new RegExp('\\b' + word + '\\s*' + num + '$', 'i'), hit = named.filter(e => re.test(e.name)); if (hit.length) return hit.slice(0, 1); }
  for (const [re, f] of KINDS) if (re.test(s)) { const hit = els.filter(f); if (hit.length) return hit; }
  for (const [re, uses] of USEW) if (re.test(s)) { let hit = els.filter(e => e.kind === 'building' && uses.includes(e.use)); if (!hit.length && /^buildings?$/.test(s)) hit = els.filter(e => e.kind === 'building' && e.use !== 'amenity'); if (hit.length) return hit; }
  if (/^(?:everything|all buildings|buildings|the buildings|whole (?:site|plan|thing))$/.test(s)) return els.filter(e => e.kind === 'building' && e.use !== 'amenity');
  const part = named.filter(e => s.length > 3 && lab(e).includes(s)); if (part.length) return part;
  return [];
}
const findOne = (plan, phrase, sel) => { const L = findPieces(plan, phrase, sel); return L.length ? L[0] : null; };

// ---------- places named in words, in the sheet's feet (x across the frontage, y back from the street) ----------
const COMPASS = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0], northeast: [1, 1], northwest: [-1, 1], southeast: [1, -1], southwest: [-1, -1] };
const sizeOf = e => e ? [Math.max(20, e.w || 0), Math.max(20, e.d || 0)] : [80, 60];
const boxOfShape = r => [Math.min(...r.map(p => p[0])), Math.min(...r.map(p => p[1])), Math.max(...r.map(p => p[0])), Math.max(...r.map(p => p[1]))];
// how much of the plan a rectangle at (x, y) sheet feet would sit on (buildings, pools, ponds, drives, courts): its overlap
function crowdAt(plan, f, [X, Y], [w, d], skip = new Set()) {
  const p = f.from([X, Y]), b = [p[0] - w / 2, p[1] - d / 2, p[0] + w / 2, p[1] + d / 2]; let hit = 0;
  for (const e of plan.elements || []) { if (skip.has(e.id) || !['building', 'pool', 'pond', 'drive', 'court', 'play', 'garage', 'truck'].includes(e.kind) && !(e.kind === 'green' && e.name && !/future|median/i.test(e.name))) continue;
    let r; try { r = e.path && !e.poly && e.kind === 'drive' ? S.outline(e) : S.shapeOf(e); } catch (x) { r = null; } if (!r?.length) continue; const q = boxOfShape(r), ox = Math.min(b[2], q[2]) - Math.max(b[0], q[0]), oy = Math.min(b[3], q[3]) - Math.max(b[1], q[1]); if (ox > 0 && oy > 0) hit += ox * oy * (e.kind === 'building' || e.kind === 'pond' ? 3 : 1); }
  return hit;
}
// a spot for a piece of this size in a corner of the site inside the setbacks: the corner asked ("northeast", "back",
// "front-left"…) or, with none, the corner where it sits on the least (back corners first: the front has the ways in)
export function cornerSpot(plan, size, want = '', skip = new Set()) {
  const f = ED.sheetFrame(plan), sb = { ...S.SETBACKS, ...(plan.setbacks || {}) }, [w, d] = size, gap = 12;
  const xs = [sb.side + w / 2 + gap, f.width - sb.side - w / 2 - gap], ys = [sb.front + d / 2 + gap + 30, f.depth - sb.rear - d / 2 - gap], C = S.centroid(plan.ring);
  let cands = []; for (const x of xs) for (const y of ys) { const p = f.from([x, y]), dir = [p[0] - C[0], p[1] - C[1]], L = Math.hypot(...dir) || 1; cands.push({ at: [Math.round(x), Math.round(y)], back: y > f.depth / 2, left: x < f.width / 2, dir: [dir[0] / L, dir[1] / L] }); }
  const wv = String(want || '').toLowerCase(), cp = Object.keys(COMPASS).sort((a, b) => b.length - a.length).find(k => wv.includes(k));
  if (cp) { const v = COMPASS[cp], n = Math.hypot(...v); cands.sort((a, b) => (b.dir[0] * v[0] + b.dir[1] * v[1]) / n - (a.dir[0] * v[0] + a.dir[1] * v[1]) / n); cands = cands.slice(0, cp.length > 5 ? 1 : 2); }
  if (/\b(?:back|rear)\b/.test(wv)) cands = cands.filter(c => c.back); if (/\bfront\b/.test(wv)) cands = cands.filter(c => !c.back);
  if (/\bleft\b/.test(wv)) cands = cands.filter(c => c.left); if (/\bright\b/.test(wv)) cands = cands.filter(c => !c.left);
  if (!cands.length) return null;
  // each corner, then stepping in toward the middle (15 ft at a time, up to a third of the site) to the nearest spot clear of
  // buildings, drives, pools and ponds (parking gives way); the corner that gets one nearest its own corner
  const best = cands.map(c => { const sx = c.left ? 1 : -1, sy = c.back ? -1 : 1; let pick = null;
    for (let k = 0; k <= 16 && !pick; k++) for (let i = 0; i <= k && !pick; i++) for (const [a, b] of [[i, k], [k, i]]) { const at = [c.at[0] + sx * a * 15, c.at[1] + sy * b * 15]; if (a * 15 > f.width / 3 || b * 15 > f.depth / 3) continue; if (!crowdAt(plan, f, at, size, skip)) { pick = { at, d: Math.hypot(a, b) }; break; } }
    return pick ? { ...c, at: pick.at.map(Math.round), crowd: pick.d + (c.back ? 0 : 3) } : { ...c, crowd: 1000 + crowdAt(plan, f, c.at, size, skip) + (c.back ? 0 : 500) }; });
  return best.sort((a, b) => a.crowd - b.crowd)[0].at;
}
// a place in words for a piece: [x, y] sheet feet, or { with: id } (beside a piece), or null
export function spotFor(plan, phrase, piece = null, sel = null, gone = null) {
  const w = String(phrase || '').toLowerCase().replace(/^(?:to|into|in|at|on|toward|towards)\s+/, '').replace(/^the\s+/, '').trim(), f = ED.sheetFrame(plan), skip = new Set(piece ? [piece.id] : []);
  if (!w) return null;
  if (/^(?:where (?:it|that|the building|they) (?:was|were|used to be|stood)|(?:its|the) (?:old|empty) (?:spot|place))/.test(w) && gone) return f.to(S.centroid(S.shapeOf(gone))).map(Math.round);
  if (/\bcorner\b/.test(w)) return cornerSpot(plan, sizeOf(piece), w, skip);
  const rel = /^(next to|beside|by|near|alongside|behind|in front of|across from)\s+(.+)$/.exec(w);
  if (rel || /^(?:main\s+)?(?:entrance|entry|front gate|gate|way in)$/.test(w)) {
    const tgt = rel ? rel[2] : w, t = /^(?:the\s+)?(?:main\s+)?(?:entrance|entry|way in|driveway|front gate|gate)$/.test(tgt) ? (S.entrancesOf(plan.elements || []).find(e => e.entry === 'main' || /main/i.test(e.name || '')) || S.entrancesOf(plan.elements || [])[0]) : findOne(plan, tgt, sel);
    if (!t) return null;
    if (rel && /^(?:behind|in front of)$/.test(rel[1])) { const c = f.to(S.centroid(S.shapeOf(t))), [, d0] = sizeOf(t), [, d1] = sizeOf(piece), dy = (d0 / 2 + d1 / 2 + 25) * (rel[1] === 'behind' ? 1 : -1); return [Math.round(c[0]), Math.round(c[1] + dy)]; }
    return { with: t.id };
  }
  const cp = /^(north|south|east|west|northeast|northwest|southeast|southwest)(?:ern)?(?:\s+(?:side|end|edge|part))?(?:\s+of the (?:site|lot|property))?$/.exec(w);
  if (cp) { const v = COMPASS[cp[1]], C = S.centroid(plan.ring), r = plan.ring, ext = Math.max(...r.map(p => (p[0] - C[0]) * v[0] + (p[1] - C[1]) * v[1])) / Math.hypot(...v), sb = Math.max(...Object.values({ ...S.SETBACKS, ...(plan.setbacks || {}) }).filter(Number.isFinite)), [pw, pd] = sizeOf(piece), k = Math.max(0, ext - sb - Math.max(pw, pd) / 2 - 15) / Math.hypot(...v);
    return f.to([C[0] + v[0] * k, C[1] + v[1] * k]).map(Math.round); }
  const at = ED.placeAt(plan, w); return at ? at.map(Math.round) : null;
}

// ---------- clauses ----------
const VERBS = '(?:move|put|place|shift|slide|relocate|bring|make|add|remove|delete|drop|cut|swap|replace|change|set|angle|keep|lock|unlock|pin|don\'?t|do not|reduce|increase|bump|turn|rotate|give|use|fix|widen|shrink|enlarge|expand|lower|raise|lose|get rid|take|front|rear|side|second|another|go|convert|double|halve|scale|push|leave|hold|need|want|more|less|fewer|straighten|rename|call|name|re-?fit|re-?lay)';
export function splitClauses(t) {
  return String(t || '').split(new RegExp('\\s*(?:[.;!]\\s+|[.;!]$|,?\\s+(?:and\\s+)?then\\s+|,\\s*(?:and\\s+)?(?=' + VERBS + '\\b)|\\s+and\\s+(?:also\\s+)?(?=' + VERBS + '\\b)|\\s+also\\s+|\\s+plus\\s+)\\s*', 'i')).map(x => x.trim().replace(/^(?:and|also|then|please|pls|can you|could you|i want to|i'd like to|let's|lets)\s+/i, '').trim()).filter(x => x && /[a-z]/.test(x));
}
const BIG = ['pond', 'hotel', 'retail', 'restaurant', 'industrial', 'office', 'multifamily', 'townhomes', 'duplex', 'parking', 'truck court', 'buildings'];
const SUBJ_OF = e => e.kind === 'pond' ? 'pond' : e.kind === 'pool' ? 'pool' : e.kind === 'play' ? 'playground' : e.kind === 'court' ? 'courts' : /dog/i.test(e.name || '') ? 'dog park' : e.kind === 'building' && e.use === 'amenity' ? 'clubhouse' : e.kind === 'building' ? e.use : null;
const ADD_KIND = [[/^dog\s*(?:park|run)$/, { kind: 'green', name: 'Dog park', w: 90, d: 70 }], [/^play\s?(?:ground|area)$|^tot lot$/, { kind: 'play', name: 'Playground', w: 64, d: 48 }], [/^(?:swimming\s+)?pool$/, { kind: 'pool', w: 60, d: 30 }],
  [/^(?:(\d+)\s+)?(?:(pickleball|tennis|basketball|sport)\s+)?courts?$/, { kind: 'court' }], [/^(?:park|lawn|green|open space|pocket park|garden)$/, { kind: 'green', name: 'Park', w: 120, d: 90 }],
  [/^(?:club\s?house|amenity(?: building| center)?|community (?:center|building))$/, { kind: 'building', use: 'amenity', name: 'Clubhouse', w: 80, d: 50, floors: 1 }]];
const NEW_READ = () => ({ locks: [], settings: {}, program: {}, parking: {}, placements: [], ops: [], adds: [], scale: [], mix: null, names: null, refit: false, said: [], unclear: [], rest: [] });
const say = (R, t) => { if (!R.said.includes(t)) R.said.push(t); };
const numOf = s => { s = String(s || '').replace(/,/g, ''); return NUMW[s] ?? (Number.isFinite(+s) ? +s : null); };

// the words read: a READ (above). sel: the selected piece's id ("it", "this")
export function readEdit(words, plan, { sel = null } = {}) {
  const R = NEW_READ(), raw = String(words || ''), t0 = tidyEdit(raw).replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|forty|fifty)\b(?=\s*(?:-|\s)?\s*(?:more|stor|floor|units?|spaces?|stalls?|keys?|rooms?|ft|feet|percent|%|new|extra|additional|guest|parking))/g, w => NUMW[w]);
  if (!t0) return R;
  const els = plan.elements || [], use0 = mainUseOf(plan), homes = ['multifamily', 'townhomes', 'duplex', 'sfr'], removed = [];
  const m0 = (() => { try { return S.metrics(plan); } catch (e) { return {}; } })();
  for (let c of splitClauses(t0)) {
    const c0 = c; let m, hit = false;
    const done = () => { hit = true; };
    // locks: "keep building 1 where it is", "lock the clubhouse and pool", "don't touch the retail", "leave the hotel alone"
    if ((m = /^(?:keep|lock|pin|freeze|hold|leave|don'?t (?:touch|move|change)|do not (?:touch|move|change))\s+(.+?)(?:\s+(?:exactly\s+)?(?:where (?:it|they) (?:is|are)(?: now)?|in place|as (?:it|they) (?:is|are)|alone|untouched|fixed|unchanged|put|the same))?$/.exec(c)) && !/\b\d+\s*(?:ft|feet)\b|\bfrom the\b|\bunits?\b|\bopen\b|\bclear\b|\bcount\b/.test(m[1])) {
      const names = m[1].split(/\s*(?:,|\band\b|&)\s*/).filter(Boolean), got = names.map(x => findPieces(plan, x, sel));
      if (got.length && got.every(g => g.length)) { for (const g of got) for (const e of g) if (!R.locks.some(l => l.id === e.id)) R.locks.push({ id: e.id, lock: true, name: ED.labelOf(e) }); say(R, 'Locked ' + got.flat().map(e => ED.labelOf(e)).filter((v, i, a) => a.indexOf(v) === i).slice(0, 6).join(', ')); continue; }
    }
    if ((m = /^(?:unlock|unpin|free up|let go of)\s+(.+)$/.exec(c))) { const got = m[1].split(/\s*(?:,|\band\b)\s*/).flatMap(x => findPieces(plan, x, sel)); if (got.length) { for (const e of got) R.locks.push({ id: e.id, lock: false, name: ED.labelOf(e) }); continue; } }
    // settings: setbacks, parking ratio and angle, entrances (lib/mcp/plans.mjs withSettings)
    { const S0 = settingsFromWords(c); if (Object.keys(S0.set).length) { for (const [k, v] of Object.entries(S0.set)) R.settings[k] = k === 'setbacks' ? { ...(R.settings.setbacks || {}), ...v } : v; c = S0.rest; hit = true; say(R, 'Settings: ' + JSON.stringify(S0.set).replace(/[{}"]/g, '').replace(/,/g, ', ')); if (!c || !/[a-z]{3}/.test(c.replace(/\b(?:and|the|parking|ft|feet)\b/g, ''))) continue; } }
    // a buffer: "keep all buildings 60 ft from the west property line", "nothing within 50 ft of the north line"
    { const P = I.placementsFromWords(c).filter(p => p.rel === 'away' || p.rel === 'keep' || p.rel === 'edge' && p.subject !== 'entrance'); if (P.length && /\b\d+\s*ft\b|\bbuffer\b/.test(c)) { R.placements.push(...P); say(R, 'Kept clear: ' + P.map(I.describe).join('; ')); continue; } }
    // parking: more spaces, behind / in front of the buildings, fix it
    if ((m = /\b(?:add|need|want|give (?:it|us)|with)\s+(?:about\s+|around\s+|another\s+|roughly\s+|~\s*)?(\d+)\s+(?:more\s+|extra\s+|additional\s+|guest\s+|new\s+)*(?:parking\s+)?(?:spaces|stalls|parking spots|cars)\b|\b(\d+)\s+more\s+(?:parking\s+)?(?:spaces|stalls)\b|\b(?:about|around)\s+(\d+)\s+more\s+(?:parking\s+)?(?:spaces|stalls)\b/.exec(c))) { R.parking.add = +(m[1] || m[2] || m[3]); say(R, 'Parking: ' + R.parking.add + ' more spaces'); continue; }
    if (/\b(?:more|extra|additional|guest)\s+parking\b|\bparking\b.*\b(?:more|bigger|larger)\b|\bneeds?\s+more\s+(?:parking|spaces)\b|\bnot enough (?:parking|spaces)\b/.test(c) && !/\bless\b|\bfewer\b/.test(c)) { R.parking.more = true; say(R, 'Parking: more spaces'); continue; }
    if (/\bfix\b.*\bparking\b|\bparking\b.*\b(?:doesn'?t|does not|isn'?t|is not)\s+work|\bparking\b.*\b(?:short|broken|wrong|bad|off)\b|\b(?:short on|not enough)\s+parking\b|\bparking (?:is )?(?:a mess|messed up)\b/.test(c)) { R.parking.fix = true; say(R, 'Parking: laid out to meet the count'); continue; }
    if (/\bparking\b/.test(c) && /\b(?:behind|in front of|before|in back|at the back|at the rear|to the back|to the rear|to the front|at the front|out front|along the street)\b/.test(c) && !/\bpool|clubhouse|pond\b/.test(c)) {
      const back = /\b(?:behind|in back|at the back|at the rear|to the back|to the rear)\b/.test(c); R.placements.push({ id: 'pk' + R.placements.length, subject: 'parking', rel: back ? 'behind' : 'before', target: 'buildings', text: c }); R.parking.place = back ? 'behind' : 'front'; say(R, 'Parking ' + (back ? 'behind' : 'in front of') + ' the buildings'); continue; }
    // the program: counts, sizes, keys, stories, one use for another, density
    if ((m = /\b(?:add|another|plus|with)\s+(?:about\s+|around\s+|roughly\s+|~\s*)?(\d+)\s+(?:more\s+|extra\s+|additional\s+|new\s+)?(units|apartments|apts|homes|townhomes|townhouses|doors|keys|rooms)\b|\b(\d+)\s+more\s+(units|apartments|homes|townhomes|doors|keys|rooms)\b/.exec(c))) {
      const n = +(m[1] || m[3]), what = m[2] || m[4]; if (/keys|rooms/.test(what)) { R.program.keysBy = n; say(R, 'Hotel: ' + n + ' more keys'); } else { R.program.unitsBy = n; say(R, n + ' more units'); } continue; }
    if ((m = /\b(?:make|cut|reduce|drop|lower|bring|take|trim|set|change|increase|bump|raise|go|limit|cap)\b.*?\b(?:to|at|down to|up to|about|around)\s+(?:about\s+|around\s+|roughly\s+|~\s*)?(\d+)\s*(units|apartments|apts|homes|townhomes|townhouses|doors|keys|rooms)\b|^(?:about|around|only|just)?\s*(\d+)\s+(units|apartments|homes|townhomes|keys|rooms)(?:\s+total)?$|\b(?:fewer|less|more)\s+(?:units|apartments|homes|townhomes|townhouses)\b[^\d]*?(\d+)\b(?!\s*(?:ft|%|sf|stor|floor))|\bmake\s+(?:the\s+)?hotel\s+(?:a\s+)?(\d+)[- ]?(keys?|rooms?)\b/.exec(c))) {
      const n = +(m[1] || m[3] || m[5] || m[6]), what = m[2] || m[4] || m[7] || 'units'; if (/key|room/.test(what)) { R.program.keys = n; say(R, 'Hotel: ' + n + ' keys'); } else { R.program.units = n; say(R, n + ' units'); } continue; }
    if ((m = /\b(?:the\s+)?(retail|shops?|stores?|shopping center|office|offices|warehouse|industrial|distribution|hotel|restaurants?)(?:\s+(?:building|space|center|area|portion|square footage|sf))?\b.*?\b(?:to|at|down to|up to|about|around|of|by)?\s*(?:about\s+|around\s+|~\s*)?(\d{4,7})\s*sf\b|\b(?:make|set|cut|drop|grow|increase|reduce|shrink|bring)\s+(?:it|this|the\s+building)\s+(?:to\s+)?(\d{4,7})\s*sf\b/.exec(c)) && !/\badd\b/.test(c)) {
      const n = +(m[2] || m[3]), u = m[1] ? (/retail|shop|store|shopping/.test(m[1]) ? 'retail' : /office/.test(m[1]) ? 'office' : /hotel/.test(m[1]) ? 'hotel' : /restaurant/.test(m[1]) ? 'restaurant' : 'industrial') : use0;
      R.program.gfa = { ...(R.program.gfa || {}), [u]: n }; say(R, (S.USES[u]?.label || u) + ': ' + n0(n) + ' sf'); continue; }
    if ((m = /^(?:make|turn|build|go|change|set|bump|raise|lower|drop|bring)\s+(?:it|everything|the whole (?:thing|site|plan)|the (?:site|plan|project)|all(?: of)?(?: the)? (?:buildings|apartments|apartment buildings|townhomes|units)|the (?:apartments|apartment buildings|buildings|townhomes|townhouses|duplexes))\s+(?:up\s+|down\s+)?(?:to\s+)?(\d+)[- ]?(?:stor(?:y|ies|eys?)|floors?|levels?)\b|^(\d+)[- ]?(?:stor(?:y|ies)|floors?)(?:\s+(?:everywhere|across the (?:site|board)|throughout))?$|^(?:go\s+)?(\d+)\s+stor(?:y|ies)\s+(?:on\s+)?(?:everything|all)/.exec(c))) {
      const n = +(m[1] || m[2] || m[3]), w = /townhome|townhouse/.test(c) ? 'townhomes' : /duplex/.test(c) ? 'duplex' : use0; if (w === 'townhomes' || w === 'duplex' || !homes.includes(w) && w !== 'multifamily') { R.ops.push({ action: 'change', every: w, floors: n }); say(R, 'All the ' + (S.USES[w]?.label || w).toLowerCase() + ' buildings ' + n + ' stories'); continue; } R.program.floors = { ...(R.program.floors || {}), [w]: n }; say(R, 'All the ' + (S.USES[w]?.label || w).toLowerCase() + ' buildings ' + n + ' stories'); continue; }
    if ((m = /^(?:swap|replace|change|turn|convert|switch|make)\s+(?:all\s+)?(?:the\s+)?(townhomes?|townhouses?|apartments?|duplexes|duplex|cottages|houses|homes|retail|offices?)\s+(?:for|with|into|to|over to)\s+(?:a\s+)?(townhomes?|townhouses?|apartments?|duplexes|duplex|cottages|houses|single[- ]family homes|retail|offices?)$/.exec(c))) {
      const U = w => /town/.test(w) ? 'townhomes' : /apart/.test(w) ? 'multifamily' : /duplex|cottage/.test(w) ? 'duplex' : /house|single|home/.test(w) ? 'sfr' : /office/.test(w) ? 'office' : 'retail', a = U(m[1]), b = U(m[2]);
      if (a !== b) { R.program.swapUse = { from: a, to: b }; say(R, (S.USES[a]?.label || a) + ' → ' + (S.USES[b]?.label || b).toLowerCase()); continue; } }
    if (/\b(?:denser|more dense|densify|more density|higher density|max(?:imize)? (?:the )?(?:density|units|yield)|pack (?:it|more|them)|squeeze (?:in )?more|more units|as many (?:units|as (?:fit|possible))|fit more)\b/.test(c) && !/\bless\b|\bnot\b/.test(c)) { R.program.density = 'more'; say(R, 'Denser'); continue; }
    if (/\b(?:less dense|lower density|less density|less crowded|less cramped|too dense|too crowded|too tight|too packed|back (?:it|that) off|fewer (?:units|buildings|apartments|homes)|more spacious|more breathing room|breathing room|spread (?:it|things|them) out|thin (?:it|them) out|tone (?:it )?down|scale (?:it )?back|feel(?:s)? (?:less crowded|more open|roomier))\b/.test(c)) { R.program.density = 'less'; say(R, 'Less dense'); continue; }
    if (/\b(?:more|bigger|larger|extra)\s+(?:open space|green ?space|green|park(?:land)?|landscap(?:e|ing)|room to breathe)\b|\bopen (?:it|things) up\b/.test(c)) { R.program.open = 'more'; say(R, 'More open space'); continue; }
    if (/\b(?:use|fill|build (?:on|out))\s+(?:more of|all of|the rest of|the whole|the entire|out)\s+(?:the\s+)?(?:site|land|lot|property)\b|\bbuild (?:it )?out\b|\bfill (?:it|the site|the land) (?:up|out)?\b|\bunused land\b|\bempty land\b/.test(c)) { R.program.fill = true; say(R, 'Use more of the site'); continue; }
    if (/\bmore amenit(?:y|ies)\b|\badd (?:some )?amenit(?:y|ies)\b|\bbetter amenit(?:y|ies)\b/.test(c)) {
      const has = k => els.some(e => k === 'play' ? e.kind === 'play' : k === 'dog' ? /dog/i.test(e.name || '') : e.kind === k), club = els.find(e => e.kind === 'building' && e.use === 'amenity'), list = [['play', { kind: 'play', name: 'Playground' }], ['dog', { kind: 'green', name: 'Dog park', w: 90, d: 70 }], ['court', { kind: 'court', sport: 'pickleball', courts: 2 }], ['pool', { kind: 'pool', w: 60, d: 30 }]].filter(([k]) => !has(k)).slice(0, 2);
      for (const [, o] of (list.length ? list : [['court', { kind: 'court', sport: 'pickleball', courts: 2 }]])) R.ops.push({ action: 'add', ...o, ...(club ? { with: club.id } : spotXY(plan, 'middle')) });
      say(R, 'More amenities: ' + (list.length ? list.map(([k]) => ({ play: 'a playground', dog: 'a dog park', court: 'courts', pool: 'a pool' })[k]).join(' and ') : 'courts')); continue; }
    // stories on one building: "make building 7 four stories", "make the hotel 5 stories", "bldg 7 4 story"
    if ((m = /^(?:make|turn|change|set|bump|raise|lower|drop|go)?\s*(?:the\s+)?(.+?)\s+(?:up\s+|down\s+)?(?:to\s+)?(?:a\s+)?(\d+)[- ]?(?:stor(?:y|ies|eys?)|floors?|levels?)\b/.exec(c))) {
      const P = findPieces(plan, m[1], sel).filter(e => e.kind === 'building'), n = +m[2];
      if (P.length) { if (P.length > 1 && P.every(e => e.use === P[0].use) && P.length === els.filter(e => e.kind === 'building' && e.use === P[0].use).length) R.ops.push({ action: 'change', every: P[0].use, floors: n }); else for (const e of P) R.ops.push({ action: 'change', target: e.id, floors: n }); say(R, P.length === 1 ? ED.labelOf(P[0]) + ' ' + n + ' stories' : 'All the ' + (S.USES[P[0].use]?.label || P[0].use).toLowerCase() + ' buildings ' + n + ' stories'); continue; }
    }
    // bigger / smaller: "bigger pond", "make the pond 30% bigger", "a smaller pool"
    if ((m = /^(?:make\s+)?(?:the\s+)?(?:(bigger|larger|smaller|wider)\s+(.+)|(.+?)\s+(?:(\d+)\s*%\s*)?(bigger|larger|smaller|wider))$/.exec(c))) {
      const word = m[1] || m[5], what = m[2] || m[3], pct = +m[4] || 25, P = findPieces(plan, what, sel);
      if (P.length) { const by = /smaller/.test(word) ? 1 / (1 + pct / 100) : 1 + pct / 100; for (const e of P.slice(0, 4)) R.scale.push({ id: e.id, by }); say(R, ED.labelOf(P[0]) + ' ' + Math.round(Math.abs(by - 1) * 100) + '% ' + (by > 1 ? 'bigger' : 'smaller')); continue; }
    }
    // moves: by feet in a compass direction, or to a place
    if ((m = /^(?:move|shift|slide|push|nudge|bump)\s+(.+?)\s+(?:(\d+)\s*ft\s+)?(?:to the\s+)?(north|south|east|west|northeast|northwest|southeast|southwest|left|right|back|forward|toward the street|away from the street|up|down)(?:ward)?(?:\s+(?:by\s+)?(?:about\s+)?(\d+)\s*ft)?$/.exec(c)) && (m[2] || m[4])) {
      const P = findPieces(plan, m[1], sel), ft = +(m[2] || m[4]); if (P.length === 1) { const e = P[0], f = ED.sheetFrame(plan), c1 = S.centroid(S.shapeOf(e)), v = { left: [-1, 0], right: [1, 0], back: [0, 1], up: [0, 1], 'away from the street': [0, 1], forward: [0, -1], down: [0, -1], 'toward the street': [0, -1] }[m[3]];
        let to; if (v) { const q = f.to(c1); to = [q[0] + v[0] * ft, q[1] + v[1] * ft]; } else { const d = COMPASS[m[3]], L = Math.hypot(...d); to = f.to([c1[0] + d[0] / L * ft, c1[1] + d[1] / L * ft]); }
        R.ops.push({ action: 'move', target: e.id, x: +to[0].toFixed(1), y: +to[1].toFixed(1), exact: true }); say(R, 'Moved ' + ED.labelOf(e) + ' ' + ft + ' ft ' + m[3]); continue; } }
    if ((m = /^(?:move|put|place|relocate|bring|shift|slide|push|locate|set)\s+(.+?)\s+((?:to|into|in|at|on|toward|towards|by|near|next to|beside|behind|in front of|alongside|across from)\s+.+)$/.exec(c))) {
      const subj = m[1].replace(/\s+(?:over|back|out)$/, ''), place = m[2].replace(/^(?:to|toward|towards)\s+(?=(?:by|near|next to|beside|behind|in front of)\b)/, ''), P = findPieces(plan, subj, sel);
      const S1 = P.length ? SUBJ_OF(P[0]) : null, many = P.length > 1;
      if (P.length && (BIG.includes(S1) || many && P[0].kind === 'building') && !/\b(?:next to|beside|by|near)\b/.test(place)) { // a big piece or a use's buildings: a place the engine steers, laid out again
        const pl = I.placementsFromWords('the ' + (S1 === 'multifamily' ? 'apartments' : S1 === 'industrial' ? 'warehouse' : S1) + ' ' + place.replace(/^to\s+/, 'in ').replace(/^in the center$/, 'in the middle'), [S1]).filter(p => p.subject === S1 || S1 === 'multifamily' && p.subject === 'multifamily');
        const pl2 = pl.length ? pl : /\bfront\b/.test(place) ? [{ subject: S1, rel: 'front' }] : /\b(?:back|rear)\b/.test(place) ? [{ subject: S1, rel: 'back' }] : /\b(?:center|middle)\b/.test(place) ? [{ subject: S1, rel: 'middle' }] : [];
        if (pl2.length) { R.placements.push(...pl2.map((p, i) => ({ id: 'mv' + R.placements.length + i, ...p, text: c }))); say(R, 'Placed: ' + pl2.map(p => I.describe({ ...p, text: '' })).join('; ')); continue; } }
      if (P.length === 1 || P.length > 1 && P.every(e => e.kind !== 'building')) { const e = P[0], to = spotFor(plan, place, e, sel, removed.at(-1));
        if (to) { R.ops.push({ action: 'move', target: e.id, ...(Array.isArray(to) ? { x: to[0], y: to[1] } : { with: to.with }) }); say(R, 'Moved ' + ED.labelOf(e) + ' ' + place); continue; } }
    }
    // adds: amenities at a place ("add a dog park in the corner", "a playground next to the clubhouse", "pickleball courts behind the clubhouse")
    if ((m = /^(?:add|put|place|build|include|give (?:it|us|them)|we need|need|want|i want)\s+(?:in\s+)?(?:a|an|another|some|one|two|2|new|second|more)?\s*(?:new\s+|small\s+|big\s+|large\s+)?(dog\s*(?:park|run)|play\s?(?:ground|area)|tot lot|(?:swimming\s+)?pool|(?:\d+\s+)?(?:pickleball\s+|tennis\s+|basketball\s+|sport\s+)?courts?|park|lawn|green|open space|pocket park|garden|club\s?house|amenity(?: building| center)?|community (?:center|building))\b(?:\s+(?:and|&)\s+(?:a\s+)?(club\s?house|pool|playground|dog park))?\s*(.*)$/.exec(c))) {
      const kinds = [m[1], m[2]].filter(Boolean), where = (m[3] || '').trim(); let any = false;
      for (const k of kinds) { const spec = ADD_KIND.find(([re]) => re.test(k.trim())); if (!spec) continue; const o = { ...spec[1] }; const cm = /^(?:(\d+)\s+)?(?:(pickleball|tennis|basketball|sport)\s+)?courts?$/.exec(k.trim()); if (cm) Object.assign(o, { sport: cm[2] && cm[2] !== 'sport' ? cm[2] : 'pickleball', ...(cm[1] ? { courts: +cm[1] } : {}) });
        const size = o.kind === 'court' ? [128, 120] : [o.w || 80, o.d || 60], to = where ? spotFor(plan, where, { id: '_new', w: size[0], d: size[1] }, sel, removed.at(-1)) : null, near = !to ? (els.find(e => e.kind === 'building' && e.use === 'amenity') || null) : null;
        const pos = to ? (Array.isArray(to) ? { x: to[0], y: to[1] } : { with: to.with }) : near ? { with: near.id } : spotXY(plan, 'middle');
        R.ops.push({ action: 'add', ...o, ...pos }); any = true; }
      if (any) { say(R, 'Added ' + kinds.join(' and ') + (where ? ' ' + where : '')); continue; } }
    { const T = typeAddsFromWords(c); if (T.adds.length) { R.adds.push(...T.adds); say(R, 'Added ' + T.adds.map(a => a.btype + (a.keys ? ' (' + a.keys + ' keys)' : a.gfa ? ' (' + n0(a.gfa) + ' sf)' : '')).join(', ')); if (!T.rest || !/[a-z]{3}/.test(T.rest)) continue; c = T.rest; hit = true; } }
    // removes: "remove building 2", "rmv bldg 2 & bldg 5", "get rid of the dog park", "take out the playground"
    if ((m = /^(?:remove|delete|take out|take away|get rid of|lose|drop|eliminate|cut|kill|no)\s+(?:the\s+)?(.+)$/.exec(c)) && !/\bto\s+\d|\bdown\b|\b\d+\s*(?:sf|units|keys|%)\b/.test(m[1])) {
      const names = m[1].split(/\s*(?:,|\band\b|&)\s*/).filter(Boolean), got = names.map(x => findPieces(plan, x, sel));
      if (got.length && got.every(g => g.length)) { for (const g of got) { const one = g.length > 1 && !/s$|^all\b|^every\b/.test(names[got.indexOf(g)]) ? [g[0]] : g; for (const e of one) { R.ops.push({ action: 'remove', target: e.id }); removed.push(e); } } say(R, 'Removed ' + got.flat().slice(0, 6).map(e => ED.labelOf(e)).join(', ')); continue; } }
    // swaps of two pieces: "swap the hotel and the retail building"
    if ((m = /^(?:swap|switch|trade|flip)\s+(?:the\s+)?(.+?)\s+(?:and|with|for)\s+(?:the\s+)?(.+?)(?:\s+(?:around|places|spots))?$/.exec(c))) { const a = findOne(plan, m[1], sel), b = findOne(plan, m[2], sel); if (a && b && a.id !== b.id) { R.ops.push({ action: 'swap', target: a.id, with: b.id }); say(R, 'Swapped ' + ED.labelOf(a) + ' and ' + ED.labelOf(b)); continue; } }
    // the rest: the editor's plain reading (entrances, roundabouts, turns, renames, a type…), the home mix and names
    { const nm = ED.guessNames(c, plan, sel); if (nm) { R.names = { community: nm.community ?? R.names?.community ?? null, parts: [...(R.names?.parts || []), ...nm.parts] }; say(R, 'Names'); if (!nm.rest) continue; c = nm.rest; hit = true; } }
    { const mx = ED.guessMix(c, plan); if (mx) { R.mix = mx; say(R, 'Home mix: ' + ED.mixText(mx)); continue; } }
    { const ent = /^(?:a\s+|an\s+)?(?:second|2nd|another|new|extra|additional|one more)\s+(?:boulevard\s+)?(?:entrance|entry|driveway|curb cut|way in)\b/.test(c) ? 'add ' + c : c, ops = ED.guessEdits(ent.replace(/\b(?:on|along|from|at)\s+the\s+(north|south|east|west)(?:ern)?\s+(?:side|line|edge|lot line|property line)\b/, 'off the $1 street'), plan, sel); if (ops.length) { R.ops.push(...ops.map(o => compassEntrance(plan, o, c))); say(R, 'Read: ' + c); continue; } }
    if (/\bre-?(?:fit|lay)\b/.test(c)) { R.refit = true; continue; }
    if (!hit) R.rest.push(c0); else if (c && /[a-z]{3}/.test(c)) R.rest.push(c);
  }
  if (R.rest.length) R.unclear.push('Not read: “' + R.rest.join('”, “') + '”.');
  return R;
}
const spotXY = (plan, w) => { const at = ED.placeAt(plan, w); return at ? { x: Math.round(at[0]), y: Math.round(at[1]) } : {}; };
// "an entrance on the east side": a way in on that lot line (the middle of the line facing that way; it becomes a street)
function compassEntrance(plan, o, c) {
  if (o.action !== 'add' || o.kind !== 'entrance' || o.x != null || o.with) return o;
  const cp = /\b(north|south|east|west)(?:ern)?\b/.exec(c)?.[1], side = /\bside street\b/.test(c); if (!cp && !side) return o;
  const r = plan.ring, C = S.centroid(r), f = ED.sheetFrame(plan); let best = null;
  for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], v = cp ? COMPASS[cp] : null, dir = [mid[0] - C[0], mid[1] - C[1]], L = Math.hypot(...dir) || 1;
    const s = cp ? (dir[0] * v[0] + dir[1] * v[1]) / L : (plan.streets || []).includes(i) && i !== plan.front ? 1 : -1; if (!best || s > best.s) best = { s, mid }; }
  return best && best.s > 0.5 ? { ...o, ...(q => ({ x: Math.round(q[0]), y: Math.round(q[1]) }))(f.to(best.mid)) } : o;
}

// ---------- the AI's answer as a READ ----------
// answer: api/siteplan.js edit's reply { ops, homeMix, names, streetNames, refit, whole, locks }
export function fromAI(d, plan) {
  const R = NEW_READ(); if (!d || typeof d !== 'object') return R;
  const ids = new Set((plan.elements || []).map(e => e.id)), W = d.whole && typeof d.whole === 'object' ? d.whole : {}, num = (v, lo, hi) => v != null && Number.isFinite(+v) && +v >= lo && +v <= hi ? +v : null;
  R.ops = (d.ops || []).filter(o => o && typeof o === 'object');
  R.mix = d.homeMix?.length ? d.homeMix : null; R.names = d.names?.community || d.names?.parts?.length ? d.names : null; R.refit = d.refit === 'full'; if (d.streetNames) R.streetNames = d.streetNames;
  for (const id of Array.isArray(d.locks) ? d.locks : []) if (ids.has(id)) { const e = plan.elements.find(x => x.id === id); R.locks.push({ id, lock: true, name: ED.labelOf(e) }); }
  if (num(W.units, 1, 5000) != null) R.program.units = Math.round(W.units); if (num(W.addUnits, -5000, 5000)) R.program.unitsBy = Math.round(W.addUnits);
  if (num(W.keys, 1, 3000) != null) R.program.keys = Math.round(W.keys);
  if (num(W.floors, 1, 60) != null) R.program.floors = { [mainUseOf(plan)]: Math.round(W.floors) };
  if (W.gfaUse && num(W.gfa, 500, 5e6) != null) R.program.gfa = { [W.gfaUse === 'restaurant' ? 'restaurant' : W.gfaUse]: Math.round(W.gfa) };
  if (W.swapFrom && W.swapTo && W.swapFrom !== W.swapTo && S.USES[W.swapFrom] && S.USES[W.swapTo]) R.program.swapUse = { from: W.swapFrom, to: W.swapTo };
  if (W.density === 'more' || W.density === 'less') R.program.density = W.density; if (W.openSpace === true) R.program.open = 'more'; if (W.useMoreLand === true) R.program.fill = true;
  const sb = W.setbacks && typeof W.setbacks === 'object' ? Object.fromEntries(['front', 'side', 'rear'].filter(k => num(W.setbacks[k], 0, 500) != null).map(k => [k, +W.setbacks[k]])) : {}; if (Object.keys(sb).length) R.settings.setbacks = sb;
  if (num(W.parkingPerUnit, 0.2, 4) != null) R.settings.parking_per_unit = +W.parkingPerUnit; if (num(W.parkingPer1000, 0.5, 30) != null) R.settings.parking_per_1000 = +W.parkingPer1000;
  if ([45, 60, 90].includes(+W.parkingAngle)) R.settings.parking_angle = +W.parkingAngle;
  if (num(W.addSpaces, 1, 3000) != null) R.parking.add = Math.round(W.addSpaces); if (W.fixParking === true) R.parking.fix = true;
  if (W.parkingPlace === 'behind' || W.parkingPlace === 'front') { R.parking.place = W.parkingPlace; R.placements.push({ id: 'aipk', subject: 'parking', rel: W.parkingPlace === 'behind' ? 'behind' : 'before', target: 'buildings', text: 'parking ' + W.parkingPlace }); }
  for (const p of Array.isArray(W.places) ? W.places : []) { const q = I.cleanPlacement({ ...p, id: 'ai' + R.placements.length }); if (q && BIG.concat(['pond']).includes(q.subject)) R.placements.push(q); }
  if (d.summary) R.said.push(d.summary);
  return R;
}
// the words' reading and the AI's together: what the words read stands (their numbers, places and pieces); the AI fills what
// the words left (the clauses they couldn't read). An AI op on a piece the words already changed, or one doing by hand what
// the program change does (a count, the stories, a size across the plan), gives way.
export function mergeReads(W, A) {
  if (!A) return W; if (!W) return A;
  const M = { ...NEW_READ(), ...W, settings: { ...A.settings, ...W.settings }, program: { ...A.program, ...W.program }, parking: { ...A.parking, ...W.parking } };
  if (W.settings.setbacks || A.settings.setbacks) M.settings.setbacks = { ...(A.settings.setbacks || {}), ...(W.settings.setbacks || {}) };
  const lockIds = new Set(W.locks.map(l => l.id)); M.locks = [...W.locks, ...A.locks.filter(l => !lockIds.has(l.id))];
  const plW = W.placements.map(p => p.subject + p.rel); M.placements = [...W.placements, ...A.placements.filter(p => !plW.includes(p.subject + p.rel) && !W.placements.some(q => q.subject === p.subject))];
  const progChange = ['units', 'unitsBy', 'floors', 'gfa', 'keys', 'keysBy', 'density', 'swapUse', 'fill'].some(k => M.program[k] != null), wordsAll = W.rest.length === 0 && (W.ops.length || W.adds.length || W.scale.length || Object.keys(W.program).length || Object.keys(W.settings).length || Object.keys(W.parking).length || W.placements.length || W.locks.length || W.mix || W.names);
  const touched = new Set(W.ops.flatMap(o => [o.target, o.action === 'swap' ? o.with : null]).filter(Boolean).concat(W.scale.map(s => s.id))), addKinds = new Set(W.ops.filter(o => o.action === 'add').map(o => o.kind + (o.name || '')).concat(W.adds.map(a => 'typed')));
  const aiOps = wordsAll ? [] : A.ops.filter(o => !(o.target && touched.has(o.target)) && !(o.action === 'add' && (addKinds.has(o.kind + (o.name || '')) || o.type && addKinds.has('typed'))) && !(progChange && o.action === 'change' && (o.floors || o.units) && !o.target)
    && !(progChange && o.action === 'change' && (o.floors || o.units)) && !(M.placements.length && o.action === 'move' && W.placements.length));
  M.ops = [...W.ops, ...aiOps]; M.adds = W.adds; M.scale = W.scale;
  M.mix = W.mix || A.mix; M.names = W.names || A.names; M.refit = W.refit || A.refit; if (A.streetNames) M.streetNames = A.streetNames;
  M.said = [...W.said, ...A.said.filter(x => !W.said.includes(x))]; M.rest = wordsAll ? [] : W.rest; M.unclear = aiOps.length || Object.keys(A.program).length || Object.keys(A.settings).length ? [] : W.unclear;
  return M;
}
// does the READ change the program or the settings (the plan laid out again)?
export const relays = R => !!(R && (Object.keys(R.settings || {}).length || ['units', 'unitsBy', 'floors', 'gfa', 'keys', 'keysBy', 'density', 'swapUse', 'fill', 'open'].some(k => R.program?.[k] != null) || R.parking?.add || R.parking?.more || R.parking?.place || R.placements?.some(p => p.subject !== 'entrance')));

// ---------- the program and settings changed (laid out again by the caller) ----------
// the plan's request for a re-lay: its counts and sizes ("as many as fit", "240 units", "40,000 sf") left out when the edit
// changes them (the program carries the new ones), its places and the rest kept
export function relayAsk(request, R) {
  const P = R?.program || {}, sized = ['units', 'unitsBy', 'gfa', 'keys', 'keysBy', 'density', 'swapUse', 'fill', 'open'].some(k => P[k] != null) || R?.parking?.fixRelay;
  if (!sized) return String(request || '');
  return String(request || '').replace(/\b(?:as many as (?:will )?(?:fit|possible|we can|it holds)|max(?:imum|imize)?(?: out)?(?: the)?(?: density| units| yield)|fill (?:the|it)(?: site| lot)?(?: up)?)\b/gi, '').replace(/\b(?:about |around |~)?\d[\d,.]*\s*(?:k\b|-?\s*(?:units?|apartments?|homes?|townhomes?|townhouses?|duplexes|keys?|rooms?|beds?)\b|sf\b|square feet|sq\.? ?ft)/gi, '').replace(/\s+,/g, ',').replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '').trim();
}
const unitsOf = (plan, uses) => (plan.elements || []).filter(e => e.kind === 'building' && uses.includes(e.use)).reduce((s, e) => s + (+e.units || 0), 0);
const gfaOfUse = (plan, uses) => (plan.elements || []).filter(e => e.kind === 'building' && uses.includes(e.use)).reduce((s, e) => s + S.gfaOf(e), 0);
export const keysOf = plan => (plan.elements || []).filter(e => e.kind === 'building' && e.use === 'hotel').reduce((s, e) => s + (+e.keys || Math.round(S.gfaOf(e) / 550)), 0); // (a hotel without its count: about 550 sf a key, as the Numbers panel reads it)
// the zone (or the program) of the plan's homes
export const homeZone = prog => { const P = prog || {}; return Array.isArray(P.zones) ? P.zones.find(z => ['multifamily', 'townhomes', 'duplex', 'sfr'].includes(z.use)) || null : ['multifamily', 'townhomes', 'duplex', 'sfr'].includes(P.use) ? P : null; };
// -> { plan (program, setbacks, params changed), did: [what changed, in words], bad: [what couldn't be], settings (for withSettings) }
export function programChange(plan, R) {
  const prog = structuredClone(plan.program || {}), params = { ...(plan.params || {}) }, did = [], bad = [], set = { ...(R.settings || {}) };
  const zones = Array.isArray(prog.zones) ? prog.zones : null, uses = zones ? zones.map(z => z.use) : [prog.use || mainUseOf(plan)], home = uses.find(u => ['multifamily', 'townhomes', 'duplex', 'sfr'].includes(u));
  const zoneOf = u => zones ? zones.find(z => z.use === u || u === 'retail' && z.use === 'restaurant' || u === 'restaurant' && z.use === 'retail') : (prog.use === u || u === 'retail' && prog.use === 'restaurant' ? prog : null);
  let m = null; try { m = S.metrics(plan); } catch (e) { m = {}; }
  const hold = () => { params.fill = false; }, units0 = home ? unitsOf(plan, [home]) || m.units || 0 : 0;
  const setUnits = (n, why) => { const z = zoneOf(home); if (!z) { bad.push('There are no homes on this plan to count.'); return; } z.units = Math.max(1, Math.round(n)); delete z.gfa; hold(); did.push(why || n0(z.units) + (home === 'multifamily' ? ' apartments' : ' homes')); };
  const P = R.program || {};
  if (P.swapUse) { const z = zoneOf(P.swapUse.from); if (!z) bad.push('There are no ' + (S.USES[P.swapUse.from]?.label || P.swapUse.from).toLowerCase() + ' on this plan.'); else { z.use = P.swapUse.to; for (const k of ['units', 'form', 'floors', 'unitW', 'homeKind', 'gfa']) delete z[k]; if (!zones) { delete prog.btype; delete prog.type; } did.push((S.USES[P.swapUse.from]?.label || P.swapUse.from) + ' → ' + (S.USES[P.swapUse.to]?.label || P.swapUse.to).toLowerCase()); } }
  if (P.units != null) setUnits(P.units);
  else if (P.unitsBy) setUnits(units0 + P.unitsBy, (P.unitsBy > 0 ? n0(P.unitsBy) + ' more' : n0(-P.unitsBy) + ' fewer') + ' units (' + n0(units0) + ' → ' + n0(units0 + P.unitsBy) + ')');
  for (const [u, n] of Object.entries(P.floors || {})) { const z = zoneOf(u) || (!zones ? prog : null); if (z) { z.floors = n; did.push((S.USES[u]?.label || u) + ' ' + n + ' stories'); } }
  for (const [u, n] of Object.entries(P.gfa || {})) { const z = zoneOf(u); if (!z) { bad.push('There is no ' + (S.USES[u]?.label || u).toLowerCase() + ' on this plan to size.'); continue; } z.gfa = n; hold(); did.push((S.USES[z.use]?.label || z.use) + ' ' + n0(n) + ' sf'); }
  if (P.keys != null || P.keysBy) { const z = zoneOf('hotel'), k0 = keysOf(plan) || 0, k = P.keys ?? k0 + P.keysBy, g0 = gfaOfUse(plan, ['hotel']); if (!z) bad.push('There is no hotel on this plan.'); else { z.gfa = Math.round(k * (k0 && g0 ? g0 / k0 : 550)); if (z.keys != null) z.keys = k; hold(); did.push('Hotel ' + n0(k) + ' keys'); } }
  if (P.density === 'more') { if (!home) { for (const z of zones || [prog]) if (z.gfa) z.gfa = Math.round(z.gfa * 1.15); delete params.fill; did.push('15% more floor area'); }
    else if (home === 'multifamily') { const z = zoneOf(home), f0 = z.floors || S.USES.multifamily.floors; if (f0 < 4) { z.floors = f0 + 1; delete z.units; delete params.fill; did.push('Denser: the apartments ' + (f0 + 1) + ' stories, as many as fit'); } else setUnits(units0 * 1.15, 'Denser: 15% more units'); }
    else { const z = zoneOf(home); delete z.units; delete params.fill; did.push('Denser: as many homes as fit'); } }
  if (P.density === 'less' || P.open === 'more') { const k = P.density === 'less' ? 0.85 : 0.9; if (home) setUnits(units0 * k, (P.density === 'less' ? 'Less dense' : 'More open space') + ': ' + n0(Math.round(units0 * k)) + ' units (was ' + n0(units0) + ')'); else { for (const z of zones || [prog]) if (z.gfa) z.gfa = Math.round(z.gfa * k); hold(); did.push((P.density === 'less' ? 'Less dense' : 'More open space') + ': ' + Math.round((1 - k) * 100) + '% less floor area'); } }
  if (P.fill) { for (const z of zones || [prog]) { delete z.gfa; delete z.units; } delete params.fill; did.push('As much as fits on the site'); }
  const Pk = R.parking || {};
  if (Pk.add || Pk.more) { const need0 = Math.max(m.required || 0, m.spaces || 0), add = Pk.add || Math.max(10, Math.round(need0 * 0.1)), units = m.units || 0, gfa = m.gfa || 0;
    if (home && units && !zones) { set.parking_per_unit = +((need0 + add) / units).toFixed(2); did.push(n0(add) + ' more parking spaces (' + set.parking_per_unit + ' a unit)'); }
    else if (gfa && !zones) { set.parking_per_1000 = +(((need0 + add) / gfa) * 1000).toFixed(2); did.push(n0(add) + ' more parking spaces (' + set.parking_per_1000 + ' a 1,000 sf)'); }
    else if (zones) bad.push('A mix of uses is parked use by use at each one’s own rule, so more spaces can’t be asked for across it here: give a ratio for one use, or add a parking garage.');
    else bad.push('Couldn’t tell what the parking is counted from on this plan.'); }
  const pl = (R.placements || []).map((p, i) => I.cleanPlacement({ ...p, id: p.id || 'e' + i })).filter(Boolean);
  if (pl.length) { prog.placements = I.mergePlacements((prog.placements || []).filter(q => !pl.some(p => p.subject === q.subject)), pl); did.push(pl.map(p => I.describe(p)).join('; ')); }
  return { plan: { ...plan, program: prog, params }, did, bad, settings: set };
}

// ---------- each thing asked, measured on the edited plan (said in the reply: done, or not met and why) ----------
export function verifyRead(R, before, after) {
  const out = [], ok = (said, good, got, why = '') => out.push({ said, ok: !!good, got, line: (good ? '✓ ' : '✗ ') + said + ': ' + (good ? 'done' : 'not met') + (got != null ? ' (' + got + ')' : '') + (good || !why ? '' : '. ' + why) });
  let m0 = {}, m1 = {}; try { m0 = S.metrics(before); m1 = S.metrics(after); } catch (e) { return out; }
  const P = R.program || {}, u0 = m0.units || 0, u1 = m1.units || 0;
  if (P.units != null) ok(n0(P.units) + ' units', Math.abs(u1 - P.units) <= Math.max(3, P.units * 0.03), n0(u1) + ' drawn', u1 < P.units ? 'That is as many as fit with the parking and setbacks.' : '');
  if (P.unitsBy) ok((P.unitsBy > 0 ? n0(P.unitsBy) + ' more' : n0(-P.unitsBy) + ' fewer') + ' units', P.unitsBy > 0 ? u1 - u0 >= P.unitsBy * 0.6 : u0 - u1 >= -P.unitsBy * 0.6, n0(u0) + ' → ' + n0(u1), 'The site holds no more at these stories with the parking they need: say “make it 4 stories” for more.');
  if (P.density === 'more') ok('Denser', u0 ? u1 >= u0 * 1.05 : (m1.gfa || 0) >= (m0.gfa || 0) * 1.05, u0 ? n0(u0) + ' → ' + n0(u1) + ' units' : n0(m0.gfa) + ' → ' + n0(m1.gfa) + ' sf', 'Nothing more fits with the parking it needs.');
  if (P.density === 'less') ok('Less dense', u0 ? u1 < u0 : (m1.gfa || 0) < (m0.gfa || 0), u0 ? n0(u0) + ' → ' + n0(u1) + ' units' : n0(m0.gfa) + ' → ' + n0(m1.gfa) + ' sf');
  if (P.open === 'more') ok('More open space', m1.green > m0.green + 0.005, Math.round(m0.green * 100) + '% → ' + Math.round(m1.green * 100) + '%');
  if (P.fill) ok('Use more of the site', (m1.gfa || 0) > (m0.gfa || 0) * 1.03 || u1 > u0, n0(m0.gfa) + ' → ' + n0(m1.gfa) + ' sf');
  for (const [u, n] of Object.entries(P.gfa || {})) { const U = u === 'retail' ? ['retail', 'restaurant'] : [u], g1 = gfaOfUse(after, U); ok((S.USES[u]?.label || u) + ' ' + n0(n) + ' sf', Math.abs(g1 - n) <= n * 0.06, n0(g1) + ' sf drawn', g1 < n ? 'That is as much as fits with its parking.' : ''); }
  if (P.keys != null || P.keysBy) { const k0 = keysOf(before), want = P.keys ?? k0 + P.keysBy, k1 = keysOf(after); ok('Hotel ' + n0(want) + ' keys', Math.abs(k1 - want) <= want * 0.08, n0(k1) + ' keys drawn'); }
  for (const [u, n] of Object.entries(P.floors || {})) { const B = (after.elements || []).filter(e => e.kind === 'building' && e.use === u); ok('The ' + (S.USES[u]?.label || u).toLowerCase() + ' buildings ' + n + ' stories', B.length && B.every(e => (e.floors || 1) === n), [...new Set(B.map(e => e.floors || 1))].join(', ') + ' stories'); }
  if (P.swapUse) { const has = (after.elements || []).some(e => e.kind === 'building' && e.use === P.swapUse.to), left = (after.elements || []).some(e => e.kind === 'building' && e.use === P.swapUse.from); ok((S.USES[P.swapUse.to]?.label || P.swapUse.to) + ' in place of the ' + (S.USES[P.swapUse.from]?.label || P.swapUse.from).toLowerCase(), has && !left); }
  const Pk = R.parking || {}, sp0 = m0.spaces || 0, sp1 = m1.spaces || 0;
  if (Pk.add) ok(n0(Pk.add) + ' more parking spaces', sp1 - sp0 >= Pk.add * 0.9, n0(sp0) + ' → ' + n0(sp1), 'No room for more without losing buildings.');
  if (Pk.more) ok('More parking', sp1 > sp0, n0(sp0) + ' → ' + n0(sp1));
  if (Pk.fix) ok('Parking meets the count', sp1 >= (m1.required || 0), n0(sp1) + ' of ' + n0(m1.required) + ' required');
  const St = R.settings || {};
  if (St.parking_angle === 45 || St.parking_angle === 60) { const rows = (after.elements || []).filter(e => e.kind === 'parking'), a = rows.filter(e => S.stallAng(e)); ok(St.parking_angle + '° angled parking', a.length > 0, a.length + ' of ' + rows.length + ' rows angled', 'This layout’s parking stays square: its arrangement doesn’t lay angled rows yet.'); }
  if (St.parking_per_unit != null && u1) ok(St.parking_per_unit + ' parking spaces a unit', sp1 >= St.parking_per_unit * u1 * 0.98, n0(sp1) + ' for ' + n0(u1) + ' units');
  if (St.parking_per_1000 != null && m1.gfa) ok(St.parking_per_1000 + ' spaces a 1,000 sf', sp1 >= m1.required * 0.98, n0(sp1) + ' of ' + n0(m1.required) + ' required', 'The parking drawn falls short of the count: lay it out again with fewer buildings, or a garage.');
  for (const [k, v] of Object.entries(St.setbacks || {})) { const idx = edgeIdxOf(after, k === 'rear' ? 'back' : k), B = (after.elements || []).filter(e => e.kind === 'building'); if (!idx.length || !B.length) continue; const dm = Math.min(...B.flatMap(e => S.shapeOf(e).map(p => Math.min(...idx.map(i => S.segDist(p, after.ring[i], after.ring[(i + 1) % after.ring.length])))))); ok(k + ' setback ' + v + ' ft', dm >= v - 0.5, 'nearest building ' + Math.round(dm) + ' ft'); }
  for (const p of R.placements || []) { if (p.subject === 'entrance') continue; let c = null; try { c = I.checkPlacement(after, after.elements || [], after.program || {}, p); } catch (e) { c = null; } if (c) ok(I.describe(p), c.status === 'pass', null, /not met/.test(c.said || '') ? String(c.said).replace(/^.*?not met[^(]*/, '').replace(/^\(|\)\.?$/g, '') : ''); }
  for (const o of (R.ops || []).filter(x => x.exact && x.action === 'move')) { const a = (before.elements || []).find(e => e.id === o.target), b = (after.elements || []).find(e => e.id === o.target); if (!a || !b) continue;
    const f = ED.sheetFrame(after), q0 = f.to(S.centroid(S.shapeOf(a))), q1 = f.to(S.centroid(S.shapeOf(b))), want = Math.hypot(o.x - q0[0], o.y - q0[1]), got = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]);
    ok(ED.labelOf(a) + ' moved ' + Math.round(want) + ' ft', Math.hypot(q1[0] - o.x, q1[1] - o.y) <= 5, 'moved ' + Math.round(got) + ' ft', 'Farther would bring it too close to the buildings, drives or lot line beside it (the spacing between buildings and the setbacks).'); }
  for (const L of (R.locks || []).filter(l => l.lock)) { const a = (before.elements || []).find(e => e.id === L.id), b = (after.elements || []).find(e => e.id === L.id); ok(L.name + ' kept where it is', a && b && ['x', 'y', 'w', 'd', 'rot', 'floors'].every(k => (a[k] ?? null) === (b[k] ?? null))); }
  return out;
}
const outward = (r, i) => { const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, s = S.signedArea(r) > 0 ? 1 : -1; return [s * (b[1] - a[1]) / L, -s * (b[0] - a[0]) / L]; };
function edgeIdxOf(plan, e) {
  const r = plan.ring, n = r.length, nf = outward(r, plan.front); if (e === 'front') return [plan.front];
  if (e === 'back') return [...Array(n).keys()].filter(i => { const o = outward(r, i); return o[0] * nf[0] + o[1] * nf[1] < -0.7; });
  if (e === 'side') return [...Array(n).keys()].filter(i => { const o = outward(r, i); return Math.abs(o[0] * nf[0] + o[1] * nf[1]) < 0.7; });
  return [];
}
// pieces named by id on the plan before a re-lay, found again after it by their label (ops from the reading carried over)
export function retarget(ops, before, after) {
  const lab = id => { const e = (before.elements || []).find(x => x.id === id); return e ? ED.labelOf(e) : null; }, find = l => (after.elements || []).find(x => ED.labelOf(x) === l);
  return ops.map(o => { const r = { ...o }; for (const k of ['target', 'with']) if (r[k] && !(after.elements || []).some(x => x.id === r[k])) { const l = lab(r[k]), e = l && find(l); if (e) r[k] = e.id; else return null; } return r; }).filter(Boolean);
}
