// The layout generator's commercial arrangements (lib/sitegen.mjs walks their parameter grids the same way as the
// apartment ones, so a shopping center, a flex park or a storage yard comes as a list of layouts to pick from):
//  - shops: the inline building at the back of its parking field with the storefronts to the field, pads on the
//    street (the ends first: a corner pad is worth the most), a wing down one side (an L) when the shops are longer
//    than the lot is wide, a service drive behind when the lot is deeper than the field needs;
//  - flex and warehouse parks: a building with its car parking on the office side and its loading behind, the
//    loading a court shared with a second building facing the other way (rear-loaded pairs) or an apron of its own
//    (front-loaded), the buildings along the street or running back from it;
//  - self storage: the climate-controlled building (or the office) on the street with its visitor stalls, the gate
//    beside it, the drive-up rows behind between drive aisles, across the yard or running back.
// Frame feet: the street along the bottom, y up. Each arrangement returns { els, placed (footprint sq ft), label, key }.
import * as S from './siteplan.mjs';
import { ROW, AISLE, WALK, bld, drive, rowH, rowV, splitRow, awayFromCorner } from './sitegen.mjs';

export const USES = ['retail', 'industrial', 'storage'];
const SERVICE = 26, APRON = 60, PAD_W = 70, PAD_D = 50, PAD_SF = PAD_W * PAD_D;
const cutBy = (p, R) => sp => [p.pond === 'left' ? sp[0] + (sp[1] - sp[0]) * R.pondShare : sp[0], p.pond === 'right' ? sp[1] - (sp[1] - sp[0]) * R.pondShare : sp[1]]; // (the pond's land kept clear at a side)
const backOf = (p, R) => p.pond === 'back' ? R.vB - R.pondDepth : R.vB; // (or at the back)
const centerX = (B, x0, x1) => { if (!B.length) return; const xs = B.flatMap(e => [e.x - e.w / 2, e.x + e.w / 2]), sh = ((x0 + x1) - (Math.min(...xs) + Math.max(...xs))) / 2; for (const e of B) e.x += sh; };
const centerY = (B, y0, y1) => { if (!B.length) return; const ys = B.flatMap(e => [e.y - e.d / 2, e.y + e.d / 2]), sh = ((y0 + y1) - (Math.min(...ys) + Math.max(...ys))) / 2; for (const e of B) e.y += sh; };
// buildings of one depth along x (or y) up to `need` sq ft of footprint: whole ones of maxL, the last one shorter, none under minL
function barsX(x0, x1, y0, y1, need, T, mk, dir = 1) { const out = []; let left = need, a = dir > 0 ? x0 : x1; const D = y1 - y0;
  while (left > T.minL * D * 0.5 && (dir > 0 ? x1 - a : a - x0) >= T.minL) { const L = Math.min(T.maxL, dir > 0 ? x1 - a : a - x0, Math.max(T.minL, left / D)); out.push(mk(dir > 0 ? a : a - L, y0, dir > 0 ? a + L : a, y1)); left -= L * D; a += dir * (L + T.gap); }
  return { els: out, placed: need - left }; }
function barsY(x0, x1, y0, y1, need, T, mk) { const out = []; let left = need, a = y0; const D = x1 - x0;
  while (left > T.minL * D * 0.5 && y1 - a >= T.minL) { const L = Math.min(T.maxL, y1 - a, Math.max(T.minL, left / D)); out.push(mk(x0, a, x1, a + L)); left -= L * D; a += L + T.gap; }
  centerY(out, y0, y1); return { els: out, placed: need - left }; }
// pieces cut back to a stretch of x (a lot whose sides slant: the end drives run where every band has room); gone when too short
function clipX(els, lo, hi, minL, test = () => true) { for (let i = els.length - 1; i >= 0; i--) { const e = els[i]; if (!(e.kind === 'building' || e.kind === 'truck') || !test(e)) continue; const x0 = Math.max(e.x - e.w / 2, lo), x1 = Math.min(e.x + e.w / 2, hi); if (x1 - x0 < (e.kind === 'building' ? minL : 40)) els.splice(i, 1); else { e.x = (x0 + x1) / 2; e.w = x1 - x0; } } }
const no = why => { if (globalThis.SP_DEBUG) console.log('  com', why); return null; }; // (why an arrangement doesn't fit, when asked)
const truck = (x0, y0, x1, y1, note, o = {}) => ({ kind: 'truck', x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, d: y1 - y0, note, ...o });

// ---------- shops ----------
export function shops(R, p, prog, foot) {
  const { front } = R, els = [], D = 70, T = { minL: 60, maxL: 400, gap: 30 }, cut = cutBy(p, R), vB = backOf(p, R), yB = Math.min(R.yB, vB), fl = prog.floors || 1;
  const W0 = R.band('pave', R.vF, R.vF + ROW); if (!W0) return null; const w0 = cut(W0), width = w0[1] - w0[0]; if (width < 200) return null;
  const cx = p.entrances === 2 ? w0[0] + width * 0.62 : (w0[0] + w0[1]) / 2, ex = awayFromCorner(w0[0] + width * 0.22, R), throats = [[cx - 40, cx + 40]].concat(p.entrances === 2 ? [[ex - 40, ex + 40]] : []);
  // the pads on the street: spread along the frontage from the ends in, clear of the entries' throats; the field's first row behind them
  const padN = p.pads, y0 = Math.max(R.yF, R.vF + 10), pads = [];
  if (padN) { const ideal = padN === 1 ? [w0[0] + PAD_W / 2 + 10] : Array.from({ length: padN }, (_, k) => w0[0] + PAD_W / 2 + 10 + k * (width - PAD_W - 20) / (padN - 1));
    for (const x0 of ideal) { let best = null; for (let d = 0; d <= 120 && best == null; d += 10) for (const x of [x0 + d, x0 - d]) { if (x < w0[0] + PAD_W / 2 + 5 || x > w0[1] - PAD_W / 2 - 5) continue; const r = [x - PAD_W / 2 - 12, x + PAD_W / 2 + 12]; if (throats.some(t => r[0] < t[1] && r[1] > t[0]) || pads.some(q => Math.abs(q - x) < PAD_W + 30)) continue; best = x; break; } if (best == null) return null; pads.push(best); }
    for (const x of pads) els.push(bld(x - PAD_W / 2, y0, x + PAD_W / 2, y0 + PAD_D, { use: 'retail', floors: 1, note: 'Drive-thru pad' })); }
  const fieldY = padN ? y0 + PAD_D + 22 : R.vF, need = Math.max(0, foot - pads.length * PAD_SF), side = p.form === 'L-left' ? -1 : p.form === 'L-right' ? 1 : 0;
  // the wing's column down a side (the field's end drive runs beside it)
  let wing = null, fx0 = w0[0], fx1 = w0[1];
  if (side) { const Bw = R.band('build', fieldY + 60, fieldY + 61); if (!Bw) return null; const bw = cut(Bw), wx0 = side < 0 ? bw[0] : bw[1] - D, wx1 = wx0 + D, col = R.col('build', wx0, wx1); if (!col) return null;
    wing = { x0: wx0, x1: wx1, y0: Math.max(col[0], fieldY + ROW + AISLE + 10) }; if (side < 0) fx0 = wx1 + WALK; else fx1 = wx0 - WALK; }
  // the field: bays of stalls and aisles from the pads up to the storefront aisle, the spine's throat kept clear
  let y = fieldY; const aisles = [], ends = [];
  for (let i = 0; i < p.bays; i++) { const V1 = R.band('pave', y, y + ROW + AISLE + ROW); if (!V1) return null; const v = cut(V1), x0 = Math.max(v[0], fx0), x1 = Math.min(v[1], fx1); if (x1 - x0 < 150) return null; ends.push([x0, x1]);
    const g = [[cx - (i ? 13 : 36), cx + (i ? 13 : 36)]].concat(i === 0 && p.entrances === 2 ? [[ex - 36, ex + 36]] : []);
    els.push(...splitRow(x0 + AISLE + 2, x1 - AISLE - 2, y, 1, g, rowH)); y += ROW; aisles.push(y); els.push(drive(x0, y, x1, y + AISLE)); y += AISLE;
    if (i < p.bays - 1) { els.push(...splitRow(x0 + AISLE + 2, x1 - AISLE - 2, y, -1, [[cx - 13, cx + 13]], rowH)); y += ROW; } }
  y += 12; // the storefront walk
  const Bb = R.band('build', y, y + D); if (!Bb || y + D > yB + 0.5) return null; const b = cut(Bb), e0 = Math.max(...ends.map(e => e[0])), e1 = Math.min(...ends.map(e => e[1]));
  const bx0 = Math.max(b[0], side < 0 ? wing.x0 : e0 + AISLE + WALK), bx1 = Math.min(b[1], side > 0 ? wing.x1 : e1 - AISLE - WALK); if (bx1 - bx0 < T.minL) return null;
  const mk = (a, c, d, e) => bld(a, c, d, e, { use: 'retail', floors: fl, note: 'Inline shops · storefronts to the parking' });
  const bar = barsX(bx0, bx1, y, y + D, need / fl, T, mk, side > 0 ? -1 : 1); if (!bar.els.length) return null; if (!side) centerX(bar.els, bx0, bx1); els.push(...bar.els);
  let placed = bar.placed * fl + pads.length * PAD_SF;
  if (wing) { const wy1 = y - 4, L = Math.min(wy1 - wing.y0, Math.max(0, (need / fl - bar.placed) / D)); if (L < T.minL) return null; els.push(bld(wing.x0, wy1 - L, wing.x1, wy1, { use: 'retail', floors: fl, note: 'Inline shops · storefronts to the parking' })); placed += L * D * fl; } // (an L only where the shops need it)
  // the storefront aisle's end drives (up past the shops to a service drive behind when the lot is deeper), the spine and a second entrance
  clipX(els, e0 + AISLE + WALK, e1 - AISLE - WALK, T.minL, e => e.y > fieldY + ROW); // (a slanted side: the bar ends where the end drive runs)
  const top = aisles[aisles.length - 1] + AISLE, SV = y + D + SERVICE + 2 <= vB ? R.band('pave', y + D + 1, y + D + 1 + SERVICE) : null, sv = SV && Math.min(SV[1], e1) - Math.max(SV[0], e0) > 200;
  if (sv) els.push(truck(Math.max(SV[0], e0, side < 0 ? bx0 : e0), y + D + 1, Math.min(SV[1], e1, side > 0 ? bx1 : e1), y + D + 1 + SERVICE, 'Service drive'));
  els.push(drive(e0, aisles[0], e0 + AISLE, sv && side >= 0 && SV[0] <= e0 ? y + D + 1 + SERVICE : top), drive(e1 - AISLE, aisles[0], e1, sv && side <= 0 && SV[1] >= e1 ? y + D + 1 + SERVICE : top));
  els.push(drive(cx - 12, front - 2, cx + 12, top, { name: 'Main entry', entry: true })); if (p.entrances === 2) els.push(drive(ex - 12, front - 2, ex + 12, aisles[0] + AISLE, { name: 'Entrance 2', entry: true }));
  return { els, placed, label: 'Shops at the back of the field' + (wing ? ', an L with a wing down the ' + (side < 0 ? 'left' : 'right') : '') + (pads.length ? ' · ' + pads.length + ' pad' + (pads.length > 1 ? 's' : '') + ' on the street' : '') + ' · ' + p.bays + ' bay' + (p.bays > 1 ? 's' : '') + ' of parking', key: 'shops|' + p.pads + '|' + p.form + '|' + p.bays + '|' + p.pond + '|' + p.entrances };
}

// ---------- flex and warehouse parks ----------
export function flex(R, p, prog, foot) {
  const { front } = R, els = [], fx = !!prog.flex, D = fx ? (p.shallow ? 60 : 100) : Math.min(240, Math.max(160, Math.round(Math.sqrt(foot / 2.5) / 10) * 10)), apron = p.shallow ? 24 : APRON, g8 = p.shallow ? 0 : 8, /* (a small lot: a 24 ft drive behind instead of an apron, no planted gaps) */ court = fx ? 120 : 130, T = { minL: fx ? (p.shallow ? 80 : 90) : 200, maxL: fx ? 420 : 900, gap: 30 }, cut = cutBy(p, R), vB = backOf(p, R), yB = Math.min(R.yB, vB), fl = prog.floors || 1;
  const mk = (a, b, c, d) => bld(a, b, c, d, { use: 'industrial', floors: fl, note: fx ? 'Shallow-bay flex · grade-level doors behind' : 'Warehouse · dock-high doors behind' }), tk = fx ? { grade: true } : {};
  let need = foot, placed = 0;
  if (p.orient === 'facing') { // modules from the street up: a row and aisle, the building, its loading behind
    const W0 = R.band('pave', R.vF, R.vF + ROW); if (!W0) return no('flex: no front band'); const w0 = cut(W0), width = w0[1] - w0[0], cx = (w0[0] + w0[1]) / 2, ex = awayFromCorner(w0[0] + width * 0.2, R); if (width < 150) return no('flex: too narrow');
    let y = R.vF; const aisles = [], ends = [];
    for (let m = 0; m < p.rows && need > 0; m++) {
      const V1 = R.band('pave', y, y + ROW + AISLE); if (!V1) return no('flex: no band for the row'); const [x0, x1] = cut(V1); ends.push([x0, x1]);
      els.push(...splitRow(x0 + AISLE + 2, x1 - AISLE - 2, y, 1, [[cx - 36, cx + 36]].concat(m === 0 && p.entrances === 2 ? [[ex - 36, ex + 36]] : []), rowH)); y += ROW; aisles.push(y); els.push(drive(x0, y, x1, y + AISLE)); y += AISLE + g8;
      const B1 = R.band('build', y, y + D); if (!B1 || y + D > yB + 0.5) return no('flex 4 y ' + Math.round(y) + ' D ' + D + ' yB ' + Math.round(yB) + ' vB ' + Math.round(R.vB) + ' yF ' + Math.round(R.yF) + ' band ' + !!B1); const b1 = cut(B1), bx0 = Math.max(b1[0], x0 + AISLE + WALK), bx1 = Math.min(b1[1], x1 - AISLE - WALK); if (bx1 - bx0 < T.minL) return no('flex: the building too short');
      const r1 = barsX(bx0, bx1, y, y + D, need, T, mk); centerX(r1.els, bx0, bx1); els.push(...r1.els); need -= r1.placed; placed += r1.placed; y += D;
      if (p.pairs && need > T.minL * D * 0.5) { const B2 = R.band('build', y + court, y + court + D); if (!B2 || y + court + D > yB + 0.5) return no('flex: no room for the second building'); const b2 = cut(B2), cx0 = Math.max(b2[0], x0 + AISLE + WALK), cx1 = Math.min(b2[1], x1 - AISLE - WALK);
        const Vc = R.band('pave', y, y + court); if (!Vc) return no('flex: no band for the court'); const vc = cut(Vc); ends.push(vc); els.push(truck(vc[0] + AISLE, y, vc[1] - AISLE, y + court, fx ? 'Shared truck court · grade-level doors' : 'Shared truck court', tk)); y += court;
        const r2 = barsX(cx0, cx1, y, y + D, need, T, mk); centerX(r2.els, cx0, cx1); els.push(...r2.els); need -= r2.placed; placed += r2.placed; y += D + g8;
        const V2 = R.band('pave', y, y + AISLE + ROW); if (!V2) return no('flex: no band behind the pair'); const v2 = cut(V2); ends.push(v2); aisles.push(y); els.push(drive(v2[0], y, v2[1], y + AISLE)); y += AISLE; els.push(...splitRow(v2[0] + AISLE + 2, v2[1] - AISLE - 2, y, -1, [], rowH)); y += ROW + g8; }
      else { const V2 = R.band('pave', y, y + apron); if (!V2 || y + apron > vB) return no('flex: no room for the apron'); const v2 = cut(V2); ends.push(v2); aisles.push(y); els.push(truck(v2[0] + AISLE, y, v2[1] - AISLE, y + apron, fx ? (p.shallow ? 'Service drive · grade-level doors' : 'Loading apron · grade-level doors') : 'Truck apron', tk)); y += apron + g8; }
    }
    const e0 = Math.max(...ends.map(e => e[0])), e1 = Math.min(...ends.map(e => e[1])); if (e1 - e0 < 150) return no('flex: the end drives too close'); clipX(els, e0 + AISLE + 2, e1 - AISLE - 2, T.minL); if (!els.some(e => e.kind === 'building')) return no('flex: no building left');
    els.push(drive(e0, aisles[0], e0 + AISLE, y - g8), drive(e1 - AISLE, aisles[0], e1, y - g8)); // (drives down both ends: every aisle and court joined; the pieces cut back to where both run)
    els.push(drive(cx - 12, front - 2, cx + 12, aisles[0] + AISLE, { name: 'Main entry', entry: true })); if (p.entrances === 2) els.push(drive(ex - 12, front - 2, ex + 12, aisles[0] + AISLE, { name: 'Entrance 2', entry: true }));
  } else { // columns across from one side: a row and aisle, the building running back, its loading beside it; a front drive joins the aisles
    const W0 = R.band('pave', R.vF, R.vF + AISLE); if (!W0) return no('flex: no front band'); const w0 = cut(W0), width = w0[1] - w0[0];
    const mod = ROW + AISLE + g8 + D + (p.pairs ? court + D + g8 + AISLE + ROW : apron), tot = p.rows * mod + (p.rows - 1) * 8; if (tot > width + 1) return no('flex: the columns too wide for the lot');
    let x = w0[0] + (width - tot) / 2; const yF = R.vF + AISLE + 6, backs = [], cols = [];
    for (let m = 0; m < p.rows && need > 0; m++) {
      const C1 = R.col('pave', x, x + ROW + AISLE); if (!C1) return no('flex: no column for the row'); const y0 = Math.max(yF, C1[0]), y1 = p.pond === 'back' ? C1[1] - R.pondDepth : C1[1]; if (y1 - y0 < T.minL + AISLE + 20) return no('flex: the column too short');
      els.push(rowV(y0 + 2, y1 - AISLE - 2, x, 1)); x += ROW; cols.push(x); els.push(drive(x, y0 - 6, x + AISLE, y1)); x += AISLE + 8; backs.push(y1);
      const Cb = R.col('build', x, x + D); if (!Cb) return no('flex: no column for the building'); const by0 = Math.max(Cb[0], yF + 4), by1 = Math.min(y1 - AISLE - WALK, Cb[1] - 4);
      const r1 = barsY(x, x + D, by0, by1, need, T, mk); els.push(...r1.els); need -= r1.placed; placed += r1.placed; x += D;
      if (p.pairs && need > T.minL * D * 0.5) { const Cc = R.col('build', x + court, x + court + D); if (!Cc) return no('flex: no column for the second building'); els.push(truck(x, y0, x + court, y1 - AISLE, fx ? 'Shared truck court · grade-level doors' : 'Shared truck court', tk)); x += court;
        const cy0 = Math.max(Cc[0], yF + 4), cy1 = Math.min(y1 - AISLE - WALK, Cc[1] - 4), r2 = barsY(x, x + D, cy0, cy1, need, T, mk); els.push(...r2.els); need -= r2.placed; placed += r2.placed; x += D + 8;
        const C2 = R.col('pave', x, x + AISLE + ROW); if (!C2) return no('flex: no column behind the pair'); els.push(drive(x, y0 - 6, x + AISLE, y1)); cols.push(x); x += AISLE; els.push(rowV(y0 + 2, y1 - AISLE - 2, x, -1)); x += ROW + 8; }
      else { const C2 = R.col('pave', x, x + apron); if (!C2) return no('flex: no column for the apron'); els.push(truck(x, y0, x + apron, y1 - AISLE, fx ? (p.shallow ? 'Service drive · grade-level doors' : 'Loading apron · grade-level doors') : 'Truck apron', tk)); cols.push(x + apron - AISLE); x += apron + 8; }
    }
    const xa = Math.min(...cols), xb = Math.max(...cols) + AISLE, yb = Math.min(...backs); els.push(drive(xa, R.vF, xb, R.vF + AISLE), drive(xa, yb - AISLE, xb, yb)); const cx = (xa + xb) / 2;
    els.push(drive(cx - 12, front - 2, cx + 12, R.vF + AISLE, { name: 'Main entry', entry: true })); if (p.entrances === 2) { const e2 = R.cornerX0 && !R.cornerX1 ? xb - 22 : !R.cornerX0 ? xa + 22 : null; if (e2 != null) els.push(drive(e2 - 12, front - 2, e2 + 12, R.vF + AISLE, { name: 'Entrance 2', entry: true })); }
  }
  if (!els.some(e => e.kind === 'building')) return no('flex: no building placed');
  const word = fx ? (p.shallow ? 'shallow flex buildings' : 'flex buildings') : 'warehouses', n = els.filter(e => e.kind === 'building').length;
  return { els, placed, label: (p.pairs ? 'Rear-loaded pairs round a shared truck court' : 'Front-loaded ' + word + ' with the loading behind') + ' · ' + n + ' ' + (n === 1 ? word.replace(/s$/, '') : word) + (p.orient === 'facing' ? ' along the street' : ' running back from the street'), key: 'flex|' + p.orient + '|' + (p.pairs ? 'pairs' : 'single') + (p.shallow ? '|shallow' : '') + '|' + p.rows + '|' + p.pond + '|' + p.entrances };
}

// ---------- self storage ----------
export function storage(R, p, prog, foot) {
  const { front } = R, els = [], st = prog.storage || {}, fl = prog.floors || 3, cSf = st.climateSf || 0, dSf = st.driveSf || 0, rd = st.rowD || 40, aw = st.aisle || 26, cut = cutBy(p, R), vB = backOf(p, R), yB = Math.min(R.yB, vB);
  const W0 = R.band('pave', R.vF, R.vF + ROW); if (!W0) return null; const w0 = cut(W0), width = w0[1] - w0[0]; if (width < 180) return null;
  const cD = cSf ? p.climateD : 40, cW = cSf ? Math.min(width - 2 * aw - 80, Math.round(cSf / fl / cD)) : 60; if (cSf && (cW < 80 || cW * cD * fl < cSf * 0.8)) return null; // (too deep for its size on this frontage: another depth)
  // the street side: a customer drive inside the planted strip, the visitor stalls, the walk, the building; the gate beside it
  const yD = R.vF + 24, yR = yD + aw, y0 = Math.max(R.yF, yR + ROW + 12), bx0 = p.climate === 'left' ? w0[0] + aw + 10 : p.climate === 'right' ? w0[1] - aw - 10 - cW : (w0[0] + w0[1]) / 2 - cW / 2, bx1 = bx0 + cW; if (y0 + cD > yB + 0.5) return null;
  const Bc = R.band('build', y0, y0 + cD); if (!Bc || bx0 < Bc[0] - 0.5 || bx1 > Bc[1] + 0.5) return null;
  els.push(bld(bx0, y0, bx1, y0 + cD, { use: 'storage', floors: cSf ? fl : 1, storage: cSf ? 'climate' : 'office', note: cSf ? 'Climate-controlled · office at the front' : 'Office' }));
  els.push(drive(w0[0], yD, w0[1], yD + aw), rowH(bx0 + 6, bx1 - 6, yR, 1)); // (the stalls open onto the customer drive... no: the walk side is above; they face the drive below)
  const gx = p.climate === 'left' ? bx1 + 40 : p.climate === 'right' ? bx0 - 40 : bx1 + 40; els.push(drive(gx - 13, front - 2, gx + 13, yD + aw, { name: 'Main entry', entry: true }));
  let placed = cW * cD, driveSf = 0, y = y0 + cD + 10, rows = 0; const top = [];
  if (p.orient === 'across') { // the yard: aisles and rows across, a drive down each end joining the aisles, a single-sided row at the back when it's all that fits
    for (let k = 0; k < 14 && driveSf < dSf; k++) { const A = R.band('pave', y, y + aw); if (!A) break; const a = cut(A); els.push(drive(a[0], y, a[1], y + aw)); top.push([a, y]); y += aw;
      const Bk = R.band('build', y, y + rd); if (!Bk || y + rd > yB + 0.5) { if (Bk && y + 30 <= yB + 0.5) { const b = cut(Bk), L = b[1] - b[0] - 2 * aw - 8; if (L > 60) { els.push(bld(b[0] + aw + 4, y, b[1] - aw - 4, y + 30, { use: 'storage', floors: 1, storage: 'drive', note: 'Drive-up units' })); driveSf += L * 30; rows++; } } break; }
      const b = cut(Bk), L = Math.min(b[1] - b[0] - 2 * aw - 8, Math.max(60, (dSf - driveSf) / rd)); if (L < 60) break; const x0 = b[0] + aw + 4; els.push(bld(x0, y, x0 + L, y + rd, { use: 'storage', floors: 1, storage: 'drive', note: 'Drive-up units' })); driveSf += L * rd; rows++; y += rd; }
    if (!top.length) return null; const e0 = Math.max(w0[0], ...top.map(t => t[0][0])), e1 = Math.min(w0[1], ...top.map(t => t[0][1])), yT = top[top.length - 1][1] + aw; if (e1 - e0 < 160) return null;
    clipX(els, e0 + aw + 4, e1 - aw - 4, 60); if (!els.some(e => e.storage === 'climate' || e.storage === 'office')) return null; els.push(drive(e0, yD, e0 + aw, yT), drive(e1 - aw, yD, e1, yT)); // (the end drives from the customer drive to the last aisle, where every band has room)
  } else { // the rows running back from a yard drive behind the building: an aisle beside each row, the aisles open at the yard drive
    const A = R.band('pave', y, y + aw); if (!A) return null; const a = cut(A); els.push(drive(a[0], y, a[1], y + aw)); const yA = y + aw; let x = a[0]; const xs = [];
    for (let k = 0; k < 16 && driveSf < dSf; k++) { const Ca = R.col('pave', x, x + aw); if (!Ca) break; const y1 = p.pond === 'back' ? Ca[1] - R.pondDepth : Ca[1]; if (y1 - yA < 80) break; els.push(drive(x, y, x + aw, y1)); xs.push(x); x += aw;
      const Cr = R.col('build', x, x + rd); if (!Cr || x + rd > a[1] - aw) { if (Cr && x + 30 <= a[1]) { const L = Math.min(Cr[1], y1) - yA - 4; if (L > 60) { els.push(bld(x, yA + 2, x + 30, yA + 2 + L, { use: 'storage', floors: 1, storage: 'drive', note: 'Drive-up units' })); driveSf += L * 30; rows++; } } break; }
      const L = Math.min(Math.min(Cr[1], y1) - yA - 4, Math.max(60, (dSf - driveSf) / rd)); if (L < 60) break; els.push(bld(x, yA + 2, x + rd, yA + 2 + L, { use: 'storage', floors: 1, storage: 'drive', note: 'Drive-up units' })); driveSf += L * rd; rows++; x += rd; }
    if (!xs.length) return null; const E = R.band('pave', yD, yA); if (!E) return null; const e = cut(E), e0 = Math.max(e[0], w0[0]), e1 = Math.min(e[1], w0[1]); if (bx0 < e0 + aw || bx1 > e1 - aw) return null; els.push(drive(e0, yD, e0 + aw, yA), drive(e1 - aw, yD, e1, yA)); // (the customer drive joined to the yard drive at both ends)
  }
  if (!rows) return null; placed += driveSf;
  return { els, placed, label: 'Self storage yard · the climate-controlled building ' + (p.climate === 'center' ? 'centered' : 'at the ' + p.climate) + ' on the street · ' + rows + ' row' + (rows > 1 ? 's' : '') + ' of drive-up units ' + (p.orient === 'across' ? 'across the yard' : 'running back'), key: 'storage|' + p.orient + '|' + p.climate + '|' + p.climateD + '|' + p.pond + '|' + p.entrances };
}

// ---------- a retail plaza round a central court ----------
// shops on three sides of a court open to the street: the plaza at its mouth, the park lawn beyond, the pavilion (the
// hang-out) at its head; parking across the front and beside the wings, a service drive behind the back bar
export function plaza(R, p, prog, foot) {
  const { front } = R, D = 70, fl = prog.floors || 1, cut = cutBy(p, R), vB = backOf(p, R), yB = Math.min(R.yB, vB), items = new Set(prog.court || ['plaza', 'lawn', 'pavilion']), ratio = prog.ratio || 4;
  const W0 = R.band('pave', R.vF, R.vF + ROW); if (!W0) return no('plaza: no front band'); const w0 = cut(W0), width = w0[1] - w0[0]; if (width < 300) return no('plaza: too narrow');
  // the front field's bands first (nothing drawn yet): the U sits where the field and the back bar's band both have room
  let y = R.vF; const bands = [];
  for (let i = 0; i < p.bays; i++) { const V1 = R.band('pave', y, y + ROW + AISLE + ROW); if (!V1) return no('plaza: no band'); const v = cut(V1); if (v[1] - v[0] < 300) return no('plaza: too narrow'); bands.push({ y, v }); y += ROW + AISLE + (i < p.bays - 1 ? ROW : 0); }
  const yU = y + 12, cw = p.court, need = foot / fl, e0 = Math.max(...bands.map(q => q.v[0])), e1 = Math.min(...bands.map(q => q.v[1])), ex = awayFromCorner(w0[0] + width * 0.22, R);
  const minWl = items.has('pavilion') && (items.has('lawn') || items.has('park')) ? 150 : items.has('lawn') || items.has('park') || items.has('pavilion') ? 110 : 90, maxWl = Math.min(cw * 1.3, yB - (yU + D) - 4); if (maxWl < minWl) return no('plaza: too shallow'); // (the court deep enough for what it holds)
  // one try at a wing length: the U, the court, the parking; null when the lot has no room for it
  const lay = (wl, cw) => {
    const els = [], ch = wl, yT = yU + ch, Bf = R.band('build', yU, yU + 60), Bb = R.band('build', yT, yT + D); if (!Bf || !Bb || yT + D > yB + 0.5) return no('plaza: no room for the back bar'); const bf = cut(Bf), bb = cut(Bb);
    const ux0m = Math.max(bf[0], bb[0], e0), ux1m = Math.min(bf[1], bb[1], e1); if (ux1m - ux0m < cw + 2 * D) return no('plaza: no room for the court and both wings (' + Math.round(ux1m - ux0m) + ' for ' + (cw + 2 * D) + ')'); // (the U within the build lines: the bays beside its wings are its end drives)
    const cx = (ux0m + ux1m) / 2, ux0 = cx - cw / 2 - D, ux1 = cx + cw / 2 + D; // (the court's axis: the main entry's)
    for (const [i, q] of bands.entries()) { const g = [[cx - (i ? 13 : 36), cx + (i ? 13 : 36)]].concat(i === 0 && p.entrances === 2 ? [[ex - 36, ex + 36]] : []), [x0, x1] = q.v; let yy = q.y;
      els.push(...splitRow(x0 + AISLE + 2, x1 - AISLE - 2, yy, 1, g, rowH)); yy += ROW; els.push(drive(x0, yy, x1, yy + AISLE)); q.aisle = yy; yy += AISLE; if (i < p.bays - 1) els.push(...splitRow(x0 + AISLE + 2, x1 - AISLE - 2, yy, -1, [[cx - 13, cx + 13]], rowH)); }
    const mk = (a, c, d, e, note) => bld(a, c, d, e, { use: 'retail', floors: fl, note });
    els.push(mk(ux0, yU, ux0 + D, yT, 'Shops on the court · storefronts to the court and the parking'), mk(ux1 - D, yU, ux1, yT, 'Shops on the court · storefronts to the court and the parking'), mk(ux0, yT, ux1, yT + D, 'Shops across the head of the court'));
    const placed = ((ux1 - ux0) * D + 2 * ch * D) * fl;
    // the court: the plaza at its mouth, the park lawn beyond, the pavilion (the hang-out) at its head; a playground when asked
    const pd = Math.min(70, ch * 0.3), pav = items.has('pavilion'); els.push({ kind: 'plaza', x: cx, y: yU + pd / 2, w: cw - 16, d: pd - 4, name: 'Plaza', note: 'Plaza · outdoor seating · the hang-out' });
    if (pav) els.push({ kind: 'building', x: cx, y: yT - 30, w: 60, d: 40, use: 'amenity', floors: 1, name: 'Pavilion', note: 'Covered hang-out · stage · seating' });
    const ly0 = yU + pd + 4, ly1 = yT - (pav ? 56 : 8); if ((items.has('lawn') || items.has('park')) && ly1 - ly0 >= 24) els.push({ kind: 'green', x: cx, y: (ly0 + ly1) / 2, w: cw - 24, d: ly1 - ly0, name: 'Park', note: 'Lawn and trees · the park at the center' });
    if (items.has('playground') && ly1 - ly0 >= 60) els.push({ kind: 'play', x: ux0 + D + 44, y: ly1 - 28, w: 60, d: 40, name: 'Playground' });
    // parking beside the wings from the front aisle to the back bar, a service drive behind it when the lot is deeper
    const top = bands[bands.length - 1].aisle + AISLE, yR = yT + D + 2, BK = yR + ROW + AISLE + ROW <= vB ? R.band('pave', yR, yR + ROW + AISLE + ROW) : null, SV = !BK && yT + D + SERVICE + 2 <= vB ? R.band('pave', yT + D + 1, yT + D + 1 + SERVICE) : null, yS = BK ? yR + ROW + AISLE + ROW : SV ? yT + D + 1 + SERVICE : yT + D, sides = [];
    for (const side of [-1, 1]) { const x = side < 0 ? ux0 - WALK : ux1 + WALK, C = R.col('pave', side < 0 ? x - ROW - AISLE - ROW : x, side < 0 ? x : x + ROW + AISLE + ROW); if (!C) { no('plaza: no column for the bay beside the ' + (side < 0 ? 'left' : 'right') + ' wing'); continue; } const y0 = Math.max(C[0], top + 2), y1 = Math.min(C[1], yS); if (y1 - y0 < 100) { no('plaza: the bay beside the ' + (side < 0 ? 'left' : 'right') + ' wing too short'); continue; } sides.push(side); const yr = Math.min(y1, yT + D);
      if (side < 0) els.push(rowV(y0, yr, x - ROW, -1), drive(x - ROW - AISLE, y0 - 2, x - ROW, y1), rowV(y0, yr, x - ROW - AISLE - ROW, 1)); else els.push(rowV(y0, yr, x, 1), drive(x + ROW, y0 - 2, x + ROW + AISLE, y1), rowV(y0, yr, x + ROW + AISLE, -1)); }
    if (BK && sides.length) { const bx0 = Math.max(BK[0], ux0 - (sides.includes(-1) ? WALK + ROW + AISLE : 0)), bx1 = Math.min(BK[1], ux1 + (sides.includes(1) ? WALK + ROW + AISLE : 0)); els.push(rowH(ux0 + 4, ux1 - 4, yR, 1), drive(bx0, yR + ROW, bx1, yR + ROW + AISLE), rowH(ux0 + 4, ux1 - 4, yR + ROW + AISLE, -1)); } // (a bay behind the shops joining the bays beside them; the back bar's service side)
    else if (SV && sides.length === 2) els.push(truck(Math.max(SV[0], ux0 - WALK - ROW - AISLE), yT + D + 1, Math.min(SV[1], ux1 + WALK + ROW + AISLE), yT + D + 1 + SERVICE, 'Service drive'));
    els.push(drive(cx - 12, front - 2, cx + 12, bands[0].aisle + AISLE, { name: 'Main entry', entry: true })); if (p.entrances === 2) els.push(drive(ex - 12, front - 2, ex + 12, bands[0].aisle + AISLE, { name: 'Entrance 2', entry: true }));
    return { els, placed, label: 'Retail plaza round a central court · shops on three sides, the ' + [items.has('lawn') || items.has('park') ? 'park' : '', pav ? 'pavilion' : '', 'plaza'].filter(Boolean).join(', ') + ' in the court · ' + p.bays + ' bay' + (p.bays > 1 ? 's' : '') + ' of parking in front', key: 'plaza|' + p.court + '|' + p.bays + '|' + p.pond + '|' + p.entrances };
  };
  // the wings as long as the shops need once the back bar is counted, then cut back until the rows park the shops (the
  // court takes land a field would hold): a few tries, then as it is
  let got = null;
  for (let cw2 = cw; cw2 >= 120 && !got; cw2 -= 20) { let wl = Math.min(maxWl, Math.max(minWl, (need - (cw2 + 2 * D) * D) / (2 * D))), r = null; // (the court narrower when even the shortest wings don't park)
    for (let k = 0; k < 7; k++) { r = lay(wl, cw2); if (!r) break; const stalls = r.els.filter(e => e.kind === 'parking').reduce((t, e) => t + S.stalls({ ...e, rot: 0 }).count, 0); if (stalls >= r.placed / 1000 * ratio * 0.97) { got = r; break; } if (wl <= minWl) { if (cw2 - 20 < 120) got = r; break; } wl = Math.max(minWl, Math.min(wl * 0.88, wl - 15)); }
    if (!r && cw2 === cw) return null; }
  return got;
}
// ---------- the grids ----------
export function grid(prog, acres = 10) {
  const out = [], ponds = acres < 2 ? ['none', 'back', 'left', 'right'] : ['left', 'right', 'back']; // (a small lot: no land kept for a pond; the leftover land takes one if it can)
  if (prog.use === 'retail' && prog.plaza) for (const court of [200, 240, 160, 120]) for (const bays of [1, 2, 3]) for (const pond of ponds) for (const entrances of [1, 2]) out.push({ form: 'plaza', court, bays, pond, entrances });
  if (prog.use === 'retail') { const pads = [...new Set([prog.pads === 'auto' ? 3 : Math.min(4, +prog.pads || 0), Math.max(0, (prog.pads === 'auto' ? 3 : +prog.pads || 0) - 1), 0, 2])].filter(n => n >= 0);
    for (const n of pads) for (const form of ['inline', 'L-left', 'L-right']) for (const bays of [1, 2, 3, 4]) for (const pond of ponds) for (const entrances of [1, 2]) out.push({ pads: n, form, bays, pond, entrances }); }
  else if (prog.use === 'industrial') for (const shallow of prog.flex ? [false, true] : [false]) for (const orient of ['facing', 'back']) for (const pairs of shallow ? [false] : [true, false]) for (const rows of [1, 2, 3]) for (const pond of ponds) for (const entrances of [1, 2]) out.push({ orient, pairs, shallow, rows, pond, entrances }); // (shallow: 60 ft bays with a service drive behind, for a small lot)
  else if (prog.use === 'storage') for (const orient of ['across', 'back']) for (const climate of ['left', 'center', 'right']) for (const climateD of [100, 80, 120, 60]) for (const pond of ponds) out.push({ orient, climate, climateD, pond, entrances: 1 });
  return out;
}
export const make = (R, p, prog, foot) => p.form === 'plaza' ? plaza(R, p, prog, foot) : prog.use === 'retail' ? shops(R, p, prog, foot) : prog.use === 'industrial' ? flex(R, p, prog, foot) : prog.use === 'storage' ? storage(R, p, prog, foot) : null;
