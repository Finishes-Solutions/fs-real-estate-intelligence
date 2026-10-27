// The layout generator: enumerated, deterministic site layouts composed directly from a vocabulary of building types
// and a grammar of arrangements, each candidate built in milliseconds from its parameters, checked like any plan,
// scored, and the near-duplicates dropped. No search: the whole parameter grid is walked, so the same site and words
// always give the same list, and there are dozens to hundreds to choose from rather than three. Multifamily first:
//  - building types: a double-loaded bar, a garden (breezeway) building, a courtyard ring's wing;
//  - arrangements: rows facing the street, rows running back from it, a courtyard ring with the pool inside and the
//    parking in a ring outside (as 2101 Reinke Rd is built), a loop drive with the buildings round it and the amenity
//    at the heart (as resort-style communities are built).
// Frame feet throughout (lib/sitelayout.mjs frameOf: the street along the bottom, y up); the helpers H are the engine's.
import * as S from './siteplan.mjs';
import * as COM from './sitegencom.mjs';

export const ROW = 18, AISLE = 24, WALK = 8; const PAD = 6, box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
// ---------- the vocabulary ----------
export const TYPES = {
  bar: { D: 65, minL: 120, maxL: 320, gap: 24, label: 'bars' }, // a double-loaded corridor building
  garden: { D: 60, minL: 110, maxL: 150, gap: 20, label: 'garden buildings' }, // breezeway walk-ups, several to a row
  wing: { D: 65, minL: 100, maxL: 600, gap: 0, label: 'wings' } // a courtyard ring's side
};
// ---------- pieces ----------
export const bld = (x0, y0, x1, y1, o) => ({ kind: 'building', x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, d: y1 - y0, use: 'multifamily', ...o });
export const drive = (x0, y0, x1, y1, o = {}) => ({ kind: 'drive', x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, d: y1 - y0, ...o });
export const splitRow = (x0, x1, y0, side, blocks, mk) => { const out = []; let a = x0; for (const [b0, b1] of blocks.slice().sort((p, q) => p[0] - q[0])) { if (b0 - a >= 27) out.push(mk(a, b0, y0, side)); a = Math.max(a, b1); } if (x1 - a >= 27) out.push(mk(a, x1, y0, side)); return out; };
export const rowH = (x0, x1, y0, side = 1) => ({ kind: 'parking', x: (x0 + x1) / 2, y: y0 + ROW / 2, w: x1 - x0, d: ROW, row: side, lock: true, islands: true });
export const rowV = (y0, y1, x0, side = 1) => ({ kind: 'parking', x: x0 + ROW / 2, y: (y0 + y1) / 2, w: y1 - y0, d: ROW, rotL: 90, row: side, lock: true, islands: true });
const amenity = (cx, cy, o = {}) => [{ kind: 'building', x: cx, y: cy + 10, w: 60, d: 50, use: 'amenity', floors: 1, name: 'Clubhouse', note: 'Leasing · fitness · lounge', ...o }, { kind: 'pool', x: cx, y: cy - 40, w: 60, d: 34, name: 'Pool', note: 'Resort-style' }];
// a row of buildings of a type along x between x0 and x1 at depth [y0, y1]: as many as fit, centered, an amenity court
// cut out of the middle when asked
function rowOf(T, x0, x1, y0, y1, fl, court) {
  const out = [], L = x1 - x0; if (L < T.minL) return out;
  if (court) { const cw = 120; const a = rowOf(T, x0, (x0 + x1) / 2 - cw / 2, y0, y1, fl, false), b = rowOf(T, (x0 + x1) / 2 + cw / 2, x1, y0, y1, fl, false); return a.concat(b); }
  const n = Math.max(1, Math.floor((L + T.gap) / (T.minL + T.gap))), len = Math.min(T.maxL, (L - (n - 1) * T.gap) / n); if (len < T.minL) return out; // (as many as fit at their shortest, each then as long as the row allows)
  const total = n * len + (n - 1) * T.gap, s = x0 + (L - total) / 2;
  for (let i = 0; i < n; i++) out.push(bld(s + i * (len + T.gap), y0, s + i * (len + T.gap) + len, y1, { floors: fl }));
  return out;
}
// ---------- the frame's buildable and pavable rectangles ----------
function rects(F, H) {
  const P = H.profile(F), widest = (a, b) => (b[1] - b[0]) - (a[1] - a[0]), at = (kind, y) => H.spans(F, y, y + 0.5, kind).sort(widest)[0] || null;
  const rect = (kind, ya0, yb0) => { let ya = ya0, yb = yb0; for (let k = 0; k < 30 && !at(kind, ya); k++) ya += 2; for (let k = 0; k < 30 && !at(kind, yb - 0.5); k++) yb -= 2; if (yb - ya < 100) return null; // (the profile's bounds are its bins': in to the lines themselves)
    const n = 16, ys = Array.from({ length: n + 1 }, (_, i) => ya + (yb - ya - 0.5) * i / n), sp = ys.map(y => at(kind, y)); let best = null; // the biggest rectangle inside: every pair of levels, the x-range all the levels between share
    for (let i = 0; i <= n; i++) for (let j = i + 2; j <= n; j++) { let x0 = -Infinity, x1 = Infinity; for (let k = i; k <= j; k++) { if (!sp[k]) { x0 = Infinity; break; } x0 = Math.max(x0, sp[k][0]); x1 = Math.min(x1, sp[k][1]); } const A = (x1 - x0) * (ys[j] - ys[i]); if (x1 - x0 > 100 && ys[j] - ys[i] > 100 && (!best || A > best.A)) best = { A, r: [x0, ys[i], x1, ys[j] + (j === n ? 0.5 : 0)] }; }
    return best ? best.r : null; };
  const B = rect('build', P.p[0], P.p[1]), V = rect('pave', P.b[0], P.b[1]), band = (kind, y0, y1) => { let x0 = -Infinity, x1 = Infinity; for (let k = 0; k <= 4; k++) { const sp = at(kind, y0 + (y1 - y0 - 0.5) * k / 4); if (!sp) return null; x0 = Math.max(x0, sp[0]); x1 = Math.min(x1, sp[1]); } return x1 - x0 > 60 ? [x0, x1] : null; };
  const col = (kind, x0, x1) => { const sp = H.spans(F, x0, x1, kind, [], true).sort(widest)[0]; return sp && sp[1] - sp[0] > 60 ? sp : null; }; // (a column's y-range: the transposed spans)
  return B && V ? { B, V, front: F.Y0, band, col, yF: P.p[0], yB: P.p[1], vF: P.b[0], vB: P.b[1] } : null; // (pondShare and pondDepth set by generate from the detention the site needs)
}
// ---------- arrangements: each returns { els, label, key } in frame feet or null ----------
// rows facing the street: bands from the front up, parking between the rows, a spine from the entry through them
function rowsFacing(R, p, fl, T) {
  const { front } = R, els = [], band = ROW + AISLE + ROW + WALK + T.D + WALK, vB = p.cut === 'none' ? R.vB - R.pondDepth : R.vB, depth = vB - R.vF; // (no cut at a side: the pond's land at the back)
  const nB = p.rows, need = nB * band + ROW + AISLE + ROW; if (need > depth + 1) return null;
  const W0 = R.band('pave', R.vF, R.vF + ROW); if (!W0) return null; const cut = (sp, f) => [p.cut === 'left' ? sp[0] + (sp[1] - sp[0]) * f : sp[0], p.cut === 'right' ? sp[1] - (sp[1] - sp[0]) * f : sp[1]], w0 = cut(W0, R.pondShare), cx = (w0[0] + w0[1]) / 2, ex = w0[0] + (w0[1] - w0[0]) * 0.2;
  const ex0 = w0[0], ex1 = w0[1]; let y = R.vF; const aisles = [], ends = [], blocks = i => [[cx - (i ? 13 : 36), cx + (i ? 13 : 36)]].concat(i === 0 && p.entrances === 2 ? [[ex - 36, ex + 36]] : []); // (no stalls beside an entry's throat)
  for (let i = 0; i <= nB; i++) { // each band as wide as the lot is at its depth (a slanted side costs that band, not the whole lot)
    const V1 = R.band('pave', y, y + ROW + AISLE + ROW); if (!V1) return null; const [x0, x1] = cut(V1, R.pondShare); ends.push([x0, x1]);
    els.push(...splitRow(x0 + AISLE + 2, x1 - AISLE - 2, y, 1, blocks(i), rowH)); y += ROW; aisles.push(y); els.push(drive(x0, y, x1, y + AISLE)); y += AISLE; els.push(...splitRow(x0 + AISLE + 2, x1 - AISLE - 2, y, -1, [[cx - (i ? 13 : 36), cx + (i ? 13 : 36)]], rowH)); y += ROW;
    if (i < nB) { y += WALK; const Bb = R.band('build', y, y + T.D); if (!Bb) return null; const [bx0, bx1] = (b => [Math.max(b[0], ex0 + AISLE + WALK), Math.min(b[1], ex1 - AISLE - WALK)])(cut(Bb, R.pondShare)), court = i === (p.amenity === 'center' ? Math.floor((nB - 1) / 2) : 0); // (the court on the spine: in the first row at the entry, or the middle row)
      if (court) { els.push(...rowOf(T, bx0, cx - 22, y, y + T.D, fl, false), ...rowOf(T, cx + 150, bx1, y, y + T.D, fl, false), ...amenity(cx + 86, y + T.D / 2)); } else els.push(...rowOf(T, bx0, cx - 22, y, y + T.D, fl, false), ...rowOf(T, cx + 22, bx1, y, y + T.D, fl, false)); y += T.D + WALK; } // (the spine runs between the buildings)
  }
  // the spine from the street through every aisle, and a drive down each end joining them (no aisle dead-ends)
  const top = aisles[aisles.length - 1] + AISLE; els.push(drive(cx - 12, front - 2, cx + 12, top, { name: 'Main entry', entry: true }));
  const e0 = Math.max(...ends.map(e => e[0])), e1 = Math.min(...ends.map(e => e[1])); els.push(drive(e0, aisles[0], e0 + AISLE, top), drive(e1 - AISLE, aisles[0], e1, top));
  if (p.entrances === 2) els.push(drive(ex - 12, front - 2, ex + 12, aisles[0] + AISLE, { name: 'Entrance 2', entry: true }));
  return { els, label: 'Rows facing the street · ' + nB + ' row' + (nB > 1 ? 's' : '') + ' of ' + T.label, key: 'facing|' + p.rows + '|' + p.type + '|' + p.amenity + '|' + p.cut + '|' + p.entrances };
}
// rows running back from the street: columns from one side across, a drive along the front joining their aisles
function rowsBack(R, p, fl, T) {
  const { front } = R, els = [], band = ROW + AISLE + ROW + WALK + T.D + WALK, W0 = R.band('pave', R.vF, R.vF + AISLE); if (!W0) return null; const width = W0[1] - W0[0];
  const nC = p.rows, need = nC * band + ROW + AISLE + ROW; if (need > width + 1) return null;
  let x = W0[0] + (width - need) / 2; const cols = [], backs = [], yF = R.vF + AISLE + 6;
  for (let i = 0; i <= nC; i++) { // each column as deep as the lot is there
    const C1 = R.col('pave', x, x + ROW + AISLE + ROW); if (!C1) return null; const y0 = Math.max(yF, C1[0]), y1 = p.cut === 'back' ? C1[1] - (C1[1] - y0) * R.pondShare : C1[1] - R.pondDepth;
    els.push(rowV(y0, y1 - AISLE - 2, x, 1)); x += ROW; cols.push(x); els.push(drive(x, y0 - 6, x + AISLE, y1)); x += AISLE; els.push(rowV(y0, y1 - AISLE - 2, x, -1)); x += ROW; backs.push(y1);
    if (i < nC) { x += WALK; const Cb = R.col('build', x, x + T.D); if (!Cb) return null; const by0 = Math.max(Cb[0], yF + 4), by1 = Math.min(y1 - AISLE - WALK, Cb[1] - 4), court = i === (p.amenity === 'center' ? Math.floor((nC - 1) / 2) : 0); const L = by1 - by0, n = Math.max(1, Math.floor((L + T.gap) / (T.minL + T.gap))), len = Math.min(T.maxL, (L - (n - 1) * T.gap) / n), tot = n * len + (n - 1) * T.gap, s = by0 + (L - tot) / 2; if (len < T.minL) return null;
      for (let k = 0; k < n; k++) { if (court && k === (p.amenity === 'center' ? Math.floor((n - 1) / 2) : 0)) { els.push(...amenity(x + T.D / 2, s + k * (len + T.gap) + len / 2, { w: 50, d: 60 })); continue; } els.push(bld(x, s + k * (len + T.gap), x + T.D, s + k * (len + T.gap) + len, { floors: fl })); }
      x += T.D + WALK; }
  }
  const xa = cols[0], xb = cols[cols.length - 1] + AISLE, yb = Math.min(...backs); els.push(drive(xa, R.vF, xb, R.vF + AISLE), drive(xa, yb - AISLE, xb, yb)); // the front drive and a back drive joining the aisles (no aisle dead-ends)
  const cx = (xa + xb) / 2; els.push(drive(cx - 12, front - 2, cx + 12, R.vF + AISLE, { name: 'Main entry', entry: true }));
  if (p.entrances === 2) els.push(drive(xa + 10, front - 2, xa + 34, R.vF + AISLE, { name: 'Entrance 2', entry: true }));
  return { els, label: 'Rows running back · ' + nC + ' row' + (nC > 1 ? 's' : '') + ' of ' + T.label, key: 'back|' + p.rows + '|' + p.type + '|' + p.amenity + '|' + p.cut + '|' + p.entrances };
}
// a courtyard ring: wings round a court with the pool and clubhouse, two buildings on the street side flanking the
// entry court, parking in a ring outside, entrances at the ring's front corners
function courtyard(R, p, fl, T, foot) {
  const rings = p.rings || 1, { V } = R, els = [], W = (V[2] - V[0]) / rings;
  for (let k = 0; k < rings; k++) { const r = courtyard1(R, p, fl, T, foot / rings, [V[0] + k * W, V[0] + (k + 1) * W], k); if (!r) return null; els.push(...r); }
  return { els, label: (rings > 1 ? rings + ' courtyards side by side' : 'Courtyard') + ' · wings round the pool, parking outside', key: 'court|' + rings + '|' + p.aspect + '|' + p.entrances };
}
// one ring between x-limits xr, with a share of the floor area; null when its wings would run longer than a building does
function courtyard1(R, p, fl, T, foot, xr, k) {
  const { B, front } = R, V = [Math.max(R.V[0], xr[0]), R.V[1], Math.min(R.V[2], xr[1]), R.V[3] - R.pondDepth], D = T.D, ringW = ROW + AISLE + ROW + WALK, els = [];
  const maxW = Math.min(Math.min(B[2], V[2]) - Math.max(B[0], V[0]), V[2] - V[0] - 2 * ringW, 2 * D + 420), maxH = Math.min(B[3] - B[1], V[3] - V[1] - 2 * ringW, 2 * D + 420); if (maxW < 2 * D + 140 || maxH < 2 * D + 100) return null;
  // the ring sized to the floor area asked: wings' length 2h + 2w - 4D - gap
  const gap = 90, need = foot / D; let w = Math.min(maxW, Math.sqrt((need + 4 * D + gap) / 2 * p.aspect * 1) * 1), h = Math.min(maxH, w / p.aspect);
  for (let k = 0; k < 20; k++) { const len = 2 * h + 2 * w - 4 * D - gap; if (Math.abs(len - need) < 10) break; const s = Math.sqrt(need / Math.max(1, len)); w = Math.min(maxW, Math.max(2 * D + 140, w * s)); h = Math.min(maxH, Math.max(2 * D + 100, h * s)); }
  const len = 2 * h + 2 * w - 4 * D - gap; if (len < foot / D * 0.8) return null; // (the ring can't hold its share: more rings, or another arrangement)
  const cx = (V[0] + V[2]) / 2, x0 = cx - w / 2, x1 = cx + w / 2, y0 = V[1] + ringW, y1 = y0 + h; if (x0 < B[0] - 1 || x1 > B[2] + 1 || y1 > B[3] + 1) return null;
  // the wings: west and east the full height, the back across, the front in two with the entry court between
  els.push(bld(x0, y0, x0 + D, y1, { floors: fl }), bld(x1 - D, y0, x1, y1, { floors: fl }), bld(x0 + D, y1 - D, x1 - D, y1, { floors: fl }));
  els.push(bld(x0 + D, y0, cx - gap / 2, y0 + D, { floors: fl }), bld(cx + gap / 2, y0, x1 - D, y0 + D, { floors: fl }));
  els.push({ kind: 'plaza', x: cx, y: y0 + D / 2, w: gap - 8, d: D, name: '', note: 'Entry court' });
  // the court: the clubhouse closing the entry court, the pool in the middle
  const cy = (y0 + D + y1 - D) / 2; els.push({ kind: 'building', x: cx, y: y0 + D + 36, w: 70, d: 50, use: 'amenity', floors: 1, name: 'Clubhouse', note: 'Leasing · fitness · lounge' }, { kind: 'pool', x: cx, y: Math.max(cy, y0 + D + 100), w: 70, d: 40, name: 'Pool', note: 'Courtyard pool' });
  // the parking ring: an aisle round the wings with a row each side (the inner row against the wings' walk)
  const ax0 = x0 - WALK - ROW - AISLE, ax1 = x1 + WALK + ROW, ay0 = y0 - WALK - ROW - AISLE, ay1 = y1 + WALK + ROW;
  els.push(drive(ax0, ay0, ax0 + AISLE, ay1 + AISLE), drive(ax1, ay0, ax1 + AISLE, ay1 + AISLE), drive(ax0, ay0, ax1 + AISLE, ay0 + AISLE), drive(ax0, ay1, ax1 + AISLE, ay1 + AISLE));
  els.push(rowV(ay0 + AISLE, ay1, ax0 - ROW, 1), rowV(ay0 + AISLE, ay1, ax0 + AISLE, -1), rowV(ay0 + AISLE, ay1, ax1 - ROW, 1), rowV(ay0 + AISLE, ay1, ax1 + AISLE, -1));
  els.push(rowH(ax0 + AISLE, ax1, ay0 - ROW, 1), rowH(x0 + D, cx - gap / 2 - 10, ay0 + AISLE, -1), rowH(cx + gap / 2 + 10, x1 - D, ay0 + AISLE, -1), rowH(ax0 + AISLE, ax1, ay1 + AISLE, -1), rowH(ax0 + AISLE, ax1, ay1 - ROW, 1));
  // the entrances: at the ring's front corners (both) or the court's axis
  const nm = i => k === 0 && i === 0 ? 'Main entry' : 'Entrance ' + (k * 2 + i + 2); if (p.entrances === 2) els.push(drive(ax0, front - 2, ax0 + AISLE, ay0, { name: nm(0), entry: true }), drive(ax1, front - 2, ax1 + AISLE, ay0, { name: nm(1), entry: true }));
  else els.push(drive(cx - 12, front - 2, cx + 12, ay0, { name: nm(0), entry: true }));
  return els;
}
// a loop drive with the buildings round its outside, turned to follow it, the clubhouse and pool on the island inside
function loop(R, p, fl, T, foot, target, prog) {
  const { B, V, front } = R, D = T.D, els = [], off = WALK + ROW + AISLE / 2, outer = off + D + PAD; // (from a building's face to the loop's center line: a walk, a row, half the aisle; outer: the loop's center line in from the build line)
  const w = (B[2] - B[0] - 2 * outer) * p.size, h = (B[3] - R.pondDepth - B[1] - 2 * outer) * p.size, cx = (B[0] + B[2]) / 2, cy = p.size < 1 ? B[1] + outer + h / 2 + (B[3] - B[1] - 2 * outer - h) * 0.5 : (B[1] + B[3]) / 2, r = Math.min(120, w / 3, h / 3); if (w < 200 || h < 160) return null;
  const C = S.fillet(box(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), r, true); // the loop's center line
  const half = Math.floor(C.length / 2); els.push({ kind: 'drive', path: C.slice(0, half + 1), width: AISLE, r: 0, name: 'Loop drive', note: 'Loop drive' }, { kind: 'drive', path: C.slice(half).concat([C[0]]), width: AISLE, r: 0, name: '', note: 'Loop drive' }); // (two open halves: a closed path would read as a filled ring)
  // rows along the straight sides, inside and out
  const i0 = cx - w / 2 + r, i1 = cx + w / 2 - r, j0 = cy - h / 2 + r, j1 = cy + h / 2 - r;
  const A2 = AISLE / 2 - 1; els.push(rowH(i0, i1, cy - h / 2 - A2 - ROW, 1), rowH(i0, i1, cy - h / 2 + A2, -1), rowH(i0, i1, cy + h / 2 + A2, -1), rowH(i0, i1, cy + h / 2 - A2 - ROW, 1));
  els.push(rowV(j0, j1, cx - w / 2 - A2 - ROW, 1), rowV(j0, j1, cx - w / 2 + A2, -1), rowV(j0, j1, cx + w / 2 + A2, -1), rowV(j0, j1, cx + w / 2 - A2 - ROW, 1));
  // the buildings along the loop's straight sides (none on the bends), outside and, where the island is deep enough,
  // inside too, square to the loop or angled to it as resort communities set them, until the count asked is met
  const placed = [], gapB = p.turn === 'angled' ? 70 : 24, c0 = off + D / 2, len = p.len, unitsOf = () => els.filter(e => e.kind === 'building' && e.use === 'multifamily').reduce((t, e) => t + Math.floor(e.w * e.d * fl * 0.85 / prog.unitSf), 0);
  const innerOK = sd => (sd.o[0] ? w / 2 : h / 2) - c0 - D / 2 >= 10; // (buildings inside the loop along a side when the island is wide enough that way; the pool keeps the middle)
  const sides = [{ a: [i0, cy - h / 2], b: [i1, cy - h / 2], o: [0, -1], skip: [cx - 50, cx + 50] }, { a: [i0, cy + h / 2], b: [i1, cy + h / 2], o: [0, 1] }, { a: [cx - w / 2, j0], b: [cx - w / 2, j1], o: [-1, 0] }, { a: [cx + w / 2, j0], b: [cx + w / 2, j1], o: [1, 0] }];
  for (const where of [1, -1]) for (const sd of sides) { if (where < 0 && !innerOK(sd)) continue; const L = Math.hypot(sd.b[0] - sd.a[0], sd.b[1] - sd.a[1]), u = [(sd.b[0] - sd.a[0]) / L, (sd.b[1] - sd.a[1]) / L], k = Math.floor((L + gapB) / (len + gapB)); if (k < 1) continue; const tot = k * len + (k - 1) * gapB, s0 = (L - tot) / 2;
    for (let i = 0; i < k; i++) { if (unitsOf() >= target * 1.05) break; const t = s0 + i * (len + gapB) + len / 2, m = [sd.a[0] + u[0] * t, sd.a[1] + u[1] * t]; if (where > 0 && sd.skip && Math.abs(m[0] - cx) < len / 2 + 14) continue; // (the entry comes through the front side)
      const ang0 = Math.atan2(u[1], u[0]) * 180 / Math.PI, ang = ang0 + (p.turn === 'angled' ? (i % 2 ? 18 : -18) : 0), c = [m[0] + sd.o[0] * c0 * where, m[1] + sd.o[1] * c0 * where];
      const e = { kind: 'building', x: c[0], y: c[1], w: len, d: D, rotL: ((ang % 180) + 180) % 180, use: 'multifamily', floors: fl }, cs = S.corners({ ...e, rot: e.rotL });
      if (!cs.every(v => v[0] >= B[0] - 2 && v[0] <= B[2] + 2 && v[1] >= B[1] - 2 && v[1] <= B[3] + 2)) continue; if (placed.some(o => S.rectsOverlap({ poly: S.grow(cs, 8) }, { poly: o }, 0.5))) continue; if (where < 0 && Math.abs(c[0] - cx) < 60 + len / 2 && Math.abs(c[1] - cy) < 60) continue; placed.push(cs); els.push(e); } } // (the island's middle is the pool's)
  if (placed.length < 3) return null;
  els.push(...amenity(cx, cy + 20)); // the island: clubhouse and pool at the heart
  const ex = cx; els.push(drive(ex - 12, front - 2, ex + 12, cy - h / 2 + 1, { name: 'Main entry', entry: true }));
  if (p.entrances === 2) els.push(drive(cx - w / 2 - 12, front - 2, cx - w / 2 + 12, cy - h / 2 + r + 1, { name: 'Entrance 2', entry: true }));
  return { els, label: 'Loop drive · ' + placed.length + ' ' + T.label + (p.turn === 'angled' ? ' angled to it' : '') + ', the pool at the heart', key: 'loop|' + p.type + '|' + p.len + '|' + p.size + '|' + p.turn + '|' + p.entrances };
}
// ---------- the grid, the fit to the count asked, the ranking ----------
// the buildings cut to the count asked: each one shortened in step until the units come down to it (never under its type's shortest)
function fitCount(els, T, target, unitSf, fl) {
  const units = () => els.filter(e => e.kind === 'building' && e.use === 'multifamily').reduce((t, e) => t + Math.floor(e.w * e.d * (e.floors || fl) * 0.85 / unitSf), 0);
  for (let k = 0; k < 12 && units() > target * 1.04; k++) { const s = Math.max(0.6, Math.sqrt(target / units()) ** 1.0); for (const e of els) if (e.kind === 'building' && e.use === 'multifamily') { const long = e.w >= e.d ? 'w' : 'd', L = e[long]; e[long] = Math.max(T.minL, L * (0.5 + s / 2)); } }
  return units();
}
// the rows cut back to what the buildings need (a tenth over): whole rows farthest from any building first, then the
// longest rows shortened from the end away from the buildings
function trimRows(els, need) {
  const B = els.filter(e => e.kind === 'building'), stallsOf = e => S.stalls({ ...e, rot: 0 }).count, total = () => els.filter(e => e.kind === 'parking').reduce((t, e) => t + stallsOf(e), 0);
  const dist = e => Math.min(...B.map(b => Math.hypot(b.x - e.x, b.y - e.y)));
  for (let k = 0; k < 40 && total() > need * 1.1; k++) { const rows = els.filter(e => e.kind === 'parking').sort((a, b) => dist(b) - dist(a)), r = rows[0]; if (!r) break; const over = total() - need * 1.05, n = stallsOf(r);
    if (n <= over) { els.splice(els.indexOf(r), 1); continue; } const cut = Math.max(0, Math.floor(over)) * 9; if (cut < 27) break; // (shorten: the end away from the buildings)
    const long = r.rotL ? 'y' : 'x', L = r.w, near = B.reduce((t, b) => t + (long === 'x' ? b.x : b.y), 0) / Math.max(1, B.length), c = long === 'x' ? r.x : r.y; r.w = L - cut; const d = (near > c ? 1 : -1) * cut / 2; if (long === 'x') r.x += d; else r.y += d; }
}
// the programs the generator lays out (apartments, shops, flex and warehouse parks, self storage: one use, sized)
export const covers = prog => (prog.use === 'multifamily' || COM.USES.includes(prog.use)) && !prog.zones && !prog.anchor && !prog.max;
export function generate(plan, prog, ctx, H, opts = {}) {
  const D = globalThis.SP_DEBUG ? (...a) => console.log('  gen', ...a) : () => {};
  const com = COM.USES.includes(prog.use); if (!(prog.use === 'multifamily' || com) || ctx.foot == null || prog.zones || prog.anchor) { D('not for', prog.use, ctx.foot); return []; }
  const F = H.frameOf(plan, false, 'front'); if (!F || F.deep) { D('frame', !!F, F?.deep); return []; } const R = rects(F, H); if (!R) D('no rectangles', F.X0, F.X1, F.Y0, F.Y1); if (R) { const A = (R.V[2] - R.V[0]) * (R.V[3] - R.V[1]); R.pondShare = Math.min(0.45, Math.max(0.12, ctx.pond * 1.5 / A)); R.pondDepth = ctx.pond > 3000 ? Math.min((R.V[3] - R.V[1]) * 0.4, Math.max(80, ctx.pond * 1.4 / (R.V[2] - R.V[0]))) : 0; } if (!R) { const P = H.profile(F); D('no rects', P.p, P.b, [-240, -200, -100, 0, 100, 200, 240].map(y => y + ':' + JSON.stringify(H.spans(F, y, y + 0.5, 'build').map(v => v.map(Math.round)))).join(' '), 'Y', F.Y0, F.Y1, 'X', F.X0, F.X1, 'build', F.build, 'rules', F.rules.map(r => r.role)); return []; } D('rects', R);
  const fl = prog.floors || 3, target = prog.units || Math.floor(ctx.foot * fl * 0.85 / prog.unitSf), out = [], seen = new Set(), t0 = Date.now(), budget = opts.budgetMs ?? 20000;
  const tryOne = (made, p) => { if (!made || seen.has(made.key)) { D('skip', p.type, p.rows || p.n || p.aspect, made ? 'twin' : 'null'); return; } seen.add(made.key);
    if (com) { if (made.placed < ctx.foot * 0.6) { D('few', made.key, Math.round(made.placed), 'of', Math.round(ctx.foot)); return; } } else { const units = fitCount(made.els, TYPES[p.type || 'bar'], target, prog.unitSf, fl); if (units < target * 0.6) { D('few', made.key, units); return; } }
    { const t = H.tally(made.els, prog), before = made.els.filter(e => e.kind === 'parking').reduce((q, e) => q + S.stalls({ ...e, rot: 0 }).count, 0); trimRows(made.els, t.need); D('trim', made.key, 'need', t.need, 'units', t.units, 'stalls', before, '->', made.els.filter(e => e.kind === 'parking').reduce((q, e) => q + S.stalls({ ...e, rot: 0 }).count, 0)); }
    const land = H.finishLand(F, made.els, { pond: ctx.pond, openSpace: !com, trail: !com, amenity: false, padUse: false, frontY: R.front }, {}), els = made.els.concat(land);
    const a = { F, els, o: { pondAt: 'none' }, st: { pond: land.filter(e => e.kind === 'pond').reduce((t, e) => t + S.elArea(e), 0), pondNeed: ctx.pond }, pre: { surf: 0 } };
    let f; try { f = H.take(plan, a, prog, ctx.foot, 'gen|' + made.key, { gen: { arrangement: made.key, params: p } }, made.label); } catch (e) { if (globalThis.SP_DEBUG) console.log('gen failed', made.key, e.message); return; }
    if (com && (f.bad.length || f.cut || f.els.filter(e => e.kind === 'building').length < made.els.filter(e => e.kind === 'building').length)) { D('lost', made.key, f.bad.map(i => i.text).slice(0, 2).join('; '), 'cut', f.cut); return; } // (a commercial layout the repair had to cut into, or that still breaks a rule, isn't offered: the grid has its neighbours) // (a commercial layout that lost a building to the repair isn't offered: the grid has its neighbours)
    if (globalThis.SP_DEBUG) { const b0 = made.els.filter(e => e.kind === 'building'), b1 = f.els.filter(e => e.kind === 'building'); D('take', made.key, 'buildings', b0.length, '->', b1.length, 'cut', f.cut, 'bad', f.bad.map(i => i.text).slice(0, 2).join('; ')); if (b0.length !== b1.length && /loop/.test(made.key)) { const F2 = a.F, kept = b1.map(e => [e.x, e.y]); D('  kept', b1.map(e => (e.name || e.note || '').slice(0, 10) + '@' + Math.round(e.x) + ',' + Math.round(e.y) + (e.rot ? '/' + Math.round(e.rot) : '')).join(' ')); D('  made', b0.map(e => Math.round(e.x) + ',' + Math.round(e.y) + '/' + Math.round(e.rotL || 0)).join(' ')); } }
    f.a.st = { ...H.tally(f.els, prog), pond: a.st.pond, pondNeed: a.st.pondNeed }; f.score = H.score(f.a, prog, ctx.foot) - f.bad.length * 500 - (f.cut || 0) * 40; D('score', made.key, Math.round(f.score), 'st', JSON.stringify({ u: f.a.st.units, s: f.a.st.stalls, n: f.a.st.need, g: f.a.st.garages, gfa: Math.round(f.a.st.gfa) })); // (the score of what survived the repair, not of what was composed)
    if (com && prog.use === 'retail' && prog.pads > 0) { const got = f.els.filter(e => e.kind === 'building' && /drive-thru/i.test(e.note || '')).length; f.score -= Math.abs(got - prog.pads) / prog.pads * 300; } // (the pads asked for: a layout without them ranks below one with them)
    f.params = p; f.units = f.a.st.units; out.push(f); };
  if (com) { for (const p of COM.grid(prog, S.ringArea(plan.ring) / 43560)) { if (Date.now() - t0 > budget) break; tryOne(COM.make(R, p, prog, ctx.foot), p); } }
  else { for (const type of ['bar', 'garden']) for (const rows of [1, 2, 3, 4, 5, 6, 7]) for (const amen of ['entry', 'center']) for (const cut of ['none', 'left', 'right']) for (const ent of [1, 2]) { if (Date.now() - t0 > budget) break;
    const p = { type, rows, amenity: amen, cut, entrances: ent }; tryOne(rowsFacing(R, p, fl, TYPES[type]), p); if (cut !== 'left') tryOne(rowsBack(R, { ...p, cut: cut === 'right' ? 'back' : 'none' }, fl, TYPES[type]), { ...p, cut: cut === 'right' ? 'back' : 'none' }); }
  for (const rings of [1, 2, 3]) for (const aspect of [0.8, 1, 1.25, 1.5]) for (const ent of [2, 1]) { const p = { type: 'wing', rings, aspect, entrances: ent }; tryOne(courtyard(R, p, fl, TYPES.wing, ctx.foot), p); }
  for (const type of ['garden', 'bar']) for (const len of type === 'garden' ? [110, 140] : [160, 200, 260]) for (const size of [0.7, 0.85, 1]) for (const turn of ['square', 'angled']) for (const ent of [1, 2]) { if (Date.now() - t0 > budget) break; const p = { type, len, size, turn, entrances: ent }; let made = null; try { made = loop(R, p, fl, TYPES[type], ctx.foot, target, prog); } catch (e) { D('loop threw', e.message); } tryOne(made, p); }
  }
  // ranked: no rule broken first, then the score (the count asked, the parking, the front); near-twins dropped
  const sig = f => f.label.split(' · ')[0] + '|' + f.els.filter(e => e.kind === 'building').map(e => Math.round(e.x / 60) + ',' + Math.round(e.y / 60)).sort().join(';') + '|e' + S.entrancesOf(f.els).length + '|p' + f.els.filter(e => e.kind === 'pond').map(e => Math.round(e.x / 120) + ',' + Math.round(e.y / 120)).sort().join(';'); // (twins: the same buildings, ways in and ponds)
  const ranked = out.sort((a, b) => (a.bad.length - b.bad.length) || (b.score - a.score)), kept = [], sigs = new Set();
  for (const f of ranked) { const s = sig(f); D('sig', f.key, s.slice(0, 80)); if (sigs.has(s)) continue; sigs.add(s); kept.push(f); }
  return kept;
}
