// Minimal OpenAI Chat Completions client shared by the build and the Vercel functions (no SDK dependency).
// Model: OPENAI_MODEL (default gpt-6-luna). Reasoning effort: OPENAI_REASONING_EFFORT (default "high");
// if a model rejects the reasoning_effort parameter, requests are retried without it.
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

async function complete(key, body, signal, eff) {
  for (let i = 0; i < 4; i++) {
    const e = eff === undefined ? effort : eff;
    const b = e ? { ...body, reasoning_effort: e } : body;
    const r = await fetch(BASE + '/chat/completions', { method: 'POST', signal, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    if (r.status === 429 || r.status >= 500) { await new Promise(res => setTimeout(res, 1500 * (i + 1) ** 2)); continue; }
    const d = await r.json();
    if (!r.ok && e && /reasoning/i.test(d.error?.message || '') && r.status === 400 && !/tools/i.test(d.error?.message || '')) { eff = ''; i--; continue; } // model doesn't take it (this request only)
    if (!r.ok) throw new Error('OpenAI ' + r.status + ': ' + (d.error?.message || 'error'));
    return d;
  }
  throw new Error('OpenAI kept rate-limiting or failing');
}

// Structured output: returns the parsed JSON object that matches `schema`.
export async function chatJSON({ key, model, system, user, name, schema, maxTokens = 4000, signal }) {
  const d = await complete(key, {
    model, max_completion_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } }
  }, signal);
  const msg = d.choices?.[0]?.message;
  if (msg?.refusal) throw new Error('OpenAI refused: ' + msg.refusal);
  if (!msg?.content) throw new Error('OpenAI returned no content (finish_reason ' + d.choices?.[0]?.finish_reason + ')');
  return { data: JSON.parse(msg.content), usage: d.usage };
}

// Plain-text completion (for briefs and answers).
export async function chatText({ key, model, system, user, maxTokens = 1200, signal }) {
  const d = await complete(key, { model, max_completion_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }, signal);
  return d.choices?.[0]?.message?.content || '';
}

// Tool-calling turn through the Responses API (Chat Completions refuses function tools with reasoning effort on
// reasoning models). Conversation state lives on OpenAI's side: pass previous_response_id to continue a thread.
// input: [{ role: 'user', content }] or [{ type: 'function_call_output', call_id, output }]
// -> { id, text, calls: [{ call_id, name, arguments }], usage }
export async function respond({ key, model, instructions, input, tools, previousResponseId, maxTokens = 8000, effort: eff, signal }) {
  const e = eff === undefined ? effort : eff;
  const body = { model, instructions, input, tools, tool_choice: 'auto', max_output_tokens: maxTokens, store: true,
    ...(previousResponseId ? { previous_response_id: previousResponseId } : {}), ...(e ? { reasoning: { effort: e } } : {}) };
  for (let i = 0; i < 4; i++) {
    const r = await fetch(BASE + '/responses', { method: 'POST', signal, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status === 429 || r.status >= 500) { await new Promise(res => setTimeout(res, 1500 * (i + 1) ** 2)); continue; }
    const d = await r.json();
    if (!r.ok) throw new Error('OpenAI ' + r.status + ': ' + (d.error?.message || 'error'));
    const out = d.output || [];
    const text = out.filter(o => o.type === 'message').flatMap(o => o.content || []).filter(c => c.type === 'output_text').map(c => c.text).join('\n').trim();
    const calls = out.filter(o => o.type === 'function_call').map(o => ({ call_id: o.call_id, name: o.name, arguments: o.arguments || '{}' }));
    return { id: d.id, text, calls, usage: d.usage, status: d.status };
  }
  throw new Error('OpenAI kept rate-limiting or failing');
}
