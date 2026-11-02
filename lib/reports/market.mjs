// The Market report as a static print document: the Market page's sections (overview and what's moving, the construction
// pipeline, growth and demand, housing and rents, costs and rates, crime, roads and news) for one county, several, or the
// whole region. The Market page's own export copies its interactive charts off the screen (src/area.js); this builds the
// same numbers as print charts and tables from the shared calculations (lib/marketstats.mjs, lib/marketcalc.mjs), so it runs
// on a server (the MCP server's report_market, lib/mcp/reports.mjs). DOM-free; the report kit (src/reportkit.js) is passed in.
import { SECTORS } from '../sectors.mjs';
import { CAT_LABEL } from '../spending.mjs';
import { monthly, movers } from '../marketcalc.mjs';
import { CAT_NAME } from '../nibrs.mjs';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const COSTS = [['wpusi012011', 'Building materials'], ['wpu081', 'Lumber'], ['wpu101', 'Steel'], ['pcu327320327320', 'Ready-mix concrete'], ['pcoppusdm', 'Copper']];
export const HOMES = [['medlispri26420', 'Median listing price', 'usd'], ['actliscou26420', 'Homes for sale', 'n'], ['meddayonmar26420', 'Days on market', 'n'], ['hous448bpprivsa', 'Housing permits a month (seasonally adjusted)', 'n']];
const PRINT_CSS = '.mv li{margin:3px 0}.bars{margin-top:6px}.two{align-items:start}h3{break-after:avoid;margin-top:16px}.bars svg{overflow:visible}';

// M: { label, counties: [names], stats (marketStats), pipe (pipeline), housing, rents, unemployment: [{ name, rate, yearAgo, period }],
//      state, mortgages: { year, loans, dollars, purchase }, rates: [{ label, value, date, yearAgo }], markets (data/markets.json),
//      crime (api/crime city report) | { error } | null, traffic (api/traffic) | { error } | null, geoms: [GeoJSON], built }
// K: { esc, fmtN, fmtM, kpiStrip, table, bars, areaMap, reportDoc }
export function marketReport(K) {
  const { esc, fmtN, fmtM, kpiStrip, table, areaMap, reportDoc } = K;
  const pct = v => v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + (Math.abs(v) >= 10 ? Math.round(v) : v.toFixed(1)) + '%';
  const chg = (a, b) => a != null && b ? (a - b) / b * 100 : null;
  const upDown = v => (v >= 0 ? 'up ' : 'down ') + Math.abs(v).toFixed(Math.abs(v) < 10 ? 1 : 0) + '%';
  const money = v => v == null || !Number.isFinite(v) ? '—' : fmtM(v);
  const mlabel = m => MON[+m.slice(5) - 1] + ' ' + m.slice(2, 4);
  const title = t => /[a-z]/.test(t) ? t : String(t).toLowerCase().replace(/(^|[\s\-/(&.,])([a-z])/g, (m, a, c) => a + c.toUpperCase()).replace(/\b(Us|Sh|Fm|Ih|Llc|Lp|Ii|Iii)\b/g, x => x.toUpperCase());
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
  const note = t => '<p class="rnote">' + t + '</p>';
  // vertical bars like the kit's, with the first and last labels anchored inward so they print whole
  const bars = (list, { color = '#0b7a5f', height = 110, every = 1 } = {}) => {
    const W = 620, H = height, n = list.length || 1, bw = W / n, mx = Math.max(1, ...list.map(x => +x.v || 0)), edge = bw < 40; // narrow bars: the end labels would be cut off
    return '<svg viewBox="0 0 ' + W + ' ' + (H + 16) + '" xmlns="http://www.w3.org/2000/svg" role="img">' + list.map((x, i) => { const h = Math.max(x.v > 0 ? 1.5 : 0, (+x.v || 0) / mx * (H - 14)), X = i * bw, end = i === n - 1, lab = i % every === 0 || end;
      return '<rect x="' + (X + bw * .12).toFixed(1) + '" y="' + (H - h).toFixed(1) + '" width="' + (bw * .76).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="1.5" fill="' + (x.color || color) + '"/>' +
        (lab && !(end && i % every !== 0 && i % every < every / 2) ? '<text x="' + (edge && i === 0 ? X + 1 : edge && end ? X + bw - 1 : X + bw / 2).toFixed(1) + '" y="' + (H + 12) + '" font-size="9" text-anchor="' + (edge && i === 0 ? 'start' : edge && end ? 'end' : 'middle') + '" fill="#6b7174">' + esc(x.label) + '</text>' : ''); }).join('') + '</svg>';
  };

  function reportHtml(M) {
    const s = M.stats, p = M.pipe, h = M.housing, rn = M.rents, cur = new Date().toISOString().slice(0, 7), mk = id => monthly(M.markets?.series?.[id], 60);
    const lastP = s.permits?.[s.permits.length - 1], prevP = s.permits?.[s.permits.length - 2];
    const biz = (s.biz || []).filter(r => r.m < cur), bzA = biz.slice(-12), ue = M.unemployment?.length === 1 ? M.unemployment[0] : null, bm = mk('wpusi012011');
    // ---- overview ----
    const tiles = [s.pop ? [fmtN(s.pop.n), 'Population · ' + pct(s.pop.gr) + ' since ' + s.pop.baseYear] : null, s.jobs ? [fmtN(s.jobs.n), 'Jobs located here · ' + (s.jobs.gr != null ? pct(s.jobs.gr) + ' since ' + s.jobs.baseYear : 'LODES ' + s.jobs.year)] : null,
      p?.active?.n ? [money(p.active.v), 'Under construction · ' + fmtN(p.active.n) + ' projects'] : null, lastP ? [fmtN(lastP.sf + lastP.mf), 'Homes permitted ' + lastP.y + (prevP ? ' · ' + pct(chg(lastP.sf + lastP.mf, prevP.sf + prevP.mf)) : '')] : null,
      bzA.length ? [fmtN(sum(bzA, r => r.n)), 'New businesses, 12 months (still open)'] : null, h?.median_household_income_approx ? [money(h.median_household_income_approx), 'Median household income (approx.)'] : null,
      rn ? ['$' + fmtN(Math.round(rn.typical)), 'Typical rent a month · ' + pct(rn.yoy) + ' in a year'] : null, ue ? [ue.rate.toFixed(1) + '%', 'Unemployment · ' + ue.name + ' County, ' + MON[+ue.period.slice(5) - 1]] : null].filter(Boolean);
    const rows4 = []; for (let i = 0; i < tiles.length; i += 4) rows4.push(kpiStrip(tiles.slice(i, i + 4)));
    const c = [];
    if (lastP && prevP) { c.push({ score: chg(lastP.sf + lastP.mf, prevP.sf + prevP.mf), text: 'Homes permitted ' + upDown(chg(lastP.sf + lastP.mf, prevP.sf + prevP.mf)) + ' in ' + lastP.y + ' (' + fmtN(lastP.sf + lastP.mf) + ')' });
      if (prevP.mf > 50) c.push({ score: chg(lastP.mf, prevP.mf) * .9, text: lastP.mf ? 'Multifamily permits ' + upDown(chg(lastP.mf, prevP.mf)) + ' in ' + lastP.y + ' (' + fmtN(lastP.mf) + ' units)' : 'No multifamily permits in ' + lastP.y + ' (' + fmtN(prevP.mf) + ' units in ' + prevP.y + ')' }); }
    if (s.ytd?.prior) c.push({ score: chg(s.ytd.n, s.ytd.prior), text: s.ytd.year + ' permits so far ' + upDown(chg(s.ytd.n, s.ytd.prior)) + ' on the same months last year' });
    const tx = (s.taxCities || []).filter(x => x.last12 != null && x.prior12), tA = sum(tx, x => x.last12), tB = sum(tx, x => x.prior12);
    if (tB) c.push({ score: chg(tA, tB), text: 'City sales tax ' + upDown(chg(tA, tB)) + ' on the year before (' + money(tA) + ')' });
    if (p?.change != null) c.push({ score: p.change, text: 'Construction under way ' + upDown(p.change) + ' on a year ago (' + money(p.active.v) + ' now)' });
    else if (p?.active?.v) c.push({ score: 9, text: money(p.active.v) + ' of construction under way in ' + fmtN(p.active.n) + ' filed projects' + (p.byUse[0] ? ', most in ' + p.byUse[0].name.toLowerCase() : '') });
    if (p?.starting?.v) c.push({ score: 8, text: money(p.starting.v) + ' of projects scheduled to start in the next 90 days' });
    COSTS.forEach(([id, label]) => { const x = mk(id); if (x?.yoy != null) c.push({ score: x.yoy * .9, text: label + ' prices ' + upDown(x.yoy) + ' in a year' }); });
    if (rn?.yoy != null) c.push({ score: rn.yoy * 2, text: 'Typical rent ' + upDown(rn.yoy) + ' in a year ($' + fmtN(Math.round(rn.typical)) + ')' });
    if (ue?.yearAgo != null) c.push({ score: (ue.rate - ue.yearAgo) * 12, text: 'Unemployment ' + ue.rate.toFixed(1) + '% in ' + ue.name + ' County, ' + (ue.rate >= ue.yearAgo ? 'up ' : 'down ') + Math.abs(ue.rate - ue.yearAgo).toFixed(1) + ' points on a year ago' });
    const mv = movers(c, 6);
    const map = M.geoms?.length ? '<div class="map">' + areaMap(M.geoms.map(g => ({ geometry: g, stroke: '#0b7a5f', fill: 'rgba(0,101,39,.06)', width: 2 })), { W: 1000, H: 360 }) + '</div>' : '';
    let body = rows4.join('') + map + (mv.length ? '<h2>What’s moving</h2><ul class="mv">' + mv.map(x => '<li>' + esc(x.text) + '</li>').join('') + '</ul>' : '');

    // ---- construction pipeline ----
    if (p) {
      const tot = r => r.New + r.Reno + r.Addition, months = p.months;
      body += '<div><div class="bsec"><h2>Construction pipeline (TDLR filings)</h2>' + kpiStrip([[money(p.active.v), 'Under construction · ' + fmtN(p.active.n) + ' projects'], [money(p.starting.v), 'Starting in 90 days · ' + fmtN(p.starting.n)], [money(p.upcoming.v), 'All scheduled starts · ' + fmtN(p.upcoming.n)], [p.change != null ? pct(p.change) : '—', 'Under way vs a year ago']]) +
        '<div class="bars">' + bars(months.map(r => ({ label: mlabel(r.m), v: tot(r), color: r.future ? '#9fc3ab' : '#0b7a5f' })), { every: 6, height: 120 }) + '</div></div>' + note('Estimated value under construction each month; lighter bars are scheduled months ahead. Filings before ' + esc(p.since || 'the file’s start') + ' are missing, so the earliest months read low.') +
        '<div class="two"><div><h3>Under construction by use</h3>' + table(['Use', { t: 'Projects', r: true }, { t: 'Est. value', r: true }], p.byUse.slice(0, 10).map(u => [esc(u.name), fmtN(u.n), money(u.v)])) + '</div>' +
        '<div><h3>Largest under construction</h3>' + table(['Project', { t: 'Est. value', r: true }], p.largest.slice(0, 8).map(f => [esc(f.name) + '<div class="sc">' + esc([f.city || f.county, f.use, f.ts + ' to ' + f.te].filter(Boolean).join(' · ')) + '</div>', money(f.cost)])) + '</div></div>' +
        (p.starting.list.length ? '<h3>Starting in the next 90 days</h3>' + table(['Project', 'Where', 'Use', 'Starts', { t: 'Est. value', r: true }], p.starting.list.slice(0, 10).map(f => [esc(f.name), esc(f.city || f.county), esc(f.use || ''), esc(f.ts), money(f.cost)])) : '') +
        (p.outliers.length ? note('Left out of the totals as likely mis-entered: ' + esc(p.outliers.map(o => o.name + ' (' + money(o.cost) + ')').join('; ')) + '.') : '') + '</div>';
    }
    // ---- growth and demand ----
    body += '<div><h2>Growth &amp; demand</h2>';
    if (s.permits?.length) body += '<h3>Housing units permitted</h3><div class="bars">' + bars(s.permits.map(r => ({ label: String(r.y), v: r.sf + r.mf })), { height: 100 }) + '</div>' +
      table(['Year', { t: 'Single-family', r: true }, { t: '2–4 units', r: true }, { t: '5+ units', r: true }, { t: 'Value', r: true }], s.permits.map(r => [String(r.y), fmtN(r.sf), fmtN(Math.max(0, r.mf - (r.mf5 || 0))), fmtN(r.mf5 || 0), money(r.value)])) +
      (s.ytd ? note(s.ytd.year + ' through ' + MON[s.ytd.month - 1] + ': ' + fmtN(s.ytd.n) + ' units' + (s.ytd.prior ? ' (' + pct(chg(s.ytd.n, s.ytd.prior)) + ' on the same months a year earlier)' : '') + '. US Census Building Permits Survey; arrives about six weeks after the month.') : '');
    if (biz.length) body += '<h3>New business locations a month</h3><div class="bars">' + bars(biz.slice(-24).map(r => ({ label: mlabel(r.m), v: r.n })), { every: 3, height: 90 }) + '</div>' +
      note('Texas Comptroller sales-tax permits issued per location. Only permits still active are listed, so older months read low and a new permit can be a change of owner.') +
      ((s.latest || []).length ? table(['Newest', 'Where', 'Opened'], s.latest.slice(0, 10).map(b => [esc(title(b.name)), esc(title(b.city || '') + (b.county ? ' · ' + b.county : '')), esc(b.date || '')])) : '');
    if (s.jobs) body += '<h3>Jobs by industry (LODES ' + s.jobs.year + ')</h3>' + table(['Industry', { t: 'Jobs', r: true }, { t: 'Share', r: true }], s.jobs.sec.map((v, i) => [SECTORS[i][1], v]).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => [esc(k), fmtN(v), (v / s.jobs.n * 100).toFixed(1) + '%'])) +
      (M.unemployment?.length ? note('Unemployment (BLS): ' + esc(M.unemployment.map(u => u.name + ' ' + u.rate + '% in ' + u.period + ' (a year earlier ' + u.yearAgo + '%)').join('; ')) + (M.state ? '; Texas ' + M.state.rate + '%.' : '.')) : '');
    if (s.tax?.length) body += '<h3>City sales tax collected a month</h3><div class="bars">' + bars(s.tax.slice(-24).map(r => ({ label: mlabel(r.m), v: r.n })), { every: 3, height: 90 }) + '</div>' +
      table(['City', 'County', { t: 'Last 12 months', r: true }, { t: 'Change', r: true }], (s.taxCities || []).slice(0, 10).map(x => [esc(x.city), esc(x.county), money(x.last12), x.prior12 ? pct(chg(x.last12, x.prior12)) : '—']));
    if (s.spend) body += '<h3>Consumer spending a year (estimate, ' + s.spend.year + ')</h3>' + table(['Category', { t: 'A year', r: true }], Object.entries(s.spend.cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => [esc(CAT_LABEL[k] || k), money(v)])) +
      note(money(s.spend.total) + ' a year, $' + fmtN(s.spend.perHH || 0) + ' per household. Modeled from ACS household income and the BLS Consumer Expenditure Survey, not measured.');
    body += '</div>';
    // ---- housing and rents ----
    body += '<div><h2>Housing &amp; rents</h2>';
    if (h) body += kpiStrip([[money(h.median_home_value_approx), 'Median home value (approx.)'], [money(h.median_household_income_approx), 'Median household income (approx.)'], ['$' + fmtN(h.median_gross_rent_approx || 0), 'Median rent, census (approx.)'], [h.vacancy_rate_pct + '%', 'Homes vacant']]) +
      (h.income ? table(['Household income', { t: 'Households', r: true }, { t: 'Share', r: true }], h.income.map(b => [esc(b.label), fmtN(b.n), b.pct.toFixed(1) + '%'])) : '') + note('Census tract figures (ACS 5-year); combined medians are household-weighted averages of tract medians.');
    if (rn) body += '<h3>Rents by ZIP (Zillow, ' + esc(rn.month) + ')</h3>' + table(['ZIP', 'Town', { t: 'Typical rent', r: true }, { t: 'In a year', r: true }], rn.rows.slice(0, 15).map(r => [esc(r.zip), esc(r.city), '$' + fmtN(r.rent), pct(r.yoy)])) + (rn.rows.length > 15 ? note(fmtN(rn.rows.length - 15) + ' more ZIPs in the CSV.') : '');
    const homes = HOMES.map(([id, l, f]) => { const x = mk(id); return x ? [esc(l), f === 'usd' ? '$' + fmtN(Math.round(x.last.v)) : fmtN(Math.round(x.last.v)), mlabel(x.last.m), pct(x.yoy)] : null; }).filter(Boolean);
    if (homes.length) body += '<h3>Houston metro for-sale market</h3>' + table(['Measure', { t: 'Latest', r: true }, 'Month', { t: 'In a year', r: true }], homes);
    if (M.mortgages) body += note('Home loans (CFPB HMDA ' + M.mortgages.year + '): ' + fmtN(M.mortgages.loans) + ' originated, ' + money(M.mortgages.dollars) + ', ' + fmtN(M.mortgages.purchase) + ' for purchase.');
    body += '</div>';
    // ---- costs and rates ----
    const costs = COSTS.map(([id, l]) => { const x = mk(id); return x ? [esc(l), x.last.v.toFixed(1), mlabel(x.last.m), pct(x.yoy)] : null; }).filter(Boolean);
    body += '<div><h2>Costs &amp; rates</h2>' + (costs.length ? '<h3>Construction material prices</h3>' + table(['Producer price index', { t: 'Index', r: true }, 'Month', { t: 'In a year', r: true }], costs) : '') +
      (M.rates?.length ? '<h3>Interest rates</h3>' + table(['Rate', { t: 'Latest', r: true }, 'Date', { t: 'A year earlier', r: true }], M.rates.map(r => [esc(r.label), r.value + '%', esc(r.date), r.yearAgo + '%'])) : '') + '</div>';
    // ---- crime, roads, news ----
    body += '<div><h2>Area: crime, roads and news</h2>';
    const cr = M.crime;
    if (cr?.latest) body += '<h3>Crime, City of Houston (12 months through ' + esc(cr.latest) + ')</h3>' + kpiStrip([[fmtN(cr.last12.total), 'Incidents · ' + pct(cr.change.total)], [fmtN(cr.last12.v), 'Violent · ' + pct(cr.change.v)], [fmtN(cr.last12.p), 'Property · ' + pct(cr.change.p)], [fmtN(cr.last12.o), 'Other']]) +
      '<div class="bars">' + bars(cr.months.slice(-24).map(m => ({ label: mlabel(m.m), v: m.v + m.p + m.o })), { every: 3, height: 80, color: '#c03b3a' }) + '</div>' +
      table(['Offense', 'Type', { t: 'Count', r: true }], cr.offenses.slice(0, 8).map(o => [esc(o.name), esc(CAT_NAME[o.cat] || ''), fmtN(o.n)])) + note('Houston Police (NIBRS); the City of Houston only, the same for every county it spans. HPD’s file runs about three months behind.');
    else if (cr?.error) body += note('Houston crime isn’t available right now (' + esc(cr.error) + ').');
    const t = M.traffic;
    if (t?.roads?.length) body += '<h3>Busiest roads (TxDOT, vehicles a day)</h3>' + table(['Road', { t: 'Vehicles a day', r: true }], t.roads.slice(0, 12).map(r => [esc(title(r.road)), fmtN(r.aadt)])) +
      (t.types?.length ? table(['Road type', { t: 'Average', r: true }, { t: 'Busiest', r: true }, { t: 'Segments', r: true }], t.types.map(g => [esc(g.label), fmtN(g.avg), fmtN(g.max), fmtN(g.segments)])) : '') + note('TxDOT annual average daily traffic, current count year' + (t.as_of ? ' (file of ' + esc(String(t.as_of).slice(0, 10)) + ')' : '') + '.');
    else if (t?.error) body += note('TxDOT traffic counts aren’t available right now (' + esc(t.error) + ').');
    if (s.news?.length) body += '<h3>Local development news</h3>' + table([{ t: 'Date', m: true }, 'Headline', 'Source'], s.news.slice(0, 12).map(a => [esc(a.date || ''), '<a href="' + esc(a.url) + '">' + esc(a.title) + '</a>', esc(a.domain || '')]));
    body += '</div>';
    const sources = 'TDLR construction filings (TABS); US Census (ACS 5-year, Building Permits Survey, LEHD LODES); BLS (PPI, LAUS, Consumer Expenditure Survey); Texas Comptroller (sales-tax permits and allocations); Zillow Observed Rent Index; Realtor.com via FRED; FRED; Freddie Mac; New York Fed (SOFR); CFPB HMDA; Houston Police (NIBRS); TxDOT; Google News. Estimates are labelled as such. Data built ' + esc(String(M.built || '').slice(0, 10)) + '.';
    return reportDoc({ kicker: 'Market report', title: M.label, meta: esc(M.counties.length > 1 ? M.counties.length + ' counties' : M.counties[0] + ' County') + (M.built ? ' · data built ' + esc(String(M.built).slice(0, 10)) : ''), css: PRINT_CSS, body, sources });
  }
  return { reportHtml };
}
// the numbers as CSV rows, like the Market page's Export Data: Area, Section, Item, Value, Note
export function marketCsvRows(M) {
  const rows = [], add = (section, item, value, note = '') => rows.push({ Area: M.label, Section: section, Item: item, Value: value, Note: note }), s = M.stats, p = M.pipe;
  const pc = v => v == null ? '' : (v > 0 ? '+' : '') + v.toFixed(1) + '%';
  if (p) { add('Construction pipeline', 'Under construction (est. value)', Math.round(p.active.v), p.active.n + ' projects'); add('Construction pipeline', 'Starting in the next 90 days', Math.round(p.starting.v), p.starting.n + ' projects');
    p.months.forEach(r => add('Under construction by month', r.m + (r.future ? ' (scheduled)' : ''), Math.round(r.New + r.Reno + r.Addition), r.n + ' projects'));
    p.byUse.forEach(u => add('Under construction by use', u.name, Math.round(u.v), u.n + ' projects')); p.largest.forEach(f => add('Largest under construction', f.name, f.cost, [f.city || f.county, f.use].filter(Boolean).join(' · '))); }
  if (s.pop) add('Population', 'Population (ACS ' + s.pop.year + ')', s.pop.n, s.pop.gr != null ? pc(s.pop.gr) + ' since ' + s.pop.baseYear : '');
  (s.permits || []).forEach(r => { add('Housing permits', r.y + ' single-family units', r.sf); add('Housing permits', r.y + ' units in 2+ unit buildings', r.mf); add('Housing permits', r.y + ' value', r.value); });
  (s.biz || []).forEach(r => add('New business locations', r.m, r.n));
  if (s.jobs) s.jobs.sec.forEach((v, i) => add('Jobs by industry (' + s.jobs.year + ')', SECTORS[i][1], v));
  if (s.spend) Object.entries(s.spend.cats).forEach(([k, v]) => add('Consumer spending a year (estimate)', CAT_LABEL[k] || k, Math.round(v)));
  (s.tax || []).forEach(r => add('City sales tax per month', r.m, Math.round(r.n)));
  (s.taxCities || []).forEach(c => add('City sales tax, last 12 months', c.city + ' (' + c.county + ')', c.last12 != null ? Math.round(c.last12) : ''));
  const h = M.housing; if (h) { add('Housing (census)', 'Median home value (approx.)', h.median_home_value_approx); add('Housing (census)', 'Median household income (approx.)', h.median_household_income_approx); add('Housing (census)', 'Median rent (approx.)', h.median_gross_rent_approx); add('Housing (census)', 'Vacancy rate %', h.vacancy_rate_pct); }
  (M.rents?.rows || []).forEach(r => add('Rents by ZIP (Zillow, ' + M.rents.month + ')', r.zip + ' ' + r.city, r.rent, pc(r.yoy)));
  (M.rates || []).forEach(x => add('Rates', x.label, x.value, 'as of ' + x.date));
  (M.traffic?.roads || []).forEach(r => add('Busiest roads (TxDOT AADT)', r.road, r.aadt));
  if (M.crime?.latest) M.crime.offenses.forEach(o => add('Crime offenses, last 12 months (City of Houston)', o.name, o.n));
  return rows;
}
