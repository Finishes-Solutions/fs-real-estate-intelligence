// Lanes and yards a building type needs beside its building, drawn after a run (lib/btsite.mjs) on the open ground the
// engine left round it: a school's parent drop-off queue and its bus loop, a daycare's drop-off lane, a hotel's
// porte-cochère, a bank's drive-thru lane when the bank is a zone of a mixed plan, a play yard beside a building.
//
// A lane runs along one face of its building (the curb: where children get out, a bus loads, guests are dropped under the
// canopy, a teller's window), and where the queue the type asks for is longer than the face it doubles back on itself
// in rows outward from the face (a serpentine, each turn a car's U-turn). Its two open ends are routed over open ground
// to the nearest drive (a grid in the building's own frame, 4 ft cells; turns cost as much as 40 ft of lane so the runs
// are straight or turn once or twice): only landscape and walks are crossed, never a building, parking, a pond, a play
// yard, another lane or the paving buffer along the lot line. Each face, direction of travel and number of rows is tried;
// the one meeting the queue with the shortest runs (the face toward the street first) wins, and anything the engine's own
// check (lib/siteplan.mjs check) calls broken leaves it off.
//
// Planning estimates, not a design: the queue counts and their sources are in lib/btsite.mjs QUEUE_TYPES.
import * as S from './siteplan.mjs';

const G = 4, TURN = 40, DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const rot = ([x, y], deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; };
export const plen = P => P.slice(1).reduce((t, q, i) => t + Math.hypot(q[0] - P[i][0], q[1] - P[i][1]), 0);
const dPoly = (p, r) => { let m = Infinity; for (let i = 0; i < r.length; i++) { const d = S.segDist(p, r[i], r[(i + 1) % r.length]); if (d < m) m = d; } return m; };
const dPath = (p, P) => { let m = Infinity; for (let i = 0; i + 1 < P.length; i++) { const d = S.segDist(p, P[i], P[i + 1]); if (d < m) m = d; } return m; };
const pathGap = (A, B) => { let m = Infinity; for (let i = 0; i + 1 < A.length; i++) for (let j = 0; j + 1 < B.length; j++) { const d = S.segSeg(A[i], A[i + 1], B[j], B[j + 1]); if (d < m) m = d; } return m; };
// points along a path every `step` ft
const along = (P, step = 2) => { const out = []; for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let s = 0; s < L; s += step) out.push([a[0] + (b[0] - a[0]) * s / L, a[1] + (b[1] - a[1]) * s / L]); } if (P.length) out.push(P[P.length - 1]); return out; };

// a path with a ft cut off its start and b off its end ([] when nothing is left)
function trim(P, a, b) {
  const L = plen(P); if (!(L > a + b + 1)) return [];
  const at = t => { let d = 0; for (let i = 0; i + 1 < P.length; i++) { const l = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); if (d + l >= t) { const k = l ? (t - d) / l : 0; return { i, p: [P[i][0] + (P[i + 1][0] - P[i][0]) * k, P[i][1] + (P[i + 1][1] - P[i][1]) * k] }; } d += l; } return { i: P.length - 2, p: P[P.length - 1] }; };
  const s0 = at(a), s1 = at(L - b); return [s0.p, ...P.slice(s0.i + 1, s1.i + 1), s1.p];
}
// what a lane may run over (landscape, a walk) and what it may join (a drive of the plan's own circulation)
export const PASS = e => e.kind === 'green' && !e.part || /* (land held for later too: a lane beside its building is part of what is built now) */ e.kind === 'plaza' && /^Walk\b/.test(e.note || '');
export const GOAL = e => (e.kind === 'drive' && e.note !== 'Drive-thru lane' && !e.queue && !e.exit && !/exit/i.test(e.note || '') || e.kind === 'field' && e.turn) && !e.future; // (a drive's turnaround is its paving too)

// ---------- the open ground on a grid ----------
// in the building's frame (u along its length w, v across): blocked cells (where a lane w wide can't have its centre
// line: within half its width and a foot of anything but landscape and walks, or nearer the lot line than the paving
// buffer) and drive cells (where a lane ends)
export function groundOf(plan, els, B, w, pad = 420, street = false) {
  const th = B.rot || 0, toL = p => rot([p[0] - B.x, p[1] - B.y], -th), toP = ([u, v]) => { const q = rot([u, v], th); return [+(B.x + q[0]).toFixed(2), +(B.y + q[1]).toFixed(2)]; };
  const ring = (plan.ring || []).map(toL); if (ring.length < 3) return null;
  const R0 = Math.max(B.w, B.d) / 2 + pad, u0 = Math.max(-R0, Math.min(...ring.map(p => p[0]))), u1 = Math.min(R0, Math.max(...ring.map(p => p[0]))), v0 = Math.max(-R0, Math.min(...ring.map(p => p[1]))), v1 = Math.min(R0, Math.max(...ring.map(p => p[1])));
  const nu = Math.max(1, Math.ceil((u1 - u0) / G)), nv = Math.max(1, Math.ceil((v1 - v0) / G)), N = nu * nv, blk = new Uint8Array(N), goal = new Uint8Array(N);
  const cu = i => u0 + (i + 0.5) * G, cv = j => v0 + (j + 0.5) * G, keep = Math.max(0, +(plan.setbacks?.paving ?? 10)) + w / 2;
  // (street: a lane may also run out to the street itself, its own driveway across the front or a street side; the
  // paving buffer is along the side and rear lines only)
  const n0 = ring.length, onStreet = k => k === (+plan.front || 0) || (plan.streets || []).includes(k), sEdges = street ? ring.map((a, k) => onStreet(k) ? [a, ring[(k + 1) % n0]] : null).filter(Boolean) : [], oEdges = street ? ring.map((a, k) => onStreet(k) ? null : [a, ring[(k + 1) % n0]]).filter(Boolean) : null;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const p = [cu(i), cv(j)], k = j * nu + i; if (!S.inRing(p, ring)) { blk[k] = 2; continue; }
    if (!street) { if (dPoly(p, ring) < keep) blk[k] = 2; continue; } // (outside the lot or in its paving buffer: 2, a drive there may still be joined)
    const dO = Math.min(...oEdges.map(([a, b]) => S.segDist(p, a, b))), dS = Math.min(...sEdges.map(([a, b]) => S.segDist(p, a, b)));
    if (dO < keep) blk[k] = 2; else if (dS < 3) goal[k] = 2; }
  const mark = (r, m, arr, val, inside) => { const xs = r.map(p => p[0]), ys = r.map(p => p[1]), i0 = Math.max(0, Math.floor((Math.min(...xs) - m - u0) / G)), i1 = Math.min(nu - 1, Math.ceil((Math.max(...xs) + m - u0) / G)), j0 = Math.max(0, Math.floor((Math.min(...ys) - m - v0) / G)), j1 = Math.min(nv - 1, Math.ceil((Math.max(...ys) + m - v0) / G));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const p = [cu(i), cv(j)], k = j * nu + i, ins = S.inRing(p, r); if (inside ? ins && dPoly(p, r) >= m : ins || dPoly(p, r) < m) arr[k] = val; } };
  const drives = [];
  for (const e of els) {
    if (PASS(e)) continue; let r; try { r = S.shapeOf(e); } catch { continue; } if (!Array.isArray(r) || r.length < 3) continue; r = r.map(toL);
    if (GOAL(e)) { drives.push(r); continue; }
    mark(r, w / 2 + 4, blk, 1, false); /* (4 ft: the lane's edge 2 ft clear after its corners are squared up) */
    if ((e.kind === 'building' || e.kind === 'garage') && w > 4) for (const p of r) { const m = w / 2 + 5, i0 = Math.max(0, Math.floor((p[0] - m - u0) / G)), i1 = Math.min(nu - 1, Math.ceil((p[0] + m - u0) / G)), j0 = Math.max(0, Math.floor((p[1] - m - v0) / G)), j1 = Math.min(nv - 1, Math.ceil((p[1] + m - v0) / G)); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (Math.hypot(cu(i) - p[0], cv(j) - p[1]) < m) blk[j * nu + i] = 1; } // (and round a building's corners: a lane turning round one, its rounded corner cutting in)
  }
  for (const r of drives) mark(r, 1, goal, 1, true);
  for (let k = 0; k < N; k++) if (goal[k] && blk[k] === 1) goal[k] = 0; else if (goal[k]) blk[k] = 0; // (a drive cell next to parking or a building: not a way in)
  if (street) for (let k = 0; k < N; k++) if (goal[k] === 2) { const c = [cu(k % nu), cv(Math.floor(k / nu))]; if (els.some(e => GOAL(e) && (() => { try { return dPoly(c, S.shapeOf(e).map(toL)) < 60; } catch { return false; } })())) goal[k] = 0; } // (a driveway of its own at least 60 ft from another)
  return { nu, nv, N, u0, v0, blk, goal, w, toL, toP, cell: ([u, v]) => { const i = Math.floor((u - u0) / G), j = Math.floor((v - v0) / G); return i < 0 || j < 0 || i >= nu || j >= nv ? -1 : j * nu + i; }, at: k => [cu(k % nu), cv(Math.floor(k / nu))] };
}
// the grid with more in the way: paths (local frame) pw wide
export function withPaths(g, paths) {
  const blk = g.blk.slice(), goal = g.goal.slice();
  for (const { P, w: pw } of paths) {
    const m = pw / 2 + g.w / 2 + 2, xs = P.map(p => p[0]), ys = P.map(p => p[1]), i0 = Math.max(0, Math.floor((Math.min(...xs) - m - g.u0) / G)), i1 = Math.min(g.nu - 1, Math.ceil((Math.max(...xs) + m - g.u0) / G)), j0 = Math.max(0, Math.floor((Math.min(...ys) - m - g.v0) / G)), j1 = Math.min(g.nv - 1, Math.ceil((Math.max(...ys) + m - g.v0) / G));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * g.nu + i; if (dPath(g.at(k), P) < m) { blk[k] = 1; goal[k] = 0; } }
  }
  return { ...g, blk, goal };
}
// the cost from each cell, heading each way, to the nearest drive (turns cost TURN)
export function costTo(g, K = 0) {
  const { nu, nv, N, blk, goal } = g, D = new Float64Array(N * 4).fill(Infinity), H = [], push = (c, s) => { H.push([c, s]); let i = H.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (H[p][0] <= H[i][0]) break; [H[p], H[i]] = [H[i], H[p]]; i = p; } };
  const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === i) break; [H[m], H[i]] = [H[i], H[m]]; i = m; } } return top; };
  // (the last stretch into a drive straight for at least K ft, so a car turning off the drive has the lane's length to
  // straighten: the states K ft short of a drive on a clear straight run are where the costs start)
  const Kc = Math.max(1, Math.ceil((K ?? 0) / G)), seed = new Uint8Array(N * 4);
  for (let k = 0; k < N; k++) { if (blk[k] || goal[k]) continue; const i0 = k % nu, j0 = (k - i0) / nu;
    for (let d = 0; d < 4; d++) { let i = i0, j = j0, ok = false; for (let s = 1; s <= Kc; s++) { i += DIRS[d][0]; j += DIRS[d][1]; if (i < 0 || j < 0 || i >= nu || j >= nv) break; const q = j * nu + i; if (goal[q]) { ok = s === Kc; break; } if (blk[q]) break; }
      if (ok) { D[k * 4 + d] = Kc * G; seed[k * 4 + d] = 1; push(Kc * G, k * 4 + d); } } }
  while (H.length) {
    const [c, s] = pop(); if (c > D[s]) continue; const k = s >> 2, d2 = s & 3, i = k % nu, j = (k - i) / nu;
    for (let d = 0; d < 4; d++) { if (d === ((d2 + 2) & 3)) continue; const pi = i - DIRS[d][0], pj = j - DIRS[d][1]; if (pi < 0 || pj < 0 || pi >= nu || pj >= nv) continue; const pk = pj * nu + pi; if (blk[pk] || goal[pk]) continue;
      const nc = c + G + (d !== d2 ? TURN : 0), ps = pk * 4 + d; if (nc < D[ps]) { D[ps] = nc; push(nc, ps); } }
  }
  D.seed = seed; return D;
}
// a route from a point (local frame) heading d0 to the nearest drive: { P (local, from the point to 3 ft into the drive), len } or null
export function routeFrom(g, D, p, d0) {
  let k = g.cell(p); if (k < 0 || g.blk[k] || g.goal[k]) return null;
  let d = -1, best = Infinity; for (let x = 0; x < 4; x++) { if (x === ((d0 + 2) & 3)) continue; const c = D[k * 4 + x] + (x !== d0 ? TURN : 0); if (c < best) { best = c; d = x; } }
  if (!Number.isFinite(best)) return null;
  const pts = [p.slice()], ax = DIRS[d0][0] !== 0 ? 1 : 0; let steps = 0, first = true, straight = !!D.seed?.[k * 4 + d];
  for (;;) {
    const i = k % g.nu, j = (k - i) / g.nu, ni = i + DIRS[d][0], nj = j + DIRS[d][1]; k = nj * g.nu + ni;
    if (g.goal[k]) { const c = g.at(k); pts.push([c[0] + DIRS[d][0] * 3, c[1] + DIRS[d][1] * 3]); break; }
    if (straight || D.seed?.[k * 4 + d]) { straight = true; if (g.blk[k] || ++steps > 4000) return null; continue; } // (on the last straight stretch into the drive)
    let d2 = -1, b2 = Infinity; for (let x = 0; x < 4; x++) { if (x === ((d + 2) & 3)) continue; const c = D[k * 4 + x] + (x !== d ? TURN : 0); if (c < b2) { b2 = c; d2 = x; } }
    if (d2 < 0 || !Number.isFinite(b2) || ++steps > 4000) return null;
    if (d2 !== d) { const c = g.at(k); if (first && d === d0) c[ax] = p[ax]; pts.push(c); first = false; d = d2; } // (the first leg kept on the lane's own line)
    if (D.seed?.[k * 4 + d]) straight = true; // (turned onto the last straight stretch)
  }
  const square = () => { for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; if (Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1])) b[1] = a[1]; else b[0] = a[0]; } }; // (square legs: each corner on the line of the one before)
  square(); for (let i = pts.length - 2; i >= 1; i--) if (Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) < 6) pts.splice(i, 1); square(); // (no jog a few feet long)
  return { P: pts, len: plen(pts) };
}

// ---------- a lane along a face ----------
// faces in the building's frame: its normal, the way along it, its half length and its distance from the centre
const FACES = B => [{ n: [0, -1], s: [1, 0], hl: B.w / 2, fo: B.d / 2 }, { n: [1, 0], s: [0, 1], hl: B.d / 2, fo: B.w / 2 }, { n: [0, 1], s: [-1, 0], hl: B.w / 2, fo: B.d / 2 }, { n: [-1, 0], s: [0, -1], hl: B.d / 2, fo: B.w / 2 }];
const dirOf = v => DIRS.findIndex(d => Math.abs(d[0] - v[0]) < 1e-9 && Math.abs(d[1] - v[1]) < 1e-9);
// the lane's own part on face f (travel +ds along it): the curb row at off + w/2 from the face, n rows more outward
// (sp apart, each turn a U of radius sp / 2), as a path (local) from its open start (the farthest row) to the curb's end;
// the curb from a to b. L: the curb's length.
function facePath(F, spec, ds, n, lo, hi, X = 0, Y = 0) {
  const w = spec.w, t0 = F.fo + spec.off + w / 2, sp = spec.sp, R = sp / 2, a = ds > 0 ? lo : hi, b = ds > 0 ? hi : lo, a0 = a - ds * X, b1 = b - ds * Y; // (a0: where the rows begin, X before the curb; b1: where the rows past the curb's own turn, Y short of its end)
  const at = (s, t) => [F.s[0] * s + F.n[0] * t, F.s[1] * s + F.n[1] * t], P = [];
  for (let k = n; k >= 0; k--) { const go = k % 2 === 0 ? ds : -ds, bk = k ? b1 : b, st = go === ds ? a0 : bk, en = go === ds ? bk : a0, tk = t0 + k * sp;
    if (k === n) P.push(at(st, tk));
    if (k > 0) { P.push(at(en + go * R, tk), at(en + go * R, tk - sp)); } else P.push(at(en, tk)); }
  const sDir = [F.s[0] * ds, F.s[1] * ds], goN = n % 2 === 0 ? ds : -ds, inDir = [-F.s[0] * goN, -F.s[1] * goN]; // (the way out of each open end: on past the curb's end; back out of the farthest row's start)
  return { P, curbFrom: at(a, t0), curbTo: at(b, t0), outEnd: sDir, outStart: inDir, t0, far: t0 + n * sp + w / 2 };
}
// the samples of a path all on open ground (not blocked, not a drive) on grid g
const openOn = (g, P) => along(P, 2).every(p => { const k = g.cell(p); return k >= 0 && !g.blk[k] && !g.goal[k]; });

// A lane on building B: spec { w (ft), off (from the face: a walk), sp (rows apart), R (corners), need (ft of queue
// wanted to the window), maxRows, curb (the least curb length; 'face': the face's own length), ext (past the face's ends),
// window ('end' | 'mid': where the queue's count stops), faceCost(f, F) (a face's penalty in ft), avoid ([local paths]) }.
// Returns { P (plan points), len, queueLen (ft from the drive to the window), windowAt, curb ([a, b] plan), face, rows, g } or null.
export function laneOn(plan, els, B, spec, g0 = null) {
  if (!B || B.poly || !(B.w > 0 && B.d > 0)) return null;
  const g = g0 || groundOf(plan, els, B, spec.w, 420, !!spec.street); if (!g) return null;
  const base = spec.avoid?.length ? withPaths(g, spec.avoid) : g;
  let D0 = null; const cands = [];
  const gap = G + 2; // (a run-out starts a cell past the curb's end)
  FACES(B).forEach((F, f) => {
    // the open stretch of the curb's line along the face (its ends kept a run-out's start back from what bounds them)
    const want = Math.max(typeof spec.curb === 'function' ? spec.curb(F) : spec.curb === 'face' ? 2 * F.hl + 2 * (spec.ext || 0) : +spec.curb || 0, 2 * (spec.ext || 0)), lim = Math.max(F.hl + (spec.ext || 0), want / 2), t0 = F.fo + spec.off + spec.w / 2;
    const ok = s0 => { const k = base.cell([F.s[0] * s0 + F.n[0] * t0, F.s[1] * s0 + F.n[1] * t0]); return k >= 0 && !base.blk[k] && !base.goal[k]; };
    let run = null, cur = null; for (let s0 = -lim; s0 <= lim + 0.01; s0 += 2) { if (ok(s0)) { if (!cur) cur = [s0, s0]; else cur[1] = s0; if (!run || cur[1] - cur[0] > run[1] - run[0]) run = cur.slice(); } else cur = null; }
    if (!run) return;
    const lo0 = run[0] > -lim + 0.01 ? run[0] + gap : run[0], hi0 = run[1] < lim - 0.01 ? run[1] - gap : run[1];
    if (hi0 - lo0 < (spec.minCurb || 40)) return;
    for (const ds of [1, -1]) {
      let best = null, most = null;
      for (const X of spec.maxRows ? [0, 60, 120, 200, 300, 400] : [0]) for (const Y of spec.maxRows ? [0, 60, 120] : [0]) for (let n = Y ? 1 : 0; n <= (spec.maxRows || 0); n++) {
        // the curb within the open stretch: its upstream end (a) far enough in for the lead-in X and the rows' U-turn on
        // the curb's line; no longer than wanted, as central as the stretch allows
        const ea = X + (n ? spec.sp / 2 + 2 : 0); let a = ds > 0 ? Math.max(lo0, run[0] + ea + (run[0] > -lim + 0.01 ? gap : 0)) : Math.min(hi0, run[1] - ea - (run[1] < lim - 0.01 ? gap : 0)), b = ds > 0 ? hi0 : lo0;
        if ((b - a) * ds < (spec.minCurb || 40)) continue;
        if ((b - a) * ds > want) { const m = ds > 0 ? Math.max(a + want / 2, Math.min(b - want / 2, 0)) : Math.min(a - want / 2, Math.max(b + want / 2, 0)); a = m - ds * want / 2; b = m + ds * want / 2; }
        const lo = Math.min(a, b), hi = Math.max(a, b), L = hi - lo;
        if (Y >= L + X - 40) continue; const len = (n + 1) * (L + X) - n * Y + n * Math.PI * spec.sp / 2; if (best && len >= best.len) continue; if (most && len <= most.len && spec.need > len) continue;
        const fp = facePath(F, spec, ds, n, lo, hi, X, Y); if (!openOn(base, fp.P)) continue;
        const c = { f, F, ds, n, L, X, Y, fp, len, pen: (spec.faceCost ? spec.faceCost(f, F) : 0) + n * 5 };
        if (len >= spec.need) { if (!best || len < best.len) best = c; } else if (!most || len > most.len) most = c;
      }
      if (best) cands.push(best); if (most && !best) cands.push(most); else if (most && best && most.n < best.n) cands.push(most);
    }
  });
  if (!cands.length) return null;
  D0 = costTo(base, spec.K ?? spec.R + spec.w / 2);
  const tries = [];
  for (const c of cands) {
    const w = spec.w, gap = G, s0 = c.fp.P[0], e0 = c.fp.P[c.fp.P.length - 1], ds = dirOf(c.fp.outStart), de = dirOf(c.fp.outEnd);
    const ps = [s0[0] + c.fp.outStart[0] * gap, s0[1] + c.fp.outStart[1] * gap], pe = [e0[0] + c.fp.outEnd[0] * gap, e0[1] + c.fp.outEnd[1] * gap], K = spec.K ?? spec.R + spec.w / 2, cut = w + 6;
    let gi = base, D = D0, rin = routeFrom(gi, D, ps, ds), rout = routeFrom(gi, D, pe, de);
    // (clear of each other away from where they join: the lane's own part with its ends cut back, each run-out with its start cut back)
    const own = trim(c.fp.P, cut, cut), clash = (r, others) => !r || others.some(o => o.P.length > 1 && trim(r.P, cut, 0).length > 1 && pathGap(trim(r.P, cut, 0), o.P) < (o.w + w) / 2 + 1);
    if (!rin || !rout || clash(rin, [{ P: own, w }]) || clash(rout, [{ P: own, w }, { P: trim(rin.P, cut, 0), w }])) { // (the base routes run over the lane itself or each other: routed again round them)
      gi = own.length > 1 ? withPaths(base, [{ P: own, w }]) : base; D = costTo(gi, K); rin = routeFrom(gi, D, ps, ds); if (!rin) continue;
      const rt = trim(rin.P, cut, 0), gi2 = rt.length > 1 ? withPaths(gi, [{ P: rt, w }]) : gi; rout = routeFrom(gi2, costTo(gi2, K), pe, de); if (!rout) continue;
      if (clash(rin, [{ P: own, w }]) || clash(rout, [{ P: own, w }, { P: rt, w }])) continue;
    }
    if (rin.len + rout.len > (spec.maxRun ?? 700)) continue; // (a lane wandering round the site to find a drive: not a design anyone would draw)
    const inner = c.fp.P, full = [...rin.P.slice().reverse(), ...inner, ...rout.P], curbAt = rin.len + gap + plen(inner); /* (the queue from the drive to the curb's end) */
    const toWin = spec.window === 'mid' ? curbAt - c.L / 2 : curbAt, short = Math.max(0, spec.need - toWin);
    tries.push({ ...c, full, rin, rout, windowAt: toWin, score: rin.len + rout.len + c.pen + short * 20 });
  }
  tries.sort((a, b) => a.score - b.score);
  return tries.length ? { tries, g, toP: g.toP } : null;
}
// a try's path in plan coordinates, tidied (points closer than 1 ft dropped, straight-on points dropped)
export function planPath(t, toP) {
  const out = [];
  for (const p of t.full.map(toP)) { const q = out[out.length - 1]; if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) < 1) continue; out.push(p); }
  for (let i = out.length - 2; i > 0; i--) { const a = out[i - 1], b = out[i], c = out[i + 1], cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); if (Math.abs(cr) < 1e-6 * Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]) + 1e-9) out.splice(i, 1); }
  return out;
}
// the corners of a rectangle on face f of B (local s from s0 to s1, t from t0 to t1 off the face) in plan coordinates
export function faceRect(B, f, s0, s1, t0, t1) {
  const F = FACES(B)[f], at = (s, t) => [F.s[0] * s + F.n[0] * (F.fo + t), F.s[1] * s + F.n[1] * (F.fo + t)], th = B.rot || 0, toP = ([u, v]) => { const q = rot([u, v], th); return [+(B.x + q[0]).toFixed(2), +(B.y + q[1]).toFixed(2)]; };
  return [at(s0, t0), at(s1, t0), at(s1, t1), at(s0, t1)].map(toP);
}
export const faceOf = (B, f) => FACES(B)[f];

// ---------- a yard beside a building ----------
// a w x d yard (play yard) against one face of B, gap ft off it, on open ground; slid along the face to the first spot
// that is clear. { ring (plan), f } or null. faceCost as for lanes.
export function yardBeside(plan, els, B, w, d, gap = 0, faceCost = null) {
  const g = groundOf(plan, els, B, 2, Math.max(w, d) + 60); if (!g) return null;
  const out = [];
  FACES(B).forEach((F, f) => {
    for (const [ww, dd] of [[w, d], [d, w]]) for (let s = 0; Math.abs(s) <= F.hl + ww / 2; s = s > 0 ? -s : -s + 8) {
      const t0 = F.fo + gap, at = (u, t) => [F.s[0] * u + F.n[0] * t, F.s[1] * u + F.n[1] * t], R = [at(s - ww / 2, t0), at(s + ww / 2, t0), at(s + ww / 2, t0 + dd), at(s - ww / 2, t0 + dd)];
      const xs = R.map(p => p[0]), ys = R.map(p => p[1]); let ok = true;
      for (let u = Math.min(...xs) + 3; u <= Math.max(...xs) - 3 && ok; u += 3) for (let v = Math.min(...ys) + 3; v <= Math.max(...ys) - 3; v += 3) { const k = g.cell([u, v]); if (k < 0 || g.blk[k] || g.goal[k]) { ok = false; break; } }
      if (ok) { const c = g.toP([(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]); out.push({ ring: R.map(g.toP), f, x: c[0], y: c[1], w: +(Math.max(...xs) - Math.min(...xs)).toFixed(2), d: +(Math.max(...ys) - Math.min(...ys)).toFixed(2), rot: B.rot || 0, cost: Math.abs(s) + (faceCost ? faceCost(f, F) : 0) }); break; }
    }
  });
  out.sort((a, b) => a.cost - b.cost);
  return out[0] || null;
}
