// Area context for the Market view and the tract layer. All free, no keys:
//   jobs        US Census LEHD LODES 8 workplace jobs (WAC) by census block, summed to tracts: total jobs, growth, top sectors
//   permits     US Census Building Permits Survey: new housing units authorized per county per year (+ year to date)
//   businesses  Texas Comptroller active sales-tax permit holders: new outlets per county per month, plus the latest ones
//   news        Google News: development and real estate headlines for each county and the busiest towns (kept 120 days)
//   rates, unemployment, rents, mortgages: see build/econ.mjs
// Each part is best effort: a failing source keeps last run's numbers (data/area.json) and logs why.
import { gunzipSync } from 'node:zlib';
import { log, sleep } from './util.mjs';
import { parseGoogleNews } from '../api/news.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (FinishesSolutions filings map build)' };
async function get(url, { ms = 60000, head = false } = {}) {
  const r = await fetch(url, { method: head ? 'HEAD' : 'GET', headers: UA, signal: AbortSignal.timeout(ms) });
  return r;
}
async function text(url, ms) { const r = await get(url, { ms }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.text(); }
const exists = async url => { try { return (await get(url, { head: true, ms: 20000 })).ok; } catch (e) { return false; } };

import { SECTORS, sectorOf } from '../lib/sectors.mjs';
import { buildRates, buildUnemployment, buildRents, buildMortgages } from './econ.mjs';
export { SECTORS, sectorOf };

// ---------- jobs: LODES WAC ----------
const LODES = 'https://lehd.ces.census.gov/data/lodes/LODES8/tx/wac/tx_wac_S000_JT00_';
// block rows -> { tract: { jobs, sec: [20 sector counts] } } for the given county FIPS codes
export function parseWac(csv, fips) {
  const lines = csv.split('\n'), h = lines[0].trim().split(','), iG = h.indexOf('w_geocode'), iT = h.indexOf('C000');
  const iS = SECTORS.map((_, i) => h.indexOf('CNS' + String(i + 1).padStart(2, '0'))), want = new Set(fips), out = {};
  if (iG < 0 || iT < 0) throw new Error('unexpected LODES header: ' + lines[0].slice(0, 80));
  for (let k = 1; k < lines.length; k++) {
    const l = lines[k]; if (!l) continue;
    const c = l.split(','), g = c[iG].replace(/"/g, ''); if (!want.has(g.slice(0, 5))) continue;
    const t = out[g.slice(0, 11)] ||= { jobs: 0, sec: new Array(20).fill(0) };
    t.jobs += +c[iT] || 0; iS.forEach((j, s) => { if (j >= 0) t.sec[s] += +c[j] || 0; });
  }
  return out;
}
async function wac(year, fips) { const r = await get(LODES + year + '.csv.gz', { ms: 180000 }); if (!r.ok) throw new Error('LODES ' + year + ' ' + r.status); return parseWac(gunzipSync(Buffer.from(await r.arrayBuffer())).toString('utf8'), fips); }

export async function buildJobs(fips, prev) {
  const now = new Date().getUTCFullYear(); let year = null;
  for (let y = now - 1; y >= now - 7 && !year; y--) if (await exists(LODES + y + '.csv.gz')) year = y;
  if (!year) throw new Error('no LODES year reachable');
  if (prev?.year === year && prev.tracts && !process.env.REBUILD_AREA) { log('area: LODES', year, 'unchanged, reusing'); return prev; }
  const cur = await wac(year, fips); let base = null, baseYear = null;
  try { base = await wac(year - 5, fips); baseYear = year - 5; } catch (e) { log('area: LODES base year', year - 5, 'unavailable:', e.message); }
  const tracts = {};
  for (const [g, t] of Object.entries(cur)) {
    const b = base?.[g]?.jobs, top = t.sec.map((n, i) => [i, n]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
    tracts[g] = { jobs: t.jobs, gr: b >= 50 ? Math.round((t.jobs - b) / b * 1000) / 10 : null, top, sec: t.sec };
  }
  log('area: LODES', year, 'vs', baseYear, '|', Object.keys(tracts).length, 'tracts with jobs');
  return { year, baseYear, tracts };
}
// copy the job fields onto the demographics tracts (data/market.json) so the map layer and cards can use them
export function mergeJobs(market, jobs) {
  if (!market?.tracts || !jobs?.tracts) return market;
  for (const t of market.tracts) {
    const j = jobs.tracts[t.g];
    t.jobs = j ? j.jobs : 0; t.jgr = j ? j.gr : null; t.jtop = j ? j.top.map(x => x[0]) : [];
    t.jpr = t.pop ? Math.round(t.jobs / t.pop * 100) / 100 : null; // jobs per resident: >1 means more people work here than live here
  }
  market.jobsYear = jobs.year; market.jobsBaseYear = jobs.baseYear;
  return market;
}
// county totals, from the tract numbers
export function countyJobs(jobs, fips) {
  const out = {};
  for (const f of fips) {
    const ts = Object.entries(jobs?.tracts || {}).filter(([g]) => g.startsWith(f));
    if (!ts.length) continue;
    const sec = new Array(20).fill(0); let n = 0, base = 0, hasBase = true;
    for (const [, t] of ts) { n += t.jobs; t.sec.forEach((v, i) => sec[i] += v); if (t.gr == null) hasBase = false; else base += t.jobs / (1 + t.gr / 100); }
    out[f] = { jobs: n, sec, gr: hasBase && base ? Math.round((n - base) / base * 1000) / 10 : null };
  }
  return out;
}

// ---------- housing permits: Census BPS county files ----------
const BPS = 'https://www2.census.gov/econ/bps/County/';
// Two header lines ("1-unit,,,2-units,,," over "Bldgs,Units,Value,…"); comma separated; valuation in $ thousands.
// The "rep" columns (reported only, no imputation) are ignored.
export function parseBps(txt, fips) {
  const lines = txt.split(/\r?\n/).filter(l => l.trim()), split = l => l.split(',').map(s => s.trim());
  const h1 = split(lines[0]), h2 = split(lines[1]); let grp = '';
  const cols = h2.map((s, i) => { if (h1[i]) grp = h1[i]; return { grp: grp.toLowerCase(), sub: s.toLowerCase() }; });
  const find = (g, s) => cols.findIndex(c => c.grp.startsWith(g) && !/rep/.test(c.grp) && c.sub === s);
  const iSt = cols.findIndex(c => c.sub === 'state'), iCo = cols.findIndex(c => c.sub === 'county'), iDate = 0;
  const U = ['1-unit', '2-units', '3-4 units', '5+ units'].map(g => [find(g, 'units'), find(g, 'value')]);
  if (iSt < 0 || iCo < 0 || U.some(([u]) => u < 0)) throw new Error('unexpected BPS header: ' + lines[0].slice(0, 80));
  const want = new Set(fips), out = {};
  for (const l of lines.slice(2)) {
    const c = split(l), f = c[iSt].padStart(2, '0') + c[iCo].padStart(3, '0'); if (!want.has(f)) continue;
    const n = U.map(([u, v]) => [+c[u] || 0, +c[v] || 0]);
    out[f] = { date: c[iDate], sf: n[0][0], mf: n[1][0] + n[2][0] + n[3][0], mf5: n[3][0], value: n.reduce((s, x) => s + x[1], 0) }; // BPS reports value in dollars (it was multiplied by 1,000 here until 2026-10-03)
  }
  return out;
}
export async function buildPermits(fips, prev) {
  const now = new Date(), y = now.getUTCFullYear(), years = {};
  for (let yr = y - 1; yr >= y - 7; yr--) {
    if (prev?.years?.[yr] && yr < y - 1) { years[yr] = prev.years[yr]; continue; } // old years don't change
    try { years[yr] = parseBps(await text(BPS + 'co' + yr + 'a.txt'), fips); } catch (e) { if (prev?.years?.[yr]) years[yr] = prev.years[yr]; }
  }
  // year to date: the newest monthly "y" file, and the same months a year earlier for comparison
  let ytd = null;
  for (let back = 1; back <= 5 && !ytd; back++) {
    const d = new Date(Date.UTC(y, now.getUTCMonth() - back, 1)), yy = String(d.getUTCFullYear()).slice(2), mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    if (d.getUTCMonth() === 11) continue; // December's year-to-date is the annual file
    try {
      const cur = parseBps(await text(BPS + 'co' + yy + mm + 'y.txt'), fips);
      let prior = null; try { prior = parseBps(await text(BPS + 'co' + String(+yy - 1).padStart(2, '0') + mm + 'y.txt'), fips); } catch (e) {}
      ytd = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, cur, prior };
    } catch (e) { /* not published yet; try a month earlier */ }
  }
  if (!Object.keys(years).length && !ytd) throw new Error('no BPS files reachable');
  log('area: permits', Object.keys(years).sort().join(','), ytd ? '| ytd ' + ytd.year + '-' + ytd.month : '');
  return { years, ytd: ytd || prev?.ytd || null };
}

// ---------- new businesses: Texas Comptroller sales-tax permits ----------
const SOCRATA = id => 'https://data.texas.gov/resource/' + id + '.json';
const sq = (p, id = 'jrea-zgmq') => SOCRATA(id) + '?' + new URLSearchParams(p);
async function socrata(p, id) {
  const r = await fetch(sq(p, id), { headers: { ...UA, ...(process.env.SOCRATA_APP_TOKEN ? { 'X-App-Token': process.env.SOCRATA_APP_TOKEN } : {}) }, signal: AbortSignal.timeout(90000) });
  const t = await r.text(); if (!r.ok) throw new Error('Comptroller ' + r.status + ': ' + t.slice(0, 160));
  return JSON.parse(t);
}
// The Comptroller numbers counties 1..254 alphabetically, the same order TDLR uses (TABS id 2001..2254).
export const cptCode = tabsId => +tabsId - 2000;
export async function buildBusinesses(counties, prev) {
  const since = new Date(Date.UTC(new Date().getUTCFullYear() - 2, new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);
  const rows = await socrata({ $select: 'outlet_county_code, date_trunc_ym(outlet_permit_issue_date) AS m, count(*) AS n', $where: "outlet_permit_issue_date >= '" + since + "T00:00:00'",
    $group: 'outlet_county_code, m', $limit: '50000' });
  const byCode = Object.fromEntries(counties.map(c => [cptCode(c.tabsId), c.fips])), months = {}, codes = new Set();
  for (const r of rows) {
    const f = byCode[parseInt(r.outlet_county_code, 10)]; if (!f || !r.m) continue; codes.add(r.outlet_county_code);
    (months[f] ||= {})[r.m.slice(0, 7)] = +r.n;
  }
  if (!codes.size) throw new Error('no rows for the region (' + rows.length + ' statewide)');
  // the newest 40 outlets per county, using the code values exactly as the dataset stores them
  const latest = {};
  for (const code of codes) {
    const f = byCode[parseInt(code, 10)];
    const list = await socrata({ $select: 'outlet_name, taxpayer_name, outlet_address, outlet_city, outlet_zip_code, outlet_naics_code, outlet_permit_issue_date', $where: "outlet_county_code = '" + code.replace(/'/g, '') + "'",
      $order: 'outlet_permit_issue_date DESC', $limit: '40' });
    latest[f] = list.map(o => ({ name: o.outlet_name || o.taxpayer_name || '', owner: o.taxpayer_name && o.taxpayer_name !== o.outlet_name ? o.taxpayer_name : undefined, addr: o.outlet_address || '',
      city: o.outlet_city || '', zip: String(o.outlet_zip_code || '').slice(0, 5), sec: sectorOf(o.outlet_naics_code), naics: o.outlet_naics_code || undefined, date: String(o.outlet_permit_issue_date || '').slice(0, 10) }));
    await sleep(300);
  }
  log('area: businesses', Object.entries(months).map(([f, m]) => f + ':' + Object.values(m).reduce((s, n) => s + n, 0)).join(' '));
  return { since, months, latest };
}

// ---------- area news: Google News ----------
const TOPIC = '(development OR construction OR "breaks ground" OR groundbreaking OR rezoning OR "real estate" OR "new store" OR expansion OR "plans to build")';
export function newsQuery(place) { return '"' + String(place).replace(/"/g, '') + '" ' + TOPIC + ' when:30d'; }
export async function buildNews(places, prev, gap = 1500) {
  const keep = Date.now() - 120 * 864e5, out = {}; let ok = 0;
  for (const [i, p] of places.entries()) {
    if (i) await sleep(gap);
    const old = (prev?.[p.key] || []).filter(a => !a.date || Date.parse(a.date) >= keep);
    try {
      const r = await fetch('https://news.google.com/rss/search?' + new URLSearchParams({ q: newsQuery(p.q), hl: 'en-US', gl: 'US', ceid: 'US:en' }), { headers: UA, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error('Google News ' + r.status);
      const fresh = parseGoogleNews(await r.text(), 25), seen = new Set(), all = [];
      for (const a of [...fresh, ...old]) { const k = a.title.toLowerCase().replace(/\W+/g, ' ').trim(); if (seen.has(k)) continue; seen.add(k); all.push({ title: a.title, url: a.url, domain: a.domain, date: a.date }); }
      out[p.key] = all.sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 30); ok++;
    } catch (e) { out[p.key] = old; log('area: news', p.q, 'failed:', e.message); }
  }
  if (!ok && places.length) throw new Error('every news search failed');
  log('area: news', ok, 'of', places.length, 'places');
  return out;
}

// ---------- all of it ----------
// ---------- local spending trend: Texas Comptroller city sales-tax allocations ----------
// The monthly sales-tax money the Comptroller sends each city: a real, ~2-month-behind measure of taxable local sales.
// The dataset is found by name in the Socrata catalog (and its columns read from the catalog metadata), then
// remembered in area.json, so a republished dataset is picked up again without code changes.
const CATALOG = 'https://api.us.socrata.com/api/catalog/v1?domains=data.texas.gov&only=datasets&limit=25&q=';
export function allocColumns(res) {
  const f = res.columns_field_name || [], t = res.columns_datatype || [], type = n => t[f.indexOf(n)] || '';
  const city = f.find(n => /^city(_name)?$/i.test(n)) || f.find(n => /city/i.test(n) && !/county|code/i.test(n));
  const amount = f.find(n => /net_payment_this_period|net_allocation|^net_payment|total_allocation|allocation_amount/i.test(n))
    || f.find(n => /alloc|payment|amount/i.test(n) && !/prior|previous|ytd|year_to_date|percent|pct|change|comparable/i.test(n) && /number|money|double/i.test(type(n)));
  const period = f.find(n => /calendar_date|floating_timestamp/i.test(type(n)) && /alloc|period|month|date/i.test(n)) || f.find(n => /calendar_date|floating_timestamp/i.test(type(n)));
  const year = f.find(n => /(^|_)year$/i.test(n)), month = f.find(n => /(^|_)month$/i.test(n));
  return city && amount && (period || (year && month)) ? { city, amount, period, year, month } : null;
}
export async function findAllocations(prev) {
  if (prev?.dataset?.id && prev.dataset.cols) return prev.dataset;
  const r = await fetch(CATALOG + encodeURIComponent('sales tax allocation city'), { headers: UA, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error('Socrata catalog ' + r.status);
  for (const x of (await r.json()).results || []) {
    const res = x.resource || {}; if (!/allocation/i.test(res.name || '') || !/cit(y|ies)/i.test(res.name || '') || /county|transit|special|mixed beverage|hotel/i.test(res.name || '')) continue;
    const cols = allocColumns(res); if (cols) return { id: res.id, name: res.name, cols };
  }
  throw new Error('no city sales-tax allocation dataset found in the data.texas.gov catalog');
}
async function buildSalesTax(filings, prev, places) {
  const ds = await findAllocations(prev), c = ds.cols;
  // the cities with filings in the region, each with the county most of its filings are in
  const byCity = {}; for (const f of filings) if (f.city) { const k = f.city.trim(); (byCity[k] ||= {})[f.county] = ((byCity[k] ||= {})[f.county] || 0) + 1; }
  // only real places in the region: a filer's mailing city ("San Antonio" on two Houston filings) would otherwise add
  // that whole city's sales tax to the region
  const key = n => String(n).toLowerCase().replace(/[^a-z]/g, ''), inRegion = places?.length ? new Set(places.map(p => key(p[0]))) : null;
  const cities = Object.entries(byCity).filter(([city]) => !inRegion || inRegion.has(key(city))).map(([city, cs]) => [city, Object.entries(cs).sort((a, b) => b[1] - a[1])[0][0]]).slice(0, 120);
  const since = new Date(Date.UTC(new Date().getUTCFullYear() - 3, new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);
  const inList = cities.map(([n]) => "'" + n.toUpperCase().replace(/'/g, "''") + "'").join(',');
  const when = c.period ? 'date_trunc_ym(' + c.period + ') AS m' : c.year + ' AS y, ' + c.month + ' AS mo';
  const rows = await socrata({ $select: 'upper(' + c.city + ') AS city, ' + when + ', sum(' + c.amount + ') AS v', $where: 'upper(' + c.city + ') in (' + inList + ')' + (c.period ? ' AND ' + c.period + " >= '" + since + "T00:00:00'" : ' AND ' + c.year + ' >= ' + (+since.slice(0, 4))),
    $group: 'city, ' + (c.period ? 'm' : 'y, mo'), $limit: '50000' }, ds.id);
  const county = Object.fromEntries(cities.map(([n, co]) => [n.toUpperCase(), [n, co]])), out = {};
  for (const r of rows) {
    const [name, co] = county[r.city] || [], m = r.m ? String(r.m).slice(0, 7) : r.y && r.mo ? r.y + '-' + String(r.mo).padStart(2, '0') : null, v = +r.v;
    if (!name || !m || !Number.isFinite(v)) continue;
    ((out[name] ||= { county: co, months: {} }).months)[m] = Math.round(v);
  }
  if (!Object.keys(out).length) throw new Error('no allocations matched the region\'s cities');
  log('area: sales tax', Object.keys(out).length, 'cities from', ds.id);
  return { dataset: { id: ds.id, name: ds.name, cols: ds.cols }, since: since.slice(0, 7), cities: out };
}

export async function buildArea(regions, filings, prev = {}) {
  const counties = regions.counties, fips = counties.map(c => c.fips), out = { built: new Date().toISOString(), counties: counties.map(c => ({ name: c.name, fips: c.fips })) };
  const step = async (k, fn) => { try { out[k] = await fn(); } catch (e) { log('area:', k, 'skipped:', e.message); if (prev[k]) out[k] = prev[k]; } };
  await step('jobs', () => buildJobs(fips, prev.jobs));
  await step('permits', () => buildPermits(fips, prev.permits));
  await step('businesses', () => buildBusinesses(counties, prev.businesses));
  await step('salesTax', () => buildSalesTax(filings, prev.salesTax, prev.places));
  // economics (build/econ.mjs): rates, county unemployment, ZIP rents, home loans
  await step('rates', () => buildRates());
  await step('unemployment', () => buildUnemployment());
  await step('rents', () => buildRents());
  await step('mortgages', () => buildMortgages(fips, prev.mortgages));
  // news places: each county, plus the towns with the most filings
  const towns = Object.entries(filings.reduce((m, f) => { if (f.city && !f.approx) m[f.city + '|' + f.county] = (m[f.city + '|' + f.county] || 0) + 1; return m; }, {}))
    .sort((a, b) => b[1] - a[1]).slice(0, +(process.env.AREA_NEWS_TOWNS || 10)).map(([k]) => { const [city, county] = k.split('|'); return { key: 'town:' + city, q: city + ', Texas', county }; });
  const places = counties.map(c => ({ key: 'county:' + c.name, q: c.name + ' County', county: c.name })).concat(towns);
  out.newsPlaces = places.map(p => ({ key: p.key, county: p.county, label: p.q.replace(/, Texas$/, '') }));
  await step('news', () => buildNews(places, prev.news));
  if (out.jobs) out.countyJobs = countyJobs(out.jobs, fips);
  return out;
}
