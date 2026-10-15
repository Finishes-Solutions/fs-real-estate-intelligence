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
  const rows = els.filter(e => e.kind === 'parking'), m = S.metrics(plan);
  return { site: { acres: +(S.ringArea(plan.ring) / 43560).toFixed(2), widthFt: r(f.width), depthFt: r(f.depth) }, totals: { units: m.units || 0, floorAreaSf: r(m.gfa), parkingSpaces: m.spaces, parkingRequired: m.required, buildings: els.filter(e => e.kind === 'building').length },
    parking: { rows: rows.length, spaces: m.spaces }, ...(many ? { houses: houses.length + ' houses on lots (not listed)' } : {}), pieces };
}
// the library as the AI reads it: id, name and footprint
export const catalogText = () => BUILDING_TYPES.map(t => t.id + ' = ' + t.name + ' · ' + t.w + ' × ' + t.d + ' ft').join('\n');

// ---------- applying edits ----------
// op: { action: change | remove | add | move | swap, target, with, type, kind, use, name, floors, units, w, d, x, y, turn }
// (add with kind 'entrance': a driveway in from the street at x, y, else where it helps most)
// x, y, turn are in the sheet's frame. Returns { elements, streets, done: [sentences], skipped: [sentences], touched: [ids] }.
// Every piece changed, moved or added is pinned, so a re-fit lays the rest out round it.
export function applyEdits(plan, ops, opts = {}) {
  const f = sheetFrame(plan), done = [], skipped = [], touched = new Set(), placed = new Set(); // placed: moved, resized or new (checked for a clear spot)
  let els = (plan.elements || []).map(e => structuredClone(e)), streets = plan.streets || [];
  const P = () => ({ ...plan, elements: els }), byId = id => id && els.find(e => e.id === id), id = opts.newId || (() => 'e' + Math.random().toString(36).slice(2, 9));
  const left = []; // where moved and removed pieces were: parking they had cut there grows back
  const moveWith = (t, dx, dy, att) => { for (const x of [t, ...att]) { left.push(S.outline(x)); S.moveBy(x, dx, dy); x.pinned = true; touched.add(x.id); } placed.add(t.id); };
  for (const op of ops || []) {
    const t = byId(op.target), at = op.x != null && op.y != null ? f.from([op.x, op.y]) : null, rot = op.turn != null ? f.rotFrom(op.turn) : null;
    if (op.action !== 'add' && !t) { skipped.push('Couldn’t find ' + (op.target ? 'piece ' + op.target : 'which piece to change') + '.'); continue; }
    if (op.action === 'remove') {
      const att = S.attachedTo(P(), t); left.push(...[t, ...att].map(x => S.outline(x))); els = els.filter(e => e !== t && !att.includes(e)); done.push('Removed ' + labelOf(t) + (att.length ? ' and its ' + att.map(a => labelOf(a).toLowerCase()).join(', ') : '') + '.'); continue;
    }
    if (op.action === 'swap') {
      const w = byId(op.with); if (!w) { skipped.push('Couldn’t find what to swap ' + labelOf(t) + ' with.'); continue; }
      const a1 = S.attachedTo(P(), t), a2 = S.attachedTo(P(), w), d = [w.x - t.x, w.y - t.y], r1 = t.rot || 0, r2 = w.rot || 0;
      moveWith(t, d[0], d[1], a1); moveWith(w, -d[0], -d[1], a2); if (!S.isFree(t) && !S.isFree(w) && a1.length + a2.length === 0) { t.rot = r2; w.rot = r1; }
      done.push('Swapped ' + labelOf(t) + ' and ' + labelOf(w) + '.'); continue;
    }
    if (op.action === 'move') {
      const near = byId(op.with), to = at || (near ? beside(near, t, f) : null); if (!to) { skipped.push('No place given to move ' + labelOf(t) + ' to.'); continue; }
      const att = S.attachedTo(P(), t), c = S.centroid(S.shapeOf(t)); moveWith(t, to[0] - c[0], to[1] - c[1], att);
      if (rot != null && !S.isFree(t)) t.rot = rot; done.push('Moved ' + labelOf(t) + '.'); continue;
    }
    if (op.action === 'add' && op.kind === 'entrance') { // a driveway in from the street: where asked, else where it helps most
      const r = at ? S.addEntrance({ ...P(), streets }, at, { id: id() }) : (m => m.added.length ? { elements: m.elements, entrance: m.added[0], streets: P().streets, note: '' } : { error: m.note })(S.moreEntrances({ ...P(), streets }, 1));
      if (r.error) { skipped.push(r.error); continue; }
      els = r.elements; streets = r.streets || streets; touched.add(r.entrance.id); done.push('Added ' + r.entrance.name + ' from the street.' + (r.note ? ' ' + r.note : '')); continue;
    }
    if (op.action === 'add') {
      const T = op.type && typeById(op.type), kind = T ? 'building' : op.kind || 'building', near = byId(op.with);
      const e = T ? { id: id(), ...fromType(T, [0, 0], 0) } : { id: id(), kind, x: 0, y: 0, w: op.w || DEF[kind]?.[0] || 60, d: op.d || DEF[kind]?.[1] || 40, rot: 0, ...(kind === 'building' ? { use: op.use || 'retail', floors: op.floors || 1 } : {}), ...(DEF[kind]?.[2] ? { name: DEF[kind][2] } : {}) };
      if (op.name) e.name = op.name; if (op.floors && e.kind === 'building') e.floors = op.floors; if (op.units) e.units = op.units;
      e.rot = rot ?? (near && !S.isFree(near) ? near.rot || 0 : f.rotFrom(0));
      const to = at || (near ? beside(near, e, f) : f.from([f.width / 2, f.depth / 2])); e.x = +to[0].toFixed(2); e.y = +to[1].toFixed(2); e.pinned = true;
      els.push(e); touched.add(e.id); placed.add(e.id); done.push('Added ' + (T ? T.name : labelOf(e)) + '.'); continue;
    }
    // change: another type from the library, more floors, a size, a use, a name, a turn, a new spot
    const was = labelOf(t), what = [];
    if (op.type) { const T = typeById(op.type); if (!T) skipped.push('No building type ' + op.type + ' in the library.'); else { const keep = { id: t.id, x: t.x, y: t.y, rot: t.rot || 0, name: t.use === T.use ? t.name : '' }; for (const k of ['poly', 'form', 'wing', 'podium', 'unitW', 'sf', 'units', 'jog', 'shape', 'type']) delete t[k]; Object.assign(t, fromType(T, [t.x, t.y], t.rot || 0), keep); what.push('a ' + T.name.replace(/ · /g, ', ')); } }
    if (op.floors && t.kind === 'building' && op.floors !== t.floors) { if (t.units && !op.units) t.units = Math.max(1, Math.round(t.units * op.floors / (t.floors || 1))); t.floors = Math.round(op.floors); what.push(t.floors + (t.floors > 1 ? ' stories' : ' story')); }
    if (op.units && t.kind === 'building') { t.units = Math.round(op.units); what.push(t.units + ' units'); }
    if (op.use && t.kind === 'building' && op.use !== t.use && S.USES[op.use]) { t.use = op.use; delete t.type; what.push(S.USES[op.use].label.toLowerCase()); }
    if ((op.w || op.d) && !S.isFree(t)) { if (op.w) t.w = op.w; if (op.d) t.d = op.d; delete t.type; what.push(Math.round(t.w) + ' × ' + Math.round(t.d) + ' ft'); }
    if (rot != null && !S.isFree(t)) { t.rot = rot; what.push('turned'); }
    if (op.name) { t.name = op.name; what.push('named ' + op.name); }
    if (at) { const att = S.attachedTo(P(), t), c = S.centroid(S.shapeOf(t)); moveWith(t, at[0] - c[0], at[1] - c[1], att); what.push('moved'); }
    t.pinned = true; touched.add(t.id); if (op.type || op.w || op.d || rot != null) placed.add(t.id);
    done.push(what.length ? was + ': ' + what.join(', ') + '.' : 'Nothing to change on ' + was + '.');
  }
  // what was changed must still be inside the setbacks and off the other buildings; drives and parking re-fit round it
  for (const tid of placed) {
    const e = byId(tid); if (!e || e.kind !== 'building' && e.kind !== 'garage') continue;
    const att = S.attachedTo(P(), e), obs = S.spotObstacles(P(), e, att, opts.refit ? ['building', 'garage', 'pond', 'pool', 'court', 'play'] : null); // with a re-fit to come, drives and parking give way
    const c = S.clearSpot(P(), e, { carry: att, obs, reach: Math.max(e.w || 0, e.d || 0) + 120 });
    if (c && (c[0] || c[1])) for (const x of [e, ...att]) S.moveBy(x, c[0], c[1]); else if (!c) skipped.push(labelOf(e) + ' doesn’t fit clear of the other buildings there; it shows in red until it’s moved.');
  }
  if (!opts.refit) { // parking gives way under what changed, and grows back where things left (opts.spare: rows cut away whole)
    for (const tid of touched) { const e = byId(tid); if (e && e.kind !== 'parking' && e.kind !== 'green' && e.kind !== 'lot') els = S.cutRows(els, S.outline(e), e.kind === 'building' || e.kind === 'garage' ? 5 : 1, opts.spare); }
    for (const o of left) els = S.regrowRows(els, o, 5, opts.spare);
  }
  return { elements: els, streets, done, skipped, touched: [...touched] };
}
const DEF = { pool: [70, 32, 'Pool'], play: [64, 48, 'Playground'], court: [128, 120, 'Pickleball courts'], green: [120, 90, 'Lawn'], plaza: [60, 40, ''], pond: [200, 120, 'Detention'], garage: [180, 120, 'Parking garage'], patio: [16, 34, ''], building: [60, 40, ''] };
// a spot for b beside a: to its side in the sheet (right, else left, else behind), with a little room between
function beside(a, b, f) {
  const ca = f.to(S.centroid(S.shapeOf(a))), wa = S.isFree(a) ? 60 : Math.max(a.w, a.d) / 2, wb = S.isFree(b) ? 40 : Math.max(b.w || 0, b.d || 0) / 2, g = wa + wb + 30;
  for (const [dx, dy] of [[g, 0], [-g, 0], [0, g], [0, -g]]) { const q = [ca[0] + dx, ca[1] + dy]; if (q[0] > 0 && q[0] < f.width && q[1] > 0 && q[1] < f.depth) return f.from(q); }
  return f.from([ca[0] + g, ca[1]]);
}

// ---------- plain words (when the AI isn't there) ----------
// "make bldg 7 four stories", "remove building 3", "turn the clubhouse", "swap bldg 2 and bldg 5", "make it a
// restaurant", "rename bldg 1 to The Oaks". Names match the plan's labels; "it" / "this" is the selected piece.
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, sixteen: 16 };
export function guessEdits(text, plan, sel = null) {
  const t = String(text || '').toLowerCase().replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|sixteen)\b/g, w => NUM[w]), els = plan.elements || [], ops = [];
  const named = els.filter(e => e.name).sort((a, b) => b.name.length - a.name.length), find = s => {
    s = s.trim().replace(/^(the|a|an)\s+/, ''); if (/^(it|this|this one|that|that one|selected|the selected one)$/.test(s)) return els.find(e => e.id === sel) || null;
    const n = s.replace(/\bbuilding\b/, 'bldg').replace(/\bbldg\.?\s*/, 'bldg '), num = n.match(/\b(\d+|[a-z])$/)?.[1];
    return named.find(e => e.name.toLowerCase() === s || e.name.toLowerCase().replace(/^apt /, '') === n) || named.find(e => num && /bldg|building/.test(n) && new RegExp('(bldg|building) ' + num + '$', 'i').test(e.name)) || named.find(e => e.name.toLowerCase().includes(s)) || null;
  };
  for (const part of t.split(/\s*(?:[.;]|\band then\b|,\s*and\b|\balso\b)\s*/).filter(Boolean)) {
    let m;
    if (/\b(?:add|put|give (?:it|us|the site)|need|want)\b.*\b(?:entrance|entry|driveway|curb cut|way in)s?\b/.test(part)) { const n = +(part.match(/\b(\d)\s+(?:more\s+)?(?:entrance|entr|driveway|curb|way)/)?.[1] || 1); for (let i = 0; i < Math.min(n, 4); i++) ops.push({ action: 'add', kind: 'entrance' }); continue; }
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
