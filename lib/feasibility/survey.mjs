// Ported from fs-cre-report-runner api/_survey.js (matthew/nifty-mendel-hc0iwc @ 35c1fe4).
// FIX: the source placed the traverse on the map with a flat FT_PER_DEG_LAT = 364000 (and 364000 * cos(lat) for
// longitude), which is about 0.1% short in latitude and 0.4% short in longitude at Texas latitudes, so the drawn
// polygon measured about 0.5% larger than the survey. Placement now goes through the WGS84 local plane
// (lib/feasibility/plane.mjs toLngLat), so the placed polygon measures the same area as the traverse.
// Other changes: the closure tolerance is configurable (default 1:10,000, at least 0.5 ft; the source allowed
// 1:2,000, at least 1 ft) and the precision (1:N) is reported; curve calls are detected and refused explicitly.
//
// A boundary survey's metes and bounds are the authoritative boundary; appraisal-district parcel lines can be off by
// feet to tens of feet. A survey has shape, size and bearings but no coordinates, so:
//   survey: {
//     calls:  ["N42°00'00\"E 160.00", "S28°53'49\"E 450.00", ...]   or [{ bearing, dist }], or one string split on
//             newlines / semicolons: a closed traverse from the point of beginning, distances in feet
//     source: who surveyed it and when (carried through for display)
//     legal:  the legal description (optional, carried through)
//     anchor: { lat, lon }   optional: where the point of beginning goes
//   }
// With an anchor the point of beginning goes there. Without one, the surveyed polygon is centred on the provider's
// polygon for the same parcel(s): the provider gets the LOCATION right far more reliably than the exact lines.
// Bearings are applied as written (the survey's basis of bearings is taken as grid north); area and dimensions do
// not depend on placement at all.
//
// Curves (arc, radius, chord, delta) are not supported yet: a call list with one is refused rather than drawn wrong.
//
// DOM-free and dependency-free: loaded by Node and by the browser.

import { planeAt, signedArea, ringCentroid, geometryCentroid, areaSqFt, SQFT_PER_ACRE } from './plane.mjs';

export const DEFAULT_CLOSURE_RATIO = 10000;   // 1:10,000
export const MIN_CLOSURE_FT = 0.5;
const CURVE = /\b(curves?|arcs?|radius|radii|chords?)\b/i;

// "N42°00'00\"E", "N 42-00-00 E", "N42.5E", "S 15 10 39 W" -> azimuth in degrees (0 = north, clockwise), or null.
export function parseBearing(s) {
  const m = String(s ?? '').toUpperCase().replace(/[°º'’′"”″\-:]/g, ' ').match(/^\s*([NS])\s*([\d.]+)(?:\s+([\d.]+))?(?:\s+([\d.]+))?\s*([EW])\s*$/);
  if (!m) return null;
  const min = +(m[3] || 0), sec = +(m[4] || 0);
  if (!(min >= 0 && min < 60 && sec >= 0 && sec < 60)) return null;
  const a = +m[2] + min / 60 + sec / 3600;
  if (!(a >= 0 && a <= 90)) return null;
  if (m[1] === 'N') return m[5] === 'E' ? a : (360 - a) % 360;
  return m[5] === 'E' ? 180 - a : 180 + a;
}

// One call: "N42°00'00\"E 160.00" | "N42°00'00\"E, 160.00'" | { bearing, dist } -> { az, dist } or null.
export function parseCall(c) {
  if (c && typeof c === 'object') {
    const az = parseBearing(c.bearing), d = parseFloat(c.dist != null ? c.dist : c.distance);
    return az == null || !(d > 0) ? null : { az, dist: d };
  }
  const m = String(c ?? '').trim().match(/^(.*[EW])[\s,]+([\d.]+)\s*(?:'|’|ft\.?|feet)?\s*$/i);
  if (!m) return null;
  const az = parseBearing(m[1]), d = parseFloat(m[2]);
  return az == null || !(d > 0) ? null : { az, dist: d };
}

const callText = c => typeof c === 'string' ? c.trim() : JSON.stringify(c);
const isCurve = c => c && typeof c === 'object'
  ? ['radius', 'arc', 'chord', 'delta', 'curve', 'chordBearing', 'arcLength'].some(k => c[k] != null) || CURVE.test(String(c.type || '') + ' ' + String(c.bearing || ''))
  : CURVE.test(String(c ?? ''));

// { calls: [{ az, dist }], bad: [text], curves: [text] }
export function parseCalls(calls) {
  const list = Array.isArray(calls) ? calls : String(calls ?? '').split(/\r?\n|;/);
  const out = [], bad = [], curves = [];
  for (const c of list) {
    if (c == null || (typeof c === 'string' && !c.trim())) continue;
    if (isCurve(c)) { curves.push(callText(c)); continue; }
    const p = parseCall(c);
    if (p) out.push(p); else bad.push(callText(c));
  }
  return { calls: out, bad, curves };
}

// Traverse in plane feet (x east, y north) from the point of beginning at 0,0. The ring is closed on the point of
// beginning (the misclosure is reported, not hidden). { ring (closed), closureFt, perimeterFt, areaSf, precision }
export function traverse(calls) {
  let x = 0, y = 0, perim = 0;
  const pts = [[0, 0]];
  for (const c of calls) {
    const t = c.az * Math.PI / 180;
    x += c.dist * Math.sin(t); y += c.dist * Math.cos(t); perim += c.dist;
    pts.push([x, y]);
  }
  const closure = Math.hypot(x, y);
  pts[pts.length - 1] = [0, 0];
  return { ring: pts, closureFt: closure, perimeterFt: perim, areaSf: Math.abs(signedArea(pts)), precision: precisionOf(perim, closure) };
}

// Precision of a traverse as N in 1:N (Infinity when it closes exactly).
export const precisionOf = (perimeterFt, closureFt) => closureFt > 0 ? perimeterFt / closureFt : Infinity;
const precisionText = n => Number.isFinite(n) ? '1:' + Math.round(n).toLocaleString('en-US') : 'exact';

/**
 * Build the surveyed boundary.
 * @param survey   the survey object (or a JSON string of one)
 * @param provider the provider's geometry for the same parcel(s), lon/lat Polygon / MultiPolygon / Feature (optional,
 *                 used to place the survey when it has no anchor)
 * @param opts     options: closureRatio = 10000 (1:N), minClosureFt = 0.5
 * @returns {any} { geometry, areaSf, acres, placedAreaSf, perimeterFt, closureFt, precision, precisionText, toleranceFt,
 *          placedBy, source, legal, calls }, or { error } (plus closureFt / perimeterFt / precision / toleranceFt when
 *          the calls do not close)
 */
export function buildSurvey(survey, provider, opts = {}) {
  let s = survey;
  if (typeof s === 'string') { try { s = JSON.parse(s); } catch { return { error: 'survey is not valid JSON' }; } }
  if (!s || typeof s !== 'object') return { error: 'no survey' };
  const parsed = parseCalls(s.calls);
  if (parsed.curves.length) return { error: 'curve calls are not supported yet (only straight bearing + distance calls): ' + parsed.curves.join(' | ') };
  if (parsed.bad.length) return { error: 'unreadable survey call(s): ' + parsed.bad.join(' | ') };
  if (parsed.calls.length < 3) return { error: 'a survey needs at least 3 calls (bearing + distance)' };
  const tr = traverse(parsed.calls);

  // A survey that does not close is a typo, not a boundary: refuse it rather than draw a wrong site.
  const ratio = opts.closureRatio > 0 ? +opts.closureRatio : DEFAULT_CLOSURE_RATIO;
  const minFt = opts.minClosureFt >= 0 ? +opts.minClosureFt : MIN_CLOSURE_FT;
  const tol = Math.max(minFt, tr.perimeterFt / ratio);
  const closure = { closureFt: round(tr.closureFt, 3), perimeterFt: round(tr.perimeterFt, 2), precision: tr.precision, precisionText: precisionText(tr.precision), toleranceFt: round(tol, 3) };
  if (tr.closureFt > tol) {
    return { error: 'the survey calls do not close: misclosure ' + tr.closureFt.toFixed(2) + ' ft over ' + Math.round(tr.perimeterFt) + ' ft (precision ' + closure.precisionText + '; allowed ' + tol.toFixed(2) + ' ft, 1:' + ratio.toLocaleString('en-US') + ') — check the bearings and distances', ...closure };
  }
  if (!(tr.areaSf >= 1)) return { error: 'the survey calls enclose no area', ...closure };

  const a = s.anchor, anchor = a && a.lat != null && a.lon != null && Number.isFinite(+a.lat) && Number.isFinite(+a.lon) ? [+a.lon, +a.lat] : null;
  let placedBy, origin, off = [0, 0];
  if (anchor) {
    origin = anchor; placedBy = 'point of beginning at ' + anchor[1].toFixed(6) + ', ' + anchor[0].toFixed(6);
  } else {
    const c = provider ? geometryCentroid(provider) : null;
    if (!c || !c.every(Number.isFinite)) return { error: 'the survey cannot be placed on the map: no provider polygon for this parcel and no survey.anchor { lat, lon }', ...closure };
    const rc = ringCentroid(tr.ring.slice(0, -1));
    origin = c; off = [-rc[0], -rc[1]];
    placedBy = 'centred on the provider polygon for the same parcel';
  }
  const plane = planeAt(origin[0], origin[1]);
  const ring = tr.ring.map(p => plane.toLngLat([p[0] + off[0], p[1] + off[1]]).map(v => +v.toFixed(8)));
  if (signedArea(ring.map(p => [p[0] - ring[0][0], p[1] - ring[0][1]])) < 0) ring.reverse();   // GeoJSON outer rings run counter-clockwise
  const geometry = { type: 'Polygon', coordinates: [ring] };
  return {
    geometry,
    areaSf: Math.round(tr.areaSf),
    acres: round(tr.areaSf / SQFT_PER_ACRE, 4),
    placedAreaSf: Math.round(areaSqFt(geometry)),
    ...closure,
    placedBy,
    source: String(s.source || 'boundary survey').trim(),
    legal: String(s.legal || '').trim(),
    calls: parsed.calls.length
  };
}

const round = (v, dp) => Math.round(v * 10 ** dp) / 10 ** dp;
