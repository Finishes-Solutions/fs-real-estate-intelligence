// The MCP tools for the app's projects (api/mcp.js): what a person does on the Projects page and in the feasibility
// workspace (src/siteplan.js, src/workspace.js), for an agent. A project is the same document the website syncs
// (Supabase site_projects through api/projects.js, read and written here with the server's secret key), so a project an
// agent makes or changes shows up on the website, and the other way round. The feasibility study is the website's own
// pipeline (lib/feasibility/), run here on the platform's data files; the report set is the workspace's
// (api/feasibility.js), saved to the same report-sets bucket.
// Reading is always on. Changing projects (the tools marked write) needs the endpoint locked with MCP_ACCESS_TOKEN, and
// MCP_WRITES not 'off': an open endpoint stays read-only. Nothing here deletes a project; it is retired by its status.
// A save is checked against the copy that was read (its updated_at): when someone saved in between, the change is made
// again on the new copy once, then the agent is told. The website keeps its own last-edit-wins rule, so a person
// editing the same project at the same moment can still overwrite an agent's change when their browser syncs.
import * as SP from '../siteplan.mjs';
import * as G from '../guardrails.mjs';
import * as PJ from '../project.mjs';
import * as RF from '../sitefiles.mjs';
import { conn } from '../../api/field.js';
import { cleanProject } from '../../api/projects.js';
import { storage, signedUrl, noBucket } from '../../api/_lib/storage.mjs';
import { market as marketFromData } from '../../api/_lib/data.mjs';
import { reportFiles, narrativeFor } from '../../api/feasibility.js';
import { runStudy, compareScenarios } from '../feasibility/pipeline.mjs';
import { fzOf, newFeasibility, GROUP_LABELS, sourceText } from '../feasibility/model.mjs';
import { fmtVal } from '../feasibility/register.mjs';
import { pct, breakEvenText } from '../feasibility/format.mjs';
import { parcelsFor, planFor, factsFor, roadsNear, sitePlanTool } from './siteplan.mjs';
import { UserError } from './resolve.mjs';
import { doc, n0, n1, usd, usdM, clip } from './text.mjs';
import { PDF_LIMIT } from './reports.mjs';

// tests: an in-memory database and storage, the market, the site plan tool
export const hooks = { db: null, market: null, sitePlan: null };
// whether the write tools are on (api/mcp.js lists them only then)
export const writesOn = (env = process.env) => !!env.MCP_ACCESS_TOKEN && env.MCP_WRITES !== 'off';
export const appUrl = (env = process.env) => (env.APP_URL || 'https://fs-real-estate-intelligence.vercel.app').replace(/\/$/, '');
const linkOf = id => appUrl() + '/#v=projects&pj=' + encodeURIComponent(id);
const ID = /^[\w-]{3,60}$/;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7); // (the website's own form, src/siteplan.js)
const reportsBucket = () => process.env.REPORT_SETS_BUCKET || 'report-sets';
const who = a => a?.by ? clip(a.by, 60) + ' (agent)' : 'AI agent';
const when = s => { const t = Date.parse(s); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—'; };
const marketOf = async () => hooks.market ? hooks.market() : marketFromData();
const within = (p, ms) => Promise.race([p, new Promise(res => setTimeout(() => res(null), ms))]);
const STATUS_IDS = PJ.STATUSES.map(s => s.id);

// ---------- the team's copy (site_projects) ----------
function dbOf() {
  const d = hooks.db || conn();
  if (!d) throw new UserError('Projects aren’t available on this deployment: the team database (SUPABASE_SECRET_KEY) isn’t set.');
  return d;
}
class Conflict extends Error {}
export async function readProject(id) {
  if (!ID.test(String(id || ''))) throw new UserError('Give project_id: list_projects lists them.');
  const rows = await dbOf().json('/rest/v1/site_projects?select=id,doc,deleted,updated_at&id=eq.' + encodeURIComponent(id));
  const r = rows?.[0]; if (!r || r.deleted || !r.doc) throw new UserError('There’s no project ' + id + ' (it may have been deleted). list_projects lists them.');
  return { p: r.doc, at: r.updated_at };
}
// a new project (at null) or the next version of one, only if nobody saved it since it was read
async function writeProject(p, at, by) {
  const row = cleanProject({ ...p, updated: new Date().toISOString(), by }, by);
  if (!row) throw new UserError('The project would be over 500 KB, the most a team copy holds; nothing was saved.');
  const d = dbOf(), H = { 'Content-Type': 'application/json', Prefer: 'return=representation' };
  if (at == null) { await d.json('/rest/v1/site_projects', { method: 'POST', headers: H, body: JSON.stringify(row) }); return row.doc; }
  const got = await d.json('/rest/v1/site_projects?id=eq.' + encodeURIComponent(p.id) + '&updated_at=eq.' + encodeURIComponent(at), { method: 'PATCH', headers: H, body: JSON.stringify(row) });
  if (!got?.length) throw new Conflict();
  return row.doc;
}
// read, change (fn works on a copy and says what it did), save; made again once on a fresh copy after a conflict
async function change(id, by, fn) {
  for (let i = 0; ; i++) {
    const { p, at } = await readProject(id), q = structuredClone(p), said = await fn(q);
    try { return { p: await writeProject(q, at, by), said, before: p }; }
    catch (e) { if (!(e instanceof Conflict)) throw e; if (i) throw new UserError('Someone else kept changing ' + p.name + ' while this was being saved, so nothing was saved. Read it again and retry.'); }
  }
}

// ---------- reading ----------
const statusLabel = id => PJ.statusOf({ status: id }).label;
const optionMetrics = pl => { try { return (pl.elements || []).some(e => e.kind === 'building') ? G.metrics(pl) : null; } catch (e) { return null; } };
const optionLine = (pl, chosen) => {
  const m = optionMetrics(pl), drawn = (pl.ring || []).length >= 3, use = SP.USES[pl.program?.use]?.label || pl.program?.use || '';
  const head = (pl.name || 'Option') + ' (option_id ' + pl.id + ')' + (chosen ? ' — the feasibility study’s option' : '');
  if (!drawn) return head + ': no site drawn yet.';
  if (!m) return head + ': site drawn (' + n1(SP.ringArea(pl.ring) / 43560) + ' acres), nothing laid out yet.';
  let issues; try { issues = G.check(pl).map(i => i.text); } catch (e) { issues = []; }
  return head + ': ' + [use, (pl.elements || []).filter(e => e.kind === 'building').length + ' buildings', n0(m.gfa) + ' sf', m.units ? n0(m.units) + ' units' : null, 'parking ' + n0(m.spaces) + ' / ' + n0(m.required) + ' needed',
    Math.round(m.coverage * 100) + '% coverage', issues.length ? issues.length + ' check' + (issues.length === 1 ? '' : 's') + ' to look at (' + clip(issues[0], 100) + ')' : 'passes its checks'].filter(Boolean).join(' · ') + (pl.request ? '. Request: "' + clip(pl.request, 160) + '"' : '') + '.';
};
const parcelLine = x => [x.label || 'Parcel', x.propId ? 'APN ' + x.propId : null, x.owner || null, x.acres != null ? n1(x.acres) + ' acres' : null, x.landValue ? 'land ' + usd(x.landValue) : null, x.marketValue ? 'market ' + usd(x.marketValue) : null, x.county ? x.county + ' County' : null].filter(Boolean).join(' · ');
const changesText = o => Object.entries(o || {}).map(([k, v]) => k + ' = ' + (typeof v === 'object' ? JSON.stringify(v) : v)).join(', ');

export async function listProjects(a = {}) {
  const rows = await dbOf().json('/rest/v1/site_projects?select=id,name,updated_at,updated_by,status:doc->>status,client:doc->>client,notes:doc->>notes,site:doc->parcels->0->>label,county:doc->parcels->0->>county&deleted=eq.false&order=updated_at.desc&limit=500') || [];
  const q = String(a.query || '').trim().toLowerCase(), st = STATUS_IDS.includes(a.status) ? a.status : null, limit = Math.max(1, Math.min(100, Math.round(+a.limit) || 30));
  const hit = rows.filter(r => (!st || (r.status || 'prospect') === st) && (!q || [r.name, r.client, r.site, r.county, r.notes].some(s => String(s || '').toLowerCase().includes(q))));
  if (!hit.length) return doc('Projects', [rows.length ? 'No project matches' + (q ? ' "' + a.query + '"' : '') + (st ? ' with status ' + statusLabel(st) : '') + ' (' + rows.length + ' projects in all).' : 'The team has no projects yet. create_project starts one from an address, an APN or a drawn outline.']);
  return doc('Projects', [hit.length + ' project' + (hit.length === 1 ? '' : 's') + (q || st ? ' matching' : '') + ', newest change first' + (hit.length > limit ? ' (the first ' + limit + ')' : '') + ':', '',
    '| Project | project_id | Status | Site | Last change |', '|---|---|---|---|---|',
    ...hit.slice(0, limit).map(r => '| ' + [clip(r.name || '(no name)', 60) + (r.client ? ' · ' + clip(r.client, 30) : ''), r.id, statusLabel(r.status), clip([r.site, r.county ? r.county + ' County' : ''].filter(Boolean).join(', '), 70) || '—', when(r.updated_at) + (r.updated_by ? ' by ' + clip(r.updated_by, 30) : '')].join(' | ') + ' |'),
    '', 'get_project gives one project in full.']);
}

export async function getProject(a = {}) {
  const { p, at } = await readProject(a.project_id), fz = fzOf(p), chosen = (p.plans || []).find(pl => pl.id === fz.optionId) || null;
  const acres = (p.parcels || []).reduce((s, x) => s + (+x.acres || 0), 0), facts = p.site?.facts ? PJ.jurisdictionText({ ...p.site.facts, ...PJ.regridFacts(p.parcels, p.plans) }) : [];
  const files = (p.files || []).filter(f => f && f.name), confirmed = files.flatMap(f => (f.facts || []).filter(x => x && x.status === 'confirmed').map(x => (x.label || x.cat || 'Fact') + ': ' + clip(x.value ?? x.text ?? '', 160) + ' (' + f.name + ')'));
  const L = [
    'project_id: ' + p.id + ' · status: ' + statusLabel(p.status) + (p.client ? ' · client: ' + clip(p.client, 80) : ''),
    'Started ' + when(p.created) + (p.by ? '; last change ' + when(at) + ' by ' + clip(p.by, 60) : '; last change ' + when(at)) + '. On the website: ' + linkOf(p.id),
    ...(p.notes ? ['Notes: ' + clip(p.notes, 1500)] : []),
    '', '## Parcels (' + (p.parcels || []).length + (acres ? ', ' + n1(acres) + ' acres' : '') + ')',
    ...((p.parcels || []).length ? p.parcels.map((x, i) => (i + 1) + '. ' + parcelLine(x)) : ['None yet.']),
    ...(facts.length ? ['', '## Site facts (gathered ' + when(p.site.at) + ')', ...facts.map(l => '- ' + l)] : []),
    '', '## Site options (' + (p.plans || []).length + ')', ...((p.plans || []).length ? p.plans.map(pl => '- ' + optionLine(pl, pl === chosen || (!chosen && pl === (p.plans || []).find(q => optionMetrics(q))))) : ['None yet: site_plan with project_id lays one out.']),
    '', '## Feasibility', ...feasibilityLines(p, fz),
    ...(files.length ? ['', '## Reference files (' + files.length + ')', ...files.slice(0, 20).map(f => '- ' + f.name + (f.at ? ' (' + when(f.at) + ')' : '') + (f.facts?.length ? ': ' + f.facts.length + ' facts read, ' + f.facts.filter(x => x?.status === 'confirmed').length + ' confirmed' : '')),
      ...(confirmed.length ? ['Confirmed facts (the AI plans with these):', ...confirmed.slice(0, 20).map(x => '- ' + x)] : [])] : []),
    '', 'Next: feasibility_study for the numbers; site_plan with project_id for another layout; project_files for download links.'
  ];
  return doc('Project: ' + (p.name || p.id), L);
}
function feasibilityLines(p, fz) {
  const i = fz.intake;
  return [
    'Land: ' + (i.landPrice != null ? usd(i.landPrice) + ' (' + (i.landBasis === 'asking' ? 'asking / contract price' : i.landBasis) + ')' : 'from the appraisal district’s land value (no price entered)') + (i.targetUse ? ' · target use: ' + clip(i.targetUse, 60) : ''),
    'Assumption changes: ' + (Object.keys(fz.overrides).length ? changesText(fz.overrides) : 'none (every assumption at its sourced default)'),
    'Budget line edits: ' + (Object.keys(fz.budgetEdits).length ? Object.keys(fz.budgetEdits).length : 'none'),
    'Scenarios: ' + (fz.scenarios.length ? fz.scenarios.map(s => s.name + ' (scenario_id ' + s.id + (s.id === fz.activeScenario ? ', active' : '') + ': ' + (changesText(s.overrides) || 'no changes') + (s.mix?.length ? '; unit mix ' + s.mix.map(t => t.name + ' ' + t.pct + '%').join(', ') : '') + ')').join('; ') : 'none'),
    'Saved report sets: ' + (fz.reports.length ? fz.reports.slice(-5).reverse().map(r => r.id + ' (' + when(r.created) + (r.by ? ' by ' + clip(r.by, 40) : '') + (r.headline ? '; total cost ' + usdM(r.headline.totalCost) + ', levered IRR ' + pct(r.headline.levIrr) : '') + ')').join('; ') : 'none')
  ];
}

// ---------- the study ----------
export const STUDY_LIMIT = 38000; // (AMP cuts an answer at 40,000 characters)
export const SECTIONS = ['summary', 'assumptions', 'budget', 'csi', 'cashflow', 'hold', 'sensitivity', 'scenarios', 'risks', 'register'];
// the project as the study should see it: another option or scenario, and what-if changes, on a copy (never saved)
function studyCopy(p, a) {
  const P = structuredClone(p), fz = fzOf(P);
  if (a.option_id) { if (!(P.plans || []).some(pl => pl.id === a.option_id)) throw new UserError('No option ' + a.option_id + ' in ' + p.name + '. get_project lists its options.'); fz.optionId = a.option_id; }
  const sid = a.scenario_id === 'base' ? null : a.scenario_id || undefined;
  if (sid && !fz.scenarios.some(s => s.id === sid)) throw new UserError('No scenario ' + sid + ' in ' + p.name + (fz.scenarios.length ? ': it has ' + fz.scenarios.map(s => s.id).join(', ') : '') + '. Use "base" for the base case.');
  const w = a.what_if && typeof a.what_if === 'object' ? a.what_if : null, eff = sid === undefined ? fz.activeScenario : sid;
  if (w && Object.keys(w).length) { const s = eff && fz.scenarios.find(x => x.id === eff); if (s) s.overrides = { ...s.overrides, ...w }; else fz.overrides = { ...fz.overrides, ...w }; }
  P.fz = fz; return { P, sid };
}
const missingText = (p, m) => m === 'site' ? p.name + ' has no site option drawn yet. site_plan with project_id lays one out on its parcels.' : 'The study’s option in ' + p.name + ' has no buildings laid out yet. site_plan with project_id lays one out (effort low takes seconds).';
// what_if / set keys the study doesn't know: say which ones and what exists
function unknownKeys(study, keys) {
  const known = new Set(study.register.map(r => r.key)), bad = keys.filter(k => !known.has(k));
  if (bad.length) throw new UserError('Not an assumption of this study: ' + bad.join(', ') + '. The keys are: ' + [...known].join(', ') + '. (feasibility_study with sections ["assumptions"] lists them with their values.)');
}

export async function feasibilityStudy(a = {}) {
  const { p } = await readProject(a.project_id), market = await marketOf(), secs = (Array.isArray(a.sections) && a.sections.length ? a.sections : ['summary', 'assumptions', 'risks']).filter(s => SECTIONS.includes(s));
  if (a.what_if && typeof a.what_if === 'object' && Object.keys(a.what_if).length) { // checked and read as numbers against the study as saved
    const s0 = await studied(p, market); unknownKeys(s0, Object.keys(a.what_if)); a = { ...a, what_if: Object.fromEntries(Object.entries(a.what_if).map(([k, v]) => [k, valueFor(s0.register, k, v)])) };
  } else a = { ...a, what_if: null };
  const { P, sid } = studyCopy(p, a), study = runStudy(P, { market, scenarioId: sid, sensitivity: secs.includes('sensitivity') });
  if (study.missing) throw new UserError(missingText(p, study.missing));
  const L = [], add = (title, lines) => { if (lines.length) L.push('', '## ' + title, ...lines); };
  L.push('Project: ' + p.name + ' (project_id ' + p.id + ') · option ' + (study.option?.name || '—') + ' (' + study.option?.id + ') · ' + (study.scenario ? 'scenario ' + study.scenario.name + ' (' + study.scenario.id + ')' : 'base case') + ' · inputs hash ' + study.inputsHash);
  if (a.what_if && Object.keys(a.what_if).length) L.push('What-if (not saved): ' + changesText(a.what_if) + '. set_assumptions keeps a change.');
  for (const s of secs) add(SECTION_TITLES[s], SECTION_FN[s](study, P, market));
  if (study.notes?.length) add('Input notes', study.notes.map(n => '- ' + (n.text || n)));
  if (study.errors?.length) add('Inputs to check', study.errors.map(e => '- ' + e));
  return doc('Feasibility study: ' + p.name, L, [], [study.scope], STUDY_LIMIT);
}
const SECTION_TITLES = { summary: 'Summary', assumptions: 'Assumptions (key = value; source)', budget: 'Budget lines (line_id · item · qty × rate = amount; source)', csi: 'Contract by CSI division', cashflow: 'Cash flow by year', hold: 'Hold analysis', sensitivity: 'Sensitivity', scenarios: 'Scenarios side by side', risks: 'Risks', register: 'Fact & assumption register' };
const SECTION_FN = {
  summary: s => { const h = s.pf.headline, t = s.budget.totals, x = s.site;
    return ['Site: ' + n1(x.acres) + ' acres · ' + n0(x.gfa) + ' gross sf' + (x.units ? ' · ' + n0(x.units) + ' units' : '') + ' · ' + n0(x.spaces) + ' parking spaces',
      'Cost: land ' + usd(t.land) + ' · construction contract ' + usd(t.contract) + ' · soft ' + usd(t.softLines) + ' · developer fee ' + usd(t.devFee) + ' · interest ' + usd(h.interest) + ' · loan fees ' + usd(h.loanFees) + ' · **total development cost ' + usd(h.totalCost) + '**' + (t.perUnit ? ' (' + usd(t.perUnit) + ' a unit)' : '') + (t.perGsf ? ' · ' + usd(t.perGsf) + '/gsf' : ''),
      h.forSale ? 'Returns: sales profit ' + usd(h.profit) + ' · margin ' + pct(h.margin) + ' · levered IRR ' + pct(h.levIrr) + ' · peak equity ' + usd(h.equity)
        : 'Returns: stabilized NOI ' + usd(h.noi) + ' · yield on cost ' + pct(h.yoc) + ' vs market cap ' + s.values.marketCap + '% · value ' + usd(h.value) + ' · unlevered IRR ' + pct(h.unlevIrr) + ' · **levered IRR ' + pct(h.levIrr) + '** · equity multiple ' + (h.multiple != null ? h.multiple.toFixed(2) + '×' : '—') + ' · peak equity ' + usd(h.equity) + ' · levered profit ' + usd(h.profit) + ' · DSCR ' + (h.dscr != null ? h.dscr.toFixed(2) + '×' : '—'),
      'NPV at ' + s.values.discountRate + '%: unlevered ' + usd(h.npvUnlev) + ' · levered ' + usd(h.npvLev),
      'Break-even: ' + breakEvenText(s.pf.breakEven), 'Schedule: ' + h.months + ' months to the exit' + (h.stabilizeMonth ? ', stabilized in month ' + h.stabilizeMonth : '') + '.',
      'Workspace steps: ' + Object.entries(s.status || {}).map(([k, v]) => k + ' ' + v.state + (v.need ? ' (' + v.need.replace(/\.$/, '') + ')' : '')).join('; ')]; },
  assumptions: s => Object.keys(GROUP_LABELS).flatMap(g => { const r = s.register.filter(x => x.group === g); return r.length ? ['**' + GROUP_LABELS[g] + '**', ...r.map(x => '- ' + x.key + ' = ' + JSON.stringify(x.value) + ' (' + x.label + ': ' + fmtVal(x) + (x.range ? '; usual ' + x.range.join('–') : '') + (x.edited ? '; edited' : '') + '; ' + sourceText(x.source) + (x.marketCheck ? '; check: ' + clip(x.marketCheck, 120) : '') + ')')] : []; }),
  budget: s => [...s.budgetRows.map(r => '- ' + r.id + (r.id.includes(r.desc) ? '' : ' · ' + clip(r.desc, 60)) + ' · ' + n1(r.qty) + ' ' + r.unit + ' × ' + usd2(r.rate) + ' = ' + usd(r.amount) + (r.off ? ' (left out)' : r.edited ? ' (edited)' : '') + ' · ' + clip(r.source, 50)),
    'Totals: hard ' + usd(s.budget.totals.hard) + ' · GC fee ' + usd(s.budget.totals.gcFee) + ' · contingency ' + usd(s.budget.totals.contingency) + ' · contract ' + usd(s.budget.totals.contract) + ' · soft ' + usd(s.budget.totals.soft) + ' · developer fee ' + usd(s.budget.totals.devFee) + ' · land ' + usd(s.budget.totals.land) + ' · project before financing ' + usd(s.budget.totals.project),
    ...(s.budgetChecks || []).map(c => 'Check: ' + c.text)],
  csi: s => [...(s.budget.csi?.divisions || []).map(d => '- ' + (d.title || d.key) + ': ' + usd(d.total) + ' (' + Math.round(d.total / Math.max(1, s.budget.totals.contract) * 1000) / 10 + '%)'), ...(s.budget.csi?.markups || []).map(m => '- ' + m.desc + ': ' + usd(m.total)), 'Contract sum: ' + usd(s.budget.totals.contract)],
  cashflow: s => ['| Year | Cost | NOI / sales | Levered cash |', '|---|---|---|---|', ...s.pf.R.annual.map(r => '| ' + [r.year, usd(r.cost), usd(r.noi), usd(r.levered)].join(' | ') + ' |')],
  hold: s => { const r = s.hold?.result; if (!r) return [s.hold?.note || 'No hold analysis for this study (for-sale programs have none).'];
    const m = r.summary; return ['Bought at cost ' + usd(m.purchasePrice) + ' (cap ' + pct(m.acquisitionCapRate) + '), equity ' + usd(m.initialEquity) + ', year-1 NOI ' + usd(m.year1NOI) + '; best hold year ' + (m.optimalHoldingYear ?? '—') + ' (' + pct(m.optimalHoldingYield) + '); final-year equity IRR ' + pct(m.finalYearEquityIRR) + ', multiple ' + (m.finalYearEquityMultiple != null ? (+m.finalYearEquityMultiple).toFixed(2) + '×' : '—') + '.',
      '| Year | NOI | Debt service | Cash flow | DSCR | Equity IRR if sold |', '|---|---|---|---|---|---|', ...r.annual.map(y => '| ' + [y.year, usd(y.netOperatingIncome), usd(y.debtService), usd(y.cashFlowBeforeTaxes), y.dscr != null ? (+y.dscr).toFixed(2) : '—', pct(y.equityIRR)].join(' | ') + ' |')]; },
  sensitivity: s => { const t = s.sensitivity; if (!t) return []; const name = t.metric === 'margin' ? 'margin' : 'levered IRR';
    return ['What moves the ' + name + ' most (base ' + pct(t.tornado.base) + '):', ...t.tornado.rows.map(r => '- ' + r.label + ': ' + r.loText + ' → ' + pct(r.lo) + '; ' + r.hiText + ' → ' + pct(r.hi)),
      ...t.grids.flatMap(g => ['', name + ' by ' + g.rows[0].replace(/^[−+]?[\d.]+% /, '') + ' (rows) and ' + g.cols[0].replace(/^[−+]?[\d.]+% /, '') + ' (columns):', '| | ' + g.cols.join(' | ') + ' |', '|---|' + g.cols.map(() => '---').join('|') + '|', ...g.cells.map((row, i) => '| ' + g.rows[i] + ' | ' + row.map(v => pct(v)).join(' | ') + ' |')])]; },
  scenarios: (s, P, market) => { const c = compareScenarios(P, { market });
    return ['| Scenario | scenario_id | Total cost | NOI | Yield on cost | Levered IRR | Profit |', '|---|---|---|---|---|---|---|', ...c.map(x => '| ' + [x.name, x.id, usd(x.headline.totalCost), usd(x.headline.noi), pct(x.headline.yoc), pct(x.headline.levIrr), usd(x.headline.profit)].join(' | ') + ' |')]; },
  risks: s => s.risks.map(r => '- [' + r.level + '] ' + r.category + ': ' + r.title + '. ' + r.detail + (r.settle ? ' What settles it: ' + r.settle : '')),
  register: s => s.facts.map(f => '- ' + f.group + ' · ' + f.label + ': ' + f.value + ' (' + f.kindLabel + ': ' + clip(f.source, 90) + (f.asOf ? ', ' + f.asOf : '') + (f.confidence ? ', ' + f.confidence : '') + ')')
};

// ---------- the report set ----------
export const FILE_KINDS = { pdf: '.pdf', xlsx: '.xlsx', budget_csv: '-budget.csv', register_csv: '-register.csv', json: '.json' };
const kindOf = name => Object.entries(FILE_KINDS).filter(([, e]) => name.endsWith(e)).sort((x, y) => y[1].length - x[1].length)[0]?.[0];
const asResource = f => /^(text|application\/json)/.test(f.type) ? { type: 'resource', resource: { uri: 'report://feasibility/' + f.name, mimeType: f.type, text: f.buf.toString('utf8') } } : { type: 'resource', resource: { uri: 'report://feasibility/' + f.name, mimeType: f.type, blob: f.buf.toString('base64') } };
const usd2 = v => v == null || !Number.isFinite(+v) ? '—' : '$' + (+v).toLocaleString('en-US', { maximumFractionDigits: 2 });
const kb = n => n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

export async function feasibilityReport(a = {}, ctx = {}) {
  const want = (Array.isArray(a.files) && a.files.length ? a.files : ['pdf']).filter(k => FILE_KINDS[k]);
  if (a.save && !ctx.writes) throw new UserError('Saving report sets is off on this server (it needs MCP_ACCESS_TOKEN set). Leave out save to get the files in the answer.');
  const { p } = await readProject(a.project_id), { P, sid } = studyCopy(p, { scenario_id: a.scenario_id }), market = await marketOf();
  const study = runStudy(P, { market, scenarioId: sid, sensitivity: true });
  if (study.missing) throw new UserError(missingText(p, study.missing));
  const scenarios = compareScenarios(P, { market }), nar = a.narrative ? await narrativeFor(study) : { text: '', skipped: 'off' };
  const files = await reportFiles(P, study, { narrative: nar.text, scenarios }), h = study.pf.headline;
  const L = ['Feasibility report set for ' + p.name + ' (' + (study.scenario ? 'scenario ' + study.scenario.name : 'base case') + ', option ' + study.option?.name + ', inputs hash ' + study.inputsHash + '): total development cost ' + usd(h.totalCost) + ', ' + (h.forSale ? 'margin ' + pct(h.margin) : 'yield on cost ' + pct(h.yoc)) + ', levered IRR ' + pct(h.levIrr) + '.'];
  if (a.narrative) L.push(nar.text ? 'Includes the AI commentary paragraph (checked: it adds no figures of its own).' : 'No AI commentary: ' + (nar.skipped === 'off' ? 'it is off on this deployment (FEASIBILITY_NARRATIVE=on and ANTHROPIC_API_KEY turn it on)' : nar.skipped === 'guard' ? 'the paragraph added figures of its own, so it was left out' : 'the AI didn’t answer') + '.');
  if (a.save) {
    const d = dbOf(), id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), dir = 'projects/' + p.id + '/reports/' + id + '/', st = storage(d, reportsBucket());
    try { await Promise.all(files.map(f => st.put(dir + f.name, f.buf, f.type))); }
    catch (e) { if (noBucket(e)) throw new UserError('The report-sets storage bucket isn’t set up on this deployment yet (supabase/migrations/20261026000000_report_sets.sql). Leave out save to get the files in the answer.'); throw e; }
    const report = { id, kind: 'feasibility', created: new Date().toISOString(), by: who(a), scenario: study.scenario?.id || null, inputsHash: study.inputsHash, files: files.map(f => ({ name: f.name, type: f.type, bytes: f.buf.length, path: dir + f.name })),
      headline: { totalCost: h.totalCost, levIrr: h.levIrr, yoc: h.yoc }, narrative: nar.text ? 'on' : nar.skipped || 'off' };
    await change(p.id, who(a), q => { const fz = fzOf(q); fz.reports = fz.reports.concat([report]).slice(-50); q.fz = fz; });
    const links = await Promise.all(report.files.map(async f => { try { return '- ' + f.name + ' (' + kb(f.bytes) + '): ' + signedUrl(d, await st.signGet(f.path)); } catch (e) { return '- ' + f.name + ': stored (a link couldn’t be made: ' + clip(e.message, 80) + ')'; } }));
    L.push('', 'Saved for the team as report set ' + id + ' (listed on the project’s Reports step). Links, good for 10 minutes (project_files makes fresh ones):', ...links);
  }
  // the files asked for, in the answer, as long as they fit in one response
  const pick = files.filter(f => want.includes(kindOf(f.name))), content = [];
  let room = ctx.pdfLimit || PDF_LIMIT; const left = [];
  for (const f of pick) { if (f.buf.length <= room) { content.push(asResource(f)); room -= f.buf.length; } else left.push(f.name); }
  L.push('', content.length ? 'Attached: ' + pick.filter(f => !left.includes(f.name)).map(f => f.name + ' (' + kb(f.buf.length) + ')').join(', ') + '.' : 'No files attached.');
  if (left.length) L.push('Too big to attach in one answer: ' + left.join(', ') + (a.save ? ' (use the links above).' : '. Ask for fewer files, or save: true for download links.'));
  return { content: [{ type: 'text', text: doc('Feasibility report: ' + p.name, L, [], [study.scope]) }, ...content] };
}

// ---------- files and links ----------
export async function projectFiles(a = {}) {
  const { p } = await readProject(a.project_id), d = dbOf(), fz = fzOf(p), L = [], sign = async (bucket, path) => { try { return signedUrl(d, await storage(d, bucket).signGet(path)); } catch (e) { return noBucket(e) ? '(storage not set up)' : '(no link: ' + clip(e.message, 60) + ')'; } };
  const sets = fz.reports.slice(-Math.max(1, Math.min(10, +a.report_sets || 3))).reverse();
  L.push('## Saved report sets (' + fz.reports.length + ')');
  if (!sets.length) L.push('None: feasibility_report with save: true makes one.');
  for (const r of sets) { L.push('**' + r.id + '** · ' + when(r.created) + (r.by ? ' by ' + clip(r.by, 40) : '') + (r.headline ? ' · total cost ' + usdM(r.headline.totalCost) + ', levered IRR ' + pct(r.headline.levIrr) : '') + ' · inputs hash ' + r.inputsHash);
    for (const f of r.files || []) L.push('- ' + f.name + ' (' + kb(f.bytes || 0) + '): ' + (f.path ? await sign(reportsBucket(), f.path) : '(not stored)')); }
  const files = (p.files || []).filter(f => f?.path && RF.parsePath(f.path, p.id));
  L.push('', '## Reference files (' + files.length + ')');
  if (!files.length) L.push('None (people add surveys, floor plans and earlier site plans on the project’s Files tab).');
  for (const f of files.slice(0, 30)) L.push('- ' + f.name + (f.at ? ' (' + when(f.at) + (f.by ? ' by ' + clip(f.by, 40) : '') + ')' : '') + ': ' + await sign(RF.BUCKET, f.path));
  let media; try { media = (await Promise.all(['render', 'set'].map(k => storage(d, RF.MEDIA_BUCKET).list(p.id + '/' + k + '/').then(rows => (rows || []).filter(x => x?.name && x.id !== null).map(x => ({ kind: k, path: p.id + '/' + k + '/' + x.name, at: x.created_at })), () => [])))).flat(); } catch (e) { media = []; }
  L.push('', '## Renderings and plan sets (' + media.length + ')');
  if (!media.length) L.push('None stored for the team (they are made on the website: the project’s Renderings and Plans tabs).');
  for (const m of media.slice(0, 30)) L.push('- ' + (m.kind === 'set' ? 'Plan set PDF' : 'Rendering') + ' ' + m.path.split('/').pop() + (m.at ? ' (' + when(m.at) + ')' : '') + ': ' + await sign(RF.MEDIA_BUCKET, m.path));
  L.push('', 'Links are good for 10 minutes.');
  return doc('Files: ' + p.name, L);
}

// ---------- changing projects ----------
// a parcel as the website keeps it (src/siteplan.js parcelOf): keyed by its account (pid:…) or its spot (pt:…)
function parcelRec(r) {
  const g = r.geometry, ring = g && (g.type === 'Polygon' ? g.coordinates[0] : g.coordinates?.[0]?.[0]), c = r.center || (ring ? SP.centroid(ring) : null);
  const rec = { key: '', label: r.label || r.situs || 'Parcel', owner: r.owner || '', propId: r.propId || null, marketValue: r.marketValue || null, landValue: r.landValue || null, acres: r.acres ?? null, center: c ? c.map(v => +(+v).toFixed(6)) : null, geometry: g || null,
    ...Object.fromEntries([['address', r.address || r.situs], ['city', r.city], ['zip', r.zip], ['county', r.county]].filter(([, v]) => v).map(([k, v]) => [k, String(v).slice(0, 120)])) };
  rec.key = rec.propId ? 'pid:' + rec.propId : 'pt:' + (rec.center || [0, 0]).map(v => v.toFixed(5)).join(',');
  return rec;
}
const noTerrain = ({ terrain, ...pl }) => pl; // (the ground grid is big and the website gathers its own)

export async function createProject(a = {}) {
  const S = await parcelsFor(a), county = S.loc?.county?.name || (a.county ? String(a.county).replace(/\s+county$/i, '') : '') || '';
  let roads; try { roads = await within(roadsNear(boxOf(S.recs.map(r => r.geometry))), 15000) || []; } catch (e) { roads = []; }
  const { plan, guessed, acres } = await planFor(S.recs, roads), notes = [];
  const recs = S.recs.map(r => parcelRec({ ...r, county: r.county || county || null })), keys = recs.map(r => r.key);
  let site = null, jur = null;
  if (a.gather_facts !== false) { try { const FX = await factsFor(plan, S.recs, county, Date.now()); jur = FX.jur || null; if (FX.site) site = { v: 2, at: new Date().toISOString(), key: FX.center.map(v => +v.toFixed(5)).join(','), facts: FX.site }; if (FX.gone.length) notes.push('Not gathered: ' + FX.gone.join(', ') + ' (the website fills these in when the project is opened).'); } catch (e) { notes.push('Site facts weren’t gathered (' + clip(e.message, 80) + '); the website gathers them when the project is opened.'); } }
  const now = new Date().toISOString(), by = who(a), land = Number.isFinite(+a.land_price) && a.land_price !== null && a.land_price !== '' ? Math.max(0, +a.land_price) : null;
  const option = { ...noTerrain(plan), id: uid(), name: SP.nextOptionName([]), src: a.geojson ? 'drawn' : recs.length > 1 ? 'parcels' : 'parcel', parcel: keys[0], parcels: keys, frontGuess: guessed, ...(jur ? { jur } : {}), created: now, by };
  const fz = newFeasibility(); fz.optionId = option.id; fz.intake = { ...fz.intake, ...(land != null ? { landPrice: land, landBasis: 'asking' } : {}), ...(a.target_use ? { targetUse: clip(a.target_use, 80) } : {}) };
  const p = { id: uid(), name: clip(a.name || S.label || 'Site', 200), notes: clip(a.notes || '', 4000), ...(a.client ? { client: clip(a.client, 120) } : {}), status: STATUS_IDS.includes(a.status) ? a.status : 'prospect',
    parcels: recs, plans: [option], created: now, by, ...(site ? { site } : {}), fz };
  const saved = await writeProject(p, null, by);
  return doc('Project created: ' + saved.name, ['project_id: ' + saved.id + ' · status ' + statusLabel(saved.status) + ' · on the website: ' + linkOf(saved.id),
    'Site: ' + n1(acres) + ' acres from ' + S.source + (recs.length > 1 ? ' (' + recs.length + ' parcels)' : '') + '; ' + option.name + ' (option_id ' + option.id + ') has the site outline' + (guessed ? ' (front street guessed: its longest side)' : '') + ', nothing laid out yet.',
    ...recs.map((r, i) => (i + 1) + '. ' + parcelLine(r)),
    ...(site ? ['', 'Site facts:', ...PJ.jurisdictionText(site.facts).map(l => '- ' + l)] : []),
    '', 'Next: site_plan with project_id ' + saved.id + ' and a request (e.g. "200 apartments, 3 stories") lays out a plan and saves it here; then feasibility_study.'], [], notes);
}
const boxOf = geoms => { let w = 180, s = 90, e = -180, n = -90; for (const g of geoms) for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) for (const [x, y] of poly[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); } return [w, s, e, n]; };

export async function updateProject(a = {}) {
  const by = who(a), r = await change(a.project_id, by, q => {
    const did = [], fz = fzOf(q);
    if (a.name != null && String(a.name).trim()) { q.name = clip(a.name, 200); did.push('renamed ' + q.name); }
    if (a.status != null) { if (!STATUS_IDS.includes(a.status)) throw new UserError('status is one of ' + STATUS_IDS.join(', ') + '.'); q.status = a.status; did.push('status ' + statusLabel(a.status)); }
    if (a.client != null) { q.client = clip(a.client, 120); did.push('client ' + (q.client || 'cleared')); }
    if (a.notes != null) { q.notes = clip(a.notes, 4000); did.push('notes replaced'); }
    if (a.add_note) { q.notes = clip(((q.notes ? q.notes + '\n' : '') + new Date().toISOString().slice(0, 10) + ' (' + by + '): ' + String(a.add_note)).slice(-4000), 4000); did.push('note added'); }
    if (a.land_price !== undefined) { if (a.land_price === null) { fz.intake.landPrice = null; fz.intake.landBasis = 'appraised-land'; did.push('land price cleared (the appraised land value is used)'); } else { const v = +a.land_price; if (!Number.isFinite(v) || v < 0) throw new UserError('land_price is dollars, e.g. 2600000, or null to clear it.'); fz.intake.landPrice = v; fz.intake.landBasis = 'asking'; did.push('land price ' + usd(v)); } }
    if (a.target_use != null) { fz.intake.targetUse = clip(a.target_use, 80); did.push('target use ' + (fz.intake.targetUse || 'cleared')); }
    if (a.option_id) { if (!(q.plans || []).some(pl => pl.id === a.option_id)) throw new UserError('No option ' + a.option_id + ' in ' + q.name + '. get_project lists them.'); fz.optionId = a.option_id; did.push('the study now uses option ' + q.plans.find(pl => pl.id === a.option_id).name); }
    if (a.active_scenario !== undefined) { const s = a.active_scenario === 'base' || a.active_scenario === null ? null : a.active_scenario; if (s && !fz.scenarios.some(x => x.id === s)) throw new UserError('No scenario ' + s + ' in ' + q.name + '.'); fz.activeScenario = s; did.push('active scenario ' + (s ? fz.scenarios.find(x => x.id === s).name : 'base case')); }
    if (!did.length) throw new UserError('Nothing to change: give name, status, client, notes, add_note, land_price, target_use, option_id or active_scenario.');
    q.fz = fz; return did;
  });
  return doc('Project updated: ' + r.p.name, ['Changed: ' + r.said.join('; ') + '.', 'project_id ' + r.p.id + ' · ' + linkOf(r.p.id)]);
}

// the study's headline before and after a change, for the answer
const headlineLine = s => { const h = s.pf.headline; return 'total cost ' + usd(h.totalCost) + (h.forSale ? ', margin ' + pct(h.margin) : ', NOI ' + usd(h.noi) + ', yield on cost ' + pct(h.yoc)) + ', levered IRR ' + pct(h.levIrr) + ', levered profit ' + usd(h.profit); };
async function studied(p, market) { const s = runStudy(p, { market, sensitivity: false }); if (s.missing) throw new UserError(missingText(p, s.missing)); return s; }
// a value for an assumption: a number where the register holds one ("6.5" is 6.5), else as given
function valueFor(reg, k, v) {
  const r = reg.find(x => x.key === k);
  if (typeof r.value === 'number') { const n = typeof v === 'string' ? +v.replace(/[$,%\s]/g, '') : +v; if (!Number.isFinite(n)) throw new UserError(k + ' takes a number (' + r.label + ', ' + fmtVal(r) + ' now).'); return n; }
  return v;
}

export async function setAssumptions(a = {}) {
  const market = await marketOf(), { p } = await readProject(a.project_id), s0 = await studied(p, market), set = a.set && typeof a.set === 'object' ? a.set : {}, reset = Array.isArray(a.reset) ? a.reset.map(String) : [];
  if (!Object.keys(set).length && !reset.length && !a.reset_all) throw new UserError('Give set ({ key: value }), reset ([keys]) or reset_all. feasibility_study with sections ["assumptions"] lists the keys.');
  unknownKeys(s0, [...Object.keys(set), ...reset]);
  const r = await change(p.id, who(a), q => {
    const fz = fzOf(q), s = a.scenario_id && a.scenario_id !== 'base' ? fz.scenarios.find(x => x.id === a.scenario_id) : null;
    if (a.scenario_id && a.scenario_id !== 'base' && !s) throw new UserError('No scenario ' + a.scenario_id + ' in ' + q.name + '.');
    const o = s ? s.overrides : fz.overrides, did = [];
    if (a.reset_all) { for (const k of Object.keys(o)) delete o[k]; did.push('every change reset'); }
    for (const k of reset) if (k in o) { delete o[k]; did.push(k + ' reset to its default'); }
    for (const [k, v] of Object.entries(set)) { o[k] = valueFor(s0.register, k, v); did.push(k + ' = ' + o[k]); }
    q.fz = fz; return { did, where: s ? 'scenario ' + s.name : 'the base case' };
  });
  const s1 = await studied(r.p, market), notes = (s1.notes || []).map(n => n.text || n);
  return doc('Assumptions saved: ' + r.p.name, ['In ' + r.said.where + ': ' + r.said.did.join('; ') + '.', 'Before: ' + headlineLine(s0) + '.', 'After: ' + headlineLine(s1) + '.' + (a.scenario_id && a.scenario_id !== 'base' && fzOf(r.p).activeScenario !== a.scenario_id ? ' (The base case is shown; feasibility_study with scenario_id ' + a.scenario_id + ' gives the scenario.)' : '')], [], notes);
}

export async function editBudget(a = {}) {
  const market = await marketOf(), { p } = await readProject(a.project_id), s0 = await studied(p, market), edits = Array.isArray(a.edits) ? a.edits : [];
  if (!edits.length && !a.reset_all) throw new UserError('Give edits ([{ line_id, rate?, qty?, off?, reset? }]) or reset_all. feasibility_study with sections ["budget"] lists the line_ids.');
  const ids = new Set(s0.budgetRows.map(r => r.id)), bad = edits.filter(e => !ids.has(String(e?.line_id))).map(e => e?.line_id);
  if (bad.length) throw new UserError('Not a budget line of this study: ' + bad.join(', ') + '. feasibility_study with sections ["budget"] lists the line_ids.');
  const r = await change(p.id, who(a), q => {
    const fz = fzOf(q), did = [], num = (v, what) => { const n = +v; if (!Number.isFinite(n) || n < 0) throw new UserError(what + ' is a number of 0 or more.'); return n; };
    if (a.reset_all) { fz.budgetEdits = {}; did.push('every line edit reset'); }
    for (const e of edits) {
      const id = String(e.line_id), row = s0.budgetRows.find(x => x.id === id);
      if (e.reset) { delete fz.budgetEdits[id]; did.push(clip(row.desc, 40) + ' reset'); continue; }
      const x = { ...(fz.budgetEdits[id] || {}) };
      if (e.rate != null) x.rate = num(e.rate, 'rate'); if (e.qty != null) x.qty = num(e.qty, 'qty'); if (e.off != null) x.off = !!e.off;
      fz.budgetEdits[id] = x; did.push(clip(row.desc, 40) + ': ' + [x.qty != null ? 'qty ' + n1(x.qty) : '', x.rate != null ? 'rate ' + usd(x.rate) : '', x.off ? 'left out' : e.off === false ? 'back in' : ''].filter(Boolean).join(', '));
    }
    q.fz = fz; return did;
  });
  const s1 = await studied(r.p, market);
  return doc('Budget edited: ' + r.p.name, ['Changed: ' + r.said.join('; ') + '.', 'Construction contract ' + usd(s0.budget.totals.contract) + ' → ' + usd(s1.budget.totals.contract) + '; project before financing ' + usd(s0.budget.totals.project) + ' → ' + usd(s1.budget.totals.project) + '.', 'After: ' + headlineLine(s1) + '.']);
}

export async function saveScenario(a = {}) {
  const market = await marketOf(), { p } = await readProject(a.project_id), s0 = await studied(p, market), ov = a.overrides && typeof a.overrides === 'object' ? a.overrides : {};
  unknownKeys(s0, Object.keys(ov));
  const mix = Array.isArray(a.mix) ? a.mix.slice(0, 8).map(t => ({ name: clip(t?.name || 'Unit', 40), sf: +t?.sf, pct: +t?.pct })) : null;
  if (mix && !mix.every(t => Number.isFinite(t.sf) && t.sf > 0 && Number.isFinite(t.pct) && t.pct >= 0)) throw new UserError('mix is [{ name, sf, pct }] with sf over 0 and pct 0 or more (they are shares; they needn’t add to 100).');
  const r = await change(p.id, who(a), q => {
    const fz = fzOf(q); let s = a.scenario_id ? fz.scenarios.find(x => x.id === a.scenario_id) : null;
    if (a.scenario_id && !s) throw new UserError('No scenario ' + a.scenario_id + ' in ' + q.name + '; leave out scenario_id to add one.');
    if (a.remove) { if (!s) throw new UserError('remove needs scenario_id.'); fz.scenarios = fz.scenarios.filter(x => x !== s); if (fz.activeScenario === s.id) fz.activeScenario = null; q.fz = fz; return { s, removed: true }; }
    if (!s) { if (!a.name) throw new UserError('A new scenario needs a name.'); if (fz.scenarios.length >= 12) throw new UserError(q.name + ' already has 12 scenarios; remove one first.'); s = { id: 's' + uid(), name: '', overrides: {} }; fz.scenarios.push(s); }
    if (a.name) s.name = clip(a.name, 60);
    s.overrides = a.replace_overrides ? { ...ov } : { ...(s.overrides || {}), ...ov };
    for (const k of Object.keys(s.overrides)) s.overrides[k] = valueFor(s0.register, k, s.overrides[k]);
    if (mix) { if (mix.length) s.mix = mix; else delete s.mix; }
    if (a.make_active) fz.activeScenario = s.id;
    q.fz = fz; return { s };
  });
  if (r.said.removed) return doc('Scenario removed: ' + r.said.s.name, ['From ' + r.p.name + '.']);
  const c = compareScenarios(r.p, { market }), row = c.find(x => x.id === r.said.s.id), base = c.find(x => x.id === 'base');
  return doc('Scenario saved: ' + r.said.s.name, ['scenario_id ' + r.said.s.id + ' in ' + r.p.name + (fzOf(r.p).activeScenario === r.said.s.id ? ' (active: the workspace and reports use it)' : '') + '. Changes: ' + (changesText(r.said.s.overrides) || 'none') + (r.said.s.mix ? '; unit mix ' + r.said.s.mix.map(t => t.name + ' ' + t.sf + ' sf ' + t.pct + '%').join(', ') : '') + '.',
    ...(row && base ? ['Base case: ' + usd(base.headline.totalCost) + ' total cost, levered IRR ' + pct(base.headline.levIrr) + '.', 'This scenario: ' + usd(row.headline.totalCost) + ' total cost, yield on cost ' + pct(row.headline.yoc) + ', levered IRR ' + pct(row.headline.levIrr) + ', profit ' + usd(row.headline.profit) + '.'] : [])]);
}

// site_plan with project_id: laid out on the project's site, and the pick saved to it as a new option
function siteOfProject(p) {
  const recs = (p.parcels || []).filter(x => x.geometry && /Polygon/.test(x.geometry.type || '')).slice(0, 20).map(x => ({ label: x.label, owner: x.owner || '', propId: x.propId || null, acres: x.acres ?? null, geometry: x.geometry, center: x.center || null, situs: x.address || x.label || '', zip: x.zip || null, county: x.county || null }));
  if (recs.length) return { recs, label: p.name, loc: null, source: recs.length > 1 ? 'the project’s ' + recs.length + ' parcels, merged' : 'the project’s parcel outline' };
  const pl = (p.plans || []).find(x => (x.ring || []).length >= 3 && x.origin);
  if (!pl) throw new UserError(p.name + ' has no parcels or drawn site to lay out on. Give a location too (address, APN or geojson).');
  const F = SP.frame(pl.origin), geometry = { type: 'Polygon', coordinates: [pl.ring.concat([pl.ring[0]]).map(F.toLL)] };
  return { recs: [{ label: p.name, owner: '', propId: null, acres: +(SP.ringArea(pl.ring) / 43560).toFixed(3), geometry, center: null }], label: p.name, loc: null, source: 'the site drawn on option ' + pl.name };
}
export async function projectSitePlan(a = {}, ctx = {}) {
  if (!ctx.writes) throw new UserError('Saving to a project is off on this server (it needs MCP_ACCESS_TOKEN set). Leave out project_id for a plan that isn’t saved.');
  const { p } = await readProject(a.project_id), given = ['address', 'apn', 'apns', 'lat', 'geojson'].some(k => a[k] != null);
  const site = given ? null : siteOfProject(p), county = a.county || (p.parcels || []).find(x => x.county)?.county || '', by = who(a);
  const onPlan = async ({ plan, request, recs, county: c }) => {
    const r = await change(p.id, by, q => {
      // laid out somewhere given: those parcels join the project (as the website's Add to <project> does)
      const mine = given ? (recs || []).filter(x => x.geometry).map(x => parcelRec({ ...x, county: x.county || c || null })) : null;
      if (mine) { q.parcels = q.parcels || []; for (const x of mine) if (!q.parcels.some(y => y.key === x.key)) q.parcels.push(x); }
      const keys = mine ? mine.map(x => x.key) : (q.parcels || []).map(x => x.key);
      const opt = { ...noTerrain(plan), id: uid(), name: SP.nextOptionName(q.plans || []), parcel: keys[0] || null, parcels: keys, request: clip(request, 600), created: new Date().toISOString(), by };
      q.plans = (q.plans || []).concat([opt]); const fz = fzOf(q); if (a.make_study_option !== false) fz.optionId = opt.id; q.fz = fz; return opt;
    });
    return 'Saved to ' + r.p.name + ' as ' + r.said.name + ' (option_id ' + r.said.id + ')' + (a.make_study_option !== false ? ', now the feasibility study’s option' : '') + '. ' + linkOf(r.p.id);
  };
  return (hooks.sitePlan || sitePlanTool)({ ...a, county, project_name: a.project_name || p.name }, { ...ctx, site, onPlan });
}
