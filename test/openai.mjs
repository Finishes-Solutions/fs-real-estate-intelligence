// lib/openai.mjs: retries without reasoning_effort when a model rejects it.
import assert from 'node:assert/strict';
const bodies = [];
globalThis.fetch = async (url, opts) => { const b = JSON.parse(opts.body); bodies.push(b);
  if (b.reasoning_effort) return new Response(JSON.stringify({ error: { message: "Unsupported parameter: 'reasoning_effort'" } }), { status: 400 });
  return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }); };
const { chatText } = await import('../lib/openai.mjs');
assert.equal(await chatText({ key: 'k', model: 'm', system: 's', user: 'u' }), 'ok');
assert.equal(bodies.length, 2); assert.equal(bodies[0].reasoning_effort, 'high'); assert.equal(bodies[1].reasoning_effort, undefined);
console.log('openai client tests passed');
