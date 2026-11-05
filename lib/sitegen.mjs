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
import * as CX from './enginectx.mjs';
import * as COM from './sitegencom.mjs';
import { REF_TEMPLATES } from './reftemplates.mjs';

export const ROW = 18, AISLE = 24, WALK = 8, SECOND_WAY_AT = 200; /* (SECOND_WAY_AT: apartments past which the fire code asks for a second way in, IFC D106.1) */ const PAD = 6, box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
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
export const rowV = (y0, y1, x0, side = 1) => ({ kind: 'parking', x: x0 + ROW / 2, y: (y0 + y1) / 2, w: y1 - y0, d: ROW, rotL: 90, row: -side, lock: true, islands: true }); // (side 1: the stalls open to +x, the aisle on the row's right; a turned row's open side is its local -y)
// an entrance kept about 100 ft from the corner of two streets (the frame's ends that meet a side street)
export const awayFromCorner = (x, R, m = 100) => R.cornerX0 && x < R.X0 + m ? R.X0 + m : R.cornerX1 && x > R.X1 - m ? R.X1 - m : x;
const amenity = (cx, cy, o = {}) => [{ kind: 'building', x: cx, y: cy + 10, w: 60, d: 50, use: 'amenity', floors: 1, name: 'Clubhouse', note: 'Leasing · fitness · lounge', ...o }, { kind: 'pool', x: cx, y: cy - 40, w: 60, d: 34, name: 'Pool', note: 'Resort-style' }];
// the clubhouse and pool side by side in a row's amenity court (x0..x1 along the row, y0..y1 the building band's depth):
// stacked, as amenity() draws them, the pool ran out of a 65 ft band into the parking row and the repair took it away
const courtAmenity = (x0, x1, y0, y1) => { const W = x1 - x0, cy = (y0 + y1) / 2, cw = Math.min(60, W * 0.45), cd = Math.min(50, y1 - y0 - 8), dx0 = x0 + 6 + cw, dx1 = x1 - 6, pw = Math.min(50, dx1 - dx0 - 12), pd = Math.min(34, y1 - y0 - 20); return [{ kind: 'building', x: x0 + 6 + cw / 2, y: cy, w: cw, d: cd, use: 'amenity', floors: 1, name: 'Clubhouse', note: 'Leasing · fitness · lounge' }, { kind: 'plaza', x: (dx0 + dx1) / 2, y: cy, w: dx1 - dx0, d: Math.min(cd, pd + 12), name: '', note: 'Pool deck' }, { kind: 'pool', x: (dx0 + dx1) / 2, y: cy, w: pw, d: pd, name: 'Pool', note: 'Resort-style' }]; }; // (the pool on its deck against the clubhouse, as the search's amenity court draws it: moved together)
// a row of buildings of a type along x between x0 and x1 at depth [y0, y1]: as many as fit, centered, an amenity court
// cut out of the middle when asked
function rowOf(T, x0, x1, y0, y1, fl, court) {
  const out = [], L = x1 - x0; if (L < T.minL) return out;
  if (court) { const cw = 120; const a = rowOf(T, x0, (x0 + x1) / 2 - cw / 2, y0, y1, fl, false), b = rowOf(T, (x0 + x1) / 2 + cw / 2, x1, y0, y1, fl, false); return a.concat(b); }
  const n = Math.max(1, Math.floor((L + T.gap) / (T.minL + T.gap))), len0 = Math.min(T.maxL, (L - (n - 1) * T.gap) / n), len = T.step > 0 ? Math.floor((len0 + 0.5) / T.step) * T.step : len0; if (len < T.minL) return out; // (as many as fit at their shortest, each then as long as the row allows; whole modules where the run gives one)
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
  const n = F.ring?.length || 0, rule = i => n ? F.rules?.[((i % n) + n) % n] : null; // (the frame's front edge runs +x from ring[front] to ring[front + 1]: the edge before it ends at X0, the one after starts at X1)
  let diag = 0; for (const a of F.ring || []) for (const b of F.ring || []) diag = Math.max(diag, Math.hypot(a[0] - b[0], a[1] - b[1])); // (two ways in at least half of it apart: IFC D104.3)
  return B && V ? { B, V, diag, front: F.Y0, band, col, yF: P.p[0], yB: P.p[1], vF: P.b[0], vB: P.b[1], X0: F.X0, X1: F.X1, cornerX0: !!rule(F.front - 1)?.street, cornerX1: !!rule(F.front + 1)?.street } : null; // (pondShare and pondDepth set by generate from the detention the site needs)
}
// ---------- arrangements: each returns { els, label, key } in frame feet or null ----------
// two ways in on one frontage, at least half the site's diagonal apart (IFC D104.3) where the frontage allows: the
// second near the end away from a street corner, the main entry (the spine) moved off centre the other way. Where the
// frontage is too short for that they are set as far apart as it allows (the validator then warns).
function remoteEntries(R, w0, cx, ex) {
  const need = R.diag / 2 + 10; if (Math.abs(cx - ex) >= need) return { cx, ex };
  const lo = awayFromCorner(w0[0] + 40, R), hi = awayFromCorner(w0[1] - 60, R);
  ex = lo; cx = Math.min(hi, Math.max(cx, ex + need)); if (cx - 150 < ex + 36) cx = Math.max(cx, ex + 190); // (the amenity court beside the spine kept clear of the second throat)
  return { cx: Math.min(cx, w0[1] - 160), ex };
}
// rows facing the street: bands from the front up, parking between the rows, a spine from the entry through them
function rowsFacing(R, p, fl, T) {
  const { front } = R, els = [], band = ROW + AISLE + ROW + WALK + T.D + WALK, vB = p.cut === 'none' ? R.vB - R.pondDepth : R.vB, vF = p.cut === 'front' ? R.vF + R.pondDepth : R.vF, depth = vB - vF; // (no cut at a side: the pond's land at the back; 'front', the pond asked at the front: its land along the street, lib/layoutintent.mjs)
  // p.lead: a row of buildings along the street first, the entry between them (deep enough in to the first aisle for
  // a boulevard's planted median, as the search's layouts with buildings in front have)
  const leadD = p.lead ? Math.max(0, R.yF - vF) + T.D + WALK : 0;
  const nB = p.rows, need = nB * band + ROW + AISLE + ROW + leadD; if (need > depth + 1) return null;
  const W0 = R.band('pave', vF, vF + ROW); if (!W0) return null; const cut = (sp, f) => [p.cut === 'left' ? sp[0] + (sp[1] - sp[0]) * f : sp[0], p.cut === 'right' ? sp[1] - (sp[1] - sp[0]) * f : sp[1]], w0 = cut(W0, R.pondShare); let cx = (w0[0] + w0[1]) / 2, ex = awayFromCorner(w0[0] + (w0[1] - w0[0]) * 0.2, R);
  if (p.entrances === 2) ({ cx, ex } = remoteEntries(R, w0, cx, ex));
  const ex0 = w0[0], ex1 = w0[1]; let y = vF; const aisles = [], ends = [], lead = [];
  if (p.lead) { const yb = Math.max(R.yF, vF), Bb = R.band('build', yb, yb + T.D); if (!Bb) return null; const [bx0, bx1] = (b => [Math.max(b[0], ex0), Math.min(b[1], ex1)])(cut(Bb, R.pondShare)), gap = 42; // (the boulevard and its walks between the two buildings either side of it)
    const ok = [[bx0, cx - gap], [cx + gap, bx1]].flatMap(([a, b]) => p.entrances === 2 && ex > a && ex < b ? [[a, ex - 36], [ex + 36, b]] : [[a, b]]);
    for (const [a, b] of ok) lead.push(...rowOf(T, a, b, yb, yb + T.D, fl, false)); if (!lead.length) return null; els.push(...lead); y = yb + T.D + WALK; }
  const blocks = i => [[cx - (i ? 13 : 36), cx + (i ? 13 : 36)]].concat(i === 0 && p.entrances === 2 ? [[ex - 36, ex + 36]] : []); // (no stalls beside an entry's throat)
  for (let i = 0; i <= nB; i++) { // each band as wide as the lot is at its depth (a slanted side costs that band, not the whole lot)
    const V1 = R.band('pave', y, y + ROW + AISLE + ROW); if (!V1) return null; const [x0, x1] = cut(V1, R.pondShare); ends.push([x0, x1]);
    els.push(...splitRow(x0 + AISLE + 2, x1 - AISLE - 2, y, 1, blocks(i), rowH)); y += ROW; aisles.push(y); els.push(drive(x0, y, x1, y + AISLE)); y += AISLE; els.push(...splitRow(x0 + AISLE + 2, x1 - AISLE - 2, y, -1, [[cx - (i ? 13 : 36), cx + (i ? 13 : 36)]], rowH)); y += ROW;
    if (i < nB) { y += WALK; const Bb = R.band('build', y, y + T.D); if (!Bb) return null; const [bx0, bx1] = (b => [Math.max(b[0], ex0 + AISLE + WALK), Math.min(b[1], ex1 - AISLE - WALK)])(cut(Bb, R.pondShare)), court = i === (p.amenity === 'center' ? Math.floor((nB - 1) / 2) : p.amenity === 'back' ? nB - 1 : 0); // (the court on the spine: in the first row at the entry, or the middle row)
      if (court) { els.push(...rowOf(T, bx0, cx - 22, y, y + T.D, fl, false), ...rowOf(T, cx + 150, bx1, y, y + T.D, fl, false), ...courtAmenity(cx + 22, cx + 150, y, y + T.D)); } else els.push(...rowOf(T, bx0, cx - 22, y, y + T.D, fl, false), ...rowOf(T, cx + 22, bx1, y, y + T.D, fl, false)); y += T.D + WALK; } // (the spine runs between the buildings)
  }
  // the spine from the street through every aisle, and a drive down each end joining them (no aisle dead-ends)
  const top = aisles[aisles.length - 1] + AISLE; els.push(drive(cx - 12, front - 2, cx + 12, top, { name: 'Main entry', entry: true }));
  const e0 = Math.max(...ends.map(e => e[0])), e1 = Math.min(...ends.map(e => e[1])); els.push(drive(e0, aisles[0], e0 + AISLE, top), drive(e1 - AISLE, aisles[0], e1, top));
  if (p.entrances === 2) els.push(drive(ex - 12, front - 2, ex + 12, aisles[0] + AISLE, { name: 'Entrance 2', entry: true }));
  return { els, label: 'Rows facing the street · ' + (p.lead ? 'buildings along the street, ' : '') + nB + ' row' + (nB > 1 ? 's' : '') + ' of ' + T.label + (p.cut === 'front' ? ', the pond along the street' : ''), key: 'facing|' + p.rows + '|' + p.type + '|' + p.amenity + '|' + p.cut + '|' + p.entrances + (p.lead ? '|lead' : '') };
}
// rows running back from the street: columns from one side across, a drive along the front joining their aisles
function rowsBack(R, p, fl, T) {
  const { front } = R, els = [], band = ROW + AISLE + ROW + WALK + T.D + WALK, W0 = R.band('pave', R.vF, R.vF + AISLE); if (!W0) return null; const width = W0[1] - W0[0];
  const nC = p.rows, need = nC * band + ROW + AISLE + ROW; if (need > width + 1) return null;
  let x = W0[0] + (width - need) / 2; const cols = [], backs = [], yF = R.vF + AISLE + 6;
  for (let i = 0; i <= nC; i++) { // each column as deep as the lot is there
    const C1 = R.col('pave', x, x + ROW + AISLE + ROW); if (!C1) return null; const y0 = Math.max(yF, C1[0]), y1 = p.cut === 'back' ? C1[1] - (C1[1] - y0) * R.pondShare : C1[1] - R.pondDepth;
    els.push(rowV(y0, y1 - AISLE - 2, x, 1)); x += ROW; cols.push(x); els.push(drive(x, y0 - 6, x + AISLE, y1)); x += AISLE; els.push(rowV(y0, y1 - AISLE - 2, x, -1)); x += ROW; backs.push(y1);
    if (i < nC) { x += WALK; const Cb = R.col('build', x, x + T.D); if (!Cb) return null; const by0 = Math.max(Cb[0], yF + 4), by1 = Math.min(y1 - AISLE - WALK, Cb[1] - 4), court = i === (p.amenity === 'center' || p.amenity === 'back' ? Math.floor((nC - 1) / 2) : 0); const L = by1 - by0, n = Math.max(1, Math.floor((L + T.gap) / (T.minL + T.gap))), len = Math.min(T.maxL, (L - (n - 1) * T.gap) / n), tot = n * len + (n - 1) * T.gap, s = by0 + (L - tot) / 2; if (len < T.minL) return null;
      if (court && p.amenity === 'back') { /* the clubhouse asked at the back: at the column's back end, the column's buildings as many as fit in front of it (not a whole building given up for it) */ const cy = by1 - 40; els.push(...amenity(x + T.D / 2, cy, { w: 50, d: 60 })); const e1 = cy - 57 - T.gap, L2 = e1 - by0, n2 = Math.floor((L2 + T.gap) / (T.minL + T.gap)), len2 = n2 > 0 ? Math.min(T.maxL, (L2 - (n2 - 1) * T.gap) / n2) : 0;
        for (let k = 0; k < n2 && len2 >= T.minL; k++) els.push(bld(x, by0 + k * (len2 + T.gap), x + T.D, by0 + k * (len2 + T.gap) + len2, { floors: fl })); x += T.D + WALK; continue; }
      for (let k = 0; k < n; k++) { if (court && k === (p.amenity === 'center' ? Math.floor((n - 1) / 2) : p.amenity === 'back' ? n - 1 : 0)) { els.push(...amenity(x + T.D / 2, s + k * (len + T.gap) + len / 2, { w: 50, d: 60 })); continue; } els.push(bld(x, s + k * (len + T.gap), x + T.D, s + k * (len + T.gap) + len, { floors: fl })); }
      x += T.D + WALK; }
  }
  const xa = cols[0], xb = cols[cols.length - 1] + AISLE, yb = Math.min(...backs); els.push(drive(xa, R.vF, xb, R.vF + AISLE), drive(xa, yb - AISLE, xb, yb)); // the front drive and a back drive joining the aisles (no aisle dead-ends)
  let cx = (xa + xb) / 2; const e2 = p.entrances !== 2 ? null : R.cornerX0 && !R.cornerX1 ? xb - 22 : !R.cornerX0 ? xa + 22 : null;
  if (e2 != null) { const need = R.diag / 2 + 10, dir = e2 < cx ? 1 : -1; if (Math.abs(cx - e2) < need) cx = dir > 0 ? Math.min(xb - 14, e2 + need) : Math.max(xa + 14, e2 - need); } // (the main entry off centre, so the two ways in are half the site's diagonal apart where the frontage allows)
  els.push(drive(cx - 12, front - 2, cx + 12, R.vF + AISLE, { name: 'Main entry', entry: true }));
  if (p.entrances === 2) { if (e2 != null) els.push(drive(e2 - 12, front - 2, e2 + 12, R.vF + AISLE, { name: 'Entrance 2', entry: true })); } // (at the end away from a street corner; none when both ends meet one)
  return { els, label: 'Rows running back · ' + nC + ' row' + (nC > 1 ? 's' : '') + ' of ' + T.label, key: 'back|' + p.rows + '|' + p.type + '|' + p.amenity + '|' + p.cut + '|' + p.entrances };
}
// a courtyard building: double-loaded wings joined at their corners round one court, in one of two shapes —
//  'O': a closed ring, the clubhouse in a gateway in the middle of the street-side wing (a walk each side of it into
//       the court), as most suburban courtyard communities are built;
//  'U': open to the street, the clubhouse across the mouth of the U with a walk each side;
// the pool and its deck in the middle of the court, the parking in a ring round the outside (a double-loaded aisle each
// side: a row against the building's walk, a row outside), entrances at the ring's front corners or on the gateway's
// axis. The wings meet end to side (no overlaps) and stay rectangles, tagged as one courtyard by the run layer
// (lib/layoutrun.mjs joinCourtyard). The ring is sized to the floor area asked (never drawn bigger and chopped).
// p.rws 2: a second row of courts behind the first, each sharing the front court's back aisle (reached through it, no
// entrance of its own), the front court's back row of parking its front row
function courtyard(R, p, fl, T, foot) {
  const rings = p.rings || 1, rws = p.rws || 1, { V } = R, els = [], W = (V[2] - V[0]) / rings;
  for (let k = 0; k < rings; k++) { let back = null;
    for (let m = 0; m < rws; m++) { const r = courtyard1(R, p, fl, T, foot / (rings * rws), [V[0] + k * W, V[0] + (k + 1) * W], k, back, m); if (!r) return null; els.push(...r); back = r.ay1; } }
  const shape = p.shape === 'U' ? 'U-shaped, open to the street' : 'a closed ring, the clubhouse in its gateway';
  return { els, label: (rings * rws > 1 ? rings * rws + ' courtyards' + (rws > 1 ? ' in ' + rws + ' rows' : ' side by side') : 'Courtyard') + ' · ' + shape + ', the pool in the court, parking outside', remake: sc => { const r = courtyard(R, p, fl, T, foot * sc); return r && { ...r, scale: sc }; }, key: 'court|' + (p.shape || 'O') + '|' + rings + '|' + rws + '|' + p.aspect + '|' + p.entrances };
}
export const GATE = 100, CLUB = { w: 70, d: 50 }; // ft: the gateway in a closed ring's street wing (the clubhouse and a 15 ft walk each side)
// the wing length a ring w wide and h deep holds (wings D deep, corners counted once)
export const wingLength = (shape, w, h, D) => shape === 'U' ? 2 * h + w - 2 * D : 2 * h + 2 * w - 4 * D - GATE;
// one ring between x-limits xr, with a share of the floor area; null when the ring can't be drawn about that size
function courtyard1(R, p, fl, T, foot, xr, k, behind = null, m = 0) { // behind: the back aisle (ay1) of the court in front, for a second-row court
  const { B, front } = R, shape = p.shape === 'U' ? 'U' : 'O', V = [Math.max(R.V[0], xr[0]), behind != null ? behind + AISLE - ROW - AISLE : R.V[1], Math.min(R.V[2], xr[1]), R.V[3] - R.pondDepth], D = T.D, ringW = ROW + AISLE + ROW + WALK, els = [];
  // the court inside: 150-420 ft across (a closed ring's street wings at least 70 ft each side of the gateway), 100-300 ft deep (a pool, its deck and lawn; past that the wings stand too far apart to read as one building)
  const minW = 2 * D + (shape === 'O' ? GATE + 2 * 70 : 150), minH = shape === 'O' ? 2 * D + 100 : D + CLUB.d + 100, /* (a street wing at least 70 ft (a stair stack) each side of the gateway; a U deep enough for its pool behind the clubhouse) */ capW = 2 * D + (shape === 'O' ? 420 : 320), capH = (shape === 'O' ? 2 * D : D) + 300;
  const maxW = Math.min(Math.min(B[2], V[2]) - Math.max(B[0], V[0]), V[2] - V[0] - 2 * ringW, capW), maxH = Math.min(B[3] - Math.max(B[1], V[1] + ringW), V[3] - V[1] - 2 * ringW, capH); if (maxW < minW || maxH < minH) return null;
  const need = foot / D; let w = Math.max(minW, Math.min(maxW, Math.sqrt(need * p.aspect / 2.6) * 1.3)), h = Math.max(minH, Math.min(maxH, w / p.aspect));
  for (let i = 0; i < 30; i++) { const len = wingLength(shape, w, h, D); if (Math.abs(len - need) < 4) break; const s = need / Math.max(1, len); w = Math.min(maxW, Math.max(minW, w * Math.sqrt(s))); h = Math.min(maxH, Math.max(minH, h * Math.sqrt(s))); }
  w = Math.round(w); h = Math.round(h); const len = wingLength(shape, w, h, D);
  if (len < need * 0.85 || len > need * 1.12) return null; // (it can't be drawn near the size asked: more rings, the other shape, or another arrangement)
  const cx = Math.round((V[0] + V[2]) / 2), x0 = cx - w / 2, x1 = cx + w / 2, y0 = V[1] + ringW, y1 = y0 + h; if (x0 < B[0] - 1 || x1 > B[2] + 1 || y0 < B[1] - 1 || y1 > B[3] + 1) return null;
  const wing = (a0, b0, a1, b1, side) => bld(a0, b0, a1, b1, { floors: fl, wing: side });
  // the wings: left and right the full depth, the rear between them; a closed ring's street wing in two either side of the gateway
  els.push(wing(x0, y0, x0 + D, y1, 'left'), wing(x1 - D, y0, x1, y1, 'right'), wing(x0 + D, y1 - D, x1 - D, y1, 'rear')); // (left and right as seen from the street)
  if (shape === 'O') els.push(wing(x0 + D, y0, cx - GATE / 2, y0 + D, 'street L'), wing(cx + GATE / 2, y0, x1 - D, y0 + D, 'street R'));
  // the clubhouse at the gateway (in line with the street face), the pool and its deck in the court's middle
  // (the three share a tag: a community of several courts keeps one amenity centre, lib/layoutrun.mjs oneAmenityCentre)
  const tag = 'court-amenity-' + k + '-' + m, iy0 = Math.max(y0 + (shape === 'O' ? D : 0), y0 + CLUB.d), iy1 = y1 - D, inner = iy1 - iy0; // (the court clear of the clubhouse)
  { const gy0 = y0 + (shape === 'O' ? D : 0); els.push({ kind: 'green', x: cx, y: (gy0 + iy1) / 2, w: w - 2 * D, d: iy1 - gy0, name: '', note: 'Courtyard', trees: true }); } // (the court is the building's garden, never land left for later)
  els.push({ kind: 'building', x: cx, y: y0 + CLUB.d / 2, w: CLUB.w, d: CLUB.d, use: 'amenity', floors: 1, name: 'Clubhouse', note: 'Leasing · fitness · lounge', amenityOf: tag });
  const pw = Math.min(70, w - 2 * D - 50), pd = Math.min(36, inner - 50);
  if (pw >= 40 && pd >= 24) { const py = (iy0 + iy1) / 2; els.push({ kind: 'plaza', x: cx, y: py, w: pw + 30, d: pd + 24, name: '', note: 'Pool deck', amenityOf: tag }, { kind: 'pool', x: cx, y: py, w: pw, d: pd, name: 'Pool', note: 'Courtyard pool', amenityOf: tag }); }
  // the parking ring: an aisle round the building with a row each side (the inner row against the building's walk)
  const ax0 = x0 - WALK - ROW - AISLE, ax1 = x1 + WALK + ROW, ay0 = y0 - WALK - ROW - AISLE, ay1 = y1 + WALK + ROW;
  els.push(drive(ax0, ay0, ax0 + AISLE, ay1 + AISLE), drive(ax1, ay0, ax1 + AISLE, ay1 + AISLE), drive(ax0, ay0, ax1 + AISLE, ay0 + AISLE), drive(ax0, ay1, ax1 + AISLE, ay1 + AISLE));
  els.push(rowV(ay0 + AISLE, ay1, ax0 - ROW, 1), rowV(ay0 + AISLE, ay1, ax0 + AISLE, -1), rowV(ay0 + AISLE, ay1, ax1 - ROW, 1), rowV(ay0 + AISLE, ay1, ax1 + AISLE, -1));
  // the entrances: at the ring's front corners (both), or on the gateway's axis; a corner that meets a side street (within
  // about 100 ft of it) gives way to the axis; the front row keeps clear of each throat
  const xs = p.entrances === 2 ? [...new Set([R.cornerX0 && ax0 + AISLE / 2 < R.X0 + 100 ? cx : ax0 + AISLE / 2, R.cornerX1 && ax1 + AISLE / 2 > R.X1 - 100 ? cx : ax1 + AISLE / 2])] : [cx];
  // the front rows: outside the aisle (not behind a second-row court: the front court's back row is there), and against
  // the building's street face either side of the clubhouse's walk (a drop-off in front of its door)
  if (behind == null) els.push(...splitRow(ax0 + AISLE, ax1, ay0 - ROW, 1, xs.map(x => [x - 36, x + 36]), rowH));
  els.push(...splitRow(ax0 + AISLE + ROW, ax1 - ROW, ay0 + AISLE, -1, [[cx - CLUB.w / 2 - 20, cx + CLUB.w / 2 + 20]], rowH), rowH(ax0 + AISLE, ax1, ay1 + AISLE, -1), rowH(ax0 + AISLE, ax1, ay1 - ROW, 1));
  const nm = i => k === 0 && m === 0 && i === 0 ? 'Main entry' : 'Entrance ' + (k * 2 + i + 2); if (behind == null) xs.forEach((x, i) => els.push(drive(x - 12, front - 2, x + 12, ay0 + (x === cx ? 0 : AISLE), { name: nm(i), entry: true })));
  els.ay1 = ay1; return els;
}
// a wrap: a parking garage wrapped on three sides by one apartment building (a street wing the full width, a wing down
// each side), an amenity courtyard with the pool between the street wing and the garage, the garage's back face open to
// a back drive (its entrance) that runs round to the street both sides; a short visitor / leasing row along the side
// drives. The wings are double-loaded (65 ft) at the program's floors; the garage is sized to what the homes need less
// the visitor rows, counted on the podium stall grid (lib/siteplan.mjs garageGrid), its depth cut back so it doesn't
// over-park (the courtyard takes the rest). p: { W (the building's width, ft) }.
export const WRAP = { D: 65, minC: 40, maxLevels: 6, side: WALK + AISLE }; // ft: wing depth, least courtyard, most garage levels, a side drive and its walk
function wrapOf(R, p, fl, prog, target) {
  const { B, V, front } = R, D = WRAP.D, eff = prog.eff || 0.85, unitSf = prog.unitSf || 900, per = prog.perUnit ?? 1.6, W = p.W;
  const Lw = target * unitSf / (eff * D * fl), Dtot = Math.round(D + (Lw - W) / 2); // the wing length the homes need: the street wing W, each side wing Dtot - D
  const cx = Math.round((Math.max(B[0], V[0] + WRAP.side + ROW) + Math.min(B[2], V[2] - WRAP.side - ROW)) / 2), x0 = cx - W / 2, x1 = cx + W / 2, y0 = Math.max(B[1], V[1]), y1 = y0 + Dtot;
  const backY = y1 + WALK, top = backY + AISLE; // the back drive along the garage's back face
  if (Dtot < D + WRAP.minC + 120 || W - 2 * D < 130) return null; // (a garage under 130 ft across or 120 ft deep holds too few stalls past its ramp)
  if (x0 - WRAP.side - ROW < V[0] - 0.5 || x1 + WRAP.side + ROW > V[2] + 0.5 || y1 > B[3] + 0.5 || top > V[3] - R.pondDepth + 0.5) return null;
  // the homes: the wings' floor area (units as the tally counts them)
  const wings = [bld(x0, y0, x1, y0 + D, { floors: fl, wing: 'street' }), bld(x0, y0 + D, x0 + D, y1, { floors: fl, wing: 'left' }), bld(x1 - D, y0 + D, x1, y1, { floors: fl, wing: 'right' })];
  const unitsOf = e => Math.floor(e.w * e.d * fl * eff / unitSf), units = wings.reduce((t, e) => t + unitsOf(e), 0);
  // the visitor / leasing rows along the side drives' outer side, from the street wing's front to the back drive
  const sx0 = x0 - WALK - AISLE, sx1 = x1 + WALK, rows = [rowV(y0 + 40, backY, sx0 - ROW, 1), rowV(y0 + 40, backY, sx1 + AISLE, -1)], surf = rows.reduce((t, e) => t + S.stalls({ ...e, rot: 0 }).count, 0);
  // the garage: as deep as it needs to be (the courtyard takes the rest), on as few levels as park the homes
  // (a courtyard deep enough for the pool and its deck, 60 ft, where a garage of one more level allows; else the least, 40 ft)
  const gw = W - 2 * D, need = Math.max(0, Math.ceil(units * per) - surf); let best = null;
  for (const minC of [60, WRAP.minC]) { const maxD = Dtot - D - minC; if (maxD < 120) continue;
    for (let lv = 2; lv <= Math.min(WRAP.maxLevels, fl + 1); lv++) { if (S.garageGrid(gw, maxD, lv) < need) continue;
      let gd = maxD; while (gd - 6 >= 120 && S.garageGrid(gw, gd - 6, lv) >= need) gd -= 6; best = { lv, gd, n: S.garageGrid(gw, gd, lv) }; break; }
    if (best) break; }
  if (!best) return null;
  if (best.n > need && need > 0) { const g = S.garagePlan({ w: gw, d: best.gd, levels: best.lv }), keep = Math.min(g.typical, Math.max(0, g.typical - (best.n - need) + 6)); best.last = keep; best.n = S.garageGrid(gw, best.gd, best.lv, keep); } // (the top level keeps only the spaces still needed, and six for the accessible stalls' aisles and the rows' trim: the rest storage and amenity, so the garage doesn't over-park)
  const gy0 = y1 - best.gd, wrap = 'wrap-' + Math.round(cx) + '-' + Math.round(y0), els = [];
  for (const e of wings) els.push({ ...e, wrap, court: wrap, units: unitsOf(e), name: 'Wrap · ' + e.wing + ' wing', note: 'Double-loaded corridor · wraps the garage' });
  els.push({ kind: 'garage', x: cx, y: (gy0 + y1) / 2, w: gw, d: best.gd, levels: best.lv, ...(best.last != null ? { parkLast: best.last } : {}), grid: true, wrap, name: 'Parking garage', note: best.n + ' spaces · ' + best.lv + ' levels' + (best.last != null ? ' (the top level partly storage and amenity)' : '') + ' · wrapped by the apartments' });
  // the courtyard between the street wing and the garage: lawn, the pool and its deck
  const cy0 = y0 + D, cy1 = gy0, cw = gw, ch = cy1 - cy0, ccx = cx, ccy = (cy0 + cy1) / 2;
  els.push({ kind: 'green', x: ccx, y: ccy, w: cw, d: ch, name: '', note: 'Amenity courtyard', trees: true });
  { const pw = Math.min(80, cw - 60), pd = Math.min(36, ch - 30); if (pw >= 40 && pd >= 20) els.push({ kind: 'plaza', x: ccx, y: ccy, w: pw + 30, d: Math.min(ch - 10, pd + 24), name: '', note: 'Pool deck' }, { kind: 'pool', x: ccx, y: ccy, w: pw, d: pd, name: 'Pool', note: 'Courtyard pool' }); }
  // the drives: down each side from the street to the back drive, the back drive along the garage, its entrance apron
  els.push(drive(sx0, front - 2, sx0 + AISLE, top, { name: 'Main entry', entry: true }), drive(sx1, front - 2, sx1 + AISLE, top, { name: 'Entrance 2', entry: true }), drive(sx0, backY, sx1 + AISLE, top, { name: 'Garage drive' }));
  els.push(drive(cx - 15, y1, cx + 15, backY, { name: 'Garage entry', note: 'Garage entrance · ' + best.lv + ' levels' }));
  els.push(...rows);
  return { els, units, label: 'Wrap · a ' + fl + '-story building round a ' + best.lv + '-level garage, the pool in a courtyard', key: 'wrap|' + W + '|' + fl };
}
// tuck-under rows: rows of homes each over its own 1-car garage (lib/reftemplates.mjs mf-tuckunder-2s, from E053
// Portland Road: 20 ft bays, 42 ft deep, the garages on an internal drive), set back to back in pairs across a garage
// court so both rows' garages open onto it; the fronts face front yards. The courts run between two side drives in
// from the street (the two ways in), a guest row along the outside of each; the clubhouse and pool, when asked for, in
// front by the entry. Units are exact: one home a bay, the rows shared evenly (3 to p.bays homes a building).
export const TUCK = { gap: 20, yard: 30, amen: 110 }; // ft: between buildings in a row, the front yards between pairs, the amenity strip by the street
function tuckOf(R, p, fl, prog, target) {
  const t = REF_TEMPLATES['mf-tuckunder-2s']; if (!t) return null;
  const { B, V, front } = R, bw = t.module.w, D = t.module.d, minB = t.minModules, maxB = Math.min(p.bays, t.maxModules || p.bays), per = prog.perUnit ?? 1.6, gpm = t.garagesPerModule || 1;
  const sx0 = V[0] + ROW, sx1 = V[2] - ROW - AISLE, inn = p.inner ? ROW : 0, bx0 = sx0 + AISLE + inn + WALK, bx1 = sx1 - inn - WALK, L = bx1 - bx0; // (p.inner: guest rows on the inner side of the side drives too) if (L < minB * bw) return null;
  const k = Math.floor((L + TUCK.gap) / (maxB * bw + TUCK.gap)), rem = L - k * (maxB * bw + TUCK.gap), extra = rem >= minB * bw ? Math.min(maxB, Math.floor((rem + 0.5) / bw)) : 0, cap = k * maxB + extra; if (cap < minB) return null;
  const top = Math.min(B[3], V[3] - R.pondDepth), amen = p.amen && target >= 60;
  // the rows, pair by pair, until they hold the homes asked for
  const rows = []; let y = B[1] + (amen ? TUCK.amen : 0), left = target;
  while (left > 0 && y + 2 * D + AISLE <= top + 0.5) { for (const side of [1, -1]) { if (left <= 0) break; const u = Math.min(left, cap); rows.push({ y: side > 0 ? y : y + D + AISLE, side, u, court: y + D }); left -= u; } y += 2 * D + AISLE + TUCK.yard; }
  if (!rows.length) return null;
  const last = rows[rows.length - 1]; if (last.u < minB) { if (rows.length < 2) return null; const prev = rows[rows.length - 2], need = minB - last.u; if (prev.u - need < minB) return null; prev.u -= need; last.u += need; } // (no stub row: the one before gives it homes)
  const els = [], cx = (bx0 + bx1) / 2; let units = 0, garages = 0;
  for (const r of rows) { const nb = Math.ceil(r.u / maxB), base = Math.floor(r.u / nb), more = r.u % nb, sizes = Array.from({ length: nb }, (_, i) => base + (i < more ? 1 : 0)), tot = r.u * bw + (nb - 1) * TUCK.gap; let x = cx - tot / 2;
    for (const n of sizes) { const g = Math.round(n * gpm); els.push(bld(x, r.y, x + n * bw, r.y + D, { floors: fl, units: n, tuck: g, doors: r.side, template: t.id, tplUnits: n, tplL: n * bw, modules: n, note: 'Tuck-under row · ' + n + ' homes, each over its garage · ' + fl + ' floors' })); units += n; garages += g; x += n * bw + TUCK.gap; } }
  const courts = [...new Set(rows.map(r => r.court))]; let topC = Math.max(...courts) + AISLE;
  for (const c of courts) els.push(drive(sx0, c, sx1 + AISLE, c + AISLE, { name: 'Garage court', note: 'Garage court · ' + AISLE + ' ft · the garages open onto it' }));
  // guest rows along the outside of the side drives, about as long as the guests need (the run trims the rest); where
  // the side drives up to the last court are too short for them, the drives run on to a back drive joining them (no
  // dead ends), a guest row along its far side too
  const guest = Math.max(0, Math.ceil(units * per) - garages), y0g = B[1] + 30, want = Math.ceil(Math.ceil(guest / 2) * 1.3 + 3) * 9 + 20; // (a row's planting islands take a stall in about every ten)
  const lastTop = Math.max(...rows.map(r => r.y + D)), room = V[3] - R.pondDepth - AISLE; let back = null;
  if (guest > 0 && y0g + want > topC && room >= lastTop + WALK) { const yb = Math.min(room, Math.max(lastTop + WALK, y0g + want)); back = yb; topC = yb + AISLE; els.push(drive(sx0, yb, sx1 + AISLE, yb + AISLE, { name: 'Back drive' })); }
  els.push(drive(sx0, front - 2, sx0 + AISLE, topC, { name: 'Main entry', entry: true }), drive(sx1, front - 2, sx1 + AISLE, topC, { name: 'Entrance 2', entry: true }));
  const len = Math.min(topC - y0g, want);
  if (guest > 0 && len >= 40) els.push(rowV(y0g, y0g + len, sx0 - ROW, 1), rowV(y0g, y0g + len, sx1 + AISLE, -1));
  if (p.inner && guest > 0) { const li = Math.min(topC - y0g, want); if (li >= 40) els.push(rowV(y0g, y0g + li, sx0 + AISLE, -1), rowV(y0g, y0g + li, sx1 - ROW, 1)); }
  if (back != null && guest > 0 && (p.inner ? 4 : 2) * Math.floor(len / 9.5) < guest && back + AISLE + ROW <= V[3] - R.pondDepth + 0.5) els.push(rowH(sx0 + AISLE + 2, sx1 - 2, back + AISLE, -1));
  if (amen) els.push(...amenity(cx, B[1] + 62));
  return { els, units, label: 'Tuck-under rows · ' + units + ' homes each over its own garage, ' + courts.length + ' garage court' + (courts.length > 1 ? 's' : '') + (amen ? ', the clubhouse by the entry' : ''), key: 'tuck|' + maxB + '|' + (amen ? 1 : 0) + '|' + (p.inner ? 1 : 0) + '|' + fl };
}
// vertical mixed use: one building along the street (storefronts at the build line, the sidewalk in front), shops on
// the ground floor of a stretch of it drawn to the floor area asked (its depth the building's), apartments on the floors
// above and on every floor of the rest; double-loaded (D ft). A drive down each end of the building from the street to a
// shared parking field behind (both ways in), the field's rows sized to what the shops and homes need at their own
// ratios (no shared-parking reduction). The building is one building: its pieces share a tag (mixed, court) so the
// checks read them as one. p: { at: where the shops go along it ('center' | 'left' | 'right'), D }.
export const VERT = { minAptL: 60 }; // ft: an apartment end piece shorter than this joins the shops' piece
function verticalOf(R, p, fl, prog, target) {
  const { B, V, front } = R, D = p.D, eff = prog.eff || 0.85, unitSf = prog.unitSf || 900, per = prog.perUnit ?? 1.6, rr = S.normalizeProgram({ use: 'retail' }).ratio;
  const shops = +prog.groundRetail > 0 ? +prog.groundRetail : 0, Lr = shops / D, up = fl - 1;
  const ftFloors = target * unitSf / (eff * D), La = Math.max(0, (ftFloors - Lr * up) / fl), L = Lr + La; // the apartments-only stretch, so the homes come to the count
  const xa = Math.max(B[0], V[0] + AISLE + WALK), xb = Math.min(B[2], V[2] - AISLE - WALK); if (L > xb - xa + 0.5 || Lr < 40 && shops > 0) return null;
  const cx = (xa + xb) / 2, bx0 = Math.round(p.at === 'left' ? xa : p.at === 'right' ? xb - L : cx - L / 2), bx1 = bx0 + L, y0 = B[1], y1 = y0 + D;
  if (y1 > B[3] + 0.5) return null;
  // the pieces along the street: the shops' stretch (shops below, homes above) and the apartments either side of it
  const sx0 = p.at === 'left' ? bx0 : p.at === 'right' ? bx1 - Lr : cx - Lr / 2, sx1 = sx0 + Lr, grp = 'mixed-' + Math.round(bx0) + '-' + Math.round(y0);
  const parts = []; if (sx0 - bx0 >= 1) parts.push([bx0, sx0, false]); parts.push([sx0, sx1, true]); if (bx1 - sx1 >= 1) parts.push([sx1, bx1, false]);
  for (let i = 0; i < parts.length; i++) if (!parts[i][2] && parts[i][1] - parts[i][0] < VERT.minAptL && parts.length > 1) return null; // (a stub of apartments beside the shops: another placement does better)
  const uOf = ([a, b, shop]) => Math.floor((b - a) * D * (shop ? up : fl) * eff / unitSf); const us = parts.map(uOf);
  { const short = target - us.reduce((t, u) => t + u, 0); if (short > 0 && short <= parts.length + 1) us[us.indexOf(Math.max(...us))] += short; } // (the floors' rounding: a home or two short of the count goes to the biggest piece)
  let over = us.reduce((t, u) => t + u, 0) - target; for (let i = parts.length - 1; i >= 0 && over > 0; i--) if (!parts[i][2]) { const k = Math.min(over, Math.max(0, us[i] - 1)); us[i] -= k; over -= k; } // (whole homes: the count asked, taken off an apartments-only piece)
  const els = [];
  parts.forEach(([a, b, shop], i) => els.push(bld(a, y0, b, y1, { floors: fl, units: us[i], mixed: grp, court: grp, ...(shop ? { ground: { use: 'retail', floors: 1 }, gfa: undefined, name: 'Mixed-use · shops below', note: 'Storefronts on the street · ' + up + ' floors of apartments above' } : { name: 'Apartments', note: 'Double-loaded corridor · part of the mixed-use building' }) })));
  for (const e of els) delete e.gfa;
  // the drives down each end to the field behind, the field's rows to the need
  const dl0 = bx0 - WALK - AISLE, dr0 = bx1 + WALK, units = us.reduce((t, u) => t + u, 0), need = Math.ceil(units * per + shops / 1000 * rr - 0.01);
  if (dl0 < V[0] - 0.5 || dr0 + AISLE > V[2] + 0.5) return null;
  let y = y1 + WALK, got = 0, lastAisle = null; const fx0 = dl0 + AISLE, fx1 = dr0, maxY = V[3] - R.pondDepth, rowStalls = r => S.stalls({ ...r, rot: 0 }).count;
  for (let k = 0; k < 12 && got < need * 1.02; k++) { if (y + ROW + AISLE + ROW > maxY + 0.5) break;
    const r1 = rowH(fx0 + 2, fx1 - 2, y, 1); y += ROW; const a = drive(fx0, y, fx1, y + AISLE, { name: k ? '' : 'Parking aisle' }); y += AISLE; const r2 = rowH(fx0 + 2, fx1 - 2, y, -1); y += ROW;
    els.push(r1, a, r2); lastAisle = a; got += rowStalls(r1) + rowStalls(r2); }
  if (!lastAisle || got < need * 0.9) return null;
  const top = lastAisle.y + AISLE / 2; els.push(drive(dl0, front - 2, dl0 + AISLE, top, { name: 'Main entry', entry: true }), drive(dr0, front - 2, dr0 + AISLE, top, { name: 'Entrance 2', entry: true }));
  return { els, units, label: 'Vertical mixed use · a ' + fl + '-story building on the street, ' + Math.round(shops).toLocaleString('en-US') + ' sf of shops on its ground floor and ' + units + ' apartments, shared parking behind', key: 'vertical|' + p.at + '|' + D + '|' + fl };
}
// a courtyard on a parking podium (an urban "5 over 2"): one podium over most of the buildable land, its levels parking
// as many as the homes need (lib/layoutrun.mjs podiumLevels), the floors above a U of double-loaded wings round the
// amenity deck, the base of the U along the street (lib/siteplan.mjs towerOutline, upper 'U'). A drive down one side
// from the street to the back reaches the garage entrance and the fire lane; a visitor row along it where there's room.
// Units from floor area (no reviewed podium-courtyard template: an estimate). p: { W, Dd (the podium's depth), side }.
function podiumCourt(R, p, fl, prog) {
  let best = null; for (const podium of prog.podium ? [prog.podium] : [1, 2, 3]) for (let Dd = p.Dd; Dd >= 150; Dd -= 20) { const m = podiumCourt1(R, { ...p, Dd }, fl, prog, podium); if (m && (!best || m.over < best.over - 0.005)) best = m; if (!Number.isFinite(p.target) || !m && best) break; } // (with a count asked, the podium's depth too: the shallower the podium under the same homes, the less it over-parks) // (the podium whose parking comes closest above the homes' need: one level to three)
  return best;
}
function podiumCourt1(R, p, fl, prog, podium) {
  const { B, V, front } = R, side = p.side === 'left' ? -1 : 1, lane = WALK + AISLE; if (fl < podium + 3) return null;
  const y0 = Math.max(B[1], V[1]), y1 = Math.min(y0 + p.Dd, B[3] - R.pondDepth); if (y1 - y0 < 150) return null;
  const xa = side > 0 ? B[0] : B[0] + lane, xb = side > 0 ? B[2] - lane : B[2]; let W = Math.min(p.W, xb - xa); if (W < 180) return null;
  // a count asked: the podium as long as gives exactly that many homes (the fewest parking levels that park them, the rest homes)
  const P = { eff: prog.eff, unitSf: prog.unitSf, perUnit: prog.perUnit }, unitsAt = w => { const e = { kind: 'building', x: 0, y: 0, w, d: y1 - y0, floors: fl, form: 'tower', podium, parkLevels: 'auto', upper: 'U', wd: 65 }; e.parkLevels = S.parkLevelsOf(e, P); return Math.floor(S.gfaOf(e) * (prog.eff || 0.85) / (prog.unitSf || 900)); };
  if (Number.isFinite(p.target) && unitsAt(W) < p.target) return null; // (too small for the count asked)
  if (Number.isFinite(p.target) && unitsAt(W) > p.target) { let lo = 180, hi = W; if (unitsAt(lo) > p.target) return null; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (unitsAt(m) >= p.target) hi = m; else lo = m; } W = Math.round(hi * 100) / 100; if (unitsAt(W) < p.target) W = Math.ceil(hi * 100) / 100; }
  const x0 = side > 0 ? xa : xb - W, x1 = x0 + W, dx = side > 0 ? x1 + WALK : x0 - WALK - AISLE; if (dx < V[0] - 0.5 || dx + AISLE > V[2] + 0.5) return null;
  { const e = { kind: 'building', x: 0, y: 0, w: W, d: y1 - y0, floors: fl, form: 'tower', podium, parkLevels: podium, upper: 'U', wd: 65 }, u = Math.floor(S.gfaOf(e) * (prog.eff || 0.85) / (prog.unitSf || 900)); var over = S.podiumStalls(e) / Math.max(1, Math.ceil(Math.max(u, Number.isFinite(p.target) ? p.target : 0) * (prog.perUnit ?? 1.6))); /* (the count asked: the homes are sized to it after) */ if (over < 1) return null; } // (every podium level parking, and a visitor row, still short: not this one)
  const els = [{ kind: 'building', x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: W, d: y1 - y0, use: 'multifamily', floors: fl, form: 'tower', podium, parkLevels: 'auto', upper: 'U', wd: 65, name: '', note: (fl - podium) + ' floors of apartments round a courtyard deck, over a ' + podium + '-level podium' }];
  const top = Math.min(y1 + 30, V[3] - R.pondDepth); els.push(drive(dx, front - 2, dx + AISLE, top, { name: 'Main entry', entry: true, note: 'Drive to the garage and the fire lane' }));
  const rx = side > 0 ? dx + AISLE : dx - ROW; if (rx >= V[0] - 0.5 && rx + ROW <= V[2] + 0.5) els.push(rowV(y0 + 30, top - 4, rx, side > 0 ? -1 : 1)); // (a visitor row on the drive's outer side)
  return { els, label: 'Courtyard on a podium · ' + (fl - podium) + ' floors round an amenity deck over a ' + podium + '-level podium', over, key: 'podcourt|' + podium + '|' + Math.round(W) + '|' + Math.round(y1 - y0) + '|' + p.side };
}
// buildings along the edges of an irregular site: a wedge or a skewed lot gets a strip of bars along each long lot line,
// each strip squared to its own line (one frame can only square to one), as built on wedge sites (Sierra Vista WB-32:
// buildings set along both long sides). A strip is the bars at the line's building setback, a walk, a parking row, the
// aisle and a row beyond it; along the street the order turns round (the parking first, the bars behind it). Strips
// are laid longest line first, each kept clear of the ones before; the aisles are joined by short connectors, the main
// entry comes in square from the street to the nearest aisle, the clubhouse and pool go in the land between. Frame feet;
// the pieces carry rotL (their line's angle in the frame). p: { type, edges (how many lines, longest first) }.
function alongEdges(F, R, p, fl, T, front) {
  const ring = F.rr, n = ring.length, buildIn = S.insetRing(ring, F.build), paveIn = S.insetRing(ring, F.pave); if (!(buildIn?.length >= 3) || !(paveIn?.length >= 3)) return null;
  const D = T.D, els = [], strips = [], aisles = [], foot = [], ccw = S.signedArea(ring) > 0; // aisles: { a, b } centre lines in the frame
  // the site's lines: runs of edges turning less than 30° from the run's first (a curved street drawn as chords is one line)
  const dir = i => { const a = ring[i], b = ring[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; }, turn = (u, v) => Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]))) * 180 / Math.PI;
  let st = 0; { let worst = -1; for (let i = 0; i < n; i++) { const t = turn(dir((i - 1 + n) % n), dir(i)); if (t > worst) { worst = t; st = i; } } } // (start where the outline turns most)
  const lines = []; for (let j = 0; j < n;) { const i0 = (st + j) % n, d0 = dir(i0), ks = [i0]; j++; while (j < n && turn(d0, dir((st + j) % n)) < 30) { ks.push((st + j) % n); j++; } lines.push(ks); }
  const lineOf = ks => { const a = ring[ks[0]], b = ring[(ks[ks.length - 1] + 1) % n]; return { ks, a, b, L: Math.hypot(b[0] - a[0], b[1] - a[1]) }; };
  const order = lines.map(lineOf).filter(l => l.L >= 250).sort((x, y) => y.L - x.L || x.ks[0] - y.ks[0]).slice(0, p.edges); if (p.flip && order.length > 1) order.push(order.shift()); // (flip: the longest line laid last, the others first)
  const barK = new Map(); // (each bar's lot line: tryOne's bar left out, the strip it leaves with no bar redrawn without it)
  for (const ln of order) {
    const k = ln.ks.includes(front) ? front : ln.ks[0]; if (p.skip?.includes(k)) continue; let a = ln.a, b = ln.b; const L = ln.L; let u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const nIn = ccw ? [-u[1], u[0]] : [u[1], -u[0]]; // (inward: left of the outline's direction when it runs counter-clockwise)
    let ang = Math.atan2(u[1], u[0]) * 180 / Math.PI; if (ang < 0 || ang >= 180) { [a, b] = [b, a]; u = [-u[0], -u[1]]; ang = Math.atan2(u[1], u[0]) * 180 / Math.PI; } // (an angle in [0, 180): the rows' sides read the same way everywhere)
    const sg = (-u[1] * nIn[0] + u[0] * nIn[1]) > 0 ? 1 : -1, P = (s, t) => [a[0] + u[0] * s + nIn[0] * t, a[1] + u[1] * s + nIn[1] * t];
    const sag = Math.max(0, ...ln.ks.slice(1).map(i => (ring[i][0] - a[0]) * nIn[0] + (ring[i][1] - a[1]) * nIn[1])); // (a line that bows into the site: the strip starts past its deepest point)
    const isFront = ln.ks.includes(front), bIn = Math.max(...ln.ks.map(i => F.build[i]), 0.5) + sag + (ln.ks.length > 1 ? 6 : 0), pIn = Math.max(...ln.ks.map(i => F.pave[i]), 0.5) + sag + (ln.ks.length > 1 ? 6 : 0);
    // the strip across: [t0, t1] bands, the bars and the paving
    // p.bays double-loaded bays of parking (a row, the aisle, a row), the bars at the line (or, along the street, behind the bays)
    let nBays = p.bays; const bays = t00 => { const t0 = isFront && p.thr ? Math.max(t00, p.thr - ROW) : t00; /* (p.thr: along the street, the first aisle that far in, the entry's throat clear: generate's throat pass) */ const rows = [], aisles = []; let t = t0; for (let i = 0; i < nBays; i++) { rows.push([t, t + ROW, sg]); aisles.push([t + ROW, t + ROW + AISLE]); rows.push([t + ROW + AISLE, t + 2 * ROW + AISLE, -sg]); t += 2 * ROW + AISLE; } return { rows, aisles, end: t }; };
    // the most bays (up to p.bays) that still leave a run long enough for a bar: a wedge's lines converge, so a strip
    // along one may have room for fewer bays than the others
    // where even one bay won't fit beside the strips before it (a narrow wedge), a strip of bars alone, set a walk off an
    // earlier strip's paving and facing it: that strip's rows park them (as on wedge sites the bars along both lines
    // face one shared parking field)
    let bands, depth, best = null; const taken = foot.map(f => S.grow(f, 14)), near = foot.map(f => S.grow(f, 6)), facing = foot.map(f => S.grow(f, 40));
    for (nBays = p.bays; nBays >= (strips.length && (!isFront || p.frontBars) ? 0 : 1); nBays--) {
    bands = isFront && !p.frontBars ? (() => { /* (along the street: the parking first, the bars behind it; p.frontBars: the bars on the street, the parking behind them) */ const bb = bays(pIn + 2), b0 = Math.max(bb.end + WALK, bIn); return { bar: [b0, b0 + D], ...bb }; })()
      : (() => { const b0 = bIn + 2, bb = bays(b0 + D + WALK); return { bar: [b0, b0 + D], ...bb }; })();
    bands.aisle = bands.aisles[0];
    depth = Math.max(bands.bar[1], bands.end);
    const ok = s => { const pts = [P(s, bands.bar[0]), P(s, bands.bar[1])]; if (!pts.every(q => S.inRing(q, buildIn))) return false;
      if (!nBays) { const bt = [bands.bar[0], (bands.bar[0] + bands.bar[1]) / 2, bands.bar[1]]; return !bt.some(t => near.some(f => S.inRing(P(s, t), f))) && facing.some(f => S.inRing(P(s, bands.bar[1] + 20), f)); } // (bars alone: clear of the paving, facing it within reach)
      const pv = [P(s, bands.rows[0][0]), ...bands.aisles.flatMap(A => [P(s, A[0]), P(s, A[1])]), P(s, bands.end)]; if (!pv.every(q => S.inRing(q, paveIn))) return false;
      return ![0, depth / 2, depth].some(t => taken.some(f => S.inRing(P(s, t), f))); };
    best = null; let run = null; for (let s = 0; s <= L; s += 6) { if (ok(s)) { run = run ? [run[0], s] : [s, s]; if (!best || run[1] - run[0] > best[1] - best[0]) best = run.slice(); } else run = null; }
    if (best && best[1] - best[0] >= T.minL + (nBays ? 40 : 12)) break; } // (bars alone need no drives across their ends)
    const slack = nBays ? 40 : 0; if (!best || best[1] - best[0] < T.minL + slack + 12) continue;
    const [s0, s1] = [best[0] + 6, best[1] - 6], Lr = s1 - s0, rect = (sa, sb, ta, tb, o) => { const c = P((sa + sb) / 2, (ta + tb) / 2); return { x: c[0], y: c[1], w: sb - sa, d: tb - ta, rotL: ang, ...o }; };
    // the bars: as many as fit at their shortest, each then as long as the run allows (the rows run past them to the aisle's ends)
    const nb = Math.max(1, Math.floor((Lr - slack + T.gap) / (T.minL + T.gap))), len = Math.min(T.maxL, (Lr - slack - (nb - 1) * T.gap) / nb); if (len < T.minL) continue;
    const tot = nb * len + (nb - 1) * T.gap, sb0 = s0 + (Lr - tot) / 2;
    for (let i = 0; i < nb; i++) { const bl = { kind: 'building', ...rect(sb0 + i * (len + T.gap), sb0 + i * (len + T.gap) + len, bands.bar[0], bands.bar[1]), use: 'multifamily', floors: fl }; els.push(bl); barK.set(bl, k); }
    for (const [t0, t1, side] of bands.rows) els.push({ kind: 'parking', ...rect(s0 + AISLE + 2, s1 - AISLE - 2, t0, t1), row: side, lock: true, islands: true });
    for (const A of bands.aisles) { els.push({ kind: 'drive', ...rect(s0, s1, A[0], A[1]) }); const am = (A[0] + A[1]) / 2; aisles.push({ a: P(s0 + AISLE / 2, am), b: P(s1 - AISLE / 2, am), k }); }
    // the aisles' ends turn: a drive across the bays at each end, so every aisle and row end is reached (no dead end)
    if (bands.rows.length) for (const se of [s0, s1 - AISLE]) els.push({ kind: 'drive', ...rect(se, se + AISLE, bands.rows[0][0], bands.end) });
    const fp = [P(s0, 0), P(s1, 0), P(s1, depth), P(s0, depth)]; foot.push(fp); strips.push({ k, s0, s1, c0: s0, c1: s1, nb, P, sg, rect, bands, depth, isFront, L, fi: foot.length - 1 });
  }
  const W_ = globalThis.SP_DEBUG ? (...a) => console.log('  edgesdbg', p.type, p.edges, p.bays, p.flip, ...a) : () => {}; W_('strips', strips.length, order.length);
  if (strips.length < (p.skip?.length ? 1 : 2)) return null; // (one strip is what the one-frame layouts already make; p.skip: a strip whose bar was left out, its land given to the others' bays and the pond)
  const solid = () => els.filter(e => e.kind === 'building').map(e => S.corners({ ...e, rot: e.rotL || 0 }));
  const segNear = (q, s) => { const [a, b] = [s.a, s.b], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return [a[0] + dx * t, a[1] + dy * t]; };
  // cut the parking a new drive runs across (whole stalls, at least three left in a piece)
  const cutRows = band => { for (const r of els.filter(e => e.kind === 'parking')) { const c = S.corners({ ...r, rot: r.rotL || 0 }); if (!S.rectsOverlap({ poly: c }, { poly: band }, 0.5)) continue;
      const th = (r.rotL || 0) * Math.PI / 180, ux = [Math.cos(th), Math.sin(th)], pr = band.map(q => (q[0] - r.x) * ux[0] + (q[1] - r.y) * ux[1]), lo = Math.max(-r.w / 2, Math.min(...pr) - 2), hi = Math.min(r.w / 2, Math.max(...pr) + 2);
      const pieces = [[-r.w / 2, lo], [hi, r.w / 2]].filter(([x0, x1]) => x1 - x0 >= 54); /* (a piece of at least six stalls: shorter stubs go) */ els.splice(els.indexOf(r), 1);
      for (const [x0, x1] of pieces) els.push({ ...r, x: r.x + ux[0] * (x0 + x1) / 2, y: r.y + ux[1] * (x0 + x1) / 2, w: x1 - x0 }); } };
  const pathBand = (p0, p1, w) => { const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1, nx = -(p1[1] - p0[1]) / L * w / 2, ny = (p1[0] - p0[0]) / L * w / 2; return [[p0[0] + nx, p0[1] + ny], [p1[0] + nx, p1[1] + ny], [p1[0] - nx, p1[1] - ny], [p0[0] - nx, p0[1] - ny]]; };
  const clearOf = band => !solid().some(c => S.rectsOverlap({ poly: S.grow(c, 4) }, { poly: band }, 0.5)) && band.every(q => S.inRing(q, paveIn));
  // more parking where the land between the strips allows: a further bay on each strip's inner side, as long as the land
  // there gives it (a wedge widens away from its point), reached by a drive across at each of its ends from the aisle
  // before it (the stalls under that drive go). Kept clear of the other strips, the buildings and the paving line.
  // (along the street the bays are in front of the bars, so its further bays go behind the bars, a walk past them; a
  // bay may run on past its strip's ends where the land does; the drives in to it come from the aisle before it only
  // where that aisle runs and no building stands in the way: one way in is enough for a leaf of parking)
  if (p.more !== false) for (const sp of strips) { let behind = !!sp.isFront && !p.frontBars; if (!sp.bands.aisles.length) continue; // (bars alone: parked by the strip they face)
    for (let extra = 0; extra < 3; extra++) {
      const t0 = sp.depth + (behind ? WALK + 2 : 0), rowsT = [[t0, t0 + ROW, sp.sg], [t0 + ROW + AISLE, t0 + 2 * ROW + AISLE, -sp.sg]], aisleT = [t0 + ROW, t0 + ROW + AISLE], t1 = t0 + 2 * ROW + AISLE;
      const others = foot.filter((_, i) => i !== sp.fi).map(f => S.grow(f, 10)), blds = solid().map(c => S.grow(c, 8));
      const okS = s => [t0 + 1, (t0 + t1) / 2, t1].every(t => { const q = sp.P(s, t); return S.inRing(q, paveIn) && !others.some(f => S.inRing(q, f)) && !blds.some(f => S.inRing(q, f)); });
      let best = null, run = null; for (let s = 0; s <= sp.L; s += 6) { if (okS(s)) { run = run ? [run[0], s] : [s, s]; if (!best || run[1] - run[0] > best[1] - best[0]) best = run.slice(); } else run = null; }
      if (!best || best[1] - best[0] < 2 * AISLE + 80) break;
      const a0 = best[0] + 3, a1 = best[1] - 3, prevA = sp.bands.aisles[sp.bands.aisles.length - 1];
      const lo = Math.max(a0, sp.c0), hi = Math.min(a1, sp.c1) - AISLE; if (hi < lo) break; // (where the aisle before runs too)
      const clearEnd = e => { const c = S.corners({ ...e, rot: e.rotL || 0 }); return c.every(q => S.inRing(q, paveIn)) && !solid().some(b => S.rectsOverlap({ poly: S.grow(b, 4) }, { poly: c }, 0.5)); };
      const ends = [...new Set([lo, hi])].map(se => sp.rect(se, se + AISLE, prevA[0], t1)).filter(clearEnd); if (!ends.length) break;
      const g = 'bay-' + sp.k + '-' + extra; // (a leaf: its rows, its aisle and the drives in to it, taken out together if its rows all go)
      for (const [r0, r1, side] of rowsT) els.push({ kind: 'parking', ...sp.rect(a0 + AISLE + 2, a1 - AISLE - 2, r0, r1), row: side, lock: true, islands: true, bayGroup: g });
      els.push({ kind: 'drive', ...sp.rect(a0, a1, aisleT[0], aisleT[1]), bayGroup: g }); // (not one of the aisles the joins and the entry go to: it's a leaf)
      for (const e of ends) { cutRows(S.corners({ ...e, rot: e.rotL || 0 })); els.push({ kind: 'drive', ...e, bayGroup: g }); }
      behind = false; sp.bands = { ...sp.bands, aisles: [...sp.bands.aisles, aisleT] }; sp.depth = t1; sp.c0 = a0; sp.c1 = a1; sp.s0 = Math.min(sp.s0, a0); sp.s1 = Math.max(sp.s1, a1); foot[sp.fi] = [sp.P(sp.s0, 0), sp.P(sp.s1, 0), sp.P(sp.s1, t1), sp.P(sp.s0, t1)];
    } }
  // join the aisles: each later strip's nearer end to the nearest point of the ones before it
  for (let j = 1; j < aisles.length; j++) { let pick = null;
    for (const end of [aisles[j].a, aisles[j].b]) for (let i = 0; i < j; i++) { const q = segNear(end, aisles[i]), d = Math.hypot(q[0] - end[0], q[1] - end[1]), band = pathBand(end, q, AISLE); if (d > 400 || !clearOf(band)) continue; if (!pick || d < pick.d) pick = { end, q, d, band }; }
    if (!pick) { W_('no join', j); return null; } if (pick.d > 4) { cutRows(pick.band); els.push({ kind: 'drive', path: [pick.end, pick.q], width: AISLE, r: 0, name: '', note: AISLE + ' ft drive' }); } }
  // the main entry: square in from the street to the nearest aisle, the spot nearest the street's middle that's clear
  const fa = ring[front], fb = ring[(front + 1) % n], FL = Math.hypot(fb[0] - fa[0], fb[1] - fa[1]), fu = [(fb[0] - fa[0]) / FL, (fb[1] - fa[1]) / FL]; let fn = [-fu[1], fu[0]]; if (!S.inRing([(fa[0] + fb[0]) / 2 + fn[0] * 3, (fa[1] + fb[1]) / 2 + fn[1] * 3], ring)) fn = [fu[1], -fu[0]];
  const drvs = els.filter(e => e.kind === 'drive').map(e => e.path ? pathBand(e.path[0], e.path[e.path.length - 1], e.width || AISLE) : S.corners({ ...e, rot: e.rotL || 0 })), thrE = p.thr || 50;
  const firstCross = (p0, q) => { const L = Math.hypot(q[0] - p0[0], q[1] - p0[1]) || 1; for (let t = 1; t <= L; t += 2) { const pt = [p0[0] + (q[0] - p0[0]) * t / L, p0[1] + (q[1] - p0[1]) * t / L]; if (drvs.some(d => S.inRing(pt, d))) return t; } return L; }; // (how far in the way in runs before a drive crosses it: the entry's throat)
  let entry = null; for (let s = 60; s <= FL - 60; s += 10) { const p0 = [fa[0] + fu[0] * s - fn[0] * 2, fa[1] + fu[1] * s - fn[1] * 2]; let hit = null;
    for (const A of aisles) { const q = segNear(p0, A), v = [q[0] - p0[0], q[1] - p0[1]], dd = Math.hypot(...v); if (dd < 1 || (v[0] * fn[0] + v[1] * fn[1]) / dd < 0.97) continue; if (!hit || dd < hit.d) hit = { q, d: dd }; } // (square to the street, within 14°)
    if (!hit || hit.d > 500) continue; const band = pathBand(p0, hit.q, 30); if (solid().some(c => S.rectsOverlap({ poly: S.grow(c, 4) }, { poly: band }, 0.5))) continue;
    const sc = Math.abs(s - FL / 2) + hit.d * 0.5 + (p.entThr ? Math.max(0, Math.min(thrE, hit.d) - firstCross(p0, hit.q)) * 10 : 0); if (!entry || sc < entry.sc) entry = { p0, q: hit.q, band, sc }; } // (p.entThr: a drive crossing the way in inside its stacking length (p.thr, else 50 ft) costs 10 a foot short; edgeTry keeps it where it costs no homes or parking)
  if (!entry) { W_('no entry'); return null; } cutRows(S.grow(entry.band, 8)); els.push({ kind: 'drive', path: [entry.p0, entry.q], width: 30, r: 0, name: 'Main entry', entry: true, note: '30 ft driveway' });
  // the clubhouse and pool: the clear land nearest the entry, within reach of an aisle
  { const taken2 = els.filter(e => e.kind !== 'green').map(e => e.path ? pathBand(e.path[0], e.path[e.path.length - 1], (e.width || AISLE)) : S.corners({ ...e, rot: e.rotL || 0 }));
    const xs = buildIn.map(q => q[0]), ys = buildIn.map(q => q[1]); let am = null;
    for (let x = Math.min(...xs) + 40; x <= Math.max(...xs) - 40; x += 20) for (let y = Math.min(...ys) + 60; y <= Math.max(...ys) - 40; y += 20) {
      const club = box(x - 30, y - 15, x + 30, y + 35), pool = box(x - 40, y - 72, x + 40, y - 20); if (![...club, ...pool].every(q => S.inRing(q, buildIn))) continue;
      if (taken2.some(t => S.rectsOverlap({ poly: S.grow(club, 10) }, { poly: t }, 0.5) || S.rectsOverlap({ poly: S.grow(pool, 8) }, { poly: t }, 0.5))) continue;
      const reach = Math.min(...aisles.map(A => { const q = segNear([x, y + 10], A); return Math.hypot(q[0] - x, q[1] - y - 10); })); if (reach > 90) continue;
      const sc = Math.hypot(x - entry.q[0], y - entry.q[1]); if (!am || sc < am.sc) am = { x, y, sc }; }
    if (am) els.push(...amenity(am.x, am.y)); }
  const units = els.filter(e => e.kind === 'building' && e.use === 'multifamily').length;
  return { els, barK, label: 'Along the edges · ' + T.label + ' along ' + strips.length + (strips.length > 1 ? ' lot lines, each squared to its own' : ' lot line'), key: 'edges|' + (p.frontBars ? 'fb|' : '') + p.type + '|' + p.edges + '|' + p.bays + '|' + (p.flip ? 'f|' : '') + strips.map(s => s.k + ':' + s.nb).join(',') + '|' + units };
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
// the finish the search gives its layouts (lib/sitelayout.mjs): where an aisle ends in a drive square to it (an L, not a
// T; R 42 ft on a 24 ft lane, its legs twice that (S.fillet rounds at most half a leg): a fire truck's 30 ft inside and
// 50 ft outside radius stay on the paving)
// T), the corner is a curve of radius R (a short path drive, the two straight pieces cut back to meet it), as the
// search's aisle-end hooks are; apartment bars get the search's staggered front (jog). In frame feet, axis-aligned
// drives only; the entrances, curb pieces and drives already drawn as paths are left as they are.
export function finishGen(els, { curveR = 30, jog = true } = {}) {
  const R = +curveR || 0, plain = e => e.kind === 'drive' && !e.path && !e.poly && !e.entry && !/^(Main entry|Entrance)/.test(e.name || '') && +e.w > 0 && +e.d > 0 && !e.rot;
  if (R > 0) { const D = els.filter(plain), box = e => [e.x - e.w / 2, e.y - e.d / 2, e.x + e.w / 2, e.y + e.d / 2], used = new Set(), add = [];
    for (const a of D) for (const b of D) { if (a === b || used.has(a) || used.has(b) || !(a.w > a.d) || !(b.d > b.w)) continue; // a runs along x, b along y
      const A = box(a), B = box(b), ix0 = Math.max(A[0], B[0]), ix1 = Math.min(A[2], B[2]), iy0 = Math.max(A[1], B[1]), iy1 = Math.min(A[3], B[3]);
      if (ix1 - ix0 < b.w - 1 || iy1 - iy0 < a.d - 1) continue; // (b crosses a's whole width and a b's: they meet at a square)
      const aEnd = Math.abs(ix0 - A[0]) < 1 ? -1 : Math.abs(ix1 - A[2]) < 1 ? 1 : 0, bEnd = Math.abs(iy0 - B[1]) < 1 ? -1 : Math.abs(iy1 - B[3]) < 1 ? 1 : 0; if (!aEnd || !bEnd) continue; // (the square at an end of each: an L)
      const c = [(ix0 + ix1) / 2, (iy0 + iy1) / 2], W = Math.min(a.d, b.w), L1 = 2 * R + 2, da = -aEnd, db = -bEnd; // (each runs away from the corner)
      if (a.w / 2 - Math.abs(c[0] - a.x) < 0 || a.w - (L1 + (ix1 - ix0) / 2) < 30 || b.d - (L1 + (iy1 - iy0) / 2) < 30) continue;
      if (D.some(o => o !== a && o !== b && (() => { const O = box(o); return O[0] < ix1 + 1 && O[2] > ix0 - 1 && O[1] < iy1 + 1 && O[3] > iy0 - 1; })())) continue; // (a third drive at the corner: a T, left square)
      const na = aEnd < 0 ? [c[0] + da * (L1 - 1), A[2]] : [A[0], c[0] + da * (L1 - 1)], nb = bEnd < 0 ? [c[1] + db * (L1 - 1), B[3]] : [B[1], c[1] + db * (L1 - 1)];
      Object.assign(a, { x: (na[0] + na[1]) / 2, w: Math.abs(na[1] - na[0]) }); Object.assign(b, { y: (nb[0] + nb[1]) / 2, d: Math.abs(nb[1] - nb[0]) }); used.add(a); used.add(b);
      add.push({ kind: 'drive', path: [[c[0] + da * L1, c[1]], c, [c[0], c[1] + db * L1]], width: W, r: R, name: '', note: W + ' ft drive', x: c[0], y: c[1], w: L1, d: L1 }); }
    els.push(...add); }
  if (jog) for (const e of els) if (e.kind === 'building' && e.use === 'multifamily' && !e.form && !e.court && !e.wrap && !e.mixed && !(+e.tuck > 0) && !e.ground && !e.upper && e.w >= e.d && e.w > 90) e.jog = 5;
  return els;
}
// ---------- the grid, the fit to the count asked, the ranking ----------
// the buildings cut to the count asked: each one shortened in step until the units come down to it (never under its type's shortest)
function fitCount(els, T, target, unitSf, fl) {
  const units = () => els.filter(e => e.kind === 'building' && e.use === 'multifamily').reduce((t, e) => t + Math.floor(e.w * e.d * (e.floors || fl) * 0.85 / unitSf), 0);
  // drawn to a template's modules (T.step: the reviewed bay): shortened a whole module at a time, the longest bar first,
  // so what's left still snaps to the template whole (a 229 ft bar of 50 ft bays holds four, 200 ft: its homes were lost)
  if (T.step > 0) { for (let k = 0; k < 400 && units() > target * 1.04; k++) { const bs = els.filter(e => e.kind === 'building' && e.use === 'multifamily' && Math.max(e.w, e.d) - T.step >= T.minL - 0.5).sort((a, b) => Math.max(b.w, b.d) - Math.max(a.w, a.d) || a.x - b.x || a.y - b.y); if (!bs.length) break; const e = bs[0], long = e.w >= e.d ? 'w' : 'd'; e[long] = +(e[long] - T.step).toFixed(2); } return units(); }
  for (let k = 0; k < 12 && units() > target * 1.04; k++) { const s = Math.max(0.6, Math.sqrt(target / units()) ** 1.0); for (const e of els) if (e.kind === 'building' && e.use === 'multifamily') { const long = e.w >= e.d ? 'w' : 'd', L = e[long]; e[long] = Math.max(T.minL, L * (0.5 + s / 2)); } }
  return units();
}
// the rows cut back to what the buildings need (a tenth over): whole rows farthest from any building first, then the
// longest rows shortened from the end away from the buildings
// the 90th-percentile walk of a generated layout (frame coordinates, rotL): stall to the nearest wall of a home building
// (lib/layoutrun.mjs walkP90 on the finished plan)
function genWalk90(els) {
  const bl = els.filter(e => e.kind === 'building' && e.use !== 'amenity').map(e => S.corners({ ...e, rot: e.rotL || 0 })); if (!bl.length) return 0; const ds = [];
  for (const e of els) { if (e.kind !== 'parking') continue; let cs = []; try { cs = S.stallCentres({ ...e, rot: e.rotL || 0 }); } catch { cs = []; }
    for (const q of cs) { let m = Infinity; for (const r of bl) for (let k = 0; k < r.length; k++) m = Math.min(m, S.segDist(q, r[k], r[(k + 1) % r.length])); ds.push(m); } }
  if (!ds.length) return 0; ds.sort((a, b) => a - b); return ds[Math.min(ds.length - 1, Math.floor(0.9 * (ds.length - 1) + 0.5))];
}
function trimRows(els, need) {
  const B = els.filter(e => e.kind === 'building'), stallsOf = e => S.stalls({ ...e, rot: 0 }).count, total = () => els.filter(e => e.kind === 'parking').reduce((t, e) => t + stallsOf(e), 0);
  const dist = e => Math.min(...B.map(b => Math.hypot(b.x - e.x, b.y - e.y)));
  for (let k = 0; k < 40 && total() > need * 1.1; k++) { const rows = els.filter(e => e.kind === 'parking').sort((a, b) => dist(b) - dist(a)), r = rows[0]; if (!r) break; const over = total() - need * 1.05, n = stallsOf(r);
    if (n <= over) { els.splice(els.indexOf(r), 1); continue; } const cut = Math.max(0, Math.floor(over)) * 9; if (cut < 27) break; // (shorten: the end away from the buildings)
    const th = (r.rotL || 0) * Math.PI / 180, ux = !r.rotL ? [1, 0] : r.rotL === 90 ? [0, 1] : [Math.cos(th), Math.sin(th)], nx = B.reduce((t, b) => t + b.x, 0) / Math.max(1, B.length), ny = B.reduce((t, b) => t + b.y, 0) / Math.max(1, B.length); // (along the row's own line: a row turned to an edge of a wedge too)
    r.w = r.w - cut; const d = ((nx - r.x) * ux[0] + (ny - r.y) * ux[1] > 0 ? 1 : -1) * cut / 2; r.x += ux[0] * d; r.y += ux[1] * d; }
  // a bay added as a leaf (lib/sitegen.mjs alongEdges' extra bays) whose rows all went: its aisle and the drives in to it go
  // too (no empty paving left; nothing else is reached through it)
  const groups = new Set(els.filter(e => e.bayGroup != null && e.kind === 'drive').map(e => e.bayGroup));
  for (const g of groups) if (!els.some(e => e.kind === 'parking' && e.bayGroup === g)) for (const e of els.filter(x => x.kind === 'drive' && x.bayGroup === g)) els.splice(els.indexOf(e), 1);
}
// the programs the generator lays out (apartments, shops, flex and warehouse parks, self storage: one use, sized)
export const covers = prog => (prog.use === 'multifamily' || COM.USES.includes(prog.use)) && !prog.zones && !prog.anchor && (!prog.max || !!prog.plaza);
export function generate(plan, prog, ctx, H, opts = {}) {
  const D = globalThis.SP_DEBUG ? (...a) => console.log('  gen', ...a) : () => {};
  if (ctx.foot == null && prog.plaza) ctx = { ...ctx, foot: S.ringArea(plan.ring) * 0.12 / (prog.floors || 1) }; // (a plaza with no size named: about FAR 0.12 of the lot)
  const com = COM.USES.includes(prog.use); if (!(prog.use === 'multifamily' || com) || ctx.foot == null && prog.use !== 'multifamily' || prog.zones || prog.anchor) { D('not for', prog.use, ctx.foot); return []; } // (apartments with no count, as many as fit: the arrangements drawn full, each parked down to what its rows hold; before, the generator sat out and as many as fit only ever saw the search's layouts, fewer homes than an exact count drew)
  const F = H.frameOf(plan, false, 'front'); if (!F || F.deep) { D('frame', !!F, F?.deep); return []; } let R = rects(F, H); if (!R) D('no rectangles', F.X0, F.X1, F.Y0, F.Y1); if (R) { const A = (R.V[2] - R.V[0]) * (R.V[3] - R.V[1]); R.pondShare = Math.min(0.45, Math.max(0.12, ctx.pond * 1.5 / A)); R.pondDepth = ctx.pond > 3000 ? Math.min((R.V[3] - R.V[1]) * 0.4, Math.max(80, ctx.pond * 1.4 / (R.V[2] - R.V[0]))) : 0; } const odd = !com && F.site / ((F.X1 - F.X0) * (F.Y1 - F.Y0)) < 0.8; // (an irregular lot: a wedge, a skew, an L — the strips along its edges are tried too)
  if (!R && odd) R = { front: F.Y0, pondShare: 0, pondDepth: 0, stub: true };
  if (!R) { const P = H.profile(F); D('no rects', P.p, P.b, [-240, -200, -100, 0, 100, 200, 240].map(y => y + ':' + JSON.stringify(H.spans(F, y, y + 0.5, 'build').map(v => v.map(Math.round)))).join(' '), 'Y', F.Y0, F.Y1, 'X', F.X0, F.X1, 'build', F.build, 'rules', F.rules.map(r => r.role)); return []; } D('rects', R);
  const fl = prog.floors || 3, target = opts.edgesOnly || opts.podiumCourt && !prog.units || !com && !prog.units && ctx.foot == null ? Infinity : prog.units || Math.floor(ctx.foot * fl * 0.85 / prog.unitSf), out = [], seen = new Set(), t0 = CX.now(), budget = opts.budgetMs ?? 20000;
  // the building sizes the run gives (a templated apartment form, lib/layoutbrief.mjs toEngine: its depth, whole modules
  // long, never under the smallest reviewed building): the bars and walk-ups drawn to them, so none is dropped when the
  // run snaps them to the template (as many as fit lost every building of a generated layout that way)
  const pp = plan.params || {}, sized = t => pp.bldgDepth > 0 ? { ...t, D: +pp.bldgDepth, minL: Math.max(t.minL, +pp.minLen || 0), maxL: Math.max(+pp.minLen || 0, Math.min(t.maxL, +pp.maxLen || t.maxL)), step: +pp.unitW || 0 } : t;
  const TY = { bar: sized(TYPES.bar), garden: sized(TYPES.garden), wing: TYPES.wing };
  const few = u => Number.isFinite(target) ? u < target * 0.6 : !(u > 0); // (too few of the count asked; as many as fit: none at all)
  let bestU = 0;
  const tryOne = (made, p) => { if (!made || seen.has(made.key)) { D('skip', p.type, p.rows || p.n || p.aspect, made ? 'twin' : 'null'); return; } seen.add(made.key);
    if (com) { if (made.placed < ctx.foot * 0.6) { D('few', made.key, Math.round(made.placed), 'of', Math.round(ctx.foot)); return; } } else if (p.type === 'wrap' || p.type === 'tuck' || p.type === 'vertical' || p.type === 'podium') { if (made.units != null && few(made.units)) return; } else { const units = fitCount(made.els, TY[p.type || 'bar'], p.type === 'wing' ? Infinity : target, prog.unitSf, fl); /* (a courtyard building is drawn to its size: never chopped, which pulls its wings apart) */ if (few(units) && !(p.edges && !prog.units && F.site / ((F.X1 - F.X0) * (F.Y1 - F.Y0)) < 0.65)) { D('few', made.key, units); return; } /* (strips along a wedge's edges, as many as fit: judged against the other layouts, not the footprint estimate a wedge never reaches) */ }
    { const t = H.tally(made.els, prog), before = made.els.filter(e => e.kind === 'parking').reduce((q, e) => q + S.stalls({ ...e, rot: 0 }).count, 0); trimRows(made.els, t.need); D('trim', made.key, 'need', t.need, 'units', t.units, 'stalls', before, '->', made.els.filter(e => e.kind === 'parking').reduce((q, e) => q + S.stalls({ ...e, rot: 0 }).count, 0)); }
    if (!com && p.type !== 'wrap' && p.type !== 'tuck' && p.type !== 'vertical' && p.type !== 'podium') for (let k = 0; k < 4; k++) { const t2 = H.tally(made.els, prog); if (!(t2.stalls < t2.need && t2.need > 0)) break; const u2 = Math.floor(t2.units * t2.stalls / t2.need * 0.96);
      if (p.edges && fitCount(made.els, TY[p.type || 'bar'], u2, prog.unitSf, fl) < t2.units) { D('edges parked down', made.key, t2.units, '->', u2); continue; }
      if (p.edges) { const bs = made.els.filter(e => e.kind === 'building' && e.use === 'multifamily').sort((a, b) => a.w * a.d - b.w * b.d || a.x - b.x || a.y - b.y); if (bs.length <= 2) break; const kk = made.barK?.get(bs[0]); made.els.splice(made.els.indexOf(bs[0]), 1); k = Math.max(0, k - 1); D('edges: a bar left out to park the rest', made.key);
        if (kk != null && made.remake && !made.els.some(e => made.barK.get(e) === kk)) { const m3 = made.remake(kk); if (m3) { const t3 = H.tally(m3.els, prog); if (estU(m3) >= estU(made) && t3.stalls >= t3.need) { trimRows(m3.els, t3.need); const w0 = genWalk90(made.els), w1 = genWalk90(m3.els); if (w1 < w0 - 10) { D('edges: the strip with no bar left redrawn as lawn and pond, its bays by the bars', made.key, Math.round(w0), '->', Math.round(w1)); made = { ...m3, key: made.key, remake: null }; } } } }
        continue; } // (strips park only what a bay holds: a bar gives way, its land parking and lawn)
      if (p.type === 'wing') { const m2 = made.remake?.(u2 / t2.units * (made.scale || 1)); if (!m2) { D('court unparked', made.key); return; } made = { ...made, els: m2.els, scale: m2.scale }; trimRows(made.els, H.tally(made.els, prog).need); D('court drawn smaller', made.key, t2.units, '->', u2); continue; } // (a courtyard building too big to park is drawn again smaller, whole)
      fitCount(made.els, TY[p.type || 'bar'], u2, prog.unitSf, fl); /* (0.96: under fitCount's 4% slack, so it does cut) */ D('parked down', made.key, t2.units, '->', u2); } // (a layout whose rows can't park its units keeps the units it can park: the rows are the arrangement's, the count follows)
    if (!com && !Number.isFinite(target)) { const t0 = H.tally(made.els, prog), u0 = t0.units || 0; if (u0 < bestU * 0.92 && !p.cap) { D('fewer than the best so far', made.key, u0, bestU); return; } if (!(t0.stalls < t0.need)) bestU = Math.max(bestU, u0); } /* (the best so far a parked one: an unparked layout's count isn't one it can keep) */ // (as many as fit: a layout well under the best so far isn't finished: its landscape and pond are the costly part)
    if (!com && H.style) finishGen(made.els, H.style); // (the search's finish: curved aisle ends, staggered fronts)
    const land = H.finishLand(F, made.els, { pond: ctx.pond, openSpace: !com, trail: !com, amenity: false, padUse: false, frontY: R.front }, {}), els = made.els.concat(land);
    const a = { F, els, o: { pondAt: 'none' }, st: { pond: land.filter(e => e.kind === 'pond').reduce((t, e) => t + S.elArea(e), 0), pondNeed: ctx.pond }, pre: { surf: 0 } };
    let f; try { f = H.take(plan, a, prog, ctx.foot, 'gen|' + made.key, { gen: { arrangement: made.key, params: p } }, made.label); } catch (e) { if (globalThis.SP_DEBUG) console.log('gen failed', made.key, e.message); return; }
    if (com && (f.bad.length || f.cut || f.els.filter(e => e.kind === 'building').length < made.els.filter(e => e.kind === 'building').length)) { D('lost', made.key, f.bad.map(i => i.text).slice(0, 2).join('; '), 'cut', f.cut); return; } // (a commercial layout the repair had to cut into, or that still breaks a rule, isn't offered: the grid has its neighbours) // (a commercial layout that lost a building to the repair isn't offered: the grid has its neighbours)
    if (globalThis.SP_DEBUG) { const b0 = made.els.filter(e => e.kind === 'building'), b1 = f.els.filter(e => e.kind === 'building'); D('take', made.key, 'buildings', b0.length, '->', b1.length, 'cut', f.cut, 'bad', f.bad.map(i => i.text).slice(0, 2).join('; ')); if (b0.length !== b1.length && /loop/.test(made.key)) { const F2 = a.F, kept = b1.map(e => [e.x, e.y]); D('  kept', b1.map(e => (e.name || e.note || '').slice(0, 10) + '@' + Math.round(e.x) + ',' + Math.round(e.y) + (e.rot ? '/' + Math.round(e.rot) : '')).join(' ')); D('  made', b0.map(e => Math.round(e.x) + ',' + Math.round(e.y) + '/' + Math.round(e.rotL || 0)).join(' ')); } }
    f.a.st = { ...H.tally(f.els, prog), pond: a.st.pond, pondNeed: a.st.pondNeed }; f.score = H.score(f.a, prog, ctx.foot) - f.bad.length * 500 - (f.cut || 0) * 40; D('score', made.key, Math.round(f.score), 'st', JSON.stringify({ u: f.a.st.units, s: f.a.st.stalls, n: f.a.st.need, g: f.a.st.garages, gfa: Math.round(f.a.st.gfa) })); // (the score of what survived the repair, not of what was composed)
    if (prog.crossDock && /^Cross-dock/.test(f.label)) f.score += 600; // (a cross-dock asked for: its layouts lead the plain warehouses)
    if (prog.arrangement && (prog.arrangement === 'wrap' ? /^Wrap/.test(f.label) : prog.arrangement === 'tuck' ? /^Tuck-under/.test(f.label) : prog.arrangement === 'vertical' ? /^Vertical mixed use/.test(f.label) : prog.arrangement === 'podium-court' ? /^Courtyard on a podium/.test(f.label) : prog.arrangement === 'courtyard' ? /courtyard/i.test(f.label) : prog.arrangement === 'plaza' ? /^Retail plaza/.test(f.label) : /^Loop drive/i.test(f.label))) f.score += 600 + (prog.arrangement === 'plaza' ? Math.max(0, (p.court || 120) - 120) * 2 : 0); // (a plaza: the wider court the better, when it parks) // (the words asked for this arrangement: its layouts lead the ones that merely fit more)
    if (com && prog.use === 'retail' && prog.pads > 0) { const got = f.els.filter(e => e.kind === 'building' && /drive-thru/i.test(e.note || '')).length; f.score -= Math.abs(got - prog.pads) / prog.pads * 300; } // (the pads asked for: a layout without them ranks below one with them)
    f.params = p; f.units = f.a.st.units; out.push(f); };
  // the strips along an odd lot's edges (alongEdges). As many as fit, a layout a little past the 200 apartments where the
  // fire code asks for a second way in (IFC D106.1, the validator's access.second) is also offered cut back to 200 by whole
  // modules, the longest bar first: a wedge's one street seldom gives two ways in far enough apart (D104.3), and the gated
  // emergency lane the run adds instead ranks below real entrances, so the full layout lost to one with a building fewer
  // the entry's throat (docs/LAYOUT-ENGINE.md item 31): rows facing the street and rows running back are drawn with the
  // first aisle / the front drive the stacking length in from the street (lib/layoutrun.mjs throatNeed: 75 ft for a lot of
  // 200 stalls or more, else 50) where the land allows it at no cost in homes (the buildings drawn hold as many as with
  // it at the paving setback), else as before; the land in front is lawn. Every layout of the grid is drawn the same
  // way, so near-twins stay twins.
  const thrNeed = (Number.isFinite(target) ? target : ctx.foot ? Math.floor(ctx.foot * fl * 0.85 / prog.unitSf) : 0) * (prog.ratio || 1.6) >= 200 ? 75 : 50;
  const estU = m => m.els.filter(e => e.kind === 'building' && e.use === 'multifamily').reduce((t, e) => t + Math.floor(e.w * e.d * fl * 0.85 / prog.unitSf), 0);
  const asGood = (m1, m0) => { if (estU(m1) < estU(m0)) return false; const t1 = H.tally(m1.els, prog), t0 = H.tally(m0.els, prog); return t1.stalls + (t1.garages || 0) >= Math.min(t1.need, t0.stalls + (t0.garages || 0)); }; // (as many homes, parked as well)
  const thr = (fn, R0, p, T, off) => { let m0 = null; try { m0 = fn(R0, p, fl, T); } catch { m0 = null; } if (!m0 || opts.noThroat) return m0;
    for (const need of thrNeed > 50 ? [thrNeed, 50] : [50]) { const vF = R0.front + need - off; if (vF <= R0.vF + 0.5) return m0; let m1 = null; try { m1 = fn({ ...R0, vF }, p, fl, T); } catch { m1 = null; } if (m1 && asGood(m1, m0)) return m1; }
    return m0; };
  const edgeTry = p => { let made = null; try { made = alongEdges(F, R, p, fl, TY[p.type], F.front); } catch (e) { D('edges threw', e.message); }
    if (made && !opts.noThroat) for (const need of thrNeed > 50 ? [thrNeed, 50] : [50]) { let m1 = null; try { m1 = alongEdges(F, R, { ...p, thr: need }, fl, TY[p.type], F.front); } catch { m1 = null; } if (m1 && asGood(m1, made)) { made = { ...m1, key: made.key, thr: need }; break; } } // (a strip along the street: its first aisle the entry's stacking length in, where that costs no homes)
    const est = m => m.els.filter(e => e.kind === 'building' && e.use === 'multifamily').reduce((t, e) => t + Math.floor(e.w * e.d * fl * 0.85 / prog.unitSf), 0), u0 = made ? est(made) : 0;
    if (made && !opts.noThroat) { let m1 = null; try { m1 = alongEdges(F, R, { ...p, ...(made.thr ? { thr: made.thr } : {}), entThr: true }, fl, TY[p.type], F.front); } catch { m1 = null; } if (m1 && asGood(m1, made)) made = { ...m1, key: made.key, thr: made.thr, entThr: true }; } // (the way in where no drive crosses it inside its stacking length, where that costs no homes and parks as well)
    if (made) { const pU = { ...p, ...(made.thr ? { thr: made.thr } : {}), ...(made.entThr ? { entThr: true } : {}) }; made.remake = kk => { try { return alongEdges(F, R, { ...pU, skip: [kk] }, fl, TY[p.type], F.front); } catch { return null; } }; } // (a strip whose only bar is left out to park the rest: drawn again without it, see tryOne)
    tryOne(made, p); if (Number.isFinite(target) || !(u0 > SECOND_WAY_AT && u0 <= SECOND_WAY_AT * 1.5)) return;
    let m2 = null; try { m2 = alongEdges(F, R, p, fl, TY[p.type], F.front); } catch { m2 = null; } if (!m2) return; // (drawn again: tryOne trims the first in place)
    const u2 = fitCount(m2.els, TY[p.type], SECOND_WAY_AT / 1.04, prog.unitSf, fl); if (!(u2 <= SECOND_WAY_AT && u2 < u0)) return; D('edges cut to', SECOND_WAY_AT, m2.key, u0, '->', u2);
    tryOne({ ...m2, key: m2.key + '|' + SECOND_WAY_AT }, { ...p, cap: SECOND_WAY_AT }); };
  if (com) { for (const p of COM.grid(prog, S.ringArea(plan.ring) / 43560, opts.asks)) { if (CX.now() - t0 > budget) break; tryOne(COM.make(R, p, prog, ctx.foot), p); } }
  else if (prog.arrangement === 'tuck') { for (const bays of [6, 5, 4]) for (const amen of [true, false]) for (const inner of [false, true]) { if (CX.now() - t0 > budget) break; const p = { type: 'tuck', bays, amen, inner }; tryOne(tuckOf(R, p, fl, prog, target), p); } }
  else if (prog.arrangement === 'vertical') { for (const at of ['center', 'left', 'right']) for (const D of [65, 70, 60]) { if (CX.now() - t0 > budget) break; const p = { type: 'vertical', at, D }; tryOne(verticalOf(R, p, fl, prog, target), p); } }
  else if (opts.podiumCourt) { if (R.stub) return []; const bw = R.B[2] - R.B[0], bd = R.B[3] - R.B[1] - R.pondDepth; for (const f of [1, 0.85, 0.7]) for (const g of Number.isFinite(target) ? [1] : [1, 0.85, 0.7]) for (const side of ['right', 'left']) { /* (with a count asked the depth is searched inside) */ const p = { type: 'podium', W: Math.round(bw * f), Dd: Math.round(bd * g), side, target };  tryOne(podiumCourt(R, p, fl, prog), p); } }
  else if (R.stub) { if (!odd) return []; /* (a stub frame: only the strips along the edges; as many as fit on a whole lot runs every arrangement below, the strips among them on an odd lot) */ for (const type of ['bar', 'garden']) for (const edges of [2, 3]) for (const nbays of [1, 2, 3]) for (const flip of [0, 1]) for (const fb of [false, true]) { const p = { type, edges, bays: nbays, flip, ...(fb ? { frontBars: true } : {}) }; edgeTry(p); } }
  else if (prog.arrangement === 'wrap') { for (let W = 300; W <= 900; W += 30) { if (CX.now() - t0 > budget) break; const p = { type: 'wrap', W }; tryOne(wrapOf(R, p, fl, prog, target), p); } }
  else { if (odd) for (const type of ['bar', 'garden']) for (const edges of [2, 3]) for (const nbays of [1, 2, 3]) for (const flip of [0, 1]) for (const fb of [false, true]) { const p = { type, edges, bays: nbays, flip, ...(fb ? { frontBars: true } : {}) }; edgeTry(p); }
    const lean = !!opts.edgesOnly; // (as many as fit: the rows only, the amenity by the entry; each drawn full and parked down is costly on a big lot, and courtyards and loops don't chase the count)
    for (const type of ['bar', 'garden']) for (const rows of [1, 2, 3, 4, 5, 6, 7]) for (const amen of [...(lean ? ['entry'] : ['entry', 'center']), ...(opts.asks?.club === 'back' ? ['back'] : [])]) /* ('back': the clubhouse asked at the back, lib/layoutintent.mjs) */ for (const cut of ['none', 'left', 'right', ...(opts.asks?.pond === 'front' ? ['front'] : [])]) for (const ent of [1, 2]) { if (CX.now() - t0 > budget) break;
    const p = { type, rows, amenity: amen, cut, entrances: ent }; tryOne(thr(rowsFacing, R, p, TY[type], ROW), p); if (rows >= 1) { const pl = { ...p, lead: true }; tryOne(rowsFacing(R, pl, fl, TY[type]), pl); } if (cut !== 'left') tryOne(thr(rowsBack, R, { ...p, cut: cut === 'right' ? 'back' : 'none' }, TY[type], 0), { ...p, cut: cut === 'right' ? 'back' : 'none' }); }
  if (!lean) for (const rws of [1, 2]) { if (rws === 2 && out.some(f => /courtyard/i.test(f.label) && f.units >= target * 0.97)) break; // (a second row of courts only when one row can't hold the program)
    for (const shape of ['O', 'U']) for (const rings of [1, 2, 3]) for (const aspect of [0.8, 1, 1.25, 1.5]) for (const ent of [2, 1]) { const p = { type: 'wing', shape, rings, rws, aspect, entrances: ent }; tryOne(courtyard(R, p, fl, TY.wing, ctx.foot), p); } }
  if (!lean) for (const type of ['garden', 'bar']) for (const len of type === 'garden' ? [110, 140] : [160, 200, 260]) for (const size of [0.7, 0.85, 1]) for (const turn of ['square', 'angled']) for (const ent of [1, 2]) { if (CX.now() - t0 > budget) break; const p = { type, len, size, turn, entrances: ent }; let made = null; try { made = loop(R, p, fl, TY[type], ctx.foot, target, prog); } catch (e) { D('loop threw', e.message); } tryOne(made, p); }
  }
  // ranked: no rule broken first, then the score (the count asked, the parking, the front); near-twins dropped
  const sig = f => f.label.split(' · ')[0] + '|' + f.els.filter(e => e.kind === 'building').map(e => Math.round(e.x / 60) + ',' + Math.round(e.y / 60)).sort().join(';') + '|e' + S.entrancesOf(f.els).length + '|p' + f.els.filter(e => e.kind === 'pond').map(e => Math.round(e.x / 120) + ',' + Math.round(e.y / 120)).sort().join(';'); // (twins: the same buildings, ways in and ponds)
  const ranked = out.sort((a, b) => (a.bad.length - b.bad.length) || (b.score - a.score)), kept = [], sigs = new Set();
  for (const f of ranked) { const s = sig(f); D('sig', f.key, s.slice(0, 80)); if (sigs.has(s)) continue; sigs.add(s); kept.push(f); }
  // each layout of rows its twin with buildings along the street (p.lead): the same rows, deep enough in for a
  // boulevard's median, for lib/sitelayout.mjs to take when the plan's entry is a boulevard and it costs little
  const part = k => (k || '').split('|'); // gen|facing|rows|type|amenity|cut|entrances[|lead]
  for (const f of kept) { const a = part(f.key); if (a[1] !== 'facing' || a[7] === 'lead') continue;
    const t = out.filter(g => { const b = part(g.key); return b[1] === 'facing' && b[7] === 'lead' && b[3] === a[3] && b[5] === a[5] && b[6] === a[6] && !g.bad.length; }).sort((x, y) => y.score - x.score)[0]; if (t) f.leadTwin = t; }
  return kept;
}
