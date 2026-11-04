// Parking stalls in any outline (a parking piece given a custom shape with Edit Shape: `poly` on the element). Whole
// 90° stalls only, laid in rows along one direction (`angle`, degrees, plan feet): double-loaded bays (stall, aisle,
// stall) wherever the outline holds a whole bay, single-loaded rows (stall and aisle) where it holds only one side,
// and nothing where a stall or the aisle in front of it would cross the outline. A stall is kept only when it and its
// aisle lie wholly inside (checked exactly, not just against the scan lines), so no stall is ever cut by the outline.
// Pure geometry, no imports: lib/siteplan.mjs counts, draws and exports these (stalls, stallLines, stallCentres,
// accessible), and the editor turns them (Stall direction, Face the building).
const RAD = Math.PI / 180;
const rot = ([x, y], deg) => { const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD); return [x * c - y * s, x * s + y * c]; };
const TOL = 0.02; // ft: a plan's coordinates are kept to 0.01 ft, so a stall that fits exactly still fits (a quarter inch at most)

// the polygon's slice at height v (local frame): the inside stretches along u, sorted [[l, r], …] (half-open rule, so
// a horizontal edge or a vertex on the line is counted once)
function slice(P, v) {
  const xs = [];
  for (let i = 0, n = P.length; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; if ((a[1] <= v && v < b[1]) || (b[1] <= v && v < a[1])) xs.push(a[0] + (v - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); }
  xs.sort((p, q) => p - q); const out = []; for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] > xs[i]) out.push([xs[i], xs[i + 1]]); return out;
}
const meet = (A, B) => { const out = []; let i = 0, j = 0; while (i < A.length && j < B.length) { const l = Math.max(A[i][0], B[j][0]), r = Math.min(A[i][1], B[j][1]); if (r > l) out.push([l, r]); if (A[i][1] < B[j][1]) i++; else j++; } return out; };
// where a band lo..hi (local v) is inside the outline all the way across: the stretches along u. Sliced just inside
// each end, either side of every corner within the band and every 2 ft, so a slanted or notched side is followed.
function bandFree(P, lo, hi, vs) {
  const e = 1e-4, at = [lo + TOL, hi - TOL]; for (const v of vs) if (v > lo + TOL && v < hi - TOL) at.push(v - e, v + e); for (let v = lo + 2; v < hi - 1; v += 2) at.push(v); // (a side a hair off level, its corners kept to 0.01 ft, is still the band's end)
  let I = null; for (const v of at) { const s = slice(P, v); I = I ? meet(I, s) : s; if (!I.length) break; } return I || [];
}
const inPoly = ([x, y], P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const segsCross = (a, b, c, d) => { const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d); return d1 * d2 < 0 && d3 * d4 < 0; };
// an upright box u0..u1 × v0..v1 wholly inside the outline (its edges may lie on the outline, within TOL)
export function boxInside(P, u0, u1, v0, v1) {
  const a = u0 + TOL, b = u1 - TOL, c = v0 + TOL, d = v1 - TOL; if (b <= a || d <= c) return false;
  const R = [[a, c], [b, c], [b, d], [a, d]];
  if (!R.every(p => inPoly(p, P))) return false;
  if (P.some(([x, y]) => x > a && x < b && y > c && y < d)) return false; // a corner of the outline poking in
  for (let i = 0; i < 4; i++) for (let j = 0; j < P.length; j++) if (segsCross(R[i], R[(i + 1) % 4], P[j], P[(j + 1) % P.length])) return false;
  return true;
}

// The stalls of one direction. S: { w, d, aisle } (ft). aisle: false for a single row that backs onto a drive outside
// it (an engine's single-loaded row, `row`): the stalls need no aisle inside the outline. Rows are tried at every
// 1 ft offset of the bay pattern and the offset that holds the most stalls wins (ties: the pattern starting at the
// outline's low side, -v, which Face the building turns toward the building).
// Returns { count, angle, c, S, rows: [{ a, b, side, us }] } in the local frame (u along the rows, v across, about c):
// a row's stalls run v a..b, each from u to u + S.w (us sorted); side +1: its aisle is above it (v > b), -1 below.
export function fillPoly(poly, angle = 0, S = { w: 9, d: 18, aisle: 24 }, { aisle = true, step = 1 } = {}) {
  const none = { count: 0, angle, c: [0, 0], S, rows: [] };
  if (!(poly?.length >= 3) || !(S.w > 0) || !(S.d > 0)) return none;
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]), c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const P = poly.map(p => rot([p[0] - c[0], p[1] - c[1]], -angle)), vs = P.map(p => p[1]), v0 = Math.min(...vs), v1 = Math.max(...vs), A = aisle ? Math.max(0, S.aisle || 0) : 0, M = 2 * S.d + (S.aisle || 0);
  if (v1 - v0 < S.d - TOL) return { ...none, c };
  const memo = new Map(), free = (lo, hi) => { const k = lo.toFixed(3) + ':' + hi.toFixed(3); if (!memo.has(k)) memo.set(k, bandFree(P, lo, hi, vs)); return memo.get(k); };
  // every offset: the stalls the scan lines allow (cheap); then the exact check, best first, until no offset left can
  // beat the best checked one (the check only ever takes stalls away)
  const tries = [];
  for (let t = 0; t < M - 1e-9; t += step) {
    const rows = []; let count = 0;
    for (let v = v0 - M + t; v < v1; v += M) for (const [a, b, side] of [[v, v + S.d, 1], [v + S.d + S.aisle, v + M, -1]]) {
      let lo = side > 0 ? a : a - A, hi = side > 0 ? b + A : b; if (lo < v0 - TOL || hi > v1 + TOL) continue;
      lo = Math.max(lo, v0); hi = Math.min(hi, v1);
      const us = [];
      for (const [L, R] of free(lo, hi)) { const n = Math.floor((R - L + TOL) / S.w); if (n < 1) continue; const u0 = L + (R - L - n * S.w) / 2; for (let k = 0; k < n; k++) us.push(+(u0 + k * S.w).toFixed(4)); }
      if (us.length) { rows.push({ a: Math.max(a, v0), b: Math.min(b, v1), side, lo, hi, us }); count += us.length; }
    }
    tries.push({ t, count, rows });
  }
  tries.sort((p, q) => q.count - p.count || p.t - q.t);
  let best = { count: 0, rows: [] };
  for (const tr of tries) {
    if (tr.count <= best.count) break;
    const rows = []; let count = 0;
    for (const r of tr.rows) { const us = r.us.filter(u => boxInside(P, u, u + S.w, r.a, r.b) && (!A || boxInside(P, u, u + S.w, r.side > 0 ? r.b : r.lo, r.side > 0 ? r.hi : r.a)));
      if (us.length) { rows.push({ a: r.a, b: r.b, side: r.side, us }); count += us.length; } }
    if (count > best.count) best = { count, rows };
  }
  return { count: best.count, angle, c, S, rows: best.rows };
}
// a local point (u, v) of a fill in plan feet
export const putOf = f => (u, v) => { const q = rot([u, v], f.angle); return [+(f.c[0] + q[0]).toFixed(2), +(f.c[1] + q[1]).toFixed(2)]; };
// a row's stalls in runs of neighbours (no gap between them): [[i0, i1], …] (indices into us, inclusive)
export function runsOf(row, w) {
  const out = []; let s = 0;
  for (let i = 1; i <= row.us.length; i++) if (i === row.us.length || Math.abs(row.us[i] - row.us[i - 1] - w) > 0.01) { out.push([s, i - 1]); s = i; }
  return out;
}
// the stripes: a line between each pair of stalls and at each end of a run, and the head line along the side away
// from the aisle (as lib/siteplan.mjs stallLines draws a rectangle's)
export function linesOf(f) {
  const put = putOf(f), w = f.S.w, out = [];
  for (const r of f.rows) for (const [i0, i1] of runsOf(r, w)) {
    for (let i = i0; i <= i1 + 1; i++) { const u = i <= i1 ? r.us[i] : r.us[i1] + w; out.push([put(u, r.a), put(u, r.b)]); }
    const head = r.side > 0 ? r.a : r.b; out.push([put(r.us[i0], head), put(r.us[i1] + w, head)]);
  }
  return out;
}
// each stall's outline in plan feet, row by row ([[box, …], …])
export function boxesOf(f) { const put = putOf(f), w = f.S.w; return f.rows.map(r => r.us.map(u => [put(u, r.a), put(u + w, r.a), put(u + w, r.b), put(u, r.b)])); }
export function centresOf(f) { const put = putOf(f), w = f.S.w; return f.rows.flatMap(r => r.us.map(u => put(u + w / 2, (r.a + r.b) / 2))); }

// a parking piece's stall size (the plan's own, kept on the piece when it differs from the usual 9 × 18 ft, 24 ft aisles)
export const sizeOf = (e, S0) => e.sw ? { w: e.sw, d: e.sd || S0.d, aisle: e.sa || S0.aisle } : S0;
// a custom-shaped parking piece's stalls. The rows run along `stallAng` (absolute degrees, kept on the piece so a copy
// of it turned to rot 0 counts the same); a piece without one tries its own turn and the turn 90° from it and keeps
// whichever holds more (as a rectangle does). Kept by outline and settings (copies of a piece, as the layout engine
// counts them, find it too), the last 400.
const cache = new Map();
export function polyStalls(e, S) {
  const key = [e.poly.map(p => p[0] + ',' + p[1]).join(';'), e.stallAng ?? 'r' + (e.rot || 0), S.w, S.d, S.aisle, e.row ? 1 : 0].join('|'), c = cache.get(key);
  if (c) return c;
  const o = { aisle: !e.row };
  let f;
  if (e.stallAng != null && Number.isFinite(+e.stallAng)) f = { ...fillPoly(e.poly, +e.stallAng, S, o), swap: false };
  else { const r = e.rot || 0, a = fillPoly(e.poly, r, S, o), b = fillPoly(e.poly, r + 90, S, o); f = b.count > a.count ? { ...b, swap: true } : { ...a, swap: false }; }
  cache.set(key, f); if (cache.size > 400) cache.delete(cache.keys().next().value); return f;
}
// the angle a custom-shaped piece's rows run along now (what Stall direction turns 90°)
export const rowAngle = (e, S) => +(((polyStalls(e, S).angle % 180) + 180) % 180).toFixed(2);
