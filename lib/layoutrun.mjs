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
  const maxi = brief.program.uses.filter(u => u.quantity.mode === 'maximize' || u.quantity.mode === 'min');
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
  const E = B.toEngine(brief);
  const { value: raw, stats } = CX.deterministic({ seed: brief.solver.seed, tickMs: brief.solver.tickMs }, () => {
    let out; try { out = layoutOptions(E.plan, E.program, E.opts) || []; } catch (e) { out = [{ error: String(e && e.message || e) }]; }
    return out.map(o => o.error ? o : T.fitParking(T.trimHomes(T.applyTemplates(E.plan, o, brief), brief), els => V.quantities({ ...E.plan, elements: els, program: o.program || E.program }, brief).parking)); // building schedules from the templates, then parking met, inside the run
  });
  const err = raw.find(o => o.error);
  const options = raw.filter(o => o.elements?.length).map((o, i) => {
    const elements = canonElements(o.elements), lay = { ...E.plan, elements, program: o.program || E.program };
    const validation = V.validateLayout(lay, brief);
    return { id: 'opt-' + (i + 1), engineOrder: i, name: o.name || 'Layout ' + (i + 1), geometryHash: geometryHash(elements), elements, program: o.program || E.program, params: o.params || E.plan.params, recipe: o.recipe ?? null, zones: o.zones || [], notes: [...(o.notes || []), ...(o.tplNotes || [])], quantities: validation.quantities, validation };
  });
  options.sort((a, b) => cmp(rankKey(a, brief), rankKey(b, brief)));
  options.forEach((o, i) => { o.rank = i + 1; });
  const keep = options.slice(0, brief.solver.options);
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
