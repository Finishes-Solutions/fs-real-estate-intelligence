// Assistant chat with map tools, through the OpenAI Responses API. The thread lives on OpenAI's side
// (previous_response_id); the browser runs any tool calls against its loaded filings and sends the outputs back.
// POST { previous_response_id?, input: [{ role:'user', content }] | [{ type:'function_call_output', call_id, output }], context }
//   -> { id, text, calls: [{ call_id, name, arguments }] }
import { respond, pickModel } from '../lib/openai.mjs';
import { realtimeTools, systemPrompt, TOOLS } from '../lib/agent-tools.mjs';
import { rateLimit, sameOrigin, needKey, clip } from './_lib/guard.mjs';

let modelP = null;
const model = key => (modelP ||= pickModel(key, process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_MODEL).catch(e => { modelP = null; throw e; }));
const NAMES = new Set(TOOLS.map(t => t.name));

export function cleanInput(list) {
  const out = [];
  for (const m of (Array.isArray(list) ? list : []).slice(0, 12)) {
    if (!m || typeof m !== 'object') continue;
    if (m.role === 'user') out.push({ role: 'user', content: clip(m.content, 2000) });
    else if (m.type === 'function_call_output' && m.call_id) out.push({ type: 'function_call_output', call_id: clip(m.call_id, 80), output: clip(m.output, 12000) });
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 24, perDay: 400 })) return;
  const key = needKey(res); if (!key) return;
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const input = cleanInput(body.input), prev = typeof body.previous_response_id === 'string' && /^resp_[\w-]{4,120}$/.test(body.previous_response_id) ? body.previous_response_id : null;
  if (!input.length) return res.status(400).json({ error: 'Say something.' });
  if (!prev && input.some(m => m.type)) return res.status(400).json({ error: 'Tool output without a conversation.' });
  const ctx = body.context || {};
  try {
    const r = await respond({ key, model: await model(key), tools: realtimeTools(), input, previousResponseId: prev, maxTokens: 8000,
      effort: process.env.OPENAI_CHAT_REASONING_EFFORT || undefined,
      instructions: systemPrompt({ coverage: clip(ctx.coverage, 600), filters: clip(ctx.filters, 400) }) });
    return res.json({ id: r.id, text: r.text, calls: r.calls.filter(c => NAMES.has(c.name)) });
  } catch (e) {
    console.error('chat failed', e.message);
    const expired = /previous response|not found/i.test(e.message);
    return res.status(expired ? 409 : 502).json({ error: expired ? 'That conversation expired. Start a new one.' : 'The assistant couldn’t answer just now. Try again.' });
  }
}
