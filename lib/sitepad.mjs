// Small commercial pads (lib/siteparking.mjs hands these over on a lot of up to about three acres): one building, a bar,
// an L or a U, at the back, its parking in front and a drive round it, the way a civil engineer fits a shop, a bank or a
// coffee drive-thru onto an acre where a parking field with fire lanes up both sides doesn't fit.
//
// In the frame across the lot (street at the bottom, y in from it), mirrored so "left" is the side the drive round the
// building comes down (u: x on that side's hand):
//  - R: the way in. A two-way drive straight in from the street on the right, no stall beside it for the stacking
//    distance, then on up past the building with a row of stalls along it (its outer side, and its inner side when the
//    building leaves room).
//  - FA: the front aisle, across the lot at the top of the stacking distance from R to the far side: a row of stalls
//    below it (clear of the driveway's mouth) and a row above it facing the building's storefront walk.
//  - the building behind the walk: a bar as wide as the room between the drives, or an L (a wing hanging down toward
//    the aisle on one side) or a U (a wing each side), its depth whatever the floor area asked for takes.
//  - the drive round the back: from R's top along the back of the building (following the rear lot line where it
//    slants) and down the far side into FA's end, so every aisle meets a drive at both ends. With a drive-thru it's a
//    pair of one-way lanes going round counter-clockwise (the building on the driver's left): the drive-thru lane
//    against the building, with the window on its wall, the order point two cars before it and eight or more cars of
//    stacking behind that, and a bypass lane outside it (the escape and the way round for deliveries). Without one it's a
//    two-way fire lane.
// Detention: a pond where one fits beside it (the caller's pond spot), else underground (the caller says so).
import * as S from './siteplan.mjs';

const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const rectL = (x0, y0, x1, y1) => ({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, d: y1 - y0 });
const covers2 = (iv, a, b) => iv.some(([p, q]) => p <= a + 0.01 && q >= b - 0.01);
export const LANE = 12, CAR = 20, ORDER_GAP = 40, STACK = 8; // ft: a drive-thru lane, a car in the queue, the order point to the window, cars wanted behind the order point

// a drive-thru lane's window, order point and stacking: the window as far along the lane as a building wall runs beside
// it on the driver's left (2 to 8 ft past the lane's edge), the order point ORDER_GAP before it, and the cars that queue
// behind the order point back to where the lane leaves the drive (CAR ft each). path: the lane's centre line in the
// direction cars drive it; walls: building outlines. { len, windowAt, orderAt, stack } (feet along the path), or null
// when no wall runs beside it.
export function dtInfo(path, walls) {
  const pts = []; let d = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) continue;
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-u[1], u[0]]; // (the driver's left)
    for (let s = 0; s < L; s += 2) pts.push({ p: [a[0] + u[0] * s, a[1] + u[1] * s], n, d: d + s });
    d += L;
  }
  const side = q => walls.some(W => [LANE / 2 + 2, LANE / 2 + 4, LANE / 2 + 6, LANE / 2 + 8].some(o => S.inRing([q.p[0] + q.n[0] * o, q.p[1] + q.n[1] * o], W))); // (a wall 2 to 8 ft off the lane: the window reaches)
  let w = -1; for (let i = pts.length - 1; i >= 4; i--) if (side(pts[i]) && side(pts[i - 4])) { w = i; break; }
  if (w < 0) return null;
  const windowAt = pts[w].d - 4, orderAt = Math.max(0, windowAt - ORDER_GAP);
  return { len: Math.round(d), windowAt: Math.round(windowAt), orderAt: Math.round(orderAt), stack: Math.floor(orderAt / CAR + 1e-6) };
}

// the variants worth trying in a frame: which side the drive round the building comes down, the building's shape and
// where its wings go, rows along the way in. Each is laid out by buildPad.
export function padCands(C, prog, X, pond, pondSide) {
  const form = prog.use === 'restaurant' ? 'bar' : prog.form || C.P.PAR.form || 'bar', dt = (prog.extras || []).includes('drivethru'), out = [];
  const vs = form === 'L' ? [25, 35, 45].flatMap(k => [{ wing: 'pair', k, rIn: false }, { wing: 'pair', k, rIn: true }, { wing: 'R', k, rIn: false }, { wing: 'R', k, rIn: true }, ...(k < 45 ? [{ wing: 'top', k: k + 5, turn: true, inner: true }, { wing: 'top', k: k + 5, turn: true, inner: false }] : [])])
    : form === 'U' ? [{ wing: 'both', k: 30, rIn: false }, { wing: 'both', k: 30, rIn: true }] : [{ wing: null, k: 0, rIn: false }, { wing: null, k: 0, rIn: true }, { wing: null, k: 0, turn: true, inner: true }, { wing: null, k: 0, turn: true, inner: false }];
  // the likeliest first (lib/siteparking.mjs search lays out a set number): a row along the way in, then the building
  // turned, the wing on the drive round's side before the way in's; a middling wing; each the other way round next
  const rank = v => (v.turn ? (v.inner ? 0.1 : 0.2) : (v.rIn ? 0 : 0.6) + (v.wing === 'R' ? 0.2 : 0)) + ({ 35: 0, 40: 0, 25: 0.03, 30: 0.03, 45: 0.05 }[v.k] ?? 0);
  for (const lane of dt ? [true, false] : [false]) for (const sg of [1, -1]) for (const flat of sg < 0 && lane ? [false, true] : [false]) for (const v of vs) { // (lane: with the drive-thru; a drive-thru asked for and nowhere for it to stack: the pad without one, and it says so)
    if (!lane && dt && v.turn) continue;
    const { wing, k } = v, turn = !!v.turn, rIn = turn || !!v.rIn, inner = turn ? !!v.inner : true, wingLeft = wing === 'pair' ? sg > 0 : wing === 'R' ? sg < 0 : null; // (wingLeft: in the frame, the wing on the left)
    out.push({ pad: { sg, flat, form: wing ? form : 'bar', wing, k, rIn, turn, inner, dt: lane, foot: X.foot, floors: X.floors, use: prog.use, ratio: prog.ratio }, pat: 'pad', seq: [], D: 0, svcNA: true, nocol: false, col: null, outer: null, half: false, at: 'center', drivethru: lane, gr: C.P.gr, gs: C.P.gs, Hs: 0, K: 1,
      key: 'across|pad|' + C.F.align + '|' + (pondSide || '') + '|' + sg + '|' + (wing || 'bar') + (turn ? '|t' : '') + (flat ? '|f' : '') + (dt && !lane ? '|nodt' : ''), pre: 60 - rank(v) - (sg < 0 ? 0.25 : 0) - (flat ? 0.6 : 0) - (dt && !lane ? 1.5 : 0), wingLeft }); // (after the stacks: where a field fits, it takes the search's time first)
  }
  return out;
}

// one pad laid out (frame feet), the best of its rows along the way in or not and (a drive-thru) as wide or as deep as
// its room, or null when it doesn't fit. cand.pad: { sg (1: the drive round comes down the left; -1: the right, the
// lanes then running the other way round so they stay counter-clockwise), flat (the drive round square to the
// building, not following the rear lot line), form ('bar' | 'L' | 'U'), wing ('pair': on the side the drive round
// comes down; 'R': the way in's side; 'both'; 'top': across the top of a turned building), k (a wing's width), rIn (a
// row between the way in and the building), turn (the building's long side up the way in, its storefront facing the
// row along it), inner (a row along the front aisle facing the building), dt, foot: the footprint asked for (null: as
// big as its rows park), floors, use, ratio }. K: { entryFits } from lib/siteparking.mjs.
export function buildPad(C, cand, K) {
  let best = null;
  for (const rOut of [true, false]) for (const deep of cand.pad.dt ? [false, true] : [false]) { const c = { ...cand, pad: { ...cand.pad, rOut, deep } }, r = buildPad1(C, c, K); if (r && (!best || r.score > best.score)) { best = r; cand.Hs = c.Hs; } }
  return best;
}
function buildPad1(C, cand, K) {
  const { F, P, H } = C, sp = cand.pad, X = { foot: sp.foot, floors: sp.floors }, sg = sp.sg, aw = P.aw, sd = P.sd, sw = P.sw, walk = Math.min(P.walk, 10), ew = P.ew; // (a pad's storefront walk: 10 ft)
  const PW = sp.dt ? 2 * LANE : aw, gB = 3, gD = 5; // (the drive round's width; gaps: a lane to a wall, a building's end to a drive; a wing hangs down to 5 ft off the aisle)
  const ob = C.keep.concat(cand.pond ? [{ p: cand.pond.poly || box(...cand.pond.rect), g: 12 }] : []);
  const fx = u => sg * u, toF = ([u, y]) => [sg * u, y];
  const ivL = (y0, y1, key = 'pave', o = ob) => H.spans(F, y0, y1, key, o).map(([a, b]) => sg > 0 ? [a, b] : [-b, -a]).sort((p, q) => p[0] - q[0]);
  const fits = (u0, y0, u1, y1, key = 'pave', o = ob) => covers2(ivL(y0, y1, key, o), Math.min(u0, u1), Math.max(u0, u1));
  const ptIn = (u, y) => fits(u - 0.5, y - 0.5, u + 0.5, y + 0.5);
  const tc = C.padTops || (C.padTops = new Map()), tk = sg + '|' + (cand.pond ? cand.pond.rect.join() : ''), topCache = tc.get(tk) || new Map(); tc.set(tk, topCache); // (the frame's own: every pad laid out in it shares them)
  const topAt = u => { const k = Math.round(u * 2); if (topCache.has(k)) return topCache.get(k); let y = F.Y1; while (y > F.Y0 && !ptIn(u, y)) y -= 1; topCache.set(k, y); return y; };
  const midY = (F.Y0 + F.Y1) / 2, mid = ivL(midY - 1, midY + 1).sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0]; if (!mid) return null;
  let best = null; const better = r => !best || r.score > best.score;
  for (const shift of [0, 3, 6, 10, 15, 22, 32, 45]) { // (the way in moved in from the side: a curb return, a slanting side lot line)
    const uRight = mid[1] - shift, uR = uRight - aw - (sp.rOut ? sd : 0); if (uR - mid[0] < PW + 60) break;
    // the way in: its curb returns as wide as the frontage there takes; the front aisle the stacking distance in
    let entry = null, yA = null, thr = 0;
    for (const Rc of [P.Rc, 15, 8]) {
      const xE = fx(uR + aw / 2), yl = C.street.at(xE - ew / 2 - Rc, false), yr = C.street.at(xE + ew / 2 + Rc, false); if (yl == null || yr == null) continue;
      const yc0 = C.street.at(xE, false) ?? Math.max(yl, yr), y0 = Math.max(yc0 + C.T, Math.max(yl, yr) + Rc + 6), e = { kind: 'drive', poly: H.entryPoly(xE, yl, yr, y0 + aw, ew, Rc), name: 'Main entry', note: ew + ' ft driveway', entry: true, at: xE };
      if (K.entryFits(F, e.poly, ob)) { entry = e; yA = y0; thr = C.T; entry.ys = [yl, yr, Rc]; break; }
    }
    if (!entry) continue;
    // the drive round the back: its outer edge on a line along the rear lot line (a slant of up to about 30°), the far side
    // as far out as the lot lets it
    // the stacking distance as lib/siteparking.mjs throatOf measures it: square to the street, from where the driveway's
    // inner end squares onto it (a street slanting across the frame: further than straight up)
    const xE = entry.at, s0 = C.street.at(xE - 10, false), s1 = C.street.at(xE + 10, false), sL = Math.hypot(20, (s1 ?? 0) - (s0 ?? 0)), su = [20 / sL, ((s1 ?? 0) - (s0 ?? 0)) / sL], sn = [-su[1], su[0]];
    const sc0 = [xE, C.street.at(xE, false) ?? 0], mouth = y => { const al = (y + aw - sc0[1]) * su[1]; return [sc0[0] + su[0] * al, sc0[1] + su[1] * al]; }, throat = y => (y - mouth(y)[1]) / Math.max(0.3, sn[1]);
    const yA0 = yA, e0 = entry; for (const raise of [0, 6, 14, 26, 40]) { // (the front aisle higher, where a slanting street leaves it no room lower down)
    yA = yA0 + raise; let need = 0; while (throat(yA + need) < C.T - 0.5 && need < 30) need += 1; yA += need; thr = Math.round(throat(yA));
    entry = { ...e0, poly: H.entryPoly(e0.at, e0.ys[0], e0.ys[1], yA + aw, ew, e0.ys[2]) }; delete entry.ys; if ((raise || need) && !K.entryFits(F, entry.poly, ob)) continue;
    let p0 = mid[0], line = null;
    for (let it = 0; it < 3; it++) {
      const ua = p0 + 1, ub = uR + aw - 1, us = []; for (let u = ua; u <= ub + 0.01; u += Math.max(4, (ub - ua) / 24)) us.push(Math.min(u, ub)); // (a hair inside: the paving line itself is out)
      let m = (topAt(ub) - topAt(ua)) / Math.max(1, ub - ua); m = sp.flat ? 0 : Math.max(-0.58, Math.min(0.58, m)); // (flat: square to the building, so the drive-thru lane runs along its back wall all the way)
      const a = Math.min(...us.map(u => topAt(u) - m * u)); line = { m, a, h: Math.hypot(1, m) };
      const colOK = u => fits(u, yA, u + PW, line.a + m * (u + PW) - PW * line.h); let u = p0; while (u < p0 + 40 && !colOK(u)) u += 1; if (!colOK(u)) { line = null; break; }
      const moved = Math.abs(u - p0) >= 0.5; p0 = u; if (!moved) break;
    }
    if (!line) continue;
    const top = u => line.a + line.m * u, bot = u => top(u) - PW * line.h; // (the drive round's outer and inner edges at u)
    const Rtop = Math.min(top(uR), top(uR + aw));
    if (!fits(p0, yA, uR + aw, yA + aw)) continue; if (!fits(uR, yA, uR + aw, Rtop)) continue; if (!fits(p0, yA, p0 + PW, bot(p0 + PW))) continue;
    if (sp.rOut && !fits(uR + aw, yA + aw, uR + aw + sd, yA + aw + 6 * sw + 6)) continue;
    // the building: behind the inner row and its walk, between the drives (turned: its long side up the way in, the rows
    // along it facing its storefront, an L's wing across its top end)
    let bld, t, w, k = 0, nW = 0, wl = false, wr = false, topB = null, bu0 = p0 + PW + gB, bu1;
    if (sp.turn) {
      bu1 = uR - sd - walk; t = bu1 - bu0; if (t < 40) continue;
      const yB0 = yA + aw + (sp.inner ? sd : 0) + walk, lim = Math.min(bot(bu0), bot(uR)) - gB, kw = sp.wing === 'top' ? Math.min(sp.k, 50) : 0, ext = kw ? uR - gD - bu1 : 0;
      let Lb = lim - yB0; if (X.foot != null) Lb = (X.foot - kw * ext) / t; else Lb = Math.min(Lb, 220);
      if (Lb < Math.max(40, kw + 30) || yB0 + Lb > lim + 0.01) continue;
      topB = lim; const yBot = topB - Lb; k = kw; w = t; // (against the drive round the back: the rows up the way in run as far as they can below its wing)
      if (!fits(bu0, yBot, bu1, topB, 'build') || kw && !fits(bu1 - 1, topB - kw, uR - gD, topB, 'build')) continue;
      const fxs = [fx(bu0), fx(kw ? uR - gD : bu1)], bx0 = Math.min(...fxs), bx1 = Math.max(...fxs);
      bld = kw ? { kind: 'building', ...rectL(bx0, yBot, bx1, topB), use: sp.use, floors: X.floors || 1, form: 'L', bar: +t.toFixed(2), wing2: kw, rotL: sg > 0 ? 90 : -90, ...(sg > 0 ? { flip: true } : {}) } : { kind: 'building', ...rectL(bx0, yBot, bx1, topB), use: sp.use, floors: X.floors || 1 };
      if (kw) { const c = bld.x, d = bld.y, W0 = bld.w, D0 = bld.d; Object.assign(bld, { x: c, y: d, w: D0, d: W0 }); } // (turned a quarter: its own width runs up the frame)
      if (sp.dt) bld.note = S.USES[sp.use]?.label + ' · drive-thru';
    } else {
    const yB0 = yA + aw + sd + walk, wy0 = yA + aw + gD; bu1 = uR - gD - (sp.rIn ? sd : 0);
    nW = sp.wing === 'both' ? 2 : sp.wing ? 1 : 0; k = nW ? Math.min(sp.k, (bu1 - bu0) * (nW > 1 ? 0.4 : 0.45) - 1) : 0; const drop = yB0 - wy0;
    const tLim = Math.min(bot(bu0), bot(bu1)) - gB - yB0; if (bu1 - bu0 < Math.max(40, nW * k + 30) || tLim < 30) continue;
    w = bu1 - bu0;
    if (X.foot != null) { // the floor area asked for: as deep as it takes, narrower when that's under 30 ft deep
      const A = X.foot, wingA = nW * k * drop; t = (A - wingA) / w; if (t < 30) { t = 30; w = Math.max(nW * k + 30, (A - wingA) / t); } if (sp.deep && t < tLim) { t = Math.min(tLim, 90); w = Math.max(nW * k + 30, 40, (A - wingA) / t); t = (A - wingA) / w; } // (deep: the building as deep as the room behind it, so the drive-thru lane runs along its back wall and side further, to a window later on)
      if (t > tLim + 0.01 || (A - wingA) / t > w + 0.5) continue;
    } else t = Math.min(tLim, 120);
    // wings on the side: the pair side is the left (u small)
    wl = sp.wing === 'pair' || sp.wing === 'both'; wr = sp.wing === 'R' || sp.wing === 'both'; bu1 = bu0 + w; // (narrower than the room: the slack on the way in's side)
    const bar = [bu0, yB0, bu1, yB0 + t];
    if (!fits(bar[0], bar[1], bar[2], bar[3], 'build')) { let ok = false; for (let tt = t - 2; tt >= 30 && X.foot == null; tt -= 2) if (fits(bar[0], bar[1], bar[2], yB0 + tt, 'build')) { t = tt; bar[3] = yB0 + tt; ok = true; break; } if (!ok) continue; }
    if (wl && !fits(bu0, wy0, bu0 + k, yB0 + 1, 'build')) continue; if (wr && !fits(bu1 - k, wy0, bu1, yB0 + 1, 'build')) continue;
    // the building in the frame: an L (its wing on the frame's left unless flipped), a U, a bar
    const fxs = [fx(bu0), fx(bu1)], bx0 = Math.min(...fxs), bx1 = Math.max(...fxs), by0 = nW ? wy0 : yB0, by1 = yB0 + t, wingFrameLeft = wl && !wr ? sg > 0 : wr && !wl ? sg < 0 : null;
    bld = { kind: 'building', ...rectL(bx0, by0, bx1, by1), use: sp.use, floors: X.floors || 1, ...(nW ? { form: sp.form, bar: +t.toFixed(2), wing2: k, ...(sp.form === 'L' && !wingFrameLeft ? { flip: true } : {}) } : {}), ...(sp.dt ? { note: S.USES[sp.use]?.label + ' · drive-thru' } : {}) };
    }
    let wall = S.outline({ ...bld, rot: bld.rotL || 0 });
    // the drive round: lane centre lines (local), then in the frame in the direction cars drive (counter-clockwise)
    const yc = (u, off) => top(u) - off * line.h, yEnd = yA + aw / 2;
    const lanePath = (off, u1 = uR + aw - 2, y1 = yEnd) => { const uc = p0 + off; return [[u1, yc(u1, off)], [uc, yc(uc, off)], [uc, y1]]; }; // (off: from the far side's outer edge; the lanes start across the way in's top and end in the aisle's middle)
    const dirF = pts => { const q = pts.map(toF); return sg > 0 ? q : q.reverse(); };
    const drives = [], lanes = [];
    const FA = { kind: 'drive', ...rectL(Math.min(fx(p0), fx(uR + aw)), yA, Math.max(fx(p0), fx(uR + aw)), yA + aw), name: '', note: aw + ' ft drive aisle' };
    const Rd = { kind: 'drive', ...rectL(Math.min(fx(uR), fx(uR + aw)), yA, Math.max(fx(uR), fx(uR + aw)), Rtop), name: '', note: aw + ' ft drive' + (sp.rOut || sp.rIn ? ' aisle' : '') };
    drives.push(FA, Rd);
    let dt = null;
    if (sp.dt) {
      const pDT = dirF(lanePath(PW - LANE / 2)), pBP = dirF(lanePath(LANE / 2)), lead = sg > 0 ? (aw - 2) * line.h : aw / 2; // (the stretch in the way in or the aisle isn't the queue: cars there would block it)
      dt = dtInfo(dirF(lanePath(PW - LANE / 2, uR, yA + aw)), [wall]); if (dt) dt = { ...dt, len: Math.round(dt.len + lead), windowAt: Math.round(dt.windowAt + lead), orderAt: Math.round(dt.orderAt + lead), queueFrom: Math.round(lead) }; if (!dt || dt.stack < STACK) continue; // (a drive-thru that can't stack eight cars behind its order point isn't one)
      lanes.push({ kind: 'drive', path: pDT, width: LANE, r: 14, name: 'Drive-thru', note: 'Drive-thru lane', stack: dt.stack, orderAt: dt.orderAt, windowAt: dt.windowAt, queueFrom: dt.queueFrom });
      drives.push({ kind: 'drive', path: pBP, width: LANE, r: 24, name: '', note: 'Bypass lane · one way' });
    } else drives.push({ kind: 'drive', path: dirF(lanePath(aw / 2)), width: aw, r: 30, name: '', note: aw + ' ft drive · fire lane' });
    // stall rows: below the aisle (clear of the driveway's mouth), above it facing the storefront, along the way in
    const hard = ob.concat(lanes.concat(drives.filter(e => e.path)).map(e => ({ p: S.outline(e), g: 1 })), [{ p: wall, g: 4 }]);
    const rows = [], keys = C.stallKeys();
    const put = (p, q, y0, y1, side, turned) => {
      const n = Math.floor((q - p + 0.01) / sw), caps = n >= 8 ? P.caps : false, cnt = n - Math.floor(n / 13) - (caps ? 2 : 0); if (cnt < 6) return;
      const wd = n * sw, a = (p + q - wd) / 2;
      rows.push(turned ? { kind: 'parking', x: (y0 + y1) / 2, y: a + wd / 2, w: wd, d: sd, rotL: 90, row: side, lock: true, islands: true, caps, ...keys } : { kind: 'parking', ...rectL(a, y0, a + wd, y1), row: side, lock: true, islands: true, caps, ...keys });
    };
    const rowX = (u0, u1, y0, y1, side) => { if (u1 - u0 < 6 * sw) return; const x0 = Math.min(fx(u0), fx(u1)), x1 = Math.max(fx(u0), fx(u1)); for (const [p, q] of H.spans(F, y0, y1, 'pave', hard).map(([p, q]) => [Math.max(p, x0), Math.min(q, x1)]).filter(([p, q]) => q - p >= 6 * sw)) put(p, q, y0, y1, side, false); };
    const rowY = (u0, u1, y0, y1, side) => { if (y1 - y0 < 6 * sw) return; const x0 = Math.min(fx(u0), fx(u1)), x1 = Math.max(fx(u0), fx(u1)); for (const [p, q] of H.spans(F, x0, x1, 'pave', hard, true).map(([p, q]) => [Math.max(p, y0), Math.min(q, y1)]).filter(([p, q]) => q - p >= 6 * sw)) put(p, q, x0, x1, side, true); };
    { // (no stall beside the driveway's stacking distance: 34 ft clear of it either side, square to the street, as lib/siteparking.mjs throatOf measures it)
      const c = mouth(yA), hw = ew / 2 + 34.5, len = throat(yA) + 2, zone = [[-hw, -2], [hw, -2], [hw, len], [-hw, len]].map(([a, t]) => [c[0] + su[0] * a + sn[0] * t, c[1] + su[1] * a + sn[1] * t]);
      const hz = hard.concat([{ p: zone, g: 0.5 }]); const rx = (u0, u1, y0, y1, side) => { const x0 = Math.min(fx(u0), fx(u1)), x1 = Math.max(fx(u0), fx(u1)); for (const [p, q] of H.spans(F, y0, y1, 'pave', hz).map(([p, q]) => [Math.max(p, x0), Math.min(q, x1)]).filter(([p, q]) => q - p >= 6 * sw)) put(p, q, y0, y1, side, false); };
      rx(p0, uR + aw, yA - sd, yA, 1); }
    if (sp.inner) rowX(wl ? bu0 + k + walk : p0 + PW + 1, wr ? bu1 - k - walk : uR - 1, yA + aw, yA + aw + sd, -1);
    if (sp.rOut) rowY(uR + aw, uR + aw + sd, yA + aw + 3, Rtop - 3, sg);
    if (sp.rIn) { const ya = yA + aw + (sp.inner ? sd + 1 : 3), yb = sp.turn && k ? topB - k - walk : Math.min(bot(uR - sd), bot(uR)) - 3; rowY(uR - sd, uR, ya, yb, -sg); }
    if ((sp.rOut || sp.rIn) && !rows.some(e => e.rotL)) Rd.note = aw + ' ft drive';
    const pondEl = cand.pond ? (() => { const [x0, y0, x1, y1] = cand.pond.rect; if (cand.pond.poly) return { kind: 'pond', poly: cand.pond.poly, labelAt: S.centroid(cand.pond.poly), name: C.pondName, note: C.pondNote }; return { kind: 'pond', ...rectL(x0, y0, x1, y1), ...(P.PAR.style?.ponds === 'rounded' ? { shape: 'round' } : {}), name: C.pondName, note: C.pondNote }; })() : null;
    const stalls = rows.reduce((s, e) => s + S.stalls({ ...e, rot: 0 }).count, 0), park = Math.max(0, stalls - (sp.lose || 0)); // (lose: the stalls a second way in will take)
    if (X.foot == null && !sp.turn) { // as much as fits: no more building than its rows park (shallower from the back; the drive-thru's window checked again)
      const most = (park - S.adaLoss(park)) * 1000 / (sp.ratio || 4) / (X.floors || 1), wingA = S.gfaOf({ ...bld, floors: 1 }) - (bld.bar ?? bld.d) * bld.w;
      if (S.gfaOf({ ...bld, floors: 1 }) > most) { const t2 = (most - wingA) / bld.w; if (t2 < 30) continue;
        const d2 = bld.d - ((bld.bar ?? bld.d) - t2); Object.assign(bld, { y: bld.y - (bld.d - d2) / 2, d: d2 }, bld.bar != null ? { bar: +t2.toFixed(2) } : {}); wall = S.outline({ ...bld, rot: bld.rotL || 0 });
        if (sp.dt) { const lead = lanes[0].queueFrom || 0, d = dtInfo(dirF(lanePath(PW - LANE / 2, uR, yA + aw)), [wall]); if (!d || Math.floor((d.orderAt + 0) / CAR + 1e-6) < STACK) continue; Object.assign(lanes[0], { stack: d.stack, orderAt: Math.round(d.orderAt + lead), windowAt: Math.round(d.windowAt + lead) }); dt = { ...d, len: Math.round(d.len + lead), windowAt: Math.round(d.windowAt + lead), orderAt: Math.round(d.orderAt + lead), queueFrom: lead }; } } }
    const els = [entry, ...drives, ...lanes, bld, ...rows, ...(pondEl ? [pondEl] : [])];
    const xs = [fx(p0), fx(uR + aw + (sp.rOut ? sd : 0))], xL = Math.min(...xs), xR = Math.max(...xs), yHi = Math.max(top(p0), top(uR + aw));
    const res = { Hs: yHi - (yA - sd), score: Math.min(S.gfaOf(bld), (park - S.adaLoss(park)) * 1000 / (sp.ratio || 4)) + park, els, B: [bld], ghosts: [], rows, drives, aisles: [{ e: FA, y: yA + aw / 2 }], service: [], fields: [], rowsB: [], pads: [], xL, xR, yLo: yA - sd, yHi, thr, stalls, entry, ents: [entry], W: xR - xL, spines: [], dt };
    if (better(res)) best = res;
    }
  }
  if (best) cand.Hs = best.Hs;
  return best;
}
