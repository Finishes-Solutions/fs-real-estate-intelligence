// lib/openai.mjs: retries without reasoning_effort when a model rejects it.
import assert from 'node:assert/strict';
const bodies = [];
globalThis.fetch = async (url, opts) => { const b = JSON.parse(opts.body); bodies.push(b);
  if (b.reasoning_effort) return new Response(JSON.stringify({ error: { message: "Unsupported parameter: 'reasoning_effort'" } }), { status: 400 });
  return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }); };
const { chatText } = await import('../lib/openai.mjs');
assert.equal(await chatText({ key: 'k', model: 'm', system: 's', user: 'u' }), 'ok');
assert.equal(bodies.length, 2); assert.equal(bodies[0].reasoning_effort, 'high'); assert.equal(bodies[1].reasoning_effort, undefined);
// xhigh (Ultra's planning) on a model that only goes to high: one step down, not straight to none
{ const seen = []; globalThis.fetch = async (url, opts) => { const b = JSON.parse(opts.body); seen.push(b.reasoning_effort);
    if (b.reasoning_effort === 'xhigh') return new Response(JSON.stringify({ error: { message: "Unsupported value: 'reasoning_effort' does not support 'xhigh' with this model." } }), { status: 400 });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"a":1}' } }] }), { status: 200 }); };
  const { chatJSON } = await import('../lib/openai.mjs');
  const r = await chatJSON({ key: 'k', model: 'm', system: 's', user: 'u', name: 'n', schema: { type: 'object' }, effort: 'xhigh' });
  assert.deepEqual(r.data, { a: 1 }); assert.deepEqual(seen, ['xhigh', 'high'], 'xhigh → high'); }
console.log('openai client tests passed');
