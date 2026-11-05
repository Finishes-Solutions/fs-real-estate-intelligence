// Homes round a central feature: a loop street ringing the middle of the site, lots on both sides of it (an outer row
// backing onto the lot lines, an inner row backing onto the middle) and the feature in the middle: a lake that holds the
// detention, or a park with the community's amenity centre (a pool and its clubhouse) and the pond beside it. Two ways
// in from the street meet the loop at its front corners (down the loop's sides, as far apart as the frontage allows).
// "Homes around a central lake", "houses ringing a park", "a neighbourhood round a pool and clubhouse".
// Frame feet (lib/sitelayout.mjs frameOf: the street along the bottom at Y0, x along it, y in from it); the caller turns
// the pieces into plan feet, names them, checks them and sizes the pond to the drawn plan's own detention.
// Concept planning only: lot lines, the loop's corners and the lake's banks are drawn square; not engineered.
import * as S from './siteplan.mjs';

// the pieces of one try, or null when the land can't take a loop with a row of lots each side and a middle
//   F      the frame (X0..X1, Y0..Y1, rr: the lot lines)
//   o      { pave, park, BL: the street's pavement, the strip each side to the lot line, the front building line;
//            lotD: lot depth; inner: 'all' | 'fb' | 'none' (the inner rows on all four sides, the front and back only, or
//            none); center: 'lake' | 'park'; pond: the pond's area wanted (sf); home(k, uMax) -> the k-th home
//            { lotW, w, d, sf, floors, plan } or null when none fits uMax ft of frontage; inRing(p) -> p inside the lot lines }
export function ringPieces(F, o) {
  const { pave, park, BL, lotD: D } = o, X0 = F.X0, X1 = F.X1, Y0 = F.Y0, Y1 = F.Y1, W = X1 - X0, H = Y1 - Y0;
  const o1 = D + park, oi = o1 + pave + park, inX = o.inner === 'all', inY = o.inner !== 'none'; // (o1: the loop's pavement in from the lot lines; oi: the inner rows' front line)
  const cx0 = X0 + oi + (inX ? D : 0), cx1 = X1 - oi - (inX ? D : 0), cy0 = Y0 + oi + (inY ? D : 0), cy1 = Y1 - oi - (inY ? D : 0); // the middle
  if (cx1 - cx0 < 160 || cy1 - cy0 < 120) return null;
  const els = [], R = (x0, y0, x1, y1, e) => ({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, d: y1 - y0, ...e });
  // the loop: four legs (square corners; the run rounds the curb returns) and the two ways in down its sides to the street
  const st = { kind: 'drive', name: '', note: 'Street · ' + pave + ' ft' };
  els.push(R(X0 + o1, Y0 + o1, X1 - o1, Y0 + o1 + pave, st), R(X0 + o1, Y1 - o1 - pave, X1 - o1, Y1 - o1, st), R(X0 + o1, Y0 + o1, X0 + o1 + pave, Y1 - o1, st), R(X1 - o1 - pave, Y0 + o1, X1 - o1, Y1 - o1, st));
  els.push(R(X0 + o1, Y0 - 2, X0 + o1 + pave, Y0 + o1 + 1, { kind: 'drive', name: 'Main entry', note: 'Entry · ' + pave + ' ft', entry: true }), R(X1 - o1 - pave, Y0 - 2, X1 - o1, Y0 + o1 + 1, { kind: 'drive', name: 'Entrance 2', note: 'Entry · ' + pave + ' ft', entry: true }));
  // the land each side of an entry, out to the lot lines: planted (the entry's landscape and its sign)
  const ent = o1 + pave + park; els.push(R(X0, Y0, X0 + o1, Y0 + ent, { kind: 'green', name: '', note: 'Entry landscape', trees: true }), R(X0 + o1 + pave, Y0, X0 + ent, Y0 + D, { kind: 'green', name: '', note: 'Entry landscape', trees: true }), R(X1 - o1, Y0, X1, Y0 + ent, { kind: 'green', name: '', note: 'Entry landscape', trees: true }), R(X1 - ent, Y0, X1 - o1 - pave, Y0 + D, { kind: 'green', name: '', note: 'Entry landscape', trees: true }));
  // a row of lots: u along its frontage (a..b), v in from its front line (0) to its back (depth); map(u, v) -> frame point
  let k = 0; const homes = [];
  const row = (a, b, depth, map, ext0 = 0, ext1 = 0) => {
    let u = a; const here = [];
    for (;;) { const h = o.home(k, b - u); if (!h || u + h.lotW > b + 0.01) break;
      const lot = [u, u + h.lotW], cu = u + h.lotW / 2, hv = [BL, BL + h.d], gu = cu + h.w / 2 - 10;
      here.push({ lot, home: { u: [cu - h.w / 2, cu + h.w / 2], v: hv, h }, drv: [gu - 8, gu + 8] }); k++; u += h.lotW; }
    if (here.length) { const left = b - u; if (left > 2) here[here.length - 1].lot[1] += Math.min(left, 25); here[0].lot[0] -= ext0; here[here.length - 1].lot[1] += ext1; } // (the end of a stretch to the last lot, up to 25 ft; a corner lot out to the lot lines)
    for (const q of here) {
      const box = (u0, u1, v0, v1) => { const p = map(u0, v0), r = map(u1, v1); return [Math.min(p[0], r[0]), Math.min(p[1], r[1]), Math.max(p[0], r[0]), Math.max(p[1], r[1])]; };
      const L = box(q.lot[0], q.lot[1], 0, depth), Hm = box(q.home.u[0], q.home.u[1], q.home.v[0], q.home.v[1]), Dw = box(q.drv[0], q.drv[1], -park, BL);
      if (![[L[0], L[1]], [L[2], L[1]], [L[2], L[3]], [L[0], L[3]]].every(p => o.inRing(p))) continue;
      const h = q.home.h, lw = Math.round(q.lot[1] - q.lot[0]);
      els.push(R(...L, { kind: 'lot', name: '', note: lw + ' × ' + Math.round(depth) + ' ft lot' }), R(...Hm, { kind: 'building', use: 'sfr', floors: h.floors, units: 1, sf: h.sf, nowalk: true, note: h.plan ? h.plan.note : h.floors + '-story · ' + h.sf.toLocaleString('en-US') + ' sf', ...(h.plan ? { type: h.plan.id } : {}) }), R(...Dw, { kind: 'plaza', name: '', note: 'Driveway' }));
      homes.push(q);
    }
  };
  const fr = o1 + pave + park; // (past a leg: its far right-of-way line)
  // outer rows: front (backing onto the street, between the entries), back (corner to corner), left and right (up to the back row)
  row(X0 + fr, X1 - fr, D, (u, v) => [u, Y0 + D - v]);
  row(X0 + D, X1 - D, D, (u, v) => [u, Y1 - D + v]);
  row(Y0 + fr, Y1 - D, D, (u, v) => [X0 + D - v, u], 0, D);
  row(Y0 + fr, Y1 - D, D, (u, v) => [X1 - D + v, u], 0, D);
  // inner rows: front and back the inner ring's full width, the sides between them
  // a park's amenity centre is reached by a drive from the loop's front leg, with a row of stalls each side (the inner
  // front row gives up its middle for it)
  const cxc = (X0 + X1) / 2, gap = o.center === 'park' ? [cxc - 34, cxc + 34] : null;
  if (inY) { if (gap) { row(X0 + oi, gap[0], D, (u, v) => [u, Y0 + oi + v]); row(gap[1], X1 - oi, D, (u, v) => [u, Y0 + oi + v]); } else row(X0 + oi, X1 - oi, D, (u, v) => [u, Y0 + oi + v]); row(X0 + oi, X1 - oi, D, (u, v) => [u, Y1 - oi - v]); }
  if (inX) { row(Y0 + oi + D, Y1 - oi - D, D, (u, v) => [X0 + oi + v, u]); row(Y0 + oi + D, Y1 - oi - D, D, (u, v) => [X1 - oi - v, u]); }
  // the middle: a park the whole of it, a walking trail round it, the lake (or the pond) and the amenities in it
  const mx0 = inX ? cx0 : X0 + oi, mx1 = inX ? cx1 : X1 - oi, my0 = inY ? cy0 : Y0 + oi, my1 = inY ? cy1 : Y1 - oi;
  els.push(R(mx0, my0, mx1, my1, { kind: 'green', name: '', note: o.center === 'lake' ? 'Lakeside park' : 'Central park', trees: true }));
  const m = 24, ax0 = mx0 + m, ax1 = mx1 - m, ay0 = my0 + m, ay1 = my1 - m, cxm = (mx0 + mx1) / 2;
  els.push({ kind: 'trail', name: '', note: 'Walking trail', path: [[mx0 + 10, my0 + 10], [mx1 - 10, my0 + 10], [mx1 - 10, my1 - 10], [mx0 + 10, my1 - 10], [mx0 + 10, my0 + 10]], width: 6, r: 0 });
  const amen = [], pondEl = (x0, y0, x1, y1) => ({ kind: 'pond', name: o.center === 'lake' ? 'Amenity lake' : 'Detention pond', note: o.center === 'lake' ? 'Wet detention' : 'Detention', poly: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
  if (o.center === 'park') { // the amenity centre in the middle of the park (the clubhouse toward the front, its pool behind), the pond in two basins either side of it
    const cw = 70, cd = 50, pw0 = 60, pd0 = 34, gw = 130; if (ay1 - ay0 < cd + pd0 + 50 || ax1 - ax0 < gw + 120) return null;
    const cy = (ay0 + ay1) / 2 - (cd + pd0 + 34) / 2;
    const ya = Y0 + o1 + pave - 1, yb = cy - 8; if (yb - ya < 40) return null;
    amen.push(R(cxm - 12, ya, cxm + 12, yb, { kind: 'drive', name: '', note: 'Drive to the clubhouse · 24 ft' }), { kind: 'parking', x: cxm - 21, y: (ya + 6 + yb) / 2, w: yb - ya - 6, d: 18, rotL: 90, row: -1, islands: true, name: '', note: '' }, { kind: 'parking', x: cxm + 21, y: (ya + 6 + yb) / 2, w: yb - ya - 6, d: 18, rotL: 90, row: 1, islands: true, name: '', note: '' });
    amen.push(R(cxm - cw / 2, cy, cxm + cw / 2, cy + cd, { kind: 'building', use: 'amenity', floors: 1, name: 'Clubhouse', note: 'Community centre · fitness · lounge' }), R(cxm - pw0 / 2 - 12, cy + cd + 10, cxm + pw0 / 2 + 12, cy + cd + 10 + pd0 + 24, { kind: 'plaza', name: '', note: 'Pool deck' }), R(cxm - pw0 / 2, cy + cd + 22, cxm + pw0 / 2, cy + cd + 22 + pd0, { kind: 'pool', name: 'Pool', note: 'Community pool' }));
    const bw = (ax1 - ax0 - gw) / 2, bd = ay1 - ay0, max = 2 * bw * bd, want = Math.min(max, Math.max(0, o.pond || 0)), d = want > 0 ? Math.min(bd, Math.max(want / 2 / bw, Math.min(bd, 40))) : 0, w = want > 0 ? Math.min(bw, want / 2 / d) : 0, ym = (ay0 + ay1) / 2;
    if (w > 20 && d > 20) els.push(pondEl(ax0 + bw - w, ym - d / 2, ax0 + bw, ym + d / 2), pondEl(ax1 - bw, ym - d / 2, ax1 - bw + w, ym + d / 2)); // (each basin against the amenity centre's lawn)
    return { els: els.concat(amen), homes: homes.length, pond: w > 20 && d > 20 ? 2 * w * d : 0, pondMax: max, mid: [mx0, my0, mx1, my1] };
  }
  const availW = ax1 - ax0, availD = ay1 - ay0; if (availW < 60 || availD < 50) return null;
  const max = availW * availD, want = Math.min(max, Math.max(o.pond || 0, 0)), s = want > 0 ? Math.sqrt(want / max) : 0;
  const pw = Math.max(Math.min(availW, 60), availW * s), pd = want > 0 ? Math.min(availD, want / pw) : 0;
  if (pd > 20) els.push(pondEl(cxm - pw / 2, (ay0 + ay1) / 2 - pd / 2, cxm + pw / 2, (ay0 + ay1) / 2 + pd / 2));
  // a pavilion and a playground on the lake's front lawn where they fit (the lake's shore 20 ft clear of them)
  if (pd > 20) { const yb = (ay0 + ay1) / 2 - pd / 2 - 20; if (yb - ay0 >= 50 && yb - 50 - (Y0 + o1 + pave) <= 130) { /* (within a hose's reach of the loop) */ amen.push(R(cxm - 40, yb - 50, cxm + 40, yb, { kind: 'building', use: 'amenity', floors: 1, name: 'Pavilion', note: 'Open-air · covered', gfa: 4000 })); if (cxm + 60 + 64 < ax1) amen.push(R(cxm + 60, yb - 48, cxm + 124, yb, { kind: 'play', name: 'Playground' })); } }
  return { els: els.concat(amen), homes: homes.length, pond: pd > 20 ? pw * pd : 0, pondMax: max, mid: [mx0, my0, mx1, my1] };
}

// ---------- any lot shape (Nov 5, later) ----------
// The same neighbourhood on an L, a wedge, a curving frontage or any lot that isn't a near-rectangle: the loop follows the
// lot lines a lot's depth in (the outline simplified to its main lines: a curve drawn as chords kept as a few straight
// runs), each leg a straight street at its own angle; lots are laid along both sides of each leg, square to it, wherever
// a whole lot fits (inside the lot lines, clear of the streets, the other lots and the middle), so corners, a wedge's
// point and an L's inside corner are skipped, not overlapped; the middle is the loop's inside less the inner rows. Homes
// are houses, rows of townhomes (front-load: a garage and a driveway each, rows of up to six, guest stalls off the loop
// between rows) or duplexes, each on its kind's own lot (o.homes). The ways in come square to the street at the two ends
// of the run of legs facing a street. Frame feet; pieces carry rotL (their leg's angle in the frame).
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], len = v => Math.hypot(v[0], v[1]), area = r => S.signedArea(r);
// the kept vertices of a closed ring, simplified (Douglas-Peucker) to tol ft
function keptOf(ring, tol) {
  const n = ring.length; let far = 0, fd = -1; ring.forEach((p, i) => { const d = len(sub(p, ring[0])); if (d > fd) { fd = d; far = i; } });
  const keep = new Set([0, far]);
  const dp = (i0, i1) => { let k = -1, m = tol; for (let i = i0 + 1; i < i1; i++) { const d = S.segDist(ring[i % n], ring[i0 % n], ring[i1 % n]); if (d > m) { m = d; k = i; } } if (k > 0) { keep.add(k % n); dp(i0, k); dp(k, i1); } };
  dp(0, far); dp(far, n); return [...keep].sort((a, b) => a - b);
}
const lineX = (a, b, c, d) => { const r = sub(b, a), s = sub(d, c), den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-9) return null; const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den; return [a[0] + r[0] * t, a[1] + r[1] * t]; };
const simple = r => { const n = r.length; for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (S.segsCross(r[i], r[(i + 1) % n], r[j], r[(j + 1) % n])) return false; } return true; };
// two convex quadrilaterals overlap (separating axes; touching within tol ft is not overlapping)
function quadsMeet(A, B, tol = 0.5) {
  for (const R of [A, B]) for (let i = 0; i < R.length; i++) { const a = R[i], b = R[(i + 1) % R.length], L = len(sub(b, a)) || 1, nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity; for (const p of A) { const v = p[0] * nx + p[1] * ny; if (v < a0) a0 = v; if (v > a1) a1 = v; } for (const p of B) { const v = p[0] * nx + p[1] * ny; if (v < b0) b0 = v; if (v > b1) b1 = v; }
    if (a1 <= b0 + tol || b1 <= a0 + tol) return false; }
  return true;
}
const boxOf = r => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of r) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } return [x0, y0, x1, y1]; };
// the loop's centre line: the simplified outline in by `off`, short legs merged into their neighbours, sharp corners cut
function loopLine(P, flags, minL = 50) {
  let C = S.insetRing(P, flags.map(f => f.off)); if (C.length !== P.length) return null; let fl = flags.slice();
  for (let it = 0; it < 30 && C.length > 3; it++) { // (a leg shorter than minL: its two ends become the meeting point of the legs either side)
    const n = C.length; let j = -1, best = minL; for (let i = 0; i < n; i++) { const L = len(sub(C[(i + 1) % n], C[i])); if (L < best) { best = L; j = i; } } if (j < 0) break;
    const a = C[(j - 1 + n) % n], b = C[j], c = C[(j + 1) % n], d = C[(j + 2) % n]; let p = lineX(a, b, c, d); const mid = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]; if (!p || len(sub(p, mid)) > 3 * minL) p = mid;
    const j1 = (j + 1) % n, nC = C.map((q, i) => i === j ? p : q).filter((_, i) => i !== j1), nF = fl.filter((_, i) => i !== j); C = nC; fl = nF;
  }
  // a corner sharper than 70°: cut across it (two gentler turns a fire truck can make)
  for (let it = 0; it < 8; it++) { const n = C.length; let hit = -1;
    for (let i = 0; i < n; i++) { const u = sub(C[i], C[(i - 1 + n) % n]), v = sub(C[(i + 1) % n], C[i]), cr = u[0] * v[1] - u[1] * v[0], ang = Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (len(u) * len(v) || 1)))) * 180 / Math.PI; if (cr > 0 && 180 - ang < 70) { hit = i; break; } }
    if (hit < 0) break; const i = hit, a = C[(i - 1 + n) % n], b = C[i], c = C[(i + 1) % n], la = len(sub(b, a)), lc = len(sub(c, b)), cut = Math.min(80, 0.35 * Math.min(la, lc));
    const p = [b[0] + (a[0] - b[0]) / la * cut, b[1] + (a[1] - b[1]) / la * cut], q = [b[0] + (c[0] - b[0]) / lc * cut, b[1] + (c[1] - b[1]) / lc * cut];
    C = [...C.slice(0, i), p, q, ...C.slice(i + 1)]; fl = [...fl.slice(0, i), { st: false, dout: Math.min(fl[(i - 1 + n) % n].dout, fl[i].dout) }, ...fl.slice(i)];
  }
  if (C.length < 3 || area(C) <= 0 || !simple(C) || C.some(p => !S.inRing(p, P))) return null;
  return { C, fl };
}
//   F   the frame (rr: the lot lines)
//   o   { pave, park, lotD, inner: 'all' | 'long' | 'none', pond: the lake's area wanted (sf), homes(k) -> the k-th home's
//         candidates, widest first [{ lotW, w, d, BL, units, unitW, drives, el }], guest: guest stalls a home owes on the
//         street, inRing(p) -> p inside the lot lines, streetEdge(i) -> edge i of F.rr is on a street }
export function ringPoly(F, o) {
  const { pave, park, lotD: D } = o, ring0 = F.rr, n0 = ring0.length, ccw = area(ring0) > 0, ring = ccw ? ring0 : ring0.slice().reverse(), oi = i => ccw ? i : (2 * n0 - 2 - i) % n0; // (edge i of the CCW ring is edge oi(i) of the frame's)
  const K = keptOf(ring, 14), P = K.map(i => ring[i]); if (P.length < 3) return null;
  const flags = K.map((k, j) => { const k1 = K[(j + 1) % K.length], end = k1 > k ? k1 : k1 + n0; let st = 0, all = 0, sb = 0; for (let i = k; i < end; i++) { const L = len(sub(ring[(i + 1) % n0], ring[i % n0])); all += L; if (o.streetEdge(oi(i % n0))) st += L; if (F.build) sb = Math.max(sb, +F.build[oi(i % n0)] || 0); } const dout = Math.max(D, (o.need || 0) + sb); return { st: st >= all / 2, dout, off: dout + pave / 2 + park }; });
  if (!flags.some(f => f.st)) return null;
  const hw = pave / 2, tf = hw + park, LP = loopLine(P, flags); if (!LP) return null;
  const { C, fl } = LP, n = C.length, legs = C.map((a, i) => { const b = C[(i + 1) % n], L = len(sub(b, a)), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], nO = [u[1], -u[0]]; return { i, a, b, L, u, nO, ang: Math.atan2(u[1], u[0]) * 180 / Math.PI, street: fl[i].st, dout: fl[i].dout }; });
  if (legs.some(l => l.L < 40)) return null;
  const at = (g, s, t) => [g.a[0] + g.u[0] * s + g.nO[0] * t, g.a[1] + g.u[1] * s + g.nO[1] * t];
  const quad = (g, s0, s1, t0, t1) => [at(g, s0, t0), at(g, s1, t0), at(g, s1, t1), at(g, s0, t1)];
  const rect = (g, s0, s1, t0, t1, e) => { const c = at(g, (s0 + s1) / 2, (t0 + t1) / 2); return { x: c[0], y: c[1], w: s1 - s0, d: Math.abs(t1 - t0), rotL: g.ang, ...e }; };
  const els = [], pave0 = [], lotsQ = [];
  // the legs: each a straight street, run on past its ends far enough to close the corner's outer side
  for (let k = 0; k < n; k++) { const g = legs[k], gp = legs[(k - 1 + n) % n], gn = legs[(k + 1) % n], ext = h => { const c = Math.max(-1, Math.min(1, h.u[0] * g.u[0] + h.u[1] * g.u[1])), th = Math.acos(c) / 2; return Math.min(2 * pave, hw * Math.tan(th)) + 1; };
    const s0 = -ext(gp), s1 = g.L + ext(gn); els.push(rect(g, s0, s1, -hw, hw, { kind: 'drive', name: '', note: 'Street · ' + pave + ' ft' })); pave0.push(quad(g, s0, s1, -hw, hw)); }
  // the ways in: square to a street-facing leg, out to the street, as far apart as the street legs allow (every spot where
  // such a drive reaches the street; the pair farthest apart, the main entry the one nearer the front line's middle)
  const streetLegs = legs.filter(g => g.street); if (!streetLegs.length) return null;
  const rayOut = (g, s) => { for (let t = hw; t < D + tf + 80; t += 2) { const q = at(g, s, t); if (!S.inRing(q, F.rr)) { let best = -1, bd = 1e9; for (let i = 0; i < n0; i++) { const d = S.segDist(q, F.rr[i], F.rr[(i + 1) % n0]); if (d < bd) { bd = d; best = i; } } return o.streetEdge(best) ? t : null; } } return null; };
  const entries = [], W = Math.min(pave + 4, 30);
  const spots = []; for (const g of streetLegs) for (let s = W / 2; s <= g.L - W / 2 + 0.01; s += 6) { const t = rayOut(g, s); if (t != null) spots.push({ g, s, t, p: at(g, s, 0), Q: quad(g, s - W / 2, s + W / 2, hw - 1, t + 2) }); }
  if (!spots.length) return null;
  let e1 = spots[0], e2 = null, far = 150; for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) { const d = len(sub(spots[i].p, spots[j].p)); if (d > far + 0.01) { far = d; e1 = spots[i]; e2 = spots[j]; } }
  { const f = F.front ?? 0, fm = [(F.rr[f][0] + F.rr[(f + 1) % n0][0]) / 2, (F.rr[f][1] + F.rr[(f + 1) % n0][1]) / 2]; if (e2 && len(sub(e2.p, fm)) < len(sub(e1.p, fm)) - 0.01) [e1, e2] = [e2, e1]; }
  for (const [e, nm] of [[e1, 'Main entry'], [e2, 'Entrance 2']]) { if (!e) continue; entries.push(e); els.push(rect(e.g, e.s - W / 2, e.s + W / 2, hw - 1, e.t + 2, { kind: 'drive', name: nm, note: 'Entry · ' + W + ' ft', entry: true })); pave0.push(e.Q); }
  const row0 = pave0.map(q => S.grow(q, park - 1)); // (each street's right-of-way: no lot reaches into it)
  // the middle: the loop's inside less its inner rows (on every leg, the long legs only, or none)
  // (fit: the inner rows on the longest legs first, each kept while the middle stays whole and still holds the lake)
  const Mof = on => S.insetRing(C, C.map((_, i) => tf + (on[i] ? D : 0))), Cin = S.insetRing(C, C.map(() => tf));
  const whole = Mq => { if (!(Mq.length >= 3) || area(Mq) < 160 * 120 || !simple(Mq) || Mq.some(p => !S.inRing(p, C))) return false; const q = S.insetRing(Mq, Mq.map(() => 24)); return q.length >= 3 && simple(q) && area(q) >= Math.max(3000, o.pond || 0) && q.every(p => S.inRing(p, Mq)); };
  let innerOn = legs.map(() => o.inner === 'all');
  if (o.inner === 'fit') for (const g of legs.slice().sort((a, b) => b.L - a.L)) { const on = innerOn.slice(); on[g.i] = true; if (whole(Mof(on))) innerOn = on; }
  const M = Mof(innerOn); if (!whole(M)) return null;
  if (o.inner === 'fit' && !innerOn.some(Boolean)) return null; // (the same as none)
  const okIn = (Q, R) => Q.every(p => S.inRing(p, R) || R.some((a, i) => S.segDist(p, a, R[(i + 1) % R.length]) < 1));
  const inSite = Q => Q.every(p => o.inRing(p, 0.5));
  let k = 0, owed = 0, got = 0; const homes = [];
  const free = Q => { const b = boxOf(Q); for (const R of lotsQ) { const c = R.box; if (c[2] < b[0] || b[2] < c[0] || c[3] < b[1] || b[3] < c[1]) continue; if (quadsMeet(Q, R.q)) return false; } return !row0.some(R => quadsMeet(Q, R)); };
  // a bay of m guest stalls off a leg's street at s (90°, at the pavement's edge), where it's clear
  const guestAt = (g, sgn, s, m) => { const Wg = m * 9, [t0, t1] = sgn > 0 ? [hw, hw + 18] : [-hw - 18, -hw], Q = quad(g, s, s + Wg, t0, t1), Qs = quad(g, s + 0.5, s + Wg - 0.5, t0 + 0.5, t1 - 0.5);
    if (!(s >= -1 && s + Wg <= g.L + 1 && inSite(Q) && (sgn > 0 || okIn(Q, C) && !S.rectsOverlap({ poly: Qs }, { poly: M }, 0.5)) && !lotsQ.some(R => quadsMeet(Qs, R.q)) && !row0.some((R, i) => i !== g.i && quadsMeet(Qs, R)))) return false;
    els.push(rect(g, s, s + Wg, t0, t1, { kind: 'parking', row: sgn > 0 ? 1 : -1, lock: true, islands: false, name: '', note: 'Guest parking' })); lotsQ.push({ q: Q, box: boxOf(Q) }); owed -= m; return true; };
  // a row of lots along one side of a leg (side 1: outward, toward the lot lines; -1: inward, toward the middle)
  const rowOf = (g, sgn) => {
    const T = (a, b) => sgn > 0 ? [tf + a, tf + b] : [-(tf + b), -(tf + a)], reach = D + tf + 30;
    for (let s = -reach; s < g.L + reach;) {
      // guest stalls off the street, in a gap between rows, where the homes owe them
      if (o.guest > 0 && owed >= 6) { const m = Math.min(10, Math.round(owed)); if (guestAt(g, sgn, s, m)) { s += m * 9 + 6; continue; } }
      let placed = false;
      for (const h of o.homes(k, got)) {
        if (s + h.lotW > g.L + reach) continue;
        const D0 = sgn > 0 ? g.dout : D; for (let dep = D0; dep >= Math.max(h.BL + h.d + 8, D0 * 0.75); dep -= 5) {
          const [t0, t1] = T(0, dep), Q = quad(g, s + 0.25, s + h.lotW - 0.25, t0 + 0.25, t1 - 0.25);
          if (sgn > 0 ? !inSite(quad(g, s, s + h.lotW, t0, t1)) : !okIn(Q, Cin) || S.rectsOverlap({ poly: Q }, { poly: M }, 0.5)) { if (sgn > 0) continue; break; }
          if (sgn > 0 && S.rectsOverlap({ poly: Q }, { poly: C }, 0.5)) break; // (an outer lot stays outside the loop: past an inside corner its leg's line runs into the middle)
          if (!free(Q)) break;
          // the lot, its home (BL in from the front), the driveway across the verge
          const cu = s + h.lotW / 2, [ht0, ht1] = T(h.BL, h.BL + h.d), [dv0, dv1] = sgn > 0 ? [hw, tf + h.BL] : [-(tf + h.BL), -hw];
          if (o.inBuild && !quad(g, cu - h.w / 2, cu + h.w / 2, ht0, ht1).every(p => o.inBuild(p))) break; // (the home inside the setbacks from every lot line)
          if ((h.drives || [[h.w - 18, h.w - 2]]).some(([a, b]) => cu - h.w / 2 + a < -hw || cu - h.w / 2 + b > g.L + hw)) break; // (its driveways onto the leg's own street, not past its end)
          const lots = h.units > 1 && h.unitW ? Array.from({ length: h.units }, (_, j) => rect(g, cu - h.w / 2 + j * h.unitW, cu - h.w / 2 + (j + 1) * h.unitW, t0, t1, { kind: 'lot', name: '', note: h.unitW + ' × ' + Math.round(dep) + ' ft townhome lot' }))
            : [rect(g, s, s + h.lotW, t0, t1, { kind: 'lot', name: '', note: Math.round(h.lotW) + ' × ' + Math.round(dep) + ' ft lot' })];
          els.push(...lots, rect(g, cu - h.w / 2, cu + h.w / 2, ht0, ht1, { kind: 'building', ...h.el }));
          for (const [a, b] of h.drives || [[h.w - 18, h.w - 2]]) els.push(rect(g, cu - h.w / 2 + a, cu - h.w / 2 + b, dv0, dv1, { kind: 'plaza', name: '', note: 'Driveway' }));
          lotsQ.push({ q: Q, box: boxOf(Q) }); homes.push(h); got += h.units || 1; owed += (o.guest || 0) * (h.units || 1); k++; s += h.lotW; placed = true; break;
        }
        if (placed) break;
      }
      if (!placed) s += 5;
    }
  };
  // outer rows first (the longest legs first: their lots are the cleanest), then the inner rows
  const order = legs.slice().sort((a, b) => b.L - a.L);
  for (const g of order) rowOf(g, 1);
  for (const g of order) if (innerOn[g.i]) rowOf(g, -1);
  // the guest stalls still owed (a count reached before the rows ended): bays wherever the streets have room left
  if (o.guest > 0) for (const sgn of [1, -1]) for (const g of order) for (let s = 0; s < g.L && owed > 0.3;) { const m = Math.min(10, Math.max(2, Math.ceil(owed))); if (guestAt(g, sgn, s, m)) s += m * 9 + 6; else s += 6; }
  // the middle: a park, the lake in it sized to the detention, a walking trail round the lake's shore
  els.push({ kind: 'green', name: '', note: 'Lakeside park', trees: true, poly: M });
  const lakeAt = m => { const q = S.insetRing(M, M.map(() => m)); return q.length >= 3 && area(q) > 0 && simple(q) && q.every(p => S.inRing(p, M)) ? q : null; };
  let best = lakeAt(24), pondA = best ? area(best) : 0, mAt = 24; const max = pondA;
  if (best && o.pond > 0 && pondA > o.pond) { let lo = 24, hi = 400; for (let it = 0; it < 24; it++) { const m = (lo + hi) / 2, q = lakeAt(m); if (q && area(q) >= o.pond) { lo = m; best = q; pondA = area(q); mAt = m; } else hi = m; } }
  if (best && pondA > 3000) { els.push({ kind: 'pond', name: 'Amenity lake', note: 'Wet detention', poly: best });
    const tr = S.insetRing(M, M.map(() => Math.max(10, mAt - 14))); if (tr.length >= 3 && simple(tr) && area(tr) > 0) els.push({ kind: 'trail', name: '', note: 'Walking trail', path: [...tr, tr[0]], width: 6, r: 0 }); } else pondA = 0;
  return { els, homes: homes.reduce((t, h) => t + (h.units || 1), 0), pond: pondA, pondMax: max, mid: M, entries: entries.length };
}
