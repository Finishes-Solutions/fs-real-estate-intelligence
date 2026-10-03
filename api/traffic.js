// Vehicle traffic. TxDOT annual average daily traffic (AADT) count segments, plus TomTom live speeds and incidents.
//   GET ?bbox=w,s,e,n   -> Market view: { roads: [{ road, aadt, lon, lat, system }] busiest named routes first,
//                          types: [{ type, label, segments, avg, max }] average daily traffic by road type, as_of }
//   GET ?lines=w,s,e,n  -> Traffic Counts map layer: GeoJSON lines with aadt (box up to 0.6° by 0.6°)
//   POST { geometry, label } or GET ?lat&lon&mi -> traffic report for an area: count segments inside it (busiest roads,
//                          by road type, the counted segments), live speed vs free flow on the busiest roads and current
//                          incidents (TomTom, with TOMTOM_API_KEY; shown, never stored, per TomTom's terms)
// TxDOT's layer only carries the current year's counts (no history), so this shows how busy roads are, not growth.
// Probed 2026-10-03 (build/probe-traffic.mjs): ~73,000 count segments in the Houston box; ordering and statistics supported.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { roadName } from './site.js';
import { circle, cleanGeometry } from './crime.js';
import { areaSqMi, bbox } from '../lib/fema.mjs';

export const AADT = 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_AADT/FeatureServer/0';
export const TYPE = { IH: 'Interstates', US: 'US highways', SH: 'State highways', SL: 'Loops', FM: 'Farm-to-market roads', BI: 'Business routes', BU: 'Business routes', BF: 'Business routes', SS: 'Spurs', CS: 'City streets', CR: 'County roads' };

const get = (u, fetchImpl) => fetchImpl(u, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'FinishesSolutions-RealEstateIntel/1.0' } }).then(async r => { if (!r.ok) throw new Error('TxDOT ' + r.status); const d = await r.json(); if (d.error) throw new Error('TxDOT: ' + (d.error.message || 'query failed')); return d; });
const area = b => ({ geometry: JSON.stringify({ xmin: b[0], ymin: b[1], xmax: b[2], ymax: b[3], spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' });

export async function traffic(b, fetchImpl = globalThis.fetch) {
  const top = new URLSearchParams({ f: 'json', where: 'AADT_CUR > 0', ...area(b), outFields: 'RTE_NM,RTE_PRFX,RTE_NBR,AADT_CUR,SYSTEM,EXT_DATE', orderByFields: 'AADT_CUR DESC',
    resultRecordCount: '400', returnGeometry: 'true', outSR: '4326', geometryPrecision: '4', maxAllowableOffset: '0.001' });
  const stats = new URLSearchParams({ f: 'json', where: 'AADT_CUR > 0', ...area(b), groupByFieldsForStatistics: 'RTE_PRFX',
    outStatistics: JSON.stringify([{ statisticType: 'avg', onStatisticField: 'AADT_CUR', outStatisticFieldName: 'avg' }, { statisticType: 'count', onStatisticField: 'AADT_CUR', outStatisticFieldName: 'n' }, { statisticType: 'max', onStatisticField: 'AADT_CUR', outStatisticFieldName: 'mx' }]) });
  const [t, s] = await Promise.all([get(AADT + '/query?' + top, fetchImpl), get(AADT + '/query?' + stats, fetchImpl).catch(() => ({ features: [] }))]);
  // one entry per named route (its busiest segment, with that segment's middle for "show on map"); city streets by name
  const best = new Map(); let asOf = null;
  for (const f of t.features || []) {
    const a = f.attributes, v = +a.AADT_CUR; if (!(v > 0)) continue; asOf ||= a.EXT_DATE || null;
    const name = a.RTE_PRFX === 'CS' && a.RTE_NM ? String(a.RTE_NM).replace(/-[A-Z]+$/, '') : roadName(a);
    if (best.has(name)) continue;
    const path = f.geometry?.paths?.[0] || [], mid = path[Math.floor(path.length / 2)] || null;
    best.set(name, { road: name, aadt: v, lon: mid?.[0] ?? null, lat: mid?.[1] ?? null, system: a.SYSTEM === 'On' ? 'state' : 'local' });
  }
  const groups = new Map();
  for (const f of s.features || []) { const a = f.attributes, label = TYPE[a.RTE_PRFX] || 'Other roads', g = groups.get(label) || { type: a.RTE_PRFX, label, segments: 0, sum: 0, max: 0 };
    g.segments += +a.n || 0; g.sum += (+a.avg || 0) * (+a.n || 0); g.max = Math.max(g.max, +a.mx || 0); groups.set(label, g); }
  const types = [...groups.values()].filter(g => g.segments).map(g => ({ type: g.type, label: g.label, segments: g.segments, avg: Math.round(g.sum / g.segments), max: g.max })).sort((a, b) => b.avg - a.avg);
  return { roads: [...best.values()].slice(0, 15), types, as_of: asOf, source: 'TxDOT annual average daily traffic (AADT)' };
}

const esriPoly = g => JSON.stringify({ rings: g.type === 'Polygon' ? g.coordinates : g.coordinates.flat(), spatialReference: { wkid: 4326 } });
const postQuery = (params, fetchImpl) => fetchImpl(AADT + '/query', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'FinishesSolutions-RealEstateIntel/1.0' }, body: new URLSearchParams(params), signal: AbortSignal.timeout(20000) })
  .then(async r => { if (!r.ok) throw new Error('TxDOT ' + r.status); const d = await r.json(); if (d.error) throw new Error('TxDOT: ' + (d.error.message || 'query failed')); return d; });
const nameOf = a => a.RTE_PRFX === 'CS' && a.RTE_NM ? String(a.RTE_NM).replace(/-[A-Z]+$/, '') : roadName(a);
const midOf = g => { const p = g?.paths?.[0] || []; return p[Math.floor(p.length / 2)] || null; };

// TxDOT count segments in a polygon: the busiest per road, by road type, and every counted segment (for the map and CSV)
export async function countsIn(g, fetchImpl = globalThis.fetch) {
  const geo = { geometry: esriPoly(g), geometryType: 'esriGeometryPolygon', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', f: 'json', where: 'AADT_CUR > 0' };
  const [t, st] = await Promise.all([
    postQuery({ ...geo, outFields: 'RTE_NM,RTE_PRFX,RTE_NBR,AADT_CUR,SYSTEM,EXT_DATE,BEGIN_DFO', orderByFields: 'AADT_CUR DESC', resultRecordCount: '1000', returnGeometry: 'true', outSR: '4326', geometryPrecision: '5', maxAllowableOffset: '0.0003' }, fetchImpl),
    postQuery({ ...geo, groupByFieldsForStatistics: 'RTE_PRFX', outStatistics: JSON.stringify([{ statisticType: 'avg', onStatisticField: 'AADT_CUR', outStatisticFieldName: 'avg' }, { statisticType: 'count', onStatisticField: 'AADT_CUR', outStatisticFieldName: 'n' }, { statisticType: 'max', onStatisticField: 'AADT_CUR', outStatisticFieldName: 'mx' }]) }, fetchImpl).catch(() => ({ features: [] }))]);
  const best = new Map(), segments = [], seen = new Set(); let asOf = null;
  for (const f of t.features || []) {
    const a = f.attributes, v = +a.AADT_CUR; if (!(v > 0)) continue; asOf ||= a.EXT_DATE || null;
    const road = nameOf(a), mid = midOf(f.geometry);
    // divided highways carry one count per roadbed (main lanes and each frontage road share it): keep one
    const k = road + '|' + v + '|' + (a.BEGIN_DFO != null ? Math.round(a.BEGIN_DFO * 10) : f.geometry?.paths?.[0]?.[0]?.join()); if (seen.has(k)) continue; seen.add(k);
    segments.push({ road, aadt: v, type: TYPE[a.RTE_PRFX] || 'Other roads', path: (f.geometry?.paths?.[0] || []).map(p => [+p[0].toFixed(5), +p[1].toFixed(5)]) });
    const b = best.get(road); if (b) { b.segments++; b.sum += v; } else best.set(road, { road, aadt: v, lon: mid?.[0] ?? null, lat: mid?.[1] ?? null, type: TYPE[a.RTE_PRFX] || 'Other roads', system: a.SYSTEM === 'On' ? 'state' : 'local', segments: 1, sum: v });
  }
  const types = (st.features || []).map(f => ({ type: f.attributes.RTE_PRFX, label: TYPE[f.attributes.RTE_PRFX] || 'Other roads', segments: +f.attributes.n || 0, avg: Math.round(+f.attributes.avg || 0), max: +f.attributes.mx || 0 }))
    .filter(x => x.segments).sort((a, b) => b.avg - a.avg);
  return { roads: [...best.values()].map(({ sum, ...r }) => ({ ...r, avg: Math.round(sum / r.segments) })).slice(0, 25), types, segments, segments_capped: segments.length >= 1000 || undefined, as_of: asOf };
}
// TomTom: live speed vs free-flow speed at a point (the nearest road segment)
export async function flowAt(key, lat, lon, fetchImpl = globalThis.fetch) {
  const r = await fetchImpl('https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/12/json?' + new URLSearchParams({ point: lat + ',' + lon, unit: 'mph', key }), { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('TomTom ' + r.status);
  const f = (await r.json()).flowSegmentData; if (!f) throw new Error('no flow data');
  return { current_mph: f.currentSpeed, free_flow_mph: f.freeFlowSpeed, congestion_pct: f.freeFlowSpeed ? Math.max(0, Math.round((1 - f.currentSpeed / f.freeFlowSpeed) * 100)) : null,
    delay_sec_per_segment: Math.max(0, (f.currentTravelTime || 0) - (f.freeFlowTravelTime || 0)), closed: !!f.roadClosure, confidence: f.confidence };
}
export const INCIDENT = { 0: 'Unknown', 1: 'Crash', 2: 'Fog', 3: 'Dangerous conditions', 4: 'Rain', 5: 'Ice', 6: 'Traffic jam', 7: 'Lane closed', 8: 'Road closed', 9: 'Road works', 10: 'Wind', 11: 'Flooding', 14: 'Broken-down vehicle' };
export async function incidentsIn(key, b, fetchImpl = globalThis.fetch) {
  const fields = '{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description},startTime,from,to,roadNumbers,delay,length}}}';
  const r = await fetchImpl('https://api.tomtom.com/traffic/services/5/incidentDetails?' + new URLSearchParams({ bbox: b.map(v => v.toFixed(4)).join(','), fields, language: 'en-US', timeValidityFilter: 'present', key }), { signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error('TomTom ' + r.status);
  return ((await r.json()).incidents || []).map(x => { const p = x.properties || {}, c = x.geometry?.type === 'Point' ? x.geometry.coordinates : x.geometry?.coordinates?.[0];
    return { kind: INCIDENT[p.iconCategory] || 'Incident', what: p.events?.map(e => e.description).filter(Boolean).join('; ') || '', road: (p.roadNumbers || []).join(', '), from: p.from || '', to: p.to || '',
      delay_min: p.delay ? Math.round(p.delay / 60) : 0, severity: p.magnitudeOfDelay ?? null, since: p.startTime || null, lon: c?.[0] ?? null, lat: c?.[1] ?? null }; })
    .sort((a, b) => (b.severity || 0) - (a.severity || 0) || b.delay_min - a.delay_min).slice(0, 60);
}
export const MAX_SQMI = 250;
export async function trafficReport(g, { label = '', key = process.env.TOMTOM_API_KEY, fetchImpl = globalThis.fetch } = {}) {
  const sq = areaSqMi(g); if (sq > MAX_SQMI) { const e = new Error('That area is too large for a traffic report (over ' + MAX_SQMI + ' square miles).'); e.status = 400; throw e; }
  const part = async fn => { try { return await fn(); } catch (e) { return { error: e.message }; } };
  const counts = await part(() => countsIn(g, fetchImpl));
  const top = Array.isArray(counts.roads) ? counts.roads.filter(r => r.lat != null).slice(0, 8) : [];
  const [live, incidents] = key ? await Promise.all([
    part(async () => (await Promise.all(top.map(async r => ({ road: r.road, aadt: r.aadt, lon: r.lon, lat: r.lat, ...(await flowAt(key, r.lat, r.lon, fetchImpl).catch(e => ({ error: e.message }))) })))).filter(x => !x.error)),
    part(() => incidentsIn(key, bbox(g), fetchImpl))]) : [{ error: 'Live speeds need TomTom (not configured).' }, { error: 'Incidents need TomTom (not configured).' }];
  return { label, area_sqmi: Math.round(sq * 100) / 100, counts, live, incidents, as_of_live: new Date().toISOString(),
    sources: 'TxDOT annual average daily traffic (AADT) count segments' + (counts.as_of ? ' (TxDOT file of ' + String(counts.as_of).slice(0, 10) + ')' : '') + '; TomTom Traffic Flow and Incidents (live, not stored).' };
}
// the map layer: counted segments in the view as lines
export async function lines(b, fetchImpl = globalThis.fetch) {
  const q = new URLSearchParams({ f: 'json', where: 'AADT_CUR > 0', ...area(b), outFields: 'RTE_NM,RTE_PRFX,RTE_NBR,AADT_CUR', returnGeometry: 'true', outSR: '4326', geometryPrecision: '5', maxAllowableOffset: '0.0002', resultRecordCount: '2000', orderByFields: 'AADT_CUR DESC' });
  const d = await get(AADT + '/query?' + q, fetchImpl);
  return { type: 'FeatureCollection', features: (d.features || []).filter(f => f.geometry?.paths?.length).map(f => ({ type: 'Feature', properties: { aadt: +f.attributes.AADT_CUR, road: nameOf(f.attributes) }, geometry: { type: 'MultiLineString', coordinates: f.geometry.paths } })) };
}

export default async function handler(req, res) {
  if (!sameOrigin(req, res)) return;
  const q = req.query || {};
  if (q.lines) {
    if (!rateLimit(req, res, { perMinute: 60, perDay: 3000 })) return;
    const b = String(q.lines).split(',').map(Number);
    if (b.length !== 4 || !b.every(Number.isFinite) || b[0] >= b[2] || b[1] >= b[3] || b[2] - b[0] > 0.6 || b[3] - b[1] > 0.6) return res.status(400).json({ error: 'lines=w,s,e,n (up to 0.6° by 0.6°)' });
    try { const out = await lines(b.map(v => +v.toFixed(2))); res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000'); return res.json(out); }
    catch (e) { res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ error: 'TxDOT traffic counts didn’t answer.' }); }
  }
  if (req.method === 'POST' || q.lat) {
    if (!rateLimit(req, res, { perMinute: 10, perDay: 300 })) return;
    let g = null, label = '';
    if (req.method === 'POST') { const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}; g = cleanGeometry(b.geometry); label = String(b.label || '').slice(0, 120); }
    else { const lat = +q.lat, lon = +q.lon, mi = Math.min(10, Math.max(0.1, +q.mi || 1)); if (lat > 25 && lat < 37 && lon > -107 && lon < -93) { g = circle(lon, lat, mi); label = mi + ' mi around ' + lat.toFixed(4) + ', ' + lon.toFixed(4); } }
    if (!g) return res.status(400).json({ error: 'Send a Polygon geometry (POST) or lat, lon and mi in Texas.' });
    try { const d = await trafficReport(g, { label }); res.setHeader('Cache-Control', 'no-store'); return res.json(d); } // live parts change by the minute
    catch (e) { res.setHeader('Cache-Control', 'no-store'); return res.status(e.status || 502).json({ error: e.message }); }
  }
  if (!rateLimit(req, res, { perMinute: 30, perDay: 1500 })) return;
  const b = String(req.query?.bbox || '').split(',').map(Number);
  if (b.length !== 4 || !b.every(Number.isFinite) || b[0] >= b[2] || b[1] >= b[3] || (b[2] - b[0]) * (b[3] - b[1]) > 9) return res.status(400).json({ error: 'bbox=w,s,e,n (up to about 3° by 3°)' });
  try {
    const out = await traffic(b.map(v => +v.toFixed(3)));
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800'); return res.json(out);
  } catch (e) { console.error('traffic', e.message); res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ error: 'TxDOT traffic counts didn’t answer. Try again shortly.' }); }
}
