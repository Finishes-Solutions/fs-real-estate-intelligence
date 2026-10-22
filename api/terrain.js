// Ground elevations over a site, for the site facts, the layout engine and the plan set's grading sheets (lib/terrain.mjs).
//   POST { origin: [lon, lat], ring: [[x, y] feet, …] } -> a terrain: { x0, y0, cell, nx, ny, z: [ft], source, detail, resM,
//        coarse, sig, at } on a grid of up to 3,600 points over the site (every 10 ft on a few acres, wider on big tracts)
//   GET ?lon=..&lat=..[&ft=600] -> the same for a square ft on a side centred there (for a quick look; ?sum=1: the summary only)
// Sources, best first, all free and keyless:
//   1. USGS 3DEP (The National Map's elevation image service), getSamples: the best model at each point, 1 m lidar
//      where it has been flown (most of Texas), else 1/3 arc-second (about 10 m). Bare ground, NAVD 88.
//   2. USGS Elevation Point Query Service, a 10 x 10 grid one point at a time (when the image service is down); coarse
//   3. Open-Meteo's elevation API (Copernicus 90 m), coarse: which way the land falls, not contours
// The elevations are for planning: not a survey.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { gridSpec, gridLL, cleanZ, fillGaps, terrainSig, summary, factLine } from '../lib/terrain.mjs';

const UA = { 'User-Agent': 'FinishesSolutions-RE-Intelligence/1.0 (site terrain)' };
export const USGS = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/getSamples';
export const EPQS = 'https://epqs.nationalmap.gov/v1/json';
export const METEO = 'https://api.open-meteo.com/v1/elevation';
const M = 3.28084, BATCH = 400, BUDGET_MS = 50000;

async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }
const timeLeft = t0 => BUDGET_MS - (Date.now() - t0);

// 1. the 3DEP image service: points in batches, values in metres; each answer names the cell size of the model used there
export async function usgsSamples(pts, t0 = Date.now()) {
  const z = new Array(pts.length).fill(null), res = [];
  const batches = []; for (let k = 0; k < pts.length; k += BATCH) batches.push(k);
  await pool(batches, 4, async k => {
    const part = pts.slice(k, k + BATCH), body = new URLSearchParams({ geometry: JSON.stringify({ points: part, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryMultipoint', returnFirstValueOnly: 'true', interpolation: 'RSP_BilinearInterpolation', outFields: '', f: 'json' });
    let d = null, err = null;
    for (let tries = 0; tries < 2 && !d; tries++) try {
      const r = await fetch(USGS, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(Math.max(1000, Math.min(25000, timeLeft(t0)))) });
      if (!r.ok) throw new Error('USGS elevation service ' + r.status); const j = await r.json(); if (j?.error) throw new Error(j.error.message || 'USGS elevation service error'); d = j;
    } catch (e) { err = e; }
    if (!d) throw err;
    for (const s of d.samples || []) { const i = +s.locationId, v = cleanZ(s.value); if (Number.isInteger(i) && i >= 0 && i < part.length && v != null) { z[k + i] = v * M; if (+s.resolution > 0) res.push(+s.resolution); } }
  });
  return { z, res };
}
// 2. one point at a time (values asked for in feet)
export async function epqsSamples(pts, t0 = Date.now()) {
  const z = new Array(pts.length).fill(null);
  await pool(pts, 10, async ([lon, lat], k) => { if (timeLeft(t0) < 2000) return; try {
    const r = await fetch(EPQS + '?x=' + lon + '&y=' + lat + '&wkid=4326&units=Feet&includeDate=false', { headers: UA, signal: AbortSignal.timeout(Math.min(10000, timeLeft(t0))) });
    if (r.ok) z[k] = cleanZ((await r.json())?.value); } catch (e) { /* a hole */ } });
  return { z };
}
// 3. Open-Meteo: up to 100 points a request, metres
export async function meteoSamples(pts, t0 = Date.now()) {
  const z = new Array(pts.length).fill(null), batches = []; for (let k = 0; k < pts.length; k += 100) batches.push(k);
  await pool(batches, 3, async k => { const part = pts.slice(k, k + 100);
    const r = await fetch(METEO + '?latitude=' + part.map(p => p[1].toFixed(6)).join(',') + '&longitude=' + part.map(p => p[0].toFixed(6)).join(','), { headers: UA, signal: AbortSignal.timeout(Math.max(1000, Math.min(15000, timeLeft(t0)))) });
    if (!r.ok) throw new Error('Open-Meteo ' + r.status); const d = await r.json(); (d.elevation || []).forEach((v, i) => { const c = cleanZ(v); if (c != null) z[k + i] = c * M; }); });
  return { z };
}
// a coarser grid over the same box (for the point-at-a-time sources)
const coarseSpec = (spec, n) => { const W = (spec.nx - 1) * spec.cell, H = (spec.ny - 1) * spec.cell, cell = Math.ceil(Math.max(W, H) / (n - 1)); return { x0: spec.x0, y0: spec.y0, cell, nx: Math.ceil(W / cell) + 1, ny: Math.ceil(H / cell) + 1 }; };
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

// meteo: false leaves out the Open-Meteo fallback (the MCP server: Open-Meteo's free API is for non-commercial use)
export async function terrainFor(origin, ring, t0 = Date.now(), { meteo = true } = {}) {
  const spec = gridSpec(ring), sig = terrainSig(origin, ring), at = new Date().toISOString(), lat = origin[1], why = [];
  try {
    const { z, res } = await usgsSamples(gridLL(spec, origin), t0), T = fillGaps({ ...spec, z });
    if (T) { const r = median(res), m = r ? r * Math.cos(lat * Math.PI / 180) : null; // (the service's cells are web-mercator metres)
      return { ...T, z: T.z.map(v => Math.round(v * 100) / 100), source: 'USGS 3DEP', detail: m == null ? '' : m < 2.5 ? (m < 1.5 ? '1 m' : Math.round(m) + ' m') + ' lidar' : '~' + Math.round(m) + ' m', resM: m && +m.toFixed(1), coarse: false, sig, at }; }
    why.push('USGS image service had too little data here');
  } catch (e) { why.push(e.message); }
  for (const [name, fn, n, detail] of [['USGS 3DEP', epqsSamples, 10, 'point samples'], ['Copernicus DEM', meteoSamples, 12, '90 m, via Open-Meteo']].filter(x => meteo || x[0] !== 'Copernicus DEM')) {
    if (timeLeft(t0) < 4000) break;
    try { const cs = coarseSpec(spec, n), { z } = await fn(gridLL(cs, origin), t0), T = fillGaps({ ...cs, z });
      if (T) return { ...T, z: T.z.map(v => Math.round(v * 100) / 100), source: name, detail, resM: null, coarse: true, sig, at, why: why.join('; ') };
      why.push(name + ' had too little data here'); } catch (e) { why.push(e.message); }
  }
  const err = new Error('No elevation source answered (' + why.join('; ') + ').'); err.status = 502; throw err;
}

export default async function handler(req, res) {
  if (!sameOrigin(req, res)) return;
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'POST { origin, ring }, or GET ?lon=&lat=' });
  if (!rateLimit(req, res, { perMinute: 10, perDay: 300 })) return;
  let b = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : (req.body || {});
  const q = req.query || {}, sq = Math.max(50, Math.min(5000, +q.ft || 600)) / 2;
  if (req.method === 'GET') b = { origin: [+q.lon, +q.lat], ring: [[-sq, -sq], [sq, -sq], [sq, sq], [-sq, sq]] };
  const origin = Array.isArray(b.origin) && b.origin.length === 2 && b.origin.every(Number.isFinite) ? b.origin.map(Number) : null;
  const ring = Array.isArray(b.ring) && b.ring.length >= 3 && b.ring.length <= 3000 && b.ring.every(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(+p[0]) && Number.isFinite(+p[1])) ? b.ring.map(p => [+p[0], +p[1]]) : null;
  if (!origin || !ring || Math.abs(origin[1]) > 85 || Math.abs(origin[0]) > 180) return res.status(400).json({ error: 'Send { origin: [lon, lat], ring: [[x, y] in feet, …] }.' });
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]); if (Math.max(...xs) - Math.min(...xs) > 26400 || Math.max(...ys) - Math.min(...ys) > 26400) return res.status(400).json({ error: 'That site is over 5 miles across.' });
  try { const T = await terrainFor(origin, ring); res.setHeader('Cache-Control', 'private, max-age=86400');
    if (req.method === 'GET' && q.sum) { const { z, ...meta } = T; return res.json({ ...meta, points: z.length, summary: summary(T, ring), fact: factLine(T, ring) }); }
    return res.json(T); }
  catch (e) { console.error('terrain', e.message); return res.status(e.status || 502).json({ error: e.message.slice(0, 300) }); }
}
