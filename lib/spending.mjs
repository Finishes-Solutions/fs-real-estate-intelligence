// Modeled consumer spending per census tract (free data, clearly an estimate):
//   households by income bracket (Census ACS B19001, 16 brackets)
//   × mean annual spending per consumer unit by income range (BLS Consumer Expenditure Survey)
//   × a South-region factor per category (CE South mean / all consumer units).
// National spending patterns applied to local incomes: right in aggregate, not a measurement of any one tract.
// Shared by the build (build/spending.mjs) and the browser (labels).

// ACS B19001_002E…017E: household income brackets in dollars [low, high]
export const ACS_BRACKETS = [[0, 9999], [10000, 14999], [15000, 19999], [20000, 24999], [25000, 29999], [30000, 34999], [35000, 39999], [40000, 44999],
  [45000, 49999], [50000, 59999], [60000, 74999], [75000, 99999], [100000, 124999], [125000, 149999], [150000, 199999], [200000, Infinity]];
export const ACS_BRACKET_VARS = ACS_BRACKETS.map((_, i) => 'B19001_' + String(i + 2).padStart(3, '0') + 'E');

// CE items we model, matched by their published names
export const CATS = [
  ['total', 'Total spending', /^average annual expenditures$/i],
  ['fh', 'Groceries', /^food at home$/i],
  ['fa', 'Dining out', /^food away from home$/i],
  ['ho', 'Housing', /^housing$/i],
  ['hf', 'Home furnishings & equipment', /^household furnishings and equipment$/i],
  ['ap', 'Apparel & services', /^apparel and services$/i],
  ['vp', 'Vehicle purchases', /^vehicle purchases/i],
  ['hc', 'Healthcare', /^healthcare$/i],
  ['en', 'Entertainment', /^entertainment$/i]
];
export const CAT_LABEL = Object.fromEntries(CATS.map(([k, l]) => [k, l]));

const TOP = 1e12; // the open top range ("$200,000 and more"); finite so it survives JSON
// "$15,000 to $29,999" / "Less than $15,000" / "$200,000 and more" -> [low, high]; anything else -> null
export function parseRange(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim(), nums = (t.match(/\$?\d[\d,]*/g) || []).map(x => +x.replace(/[$,]/g, ''));
  if (/^less than|^under/i.test(t) && nums.length === 1) return [0, nums[0] - 1];
  if (/and (more|over)|or more|and above/i.test(t) && nums.length === 1) return [nums[0], TOP];
  if (/ to | - |–/.test(t) && nums.length === 2) return [nums[0], nums[1]];
  return null;
}

// which CE range each ACS bracket falls in (by the bracket's midpoint; the open top bracket goes to the open top range)
export function bracketMap(ranges) {
  return ACS_BRACKETS.map(([lo, hi]) => {
    const mid = hi === Infinity ? lo + 1 : (lo + hi) / 2;
    const i = ranges.findIndex(([a, b]) => mid >= a && mid <= b);
    return i < 0 ? (hi === Infinity ? ranges.length - 1 : 0) : i;
  });
}

// ce = { year, ranges: [[lo,hi]...], means: { cat: [mean per range] }, south: { cat: factor } }
// brackets = 16 household counts -> { spend, sph, sp: { cat: $ } } (whole dollars, per year), or null without households
export function spendFor(brackets, ce) {
  if (!Array.isArray(brackets) || brackets.length !== 16 || !ce?.means?.total) return null;
  const map = bracketMap(ce.ranges), hh = brackets.reduce((a, b) => a + (b > 0 ? b : 0), 0); if (!hh) return null;
  const sp = {};
  for (const [k] of CATS) {
    const m = ce.means[k]; if (!m) continue;
    let s = 0; brackets.forEach((n, i) => { if (n > 0 && m[map[i]] != null) s += n * m[map[i]]; });
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

// ---------- reading the BLS CE flat-file catalog (download.bls.gov/pub/time.series/cx/) ----------
// tab-separated with a header row; returns [{col: value}]
export function parseTsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter(l => l.trim()), h = (lines[0] || '').split('\t').map(x => x.trim());
  return lines.slice(1).map(l => { const c = l.split('\t'); return Object.fromEntries(h.map((k, i) => [k, (c[i] || '').trim()])); });
}
// From the catalog files, the series ids to ask for: mean spending for each category × each income range,
// plus the South and all-consumer-units means for the regional factor.
export function pickSeries({ series, items, demographics, characteristics, processes }) {
  const itemCode = {};
  for (const [k, , re] of CATS) {
    const hit = items.filter(i => re.test(i.item_text)).sort((a, b) => (+a.display_level || 0) - (+b.display_level || 0))[0];
    if (hit) itemCode[k] = hit.item_code;
  }
  const incDemo = demographics.find(d => /income before taxes/i.test(d.demographics_text) && !/quintile|decile/i.test(d.demographics_text));
  const regDemo = demographics.find(d => /region/i.test(d.demographics_text));
  const mean = (processes || []).find(p => /mean/i.test(p.process_text))?.process_code || 'M';
  const chars = d => characteristics.filter(c => c.demographics_code === d?.demographics_code);
  const ranges = chars(incDemo).map(c => ({ code: c.characteristics_code, r: parseRange(c.characteristics_text) })).filter(x => x.r).sort((a, b) => a.r[0] - b.r[0]);
  const south = chars(regDemo).find(c => /^south$/i.test(c.characteristics_text)), allCU = chars(regDemo).find(c => /all consumer units/i.test(c.characteristics_text));
  const find = (item, demo, ch) => series.find(s => s.item_code === item && s.demographics_code === demo && s.characteristics_code === ch && (!s.process_code || s.process_code === mean))?.series_id;
  const want = {};
  for (const [k] of CATS) {
    const ic = itemCode[k]; if (!ic) continue;
    want[k] = { ranges: ranges.map(x => find(ic, incDemo.demographics_code, x.code)), south: south && find(ic, regDemo.demographics_code, south.characteristics_code), all: allCU && find(ic, regDemo.demographics_code, allCU.characteristics_code) };
  }
  return { ranges: ranges.map(x => x.r), want, missing: CATS.map(c => c[0]).filter(k => !itemCode[k]) };
}
// values { series_id: number } (one year) + picked series -> ce coefficients
export function ceFrom(picked, values, year) {
  const means = {}, south = {};
  for (const [k, w] of Object.entries(picked.want)) {
    const m = w.ranges.map(id => id && Number.isFinite(values[id]) ? values[id] : null);
    if (m.filter(v => v != null).length < Math.max(3, m.length - 1)) continue;
    means[k] = m;
    if (w.south && w.all && values[w.south] > 0 && values[w.all] > 0) south[k] = Math.round(values[w.south] / values[w.all] * 1000) / 1000;
  }
  return means.total ? { year, ranges: picked.ranges, means, south } : null;
}
