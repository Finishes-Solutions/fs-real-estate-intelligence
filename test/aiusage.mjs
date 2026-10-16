// AI usage and cost (Settings › AI model › Usage): token counts from OpenAI's answers (lib/aiusage.mjs), recorded by
// day, model and feature through ai_usage_add; the sums and list-price costs (lib/aiprices.mjs); and api/aiusage,
// which returns the counts and, with an OpenAI admin key, what OpenAI billed by model.
import assert from 'node:assert/strict';
process.env.SUPABASE_URL = 'https://db.example'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_test'; process.env.OPENAI_API_KEY = 'test-key';
const U = await import('../lib/aiusage.mjs'), P = await import('../lib/aiprices.mjs');

// ---- token counts: Chat Completions and the Responses API ----
assert.deepEqual(U.tokensOf({ prompt_tokens: 12000, completion_tokens: 30000, prompt_tokens_details: { cached_tokens: 2000 }, completion_tokens_details: { reasoning_tokens: 25000 } }), { input: 12000, cached: 2000, output: 30000, reasoning: 25000 });
assert.deepEqual(U.tokensOf({ input_tokens: 900, output_tokens: 300, input_tokens_details: { cached_tokens: 5000 }, output_tokens_details: { reasoning_tokens: 9999 } }), { input: 900, cached: 900, output: 300, reasoning: 300 }, 'cached and reasoning never exceed their totals');
assert.equal(U.tokensOf(null), null); assert.equal(U.tokensOf({}), null);
assert.match(U.dayOf(Date.parse('2026-10-16T03:00:00Z')), /^2026-10-15$/, 'days are US Central (9 pm on the 15th)');

// ---- prices and costs ----
for (const [m, p] of Object.entries(P.PRICES)) assert.ok(p.slice(0, 3).every(v => v == null || (Number.isFinite(v) && v >= 0)) && p[0] != null && p[2] != null, m + ': a price');
assert.deepEqual(P.priceOf('gpt-6-astra'), [10, 1, 50]); assert.deepEqual(P.priceOf('gpt-4o-2024-08-06'), [2.5, 1.25, 10], 'a dated snapshot prices as its model');
assert.equal(P.priceOf('gpt-5.2'), null, 'no listed price: unknown'); assert.deepEqual(P.priceOf('gpt-5.2', { 'gpt-5.2': [1.75, '', 14] }), [1.75, null, 14], 'set in Settings');
assert.ok(P.checkPrice('gpt-6-luna') && !P.checkPrice('gpt-6-astra'));
// an Ultra build on gpt-6-astra: 35,000 in (5,000 cached), 60,000 out → 30,000 × $10 + 5,000 × $1 + 60,000 × $50 per 1M
assert.ok(Math.abs(P.costOf('gpt-6-astra', { input: 35000, cached: 5000, output: 60000 }) - (0.3 + 0.005 + 3)) < 1e-9);
assert.ok(Math.abs(P.costOf('gpt-6-luna', { input: 35000, cached: 5000, output: 60000 }) - (0.0035 + 0.03)) < 1e-9, 'Luna: cached input at the input price (none listed)');
const rows = [{ day: '2026-10-16', model: 'gpt-6-astra', feature: 'siteplan', requests: 5, input_tokens: 35000, cached_tokens: 5000, output_tokens: 60000, reasoning_tokens: 48000 },
  { day: '2026-10-16', model: 'gpt-6-luna', feature: 'chat', requests: 3, input_tokens: 9000, cached_tokens: 0, output_tokens: 1500, reasoning_tokens: 0 },
  { day: '2026-10-17', model: 'gpt-6-luna', feature: 'siteplan', requests: 4, input_tokens: 20000, cached_tokens: 0, output_tokens: 8000, reasoning_tokens: 6000 },
  { day: '2026-10-17', model: 'gpt-5.2', feature: 'brief', requests: 1, input_tokens: 4000, cached_tokens: 0, output_tokens: 900, reasoning_tokens: 0 }];
const S = P.summarize(rows);
assert.deepEqual(S.byModel.map(r => [r.key, r.requests, r.input, r.output]), [['gpt-6-astra', 5, 35000, 60000], ['gpt-6-luna', 7, 29000, 9500], ['gpt-5.2', 1, 4000, 900]], 'by model, dearest first');
assert.equal(S.byModel.find(r => r.key === 'gpt-5.2').cost, null, 'no price: no cost, not $0');
assert.equal(S.total.requests, 13); assert.equal(S.total.reasoning, 54000);
assert.deepEqual(S.byFeature.map(f => f.label), ['Site plans', 'Ask AI', 'Filing briefs']);
assert.ok(P.summarize(rows, { 'gpt-5.2': [2, 0.2, 10] }).byModel.find(r => r.key === 'gpt-5.2').cost > 0, 'a price set in Settings fills it in');
assert.deepEqual(P.summarize([]).byModel, []);

// ---- recording: each answer adds to the day's row; a failed write never fails the answer ----
const rpc = []; let fail = false;
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.startsWith('https://db.example/rest/v1/rpc/ai_usage_add')) { if (fail) return new Response('{"message":"relation \\"ai_usage\\" does not exist"}', { status: 404 }); rpc.push(JSON.parse(opts.body)); return new Response(null, { status: 204 }); }
  if (url.includes('/models/')) return Response.json({ id: 'gpt-6-astra' });
  if (url.endsWith('/chat/completions')) { const b = JSON.parse(opts.body); return Response.json({ model: b.model, choices: [{ message: { content: '{"ok":1}' } }], usage: { prompt_tokens: 1200, completion_tokens: 4000, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 3500 } } }); }
  throw new Error('unexpected ' + url);
};
const O = await import('../lib/openai.mjs');
await O.chatJSON({ key: 'k', model: 'gpt-6-astra', system: 's', user: 'u', name: 'n', schema: { type: 'object' }, feature: 'siteplan' });
assert.equal(rpc.length, 1); assert.deepEqual({ ...rpc[0], p_day: 'd' }, { p_day: 'd', p_model: 'gpt-6-astra', p_feature: 'siteplan', p_in: 1200, p_cached: 0, p_out: 4000, p_reasoning: 3500 });
await O.chatText({ key: 'k', model: 'gpt-6-luna', system: 's', user: 'u', feature: 'nonsense' }); assert.equal(rpc[1].p_feature, 'other', 'an unknown feature: other');
fail = true; const r = await O.chatJSON({ key: 'k', model: 'gpt-6-astra', system: 's', user: 'u', name: 'n', schema: { type: 'object' }, feature: 'siteplan' }); assert.deepEqual(r.data, { ok: 1 }, 'no table yet: the answer still comes back'); fail = false;

// ---- api/aiusage: the counts for the days asked, and the billed amounts with an admin key ----
const { default: handler, billed } = await import('../api/aiusage.js');
const mock = () => { const x = { code: 200, headers: {}, status(c) { x.code = c; return x; }, json(o) { x.body = o; return x; }, setHeader(k, v) { x.headers[k] = v; } }; return x; };
let asked = '';
globalThis.fetch = async (url, opts = {}) => { url = String(url);
  if (url.startsWith('https://db.example/rest/v1/ai_usage')) { asked = url; return Response.json(rows); }
  if (url.startsWith('https://api.openai.com/v1/organization/costs')) { assert.equal(opts.headers.Authorization, 'Bearer admin-key'); const page2 = url.includes('page=p2');
    return Response.json({ data: [{ results: page2 ? [{ amount: { value: 0.5, currency: 'usd' }, line_item: 'gpt-realtime, input' }] : [{ amount: { value: 3.1, currency: 'usd' }, line_item: 'gpt-6-astra, output' }, { amount: { value: 0.31, currency: 'usd' }, line_item: 'gpt-6-astra-2026-09-01, input' }, { amount: { value: 0.02, currency: 'usd' }, line_item: 'gpt-6-luna, input' }] }], has_more: !page2, next_page: page2 ? null : 'p2' }); }
  throw new Error('unexpected ' + url); };
let res = mock(); await handler({ method: 'GET', query: { from: '2026-10-01', to: '2026-10-31' }, headers: { 'x-forwarded-for': '5.5.5.1' } }, res);
assert.equal(res.code, 200); assert.equal(res.body.tracking, true); assert.equal(res.body.rows.length, 4); assert.match(asked, /day=gte\.2026-10-01&day=lte\.2026-10-31/); assert.equal(res.body.billed, null, 'no admin key: no billed amounts'); assert.equal(res.body.admin, false);
res = mock(); await handler({ method: 'GET', query: { from: 'yesterday', to: '2026-10-31' }, headers: { 'x-forwarded-for': '5.5.5.2' } }, res); assert.equal(res.body.from, '2026-10-01', 'a bad date: the start of that month');
process.env.OPENAI_ADMIN_KEY = 'admin-key';
res = mock(); await handler({ method: 'GET', query: { from: '2026-10-01', to: '2026-10-31' }, headers: { 'x-forwarded-for': '5.5.5.3' } }, res);
assert.ok(Math.abs(res.body.billed.total - 3.93) < 1e-9); assert.deepEqual(res.body.billed.byModel.map(x => [x.model, +x.amount.toFixed(2)]), [['gpt-6-astra', 3.41], ['gpt-realtime', 0.5], ['gpt-6-luna', 0.02]], 'by model, snapshots folded in, every page');
globalThis.fetch = async url => String(url).includes('organization') ? Response.json({ error: { message: 'no' } }, { status: 403 }) : Response.json(rows);
res = mock(); await handler({ method: 'GET', query: {}, headers: { 'x-forwarded-for': '5.5.5.4' } }, res); assert.equal(res.body.billed, null); assert.match(res.body.billedError, /refused the admin key/); assert.equal(res.body.rows.length, 4, 'the counts still come back');
globalThis.fetch = async () => new Response('{"code":"42P01","message":"relation \\"public.ai_usage\\" does not exist"}', { status: 404 }); delete process.env.OPENAI_ADMIN_KEY;
res = mock(); await handler({ method: 'GET', query: {}, headers: { 'x-forwarded-for': '5.5.5.5' } }, res); assert.equal(res.body.tracking, false); assert.match(res.body.trackError, /isn’t set up/);
console.log('ai usage ok');
