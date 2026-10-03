// Modeled consumer spending per census tract (free data, clearly an estimate):
//   households by income bracket (Census ACS B19001, 16 brackets)
//   × mean annual spending per consumer unit at that income (BLS Consumer Expenditure Survey, by income quintile, read between quintiles)
//   × a South-region factor per category (CE South mean / all consumer units).
// National spending patterns applied to local incomes: right in aggregate, not a measurement of any one tract.
// Shared by the build (build/spending.mjs) and the browser (labels).

// ACS B19001_002E…017E: household income brackets in dollars [low, high]
export const ACS_BRACKETS = [[0, 9999], [10000, 14999], [15000, 19999], [20000, 24999], [25000, 29999], [30000, 34999], [35000, 39999], [40000, 44999],
  [45000, 49999], [50000, 59999], [60000, 74999], [75000, 99999], [100000, 124999], [125000, 149999], [150000, 199999], [200000, Infinity]];
export const ACS_BRACKET_VARS = ACS_BRACKETS.map((_, i) => 'B19001_' + String(i + 2).padStart(3, '0') + 'E');

// CE items we model: [key, label, BLS item code]
export const CATS = [
  ['total', 'Total spending', 'TOTALEXP'],
  ['fh', 'Groceries', 'FOODHOME'],
  ['fa', 'Dining out', 'FOODAWAY'],
  ['ho', 'Housing', 'HOUSING'],
  ['hf', 'Home furnishings & equipment', 'HHFURNSH'],
  ['ap', 'Apparel & services', 'APPAREL'],
  ['vp', 'Vehicle purchases', 'VEHPURCH'],
  ['hc', 'Healthcare', 'HEALTH'],
  ['en', 'Entertainment', 'ENTRTAIN']
];
export const CAT_LABEL = Object.fromEntries(CATS.map(([k, l]) => [k, l]));

// CE series ids (CXU + item + demographic group + characteristic + M for mean), checked against the BLS API from GitHub Actions
// (build/probe-bls.mjs, 2026-10-03). The flat-file catalog that names them (download.bls.gov) refuses cloud servers, so they're pinned:
//   LB01 02…06 = income quintiles (lowest → highest 20%), with INCBEFTX = the quintile's mean income before taxes
//   LB11 01 = all consumer units, 04 = South
const QUINTILES = ['02', '03', '04', '05', '06'];
export const sid = (item, group, ch) => 'CXU' + item + group + ch + 'M';
export function seriesIds() {
  const ids = QUINTILES.map(q => sid('INCBEFTX', 'LB01', q));
  for (const [, , item] of CATS) ids.push(...QUINTILES.map(q => sid(item, 'LB01', q)), sid(item, 'LB11', '04'), sid(item, 'LB11', '01'));
  return ids;
}

// values { series_id: number } (one year) -> ce = { year, inc: [mean income per quintile], means: { cat: [mean per quintile] }, south: { cat: factor } },
// or null when the numbers don't look like the CE (income or total spending not rising across the quintiles)
export function ceFrom(values, year) {
  const get = id => Number.isFinite(values[id]) ? values[id] : null;
  const inc = QUINTILES.map(q => get(sid('INCBEFTX', 'LB01', q)));
  if (inc.some(v => v == null) || inc.some((v, i) => i && v <= inc[i - 1])) return null;
  const means = {}, south = {};
  for (const [k, , item] of CATS) {
    const m = QUINTILES.map(q => get(sid(item, 'LB01', q))); if (m.some(v => v == null)) continue;
    means[k] = m;
    const s = get(sid(item, 'LB11', '04')), all = get(sid(item, 'LB11', '01'));
    if (s > 0 && all > 0) south[k] = Math.round(s / all * 1000) / 1000;
  }
  if (!means.total || means.total.some((v, i) => i && v <= means.total[i - 1])) return null;
  return { year, inc, means, south };
}

// a bracket's typical income: its midpoint; the open top bracket ($200K+) takes the top quintile's mean income
const bracketIncome = (ce, [lo, hi]) => hi === Infinity ? Math.max(lo, ce.inc[ce.inc.length - 1]) : (lo + hi) / 2;
// spending at an income: straight line between the quintile points (mean income, mean spending), flat beyond the ends
export function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
  return ys[ys.length - 1];
}

// brackets = 16 household counts -> { spend, sph, hh, sp: { cat: $ } } (whole dollars, per year), or null without households
export function spendFor(brackets, ce) {
  if (!Array.isArray(brackets) || brackets.length !== 16 || !ce?.means?.total || !ce.inc) return null;
  const hh = brackets.reduce((a, b) => a + (b > 0 ? b : 0), 0); if (!hh) return null;
  const sp = {};
  for (const [k] of CATS) {
    const m = ce.means[k]; if (!m) continue;
    let s = 0; brackets.forEach((n, i) => { if (n > 0) s += n * interp(ce.inc, m, bracketIncome(ce, ACS_BRACKETS[i])); });
    sp[k] = Math.round(s * (ce.south?.[k] || 1));
  }
  const spend = sp.total; delete sp.total;
  return { spend, sph: Math.round(spend / hh), hh, sp };
}

// put the estimates on market.tracts (tract.ib = the 16 bracket counts from the ACS build)
export function mergeSpending(market, ce) {
  if (!market?.tracts || !ce) return market;
  let n = 0;
  const tracts = market.tracts.map(t => { const s = spendFor(t.ib, ce); if (!s) return t; n++;
    return { ...t, spend: s.spend, sph: s.sph, dine: s.sp.fa ?? null, furn: s.sp.hf ?? null, appa: s.sp.ap ?? null, sp: s.sp }; });
  return { ...market, tracts, spendYear: ce.year, spendTracts: n };
}
