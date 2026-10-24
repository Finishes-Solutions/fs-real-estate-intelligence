// @ts-check
// The feasibility study on the server (the workspace's Reports step, src/workspace.js): the same pipeline the browser
// runs (lib/feasibility/pipeline.mjs), on the platform's own data files, rendered to the report set.
//   POST { op: 'study', project, scenarioId? }                 -> { study (summary), scenarios }
//   POST { op: 'file', kind, project, scenarioId?, narrative? } -> the file: kind 'pdf' (Feasibility report), 'xlsx'
//        (workbook), 'register' (CSV), 'budget' (CSV), 'json' (the full study)
//   POST { op: 'save', project, scenarioId?, narrative?, by? }  -> { report } : every file of the set stored in the
//        platform's private Storage bucket (REPORT_SETS_BUCKET, migration 20261026000000_report_sets.sql)
//   POST { op: 'link', path }                                  -> { url } a 10-minute signed link to a stored file
// The project travels in the request (the browser holds it, as api/projects.js does), so nothing here reads another
// app's data. Same team passcode as projects (FIELD_ACCESS_CODE, header x-field-code).
import fs from 'node:fs/promises';
import path from 'node:path';
import { rateLimit, sameOrigin, clip } from './_lib/guard.mjs';
import { load } from './_lib/data.mjs';
import { conn } from './field.js';
import * as kit from '../src/reportkit.js';
import { render } from '../lib/pdf.mjs';
import { planSVG } from '../lib/sitesheet.mjs';
import { runStudy, compareScenarios } from '../lib/feasibility/pipeline.mjs';
import { optionOf } from '../lib/feasibility/model.mjs';
import { marketContext } from '../lib/feasibility/market.mjs';
import { feasibilityReport } from '../lib/reports/feasibility.mjs';
import { workbookBuffer, registerCsv, budgetCsv } from '../lib/feasibility/xlsx.mjs';
import { checkNarrative, checkRenderedHtml } from '../lib/feasibility/guards.mjs';
import { claudeText, serverModel } from '../lib/anthropic.mjs';

const ID = /^[\w-]{3,60}$/, MAX_BODY = 600000;
const bucket = () => process.env.REPORT_SETS_BUCKET || 'report-sets';
const enc = p => p.split('/').map(encodeURIComponent).join('/');
const slug = s => String(s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project';

export async function marketFromData() {
  const [area, markets] = await Promise.all([load('area.json').catch(() => null), load('markets.json').catch(() => null)]);
  return marketContext({ area, markets });
}
let logoP = null;
const logo = () => logoP ||= fs.readFile(path.join(process.cwd(), 'src', 'logo-white.png')).then(b => 'data:image/png;base64,' + b.toString('base64')).catch(() => null);
const withLogo = async html => { const l = await logo(); return l ? html.split('src="logo-white.png"').join('src="' + l + '"') : html.replace(/<img src="logo-white\.png"[^>]*>/, ''); };

// the plain-English commentary, when turned on: Claude reads the study's figures and writes a paragraph; the guards
// drop it unless it adds no number of its own (lib/feasibility/guards.mjs)
export async function narrativeFor(study, env = process.env) {
  if (env.FEASIBILITY_NARRATIVE !== 'on' || !env.ANTHROPIC_API_KEY) return { text: '', skipped: 'off' };
  const h = study.pf.headline, facts = { project: study.project.name, acres: study.site.acres, units: study.site.units, gfa: study.site.gfa, totalCost: h.totalCost, noi: h.noi, yieldOnCost: h.yoc, levIrr: h.levIrr, unlevIrr: h.unlevIrr,
    marketCap: study.values.marketCap, profit: h.profit, npv: h.npvLev, topRisks: study.risks.slice(0, 5).map(r => r.title), biggestDriver: study.sensitivity?.tornado?.rows?.[0]?.label };
  try {
    const text = await claudeText({ key: env.ANTHROPIC_API_KEY, model: serverModel(env), maxTokens: 1200, feature: 'other', signal: AbortSignal.timeout(60000),
      system: 'You write the commentary paragraph of a real estate feasibility report for a development team. Use only the figures given; do not introduce any other number, estimate or market claim. Plain English, 3–5 sentences, no headings, no lists, no advice about what else you could do.',
      user: 'Study figures (JSON):\n' + JSON.stringify(facts) });
    const c = checkNarrative(text, study);
    return c.ok ? { text: c.text } : { text: '', skipped: 'guard', problems: c.problems };
  } catch (e) { return { text: '', skipped: 'error', error: e.message }; }
}

// every file of the set: [{ name, type, buf }]
export async function reportFiles(project, study, { narrative = '', scenarios = [] } = {}) {
  const base = 'fs-feasibility-' + slug(project.name) + (study.scenario ? '-' + slug(study.scenario.name) : '') + '-' + study.inputsHash;
  const opt = optionOf(project), planSvg = opt && (opt.ring || []).length >= 3 ? planSVG(opt, { px: 900 }).svg : '';
  const html = await withLogo(feasibilityReport(kit).reportHtml(study, { planSvg, narrative, scenarios }));
  const chk = checkRenderedHtml(html, { title: project.name }); if (!chk.ok) throw Object.assign(new Error('The report did not pass its checks: ' + chk.problems.join('; ')), { status: 500 });
  const pdf = Buffer.from(await render(html, { title: 'Feasibility report · ' + clip(project.name, 60) }));
  const json = Buffer.from(JSON.stringify({ ...study, pf: { headline: study.pf.headline, breakEven: study.pf.breakEven, annual: study.pf.R.annual, monthly: study.pf.R.monthly, sched: study.pf.R.sched } }, null, 1));
  return [
    { name: base + '.pdf', type: 'application/pdf', buf: pdf },
    { name: base + '.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buf: await workbookBuffer(study, { scenarios }) },
    { name: base + '-register.csv', type: 'text/csv', buf: Buffer.from(registerCsv(study)) },
    { name: base + '-budget.csv', type: 'text/csv', buf: Buffer.from(budgetCsv(study)) },
    { name: base + '.json', type: 'application/json', buf: json }
  ];
}

// the summary the workspace shows (the full study is large: monthly arrays and the hold engine's normalized input)
const summary = s => s.missing ? s : { ...s, pf: { headline: s.pf.headline, breakEven: s.pf.breakEven, annual: s.pf.R.annual, sched: s.pf.R.sched }, hold: s.hold?.result ? { summary: s.hold.result.summary, annual: s.hold.result.annual } : s.hold, metrics: undefined, budget: { totals: s.budget.totals, escalation: s.budget.escalation, csi: s.budget.csi } };

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 30, perDay: 1500 })) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST' });
  const code = process.env.FIELD_ACCESS_CODE;
  if (code && String(req.headers['x-field-code'] || '') !== code) return res.status(401).json({ error: 'Enter the team passcode.', passcode: true });
  let b; try { b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch (e) { return res.status(400).json({ error: 'The request isn’t valid JSON.' }); }
  try {
    if (b.op === 'link') {
      const db = conn(); if (!db) return res.status(503).json({ error: 'Report storage needs SUPABASE_SECRET_KEY on the site.', local: true });
      const p = String(b.path || ''); if (!/^projects\/[\w-]{3,60}\/reports\/[\w-]+\/[\w.-]+$/.test(p)) return res.status(400).json({ error: 'Not a report file.' });
      const r = await db.json('/storage/v1/object/sign/' + bucket() + '/' + enc(p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 600 }) });
      return res.json({ url: db.url + '/storage/v1' + r.signedURL });
    }
    const project = b.project;
    if (!project || typeof project !== 'object' || !ID.test(String(project.id || ''))) return res.status(400).json({ error: 'Send the project.' });
    if (JSON.stringify(project).length > MAX_BODY) return res.status(413).json({ error: 'The project is too large to send.' });
    const market = await marketFromData(), scenarioId = b.scenarioId === undefined ? undefined : b.scenarioId || null;
    const study = runStudy(project, { market, scenarioId });
    if (b.op === 'study') return res.json({ study: summary(study), scenarios: study.missing ? [] : compareScenarios(project, { market }) });
    if (study.missing) return res.status(409).json({ error: study.missing === 'site' ? 'Draw or generate a site option first.' : 'Lay out the site option first.', missing: study.missing });
    // (input notes, e.g. a change to an assumption the chosen option doesn't use, don't stop a report: they're listed on it)
    const full = b.op === 'save' || (b.op === 'file' && ['pdf', 'xlsx'].includes(b.kind)), scenarios = full ? compareScenarios(project, { market }) : [];
    const nar = b.narrative && (b.op === 'save' || b.kind === 'pdf') ? await narrativeFor(study) : { text: '', skipped: 'off' };
    if (b.op === 'file') {
      if (['register', 'budget'].includes(b.kind)) { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="fs-feasibility-' + slug(project.name) + '-' + b.kind + '.csv"'); return res.status(200).send(b.kind === 'register' ? registerCsv(study) : budgetCsv(study)); }
      if (b.kind === 'xlsx') { res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', 'attachment; filename="fs-feasibility-' + slug(project.name) + '.xlsx"'); return res.status(200).send(await workbookBuffer(study, { scenarios })); }
      if (b.kind === 'json') return res.json(summary(study));
      if (b.kind === 'pdf') { const f = (await reportFiles(project, study, { narrative: nar.text, scenarios }))[0]; res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', 'attachment; filename="' + f.name + '"'); return res.status(200).send(f.buf); }
      return res.status(400).json({ error: 'Unknown file kind.' });
    }
    if (b.op === 'save') {
      const db = conn(); if (!db) return res.status(503).json({ error: 'Saving report sets needs SUPABASE_SECRET_KEY on the site; download the files instead.', local: true });
      const files = await reportFiles(project, study, { narrative: nar.text, scenarios }), id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), dir = 'projects/' + project.id + '/reports/' + id + '/';
      for (const f of files) await db.call('/storage/v1/object/' + bucket() + '/' + enc(dir + f.name), { method: 'POST', body: f.buf, headers: { 'Content-Type': f.type, 'x-upsert': 'true' } });
      const report = { id, kind: 'feasibility', created: new Date().toISOString(), by: clip(b.by, 80), scenario: study.scenario?.id || null, inputsHash: study.inputsHash,
        files: files.map(f => ({ name: f.name, type: f.type, bytes: f.buf.length, path: dir + f.name })), headline: { totalCost: study.pf.headline.totalCost, levIrr: study.pf.headline.levIrr, yoc: study.pf.headline.yoc }, narrative: nar.text ? 'on' : nar.skipped || 'off' };
      return res.json({ report });
    }
    return res.status(400).json({ error: 'Unknown op.' });
  } catch (e) {
    console.error('feasibility', e.message);
    if (/bucket|not found/i.test(e.message) && b.op === 'save') return res.status(503).json({ error: 'The report-sets storage bucket isn’t set up yet; download the files instead.', local: true });
    return res.status(e.status || 500).json({ error: 'The study couldn’t be made: ' + clip(e.message, 300) });
  }
}
