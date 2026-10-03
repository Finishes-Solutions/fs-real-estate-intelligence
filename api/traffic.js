// Traffic for the Market view: TxDOT annual average daily traffic (AADT) count segments in an area (a county or the region).
//   GET ?bbox=w,s,e,n   -> { roads: [{ road, aadt, lon, lat, system }] busiest named routes first,
//                          types: [{ type, label, segments, avg, max }] average daily traffic by road type, as_of }
// TxDOT's layer only carries the current year's counts (no history), so this shows how busy roads are, not growth.
// Probed 2026-10-03 (build/probe-traffic.mjs): ~73,000 count segments in the Houston box; ordering and statistics supported.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { roadName } from './site.js';

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

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 30, perDay: 1500 })) return;
  const b = String(req.query?.bbox || '').split(',').map(Number);
  if (b.length !== 4 || !b.every(Number.isFinite) || b[0] >= b[2] || b[1] >= b[3] || (b[2] - b[0]) * (b[3] - b[1]) > 9) return res.status(400).json({ error: 'bbox=w,s,e,n (up to about 3° by 3°)' });
  try {
    const out = await traffic(b.map(v => +v.toFixed(3)));
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800'); return res.json(out);
  } catch (e) { console.error('traffic', e.message); res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ error: 'TxDOT traffic counts didn’t answer. Try again shortly.' }); }
}
