// Site plans on Claude (Settings › AI model › Site plans): the request carries provider 'anthropic', api/siteplan.js
// answers through lib/anthropic.mjs claudeJSON, and the schemas past Claude's structured-output limits go in the
// instructions instead. A fake Anthropic client and a fake OpenAI (fetch); no network.
import assert from 'node:assert/strict';
import * as AN from '../lib/anthropic.mjs';
import * as A from '../lib/aimodels.mjs';
import { NOTES_SCHEMA } from '../lib/planset.mjs';

// ---- the browser's side: what a request carries ----
assert.deepEqual(A.siteplanAI('', '', ''), {}, 'nothing picked: the server’s OpenAI default');
assert.deepEqual(A.siteplanAI('', 'claude-opus-5-5', 'gpt-5-mini'), { model: 'gpt-5-mini' }, 'OpenAI: the model picked above');
assert.deepEqual(A.siteplanAI('anthropic', '', 'gpt-5-mini'), { provider: 'anthropic' }, 'Claude, the server’s Claude model');
assert.deepEqual(A.siteplanAI('anthropic', 'claude-sonnet-5-5', 'gpt-5-mini'), { provider: 'anthropic', model: 'claude-sonnet-5-5' });
assert.deepEqual(A.siteplanAI('anthropic', 'gpt-5', ''), { provider: 'anthropic' }, 'never an OpenAI id sent as the Claude model');
assert.equal(A.pickedProvider('openai'), ''); assert.equal(A.pickedProvider('anthropic'), 'anthropic'); assert.equal(A.pickedProvider(null), '');

// ---- which schemas fit Claude's structured output, and reading an answer given as text ----
const { SCHEMA, REVIEW_SCHEMA, EDIT_SCHEMA, STRATEGY_SCHEMA, NAMES_SCHEMA, default: handler } = await import('../api/siteplan.js');
assert.equal(AN.fitsStrict(NOTES_SCHEMA), true, 'plan set notes stay strict');
assert.equal(AN.fitsStrict(STRATEGY_SCHEMA), true); assert.equal(AN.fitsStrict(NAMES_SCHEMA), true);
for (const s of [SCHEMA, REVIEW_SCHEMA, EDIT_SCHEMA]) assert.equal(AN.fitsStrict(s), false, 'past 16 nullable fields: the schema goes in the instructions');
assert.deepEqual(AN.schemaLoad({ type: 'object', required: ['a'], properties: { a: { type: ['string', 'null'] }, b: { type: 'string' }, c: { type: 'array', items: { type: 'object', required: [], properties: { d: { anyOf: [{ type: 'string' }, { type: 'null' }] } } } } } }), { unions: 2, optional: 3 });
const filled = AN.conform(SCHEMA, { use: 'retail', storage: { climateSf: 0 }, zones: [{ use: 'retail' }] });
assert.equal(filled.use, 'retail'); assert.equal(filled.gfa, null, 'a nullable field left out: null'); assert.deepEqual(filled.extras, [], 'a list left out: empty');
assert.deepEqual(filled.storage, { climateSf: 0, driveSf: null, rv: null }, 'nested objects filled'); assert.deepEqual(filled.setbacks, { front: null, side: null, rear: null, paving: null }, 'a missing object: all null');
assert.equal(filled.zones[0].placement.where, null, 'list items filled too'); assert.deepEqual(filled.zones[0].items, []);
assert.equal('summary' in filled, false, 'a required string can’t be made up: left out (the callers clean it)');
assert.deepEqual(AN.jsonIn('```json\n{"a":1}\n```'), { a: 1 }); assert.deepEqual(AN.jsonIn('Here it is: {"a":{"b":2}} done'), { a: { b: 2 } }); assert.throws(() => AN.jsonIn('no json'));

// ---- api/siteplan.js with provider 'anthropic' ----
const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
let ip = 0; const call = async body => { const res = mock(); await handler({ method: 'POST', body, headers: { 'x-forwarded-for': '9.9.1.' + (++ip) } }, res); return res; };
let sent = [], replies = [], openai = [];
const msg = (data, o = {}) => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data) }], usage: { input_tokens: 10, output_tokens: 20 }, ...o });
const fake = { models: { list: () => (async function* () { yield { id: 'claude-opus-5-5' }; yield { id: 'claude-sonnet-5-5' }; })() },
  beta: { messages: { stream: p => { sent.push(p); return { finalMessage: async () => { const r = replies.shift(); if (r instanceof Error) throw r; return r; } }; } } } };
const PROGRAM = { use: 'multifamily', units: 120, floors: 3, perUnit: 1.5, detentionPct: 8, setbacks: { front: 25, side: null, rear: 15, paving: null }, summary: 'Three-story garden apartments.', assumptions: ['1.5 spaces per unit'] };
globalThis.fetch = async (url, opts = {}) => { // OpenAI, for the fallbacks
  const u = String(url); if (u.includes('/models/')) return Response.json({ id: 'gpt-6-luna' }); if (u.endsWith('/models')) return Response.json({ data: [] });
  openai.push(JSON.parse(opts.body)); return Response.json({ model: 'gpt-6-luna', choices: [{ message: { content: JSON.stringify({ ...AN.conform(SCHEMA, PROGRAM), summary: 'From OpenAI.', assumptions: [] }) } }] });
};
process.env.OPENAI_API_KEY = 'sk-test'; process.env.ANTHROPIC_API_KEY = 'ak-test'; delete process.env.ANTHROPIC_MODEL; AN._setClient(fake, 'ak-test');

// the program: Claude Opus 5.5 by default, the big schema in the system prompt, the answer topped up and cleaned as before
replies = [msg('```json\n' + JSON.stringify(PROGRAM) + '\n```')];
let res = await call({ prompt: '120 apartments', site: { acres: 3.1, widthFt: 380 }, provider: 'anthropic' });
assert.equal(res.code, 200, JSON.stringify(res.body)); assert.equal(res.headers['X-AI-Model'], 'claude-opus-5-5', 'the default Claude model, said in the header');
assert.equal(sent.length, 1); assert.equal(openai.length, 0, 'OpenAI wasn’t asked');
let p = sent[0]; assert.equal(p.model, 'claude-opus-5-5'); assert.equal(p.output_config.effort, 'high'); assert.equal(p.output_config.format, undefined, 'no structured output for a schema this big');
assert.match(p.system[0].text, /matching this JSON schema exactly/); assert.ok(p.system[0].text.includes('"detentionPct"'), 'the schema is in the instructions'); assert.deepEqual(p.system[0].cache_control, { type: 'ephemeral' });
assert.equal(p.max_tokens, 32000, 'twice the room OpenAI gets (thinking shares it)'); assert.deepEqual(p.thinking, { type: 'adaptive' });
assert.equal(res.body.program.use, 'multifamily'); assert.equal(res.body.program.units, 120); assert.deepEqual(res.body.setbacks, { front: 25, side: 10, rear: 15, paving: 10 }); assert.match(res.body.summary, /garden apartments/);

// a Claude model picked on the device and the effort picked under Build; one the key doesn't have: the default
sent = []; replies = [msg(PROGRAM)];
res = await call({ prompt: '120 apartments', site: { acres: 3.1 }, provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'medium' });
assert.equal(sent[0].model, 'claude-sonnet-5-5'); assert.equal(sent[0].output_config.effort, 'medium'); assert.equal(res.headers['X-AI-Model'], 'claude-sonnet-5-5');
sent = []; replies = [msg(PROGRAM)]; await call({ prompt: '120 apartments', site: { acres: 3.1 }, provider: 'anthropic', model: 'claude-made-up-9' });
assert.equal(sent[0].model, 'claude-opus-5-5');

// a schema that fits goes as structured output (strategy); a cut-off answer is asked again with more room, a notch lower
sent = []; const STRAT = { strategies: [{ name: 'Front retail', concept: 'Shops on the highway, homes behind.' }], pick: 0, why: 'Visibility.' };
replies = [msg('{"strategies":[', { stop_reason: 'max_tokens' }), msg(STRAT)];
res = await call({ mode: 'strategy', prompt: 'retail and homes', site: { acres: 12 }, provider: 'anthropic', effort: 'xhigh' });
assert.equal(res.code, 200, JSON.stringify(res.body)); assert.equal(res.body.strategies[0].name, 'Front retail');
assert.equal(sent.length, 2, 'asked again once'); assert.equal(sent[0].output_config.format.type, 'json_schema', 'strict structured output');
assert.equal(sent[0].max_tokens, 40000); assert.equal(sent[1].max_tokens, 60000); assert.equal(sent[1].output_config.effort, 'high', 'xhigh steps down to high');

// a strict schema Claude can't compile after all: asked again with the schema in the instructions
sent = []; replies = [Object.assign(new Error('400 Schema is too complex for compilation.'), { status: 400 }), msg(STRAT)];
res = await call({ mode: 'strategy', prompt: 'retail and homes', site: { acres: 12 }, provider: 'anthropic' });
assert.equal(res.code, 200); assert.equal(sent.length, 2); assert.equal(sent[1].output_config.format, undefined); assert.equal(sent[1].output_config.effort, 'high'); assert.match(sent[1].system[0].text, /JSON schema exactly/);

// the review sees the drawings as image blocks
sent = []; replies = [msg({ reviews: [], ranking: [], revise: false, program: null, params: null, why: '', summary: 'Option A works best.' })];
const png = 'data:image/png;base64,' + 'A'.repeat(200);
res = await call({ mode: 'review', prompt: '120 apartments', site: { acres: 3.1 }, provider: 'anthropic', options: [{ name: 'A', metrics: { units: 120 }, image: png }, { name: 'B', metrics: { units: 110 } }] });
const imgs = sent[0]?.messages[0].content.filter?.(c => c.type === 'image') || [];
assert.equal(imgs.length, 1, 'one drawing sent'); assert.deepEqual(imgs[0].source, { type: 'base64', media_type: 'image/png', data: 'A'.repeat(200) });

// Claude turning the call away as malformed: OpenAI's default answers, and says so
sent = []; openai = []; replies = [Object.assign(new Error('400 messages: something unsupported'), { status: 400 })];
res = await call({ prompt: '120 apartments', site: { acres: 3.1 }, provider: 'anthropic' });
assert.equal(res.code, 200); assert.equal(openai.length, 1); assert.equal(res.headers['X-AI-Model'], 'gpt-6-luna'); assert.match(res.body.summary, /From OpenAI/);
// a rate limit isn't papered over
sent = []; openai = []; replies = [Object.assign(new Error('429 rate limited'), { status: 429 })];
res = await call({ prompt: '120 apartments', site: { acres: 3.1 }, provider: 'anthropic' });
assert.equal(openai.length, 0, 'not sent to OpenAI'); assert.notEqual(res.code, 200);

// no Claude key on the server: OpenAI answers; and without provider, Claude is never asked
delete process.env.ANTHROPIC_API_KEY; sent = []; openai = [];
res = await call({ prompt: '120 apartments', site: { acres: 3.1 }, provider: 'anthropic', model: 'claude-opus-5-5' });
assert.equal(res.code, 200); assert.equal(sent.length, 0); assert.equal(openai.length, 1); assert.equal(openai[0].model, 'gpt-6-luna', 'the Claude id isn’t passed to OpenAI');
process.env.ANTHROPIC_API_KEY = 'ak-test'; openai = [];
res = await call({ prompt: '120 apartments', site: { acres: 3.1 } }); assert.equal(sent.length, 0); assert.equal(openai.length, 1, 'OpenAI unless Claude is picked');

console.log('site plans on Claude ok');
