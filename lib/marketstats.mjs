// The Market view's numbers for a set of counties (or the whole region) from data/area.json and data/market.json:
// population and growth, jobs by industry, housing permits by year and year to date, new business locations by month and
// the newest ones, modeled consumer spending, city sales tax, and local news. Pure function: the Market view (src/area.js),
// its report and the MCP server (api/mcp.js) all read it.
//   fips: the counties' FIPS codes; all: the whole region (news from every place); places: the app's town list
//   ([name, lon, lat], to keep sales-tax cities in the region); newsPlace: one news place key, or '' for all
export function marketStats({ area, market, fips, all = false, places = [], newsPlace = '' }) {
  const F = fips, out = {}, sel = all ? 'all' : F.join(',');
  const cname = f => area.counties.find(c => c.fips === f)?.name || f;
  const sum = (arr, fn) => arr.reduce((s, x) => s + (fn(x) || 0), 0);
  const chg = (a, b) => a != null && b ? (a - b) / b * 100 : null;
  const tr = (market?.tracts || []).filter(t => F.some(f => String(t.g).startsWith(f)));
  if (tr.length) {
    const pop = sum(tr, t => t.pop), base = tr.every(t => t.gr != null || !t.pop) ? sum(tr, t => t.pop && t.gr != null ? t.pop / (1 + t.gr / 100) : 0) : null;
    out.pop = { n: pop, gr: base ? chg(pop, base) : null, year: market.year, baseYear: market.baseYear };
  }
  const cj = F.map(f => area.countyJobs?.[f]).filter(Boolean);
  if (cj.length) {
    const n = sum(cj, c => c.jobs), base = cj.every(c => c.gr != null) ? sum(cj, c => c.jobs / (1 + c.gr / 100)) : null, sec = new Array(20).fill(0);
    cj.forEach(c => c.sec.forEach((v, i) => sec[i] += v));
    out.jobs = { n, gr: base ? chg(n, base) : null, sec, year: area.jobs?.year, baseYear: area.jobs?.baseYear };
  }
  const P = area.permits;
  if (P?.years) {
    const years = Object.keys(P.years).map(Number).sort();
    out.permits = years.map(y => ({ y, sf: sum(F, f => P.years[y]?.[f]?.sf), mf: sum(F, f => P.years[y]?.[f]?.mf), mf5: sum(F, f => P.years[y]?.[f]?.mf5), value: sum(F, f => P.years[y]?.[f]?.value), has: F.some(f => P.years[y]?.[f]) })).filter(r => r.has);
    if (P.ytd) out.ytd = { year: P.ytd.year, month: P.ytd.month, n: sum(F, f => (P.ytd.cur?.[f]?.sf || 0) + (P.ytd.cur?.[f]?.mf || 0)), prior: P.ytd.prior ? sum(F, f => (P.ytd.prior[f]?.sf || 0) + (P.ytd.prior[f]?.mf || 0)) : null, value: sum(F, f => P.ytd.cur?.[f]?.value) };
  }
  const B = area.businesses;
  if (B?.months) {
    const ms = [...new Set(F.flatMap(f => Object.keys(B.months[f] || {})))].sort();
    out.biz = ms.map(m => ({ m, n: sum(F, f => B.months[f]?.[m]) }));
    out.latest = F.flatMap(f => (B.latest?.[f] || []).map(x => ({ ...x, county: cname(f) }))).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 40);
  }
  // modeled consumer spending (ACS income × BLS CE) summed over the tracts
  const st = tr.filter(t => t.spend != null);
  if (st.length && market.spendYear) {
    const cats = {}; st.forEach(t => Object.entries(t.sp || {}).forEach(([k, v]) => cats[k] = (cats[k] || 0) + (v || 0)));
    const hh = sum(st, t => t.hh);
    out.spend = { total: sum(st, t => t.spend), perHH: hh ? Math.round(sum(st, t => t.spend) / hh) : null, cats, year: market.spendYear, acs: market.year };
  }
  // city sales-tax allocations (Comptroller): monthly total for the area, and each city's last 12 months vs the 12 before
  const ST = area.salesTax;
  if (ST?.cities) {
    const names = new Set(F.map(cname)), key = n => String(n).toLowerCase().replace(/[^a-z]/g, ''), real = new Set((places || []).map(p => key(p[0])));
    // only places in the region (data built before 2026-10-03 can hold a filer's out-of-town mailing city, e.g. San Antonio)
    const cities = Object.entries(ST.cities).filter(([n, c]) => names.has(c.county) && (!real.size || real.has(key(n))));
    const ms = [...new Set(cities.flatMap(([, c]) => Object.keys(c.months)))].sort();
    out.tax = ms.map(m => ({ m, n: sum(cities, ([, c]) => c.months[m]) }));
    const lastM = ms[ms.length - 1], yr = (c, back) => { const keys = Object.keys(c.months).sort().filter(k => k <= lastM); const end = keys.length - back * 12; return keys.length >= end && end > 0 ? keys.slice(Math.max(0, end - 12), end).reduce((a, k) => a + c.months[k], 0) : null; };
    out.taxCities = cities.map(([n, c]) => ({ city: n, county: c.county, last12: yr(c, 0), prior12: yr(c, 1) })).sort((a, b) => (b.last12 || 0) - (a.last12 || 0));
  }
  if (area.news) {
    const names = new Set(F.map(cname)), places = (area.newsPlaces || []).filter(p => sel === 'all' || names.has(p.county)), seen = new Set();
    out.places = places;
    out.news = places.filter(p => !newsPlace || p.key === newsPlace).flatMap(p => (area.news[p.key] || []).map(a => ({ ...a, place: p.label })))
      .filter(a => { const k = a.url; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 40);
  }
  return out;
}
