// Edits to a saved layout run, as typed operations on stable piece ids and the brief: each applied as one transaction,
// the whole result validated (lib/layoutcheck.mjs), and kept only when it breaks no hard check the layout passed
// before and no lock. A conflict is reported, never quietly resolved by changing the request.
//
//   ops: lock / unlock {target}            – keep pieces exactly as they are through later regeneration
//        move {target, to: 'center' | [x,y] | {dx,dy}}  – move pieces (as a group), re-fit the rest around them
//        keep-entrance {target}             – lock a way in (by id or 'northwest' etc.) and lay the rest out again
//        regenerate                         – lay out again around everything locked
//        set-quantity {use, quantity}       – change what's asked (exact / min / max / range / maximize)
//        set-form {use, form}               – another building form for a use
//        compare-forms {use, forms}         – the same program in two or more forms, side by side (no change made)
//        set-office-share {use, share}      – flex: the office share (changes the parking required)
//        place {use, where: front | back | middle | corner} – where a use sits in a mixed plan
//   target: { ids: [...] } | { kind: 'building' | 'pool' | … } | { use } | { entrance: 'northwest' | … } | { name }
//
// A run record carries edit: { base (the brief before any edit), steps, at (the option rank edited) }; replayEdits()
// rebuilds the result from the base brief and the steps with no AI, and undo() is a replay without the last step.
import * as CX from './enginectx.mjs';
import * as B from './layoutbrief.mjs';
import * as V from './layoutcheck.mjs';
import * as RUN from './layoutrun.mjs';
import * as EV from './siteev.mjs';
import * as S from './siteplan.mjs';
import { refit } from './sitelayout.mjs';
import { CAPS } from './layoutcaps.mjs';
import { hashOf } from './sha256.mjs';

export const EDIT_SCHEMA = 'rei.edit/1';
export const OPS = ['lock', 'unlock', 'move', 'keep-entrance', 'regenerate', 'set-quantity', 'set-form', 'compare-forms', 'set-office-share', 'place'];
const DIRS = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0], northeast: [1, 1], northwest: [-1, 1], southeast: [1, -1], southwest: [-1, -1] };
const PLACES = ['front', 'back', 'middle', 'corner'];

export function validateEdit(e) {
  const err = [];
  if (!e || !OPS.includes(e.op)) err.push('op must be one of ' + OPS.join(', '));
  else {
    if (['lock', 'unlock', 'move', 'keep-entrance'].includes(e.op) && !e.target) err.push(e.op + ' needs a target');
    if (e.op === 'move' && !(e.to === 'center' || Array.isArray(e.to) || (e.to && Number.isFinite(+e.to.dx) && Number.isFinite(+e.to.dy)))) err.push("move needs to: 'center', [x, y] or { dx, dy }");
    if (e.op === 'set-quantity' && !(e.quantity && B.MODES.includes(e.quantity.mode))) err.push('set-quantity needs a quantity with a mode');
    if ((e.op === 'set-form' || e.op === 'compare-forms') && !(e.form || e.forms?.length)) err.push(e.op + ' needs form(s)');
    if (e.op === 'set-office-share' && !(+e.share >= 0 && +e.share <= 1)) err.push('share must be 0–1');
    if (e.op === 'place' && !PLACES.includes(e.where)) err.push('where must be one of ' + PLACES.join(', '));
  }
  return { ok: !err.length, errors: err };
}

// ---------- which pieces a target means ----------
const centreOf = r => { let x = 0, y = 0; for (const p of r) { x += p[0]; y += p[1]; } return [x / r.length, y / r.length]; };
export function resolveTarget(option, site, t) {
  const els = option.elements || [];
  if (!t) return [];
  if (Array.isArray(t.ids)) return t.ids.filter(id => els.some(e => e.id === id));
  if (t.entrance) {
    const d = DIRS[String(t.entrance).toLowerCase().replace(/[\s-]/g, '')]; if (!d) return [];
    const c = centreOf(site.ring), L = Math.hypot(d[0], d[1]), ents = els.filter(e => e.kind === 'drive' && (e.entry || e.name === 'Main entry' || /^Entrance\b/.test(e.name || '')));
    const score = e => { const p = centreOf(S.shapeOf(e)), v = [p[0] - c[0], p[1] - c[1]], n = Math.hypot(v[0], v[1]) || 1; return (v[0] * d[0] + v[1] * d[1]) / (n * L); };
    const best = ents.map(e => [score(e), e]).sort((a, b) => b[0] - a[0] || String(a[1].id).localeCompare(String(b[1].id)))[0];
    return best && best[0] > 0.3 ? [best[1].id] : []; // must lie that way from the centre (within about 70°)
  }
  return els.filter(e => (!t.kind || e.kind === t.kind) && (!t.use || e.use === t.use) && (!t.name || e.name === t.name) && (t.kind !== 'building' || e.use !== 'amenity' || t.use === 'amenity')).map(e => e.id);
}
// a pool moves with its deck
function withCompanions(option, ids) {
  const els = option.elements, set = new Set(ids);
  for (const id of ids) { const e = els.find(x => x.id === id); if (e?.kind === 'pool') for (const o of els) if (o.kind === 'plaza' && /pool/i.test(o.note || o.name || '') && Math.hypot(o.x - e.x, o.y - e.y) < 5) set.add(o.id); }
  return [...set];
}

// ---------- words to edits (no AI; the AI's edit step returns the same ops, checked by validateEdit) ----------
export function editFromWords(text, { selection = [] } = {}) {
  const t = String(text || '').toLowerCase(), edits = [], unclear = [];
  const qWords = B.quantityFromWords(text.replace(/\bkeep\b/i, 'exactly'));
  if (/\bkeep\b[^.]*\b\d[\d,]*\s*(?:units|apartments|homes)\b/.test(t) && qWords) edits.push({ op: 'set-quantity', use: 'multifamily', quantity: qWords });
  if (/\bcompare\b/.test(t)) { const forms = [...new Set([...t.matchAll(/\b(garden apartments?|townhomes?|townhouses?|courtyard|mid-?rise|cottages?|duplex(?:es)?|podium|wrap)\b/g)].map(m => B.formFromWords(m[1])).filter(Boolean))]; if (forms.length >= 2) edits.push({ op: 'compare-forms', use: 'multifamily', forms }); else unclear.push('Which forms to compare?'); }
  if (/\b(keep|lock)\b[^.]*\bthe buildings\b/.test(t)) edits.push({ op: 'lock', target: { kind: 'building' } });
  if (/\b(lock|keep)\b[^.]*\b(these|this|selected|those)\b/.test(t)) { if (selection.length) edits.push({ op: 'lock', target: { ids: selection } }); else unclear.push('“These” needs a selection on the plan: select the pieces first.'); }
  const mv = /\bmove (?:the )?(pool|clubhouse|playground|dog park|pond)\b[^.]*\b(?:to )?(?:the )?(center|centre|middle)\b/.exec(t);
  if (mv) edits.push({ op: 'move', target: mv[1] === 'clubhouse' ? { kind: 'building', use: 'amenity' } : { kind: { pool: 'pool', playground: 'play', 'dog park': 'green', pond: 'pond' }[mv[1]] }, to: 'center' });
  const ent = /\bkeep (?:the )?(north|south|east|west|northeast|northwest|southeast|southwest|north-east|north-west|south-east|south-west) (?:entrance|entry|way in|driveway)\b/.exec(t);
  if (ent) edits.push({ op: 'keep-entrance', target: { entrance: ent[1].replace('-', '') } });
  if (/\bregenerate|lay (?:out )?(?:the rest|everything else) again|improve (?:the )?parking\b/.test(t) && !edits.some(e => e.op === 'regenerate' || e.op === 'keep-entrance')) edits.push({ op: 'regenerate' });
  const off = /\boffice (?:portion|share|part)?[^.]*?\b(?:to )?(\d{1,2})\s*%/.exec(t); if (off && /\bflex\b/.test(t)) edits.push({ op: 'set-office-share', use: 'industrial', share: +off[1] / 100 });
  const plc = /\b(?:put|place) (?:the )?(retail|shops?|apartments?|townhomes?|office)\b[^.]*?\b(along|on|at|by) (?:the )?(main road|street|front|highway|frontage)/.exec(t);
  if (plc) { edits.push({ op: 'place', use: useWord(plc[1]), where: 'front' }); const beh = /\b(retail|shops?|apartments?|townhomes?|office)\b behind/.exec(t.slice(plc.index + plc[0].length)); if (beh) edits.push({ op: 'place', use: useWord(beh[1]), where: 'back' }); }
  return { edits, unclear };
}
const useWord = w => /shop|retail/.test(w) ? 'retail' : /apart/.test(w) ? 'multifamily' : /town/.test(w) ? 'townhomes' : 'office';

// ---------- applying edits ----------
const lockedMap = (els, ids) => Object.fromEntries(ids.map(id => { const e = els.find(x => x.id === id); return [id, { shape: S.shapeOf(e).map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]) }]; }));
function hardPassed(v) { return new Set(v.checks.filter(c => c.hard && c.status === 'pass').map(c => c.id)); }

// re-fit the option with the locked (and moved) pieces pinned; deterministic from the brief's seed and the step number
function refitAround(brief, option, pinnedIds, step) {
  const E = B.toEngine(brief), pin = new Set(pinnedIds);
  const plan = { ...E.plan, elements: option.elements.map(e => pin.has(e.id) ? { ...e, pinned: true } : { ...e }), recipe: option.recipe, program: option.program, params: option.params || E.plan.params, zones: option.zones || [] };
  if (!option.recipe) return { error: 'This layout has no arrangement to re-fit (a hand-made or community layout): regenerate from the brief instead.' };
  const { value } = CX.deterministic({ seed: hashOf([brief.solver.seed, 'edit', step]), tickMs: brief.solver.tickMs }, () => { try { return refit(plan, { keepout: E.opts.keepout }); } catch (e) { return { error: String(e.message || e) }; } });
  if (!value || value.error || !value.elements?.length) return { error: value?.error || 'The re-fit found no layout around the locked pieces.' };
  return { elements: value.elements.map(e => { const { pinned, ...r } = e; return r; }), notes: value.notes || [] };
}
// the best spot for a group near the site's middle: a fixed spiral of trial offsets, the first that keeps the group clear
// of locked pieces and inside the setbacks
function centreSpot(brief, option, ids, locked) {
  const els = option.elements, grp = els.filter(e => ids.includes(e.id)), locks = els.filter(e => locked.includes(e.id) && !ids.includes(e.id));
  const gc = centreOf(grp.map(e => [e.x, e.y])), sc = S.centroid(brief.site.ring), sb = { ...S.SETBACKS, ...(brief.rules?.values?.setbacks?.v || {}) }, inner = S.insetRing(brief.site.ring, brief.site.ring.map(() => Math.max(sb.side, sb.rear, sb.front)));
  for (let r = 0; r <= 400; r += 20) for (let k = 0; k < (r ? Math.max(8, Math.round(r / 10)) : 1); k++) {
    const a = r ? k / Math.max(8, Math.round(r / 10)) * 2 * Math.PI : 0, to = [sc[0] + r * Math.cos(a), sc[1] + r * Math.sin(a)], dx = to[0] - gc[0], dy = to[1] - gc[1];
    const moved = grp.map(e => S.shapeOf({ ...e, x: e.x + dx, y: e.y + dy }));
    if (moved.some(s => s.some(p => !S.inRing(p, inner || brief.site.ring)))) continue;
    if (moved.some(s => locks.some(l => S.rectsOverlap({ poly: s }, { poly: S.grow(S.shapeOf(l), 10) }, 0)))) continue;
    return { dx: +dx.toFixed(2), dy: +dy.toFixed(2), at: to.map(v => +v.toFixed(1)) };
  }
  return null;
}

// apply one edit to a run record's option (rank `at`). -> { ok, record?, conflicts: [...], interpreted, comparison? }
export function applyEdit(record, edit, { at = 1 } = {}) {
  const chk = validateEdit(edit); if (!chk.ok) return { ok: false, conflicts: chk.errors, interpreted: null };
  const opt = record.options?.find(o => o.rank === at); if (!opt) return { ok: false, conflicts: ['No option ' + at + ' in this run.'] };
  const base = record.edit?.base || record.brief, steps = [...(record.edit?.steps || []), { ...edit, at }], stepNo = steps.length;
  const brief = JSON.parse(JSON.stringify(record.brief)); brief.locks = brief.locks || []; brief.locked = brief.locked || {};
  const site = brief.site, before = hardPassed(opt.validation), interpreted = [];
  const done = (newBrief, option, extra = {}) => {
    const eplan = B.toEngine(newBrief).plan, prog = option.program || opt.program, evd = EV.withEV(eplan, { program: prog, elements: RUN.canonElements(option.elements), notes: option.notes || [] }); // (optional EV chargers placed again on the stalls as laid out after the edit, lib/siteev.mjs)
    const lay = { ...eplan, elements: RUN.canonElements(evd.elements), program: prog };
    const validation = V.validateLayout(lay, newBrief), lost = [...before].filter(id => validation.checks.find(c => c.id === id)?.status === 'fail');
    const lockFail = validation.checks.find(c => c.id === 'locks' && c.status === 'fail');
    if (lost.length || lockFail) return { ok: false, interpreted, conflicts: [...(lockFail ? ['Locked pieces would change: ' + lockFail.features.join(', ')] : []), ...lost.map(id => { const c = validation.checks.find(x => x.id === id); return c.title + ' would fail (' + (c.features.slice(0, 3).join('; ') || c.measured) + ')'; })], rejected: { validation } };
    const { rankHash: _rh, ...opt0 } = { ...opt, ...option }; void _rh; // (the run's tie-break hash is for the elements before this edit)
    const o2 = { ...opt0, notes: evd.notes, elements: lay.elements, geometryHash: RUN.geometryHash(lay.elements), validation, quantities: validation.quantities, rank: 1, name: (opt.name || 'Layout').replace(/ · edited$/, '') + ' · edited' };
    return { ok: true, interpreted, conflicts: [], ...extra, record: { ...record, brief: newBrief, inputHash: B.inputHash(newBrief), options: [o2], rankingHash: hashOf([[1, o2.geometryHash]]), edit: { schema: EDIT_SCHEMA, base, steps, baseHash: B.inputHash(base) } } };
  };
  switch (edit.op) {
    case 'lock': case 'unlock': {
      const ids = resolveTarget(opt, site, edit.target); if (!ids.length) return { ok: false, conflicts: ['Nothing on the plan matches ' + JSON.stringify(edit.target) + '.'], interpreted };
      if (edit.op === 'lock') { brief.locks = [...new Set([...brief.locks, ...ids])].sort(); Object.assign(brief.locked, lockedMap(opt.elements, ids)); interpreted.push('Locked ' + ids.length + ' piece' + (ids.length > 1 ? 's' : '') + ': ' + ids.join(', ')); }
      else { brief.locks = brief.locks.filter(id => !ids.includes(id)); for (const id of ids) delete brief.locked[id]; interpreted.push('Unlocked ' + ids.join(', ')); }
      return done(brief, opt);
    }
    case 'move': {
      let ids = resolveTarget(opt, site, edit.target); if (!ids.length) return { ok: false, conflicts: ['Nothing on the plan matches ' + JSON.stringify(edit.target) + '.'], interpreted };
      const clash = ids.filter(id => brief.locks.includes(id)); if (clash.length) return { ok: false, conflicts: ['These are locked and can’t move: ' + clash.join(', ') + '. Unlock them first.'], interpreted };
      ids = withCompanions(opt, ids);
      const v = edit.to === 'center' ? centreSpot(brief, opt, ids, brief.locks) : Array.isArray(edit.to) ? (c => ({ dx: edit.to[0] - c[0], dy: edit.to[1] - c[1] }))(centreOf(opt.elements.filter(e => ids.includes(e.id)).map(e => [e.x, e.y]))) : { dx: +edit.to.dx, dy: +edit.to.dy };
      if (!v) return { ok: false, conflicts: ['No room near the middle of the site for ' + ids.join(', ') + ' clear of the locked pieces and inside the setbacks.'], interpreted };
      const moved = { ...opt, elements: opt.elements.map(e => ids.includes(e.id) ? { ...e, x: +(e.x + v.dx).toFixed(2), y: +(e.y + v.dy).toFixed(2) } : e) };
      interpreted.push('Moved ' + ids.join(', ') + ' by ' + Math.round(v.dx) + ', ' + Math.round(v.dy) + ' ft' + (v.at ? ' (to the open spot nearest the middle of the site, ' + v.at.join(', ') + ')' : ''));
      const r = refitAround(brief, moved, [...brief.locks, ...ids], stepNo); if (r.error) return { ok: false, conflicts: [r.error], interpreted };
      interpreted.push('Laid the rest out again around the locked and moved pieces');
      return done(brief, { ...moved, elements: r.elements, notes: [...(opt.notes || []), ...r.notes] });
    }
    case 'keep-entrance': case 'regenerate': {
      if (edit.op === 'keep-entrance') { const ids = resolveTarget(opt, site, edit.target); if (!ids.length) return { ok: false, conflicts: ['No entrance lies ' + (edit.target.entrance || JSON.stringify(edit.target)) + ' of the middle of the site.'], interpreted }; brief.locks = [...new Set([...brief.locks, ...ids])].sort(); Object.assign(brief.locked, lockedMap(opt.elements, ids)); interpreted.push('Kept the entrance ' + ids.join(', ')); }
      if (!brief.locks.length) { const rec = RUN.runBrief(brief); return rec.options.length ? { ok: true, interpreted: [...interpreted, 'Laid out again from the brief'], conflicts: [], record: { ...rec, edit: { schema: EDIT_SCHEMA, base, steps, baseHash: B.inputHash(base) } } } : { ok: false, conflicts: ['Regenerating found no layout: ' + rec.outcome], interpreted }; }
      const r = refitAround(brief, opt, brief.locks, stepNo); if (r.error) return { ok: false, conflicts: [r.error], interpreted };
      interpreted.push('Laid the rest out again around ' + brief.locks.length + ' locked piece' + (brief.locks.length > 1 ? 's' : ''));
      return done(brief, { ...opt, elements: r.elements, notes: [...(opt.notes || []), ...r.notes] });
    }
    case 'set-quantity': case 'set-form': case 'set-office-share': case 'place': {
      const u = brief.program.uses.find(x => x.use === (edit.use || brief.program.uses[0].use));
      if (!u) return { ok: false, conflicts: ['The program has no ' + edit.use + '.'], interpreted };
      if (edit.op === 'set-quantity') { u.quantity = { ...edit.quantity, unit: edit.quantity.unit || u.quantity.unit }; delete u.buildings; interpreted.push(u.use + ': ' + JSON.stringify(u.quantity)); }
      if (edit.op === 'set-form') { if (CAPS[edit.form]?.status === 'unsupported') return { ok: false, conflicts: [CAPS[edit.form].label + ' is not supported: ' + (CAPS[edit.form].note || '')], interpreted }; u.form = edit.form; if (edit.form === 'mf-townhome') u.use = 'townhomes'; if (edit.form === 'mf-stacked-townhome') u.use = 'multifamily'; interpreted.push(u.id + ' form → ' + edit.form); }
      if (edit.op === 'set-office-share') { if (u.use !== 'industrial') return { ok: false, conflicts: ['Office share applies to flex / industrial buildings; this use is ' + u.use + '.'], interpreted }; u.officeShare = +edit.share; interpreted.push('Office share ' + Math.round(edit.share * 100) + '% (parking required blends office and warehouse ratios; bays and office fit-out are not drawn: ' + CAPS['flex-multi-tenant'].status + ')'); }
      if (edit.op === 'place') { if (brief.program.uses.length < 2) return { ok: false, conflicts: ['Placement applies to a plan with more than one use.'], interpreted }; u.placement = { where: edit.where }; interpreted.push(u.use + ' at the ' + edit.where); }
      const eng = brief.program.engine; if (eng?.zones && edit.op === 'place') { const z = eng.zones.find(x => x.use === u.use); if (z) z.place = { ...(z.place || {}), where: edit.where === 'back' ? 'back' : edit.where === 'front' ? 'along' : edit.where }; if (edit.where === 'front') eng.zones.sort((a, b) => (b.use === u.use) - (a.use === u.use)); }
      if (eng && edit.op === 'set-form' && brief.program.uses.length === 1) { eng.use = u.use; delete eng.form; delete eng.arrangement; }
      if (brief.locks.length) { const r = refitAround(brief, { ...opt, program: B.toEngine(brief).program }, brief.locks, stepNo); if (r.error) return { ok: false, conflicts: [r.error], interpreted }; interpreted.push('Laid out again around the locked pieces'); return done(brief, { ...opt, program: B.toEngine(brief).program, elements: r.elements }); }
      const rec = RUN.runBrief(brief);
      if (!rec.options.length) return { ok: false, conflicts: ['No layout for the changed brief: ' + rec.outcome + (rec.problems?.length ? ' (' + rec.problems.map(p => p.msg).join('; ') + ')' : '')], interpreted };
      return { ok: true, interpreted: [...interpreted, 'Laid out again from the changed brief'], conflicts: [], record: { ...rec, edit: { schema: EDIT_SCHEMA, base, steps, baseHash: B.inputHash(base) } } };
    }
    case 'compare-forms': {
      const runs = edit.forms.map(f => { const b = JSON.parse(JSON.stringify(brief)), u = b.program.uses.find(x => x.use === (edit.use || 'multifamily')) || b.program.uses[0]; u.form = f; if (f === 'mf-townhome') u.use = 'townhomes'; if (b.program.engine) { b.program.engine.use = u.use; delete b.program.engine.form; delete b.program.engine.arrangement; } return [f, RUN.runBrief(b)]; });
      interpreted.push('Compared ' + edit.forms.join(' and ') + ' for the same program (nothing changed on the plan)');
      return { ok: true, interpreted, conflicts: [], record, comparison: runs.map(([f, r]) => ({ form: f, outcome: r.outcome, best: r.options[0] ? RUN.summary(r).options[0] : null, problems: r.problems || [] })) };
    }
  }
  return { ok: false, conflicts: ['Unknown edit'], interpreted };
}

// several edits as one transaction: all apply, or none
export function applyEdits(record, edits, opts = {}) {
  let rec = record; const interpreted = [], comparisons = [];
  for (const e of edits) { const r = applyEdit(rec, e, { at: rec === record ? opts.at || 1 : 1 }); if (!r.ok) return { ok: false, conflicts: r.conflicts, interpreted: [...interpreted, ...(r.interpreted || [])], failedAt: e }; interpreted.push(...r.interpreted); if (r.comparison) comparisons.push(r.comparison); rec = r.record; }
  return { ok: true, record: rec, interpreted, comparisons, conflicts: [] };
}
// rebuild an edited record from its base brief and steps (no AI); undo is a replay without the last step
export function replayEdits(base, steps) {
  let rec = RUN.runBrief(base);
  for (const s of steps) { const { at, ...e } = s; const r = applyEdit(rec, e, { at }); if (!r.ok) return { ok: false, conflicts: r.conflicts, record: rec }; rec = r.record; }
  return { ok: true, record: rec };
}
export const undo = rec => rec.edit?.steps?.length ? replayEdits(rec.edit.base, rec.edit.steps.slice(0, -1)) : { ok: false, conflicts: ['Nothing to undo.'] };
