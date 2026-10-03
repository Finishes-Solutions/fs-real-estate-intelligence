// Flight path helpers shared by the map (src/planes.js, src/flightpath3d.js) and the tests.
//   smoothPath   ADS-B trace points -> a smooth curve (centripetal Catmull-Rom through them), so the drawn path has no
//                corners where reports are far apart, and no tiny zig-zags where they are close together.
//   altColor     altitude (ft) -> colour, on the same scale as the aircraft icons (grey ground, orange low, yellow
//                climbing, blue mid, green cruise), blended between bands so a climb reads as a gradient.
export const ALT_STOPS = [[0, '#8d9598'], [600, '#e3622b'], [4500, '#eda100'], [14000, '#3987e5'], [28000, '#1f9249']];
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const RGB = ALT_STOPS.map(([a, c]) => [a, hex(c)]);
export function altColor(ft) {
  const a = Math.max(0, +ft || 0);
  if (a >= RGB[RGB.length - 1][0]) return RGB[RGB.length - 1][1].slice();
  for (let i = 1; i < RGB.length; i++) if (a <= RGB[i][0]) {
    const [a0, c0] = RGB[i - 1], [a1, c1] = RGB[i], k = (a - a0) / (a1 - a0);
    return c0.map((v, j) => v + (c1[j] - v) * k);
  }
  return RGB[0][1].slice();
}
// the same scale as a MapLibre expression, for the 2D line on the map
export const altColorExpr = ['interpolate', ['linear'], ['get', 'alt'], ...ALT_STOPS.flat()];
// and as a CSS gradient over 0..maxFt, for the legend
export const altGradient = (maxFt = 35000) => 'linear-gradient(90deg,' + Array.from({ length: 8 }, (_, i) => { const c = altColor(maxFt * i / 7).map(v => Math.round(v * 255)); return 'rgb(' + c.join(',') + ') ' + Math.round(i / 7 * 100) + '%'; }).join(',') + ')';

// pts: [[lon, lat, alt_ft, ...], ...] -> [[lon, lat, alt_ft], ...]
// Points closer than `minGap` metres are merged (GPS noise on the ground and in slow turns), then each gap gets
// ~one point per `step` metres along the curve (at most 12 per gap, and the step grows to keep the total near `max`).
export function smoothPath(pts, { minGap = 40, step = 220, max = 3000 } = {}) {
  if (!pts || pts.length < 2) return (pts || []).map(p => [p[0], p[1], p[2] || 0]);
  const R = Math.PI / 180, lat0 = pts[0][1], kx = Math.cos(lat0 * R) * 111320, ky = 110540;
  // local metres, longitudes unwrapped across the date line
  const P = []; let lonPrev = pts[0][0];
  for (const p of pts) {
    let lon = p[0]; while (lon - lonPrev > 180) lon -= 360; while (lon - lonPrev < -180) lon += 360; lonPrev = lon;
    const q = [(lon - pts[0][0]) * kx, (p[1] - lat0) * ky, Math.max(0, +p[2] || 0)];
    const last = P[P.length - 1];
    if (last && Math.hypot(q[0] - last[0], q[1] - last[1]) < minGap && P.length > 1) { last[2] = q[2]; continue; }
    P.push(q);
  }
  if (P.length < 2) return pts.slice(-1).map(p => [p[0], p[1], p[2] || 0]);
  let total = 0; for (let i = 1; i < P.length; i++) total += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  const st = Math.max(step, total / max), out = [];
  const ext = (a, b) => [2 * a[0] - b[0], 2 * a[1] - b[1], a[2]]; // phantom end points keep the curve straight at the ends
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = i ? P[i - 1] : ext(P[0], P[1]), p1 = P[i], p2 = P[i + 1], p3 = i + 2 < P.length ? P[i + 2] : ext(P[i + 1], P[i]);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), n = Math.max(1, Math.min(12, Math.ceil(len / st)));
    // centripetal parameterisation (alpha 0.5): no loops or overshoot at uneven spacing
    const tj = (a, b) => Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1]) ** .5);
    const t0 = 0, t1 = t0 + tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    for (let s = 0; s < n; s++) {
      const t = t1 + (t2 - t1) * s / n, c = [0, 1, 2].map(j => {
        const A1 = (t1 - t) / (t1 - t0) * p0[j] + (t - t0) / (t1 - t0) * p1[j], A2 = (t2 - t) / (t2 - t1) * p1[j] + (t - t1) / (t2 - t1) * p2[j], A3 = (t3 - t) / (t3 - t2) * p2[j] + (t - t2) / (t3 - t2) * p3[j];
        const B1 = (t2 - t) / (t2 - t0) * A1 + (t - t0) / (t2 - t0) * A2, B2 = (t3 - t) / (t3 - t1) * A2 + (t - t1) / (t3 - t1) * A3;
        return (t2 - t) / (t2 - t1) * B1 + (t - t1) / (t2 - t1) * B2;
      });
      // altitude: linear between reports (a spline would overshoot level-offs); position: the curve
      c[2] = p1[2] + (p2[2] - p1[2]) * s / n;
      out.push(c);
    }
  }
  out.push(P[P.length - 1].slice());
  return out.map(([x, y, a]) => [pts[0][0] + x / kx, lat0 + y / ky, Math.max(0, a)]);
}
