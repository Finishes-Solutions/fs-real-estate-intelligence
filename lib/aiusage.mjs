// AI usage, recorded: every OpenAI answer's token counts, added up by day (US Central), model and feature in Supabase
// (ai_usage, supabase/migrations/20261022000000_ai_usage.sql). Server only; the sums and costs Settings shows are in
// lib/aiprices.mjs. Recording never fails a request: no database, a missing table or a slow write just leaves that
// request uncounted.
import { supa } from './supa.mjs';
import { FEATURES, costOf } from './aiprices.mjs';
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


// What a feature has cost this calendar month (US Central, the same days as the rows) at list prices: Renderings checks
// it against its monthly cap (api/render). A model with no known price is counted at a flat, deliberately high figure a
// request (RENDER_FALLBACK_USD_PER_IMAGE, $0.25 by default) and priced is false, so the panel can say "about".
// No database or a failed read gives spent: null and an error: the caller lets the work go ahead (fail open).
export const fallbackPerImage = (env = process.env) => { const v = parseFloat(env.RENDER_FALLBACK_USD_PER_IMAGE); return Number.isFinite(v) && v >= 0 ? v : 0.25; };
export async function monthSpend(feature, { env = process.env, now = Date.now(), prices = {}, deadline } = {}) {
  const today = dayOf(now), month = today.slice(0, 7), out = { month, spent: null, images: 0, priced: true };
  const db = supa(env); if (!db || db.via !== 'key') return { ...out, error: 'usage isn’t tracked on this deployment' };
  try {
    const rows = await db.select('ai_usage', 'select=model,requests,input_tokens,cached_tokens,output_tokens&feature=eq.' + encodeURIComponent(feature) + '&day=gte.' + month + '-01&day=lte.' + today, { deadline: deadline || Date.now() + 3000 });
    let spent = 0, images = 0, priced = true; const flat = fallbackPerImage(env);
    for (const r of rows || []) {
      const n = +r.requests || 0, c = costOf(r.model, { input: +r.input_tokens || 0, cached: +r.cached_tokens || 0, output: +r.output_tokens || 0 }, prices);
      images += n; if (c == null) { priced = false; spent += n * flat; } else spent += c;
    }
    return { month, spent: Math.round(spent * 1e4) / 1e4, images, priced };
  } catch (e) { console.warn('month spend not read:', e.message); return { ...out, error: e.message }; }
}
