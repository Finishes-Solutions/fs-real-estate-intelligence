// Changing a laid-out plan from words ("make Bldg 7 four stories", "move the clubhouse to the back by the pond").
// The AI is shown the plan as a list of named pieces in the sheet's frame (the street along the bottom, x across the
// frontage, y back from the street, feet), the same way it sees the drawing, and answers with edits on those pieces.
// This file applies the edits (the same way for the AI's answer and for plain words read here when the AI isn't
// there); the browser then re-fits the rest of the plan round the pieces that changed. Shared by the browser, the API
// and the tests.
import * as S from './siteplan.mjs';
import { streetDown } from './sitesheet.mjs';
import { BUILDING_TYPES, typeById, fromType } from './buildings.mjs';

const norm = r => +(((r % 360) + 360) % 360).toFixed(2);
// the sheet's frame: to([x, y]) -> [across, back] in feet from the street's left end; from() undoes it
export function sheetFrame(plan) {
  const deg = streetDown(plan), t = p => S.rotPt(p, -deg), r = (plan.ring || []).map(t), xs = r.map(p => p[0]), ys = r.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys);
  return { deg, width: Math.max(...xs) - x0, depth: Math.max(...ys) - y0, to: p => { const q = t(p); return [q[0] - x0, q[1] - y0]; }, from: ([X, Y]) => S.rotPt([X + x0, Y + y0], deg), rotTo: a => norm(a - deg), rotFrom: a => norm(a + deg) };
}

const LABEL = { building: 'Building', pool: 'Pool', play: 'Playground', court: 'Courts', pond: 'Pond', green: 'Lawn', plaza: 'Plaza', garage: 'Parking garage', patio: 'Patio', trash: 'Trash enclosure', drive: 'Drive', parking: 'Parking row', truck: 'Truck court', trail: 'Trail', keepout: 'Easement' };
export const labelOf = e => e.name || (e.kind === 'plaza' && e.note ? e.note : LABEL[e.kind] || e.kind);

// the plan as the AI reads it. Parking rows and plain drives are summed up, not listed; on a big neighbourhood the
// houses are counted, not listed.
export function describePlan(plan, sel = null) {
  const f = sheetFrame(plan), els = plan.elements || [], r = v => Math.round(v), houses = els.filter(e => e.kind === 'building' && e.use === 'sfr'), many = houses.length > 120;
  const pieces = [];
  for (const e of els) {
    if (e.kind === 'lot' || e.kind === 'trail' || e.kind === 'parking' || (e.kind === 'drive' || e.kind === 'truck') && !e.name || e.kind === 'green' && !e.name || e.kind === 'plaza' && !/deck|plaza|court/i.test((e.name || '') + (e.note || '')) || many && e.use === 'sfr') continue;
    const c = f.to(S.centroid(S.shapeOf(e))), free = S.isFree(e);
    pieces.push({ id: e.id, name: labelOf(e), kind: e.kind, use: e.use || null, at: [r(c[0]), r(c[1])], size: free ? null : [r(e.w), r(e.d)], turn: free ? null : r(f.rotTo(e.rot || 0)), floors: e.floors ?? null, units: e.units ?? null, type: e.type || null, note: e.note || null, ...(e.pinned ? { pinned: true } : {}), ...(e.id === sel ? { selected: true } : {}) });
  }
  const rows = els.filter(e => e.kind === 'parking'), m = S.metrics(plan), byStories = {}; for (const h of houses) byStories[h.floors || 1] = (byStories[h.floors || 1] || 0) + 1;
  return { site: { acres: +(S.ringArea(plan.ring) / 43560).toFixed(2), widthFt: r(f.width), depthFt: r(f.depth) }, places: placesOf(plan, f), totals: { units: m.units || 0, floorAreaSf: r(m.gfa), parkingSpaces: m.spaces, parkingRequired: m.required, buildings: els.filter(e => e.kind === 'building').length },
    parking: { rows: rows.length, spaces: m.spaces }, ...(houses.length ? { houses: { count: houses.length, listed: !many, byStories, mix: homeMixOf(plan) } } : {}), pieces };
}
// the single-family home mix (share of homes by stories) the plan's homes are laid out with
export const homeMixOf = plan => { const p = S.normalizeProgram(plan.program || {}); return (p.homeMix || p.zones?.find(z => z.use === 'sfr' && z.homeMix)?.homeMix || S.HOME_MIX).map(t => ({ stories: t.stories, pct: t.pct })); };
// a new home mix across the plan: its program (and each zone of homes on lots) and the layout's recipe, so a re-fit lays
// the lots out again at the widths those homes need (a 3-story home sits on a 40 ft lot, a 2-story on 50, a 1-story on
// 60): the streets stay, the homes along them change. null when the mix keeps no homes.
export function withHomeMix(plan, mix) {
  const m = (mix || []).filter(t => [1, 2, 3].includes(t.stories) && t.pct > 0).map(t => ({ stories: t.stories, pct: t.pct })); if (!m.length) return null;
  const prog = p => p && typeof p === 'object' ? { ...p, homeMix: m, ...(Array.isArray(p.zones) ? { zones: p.zones.map(z => z?.use === 'sfr' ? { ...z, homeMix: m } : z) } : {}) } : p;
  const rc = plan.recipe && { ...plan.recipe, ...(plan.recipe.prog ? { prog: prog(plan.recipe.prog) } : {}), ...(plan.recipe.seq?.blocks ? { seq: { ...plan.recipe.seq, blocks: plan.recipe.seq.blocks.map(b => b.fill === 'sfr' && b.prog ? { ...b, prog: { ...b.prog, homeMix: m } } : b) } } : {}) };
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
  const zones = (plan.zones || []).filter(z => z.ring?.length >= 3).map(z => ({ name: z.name || S.USES[z.use]?.label || z.use, use: z.use, ...box(z.ring.map(p => f.to(p))) }));
  return { site, areas, ...(zones.length ? { zones } : {}) };
}
// the library as the AI reads it: id, name and footprint
export const catalogText = () => BUILDING_TYPES.map(t => t.id + ' = ' + t.name + ' · ' + t.w + ' × ' + t.d + ' ft').join('\n');

// ---------- applying edits ----------
// op: { action: change | remove | add | move | swap, target, with, type, kind, use, name, floors, units, w, d, x, y, turn,
// every, floorsOver } (add with kind 'entrance': a driveway in from the street at x, y, else where it helps most).
// every (change / remove, no target): every piece of that use ('multifamily', 'townhomes'…) or kind ('pool', 'building'…),
// only those with more than floorsOver floors when it's given; listed or not ("make all the apartments 3 stories").
// Homes on lots don't change stories one by one: their lots are sized for them, so that's the home mix (withHomeMix).
// x, y, turn are in the sheet's frame. Returns { elements, streets, done: [sentences], skipped: [sentences], touched: [ids] }.
// Every piece changed, moved or added is pinned, so a re-fit lays the rest out round it.
export function applyEdits(plan, ops, opts = {}) {
  const f = sheetFrame(plan), done = [], skipped = [], touched = new Set(), placed = new Set(); // placed: moved, resized or new (checked for a clear spot)
  let els = (plan.elements || []).map(e => structuredClone(e)), streets = plan.streets || [];
  const P = () => ({ ...plan, elements: els }), byId = id => id && els.find(e => e.id === id), id = opts.newId || (() => 'e' + Math.random().toString(36).slice(2, 9));
  const left = []; // where moved and removed pieces were: parking they had cut there grows back
  // a park as it was, with what moved with it (put back where they were when there's no clear spot for it: its name and
  // the rest of what changed stay), and the line that said what was done to it, the word for it and the line without
  // the move ([line, 'moved', 'Park: named Big park.' or null])
  const orig = new Map(), said = new Map(), keep = (t, also = []) => { if (t?.kind === 'green' && !orig.has(t.id)) orig.set(t.id, [t, ...also].map(x => structuredClone(x))); }, say = (ids, word, rest = null) => { for (const i of ids) said.set(i, [done[done.length - 1], word, rest]); };
  const GEO = ['x', 'y', 'w', 'd', 'rot', 'poly', 'path', 'pinned'], putBack = x => { const e = byId(x.id); if (e) for (const k of GEO) { if (x[k] === undefined) delete e[k]; else e[k] = x[k]; } };
  const noRoom = (near, e) => 'No room beside ' + labelOf(near) + ' for ' + labelOf(e) + ': every side runs into a street, a building or the lot line.' + (S.isPark(e) ? ' Try a smaller one, or beside something else.' : '');
  const moveWith = (t, dx, dy, att) => { for (const x of [t, ...att]) { left.push(S.outline(x)); S.moveBy(x, dx, dy); x.pinned = true; touched.add(x.id); } placed.add(t.id); };
  // a building's type from the library, floors, units or use; the words for what changed go in what
  const alter = (t, op, what) => {
    if (op.type) { const T = typeById(op.type); if (!T) skipped.push('No building type ' + op.type + ' in the library.'); else { const keep = { id: t.id, x: t.x, y: t.y, rot: t.rot || 0, name: t.use === T.use ? t.name : '' }; for (const k of ['poly', 'form', 'wing', 'podium', 'unitW', 'sf', 'units', 'jog', 'shape', 'type', 'storage', 'ft', 'fuel']) delete t[k]; Object.assign(t, fromType(T, [t.x, t.y], t.rot || 0), keep); what.push('a ' + T.name.replace(/ · /g, ', ')); } }
    if (op.floors && t.kind === 'building' && op.floors !== t.floors) { if (t.units && !op.units) t.units = Math.max(1, Math.round(t.units * op.floors / (t.floors || 1))); t.floors = Math.round(op.floors); what.push(t.floors + (t.floors > 1 ? ' stories' : ' story')); }
    if (op.units && t.kind === 'building') { t.units = Math.round(op.units); what.push(t.units + ' units'); }
    if (op.use && t.kind === 'building' && op.use !== t.use && S.USES[op.use]) { t.use = op.use; delete t.type; what.push(S.USES[op.use].label.toLowerCase()); }
  };
  const use0 = S.normalizeProgram(plan.program || {}).use, isUse = k => !!S.USES[k], useOf = e => e.use || use0;
  for (const op of ops || []) {
    if (op.every && !op.target && (op.action === 'change' || op.action === 'remove')) { // every piece of a use or kind at once
      const word = n => isUse(op.every) ? (EVERY[op.every] || [S.USES[op.every].label.toLowerCase() + ' building'])[0] + (n === 1 ? '' : (EVERY[op.every] || [, 's'])[1]) : (LABEL[op.every] || op.every).toLowerCase().replace(/s$/, '') + (n === 1 ? '' : 's'), over = Number.isFinite(op.floorsOver) ? op.floorsOver : null;
      let hit = els.filter(e => (isUse(op.every) ? e.kind === 'building' && useOf(e) === op.every : e.kind === op.every) && (over == null || (e.floors || 1) > over));
      const desc = n => word(n) + (over != null ? ' over ' + over + (over === 1 ? ' story' : ' stories') : '');
      if (op.action === 'change' && op.floors) { const lots = hit.filter(e => e.kind === 'building' && useOf(e) === 'sfr'); if (lots.length) { skipped.push('Homes on lots take their stories from the home mix (their lots are sized for them), not one by one.'); hit = hit.filter(e => !lots.includes(e)); if (!hit.length) continue; } }
      if (!hit.length) { skipped.push('No ' + desc(0) + ' on the plan.'); continue; }
      if (op.action === 'remove') { const gone = new Set(); for (const t of hit) { gone.add(t); for (const a of S.attachedTo(P(), t)) gone.add(a); } for (const x of gone) left.push(S.outline(x)); els = els.filter(e => !gone.has(e)); done.push('Removed ' + hit.length + ' ' + desc(hit.length) + (gone.size > hit.length ? ' and what went with them' : '') + '.'); continue; }
      let n = 0, what = [];
      for (const t of hit) { const w = []; keep(t); alter(t, op, w); if (w.length) { n++; what = w; t.pinned = true; touched.add(t.id); if (op.type) placed.add(t.id); } }
      done.push(n ? (n === 1 ? 'The one ' : 'All ' + n + ' ') + desc(n) + ': ' + what.join(', ') + '.' : 'Nothing to change on the ' + desc(2) + ': already that way.'); continue;
    }
    const t = byId(op.target), at = op.x != null && op.y != null ? f.from([op.x, op.y]) : null, rot = op.turn != null ? f.rotFrom(op.turn) : null;
    if (op.action !== 'add' && !t) { skipped.push('Couldn’t find ' + (op.target ? 'piece ' + op.target : 'which piece to change') + '.'); continue; }
    if (op.action === 'remove') {
      const att = S.attachedTo(P(), t); left.push(...[t, ...att].map(x => S.outline(x))); els = els.filter(e => e !== t && !att.includes(e)); done.push('Removed ' + labelOf(t) + (att.length ? ' and its ' + att.map(a => labelOf(a).toLowerCase()).join(', ') : '') + '.'); continue;
    }
    if (op.action === 'swap') {
      const w = byId(op.with); if (!w) { skipped.push('Couldn’t find what to swap ' + labelOf(t) + ' with.'); continue; }
      const a1 = S.attachedTo(P(), t), a2 = S.attachedTo(P(), w), d = [w.x - t.x, w.y - t.y], r1 = t.rot || 0, r2 = w.rot || 0;
      keep(t, [w, ...a1, ...a2]); keep(w, [t, ...a1, ...a2]); moveWith(t, d[0], d[1], a1); moveWith(w, -d[0], -d[1], a2); if (!S.isFree(t) && !S.isFree(w) && a1.length + a2.length === 0) { t.rot = r2; w.rot = r1; }
      done.push('Swapped ' + labelOf(t) + ' and ' + labelOf(w) + '.'); say([t.id, w.id], 'swapped'); continue;
    }
    if (op.action === 'move') {
      const near = byId(op.with), att = S.attachedTo(P(), t), r0 = t.rot; keep(t, att); if (rot != null && !S.isFree(t) && !at) t.rot = rot; // (turned first: beside() finds room for it as it will stand)
      const to = at || (near ? beside(near, t, f, P(), att, placed.has(near.id)) : null); if (!to) { t.rot = r0; skipped.push(near ? noRoom(near, t) : 'No place given to move ' + labelOf(t) + ' to.'); continue; }
      const c = S.centroid(S.shapeOf(t)); moveWith(t, to[0] - c[0], to[1] - c[1], att);
      if (rot != null && !S.isFree(t)) t.rot = rot; done.push('Moved ' + labelOf(t) + '.'); say([t.id], 'moved'); continue;
    }
    if (op.action === 'add' && op.kind === 'entrance') { // a driveway in from the street: where asked (or on the street beside the piece named), else where it helps most
      const near = !at && byId(op.with), ents = S.entrancesOf(els).map(S.outline), taken = q => ents.some(o => o.some(p => Math.hypot(p[0] - q[0], p[1] - q[1]) < 100)), ring = plan.ring || [];
      // (beside a piece where there's a way in already, as when two are asked for by it: 150 ft along the street either side)
      const along = q => { const k = S.nearestEdge(ring, q), a = ring[k], b = ring[(k + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [150, -150].map(d => [q[0] + (b[0] - a[0]) / L * d, q[1] + (b[1] - a[1]) / L * d]).filter(p => !taken(p)); };
      const asks = at ? [at] : near ? streetPoints({ ...P(), streets }, near).flatMap(q => taken(q) ? along(q) : [q]) : [];
      let r = asks.length ? null : (m => m.added.length ? { elements: m.elements, entrance: m.added[0], streets: P().streets, note: '' } : { error: m.note })(S.moreEntrances({ ...P(), streets }, 1)), past = '', why = null;
      for (const ask of asks) { // each lot line it could come from in turn; a park in the way: along the street past it
        let q = S.addEntrance({ ...P(), streets }, ask, { id: id() });
        if (q.error && q.park) { const r2 = S.addEntrance({ ...P(), streets }, ask, { id: id(), slide: 400 }); if (!r2.error) { past = ' It’s ' + Math.round(Math.hypot(r2.at[0] - ask[0], r2.at[1] - ask[1])) + ' ft along the street from where it was asked, clear of ' + q.park.name + '.'; q = r2; } }
        if (!q.error) { r = q; break; } if (!why || q.park && !why.park) why = q; }
      r ||= why; if (r.error) { skipped.push(r.error); continue; }
      els = r.elements; streets = r.streets || streets; touched.add(r.entrance.id); done.push('Added ' + r.entrance.name + ' from the street.' + past + (r.note ? ' ' + r.note : '')); continue;
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
    // change: another type from the library, more floors, a size, a use, a name, a turn, a new spot
    const was = labelOf(t), what = []; keep(t, at ? S.attachedTo(P(), t) : []); alter(t, op, what);
    if ((op.w || op.d) && !S.isFree(t)) { if (op.w) t.w = op.w; if (op.d) t.d = op.d; delete t.type; what.push(Math.round(t.w) + ' × ' + Math.round(t.d) + ' ft'); }
    if (rot != null && !S.isFree(t)) { t.rot = rot; what.push('turned'); }
    if (op.name) { t.name = op.name; what.push('named ' + op.name); }
    if (at) { const att = S.attachedTo(P(), t), c = S.centroid(S.shapeOf(t)); moveWith(t, at[0] - c[0], at[1] - c[1], att); what.push('moved'); }
    t.pinned = true; touched.add(t.id); if (op.type || (op.w || op.d || rot != null) && !S.isFree(t)) placed.add(t.id); // (a drawn outline keeps its size and angle)
    const rest = what.filter(w => !/^(moved|turned|\d+ × \d+ ft)$/.test(w)); // (what stays if the park can't go where asked)
    done.push(what.length ? was + ': ' + what.join(', ') + '.' : 'Nothing to change on ' + was + '.'); say([t.id], at ? 'moved' : op.w || op.d ? 'resized' : rot != null ? 'turned' : 'changed', rest.length ? was + ': ' + rest.join(', ') + '.' : null);
  }
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
  // homes give way: a building, pool, court, playground or park moved or added among houses takes their place (as parking
  // gives way): the houses under it (and a 12 ft margin, 4 for a park), with their lots and driveways, go. Without this a
  // community center moved into the middle of the lots couldn't land, and the re-fit that followed lost whole streets of homes.
  { const HOMEU = ['sfr', 'townhomes', 'duplex'], isHome = e => e.kind === 'building' && HOMEU.includes(e.use); let gave = 0;
    for (const tid of new Set([...placed, ...touched])) {
      const e = byId(tid); if (!e || isHome(e) || ['parking', 'lot', 'drive', 'trail', 'truck', 'keepout'].includes(e.kind) || e.kind === 'green' && !(S.isPark(e) && placed.has(tid))) continue; // (a park only renamed stays as it is)
      const drop = S.homesUnder(P(), e, S.isPark(e) ? 4 : 12), hit = [...drop].filter(isHome); if (!drop.size && !S.isPark(e)) continue;
      for (const x of [...drop]) if (touched.has(x.id) || placed.has(x.id)) drop.delete(x); // never what's being placed (a new pool beside a house reads as the house's)
      els = els.filter(x => !drop.has(x)); gave += hit.length; if (S.isPark(e)) els = S.trimLots(els, e); // (the lots of the homes that stay come back off it)
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
  }
  return { elements: els, streets, done, skipped, touched: [...touched] };
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
export function guessEdits(text, plan, sel = null) {
  const t = String(text || '').toLowerCase().replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|sixteen)\b/g, w => NUM[w]), els = plan.elements || [], ops = [];
  const named = els.filter(e => e.name).sort((a, b) => b.name.length - a.name.length), find = s => {
    s = s.trim().replace(/^(the|a|an)\s+/, ''); if (/^(it|this|this one|that|that one|selected|the selected one)$/.test(s)) return els.find(e => e.id === sel) || null;
    const n = s.replace(/\bbuilding\b/, 'bldg').replace(/\bbldg\.?\s*/, 'bldg '), num = n.match(/\b(\d+|[a-z])$/)?.[1];
    return named.find(e => e.name.toLowerCase() === s || e.name.toLowerCase().replace(/^apt /, '') === n) || named.find(e => num && /bldg|building/.test(n) && new RegExp('(bldg|building) ' + num + '$', 'i').test(e.name)) || named.find(e => e.name.toLowerCase().includes(s)) || null;
  };
  let last = null; // the piece the last sentence moved ("…and add a pool to it")
  for (const part of t.split(/\s*(?:[.;]|\band then\b|,\s*(?:and|then)\b|\balso\b|\band (?=add\b|put\b|give\b|re-?(?:fit|lay)\b))\s*/).filter(Boolean)) { // ("…and re-fit": a part of its own, read by the caller)
    let m;
    if ((m = part.match(/^(?:please\s+)?(?:move|put|place|relocate|shift)\s+(.+?)\s+(?:to|into|in|at|on|toward|towards)\s+(?:the\s+)?(.+)$/))) { // "move the community center to the middle of the homes"
      const e = find(m[1]), at = placeAt(plan, m[2]); if (e && at) { ops.push({ action: 'move', target: e.id, x: at[0], y: at[1] }); last = e; continue; } }
    if ((m = part.match(/^(?:add|put|give it|include)\s+(?:a\s+|an\s+)?(pool|playground|pickleball courts?|courts?|lawn|park|open space)\b(?:.*\b(?:to|beside|next to|by|with)\s+(it|this|.+))?$/))) {
      const kind = /pool/.test(m[1]) ? 'pool' : /play/.test(m[1]) ? 'play' : /court/.test(m[1]) ? 'court' : 'green', near = m[2] ? (/^(it|this)$/.test(m[2].trim()) ? last || els.find(e => e.id === sel) : find(m[2])) : last || els.find(e => e.id === sel);
      if (near) { ops.push({ action: 'add', kind, with: near.id, ...(kind === 'pool' ? { w: 60, d: 30 } : {}), ...(m[1] === 'park' ? { name: 'Park' } : m[1] === 'open space' ? { name: 'Open space' } : {}) }); continue; } }
    if (/\b(?:add|put|give (?:it|us|the site)|need|want)\b.*\b(?:entrance|entry|driveway|curb cut|way in)s?\b/.test(part)) { const n = +(part.match(/\b(\d)\s+(?:more\s+)?(?:entrance|entr|driveway|curb|way)/)?.[1] || 1), at = part.match(/\b(?:at|by|near|beside|next to)\s+(.+)$/)?.[1], near = at && find(at); // "…at the open space": on the street beside it
      for (let i = 0; i < Math.min(n, 4); i++) ops.push({ action: 'add', kind: 'entrance', ...(near ? { with: near.id } : {}) }); continue; }
    if ((m = part.match(/^(?:please\s+)?(?:remove|delete|take out|get rid of)\s+(.+)$/))) { const e = find(m[1]); if (e) ops.push({ action: 'remove', target: e.id }); continue; }
    if ((m = part.match(/swap\s+(.+?)\s+(?:and|with)\s+(.+)$/))) { const a = find(m[1]), b = find(m[2]); if (a && b) ops.push({ action: 'swap', target: a.id, with: b.id }); continue; }
    if ((m = part.match(/^(?:turn|rotate)\s+(.+?)(?:\s+(\d+)\s*(?:°|deg|degrees))?$/))) { const e = find(m[1]); if (e && !S.isFree(e)) ops.push({ action: 'change', target: e.id, turn: sheetFrame(plan).rotTo((e.rot || 0) + (+m[2] || 90)) }); continue; }
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
