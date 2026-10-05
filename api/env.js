// Environmental data for the map and the Environmental Report. All free, no keys (TCEQ, EPA, Railroad Commission,
// US Fish & Wildlife Service, USDA):
//   GET  ?tile=rrc|wetlands|soils/z/x/y        map layers as 256 px PNG tiles: oil & gas wells and pipelines, wetlands, soil map units
//   GET  ?box=w,s,e,n&set=cleanup|tanks|epa|all the sites layer: [[kind, id, name, address, lon, lat]] (+ restricted groundwater areas)
//   GET  ?lat=..&lon=..&mi=0.1                  report for a circle
//   POST { geometry, label }                    report for a site or area (parcel, building, selection, radius)
// A report lists, for each kind of record, everything within its search distance of the site's edge (Phase I style
// distances), nearest first, plus soils under the site. Each source is best effort: a failing one returns { error }.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { KINDS, RRC, NWI, SDA, SOILS_WMS, kindsIn, siteExtent, featureRow, summarize, soilsQuery, parseSoils, SOURCES } from '../lib/env.mjs';
import { areaSqMi } from '../lib/fema.mjs';
import { circle, cleanGeometry } from './crime.js';
import { tileBBox } from './fema.js';

const UA = { 'User-Agent': 'FinishesSolutions-RE-Intelligence/1.0 (environmental screen)' };
const MAX_SQMI = 30;
async function json(url, opts = {}, ms = 15000) {
  const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(new URL(url).host + ' ' + r.status);
  const d = await r.json(); if (d?.error) throw new Error(d.error.message || 'service error'); return d;
}
const query = (layer, params) => json(layer + '/query', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ f: 'json', inSR: '4326', outSR: '4326', ...params }) }, 20000);

// everything of one kind within (site radius + search distance) of the site's center, measured to the site's edge
export async function kindNear(kind, site, ext) {
  const K = KINDS[kind];
  const d = await query(K.url, { geometry: ext.center.join(','), geometryType: 'esriGeometryPoint', distance: String(ext.radius + K.mi + 0.01), units: 'esriSRUnit_StatuteMile',
    spatialRel: 'esriSpatialRelIntersects', outFields: Object.values(K.f).join(','), returnGeometry: 'true', resultRecordCount: '1000', ...(K.poly || K.line ? { maxAllowableOffset: '0.00005', geometryPrecision: '6' } : {}) });
  const s = summarize(kind, (d.features || []).map(f => featureRow(kind, f, site, ext.center)));
  return d.exceededTransferLimit ? { ...s, truncated: true } : s;
}
export async function soils(site) {
  const q = soilsQuery(site); if (!q) return [];
  const d = await json(SDA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'JSON+COLUMNNAME', query: q }) }, 20000);
  return parseSoils(d);
}
export async function envReport(site, { label } = {}) {
  const sq = areaSqMi(site);
  if (sq > MAX_SQMI) { const e = new Error('That area is too large for an environmental report (over ' + MAX_SQMI + ' square miles). Pick a smaller area or a site.'); e.status = 400; throw e; }
  const ext = siteExtent(site); if (!ext) { const e = new Error('No site shape.'); e.status = 400; throw e; }
  const part = async fn => { try { return await fn(); } catch (e) { return { error: e.message }; } };
  const kinds = Object.keys(KINDS), res = await Promise.all(kinds.map(k => part(() => kindNear(k, site, ext))));
  const out = Object.fromEntries(kinds.map((k, i) => [k, res[i].error ? { kind: k, label: KINDS[k].label, search_mi: KINDS[k].mi, error: res[i].error } : res[i]]));
  const soil = sq <= 3 ? await part(() => soils(site)) : { skipped: 'Soils are listed for sites up to 3 square miles.' };
  return { label, area_sqmi: Math.round(sq * 1000) / 1000, center: ext.center.map(v => Math.round(v * 1e5) / 1e5), kinds: out, soils: soil, sources: SOURCES };
}

// ---------- the sites layer ----------
export async function sitesInBox(b, set) {
  const kinds = kindsIn(set), env = JSON.stringify({ xmin: b[0], ymin: b[1], xmax: b[2], ymax: b[3], spatialReference: { wkid: 4326 } });
  const res = await Promise.all(kinds.map(async k => {
    const K = KINDS[k];
    try {
      const d = await query(K.url, { geometry: env, geometryType: 'esriGeometryEnvelope', spatialRel: 'esriSpatialRelIntersects', outFields: [K.f.id, K.f.name, K.f.addr].filter(Boolean).join(','), returnGeometry: 'true', resultRecordCount: '2000',
        ...(K.poly ? { maxAllowableOffset: '0.0001', geometryPrecision: '5' } : {}) });
      return (d.features || []).map(f => { const a = f.attributes || {}, g = f.geometry || {};
        if (K.poly) return { kind: k, id: String(a[K.f.id] ?? ''), name: a[K.f.name] || K.short, addr: a[K.f.addr] || '', rings: g.rings };
        return g.x != null ? [k, String(a[K.f.id] ?? ''), String(a[K.f.name] || K.short).slice(0, 80), String(a[K.f.addr] || '').slice(0, 80), Math.round(g.x * 1e6) / 1e6, Math.round(g.y * 1e6) / 1e6] : null; }).filter(Boolean);
    } catch (e) { return { error: k + ': ' + e.message }; }
  }));
  const pts = [], areas = [], errors = [];
  for (const r of res) { if (!Array.isArray(r)) { errors.push(r.error); continue; } for (const x of r) (Array.isArray(x) ? pts : areas).push(x); }
  return { sites: pts, areas, errors: errors.length ? errors : undefined };
}

// ---------- tiles ----------
export function tileUrl(layer, z, x, y) {
  const b = tileBBox(z, x, y), bbox = b.join(',');
  if (layer === 'rrc') return RRC + '/export?' + new URLSearchParams({ bbox, bboxSR: '3857', imageSR: '3857', size: '256,256', format: 'png32', transparent: 'true', layers: 'show:1,2,13', dpi: '96', f: 'image' });
  if (layer === 'wetlands') return NWI + '/export?' + new URLSearchParams({ bbox, bboxSR: '3857', imageSR: '3857', size: '256,256', format: 'png32', transparent: 'true', layers: 'show:0', dpi: '96', f: 'image' });
  if (layer === 'soils') return SOILS_WMS + '?' + new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap', LAYERS: 'mapunitpoly', STYLES: '', SRS: 'EPSG:3857', BBOX: bbox, WIDTH: '256', HEIGHT: '256', FORMAT: 'image/png', TRANSPARENT: 'true' });
  return null;
}
const MINZ = { rrc: 11, wetlands: 11, soils: 13 };

export default async function handler(req, res) {
  if (!sameOrigin(req, res)) return;
  const q = req.query || {};
  if (q.tile) {
    const m = String(q.tile).match(/^(rrc|wetlands|soils)\/(\d{1,2})\/(\d+)\/(\d+)$/); if (!m || +m[2] < MINZ[m[1]] || +m[2] > 19) return res.status(400).json({ error: 'tile=rrc|wetlands|soils/z/x/y (zoom ' + (m ? MINZ[m[1]] : 11) + '–19)' });
    try {
      const r = await fetch(tileUrl(m[1], +m[2], +m[3], +m[4]), { headers: UA, signal: AbortSignal.timeout(15000) });
      if (!r.ok || !/image/.test(r.headers.get('content-type') || '')) throw new Error(m[1] + ' ' + r.status);
      res.setHeader('Content-Type', 'image/png'); res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=2592000');
      return res.send(Buffer.from(await r.arrayBuffer()));
    } catch (e) { res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ error: e.message }); }
  }
  if (q.box) {
    if (!rateLimit(req, res, { perMinute: 60, perDay: 3000 })) return;
    const b = String(q.box).split(',').map(Number), set = ['cleanup', 'tanks', 'epa', 'all'].includes(q.set) ? q.set : 'cleanup';
    if (b.length !== 4 || !b.every(Number.isFinite) || b[0] >= b[2] || b[1] >= b[3] || (b[2] - b[0]) * (b[3] - b[1]) > 0.06) return res.status(400).json({ error: 'box=w,s,e,n, at most about 15 by 15 miles' });
    try { const d = await sitesInBox(b, set); res.setHeader('Cache-Control', d.errors ? 'no-store' : 'public, max-age=3600, s-maxage=86400'); return res.json(d); }
    catch (e) { res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ error: e.message }); }
  }
  if (!rateLimit(req, res, { perMinute: 12, perDay: 300 })) return;
  let g = null, label = '';
  if (req.method === 'POST') { const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}; g = cleanGeometry(b.geometry); label = String(b.label || '').slice(0, 120); }
  else { const lat = +q.lat, lon = +q.lon, mi = Math.min(5, Math.max(0.02, +q.mi || 0.1)); if (lat > 17 && lat < 50 && lon > -125 && lon < -65) g = circle(lon, lat, mi); }
  if (!g) return res.status(400).json({ error: 'Send a Polygon or MultiPolygon geometry (POST) or lat, lon and mi.' });
  try {
    const d = await envReport(g, { label });
    const partial = Object.values(d.kinds).some(k => k.error) || d.soils?.error;
    res.setHeader('Cache-Control', req.method === 'POST' || partial ? 'no-store' : 'public, max-age=3600, s-maxage=604800');
    return res.json(d);
  } catch (e) { res.setHeader('Cache-Control', 'no-store'); return res.status(e.status || 502).json({ error: e.message }); }
}
