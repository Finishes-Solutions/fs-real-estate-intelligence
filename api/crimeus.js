// Crime by city / county anywhere in the US (FBI Crime Data Explorer, department-level, by calendar year):
//   GET ?lat=..&lon=..        the police department for that point: the city's own department inside city limits, else the county's
//   GET ?lat=..&lon=..&ori=X  a different department (the card's "Other departments in this county" list)
//   GET ?ori=X                one department by its FBI agency ID
//   GET ?rank=TX[&type=City&min_pop=10000&order=v|p&desc=1&limit=20&year=2025]   departments ranked by crime rate (library only)
// Returns the department, which place it covers and why it was picked, violent and property crimes per 100,000 residents for the
// newest full year vs the state and the US, ten years of history, the offense mix and clearance rates, plus the other
// departments in the county, and where the department ranks among the same kind in its state. Read from the crime library
// (Supabase, loaded weekly by build/crime-library.mjs) when it has the department, else live from the FBI (a few hundred ms
// per offense); cached here and at the CDN.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { govKey } from '../lib/govkey.mjs';
import { supa } from '../lib/supa.mjs';
import { cdeGet, OFFENSES, TOTALS, STATE_FIPS, STATE_NAMES, flattenDirectory, matchAgency, summarizeOffense, latestFullYear, buildReport, fromLibrary } from '../lib/fbicrime.mjs';

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
// the FBI web app's endpoints; the documented api.data.gov copy with GOV_API_KEY when they fail
const cde = path => cdeGet(path, { key: govKey() });
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

// one department's report: from the crime library when it holds a recent read of the department, else live from the FBI;
// plus where it ranks among the same kind of departments in its state (library only)
const LIB_FRESH = 45 * DAY;
export const departmentReport = (agency, st) => remember('rep:' + agency.ori, DAY / 2, async () => {
  const db = supa(), rep = (db && await fromDb(db, agency, st)) || await live(agency, st);
  if (db && rep.year && !rep.partial) rep.rank = await db.rpc('crime_peer_rank', { p_ori: agency.ori, p_year: rep.year }).catch(() => null);
  return rep;
});
async function fromDb(db, agency, st) {
  try {
    const q = encodeURIComponent(agency.ori), [a] = await db.select('crime_agencies', 'ori=eq.' + q + '&select=loaded_at,data_through');
    if (!a?.loaded_at || Date.now() - Date.parse(a.loaded_at) > LIB_FRESH) return null;
    const [rows, areas] = await Promise.all([db.select('crime_agency_years', 'ori=eq.' + q + '&order=year.desc&limit=40'), db.select('crime_area_years', 'area=in.(US,' + st + ')&order=year.desc&limit=80')]);
    const lastYear = latestFullYear({ cde_properties: { max_data_date: { UCR: a.data_through } } }), s = fromLibrary(rows, areas, st);
    return { ...buildReport({ agency, stateAbbr: st, totals: s.totals, offenses: s.offenses, lastYear, firstYear: lastYear - 9 }), data_through: a.data_through, refreshed: null, source: 'library', loaded_at: a.loaded_at };
  } catch (e) { console.error('crimeus library', e.message); return null; }
}
// every offense for one department (ten-plus years, monthly) live from the FBI -> the report
async function live(agency, st) {
  const now = new Date().getUTCFullYear(), span = '?from=01-' + (now - 11) + '&to=12-' + now;
  const keys = [...TOTALS.map(t => t.key), ...OFFENSES.map(o => o.key)];
  const resps = await Promise.all(keys.map(k => cde('/summarized/agency/' + encodeURIComponent(agency.ori) + '/' + k + span)));
  const stateName = STATE_NAMES[st], sum = r => summarizeOffense(r, { agencyName: agency.name, stateName });
  const lastYear = latestFullYear(resps[0]), props = resps[0]?.cde_properties || {};
  const offenses = Object.fromEntries(OFFENSES.map((o, i) => [o.key, sum(resps[i + 2])]));
  const rep = buildReport({ agency, stateAbbr: st, totals: { v: sum(resps[0]), p: sum(resps[1]) }, offenses, lastYear, firstYear: lastYear - 9 });
  return { ...rep, data_through: props.max_data_date?.UCR || null, refreshed: props.last_refresh_date?.UCR || null, source: 'live' };
}

// departments in a state ranked by violent or property crime per 100,000 (whole years, 2,500+ residents)
async function rankings(db, q) {
  const st = String(q.rank || '').toUpperCase().slice(0, 2); if (!STATE_NAMES[st]) return { code: 400, body: { error: 'Unknown state ' + q.rank + '.' } };
  let year = +q.year || null;
  if (!year) { const [a] = await db.select('crime_agencies', 'state=eq.' + st + '&loaded_at=not.is.null&select=data_through&order=loaded_at.desc&limit=1'); if (!a) return { code: 404, body: { error: 'The crime library has no ' + STATE_NAMES[st] + ' departments yet.' } }; year = latestFullYear({ cde_properties: { max_data_date: { UCR: a.data_through } } }); }
  const type = q.type === 'County' ? 'County' : 'City', min = Math.max(2500, +q.min_pop || 10000), order = q.order === 'p' ? 'p' : 'v', desc = q.desc === '1' || q.desc === 'true';
  const list = await db.rpc('crime_rankings', { p_state: st, p_year: year, p_type: type, p_min_pop: min, p_order: order, p_desc: desc, p_limit: Math.min(100, +q.limit || 20) });
  return { code: 200, body: { state: st, state_name: STATE_NAMES[st], year, type, min_pop: min, order, highest_first: desc, departments: list || [],
    note: 'Whole-year figures for ' + (type === 'City' ? 'city' : 'county') + ' police departments covering at least ' + min.toLocaleString('en-US') + ' residents. Rates use residents only, so places with many visitors read high.' } };
}

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
  const q = req.query || {};
  if (q.rank) {
    const db = supa(); if (!db) return res.status(503).json({ error: 'Rankings need the crime library (the database).' });
    try { const r = await rankings(db, q); if (r.code === 200) res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400'); return res.status(r.code).json(r.body); }
    catch (e) { console.error('crimeus rank', e.message); return res.status(502).json({ error: 'Crime rankings are unavailable right now.' }); }
  }
  const lat = +q.lat, lon = +q.lon, ori = String(q.ori || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 9);
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
