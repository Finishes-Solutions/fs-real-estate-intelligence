// @ts-check
// Cost escalation: what a rate priced on its library's as-of month costs at the middle of construction.
//   to date: the BLS PPI for construction materials (FRED WPUSI012011, refreshed nightly into data/markets.json) from
//            the rate's month to the latest month published, applied to the materials share of the cost only (labor and
//            fees don't follow a materials index);
//   forward: an annual escalation assumption from today to the construction midpoint.
// factor = (1 + materialsShare × (PPI now / PPI then − 1)) × (1 + forward)^(years to midpoint). Every part of it is
// returned with its source so the budget and the report can show the working.
import { indexAt } from './market.mjs';

const ym = d => String(d || '').slice(0, 7);
const monthsBetween = (a, b) => { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); };

// ctx: marketContext(); basisMonth: the rate's as-of 'YYYY-MM' (null: no to-date step, e.g. a rate with no month);
// materialsShare 0..1; forwardPct: % a year; monthsToMid: months from now to the construction midpoint; today 'YYYY-MM'
export function escalation(ctx, { basisMonth = null, materialsShare = 0.55, forwardPct = 3.5, monthsToMid = 0, today = null } = {}) {
  const ppi = ctx?.ppi || null, now = today || ym(ppi?.latest?.date) || null;
  let toDate = { factor: 1, note: basisMonth ? 'No construction-cost index in the platform data: no to-date escalation applied.' : 'The rate has no as-of month: no to-date escalation applied.' };
  if (basisMonth && ppi) {
    const a = indexAt(ppi, basisMonth), b = ppi.latest ? { month: ym(ppi.latest.date), value: ppi.latest.value } : null;
    if (a && b && b.month >= a.month) {
      const change = b.value / a.value - 1;
      toDate = { factor: 1 + materialsShare * change, from: a, to: b, change, materialsShare,
        note: ppi.label + ' ' + a.month + ' ' + a.value + ' → ' + b.month + ' ' + b.value + ' (' + (change * 100).toFixed(2) + '%) × materials share ' + Math.round(materialsShare * 100) + '%' };
    }
  }
  const years = Math.max(0, monthsToMid) / 12, fwd = Math.pow(1 + forwardPct / 100, years);
  const forward = { factor: fwd, pct: forwardPct, years, note: forwardPct + '% a year for ' + years.toFixed(2) + ' years to the construction midpoint' };
  return { factor: toDate.factor * fwd, toDate, forward, today: now, monthsBetween: basisMonth && now ? monthsBetween(basisMonth, now) : null };
}
