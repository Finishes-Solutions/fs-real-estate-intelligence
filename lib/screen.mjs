// Layer filters (the Filters panel), shared by the browser and the tests.
// Each criterion is a threshold on a census-tract value (data/market.json): the demographics come from the ACS, `aadt`
// (the busiest counted road through the tract, TxDOT) and `fl` (FEMA National Risk Index flood rating, 1 very low … 5 very
// high) from the nightly build (build/tractrisk.mjs), and `proj` (construction filings in the tract, matching the filing
// filters) is counted in the browser.
//   Filter each layer: the demographic criteria fade the tracts that fail on the Demographics layer; the traffic one hides
//                      quieter roads on the Traffic Counts layer.
//   Match everything:  a tract matches when it passes every criterion that's set; the map highlights the matches.
export const CRITERIA = [
  { k: 'inc', group: 'demo', label: 'Median household income', op: 'min', opts: [50000, 75000, 100000, 125000, 150000], fmt: 'money' },
  { k: 'gr', group: 'demo', label: 'Population growth (5 years)', op: 'min', opts: [0, 5, 10, 20], fmt: 'pct' },
  { k: 'val', group: 'demo', label: 'Median home value', op: 'min', opts: [200000, 300000, 400000, 500000], fmt: 'money' },
  { k: 'rent', group: 'demo', label: 'Median rent', op: 'min', opts: [1000, 1250, 1500, 2000], fmt: 'rent' },
  { k: 'vacr', group: 'demo', label: 'Housing vacancy', op: 'max', opts: [5, 8, 10, 15], fmt: 'pct' },
  { k: 'jobs', group: 'demo', label: 'Jobs located here', op: 'min', opts: [500, 1000, 2500, 5000], fmt: 'num' },
  { k: 'aadt', group: 'traffic', label: 'Busiest road', op: 'min', opts: [10000, 25000, 50000, 100000], fmt: 'cars' },
  { k: 'fl', group: 'risk', label: 'FEMA flood risk', op: 'max', opts: [1, 2, 3], fmt: 'risk', matchOnly: true },
  { k: 'proj', group: 'filings', label: 'Construction projects', op: 'range', opts: ['none', '1+', '5+', '20+'], fmt: 'proj', matchOnly: true }
];
export const BY = Object.fromEntries(CRITERIA.map(c => [c.k, c]));
export const RISK = ['', 'Very low', 'Relatively low', 'Relatively moderate', 'Relatively high', 'Very high'];
const money = v => '$' + (v >= 1e6 ? +(v / 1e6).toFixed(1) + 'M' : Math.round(v / 1e3) + 'K');
const num = v => v.toLocaleString('en-US');
// "at least $75K", "at most 8%", "low or below" …
export function optLabel(c, v) {
  if (c.fmt === 'proj') return { none: 'None', '1+': 'At least 1', '5+': 'At least 5', '20+': 'At least 20' }[v] || v;
  if (c.fmt === 'risk') return RISK[v] + (v < 5 ? ' or lower' : '');
  const s = c.fmt === 'money' ? money(v) : c.fmt === 'pct' ? v + '%' : c.fmt === 'rent' ? '$' + num(v) + '/mo' : c.fmt === 'cars' ? num(v) + ' cars/day' : num(v);
  return (c.op === 'max' ? 'At most ' : 'At least ') + s;
}
// the criteria that are set: { inc: 75000, fl: 2, … } → [[criterion, value], …]
export const active = f => CRITERIA.filter(c => f && f[c.k] != null && f[c.k] !== '').map(c => [c, f[c.k]]);
function passOne(c, v, x) {
  if (c.k === 'proj') { const n = v || 0; return x === 'none' ? n === 0 : n >= parseInt(x, 10); }
  if (v == null || !Number.isFinite(+v)) return false; // no data: not a match
  return c.op === 'max' ? +v <= +x : +v >= +x;
}
// does a tract pass every criterion that's set? (keys limits it to some of them)
export function tractPasses(t, f, keys) {
  for (const [c, x] of active(f)) { if (keys && !keys.includes(c.k)) continue; if (!passOne(c, t[c.k], x)) return false; }
  return true;
}
// the same test as a MapLibre filter expression on tract features (for fading tracts in "filter each layer" mode)
export function tractExpr(f, keys) {
  const parts = active(f).filter(([c]) => (!keys || keys.includes(c.k)) && c.k !== 'proj').map(([c, x]) => [c.op === 'max' ? '<=' : '>=', ['coalesce', ['get', c.k], c.op === 'max' ? 1e15 : -1e15], +x]);
  return parts.length ? ['all', ...parts] : null;
}
// plain-language summary: "Median household income at least $75K · Busiest road at least 25,000 cars/day"
export const describeScreen = f => active(f).map(([c, x]) => { const o = optLabel(c, x); return c.label + ': ' + o[0].toLowerCase() + o.slice(1); }).join(' · ');
