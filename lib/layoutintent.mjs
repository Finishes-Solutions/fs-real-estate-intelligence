// What a request asks for beyond its numbers: WHERE things go ("retail along the main road with apartments behind",
// "the pool in the center", "keep the trees on the north side", "entrance off the side street"), and what to assume
// when the words leave the program open ("something that pencils on this lot", "max density").
//
//   words (or the AI's program.placements) -> placements: [{ subject, rel, edge?, target?, ft?, text }]
//   -> applyPlacements(brief): what the engine can be told (a zone's place, a strip kept open or a wider setback, the
//      resort loop round a central pool) -> lib/layoutrun.mjs: amenity pieces moved to the place asked
//      (placeAmenities), options ranked by how many asks they meet, and every ask stated in the option's notes as met,
//      or not met and why (checkPlacement). Nothing asked is ever dropped silently.
//
// The vocabulary (brief program.placements[], rei.brief/1, optional; old briefs carry none):
//   subject: a use (retail, restaurant, office, medical, hotel, church, industrial, storage, fuel, multifamily,
//            townhomes, duplex, sfr) or a piece: pool, clubhouse, playground, dog park, courts, pond, parking,
//            truck court, entrance, open space, commons, buildings
//   rel:     front | back | middle | corner | edge (near the named edge) | near (target) | behind (target, or the
//            street) | before (in front of target) | away (no building within ft of edge) | keep (open land along
//            edge or in a corner, ft deep) | facing (edge) | along (a road) | beside | between | around
//   edge:    front | back | side (a side street) | neighbours (the lines that aren't streets) | left | right (as seen
//            from the street) | north | south | east | west | northeast | northwest | southeast | southwest
// Coordinates: the brief's local plane in feet, x east and y north (so compass words are exact on any site).
import * as S from './siteplan.mjs';

export const RELS = ['front', 'back', 'middle', 'corner', 'edge', 'near', 'behind', 'before', 'away', 'keep', 'facing', 'along', 'beside', 'between', 'around'];
export const EDGES = ['front', 'back', 'side', 'neighbours', 'left', 'right', 'north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest'];
export const PIECES = ['pool', 'clubhouse', 'playground', 'dog park', 'courts', 'pond', 'parking', 'truck court', 'entrance', 'open space', 'commons', 'buildings'];
export const USE_SUBJECTS = ['retail', 'restaurant', 'office', 'medical', 'hotel', 'church', 'industrial', 'storage', 'fuel', 'multifamily', 'townhomes', 'duplex', 'sfr'];
export const SUBJECTS = [...USE_SUBJECTS, ...PIECES];
const COMPASS = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0], northeast: [0.7071, 0.7071], northwest: [-0.7071, 0.7071], southeast: [0.7071, -0.7071], southwest: [-0.7071, -0.7071] };

// ---------- words -> placements ----------
// subject words, most particular first (a "dog park" isn't a "park", "truck court" parking isn't car parking)
const SUBJ_WORDS = [
  ['dog park', /\bdog (?:parks?|runs?)\b|\bbark park\b/g], ['truck court', /\btruck courts?\b|\b(?:loading )?docks?(?: doors?| high| positions?)?\b|\bloading(?: area| doors?)?\b/g],
  ['pool', /\b(?:swimming |resort[- ]style )?pools?\b/g], ['clubhouse', /\bclub ?houses?\b|\bleasing (?:office|center|centre)\b|\bamenity (?:center|centre|building)\b|\bcommunity (?:center|centre|building)\b/g],
  ['playground', /\bplay ?grounds?\b|\btot lots?\b|\bplay areas?\b/g], ['courts', /\b(?:pickleball|tennis|basketball|sport) courts?\b/g],
  ['pond', /\b(?:detention |retention |wet |dry |stormwater )?ponds?\b|\bdetention(?: basin| area)?\b|\blake\b/g],
  ['entrance', /\b(?:main |second |another |the )?(?:entrance|entry|driveway|access(?: point)?|curb cut)s?\b(?! (?:sign|monument))/g],
  ['parking', /\b(?:surface )?parking(?: lots?| fields?)?\b|\bparking spaces\b/g],
  ['open space', /\b(?:existing |mature |big |old )?trees?\b|\bwoods?\b|\bwooded (?:area|land)\b|\bopen (?:space|land|area)\b|\bgreen ?(?:space|belt|area)\b|\blandscape (?:buffer|strip|area)\b|\bbuffer\b/g],
  ['commons', /\bcommons\b|\bamenit(?:y|ies)(?: area)?\b|\bcentral park\b|\bpark\b/g],
  ['fuel', /\bgas station\b|\bc-store\b|\bconvenience store\b|\bfuel(?:ing)? (?:station|center)\b/g], ['retail', /\bretail\b|\bshops?\b|\bshopping\b|\bstores?\b|\bstrip\b|\bstorefronts?\b|\bgrocery\b/g],
  ['restaurant', /\brestaurants?\b|\bpads?\b(?! sites? for (?:homes|houses))|\bpad sites?\b|\bcoffee\b|\bqsr\b/g], ['medical', /\bmedical(?: office| building| clinic)?\b|\bclinic\b/g],
  ['office', /\boffices?(?! park)\b|\boffice park\b/g], ['hotel', /\bhotels?\b|\bmotel\b/g], ['church', /\bchurch\b|\bsanctuary\b|\bchapel\b/g],
  ['industrial', /\bwarehouses?\b|\bindustrial\b|\bdistribution(?: center| building)?\b|\bflex\b|\blogistics\b/g], ['storage', /\bself[- ]storage\b|\bstorage\b/g],
  ['townhomes', /\btown ?ho(?:me|use)s?\b|\brow ?ho(?:me|use)s?\b/g], ['duplex', /\bduplex(?:es)?\b|\bcottages?\b|\b(?:tri|four|quad)plex(?:es)?\b/g],
  ['multifamily', /\bapartments?\b|\bapts?\b|\bmulti-?family\b|\bunits\b|\bmid-?rises?\b|\bwalk-?ups?\b/g],
  ['sfr', /(?<!town ?|row ?)\bhomes\b|\bhouses\b|\bsingle[- ]family\b|\blots\b/g], ['buildings', /\bbuildings?\b|\bbldgs?\b/g]
];
const DIRW = '(north|south|east|west|northeast|northwest|southeast|southwest|north[- ]east|north[- ]west|south[- ]east|south[- ]west)(?:ern|erly)?';
const dirOf = w => w ? w.replace(/[- ]/g, '').replace(/(ern|erly)$/, '') : null;
const NUMFT = '(\\d{1,4})\\s*(?:ft|feet|foot|\')';
// relation phrases: [regex, (match) -> { rel, edge?, target?, ft?, after? }] (after: the subject is the word after the
// phrase, "a central lake", "keep the southwest corner open"). Tried in order; a span taken by one isn't read again.
const REL_WORDS = [
  [new RegExp('\\bno (?:buildings?|structures?|construction)\\s+(?:within|closer than|inside)\\s+' + NUMFT + '\\s+of\\s+the\\s+' + DIRW + '\\s*(?:property |lot )?(?:line|side|edge|boundary)', 'g'), m => ({ rel: 'away', edge: dirOf(m[2]), ft: +m[1], subject: 'buildings' })],
  [new RegExp('\\b' + NUMFT + '\\s*(?:wide\\s+)?(?:landscape(?:d)?\\s+|green\\s+|tree\\s+)?buffer\\s+(?:along|on|at|to)\\s+the\\s+' + DIRW + '\\s*(?:property |lot )?(?:line|side|edge|boundary)?', 'g'), m => ({ rel: 'keep', edge: dirOf(m[2]), ft: +m[1], subject: 'open space' })],
  [/\bbuffer(?:ing)? (?:the )?neighbou?rs (?:to|on|along) the (north|south|east|west|northeast|northwest|southeast|southwest)\b|\bbuffer(?:ing)? (?:to|on|along) the (north|south|east|west|northeast|northwest|southeast|southwest)\b/g, m => ({ rel: 'away', edge: m[1] || m[2], subject: 'buildings' })],
  [new RegExp('\\bkeep(?:ing)?\\s+(?:about\\s+)?' + NUMFT + '\\s+(?:of\\s+)?(?:open space|open|green ?space|trees|woods|buffer|landscap\\w+)\\s+(?:along|on|at)\\s+the\\s+' + DIRW + '\\s*(?:property |lot )?(?:line|side|edge|boundary|end)?', 'g'), m => ({ rel: 'keep', edge: dirOf(m[2]), ft: +m[1], subject: 'open space' })],
  [new RegExp('\\b(?:keep|preserve|save|leave|hold)\\s+(?:the\\s+)?' + DIRW + '\\s+corner\\s+(?:open|clear|empty|green|free|undeveloped|for)', 'g'), m => ({ rel: 'keep', edge: dirOf(m[1]), subject: 'open space', corner: true })],
  [new RegExp('\\b(?:keep|preserve|save|protect|leave)\\s+(?:the\\s+|all the\\s+|existing\\s+)?(?:existing\\s+|mature\\s+)?(?:trees?|woods?|wooded area|tree line|open space|green ?space)\\s+(?:on|along|at|in)\\s+the\\s+' + DIRW + '\\s*(?:side|end|edge|line|property line|half|part|portion|boundary)?', 'g'), m => ({ rel: 'keep', edge: dirOf(m[1]), subject: 'open space' })],
  [/\b(?:entrance|entry|access|driveway|curb cut|way in)s? (?:off|on|from|onto|to) (?:of )?(?:the )?side (?:street|road)\b|\bside[- ]street (?:entrance|entry|access|driveway)\b/g, () => ({ rel: 'edge', edge: 'side', subject: 'entrance' })],
  [/\b(?:entrance|entry|access|driveway)s? (?:off|on|from) (?:the )?(?:main road|main street|front|frontage|highway)\b/g, () => ({ rel: 'edge', edge: 'front', subject: 'entrance' })],
  [/\bfacing away from the (?:street|road|highway|front)\b/g, () => ({ rel: 'facing', edge: 'back' })],
  [new RegExp('\\bfacing\\s+(?:the\\s+)?' + DIRW + '\\b', 'g'), m => ({ rel: 'facing', edge: dirOf(m[1]) })],
  [/\bfacing (?:the )?(?:main road|street|road|highway|frontage)\b/g, () => ({ rel: 'front' })],
  [/\b(?:at|by|near|next to|beside|close to) the (?:main )?(?:entry|entrance|front gate|front door)\b/g, () => ({ rel: 'near', target: 'entrance' })],
  [/\b(?:next to|backing (?:up )?(?:on)?to|along|against|near|by) (?:the )?neighbou?rs\b|\bbacking (?:up )?to the neighbou?rs\b/g, () => ({ rel: 'edge', edge: 'neighbours' })],
  [/\baway from (?:the )?(?:street|road|highway|main road|traffic|front)\b/g, () => ({ rel: 'back' })],
  [/\b(?:hidden |tucked )?behind (?:the |our )?buildings?\b/g, () => ({ rel: 'behind', target: 'buildings' })],
  [/\bin front of (?:the |our )?buildings?\b|\bbetween the buildings and the (?:street|road)\b/g, () => ({ rel: 'before', target: 'buildings' })],
  [/\bbehind (?:it|them|that|those|this|these)\b|\bbehind\b(?! the (?:buildings?|street|road))|\bat the back of (?:it|them)\b|\bbehind the (?:retail|shops?|stores?|office|offices|hotel|warehouse|apartments?|townhomes|strip|center|gas station|medical(?: office)?)\b/g, (m, t) => ({ rel: 'behind', target: behindTarget(m[0], t) })],
  [new RegExp('\\b(?:in|at|on|to(?:ward)?s?|along|by|near)\\s+the\\s+' + DIRW + '\\s+corner\\b', 'g'), m => ({ rel: 'corner', edge: dirOf(m[1]) })],
  [/\b(?:in|at|on) (?:the |a |one )?(?:back |rear |front )?corner\b(?! of [a-z0-9 ]+ (?:and|&) )/g, m => ({ rel: 'corner', edge: /back|rear/.test(m[0]) ? 'back' : /front/.test(m[0]) ? 'front' : null })],
  [new RegExp('\\b(?:on|along|at|to(?:ward)?s?|by|near|in|across)\\s+the\\s+' + DIRW + '\\s*(?:side|end|edge|line|property line|boundary|half|part|portion|part of the site)?\\b', 'g'), m => ({ rel: 'edge', edge: dirOf(m[1]) })],
  [new RegExp('\\bto the\\s+' + DIRW + '\\b', 'g'), m => ({ rel: 'edge', edge: dirOf(m[1]) })],
  [/\b(?:in|at) the (?:middle|center|centre|heart)(?: of (?:the )?(?:site|property|community|lot|land|project))?\b|\bcentrally(?: located)?\b|\bin the cent(?:er|re) of (?:it all|everything)\b/g, () => ({ rel: 'middle' })],
  [/\bcentral\b/g, () => ({ rel: 'middle', after: true })],
  [/\b(?:in|at|to(?:ward)?s?|on) the (?:back|rear)(?: of (?:the )?(?:site|property|lot|land))?\b|\bat the far end\b|\bin back\b/g, () => ({ rel: 'back' })],
  [/\b(?:in|at) (?:the )?front\b|\bup front\b|\bon the (?:frontage|front)\b|\b(?:along|on|by|facing|fronting) (?:the )?(?:main |front |busy )?(?:road|street|highway|frontage(?: road)?|hwy|fm \d+|feeder)\b|\bby the (?:street|road|highway)\b|\bnear the (?:street|road|highway)\b/g, () => ({ rel: 'front' })],
  [/\b(?:on the left|left side)\b/g, () => ({ rel: 'edge', edge: 'left' })], [/\b(?:on the right|right side)\b/g, () => ({ rel: 'edge', edge: 'right' })],
  [/\b(?:near|next to|beside|by|close to|adjacent to|right by) (?:the )?([a-z-]+(?: [a-z-]+)?)\b/g, (m) => { const s = subjectAt(m[1]); return s ? { rel: 'near', target: s } : null; }],
  [/\ba?round (?:a |an |the )?(?:central |big |small |amenity )?(lake|pond|commons|park|pool|clubhouse|amenity center)\b/g, m => ({ rel: 'around', target: subjectAt(m[1]) })]
];
const subjectAt = w => { for (const [s, re] of SUBJ_WORDS) { const r = new RegExp(re.source, 'i'); if (r.test(w)) return s; } return null; };
// "behind the retail": the retail; "with apartments behind" / "behind it": the use named before, set by the reader
function behindTarget(phrase) { const m = /behind the (.+)$/.exec(phrase); return m ? subjectAt(m[1]) : 'previous'; }

// the words, tidied (lib/siteplan.mjs tidyRequest) -> placements. uses: the uses the program has (a use word that
// names no use of the program, "next to the neighbours' homes", isn't a subject)
export function placementsFromWords(text, uses = null) {
  const t0 = S.tidyRequest ? S.tidyRequest(String(text || '')) : String(text || '');
  const t = t0.toLowerCase(), out = [], have = uses ? new Set(uses) : null;
  const okSubj = s => !!s && (PIECES.includes(s) || !have || have.has(s) || (s === 'restaurant' && have.has('retail')) || (s === 'multifamily' && have.has('multifamily')));
  // the subjects said, with where they are
  const subs = []; for (const [s, re] of SUBJ_WORDS) { const g = new RegExp(re.source, 'g'); let m; while ((m = g.exec(t))) if (!subs.some(x => m.index < x.end && m.index + m[0].length > x.at)) subs.push({ s, at: m.index, end: m.index + m[0].length }); }
  subs.sort((a, b) => a.at - b.at);
  // the relation phrases (a span read once)
  const rels = []; for (const [re, f] of REL_WORDS) { const g = new RegExp(re.source, 'g'); let m; while ((m = g.exec(t))) { const at = m.index, end = at + m[0].length; if (rels.some(r => at < r.end && end > r.at)) continue; const r = f(m, t); if (r) rels.push({ ...r, at, end, phrase: m[0] }); } }
  rels.sort((a, b) => a.at - b.at);
  const clauseStart = i => Math.max(t.lastIndexOf('.', i - 1), t.lastIndexOf(';', i - 1), t.lastIndexOf(',', i - 1), t.lastIndexOf('\n', i - 1), (/\bwith\b/g.exec(t.slice(0, i)) ? lastWith(t, i) : -1));
  const clauseEnd = i => { const c = [t.indexOf('.', i), t.indexOf(';', i), t.indexOf(',', i), t.indexOf('\n', i)].filter(x => x >= 0); return c.length ? Math.min(...c) : t.length; };
  let lastUse = null;
  for (const r of rels) {
    const c0 = clauseStart(r.at), inSpan = s => !rels.some(q => s.at >= q.at && s.at < q.end);
    // the subject: what was named in this clause before the phrase (back to the previous phrase), else the one after it
    let cand = subs.filter(s => s.at > c0 && s.end <= r.at && inSpan(s) && !(r.subject && s.s === r.subject) && okSubj(s.s));
    const prevRel = rels.filter(q => q !== r && q.end <= r.at && q.at > c0).pop(); if (prevRel) { const after = cand.filter(s => s.at >= prevRel.end); cand = after.length ? after : cand.filter(s => s.at >= prevRel.at - 200).slice(-1); }
    if (r.after || !cand.length) { const nx = subs.find(s => s.at >= r.end && s.at < clauseEnd(r.end) + 1 && okSubj(s.s)); if (nx && (r.after || !cand.length)) cand = [nx]; }
    // "the pool and clubhouse up front": both; "apartments and the pool in the middle": the pool (the last one named)
    let who = cand.length > 1 && /^\s*(?:and|&|\/|,)\s*(?:the\s+)?$/.test(t.slice(cand[cand.length - 2].end, cand[cand.length - 1].at)) && PIECES.includes(cand[cand.length - 1].s) === PIECES.includes(cand[cand.length - 2].s) ? cand.slice(-2).map(s => s.s) : cand.slice(-1).map(s => s.s);
    if (r.subject && (!who.length || r.subject === 'buildings' || r.subject === 'open space')) who = [r.subject];
    if (!who.length) continue;
    const ft = r.ft ?? ((m => m && +m[1] >= 5 && +m[1] <= 1000 ? +m[1] : null)(new RegExp(NUMFT).exec(t.slice(r.at, clauseEnd(r.end)))));
    for (const s of [...new Set(who)]) {
      let target = r.target === 'previous' ? (lastUse && lastUse !== s ? lastUse : null) : r.target || null;
      if (r.rel === 'behind' && r.target === 'previous' && !target) { const pu = subs.filter(x => x.at < r.at && x.s !== s && USE_SUBJECTS.includes(x.s) && okSubj(x.s)).pop(); target = pu ? pu.s : null; }
      if (target === s) continue;
      const p = { subject: s, rel: r.rel, ...(r.edge ? { edge: r.edge } : {}), ...(target ? { target } : {}), ...(ft && ['away', 'keep'].includes(r.rel) ? { ft } : {}), ...(r.corner ? { corner: true } : {}), text: r.phrase.trim() };
      if (r.rel === 'behind' && !target) { p.rel = 'back'; }
      if (!out.some(q => q.subject === p.subject && q.rel === p.rel && q.edge === p.edge && q.target === p.target)) out.push(p);
    }
    for (const s of who) if (USE_SUBJECTS.includes(s)) lastUse = s;
  }
  // a use named after the last one with no place of its own keeps none; "with apartments behind" read above
  return out.map((p, i) => ({ id: 'p' + (i + 1), ...p }));
}
function lastWith(t, i) { const re = /\bwith\b/g; let m, k = -1; while ((m = re.exec(t)) && m.index < i) k = m.index + 3; return k; }

// a placement from the AI (or a saved brief) made safe: unknown words dropped
export function cleanPlacement(p, i = 0) {
  if (!p || typeof p !== 'object' || !SUBJECTS.includes(p.subject) || !RELS.includes(p.rel)) return null;
  const out = { id: typeof p.id === 'string' && p.id ? p.id.slice(0, 12) : 'p' + (i + 1), subject: p.subject, rel: p.rel };
  if (EDGES.includes(p.edge)) out.edge = p.edge; if (SUBJECTS.includes(p.target)) out.target = p.target;
  if (+p.ft > 0 && +p.ft <= 2000) out.ft = Math.round(+p.ft); if (p.corner === true) out.corner = true;
  if (typeof p.text === 'string' && p.text.trim()) out.text = p.text.trim().slice(0, 120);
  return out;
}
export function mergePlacements(...lists) {
  const out = [];
  for (const p of lists.flat().filter(Boolean)) if (!out.some(q => q.subject === p.subject && q.rel === p.rel && (q.edge || null) === (p.edge || null) && (q.target || null) === (p.target || null))) out.push({ ...p });
  return out.map((p, i) => ({ ...p, id: 'p' + (i + 1) }));
}
export function validatePlacements(list) {
  const errs = []; if (list == null) return errs; if (!Array.isArray(list)) return ['program.placements must be a list'];
  list.forEach((p, i) => { if (!p || !SUBJECTS.includes(p.subject)) errs.push('program.placements.' + i + '.subject: one of ' + SUBJECTS.join(', ')); if (!p || !RELS.includes(p.rel)) errs.push('program.placements.' + i + '.rel: one of ' + RELS.join(', ')); if (p?.edge != null && !EDGES.includes(p.edge)) errs.push('program.placements.' + i + '.edge: one of ' + EDGES.join(', ')); if (p?.target != null && !SUBJECTS.includes(p.target)) errs.push('program.placements.' + i + '.target: one of ' + SUBJECTS.join(', ')); if (p?.ft != null && !(+p.ft > 0)) errs.push('program.placements.' + i + '.ft must be positive'); });
  return errs;
}

// ---------- the site's edges and regions ----------
const outN = (r, i) => { const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ccw = S.signedArea(r) > 0; return ccw ? [(b[1] - a[1]) / L, -(b[0] - a[0]) / L] : [-(b[1] - a[1]) / L, (b[0] - a[0]) / L]; };
// the frame the words mean: the front edge's outward normal (the street side), across it left to right as seen from the
// street looking in
export function siteFrame(ring, front) {
  const f = Number.isInteger(front) ? front : S.longestEdge(ring), nf = outN(ring, f), into = [-nf[0], -nf[1]], right = [into[1], -into[0]]; /* (looking in from the street: right is the inward direction turned clockwise) */
  const dep = p => p[0] * into[0] + p[1] * into[1], acr = p => p[0] * right[0] + p[1] * right[1];
  const D = ring.map(dep), A = ring.map(acr), d0 = Math.min(...D), d1 = Math.max(...D), a0 = Math.min(...A), a1 = Math.max(...A);
  const X = ring.map(p => p[0]), Y = ring.map(p => p[1]), bb = [Math.min(...X), Math.min(...Y), Math.max(...X), Math.max(...Y)];
  return { front: f, nf, into, right, uv: p => [(acr(p) - a0) / ((a1 - a0) || 1), (dep(p) - d0) / ((d1 - d0) || 1)], xy: p => [(p[0] - bb[0]) / ((bb[2] - bb[0]) || 1), (p[1] - bb[1]) / ((bb[3] - bb[1]) || 1)], depth: d1 - d0, width: a1 - a0, bb };
}
// the edge indices an edge word means
export function edgesFor(ring, front, streets, edge) {
  const F = siteFrame(ring, front), n = ring.length, all = [...Array(n).keys()], st = new Set([front, ...(streets || [])].filter(Number.isInteger));
  const dot = (i, v) => { const o = outN(ring, i); return o[0] * v[0] + o[1] * v[1]; }, long = i => S.edgeLen(ring, i) > 15;
  const best = v => { const c = all.filter(i => long(i) && dot(i, v) > 0.6); if (c.length) return c; const m = Math.max(...all.map(i => dot(i, v))); return all.filter(i => dot(i, v) >= m - 0.05); };
  if (edge === 'front') return [F.front, ...S.streetRun(ring, F.front)].filter((v, i, a) => a.indexOf(v) === i);
  if (edge === 'back') return best(F.into);
  if (edge === 'side') return [...st].filter(i => i !== F.front && !S.streetRun(ring, F.front).includes(i));
  if (edge === 'neighbours') return all.filter(i => !st.has(i) && !S.streetRun(ring, F.front).includes(i) && long(i));
  if (edge === 'left') return best([-F.right[0], -F.right[1]]); if (edge === 'right') return best(F.right);
  if (COMPASS[edge]) { const v = COMPASS[edge]; if (edge.length > 5) { const parts = [edge.slice(0, 5), edge.slice(5)]; return [...new Set(parts.flatMap(w => best(COMPASS[w])))]; } return best(v); }
  return [];
}
const distEdges = (ring, idx, p) => Math.min(...idx.map(i => S.segDist(p, ring[i], ring[(i + 1) % ring.length])));
// the ideal point for a region, in plan feet (where an amenity is moved toward) and the test that it's there
export function regionOf(plan, p, { front = plan.front, streets = plan.streets } = {}) {
  const ring = plan.ring, F = siteFrame(ring, front), c = S.centroid(ring);
  const fromUV = (u, v) => { /* a point at (u, v) of the frame's box */ const A = ring.map(q => q[0] * F.right[0] + q[1] * F.right[1]), D = ring.map(q => q[0] * F.into[0] + q[1] * F.into[1]), a = Math.min(...A) + u * (Math.max(...A) - Math.min(...A)), d = Math.min(...D) + v * (Math.max(...D) - Math.min(...D)); return [a * F.right[0] + d * F.into[0], a * F.right[1] + d * F.into[1]]; };
  const edgeIdx = p.edge ? edgesFor(ring, front, streets, p.edge) : [];
  const nearEdge = (q, frac = 0.35) => edgeIdx.length && distEdges(ring, edgeIdx, q) <= frac * Math.max(F.depth, F.width) * (p.subject === 'pond' ? 1.2 : 1);
  if (p.rel === 'middle') return { at: c, ok: q => { const [u, v] = F.uv(q); return u >= 0.25 && u <= 0.75 && v >= 0.25 && v <= 0.75; }, what: 'in the middle of the site' };
  if (p.rel === 'front' || p.rel === 'along') return { at: fromUV(0.5, 0.12), ok: q => F.uv(q)[1] <= 0.4, what: 'toward the street' };
  if (p.rel === 'back' || p.rel === 'behind' && !p.target) return { at: fromUV(0.5, 0.88), ok: q => F.uv(q)[1] >= 0.6, what: 'toward the back' };
  if (p.rel === 'corner') {
    const cs = ring.map((q, i) => ({ q, i })).filter(({ q }) => !p.edge || (COMPASS[p.edge] ? (q[0] - c[0]) * COMPASS[p.edge][0] + (q[1] - c[1]) * COMPASS[p.edge][1] > 0 : p.edge === 'back' ? F.uv(q)[1] > 0.5 : p.edge === 'front' ? F.uv(q)[1] < 0.5 : true));
    const corners = (cs.length ? cs : ring.map((q, i) => ({ q, i }))).map(({ q }) => q);
    const pick = p.edge && COMPASS[p.edge] ? corners.slice().sort((a, b) => ((b[0] - c[0]) * COMPASS[p.edge][0] + (b[1] - c[1]) * COMPASS[p.edge][1]) - ((a[0] - c[0]) * COMPASS[p.edge][0] + (a[1] - c[1]) * COMPASS[p.edge][1]))[0] : corners.slice().sort((a, b) => F.uv(b)[1] - F.uv(a)[1])[0];
    const at = [pick[0] + (c[0] - pick[0]) * 0.18, pick[1] + (c[1] - pick[1]) * 0.18], R = 0.3 * Math.max(F.depth, F.width);
    return { at, ok: q => corners.some(k => Math.hypot(q[0] - k[0], q[1] - k[1]) <= R) && (!p.edge || !COMPASS[p.edge] || Math.hypot(q[0] - pick[0], q[1] - pick[1]) <= R * 1.15), what: 'in the ' + (p.edge ? p.edge + ' ' : '') + 'corner' };
  }
  if ((p.rel === 'edge' || p.rel === 'facing') && edgeIdx.length) {
    const mid = edgeIdx.map(i => [(ring[i][0] + ring[(i + 1) % ring.length][0]) / 2, (ring[i][1] + ring[(i + 1) % ring.length][1]) / 2]), m = mid.reduce((s, q) => [s[0] + q[0] / mid.length, s[1] + q[1] / mid.length], [0, 0]);
    return { at: [m[0] + (c[0] - m[0]) * 0.2, m[1] + (c[1] - m[1]) * 0.2], ok: q => nearEdge(q), what: 'along the ' + p.edge + ' side' };
  }
  return null;
}

// ---------- the pieces a subject names in a drawing ----------
const isClub = e => e.kind === 'building' && (e.use === 'amenity' || /club ?house|leasing|community cent|amenity cent/i.test(e.name || ''));
export function piecesOf(elements, subject, program = {}) {
  const els = elements || [], P = program || {}, useOf = e => e.use || P.use;
  switch (subject) {
    case 'pool': return els.filter(e => e.kind === 'pool');
    case 'clubhouse': return els.filter(isClub);
    case 'playground': return els.filter(e => e.kind === 'play');
    case 'dog park': return els.filter(e => /dog/i.test(e.name || ''));
    case 'courts': return els.filter(e => e.kind === 'court');
    case 'pond': return els.filter(e => e.kind === 'pond');
    case 'parking': return els.filter(e => e.kind === 'parking' && !e.rv);
    case 'truck court': return els.filter(e => e.kind === 'truck');
    case 'entrance': return S.entrancesOf(els);
    case 'open space': return els.filter(e => e.kind === 'keepout' && /asked|request/i.test((e.note || '') + ' ' + (e.name || '')) || e.kind === 'green' && /open space|tree|buffer|lawn|park/i.test(e.name || ''));
    case 'commons': return els.filter(e => isClub(e) || ['pool', 'play', 'court'].includes(e.kind) || e.kind === 'green' && /commons|park|lawn/i.test(e.name || ''));
    case 'buildings': return els.filter(e => e.kind === 'building' && !e.future);
    case 'restaurant': return els.filter(e => e.kind === 'building' && (useOf(e) === 'restaurant' || e.pad));
    default: return els.filter(e => e.kind === 'building' && !e.future && !isClub(e) && useOf(e) === subject);
  }
}
const ctr = list => { const pts = list.map(e => { const s = e.path && !e.poly ? e.path : S.shapeOf(e); return S.centroid(s); }), w = list.map(e => Math.max(1, S.elArea ? S.elArea(e) : 1)), W = w.reduce((a, b) => a + b, 0); return [pts.reduce((s, p, i) => s + p[0] * w[i], 0) / W, pts.reduce((s, p, i) => s + p[1] * w[i], 0) / W]; };

// ---------- does a drawing meet a placement? ----------
// -> { status: pass | fail | n/a | unknown, said: a sentence for the notes }
export function checkPlacement(plan, elements, program, p) {
  const ring = plan.ring, F = siteFrame(ring, plan.front), name = describe(p), pcs = piecesOf(elements, p.subject, program);
  const res = (status, why = '') => ({ id: p.id, status, said: name + (status === 'pass' ? ': done.' : status === 'fail' ? ': not met in this layout' + (why ? ' (' + why + ')' : '') + '.' : ': ' + why) });
  if (p.rel === 'keep' || p.rel === 'away') {
    const idx = edgesFor(ring, plan.front, plan.streets, p.edge || 'back'); if (!idx.length) return res('unknown', 'the site has no ' + (p.edge || '') + ' edge to measure from');
    const ft = p.ft || (p.rel === 'keep' ? KEEP_FT : AWAY_FT), B = piecesOf(elements, 'buildings', program).concat(p.rel === 'keep' ? elements.filter(e => ['parking', 'drive', 'pond', 'pool', 'court', 'truck'].includes(e.kind) && !e.entry) : []);
    if (p.corner) { const reg = regionOf(plan, { rel: 'corner', edge: p.edge }), k = reg.at; const hit = B.filter(e => S.shapeOf(e).some(q => Math.hypot(q[0] - k[0], q[1] - k[1]) < ft * 0.6)); return hit.length ? res('fail', hit.length + ' piece' + (hit.length > 1 ? 's' : '') + ' in it') : res('pass'); }
    const d = B.length ? Math.min(...B.map(e => Math.min(...S.shapeOf(e).map(q => distEdges(ring, idx, q))))) : Infinity;
    return d >= ft - 1 ? res('pass') : res('fail', 'the nearest ' + (p.rel === 'keep' ? 'built or paved piece' : 'building') + ' is ' + Math.round(d) + ' ft from that line, ' + ft + ' ft asked');
  }
  if (p.subject === 'entrance' && p.rel === 'edge') {
    const idx = edgesFor(ring, plan.front, plan.streets, p.edge); if (!idx.length) return res('n/a', 'the site has no ' + (p.edge === 'side' ? 'side street' : p.edge + ' edge') + ' marked, so it was laid out from the front');
    const ok = pcs.some(e => (e.path || S.shapeOf(e)).some(q => distEdges(ring, idx, q) < 30)); return ok ? res('pass') : res('fail', 'every way in is off another street');
  }
  if (!pcs.length) return res(p.subject === 'dog park' || p.subject === 'pool' || p.subject === 'playground' || p.subject === 'clubhouse' ? 'fail' : 'n/a', p.subject === 'dog park' || p.subject === 'pool' || p.subject === 'playground' || p.subject === 'clubhouse' ? 'there is none in it' : 'nothing of that kind in this layout');
  const c = ctr(pcs);
  if (p.rel === 'near') {
    const tg = piecesOf(elements, p.target, program); if (!tg.length) return res('unknown', 'no ' + p.target + ' to measure from');
    const d = Math.min(...pcs.map(e => Math.min(...tg.map(g => S.gapBetween(S.shapeOf(e), g.path && !g.poly ? g.path.map(q => q) : S.shapeOf(g))))));
    return d <= NEAR_FT ? res('pass') : res('fail', Math.round(d) + ' ft from the ' + p.target);
  }
  if (p.rel === 'behind' || p.rel === 'before') {
    const tg = piecesOf(elements, p.target || 'buildings', program).filter(e => !pcs.includes(e)); if (!tg.length) return res('unknown', 'no ' + (p.target || 'buildings') + ' to compare with');
    const v = F.uv(c)[1], vt = F.uv(ctr(tg))[1], ok = p.rel === 'behind' ? v > vt + 0.02 : v < vt - 0.02;
    return ok ? res('pass') : res('fail', 'it sits ' + (p.rel === 'behind' ? 'in front of' : 'behind') + ' the ' + (p.target || 'buildings') + ' on average');
  }
  if (p.rel === 'facing') {
    const tg = piecesOf(elements, 'buildings', program).filter(e => p.subject !== 'truck court' || ['industrial', 'storage'].includes(e.use || program?.use)); if (!tg.length) return res('unknown', 'no building to face from');
    const want = p.edge === 'back' ? F.into : p.edge === 'front' ? F.nf : COMPASS[p.edge] || null; if (!want) return res('unknown', 'no direction');
    // every building it serves faces that way (a court shared between two buildings faces each of them a different way)
    const dirs = tg.map(g => { const b = ctr([g]), d = [c[0] - b[0], c[1] - b[1]], L = Math.hypot(d[0], d[1]) || 1; return [d[0] / L, d[1] / L]; }), bad = dirs.find(d => d[0] * want[0] + d[1] * want[1] <= 0.5);
    return !bad ? res('pass') : res('fail', 'it faces ' + compassOf(bad) + (tg.length > 1 ? ' from one of the buildings it serves' : ''));
  }
  if (['beside', 'between', 'around'].includes(p.rel)) return res('unknown', 'laid out by the engine’s zones; not measured');
  const reg = regionOf(plan, p); if (!reg) return res('unknown', 'no way to measure it on this site');
  return reg.ok(c) ? res('pass') : res('fail', 'it is ' + whereIs(F, c));
}
export const KEEP_FT = 60, AWAY_FT = 50, NEAR_FT = 150;
const compassOf = v => { const a = Math.atan2(v[1], v[0]) * 180 / Math.PI, k = Math.round(((a + 360) % 360) / 45) % 8; return ['east', 'northeast', 'north', 'northwest', 'west', 'southwest', 'south', 'southeast'][k]; };
const whereIs = (F, c) => { const [u, v] = F.uv(c); return (v < 0.34 ? 'toward the street' : v > 0.66 ? 'toward the back' : 'midway back') + ', ' + (u < 0.34 ? 'on the left' : u > 0.66 ? 'on the right' : 'in the middle') + ' as seen from the street'; };
const SUBJ_NAME = { multifamily: 'the apartments', townhomes: 'the townhomes', duplex: 'the duplexes', sfr: 'the homes', retail: 'the shops', restaurant: 'the restaurants', office: 'the offices', medical: 'the medical offices', hotel: 'the hotel', church: 'the church', industrial: 'the warehouse', storage: 'the storage', fuel: 'the gas station', buildings: 'the buildings', 'open space': 'open land', entrance: 'a way in' };
export function describe(p) {
  const s = SUBJ_NAME[p.subject] || 'the ' + p.subject, e = p.edge ? (p.edge === 'side' ? 'the side street' : p.edge === 'neighbours' ? 'the neighbours' : 'the ' + p.edge + (['front', 'back'].includes(p.edge) ? '' : ' side')) : '';
  const how = { front: 'toward the street', back: 'at the back', middle: 'in the middle', corner: 'in the ' + (p.edge ? p.edge + ' ' : '') + 'corner', edge: p.subject === 'entrance' ? 'off ' + e : 'along ' + e, near: 'near the ' + (p.target || ''), behind: 'behind ' + (SUBJ_NAME[p.target] || 'the ' + (p.target || 'buildings')), before: 'in front of ' + (SUBJ_NAME[p.target] || 'the ' + (p.target || 'buildings')), away: 'no building within ' + (p.ft || AWAY_FT) + ' ft of ' + e, keep: (p.corner ? 'the ' + p.edge + ' corner kept open' : (p.ft || KEEP_FT) + ' ft kept open along ' + e), facing: 'facing ' + (p.edge === 'back' ? 'away from the street' : p.edge === 'front' ? 'the street' : p.edge), along: 'along the road', beside: 'beside ' + (p.target || ''), between: 'between two uses', around: 'around the ' + (p.target || 'commons') }[p.rel] || p.rel;
  return 'Asked: ' + (p.rel === 'away' || p.rel === 'keep' ? how : s + ' ' + how);
}

// ---------- telling the engine what it can honour ----------
// brief (from lib/layoutbrief.mjs, before canonical form): its site, program.uses and program.engine. Changes it in
// place; returns notes for the run's mapping. Each placement gets how: 'engine' (the engine is told), 'moved' (an
// amenity moved after the layout, lib/layoutrun.mjs), 'checked' (measured and said only).
export function applyPlacements(brief) {
  const L = brief.program?.placements; if (!Array.isArray(L) || !L.length) return [];
  const s = brief.site, ring = s.ring, front = Number.isInteger(s.front) ? s.front : S.longestEdge(ring), streets = s.streets || [], P = brief.program.engine || (brief.program.engine = {}), notes = [];
  const Z = Array.isArray(P.zones) && P.zones.length > 1 ? P.zones : null, uses = brief.program.uses.map(u => u.use);
  const k = s.units === 'm' ? 0.3048 : 1;
  for (const p of L) {
    p.how = 'checked';
    // a use's place among several: the zone's place (lib/sitepods.mjs, lib/sitelayout.mjs bands read it)
    if (Z && USE_SUBJECTS.includes(p.subject)) {
      const zi = Z.findIndex(z => z.use === p.subject || p.subject === 'restaurant' && z.use === 'retail');
      const role = p.rel === 'edge' || p.rel === 'facing' ? roleOf(ring, front, streets, p.edge) : null;
      const where = p.rel === 'behind' ? 'back' : p.rel === 'before' ? 'front' : ['front', 'back', 'middle', 'corner'].includes(p.rel) ? p.rel : p.rel === 'along' ? 'along' : role;
      if (zi >= 0 && where) { if (!Z[zi].place?.where) Z[zi].place = { where, road: null, next: [], side: null }; p.how = Z[zi].place.where === where || (where === 'front' && Z[zi].place.where === 'along') ? 'engine' : 'checked'; }
      if (p.rel === 'behind' && p.target && zi >= 0) { const ti = Z.findIndex(z => z.use === p.target); if (ti >= 0 && !Z[ti].place?.where) Z[ti].place = { where: 'front', road: null, next: [], side: null }; }
      continue;
    }
    // open land kept along an edge, or no building near it: a strip the plan keeps out of (an exclusion the validator
    // checks), or a deeper setback on a street edge; a corner kept open: a square keep-out
    if (p.rel === 'keep' || p.rel === 'away') {
      const idx = edgesFor(ring, front, streets, p.edge || 'back'), ft = (p.ft || (p.rel === 'keep' ? KEEP_FT : AWAY_FT)) * (s.units === 'm' ? 1 / 0.3048 : 1);
      if (!idx.length) continue;
      if (p.corner) { const reg = regionOf({ ring, front, streets }, { rel: 'corner', edge: p.edge }), cz = ring.reduce((b, q) => Math.hypot(q[0] - reg.at[0], q[1] - reg.at[1]) < Math.hypot(b[0] - reg.at[0], b[1] - reg.at[1]) ? q : b, ring[0]), w = Math.max(80, ft * 2), c = S.centroid(ring), dx = Math.sign(c[0] - cz[0]) || 1, dy = Math.sign(c[1] - cz[1]) || 1;
        (s.exclusions ||= []).push({ id: 'ask-' + p.id, kind: 'keepout', ring: [[cz[0], cz[1]], [cz[0] + dx * w, cz[1]], [cz[0] + dx * w, cz[1] + dy * w], [cz[0], cz[1] + dy * w]].map(q => [+(q[0] * k).toFixed(2), +(q[1] * k).toFixed(2)]), source: 'the request: the ' + p.edge + ' corner kept open (' + Math.round(w) + ' ft square, assumed)' }); p.how = 'engine'; notes.push('The ' + p.edge + ' corner kept open as asked: a ' + Math.round(w) + ' ft square no building or paving goes on (its size assumed; say how big).'); continue; }
      const onStreet = idx.filter(i => i === front || streets.includes(i)), off = idx.filter(i => !onStreet.includes(i));
      for (const i of off) { const a = ring[i], b = ring[(i + 1) % ring.length], n = outN(ring, i), q = [[a[0], a[1]], [b[0], b[1]], [b[0] - n[0] * ft, b[1] - n[1] * ft], [a[0] - n[0] * ft, a[1] - n[1] * ft]];
        (s.exclusions ||= []).push({ id: 'ask-' + p.id + '-' + i, kind: 'keepout', ring: q.map(v => [+(v[0] * k).toFixed(2), +(v[1] * k).toFixed(2)]), source: 'the request: ' + (p.rel === 'keep' ? 'open land kept' : 'a buffer') + ' along the ' + p.edge + ' line, ' + Math.round(ft) + ' ft' + (p.ft ? '' : ' (assumed)') }); }
      if (onStreet.length) { const sb = brief.rules?.values?.setbacks; if (sb) sb.v = { ...sb.v, front: Math.max(+sb.v.front || 0, ft) }; }
      p.how = 'engine'; notes.push((p.rel === 'keep' ? 'Open land kept' : 'Kept clear: no building within ' + Math.round(ft) + ' ft') + ' along the ' + p.edge + ' line as asked' + (p.rel === 'keep' ? ', ' + Math.round(ft) + ' ft deep' : '') + (p.ft ? '' : ' (the depth is assumed; say how many feet)') + ': nothing is built or paved there.'); continue;
    }
    // the pool in the middle of an apartment community: the resort loop round a central pool (lib/sitelayout.mjs 'loop')
    if (p.subject === 'pool' && p.rel === 'middle' && uses.includes('multifamily') && !Z && !P.arrangement) { P.arrangement = 'loop'; p.how = 'engine'; continue; }
    if (['pool', 'playground', 'dog park', 'courts'].includes(p.subject) && ['middle', 'front', 'back', 'corner', 'edge', 'near'].includes(p.rel)) { p.how = 'moved'; continue; }
  }
  return notes;
}
// an edge word as a zone's place (the engine's zones know front and back, not compass sides)
function roleOf(ring, front, streets, edge) {
  if (edge === 'front' || edge === 'back') return edge;
  const idx = edgesFor(ring, front, streets, edge), F = siteFrame(ring, front); if (!idx.length) return null;
  const v = idx.map(i => F.uv([(ring[i][0] + ring[(i + 1) % ring.length][0]) / 2, (ring[i][1] + ring[(i + 1) % ring.length][1]) / 2])[1]), m = v.reduce((a, b) => a + b, 0) / v.length;
  return m <= 0.2 ? 'front' : m >= 0.8 ? 'back' : null;
}

// ---------- after the layout: amenities moved where asked ----------
const ADD = { 'dog park': [[100, 80], [70, 60], [50, 45]], playground: [[64, 48], [50, 40]] }, ADD_EL = { 'dog park': { kind: 'green', name: 'Dog park', note: 'Fenced · small | large (asked)' }, playground: { kind: 'play', name: 'Playground', note: 'asked' } };
const HARD = ['building', 'parking', 'drive', 'truck', 'pond', 'garage', 'court', 'pool', 'play', 'plaza', 'keepout', 'canopy', 'foodtruck', 'trash', 'patio', 'tanks'];
export function placeAmenities(plan, o, placements, program = {}) {
  const asks = (placements || []).filter(p => p.how === 'moved'); if (!asks.length || !o?.elements?.length) return o;
  let els = o.elements.slice(); const notes = [];
  const sb = plan.setbacks || S.SETBACKS, inner = S.insetRing ? S.insetRing(plan.ring, plan.ring.map(() => Math.max(5, +sb.paving || 10))) : plan.ring;
  for (const p of asks) {
    if (checkPlacement(plan, els, program, p).status === 'pass') continue;
    const mine0 = piecesOf(els, p.subject, program).filter(e => !e.poly && !e.path), adding = !mine0.length && ADD[p.subject];
    if (!mine0.length && !adding) continue;
    // a piece asked for and not drawn (a dog park, a playground): added where asked, the largest of its sizes that fits
    for (const mine of adding ? ADD[p.subject].map(([w, d]) => [{ id: p.subject.replace(' ', '') + '-' + p.id, ...ADD_EL[p.subject], x: 0, y: 0, w, d, rot: 0 }]) : [mine0]) {
    const lead = mine[0], deck = p.subject === 'pool' ? els.filter(x => x.kind === 'plaza' && Math.hypot(x.x - lead.x, x.y - lead.y) < 5) : [], group = [...mine.slice(0, 1), ...deck];
    const others = els.filter(x => !group.includes(x) && HARD.includes(x.kind) || x.kind === 'building' && !group.includes(x)), obs = others.map(x => S.shapeOf(x)), bbOf = sh => [Math.min(...sh.map(v => v[0])), Math.min(...sh.map(v => v[1])), Math.max(...sh.map(v => v[0])), Math.max(...sh.map(v => v[1]))], obsB = obs.map(bbOf);
    const reg = p.rel === 'near' ? null : regionOf(plan, p), tgt = p.rel === 'near' ? piecesOf(els, p.target, program) : null;
    const goal = reg ? reg.at : tgt?.length ? ctr(tgt) : null; if (!goal) continue;
    const F = siteFrame(plan.ring, plan.front), R = Math.max(F.depth, F.width), tries = [];
    for (let dx = -R; dx <= R; dx += 10) for (let dy = -R; dy <= R; dy += 10) tries.push([goal[0] + dx, goal[1] + dy]);
    tries.sort((a, b) => Math.hypot(a[0] - goal[0], a[1] - goal[1]) - Math.hypot(b[0] - goal[0], b[1] - goal[1]) || a[0] - b[0] || a[1] - b[1]);
    let best = null;
    for (const q of tries.slice(0, 6000)) {
      const moved = group.map(e => ({ ...e, x: +(q[0] + (e.x - lead.x)).toFixed(2), y: +(q[1] + (e.y - lead.y)).toFixed(2) })), shapes = moved.map(e => S.shapeOf(e));
      if (!shapes.every(sh => sh.every(v => S.inRing(v, inner)))) continue;
      if (shapes.some(sh => { const k = bbOf(sh); return obs.some((ob, j) => { const o2 = obsB[j]; return o2[0] < k[2] + 4 && o2[2] > k[0] - 4 && o2[1] < k[3] + 4 && o2[3] > k[1] - 4 && S.gapBetween(sh, ob) < 4; }); })) continue;
      const trial = els.filter(x => !group.includes(x)).concat(moved);
      if (checkPlacement(plan, trial, program, p).status !== 'pass') continue;
      best = moved; break;
    }
    if (!best) continue;
    els = els.filter(x => !group.includes(x)).concat(best);
    notes.push((adding ? 'A ' + p.subject + ' added ' : 'The ' + p.subject + ' moved ') + describe(p).replace(/^Asked: (?:the [a-z ]+ )?/, '') + ' as asked.');
    break; }
  }
  return notes.length ? { ...o, elements: els, tplNotes: [...(o.tplNotes || []), ...notes] } : o;
}

// ---------- open requests: what to assume ----------
// a request that names no use ("something that pencils on this lot", "max density", "best use"): housing on land of 2
// acres or more (the engine compares garden apartments, studios, townhomes and duplexes and keeps the best by value;
// "max density" / "most units": apartments, as many as fit), shops on a smaller lot. Returns { program, assumed } or null.
export const VAGUE_RE = /\b(?:pencils?|makes? (?:the most )?(?:money|sense)|best use|highest and best|whatever (?:fits|works|you think)|something|anything|max(?:imum)? (?:density|units|yield)|most (?:units|density|value)|develop (?:it|this)|what should (?:we|i) build|your call|best (?:option|plan|layout)|mixed[- ]use)\b/i;
export function vagueProgram(text, prog, acres) {
  const t = String(text || '').toLowerCase(); if (prog?.use !== 'other' || prog.custom || prog.zones?.length) return null;
  if (/\bmixed[- ]use\b/.test(t)) return { program: { use: 'retail', zones: [{ use: 'retail', place: { where: 'front', road: null, next: [], side: null } }, { use: 'multifamily' }] }, assumed: ['Mixed use with no uses named: shops along the street and apartments behind, each as much as fits (name the uses and sizes to change it).'] };
  if (/\b(?:density|units|doors|yield|housing|residential|homes?)\b/.test(t)) return { program: { use: 'multifamily', max: true }, assumed: ['No use named: apartments (garden style, 3 floors), as many as fit, for the most homes the land holds.'] };
  if (acres >= 2) return { program: { use: 'multifamily', compare: true, max: true }, assumed: ['No use named: housing, laid out as garden apartments, studio apartments, townhomes and duplexes and ranked by value; the best is shown first (name a use to choose it).'] };
  return { program: { use: 'retail', max: true }, assumed: ['No use named on a small lot (' + acres.toFixed(1) + ' ac): a retail building, as large as the parking allows (name a use to choose it).'] };
}
