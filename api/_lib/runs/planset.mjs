// A plan set made on the server (api/runs.js), in the same steps as Projects › Plans › Make Plan Set did in the page
// (src/siteplan.js startJob builds the job; this works it, as lib/mcp/planset.mjs does for the agents):
//   1. Claude writes the cover's notes and each discipline's notes (api/planset.js plansetAsk), four at a time;
//   2. Claude designs each building type's floor plans, checked (lib/plandesign.mjs placeDesign) and sent back with the
//      problems at most twice; a type that still fails, or any step without Claude, gets the rule-based design;
//   3. every sheet is drawn (lib/planset.mjs) and printed bare by headless Chromium, three at a time;
//   4. the pages go on the title block border as one PDF, saved to the team's storage (project-media
//      <project>/set/<key>.pdf) and listed on the option in the team's copy of the project.
// input: { job (the page's: sections, types, sheets, steps, base, revisions, no, date, by, madeBy, projectNumber, sig),
//          plan, project: { name, client, projectNumber }, renders: [{ id, label }], model?, effort?, terrain? }
import { readFile } from 'node:fs/promises';
import * as PS from '../../../lib/planset.mjs';
import * as PD from '../../../lib/plandesign.mjs';
import * as RF from '../../../lib/sitefiles.mjs';
import { render as chromium } from '../../../lib/pdf.mjs';
import { monthSpend } from '../../../lib/aiusage.mjs';
import { useClaude, effortFor } from '../../../lib/anthropic.mjs';
import { plansetAsk, askError, capOf, budgetMessage } from '../../planset.js';
import { terrainFor } from '../../terrain.js';

export const hooks = { ai: null, render: null, border: null };
const CLAUDE_START_MS = 110000, SHEET_START_MS = 20000, MERGE_START_MS = 60000, CLAUDE_AT_ONCE = 4, SHEETS_AT_ONCE = 3, DESIGN_TRIES = 3, SHEET_TRIES = 3, KEEP = 12;
const OFF = { 402: 'this month’s plan set budget is used up', 503: 'Claude isn’t set up' };
const fin = x => ['done', 'skipped', 'failed'].includes(x.status);
const clip = (s, n) => String(s ?? '').slice(0, n);

export function start(input) {
  const j = input?.job, pl = input?.plan;
  if (!j || !Array.isArray(j.steps) || !Array.isArray(j.sheets) || !j.steps.length) throw new Error('the set has no sheets');
  if (!pl || !Array.isArray(pl.ring) || pl.ring.length < 3) throw new Error('the option has no site outline');
  const steps = j.steps.map(x => ({ key: String(x.key), kind: x.kind, label: clip(x.label, 120), status: 'todo' }));
  return { label: 'Starting the plan set', steps: steps.map(x => x.label),
    data: { j: { ...j, steps, designs: {}, designBy: {}, disc: {}, text: null, model: '', claudeOff: '' }, plan: pl, project: input.project || {}, renders: (input.renders || []).slice(0, 4), model: clip(input.model, 80), effort: clip(input.effort, 20), terrain: input.terrain || null, t0: Date.now() } };
}

async function askAI(d, body, signal) {
  if (hooks.ai) return hooks.ai(body, { signal });
  const key = process.env.ANTHROPIC_API_KEY; if (!key) throw Object.assign(new Error(OFF[503]), { status: 503 });
  const cap = capOf(), spend = await monthSpend('planset');
  if (cap === 0 || (spend.spent != null && spend.spent >= cap)) throw Object.assign(new Error(budgetMessage(cap)), { status: 402 });
  return plansetAsk(body, { key, model: await useClaude(key, d.model || ''), effort: effortFor(d.effort || undefined), signal });
}
let borderP = null;
const border = () => hooks.border ? Promise.resolve(hooks.border) : borderP ||= readFile(new URL('../../../templates/titleblock.pdf', import.meta.url)).catch(e => { borderP = null; throw e; });
const designFallback = (j, id, why) => { const t = j.types.find(y => y.id === id); if (!t || j.designs[id]) return; j.designs[id] = PD.placeDesign(PD.fallbackDesign(t), t).design; j.designBy[id] = 'rule-based (' + why + ')'; };
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); })); }
function show(job, j) { // the run's steps and label from the set's own
  job.steps = j.steps.map(x => x.label); const at = j.steps.findIndex(x => !fin(x)); job.step = at < 0 ? j.steps.length : at + 1;
  const W = x => x.kind === 'claude' ? 10 : x.kind === 'merge' ? 4 : 1, tot = j.steps.reduce((a, x) => a + W(x), 0); job.progress = tot ? +(j.steps.filter(fin).reduce((a, x) => a + W(x), 0) / tot).toFixed(3) : 0;
  const doing = j.steps.filter(x => x.status === 'doing' || (x.status === 'todo' && x.note)).slice(0, 3);
  const printed = j.steps.filter(x => x.kind === 'sheet' && x.status === 'done').length, sheets = j.steps.filter(x => x.kind === 'sheet').length;
  job.label = doing.length ? doing.map(x => x.label + (x.note ? ' (' + x.note + ')' : '')).join(' · ') : printed ? printed + ' of ' + sheets + ' sheets printed' : 'Working…';
  job.steps2 = j.steps.map(x => ({ key: x.key, kind: x.kind, label: x.label, status: x.status, note: x.note || '', ms: x.ms || 0 }));
}

// one stretch of work, as far as the slice's time goes (a slice does one of these: oneStep)
export async function step(job, d, ctx) {
  const j = d.j, left = ctx.left, plan = d.plan, save = async () => { show(job, j); await ctx.store.putData(job.pid, job.id, d); await ctx.store.put({ ...job }); };
  const mark = async (x, status, note) => { x.status = status; x.note = note || ''; await save(); };
  const base = { plan, project: d.project, ...j.base, types: j.types, sheets: j.sheets };
  // 1 and 2. Claude
  const claude = j.steps.filter(x => x.kind === 'claude' && !fin(x)), brief = PS.notesBrief(base);
  await pool(claude, CLAUDE_AT_ONCE, async x => {
    if (fin(x)) return;
    if (j.claudeOff) { if (x.key.startsWith('design:')) designFallback(j, x.key.slice(7), j.claudeOff); return mark(x, 'skipped', (x.key.startsWith('design:') ? 'rule-based design: ' : '') + j.claudeOff); }
    if (left() < CLAUDE_START_MS) return;
    x.status = 'doing'; const ts = Date.now(), ac = new AbortController(), tm = setTimeout(() => ac.abort(), Math.max(1000, left() - 15000));
    try {
      if (x.key === 'notes') { const r = await askAI(d, { mode: 'notes', brief }, ac.signal); j.text = r.notes; j.model = r.model || j.model; x.ms = Date.now() - ts; return await mark(x, 'done', r.fellBack ? 'answered by a fallback model' : ''); }
      if (x.key.startsWith('disc:')) { const k = x.key.slice(5), r = await askAI(d, { mode: 'disc', discipline: k, brief: PS.discBrief(base, k, j.types) }, ac.signal); j.disc[k] = r.disc; j.model = r.model || j.model; x.ms = Date.now() - ts; return await mark(x, 'done', r.fellBack ? 'answered by a fallback model' : ''); }
      const t = j.types.find(y => y.id === x.key.slice(7)); if (!t) return await mark(x, 'skipped', 'no such building type');
      const seed = PD.fallbackDesign(t), brief2 = PD.designBrief(t, { county: j.base.county, address: j.base.address });
      x.tries ||= 0;
      while (x.tries < DESIGN_TRIES && left() > CLAUDE_START_MS * (x.tries ? 0.8 : 1)) {
        x.note = x.tries ? 'fixing ' + x.problems.length + ' problem' + (x.problems.length === 1 ? '' : 's') + ', try ' + (x.tries + 1) : 'Claude is drawing it';
        const r = await askAI(d, { mode: 'design', type: t.id, brief: brief2, seed, previous: x.prev || null, problems: x.problems || [] }, ac.signal); x.tries++; j.model = r.model || j.model;
        const pd = PD.placeDesign(r.design, t);
        if (!pd.problems.length) { j.designs[t.id] = pd.design; j.designBy[t.id] = 'Claude'; delete x.prev; x.ms = (x.ms || 0) + Date.now() - ts; return await mark(x, 'done', x.tries > 1 ? 'fixed in ' + x.tries + ' tries' : ''); }
        x.prev = r.design; x.problems = pd.problems.slice(0, 30);
      }
      x.ms = (x.ms || 0) + Date.now() - ts;
      if (x.tries >= DESIGN_TRIES) { designFallback(j, t.id, 'Claude’s plan kept failing ' + x.problems.length + ' check' + (x.problems.length === 1 ? '' : 's')); delete x.prev; return await mark(x, 'skipped', 'rule-based design used: ' + x.problems[0]); }
      x.status = 'todo';
    } catch (e) {
      x.ms = (x.ms || 0) + Date.now() - ts;
      if (ac.signal.aborted) { x.status = 'todo'; x.note = 'cut off: tried again next'; return; }
      if (OFF[e.status]) j.claudeOff = OFF[e.status];
      if (x.key.startsWith('design:')) designFallback(j, x.key.slice(7), j.claudeOff || 'no answer');
      await mark(x, 'skipped', (x.key.startsWith('design:') ? 'rule-based design: ' : 'standard notes: ') + (j.claudeOff || clip(askError(e), 100)));
    } finally { clearTimeout(tm); }
  });
  if (j.steps.some(x => x.kind === 'claude' && !fin(x))) { await save(); return; }
  for (const t of j.types.filter(t => t.supported)) if (!j.designs[t.id]) designFallback(j, t.id, 'rule-based');
  // 3. the sheets
  const pending = j.steps.filter(x => x.kind === 'sheet' && !fin(x));
  if (pending.length) {
    const renders = [];
    if (pending.some(x => j.sheets.find(y => y.number === x.key)?.kind === 'render')) for (const r of d.renders) {
      try { const b = Buffer.from(await (await ctx.store.media.get(RF.mediaPath(job.pid, 'render/' + RF.mediaKey(r.id)))).arrayBuffer()); renders.push({ src: 'data:image/jpeg;base64,' + b.toString('base64'), caption: r.label || '' }); }
      catch (e) { renders.push({ src: '', caption: r.label || '' }); } }
    if (!d.terrain && !d.terrainTried) { d.terrainTried = true; d.terrain = await Promise.race([terrainFor(plan.origin, plan.ring, Date.now(), { meteo: false }).catch(() => null), new Promise(res => setTimeout(() => res(null), 30000))]); }
    const c = PS.setContext({ ...base, project: d.project, text: j.text, disc: j.disc, designs: j.designs, designBy: j.designBy, renders, date: j.date, drawnBy: j.by, projectNumber: j.projectNumber, revisions: j.revisions, terrain: d.terrain }, j.sheets);
    let since = 0;
    await pool(pending, SHEETS_AT_ONCE, async x => {
      if (left() < SHEET_START_MS) return;
      const sh = j.sheets.find(y => y.number === x.key), ts = Date.now(); x.status = 'doing';
      try {
        const pdf = await (hooks.render || chromium)(PS.docHTML(c, PS.sheetPage(c, sh)), { sheet: 'set', title: clip(d.project.name, 80) + ' — ' + sh.number });
        await ctx.store.file.put(job.pid, job.id, 'sheet-' + x.key.replace(/[^\w.-]/g, '_') + '.pdf', Buffer.from(pdf), 'application/pdf'); x.ms = Date.now() - ts; x.status = 'done'; x.note = '';
      } catch (e) { x.fails = (x.fails || 0) + 1; x.status = x.fails >= SHEET_TRIES ? 'failed' : 'todo'; x.note = clip(e.message, 120); }
      if (++since % 6 === 0) await save();
    });
    await save();
    if (j.steps.some(x => x.kind === 'sheet' && !fin(x))) return;
  }
  // 4. one PDF on the border, kept for the team and listed on the option
  const m = j.steps.find(x => x.key === 'merge');
  if (left() < MERGE_START_MS) return;
  m.status = 'doing'; const ts = Date.now();
  const { PDFDocument } = await import('pdf-lib'), out = await PDFDocument.create(), [bd] = await out.embedPdf(await border(), [0]), made = [];
  for (const sh of j.sheets) {
    if (j.steps.find(x => x.key === sh.number)?.status !== 'done') continue;
    let b; try { b = Buffer.from(await (await ctx.store.file.get(job.pid, job.id, 'sheet-' + sh.number.replace(/[^\w.-]/g, '_') + '.pdf')).arrayBuffer()); } catch (e) { continue; }
    const src = await PDFDocument.load(b);
    for (const pg of await out.embedPdf(src, src.getPageIndices())) { const p = out.addPage([pg.width, pg.height]); p.drawPage(bd, { x: 0, y: 0, width: pg.width, height: pg.height }); p.drawPage(pg, { x: 0, y: 0, width: pg.width, height: pg.height }); }
    made.push(sh.number);
  }
  out.setTitle(clip(d.project.name, 80) + ' — ' + (plan.name || 'option') + ' — Schematic design set, issue ' + j.no); out.setCreator('Real Estate Intelligence'); out.setProducer('Real Estate Intelligence plan sets');
  const bytes = Buffer.from(await out.save()), setId = j.id || job.id;
  await ctx.store.media.put(RF.mediaPath(job.pid, 'set/' + RF.mediaKey(setId)), bytes, 'application/pdf');
  m.ms = Date.now() - ts; m.status = 'done';
  const rec = { id: setId, cloud: true, no: j.no, at: j.at, by: j.madeBy || '', sheets: made, sections: j.sections, model: j.model, ...(j.text ? {} : { noNotes: true }), sig: j.sig, desc: j.revisions?.[j.revisions.length - 1]?.desc || 'Schematic design set', mins: Math.round((Date.now() - d.t0) / 60000), designs: { ...j.designBy }, job: job.id, size: bytes.length };
  if (ctx.changeProject) await ctx.changeProject(job.pid, p => {
    const q = (p.plans || []).find(x => x.id === job.plid); if (!q) return false; if ((q.sets || []).some(x => x.id === rec.id)) return false;
    q.sets = (q.sets || []).concat([rec]);
    const gone = []; while (q.sets.length > KEEP) gone.push(q.sets.shift());
    if (gone.length) ctx.store.media.remove(gone.filter(x => x.cloud).map(x => RF.mediaPath(job.pid, 'set/' + RF.mediaKey(x.id)))).catch(() => {});
    return true;
  });
  d.result = { set: rec, failed: j.steps.filter(x => x.kind === 'sheet' && x.status === 'failed').map(x => x.key) };
  show(job, j); job.state = 'done'; job.label = 'Plan set issue ' + j.no + ' ready: ' + made.length + ' sheets';
}
export const minMs = 30000, oneStep = true, budgetMs = 240000;
