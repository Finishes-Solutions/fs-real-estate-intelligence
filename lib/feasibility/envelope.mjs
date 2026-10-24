// Ported from fs-cre-report-runner lib/v2/site/envelope.js (matthew/nifty-mendel-hc0iwc @ 35c1fe4).
// Same method, grid budget (260,000 cells) and cell-size bounds (1.5 to 12 ft) as the source. Changes: ES module;
// parcels may be Features, bare Polygon / MultiPolygon geometries or a FeatureCollection; the setback must be a
// finite number of feet >= 0; the result also carries the envelope outline in lon/lat (ringsLngLat).
//
// The buildable envelope of an ASSEMBLAGE. Insetting each parcel on its own is wrong for an assemblage: parcels
// bought together are replatted into one lot, so the only real setback runs around the OUTSIDE of the group, while a
// per-parcel inset also carves the setback off both sides of every shared interior line. Long, narrow parcels make
// that mistake worse, because the false interior setbacks eat almost the whole strip.
//
// METHOD. Union the parcels, then erode the union by the setback: the set of points at least `setbackFt` from the
// boundary of the land. It is done on a raster because county parcels share lines that are nearly but not exactly
// identical, so a polygon union does not cancel them cleanly; a raster handles unions, holes, concavity, slivers and
// multi-part parcels the same way, with error bounded by the cell size chosen against the site.
//   1. rasterize every parcel (scanline, even-odd per parcel so holes drop out) and OR them together
//   2. exact Euclidean distance transform (Felzenszwalb & Huttenlocher, 2012)
//   3. envelope = cells at least `setbackFt` from the nearest non-site cell
//   4. marching squares on the same distance field for a drawable outline (interpolated, so not a staircase), so
//      the drawing and the ratio cannot disagree
//
// The setback is UNIFORM around the assemblage. Per-edge setbacks (front / side / rear) are not supported here: the
// distance field measures distance to the nearest boundary of any kind, and a per-edge version needs a separate field
// per edge class. lib/siteplan.mjs (edgeRules / insetRing) handles per-edge setbacks on a single traced boundary.
// Gaps between parcels wider than about a cell stay outside the site and are set back from; lib/siteplan.mjs
// unionParcels closes small gaps first, and its traced ring can be passed here as one parcel when that is wanted.
//
// DOM-free and dependency-free: loaded by Node and by the browser.

import { collectionAreaSqFt, outerRings, holeRings, signedArea, dedupe } from './plane.mjs';

export const TARGET_CELLS = 260000;   // grid budget; about 500 x 520 on a typical site
export const MIN_CELL_FT = 1.5;
export const MAX_CELL_FT = 12;

// Parcels as a list of geometries: accepts a FeatureCollection, Features or bare geometries.
function geometriesOf(parcels) {
  const list = parcels && parcels.type === 'FeatureCollection' ? parcels.features : Array.isArray(parcels) ? parcels : parcels ? [parcels] : [];
  return list.map(f => f && f.type === 'Feature' ? f.geometry : f).filter(g => g && outerRings(g).length);
}

// Outer rings and holes of one geometry in plane feet (filled together, even-odd).
const ringsFt = (geom, plane) => outerRings(geom).concat(holeRings(geom)).map(r => r.map(plane.toFt));

// Scanline even-odd fill of one parcel's rings into the union mask.
function fillRings(mask, W, H, x0, y0, cell, rings) {
  const edges = [];
  for (const ring of rings) {
    const r = dedupe(ring);
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      if (a[1] === b[1]) continue;               // horizontal edges never cross a scanline
      edges.push([a[0], a[1], b[0], b[1]]);
    }
  }
  if (!edges.length) return;
  const xs = [];
  for (let j = 0; j < H; j++) {
    const y = y0 + (j + 0.5) * cell;
    xs.length = 0;
    for (const [ex0, ey0, ex1, ey1] of edges) {
      if (y < Math.min(ey0, ey1) || y >= Math.max(ey0, ey1)) continue;   // half-open: a vertex counts once
      xs.push(ex0 + (y - ey0) * (ex1 - ex0) / (ey1 - ey0));
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const iA = Math.max(0, Math.ceil((xs[k] - x0) / cell - 0.5)), iB = Math.min(W - 1, Math.floor((xs[k + 1] - x0) / cell - 0.5));
      for (let i = iA; i <= iB; i++) mask[j * W + i] = 1;
    }
  }
}

// 1-D squared distance transform of a sampled function (Felzenszwalb & Huttenlocher).
function dt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

// Distance (in CELLS) from every site cell to the nearest non-site cell; non-site cells are 0. Cells past the padded
// grid count as non-site, which is right: the site does not extend past its own bounding box.
export function distanceField(mask, W, H) {
  const BIG = 1e12, N = Math.max(W, H);
  const f = new Float64Array(N), d = new Float64Array(N), v = new Int32Array(N + 1), z = new Float64Array(N + 2);
  const sq = new Float64Array(W * H);
  for (let i = 0; i < sq.length; i++) sq[i] = mask[i] ? BIG : 0;
  for (let i = 0; i < W; i++) {                          // columns
    for (let j = 0; j < H; j++) f[j] = sq[j * W + i];
    dt1d(f, H, d, v, z);
    for (let j = 0; j < H; j++) sq[j * W + i] = d[j];
  }
  for (let j = 0; j < H; j++) {                          // rows
    const row = j * W;
    for (let i = 0; i < W; i++) f[i] = sq[row + i];
    dt1d(f, W, d, v, z);
    for (let i = 0; i < W; i++) sq[row + i] = d[i];
  }
  const out = new Float32Array(W * H);
  for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(sq[i]);
  return out;
}

// Marching squares on the field at `level`: closed rings in plane feet, with the enclosed (>= level) region on the
// LEFT of each segment, so outer rings come back counter-clockwise and holes clockwise.
export function contours(field, W, H, level, x0, y0, cell) {
  const segs = [];
  const px = i => x0 + (i + 0.5) * cell, py = j => y0 + (j + 0.5) * cell;
  for (let j = 0; j + 1 < H; j++) {
    for (let i = 0; i + 1 < W; i++) {
      const c = [field[j * W + i], field[j * W + i + 1], field[(j + 1) * W + i + 1], field[(j + 1) * W + i]];   // CCW from bottom-left
      const ins = c.map(v => v >= level);
      if (ins[0] === ins[1] && ins[1] === ins[2] && ins[2] === ins[3]) continue;
      const cx = [px(i), px(i + 1), px(i + 1), px(i)], cy = [py(j), py(j), py(j + 1), py(j + 1)];
      // crossing on cell edge k (corner k -> corner k+1), linearly interpolated
      const cross = k => { const k1 = (k + 1) % 4, t = (level - c[k]) / (c[k1] - c[k]); return [cx[k] + t * (cx[k1] - cx[k]), cy[k] + t * (cy[k1] - cy[k])]; };
      // walking the cell counter-clockwise, an inside->outside crossing starts a segment and the next
      // outside->inside crossing ends it, which keeps the inside on the left without a 16-case table
      const starts = [], ends = [];
      for (let k = 0; k < 4; k++) { const a = ins[k], b = ins[(k + 1) % 4]; if (a && !b) starts.push(k); else if (!a && b) ends.push(k); }
      for (const s of starts) {
        let e = -1;
        for (let step = 1; step <= 4; step++) { const k = (s + step) % 4; if (ends.includes(k)) { e = k; break; } }
        if (e >= 0) segs.push([cross(s), cross(e)]);
      }
    }
  }
  return stitch(segs, cell);
}

// Join segments end-to-start into closed rings; drop anything degenerate.
function stitch(segs, cell) {
  const tol = cell * 0.35, key = p => Math.round(p[0] / tol) + ',' + Math.round(p[1] / tol);
  const byStart = new Map();
  for (const s of segs) { const k = key(s[0]); if (!byStart.has(k)) byStart.set(k, []); byStart.get(k).push(s); }
  const used = new Set(), rings = [];
  for (const seed of segs) {
    if (used.has(seed)) continue;
    const ring = [seed[0]];
    let cur = seed;
    for (let guard = 0; guard < 200000; guard++) {
      used.add(cur); ring.push(cur[1]);
      const nxt = (byStart.get(key(cur[1])) || []).find(s => !used.has(s));
      if (!nxt) break;
      cur = nxt;
    }
    const r = dedupe(ring);
    if (r.length >= 3 && Math.abs(signedArea(r)) > cell * cell) rings.push(r);
  }
  return rings;
}

/**
 * Buildable envelope of the whole assemblage.
 * @param parcels   GeoJSON parcels in lon/lat: a FeatureCollection, or an array of Features / Polygon / MultiPolygon
 * @param setbackFt uniform perimeter setback in feet (>= 0)
 * @param opts      options: plane, targetCells
 * @returns null when there is nothing to measure, else {
 *   plane, cellFt, grid, siteSf (rasterized), geometrySf (exact), envelopeSf, ratio (envelope / site),
 *   rings        envelope outline rings, plane feet, open, CCW outer / CW hole
 *   ringsLngLat  the same rings in lon/lat, closed
 *   unionRings   assemblage outline rings, plane feet
 *   maxInsetFt   the largest setback the site can take before the envelope closes up
 *   setbackFt }
 */
export function buildEnvelope(parcels, setbackFt, opts = {}) {
  const geoms = geometriesOf(parcels);
  if (!geoms.length) return null;
  const sb = +setbackFt;
  if (!Number.isFinite(sb) || sb < 0) throw new RangeError('setbackFt must be a number of feet >= 0, got ' + setbackFt);
  const agg = collectionAreaSqFt(geoms);
  if (!agg.plane || agg.sqft <= 0) return null;
  const plane = opts.plane || agg.plane;

  // extent over every ring, padded so the erosion sees open space outside the site
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const ringsByParcel = geoms.map(g => {
    const rings = ringsFt(g, plane);
    for (const r of rings) for (const p of r) {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    }
    return rings;
  });
  if (!Number.isFinite(x0) || x1 <= x0 || y1 <= y0) return null;

  const target = opts.targetCells || TARGET_CELLS;
  const cell = Math.min(MAX_CELL_FT, Math.max(MIN_CELL_FT, Math.sqrt(((x1 - x0) * (y1 - y0)) / target)));
  const pad = Math.max(2, Math.ceil(sb / cell) + 2);
  const gx0 = x0 - pad * cell, gy0 = y0 - pad * cell;
  const W = Math.ceil((x1 - x0) / cell) + 2 * pad, H = Math.ceil((y1 - y0) / cell) + 2 * pad;

  const mask = new Uint8Array(W * H);
  for (const rings of ringsByParcel) fillRings(mask, W, H, gx0, gy0, cell, rings);
  let siteCells = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) siteCells++;
  if (!siteCells) return null;

  const dist = distanceField(mask, W, H);
  // A cell centre d cells from the nearest outside centre sits about (d - 0.5) cells inside the boundary; half a cell
  // is the unbiased correction, and keeps a zero setback returning the whole site.
  const level = sb / cell + 0.5;
  let envCells = 0, maxDist = 0;
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] >= level) envCells++;
    if (mask[i] && dist[i] > maxDist) maxDist = dist[i];
  }
  const cellSf = cell * cell;
  const rings = envCells ? contours(dist, W, H, level, gx0, gy0, cell) : [];
  return {
    plane,
    cellFt: cell,
    grid: { W, H, x0: gx0, y0: gy0 },
    siteSf: siteCells * cellSf,
    geometrySf: agg.sqft,
    envelopeSf: envCells * cellSf,
    ratio: envCells / siteCells,
    rings,
    ringsLngLat: rings.map(r => { const ll = r.map(plane.toLngLat); return ll.concat([ll[0]]); }),
    unionRings: contours(dist, W, H, 0.5, gx0, gy0, cell),
    maxInsetFt: Math.max(0, (maxDist - 0.5) * cell),
    setbackFt: sb
  };
}

// Share of the site left inside the envelope (0..1), or null when there is nothing to measure.
export function setbackRatio(parcels, setbackFt) {
  const env = buildEnvelope(parcels, setbackFt);
  return env ? env.ratio : null;
}
