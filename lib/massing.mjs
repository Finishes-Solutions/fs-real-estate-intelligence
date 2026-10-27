// The site plan's 3D buildings drawn from their floor-plan designs (lib/plandesign.mjs, the same designs the plan set
// draws and the BIM model is built from), so the layout's massing, the plan set and the model show one building: the
// walls in their finish a storey at a time (homes and apartments brick at the ground floor, siding above; a townhome
// row's units each their own siding colour), the windows and exterior doors where the design puts them, framed in trim,
// an apartment building's breezeways open and its balconies, a hip roof stepped up to its ridge or a flat roof behind a
// parapet with its rooftop units. facades(plan) -> Map(element id -> { parts: [{ ring (site feet), b, h (ft), c }],
// wallH (the walls' top, ft), sloped }). Map extrusions only: no gables, no curves. Pure: no DOM.
import * as S from './siteplan.mjs';
import * as PD from './plandesign.mjs';
import { MATERIALS, wallOf, balconiesOf } from './bimplan.mjs';

const MAT = Object.fromEntries(MATERIALS.map(([n, c]) => [n, c]));
export const C = { trim: '#f2efe8', glass: '#30424e', store: '#3a4f5c', door: '#5d4636', overhead: '#e6e3dc', recess: '#34322f', rail: '#2a2e30', deck: '#a8896a', patio: '#c6c1b5', shingle: '#4d5256', fascia: '#eceae4', membrane: '#d6d9d8', rtu: '#9ba2a5', canopy: '#3d4447' };
const ROW = ['Siding cream', 'Siding sage', 'Siding tan', 'Siding slate'];
const OUT = { front: [0, -1], back: [0, 1], left: [-1, 0], right: [1, 0] };
const skin = (use, k) => MAT[wallOf(use, k).layers[0].material] || MAT.Brick;

// designs by type, kept between calls (the map redraws on every edit): a rule-based design takes a few ms a type
const memo = new Map();
function designFor(t) {
  const key = JSON.stringify([t.use, t.W, t.D, t.floors, t.floorH, t.attached, t.unitsPer, t.fp, t.garage, t.sf, t.note]);
  if (memo.has(key)) return memo.get(key);
  let d = null; try { d = PD.placeDesign(PD.fallbackDesign(t), t).design; } catch { d = null; }
  if (memo.size > 300) memo.delete(memo.keys().next().value);
  memo.set(key, d); return d;
}

// the side of the outline a door or window sits on, when the design doesn't say
function sideOf(q, W, D) {
  if (q.side && OUT[q.side]) return q.side;
  const h = Math.abs(q.y1 - q.y2) < 0.01, m = h ? q.y1 : q.x1;
  return h ? (m < D / 2 ? 'front' : 'back') : (m < W / 2 ? 'left' : 'right');
}
// a box on the face of a wall: along the segment a→b (design feet) widened by `grow` at each end, from `o0` to `o1` out
const faceBox = (a, b, side, grow, o0, o1) => {
  const [nx, ny] = OUT[side], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  const A = [a[0] - ux * grow, a[1] - uy * grow], B = [b[0] + ux * grow, b[1] + uy * grow];
  return [[A[0] + nx * o0, A[1] + ny * o0], [B[0] + nx * o0, B[1] + ny * o0], [B[0] + nx * o1, B[1] + ny * o1], [A[0] + nx * o1, A[1] + ny * o1]];
};
// a square-cornered outline as roof rectangles, biggest first: the main body under one hip, each bay or wing its own
// (the largest rectangle of the outline's grid cells, then the largest of what's left, and so on)
export function roofPieces(fp) {
  const xs = [...new Set(fp.map(p => p[0]))].sort((a, b) => a - b), ys = [...new Set(fp.map(p => p[1]))].sort((a, b) => a - b);
  const nx = xs.length - 1, ny = ys.length - 1, left = Array.from({ length: nx }, (_, i) => Array.from({ length: ny }, (_, j) => PD.inPoly([(xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2], fp)));
  const out = [];
  for (let guard = 0; guard < 24; guard++) {
    let best = null;
    for (let i0 = 0; i0 < nx; i0++) for (let j0 = 0; j0 < ny; j0++) { if (!left[i0][j0]) continue;
      for (let i1 = i0; i1 < nx && left[i1][j0]; i1++) for (let j1 = j0; j1 < ny; j1++) {
        let ok = true; for (let i = i0; i <= i1 && ok; i++) ok = left[i][j1]; if (!ok) break;
        const a = (xs[i1 + 1] - xs[i0]) * (ys[j1 + 1] - ys[j0]); if (!best || a > best.a) best = { a, i0, i1, j0, j1 }; } }
    if (!best) break;
    for (let i = best.i0; i <= best.i1; i++) for (let j = best.j0; j <= best.j1; j++) left[i][j] = false;
    out.push({ x: xs[best.i0], y: ys[best.j0], w: xs[best.i1 + 1] - xs[best.i0], d: ys[best.j1 + 1] - ys[best.j0] });
  }
  return out.filter(p => p.w > 1 && p.d > 1);
}
const rect = (x, y, w, d) => [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];

/**
 * @param {object} plan  a site plan option (feet)
 * @param {object} [o]   { designs: { typeId: placed design } (the plan set's, where there is one), skip: Set of element
 *                       ids to leave plain (the selected building keeps its highlight) }
 */
export function facades(plan, { designs = {}, skip = null } = {}) {
  const out = new Map();
  let types; try { types = PD.buildingTypes(plan); } catch { return out; }
  const byId = new Map((plan.elements || []).map(e => [e.id, e]));
  for (const t of types) {
    if (!t.supported) continue;
    const d = designs[t.id] || designFor(t); if (!d) continue;
    for (const id of t.elementIds) {
      const e = byId.get(id); if (!e || e.kind !== 'building' || (e.form === 'tower' && e.podium > 0)) continue;
      try { out.set(id, building(plan, e, t, d, skip?.has(id))); } catch { /* drawn as plain massing */ }
    }
  }
  return out;
}

function building(plan, e, t, d, plain) {
  const pl = PD.fitted(PD.placement(plan, e), d), n = pl.units, F = d.floors, H = d.floorH || t.floorH, parts = [];
  const unitFp = d.footprint, rowFp = n > 1 ? rect(0, 0, d.W * n, d.D) : unitFp, UW = d.W, UD = d.D; // (design feet: `site` stretches them to the building)
  const site = (pts, i = 0) => pts.map(([x, y]) => pl.at(x, y, i)), put = (pts, b, h, c, i = 0) => parts.push({ ring: site(pts, i), b: +b.toFixed(2), h: +h.toFixed(2), c });
  const R = d.roof || { type: 'flat' }, sloped = R.type !== 'flat' && R.type !== 'shed', parapet = sloped ? 0 : 3, top = F * H;
  const grown = (P, g) => S.offsetRing(S.signedArea(P) >= 0 ? P : P.slice().reverse(), g);
  // the walls, a storey at a time, a hair outside the plain massing so they show over it
  if (!plain) for (let k = 0; k < F; k++) {
    if (n > 1 && k > 0) for (let i = 0; i < n; i++) put(grown(rect(i * UW, 0, UW, UD), 0.2), k * H, (k + 1) * H, MAT[ROW[i % ROW.length]]);
    else put(grown(rowFp, 0.2), k * H, (k + 1) * H, skin(t.use, k));
  }
  if (n > 1) for (let i = 1; i < n; i++) put(rect(i * UW - 0.35, -0.45, 0.7, UD + 0.9), 0, top + (sloped ? 0.3 : parapet), C.trim); // the party walls, a fin at each
  // the openings, a storey at a time: trim round each, glass or the door proud of it
  for (let k = 0; k < F; k++) {
    const z = k * H, fl = d.rooms.filter(r => r.floor === k + 1), gaps = n > 1 ? [] : fl.filter(r => /breezeway/i.test(r.name) || r.type === 'corridor');
    const balc = t.use === 'multifamily' ? balconiesOf(d, k, rowFp, gaps) : [];
    for (let i = 0; i < n; i++) {
      for (const w of d.windows.filter(w => w.floor === k + 1 && !(k > 0 && balc.some(x => x.room === w.room && x.side === w.side)))) {
        const sd = sideOf(w, UW, UD), a = [w.x1, w.y1], b = [w.x2, w.y2], s0 = z + (w.sill ?? 3), s1 = s0 + (w.height || 4);
        put(faceBox(a, b, sd, 0.35, 0, 0.42), s0 - 0.35, s1 + 0.4, C.trim, i);
        put(faceBox(a, b, sd, 0, 0, 0.55), s0, s1, w.width >= 8 ? C.store : C.glass, i);
        if (k === 0 && (w.width >= 8 || (sd === 'front' && ['retail', 'restaurant'].includes(t.use)))) put(faceBox(a, b, sd, 1, 0, 4), s1 + 0.7, s1 + 1.3, C.canopy, i); // a storefront's metal canopy
      }
      for (const q of d.doors.filter(q => q.floor === k + 1 && q.exterior && q.kind !== 'opening')) {
        const sd = sideOf(q, UW, UD), hgt = q.kind === 'overhead' ? (['industrial', 'storage', 'fuel'].includes(t.use) ? (q.width >= 12 ? 14 : 10) : 7) : q.kind === 'storefront' || q.kind === 'double' ? 8 : 7;
        put(faceBox([q.x1, q.y1], [q.x2, q.y2], sd, 0.4, 0, 0.42), z, z + hgt + 0.45, C.trim, i);
        put(faceBox([q.x1, q.y1], [q.x2, q.y2], sd, 0, 0, 0.55), z, z + hgt, q.kind === 'overhead' ? C.overhead : q.kind === 'storefront' || q.kind === 'sliding' ? C.store : C.door, i);
        if (q.kind === 'storefront') put(faceBox([q.x1, q.y1], [q.x2, q.y2], sd, 1.5, 0, 4.5), z + hgt + 0.9, z + hgt + 1.5, C.canopy, i);
      }
      // an apartment building's breezeways: open where they meet the outside wall (a dark recess, floor to ceiling)
      for (const g of gaps) for (const [side, a, b] of [['front', [g.x, g.y], [g.x + g.w, g.y]], ['back', [g.x, g.y + g.d], [g.x + g.w, g.y + g.d]], ['left', [g.x, g.y], [g.x, g.y + g.d]], ['right', [g.x + g.w, g.y], [g.x + g.w, g.y + g.d]]]) {
        const on = side === 'front' ? g.y < 0.05 : side === 'back' ? Math.abs(g.y + g.d - UD) < 0.05 : side === 'left' ? g.x < 0.05 : Math.abs(g.x + g.w - UW) < 0.05; if (!on) continue;
        put(faceBox(a, b, side, -0.3, 0, 0.6), z + (k ? 0.6 : 0), z + H - 0.3, C.recess, i);
      }
      for (const x of balc) { // a deck 6 ft out with a railing round it above the ground floor; a patio slab at grade
        put(x.box, k ? z - 0.7 : 0, k ? z : 0.4, k ? C.deck : C.patio, i);
        if (k) for (let j = 0; j + 1 < x.rail.length; j++) { const a = x.rail[j], b = x.rail[j + 1], h = Math.abs(a[1] - b[1]) < 0.01, lo = h ? Math.min(a[0], b[0]) : a[0] - 0.15, hi = h ? Math.max(a[0], b[0]) : a[0] + 0.15;
          put(h ? rect(lo, a[1] - 0.15, hi - lo, 0.3) : rect(lo, Math.min(a[1], b[1]), hi - lo, Math.abs(a[1] - b[1])), z, z + 3.5, C.rail, i); }
      }
    }
  }
  // the roof
  if (sloped) {
    const pieces = n > 1 ? [{ x: 0, y: 0, w: UW * n, d: UD }] : roofPieces(unitFp), o = R.overhang ?? 1.5, pitch = (R.pitch || 6) / 12;
    for (const p of pieces) {
      const half = Math.min(p.w, p.d) / 2 + o, N = Math.max(5, Math.min(16, Math.round(half / 0.9))), st = half / N, rise = st * pitch;
      put(rect(p.x - o, p.y - o, p.w + 2 * o, p.d + 2 * o), top - 0.7, top, C.fascia);
      for (let i = 0; i < N; i++) { const g = i * st - o, w = p.w - 2 * g, dd = p.d - 2 * g; if (w <= 0.3 || dd <= 0.3) break; put(rect(p.x + g, p.y + g, w, dd), top + i * rise, top + (i + 1) * rise, C.shingle); }
    }
  } else {
    const band = (o, i, b, h, c) => parts.push({ ring: site(grown(rowFp, o)), hole: site(grown(rowFp, i)), b: +b.toFixed(2), h: +h.toFixed(2), c });
    band(0.2, -0.8, top, top + parapet, skin(t.use, F - 1)); band(0.35, -0.95, top + parapet, top + parapet + 0.35, C.trim); // the parapet and its coping
    put(grown(rowFp, -0.8), top, top + 0.12, C.membrane); // (the roof inside the parapet, over the massing's top)
    const area = S.ringArea(rowFp), nU = Math.min(8, Math.max(1, Math.round(area / 6000)));
    if (!['sfr', 'townhomes', 'duplex', 'multifamily'].includes(t.use)) for (let i = 0; i < nU; i++) { const x = UW * (i + 0.5) / nU - 3, y = UD / 2 - 2; put(rect(x, y, 6, 4), top, top + 3.5, C.rtu); }
  }
  return { parts, wallH: top, sloped };
}
