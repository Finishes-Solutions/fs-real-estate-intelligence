// The Demographics report as HTML strings: rings around a property (1, 3 and 5 miles by default, or the radii asked for), or
// one county or drawn area, from the census tracts the app holds (ACS 5-year, LEHD LODES jobs, modeled consumer spending).
// Made by the MCP server's report tool (lib/mcp/reports.mjs); DOM-free and in the same report kit and style as every other
// report (src/reportkit.js, passed in), so the website can offer it too.
import { CAT_LABEL } from '../spending.mjs';

export const RING_COL = ['#0b7a5f', '#2f7d4f', '#6a9f7e', '#a3c2ae']; // innermost ring darkest
// the figures a ring has, in report order: [label, value(s, h), format]
const ROWS = [['Population', s => s.population, 'n'], ['Population growth', s => s.population_growth_pct, 'pct'], ['Households', s => s.households, 'n'], ['Housing units', s => s.housing_units, 'n'],
  ['Vacancy', s => s.vacancy_rate_pct, 'pct0'], ['Median household income (approx.)', s => s.median_household_income_approx, 'usd'], ['Median home value (approx.)', s => s.median_home_value_approx, 'usd'],
  ['Median gross rent (approx.)', s => s.median_gross_rent_approx, 'usd'], ['Median age (approx.)', s => s.median_age_approx, 'n1'], ['Jobs located here (LODES)', s => s.jobs, 'n'],
  ['Consumer spending a year (est.)', s => s.consumer_spending_estimate?.per_year, 'usdM'], ['Spending per household (est.)', s => s.consumer_spending_estimate?.per_household, 'usd'], ['Census tracts', s => s.tracts, 'n']];

// K: { esc, fmtN, fmtM, kpiStrip, table, areaMap, circle, reportDoc }
export function demographicsReport(K) {
  const { esc, fmtN, fmtM, kpiStrip, table, areaMap, circle, reportDoc } = K;
  const f = (v, how) => v == null || !Number.isFinite(+v) ? '—' : how === 'usd' ? '$' + fmtN(Math.round(v)) : how === 'usdM' ? fmtM(v) : how === 'pct' ? (v > 0 ? '+' : '') + v + '%' : how === 'pct0' ? v + '%' : how === 'n1' ? String(v) : fmtN(Math.round(v));
  // rings: [{ label, mi?, s (summarizeTracts), h (housing) }]; center: [lon, lat] (rings) or null; area: the county / drawn
  // area or the parcel outline; years: { acs, jobs, spend }
  function reportHtml({ label, center = null, rings, area = null, parcel = null, years = {} }) {
    const ok = rings.filter(r => r.s), main = ok[Math.min(1, ok.length - 1)] || ok[0];
    const layers = [...(area ? [{ geometry: area, stroke: '#0b7a5f', fill: 'rgba(0,101,39,.08)' }] : []),
      ...(center ? rings.filter(r => r.mi).map((r, i) => ({ geometry: circle(center, r.mi), stroke: RING_COL[i] || '#0b7a5f', fill: 'rgba(0,101,39,.03)', dash: i > 0, width: 2 })) : []),
      ...(parcel ? [{ geometry: parcel, stroke: '#c2410c', fill: 'rgba(194,65,12,.25)', width: 1.5 }] : [])];
    const map = layers.length ? '<div class="map">' + areaMap(layers, { W: 1000, H: 520, points: center ? [{ c: center, r: 5, color: '#c2410c', label: 'Site' }] : [] }) + '</div>' +
      (center ? '<div class="lg">' + rings.filter(r => r.mi).map((r, i) => '<span><i style="background:' + (RING_COL[i] || '#0b7a5f') + '"></i>' + esc(r.label) + '</span>').join('') + '</div>' : '') : '';
    const kp = main?.s ? kpiStrip([[f(main.s.population, 'n'), 'People · ' + main.label], [f(main.s.households, 'n'), 'Households'], [f(main.s.median_household_income_approx, 'usd'), 'Median household income (approx.)'], [f(main.s.median_home_value_approx, 'usd'), 'Median home value (approx.)']]) : '';
    const cols = ['', ...rings.map(r => ({ t: r.label, r: true }))];
    const figures = table(cols, ROWS.map(([l, v, how]) => [esc(l === 'Population growth' && years.base ? l + ' since ' + years.base : l), ...rings.map(r => r.s ? f(v(r.s), how) : '—')]));
    const bands = rings.find(r => r.h?.income)?.h.income.map(b => b.label) || [];
    const income = bands.length ? table(['Household income', ...rings.map(r => ({ t: r.label, r: true }))], bands.map((b, i) => [esc(b), ...rings.map(r => r.h?.income ? r.h.income[i].pct.toFixed(1) + '%' : '—')])) : '';
    const cats = Object.keys(rings.find(r => r.s?.consumer_spending_estimate)?.s.consumer_spending_estimate.by_category || {});
    const spend = cats.length ? table(['Spending a year (est.)', ...rings.map(r => ({ t: r.label, r: true }))], cats.sort((a, b) => (main.s?.consumer_spending_estimate?.by_category?.[b] || 0) - (main.s?.consumer_spending_estimate?.by_category?.[a] || 0))
      .map(k => [esc(CAT_LABEL[k] || k), ...rings.map(r => f(r.s?.consumer_spending_estimate?.by_category?.[k], 'usdM'))])) : '';
    const body = kp + map + '<h2>' + (rings.length > 1 ? 'By ring' : 'The area') + '</h2>' + figures +
      '<p class="rnote">' + (center ? 'A ring counts every census tract whose centre is within the radius (and the tract the site is in), so its edge follows tract lines. ' : 'The area counts every census tract whose centre is inside it. ') + 'Medians combined over several tracts are household-weighted averages of the tract medians (approx.), not true medians.</p>' +
      (income ? '<div class="bsec"><h2>Households by income</h2>' + income + '</div>' : '') +
      (spend ? '<div class="bsec"><h2>Consumer spending by category</h2>' + spend + '<p class="rnote">Modeled, not measured: households by income (ACS) × what households at that income spend (BLS Consumer Expenditure Survey, South region).</p></div>' : '');
    const sources = 'US Census Bureau American Community Survey 5-year estimates (' + esc(years.acs || 'latest') + '), census tracts; US Census LEHD LODES 8 workplace jobs (' + esc(years.jobs || 'latest') + '); consumer spending modeled from ACS household income and the BLS Consumer Expenditure Survey (' + esc(years.spend || 'latest') + '). Covers the seven home counties (Waller, Harris, Fort Bend, Montgomery, Austin, Washington, Grimes); tracts outside them are not counted.';
    return reportDoc({ kicker: 'Demographics report', title: label, meta: esc(rings.length > 1 ? 'Rings of ' + rings.filter(r => r.mi).map(r => r.mi).join(', ') + ' miles' : 'One area') + ' · ACS ' + esc(years.acs || ''), body, sources });
  }
  return { reportHtml };
}
// the figures as CSV rows: one row per ring and figure, then income bands and spending categories
export function demographicsCsvRows(rings) {
  const rows = [];
  for (const r of rings) {
    if (!r.s) { rows.push({ Area: r.label, Table: 'Figures', Item: 'No census tracts', Value: '' }); continue; }
    for (const [l, v] of ROWS) rows.push({ Area: r.label, Table: 'Figures', Item: l, Value: v(r.s) ?? '' });
    for (const b of r.h?.income || []) rows.push({ Area: r.label, Table: 'Households by income (%)', Item: b.label, Value: +b.pct.toFixed(2) });
    for (const [k, v] of Object.entries(r.s.consumer_spending_estimate?.by_category || {})) rows.push({ Area: r.label, Table: 'Consumer spending a year (est., $)', Item: CAT_LABEL[k] || k, Value: Math.round(v) });
  }
  return rows;
}
