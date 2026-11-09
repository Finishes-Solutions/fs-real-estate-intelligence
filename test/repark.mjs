// "Fix the parking" on a saved plan (lib/mcp/plans.mjs plan_edit, the parking re-fit): the parking and drives are laid out
// again round the buildings, and the amenities stay where they are. On a real plan an agent laid out (35131 Pineridge Rd,
// Waller: 96 garden apartments, 14 spaces short, pool and plaza between the buildings and the clubhouse; Nov 6 2026,
// test/fixtures/mcp-plan-pineridge.json, its terrain and other layouts left out) the re-fit used to pin the buildings
// only: the pool and its plaza were dropped, the "pool in the middle" ask went unmet, and two buildings squeezed to zero
// width were left in the plan.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ST = await import('../lib/mcp/store.mjs'), PL = await import('../lib/mcp/plans.mjs'), G = await import('../lib/guardrails.mjs');
const mem = ST.memoryStore(); ST.hooks.store = mem; PL.hooks.snapshots = async s => s.map(() => 'data:image/jpeg;base64,/9j/AAAA');
const rec = JSON.parse(fs.readFileSync(new URL('./fixtures/mcp-plan-pineridge.json', import.meta.url), 'utf8'));
await ST.putJSON(mem, 'plans/' + rec.id + '.json', rec);
const keep = ['pool', 'plaza', 'building'], geo = e => [e.kind, e.name || '', e.x, e.y, e.w, e.d].join(' ');
const before = rec.plan.elements.filter(e => keep.includes(e.kind)).map(geo).sort();
{ const m = G.metrics(rec.plan); assert.ok(m.spaces < m.required, 'the plan starts short of parking (' + m.spaces + ' of ' + m.required + ')'); }

const r = await PL.planEditTool({ plan_id: rec.id, words: 'fix the parking', use_ai: false }), text = r.content[0].text;
const out = await ST.getJSON(mem, 'plans/' + /Plan id: ([\w-]+)/.exec(text)[1] + '.json'), els = out.plan.elements;
assert.match(text, /Laid the parking out again round the buildings as they stand/);
const m = G.metrics(out.plan); assert.ok(m.spaces >= m.required, 'the parking meets the count (' + m.spaces + ' of ' + m.required + ')');
assert.ok(els.some(e => e.kind === 'pool'), 'the pool is kept'); assert.ok(els.some(e => e.kind === 'plaza'), 'and its plaza');
assert.deepEqual(els.filter(e => keep.includes(e.kind)).map(geo).sort(), before, 'the buildings, pool and plaza exactly where they were, none added');
assert.ok(!els.some(e => e.kind === 'building' && !e.poly && !(+e.w > 1 && +e.d > 1)), 'no building squeezed to nothing');
assert.match(text, /the pool in the middle: done/); assert.doesNotMatch(text, /buildings 2 → [3-9]/);
console.log('repark: the parking fixed round the buildings, the pool and plaza kept (' + m.spaces + ' of ' + m.required + ' spaces)');
