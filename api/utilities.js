// Utilities near a site (lib/utilities.mjs): power lines and substations (OpenStreetMap), water and sewer service areas
// and water facility lines (PUC CCN maps), and public water and sewer mains where the city publishes them (Houston).
//   GET  ?lat=..&lon=..                 near a point
//   POST { geometry }                   near a parcel (distances from its edge)
//   GET  ?box=w,s,e,n&z=15              map layer: GeoJSON lines and substations in the view (zoom 14+)
// Every source is best effort: a failing one comes back as { error } and the rest still answer.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { CCN, MAINS, HOUSTON_BOX, inBox, pickLayer, siteShape, powerQuery, powerBoxQuery, parsePower, powerFeatures, parseCCN, parseMains, pipeInfo, summaryLines, SOURCES } from '../lib/utilities.mjs';
import { cleanGeometry } from './crime.js';

const UA = { 'User-Agent': 'FinishesSolutions-RE-Intelligence/1.0 (utilities near a site)' };
const OVERPASS = [process.env.OVERPASS_URL, 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'].filter(Boolean);
async function overpass(q) {
  let last;
  for (const url of OVERPASS) {
    try { const r = await fetch(url, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: q }), signal: AbortSignal.timeout(18000) }); if (r.ok) return (await r.json()).elements || []; last = new Error('OpenStreetMap ' + r.status); }
    catch (e) { last = e; }
  }
  throw last;
}
async function arcgis(layer, params, ms = 12000) {
  const r = await fetch(layer + '/query', { method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ f: 'json', inSR: '4326', outSR: '4326', ...params }), signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(new URL(layer).host + ' ' + r.status);
  const d = await r.json(); if (d?.error) throw new Error(d.error.message || 'service error'); return d.features || [];
}
// the first layer of a list that answers
async function firstOf(layers, params) { let last; for (const l of layers) { try { return await arcgis(l, params); } catch (e) { last = e; } } throw last || new Error('no source'); }
// a city service's main layer, found by name once and remembered
const found = new Map();
async function mainLayers(kind) {
  const M = MAINS[kind]; if (found.has(kind)) return found.get(kind);
  const out = [...M.layers]; let all = true;
  for (const svc of M.services) {
    try { const r = await fetch(svc + '/layers?f=json', { headers: UA, signal: AbortSignal.timeout(8000) }); const d = await r.json(); const l = pickLayer(d.layers, M.match); if (l) out.push(svc + '/' + l.id); } catch (e) { all = false; } // not reachable now: look again next time
  }
  if (all) found.set(kind, out);
  return out;
}
const near = (pt, ft) => ({ geometry: pt.join(','), geometryType: 'esriGeometryPoint', distance: String(ft), units: 'esriSRUnit_Foot', spatialRel: 'esriSpatialRelIntersects' });
const settle = async (p, fallback = {}) => { try { return await p; } catch (e) { return { ...fallback, error: e.name === 'TimeoutError' ? 'timed out' : e.message }; } };

export async function utilitiesNear(center, geometry) {
  const site = siteShape(center, geometry), [lon, lat] = center, houston = inBox(center, HOUSTON_BOX);
  const power = settle((async () => {
    let els = await overpass(powerQuery(lat, lon, 800, 8000)), searchedFt = 2625;
    let p = parsePower(els, site); if (!p.lines.length) { els = await overpass(powerQuery(lat, lon, 3000, 12000)); p = parsePower(els, site); searchedFt = 9843; }
    return { ...p, searchedFt };
  })());
  const ccn = kind => settle(firstOf(CCN[kind], { ...near(center, 1), outFields: '*', returnGeometry: 'false' }).then(f => ({ ccn: parseCCN(f) })));
  const lines = settle(firstOf(CCN.waterLines, { ...near(center, 2640), outFields: '*', returnGeometry: 'true', maxAllowableOffset: '0.00002', resultRecordCount: '200' }).then(f => parseMains(f, site).slice(0, 3)), []);
  const mains = kind => houston ? settle((async () => { const L = await mainLayers(kind); if (!L.length) return { mains: [], unpublished: true }; return { mains: parseMains(await firstOf(L, { ...near(center, 1500), outFields: '*', returnGeometry: 'true', maxAllowableOffset: '0.00001', resultRecordCount: '300' }), site, MAINS[kind].owner).slice(0, 3) }; })()) : Promise.resolve({ mains: [], outside: true });
  const [pw, w, s, wl, wm, sm] = await Promise.all([power, ccn('water'), ccn('sewer'), lines, mains('water'), mains('sewer')]);
  const d = { center, power: pw, water: { ...w, lines: Array.isArray(wl) ? wl : [], mains: wm.mains || [], mainsNote: wm.error || (wm.unpublished ? 'no public water-main layer found' : wm.outside ? 'outside Houston' : null) }, sewer: { ...s, mains: sm.mains || [], mainsNote: sm.error || (sm.outside ? 'outside Houston' : null) }, sources: SOURCES };
  d.summary = summaryLines(d);
  return d;
}

export async function utilitiesBox(bb, z) {
  const [w, s, e, n] = bb, feats = [], errors = [];
  const tasks = [overpass(powerBoxQuery(bb, z >= 15)).then(els => feats.push(...powerFeatures(els))).catch(e2 => errors.push('power: ' + e2.message))];
  if (z >= 15 && inBox([(w + e) / 2, (s + n) / 2], HOUSTON_BOX)) for (const kind of ['sewer', 'water']) tasks.push((async () => {
    const L = await mainLayers(kind); if (!L.length) return;
    const f = await firstOf(L, { geometry: [w, s, e, n].join(','), geometryType: 'esriGeometryEnvelope', spatialRel: 'esriSpatialRelIntersects', outFields: '*', returnGeometry: 'true', maxAllowableOffset: '0.00001', resultRecordCount: '1500' });
    for (const x of f) for (const path of x.geometry?.paths || []) { const m = pipeInfo(x.attributes); feats.push({ type: 'Feature', properties: { k: kind, sz: m.size, mt: m.material || '' }, geometry: { type: 'LineString', coordinates: path.map(p => [+p[0].toFixed(6), +p[1].toFixed(6)]) } }); }
  })().catch(e2 => errors.push(kind + ': ' + e2.message)));
  await Promise.all(tasks);
  return { type: 'FeatureCollection', features: feats, errors };
}

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 30, perDay: 1500 })) return;
  const q = req.query || {};
  try {
    if (q.box) {
      const bb = String(q.box).split(',').map(Number), z = +q.z || 15;
      if (bb.length !== 4 || bb.some(v => !isFinite(v)) || bb[2] <= bb[0] || bb[3] <= bb[1]) return res.status(400).json({ error: 'box=w,s,e,n' });
      if (z < 14 || (bb[2] - bb[0]) * (bb[3] - bb[1]) > 0.004) return res.status(400).json({ error: 'Zoom in to see utility lines.' });
      res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
      return res.json(await utilitiesBox(bb, z));
    }
    let center, geometry = null;
    if (req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      geometry = cleanGeometry(b.geometry); if (!geometry) return res.status(400).json({ error: 'Send a parcel geometry.' });
      const ring = (geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates[0])[0];
      center = [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
    } else {
      center = [+q.lon, +q.lat];
      if (!center.every(isFinite) || Math.abs(center[1]) > 85 || Math.abs(center[0]) > 180) return res.status(400).json({ error: 'lat/lon out of range' });
    }
    res.setHeader('Cache-Control', req.method === 'GET' ? 'public, s-maxage=604800, stale-while-revalidate=2592000' : 'no-store');
    return res.json(await utilitiesNear(center, geometry));
  } catch (e) {
    console.error('utilities', e.message);
    return res.status(502).json({ error: 'Utility lookup failed. Try again.' });
  }
}
