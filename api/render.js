// Photoreal renderings of a site plan: POST { image, brief, view } -> { image, model, size, prompt }
//   image: a data URL (JPEG/PNG/WebP, up to ~3 MB) of the plan's 3D massing on the map from the view's camera (the
//          browser takes it; lib/render.mjs cameraFor); brief: briefOf() from the same lib (with focus, the building, for the close-up); view: one of VIEWS
//   -> image: a data URL (JPEG) of the rendering, 1920 × 1080 when the model can do it, else the nearest size it offers
// The picture is made by gpt-image-2.5-sunburst when the key has it, else the newest GPT Image model it lists (OPENAI_IMAGE_MODEL overrides) through the Images
// API's edit endpoint, which keeps the input picture's geometry and camera and paints it photographically. Its token
// use is recorded under the Renderings feature (lib/aiusage.mjs). One picture a request: the browser asks for the
// views one after another, so a slow model never runs past Vercel's limit.
// A monthly budget caps it (RENDER_MONTHLY_CAP_USD, $100 by default, per US Central calendar month): before painting,
// this month's Renderings rows are costed (lib/aiusage.mjs monthSpend) and a spent budget answers 402 without asking
// OpenAI. A failed read never blocks a picture, except that a $0 cap (renderings off) refuses without reading. GET -> { budget: { spent, cap, month, images, priced } } for the panel.
import { rateLimit, sameOrigin, needKey, clip } from './_lib/guard.mjs';
import { availableModels } from '../lib/openai.mjs';
import { recordUsage, monthSpend, tokensOf, fallbackPerImage } from '../lib/aiusage.mjs';
import { costOf } from '../lib/aiprices.mjs';
import { VIEWS, SIZES, byId, renderPrompt, pickImageModel } from '../lib/render.mjs';

const BASE = 'https://api.openai.com/v1', MAX_IN = 3_200_000; // Vercel's body limit is 4.5 MB

export const dataImage = s => { const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(typeof s === 'string' && s.length <= MAX_IN ? s : ''); return m ? { type: 'image/' + m[1], bytes: Buffer.from(m[2], 'base64') } : null; };
// the brief as the prompt builder takes it: only its known fields, each cut to size
export function cleanBrief(b = {}) {
  const uses = (Array.isArray(b.uses) ? b.uses : []).slice(0, 8).map(u => ({ use: clip(u?.use, 20), label: clip(u?.label, 40), count: Math.max(1, Math.min(500, Math.round(+u?.count) || 1)), floors: (Array.isArray(u?.floors) ? u.floors : []).slice(0, 4).map(f => Math.max(1, Math.min(60, Math.round(+f) || 1))), forms: (Array.isArray(u?.forms) ? u.forms : []).filter(f => ['bar', 'L', 'U', 'tower'].includes(f)), units: +u?.units > 0 ? Math.round(+u.units) : undefined }));
  const n = (v, hi) => Number.isFinite(+v) && +v > 0 ? Math.min(hi, +v) : undefined;
  return { address: clip(b.address, 120), acres: n(b.acres, 5000), uses, buildings: n(b.buildings, 2000), parking: n(b.parking, 50000), pond: !!b.pond, pool: !!b.pool, truckCourt: !!b.truckCourt, garage: !!b.garage, homes: n(b.homes, 5000),
    trees: b.trees !== false, look: clip(b.look, 20), time: clip(b.time, 20), basemap: b.basemap === 'satellite' ? 'satellite' : 'map', facts: (Array.isArray(b.facts) ? b.facts : []).slice(0, 6).map(s => clip(s, 200)),
    focus: b.focus && typeof b.focus === 'object' ? { name: clip(b.focus.name, 40) || 'Building', use: clip(b.focus.use, 20), floors: Math.max(1, Math.min(60, Math.round(+b.focus.floors) || 1)), label: clip(b.focus.label, 40) } : undefined }; // the building a close-up frames
}

// one edit call; a 400 about the size steps down to the next size, one about input_fidelity drops that parameter
export async function paint(key, { model, prompt, image, sizes = SIZES, fidelity = true, signal }) {
  let size = sizes[0], fid = fidelity, lastErr = null;
  for (let i = 0; i < 6; i++) {
    const f = new FormData(); f.append('model', model); f.append('prompt', prompt); f.append('n', '1'); f.append('size', size); f.append('quality', 'high'); f.append('output_format', 'jpeg'); if (fid) f.append('input_fidelity', 'high');
    f.append('image[]', new Blob([image.bytes], { type: image.type }), 'massing.' + (image.type === 'image/jpeg' ? 'jpg' : image.type.split('/')[1]));
    const r = await fetch(BASE + '/images/edits', { method: 'POST', signal, headers: { Authorization: 'Bearer ' + key }, body: f });
    if (r.status === 429 || r.status >= 500) { lastErr = new Error('OpenAI ' + r.status); if (signal?.aborted) throw new Error('cancelled'); await new Promise(res => setTimeout(res, 2000 * (i + 1))); continue; }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = d.error?.message || 'error';
      if (r.status === 400 && /input_fidelity/i.test(msg) && fid) { fid = false; continue; }
      if (r.status === 400 && (msg.includes(size) || /size/i.test(msg))) { const nx = sizes[sizes.indexOf(size) + 1]; if (nx) { size = nx; continue; } }
      throw new Error('OpenAI ' + r.status + ': ' + msg);
    }
    const b64 = d.data?.[0]?.b64_json; if (!b64) throw new Error('OpenAI returned no image');
    await recordUsage(d.model || model, d.usage, 'render');
    return { b64, size, model: d.model || model, usage: d.usage || null };
  }
  throw lastErr || new Error('OpenAI kept failing');
}

// the month's cap in dollars: RENDER_MONTHLY_CAP_USD (0 turns renderings off), $100 when unset or not a number
export const capOf = (env = process.env) => { const v = parseFloat(env.RENDER_MONTHLY_CAP_USD); return Number.isFinite(v) && v >= 0 ? v : 100; };
const usd = v => '$' + (v % 1 ? v.toFixed(2) : String(v));
export const budgetMessage = cap => cap === 0 ? 'Renderings are turned off on this site.' : 'This month’s rendering budget (' + usd(cap) + ') is used up. It resets on the 1st.';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 30, perDay: 600 })) return;
    const b = await monthSpend('render'); res.setHeader('Cache-Control', 'no-store');
    return res.json({ budget: { spent: b.spent, cap: capOf(), month: b.month, images: b.images, priced: b.priced } });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST only' });
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 6, perDay: 80 })) return;
  const key = needKey(res); if (!key) return;
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const image = dataImage(b.image); if (!image) return res.status(400).json({ error: 'Send the massing picture as a JPEG, PNG or WebP data URL under 3 MB.' });
  const cap = capOf(), spend = await monthSpend('render'); // spent null: couldn't read it, so paint anyway
  if (cap === 0 || (spend.spent != null && spend.spent >= cap)) return res.status(402).json({ error: budgetMessage(cap), spent: spend.spent, cap, month: spend.month });
  const view = byId(VIEWS, b.view).id, brief = cleanBrief(b.brief), prompt = renderPrompt(brief, view);
  let model = process.env.OPENAI_IMAGE_MODEL || '';
  if (!model) { try { model = pickImageModel(await availableModels(key)); } catch (e) { model = pickImageModel([]); } }
  if (!model) model = pickImageModel([]);
  res.setHeader('X-AI-Model', model);
  // Cancel in the browser aborts its request; when that reaches here before the picture is finished, the OpenAI call is
  // dropped too, so a cancelled picture isn't painted (and billed) for nobody. Best effort: a proxy may hold the connection.
  const ac = new AbortController(); if (typeof res.on === 'function') res.on('close', () => { if (!res.writableEnded) ac.abort(); });
  try {
    const out = await paint(key, { model, prompt, image, signal: ac.signal });
    res.setHeader('Cache-Control', 'no-store');
    const t = tokensOf(out.usage), est = (t && costOf(out.model, t)) ?? fallbackPerImage(); // this picture, best guess
    const budget = { spent: spend.spent == null ? null : Math.round((spend.spent + est) * 1e4) / 1e4, cap, month: spend.month };
    return res.json({ image: 'data:image/jpeg;base64,' + out.b64, model: out.model, size: out.size, view, prompt, budget });
  } catch (e) {
    if (ac.signal.aborted) { console.warn('render cancelled by the browser'); try { res.status(499).json({ error: 'Cancelled.' }); } catch (e2) { /* the connection is gone */ } return; }
    console.error('render', e.message);
    const m = /OpenAI 4\d\d: (.*)/.exec(e.message);
    return res.status(502).json({ error: m ? 'The image model refused: ' + clip(m[1], 200) : 'The rendering didn’t come back just now. Try again in a moment.' });
  }
}
