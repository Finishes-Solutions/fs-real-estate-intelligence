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
    a.els.push({ kind: 'building', poly: L, use: prog.use, floors: prog.floors, note: 'L-shaped strip · ' + caps, labelAt: [(bx0 + bx1) / 2, (yb0 + yb1) / 2] });
    const f = H.take(plan, a, prog, ctx.foot, 'corner-L|' + na, null, 'L-shaped strip round the parking');
    f.score += 25; // its storefronts face the parking by construction (the front score doesn't read a shaped building)
    out.push(f);
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 1);
}
