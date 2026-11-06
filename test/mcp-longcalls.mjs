// Long MCP calls (lib/mcp/calls.mjs, lib/mcp/server.mjs callTool): many MCP clients give up on a call at 60 s, so a tool
// still working after the reply window answers with a call_id and finishes in the background; call_result gives its
// answer. Storage in memory, the reply window shortened, and stand-in tools that take as long as the test says.
// Covers: a quick tool answers as before; a slow one hands off and call_result waits, then gives the tool's own answer
// (a PDF resource included); a failing one; a call stopped at the server's limit; no storage (the call waits); bad ids.
import assert from 'node:assert/strict';
const ST = await import('../lib/mcp/store.mjs'), C = await import('../lib/mcp/calls.mjs'), { callTool, TOOLS } = await import('../lib/mcp/server.mjs');

const mem = ST.memoryStore(); ST.hooks.store = mem;
// the bucket refuses application/json (415 in production): JSON is kept as text/plain, and the memory store refuses as it does
await assert.rejects(mem.put('x.json', '{}', 'application/json'), /invalid_mime_type/); await ST.putJSON(mem, 'x.json', { a: 1 }); assert.deepEqual(await ST.getJSON(mem, 'x.json'), { a: 1 }); mem.m.delete('x.json');
const bg = []; C.hooks.later = q => bg.push(q); C.hooks.replyMs = 60; C.hooks.stepMs = 5;
const sleep = ms => new Promise(res => setTimeout(res, ms));
const text = r => r.content.find(c => c.type === 'text').text;
const answerOf = label => ({ content: [{ type: 'text', text: label + ' done' }, { type: 'resource', resource: { uri: 'report://test/x.pdf', mimeType: 'application/pdf', blob: Buffer.from('%PDF-1.4').toString('base64') } }] });
let gate = null;
TOOLS.push({ name: 'test_quick', run: async () => answerOf('quick') },
  { name: 'test_slow', run: async () => { await new Promise(res => { gate = res; }); return answerOf('slow'); } },
  { name: 'test_broken', run: async () => { await sleep(120); throw new Error('the engine fell over'); } });
const calls = () => [...mem.m.keys()].filter(k => k.startsWith('calls/'));

// ---------- quick: the answer itself, nothing kept ----------
let r = await callTool('test_quick', {});
assert.equal(text(r), 'quick done'); assert.equal(calls().length, 0, 'nothing kept for a quick call');

// ---------- slow: a call_id, the work in the background, call_result waits then answers ----------
r = await callTool('test_slow', {});
assert.notEqual(r.isError, true); assert.match(text(r), /test_slow: still working/); assert.match(text(r), /Don’t start the same request again/);
const id = /call_id "([\w-]+)"/.exec(text(r))[1];
assert.equal(bg.length, 1, 'handed to the background');
assert.equal((await ST.getJSON(mem, 'calls/' + id + '.json')).state, 'running');
r = await callTool('call_result', { call_id: id, wait_seconds: 0 }); assert.match(text(r), /still working/); assert.match(text(r), new RegExp('call_id "' + id + '"'));
r = await callTool('call_result', { call_id: id }); assert.match(text(r), /still working/, 'waited the window, still going');
gate(); await Promise.all(bg);
r = await callTool('call_result', { call_id: id });
assert.equal(text(r), 'slow done', 'the tool’s own answer'); const res = r.content.find(c => c.type === 'resource'); assert.equal(res.resource.mimeType, 'application/pdf');
r = await callTool('call_result', { call_id: id }); assert.equal(text(r), 'slow done', 'asked again: the same answer');
// done while call_result waits: it answers as soon as it is
r = await callTool('test_slow', {}); const id2 = /call_id "([\w-]+)"/.exec(text(r))[1];
setTimeout(() => gate(), 20); r = await callTool('call_result', { call_id: id2 }); await Promise.all(bg); assert.equal(text(r), 'slow done', 'finished during the wait');
console.log('mcp long calls: hand-off and call_result ok');

// ---------- failing in the background: its error answer ----------
r = await callTool('test_broken', {}); const id3 = /call_id "([\w-]+)"/.exec(text(r))[1]; await Promise.all(bg);
r = await callTool('call_result', { call_id: id3 }); assert.equal(r.isError, true); assert.match(text(r), /the engine fell over/);
// ---------- stopped at the server's limit: still "running" long after ----------
await ST.putJSON(mem, 'calls/stale0000000.json', { v: 1, id: 'stale0000000', tool: 'site_plan', state: 'running', at: new Date(Date.now() - 400000).toISOString() });
r = await callTool('call_result', { call_id: 'stale0000000', wait_seconds: 0 }); assert.equal(r.isError, true); assert.match(text(r), /site_plan was stopped at the server’s five-minute limit/);
// ---------- bad ids ----------
r = await callTool('call_result', { call_id: 'nocall000000' }); assert.equal(r.isError, true); assert.match(text(r), /There is no call nocall000000/);
r = await callTool('call_result', {}); assert.equal(r.isError, true); assert.match(text(r), /Give the call_id/);
console.log('mcp long calls: failures and bad ids ok');

// ---------- no storage: nowhere to keep an answer, so the call waits for it ----------
ST.hooks.store = null; { const k = process.env.SUPABASE_SECRET_KEY, k2 = process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_SECRET_KEY; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const p = callTool('test_slow', {}); await sleep(150); gate(); r = await p; assert.equal(text(r), 'slow done', 'waited for the answer');
  if (k) process.env.SUPABASE_SECRET_KEY = k; if (k2) process.env.SUPABASE_SERVICE_ROLE_KEY = k2; }
ST.hooks.store = mem;
// ---------- the reply window: 40 s by default, MCP_REPLY_SECONDS within 5 to 280 ----------
C.hooks.replyMs = null;
assert.equal(C.replyMs({}), 40000); assert.equal(C.replyMs({ MCP_REPLY_SECONDS: '25' }), 25000); assert.equal(C.replyMs({ MCP_REPLY_SECONDS: '1' }), 5000); assert.equal(C.replyMs({ MCP_REPLY_SECONDS: '999' }), 280000); assert.equal(C.replyMs({ MCP_REPLY_SECONDS: 'x' }), 40000);
// listed, and the long tools say so
{ const t = TOOLS.find(x => x.name === 'call_result'); assert.ok(t && t.inputSchema.required.includes('call_id')); assert.match(TOOLS.find(x => x.name === 'site_plan').description, /call_result/); }
TOOLS.splice(TOOLS.findIndex(x => x.name === 'test_quick'), 3);
console.log('mcp long calls tests passed');
