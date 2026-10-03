// Site facts for the building card: GET /api/site?lat=..&lon=..[&addr=1234 Main St&zip=77002]
//   flood      FEMA National Flood Hazard Layer zone at the point
//   traffic    TxDOT annual average daily traffic (AADT) on the roads within ~300 m, busiest first
//   districts  TCEQ water districts (MUD, WCID, …), Houston TIRZ, federal Opportunity Zone, school district
//   transit    Houston METRO bus stops within 400 m
//   environment EPA ECHO regulated facilities within ¼ mile, with violation and hazardous-waste flags
//   crime      Houston Police NIBRS incidents within ½ mile, last 12 months vs the 12 before (Supabase, loaded nightly)
//   bars       Texas Comptroller mixed beverage gross receipts at the street address, last 12 months (needs addr + zip)
// Every part is free and optional: a failing source returns { error } for that part, never a 500.
import { rateLimit } from './_lib/guard.mjs';
import { supa } from '../lib/supa.mjs';
import { crimeSummary } from '../lib/crime.mjs';
import { addressKey } from './tenants.js';

const UA = { 'User-Agent': 'FinishesSolutions-RE-Intelligence/1.0 (site panel)' };
const SRC = {
  flood: 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28',
  aadt: 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_AADT/FeatureServer/0',
  water: 'https://services2.arcgis.com/LYMgRMwHfrWWEg3s/arcgis/rest/services/TCEQ_Water_Districts/FeatureServer/0',
  oz: 'https://services6.arcgis.com/BAJNi3EgCdtQ1BCG/arcgis/rest/services/Federal_Opportunity_Zones_New/FeatureServer/0',
  tirz: 'https://services.arcgis.com/NummVBqZSIJKUeVR/arcgis/rest/services/COH_Tax_Incentive_Reinvestment_Zones_view/FeatureServer',
  stops: 'https://services.arcgis.com/NummVBqZSIJKUeVR/arcgis/rest/services/COH_METRO_Bus_Stops_view/FeatureServer',
  school: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/School/MapServer',
  echo: 'https://echodata.epa.gov/echo/echo_rest_services',
  bars: 'https://data.texas.gov/resource/naix-2893.json'
};

async function getJSON(url, ms = 8000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json(); if (d?.error) throw new Error(d.error.message || 'service error'); return d;
}
const near = (lon, lat, m) => 'geometry=' + lon + ',' + lat + '&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&returnGeometry=false&f=json' + (m ? '&distance=' + m + '&units=esriSRUnit_Meter' : '');
const query = (layer, lon, lat, { m, fields = '*', extra = '' } = {}) => getJSON(layer + '/query?outFields=' + encodeURIComponent(fields) + '&' + near(lon, lat, m) + extra).then(d => (d.features || []).map(f => f.attributes || {}));
// hosted "view" services don't always number their layer 0: read the first layer id once
const layerIds = new Map();
async function layerOf(service) {
  if (!layerIds.has(service)) layerIds.set(service, getJSON(service + '?f=json').then(d => service + '/' + ((d.layers || [])[0]?.id ?? 0)).catch(e => { layerIds.delete(service); throw e; }));
  return layerIds.get(service);
}
const pick = (a, ...keys) => { for (const k of keys) { const hit = Object.keys(a).find(x => x.toLowerCase() === k.toLowerCase()); if (hit && a[hit] != null && String(a[hit]).trim() !== '') return a[hit]; } return null; };

// ---------- flood ----------
export function floodInfo(rows) {
  const r = rows[0]; if (!r) return { zone: null, note: 'No FEMA flood map panel here.' };
  const zone = String(r.FLD_ZONE || '').trim(), sub = String(r.ZONE_SUBTY || '').trim(), high = r.SFHA_TF === 'T' || /^(A|V)/.test(zone);
  const moderate = !high && /0\.2 PCT/i.test(sub);
  return { zone, subtype: sub || null, risk: high ? 'high' : moderate ? 'moderate' : zone === 'D' ? 'undetermined' : 'minimal', bfe: r.STATIC_BFE > -9000 ? r.STATIC_BFE : null,
    note: high ? '1% annual chance flood area (100-year floodplain): flood insurance is required for federally backed mortgages.' : moderate ? '0.2% annual chance (500-year) flood area.' : zone === 'D' ? 'Flood risk not studied here.' : 'Outside the mapped 100- and 500-year floodplains.' };
}
// ---------- traffic ----------
const PRFX = { IH: 'I-', US: 'US ', SH: 'SH ', FM: 'FM ', RM: 'RM ', SL: 'Loop ', SS: 'Spur ', BI: 'Bus. I-', BU: 'Bus. US ', BF: 'Bus. FM ', PR: 'Park Rd ', RE: 'Rec Rd ' };
export function roadName(a) {
  const p = String(a.RTE_PRFX || '').trim(), n = String(a.RTE_NBR || '').replace(/^0+/, '').trim();
  if (p === 'CS') return 'City street'; if (p === 'CR') return 'County road';
  return PRFX[p] ? PRFX[p] + n : (a.RTE_NM || 'Road');
}
export function trafficInfo(rows) {
  const best = new Map();
  for (const a of rows) { const v = +a.AADT_CUR; if (!(v > 0)) continue; const name = roadName(a), k = name; // one entry per named route, and only the busiest city street
    if (!best.has(k) || best.get(k).aadt < v) best.set(k, { road: name, aadt: v, system: a.SYSTEM === 'On' ? 'state' : 'local' }); }
  return { roads: [...best.values()].sort((a, b) => b.aadt - a.aadt).slice(0, 4) };
}
// ---------- districts ----------
export function waterDistricts(rows) {
  return rows.filter(a => !['RA', 'GCD', 'SWCD'].includes(String(a.TYPE)) && !(+a.Area_SqMi > 400) && a.STATUS !== 'I')
    .map(a => ({ name: String(a.NAME || '').trim(), type: String(a.TYPE_DESCRIPTION || a.TYPE || '').trim(), active: a.STATUS === 'A' }))
    .filter(d => d.name).slice(0, 5);
}
// ---------- environment ----------
export function echoInfo(list) {
  const fac = (list || []).map(f => {
    const flags = [];
    if (f.FacSNCFlg === 'Y' || +f.FacQtrsWithNC > 0) flags.push('violations');
    if (f.TRIFlag === 'Y') flags.push('toxic releases');
    if (f.RCRAFlag === 'Y' || (f.RCRAComplianceStatus && f.RCRAComplianceStatus !== 'Not Applicable')) flags.push('handles hazardous waste');
    if (+f.FacPenaltyCount > 0) flags.push('penalties');
    return { name: String(f.FacName || '').trim(), street: f.FacStreet || null, flags };
  }).filter(f => f.name);
  return { count: fac.length, flagged: fac.filter(f => f.flags.length).slice(0, 6), flaggedCount: fac.filter(f => f.flags.length).length };
}
async function echo(lon, lat) {
  const d = await getJSON(SRC.echo + '.get_facilities?output=JSON&p_lat=' + lat + '&p_long=' + lon + '&p_radius=0.25', 10000);
  const qid = d.Results?.QueryID; if (!qid || !+d.Results.QueryRows) return echoInfo([]);
  const f = await getJSON(SRC.echo + '.get_qid?output=JSON&qid=' + qid + '&pageno=1&responseset=100', 10000);
  return { ...echoInfo(f.Results?.Facilities), total: +d.Results.QueryRows };
}
// ---------- mixed beverage receipts at the address ----------
export function barsInfo(rows, now = new Date()) {
  const cut = new Date(now.getTime() - 365 * 864e5).toISOString().slice(0, 10).replace(/-/g, ''), by = new Map();
  for (const r of rows || []) {
    const end = String(r.obligation_end_date_yyyymmdd || '').slice(0, 10).replace(/-/g, '').slice(0, 8); if (end < cut) continue;
    const k = (r.tabc_permit_number || r.location_name) + '', x = by.get(k) || { name: String(r.location_name || r.taxpayer_name || '').trim(), total: 0, months: 0, last: '' };
    x.total += +r.total_receipts || 0; x.months++; if (end > x.last) x.last = end; by.set(k, x);
  }
  return [...by.values()].map(x => ({ ...x, total: Math.round(x.total), last: x.last.slice(0, 4) + '-' + x.last.slice(4, 6) })).sort((a, b) => b.total - a.total);
}
async function bars(addr, zip) {
  const k = addressKey(addr); if (!k || !/^\d{5}/.test(zip || '')) return null;
  const where = "upper(location_address) like '" + k.num + " %" + k.word + "%' AND location_zip like '" + zip.slice(0, 5) + "%'";
  const p = new URLSearchParams({ $where: where, $order: 'obligation_end_date_yyyymmdd DESC', $limit: '200' });
  const r = await fetch(SRC.bars + '?' + p, { headers: { ...UA, ...(process.env.SOCRATA_APP_TOKEN ? { 'X-App-Token': process.env.SOCRATA_APP_TOKEN } : {}) }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error('Comptroller ' + r.status);
  return barsInfo(await r.json());
}

const inHouston = (lon, lat) => lon > -95.95 && lon < -95.0 && lat > 29.5 && lat < 30.15;
export async function site(lon, lat, { addr, zip } = {}) {
  const part = async fn => { try { return await fn(); } catch (e) { return { error: e.message }; } };
  const db = supa();
  const [flood, traffic, water, oz, tirz, schools, transit, environment, crime, barsAt] = await Promise.all([
    part(async () => floodInfo(await query(SRC.flood, lon, lat, { fields: 'FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE' }))),
    part(async () => trafficInfo(await query(SRC.aadt, lon, lat, { m: 300, fields: 'RTE_NM,RTE_PRFX,RTE_NBR,AADT_CUR,SYSTEM' }))),
    part(async () => waterDistricts(await query(SRC.water, lon, lat, { fields: 'NAME,TYPE,TYPE_DESCRIPTION,STATUS,Area_SqMi' }))),
    part(async () => (await query(SRC.oz, lon, lat, { fields: 'CENSUSTRAC' })).length > 0),
    part(async () => inHouston(lon, lat) ? (await query(await layerOf(SRC.tirz), lon, lat)).map(a => String(pick(a, 'NAME', 'TIRZ_NAME', 'ZONE_NAME', 'LABEL') || '').trim() + (pick(a, 'TIRZ_NO', 'TIRZ', 'ZONE_NO', 'NUMBER') ? ' (TIRZ ' + pick(a, 'TIRZ_NO', 'TIRZ', 'ZONE_NO', 'NUMBER') + ')' : '')).filter(Boolean) : []),
    part(async () => { const out = []; for (const id of [0, 1, 2]) for (const a of await query(SRC.school + '/' + id, lon, lat, { fields: 'NAME' })) if (a.NAME && !out.includes(a.NAME)) out.push(a.NAME); return out; }),
    part(async () => inHouston(lon, lat) ? { stops: (await getJSON((await layerOf(SRC.stops)) + '/query?returnCountOnly=true&' + near(lon, lat, 400))).count ?? null } : null),
    part(() => echo(lon, lat)),
    part(async () => db && inHouston(lon, lat) ? crimeSummary(await db.rpc('crime_near', { p_lon: lon, p_lat: lat, p_m: 805 }), 0.5) : null),
    part(() => addr ? bars(addr, zip) : null)
  ]);
  const districts = { water, tirz, opportunityZone: oz, schools };
  return { lon, lat, flood, traffic, districts, transit, environment, crime, bars: barsAt };
}

export default async function handler(req, res) {
  if (!rateLimit(req, res, { perMinute: 30, perDay: 800 })) return;
  const lat = +req.query?.lat, lon = +req.query?.lon;
  if (!(lat > 25 && lat < 37 && lon > -107 && lon < -93)) return res.status(400).json({ error: 'lat and lon inside Texas are required' });
  const r5 = v => Math.round(v * 1e5) / 1e5;
  const d = await site(r5(lon), r5(lat), { addr: String(req.query.addr || '').slice(0, 120), zip: String(req.query.zip || '').slice(0, 10) });
  const failed = ['flood', 'traffic', 'environment'].every(k => d[k]?.error);
  res.setHeader('Cache-Control', failed ? 'no-store' : 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=2592000');
  return res.json(d);
}
