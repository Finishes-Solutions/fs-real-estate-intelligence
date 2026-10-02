// Assistant chat with map tools. Stateless: the browser sends the whole conversation (including tool calls and the
// results it computed), this returns the next assistant message. The browser runs any tool_calls and calls again.
// POST { messages: [...], context: { coverage, filters } } -> { message: { role, content, tool_calls? } }
import { chatTools, pickModel } from '../lib/openai.mjs';
import { chatTools as toolDefs, systemPrompt, TOOLS } from '../lib/agent-tools.mjs';
import { rateLimit, sameOrigin, needKey, clip } from './_lib/guard.mjs';

let modelP = null;
const model = key => (modelP ||= pickModel(key, process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_MODEL).catch(e => { modelP = null; throw e; }));
const NAMES = new Set(TOOLS.map(t => t.name));

export function cleanMessages(list) {
  const out = [];
  for (const m of (Array.isArray(list) ? list : []).slice(-40)) {
    if (!m || typeof m !== 'object') continue;
    if (m.role === 'user') out.push({ role: 'user', content: clip(m.content, 2000) });
    else if (m.role === 'assistant') {
      const calls = (Array.isArray(m.tool_calls) ? m.tool_calls : []).filter(c => c && NAMES.has(c.function?.name)).slice(0, 8)
        .map(c => ({ id: clip(c.id, 80), type: 'function', function: { name: c.function.name, arguments: clip(c.function.arguments, 4000) } }));
      out.push({ role: 'assistant', content: clip(m.content, 6000) || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else if (m.role === 'tool') out.push({ role: 'tool', tool_call_id: clip(m.tool_call_id, 80), content: clip(m.content, 12000) });
  }
  // a tool result must follow the assistant message that asked for it; drop orphans from a trimmed history
  const asked = new Set(); return out.filter(m => { if (m.role === 'assistant') (m.tool_calls || []).forEach(c => asked.add(c.id)); return m.role !== 'tool' || asked.has(m.tool_call_id); })
    .filter((m, i, a) => !(i === 0 && m.role !== 'user'));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 24, perDay: 400 })) return;
  const key = needKey(res); if (!key) return;
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const messages = cleanMessages(body.messages);
  if (!messages.length) return res.status(400).json({ error: 'Say something.' });
  const ctx = body.context || {};
  try {
    const r = await chatTools({ key, model: await model(key), tools: toolDefs(), maxTokens: 8000, effort: process.env.OPENAI_CHAT_REASONING_EFFORT || undefined,
      messages: [{ role: 'system', content: systemPrompt({ coverage: clip(ctx.coverage, 600), filters: clip(ctx.filters, 400) }) }, ...messages] });
    const m = r.message;
    return res.json({ message: { role: 'assistant', content: m.content || '', ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}) } });
  } catch (e) {
    console.error('chat failed', e.message);
    return res.status(502).json({ error: 'The assistant couldn’t answer just now. Try again.' });
  }
}
