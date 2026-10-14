// Environmental data for the map and the Environmental Report. All free, no keys (TCEQ, EPA, Railroad Commission,
// US Fish & Wildlife Service, USDA):
//   GET  ?tile=rrc|wetlands|soils/z/x/y        map layers as 256 px PNG tiles: oil & gas wells and pipelines, wetlands, soil map units
//   GET  ?box=w,s,e,n&set=cleanup|tanks|epa|all the sites layer: [[kind, id, name, address, lon, lat]] (+ restricted groundwater areas)
//   GET  ?lat=..&lon=..&mi=0.1                  report for a circle
//   POST { geometry, label }                    report for a site or area of any size (parcel, building, selection, radius, county)
//   POST { geometry, kinds: [..] }               just those sources (retry one that didn't finish; 'soils' for soils)
//   POST { geometry, kinds: [k], full: true, offset }  every record of one source, 8,000 at a time (the CSV export)
// A report counts, for each kind of record, everything within its search distance of the site's edge (Phase I style
// distances) and how many are on the site itself, and lists them nearest first (on-site first, then the nearest
// nearby ones, when there are more than 1,000), plus soils under the site (with each soil's share for larger sites).
// Each source is best effort: a failing or unfinished one returns { error } and can be asked for again on its own.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { KINDS, RRC, NWI, SDA, SOILS_WMS, kindsIn, siteExtent, featureRow, summarize, soilsQuery, soilsShareQuery, parseSoils, esriPolygon, SOURCES } from '../lib/env.mjs';
import { areaSqMi } from '../lib/fema.mjs';
import { circle, cleanGeometry } from './crime.js';
import { tileBBox } from './fema.js';

const UA = { 'User-Agent': 'FinishesSolutions-RE-Intelligence/1.0 (environmental screen)' };
const MAX_SQMI = 10000;   // an abuse guard only: larger than any Texas county
const FETCH_ALL = 1000;   // a kind with up to this many records is listed in full; above it the report counts all of them
                          // exactly, lists the on-site ones and the nearest nearby ones, and the export fetches the rest
const PAGE = 8000;        // records per full-list request (the export pages through them; a response must stay under 4.5 MB)
const CHUNK = 400;        // records per ArcGIS request (object ids in the URL body)
const BUDGET_MS = 100000; // vercel.json gives this function 120 s
async function json(url, opts = {}, ms = 15000) {
  if (ms < 500) throw Object.assign(new Error('didn’t finish in time'), { late: true });
  const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(new URL(url).host + ' ' + r.status);
  const d = await r.json(); if (d?.error) throw new Error(d.error.message || 'service error'); return d;
}
const left = (deadline, ms) => deadline ? Math.min(ms, deadline - Date.now()) : ms;
const query = (layer, params, deadline) => json(layer + '/query', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ f: 'json', inSR: '4326', outSR: '4326', ...params }) }, left(deadline, 25000));
// at most n requests at a time across one report (the state and federal services are shared and can throttle)
export function limiter(n) {
  let active = 0; const q = [];
  const next = () => { if (active >= n || !q.length) return; active++; const [fn, ok, no] = q.shift(); Promise.resolve().then(fn).then(ok, no).finally(() => { active--; next(); }); };
  return fn => new Promise((ok, no) => { q.push([fn, ok, no]); next(); });
}
const chunks = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };

// the old way, kept for a service that can't search around a polygon: a circle around the site, up to 1,000 records
export async function kindNear(kind, site, ext, deadline) {
  const K = KINDS[kind];
  const d = await query(K.url, { geometry: ext.center.join(','), geometryType: 'esriGeometryPoint', distance: String(ext.radius + K.mi + 0.01), units: 'esriSRUnit_StatuteMile',
    spatialRel: 'esriSpatialRelIntersects', outFields: Object.values(K.f).join(','), returnGeometry: 'true', resultRecordCount: '1000', ...(K.poly || K.line ? { maxAllowableOffset: '0.00005', geometryPrecision: '6' } : {}) }, deadline);
  const s = summarize(kind, (d.features || []).map(f => featureRow(kind, f, site, ext.center)));
  return d.exceededTransferLimit ? { ...s, truncated: true } : s;
}

// object ids of a kind's records within mi of the site's edge (0: touching the site). ArcGIS returns every id, with no
// record limit, so counts are exact.
async function idsWithin(K, site, mi, run, deadline) {
  const d = await run(() => query(K.url, { geometry: esriPolygon(site), geometryType: 'esriGeometryPolygon', spatialRel: 'esriSpatialRelIntersects', returnIdsOnly: 'true',
    ...(mi ? { distance: String(mi), units: 'esriSRUnit_StatuteMile' } : {}) }, deadline));
  if (!Array.isArray(d.objectIds) && d.objectIds != null) throw new Error('unexpected id list');
  return d.objectIds || [];
}
// the records themselves, by id: on-site ones need no geometry (their distance is 0)
async function byIds(kind, ids, withGeom, run, deadline) {
  const K = KINDS[kind], out = [];
  await Promise.all(chunks(ids, CHUNK).map(part => run(async () => {
    const d = await query(K.url, { objectIds: part.join(','), outFields: Object.values(K.f).join(','), returnGeometry: withGeom ? 'true' : 'false',
      ...(withGeom && (K.poly || K.line) ? { maxAllowableOffset: '0.00005', geometryPrecision: '6' } : {}) }, deadline);
    out.push(...(d.features || []));
  })));
  return out;
}
// counts by type straight from the service (wells by kind, wetlands by type with acres, pipelines as distinct lines)
const attr = (a, name) => a[name] ?? a[name.split('.').pop()] ?? Object.entries(a).find(([k]) => k.toLowerCase().endsWith(name.split('.').pop().toLowerCase()))?.[1];
async function statsBy(kind, site, mi, groupBy, sum, run, deadline) {
  const K = KINDS[kind], st = [{ statisticType: 'count', onStatisticField: groupBy[0], outStatisticFieldName: 'n' }, ...(sum ? [{ statisticType: 'sum', onStatisticField: sum, outStatisticFieldName: 's' }] : [])];
  const d = await run(() => query(K.url, { geometry: esriPolygon(site), geometryType: 'esriGeometryPolygon', spatialRel: 'esriSpatialRelIntersects', distance: String(mi), units: 'esriSRUnit_StatuteMile',
    groupByFieldsForStatistics: groupBy.join(','), outStatistics: JSON.stringify(st), returnGeometry: 'false' }, deadline));
  return (d.features || []).map(f => ({ keys: groupBy.map(g => attr(f.attributes || {}, g)), n: +attr(f.attributes || {}, 'n') || 0, s: sum ? +attr(f.attributes || {}, 's') || 0 : undefined }));
}

// one kind of record for a site of any size. full: one page of every record (the export; on-site first, then nearby),
// from offset, with next = the offset of the following page or null
export async function kindReport(kind, site, ext, { run = limiter(6), deadline, full = false, offset = 0, page = PAGE } = {}) {
  const K = KINDS[kind];
  // most sites: one request, everything within the search distance of the site's edge
  if (!full) {
    let d; try { d = await run(() => query(K.url, { geometry: esriPolygon(site), geometryType: 'esriGeometryPolygon', spatialRel: 'esriSpatialRelIntersects', distance: String(K.mi), units: 'esriSRUnit_StatuteMile',
      outFields: Object.values(K.f).join(','), returnGeometry: 'true', ...(K.poly || K.line ? { maxAllowableOffset: '0.00005', geometryPrecision: '6' } : {}) }, deadline)); }
    catch (e) { if (e.late) throw e; return { ...(await kindNear(kind, site, ext, deadline)), method: 'circle' }; } // service can't search around a polygon
    if (!d.exceededTransferLimit) return summarize(kind, (d.features || []).map(f => featureRow(kind, f, site, ext.center)));
  }
  // more than the service returns at once: count every record by id, then fetch them in pieces
  let near, on;
  try { [near, on] = await Promise.all([idsWithin(K, site, K.mi, run, deadline), idsWithin(K, site, 0, run, deadline)]); }
  catch (e) { if (e.late || full) throw e; return { ...(await kindNear(kind, site, ext, deadline)), method: 'circle' }; } // service can't search around a polygon
  const onSet = new Set(on), nearby = near.filter(id => !onSet.has(id)), total = new Set([...near, ...on]).size;
  if (full) {
    const ids = [...on, ...nearby].slice(offset, offset + page), pOn = ids.filter(id => onSet.has(id)), pNear = ids.filter(id => !onSet.has(id));
    const [a, b] = await Promise.all([byIds(kind, pOn, false, run, deadline), byIds(kind, pNear, true, run, deadline)]);
    const rows = summarize(kind, [...a.map(f => ({ ...featureRow(kind, f, site, ext.center), mi: 0, dir: undefined })), ...b.map(f => featureRow(kind, f, site, ext.center))], { all: true }).all;
    return { kind, rows, total, offset, next: offset + page < on.length + nearby.length ? offset + page : null };
  }
  const cap = FETCH_ALL, big = total > cap;
  // on-site records first (they matter most), then the nearby ones, which need their geometry to measure the distance
  const onIds = on.slice(0, big ? 200 : on.length), nearIds = nearby.slice(0, Math.max(0, cap - onIds.length));
  const [fOn, fNear] = await Promise.all([byIds(kind, onIds, false, run, deadline), byIds(kind, nearIds, true, run, deadline)]);
  const rows = [...fOn.map(f => ({ ...featureRow(kind, f, site, ext.center), mi: 0, dir: undefined })), ...fNear.map(f => featureRow(kind, f, site, ext.center))];
  const s = summarize(kind, rows);
  if (!big) return s;
  // too many to list: exact totals from the id lists, type breakdowns from the service
  const out = { ...s, count: total, onsite: on.length, listed: rows.length };
  const part = async fn => { try { return await fn(); } catch (e) { return null; } };
  if (kind === 'wells') { const t = await part(() => statsBy(kind, site, K.mi, [K.f.name], null, run, deadline)); if (t) out.by_type = t.map(x => ({ type: x.keys[0] || 'Unknown', n: x.n })).sort((a, b) => b.n - a.n); }
  if (kind === 'wetlands') { const t = await part(() => statsBy(kind, site, K.mi, [K.f.name], K.f.acres, run, deadline)); if (t) out.by_type = t.map(x => ({ type: x.keys[0] || 'Unknown', n: x.n, acres: Math.round(x.s || 0) })).sort((a, b) => b.n - a.n); }
  if (kind === 'pipelines') { const t = await part(() => statsBy(kind, site, K.mi, [K.f.name, K.f.system, K.f.commodity, K.f.diameter], null, run, deadline)); if (t) { out.count = t.length; out.segments = total; } }
  return out;
}
export async function soils(site, deadline) {
  const share = areaSqMi(site) > 3, q = share ? soilsShareQuery(site) : soilsQuery(site); if (!q) return [];
  const ask = query => json(SDA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'JSON+COLUMNNAME', query }) }, left(deadline, 30000));
  if (!share) return parseSoils(await ask(q));
  // share of the site by soil: heavier for USDA; fall back to the plain list if it can't
  try { return parseSoils(await ask(q)); } catch (e) { const list = parseSoils(await ask(soilsQuery(site))); return Object.assign(list, { note: 'Share of the site by soil wasn’t available; soils are listed without it.' }); }
}
export async function envReport(site, { label, kinds, full = false, offset = 0, deadline = Date.now() + BUDGET_MS } = {}) {
  const sq = areaSqMi(site);
  if (sq > MAX_SQMI) { const e = new Error('That area is larger than ' + MAX_SQMI.toLocaleString('en-US') + ' square miles. Pick a smaller area.'); e.status = 400; throw e; }
  const ext = siteExtent(site); if (!ext) { const e = new Error('No site shape.'); e.status = 400; throw e; }
  const want = (kinds?.length ? kinds.filter(k => KINDS[k]) : Object.keys(KINDS)), run = limiter(10);
  const part = async fn => { try { return await fn(); } catch (e) { return { error: e.late ? 'didn’t finish in time' : e.message }; } };
  const [res, soil] = await Promise.all([Promise.all(want.map(k => part(() => kindReport(k, site, ext, { run, deadline, full, offset })))),
    !kinds?.length || kinds.includes('soils') ? part(() => soils(site, deadline)) : null]);
  const out = Object.fromEntries(want.map((k, i) => [k, res[i].error ? { kind: k, label: KINDS[k].label, search_mi: KINDS[k].mi, error: res[i].error } : res[i]]));
  return { label, area_sqmi: Math.round(sq * 1000) / 1000, center: ext.center.map(v => Math.round(v * 1e5) / 1e5), kinds: out, ...(soil ? { soils: soil.error ? soil : { list: soil, note: soil.note } } : {}), sources: SOURCES };
}

// ---------- the sites layer ----------
export async function sitesInBox(b, set) {
  const kinds = kindsIn(set), env = JSON.stringify({ xmin: b[0], ymin: b[1], xmax: b[2], ymax: b[3], spatialReference: { wkid: 4326 } });
  const res = await Promise.all(kinds.map(async k => {
    const K = KINDS[k];
    try {
      const d = await query(K.url, { geometry: env, geometryType: 'esriGeometryEnvelope', spatialRel: 'esriSpatialRelIntersects', outFields: [K.f.id, K.f.name, K.f.addr].filter(Boolean).join(','), returnGeometry: 'true', resultRecordCount: '2000',
        ...(K.poly ? { maxAllowableOffset: '0.00002', geometryPrecision: '6' } : {}) });
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
  let g = null, label = '', kinds = null, full = false, offset = 0;
  if (req.method === 'POST') { const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}; g = cleanGeometry(b.geometry); label = String(b.label || '').slice(0, 120);
    // kinds: just these sources (retrying one that didn't finish, or 'soils'); full: every record of them (the export)
    if (Array.isArray(b.kinds)) kinds = b.kinds.map(String).filter(k => KINDS[k] || k === 'soils').slice(0, 20); full = !!b.full && kinds?.length === 1; offset = Math.max(0, Math.floor(+b.offset || 0)); }
  else { const lat = +q.lat, lon = +q.lon, mi = Math.min(5, Math.max(0.02, +q.mi || 0.1)); if (lat > 17 && lat < 50 && lon > -125 && lon < -65) g = circle(lon, lat, mi); }
  if (!g) return res.status(400).json({ error: 'Send a Polygon or MultiPolygon geometry (POST) or lat, lon and mi.' });
  try {
    const d = await envReport(g, { label, kinds, full, offset });
    const partial = Object.values(d.kinds).some(k => k.error) || d.soils?.error;
    res.setHeader('Cache-Control', req.method === 'POST' || partial ? 'no-store' : 'public, max-age=3600, s-maxage=604800');
    return res.json(d);
  } catch (e) { res.setHeader('Cache-Control', 'no-store'); return res.status(e.status || 502).json({ error: e.message }); }
}
