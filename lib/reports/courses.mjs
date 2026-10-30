// A parcel outline as a surveyor would read it: straight courses and curves between real corners, not every point of the
// county's digitized line. Rural outlines are traced along creeks and roads with hundreds of points a few feet apart
// (2481 Happy Hollow Rd, Sevier County TN: 772 points), which listed as hundreds of 2 ft "courses" and buried the map's
// corners. The outline is first thinned (Douglas–Peucker: no point moves more than `tol` ft), then runs of short lines
// bending the same way are read as one curve: chord bearing and length, arc length, radius and central angle.
// The full outline is untouched (it is drawn as is, and exported whole as GeoJSON); this only decides what is listed.
//   boundaryCourses(ring [[x, y] ft], { tol, maxCourses }) -> { corners: [[x, y]], courses: [{ type: 'line'|'curve', from,
//     to, a, b, len, brg, arc?, radius?, delta?, turn?: 'right'|'left', pts? }] }   (corners numbered from 1)
import { bearing } from './plain.mjs';

const d2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const offLine = (p, a, b) => { const L = d2(a, b); return L < 1e-9 ? d2(p, a) : Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L; };
// Douglas–Peucker over pts[i..j] (open): the indices kept
function dp(pts, i, j, tol, keep) {
  let far = -1, fd = tol; for (let k = i + 1; k < j; k++) { const d = offLine(pts[k], pts[i], pts[j]); if (d > fd) { fd = d; far = k; } }
  if (far < 0) return; keep.add(far); dp(pts, i, far, tol, keep); dp(pts, far, j, tol, keep);
}
// the indices of a closed ring (no repeated last point) that survive thinning. Only densely traced stretches are thinned:
// a point at the end of a line `keepLen` ft or longer is a corner of the deed's own (a county's clean outline keeps every
// corner, however slight the bend); between such corners, points within `tol` of a straight line go.
export function thinRing(ring, tol, { keepLen = 30 } = {}) {
  const n = ring.length; if (n <= 4) return ring.map((_, i) => i);
  const long = i => d2(ring[i], ring[(i + 1) % n]) >= keepLen, forced = []; for (let i = 0; i < n; i++) if (long(i) || long((i - 1 + n) % n)) forced.push(i);
  if (forced.length < 2) { // all of it densely traced: start at the sharpest corner and its farthest point
    const turn = i => { const a = ring[(i - 1 + n) % n], b = ring[i], c = ring[(i + 1) % n], u = Math.atan2(b[1] - a[1], b[0] - a[0]), v = Math.atan2(c[1] - b[1], c[0] - b[0]); let t = Math.abs(v - u); if (t > Math.PI) t = 2 * Math.PI - t; return t; };
    let s = 0; for (let i = 1; i < n; i++) if (turn(i) > turn(s)) s = i;
    let far = s; for (let i = 0; i < n; i++) if (d2(ring[i], ring[s]) > d2(ring[far], ring[s])) far = i;
    forced.length = 0; forced.push(...[s, far].sort((a, b) => a - b));
  }
  const keep = new Set(forced);
  for (let k = 0; k < forced.length; k++) { const i = forced[k], j = k + 1 < forced.length ? forced[k + 1] : forced[0] + n; if (j - i < 2) continue;
    const run = []; for (let q = i; q <= j; q++) run.push(ring[q % n]); const sub = new Set(); dp(run, 0, run.length - 1, tol, sub); for (const q of sub) keep.add((i + q) % n); }
  return [...keep].sort((a, b) => a - b);
}
// the circle through three points: radius (Infinity when they are in line)
const radius3 = (a, b, c) => { const A = d2(b, c), B = d2(a, c), Cc = d2(a, b), s2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])); return s2 < 1e-9 ? Infinity : A * B * Cc / (2 * s2); };

export function boundaryCourses(ring, { tol = 1, maxCourses = 40, curveMaxTurn = 30, curveMaxLen = 250 } = {}) {
  const n = ring.length; if (n < 3) return { corners: ring.slice(), courses: [] };
  for (let t = tol; ; t *= 1.6) {
    const idx = thinRing(ring, t), m = idx.length, seg = [];
    for (let k = 0; k < m; k++) { const i = idx[k], j = idx[(k + 1) % m], a = ring[i], b = ring[j]; seg.push({ i, j, a, b, len: d2(a, b), dir: Math.atan2(b[1] - a[1], b[0] - a[0]) }); }
    // the turn from one thinned line to the next (signed, radians)
    const turnAt = k => { let t1 = seg[(k + 1) % m].dir - seg[k].dir; while (t1 > Math.PI) t1 -= 2 * Math.PI; while (t1 < -Math.PI) t1 += 2 * Math.PI; return t1; };
    const soft = k => Math.abs(turnAt(k)) < curveMaxTurn * Math.PI / 180 && Math.abs(turnAt(k)) > 0.2 * Math.PI / 180 && seg[k].len < curveMaxLen && seg[(k + 1) % m].len < curveMaxLen;
    // start at a hard corner (a turn that isn't part of a curve), so no curve is cut in two
    let s0 = 0; while (s0 < m && soft((s0 - 1 + m) % m)) s0++; if (s0 >= m) s0 = 0;
    const runs = []; let cur = [];
    for (let q = 0; q < m; q++) { const k = (s0 + q) % m; cur.push(k); const last = q === m - 1;
      if (last || !soft(k) || (cur.length > 1 && Math.sign(turnAt(k)) !== Math.sign(turnAt(cur[cur.length - 2])))) { runs.push(cur); cur = []; } }
    // a run of three or more short lines turning one way is a curve; anything else stays as lines
    const out = [];
    for (const r of runs) {
      if (r.length >= 3) { const a = seg[r[0]].a, b = seg[r[r.length - 1]].b, pts = [a, ...r.map(k => seg[k].b)], arc = r.reduce((s, k) => s + seg[k].len, 0), mid = pts[Math.floor(pts.length / 2)];
        const R = radius3(a, mid, b), chord = d2(a, b), delta = Number.isFinite(R) ? 2 * Math.asin(Math.min(1, chord / (2 * R))) * 180 / Math.PI : 0;
        out.push({ type: 'curve', a, b, len: chord, brg: bearing(a, b), arc, radius: R, delta: arc > Math.PI * R ? 360 - delta : delta, turn: turnAt(r[0]) < 0 ? 'right' : 'left', pts }); }
      else for (const k of r) out.push({ type: 'line', a: seg[k].a, b: seg[k].b, len: seg[k].len, brg: bearing(seg[k].a, seg[k].b) });
    }
    if (out.length <= maxCourses || m <= 4) { const corners = out.map(c => c.a); out.forEach((c, k) => { c.from = k + 1; c.to = (k + 1) % out.length + 1; }); return { corners, courses: out, tol: t }; }
  }
}
