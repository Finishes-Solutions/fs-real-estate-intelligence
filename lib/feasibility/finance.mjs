// @ts-check
// Financial primitives shared by every engine on the platform: the development pro forma (lib/proforma.mjs), the
// stabilized hold analysis (lib/feasibility/investment/), the budget, sensitivity and break-evens. One copy of each
// formula, so two engines can never disagree about what a payment or an IRR is.
//
// pmt, remainingBalance, roundToNearestThousand and irr are ported from fs-budgeting-suite
// api/shared/investment/finance.js (origin/feature @ 4187c8c), where they are proven against five reference deals.
// The break-evens follow fs-cre-report-runner lib/v2/financial/calc.js (matthew/nifty-mendel-hc0iwc @ 35c1fe4).
// Full double precision throughout: rounding happens only at named boundaries or at display time.

// Payment per period of a fully amortizing loan (30/360 when ratePerPeriod is annual / 12). A zero rate amortizes
// linearly.
export function pmt(ratePerPeriod, numberOfPeriods, principal) {
  if (!(numberOfPeriods > 0)) return 0;
  if (ratePerPeriod === 0) return principal / numberOfPeriods;
  return principal * ratePerPeriod / (1 - Math.pow(1 + ratePerPeriod, -numberOfPeriods));
}

// Outstanding balance after paidPeriods payments of `payment`.
export function remainingBalance(principal, ratePerPeriod, payment, paidPeriods) {
  if (paidPeriods <= 0) return principal;
  if (ratePerPeriod === 0) return Math.max(0, principal - payment * paidPeriods);
  const f = Math.pow(1 + ratePerPeriod, paidPeriods);
  return Math.max(0, principal * f - payment * (f - 1) / ratePerPeriod);
}

// The reference deals' convention: a gross sale price is rounded to the nearest $1,000 and the ROUNDED number feeds
// selling costs and net proceeds downstream.
export const roundToNearestThousand = v => Math.round(v / 1000) * 1000;

// Net present value of flows at t = 0, 1, 2 … (the first flow is not discounted).
export function npv(rate, cashFlows) {
  let v = 0;
  for (let t = 0; t < cashFlows.length; t++) v += cashFlows[t] / Math.pow(1 + rate, t);
  return v;
}

// IRR per period: bracket by a log-spaced grid scan, then bisection. Returns null when the flows have no sign change
// or no root in [-99.99%, 10,000%] per period: never NaN, never Infinity, never a misleading zero. The scan walks the
// grid in coarse steps and looks at the fine points only inside the step where the sign turns (the same bracket as
// scanning every point, unless one coarse step holds two sign changes); a long monthly series overflows near -100%,
// so a point whose NPV isn't a number is passed over.
const IRR_LO = -0.9999, IRR_HI = 100, IRR_STEPS = 4000, IRR_COARSE = 20;
const gridRate = i => IRR_LO + (Math.exp(i / IRR_STEPS * Math.log(1 + IRR_HI - IRR_LO)) - 1); // (finer near zero)
const turns = (a, b) => Number.isFinite(a) && Number.isFinite(b) && ((a < 0 && b >= 0) || (a > 0 && b <= 0));
export function irr(cashFlows) {
  if (!Array.isArray(cashFlows) || cashFlows.length < 2) return null;
  let pos = false, neg = false;
  for (const c of cashFlows) { if (c > 0) pos = true; if (c < 0) neg = true; }
  if (!pos || !neg) return null;
  const f = r => npv(r, cashFlows);
  let lo = null, hi = null, pI = 0, pV = f(IRR_LO);
  for (let i = IRR_COARSE; i <= IRR_STEPS && hi === null; i += IRR_COARSE) {
    const v = f(gridRate(i));
    if (Number.isFinite(pV) && Number.isFinite(v) && !turns(pV, v)) { pI = i; pV = v; continue; }
    for (let k = pI + 1, qV = pV; k <= i; k++) { const w = k === i ? v : f(gridRate(k)); if (turns(qV, w)) { lo = gridRate(k - 1); hi = gridRate(k); break; } qV = w; }
    pI = i; pV = v;
  }
  if (hi === null) return null;
  let flo = f(lo);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, v = f(mid);
    if (!Number.isFinite(v)) return null;
    if (Math.abs(v) < 1e-9 || hi - lo < 1e-12) return mid;
    if ((flo < 0) === (v < 0)) { lo = mid; flo = v; } else hi = mid;
  }
  return (lo + hi) / 2;
}

// periodic ↔ annual
export const annualize = (rate, periodsPerYear = 12) => rate == null ? null : Math.pow(1 + rate, periodsPerYear) - 1;
export const periodic = (annual, periodsPerYear = 12) => Math.pow(1 + annual, 1 / periodsPerYear) - 1;
// IRR of monthly flows, as an annual rate
export const irrMonthly = flows => annualize(irr(flows), 12);
// NPV of monthly flows at an annual discount rate
export const npvMonthly = (annualRate, flows) => npv(periodic(annualRate, 12), flows);

// ratios (null when the denominator is missing or zero, so a report never shows Infinity)
const div = (a, b) => (b && Number.isFinite(a) && Number.isFinite(b)) ? a / b : null;
export const dscr = (noi, annualDebtService) => div(noi, annualDebtService);
export const debtYield = (noi, loan) => div(noi, loan);
export const ltv = (loan, value) => div(loan, value);
export const ltc = (loan, cost) => div(loan, cost);
export const yieldOnCost = (noi, totalCost) => div(noi, totalCost);
export const capValue = (noi, capRate) => div(noi, capRate);
// distributions over contributions (both positive numbers)
export const equityMultiple = (distributions, contributions) => div(distributions, contributions);
// the same from one levered cash flow series (negative = in, positive = out)
export function multipleOf(flows) {
  let inn = 0, out = 0; for (const c of flows) { if (c < 0) inn -= c; else out += c; }
  return div(out, inn);
}

// ---------- break-evens (fs-cre-report-runner calc.js:233-243, generalized) ----------
// for sale: the price per home that recovers the total cost after selling costs
export const breakEvenPrice = (totalCost, homes, sellingCostPct) => div(totalCost, homes * (1 - sellingCostPct));
// rental: the monthly rent per unit at which value (NOI / cap) equals the total cost, given vacancy and an opex ratio
export function breakEvenRent(totalCost, units, capRate, opexRatio, vacancy) {
  if (!(units > 0) || !(capRate > 0) || opexRatio >= 1 || vacancy >= 1) return null;
  return totalCost * capRate / (1 - opexRatio) / (1 - vacancy) / (units * 12);
}
// the monthly rent per unit that reaches a target yield on cost
export function rentForYield(totalCost, units, targetYield, opexRatio, vacancy) {
  if (!(units > 0) || opexRatio >= 1 || vacancy >= 1) return null;
  return totalCost * targetYield / (1 - opexRatio) / (1 - vacancy) / (units * 12);
}

// ---------- spreading ----------
// weights that sum to 1 over n periods: flat, or an S-curve of cumulative spend (sin² bell of monthly spend, the
// platform's draw shape)
export function spreadWeights(n, curve = 'flat') {
  n = Math.max(1, Math.round(n));
  const w = Array.from({ length: n }, (_, k) => curve === 's' ? Math.sin(Math.PI * (k + 0.5) / n) ** 2 : 1), s = w.reduce((a, b) => a + b, 0);
  return w.map(v => v / s);
}

export const sum = a => a.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
export const round2 = v => Math.round(v * 100) / 100;
