// MCP tools about an area or market (api/mcp.js): demographics, market_context, businesses, businesses_at_address,
// company_lookup, development_activity, construction_filings, top_companies, crime_near, crime_by_agency, news,
// airports_near and area_overview (one call for most of it). Same functions as the website's endpoints, no HTTP back into
// this app; every part fails on its own; every answer names its sources, their dates and their coverage.
import { resolve, areaOf, areaLabel, whereLine, homeCounties, UserError } from './resolve.mjs';
import { doc, kv, list, n0, n1, usd, usdM, pct, mi as miles, clip, failed, notCovered } from './text.mjs';
import { COVER } from './datasets.mjs';
import { today, inTexas, tractAt } from './site.mjs';
import { load } from '../../api/_lib/data.mjs';
import { supa } from '../supa.mjs';
import { tractsFor, summarizeTracts, inGeom, miles as distMi } from '../demographics.mjs';
import { housing, pipeline, rents, cityCounties } from '../marketcalc.mjs';
import { marketStats } from '../marketstats.mjs';
import { SECTORS } from '../sectors.mjs';
import { CAT_LABEL } from '../spending.mjs';
import { GROUPS, normName } from '../places.mjs';
import { tenants } from '../../api/tenants.js';
import { lookupEntity, entityById, SOURCE as ENTITY_SOURCE, SEARCH_PAGE } from '../../api/entity.js';
import { crimeReport, COVERAGE as HPD_COVERAGE, HOUSTON_SQMI } from '../../api/crime.js';
import { agencyReport, directory, rankings } from '../../api/crimeus.js';
import { placeAt, SITE_SOURCES } from '../../api/site.js';
import { underPath, TYPE_LABEL } from '../airports.mjs';
import { STATE_NAMES } from '../fbicrime.mjs';
import { bbox as bboxOf, areaSqMi } from '../fema.mjs';
import { circle } from '../../api/crime.js';

const live = () => 'live, read ' + today();
export const db = (env = process.env) => supa({ ...env, SUPABASE_URL: env.SUPABASE_URL || 'https://ytsxkipkobvcgysylfzc.supabase.co' });
const needDb = what => what + ' needs the app’s database, which isn’t configured on this deployment.';
const settle = async fn => { try { return { ok: await fn() }; } catch (e) { return { err: e }; } };
const toMi = m => m / 1609.344;

// ---------- demographics ----------
export async function tractList() { return (await load('market.json')); }
export function ringFigures(s, base) {
  if (!s) return ['No census tracts here.'];
  return kv([['Tracts', n0(s.tracts)], ['Population', n0(s.population)], ['Population growth' + (base ? ' since ' + base : ''), pct(s.population_growth_pct)], ['Households', n0(s.households)], ['Housing units', n0(s.housing_units)],
    ['Median household income (approx.)', usd(s.median_household_income_approx)], ['Median home value (approx.)', usd(s.median_home_value_approx)], ['Median gross rent (approx.)', usd(s.median_gross_rent_approx)],
    ['Vacancy', s.vacancy_rate_pct != null ? s.vacancy_rate_pct + '%' : null], ['Median age (approx.)', s.median_age_approx], ['Jobs located here (LODES)', s.jobs != null ? n0(s.jobs) : null],
    ['Consumer spending (est.)', s.consumer_spending_estimate ? usdM(s.consumer_spending_estimate.per_year) + ' a year, ' + usd(s.consumer_spending_estimate.per_household) + ' per household' : null]]);
}
export async function demographicsData(loc, radii) {
  const m = await tractList(), T = m.tracts || [];
  const sets = loc.geometry && loc.kind !== 'circle' ? [{ label: loc.label, list: tractsFor(T, { geom: loc.geometry }) }]
    : (loc.radius_mi ? [loc.radius_mi] : radii).map(r => ({ label: r + ' mi', mi: r, list: tractsFor(T, { c: loc.center, mi: r }) }));
  return { m, rings: sets.map(x => ({ ...x, s: summarizeTracts(x.list), h: housing(x.list) })) };
}
export const demoSources = m => [{ name: 'US Census ACS 5-year tract estimates', asOf: 'ACS ' + (m.year - 4) + '–' + m.year, url: 'https://www.census.gov/programs-surveys/acs', coverage: COVER.home },
  { name: 'US Census LEHD LODES 8 workplace jobs', asOf: 'jobs year ' + m.jobsYear, url: 'https://lehd.ces.census.gov/data/', coverage: COVER.home },
  { name: 'Consumer spending, modeled: ACS households by income × BLS Consumer Expenditure Survey (South)', asOf: 'spending year ' + m.spendYear, url: 'https://www.bls.gov/cex/', coverage: COVER.home }];
export const DEMO_NOTE = 'Medians for several tracts are household-weighted averages of tract medians (approx.), not true medians. A ring takes every tract whose centre is within the radius (plus the tract the point is in), so ring edges follow tract lines. Spending is modeled, not measured.';
export async function demographicsTool(args) {
  const loc = await resolve(args);
  if (!loc.home) return doc('Demographics: ' + loc.label, [whereLine(loc), notCovered('Census tract demographics', COVER.home)]);
  const radii = (Array.isArray(args.radii) && args.radii.length ? args.radii : [1, 3, 5]).map(Number).filter(r => r > 0 && r <= 25).slice(0, 4);
  const { m, rings } = await demographicsData(loc, radii.length ? radii : [1, 3, 5]);
  const L = [whereLine(loc)];
  for (const r of rings) {
    L.push('', '## ' + r.label, ...ringFigures(r.s, m.baseYear));
    if (r.h?.income) L.push('Households by income: ' + r.h.income.map(b => b.label + ' ' + b.pct.toFixed(1) + '%').join(', '));
    const sp = r.s?.consumer_spending_estimate?.by_category; if (sp) L.push('Spending by category (est., a year): ' + Object.entries(sp).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => (CAT_LABEL[k] || k) + ' ' + usdM(v)).join(', '));
  }
  return doc('Demographics: ' + loc.label, L, demoSources(m), [...loc.notes, DEMO_NOTE]);
}

// ---------- market context ----------
export async function countyFips(loc, county) {
  const area = await load('area.json');
  if (county && /^(all|region)$/i.test(county)) return { all: true, fips: area.counties.map(c => c.fips), label: 'all ' + area.counties.length + ' home counties' };
  const name = county || loc?.county?.name, c = area.counties.find(x => x.fips === name || x.name.toLowerCase() === String(name || '').toLowerCase().replace(/\s*county.*$/, ''));
  return c ? { all: false, fips: [c.fips], label: c.name + ' County' } : null;
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export async function marketData(sel) {
  const [area, market, geo, filings] = await Promise.all([load('area.json'), load('market.json'), load('geo.json'), load('filings.json').catch(() => null)]);
  const s = marketStats({ area, market, fips: sel.fips, all: sel.all, places: geo.places });
  const names = new Set(sel.fips.map(f => area.counties.find(c => c.fips === f)?.name));
  const cg = (geo.counties || []).map(c => ({ name: c.name, geom: { type: 'MultiPolygon', coordinates: c.outline } }));
  const towns = new Set(Object.values(area.rents?.zips || {}).map(z => z.city));
  const rn = area.rents?.zips ? rents(area.rents.zips, { counties: sel.all ? null : names, cityCounty: cityCounties((geo.places || []).filter(p => towns.has(p[0])), cg) }) : null;
  const p = filings ? pipeline(filings.filings.map(f => ({ ...f, use: f.use })), { counties: sel.all ? null : names, since: filings.period?.start }) : null;
  const tr = (market.tracts || []).filter(t => sel.fips.some(f => String(t.g).startsWith(f)));
  return { area, market, s, rn, p, h: housing(tr), names };
}
export async function marketTool(args) {
  const loc = args.county && !args.address && args.lat == null && !args.apn ? null : (args.address || args.lat != null || args.apn || args.geojson || args.bbox ? await resolve(args) : null);
  const sel = await countyFips(loc, args.county);
  if (!sel) return doc('Market context', [loc ? whereLine(loc) : 'County: ' + (args.county || '—'), notCovered('County market data', COVER.home + ', or "all" for the region')]);
  const { area, market, s, rn, p, h } = await marketData(sel), topic = args.topic || 'all', want = k => topic === 'all' || topic === k;
  const L = loc ? [whereLine(loc)] : [], F = sel.fips;
  if (want('population') && s.pop) L.push('', '## Population (ACS ' + s.pop.year + ')', n0(s.pop.n) + ' people, ' + pct(s.pop.gr) + ' since ' + s.pop.baseYear + '.');
  if (want('housing') && h) L.push('Housing (census, approx.): median home value ' + usd(h.median_home_value_approx) + ', median household income ' + usd(h.median_household_income_approx) + ', median rent ' + usd(h.median_gross_rent_approx) + ', vacancy ' + h.vacancy_rate_pct + '%.');
  if (want('jobs') && s.jobs) L.push('', '## Jobs (LODES ' + s.jobs.year + ')', n0(s.jobs.n) + ' jobs, ' + pct(s.jobs.gr) + ' since ' + s.jobs.baseYear + '. Top industries: ' + s.jobs.sec.map((v, i) => [SECTORS[i][1], v]).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + ' ' + n0(v)).join(', ') + '.');
  if (want('jobs')) { const u = F.map(f => area.unemployment?.counties?.[f]).filter(Boolean); if (u.length) L.push('Unemployment (BLS LAUS): ' + u.map(x => x.name + ' ' + x.rate + '% in ' + x.period + ' (a year earlier ' + x.yearAgo + '%' + (x.preliminary ? ', preliminary' : '') + ')').join('; ') + (area.unemployment.state ? '; Texas ' + area.unemployment.state.rate + '%.' : '.')); }
  if (want('permits') && s.permits?.length) { L.push('', '## Housing units permitted (Census Building Permits Survey)', s.permits.slice(-5).map(r => r.y + ': ' + n0(r.sf + r.mf) + ' (' + n0(r.sf) + ' single-family, ' + n0(r.mf) + ' in 2+ unit buildings)').join('; '));
    if (s.ytd) L.push('Year to date through ' + MON[s.ytd.month - 1] + ' ' + s.ytd.year + ': ' + n0(s.ytd.n) + ' units' + (s.ytd.prior ? ' (' + pct((s.ytd.n / s.ytd.prior - 1) * 100) + ' vs the same months a year earlier)' : '') + '.'); }
  if (want('businesses') && s.biz?.length) { const last = s.biz.slice(-12), prev = s.biz.slice(-24, -12), sum = a => a.reduce((t, r) => t + r.n, 0);
    L.push('', '## New business locations (Comptroller sales-tax permits)', 'Last 12 months: ' + n0(sum(last)) + (prev.length === 12 ? ' (' + pct((sum(last) / sum(prev) - 1) * 100) + ' vs the 12 before)' : '') + '. By month: ' + last.map(r => r.m.slice(2) + ' ' + r.n).join(', '),
      'Newest: ' + (s.latest || []).slice(0, 8).map(b => clip(b.name, 40) + ' (' + [b.city ? b.city.charAt(0) + b.city.slice(1).toLowerCase() : '', b.date].filter(Boolean).join(', ') + ')').join('; ')); }
  if (want('sales_tax') && s.tax?.length) { const last = s.tax.slice(-12), sum = a => a.reduce((t, r) => t + r.n, 0);
    L.push('', '## City sales tax allocations (Comptroller)', 'Last 12 months: ' + usdM(sum(last)) + ' through ' + last[last.length - 1].m + '. Top cities: ' + (s.taxCities || []).slice(0, 8).map(c => c.city + ' ' + usdM(c.last12) + (c.prior12 ? ' (' + pct((c.last12 / c.prior12 - 1) * 100) + ')' : '')).join('; ')); }
  if (want('spending') && s.spend) L.push('', '## Consumer spending (modeled, ' + s.spend.year + ')', usdM(s.spend.total) + ' a year, ' + usd(s.spend.perHH) + ' per household. ' + Object.entries(s.spend.cats).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => (CAT_LABEL[k] || k) + ' ' + usdM(v)).join(', '));
  if (want('rents') && rn) L.push('', '## Rents (Zillow Observed Rent Index, ' + rn.month + ')', 'Typical ZIP: ' + usd(rn.typical) + ' a month (' + pct(rn.yoy) + ' a year), ' + rn.rows.length + ' ZIPs from ' + usd(rn.low.rent) + ' (' + rn.low.zip + ' ' + rn.low.city + ') to ' + usd(rn.high.rent) + ' (' + rn.high.zip + ' ' + rn.high.city + ').');
  if (want('loans')) { const mo = F.map(f => area.mortgages?.counties?.[f]).filter(Boolean); if (mo.length) L.push('Home loans (HMDA ' + area.mortgages.year + '): ' + n0(mo.reduce((t, x) => t + x.loans, 0)) + ' originated, ' + usdM(mo.reduce((t, x) => t + x.dollars, 0)) + ', ' + n0(mo.reduce((t, x) => t + x.purchase, 0)) + ' for purchase.'); }
  if (want('rates') && area.rates?.series) L.push('', '## Rates (national)', Object.values(area.rates.series).map(r => r.label + ' ' + r.value + '% on ' + r.date + ' (a year earlier ' + r.yearAgo + '%)').join('; '));
  if (want('pipeline') && p) L.push('', '## Construction pipeline (TDLR filings in the app)', 'Under construction now: ' + n0(p.active.n) + ' projects, ' + usdM(p.active.v) + '; starting in the next 90 days: ' + n0(p.starting.n) + ', ' + usdM(p.starting.v) + '. By use: ' + p.byUse.slice(0, 6).map(u => u.name + ' ' + usdM(u.v)).join(', ') + '. Largest: ' + p.largest.slice(0, 4).map(f => clip(f.name, 50) + ' ' + usdM(f.cost)).join('; '));
  if (want('news') && s.news?.length) L.push('', '## Local development news', ...s.news.slice(0, 6).map(a => '- ' + a.date + ' ' + clip(a.title, 120) + ' (' + a.domain + ')'));
  if (L.length <= 1) L.push('No market data for that topic.');
  return doc('Market context: ' + sel.label, L, [
    { name: 'App market data (data/area.json): Census BPS permits, Comptroller sales-tax permits and allocations, LEHD LODES, BLS LAUS, FRED and New York Fed rates, Zillow ZORI, CFPB HMDA, Google News headlines', asOf: String(area.built).slice(0, 10) + ' (nightly; each source lags its own way)', url: 'https://www.census.gov/construction/bps/', coverage: COVER.home + ' (unemployment: every Texas county; rates: national)' },
    { name: 'US Census ACS 5-year tracts (data/market.json)', asOf: 'ACS ending ' + market.year, url: 'https://www.census.gov/programs-surveys/acs', coverage: COVER.home },
    { name: 'TDLR TABS filings (data/filings.json)', asOf: 'nightly', url: 'https://www.tdlr.texas.gov/TABS/Search', coverage: COVER.home + ' in the app’s file' }
  ], ['Permits arrive about six weeks after the month; LODES jobs are about two years old; only active sales-tax permits are listed, so older months read low.']);
}

// ---------- businesses (Overture + Foursquare places) ----------
export async function businessesTool(args) {
  const d = db(); if (!d || d.via !== 'key') return doc('Businesses', [needDb('Business listings')]);
  const q = String(args.query || '').trim(), group = GROUPS[args.category] ? args.category : null, limit = Math.min(40, Math.max(1, +args.limit || 15));
  const hasLoc = args.address || args.lat != null || args.apn || args.county || args.bbox || args.geojson, loc = hasLoc ? await resolve(args) : null;
  if (loc && !loc.home) return doc('Businesses: ' + loc.label, [whereLine(loc), notCovered('Business listings', COVER.home)]);
  const L = loc ? [whereLine(loc)] : [];
  const fmt = p => p.name + (p.cat ? ' (' + p.cat.replace(/_/g, ' ') + ')' : GROUPS[p.grp] ? ' (' + GROUPS[p.grp].label + ')' : '') + (p.addr ? ', ' + p.addr : '') + (p.city ? ', ' + p.city : '') + (p.m != null ? ' · ' + miles(toMi(p.m)) : p.km != null ? ' · ' + miles(p.km / 1.609) : '');
  if (q) {
    const t = normName(q).slice(0, 60); if (t.length < 2) throw new UserError('query needs at least 2 letters.');
    const rows = await d.rpc('places_search', { p_q: t, p_lon: loc ? loc.center[0] : null, p_lat: loc ? loc.center[1] : null, p_n: Math.min(40, limit) });
    L.push('', '## Named “' + q + '”' + (loc ? ', closest first' : ''), ...(rows.length ? list(rows, limit, fmt) : ['None found.']));
  } else if (loc) {
    const g = areaOf(loc, 0.25), b = bboxOf(g), small = !loc.geometry || loc.kind === 'circle' && loc.radius_mi <= 1.25;
    const [counts, near] = await Promise.all([settle(() => d.rpc('places_counts', { w: b[0], s: b[1], e: b[2], n: b[3] })),
      small ? settle(() => d.rpc('places_near', { p_lon: loc.center[0], p_lat: loc.center[1], p_m: Math.min(2000, (loc.radius_mi || 0.25) * 1609.344), p_n: 200 })) : { ok: null }]);
    if (counts.err) L.push(failed('Place counts', counts.err));
    else L.push('', '## Places by category (in the box around ' + areaLabel(loc, 0.25) + ')', ...Object.entries(counts.ok || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => '- ' + (GROUPS[k]?.label || k) + ': ' + n0(v)));
    if (near.err) L.push(failed('Nearby places', near.err));
    else if (near.ok) { const rows = near.ok.filter(p => !group || p.grp === group); L.push('', '## Nearest' + (group ? ' ' + GROUPS[group].label.toLowerCase() : ''), ...(rows.length ? list(rows, limit, fmt) : ['None.'])); }
    else if (group) { const rows = (await d.rpc('places_in_box', { w: b[0], s: b[1], e: b[2], n: b[3], p_groups: [group], p_limit: 2000 })).filter(r => inGeom([r[3], r[4]], g));
      L.push('', '## ' + GROUPS[group].label + ': ' + n0(rows.length) + ' in the area', ...list(rows, limit, r => r[1])); }
  } else throw new UserError('Give a query (business name), a location, or both.');
  return doc('Businesses' + (loc ? ': ' + loc.label : ''), L, [{ name: 'Overture Maps Foundation Places (CDLA-Permissive-2.0) and Foursquare Open Source Places (Apache-2.0), merged', asOf: 'monthly load', url: 'https://overturemaps.org/', coverage: COVER.home }],
    ['Listings are open data and miss some businesses; counts by category use the box around the area.']);
}

// ---------- registered businesses at an address (Comptroller) ----------
export async function tenantsTool(args) {
  let addr = String(args.address || '').trim(), zip = String(args.zip || '').trim(), city = String(args.city || '').trim();
  if (!addr) throw new UserError('Give a street address with a house number (and a ZIP or city).');
  const m = /^(.*?),\s*([^,]+?),\s*(?:TX|Texas)\.?,?\s*(\d{5})?/i.exec(addr); if (m) { addr = m[1]; city ||= m[2]; zip ||= m[3] || ''; }
  const z = /\b(\d{5})(?:-\d{4})?\s*$/.exec(String(args.address)); if (!zip && z) zip = z[1];
  const d = await tenants(addr, zip, city);
  const L = ['Address searched: ' + addr + (zip ? ' ' + zip : city ? ', ' + city : '') + (d.query ? ' (matched as house number + street word: ' + d.query + ')' : '')];
  if (d.note) L.push(d.note); else if (!d.tenants.length) L.push('No active sales-tax permits at this address.');
  else L.push('', ...list(d.tenants, 30, t => t.name + (t.owner ? ' (owner: ' + t.owner + ')' : '') + (t.suite ? ', suite ' + t.suite : '') + (t.sector ? ' · ' + t.sector : '') + (t.opened ? ' · permit issued ' + t.opened : '')));
  return doc('Registered businesses at ' + addr, L, [{ name: 'Texas Comptroller, active sales tax permit holders', asOf: live(), url: 'https://data.texas.gov/d/jrea-zgmq', coverage: COVER.texas }],
    ['Only businesses selling taxable goods or services hold a permit (retail, restaurants, many services); most offices and medical practices don’t appear. Closed locations drop out.']);
}

// ---------- company lookup ----------
export async function companyTool(args) {
  const id = String(args.taxpayer_id || '').trim(), name = String(args.name || '').trim();
  if (!id && name.length < 3) throw new UserError('Give a company name (at least 3 letters) or an 11-digit Texas taxpayer number.');
  if (id && !/^\d{11}$/.test(id)) throw new UserError('taxpayer_id is an 11-digit Texas taxpayer number.');
  const d = id ? await entityById(id) : await lookupEntity(name), L = [];
  if (d.individual) L.push('“' + d.query + '” looks like a person’s name, not a company. This tool looks up companies only.');
  else if (d.public) L.push('“' + d.query + '” is a public body (a city, county, school or utility district), which isn’t a franchise taxpayer.');
  else if (!d.match) { L.push('No exact match for “' + d.query + '” among ' + n0(d.total) + ' results.'); if (d.candidates?.length) L.push('Close names (call again with taxpayer_id): ' + d.candidates.map(c => c.name + ' [' + c.taxpayer_id + ']').join('; ')); }
  else { const x = d.match;
    L.push(...kv([['Name', x.name + (x.dba ? ' (dba ' + x.dba + ')' : '')], ['Texas taxpayer number', x.taxpayer_id], ['Status', x.status], ['Secretary of State status', x.sos_status], ['Formed', x.formed], ['State of formation', x.state], ['SOS file number', x.sos_file],
      ['Registered agent', x.agent ? x.agent.name + ' — ' + x.agent.address : null], ['Mailing address', x.mailing], ['Public Information Report year', x.report_year]]));
    if (x.officers?.length) L.push('Officers, directors, managers (from the latest Public Information Report): ' + x.officers.slice(0, 12).map(o => o.name + ' (' + o.titles.join(', ') + ')').join('; ') + (x.officers_total > 12 ? '; and ' + (x.officers_total - 12) + ' more' : '')); }
  return doc('Company: ' + (d.match?.name || d.query || id), L, [{ name: ENTITY_SOURCE, asOf: live(), url: SEARCH_PAGE, coverage: 'companies registered or doing business in Texas' }]);
}

// ---------- development activity (dev_items) ----------
const DEV_KINDS = ['permit', 'plat', 'txdot', 'district', 'school'], DEV_LABEL = { permit: 'Building permits (Harris County, HCAD)', plat: 'Plats and new subdivisions', txdot: 'TxDOT road projects', district: 'Water districts (MUDs, WCIDs)', school: 'Public schools' };
export async function developmentTool(args) {
  const d = db(); if (!d || d.via !== 'key') return doc('Development activity', [needDb('Development activity')]);
  const loc = await resolve(args);
  if (!loc.home) return doc('Development activity: ' + loc.label, [whereLine(loc), notCovered('Development activity', COVER.home)]);
  const kinds = (Array.isArray(args.kinds) && args.kinds.length ? args.kinds : DEV_KINDS).filter(k => DEV_KINDS.includes(k)), months = Math.min(120, Math.max(1, +args.months || 12));
  const from = /^\d{4}-\d\d-\d\d$/.test(args.date_from || '') ? args.date_from : new Date(Date.now() - months * 30.44 * 864e5).toISOString().slice(0, 10), to = /^\d{4}-\d\d-\d\d$/.test(args.date_to || '') ? args.date_to : null;
  const mi0 = loc.kind === 'point' || loc.kind === 'parcel' ? 1 : null, g = areaOf(loc, mi0), b = bboxOf(g), limit = Math.min(30, Math.max(1, +args.limit || 10));
  const dated = k => k === 'permit' || k === 'plat';
  const raw = await d.rpc('dev_in_box', { p_kinds: kinds, w: b[0], s: b[1], e: b[2], n: b[3], p_since: null, p_limit: 8000, p_shapes: false });
  const rows = (raw || []).map(r => ({ id: r[0], kind: r[1], name: r[2], cat: r[3], day: r[4], lon: +r[5], lat: +r[6], units: r[7], amount: r[8] }))
    .filter(r => r.lon != null && inGeom([r.lon, r.lat], g)).filter(r => !dated(r.kind) || (r.day && r.day >= from && (!to || r.day <= to)));
  const L = [whereLine(loc), 'Area: ' + areaLabel(loc, mi0) + '. Permits and plats from ' + from + (to ? ' to ' + to : '') + '; TxDOT projects, districts and schools as they stand now.'];
  if ((raw || []).length >= 8000) L.push('(The box holds more than 8,000 rows; the newest 8,000 were checked.)');
  for (const k of kinds) {
    const ks = rows.filter(r => r.kind === k).sort((a, b) => String(b.day || '').localeCompare(String(a.day || ''))), cats = {};
    ks.forEach(r => cats[r.cat || 'other'] = (cats[r.cat || 'other'] || 0) + 1);
    L.push('', '## ' + DEV_LABEL[k] + ': ' + n0(ks.length) + (Object.keys(cats).length > 1 ? ' (' + Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, n]) => c + ' ' + n).join(', ') + ')' : ''));
    if (k === 'permit' && !(loc.county?.name === 'Harris')) L.push('(Building permits are loaded for Harris County only.)');
    L.push(...list(ks, limit, r => r.name + (r.cat ? ' · ' + r.cat : '') + (r.day ? ' · ' + r.day : '') + (r.units ? ' · ' + n0(r.units) + ' units' : '') + (r.amount ? ' · ' + (k === 'district' ? 'tax rate ' + r.amount : k === 'school' ? n0(r.amount) + ' students' : usdM(r.amount)) : '')));
  }
  let meta = null; try { meta = await d.rpc('county_meta', {}); } catch (e) { /* optional */ }
  const at = meta ? Object.values(meta).map(x => x.at).filter(Boolean).sort().pop()?.slice(0, 10) : null;
  return doc('Development activity: ' + loc.label, L, [{ name: 'HCAD weekly permit files and Harris County Engineering ePermits; City of Houston plat applications; Fort Bend, Montgomery, Waller, Austin, Washington and Grimes subdivision maps; TxDOT Project Tracker; TCEQ water districts and Bond Review Board; TEA schools', asOf: at ? 'last load ' + at : 'nightly load', url: 'https://hcad.org/', coverage: COVER.home + ' (permits: Harris County only)' }]);
}

// ---------- TDLR filings ----------
const COLS = 'id,name,county,city,addr,type,cost,sqft,owner,reg,status,ts,te,lat,lon,use,subtype,developer,architect,gc,units';
const like = s => '*' + String(s).replace(/[*,()"\\]/g, ' ').trim() + '*';
// rows matching the filters, statewide from the database (largest first, up to cap), else the app's home-county file
export async function queryFilings(loc, f, { cap = 10000 } = {}) {
  const g = loc?.geometry || (loc ? circle(loc.center[0], loc.center[1], 2) : null), d = db(), from = f.date_from, to = f.date_to;
  const keep = r => (!g || (r.lon != null && inGeom([r.lon, r.lat], g))) && (!f.uses?.length || f.uses.includes(r.use)) && (!f.types?.length || f.types.includes(r.type));
  if (d && d.via === 'key') {
    const p = [], b = g ? bboxOf(g) : null;
    if (b) p.push('lon=gte.' + b[0], 'lon=lte.' + b[2], 'lat=gte.' + b[1], 'lat=lte.' + b[3]);
    if (loc?.kind === 'county' && loc.county?.fips) p.push('fips=eq.' + loc.county.fips);
    if (from) p.push('reg=gte.' + from); if (to) p.push('reg=lte.' + to);
    if (f.min_cost) p.push('cost=gte.' + Math.round(f.min_cost)); if (f.max_cost) p.push('cost=lte.' + Math.round(f.max_cost));
    if (f.min_sqft) p.push('sqft=gte.' + Math.round(f.min_sqft)); if (f.max_sqft) p.push('sqft=lte.' + Math.round(f.max_sqft));
    if (f.uses?.length) p.push('use=in.(' + f.uses.map(u => '"' + u.replace(/"/g, '') + '"').join(',') + ')');
    if (f.types?.length) p.push('type=in.(' + f.types.join(',') + ')');
    for (const [k, col] of [['owner', 'owner'], ['developer', 'developer'], ['architect', 'architect'], ['contractor', 'gc']]) if (f[k]) p.push(col + '=ilike.' + encodeURIComponent(like(f[k])));
    if (f.company) p.push('or=(' + ['owner', 'developer', 'architect', 'gc'].map(c => c + '.ilike.' + encodeURIComponent(like(f.company))).join(',') + ')');
    const rows = [];
    for (let off = 0; off < cap; off += 1000) { const page = await d.select('filings', 'select=' + COLS + (p.length ? '&' + p.join('&') : '') + '&order=cost.desc.nullslast,id&limit=1000&offset=' + off, { deadline: Date.now() + 25000 }); rows.push(...page); if (page.length < 1000) break; }
    return { rows: rows.filter(keep).sort((a, b) => (b.cost || 0) - (a.cost || 0)), capped: rows.length >= cap, from: 'database' };
  }
  const F = (await load('filings.json')).filings, has = (v, s) => String(v || '').toLowerCase().includes(String(s).toLowerCase());
  const rows = F.map(r => ({ ...r, developer: r.dev, architect: r.arch, gc: r.gc, subtype: r.sub })).filter(r => keep(r) && (!from || r.reg >= from) && (!to || r.reg <= to) && (!f.min_cost || r.cost >= f.min_cost) && (!f.max_cost || r.cost <= f.max_cost)
    && (!f.min_sqft || r.sqft >= f.min_sqft) && (!f.max_sqft || r.sqft <= f.max_sqft) && (!f.owner || has(r.owner, f.owner)) && (!f.developer || has(r.developer, f.developer)) && (!f.architect || has(r.architect, f.architect)) && (!f.contractor || has(r.gc, f.contractor))
    && (!f.company || [r.owner, r.developer, r.architect, r.gc].some(v => has(v, f.company))) && (loc?.kind !== 'county' || r.county === loc.county?.name));
  return { rows: rows.sort((a, b) => (b.cost || 0) - (a.cost || 0)), capped: false, from: 'file' };
}
export const filingFilters = a => ({ date_from: /^\d{4}-\d\d-\d\d$/.test(a.date_from || '') ? a.date_from : null, date_to: /^\d{4}-\d\d-\d\d$/.test(a.date_to || '') ? a.date_to : null, min_cost: +a.min_cost || null, max_cost: +a.max_cost || null,
  min_sqft: +a.min_sqft || null, max_sqft: +a.max_sqft || null, uses: Array.isArray(a.uses) ? a.uses.map(String) : null, types: Array.isArray(a.types) ? a.types.filter(t => ['New', 'Reno', 'Addition', 'Other'].includes(t)) : null,
  owner: a.owner || null, developer: a.developer || null, architect: a.architect || null, contractor: a.contractor || null, company: a.company || null });
export const tabsLink = id => 'https://www.tdlr.texas.gov/TABS/Projects/' + id;
const filingSource = (q) => ({ name: 'TDLR TABS construction registrations, AI-tagged use and companies (' + (q.from === 'database' ? 'statewide table' : 'the app’s home-county file') + ')', asOf: 'nightly', url: 'https://www.tdlr.texas.gov/TABS/Search', coverage: q.from === 'database' ? COVER.texas + ' (registrations from the last five years as loaded)' : COVER.home + ' (last 24 months)' });
const FILING_NOTE = 'Costs and dates are the filer’s estimates; use, developer, architect and contractor are extracted by AI from the filing and can be wrong or missing; single-asset LLCs often hide the real sponsor.';
const hasLocArgs = a => a.address || a.lat != null || a.apn || a.county || a.bbox || a.geojson;
export async function filingsTool(args) {
  const loc = hasLocArgs(args) ? await resolve(args) : null;
  if (loc && !(inTexas(loc.center) || loc.state === 'TX')) return doc('Construction filings', [whereLine(loc), notCovered('TDLR filings', COVER.texas)]);
  const f = filingFilters(args); if (!loc && !f.company && !f.owner && !f.developer && !f.architect && !f.contractor) throw new UserError('Give a location (or county), or a company / owner / developer / architect / contractor to search for.');
  const q = await queryFilings(loc, f), rows = q.rows, limit = Math.min(50, Math.max(1, +args.limit || 15));
  const sum = (a, k) => a.reduce((t, r) => t + (+r[k] || 0), 0), group = (k) => { const m = new Map(); for (const r of rows) { const x = m.get(r[k] || '—') || { k: r[k] || '—', n: 0, v: 0 }; x.n++; x.v += +r.cost || 0; m.set(x.k, x); } return [...m.values()].sort((a, b) => b.v - a.v); };
  const sorted = args.sort === 'newest' ? rows.slice().sort((a, b) => String(b.reg).localeCompare(String(a.reg))) : rows;
  const L = [loc ? whereLine(loc) : 'Statewide search', 'Area: ' + (loc ? areaLabel(loc, 2) : 'all of Texas') + '. Filters: ' + (Object.entries(f).filter(([, v]) => v && (!Array.isArray(v) || v.length)).map(([k, v]) => k + ' ' + (Array.isArray(v) ? v.join('/') : v)).join(', ') || 'none') + '.', '',
    '## Totals', n0(rows.length) + ' filings' + (q.capped ? ' (the 10,000 largest matches; there are more)' : '') + ', ' + usdM(sum(rows, 'cost')) + ' estimated value, ' + n0(sum(rows, 'sqft')) + ' sq ft, ' + n0(sum(rows, 'units')) + ' housing units.',
    'By use: ' + group('use').slice(0, 8).map(x => x.k + ' ' + n0(x.n) + ' (' + usdM(x.v) + ')').join(', '), 'By type: ' + group('type').map(x => x.k + ' ' + n0(x.n)).join(', '),
    'By city: ' + group('city').slice(0, 8).map(x => x.k + ' ' + n0(x.n)).join(', '), '', '## ' + (args.sort === 'newest' ? 'Newest' : 'Largest') + ' ' + Math.min(limit, rows.length),
    ...list(sorted, limit, r => clip(r.name, 70) + ' · ' + [r.city, r.county].filter(Boolean).join(', ') + ' · ' + usdM(r.cost) + (r.sqft ? ' · ' + n0(r.sqft) + ' sf' : '') + ' · ' + [r.type, r.use, r.subtype].filter(Boolean).join(' / ') + ' · filed ' + r.reg + ' · ' + r.status +
      ([r.developer || r.owner ? 'developer/owner ' + clip(r.developer || r.owner, 40) : '', r.architect ? 'architect ' + clip(r.architect, 40) : '', r.gc ? 'contractor ' + clip(r.gc, 40) : ''].filter(Boolean).map(x => ' · ' + x).join('')) + ' · ' + r.id)];
  if (!rows.length) L.push('No filings match.');
  return doc('Construction filings' + (loc ? ': ' + loc.label : ''), L, [filingSource(q)], [...(loc?.notes || []), FILING_NOTE, 'Each filing: ' + tabsLink('<id>') + '.', loc && loc.kind === 'point' ? 'A point uses a 2-mile circle; pass radius_mi to change it.' : null]);
}
export async function topCompaniesTool(args) {
  const loc = hasLocArgs(args) ? await resolve(args) : null;
  if (!loc) throw new UserError('Give a location or county to rank companies in.');
  if (!(inTexas(loc.center) || loc.state === 'TX')) return doc('Top companies', [whereLine(loc), notCovered('TDLR filings', COVER.texas)]);
  const f = filingFilters(args), q = await queryFilings(loc, f), limit = Math.min(30, Math.max(1, +args.limit || 10));
  const roles = (Array.isArray(args.roles) && args.roles.length ? args.roles : ['developer', 'architect', 'contractor']).filter(r => ['developer', 'architect', 'contractor'].includes(r));
  const by = args.rank_by === 'count' ? 'n' : 'v', L = [whereLine(loc), 'Area: ' + areaLabel(loc, 2) + '. ' + n0(q.rows.length) + ' filings' + (q.capped ? ' (the 10,000 largest)' : '') + '.'];
  for (const role of roles) {
    const m = new Map(), key = r => role === 'developer' ? r.developer || r.owner : role === 'architect' ? r.architect : r.gc;
    for (const r of q.rows) { const k = String(key(r) || '').trim(); if (!k) continue; const x = m.get(k.toUpperCase()) || { name: k, n: 0, v: 0, top: null }; x.n++; x.v += +r.cost || 0; if (!x.top || (+r.cost || 0) > (+x.top.cost || 0)) x.top = r; m.set(k.toUpperCase(), x); }
    const top = [...m.values()].sort((a, b) => b[by] - a[by] || b.n - a.n);
    L.push('', '## ' + (role === 'developer' ? 'Developers / owners' : role === 'architect' ? 'Architects' : 'General contractors') + ' (by ' + (by === 'n' ? 'number of filings' : 'estimated value') + ')', ...(top.length ? list(top, limit, x => x.name + ': ' + n0(x.n) + ' filings, ' + usdM(x.v) + ' · largest: ' + clip(x.top.name, 50) + ' (' + usdM(x.top.cost) + ')') : ['None named.']));
  }
  return doc('Top companies: ' + loc.label, L, [filingSource(q)], [...loc.notes, FILING_NOTE]);
}

// ---------- crime ----------
export const HOUSTON_BOX = [-95.95, 29.5, -95.0, 30.15];
// does the area reach into the City of Houston (Census city limits)? null when the service can't say
export async function reachesHouston(g) {
  const r = await fetch(SITE_SOURCES.place + '/query', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'FinishesSolutions-RE-Intelligence/1.0 (project app agents)' }, signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ f: 'json', where: "BASENAME = 'Houston' AND STATE = '48'", geometry: JSON.stringify({ rings: g.type === 'Polygon' ? g.coordinates : g.coordinates.flat(), spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPolygon', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', returnCountOnly: 'true' }) });
  if (!r.ok) throw new Error('TIGERweb ' + r.status); const d = await r.json(); if (d.error || d.count == null) throw new Error('TIGERweb: ' + (d.error?.message || 'no count')); return d.count > 0;
}
export async function crimeNearTool(args) {
  const loc = await resolve(args), g = areaOf(loc, 0.5), b = bboxOf(g);
  const touches = !(b[2] < HOUSTON_BOX[0] || b[0] > HOUSTON_BOX[2] || b[3] < HOUSTON_BOX[1] || b[1] > HOUSTON_BOX[3]);
  const [reach, city] = touches ? await Promise.all([reachesHouston(g).catch(() => null), placeAt(loc.center[0], loc.center[1]).catch(() => undefined)]) : [false, undefined];
  if (reach === false) return doc('Crime near ' + loc.label, [whereLine(loc), notCovered('Street-level crime incidents', COVER.houston) + (city ? ' This place is in ' + city.full + '.' : '') + ' Use crime_by_agency for yearly rates of the police department covering any US location.']);
  const d = db(); if (!d) return doc('Crime near ' + loc.label, [needDb('Houston crime')]);
  const r = await crimeReport(d, g, 0, { deadline: Date.now() + 45000 });
  if (!r.latest) return doc('Crime near ' + loc.label, [whereLine(loc), r.note || 'No crime data loaded yet.']);
  const m = await load('market.json'), pop = tractsFor(m.tracts || [], { geom: g }).reduce((t, x) => t + (x.pop || 0), 0);
  const L = [whereLine(loc), 'Area: ' + areaLabel(loc, 0.5) + (city !== undefined && city?.name !== 'Houston' ? ' (the centre is outside Houston’s city limits: only incidents inside the city are counted)' : '') + '. 12 months ' + r.from + ' to ' + r.latest + ' vs the 12 before.', '',
    ...kv([['Incidents, last 12 months', n0(r.last12.total) + ' (' + n0(r.last12.v) + ' violent, ' + n0(r.last12.p) + ' property, ' + n0(r.last12.o) + ' other)'], ['Change vs prior 12 months', 'total ' + pct(r.change.total) + ', violent ' + pct(r.change.v) + ', property ' + pct(r.change.p)],
      ['Per square mile', r.per_sqmi ? n0(r.per_sqmi.total) + ' (Houston citywide ' + n0(r.city_per_sqmi?.total) + ')' : null], ['Per 1,000 residents (ACS tracts with centres inside)', pop > 200 ? n1(r.last12.total / pop * 1000) + ' (population about ' + n0(pop) + ')' : null]]),
    'Top offenses: ' + r.offenses.slice(0, 10).map(o => o.name + ' ' + n0(o.n)).join(', '), 'Where: ' + r.premises.slice(0, 6).map(p => p.premise + ' ' + n0(p.n)).join(', '),
    'By month (total): ' + r.months.slice(-12).map(x => x.m.slice(2) + ' ' + (x.v + x.p + x.o)).join(', ')];
  return doc('Crime near ' + loc.label, L, [{ name: 'Houston Police Department NIBRS incidents (loaded nightly)', asOf: 'incidents through ' + r.latest + ' (HPD runs about three months behind)', url: 'https://www.houstontx.gov/police/cs/', coverage: COVER.houston }],
    [...loc.notes, 'Per-resident rates use residents only, so busy commercial areas read high.']);
}
export async function crimeAgencyTool(args) {
  const out = [], src = [{ name: 'FBI Crime Data Explorer (department offenses by calendar year; state and US rates)', asOf: 'weekly library load, else live', url: 'https://cde.ucr.cjis.gov/', coverage: COVER.us }];
  let loc = null, r = null;
  const ori = String(args.ori || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 9);
  if (args.agency_name && !ori) {
    const st = String(args.state || 'TX').toUpperCase(); if (!STATE_NAMES[st]) throw new UserError('state is a two-letter US state code.');
    const want = String(args.agency_name).toLowerCase().replace(/\s+(police|sheriff).*$/, ''), dir = await directory(st);
    const hits = dir.filter(a => a.name.toLowerCase().includes(want) && (a.type === 'City' || a.type === 'County'));
    if (!hits.length) return doc('Crime by agency', ['No city or county police department in ' + STATE_NAMES[st] + ' matches “' + args.agency_name + '”.'], src);
    if (hits.length > 1 && !hits.some(a => a.name.toLowerCase().startsWith(want))) out.push('Several departments match; showing ' + hits[0].name + '. Others: ' + hits.slice(1, 6).map(a => a.name + ' [' + a.ori + ']').join('; '));
    r = await agencyReport({ ori: (hits.find(a => a.name.toLowerCase().startsWith(want)) || hits[0]).ori });
  } else if (ori) r = await agencyReport({ ori });
  else if (hasLocArgs(args)) { loc = await resolve(args); r = await agencyReport({ lat: loc.center[1], lon: loc.center[0] }); }
  if (r) {
    const b = r.body;
    if (r.status !== 200) out.push(b.error);
    else if (!b.agency) out.push(b.note);
    else { const h = b.headline;
      out.push(...(loc ? [whereLine(loc)] : []), ...kv([['Department', b.agency.name + ' [' + b.agency.ori + '] (' + b.agency.type + ')'], ['Why this one', b.note], ['Year', b.year + (b.partial ? ' (only ' + b.months + ' months reported)' : '') + (b.stale ? ' (stopped reporting after this year)' : '')], ['Population covered', n0(b.population)]]));
      if (h) out.push('Violent crime: ' + n1(h.rate_v) + ' per 100,000 (Texas ' + n1(h.state_rate_v) + ', US ' + n1(h.us_rate_v) + ')' + (h.change_v != null ? ', ' + pct(h.change_v) + ' vs the year before' : '') + (h.cleared_v != null ? ', ' + h.cleared_v + '% cleared' : '') + '.',
        'Property crime: ' + n1(h.rate_p) + ' per 100,000 (Texas ' + n1(h.state_rate_p) + ', US ' + n1(h.us_rate_p) + ')' + (h.change_p != null ? ', ' + pct(h.change_p) + ' vs the year before' : '') + (h.cleared_p != null ? ', ' + h.cleared_p + '% cleared' : '') + '.');
      if (b.rank) out.push('Among ' + n0(b.rank.peers) + ' ' + b.rank.type.toLowerCase() + ' departments in ' + b.rank.state + ' (' + b.rank.year + '): violent crime lower than ' + b.rank.v_lower_than_pct + '% of them, property crime lower than ' + b.rank.p_lower_than_pct + '%.');
      if (b.offenses?.length) out.push('Offenses (' + b.year + '): ' + b.offenses.map(o => o.name + ' ' + n0(o.n)).join(', '));
      out.push('Rates by year: ' + (b.years || []).filter(y => y.months > 0).slice(0, 8).map(y => y.y + ' ' + n1(y.rate_v) + ' / ' + n1(y.rate_p)).join('; ') + ' (violent / property per 100,000)');
      if (b.others?.length) out.push('Other departments in the county: ' + b.others.slice(0, 10).map(a => a.name + ' [' + a.ori + ']').join('; '));
      out.push(b.coverage); }
  }
  if (args.rankings) {
    const d = db(); if (!d) out.push(needDb('Statewide rankings'));
    else { const st = String(args.state || r?.body?.state || 'TX').toUpperCase(), q = { rank: st, type: args.rank_type === 'County' ? 'County' : 'City', min_pop: args.min_population, order: args.order === 'p' ? 'p' : 'v', desc: args.highest_first ? '1' : '0', limit: Math.min(30, +args.limit || 15) };
      const k = await rankings(d, q); if (k.code !== 200) out.push(k.body.error);
      else out.push('', '## ' + k.body.state_name + ' ' + k.body.type.toLowerCase() + ' departments by ' + (k.body.order === 'p' ? 'property' : 'violent') + ' crime, ' + (k.body.highest_first ? 'highest' : 'lowest') + ' first (' + k.body.year + ')', ...list(k.body.departments, q.limit, x => x.name + ' [' + x.ori + ']: violent ' + n1(x.v_rate) + ', property ' + n1(x.p_rate) + ' per 100,000; population ' + n0(x.pop)), k.body.note); }
  }
  if (!out.length) throw new UserError('Give a location, an FBI agency ID (ori), an agency_name (with state), or rankings: true.');
  return doc('Crime by police department', out, src, ['Department-wide and whole-year only; rates use residents only, so places with many visitors read high. Campus, transit and state police are not included.']);
}

// ---------- news ----------
export async function newsTool(args) {
  const area = await load('area.json'), q = String(args.query || '').trim(), L = [], src = [], limit = Math.min(20, Math.max(1, +args.limit || 10));
  let loc = null; if (hasLocArgs(args) || args.place) loc = args.place && !hasLocArgs(args) ? null : await resolve(args);
  const placeName = String(args.place || '').toLowerCase().trim(), keys = new Set();
  if (placeName) for (const p of area.newsPlaces || []) if (p.label.toLowerCase().replace(/ county$/, '') === placeName.replace(/,?\s*(tx|texas)$/, '').replace(/ county$/, '')) keys.add(p.key);
  if (loc) { if (loc.county?.name) keys.add('county:' + loc.county.name); const t = loc.label.split(',')[0]; for (const p of area.newsPlaces || []) if (p.key === 'town:' + t) keys.add(p.key); }
  if ((placeName || loc) && !keys.size) L.push(notCovered('Stored local news for that place', 'the seven home counties and their ten busiest towns: ' + (area.newsPlaces || []).map(p => p.label).join(', ')));
  if (keys.size) {
    let arts = [...keys].flatMap(k => (area.news[k] || []).map(a => ({ ...a, place: (area.newsPlaces.find(p => p.key === k) || {}).label })));
    if (q) arts = arts.filter(a => a.title.toLowerCase().includes(q.toLowerCase()));
    const seen = new Set(); arts = arts.filter(a => !seen.has(a.url) && seen.add(a.url)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    L.push('## Local development news: ' + [...keys].map(k => k.split(':')[1]).join(', '), ...(arts.length ? list(arts, limit, a => a.date + ' · ' + clip(a.title, 140) + ' (' + a.domain + ') ' + a.url) : ['No stored headlines' + (q ? ' matching “' + q + '”' : '') + '.']));
    src.push({ name: 'Google News searches per county and town, run nightly by the app and stored (data/area.json)', asOf: String(area.built).slice(0, 10) + '; headlines kept 120 days', url: 'https://news.google.com/', coverage: COVER.home });
  }
  if (q) {
    const d = db();
    if (!d) L.push(needDb('Project and company news'));
    else { const t = q.replace(/[*,()"\\%]/g, ' ').trim();
      const rows = await d.select('news_articles', 'select=url,title,domain,published,filing_news(filing_id)&title=ilike.' + encodeURIComponent('*' + t + '*') + '&order=published.desc.nullslast&limit=' + limit, { deadline: Date.now() + 15000 });
      L.push('', '## Stored articles mentioning “' + q + '”', ...(rows.length ? list(rows, limit, a => (a.published || '') + ' · ' + clip(a.title, 140) + ' (' + a.domain + ')' + (a.filing_news?.length ? ' · filing ' + a.filing_news.map(x => x.filing_id).slice(0, 2).join(', ') : '') + ' ' + a.url) : ['None stored.']));
      src.push({ name: 'Articles the app found for construction filings (developer, tenant and owner searches; Google News and GDELT), stored nightly', asOf: 'nightly', url: 'https://www.gdeltproject.org/', coverage: 'filings in ' + COVER.home }); }
  }
  if (!L.length) throw new UserError('Give a place (county or town), a location, or a query (project or company name).');
  return doc('News' + (q ? ': ' + q : loc ? ': ' + loc.label : args.place ? ': ' + args.place : ''), L, src, ['Headlines link to the publisher (through Google News); read the article before relying on it.']);
}

// ---------- airports ----------
export async function airportsTool(args) {
  const d = db(); if (!d || d.via !== 'key') return doc('Airports', [needDb('Airports')]);
  const loc = await resolve(args), km = Math.min(300, Math.max(2, (+args.radius_mi || 25) * 1.609)), n = Math.min(15, Math.max(1, +args.limit || 6));
  const list0 = await d.rpc('airports_near', { p_lon: loc.center[0], p_lat: loc.center[1], p_km: km, p_n: n, p_types: ['large_airport', 'medium_airport', 'small_airport'] }) || [];
  const ids = list0.slice(0, 8).map(a => a.ident), rw = ids.length ? await d.select('airport_runways', 'select=*&airport_ident=in.(' + ids.map(encodeURIComponent).join(',') + ')').catch(() => []) : [];
  let path = null; for (const a of list0.slice(0, 3)) { const p = underPath(loc.center, rw.filter(r => r.airport_ident === a.ident)); if (p) { path = { ...p, name: a.name }; break; } }
  const L = [whereLine(loc), path ? 'Under a runway approach / departure path: ' + path.name + ' runway ' + path.runway + ' (aircraft landing on ' + path.landing_runway + ' pass over), ' + n1(path.beyond_nm) + ' nm beyond the runway end, ' + n1(path.offset_nm) + ' nm off the centerline.' : 'Not under a runway approach or departure path of the nearest airports.', '',
    ...list(list0, n, a => a.name + ' (' + [a.iata, a.icao || a.ident].filter(Boolean).join(' / ') + ') · ' + (TYPE_LABEL[a.type] || a.type) + ' · ' + miles(a.km / 1.609) + (a.scheduled ? ' · scheduled service' : '') +
      (rw.some(r => r.airport_ident === a.ident) ? ' · runways: ' + rw.filter(r => r.airport_ident === a.ident && !r.closed).slice(0, 4).map(r => (r.le_ident || '') + '/' + (r.he_ident || '') + ' ' + n0(r.length_ft) + ' ft ' + (r.surface || '')).join(', ') : ''))];
  if (!list0.length) L.push('No public airports within ' + Math.round(km / 1.609) + ' miles.');
  return doc('Airports near ' + loc.label, L, [{ name: 'OurAirports airports and runways (public domain), loaded nightly', asOf: 'nightly', url: 'https://ourairports.com/data/', coverage: COVER.world }], [...loc.notes, 'No live flight data here.']);
}

// ---------- one call for most of an area ----------
export async function areaOverviewTool(args, ctx) {
  const loc = await resolve(args), mi0 = loc.kind === 'point' || loc.kind === 'parcel' ? 1 : null, sub = { ...args, ...(mi0 && !args.radius_mi ? { radius_mi: mi0 } : {}) };
  const parts = await Promise.all([
    settle(async () => { if (!loc.home) return [notCovered('Demographics', COVER.home)]; const { m, rings } = await demographicsData(mi0 ? { ...loc, radius_mi: mi0 } : loc, [mi0 || 1]); return ringFigures(rings[0].s, m.baseYear); }),
    settle(async () => { const q = await queryFilings(mi0 ? { ...loc, geometry: circle(loc.center[0], loc.center[1], mi0) } : loc, filingFilters({ date_from: new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10) }));
      return [n0(q.rows.length) + ' filings registered in the last 12 months, ' + usdM(q.rows.reduce((t, r) => t + (+r.cost || 0), 0)) + '. Largest: ' + q.rows.slice(0, 4).map(r => clip(r.name, 50) + ' ' + usdM(r.cost)).join('; ')]; }),
    settle(async () => { if (!loc.home) return [notCovered('Development activity', COVER.home)]; const t = await developmentTool({ ...sub, limit: 3 }); return t.split('\n').filter(l => l.startsWith('## ')).map(l => l.slice(3)); }),
    settle(async () => { if (!loc.home) return [notCovered('Business listings', COVER.home)]; const d = db(); if (!d) return [needDb('Business counts')]; const b = bboxOf(areaOf(loc, mi0 || 1)), c = await d.rpc('places_counts', { w: b[0], s: b[1], e: b[2], n: b[3] });
      return [Object.entries(c || {}).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => (GROUPS[k]?.short || k) + ' ' + n0(v)).join(', ')]; }),
    settle(async () => { const t = await crimeNearTool(sub); const lines = t.split('\n'); return lines.filter(l => /^Incidents|^Change|not covered/.test(l)).slice(0, 2); }),
    settle(async () => { const sel = await countyFips(loc); if (!sel) return [notCovered('County market data', COVER.home)]; const { s } = await marketData(sel);
      return [sel.label + ': population ' + n0(s.pop?.n) + ' (' + pct(s.pop?.gr) + ' since ' + s.pop?.baseYear + '), jobs ' + n0(s.jobs?.n) + ' (' + pct(s.jobs?.gr) + ' since ' + s.jobs?.baseYear + '), homes permitted ' + (s.permits?.slice(-1)[0] ? n0(s.permits.slice(-1)[0].sf + s.permits.slice(-1)[0].mf) + ' in ' + s.permits.slice(-1)[0].y : '—') + '.']; })
  ]);
  const names = ['Demographics (' + (mi0 ? mi0 + ' mi' : 'the area') + ')', 'Construction filings', 'Development activity (last 12 months)', 'Businesses by category', 'Crime (Houston)', 'County market'];
  const L = [whereLine(loc)]; parts.forEach((p, i) => L.push('', '## ' + names[i], ...(p.err ? [failed(names[i], p.err)] : p.ok)));
  return doc('Area overview: ' + loc.label, L, ['- The same sources as demographics, construction_filings, development_activity, businesses, crime_near and market_context (call those for detail and full source notes).'], [...loc.notes, DEMO_NOTE]);
}
