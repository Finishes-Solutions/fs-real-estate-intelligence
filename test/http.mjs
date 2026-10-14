// Offline tests for lib/http.mjs (the browser's guarded JSON reader) and lib/supa.mjs time limits / retries.
import assert from 'node:assert/strict';
import { readJSON, fetchJSON, httpMessage } from '../lib/http.mjs';

// Vercel's own plain-text page when a function runs out of time: a readable message, not "Unexpected token 'A'"
const vercel = new Response('An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT\n\niad1::abc', { status: 504, headers: { 'content-type': 'text/plain' } });
await assert.rejects(readJSON(vercel), e => /took too long/.test(e.message) && e.status === 504);
await assert.rejects(readJSON(new Response('<html>Bad gateway</html>', { status: 502 })), /server had a problem \(502\)/);
await assert.rejects(readJSON(new Response('FUNCTION_PAYLOAD_TOO_LARGE', { status: 413 })), /too detailed/);
// our own JSON errors keep their message; good JSON comes back as is
await assert.rejects(readJSON(Response.json({ error: 'That area has no data.' }, { status: 400 })), /That area has no data\./);
await assert.rejects(readJSON(Response.json({}, { status: 500 })), /server had a problem \(500\)/);
assert.deepEqual(await readJSON(Response.json({ ok: 1 })), { ok: 1 });
assert.equal(await readJSON(new Response('', { status: 200 })), null);
// fetchJSON: network failure gets a plain message; an abort stays an abort (callers ignore those)
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
await assert.rejects(fetchJSON('api/x'), /Could not reach the server/);
globalThis.fetch = async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); };
await assert.rejects(fetchJSON('api/x'), e => e.name === 'AbortError');
globalThis.fetch = async () => Response.json({ a: 1 });
assert.deepEqual(await fetchJSON('api/x'), { a: 1 });
assert.match(httpMessage(429), /Too many/);
console.log('http tests passed');

// lib/supa.mjs: a statement timeout is not retried; a deadline stops retries; no deadline keeps the old patient retries
{ const { supa } = await import('../lib/supa.mjs'); let calls = 0, mode = 'stmt';
  globalThis.fetch = async (url, opts = {}) => { calls++;
    if (mode === 'stmt') return new Response(JSON.stringify({ code: '57014', message: 'canceling statement due to statement timeout' }), { status: 500 });
    if (mode === 'slow') return new Promise((res, rej) => { const t = setTimeout(() => res(Response.json(1)), 5000); opts.signal?.addEventListener('abort', () => { clearTimeout(t); rej(opts.signal.reason); }); });
    if (mode === 'flaky') return calls < 2 ? new Response('busy', { status: 503 }) : Response.json(7);
    return new Response('down', { status: 503 }); };
  const db = supa({ SUPABASE_URL: 'https://db.test', SUPABASE_SECRET_KEY: 'sb_secret_x' });
  await assert.rejects(db.rpc('slow_fn', {}), e => e.timeout === true && /57014/.test(e.message)); assert.equal(calls, 1, 'statement timeout asked once');
  calls = 0; mode = 'down'; let t0 = Date.now();
  await assert.rejects(db.rpc('f', {}, { deadline: Date.now() + 1200 })); assert.ok(Date.now() - t0 < 1500, 'gave up within the deadline: ' + (Date.now() - t0)); assert.ok(calls <= 2);
  calls = 0; mode = 'slow'; t0 = Date.now();
  await assert.rejects(db.rpc('f', {}, { deadline: Date.now() + 300 }), e => e.timeout === true); assert.ok(Date.now() - t0 < 1000, 'slow answer cut off at the deadline');
  calls = 0; mode = 'flaky'; assert.equal(await db.rpc('f', {}), 7, 'a passing 503 is still retried'); assert.equal(calls, 2);
  console.log('supa time limits ok'); }
