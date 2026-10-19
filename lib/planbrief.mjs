// The AI's brief for a commercial site: what the AI decides is built (how many buildings and pads, their sizes and floors,
// where they sit, how the parking is arranged, where the pond goes, a rear service drive), each decision with its reason,
// handed to the parking-field engine (lib/siteparking.mjs normalizeBrief, layoutOptions' opts.brief), which lays out
// just that when it fits and otherwise the nearest layout that does, with notes on what it changed.
// Shared by api/siteplan.js (the brief made safe on the way out) and src/siteplan.js (the context the AI decides from,
// the AI's layout ranked against the engine's own on one score). No DOM, so it's tested in Node (test/planbrief.mjs).
import * as S from './siteplan.mjs';
import * as PK from './siteparking.mjs';
import * as G from './guardrails.mjs';
import { passes } from './planpick.mjs';

export const BRIEF_USES = PK.FIELD_USES;
const clip = (v, n = 200) => v == null ? '' : String(v).replace(/\s+/g, ' ').trim().slice(0, n);
const r0 = v => Math.round(+v || 0), r2 = v => Math.round((+v || 0) * 100) / 100, f0 = v => Math.round(+v || 0).toLocaleString('en-US');

// ---------- what the words already say ----------
// pad sites asked for in words: "with 2 pad sites", "an outparcel", "two pads at the street", "no pads". null when the
// words don't say; at most 4 (what the engine places along a street)
const NUM = { a: 1, an: 1, one: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, 'a couple of': 2, 'a pair of': 2, several: 3 };
export function padsFromWords(text) {
  const t = String(text || '').toLowerCase(); let n = null;
  const re = /\b(no|without|\d+|a couple of|a pair of|several|an?|one|two|three|four|five|six|single)?\s*(?:(?:restaurant|retail|qsr|coffee|fast[- ]food|drive[- ]thru|drive[- ]through|freestanding|commercial|separate)\s+)?(pad[- ]sites?|pad buildings?|pads\b|pad\b|out-?parcels?|outlots?)/g;
  for (const m of t.matchAll(re)) {
    const q = m[1] || '', what = m[2], plural = /s$/.test(what);
    if (what === 'pad' && !q) continue; // a bare "pad" (a concrete pad, a slab)
    const k = q === 'no' || q === 'without' ? 0 : /^\d+$/.test(q) ? +q : NUM[q] ?? (plural ? 2 : 1);
    n = n == null ? k : k === 0 ? n : Math.max(n, k);
  }
  return n == null ? null : Math.min(4, n);
}
// the floors the words fix ("two-story office", "one story"), else null: then the engine may go up a floor
export const floorsFromWords = text => { const t = String(text || ''), g = S.guessProgram(t); if (g.floors != null && Number.isFinite(+g.floors)) return +g.floors; return /\b(?:single|one)[- ]?(?:stor(?:y|ey)|level|floor)\b|\bground[- ]floor only\b/i.test(t) ? 1 : null; };
// what the words alone hand the engine (pads asked for), for every effort level, Low too: null when they ask nothing
export function wordsBrief(text) { const pads = padsFromWords(text); return pads ? { pads } : null; }
// a mixed-use program's pads from the words go on its first shop zone (lib/sitecompose.mjs places a zone's pads)
export function withPads(program, pads) {
  if (!pads || !program?.zones?.length) return program;
  const i = program.zones.findIndex(z => z.use === 'retail' || z.use === 'restaurant'); if (i < 0 || program.zones[i].pads != null) return program;
  return { ...program, zones: program.zones.map((z, k) => k === i ? { ...z, pads } : z) };
}
export const withWordsPads = (program, text) => withPads(program, padsFromWords(text));

// ---------- whether a brief applies ----------
// a request the AI writes a brief for: shops, restaurants, offices, medical, a hotel, a church or another commercial
// building, alone or as the commercial part of a mix
export function commercialAsk(text) {
  const g = S.guessProgram(String(text || '')), uses = [g.use, ...(g.zones || []).map(z => z.use)];
  return uses.some(u => BRIEF_USES.includes(u)) && !(g.use === 'other' && !g.zones && !/\b(commercial|building|center|centre|plaza|shops?|stores?)\b/i.test(text));
}
// whether a build asks the AI for a brief: only a level that plans first (Medium, High, Ultra: lib/planask.mjs EFFORTS
// plan), never Low (the engine alone, as it always was), and only for a commercial request. L: the effort level
export const asksBrief = (L, text) => !!L?.plan && commercialAsk(text);
// a program the engine lays a brief out on (one commercial use, no zones, no AI-crafted recipe), with the brief's own
// buildings counted (lib/sitelayout.mjs layoutOptions does the same test before it uses one)
export function takesBrief(program, brief) {
  if (!program || !brief) return false;
  return PK.inScope(S.normalizeProgram(PK.briefProgram(program, brief)), {});
}

// ---------- what the AI needs to decide well ----------
// the lot in the street's frame (as the engine sees it: the street at the bottom, left and right as seen from it), the
// setbacks, the parking rules and module, the detention the site needs (a Waller plan: the guardrails' 1.00 ac-ft per
// developed acre and the pond's footprint from that volume), the easements, and what the words already fix.
// plan: { ring, front, streets, setbacks, params, elements, program, jur }; program: the program as read so far
export function briefContext(plan, program = null, o = {}) {
  const ring = plan?.ring || []; if (ring.length < 3) return null;
  const base = { ...plan, program: program || plan.program || { use: 'retail' } }, e = G.effective(base) || base, waller = e !== base && !!e.__guard;
  const prog = S.normalizeProgram(e.program), front = plan.front != null && plan.front < ring.length ? plan.front : S.longestEdge(ring), siteSf = S.ringArea(ring), ac = siteSf / 43560;
  // the frame: the front edge's outward side down
  const n0 = S.outwardOf(ring, front), a0 = S.mainAngle(ring); let phi = a0, down = -2; for (let k = 0; k < 4; k++) { const s = S.rotPt(n0, -(a0 + k * 90)); if (-s[1] > down) { down = -s[1]; phi = a0 + k * 90; } }
  const rr = ring.map(p => S.rotPt(p, -phi)), xs = rr.map(p => p[0]), ys = rr.map(p => p[1]), X0 = Math.min(...xs), X1 = Math.max(...xs), Y0 = Math.min(...ys), Y1 = Math.max(...ys), xm = (X0 + X1) / 2;
  const rules = S.edgeRules(ring, front, e.setbacks, plan.streets), boxA = (X1 - X0) * (Y1 - Y0);
  const where = (x, y) => y < Y0 + (Y1 - Y0) * 0.33 ? (x < X0 + (X1 - X0) * 0.33 ? 'front left' : x > X1 - (X1 - X0) * 0.33 ? 'front right' : 'front') : y > Y1 - (Y1 - Y0) * 0.33 ? (x < X0 + (X1 - X0) * 0.33 ? 'back left' : x > X1 - (X1 - X0) * 0.33 ? 'back right' : 'back') : x < xm ? 'left side' : 'right side';
  const sides = ring.map((a, k) => { const b = rr[(k + 1) % rr.length], p = rr[k], mx = (p[0] + b[0]) / 2, r = rules[k];
    return { side: r.role === 'front' ? 'front' : r.role === 'rear' ? 'back' : mx < xm ? 'left side' : 'right side', lengthFt: r0(S.edgeLen(ring, k)), street: r.role === 'front' || !!r.street }; });
  const sideStreets = sides.filter((s, k) => s.street && rules[k].role !== 'front'), corner = sideStreets.some(s => s.lengthFt >= 100);
  const frontage = ring.reduce((t, _, k) => t + (rules[k].role === 'front' ? S.edgeLen(ring, k) : 0), 0);
  // parking: the module and each use's ratio (a Waller plan: with its count reserve)
  const par = e.params || {}, sw = +par.stallW || S.STALL.w, sd = +par.stallD || S.STALL.d, aw = +par.aisle || S.STALL.aisle, cf = e.__guard?.cf || 1;
  const ratios = Object.fromEntries(BRIEF_USES.map(u => [u, u === prog.use ? r2(prog.ratio) : r2((S.USES[u].ratio ?? 3) * cf)]));
  // detention: what the whole lot would need developed (a fixed program develops less; the engine sizes it to the plan)
  const sn = S.stormNeed(ac, par, prog, ac), st = { ...S.STORM, ...(par.storm || {}) };
  const sb = { ...S.SETBACKS, ...(e.setbacks || {}) };
  const keep = (e.elements || []).filter(x => x.kind === 'keepout').slice(0, 8).map(x => { const c = S.rotPt(S.centroid(S.shapeOf(x)), -phi); return { name: clip(x.name || x.note || 'Easement', 60), acres: r2(S.elArea(x) / 43560), where: where(c[0], c[1]) }; });
  const fixed = floorsFromWords(o.ask), pads = padsFromWords(o.ask);
  return {
    lot: { acres: r2(ac), siteSf: r0(siteSf), widthAlongStreetFt: r0(X1 - X0), depthFromStreetFt: r0(Y1 - Y0), streetFrontageFt: r0(frontage), shape: ring.length <= 4 && siteSf > boxA * 0.92 ? 'rectangular' : siteSf > boxA * 0.8 ? 'mostly rectangular, ' + ring.length + ' sides' : 'irregular, ' + ring.length + ' sides (' + Math.round(siteSf / boxA * 100) + '% of its bounding box)',
      corner, sideStreets: sideStreets.map(s => s.side + ' (' + s.lengthFt + ' ft)'), sides },
    setbacksFt: { buildingFront: r0(sb.front), buildingSide: r0(sb.side), buildingRear: r0(sb.rear), buildingSideStreet: r0(sb.street ?? sb.front), pavingBufferFront: r0(sb.paveFront ?? sb.paving), pavingBufferSide: r0(sb.paveSide ?? sb.paving), pavingBufferRear: r0(sb.paveRear ?? sb.paving) },
    parking: { spacesPer1000Sf: ratios, programUse: prog.use, stallFt: [sw, sd], aisleFt: aw, bayFt: 2 * sd + aw, sqFtPerSpaceWithAisles: r0(sw * (sd + aw / 2) * 1.2), accessible: 'accessible stalls are counted in (about 1 in 25)', ...(cf > 1 ? { countReserve: Math.round((cf - 1) * 100) + '% more spaces than the ratio (Waller guardrails)' } : {}) },
    detention: { approach: sn.mode, storageAcFtPerDevelopedAcre: r2(st.rate), storageDepthFt: r2(st.depth), wholeLotAcFt: r2(sn.volume), wholeLotPondAcres: r2(sn.area / 43560),
      basis: waller ? 'Waller guardrails: at least ' + (+st.rate).toFixed(2) + ' ac-ft per developed acre; acre-feet are volume, so the pond footprint is worked out from it (side slopes, freeboard, a maintenance bench)' : ac < 1 && sn.mode === 'none' ? 'under an acre: usually no on-site detention' : 'a typical Harris County figure the tool uses (' + st.rate + ' ac-ft per developed acre, ' + st.depth + ' ft deep)',
      note: 'The engine sizes the pond to the land the plan develops; a smaller program needs less.' },
    keepOuts: keep,
    asked: { pads, floors: fixed, oneStory: fixed === 1 },
    engine: { collectorDrivesFt: 26, serviceDriveFt: 26, padStripDeepFt: 81, entryStackingFt: '50-100 (more spaces, longer)', fireLaneReachFt: 150, rows: 'buildings in rows across the lot, each facing a parking field of whole bays; drives up both sides join every aisle' },
    ...(waller ? { guardrails: 'Waller guardrails are on: their values are in the instructions' } : {})
  };
}

// ---------- the AI's brief, made safe ----------
// raw: what the model returned ({ buildings: [{ use, gfa, floors, w, d, at, facing, why }], parking, pond, serviceDrive,
// pads, why: { count, parking, pond, serviceDrive, pads }, leasableSf, check }). o: { prompt, siteSf }.
// -> { brief, reasons: [{ what, why }], leasableSf, check } when it's something the engine can lay out;
//    { nonsense: 'why' } when it isn't (nothing to build, far more floor area than the lot holds); null when none came.
// Floors the words don't fix are never locked at one (or the use's usual): the engine then tries a floor more for an
// office or a medical office before it builds less. Pads the words ask for win over the brief's.
export function briefFrom(raw, o = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const b = PK.normalizeBrief(raw); if (!b) return { nonsense: 'it named nothing the engine can lay out' };
  const fixed = floorsFromWords(o.prompt), words = padsFromWords(o.prompt), uses = new Set();
  const rb = (Array.isArray(raw.buildings) ? raw.buildings : []).filter(x => x && typeof x === 'object').slice(0, 12);
  b.buildings.forEach((x, i) => { const u = x.use || o.use; if (u) uses.add(u); if (fixed == null && x.floors != null && x.floors <= (S.USES[u || 'retail']?.floors || 1)) x.floors = null; });
  if (words != null) b.pads = words;
  const sized = b.buildings.reduce((t, x) => t + (x.gfa || (x.w && x.d ? x.w * x.d * (x.floors || 1) : 0)), 0);
  if (o.siteSf > 0 && sized > o.siteSf * 2) return { nonsense: f0(sized) + ' sq ft of building on a ' + (o.siteSf / 43560).toFixed(1) + '-acre lot' };
  if (b.buildings.length > 10) return { nonsense: b.buildings.length + ' buildings' };
  const w = raw.why && typeof raw.why === 'object' ? raw.why : {}, reasons = [], add = (what, why) => { const y = clip(why, 200); if (y) reasons.push({ what: clip(what, 120), why: y }); };
  const nB = b.buildings.length; if (nB) add(nB + ' building' + (nB > 1 ? 's' : '') + (b.pads ? ' and ' + b.pads + ' pad' + (b.pads > 1 ? 's' : '') : ''), w.count);
  b.buildings.forEach((x, i) => add('Building ' + (i + 1) + ': ' + buildingWords(x, o.use), rb[i]?.why));
  if (b.parking) add('Parking ' + PARK_WORDS[b.parking], w.parking);
  if (b.pond) add(b.pond === 'none' ? 'No pond' : 'Pond at the ' + b.pond, w.pond);
  if (b.serviceDrive != null) add(b.serviceDrive ? 'A rear service drive' : 'No rear service drive', w.serviceDrive);
  if (b.pads != null) add(b.pads ? b.pads + ' pad site' + (b.pads > 1 ? 's' : '') + ' at the street' : 'No pad sites', words != null && words !== PK.normalizeBrief({ pads: raw.pads })?.pads ? 'As the request asks.' : w.pads || (words != null ? 'As the request asks.' : ''));
  return { brief: b, reasons: reasons.slice(0, 12), leasableSf: Number.isFinite(+raw.leasableSf) && +raw.leasableSf > 0 ? Math.round(+raw.leasableSf) : null, check: clip(raw.check, 300) || null };
}
const PARK_WORDS = { front: 'in front of the buildings', wrap: 'wrapping the buildings', sides: 'at the sides (rows running back from the street)', back: 'behind the buildings (they sit at the street)' };
const AT_WORDS = { front: 'at the street', back: 'at the back', middle: 'in the middle', corner: 'toward the corner', left: 'on the left', right: 'on the right' };
function buildingWords(x, use0) {
  const u = S.USES[x.use || use0]?.label?.toLowerCase() || 'building';
  return [x.gfa ? f0(x.gfa) + ' sq ft ' + u : x.w && x.d ? Math.round(x.w) + ' × ' + Math.round(x.d) + ' ft ' + u : u, x.floors ? x.floors + ' floor' + (x.floors > 1 ? 's' : '') : null, x.at ? AT_WORDS[x.at] : null, x.facing ? 'facing the ' + x.facing : null].filter(Boolean).join(', ');
}
// the brief in plain words, for the fact sheet and the card: "2 buildings: 12,000 sq ft retail at the back, …; parking in front; …"
export function briefWords(b, use0) {
  const n = PK.normalizeBrief(b); if (!n) return '';
  return [n.buildings.length ? n.buildings.length + ' building' + (n.buildings.length > 1 ? 's' : '') + ': ' + n.buildings.map(x => buildingWords(x, use0)).join('; ') : null,
    n.parking ? 'parking ' + PARK_WORDS[n.parking] : null, n.pond ? (n.pond === 'none' ? 'no pond' : 'the pond at the ' + n.pond) : null,
    n.serviceDrive != null ? (n.serviceDrive ? 'a rear service drive' : 'no rear service drive') : null, n.pads ? n.pads + ' pad site' + (n.pads > 1 ? 's' : '') : null].filter(Boolean).join('; ');
}
// a brief coming back in from the browser (to the review): the same shape, cleaned again (reasons too)
export function briefIn(v, o = {}) {
  if (!v || typeof v !== 'object') return null; const b = PK.normalizeBrief(v.brief || v); if (!b) return null;
  return { brief: b, reasons: (Array.isArray(v.reasons) ? v.reasons : []).slice(0, 12).map(r => ({ what: clip(r?.what, 120), why: clip(r?.why, 200) })).filter(r => r.why), ...(o.extra || {}) };
}

// ---------- the AI's layout among the engine's ----------
// the engine's notes on what it changed from the brief (and why)
const CHANGED = /brief|^Room for [\d,]+ of the|^No room for (?:the|a) rear service drive|^The pond is at the|^Parking in front rather|^No pond, as the brief/;
export const changedNotes = notes => (notes || []).filter(t => CHANGED.test(String(t || '')));
// the brief done as written: nothing changed, parked, every check passed (a Waller plan: its own checks too)
export const briefMet = v => !!v?.elements?.length && !changedNotes(v.notes).length && passes(v.chk) !== false;
// one score for every layout, the engine's and the AI's: the leasable floor area that parks and passes the checks.
// Parking short takes off three times the share it's short; a failed check half; detention it can't hold a quarter of
// the share it misses (it costs underground storage). A layout with nothing on it scores nothing.
export function fitScore(v) {
  const m = v?.m; if (!m || !(m.gfa > 0) || Array.isArray(v.elements) && !v.elements.length) return -Infinity;
  const lease = m.nrsf > 0 ? m.nrsf : m.gfa * 0.9, short = Math.max(0, (m.required || 0) - (m.spaces || 0));
  let s = lease;
  if (short) s -= lease * Math.min(1, short / Math.max(1, m.required)) * 3;
  else if (passes(v.chk) === false) s -= lease * 0.5;
  const det = (v.notes || []).map(t => /holds about (\d+)% of the/.exec(t)).find(Boolean); if (det) s -= lease * Math.max(0, 1 - +det[1] / 100) * 0.25;
  return s;
}
// the AI's layout put in the list where its score places it: ahead of the first of the engine's it beats outright (a tie
// goes to the engine's), else last. The ranks follow the new order. It wins nothing for being the AI's.
export function placeAi(list, ai, score = fitScore) {
  const vs = list.slice(), sa = score(ai); let at = vs.length;
  for (let i = 0; i < vs.length; i++) if (sa > score(vs[i]) + 1e-6) { at = i; break; }
  vs.splice(at, 0, ai); return vs.map((v, i) => ({ ...v, rank: -i }));
}
// the review's pick, held to the same score: the AI's own layout isn't recommended over one of the engine's that passes
// and holds clearly more (3%) of what the score counts; then the review's next pick is. -> the key to recommend
export function fairPick(list, ranking, score = fitScore) {
  const by = new Map(list.map(v => [v.key, v])), best = Math.max(-Infinity, ...list.filter(v => !v.aiBrief && passes(v.chk) !== false).map(score));
  for (const k of ranking) { const v = by.get(k); if (!v) continue; if (v.aiBrief && isFinite(best) && score(v) < best * 0.97) continue; return k; }
  return ranking[0] || null;
}
