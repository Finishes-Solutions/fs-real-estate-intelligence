// MCP site_renderings (api/mcp.js): photoreal renderings of a site plan the site_plan tool saved (its plan_id), made the
// way the website's Render does it (api/render.js, lib/render.mjs), except for the picture painted from: there is no map
// on the server to photograph, so the plan's 3D massing is drawn here (lib/massing.mjs) from the same camera presets and
// printed by headless Chromium. Then the image model edits it into a photograph (api/render.js paint), inside the same
// monthly Renderings budget, with the same prompt (renderPrompt) and brief (briefOf).
// Each rendering is kept in storage with the saved plan (lib/mcp/store.mjs, renders/<plan_id>/), so plan_set can put the
// newest four on its A-9xx sheets, and is answered as a JPEG (or a signed link when the answer can't carry it).
import * as S from '../siteplan.mjs';
import * as RD from '../render.mjs';
import { massingSVG } from '../massingsvg.mjs';
import { snapshots } from '../pdf.mjs';
import { monthSpend } from '../aiusage.mjs';
import { availableModels } from '../openai.mjs';
import { paint, dataImage, cleanBrief, capOf, budgetMessage } from '../../api/render.js';
import { store, getJSON, putJSON, newId, ID } from './store.mjs';
import { PDF_LIMIT } from './reports.mjs';
import { UserError } from './resolve.mjs';
import { doc, clip } from './text.mjs';
import { slug } from '../../src/reportkit.js';

export const VIEW_IDS = RD.VIEWS.map(v => v.id), MAX_VIEWS = 4, KEEP = 12, LINK_SECONDS = 86400;
// one call's share of the function's 300 s, and what a view needs left to be started (4K takes two to four minutes)
export const BUDGET_MS = 265000, VIEW_START_MS = { hd: 100000, '2k': 130000, '4k': 200000 };
// tests: stand-ins for the painter, the massing snapshot and the clock
export const hooks = { paint: null, snapshot: null, now: null, budgetMs: null };
const now = () => (hooks.now || Date.now)();
const budget = () => hooks.budgetMs || BUDGET_MS;
const SURROUND_IDS = ['typical', 'none'];

export async function siteRenderingsTool(args = {}) {
  const t0 = now(), left = () => budget() - (now() - t0), s = store();
  if (!s) throw new UserError('Renderings need storage on this deployment (SUPABASE_SECRET_KEY): it isn’t set up.');
  const planId = String(args.plan_id || '').trim();
  if (!ID.test(planId)) throw new UserError('Give the plan_id a site_plan answer gave (call site_plan first: it lays out the site and saves the plan).');
  const rec = await getJSON(s, 'plans/' + planId + '.json');
  if (!rec?.plan) throw new UserError('There is no saved site plan with plan_id ' + planId + '. Call site_plan to lay the site out again: its answer gives a new plan_id.');
  const plan = rec.plan, want = [...new Set(Array.isArray(args.views) && args.views.length ? args.views : ['corner'])];
  const bad = want.filter(v => !VIEW_IDS.includes(v)); if (bad.length) throw new UserError('Unknown view' + (bad.length > 1 ? 's' : '') + ': ' + bad.join(', ') + '. Views: ' + VIEW_IDS.join(', ') + '.');
  if (want.length > MAX_VIEWS) throw new UserError('At most ' + MAX_VIEWS + ' views a call: each takes about a minute.');
  if (!(plan.elements || []).some(e => e.kind === 'building')) throw new UserError('This site plan has no buildings to render.');
  const key = process.env.OPENAI_API_KEY; if (!key && !hooks.paint) throw new UserError('Renderings need the image model on this deployment (OPENAI_API_KEY): it isn’t set up.');
  const cap = capOf(), spend = hooks.paint ? { spent: 0 } : await monthSpend('render');
  if (cap === 0 || (spend.spent != null && spend.spent >= cap)) throw new UserError(budgetMessage(cap));
  const res = RD.byId(RD.RESOLUTIONS, args.resolution).id, detail = RD.byId(RD.DETAILS, args.detail).id, look = RD.byId(RD.LOOKS, args.look).id, time = RD.byId(RD.TIMES, args.time).id;
  const surround = SURROUND_IDS.includes(args.surround) ? args.surround : 'typical', cap0 = RD.byId(RD.RESOLUTIONS, res).capture;
  const model = hooks.paint ? 'test-image-model' : process.env.OPENAI_IMAGE_MODEL || RD.pickImageModel(await availableModels(key).catch(() => []));
  const m = S.metrics(plan), made = [], skipped = [], failed = [];
  for (const view of want) {
    if (left() < VIEW_START_MS[res]) { skipped.push(view); continue; }
    const V = RD.byId(RD.VIEWS, view), focus = V.hero ? RD.heroTarget(plan) : null;
    const brief = cleanBrief(RD.briefOf(plan, { metrics: m, address: rec.address, facts: rec.facts, look, time, basemap: 'map', surround, focus }));
    const prompt = RD.renderPrompt(brief, view);
    try {
      const svg = massingSVG(plan, view, { w: cap0.w, h: cap0.h, surround });
      const [shot] = await (hooks.snapshot || snapshots)([svg], { px: cap0.w, quality: 90 }), image = dataImage(shot);
      if (!image) throw new Error('the massing picture couldn’t be made');
      const ac = new AbortController(), tm = setTimeout(() => ac.abort(), Math.max(5000, left() - 10000));
      let out; try { out = await (hooks.paint || paint)(key, { model, prompt, image, sizes: RD.sizesFor(res), quality: detail, compression: RD.COMPRESSION[res], signal: ac.signal }); } finally { clearTimeout(tm); }
      const id = newId(), path = 'renders/' + planId + '/' + id + '.jpg', bytes = Buffer.from(out.b64, 'base64');
      await s.put(path, bytes, 'image/jpeg');
      made.push({ id, path, view, label: RD.renderLabel(view, focus), size: out.size, model: out.model, bytes: bytes.length, at: new Date(now()).toISOString(), look, time, surround, resolution: res, detail });
    } catch (e) { failed.push(view + ' (' + clip(/OpenAI 4\d\d: (.*)/.exec(e.message)?.[1] || e.message, 140) + ')'); }
  }
  if (made.length) { const r2 = await getJSON(s, 'plans/' + planId + '.json') || rec; r2.renders = (r2.renders || []).concat(made.map(({ bytes, ...r }) => r)).slice(-KEEP); await putJSON(s, 'plans/' + planId + '.json', r2); }
  // the answer: each picture inline while they fit in one answer, else as a link
  const name = slug(rec.projectName || rec.label || 'site'), content = [];
  let room = PDF_LIMIT; const lines = [];
  for (const r of made) {
    const link = await s.link(r.path, LINK_SECONDS);
    lines.push('- ' + r.label + ': ' + r.size.replace('x', ' × ') + ', ' + r.model + '. ' + link);
    if (r.bytes <= room) { const b = await s.get(r.path); room -= r.bytes; content.push({ type: 'resource', resource: { uri: 'report://rendering/' + name + '-' + r.view + '.jpg', mimeType: 'image/jpeg', blob: b.toString('base64') } }); }
    else content.push({ type: 'resource_link', uri: link, name: name + '-' + r.view + '.jpg', mimeType: 'image/jpeg', size: r.bytes, description: 'Rendering, ' + r.label + ' (a signed link good for 24 hours).' });
  }
  const text = doc('Renderings: ' + (rec.projectName || rec.label), [
    'From plan_id ' + planId + (rec.layout ? ' (' + rec.layout + ')' : '') + ', ' + (rec.address || '') + '.',
    made.length ? made.length + ' rendering' + (made.length > 1 ? 's' : '') + ' (' + RD.byId(RD.LOOKS, look).label.toLowerCase() + ', ' + RD.byId(RD.TIMES, time).label.toLowerCase() + ', ' + (surround === 'none' ? 'the site alone' : 'typical surroundings') + '); links good for 24 hours:' : 'No rendering was made.',
    ...lines,
    ...(skipped.length ? ['Not made in this call (out of time): ' + skipped.join(', ') + '. Call site_renderings again with views ' + JSON.stringify(skipped) + '.'] : []),
    ...(failed.length ? ['Failed: ' + failed.join('; ') + '.'] : []),
    ...(made.length ? ['Kept with the plan: plan_set puts the newest four on its rendering sheets (A-901…) when sections includes renderings.'] : []),
    'AI concept illustrations painted from the plan’s 3D massing: building placement, shapes and heights follow the plan; materials, windows, landscaping, vehicles and surroundings are illustrative and not a design. Two renderings of one view differ. Not for construction, permitting or regulatory submittal.']);
  return { content: [{ type: 'text', text }, ...content], ...(made.length ? {} : { isError: true }) };
}
