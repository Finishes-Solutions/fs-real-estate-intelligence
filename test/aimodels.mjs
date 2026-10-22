// Settings › AI model: which models the picker offers (lib/aimodels.mjs) and how the server takes a picked model
// (lib/openai.mjs useModel: only a chat model the key can use, else the default; api/siteplan says which one answered).
import assert from 'node:assert/strict';
const A = await import('../lib/aimodels.mjs');

// ---- the catalog ----
assert.deepEqual(A.PROVIDERS.map(p => [p.id, p.on]), [['openai', true], ['anthropic', true]], 'both providers can be picked (per feature, Settings › AI model)');
const list = [{ id: 'gpt-6-luna', created: 300 }, { id: 'gpt-5-mini', created: 200 }, { id: 'gpt-4.1-mini', created: 100 }, { id: 'o4-mini', created: 250 }, { id: 'gpt-4o-2024-08-06', created: 90 },
  { id: 'gpt-4o-realtime-preview', created: 95 }, { id: 'gpt-4o-mini-tts', created: 80 }, { id: 'text-embedding-3-large', created: 70 }, { id: 'dall-e-3', created: 60 }, { id: 'whisper-1', created: 50 },
  { id: 'gpt-4o-search-preview', created: 40 }, { id: 'omni-moderation-latest', created: 30 }, { id: 'gpt-image-1', created: 20 }, { id: 'gpt-4o-transcribe', created: 10 }, { id: 'codex-mini-latest', created: 5 }];
assert.deepEqual(A.chatModels(list).map(m => m.id), ['gpt-6-luna', 'o4-mini', 'gpt-5-mini', 'gpt-4.1-mini'], 'chat models only, newest first: no speech, images, embeddings, search, moderation, code-only or dated snapshots');
assert.deepEqual(A.chatModels(null), []);
// the production key's list (Oct 16): the ones every feature works with, and not the -pro, -chat-latest, live or old ones
const prod = ['gpt-6.1-sol', 'gpt-6-luna', 'gpt-6-sol', 'gpt-live-1', 'gpt-6-astra', 'gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-5.5-pro', 'gpt-5.5', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.4', 'gpt-5.4-pro', 'gpt-5.3-chat-latest', 'gpt-5.2-chat-latest', 'gpt-5.2-pro', 'gpt-5.2', 'gpt-5.1', 'gpt-5.1-chat-latest', 'gpt-5-pro', 'gpt-5-nano', 'gpt-5-mini', 'gpt-5', 'gpt-5-chat-latest', 'o3-pro', 'gpt-4.1-nano', 'gpt-4.1-mini', 'gpt-4.1', 'o4-mini', 'o3', 'o1-pro', 'o3-mini', 'o1', 'gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo-16k', 'gpt-3.5-turbo'];
assert.deepEqual(A.chatModels(prod.map((id, i) => ({ id, created: 1000 - i }))).map(m => m.id), ['gpt-6.1-sol', 'gpt-6-luna', 'gpt-6-sol', 'gpt-6-astra', 'gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-5.5', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.4', 'gpt-5.2', 'gpt-5.1', 'gpt-5-nano', 'gpt-5-mini', 'gpt-5', 'gpt-4.1-nano', 'gpt-4.1-mini', 'gpt-4.1', 'o4-mini', 'o3', 'o3-mini', 'o1', 'gpt-4o-mini', 'gpt-4o']);
assert.equal(A.pickedModel('gpt-5.5-pro'), '', 'a -pro model picked before: the default');
assert.equal(A.providerOf('claude-opus-5-5'), 'anthropic'); assert.equal(A.providerOf('gpt-5-mini'), 'openai'); assert.equal(A.providerOf('llama-3'), null);
assert.equal(A.isChatModel('claude-opus-5-5'), false, 'an Anthropic model isn’t sent to OpenAI');
assert.equal(A.pickedModel(' gpt-5-mini '), 'gpt-5-mini'); assert.equal(A.pickedModel('rm -rf /'), ''); assert.equal(A.pickedModel(null), ''); assert.equal(A.pickedModel('gpt-4o-mini-tts'), '', 'a speech model: the default');

// ---- the server: a picked model is used only when the key has it ----
let modelsCalls = 0; const sent = [];
globalThis.fetch = async (url, opts = {}) => {
  if (String(url).endsWith('/models')) { modelsCalls++; return Response.json({ data: list }); }
  if (String(url).includes('/models/')) return Response.json({ id: 'gpt-6-luna' });
  const b = JSON.parse(opts.body); sent.push(b); return Response.json({ choices: [{ message: { content: JSON.stringify({ answer: 'ok', followups: [] }) } }] });
};
const O = await import('../lib/openai.mjs');
const def = async () => 'gpt-6-luna';
assert.equal(await O.useModel('k', 'gpt-5-mini', def), 'gpt-5-mini', 'a model the key has: used');
assert.equal(await O.useModel('k', 'gpt-9-ultra', def), 'gpt-6-luna', 'one it doesn’t: the default');
assert.equal(await O.useModel('k', 'whisper-1', def), 'gpt-6-luna', 'not a chat model: the default');
assert.equal(await O.useModel('k', null, def), 'gpt-6-luna', 'none picked: the default');
assert.equal(modelsCalls, 1, 'the model list is fetched once and kept');

// api/siteplan: the picked model goes to OpenAI and comes back in X-AI-Model
process.env.OPENAI_API_KEY = 'test-key'; delete process.env.OPENAI_MODEL;
const { default: handler } = await import('../api/siteplan.js');
const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
let ip = 0; const call = async body => { const res = mock(); await handler({ method: 'POST', body, headers: { 'x-forwarded-for': '9.9.9.' + (++ip) } }, res); return res; };
const facts = { request: 'retail', totals: { floorAreaSf: 25000 } };
let res = await call({ mode: 'ask', question: 'Why?', plan: facts, model: 'gpt-5-mini' });
assert.equal(res.code, 200, JSON.stringify(res.body)); assert.equal(sent.at(-1).model, 'gpt-5-mini'); assert.equal(res.headers['X-AI-Model'], 'gpt-5-mini', 'says which model answered');
res = await call({ mode: 'ask', question: 'Why?', plan: facts, model: 'claude-opus-5-5' }); assert.equal(sent.at(-1).model, 'gpt-6-luna', 'Anthropic not on yet: the default'); assert.equal(res.headers['X-AI-Model'], 'gpt-6-luna');
res = await call({ mode: 'ask', question: 'Why?', plan: facts }); assert.equal(sent.at(-1).model, 'gpt-6-luna');

// api/models: the picker's list
const { default: models } = await import('../api/models.js');
const mr = mock(); await models({ method: 'GET', headers: { 'x-forwarded-for': '9.9.8.1' } }, mr);
assert.equal(mr.code, 200); assert.equal(mr.body.default, 'gpt-6-luna'); assert.deepEqual(mr.body.models.map(m => m.id), ['gpt-6-luna', 'o4-mini', 'gpt-5-mini', 'gpt-4.1-mini']); assert.equal(mr.body.providers[1].on, true);
assert.deepEqual(mr.body.realtime, [], 'no live voice models in this list'); assert.equal(mr.body.defaults.siteplan, 'gpt-6-luna'); assert.equal(mr.body.defaults.search, 'gpt-5-mini', 'place search starts from its own list');
assert.equal(mr.body.defaults.voice, 'gpt-realtime-2.1', 'a voice model the key doesn’t list: the first of its own list');
// a picked model that can't serve the call (OpenAI 400): made again with the default, and the header says so
{ let tries = []; globalThis.fetch = async (url, opts = {}) => {
    if (String(url).endsWith('/models')) return Response.json({ data: list });
    if (String(url).includes('/models/')) return Response.json({ id: 'gpt-6-luna' });
    const b = JSON.parse(opts.body); tries.push(b.model);
    if (b.model === 'o4-mini') return Response.json({ error: { message: "This model doesn't support that input." } }, { status: 400 });
    return Response.json({ choices: [{ message: { content: JSON.stringify({ answer: 'ok', followups: [] }) } }] }); };
  const r = await call({ mode: 'ask', question: 'Why?', plan: facts, model: 'o4-mini' });
  assert.equal(r.code, 200, JSON.stringify(r.body)); assert.deepEqual(tries, ['o4-mini', 'gpt-6-luna'], 'tried, then the default'); assert.equal(r.headers['X-AI-Model'], 'gpt-6-luna');
  tries = []; globalThis.fetch = async (url, opts = {}) => { if (String(url).includes('/models')) return Response.json(String(url).endsWith('/models') ? { data: list } : { id: 'gpt-6-luna' }); tries.push(JSON.parse(opts.body).model); return Response.json({ error: { message: 'bad' } }, { status: 400 }); };
  const r2 = await call({ mode: 'ask', question: 'Why?', plan: facts }); assert.equal(r2.code, 502); assert.deepEqual(tries, ['gpt-6-luna'], 'the default failing isn’t tried twice'); }
console.log('ai models ok');
