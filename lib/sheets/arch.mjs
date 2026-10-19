// Architecture sheets for plan sets (lib/planset.mjs RENDERERS): floor and roof plans (A-1xx), exterior elevations (A-2xx),
// building sections (A-3xx), wall sections and typical details (A-501), door, window and finish schedules (A-6xx), the life
// safety plan (LS-1xx) and the code analysis (G-003). Every drawing comes from a type's placed design (lib/plandesign.mjs
// placeDesign: rooms, doors, windows, roof, exterior, systems) in the type's own feet: x from the left end as seen from the
// street, y from the front wall. Plans put the front at the bottom of the sheet. A renderer is (ctx, sheet) -> the HTML
// inside the frame (lib/sheetkit.mjs: pt to place boxes, CSS px inside SVG) and sets sheet.scale to what it drew at.
// Schematic only: sizes are rules of thumb and code values are typical, marked "confirm". No DOM, no network.
import { esc, f0, DPI, PT, AREA, MAIN, SIDE_W, side, ARCH_SCALES, viewTitle, table, notes, at, svg, line, rect, circle, poly, pline, text, dim, ftIn, sym, legendSym, n as num } from '../sheetkit.mjs';
import { RESIDENTIAL, LOAD_FACTOR, occupantLoad, roomsOn, typeName } from '../plandesign.mjs';

// ---------- shared ----------
const INK = '#1b1e1f', GREY = '#6b7174', RED = '#c0392b';
const toPx = p => p * DPI / PT, toPt = p => p * PT / DPI;
const fin = v => (Number.isFinite(+v) ? +v : 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isRes = t => RESIDENTIAL.includes(t?.use);
const st = (c = INK, w = 1, more = '') => 'fill="none" stroke="' + c + '" stroke-width="' + w + '"' + (more ? ' ' + more : '');
const fl = (c, more = '') => 'fill="' + c + '" stroke="none"' + (more ? ' ' + more : '');
const box = (c, w = .8) => 'fill="' + c + '" stroke="' + INK + '" stroke-width="' + w + '"';
const DASH = 'stroke-dasharray="6 3"';
const HALO = 'paint-order="stroke" stroke="#fff" stroke-width="3" stroke-linejoin="round"';
// centred text with a white halo, so it reads over hatching and lines
const label = (x, y, s, size = 9, a = '') => text(x, y, s, size, 'fill="#1b1e1f" text-anchor="middle" dominant-baseline="central" ' + HALO + (a ? ' ' + a : ''));
const ltext = (x, y, s, size = 9, a = '') => text(x, y, s, size, 'fill="#1b1e1f" dominant-baseline="central" ' + a);
const pitchTxt = p => (Number.isInteger(p) ? p : (Math.round(p * 2) / 2)) + ':12';
const FLOORS = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'];
const TITLE = 56; // px under each view for its title
// patterns this module adds (identical copies in each SVG: the first in the document wins)
const MYDEFS = '<defs><pattern id="ar-batt" width="10" height="6" patternUnits="userSpaceOnUse"><path d="M0 3Q2.5 0 5 3T10 3" fill="none" stroke="#8a8f8c" stroke-width=".6"/></pattern>' +
  '<pattern id="ar-rigid" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 0L6 6M6 0L0 6" stroke="#8a8f8c" stroke-width=".5"/></pattern>' +
  '<pattern id="ar-rib" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M2 0V8" stroke="#8a8f8c" stroke-width=".6"/></pattern></defs>';
const wrap = (s, n) => { const out = []; let cur = ''; for (const w of String(s).split(/\s+/)) { if (cur && (cur + ' ' + w).length > n) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; } if (cur) out.push(cur); return out; };
const chunk = (a, c) => { const out = []; for (let i = 0; i < a.length; i += c) out.push(a.slice(i, i + c)); return out; };
const sheetNo = (ctx, kind, id) => (ctx.sheets || []).find(s => s.kind === kind && (!id || s.typeId === id))?.number || '';

// the type and its design for a building sheet; d is null when the set has no usable design for it
function look(ctx, sheet) {
  const t = (ctx.types || []).find(x => x.id === sheet.typeId) || null, d = t ? ctx.designs?.[t.id] : null;
  return { t, d: d && Array.isArray(d.rooms) && d.rooms.length && fin(d.W) > 0 && fin(d.D) > 0 ? d : null };
}
const noDesign = (sheet, t) => at(MAIN.x, MAIN.y + 40, 760, 0, '<div class="warnbox"><b>Design not available.</b> ' + esc(t ? typeName(t) : 'Building type ' + (sheet.typeId || '?')) +
  ' has no floor plan in this set, so this sheet can’t be drawn. Make the building designs again from the Plans tab, then make the set again.</div>');

// the heights and roof every elevation and section uses (ft above the first floor slab)
function geo(t, d) {
  const F = Math.max(1, Math.round(fin(d.floors)) || 1), fh = fin(d.floorH) || fin(t?.floorH) || 10, rf = d.roof || {}, flat = rf.type === 'flat' || (!rf.type && !isRes(t));
  const type = flat ? 'flat' : ['gable', 'hip', 'shed'].includes(rf.type) ? rf.type : 'gable', p = flat ? 0 : clamp(fin(rf.pitch) || 6, 1, 14), oh = flat ? 0 : clamp(fin(rf.overhang), 0, 4);
  const n = d.attached && fin(t?.unitsPer) > 1 ? Math.round(t.unitsPer) : 1, RW = d.W * n; // attached units: the whole row
  const ridgeAx = type === 'hip' ? (RW >= d.D ? 'x' : 'y') : rf.ridge === 'front_to_back' ? 'y' : 'x';
  const run = type === 'hip' ? Math.min(RW, d.D) / 2 : ridgeAx === 'x' ? d.D / 2 : d.W / 2, plate = F * fh;
  const ridge = type === 'flat' ? plate : type === 'shed' ? plate + d.D * p / 12 : plate + run * p / 12;
  return { F, fh, type, p, oh, n, RW, ridgeAx, run, plate, ridge, parapet: type === 'flat' ? plate + 3 : 0, top: type === 'flat' ? plate + 3 : ridge };
}
// ceiling height above its floor (ft), 0 where the room is open to the structure
function ceilOf(t, g, r) {
  if (isRes(t)) return r.floor < g.F ? g.fh - 1 : Math.min(g.fh, 10);
  if (['warehouse', 'sanctuary', 'tenant', 'mechanical', 'electrical', 'stair'].includes(r.type)) return 0;
  if (['restroom', 'janitor', 'corridor', 'closet', 'storage', 'walk_in_cooler'].includes(r.type)) return Math.min(9, g.fh - 2);
  return r.floor < g.F ? clamp(g.fh - 4, 8, 12) : clamp(g.fh - 6, 9, 12);
}
// the levels elevations and sections mark on the right
function levelList(g) {
  const L = [{ z: 0, n: 'T.O. slab' }]; for (let f = 2; f <= g.F; f++) L.push({ z: (f - 1) * g.fh, n: 'Level ' + f });
  L.push({ z: g.plate, n: g.type === 'flat' ? 'T.O. roof structure' : 'Top plate' });
  if (g.type === 'flat') L.push({ z: g.parapet, n: 'T.O. parapet' }); else if (g.ridge > g.plate + .5) L.push({ z: g.ridge, n: g.type === 'shed' ? 'High side plate' : 'Ridge' });
  return L;
}
function levelMarks(L, x0, x1, Y) {
  let s = '', last = -1e9;
  for (const l of L.slice().sort((a, b) => b.z - a.z)) {
    const y = Y(l.z), ty = Math.max(y, last + 24); last = ty;
    s += line(x0, y, x1, y, st(GREY, .6, 'stroke-dasharray="12 4 2 4"')) + circle(x1 + 6, y, 5, st(INK, 1)) + '<path d="M' + num(x1 + 6) + ' ' + num(y - 5) + 'A5 5 0 0 1 ' + num(x1 + 11) + ' ' + num(y) + 'L' + num(x1 + 6) + ' ' + num(y) + 'Z" fill="#1b1e1f"/>' +
      '<path d="M' + num(x1 + 6) + ' ' + num(y + 5) + 'A5 5 0 0 1 ' + num(x1 + 1) + ' ' + num(y) + 'L' + num(x1 + 6) + ' ' + num(y) + 'Z" fill="#1b1e1f"/>' +
      (ty !== y ? line(x1 + 11, y, x1 + 16, ty, st(GREY, .5)) : '') + ltext(x1 + 16, ty - 5, l.n.toUpperCase(), 8.5, 'font-weight="700"') + ltext(x1 + 16, ty + 6, ftIn(l.z), 8.5);
  }
  return s;
}
// the largest architectural scale at which rows of views fit a box (px); a view is { wf, hf (ft), mw, mh (px) }
function fitRows(rows, bw, bh, gap = 30, list = ARCH_SCALES) {
  for (const s of list) {
    const k = DPI / s.ft, w = Math.max(...rows.map(r => r.reduce((a, v) => a + v.wf * k + v.mw, 0) + gap * (r.length - 1))), h = rows.reduce((a, r) => a + Math.max(...r.map(v => v.hf * k + v.mh)), 0) + gap * (rows.length - 1);
    if (w <= bw && h <= bh) return { ...s, k };
  }
  const s = list[list.length - 1]; return { ...s, k: DPI / s.ft };
}
// best of several layouts: the one drawn largest (the first on a tie)
function bestLayout(layouts, bw, bh) { let best = null; for (const rows of layouts) { const s = fitRows(rows, bw, bh); if (!best || s.k > best.s.k + 1e-9) best = { rows, s }; } return best; }
// rows of views spread over a box (px) -> [{ v, x, y, w, h }]
function placeRows(rows, k, bx) {
  const hs = rows.map(r => Math.max(...r.map(v => v.hf * k + v.mh))), gy = Math.max(0, (bx.h - hs.reduce((a, b) => a + b, 0)) / (rows.length + 1)), out = [];
  let y = bx.y + gy;
  rows.forEach((r, i) => { const ws = r.map(v => v.wf * k + v.mw), gx = Math.max(0, (bx.w - ws.reduce((a, b) => a + b, 0)) / (r.length + 1)); let x = bx.x + gx; r.forEach((v, j) => { out.push({ v, x, y, w: ws[j], h: hs[i] }); x += ws[j] + gx; }); y += hs[i] + gy; });
  return out;
}
// one drawing and its title, placed inside MAIN (p from placeRows, px relative to MAIN)
function placed(p, dr, n, title, scale) {
  const x = MAIN.x + toPt(p.x), y = MAIN.y + toPt(p.y);
  return at(x, y, toPt(dr.w), toPt(dr.h), svg(dr.w, dr.h, dr.body)) + at(x + 6, y + toPt(dr.h) + 4, Math.max(toPt(dr.w), 320), 40, viewTitle(n, title, scale));
}
const legendRow = (art, s) => '<div class="lg2">' + svg(44, 18, art) + '<span>' + esc(s) + '</span></div>';
const discNotes = (ctx, k) => (Array.isArray(ctx.disc?.[k]?.notes) ? ctx.disc[k].notes : []).filter(x => typeof x === 'string' && x.trim()).slice(0, 12);

// ---------- floor plans ----------
const PM = { mL: 90, mR: 44, mT: 44, mB: 112 };
const span = x => x.orient === 'h' ? [Math.min(x.x1, x.x2), Math.max(x.x1, x.x2)] : [Math.min(x.y1, x.y2), Math.max(x.y1, x.y2)];
const dAt = x => x.orient === 'h' ? x.y1 : x.x1;
const merge = iv => { const out = []; for (const [a, b] of iv.slice().sort((p, q) => p[0] - q[0])) { const l = out[out.length - 1]; if (l && a <= l[1] + .05) l[1] = Math.max(l[1], b); else out.push([a, b]); } return out; };
const minus = (iv, cuts) => { let out = iv.map(x => x.slice()); for (const [c0, c1] of cuts) out = out.flatMap(([a, b]) => c1 <= a || c0 >= b ? [[a, b]] : [[a, c0], [c1, b]].filter(([p, q]) => q - p > .05)); return out; };
// interior wall runs on a floor: every room edge inside the footprint once (shared edges merged)
function wallRuns(d, f) {
  const m = new Map(), add = (o, a, s0, s1) => { if (s1 - s0 < .3 || a < .4 || a > (o === 'h' ? d.D : d.W) - .4) return; const k = o + '|' + Math.round(a * 2) / 2; if (!m.has(k)) m.set(k, []); m.get(k).push([s0, s1]); };
  for (const r of roomsOn(d, f)) { add('h', r.y, r.x, r.x + r.w); add('h', r.y + r.d, r.x, r.x + r.w); add('v', r.x, r.y, r.y + r.d); add('v', r.x + r.w, r.y, r.y + r.d); }
  return [...m].map(([k, iv]) => ({ o: k[0], a: +k.slice(2), iv: merge(iv) }));
}

// plumbing fixtures, kitchen and laundry outlines, closet rods, cars, pews: simple outlines by room type
function fixtures(r, doors, X, Y, k) {
  const A = st(INK, .8), big = ['garage', 'dining_room', 'sanctuary'].includes(r.type);
  if (k < (big ? 2.5 : 4.5)) return '';
  let o = '';
  if (r.type === 'garage' && r.d >= 17 && r.w >= 9) { const n = clamp(Math.floor(r.w / 9.5), 1, 3), sw = r.w / n, cl = Math.min(15.5, r.d - 3); for (let i = 0; i < n; i++) o += rect(X(r.x + i * sw + sw / 2 - 3), Y(r.y + 1.5 + cl), 6 * k, cl * k, st(GREY, .8, DASH + ' rx="' + num(k) + '"')); return o; }
  if (r.type === 'dining_room') { // 36" round tables with four chairs on a 7 ft grid
    let c = 0; for (let y = r.y + 5.5; y <= r.y + r.d - 4.5 && c < 160; y += 7) for (let x = r.x + 5.5; x <= r.x + r.w - 4.5 && c < 160; x += 7, c++) {
      o += circle(X(x), Y(y), 1.5 * k, st(GREY, .7)); if (k >= 5) for (const [a, b] of [[0, 2.3], [0, -2.3], [2.3, 0], [-2.3, 0]]) o += rect(X(x + a - .6), Y(y + b + .6), 1.2 * k, 1.2 * k, st(GREY, .5)); }
    return o; }
  if (r.type === 'sanctuary') {
    const cx = r.x + r.w / 2, pw = Math.min(40, r.w * .4), py = r.y + r.d - 16; if (r.d < 30) return '';
    o += rect(X(cx - pw / 2), Y(r.y + r.d - 1), pw * k, 15 * k, st(INK, .8, DASH)) + (k >= 3 ? label(X(cx), Y(r.y + r.d - 8.5), 'PLATFORM', 8) : '');
    const secs = Math.max(2, Math.round((r.w - 12) / 30)), sw = (r.w - 12 - 5 * (secs - 1)) / secs; let c = 0;
    for (let y = r.y + 10; y <= py - 6 && c < 400; y += 3) for (let i = 0; i < secs; i++, c++) { const x0 = r.x + 6 + i * (sw + 5); o += line(X(x0), Y(y), X(x0 + sw), Y(y), st(GREY, .6)); }
    return o;
  }
  const horiz = r.w >= r.d, L = horiz ? r.w : r.d, S = horiz ? r.d : r.w;
  // fixtures go on the long wall with fewer doors; the tub on the end with fewer doors
  const onD = (o2, a, s0, s1) => doors.filter(x => x.orient === o2 && Math.abs(dAt(x) - a) < .6 && span(x)[1] > s0 + .1 && span(x)[0] < s1 - .1), on = (...a) => onD(...a).reduce((t2, x) => t2 + x.width, 0);
  const [wA, wB] = horiz ? [on('h', r.y, r.x, r.x + r.w), on('h', r.y + r.d, r.x, r.x + r.w)] : [on('v', r.x, r.y, r.y + r.d), on('v', r.x + r.w, r.y, r.y + r.d)];
  const [eA, eB] = horiz ? [on('v', r.x, r.y, r.y + r.d), on('v', r.x + r.w, r.y, r.y + r.d)] : [on('h', r.y, r.x, r.x + r.w), on('h', r.y + r.d, r.x, r.x + r.w)];
  const vf = wB < wA, uf = eB < eA;
  const P = (u, v) => { const uu = uf ? L - u : u, vv = vf ? S - v : v; return horiz ? [X(r.x + uu), Y(r.y + vv)] : [X(r.x + vv), Y(r.y + uu)]; };
  const R = (u, v, du, dv, a = A) => { const p = P(u, v), q = P(u + du, v + dv); return rect(Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1]), a); };
  const E = (u, v, ru, rv, a = A) => { const c = P(u, v); return '<ellipse cx="' + num(c[0]) + '" cy="' + num(c[1]) + '" rx="' + num((horiz ? ru : rv) * k) + '" ry="' + num((horiz ? rv : ru) * k) + '" ' + a + '/>'; };
  const Ln = (u1, v1, u2, v2, a = A) => line(...P(u1, v1), ...P(u2, v2), a);
  const C = (u, v, rr, a = A) => circle(...P(u, v), rr * k, a);
  const tx = (u, v, s2) => k >= 9 ? label(...P(u, v), s2, clamp(k * .3, 6, 8)) : '';
  const toilet = c => R(c - .8, 0, 1.6, .6) + E(c, 1.4, .6, .8);
  const lav = (u0, len) => R(u0, 0, len, 1.75, box('#fafafa')) + E(u0 + len / 2, .9, Math.min(.65, len / 2 - .15), .45);
  const tub = (u0, du, dv) => R(u0, 0, du, dv) + R(u0 + .25, .25, du - .5, dv - .5, st(INK, .6));
  // the openings along the fixture wall, in u (so counters stop at them)
  const uOf = v2 => { const q = horiz ? v2 - r.x : v2 - r.y; return uf ? L - q : q; }, wall = horiz ? ['h', vf ? r.y + r.d : r.y, r.x, r.x + r.w] : ['v', vf ? r.x + r.w : r.x, r.y, r.y + r.d];
  const gaps = onD(...wall).map(x => span(x).map(uOf).sort((a, b) => a - b)).map(([a, b]) => [a - .3, b + .3]);
  switch (r.type) {
    case 'bath': case 'half_bath': {
      if (S < 3 || L < 3.5) break; let u = 0;
      if (r.type === 'bath') { if (S >= 5 && L >= 7) { o += tub(0, 2.5, Math.min(S, 5)); u = 2.6; } else if (L >= 9.5) { o += tub(0, 5, Math.min(2.5, S)); u = 5.1; } else if (L >= 6) { o += R(0, 0, 3, Math.min(3, S)) + Ln(0, 0, 3, Math.min(3, S), st(GREY, .5)) + Ln(3, 0, 0, Math.min(3, S), st(GREY, .5)); u = 3.1; } }
      if (L - u >= 2.4) { o += toilet(u + 1.3); u += 2.7; }
      if (L - u >= 2) o += lav(u + .1, Math.min(L - u - .3, r.area > 90 ? 6 : 3.5));
      break;
    }
    case 'kitchen': {
      if (L < 7 || S < 5) break;
      // counters along the wall between its openings; sink in the middle of the longest run, range and fridge at its ends
      const runs = minus([[0, L]], gaps).filter(([a, b]) => b - a >= 2).sort((p2, q) => (q[1] - q[0]) - (p2[1] - p2[0])); if (!runs.length) break;
      for (const [a, b] of runs) o += R(a, 0, b - a, 2, box('#f3f4f3'));
      const [a0, b0] = runs[0], ln0 = b0 - a0, sk = (a0 + b0) / 2 + (ln0 >= 10 ? .5 : 0); o += R(sk - 1.4, .25, 2.8, 1.5) + Ln(sk, .25, sk, 1.75, st(INK, .5)) + tx(sk, 1, 'SINK');
      const rgRun = ln0 >= 9 ? runs[0] : runs[1], rg = rgRun ? rgRun[0] + Math.min(2.6, (rgRun[1] - rgRun[0]) / 2) : null;
      if (rg != null && (rgRun[1] - rgRun[0]) >= 2.6) o += R(rg - 1.25, 0, 2.5, 2.1) + [[-.6, .55], [.6, .55], [-.6, 1.45], [.6, 1.45]].map(([a, b]) => C(rg + a, b, .32, st(INK, .6))).join('');
      if (ln0 >= 12) o += R(b0 - 3.1, 0, 3, 2.6, box('#fff')) + tx(b0 - 1.6, 1.3, 'REF');
      if (S >= 9 && a0 < .5 && !on(...(horiz ? ['v', uf ? r.x + r.w : r.x, r.y, r.y + r.d] : ['h', uf ? r.y + r.d : r.y, r.x, r.x + r.w]))) o += R(0, 2, 2, Math.min(S - 5, 7), box('#f3f4f3'));
      if (S >= 15 && L >= 12) o += R(L * .5 - Math.min(4, L * .2), 5, Math.min(8, L * .4), 3);
      break;
    }
    case 'laundry': if (L >= 5.6 && S >= 3.5) o += [.2, 2.9].map((u, i) => R(u, 0, 2.5, 2.5) + C(u + 1.25, 1.25, .9) + tx(u + 1.25, 1.25, i ? 'D' : 'W')).join(''); else if (S >= 3 && L >= 3) o += R(.2, 0, 2.5, 2.5) + tx(1.45, 1.25, 'W/D'); break;
    case 'closet': case 'walk_in_closet': case 'pantry': {
      const both = r.type !== 'closet' && S >= 5, v1 = Math.min(1.25, S / 2);
      o += Ln(0, v1, L, v1, st(INK, .6)) + (r.type !== 'pantry' ? Ln(0, v1 * .8, L, v1 * .8, st(GREY, .6, 'stroke-dasharray="4 3"')) : '');
      if (both) o += Ln(0, S - v1, L, S - v1, st(INK, .6)) + (r.type !== 'pantry' ? Ln(0, S - v1 * .8, L, S - v1 * .8, st(GREY, .6, 'stroke-dasharray="4 3"')) : '');
      break;
    }
    case 'restroom': {
      if (S >= 9 && L >= 13) {
        const n = clamp(Math.floor((L - 6.5) / 3), 1, 4), P5 = st(INK, .9);
        for (let i = 0; i < n; i++) o += toilet(i * 3 + 1.5) + Ln((i + 1) * 3, 0, (i + 1) * 3, 5, P5);
        o += Ln(0, 5, n * 3, 5, P5) + Ln(L - 5.2, 0, L - 5.2, 5, P5) + Ln(L - 5.2, 5, L, 5, P5) + toilet(L - 1.5) + Ln(L - .15, 1, L - .15, 4.5, st(INK, 1.6));
        const nl = clamp(Math.floor((L - 2) / 2.5), 1, 4); o += R(1, S - 1.9, nl * 2.5, 1.9, box('#fafafa')); for (let i = 0; i < nl; i++) o += E(1 + 1.25 + i * 2.5, S - .95, .6, .45);
      } else if (S >= 5 && L >= 5) o += toilet(1.5) + Ln(.15, 1, .15, 4.5, st(INK, 1.6)) + Ln(.5, .1, 3.5, .1, st(INK, 1.6)) + (L >= 6.5 ? R(L - 2.3, 0, 1.9, 1.6) + E(L - 1.35, .85, .6, .45) : '') + C(L / 2, S / 2, 2.5, st(GREY, .6, 'stroke-dasharray="4 3"'));
      break;
    }
    case 'commercial_kitchen': {
      if (L < 10 || S < 8) break;
      const hl = Math.min(L - 2, Math.max(8, L * .4)), D3 = st(INK, .8, DASH);
      o += R(1, 0, hl, 4.5, D3) + Ln(1, 0, 1 + hl, 4.5, st(GREY, .5, DASH)) + Ln(1, 4.5, 1 + hl, 0, st(GREY, .5, DASH));
      for (let u = 1.2; u + 2.8 <= 1 + hl; u += 3) o += R(u, 0, 2.8, 2.6, box('#fff')) + C(u + 1.4, 1.3, .5, st(INK, .5));
      o += tx(1 + hl / 2, 3.6, 'HOOD');
      const sl = Math.min(9, L * .45); o += R(1, S - 2.4, sl, 2.4) + [0, 1, 2].map(i => R(1.3 + i * (sl - .6) / 3, S - 2.1, (sl - .6) / 3 - .3, 1.8, st(INK, .6))).join('') + tx(1 + sl / 2, S - 3.2, '3-COMP SINK');
      if (L - sl - 2 >= 3) o += R(L - 2.2, S - 1.6, 1.6, 1.6) + C(L - 1.4, S - .8, .45, st(INK, .6));
      if (S >= 16) o += R(L * .35, S * .68 - 1.25, Math.min(10, L * .35), 2.5); // prep table, clear of the room name
      break;
    }
    case 'janitor': if (S >= 2.6 && L >= 2.6) o += R(.2, .2, 2, 2) + C(1.2, 1.2, .5) + tx(1.2, 2.8, 'MOP SINK'); break;
    case 'walk_in_cooler': if (S >= 3 && L >= 3) o += R(.33, .33, L - .66, S - .66, st(GREY, .8, DASH)); break;
  }
  return o;
}
// upper-floor areas no room covers: crossed and marked open to below (2 ft cells grouped into areas)
function openBelow(d, f, X, Y, k) {
  // cells of 1 ft (coarser on big floors); a cell centre on a room edge counts as covered, so no slivers along walls
  const c = Math.max(1, Math.ceil(Math.sqrt(d.W * d.D / 20000))), nx = Math.ceil(d.W / c), ny = Math.ceil(d.D / c), rooms = roomsOn(d, f), free = new Uint8Array(nx * ny), e = .01; let o = '';
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const x = (i + .5) * c, y = (j + .5) * c; free[j * nx + i] = x < d.W && y < d.D && !rooms.some(r => x >= r.x - e && x <= r.x + r.w + e && y >= r.y - e && y <= r.y + r.d + e) ? 1 : 0; }
  const seen = new Uint8Array(nx * ny);
  for (let s0 = 0; s0 < free.length; s0++) {
    if (!free[s0] || seen[s0]) continue; const q = [s0], cells = []; seen[s0] = 1;
    while (q.length) { const v = q.pop(), i = v % nx, j = (v - i) / nx; cells.push([i, j]); for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) if (a >= 0 && b >= 0 && a < nx && b < ny && free[b * nx + a] && !seen[b * nx + a]) { seen[b * nx + a] = 1; q.push(b * nx + a); } }
    if (cells.length * c * c < 24) continue;
    const x0 = Math.min(...cells.map(p => p[0])) * c, x1 = Math.min(d.W, (Math.max(...cells.map(p => p[0])) + 1) * c), y0 = Math.min(...cells.map(p => p[1])) * c, y1 = Math.min(d.D, (Math.max(...cells.map(p => p[1])) + 1) * c);
    if (cells.length * c * c >= (x1 - x0) * (y1 - y0) * .7) o += line(X(x0), Y(y0), X(x1), Y(y1), st('#9aa0a2', .7, DASH)) + line(X(x0), Y(y1), X(x1), Y(y0), st('#9aa0a2', .7, DASH));
    if ((x1 - x0) * k > 70 && (y1 - y0) * k > 16) o += label(X((x0 + x1) / 2), Y((y0 + y1) / 2), 'OPEN TO BELOW', clamp(k * .45, 7, 10));
  }
  return o;
}
function stairSym(r, f, F, X, Y, k) {
  const vert = r.d >= r.w, L = vert ? r.d : r.w, n = Math.floor(L / .92); let o = '';
  if (.92 * k >= 2.5) for (let i = 1; i < n; i++) { const s = i * .92; o += vert ? line(X(r.x), Y(r.y + s), X(r.x + r.w), Y(r.y + s), st(INK, .6)) : line(X(r.x + s), Y(r.y), X(r.x + s), Y(r.y + r.d), st(INK, .6)); }
  if (F > 1 && f < F) o += vert ? line(X(r.x), Y(r.y + L * .55), X(r.x + r.w), Y(r.y + L * .68), st(INK, 1)) : line(X(r.x + L * .55), Y(r.y), X(r.x + L * .68), Y(r.y + r.d), st(INK, 1));
  const down = F > 1 && f >= F, a = vert ? [X(r.x + r.w / 2), Y(r.y + .7), X(r.x + r.w / 2), Y(r.y + r.d - .7)] : [X(r.x + .7), Y(r.y + r.d / 2), X(r.x + r.w - .7), Y(r.y + r.d / 2)];
  const [x1, y1, x2, y2] = down ? [a[2], a[3], a[0], a[1]] : a, L2 = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / L2, uy = (y2 - y1) / L2;
  return o + line(x1, y1, x2, y2, st(INK, 1, 'marker-end="url(#arr)"')) + circle(x1, y1, 2, fl(INK)) + label(x1 + ux * 8 - uy * 10, y1 + uy * 8 + ux * 10, down ? 'DN' : 'UP', 8, 'font-weight="700"');
}
function roomLabel(r, X, Y, k, lines, maxFs = 13) {
  const cx = X(r.x + r.w / 2), cy = Y(r.y + r.d / 2), bw = r.w * k - 6, bh = r.d * k - 4, L0 = Math.max(3, String(lines[0]).length);
  let fs = clamp(k * .6, 7.5, maxFs), rot = false; const fitW = bw / (L0 * .62);
  if (fitW < fs) { if (fitW >= 5.5) fs = fitW; else if (bh > bw * 1.4 && bh / (L0 * .62) >= 5.5) { rot = true; fs = Math.min(fs, bh / (L0 * .62)); } else return { svg: '' }; }
  const along = rot ? bh : bw, across = rot ? bw : bh; if (across < fs * 1.1) return { svg: '' };
  const sub = lines.slice(1).filter(s => s && along >= String(s).length * fs * .85 * .58 && across >= fs * 2.5).slice(0, Math.max(0, Math.floor(across / (fs * 1.15)) - 1));
  const h = fs * 1.15 * sub.length, g = '<g' + (rot ? ' transform="rotate(-90 ' + num(cx) + ' ' + num(cy) + ')"' : '') + '>';
  const hw = Math.max(L0 * fs * .62, ...sub.map(x => String(x).length * fs * .85 * .58)) / 2, hh = (h + fs * 1.2) / 2;
  return { svg: g + label(cx, cy - h / 2, String(lines[0]).toUpperCase(), fs, 'font-weight="700"') + sub.map((s, i) => label(cx, cy - h / 2 + fs * 1.1 + i * fs * 1.05, s, fs * .85)).join('') + '</g>', box: rot ? [cx - hh, cy - hw, cx + hh, cy + hw] : [cx - hw, cy - hh, cx + hw, cy + hh] };
}
// door and window tags: circle with the door number, hexagon with the window mark
const doorTag = (x, y, r, id) => '<g class="dtag">' + circle(x, y, r, 'fill="#fff" stroke="#1b1e1f" stroke-width=".9"') + text(x, y, id, r * .92, 'fill="#1b1e1f" text-anchor="middle" dominant-baseline="central"') + '</g>';
const winTag = (x, y, r, id) => '<g class="wtag">' + poly([0, 1, 2, 3, 4, 5].map(i => [x + r * Math.cos(i * Math.PI / 3), y + r * Math.sin(i * Math.PI / 3)]), 'fill="#fff" stroke="#1b1e1f" stroke-width=".8"') + text(x, y, id, r * .8, 'fill="#1b1e1f" text-anchor="middle" dominant-baseline="central"') + '</g>';

// one floor of a type, front at the bottom -> { body, w, h } (px). o: { fixtures, tags, dims, label(r), extra(X, Y) }
function planView(t, d, f, k, o = {}) {
  const W = d.W, D = d.D, { mL, mR, mT, mB } = PM, X = x => mL + x * k, Y = y => mT + (D - y) * k, g = geo(t, d), res = isRes(t);
  const te = Math.max(.667 * k, 2.4), ti = Math.max(.375 * k, 1.3), tp = Math.max(1.1 * k, 3.8), party = !!d.attached;
  const rooms = roomsOn(d, f), byId = new Map(d.rooms.map(r => [r.id, r])), doors = (d.doors || []).filter(x => x.floor === f), wins = (d.windows || []).filter(x => x.floor === f);
  let s = MYDEFS, tags = '';
  if (o.fixtures !== false) for (const r of rooms) s += fixtures(r, doors, X, Y, k);
  for (const r of rooms.filter(r => r.type === 'stair')) s += stairSym(r, f, g.F, X, Y, k);
  if (f > 1) s += openBelow(d, f, X, Y, k);
  // interior walls (4-1/2"): every room edge inside the footprint once, less the door openings
  for (const w of wallRuns(d, f)) {
    const cuts = doors.filter(x => !x.exterior && x.orient === w.o && Math.abs(dAt(x) - w.a) < .6).map(span);
    for (const [a, b] of minus(w.iv, cuts)) s += w.o === 'h' ? rect(X(a), Y(w.a) - ti / 2, (b - a) * k, ti, fl('#4d5457')) : rect(X(w.a) - ti / 2, Y(b), ti, (b - a) * k, fl('#4d5457'));
  }
  // exterior walls (8", solid) and party walls (heavier, hatched), less the door and window openings
  for (const sd of ['front', 'back', 'left', 'right']) {
    const len = sd === 'front' || sd === 'back' ? W : D, pw = party && (sd === 'left' || sd === 'right'), th = pw ? tp : te;
    const cuts = [...doors.filter(x => x.exterior && x.side === sd), ...wins.filter(x => x.side === sd)].map(span);
    for (const [a, b] of minus([[0, len]], cuts)) {
      const r = sd === 'front' ? [X(a), Y(0) - th, (b - a) * k, th] : sd === 'back' ? [X(a), Y(D), (b - a) * k, th] : sd === 'left' ? [X(0), Y(b), th, (b - a) * k] : [X(W) - th, Y(b), th, (b - a) * k];
      s += rect(...r, pw ? 'fill="url(#hatch2)" stroke="#1b1e1f" stroke-width="1.4"' : fl(INK));
    }
  }
  if (party) for (const [x, rot] of [[X(0) - 14, -90], [X(W) + 14, 90]]) s += text(x, Y(D / 2), '1-HR RATED PARTY WALL (IRC R302.2)', 8, 'fill="#1b1e1f" text-anchor="middle" dominant-baseline="central" font-weight="700" transform="rotate(' + rot + ' ' + num(x) + ' ' + num(Y(D / 2)) + ')"');
  // windows: the opening with the glass line down the middle of the wall
  const placedTags = [], wr = 8, dr0 = clamp(k * .55, 6.5, 9.5), boxes = [], tagQ = [];
  for (const r of rooms) { const l = roomLabel(r, X, Y, k, o.label ? o.label(r) : r.type === 'stair' ? [r.name] : [r.name, res ? ftIn(r.w) + ' × ' + ftIn(r.d) : f0(r.area) + ' SF']); if (l.box) boxes.push(l.box); tags += l.svg; }
  const hits = (p, r) => boxes.some(b => p[0] + r + 3 > b[0] && p[0] - r - 3 < b[2] && p[1] + r + 3 > b[1] && p[1] - r - 3 < b[3]) || placedTags.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < r * 2 + 1);
  for (const w of wins) {
    const [a, b] = span(w), sd = w.side, horiz = sd === 'front' || sd === 'back';
    const bx = horiz ? [X(a), sd === 'front' ? Y(0) - te : Y(D), (b - a) * k, te] : [sd === 'left' ? X(0) : X(W) - te, Y(b), te, (b - a) * k];
    s += rect(...bx, 'fill="#fff" stroke="#1b1e1f" stroke-width=".8"') + (horiz ? line(bx[0], bx[1] + te / 2, bx[0] + bx[2], bx[1] + te / 2, st(INK, .7)) : line(bx[0] + te / 2, bx[1], bx[0] + te / 2, bx[1] + bx[3], st(INK, .7)));
  }
  // doors: cut openings with swings (commercial exits swing out, IBC 1010.1.2.1), slides, overhead tracks
  for (const dr of doors) {
    const P1 = [X(dr.x1), Y(dr.y1)], P2 = [X(dr.x2), Y(dr.y2)], L = Math.hypot(P2[0] - P1[0], P2[1] - P1[1]) || 1, u = [(P2[0] - P1[0]) / L, (P2[1] - P1[1]) / L];
    let nIn = [-u[1], u[0]]; const ra = byId.get(dr.into || dr.a), c = ra ? [X(ra.x + ra.w / 2), Y(ra.y + ra.d / 2)] : [X(W / 2), Y(D / 2)];
    if ((c[0] - P1[0]) * nIn[0] + (c[1] - P1[1]) * nIn[1] < 0) nIn = [-nIn[0], -nIn[1]];
    const th = dr.exterior ? te : ti, h = th / 2, sh = dr.exterior ? h : 0, add = (p, v, m) => [p[0] + v[0] * m, p[1] + v[1] * m];
    const C = s0 => [P1[0] + u[0] * s0 + nIn[0] * sh, P1[1] + u[1] * s0 + nIn[1] * sh];
    const out = !res && dr.exterior && ['swing', 'double', 'storefront'].includes(dr.kind), nS = out ? [-nIn[0], -nIn[1]] : nIn;
    const leaf = (s0, dir, w) => { const H = add(C(s0), nS, h), E = add(H, nS, w), pts = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI / 2; pts.push([H[0] + w * (Math.cos(a) * u[0] * dir + Math.sin(a) * nS[0]), H[1] + w * (Math.cos(a) * u[1] * dir + Math.sin(a) * nS[1])]); } return line(...H, ...E, st(INK, 1.3)) + pline(pts, st(GREY, .6)); };
    s += line(...add(C(0), nIn, -h), ...add(C(0), nIn, h), st(INK, 1)) + line(...add(C(L), nIn, -h), ...add(C(L), nIn, h), st(INK, 1));
    let tagSide = [-nIn[0], -nIn[1]];
    if (dr.kind === 'swing') { s += leaf(0, 1, L); tagSide = [-nS[0], -nS[1]]; }
    else if (dr.kind === 'double') { s += leaf(0, 1, L / 2) + leaf(L, -1, L / 2); tagSide = [-nS[0], -nS[1]]; }
    else if (dr.kind === 'storefront') {
      const dw = Math.min(L, 6 * k), pair = dw >= 5 * k, s0 = (L - (pair ? dw : Math.min(L, 3 * k))) / 2, s1 = L - s0;
      for (const [a, b] of [[0, s0], [s1, L]]) if (b - a > 1) s += line(...add(C(a), nIn, -1.2), ...add(C(b), nIn, -1.2), st(INK, .7)) + line(...add(C(a), nIn, 1.2), ...add(C(b), nIn, 1.2), st(INK, .7));
      s += pair ? leaf(s0, 1, (s1 - s0) / 2) + leaf(s1, -1, (s1 - s0) / 2) : leaf(s0, 1, s1 - s0); tagSide = [-nS[0], -nS[1]];
    } else if (dr.kind === 'sliding') s += line(...add(C(0), nIn, 1.6), ...add(C(L * .56), nIn, 1.6), st(INK, 2)) + line(...add(C(L * .44), nIn, -1.6), ...add(C(L), nIn, -1.6), st(INK, 2));
    else if (dr.kind === 'pocket') s += line(...C(-L * .9), ...C(0), st('#fff', 1.2, 'stroke-dasharray="3 2"')) + line(...C(0), ...C(L * .5), st(INK, 2));
    else if (dr.kind === 'overhead') {
      const dp = Math.min(8, Math.max(2, ((ra && (dr.orient === 'h' ? ra.d : ra.w)) || 10) * .6)) * k, q = [C(0), add(C(0), nIn, dp), add(C(L), nIn, dp), C(L)];
      s += line(...C(0), ...C(L), st(INK, 1.6)) + pline(q, st(GREY, .8, DASH)); if (k >= 3 && L >= 40) { const m = add(C(L / 2), nIn, dp / 2); s += label(m[0], m[1], 'OH DOOR', clamp(k * .4, 6.5, 9)); }
    } else s += line(...add(C(0), nIn, -h), ...add(C(L), nIn, -h), st(GREY, .6, 'stroke-dasharray="3 2"')) + line(...add(C(0), nIn, h), ...add(C(L), nIn, h), st(GREY, .6, 'stroke-dasharray="3 2"'));
    // the tag: off the middle of the opening on the free side, else past a jamb, else beyond the swing
    if (o.tags !== false) { const off = h + dr0 + 3, sw = ['swing', 'double', 'storefront'].includes(dr.kind), cand = [add(C(L / 2), tagSide, off), add(C(L + dr0 + 4), tagSide, off), add(C(-dr0 - 4), tagSide, off), add(C(L / 2), [-tagSide[0], -tagSide[1]], (sw ? L * .87 : 0) + off), add(C(L + dr0 + 4), [-tagSide[0], -tagSide[1]], off)];
      tagQ.push({ cand, id: dr.id }); }
  }
  // room names with sizes (homes) or areas (commercial), then door tags clear of them
  for (const q of tagQ) { const p = q.cand.find(c => !hits(c, dr0)) || q.cand[0]; placedTags.push(p); tags += doorTag(p[0], p[1], dr0, q.id); }
  if (o.tags !== false) for (const w of wins) {
    const [a, b] = span(w), m = (a + b) / 2, sd = w.side, p = sd === 'front' ? [X(m), Y(0) + wr + 4] : sd === 'back' ? [X(m), Y(D) - wr - 4] : sd === 'left' ? [X(0) - wr - 4, Y(m)] : [X(W) + wr + 4, Y(m)];
    if (hits(p, wr)) continue; placedTags.push(p); tags += winTag(p[0], p[1], wr, w.id);
  }
  s += tags;
  // dimensions: room breaks and overall along the front and the left side
  if (o.dims !== false) {
    const brk = (vals, max) => { const v = [...new Set(vals.map(x => Math.round(clamp(x, 0, max) * 4) / 4))].sort((a, b) => a - b); return v.filter((x, i) => i === 0 || x - v[i - 1] >= .4); };
    const fx = brk([0, W, ...rooms.filter(r => r.y <= .6).flatMap(r => [r.x, r.x + r.w])], W), fy = brk([0, D, ...rooms.filter(r => r.x <= .6).flatMap(r => [r.y, r.y + r.d])], D);
    if (o.dims !== 'overall') { for (let i = 1; i < fx.length; i++) if ((fx[i] - fx[i - 1]) * k >= 10 && fx.length > 2) s += dim(X(fx[i - 1]), Y(0), X(fx[i]), Y(0), (fx[i] - fx[i - 1]) * k >= 34 ? ftIn(fx[i] - fx[i - 1]) : '', 40);
      for (let i = 1; i < fy.length; i++) if ((fy[i] - fy[i - 1]) * k >= 10 && fy.length > 2) s += dim(X(0), Y(fy[i]), X(0), Y(fy[i - 1]), (fy[i] - fy[i - 1]) * k >= 34 ? ftIn(fy[i] - fy[i - 1]) : '', 40); }
    s += dim(X(0), Y(0), X(W), Y(0), ftIn(W), 64, 9) + dim(X(0), Y(D), X(0), Y(0), ftIn(D), 64, 9);
  }
  s += label(X(W / 2), Y(0) + 96, 'FRONT (STREET)', 10, 'font-weight="700" letter-spacing="1"');
  if (o.extra) s += o.extra(X, Y);
  return { body: s, w: W * k + mL + mR, h: D * k + mT + mB };
}

// ---------- roof plan ----------
function rtuSpots(d) {
  const cond = d.rooms.filter(r => !['warehouse', 'stair', 'garage', 'porch'].includes(r.type)), area = cond.reduce((a, r) => a + r.area, 0), ten = d.rooms.filter(r => r.floor === 1 && r.type === 'tenant');
  const n = clamp(Math.max(ten.length, Math.ceil(area / 3500)), 1, 40), out = ten.map(r => [r.x + r.w / 2, r.y + r.d * .6]);
  const bb = cond.length ? cond.reduce((b, r) => [Math.min(b[0], r.x), Math.min(b[1], r.y), Math.max(b[2], r.x + r.w), Math.max(b[3], r.y + r.d)], [1e9, 1e9, -1e9, -1e9]) : [0, 0, d.W, d.D];
  const m = n - out.length, bw = Math.max(1, bb[2] - bb[0]), bh = Math.max(1, bb[3] - bb[1]);
  if (m > 0) { const cols = Math.max(1, Math.ceil(Math.sqrt(m * bw / bh))), rows = Math.ceil(m / cols); for (let i = 0; i < m; i++) out.push([bb[0] + (i % cols + .5) * bw / cols, bb[1] + (Math.floor(i / cols) + .5) * bh / rows]); }
  return out.slice(0, n);
}
function roofView(t, d, g, k) {
  const W = d.W, D = d.D, ox = d.attached ? 0 : g.oh, oy = g.oh, { mL, mR, mT, mB } = PM, X = x => mL + (x + ox) * k, Y = y => mT + (D + oy - y) * k, pt = pitchTxt(g.p);
  let s = MYDEFS + rect(X(-ox), Y(D + oy), (W + 2 * ox) * k, (D + 2 * oy) * k, 'fill="#f6f6f5" stroke="#1b1e1f" stroke-width="1.8"');
  const arrow = (x1, y1, x2, y2, lab) => { const vert = Math.abs(y2 - y1) > Math.abs(x2 - x1), mx = (X(x1) + X(x2)) / 2, my = (Y(y1) + Y(y2)) / 2; return line(X(x1), Y(y1), X(x2), Y(y2), st(INK, 1, 'marker-end="url(#arr)"')) + label(mx + (vert ? 18 : 0), my + (vert ? 0 : -9), lab, 9); };
  const hl = st(INK, 1.4);
  if (g.type !== 'flat') {
    s += rect(X(0), Y(D), W * k, D * k, st(GREY, .8, 'stroke-dasharray="7 4"'));
    const gut = [], gx = .6;
    if (g.type === 'gable' && g.ridgeAx === 'x') { s += line(X(-ox), Y(D / 2), X(W + ox), Y(D / 2), hl) + arrow(W / 2, D / 2 - D * .1, W / 2, D * .12, pt) + arrow(W / 2, D / 2 + D * .1, W / 2, D - D * .12, pt); gut.push('front', 'back'); }
    else if (g.type === 'gable') { s += line(X(W / 2), Y(-oy), X(W / 2), Y(D + oy), hl) + arrow(W / 2 - W * .1, D / 2, W * .12, D / 2, pt) + arrow(W / 2 + W * .1, D / 2, W - W * .12, D / 2, pt); gut.push('left', 'right'); }
    else if (g.type === 'hip') {
      if (W >= D) { const a = D / 2, b = W - D / 2; s += line(X(a), Y(D / 2), X(b), Y(D / 2), hl) + [[-ox, -oy, a], [-ox, D + oy, a], [W + ox, -oy, b], [W + ox, D + oy, b]].map(([x, y, e]) => line(X(x), Y(y), X(e), Y(D / 2), hl)).join('') + arrow(W / 2, D * .4, W / 2, D * .12, pt) + arrow(W / 2, D * .6, W / 2, D * .88, pt) + arrow(a * .6, D / 2, a * .15, D / 2, pt) + arrow(W - a * .6, D / 2, W - a * .15, D / 2, pt); }
      else { const a = W / 2, b = D - W / 2; s += line(X(W / 2), Y(a), X(W / 2), Y(b), hl) + [[-ox, -oy, a], [W + ox, -oy, a], [-ox, D + oy, b], [W + ox, D + oy, b]].map(([x, y, e]) => line(X(x), Y(y), X(W / 2), Y(e), hl)).join('') + arrow(W * .4, D / 2, W * .12, D / 2, pt) + arrow(W * .6, D / 2, W * .88, D / 2, pt) + arrow(W / 2, a * .6, W / 2, a * .15, pt) + arrow(W / 2, D - a * .6, W / 2, D - a * .15, pt); }
      gut.push('front', 'back', 'left', 'right');
    } else { s += arrow(W * .3, D * .15, W * .3, D * .85, pt) + arrow(W * .7, D * .15, W * .7, D * .85, pt) + label(X(W / 2), Y(-oy) - 10, 'HIGH SIDE', 8) + label(X(W / 2), Y(D + oy) + 10, 'LOW SIDE', 8); gut.push('back'); }
    if (d.attached) gut.splice(0, gut.length, ...gut.filter(x => x === 'front' || x === 'back'));
    // gutters along the eaves, downspouts at their ends
    const ds = (x, y) => rect(X(x) - Math.max(.35 * k, 2.5), Y(y) - Math.max(.35 * k, 2.5), Math.max(.7 * k, 5), Math.max(.7 * k, 5), box('#fff'));
    for (const sd of gut) {
      if (sd === 'front' || sd === 'back') { const y = sd === 'front' ? -oy + gx : D + oy - gx; s += line(X(-ox), Y(y), X(W + ox), Y(y), st(GREY, .7)) + ds(-ox + gx, y) + ds(W + ox - gx, y); }
      else { const x = sd === 'left' ? -ox + gx : W + ox - gx; s += line(X(x), Y(-oy), X(x), Y(D + oy), st(GREY, .7)) + ds(x, -oy + gx) + ds(x, D + oy - gx); }
    }
    if (d.attached) s += line(X(0), Y(D + oy), X(0), Y(-oy), st(INK, 3)) + line(X(W), Y(D + oy), X(W), Y(-oy), st(INK, 3)) + label(X(W / 2), Y(D + oy) - 10, 'ROOF CONTINUOUS OVER ROW · RATED PARTY WALLS BELOW', 8);
    s += label(X(W * .5), Y(D * (g.ridgeAx === 'x' && g.type === 'gable' ? .3 : .5)) + (g.ridgeAx === 'x' ? 0 : 16), (d.exterior?.roofing || 'Roofing').toUpperCase().slice(0, 48), clamp(k * .35, 7, 9));
  } else {
    // parapet, drainage to scuppers (or interior drains on deep roofs), rooftop units, roof hatch
    s += rect(X(.67), Y(D - .67), (W - 1.33) * k, (D - 1.33) * k, st(INK, .8));
    if (D <= 150) {
      const ns = Math.max(2, Math.ceil(W / 60)), cd = Math.min(15, D * .25);
      for (let i = 0; i < ns; i++) { const x = W * (i + .5) / ns; s += rect(X(x - .75), Y(D), 1.5 * k, Math.max(.67 * k, 3), box('#fff')) + rect(X(x) - Math.max(.5 * k, 3), Y(D) - Math.max(1.2 * k, 7), Math.max(k, 6), Math.max(k, 6), box('#fff')) + arrow(x, D * .3, x, D - 2.5, '1/4":12'); }
      for (let i = 0; i < ns - 1; i++) { const xm = W * (i + 1) / ns, a = W * (i + .5) / ns, b = W * (i + 1.5) / ns; s += pline([[X(a), Y(D - .67)], [X(xm), Y(D - cd)], [X(b), Y(D - .67)]], st(GREY, .7, DASH)) + line(X(xm), Y(D - .67), X(xm), Y(D - cd), st(GREY, .7, DASH)); }
      s += label(X(W / (2 * ns)), Y(D) - Math.max(1.2 * k, 7) - 12, 'SCUPPER + DS (TYP.)', 8);
    } else {
      const nx = Math.ceil(W / 60), ny = Math.ceil(D / 60);
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const x = X((i + .5) * W / nx), y = Y((j + .5) * D / ny); s += circle(x, y, Math.max(k, 4), box('#fff')) + line(x - 3, y, x + 3, y, st(INK, .7)) + line(x, y - 3, x, y + 3, st(INK, .7)); }
      s += label(X(W / (2 * nx)), Y(D / (2 * ny)) + Math.max(k, 4) + 10, 'ROOF DRAIN + OVERFLOW (TYP.)', 8);
    }
    // rooftop units, about 8 x 5 ft each on a curb
    rtuSpots(d).forEach(([x, y], i) => { const w = Math.max(8 * k, 12), h = Math.max(5 * k, 8), x0 = X(x) - w / 2, y0 = Y(y) - h / 2; s += rect(x0, y0, w, h, box('#fff', 1)) + rect(x0 + 2, y0 + 2, w - 4, h - 4, st(GREY, .5)) + line(x0, y0, x0 + w, y0 + h, st(GREY, .6)) + line(x0 + w, y0, x0, y0 + h, st(GREY, .6)) + (k >= 2.5 ? label(X(x), y0 + h + 8, 'RTU-' + (i + 1), 7.5, 'font-weight="700"') : ''); });
    const stp = d.rooms.find(r => r.type === 'stair' && r.floor === g.F), hx = stp ? stp.x + stp.w / 2 : W - 6, hy = stp ? stp.y + stp.d / 2 : D - 6, hs = Math.max(3 * k, 7);
    s += rect(X(hx) - hs / 2, Y(hy) - hs / 2, hs, hs, box('#fff')) + line(X(hx) - hs / 2, Y(hy) - hs / 2, X(hx) + hs / 2, Y(hy) + hs / 2, st(INK, .6)) + line(X(hx) + hs / 2, Y(hy) - hs / 2, X(hx) - hs / 2, Y(hy) + hs / 2, st(INK, .6)) + label(X(hx), Y(hy) + hs / 2 + 8, 'ROOF HATCH', 7.5);
    s += label(X(W * .5), Y(D * .12), (d.exterior?.roofing || 'Membrane roofing').toUpperCase().slice(0, 48) + ' · TAPERED INSULATION', clamp(k * .35, 7, 9));
  }
  s += dim(X(0), Y(-oy), X(W), Y(-oy), ftIn(W), 40, 9) + dim(X(-ox), Y(D), X(-ox), Y(0), ftIn(D), 40, 9) + label(X(W / 2), Y(-oy) + 96, 'FRONT (STREET)', 10, 'font-weight="700" letter-spacing="1"');
  return { body: s, w: (W + 2 * ox) * k + mL + mR, h: (D + 2 * oy) * k + mT + mB };
}

// the side column of the plan sheet: room schedule, areas, legend, the unit row key, notes
function planSide(ctx, t, d, g) {
  const rooms = d.rooms.slice().sort((a, b) => a.floor - b.floor || a.y - b.y || a.x - b.x), max = 44, res = isRes(t), sched = sheetNo(ctx, 'a-sched', t.id) || 'A-6xx';
  let h = table('Room schedule', ['Room', 'Floor', 'Size', 'Area (sf)'], rooms.slice(0, max).map(r => [r.name, r.floor, ftIn(r.w) + ' × ' + ftIn(r.d), f0(r.area)]), [1, 3]) +
    (rooms.length > max ? '<p class="muted sm">+ ' + (rooms.length - max) + ' more rooms: see the finish schedule on ' + esc(sched) + '.</p>' : '');
  const by = ty => d.rooms.filter(r => ty.includes(r.type)).reduce((a, r) => a + r.area, 0), garage = by(['garage']), porch = by(['porch']);
  const fa = [...Array(g.F)].map((_, i) => ['Floor ' + (i + 1) + (i ? ' (rooms)' : ' (gross)'), f0(i ? roomsOn(d, i + 1).reduce((a, r) => a + r.area, 0) : d.W * d.D) + ' sf']);
  const tot = d.rooms.reduce((a, r) => a + r.area, 0);
  h += '<div class="blk">' + table('Areas', null, [...fa, ...(res ? [['Living (conditioned)', f0(tot - garage - porch) + ' sf'], ['Garage', f0(garage) + ' sf']].concat(porch ? [['Porch', f0(porch) + ' sf']] : []) : [['Total of rooms', f0(tot) + ' sf']]),
    ['Buildings of this type', String(t.count || 1) + (t.attached ? ' rows × ' + t.unitsPer + ' units' : '')]], [1]) + '</div>';
  h += '<div class="blk"><div class="bh">Legend</div>' + legendRow(rect(4, 6, 36, 6, fl(INK)), 'Exterior wall, 8" (schematic)') + legendRow(rect(4, 7.5, 36, 3, fl('#4d5457')), 'Interior partition, 4-1/2"') +
    (d.attached ? legendRow(rect(4, 5, 36, 8, 'fill="url(#hatch2)" stroke="#1b1e1f" stroke-width="1.2"'), '1-hr rated party wall (IRC R302.2)') : '') +
    legendRow(doorTag(22, 9, 7.5, '101').replace(' class="dtag"', ''), 'Door tag: see door schedule ' + sched) + legendRow(winTag(22, 9, 8, 'A1'), 'Window tag: see window schedule ' + sched) +
    legendRow(rect(4, 6, 36, 6, 'fill="#fff" stroke="#1b1e1f" stroke-width=".8"') + line(4, 9, 40, 9, st(INK, .7)), 'Window in exterior wall') + legendRow(line(4, 9, 40, 9, st(INK, 1, 'marker-end="url(#arr)"')), 'Stair: UP / DN from this floor') + '</div>';
  if (d.attached && g.n > 1) {
    const kw = 620, uw = kw / g.n, kh = Math.min(120, kw * d.D / g.RW);
    let s2 = ''; for (let i = 0; i < g.n; i++) s2 += rect(10 + i * uw, 10, uw, kh, (i === 0 || i === g.n - 1 ? 'fill="url(#hatch)"' : 'fill="#f1f2f1"') + ' stroke="#1b1e1f" stroke-width="1"') + text(10 + i * uw + uw / 2, 10 + kh / 2, String(i + 1), 11, 'fill="#1b1e1f" text-anchor="middle" dominant-baseline="central" font-weight="700"');
    for (let i = 1; i < g.n; i++) s2 += line(10 + i * uw, 6, 10 + i * uw, 14 + kh, st(INK, 3));
    s2 += text(10 + kw / 2, kh + 30, 'FRONT (STREET)', 9, 'fill="#1b1e1f" text-anchor="middle" font-weight="700"');
    h += '<div class="blk"><div class="bh">Unit row key</div>' + svg(kw + 20, kh + 40, s2) + '<p class="sm">' + g.n + ' units in a row, ' + ftIn(g.RW) + ' × ' + ftIn(d.D) + '. Every unit is this plan (end units hatched); heavy lines are 1-hr rated party walls (IRC R302.2; 2-hr where the townhouses are not sprinklered — confirm).</p></div>';
  }
  const def = res ? ['Dimensions are schematic, to room boundaries (wall centrelines) and outside face of exterior walls; confirm in design development.',
    'Exterior walls 2x4 / 2x6 wood studs @ 16" o.c. with veneer, drawn 8" thick; interior partitions 2x4 @ 16" o.c., drawn 4-1/2".',
    'Every sleeping room has an emergency escape window: 5.7 sf net clear opening, sill 44" max. above the floor (IRC R310).',
    'Smoke alarms in each bedroom, outside each sleeping area and on every story; CO alarms outside sleeping areas (IRC R314, R315).',
    'Garage separated from the dwelling with 1/2" gyp. bd. (5/8" Type X under rooms above); the door between is 20-min or solid core and self-closing (IRC R302.5–R302.6).',
    'Safety glazing at doors, tubs and showers and near doors (IRC R308.4).', g.F > 1 ? 'Stairs: 7-3/4" max. riser, 10" min. tread, 36" min. width, handrail 34–38" (IRC R311.7).' : '',
    'Plumbing fixtures, cabinets and appliances are shown for layout only.']
    : ['Dimensions are schematic, to room boundaries and outside face of exterior walls; confirm in design development.', 'Shell spaces are finished by tenants under separate permits; demising walls run to the roof deck.',
      'Exit doors swing in the direction of egress where the room serves 50 or more people (IBC 1010.1.2.1); panic hardware at A occupancies (IBC 1010.2.9).',
      'Restrooms are accessible single-user or multi-stall rooms with a 60" turning space (TAS 603–604).', 'Rooftop units are screened from the street by the parapet; curbs and openings per mechanical.',
      'Fixtures and equipment are shown for layout only; the kitchen hood, walk-in and equipment by the food service designer.'];
  const nn = discNotes(ctx, 'arch'); h += notes('Notes', nn.length ? nn : def);
  return h;
}

function aPlans(ctx, sheet) {
  const { t, d } = look(ctx, sheet); if (!d) return noDesign(sheet, t);
  const g = geo(t, d), mw = PM.mL + PM.mR, mh = PM.mT + PM.mB + TITLE;
  const views = [...Array(g.F)].map((_, i) => ({ f: i + 1, wf: d.W, hf: d.D, mw, mh })).concat([{ f: 0, wf: d.W + 2 * (d.attached ? 0 : g.oh), hf: d.D + 2 * g.oh, mw, mh }]);
  const bx = { x: 0, y: 0, w: toPx(MAIN.w), h: toPx(MAIN.h) }, best = bestLayout(views.map((_, i) => chunk(views, i + 1)), bx.w, bx.h), k = best.s.k;
  sheet.scale = best.s.label;
  const html = placeRows(best.rows, k, bx).map((p, i) => { const v = p.v, dr = v.f ? planView(t, d, v.f, k) : roofView(t, d, g, k); return placed(p, dr, i + 1, v.f ? (FLOORS[v.f] || 'Level ' + v.f) + ' floor plan' : 'Roof plan', best.s.label); }).join('');
  return html + side(planSide(ctx, t, d, g));
}

// ---------- exterior elevations ----------
const EM = { mL: 34, mR: 160, mT: 30, mB: 40 };
const MATS = { brick: 'url(#brick)', siding: 'url(#siding)', stucco: 'url(#conc)', metal: 'url(#ar-rib)', tilt: 'none' };
const matOf = s => /brick|stone|masonry/.test(s) ? 'brick' : /siding|lap|board|hardie|fiber cement|cement board/.test(s) ? 'siding' : /tilt|concrete|precast|cmu/.test(s) ? 'tilt' : /stucco|eifs|plaster/.test(s) ? 'stucco' : /metal/.test(s) ? 'metal' : '';
// the wall materials: lower and upper skins and where they change
function skin(t, d, g) {
  const w = String(d.exterior?.walls || '').toLowerCase();
  if (isRes(t)) { const lo = matOf(w) || 'brick', hi = /siding|lap|board|hardie|fiber cement/.test(w) ? 'siding' : lo; return { lo, hi, split: g.F > 1 ? g.fh : g.plate, gable: hi === 'brick' ? 'siding' : hi }; }
  const lo = matOf(w) || 'stucco', hi = (lo === 'brick' && /eifs|stucco/.test(w)) ? 'stucco' : lo;
  return { lo, hi, split: hi !== lo ? Math.min(12, g.plate * .6) : g.plate, gable: hi };
}
const doorH = (t, dr) => dr.kind === 'overhead' ? (isRes(t) ? (dr.width >= 18 ? 8 : 7) : dr.width >= 12 ? 14 : 10) : dr.kind === 'storefront' ? 7 : isRes(t) ? 6.67 : 7;

function elevView(t, d, g, sd, k) {
  const fr = sd === 'front' || sd === 'back', n = fr ? g.n : 1, A = fr ? g.RW : d.D, U = d.W, res = isRes(t), sk = skin(t, d, g), p = g.p / 12, oh = g.oh;
  const zTop = g.top + 1.5, zBot = -1.5, X = s => EM.mL + (s + oh) * k, Y = z => EM.mT + (zTop - z) * k;
  const flat = g.type === 'flat', shed = g.type === 'shed', zE = g.plate - oh * p;
  const sv = (a, b) => [X(a), Y(b)], P = pts => poly(pts.map(([a, b]) => sv(a, b)), 'fill="#fff" stroke="none"');
  let s = MYDEFS;
  // the wall outline: plate or parapet; a shed's sides slope from the high front to the low back
  const hiFront = g.ridge, wallPts = flat ? [[0, 0], [A, 0], [A, g.parapet], [0, g.parapet]] : shed ? (sd === 'front' ? [[0, 0], [A, 0], [A, hiFront], [0, hiFront]] : sd === 'back' ? [[0, 0], [A, 0], [A, g.plate], [0, g.plate]] : sd === 'left' ? [[0, 0], [A, 0], [A, hiFront], [0, g.plate]] : [[0, 0], [A, 0], [A, g.plate], [0, hiFront]]) : [[0, 0], [A, 0], [A, g.plate], [0, g.plate]];
  const fill = (pts, m) => P(pts) + (m === 'tilt' ? poly(pts.map(([a, b]) => sv(a, b)), fl('#f2f2f0')) : poly(pts.map(([a, b]) => sv(a, b)), fl(MATS[m] || 'none')));
  const wtop = Math.max(...wallPts.map(q => q[1]));
  s += fill(wallPts.map(([a, b]) => [a, Math.min(b, sk.split)]), sk.lo); if (wtop > sk.split) s += fill(wallPts.map(([a, b]) => [a, Math.max(sk.split, b)]).map(([a, b], i) => [a, i < 2 ? sk.split : b]), sk.hi);
  if (sk.lo !== sk.hi && sk.split < wtop) s += line(X(0), Y(sk.split), X(A), Y(sk.split), st(INK, 1.2));
  if (sk.lo === 'tilt') { const np = Math.max(1, Math.round(A / 26)); for (let i = 1; i < np; i++) s += line(X(A * i / np), Y(0), X(A * i / np), Y(wtop), st(GREY, .8)); s += line(X(0), Y(Math.min(4, wtop / 4)), X(A), Y(Math.min(4, wtop / 4)), st(GREY, .6)); }
  // gable ends (where the ridge runs into the view), with the rake above
  const tri = g.type === 'gable' && ((fr && g.ridgeAx === 'y') || (!fr && g.ridgeAx === 'x'));
  const segs = tri ? (fr && n > 1 ? [...Array(n)].map((_, i) => [i * U, (i + 1) * U]) : [[0, A]]) : [];
  for (const [a, b] of segs) { const m = (a + b) / 2, zr = g.plate + (b - a) / 2 * p, ze = g.plate - oh * p; s += fill([[a, g.plate], [m, zr], [b, g.plate]], sk.gable) + poly([sv(a - oh, ze), sv(m, zr), sv(b + oh, ze), sv(b + oh, ze + .6), sv(m, zr + .6), sv(a - oh, ze + .6)], box('#4d5457', 1)); }
  s += poly(wallPts.map(([a, b]) => sv(a, b)), st(INK, 1.6));
  if (fr && n > 1) for (let i = 1; i < n; i++) s += line(X(i * U), Y(0), X(i * U), Y(g.plate), st(INK, 1.2));
  // the roof seen beyond the wall
  const RF = 'fill="#e2e4e3" stroke="#1b1e1f" stroke-width="1.2"', RP = fl('url(#siding)');
  const roofPoly = pts => poly(pts.map(([a, b]) => sv(a, b)), RF) + poly(pts.map(([a, b]) => sv(a, b)), RP);
  let roofAnchor = null;
  if (g.type === 'gable' && !tri) { s += roofPoly([[-oh, zE], [A + oh, zE], [A + oh, g.ridge], [-oh, g.ridge]]); roofAnchor = [A * .7, (zE + g.ridge) / 2]; }
  else if (tri) roofAnchor = [segs[0][0] + (segs[0][1] - segs[0][0]) * .3, g.plate + (segs[0][1] - segs[0][0]) * .3 * p + .3];
  else if (g.type === 'hip') { const along = (fr && g.ridgeAx === 'x') || (!fr && g.ridgeAx === 'y'), r0 = along ? g.run : A / 2; s += roofPoly([[-oh, zE], [A + oh, zE], [A - r0, g.ridge], [r0, g.ridge]]); roofAnchor = [A / 2, (zE + g.ridge) / 2]; }
  else if (shed) {
    const hiE = g.ridge + oh * p, loE = g.plate - oh * p;
    if (sd === 'front') s += poly([sv(-oh, g.ridge), sv(A + oh, g.ridge), sv(A + oh, g.ridge + .7), sv(-oh, g.ridge + .7)], box('#4d5457', 1));
    else if (sd === 'back') s += poly([sv(-oh, loE), sv(A + oh, loE), sv(A + oh, loE + .7), sv(-oh, loE + .7)], box('#4d5457', 1));
    else { const [a, b] = sd === 'left' ? [[-oh, loE], [A + oh, hiE]] : [[-oh, hiE], [A + oh, loE]]; s += poly([sv(...a), sv(...b), sv(b[0], b[1] + .7), sv(a[0], a[1] + .7)], box('#4d5457', 1)); }
    roofAnchor = [A / 2, sd === 'back' ? loE + .35 : sd === 'front' ? g.ridge + .35 : (g.plate + g.ridge) / 2 + .35];
  } else { s += rect(X(0), Y(g.parapet), A * k, .5 * k, box('#cfd3d1', 1.2)); roofAnchor = [A * .5, g.parapet - .25]; }
  // windows and doors on this side, each unit of a row in turn
  const sOf = (u, a, b) => sd === 'front' ? [u * U + a, u * U + b] : sd === 'back' ? [A - (u * U + b), A - (u * U + a)] : sd === 'left' ? [d.D - b, d.D - a] : [a, b];
  let winAnchor = null, doorAnchor = null, canopy = /canop/i.test(d.exterior?.accent || '');
  for (let u = 0; u < n; u++) {
    for (const w of (d.windows || []).filter(x => x.side === sd)) {
      const [a, b] = sOf(u, ...span(w)), z0 = (w.floor - 1) * g.fh + fin(w.sill), z1 = z0 + fin(w.height), x0 = X(a), x1 = X(b), y0 = Y(z1), hh = (z1 - z0) * k;
      if (res && sk.lo === 'brick' && w.floor === 1) s += rect(x0 - .2 * k, y0 - .55 * k, (b - a + .4) * k, .55 * k, box('#fff', .7)) + rect(x0 - .25 * k, Y(z0), (b - a + .5) * k, .3 * k, box('#fff', .7));
      s += rect(x0, y0, x1 - x0, hh, 'fill="#e3eaee" stroke="#1b1e1f" stroke-width="1.1"') + rect(x0 + 2, y0 + 2, x1 - x0 - 4, hh - 4, st(INK, .5));
      if (res) { s += line(x0, y0 + hh / 2, x1, y0 + hh / 2, st(INK, .9)); if (b - a >= 5) s += line((x0 + x1) / 2, y0, (x0 + x1) / 2, y0 + hh, st(INK, .9)); }
      else { const nm = Math.max(1, Math.round((b - a) / 5)); for (let i = 1; i < nm; i++) s += line(x0 + (x1 - x0) * i / nm, y0, x0 + (x1 - x0) * i / nm, y0 + hh, st(INK, .9)); if (z1 - z0 > 8) s += line(x0, Y(z0 + 7), x1, Y(z0 + 7), st(INK, .9)); }
      winAnchor = winAnchor || [(a + b) / 2, z1 - .5];
    }
    for (const dr of (d.doors || []).filter(x => x.exterior && x.side === sd && x.floor === 1)) {
      const [a, b] = sOf(u, ...span(dr)), hgt = Math.min(doorH(t, dr), g.plate - 1), x0 = X(a), x1 = X(b), y0 = Y(hgt), hh = hgt * k, w = x1 - x0;
      if (dr.kind === 'overhead') { s += rect(x0, y0, w, hh, box('#f4f4f2', 1.2)); const ns = Math.max(3, Math.round(hgt / (res ? 1.75 : 2))); for (let i = 1; i < ns; i++) s += line(x0, y0 + hh * i / ns, x1, y0 + hh * i / ns, st(INK, .6)); if (res && k >= 6) for (let i = 1; i < 4; i++) s += line(x0 + w * i / 4, y0, x0 + w * i / 4, y0 + hh, st(GREY, .4)); }
      else if (dr.kind === 'storefront' || dr.kind === 'sliding') { const th = dr.kind === 'storefront' ? Math.min(10, g.plate - 1) : hgt; s += rect(x0, Y(th), w, th * k, 'fill="#e3eaee" stroke="#1b1e1f" stroke-width="1.2"'); const nm = Math.max(2, Math.round((b - a) / 3)); for (let i = 1; i < nm; i++) s += line(x0 + w * i / nm, Y(th), x0 + w * i / nm, Y(0), st(INK, .8)); if (th > hgt) s += line(x0, y0, x1, y0, st(INK, .9)); if (dr.kind === 'storefront') s += line(x0 + w * .3, Y(3.5), x0 + w * .45, Y(3.5), st(INK, 1.4)) + line(x0 + w * .55, Y(3.5), x0 + w * .7, Y(3.5), st(INK, 1.4)); if (canopy && !res && g.plate > 13) s += rect(X(a - 2), Y(th + 1.4), (b - a + 4) * k, .6 * k, box('#4d5457', 1)) + line(X(a - 2), Y(th + .8), X(a + 1), Y(th + 4), st(INK, .8)) + line(X(b + 2), Y(th + .8), X(b - 1), Y(th + 4), st(INK, .8)); }
      else if (dr.kind === 'opening') s += rect(x0, y0, w, hh, st(INK, 1, DASH));
      else { const lv = dr.kind === 'double' ? 2 : 1; s += rect(x0, y0, w, hh, box('#fbfbfa', 1.2)); for (let i = 0; i < lv; i++) { const lx = x0 + w * i / lv, lw = w / lv; s += rect(lx + lw * .18, y0 + hh * .1, lw * .64, hh * .35, st(INK, .5)) + rect(lx + lw * .18, y0 + hh * .52, lw * .64, hh * .38, st(INK, .5)) + circle(i ? lx + lw * .12 : lx + lw * .88, Y(3), Math.max(1.2, .12 * k), fl(INK)); } if (lv === 2) s += line(x0 + w / 2, y0, x0 + w / 2, Y(0), st(INK, .9)); }
      doorAnchor = doorAnchor || [(a + b) / 2, hgt * .75];
    }
  }
  // grade and the exposed slab edge
  s += rect(X(0), Y(0), A * k, .5 * k, box('#fff', .8)) + rect(X(-oh) - 12, Y(-.5), (A + 2 * oh) * k + 24, 12, fl('url(#earth)')) + line(X(-oh) - 12, Y(-.5), X(A + oh) + 12, Y(-.5), st(INK, 2.4));
  s += levelMarks(levelList(g), X(A) + 4, X(A + oh) + 14, Y);
  // material keynotes
  const kn = [[1, [A * .06, Math.min(sk.split, g.plate) * .45]], ...(sk.hi !== sk.lo && wtop > sk.split + 1 ? [[2, [A * .06, (sk.split + Math.min(wtop, g.plate)) / 2]]] : []), [3, roofAnchor], [4, winAnchor], [5, doorAnchor]].filter(x => x[1]);
  for (const [nmb, [a, b]] of kn) { const x = X(a), y = Y(b), tx = Math.max(12, x - 28), ty = Math.max(10, y - 28); s += line(x, y, tx, ty, st(INK, .7)) + circle(x, y, 1.8, fl(INK)) + rect(tx - 8, ty - 8, 16, 16, box('#fff', 1)) + text(tx, ty, String(nmb), 9, 'fill="#1b1e1f" text-anchor="middle" dominant-baseline="central" font-weight="700"'); }
  return { body: s, w: (A + 2 * oh) * k + EM.mL + EM.mR, h: (zTop - zBot) * k + EM.mT + EM.mB };
}
const ELEV_TITLES = { front: 'Front elevation', back: 'Rear elevation', left: 'Left side elevation', right: 'Right side elevation' };
function aElev(ctx, sheet) {
  const { t, d } = look(ctx, sheet); if (!d) return noDesign(sheet, t);
  const g = geo(t, d), V = ['front', 'back', 'left', 'right'].map(sd => ({ sd, wf: (sd === 'front' || sd === 'back' ? g.RW : d.D) + 2 * g.oh, hf: g.top + 3, mw: EM.mL + EM.mR, mh: EM.mT + EM.mB + TITLE }));
  const [F, B, L, R] = V, bx = { x: 0, y: 0, w: toPx(MAIN.w), h: toPx(MAIN.h) }, best = bestLayout([[[F, B], [L, R]], [[F], [B], [L, R]], [[F], [B], [L], [R]]], bx.w, bx.h);
  sheet.scale = best.s.label;
  const html = placeRows(best.rows, best.s.k, bx).map(p => placed(p, elevView(t, d, g, p.v.sd, best.s.k), V.indexOf(p.v) + 1, ELEV_TITLES[p.v.sd] + (p.v.sd === 'front' ? ' (street)' : ''), best.s.label)).join('');
  const ex = d.exterior || {}, sk = skin(t, d, g), res = isRes(t);
  const key = [['1', sk.lo === 'brick' && res ? 'Walls, first floor' : 'Walls', ex.walls || '—'], ...(sk.hi !== sk.lo ? [['2', 'Walls above', sk.hi === 'siding' ? 'Fiber cement lap siding, painted' : sk.hi === 'stucco' ? 'EIFS / stucco finish' : ex.walls]] : []),
    ['3', 'Roof', (ex.roofing || '—') + (g.type === 'flat' ? ' behind 3\'-0" parapet, prefinished metal coping' : ', ' + pitchTxt(g.p) + ', ' + ftIn(g.oh) + ' overhang')], ['4', 'Windows', ex.windows || '—'], ['5', 'Doors', ex.doors || '—'], ...(ex.accent ? [['6', 'Accent / trim', ex.accent]] : [])];
  const def = ['Elevations are schematic: window and door sizes and places come from the floor plans; materials from the design narrative.', 'Heights are from the top of the first floor slab; finish grade 6" min. below the slab at walls (IRC R404.1.6 / IBC 1804.4).',
    res ? 'Brick veneer: weep holes at 33" o.c. above flashing at the base and over openings (IRC R703.8).' : 'Rooftop equipment screened from the street by the parapet; confirm sight lines.', 'Final colors and materials are selected in design development.'];
  return html + side(table('Material keynotes', ['No.', 'Item', 'Material'], key) + '<div class="blk">' + table('Levels', ['Level', 'Height'], levelList(g).map(l => [l.n, ftIn(l.z)]), [1]) + '</div>' +
    (d.attached ? '<p class="sm" style="margin-top:8pt">Front and rear elevations show the whole row of ' + g.n + ' units (' + ftIn(g.RW) + '); side elevations show an end unit. Heavy lines mark the 1-hr rated party walls.</p>' : '') + notes('Notes', def));
}

// ---------- building sections ----------
const SM = { mL: 70, mR: 160, mT: 30, mB: 46 };
function wallKind(t, d) {
  const w = String(d?.exterior?.walls || '').toLowerCase();
  if (isRes(t)) return /siding|lap|board|hardie|fiber cement/.test(w) && !/brick|stone|masonry/.test(w) ? 'wood-siding' : 'wood-brick';
  if (/tilt|precast/.test(w) || t.use === 'industrial') return 'tilt';
  return /^I/.test(t.construction || '') ? 'cmu' : 'stud';
}
function sectionNotes(t, d, g) {
  const ex = d.exterior || {}, sy = d.systems || {}, res = isRes(t), kind = wallKind(t, d), flat = g.type === 'flat';
  const wall = { 'wood-brick': 'Brick veneer, 1" air space, WRB, 7/16" OSB on 2x4 studs @ 16" o.c., R-13 batts, 1/2" gyp. bd.', 'wood-siding': 'Fiber cement lap siding, WRB, 7/16" OSB on 2x4 studs @ 16" o.c., R-13 batts, 1/2" gyp. bd.',
    tilt: '9-1/4" concrete tilt-wall panels, painted; furring, R-7.5 rigid insulation and 5/8" gyp. bd. at conditioned rooms', cmu: 'Brick veneer on 8" CMU, grouted and reinforced per structural, R-7.5 c.i., furring and 5/8" gyp. bd.', stud: (ex.walls || 'Veneer') + ' on 6" metal studs @ 16" o.c., R-19 batts, sheathing + air barrier, 5/8" gyp. bd.' }[kind];
  return [['Roofing', flat ? (ex.roofing || 'TPO membrane') + ' on cover board over R-25 c.i. polyiso, tapered to drains 1/4":12 min.' : (ex.roofing || 'Architectural asphalt shingles') + ' on synthetic underlayment, 7/16" OSB with radiant barrier'],
    ['Roof structure', flat ? 'Steel roof deck on open-web steel joists' + (g.F > 1 || d.W * d.D > 6000 ? ' and girders on steel columns' : '') + ', depth per structural' : 'Engineered wood roof trusses @ 24" o.c., ' + pitchTxt(g.p) + ', ' + ftIn(g.oh) + ' overhang, hurricane ties at every bearing'],
    ['Insulation', flat ? 'Continuous roof insulation above the deck (IECC C402, climate zone 2A)' : 'R-38 blown attic insulation (R-49 where the 2021 IECC is adopted), baffles at the eaves'],
    ['Exterior wall', wall], ...(g.F > 1 ? [['Floor', res ? '14" open-web floor trusses @ 24" o.c., 3/4" T&G subfloor, sound batts at bedrooms' : '3-1/4" lightweight concrete on 2" composite deck on steel joists']] : []),
    ['Slab', (sy.foundation || (res ? 'Post-tensioned slab on grade' : 'Slab on grade with grade beams')) + (res ? ', 4" min., 10 mil vapor retarder' : ', 5" (6" in warehouses), 15 mil vapor retarder')],
    ['Foundation', res ? 'Perimeter and interior grade beams 12" × 28" min., depth per geotechnical report' : 'Grade beams and spread footings at columns per structural and geotechnical report'],
    ['Ceiling', res ? '1/2" gyp. bd. (5/8" Type X at the garage)' : '2x4 lay-in acoustical tile where scheduled; open to structure in shell, warehouse and assembly rooms']];
}
function sectionView(t, d, g, axis, k) {
  const res = isRes(t), L = axis === 'y' ? d.D : d.W, other = axis === 'y' ? d.W : d.D, p = g.p / 12, oh = g.type === 'flat' ? 0 : axis === 'x' && d.attached ? 0 : g.oh, kind = wallKind(t, d);
  // the cut runs through the middle, nudged off any wall line so it shows rooms rather than a wall
  const edges = d.rooms.flatMap(r => axis === 'y' ? [r.x, r.x + r.w] : [r.y, r.y + r.d]); let c = other / 2;
  for (const dd of [0, 2, -2, 4, -4, 6, -6, 8, -8]) { const cc = other / 2 + dd; if (cc > .5 && cc < other - .5 && !edges.some(e => Math.abs(e - cc) < 1)) { c = cc; break; } }
  const zTop = g.top + 2, zBot = -4.5, X = s => SM.mL + (s + oh + 3) * k, Y = z => SM.mT + (zTop - z) * k, te = Math.max(.67 * k, 2.4), ti = Math.max(.375 * k, 1.3);
  const R = (s0, z0, s1, z1, a) => rect(X(s0), Y(z1), (s1 - s0) * k, (z1 - z0) * k, a), WALL = (kind === 'tilt' || kind === 'cmu') ? box('url(#conc)', 1) : box('url(#hatch)', 1);
  let s = MYDEFS + rect(X(-oh - 3), Y(-.5), (L + 2 * oh + 6) * k, 3.8 * k, fl('url(#earth)')) + line(X(-oh - 3), Y(-.5), X(L + oh + 3), Y(-.5), st(INK, 2.2));
  // slab and beams (grade beams at the walls and every ~15 ft; footings at the columns of long-span roofs)
  const slabT = res ? .33 : .5, span0 = g.type === 'flat' && L > 60 ? Math.ceil(L / 50) : 1, cols = [...Array(span0 - 1)].map((_, i) => L * (i + 1) / span0);
  s += R(0, -slabT, L, 0, box('url(#conc)', 1));
  const beams = [.5, L - .5]; if (!cols.length) for (let b = 15; b < L - 8; b += 15) beams.push(b);
  for (const b of beams) s += R(b - .5, -2.5, b + .5, -slabT, box('url(#conc)', .8));
  for (const b of cols) s += R(b - 2, -3.2, b + 2, -2.2, box('url(#conc)', .8)) + R(b - .5, -2.2, b + .5, -slabT, box('url(#conc)', .8));
  // the roof profile along the cut
  const tri = (g.type === 'gable' || g.type === 'hip') && g.ridgeAx !== axis, flat = g.type === 'flat';
  const zCut = g.type === 'shed' ? (axis === 'y' ? null : g.ridge - c * p) : g.type === 'gable' && !tri ? g.plate + Math.max(0, g.run - Math.abs(c - other / 2)) * p : null;
  const topAt = s0 => flat ? g.plate : g.type === 'shed' ? (axis === 'y' ? g.ridge - s0 * p : zCut) : tri ? g.plate + Math.min(s0, L - s0) * p : g.type === 'hip' ? Math.min(g.ridge, g.plate + Math.min(s0, L - s0) * p) : zCut;
  const endTop = [0, L].map(s0 => flat ? g.parapet : g.type === 'shed' ? topAt(s0) : !tri && g.type === 'gable' ? zCut : g.plate);
  // the cut exterior walls (gable ends run up to the roof; parapets 3 ft above the deck)
  s += R(0, 0, .67, endTop[0], WALL) + R(L - .67, 0, L, endTop[1], WALL);
  if (flat) s += R(-.1, g.parapet, .77, g.parapet + .35, box('#cfd3d1', 1)) + R(L - .77, g.parapet, L + .1, g.parapet + .35, box('#cfd3d1', 1));
  // floors, cut partitions, ceilings and room names, floor by floor
  const fd = res ? 1.1 : 2;
  for (let f = 1; f <= g.F; f++) {
    const z0 = (f - 1) * g.fh;
    if (f > 1) { s += R(.67, z0 - fd, L - .67, z0, box('#fff', 1)); const zz = [], n2 = Math.max(2, Math.round((L - 1.3) / 2.5)); for (let i = 0; i <= n2; i++) zz.push([X(.67 + (L - 1.34) * i / n2), Y(i % 2 ? z0 - .15 : z0 - fd + .15)]); s += pline(zz, st(GREY, .6)); }
    const iv = roomsOn(d, f).filter(r => axis === 'y' ? r.x < c && r.x + r.w > c : r.y < c && r.y + r.d > c).map(r => ({ r, a: axis === 'y' ? r.y : r.x, b: axis === 'y' ? r.y + r.d : r.x + r.w })).sort((q, w) => q.a - w.a);
    const zTopF = f < g.F ? f * g.fh - fd : g.plate - (flat ? 2.2 : 0), walls = new Set();
    for (const q of iv) for (const e of [q.a, q.b]) if (e > .8 && e < L - .8) walls.add(Math.round(e * 2) / 2);
    for (const e of walls) { const ch = Math.max(...iv.filter(q => Math.abs(q.a - e) < .6 || Math.abs(q.b - e) < .6).map(q => ceilOf(t, g, q.r))); s += rect(X(e) - ti / 2, Y(ch ? z0 + ch : zTopF), ti, ((ch ? z0 + ch : zTopF) - z0) * k, box('url(#hatch)', .6)); }
    for (const q of iv) {
      const ch = ceilOf(t, g, q.r), a = Math.max(q.a, .67), b = Math.min(q.b, L - .67); if (b - a < .5) continue;
      if (ch) s += line(X(a), Y(z0 + ch), X(b), Y(z0 + ch), st(INK, 1.1));
      const fs = clamp(k * .55, 7, 11), mid = (a + b) / 2, zl = z0 + Math.min(ch || (zTopF - z0), g.fh) * .45;
      if ((b - a) * k > q.r.name.length * fs * .6 + 6) s += label(X(mid), Y(zl), q.r.name.toUpperCase(), fs, 'font-weight="700"') + ((b - a) * k > 80 ? label(X(mid), Y(zl) + fs * 1.3, ch ? 'CLG ' + ftIn(ch) : 'OPEN TO STRUCTURE', fs * .8) : '');
    }
  }
  // roof structure
  const zE = g.plate - oh * p;
  if (flat) {
    const jd = clamp(L / span0 / 20, 1.5, 4), zj = g.plate - .15, n2 = Math.max(2, Math.round((L - 1.4) / Math.max(2.5, jd * 1.2)));
    s += R(.67, zj, L - .67, g.plate, fl(INK)) + R(.67, g.plate, L - .67, g.plate + .4, box('url(#ar-rigid)', .6)) + line(X(.67), Y(g.plate + .42), X(L - .67), Y(g.plate + .42), st(INK, 1.6));
    s += line(X(.67), Y(zj - .1), X(L - .67), Y(zj - .1), st(INK, .9)) + line(X(.67), Y(zj - jd), X(L - .67), Y(zj - jd), st(INK, .9));
    const zz = []; for (let i = 0; i <= n2; i++) zz.push([X(.67 + (L - 1.34) * i / n2), Y(i % 2 ? zj - .1 : zj - jd)]); s += pline(zz, st(GREY, .6));
    for (const b of cols) s += R(b - .3, 0, b + .3, zj - jd, fl(INK));
  } else {
    // topAt runs on past the walls, so the eaves and rakes follow the same slope
    const pts = [], n3 = 32; for (let i = 0; i <= n3; i++) { const s0 = -oh + (L + 2 * oh) * i / n3; pts.push([s0, topAt(s0)]); }
    s += pline(pts.map(([a, b]) => [X(a), Y(b)]), st(INK, 2)) + pline(pts.map(([a, b]) => [X(a), Y(b + .4)]), st(INK, 1.2));
    s += line(X(.67), Y(g.plate), X(L - .67), Y(g.plate), st(INK, 1.2));
    // webs (W trusses where the cut crosses them; truss ends seen at 24" o.c. where it runs along the ridge)
    if (tri || (g.type === 'shed' && axis === 'y')) { const nw = Math.max(2, Math.round(L / 7) * 2), zz = []; for (let i = 0; i <= nw; i++) { const s0 = L * i / nw; zz.push([X(s0), Y(i % 2 ? topAt(s0) - .05 : g.plate)]); } s += pline(zz, st(GREY, .7)); }
    else if (2 * k >= 4) for (let s0 = 2; s0 < L - 1; s0 += 2) s += line(X(s0), Y(g.plate), X(s0), Y(topAt(s0) - .05), st(GREY, .5));
    const ins = []; for (let i = 0; i <= 24; i++) { const s0 = .67 + (L - 1.34) * i / 24; ins.push([s0, Math.max(g.plate + .05, Math.min(g.plate + 1.1, topAt(s0) - .25))]); }
    s += poly([[X(.67), Y(g.plate)], ...ins.map(([a, b]) => [X(a), Y(b)]), [X(L - .67), Y(g.plate)]], fl('url(#ar-batt)'));
    if (oh > 0) s += R(-oh - .1, zE - .5, -oh, zE + .3, box('#fff', .8)) + R(L + oh, zE - .5, L + oh + .1, zE + .3, box('#fff', .8));
  }
  s += levelMarks(levelList(g), X(-oh - 3), X(L + oh + 3) + 6, Y);
  // keynotes, numbered as the side column lists them
  const KN = sectionNotes(t, d, g), ks = KN.map(x => x[0]), at2 = (name, a, b) => { const i = ks.indexOf(name); if (i < 0) return ''; const x = X(a), y = Y(b), tx = x + 22, ty = y - 22; return line(x, y, tx, ty, st(INK, .7)) + circle(x, y, 1.8, fl(INK)) + poly([[tx, ty - 9], [tx + 9, ty], [tx, ty + 9], [tx - 9, ty]], box('#fff', 1)) + text(tx, ty, String(i + 1), 8.5, 'fill="#1b1e1f" text-anchor="middle" dominant-baseline="central" font-weight="700"'); };
  s += at2('Roofing', L * .28, topAt(L * .28) + .4) + at2('Roof structure', L * .42, flat ? g.plate - 1 : (g.plate + topAt(L * .42)) / 2) + at2('Insulation', L * .62, g.plate + (flat ? .2 : .5)) + at2('Exterior wall', .33, g.fh * .35) + at2('Floor', L * .55, g.fh - fd / 2) + at2('Slab', L * .7, -slabT / 2) + at2('Foundation', .5, -1.6);
  const cr = roomsOn(d, 1).find(r => ceilOf(t, g, r)); if (cr) s += at2('Ceiling', L * .8, ceilOf(t, g, cr));
  s += dim(X(0), Y(-4.2), X(L), Y(-4.2), ftIn(L), 18, 9) + label(X(0), Y(-4.2) + 30, axis === 'y' ? 'FRONT' : 'LEFT', 8, 'font-weight="700"') + label(X(L), Y(-4.2) + 30, axis === 'y' ? 'BACK' : 'RIGHT', 8, 'font-weight="700"');
  // floor-to-floor and roof heights on the left
  const zs = [0, ...[...Array(g.F)].map((_, i) => (i + 1) * g.fh), g.top].filter((v, i, a) => i === 0 || v - a[i - 1] > .3);
  for (let i = 1; i < zs.length; i++) s += dim(X(-oh - 3), Y(zs[i]), X(-oh - 3), Y(zs[i - 1]), (zs[i] - zs[i - 1]) * k > 30 ? ftIn(zs[i] - zs[i - 1]) : '', 24, 8);
  return { body: s, w: (L + 2 * oh + 6) * k + SM.mL + SM.mR, h: (zTop - zBot) * k + SM.mT + SM.mB, cut: c };
}

// ---------- wall sections and details (drawn from shapes in feet: x through the wall, outside negative; z up) ----------
const DSCALES = [{ ft: 2 / 3, label: '1-1/2" = 1\'-0"' }, { ft: 1, label: '1" = 1\'-0"' }, { ft: 4 / 3, label: '3/4" = 1\'-0"' }, ...ARCH_SCALES];
const WOOD = box('url(#hatch)', .8), CONC = box('url(#conc)', .9), BRK = box('url(#hatch2)', .8), BATT = box('url(#ar-batt)', .6), WHITE = box('#fff', .7);
function wallParts(kind, o) {
  const H = o.H, flat = !!o.flat, p = (o.p || 6) / 12, oh = flat ? 0 : o.oh ?? 1.5, R = 3.2, S = [], Lb = [], res = kind.startsWith('wood'), tilt = kind === 'tilt', cmu = kind === 'cmu';
  const r = (x0, z0, x1, z1, a) => S.push({ r: [x0, z0, x1, z1], a }), pg = (pts, a) => S.push({ p: pts, a }), ln = (pts, a) => S.push({ l: pts, a }), lab = (x, z, s2) => Lb.push({ x, z, s: s2 });
  const L = kind === 'wood-brick' ? [['brick', -.427, -.125], ['air', -.125, -.042], ['sheath', -.042, 0], ['stud', 0, .292], ['gyp', .292, .333]]
    : kind === 'wood-siding' ? [['siding', -.1, -.042], ['sheath', -.042, 0], ['stud', 0, .292], ['gyp', .292, .333]]
    : kind === 'stud' ? [['brick', -.427, -.125], ['air', -.125, -.042], ['sheath', -.042, 0], ['stud', 0, .5], ['gyp', .5, .552]]
    : cmu ? [['brick', -1.177, -.875], ['rigid', -.875, -.75], ['air', -.75, -.667], ['cmu', -.667, 0], ['furr', 0, .125], ['gyp', .125, .167]]
    : [['panel', -.771, 0], ['furr', 0, .167], ['gyp', .167, .208]];
  const xo = L[0][1], xi = L[L.length - 1][2], brick = L[0][0] === 'brick', jd = o.jd || 2, Hp = flat ? H + 3 : H, struct = L.find(l => ['stud', 'cmu', 'panel'].includes(l[0])), xmin = Math.min(xo, -oh) - .9;
  const LT = { brick: 'Brick veneer, galv. ties @ 16" o.c. each way, weeps @ 33" o.c. over through-wall flashing', air: '1" air space (2" with rigid insulation)', sheath: res ? '7/16" OSB sheathing + WRB, taped seams' : '5/8" exterior gypsum sheathing + air / water barrier',
    stud: res ? '2x4 studs @ 16" o.c., R-13 batts (2x6 / R-19 where noted)' : '6" 18 ga. metal studs @ 16" o.c., R-19 batts', gyp: res ? '1/2" gyp. bd., painted' : '5/8" gyp. bd., painted', siding: 'Fiber cement lap siding, 7" exposure, on WRB',
    panel: '9-1/4" concrete tilt-wall panel, painted both faces', furr: tilt ? 'Furring, R-7.5 rigid insulation at conditioned rooms' : 'Furring + R-7.5 rigid insulation', cmu: '8" CMU, grouted and reinforced cells per structural', rigid: '1-1/2" rigid insulation, R-7.5 c.i.' };
  // ground, slab, foundation
  const gz = res ? -.67 : -.5, slabT = res ? .33 : tilt ? .5 : .42;
  r(xmin, -3.6, R, gz, fl('url(#earth)')); r(xo, -3.6, R, -slabT, fl('url(#earth)')); ln([[xmin, gz], [xo - .05, gz]], st(INK, 1.8));
  lab(xmin + .3, gz + .02, 'Finish grade, 6" fall in the first 10\'-0" away from the wall');
  if (tilt) { r(-1.6, -3.4, 1, -2.4, CONC); r(0, -slabT, R, 0, CONC); ln([[2, -slabT], [2, 0]], st(INK, .8, 'stroke-dasharray="3 2"')); lab(.4, -2.9, 'Continuous footing, size per structural'); lab(1.2, -.25, '6" slab on grade, 4,000 psi, 15 mil vapor retarder; pour-back strip at panels'); }
  else {
    const bo = xo - .04, bi = res ? .75 : 1, bd = res ? -2.33 : -2.5, lz = brick ? -.33 : 0, lx = brick ? -.042 : bo;
    pg([[bo, bd], [bo, lz], [lx, lz], [lx, 0], [R, 0], [R, -slabT], [bi + .35, -slabT], [bi, bd]], CONC);
    ln([[bi + .35, -slabT - .03], [R, -slabT - .03]], st(INK, .8, 'stroke-dasharray="5 3"'));
    if (res) ln([[.3, -slabT / 2], [R, -slabT / 2]], st(INK, .8, 'stroke-dasharray="9 3"'));
    for (const [a, b] of [[bo + .25, bd + .25], [bi - .2, bd + .25], [bo + .25, -.7], [bi - .05, -.7]]) S.push({ c: [a, b, .045], a: fl(INK) });
    lab((bo + bi) / 2, bd + .6, 'Grade beam' + (brick ? ' with brick ledge' : '') + ', size and steel per structural'); lab(1.6, -slabT / 2, res ? '4" post-tensioned slab, tendons per PT supplier' : '5" slab on grade, 4,000 psi'); lab(2.4, -slabT - .03, (res ? '10' : '15') + ' mil vapor retarder over select fill');
  }
  // the wall's layers
  const zc = x => H + .5 + x * p, zs = flat ? 0 : zc(-oh) - .45;
  L.forEach(([nm, x0, x1], i) => {
    const zb = nm === 'brick' ? -.33 : nm === 'panel' ? -2.4 : nm === 'siding' ? -.2 : 0;
    const zt = flat ? (['gyp', 'furr'].includes(nm) ? H - jd - .4 : Hp - (['brick', 'rigid', 'air'].includes(nm) ? .25 : 0)) : (['brick', 'air', 'siding'].includes(nm) ? zs : nm === 'gyp' ? H - .05 : H);
    r(x0, zb, x1, zt, { brick: BRK, air: WHITE, sheath: fl(INK), stud: BATT, gyp: WHITE, siding: WHITE, panel: CONC, furr: BATT, cmu: box('url(#hatch)', .8), rigid: box('url(#ar-rigid)', .6) }[nm]);
    lab((x0 + x1) / 2, 1.2 + i * .4, LT[nm]);
  });
  if (kind === 'wood-siding') { const zz = []; for (let z = -.2; z < zs; z += .58) zz.push([-.042, z], [-.1, z + .02], [-.06, z + .58]); ln(zz, st(INK, .6)); }
  if (struct && struct[0] === 'stud') { r(0, 0, struct[2], .125, WOOD); r(0, (flat ? Hp : H) - .25, struct[2], flat ? Hp : H, WOOD); lab(struct[2] / 2, (flat ? Hp : H) - .12, flat ? 'Top track, blocking for coping' : 'Double top plate'); }
  // roof
  if (!flat) {
    r(0, H, R, H + .29, WOOD); pg([[-oh, zc(-oh)], [R, zc(R)], [R, zc(R) + .4], [-oh, zc(-oh) + .4]], WOOD); pg([[-oh, zc(-oh) + .4], [R, zc(R) + .4], [R, zc(R) + .47], [-oh, zc(-oh) + .47]], fl(INK));
    ln([[-oh - .05, zc(-oh) + .53], [R, zc(R) + .53]], st(INK, 2)); r(.05, H + .29, .2, zc(.125), WOOD);
    r(-oh - .1, zc(-oh) - .45, -oh, zc(-oh) + .45, WOOD); r(-oh, zs - .05, xo, zs, WHITE);
    ln([[-oh - .1, zc(-oh) + .25], [-oh - .15, zc(-oh) - .25], [-oh - .6, zc(-oh) - .25], [-oh - .65, zc(-oh) + .3]], st(INK, 1));
    const ins = []; for (let i = 0; i <= 16; i++) { const x = .35 + (R - .35) * i / 16; ins.push([x, Math.min(H + .29 + 1.1, zc(x) - .15)]); }
    pg([[.35, H + .29], ...ins, [R, H + .29]], fl('url(#ar-batt)')); ln([[.2, zc(.2) - .12], [2.2, zc(2.2) - .12]], st(INK, .8)); r(xi, H - .05, R, H, WHITE);
    lab(R - .6, zc(R - .6) + .5, o.roofing ? o.roofing + ' on synthetic underlayment' : 'Architectural shingles on synthetic underlayment'); lab(R - 1.2, zc(R - 1.2) + .43, '7/16" OSB roof sheathing with radiant barrier');
    lab(R - 1.6, zc(R - 1.6) + .1, 'Engineered wood trusses @ 24" o.c., hurricane tie at each bearing'); lab(1.9, H + .8, 'R-38 blown insulation (R-49 under 2021 IECC); vent baffle at eave');
    lab(-oh - .05, zc(-oh), 'Fascia, vented soffit, 6" seamless gutter'); lab(R - .4, H - .03, res ? '1/2" gyp. bd. ceiling' : '5/8" gyp. bd. ceiling');
  } else {
    const xin = struct ? struct[2] : 0, xst = struct ? struct[1] : xo, zj = H - .125;
    r(xin, zj, R, H, fl(INK)); r(xin + .3, zj - .2, R, zj, WOOD); r(.6, zj - jd, R, zj - jd + .2, WOOD); const zz = []; for (let x = .6, i = 0; x <= R; x += .8, i++) zz.push([x, i % 2 ? zj - .2 : zj - jd + .2]); ln(zz, st(GREY, .9));
    if (tilt || cmu) pg([[0, zj - .2], [.3, zj - .2], [.3, zj - .25], [.05, zj - .25], [.05, zj - .55], [0, zj - .55]], fl(INK));
    r(xin, H, R, H + .42, box('url(#ar-rigid)', .6)); ln([[xin + .02, Hp - .3], [xin + .02, H + .45], [R, H + .45]], st(INK, 1.8)); pg([[xin, H + .42], [xin + .35, H + .42], [xin, H + .77]], WOOD);
    r(xst, Hp, xin, Hp + .17, WOOD); ln([[xin + .12, Hp - .35], [xin + .12, Hp + .26], [xo - .1, Hp + .26], [xo - .1, Hp - .3], [xo - .02, Hp - .38]], st(INK, 1.8));
    lab(R - .4, H + .45, (o.roofing || 'TPO membrane') + ' on cover board'); lab(R - .8, H + .2, 'R-25 c.i. polyiso, tapered 1/4":12 min.'); lab(R - .3, H - .06, '1-1/2" 22 ga. steel roof deck'); lab(R - .5, zj - jd / 2, 'Open-web steel joists, depth per structural');
    lab((xo + xin) / 2, Hp + .26, 'Prefinished metal coping over treated blocking, 1/4":12 to the roof'); lab(xin + .02, H + 1.6, 'Membrane flashing up the parapet, cant at the base'); if (tilt || cmu) lab(.15, zj - .4, 'Steel ledger angle with embeds, joist bearing');
    // a lay-in ceiling shows only when it sits close under the joists (tall rooms break it out of the drawing)
    if (o.ceiling !== false) { const zc2 = Math.min(H - jd - 1.5, 12); if (zc2 > 7 && zc2 >= H - jd - 3) { ln([[xi + .1, zc2], [R, zc2]], st(INK, 1.2, DASH)); lab(R - .5, zc2, '2x4 acoustical ceiling where scheduled'); } }
  }
  const zmax = flat ? Hp + 1 : zc(R) + .9, keep = flat ? Math.min(H - jd - 3.2, Math.min(H - jd - 1.5, 12) - .6 >= H - jd - 3 ? Math.min(H - jd - 1.5, 12) - .6 : H) : H - 2;
  return { S, Lb, xmin, xmax: R, zmin: -3.6, zmax, brk: keep - 3.5 > 1.5 ? [3.5, keep] : null, bx: [xo - .4, R] };
}
// shapes -> SVG at k px/ft with leader labels on the right; o: { labelW, size, z0, z1 (a window: crop without a break) }
let CLIP = 0;
function drawParts(P, k, o = {}) {
  const lw = o.labelW ?? 250, fs = o.size || 10, gap = .7, zmin = o.z0 ?? P.zmin, zmax = o.z1 ?? P.zmax, brk = o.z0 != null ? null : P.brk;
  const zv = z => !brk || z <= brk[0] ? z : z >= brk[1] ? z - (brk[1] - brk[0]) + gap : brk[0] + gap / 2, top = zv(zmax);
  const X = x => (x - P.xmin) * k + 4, Y = z => (top - zv(z)) * k + 4, w = (P.xmax - P.xmin) * k + 8, h = (top - zv(zmin)) * k + 8;
  const rr = (x0, z0, x1, z1, a) => rect(X(x0), Y(z1), (x1 - x0) * k, Y(z0) - Y(z1), a);
  let s = '';
  for (const sh of P.S) {
    if (sh.r) { let [x0, z0, x1, z1] = sh.r; if (brk && z0 < brk[0] && z1 > brk[1]) s += rr(x0, z0, x1, brk[0], sh.a) + rr(x0, brk[1], x1, z1, sh.a); else if (!(brk && z0 >= brk[0] && z1 <= brk[1])) { if (brk && z0 > brk[0] && z0 < brk[1]) z0 = brk[1]; if (brk && z1 > brk[0] && z1 < brk[1]) z1 = brk[0]; if (z1 > z0) s += rr(x0, z0, x1, z1, sh.a); } }
    else if (sh.p) s += poly(sh.p.map(([x, z]) => [X(x), Y(z)]), sh.a);
    else if (sh.l) s += pline(sh.l.map(([x, z]) => [X(x), Y(z)]), sh.a);
    else if (sh.c) s += circle(X(sh.c[0]), Y(sh.c[1]), Math.max(1.2, sh.c[2] * k), sh.a);
  }
  if (brk) for (const z of [brk[0], brk[1]]) { const y = Y(z) + (z === brk[0] ? 2 : -2), a = X((P.bx || [P.xmin, P.xmax])[0]), b = X((P.bx || [P.xmin, P.xmax])[1]), m = (a + b) / 2; s += pline([[a, y], [m - 6, y], [m - 3, y - 7], [m + 3, y + 7], [m + 6, y], [b, y]], st(INK, .9)); }
  const id = 'ar-clip' + (++CLIP);
  s = '<defs><clipPath id="' + id + '"><rect x="0" y="0" width="' + num(w) + '" height="' + num(h) + '"/></clipPath></defs><g clip-path="url(#' + id + ')">' + s + '</g>';
  // leaders out to labels stacked down the right side
  const chars = Math.max(16, Math.floor((lw - 24) / (fs * .5))), items = P.Lb.filter(l => l.z >= zmin && l.z <= zmax && !(brk && l.z > brk[0] && l.z < brk[1]) && l.x >= P.xmin && l.x <= P.xmax)
    .map(l => ({ ax: X(l.x), ay: Y(l.z), lines: wrap(l.s, chars) })).sort((a, b) => a.ay - b.ay);
  let y = 2; for (const it of items) { it.h = it.lines.length * fs * 1.18 + 4; it.ty = Math.max(it.ay - it.h / 2, y); y = it.ty + it.h; }
  let over = y - h; for (let i = items.length - 1; i >= 0 && over > 0; i--) { const it = items[i], lim = i ? items[i - 1].ty + items[i - 1].h : 0, mv = Math.min(over, it.ty - lim); it.ty -= over; over = Math.max(0, over - mv); }
  for (const it of items) s += circle(it.ax, it.ay, 1.6, fl(INK)) + pline([[it.ax, it.ay], [w + 4, it.ty + fs * .6], [w + 10, it.ty + fs * .6]], st(INK, .5)) + it.lines.map((l2, j) => ltext(w + 13, it.ty + fs * .6 + j * fs * 1.18, l2, fs)).join('');
  return { body: MYDEFS + s, w: w + lw, h };
}
const wallTitle = { 'wood-brick': 'Wall section — wood frame, brick veneer', 'wood-siding': 'Wall section — wood frame, lap siding', tilt: 'Wall section — concrete tilt-wall', cmu: 'Wall section — CMU with brick veneer', stud: 'Wall section — metal stud with veneer' };
const fitDetail = (wf, hf, bw, bh, list = DSCALES) => { const s = list.find(x => wf * DPI / x.ft <= bw && hf * DPI / x.ft <= bh) || list[list.length - 1]; return { ...s, k: DPI / s.ft }; };
// a part set's drawn height in feet (after the break)
const partsH = (P, o = {}) => { const z0 = o.z0 ?? P.zmin, z1 = o.z1 ?? P.zmax, brk = o.z0 != null ? null : P.brk; return (z1 - z0) - (brk ? brk[1] - brk[0] - .7 : 0); };
function wallDetail(kind, o, bw, bh, crop) {
  const P = wallParts(kind, o), wf = P.xmax - P.xmin, s = fitDetail(wf, partsH(P, crop || {}), bw - 270, bh - 10), dr = drawParts(P, s.k, { labelW: 260, ...(crop || {}) });
  return { ...dr, scale: s.label };
}
// head, jamb and sill of a door or window (three small sections stacked)
function hjsParts(what, com) {
  const S = [], Lb = [], r = (x0, z0, x1, z1, a) => S.push({ r: [x0, z0, x1, z1], a }), pg = (pts, a) => S.push({ p: pts, a }), ln = (pts, a) => S.push({ l: pts, a }), lab = (x, z, s2) => Lb.push({ x, z, s: s2 });
  const GL = box('#e3eaee', .7), door = what === 'door';
  // head: opening below z = 0
  const head = () => { S.length = 0; Lb.length = 0;
    r(-.427, .06, -.125, 1.3, BRK); pg([[-.43, 0], [-.1, 0], [-.1, .3], [-.13, .3], [-.13, .03], [-.43, .03]], fl(INK)); ln([[-.43, .09], [-.1, .09], [-.1, .5], [-.042, .6]], st(INK, 1.1, 'stroke-dasharray="4 2"')); r(-.042, .06, 0, 1.3, fl(INK));
    r(0, .1, .292, .85, WOOD); r(0, .85, .292, 1.3, BATT); r(.292, .1, .333, 1.3, WHITE); r(-.08, -.07, .333, .1, door ? WOOD : WHITE); r(.333, -.12, .39, .3, WOOD);
    if (door) r(.05, -1, .196, -.07, WHITE); else { r(-.05, -.15, .2, -.07, WHITE); r(.04, -1, .12, -.15, GL); }
    lab(-.28, .02, com ? 'Steel lintel, 8" bearing each end (per structural)' : 'Steel lintel L3-1/2 × 3-1/2 × 1/4, 4" bearing'); lab(-.1, .3, 'Through-wall flashing, end dams, weeps above'); lab(.15, .5, com ? 'Header / jamb framing per structural' : '(2) 2x10 header with 1/2" plywood flitch');
    lab(.1, 0, door ? (com ? 'Hollow metal frame, 16 ga.' : 'Pre-hung frame, weatherstripping') : (com ? 'Thermally broken aluminum frame' : 'Vinyl window frame, nail fin over WRB, flashing tape')); lab(.36, .15, 'Interior casing / trim');
    lab(.12, -.6, door ? (com ? 'Insulated hollow metal door, 1-3/4"' : 'Insulated fiberglass door, 1-3/4"') : 'Insulated low-E glass, U ≤ 0.40, SHGC ≤ 0.25');
    return { S: S.slice(), Lb: Lb.slice(), xmin: -.9, xmax: .7, zmin: -1.1, zmax: 1.3, brk: null }; };
  // jamb: a plan cut; z runs along the wall, the opening below z = 0
  const jamb = () => { S.length = 0; Lb.length = 0;
    r(-.427, 0, -.125, 1.3, BRK); r(-.042, 0, 0, 1.3, fl(INK)); r(0, 0, .292, .125, WOOD); r(0, .125, .292, .25, WOOD); r(0, .25, .292, 1.3, BATT); r(.292, 0, .333, 1.3, WHITE); r(-.125, 0, -.042, 1.3, WHITE);
    r(-.08, -.07, .333, 0, door ? WOOD : WHITE); r(.333, -.12, .39, .3, WOOD); S.push({ c: [-.13, -.03, .035], a: fl(INK) });
    if (door) r(.05, -1, .196, -.07, WHITE); else r(.04, -1, .12, -.07, GL);
    lab(-.27, .7, 'Brick return at jamb'); lab(-.13, -.03, 'Sealant and backer rod'); lab(.15, .06, com ? 'Jamb studs / grouted frame anchors' : 'Jack and king studs'); lab(.12, -.03, door ? 'Frame jamb, weatherstripping' : 'Window jamb, flashing tape over the fin'); lab(.36, .2, 'Casing / gyp. bd. return');
    return { S: S.slice(), Lb: Lb.slice(), xmin: -.9, xmax: .7, zmin: -1.1, zmax: 1.3, brk: null }; };
  // sill: the opening above z = 0
  const sill = () => { S.length = 0; Lb.length = 0;
    if (door) { pg([[-.5, -.9], [-.5, -.125], [-.042, -.125], [-.042, 0], [1.2, 0], [1.2, -.9]], CONC); r(-1.3, -.9, -.6, -.15, CONC); pg([[-.2, 0], [.3, 0], [.3, .04], [.05, .06], [-.2, .02]], box('#9aa0a2', .7)); ln([[-.25, -.01], [.35, -.01], [.35, .08]], st(INK, 1, 'stroke-dasharray="4 2"')); r(.05, .08, .196, 1, WHITE); r(.05, .04, .196, .08, fl(INK));
      lab(.05, .03, com ? 'Threshold ≤ 1/2" high, beveled (TAS 404.2.5)' : 'Aluminum threshold, beveled'); lab(.3, 0, 'Sill pan flashing sealed to the slab'); lab(.12, .06, 'Door sweep'); lab(.6, -.4, 'Slab and grade beam, recessed 1-1/2" at the door'); lab(-.95, -.4, 'Walk / stoop, 1/4":12 max. slope away'); }
    else { r(0, -1, .292, -.25, BATT); r(0, -.25, .292, -.0, WOOD); r(-.427, -1, -.125, -.5, BRK); pg([[-.7, -.5], [-.125, -.5], [-.125, -.1], [-.7, -.3]], BRK); r(-.042, -1, 0, -.02, fl(INK)); r(-.05, 0, .2, .08, WHITE); r(.04, .08, .12, 1, GL); r(.2, -.05, .45, .03, WOOD); r(.292, -1, .333, -.05, WHITE);
      ln([[-.15, -.03], [.25, -.03], [.25, .05]], st(INK, 1, 'stroke-dasharray="4 2"'));
      lab(-.45, -.35, 'Rowlock brick sill, sloped 15° min.'); lab(.1, -.03, 'Sill pan flashing, end dams'); lab(.3, 0, 'Window stool / sill trim'); lab(.15, -.15, 'Double 2x sill plate'); lab(.08, .5, 'Glazing'); }
    return { S: S.slice(), Lb: Lb.slice(), xmin: -1.4, xmax: 1.2, zmin: -1, zmax: 1.1, brk: null }; };
  return [['Head', head()], ['Jamb (plan)', jamb()], ['Sill', sill()]];
}

// two views, each at the largest scale that lets both fit, stacked or side by side (the smaller of the two scales first)
function bestPair(A, B, bw, bh, gap = 30) {
  const size = (v, s) => ({ w: v.wf * DPI / s.ft + v.mw, h: v.hf * DPI / s.ft + v.mh }); let best = null;
  for (const sa of ARCH_SCALES) for (const sb of ARCH_SCALES) {
    const a = size(A, sa), b = size(B, sb), sc = [Math.min(sa.ft, sb.ft) === sa.ft ? DPI / sb.ft : DPI / sa.ft, DPI / sa.ft + DPI / sb.ft];
    for (const lay of ['stack', 'side']) {
      if (!(lay === 'stack' ? a.w <= bw && b.w <= bw && a.h + b.h + gap <= bh : a.w + b.w + gap <= bw && Math.max(a.h, b.h) <= bh)) continue;
      if (!best || sc[0] > best.sc[0] || (sc[0] === best.sc[0] && sc[1] > best.sc[1])) best = { lay, sa, sb, sc };
    }
  }
  const last = ARCH_SCALES[ARCH_SCALES.length - 1]; return best || { lay: 'stack', sa: last, sb: last };
}
function aSection(ctx, sheet) {
  const { t, d } = look(ctx, sheet); if (!d) return noDesign(sheet, t);
  const g = geo(t, d), mk = axis => ({ axis, wf: (axis === 'y' ? d.D : d.W) + 2 * (axis === 'x' && d.attached ? 0 : g.oh) + 6, hf: g.top + 6.5, mw: SM.mL + SM.mR, mh: SM.mT + SM.mB + TITLE });
  const C = mk('y'), Lg = mk('x'), bw = toPx(MAIN.w), bh = toPx(MAIN.h), bp = bestPair(C, Lg, bw, bh), ka = DPI / bp.sa.ft, kb = DPI / bp.sb.ft;
  const da = sectionView(t, d, g, 'y', ka), db = sectionView(t, d, g, 'x', kb), ha = da.h + TITLE, hb = db.h + TITLE;
  const pa = bp.lay === 'stack' ? { x: (bw - da.w) / 2, y: (bh - ha - hb) / 3 } : { x: (bw - da.w - db.w) / 3, y: (bh - ha) / 2 }, pb = bp.lay === 'stack' ? { x: (bw - db.w) / 2, y: pa.y * 2 + ha } : { x: pa.x * 2 + da.w, y: (bh - hb) / 2 };
  const html = placed(pa, da, 1, 'Cross section (front to back)', bp.sa.label) + placed(pb, db, 2, 'Longitudinal section (left to right)', bp.sb.label);
  sheet.scale = 'As noted';
  const kind = wallKind(t, d), sw = toPx(SIDE_W), wd = wallDetail(kind, { H: Math.min(g.plate, g.fh), flat: g.type === 'flat', p: g.p, oh: g.oh, roofing: d.exterior?.roofing, ceiling: !['warehouse'].includes(d.rooms[0]?.type) }, sw, toPx(AREA.h) * .5);
  const KN = sectionNotes(t, d, g);
  return html + side(svg(wd.w, wd.h, wd.body) + '<div style="margin:4pt 0 10pt">' + viewTitle(3, wallTitle[kind] + ' (typical, top floor)', wd.scale) + '</div>' +
    table('Section keynotes', ['No.', 'Item', 'Description'], KN.map((x, i) => [String(i + 1), x[0], x[1]])) +
    notes('Notes', ['Sections are cut through the middle of the building, nudged off wall lines; see the floor plans for where rooms fall.', 'Structural members are schematic: sizes, spacing and connections by the structural engineer.',
      'Energy: IECC climate zone 2A prescriptive values shown; confirm the edition the jurisdiction has adopted.', isRes(t) ? 'Attic ventilation 1/150 of the attic floor (1/300 with balanced high/low vents), IRC R806.' : 'Roof slope 1/4":12 min. to drains (IBC 1502 / 1507.12); secondary overflow drainage required.']));
}

function aDetails(ctx, sheet) {
  sheet.scale = 'As noted';
  const kinds = [], add = k => { if (!kinds.includes(k)) kinds.push(k); }; let flatAny = false, resAny = false, comAny = false;
  for (const t of (ctx.types || []).filter(t => t.supported !== false)) {
    const d = ctx.designs?.[t.id] || { exterior: {}, roof: { type: isRes(t) ? 'gable' : 'flat' }, floors: t.floors, floorH: t.floorH, W: t.W, D: t.D, rooms: [] }, k = wallKind(t, d);
    add(k); if (isRes(t)) { resAny = true; if (t.floors > 1 && k === 'wood-brick') add('wood-siding'); } else comAny = true; if (geo(t, d).type === 'flat') flatAny = true;
  }
  if (!kinds.length) { add('wood-brick'); resAny = true; }
  const typical = k => k.startsWith('wood') ? { H: 9, flat: false, p: 6, oh: 1.5 } : { H: 18, flat: true, ceiling: k !== 'tilt' };
  // two rows: the wall sections (and the parapet when there's room) on top, the smaller details below
  const row1 = kinds.slice(0, 4).map(k => ({ kind: 'wall', k })), row2 = [], par = flatAny ? { kind: 'parapet', k: kinds.find(k => !k.startsWith('wood')) || 'stud' } : null;
  if (par) (row1.length < 3 ? row1 : row2).push(par);
  row2.push({ kind: 'slab', k: resAny ? (kinds.find(k => k.startsWith('wood')) || 'wood-brick') : kinds[0] }, { kind: 'door' }, { kind: 'window' });
  const rh = [toPx(MAIN.h) * .52, toPx(MAIN.h) * .48], boxes = [...row1.map((b, i) => ({ ...b, row: 0, i, n: row1.length })), ...row2.map((b, i) => ({ ...b, row: 1, i, n: row2.length }))];
  let html = '';
  boxes.forEach((b, i) => {
    const bw = toPx(MAIN.w) / b.n, bh = rh[b.row] - TITLE - 10, x = MAIN.x + toPt(b.i * bw), y = MAIN.y + (b.row ? toPt(rh[0]) : 0);
    let body = '', w = 0, h = 0, title = '', scale = '';
    if (b.kind === 'wall' || b.kind === 'parapet' || b.kind === 'slab') {
      const o = typical(b.k), P = wallParts(b.k, o), crop = b.kind === 'parapet' ? { z0: o.H - 3.6, z1: P.zmax } : b.kind === 'slab' ? { z0: -3.6, z1: 2.4 } : null;
      const s = fitDetail(P.xmax - P.xmin, partsH(P, crop || {}), bw - 290, bh - 10, b.kind === 'wall' ? DSCALES.slice(2) : DSCALES), dr = drawParts(P, s.k, { labelW: 270, ...(crop || {}) });
      body = svg(dr.w, dr.h, dr.body); w = dr.w; h = dr.h; scale = s.label; title = b.kind === 'wall' ? wallTitle[b.k] : b.kind === 'parapet' ? 'Parapet and roof edge' : 'Slab edge at exterior wall';
    } else {
      const parts = hjsParts(b.kind, comAny && !resAny), each = (bh - 30) / 3, k = DPI / (fitDetail(2.6, 2.5, bw - 280, each - 24).ft);
      parts.forEach(([nm, P]) => { const dr = drawParts(P, k, { labelW: 260, size: 9.5 }); body += '<div style="font:700 8pt Arial;text-transform:uppercase;margin:2pt 0">' + esc(nm) + '</div>' + svg(dr.w, dr.h, dr.body); w = Math.max(w, dr.w); h += dr.h + 16; });
      scale = DSCALES.find(s2 => Math.abs(DPI / s2.ft - k) < .01)?.label || '1-1/2" = 1\'-0"'; title = b.kind === 'door' ? 'Exterior door head, jamb and sill' : 'Window head, jamb and sill';
    }
    html += at(x + 6, y, toPt(bw) - 12, toPt(bh), body) + at(x + 6, y + toPt(bh) + 4, toPt(bw) - 12, 40, viewTitle(i + 1, title, scale));
  });
  const def = ['Details are typical for the construction types in this set; the architect and structural engineer of record complete them in design development.', 'Flash every opening: sill pan first, jamb flashing over the fin, head flashing last, lapped shingle fashion over the WRB.',
    'Brick veneer: ties at 16" o.c. each way (max. 2.67 sf per tie), weep holes at 33" o.c. over through-wall flashing at the base and every lintel (IRC R703.8 / TMS 402).',
    'Slab and foundation per the geotechnical report; vapor retarder lapped 6" and taped; slab 6" min. above finish grade.', 'Air barrier continuous across walls, roof and openings; seal all penetrations (IECC R402.4 / C402.5).',
    'Fenestration U ≤ 0.40, SHGC ≤ 0.25 (IECC climate zone 2A).', flatAny ? 'Low-slope roofs: 1/4":12 min. slope, secondary (overflow) drainage, membrane turned up 8" min. at parapets.' : ''];
  const nn = discNotes(ctx, 'arch');
  return html + side(notes('Detail notes', def) + (nn.length ? notes('Architectural notes', nn) : '') + '<div class="blk"><div class="bh">Material hatches</div>' +
    legendRow(rect(4, 3, 36, 12, BRK), 'Brick / masonry veneer') + legendRow(rect(4, 3, 36, 12, CONC), 'Concrete (cut)') + legendRow(rect(4, 3, 36, 12, WOOD), 'Wood framing (cut)') + legendRow(rect(4, 3, 36, 12, BATT), 'Batt insulation') +
    legendRow(rect(4, 3, 36, 12, box('url(#ar-rigid)', .6)), 'Rigid insulation') + legendRow(rect(4, 3, 36, 12, fl('url(#earth)')), 'Earth / fill') + '</div>');
}

// ---------- schedules ----------
const DT = { swing: 'Single swing', double: 'Pair', sliding: 'Sliding', pocket: 'Pocket', overhead: 'Overhead sectional', storefront: 'Storefront entrance', opening: 'Cased opening' };
function doorRow(t, d, dr, byId) {
  const a = byId.get(dr.a), b = dr.b === 'outside' ? null : byId.get(dr.b), res = isRes(t), types = [a?.type, b?.type];
  const loc = (a?.name || dr.a) + ' → ' + (b ? b.name : 'Exterior (' + (dr.side || '') + ')'), garageHouse = res && !dr.exterior && types.includes('garage') && types.some(x => x && x !== 'garage');
  const wet = types.some(x => ['bath', 'half_bath', 'restroom'].includes(x)), stair = !res && !dr.exterior && types.includes('stair') && (d.floors || 1) > 1, hgt = dr.kind === 'storefront' ? 7 : doorH(t, dr);
  const mat = dr.kind === 'opening' ? '—' : dr.kind === 'overhead' ? 'Insulated steel sectional' : dr.kind === 'storefront' ? 'Aluminum / 1" insulated tempered glass' : dr.kind === 'sliding' ? (dr.exterior ? 'Vinyl / aluminum, tempered low-E glass' : 'Hollow core slider') : res ? (dr.exterior || garageHouse ? (garageHouse ? 'Solid core wood / steel' : 'Fiberglass, insulated') : 'Hollow core, molded panel') : dr.exterior ? 'Insulated hollow metal in HM frame' : 'Solid core wood in HM frame';
  const hw = dr.kind === 'opening' ? '—' : dr.kind === 'overhead' ? (res ? 'Opener with reversing sensors' : 'Motor operator, weather seals') : res ? (dr.exterior ? 'Entry lockset + deadbolt, threshold, weatherstripping' : garageHouse ? 'Entry lockset, deadbolt, self-closing hinges' : wet || types.some(x => /bedroom/.test(x || '')) ? 'Privacy lever' : 'Passage lever')
    : dr.exterior ? (/^A/.test(t.occupancy || '') ? 'Panic hardware (IBC 1010.2.9), closer, threshold' : 'Exit device / lever lockset, closer, threshold') : wet ? 'Privacy lock with indicator, closer, kick plate' : stair ? 'Closer, latch, positive latching' : 'Lever lockset (TAS 404)';
  const rate = garageHouse ? '20-min / solid core, self-closing, IRC R302.5.1' : stair ? '60-min, closer (IBC 716, 1023)' : '—';
  return [dr.id, loc, ftIn(dr.width) + ' × ' + ftIn(hgt), DT[dr.kind] || dr.kind, mat, hw, rate];
}
function windowRow(t, d, w, byId) {
  const r = byId.get(w.room), res = isRes(t), bed = /bedroom/.test(r?.type || ''), wet = ['bath', 'half_bath', 'restroom'].includes(r?.type);
  const type = res ? (w.width >= 5 ? 'Twin single-hung' : 'Single-hung') : (w.height >= 6 ? 'Storefront, fixed' : 'Fixed, aluminum');
  const note = [bed ? 'Egress: 5.7 sf net clear, 24" h × 20" w min., sill ≤ 44" (IRC R310)' : '', wet ? 'Obscure; tempered where the bottom is < 60" above a tub or shower drain' : '', fin(w.sill) < 1.5 && w.width * w.height > 9 ? 'Tempered (IRC R308.4.3 / IBC 2406.4.3)' : ''].filter(Boolean).join('; ');
  return [w.id, (r?.name || w.room) + (d.floors > 1 ? ' (fl. ' + w.floor + ')' : ''), ftIn(w.width) + ' × ' + ftIn(w.height), type, ftIn(w.sill), ftIn(fin(w.sill) + fin(w.height)), 'U ≤ 0.40 / SHGC ≤ 0.25', note || '—'];
}
const FIN = {
  res: { bedroom: ['Carpet on pad', 'Painted MDF 5-1/4"', 'Painted gyp. bd.', 'Painted gyp. bd.'], bath: ['Porcelain tile', 'Tile / painted MDF', 'MR gyp. bd.; tile at tub / shower on cement board', 'MR gyp. bd., semi-gloss'],
    kitchen: ['Porcelain tile / LVP', 'Painted MDF', 'Painted gyp. bd.; tile backsplash', 'Painted gyp. bd.'], garage: ['Sealed concrete', '—', '1/2" gyp. bd. taped (5/8" Type X under rooms)', '5/8" Type X gyp. bd.'],
    porch: ['Broom-finish concrete', '—', 'Exterior finish', 'Vented soffit'], closet: ['Carpet / LVP', 'Painted MDF', 'Painted gyp. bd.', 'Painted gyp. bd.'], mech: ['Sealed concrete / LVP', 'Painted MDF', 'Painted gyp. bd.', 'Painted gyp. bd.'],
    stair: ['Carpet / wood treads', 'Painted skirt', 'Painted gyp. bd.', 'Painted gyp. bd.'], other: ['LVP (luxury vinyl plank)', 'Painted MDF 5-1/4"', 'Painted gyp. bd.', 'Painted gyp. bd.'] },
  com: { tenant: ['Sealed concrete (by tenant)', '—', 'Gyp. bd. taped, ready for tenant finish', 'Open to structure (by tenant)'], sales: ['Polished concrete', 'Rubber 4"', 'Painted gyp. bd.', 'ACT 2x2 / open to structure'],
    dining_room: ['LVT / porcelain tile', 'Tile', 'Painted gyp. bd., accent finishes', 'ACT / gyp. bd. soffits'], commercial_kitchen: ['Quarry tile, sealed', 'Quarry tile cove', 'FRP on MR gyp. bd.', 'Washable vinyl-faced ACT'],
    walk_in_cooler: ['Insulated floor / quarry tile', 'Integral', 'Prefinished insulated panels', 'Prefinished panels'], restroom: ['Porcelain tile', 'Tile cove', 'Tile to 4\'-0", epoxy paint above (MR gyp. bd.)', 'MR gyp. bd., painted'],
    janitor: ['Sealed concrete', 'Rubber 4"', 'FRP to 4\'-0" on MR gyp. bd.', 'MR gyp. bd.'], exam: ['Sheet vinyl, heat-welded', 'Integral cove', 'Washable painted gyp. bd.', 'Washable ACT'],
    warehouse: ['Sealed concrete with hardener', '—', 'Painted panels (interior face)', 'Open to structure'], sanctuary: ['Carpet / polished concrete', 'Rubber 4"', 'Painted gyp. bd. with acoustic panels', 'Open to structure / acoustic deck'],
    lobby: ['Porcelain tile', 'Tile', 'Painted gyp. bd., accent wall', 'Gyp. bd. / ACT'], mech: ['Sealed concrete', 'Rubber 4"', 'Painted gyp. bd.', 'Open to structure'], stair: ['Rubber treads on steel pans', 'Rubber', 'Painted gyp. bd. (rated shaft)', 'Painted gyp. bd.'],
    other: ['Carpet tile / LVT', 'Rubber 4"', 'Painted gyp. bd.', 'ACT 2x4 lay-in'] } };
function finishRow(t, g, r) {
  const res = isRes(t), F2 = res ? FIN.res : FIN.com, ty = r.type;
  const key = res ? (/bedroom|office|flex/.test(ty) && ty !== 'office' ? 'bedroom' : ['bath', 'half_bath'].includes(ty) ? 'bath' : ['kitchen', 'pantry', 'laundry'].includes(ty) ? 'kitchen' : ['closet', 'walk_in_closet'].includes(ty) ? 'closet' : ['mechanical', 'electrical', 'storage'].includes(ty) ? 'mech' : F2[ty] ? ty : 'other')
    : (F2[ty] ? ty : ['mechanical', 'electrical', 'storage'].includes(ty) ? 'mech' : ['reception', 'corridor'].includes(ty) ? 'lobby' : 'other');
  const ch = ceilOf(t, g, r);
  return [r.name, String(r.floor), f0(r.area), ...F2[key], ch ? ftIn(ch) : '—'];
}
function aSched(ctx, sheet) {
  const { t, d } = look(ctx, sheet); if (!d) return noDesign(sheet, t);
  sheet.scale = 'N.T.S.';
  const g = geo(t, d), byId = new Map(d.rooms.map(r => [r.id, r])), doors = d.doors || [], wins = d.windows || [], rooms = d.rooms.slice().sort((a, b) => a.floor - b.floor || a.y - b.y || a.x - b.x);
  const sch = (title, attr, head, rows, right = []) => '<div class="bh">' + esc(title) + '</div><div data-sched="' + attr + '">' + table('', head, rows, right) + '</div>';
  const res = isRes(t), def = ['Door sizes are nominal leaf sizes; frames, hardware sets and finishes are confirmed in design development.', res ? 'Interior doors 6\'-8" (8\'-0" where ceilings are 10\'-0" or higher, by owner choice).' : 'Doors on accessible routes: 32" min. clear, 18" pull-side latch clearance, 5 lbf max. opening force (TAS 404).',
    'Windows: U ≤ 0.40 and SHGC ≤ 0.25 (IECC climate zone 2A); NFRC labels required.', res ? 'Every bedroom window meets emergency escape (IRC R310): 5.7 sf net clear, 24" high, 20" wide, sill ≤ 44" above the floor.' : 'Storefront glazing within 24" of doors and below 60" is tempered (IBC 2406.4).',
    'Finishes are a schematic basis for pricing; owner selections replace them.', 'Ceiling heights are above the finished floor.'];
  const A1 = sch('Door schedule (' + doors.length + ')', 'doors', ['Mark', 'From → to', 'Size W × H', 'Type', 'Material', 'Hardware', 'Fire rating'], doors.map(dr => doorRow(t, d, dr, byId))) +
    sch('Window schedule (' + wins.length + ')', 'windows', ['Mark', 'Room', 'Size W × H', 'Type', 'Sill', 'Head', 'Energy', 'Notes'], wins.map(w => windowRow(t, d, w, byId)));
  const A2 = sch('Room finish schedule (' + rooms.length + ')', 'finishes', ['Room', 'Fl.', 'Area', 'Floor', 'Base', 'Walls', 'Ceiling', 'Clg. ht.'], rooms.map(r => finishRow(t, g, r)), [2]) + notes('Schedule notes', def);
  // about 13 pt a row at this size: two side-by-side columns when both halves fit, else three flowing columns
  const css = '<style>.ar-s table{font-size:7.4pt}.ar-s td,.ar-s th{padding:1.4pt 3.5pt}.ar-s .bh{margin-top:8pt}</style>', two = (doors.length + wins.length) * 13 + 90 <= AREA.h && rooms.length * 13 + 260 <= AREA.h;
  const body = two ? '<div class="ar-s" style="display:flex;gap:26pt;height:' + AREA.h + 'pt"><div style="flex:1.1;min-width:0">' + A1 + '</div><div style="flex:1;min-width:0">' + A2 + '</div></div>'
    : '<div class="ar-s" style="column-count:3;column-gap:22pt;column-fill:auto;height:' + AREA.h + 'pt">' + A1 + A2 + '</div>';
  return at(AREA.x, AREA.y, AREA.w, AREA.h, css + body);
}

// ---------- life safety ----------
const TRAVEL = { A: [200, 250], M: [200, 250], 'S-1': [200, 250], B: [200, 300], E: [200, 250], 'S-2': [300, 400] }; // IBC Table 1017.2 [not sprinklered, sprinklered]
const travelLimit = t => { const o = t.occupancy || 'B', key = /^A/.test(o) ? 'A' : TRAVEL[o] ? o : 'B'; return TRAVEL[key][t.sprinklered ? 1 : 0]; };
const exitsReq = n => n > 1000 ? 4 : n > 500 ? 3 : n > 49 ? 2 : 1;
function aLS(ctx, sheet) {
  const { t, d } = look(ctx, sheet); if (!d) return noDesign(sheet, t);
  const g = geo(t, d), OL = occupantLoad(d), byRoom = new Map(OL.rows.map(x => [x.room.id, x])), lim = travelLimit(t);
  const exits = (d.doors || []).filter(x => x.floor === 1 && x.exterior && x.kind !== 'overhead'), mid = x => [(x.x1 + x.x2) / 2, (x.y1 + x.y2) / 2];
  // farthest points: room corners (1 ft in) by orthogonal distance to the nearest exit
  const near = (px, py) => { let best = null; for (const e of exits) { const [ex, ey] = mid(e), dd = Math.abs(px - ex) + Math.abs(py - ey); if (!best || dd < best.d) best = { d: dd, e }; } return best; };
  const paths = [], f1 = roomsOn(d, 1);
  if (exits.length) {
    const far = r => { let b = null; for (const [px, py] of [[r.x + 1, r.y + 1], [r.x + r.w - 1, r.y + 1], [r.x + 1, r.y + r.d - 1], [r.x + r.w - 1, r.y + r.d - 1]]) { const n2 = near(px, py); if (n2 && (!b || n2.d > b.d)) b = { ...n2, p: [px, py], r }; } return b; };
    const all = f1.map(far).filter(Boolean).sort((a, b) => b.d - a.d), big = f1.filter(r => r.area >= 400).sort((a, b) => b.area - a.area).slice(0, 4).map(far).filter(Boolean);
    for (const x of [all[0], ...big]) if (x && !paths.some(q => q.r === x.r) && paths.length < 5) paths.push(x);
  }
  const maxT = paths.length ? Math.max(...paths.map(x => x.d)) : 0;
  const mw = PM.mL + PM.mR, mh = PM.mT + PM.mB + TITLE, s = fitRows([[{ wf: d.W, hf: d.D, mw, mh }]], toPx(MAIN.w), toPx(MAIN.h)), k = s.k;
  sheet.scale = s.label;
  const fz = clamp(k * .45, 8.5, 13), extra = (X, Y) => {
    let o = '';
    // egress paths, exits, extinguishers
    for (const x of paths) { const [ex, ey] = mid(x.e), corner = x.e.orient === 'h' ? [ex, x.p[1]] : [x.p[0], ey], pts = [x.p, corner, [ex, ey]].map(([a, b]) => [X(a), Y(b)]);
      o += pline(pts, st(RED, 1.6, 'stroke-dasharray="8 4" marker-end="url(#arr)"')) + circle(pts[0][0], pts[0][1], 3.5, fl(RED)) + label(pts[1][0], pts[1][1] - 10, ftIn(x.d) + (x.d <= lim ? ' ≤ ' : ' > ') + lim + "'", fz, 'font-weight="700" fill="' + RED + '"'); }
    exits.forEach((e, i) => { const [ex, ey] = mid(e), inward = e.side === 'front' ? [0, 1] : e.side === 'back' ? [0, -1] : e.side === 'left' ? [1, 0] : [-1, 0] /* ft, into the building */, out = [-inward[0], -inward[1]];
      const cap = Math.floor(e.width * 12 / .2); o += sym('exitsign', X(ex) + inward[0] * 24, Y(ey) - inward[1] * 24, fz);
      const lx = X(ex) + out[0] * (fz * 3.2), ly = Y(ey) - out[1] * (fz * 3.2) - (out[1] < 0 ? 0 : fz * .6); o += label(lx, ly, 'EXIT ' + (i + 1), fz, 'font-weight="700" fill="' + RED + '"') + label(lx, ly + fz * 1.2, ftIn(e.width) + ' · ' + cap + ' OCC', fz * .85); });
    const nx = Math.max(1, Math.ceil(d.W / 75)), ny = Math.max(1, Math.ceil(d.D / 75));
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const px = (i + .5) * d.W / nx, py = (j + .5) * d.D / ny, r = f1.find(q => px >= q.x && px <= q.x + q.w && py >= q.y && py <= q.y + q.d);
      let [qx, qy] = [px, py]; if (r) { const dl = [[px - r.x, r.x + .8, py], [r.x + r.w - px, r.x + r.w - .8, py], [py - r.y, px, r.y + .8], [r.y + r.d - py, px, r.y + r.d - .8]].sort((a, b) => a[0] - b[0])[0]; [qx, qy] = [dl[1], dl[2]]; }
      o += sym('extinguisher', X(qx), Y(qy), fz); }
    for (const r of f1.filter(r => r.type === 'commercial_kitchen')) o += sym('extinguisher', X(r.x + 1.5), Y(r.y + 1.5), fz) + label(X(r.x + 1.5) + fz * 1.6, Y(r.y + 1.5), 'K', fz, 'font-weight="700"');
    return o;
  };
  const lab = r => { const x = byRoom.get(r.id); return [r.name, x && x.factor ? f0(r.area) + ' SF ÷ ' + x.factor + ' = ' + x.load + ' OCC' : 'Accessory — 0 OCC']; };
  const dr = planView(t, d, 1, k, { fixtures: false, tags: false, dims: 'overall', label: lab, extra }), p = placeRows([[{ wf: d.W, hf: d.D, mw, mh }]], k, { x: 0, y: 0, w: toPx(MAIN.w), h: toPx(MAIN.h) })[0];
  const perFloor = [...Array(g.F)].map((_, i) => OL.rows.filter(x => x.room.floor === i + 1).reduce((a, x) => a + x.load, 0)), capT = exits.reduce((a, e) => a + Math.floor(e.width * 12 / .2), 0), area = d.W * d.D * g.F;
  const summary = [['Occupancy', t.occupancy || '—'], ['Construction type', t.construction || '—'], ['Sprinklered', t.sprinklered ? 'Yes (NFPA 13)' : 'No'], ['Building area', f0(area) + ' sf (' + g.F + (g.F > 1 ? ' stories)' : ' story)')],
    ...perFloor.map((v, i) => ['Occupant load, floor ' + (i + 1), String(v)]), ['Total occupant load', String(OL.total)], ['Exits required (floor 1)', String(exitsReq(perFloor[0] || 0)) + ' (IBC 1006.2–1006.3)'], ['Exits provided (floor 1)', String(exits.length)],
    ['Exit width required', f0(Math.ceil((perFloor[0] || 0) * .2)) + '" (0.2"/occ., IBC 1005.3.2)'], ['Exit capacity provided', capT + ' occupants'], ['Max. travel distance', exits.length ? ftIn(maxT) + ' (limit ' + lim + "', IBC 1017.2)" : 'No exit doors in the design'],
    ['Fire extinguishers', '2-A:10-B:C within 75 ft travel (IFC 906)' + (f1.some(r => r.type === 'commercial_kitchen') ? '; Class K at cooking' : '')]];
  const loads = OL.rows.slice().sort((a, b) => a.room.floor - b.room.floor || b.load - a.load), max = 34;
  const sideHtml = '<div class="bh">Code summary</div><div data-occ="' + OL.total + '">' + table('', null, summary, [1]) + '</div>' +
    '<div class="blk">' + table('Occupant load (IBC Table 1004.5)', ['Room', 'Fl.', 'Area', 'Factor', 'Load'], loads.slice(0, max).map(x => [x.room.name, String(x.room.floor), f0(x.room.area), x.factor ? String(x.factor) : '—', String(x.load)]).concat([['Total', '', '', '', String(OL.total)]]), [1, 2, 3, 4]) + (loads.length > max ? '<p class="muted sm">+ ' + (loads.length - max) + ' more rooms in the total.</p>' : '') + '</div>' +
    '<div class="blk"><div class="bh">Legend</div>' + legendSym('exitsign') + legendSym('extinguisher') + legendRow(line(4, 9, 40, 9, st(RED, 1.6, 'stroke-dasharray="8 4" marker-end="url(#arr)"')), 'Egress path, farthest point to nearest exit (orthogonal)') + '</div>' +
    notes('Notes', [...discNotes(ctx, 'fire'), 'Travel distances are orthogonal approximations on the schematic plan; verify with the final layout and furniture.', g.F > 1 ? 'Upper floors exit by the stairs (see floor plans); exit stairs 44" min. width, enclosures 1-hr for three stories or fewer (IBC 1011, 1023).' : '',
      'Exit signs and emergency lighting at every exit and along the egress path (IBC 1008, 1013).', 'Doors serving 50 or more occupants swing outward; panic hardware where required (IBC 1010).'].filter(Boolean).slice(0, 10));
  return placed(p, dr, 1, 'Life safety plan — first floor', s.label) + side(sideHtml);
}

// ---------- code analysis ----------
const A506 = { 'A-2': { 'II-A': [15500, 62000, 46500], 'II-B': [9500, 38000, 28500], 'V-A': [11500, 46000, 34500], 'V-B': [6000, 24000, 18000] }, B: { 'II-A': [37500, 150000, 112500], 'II-B': [23000, 92000, 69000], 'V-A': [18000, 72000, 54000], 'V-B': [9000, 36000, 27000] },
  M: { 'II-A': [21500, 86000, 64500], 'II-B': [12500, 50000, 37500], 'V-A': [14000, 56000, 42000], 'V-B': [9000, 36000, 27000] }, 'S-1': { 'II-A': [26000, 104000, 78000], 'II-B': [17500, 70000, 52500], 'V-A': [14000, 56000, 42000], 'V-B': [9000, 36000, 27000] } };
A506['A-3'] = A506['A-2'];
const S504 = { 'A-2': { 'II-A': [3, 4], 'II-B': [2, 3], 'V-A': [2, 3], 'V-B': [1, 2] }, B: { 'II-A': [5, 6], 'II-B': [3, 4], 'V-A': [3, 4], 'V-B': [2, 3] }, M: { 'II-A': [4, 5], 'II-B': [2, 3], 'V-A': [3, 4], 'V-B': [1, 2] }, 'S-1': { 'II-A': [3, 4], 'II-B': [2, 3], 'V-A': [3, 4], 'V-B': [1, 2] } };
S504['A-3'] = S504['A-2'];
const H504 = { 'II-A': [65, 85], 'II-B': [55, 75], 'V-A': [50, 70], 'V-B': [40, 60] };
// IPC Table 2902.1 ratios: water closets [male, female] occupants per fixture, lavatories, drinking fountains
const IPC = { 'A-2': { wc: [75, 75], lav: 200, df: 500, row: 'A-2 restaurants' }, 'A-3w': { wc: [150, 75], lav: 200, df: 1000, row: 'A-3 places of worship' }, 'A-3': { wc: [125, 65], lav: 200, df: 500, row: 'A-3 assembly' },
  B: { wc: 'B', lav: 'B', df: 100, row: 'B business' }, M: { wc: [500, 500], lav: 750, df: 1000, row: 'M mercantile' }, 'S-1': { wc: [100, 100], lav: 100, df: 1000, row: 'S-1 storage' } };
function fixturesReq(t, load) {
  const o = t.occupancy || 'B', key = o === 'A-3' && t.use === 'church' ? 'A-3w' : IPC[o] ? o : 'B', R = IPC[key], half = Math.ceil(load / 2);
  const wcB = n => n <= 50 ? Math.ceil(n / 25) : 2 + Math.ceil((n - 50) / 50), lavB = n => n <= 80 ? Math.ceil(n / 40) : 2 + Math.ceil((n - 80) / 80);
  const wc = R.wc === 'B' ? [wcB(half), wcB(half)] : [Math.ceil(half / R.wc[0]), Math.ceil(half / R.wc[1])], lav = R.lav === 'B' ? lavB(half) * 2 : Math.ceil(half / R.lav) * 2;
  return { row: R.row, wc: wc.map(x => Math.max(1, x)), lav: Math.max(2, lav), df: Math.max(1, Math.ceil(load / R.df)), single: load <= 15 || (o === 'M' && load <= 100) || (o === 'B' && load <= 25) };
}
function gCode(ctx, sheet) {
  sheet.scale = 'N.T.S.';
  const types = (ctx.types || []).filter(t => t.supported !== false), com = types.filter(t => !isRes(t)), res = types.filter(isRes);
  let body = '<style>.ar-c table{font-size:7.8pt}.ar-c td,.ar-c th{padding:1.5pt 4pt}.ar-c .blk{break-inside:avoid}</style><div class="ar-c" style="column-count:3;column-gap:24pt;column-fill:auto;height:' + AREA.h + 'pt">';
  for (const t of com) {
    const d = ctx.designs?.[t.id], g = d ? geo(t, d) : { F: t.floors || 1, fh: t.floorH || 14, top: (t.floors || 1) * (t.floorH || 14) + 3 }, occ = t.occupancy || 'B', okey = A506[occ] ? occ : 'B';
    const ct = ((t.construction || '').match(/^(I{1,3}|IV|V)-[AB]/) || [])[0] || 'V-B', ctk = A506[okey][ct] ? ct : ct.startsWith('I') ? 'II-B' : 'V-B';
    const [NS, S1, SM2] = A506[okey][ctk], stories = S504[okey][ctk], hgt = H504[ctk], F = g.F, spr = !!t.sprinklered;
    const perStory = spr ? (F > 1 ? SM2 : S1) : NS, allowTot = perStory * Math.min(F, 3), floorA = t.W * t.D * (t.attached ? t.unitsPer : 1), tot = floorA * F, maxSt = stories[spr ? 1 : 0], maxH = hgt[spr ? 1 : 0];
    const load = d ? occupantLoad(d).total : Math.ceil(floorA * F / (LOAD_FACTOR[t.use === 'industrial' ? 'warehouse' : t.use === 'restaurant' ? 'dining_room' : 'tenant'] || 100));
    const fx = fixturesReq(t, load), rr = d ? d.rooms.filter(r => r.type === 'restroom').length : 0, ok = v => v ? 'OK' : 'EXCEEDS — revise';
    const rows = [['Occupancy (IBC 302)', occ + ' — ' + (t.label || t.use)], ['Construction type (IBC 602)', t.construction || ct], ['Sprinklers (IBC 903)', (spr ? 'Yes, NFPA 13' : 'No') + ' — ' + (t.sprinklerWhy || '')],
      ['Floor area per story', f0(floorA) + ' sf'], ['Allowable area per story (506.2)', f0(perStory) + ' sf (' + (spr ? (F > 1 ? 'SM' : 'S1') : 'NS') + ', typical, confirm) — ' + ok(floorA <= perStory)],
      ['Building area', f0(tot) + ' sf of ' + f0(allowTot) + ' sf allowed — ' + ok(tot <= allowTot)], ['Stories (504.4)', F + ' of ' + maxSt + ' allowed — ' + ok(F <= maxSt)], ['Height (504.3)', ftIn(g.top || F * g.fh) + ' of ' + maxH + "'-0\" allowed — " + ok((g.top || 0) <= maxH)],
      ['Occupant load (1004)', String(load) + (d ? ' (from the design)' : ' (estimated)')], ['Exits required (1006)', exitsReq(Math.ceil(load / F)) + ' per story; ' + (exitsReq(Math.ceil(load / F)) === 1 ? 'one exit allowed only where the common path ≤ 75 ft (1006.2.1)' : 'separated by 1/' + (spr ? '3' : '2') + ' of the diagonal (1007.1.1)')],
      ['Egress width', f0(Math.ceil(load * .2)) + '" doors, ' + f0(Math.ceil(load * .3)) + '" stairs (1005.3)'], ['Travel distance limit (1017.2)', travelLimit(t) + "'-0\""]];
    const frows = [['IPC 2902.1 row', fx.row], ['Water closets', 'Men ' + fx.wc[0] + ' · Women ' + fx.wc[1] + (fx.row.startsWith('B') || fx.row.startsWith('M') ? '' : ' (urinals may replace up to 67% of men’s WCs)')], ['Lavatories', String(fx.lav)], ['Drinking fountains', fx.df + ' (hi-lo pair, TAS 211)'], ['Service sink', '1'],
      ['Separate facilities', fx.single ? 'Not required at this load (IPC 2902.2): single-user rooms acceptable' : 'Required, men and women'], ['Restrooms in the design', String(rr)]];
    body += '<div class="blk">' + table(typeName(t), null, rows) + '<div style="height:4pt"></div>' + table('Plumbing fixtures — Type ' + t.id, null, frows) + '</div>';
  }
  if (com.length) body += notes('Accessibility (TAS 2012)', ['Register with TDLR and get a Registered Accessibility Specialist review and inspection where the construction cost is $50,000 or more (Texas Government Code ch. 469).', 'Accessible route from accessible parking and the public way to every accessible entrance; 60% of public entrances accessible (TAS 206).',
    'Accessible parking per TAS 208.2, one in six van accessible; see the site plans.', 'Toilet rooms: 60" turning space, water closet 16–18" to centreline, grab bars, lavatory knee clearance (TAS 603–606).', 'Doors: 32" min. clear, maneuvering clearances, hardware 34–48" AFF, no tight grasping (TAS 404).',
    'Service counters: a 36" long section 36" max. high (TAS 904); drinking fountains hi-lo (TAS 211, 602).', com.some(t => /^A/.test(t.occupancy || '')) ? 'Assembly seating: wheelchair spaces and companion seats (TAS 221); assistive listening systems (TAS 219).' : '']);
  if (res.length) {
    for (const t of res) body += '<div class="blk">' + table(typeName(t), null, [['Code', 'IRC (edition adopted by the jurisdiction; Texas counties: none unless adopted — confirm)'], ['Dwellings', t.attached ? (t.use === 'townhomes' ? 'Townhouses, ' + t.unitsPer + ' units a row (IRC R302.2)' : 'Two-family dwelling (IRC R302.3)') : 'One-family dwelling'],
      ['Construction', t.construction || 'V-B wood frame'], ['Stories / height', t.floors + (t.floors > 1 ? ' stories' : ' story') + ' (IRC max. 3 stories above grade plane)'],
      ['Fire separation', t.use === 'townhomes' ? 'Common walls 1-hr where sprinklered (P2904), 2-hr where not; continuous to the roof sheathing (IRC R302.2)' : t.attached ? '1-hr separation between units, 1/2-hr where sprinklered (IRC R302.3)' : 'Exterior walls within 5 ft of the lot line 1-hr rated (IRC Table R302.1(1))'],
      ['Sprinklers', t.sprinklerWhy || '—'], ['Egress', 'Every sleeping room: emergency escape opening (IRC R310); exit door 32" clear (R311.2)'], ['Alarms', 'Interconnected smoke alarms (R314); CO alarms with fuel-fired appliances or an attached garage (R315)'],
      ['Garage', 'Separation per IRC R302.5–R302.6; door 20-min / solid core, self-closing'], ['Energy', 'IECC CZ 2A: windows U ≤ 0.40 / SHGC ≤ 0.25; ceiling R-38 (R-49 under 2021); walls R-13'], ['Accessibility', 'Not required for one- and two-family dwellings and townhouses (FHA applies at 4+ units in a building)']]) + '</div>';
  }
  const crit = Array.isArray(ctx.disc?.arch?.criteria) ? ctx.disc.arch.criteria.filter(x => typeof x === 'string') : [];
  body += notes('Code analysis notes', [...crit.slice(0, 6), 'Tabular values from the 2021 IBC (Tables 504.3, 504.4, 506.2) without frontage increase: typical values, confirm with the code edition and amendments the authority having jurisdiction has adopted.',
    'Occupant loads from IBC Table 1004.5 on the schematic room areas; refine with the furniture layout.', 'Fixture counts from IPC Table 2902.1, occupants split 50/50; tenants with higher loads need more fixtures.', 'Fire department access and hydrants: see the fire access plan.']) + '</div>';
  return at(AREA.x, AREA.y, AREA.w, AREA.h, body);
}

export const RENDERERS = { 'a-plans': aPlans, 'a-elev': aElev, 'a-section': aSection, 'a-sched': aSched, 'a-details': aDetails, 'ls-plan': aLS, 'g-code': gCode };
