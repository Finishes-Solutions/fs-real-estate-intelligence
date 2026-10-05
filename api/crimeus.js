// Crime by city / county anywhere in the US (FBI Crime Data Explorer, department-level, by calendar year):
//   GET ?lat=..&lon=..        the police department for that point: the city's own department inside city limits, else the county's
//   GET ?lat=..&lon=..&ori=X  a different department (the card's "Other departments in this county" list)
//   GET ?ori=X                one department by its FBI agency ID
// Returns the department, which place it covers and why it was picked, violent and property crimes per 100,000 residents for the
// newest full year vs the state and the US, ten years of history, the offense mix and clearance rates, plus the other
// departments in the county. Live from the FBI (a few hundred ms per offense) and cached here and at the CDN.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { govKey } from '../lib/govkey.mjs';
import { CDE_WEB, CDE_API, OFFENSES, TOTALS, STATE_FIPS, STATE_NAMES, flattenDirectory, matchAgency, summarizeOffense, latestFullYear, buildReport } from '../lib/fbicrime.mjs';

const UA = { 'User-Agent': 'FinishesSolutions-RE-Intelligence/1.0 (crime by city)', Accept: 'application/json' };
const DAY = 864e5, memo = new Map();
// a small in-memory cache per function instance (the CDN caches the responses too)
function remember(key, ms, fn) {
  const hit = memo.get(key); if (hit && Date.now() - hit.t < ms) return hit.p;
  const p = fn(); memo.set(key, { t: Date.now(), p }); p.catch(() => memo.delete(key));
  if (memo.size > 400) for (const [k, v] of memo) if (Date.now() - v.t > ms) memo.delete(k);
  return p;
}
async function getJSON(url, ms = 12000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  const t = await r.text();
  if (!r.ok || /^\s*</.test(t)) throw new Error('HTTP ' + r.status);
  return JSON.parse(t);
}
// the FBI web app's endpoints (no key, no hourly limit); the documented api.data.gov copy (GOV_API_KEY, 1,000 requests
// an hour) when the first one fails
async function cde(path) {
  try { return await getJSON(CDE_WEB + path); }
  catch (e) { const key = govKey(); if (!key) throw e; return getJSON(CDE_API + path + (path.includes('?') ? '&' : '?') + 'API_KEY=' + encodeURIComponent(key)); }
}
export const directory = st => remember('dir:' + st, DAY, async () => flattenDirectory(await cde('/agency/byStateAbbr/' + st)));

// which city, county subdivision, county and state a point is in (Census geocoder; TIGERweb if it is down)
const GEO = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates?benchmark=Public_AR_Current&vintage=Current_Current&format=json&layers=' + encodeURIComponent('Incorporated Places,County Subdivisions,Counties,States');
const TW = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/';
// a county subdivision counts only where it is a working local government (townships, New England towns): Texas and most of
// the South and West have statistical "CCDs" named after a town, which must not send the countryside to that town's police
const township = s => s && s.FUNCSTAT === 'A' && !/\sCCD$/i.test(s.NAME || '') ? s.BASENAME || null : null;
export async function locate(lon, lat) {
  const pick = (g, k) => (g[k] || [])[0] || null;
  try {
    const d = await getJSON(GEO + '&x=' + lon + '&y=' + lat, 8000), g = d?.result?.geographies || {};
    const st = pick(g, 'States'), c = pick(g, 'Counties'); if (!st && !c) return null;
    const p = pick(g, 'Incorporated Places'), s = pick(g, 'County Subdivisions');
    return { state: st?.STUSAB || STATE_FIPS[c?.STATE] || null, place: p?.BASENAME || null, place_name: p?.NAME || null, subdivision: township(s), county: c?.BASENAME || null, county_name: c?.NAME || null };
  } catch (e) {
    const q = l => getJSON(TW + l + '/query?geometry=' + lon + ',' + lat + '&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=BASENAME,NAME,STATE,FUNCSTAT&returnGeometry=false&f=json', 8000).then(d => d.features?.[0]?.attributes || null).catch(() => null);
    const [p, s, c] = await Promise.all([q('Places_CouSub_ConCity_SubMCD/MapServer/4'), q('Places_CouSub_ConCity_SubMCD/MapServer/1'), q('State_County/MapServer/1')]);
    if (!c) throw new Error('location lookup failed (' + e.message + ')');
    return { state: STATE_FIPS[c.STATE] || null, place: p?.BASENAME || null, place_name: p?.NAME || null, subdivision: township(s), county: c.BASENAME, county_name: c.NAME };
  }
}

// every offense for one department (ten-plus years, monthly) -> the report
export const departmentReport = (agency, st) => remember('rep:' + agency.ori, DAY / 2, async () => {
  const now = new Date().getUTCFullYear(), span = '?from=01-' + (now - 11) + '&to=12-' + now;
  const keys = [...TOTALS.map(t => t.key), ...OFFENSES.map(o => o.key)];
  const resps = await Promise.all(keys.map(k => cde('/summarized/agency/' + encodeURIComponent(agency.ori) + '/' + k + span)));
  const stateName = STATE_NAMES[st], sum = r => summarizeOffense(r, { agencyName: agency.name, stateName });
  const lastYear = latestFullYear(resps[0]), props = resps[0]?.cde_properties || {};
  const offenses = Object.fromEntries(OFFENSES.map((o, i) => [o.key, sum(resps[i + 2])]));
  const rep = buildReport({ agency, stateAbbr: st, totals: { v: sum(resps[0]), p: sum(resps[1]) }, offenses, lastYear, firstYear: lastYear - 9 });
  return { ...rep, data_through: props.max_data_date?.UCR || null, refreshed: props.last_refresh_date?.UCR || null };
});

const COVERAGE = 'FBI Crime Data Explorer: offenses reported by each police department, by calendar year. One department per place: the city’s own police inside city limits, the county’s outside them. Campus, transit, school and state police are not included.';
function why(m, where) {
  const a = m.agency?.name, cty = where?.county_name || (where?.county ? where.county + ' County' : 'the county');
  if (m.why === 'city' || m.why === 'subdivision') return 'Inside ' + (where.place_name || where.subdivision || where.place) + ': ' + a + ' covers it.';
  if (m.why === 'county') return 'Outside any city limits: ' + a + ' covers this part of ' + cty + '.';
  if (m.why === 'county-fallback') return 'No police department for ' + (where.place_name || where.place) + ' reports to the FBI, so this is ' + a + ', which covers ' + cty + ' outside the cities that have their own.';
  return null;
}

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 30, perDay: 800 })) return;
  const q = req.query || {}, lat = +q.lat, lon = +q.lon, ori = String(q.ori || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 9);
  const hasPoint = isFinite(lat) && isFinite(lon) && q.lat != null && q.lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  if (!hasPoint && !ori) return res.status(400).json({ error: 'Send lat and lon, or an FBI agency ID (ori).' });
  try {
    let where = null, st = ori ? ori.slice(0, 2) : null;
    if (hasPoint) {
      where = await locate(Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4);
      if (!where?.state) { res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800'); return res.status(404).json({ error: 'Crime by city and county covers the United States only.' }); }
      st = where.state;
    }
    if (!STATE_NAMES[st]) return res.status(400).json({ error: 'Unknown state for agency ' + ori + '.' });
    const list = await directory(st);
    let m;
    if (ori) { const a = list.find(x => x.ori === ori); if (!a) return res.status(404).json({ error: 'No FBI agency ' + ori + ' in ' + STATE_NAMES[st] + '.' }); m = { agency: a, why: 'chosen' }; }
    else m = matchAgency(list, where);
    const county = where?.county || m.agency?.counties?.[0] || null;
    const others = list.filter(a => (a.type === 'City' || a.type === 'County') && a.ori !== m.agency?.ori && county && a.counties.some(c => c.toLowerCase() === county.toLowerCase().replace(/\s(county|parish)$/, '')))
      .sort((a, b) => (a.type === 'County') - (b.type === 'County') || a.name.localeCompare(b.name)).slice(0, 40).map(a => ({ ori: a.ori, name: a.name, type: a.type }));
    if (!m.agency) {
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
      return res.json({ where, agency: null, others, note: 'No city or county police department for this spot reports to the FBI.', coverage: COVERAGE });
    }
    const rep = await departmentReport(m.agency, st);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=604800');
    return res.json({ where, why: m.why, note: why(m, where), ...rep, others, coverage: COVERAGE });
  } catch (e) {
    console.error('crimeus', e.message); res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'FBI crime data is unavailable right now (' + e.message + ').' });
  }
}
