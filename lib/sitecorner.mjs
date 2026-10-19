// Shopping strips on a corner lot: besides the straight row at the back, two shapes a site planner draws where a side
// street meets the front, tried with the usual layouts and kept when they score better (an inside lot never sees them):
//  - an L-shaped strip round the parking: one wing along the back, one along the far side, the storefronts facing the
//    parking in the crook of the L (open to the corner, so both streets see it), the end units (end caps) out at the
//    two streets;
//  - a pad at the corner (a restaurant, coffee or bank with its drive-thru lane) in front of the strip, the strip asked
//    for less the pad's floor area, so the plan still holds what was asked.
// Called from lib/sitelayout.mjs layoutCore() with the helpers it needs (H); returns candidates the way its own passes
// make them, so they're ranked with the rest.
import * as S from './siteplan.mjs';
import { cornerOf, frameFor } from './sitefuel.mjs';

const ROW = 18, AISLE = 24, WALK = 12, box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const PAD = { w: 44, d: 50 }; // the pad building padsAlong() draws (60 ft less its patio, by 50)

// ctx: { foot (the footprint asked for, sq ft), pond (detention area) }
export function cornerRetail(plan, prog, ctx, H) {
  const corner = cornerOf(plan); if (!corner || ctx.foot == null || prog.max || prog.buildings > 1 || prog.zones) return [];
  const F = frameFor(plan, 'front', corner, H); if (!F.side) return [];
  return [...lStrip(plan, prog, F, ctx, H), ...cornerPad(plan, prog, F, ctx, H)];
}

// ---------- a pad at the corner, the strip behind ----------
function cornerPad(plan, prog, F, ctx, H) {
  const out = [], seqs = H.sequences(prog.use, { ...prog, pads: 1 }, F).filter(q => q.pads), foot = Math.max(2000, ctx.foot - PAD.w * PAD.d); // (the pad's floor area comes out of the strip's)
  const ranked = seqs.map(seq => ({ seq, v: H.estimate(F, seq, prog, ctx.pond, 'none', foot) })).filter(q => q.v != null).sort((a, b) => b.v - a.v).slice(0, 3);
  for (const { seq } of ranked) for (const pondAt of ctx.pond >= 3000 ? ['none', 'end'] : ['none']) { // (the pond in the land left over, or at the far end)
    const o = { pond: ctx.pond, pondAt, footprint: foot, shift: 'bottom', entry: { w: 30 }, spec: { pads: 1, padAt: F.side } }, a = H.attempt(plan, F, seq, prog, o);
    if (!a || !a.els.some(e => e.kind === 'building' && /drive-thru/.test(e.note || ''))) continue; // no room for the pad at the corner
    for (const e of a.els) if (e.kind === 'building' && /drive-thru/.test(e.note || '')) e.note = 'Corner pad · drive-thru'; // (still a pad to the namer: Pad A)
    out.push(H.take(plan, a, prog, ctx.foot, 'corner-pad|' + pondAt, { deep: false, seq, o }, 'Strip with a pad at the corner'));
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 1);
}

// ---------- an L-shaped strip round the parking ----------
// In the frame (street at the bottom, the side street toward F.side): the parking rows across the lot from the front,
// the back wing right behind them from the far side toward the side street, the far side's wing from the front building
// line up to it (its end cap at the front street), the storefronts facing the parking in the crook. The floor area asked
// for sets how far the back wing runs toward the side street (to its building line, an end cap there too, when the
// program is big enough); the parking past its end, toward the corner, is trimmed to what the strip needs and the land
// left there is kept for pads. Shallow shop bays (60 ft) on a small program, 80 ft from 30,000 sf.
function lStrip(plan, prog, F, ctx, H) {
  const out = [], s = F.side, P = H.profile(F), foot = ctx.foot / Math.max(1, prog.floors), D = foot < 30000 ? 60 : Math.min(100, Math.max(70, prog.depth < 100 ? prog.depth : 80)), yF = P.p[0];
  for (const na of [2, 3, 4]) {
    const Hs = ROW + na * AISLE + (na - 1) * (2 * ROW + 4) + ROW, yb0 = yF + Hs + WALK, yb1 = yb0 + D;
    const bsp = H.spans(F, yb0, yb1, 'build').sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0]; if (!bsp || bsp[1] - bsp[0] < D + 140) continue;
    const fx0 = s > 0 ? bsp[0] : bsp[1] - D, fx1 = fx0 + D; // the far side's wing, from the front building line to the back wing
    const ys = H.spans(F, fx0, fx1, 'build', [], true).find(([a, b]) => a <= yb0 - 60 && b >= yb0 - 0.01); if (!ys) continue;
    let Ls = yb0 - ys[0], Lb = foot / D - Ls; // the side wing's length; the back wing's, with the elbow: together the floor area asked for
    if (Lb < D + 100) { Lb = D + 100; Ls = foot / D - Lb; if (Ls < 60) continue; } // (a small program: the side wing gives way at the front)
    if (Lb > bsp[1] - bsp[0]) continue; // more than the back of the lot holds: the usual layouts do better
    const bx0 = s > 0 ? bsp[0] : bsp[1] - Lb, bx1 = bx0 + Lb, sy0 = yb0 - Ls;
    const L = s > 0 ? [[fx0, sy0], [fx1, sy0], [fx1, yb0], [bx1, yb0], [bx1, yb1], [fx0, yb1]] : [[fx0, sy0], [fx1, sy0], [fx1, yb1], [bx0, yb1], [bx0, yb0], [fx0, yb0]];
    // the wings and the walks along their storefronts are kept clear of the parking and drives (and the side wing's
    // street end, when it doesn't reach the street)
    const keep = [box(bx0 - 2, yb0 - WALK + 0.5, bx1 + 2, yb1 + 2), s > 0 ? box(fx0 - 1e4, Math.min(sy0, ys[0] + 0.5) - 2, fx1 + WALK + ROW - 0.5, 1e5) : box(fx0 - WALK - ROW + 0.5, Math.min(sy0, ys[0] + 0.5) - 2, fx1 + 1e4, 1e5)]; // (a row of stalls along the side wing's walk, on the drive joining the aisles' ends)
    const sideRow = s > 0 ? { x0: fx1 + WALK, x1: fx1 + WALK + ROW, row: -1 } : { x0: fx0 - WALK - ROW, x1: fx0 - WALK, row: 1 }, wings = [box(bx0, yb0, bx1, yb1), box(fx0, sy0, fx1, yb0)];
    const area = S.ringArea(L), need = Math.ceil(area * prog.floors / 1000 * prog.ratio - 0.01), cx = s > 0 ? [fx1 + WALK + ROW, bsp[1]] : [bsp[0], fx0 - WALK - ROW];
    const seq = { blocks: [{ fill: 'none', rowsUp: true, h: ROW }, ...Array(na - 1).fill(0).map(() => ({ fill: 'park', rowsDown: true, rowsUp: true, h: 2 * ROW + 4 })), { fill: 'none', rowsDown: true, h: ROW }], aisles: Array(na).fill(0).map(() => ({ w: AISLE, kind: 'aisle' })) };
    const o = { pond: ctx.pond, pondAt: 'none', shift: 'bottom', curveR: 0, entry: { w: 30, at: (cx[0] + cx[1]) / 2 }, keep, anchors: wings, spec: { sideRow }, solid: [{ kind: 'building', use: 'amenity', poly: S.grow(L, 8) }], xNeed: need, xHave: 0 };
    const a = H.attempt(plan, F, seq, prog, o); if (!a) continue;
    if (H.tally(a.els, prog).stalls < need * 0.95) continue; // (the rows hold too few stalls for the strip)
    const caps = Ls >= yb0 - ys[0] - 1 && bsp[1] - bsp[0] - Lb < 40 ? 'end caps at both streets' : Ls >= yb0 - ys[0] - 1 ? 'an end cap at the front street' : 'storefronts on the parking';
    const wing = { whole: { kind: 'building', poly: L, use: prog.use, floors: prog.floors, note: 'L-shaped strip · ' + caps, labelAt: [(bx0 + bx1) / 2, (yb0 + yb1) / 2], cornerL: true } };
    placeWing(a.els, wing);
    const f = H.take(plan, a, prog, ctx.foot, 'corner-L|' + na, { deep: false, seq, o, wing }, 'L-shaped strip round the parking'); // (a re-fit lays the rows out again and puts the L back: placeWing)
    f.score += 25; // its storefronts face the parking by construction (the front score doesn't read a shaped building)
    out.push(f);
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 1);
}

// ---------- the L's building, put (back) in a layout ----------
// wing: { whole } (the L itself: a strip on its own), or a mixed plan's side wing { s, zone, D, x, use, floors }: the
// shops' building row, from its far end x (on the far side from the corner s), gets a wing D deep running from the row
// down to the front building line; the parking rows and the aisle under it end at its walk, the row is shortened at the
// corner end by the wing's floor area, and the two are one L. Frame feet. false (nothing changed) when it doesn't fit:
// something else stands there (a pad, the way in, a pond), or the row would be too short.
export function placeWing(els, w, H) {
  if (w.whole) { els.push({ ...w.whole }); return true; }
  const s = w.s, row = els.filter(e => e.kind === 'building' && e.zone === w.zone && !e.poly && Math.abs(e.d - w.D) < 1 && Math.abs((s > 0 ? e.x - e.w / 2 : e.x + e.w / 2) - w.x) < 2)[0]; if (!row) return false;
  const yb0 = row.y - row.d / 2, yb1 = row.y + row.d / 2, x0 = s > 0 ? w.x : w.x - w.D, x1 = x0 + w.D, y0 = w.y0;
  const area = w.D * (yb0 - y0), cut = area / w.D, rx0 = row.x - row.w / 2, rx1 = row.x + row.w / 2; if (rx1 - rx0 - cut < w.D + 40) return false; // (the back wing at least the side wing's depth and a shop more)
  const C = s > 0 ? [x0 - 1, y0 - 4, x1 + WALK, yb0] : [x0 - WALK, y0 - 4, x1 + 1, yb0], ov = b => b[0] < C[2] && b[2] > C[0] && b[1] < C[3] && b[3] > C[1], CP = [[C[0], C[1]], [C[2], C[1]], [C[2], C[3]], [C[0], C[3]]];
  const bb = e => { const P = e.poly || (e.path ? S.outline(e) : S.corners({ ...e, rot: e.rotL || 0 })), xs = P.map(p => p[0]), ys = P.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
  const out = [];
  for (const e of els) {
    if (e === row) continue; const b = bb(e); if (!ov(b) || (e.path || e.poly) && !S.rectsOverlap({ poly: e.poly || S.outline(e) }, { poly: CP }, 0)) { out.push(e); continue; } // (a curve: its own outline, not its box)
    if (e.kind === 'green' || e.kind === 'tree' || e.kind === 'lot' || e.kind === 'parking' && e.rotL % 180) continue; // (the land under it; a row of stalls across it)
    if (e.kind === 'drive' && e.path && !e.entry && e.name !== 'Main entry' && b[1] >= C[1] - 40) continue; // the aisle's turn up at that end: the aisle stops short of the wing now
    const flat = !e.path && !e.poly && !(e.rotL % 180) && (e.kind === 'parking' || e.kind === 'drive' && !e.entry && e.name !== 'Main entry');
    if (!flat) return false; // a building, a pad, a pond, the way in, a curve: it stands where the wing would
    // a row of stalls or an aisle running under the wing: it ends at the wing's walk (whole stalls)
    const a = s > 0 ? Math.max(b[0], C[2]) : b[0], z = s > 0 ? b[2] : Math.min(b[2], C[0]);
    const len = e.kind === 'parking' ? Math.floor((z - a) / (e.sw || 9)) * (e.sw || 9) : z - a; if (len < (e.kind === 'parking' ? 4 * (e.sw || 9) : 30)) continue;
    const na = s > 0 ? a : z - len; out.push({ ...e, x: na + len / 2, w: len });
  }
  const r0 = s > 0 ? rx0 : rx0 + cut, r1 = s > 0 ? rx1 - cut : rx1; // the back wing, shortened at the corner end
  const L = s > 0 ? [[x0, y0], [x1, y0], [x1, yb0], [r1, yb0], [r1, yb1], [x0, yb1]] : [[x0, y0], [x1, y0], [x1, yb1], [r0, yb1], [r0, yb0], [x0, yb0]];
  const { x, y, w: _w, d, rotL, ...rest } = row;
  out.push({ ...rest, poly: L, note: 'L-shaped strip · an end cap at the front street', labelAt: [(r0 + r1) / 2, (yb0 + yb1) / 2], cornerL: true });
  els.splice(0, els.length, ...out); return true;
}

// which way (+1 / -1 along the frame's x) the side street lies from the middle of the frontage; 0 on an inside lot
export function cornerSide(plan, F) {
  const corner = cornerOf(plan); if (!corner) return 0;
  const m = F.rr.length, cx = (F.X0 + F.X1) / 2, ox = corner.sides.map(j => (F.rr[j][0] + F.rr[(j + 1) % m][0]) / 2 - cx), oy = corner.sides.map(j => (F.rr[j][1] + F.rr[(j + 1) % m][1]) / 2);
  return ox.length ? Math.sign(ox[oy.indexOf(Math.min(...oy))]) || 1 : 0;
}

// ---------- the same shapes in a mixed plan, its shops at the front ----------
// f: a finished try of lib/sitelayout.mjs mixedOptions() (its attempt a, seq, mo, prog) whose street zone is shops. Tries:
// the L: a side wing from the end of the shops' building row down to the front building line, on the far side from the
// corner, its storefront on the zone's parking (placeWing). (The pad at the corner: mixedOptions lays the plan out again
// with a pad, padAt the corner side.) Returns [{ a, mo, seq, prog, wing, tag, bonus }] for mixedOptions to finish and rank.
export function cornerMixed(plan, F, f, zones, H) {
  const s = cornerSide(plan, F); if (!s) return [];
  const zi = f.order[0], z = zones[zi], out = [], seq = f.seq, mo = f.mo; if (z.use !== 'retail') return [];
  const fl = S.normalizeProgram({ use: z.use, floors: z.floors }).floors;
  // the L: from the row building at the far end
  { const R = f.a.els.filter(e => e.kind === 'building' && e.zone === zi && !e.poly && !/drive-thru/.test(e.note || ''));
    if (R.length) {
      const yb0 = Math.min(...R.map(e => e.y - e.d / 2)), row = R.filter(e => Math.abs(e.y - e.d / 2 - yb0) < 1), far = row.slice().sort((p, q) => s * ((p.x - p.w / 2 * s) - (q.x - q.w / 2 * s)))[0], D = far.d, x = s > 0 ? far.x - far.w / 2 : far.x + far.w / 2;
      const x0 = s > 0 ? x : x - D, ys = H.spans(F, x0, x0 + D, 'build', [], true).find(([p, q]) => p <= yb0 - 50 && q >= yb0 - 0.01);
      if (ys) {
        const wing = { s, zone: zi, D, x, y0: ys[0], use: z.use, floors: fl }, a = { ...f.a, els: f.a.els.map(e => ({ ...e })) };
        if (placeWing(a.els, wing)) out.push({ a, mo, seq, prog: f.prog, wing, tag: 'L-shaped shops on the corner', bonus: 25 });
      }
    } }
  return out;
}
