// What the AI costs: OpenAI's list prices per model (Standard tier, USD per 1M tokens: input, cached input, output) and
// the sums Settings › AI model › Usage shows from the recorded usage (lib/aiusage.mjs): requests, tokens and cost by
// model and by feature. No DOM and no network: used by the browser and tested in Node.
// The prices are an estimate: OpenAI publishes them on its pricing page, which this server can't read, so they were
// taken from public price listings on PRICES_AS_OF. Where those listings disagreed (marked check) the figure may be
// off; Settings lets each one be corrected, and an OpenAI admin key gives the billed amounts instead (api/aiusage).
export const PRICES_AS_OF = '2026-10-15';
export const PRICES = {
  'gpt-6-astra': [10, 1, 50], 'gpt-6.1-sol': [2, 0.1, 10, 'check'], 'gpt-6-sol': [2, 0.2, 10, 'check'], 'gpt-6-luna': [0.1, null, 0.5, 'check'],
  'gpt-5.6-sol': [4, null, 20, 'check'], 'gpt-5.6-terra': [2, null, 12, 'check'], 'gpt-5.6-luna': [0.2, null, 1.2, 'check'],
  'gpt-5.5': [5, 0.5, 30], 'gpt-5.4': [2.5, 0.25, 15], 'gpt-5.4-mini': [0.75, 0.075, 4.5], 'gpt-5.4-nano': [0.2, 0.02, 1.25],
  'gpt-5.1': [1.25, 0.125, 10], 'gpt-5': [1.25, 0.125, 10], 'gpt-5-mini': [0.25, 0.025, 2], 'gpt-5-nano': [0.05, 0.005, 0.4],
  'gpt-4.1': [2, 0.5, 8], 'gpt-4.1-mini': [0.4, 0.1, 1.6], 'gpt-4.1-nano': [0.1, 0.025, 0.4], 'gpt-4o': [2.5, 1.25, 10], 'gpt-4o-mini': [0.15, 0.075, 0.6],
  'gpt-image-1': [10, 2.5, 40], 'gpt-image-1-mini': [2.5, 0.625, 8, 'check'], 'gpt-image-1.5': [8, 2, 32, 'check'], 'gpt-image-2.5-sunburst': [8, 2, 32, 'check'], 'gpt-image-2': [8, 2, 32, 'check'],
  'o1': [15, 7.5, 60], 'o3': [2, 0.5, 8], 'o3-mini': [1.1, 0.55, 4.4], 'o4-mini': [1.1, 0.275, 4.4]
};
export const FEATURES = { siteplan: 'Site plans', render: 'Renderings', chat: 'Ask AI', brief: 'Filing briefs', search: 'Place search', pipeline: 'Nightly data', other: 'Other' };
// a model's prices: the one set in Settings, else the list price (a dated snapshot, gpt-4o-2024-08-06, prices as its
// model); null when unknown. Cached input with no price of its own costs what input does.
export function priceOf(model, overrides = {}) {
  const o = overrides?.[model]; if (Array.isArray(o) && o.length >= 3 && [o[0], o[2]].every(v => Number.isFinite(+v) && +v >= 0)) return [+o[0], o[1] == null || o[1] === '' ? null : +o[1], +o[2]];
  const base = String(model || '').replace(/-\d{4}-\d{2}-\d{2}$/, ''), p = PRICES[model] || PRICES[base]; return p ? p.slice(0, 3) : null;
}
export const checkPrice = model => (PRICES[model] || PRICES[String(model || '').replace(/-\d{4}-\d{2}-\d{2}$/, '')])?.[3] === 'check';
// rows (day, model, feature, requests, input_tokens, ...) → by model and by feature, each with its cost at list prices.
// prices: per-model overrides ({ model: [input, cached, output] } per 1M tokens). A model with no known price has cost null.
export const costOf = (model, t, prices = {}) => {
  const p = priceOf(model, prices); if (!p) return null;
  const [inP, cachedP, outP] = p, cached = Math.min(t.cached || 0, t.input || 0);
  return ((t.input - cached) * inP + cached * (cachedP ?? inP) + t.output * outP) / 1e6;
};
export function summarize(rows, prices = {}) {
  const add = (m, k, r) => { const o = m.get(k) || { requests: 0, input: 0, cached: 0, output: 0, reasoning: 0, cost: 0, priced: true }; o.requests += +r.requests || 0; o.input += +r.input_tokens || 0; o.cached += +r.cached_tokens || 0; o.output += +r.output_tokens || 0; o.reasoning += +r.reasoning_tokens || 0;
    const c = costOf(r.model, { input: +r.input_tokens || 0, cached: +r.cached_tokens || 0, output: +r.output_tokens || 0 }, prices); if (c == null) o.priced = false; else o.cost += c; m.set(k, o); };
  const byModel = new Map(), byFeature = new Map(), total = new Map();
  for (const r of rows || []) { add(byModel, r.model, r); add(byFeature, r.feature, r); add(total, 'all', r); }
  const list = (m, label = k => k) => [...m].map(([k, o]) => ({ key: k, label: label(k), ...o, cost: o.priced ? o.cost : (o.cost || null) })).sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0) || b.output - a.output);
  const t = total.get('all') || { requests: 0, input: 0, cached: 0, output: 0, reasoning: 0, cost: 0, priced: true };
  return { byModel: list(byModel), byFeature: list(byFeature, k => FEATURES[k] || k), total: { ...t, cost: t.cost } };
}
