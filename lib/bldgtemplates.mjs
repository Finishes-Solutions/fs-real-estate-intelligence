// Building templates: a building type as a repeating MODULE (a breezeway stack, a corridor bay, a townhome unit) with
// its own depth, floors and units a module a floor. A templated building is a whole number of modules long, and its
// units come from that schedule, never from floor area. Templates come from reviewed reference plans
// (data/reference/templates.json, docs/REFERENCE-PROVENANCE.md); a value the plans don't support is marked an estimate.
//
// applyTemplates(plan, option, brief) runs inside a layout run (lib/layoutrun.mjs): each apartment building the engine
// drew is snapped DOWN to whole modules (centred where it stood, so it never grows into its neighbours), its units set
// from the schedule, and the template recorded on it (template, tplUnits, tplW) for the validator to reconcile. With an
// exact or ranged unit count, whole modules (then whole buildings) are taken off until the count is within it; a count
// the modules can't reach exactly stays short or over and the program check says so.
import * as S from './siteplan.mjs';
import { REF_TEMPLATES, REF_TEMPLATES_VERSION } from './reftemplates.mjs';

export const TEMPLATES_VERSION = 'tpl/' + REF_TEMPLATES_VERSION;
// the forms whose buildings take a module template
const FORM_TEMPLATES = { 'mf-garden': ['mf-garden-breezeway-3s'], 'mf-walkup': ['mf-garden-breezeway-3s'], 'mf-midrise': ['mf-midrise-corridor-4s', 'mf-midrise-corridor-5s'] };

export const templatesFor = form => (FORM_TEMPLATES[form] || []).map(id => REF_TEMPLATES[id]).filter(Boolean);
export const templateOf = id => REF_TEMPLATES[id] || null;

// the template for a building drawn d ft deep with this many floors: the deepest module that fits the drawn depth
function pick(list, depth, floors) {
  const ok = list.filter(t => t.module.d <= depth + 0.5 && (!floors || t.floors === floors || (t.floorsRange && floors >= t.floorsRange[0] && floors <= t.floorsRange[1])));
  return ok.sort((a, b) => b.module.d - a.module.d || a.id.localeCompare(b.id))[0] || null;
}
const unitsOfB = (t, modules, floors) => modules * t.module.unitsPerFloor * floors;

export function applyTemplates(plan, o, brief) {
  const u = brief?.program?.uses?.find(x => x.use === 'multifamily');
  const list = u ? templatesFor(u.form) : [];
  if (!list.length || !o?.elements?.length) return o;
  const notes = [], els = o.elements.map(e => ({ ...e }));
  const mf = els.filter(e => e.kind === 'building' && (e.use || o.program?.use) === 'multifamily' && !e.future && (!e.form || e.form === 'bar'));
  let snapped = 0, dropped = 0;
  for (const e of mf) {
    const along = e.w >= e.d ? 'w' : 'd', across = along === 'w' ? 'd' : 'w', L = e[along], D = e[across], floors = u.floors || e.floors || 3;
    const t = pick(list, D, floors);
    if (!t) { e.tplMiss = 'No template fits a ' + Math.round(D) + ' ft deep, ' + floors + '-floor building'; continue; }
    const modules = Math.floor((L + 0.5) / t.module.w);
    if (modules < t.minModules) { e.drop = true; dropped++; continue; }
    const newL = +(modules * t.module.w).toFixed(2);
    e[along] = newL; e[across] = t.module.d; e.floors = floors;
    e.units = unitsOfB(t, modules, floors); e.template = t.id; e.tplUnits = e.units; e.tplW = along === 'w' ? newL : undefined; e.modules = modules;
    if (along === 'd') e.tplW = undefined;
    e.note = t.label + ' · ' + modules + ' × ' + t.module.label + ' · ' + e.units + ' units';
    snapped++;
  }
  let out = els.filter(e => !e.drop);
  // exact / max / range: take whole modules off (the shortest buildings first), then whole buildings, until within it
  const q = u.quantity, cap = q.mode === 'exact' || q.mode === 'max' ? q.value : q.mode === 'range' ? q.max : null;
  const total = () => out.filter(e => e.template).reduce((s, e) => s + e.units, 0);
  if (cap != null) {
    let guard = 0;
    while (total() > cap && guard++ < 500) {
      const over = total() - cap, cand = out.filter(e => e.template).sort((a, b) => a.modules - b.modules || String(a.id).localeCompare(String(b.id)));
      const t0 = cand.map(e => templateOf(e.template)); let done = false;
      for (let k = 0; k < cand.length && !done; k++) { const e = cand[k], t = t0[k], per = t.module.unitsPerFloor * e.floors; if (per <= over || k === cand.length - 1) { shrink(e, t); done = true; } }
      if (!done) break;
    }
    out = out.filter(e => !e.drop);
  }
  const got = total();
  if (snapped) notes.push('Apartment buildings are whole ' + list[0].module.label + 's (' + [...new Set(out.filter(e => e.template).map(e => e.template))].join(', ') + '); units come from the template schedule' + (dropped ? '; ' + dropped + ' building' + (dropped > 1 ? 's' : '') + ' too short for one module removed' : '') + '.');
  if (cap != null && q.mode === 'exact' && got !== q.value) notes.push('Exactly ' + q.value + ' units isn’t reachable with whole modules here: ' + got + ' laid out (' + list[0].module.unitsPerFloor * (u.floors || 3) + ' units a module at ' + (u.floors || 3) + ' floors).');
  return { ...o, elements: out, tplNotes: notes };
}
// Parking is never relaxed: while a templated layout needs more spaces than it draws, a module comes off (the longest
// building first, so rows stay even). measure(els) -> { required, provided } from the drawing (lib/layoutcheck.mjs).
export function fitParking(o, measure) {
  if (!o?.elements?.some(e => e.template)) return o;
  const els = o.elements.map(e => ({ ...e })); let pk = measure(els), cut = 0, guard = 0;
  while (pk.required != null && pk.required > pk.provided && guard++ < 400) {
    const live = els.filter(e => e.template && !e.drop).sort((a, b) => b.modules - a.modules || String(a.id).localeCompare(String(b.id)));
    if (!live.length) break; shrink(live[0], templateOf(live[0].template)); cut++;
    pk = measure(els.filter(e => !e.drop));
  }
  if (!cut) return o;
  const kept = els.filter(e => !e.drop);
  return { ...o, elements: kept, tplNotes: [...(o.tplNotes || []), cut + ' module' + (cut > 1 ? 's' : '') + ' taken off so the parking drawn meets the parking required (' + pk.provided + ' of ' + pk.required + ').'] };
}
function shrink(e, t) {
  if (e.modules <= t.minModules) { e.drop = true; e.units = 0; return; }
  const along = e.w >= e.d ? 'w' : 'd', L = e[along], newL = +((e.modules - 1) * t.module.w).toFixed(2), sh = (L - newL) / 2, a = (e.rot || 0) * Math.PI / 180;
  // keep one end where it was (the end nearer the start of its row), so the gap to the next building grows, never shrinks
  const dx = along === 'w' ? -sh * Math.cos(a) : sh * Math.sin(a), dy = along === 'w' ? -sh * Math.sin(a) : -sh * Math.cos(a);
  e.x = +(e.x + dx).toFixed(2); e.y = +(e.y + dy).toFixed(2); e[along] = newL; e.modules--; e.units = unitsOfB(t, e.modules, e.floors); e.tplUnits = e.units; if (e.tplW != null) e.tplW = newL;
  e.note = t.label + ' · ' + e.modules + ' × ' + t.module.label + ' · ' + e.units + ' units';
}

// Attached and paired homes asked for as an exact, maximum or ranged count: whole homes come off the ends of the
// longest rows (a row keeps at least 3 townhomes), and a duplex comes off whole, until the count is within the ask.
export function trimHomes(o, brief) {
  if (!o?.elements?.length) return o;
  const els = o.elements.map(e => ({ ...e })), notes = [];
  for (const u of brief?.program?.uses || []) {
    if (!['townhomes', 'duplex'].includes(u.use)) continue;
    const q = u.quantity, cap = q.mode === 'exact' || q.mode === 'max' ? q.value : q.mode === 'range' ? q.max : null; if (cap == null) continue;
    const mine = () => els.filter(e => e.kind === 'building' && (e.use || o.program?.use) === u.use && !e.drop && !e.future), total = () => mine().reduce((t, e) => t + (+e.units || 1), 0);
    let cut = 0, guard = 0;
    while (total() > cap && guard++ < 500) {
      const over = total() - cap, rows = mine().sort((a, b) => (+b.units || 1) - (+a.units || 1) || String(a.id).localeCompare(String(b.id)));
      const row = u.use === 'townhomes' ? rows.find(e => (+e.units || 1) > 3) : rows.find(e => (+e.units || 1) <= over);
      if (!row) break;
      if (u.use === 'duplex') { row.drop = true; cut += +row.units || 1; continue; }
      const along = row.w >= row.d ? 'w' : 'd', uw = row[along] / row.units, sh = uw / 2, a = (row.rot || 0) * Math.PI / 180;
      row.x = +(row.x + (along === 'w' ? -sh * Math.cos(a) : sh * Math.sin(a))).toFixed(2); row.y = +(row.y + (along === 'w' ? -sh * Math.sin(a) : -sh * Math.cos(a))).toFixed(2);
      row[along] = +(row[along] - uw).toFixed(2); row.units -= 1; if (row.sf != null) row.sf = Math.round(row.sf * row.units / (row.units + 1)); cut++;
    }
    if (cut) notes.push(cut + ' ' + (u.use === 'duplex' ? 'duplex home' : 'townhome') + (cut > 1 ? 's' : '') + ' taken off the row ends so the count is ' + (q.mode === 'exact' ? 'exactly ' : 'at most ') + cap + '.');
    if (q.mode === 'exact' && total() !== cap) notes.push('Exactly ' + cap + ' ' + u.use + ' isn’t reachable here: ' + total() + ' laid out.');
  }
  return notes.length ? { ...o, elements: els.filter(e => !e.drop), tplNotes: [...(o.tplNotes || []), ...notes] } : o;
}
// the engine's target when templates apply: a little over the ask, so trimming whole modules can land on it
export function engineTarget(q, form) {
  if (!templatesFor(form).length) return null;
  const t = q.mode === 'range' ? q.max : q.value; return t ? Math.ceil(t * 1.08) + 12 : null;
}
void S;
