// @ts-check
// The study's pro forma: the platform's monthly development model (lib/proforma.mjs) priced from the project budget,
// plus what a feasibility study needs on top of it:
//  - NPV of the unlevered and levered monthly flows at the discount rate;
//  - one plain "profit" (levered net cash: distributions − contributions) and "value creation" (stabilized value −
//    total development cost), named apart because they answer different questions;
//  - break-even rent or price and the rent needed for a target yield on cost (shared finance primitives);
//  - the hold analysis: the stabilized asset held N years on the budgeting suite's before-tax engine
//    (lib/feasibility/investment, proven on five reference deals), bought at its total development cost.
import * as PF from '../proforma.mjs';
import * as F from './finance.mjs';
import { calculateInvestmentAnalysis } from './investment/index.mjs';
import { pfOverrides } from './assumptions.mjs';

// M: metrics; v: assumption values; budgetIn: from buildBudget (null: the parametric budget)
export function runProForma(M, v, budgetIn = null, { rentFactor = 1 } = {}) {
  const ov = scaleRevenue(pfOverrides(v), rentFactor, M);
  const R = PF.proFormaOf(M, null, budgetIn ? { ...ov, budgetIn } : ov);
  const dr = (v.discountRate ?? 10) / 100, b = R.budget, ops = R.ops;
  const npvUnlev = F.npvMonthly(dr, R.monthly.unlevered), npvLev = F.npvMonthly(dr, R.monthly.levered);
  const value = R.returns.value ?? null;
  const out = {
    R, budget: b,
    headline: {
      totalCost: b.total, land: b.land, hard: b.hard, site: b.site, soft: b.soft, contingency: b.cont, devFee: b.fee, interest: b.interest, loanFees: b.loanFees,
      noi: R.forSale ? null : ops.noi, egi: R.forSale ? null : ops.egi, yoc: R.returns.yoc ?? null, value, valueCreation: value != null ? value - b.total : null,
      unlevIrr: R.returns.unlevIrr, levIrr: R.returns.levIrr, npvUnlev, npvLev, multiple: R.returns.multiple, profit: R.returns.profit, equity: R.returns.peakEquity,
      dscr: R.returns.dscr ?? null, coc: R.returns.coc ?? null, margin: R.returns.margin, peakLoan: R.sources.loanPeak, ltc: R.sources.ltc, months: R.sched.total, stabilizeMonth: R.sched.toStabilize, forSale: R.forSale
    }
  };
  out.breakEven = breakEvens(R, v);
  return out;
}

// every revenue input × f (a rent sensitivity or scenario), for the uses in the metrics
const REV = /^(rents|homeRent|commRent|storageRent|salePsf)$/;
function scaleRevenue(ov, f, M) {
  if (f === 1) return ov;
  const D = PF.defaultsFor(M, ov.landPrice ?? null, ov), o = { ...ov };
  for (const k of Object.keys(D)) if (REV.test(k) && D[k] && typeof D[k] === 'object') o[k] = Object.fromEntries(Object.entries({ ...D[k], ...(ov[k] || {}) }).map(([a, x]) => [a, typeof x === 'number' && a !== 'rvOpex' ? x * f : x]));
  o.otherPerUnit = (ov.otherPerUnit ?? D.otherPerUnit) * f;
  if (D.hotel) o.hotel = { ...D.hotel, ...(ov.hotel || {}), adr: (ov.hotel?.adr ?? D.hotel.adr) * f };
  if (D.fuel) o.fuel = { ...D.fuel, ...(ov.fuel || {}), groundRent: (ov.fuel?.groundRent ?? D.fuel.groundRent) * f };
  return o;
}

// break-evens on the run's own total cost and operating ratios
function breakEvens(R, v) {
  const b = R.budget, units = R.ops.aptUnits || 0, homes = (R.P.uses.townhomes?.units || 0) + (R.P.uses.duplex?.units || 0) + (R.P.uses.sfr?.units || 0);
  if (R.forSale) return { kind: 'price', price: F.breakEvenPrice(b.total, homes, (R.A.commissionPct || 0) / 100), homes, note: 'Average home price that recovers the total cost after sales commission.' };
  const egi = R.ops.egi, opexRatio = egi > 0 ? R.ops.opex / egi : null, vac = ((R.A.vacancyPct || 0) + (R.A.creditPct || 0)) / 100, cap = (v.marketCap ?? R.A.marketCap) / 100;
  if (units > 0 && opexRatio != null && opexRatio < 1) {
    const share = R.ops.lines.filter(l => l.use === 'multifamily').reduce((s, l) => s + l.v, 0) / Math.max(1, R.ops.gpr); // (the apartments' share of the revenue carries their share of the cost)
    const cost = b.total * share, target = cap + 0.015;
    return { kind: 'rent', rent: F.breakEvenRent(cost, units, cap, opexRatio, vac), rentForTarget: F.rentForYield(cost, units, target, opexRatio, vac), target, units,
      current: R.ops.lines.filter(l => l.kind === 'rent' && l.use === 'multifamily').reduce((s, l) => s + l.v, 0) / units / 12,
      note: 'Average monthly rent a unit at which stabilized value (NOI ÷ market cap) equals cost, and the rent for a yield on cost 1.5% over the market cap (a usual development spread).' };
  }
  const leasable = R.ops.nrsfComm || R.P.nrsf || 0;
  if (leasable > 0 && egi > 0) { const need = b.total * cap, now = R.ops.noi; return { kind: 'noi', noi: need, current: now, perSf: need / leasable, note: 'Stabilized NOI at which value equals cost.' }; }
  return null;
}

// ---------- the hold analysis ----------
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number), t = y * 12 + (m - 1) + n; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); };
// the stabilized asset bought at its total development cost and held `hold` years (5 or 10, the engine's horizons)
export function holdAnalysis(pf, v, { startMonth = null, name = 'Stabilized hold' } = {}) {
  const R = pf.R; if (R.forSale || !(R.ops.noi > 0)) return { skipped: R.forSale ? 'For-sale homes are sold as they are built: no hold.' : 'No stabilized income to hold.' };
  const g = t => (1 + R.A.rentGrowth / 100) ** t, ge = t => (1 + R.A.expGrowth / 100) ** t, yrs = Math.floor(R.sched.toStabilize / 12);
  const rentLines = R.ops.lines.filter(l => l.kind === 'rent' || l.kind === 'rec'), otherLines = R.ops.lines.filter(l => l.kind !== 'rent' && l.kind !== 'rec');
  const pri = rentLines.reduce((s, l) => s + l.v, 0) * g(yrs), other = otherLines.reduce((s, l) => s + l.v, 0) * g(yrs);
  const vac = R.ops.gpr > 0 ? R.ops.loss / rentLines.concat(otherLines.filter(l => l.kind !== 'hotel')).reduce((s, l) => s + l.v, 0) : 0; // (the pro forma's vacancy and credit loss)
  const horizon = (v.hold || R.A.hold) > 5 ? 10 : 5, perm = R.exit.perm > 0 ? R.exit.perm : 0;
  const now = startMonth || new Date().toISOString().slice(0, 7);
  const input = {
    schemaVersion: 1, analysisName: name,
    property: { name, size: R.ops.aptUnits ? { unit: 'units', value: R.ops.aptUnits } : { unit: 'squareFeet', value: Math.max(1, Math.round(R.P.nrsf || R.P.gsf)) }, unitCount: R.P.units || null, purchaseMonth: addMonths(now, R.sched.toStabilize) },
    projection: { years: horizon, taxMode: 'beforeTax' },
    acquisition: { basis: { mode: 'purchasePrice', value: Math.round(R.budget.total) }, costPercent: 0 },
    income: { mode: 'aggregate', year1PotentialIncome: Math.round(pri), growth: { mode: 'constant', value: R.A.rentGrowth / 100 }, otherIncome: other > 0 ? [{ label: 'Other income', year1Amount: Math.round(other), growth: { mode: 'constant', value: R.A.rentGrowth / 100 } }] : [] },
    vacancy: { mode: 'constant', value: Math.min(0.99, Math.max(0, vac)) },
    expenses: { mode: 'annualDollar', value: Math.round(R.ops.opex * ge(yrs)), growth: { mode: 'constant', value: R.A.expGrowth / 100 } },
    capitalExpenses: [],
    financing: { loans: perm > 0 ? [{ label: 'Permanent loan', kind: 'newAmortizing', amount: { mode: 'amount', value: Math.round(perm) }, annualRate: R.A.permRate / 100, amortizationYears: R.A.amort, termYears: Math.max(horizon, 10), feePercent: (R.A.loanFeePct || 0) / 100, interestCalculation: '30/360' }] : [] },
    disposition: { exitCapRate: { mode: 'constant', value: R.A.exitCap / 100 }, sellingCostPercent: R.A.dispPct / 100 },
    reportOptions: { includeSensitivity: true }
  };
  try { return { input, result: calculateInvestmentAnalysis(input) }; }
  catch (e) { return { input, error: e.message, validation: e.validation || null }; }
}
