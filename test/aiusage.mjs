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
const A2 = await import('../api/aiusage.js'), handler = A2.default;
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
// billed: only this app's key (OPENAI_API_KEY), found among the organization's projects by its redacted form; never the
// rest of the organization
assert.ok(A2.sameKey('sk-proj-abc…wxyz', 'sk-proj-abcDEF123wxyz') && A2.sameKey('sk-...wxyz', 'sk-anything-wxyz') && !A2.sameKey('sk-proj-abc…wxyz', 'sk-proj-abcDEF123wxyA') && !A2.sameKey('sk-…yz', 'sk-ayz'), 'redacted keys: start and end must match (4+ characters at the end)');
const org = { projects: [{ id: 'proj_A', name: 'Estimating tools' }, { id: 'proj_B', name: 'Real Estate Intelligence' }, { id: 'proj_C', name: 'Old', status: 'archived' }],
  keys: { proj_A: [{ id: 'key_1', name: 'estimator', redacted_value: 'sk-proj-zzz…aaaa' }], proj_B: [{ id: 'key_2', name: 'RE intelligence', redacted_value: 'sk-proj-abc…wxyz' }, { id: 'key_3', name: 'intern', redacted_value: 'sk-proj-qqq…bbbb' }, { id: 'key_4', name: 'ci', redacted_value: 'sk-proj-rrr…cccc' }] } };
const calls = []; let perKeyCosts = true;
const orgFetch = async (url, opts = {}) => { url = String(url); calls.push(url);
  if (url.startsWith('https://db.example/rest/v1/ai_usage')) return Response.json(rows);
  assert.equal(opts.headers.Authorization, 'Bearer admin-key', 'the admin key, never the app key, for the organization API');
  const u = new URL(url), path = u.pathname.replace('/v1/organization', '');
  if (path === '/projects') return Response.json({ data: org.projects, has_more: false });
  const mk = path.match(/^\/projects\/(\w+)\/api_keys$/); if (mk) return Response.json({ data: org.keys[mk[1]] || [], has_more: false });
  if (path === '/costs') { assert.equal(u.searchParams.get('project_ids'), 'proj_B', 'costs always limited to the app’s project');
    if (u.searchParams.get('api_key_ids')) { if (!perKeyCosts) return Response.json({ error: { message: 'Unknown parameter: api_key_ids' } }, { status: 400 }); assert.equal(u.searchParams.get('api_key_ids'), 'key_2');
      return Response.json({ data: [{ results: [{ amount: { value: 3.1, currency: 'usd' }, line_item: 'gpt-6-astra, output' }, { amount: { value: 0.31, currency: 'usd' }, line_item: 'gpt-6-astra-2026-09-01, input' }, { amount: { value: 0.5, currency: 'usd' }, line_item: 'gpt-realtime, input' }] }], has_more: false }); }
    return Response.json({ data: [{ results: [{ amount: { value: 9.75, currency: 'usd' }, line_item: 'gpt-6-astra, output' }, { amount: { value: 1.2, currency: 'usd' }, line_item: 'gpt-5-mini, input' }] }], has_more: false }); }
  if (path === '/usage/completions') { assert.equal(u.searchParams.get('api_key_ids'), 'key_2'); assert.equal(u.searchParams.get('project_ids'), 'proj_B');
    return Response.json({ data: [{ results: [{ model: 'gpt-6-astra-2026-09-01', num_model_requests: 6, input_tokens: 40000, input_cached_tokens: 10000, output_tokens: 70000 }, { model: 'gpt-6-luna', num_model_requests: 30, input_tokens: 200000, input_cached_tokens: 0, output_tokens: 30000 }] }], has_more: false }); }
  throw new Error('unexpected ' + url); };
process.env.OPENAI_ADMIN_KEY = 'admin-key'; process.env.OPENAI_API_KEY = 'sk-proj-abcDEF123wxyz'; globalThis.fetch = orgFetch;
res = mock(); await handler({ method: 'GET', query: { from: '2026-10-01', to: '2026-10-31' }, headers: { 'x-forwarded-for': '5.5.5.3' } }, res);
assert.equal(res.code, 200, JSON.stringify(res.body)); const bk = res.body.billed;
assert.equal(bk.scope, 'key'); assert.deepEqual([bk.project.name, bk.project.keys, bk.key.id, bk.key.name], ['Real Estate Intelligence', 3, 'key_2', 'RE intelligence'], 'the app’s key found in its project');
assert.ok(Math.abs(bk.total - 3.91) < 1e-9); assert.deepEqual(bk.byModel.map(x => [x.model, +x.amount.toFixed(2)]), [['gpt-6-astra', 3.41], ['gpt-realtime', 0.5]]);
assert.ok(calls.filter(c => c.includes('/costs')).every(c => /project_ids=proj_B/.test(c)), 'no organization-wide costs call');
// OpenAI won't split costs by key: the project's costs, said as such, and this key's own tokens from OpenAI to price
perKeyCosts = false; calls.length = 0;
res = mock(); await handler({ method: 'GET', query: { from: '2026-10-01', to: '2026-10-31' }, headers: { 'x-forwarded-for': '5.5.5.6' } }, res); const bp = res.body.billed;
assert.equal(bp.scope, 'project'); assert.ok(Math.abs(bp.total - 10.95) < 1e-9); assert.equal(bp.project.keys, 3);
assert.deepEqual(bp.keyTokens, [{ model: 'gpt-6-astra', requests: 6, input: 40000, cached: 10000, output: 70000 }, { model: 'gpt-6-luna', requests: 30, input: 200000, cached: 0, output: 30000 }], 'this key alone, by model');
assert.equal(calls.filter(c => c.includes('/projects')).length, 0, 'the key’s project is remembered (an hour)');
// a key that isn't in any project: nothing billed shown (never the organization), and the counts still come back
process.env.OPENAI_API_KEY = 'sk-proj-nope000000000'; calls.length = 0;
res = mock(); await handler({ method: 'GET', query: {}, headers: { 'x-forwarded-for': '5.5.5.7' } }, res);
assert.equal(res.body.billed, null); assert.match(res.body.billedError, /wasn’t found/); assert.equal(res.body.rows.length, 4); assert.ok(!calls.some(c => c.includes('/costs')), 'no costs asked for at all');
globalThis.fetch = async url => String(url).includes('organization') ? Response.json({ error: { message: 'no' } }, { status: 403 }) : Response.json(rows); process.env.OPENAI_API_KEY = 'sk-proj-other11111111';
res = mock(); await handler({ method: 'GET', query: {}, headers: { 'x-forwarded-for': '5.5.5.4' } }, res); assert.equal(res.body.billed, null); assert.match(res.body.billedError, /refused the admin key/); assert.equal(res.body.rows.length, 4, 'the counts still come back');
globalThis.fetch = async () => new Response('{"code":"42P01","message":"relation \\"public.ai_usage\\" does not exist"}', { status: 404 }); delete process.env.OPENAI_ADMIN_KEY;
res = mock(); await handler({ method: 'GET', query: {}, headers: { 'x-forwarded-for': '5.5.5.5' } }, res); assert.equal(res.body.tracking, false); assert.match(res.body.trackError, /isn’t set up/);
console.log('ai usage ok');
