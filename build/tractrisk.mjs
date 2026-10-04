// Per-tract numbers for the Filters panel's "match everything" mode, added to data/market.json by the nightly build:
//   aadt  the busiest counted road through the tract (TxDOT annual average daily traffic, current year)
//   fl    FEMA National Risk Index flood rating, the higher of riverine and coastal (1 very low … 5 very high; null: none)
// Both change about once a year, so they're refreshed every 30 days (or when tracts change); a failure keeps the old ones.
import { fetchRetry, log } from './util.mjs';
import { prepare, contains } from '../lib/geomatch.mjs';

const AADT = 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_AADT/FeatureServer/0';
const NRI = 'https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Census_Tracts/FeatureServer/0';
export const RATING = { 'Very Low': 1, 'Relatively Low': 2, 'Relatively Moderate': 3, 'Relatively High': 4, 'Very High': 5 };
export const floodScore = a => Math.max(RATING[a?.RFLD_RISKR] || 0, RATING[a?.CFLD_RISKR] || 0) || null;

// pure: the highest count on any segment that has a vertex inside each tract. segments: [{ aadt, paths: [[[x, y], …], …] }]
export function maxAadtByTract(tracts, segments) {
  const prep = tracts.map(t => prepare(t.geom)), out = Object.fromEntries(tracts.map(t => [t.g, 0]));
  // a coarse grid over the tracts' bounding boxes so each vertex is only tested against nearby tracts
  const G = .05, cells = new Map(), key = (x, y) => Math.floor(x / G) + ',' + Math.floor(y / G);
  prep.forEach((p, i) => { if (!p) return; const [x0, y0, x1, y1] = p.box; for (let x = Math.floor(x0 / G); x <= Math.floor(x1 / G); x++) for (let y = Math.floor(y0 / G); y <= Math.floor(y1 / G); y++) { const k = x + ',' + y; (cells.get(k) || cells.set(k, []).get(k)).push(i); } });
  for (const s of segments) {
    const hit = new Set();
    for (const path of s.paths || []) for (const pt of path) for (const i of cells.get(key(pt[0], pt[1])) || []) if (!hit.has(i) && contains(prep[i], pt)) hit.add(i);
    for (const i of hit) if (s.aadt > out[tracts[i].g]) out[tracts[i].g] = s.aadt;
  }
  return out;
}
async function arc(url, params) {
  const r = await fetchRetry(url + '/query', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ f: 'json', ...params }) }, 3);
  const d = await r.json(); if (d.error) throw new Error(d.error.message || 'query failed'); return d;
}
async function trafficSegments(bbox) {
  const out = [];
  for (let off = 0; off < 400000; off += 2000) {
    const d = await arc(AADT, { where: 'AADT_CUR > 0', geometry: JSON.stringify({ xmin: bbox[0], ymin: bbox[1], xmax: bbox[2], ymax: bbox[3], spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: 'AADT_CUR', returnGeometry: 'true', outSR: '4326', maxAllowableOffset: '0.0005', geometryPrecision: '4', resultOffset: String(off), resultRecordCount: '2000', orderByFields: 'OBJECTID' });
    for (const f of d.features || []) if (f.geometry?.paths) out.push({ aadt: +f.attributes.AADT_CUR || 0, paths: f.geometry.paths });
    if (!d.exceededTransferLimit && (d.features || []).length < 2000) break;
  }
  return out;
}
async function nriRatings(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 100) {
    const d = await arc(NRI, { where: 'TRACTFIPS IN (' + ids.slice(i, i + 100).map(g => "'" + g + "'").join(',') + ')', outFields: 'TRACTFIPS,RFLD_RISKR,CFLD_RISKR', returnGeometry: 'false' });
    for (const f of d.features || []) out[f.attributes.TRACTFIPS] = floodScore(f.attributes);
  }
  return out;
}
export async function addTractRisk(market, bbox, { now = Date.now(), force = !!process.env.REBUILD_RISK } = {}) {
  if (!market?.tracts?.length) return market;
  const fresh = market.riskBuilt && now - Date.parse(market.riskBuilt) < 30 * 864e5 && market.tracts.every(t => 'aadt' in t && 'fl' in t);
  if (fresh && !force) return market;
  const [segs, nri] = [await trafficSegments(bbox).catch(e => { log('tract risk: traffic', e.message); return null; }), await nriRatings(market.tracts.map(t => t.g)).catch(e => { log('tract risk: NRI', e.message); return null; })];
  if (!segs && !nri) throw new Error('TxDOT and FEMA both unavailable');
  const aadt = segs ? maxAadtByTract(market.tracts, segs) : null;
  for (const t of market.tracts) { if (aadt) t.aadt = aadt[t.g] || null; if (nri) t.fl = nri[t.g] ?? null; }
  if (segs && nri) market.riskBuilt = new Date(now).toISOString();
  log('tract risk:', segs ? segs.length + ' road segments' : 'traffic kept', '|', nri ? Object.keys(nri).length + ' NRI tracts' : 'flood kept');
  return market;
}
