// Metrics over a list of filings, shared by the headline tiles (kpis.js), Compare (compare.js) and reports (export.js).
// Each: k, label, fn(list) -> number | string, fmt(value) -> text, and whether a higher number reads as "more activity".
import { entityKey } from './lib/taxonomy.mjs';

const fmtM = v => v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(v >= 1e8 ? 0 : 1) + 'M' : v >= 1e3 ? '$' + Math.round(v / 1e3) + 'K' : '$' + Math.round(v);
const fmtN = n => Math.round(n).toLocaleString('en-US');
const sum = (l, f) => l.reduce((s, x) => s + (f(x) || 0), 0);
const iso = d => d.toISOString().slice(0, 10);
const today = () => iso(new Date()), daysFrom = n => iso(new Date(Date.now() + n * 864e5));
const median = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const topBy = (l, key, w = () => 1) => { const m = new Map(); for (const f of l) { const k = key(f); if (k) m.set(k, (m.get(k) || 0) + w(f)); } return [...m.entries()].sort((a, b) => b[1] - a[1])[0]; };
const dash = v => v ? v : '–';

export const METRICS = [
  { k: 'count', label: 'Filings', fn: l => l.length, fmt: fmtN },
  { k: 'value', label: 'Est. value', fn: l => sum(l, f => f.cost), fmt: fmtM },
  { k: 'new', label: 'New builds', fn: l => l.filter(f => f.type === 'New').length, fmt: fmtN },
  { k: 'newValue', short: 'New value', label: 'New build value', fn: l => sum(l.filter(f => f.type === 'New'), f => f.cost), fmt: fmtM },
  { k: 'reno', label: 'Renovations', fn: l => l.filter(f => f.type === 'Reno').length, fmt: fmtN },
  { k: 'add', label: 'Additions', fn: l => l.filter(f => f.type === 'Addition').length, fmt: fmtN },
  { k: 'avg', label: 'Avg. value', fn: l => l.length ? sum(l, f => f.cost) / l.length : 0, fmt: v => v ? fmtM(v) : '–' },
  { k: 'median', short: 'Median value', label: 'Median value', fn: l => median(l.map(f => f.cost)), fmt: v => v ? fmtM(v) : '–' },
  { k: 'big', short: 'Over $5M', label: '$5M+ projects', fn: l => l.filter(f => f.cost >= 5e6).length, fmt: fmtN },
  { k: 'active', short: 'Building now', label: 'Under construction', fn: l => { const t = today(); return l.filter(f => f.ts <= t && f.te >= t).length; }, fmt: fmtN },
  { k: 'starting', short: 'Start ≤ 90 days', label: 'Starting in 90 days', fn: l => { const t = today(), e = daysFrom(90); return l.filter(f => f.ts > t && f.ts <= e).length; }, fmt: fmtN },
  { k: 'last30', short: 'Filed 30 days', label: 'Filed last 30 days', fn: l => { const s = daysFrom(-30); return l.filter(f => (f.reg || '') >= s).length; }, fmt: fmtN },
  { k: 'sqft', label: 'Sq ft filed', fn: l => sum(l, f => f.sqft), fmt: v => v ? fmtN(v) : '–' },
  { k: 'psf', short: '$ / sq ft', label: 'Avg. $ / sq ft', fn: l => { const w = l.filter(f => f.sqft > 0 && f.cost > 0); const sq = sum(w, f => f.sqft); return sq ? sum(w, f => f.cost) / sq : 0; }, fmt: v => v ? '$' + Math.round(v) : '–' },
  { k: 'units', short: 'Units', label: 'Housing units', fn: l => sum(l, f => f.units), fmt: v => v ? fmtN(v) : '–' },
  { k: 'devs', label: 'Developers', fn: l => new Set(l.map(f => entityKey(f.dev || f.owner)).filter(Boolean)).size, fmt: fmtN },
  { k: 'changed', short: 'Changed', label: 'Changed this week', fn: l => l.filter(f => f._chg).length, fmt: fmtN },
  { k: 'largest', short: 'Largest', label: 'Largest project', fn: l => l.reduce((m, f) => Math.max(m, f.cost), 0), fmt: v => v ? fmtM(v) : '–' },
  { k: 'topUse', short: 'Top use', label: 'Top use (by value)', text: true, fn: l => dash(topBy(l, f => f.use, f => f.cost)?.[0]), fmt: v => v },
  { k: 'topCity', short: 'Top city', label: 'Busiest city', text: true, fn: l => dash(topBy(l, f => f.city)?.[0]), fmt: v => v },
  { k: 'topDev', short: 'Top developer', label: 'Top developer', text: true, fn: l => { const t = topBy(l, f => f.dev || f.owner, f => f.cost); return dash(t?.[0]); }, fmt: v => v }
];
export const BY_KEY = new Map(METRICS.map(m => [m.k, m]));
export const DEFAULT_KPIS = ['count', 'value', 'new', 'newValue', 'active', 'starting', 'avg', 'big', 'sqft'];
export const metricValue = (k, list) => { const m = BY_KEY.get(k); return m ? m.fn(list) : null; };
export const metricText = (k, list) => { const m = BY_KEY.get(k); return m ? m.fmt(m.fn(list)) : ''; };
