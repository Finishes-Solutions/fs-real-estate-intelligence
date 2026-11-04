// A layout run: a validated brief in, ranked and independently checked layouts out, and a record that replays exactly.
//
//   runBrief(brief) -> record { schema, versions, inputHash, brief (canonical), solver (seed, tick, evaluation stats),
//                               outcome, options: [{ rank, id, name, geometryHash, elements, quantities, validation }] }
//   replayRun(record) -> { identical, diffs, record }   (no AI, no network: only the saved brief)
//
// The engine runs inside lib/enginectx.mjs deterministic(): a seeded random generator and a virtual clock, so the
// searches' time budgets become evaluation budgets. Same brief, seed, tick and versions -> same geometry, ids,
// quantities and ranking on any machine (test/layoutrun.mjs repeats representative runs 20 times).
//
// Outcomes (never one dressed as another):
//   feasible            – at least one option passes every hard check it could measure ('best found', not optimal)
//   needs-review        – options exist with no hard failure, but some hard checks are unknown (missing evidence)
//   no-feasible-found   – the search ran its budget; every option fails a hard check (not a proof of infeasibility)
//   proven-infeasible   – an analytic bound shows the program cannot fit (reason given)
//   unsupported         – the brief asks for a form the engine does not draw (lib/layoutcaps.mjs)
//   missing-information – the brief lacks what a run needs (the site, the program)
//   invalid-brief       – the brief is malformed
import * as CX from './enginectx.mjs';
import * as B from './layoutbrief.mjs';
import * as V from './layoutcheck.mjs';
import { CAPS, CAPS_VERSION, FORMLESS_OK } from './layoutcaps.mjs';
import { hashOf } from './sha256.mjs';
import { layoutOptions } from './sitelayout.mjs';
import * as S from './siteplan.mjs';
import polyclip from './vendor/polyclip.mjs';
import * as T from './bldgtemplates.mjs';

export const RUN_SCHEMA = 'rei.run/1';
export const ENGINE_VERSION = 'rei-layout/2026.11.03.1'; // bump when a change to lib/site*.mjs or lib/streetnet.mjs moves geometry
export const versions = () => ({ engine: ENGINE_VERSION, validator: V.VALIDATOR_VERSION, caps: CAPS_VERSION, templates: T.TEMPLATES_VERSION, brief: B.BRIEF_SCHEMA });

const r2 = v => typeof v === 'number' ? Math.round(v * 100) / 100 : v;
// a piece with its numbers at 0.01 ft and its keys in a fixed order (the stored, hashed form)
function canonEl(e) {
  const out = {};
  for (const k of Object.keys(e).sort()) {
    const v = e[k];
    if (v === undefined || typeof v === 'function') continue;
    out[k] = typeof v === 'number' ? r2(v) : Array.isArray(v) ? JSON.parse(JSON.stringify(v, (_, x) => typeof x === 'number' ? r2(x) : x)) : v && typeof v === 'object' ? JSON.parse(JSON.stringify(v, (_, x) => typeof x === 'number' ? r2(x) : x)) : v;
  }
  return out;
}
export const canonElements = els => (els || []).map(canonEl);
export const geometryHash = els => hashOf(canonElements(els).map(e => { const { note, name, ...g } = e; return g; }));

// Paving left behind: when trimming to an exact count (or parking fits) took buildings away, their parking rows and the
// dead-end drives to them stay drawn (an empty paved block). Rows with no building within FAR_FT go, farthest first,
// while the parking left still meets what's required; then drives that reach nothing (no row, no building within
// FAR_FT, one paved neighbour) go. Entrances and drives that join other paving never do. The validator judges the result
// and lib/layoutrun.mjs keeps it only when no hard check gets worse.
const FAR_FT = 80;
// A second way in the fire code asks for (lib/layoutcheck.mjs access.second) when the layout has only one: the engine's
// own search for one (S.moreEntrances) with the pond and its trail set aside, since a leftover-land pond often takes the
// only free stretch of street (23737 FM 2920, Hockley: along Becker Road). The pond is then cut back from the new drive
// (10 ft) and keeps its largest piece; the trail keeps the stretches that don't cross the drive. Kept only when no hard
// check gets worse (keepIfNoWorse); the detention line reports what the pond now holds.
export function addSecondAccess(plan, o, brief) {
  if (!o?.elements?.length) return o;
  const v = V.validateLayout({ ...plan, elements: o.elements, program: o.program || {} }, brief), c = v.checks.find(x => x.id === 'access.second');
  if (c?.status !== 'fail') return o;
  const wet = o.elements.filter(e => e.kind === 'pond' || e.kind === 'trail'), rest = o.elements.filter(e => !wet.includes(e));
  const edges = (plan.streets || []).concat(plan.front != null ? [plan.front] : []);
  let m = null;
  for (const opts of [{ edges, throughParks: true }, { edges, throughParks: true, W: 24 }]) { try { m = S.moreEntrances({ ...plan, elements: o.elements }, 1, opts); } catch { m = null; } if (m?.added?.length) break;
    try { m = S.moreEntrances({ ...plan, elements: rest }, 1, opts); } catch { m = null; } if (m?.added?.length) break; }
  if (!m?.added?.length) return o;
  const added = m.elements.filter(e => !o.elements.some(x => x.id === e.id) && e.kind === 'drive'), cuts = added.map(d => S.grow(S.shapeOf(d), 10));
  const cl = r => { const q = S.signedArea(r) >= 0 ? r : r.slice().reverse(); return q.concat([q[0]]); };
  const ponds = []; for (const e of wet.filter(e => e.kind === 'pond')) { let pieces = [S.shapeOf(e)];
    for (const k of cuts) pieces = pieces.flatMap(pc => { try { return polyclip.difference([cl(pc)], [cl(k)]).map(pg => pg[0].slice(0, -1)); } catch { return [pc]; } });
    const big = pieces.filter(r => r.length >= 3).sort((a, b) => S.ringArea(b) - S.ringArea(a))[0]; if (big && S.ringArea(big) > 2000) ponds.push({ ...e, poly: big.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]), x: undefined, y: undefined, w: undefined, d: undefined, rot: undefined }); }
  const trails = []; for (const t of wet.filter(e => e.kind === 'trail' && e.path?.length >= 2)) { let run = [], k = 0; const flush = () => { if (run.length >= 2) trails.push({ ...t, id: t.id + (k ? '-' + k : ''), path: run }); k++; run = []; };
    for (const p of t.path) { if (cuts.some(r => S.inRing(p, r))) flush(); else run.push(p); } flush(); }
  const fixed = m.elements.filter(e => e.kind !== 'pond' && e.kind !== 'trail').concat(ponds.map(e => Object.fromEntries(Object.entries(e).filter(([, x]) => x !== undefined))), trails);
  return { ...o, elements: fixed, tplNotes: [...(o.tplNotes || []), 'A second way in added for fire access' + (ponds.length && wet.some(e => e.kind === 'pond') ? ', the pond cut back from it' : '') + ' (' + (m.added[0]?.name || 'Entrance') + ').'] };
}
// a changed option kept only when it breaks no hard check the original passed
function keepIfNoWorse(plan, was, now, brief) {
  if (now === was) return was;
  const v0 = V.validateLayout({ ...plan, elements: was.elements, program: was.program || {} }, brief), v1 = V.validateLayout({ ...plan, elements: now.elements, program: now.program || {} }, brief);
  const ok = id => v1.checks.find(c => c.id === id)?.status !== 'fail';
  return v0.checks.filter(c => c.hard && c.status === 'pass').every(c => ok(c.id)) ? now : was;
}
export function pruneSurplus(plan, o, brief) {
  if (!o?.elements?.length) return o;
  const els = o.elements.slice(), isB = e => e.kind === 'building' && !e.future, B = () => els.filter(isB);
  const near = (e, list, d) => { const s = S.shapeOf(e); return list.some(b => S.gapBetween(s, S.shapeOf(b)) <= d); };
  const pk = () => V.quantities({ ...plan, elements: els, program: o.program || {} }, brief).parking;
  let p = pk(); if (p.required == null || p.provided <= p.required) return o;
  const rows = els.filter(e => e.kind === 'parking' && !e.rv && !e.vac && !near(e, B(), FAR_FT))
    .map(e => ({ e, d: Math.min(...B().map(b => S.gapBetween(S.shapeOf(e), S.shapeOf(b)))) })).sort((a, b) => b.d - a.d || String(a.e.id).localeCompare(String(b.e.id)));
  let cut = 0;
  for (const { e } of rows) { const n = (() => { try { return S.stallCentres(e).length; } catch { return 0; } })(); if (p.provided - n < p.required) continue; els.splice(els.indexOf(e), 1); cut++; p = pk(); }
  if (!cut) return o;
  // drives that now reach nothing: a leaf in the paving (one paved neighbour), no row and no building near it
  const paved = () => els.filter(e => ['drive', 'parking', 'truck', 'field'].includes(e.kind)), touch = (a, b) => S.gapBetween(S.shapeOf(a), S.shapeOf(b)) <= 1;
  let dropped = 0;
  for (let pass = 0; pass < 12; pass++) {
    const P = paved(), leaf = els.filter(e => e.kind === 'drive' && !S.isEntrance(e) && !e.entry && !e.through && P.filter(q => q !== e && touch(e, q)).length <= 1 && !near(e, B(), FAR_FT) && !P.some(q => q.kind === 'parking' && touch(e, q)));
    if (!leaf.length) break; for (const d of leaf) { els.splice(els.indexOf(d), 1); dropped++; }
  }
  // the paving under a lot (field) is redrawn from what's left
  const kept = els.filter(e => e.kind !== 'field');
  let fields = []; try { fields = S.fieldsOf(kept, plan.ring) || []; } catch { fields = els.filter(e => e.kind === 'field'); }
  return { ...o, elements: kept.concat(fields), tplNotes: [...(o.tplNotes || []), cut + ' parking row' + (cut > 1 ? 's' : '') + (dropped ? ' and ' + dropped + ' drive' + (dropped > 1 ? 's' : '') : '') + ' no building uses taken out (left as landscape): the parking left still meets what’s required.'] };
}
// a lower bound on the land a program needs: the footprint alone at its most floors, against the land inside the
// setbacks. Only a proof when it fails by a margin: buildings need drives and parking besides.
function infeasibleBound(brief) {
  const ring = brief.site.ring, sb = { ...S.SETBACKS, ...(brief.rules?.values?.setbacks?.v || {}) };
  let land; try { const inner = S.insetRing(ring, ring.map(() => Math.min(+sb.side || 0, +sb.front || 0, +sb.rear || 0))); land = inner?.length >= 3 ? S.ringArea(inner) : S.ringArea(ring); } catch { land = S.ringArea(ring); }
  land -= (brief.site.exclusions || []).reduce((s, x) => s + S.ringArea(x.ring), 0) + (brief.site.holes || []).reduce((s, h) => s + S.ringArea(h), 0);
  let need = 0; const why = [];
  for (const u of brief.program.uses) {
    const q = u.quantity, n = q.mode === 'range' ? q.min : q.mode === 'maximize' || q.mode === 'max' ? 0 : q.value; if (!n) continue;
    const floors = Math.max(u.floors || 0, { multifamily: 5, townhomes: 4, duplex: 2, sfr: 3 }[u.use] || 1);
    const sfEach = q.unit === 'units' ? ({ multifamily: 400, townhomes: 600, duplex: 600, sfr: 600 }[u.use] || 400) : 1;
    if (q.unit === 'buildings') continue;
    const foot = n * sfEach / floors; need += foot; why.push(u.use + ': at least ' + Math.round(foot).toLocaleString('en-US') + ' sf of footprint (' + n + ' ' + q.unit + ' at ' + floors + ' floors, ' + sfEach + ' sf each)');
  }
  return need > land ? { need: Math.round(need), land: Math.round(land), why } : null;
}

// rank: feasible first; then the program met; then fewer unknowns; then the yield the brief maximizes; then less paving;
// then the geometry hash (a fixed, arbitrary tie-break)
function rankKey(o, brief) {
  const v = o.validation, prog = v.checks.filter(c => c.id.startsWith('program.u')), met = prog.filter(c => c.status === 'pass').length;
  const maxi = brief.program.uses.filter(u => ['maximize', 'min', 'max', 'range'].includes(u.quantity.mode)); // more is better up to any cap (a cap's excess already fails the program check)
  const yieldV = maxi.reduce((s, u) => s + (u.quantity.unit === 'units' ? o.quantities.byUse[u.use]?.units || 0 : o.quantities.byUse[u.use]?.gfa || 0), 0);
  const paving = o.quantities.pavedSfGross / Math.max(1, o.quantities.totals.units || o.quantities.totals.gfa / 1000 || 1);
  return [v.feasible ? 0 : 1, -met, v.counts.fail, v.counts.unknown, -yieldV, Math.round(paving), o.geometryHash];
}
export const rankOf = rankKey;
const cmp = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; };

export function runBrief(briefIn, { now = null } = {}) {
  const check = B.validateBrief(briefIn), base = { schema: RUN_SCHEMA, versions: versions(), created: now, request: briefIn?.request || null };
  if (!check.ok) return { ...base, outcome: check.missing.length ? 'missing-information' : 'invalid-brief', problems: check.errors, warnings: check.warnings, options: [] };
  const brief = B.canonicalBrief(briefIn), inputHash = B.inputHash(brief);
  const rec = { ...base, inputHash, brief, warnings: check.warnings };
  // forms the engine can't draw: say so, don't draw something else
  const bad = brief.program.uses.filter(u => u.form && (!CAPS[u.form] ? !FORMLESS_OK.includes(u.form) : CAPS[u.form].status === 'unsupported'));
  if (bad.length) return { ...rec, outcome: 'unsupported', problems: bad.map(u => ({ path: 'program.uses.' + u.id + '.form', msg: (CAPS[u.form]?.label || u.form) + ': ' + (CAPS[u.form]?.note || 'not supported') })), options: [] };
  const partial = brief.program.uses.filter(u => CAPS[u.form]?.status === 'partial').map(u => CAPS[u.form].label + ' is partial: ' + (CAPS[u.form].note || ''));
  const bound = infeasibleBound(brief);
  if (bound) return { ...rec, outcome: 'proven-infeasible', problems: [{ path: 'program', msg: 'The program needs at least ' + bound.need.toLocaleString('en-US') + ' sf of building footprint; the land inside the setbacks is ' + bound.land.toLocaleString('en-US') + ' sf.' }], bound, options: [] };
  // an exact (or capped) apartment count: first the engine asked for just that, which leaves no buildings to trim (and no
  // empty parking where they stood); when that comes up short, again asked for a little more, trimmed by whole modules.
  // Both sets are ranked together by the validator.
  const capped = brief.program.uses.some(u => u.use === 'multifamily' && ['exact', 'max', 'range'].includes(u.quantity.mode) && T.templatesFor(u.form).length);
  const E = B.toEngine(brief, { overshoot: !capped });
  const lay1 = Ex => { let out; try { out = layoutOptions(Ex.plan, Ex.program, Ex.opts) || []; } catch (e) { out = [{ error: String(e && e.message || e) }]; } return out; };
  const short = list => brief.program.uses.some(u => { if (u.use !== 'multifamily' || !['exact', 'range', 'max'].includes(u.quantity.mode)) return false; const need = u.quantity.mode === 'range' ? u.quantity.min : u.quantity.mode === 'max' ? Math.floor(u.quantity.value * 0.9) : u.quantity.value; // (at most: well under the cap is worth a second try)
    return !list.some(o => !o.error && o.elements?.some(e => e.template) && o.elements.filter(e => e.template && (e.tplUse === u.id)).reduce((t, e) => t + e.units, 0) >= need); });
  const { value: raw, stats } = CX.deterministic({ seed: brief.solver.seed, tickMs: brief.solver.tickMs }, () => {
    const fit = (Ex, out) => out.map(o => { if (o.error) return o; const t = T.fitParking(T.trimHomes(T.applyTemplates(Ex.plan, o, brief), brief), els => V.quantities({ ...Ex.plan, elements: els, program: o.program || Ex.program }, brief).parking); const t2 = keepIfNoWorse(Ex.plan, t, pruneSurplus(Ex.plan, t, brief), brief); return keepIfNoWorse(Ex.plan, t2, addSecondAccess(Ex.plan, t2, brief), brief); }); // building schedules from the templates, then parking met, inside the run
    let got = fit(E, lay1(E));
    if (capped && short(got)) { const E2 = B.toEngine(brief); got = got.concat(fit(E2, lay1(E2))); }
    return got;
  });
  const err = raw.find(o => o.error);
  const options = raw.filter(o => o.elements?.length).map((o, i) => {
    const elements = canonElements(o.elements), lay = { ...E.plan, elements, program: o.program || E.program };
    const validation = V.validateLayout(lay, brief);
    const { elements: _e, notes: _n, tplNotes: _t, error: _x, ...engine } = o; // the engine's own fields (score, recipe, frame…), kept for the editor
    return { ...engine, id: 'opt-' + (i + 1), engineOrder: i, name: o.name || 'Layout ' + (i + 1), geometryHash: geometryHash(elements), elements, program: o.program || E.program, params: o.params || E.plan.params, recipe: o.recipe ?? null, zones: o.zones || [], notes: [...(o.notes || []), ...(o.tplNotes || [])], quantities: validation.quantities, validation };
  });
  options.sort((a, b) => cmp(rankKey(a, brief), rankKey(b, brief)));
  options.forEach((o, i) => { o.rank = i + 1; });
  // the options handed back differ in substance: one with the same numbers as a kept one (a mirror image, the same
  // buildings shuffled) is left out, and so is a feasible one yielding under 60% of the best feasible one; better fewer
  // options than padding (a capped request's 24-unit layout beside 144-unit ones)
  const sig = o => [o.quantities.totals.units, Math.round(o.quantities.totals.gfa / 100), o.quantities.parking.provided, o.quantities.totals.buildings].join('|');
  const yieldOf = o => o.quantities.totals.units || o.quantities.totals.gfa / 1000, best = Math.max(0, ...options.filter(o => o.validation.feasible).map(yieldOf));
  const keep = [], seen = new Set();
  for (const o of options) { if (keep.length >= brief.solver.options) break; const k = sig(o); if (seen.has(k)) continue; if (best && o.validation.feasible && yieldOf(o) < 0.6 * best) continue; seen.add(k); keep.push(o); }
  keep.forEach((o, i) => { o.rank = i + 1; });
  const outcome = !keep.length ? 'no-feasible-found' : keep.some(o => o.validation.status === 'pass') ? 'feasible' : keep.some(o => o.validation.feasible) ? 'needs-review' : 'no-feasible-found';
  return { ...rec, outcome, optimality: 'best found (heuristic search; not proven optimal)', engineMapping: E.mapping, partial, engineError: err?.error || null,
    solver: { seed: brief.solver.seed, tickMs: brief.solver.tickMs, evaluation: stats, candidates: options.length },
    rankingHash: hashOf(keep.map(o => [o.rank, o.geometryHash])), options: keep };
}

// The fields that must match on replay (the record's creation time and notes' wording may differ)
const essence = r => ({ outcome: r.outcome, inputHash: r.inputHash, versions: r.versions, rankingHash: r.rankingHash, options: (r.options || []).map(o => ({ rank: o.rank, geometryHash: o.geometryHash, quantities: hashOf(o.quantities), validation: hashOf(o.validation.checks.map(c => [c.id, c.status, c.measured])) })) });
export function replayRun(saved) {
  const again = runBrief(saved.brief || saved), a = essence(saved), b = essence(again), diffs = [];
  if (a.outcome !== b.outcome) diffs.push('outcome ' + a.outcome + ' → ' + b.outcome);
  if (hashOf(a.versions) !== hashOf(b.versions)) diffs.push('versions changed: ' + JSON.stringify(a.versions) + ' → ' + JSON.stringify(b.versions));
  if (a.inputHash !== b.inputHash) diffs.push('input hash');
  if (a.rankingHash !== b.rankingHash) diffs.push('ranking');
  a.options.forEach((o, i) => { const p = b.options[i]; if (!p) diffs.push('option ' + o.rank + ' missing'); else { if (o.geometryHash !== p.geometryHash) diffs.push('option ' + o.rank + ' geometry'); if (o.quantities !== p.quantities) diffs.push('option ' + o.rank + ' quantities'); if (o.validation !== p.validation) diffs.push('option ' + o.rank + ' checks'); } });
  return { identical: !diffs.length, diffs, record: again };
}

// a compact summary for an API response or a log line
export function summary(rec) {
  return { outcome: rec.outcome, inputHash: rec.inputHash?.slice(0, 16), problems: rec.problems || [], options: (rec.options || []).map(o => ({ rank: o.rank, name: o.name, status: o.validation.status, failed: o.validation.failed, unresolved: o.validation.unresolved, units: o.quantities.totals.units, gfa: o.quantities.totals.gfa, parking: { provided: o.quantities.parking.provided, required: o.quantities.parking.required }, geometryHash: o.geometryHash.slice(0, 16) })) };
}

// The site plan editor's Build (src/siteplan.js, through src/sp-worker.js): the plan, program and search settings it
// hands the engine, made into a brief and run, so the editor's layouts are run records too. What a size means follows
// the plan's Leftover land setting (fill or phase: at least that much; hold: exactly that much). Returns the options in
// the shape lib/sitelayout.mjs layoutOptions gives, each with its independent check (check) and run (run, with the brief
// to replay it).
export const ENGINE_OPT_KEYS = ['count', 'deeper', 'brief', 'parcels', 'perParcel', 'keepout', 'netEvals', 'depth', 'budgetMs', 'pod', 'podBudgetMs', 'netBudgetMs'];
export function runPlan(plan, program, opts = {}, { ask = '', seed = 'rei-1' } = {}) {
  const b = B.briefFromProgram(program, plan, { text: ask, parser: 'app', seed });
  const fm = S.fillMode(plan.params);
  for (const u of b.program.uses) if (u.quantity.mode !== 'maximize') { const v = u.quantity.mode === 'range' ? u.quantity.max : u.quantity.value; u.quantity = fm === 'hold' ? { mode: 'exact', value: v, unit: u.quantity.unit } : { mode: 'min', value: u.quantity.mode === 'range' ? u.quantity.min : v, unit: u.quantity.unit }; }
  const { fill, ...params } = plan.params || {}; void fill; b.program.params = params;
  if (plan.terrain) b.site.terrain = plan.terrain;
  const eo = Object.fromEntries(ENGINE_OPT_KEYS.filter(k => opts[k] !== undefined).map(k => [k, opts[k]]));
  if (eo.keepout) b.site.exclusions = []; // the app's keep-outs go to the engine as it gave them (with their road strips); the validator reads them as keep-out pieces
  b.solver.engineOpts = JSON.parse(JSON.stringify(eo)); b.solver.options = Math.min(12, Math.max(3, +opts.count || 3));
  const rec = runBrief(b);
  if (!rec.options?.length) return { outcome: rec.outcome, problems: rec.problems || [], options: [] };
  const keep = eo.keepout ? eo.keepout.map(e => ({ ...e })) : [];
  return { outcome: rec.outcome, problems: rec.problems || [], partial: rec.partial || [], mapping: rec.engineMapping || [], options: rec.options.map(o => {
    const { validation: v, quantities: q, geometryHash: gh, engineOrder, rank, id, ...rest } = o; void engineOrder; void id;
    const ko = keep.filter(k => !rest.elements.some(e => e.id === k.id));
    return { ...rest, elements: rest.elements.concat(ko), check: { status: v.status, failed: v.failed, unresolved: v.unresolved, counts: v.counts }, run: { inputHash: rec.inputHash, seed: rec.brief.solver.seed, tickMs: rec.brief.solver.tickMs, versions: rec.versions, outcome: rec.outcome, rank, geometryHash: gh, brief: rec.brief } };
  }) };
}
