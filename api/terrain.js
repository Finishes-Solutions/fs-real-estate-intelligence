// Ground elevations over a site, for the site facts, the layout engine and the plan set's grading sheets (lib/terrain.mjs).
//   POST { origin: [lon, lat], ring: [[x, y] feet, …] } -> a terrain: { x0, y0, cell, nx, ny, z: [ft], source, detail, resM,
//        coarse, sig, at } on a grid of up to 250,000 points over the site (every 3 ft on lidar up to about 50 acres, every
//        10 ft on the 10 m model; wider on bigger tracts)
//   GET ?lon=..&lat=..[&ft=600] -> the same for a square ft on a side centred there (for a quick look; ?sum=1: the summary only)
// Sources, best first, all free and keyless:
//   1. USGS 3DEP (The National Map's elevation image service), exportImage: the whole grid as one float image (tiles of up
//      to 1,000 x 1,000 on a big tract), the best model there, 1 m lidar where it has been flown (most of Texas), else 1/3
//      arc-second (about 10 m). Bare ground, NAVD 88. One getSamples point first says which model it is.
//   2. the same service's getSamples, point by point in batches on a grid of up to 3,600 (when exportImage fails)
//   3. USGS Elevation Point Query Service, a 10 x 10 grid one point at a time (when the image service is down); coarse
//   4. Open-Meteo's elevation API (Copernicus 90 m), coarse: which way the land falls, not contours
// The elevations are for planning: not a survey.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { gridSpec, gridLL, cleanZ, fillGaps, terrainSig, summary, factLine, MAX_POINTS } from '../lib/terrain.mjs';
import { frame, centroid } from '../lib/siteplan.mjs';

const UA = { 'User-Agent': 'FinishesSolutions-RE-Intelligence/1.0 (site terrain)' };
export const USGS = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/getSamples';
export const USGS_IMAGE = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage';
export const EPQS = 'https://epqs.nationalmap.gov/v1/json';
export const METEO = 'https://api.open-meteo.com/v1/elevation';
const M = 3.28084, BATCH = 400, BUDGET_MS = 50000, TILE = 1000;

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
// 1. the whole grid as float images. The plan's feet are linear in lon/lat (frame()), so an image in lon/lat whose pixel
// centres sit on the grid points gives the grid itself, row 0 at the north edge; a tract wider than TILE points is asked
// for in tiles. Values in metres; NoData (under water, past the survey's edge) comes back as a hole for fillGaps.
export async function usgsRaster(spec, origin, t0 = Date.now()) {
  const { fromArrayBuffer } = await import('geotiff'), F = frame(origin), { nx, ny, x0, y0, cell } = spec, z = new Array(nx * ny).fill(null), tiles = [];
  for (let j0 = 0; j0 < ny; j0 += TILE) for (let i0 = 0; i0 < nx; i0 += TILE) tiles.push([i0, j0, Math.min(TILE, nx - i0), Math.min(TILE, ny - j0)]);
  await pool(tiles, 3, async ([i0, j0, w, h]) => {
    const sw = F.toLL([x0 + (i0 - 0.5) * cell, y0 + (j0 - 0.5) * cell]), ne = F.toLL([x0 + (i0 + w - 0.5) * cell, y0 + (j0 + h - 0.5) * cell]);
    const q = new URLSearchParams({ bbox: [sw[0], sw[1], ne[0], ne[1]].join(','), bboxSR: '4326', imageSR: '4326', size: w + ',' + h, format: 'tiff', pixelType: 'F32', noData: '-9999', noDataInterpretation: 'esriNoDataMatchAny', interpolation: 'RSP_BilinearInterpolation', f: 'image' });
    let px = null, err = null;
    for (let tries = 0; tries < 2 && !px; tries++) try {
      const r = await fetch(USGS_IMAGE + '?' + q, { headers: UA, signal: AbortSignal.timeout(Math.max(1000, Math.min(30000, timeLeft(t0)))) });
      if (!r.ok) throw new Error('USGS elevation image ' + r.status);
      const buf = await r.arrayBuffer(), magic = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
      if (!(magic[0] === 0x49 && magic[1] === 0x49) && !(magic[0] === 0x4d && magic[1] === 0x4d)) throw new Error('USGS elevation image: not a TIFF (' + new TextDecoder().decode(buf.slice(0, 120)).replace(/\s+/g, ' ').trim() + ')');
      const img = await (await fromArrayBuffer(buf)).getImage(), W = img.getWidth(), H = img.getHeight(), [band] = await img.readRasters({ samples: [0] });
      px = { band, W, H };
    } catch (e) { err = e; }
    if (!px) throw err;
    const { band, W, H } = px; // (the service answers the size asked for; nearest pixel if it ever doesn't)
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const v = band[Math.min(H - 1, Math.round(r * H / h)) * W + Math.min(W - 1, Math.round(c * W / w))], m = v <= -9998 ? null : cleanZ(v);
      if (m != null) z[(j0 + h - 1 - r) * nx + i0 + c] = m * M; }
  });
  return { z };
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
// a coarser grid over the same box (for the point sources)
const coarseSpec = (spec, n) => { const W = (spec.nx - 1) * spec.cell, H = (spec.ny - 1) * spec.cell, cell = Math.ceil(Math.max(W, H) / (n - 1)); return { x0: spec.x0, y0: spec.y0, cell, nx: Math.ceil(W / cell) + 1, ny: Math.ceil(H / cell) + 1 }; };
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

// the model's cell on the ground in metres at one point (getSamples names it; the service's cells are web-mercator metres),
// or null when it doesn't answer
async function modelCell(origin, ring, t0) {
  try { const F = frame(origin), { res } = await usgsSamples([F.toLL(centroid(ring))], t0); return res[0] ? res[0] * Math.cos(origin[1] * Math.PI / 180) : null; } catch (e) { return null; }
}
const detailOf = m => m == null ? '' : m < 2.5 ? (m < 1.5 ? '1 m' : Math.round(m) + ' m') + ' lidar' : '~' + Math.round(m) + ' m';

// meteo: false leaves out the Open-Meteo fallback (the MCP server: Open-Meteo's free API is for non-commercial use)
export async function terrainFor(origin, ring, t0 = Date.now(), { meteo = true } = {}) {
  const sig = terrainSig(origin, ring), at = new Date().toISOString(), why = [], done = (T, extra) => ({ ...T, z: T.z.map(v => Math.round(v * 100) / 100), sig, at, ...extra });
  // 1. the image: every 3 ft on lidar, every 10 ft on the 10 m model (half its cell: finer only repeats the model)
  const m = await modelCell(origin, ring, t0), minCell = m == null ? 3 : Math.max(3, Math.min(10, Math.floor(m * M / 2)));
  try {
    const spec = gridSpec(ring, { maxPts: MAX_POINTS, minCell }), { z } = await usgsRaster(spec, origin, t0), T = fillGaps({ ...spec, z });
    if (T) return done(T, { source: 'USGS 3DEP', detail: detailOf(m), resM: m && +m.toFixed(1), coarse: false });
    why.push('USGS elevation image had too little data here');
  } catch (e) { why.push(e.message); }
  // 2. the same model point by point
  if (timeLeft(t0) > 8000) try {
    const spec = gridSpec(ring), { z, res } = await usgsSamples(gridLL(spec, origin), t0), T = fillGaps({ ...spec, z });
    if (T) { const r = median(res), mm = r ? r * Math.cos(origin[1] * Math.PI / 180) : null; return done(T, { source: 'USGS 3DEP', detail: detailOf(mm), resM: mm && +mm.toFixed(1), coarse: false, why: why.join('; ') }); }
    why.push('USGS image service had too little data here');
  } catch (e) { why.push(e.message); }
  const spec = gridSpec(ring);
  for (const [name, fn, n, detail] of [['USGS 3DEP', epqsSamples, 10, 'point samples'], ['Copernicus DEM', meteoSamples, 12, '90 m, via Open-Meteo']].filter(x => meteo || x[0] !== 'Copernicus DEM')) {
    if (timeLeft(t0) < 4000) break;
    try { const cs = coarseSpec(spec, n), { z } = await fn(gridLL(cs, origin), t0), T = fillGaps({ ...cs, z });
      if (T) return done(T, { source: name, detail, resM: null, coarse: true, why: why.join('; ') });
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
