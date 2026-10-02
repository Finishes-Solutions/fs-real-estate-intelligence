// Minimal OpenAI Chat Completions client shared by the build and the Vercel functions (no SDK dependency).
const BASE = 'https://api.openai.com/v1';
export const FALLBACK_MODELS = ['gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o-mini'];

export async function pickModel(key, preferred) {
  for (const m of [preferred, ...FALLBACK_MODELS].filter(Boolean)) {
    const r = await fetch(BASE + '/models/' + encodeURIComponent(m), { headers: { Authorization: 'Bearer ' + key } });
    if (r.ok) return m;
    if (r.status === 401) throw new Error('OpenAI rejected the API key (401)');
  }
  throw new Error('None of the configured OpenAI models are available to this key');
}

// Structured output: returns the parsed JSON object that matches `schema`.
export async function chatJSON({ key, model, system, user, name, schema, maxTokens = 4000, signal }) {
  const body = {
    model, max_completion_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } }
  };
  for (let i = 0; i < 4; i++) {
    const r = await fetch(BASE + '/chat/completions', { method: 'POST', signal, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status === 429 || r.status >= 500) { await new Promise(res => setTimeout(res, 1500 * (i + 1) ** 2)); continue; }
    const d = await r.json();
    if (!r.ok) throw new Error('OpenAI ' + r.status + ': ' + (d.error?.message || 'error'));
    const msg = d.choices?.[0]?.message;
    if (msg?.refusal) throw new Error('OpenAI refused: ' + msg.refusal);
    if (!msg?.content) throw new Error('OpenAI returned no content (finish_reason ' + d.choices?.[0]?.finish_reason + ')');
    return { data: JSON.parse(msg.content), usage: d.usage };
  }
  throw new Error('OpenAI kept rate-limiting or failing');
}

// Plain-text completion (for briefs and answers).
export async function chatText({ key, model, system, user, maxTokens = 1200, signal }) {
  const r = await fetch(BASE + '/chat/completions', { method: 'POST', signal, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, max_completion_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
  const d = await r.json();
  if (!r.ok) throw new Error('OpenAI ' + r.status + ': ' + (d.error?.message || 'error'));
  return d.choices?.[0]?.message?.content || '';
}
