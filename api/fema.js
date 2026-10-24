// FEMA data for the map and FEMA reports. All free, no keys:
//   GET  ?tile=z/x/y                     Flood Zones map layer: FEMA National Flood Hazard Layer (zones, FEMA's own colors) as 256 px PNG tiles
//   GET  ?legend=1[&cls=high]            that layer's legend: FEMA's own swatches with plain-language labels
//   GET  ?lat=..&lon=..&mi=0.25          FEMA report for a circle
//   POST { geometry }                    FEMA report for any area (selection box, polygon, county or radius drawn on the map)
// A report has: the share of the area in each flood risk class (NFHL), NFIP flood insurance claims paid in the census tracts
// touching the area (OpenFEMA NFIP Redacted Claims v3, by year and named event), federal disaster declarations for its
// counties since 2000 (OpenFEMA), and FEMA's National Risk Index for those tracts (expected annual loss by hazard).
// Each part is best effort: a failing source returns { error } for that part.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { zoneShares, claimsSummary, nriSummary, areaSqMi, bbox, samplePoints, HAZARDS, RISK_LABEL } from '../lib/fema.mjs';
import { limiter } from './_lib/limit.mjs';
import { circle, cleanGeometry } from './crime.js';

const UA = { 'User-Agent': 'FinishesSolutions-RE-Intelligence/1.0 (FEMA report)' };
const NFHL = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer';
const NRI = 'https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Census_Tracts/FeatureServer/0';
const OPEN = 'https://www.fema.gov/api/open/';
// MAX_SQMI is an abuse guard only (larger than any Texas county). Up to ZONE_DIRECT_SQMI the flood zones come in one query;
// larger areas ask FEMA only for the zones under each sample point. BUDGET_MS: vercel.json gives this function 180 s.
const MAX_SQMI = 10000, ZONE_DIRECT_SQMI = 60, BUDGET_MS = 160000;
export const SOURCES = 'FEMA National Flood Hazard Layer; OpenFEMA NFIP Redacted Claims (v3) and Disaster Declarations Summaries; FEMA National Risk Index (census tracts).';

async function json(url, opts = {}, ms = 15000) {
  if (ms < 500) throw new Error('didn’t finish in time');
  const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error((url.includes('fema.gov/api') ? 'OpenFEMA ' : 'FEMA map service ') + r.status);
  const d = await r.json(); if (d?.error) throw new Error(d.error.message || 'service error'); return d;
}
const esriPolygon = g => JSON.stringify({ rings: g.type === 'Polygon' ? g.coordinates : g.coordinates.flat(), spatialReference: { wkid: 4326 } });
const left = (deadline, ms) => deadline ? Math.min(ms, deadline - Date.now()) : ms;
const arcQuery = (layer, g, params, deadline) => json(layer + '/query', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ geometry: esriPolygon(g), geometryType: 'esriGeometryPolygon', inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects', f: 'json', ...params }) }, left(deadline, 20000));

// ---------- parts ----------
export async function floodZones(g, sq, deadline) {
  const [x0, y0, x1, y1] = bbox(g), off = Math.max(0.00003, Math.sqrt((x1 - x0) * (y1 - y0)) / 600), fields = { outFields: 'OBJECTID,FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE', returnGeometry: 'true', geometryPrecision: '5' };
  if (sq <= ZONE_DIRECT_SQMI) {
    const d = await arcQuery(NFHL + '/28', g, { ...fields, maxAllowableOffset: String(off) }, deadline);
    return { ...zoneShares(g, d.features), truncated: !!d.exceededTransferLimit || undefined };
  }
  // a large area holds thousands of zone shapes: ask only for the ones under the sample points (150 points a request),
  // then measure the shares from the same points
  const pts = samplePoints(g, 900), run = limiter(4), seen = new Map(); let truncated = false;
  await Promise.all(Array.from({ length: Math.ceil(pts.length / 150) }, (_, i) => pts.slice(i * 150, i * 150 + 150)).map(part => run(async () => {
    const d = await json(NFHL + '/28/query', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ f: 'json', inSR: '4326', outSR: '4326',
      geometry: JSON.stringify({ points: part, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryMultipoint', spatialRel: 'esriSpatialRelIntersects', ...fields, maxAllowableOffset: String(off / 4) }) }, left(deadline, 30000));
    if (d.exceededTransferLimit) truncated = true;
    for (const f of d.features || []) seen.set(f.attributes?.OBJECTID ?? seen.size + ':' + Math.random(), f);
  })));
  return { ...zoneShares(g, [...seen.values()], 900), truncated: truncated || undefined, method: 'points' };
}
const NRI_FIELDS = ['TRACTFIPS', 'COUNTY', 'STCOFIPS', 'POPULATION', 'BUILDVALUE', 'RISK_SCORE', 'RISK_RATNG', 'EAL_VALT', 'SOVI_SCORE', 'RESL_SCORE', ...Object.keys(HAZARDS).flatMap(k => [k + '_EALT', k + '_RISKR'])];
export async function riskTracts(g, deadline) {
  // all fields: naming one the service doesn't have fails the whole query; keep only what the report uses
  const d = await arcQuery(NRI, g, { outFields: '*', returnGeometry: 'false' }, deadline);
  return (d.features || []).map(f => Object.fromEntries(NRI_FIELDS.filter(k => k in (f.attributes || {})).map(k => [k, f.attributes[k]])));
}
// OpenFEMA can be slow on a query it hasn't seen recently: a long timeout and one retry
async function openfema(entity, filter, select, top = 10000, skip = 0, order = '', deadline) {
  const p = new URLSearchParams({ $filter: filter, $select: select, $top: String(top), $skip: String(skip), $inlinecount: 'allpages', ...(order ? { $orderby: order } : {}) });
  try { return await json(OPEN + entity + '?' + p, {}, left(deadline, 30000)); }
  catch (e) { if (!/timeout|aborted|5\d\d/i.test(e.message) || /in time/.test(e.message)) throw e; return json(OPEN + entity + '?' + p, {}, left(deadline, 25000)); }
}
const CLAIM_FIELDS = 'yearOfLoss,dateOfLoss,amountPaidOnBuildingClaim,amountPaidOnContentsClaim,amountPaidOnIncreasedCostOfComplianceClaim,occupancyType,ratedFloodZone,floodZoneCurrent,censusGeoid,floodEvent';
// every tract touching the area, 12 tracts a request, four requests at a time, every page; tracts whose requests didn't
// finish within the time budget are left out and counted (tracts_skipped)
export async function claims(tracts, deadline) {
  const rows = [], run = limiter(4); let done = 0, failed = null;
  await Promise.all(Array.from({ length: Math.ceil(tracts.length / 12) }, (_, i) => tracts.slice(i * 12, i * 12 + 12)).map(chunk => run(async () => {
    const filter = chunk.map(t => "startswith(censusGeoid,'" + t + "')").join(' or '), got = [];
    try {
      for (let skip = 0; ;) { const d = await openfema('v3/NfipClaims', filter, CLAIM_FIELDS, 10000, skip, '', deadline), page = d.NfipClaims || [];
        got.push(...page); skip += page.length; if (page.length < 10000 || skip >= (d.metadata?.count || 0)) break; }
      rows.push(...got); done += chunk.length;
    } catch (e) { failed = e; }
  })));
  if (!done && failed) throw failed;
  return { ...claimsSummary(rows), tracts_searched: done, tracts_skipped: tracts.length - done || undefined };
}
export async function disasters(counties, deadline) {
  const out = new Map(), run = limiter(4);
  const lists = await Promise.all(counties.map(c => run(() => openfema('v2/DisasterDeclarationsSummaries', "fipsStateCode eq '" + c.slice(0, 2) + "' and fipsCountyCode eq '" + c.slice(2) + "' and declarationDate ge '2000-01-01T00:00:00.000Z'",
      'disasterNumber,declarationDate,incidentType,declarationTitle,declarationType,incidentBeginDate,ihProgramDeclared,paProgramDeclared,designatedArea', 1000, 0, 'declarationDate desc', deadline))));
  for (const d of lists) {
    for (const x of d.DisasterDeclarationsSummaries || []) if (!out.has(x.disasterNumber)) out.set(x.disasterNumber, { number: x.disasterNumber, date: String(x.declarationDate).slice(0, 10), type: x.incidentType, title: x.declarationTitle, kind: x.declarationType === 'DR' ? 'Major disaster' : x.declarationType === 'EM' ? 'Emergency' : x.declarationType === 'FM' ? 'Fire management' : x.declarationType, individual_assistance: !!x.ihProgramDeclared });
  }
  const list = [...out.values()].sort((a, b) => b.date.localeCompare(a.date)), byType = {};
  for (const x of list) byType[x.type] = (byType[x.type] || 0) + 1;
  return { since: '2000', count: list.length, major: list.filter(x => x.kind === 'Major disaster').length, by_type: byType, list: list.slice(0, 40) };
}

export async function femaReport(g, { label, deadline = Date.now() + BUDGET_MS } = {}) {
  const sq = areaSqMi(g);
  if (sq > MAX_SQMI) { const e = new Error('That area is larger than ' + MAX_SQMI.toLocaleString('en-US') + ' square miles. Pick a smaller area.'); e.status = 400; throw e; }
  const part = async fn => { try { return await fn(); } catch (e) { return { error: e.message }; } };
  const [zones, nriRows] = await Promise.all([part(() => floodZones(g, sq, deadline)), part(() => riskTracts(g, deadline))]);
  const tracts = Array.isArray(nriRows) ? [...new Set(nriRows.map(r => String(r.TRACTFIPS)))] : [], counties = Array.isArray(nriRows) ? [...new Set(nriRows.map(r => String(r.STCOFIPS)))] : [];
  const [nfip, dis] = await Promise.all([part(() => tracts.length ? claims(tracts, deadline) : { claims: 0, note: 'No census tracts found for this area.' }), part(() => counties.length ? disasters(counties, deadline) : { count: 0 })]);
  return { label, area_sqmi: Math.round(sq * 1000) / 1000, flood_zones: zones, risk_labels: RISK_LABEL, nfip_claims: nfip, disasters: dis,
    risk_index: Array.isArray(nriRows) ? nriSummary(nriRows) : nriRows, counties: Array.isArray(nriRows) ? [...new Set(nriRows.map(r => r.COUNTY))] : [], sources: SOURCES };
}

// ---------- legend ----------
// FEMA's legend for the flood zone layer (28), so the map legend shows FEMA's real colors, with plain-language labels
const PLAIN = [[/^1% annual chance flood hazard$/i, 'High risk: 1% a year (100-year floodplain)'], [/^0\.2% annual chance flood hazard$/i, 'Moderate risk: 0.2% a year (500-year)'],
  [/regulatory floodway/i, 'Floodway (keep clear for flood flow)'], [/special floodway/i, 'Special floodway'], [/future conditions/i, 'Future 1% a year floodplain'],
  [/reduced risk due to levee/i, 'Behind a levee (reduced risk)'], [/undetermined/i, 'Not studied (undetermined)']];
export async function femaLegend({ cls = 'all', fetchImpl = globalThis.fetch } = {}) {
  const r = await fetchImpl(NFHL + '/legend?f=json', { headers: UA, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error('FEMA legend ' + r.status);
  const d = await r.json(), layer = (d.layers || []).find(l => l.layerId === 28); if (!layer) throw new Error('FEMA legend: no flood zone layer');
  const seen = new Set(), items = [];
  for (const x of layer.legend || []) {
    const raw = String(x.label || '').trim(); if (!raw || !x.imageData || /all other values/i.test(raw)) continue;
    const label = (PLAIN.find(([re]) => re.test(raw)) || [undefined, raw])[1]; if (seen.has(label)) continue;
    if (cls === 'high' && !/1% a year \(100|floodway/i.test(label)) continue; // the "100-year floodplain only" filter draws only those
    seen.add(label); items.push({ label, fema: raw, img: 'data:' + (x.contentType || 'image/png') + ';base64,' + x.imageData });
  }
  return { items };
}

// ---------- tiles ----------
const HALF = 20037508.342789244;
export function tileBBox(z, x, y) { const s = 2 * HALF / 2 ** z; return [-HALF + x * s, HALF - (y + 1) * s, -HALF + (x + 1) * s, HALF - y * s]; }

export default async function handler(req, res) {
  if (!sameOrigin(req, res)) return;
  const q = req.query || {};
  if (q.legend) {
    try { const d = await femaLegend({ cls: q.cls === 'high' ? 'high' : 'all' }); res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=2592000'); return res.json(d); }
    catch (e) { res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ error: e.message }); }
  }
  if (q.tile) {
    const m = String(q.tile).match(/^(\d{1,2})\/(\d+)\/(\d+)$/); if (!m || +m[1] < 10 || +m[1] > 18) return res.status(400).json({ error: 'tile z/x/y with z 10-18' });
    const b = tileBBox(+m[1], +m[2], +m[3]);
    try {
      const r = await fetch(NFHL + '/export?' + new URLSearchParams({ bbox: b.join(','), bboxSR: '3857', imageSR: '3857', size: '256,256', format: 'png32', transparent: 'true', layers: 'show:28', ...(q.cls === 'high' ? { layerDefs: JSON.stringify({ 28: "SFHA_TF = 'T'" }) } : {}), dpi: '96', f: 'image' }), { headers: UA, signal: AbortSignal.timeout(15000) });
      if (!r.ok || !/image/.test(r.headers.get('content-type') || '')) throw new Error('FEMA ' + r.status);
      res.setHeader('Content-Type', 'image/png'); res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=2592000');
      return res.send(Buffer.from(await r.arrayBuffer()));
    } catch (e) { res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ error: e.message }); }
  }
  if (!rateLimit(req, res, { perMinute: 15, perDay: 300 })) return;
  let g = null, label = '';
  if (req.method === 'POST') { const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}; g = cleanGeometry(b.geometry); label = String(b.label || '').slice(0, 120); }
  else { const lat = +q.lat, lon = +q.lon, mi = Math.min(10, Math.max(0.05, +q.mi || 0.25)); if (lat > 17 && lat < 50 && lon > -125 && lon < -65) g = circle(lon, lat, mi); }
  if (!g) return res.status(400).json({ error: 'Send a Polygon or MultiPolygon geometry (POST) or lat, lon and mi.' });
  try {
    const d = await femaReport(g, { label });
    const partial = ['flood_zones', 'nfip_claims', 'disasters', 'risk_index'].some(k => d[k]?.error); // never cache a report with a part that failed
    res.setHeader('Cache-Control', req.method === 'POST' || partial ? 'no-store' : 'public, max-age=3600, s-maxage=604800');
    return res.json(d);
  } catch (e) { res.setHeader('Cache-Control', 'no-store'); return res.status(e.status || 502).json({ error: e.message }); }
}
