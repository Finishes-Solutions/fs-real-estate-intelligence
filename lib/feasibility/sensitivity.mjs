// @ts-check
// Sensitivity analysis (docs/INTEGRATION_PLAN.md §5.5): how the returns move when one input moves (a tornado), and a
// two-way grid of two inputs. Each case re-runs the whole budget and pro forma (lib/feasibility/pipeline.mjs
// evaluate), so a cost change carries its contingency, fee and financing with it.
// A case is { set: { key: delta } } added to the assumption values, or costFactor / rentFactor multipliers. Each driver's
// lo case is the unfavourable one (the risk register reads it as the downside).

export const DRIVERS = [
  { id: 'cost', label: 'Hard and site cost', lo: { costFactor: 1.1 }, hi: { costFactor: 0.9 }, loText: '+10%', hiText: '−10%' },
  { id: 'rent', label: 'Rents (or sale prices)', lo: { rentFactor: 0.9 }, hi: { rentFactor: 1.1 }, loText: '−10%', hiText: '+10%' },
  { id: 'exitCap', label: 'Exit cap rate', lo: { set: { exitCap: 0.5 } }, hi: { set: { exitCap: -0.5 } }, loText: '+0.50%', hiText: '−0.50%' },
  { id: 'rate', label: 'Construction loan rate', lo: { set: { rate: 1 } }, hi: { set: { rate: -1 } }, loText: '+1.00%', hiText: '−1.00%' },
  { id: 'build', label: 'Construction period', lo: { set: { 'sched.build': 3 } }, hi: { set: { 'sched.build': -3 } }, loText: '+3 months', hiText: '−3 months' },
  { id: 'vacancy', label: 'Stabilized vacancy', lo: { set: { vacancyPct: 2 } }, hi: { set: { vacancyPct: -2 } }, loText: '+2 pts', hiText: '−2 pts' },
  { id: 'land', label: 'Land price', lo: { mult: { landPrice: 1.15 } }, hi: { mult: { landPrice: 0.85 } }, loText: '+15%', hiText: '−15%' }
];

// the values for one case
export function applyCase(v, c = {}) {
  const out = { ...v };
  for (const [k, d] of Object.entries(c.set || {})) if (Number.isFinite(out[k])) out[k] = Math.max(0, out[k] + d);
  for (const [k, m] of Object.entries(c.mult || {})) if (Number.isFinite(out[k])) out[k] = out[k] * m;
  if (out['sched.build'] != null) out['sched.build'] = Math.max(1, Math.round(out['sched.build']));
  return out;
}

const pick = (r, metric) => r?.headline?.[metric] ?? null;

// evalFn(values, { costFactor, rentFactor }) → { headline }; metric: a headline key (levIrr, unlevIrr, profit, npvLev,
// yoc, margin)
export function tornado(evalFn, v, { metric = 'levIrr', drivers = DRIVERS } = {}) {
  const base = pick(evalFn(v, {}), metric), rows = [];
  for (const d of drivers) {
    if (d.id === 'vacancy' && !Number.isFinite(v.vacancyPct)) continue;
    const run = c => pick(evalFn(applyCase(v, c), { costFactor: c.costFactor ?? 1, rentFactor: c.rentFactor ?? 1 }), metric);
    const lo = run(d.lo), hi = run(d.hi);
    rows.push({ id: d.id, label: d.label, loText: d.loText, hiText: d.hiText, lo, hi, swing: lo != null && hi != null ? Math.abs(hi - lo) : null });
  }
  rows.sort((a, b) => (b.swing ?? -1) - (a.swing ?? -1));
  return { metric, base, rows };
}

// a two-way grid: rows × cols of cases, each cell the metric
export function grid(evalFn, v, { metric = 'levIrr', rows, cols }) {
  const cells = rows.map(r => cols.map(c => {
    const cs = { set: { ...(r.case.set || {}), ...(c.case.set || {}) }, mult: { ...(r.case.mult || {}), ...(c.case.mult || {}) } };
    const f = { costFactor: (r.case.costFactor ?? 1) * (c.case.costFactor ?? 1), rentFactor: (r.case.rentFactor ?? 1) * (c.case.rentFactor ?? 1) };
    return pick(evalFn(applyCase(v, cs), f), metric);
  }));
  return { metric, rows: rows.map(r => r.label), cols: cols.map(c => c.label), cells };
}
const steps = (vals, f, fmt) => vals.map(x => ({ label: fmt(x), case: f(x) }));
export const RENT_STEPS = steps([-0.1, -0.05, 0, 0.05, 0.1], x => ({ rentFactor: 1 + x }), x => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x * 100) + '% rent');
export const COST_STEPS = steps([-0.1, -0.05, 0, 0.05, 0.1], x => ({ costFactor: 1 + x }), x => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x * 100) + '% cost');
export const CAP_STEPS = steps([-0.5, -0.25, 0, 0.25, 0.5], x => ({ set: { exitCap: x } }), x => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(2) + '% exit cap');
export const RATE_STEPS = steps([-1, -0.5, 0, 0.5, 1], x => ({ set: { rate: x, permRate: x } }), x => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(2) + '% rates');
