// Grocery-anchored shopping centers, as they're built (traced from a built one): the anchor box at the back of the lot
// with its storefront toward the street and the parking field between them, a wing of inline shops down the far side
// facing the field (an L with the anchor), pads along the street in front, the loading beside the anchor on the wing's
// side, a service drive behind when the lot is deeper than the field needs. Candidates the way lib/sitecorner.mjs makes
// them: the buildings fixed, the rows laid round them by attempt(), ranked with the rest (and ahead of them when the
// words ask for an anchor).
import * as S from './siteplan.mjs';
import { cornerOf, frameFor } from './sitefuel.mjs';
import { restripeAngled } from './siteparking.mjs';

const ROW = 18, AISLE = 24, WALK = 12, LOAD = 40, DW = 70, box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

// the anchor's floor area: as the words say ("a 52,000 sf grocery", "a 60,000 sf anchor"), else half of a big retail program
export const anchorOf = prog => prog.anchor || (prog.use === 'retail' && !prog.buildings && !prog.max && (prog.gfa || 0) >= 60000 ? Math.round(prog.gfa / 2) : 0);

// ctx: { foot (the footprint asked for, sq ft), pond (detention area) }; H: the engine's helpers (as cornerRetail gets)
// Angled parking asked for (prog.parkAngle): the field's aisles turned one-way with angled rows (lib/siteparking.mjs
// restripeAngled), a two-way drive put across aisle ends that stop in the open paving (rows there giving up whole
// stalls); where that doesn't park the center, only the aisles that already end at drives; else square stalls, saying so.
export function anchoredCenter(plan, prog, ctx, H) {
  if (!prog.parkAngle) return anchored1(plan, prog, ctx, H, null);
  for (const mode of ['bridge', 'plain']) { const r = anchored1(plan, prog, ctx, H, mode); if (r[0]?.parked || r[0]?.parkedNear) return r; } // (parkedNear: the need and the second driveway's stalls, not the accessible stalls' extra margin)
  return anchored1(plan, { ...prog, parkAngle: null }, ctx, H, null).map(f => ({ ...f, notes: ['Angled parking was asked for, but with angled stalls this center doesn’t park on this lot (an angled stall takes more of a row than a square one): square stalls on two-way aisles instead.', ...(f.notes || [])] }));
}
function anchored1(plan, prog, ctx, H, angMode) {
  const A = anchorOf(prog); if (!A || ctx.foot == null || prog.zones || prog.max) return [];
  const corner = cornerOf(plan), out = [], fl = prog.floors || 1, footA = Math.min(A, ctx.foot) / fl, footS = Math.max(0, ctx.foot - A / fl);
  const wA0 = Math.round(Math.sqrt(footA * 1.2)), dA0 = footA / wA0; // (the storefront the long side; the depth to the floor area asked for)
  for (const s of corner ? [null] : [1, -1]) { // the wing on the far side from the side street; an inside lot: either side
    let F; try { F = corner ? frameFor(plan, 'front', corner, H) : H.frameOf(plan, false, 'front'); } catch { continue; } if (!F || F.deep) continue;
    const side = corner ? F.side || 1 : s, P = H.profile(F), yF = P.p[0], mid = (F.X0 + F.X1) / 2, ysp = H.spans(F, mid - 2, mid + 2, 'build', [], true), yB = ysp.length ? Math.min(P.p[1], Math.max(...ysp.map(v => v[1]))) : P.p[1], pads = prog.pads > 0, bot = pads ? ROW + WALK + 50 + 30 : ROW; // (yB: the back build line itself, not the profile's bin)
    // the field as deep as the parking needs (about two rows of 9 ft stalls an aisle across the lot, less the wing and
    // the entries), then deeper; a field much deeper than that leaves empty bays between the street and the stores
    const fieldW = Math.max(100, F.X1 - F.X0 - (footS > 2000 ? DW + WALK + ROW : 0)), needAll = Math.ceil(ctx.foot * fl / 1000 * (prog.ratio || 4)), perAisle = 2 * Math.floor(fieldW / 9) * 0.85;
    const n0 = Math.max(1, Math.min(6, Math.ceil(needAll * 1.1 / perAisle))), nas = [...Array(7 - n0).keys()].map(k => n0 + k).concat([...Array(n0 - 1).keys()].map(k => n0 - 1 - k));
    for (const na of nas) {
      const Hs = bot + na * AISLE + (na - 1) * (2 * ROW + 4) + ROW; let ay0 = yF + Hs + WALK, wA = wA0, dA = dA0, ay1 = ay0 + dA;
      let bsp = null; const spanAt = y1 => H.spans(F, ay0, y1, 'build').sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0] || null;
      if (ay1 > yB) { let d2 = Math.floor(yB - ay0); for (let k = 0; k < 8 && !bsp && d2 >= 120; k++, d2 -= 4) bsp = spanAt(ay0 + d2); const w2 = footA / Math.max(1, d2 + 4); if (bsp && w2 / (d2 + 4) <= 1.8) { wA = w2; dA = d2 + 4; ay1 = ay0 + dA; } else continue; } // (a shallower, wider anchor where one more aisle fits that way)
      else bsp = spanAt(ay1); if (!bsp || bsp[1] - bsp[0] < wA + LOAD + (footS > 2000 ? DW + 24 : 0)) continue;
      // the anchor toward the side street, its back on the back build line when that's within a wide walk of the field
      // (a plaza in front of the store), else at the field with a service drive behind; the loading beside it on the wing's side
      const gap = yB - 1 - ay1, back = gap <= 40; if (back) { ay0 += gap; ay1 += gap; }
      const ax0 = side > 0 ? bsp[1] - wA : bsp[0], ax1 = ax0 + wA, tx0 = side > 0 ? ax0 - LOAD : ax1, tx1 = tx0 + LOAD, walk = WALK + (back ? gap : 0);
      const anchor = box(ax0, ay0, ax1, ay1), truck = box(tx0, ay0 - walk - 2, tx1, ay1), keep = [box(ax0 - 2, ay0 - walk + 0.5, ax1 + 2, ay1 + 2), box(tx0 - 1, ay0 - walk + 0.5, tx1 + 1, ay1 + 1)], solid = [S.grow(anchor, 8), S.grow(truck, 2)], anchors = [anchor];
      const service = !back && gap >= 30 ? box(ax0 - 2, ay1 + 2, ax1 + 2, ay1 + 2 + 26) : null; if (service) { solid.push(service); keep.push(S.grow(service, 1)); }
      // the shops: in line with the anchor along the back (a strip, its storefronts on the anchor's line), or a wing down
      // the far side (an L round the field, as the one traced), whichever the lot takes; both tried
      const K0 = keep, S0 = solid, A0 = anchors;
      for (const inline of footS > 2000 ? [true, false] : [false]) {
      const keep = K0.slice(), solid = S0.slice(), anchors = A0.slice(); // (each way its own copies: a recipe keeps them)
      // the wing: down the far side from the back, as long as the shops need or the lot allows (to the front band)
      let wing = null, rest = footS, sideRow = null;
      if (footS > 2000 && !inline) {
        let wx0 = side > 0 ? bsp[0] : bsp[1] - DW, wx1 = wx0 + DW, ys = null; // (the column stepped in from the far side until it's buildable from the front band to the back: a lot line a little off square)
        for (let k = 0; k < 12; k++, wx0 += side > 0 ? 4 : -4, wx1 = wx0 + DW) { ys = H.spans(F, wx0, wx1, 'build', [], true).find(([a, b]) => a <= ay1 - 10 && b >= ay1 - 0.01) || null; if (ys && ys[0] <= yF + bot + 30) break; }
        if (ys) { const y1 = Math.min(ys[1], ay1), y0 = Math.max(ys[0], yF + bot + 30, y1 - footS / DW); if (y1 - y0 >= 80 && (side > 0 ? tx0 - wx1 : wx0 - tx1) >= 24) {
          // (shops the wing can't hold: at least a 60 ft building's worth left for the second building, else they'd be lost)
          let y0b = y0; const left = footS - (y1 - y0) * DW, minB = 60 * DW; if (left > 1 && left < minB && y1 - (y0 + (minB - left) / DW) >= 80) y0b = y0 + (minB - left) / DW;
          wing = box(wx0, y0b, wx1, y1); rest = footS - (y1 - y0b) * DW; anchors.push(wing); solid.push(S.grow(wing, 8));
          keep.push(side > 0 ? box(wx0 - 1e4, y0b - 2, wx1 + WALK + ROW - 0.5, 1e5) : box(wx0 - WALK - ROW + 0.5, y0b - 2, wx1 + 1e4, 1e5)); // (the row of stalls along its storefront walk: spec.sideRow)
          sideRow = side > 0 ? { x0: wx1 + WALK, x1: wx1 + WALK + ROW, row: -1 } : { x0: wx0 - WALK - ROW, x1: wx0 - WALK, row: 1 }; } }
      }
      // shops left over: a second building along the back between the wing and the loading, when there's a shop's width
      // (its storefront on the anchor's line and its back on the back line too: as deep as the anchor, a junior anchor,
      // when the anchor is much deeper than a shop; else a shop's depth with the land behind it the service side)
      let shopsB = null, dB = DW; if (rest > 3000) { const bx0 = side > 0 ? (wing ? wing[1][0] + 24 : bsp[0]) : tx1 + 24, bx1 = side > 0 ? tx0 - 24 : (wing ? wing[0][0] - 24 : bsp[1]);
        for (const d of inline ? [DW] : dA - DW > 40 ? [dA, DW] : [DW]) { const L = Math.min(bx1 - bx0, rest / d); if (L >= 60) { const x0 = side > 0 ? bx1 - L : bx0; dB = d; shopsB = box(x0, ay0, x0 + L, ay0 + d); rest -= L * d; anchors.push(shopsB); solid.push(S.grow(shopsB, 8)); keep.push(box(x0 - 2, ay0 - walk + 0.5, x0 + L + 2, ay1 + 2)); break; } } }
      if (inline && rest > 1) continue; // (the back line too short for every shop in line: the L takes them)
      // the strip's field in front of its stores (and a bay past the end shop), not across the whole lot: the land past it
      // is left for later (pads, a second phase) instead of stalls 600 ft from any door
      if (inline && shopsB) { const far = side > 0 ? shopsB[0][0] - 60 : shopsB[1][0] + 60; if (side > 0 ? far - bsp[0] > 120 : bsp[1] - far > 120) keep.push(side > 0 ? box(-1e5, yF - 1e3, far, 1e5) : box(far, yF - 1e3, 1e5, 1e5)); }
      const cx = wing ? (side > 0 ? [wing[1][0] + WALK + ROW, bsp[1]] : [bsp[0], wing[0][0] - WALK - ROW]) : inline && shopsB ? (side > 0 ? [Math.max(bsp[0], shopsB[0][0] - 60), bsp[1]] : [bsp[0], Math.min(bsp[1], shopsB[1][0] + 60)]) : [bsp[0], bsp[1]];
      const seq = { blocks: [pads ? { fill: 'pads', D: 50, rowsUp: true, h: ROW + WALK + 50 + 30 } : { fill: 'none', rowsUp: true, h: ROW }, ...Array(na - 1).fill(0).map(() => ({ fill: 'park', rowsDown: true, rowsUp: true, h: 2 * ROW + 4 })), { fill: 'none', rowsDown: true, h: ROW }], aisles: Array(na).fill(0).map(() => ({ w: AISLE, kind: 'aisle' })), pads };
      const built = (ctx.foot - rest) * fl, need = Math.ceil(built / 1000 * prog.ratio - 0.01);
      for (const pondAt of ctx.pond >= 3000 ? ['end', 'none'] : ['none']) { const bld = [];
      const o = { pond: ctx.pond, pondAt, shift: 'bottom', curveR: 0, entry: { w: 30, at: (cx[0] + cx[1]) / 2 }, keep, anchors, solid: solid.map(poly => ({ kind: 'building', use: 'amenity', poly })), spec: { pads: prog.pads || 0, ...(sideRow ? { sideRow } : {}) }, xNeed: need + (need >= 150 ? 12 : 0), xHave: 0 }; // (a field this size gets a second way in after, its driveway through a double row: about 12 stalls kept for it, or it ends a few short)
      let a; try { a = H.attempt(plan, F, seq, prog, o); } catch (e) { if (globalThis.SP_DEBUG) console.log('center failed', e.stack); a = null; } if (!a) continue;
      let angN = 0, angOf = 0; if (prog.parkAngle) { const clear = poly => { const xs = poly.map(q => q[0]), ys = poly.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs); return H.spans(F, Math.min(...ys), Math.max(...ys), 'pave', []).some(([p, q]) => p <= x0 + 0.5 && q >= x1 - 0.5); }, rs = restripeAngled(a.els, prog.parkAngle === 45 ? 45 : 60, angMode === 'bridge' ? { clear } : {}); a.els = rs.els; angN = rs.n; angOf = rs.of; } // (angled parking asked for: the field's aisles one-way, its rows at the angle, lib/siteparking.mjs)
      if (H.tally(a.els, prog).stalls < need * 0.7) continue; // (built centers park under our ratio: the one traced has about 3 a thousand; much under and the usual layouts do better)
      const sfOf = r => Math.round((r[1][0] - r[0][0]) * (r[2][1] - r[1][1])), mk = (r, use, name, note) => ({ kind: 'building', x: (r[0][0] + r[1][0]) / 2, y: (r[0][1] + r[2][1]) / 2, w: r[1][0] - r[0][0], d: r[2][1] - r[1][1], use, floors: fl, name, note: note + ' · ' + (sfOf(r) * fl).toLocaleString('en-US') + ' sf', center: true });
      bld.push(mk(anchor, 'retail', 'Anchor', 'Grocery anchor · storefront to the parking'), { kind: 'truck', x: (tx0 + tx1) / 2, y: (ay0 - walk - 2 + ay1) / 2, w: LOAD, d: dA + walk + 2, name: '', note: 'Loading', center: true });
      if (service) bld.push({ kind: 'truck', x: (ax0 + ax1) / 2, y: ay1 + 2 + 13, w: wA + 4, d: 26, name: '', note: 'Service drive', center: true });
      if (wing) bld.push(mk(wing, 'retail', 'Shops A', 'Inline shops · storefronts to the parking')); if (shopsB) bld.push(mk(shopsB, 'retail', 'Shops B', dB > DW + 20 ? 'Junior anchor' : 'Inline shops · storefronts to the parking'));
      a.els.push(...bld);
      const f = H.take(plan, a, prog, ctx.foot, 'center|' + na + '|' + side, { deep: false, align: 'front', seq, o, wing: { wholes: bld }, center: true }, 'Anchored center'); // (align: the frame a re-fit lays the rows in again, the one the buildings were placed in) // (a re-fit lays the rows out again and puts the buildings back: placeWing)
      f.score += 60 + (prog.anchor ? 40 : 0) + (wing ? 10 : 0) + (inline ? 15 : 0) + (rest <= 1 ? 20 : 0); // (as a center is built: the anchor's storefront faces its field by construction; every shop placed first)
      if (prog.parkAngle) f.notes = (f.notes || []).concat([angN ? 'Angled parking: ' + (prog.parkAngle === 45 ? 45 : 60) + '° stalls on ' + (angN < angOf ? angN + ' of the ' + angOf + ' aisles, made one-way (the arrows; the others end in the open paving rather than at a drive, so they stay two-way with square stalls)' : 'one-way aisles (the arrows), neighbouring aisles running opposite ways') + ', joined at both ends by two-way drives; ' + S.ANGLED[prog.parkAngle === 45 ? 45 : 60].d + ' ft rows on the same land as the square layout (planning sizes from ULI / ITE tables). Accessible stalls stay square to the aisle, with their access aisles.' : 'Angled parking was asked for, but no aisle here meets a two-way drive at both ends, so the stalls stay square.']);
      if (rest > 3000) f.notes = (f.notes || []).concat(['Fits about ' + Math.round((ctx.foot - rest) * fl).toLocaleString('en-US') + ' of the ' + Math.round(ctx.foot * fl).toLocaleString('en-US') + ' sq ft asked for: the rest of the shops would take a second wing.']);
      f.parked = H.tally(a.els, prog).stalls - S.adaLoss(H.tally(a.els, prog).stalls) >= need + 24; if (f.parked) f.score += 30;
      if (angMode) { const raw = a.els.filter(e => e.kind === 'parking' && !e.rv && !e.vac).reduce((t, e) => t + S.stalls(e).count, 0); f.parkedNear = raw - S.adaLossOf(a.els, raw) >= need + 2; } // (angled: the need itself, a couple to spare; the run's own checks judge the finished plan) // (parked with room for the second driveway a field this size gets after, and the accessible stalls' aisles)
      out.push(f); }
      }
      if (out.length && out.slice().sort((a, b) => b.score - a.score)[0].parked) break; // (the best one a few stalls short: one aisle more before settling for it)
    }
  }
  return out.sort((a, b) => !!b.parked - !!a.parked || !!b.parkedNear - !!a.parkedNear || b.score - a.score).slice(0, 1); // (parked first: a center a few stalls short fails the parking check)
}
