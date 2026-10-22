// Assistant chat with map tools. The browser runs any tool calls against its loaded filings and sends the outputs back.
// OpenAI (the default): through the Responses API, the thread on OpenAI's side (previous_response_id).
// Claude (Settings › AI model › Ask AI: provider 'anthropic'): Claude keeps no thread, so the conversation so far comes
// back from the browser each turn (history, as this function returned it) and is only added to (lib/anthropic.mjs claudeChat).
// POST { previous_response_id? | history?, input: [{ role:'user', content }] | [{ type:'function_call_output', call_id, output }], context, provider?, model? }
//   -> { id, text, calls: [{ call_id, name, arguments }] }   (OpenAI)
//   -> { history, text, calls }                             (Claude)
import { respond, pickModel, withModel } from '../lib/openai.mjs';
import { claudeChat, useClaude } from '../lib/anthropic.mjs';
import { wantsClaude, claudeKey } from '../lib/airoute.mjs';
import { responseTools, systemPrompt, TOOLS } from '../lib/agent-tools.mjs';
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

// a Claude conversation coming back from the browser: user and assistant messages as claudeChat returned them. Not
// edited (Claude checks its earlier thinking against the conversation), only checked for shape and size: past 1.5 MB
// it's too long to send again, and a new conversation is started (409)
const MAX_HISTORY = 1_500_000;
export function historyIn(h) {
  if (h == null) return [];
  if (!Array.isArray(h) || h.length > 400 || !h.every(m => m && (m.role === 'user' || m.role === 'assistant') && (typeof m.content === 'string' || Array.isArray(m.content)))) return null;
  return JSON.stringify(h).length > MAX_HISTORY ? null : h;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 24, perDay: 400 })) return;
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const claude = wantsClaude(body), key = claude ? '' : needKey(res); if (!claude && !key) return;
  const input = cleanInput(body.input), prev = typeof body.previous_response_id === 'string' && /^resp_[\w-]{4,120}$/.test(body.previous_response_id) ? body.previous_response_id : null;
  if (!input.length) return res.status(400).json({ error: 'Say something.' });
  const ctx = body.context || {};
  if (claude) {
    const history = historyIn(body.history); if (!history) return res.status(409).json({ error: 'That conversation got too long. Start a new one.' });
    if (!history.length && input.some(m => m.type)) return res.status(400).json({ error: 'Tool output without a conversation.' });
    try {
      const m = await useClaude(claudeKey(), typeof body.model === 'string' ? body.model : null); res.setHeader?.('X-AI-Model', m);
      const r = await claudeChat({ key: claudeKey(), model: m, feature: 'chat', tools: responseTools(), history, input, maxTokens: 16000, effort: 'medium',
        system: systemPrompt({ coverage: clip(ctx.coverage, 600), filters: clip(ctx.filters, 400), screen: clip(ctx.screen, 2500), followups: true }) });
      return res.json({ history: r.history, text: r.text, calls: r.calls.filter(c => NAMES.has(c.name)) });
    } catch (e) {
      console.error('chat failed (claude)', e.message);
      return res.status(e?.status === 400 ? 409 : 502).json({ error: e?.status === 400 ? 'Claude couldn’t continue that conversation. Start a new one.' : e?.refusal ? 'Claude declined to answer that one.' : 'The assistant couldn’t answer just now. Try again.' });
    }
  }
  if (!prev && input.some(m => m.type)) return res.status(400).json({ error: 'Tool output without a conversation.' });
  try {
    // Settings › AI model, when the key can use it (and the default if it can't serve the call)
    const r = await withModel(key, typeof body.model === 'string' ? body.model : null, () => model(key), m => respond({ key, model: m, feature: 'chat', tools: responseTools(), input, previousResponseId: prev, maxTokens: 8000,
      effort: process.env.OPENAI_CHAT_REASONING_EFFORT || undefined,
      instructions: systemPrompt({ coverage: clip(ctx.coverage, 600), filters: clip(ctx.filters, 400), screen: clip(ctx.screen, 2500), followups: true }) }), m => res.setHeader?.('X-AI-Model', m));
    return res.json({ id: r.id, text: r.text, calls: r.calls.filter(c => NAMES.has(c.name)) });
  } catch (e) {
    console.error('chat failed', e.message);
    const expired = /previous response|not found/i.test(e.message);
    return res.status(expired ? 409 : 502).json({ error: expired ? 'That conversation expired. Start a new one.' : 'The assistant couldn’t answer just now. Try again.' });
  }
}
