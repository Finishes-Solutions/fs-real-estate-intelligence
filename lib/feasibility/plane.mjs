// @ts-check
// Ported from fs-cre-report-runner lib/v2/site/geometry.js (matthew/nifty-mendel-hc0iwc @ 35c1fe4).
// Only what lib/feasibility/envelope.mjs and lib/feasibility/survey.mjs need: the local plane in feet, ring area with
// holes, centroids and collection area. The source's half-plane inset (offsetRingFt) and rectangle clip
// (clipRectToRing) were dead code there and are not carried over; the frontage helpers are not needed here.
// One change from the source: ringCentroid works relative to the ring's first vertex, so a centroid taken on raw
// lon/lat keeps its precision (the products cancel and lose feet otherwise). Areas are unchanged.
//
// Parcel polygons arrive as WGS84 lon/lat. Degrees are not a length unit, so every measurement happens on a local
// plane in feet built at the site's own latitude from the WGS84 degree-length series (the same series as
// lib/siteplan.mjs `frame`, with its two smallest terms kept). Over a parcel-sized extent (under about a mile) the
// residual distortion is far below 0.1%. Treating degrees as square instead is wrong by cos(latitude): 13% in area
// at 29.7°N.
//
// DOM-free and dependency-free: loaded by Node and by the browser.

export const FT_PER_M = 3.280839895;
export const SQFT_PER_ACRE = 43560;

// Metres per degree of latitude and longitude at a latitude (WGS84 series).
export function degreeLengths(latDeg) {
  const p = latDeg * Math.PI / 180;
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p) - 0.0023 * Math.cos(6 * p),
    lon: 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p)
  };
}

// Local tangent plane in FEET anchored at (lng0, lat0): +x east, +y north.
// { origin, toFt([lng, lat]) -> [x, y], toLngLat([x, y]) -> [lng, lat] }
export function planeAt(lng0, lat0) {
  const d = degreeLengths(lat0), fx = d.lon * FT_PER_M, fy = d.lat * FT_PER_M;
  return {
    origin: [lng0, lat0],
    toFt: p => [(p[0] - lng0) * fx, (p[1] - lat0) * fy],
    toLngLat: q => [lng0 + q[0] / fx, lat0 + q[1] / fy]
  };
}

// ---------- rings ----------
const isRing = r => Array.isArray(r) && r.length >= 3 && Array.isArray(r[0]);

// The polygons of a Polygon / MultiPolygon (or a Feature carrying one), as arrays of rings.
function polygonsOf(geom) {
  const g = geom && geom.type === 'Feature' ? geom.geometry : geom;
  if (!g) return [];
  if (g.type === 'Polygon') return [g.coordinates || []];
  if (g.type === 'MultiPolygon') return g.coordinates || [];
  return [];
}
// Every outer ring (holes are handled separately).
export const outerRings = geom => polygonsOf(geom).map(poly => (poly || [])[0]).filter(isRing);
// Every inner ring (hole) across the geometry.
export const holeRings = geom => polygonsOf(geom).flatMap(poly => (poly || []).slice(1).filter(isRing));

// Signed area of a planar ring, open or closed (positive = counter-clockwise).
export function signedArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return a / 2;
}

// Planar centroid of a ring, computed relative to its first vertex; the vertex mean on a degenerate ring.
export function ringCentroid(ring) {
  const ox = ring[0][0], oy = ring[0][1];
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0] - ox, yi = ring[i][1] - oy, xj = ring[j][0] - ox, yj = ring[j][1] - oy, f = xj * yi - xi * yj;
    a += f; cx += (xj + xi) * f; cy += (yj + yi) * f;
  }
  if (Math.abs(a) < 1e-18) {
    const s = ring.reduce((t, p) => [t[0] + p[0], t[1] + p[1]], [0, 0]);
    return [s[0] / ring.length, s[1] / ring.length];
  }
  return [ox + cx / (3 * a), oy + cy / (3 * a)];
}

// Centroid of a whole geometry in its own units (lon/lat in, lon/lat out), area-weighted across outer rings.
export function geometryCentroid(geom) {
  const rings = outerRings(geom);
  if (!rings.length) return null;
  let wx = 0, wy = 0, ws = 0;
  for (const r of rings) {
    const w = Math.abs(signedArea(r.map(p => [p[0] - r[0][0], p[1] - r[0][1]]))), c = ringCentroid(r);
    wx += c[0] * w; wy += c[1] * w; ws += w;
  }
  return ws > 0 ? [wx / ws, wy / ws] : ringCentroid(rings[0]);
}

// Drop repeated vertices and the closing vertex.
export function dedupe(ring) {
  const out = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 1e-9 || Math.abs(last[1] - p[1]) > 1e-9) out.push(p);
  }
  if (out.length > 1) {
    const f = out[0], l = out[out.length - 1];
    if (Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) out.pop();
  }
  return out;
}

// ---------- area ----------
// Area in square feet on the local plane (the geometry's own centroid unless a plane is given). Outer rings add,
// holes subtract: a parcel with a carve-out must not be measured as if it were whole.
export function areaSqFt(geom, plane) {
  const rings = outerRings(geom);
  if (!rings.length) return 0;
  const p = plane || planeAt(...geometryCentroid(geom));
  const add = rings.reduce((t, r) => t + Math.abs(signedArea(r.map(p.toFt))), 0);
  const sub = holeRings(geom).reduce((t, r) => t + Math.abs(signedArea(r.map(p.toFt))), 0);
  return Math.max(0, add - sub);
}

// Total area across a list of features (or bare geometries) on one shared plane.
// { sqft, acres, plane, parcels, centroid }
export function collectionAreaSqFt(features) {
  const geoms = (features || []).map(f => f && f.type === 'Feature' ? f.geometry : f).filter(g => outerRings(g).length);
  if (!geoms.length) return { sqft: 0, acres: 0, plane: null, parcels: 0, centroid: null };
  const c = geometryCentroid({ type: 'MultiPolygon', coordinates: geoms.flatMap(polygonsOf) });
  const plane = planeAt(c[0], c[1]);
  const sqft = geoms.reduce((t, g) => t + areaSqFt(g, plane), 0);
  return { sqft, acres: sqft / SQFT_PER_ACRE, plane, parcels: geoms.length, centroid: c };
}
