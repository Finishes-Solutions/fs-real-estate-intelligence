// The pro forma charts (src/pfcharts.js) on a real layout, and the IRR fixes behind them (lib/proforma.mjs): the
// sensitivity table's middle cell is the plan itself, and homes for sale get an IRR even when the last month is a payoff.
import assert from 'node:assert/strict';
import * as d3 from 'd3';
globalThis.d3 = d3;
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), PF = await import('../lib/proforma.mjs');
const { pfCharts } = await import('../src/pfcharts.js');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const mk = (o, pts) => { const k = 364567 * Math.cos(o[1] * Math.PI / 180); return { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(([x, y]) => [o[0] + x / k, o[1] + y / 364567])] }; };
const b = S.unionParcels([mk([-95.98, 30.06], [[0, 0], [920, 0], [920, 259], [822, 259], [822, 378], [0, 378]])]);
const plan = use => { const p = { ...b, front: b.ring.findIndex((q, i) => S.outwardOf(b.ring, i)[0] < -0.9), setbacks: S.SETBACKS, program: { use } }; p.elements = L.layoutOptions(p, p.program)[0].elements; return p; };
const J = pfCharts({ esc });

// multifamily: the curve has a point a month and ends where the levered cash flows sum to
const mf = plan('multifamily'), A = PF.defaults(mf, 1500000), R = PF.run(mf, A), jc = J.jcurve(R);
assert.equal((jc.match(/<rect class="mk-hit"/g) || []).length, R.monthly.levered.length);
const sum = R.monthly.levered.reduce((s, v) => s + v, 0), last = jc.match(/data-tip="Month \d+ \([^)]*\): [^"]*?, ([^"]*?) so far"/g).pop();
assert.ok(last.includes((sum >= 0 ? '+' : '−') + '$'), 'the last month reads the total: ' + last);
assert.match(jc, /data-mka="area"/); assert.match(jc, /class="pf-ph bld"/); assert.match(jc, / in at most</);
// the one-page method: a point a year, no phases
const js = J.jcurve(R, { simple: true }); assert.equal((js.match(/<rect class="mk-hit"/g) || []).length, A.hold + 1); assert.doesNotMatch(js, /pf-ph/);
// uses add up to the total, and the sources cover the same total
const mb = J.moneyBars(R), w = id => [...mb.matchAll(/data-mka="hb" data-mk="[^"]*" style="width:([\d.]+)%/g)].map(m => +m[1]);
assert.ok(Math.abs(w().reduce((s, v) => s + v, 0) - 200) < 0.1, 'each bar fills its row: ' + w());

// sensitivity: 5 × 5, the middle is the plan, higher rents and a lower exit cap both help
const SR = PF.sensitivity(mf, R.A);
assert.equal(SR.grid.length, 5); assert.ok(SR.grid.every(r => r.length === 5));
assert.ok(Math.abs(SR.base - R.returns.levIrr) < 1e-9, 'middle cell = the plan');
assert.ok(SR.grid[4][2] > SR.grid[2][2] && SR.grid[2][0] > SR.grid[2][2], 'rents up / cap down raise the IRR');
const st = J.sens(SR); assert.equal((st.match(/<td/g) || []).length, 25); assert.equal((st.match(/class="base"/g) || []).length, 1);

// homes for sale: margin in the table, and an IRR even though the last month is a small loan payoff
const hp = plan('sfr'), H = { ...PF.defaults(hp, 1500000), forSale: true }, RH = PF.run(hp, H);
assert.ok(RH.monthly.levered.at(-1) < 0, 'the case this guards: a negative last month');
assert.ok(Number.isFinite(RH.returns.levIrr), 'levered IRR for homes for sale');
const up = PF.run(hp, { ...H, salePsf: Object.fromEntries(Object.entries(H.salePsf).map(([k, v]) => [k, v * 1.3])) });
assert.ok(up.returns.profit > 0 && up.returns.levIrr > 0, 'a profitable plan reads a positive IRR, not n/a');
const SH = PF.sensitivity(hp, RH.A, { forSale: true }); assert.ok(Math.abs(SH.base - RH.returns.margin) < 1e-9 && SH.grid[4][0] > SH.grid[0][4], 'margin grid');
console.log('pro forma charts ok');
