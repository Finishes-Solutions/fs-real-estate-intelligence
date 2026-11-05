// Homes round a central feature: a loop street ringing the middle of the site, lots on both sides of it (an outer row
// backing onto the lot lines, an inner row backing onto the middle) and the feature in the middle: a lake that holds the
// detention, or a park with the community's amenity centre (a pool and its clubhouse) and the pond beside it. Two ways
// in from the street meet the loop at its front corners (down the loop's sides, as far apart as the frontage allows).
// "Homes around a central lake", "houses ringing a park", "a neighbourhood round a pool and clubhouse".
// Frame feet (lib/sitelayout.mjs frameOf: the street along the bottom at Y0, x along it, y in from it); the caller turns
// the pieces into plan feet, names them, checks them and sizes the pond to the drawn plan's own detention.
// Concept planning only: lot lines, the loop's corners and the lake's banks are drawn square; not engineered.

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
