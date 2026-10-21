// Neighbourhood streets laid out like real subdivisions (NEIGHBORHOOD-PLAN.md, phase 4a): a collector skeleton first (a
// loop road one lot band in from the lot lines, a main street up the middle, or a loop round a central lake and
// commons), the entry boulevard meeting it at a T; then each pod between the collectors gets its own local streets
// (curved, running with the pod, meeting the collectors at T's, cul-de-sacs and loop lanes where a street would
// dead-end); cross streets where a block runs long; then lots marched by distance along every street edge, each square
// to the street (wedges round the bulbs and on the outside of bends), homes turned to face it, a driveway to each.
// Many networks are tried and scored; what comes out is ordinary plan pieces (drives along paths, lots, homes,
// driveways), so the map, the sheet, the numbers, the checks and re-fits work as for any layout. The engine's own
// functions come in as T from lib/sitelayout.mjs (no import cycle). Typical street rules, or a place's rule sheet
// (phase 4b, lib/rulesheet.mjs: plan.params.code) with the plan's own over them (plan.params.streetRules). Planning
// sketch only: no grading, utilities or engineering.
import * as S from './siteplan.mjs';
import { HOUSE_PLANS, housePlansFor } from './buildings.mjs';
import polyclip from './vendor/polyclip.mjs';
import * as RS from './rulesheet.mjs';

// ---------- street rules (typical values: phase 4b reads the local code) ----------
// ft: pavement and right-of-way by street type; longest block and cul-de-sac; a bulb's pavement radius and its
// right-of-way; a knuckle's; the least spacing of two junctions on one street (and of T's on a collector); no lots or
// junctions the first stretch in from the entry; lots may front a collector; a bend tighter than curveMin gets a
// knuckle; a lot's front starts this far past a crossing right-of-way; the home's building line back from the right-of-way,
// the narrowest lot at its front and the smallest lot (0: as the home type needs), a second way in over this many homes
export const STREET_RULES = { local: { pave: 28, row: 50 }, collector: { pave: 36, row: 60 }, blockMax: 1400, blockMin: 300, culMax: 800, bulbR: 42, bulbRow: 50, knuckleR: 45, junctionMin: 125, collJunctionMin: 300, entryClear: 300, collFront: true, curveMin: 120, cornerClear: 10, frontBL: 20, sideBL: 0, minLotW: 0, minLotSf: 0, secondAt: 30 };
const num = (v, lo, hi, d) => Number.isFinite(+v) && v !== null && v !== '' ? Math.max(lo, Math.min(hi, +v)) : d;
const street0 = (o = {}, d, lo, hi) => { const pave = num(o.pave, lo, hi, d.pave); return { pave, row: Math.max(pave + 14, num(o.row, pave + 14, 120, d.row)) }; };
// the rules a plan's streets follow: the typical ones, with the plan's own (Settings, phase 4b's rule sheet) over them,
// each held to a sane range
// (a rule sheet's, plan.params.code, under the plan's own: per key, the local and collector widths per key too)
export const streetRules = plan => { const c = plan?.params?.code?.streetRules || {}, h = plan?.params?.streetRules || {}, D = STREET_RULES, o = { ...c, ...h, local: { ...(c.local || {}), ...(h.local || {}) }, collector: { ...(c.collector || {}), ...(h.collector || {}) } };
  return { local: street0(o.local, D.local, 20, 40), collector: street0(o.collector, D.collector, 24, 48), blockMax: num(o.blockMax, 600, 3000, D.blockMax), blockMin: num(o.blockMin, 100, 1000, D.blockMin), culMax: num(o.culMax, 300, 1500, D.culMax), bulbR: num(o.bulbR, 35, 60, D.bulbR), bulbRow: num(o.bulbRow, 40, 75, D.bulbRow), knuckleR: num(o.knuckleR, 35, 70, D.knuckleR), junctionMin: num(o.junctionMin, 60, 400, D.junctionMin), collJunctionMin: num(o.collJunctionMin, 100, 1000, D.collJunctionMin), entryClear: num(o.entryClear, 0, 600, D.entryClear), collFront: o.collFront !== false, curveMin: num(o.curveMin, 60, 400, D.curveMin), cornerClear: num(o.cornerClear, 0, 40, D.cornerClear), frontBL: num(o.frontBL, 0, 100, D.frontBL), sideBL: num(o.sideBL, 0, 60, D.sideBL), strict: !!plan?.params?.code?.streetRules, minLotW: num(o.minLotW, 0, 200, D.minLotW), minLotSf: num(o.minLotSf, 0, 87120, D.minLotSf), secondAt: num(o.secondAt, 10, 2000, D.secondAt) }; };

// ---------- geometry ----------
const AC = 43560, BIG = 1e5, dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]), fit = v => +v.toFixed(2), uid = p => p + Math.random().toString(36).slice(2, 8);
const ccw = r => S.signedArea(r) >= 0 ? r : r.slice().reverse(), close = r => r.concat([r[0]]), area = r => S.ringArea(r);
const ringsOf = mp => mp.filter(pg => pg[0]?.length >= 4).map(pg => ccw(S.tidyRing(pg[0].slice(0, -1), 0.5))).filter(r => r.length >= 3 && area(r) > 1);
const clip = (a, b) => { try { return ringsOf(polyclip.intersection([close(ccw(a))], [close(ccw(b))])); } catch { return []; } };
const minus = (a, cuts) => { if (!cuts.length) return [ccw(a)]; try { return ringsOf(polyclip.difference([close(ccw(a))], ...cuts.map(c => [close(ccw(c))]))); } catch { return []; } };
const bbox = pts => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, y] of pts) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; } return [a, b, c, d]; };
const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const toPoly = (p, r) => r.reduce((m, a, i) => Math.min(m, S.segDist(p, a, r[(i + 1) % r.length])), Infinity);
const unit = v => { const L = Math.hypot(v[0], v[1]) || 1; return [v[0] / L, v[1] / L]; }, add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const lenOf = P => P.reduce((t, q, i) => i ? t + dist(q, P[i - 1]) : 0, 0);
// a path with a point every `step` ft
export const dens = (P, step = 10, closed = false) => { const out = [], n = P.length; for (let i = 0; i < (closed ? n : n - 1); i++) { const a = P[i], b = P[(i + 1) % n], m = Math.max(1, Math.ceil(dist(a, b) / step)); for (let j = 0; j < m; j++) out.push([a[0] + (b[0] - a[0]) * j / m, a[1] + (b[1] - a[1]) * j / m]); } if (!closed) out.push(P[n - 1]); return out; };
// a path measured: its point and unit tangent at arc length s, and a smoother tangent (the chord over ±12 ft)
export function measured(P) {
  const c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + dist(P[i], P[i - 1]));
  const L = c[c.length - 1], at = s => { s = Math.max(0, Math.min(L, s)); let lo = 0, hi = c.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; } const a = P[lo], b = P[hi], l = c[hi] - c[lo] || 1, t = (s - c[lo]) / l; return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], u: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] }; };
  const tan = s => unit([at(s + 12).p[0] - at(s - 12).p[0], at(s + 12).p[1] - at(s - 12).p[1]]);
  const proj = q => { let best = null; for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], l = c[i] - c[i - 1] || 1, t = Math.max(0, Math.min(1, ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / (l * l))), x = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], d = dist(q, x); if (!best || d < best.d) best = { d, s: c[i - 1] + t * l, p: x }; } return best; };
  return { P, c, L, at, tan, proj };
}
// where segments ab and cd cross: t along ab, or null
const X = (a, b, c, d) => { const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-12) return null; const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den; return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null; };
// the pieces of a path inside a ring (crossings found exactly)
export function clipPath(P, ring) {
  const out = []; let cur = null; const n = ring.length, rb = bbox(ring);
  for (let i = 0; i < P.length; i++) {
    const p = P[i], ins = p[0] >= rb[0] && p[0] <= rb[2] && p[1] >= rb[1] && p[1] <= rb[3] && S.inRing(p, ring);
    if (i > 0) { const a = P[i - 1], ts = []; for (let k = 0; k < n; k++) { const t = X(a, p, ring[k], ring[(k + 1) % n]); if (t != null) ts.push(t); } ts.sort((x, y) => x - y);
      for (const t of ts) { const q = [a[0] + (p[0] - a[0]) * t, a[1] + (p[1] - a[1]) * t]; if (cur) { cur.push(q); out.push(cur); cur = null; } else cur = [q]; } }
    if (ins) { if (!cur) cur = [p]; else cur.push(p); }
  }
  if (cur && cur.length > 1) out.push(cur);
  return out.filter(q => lenOf(q) > 1);
}
// the first crossing of a ray (p along unit d, up to `far` ft) with a ring: { t, k (the edge), q } or null
const rayHit = (ring, p, d, far = BIG) => { let best = null; const q1 = add(p, d, far); for (let k = 0; k < ring.length; k++) { const t = X(p, q1, ring[k], ring[(k + 1) % ring.length]); if (t != null && t * far > 1e-6 && (!best || t < best.t)) best = { t, k }; } return best ? { t: best.t * far, k: best.k, q: add(p, d, best.t * far) } : null; };
// an open path moved sideways by d (left of its way, vertex normals); the loops a tight inside bend makes dropped
export function offsetPath(P, d) {
  const n = P.length, nrm = i => { const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], u = unit([b[0] - a[0], b[1] - a[1]]); return [-u[1], u[0]]; }, out = P.map((p, i) => add(p, nrm(i), d));
  return out.filter((q, i) => i === 0 || i === n - 1 || dot([P[i + 1][0] - P[i - 1][0], P[i + 1][1] - P[i - 1][1]], [out[i + 1][0] - out[i - 1][0], out[i + 1][1] - out[i - 1][1]]) > 0);
}
// a closed outline offset inward by d (per edge, or one number), cleaned and rounded at r: one ring, else null
export function loopIn(ring, d, r) {
  const ds = Array.isArray(d) ? d : ring.map(() => d), q = S.insetRing(ccw(ring), ds); if (q.length < 3 || area(q) < 1000) return null;
  const c = clip(q, ring); if (c.length !== 1 || Math.abs(area(c[0]) - area(q)) > area(q) * 0.02) return null;
  return dens(S.fillet(S.tidyRing(c[0], 2), r, true), 10, true);
}
// a family of concentric arcs (bow: sagitta as a share of the span, signed) or parallel lines across a ring, running at
// th (deg), spaced P, the first d0 in from the ring's edge across: [{ y, path }]. Concentric (radius Rg − y), so the
// spacing holds all the way along; a translated copy of one arc wouldn't keep it
export function arcFamily(ring, th, bow, d0, P, ok = null, cache = null, wave = 0) {
  const a = th * Math.PI / 180, u = [Math.cos(a), Math.sin(a)], v = [-u[1], u[0]], c = S.centroid(ring), q = ring.map(p => [dot([p[0] - c[0], p[1] - c[1]], u), dot([p[0] - c[0], p[1] - c[1]], v)]), b = bbox(q), Lx = b[2] - b[0] + 400, out = [];
  const from = ([x, y]) => [c[0] + u[0] * x + v[0] * y, c[1] + u[1] * x + v[1] * y], sag = bow * Lx, sg = Math.sign(sag) || 1, Rg = Math.abs(sag) > 1 ? Lx * Lx / (8 * Math.abs(sag)) + Math.abs(sag) / 2 : 0, x0 = (b[0] + b[2]) / 2;
  // (an arc of radius Rg about O = [x0, y − sg·Rg], its middle at the middle of the span: y measured there)
  // (wave: a gentle meander along it as well, the same for every street of the family, so the spacing holds)
  const lam = Math.max(700, Math.min(1100, Lx / 3)), wv = ([x, y]) => wave ? [x, y + wave * Math.sin(2 * Math.PI * (x - b[0]) / lam)] : [x, y];
  const arcAt = y => { if (!Rg) return dens([[b[0] - 200, y], [b[2] + 200, y]], 20).map(wv); const O = [x0, y - sg * Rg], half = Math.min(Math.PI / 2, Math.asin(Math.min(1, (Lx / 2 + 200) / Rg))), pts = []; for (let k = 0; k <= 160; k++) { const t = -half + 2 * half * k / 160; pts.push(wv([O[0] + Rg * Math.sin(t), O[1] + sg * Rg * Math.cos(t)])); } return pts; };
  // where streets may run across (ok: far enough in): the first at its near edge, d0 on from there (d0 < 0: that share of
  // the slack left at the far edge, put at the near one)
  let y0 = b[1], y1 = b[3]; if (ok) { const key = th.toFixed(2) + '|' + bow + '|' + wave, got = cache?.get(key) || (() => { const has = y => dens(arcAt(y), 25).some(p => ok(from(p))); let lo = null, hi = null; for (let y = b[1] - Math.abs(sag) - wave; y <= b[3] + Math.abs(sag) + wave; y += 24) if (has(y)) { lo ??= y; hi = y; } if (lo == null) return [lo, hi]; let a0 = lo; for (let y = lo - 6; y > lo - 24; y -= 6) if (has(y)) a0 = y; let a1 = hi; for (let y = hi + 6; y < hi + 24; y += 6) if (has(y)) a1 = y; return [a0, a1]; })(); cache?.set(key, got); if (got[0] == null) return []; [y0, y1] = got; } // (every 24 ft, then its ends to 6)
  for (let y = y0 + (ok ? (d0 < 0 ? ((y1 - y0) % P) * -d0 : d0) : d0); y <= y1 + 1; y += P) out.push({ y, path: dens(arcAt(y).map(from), 10) });
  return out;
}
// a cubic from a to b leaving a along ta and arriving at b along -tb (a U bend joining two street ends)
const bend = (a, ta, b, tb, h) => { const p1 = add(a, ta, h), p2 = add(b, tb, h), out = []; for (let k = 0; k <= 24; k++) { const t = k / 24, m = 1 - t; out.push([m * m * m * a[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * b[0], m * m * m * a[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * b[1]]); } return out; };
// a path without the slivers a cut or a T's stub leaves (a point within 4 ft of the one kept before it: a kink over a few
// feet folds the street's outline, and drawing a folded one is slow)
const tidyPath = P => { const out = [P[0]]; for (let i = 1; i < P.length - 1; i++) if (dist(P[i], out[out.length - 1]) >= 4 && dist(P[i], P[P.length - 1]) >= 4) out.push(P[i]); out.push(P[P.length - 1]); return out; };
// a path's middle point (a street's label spot, as the collectors' are)
const pathMid = P => { const m = measured(P); return m.at(m.L / 2).p.map(fit); };
const xyOf = pts => { const b = bbox(pts); return { w: fit(b[2] - b[0]), d: fit(b[3] - b[1]), rot: 0 }; };
// the greatest change of heading along a path (radians), and the share of its length that turns (≥ 4° over the path)
const turnOf = P => { let t = 0; for (let i = 1; i + 1 < P.length; i++) { const a = Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0]), c = Math.atan2(P[i + 1][1] - P[i][1], P[i + 1][0] - P[i][0]); t += Math.abs(((c - a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI); } return t; };
// how near a street comes back on itself: for each point (every 15 ft) the nearest other point farther than 1.7·X along
// it (past the bend between them) { Q, j, d }, the least such distance, and the share of points with one nearer than X
function across(P, closed, X) {
  const Q = dens(P, 15, closed), n = Q.length, c = [0]; for (let i = 1; i < n; i++) c.push(c[i - 1] + dist(Q[i], Q[i - 1])); const T = c[n - 1] + (closed ? dist(Q[n - 1], Q[0]) : 0), gap = 1.7 * X, G = S.gridIndex([], g => g.b, 60);
  Q.forEach((q, i) => G.add(i, [q[0], q[1], q[0], q[1]])); const J = new Int32Array(n).fill(-1), D = new Float64Array(n).fill(Infinity); let min = Infinity, thin = 0;
  for (let i = 0; i < n; i++) { for (const j of G.near(Q[i][0] - X, Q[i][1] - X, Q[i][0] + X, Q[i][1] + X)) { let s = Math.abs(c[j] - c[i]); if (closed) s = Math.min(s, T - s); const d = dist(Q[i], Q[j]); if (s > gap && d < D[i]) { D[i] = d; J[i] = j; } } if (D[i] < X) thin++; min = Math.min(min, D[i]); }
  return { Q, J, D, min, thin: thin / Math.max(1, n) };
}
// a thin loop (a level line round a strip too narrow for lots between its sides) as one street up its middle: its sides
// averaged point by point across, carried on to the ends of the strip while far enough in; an open path, or null
function midline(P, X, ok) {
  const { Q, J, D } = across(P, true, X), n = Q.length, th = i => D[(i + n) % n] < X; let s0 = 0; while (s0 < n && th(s0)) s0++; if (s0 >= n) return null;
  let best = null; for (let k = 0, cur = null; k <= n; k++) { const i = (s0 + k) % n; if (k < n && th(i)) (cur ||= []).push(i); else if (cur) { if (!best || cur.length > best.length) best = cur; cur = null; } }
  if (!best || best.length < 12) return null; let M = dpOpen(smoothOpen(best.map(i => [(Q[i][0] + Q[J[i]][0]) / 2, (Q[i][1] + Q[J[i]][1]) / 2])), 6); // (the points across pair up unevenly: simplified, so no kinks)
  for (const k of [0, 1]) { const a = k ? M[M.length - 2] : M[1], e = k ? M[M.length - 1] : M[0], t = unit([e[0] - a[0], e[1] - a[1]]), w = D[best[k ? best.length - 1 : 0]]; let L = 0; for (let s = 10; s <= w / 2 + 40; s += 10) { if (!ok(add(e, t, s))) break; L = s; } if (L) { const q = add(e, t, L); M = k ? M.slice(0, -1).concat([e, q]) : [q, e].concat(M.slice(1)); } }
  M = dens(S.fillet(M, 140), 10); return lenOf(M) >= 250 ? M : null;
}
// an open street without the hooks a level line makes at its ends near a corner (turning more than 25° in its last 80
// ft: a bend no car takes at speed, and one too tight for its own pavement): cut back to before the turn
function unhook(P) {
  let m = measured(P); if (m.L < 300) return P; const cut = k => { const ref = k ? m.tan(m.L - 80) : m.tan(80); for (let d = 80; d >= 0; d -= 5) { const s = k ? m.L - d : d; if (dot(m.tan(s), ref) < 0.906) return k ? s - 5 : s + 5; } return null; };
  const b = cut(1); if (b != null) { P = P.filter((q, i) => m.c[i] < b).concat([m.at(b).p]); m = measured(P); }
  const a = cut(0); if (a != null) P = [m.at(a).p].concat(P.filter((q, i) => m.c[i] > a));
  return P;
}
// whether two paths come within d of each other anywhere
const near2 = (A, B, d) => { const b = bbox(B); if (bbox(A).some((v, i) => i < 2 ? v > b[i + 2] + d : v < b[i - 2] - d)) return false; const G = segGrid([{ path: B, w: 0, row: 2 * d - 24 }]); return dens(A, 15).some(p => [...G.near(p[0], p[1], p[0], p[1])].some(g => S.segDist(p, g.a, g.b) < d)); };
const curved = P => { if (P.length < 3) return false; const a = Math.atan2(P[1][1] - P[0][1], P[1][0] - P[0][0]); let lo = 0, hi = 0; for (let i = 2; i < P.length; i++) { let d = Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0]) - a; d = ((d + 3 * Math.PI) % (2 * Math.PI)) - Math.PI; lo = Math.min(lo, d); hi = Math.max(hi, d); } return hi - lo >= 4 * Math.PI / 180; };
export { curved as isCurved };
// how far a path's heading swings (radians, unwrapped): under 60° it can't come back near itself
const swing = P => { let h = 0, lo = 0, hi = 0; for (let i = 2; i < P.length; i++) { const a = Math.atan2(P[i - 1][1] - P[i - 2][1], P[i - 1][0] - P[i - 2][0]), c = Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0]); h += ((c - a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI; lo = Math.min(lo, h); hi = Math.max(hi, h); } return hi - lo; };

// a fast inside test for a ring with many points: its edges bucketed by rows 40 ft high, a crossing count in the row
export function ringTest(ring) {
  const b = bbox(ring), H = 40, rows = Array.from({ length: Math.max(1, Math.ceil((b[3] - b[1]) / H) + 1) }, () => []);
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], c = ring[j], lo = Math.floor((Math.min(a[1], c[1]) - b[1]) / H), hi = Math.floor((Math.max(a[1], c[1]) - b[1]) / H); for (let k = Math.max(0, lo); k <= Math.min(rows.length - 1, hi); k++) rows[k].push([a, c]); }
  return ([x, y]) => { if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false; let ins = false; for (const [[xi, yi], [xj, yj]] of rows[Math.floor((y - b[1]) / H)]) if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins; return ins; };
}
// ---------- the right-of-way index: which street's right-of-way a point is in (segments on a grid) ----------
// streets: [{ path, h (half the right-of-way) }], discs: [{ c, r (right-of-way radius) }]
function rowIndex(streets, discs = []) {
  const segs = [], G = S.gridIndex([], g => g.b, 60);
  for (const s of streets) { let c = 0; const L = lenOf(s.path); for (let i = 1; i < s.path.length; i++) { const a = s.path[i - 1], b = s.path[i], h = s.h; G.add({ s, a, b, at: c, L, closed: !!s.s?.closed }, [Math.min(a[0], b[0]) - h - 20, Math.min(a[1], b[1]) - h - 20, Math.max(a[0], b[0]) + h + 20, Math.max(a[1], b[1]) + h + 20]); c += dist(a, b); } }
  for (const d of discs) G.add({ d }, [d.c[0] - d.r - 20, d.c[1] - d.r - 20, d.c[0] + d.r + 20, d.c[1] + d.r + 20]);
  // the street whose right-of-way (grown by m) holds p, not `not` (a street, or its disc)
  const inRow = (p, not = null, m = 0) => { for (const g of G.near(p[0], p[1], p[0], p[1])) { if (g.d) { if (g.d !== not && g.d.of !== not && dist(p, g.d.c) < g.d.r + m - 0.5) return g.d; continue; } if (g.s !== not && g.s.s !== not && S.segDist(p, g.a, g.b) < g.s.h + m - 0.5) return g.s; } return null; };
  // its own right-of-way farther along it than `gap` from arc s0 (a loop lane's other side, a hairpin's other leg)
  const inSelf = (p, own, s0, gap) => { for (const g of G.near(p[0], p[1], p[0], p[1])) { if (g.d || g.s !== own && g.s.s !== own) continue; let d = Math.abs(g.at - s0); if (g.closed) d = Math.min(d, g.L - d); if (d > gap && S.segDist(p, g.a, g.b) < g.s.h - 0.5) return true; } return false; };
  return { inRow, inSelf, segs };
}

// ---------- the site: its frame (the front at the bottom, x along it), land, building lines, the detention's land ----------
function frameOf(plan) {
  const ring = plan.ring, f = plan.front != null && plan.front < ring.length ? plan.front : S.longestEdge(ring), n = S.outwardOf(ring, f), psi = Math.atan2(n[1], n[0]) * 180 / Math.PI + 90;
  const toF = p => S.rotPt(p, -psi), toP = p => S.rotPt(p, psi), rr = ring.map(toF), b = bbox(rr);
  return { ring, f, psi, toF, toP, rr, X0: b[0], Y0: b[1], X1: b[2], Y1: b[3] };
}
// the lot line under x (frame): where a ray up from below the site first meets it
const frontAt = (F, x) => rayHit(F.rr, [x, F.Y0 - 50], [0, 1]);
// a jurisdiction's lot rules on the program (lib/guardrails.mjs: Waller's narrowest lot, front and side setbacks) over the
// street rules: the stricter of each
const withLot = (R, L) => !L ? R : { ...R, frontBL: Math.max(R.frontBL || 0, +L.front || 0), sideBL: Math.max(R.sideBL || 0, +L.side || 0), minLotW: Math.max(R.minLotW || 0, +L.minW || 0), minLotSf: Math.max(R.minLotSf || 0, +L.minSf || 0) };
// the program's own asks for its homes (lib/siteplan.mjs homeProgram): the smallest lot and the narrowest, over the rules
const withHomes = (R, hp) => !(hp.minLotSf || hp.lotW) ? R : { ...R, minLotSf: Math.max(R.minLotSf || 0, +hp.minLotSf || 0), minLotW: Math.max(R.minLotW || 0, +hp.lotW || 0) };
// what a plan's network is laid out with: the rules, lot sizes, land (lots run to the landscape buffer, as the straight
// layouts' do), the building lines, the frame, the detention it needs, where the main entry may come in
export function context(plan, prog, opts = {}) {
  const ring = plan.ring, rules = S.edgeRules(ring, plan.front, plan.setbacks, plan.streets), F = frameOf(plan), ac = area(ring) / AC, home = prog.zones?.find(z => z.use === 'sfr') || prog, hp = S.homeProgram(prog, prog.zones ? home : null), lotD = home.lotD || prog.lotD || 115, R = withHomes(withLot(streetRules(plan), home.lot || prog.lot), hp), plans = housePlansFor({ min: hp.homeSfMin, max: hp.homeSfMax, n: hp.floorPlans }); // (plans: the home sizes and floor plans asked for, lib/buildings.mjs)
  const pave = rules.map(r => Math.max(0.5, r.pave)), build = rules.map(r => Math.max(0.5, r.build)), ER = S.entryRules(plan);
  const need = opts.pod ? 0 : S.stormNeed(ac, plan.params || {}, prog, ac).area;
  const cs = S.streetCorners(plan).map(F.toF), fa = F.rr[F.f], fb = F.rr[(F.f + 1) % F.rr.length], xa = Math.min(fa[0], fb[0]), xb = Math.max(fa[0], fb[0]);
  const mouths = [0.5, 0.35, 0.65].map(t => ({ t, x: xa + (xb - xa) * t })).filter(m => frontAt(F, m.x) && cs.every(c => dist(c, frontAt(F, m.x).q) >= ER.corner + 150));
  // the ways in besides the main entry, as the site wants them (a neighbourhood of more than 30 homes two, of more than 300
  // or on more than 60 acres three: fire access), counting the homes asked for when that's fewer than the land holds
  const units = home.units && !(home.max ?? prog.max) ? home.units : null, nh = Math.min(ac * 3.6, opts.max ?? units ?? Infinity), ways = opts.pod ? 0 : nh > 300 || ac > 60 ? 2 : nh > R.secondAt ? 1 : 0;
  return { plan, prog, home: { homeMix: home.homeMix || prog.homeMix || null, units, plans }, ways, R, ER, rules, F, ac, lotD, minD: Math.max(90, lotD * 0.78, home.lot || prog.lot ? lotD : 0), maxD: lotD * 1.15, /* (under a jurisdiction's lot rules, lib/guardrails.mjs, the lot depth it set is the least: no curved lot shallower) */ land: S.insetRing(ring, pave), build: S.insetRing(ring, build), pave, need, mouths: mouths.length ? mouths : [{ t: 0.5, x: (xa + xb) / 2 }], P: 2 * lotD + (R.local.row - R.local.pave) + R.local.pave, solid: (opts.solid || []).map(r => ccw(r)) };
}
// the land kept for the pond: a band across the back holding about `A` sq ft (frame): { dev (the rest, frame), res
// (frame rings), y } or the whole site when A is 0
function reserveBack(F, A) {
  if (!(A > 0)) return { dev: ccw(F.rr), res: [] };
  const above = y => clip(F.rr, box(-BIG, y, BIG, BIG)).reduce((t, r) => t + area(pondOf(r)), 0); let a = F.Y0, b = F.Y1; // (the pond inside it: its banks and trail take the edge)
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (above(m) > A) a = m; else b = m; }
  const y = (a + b) / 2, dev = clip(F.rr, box(-BIG, -BIG, BIG, y)).sort((p, q) => area(q) - area(p))[0]; if (!dev) return null;
  return { dev, res: clip(F.rr, box(-BIG, y, BIG, BIG)), y };
}
// the pond on a piece of land kept for it: 18 ft in from its edge (the trail round it, the banks), corners rounded
const pondOf = r => { const t = ccw(S.tidyRing(r, 2)), g = t.length >= 3 ? S.insetRing(t, t.map(() => 18)) : []; return g.length >= 3 && S.signedArea(g) > 0 ? S.fillet(g, 60, true) : []; };
// each edge of a piece of the site (frame): the landscape buffer of the lot line it lies on, or 15 ft off the pond's land
const paveOn = (ctx, r) => r.map((p, k) => { const q = r[(k + 1) % r.length], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], j = ctx.F.rr.findIndex((a, i) => S.segDist(m, a, ctx.F.rr[(i + 1) % ctx.F.rr.length]) < 1); return j >= 0 ? ctx.pave[j] : 15; });
let NID = 0; const sid = p => p + (++NID).toString(36) + Math.random().toString(36).slice(2, 5);
// a street of the network: role coll | local | cross | court | entry, its pavement and right-of-way, its centre line
const mkStreet = (ctx, role, path, extra = {}) => { const W = role === 'coll' ? ctx.R.collector : ctx.R.local; return { id: sid('s'), role, w: extra.w || W.pave, row: extra.row || W.row, path: path.map(q => [fit(q[0]), fit(q[1])]), ...extra }; };
// a closed centre line broken into open pieces at the points given (each a junction), two pieces at least
function breakRing(cl, at) {
  const n = cl.length, m = measured(cl.concat([cl[0]])), P = m.L, pos = [...new Set(at.map(q => +m.proj(q).s.toFixed(1)))].sort((a, b) => a - b); if (pos.length === 1) pos.push(+((pos[0] + P / 2) % P).toFixed(1)); pos.sort((a, b) => a - b);
  return pos.map((s0, i) => { const s1 = i + 1 < pos.length ? pos[i + 1] : pos[0] + P, out = [m.at(s0).p]; for (let k = 0; k < 2 * n; k++) { const s = m.c[k % n] + (k >= n ? P : 0); if (s > s0 + 1 && s < s1 - 1) out.push(cl[k % n]); } out.push(m.at(s1 >= P ? s1 - P : s1).p); return out; });
}
// ---------- skeletons ----------
// [{ kind, at, streets (the collectors, plan feet), entry { mouth, to, host }, pods [{ ring, edges }], res (the pond's
// land, plan rings), core (the commons' ring) }]. Kinds: ring (a loop road one lot band in from the lot lines, homes
// backing onto them; a spine on across when it's deep), core (a loop road round a central lake and commons), spine
// (the main street up the middle, a T across its end), courts (the ring with cul-de-sacs inside)
export function skeletons(ctx, opts = {}) {
  const { F, R, plan, prog } = ctx, Z = prog.zones || [], am = Z.find(z => z.use === 'amenity'), kinds = (opts.netKinds || ['ring', 'core', 'spine', 'courts']).filter(k => !am || k === 'core'), out = []; // (a commons asked: the core loop round it, else today's layouts)
  for (const m of ctx.mouths) {
    const fh = frontAt(F, m.x); if (!fh) continue;
    const back = reserveBack(F, ctx.need * 1.02); if (!back) continue;
    if (kinds.includes('ring') || kinds.includes('courts')) { const sk = ringSkel(ctx, m, back); if (sk) { if (kinds.includes('ring')) out.push(sk); if (kinds.includes('courts') && sk.pods.length) out.push({ ...sk, kind: 'courts' }); } }
    if (kinds.includes('spine')) { const sk = spineSkel(ctx, m, back, 0.04); if (sk) out.push(sk); }
    if (kinds.includes('core') && ctx.ac >= 25 && (am || ctx.need >= 4 * AC)) for (const shape of ['soft']) { const sk = coreSkel(ctx, m, shape, am); if (sk) out.push(sk); }
  }
  return out;
}
// frame → plan for a skeleton's pieces
const toPlanSk = (F, sk) => ({ ...sk, streets: sk.streets.map(s => ({ ...s, path: s.path.map(q => F.toP(q).map(fit)), ...(s.clearAt ? { clearAt: F.toP(s.clearAt) } : {}) })), entry: sk.entry && { ...sk.entry, mouth: F.toP(sk.entry.mouth), to: F.toP(sk.entry.to), dir: S.rotPt(sk.entry.dir, F.psi) }, ways: (sk.ways || []).map(w => ({ mouth: F.toP(w.mouth), to: F.toP(w.to), dir: S.rotPt(w.dir, F.psi) })), pods: sk.pods.map(p => ccw(S.tidyRing(p.map(F.toP), 1))), res: sk.res.map(r => ccw(r.map(F.toP))), core: sk.core && ccw(sk.core.map(F.toP)) });
function ringSkel(ctx, m, back) {
  const { F, R, lotD } = ctx, C = R.collector, dk = paveOn(ctx, back.dev), cl = loopIn(back.dev, dk.map(p => p + lotD + C.row / 2), 260); if (!cl || area(cl) < 0.25 * area(back.dev)) return null;
  const fy = frontAt(F, m.x).q[1], h0 = rayHit(cl, [m.x, fy + 1], [0, 1]); if (!h0 || h0.q[1] - fy < 80) return null;
  // deep: a spine road across the inside, its T on the loop a collector's junction spacing along from the entry's (a
  // crossroads with the boulevard would want a roundabout, and that leaves the boulevard no room for its median)
  const top0 = rayHit(cl, [m.x, h0.q[1] + 5], [0, 1]), deep = top0 && top0.q[1] - h0.q[1] > 2200, cb = bbox(cl), sx = [m.x + R.collJunctionMin + 40, m.x - R.collJunctionMin - 40].sort((a, b) => Math.abs(a - (cb[0] + cb[2]) / 2) - Math.abs(b - (cb[0] + cb[2]) / 2)).find(x => x > cb[0] + 400 && x < cb[2] - 400);
  const b0 = deep && sx != null ? rayHit(cl, [sx, F.Y0 - 50], [0, 1]) : null, top = b0 && rayHit(cl, [sx, b0.q[1] + 5], [0, 1]), J = [h0.q].concat(b0 && top ? [b0.q, top.q] : []);
  const loop = breakRing(cl, J).map(p => mkStreet(ctx, 'coll', dens(p, 10), { name: 'Loop road' })), streets = loop.slice();
  let inner = S.insetRing(cl, cl.map(() => C.pave / 2)), pods = [inner];
  if (b0 && top) { const sp = mkStreet(ctx, 'coll', dens([add(b0.q, [0, 1], C.pave / 2 - 4), add(top.q, [0, -1], C.pave / 2 - 6)], 10), { name: 'Spine road' }); streets.push(sp); const band = S.outline({ kind: 'drive', path: [add(b0.q, [0, -60]), add(top.q, [0, 60])], width: C.pave, r: 0 }); pods = minus(inner, [band]).filter(r => area(r) > 5 * AC); }
  return toPlanSk(F, { kind: 'ring', at: m.t, streets, entry: { mouth: [m.x, fy], to: h0.q, dir: [0, 1] }, ways: moreWays(ctx, cl, m), pods, res: back.res, core: null });
}
// more ways in to a loop road (frame): off the side streets, square to them, and along the front at least the driveway
// spacing (400 ft, or a quarter of a short front) from the main entry and clear of the corners; as many as ctx.ways.
// [{ mouth, to, dir }]
function moreWays(ctx, cl, m) {
  const { F, plan, ER } = ctx, want = ctx.ways, out = [], cs = S.streetCorners(plan).map(F.toF), rules = ctx.rules, n = F.rr.length;
  for (let j = 0; j < n && out.length < want; j++) { if (j === F.f || !rules[j].street || S.edgeLen(F.rr, j) < 400) continue; const a = F.rr[j], b = F.rr[(j + 1) % n], md = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], o = S.outwardOf(F.rr, j), d = [-o[0], -o[1]], h = rayHit(cl, add(md, d, 1), d); if (h && h.t > 80 && h.t < 600 && cs.every(c => dist(c, md) >= ER.corner + 150)) out.push({ mouth: md, to: h.q, dir: d }); }
  const fa = F.rr[F.f], fb = F.rr[(F.f + 1) % n], xa = Math.min(fa[0], fb[0]), xb = Math.max(fa[0], fb[0]);
  const gap = Math.max(ER.spacing, Math.min(400, (xb - xa) * 0.25)); // (a short front: the driveway spacing, not 400 ft)
  for (const t of [0.22, 0.78, 0.3, 0.7, 0.15, 0.85, 0.26, 0.74, 0.18, 0.82]) { if (out.length >= want) break; const x = xa + (xb - xa) * t, fh = frontAt(F, x); if (!fh || out.some(w => Math.abs(w.mouth[0] - x) < gap) || Math.abs(x - m.x) < gap || cs.some(c => dist(c, fh.q) < ER.corner + 150)) continue;
    const h = rayHit(cl, [x, fh.q[1] + 1], [0, 1]); if (h && h.t > 80 && h.t < 600) out.push({ mouth: fh.q, to: h.q, dir: [0, 1] }); }
  return out;
}
// the main street up the middle from the entry, gently bowed, to a T with a street across the back one lot band in (or a
// cul-de-sac on a narrow site); the land each side its pods
function spineSkel(ctx, m, back, bow) {
  const { F, R, lotD, P } = ctx, dev = back.dev, dk = paveOn(ctx, dev), fy = frontAt(F, m.x).q[1], top = rayHit(dev, [m.x, fy + 5], [0, 1]); if (!top) return null;
  const W = ctx.ac * 4 < 150 ? R.local : R.collector, ys = fy + Math.max(ctx.ER.cross + 60, 180), inner = S.insetRing(dev, dk.map(p => p + lotD + R.local.row / 2)), ye0 = top.q[1] - dk[top.k] - lotD - R.local.row / 2;
  if (ye0 - ys < 400) return null;
  const across = clipPath([[F.X0 - 100, ye0], [F.X1 + 100, ye0]], inner).find(p => p[0][0] <= m.x + 1 && p[p.length - 1][0] >= m.x - 1 || p[0][0] >= m.x - 1 && p[p.length - 1][0] <= m.x + 1);
  const wide = across && Math.min(Math.abs(across[0][0] - m.x), Math.abs(across[across.length - 1][0] - m.x)) > P * 0.9, ye = wide ? ye0 : ye0 + R.local.row / 2 - ctx.R.bulbRow;
  const L = ye - ys, sag = bow * L, path = []; for (let k = 0; k <= 40; k++) { const t = k / 40; path.push([m.x + sag * 4 * t * (1 - t), ys + L * t]); }
  const sp = mkStreet(ctx, 'coll', dens(path, 10), { name: 'Main street', w: W.pave, row: W.row, entryClear: true }), streets = [sp], discs = [];
  if (wide) { const ends = across.map(q => q.slice()), mid = [m.x, ye]; for (const e of [ends[0], ends[ends.length - 1]]) { const arm = dens([add(mid, unit([e[0] - mid[0], 0]), W.pave / 2 - 4), e], 10); if (lenOf(arm) > 150) streets.push(mkStreet(ctx, 'local', arm, { name: '', open: [false, true] })); } }
  else streets[0].open = [false, true];
  const cut = [S.outline({ kind: 'drive', path: [[m.x, fy - 40]].concat(path.slice(1)), width: W.pave, r: 0 })].concat(wide ? [S.outline({ kind: 'drive', path: [[across[0][0] - 400, ye], [across[across.length - 1][0] + 400, ye]], width: R.local.pave, r: 0 })] : []);
  const pods = minus(dev, cut).filter(r => area(r) > 4 * AC);
  return toPlanSk(F, { kind: 'spine', bow, at: m.t, streets, entry: { mouth: [m.x, fy], to: [m.x, ys], dir: [0, 1] }, pods, res: back.res, core: null });
}
// a loop road round a central lake and commons (as sitepods' core: a rounded rectangle, or a softer superellipse), the
// main street in to it from the entry; the land round it to the lot lines one pod (the spine's band cuts it open)
function coreSkel(ctx, m, shape, am) {
  const { F, R, lotD } = ctx, C = R.collector, site = area(F.rr), cAc = am?.acres || Math.min(site * 0.14 / AC, Math.max(2, Math.min(5, site / AC * 0.04))), lake = !am || !am.items?.length || am.items.some(t => /lake|pond/i.test(t));
  const A = (am ? cAc * AC : 0) + (lake ? ctx.need * 1.25 : 0); if (A < 3 * AC) return null;
  let w = Math.sqrt(A * 1.3), h = A / w; const M = C.pave + 2 * lotD + 80, fy = frontAt(F, m.x).q[1], lp = F.toF(S.labelPoint(F.ring));
  const loopAt = (c, a, b) => shape === 'soft' ? Array.from({ length: 96 }, (_, i) => { const t = i / 96 * 2 * Math.PI, cs = Math.cos(t), sn = Math.sin(t); return [c[0] + a * Math.sign(cs) * Math.abs(cs) ** 0.5, c[1] + b * Math.sign(sn) * Math.abs(sn) ** 0.5]; }) : S.fillet(box(c[0] - a, c[1] - b, c[0] + a, c[1] + b), Math.min(220, b * 0.9), true);
  let sl = Math.max(0, w / 2 - 260), c0 = [Math.max(m.x - sl, Math.min(m.x + sl, lp[0])), lp[1]];
  const ok = (cx, cy) => { const B = box(cx - w / 2 - M, cy - h / 2 - M, cx + w / 2 + M, cy + h / 2 + M); return B.every(p => S.inRing(p, F.rr)) && !F.rr.some(p => p[0] > B[0][0] && p[0] < B[1][0] && p[1] > B[0][1] && p[1] < B[2][1]) && cy - h / 2 - 18 - fy > 400; };
  let c = null; for (let r = 0; r <= 800 && !c; r += 100) for (const [dx, dy] of r ? [[0, -r], [0, r], [-r, 0], [r, 0], [-r, -r], [r, -r], [-r, r], [r, r]] : [[0, 0]]) if (Math.abs(c0[0] + dx - m.x) <= sl && ok(c0[0] + dx, c0[1] + dy)) { c = [c0[0] + dx, c0[1] + dy]; break; }
  // (a parcel that box won't go in, an L or a wedge: the loop itself with a band of lots and its street's half round it,
  // wherever it fits nearest the middle, long either way or square)
  if (!c) { const M2 = C.row / 2 + lotD + 10, fits = (cx, cy, ww, hh) => { if (cy - hh / 2 - 18 - fy <= 400) return false; const g = S.grow(ccw(loopAt([cx, cy], ww / 2 + 18, hh / 2 + 18)), M2); return g.every(p => S.inRing(p, F.rr)) && !F.rr.some(p => S.inRing(p, g)); };
    for (const [ww, hh] of [[w, h], [h, w], [Math.sqrt(A), Math.sqrt(A)]]) { const s2 = Math.max(0, ww / 2 - 260), q0 = [Math.max(m.x - s2, Math.min(m.x + s2, lp[0])), lp[1]];
      for (let r = 0; r <= 1600 && !c; r += 100) for (let dx = -r; dx <= r && !c; dx += 100) for (const dy of Math.abs(dx) === r ? Array.from({ length: 2 * r / 100 + 1 }, (_, i) => -r + 100 * i) : [-r, r]) if (Math.abs(q0[0] + dx - m.x) <= s2 && fits(q0[0] + dx, q0[1] + dy, ww, hh)) { c = [q0[0] + dx, q0[1] + dy]; w = ww; h = hh; break; }
      if (c) break; } }
  if (!c) return null;
  const a = w / 2 + 18, b = h / 2 + 18, cl0 = loopAt(c, a, b);
  const cl = dens(ccw(cl0), 10, true), j0 = rayHit(cl, [m.x, fy + 1], [0, 1]); if (!j0) return null;
  const ys = fy + Math.max(ctx.ER.cross + 60, 180); if (j0.q[1] - ys < 150) return null;
  // more ways in as the site wants them: from the front (the driveway spacing from the main entry and each other, clear of
  // the corners) straight up to the loop road, square to it and a collector's junction spacing along it from the others;
  // streets like the main street (no lots the first stretch in), the pods round the loop cut by them
  const n = F.rr.length, fa = F.rr[F.f], fb = F.rr[(F.f + 1) % n], xa = Math.min(fa[0], fb[0]), xb = Math.max(fa[0], fb[0]), gap = Math.max(ctx.ER.spacing, Math.min(400, (xb - xa) * 0.25)), cs = S.streetCorners(ctx.plan).map(F.toF), mc = measured(cl.concat([cl[0]])), ways = [], wst = [], Ts = [mc.proj(j0.q).s];
  for (const t of [0.22, 0.78, 0.3, 0.7, 0.15, 0.85, 0.26, 0.74, 0.18, 0.82]) { if (ways.length >= ctx.ways) break; const x = xa + (xb - xa) * t, fh = frontAt(F, x); if (!fh || Math.abs(x - m.x) < gap || ways.some(w => Math.abs(w.mouth[0] - x) < gap) || cs.some(q => dist(q, fh.q) < ctx.ER.corner + 150)) continue;
    const h = rayHit(cl, [x, fh.q[1] + 1], [0, 1]), y2 = fh.q[1] + Math.max(ctx.ER.cross + 60, 180); if (!h || h.q[1] - y2 < 150) continue; const a = cl[h.k], b = cl[(h.k + 1) % cl.length], ps = mc.proj(h.q).s;
    if (Math.abs(unit([b[0] - a[0], b[1] - a[1]])[1]) > 0.5 || Ts.some(s0 => Math.min(Math.abs(s0 - ps), mc.L - Math.abs(s0 - ps)) < C.pave + R.collJunctionMin)) continue;
    ways.push({ mouth: [x, fh.q[1]], to: [x, y2], dir: [0, 1] }); Ts.push(ps); wst.push(mkStreet(ctx, 'coll', dens([[x, y2], add(h.q, [0, 1], C.pave / 2 - 6)], 10), { entryClear: true, clearAt: [x, fh.q[1]] })); }
  const loop = breakRing(cl, [j0.q, ...wst.map(w => w.path.at(-1))]).map(p => mkStreet(ctx, 'coll', dens(p, 10), { name: 'Loop road' })), sp = mkStreet(ctx, 'coll', dens([[m.x, ys], add(j0.q, [0, 1], C.pave / 2 - 6)], 10), { name: 'Main street', entryClear: true });
  const core = S.insetRing(cl, cl.map(() => C.pave / 2)), cut = [S.grow(cl, C.pave / 2), S.outline({ kind: 'drive', path: [[m.x, fy - 40], j0.q], width: C.pave, r: 0 })].concat(ways.map(w => S.outline({ kind: 'drive', path: [[w.mouth[0], w.mouth[1] - 40], wst[ways.indexOf(w)].path.at(-1)], width: C.pave, r: 0 })));
  const pods = minus(back0(ctx).dev, cut).filter(r => area(r) > 4 * AC);
  return toPlanSk(F, { kind: 'core', shape, at: m.t, streets: loop.concat([sp], wst), entry: { mouth: [m.x, fy], to: [m.x, ys], dir: [0, 1] }, ways, pods, res: [], core, lake });
}
const back0 = ctx => ({ dev: ccw(ctx.F.rr), res: [] });

// ---------- local streets in a pod ----------
// a segment grid over street centre lines: the street nearest a point (its pavement edge within tol)
function segGrid(streets) { const G = S.gridIndex([], g => g.b, 80); for (const s of streets) for (let i = 1; i < s.path.length; i++) { const a = s.path[i - 1], b = s.path[i], h = (s.row || s.w) / 2 + 12; G.add({ s, a, b }, [Math.min(a[0], b[0]) - h, Math.min(a[1], b[1]) - h, Math.max(a[0], b[0]) + h, Math.max(a[1], b[1]) + h]); } return G; }
// each edge of a pod: a gate (along a street's pavement edge: that street) or a lot line (its landscape buffer) or the
// pond's land
function podEdges(ctx, ring, streets) {
  const G = segGrid(streets), pr = ctx.plan.ring;
  return ring.map((p, k) => { const q = ring[(k + 1) % ring.length], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; let best = null;
    for (const g of G.near(m[0], m[1], m[0], m[1])) { const d = S.segDist(m, g.a, g.b); if (Math.abs(d - g.s.w / 2) < 5 && (!best || d < best.d)) best = { d, s: g.s }; }
    if (best) return { gate: best.s }; const j = pr.findIndex((a, i) => S.segDist(m, a, pr[(i + 1) % pr.length]) < 1.5); return { pave: j >= 0 ? ctx.pave[j] : 15 }; });
}
// how far in from each edge of a pod a local street's centre line must stay: from a gate, two lot depths (homes facing
// the collector, homes behind them facing the street); from a lot line, one (homes backing onto it)
const insetsOf = (ctx, edges) => edges.map(e => e.gate ? ((e.gate.row || e.gate.w) - e.gate.w) / 2 + 2 * ctx.lotD + ctx.R.local.row / 2 - 15 : e.pave + ctx.lotD + ctx.R.local.row / 2 - 8);
// the test for "far enough in": inside the ring and at least its inset from every edge
function interior(ring, ins) {
  const G = S.gridIndex([], g => g.b, 100), dm = Math.max(...ins); ring.forEach((a, k) => { const b = ring[(k + 1) % ring.length]; G.add({ a, b, d: ins[k] }, [Math.min(a[0], b[0]) - dm, Math.min(a[1], b[1]) - dm, Math.max(a[0], b[0]) + dm, Math.max(a[1], b[1]) + dm]); });
  const inn = ringTest(ring); return p => { if (!inn(p)) return false; for (const g of G.near(p[0], p[1], p[0], p[1])) if (S.segDist(p, g.a, g.b) < g.d) return false; return true; };
}
// the stretches of a path that are far enough in (ends found to a fraction of a foot)
function runsIn(P, ok, closed = false) {
  const inn = P.map(ok), out = []; let cur = null;
  const edgeAt = (a, b, ia) => { let lo = 0, hi = 1; for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2, q = [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m]; if (ok(q) === ia) lo = m; else hi = m; } const t = ia ? lo : hi; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  if (closed && inn.every(Boolean)) return [{ path: P.slice(), closed: true }];
  const n = P.length, s0 = closed ? inn.indexOf(false) : 0, idx = k => (s0 + k) % n;
  for (let k = 0; k < (closed ? n + 1 : n); k++) { const i = idx(k), p = P[i];
    if (k > 0) { const a = P[idx(k - 1)]; if (inn[i] !== inn[idx(k - 1)]) { const q = edgeAt(a, p, inn[idx(k - 1)]); if (cur) { cur.push(q); out.push({ path: cur }); cur = null; } else cur = [q]; } }
    if (inn[i] && k < (closed ? n : n)) { if (!cur) cur = [p]; else cur.push(p); } }
  if (cur && cur.length > 1) out.push({ path: cur });
  return out.filter(r => lenOf(r.path) > 1);
}
// a distance field over a pod (the distance from each grid point to its gates; to every edge when it has none) and its
// level lines, smoothed: streets concentric to the collector (round a lake, inside a loop road)
function levelLines(ring, edges, levels, cell = 15, cache = null, wave = 0) {
  let nx, ny, x0, y0, v; const hit = cache?.get('field');
  if (hit) ({ nx, ny, x0, y0, v } = hit); else {
  const gates = ring.map((p, k) => edges[k].gate ? [p, ring[(k + 1) % ring.length]] : null).filter(Boolean), segs = gates.length ? gates : ring.map((p, k) => [p, ring[(k + 1) % ring.length]]);
  const b = bbox(ring); x0 = b[0] - cell; y0 = b[1] - cell; nx = Math.ceil((b[2] - x0) / cell) + 2; ny = Math.ceil((b[3] - y0) / cell) + 2; v = new Float32Array(nx * ny); const G = S.gridIndex(segs, s => bbox(s), 200);
  const inn = ringTest(ring); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const p = [x0 + i * cell, y0 + j * cell]; if (!inn(p)) { v[j * nx + i] = -50; continue; } let d = Infinity, r = 200;
    while (d === Infinity && r < 20000) { for (const s of G.near(p[0] - r, p[1] - r, p[0] + r, p[1] + r)) d = Math.min(d, S.segDist(p, s[0], s[1])); r *= 2; } for (const s of G.near(p[0] - d, p[1] - d, p[0] + d, p[1] + d)) d = Math.min(d, S.segDist(p, s[0], s[1])); v[j * nx + i] = d; }
  cache?.set('field', { nx, ny, x0, y0, v }); }
  // a meander (wave: ft each way): the field nudged by a gentle swell across the site, the same for every level, so the
  // streets wander together and the lots between them keep their depth
  if (wave) { const k = 'field~' + wave, w = cache?.get(k); if (w) v = w; else { const L2 = 2 * Math.PI / 1200, u = new Float32Array(v.length); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const o = v[j * nx + i]; u[j * nx + i] = o < 0 ? o : o + wave / 2 * (Math.sin((x0 + i * cell) * L2) + Math.sin((y0 + j * cell) * L2)); } v = u; cache?.set(k, u); } }
  const out = [];
  for (const L of levels) {
    const pt = (i, j, h) => { const a = v[j * nx + i] - L, c = h ? v[j * nx + i + 1] - L : v[(j + 1) * nx + i] - L, t = a / (a - c); return h ? [x0 + (i + t) * cell, y0 + j * cell] : [x0 + i * cell, y0 + (j + t) * cell]; };
    const adj = new Map(), P = new Map(), link = (k1, p1, k2, p2) => { P.set(k1, p1); P.set(k2, p2); (adj.get(k1) || adj.set(k1, []).get(k1)).push(k2); (adj.get(k2) || adj.set(k2, []).get(k2)).push(k1); };
    for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
      const a = v[j * nx + i] > L, bq = v[j * nx + i + 1] > L, c = v[(j + 1) * nx + i + 1] > L, d = v[(j + 1) * nx + i] > L, code = (a ? 1 : 0) | (bq ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0); if (!code || code === 15) continue;
      const E = { s: ['h' + i + ',' + j, () => pt(i, j, true)], e: ['v' + (i + 1) + ',' + j, () => pt(i + 1, j, false)], n: ['h' + i + ',' + (j + 1), () => pt(i, j + 1, true)], w: ['v' + i + ',' + j, () => pt(i, j, false)] };
      const pairs = { 1: [['w', 's']], 2: [['s', 'e']], 3: [['w', 'e']], 4: [['e', 'n']], 6: [['s', 'n']], 7: [['w', 'n']], 8: [['n', 'w']], 9: [['n', 's']], 11: [['n', 'e']], 12: [['e', 'w']], 13: [['e', 's']], 14: [['s', 'w']], 5: [['w', 'n'], ['e', 's']], 10: [['w', 's'], ['e', 'n']] }[code];
      for (const [p, q] of pairs) link(E[p][0], E[p][1](), E[q][0], E[q][1]());
    }
    const seen = new Set(), walk = k0 => { const out2 = [k0]; seen.add(k0); let cur = k0; for (;;) { const nx2 = (adj.get(cur) || []).find(k => !seen.has(k)); if (!nx2) break; seen.add(nx2); out2.push(nx2); cur = nx2; } return out2; };
    for (const [k, a] of adj) if (a.length === 1 && !seen.has(k)) out.push({ level: L, path: walk(k).map(x => P.get(x)), closed: false });
    for (const k of adj.keys()) if (!seen.has(k)) { const w = walk(k); if (w.length > 8) out.push({ level: L, path: w.map(x => P.get(x)), closed: true }); }
  }
  // (simplified, and where two corner points sit close together, the corner they cut put back where the long stretches
  // either side meet, so the bend rounds off wide rather than on a short stub)
  const sharpen = (P, closed) => { let Q = P.slice(), changed = true; const n0 = () => Q.length; for (let pass = 0; changed && pass < 50; pass++) { changed = false; const n = n0(); for (let i = closed ? 0 : 1; i + (closed ? 0 : 2) < n && n0() > 4; i++) { const a = Q[(i - 1 + n) % n], b = Q[i], c = Q[(i + 1) % n], d = Q[(i + 2) % n]; if (dist(b, c) >= 40) continue;
    const r = [b[0] - a[0], b[1] - a[1]], t = [d[0] - c[0], d[1] - c[1]], den = r[0] * t[1] - r[1] * t[0]; if (Math.abs(den) < 1e-9) continue; const k = ((c[0] - a[0]) * t[1] - (c[1] - a[1]) * t[0]) / den, x = [a[0] + r[0] * k, a[1] + r[1] * k]; if (k < 0.5 || dist(x, b) > 60 || dist(x, c) > 60) continue;
    Q[i] = x; Q.splice((i + 1) % n, 1); if ((i + 1) % n < i) Q.unshift(Q.pop()); changed = true; break; } } return Q; };
  return out.map(l => { const p = l.closed ? S.fillet(sharpen(S.tidyRing(l.path, 6), true), 140, true) : S.fillet(sharpen(dpOpen(l.path, 6), false), 140); return { ...l, path: dens(p, 10, l.closed) }; }).filter(l => lenOf(l.path) > 200);
}
// an open line simplified (Douglas-Peucker at tol ft, its ends kept)
const dpOpen = (P, tol) => { if (P.length < 3) return P; let k = 0, m = -1; for (let i = 1; i < P.length - 1; i++) { const d = S.segDist(P[i], P[0], P[P.length - 1]); if (d > m) { m = d; k = i; } } return m > tol ? dpOpen(P.slice(0, k + 1), tol).slice(0, -1).concat(dpOpen(P.slice(k), tol)) : [P[0], P[P.length - 1]]; };
// an open line tidied and smoothed (its ends kept)
const smoothOpen = P => { let q = P.filter((p, i) => !i || dist(p, P[i - 1]) > 0.5); for (let k = 0; k < 3 && q.length > 2; k++) { const o = [q[0]]; for (let i = 0; i + 1 < q.length; i++) { const a = q[i], b = q[i + 1]; if (i) o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]); if (i + 2 < q.length) o.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } o.push(q[q.length - 1]); q = o; } return q; };
// the ways a pod's local streets may run: along its long axis, square to it, or concentric to its collectors; bowed
// either way or straight; the first street at a few offsets; ends as through streets (T's both ends), cul-de-sacs
// (every other street stops short of one collector) or loop lanes (neighbours joined in a U)
export function patternsOf(ctx, pod) {
  const out = [], P = ctx.P;
  for (const dir of ['axis', 'perp', 'para']) for (const [bow, wave] of dir === 'para' ? [[0, 0], [0, 30]] : [[0.03, 0], [-0.03, 0], [0.02, 26], [0, 30]]) for (const ends of dir === 'para' ? ['thru', 'cul', 'loop'] : ['thru', 'cul', 'loop', 'court']) out.push({ dir, bow, wave, d0: 0, ends });
  return out;
}
// one pod's local network for a pattern: { streets, discs } (plan feet; streets T-ing into a gate start 4 ft into its
// pavement). pod: { ring, edges }
export function podStreets(ctx, pod, pat) {
  const { R, P } = ctx, L = R.local, ring = pod.ring, edges = pod.edges, ins = pod.ins ||= insetsOf(ctx, edges), ok = pod.ok ||= interior(ring, ins), streets = [], discs = []; pod.cache ||= new Map();
  // the family of centre lines and its pieces far enough in, each end T-ing into a gate along its way when one is near, else
  // open (the same for every way the ends go: worked out once a family)
  const fk = 'pieces|' + pat.dir + '|' + pat.bow + '|' + (pat.wave || 0) + '|' + (pat.d0 || 0); let base = pod.cache.get(fk);
  if (!base) { let fam;
    if (pat.dir === 'para') { const g0 = Math.min(...ins.filter((d, k) => edges[k].gate)) + 15; if (!Number.isFinite(g0)) return null; const lv = []; for (let d = g0 + (pat.d0 || 0); d < 6000; d += P) lv.push(d); fam = levelLines(ring, edges, lv.slice(0, 30), 15, pod.cache, pat.wave || 0).map(l => ({ y: l.level, path: l.path, closed: l.closed })); }
    else { const ma = S.mainAngle(ring), q = ring.map(p => S.rotPt(p, -ma)), b = bbox(q), along = b[2] - b[0] >= b[3] - b[1] ? ma : ma + 90; fam = arcFamily(ring, pat.dir === 'axis' ? along : along + 90, pat.bow, pat.d0, P, ok, pod.cache, pat.wave || 0); }
    base = []; const X = 2 * L.row + ctx.lotD;
    for (const f of fam) for (const r0 of runsIn(f.path, ok, f.closed)) { if (lenOf(r0.path) < 250) continue;
      // a loop round a strip too thin for lots inside it: one street up the strip instead (not two side by side)
      const r = r0.closed && across(r0.path, true, X).thin > 0.3 ? (m => m && { path: m, closed: false })(midline(r0.path, X, ok)) : r0; if (!r) continue;
      const pc = { y: f.y, path: r.closed ? r.path : unhook(r.path), closed: !!r.closed, e: [null, null] }; if (lenOf(pc.path) < 250) continue;
      if (!pc.closed) for (const k of [0, 1]) { const E = k ? pc.path[pc.path.length - 1] : pc.path[0], m = measured(pc.path), t = k ? m.tan(m.L - 1) : m.tan(1).map(v => -v), h = rayHit(ring, E, t, ins.reduce((a, b) => Math.max(a, b), 0) + 120);
        if (h && edges[h.k].gate) { const a = ring[h.k], b2 = ring[(h.k + 1) % ring.length], ed = unit([b2[0] - a[0], b2[1] - a[1]]); if (Math.abs(dot(ed, t)) <= 0.64) pc.e[k] = { tee: edges[h.k].gate, q: h.q, t }; } }
      base.push(pc); }
    // a street that comes back on itself (a level line round a thin strip: two streets side by side with no lots between,
    // or pavements that touch) goes, and so does the shorter of two that run closer than a right-of-way
    base = base.filter(pc => { if (!pc.closed && swing(pc.path) < 2.4) return true; const pn = across(pc.path, pc.closed, X); return pn.min >= L.row + 10 && pn.thin <= 0.3; }) // (a street turning less than about 140° can't fold back on itself).sort((a, b) => lenOf(b.path) - lenOf(a.path));
    base = base.filter((pc, i) => !base.slice(0, i).some(o => near2(pc.path, o.path, L.row + 10)));
    pod.cache.set(fk, base); }
  const pieces = base.map(pc => ({ ...pc, e: pc.e.slice() }));
  pieces.sort((a, b) => a.y - b.y || bbox(a.path)[0] - bbox(b.path)[0]);
  const reach = (pc, k) => pc.e[k]?.tee ? pc.e[k] : null, endOf = (pc, k) => { const m = measured(pc.path); return { p: k ? pc.path[pc.path.length - 1] : pc.path[0], t: k ? m.tan(m.L - 1) : m.tan(1).map(v => -v) }; };
  // ends: cul-de-sacs (every other street stops short of the collector at one end, when it's short enough), loop lanes
  if (pat.ends === 'cul') pieces.forEach((pc, i) => { if (reach(pc, 0) && reach(pc, 1) && lenOf(pc.path) <= R.culMax - 60) pc.e[i % 2] = null; });
  // courts: every street a cul-de-sac off one collector (from either side in turn), no longer than the rule allows
  if (pat.ends === 'court') { for (const [i, pc] of pieces.entries()) { if (pc.closed) { pc.drop = true; continue; } const k = reach(pc, i % 2) ? i % 2 : reach(pc, 1 - i % 2) ? 1 - i % 2 : -1; if (k < 0) { pc.drop = true; continue; }
      pc.e[1 - k] = null; const m = measured(pc.path), keep = Math.min(m.L, R.culMax - 60 - (pc.e[k].q ? dist(pc.e[k].q, k ? pc.path[pc.path.length - 1] : pc.path[0]) : 0)); if (keep < 150) { pc.drop = true; continue; }
      pc.path = k ? pc.path.filter((q, j) => m.c[j] > m.L - keep).length ? [m.at(m.L - keep).p, ...pc.path.filter((q, j) => m.c[j] > m.L - keep)] : pc.path : [...pc.path.filter((q, j) => m.c[j] < keep), m.at(keep).p]; }
    for (let i = pieces.length - 1; i >= 0; i--) if (pieces[i].drop) pieces.splice(i, 1); }
  const joined = new Set();
  if (pat.ends === 'loop') for (let i = 0; i + 1 < pieces.length; i++) { const a = pieces[i], b = pieces[i + 1]; if (joined.has(a) || joined.has(b) || a.closed || b.closed || Math.abs(b.y - a.y - P) > 30) continue;
    for (const k of (i / 2) % 2 ? [1, 0] : [0, 1]) { const ea = endOf(a, k), eb = [0, 1].map(j => ({ j, ...endOf(b, j) })).sort((x, y) => dist(x.p, ea.p) - dist(y.p, ea.p))[0], d = dist(ea.p, eb.p);
      if (d > 1.5 * P || d < P * 0.6 || dot(ea.t, eb.t) < 0.5) continue;
      const u = bend(ea.p, ea.t, eb.p, eb.t, 0.66 * d); if (!u.every(q => S.inRing(q, ring) && ring.every((x, kk) => edges[kk].gate || S.segDist(q, x, ring[(kk + 1) % ring.length]) >= edges[kk].pave + L.row / 2 + ctx.minD * 0.7))) continue;
      const pa = k ? a.path : a.path.slice().reverse(), pb = eb.j ? b.path.slice().reverse() : b.path, ja = k ? 0 : 1, jb = eb.j ? 0 : 1, lane = pa.concat(u.slice(1, -1), pb), pn = across(lane, false, 2 * L.row + ctx.lotD);
      if (pn.min < L.row + 10 || pn.thin > 0.3) continue; // (its two arms pinching together: no loop lane)
      a.path = lane; a.e = [a.e[ja], b.e[jb]]; a.loop = true; joined.add(b); break; } }
  for (const pc of pieces) { if (joined.has(pc)) continue;
    let path = pc.path.slice(); const e = pc.e.slice();
    if (!e[0] && e[1]) { path.reverse(); e.reverse(); } // (the end that T's first: its mouth at path[0])
    const ext = [0, 0];
    if (e[0]) { const q = add(e[0].q, e[0].t, 4); ext[0] = dist(q, path[0]); path = dens([q, path[0]], 10).concat(path.slice(1)); }
    if (e[1]) { const q = add(e[1].q, e[1].t, 6); ext[1] = dist(q, path[path.length - 1]); path = path.concat(dens([path[path.length - 1], q], 10).slice(1)); }
    const s = mkStreet(ctx, 'local', path, { closed: pc.closed, ext, ...(pc.loop ? { lane: true } : {}) });
    // an open end: a cul-de-sac's bulb, pulled back so its right-of-way and the lots round it fit
    for (const k of [0, 1]) if (!pc.closed && !e[k]) { const back = R.bulbRow - L.row / 2 + 6, m = measured(s.path); if (m.L < back + 120) continue; const keep = k ? m.L - back : back, cut = k ? s.path.filter((q, i) => m.c[i] < keep).concat([m.at(keep).p]) : [m.at(keep).p].concat(s.path.filter((q, i) => m.c[i] > keep));
      s.path = cut.map(q => [fit(q[0]), fit(q[1])]); const c = k ? s.path[s.path.length - 1] : s.path[0]; discs.push({ id: sid('b'), role: 'bulb', c, R: R.bulbR, of: s.id }); }
    streets.push(s); }
  return { streets, discs };
}
export const podEdgesX = (ctx, ring, streets) => podEdges(ctx, ring, streets);

// ---------- the network joined up ----------
// the junction graph of a network: each street end meets another street (a T: within its pavement and 7 ft), a bulb,
// another street's end (a join: the same street carried on) or nothing; streets joined end to end are one chain, and
// each chain has the places along it where streets meet it. { ends, chains: [{ list: [{ s, rev, off }], L, cyc, coll,
// J: [{ at, from }] (sorted), a, b (its ends: { tee | bulb | free }) }], reached (streets from the entry) }
export function graphOf(streets, discs, entry = null) {
  const M = new Map(streets.map(s => [s, measured(s.path)])), G = segGrid(streets), J = new Map(streets.map(s => [s, []])), ends = new Map(), link = new Map(streets.map(s => [s, new Set()]));
  const endPt = (s, k) => k ? s.path[s.path.length - 1] : s.path[0];
  for (const s of streets) { if (s.closed) continue; for (const k of [0, 1]) { const E = endPt(s, k), e = { s, k, p: E };
    const d = discs.find(d => dist(E, d.c) <= d.R + 3); if (s.role === 'entry' && !k) { e.tee = true; e.street = true; } else if (d) e.bulb = d;
    else { const at = []; for (const t of streets) { if (t === s || t.closed) continue; for (const j of [0, 1]) if (dist(endPt(t, j), E) < 3) at.push({ t, j }); } const o = at.length === 1 ? at[0] : null; // (two ends meeting: one street carried on; a third there makes it a junction, its T's say so)
      if (o) { e.join = o.t; e.jk = o.j; link.get(s).add(o.t); link.get(o.t).add(s); }
      else { let best = null; for (const g of G.near(E[0], E[1], E[0], E[1])) { if (g.s === s) continue; const dd = S.segDist(E, g.a, g.b); if (dd <= g.s.w / 2 + 7 && (!best || dd < best.d)) best = { d: dd, t: g.s }; }
        if (best) { e.tee = best.t; J.get(best.t).push({ at: M.get(best.t).proj(E).s, from: s, p: E }); link.get(s).add(best.t); link.get(best.t).add(s); } else e.free = true; } }
    ends.set(s.id + ':' + k, e); } }
  // chains: streets carried on end to end
  const done = new Set(), chains = [];
  for (const s0 of streets) { if (done.has(s0)) continue; done.add(s0);
    if (s0.closed) { const L = M.get(s0).L; chains.push({ list: [{ s: s0, rev: false, off: 0 }], L, cyc: true, coll: s0.role === 'coll', J: J.get(s0).map(j => ({ ...j })).sort((a, b) => a.at - b.at) }); continue; }
    // walk back to the chain's first street, then forward
    let cur = s0, k = 0, guard = 0; for (;;) { const e = ends.get(cur.id + ':' + k); if (!e?.join || e.join === s0 && guard || guard++ > 200) break; const nx = e.join, nk = 1 - e.jk; if (nx === s0) break; cur = nx; k = nk; }
    const list = []; let off = 0, c = cur, ck = k, cyc = false;
    for (let g = 0; g < 200; g++) { done.add(c); const L = M.get(c).L; list.push({ s: c, rev: ck === 1, off }); off += L; const e = ends.get(c.id + ':' + (1 - ck)); if (!e?.join) break; if (list.some(x => x.s === e.join)) { cyc = true; break; } c = e.join; ck = e.jk; }
    const Js = list.flatMap(x => J.get(x.s).map(j => ({ ...j, at: x.off + (x.rev ? M.get(x.s).L - j.at : j.at) }))).sort((a, b) => a.at - b.at);
    const first = list[0], last = list[list.length - 1], ea = ends.get(first.s.id + ':' + (first.rev ? 1 : 0)), eb = ends.get(last.s.id + ':' + (last.rev ? 0 : 1));
    chains.push({ list, L: off, cyc, coll: list.some(x => x.s.role === 'coll'), J: Js, a: ea, b: eb });
  }
  // the streets reached from the entry (or the first collector)
  const reached = new Set(), st = (Array.isArray(entry) ? entry.slice() : [entry || streets.find(s => s.role === 'coll') || streets[0]]).filter(Boolean); st.forEach(s => reached.add(s));
  while (st.length) { const s = st.pop(); for (const t of link.get(s) || []) if (!reached.has(t)) { reached.add(t); st.push(t); } }
  return { ends, chains, reached, M, J, link };
}
// what a laid network breaks of the rules: blocks longer than blockMax between junctions, cul-de-sacs longer than culMax
// (from the junction to the bulb's middle), junctions on one street closer than junctionMin (collJunctionMin on a
// collector), crossroads (two T's at one spot from either side), streets cut off from the entry. [{ kind, chain, at, len }]
export function breaches(R, g, rings = []) {
  const out = [], inRing0 = (ch, at) => { if (!rings.length) return false; const p = chainAt(g, ch, at)?.p; return !!p && rings.some(c => dist(c, p) < 110); }; // (a roundabout's legs: a junction, not a crossroads)
  for (const ch of g.chains) {
    if (ch.list.some(x => x.s.ring)) continue; const pos = ch.J.map(j => j.at); if (!ch.cyc) { if (ch.a?.tee) pos.unshift(0); if (ch.b?.tee) pos.push(ch.L); } pos.sort((a, b) => a - b);
    // crossroads: two T's into the same spot from either side
    for (let i = 1; i < ch.J.length; i++) if (ch.J[i].at - ch.J[i - 1].at < 30 && !inRing0(ch, ch.J[i].at)) out.push({ kind: 'cross', chain: ch, at: ch.J[i].at });
    const P = [...new Set(pos.map(v => Math.round(v / 30)))].map(v => pos.find(x => Math.round(x / 30) === v)); // (one junction per spot)
    for (let i = 1; i < P.length; i++) { const d = P[i] - P[i - 1]; if (d > R.blockMax) out.push({ kind: 'block', chain: ch, at: (P[i] + P[i - 1]) / 2, a: P[i - 1], b: P[i], len: d }); if (d < (ch.coll ? R.collJunctionMin : R.junctionMin) && d >= 30 && !inRing0(ch, P[i]) && !((ch.a?.street || ch.a?.tee?.role === 'entry') && i === 1)) out.push({ kind: 'close', chain: ch, at: P[i], len: d }); } // (the way in from the street to its first junction: the entry's own rule)
    if (ch.cyc && P.length) { const d = P[0] + ch.L - P[P.length - 1]; if (d > R.blockMax) out.push({ kind: 'block', chain: ch, at: (P[P.length - 1] + d / 2) % ch.L, a: P[P.length - 1], b: P[0] + ch.L, len: d }); if (P.length > 1 && d < (ch.coll ? R.collJunctionMin : R.junctionMin) && d >= 30) out.push({ kind: 'close', chain: ch, at: P[0], len: d }); }
    if (ch.cyc && !P.length && ch.L > R.blockMax) out.push({ kind: 'block', chain: ch, at: ch.L / 2, a: 0, b: ch.L, len: ch.L });
    if (!ch.cyc) for (const [e, end] of [[ch.a, 0], [ch.b, 1]]) { if (!e || e.tee) continue; const j = end ? (P.length ? P[P.length - 1] : 0) : (P.length ? P[0] : ch.L), len = (end ? ch.L - j : j) + (e.bulb ? e.bulb.R : 0); if (P.length && len > R.culMax) out.push({ kind: 'cul', chain: ch, end, at: end ? ch.L : 0, len, j }); }
    if (ch.list.some(x => !g.reached.has(x.s))) out.push({ kind: 'cut', chain: ch });
  }
  return out;
}
// how far apart two places on a chain are along it (round a loop: the shorter way)
const along = (ch, a, b) => { const d = Math.abs(a - b); return ch.cyc ? Math.min(d, ch.L - d) : d; };
// a chain's point and street at a position along it
const chainAt = (g, ch, at) => { for (const x of ch.list) { const L = g.M.get(x.s).L; if (at <= x.off + L + 1e-6 || x === ch.list[ch.list.length - 1]) { const s = x.rev ? L - (at - x.off) : at - x.off, m = g.M.get(x.s), p = m.at(((s % L) + L) % L).p, t = m.tan(((s % L) + L) % L); return { s: x.s, p, t, local: s }; } } return null; };
// a cross street from street a at p (tangent t) to the nearest street across, square to it, within `far`: its path (4 ft
// into each pavement) and the street it meets, or null. It may not cross another street, the pond's land or a solid,
// or leave the land; and each end keeps junctionMin from the junctions already on its street
export const DBG = { on: false };
function crossFrom(ctx, net, g, ri, a, p, t, far, opts = {}) {
  const R = ctx.R, n = [-t[1], t[0]], why = m => { if (DBG.on) console.log('  cross', p.map(Math.round), m); };
  for (const sg of opts.side ? [opts.side] : [1, -1]) {
    const d = [n[0] * sg, n[1] * sg], p0 = add(p, d, a.w / 2 - 4), ray = rayHitStreets(net.streets, p0, d, far, a); if (!ray) { why('no street ' + sg); continue; }
    const b = ray.s, mb = g.M.get(b), pb = mb.proj(ray.q), tb = mb.tan(pb.s), ang = Math.abs(dot(tb, d)); if (ang > 0.5) { why('angle'); continue; } // (meets it within 30° of square)
    const q = add(pb.p, d, -(b.w / 2 - 4)), L = dist(p0, q); if (L < 60) { why('short'); continue; }
    // (a winding network's cross streets bow a little too, each the other way from the last: still within 6° of square)
    const A = (net.bow || 0) * L * ((net.nb = (net.nb || 0) + 1) % 2 ? 1 : -1), u = unit([q[0] - p0[0], q[1] - p0[1]]), path = dens([p0, q], 10).map((x, i, all) => add(x, [-u[1], u[0]], A * Math.sin(Math.PI * i / (all.length - 1))));
    const mid = dens(path, 8).slice(1, -1); if (mid.some(x => { const r = ri.inRow(x, a, -6); return r && r.s !== b; })) { why('row'); continue; }
    if (!mid.every(x => S.inRing(x, ctx.land)) || mid.some(x => net.res.some(r => S.inRing(x, r)) || ctx.solid.some(r => S.inRing(x, r)))) { why('land'); continue; }
    const near = (s, at) => { const ch = g.chains.find(c => c.list.some(x => x.s === s)), x = ch.list.find(y => y.s === s), cat = x.off + (x.rev ? g.M.get(s).L - at : at), mn = ch.coll ? R.collJunctionMin : R.junctionMin; return ch.J.some(j => along(ch, j.at, cat) < mn) || !ch.cyc && ((ch.a?.tee && cat < mn) || (ch.b?.tee && ch.L - cat < mn)); };
    if (near(a, g.M.get(a).proj(p).s) || near(b, pb.s)) { why('near'); continue; }
    if (opts.entry && dist(p, opts.entry) < ctx.R.entryClear) { why('entry'); continue; }
    return { path, b, len: L };
  }
  return null;
}
// a cul-de-sac off street a at p (tangent t) into open land, square to it: as long as the land allows (a lot band and a
// bulb short of any right-of-way, the land's edge, the pond's land or a solid), no longer than culMax; its path, or null
function courtFrom(ctx, net, g, ri, a, p, t, o = {}) {
  const R = ctx.R, n = [-t[1], t[0]], inLand = net.landTest ||= ringTest(ctx.land), clear = R.bulbRow + ctx.minD, core = net.sk?.core;
  // (its T the junction spacing from the others on that street and from the ends that T into another, as a cross street's;
  // on the way in, the entry's clear stretch first)
  const near = at => { const ch = g.chains.find(c => c.list.some(x => x.s === a)), x = ch.list.find(y => y.s === a), cat = x.off + (x.rev ? g.M.get(a).L - at : at), mn = ch.coll ? R.collJunctionMin : R.junctionMin; return ch.J.some(j => along(ch, j.at, cat) < mn) || !ch.cyc && ((ch.a?.tee && cat < mn) || (ch.b?.tee && ch.L - cat < mn)) || ch.list.some(y => y.s.role === 'entry') && cat < R.entryClear; };
  if (near(g.M.get(a).proj(p).s)) return null;
  for (const sg of o.one ? [1] : [1, -1]) { const d = [n[0] * sg, n[1] * sg], p0 = add(p, d, a.w / 2 - 4); let L = 0;
    for (let s = a.row / 2 + 10; s <= Math.min(o.max ?? 1e9, R.culMax - R.bulbR); s += 10) { const q = add(p, d, s + clear), side = [-d[1], d[0]], ok = [0, 1, -1].every(k => { const x = add(q, side, k * clear * 0.7); return inLand(x) && !ri.inRow(x, null) && !net.res.some(r => S.inRing(x, r)) && !ctx.solid.some(r => S.inRing(x, r)) && !(core && S.inRing(x, core)); }); if (!ok) break; L = s; }
    if (L >= 180) return { path: dens([p0, add(p, d, L)], 10) }; }
  return null;
}
// the first street centre line a ray from p along d meets within far (not `not`): { s, q, t }
function rayHitStreets(streets, p, d, far, not) { let best = null; const q1 = add(p, d, far); for (const s of streets) { const b = bbox(s.path); if (Math.max(p[0], q1[0]) < b[0] - 1 || Math.min(p[0], q1[0]) > b[2] + 1 || Math.max(p[1], q1[1]) < b[1] - 1 || Math.min(p[1], q1[1]) > b[3] + 1) continue; for (let i = 1; i < s.path.length; i++) { const t = X(p, q1, s.path[i - 1], s.path[i]); if (t != null && (s !== not || t * far > s.w) && (!best || t < best.t)) best = { t, s }; } } return best ? { s: best.s, q: add(p, d, best.t * far), t: best.t * far } : null; }
// pocket courts: land no lot reaches (deeper than a lot from every right-of-way, an acre or more of it) gets a cul-de-sac
// into it off the nearest street, square to it, where the junction spacing allows; looked for again while that makes
// courts (a big pocket a court only halves). Returns how many
function pocketCourts(ctx, net) { let made = 0; for (let pass = 0; pass < 3; pass++) { const k = pocketPass(ctx, net); made += k; if (!k) break; } return made; }
function pocketPass(ctx, net) {
  const R = ctx.R, all = () => net.streets.concat(net.entry ? [net.entry] : [], net.ways || []), hub = () => net.hubs || [net.entry, ...(net.ways || [])].filter(Boolean), reach = ctx.lotD + 15, cell = 40, core = net.sk?.core;
  const far = rowIndex(all().map(s => ({ s, path: s.path, h: s.row / 2 + reach })), net.discs.map(d => ({ d, c: d.c, r: R.bulbRow + reach }))), inLand = net.landTest ||= ringTest(ctx.land), b = bbox(ctx.land), nx = Math.ceil((b[2] - b[0]) / cell), ny = Math.ceil((b[3] - b[1]) / cell), free = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const p = [b[0] + (i + 0.5) * cell, b[1] + (j + 0.5) * cell]; free[j * nx + i] = inLand(p) && !far.inRow(p) && !net.res.some(r => S.inRing(p, r)) && !ctx.solid.some(r => S.inRing(p, r)) && !(core && S.inRing(p, core)) ? 1 : 0; }
  const seen = new Uint8Array(nx * ny), pockets = [];
  for (let k = 0; k < nx * ny; k++) { if (!free[k] || seen[k]) continue; const st = [k], cells = []; seen[k] = 1; while (st.length) { const c = st.pop(); cells.push(c); const i = c % nx, j = (c - i) / nx; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, bb = j + dj; if (a < 0 || bb < 0 || a >= nx || bb >= ny) continue; const q = bb * nx + a; if (free[q] && !seen[q]) { seen[q] = 1; st.push(q); } } }
    if (cells.length * cell * cell >= AC) pockets.push({ n: cells.length, c: cells.reduce((t, c) => [t[0] + (b[0] + (c % nx + 0.5) * cell) / cells.length, t[1] + (b[1] + (Math.floor(c / nx) + 0.5) * cell) / cells.length], [0, 0]) }); }
  if (net.within) pockets.splice(0, pockets.length, ...pockets.filter(p => S.inRing(p.c, net.within))); // (re-laying a block: pockets inside it only)
  let made = 0; if (DBG.on) console.log('  pockets', pockets.map(p => Math.round(p.n * cell * cell / AC * 10) / 10 + 'ac@' + p.c.map(Math.round)).join(' '));
  for (const pk of pockets.sort((x, y) => y.n - x.n)) {
    const g = graphOf(all(), net.discs, hub()), ri = rowIndex(all().map(s => ({ s, path: s.path, h: s.row / 2 })), net.discs.map(d => ({ d, c: d.c, r: R.bulbRow })));
    const host = net.streets.filter(s => !s.pseudo && s.role !== 'entry').map(s => { const m = g.M.get(s), q = m.proj(pk.c); return { s, m, at: q.s, d: q.d }; }).sort((x, y) => x.d - y.d);
    for (const h of host.slice(0, 3)) { const p = h.m.at(h.at).p; let t = h.m.tan(h.at); const v = [pk.c[0] - p[0], pk.c[1] - p[1]], L = Math.hypot(v[0], v[1]) || 1; if ((-t[1] * v[0] + t[0] * v[1]) < 0) t = [-t[0], -t[1]]; if ((-t[1] * v[0] + t[0] * v[1]) / L < 0.6 || net.discs.some(d => dist(d.c, p) < R.bulbRow + 40)) continue; // (square to the street, not off a cul-de-sac's bulb)
      const c = courtFrom(ctx, net, g, ri, h.s, p, t, { one: true, max: L + Math.sqrt(pk.n) * cell * 0.4 }); if (!c) continue;
      const st = mkStreet(ctx, 'court', c.path); net.streets.push(st); net.discs.push({ id: sid('b'), role: 'bulb', c: st.path[st.path.length - 1], R: R.bulbR, of: st.id }); made++; break; } }
  return made;
}
// a street end that T's in too near another junction (or a crossroads) becomes a cul-de-sac; long blocks get cross
// streets to the street alongside (staggered, so they make T's); a cul-de-sac too long gets one too, or is cut back;
// streets cut off from the entry get one to the nearest reached street, or go (blocks and cul-de-sacs held a little under
// the rules: drawn, the streets' curves come out a few feet longer). Changes net in place; returns the breaches left
export function connect(ctx, net) {
  const R = { ...ctx.R, blockMax: ctx.R.blockMax - 40, culMax: ctx.R.culMax - 25 }, all = () => net.streets.concat(net.entry ? [net.entry] : [], net.ways || []), hub = () => net.hubs || [net.entry, ...(net.ways || [])].filter(Boolean);
  // 1. T's too close together on one street (a T opposite another is a crossroads): the later street stops short in a bulb
  for (let pass = 0; pass < 3; pass++) { const g = graphOf(all(), net.discs, hub()); let changed = false;
    for (const ch of g.chains) { const mn = ch.coll ? R.collJunctionMin : R.junctionMin, keep = [];
      const fixed = j => j.from.role === 'entry' || j.from.role === 'coll' || j.from.role === 'cross'; // (the ways in, collectors and cross streets stay: the local streets near them give way)
      for (const j of ch.J.filter(fixed).concat(ch.J.filter(j => !fixed(j)))) { if (fixed(j)) { keep.push(j); continue; }
        const clash = keep.some(k => along(ch, k.at, j.at) < mn) || (!ch.cyc && ((ch.a?.tee && j.at < mn) || (ch.b?.tee && ch.L - j.at < mn))) || ch.list.some(x => x.s.role === 'entry') && j.at < R.entryClear;
        if (clash && !j.from.fixed && toBulb(ctx, net, j.from, j.p)) changed = true; else keep.push(j); } } // (a street held as it is, re-laying a block: never bulbed)
    if (!changed) break; }
  // 2. long blocks, long cul-de-sacs, streets cut off
  let n = 0;
  for (let it = 0; it < 80; it++) {
    const g = graphOf(all(), net.discs, hub()), br = breaches(R, g, net.rings), ri = rowIndex(all().map(s => ({ s, path: s.path, h: s.row / 2 })));
    const open = b => !net.fixed || b.chain.list.some(x => !x.s.fixed); // (re-laying a block: only the chains of its new streets are fixed up)
    const cut = br.find(b => b.kind === 'cut' && !b.tried && open(b)), blk = br.filter(b => b.kind === 'block' && !net.tried?.has(b.chain.list[0].s.id + '@' + Math.round(b.at / 50))).sort((a, b) => b.len - a.len)[0], cul = br.find(b => b.kind === 'cul' && open(b) && !net.tried?.has(b.chain.list[0].s.id + ':cul'));
    net.tried ||= new Set(); let done = false;
    if (cut) { // the streets cut off together: a cross street from one of them to the nearest reached street; else to any other
      // street (joined to another cut-off group first: together they may reach); else they go
      const comp = new Set(cut.chain.list.map(x => x.s)), st = [...comp]; while (st.length) { const x = st.pop(); for (const y of g.link.get(x) || []) if (!comp.has(y) && !g.reached.has(y)) { comp.add(y); st.push(y); } }
      const tryFrom = test => { for (const x of comp) { if (!net.streets.includes(x) || x.fixed) continue; const m = g.M.get(x); for (let s = 60; s < m.L - 60; s += 40) { const c = crossFrom(ctx, net, g, ri, x, m.at(s).p, m.tan(s), ctx.P * 2); if (c && test(c.b)) { net.streets.push(mkStreet(ctx, 'cross', c.path)); return true; } } } return false; };
      done = tryFrom(b => g.reached.has(b)); const key = [...comp].map(x => x.id).sort().join(',');
      if (!done && !net.tried.has(key)) { net.tried.add(key); done = tryFrom(b => !comp.has(b)); }
      if (!done) { net.streets = net.streets.filter(s => !comp.has(s) || s.fixed); net.discs = net.discs.filter(d => net.streets.some(s => s.id === d.of)); done = true; } // (a street held as it is stays, cut off or not)
    } else if (blk) { const ch = blk.chain, span = blk.b - blk.a, k = Math.ceil(span / R.blockMax) - 1 || 1, held = net.fixed && !open(blk), inside = P => !held || S.inRing(P[P.length >> 1], net.within), fr = n % 2 ? [0.58, 0.42, 0.5, 0.66, 0.34, 0.75, 0.25] : [0.42, 0.58, 0.5, 0.34, 0.66, 0.25, 0.75]; // (a held street's long block: a street into the block being laid only)
      for (const f of k > 1 ? [1 / (k + 1), 2 / (k + 1), 0.5, 0.4, 0.6] : fr) { const c0 = chainAt(g, ch, (blk.a + span * f) % ch.L); if (DBG.on) console.log(' block', Math.round(span), f, c0?.p.map(Math.round)); if (!c0) continue; const c = crossFrom(ctx, net, g, ri, c0.s, c0.p, c0.t, ctx.P * (ch.coll ? 2 : 1.45), { entry: net.entryAt }); if (c && inside(c.path)) { net.streets.push(mkStreet(ctx, 'cross', c.path)); n++; done = true; break; } }
      if (!done) for (const f of [0.5, 0.4, 0.6, 0.3, 0.7]) { const c0 = chainAt(g, ch, (blk.a + span * f) % ch.L); if (!c0) continue; const c = courtFrom(ctx, net, g, ri, c0.s, c0.p, c0.t); if (c && inside(c.path)) { const st = mkStreet(ctx, 'court', c.path); net.streets.push(st); net.discs.push({ id: sid('b'), role: 'bulb', c: st.path[st.path.length - 1], R: R.bulbR, of: st.id }); done = true; break; } } // (nothing alongside to cross to: a cul-de-sac into the land there)
      if (!done) net.tried.add(ch.list[0].s.id + '@' + Math.round(blk.at / 50));
    } else if (cul) { const ch = cul.chain, s0 = cul.end ? cul.j + R.culMax * 0.55 : cul.j - R.culMax * 0.55;
      for (const at of [s0, s0 + 60, s0 - 60, s0 + 120]) { const c0 = chainAt(g, ch, Math.max(30, Math.min(ch.L - 30, at))); if (!c0) continue; const c = crossFrom(ctx, net, g, ri, c0.s, c0.p, c0.t, ctx.P * 1.45); if (c) { net.streets.push(mkStreet(ctx, 'cross', c.path)); done = true; break; } }
      if (!done) { // nothing alongside to join: cut it back to the longest a cul-de-sac may run (its bulb moved in with it)
        const x = cul.end ? ch.list[ch.list.length - 1] : ch.list[0], st = x.s, m = g.M.get(st), d = net.discs.find(d => d.of === st.id && dist(d.c, cul.end ? (x.rev ? st.path[0] : st.path[st.path.length - 1]) : (x.rev ? st.path[st.path.length - 1] : st.path[0])) < d.R + 3), keepAt = cul.end ? cul.j + R.culMax - R.bulbR - 20 : cul.j - (R.culMax - R.bulbR - 20), loc = keepAt - x.off, ls = x.rev ? m.L - loc : loc;
        if (d && ls > 60 && ls < m.L - 60 && net.streets.includes(st) && !st.fixed) { const atEnd = cul.end !== x.rev; st.path = (atEnd ? st.path.filter((q, i) => m.c[i] < ls).concat([m.at(ls).p]) : [m.at(ls).p].concat(st.path.filter((q, i) => m.c[i] > ls))).map(q => [fit(q[0]), fit(q[1])]); d.c = atEnd ? st.path[st.path.length - 1] : st.path[0]; done = true; }
        else net.tried.add(ch.list[0].s.id + ':cul'); }
    }
    if (!done && !cut && !blk && !cul) break;
  }
  // 3. what's still too close: a cross street that meets a street too near another junction goes (when nothing is cut off
  // by it), a local street's T becomes a cul-de-sac
  for (let pass = 0; pass < 4; pass++) { const g = graphOf(all(), net.discs, hub()), close = breaches(R, g, net.rings).filter(b => b.kind === 'close' || b.kind === 'cross'); if (!close.length) break; let changed = false;
    for (const b of close) { const js = b.chain.J.filter(j => Math.abs(j.at - b.at) < (b.kind === 'cross' ? 30 : b.len + 1)).concat(b.chain.list.flatMap(x => { const e = [0, 1].map(k => g.ends.get(x.s.id + ':' + k)).filter(e => e?.tee && e.tee !== true && Math.abs((x.off + (x.rev ? g.M.get(x.s).L * (1 - e.k) : g.M.get(x.s).L * e.k)) - b.at) < b.len + 1); return e.map(e => ({ from: x.s, p: e.p })); }));
      // (a cross street goes first, when taking it cuts nothing off and leaves no block or cul-de-sac too long; else a local street's T)
      const long = gg => breaches(R, gg, net.rings).filter(b => b.kind === 'cul' || b.kind === 'block').length, n0 = long(g);
      for (const j of [...new Set(js.map(j => j.from))].filter(s => (s.role === 'cross' || s.role === 'local') && net.streets.includes(s) && !s.fixed).sort((a, b) => (a.role === 'cross' ? 0 : 1) - (b.role === 'cross' ? 0 : 1))) {
        if (j.role === 'cross') { const was = net.streets; net.streets = net.streets.filter(s => s !== j); const g2 = graphOf(all(), net.discs, hub()); if (net.streets.some(s => !g2.reached.has(s)) || long(g2) > n0) { net.streets = was; continue; } changed = true; break; }
        if (toBulb(ctx, net, j, js.find(x => x.from === j).p)) { changed = true; break; } } }
    if (!changed) break; }
  const g = graphOf(all(), net.discs, hub()); return breaches(R, g, net.rings);
}
// a street's end that T's in turned into a cul-de-sac: cut back to clear the street it met by a lot band and a bulb's
// right-of-way, a bulb at its new end; a street left too short goes. true when it changed
function toBulb(ctx, net, s, E) {
  const R = ctx.R, m = measured(s.path), k = dist(s.path[0], E) < dist(s.path[s.path.length - 1], E) ? 0 : 1, back = (s.ext?.[k] || 2 * ctx.lotD + 30) + R.bulbRow - s.row / 2 + 6;
  if (m.L - back < 150) { net.streets = net.streets.filter(x => x !== s); net.discs = net.discs.filter(d => d.of !== s.id); return true; }
  const keep = k ? m.L - back : back; s.path = (k ? s.path.filter((q, i) => m.c[i] < keep).concat([m.at(keep).p]) : [m.at(keep).p].concat(s.path.filter((q, i) => m.c[i] > keep))).map(q => [fit(q[0]), fit(q[1])]);
  if (s.ext) s.ext[k] = 0; net.discs.push({ id: sid('b'), role: 'bulb', c: k ? s.path[s.path.length - 1] : s.path[0], R: R.bulbR, of: s.id }); return true;
}

// ---------- the network for a skeleton and a pattern per pod ----------
// the entry's own line in (a street for the junction graph and the right-of-way, never fronted by lots): from the lot
// line to where it meets the skeleton
function entryStreet(ctx, sk, e = sk.entry, W = S.blvdWidth(ctx.ER)) { const host = sk.streets.find(s => S.segDist(e.to, s.path[0], s.path[1]) < 2 && s.entryClear) ? null : sk.streets.slice().sort((a, b) => measured(a.path).proj(e.to).d - measured(b.path).proj(e.to).d)[0], end = host ? add(e.to, e.dir, -(host.w / 2 - 4)) : e.to; return mkStreet(ctx, 'entry', dens([e.mouth, end], 10), { w: W, row: W + 42 }); }
export function buildNet(ctx, sk, pats, opts = {}) {
  const net = { kind: sk.kind, sk, streets: sk.streets.map(s => ({ ...s, path: s.path.slice() })), discs: [], res: sk.res, entryAt: sk.entry?.mouth, pats, rings: sk.ringAt ? [sk.ringAt] : [], bow: pats.some(p => p?.wave) ? 0.035 : 0 };
  if (sk.kind === 'pod') net.hubs = net.streets.filter(s => s.pseudo); // (a pod: reached from the collectors round it)
  if (sk.entry) net.entry = entryStreet(ctx, sk); net.ways = (sk.ways || []).map(w => ({ ...entryStreet(ctx, sk, w, ctx.R.collector.pave), mouth: w.mouth }));
  for (const s of net.streets) if (s.open) for (const k of [0, 1]) if (s.open[k]) { if (s.role !== 'coll') { const m = measured(s.path), back = ctx.R.bulbRow - s.row / 2 + 6, keep = k ? m.L - back : back; s.path = (k ? s.path.filter((q, i) => m.c[i] < keep).concat([m.at(keep).p]) : [m.at(keep).p].concat(s.path.filter((q, i) => m.c[i] > keep))).map(q => [fit(q[0]), fit(q[1])]); } net.discs.push({ id: sid('b'), role: 'bulb', c: k ? s.path[s.path.length - 1] : s.path[0], R: ctx.R.bulbR, of: s.id }); }
  const base = net.streets.slice(); net.pods = sk.pods.map(ring => ({ ring, edges: podEdges(ctx, ring, base) }));
  net.pods.forEach((pod, i) => { const pat = pats[i]; if (!pat) return; const r = podStreets(ctx, pod, pat); if (r) { net.streets.push(...r.streets); net.discs.push(...r.discs); } });
  net.issues = opts.noConnect ? [] : connect(ctx, net);
  if (!opts.noConnect && pocketCourts(ctx, net)) net.issues = breaches(ctx.R, graphOf(net.streets.concat(net.entry ? [net.entry] : [], net.ways || []), net.discs, net.hubs || [net.entry, ...(net.ways || [])].filter(Boolean)), net.rings);
  if (!opts.noConnect && net.entry && net.ways.length < ctx.ways) waysIn(ctx, net); // (the skeleton brought too few: to the streets inside)
  return net;
}
// more ways in, where the skeleton's own don't make up what the site wants (a loop round the lake, a main street): from
// the front or a side street, square to it, straight in to the nearest street that isn't a cul-de-sac, or to the end of
// a cul-de-sac coming this way (its bulb goes: never a drive into a bulb), within 600 ft, crossing no other right-of-way,
// the pond's land or a solid, its T clear of the junctions on that street; the mouths the driveway spacing from the main
// entry and each other and clear of the corners. Adds to net.ways
function waysIn(ctx, net) {
  const { plan, ER, R, F } = ctx, ring = plan.ring, n = ring.length, cs = S.streetCorners(plan), fa = ring[F.f], fb = ring[(F.f + 1) % n], gap = Math.max(ER.spacing, Math.min(400, dist(fa, fb) * 0.25));
  const culs = new Set(net.discs.map(d => d.of)), to = net.streets.filter(s => !s.pseudo && s.role !== 'court' && s.role !== 'entry' && !culs.has(s.id)), mouths = [net.entryAt, ...net.ways.map(w => w.mouth)].filter(Boolean), at = [];
  for (let j = 0; j < n; j++) if (j !== F.f && ctx.rules[j].street && S.edgeLen(ring, j) >= 400) for (const t of [0.5, 0.35, 0.65]) at.push({ j, t });
  for (const t of [0.22, 0.78, 0.3, 0.7, 0.15, 0.85, 0.26, 0.74, 0.18, 0.82]) at.push({ j: F.f, t });
  let gr = null, rx = null; // (the junctions and the rights-of-way, worked out again when a way is added)
  for (const { j, t } of at) { if (net.ways.length >= ctx.ways) break;
    const a = ring[j], b = ring[(j + 1) % n], md = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], o = S.outwardOf(ring, j), d = [-o[0], -o[1]];
    if (mouths.some(m => dist(m, md) < gap) || cs.some(c => dist(c, md) < ER.corner + 150)) continue;
    const hit = rayHitStreets(to, add(md, d, 1), d, 600), why = w => { if (DBG.on) console.log('  way', j, t, md.map(Math.round), w); };
    // a cul-de-sac's bulb met first, its street coming this way: its end opened up to the street instead (a way in, not a
    // cul-de-sac turned into a through route by a drive into its bulb)
    const bulb = net.discs.filter(c => c.role === 'bulb').map(c => ({ c, t: dot([c.c[0] - md[0], c.c[1] - md[1]], d), off: Math.abs(dot([c.c[0] - md[0], c.c[1] - md[1]], [-d[1], d[0]])) })).filter(b => b.t > 60 && b.t < 600 && b.off < R.bulbR && (!hit || b.t < hit.t + 20)).sort((a, b) => a.t - b.t)[0];
    if (bulb) { const st = net.streets.find(x => x.id === bulb.c.of), P = st?.path, k = P && (dist(P[P.length - 1], bulb.c.c) < 1 ? 1 : dist(P[0], bulb.c.c) < 1 ? 0 : -1);
      if (st && k >= 0 && (st.role === 'local' || st.role === 'court')) { const m = measured(P), u = k ? m.tan(m.L - 1) : m.tan(1).map(v => -v), path = dens([md, bulb.c.c], 10), ri = rx ||= rowIndex(net.streets.concat([net.entry], net.ways).map(x => ({ s: x, path: x.path, h: x.row / 2 })));
        const g = gr ||= graphOf(net.streets.concat([net.entry], net.ways), net.discs, [net.entry, ...net.ways]), ch = g.chains.find(c => c.list.some(x => x.s === st)), x = ch?.list.find(y => y.s === st), cat = x && x.off + (x.rev ? m.L - (k ? m.L : 0) : (k ? m.L : 0)); // (its junctions a spacing back from the end that opens)
        if (ch && !ch.J.some(q => along(ch, q.at, cat) < R.junctionMin) && dot(u, [-d[0], -d[1]]) >= 0.82 && !path.slice(1, -3).some(x => { const r = ri.inRow(x, st); return r && r.s !== st; }) && !path.some(x => net.discs.some(c => c !== bulb.c && dist(x, c.c) < R.bulbRow + 10) || net.res.some(r => S.inRing(x, r)) || ctx.solid.some(r => S.inRing(x, r)))) {
          net.discs = net.discs.filter(c => c !== bulb.c); net.ways.push({ ...mkStreet(ctx, 'entry', path, { w: R.collector.pave, row: R.collector.pave + 42 }), mouth: md }); mouths.push(md); gr = rx = null; continue; } }
      why('a bulb'); continue; }
    if (!hit || hit.t < 60) { why('no street'); continue; }
    const g = gr ||= graphOf(net.streets.concat([net.entry], net.ways), net.discs, [net.entry, ...net.ways]), m = g.M.get(hit.s), pb = m.proj(hit.q); if (Math.abs(dot(m.tan(pb.s), d)) > 0.5) { why('angle'); continue; } // (square to it, within 30°)
    const ri = rx ||= rowIndex(net.streets.concat([net.entry], net.ways).map(s => ({ s, path: s.path, h: s.row / 2 }))), end = add(pb.p, d, -(hit.s.w / 2 - 4)), path = dens([md, end], 10), mid = path.slice(1, -1);
    if (mid.some(x => { const r = ri.inRow(x, hit.s); return r && r.s !== hit.s; }) || mid.some(x => net.discs.some(c => dist(x, c.c) < R.bulbRow + 10) || net.res.some(r => S.inRing(x, r)) || ctx.solid.some(r => S.inRing(x, r)) || net.sk?.core && S.inRing(x, net.sk.core))) { why('crosses'); continue; }
    const ch = g.chains.find(c => c.list.some(x => x.s === hit.s)), x = ch.list.find(y => y.s === hit.s), cat = x.off + (x.rev ? m.L - pb.s : pb.s), mn = ch.coll ? R.collJunctionMin : R.junctionMin;
    if (ch.J.some(q => along(ch, q.at, cat) < mn) || !ch.cyc && ((ch.a?.tee && cat < mn) || (ch.b?.tee && ch.L - cat < mn))) { why('near a junction'); continue; }
    net.ways.push({ ...mkStreet(ctx, 'entry', path, { w: R.collector.pave, row: R.collector.pave + 42 }), mouth: md }); mouths.push(md); gr = rx = null; }
}

// ---------- lots along the streets ----------
// which side of street s (1 its left, -1 its right) a junction on it comes in from (j: a graphOf J entry)
const sideOfJ = (s, j) => { const P = j.from.path, a = dist(P[0], j.p) <= dist(P[P.length - 1], j.p), q = a ? P[Math.min(3, P.length - 1)] : P[Math.max(0, P.length - 4)], m = measured(s.closed ? s.path.concat([s.path[0]]) : s.path), pr = m.proj(j.p), t = m.tan(pr.s); return t[0] * (q[1] - pr.p[1]) - t[1] * (q[0] - pr.p[0]) >= 0 ? 1 : -1; };
// the junctions a side of a street's lots run between: all of them; a side kept as it was when a block was re-laid across
// the street (s.keep: { side, at }), those it had then and any come in on that side since
const keptJ = (s, side, gJ) => { const J = gJ.get(s) || []; return s.keep?.side === side ? s.keep.at.concat(J.filter(j => sideOfJ(s, j) === side).map(j => j.p)) : J.map(j => j.p); };
// Lots by arc length along each side of every street, square to it: each as wide at the building line (20 ft in) as its
// home type needs, so lots round a bulb or on the outside of a bend are wedges; as deep as the land allows (a ray to the
// lot line, the pond's land or a solid; halfway to another street's frontage, so lots meet back to back); refused when
// too shallow, too narrow at the back, over a right-of-way, outside the land or over a lot placed already, or when its
// home doesn't fit. Bulbs first, then local, cross, collector streets, each from the entry out (a count asked for fills
// from the entry). The home 20 ft back from the right-of-way, turned to face the street; a driveway to it.
// net: { streets, discs, entry }, opts: { mix, max, plans (the builder's house plans; false: plain boxes), solid,
// skip: [ring] (no lots in) }. Returns { els, frontage (ft of street side holding lots), homes, onBulbs }
export function marchLots(ctx, net, opts = {}) {
  const { R, lotD, minD, maxD } = ctx, BL = R.frontBL, land = opts.land || ctx.land, build = opts.build || ctx.build, mix = (opts.mix || ctx.home?.homeMix || S.HOME_MIX).filter(t => t.pct > 0), tot = mix.reduce((t, m) => t + m.pct, 0) || 1, count = {};
  // the home types in turn, each street side its own run of a balanced sequence (started at a place its geometry picks), so a
  // street bent or a lot lost on one leaves the types along the others where they were
  const pick = (k, c) => mix.reduce((best, t) => { const want = (k + 1) * t.pct / tot - (c[t.stories] || 0); return !best || want > best.want ? { t, want } : best; }, null).t;
  const runOf = key => { let h = 7; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0; const c = {}, k0 = h % 20; for (let k = 0; k < k0; k++) { const t = pick(k, c); c[t.stories] = (c[t.stories] || 0) + 1; } return { c, k: k0 }; };
  const rows = net.streets.map(s => ({ s, path: s.path, h: s.row / 2 })).concat([net.entry, ...(net.ways || [])].filter(Boolean).map(s => ({ s, path: s.path, h: s.row / 2 }))), discs = net.discs.map(d => ({ d, c: d.c, r: R.bulbRow, of: rows.find(r => r.s.id === d.of) || null }));
  const ri = rowIndex(rows, discs), inRow = (p, not, m = 0) => ri.inRow(p, not, m);
  const solid = (opts.solid || []).concat(net.res || [], ctx.solid).map(q => ({ q, b: bbox(q) })), inSolid = p => solid.some(o => p[0] >= o.b[0] && p[0] <= o.b[2] && p[1] >= o.b[1] && p[1] <= o.b[3] && S.inRing(p, o.q));
  const inLand = ringTest(land);
  // how deep a lot can go from p along n: to the land's edge or a solid, or halfway to another street's frontage
  // (looked at every 10 ft, then 5 ft back from where it first meets something or the land stops being looked at: as
  // every 5 ft, in half the time)
  const hit = (p, n, me, s0, gap, t) => { const q = add(p, n, t); return t <= maxD + 5 && (!inLand(q) || inSolid(q)) ? 1 : inRow(q, me) || s0 != null && ri.inSelf(q, me, s0, gap) ? 2 : 0; };
  const depth = (p, n, me, s0 = null, gap = 0) => { for (let t = 10; t <= 2 * maxD + 15; t += 10) { let k = t <= 2 * maxD + 10 ? hit(p, n, me, s0, gap, t) : 0, at = t; const k5 = k || t > 2 * maxD + 10 || t > maxD + 5 && t - 5 <= maxD + 5 ? hit(p, n, me, s0, gap, t - 5) : 0; if (k5) { k = k5; at = t - 5; } if (!k) continue; return k === 1 ? Math.min(maxD, at - 5) : (at - 5) / 2 >= minD ? Math.min(maxD, (at - 5) / 2) : Math.min(maxD, at - 5); } return maxD; };
  const out = [], placed = S.gridIndex([], x => x.b, 200); let n = 0, frontage = 0, onBulbs = 0;
  const free = q => { const b = bbox(q), g = S.grow(ccw(q), -0.6); for (const o of placed.near(...b)) if (S.rectsOverlap({ poly: g }, { poly: o.q }, 0)) return false; return true; };
  const at0 = net.entryAt || S.centroid(land), near0 = r => { const m = measured(r.path); return Math.min(dist(r.path[0], at0), dist(r.path[r.path.length - 1], at0), dist(m.at(m.L / 2).p, at0)); };
  // each street marched a block at a time, between the streets that meet it (a street bent or a lot lost moves the lots of
  // its own block only); off: the block's start along its street
  const gJ = graphOf(net.streets.concat(net.entry ? [net.entry] : [], net.ways || []), net.discs).J, piecesOf = (r, J0 = null) => {
    const J = J0 || (gJ.get(r.s) || []).map(j => j.p); if (!J.length) return [{ path: r.s.closed ? r.path.concat([r.path[0]]) : r.path, off: 0 }];
    if (r.s.closed) { const m = measured(r.path.concat([r.path[0]])); return breakRing(r.path, J).map(p => ({ path: p, off: m.proj(p[0]).s })); }
    const m = measured(r.path), cuts = [0, ...[...new Set(J.map(q => Math.round(m.proj(q).s)))].filter(v => v > 20 && v < m.L - 20).sort((a, b) => a - b), m.L];
    return cuts.slice(1).map((s1, i) => ({ path: [m.at(cuts[i]).p, ...r.path.filter((q, k) => m.c[k] > cuts[i] + 1 && m.c[k] < s1 - 1), m.at(s1).p], off: cuts[i] })); };
  // (bare: streets cut off from every way in, no lots on them; near: a count asked for, the blocks nearest the entry first)
  const bare = opts.bare || new Set(), RANK = { local: 1, cross: 2, court: 1, coll: 3 }, order = discs.filter(d => !bare.has(d.d.of) && !bare.has(d.d.id)).map(d => ({ bulb: d, path: dens(S.ringDisc(d.c, R.bulbR / 2, 24).concat([S.ringDisc(d.c, R.bulbR / 2, 24)[0]]), 6), h: R.bulbRow - R.bulbR / 2, me: d, sides: [-1] }))
    .concat(rows.filter(r => r.s.role !== 'entry' && !(r.s.role === 'coll' && !R.collFront) && !bare.has(r.s.id)).sort((a, b) => (RANK[a.s.role] || 2) - (RANK[b.s.role] || 2) || near0(a) - near0(b)).flatMap(r => { const self = r.s.closed || swing(r.path) > Math.PI / 3, kp = r.s.keep;
      return (kp ? [[[kp.side], keptJ(r.s, kp.side, gJ)], [[-kp.side], null]] : [[[1, -1], null]]).flatMap(([sides, J]) => piecesOf(r, J).filter(pc => !(r.s.entryClear && !pc.off && !r.s.closed)).map(pc => ({ s: r.s, path: pc.path, off: pc.off, h: r.h, me: r, sides, self }))); })); // (keep: a side whose lots run between the junctions it had before a block was re-laid across the street) // (self: a street that bends far enough to come back near itself, its own far side a limit too; the street in from a way in has no homes on it before its first junction)
  if (opts.near && opts.max != null) { // (in stretches of 400 ft at most, so a long block fills only as far as it's near)
    const chunks = r => { if (r.bulb) return [r]; const m = measured(r.path), n = Math.ceil(m.L / 400); if (n < 2) return [r]; return Array.from({ length: n }, (_, i) => { const a = m.L * i / n, b = m.L * (i + 1) / n; return { ...r, path: [m.at(a).p, ...r.path.filter((q, k) => m.c[k] > a + 1 && m.c[k] < b - 1), m.at(b).p], off: (r.off || 0) + a }; }); };
    const gap = r => Math.min(...(r.bulb ? [r.bulb.c] : dens(r.path, 40)).map(p => dist(p, at0))), all = order.flatMap(chunks); all.forEach(r => { r.gap = gap(r); }); order.splice(0, order.length, ...all.sort((a, b) => a.gap - b.gap)); }
  const plansFor = st => opts.plans === false ? [] : HOUSE_PLANS.filter(hp => hp.floors === st && hp.lotW <= S.HOME_TYPES[st].lotW && !/rear-load/.test(hp.id));
  const HP = opts.plans === false ? [] : ctx.home?.plans || []; // a home size or a number of floor plans asked for: those plans in turn, each lot as wide as its plan needs
  for (const r of order) for (const side of r.sides) {
    const m = measured(r.path), h = r.h, F = s => { const a = m.at(s), t = m.tan(s), nv = [-t[1] * side, t[0] * side]; return { p: add(a.p, nv, h), n: nv, t }; }, run = runOf(r.path[0].map(v => Math.round(v)).join(',') + ':' + Math.round(m.L) + ':' + side);
    let s = 0;
    while (s < m.L && (opts.max == null || n < opts.max)) {
      const H0 = HP.length ? HP[run.k % HP.length] : null, T = H0 ? { stories: H0.floors } : pick(run.k, run.c), T0 = S.HOME_TYPES[T.stories]; let lw = Math.max(H0 ? H0.lotW : T0.lotW, R.minLotW), D = 0, nk = 0, fr = [], dp = maxD; // (a rule sheet's narrowest lot)
      // the lot as wide as its home type needs at the building line (20 ft back, or the rule sheet's); its front along the street
      const B = s0 => { const f = F(s0); return add(f.p, f.n, BL); }, fw = R.minLotW && !r.bulb, lay = () => { D = lw; for (let k = 0; k < 3; k++) { const w = dist(B(s), B(s + D)) || 1; D *= Math.max(lw / w, fw ? R.minLotW / (dist(F(s).p, F(s + D).p) || 1) : 0); } nk = Math.max(2, Math.ceil(D / 10)); fr = []; for (let k = 0; k <= nk; k++) fr.push(F(s + D * k / nk)); }; // (and a rule sheet's frontage along the right-of-way line, out of a bend too)
      const bad = () => fr.some(f => inRow(f.p, r.me, R.cornerClear) || !inLand(f.p)) || r.s?.entryClear && (r.s.clearAt || net.entryAt) && fr.some(f => dist(f.p, r.s.clearAt || net.entryAt) < R.entryClear), deep = () => { dp = maxD; for (const f of [fr[0], fr[nk >> 1], fr[nk]]) { dp = Math.min(dp, depth(f.p, f.n, r.me, r.self ? (r.off || 0) + s + D / 2 : null, h + D / 2 + 30)); if (dp < minD) break; } };
      lay(); if (s + D > m.L + 0.5) break; if (bad()) { s += 5; continue; } deep(); if (dp < minD) { s += 5; continue; }
      if (R.minLotSf && lw * dp < R.minLotSf) { lw = R.minLotSf * 1.03 / dp; lay(); if (s + D > m.L + 0.5) break; if (bad()) { s += 5; continue; } deep(); if (dp < minD || lw * dp < R.minLotSf) { s += 5; continue; } } // (a rule sheet's smallest lot: a shallow one wider)
      const mD = R.minLotSf ? Math.max(minD, R.minLotSf / lw) : minD;
      const f0 = fr[0], f1 = fr[fr.length - 1], shape = d => { const rear = fr.map(f => add(f.p, f.n, d)); return { rear, poly: fr.map(f => f.p).concat(rear.slice().reverse()), sides: [0.5, 1].flatMap(k => [add(f0.p, f0.n, d * k), add(f1.p, f1.n, d * k)]).concat(rear) }; };
      let { rear, poly, sides } = shape(dp); const fits = () => !(dist(rear[0], rear[rear.length - 1]) < lw * 0.45 || sides.some(q => inRow(q, null) || !inLand(q) || inSolid(q)) || discs.some(d => d.d !== r.me && (S.inRing(d.c, poly) || toPoly(d.c, poly) < R.bulbR + 2))); // (a bulb beside it: the lot's own sides kept off its paving too)
      if (!fits()) { s += 5; continue; }
      if (!free(poly)) { let ok = false; for (let d = Math.floor((dp - 1) / 10) * 10; d >= mD && !ok; d -= 10) { ({ rear, poly, sides } = shape(d)); if (fits() && free(poly)) { ok = true; dp = d; } } if (!ok) { s += 5; continue; } } // (the lots behind reached further: a shallower lot, down to the least depth, where it's free)
      if (R.minLotSf && area(poly) < R.minLotSf) { s += 5; continue; } // (a wedge under a rule sheet's smallest lot)
      const mid = F(s + D / 2), ang = Math.atan2(mid.t[1], mid.t[0]) * 180 / Math.PI * (side > 0 ? 1 : 1) + (side > 0 ? 0 : 180), inner = S.grow(ccw(poly), -4), pl = H0 ? [H0, ...HP.filter(h => h !== H0 && h.lotW <= H0.lotW)] : plansFor(T.stories), k0 = H0 ? 0 : (run.k * 7 + Math.round(s)) % Math.max(1, pl.length);
      let house = null;
      for (const H of pl.length ? pl.slice(k0).concat(pl.slice(0, k0)).concat(H0 ? [] : [null]) : [null]) { const Tt = H ? { w: H.w, d: H.d, sf: H.sf, plan: H } : T0, hc = add(mid.p, mid.n, BL + Tt.d / 2); // (plans asked for: one of them, never a plain box of another size)
        const hs = { kind: 'building', x: fit(hc[0]), y: fit(hc[1]), w: Tt.w, d: Tt.d, rot: +(((ang % 360) + 360) % 360).toFixed(2), use: 'sfr', floors: H ? H.floors : T.stories, units: 1, sf: Tt.sf, nowalk: true, note: Tt.plan ? Tt.plan.note : T.stories + '-story · ' + T0.sf.toLocaleString('en-US') + ' sf', ...(Tt.plan ? { type: Tt.plan.id } : {}) };
        if (S.corners(hs).every(q => S.inRing(q, inner) && S.inRing(q, build) && !inRow(q, null) && !inSolid(q) && (!R.strict || m.proj(q).d >= h + BL - 1.5 && !inRow(q, r.me, R.sideBL) && !discs.some(x => x.of === r.me && x !== r.me && dist(q, x.c) < R.bulbRow + BL - 1.5)))) { house = hs; break; } } // (a rule sheet's building lines: its front one from its own street, round a bend and its own cul-de-sac too, its side one from any other)
      if (!house) { s += 5; continue; }
      const gx = add(mid.p, mid.t, (house.w / 2 - 10) * side), dc = add(gx, mid.n, (BL - 11) / 2); // the garage side: the driveway from the pavement's edge to the home's front
      out.push({ kind: 'lot', poly: poly.map(q => q.map(fit)), ...xyOf(poly), x: fit(S.centroid(poly)[0]), y: fit(S.centroid(poly)[1]), name: '', note: Math.round(lw) + ' × ' + Math.round(dp) + ' ft lot', on: r.bulb ? r.bulb.d.id : r.s.id }, house, { kind: 'plaza', x: fit(dc[0]), y: fit(dc[1]), w: 16, d: BL + 11, rot: house.rot, name: '', note: 'Driveway' });
      placed.add({ q: poly, b: bbox(poly) }); count[T.stories] = (count[T.stories] || 0) + 1; run.c[T.stories] = (run.c[T.stories] || 0) + 1; run.k++; n++; frontage += D; if (r.bulb || r.s?.role === 'court') onBulbs++; s += D;
    }
  }
  return { els: out, frontage, homes: n, onBulbs };
}

// a count of homes asked for: the local streets (and their bulbs) with no lot on them go, last laid first, as long as
// every street that has lots still reaches the entry; their drives go from els too
function prune(ctx, net, lots, els, T = null, ent = []) {
  const g0 = graphOf(net.streets.concat(net.entry ? [net.entry] : [], net.ways || []), net.discs), met = new Set((net.ways || []).map(w => g0.ends.get(w.id + ':1')).map(e => e?.tee?.id || e?.join?.id).filter(Boolean)); // (the streets the ways in meet: kept, so each way in stays one)
  const on = new Set(lots.filter(e => e.kind === 'lot').map(e => e.on)), hub = net.hubs || [net.entry].filter(Boolean), used = s => on.has(s.id) || met.has(s.id) || net.discs.some(d => d.of === s.id && on.has(d.id));
  // (the junction graph lets a T stop a few feet short of the street it meets; the drives as drawn must touch: checked on
  // the drawn pieces, every step, when the quick way leaves a street with homes cut off)
  const drawnOk = () => { if (!T?.reach) return true; const d = netEls(ctx, net), seen = T.reach(d.concat(ent.filter(e => !(net.ways || []).some(w => w.ents?.includes(e.id))))); return d.every(e => seen.has(e.id) || !used({ id: e.net })); }; // (from the main entry)
  const run = slow => { for (let pass = 0; pass < 3; pass++) { let gone = 0;
    for (const s of net.streets.slice().reverse()) { if (s.role === 'coll' || s.pseudo || used(s)) continue; const was = net.streets; net.streets = net.streets.filter(x => x !== s);
      const g = graphOf(net.streets.concat(net.entry ? [net.entry] : [], net.ways || []), net.discs, hub); if (net.streets.some(x => used(x) && !g.reached.has(x)) || slow && !drawnOk()) { net.streets = was; continue; } gone++; }
    if (!gone) break; } };
  const all0 = net.streets.slice(); run(false); if (!drawnOk()) { net.streets = all0; run(true); } if (globalThis.SP_DEBUG > 1) console.log('  prune', all0.length, '>', net.streets.length, drawnOk());
  const ids = new Set(net.streets.map(s => s.id)); net.discs = net.discs.filter(d => ids.has(d.of));
  for (let i = els.length - 1; i >= 0; i--) if (els[i].kind === 'drive' && els[i].net) els.splice(i, 1); els.push(...netEls(ctx, net)); // (drawn again: a loop street's pieces break where the streets gone met it)
}
// a count asked for: only the streets its homes need are built in this phase. The network in blocks (each street between
// the places others meet it), the blocks with homes on them kept and the shortest way to each from the ways in; the rest
// of each street, and the streets and ways in nothing needs, aren't built yet (a street kept in part stops at the junction
// past its last block). Changes net, els (the drives drawn again), ent (a way in not needed goes) and the lots' streets;
// false, changing nothing, when what's drawn wouldn't reach every home
function phaseNet(ctx, net, lots, els, T, ent, trim = true) {
  const ins = [net.entry, ...(net.ways || [])].filter(Boolean); if (net.hubs || !net.entry) return false;
  const g = graphOf(net.streets.concat(ins), net.discs, ins), M = g.M, endOf = (t, p) => dist(t.path[0], p) < dist(t.path[t.path.length - 1], p) ? 0 : 1;
  const node = (s, k) => { const e = g.ends.get(s.id + ':' + k); return !e ? s.id + ':' + k : e.tee && e.tee !== true ? 'T' + s.id + ':' + k : e.join ? [s.id + ':' + k, e.join.id + ':' + e.jk].sort().join('=') : s.id + ':' + k; };
  // the blocks: [{ s, a, b (along s), na, nb (the junctions at either end), len, homes }]
  const blocks = [];
  for (const s of net.streets.concat(ins)) { const L = M.get(s).L, js = (g.J.get(s) || []).map(j => ({ at: j.at, n: 'T' + j.from.id + ':' + endOf(j.from, j.p) })).sort((x, y) => x.at - y.at);
    if (s.closed) { if (!js.length) blocks.push({ s, a: 0, b: L, na: 'C' + s.id, nb: 'C' + s.id, len: L }); js.forEach((j, i) => { const nx = js[(i + 1) % js.length]; blocks.push({ s, a: j.at, b: i + 1 < js.length ? nx.at : nx.at + L, na: j.n, nb: nx.n, len: (i + 1 < js.length ? nx.at : nx.at + L) - j.at }); }); continue; }
    const pos = [{ at: 0, n: node(s, 0) }, ...js.filter(j => j.at > 1 && j.at < L - 1), { at: L, n: node(s, 1) }]; for (let i = 1; i < pos.length; i++) blocks.push({ s, a: pos[i - 1].at, b: pos[i].at, na: pos[i - 1].n, nb: pos[i].n, len: pos[i].at - pos[i - 1].at }); }
  const blockAt = (s, at) => blocks.find(b => b.s === s && (at >= b.a - 1 && at <= b.b + 1 || s.closed && at + M.get(s).L <= b.b + 1)), byId = new Map(net.streets.map(s => [s.id, s])), dOf = new Map(net.discs.map(d => [d.id, d])), where = new Map();
  for (const l of lots.filter(e => e.kind === 'lot')) { const d = dOf.get(l.on), s = byId.get(d ? d.of : l.on); if (!s) continue; const b = blockAt(s, M.get(s).proj(d ? d.c : [l.x, l.y]).s); if (b) { b.homes = (b.homes || 0) + 1; where.set(l, b); } }
  // the shortest way to each block with homes from the main entry
  const adj = new Map(), link = (n, b) => (adj.get(n) || adj.set(n, []).get(n)).push(b); for (const b of blocks) if (b.s.role !== 'entry') { link(b.na, b); link(b.nb, b); }
  const D = new Map(), via = new Map(), q = []; for (const w of [net.entry]) { const n = node(w, 1); D.set(n, 0); q.push(n); } // (from the main entry: the phase's streets one network, its other ways in kept where they meet them)
  while (q.length) { q.sort((x, y) => D.get(y) - D.get(x)); const n = q.pop(); for (const b of adj.get(n) || []) { const m = b.na === n ? b.nb : b.na, d = D.get(n) + b.len; if (d < (D.get(m) ?? Infinity)) { D.set(m, d); via.set(m, b); q.push(m); } } }
  const keep = new Set(); for (const b of blocks.filter(b => b.homes)) { keep.add(b); let n = (D.get(b.na) ?? Infinity) <= (D.get(b.nb) ?? Infinity) ? b.na : b.nb; for (let k = 0; via.has(n) && k < 10000; k++) { const e = via.get(n); keep.add(e); n = e.na === n ? e.nb : e.na; } }
  if (![...keep].length) return false;
  // a street left ending short of where it went (not at a bulb) further from the last junction than a cul-de-sac may run:
  // joined on to the streets kept by the shortest way, so no long dead end waits for the next phase
  const deg = () => { const m = new Map(); for (const b of keep) for (const n of [b.na, b.nb]) m.set(n, (m.get(n) || 0) + 1); for (const w of ins) m.set(node(w, 1), (m.get(node(w, 1)) || 0) + 1); return m; }, full = new Map(); for (const b of blocks) for (const n of [b.na, b.nb]) full.set(n, (full.get(n) || 0) + 1);
  for (let it = 0; it < 12; it++) { const dg = deg(); let fixed = false;
    for (const n of [...dg.keys()].filter(n => dg.get(n) === 1 && full.get(n) > 1)) { let len = 0, at = n, seen = new Set(); for (let k = 0; k < 50; k++) { const b = [...keep].find(b => !seen.has(b) && (b.na === at || b.nb === at)); if (!b) break; seen.add(b); len += b.len; at = b.na === at ? b.nb : b.na; if (dg.get(at) !== 2) break; }
      if (len <= ctx.R.culMax - 50) continue; const own = new Set([...seen].flatMap(b => [b.na, b.nb])), on = new Set([...keep].flatMap(b => [b.na, b.nb]).filter(x => !own.has(x))), D2 = new Map([[n, 0]]), via2 = new Map(), q2 = [n]; let hit = null;
      while (q2.length && !hit) { q2.sort((x, y) => D2.get(y) - D2.get(x)); const m = q2.pop(); if (m !== n && on.has(m)) { hit = m; break; } for (const b of adj.get(m) || []) { if (seen.has(b)) continue; const o = b.na === m ? b.nb : b.na, d = D2.get(m) + b.len; if (d < (D2.get(o) ?? Infinity) && d <= 0.6 * len) { D2.set(o, d); via2.set(o, b); q2.push(o); } } } // (a short way round only: not a long street with nothing on it)
      if (hit) { for (let m = hit, k = 0; via2.has(m) && k < 1000; k++) { const b = via2.get(m); keep.add(b); m = b.na === m ? b.nb : b.na; } fixed = true; break; } }
    if (!fixed) break; }
  // the streets again from their blocks kept (a run of blocks one street each); the ways in that meet none of them go
  const was = { streets: net.streets, discs: net.discs, ways: net.ways }, out = [], idOf = new Map(), touched = new Set([...keep].flatMap(b => [b.na, b.nb]));
  const dg = deg(), loose = n => dg.get(n) === 1 && full.get(n) > 1; // (a junction whose other streets aren't built yet)
  for (const s of net.streets) { const mine = blocks.filter(b => b.s === s), kb = mine.filter(b => keep.has(b)); if (!kb.length) continue; if (kb.length === mine.length && !(trim && kb.some(b => loose(b.na) || loose(b.nb)))) { out.push(s); continue; }
    const m = s.closed ? measured(s.path.concat([s.path[0]])) : M.get(s), L = m.L, runs = []; for (const b of kb.sort((x, y) => x.a - y.a)) { const r = runs[runs.length - 1]; if (r && b.a - r.b < 40) { r.b = b.b; r.bs.push(b); } else runs.push({ a: b.a, b: b.b, bs: [b] }); } // (two T's a few feet apart: the sliver between them kept too)
    if (s.closed && runs.length > 1 && runs[0].a + L - runs[runs.length - 1].b < 40) { const r = runs.pop(); runs[0] = { a: r.a, b: runs[0].b + L, bs: r.bs.concat(runs[0].bs) }; }
    const at = v => m.at(s.closed ? ((v % L) + L) % L : v).p, sub = (a, b) => { const inside = []; for (let k = 0; k < (s.closed ? 2 : 1); k++) s.path.forEach((p, i) => { const v = m.c[i] + k * L; if (v > a + 1 && v < b - 1) inside.push([v, p]); }); return [at(a), ...inside.sort((x, y) => x[0] - y[0]).map(x => x[1]), at(b)]; };
    // (a run ending where the streets it met aren't built yet stops just past its last lot)
    const span = r => { let lo = Infinity, hi = -Infinity; const at = v => { lo = Math.min(lo, v); hi = Math.max(hi, v); }; for (const [l, b] of where) if (r.bs.includes(b)) for (const p of l.poly || []) { let v = m.proj(p).s; if (s.closed && v < r.a - 1) v += L; at(v); }
      const own = n => r.bs.filter(b => b.na === n || b.nb === n).length; for (const b of r.bs) { if (dg.get(b.na) > own(b.na)) at(b.a); if (dg.get(b.nb) > own(b.nb)) at(b.b); } return [lo, hi]; }; // (and every junction on it where another street kept meets it)
    if (trim) for (const r of runs) { const [lo, hi] = span(r), b0 = r.bs.find(b => Math.abs(b.a - r.a) < 1 || Math.abs(b.a + L - r.a) < 1), b1 = r.bs.find(b => Math.abs(b.b - r.b) < 1 || Math.abs(b.b - L - r.b) < 1); if (b0 && loose(b0.na) && lo > r.a + 30 && lo < r.b) r.a = lo - 25; if (b1 && loose(b1.nb) && hi < r.b - 30 && hi > r.a) r.b = hi + 25; }
    runs.forEach((r, i) => { const t = { ...s, id: s.id + '~' + i, closed: false, path: dens(sub(r.a, r.b), 10) }; out.push(t); for (const b of r.bs) idOf.set(b, t); }); }
  net.streets = out; const ids = new Set(out.map(s => s.id)), endAt = (d, s) => s && (dist(d.c, s.path[0]) < 1 || dist(d.c, s.path[s.path.length - 1]) < 1);
  net.discs = net.discs.map(d => { if (ids.has(d.of)) return d; const t = out.find(t => t.id.startsWith(d.of + '~') && endAt(d, t)); return t ? { ...d, of: t.id } : null; }).filter(Boolean);
  net.ways = (net.ways || []).filter(w => touched.has(node(w, 1)));
  // (drawn, from the main entry alone: every street with homes reached, and every way in kept meets a street that is)
  const drawnOk = () => { if (!T?.reach) return true; const d = netEls(ctx, net), seen = T.reach(d.concat(ent.filter(e => !was.ways.some(w => w.ents?.includes(e.id))))), used = new Set(lots.filter(e => e.kind === 'lot').map(l => where.get(l) && idOf.get(where.get(l))?.id || l.on));
    return d.every(e => seen.has(e.id) || !used.has(e.net)) && net.ways.every(w => d.some(e => seen.has(e.id) && e.path && measured(e.path).proj(w.path[w.path.length - 1]).d < (e.width || 28) / 2 + 8)); };
  if (!drawnOk()) { Object.assign(net, was); return false; }
  for (const l of lots) { const t = where.get(l) && idOf.get(where.get(l)); if (t && !dOf.has(l.on)) l.on = t.id; }
  const gone = new Set(was.ways.filter(w => !net.ways.includes(w)).flatMap(w => w.ents || [])); for (let i = ent.length - 1; i >= 0; i--) if (gone.has(ent[i].id)) ent.splice(i, 1);
  for (let i = els.length - 1; i >= 0; i--) if (els[i].kind === 'drive' && els[i].net) els.splice(i, 1); els.push(...netEls(ctx, net));
  return true;
}
// ---------- an option finished: plan pieces, the entry, land, names, the checks ----------
// a street as the recipe keeps it (finishNet, refitNet, relayBlock): its street name too, so re-fits keep it
const recStreet = s => ({ id: s.id, role: s.role, w: s.w, row: s.row, path: s.path, ...(s.closed ? { closed: true } : {}), ...(s.name ? { name: s.name } : {}), ...(s.street ? { street: s.street } : {}), ...(s.entryClear ? { entryClear: true } : {}), ...(s.clearAt ? { clearAt: s.clearAt } : {}), ...(s.pseudo ? { pseudo: true } : {}), ...(s.keep ? { keep: s.keep } : {}) });
const NOTE = s => (s.role === 'coll' ? 'Collector · ' : 'Street · ') + s.w + ' ft', pathKey = P => P.map(q => q.map(v => Math.round(v * 2) / 2).join(',')).join(';');
// the network as drives: streets along their paths (a closed one broken where streets meet it: never a closed path),
// bulbs and knuckles as discs; each carries its network id (net)
export function netEls(ctx, net) {
  const g = graphOf(net.streets.concat(net.entry ? [net.entry] : [], net.ways || []), net.discs, net.hubs || [net.entry, ...(net.ways || [])].filter(Boolean)), out = [], pieces = {};
  for (const s of net.streets) { if (s.pseudo) continue; const stub = [0, 1].some(k => g.ends.get(s.id + ':' + k)?.tee?.pseudo); // (a pod's street meeting the collector round it: its way in)
    const J = (g.J.get(s) || []).map(j => j.p), parts = (s.closed ? breakRing(s.path, J.length ? J : [s.path[0]]) : [s.path]).map(tidyPath); pieces[s.id] = parts.length;
    for (const path of parts) { const mid = pathMid(path); out.push({ id: sid('d'), kind: 'drive', path: path.map(q => q.map(fit)), x: mid[0], y: mid[1], ...xyOf(path), width: s.w, r: 0, name: s.name || '', ...(s.street ? { street: s.street } : {}), note: NOTE(s), net: s.id, ...(s.role === 'coll' ? { coll: true } : {}), ...(stub ? { entry: true, stub: true } : {}) }); }
  }
  for (const d of net.discs) { const poly = S.ringDisc(d.c, d.R, 32).map(q => q.map(fit)); out.push({ id: sid('d'), kind: 'drive', poly, x: fit(d.c[0]), y: fit(d.c[1]), ...xyOf(poly), name: '', note: (d.role === 'knuckle' ? 'Knuckle · ' : 'Cul-de-sac · ') + Math.round(2 * d.R) + ' ft', bulb: true, net: d.id, ...(d.role === 'knuckle' ? { knuckle: true } : {}) }); }
  return out;
}
// the main entry in from the street at the mouth to the network (a boulevard with its median and signs, as the settings
// say; a plain 40 ft drive where there's no room): its pieces, or null
function entryEls(ctx, els, mouth) {
  const ER = ctx.ER, base = { ...ctx.plan, elements: els }; let r = S.addEntrance(base, mouth, { boulevard: ER.style !== 'driveway', sign: ER.sign, name: 'Main entry', slide: 40 }); if (r.error) r = S.addEntrance(base, mouth, { W: 40, name: 'Main entry', slide: 40 }); if (r.error) return null;
  const ids = new Set(els.map(e => e.id)); return r.elements.filter(e => !ids.has(e.id)).map(e => { const { pinned, ...o } = e; return o; });
}
// plan pieces into the engine's frame (for its land: ponds, open space) and back
const toFrame = (F, e) => { const t = p => S.rotPt(p, -F.psi); if (e.poly) return { ...e, poly: e.poly.map(t) }; if (e.path) return { ...e, path: e.path.map(t) }; const c = t([e.x, e.y]); return { ...e, x: c[0], y: c[1], rotL: (e.rot || 0) - F.psi }; };
// (a long street in short pieces: the land's grid is painted piece by piece, each over its own box, not the whole site's)
const chunks = e => { if (!e.path || e.path.length <= 14) return [e]; const out = []; for (let i = 0; i + 1 < e.path.length; i += 12) out.push({ ...e, path: e.path.slice(i, i + 13) }); return out; };
function landOf(ctx, T, els, reserve, opts = {}) {
  const F = T.frameOf(ctx.plan, false), stats = {}, t = p => S.rotPt(p, -F.psi);
  const land = T.finishLand(F, els.flatMap(chunks).map(e => toFrame(F, e)).concat((opts.solid || []).map(r => ({ kind: 'building', use: 'amenity', poly: r.map(t) }))), { pond: opts.pond ?? ctx.need, reserve: reserve.map(r => r.map(t)), openSpace: opts.openSpace !== false, openAll: true, trail: !!opts.lake, amenity: !!opts.amenity, padUse: false, frontY: T.profile(F).b[0], lakeName: opts.lake ? 'Amenity lake' : '' }, stats);
  return { els: T.toPlanEls(F, land), pond: stats.pond || 0, F };
}
// what a home that went leaves behind: a driveway with no home at its end, a lot with no home on it (not one left vacant:
// its home was deleted, and its place stays empty)
function orphans(els) {
  const H = els.filter(e => e.kind === 'building').map(e => { const q = S.shapeOf(e); return { q, c: [e.x, e.y], b: bbox(q) }; }), G = S.gridIndex(H, h => h.b, 200);
  const by = (e, g) => { const q = S.shapeOf(e), b = bbox(q); return [...G.near(b[0] - g, b[1] - g, b[2] + g, b[3] + g)].some(h => S.gapBetween(h.q, q) <= g); };
  return els.filter(e => !(e.kind === 'plaza' && e.note === 'Driveway' && !e.pinned && !by(e, 4) || e.kind === 'lot' && !e.pinned && !e.vacant && ![...G.near(e.x - 200, e.y - 200, e.x + 200, e.y + 200)].some(h => S.inRing(h.c, S.shapeOf(e)))));
}
// the rules a network was laid out with, said in a line: a place's rule sheet (lib/rulesheet.mjs: which, what's still to
// confirm, never a compliance claim), else typical values or the plan's own (Settings)
const rulesNote = (plan, R) => { const code = plan.params?.code, own = JSON.stringify(R) !== JSON.stringify(streetRules(code ? { params: { code } } : {}));
  if (code) return RS.rulesLine(code) + (own ? ' Some values as set for this plan.' : '');
  return 'Street rules: ' + (own ? 'as set for this plan' : 'typical values') + ' (block ' + R.blockMax.toLocaleString('en-US') + ' ft, cul-de-sac ' + R.culMax + ' ft)' + (own ? '.' : '; no rule sheet for this place yet.'); };
const BREACH = (R, b, name) => b.kind === 'block' ? 'A block on ' + name + ' runs ' + Math.round(b.len).toLocaleString('en-US') + ' ft (longest ' + R.blockMax.toLocaleString('en-US') + ' ft)' : b.kind === 'cul' ? 'A cul-de-sac runs ' + Math.round(b.len) + ' ft (longest ' + R.culMax + ' ft)' : b.kind === 'close' ? 'Two streets meet ' + name + ' ' + Math.round(b.len) + ' ft apart (at least ' + (b.chain.coll ? R.collJunctionMin : R.junctionMin) + ' ft)' : b.kind === 'cross' ? 'Four streets meet at one spot on ' + name + ' (a crossroads)' : (/^a (street|collector)$/.test(name) ? 'A street' : name) + ' doesn’t reach a way in';
const KIND_WORD = { ring: 'loop road round the edge', core: 'loop road round the lake', spine: 'main street', courts: 'cul-de-sacs off a loop road', pod: 'streets' };
// one network laid out and finished as an option. opts: max (homes), openSpace, T (the engine's own functions)
export function finishNet(ctx, net, T, opts = {}) {
  const { plan, prog, R } = ctx, notes = [], t0 = Date.now(); if (net.sk?.commons === null) return null; // (a commons asked for that its skeleton's loop can't hold: no option)
  const els = netEls(ctx, net);
  // the entry first (the boulevard and its signs: lots keep off them)
  let ent = []; if (net.entryAt && !opts.pod) { ent = net.sk?.ent || entryEls(ctx, els.filter(e => net.sk?.streets.some(s => s.id === e.net)), net.entryAt); if (!ent) return null; if (net.sk) net.sk.ent = ent; ent = ent.map(e => structuredClone(e)); } // (the boulevard in meets the skeleton: the same for every network on it)
  for (const w of net.ways || []) { const base = els.concat(ent), r = S.addEntrance({ ...plan, elements: base }, w.mouth, { W: ctx.R.collector.pave, name: 'Entrance ' + (S.entrancesOf(base).length + 1), slide: 30 }), to = !r.error && S.routeOf(r.entrance, plan.ring)?.path; if (!to || dist(to[to.length - 1], w.path[w.path.length - 1]) > 30) { w.gone = true; continue; } const ids = new Set(base.map(e => e.id)), add = r.elements.filter(e => !ids.has(e.id)).map(e => { const { pinned, ...o } = e; return o; }); w.ents = add.map(e => e.id); ent.push(...add); } // (more ways in: fire access)
  if (net.ways?.some(w => w.gone)) net.ways = net.ways.filter(w => !w.gone); // (a way in whose driveway can't come in where its street does, sliding onto another: not built)
  const solid = ent.filter(e => e.kind === 'sign' || S.isEntrance(e)).map(e => S.grow(ccw(S.shapeOf(e)), e.kind === 'sign' ? 3 : 2)).concat(opts.solid || [], net.sk?.core ? [net.sk.core] : []);
  const lots = marchLots(ctx, net, { mix: opts.mix, max: opts.max, plans: plan.params?.housePlans !== false, solid, near: opts.max != null && !!net.entryAt });
  // (a count asked: only the streets its homes need are built yet, and of those no local street they can do without; the
  // streets cut at the last lot when that breaks no rule, else at the junction past it, else as the network has them)
  if (opts.max != null) { const was = { streets: net.streets, discs: net.discs, ways: net.ways }, e0 = els.slice(), n0 = ent.slice(), on0 = lots.els.map(l => l.on), undo = () => { Object.assign(net, was); els.splice(0, els.length, ...e0); ent.splice(0, ent.length, ...n0); lots.els.forEach((l, i) => { l.on = on0[i]; }); };
    const broke = () => netRules({ ...plan, elements: els.concat(ent) }, { code: false }).some(b => b.kind !== 'block' && b.kind !== 'dead'), before = broke(); // (the rule sheet's own checks don't decide how far a phase is built) // (as the editor will read the drawn plan)
    let ok = phaseNet(ctx, net, lots.els, els, T, ent, true); if (ok && broke() && !before) { undo(); ok = false; }
    if (!ok && phaseNet(ctx, net, lots.els, els, T, ent, false) && broke() && !before) undo();
    prune(ctx, net, lots.els, els, T, ent); }
  let all = els.concat(ent, lots.els); all.forEach(e => { e.id ||= sid('e'); });
  // the ponds on the land kept for them (with a trail round), the lake in the middle of a core; then open space on the rest
  const core = net.sk?.core, ponds = [];
  for (const r of net.res) { const q = pondOf(r); if (area(q) < 8000) continue; ponds.push({ id: sid('p'), kind: 'pond', poly: q.map(v => v.map(fit)), ...xyOf(q), x: fit(S.centroid(q)[0]), y: fit(S.centroid(q)[1]), name: 'Detention', note: 'Wet detention' }); const tr = S.tidyRing(S.grow(q, 9), 1); ponds.push({ id: sid('t'), kind: 'trail', path: tr.map(v => v.map(fit)), ...xyOf(tr), x: fit(tr[0][0]), y: fit(tr[0][1]), width: 6, r: 0, closed: true, name: '', note: 'Walking trail' }); }
  const am = core && (ctx.prog.zones || []).find(z => z.use === 'amenity'); let lake = 0;
  if (am) { // the commons inside the loop (the community centre, its pool, the lake and lawns: as a pod of a mixed plan's)
    // (its front, where its drive comes off the loop road: the side the main street comes up to; where that meets the loop
    // on a bend, whose short sides leave no room for the drive, the nearest side long enough, then the next)
    const cr = ccw(S.tidyRing(core, 2)), n = cr.length, near = net.streets.find(x => x.entryClear)?.path.at(-1) || (net.entry ? net.entry.path[net.entry.path.length - 1] : S.centroid(cr)), dk = k => S.segDist(near, cr[k], cr[(k + 1) % n]);
    const byNear = cr.map((p, k) => k).sort((a, b) => dk(a) - dk(b)), fronts = [byNear[0], ...byNear.filter(k => S.edgeLen(cr, k) >= 100)].filter((k, i, a) => a.indexOf(k) === i).slice(0, 4);
    const ppOf = fk => ({ origin: plan.origin, ring: cr, front: fk, setbacks: { ...(plan.setbacks || {}), edges: cr.map((p, k) => ({ role: k === fk ? 'front' : 'side', street: true, build: 20, pave: 10 })) }, streets: [], params: { ...(plan.params || {}), entry: { ...(plan.params?.entry || {}), style: 'driveway' }, fill: false }, elements: [] });
    let r = null; if (net.sk.commons !== undefined) r = net.sk.commons && structuredClone(net.sk.commons); else { for (const fk of fronts) { try { r = T.commonsPod(ppOf(fk), am, { pond: net.sk.lake !== false ? ctx.need : 0, podEntry: { w: 30 } }); } catch (e) { if (globalThis.SP_DEBUG) console.log('commons failed', e.stack); } if (r) break; } net.sk.commons = r ? structuredClone(r) : null; } // (the commons inside a skeleton's loop: the same for every network on it)
    if (globalThis.SP_DEBUG) console.log("  commons", r ? r.elements.length : null); if (r) { for (const e0 of r.elements) { const e = { ...e0, id: sid("c") }; if (e.kind === 'drive' && e.name === 'Main entry') { delete e.entry; e.name = ''; e.podIn = true; } ponds.push(e); } lake = r.elements.filter(e => e.kind === 'pond').reduce((t, e) => t + S.elArea(e), 0); notes.push(...(r.notes || [])); net.commons = r.recipe; } }
  if (core && !am) { const q0 = S.smooth(S.tidyRing(S.grow(ccw(core), -45), 4), 3), have = ponds.filter(e => e.kind === 'pond').reduce((t, e) => t + area(e.poly), 0), want = Math.max(0, ctx.need - have); let q = q0; if (want > 0 && area(q0) > want * 1.15) { let lo = 45, hi = 600; for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2, g = S.grow(ccw(core), -m); if (S.signedArea(g) > 0 && area(g) > want * 1.08) lo = m; else hi = m; } q = S.smooth(S.tidyRing(S.grow(ccw(core), -lo), 4), 3); }
    if (area(q) > 8000 && S.signedArea(q) > 0) { ponds.push({ id: sid('p'), kind: 'pond', poly: q.map(v => v.map(fit)), ...xyOf(q), x: fit(S.centroid(q)[0]), y: fit(S.centroid(q)[1]), name: 'Amenity lake', note: 'Wet detention' }); const tr = S.tidyRing(S.grow(q, 14), 1); ponds.push({ id: sid('t'), kind: 'trail', path: tr.map(v => v.map(fit)), ...xyOf(tr), x: fit(tr[0][0]), y: fit(tr[0][1]), width: 6, r: 0, closed: true, name: '', note: 'Walking trail' }); } }
  all = all.concat(ponds); const have = ponds.filter(e => e.kind === 'pond').reduce((t, e) => t + S.elArea(e), 0);
  const land = landOf(ctx, T, all, [], { openSpace: opts.openSpace, solid: opts.solid, pond: Math.max(0, ctx.need - have) });
  all = all.concat(land.els);
  const at = net.entryAt || S.centroid(plan.ring); T.nameAll(all, at, prog);
  // a skeleton's roundabouts (ringAt: where a street carries on across a collector), homes in their way making way
  for (const c of net.rings || []) { const r = S.addRoundabout({ ...plan, elements: all }, c, { snap: 90 }); if (!r.error) all = r.elements.map(e => e.id === r.roundabout.id ? (({ pinned, ...q }) => ({ ...q, net: 'ring' }))(e) : e); }
  if (globalThis.SP_DEBUG > 1) console.log('  before repair', S.check({ ...plan, elements: all }).filter(i => i.level === 'bad').map(i => i.text).slice(0, 12));
  const fx = T.repair(plan, all, new Set(opts.keep || [])); if (globalThis.SP_DEBUG > 1 && fx.cut) { const kept = new Set(fx.els.map(e => e.id)); console.log('  cut', all.filter(e => e.kind === 'drive' && !kept.has(e.id)).map(e => e.net + ' ' + (e.path ? e.path[0].map(Math.round) + '>' + e.path.at(-1).map(Math.round) : 'poly')).join('; ')); } all = orphans(fx.els);
  all = T.signEntry(plan, T.withTrash(plan, prog, all, notes), notes);
  const homes = all.filter(e => e.kind === 'building' && e.use === 'sfr'), nh = homes.length, need = ctx.need, pond = all.filter(e => e.kind === 'pond').reduce((t, e) => t + S.elArea(e), 0);
  const drawn = {}; for (const e of all) if (e.kind === 'drive' && e.net && e.path) (drawn[e.net] ||= []).push(pathKey(e.path));
  const g = graphOf(net.streets.concat(net.entry ? [net.entry] : [], net.ways || []), net.discs, net.hubs || [net.entry, ...(net.ways || [])].filter(Boolean)), br = breaches(R, g, net.rings).filter(b => !b.chain.list.some(x => x.s.pseudo));
  const ids = new Set(net.discs.map(d => d.id)), onBulb = all.filter(e => e.kind === 'lot' && (ids.has(e.on) || net.streets.find(s => s.id === e.on)?.role === 'court')).length;
  const L = net.streets.reduce((t, s) => t + lenOf(s.path), 0), curvy = net.streets.filter(s => s.role !== 'coll'), cv = curvy.reduce((t, s) => t + (curved(s.path) ? lenOf(s.path) : 0), 0) / Math.max(1, curvy.reduce((t, s) => t + lenOf(s.path), 0));
  // (the rules as the editor reads them off the drawn plan, for a whole site: what the warnings will say)
  const brk = (opts.pod ? br.map(b => b.kind) : netRules({ ...plan, elements: all }, { code: false }).map(i => i.kind).filter(k => k !== 'dead')).map(kind => ({ kind })); // (the generator's own rules, the sheet's values in them: what's left of the sheet a layout breaks is in its notes and the checks, not its score)
  const cl = clashes(all).map(text => ({ level: 'bad', text })); // (streets run into each other: as bad as a failed check)
  const parts = scoreParts(ctx, { homes: nh, L, onBulb, breaches: brk, pond, bad: fx.bad.length + cl.length, cut: fx.cut, curvy: cv, unreached: 0, commons: (ctx.prog.zones || []).some(z => z.use === 'amenity') ? !!net.commons : null });
  // the notes: homes and the lot mix, detention, the rules broken, the rules used
  const mix = new Map(); if (ctx.home.plans?.length) for (const h of homes) { const w = Math.max(HOUSE_PLANS.find(p => p.id === h.type)?.lotW || 0, R.minLotW || 0); mix.set(w, (mix.get(w) || 0) + 1); } else for (const st of [1, 2, 3]) { const n = homes.filter(h => h.floors === st).length, w = Math.max(S.HOME_TYPES[st].lotW, R.minLotW || 0); if (n) mix.set(w, (mix.get(w) || 0) + n); } // (a rule sheet's smallest frontage widens the narrower lots; the plans asked for: each its own)
  notes.push(nh + ' homes: ' + [...mix].map(([w, n]) => Math.round(n / Math.max(1, nh) * 100) + '% on ' + w + ' ft lots').join(', ') + (onBulb ? '; ' + onBulb + ' on cul-de-sacs' : '') + '.');
  if (ctx.home.units && nh < ctx.home.units * 0.97) notes.push('Fits about ' + nh + ' of the ' + ctx.home.units + ' homes asked for.');
  const sn = S.stormNeed(ctx.ac, plan.params || {}, prog, ctx.ac); if (!opts.pod && sn.area > 0 && pond < sn.area * 0.9) notes.push('Detention holds about ' + Math.round(pond / sn.area * 100) + '% of the ' + sn.volume.toFixed(1) + ' acre-feet needed; plan on underground storage for the rest.');
  const fut = all.filter(e => e.name === 'Future development').reduce((t, e) => t + S.elArea(e), 0); if (fut > 0) notes.push((fut / AC).toFixed(1) + ' acres are left for a future phase.');
  const nb = brk.filter(b => b.kind === 'block').length, nc = brk.filter(b => b.kind === 'cul').length; if (nb) notes.push((nb === 1 ? 'One block runs' : nb + ' blocks run') + ' longer than ' + R.blockMax.toLocaleString('en-US') + ' ft.'); if (nc) notes.push((nc === 1 ? 'One cul-de-sac runs' : nc + ' cul-de-sacs run') + ' longer than ' + R.culMax + ' ft.');
  if (!opts.pod) notes.push(...codeRules({ ...plan, elements: all }).map(b => b.text + '.')); notes.push(rulesNote(plan, R));
  const recipe = { net: { v: 1, kind: net.kind, at: net.sk?.at ?? null, pats: net.pats || null, streets: net.streets.map(recStreet), discs: net.discs.map(d => ({ id: d.id, role: d.role, c: d.c, R: d.R, of: d.of })), entry: net.entry ? { path: net.entry.path, w: net.entry.w, row: net.entry.row } : null, ways: (net.ways || []).map(w => ({ path: w.path, w: w.w, row: w.row })), entryAt: net.entryAt || null, reserve: net.res, core: core || null, lot: { lotD: ctx.lotD, minD: ctx.minD, maxD: ctx.maxD }, mix: opts.mix || null, cap: opts.max ?? null, ...(opts.max != null && net.entryAt ? { near: true } : {}), rules: R, openSpace: opts.openSpace !== false, drawn, lost: lots.homes - nh }, prog };
  recipe.net.free = freeAt(recipe.net); // (the ends it leaves open on purpose: a first phase's streets running on, a stub to the edge)
  const name = 'Subdivision · ' + KIND_WORD[net.kind] + (net.pats?.some(p => p?.wave) ? ' · winding streets' : '') + (net.sk?.at != null && net.sk.at !== 0.5 ? ' · side entry' : '');
  if (globalThis.SP_DEBUG) console.log('  net', net.kind, net.sk?.at, JSON.stringify(net.pats?.map(p => p && p.dir + p.bow + (p.wave ? '~' + p.wave : '') + p.ends)), 'homes', nh, 'ms', Date.now() - t0, br.map(b => b.kind + ':' + Math.round(b.len || 0) + '@' + b.chain.list.map(x => x.s.role).join('+') + (b.kind === 'close' || b.kind === 'cross' ? '[' + chainAt(g, b.chain, b.at)?.p.map(Math.round) + ']' : '')).join(' '), JSON.stringify(Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round(v)]))));
  const amAsk = (prog.zones || []).some(z => z.use === 'amenity'); if (amAsk && !net.commons) return null; // (a commons asked for and not laid out: no option)
  const cz = amAsk && net.commons && core ? [{ name: S.USES.amenity.label, use: 'amenity', zone: null, ring: S.tidyRing(core, 2).map(v => v.map(fit)), acres: area(core) / AC }] : [];
  return { name, elements: all, notes, zones: [{ name: S.USES.sfr.label, use: 'sfr', zone: null, ring: plan.ring, acres: ctx.ac }].concat(cz), program: prog, phi: land.F.phi, score: Object.values(parts).reduce((a, b) => a + b, 0), scoreParts: parts, recipe, sizes: { units: nh, gfa: homes.reduce((t, e) => t + S.gfaOf(e), 0) }, style: 'net', ownEntrances: true, bad: fx.bad.concat(cl), homes: nh, pond, breaches: brk.length };
}
// the score of a laid network (higher is better): the program, street per home, cul-de-sac share, the rules, the
// detention, the checks, and a nudge to curving streets
export function scoreParts(ctx, m) {
  const { R } = ctx, T = ctx.home.units, V = m.homes, p = {};
  p.program = T ? 1000 - Math.abs(V - T) / T * 1000 - (V < T ? 300 * (T - V) / T : 0) - (V < T * 0.97 ? 200 : 0) : V;
  p.street = -Math.max(0, m.L / Math.max(1, V) - 45) * 4;
  const sh = m.onBulb / Math.max(1, V); p.culs = sh >= 0.08 && sh <= 0.35 ? 60 : sh > 0.45 ? -200 * (sh - 0.45) : 0;
  p.rules = -300 * m.breaches.filter(b => ['block', 'cul', 'close', 'cut'].includes(b.kind)).length - 40 * m.breaches.filter(b => b.kind === 'cross').length;
  p.detention = ctx.need > 0 ? -Math.max(0, ctx.need * 0.95 - m.pond) / ctx.need * Math.abs(p.program) * 1.5 : 0;
  p.checks = -500 * m.bad - 40 * m.cut - 100 * (m.unreached || 0);
  p.look = (m.curvy > 0.5 ? 30 : 0) + Math.round(0.04 * Math.max(0, V) * (0.5 * Math.min(1, m.curvy / 0.7) + 0.5 * Math.min(1, sh / 0.08))); // (curving streets and some cul-de-sacs worth a few homes)
  p.commons = m.commons === false ? -800 : 0; // (a commons asked for and not laid out)
  return p;
}

// ---------- the search ----------
// a quick count of the homes a pod's streets would hold, before any lot is marched: its land within a lot's depth of a
// street's right-of-way (its own streets', its bulbs', its gates'), sampled on a 40 ft grid, over a lot's area; a little
// less for each street (its corners)
function estimate(ctx, pod, r) {
  const { lotD, R } = ctx, mix = (ctx.home.homeMix || S.HOME_MIX).filter(t => t.pct > 0), tot = mix.reduce((t, m) => t + m.pct, 0) || 1, HP = ctx.home.plans || [], mw = HP.length ? HP.reduce((t, h) => t + Math.max(h.lotW, R.minLotW || 0, R.minLotSf ? R.minLotSf / lotD : 0), 0) / HP.length : mix.reduce((t, m) => t + S.HOME_TYPES[m.stories].lotW * m.pct, 0) / tot; // (the plans asked for: their lots)
  const pts = pod.pts ||= (() => { const b = bbox(pod.ring), out = [], inn = ringTest(pod.ring); for (let x = b[0] + 20; x < b[2]; x += 40) for (let y = b[1] + 20; y < b[3]; y += 40) if (inn([x, y])) { let g = Infinity; pod.ring.forEach((a, k) => { if (pod.edges[k].gate) g = Math.min(g, S.segDist([x, y], a, pod.ring[(k + 1) % pod.ring.length]) - ((pod.edges[k].gate.row || 36) - pod.edges[k].gate.w) / 2); }); out.push({ p: [x, y], g }); } return out; })();
  // (a street the pod's gates and the other streets don't reach counts for half: joining it up may not work)
  const gr = graphOf(pod.base.concat(r.streets), r.discs, pod.base[0] || null), G = segGrid(r.streets.filter(x => gr.reached.has(x))), G2 = segGrid(r.streets.filter(x => !gr.reached.has(x))); let n = 0;
  for (const { p, g } of pts) { if (g <= lotD) { n++; continue; } let ok = false;
    for (const x of G.near(p[0], p[1], p[0], p[1])) { const d = S.segDist(p, x.a, x.b), h = x.s.row / 2; if (d < h) { ok = false; break; } if (d <= h + lotD) ok = true; }
    if (!ok) for (const d of r.discs) { const q = dist(p, d.c); if (q > R.bulbRow && q <= R.bulbRow + lotD) ok = true; }
    if (ok) { n++; continue; } for (const x of G2.near(p[0], p[1], p[0], p[1])) { const d = S.segDist(p, x.a, x.b), h = x.s.row / 2; if (d >= h && d <= h + lotD) { n += 0.5; break; } } }
  return n * 1600 / (mw * lotD) * 0.92 - r.streets.length * 2;
}
// the street networks for a site (or a pod of a mixed plan: opts.pod), laid out and scored within a time budget; the
// best that differ. opts: count, netKinds, netBudgetMs, max (homes), onProgress(option)
export let lastStats = null;
export function netOptions(plan, prog, opts, T) {
  const t0 = Date.now(), ctx = context(plan, prog, opts), dbg = globalThis.SP_DEBUG, budget = opts.netBudgetMs ?? (opts.pod ? Math.max(1500, Math.min(4000, 800 + 40 * ctx.ac)) : Math.max(4000, Math.min(20000, 2000 + 60 * ctx.ac)));
  // skeletons: the middle entry of each kind first; a skeleton's pods share their patterns' estimates with the same
  // pods of another (the ring's and the courts')
  const sks = (opts.pod ? podSkeleton(ctx) : skeletons(ctx, opts)).map((sk, i) => ({ sk, i })).sort((a, b) => (a.sk.at === 0.5 ? 0 : 1) - (b.sk.at === 0.5 ? 0 : 1) || a.i - b.i).map(x => x.sk), cand = [], podMemo = new Map();
  const podOf = (ring, base) => { const key = ring.length + ':' + ring[0].map(Math.round) + ':' + Math.round(area(ring)); return podMemo.get(key) || podMemo.set(key, { ring, edges: podEdges(ctx, ring, base), est: new Map(), base }).get(key); };
  for (const sk of sks) {
    if (cand.length && cand.some(c => c.sk.kind === sk.kind) && Date.now() - t0 > budget * 0.2) break; // (the estimates take no more than a fifth of the time: the middle entry of each kind first, and every kind whatever the clock says)
    const base = sk.streets, pods = sk.pods.map(ring => podOf(ring, base));
    const per = pods.map(pod => { const list = []; for (const pat of patternsOf(ctx, pod)) { if ((sk.kind === 'courts') !== (pat.ends === 'court')) continue; const k = JSON.stringify(pat); if (!pod.est.has(k)) { let r = null; try { r = podStreets(ctx, pod, pat); } catch (e) { if (dbg) console.log('pod streets failed', e.stack); } pod.est.set(k, r ? estimate(ctx, pod, r) : null); } const est = pod.est.get(k); if (est != null) list.push({ pat, est }); }
      list.sort((a, b) => b.est - a.est); const way = p => p.dir + (p.dir === 'para' && p.wave ? '~' : ''), pick = []; for (const x of list) if (pick.length < 4 && !pick.some(p => way(p.pat) === way(x.pat))) pick.push(x); return pick; }); // (the best of each way the streets may run: the estimate is rough, the full layout decides)
    const est = per.reduce((t, l) => t + (l[0]?.est || 0), 0), best = per.map(l => l[0]?.pat || null), flat = (l, w) => l.find(x => x.pat.dir === 'para' && !x.pat.wave === !w) || l.find(x => x.pat.dir === 'para') || l[0];
    for (const w of [0, 1]) { const para = per.map(l => flat(l, w)?.pat || null), k = JSON.stringify(para); if (k !== JSON.stringify(best) && !cand.some(c => c.sk === sk && JSON.stringify(c.pats) === k)) cand.push({ sk, pats: para, est: per.reduce((t, l) => t + (flat(l, w)?.est || 0), 0), para: w ? 'wave' : 'flat' }); } // (concentric to the collectors, and the same meandering)
    cand.push({ sk, pats: best, est });
    for (let i = 0; i < per.length; i++) for (const alt of per[i].slice(1)) cand.push({ sk, pats: best.map((p, j) => j === i ? alt.pat : p), est: est - per[i][0].est + alt.est });
  }
  // laid out in full: for each kind (its middle entry), streets concentric to the collectors and the best estimate; then the
  // rest by their estimates, while the time lasts (the estimate is rough: the full layout decides)
  { const seen = new Set(), one = cand.filter(c => { const k = sks.indexOf(c.sk) + JSON.stringify(c.pats); return !seen.has(k) && seen.add(k); }); cand.length = 0; cand.push(...one); } // (one of each, the first kept)
  cand.sort((a, b) => b.est - a.est); const order = [], kinds = new Set(), PRI = ['ring', 'spine', 'core', 'courts', 'pod']; const firsts = []; for (const c of cand.slice().sort((a, b) => PRI.indexOf(a.sk.kind) - PRI.indexOf(b.sk.kind))) if (!kinds.has(c.sk.kind)) { kinds.add(c.sk.kind); firsts.push(c); }
  const wv = c => cand.find(d => d.sk === c.sk && d.para === 'wave'); for (const [i, c] of firsts.entries()) { order.push(cand.find(d => d.sk === c.sk && d.para === 'flat') || c); if (!i && wv(c)) order.push(wv(c)); }
  for (const c of firsts) { const w = wv(c); if (w && !order.includes(w)) order.push(w); } // (each kind concentric to its collectors first, the first kind meandering too; then the others meandering, then the rest)
  for (const c of firsts) if (!order.includes(c)) order.push(c); for (const c of cand) if (!order.includes(c)) order.push(c);
  if (dbg) console.log('net candidates', cand.length, 'of', sks.length, 'skeletons in', Date.now() - t0, 'ms;', order.slice(0, 8).map(c => c.sk.kind + '@' + c.sk.at + ' ' + Math.round(c.est)).join(', '));
  const done = [], cap = opts.max ?? ctx.home.units, laid = new Set(), two = Math.min(2, new Set(order.map(c => c.sk.kind)).size), tidy = o => !o.breaches && !o.bad.length; let last = 0, evaluated = 0;
  for (const c of order) {
    // (the first two always: the first kind concentric and winding; and a second kind, so a slow machine still gets a choice
    // of networks; and, when none laid yet keeps the rules and the checks, a few more whatever the clock says: how much is
    // tried, not how fast the machine is, decides whether there's one that does)
    if (done.length && evaluated >= 2 && laid.size >= two && (done.some(tidy) || evaluated >= 6) && Date.now() - t0 + last * 0.8 > budget) break; const t1 = Date.now();
    let o = null; try { const net = buildNet(ctx, c.sk, c.pats); o = finishNet(ctx, net, T, { max: cap, pod: opts.pod, openSpace: opts.openSpace ?? (cap == null), mix: opts.mix }); } catch (e) { if (dbg) console.log('net failed', e.stack); }
    evaluated++; laid.add(c.sk.kind); last = Date.now() - t1; if (!o) continue;
    done.push(o); if (opts.onProgress && done.every(x => x === o || x.score < o.score)) try { opts.onProgress(o); } catch (e) { /* (a closed worker) */ }
  }
  done.sort((a, b) => b.score - a.score); const N = opts.count || 3, pick = [], most = Math.max(0, ...done.filter(o => !o.breaches || done.every(x => x.breaches)).map(o => o.homes)), same = (a, b) => a.homes === b.homes && a.recipe.net.streets.length === b.recipe.net.streets.length && a.recipe.net.at === b.recipe.net.at;
  const clean = done.some(o => !o.breaches), sound = done.some(o => !o.bad.length && (!clean || !o.breaches)), fine = o => (o.homes >= most * 0.85 || ctx.home.units && o.homes >= ctx.home.units * 0.97) && (!clean || !o.breaches) && (!sound || !o.bad.length); // (a varied few, each near as good as the best and within the street rules when any is, and passing the checks when any of those does: not a weak one for the sake of a choice)
  const look = o => o.recipe.net.kind + (o.recipe.net.pats?.some(p => p?.wave) ? '~' : ''); // (a kind meandering is a look of its own)
  for (const o of done) if (pick.length < N && fine(o) && !pick.some(p => look(p) === look(o) || same(p, o))) pick.push(o);
  for (const o of done) if (pick.length < N && fine(o) && !pick.includes(o) && !pick.some(p => same(p, o))) pick.push(o);
  lastStats = { ms: Date.now() - t0, budget, options: pick.length, evaluated, candidates: cand.length, kinds: [...laid] };
  return pick.sort((a, b) => b.score - a.score);
}
// a pod of a mixed plan: no skeleton of its own, its gates the collectors it meets (its edges whose rules say street)
// a pod of a mixed plan: its collector edges (its rules say street) its gates, each run of them a collector of its own
// just outside it (not drawn: the plan's collector is there) for its streets to T into
function podSkeleton(ctx) {
  const plan = ctx.plan, n = plan.ring.length, rev = S.signedArea(plan.ring) < 0, ring = rev ? plan.ring.slice().reverse() : plan.ring, gate = k => { const j = rev ? (2 * n - 2 - k) % n : k, r = ctx.rules[j]; return !!r.street; };
  const runs = []; let k0 = ring.findIndex((p, k) => !gate(k)); if (k0 < 0) k0 = 0;
  for (let i = 0, cur = null; i < n; i++) { const k = (k0 + i) % n; if (gate(k)) { if (!cur) runs.push(cur = [ring[k]]); cur.push(ring[(k + 1) % n]); } else cur = null; }
  const C = ctx.R.collector, streets = runs.filter(r => lenOf(r) > 100).map(r => { const d = dens(r, 10), m = measured(d), a = add(d[0], m.tan(1), -80), b = add(d[d.length - 1], m.tan(m.L - 1), 80), off = offsetPath(dens([a, ...d, b], 10), -C.pave / 2); return mkStreet(ctx, 'coll', off, { pseudo: true }); });
  return [{ kind: 'pod', at: null, streets, entry: null, pods: streets.length ? [ccw(S.tidyRing(ring, 1))] : [], res: [], core: null }];
}
// whether a plan's homes get subdivision streets: single-family (alone, or with a commons), 8 acres and up, Neighbourhood
// streets 'curved' (the default) or 'network', not a re-fit (it keeps its streets), not turned off
export function netWanted(plan, prog, opts = {}) {
  const st = plan.params?.streets, built = (prog.zones || []).filter(z => z.use !== 'amenity');
  if (opts.noNet || opts.pinned?.length || st === 'wave' || st === 'straight') return false;
  if (prog.zones ? !(built.length && built.every(z => z.use === 'sfr')) : prog.use !== 'sfr') return false;
  return S.ringArea(plan.ring || []) >= ((prog.zones || []).some(z => z.use === 'amenity') ? 25 : 8) * AC; // (a commons asked: only a core loop holds one)
}

// streets drawn on a plan whose rights-of-way run into each other or themselves away from where they meet (two side by
// side, a loop pinched shut, a street crossing another): one line each, for the checks and the tests
export function clashes(els) {
  const D = els.filter(e => e.kind === 'drive' && e.path && e.net && !S.isRing(e)), W = d => d.width || 28, out = [], G = S.gridIndex([], g => g.b, 100);
  D.forEach((d, k) => { let c = 0; for (let i = 1; i < d.path.length; i++) { const a = d.path[i - 1], b = d.path[i]; G.add({ k, a, b, at: c }, [Math.min(a[0], b[0]) - 50, Math.min(a[1], b[1]) - 50, Math.max(a[0], b[0]) + 50, Math.max(a[1], b[1]) + 50]); c += dist(a, b); } });
  const gap = (p, k) => { let m = Infinity; for (const g of G.near(p[0], p[1], p[0], p[1])) if (g.k === k) m = Math.min(m, S.segDist(p, g.a, g.b)); return m; };
  // (where two meet: an end of one within the other's pavement and a little, or two ends together)
  const J = D.map(() => []); D.forEach((d, k) => { for (const e of [d.path[0], d.path[d.path.length - 1]]) D.forEach((o, j) => { if (j !== k && gap(e, j) < W(o) / 2 + 12) { J[k].push({ j, p: e }); J[j].push({ j: k, p: e }); } }); });
  D.forEach((d, k) => { const P = dens(d.path, 10); let s = 0, hit = null;
    P.forEach((p, i) => { if (i) s += dist(p, P[i - 1]); if (hit) return;
      for (const g of G.near(p[0], p[1], p[0], p[1])) { const o = D[g.k]; if (S.segDist(p, g.a, g.b) >= (W(d) + W(o)) / 2 + 20) continue;
        if (g.k === k ? Math.abs(g.at + Math.max(0, Math.min(1, dot([p[0] - g.a[0], p[1] - g.a[1]], [g.b[0] - g.a[0], g.b[1] - g.a[1]]) / (dist(g.a, g.b) ** 2 || 1))) * dist(g.a, g.b) - s) < 3 * W(d) + 60 : J[k].some(x => x.j === g.k && dist(x.p, p) < W(d) + W(o) + 60)) continue; // (itself: only where it comes back, far along it)
        hit = (d.name || 'A street') + (g.k === k ? ' runs into itself' : ' runs into ' + (o.name || 'another street')); break; } });
    if (hit) out.push(hit); });
  return out;
}
// ---------- the rules on a laid plan, and re-fits ----------
// the plan's network read back from its pieces: its streets (drives along paths that are streets: the network's own, an
// added street, a street-width drive), its bulbs and roundabouts, its main entry's line in
export function netOfPlan(plan) {
  const els = plan.elements || [], ring = plan.ring || [], R = streetRules(plan), streets = [], discs = [], rings = [];
  for (const e of els) { if (e.kind !== 'drive' || e.note === 'Drive-thru lane') continue;
    if (S.isRing(e)) { const g = S.ringOf(e); rings.push(g.c); streets.push({ id: e.id, role: 'coll', ring: true, closed: true, w: g.lane, row: g.lane + 22, path: dens(e.path, 10, true), name: e.name || '' }); continue; } // (a roundabout: the hub its legs meet)
    if (e.bulb) { const q = S.shapeOf(e), c = S.centroid(q); discs.push({ id: e.id, role: e.knuckle ? 'knuckle' : 'bulb', c, R: Math.max(...q.map(p => dist(p, c))) }); continue; }
    if (S.isEntrance(e)) { const r = S.routeOf(e, ring); if (r?.path?.length >= 2) streets.push({ id: e.id, role: 'entry', w: r.width || 40, row: (r.width || 40) + 22, path: dens(r.path, 10), name: e.name || '' }); continue; } // (every way in: a junction on the street it meets)
    if (!e.path || e.closed || S.isLoop(e)) continue; const st = e.net || /^(Street|Collector) · /.test(e.note || ''); if (!st) continue;
    streets.push({ id: e.id, role: e.coll || /^Collector/.test(e.note || '') ? 'coll' : 'local', w: e.width || 28, row: (e.width || 28) + 22, path: dens(S.fillet(e.path, Math.max(e.r ?? 0, 0)), 10), name: e.name || '' }); }
  const ins = streets.filter(s => s.role === 'entry'); return { streets, discs, rings, R, entry: ins.length ? ins : null };
}
// the plan's streets as named things (phase 4b): its junction graph's chains (streets carried on end to end, a loop street
// drawn in pieces one chain) mapped back to the drives drawn. [{ key (the lowest drive id in it), ids (its drives), bulbs
// (the cul-de-sacs at its ends), role: boulevard (the main entry's), entry (another way in), collector, local or court (a
// bulb at an end), L, cyc, tees (streets that meet it along it), name (its street name), mid, ends: [{ at, kind: tee |
// bulb | free | street (a way in's mouth), id (the drive whose end it is), k (that drive's end), to (the drive it meets),
// bulb (its id) }], parts: [{ id, rev, off, L }] (its drives in order along it), J (where streets meet it, ft along it) }]
export function chainsOf(plan) {
  const n = netOfPlan(plan), els = plan.elements || [], byId = new Map(els.map(e => [e.id, e])); if (!n.streets.length) return [];
  const g = graphOf(n.streets, n.discs.filter(d => d.role !== 'ring'), n.entry), out = [];
  for (const ch of g.chains) { const ss = ch.list.map(x => x.s).filter(s => !s.ring); if (!ss.length) continue; const ids = ss.map(s => s.id), es = ids.map(i => byId.get(i)).filter(Boolean);
    const end = e => !e ? null : { at: e.p.map(fit), kind: e.tee === true ? 'street' : e.tee ? 'tee' : e.bulb ? 'bulb' : e.join ? 'join' : 'free', id: e.s.id, k: e.k, ...(e.tee && e.tee !== true ? { to: e.tee.id } : {}), ...(e.bulb ? { bulb: e.bulb.id } : {}) };
    const ends = ch.cyc ? [] : [end(ch.a), end(ch.b)], ent = ss.find(s => s.role === 'entry'), main = ent && byId.get(ent.id)?.name === 'Main entry';
    const role = ent ? main ? 'boulevard' : 'entry' : ch.coll ? 'collector' : ends.some(e => e?.kind === 'bulb') ? 'court' : 'local', mid = chainAt(g, ch, ch.L / 2)?.p;
    out.push({ key: ids.slice().sort()[0], ids, bulbs: ends.filter(e => e?.bulb).map(e => e.bulb), role, L: Math.round(ch.L), cyc: !!ch.cyc, tees: ch.J.length, name: es.map(e => e.street).find(Boolean) || null, label: es.map(e => e.name).find(Boolean) || null, mid: mid ? mid.map(fit) : null, ends,
      parts: ch.list.filter(x => !x.s.ring).map(x => ({ id: x.s.id, rev: x.rev, off: x.off, L: g.M.get(x.s).L })), J: ch.J.map(j => +j.at.toFixed(1)) }); }
  return out;
}
// what a laid neighbourhood breaks of the street rules (the plan's own, else typical): blocks too long, cul-de-sacs too
// long, junctions too close, crossroads, streets that don't reach a way in, streets run into each other. Warnings only:
// [{ id, level, kind, text }]
// opts.code false: without the rule sheet's own checks (codeRules)
export function netRules(plan, opts = {}) {
  const n = netOfPlan(plan); if (n.streets.length < 2) return [];
  const g = graphOf(n.streets, n.discs.filter(d => d.role !== 'ring'), n.entry), name = ch => ch.list.map(x => x.s.name).find(Boolean) || (ch.coll ? 'a collector' : 'a street');
  return breaches(n.R, g, n.rings).filter(b => b.kind !== 'cut' || n.entry).map(b => ({ id: b.chain.list[0].s.id, level: 'warn', kind: b.kind, text: BREACH(n.R, b, name(b.chain)) })).concat(deadEnds(g, name, plan), clashes(plan.elements || []).map(text => ({ id: null, level: 'warn', kind: 'clash', text })), opts.code === false ? [] : codeRules(plan, n));
}
// streets an edit left ending with no turnaround (a stretch deleted, a cul-de-sac taken off, an end dragged off its
// junction): more than 150 ft past the last junction a fire truck can't turn (the fire code's dead end). Ends the plan was
// laid out with (a first phase's streets running on to land for later, a short stub to the edge) are the generator's, not
// flagged: only those free now and not in its recipe
// (free: the ends the generator left open, kept in the recipe as it laid them, so a re-fit after an edit doesn't make the
// edit's dead end one of them; a recipe from before: its streets' open ends)
const freeAt = nr => { const out = []; if (!nr?.streets) return out; const st = nr.streets.filter(s => !s.pseudo).map(s => ({ ...s, path: s.path })).concat(nr.entry ? [{ ...nr.entry, id: 'entry', role: 'entry' }] : [], (nr.ways || []).map((w, i) => ({ ...w, id: 'way' + i, role: 'entry' })));
  try { for (const e of graphOf(st, nr.discs || [], st.filter(s => s.role === 'entry')).ends.values()) if (e.free) out.push(e.p.map(fit)); } catch (err) { /* an old recipe: every end */ } return out; };
function deadEnds(g, name, plan) {
  const nr = plan.recipe?.net, laid = nr?.free || freeAt(nr), out = []; for (const ch of g.chains) { if (ch.cyc || ch.list.some(x => x.s.ring || x.s.role === 'entry')) continue; const pos = ch.J.map(j => j.at).concat(ch.a?.tee ? [0] : [], ch.b?.tee ? [ch.L] : []);
    for (const [e, end] of [[ch.a, 0], [ch.b, 1]]) { if (!e?.free || !pos.length || laid.some(p => dist(p, e.p) < 5)) continue; const len = end ? ch.L - Math.max(...pos) : Math.min(...pos); if (len > 150) out.push({ id: e.s.id, level: 'warn', kind: 'dead', text: (/^a (street|collector)$/.test(name(ch)) ? 'A street' : name(ch)) + ' ends ' + Math.round(len) + ' ft past its last junction with no turnaround (a fire truck needs one past 150 ft): make it a cul-de-sac or join it up' }); } }
  return out;
}
// what a laid neighbourhood breaks of its rule sheet (plan.params.code, lib/rulesheet.mjs), one line a kind with a count
// (never one a lot): lots narrower at the front than the frontage asked (measured along the right-of-way line, or at the
// building line round a bulb), lots under the smallest size, homes nearer the right-of-way than the building line,
// streets narrower than the sheet's pavement, bulbs smaller than its radius, too few ways in, a right-of-way too narrow
// for its pavement and sidewalks. Warnings: [{ id, level, kind, text }]
export function codeRules(plan, n = netOfPlan(plan)) {
  const code = plan.params?.code, cr = code?.streetRules; if (!cr) return []; const els = plan.elements || [], R = n.R, out = [], say = (kind, k, text) => { if (k) out.push({ id: null, level: 'warn', kind, text }); }, plur = (k, one, many) => k + ' ' + (k === 1 ? one : many);
  const rowOf = (w, coll) => w + (coll ? R.collector.row - R.collector.pave : R.local.row - R.local.pave), lots = els.filter(e => e.kind === 'lot' && e.poly?.length >= 3), discs = new Map(n.discs.map(d => [d.id, d])), byNet = new Map(), lead = new Map(); for (const e of els) if (e.kind === 'drive' && e.net && e.path) (byNet.get(e.net) || byNet.set(e.net, []).get(e.net)).push(e);
  for (const e of els) { const d = e.kind === 'drive' && e.bulb && e.net && discs.get(e.id); if (!d) continue; discs.set(e.net, d); const st = els.find(x => x.kind === 'drive' && x.net && x.path && [x.path[0], x.path[x.path.length - 1]].some(p => dist(p, d.c) <= d.R + 5)); if (st) lead.set(e.net, st.net); } // (a lot round a bulb is on the bulb's network id; the street into it is its own street too)
  // (the front: the outline's edges along the right-of-way line of its own street, as laid; round a bulb, the arc of the
  // building line's circle inside the lot)
  const segs = new Map(), segsOf = (id, h) => segs.get(id) || segs.set(id, byNet.get(id).flatMap(e => e.path.slice(1).map((c, k) => { const a = e.path[k]; return { a, c, b: [Math.min(a[0], c[0]) - h, Math.min(a[1], c[1]) - h, Math.max(a[0], c[0]) + h, Math.max(a[1], c[1]) + h] }; }))).get(id); // (a street's segments, each with its box grown by h)
  const front = l => { const d = discs.get(l.on); if (d) { const r = (R.bulbRow || d.R + 8) + (cr.frontBL ?? 20), q = l.poly; let k = 0; for (let a = 0; a < 360; a++) if (S.inRing([d.c[0] + r * Math.cos(a * Math.PI / 180), d.c[1] + r * Math.sin(a * Math.PI / 180)], q)) k++; return k * Math.PI / 180 * r; }
    const ds = byNet.get(l.on); if (!ds) return null; const P = l.poly, bb = bbox(P), sg = segsOf(l.on, rowOf(ds[0].width || 28, ds[0].coll) / 2 + 20).filter(g => g.b[0] <= bb[2] && g.b[2] >= bb[0] && g.b[1] <= bb[3] && g.b[3] >= bb[1]); if (!sg.length) return null;
    const dq = P.map(q => sg.reduce((m, g) => Math.min(m, S.segDist(q, g.a, g.c)), Infinity)), d0 = Math.min(...dq); // (the front: the outline's edges lying along the right-of-way line, the nearest of it to the street)
    return P.reduce((t, q, i) => t + (dq[i] <= d0 + 2 && dq[(i + 1) % P.length] <= d0 + 2 ? dist(q, P[(i + 1) % P.length]) : 0), 0); };
  if (cr.minLotW > 0) { const k = lots.filter(l => { const f = front(l); return f != null && f < cr.minLotW - 1; }).length; say('frontage', k, plur(k, 'lot is', 'lots are') + ' narrower than the ' + cr.minLotW + ' ft frontage the rule sheet asks for'); }
  if (cr.minLotSf > 0) { const k = lots.filter(l => S.ringArea(l.poly) < cr.minLotSf * 0.99).length; say('lotsize', k, plur(k, 'lot is', 'lots are') + ' under the ' + cr.minLotSf.toLocaleString('en-US') + ' sq ft the rule sheet asks for'); }
  if (cr.frontBL > 0 || cr.sideBL > 0) { const st = n.streets.filter(s => s.role !== 'entry' && !s.ring), G = S.gridIndex([], g => g.b, 150), netOf = new Map(els.filter(e => e.kind === 'drive').map(e => [e.id, e.net || e.id])), fb = cr.frontBL || 0, sb = cr.sideBL || 0; // (the front line from the home's own street, the side line from any other)
    for (const s of st) for (let i = 1; i < s.path.length; i++) { const a = s.path[i - 1], b = s.path[i], h = rowOf(s.w, s.role === 'coll') / 2, m = h + Math.max(fb, sb); G.add({ s, a, b, h, net: netOf.get(s.id) }, [Math.min(a[0], b[0]) - m, Math.min(a[1], b[1]) - m, Math.max(a[0], b[0]) + m, Math.max(a[1], b[1]) + m]); }
    const GL = S.gridIndex(lots, l => bbox(l.poly), 200), lotOf = h => [...GL.near(h.x, h.y, h.x, h.y)].find(l => S.inRing([h.x, h.y], l.poly));
    const ends = new Map(), endsOf = own => ends.get(own) || ends.set(own, (byNet.get(own) || []).flatMap(e => [e.path[0], e.path[e.path.length - 1]])).get(own), ownD = (d, own) => netOf.get(d.id) === own || endsOf(own).some(p => dist(p, d.c) <= d.R + 5); // (a cul-de-sac at the end of the home's own street: its front line runs round it)
    const near = (q, own) => { for (const g of G.near(q[0], q[1], q[0], q[1])) if (S.segDist(q, g.a, g.b) < g.h + (g.net === own || g.net === lead.get(own) ? fb - 2 : sb - 1)) return true; for (const d of n.discs) if (dist(q, d.c) < (R.bulbRow || d.R + 8) + (ownD(d, own) ? fb - 2 : sb - 1)) return true; return false; };
    const k = els.filter(e => e.kind === 'building' && e.use === 'sfr').filter(h => { const own = lotOf(h)?.on; return own && S.corners(h).some(q => near(q, own)); }).length; say('bl', k, plur(k, 'home stands', 'homes stand') + ' nearer a street than the building lines the rule sheet asks for (' + fb + ' ft front' + (sb ? ', ' + sb + ' ft side' : '') + ')'); }
  { const k = n.streets.filter(s => s.role !== 'entry' && !s.ring && s.w < (s.role === 'coll' ? cr.collector?.pave : cr.local?.pave) - 0.5).length; say('row', k, plur(k, 'street is', 'streets are') + ' narrower than the rule sheet’s pavement (' + cr.local?.pave + ' ft local, ' + cr.collector?.pave + ' ft collector)'); }
  { const k = n.discs.filter(d => d.role === 'bulb' && d.R < cr.bulbR - 0.5).length; say('bulb', k, plur(k, 'cul-de-sac is', 'cul-de-sacs are') + ' smaller than the ' + cr.bulbR + ' ft radius the rule sheet asks for'); }
  { const h = els.filter(e => e.kind === 'building' && e.use === 'sfr').length, w = S.entrancesOf(els).filter(e => !e.stub && !e.podIn).length; if (h > cr.secondAt && w < 2) say('ways', 1, h + ' homes and one way in: the rule sheet wants a second over ' + cr.secondAt); }
  { const sw = code.sidewalk; if (sw && sw.sides !== 'none') { const bad = [['local', cr.local], ['collector', cr.collector]].filter(([, x]) => x && (x.row - x.pave) / 2 < sw.w + 2).map(([k]) => k); if (bad.length) say('sidewalk', 1, 'The ' + bad.join(' and ') + ' right-of-way can’t hold the pavement and ' + sw.w + ' ft sidewalks (' + (sw.sides === 'one' ? 'one side' : 'both sides') + ')'); } }
  return out;
}
// a neighbourhood re-fitted: its streets as they are now (one bent or moved by hand re-flows its lots, one deleted takes
// its lots with it, one added by hand gets lots of its own), every kept piece where it is (ponds, parks, trails, signs,
// what's pinned), and the lots, homes, driveways and plain open space laid out again along them. A piece pinned on a
// street (a park dropped on it) cuts it back clear either side, each end a cul-de-sac; a street cut off from every way
// in keeps no homes (until it's joined up again); the main entry deleted, another way in takes its place. An unchanged
// plan comes back the same (its pieces keep their ids). opts: amount ('current': as many homes as the plan has now),
// keep. Returns { elements, notes, recipe }
// a street's drawn pieces (a loop street is drawn in pieces between its junctions) joined back up in their order along it,
// where they still meet end to end: one street again, a loop closed and starting where it did, so its lots march from
// the same place. ds: [{ id, path }]. [{ path, closed, ids (the drives in it) }]
function joinPieces(s0, ds) {
  const m = measured(s0.closed ? s0.path.concat([s0.path[0]]) : s0.path), ps = ds.map(d => ({ p: d.path.map(q => q.slice()), id: d.id })).sort((a, b) => m.proj(a.p[0]).s - m.proj(b.p[0]).s), out = [];
  for (const { p, id } of ps) { const cur = out[out.length - 1]; if (cur && dist(cur.path[cur.path.length - 1], p[0]) < 3) { cur.path = cur.path.concat(p.slice(1)); cur.ids.push(id); } else out.push({ path: p, closed: false, ids: [id] }); }
  if (out.length > 1 && s0.closed && dist(out[out.length - 1].path.at(-1), out[0].path[0]) < 3) { const a = out.pop(); out[0].path = a.path.concat(out[0].path.slice(1)); out[0].ids.push(...a.ids); }
  if (s0.closed && out.length === 1 && dist(out[0].path.at(-1), out[0].path[0]) < 3) { const q = out[0].path.slice(0, -1), k = q.reduce((b, v, i) => dist(v, s0.path[0]) < dist(q[b], s0.path[0]) ? i : b, 0); out[0] = { path: q.slice(k).concat(q.slice(0, k)), closed: true, ids: out[0].ids }; }
  return out;
}
// a drawn piece read back onto the street it was drawn from (O: the recipe's path): where it still runs along it (not bent
// by hand), the street's own points (drawing it drops points closer than 4 ft and rounds the rest), so a street bent in
// one place keeps the rest exactly as it was, and the lots of its other blocks stay where they were
function onStreet(O, closed, D) {
  const P = closed ? O.concat([O[0]]) : O, n = closed ? O.length : P.length, m = measured(P), at = D.map(q => { const r = m.proj(q); return r.d < 0.02 ? r.s : null; }), out = [];
  D.forEach((q, i) => { const s = at[i]; out.push(s == null ? q : m.at(s).p); let t = at[i + 1]; if (s == null || t == null) return; if (closed && t < s - m.L / 2) t += m.L; if (t <= s || t - s > 40) return;
    for (const off of closed ? [0, m.L] : [0]) for (let k = 0; k < n; k++) { const v = m.c[k] + off; if (v > s + 0.01 && v < t - 0.01) out.push(O[k]); } });
  return out;
}
// a street cut back clear of the pieces pinned over it (keep: rings): its stretches clear of them by half its pavement and
// a few feet, each end that was cut pulled back till a bulb there clears them too, those too short to keep dropped.
// [{ path, ends: [cut at the start, cut at the end] }], or null when nothing is over it
function cutBy(s, keep, R) {
  const g = keep.map(k => ringTest(S.grow(k, s.w / 2 + 4))), over = p => g.some(t => t(p)), P = dens(s.path, 5, s.closed); if (!P.some(over)) return null;
  const clearOf = p => keep.every(k => !S.inRing(p, k) && toPoly(p, k) >= R.bulbR + 6), out = [];
  for (const r of runsIn(P, p => !over(p), s.closed)) { let Q = r.path; const ends = [s.closed || dist(Q[0], P[0]) > 1, s.closed || dist(Q[Q.length - 1], P[P.length - 1]) > 1];
    for (const k of [0, 1]) if (ends[k]) { const m = measured(Q); let d = 0; while (d < m.L - 100 && !clearOf(m.at(k ? m.L - d : d).p)) d += 5; if (d >= m.L - 100) { Q = null; break; } const cut = k ? m.L - d : d; Q = k ? Q.filter((q, i) => m.c[i] < cut).concat([m.at(cut).p]) : [m.at(cut).p].concat(Q.filter((q, i) => m.c[i] > cut)); }
    if (Q && lenOf(Q) >= 120) out.push({ path: dens(Q, 10), ends }); }
  return out;
}
// the network of a laid plan as it stands now (refitNet, relayBlock): the recipe's streets where the plan still draws them as
// it did, else the drives as they are now; its bulbs (one added by hand adopted); streets added by hand; the ways in; the
// streets cut back clear of pieces pinned over them. { net, notes, pinned, pin, byNet, relabel, redrawn, lone, fresh, main, promoted }
function netNow(plan, ctx) {
  const nr = plan.recipe.net, els0 = plan.elements || [], notes = [], R = ctx.R;
  const pinned = els0.filter(e => e.pinned), pin = new Set(pinned.map(e => e.id)), byNet = new Map(); for (const e of els0) if (e.kind === 'drive' && e.net && e.net !== 'ring') (byNet.get(e.net) || byNet.set(e.net, []).get(e.net)).push(e);
  // the streets: the recipe's where the plan still draws them as it did, else the drives as they are now (a street drawn in
  // pieces that no longer meet end to end, one gone from the middle: a street per piece, its drives taking the piece's id)
  const streets = [], discs = [], relabel = new Map(), same = (ds, id) => { const k = ds.filter(d => d.path).map(d => pathKey(d.path)).sort().join('|'); return k === (nr.drawn?.[id] || []).slice().sort().join('|'); };
  for (const s0 of nr.streets) { if (s0.pseudo) { streets.push({ ...s0, path: s0.path.slice() }); continue; } const ds = byNet.get(s0.id); if (!ds) continue; if (same(ds, s0.id)) { streets.push({ ...s0, path: s0.path.slice() }); continue; }
    joinPieces(s0, ds.filter(d => d.path).map(d => ({ id: d.id, path: onStreet(s0.path, !!s0.closed, d.path) }))).forEach((q, i) => { const id = s0.id + (i ? '.' + i : ''), { keep, ...o } = s0; for (const d of q.ids) relabel.set(d, id); streets.push({ ...o, id, closed: q.closed, path: dens(q.path, 10, q.closed) }); }); } // (a street drawn anew: its lots run between its junctions as they are)
  for (const d0 of nr.discs) { const e = byNet.get(d0.id)?.[0]; if (!e) continue; const q = S.shapeOf(e), c = S.centroid(q); discs.push({ ...d0, c: dist(c, d0.c) < 0.5 ? d0.c : c }); }
  for (const [id, es] of byNet) { const e = es[0]; if (!e.bulb || nr.discs.some(d => d.id === id)) continue; const q = S.shapeOf(e), c = S.centroid(q); discs.push({ id, role: e.knuckle ? 'knuckle' : 'bulb', c: c.map(fit), R: +Math.max(...q.map(p => dist(p, c))).toFixed(2), of: null }); } // (a cul-de-sac made by hand: a disc of the network from now on, of the street that ends there)
  const atEnd = (t, c) => !t.closed && (dist(t.path[0], c) < 2 || dist(t.path[t.path.length - 1], c) < 2); for (const d of discs) { if (streets.some(t => t.id === d.of && atEnd(t, d.c))) continue; const t = streets.find(t => atEnd(t, d.c)); if (t) d.of = t.id; } // (a bulb on the piece of a street it now ends)
  for (const e of els0) if (e.kind === 'drive' && !e.net && e.path && !e.closed && !S.isEntrance(e) && !S.isRing(e) && !S.isLoop(e) && e.pinned) streets.push(mkStreet(ctx, 'local', dens(S.fillet(e.path, Math.max(e.r ?? 0, 0)), 10), { w: e.width || 28, row: (e.width || 28) + 22 })); // (a street added by hand)
  // a bulb whose street was deleted goes with it (not a paved disc with no street to it)
  const lone = new Set(discs.filter(d => !streets.some(s => s.id === d.of) && !(byNet.get(d.id) || []).some(e => pin.has(e.id))).map(d => d.id)); if (lone.size) { discs.splice(0, discs.length, ...discs.filter(d => !lone.has(d.id))); notes.push((lone.size === 1 ? 'A cul-de-sac' : lone.size + ' cul-de-sacs') + ' whose street was deleted went with it.'); }
  // the ways in as they are now: the main entry (deleted: a way in placed by hand takes its place, else another), the
  // recipe's other ways where an entrance still comes in at their mouths, and the entrances added since
  const ents = S.entrancesOf(els0).map(e => ({ e, r: S.routeOf(e, plan.ring) })).filter(x => x.r?.path?.length >= 2), at0 = x => x.r.path[0], near = (p, q) => !!p && !!q && dist(p, q) < 60;
  let main = ents.find(x => x.e.kind === 'drive' && x.e.name === 'Main entry') || null; const promoted = main ? null : ents.find(x => x.e.pinned) || ents[0] || null; main ||= promoted;
  if (promoted) notes.push((promoted.e.name || 'An entrance') + ' is the main entry now (the main entry was deleted).');
  const entry = !main ? null : !promoted && nr.entry && !main.e.pinned ? { ...nr.entry, id: 'entry', role: 'entry' } : mkStreet(ctx, 'entry', dens(main.r.path, 10), { w: main.r.width || 40, row: (main.r.width || 40) + 22 }), entryAt = !main ? null : promoted ? at0(main) : nr.entryAt || at0(main);
  const others = ents.filter(x => x !== main), took = new Set(), ways = (nr.ways || []).filter(w => { const x = others.find(o => !took.has(o) && near(at0(o), w.path[0])); if (x) took.add(x); return !!x; }).map(w => ({ ...w, id: sid('w'), role: 'entry' }))
    .concat(others.filter(x => !took.has(x)).map(x => mkStreet(ctx, 'entry', dens(x.r.path, 10), { w: x.r.width || 36, row: (x.r.width || 36) + 42 })));
  for (const s of streets) if (s.entryClear && !ents.some(x => near(at0(x), s.clearAt || nr.entryAt))) { delete s.entryClear; delete s.clearAt; } // (its way in gone: homes may front its first stretch now)
  // pieces pinned over a street (a park or a building dropped on it): the street cut back clear of them, each cut end a
  // cul-de-sac; its drives drawn again
  const over = pinned.filter(e => !['drive', 'trail', 'sign', 'lot', 'plaza', 'fence'].includes(e.kind) && !(e.kind === 'green' && !S.isPark(e)) && !S.isMedian(e)).map(e => ccw(S.shapeOf(e))), redrawn = new Set(), fresh = { streets: [], discs: [] };
  let stopped = 0, cutOff = 0; if (over.length) for (const s of streets.slice()) { if (s.pseudo) continue; const cut = cutBy(s, over, R); if (!cut) continue;
    streets.splice(streets.indexOf(s), 1); if (cut.length) stopped++; else cutOff++; redrawn.add(s.id); const mine = discs.filter(d => d.of === s.id); for (const d of mine) { discs.splice(discs.indexOf(d), 1); redrawn.add(d.id); }
    cut.forEach((c, i) => { const { keep, ...o } = s, t = { ...o, id: s.id + '~' + i, closed: false, path: c.path }; streets.push(t); fresh.streets.push(t);
      for (const k of [0, 1]) { const e = k ? c.path[c.path.length - 1] : c.path[0], d0 = mine.find(d => dist(d.c, e) < 1); if (c.ends[k] || d0) { const d = { id: d0?.id || sid('b'), role: d0?.role || 'bulb', c: e, R: d0?.R || R.bulbR, of: t.id }; discs.push(d); fresh.discs.push(d); } } }); }
  if (stopped) notes.push((stopped === 1 ? 'A street' : stopped + ' streets') + ' under what was placed on ' + (stopped === 1 ? 'it now stops' : 'them now stop') + ' short of it, each end a cul-de-sac.');
  if (cutOff) notes.push((cutOff === 1 ? 'A stretch of street' : cutOff + ' stretches of street') + ' under what was placed on ' + (cutOff === 1 ? 'it is' : 'them are') + ' gone: too little was left either side to keep.');
  const net = { kind: nr.kind, streets, discs, entry, ways, res: nr.reserve || [], entryAt, rings: [], sk: { core: nr.core }, ...(nr.kind === 'pod' ? { hubs: streets.filter(s => s.pseudo) } : {}) };
  return { net, notes, pinned, pin, byNet, relabel, redrawn, lone, fresh, main, promoted };
}
export function refitNet(plan0, opts = {}, T) {
  const plan = { ...plan0, setbacks: { ...S.SETBACKS, ...(plan0.setbacks || {}) } }, rc = plan.recipe, nr = rc.net, prog = S.normalizeProgram(rc.prog || plan.program), els0 = plan.elements || [], notes = [];
  const ctx = context(plan, prog, { pod: nr.kind === 'pod' }); Object.assign(ctx, nr.lot || {}); const R = ctx.R;
  const { net, notes: n0, pinned, pin, byNet, relabel, redrawn, lone, fresh, main, promoted } = netNow(plan, ctx), { streets, discs, entry, ways, entryAt } = net; notes.push(...n0);
  // streets cut off from every way in: no homes on them (their lots and homes go) until they're joined up again
  const gr = graphOf(streets.concat(entry ? [entry] : [], ways), discs, net.hubs || [entry, ...ways].filter(Boolean)), bare = new Set(streets.filter(s => !s.pseudo && !gr.reached.has(s)).map(s => s.id).concat(discs.filter(d => !streets.some(s => s.id === d.of)).map(d => d.id))); // (and a bulb whose street is gone)
  const nb = streets.filter(s => bare.has(s.id)).length; if (nb && (entry || net.hubs?.length)) notes.push((nb === 1 ? 'A street no longer reaches' : nb + ' streets no longer reach') + ' a way in: no homes on ' + (nb === 1 ? 'it' : 'them') + ' until ' + (nb === 1 ? 'it’s' : 'they’re') + ' joined up again.');
  // what stays: everything but the lots, the homes and their driveways, and plain open space (what's pinned always stays)
  // homes deleted (the Delete key, or Change With AI's remove) leave their lots with no home on them: those stay empty
  // (vacant), so a re-fit neither puts the homes back nor makes the count up with homes elsewhere. A lot is vacant once
  // marked so, or while the driveway of the home that went is still on it (a home moved by hand takes its driveway along:
  // its old lot is laid out again)
  const pt = e => [e.x, e.y, e.x, e.y], blds = S.gridIndex(els0.filter(e => e.kind === 'building'), pt, 200), dws = S.gridIndex(els0.filter(e => e.kind === 'plaza' && e.note === 'Driveway' && !e.pinned), pt, 200), holds = (G, l) => { const q = S.shapeOf(l); return [...G.near(...bbox(q))].some(e => S.inRing([e.x, e.y], q)); };
  const vacant = new Set(els0.filter(e => e.kind === 'lot' && !pin.has(e.id) && !holds(blds, e) && (e.vacant || holds(dws, e))).map(e => e.id));
  const relaid = e => !pin.has(e.id) && !vacant.has(e.id) && (e.kind === 'lot' || e.kind === 'building' && e.use === 'sfr' || e.kind === 'plaza' && e.note === 'Driveway' || e.kind === 'green' && (!e.name || e.name === 'Open space' || e.name === 'Future development') && !S.isMedian(e) && !e.belt || e.kind === 'trash');
  let kept = els0.filter(e => !relaid(e) && !(e.kind === 'drive' && (redrawn.has(e.net) || lone.has(e.net)) && !pin.has(e.id))).map(e => ({ ...e, ...(relabel.has(e.id) ? { net: relabel.get(e.id) } : {}), ...(promoted && e.id === promoted.e.id ? { name: 'Main entry' } : {}) })).concat(fresh.streets.length ? netEls(ctx, { streets: fresh.streets, discs: fresh.discs, entry: null, ways: [] }) : []);
  const solid = kept.filter(e => !['drive', 'trail', 'sign', 'lot'].includes(e.kind) && !(e.kind === 'green' && !S.isPark(e))).map(e => e.kind === 'building' ? S.grow(ccw(S.shapeOf(e)), 5) : ccw(S.shapeOf(e)))
    .concat(kept.filter(e => e.kind === 'sign' || S.isEntrance(e)).map(e => S.grow(ccw(S.shapeOf(e)), e.kind === 'sign' ? 3 : 2)), nr.core ? [nr.core] : []);
  // (the count: the recipe's own, when a first phase was asked for; never made up by trimming the march, which would take
  // homes off its far end for those moved or deleted here)
  const now = els0.filter(e => e.kind === 'building' && e.use === 'sfr' && !pin.has(e.id)).length;
  const lots = marchLots(ctx, net, { mix: nr.mix || prog.homeMix, max: nr.cap ?? null, plans: plan.params?.housePlans !== false, solid, bare, near: nr.near });
  // a vacant lot's place laid again: not built (the lot stays, marked vacant); a vacant lot whose place the streets no
  // longer have (one bent or gone): it goes, and its place is laid out as the street has it now
  const lel = lots.els, skip = new Set(), still = new Set(); for (const v of els0.filter(e => vacant.has(e.id))) { const q = ccw(S.shapeOf(v)), g = S.grow(q, -1), b = bbox(q), hit = [];
    for (let i = 0; i < lel.length; i += 3) { const lb = bbox(lel[i].poly); if (lb[0] < b[2] && lb[2] > b[0] && lb[1] < b[3] && lb[3] > b[1] && S.rectsOverlap({ poly: g }, { poly: lel[i].poly }, 0)) hit.push(i); }
    if (hit.length === 1 && S.inRing(S.centroid(lel[hit[0]].poly), q) && S.inRing(S.centroid(q), lel[hit[0]].poly)) { skip.add(hit[0]); still.add(v.id); } }
  kept = kept.filter(e => !vacant.has(e.id) || still.has(e.id)).map(e => vacant.has(e.id) ? { ...e, vacant: true } : e);
  let all = kept.concat(lel.filter((e, i) => !skip.has(i - i % 3)));
  const have = all.filter(e => e.kind === 'pond').reduce((t, e) => t + S.elArea(e), 0), land = landOf(ctx, T, all, [], { openSpace: nr.openSpace, pond: Math.max(0, ctx.need - have) }); // (as when it was laid out: no playground or dog park of its own)
  all = all.concat(land.els);
  // what was laid out again where it was before keeps its id (an unchanged plan comes back the same, piece for piece)
  const key = e => e.kind + '|' + Math.round(e.x * 2) + ',' + Math.round(e.y * 2) + '|' + Math.round(e.rot || 0) + '|' + Math.round(S.elArea(e)), was = new Map(); for (const e of els0) if (relaid(e) && !was.has(key(e))) was.set(key(e), e.id);
  const ids = new Set(kept.map(e => e.id)); for (const e of all.slice(kept.length)) { const id = was.get(key(e)); if (id && !ids.has(id)) { e.id = id; ids.add(id); } else e.id ||= sid('e'); }
  const at = net.entryAt || S.centroid(plan.ring);
  T.nameAll(all.filter(e => !pin.has(e.id)), at, prog, new Set(pinned.map(e => e.name).filter(Boolean)));
  all = S.seatAll({ ...plan, elements: all }); // (a roundabout: the homes laid under it make way, as when it was laid out)
  const keepIds = new Set(kept.map(e => e.id)), fx = T.repair(plan, all, keepIds); all = orphans(fx.els);
  all = T.signEntry(plan, T.withTrash(plan, prog, all, notes), notes, main?.e.signs);
  const n1 = all.filter(e => e.kind === 'building' && e.use === 'sfr' && !pin.has(e.id)).length; if (n1 < now) notes.push(n1 + ' homes round what moved, ' + now + ' before.');
  const br = netRules({ ...plan, elements: all }); notes.push(...[...new Set(br.map(b => b.text + '.'))]);
  if (fx.bad.length) notes.push(...fx.bad.filter(i => !pin.has(i.id)).map(i => i.text + '.'));
  const drawn = {}; for (const e of all) if (e.kind === 'drive' && e.net && e.path) (drawn[e.net] ||= []).push(pathKey(e.path));
  const recWays = promoted || ways.length !== (nr.ways || []).length || ways.some((w, i) => w.path !== nr.ways[i].path) ? { entry: entry ? { path: entry.path, w: entry.w, row: entry.row } : null, ways: ways.map(w => ({ path: w.path, w: w.w, row: w.row })), entryAt } : {}; // (the ways in as they are now, when they've changed)
  return { elements: all, notes, recipe: { ...rc, net: { ...nr, ...recWays, free: nr.free || freeAt(nr), streets: streets.map(recStreet), discs, drawn, lost: lots.homes - skip.size - n1 } } };
}

// ---------- a block laid out again (phase 4b: "re-lay this block") ----------
// the land between the collectors, the ways in, the pond's land and the commons, as blocks over 2 acres: [{ outer, holes,
// area }] (plan feet; cut by the pavements, so a block's edges along them are its gates, as a skeleton's pods are)
function minusH(a, cuts) { try { return polyclip.difference([close(ccw(a))], ...cuts.map(c => [close(ccw(c))])).filter(pg => pg[0]?.length >= 4).map(pg => ({ outer: ccw(S.tidyRing(pg[0].slice(0, -1), 0.5)), holes: pg.slice(1).filter(h => h.length >= 4).map(h => h.slice(0, -1)) })).filter(b => b.outer.length >= 3); } catch { return []; } }
const lengthen = (P, d) => { if (P.length < 2) return P; const a = unit([P[0][0] - P[1][0], P[0][1] - P[1][1]]), n = P.length, b = unit([P[n - 1][0] - P[n - 2][0], P[n - 1][1] - P[n - 2][1]]); return [add(P[0], a, d), ...P, add(P[n - 1], b, d)]; };
export function blocksOf(ctx, net) {
  const cut = net.streets.filter(s => s.role === 'coll' || s.pseudo).concat(net.entry ? [net.entry] : [], net.ways || []).map(s => S.outline({ kind: 'drive', path: s.closed ? s.path.concat([s.path[0], s.path[1]]) : lengthen(s.path, 6), width: s.w + 2, r: 0 })).concat(net.res || [], net.sk?.core ? [net.sk.core] : []);
  return minusH(ctx.land, cut).map(b => ({ ...b, area: area(b.outer) - b.holes.reduce((t, h) => t + area(h), 0) })).filter(b => b.area > 2 * AC);
}
const inBlock = (b, p) => S.inRing(p, b.outer) && !b.holes.some(h => S.inRing(p, h));
// a block's local streets laid out again (k: the k-th best other way they could run, by the generator's own estimate), the
// streets outside it and the collectors held as they are; then the lots re-flow (refitNet). { elements, recipe, notes, at,
// block (its outline) }
// or { error }, the plan unchanged
export function relayBlock(plan0, at, opts = {}, T) {
  let plan = { ...plan0, setbacks: { ...S.SETBACKS, ...(plan0.setbacks || {}) } }; const rc0 = plan.recipe, nr0 = rc0?.net; if (!nr0) return { error: 'Only subdivision streets can re-lay a block: New Layouts with Settings › Neighbourhood streets › Like a subdivision.' };
  const prog = S.normalizeProgram(rc0.prog || plan.program), ctx = context(plan, prog, { pod: nr0.kind === 'pod' }); Object.assign(ctx, nr0.lot || {}); const R = ctx.R, k = Math.max(1, Math.round(+opts.k || 1)), H0 = plan.elements.filter(e => e.kind === 'building' && e.use === 'sfr');
  let now = netNow(plan, ctx); // (streets drawn in pieces or cut back since the last re-fit: re-fitted first, so the recipe is the drawing)
  if (now.relabel.size || now.redrawn.size || now.lone.size || now.net.streets.some(s => !s.pseudo && !nr0.streets.some(o => o.id === s.id))) { const r0 = refitNet(plan, { amount: 'current' }, T); plan = { ...plan, elements: r0.elements, recipe: r0.recipe }; now = netNow(plan, ctx); }
  const nr = plan.recipe.net, net = now.net, blocks = blocksOf(ctx, net); if (!blocks.length) return { error: 'There’s no block of land between the collectors to lay out again.' };
  const b = blocks.find(x => inBlock(x, at)) || blocks.slice().sort((x, y) => toPoly(at, x.outer) - toPoly(at, y.outer))[0];
  if (b.holes.length) return { error: 'That land wraps round the rest of the neighbourhood (between the loop road and the lot lines): pick a block inside the collectors.' };
  const share = s => { const P = dens(s.path, 20, s.closed); return P.filter(p => inBlock(b, p)).length / P.length; }, gone = new Set(net.streets.filter(s => !s.pseudo && s.role !== 'coll' && s.role !== 'entry' && share(s) >= 0.6).map(s => s.id));
  const base = net.streets.filter(s => !gone.has(s.id)), keepD = net.discs.filter(d => !gone.has(d.of)), was = net.streets.filter(s => gone.has(s.id)), L0 = was.reduce((t, s) => t + lenOf(s.path), 0);
  // the ways the block's streets could run, best first by the generator's estimate; one that rebuilds today's left out
  const pod = { ring: ccw(S.tidyRing(b.outer, 1)), base }; pod.edges = podEdges(ctx, pod.ring, base); const cand = [];
  for (const pat of patternsOf(ctx, pod)) { let r = null; try { r = podStreets(ctx, pod, pat); } catch (e) { r = null; } if (!r?.streets.length) continue; const L = r.streets.reduce((t, s) => t + lenOf(s.path), 0);
    if (r.streets.length === was.length && Math.abs(L - L0) <= L0 * 0.05) continue; if (cand.some(c => c.r.streets.length === r.streets.length && Math.abs(c.L - L) < 1)) continue; cand.push({ r, L, est: estimate(ctx, pod, r) }); }
  cand.sort((x, y) => y.est - x.est); if (!cand.length) return { error: 'No other way to run that block’s streets fits it.' };
  // laid in with the rest held (connect and the pocket courts touch only the block's new streets), every new street reached
  const lay = c => { const nn = { ...net, streets: base.map(s => ({ ...s, path: s.path.slice(), fixed: true })).concat(c.r.streets.map(s => ({ ...s, path: s.path.slice() }))), discs: keepD.map(d => ({ ...d })).concat(c.r.discs.map(d => ({ ...d }))), fixed: true, within: pod.ring, tried: null };
    connect(ctx, nn); pocketCourts(ctx, nn); const g = graphOf(nn.streets.concat(nn.entry ? [nn.entry] : [], nn.ways || []), nn.discs, nn.hubs || [nn.entry, ...(nn.ways || [])].filter(Boolean)), mine = nn.streets.filter(s => !s.fixed);
    return mine.length && mine.every(s => g.reached.has(s)) ? { nn, nb: breaches(R, g, []).length } : null; };
  // (those that break no more street rules than the plan does now, else the one that breaks fewest: the first few laid out
  // in full and ranked by the homes they hold, as the estimate alone often ranks them wrong; k the k-th of those)
  const all0 = net.streets.concat(net.entry ? [net.entry] : [], net.ways || []), nb0 = breaches(R, graphOf(all0, net.discs, net.hubs || [net.entry, ...(net.ways || [])].filter(Boolean)), []).length;
  const ok = []; let best = null; for (let i = 0; i < cand.length && ok.length < 3; i++) { const x = lay(cand[i]); if (!x) continue; if (x.nb <= nb0) ok.push(x.nn); else if (!best || x.nb < best.nb) best = x; }
  if (!ok.length && best) ok.push(best.nn); if (!ok.length) return { error: 'No other way to run that block’s streets reaches every home: the plan is as it was.' };
  const g0 = graphOf(all0, net.discs), was0 = new Map(net.streets.map(s => [s.id, s])), jk = (g, s) => (g.J.get(s) || []).map(j => j.p.map(Math.round).join(',')).sort().join(';'), inB = h => inBlock(b, [h.x, h.y]);
  const done = ok.map(nn => {
    // the drives of the streets gone taken off, the new streets drawn, the lots re-flowed round them
    const ids0 = new Set(net.discs.map(d => d.id)), mine = nn.streets.filter(s => !s.fixed), newD = nn.discs.filter(d => !ids0.has(d.id)), goneD = new Set(net.discs.filter(d => gone.has(d.of)).map(d => d.id));
    const els = plan.elements.filter(e => !(e.kind === 'drive' && (gone.has(e.net) || goneD.has(e.net)))).concat(netEls(ctx, { streets: mine, discs: newD, entry: null, ways: [] }));
    const drawn = {}; for (const e of els) if (e.kind === 'drive' && e.net && e.path) (drawn[e.net] ||= []).push(pathKey(e.path));
    // a street held along the block whose far side's lots ran between junctions the block's new streets change (the loop
    // road round it): that side keeps the junctions it had, so its homes stay where they were, now and at every re-fit after
    const g1 = graphOf(nn.streets.concat(nn.entry ? [nn.entry] : [], nn.ways || []), nn.discs), held = new Map();
    for (const s of nn.streets) { const s0 = was0.get(s.id); if (!s.fixed || s.pseudo || !s0 || jk(g0, s0) === jk(g1, s)) continue;
      const m = measured(s.closed ? s.path.concat([s.path[0]]) : s.path), on = side => { let k = 0; for (let t = 0; t <= m.L; t += 25) { const tn = m.tan(t); if (inBlock(b, add(m.at(t).p, [-tn[1] * side, tn[0] * side], s.row / 2 + 30))) k++; } return k; }, l = on(1), r = on(-1), far = l && !r ? -1 : r && !l ? 1 : 0;
      if (far) held.set(s.id, { side: far, at: keptJ(s0, far, g0.J).map(q => q.map(fit)) }); }
    const rec = { ...plan.recipe, net: { ...nr, streets: nn.streets.map(({ fixed, ...s }) => recStreet(held.has(s.id) ? { ...s, keep: held.get(s.id) } : s)), discs: nn.discs.map(d => ({ id: d.id, role: d.role, c: d.c, R: d.R, of: d.of })), drawn } };
    rec.net.free = (nr.free || freeAt(nr)).filter(p => !inBlock(b, p)).concat(freeAt(rec.net).filter(p => inBlock(b, p))); // (the block's new streets' open ends are the generator's)
    const r = refitNet({ ...plan, elements: els, recipe: rec }, { amount: 'current' }, T); return { r, n: r.elements.filter(e => e.kind === 'building' && e.use === 'sfr' && inB(e)).length }; });
  const pick = done.map((x, i) => ({ ...x, i })).sort((x, y) => y.n - x.n || x.i - y.i)[(k - 1) % done.length], r = pick.r;
  return { ...r, at: S.centroid(pod.ring).map(fit), block: pod.ring.map(q => q.map(fit)), notes: ['Laid the block’s streets out again: ' + pick.n + ' homes (' + H0.filter(inB).length + ' before).', ...r.notes] };
}
export { mkStreet, rowIndex, estimate, chainAt, toBulb, context as contextOf };
