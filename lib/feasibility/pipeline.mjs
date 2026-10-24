// @ts-check
// One project from intake to its report data, step by step (docs/INTEGRATION_PLAN.md §3):
//   intake → site (union, envelope, layout option, metrics) → plan set (the schematic sheet list) → budget → pro forma →
//   sensitivity, scenarios, registers → the report set's data.
// Pure and deterministic: no DOM, no network, no clock except `today`. The browser (src/workspace.js), the API
// (api/feasibility.js), the sample run (scripts/sample-run.mjs) and the tests all call these same functions.
import * as S from '../siteplan.mjs';
import * as L from '../sitelayout.mjs';
import * as PF from '../proforma.mjs';
import * as PS from '../planset.mjs';
import { buildingTypes } from '../plandesign.mjs';
import { layoutSig } from '../planstages.mjs';
import { buildEnvelope } from './envelope.mjs';
import { buildBudget, budgetRows, budgetChecks } from './budget.mjs';
import { registerFor, applyOverrides, valuesOf, budgetInputs, rangeNotes, knownKeys, pfOverrides } from './assumptions.mjs';
import { runProForma, holdAnalysis } from './proforma.mjs';
import { tornado, grid, RENT_STEPS, COST_STEPS, CAP_STEPS, RATE_STEPS } from './sensitivity.mjs';
import { facts, risks } from './register.mjs';
import { fzOf, optionOf, intakeFromParcels, validateProject, hashOf, SCOPE, STEPS } from './model.mjs';

// the counties the platform's cost basis and data cover (README: Waller and the six around it)
export const HOME_COUNTIES = ['Waller', 'Harris', 'Fort Bend', 'Montgomery', 'Austin', 'Washington', 'Grimes'];
const countyName = c => String(c || '').replace(/\s+county$/i, '').trim();

// ---------- site ----------
// a site option drawn from the project's parcels (the union the site plan editor makes), with no layout yet
export function siteFromParcels(parcels, { name = 'Option A', id = 'opt-' + hashOf((parcels || []).map(p => p.key)) } = {}) {
  const geoms = (parcels || []).map(p => p.geometry).filter(Boolean); if (!geoms.length) return null;
  const b = S.unionParcels(geoms); if (!b?.ring?.length) return null;
  return { id, name, ...b, front: null, setbacks: { ...S.SETBACKS }, elements: [], program: { use: 'multifamily' }, created: null };
}
// lay a site out headlessly with the platform's layout engine: the first of its options for the program. A subdivision's
// street-network search tries a fixed number of networks (netEvals) rather than running against the clock, so the same
// parcels give the same layout on any machine (the sample run and the tests repeat exactly)
export function autoLayout(site, program, opts = {}) {
  const o = L.layoutOptions(site, program, { count: 1, netEvals: 6, ...opts })[0]; if (!o) return null;
  return { ...site, elements: o.elements, zones: o.zones, program: o.program, recipe: o.recipe, laidAs: o.name };
}
export function siteSummary(project, plan) {
  if (!plan || (plan.ring || []).length < 3) return null;
  const m = S.metrics(plan), sb = { ...S.SETBACKS, ...(plan.setbacks || {}) }, setbackFt = Math.min(sb.front, sb.side, sb.rear);
  const env = buildEnvelope((project.parcels || []).map(p => p.geometry).filter(Boolean), setbackFt);
  const F = project.site?.facts || {}, jur = {};
  if (F.county) jur.County = F.county; if (F.place?.name) jur.City = F.place.full || F.place.name; else if (F.place === null) jur.City = 'Unincorporated';
  if (F.flood) jur['Flood zone'] = F.flood.zone ? F.flood.zone + (F.flood.subtype ? ' (' + F.flood.subtype + ')' : '') : 'No mapped flood zone here (checked)';
  if (F.water?.length) jur['Water / utility districts'] = F.water.map(w => w.name).join(', ');
  if (F.schools?.length) jur['School district'] = F.schools[0];
  return { acres: m.acres, siteSf: m.siteSf, gfa: m.gfa, units: m.units || 0, mix: m.mix || [], spaces: m.spaces, required: m.required, coverage: m.coverage, far: m.far,
    footprint: m.footprint, paved: m.paved, detentionAcFt: S.stormOf(plan).volume || 0, use: S.normalizeProgram(plan.program).use,
    envelope: env ? { setbackFt, envelopeSf: env.envelopeSf, ratio: env.ratio, maxInsetFt: env.maxInsetFt } : null,
    issues: S.check(plan).filter(i => i.level === 'bad').map(i => i.text), floodZone: F.flood ? F.flood.zone || 'none' : null, jurisdiction: jur }; // ('none': looked up, no mapped zone; null: not looked up)
}
// ---------- plan set ----------
export function planSetSummary(plan) {
  if (!plan || (plan.ring || []).length < 3) return null;
  const types = buildingTypes(plan), sheets = PS.sheetList(plan, { sections: PS.defaultSections(), types });
  return { scope: 'schematic', sections: PS.defaultSections(), sheets: sheets.map(s => ({ number: s.number, title: s.title, sub: s.sub || '', kind: s.kind })),
    designable: types.filter(t => t.supported).map(t => t.label), notDesigned: types.filter(t => !t.supported).map(t => t.label), issued: (plan.sets || []).map(x => ({ id: x.id, no: x.no, when: x.when, sheets: x.sheets })) };
}

// ---------- the study's inputs ----------
// ctx for one project (and scenario): the option, its metrics, the assumptions register with every change applied
export function prepare(project, { market = null, scenarioId = undefined, plan = null, today = null } = {}) {
  const fz = fzOf(project), option = plan || optionOf(project), parcels = project.parcels || [];
  const intake = intakeFromParcels(fz.intake, parcels), county = countyName(intake.county || project.site?.facts?.county);
  const inRegion = county ? HOME_COUNTIES.includes(county) : null;
  if (!option || !(option.elements || []).some(e => e.kind === 'building')) return { project, fz, intake, parcels, option, missing: option ? 'layout' : 'site' };
  let M = PF.metricsOf(option);
  const sid = scenarioId === undefined ? fz.activeScenario : scenarioId, scenario = sid ? fz.scenarios.find(s => s.id === sid) || null : null;
  if (scenario?.mix?.length && M.uses.multifamily) M = withMix(M, scenario.mix);
  const base = registerFor(M, { intake, parcels, market, inRegion: inRegion ?? undefined, zip: intake.zip });
  const register = applyOverrides(base, fz.overrides, scenario?.overrides);
  return { project, fz, intake, parcels, option, M, register, values: valuesOf(register), scenario, market, inRegion, today, knownKeys: knownKeys(base) };
}
// a different apartment unit mix on the same building: the units re-split by share (largest remainder), each at its sf
export function withMix(M, mix) {
  const n = (M.mix || []).reduce((s, t) => s + t.n, 0); if (!n) return M;
  const tot = mix.reduce((s, t) => s + (+t.pct || 0), 0) || 1, raw = mix.map(t => ({ name: t.name, sf: +t.sf, x: n * (+t.pct || 0) / tot }));
  const out = raw.map(t => ({ name: t.name, sf: t.sf, n: Math.floor(t.x) })); let left = n - out.reduce((s, t) => s + t.n, 0);
  raw.map((t, i) => [t.x - Math.floor(t.x), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { out[i].n++; left--; } });
  return { ...M, mix: out.filter(t => t.n > 0) };
}

// ---------- budget + pro forma for one set of values ----------
export function evaluate(ctx, values, { costFactor = 1, rentFactor = 1 } = {}) {
  const R0 = PF.proFormaOf(ctx.M, null, pfOverrides(values)); // (the parametric run: site parts, TI, LC and FF&E the budget prices from)
  const budget = buildBudget(ctx.M, budgetInputs(values), { market: ctx.market, R0, edits: ctx.fz.budgetEdits, meters: ctx.fz.intake?.meters || null, jurisdiction: ctx.intake?.jurisdiction || '' });
  // a cost case: construction, its contingency, the soft costs and the developer fee that follow it move together (land and
  // leasing commissions don't)
  const B = budget.budgetIn, bin = costFactor === 1 ? B : { ...B, ...Object.fromEntries(['hard', 'site', 'ffe', 'ti', 'cont', 'soft', 'fee'].map(k => [k, B[k] * costFactor])) };
  const pf = runProForma(ctx.M, values, bin, { rentFactor });
  return { budget, pf, headline: pf.headline };
}

// ---------- the whole study ----------
export function runStudy(project, opts = {}) {
  const ctx = prepare(project, opts), errors = validateProject(project, { knownKeys: ctx.knownKeys || null });
  const site = siteSummary(project, ctx.option), planset = planSetSummary(ctx.option);
  const base = { scope: SCOPE, steps: STEPS, project: { id: project.id, name: project.name, client: project.client || '', status: project.status || 'prospect' }, intake: ctx.intake, option: ctx.option ? { id: ctx.option.id, name: ctx.option.name } : null, site, planset, errors };
  if (ctx.missing) return { ...base, missing: ctx.missing, status: stepStatus(project, null, ctx) };
  const ev = evaluate(ctx, ctx.values), notes = rangeNotes(ctx.register);
  const evalFn = (v, f) => evaluate(ctx, v, f);
  const metric = ev.pf.R.forSale ? 'margin' : 'levIrr';
  const sensitivity = opts.sensitivity === false ? null : {
    metric,
    tornado: tornado(evalFn, ctx.values, { metric }),
    grids: [grid(evalFn, ctx.values, { metric, rows: COST_STEPS, cols: RENT_STEPS }), ...(ev.pf.R.forSale ? [] : [grid(evalFn, ctx.values, { metric, rows: CAP_STEPS, cols: RATE_STEPS })])]
  };
  const hold = holdAnalysis(ev.pf, ctx.values, { startMonth: opts.today ? String(opts.today).slice(0, 7) : null });
  /** @type {any} */
  const study = { ...base, scenario: ctx.scenario ? { id: ctx.scenario.id, name: ctx.scenario.name } : null, metrics: ctx.M, register: ctx.register, values: ctx.values, notes,
    budget: ev.budget, budgetRows: budgetRows(ev.budget), budgetChecks: budgetChecks(ev.budget, ev.pf.R.P.gsf), pf: ev.pf, hold, sensitivity, inRegion: ctx.inRegion };
  study.risks = risks(study); study.facts = facts(study);
  study.inputsHash = inputsHash(project, ctx);
  study.status = stepStatus(project, study, ctx);
  return study;
}
// every scenario's headline beside the base case's (scenario: null = base)
export function compareScenarios(project, opts = {}) {
  const fz = fzOf(project), out = [];
  for (const s of [null, ...fz.scenarios]) {
    const ctx = prepare(project, { ...opts, scenarioId: s ? s.id : null }); if (ctx.missing) return [];
    const ev = evaluate(ctx, ctx.values);
    out.push({ id: s ? s.id : 'base', name: s ? s.name : 'Base case', changes: s ? Object.keys(s.overrides || {}).length + (s.mix?.length ? 1 : 0) : 0, headline: ev.headline, budget: ev.budget.totals, units: ctx.M.mix?.reduce((a, t) => a + t.n, 0) || ev.pf.R.P.units });
  }
  return out;
}
// what the report set is made from, as a hash: the same inputs always give the same hash
export function inputsHash(project, ctx) {
  const fz = fzOf(project);
  return hashOf({ fz: { intake: fz.intake, overrides: fz.overrides, budgetEdits: fz.budgetEdits, scenarios: fz.scenarios, scenario: ctx.scenario?.id ?? null, optionId: fz.optionId },
    option: ctx.option ? [ctx.option.id, layoutSig(ctx.option), (ctx.option.ring || []).length] : null, parcels: (project.parcels || []).map(p => [p.key, p.acres]), market: ctx.market?.built || null });
}

// where each step stands for the workspace: done | ready | blocked, with what it needs
export function stepStatus(project, study, ctx = null) {
  const parcels = project.parcels || [], option = ctx?.option ?? optionOf(project), laid = !!option && (option.elements || []).some(e => e.kind === 'building');
  const fz = fzOf(project);
  return {
    intake: parcels.length ? { state: 'done' } : { state: 'ready', need: 'Add the site’s parcels.' },
    site: !parcels.length && !option ? { state: 'blocked', need: 'Add parcels at intake first.' } : laid ? { state: 'done' } : { state: 'ready', need: option ? 'Lay out the site option.' : 'Draw or generate a site option.' },
    plans: !laid ? { state: 'blocked', need: 'Needs a laid-out site option.' } : (option.sets || []).length ? { state: 'done' } : { state: 'ready', need: 'Review the sheet list; issue a set from Plans.' },
    budget: !laid ? { state: 'blocked', need: 'Needs a laid-out site option.' } : { state: study ? 'done' : 'ready' },
    proforma: !laid ? { state: 'blocked', need: 'Needs the budget.' } : { state: study ? 'done' : 'ready' },
    reports: !laid ? { state: 'blocked', need: 'Needs the pro forma.' } : fz.reports.length ? { state: 'done' } : { state: 'ready', need: 'Make the report set.' }
  };
}
