// Offline tests for the area context (build/area.mjs) and the tenants endpoint (api/tenants.js).
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { parseWac, parseBps, mergeJobs, countyJobs, buildArea, newsQuery, cptCode } from '../build/area.mjs';
import { sectorOf, SECTORS } from '../lib/sectors.mjs';
import { addressKey, tenantQuery, shapeTenants } from '../api/tenants.js';

// ---- fixtures in the published formats ----
const cns = (n, at) => Array.from({ length: 20 }, (_, i) => i === at ? n : 0).join(',');
const WAC = (rows) => 'w_geocode,C000,CA01,CA02,CA03,CE01,CE02,CE03,' + Array.from({ length: 20 }, (_, i) => 'CNS' + String(i + 1).padStart(2, '0')).join(',') + ',CR01,createdate\n' +
  rows.map(([g, n, sec]) => [g, n, 0, 0, 0, 0, 0, 0, cns(n, sec), 0, '20240101'].join(',')).join('\n') + '\n';
const wacCur = WAC([['484730001001000', 120, 6], ['484730001001001', 30, 15], ['484730002002000', 500, 7], ['482019999001000', 999, 3], ['484810001001000', 50, 0]]);
const wacBase = WAC([['484730001001000', 100, 6], ['484730002002000', 400, 7], ['482019999001000', 999, 3]]);
const BPS = (date, rows) => 'Survey,FIPS,FIPS,Region,Division,County,,1-unit,,,2-units,,,3-4 units,,,5+ units,,,1-unit rep,,,2-units rep,,,3-4 units rep,,,5+ units rep,,\n' +
  'Date,State,County,Code,Code,Name,,Bldgs,Units,Value,Bldgs,Units,Value,Bldgs,Units,Value,Bldgs,Units,Value,Bldgs,Units,Value,Bldgs,Units,Value,Bldgs,Units,Value,Bldgs,Units,Value\n' +
  rows.map(([st, co, sf, mf5]) => [date, st, co, 3, 7, 'X County', '', sf, sf, sf * 250, 1, 2, 400, 0, 0, 0, 2, mf5, mf5 * 120, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9].join(',')).join('\n') + '\n';

// ---- parsers ----
const jobs = parseWac(wacCur, ['48473', '48201']);
assert.equal(jobs['48473000100'].jobs, 150, 'blocks summed to the tract'); assert.equal(jobs['48473000100'].sec[6], 120, 'retail jobs (CNS07)');
assert.equal(jobs['48201999900'].jobs, 999); assert.ok(!jobs['48481000100'], 'other counties dropped');
const b = parseBps(BPS('2024', [['48', '473', 900, 240], ['48', '1', 5, 0], ['06', '473', 77, 77]]), ['48473']);
assert.deepEqual(b['48473'], { date: '2024', sf: 900, mf: 2 + 0 + 240, mf5: 240, value: 900 * 250 + 400 + 240 * 120 }, 'units by type, value as the file gives it (dollars), rep columns ignored');
assert.equal(Object.keys(b).length, 1, 'only the region, matched on state + county');
assert.throws(() => parseBps('a,b\nc,d\n', ['48473']), /unexpected BPS header/);
assert.equal(SECTORS[sectorOf('722511')][1], 'Hotels & restaurants'); assert.equal(SECTORS[sectorOf('445110')][1], 'Retail'); assert.equal(sectorOf('999'), null);
assert.equal(cptCode('2237'), 237, 'Waller'); assert.match(newsQuery('Waller County'), /^"Waller County" \(development OR .* when:30d$/);

// ---- tenants ----
assert.deepEqual(addressKey('1234 W. Grand Pkwy S Ste 100'), { num: '1234', word: 'GRAND' });
assert.deepEqual(addressKey('25025 FM 1093 Rd'), { num: '25025', word: '1093' });
assert.deepEqual(addressKey("2902 O'Connor Blvd"), { num: '2902', word: 'OCONNOR' });
assert.equal(addressKey('Main St'), null, 'needs a house number');
assert.equal(tenantQuery('101 Main St', '77484').where, "upper(outlet_address) like '101 %MAIN%' AND outlet_zip_code like '77484%'");
assert.equal(tenantQuery('101 Main St', '', "Prairie View").where, "upper(outlet_address) like '101 %MAIN%' AND upper(outlet_city) = 'PRAIRIE VIEW'");
assert.equal(tenantQuery('101 Main St', '', "O'Fallon'; drop").where.split(' AND ')[1], "upper(outlet_city) = 'O''FALLON'' DROP'", 'quotes escaped');
assert.equal(tenantQuery('101 Main St', '', ''), null, 'needs a ZIP or city');
const t = shapeTenants([{ outlet_name: 'BAKERY ONE', taxpayer_name: 'ONE LLC', outlet_address: '101 MAIN ST STE 4', outlet_naics_code: '311811', outlet_permit_issue_date: '2025-03-01T00:00:00.000' },
  { outlet_name: 'BAKERY ONE', taxpayer_name: 'ONE LLC', outlet_address: '101 MAIN ST STE 4' }, { outlet_name: 'TACOS', taxpayer_name: 'TACOS', outlet_address: '101 MAIN ST', outlet_naics_code: '722513', outlet_permit_issue_date: '2026-01-05T00:00:00.000' }]);
assert.equal(t.length, 2, 'duplicates merged'); assert.equal(t[0].name, 'TACOS', 'newest first'); assert.equal(t[0].owner, undefined, 'owner only when it differs');
assert.equal(t[1].suite, '4'); assert.equal(t[1].owner, 'ONE LLC'); assert.equal(t[1].opened, '2025-03-01'); assert.equal(t[0].sector, 'Hotels & restaurants');

// ---- merge into the tract layer ----
const year = new Date().getUTCFullYear(), lodesYear = year - 2;
const market = { tracts: [{ g: '48473000100', pop: 300 }, { g: '48473000200', pop: 100 }, { g: '48473000300', pop: 0 }] };
const J = { year: lodesYear, baseYear: lodesYear - 5, tracts: { '48473000100': { jobs: 150, gr: 50, top: [[6, 120], [15, 30]], sec: [] }, '48473000200': { jobs: 500, gr: 25, top: [[7, 500]], sec: [] } } };
mergeJobs(market, J);
assert.deepEqual(market.tracts.map(x => [x.jobs, x.jgr, x.jpr]), [[150, 50, .5], [500, 25, 5], [0, null, null]]); assert.deepEqual(market.tracts[0].jtop, [6, 15]); assert.equal(market.jobsYear, lodesYear);
J.tracts['48473000100'].sec = new Array(20).fill(0); J.tracts['48473000200'].sec = new Array(20).fill(0);
const cj = countyJobs(J, ['48473', '48201']); assert.equal(cj['48473'].jobs, 650); assert.equal(cj['48473'].gr, Math.round((650 - 500) / 500 * 1000) / 10); assert.ok(!cj['48201']);

// ---- whole step against mocked services ----
const seen = [], ym = d => d.toISOString().slice(0, 7);
let comptrollerDown = false;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)); seen.push(u.host + u.pathname);
  if (u.host === 'lehd.ces.census.gov') {
    const y = +u.pathname.match(/_(\d{4})\.csv\.gz$/)[1];
    if (y > lodesYear) return new Response('', { status: 404 });
    if (opts.method === 'HEAD') return new Response(null, { status: 200 });
    return new Response(gzipSync(y === lodesYear ? wacCur : wacBase));
  }
  if (u.host === 'www2.census.gov') {
    const m = u.pathname.match(/co(\d{4})a\.txt$/), my = u.pathname.match(/co(\d\d)(\d\d)y\.txt$/);
    if (m) return +m[1] >= year ? new Response('nope', { status: 404 }) : new Response(BPS(m[1], [['48', '473', 100 + (+m[1] % 10), 20], ['48', '201', 9000, 5000]]));
    if (my) return new Response(BPS('20' + my[1] + my[2], [['48', '473', 50, 10]]));
    return new Response('', { status: 404 });
  }
  if (u.host === 'api.us.socrata.com') return Response.json({ results: [
    { resource: { id: 'zzzz-0001', name: 'Sales Tax Allocations, County', columns_field_name: ['county', 'net_payment_this_period'], columns_datatype: ['text', 'number'] } },
    { resource: { id: 'abcd-1234', name: 'Sales Tax Allocations, City', columns_field_name: ['city', 'allocation_month', 'net_payment_this_period', 'comparable_payment_prior_year'], columns_datatype: ['text', 'calendar_date', 'number', 'number'] } }] });
  if (u.host === 'data.texas.gov' && u.pathname.includes('abcd-1234')) {
    if (comptrollerDown) return new Response('{"message":"down"}', { status: 503 });
    assert.match(u.searchParams.get('$select'), /sum\(net_payment_this_period\)/); assert.match(u.searchParams.get('$where'), /upper\(city\) in \('KATY','BROOKSHIRE','WALLER'\)/);
    return Response.json([{ city: 'KATY', m: '2026-07-01T00:00:00.000', v: '1250000.5' }, { city: 'KATY', m: '2025-07-01T00:00:00.000', v: '1100000' }, { city: 'BROOKSHIRE', m: '2026-07-01T00:00:00.000', v: '210000' }, { city: 'ELSEWHERE', m: '2026-07-01T00:00:00.000', v: '5' }]);
  }
  if (u.host === 'data.texas.gov') {
    if (comptrollerDown) return new Response('{"message":"down"}', { status: 503 });
    if (u.searchParams.get('$group')) { const m = ym(new Date()); return Response.json([{ outlet_county_code: '237', m: m + '-01T00:00:00.000', n: '12' }, { outlet_county_code: '101', m: m + '-01T00:00:00.000', n: '900' }, { outlet_county_code: '057', m: m + '-01T00:00:00.000', n: '700' }]); }
    assert.match(u.searchParams.get('$where'), /^outlet_county_code = '(237|101)'$/, 'latest list uses the stored code');
    return Response.json([{ outlet_name: 'NEW CAFE', taxpayer_name: 'CAFE LLC', outlet_address: '1 MAIN ST', outlet_city: 'WALLER', outlet_zip_code: '77484', outlet_naics_code: '722515', outlet_permit_issue_date: '2026-09-30T00:00:00.000' }]);
  }
  if (u.host === 'news.google.com') {
    const q = u.searchParams.get('q');
    if (/Brookshire/.test(q)) return new Response('busy', { status: 503 });
    return new Response('<rss><channel><item><title>' + q.split('"')[1] + ' approves new retail center - Local Paper</title><link>https://news.google.com/' + encodeURIComponent(q.split('"')[1]) + '</link><pubDate>Tue, 29 Sep 2026 14:00:00 GMT</pubDate><source url="https://local.example">Local Paper</source></item></channel></rss>');
  }
  return new Response('unmocked ' + u, { status: 599 });
};
const regions = { counties: [{ name: 'Waller', tabsId: '2237', fips: '48473' }, { name: 'Harris', tabsId: '2101', fips: '48201' }] };
const filings = [{ city: 'Katy', county: 'Harris' }, { city: 'Katy', county: 'Harris' }, { city: 'Brookshire', county: 'Waller' }, { city: 'Waller', county: 'Waller', approx: true }];
process.env.AREA_NEWS_TOWNS = '3';
const prevNews = { 'town:Brookshire': [{ title: 'Old story', url: 'https://x/old', date: new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10) }, { title: 'Ancient', url: 'https://x/a', date: '2020-01-01' }] };
const area = await buildArea(regions, filings, { news: prevNews });
assert.equal(area.jobs.year, lodesYear); assert.equal(area.jobs.baseYear, lodesYear - 5); assert.equal(area.countyJobs['48473'].jobs, 650);
assert.ok(Object.keys(area.permits.years).length >= 5, 'several permit years'); assert.equal(area.permits.years[year - 1]['48201'].sf, 9000); assert.ok(area.permits.ytd?.cur['48473'], 'year to date');
assert.equal(area.businesses.months['48473'][ym(new Date())], 12); assert.equal(area.businesses.months['48201'][ym(new Date())], 900); assert.ok(!Object.values(area.businesses.months).some(m => m[ym(new Date())] === 700), 'other counties dropped');
assert.equal(area.businesses.latest['48473'][0].name, 'NEW CAFE'); assert.equal(SECTORS[area.businesses.latest['48473'][0].sec][1], 'Hotels & restaurants');
assert.deepEqual(area.newsPlaces.map(p => p.key), ['county:Waller', 'county:Harris', 'town:Katy', 'town:Brookshire'], 'counties, then busiest towns (city-level guesses skipped)');
assert.equal(area.news['county:Waller'][0].title, 'Waller County approves new retail center');
assert.deepEqual(area.news['town:Brookshire'].map(a => a.title), ['Old story'], 'a failed search keeps recent saved articles, drops ones past 120 days');
// a source that fails keeps last run's numbers
comptrollerDown = true;
const again = await buildArea(regions, filings, { ...area, jobs: { year: lodesYear, tracts: {} } });
assert.deepEqual(again.businesses, area.businesses, 'Comptroller down: previous numbers kept');
// city sales-tax allocations: dataset found by name (the city one, not the county one), columns read from the catalog
assert.equal(area.salesTax.dataset.id, 'abcd-1234'); assert.equal(area.salesTax.dataset.cols.amount, 'net_payment_this_period');
assert.deepEqual(area.salesTax.cities.Katy, { county: 'Harris', months: { '2026-07': 1250001, '2025-07': 1100000 } }); assert.equal(area.salesTax.cities.Brookshire.county, 'Waller'); assert.ok(!area.salesTax.cities.ELSEWHERE);
assert.deepEqual(again.salesTax, area.salesTax, 'allocations down: previous numbers kept');
assert.ok(seen.filter(s => s.includes('lehd')).length > 0);
// ---- api/tenants handler: ZIP filter rejected (400) -> street-only query filtered here ----
const { default: tenantsApi } = await import('../api/tenants.js');
const res = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
const calls = [];
globalThis.fetch = async url => { const u = new URL(String(url)); const w = u.searchParams.get('$where'); calls.push(w);
  if (/zip/.test(w)) return new Response('{"message":"type mismatch"}', { status: 400 });
  return Response.json([{ outlet_name: 'A', outlet_address: '101 MAIN ST', outlet_zip_code: 77484 }, { outlet_name: 'B', outlet_address: '101 MAIN ST', outlet_zip_code: 75001 }]); };
let r = res(); await tenantsApi({ headers: {}, query: { addr: '101 Main St', zip: '77484' } }, r);
assert.equal(r.code, 200); assert.deepEqual(r.body.tenants.map(t => t.name), ['A'], 'filtered to the ZIP'); assert.equal(calls.length, 2);
globalThis.fetch = async () => new Response('down', { status: 503 });
r = res(); await tenantsApi({ headers: {}, query: { addr: '101 Main St', zip: '77484' } }, r); assert.equal(r.code, 502);
r = res(); await tenantsApi({ headers: {}, query: {} }, r); assert.equal(r.code, 400);
console.log('area tests passed');
