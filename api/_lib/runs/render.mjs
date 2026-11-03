// Renderings run on the server (api/runs.js): the page takes the massing of each view (a few seconds each, on its own
// map: src/siteplan.js captureOffscreen) and uploads them with the run; the painting, a minute to four each, happens
// here, one picture a slice, so it finishes even when the page is closed. Each picture and its massing go to the team's
// storage as the page puts them (project-media: <project>/render/<key>.jpg and massing/<key>.jpg) and the rendering's
// record is added to the option in the team's copy of the project, so it shows on every computer.
// input: { views: [{ view, file }], brief, o: { look, time, surround, res, detail, model? }, sig, by }
import { availableModels, pickedFor } from '../../../lib/openai.mjs';
import { isImageModel } from '../../../lib/aimodels.mjs';
import { monthSpend } from '../../../lib/aiusage.mjs';
import { OFFERED_VIEWS, RESOLUTIONS, DETAILS, COMPRESSION, sizesFor, byId, renderPrompt, pickImageModel } from '../../../lib/render.mjs';
import * as RF from '../../../lib/sitefiles.mjs';
import { paint as openaiPaint, cleanBrief, capOf, budgetMessage } from '../../render.js';

export const hooks = { paint: null, key: null, spend: null, model: null };
export const KEEP = 16; // renderings kept on an option (src/siteplan.js keeps the same)
const FILE = /^[\w.-]{1,80}\.(jpg|png)$/;

export function start(input) {
  const views = (Array.isArray(input?.views) ? input.views : []).slice(0, 8).filter(v => byId(OFFERED_VIEWS, v?.view, null) && FILE.test(String(v.file || '')));
  if (!views.length) throw new Error('no views to paint');
  const o = input.o || {};
  const opts = { look: String(o.look || '').slice(0, 20), time: String(o.time || '').slice(0, 20), surround: String(o.surround || '').slice(0, 20), res: byId(RESOLUTIONS, o.res).id, detail: byId(DETAILS, o.detail).id, ...(typeof o.model === 'string' ? { model: o.model.slice(0, 80) } : {}) };
  const steps = views.map(v => 'Painting ' + byId(OFFERED_VIEWS, v.view).label.toLowerCase());
  return { label: steps[0], steps, data: { views, brief: cleanBrief(input.brief || {}), o: opts, sig: String(input.sig || '').slice(0, 40), by: String(input.by || '').slice(0, 80), i: 0, made: [], failed: [] } };
}

const keyOf = () => hooks.key ?? process.env.OPENAI_API_KEY ?? '';
export async function step(job, d, ctx) {
  const v = d.views[d.i]; if (!v) { finish(job, d); return; }
  job.step = d.i + 1; job.label = job.steps[d.i];
  const key = keyOf(); if (!key) { d.stopped = 'Renderings need the AI, which isn’t set up on this site.'; finish(job, d); return; }
  const cap = capOf(), spend = await (hooks.spend || monthSpend)('render').catch(() => ({ spent: null }));
  if (cap === 0 || (spend.spent != null && spend.spent >= cap)) { d.stopped = budgetMessage(cap); finish(job, d); return; }
  const massing = Buffer.from(await (await ctx.store.file.get(job.pid, job.id, v.file)).arrayBuffer());
  let model = hooks.model || await pickedFor(key, d.o.model || null, isImageModel).catch(() => null) || process.env.OPENAI_IMAGE_MODEL || '';
  if (!model) { try { model = pickImageModel(await availableModels(key)); } catch (e) { model = pickImageModel([]); } }
  const prompt = renderPrompt(d.brief, v.view);
  let out;
  try { out = await (hooks.paint || openaiPaint)(key, { model, prompt, image: { type: 'image/jpeg', bytes: massing }, sizes: sizesFor(d.o.res), quality: d.o.detail, compression: COMPRESSION[d.o.res], signal: AbortSignal.timeout(Math.max(10000, ctx.left() - 4000)) }); }
  catch (e) { if (/OpenAI 4\d\d/.test(e.message)) { d.failed.push({ view: v.view, why: e.message.replace(/^OpenAI \d+: /, 'The image model refused: ').slice(0, 200) }); d.i++; if (d.i >= d.views.length) finish(job, d); return; } throw e; }
  // into the team's storage, then onto the option
  const id = job.plid + '/' + Date.now().toString(36) + '-' + v.view, k = RF.mediaKey(id);
  await ctx.store.media.put(RF.mediaPath(job.pid, 'render/' + k), Buffer.from(out.b64, 'base64'), 'image/jpeg');
  await ctx.store.media.put(RF.mediaPath(job.pid, 'massing/' + k), massing, 'image/jpeg').catch(() => {});
  const rec = { id, view: v.view, look: d.o.look, time: d.o.time, surround: d.o.surround, res: d.o.res, detail: d.o.detail, at: new Date().toISOString(), model: out.model || model, size: out.size || '', sig: d.sig, by: d.by, cloud: true, job: job.id };
  if (ctx.changeProject) await ctx.changeProject(job.pid, p => {
    const q = (p.plans || []).find(x => x.id === job.plid); if (!q) return false;
    if ((q.renders || []).some(r => r.id === id)) return false;
    q.renders = (q.renders || []).concat([rec]);
    const gone = []; while (q.renders.length > KEEP) gone.push(q.renders.shift());
    if (gone.length) ctx.store.media.remove(gone.filter(r => r.cloud).flatMap(r => [RF.mediaPath(job.pid, 'render/' + RF.mediaKey(r.id)), RF.mediaPath(job.pid, 'massing/' + RF.mediaKey(r.id))])).catch(() => {});
    return true;
  });
  d.made.push(rec); d.i++;
  if (d.i >= d.views.length) finish(job, d);
}
function finish(job, d) {
  d.result = { made: d.made, failed: d.failed, ...(d.stopped ? { stopped: d.stopped } : {}) };
  job.state = 'done'; job.step = job.steps.length;
  job.label = d.made.length ? (d.made.length === 1 ? 'Rendering ready' : d.made.length + ' renderings ready') + (d.failed.length || d.stopped ? ' (' + (d.stopped || d.failed.length + ' failed') + ')' : '') : d.stopped || (d.failed[0]?.why || 'No rendering');
}
// a picture can take four minutes at 4K: a slice paints one with all the time it has
export const minMs = 0, budgetMs = 285000, oneStep = true;
