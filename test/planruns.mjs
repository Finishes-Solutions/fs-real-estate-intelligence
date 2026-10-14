// A site plan option's last build (lib/planruns.mjs): layout names and keys on real engine output (a 4.7-acre retail
// lot, re-solved with a deeper front setback), matching a layout again, slimming what's saved, the Pro forma's money and
// the projects a parcel already belongs to.
import assert from 'node:assert/strict';
import { baseName, layoutKeys, layoutNames, matchLayout, slimRun, finOf, projectsWith, deltaText } from '../lib/planruns.mjs';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), PF = await import('../lib/proforma.mjs');

// ---- names ----
assert.equal(baseName('Layout 12 · Rows facing the street · pond at the back'), 'Rows facing the street · pond at the back');
assert.equal(baseName('B · Rows running back'), 'Rows running back'); // an old saved run
assert.equal(baseName('Compact · room to expand'), 'Compact · room to expand'); // a one-word arrangement is not a label
const m = (gfa, spaces, units = 0) => ({ gfa, spaces, units, buildings: 1, coverage: 0.12 });
let names = layoutNames([{ arr: 'Rows facing the street', m: m(25000, 107) }, { arr: 'Rows running back', m: m(25000, 120) }, { arr: 'Rows facing the street', m: m(25000, 114) }]);
assert.deepEqual(names, ['Layout 1 · Rows facing the street · 107 spaces', 'Layout 2 · Rows running back', 'Layout 3 · Rows facing the street · 114 spaces']);
names = layoutNames([{ arr: 'Rows', m: m(25000, 107) }, { arr: 'Rows', m: m(25000, 107) }]);
assert.deepEqual(names, ['Layout 1 · Rows', 'Layout 2 · Rows · variant 2']);
assert.ok(!layoutNames([{ arr: 'A' }, { arr: 'B' }]).some(n => /alternate|^[A-Z] · /.test(n)));

// ---- real layouts: keys survive a re-solve with new setbacks ----
const mk = (o, pts) => { const k = 364567 * Math.cos(o[1] * Math.PI / 180); return { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(([x, y]) => [o[0] + x / k, o[1] + y / 364567])] }; };
const b = S.unionParcels([mk([-95.98, 30.06], [[0, 0], [600, 0], [600, 340], [0, 340]])]), plan = { ...b, front: 0, setbacks: { ...S.SETBACKS } };
const prog = S.guessProgram('25,000 sf retail strip with 2 pads');
const tag = (out, pl) => { const vs = out.map(o => ({ ...o, arr: o.name, m: S.metrics({ ...pl, program: o.program, elements: o.elements }) })); const k = layoutKeys(vs), n = layoutNames(vs); return vs.map((v, i) => ({ ...v, key: k[i], name: n[i] })); };
const A = tag(L.layoutOptions(plan, prog), plan);
assert.equal(A.length, 3); assert.equal(new Set(A.map(v => v.key)).size, 3, 'every layout has its own key');
assert.ok(A.every((v, i) => v.name.startsWith('Layout ' + (i + 1) + ' · ')));
const plan2 = { ...plan, setbacks: { ...plan.setbacks, front: 35 } }, B = tag(L.layoutOptions(plan2, prog), plan2);
for (const v of A) { const r = matchLayout(B, v.key, v.name); assert.ok(r.index >= 0); if (r.exact) assert.equal(B[r.index].arr, v.arr); }
assert.ok(A.some(v => matchLayout(B, v.key, v.name).exact), 'the same arrangements come back after a setback change');
// a key that's gone: the nearest by name, said to be not exact
const gone = matchLayout(B, 'r|nothing', A[0].name); assert.equal(gone.exact, false); assert.ok(gone.index >= 0);
assert.deepEqual(matchLayout([], 'x', 'y'), { index: -1, exact: false });

// ---- what's saved ----
const big = { ask: 'x', at: 1, variants: Array.from({ length: 8 }, (_, i) => ({ key: 'k' + i, name: 'Layout ' + (i + 1) + ' · R', m: m(1, 1), elements: [{ id: 'e' + i, kind: 'building', pad: 'y'.repeat(1000) }], junk: 1 })) };
let s = slimRun(big, 'k7');
assert.equal(s.variants.length, 6); assert.ok(s.variants.some(v => v.key === 'k7'), 'the layout on the map is always kept');
assert.deepEqual(s.variants.filter(v => v.elements).map(v => v.key), ['k0', 'k1', 'k2', 'k7']);
assert.ok(s.variants.every(v => !('junk' in v)));
s = slimRun(big, 'k1', { limit: 3000 }); assert.deepEqual(s.variants.filter(v => v.elements).map(v => v.key), ['k1'], 'over the limit only the one on the map keeps its pieces');

// ---- money: what the Pro forma shows ----
const v0 = A[0], p0 = { ...plan, program: v0.program, elements: v0.elements }, R = PF.run(p0, PF.defaults(p0, 6200000)), f = finOf(R);
assert.equal(f.cost, Math.round(R.budget.total)); assert.equal(f.yoc, R.returns.yoc); assert.equal(f.land, Math.round(R.budget.land));
assert.ok(f.land >= 6200000, 'land at the price given');
const q = PF.quick(p0); assert.ok(f.cost > q.cost, 'with land, the cost is higher than the old land-free quick read');
const Rs = PF.run(p0, { ...PF.defaults(p0, 6200000), method: 'simple' }), fs = finOf(Rs); assert.equal(fs.cost, Math.round(Rs.simple.cost)); assert.equal(fs.method, 'simple');
assert.equal(finOf(null), null);

// ---- parcels already in a project ----
const projects = [{ id: 'a', name: 'Old', updated: '2026-01-01', parcels: [{ key: 'pid:1' }], plans: [{ id: 'x', name: 'Option A', parcels: ['pid:1'], created: '2026-01-01' }] },
  { id: 'b', name: 'New', updated: '2026-05-01', parcels: [{ key: 'pid:1' }, { key: 'pid:2' }], plans: [{ id: 'y', name: 'Option A', parcels: ['pid:2'], created: '2026-04-01' }, { id: 'z', name: 'Option B', parcel: 'pid:1', created: '2026-03-01' }] },
  { id: 'c', name: 'Other', parcels: [{ key: 'pid:9' }], plans: [] }];
const w = projectsWith(projects, ['pid:1']);
assert.deepEqual(w.map(x => x.p.id), ['b', 'a'], 'newest first');
assert.equal(w[0].plan.id, 'z', 'the option on that parcel');
assert.deepEqual(projectsWith(projects, ['pid:7']), []);

// ---- the change toast ----
assert.equal(deltaText('Front setback 35 ft', { gfa: 25000, spaces: 110, required: 100 }, { gfa: 22800, spaces: 104, required: 92 }), 'Front setback 35 ft: 22,800 sf (−2,200), 104/92 spaces');
assert.equal(deltaText('Floors 4', { units: 200, spaces: 300, required: 300 }, { units: 240, spaces: 330, required: 360 }), 'Floors 4: 240 units (+40), 330/360 spaces');

console.log('planruns ok: layout names and keys, matching after a re-solve, saved runs, Pro forma money, parcels in projects');
