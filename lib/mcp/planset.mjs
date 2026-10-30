// MCP plan_set and plan_set_status (api/mcp.js): a schematic design set of plans (PLANSET-PLAN.md) made on the server from
// a site plan the site_plan tool saved (its plan_id), in the same steps as Projects › Plans › Make Plan Set (src/siteplan.js
// runJob):
//   1. Claude writes the cover's notes and each discipline's notes and design criteria (api/planset.js plansetAsk);
//   2. Claude designs each building type's floor plans, checked here (lib/plandesign.mjs placeDesign) and sent back with
//      the problems at most twice; a type that still fails, or any step without Claude, gets the rule-based design;
//   3. every sheet is drawn (lib/planset.mjs) and printed bare by headless Chromium, three at a time;
//   4. the pages go on the title block border (templates/titleblock.pdf) as one PDF, kept in storage behind a signed link.
// A set takes minutes (most of an hour for a big one), longer than one call's 300 s, so it is a job kept in storage
// (lib/mcp/store.mjs, jobs/<id>/): plan_set starts it and works on it for most of that call; every plan_set_status call
// works on it again and says how far it is, until one answers with the set. A call that finds another one working on the
// job waits for it a while instead (a lease on the job). Nothing runs between calls.
import { readFile } from 'node:fs/promises';
import * as PS from '../planset.mjs';
import * as PD from '../plandesign.mjs';
import * as SP from '../siteplan.mjs';
import { render as chromium } from '../pdf.mjs';
import { monthSpend } from '../aiusage.mjs';
import { useClaude, effortFor } from '../anthropic.mjs';
import { plansetAsk, askError, capOf, budgetMessage } from '../../api/planset.js';
import { serverKit, PDF_LIMIT } from './reports.mjs';
import { store, getJSON, putJSON, newId, ID } from './store.mjs';
import { UserError } from './resolve.mjs';
import { doc, clip } from './text.mjs';
import { slug } from '../../src/reportkit.js';

// one call's share of the function's 300 s (vercel.json), and what a step needs left to be started in it
export const BUDGET_MS = 240000, CLAUDE_START_MS = 110000, SHEET_START_MS = 20000, MERGE_START_MS = 60000, LINK_SECONDS = 86400;
const CLAUDE_AT_ONCE = 4, SHEETS_AT_ONCE = 3, DESIGN_TRIES = 3, SHEET_TRIES = 3;
// the sections a set made here can have (every built one), and the default: the website's, less renderings, which come
// only when asked (the newest four site_renderings kept with the plan)
export const SECTION_IDS = PS.SECTIONS.filter(s => PS.built(s)).map(s => s.id);
export const DEFAULT_SECTIONS = PS.defaultSections().filter(id => id !== 'renderings');
// tests: stand-ins for Claude, the sheet printer, the border and the clock
export const hooks = { ai: null, render: null, border: null, now: null, budgetMs: null, waitStepMs: null };
const now = () => (hooks.now || Date.now)();
const budget = () => hooks.budgetMs || BUDGET_MS;
const wait = ms => new Promise(res => setTimeout(res, ms));
const jobPath = id => 'jobs/' + id + '/job.json', sheetPath = (id, n) => 'jobs/' + id + '/sheets/' + n.replace(/[^\w.-]/g, '_') + '.pdf';
const mb = n => (n / 1048576).toFixed(1) + ' MB';
const dur = ms => { const m = Math.round(ms / 60000); return m < 1 ? 'under a minute' : m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; };
const OFF = { 402: 'this month’s plan set budget is used up', 503: 'Claude isn’t set up on this deployment (ANTHROPIC_API_KEY)' };

// one AI step: Claude through the website's own code, inside the plan set budget (a 402 or 503 turns Claude off for the job)
async function askAI(body, signal) {
  if (hooks.ai) return hooks.ai(body, { signal });
  const key = process.env.ANTHROPIC_API_KEY; if (!key) throw Object.assign(new Error(OFF[503]), { status: 503 });
  const cap = capOf(), spend = await monthSpend('planset');
  if (cap === 0 || (spend.spent != null && spend.spent >= cap)) throw Object.assign(new Error(budgetMessage(cap)), { status: 402 });
  return plansetAsk(body, { key, model: await useClaude(key, ''), effort: effortFor(undefined), signal });
}
let borderP = null;
const border = () => hooks.border ? Promise.resolve(hooks.border) : borderP ||= readFile(new URL('../../templates/titleblock.pdf', import.meta.url)).catch(e => { borderP = null; throw e; });
const printSheet = (html, title) => (hooks.render || chromium)(html, { sheet: 'set', title });

function needStore() { const s = store(); if (!s) throw new UserError('Plan sets need storage on this deployment (SUPABASE_SECRET_KEY): it isn’t set up.'); return s; }

// ---------- plan_set: a new job from a saved plan, then the first stretch of work ----------
export async function planSetTool(args = {}, ctx = {}) {
  const t0 = now(), s = needStore(), planId = String(args.plan_id || '').trim();
  if (!ID.test(planId)) throw new UserError('Give the plan_id a site_plan answer gave (call site_plan first: it lays out the site and saves the plan).');
  const rec = await getJSON(s, 'plans/' + planId + '.json');
  if (!rec?.plan) throw new UserError('There is no saved site plan with plan_id ' + planId + '. Call site_plan to lay the site out again: its answer gives a new plan_id.');
  const plan = rec.plan, bad = (args.sections || []).filter(x => !SECTION_IDS.includes(x));
  if (bad.length) throw new UserError('Unknown section' + (bad.length > 1 ? 's' : '') + ': ' + bad.join(', ') + '. Sections: ' + SECTION_IDS.join(', ') + '.');
  const sections = PS.pickSections(Array.isArray(args.sections) && args.sections.length ? args.sections : DEFAULT_SECTIONS);
  const renders = sections.includes('renderings') ? (rec.renders || []).slice(-4).reverse() : []; // newest first, as the website's sets have them
  const types = PD.buildingTypes(plan), sheets = PS.sheetList(plan, { sections, renders: renders.length, renderLabels: renders.map(r => r.label), types });
  const day = new Date(now()), short = day.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit', timeZone: 'America/Chicago' });
  const steps = [{ key: 'notes', kind: 'claude', label: 'Cover notes' }];
  for (const sec of sections) if (PS.SECTION_DISC[sec] && sheets.some(q => q.section === sec)) steps.push({ key: 'disc:' + PS.SECTION_DISC[sec], kind: 'claude', label: PS.sectionById(sec).label + ' notes' });
  if (sections.includes('arch')) for (const t of types.filter(t => t.supported)) steps.push({ key: 'design:' + t.id, kind: 'claude', label: 'Design: ' + PD.typeName(t) });
  for (const sh of sheets) steps.push({ key: sh.number, kind: 'sheet', label: sh.number + ' ' + sh.title });
  steps.push({ key: 'merge', kind: 'merge', label: 'Put ' + sheets.length + ' sheets together' });
  for (const x of steps) x.status = 'todo';
  const F = SP.frame(plan.origin), site = { type: 'Polygon', coordinates: [plan.ring.concat([plan.ring[0]]).map(F.toLL)] };
  let vicinity = rec.vicinity || ''; try { vicinity = serverKit(16).areaMap([{ geometry: site, stroke: '#c0392b', fill: 'rgba(192,57,43,.25)', width: 2 }], { W: 400, H: 230, px: 400, minSpanM: 3500, maxTiles: 16 }); } catch (e) { /* the saved one */ }
  const job = { v: 1, id: newId(), planId, at: day.toISOString(), date: day.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }),
    projectName: clip(args.project_name || rec.projectName || rec.label || 'Site plan', 80), client: clip(args.client || rec.preparedFor || '', 80), projectNumber: clip(args.project_number || '', 30), by: clip(args.drawn_by || 'AI', 12),
    revisions: [{ no: '0', date: short, desc: 'Schematic design set' }], sections, types, sheets, steps, vicinity, text: null, disc: {}, designs: {}, designBy: {}, model: '', claudeOff: '',
    state: 'running', elapsedMs: 0, lease: null, layout: rec.layout, verdict: rec.verdict, fails: rec.fails || 0, renders: renders.map(r => ({ path: r.path, label: r.label })), noRenders: sections.includes('renderings') && !renders.length };
  await putJSON(s, jobPath(job.id), job);
  return advance(s, job, rec, t0, ctx);
}

// ---------- plan_set_status: work on the job again, or wait for the call that is; then say how far it is ----------
export async function planSetStatusTool(args = {}, ctx = {}) {
  const t0 = now(), s = needStore(), id = String(args.job_id || '').trim();
  if (!ID.test(id)) throw new UserError('Give the job_id plan_set answered with.');
  let job = await getJSON(s, jobPath(id));
  if (!job) throw new UserError('There is no plan set job ' + id + '.');
  const waitMs = Math.max(0, Math.min(200, Number.isFinite(+args.wait_seconds) ? +args.wait_seconds : 90)) * 1000, step = hooks.waitStepMs || 5000;
  while (job.state === 'running' && job.lease && job.lease.until > now() && now() - t0 < waitMs) { await wait(step); job = await getJSON(s, jobPath(id)) || job; }
  if (job.state !== 'running') return answer(s, job);
  if (job.lease && job.lease.until > now()) return answer(s, job, 'Another call is working on it right now.');
  const rec = await getJSON(s, 'plans/' + job.planId + '.json');
  if (!rec?.plan) { job.state = 'failed'; job.error = 'Its saved site plan is gone.'; await putJSON(s, jobPath(id), job); return answer(s, job); }
  return advance(s, job, rec, t0, ctx);
}

// take the lease, work until the call's time is nearly up, give it back, answer
async function advance(s, job, rec, t0, ctx) {
  const me = newId(), until = t0 + budget() + 30000;
  job.lease = { by: me, until }; await putJSON(s, jobPath(job.id), job);
  const start = now();
  try { await work(s, job, rec, t0); }
  catch (e) { if (!(e instanceof UserError)) console.error('plan_set', e.message); job.error = 'Stopped: ' + clip(e.message, 200) + '. plan_set_status carries on from here.'; for (const x of job.steps) if (x.status === 'doing') x.status = 'todo'; }
  job.elapsedMs = (job.elapsedMs || 0) + (now() - start); job.lease = null;
  await putJSON(s, jobPath(job.id), job);
  return answer(s, job);
}

// the steps, in order, as far as this call's time goes
async function work(s, job, rec, t0) {
  const left = () => budget() - (now() - t0), plan = rec.plan, done = x => ['done', 'skipped', 'failed'].includes(x.status);
  const save = () => putJSON(s, jobPath(job.id), job);
  const mark = async (x, status, note, keep = true) => { x.status = status; x.note = note || ''; if (keep) await save(); };
  job.error = '';
  // 1 and 2. Claude: the notes, then each building type's design, four steps at a time
  const claude = job.steps.filter(x => x.kind === 'claude' && !done(x));
  const base = { plan, project: { name: job.projectName }, client: job.client, address: rec.address, county: rec.county, parcels: rec.parcels, facts: rec.facts, notes: rec.checks, types: job.types, sheets: job.sheets };
  const brief = PS.notesBrief(base);
  const one = async x => {
    if (done(x)) return;
    if (job.claudeOff) { if (x.key.startsWith('design:')) designFallback(job, x.key.slice(7), job.claudeOff); return mark(x, 'skipped', (x.key.startsWith('design:') ? 'rule-based design: ' : '') + job.claudeOff); }
    if (left() < CLAUDE_START_MS) return; // the next call
    x.status = 'doing'; const ts = now(), ac = new AbortController(), tm = setTimeout(() => ac.abort(), Math.max(1000, left() - 15000));
    try {
      if (x.key === 'notes') { const d = await askAI({ mode: 'notes', brief }, ac.signal); job.text = d.notes; job.model = d.model || job.model; x.ms = now() - ts; return await mark(x, 'done', d.fellBack ? 'answered by a fallback model' : ''); }
      if (x.key.startsWith('disc:')) { const k = x.key.slice(5), d = await askAI({ mode: 'disc', discipline: k, brief: PS.discBrief(base, k, job.types) }, ac.signal); job.disc[k] = d.disc; job.model = d.model || job.model; x.ms = now() - ts; return await mark(x, 'done', ''); }
      const t = job.types.find(y => y.id === x.key.slice(7)), seed = PD.fallbackDesign(t), brief2 = PD.designBrief(t, { county: rec.county, address: rec.address });
      x.tries ||= 0;
      while (x.tries < DESIGN_TRIES && left() > CLAUDE_START_MS * (x.tries ? 0.8 : 1)) {
        x.note = x.tries ? 'fixing ' + x.problems.length + ' problem' + (x.problems.length === 1 ? '' : 's') + ', try ' + (x.tries + 1) : 'Claude is drawing it';
        const d = await askAI({ mode: 'design', type: t.id, brief: brief2, seed, previous: x.prev || null, problems: x.problems || [] }, ac.signal); x.tries++; job.model = d.model || job.model;
        const r = PD.placeDesign(d.design, t);
        if (!r.problems.length) { job.designs[t.id] = r.design; job.designBy[t.id] = 'Claude'; delete x.prev; x.ms = (x.ms || 0) + now() - ts; return await mark(x, 'done', x.tries > 1 ? 'fixed in ' + x.tries + ' tries' : ''); }
        x.prev = d.design; x.problems = r.problems.slice(0, 30);
      }
      x.ms = (x.ms || 0) + now() - ts;
      if (x.tries >= DESIGN_TRIES) { designFallback(job, t.id, 'Claude’s plan kept failing ' + x.problems.length + ' check' + (x.problems.length === 1 ? '' : 's')); delete x.prev; return await mark(x, 'skipped', 'rule-based design used: ' + x.problems[0]); }
      x.status = 'todo'; // out of time between tries: the next call carries on with the problems found
    } catch (e) {
      x.ms = (x.ms || 0) + now() - ts;
      if (ac.signal.aborted) { x.status = 'todo'; x.note = 'cut off at the end of a call: tried again in the next'; return; }
      if (OFF[e.status]) job.claudeOff = OFF[e.status];
      if (x.key.startsWith('design:')) designFallback(job, x.key.slice(7), job.claudeOff || 'no answer');
      await mark(x, 'skipped', (x.key.startsWith('design:') ? 'rule-based design: ' : 'standard notes: ') + (job.claudeOff || clip(askError(e), 100)));
    } finally { clearTimeout(tm); }
  };
  await pool(claude, CLAUDE_AT_ONCE, one);
  if (job.steps.some(x => x.kind === 'claude' && !done(x))) return; // Claude isn't finished: the sheets wait for its words and designs
  for (const t of job.types.filter(t => t.supported)) if (!job.designs[t.id]) designFallback(job, t.id, 'no design step');
  // 3. the sheets, printed bare, three at a time (a sheet that fails three times is left out and said so)
  const pending = job.steps.filter(x => x.kind === 'sheet' && !done(x));
  if (pending.length) {
    // the renderings, as pictures in the sheets' HTML (only when a rendering sheet is still to print)
    const renders = [];
    if (pending.some(x => job.sheets.find(y => y.number === x.key)?.kind === 'render')) for (const r of job.renders || []) { const b = await s.get(r.path); renders.push(b ? { src: 'data:image/jpeg;base64,' + b.toString('base64'), caption: r.label } : { src: '', caption: r.label }); }
    const c = PS.setContext({ ...base, text: job.text, disc: job.disc, designs: job.designs, designBy: job.designBy, renders, vicinity: job.vicinity, boundarySource: rec.boundarySource,
      date: job.date, drawnBy: job.by, projectNumber: job.projectNumber, revisions: job.revisions, terrain: plan.terrain || null, project: { name: job.projectName, client: job.client, projectNumber: job.projectNumber } }, job.sheets);
    let since = 0;
    await pool(pending, SHEETS_AT_ONCE, async x => {
      if (left() < SHEET_START_MS) return;
      const sh = job.sheets.find(y => y.number === x.key), ts = now(); x.status = 'doing';
      try {
        const pdf = await printSheet(PS.docHTML(c, PS.sheetPage(c, sh)), job.projectName + ' — ' + sh.number);
        await s.put(sheetPath(job.id, x.key), Buffer.from(pdf), 'application/pdf'); x.ms = now() - ts; x.status = 'done'; x.note = '';
      } catch (e) { x.fails = (x.fails || 0) + 1; x.status = x.fails >= SHEET_TRIES ? 'failed' : 'todo'; x.note = clip(e.message, 120); }
      if (++since % 6 === 0) await save(); // progress kept every few sheets
    });
    await save();
    if (job.steps.some(x => x.kind === 'sheet' && !done(x))) return;
  }
  // 4. one PDF on the border, in sheet order
  const m = job.steps.find(x => x.key === 'merge');
  if (m.status === 'done' || left() < MERGE_START_MS) return;
  m.status = 'doing'; const ts = now();
  const { PDFDocument } = await import('pdf-lib'), out = await PDFDocument.create(), [bd] = await out.embedPdf(await border(), [0]), made = [];
  for (const sh of job.sheets) {
    if (job.steps.find(x => x.key === sh.number)?.status !== 'done') continue;
    const b = await s.get(sheetPath(job.id, sh.number)); if (!b) continue;
    const src = await PDFDocument.load(b);
    for (const pg of await out.embedPdf(src, src.getPageIndices())) { const p = out.addPage([pg.width, pg.height]); p.drawPage(bd, { x: 0, y: 0, width: pg.width, height: pg.height }); p.drawPage(pg, { x: 0, y: 0, width: pg.width, height: pg.height }); }
    made.push(sh.number);
  }
  out.setTitle(job.projectName + ' — ' + (job.layout || 'Site plan') + ' — Schematic design set, issue 0'); out.setCreator('Finishes Solutions'); out.setProducer('Finishes Solutions plan sets');
  const bytes = Buffer.from(await out.save()), name = slug(job.projectName) + '-plan-set.pdf', path = 'jobs/' + job.id + '/' + name;
  await s.put(path, bytes, 'application/pdf');
  job.file = { path, name, size: bytes.length, sheets: made }; m.ms = now() - ts; m.status = 'done'; job.state = 'done';
}
const designFallback = (job, id, why) => { const t = job.types.find(y => y.id === id); if (!t || job.designs[id]) return; job.designs[id] = PD.placeDesign(PD.fallbackDesign(t), t).design; job.designBy[id] = 'rule-based (' + why + ')'; };
// run fn over items, n at a time
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); })); }

// ---------- the answer ----------
function progress(job) {
  const steps = job.steps, by = k => steps.filter(x => x.kind === k), fin = x => ['done', 'skipped', 'failed'].includes(x.status);
  const w = x => x.kind === 'claude' ? 10 : x.kind === 'merge' ? 4 : 1, total = steps.reduce((a, x) => a + w(x), 0), got = steps.filter(fin).reduce((a, x) => a + w(x), 0);
  const cLeft = by('claude').filter(x => !fin(x)).length, sLeft = by('sheet').filter(x => !fin(x)).length;
  return { pct: total ? Math.round(got / total * 100) : 0, claude: by('claude'), sheets: by('sheet'), eta: Math.ceil(cLeft / CLAUDE_AT_ONCE) * 90000 + sLeft * 6000 / SHEETS_AT_ONCE + 30000, fin };
}
async function answer(s, job, extra = '') {
  const P = progress(job), title = 'Plan set: ' + job.projectName + ' — schematic design set';
  const head = ['Job: ' + job.id + ' · from plan_id ' + job.planId + (job.layout ? ' (' + job.layout + ')' : '') + ' · issue 0, ' + job.date + '.',
    ...(job.fails ? ['Note: this site plan’s quality check was ' + String(job.verdict || 'not ready').toUpperCase() + '; the set draws it as it is.'] : []),
    ...(job.noRenders ? ['Renderings: none kept for this plan yet, so the set has no rendering sheets (site_renderings makes them; then start a new set).'] : [])];
  if (job.state === 'failed') return { content: [{ type: 'text', text: doc(title, [...head, 'Failed: ' + (job.error || 'unknown') + '.']) }], isError: true };
  if (job.state !== 'done') {
    const doing = job.steps.filter(x => x.status === 'doing' || (x.status === 'todo' && x.note)).slice(0, 4).map(x => x.label + (x.note ? ' (' + x.note + ')' : ''));
    const lines = [...head, P.pct + '% done · Claude (notes and building designs): ' + P.claude.filter(P.fin).length + ' of ' + P.claude.length + ' · sheets: ' + P.sheets.filter(x => x.status === 'done').length + ' of ' + P.sheets.length + ' printed · about ' + dur(P.eta) + ' of work left.',
      ...(doing.length ? ['Next: ' + doing.join('; ') + '.'] : []), ...(job.error ? [job.error] : []), ...(extra ? [extra] : []),
      '', 'Not finished. Call plan_set_status with job_id "' + job.id + '" to carry on: each call works on the set for up to about four minutes, and nothing happens between calls.'];
    return { content: [{ type: 'text', text: doc(title, lines) }] };
  }
  const link = await s.link(job.file.path, LINK_SECONDS), groups = [...new Set(job.sheets.map(x => x.section))];
  const failed = job.steps.filter(x => x.kind === 'sheet' && x.status === 'failed'), designs = job.types.filter(t => t.supported).map(t => PD.typeName(t) + ': ' + (job.designBy[t.id] || 'not drawn'));
  const skipped = job.steps.filter(x => x.kind === 'claude' && x.status === 'skipped' && !x.key.startsWith('design:')).map(x => x.label);
  const lines = [...head, job.file.sheets.length + ' sheets on 24 × 36, ' + mb(job.file.size) + ', made in ' + dur(job.elapsedMs || 0) + ' of work.',
    ...groups.map(g => (PS.sectionById(g)?.label || g) + ': ' + job.sheets.filter(x => x.section === g && job.file.sheets.includes(x.number)).map(x => x.number + ' ' + x.title).join('; ')),
    ...(designs.length ? ['', 'Building designs: ' + designs.join(' · ')] : ['', 'No building types this set can design (site sheets only).']),
    'Claude: ' + (job.model ? job.model + (skipped.length ? '; standard notes for ' + skipped.join(', ') : '') : 'not used (' + (job.claudeOff || 'no answer') + '): standard notes and rule-based designs'),
    ...(failed.length ? ['Left out (couldn’t be printed): ' + failed.map(x => x.key + ' (' + x.note + ')').join('; ')] : []),
    ...(job.types.filter(t => !t.supported).length ? ['Site sheets only for: ' + job.types.filter(t => !t.supported).map(t => t.label + ' (' + t.why + ')').join('; ')] : []),
    '', 'Download: ' + link + ' (good for 24 hours; call plan_set_status again for a new link).',
    'Every sheet says “Preliminary — not for construction, bidding or permit”: schematic drawings for feasibility, pricing and coordination, made with AI assistance and rule-based engineering layouts, not sealed.'];
  const content = [{ type: 'text', text: doc(title, lines) }];
  if (job.file.size <= PDF_LIMIT) { const b = await s.get(job.file.path); if (b) content.push({ type: 'resource', resource: { uri: 'report://plan_set/' + job.file.name, mimeType: 'application/pdf', blob: b.toString('base64') } }); }
  else content.push({ type: 'resource_link', uri: link, name: job.file.name, mimeType: 'application/pdf', size: job.file.size, description: 'The plan set PDF (' + mb(job.file.size) + '), a signed link good for 24 hours.' });
  return { content };
}
