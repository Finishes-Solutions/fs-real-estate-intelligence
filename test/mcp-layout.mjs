// The layout run tools through the MCP server (lib/mcp/server.mjs callTool) and the website's endpoint
// (api/layoutrun.js): a run, its record replayed identically, an edit applied and one refused, the capability table.
// No network, no AI.
import assert from 'node:assert/strict';
import { callTool } from '../lib/mcp/server.mjs';
import handler from '../api/layoutrun.js';

const ring = [[0, 0], [900, 0], [900, 500], [0, 500]];
const text = r => r.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
const recOf = r => JSON.parse(r.content.find(c => c.type === 'resource').resource.text);

const run = await callTool('layout_run', { request: 'at least 25,000 sf retail strip', ring_ft: ring, front_edge: 0 });
assert.ok(!run.isError, text(run)); assert.match(text(run), /^Outcome: /); assert.match(text(run), /parking \d+ provided \/ \d+ required/);
const rec = recOf(run); assert.equal(rec.schema, 'rei.run/1'); assert.equal(rec.brief.program.uses[0].quantity.mode, 'min');
console.log('mcp layout_run ok:', text(run).split('\n')[0]);

const rp = await callTool('layout_replay', { record: rec }); assert.match(text(rp), /^Replay identical/); console.log('mcp layout_replay ok');
const ed = await callTool('layout_edit', { record: rec, edits: [{ op: 'set-quantity', use: 'retail', quantity: { mode: 'exact', value: 20000, unit: 'sf' } }] });
assert.ok(!ed.isError, text(ed)); assert.match(text(ed), /Done: retail/); const rec2 = recOf(ed); assert.equal(rec2.edit.steps.length, 1);
const no = await callTool('layout_edit', { record: rec, words: 'Lock these two buildings' }); assert.ok(no.isError); assert.match(text(no), /selection/); console.log('mcp layout_edit ok');
const un = await callTool('layout_run', { request: 'a side-load warehouse, 200,000 sf', ring_ft: ring }); assert.match(text(un), /^Outcome: unsupported/);
const caps = await callTool('layout_capabilities', {}); assert.match(text(caps), /mf-podium \(multifamily\): partial/); console.log('mcp layout_capabilities ok');
const bad = await callTool('layout_run', {}); assert.ok(bad.isError); assert.match(text(bad), /Give brief/);

// the endpoint
const call = async body => { let code = 200, out; const res = { status(c) { code = c; return this; }, json(d) { out = d; return this; }, setHeader() {} };
  await handler({ method: 'POST', headers: { host: 'x' }, body, socket: {} }, res); return { code, out }; };
const a = await call({ mode: 'run', request: '30,000 sf retail strip', ring_ft: ring }); assert.equal(a.code, 200); assert.equal(a.out.schema, 'rei.run/1');
const b = await call({ mode: 'replay', record: a.out }); assert.equal(b.out.identical, true);
const c = await call({ mode: 'edit', record: a.out, words: 'move the pool to the center' }); assert.equal(c.code, 200); assert.equal(c.out.ok, false); // a retail plan has no pool
const d = await call({ mode: 'run' }); assert.equal(d.code, 400);
const e = await call({ mode: 'caps' }); assert.ok(e.out.caps.length > 20);
console.log('api layoutrun ok');
console.log('mcp-layout tests passed');
