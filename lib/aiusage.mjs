// AI usage, recorded: every OpenAI answer's token counts, added up by day (US Central), model and feature in Supabase
// (ai_usage, supabase/migrations/20261022000000_ai_usage.sql). Server only; the sums and costs Settings shows are in
// lib/aiprices.mjs. Recording never fails a request: no database, a missing table or a slow write just leaves that
// request uncounted.
import { supa } from './supa.mjs';
import { FEATURES } from './aiprices.mjs';
// Chat Completions (prompt/completion tokens) and the Responses API (input/output tokens) report usage differently;
// reasoning tokens are already inside the output count (and billed as output)
export function tokensOf(u) {
  if (!u || typeof u !== 'object') return null;
  const n = v => Number.isFinite(+v) && +v > 0 ? Math.round(+v) : 0;
  const input = n(u.prompt_tokens ?? u.input_tokens), output = n(u.completion_tokens ?? u.output_tokens);
  const cached = Math.min(input, n((u.prompt_tokens_details || u.input_tokens_details)?.cached_tokens));
  const reasoning = Math.min(output, n((u.completion_tokens_details || u.output_tokens_details)?.reasoning_tokens));
  return input || output ? { input, cached, output, reasoning } : null;
}
export const dayOf = (t = Date.now()) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); // YYYY-MM-DD

let db0;
export async function recordUsage(model, usage, feature = 'other', env = process.env) {
  const t = tokensOf(usage); if (!t || !model) return false;
  try {
    const db = db0 === undefined ? (db0 = supa(env)) : db0; if (!db || db.via !== 'key') return false;
    await db.rpc('ai_usage_add', { p_day: dayOf(), p_model: String(model).slice(0, 80), p_feature: FEATURES[feature] ? feature : 'other', p_in: t.input, p_cached: t.cached, p_out: t.output, p_reasoning: t.reasoning }, { deadline: Date.now() + 2500 });
    return true;
  } catch (e) { console.warn('ai usage not recorded:', e.message); return false; }
}

