// Grocery-anchored shopping centers, as they're built (traced from a built one): the anchor box at the back of the lot
// with its storefront toward the street and the parking field between them, a wing of inline shops down the far side
// facing the field (an L with the anchor), pads along the street in front, the loading beside the anchor on the wing's
// side, a service drive behind when the lot is deeper than the field needs. Candidates the way lib/sitecorner.mjs makes
// them: the buildings fixed, the rows laid round them by attempt(), ranked with the rest (and ahead of them when the
// words ask for an anchor).
import * as S from './siteplan.mjs';
import { cornerOf, frameFor } from './sitefuel.mjs';

const ROW = 18, AISLE = 24, WALK = 12, LOAD = 40, DW = 70, box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

// the anchor's floor area: as the words say ("a 52,000 sf grocery", "a 60,000 sf anchor"), else half of a big retail program
export const anchorOf = prog => prog.anchor || (prog.use === 'retail' && !prog.buildings && !prog.max && (prog.gfa || 0) >= 60000 ? Math.round(prog.gfa / 2) : 0);

// ctx: { foot (the footprint asked for, sq ft), pond (detention area) }; H: the engine's helpers (as cornerRetail gets)
export function anchoredCenter(plan, prog, ctx, H) {
  const A = anchorOf(prog); if (!A || ctx.foot == null || prog.zones || prog.max) return [];
  const corner = cornerOf(plan), out = [], fl = prog.floors || 1, footA = Math.min(A, ctx.foot) / fl, footS = Math.max(0, ctx.foot - A / fl);
  const wA0 = Math.round(Math.sqrt(footA * 1.2)), dA0 = Math.round(footA / wA0); // (the storefront the long side)
  for (const s of corner ? [null] : [1, -1]) { // the wing on the far side from the side street; an inside lot: either side
    let F; try { F = corner ? frameFor(plan, 'front', corner, H) : H.frameOf(plan, false, 'front'); } catch { continue; } if (!F || F.deep) continue;
    const side = corner ? F.side || 1 : s, P = H.profile(F), yF = P.p[0], mid = (F.X0 + F.X1) / 2, ysp = H.spans(F, mid - 2, mid + 2, 'build', [], true), yB = ysp.length ? Math.min(P.p[1], Math.max(...ysp.map(v => v[1]))) : P.p[1], pads = prog.pads > 0, bot = pads ? ROW + WALK + 50 + 30 : ROW; // (yB: the back build line itself, not the profile's bin)
    for (let na = 6; na >= 1; na--) { // the deepest parking field that still leaves the anchor its depth
      const Hs = bot + na * AISLE + (na - 1) * (2 * ROW + 4) + ROW; let ay0 = yF + Hs + WALK, wA = wA0, dA = dA0, ay1 = ay0 + dA;
      let bsp = null; const spanAt = y1 => H.spans(F, ay0, y1, 'build').sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0] || null;
      if (ay1 > yB) { let d2 = Math.floor(yB - ay0); for (let k = 0; k < 8 && !bsp && d2 >= 120; k++, d2 -= 4) bsp = spanAt(ay0 + d2); const w2 = Math.round(footA / Math.max(1, d2 + 4)); if (bsp && w2 / (d2 + 4) <= 1.8) { wA = w2; dA = d2 + 4; ay1 = ay0 + dA; } else continue; } // (a shallower, wider anchor where one more aisle fits that way)
      else bsp = spanAt(ay1); if (!bsp || bsp[1] - bsp[0] < wA + LOAD + (footS > 2000 ? DW + 24 : 0)) continue;
      // the anchor toward the side street, its back on the back build line when that's within a wide walk of the field
      // (a plaza in front of the store), else at the field with a service drive behind; the loading beside it on the wing's side
      const gap = yB - 1 - ay1, back = gap <= 40; if (back) { ay0 += gap; ay1 += gap; }
      const ax0 = side > 0 ? bsp[1] - wA : bsp[0], ax1 = ax0 + wA, tx0 = side > 0 ? ax0 - LOAD : ax1, tx1 = tx0 + LOAD, walk = WALK + (back ? gap : 0);
      const anchor = box(ax0, ay0, ax1, ay1), truck = box(tx0, ay0 - walk - 2, tx1, ay1), keep = [box(ax0 - 2, ay0 - walk + 0.5, ax1 + 2, ay1 + 2), box(tx0 - 1, ay0 - walk + 0.5, tx1 + 1, ay1 + 1)], solid = [S.grow(anchor, 8), S.grow(truck, 2)], anchors = [anchor];
      const service = !back && gap >= 30 ? box(ax0 - 2, ay1 + 2, ax1 + 2, ay1 + 2 + 26) : null; if (service) { solid.push(service); keep.push(S.grow(service, 1)); }
      // the wing: down the far side from the back, as long as the shops need or the lot allows (to the front band)
      let wing = null, rest = footS, sideRow = null;
      if (footS > 2000) {
        let wx0 = side > 0 ? bsp[0] : bsp[1] - DW, wx1 = wx0 + DW, ys = null; // (the column stepped in from the far side until it's buildable from the front band to the back: a lot line a little off square)
        for (let k = 0; k < 12; k++, wx0 += side > 0 ? 4 : -4, wx1 = wx0 + DW) { ys = H.spans(F, wx0, wx1, 'build', [], true).find(([a, b]) => a <= ay1 - 10 && b >= ay1 - 0.01) || null; if (ys && ys[0] <= yF + bot + 30) break; }
        if (ys) { const y1 = Math.min(ys[1], ay1), y0 = Math.max(ys[0], yF + bot + 30, y1 - footS / DW); if (y1 - y0 >= 80 && (side > 0 ? tx0 - wx1 : wx0 - tx1) >= 24) {
          wing = box(wx0, y0, wx1, y1); rest = footS - (y1 - y0) * DW; anchors.push(wing); solid.push(S.grow(wing, 8));
          keep.push(side > 0 ? box(wx0 - 1e4, y0 - 2, wx1 + WALK + ROW - 0.5, 1e5) : box(wx0 - WALK - ROW + 0.5, y0 - 2, wx1 + 1e4, 1e5)); // (the row of stalls along its storefront walk: spec.sideRow)
          sideRow = side > 0 ? { x0: wx1 + WALK, x1: wx1 + WALK + ROW, row: -1 } : { x0: wx0 - WALK - ROW, x1: wx0 - WALK, row: 1 }; } }
      }
      // shops left over: a second building along the back between the wing and the loading, when there's a shop's width
      // (its storefront on the anchor's line and its back on the back line too: as deep as the anchor, a junior anchor,
      // when the anchor is much deeper than a shop; else a shop's depth with the land behind it the service side)
      let shopsB = null, dB = DW; if (rest > 3000) { const bx0 = side > 0 ? (wing ? wing[1][0] + 24 : bsp[0]) : tx1 + 24, bx1 = side > 0 ? tx0 - 24 : (wing ? wing[0][0] - 24 : bsp[1]);
        for (const d of dA - DW > 40 ? [dA, DW] : [DW]) { const L = Math.min(bx1 - bx0, rest / d); if (L >= 60) { const x0 = side > 0 ? bx1 - L : bx0; dB = d; shopsB = box(x0, ay0, x0 + L, ay0 + d); rest -= L * d; anchors.push(shopsB); solid.push(S.grow(shopsB, 8)); keep.push(box(x0 - 2, ay0 - walk + 0.5, x0 + L + 2, ay1 + 2)); break; } } }
      const cx = wing ? (side > 0 ? [wing[1][0] + WALK + ROW, bsp[1]] : [bsp[0], wing[0][0] - WALK - ROW]) : [bsp[0], bsp[1]];
      const seq = { blocks: [pads ? { fill: 'pads', D: 50, rowsUp: true, h: ROW + WALK + 50 + 30 } : { fill: 'none', rowsUp: true, h: ROW }, ...Array(na - 1).fill(0).map(() => ({ fill: 'park', rowsDown: true, rowsUp: true, h: 2 * ROW + 4 })), { fill: 'none', rowsDown: true, h: ROW }], aisles: Array(na).fill(0).map(() => ({ w: AISLE, kind: 'aisle' })), pads };
      const built = (ctx.foot - rest) * fl, need = Math.ceil(built / 1000 * prog.ratio - 0.01);
      for (const pondAt of ctx.pond >= 3000 ? ['end', 'none'] : ['none']) { const bld = [];
      const o = { pond: ctx.pond, pondAt, shift: 'bottom', curveR: 0, entry: { w: 30, at: (cx[0] + cx[1]) / 2 }, keep, anchors, solid: solid.map(poly => ({ kind: 'building', use: 'amenity', poly })), spec: { pads: prog.pads || 0, ...(sideRow ? { sideRow } : {}) }, xNeed: need, xHave: 0 };
      let a; try { a = H.attempt(plan, F, seq, prog, o); } catch (e) { if (globalThis.SP_DEBUG) console.log('center failed', e.stack); a = null; } if (!a) continue;
      if (H.tally(a.els, prog).stalls < need * 0.7) continue; // (built centers park under our ratio: the one traced has about 3 a thousand; much under and the usual layouts do better)
      const sfOf = r => Math.round((r[1][0] - r[0][0]) * (r[2][1] - r[1][1])), mk = (r, use, name, note) => ({ kind: 'building', x: (r[0][0] + r[1][0]) / 2, y: (r[0][1] + r[2][1]) / 2, w: r[1][0] - r[0][0], d: r[2][1] - r[1][1], use, floors: fl, name, note: note + ' · ' + (sfOf(r) * fl).toLocaleString('en-US') + ' sf', center: true });
      bld.push(mk(anchor, 'retail', 'Anchor', 'Grocery anchor · storefront to the parking'), { kind: 'truck', x: (tx0 + tx1) / 2, y: (ay0 - walk - 2 + ay1) / 2, w: LOAD, d: dA + walk + 2, name: '', note: 'Loading', center: true });
      if (service) bld.push({ kind: 'truck', x: (ax0 + ax1) / 2, y: ay1 + 2 + 13, w: wA + 4, d: 26, name: '', note: 'Service drive', center: true });
      if (wing) bld.push(mk(wing, 'retail', 'Shops A', 'Inline shops · storefronts to the parking')); if (shopsB) bld.push(mk(shopsB, 'retail', 'Shops B', dB > DW + 20 ? 'Junior anchor' : 'Inline shops'));
      a.els.push(...bld);
      const f = H.take(plan, a, prog, ctx.foot, 'center|' + na + '|' + side, { deep: false, align: 'front', seq, o, wing: { wholes: bld }, center: true }, 'Anchored center'); // (align: the frame a re-fit lays the rows in again, the one the buildings were placed in) // (a re-fit lays the rows out again and puts the buildings back: placeWing)
      f.score += 60 + (prog.anchor ? 40 : 0) + (wing ? 10 : 0); // (as a center is built: the anchor's storefront faces its field by construction)
      if (rest > 3000) f.notes = (f.notes || []).concat(['Fits about ' + Math.round((ctx.foot - rest) * fl).toLocaleString('en-US') + ' of the ' + Math.round(ctx.foot * fl).toLocaleString('en-US') + ' sq ft asked for: the rest of the shops would take a second wing.']);
      out.push(f); }
      if (out.length) break;
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 1);
}
