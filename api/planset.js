// Plan sets (lib/planset.mjs, PLANSET-PLAN.md): Claude's words for a set and the set's PDF on the title block.
//   GET -> { configured, model, effort, models: [{ id, name }], budget: { spent, cap, month } }
//        what Settings › AI model › Plan sets and the Plans tab show: is the Claude key set, the server's model and
//        effort, the models the key can use, and this month's spend against PLANSET_MONTHLY_CAP_USD
//   POST { mode: 'notes', brief, model?, effort? } -> { notes, model, effort, budget }
//        the cover's description, general notes, codes and next steps from Claude (lib/planset.mjs NOTES_SCHEMA);
//        402 when the month's budget is spent, 503 when ANTHROPIC_API_KEY isn't set
//   POST { mode: 'disc', discipline, brief, model?, effort? } -> { disc: { notes, criteria }, model, effort, budget }
//        one discipline's sheet notes and design criteria (lib/planset.mjs DISC_SCHEMA)
//   POST { mode: 'design', type, brief, seed, previous?, problems?, model?, effort? } -> { design (raw), model, effort, budget }
//        one building type's floor plan (lib/plandesign.mjs DESIGN_SCHEMA). The browser checks it (placeDesign) and asks
//        again with the problems, at most twice; `seed` is the rule-based design it starts from
//   POST { mode: 'sheet', html } -> application/pdf: one sheet, laid on the border (a long set is printed a sheet at a time)
//   POST { mode: 'pdf', html } -> application/pdf
//        the set's HTML (lib/planset.mjs setHTML, one 36 x 24 page a sheet) printed by headless Chromium (api/pdf.js) and
//        laid on the Finishes Solutions border (templates/titleblock.pdf, made by build/titleblock.mjs) with pdf-lib
// The budget is per US Central calendar month, $100 by default (decided Oct 19); $0 turns the AI part off. The PDF
// costs nothing and works without the key.
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { rateLimit, sameOrigin, clip } from './_lib/guard.mjs';
import { monthSpend } from '../lib/aiusage.mjs';
import { claudeJSON, claudeModelList, useClaude, effortFor, serverModel, serverEffort } from '../lib/anthropic.mjs';
import { claudeModels } from '../lib/aimodels.mjs';
import { NOTES_SCHEMA, NOTES_SYSTEM, cleanNotes, DISC_SCHEMA, DISC_SYSTEM, DISCIPLINES, cleanDisc } from '../lib/planset.mjs';
import { DESIGN_SCHEMA, DESIGN_SYSTEM } from '../lib/plandesign.mjs';
import { PAGE } from '../lib/titleblock.mjs';
import { render } from './pdf.js';

const MAX_HTML = 4_000_000; // Vercel's request body limit is 4.5 MB
export const capOf = (env = process.env) => { const v = parseFloat(env.PLANSET_MONTHLY_CAP_USD); return Number.isFinite(v) && v >= 0 ? v : 100; };
const usd = v => '$' + (v % 1 ? v.toFixed(2) : String(v));
export const budgetMessage = cap => cap === 0 ? 'Claude is turned off for plan sets on this site (the monthly budget is $0): sets use rule-based designs and standard notes.' : 'This month’s plan set budget (' + usd(cap) + ') is used up. It resets on the 1st.';

// the border, read once per instance
let borderP = null;
const border = () => borderP ||= readFile(new URL('../templates/titleblock.pdf', import.meta.url)).catch(e => { borderP = null; throw e; });
// each page of `content` (a PDF, any number of 36 x 24 pages) drawn over the border
export async function onBorder(content, borderBytes) {
  const src = await PDFDocument.load(content), out = await PDFDocument.create(), [bd] = await out.embedPdf(borderBytes, [0]);
  const pages = await out.embedPdf(content, src.getPageIndices());
  for (const pg of pages) { const p = out.addPage([PAGE.w, PAGE.h]); p.drawPage(bd, { x: 0, y: 0, width: PAGE.w, height: PAGE.h }); p.drawPage(pg, { x: 0, y: 0, width: PAGE.w, height: PAGE.h }); }
  out.setTitle(src.getTitle() || 'Plan set'); out.setCreator('Finishes Solutions'); out.setProducer('Finishes Solutions plan sets');
  return out.save();
}

export default async function handler(req, res) {
  if (!sameOrigin(req, res)) return;
  const key = process.env.ANTHROPIC_API_KEY || '';
  if (req.method === 'GET') {
    if (!rateLimit(req, res, { perMinute: 30, perDay: 600 })) return;
    let models = [], modelsError = '';
    if (key) try { models = claudeModels(await claudeModelList(key)).map(({ id, name }) => ({ id, name })); } catch (e) { modelsError = 'Couldn’t list the Claude models just now.'; console.warn('claude models', e.message); }
    const b = await monthSpend('planset'); res.setHeader('Cache-Control', 'no-store');
    return res.json({ configured: !!key, model: serverModel(), effort: serverEffort(), models, modelsError, budget: { spent: b.spent, cap: capOf(), month: b.month } });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST only' });
  const b = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : (req.body || {});

  if (b.mode === 'pdf' || b.mode === 'sheet') {
    if (!rateLimit(req, res, b.mode === 'sheet' ? { perMinute: 120, perDay: 4000 } : { perMinute: 6, perDay: 200 })) return;
    const html = typeof b.html === 'string' ? b.html : '';
    if (!/^\s*<!doctype html>/i.test(html) || html.length > MAX_HTML) return res.status(400).json({ error: 'Send { html } (the whole set as one HTML document, under 4 MB).' });
    try {
      const pdf = await onBorder(await render(html, { sheet: 'set', title: clip(b.title, 120) || 'Plan set' }), await border());
      if (pdf.length > 4_400_000) return res.status(413).json({ error: 'The set is ' + (pdf.length / 1048576).toFixed(1) + ' MB, over the 4.5 MB a download from here can be. Leave out a rendering or two.' });
      res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(Buffer.from(pdf));
    } catch (e) { console.error('planset pdf', e.message); return res.status(502).json({ error: 'The set’s PDF couldn’t be made: ' + clip(e.message, 200) }); }
  }

  if (!['notes', 'disc', 'design'].includes(b.mode)) return res.status(400).json({ error: 'mode must be notes, disc, design, sheet or pdf' });
  if (!rateLimit(req, res, b.mode === 'notes' ? { perMinute: 4, perDay: 80 } : { perMinute: 30, perDay: 800 })) return;
  if (!key) return res.status(503).json({ error: 'Claude isn’t set up on this site (ANTHROPIC_API_KEY is missing), so the set’s notes can’t be written.' });
  const brief = typeof b.brief === 'string' ? b.brief.slice(0, 14000) : '';
  if (brief.length < 20) return res.status(400).json({ error: 'Send the project brief.' });
  const cap = capOf(), spend = await monthSpend('planset'); // spent null: couldn't read it, so go ahead
  if (cap === 0 || (spend.spent != null && spend.spent >= cap)) return res.status(402).json({ error: budgetMessage(cap), spent: spend.spent, cap, month: spend.month });
  const model = await useClaude(key, typeof b.model === 'string' ? b.model.trim() : ''), effort = effortFor(b.effort);
  res.setHeader('X-AI-Model', model);
  const ac = new AbortController(); if (typeof res.on === 'function') res.on('close', () => { if (!res.writableEnded) ac.abort(); });
  try {
    let out, key2 = 'notes';
    if (b.mode === 'notes') out = await claudeJSON({ key, model, effort, system: NOTES_SYSTEM, user: 'Write the cover sheet notes for this set.\n\n' + brief, schema: NOTES_SCHEMA, maxTokens: 16000, signal: ac.signal });
    else if (b.mode === 'disc') { if (!DISCIPLINES[b.discipline]) return res.status(400).json({ error: 'Unknown discipline.' }); key2 = 'disc';
      out = await claudeJSON({ key, model, effort, system: DISC_SYSTEM, user: 'Write the ' + DISCIPLINES[b.discipline] + ' general notes and design criteria for this set.\n\n' + brief, schema: DISC_SCHEMA, maxTokens: 16000, signal: ac.signal }); }
    else { key2 = 'design';
      const seed = JSON.stringify(b.seed || {}).slice(0, 60000), prev = b.previous ? JSON.stringify(b.previous).slice(0, 60000) : '', probs = (Array.isArray(b.problems) ? b.problems : []).slice(0, 30).map(x => '- ' + clip(x, 240)).join('\n');
      const user = brief + '\n\nSeed arrangement (passes the checks):\n' + seed + (prev ? '\n\nYour previous answer:\n' + prev + '\n\nIt failed these checks. Fix every one and answer with the whole corrected design:\n' + probs : '\n\nDesign this building type.');
      out = await claudeJSON({ key, model, effort, system: DESIGN_SYSTEM, user, schema: DESIGN_SCHEMA, maxTokens: 48000, signal: ac.signal }); }
    res.setHeader('X-AI-Model', out.model); res.setHeader('Cache-Control', 'no-store');
    const after = await monthSpend('planset'), budget = { spent: after.spent, cap, month: after.month };
    return res.json({ ...(key2 === 'notes' ? { notes: cleanNotes(out.data) } : key2 === 'disc' ? { disc: cleanDisc(out.data) } : { design: out.data }), model: out.model, effort, fellBack: out.fellBack, budget });
  } catch (e) {
    if (ac.signal.aborted) { try { res.status(499).json({ error: 'Cancelled.' }); } catch (e2) { /* gone */ } return; }
    console.error('planset ' + b.mode, e.status || '', e.message);
    const msg = e.status === 401 ? 'Anthropic rejected the API key (401). Check ANTHROPIC_API_KEY on Vercel.' : e.status === 429 ? 'Claude is rate-limiting just now. Try again in a minute.' : e.refusal ? 'Claude declined to answer this one.' : 'Claude didn’t answer just now (' + clip(e.message, 160) + ').';
    return res.status(502).json({ error: msg });
  }
}
