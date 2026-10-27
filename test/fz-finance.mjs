// Offline tests for the shared financial primitives (lib/feasibility/finance.mjs): payments, balances, IRR, NPV,
// coverage and yield ratios, break-evens and the draw spread. Every expected value is worked by hand or from a
// textbook identity, not taken from the code under test.
import assert from 'node:assert/strict';
const F = await import('../lib/feasibility/finance.mjs');
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, (what || '') + ' ' + a + ' vs ' + b);

// ---- payments and balances ----
near(F.pmt(0.06 / 12, 360, 1e6), 5995.51, 0.005, '30-yr 6% payment');
near(F.pmt(0, 120, 1200), 10, 1e-9, 'zero rate is linear');
assert.equal(F.pmt(0.01, 0, 1000), 0, 'no periods, no payment');
{ const r = 0.065 / 12, p = F.pmt(r, 300, 2e6); // the balance after k payments is the PV of the payments still to come
  near(F.remainingBalance(2e6, r, p, 60), p * (1 - (1 + r) ** -240) / r, 1e-6, 'balance = PV of remaining payments');
  near(F.remainingBalance(2e6, r, p, 300), 0, 1e-6, 'paid off at term');
  assert.equal(F.remainingBalance(2e6, r, p, 0), 2e6); }
near(F.remainingBalance(1200, 0, 10, 30), 900, 1e-9, 'zero-rate balance');
assert.equal(F.roundToNearestThousand(34378501), 34379000); assert.equal(F.roundToNearestThousand(34378499), 34378000);

// ---- NPV and IRR ----
near(F.npv(0.1, [-1000, 100, 100, 1100]), 0, 1e-9, 'par bond NPV at its coupon');
near(F.irr([-1000, 100, 100, 1100]), 0.1, 1e-9, 'par bond IRR');
near(F.irr([-100, 110]), 0.1, 1e-9, 'one-period IRR');
near(F.irrMonthly([-100, ...Array(11).fill(0), 110]), 0.1, 1e-9, 'monthly flows annualized: 10% over 12 months');
near(F.irr([-100, 30, 40, 50]), 0.08896, 5e-5, 'textbook three-year IRR (8.90%)');
assert.ok(F.irr([-100, -5, 120]) > 0, 'two outflows, one inflow');
assert.equal(F.irr([100, 50]), null, 'no outflow: no IRR');
assert.equal(F.irr([-100, -50]), null, 'no inflow: no IRR');
assert.equal(F.irr([-100]), null, 'one flow: no IRR');
near(F.irr([-100, 0, 0, 1]), -0.7846, 1e-4, 'deep loss: negative IRR found');
{ const flows = [-5e6, -2e6, 4e5, 6e5, 8e5, 9.5e6], r = F.irr(flows); near(F.npv(r, flows), 0, 1e-4, 'NPV at the IRR is zero'); }
{ const m = [-1e6, ...Array(23).fill(-2e5), ...Array(96).fill(9e4), 9e6]; const r = F.irr(m); assert.ok(r != null, 'a 10-year monthly series (overflows near -100%) still has an IRR'); near(F.npv(r, m), 0, 1e-3, 'NPV at it is zero'); }
near(F.npvMonthly(0.12, [-100, ...Array(11).fill(0), 112]), 0, 1e-9, 'monthly NPV at the effective annual rate');
near(F.periodic(F.annualize(0.01)), 0.01, 1e-12, 'periodic ↔ annual round trip');
assert.equal(F.annualize(null), null);

// ---- ratios ----
near(F.dscr(1.25e6, 1e6), 1.25, 1e-12); assert.equal(F.dscr(1e6, 0), null, 'no debt service: no DSCR');
near(F.debtYield(9e5, 1e7), 0.09, 1e-12); near(F.ltv(6.5e6, 1e7), 0.65, 1e-12); near(F.ltc(6e6, 1e7), 0.6, 1e-12);
near(F.yieldOnCost(7e5, 1e7), 0.07, 1e-12); near(F.capValue(6.5e5, 0.065), 1e7, 1e-6); assert.equal(F.yieldOnCost(5, NaN), null);
near(F.equityMultiple(2.5e6, 1e6), 2.5, 1e-12); near(F.multipleOf([-1e6, -5e5, 2e5, 2.8e6]), 2, 1e-12, 'multiple from a levered series');

// ---- break-evens: the value at the break-even rent is the cost; at the target-yield rent, NOI / cost is the target ----
{ const cost = 1e7, units = 50, cap = 0.06, opex = 0.4, vac = 0.07, be = F.breakEvenRent(cost, units, cap, opex, vac);
  const noi = be * 12 * units * (1 - vac) * (1 - opex); near(noi / cap, cost, 1e-6, 'value at break-even rent = cost');
  const ry = F.rentForYield(cost, units, 0.065, opex, vac); near(ry * 12 * units * (1 - vac) * (1 - opex) / cost, 0.065, 1e-12, 'rent for a 6.5% yield on cost');
  assert.equal(F.breakEvenRent(cost, 0, cap, opex, vac), null); }
near(F.breakEvenPrice(9.5e6, 20, 0.05), 500000, 1e-6, 'for-sale break-even after selling costs');

// ---- spreading ----
for (const n of [1, 6, 18]) for (const c of ['flat', 's']) near(F.spreadWeights(n, c).reduce((a, b) => a + b, 0), 1, 1e-12, n + ' ' + c + ' weights sum to 1');
{ const w = F.spreadWeights(18, 's'); assert.ok(w[8] > w[0] && w[9] > w[17], 'S-curve spends most mid-construction'); near(w[0], w[17], 1e-12, 'symmetric'); }
near(F.sum([1, 2, NaN, 3]), 6, 0); assert.equal(F.round2(1.005 * 1000) / 1000, 1.005);

console.log('fz-finance tests passed');
