// A plan traced from a drawing: ponds and the paving by their outlines, parking rows by their stall counts, each left
// exactly where the feet put it (lib/siteedit.mjs applyEdits add with outline / path / stalls / exact, through the MCP's
// typed edits). Realistic data: parcel 361051 on FM 2004, Texas City (43.8 acres, a ten-sided lot), with the owner's
// concept buildings placed by hand (8 shops, 12 storage buildings, 9 apartment buildings, 6 townhome clusters) and
// the two triangular detention ponds, two frontage swales, the paving edge with its 16 islands and 95 parking rows
// traced from the concept's CAD linework. Before this the ponds could only be boxes and no drive or stall could be given.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const S = await import('../lib/siteplan.mjs'), ED = await import('../lib/siteedit.mjs'), PL = await import('../lib/mcp/plans.mjs'), G = await import('../lib/sitesheet.mjs'), SV = await import('../lib/mcp/server.mjs');
const fx = JSON.parse(readFileSync(new URL('./fixtures/texas-city-trace.json', import.meta.url), 'utf8')), plan0 = fx.plan, f = ED.sheetFrame(plan0);
const near = (a, b, t) => Math.abs(a - b) <= t, opsOf = (plan, edits) => edits.map(e => { const o = PL.opFrom(plan, e); assert.ok(!o.error, o.error); return o.op; });
const run = (plan, edits) => { const r = ED.applyEdits(plan, opsOf(plan, edits), {}); return { ...r, plan: { ...plan, elements: r.elements } }; };

const r = run(plan0, fx.edits), els = r.plan.elements, by = k => els.filter(e => e.kind === k);
assert.deepEqual(r.skipped, [], 'nothing left undone');

// ponds: the four outlines, to the vertex, and their areas (the concept's 172,000 and 128,000 sf ponds and two swales)
const ponds = by('pond'), asked = fx.edits.filter(e => e.kind === 'pond' && e.outline);
assert.equal(ponds.length, 4); assert.equal(asked.length, 4);
for (const a of asked) {
  const p = ponds.find(e => e.name === a.name); assert.ok(p?.poly, a.name + ' has its outline');
  assert.equal(p.poly.length, a.outline.length - (Math.hypot(a.outline[0][0] - a.outline.at(-1)[0], a.outline[0][1] - a.outline.at(-1)[1]) < 0.05 ? 1 : 0));
  p.poly.forEach((q, i) => { const s = f.to(q); assert.ok(near(s[0], a.outline[i][0], 0.03) && near(s[1], a.outline[i][1], 0.03), a.name + ' vertex ' + i + ' where it was drawn'); });
  assert.ok(p.poly.every(q => S.inRing(q, plan0.ring)), a.name + ' inside the lot');
}
const areaOf = n => Math.round(S.ringArea(ponds.find(e => e.name === n).poly));
assert.ok(near(areaOf('Detention pond (SE)'), 170600, 400), 'SE pond ' + areaOf('Detention pond (SE)'));
assert.ok(near(areaOf('Detention pond (NE)'), 127500, 400), 'NE pond ' + areaOf('Detention pond (NE)'));
const m = S.metrics(r.plan); assert.ok(near(m.pond / 43560, 7.59, 0.03), 'detention ' + (m.pond / 43560).toFixed(2) + ' ac');

// the paving: one outline with its islands cut in, the buildings on the islands not on it
const pave = by('drive'); assert.equal(pave.length, 1); assert.ok(near(S.ringArea(pave[0].poly), 624600, 800));
for (const n of ['Retail A', 'Retail F', 'Apt Bldg 7', 'Townhomes 3']) { const b = els.find(e => e.name === n); assert.ok(!S.inRing([b.x, b.y], pave[0].poly), n + ' stands on an island'); }

// parking: every row with the stalls asked, where asked, at the angle asked
const rowsAsked = fx.edits.filter(e => e.kind === 'parking'), rows = by('parking');
assert.equal(rows.length, rowsAsked.length); assert.equal(rows.length, 95);
rows.forEach((e, i) => { const a = rowsAsked[i], s = f.to([e.x, e.y]);
  assert.equal(S.stalls(e).count, a.stalls, 'row ' + i + ' stalls'); assert.ok(near(s[0], a.x, 0.03) && near(s[1], a.y, 0.03), 'row ' + i + ' place'); assert.ok(near(e.w, a.w, 0.01) && near(e.d, a.d, 0.01)); assert.ok(near(((f.rotTo(e.rot) - a.turn) % 360 + 540) % 360 - 180, 0, 0.02), 'row ' + i + ' angle'); });
const stallsAsked = rowsAsked.reduce((t, a) => t + a.stalls, 0); assert.equal(stallsAsked, 893);
assert.equal(rows.reduce((t, e) => t + S.stalls(e).count, 0), 893);

// nothing already there moved or made way: the 35 buildings, 372 homes, pool and lawns are as they were
const before = plan0.elements.filter(e => e.kind !== 'pond'), geo = e => [e.id, e.x, e.y, e.w, e.d, e.rot].join('|');
for (const e of before) assert.equal(geo(els.find(x => x.id === e.id) || {}), geo(e), (e.name || e.kind) + ' untouched');
assert.equal(m.units, 372); assert.equal(by('building').length, 36);

// it draws: the ponds and paving as paths, and the sheet doesn't choke on a 1,161-point outline
const svg = G.planSVG(r.plan, { turn: 0 }).svg; assert.ok(svg.length > 100000 && !/NaN/.test(svg));

// a drive by its centre line, and a building left exactly where the feet put it with its own floor area
{ const r2 = run(r.plan, [{ action: 'add', path: [[440, 0], [440, 120], [520, 200]], width: 30, name: 'Stub drive' }, { action: 'add', kind: 'building', use: 'amenity', name: 'Kiosk', x: 592.8, y: 779.1, w: 20, d: 20, turn: 0, exact: true, sf: 350 }]);
  const d = r2.plan.elements.find(e => e.name === 'Stub drive'), k = r2.plan.elements.find(e => e.name === 'Kiosk');
  assert.equal(d.kind, 'drive'); assert.equal(d.path.length, 3); assert.equal(d.width, 30); assert.ok(S.shapeOf(d).length > 3);
  const s = f.to([k.x, k.y]); assert.ok(near(s[0], 592.8, 0.02) && near(s[1], 779.1, 0.02), 'on top of the clubhouse, as asked: not stepped aside'); assert.equal(S.gfaOf(k), 350); }

// what can't be read is said, not drawn
{ const r3 = ED.applyEdits(r.plan, [{ action: 'add', kind: 'pond', outline: [[0, 0], [10, 10]] }, { action: 'add', kind: 'building', outline: [[0, 0], [10, 0], [10, 10]] }, { action: 'add', kind: 'pond', outline: [[0, 0], [10, 0], [20, 0]] }, { action: 'add', kind: 'pond', outline: [[0, 0], ['a', 1], [5, 5]] }], {});
  assert.equal(r3.skipped.length, 4); assert.equal(r3.elements.length, r.plan.elements.length); }

// the MCP tool takes them
{ const t = SV.TOOLS?.find?.(x => x.name === 'plan_edit') ?? null;
  if (t) { const P = t.inputSchema.properties.edits.items.properties; for (const k of ['outline', 'path', 'width', 'exact', 'stalls', 'sf']) assert.ok(P[k], 'plan_edit edits take ' + k); assert.ok(t.inputSchema.properties.edits.maxItems >= 150); } }
console.log('edittrace: ok (4 ponds to the vertex, paving with 16 islands, 95 rows / 893 stalls, nothing else moved)');
