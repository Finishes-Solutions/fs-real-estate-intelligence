// Economic context for cards, the Market view and underwriting. All free, no keys required (BLS_KEY optional):
//   rates         10-yr and 5-yr Treasury and 30-yr mortgage (FRED graph CSV), SOFR (New York Fed): latest + a year of weekly points
//   unemployment  BLS LAUS monthly unemployment rate for every Texas county, the state and the metros (latest + same month a year ago)
//   rents         Zillow Observed Rent Index (ZORI) by Texas ZIP: latest typical asking rent and change over a year
//   mortgages     CFPB HMDA originated home loans per region county for the latest year (count, dollars, home purchase share)
// Each part is best effort; buildArea keeps last run's numbers when a source fails.
import { log } from './util.mjs';
import { csvLine } from '../lib/csv.mjs';

const UA = { 'User-Agent': 'Mozilla/5.0 (FinishesSolutions RE intelligence; data build)' };
async function get(url, { ms = 60000, ...opts } = {}) {
  const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(url.split('?')[0] + ' ' + r.status);
  return r;
}

// ---------- rates ----------
// FRED graph CSV: "observation_date,DGS10\n2026-09-30,5.29\n…" ('.' = no value that day)
export function parseFredCsv(csv) {
  const out = [];
  for (const l of String(csv).trim().split('\n').slice(1)) { const [d, v] = l.split(','); const n = parseFloat(v); if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(n)) out.push([d, n]); }
  return out;
}
// keep the latest value, the value a year earlier, and one point per week for a sparkline
export function summarizeSeries(points, now = Date.now()) {
  if (!points.length) return null;
  const last = points[points.length - 1], yearAgo = new Date(Date.parse(last[0]) - 365 * 864e5).toISOString().slice(0, 10);
  const prior = [...points].reverse().find(p => p[0] <= yearAgo) || null, cut = new Date(now - 400 * 864e5).toISOString().slice(0, 10);
  const weekly = []; let wk = null;
  for (const p of points) { if (p[0] < cut) continue; const w = Math.floor(Date.parse(p[0]) / (7 * 864e5)); if (w !== wk) { weekly.push(p); wk = w; } else weekly[weekly.length - 1] = p; }
  return { date: last[0], value: last[1], yearAgo: prior ? prior[1] : null, weekly };
}
const FRED = { t10: ['DGS10', '10-yr Treasury'], t5: ['DGS5', '5-yr Treasury'], m30: ['MORTGAGE30US', '30-yr mortgage (Freddie Mac)'] };
export async function buildRates() {
  const out = { built: new Date().toISOString(), series: {} };
  const since = new Date(Date.now() - 420 * 864e5).toISOString().slice(0, 10);
  for (const [k, [id, label]] of Object.entries(FRED)) {
    try { const s = summarizeSeries(parseFredCsv(await (await get('https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + id + '&cosd=' + since)).text())); if (s) out.series[k] = { label, ...s }; }
    catch (e) { log('econ: rate', id, 'failed:', e.message); }
  }
  try {
    const d = await (await get('https://markets.newyorkfed.org/api/rates/secured/sofr/search.json?startDate=' + since + '&endDate=' + new Date().toISOString().slice(0, 10))).json();
    const pts = (d.refRates || []).map(r => [r.effectiveDate, +r.percentRate]).filter(p => Number.isFinite(p[1])).sort((a, b) => a[0] < b[0] ? -1 : 1);
    const s = summarizeSeries(pts); if (s) out.series.sofr = { label: 'SOFR', ...s };
  } catch (e) { log('econ: SOFR failed:', e.message); }
  if (!Object.keys(out.series).length) throw new Error('no rate series reachable');
  log('econ: rates', Object.entries(out.series).map(([k, s]) => k + '=' + s.value + '% (' + s.date + ')').join(', '));
  return out;
}

// ---------- unemployment (BLS LAUS) ----------
export const TX_COUNTY_FIPS = Array.from({ length: 254 }, (_, i) => '48' + String(i * 2 + 1).padStart(3, '0'));
// metros the region and the big Texas markets sit in (LAUS area codes)
export const METROS = { '26420': 'Houston', '19100': 'Dallas–Fort Worth', '12420': 'Austin', '41700': 'San Antonio' };
const lausId = fips => 'LAUCN' + fips + '0000000003';
// BLS API rows -> { latest: {period, value}, yearAgo }
export function lausSummary(series) {
  const data = (series?.data || []).filter(d => /^M(0[1-9]|1[0-2])$/.test(d.period) && d.value !== '-').map(d => ({ y: +d.year, m: +d.period.slice(1), v: parseFloat(d.value), p: (d.footnotes || []).some(f => f.code === 'P') }));
  if (!data.length) return null;
  data.sort((a, b) => b.y - a.y || b.m - a.m);
  const l = data[0], ya = data.find(d => d.y === l.y - 1 && d.m === l.m);
  return { period: l.y + '-' + String(l.m).padStart(2, '0'), rate: l.v, yearAgo: ya ? ya.v : null, preliminary: l.p || undefined };
}
async function blsSeries(ids) {
  const key = process.env.BLS_KEY || process.env.BLS_API_KEY, per = key ? 50 : 25, out = {};
  for (let i = 0; i < ids.length; i += per) {
    const body = { seriesid: ids.slice(i, i + per), ...(key ? { registrationkey: key } : {}) };
    const d = await (await get('https://api.bls.gov/publicAPI/' + (key ? 'v2' : 'v1') + '/timeseries/data/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
    if (d.status !== 'REQUEST_SUCCEEDED') throw new Error('BLS: ' + d.status + ' ' + (d.message || []).join(' '));
    for (const s of d.Results?.series || []) out[s.seriesID] = s;
  }
  return out;
}
// "A\tCN4820100000000\tHarris County, TX\t…" -> { '48201': 'Harris' }
export function parseLausAreas(txt) {
  const out = {};
  for (const l of String(txt).split('\n')) { const m = l.match(/\tCN(48\d{3})0{8}\t([^\t]+?) County, TX\t/); if (m) out[m[1]] = m[2]; }
  return out;
}
const lausNames = async () => parseLausAreas(await (await get('https://download.bls.gov/pub/time.series/la/la.area')).text());
export async function buildUnemployment() {
  const ids = TX_COUNTY_FIPS.map(lausId).concat('LASST480000000000003', ...Object.keys(METROS).map(c => 'LAUMT48' + c + '00000003'));
  const s = await blsSeries(ids), counties = {}, metros = {}, names = await lausNames().catch(e => { log('econ: LAUS county names unavailable:', e.message); return {}; });
  for (const f of TX_COUNTY_FIPS) { const x = lausSummary(s[lausId(f)]); if (x) counties[f] = { name: names[f], ...x }; }
  for (const [c, name] of Object.entries(METROS)) { const x = lausSummary(s['LAUMT48' + c + '00000003']); if (x) metros[c] = { name, ...x }; }
  const state = lausSummary(s.LASST480000000000003);
  if (Object.keys(counties).length < 100) throw new Error('BLS returned only ' + Object.keys(counties).length + ' counties');
  log('econ: unemployment', Object.keys(counties).length, 'counties, Texas', state?.rate + '%', state?.period);
  return { built: new Date().toISOString(), state, metros, counties };
}

// ---------- rents (Zillow ZORI by ZIP) ----------
export function parseZori(csv, state = 'TX') {
  const lines = String(csv).split('\n'), h = csvLine(lines[0].trim()), iZ = h.indexOf('RegionName'), iS = h.indexOf('State'), iC = h.indexOf('City'), iM = h.indexOf('Metro');
  const months = h.map((c, i) => [c, i]).filter(([c]) => /^\d{4}-\d{2}-\d{2}$/.test(c)); if (iZ < 0 || !months.length) throw new Error('unexpected ZORI header');
  const zips = {}; let latest = null;
  for (const l of lines.slice(1)) {
    if (!l.trim()) continue; const c = csvLine(l.trim()); if (c[iS] !== state) continue;
    let k = months.length - 1; while (k >= 0 && !(parseFloat(c[months[k][1]]) > 0)) k--; if (k < 0) continue;
    const v = parseFloat(c[months[k][1]]), prior = k >= 12 ? parseFloat(c[months[k - 12][1]]) : NaN, m = months[k][0].slice(0, 7);
    zips[String(c[iZ]).padStart(5, '0')] = { rent: Math.round(v), yoy: prior > 0 ? Math.round((v / prior - 1) * 1000) / 10 : null, month: m, city: c[iC] || undefined, metro: c[iM] || undefined };
    if (!latest || m > latest) latest = m;
  }
  return { latest, zips };
}
export async function buildRents() {
  const csv = await (await get('https://files.zillowstatic.com/research/public_csvs/zori/Zip_zori_uc_sfrcondomfr_sm_month.csv', { ms: 180000 })).text();
  const r = parseZori(csv); if (Object.keys(r.zips).length < 50) throw new Error('ZORI: only ' + Object.keys(r.zips).length + ' Texas ZIPs');
  log('econ: rents', Object.keys(r.zips).length, 'Texas ZIPs through', r.latest);
  return { built: new Date().toISOString(), ...r };
}

// ---------- mortgages (CFPB HMDA data browser) ----------
async function hmda(year, county, extra = '') {
  const d = await (await get('https://ffiec.cfpb.gov/v2/data-browser-api/view/aggregations?years=' + year + '&counties=' + county + '&actions_taken=1' + extra)).json();
  return (d.aggregations || []).reduce((t, a) => ({ count: t.count + (+a.count || 0), sum: t.sum + (+a.sum || 0) }), { count: 0, sum: 0 });
}
export async function buildMortgages(fips, prev) {
  let year = new Date().getUTCFullYear() - 1, probe = null;
  for (; year >= new Date().getUTCFullYear() - 3; year--) { try { probe = await hmda(year, fips[0]); if (probe.count) break; } catch (e) { probe = null; } }
  if (!probe?.count) throw new Error('no HMDA year reachable');
  if (prev?.year === year && fips.every(f => prev.counties?.[f]) && !process.env.REBUILD_AREA) return prev;
  const counties = {};
  for (const f of fips) {
    const all = await hmda(year, f), purchase = await hmda(year, f, '&loan_purposes=1'), before = await hmda(year - 1, f).catch(() => null);
    counties[f] = { loans: all.count, dollars: all.sum, purchase: purchase.count, avg: all.count ? Math.round(all.sum / all.count) : null, priorLoans: before?.count || null };
  }
  log('econ: mortgages', year, Object.keys(counties).length, 'counties');
  return { year, counties };
}
