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

export const TEMPLATES_VERSION = 'tpl/' + REF_TEMPLATES_VERSION + '+wtol5';
// how far under whole modules a bar may be and still count them: the reviewed 24-unit garden bars span 146–154 ft
// (±2.7% of 150); 5% is a planning tolerance on top of that, stated wherever a building uses it
export const W_TOL = 0.05;
// the forms whose buildings take a module template
const FORM_TEMPLATES = { 'mf-garden': ['mf-garden-breezeway-3s'], 'mf-garden-studio': ['mf-garden-studio-3s'], 'mf-walkup': ['mf-garden-breezeway-3s'], 'mf-midrise': ['mf-midrise-corridor-4s', 'mf-midrise-corridor-5s'], 'mf-stacked-townhome': ['mf-stacked-2over2-4s'] };

// A depth the person chose for corridor buildings (the brief's use.depth: "83 ft deep corridor buildings", "deep corridor
// bars"): the reviewed corridor bay (lib/reftemplates.mjs mf-midrise-corridor-*, 65 ft deep) drawn that deep instead,
// the same bay width and homes a floor, each home larger. No reviewed corridor building is that deep, so the template
// says so: evidence_strength 'user-chosen', and the check reports it as an assumption (lib/layoutcheck.mjs).
export const DEEP = { min: 66, max: 95, dflt: 80, forms: ['mf-midrise'] };
const DERIVED = new Map();
function deepOf(t, depth) {
  const id = t.id + '-d' + depth; if (DERIVED.has(id)) return DERIVED.get(id);
  const m = { ...t.module, d: depth }, out = { ...t, id, module: m, grossSfPerUnit: Math.round(m.w * m.d / m.unitsPerFloor), userDepth: depth, base: t.id, evidence_strength: 'user-chosen',
    label: t.label + ', ' + depth + ' ft deep (chosen)', derivation: t.derivation + '; drawn ' + depth + ' ft deep as asked: an estimate, deeper than any reviewed corridor building (' + t.module.d + ' ft)' };
  DERIVED.set(id, out); return out;
}
export const templatesFor = (form, u = null) => { const list = (FORM_TEMPLATES[form] || []).map(id => REF_TEMPLATES[id]).filter(Boolean), dp = +u?.depth?.value;
  return dp >= DEEP.min && dp <= DEEP.max && DEEP.forms.includes(form) ? list.map(t => deepOf(t, Math.round(dp))) : list; };
export const templateOf = id => REF_TEMPLATES[id] || DERIVED.get(id) || (() => { const m = /^(.*)-d(\d+)$/.exec(String(id || '')); return m && REF_TEMPLATES[m[1]] ? deepOf(REF_TEMPLATES[m[1]], +m[2]) : null; })();

// the template for a building drawn d ft deep with this many floors: the deepest module that fits the drawn depth
function pick(list, depth, floors) {
  const ok = list.filter(t => t.module.d <= depth + 0.5 && (!floors || t.floors === floors || (t.floorsRange && floors >= t.floorsRange[0] && floors <= t.floorsRange[1])));
  return ok.sort((a, b) => b.module.d - a.module.d || a.id.localeCompare(b.id))[0] || null;
}
const unitsOfB = (t, modules, floors) => modules * t.module.unitsPerFloor * floors;

// the apartment uses in a brief and the buildings each one owns: a mixed plan's buildings carry their zone's index
// (e.zone), which the brief's use keeps (u.zone); a single-use plan's apartment buildings all belong to its one use
export function mfUses(brief) { return (brief?.program?.uses || []).filter(u => u.use === 'multifamily' && templatesFor(u.form).length); }
const ownerOf = (uses, e) => uses.length === 1 && uses[0].zone == null ? uses[0] : uses.find(u => u.zone === e.zone) || (uses.length === 1 ? uses[0] : null);

export function applyTemplates(plan, o, brief) {
  const uses = mfUses(brief);
  if (!uses.length || !o?.elements?.length) return o;
  const notes = [], els = o.elements.map(e => ({ ...e }));
  const mf = els.filter(e => e.kind === 'building' && (e.use || o.program?.use) === 'multifamily' && !e.future && (!e.form || e.form === 'bar'));
  const snapped = new Map(), dropped = new Map();
  for (const e of mf) {
    const u = ownerOf(uses, e); if (!u) continue;
    const list = templatesFor(u.form, u), along = e.w >= e.d ? 'w' : 'd', across = along === 'w' ? 'd' : 'w', L = e[along], D = e[across], floors = u.floors || e.floors || 3;
    const t = pick(list, D, floors);
    if (!t) { e.tplMiss = 'No template fits a ' + Math.round(D) + ' ft deep, ' + floors + '-floor building'; continue; }
    // a bar up to W_TOL short of whole modules counts them, kept at its drawn length (never stretched); longer bars are
    // cut back to whole modules
    const modules = Math.min(Math.floor((L + 0.5) / (t.module.w * (1 - W_TOL))), t.maxModules || Infinity); // (a template's longest row: a stacked-townhome row of 10 bays)
    if (modules < t.minModules) { e.drop = true; dropped.set(u, (dropped.get(u) || 0) + 1); continue; }
    const newL = Math.min(L, +(modules * t.module.w).toFixed(2));
    e[along] = newL; e[across] = t.module.d; e.floors = floors;
    e.units = unitsOfB(t, modules, floors); e.template = t.id; e.tplUnits = e.units; e.tplL = newL; e.modules = modules; e.tplUse = u.id;
    e.note = t.label + ' · ' + modules + ' × ' + t.module.label + ' · ' + e.units + ' units' + (t.userDepth ? ' · estimate: deeper than any reviewed corridor building' : t.stacked ? ' · estimate: two 2-story homes stacked in each reviewed townhome bay' : '');
    if (t.stacked) { e.stacked = { bays: modules, bay: t.module.w }; e.name = e.name && /^Apt Bldg/.test(e.name) ? e.name.replace(/^Apt Bldg/, 'Stacked TH Bldg') : e.name; }
    snapped.set(u, (snapped.get(u) || 0) + 1);
  }
  let out = els.filter(e => !e.drop);
  for (const u of uses) {
    const list = templatesFor(u.form, u), mine = () => out.filter(e => e.template && e.tplUse === u.id && !e.drop), total = () => mine().reduce((t, e) => t + e.units, 0);
    // exact / max / range: take whole modules off (the shortest buildings first), then whole buildings, until within it
    const q = u.quantity, cap = q.mode === 'exact' || q.mode === 'max' ? q.value : q.mode === 'range' ? q.max : null;
    if (cap != null) {
      let guard = 0;
      while (total() > cap && guard++ < 500) {
        const over = total() - cap, cand = mine().sort((a, b) => a.modules - b.modules || String(a.id).localeCompare(String(b.id)));
        // an exact count a whole module would undershoot (250 from 12-home stacks: 252, not 240): the last few homes are
        // combined in pairs into larger homes (a two-bed and a one-bed into a three-bed), in the biggest buildings, at most
        // one pair a floor of a stack; the schedule records it (combined), so the check still reconciles the building
        // (also when the modules left can't come off without undershooting: every building at its fewest modules and
        // each holding more than the excess, the excess within a tenth of the count: 216 drawn for 200 from 24-home bars
        // gave 192 by taking a whole bar off; 16 pairs combined give 200 in the same buildings)
        const perOf = e => templateOf(e.template).module.unitsPerFloor * e.floors, pairs = cand.reduce((t, e) => t + e.modules * e.floors - (e.combined || 0), 0);
        const stuck = q.mode === 'exact' && over <= Math.ceil(cap * 0.1) && over <= pairs && !cand.some(e => e.modules > templateOf(e.template).minModules && perOf(e) <= over) && cand.every(e => e.units > over);
        if (q.mode === 'exact' && (stuck || cand.every(e => perOf(e) > over))) {
          let left = over; const order = cand.slice().reverse(); for (const [j, e] of order.entries()) { if (!left) break; const k = Math.min(left, e.modules * e.floors - (e.combined || 0), stuck ? Math.ceil(left / (order.length - j)) : Infinity); /* (many pairs: spread over the buildings, not all in one) */ if (k <= 0) continue;
            e.combined = (e.combined || 0) + k; e.units -= k; e.tplUnits = e.units; left -= k; e.note = templateOf(e.template).label + ' · ' + e.modules + ' × ' + templateOf(e.template).module.label + ' · ' + e.units + ' units (' + e.combined + ' pair' + (e.combined > 1 ? 's' : '') + ' of homes combined into larger homes)'; }
          if (!left) { notes.push((uses.length > 1 ? (u.name || u.form) + ': ' : '') + 'exactly ' + cap + ' units: ' + over + ' pair' + (over > 1 ? 's' : '') + ' of homes combined into larger homes (whole stacks give ' + (cap + over) + ').'); break; }
        }
        // a module off the longest building that can spare one (rows stay whole, a little shorter: taking the shortest
        // buildings away first left a block of parking with nothing in it, 23737 FM 2920 Hockley's mixed-use plan); a
        // whole building goes only when none can spare a module
        let done = false;
        const spare = cand.filter(e => e.modules > templateOf(e.template).minModules).sort((a, b) => b.modules - a.modules || String(a.id).localeCompare(String(b.id)));
        for (const e of spare) { const t = templateOf(e.template), per = t.module.unitsPerFloor * e.floors; if (per <= over || q.mode !== 'exact') { shrink(e, t); done = true; break; } }
        for (let k = 0; k < cand.length && !done; k++) { const e = cand[k], t = templateOf(e.template), per = t.module.unitsPerFloor * e.floors; if (per <= over || k === cand.length - 1) { shrink(e, t); done = true; } }
        if (!done) break;
      }
      out = out.filter(e => !e.drop);
    }
    const got = total(), name = uses.length > 1 ? (u.name || u.form) + ': ' : '';
    if (snapped.get(u)) notes.push(name + 'apartment buildings are whole ' + list[0].module.label + 's (' + [...new Set(mine().map(e => e.template))].join(', ') + (list.some(t => t.evidence_strength === 'estimate') ? ', an estimate' : '') + '); units come from the template schedule' + (dropped.get(u) ? '; ' + dropped.get(u) + ' building' + (dropped.get(u) > 1 ? 's' : '') + ' too short for the smallest building removed' : '') + '.');
    if (cap != null && q.mode === 'exact' && got !== q.value) notes.push(name + 'exactly ' + q.value + ' units isn’t reachable with whole modules here: ' + got + ' laid out.');
  }
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
  e.x = +(e.x + dx).toFixed(2); e.y = +(e.y + dy).toFixed(2); e[along] = newL; e.modules--; e.units = unitsOfB(t, e.modules, e.floors); e.tplUnits = e.units; e.tplL = newL;
  e.note = t.label + ' · ' + e.modules + ' × ' + t.module.label + ' · ' + e.units + ' units' + (t.userDepth ? ' · estimate: deeper than any reviewed corridor building' : t.stacked ? ' · estimate: two 2-story homes stacked in each reviewed townhome bay' : ''); // (a module off: still said to be an estimate where it is one, as applyTemplates says it)
  if (e.stacked) e.stacked = { ...e.stacked, bays: e.modules }; // (the bays the drawing shows follow)
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
      { // the home taken off the end goes with its lot (each townhome sits on a lot of its own): the lot under the end home's middle
        const off = row[along] / 2 - uw / 2, end = along === 'w' ? [row.x + off * Math.cos(a), row.y + off * Math.sin(a)] : [row.x - off * Math.sin(a), row.y + off * Math.cos(a)];
        const lot = els.find(e => e.kind === 'lot' && !e.drop && S.inRing(end, S.shapeOf(e))); if (lot) { lot.drop = true; const L = S.shapeOf(lot); for (const dw of els.filter(e => e.kind === 'plaza' && e.note === 'Driveway' && !e.drop && S.inRing([e.x, e.y], L))) dw.drop = true; } } // (and its driveway)
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
  const t = q.mode === 'range' ? q.max : q.value; return t ? Math.ceil(t * 1.2) + 24 : null; // room for the bars too short to keep and the ends snapped off
}
void S;
