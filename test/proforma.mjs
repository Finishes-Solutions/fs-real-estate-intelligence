// Offline tests for the pro forma (lib/proforma.mjs): the one-page method reproduces TestFit's custom pro forma for
// "The Commons Plaza" to the dollar, and the schedule model gives sane numbers on a real layout.
import assert from 'node:assert/strict';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), PF = await import('../lib/proforma.mjs');

// ---- TestFit's sheet: same inputs, same answers ----
const tf = PF.simple({ nrsf: 466560, gsf: 557115, land: 10e6, hard: 22e6, ti: 2e6, soft: 2.5e6, contPct: 7, finFee: 2.2e6, rentPsf: 30, recoveryPct: 85, otherPsf: 1, vacancyPct: 6, opexPsf: 8.5,
  ltc: 65, rate: 6, amort: 25, exitCap: 6.5, marketCap: 6.25, dispPct: 2.5, rentGrowth: 2.5, expGrowth: 2, hold: 5 });
const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, a + ' vs ' + b);
near(tf.cost, 40240000); near(tf.debt, 26156000); near(tf.equity, 14084000); near(tf.ds, 2046098); near(tf.noi, 12798441); near(tf.egi, 16764201); near(tf.gpr, 17834256);
near(tf.value, 204775050); near(tf.years[0].noi, 13122387); near(tf.years[4].cf, 12455946); near(tf.sale, 228686079); near(tf.net, 222968927); near(tf.bal, 23468583); near(tf.toEq, 199500343);
near(tf.ops, 58787602, 2); near(tf.profit, 244203945, 2);
assert.equal((tf.yoc * 100).toFixed(2), '31.81'); assert.equal((tf.dscr).toFixed(2), '6.26'); assert.equal((tf.coc * 100).toFixed(2), '76.34');
assert.equal((tf.unlevIrr * 100).toFixed(2), '61.51'); assert.equal((tf.levIrr * 100).toFixed(2), '114.44'); assert.equal(tf.multiple.toFixed(2), '18.34');

// ---- a real layout through the schedule model ----
const mk = (o, pts) => { const k = 364567 * Math.cos(o[1] * Math.PI / 180); return { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(([x, y]) => [o[0] + x / k, o[1] + y / 364567])] }; };
const b = S.unionParcels([mk([-95.98, 30.06], [[0, 0], [920, 0], [920, 259], [822, 259], [822, 378], [0, 378]])]);
const plan = { ...b, front: b.ring.findIndex((p, i) => S.outwardOf(b.ring, i)[0] < -0.9), setbacks: S.SETBACKS, program: { use: 'multifamily' } };
plan.elements = L.layoutOptions(plan, plan.program)[0].elements;
const A = PF.defaults(plan, 1500000), R = PF.run(plan, A);
assert.ok(R.P.units > 120 && R.P.mix.length === 4, 'units by type from the plan');
assert.ok(R.sched.pre === 9 && R.sched.build >= 14 && R.sched.build <= 20 && R.sched.lease >= 6, 'schedule ' + JSON.stringify(R.sched));
assert.ok(R.budget.total / R.P.units > 150000 && R.budget.total / R.P.units < 240000, 'about $150-240k a unit: ' + Math.round(R.budget.total / R.P.units));
assert.ok(R.budget.interest > 0 && R.budget.interest < 0.12 * R.budget.total, 'construction interest');
assert.ok(R.ops.noi > 0 && R.returns.yoc > 0.04 && R.returns.yoc < 0.08, 'yield on cost ' + R.returns.yoc);
assert.ok(Number.isFinite(R.returns.unlevIrr) && R.returns.unlevIrr > -0.2 && R.returns.unlevIrr < 0.3, 'unlevered IRR ' + R.returns.unlevIrr);
assert.ok(R.simple.unlevIrr > R.returns.unlevIrr, 'the no-schedule method reads higher');
assert.ok(R.monthly.cost.reduce((s, v) => s + v, 0) > 0.99 * (R.budget.budget), 'every budget dollar is spent in the schedule');
const wb = PF.workbook(R, 'Test'); assert.ok(wb['One page (TestFit method)'].some(r => r.some(c => c?.f?.startsWith('IRR('))));
// for-sale homes
const hp = { ...plan, program: { use: 'sfr' } }; hp.elements = L.layoutOptions(hp, hp.program)[0].elements;
const H = PF.run(hp, { ...PF.defaults(hp, 1500000), forSale: true }); assert.ok(H.forSale && H.exit.sales > H.budget.total * 0.7 && Number.isFinite(H.returns.margin) && H.sched.lease >= 4, 'for-sale homes: sales ' + Math.round(H.exit.sales) + ' cost ' + Math.round(H.budget.total));
console.log('pro forma ok');
