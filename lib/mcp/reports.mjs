// MCP report tools (api/mcp.js): the website's own PDF reports, made on the server for a property (its parcel), a radius, a
// county or a polygon, returned as an embedded resource with a short text summary (and the report's CSV when asked):
//   content: [{ type: 'text', text }, { type: 'resource', resource: { uri: 'report://<kind>/<slug>.pdf', mimeType, blob } }]
// The HTML is built by the same lib/reports/*.mjs builders the website's Export PDF uses, with the same report kit
// (src/reportkit.js), and rendered by the same Chromium renderer (lib/pdf.mjs).
// Size: Vercel cuts a function's response at 4.5 MB and base64 adds a third, so the PDF (plus the CSV, when asked) must stay
// under PDF_LIMIT. A report is made with smaller street maps (fewer tiles) and its long tables capped to their top rows; one
// that is still too big is made again smaller, and one that can't fit comes back as a clear sentence instead of a PDF.
import * as kit from '../../src/reportkit.js';
import { render as chromium, inlineLogo as finishHtml } from '../pdf.mjs';
import { femaReport as femaHtml, femaCsvRows } from '../reports/fema.mjs';
import { crimeReport as crimeHtml, crimeCsvRows } from '../reports/crime.mjs';
import { crimeUSReport as crimeUSHtml, crimeUSCsvRows } from '../reports/crimeus.mjs';
import { envReport as envHtml, envCsvRows } from '../reports/env.mjs';
import { demographicsReport as demoHtml, demographicsCsvRows } from '../reports/demographics.mjs';
import { demographicsData, demoSources, DEMO_NOTE, marketData, countyFips } from './area.mjs';
import { marketReport as marketHtml, marketCsvRows } from '../reports/market.mjs';
import { traffic as txTraffic } from '../../api/traffic.js';
import { resolve, whereLine, areaOf, areaLabel, UserError } from './resolve.mjs';
import { doc, kv, n0, n1, usdM, pct, failed, notCovered } from './text.mjs';
import { COVER } from './datasets.mjs';
import { siteOf, inTexas, today } from './site.mjs';
import { db, reachesHouston, HOUSTON_BOX } from './area.mjs';
import { load } from '../../api/_lib/data.mjs';
import { femaReport } from '../../api/fema.js';
import { envReport } from '../../api/env.js';
import { crimeReport, CITY_BOX, HOUSTON_SQMI } from '../../api/crime.js';
import { agencyReport } from '../../api/crimeus.js';
import { placeAt } from '../../api/site.js';
import { tractsFor, summarizeTracts } from '../demographics.mjs';
import { bbox as bboxOf } from '../fema.mjs';
import { RISK_LABEL } from '../fema.mjs';

export const VERCEL_RESPONSE_LIMIT = 4.5e6;
export const PDF_LIMIT = 3_000_000; // bytes of PDF (+ CSV) before base64: 4.0 MB encoded, room for the JSON around it
// tests: a renderer when there's no Chromium, a lower limit (the oversized-report check)
export const hooks = { render: null, pdfLimit: null };
// the app's number formats (src/app.js), which the report builders are given in the browser too
export const fmtM = v => v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(v >= 1e8 ? 0 : 1) + 'M' : v >= 1e3 ? '$' + Math.round(v / 1e3) + 'K' : '$' + Math.round(v);
export const fmtN = n => n.toLocaleString('en-US');

// the report kit for the server: the same one, with street maps capped at `tiles` tile images
export function serverKit(tiles = 24) {
  const cap = (o = {}) => ({ ...o, maxTiles: Math.min(o.maxTiles ?? 48, tiles) });
  return { ...kit, fmtN, fmtM, areaMap: (layers, o) => kit.areaMap(layers, cap(o)), areaSvg: (layers, o) => kit.areaSvg(layers, cap(o)) };
}
export { finishHtml }; // (the logo inline: lib/pdf.mjs inlineLogo)
const titleOf = html => (/<title>([^<]*)<\/title>/.exec(html)?.[1] || 'Report').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
export const pages = pdf => (Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

export function csvText(rows) {
  if (!rows?.length) return '';
  const cols = Object.keys(rows[0]), q = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.join(','), ...rows.map(r => cols.map(c => q(r[c])).join(','))].join('\r\n');
}
const MB = n => (n / 1048576).toFixed(1) + ' MB';
export class TooBig extends Error {}
// render the report, smaller each try, until it fits: tries [{ tiles, rows }] -> { pdf, try }
export async function pdfThatFits(build, { tries = [{ tiles: 24, rows: 500 }, { tiles: 6, rows: 100 }], extra = 0, ctx = {} } = {}) {
  const render = ctx.render || hooks.render || chromium, limit = ctx.pdfLimit || hooks.pdfLimit || PDF_LIMIT; let last = 0;
  for (const t of tries) {
    const html = await finishHtml(await build(serverKit(t.tiles), t));
    const pdf = Buffer.from(await render(html, { title: titleOf(html) }));
    last = pdf.length; if (pdf.length + extra <= limit) return { pdf, try: t };
  }
  throw new TooBig('The PDF came out at ' + MB(last + extra) + (extra ? ' with the CSV' : '') + ', over the ' + MB(limit) + ' that fits in one answer here (Vercel caps a response at 4.5 MB and base64 adds a third), even with smaller maps and shorter tables. Ask for a smaller area' + (extra ? ', or leave out include_csv' : '') + ', or make this report on the website.');
}
// the tool's answer: the summary text, the PDF and (asked for) the CSV as embedded resources
export function reportResult(kind, label, text, pdf, csv) {
  const slug = kit.slug(label), content = [{ type: 'text', text: text + '\n\nAttached: ' + kind.replace(/_/g, ' ') + ' report PDF (' + pages(pdf) + ' page' + (pages(pdf) === 1 ? '' : 's') + ', ' + (pdf.length < 1048576 ? Math.round(pdf.length / 1024) + ' KB' : MB(pdf.length)) + ')' + (csv ? ' and its data as CSV.' : '.') }];
  content.push({ type: 'resource', resource: { uri: 'report://' + kind + '/' + slug + '.pdf', mimeType: 'application/pdf', blob: pdf.toString('base64') } });
  if (csv) content.push({ type: 'resource', resource: { uri: 'report://' + kind + '/' + slug + '.csv', mimeType: 'text/csv', text: csv } });
  return { content };
}
const sizeError = e => ({ content: [{ type: 'text', text: e.message }], isError: true });
async function make(kind, label, summary, build, csvRows, args, ctx, opts = {}) {
  const csv = args.include_csv ? csvText(csvRows()) : null;
  try { const { pdf, try: t } = await pdfThatFits(build, { ...opts, extra: csv ? Buffer.byteLength(csv) : 0, ctx });
    return reportResult(kind, label, summary + (t.note ? '\n' + t.note(t) : ''), pdf, csv); }
  catch (e) { if (e instanceof TooBig) return sizeError(e); throw e; }
}

// ---------- the four reports the website already makes ----------
export async function reportFlood(args, ctx = {}) {
  const loc = await resolve(args), s = await siteOf(loc, 0.25), d = await femaReport(s.geometry, { label: s.label, deadline: Date.now() + 150000 });
  const z = d.flood_zones, c = d.nfip_claims, r = d.risk_index;
  const summary = doc('FEMA flood & hazard report: ' + s.label, [whereLine(loc), ...kv([
    ['Flood zones', z?.error ? failed('FEMA’s flood zones', { message: z.error }) : Object.entries(z?.shares || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => (RISK_LABEL[k] || k) + ' ' + v + '%').join('; ')],
    ['NFIP claims (tracts touching the area)', c?.error ? failed('OpenFEMA claims', { message: c.error }) : n0(c?.claims || 0) + ' claims, ' + usdM(c?.paid || 0) + ' paid'],
    ['Disaster declarations since 2000', d.disasters?.error ? failed('OpenFEMA declarations', { message: d.disasters.error }) : n0(d.disasters?.count || 0)],
    ['National Risk Index', r?.error ? failed('The risk index', { message: r.error }) : r ? r.risk_rating + ' (expected annual loss ' + usdM(r.expected_annual_loss) + ')' : 'no tracts found']])],
    [{ name: d.sources, asOf: 'live, read ' + today(), url: 'https://hazards.fema.gov/nri/', coverage: COVER.us }], [s.note]);
  return make('flood', s.label, summary, async K => femaHtml(K).reportHtml(d, s.label, s.geometry), () => femaCsvRows(d), args, ctx);
}
export async function reportEnvironmental(args, ctx = {}) {
  const loc = await resolve(args);
  if (!inTexas(loc.center)) return { content: [{ type: 'text', text: doc('Environmental report: ' + loc.label, [whereLine(loc), notCovered('The environmental report', COVER.texas)]) }] };
  const s = await siteOf(loc, 0.1), d = await envReport(s.geometry, { label: s.label, deadline: Date.now() + 100000 });
  const k = Object.values(d.kinds), hits = k.filter(x => !x.error && x.count), bad = k.filter(x => x.error);
  const summary = doc('Environmental screening report: ' + s.label, [whereLine(loc), 'Records within each database’s search distance: ' + (hits.map(x => (x.label || x.kind) + ' ' + x.count + (x.onsite ? ' (' + x.onsite + ' on site)' : '')).join('; ') || 'none found') + '.',
    ...(bad.length ? ['Didn’t answer: ' + bad.map(x => x.label || x.kind).join(', ') + ' (marked in the report; try again).'] : [])],
    [{ name: d.sources, asOf: 'live, read ' + today(), url: 'https://www.tceq.texas.gov/gis/download-tceq-gis-data', coverage: COVER.texas + ' (EPA, wetlands and soils: US)' }], [s.note, 'A screen of public databases, not a Phase I environmental site assessment.']);
  return make('environmental', s.label, summary, async K => envHtml(K).reportHtml(d, s.label, s.geometry), () => envCsvRows(d), args, ctx);
}
// incidents per 1,000 residents (census tracts whose middle is inside the area), as the website's report card works it out
async function perResidents(g, d) {
  try { const m = await load('market.json'), x = summarizeTracts(tractsFor(m.tracts || [], { geom: g }));
    if (!x?.population || x.population < 500) return null; return { pop: x.population, rate: Math.round(d.last12.total / x.population * 10000) / 10, v: Math.round(d.last12.v / x.population * 10000) / 10 }; }
  catch (e) { return null; }
}
export async function reportCrime(args, ctx = {}) {
  const loc = await resolve(args), g = areaOf(loc, 0.5), label = areaLabel(loc, 0.5), b = bboxOf(g);
  const touches = !(b[2] < HOUSTON_BOX[0] || b[0] > HOUSTON_BOX[2] || b[3] < HOUSTON_BOX[1] || b[1] > HOUSTON_BOX[3]);
  const reach = touches ? await reachesHouston(g).catch(() => null) : false;
  if (reach === false) { const city = inTexas(loc.center) ? await placeAt(loc.center[0], loc.center[1]).catch(() => null) : null;
    return { content: [{ type: 'text', text: doc('Crime report: ' + label, [whereLine(loc), notCovered('The Houston crime report', COVER.houston) + (city ? ' This place is in ' + city.full + '.' : '') + ' Use report_crime_agency for the yearly City / County Crime Report of the police department covering any US location.']) }] }; }
  const d0 = db(); if (!d0) return { content: [{ type: 'text', text: 'The crime report needs the app’s database, which isn’t configured on this deployment.' }], isError: true };
  const d = await crimeReport(d0, g, 2000, { deadline: Date.now() + 50000 });
  if (!d.latest) return { content: [{ type: 'text', text: d.note || 'No crime data loaded yet.' }] };
  const res = await perResidents(g, d), list = d.incidents || [];
  const summary = doc('Crime report: ' + label, [whereLine(loc), ...kv([['Incidents, 12 months through ' + d.latest, n0(d.last12.total) + ' (' + n0(d.last12.v) + ' violent, ' + n0(d.last12.p) + ' property)'], ['Change vs the 12 months before', pct(d.change.total)],
    ['Per square mile', d.per_sqmi ? n0(d.per_sqmi.total) + ' (Houston ' + n0(d.city_per_sqmi?.total) + ')' : null], ['Per 1,000 residents', res ? n1(res.rate) : null]])],
    [{ name: 'Houston Police Department NIBRS incidents (loaded nightly)', asOf: 'incidents through ' + d.latest, url: 'https://www.houstontx.gov/police/cs/', coverage: COVER.houston }], [...loc.notes, d.incidents_note]);
  return make('crime', label, summary, async (K, t) => crimeHtml(K).reportHtml(d, label, g, res, { rows: t.rows }), () => crimeCsvRows(list), args, ctx,
    { tries: [{ tiles: 24, rows: 500, note: t => list.length > t.rows ? 'The PDF lists the newest ' + n0(t.rows) + ' of ' + n0(list.length) + ' incidents' + (args.include_csv ? '; the CSV has all ' + n0(list.length) + '.' : ' (include_csv for all of them).') : '' },
      { tiles: 6, rows: 100, note: t => list.length > t.rows ? 'The PDF lists the newest ' + n0(t.rows) + ' of ' + n0(list.length) + ' incidents to keep it small enough to send' + (args.include_csv ? '; the CSV has all of them.' : '.') : '' }] });
}
export async function reportCrimeAgency(args, ctx = {}) {
  const ori = String(args.ori || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 9);
  let loc = null, r;
  if (ori) r = await agencyReport({ ori });
  else { loc = await resolve(args); r = await agencyReport({ lat: loc.center[1], lon: loc.center[0] }); }
  if (r.status !== 200) return { content: [{ type: 'text', text: r.body.error }], isError: r.status >= 500 };
  const d = r.body; if (!d.agency) return { content: [{ type: 'text', text: (loc ? whereLine(loc) + '\n' : '') + d.note }] };
  if (!d.headline) return { content: [{ type: 'text', text: d.agency.name + ' has no full year of figures in the FBI data.' }] };
  const h = d.headline, center = loc?.center || null;
  const summary = doc('City / County Crime Report: ' + d.agency.name, [...(loc ? [whereLine(loc)] : []), ...kv([['Department', d.agency.name + ' [' + d.agency.ori + ']'], ['Why this one', d.note], ['Year', d.year],
    ['Violent crime per 100,000', n1(h.rate_v) + ' (' + d.state + ' ' + n1(h.state_rate_v) + ', US ' + n1(h.us_rate_v) + ')'], ['Property crime per 100,000', n1(h.rate_p) + ' (' + d.state + ' ' + n1(h.state_rate_p) + ', US ' + n1(h.us_rate_p) + ')']])],
    [{ name: 'FBI Crime Data Explorer', asOf: d.data_through ? 'FBI data through ' + d.data_through : 'weekly library load, else live', url: 'https://cde.ucr.cjis.gov/', coverage: COVER.us }]);
  return make('crime_agency', d.agency.name, summary, async K => crimeUSHtml(K).reportHtml(d, center), () => crimeUSCsvRows(d), args, ctx);
}

// ---------- new: the demographics report (rings around a property, or a county or drawn area) ----------
export async function reportDemographics(args, ctx = {}) {
  const loc = await resolve(args);
  if (!loc.home) return { content: [{ type: 'text', text: doc('Demographics report: ' + loc.label, [whereLine(loc), notCovered('Census tract demographics', COVER.home)]) }] };
  const radii = (Array.isArray(args.radii) && args.radii.length ? args.radii : [1, 3, 5]).map(Number).filter(r => r > 0 && r <= 25).sort((a, b) => a - b).slice(0, 4);
  // a parcel (an APN) is a property too: rings round it, not the tracts inside its outline
  const { m, rings } = await demographicsData(loc.kind === 'parcel' ? { ...loc, geometry: null } : loc, radii.length ? radii : [1, 3, 5]);
  if (!rings.some(r => r.s)) return { content: [{ type: 'text', text: doc('Demographics report: ' + loc.label, [whereLine(loc), 'No census tracts found here.']) }] };
  const asRing = loc.kind === 'point' || loc.kind === 'parcel' || loc.kind === 'circle';
  const parcel = asRing ? (loc.parcel?.geometry || loc.parcelGeometry || (await siteOf({ ...loc, geometry: null, kind: 'point' }, 0).catch(() => null))?.parcel?.geometry || null) : null;
  const label = asRing ? loc.label.replace(/^[\d.]+ mi around /, '') : loc.label, main = rings[Math.min(1, rings.length - 1)];
  const years = { acs: (m.year - 4) + '–' + m.year, base: m.baseYear, jobs: String(m.jobsYear), spend: String(m.spendYear) };
  const summary = doc('Demographics report: ' + label, [whereLine(loc), ...rings.map(r => r.label + ': ' + (r.s ? n0(r.s.population) + ' people, ' + n0(r.s.households) + ' households, median household income ~' + usdM(r.s.median_household_income_approx) + ', median home value ~' + usdM(r.s.median_home_value_approx) + (r.s.jobs != null ? ', ' + n0(r.s.jobs) + ' jobs' : '') : 'no tracts'))],
    demoSources(m), [...loc.notes, DEMO_NOTE]);
  return make('demographics', label, summary, async K => demoHtml(K).reportHtml({ label, center: asRing ? loc.center : null, rings: rings.map(r => ({ ...r, label: r.mi ? r.mi + ' mi' : r.label })), area: asRing ? null : loc.geometry, parcel, years }),
    () => demographicsCsvRows(rings), args, ctx);
}

// ---------- the Market report: a county, several, or the whole region ----------
const HOU_COUNTIES = ['48201', '48157', '48339'];
export async function marketReportData(sel) {
  const { area, market, s, rn, p, h, names } = await marketData(sel), [geo, markets] = await Promise.all([load('geo.json'), load('markets.json').catch(() => null)]);
  const geoms = (geo.counties || []).filter(c => names.has(c.name)).map(c => ({ type: 'MultiPolygon', coordinates: c.outline }));
  let w = 180, so = 90, e = -180, n = -90; for (const g of geoms) for (const poly of g.coordinates) for (const ring of poly) for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); so = Math.min(so, y); n = Math.max(n, y); }
  const d0 = db(), wantCrime = sel.all || sel.fips.some(f => HOU_COUNTIES.includes(f));
  const [crime, traffic] = await Promise.all([
    wantCrime ? (d0 ? crimeReport(d0, CITY_BOX, 0, { deadline: Date.now() + 45000, area: HOUSTON_SQMI }).catch(e2 => ({ error: e2.message })) : { error: 'the database isn’t configured here' }) : null,
    geoms.length ? txTraffic([w, so, e, n].map(v => +v.toFixed(3))).catch(e2 => ({ error: e2.message })) : null]);
  const mo = sel.fips.map(f => area.mortgages?.counties?.[f]).filter(Boolean);
  return { label: sel.all ? 'Houston region (' + area.counties.length + ' counties)' : sel.label, counties: [...names], stats: s, pipe: p, housing: h, rents: rn,
    unemployment: sel.fips.map(f => area.unemployment?.counties?.[f]).filter(Boolean), state: area.unemployment?.state,
    mortgages: mo.length ? { year: area.mortgages.year, loans: mo.reduce((t, x) => t + x.loans, 0), dollars: mo.reduce((t, x) => t + x.dollars, 0), purchase: mo.reduce((t, x) => t + x.purchase, 0) } : null,
    rates: Object.values(area.rates?.series || {}).map(r => ({ label: r.label, value: r.value, date: r.date, yearAgo: r.yearAgo })), markets, crime, traffic, geoms, built: area.built };
}
export async function reportMarket(args, ctx = {}) {
  let sel = null;
  if (Array.isArray(args.counties) && args.counties.length) {
    const area = await load('area.json'), F = args.counties.map(n => area.counties.find(c => c.name.toLowerCase() === String(n).toLowerCase().replace(/\s*county.*$/, ''))?.fips);
    if (F.some(f => !f)) return { content: [{ type: 'text', text: notCovered('The Market report for ' + args.counties.filter((_, i) => !F[i]).join(', '), COVER.home + ', or "all" for the region') }] };
    sel = { all: false, fips: [...new Set(F)], label: args.counties.length > 1 ? args.counties.map(n => String(n).replace(/\s*county.*$/i, '')).join(' + ') + ' counties' : String(args.counties[0]).replace(/\s*county.*$/i, '') + ' County' };
  } else {
    const loc = args.county && !args.address && args.lat == null && !args.apn ? null : (args.address || args.lat != null || args.apn || args.geojson || args.bbox ? await resolve(args) : null);
    sel = await countyFips(loc, args.county);
    if (!sel) return { content: [{ type: 'text', text: doc('Market report', [loc ? whereLine(loc) : 'County: ' + (args.county || '—'), notCovered('The Market report', COVER.home + ', or "all" for the region')]) }] };
  }
  const M = await marketReportData(sel), s = M.stats;
  const summary = doc('Market report: ' + M.label, kv([['Population', s.pop ? n0(s.pop.n) + ' (' + pct(s.pop.gr) + ' since ' + s.pop.baseYear + ')' : null], ['Jobs', s.jobs ? n0(s.jobs.n) + ' (' + pct(s.jobs.gr) + ' since ' + s.jobs.baseYear + ')' : null],
    ['Under construction (TDLR filings)', M.pipe ? usdM(M.pipe.active.v) + ' in ' + n0(M.pipe.active.n) + ' projects' : null], ['Homes permitted ' + (s.permits?.slice(-1)[0]?.y || ''), s.permits?.length ? n0(s.permits.slice(-1)[0].sf + s.permits.slice(-1)[0].mf) : null],
    ['Typical rent (Zillow)', M.rents ? '$' + n0(M.rents.typical) + ' (' + pct(M.rents.yoy) + ' in a year)' : null], ['Houston crime', M.crime?.error ? failed('Houston crime', { message: M.crime.error }) : null], ['TxDOT roads', M.traffic?.error ? failed('TxDOT traffic counts', { message: M.traffic.error }) : null]]),
    [{ name: 'The app’s market data (data/area.json, data/market.json, data/markets.json, data/filings.json), Houston Police (NIBRS) and TxDOT AADT', asOf: String(M.built).slice(0, 10), url: 'https://www.census.gov/construction/bps/', coverage: COVER.home }],
    ['A static print version of the Market page: the same numbers as print charts and tables (the page’s charts are interactive).']);
  return make('market', M.label, summary, async K => marketHtml(K).reportHtml(M), () => marketCsvRows(M), args, ctx);
}
