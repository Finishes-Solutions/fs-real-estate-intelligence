// Changing a laid-out plan from words ("make Bldg 7 four stories", "move the clubhouse to the back by the pond").
// The AI is shown the plan as a list of named pieces in the sheet's frame (the street along the bottom, x across the
// frontage, y back from the street, feet), the same way it sees the drawing, and answers with edits on those pieces.
// This file applies the edits (the same way for the AI's answer and for plain words read here when the AI isn't
// there); the browser then re-fits the rest of the plan round the pieces that changed. Shared by the browser, the API
// and the tests.
import * as S from './siteplan.mjs';
import { streetRules, chainsOf } from './streetnet.mjs';
import * as SE from './streetedit.mjs';
import * as SNm from './streetnames.mjs';
import { streetDown } from './sitesheet.mjs';
import { BUILDING_TYPES, typeById, fromType } from './buildings.mjs';

const norm = r => +(((r % 360) + 360) % 360).toFixed(2);
// the sheet's frame: to([x, y]) -> [across, back] in feet from the street's left end; from() undoes it
export function sheetFrame(plan) {
  const deg = streetDown(plan), t = p => S.rotPt(p, -deg), r = (plan.ring || []).map(t), xs = r.map(p => p[0]), ys = r.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys);
  return { deg, width: Math.max(...xs) - x0, depth: Math.max(...ys) - y0, to: p => { const q = t(p); return [q[0] - x0, q[1] - y0]; }, from: ([X, Y]) => S.rotPt([X + x0, Y + y0], deg), rotTo: a => norm(a - deg), rotFrom: a => norm(a + deg) };
}

const LABEL = { building: 'Building', pool: 'Pool', play: 'Playground', court: 'Courts', pond: 'Pond', green: 'Lawn', plaza: 'Plaza', garage: 'Parking garage', patio: 'Patio', trash: 'Trash enclosure', drive: 'Drive', parking: 'Parking row', truck: 'Truck court', field: 'Parking field', trail: 'Trail', keepout: 'Easement' };
export const labelOf = e => e.name || (e.kind === 'plaza' && e.note ? e.note : LABEL[e.kind] || e.kind);

// the plan as the AI reads it. Parking rows and plain drives are summed up, not listed; on a big neighbourhood the
// houses are counted, not listed.
export function describePlan(plan, sel = null) {
  const f = sheetFrame(plan), els = plan.elements || [], r = v => Math.round(v), houses = els.filter(e => e.kind === 'building' && e.use === 'sfr'), many = houses.length > 120, ring = plan.ring || [];
  const pieces = [], ents = S.entrancesOf(els), ofE = new Map(); for (const d of ents) for (const a of S.entryParts(plan, d)) ofE.set(a, d.id); // an entrance's median and signs: of its id
  for (const e of els) {
    if (e.kind === 'lot' || e.kind === 'trail' || e.kind === 'parking' || (e.kind === 'drive' || e.kind === 'truck' || e.kind === 'field') && !e.name || e.kind === 'green' && !e.name && !ofE.has(e) || e.kind === 'plaza' && !/deck|plaza|court/i.test((e.name || '') + (e.note || '')) || many && e.use === 'sfr') continue;
    const c = f.to(S.centroid(S.shapeOf(e))), free = S.isFree(e), ent = S.isEntrance(e), rt = ent && S.routeOf(e, ring);
    pieces.push({ id: e.id, name: S.isMedian(e) ? 'Median' : labelOf(e), kind: e.kind, use: e.use || null, at: [r(c[0]), r(c[1])], size: free ? null : [r(e.w), r(e.d)], turn: (r(f.rotTo(e.rot || 0)) % 360 + 360) % 360, floors: e.floors ?? null, units: e.units ?? null, type: e.type || null, note: e.note || null, ...(ent ? { boulevard: !!e.blvd, width: rt ? r(rt.width) : null } : {}), ...(ofE.has(e) ? { of: ofE.get(e) } : {}), ...(S.isRing(e) ? { across: r(2 * S.ringOf(e).R) } : {}), ...(e.pinned ? { pinned: true } : {}), ...(e.id === sel ? { selected: true } : {}) });
  }
  const rules = S.edgeRules(ring, plan.front, plan.setbacks, plan.streets), fk = plan.front ?? S.longestEdge(ring), side = k => { if (k === fk) return 'front'; const o = S.outwardOf(ring, k), n = S.outwardOf(ring, fk), d = o[0] * n[0] + o[1] * n[1]; if (d < -0.5) return 'back'; const t = f.to(ring[k]), u = f.to(ring[(k + 1) % ring.length]); return (t[0] + u[0]) / 2 < f.width / 2 ? 'left' : 'right'; };
  const streets = ring.map((a, k) => k).filter(k => rules[k].role === 'front' || rules[k].street).sort((a, b) => (b === fk) - (a === fk)).map(k => ({ side: side(k), name: plan.streetNames?.[k] || null, from: f.to(ring[k]).map(r), to: f.to(ring[(k + 1) % ring.length]).map(r) }));
  const prog = S.normalizeProgram(plan.program || {}), parts = S.partsOf(plan, false).map(p => ({ part: p.i, use: p.use, label: p.word, name: p.name }));
  const J = S.junctionsOf(plan), junctions = J.filter(j => !j.parking).concat(J.filter(j => j.parking)).slice(0, 12).map(j => ({ at: f.to(j.at).map(r), legs: j.legs, meets: j.names, ...(j.main ? { main: true } : {}), ...(j.entry ? { entry: j.entry } : {}) })); // where streets meet (a roundabout goes at one): the streets' first, then the parking aisles'
  const rows = els.filter(e => e.kind === 'parking'), m = S.metrics(plan), byStories = {}; for (const h of houses) byStories[h.floors || 1] = (byStories[h.floors || 1] || 0) + 1;
  const pods = plan.recipe?.pods ? podsOf(plan, f, streets) : null, net = plan.recipe?.net ? netStreetsOf(plan, f, sel) : null;
  return { site: { acres: +(S.ringArea(plan.ring) / 43560).toFixed(2), widthFt: r(f.width), depthFt: r(f.depth), streets, entryRules: S.entryRules(plan), ...(plan.recipe?.net ? { streetRules: (R => ({ blockMaxFt: R.blockMax, culDeSacMaxFt: R.culMax, bulbRadiusFt: R.bulbR, junctionSpacingFt: R.junctionMin }))(streetRules(plan)) } : {}) }, community: prog.community, parts, places: placesOf(plan, f), ...(junctions.length ? { junctions } : {}), ...(pods ? { pods } : {}), ...(net?.length ? { streets: net, streetNames: { on: SNm.namesOn(plan), theme: plan.params?.streetNames?.theme || '' } } : {}), totals: { units: m.units || 0, floorAreaSf: r(m.gfa), parkingSpaces: m.spaces, parkingRequired: m.required, buildings: els.filter(e => e.kind === 'building').length },
    parking: { rows: rows.length, spaces: m.spaces }, ...(houses.length ? { houses: { count: houses.length, listed: !many, byStories, mix: homeMixOf(plan), ...(plan.recipe?.net ? { onCulDeSacs: culLots(plan) } : {}) } } : {}), pieces };
}
// a plan laid out in pods (lib/sitepods.mjs): each pod as the AI reads it, by its zone's name: what it holds, where
// (sheet feet) and the streets it faces (a road's name, the front or side street, the loop road)
function podsOf(plan, f, streets) {
  const els = plan.elements || [], list = plan.recipe.pods.list || [], ring = plan.ring || [], fk = plan.front ?? S.longestEdge(ring), colls = els.filter(e => e.skel && e.coll);
  return (plan.zones || []).filter(z => z.pod).map(z => { const p = list.find(q => q.id === z.pod), B = els.filter(e => e.pod === z.pod && e.kind === 'building' && e.use !== 'amenity'), c = f.to(S.centroid(z.ring)).map(Math.round), faces = new Set();
    for (const [k, e] of (p?.edges || []).entries()) { if (S.edgeLen(z.ring, k) < 120) continue; if (e.kind === 'street') faces.add(plan.streetNames?.[e.j] || (e.j === fk ? 'the front street' : 'the side street')); if (e.kind === 'coll') { const cc = colls.find(q => q.id === e.coll); faces.add('the ' + ((cc?.name || 'loop road').toLowerCase())); } }
    const homes = B.filter(e => ['sfr', 'townhomes', 'duplex'].includes(e.use)).reduce((t, e) => t + (e.units || 1), 0), units = B.filter(e => e.use === 'multifamily').reduce((t, e) => t + (e.units || 0), 0), gfa = B.filter(e => S.COMMERCIAL.includes(e.use)).reduce((t, e) => t + S.gfaOf(e), 0);
    return { id: 'pod:' + z.pod, name: z.name, use: z.use, part: z.zone, acres: +(+z.acres).toFixed(1), at: c, faces: [...faces].slice(0, 4), ...(homes ? { homes } : {}), ...(units ? { units } : {}), ...(gfa ? { floorAreaSf: Math.round(gfa) } : {}) }; });
}
// a neighbourhood's streets as the AI reads them (lib/streetnet.mjs chainsOf): each street's id, its name (or what it is),
// kind, length, how its ends finish, where it runs (sheet feet); the longest 80, the selected one marked
const ROLE_WORD = { boulevard: 'main entry', entry: 'way in', collector: 'collector', local: 'local street', court: 'cul-de-sac street' };
function netStreetsOf(plan, f, sel) {
  const r = v => Math.round(v), end = e => !e ? null : e.kind === 'tee' ? 'T' : e.kind === 'bulb' ? 'cul-de-sac' : e.kind === 'street' ? 'the street' : 'dead end';
  return chainsOf(plan).sort((a, b) => b.L - a.L).slice(0, 80).map(c => ({ id: c.key, name: c.name || c.label || ROLE_WORD[c.role], kind: c.role, lengthFt: c.L, ends: c.cyc ? ['loop'] : c.ends.map(end), ...(c.cyc ? {} : { from: f.to(c.ends[0].at).map(r), to: f.to(c.ends[1].at).map(r) }), mid: c.mid ? f.to(c.mid).map(r) : null, ...(sel && (c.ids.includes(sel) || c.bulbs.includes(sel)) ? { selected: true } : {}) }));
}
// homes on cul-de-sacs (a lot marched round a bulb: lib/streetnet.mjs)
const culLots = plan => { const els = plan.elements || [], bulbs = new Set(els.filter(e => e.kind === 'drive' && e.bulb && e.net).map(e => e.net)); return els.filter(e => e.kind === 'lot' && bulbs.has(e.on)).length; };
// the single-family home mix (share of homes by stories) the plan's homes are laid out with
export const homeMixOf = plan => { const p = S.normalizeProgram(plan.program || {}); return (p.homeMix || p.zones?.find(z => z.use === 'sfr' && z.homeMix)?.homeMix || S.HOME_MIX).map(t => ({ stories: t.stories, pct: t.pct })); };
// a new home mix across the plan: its program (and each zone of homes on lots) and the layout's recipe, so a re-fit lays
// the lots out again at the widths those homes need (a 3-story home sits on a 40 ft lot, a 2-story on 50, a 1-story on
// 60): the streets stay, the homes along them change. null when the mix keeps no homes.
export function withHomeMix(plan, mix) {
  const m = (mix || []).filter(t => [1, 2, 3].includes(t.stories) && t.pct > 0).map(t => ({ stories: t.stories, pct: t.pct })); if (!m.length) return null;
  const prog = p => p && typeof p === 'object' ? { ...p, homeMix: m, ...(Array.isArray(p.zones) ? { zones: p.zones.map(z => z?.use === 'sfr' ? { ...z, homeMix: m } : z) } : {}) } : p;
  const seq = q => q?.seq?.blocks ? { seq: { ...q.seq, blocks: q.seq.blocks.map(b => b.fill === 'sfr' && b.prog ? { ...b, prog: { ...b.prog, homeMix: m } } : b) } } : {};
  const net = q => q?.net ? { net: { ...q.net, mix: m } } : {}; // subdivision streets (lib/streetnet.mjs): the lots marched again along the same streets with the new mix
  const pods = r => r?.pods ? { pods: { ...r.pods, list: r.pods.list.map(p => p.use === 'sfr' ? { ...p, prog: { ...(p.prog || {}), homeMix: m }, recipe: p.recipe && { ...p.recipe, ...seq(p.recipe), ...net(p.recipe) } } : p) } } : {}; // a plan in pods: each pod of homes (its program and recipe; the re-fit lays the changed ones out again)
  const rc = plan.recipe && { ...plan.recipe, ...(plan.recipe.prog ? { prog: prog(plan.recipe.prog) } : {}), ...seq(plan.recipe), ...net(plan.recipe), ...pods(plan.recipe) };
  return { program: prog(plan.program || {}), recipe: rc || null, mix: m };
}
// the mix with only these stories kept, their shares scaled up to the whole (equal shares when none had any)
export function keepStories(mix, keep) {
  const k = [...new Set(keep)].filter(n => [1, 2, 3].includes(n)).sort(); if (!k.length) return null;
  const has = k.map(n => ({ stories: n, pct: mix.find(t => t.stories === n)?.pct || 0 })), tot = has.reduce((s, t) => s + t.pct, 0);
  return has.map(t => ({ stories: t.stories, pct: Math.round(tot > 0 ? t.pct / tot * 100 : 100 / k.length) }));
}
export const mixText = mix => mix.filter(t => t.pct > 0).map(t => Math.round(t.pct) + '% ' + t.stories + '-story').join(', ');
// where things are, in the drawing's feet (x across the frontage, y back from the street), so "the back of the site",
// "the middle of the homes" or "in front of the apartments" can be turned into a spot: the site's front, middle and back
// (and left / right), each zone's middle, and where each kind of building sits (its middle and extent). Rounded.
export function placesOf(plan, f = sheetFrame(plan)) {
  const r = v => Math.round(v), W = f.width, D = f.depth, els = plan.elements || [];
  const site = { front: [r(W / 2), r(D * 0.15)], middle: [r(W / 2), r(D / 2)], back: [r(W / 2), r(D * 0.85)], left: [r(W * 0.15), r(D / 2)], right: [r(W * 0.85), r(D / 2)] };
  const box = pts => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return { middle: [r(xs.reduce((a, b) => a + b, 0) / xs.length), r(ys.reduce((a, b) => a + b, 0) / ys.length)], from: [r(Math.min(...xs)), r(Math.min(...ys))], to: [r(Math.max(...xs)), r(Math.max(...ys))] }; };
  const groups = {}, label = e => e.kind === 'building' ? (S.USES[e.use]?.label || 'Buildings') : e.kind === 'pond' ? 'Ponds' : e.kind === 'parking' ? 'Parking' : null;
  for (const e of els) { const k = label(e); if (!k) continue; (groups[k] ||= []).push(f.to(S.centroid(S.shapeOf(e)))); }
  const areas = Object.entries(groups).map(([name, pts]) => ({ name, count: pts.length, ...box(pts) }));
  const parts = S.partsOf(plan, false), shown = z => (z.zone != null ? parts.find(p => p.i === z.zone) : parts.find(p => p.ring === z.ring))?.name; // (a zone with a name of its own goes by it: "the middle of Beacon Hill Market")
  const zones = (plan.zones || []).filter(z => z.ring?.length >= 3).map(z => ({ name: shown(z) || z.name || S.USES[z.use]?.label || z.use, use: z.use, ...box(z.ring.map(p => f.to(p))) }));
  return { site, areas, ...(zones.length ? { zones } : {}) };
}
// the library as the AI reads it: id, name and footprint
export const catalogText = () => BUILDING_TYPES.map(t => t.id + ' = ' + t.name + ' · ' + t.w + ' × ' + t.d + ' ft').join('\n');

// ---------- applying edits ----------
// op: { action: change | remove | add | move | swap | relay | culdesac | bend | streetNames, target, with, type, kind, use,
// name, floors, units, w, d, x, y, turn, turnBy, boulevard, signs, every, floorsOver, curve, end, street, on, theme } (add
// with kind 'entrance': a driveway in from the street at x, y, else where it helps most; boulevard: two lanes and a
// planted median, signs: where its monument signs go; kind 'roundabout': at the junction at x, y, the one an entrance
// named in with ends at, the one nearest the piece named, else the main one, w its diameter; kind 'loop': a drop-off
// loop in front of the building in with). turn sets a rectangle's angle; turnBy turns any piece by that much (curved ponds, lawns, drawn outlines, entrances: S.turnPiece).
// every (change / remove, no target): every piece of that use ('multifamily', 'townhomes'…) or kind ('pool', 'building'…),
// only those with more than floorsOver floors when it's given; listed or not ("make all the apartments 3 stories").
// Homes on lots don't change stories one by one: their lots are sized for them, so that's the home mix (withHomeMix).
// A neighbourhood's streets (target: a street's id from describePlan's streets, or any of its drives): culdesac (end:
// 'start' | 'end' | null), bend (curve: ft, + to the left), relay (its block laid out again, run by the caller: blocks),
// remove (the whole street), change with street (its name); streetNames { on, theme } is the caller's to run.
// x, y, turn are in the sheet's frame. Returns { elements, streets, done: [sentences], skipped: [sentences], touched: [ids],
// pods, blocks, streetNames? (hand: only switched on by a street named here), named? (those names), recipe? (street names
// on the recipe's streets too) }.
// Every piece changed, moved or added is pinned, so a re-fit lays the rest out round it.
export function applyEdits(plan, ops, opts = {}) {
  const f = sheetFrame(plan), done = [], skipped = [], touched = new Set(), placed = new Set(), turned = new Map(); // placed: moved, resized or new (checked for a clear spot); turned: a pond turned, as it was (and the line saying so)
  let els = (plan.elements || []).map(e => structuredClone(e)), streets = plan.streets || [];
  const P = () => ({ ...plan, elements: els }), byId = id => id && els.find(e => e.id === id), id = opts.newId || (() => 'e' + Math.random().toString(36).slice(2, 9));
  const left = [], ground = x => S.isRing(x) ? (g => S.ringDisc(g.c, g.R + 2))(S.ringOf(x)) : S.outline(x); // where moved and removed pieces were: parking they had cut there grows back (a roundabout puts back the rows it cut itself)
  // a park as it was, with what moved with it (put back where they were when there's no clear spot for it: its name and
  // the rest of what changed stay), and the line that said what was done to it, the word for it and the line without
  // the move ([line, 'moved', 'Park: named Big park.' or null])
  const orig = new Map(), said = new Map(), keep = (t, also = []) => { if (t?.kind === 'green' && !orig.has(t.id)) orig.set(t.id, [t, ...also].map(x => structuredClone(x))); }, say = (ids, word, rest = null) => { for (const i of ids) said.set(i, [done[done.length - 1], word, rest]); };
  // a home on a lot removed: its lot stays, marked vacant (a re-fit of subdivision streets leaves its place empty)
  const vacate = gone => { for (const h of gone) if (h.kind === 'building' && h.use === 'sfr') for (const l of els) if (l.kind === 'lot' && Math.abs(l.x - h.x) < 250 && Math.abs(l.y - h.y) < 250 && S.inRing([h.x, h.y], S.shapeOf(l))) l.vacant = true; };
  const GEO = ['x', 'y', 'w', 'd', 'rot', 'poly', 'path', 'pinned'], putBack = x => { const e = byId(x.id); if (e) for (const k of GEO) { if (x[k] === undefined) delete e[k]; else e[k] = x[k]; } };
  const noRoom = (near, e) => 'No room beside ' + labelOf(near) + ' for ' + labelOf(e) + ': every side runs into a street, a building or the lot line.' + (S.isPark(e) ? ' Try a smaller one, or beside something else.' : '');
  const moveWith = (t, dx, dy, att) => { for (const x of [t, ...att]) { if (!S.isRing(x)) left.push(S.outline(x)); S.moveBy(x, dx, dy); x.pinned = true; touched.add(x.id); } placed.add(t.id); };
  // a turn asked for: turnBy (any piece), or turn (an angle) on a free piece or an entrance, as the change from where it
  // stands. turnIt turns it on the plan (an entrance swings about its middle, its mouth sliding along the street)
  let lastTurn = 0, turnNote = ''; const turnOf = t => { const d = op0.turnBy != null && Number.isFinite(+op0.turnBy) && +op0.turnBy ? +op0.turnBy : op0.turn != null && (S.isFree(t) || S.isEntrance(t)) ? ((f.rotFrom(op0.turn) - (t.rot || 0)) % 360 + 540) % 360 - 180 : null; return d != null && Math.abs(d) >= 0.5 ? d : null; }; // (the angle it has already, echoed back: no turn)
  const turnIt = (t, d) => { if (t.kind === 'pond' && !turned.has(t.id)) turned.set(t.id, [structuredClone(t), done.length]); const r = S.turnPiece(P(), t, d); els = r.elements; lastTurn = r.deg; turnNote = r.note || ''; if (r.why) skipped.push(labelOf(t) + ': ' + r.why); }; // (turnNote: where an entrance's signs went, said with the turn: not something left undone)
  const signsWord = t => { const g = S.entryParts(P(), t).filter(x => x.kind === 'sign'); return !g.length ? 'no monument signs' : g.some(x => x.sign === 'median') ? 'signs in the median' : g.length > 1 ? 'signs at both corners' : 'a sign at the ' + (g[0].note || 'corner').toLowerCase(); };
  let op0 = {};
  // a building's type from the library, floors, units or use; the words for what changed go in what
  const alter = (t, op, what) => {
    if (op.type) { const T = typeById(op.type); if (!T) skipped.push('No building type ' + op.type + ' in the library.'); else { const keep = { id: t.id, x: t.x, y: t.y, rot: t.rot || 0, name: t.use === T.use ? t.name : '' }; for (const k of ['poly', 'form', 'wing', 'podium', 'unitW', 'sf', 'units', 'jog', 'shape', 'type', 'storage', 'ft', 'fuel']) delete t[k]; Object.assign(t, fromType(T, [t.x, t.y], t.rot || 0), keep); what.push('a ' + T.name.replace(/ · /g, ', ')); } }
    if (op.floors && t.kind === 'building' && op.floors !== t.floors) { if (t.units && !op.units) t.units = Math.max(1, Math.round(t.units * op.floors / (t.floors || 1))); t.floors = Math.round(op.floors); what.push(t.floors + (t.floors > 1 ? ' stories' : ' story')); }
    if (op.units && t.kind === 'building') { t.units = Math.round(op.units); what.push(t.units + ' units'); }
    if (op.use && t.kind === 'building' && op.use !== t.use && S.USES[op.use]) { t.use = op.use; delete t.type; what.push(S.USES[op.use].label.toLowerCase()); }
  };
  const use0 = S.normalizeProgram(plan.program || {}).use, isUse = k => !!S.USES[k], useOf = e => e.use || use0;
  let zones = null; const pods = [], podName = id => (plan.zones || []).find(z => z.pod === String(id).replace(/^pod:/, ''))?.name || 'that pod', podOf = id => { if (/^pod:/.test(id || '')) return id.slice(4); const e = (plan.elements || []).find(x => x.id === id); return e?.pod || null; };
  const blocks = [], named = []; let names = null, recipe = null; // (blocks: a neighbourhood's blocks to lay out again, run by the caller in the worker; names: street names on or off; named: the names given here, kept when the rest are named)
  for (const op of ops || []) { op0 = op;
    if (op.action === 'streetNames') { if (!plan.recipe?.net) { skipped.push('Street names go on a neighbourhood’s own streets, and this plan has none: New Layouts with Settings › Neighbourhood streets › Like a subdivision.'); continue; } names = { on: op.on !== false, theme: String(op.theme || '').slice(0, 80) }; continue; } // (named by the caller: the AI, else the plain list)
    if (plan.recipe?.net && !/^pod:/.test(op.target || '')) { // a neighbourhood's streets (lib/streetedit.mjs): a cul-de-sac, a bow, a block re-laid, a street removed or named
      const c = op.target ? SE.chainOf(P(), op.target) : null, e0 = byId(op.target), street = c && e0?.kind === 'drive' && !e0.bulb && (e0.net || S.isEntrance(e0));
      if (op.action === 'culdesac' || op.action === 'bend') { if (!c) { skipped.push('Couldn’t find which street to ' + (op.action === 'bend' ? 'curve' : 'end in a cul-de-sac') + ': select it, or say its name.'); continue; }
        const r = op.action === 'culdesac' ? SE.culDeSac(P(), c.ids[0], { end: op.end, id: id() }) : SE.bendStreet(P(), c.ids[0], Number.isFinite(+op.curve) && op.curve != null ? +op.curve : null);
        if (r.error) { skipped.push(r.error); continue; } els = r.elements; for (const x of r.touched) touched.add(x); done.push(r.note); continue; }
      if (op.action === 'relay') { const at = op.target ? SE.blockAt(P(), op.target) : null; if (!at) { skipped.push(c && !['local', 'court'].includes(c.role) ? SE.streetWord(c) + ' runs between blocks: select a street or a home inside the block to lay out again.' : 'Say which block to lay out again: select a street or a home in it.'); continue; } blocks.push({ op: 'relay', at }); done.push('Laying that block’s streets out again…'); continue; }
      if (op.action === 'remove' && street && !S.isEntrance(e0)) { const gone = new Set(c.ids.concat(c.bulbs)); els = els.filter(e => !gone.has(e.id)); done.push('Removed ' + SE.streetWord(c).replace(/^The /, 'the ') + ' (' + c.L.toLocaleString('en-US') + ' ft' + (c.bulbs.length ? ', with its cul-de-sac' + (c.bulbs.length > 1 ? 's' : '') : '') + '); its homes go with the re-fit.'); continue; }
      if (op.action === 'change' && op.street && c) { const r = SNm.rename({ ...P(), recipe: recipe || plan.recipe }, c.key, op.street); if (r.error) { skipped.push(r.error); continue; } els = r.elements; recipe = r.recipe; for (const x of c.ids) touched.add(x); done.push('Named ' + (c.name || c.label || 'the street') + ' ' + r.name + '.'); named.push(r.name); if (!SNm.namesOn(plan)) names ||= { on: true, theme: '', hand: true }; continue; } // (hand: names only switched on, none given anew)
    }
    if (op.action === 'culdesac' || op.action === 'bend') { skipped.push('Only subdivision streets can ' + (op.action === 'bend' ? 'curve' : 'end in a cul-de-sac') + ' here: New Layouts with Settings › Neighbourhood streets › Like a subdivision.'); continue; }
    if (op.action === 'streets') { skipped.push('Subdivision streets (a loop road, curved streets meeting it at T’s, cul-de-sacs) come with New Layouts and Settings › Neighbourhood streets › Like a subdivision; a re-fit keeps the streets the plan has.'); continue; }
    if (/^pod:/.test(op.target || '') || op.action === 'relay' || op.action === 'swap' && op.kind === 'pod') { // a pod laid out again, or two that trade places (lib/sitepods.mjs relayPods, run by the caller)
      if (!plan.recipe?.pods) { skipped.push('Only a plan laid out in pods can re-lay a pod: New Layouts with Settings › Mixed sites › Pods.'); continue; }
      const a = podOf(op.target), b = podOf(op.with); if (!a) { skipped.push('Couldn’t find which part of the plan to re-lay.'); continue; }
      if (op.action === 'swap') { if (!b || b === a) { skipped.push('Couldn’t find the other pod to swap with.'); continue; } pods.push({ op: 'swap', a, b }); done.push('Swapping ' + podName(a) + ' and ' + podName(b) + '…'); continue; }
      if (op.action === 'remove') { skipped.push('A whole pod can’t be removed here: select its pieces and delete them, or re-lay ' + podName(a).replace(/^The /, 'the ') + ' as another use.'); continue; }
      const what = op.use && S.USES[op.use] && op.use !== (plan.zones || []).find(z => z.pod === a)?.use || op.units || op.gfa || op.floors;
      if (op.action === 'change' && op.name && !what) { const k = (zones ||= (plan.zones || []).map(z => ({ ...z }))).findIndex(z => z.pod === a); if (k >= 0) { done.push('Named ' + podName(a) + ' “' + op.name + '”.'); zones[k].name = String(op.name).slice(0, 40); } continue; } // a pod renamed: its zone's name, nothing laid out again
      if (op.action !== 'relay' && !(op.action === 'change' && what)) { skipped.push('A whole pod can be laid out again (with another use, size or number of stories), swapped with another or renamed; to move or turn its pieces, select them.'); continue; } // (never laid out again unchanged for a request it doesn't carry out)
      pods.push({ op: 'relay', pod: a, ...(op.use && S.USES[op.use] ? { use: op.use } : {}), ...(op.units ? { units: op.units } : {}), ...(op.gfa ? { gfa: op.gfa } : {}), ...(op.floors ? { floors: Math.round(op.floors) } : {}) }); done.push('Re-laying ' + podName(a) + (op.floors ? ' at ' + Math.round(op.floors) + (Math.round(op.floors) === 1 ? ' story' : ' stories') : '') + '…'); continue;
    }
    if (op.every && !op.target && (op.action === 'change' || op.action === 'remove')) { // every piece of a use or kind at once
      const word = n => isUse(op.every) ? (EVERY[op.every] || [S.USES[op.every].label.toLowerCase() + ' building'])[0] + (n === 1 ? '' : (EVERY[op.every] || [undefined, 's'])[1]) : (LABEL[op.every] || op.every).toLowerCase().replace(/s$/, '') + (n === 1 ? '' : 's'), over = Number.isFinite(op.floorsOver) ? op.floorsOver : null;
      let hit = els.filter(e => (isUse(op.every) ? e.kind === 'building' && useOf(e) === op.every : e.kind === op.every) && (over == null || (e.floors || 1) > over));
      const desc = n => word(n) + (over != null ? ' over ' + over + (over === 1 ? ' story' : ' stories') : '');
      if (op.action === 'change' && op.floors) { const lots = hit.filter(e => e.kind === 'building' && useOf(e) === 'sfr'); if (lots.length) { skipped.push('Homes on lots take their stories from the home mix (their lots are sized for them), not one by one.'); hit = hit.filter(e => !lots.includes(e)); if (!hit.length) continue; } }
      if (!hit.length) { skipped.push('No ' + desc(0) + ' on the plan.'); continue; }
      if (op.action === 'remove') { const gone = new Set(); for (const t of hit) { gone.add(t); for (const a of S.attachedTo(P(), t)) gone.add(a); } for (const x of gone) { left.push(S.outline(x)); if (x.kind === 'sign') els = S.dropSign(P(), x); } els = els.filter(e => !gone.has(e)); vacate(gone); done.push('Removed ' + hit.length + ' ' + desc(hit.length) + (gone.size > hit.length ? ' and what went with them' : '') + '.'); continue; }
      let n = 0, what = [];
      for (const t of hit) { const w = []; keep(t); alter(t, op, w); if (w.length) { n++; what = w; t.pinned = true; touched.add(t.id); if (op.type) placed.add(t.id); } }
      done.push(n ? (n === 1 ? 'The one ' : 'All ' + n + ' ') + desc(n) + ': ' + what.join(', ') + '.' : 'Nothing to change on the ' + desc(2) + ': already that way.'); continue;
    }
    const t = byId(op.target), at = op.x != null && op.y != null ? f.from([op.x, op.y]) : null, rot = op.turn != null ? f.rotFrom(op.turn) : null;
    if (op.action !== 'add' && !t) { skipped.push('Couldn’t find ' + (op.target ? 'piece ' + op.target : 'which piece to change') + '.'); continue; }
    if (op.action === 'remove' && S.isRing(t)) { els = S.dropRing(P(), t); done.push('Removed ' + labelOf(t) + '. The streets run through the junction again.'); continue; } // (the parking it cut comes back; the homes that made way come back with a re-fit)
    if (op.action === 'remove' && S.isLoop(t)) { els = S.dropLoop(P(), t); done.push('Removed ' + labelOf(t) + '.'); continue; } // (the parking it cut and the park strip it took come back)
    if (op.action === 'remove') {
      const att = S.attachedTo(P(), t); left.push(...[t, ...att].map(x => S.outline(x))); els = (t.kind === 'sign' ? S.dropSign(P(), t) : els).filter(e => e !== t && !att.includes(e)); vacate([t]); /* (an entrance's sign: it remembers it's gone) */ done.push('Removed ' + labelOf(t) + (att.length ? ' and its ' + [...new Set(att.map(a => S.isMedian(a) ? 'median' : a.kind === 'sign' ? (att.filter(x => x.kind === 'sign').length > 1 ? 'monument signs' : 'monument sign') : labelOf(a).toLowerCase()))].join(', ') : '') + '.'); continue; // (an entrance's median, not a lawn)
    }
    if (op.action === 'swap') {
      const w = byId(op.with); if (!w) { skipped.push('Couldn’t find what to swap ' + labelOf(t) + ' with.'); continue; }
      const a1 = S.attachedTo(P(), t), a2 = S.attachedTo(P(), w), d = [w.x - t.x, w.y - t.y], r1 = t.rot || 0, r2 = w.rot || 0;
      keep(t, [w, ...a1, ...a2]); keep(w, [t, ...a1, ...a2]); moveWith(t, d[0], d[1], a1); moveWith(w, -d[0], -d[1], a2); if (!S.isFree(t) && !S.isFree(w) && a1.length + a2.length === 0) { t.rot = r2; w.rot = r1; }
      done.push('Swapped ' + labelOf(t) + ' and ' + labelOf(w) + '.'); say([t.id, w.id], 'swapped'); continue;
    }
    if (op.action === 'move') {
      const near = byId(op.with), att = S.attachedTo(P(), t), r0 = t.rot; keep(t, att); if (rot != null && !S.isFree(t) && !at && op.turnBy == null) t.rot = rot; // (turned first: beside() finds room for it as it will stand)
      const to = at || (near ? beside(near, t, f, P(), att, placed.has(near.id)) : null); if (!to) { t.rot = r0; skipped.push(near ? noRoom(near, t) : 'No place given to move ' + labelOf(t) + ' to.'); continue; }
      const c = S.centroid(S.shapeOf(t)); moveWith(t, to[0] - c[0], to[1] - c[1], att);
      const tw = turnOf(t); if (tw != null) turnIt(t, tw); else if (rot != null) t.rot = rot; done.push('Moved ' + labelOf(t) + (tw != null ? ' and turned it ' + Math.round(Math.abs(lastTurn)) + '°' : '') + '.' + (tw != null && turnNote ? ' ' + turnNote : '')); say([t.id], 'moved'); continue;
    }
    if (op.action === 'add' && op.kind === 'roundabout') { // where streets meet: at x, y, where the entrance named ends, nearest the piece named, else the main junction
      const near = !at && byId(op.with), J = S.junctionsOf(P()); let p = at, snap = 200;
      if (!p && op.with && !near) { skipped.push('Couldn’t find ' + op.with + ' on the plan for a roundabout by it: say which junction, or the main intersection.'); continue; }
      if (!p && near && S.isEntrance(near)) { const j = J.find(j => j.entry === near.id), rt = S.routeOf(near, plan.ring || []); p = j ? j.at : rt.path[rt.path.length - 1]; snap = 80; }
      else if (!p && near) { const sh = S.shapeOf(near), j = J.map(j => ({ j, d: S.gapBetween(sh, S.ringDisc(j.at, 1, 8)) })).filter(x => x.d <= 400).sort((a, b) => a.d - b.d)[0]; p = j?.j.at; if (!p) { skipped.push('No junction of streets within 400 ft of ' + labelOf(near) + ' for a roundabout.'); continue; } }
      else if (!p) p = J.find(j => j.main)?.at;
      if (!p) { skipped.push('No junction of streets on the plan for a roundabout.'); continue; }
      let r = S.addRoundabout(P(), p, { id: id(), R: op.w ? op.w / 2 : null, snap, near: true }); // (near: the next junction when that one has no room, and it says so)
      if (r.error && !near && !/already/.test(r.error)) { const r2 = S.addRoundabout(P(), p, { id: id(), R: op.w ? op.w / 2 : null, snap: 800, near: true }); if (!r2.error) r = r2; } // (a spot or the main junction with no room near it: the nearest junction that has some)
      if (r.error) { skipped.push(r.error); continue; }
      els = r.elements; touched.add(r.roundabout.id); // (not the streets it cut back: only shorter, and parking along them stays)
      done.push('Added ' + r.roundabout.name + ' (' + Math.round(r.roundabout.w) + ' ft across) where ' + S.meetsWord(r.meets) + ' meet.' + (r.note ? ' ' + r.note : '')); continue;
    }
    if (op.action === 'add' && op.kind === 'loop') { // a one-way drop-off loop in front of a building (the plan's one clubhouse when none is named)
      let b = byId(op.with) || t; if (!b) { const cl = els.filter(e => e.kind === 'building' && (e.use === 'amenity' || /club|community|amenity/i.test(e.name || ''))); b = cl.length === 1 ? cl[0] : null; }
      if (!b) { skipped.push('Say which building the drop-off loop is for.'); continue; }
      const r = S.addLoop(P(), b, { id: id(), len: op.w || null }); if (r.error) { skipped.push(r.error); continue; }
      els = r.elements; touched.add(r.loop.id); done.push('Added a drop-off loop ' + (r.side && r.side !== 'front' ? 'on the ' + r.side + ' of ' : 'in front of ') + labelOf(b) + '.' + (r.note ? ' ' + r.note : '')); continue;
    }
    if (op.action === 'add' && op.kind === 'entrance') { // a driveway in from the street: where asked (or on the street beside the piece named), else where it helps most
      const near = !at && byId(op.with), ents = S.entrancesOf(els).map(S.outline), taken = q => ents.some(o => o.some(p => Math.hypot(p[0] - q[0], p[1] - q[1]) < 100)), ring = plan.ring || [];
      // (beside a piece where there's a way in already, as when two are asked for by it: 150 ft along the street either side)
      const along = q => { const k = S.nearestEdge(ring, q), a = ring[k], b = ring[(k + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [150, -150].map(d => [q[0] + (b[0] - a[0]) / L * d, q[1] + (b[1] - a[1]) / L * d]).filter(p => !taken(p)); };
      const bo = op.boulevard ? { boulevard: true, ...(op.signs ? { sign: op.signs } : {}) } : {}, sp = S.entryRules(P()).spacing, mouths = S.entrancesOf(els).map(e => S.mouthOf(e, ring)), crowd = q => mouths.some(m => Math.hypot(m[0] - q[0], m[1] - q[1]) < sp);
      const more = (o = {}) => (m => m.added.length ? { elements: m.elements, entrance: m.added[0], streets: P().streets, note: m.why || '' } : { error: m.note })(S.moreEntrances({ ...P(), streets }, 1, { ...o, ...bo }));
      // asked for where a way in is already nearer than the spacing (the middle of a street the main entry is on): the
      // nearest spot along that street that keeps it, else no room there (it's never put on top of another)
      const crowded = at && crowd(at), asks = crowded ? [] : at ? [at] : near ? streetPoints({ ...P(), streets }, near).flatMap(q => taken(q) ? along(q) : [q]) : [];
      let r = asks.length ? null : crowded ? more({ edges: [S.nearestEdge(ring, at)], near: at }) : more(), past = '', why = null;
      if (crowded && !r.error) past = ' It’s ' + Math.round((m => Math.hypot(m[0] - at[0], m[1] - at[1]))(S.mouthOf(r.entrance, ring))) + ' ft along the street from where it was asked, about ' + sp + ' ft or more from the next way in.';
      for (const ask of asks) { // each lot line it could come from in turn; a park in the way: along the street past it
        let q = S.addEntrance({ ...P(), streets }, ask, { id: id(), ...bo });
        if (q.error && q.park) { const r2 = S.addEntrance({ ...P(), streets }, ask, { id: id(), slide: 400, ...bo }); if (!r2.error) { past = ' It’s ' + Math.round(Math.hypot(r2.at[0] - ask[0], r2.at[1] - ask[1])) + ' ft along the street from where it was asked, clear of ' + q.park.name + '.'; q = r2; } }
        if (!q.error) { r = q; break; } if (!why || q.park && !why.park) why = q; }
      r ||= why; if (r.error) { skipped.push(r.error); continue; }
      els = r.elements; streets = r.streets || streets; touched.add(r.entrance.id); const sw = S.entryParts(P(), r.entrance).some(x => x.kind === 'sign') ? ' with ' + signsWord(r.entrance) : ''; done.push('Added ' + r.entrance.name + (r.entrance.blvd ? ', a boulevard,' : '') + ' from the street' + sw + '.' + past + (r.note ? ' ' + r.note : '')); continue;
    }
    if (op.action === 'add') {
      const T = op.type && typeById(op.type), kind = T ? 'building' : op.kind || 'building', near = byId(op.with);
      const e = T ? { id: id(), ...fromType(T, [0, 0], 0) } : { id: id(), kind, x: 0, y: 0, w: op.w || DEF[kind]?.[0] || 60, d: op.d || DEF[kind]?.[1] || 40, rot: 0, ...(kind === 'building' ? { use: op.use || 'retail', floors: op.floors || 1 } : {}), ...(DEF[kind]?.[2] ? { name: DEF[kind][2] } : {}) };
      if (op.name) e.name = op.name; if (op.floors && e.kind === 'building') e.floors = op.floors; if (op.units) e.units = op.units;
      e.rot = rot ?? (near && !S.isFree(near) ? near.rot || 0 : f.rotFrom(0));
      let to = at || (near ? beside(near, e, f, P(), [], placed.has(near.id)) : f.from([f.width / 2, f.depth / 2])), small = '';
      if (!to && S.isPark(e) && !op.w && !op.d && !S.isFree(e)) { const w0 = e.w, d0 = e.d; e.w = Math.round(w0 * 0.75); e.d = Math.round(d0 * 2 / 3); to = beside(near, e, f, P(), [], placed.has(near.id)); if (to) small = ' (' + e.w + ' × ' + e.d + ' ft: a ' + w0 + ' × ' + d0 + ' didn’t fit beside ' + labelOf(near) + ')'; else { e.w = w0; e.d = d0; } } // no size asked: a smaller one before none
      if (!to) { skipped.push(noRoom(near, e)); continue; }
      e.x = +to[0].toFixed(2); e.y = +to[1].toFixed(2); e.pinned = true;
      els.push(e); touched.add(e.id); placed.add(e.id); done.push('Added ' + (T ? T.name : labelOf(e)) + small + '.'); say([e.id], 'added'); continue;
    }
    if (op.action === 'change' && op.w && S.isLoop(t)) { // a drop-off loop longer or shorter: laid out again in front of its building
      const was = labelOf(t), w0 = []; alter(t, op, w0); const b = S.loopOf(P(), t), r = b ? S.addLoop({ ...P(), elements: S.dropLoop(P(), t) }, b, { id: t.id, name: t.name, len: op.w }) : { error: was + '’s building is gone: add a new drop-off loop in front of a building instead.' }; // (its building laid out again under a new id: the one it stands in front of)
      if (r.error) { skipped.push(r.error); continue; } els = r.elements; touched.add(t.id); done.push(was + ': ' + [...w0.filter(Boolean), Math.round(r.loop.w) + ' ft long'].join(', ') + '.' + (r.note ? ' ' + r.note : '')); continue; }
    // change: another type from the library, more floors, a size, a use, a name, a turn, a new spot
    const was = labelOf(t), what = []; keep(t, at ? S.attachedTo(P(), t) : []); alter(t, op, what);
    if (op.w && S.isRing(t)) { S.resizeRing(t, op.w / 2); what.push(Math.round(t.w) + ' ft across'); placed.add(t.id); } // (joined to the streets again below)
    if ((op.w || op.d) && !S.isFree(t)) { if (op.w) t.w = op.w; if (op.d) t.d = op.d; delete t.type; what.push(Math.round(t.w) + ' × ' + Math.round(t.d) + ' ft'); }
    const tw = turnOf(t), extra = [];
    if (tw != null) { turnIt(t, tw); what.push('turned ' + Math.round(Math.abs(lastTurn)) + '°'); extra.push(turnNote); } else if (rot != null && !S.isFree(t) && !S.isEntrance(t) && Math.abs(((rot - (t.rot || 0)) % 360 + 540) % 360 - 180) >= 0.5) { t.rot = rot; what.push('turned'); }
    if (op.boulevard && S.isEntrance(t) && !t.blvd) { const r = S.makeBoulevard(P(), t, op.signs ? { sign: op.signs } : {}); if (r.error) skipped.push(r.error); else { els = r.elements; const R0 = S.entryRules(P()); what.push('a boulevard (two ' + R0.lane + ' ft lanes, a ' + R0.median + ' ft median)', signsWord(t)); extra.push(r.note, r.why); } }
    else if (op.signs && S.isEntrance(t)) { const r = S.refreshEntry(P(), t, op.signs); els = r.elements; what.push(signsWord(t)); extra.push(r.why); }
    else if (op.boulevard && !S.isEntrance(t)) skipped.push(labelOf(t) + ' isn’t a way in from the street, so it can’t be a boulevard.');
    if (op.name) { t.name = op.name; what.push('named ' + op.name); }
    if (at) { const att = S.attachedTo(P(), t), c = S.centroid(S.shapeOf(t)); moveWith(t, at[0] - c[0], at[1] - c[1], att); what.push('moved'); }
    t.pinned = true; touched.add(t.id); if (op.type || (op.w || op.d || rot != null) && !S.isFree(t) || tw != null) placed.add(t.id); // (a drawn outline keeps its size: turned, it finds a clear spot as a rectangle does)
    for (const a of S.isEntrance(t) && (tw != null || op.boulevard || op.signs) ? S.entryParts(P(), t) : []) touched.add(a.id);
    const rest = what.filter(w => w && !/^(moved|turned( \d+°)?|\d+ × \d+ ft)$/.test(w)); // (what stays if the park can't go where asked)
    done.push((what.filter(Boolean).length ? was + ': ' + what.filter(Boolean).join(', ') + '.' : 'Nothing to change on ' + was + '.') + extra.filter(Boolean).map(x => ' ' + x).join('')); say([t.id], at ? 'moved' : op.w || op.d ? 'resized' : rot != null || tw != null ? 'turned' : 'changed', rest.length ? was + ': ' + rest.join(', ') + '.' : null);
  }
  // a roundabout or a drop-off loop moved or resized: joined to the streets where it lands (a roundabout settles on the
  // junction there; something in the way is said, and shows in red)
  for (const tid of [...placed]) { const e = byId(tid); if (!S.isRing(e) && !S.isLoop(e)) continue; const r = S.reseat(P(), e); els = r.elements; if (r.why) skipped.push(r.why); if (r.note) done.push(r.note); }
  // a park, lawn or open space placed or moved: first a spot clear of the streets, the other buildings and the lot line
  // (the homes under it make way after, as for a building); with none near, it isn't added or moved (a park across a
  // street was the worst of it: the re-fit then laid the streets round it)
  for (const tid of [...placed]) {
    const e = byId(tid); if (!e || !S.isPark(e)) continue;
    const o0 = orig.get(e.id), c = S.clearSpot(P(), e, { obs: S.placeObs(P(), e, [], o0 && S.shapeOf(o0[0])), reach: Math.max(e.w || 0, e.d || 0) + 120 }); // (one already on the plan: what stands in it is its own, and it keeps the room it had)
    if (c) { if (c[0] || c[1]) S.moveBy(e, c[0], c[1]); continue; }
    const [line, word, rest] = said.get(e.id) || [null, o0 ? 'moved' : 'added', null], k = done.indexOf(line); if (k >= 0) { if (rest) done[k] = rest; else done.splice(k, 1); }
    if (o0) { for (const x of o0) { putBack(x); placed.delete(x.id); if (!rest || x.id !== e.id) touched.delete(x.id); } if (rest) e.pinned = true; } else { els = els.filter(x => x !== e); touched.delete(tid); } placed.delete(tid);
    skipped.push(labelOf(e) + ' doesn’t fit there clear of the streets and buildings, so it wasn’t ' + word + '.' + (word === 'added' || word === 'resized' ? ' Try a smaller one, or another spot.' : ''));
  }
  // a pond turned: the nearest spot inside the lot (its buffers kept) and clear of the drives, buildings and amenities
  // (homes make way); none near, it stays as it was and says so, before any homes make way for it. (The drives were left
  // to a re-fit once: off by default, and when on it often couldn't lay them round the pond without losing homes, so
  // the pond sat on the main entry.)
  for (const [tid, [was, at]] of turned) { const e = byId(tid); if (!e) continue; const c = S.clearSpot(P(), e, { obs: S.placeObs(P(), e, [], S.shapeOf(was)), reach: 120 }); // (as a park: the homes make way, what stood in it is its own)
    if (c) { if (c[0] || c[1]) S.moveBy(e, c[0], c[1]); continue; }
    els = els.map(x => x === e ? was : x); placed.delete(tid); touched.delete(tid); if (/^[^:]+: turned \d+°\.$/.test(done[at] || '')) done.splice(at, 1);
    skipped.push(labelOf(was) + ' can’t turn that far where it is: it would run over the lot line, a drive or a building. Move it first, or turn it less.'); }
  // homes give way: a building, pool, court, playground or park moved or added among houses takes their place (as parking
  // gives way): the houses under it (and a 12 ft margin, 4 for a park), with their lots and driveways, go. Without this a
  // community center moved into the middle of the lots couldn't land, and the re-fit that followed lost whole streets of homes.
  { const HOMEU = ['sfr', 'townhomes', 'duplex'], isHome = e => e.kind === 'building' && HOMEU.includes(e.use); let gave = 0;
    for (const tid of new Set([...placed, ...touched])) {
      const e = byId(tid); if (!e || isHome(e) || ['parking', 'lot', 'drive', 'trail', 'truck', 'keepout'].includes(e.kind) || e.kind === 'green' && !(S.isPark(e) && placed.has(tid))) continue; // (a park only renamed stays as it is)
      const drop = S.homesUnder(P(), e, S.isPark(e) ? 4 : 12), hit = [...drop].filter(isHome); if (!drop.size && !S.isPark(e)) continue;
      for (const x of [...drop]) if (touched.has(x.id) || placed.has(x.id)) drop.delete(x); // never what's being placed (a new pool beside a house reads as the house's)
      els = els.filter(x => !drop.has(x)); gave += hit.reduce((t, h) => t + (h.units ?? 1), 0); /* (homes, not buildings: a townhome row is six) */ if (S.isPark(e)) els = S.trimLots(els, e); // (the lots of the homes that stay come back off it)
    }
    if (gave) done.push(gave + (gave === 1 ? ' home' : ' homes') + ' made way for it.'); }
  // what was changed must still be inside the setbacks and off the other buildings; drives and parking re-fit round it
  for (const tid of placed) {
    const e = byId(tid); if (!e || !['building', 'garage', 'pool', 'court', 'play'].includes(e.kind)) continue; // (a pool added beside a clubhouse can land on a street)
    const att = S.attachedTo(P(), e), obs = S.spotObstacles(P(), e, att, opts.refit ? ['building', 'garage', 'pond', 'pool', 'court', 'play'] : null); // with a re-fit to come, drives and parking give way
    const c = S.clearSpot(P(), e, { carry: att, obs, reach: Math.max(e.w || 0, e.d || 0) + 120 });
    if (c && (c[0] || c[1])) for (const x of [e, ...att]) S.moveBy(x, c[0], c[1]); else if (!c) skipped.push(labelOf(e) + ' doesn’t fit clear of the other buildings there; it shows in red until it’s moved.');
  }
  if (!opts.refit) { // parking gives way under what changed, and grows back where things left (opts.spare: rows cut away whole)
    for (const tid of touched) { const e = byId(tid); if (e && e.kind !== 'parking' && !(e.kind === 'green' && !S.isPark(e)) && e.kind !== 'lot') els = S.cutRows(els, S.outline(e), e.kind === 'building' || e.kind === 'garage' ? 5 : 1, opts.spare); }
    for (const o of left) els = S.regrowRows(els, o, 5, opts.spare);
    for (const tid of touched) { const e = byId(tid); if (S.isRing(e) || S.isLoop(e)) els = S.cutRows(els, ground(e), 1, opts.spare); } // (a roundabout moved a little: what grew back where it was stays off where it is)
  }
  return { elements: els, streets, done, skipped, touched: [...touched], pods, blocks, ...(zones ? { zones } : {}), ...(names ? { streetNames: names } : {}), ...(named.length ? { named } : {}), ...(recipe ? { recipe } : {}) };
}
const EVERY = { multifamily: ['apartment building', 's'], townhomes: ['townhome row', 's'], duplex: ['duplex', 'es'], sfr: ['home', 's'], amenity: ['amenity building', 's'] }; // [one, the plural's ending]
const DEF = { pool: [70, 32, 'Pool'], play: [64, 48, 'Playground'], court: [128, 120, 'Pickleball courts'], green: [120, 90, 'Lawn'], plaza: [60, 40, ''], pond: [200, 120, 'Detention'], garage: [180, 120, 'Parking garage'], patio: [16, 34, ''], building: [60, 40, ''] };
// a spot for b beside a (where b's middle goes, plan feet). A park or a piece that gets a clear spot (a building, pool,
// court, playground): along a's own outline (each side in turn in the sheet: right, left, behind, in front), at the
// middle of each of its sides, then slid a third of the way along, then to its ends, a clear gap of 20, 45, 80 then 130 ft
// out: of the spots clear of drives, buildings, ponds, amenities and the lot line, the nearest, each home it displaces
// counting as 60 ft farther (homes make way, they aren't in the way; but a spot on the lawn 45 ft out beats four
// houses 20 ft out). (From a's outline, not its box: a lake
// running across the sheet had its box's sides hundreds of feet off it.) A park keeps off the other parks; an amenity
// may stand in one (a pool on the community lawn). No room on any side: null for a park (it isn't placed); a building or
// amenity takes the old spot and the clear-spot step after finds it room or shows it in red, as before. Anything else (a
// plaza, a pond, plain lawn): the first side inside the sheet, as before. moved: a was put where it is by this same
// change, and settles after (a community center moved onto a street steps off it): measured from where it will stand,
// not from the spot asked (a pool beside it there took the room the center then needed).
const CLEAR = ['building', 'garage', 'pool', 'court', 'play'], HOMEU = ['sfr', 'townhomes', 'duplex'], boxOf = r => [Math.min(...r.map(p => p[0])), Math.min(...r.map(p => p[1])), Math.max(...r.map(p => p[0])), Math.max(...r.map(p => p[1]))];
function beside(a, b, f, P = null, carry = [], moved = false) {
  const old = () => {
    const ca = f.to(S.centroid(S.shapeOf(a))), wa = S.isFree(a) ? 60 : Math.max(a.w, a.d) / 2, wb = S.isFree(b) ? 40 : Math.max(b.w || 0, b.d || 0) / 2, g = wa + wb + 30;
    for (const [dx, dy] of [[g, 0], [-g, 0], [0, g], [0, -g]]) { const q = [ca[0] + dx, ca[1] + dy]; if (q[0] > 0 && q[0] < f.width && q[1] > 0 && q[1] < f.depth) return f.from(q); }
    return f.from([ca[0] + g, ca[1]]);
  };
  if (!P || !(S.isPark(b) || CLEAR.includes(b.kind))) return old();
  if (moved && CLEAR.includes(a.kind)) { // (as applyEdits settles it after: the homes under it make way, then the nearest spot clear of the rest)
    const gone = S.homesUnder(P, a, 12), P2 = { ...P, elements: P.elements.filter(x => !gone.has(x)) }, att = S.attachedTo(P2, a), c = S.clearSpot(P2, a, { carry: att, obs: S.spotObstacles(P2, a, att), reach: Math.max(a.w || 0, a.d || 0) + 120 });
    if (c && (c[0] || c[1])) { const m = new Map([a, ...att].map(x => [x, S.moveBy(structuredClone(x), c[0], c[1])])); P = { ...P2, elements: P2.elements.map(x => m.get(x) || x) }; a = m.get(a); } }
  const as = S.shapeOf(a), sh = S.tidyRing(as.map(f.to), 6), B = boxOf(S.shapeOf(b).map(f.to)), hx = (B[2] - B[0]) / 2, hy = (B[3] - B[1]) / 2, bc = [(B[0] + B[2]) / 2, (B[1] + B[3]) / 2], cb = S.centroid(S.shapeOf(b));
  const obs = S.placeObs(P, b, carry).filter(x => S.isPark(b) || !S.isPark(x.o)), pad = S.isPark(b) ? 4 : 12;
  const homes = (P.elements || []).filter(h => h.kind === 'building' && HOMEU.includes(h.use) && h.id !== b.id).map(h => { const s = S.shapeOf(h); return { s, b: boxOf(s) }; });
  const cost = q => { const z = S.grow(S.shapeOf(q), pad), zb = boxOf(z); return homes.filter(h => h.b[0] < zb[2] && h.b[2] > zb[0] && h.b[1] < zb[3] && h.b[3] > zb[1] && S.rectsOverlap({ poly: h.s }, { poly: z }, 0)).length; };
  // the sides of a's outline (sheet feet): where along each a candidate sits, its outward normal, and which way it faces
  const sides = sh.map((p, i) => { const q = sh[(i + 1) % sh.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 8) return null; let n = [(q[1] - p[1]) / L, -(q[0] - p[0]) / L]; const m = [(p[0] + q[0]) / 2 + n[0], (p[1] + q[1]) / 2 + n[1]]; if (S.inRing(m, sh)) n = [-n[0], -n[1]];
    return { p, q, L, n, way: [n[0], -n[0], n[1], -n[1]].indexOf(Math.max(n[0], -n[0], n[1], -n[1])) }; }).filter(Boolean).sort((x, y) => x.way - y.way || y.L - x.L);
  let best = null;
  for (const g of [20, 45, 80, 130]) {
    if (best && best.sc <= g) break; // (nothing farther out can beat it)
    const spots = []; for (const t of [0.5, 1 / 6, 5 / 6, 0, 1]) for (const sd of sides) { const ext = hx * Math.abs(sd.n[0]) + hy * Math.abs(sd.n[1]); spots.push([sd.p[0] + (sd.q[0] - sd.p[0]) * t + sd.n[0] * (g + ext), sd.p[1] + (sd.q[1] - sd.p[1]) * t + sd.n[1] * (g + ext), sd.way]); }
    spots.sort((x, y) => x[2] - y[2]); // (each side's middles first, then its thirds, then its ends)
    for (const q of spots) {
      const p0 = f.from(bc), p1 = f.from(q), dx = p1[0] - p0[0], dy = p1[1] - p0[1], cand = S.moveBy(structuredClone(b), dx, dy), cs = S.shapeOf(cand), cc = carry.map(c => S.moveBy(structuredClone(c), dx, dy));
      if (S.rectsOverlap({ poly: cs }, { poly: as }, 0) || S.gapBetween(cs, as) > g + 40 || !S.clearSpot(P, cand, { carry: cc, obs, reach: 0 })) continue; // (off a's own outline, not just its box)
      const sc = g + 60 * cost(cand); if (!best || sc < best.sc) best = { sc, at: [cb[0] + dx, cb[1] + dy] }; if (sc === g) break;
    }
  }
  return best ? best.at : S.isPark(b) ? null : old();
}
// where an entrance asked for "at the open space" is asked from, best first: the point on the street lot line nearest
// the piece when one is within 300 ft of it; the nearest lot line within 300 ft (it becomes a street, as for a click
// there); the nearest street lot line. (A side lot line 50 ft off a pad by the front street isn't a way in, and an open
// space against the back lot line is reached from the street when the back has no way in.)
function streetPoints(plan, e) {
  const ring = plan.ring || [], rules = S.edgeRules(ring, plan.front, plan.setbacks, plan.streets), sh = S.shapeOf(e), c = S.centroid(sh), all = ring.map((a, k) => k), st = all.filter(k => rules[k].role === 'front' || rules[k].street);
  const near = ks => { let best = null; for (const k of ks) { const a = ring[k], b = ring[(k + 1) % ring.length], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))), q = [a[0] + dx * t, a[1] + dy * t], d = Math.min(...sh.map(p => S.segDist(p, a, b))); if (!best || d < best.d) best = { d, q }; } return best; };
  const s = near(st), any = near(all); return [s && s.d <= 300 && s, any && (any.d <= 300 || !s) && any, s].filter(Boolean).map(x => x.q).filter((q, i, a) => a.findIndex(p => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1) === i);
}

// a spot named in words, in the drawing's feet: "the back", "the front of the site", "the middle", "the left side",
// "the middle of the single-family lots" / "of the homes" / "of the apartments" (that area's middle), "the back zone"
const AREA_WORDS = [[/single[- ]family|homes?|houses?|lots?|neighbou?rhood|residential/, ['Single-family homes', 'Townhomes', 'Duplexes / cottages', 'Single-family']], [/apartments?|multi-?family/, ['Multifamily']], [/townhomes?|townhouses?/, ['Townhomes']],
  [/retail|shops?|stores?/, ['Retail']], [/restaurants?/, ['Restaurant']], [/offices?/, ['Office']], [/parking/, ['Parking']], [/ponds?|lake|detention/, ['Ponds']], [/warehouses?|industrial/, ['Industrial / warehouse']], [/storage|drive[- ]?up|climate/, ['Self storage']]];
export function placeAt(plan, phrase) {
  const w = String(phrase || '').toLowerCase(), P = placesOf(plan), side = k => P.site[k];
  const of = w.match(/(?:middle|center|centre|heart)\s+of\s+(?:the\s+)?(.+)/)?.[1];
  if (of && !/^(?:the\s+)?(?:site|property|lot|plan|development)\b/.test(of)) {
    const z = (P.zones || []).find(z => of.split(/\s+/).some(t => t.length > 3 && z.name.toLowerCase().includes(t))); if (z && /zone|area|section|part/.test(of)) return z.middle;
    for (const [re, names] of AREA_WORDS) if (re.test(of)) { const a = P.areas.filter(a => names.some(n => a.name.toLowerCase().startsWith(n.toLowerCase().slice(0, 8)))).sort((x, y) => y.count - x.count)[0]; if (a) return a.middle; }
    if (z) return z.middle;
  }
  if (/\b(back|rear)\b/.test(w)) return side('back'); if (/\bfront\b|\bby the (street|road)\b/.test(w)) return side('front');
  if (/\bleft\b/.test(w)) return side('left'); if (/\bright\b/.test(w)) return side('right'); if (/\b(middle|center|centre)\b/.test(w)) return side('middle');
  return null;
}
// ---------- plain words (when the AI isn't there) ----------
// "make bldg 7 four stories", "remove building 3", "turn the clubhouse", "swap bldg 2 and bldg 5", "make it a
// restaurant", "rename bldg 1 to The Oaks". Names match the plan's labels; "it" / "this" is the selected piece.
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, sixteen: 16 };
// the home mix from plain words: "no 3-story homes", "only one and two-story houses", "make all the homes 2 stories".
// null when the words aren't about the homes' stories (or the plan has no homes on lots)
export function guessMix(text, plan) {
  const t = String(text || '').toLowerCase().replace(/\b(one|two|three)\b/g, w => NUM[w]);
  if (!(plan.elements || []).some(e => e.kind === 'building' && e.use === 'sfr') || !/\b(homes?|houses?|residential|single[- ]family|lots)\b/.test(t) || /\b(?:lot|bldg|building|row)\s*#?\d|\b(?:it|this|that one)\b/.test(t)) return null; // (one piece: "make lot 12 2 stories" is an edit on it)
  const yes = new Set(), no = new Set();
  for (const m of t.matchAll(/((?:\d\s*(?:,|and|or|&)\s*)*\d)\s*-?\s*(?:stor(?:y|ies)|floors?)\b/g)) {
    const before = t.slice(Math.max(0, m.index - 14), m.index), ns = m[1].match(/\d/g).map(Number);
    for (const n of ns) (/\b(?:no|not|without|never|nothing)\b[^,.;]*$|n[’']t\b[^,.;]*$/.test(before) ? no : yes).add(n);
  }
  if (!yes.size && !no.size) return null;
  const keep = (yes.size ? [...yes] : [1, 2, 3]).filter(n => !no.has(n)), cur = homeMixOf(plan);
  return keepStories(cur, keep);
}
// where an entrance's monument signs go, from the words: both, one, in the median, none (null: not said)
const signsIn = t => /\bboth (?:sides|corners)|\beach (?:side|corner)|\bon either side/.test(t) ? 'both' : /\bone (?:side|corner)|\ba sign at the corner/.test(t) ? 'one' : /\bin the median/.test(t) ? 'median' : /\bno (?:monument )?signs?\b|\bwithout (?:a |the )?(?:monument )?signs?/.test(t) ? 'none' : null;
// the street lot line named ("FM 362" when the plan knows its streets' names, "the side street", "the front"): its
// index, or null when the words don't name one of the plan's streets (then the entrance goes where it helps most)
function streetNamed(plan, words) {
  const w = String(words || '').toLowerCase().replace(/^(?:of\s+)?the\s+/, '').trim(), ring = plan.ring || [], rules = S.edgeRules(ring, plan.front, plan.setbacks, plan.streets), names = plan.streetNames || {};
  const st = ring.map((a, k) => k).filter(k => rules[k].role === 'front' || rules[k].street), byName = st.find(k => names[k] && w.includes(String(names[k]).toLowerCase()));
  if (byName != null) return byName;
  if (/^(?:side|cross|other|second) (?:street|road)\b/.test(w)) { const k = st.find(k => rules[k].street && rules[k].role !== 'front'); return k ?? null; }
  if (/^(?:front|main) (?:street|road)\b|^front\b/.test(w)) { const k = st.find(k => rules[k].role === 'front'); return k ?? null; }
  return null;
}
const KIND_WORDS = [[/^(?:(?:detention|retention|amenity|storm(?:water)?)\s+)?(?:pond|lake|basin)$|^detention$/, e => e.kind === 'pond'], [/^(?:swimming\s+)?pool$/, e => e.kind === 'pool'], [/^playground$/, e => e.kind === 'play'], [/^(?:pickleball\s+|tennis\s+)?courts?$/, e => e.kind === 'court'], [/^(?:parking\s+)?garage$/, e => e.kind === 'garage'], [/^(?:park|lawn|open space)$/, e => S.isPark(e) && !S.isMedian(e)]];
// the largest pod of the use a word names ("apartments", "the retail", "homes"), on a plan laid out in pods
const POD_WORD = [[/^apartments?$|^multi-?family$/, ['multifamily']], [/^retail$|^shops?$|^stores?$|^shopping$|^commercial$/, ['retail', 'restaurant', 'office', 'medical', 'other']], [/^offices?$/, ['office']], [/^homes?$|^houses?$|^neighbou?rhood$|^lots$|^single$/, ['sfr']], [/^townhomes?$|^townhouses?$/, ['townhomes']], [/^duplex(?:es)?$|^cottages?$/, ['duplex']], [/^commons$|^park$|^amenity$|^clubhouse$/, ['amenity']]];
export function podFor(plan, w) { const u = POD_WORD.find(([re]) => re.test(String(w || '').trim()))?.[1]; if (!u) return null; return (plan.zones || []).filter(z => z.pod && u.includes(z.use)).sort((a, b) => (b.acres || 0) - (a.acres || 0))[0]?.pod || null; }
// a neighbourhood's street named in words: "this street" (the one selected), "the main street" (the spine, else the longest
// collector), "the loop road", "the entry", or by its name ("Oak Lane"); its chain (lib/streetnet.mjs chainsOf), or null
export function netStreet(plan, words, sel = null) {
  if (!plan.recipe?.net) return null; const w = String(words || '').toLowerCase().trim().replace(/^(?:the|a)\s+/, ''), ch = chainsOf(plan), long = f => ch.filter(f).sort((a, b) => b.L - a.L)[0] || null;
  if (/^(?:it|this|that|this one|that one|selected|the selected one|(?:this|that|the selected|selected) (?:street|road|lane|way|drive|court|cul-de-sac|loop))$/.test(w)) return sel ? ch.find(c => c.ids.includes(sel) || c.bulbs.includes(sel)) || null : null;
  if (/^(?:main|middle|central) (?:street|road)$|^spine(?: road)?$/.test(w)) return long(c => /main street|spine/i.test(c.label || '')) || long(c => c.role === 'collector' && !c.cyc) || long(c => c.role === 'collector');
  if (/^loop(?: road)?$/.test(w)) return long(c => /loop road/i.test(c.label || '')) || long(c => c.role === 'collector' && c.cyc);
  if (/^(?:main )?(?:entry|entrance|boulevard)(?: road| street)?$/.test(w)) return long(c => c.role === 'boulevard');
  if (/^collector(?: road| street)?$/.test(w)) return long(c => c.role === 'collector');
  const b = SNm.baseOf(w).toLowerCase(); return ch.find(c => c.name && c.name.toLowerCase() === w) || ch.find(c => c.label && c.label.toLowerCase() === w) || (b.length > 2 ? ch.find(c => c.name && SNm.baseOf(c.name).toLowerCase() === b) : null) || null;
}
// the street names setting in words: { on, theme } or null ("rename the streets with a golf theme", "turn off street names")
export function guessStreetNames(t) {
  t = String(t || '').toLowerCase(); if (/\b(?:turn|switch)\s+(?:the\s+)?street\s+names\s+off\b|\b(?:turn|switch)\s+off\s+(?:the\s+)?street\s+names\b|\b(?:no|hide|remove|drop)\s+(?:the\s+)?street\s+names\b/.test(t)) return { on: false, theme: '' };
  if (!/\b(?:re-?)?name\s+(?:all\s+)?(?:of\s+)?(?:the\s+|our\s+)?streets\b|\bstreet\s+names\b|\bgive\s+(?:the\s+)?streets\s+names\b/.test(t)) return null;
  const th = t.match(/\b(?:with|in|using|on)\s+(?:an?\s+|the\s+)?(.+?)\s+theme\b/)?.[1] || t.match(/\btheme(?:d)?\s*(?:of|on|around|:|is)?\s+(.+?)\s*$/)?.[1] || t.match(/\bstreets\s+after\s+(.+?)\s*$/)?.[1] || '';
  return { on: true, theme: th.replace(/^(?:a|an|the)\s+/, '').trim().slice(0, 80) };
}
export function guessEdits(text, plan, sel = null) {
  const t = String(text || '').toLowerCase().replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|sixteen)\b/g, w => NUM[w]), els = plan.elements || [], ops = [];
  const named = els.filter(e => e.name).sort((a, b) => b.name.length - a.name.length), find = s => {
    s = s.trim().replace(/^(the|a|an)\s+/, ''); if (/^(it|this|this one|that|that one|selected|the selected one)$/.test(s)) return els.find(e => e.id === sel) || null;
    const n = s.replace(/\bbuilding\b/, 'bldg').replace(/\bbldg\.?\s*/, 'bldg '), num = n.match(/\b(\d+|[a-z])$/)?.[1];
    return named.find(e => e.name.toLowerCase() === s || e.name.toLowerCase().replace(/^apt /, '') === n) || named.find(e => num && /bldg|building/.test(n) && new RegExp('(bldg|building) ' + num + '$', 'i').test(e.name)) || named.find(e => e.name.toLowerCase().includes(s)) || byKind(s);
  }, byKind = s => { const k = KIND_WORDS.find(([re]) => re.test(s)), hit = k ? els.filter(k[1]) : []; return hit.length === 1 ? hit[0] : null; }; // (an unnamed piece by what it is, when it's the only one: "turn the pond")
  let last = null; // the piece the last sentence moved ("…and add a pool to it")
  for (const part of t.split(/\s*(?:[.;]|\band then\b|,\s*(?:and|then)\b|\balso\b|\band (?=add\b|put\b|give\b|re-?(?:fit|lay)\b))\s*/).filter(Boolean)) { // ("…and re-fit": a part of its own, read by the caller)
    let m;
    // a neighbourhood's streets (lib/streetedit.mjs): names on or off and a theme, one named, a cul-de-sac, a bow, a block
    // laid out again, a street removed
    { const sn = guessStreetNames(part); if (sn && !/\b(?:call|rename)\s+(?!the\s+streets\b|all\b)/.test(part)) { ops.push({ action: 'streetNames', ...sn }); continue; } }
    if (plan.recipe?.net) {
      if ((m = part.match(/^(?:please\s+)?(?:call|rename|name)\s+(.+?)["”]?$/)) && /\s(?:parkway|boulevard|drive|lane|way|trail|court|circle|street|road|avenue|place|loop|run|crossing|bend|pass|path|cove)["”]?$/.test(part)) { // "call the loop road Heritage Parkway": the street, then its new name
        const ws = m[1].replace(/["“”]/g, '').split(/\s+/); let hit = null; for (let k = ws.length - 2; k >= 1 && !hit; k--) { const c = netStreet(plan, ws.slice(0, k).join(' '), sel), nm = ws.slice(k).join(' ').replace(/^(?:to|as)\s+/, ''); if (c && nm.split(' ').length >= 2) hit = { c, nm }; }
        if (hit) { ops.push({ action: 'change', target: hit.c.key, street: hit.nm.replace(/\b[a-z]/g, x => x.toUpperCase()) }); continue; } }
      if ((m = part.match(/\b(?:make|turn|end)\s+(.+?)\s+(?:in|into|as)?\s*(?:a\s+)?cul-?de-?sac\b/))) { const c = netStreet(plan, m[1].replace(/\s+(?:in|into)$/, ''), sel); if (c) { ops.push({ action: 'culdesac', target: c.key }); continue; } }
      if ((m = part.match(/^(?:please\s+)?(?:curve|bend|bow)\s+(.+?)(?:\s+(?:by\s+|about\s+)?(\d+)\s*(?:ft|feet|foot|'))?(?:\s+(?:to\s+the\s+|toward\s+the\s+)?(left|right))?$/))) { const c = netStreet(plan, m[1], sel); if (c) { const f = m[2] ? +m[2] : null; ops.push({ action: 'bend', target: c.key, curve: f != null ? (m[3] === 'right' ? -f : f) : m[3] === 'right' ? -1 : null }); continue; } }
      if ((m = part.match(/\bre-?(?:lay|do|layout|plan)(?:\s+out)?\s+(?:this|that|the selected|the)\s+(?:pod|block|section|area|neighbou?rhood block)\b/)) && sel) { ops.push({ action: 'relay', target: sel }); continue; }
      if ((m = part.match(/^(?:please\s+)?(?:remove|delete|take out|get rid of)\s+(.+?\b(?:street|road|lane|way|drive|court|circle|trail|parkway|boulevard|cul-de-sac))$/))) { const c = netStreet(plan, m[1], sel); if (c && c.role !== 'boulevard' && c.role !== 'entry') { ops.push({ action: 'remove', target: c.key }); continue; } }
    }
    // (a new street pattern for the whole plan: New Layouts, not an edit. Not a sentence about one street or another piece
    // by one: "add a curved street", "a pool next to the winding street" are edits of their own)
    // ("make it a subdivision", "subdivision streets", "curved streets instead"; not "the sign in this subdivision", "make the
    // winding streets 32 ft wide", "turn the pond", "no 3-story homes in the subdivision")
    if (/\b(?:a|as|into|like|real)\s+(?:an?\s+)?subdivision\b|\bsubdivision\s+(?:streets?|roads?|layout|style|plan)\b|\bloops? and cul-?de-?sacs?\b|\b(?:curv(?:y|ed|ing)|winding)\s+streets\b|\bstreets\b.*\b(?:curv(?:e|es|y|ed|ing)|winding)\b/.test(part) && !/\b(?:add|put|place|insert|move|remove|delete|drop|wide|wider|widen|narrow|narrower|rename|name|named|call|extend|shorten|longer|shorter|turn|rotate|spin|next to|beside|signs?|entry|entrance|stor(?:y|ies))\b|\d\s*(?:ft|feet|foot|')|\d-story/.test(part)) { ops.push({ action: 'streets' }); continue; }
    if (plan.recipe?.pods && (m = part.match(/\bre-?(?:lay|do|layout|plan)(?:\s+out)?\s+(?:the\s+)?(?:(this|that|selected)\s+(?:pod|section|area|zone|part)|([a-z]+)(?:\s+(?:pod|area|section|zone|part))?)\b/))) { // "re-lay the apartments", "redo this pod"
      const id = m[1] ? els.find(e => e.id === sel)?.pod : podFor(plan, m[2]); if (id) { ops.push({ action: 'relay', target: 'pod:' + id }); continue; } }
    if (plan.recipe?.pods && (m = part.match(/\bswap\s+(?:the\s+)?([a-z]+)(?:\s+(?:pod|area|section|zone|part)s?)?\s+(?:and|with)\s+(?:the\s+)?([a-z]+)/))) { // "swap the apartments and the retail"
      const a = podFor(plan, m[1]), b = podFor(plan, m[2]); if (a && b && a !== b) { ops.push({ action: 'swap', target: 'pod:' + a, with: 'pod:' + b }); continue; } }
    if (/\b(?:add|put|build|give|need|want|make|turn)\b/.test(part) && /\b(?:a|an|another|new|\d)\s+(?:(?:small|big|large)\s+)?(?:roundabouts?|traffic circles?)\b/.test(part)) { // "add a roundabout at the main intersection", "a roundabout at the entry", "make the main intersection a roundabout"
      const n = Math.min(3, +(part.match(/\b(\d)\s+(?:roundabouts|traffic circles)/)?.[1] || 1)), J = S.junctionsOf(plan), f = sheetFrame(plan), w = part.match(/\b(?:at|by|near|beside|next to|on)\s+(.+)$/)?.[1]?.trim(), entry = !!w && /^(?:the\s+)?(?:main\s+|front\s+)?(?:entry|entrance|way in)$/.test(w), nm = w && !entry && !/\b(?:intersection|junction|crossing|corner)s?\b/.test(w) ? find(w) : null; // ("the entrance": the main one, not the first piece whose name has the word)
      if (/\b(?:at|by|near|on)\s+(?:the\s+)?(?:main\s+|front\s+)?(?:entry|entrance|way in)\b/.test(part) && !(nm && S.isEntrance(nm))) { const e = S.entrancesOf(els).find(e => e.name === 'Main entry') || S.entrancesOf(els)[0]; if (e) { ops.push({ action: 'add', kind: 'roundabout', with: e.id }); continue; } }
      if (nm) { ops.push({ action: 'add', kind: 'roundabout', with: nm.id }); continue; }
      if (w && !entry && !/\b(?:intersection|junction|crossing|corner)s?\b/.test(w)) { ops.push({ action: 'add', kind: 'roundabout', with: w }); continue; } // (a piece the plan hasn't got: said so, not the main junction instead)
      const st = J.filter(j => !j.parking), room = n > 1 ? S.ringSpots(plan) : [], has = j => room.some(a => a[0] === j.at[0] && a[1] === j.at[1]), m0 = J.find(j => j.main) || st[0], pick = [n > 1 && m0 && !has(m0) ? st.find(has) || m0 : m0].filter(Boolean); // the main junction (and the next best with room, 300 ft or more from those taken; asked for more than one, the best with room first, so the first doesn't go where the second would)
      for (const j of st) if (pick.length < n && has(j) && pick.every(q => Math.hypot(q.at[0] - j.at[0], q.at[1] - j.at[1]) >= 300)) pick.push(j);
      for (const j of st) if (pick.length < n && pick.every(q => Math.hypot(q.at[0] - j.at[0], q.at[1] - j.at[1]) >= 300)) pick.push(j); // (too few with room: the next best, so the answer says what's in the way there)
      for (const j of pick) { const q = f.to(j.at).map(Math.round); ops.push({ action: 'add', kind: 'roundabout', x: q[0], y: q[1] }); } if (pick.length) continue; }
    if (/\b(?:add|put|build|give|need|want|make)\b/.test(part) && /\b(?:a|an|another|new)\s+(?:circle drive|circular drive|drop-?off(?: loop| circle| lane| drive)?|motor court|turn-?around loop|porte[- ]coch[eè]re|loop drive)\b/.test(part)) { // "add a circle drive in front of the clubhouse"
      const w = part.match(/\b(?:in front of|at|for|by|outside|to)\s+(.+)$/)?.[1], b = w && find(w) || els.find(e => e.id === sel && e.kind === 'building') || (cl => cl.length === 1 ? cl[0] : null)(els.filter(e => e.kind === 'building' && (e.use === 'amenity' || /club|community|amenity/i.test(e.name || ''))));
      ops.push({ action: 'add', kind: 'loop', ...(b ? { with: b.id } : {}) }); continue; }
    if ((m = part.match(/^(?:please\s+)?(?:move|put|place|relocate|shift)\s+(.+?)\s+(?:to|into|in|at|on|toward|towards)\s+(?:the\s+)?(.+)$/))) { // "move the community center to the middle of the homes"
      const e = find(m[1]), at = placeAt(plan, m[2]); if (e && at) { ops.push({ action: 'move', target: e.id, x: at[0], y: at[1] }); last = e; continue; } }
    if ((m = part.match(/^(?:add|put|give it|include)\s+(?:a\s+|an\s+)?(pool|playground|pickleball courts?|courts?|lawn|park|open space)\b(?:.*\b(?:to|beside|next to|by|with)\s+(it|this|.+))?$/))) {
      const kind = /pool/.test(m[1]) ? 'pool' : /play/.test(m[1]) ? 'play' : /court/.test(m[1]) ? 'court' : 'green', near = m[2] ? (/^(it|this)$/.test(m[2].trim()) ? last || els.find(e => e.id === sel) : find(m[2])) : last || els.find(e => e.id === sel);
      if (near) { ops.push({ action: 'add', kind, with: near.id, ...(kind === 'pool' ? { w: 60, d: 30 } : {}), ...(m[1] === 'park' ? { name: 'Park' } : m[1] === 'open space' ? { name: 'Open space' } : {}) }); continue; } }
    if ((m = part.match(/^(?:please\s+)?(?:make|turn|change)\s+(.+?)\s+(?:(?:in)?to\s+)?(?:a\s+)?boulevard\b/))) { const e = find(m[1]); if (e && S.isEntrance(e)) { ops.push({ action: 'change', target: e.id, boulevard: true, signs: signsIn(part) }); continue; } }
    if (/\b(?:add|put|give (?:it|us|the site)|need|want)\b.*\b(?:entrance|entry|driveway|curb cut|way in)s?\b/.test(part)) { const n = +(part.match(/\b(\d)\s+(?:more\s+)?(?:boulevard\s+)?(?:entrance|entr|driveway|curb|way)/)?.[1] || 1), at = part.match(/\b(?:at|by|near|beside|next to)\s+(.+?)(?:\s+with\b.*)?$/)?.[1], near = at && find(at); // "…at the open space": on the street beside it
      const bare = part.replace(/\s+with\b.*$/, ''), off = bare.match(/\b(?:off|from|on|along)\s+(.+)$/)?.[1], k = off && !near ? streetNamed(plan, off) : null, bo = /boulevard/.test(part) ? { boulevard: true, signs: signsIn(part) } : {}; // "…off FM 362", "…on the side street": the middle of that street's lot line (applyEdits slides it along to keep the spacing); any other words, where it helps most
      const st = k != null ? (f => { const a = plan.ring[k], b = plan.ring[(k + 1) % plan.ring.length]; return f.to([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]).map(Math.round); })(sheetFrame(plan)) : null;
      for (let i = 0; i < Math.min(n, 4); i++) ops.push({ action: 'add', kind: 'entrance', ...(near ? { with: near.id } : st ? { x: st[0], y: st[1] } : {}), ...bo }); continue; }
    if ((m = part.match(/^(?:please\s+)?(?:remove|delete|take out|get rid of)\s+(.+)$/))) { const e = find(m[1]); if (e) ops.push({ action: 'remove', target: e.id }); continue; }
    if ((m = part.match(/swap\s+(.+?)\s+(?:and|with)\s+(.+)$/))) { const a = find(m[1]), b = find(m[2]); if (a && b) ops.push({ action: 'swap', target: a.id, with: b.id }); continue; }
    if ((m = part.match(/^(?:please\s+)?(?:turn|rotate)\s+(.+?)(?:\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*(?:°|deg|degrees?))?(?:\s+(clockwise|counter-?clockwise|anti-?clockwise|to the (?:left|right)|left|right))?(?:\s+(?:in|on)\s+(?:this|the)\s+(?:subdivision|neighbou?rhood|site|plan))?$/))) { const e = find(m[1]); // any piece, curved or drawn ones too; an entrance a little at a time
      if (e) { const n = +m[2] || (S.isEntrance(e) ? 15 : 90), cw = /^(clockwise|to the right|right)$/.test(m[3] || ''); ops.push({ action: 'change', target: e.id, turnBy: cw ? -n : n }); } continue; }
    if ((m = part.match(/^(?:rename|call)\s+(.+?)\s+(?:to\s+|as\s+)?["“]?([^"”]+)["”]?$/))) { const e = find(m[1]); if (e) ops.push({ action: 'change', target: e.id, name: m[2].replace(/\b\w/g, c => c.toUpperCase()) }); continue; }
    if ((m = part.match(/^(?:make|change|set|turn)\s+(.+?)\s+(?:to\s+|into\s+)?(?:a\s+|an\s+)?(\d+)[-\s]*(?:stor(?:y|ies)|floors?)/))) { const e = find(m[1]); if (e) ops.push({ action: 'change', target: e.id, floors: +m[2] }); continue; }
    if ((m = part.match(/^(?:make|change|turn|replace)\s+(.+?)\s+(?:in)?to\s+(?:a\s+|an\s+)?(.+)$|^make\s+(.+?)\s+(?:a|an)\s+(.+)$/))) {
      const e = find(m[1] || m[3]), want = (m[2] || m[4]).replace(/\bsq\.?\s*ft\b|\bsf\b/g, 'sf').replace(/,/g, ''); if (!e) continue;
      const sf = +(want.match(/(\d{3,6})\s*sf/)?.[1] || 0), words = want.split(/[^a-z0-9]+/).filter(w => w.length > 2 && !/^\d+$/.test(w) && w !== 'with');
      const T = BUILDING_TYPES.map(T2 => { const nm = T2.name.toLowerCase(), hit = words.filter(w => nm.includes(w)).length, size = T2.w * T2.d * (T2.floors || 1); return { T2, v: hit * 10 - (sf ? Math.abs(size - sf) / Math.max(sf, 1) * 6 : 0) }; }).filter(x => x.v > 0).sort((a, b) => b.v - a.v)[0];
      if (T) ops.push({ action: 'change', target: e.id, type: T.T2.id }); continue;
    }
  }
  return ops;
}

// ---------- names: the community and its parts ----------
// names from Change With AI or plain words ({ community, parts: [{ part (S.partsOf's i), name }] }) on the plan's
// program: { program, done: [sentences], skipped }. '' clears a name.
export function applyNames(plan, names) {
  const done = [], skipped = [], parts = S.partsOf(plan, false), ok = [];
  if (!names) return { program: plan.program, done, skipped };
  const said = v => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (names.community != null) { const n = said(names.community); done.push(n ? 'Named the community ' + n + '.' : 'The community has no name now.'); }
  for (const x of names.parts || []) { const p = parts.find(q => q.i === +x.part), n = said(x.name); if (!p) { skipped.push('No part ' + x.part + ' on the plan to name.'); continue; } ok.push({ part: p.i, name: n });
    if (!done.some(t => t.includes(' ' + p.word.toLowerCase() + ' ' + n + '.'))) done.push(n ? 'Named the ' + p.word.toLowerCase() + ' ' + n + '.' : 'The ' + p.word.toLowerCase() + ' has no name now.'); }
  return { program: S.withNames(plan.program || {}, { ...(names.community != null ? { community: said(names.community) } : {}), parts: ok }), done, skipped };
}
// the words for each part: [regex, uses it may be, best first]
const PART_WORDS = [[/^(?:neighbou?rhood|subdivision|homes|houses|single[- ]family(?: homes)?|residential)$/, ['sfr', 'townhomes', 'duplex']], [/^(?:retail(?: cent(?:er|re))?|shopping(?: cent(?:er|re))?|shops|stores|the shops)$/, ['retail', 'restaurant']], [/^(?:apartments?(?: complex)?|apartment complex|multi-?family)$/, ['multifamily']],
  [/^(?:townhomes?|townhouses?|town homes)$/, ['townhomes']], [/^(?:cottages|duplexes)$/, ['duplex']], [/^(?:(?:business|commercial|office|industrial) park|offices?|warehouses?)$/, ['office', 'industrial', 'other', 'medical']], [/^(?:commons|amenity(?: cent(?:er|re))?|clubhouse area)$/, ['amenity']], [/^(?:restaurants?|food court)$/, ['restaurant']]];
// names in plain words: "call the neighbourhood Beacon Hill Estates", "name the retail center Beacon Hill Market", "call
// it Beacon Hill" (the community; with a piece selected "it" is the piece, so that stays an edit). Every part of the use
// named gets it (two neighbourhoods either side of a commons are one); only a part the plan has (on a plan of homes "the
// offices" or "the park" is a piece, not a part). The name keeps its capitals (title case only when typed all in lower
// case). null when the words aren't names; else { community, parts, rest (the words that weren't about names, for
// guessEdits: "call it Beacon Hill and turn the pond 20 degrees") }.
const VERB = '(?:please\\s+)?(?:call|name|rename|turn|rotate|make|add|put|give|remove|delete|take|get rid|move|swap|change|set|replace|widen|re-?fit|no)\\b';
export function guessNames(text, plan, sel = null) {
  const parts = S.partsOf(plan, false), out = { community: null, parts: [] }, rest = [], lower = String(text || '') === String(text || '').toLowerCase(); let any = false;
  for (const raw of String(text || '').split(new RegExp('\\s*(?:[.;]\\s+|[.;]$|,?\\s+and (?=' + VERB + ')|,\\s+(?=' + VERB + '))\\s*', 'i')).filter(Boolean)) {
    const m = raw.trim().match(/^(?:please\s+)?(?:call|name|rename)\s+(.+?)\s*[.!]?$/i); if (!m) { rest.push(raw.trim()); continue; }
    const ws = m[1].split(/\s+/), COMM = /^(?:community|development|project|site|whole (?:thing|site|development)|plan)$/; let who = null, nm = '', hit = null; // (the words for what's named, then the name: the longest that reads as one, "the retail center" before "the retail")
    for (let k = ws.length - 1; k >= 1 && !who; k--) { const w = ws.slice(0, k).join(' ').toLowerCase().replace(/^the\s+/, ''); if (COMM.test(w) || w === 'it' && !sel || (hit = PART_WORDS.find(([re]) => re.test(w)))) { who = w; nm = ws.slice(k).join(' ').replace(/^(?:to|as)\s+/i, '').replace(/^["“']+|["”']+$/g, '').trim();
      const tail = ws.slice(k); if (!lower && !/^(?:to|as)$/i.test(tail[0]) && tail[0] === tail[0].toLowerCase() && tail.slice(1).some(x => /^(?:to|as)$/i.test(x))) { who = null; hit = null; break; } } } // ("rename the retail building to Shops": a piece's name, not the part's)
    const use = hit && hit[1].find(u => parts.some(p => p.use === u)), got = hit ? parts.filter(p => p.use === use) : [];
    if (!who || !nm || hit && !got.length) { rest.push(raw.trim()); continue; } if (nm === nm.toLowerCase()) nm = nm.replace(/\b[a-z]/g, c => c.toUpperCase());
    if (!hit) { out.community = nm; any = true; continue; }
    for (const p of got) out.parts.push({ part: p.i, name: nm }); any = true;
  }
  return any ? { ...out, rest: rest.join('. ') } : null;
}
// names that fit the place without the AI: the first street name that's a word (Stokes Rd: Stokes; FM 362 is passed
// over), else the city's, else the county's. { choices: [{ community, parts: [{ part, name }], why }] }
export function localNames(plan, site = {}) {
  const word = s => { const w = String(s || '').replace(/^\s*\d+[a-z]?\s+/i, '').split(/[,\n]/)[0].replace(/\b(?:road|rd|street|st|drive|dr|lane|ln|avenue|ave|boulevard|blvd|parkway|pkwy|highway|hwy|way|court|ct|trail|trl|loop|circle|cir|place|pl)\.?$/i, '').replace(/\b(?:north|south|east|west|[nsew])\.?\s+/i, '').trim(); return /^[A-Za-z][A-Za-z' ]{2,24}$/.test(w) && !/^(?:fm|cr|sh|us|i|ih|rm|spur|state)\b/i.test(w) ? w.replace(/\b[a-z]/g, c => c.toUpperCase()) : null; };
  const from = [...Object.values(plan.streetNames || {}).map(n => [word(n), 'the street (' + n + ')']), [word(site.address), 'the street it’s on'], [word(site.city), 'the town (' + site.city + ')'], [word(String(site.county || '').replace(/\s+county$/i, '')), site.county + ' County']].find(x => x[0]);
  const P = from?.[0] || 'Meadow', why = from ? 'From ' + from[1].replace(/ County County$/, ' County') + '.' : 'No street or town name to draw on: a plain one to start from.', parts = S.partsOf(plan, false);
  const partName = (p, C) => ({ retail: C + ' Market', amenity: C + ' Commons', multifamily: 'The Residences at ' + C, townhomes: C + ' Townhomes', sfr: C + ' Estates', duplex: C + ' Cottages', office: C + ' Business Park', industrial: C + ' Business Park' }[p.use] || C + ' ' + p.word);
  return { choices: [P + ' Landing', P + ' Crossing', 'The Reserve at ' + P].map(C => { const base = C.replace(/^The Reserve at /, '').replace(/ (?:Landing|Crossing)$/, ''); return { community: C, parts: parts.length > 1 ? parts.map(p => ({ part: p.i, name: partName(p, base) })) : [], why }; }) };
}
