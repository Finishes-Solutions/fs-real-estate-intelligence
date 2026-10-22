// Minimal OpenAI Chat Completions client shared by the build and the Vercel functions (no SDK dependency).
// Model: OPENAI_MODEL (default gpt-6-luna). Reasoning effort: OPENAI_REASONING_EFFORT (default "high");
// if a model rejects the reasoning_effort parameter, requests are retried without it (xhigh first steps down to high).
import { isChatModel } from './aimodels.mjs';
import { recordUsage } from './aiusage.mjs'; // each answer's tokens, by model and feature (Settings › AI model › Usage)
const BASE = 'https://api.openai.com/v1';
export const DEFAULT_MODEL = 'gpt-6-luna';
export const FALLBACK_MODELS = ['gpt-5-mini', 'gpt-4.1-mini'];
let effort = (typeof process !== 'undefined' && process.env.OPENAI_REASONING_EFFORT) || 'high';
if (effort === 'none') effort = '';

export async function pickModel(key, preferred) {
  for (const m of [preferred || DEFAULT_MODEL, ...FALLBACK_MODELS].filter(Boolean)) {
    const r = await fetch(BASE + '/models/' + encodeURIComponent(m), { headers: { Authorization: 'Bearer ' + key } });
    if (r.ok) return m;
    if (r.status === 401) throw new Error('OpenAI rejected the API key (401)');
  }
  throw new Error('None of the configured OpenAI models are available to this key');
}

// the models this key can use (GET /v1/models), kept for ten minutes per server instance
let listP = null, listAt = 0;
export function availableModels(key) {
  if (!listP || Date.now() - listAt > 600000) { listAt = Date.now(); listP = fetch(BASE + '/models', { headers: { Authorization: 'Bearer ' + key } }).then(async r => { if (!r.ok) throw new Error('OpenAI ' + r.status); return (await r.json()).data || []; }).catch(e => { listP = null; throw e; }); }
  return listP;
}
// the model a request asked for (Settings › AI model), used only when it's a chat model this key can use; otherwise
// (or when nothing was asked for) the server's default, from fallback()
export async function useModel(key, requested, fallback) {
  if (requested && isChatModel(requested)) { try { if ((await availableModels(key)).some(m => m.id === requested)) return requested; } catch (e) {} }
  return fallback();
}

// a call made with the picked model, and made again once with the server's default when the picked model can't serve
// it (OpenAI says 400 or 404: unsupported model, parameter or input). Rate limits and outages aren't retried here.
// onModel(m): told each model tried, last one wins (api/* put it in the X-AI-Model header)
export async function withModel(key, requested, fallback, run, onModel = () => {}) {
  const m = await useModel(key, requested, fallback); onModel(m);
  try { return await run(m); }
  catch (e) {
    const d = await fallback(); if (m === d || !/^OpenAI (400|404)\b/.test(e.message || '')) throw e;
    console.warn('model', m, 'failed, using', d, ':', e.message); onModel(d); return run(d);
  }
}

async function complete(key, body, signal, eff, feature) {
  for (let i = 0; i < 4; i++) {
    const e = eff === undefined ? effort : eff;
    const b = e ? { ...body, reasoning_effort: e } : body;
    const r = await fetch(BASE + '/chat/completions', { method: 'POST', signal, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    if (r.status === 429 || r.status >= 500) { await new Promise(res => setTimeout(res, 1500 * (i + 1) ** 2)); continue; }
    const d = await r.json();
    if (!r.ok && e && /reasoning/i.test(d.error?.message || '') && r.status === 400 && !/tools/i.test(d.error?.message || '')) { eff = e === 'xhigh' ? 'high' : ''; i--; continue; } // model doesn't take it (this request only): xhigh steps down to high, then none
    if (!r.ok) throw new Error('OpenAI ' + r.status + ': ' + (d.error?.message || 'error'));
    await recordUsage(d.model || body.model, d.usage, feature);
    return d;
  }
  throw new Error('OpenAI kept rate-limiting or failing');
}

// Structured output: returns the parsed JSON object that matches `schema`.
// images: data or https URLs the model looks at with the text (layout drawings); if the model won't take images the
// request is retried as text alone.
// files: documents the model reads with the text, [{ filename, data }] where data is a data URL (a PDF: a reference file
// on a project, api/sitefiles.js); they aren't dropped on a retry, so a model that can't read them fails the call
export async function chatJSON({ key, model, system, user, name, schema, maxTokens = 4000, signal, effort: eff, images = [], files = [], feature }) {
  const docs = files.map(f => ({ type: 'file', file: { filename: f.filename, file_data: f.data } }));
  const body = imgs => ({ model, max_completion_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, { role: 'user', content: imgs.length || docs.length ? [{ type: 'text', text: user }, ...docs, ...imgs.map(url => ({ type: 'image_url', image_url: { url, detail: 'high' } }))] : user }],
    response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } } });
  let d;
  try { d = await complete(key, body(images), signal, eff, feature); }
  catch (e) { if (!images.length || !/image|vision|content/i.test(e.message)) throw e; d = await complete(key, body([]), signal, eff, feature); }
  const msg = d.choices?.[0]?.message;
  if (msg?.refusal) throw new Error('OpenAI refused: ' + msg.refusal);
  if (!msg?.content) throw new Error('OpenAI returned no content (finish_reason ' + d.choices?.[0]?.finish_reason + ')');
  if (d.choices?.[0]?.finish_reason === 'length') throw new Error('OpenAI’s answer was cut off (finish_reason length)'); // (the JSON stops part-way: max_completion_tokens ran out)
  return { data: JSON.parse(msg.content), usage: d.usage };
}

// a structured call made again, once, when its answer ran out of room (finish_reason length: on a reasoning model the
// thinking can use the whole of max_completion_tokens and leave nothing for the answer): with half as much room again
// and one notch less effort, as long as the function has the time left for it (limitMs from t0; less than minLeftMs
// left: the first error stands). call({ maxTokens, effort, signal }) makes the request.
const LOWER = { xhigh: 'high', high: 'medium', medium: 'low', low: 'low' };
export async function withRoom(call, { maxTokens, effort, t0 = Date.now(), limitMs = 285000, minLeftMs = 45000, cap = 100000 } = {}) {
  try { return await call({ maxTokens, effort }); }
  catch (e) {
    if (!/finish_reason length/.test(e?.message || '')) throw e;
    const left = limitMs - (Date.now() - t0); if (left < minLeftMs) throw e;
    const again = { maxTokens: Math.min(cap, Math.round(maxTokens * 1.5)), effort: LOWER[effort] || effort, signal: AbortSignal.timeout(Math.max(10000, left - 5000)) };
    console.warn('OpenAI ran out of room (' + maxTokens + ' tokens, effort ' + effort + '); once more with ' + again.maxTokens + ' at ' + again.effort);
    return call(again);
  }
}

// Plain-text completion (for briefs and answers).
export async function chatText({ key, model, system, user, maxTokens = 1200, signal, feature }) {
  const d = await complete(key, { model, max_completion_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }, signal, undefined, feature);
  return d.choices?.[0]?.message?.content || '';
}

// Tool-calling turn through the Responses API (Chat Completions refuses function tools with reasoning effort on
// reasoning models). Conversation state lives on OpenAI's side: pass previous_response_id to continue a thread.
// input: [{ role: 'user', content }] or [{ type: 'function_call_output', call_id, output }]
// -> { id, text, calls: [{ call_id, name, arguments }], usage }
export async function respond({ key, model, instructions, input, tools, previousResponseId, maxTokens = 8000, effort: eff, signal, feature }) {
  const e = eff === undefined ? effort : eff;
  const body = { model, instructions, input, tools, tool_choice: 'auto', max_output_tokens: maxTokens, store: true,
    ...(previousResponseId ? { previous_response_id: previousResponseId } : {}), ...(e ? { reasoning: { effort: e } } : {}) };
  for (let i = 0; i < 4; i++) {
    const r = await fetch(BASE + '/responses', { method: 'POST', signal, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status === 429 || r.status >= 500) { await new Promise(res => setTimeout(res, 1500 * (i + 1) ** 2)); continue; }
    const d = await r.json();
    if (!r.ok) throw new Error('OpenAI ' + r.status + ': ' + (d.error?.message || 'error'));
    await recordUsage(d.model || model, d.usage, feature);
    const out = d.output || [];
    const text = out.filter(o => o.type === 'message').flatMap(o => o.content || []).filter(c => c.type === 'output_text').map(c => c.text).join('\n').trim();
    const calls = out.filter(o => o.type === 'function_call').map(o => ({ call_id: o.call_id, name: o.name, arguments: o.arguments || '{}' }));
    return { id: d.id, text, calls, usage: d.usage, status: d.status };
  }
  throw new Error('OpenAI kept rate-limiting or failing');
}
