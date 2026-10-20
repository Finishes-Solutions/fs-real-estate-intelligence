// Architecture sheets for plan sets (lib/planset.mjs RENDERERS): floor and roof plans (A-1xx), exterior elevations (A-2xx),
// building sections (A-3xx), wall sections and typical details (A-501), door, window and finish schedules (A-6xx), the life
// safety plan (LS-1xx) and the code analysis (G-003). Every drawing comes from a type's placed design (lib/plandesign.mjs
// placeDesign: rooms, doors, windows, roof, exterior, systems) in the type's own feet: x from the left end as seen from the
// street, y from the front wall. Plans put the front at the bottom of the sheet. A renderer is (ctx, sheet) -> the HTML
// inside the frame (lib/sheetkit.mjs: pt to place boxes, CSS px inside SVG) and sets sheet.scale to what it drew at.
// Schematic only: sizes are rules of thumb and code values are typical, marked "confirm". No DOM, no network.
import { esc, f0, DPI, PT, AREA, MAIN, SIDE_W, side, ARCH_SCALES, viewTitle, table, notes, at, svg, line, rect, circle, poly, pline, text, dim, ftIn, sym, legendSym, n as num } from '../sheetkit.mjs';
import { RESIDENTIAL, CORRIDOR, occupantLoad, roomsOn, typeName, inPoly, polyArea, piecesOf, heightsOf, structureOf, scopeOf, typeFacts, unitLayout } from '../plandesign.mjs';
import { allowed as allowedBy } from '../buildcode.mjs';
import { hvacLayout } from './eng.mjs';

// ---------- shared ----------
const INK = '#1b1e1f', GREY = '#6b7174', RED = '#c0392b';
const toPx = p => p * DPI / PT, toPt = p => p * PT / DPI;
const fin = v => (Number.isFinite(+v) ? +v : 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isRes = t => RESIDENTIAL.includes(t?.use);
const isCor = t => CORRIDOR.includes(t?.use); // apartments and hotels: a double-loaded corridor of dwelling units
const st = (c = INK, w = 1, more = '') => 'fill="none" stroke="' + c + '" stroke-width="' + w + '"' + (more ? ' ' + more : '');
const fl = (c, more = '') => 'fill="' + c + '" stroke="none"' + (more ? ' ' + more : '');
const box = (c, w = .8) => 'fill="' + c + '" stroke="' + INK + '" stroke-width="' + w + '"';
const DASH = 'stroke-dasharray="6 3"';
// centred text (no paint-order halo: Chromium prints stroked text as outlines and a sheet of labels grew to megabytes)
const label = (x, y, s, size = 9, a = '') => text(x, y, s, size, 'fill="#1b1e1f" text-anchor="middle" dominant-baseline="central"' + (a ? ' ' + a : ''));
const ltext = (x, y, s, size = 9, a = '') => text(x, y, s, size, 'fill="#1b1e1f" dominant-baseline="central" ' + a);
const pitchTxt = p => (Number.isInteger(p) ? p : (Math.round(p * 2) / 2)) + ':12';
const FLOORS = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'];
const TITLE = 56; // px under each view for its title
const MYDEFS = '';
// ---------- hatching drawn as lines (SVG pattern fills print as huge PDFs from Chromium, so none are used) ----------
// shape: [x, y, w, h] (px) or a polygon [[x, y], ...]; kind: diag (wood, cut), diag2 (masonry), cross (rigid insulation),
// horiz (brick coursing, siding, shingles), vert (metal ribs), dots (concrete, stucco), earth (ticks), batt (zigzag)
let HID = 0;
const r1 = v => Math.round(v * 10) / 10;
function clipSeg(x1, y1, x2, y2, bx, by, bw, bh) { // Liang–Barsky
  let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
  for (const [p, q] of [[-dx, x1 - bx], [dx, bx + bw - x1], [-dy, y1 - by], [dy, by + bh - y1]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p; if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
}
function hatch(shape, kind, sp) {
  const pg = Array.isArray(shape[0]), xs = pg ? shape.map(q => q[0]) : null, ys = pg ? shape.map(q => q[1]) : null;
  const [x, y, w, h] = pg ? [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)] : shape;
  if (!(w > .8 && h > .8) || !kind) return '';
  let d = '', col = '#7d8380', sw = .5, cap = '', n = 0;
  const seg = (a, b, c, e) => { const q = clipSeg(a, b, c, e, x, y, w, h); if (q && n++ < 4000) d += 'M' + r1(q[0]) + ' ' + r1(q[1]) + 'L' + r1(q[2]) + ' ' + r1(q[3]); };
  const diag = (s, dir) => { for (let c = -h + (s / 2); c < w; c += s) dir > 0 ? seg(x + c, y + h, x + c + h, y) : seg(x + c, y, x + c + h, y + h); };
  switch (kind) {
    case 'diag': diag(sp || 7, 1); col = '#6b7174'; break;
    case 'diag2': diag(sp || 4.5, 1); col = '#1b1e1f'; sw = .55; break;
    case 'cross': { const s0 = Math.max(sp || 0, Math.min(w, h), 5); diag(s0, 1); diag(s0, -1); break; }
    case 'horiz': { const s0 = Math.max(sp || 5, 3); for (let yy = y + h - s0; yy > y + .5; yy -= s0) seg(x, yy, x + w, yy); break; }
    case 'vert': { const s0 = Math.max(sp || 8, 3); for (let xx = x + s0 / 2; xx < x + w; xx += s0) seg(xx, y, xx, y + h); break; }
    case 'dots': { const s0 = Math.max(sp || 10, 5); let row = 0; for (let yy = y + s0 / 2; yy < y + h; yy += s0 * .87, row++) for (let xx = x + (row % 2 ? s0 / 2 : s0 / 5); xx < x + w && n < 4000; xx += s0, n++) d += 'M' + r1(xx) + ' ' + r1(yy) + 'h.01'; sw = 1.3; cap = ' stroke-linecap="round"'; break; }
    case 'earth': { const s0 = Math.max(sp || 15, 6); let row = 0; for (let yy = y + 2; yy < y + h - 1; yy += s0, row++) for (let xx = x + (row % 2 ? s0 / 2 : 2); xx < x + w - 1; xx += s0) seg(xx, yy + 5, xx + 5, yy); col = '#8a6d4a'; sw = .6; break; }
    case 'batt': { const vert = h > w, L = vert ? h : w, S = vert ? w : h, hp = Math.max(3, S * .45); let prev = null; for (let t = 0, i = 0; t <= L + hp; t += hp, i++) { const a = i % 2 ? S * .88 : S * .12, q = vert ? [x + a, y + t] : [x + t, y + a]; if (prev) seg(prev[0], prev[1], q[0], q[1]); prev = q; } col = '#8a8f8c'; sw = .6; break; }
  }
  if (!d) return '';
  const el = '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + sw + '"' + cap;
  if (!pg) return el + '/>';
  const id = 'ar-h' + (++HID);
  return '<clipPath id="' + id + '"><polygon points="' + shape.map(q => r1(q[0]) + ',' + r1(q[1])).join(' ') + '"/></clipPath>' + el + ' clip-path="url(#' + id + ')"/>';
}
// a rectangle or polygon filled with a hatch: A is an attribute string, or { a: attributes, h: kind, s: spacing }
const fillA = A => typeof A === 'string' ? { a: A } : A;
const rectH = (x, y, w, h, A) => { const f = fillA(A); return rect(x, y, w, h, f.a) + (f.h ? hatch([Math.min(x, x + w), Math.min(y, y + h), Math.abs(w), Math.abs(h)], f.h, f.s) : ''); };
const polyH = (pts, A) => { const f = fillA(A); return poly(pts, f.a) + (f.h ? hatch(pts, f.h, f.s) : ''); };
const HF = (h, a = 'fill="#fff" stroke="#1b1e1f" stroke-width=".8"', sp) => ({ a, h, s: sp });
const wrap = (s, n) => { const out = []; let cur = ''; for (const w of String(s).split(/\s+/)) { if (cur && (cur + ' ' + w).length > n) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; } if (cur) out.push(cur); return out; };
const chunk = (a, c) => { const out = []; for (let i = 0; i < a.length; i += c) out.push(a.slice(i, i + c)); return out; };
// attached homes: townhouse common walls (R302.2) or two-family separation (R302.3)
const partyRef = t => t?.use === 'duplex' ? 'IRC R302.3' : 'IRC R302.2';
const sheetNo = (ctx, kind, id) => (ctx.sheets || []).find(s => s.kind === kind && (!id || s.typeId === id))?.number || '';

// the type and its design for a building sheet; d is null when the set has no usable design for it. f: the type's one set
// of decisions (lib/plandesign.mjs typeFacts, kept by lib/planset.mjs as ctx.tf): heights, structure, scope, sprinklers,
// occupant load. FP-101, the structural sheets and G-003 read the same, so the set can't contradict itself.
function look(ctx, sheet) {
  const t = (ctx.types || []).find(x => x.id === sheet.typeId) || null, d0 = t ? ctx.designs?.[t.id] : null, d = d0 && Array.isArray(d0.rooms) && d0.rooms.length && fin(d0.W) > 0 && fin(d0.D) > 0 ? d0 : null;
  return { t, d, f: d ? factsOf(ctx, t, d) : null };
}
function factsOf(ctx, t, d) {
  const f = t && ctx?.tf?.[t.id]; if (f?.height && f?.structure) return f;
  try { return typeFacts(t, d); } catch (e) { return { height: heightsOf(t, d), structure: structureOf(t, d), scope: scopeOf(t), occupants: null, sprinkler: { on: !!t.sprinklered, system: t.sprinklerSystem || 'none', why: t.sprinklerWhy || '', ref: t.sprinklerRef || '' }, construction: t.construction, issues: [] }; }
}
const noDesign = (sheet, t) => at(MAIN.x, MAIN.y + 40, 760, 0, '<div class="warnbox"><b>Design not available.</b> ' + esc(t ? typeName(t) : 'Building type ' + (sheet.typeId || '?')) +
  ' has no floor plan in this set, so this sheet can’t be drawn. Make the building designs again from the Plans tab, then make the set again.</div>');
// text for a label that has a length limit: cut at the last clause or word that fits, never mid-word
const clip = (s, n) => { s = String(s || ''); if (s.length <= n) return s; const c = s.slice(0, n), i = Math.max(c.lastIndexOf(', '), c.lastIndexOf('; ')); return (i > n * .5 ? c.slice(0, i) : c.slice(0, c.lastIndexOf(' ') > 0 ? c.lastIndexOf(' ') : n)).replace(/[,;:\s]+$/, ''); };
// the rooftop units: the mechanical sheets' own list (lib/sheets/eng.mjs hvacLayout), so A-1xx, M-1xx and the fire alarm
// duct detectors count the same units (Oct 20 review: 9 on the roof plan, 11 on the schedules)
export const rooftopUnits = (t, d) => { try { return hvacLayout(t, d).systems.filter(s => s.kind === 'rtu'); } catch (e) { return []; } };
// a shell's rooms inside the suites (sales floors, offices, fitting rooms…) are a typical tenant layout for pricing, by
// the tenant; the landlord builds the suites, demising walls, a restroom and a back room each (lib/plandesign.mjs scopeOf)
const LANDLORD = ['tenant', 'restroom', 'storage', 'stair', 'corridor', 'lobby', 'mechanical', 'electrical', 'janitor', 'elevator', 'hall', 'entry', 'trash'];
const byTenant = (f, r) => f?.scope?.kind === 'shell' && !!r && !LANDLORD.includes(r.type);

// ---------- apartments: a floor with every dwelling unit's own plan placed in it ----------
// -> { rooms, doors, wins, units: [{ r (the unit room), L (lib/plandesign.mjs unitLayout) }] }. inner: the units' rooms
// replace the unit rectangles (when the scale shows them). A unit's front door is drawn where its own plan has it and
// carries the building door's number (the door schedule's), so plan, enlarged plan and schedules agree.
function partsOf(t, d, f, inner = true) {
  const rooms = roomsOn(d, f), doors = (d.doors || []).filter(x => x.floor === f), wins = (d.windows || []).filter(x => x.floor === f);
  if (!isCor(t) || !rooms.some(r => r.unit && d.unitPlans?.[r.unit.code])) return { rooms, doors, wins, units: [] };
  const byR = new Map(rooms.map(r => [r.id, r])), entry = new Map();
  for (const x of doors) { const A = byR.get(x.a), B = byR.get(x.b), u = A?.unit ? A : B?.unit ? B : null; if (u && (A?.type === 'corridor' || B?.type === 'corridor')) entry.set(u.id, x); }
  const used = new Set(entry.values()), out = { rooms: [], doors: doors.filter(x => !used.has(x)), wins: wins.filter(w => !byR.get(w.room)?.unit), units: [] };
  const ori = q => Math.abs(q.y1 - q.y2) < 1e-6 ? 'h' : 'v';
  for (const r of rooms) {
    const L = r.unit ? unitLayout(d, r) : null; if (!L) { out.rooms.push(r); continue; }
    out.units.push({ r, L }); const e = entry.get(r.id);
    if (inner) out.rooms.push(...L.rooms.map(q => ({ ...q, area: Math.round(q.w * q.d) }))); else out.rooms.push(r);
    for (const q of L.doors) {
      const ent = q.b === 'corridor'; if (!ent && !inner) continue;
      const into = inner ? q.a : r.id;
      out.doors.push({ ...q, floor: f, orient: ori(q), exterior: false, entry: ent, unit: r.id, id: ent ? e?.id || '' : '', a: ent ? into : q.a, b: ent ? (e ? (e.a === r.id ? e.b : e.a) : 'corridor') : q.b, into: ent ? into : q.a });
    }
    for (const q of L.windows) out.wins.push({ ...q, id: '', floor: f, orient: ori(q), room: inner ? q.room : r.id, unit: r.id, lroom: q.room });
  }
  return out;
}
// every window of a type on every floor (elevations, schedules): the units' windows from their own plans
const allWins = (t, d) => isCor(t) ? [...Array(Math.max(1, d.floors || 1))].flatMap((_, i) => partsOf(t, d, i + 1, false).wins) : (d.windows || []);
// window marks for a corridor type's unit plans: one mark per size and sill (W1, W2…)
function winMarks(d) {
  const m = new Map(); for (const P of Object.values(d.unitPlans || {})) for (const w of P.windows || []) { const k = w.width + 'x' + w.height + '@' + w.sill; if (!m.has(k)) m.set(k, 'W' + (m.size + 1)); }
  return { m, of: w => m.get(w.width + 'x' + w.height + '@' + w.sill) || '' };
}
// the roofing the design names, as long as it suits the roof drawn: a membrane "behind parapets" on a hip roof (or
// shingles on a flat one) would contradict the drawings, so the usual covering for the drawn roof replaces it
const roofing = (d, g) => { const r = String(d?.exterior?.roofing || '').trim(), flat = g.type === 'flat';
  return !r || (flat ? /shingle|tile|metal panel|standing seam/i.test(r) : /membrane|tpo|epdm|pvc|built-up|modified bitumen|parapet/i.test(r)) ? (flat ? 'TPO membrane' : 'Architectural asphalt shingles') : r; };
// ---------- the footprint: an orthogonal outline in the design's feet (a plain rectangle is its four corners) ----------
// consecutive duplicate and in-line corners dropped, so a wall path has one corner per real corner
function cleanRing(P) {
  let Q = P.filter((p, i) => { const q = P[(i + P.length - 1) % P.length]; return Math.abs(p[0] - q[0]) > 1e-6 || Math.abs(p[1] - q[1]) > 1e-6; });
  for (let again = true; again && Q.length > 4;) { again = false; for (let i = 0; i < Q.length; i++) { const a = Q[(i + Q.length - 1) % Q.length], b = Q[i], c = Q[(i + 1) % Q.length];
    if ((Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(b[0] - c[0]) < 1e-6) || (Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(b[1] - c[1]) < 1e-6)) { Q.splice(i, 1); again = true; break; } } }
  return Q;
}
function fpOf(d) { const P = Array.isArray(d?.footprint) && d.footprint.length >= 4 && d.footprint.every(q => Number.isFinite(+q[0]) && Number.isFinite(+q[1])) ? d.footprint.map(q => [+q[0], +q[1]]) : [[0, 0], [d.W, 0], [d.W, d.D], [0, d.D]]; return cleanRing(P); }
const shaped = d => fpOf(d).length > 4;
const footA = d => fin(d?.footArea) || polyArea(fpOf(d));
const piecesD = d => shaped(d) ? piecesOf({ W: d.W, D: d.D, fp: fpOf(d) }) : [{ x: 0, y: 0, w: d.W, d: d.D }];
const inFP = (d, x, y) => inPoly([x, y], fpOf(d));
// the ring moved inward by t ft (outward when t < 0): each corner moves along both of its edges' inward normals
function offsetRing(P, t) {
  const n = P.length, sA = P.reduce((a, p, i) => { const q = P[(i + 1) % n]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) > 0 ? 1 : -1;
  const nor = P.map((p, i) => { const q = P[(i + 1) % n], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [-(q[1] - p[1]) / L * sA, (q[0] - p[0]) / L * sA]; });
  return P.map((p, i) => { const a = nor[(i + n - 1) % n], b = nor[i], same = Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6; return [p[0] + t * (same ? b[0] : a[0] + b[0]), p[1] + t * (same ? b[1] : a[1] + b[1])]; });
}
// the outline's edges and the way each one faces: { o: 'h' | 'v', at, a, b, face: front | back | left | right }
function edgesOf(P) {
  return P.map((p, i) => { const q = P[(i + 1) % P.length], h = Math.abs(p[1] - q[1]) < 1e-6, at = h ? p[1] : p[0], a = h ? Math.min(p[0], q[0]) : Math.min(p[1], q[1]), b = h ? Math.max(p[0], q[0]) : Math.max(p[1], q[1]), m = (a + b) / 2;
    return { o: h ? 'h' : 'v', at, a, b, face: h ? (inPoly([m, at + .05], P) ? 'front' : 'back') : (inPoly([at + .05, m], P) ? 'left' : 'right') }; }).filter(e => e.b - e.a > 1e-6);
}
// which way an exterior opening on the line at `at` faces (from the outline, not the stored side)
const faceAt = (P, o, at, m) => o === 'h' ? (inPoly([m, at + .3], P) ? 'front' : 'back') : (inPoly([at + .3, m], P) ? 'left' : 'right');
const ringD = (P, X, Y) => 'M' + P.map(([x, y]) => r1(X(x)) + ' ' + r1(Y(y))).join('L') + 'Z';
// ceiling height above its floor (ft), 0 where the room is open to the structure
function ceilOf(t, g, r) {
  if (isRes(t)) return r.floor < g.F ? g.fh - 1 : Math.min(g.fh, 10);
  if (isCor(t)) return ['stair', 'elevator', 'mechanical', 'electrical'].includes(r.type) ? 0 : ['corridor', 'bath', 'laundry', 'closet', 'hall', 'trash', 'mail'].includes(r.type) ? Math.min(8, g.fh - 2) : Math.min(9, g.fh - 1);
  if (['warehouse', 'sanctuary', 'tenant', 'mechanical', 'electrical', 'stair'].includes(r.type)) return 0;
  if (['restroom', 'janitor', 'corridor', 'closet', 'storage', 'walk_in_cooler'].includes(r.type)) return Math.min(9, g.fh - 2);
  return r.floor < g.F ? clamp(g.fh - 4, 8, 12) : clamp(g.fh - 6, 9, 12);
}
// the levels elevations and sections mark on the right: from the first floor slab, which sits g.grade above the grade
// plane; the mean roof height (a pitched roof) carries the building height above grade the code sheet and FP-101 show
function levelList(g) {
  const L = [{ z: -g.grade, n: 'Grade plane' }, { z: 0, n: 'T.O. slab' }]; for (let f = 2; f <= g.F; f++) L.push({ z: (f - 1) * g.fh, n: 'Level ' + f });
  L.push({ z: g.plate, n: g.type === 'flat' ? 'T.O. roof structure' : 'Top plate' + (g.type !== 'shed' ? ' (eave)' : '') });
  if (g.type === 'flat') L.push({ z: g.parapet, n: 'T.O. parapet' }); else if (g.ridge > g.plate + .5) { L.push({ z: g.ridge, n: g.type === 'shed' ? 'High side plate' : 'Ridge' }); L.push({ z: g.buildingHeight - g.grade, n: 'Mean roof height', t: ftIn(g.buildingHeight - g.grade) + ' (' + ftIn(g.buildingHeight) + ' above grade)' }); }
  return L;
}
// the heights the code counts, as the side tables state them (IBC 202 building height, IFC D105.1 fire access height)
const heightRows = g => [['Building height above grade plane (IBC 202, to ' + (g.type === 'flat' ? 'the roof deck' : 'the mean roof height') + ')', ftIn(g.buildingHeight)],
  ['Fire access height (IFC D105.1, grade to ' + (g.fireAccessTo || 'the eave').replace(/^the /, '') + ')', ftIn(g.fireAccessHeight)], ['Top of ' + (g.type === 'flat' ? 'parapet' : 'ridge') + ' above grade', ftIn(g.top + g.grade)]];
function levelMarks(L, x0, x1, Y) {
  let s = '', last = -1e9;
  for (const l of L.slice().sort((a, b) => b.z - a.z)) {
    const y = Y(l.z), ty = Math.max(y, last + 24); last = ty;
    s += line(x0, y, x1, y, st(GREY, .6, 'stroke-dasharray="12 4 2 4"')) + circle(x1 + 6, y, 5, st(INK, 1)) + '<path d="M' + num(x1 + 6) + ' ' + num(y - 5) + 'A5 5 0 0 1 ' + num(x1 + 11) + ' ' + num(y) + 'L' + num(x1 + 6) + ' ' + num(y) + 'Z" fill="#1b1e1f"/>' +
      '<path d="M' + num(x1 + 6) + ' ' + num(y + 5) + 'A5 5 0 0 1 ' + num(x1 + 1) + ' ' + num(y) + 'L' + num(x1 + 6) + ' ' + num(y) + 'Z" fill="#1b1e1f"/>' +
      (ty !== y ? line(x1 + 11, y, x1 + 16, ty, st(GREY, .5)) : '') + ltext(x1 + 16, ty - 5, l.n.toUpperCase(), 8.5, 'font-weight="700"') + ltext(x1 + 16, ty + 6, l.t || ftIn(l.z), 8.5);
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
// only the stretches with the building on both sides: the outline's own edges (an L's inside corner too) are exterior walls
export const wallRuns = (d, f) => runsOf(d, roomsOn(d, f));
function runsOf(d, rooms) {
  const FP = fpOf(d), m = new Map(), add = (o, a, s0, s1) => { if (s1 - s0 < .3) return; const k = o + '|' + Math.round(a * 2) / 2; if (!m.has(k)) m.set(k, []); m.get(k).push([s0, s1]); };
  for (const r of rooms) { add('h', r.y, r.x, r.x + r.w); add('h', r.y + r.d, r.x, r.x + r.w); add('v', r.x, r.y, r.y + r.d); add('v', r.x + r.w, r.y, r.y + r.d); }
  return [...m].map(([k, iv]) => {
    const o = k[0], a = +k.slice(2), cuts = FP.map(q => o === 'h' ? q[0] : q[1]);
    const parts = merge(iv).flatMap(([p, q]) => { const c = [p, ...cuts.filter(v => v > p && v < q), q]; return c.slice(1).map((v, i) => [c[i], v]); })
      .filter(([p, q]) => { const mm = (p + q) / 2; return o === 'h' ? inPoly([mm, a - .3], FP) && inPoly([mm, a + .3], FP) : inPoly([a - .3, mm], FP) && inPoly([a + .3, mm], FP); });
    return { o, a, iv: merge(parts) };
  }).filter(w => w.iv.length);
}
// the runs cut wherever the rooms on either side change, each piece with its kind: 'part' (a partition), 'rated' (a
// dwelling unit's separation and corridor walls, stair and elevator shafts) or 'tenant' (a shell suite's layout, by the
// tenant) -> [{ o, a, iv, kind }]
function wallKinds(d, rooms, kindOf) {
  const find = (x, y) => rooms.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.d), out = new Map();
  for (const w of runsOf(d, rooms)) {
    const cuts = [...new Set(rooms.flatMap(r => w.o === 'h' ? [r.x, r.x + r.w] : [r.y, r.y + r.d]))].sort((p, q) => p - q);
    for (const [a, b] of w.iv) { const c = [a, ...cuts.filter(v => v > a + .05 && v < b - .05), b];
      for (let i = 0; i + 1 < c.length; i++) { const m = (c[i] + c[i + 1]) / 2, [p, q] = w.o === 'h' ? [[m, w.a - .3], [m, w.a + .3]] : [[w.a - .3, m], [w.a + .3, m]], k = kindOf(find(...p), find(...q)), key = w.o + '|' + w.a + '|' + k;
        if (!out.has(key)) out.set(key, { o: w.o, a: w.a, iv: [], kind: k }); out.get(key).iv.push([c[i], c[i + 1]]); } }
  }
  return [...out.values()].map(w => ({ ...w, iv: merge(w.iv) }));
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
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const x = (i + .5) * c, y = (j + .5) * c; free[j * nx + i] = x < d.W && y < d.D && inFP(d, x, y) && !rooms.some(r => x >= r.x - e && x <= r.x + r.w + e && y >= r.y - e && y <= r.y + r.d + e) ? 1 : 0; }
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

// one floor of a type, front at the bottom -> { body, w, h } (px). o: { fixtures, tags, dims, label(r), extra(X, Y), facts
// (the type's decisions: a shell's tenant layout drawn light), inner (apartments: draw each unit's rooms; default when the
// scale shows them), front (the words under the bottom edge) }
const unitTag = (x, y, no, code, fs) => { const w = Math.max(no.length, code.length) * fs * .62 + 8; return '<g class="utag" data-unit="' + esc(no) + '" data-code="' + esc(code) + '">' + rect(x - w / 2, y - fs * 1.15, w, fs * 2.3, 'fill="#fff" stroke="#1b1e1f" stroke-width=".9"') +
  text(x, y - fs * .5, no, fs, 'fill="#1b1e1f" text-anchor="middle" dominant-baseline="central" font-weight="700"') + text(x, y + fs * .6, code, fs * .85, 'fill="#1b1e1f" text-anchor="middle" dominant-baseline="central"') + '</g>'; };
function planView(t, d, f, k, o = {}) {
  const W = d.W, D = d.D, { mL, mR, mT, mB } = PM, X = x => mL + x * k, Y = y => mT + (D - y) * k, g = heightsOf(t, d), res = isRes(t), cor = isCor(t);
  const te = Math.max(.667 * k, 2.4), ti = Math.max(.375 * k, 1.3), tr = Math.max(.7 * k, 2.2), tp = Math.max(1.1 * k, 3.8), party = !!d.attached;
  const P = o.parts || partsOf(t, d, f, o.inner ?? k >= 4), rooms = P.rooms, doors = P.doors, wins = P.wins;
  const byId = new Map([...d.rooms, ...rooms].map(r => [r.id, r])), shell = o.facts?.scope?.kind === 'shell', tl = r => shell && byTenant(o.facts, r);
  let s = MYDEFS, tags = '';
  if (o.fixtures !== false) for (const r of rooms) { const fx = fixtures(r, doors, X, Y, k); s += fx && tl(r) ? '<g opacity=".45">' + fx + '</g>' : fx; }
  for (const r of rooms.filter(r => r.type === 'stair')) s += stairSym(r, f, g.F, X, Y, k);
  if (f > 1) s += openBelow(d, f, X, Y, k);
  // interior walls, less the door openings: partitions 4-1/2"; apartments' unit separation, corridor and shaft walls
  // heavier (rated); a shell's tenant layout light grey (by the tenant)
  const kindOf = cor ? (A, B) => (A?.unit && A.unit === B?.unit) ? 'part' : (A?.unit || B?.unit || A?.type === 'unit' || B?.type === 'unit' || ['stair', 'elevator'].includes(A?.type) || ['stair', 'elevator'].includes(B?.type)) ? 'rated' : 'part'
    : shell ? (A, B) => (tl(A) || tl(B)) && [A, B].every(q => q && (q.type === 'tenant' || tl(q))) ? 'tenant' : 'part' : null;
  const runs = kindOf ? wallKinds(d, rooms, kindOf) : runsOf(d, rooms).map(w => ({ ...w, kind: 'part' }));
  for (const w of runs) {
    const th = w.kind === 'rated' ? tr : w.kind === 'tenant' ? Math.max(ti * .6, 1) : ti, col = w.kind === 'tenant' ? '#a3a8aa' : w.kind === 'rated' ? '#2a2e30' : '#4d5457';
    const cuts = doors.filter(x => !x.exterior && !x.cut && x.orient === w.o && Math.abs(dAt(x) - w.a) < .6).map(span);
    for (const [a, b] of minus(w.iv, cuts)) s += w.o === 'h' ? rect(X(a), Y(w.a) - th / 2, (b - a) * k, th, fl(col)) : rect(X(w.a) - th / 2, Y(b), th, (b - a) * k, fl(col));
  }
  // exterior walls (8", solid): one path along the outline and its inset, so an L or a stepped front reads as drawn;
  // party walls (heavier, hatched) over the ends of an attached unit; openings are cleared below
  const FP = fpOf(d), teF = te / k, band = (sd, at, a, b) => sd === 'front' ? [X(a), Y(at + teF), (b - a) * k, te] : sd === 'back' ? [X(a), Y(at), (b - a) * k, te] : sd === 'left' ? [X(at), Y(b), te, (b - a) * k] : [X(at) - te, Y(b), te, (b - a) * k];
  s += '<path class="ar-walls" d="' + ringD(FP, X, Y) + ' ' + ringD(offsetRing(FP, teF), X, Y) + '" fill="#1b1e1f" fill-rule="evenodd"/>';
  if (party) for (const r of [[X(0), Y(D), tp, D * k], [X(W) - tp, Y(D), tp, D * k]]) s += rectH(...r, HF('diag2', 'fill="#fff" stroke="#1b1e1f" stroke-width="1.4"', 4));
  const openSide = x => faceAt(FP, x.orient, dAt(x), (span(x)[0] + span(x)[1]) / 2);
  for (const x of doors.filter(x => x.exterior || x.cut)) s += rect(...band(openSide(x), dAt(x), ...span(x)), fl('#fff'));
  if (party) for (const [x, rot] of [[X(0) - 14, -90], [X(W) + 14, 90]]) s += text(x, Y(D / 2), '1-HR RATED PARTY WALL (' + partyRef(t) + ')', 8, 'fill="#1b1e1f" text-anchor="middle" dominant-baseline="central" font-weight="700" transform="rotate(' + rot + ' ' + num(x) + ' ' + num(Y(D / 2)) + ')"');
  // windows: the opening with the glass line down the middle of the wall
  const placedTags = [], wr = 8, dr0 = clamp(k * .55, 6.5, 9.5), boxes = [], tagQ = [];
  const unitIds = new Set(P.units.map(u => u.r.id));
  for (const r of rooms) {
    if (unitIds.has(r.id)) continue; // a unit drawn as its outline: its tag says what it is
    const lines = o.label ? o.label(r) : r.type === 'stair' ? [r.name] : r.unit && cor ? [r.name, ftIn(r.w) + ' × ' + ftIn(r.d)] : [r.name, res ? ftIn(r.w) + ' × ' + ftIn(r.d) : f0(r.area) + ' SF', ...(tl(r) ? ['BY TENANT'] : r.type === 'tenant' && shell ? ['SHELL · FINISHES BY TENANT'] : [])];
    const l = roomLabel(r, X, Y, k, lines, r.unit && cor ? 9 : 13); if (l.box) boxes.push(l.box); tags += l.svg;
  }
  // apartments: every unit's number and plan type (101 · A1) at its middle, over the line between its front and back rooms
  for (const { r } of P.units) { const fs = clamp(k * .85, 6.5, 11), x = X(r.x + r.w / 2), y = Y(r.y + r.d / 2), w = Math.max(r.unit.no.length, r.unit.code.length) * fs * .62 + 8;
    tags += o.unitLabel ? o.unitLabel(r, x, y, fs) : unitTag(x, y, r.unit.no, r.unit.code, fs); boxes.push([x - w / 2, y - fs * 1.2, x + w / 2, y + fs * 1.2]); }
  const hits = (p, r) => boxes.some(b => p[0] + r + 3 > b[0] && p[0] - r - 3 < b[2] && p[1] + r + 3 > b[1] && p[1] - r - 3 < b[3]) || placedTags.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < r * 2 + 1);
  for (const w of wins) {
    const [a, b] = span(w), sd = openSide(w), horiz = sd === 'front' || sd === 'back', bx = band(sd, dAt(w), a, b);
    s += rect(...bx, 'fill="#fff" stroke="#1b1e1f" stroke-width=".8"') + (horiz ? line(bx[0], bx[1] + te / 2, bx[0] + bx[2], bx[1] + te / 2, st(INK, .7)) : line(bx[0] + te / 2, bx[1], bx[0] + te / 2, bx[1] + bx[3], st(INK, .7)));
  }
  // doors: cut openings with swings (commercial exits swing out, IBC 1010.1.2.1), slides, overhead tracks
  for (const dr of doors) {
    const ext = dr.exterior || dr.cut, P1 = [X(dr.x1), Y(dr.y1)], P2 = [X(dr.x2), Y(dr.y2)], L = Math.hypot(P2[0] - P1[0], P2[1] - P1[1]) || 1, u = [(P2[0] - P1[0]) / L, (P2[1] - P1[1]) / L];
    let nIn = [-u[1], u[0]]; const ra = byId.get(dr.into || dr.a), c = ra ? [X(ra.x + ra.w / 2), Y(ra.y + ra.d / 2)] : [X(W / 2), Y(D / 2)];
    if ((c[0] - P1[0]) * nIn[0] + (c[1] - P1[1]) * nIn[1] < 0) nIn = [-nIn[0], -nIn[1]];
    const th = ext ? te : ti, h = th / 2, sh = ext ? h : 0, add = (p, v, m) => [p[0] + v[0] * m, p[1] + v[1] * m];
    const C = s0 => [P1[0] + u[0] * s0 + nIn[0] * sh, P1[1] + u[1] * s0 + nIn[1] * sh];
    const out = !res && dr.exterior && !dr.cut && ['swing', 'double', 'storefront'].includes(dr.kind), nS = out ? [-nIn[0], -nIn[1]] : nIn;
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
    if (o.tags !== false && dr.id) { const off = h + dr0 + 3, sw = ['swing', 'double', 'storefront'].includes(dr.kind), cand = [add(C(L / 2), tagSide, off), add(C(L + dr0 + 4), tagSide, off), add(C(-dr0 - 4), tagSide, off), add(C(L / 2), [-tagSide[0], -tagSide[1]], (sw ? L * .87 : 0) + off), add(C(L + dr0 + 4), [-tagSide[0], -tagSide[1]], off)];
      tagQ.push({ cand, id: dr.id }); }
  }
  // room names with sizes (homes) or areas (commercial), then door tags clear of them
  for (const q of tagQ) { const p = q.cand.find(c => !hits(c, dr0)) || q.cand[0]; placedTags.push(p); tags += doorTag(p[0], p[1], dr0, q.id); }
  if (o.tags !== false) for (const w of wins.filter(w => w.id)) {
    const [a, b] = span(w), m = (a + b) / 2, sd = openSide(w), at2 = dAt(w), p = sd === 'front' ? [X(m), Y(at2) + wr + 4] : sd === 'back' ? [X(m), Y(at2) - wr - 4] : sd === 'left' ? [X(at2) - wr - 4, Y(m)] : [X(at2) + wr + 4, Y(m)];
    if (hits(p, wr)) continue; placedTags.push(p); tags += winTag(p[0], p[1], wr, w.id);
  }
  s += tags;
  // dimensions: room breaks and overall along the front and the left side (apartments: the units, not their rooms)
  if (o.dims !== false) {
    const brk = (vals, max) => { const v = [...new Set(vals.map(x => Math.round(clamp(x, 0, max) * 4) / 4))].sort((a, b) => a - b); return v.filter((x, i) => i === 0 || x - v[i - 1] >= .4); };
    const jx = FP.map(q => q[0]), jy = FP.map(q => q[1]), shp = FP.length > 4, dr2 = roomsOn(d, f).length ? roomsOn(d, f) : rooms;
    const fx = brk([0, W, ...jx, ...(o.dims !== 'overall' ? dr2.filter(r => r.y <= .6).flatMap(r => [r.x, r.x + r.w]) : [])], W), fy = brk([0, D, ...jy, ...(o.dims !== 'overall' ? dr2.filter(r => r.x <= .6).flatMap(r => [r.y, r.y + r.d]) : [])], D);
    if (o.dims !== 'overall' || shp) { for (let i = 1; i < fx.length; i++) if ((fx[i] - fx[i - 1]) * k >= 10 && fx.length > 2) s += dim(X(fx[i - 1]), Y(0), X(fx[i]), Y(0), (fx[i] - fx[i - 1]) * k >= 34 ? ftIn(fx[i] - fx[i - 1]) : '', 40);
      for (let i = 1; i < fy.length; i++) if ((fy[i] - fy[i - 1]) * k >= 10 && fy.length > 2) s += dim(X(0), Y(fy[i]), X(0), Y(fy[i - 1]), (fy[i] - fy[i - 1]) * k >= 34 ? ftIn(fy[i] - fy[i - 1]) : '', 40); }
    s += dim(X(0), Y(0), X(W), Y(0), ftIn(W), 64, 9) + dim(X(0), Y(D), X(0), Y(0), ftIn(D), 64, 9);
  }
  s += label(X(W / 2), Y(0) + 96, o.front || 'FRONT (STREET)', 10, 'font-weight="700" letter-spacing="1"');
  if (o.extra) s += o.extra(X, Y);
  return { body: s, w: W * k + mL + mR, h: D * k + mT + mB };
}

// ---------- roof plan ----------
// the rooftop units the mechanical plans schedule, about 8 x 5 ft each on a curb, tagged as M-1xx tags them
function rtuMarks(t, d, X, Y, k) {
  return rooftopUnits(t, d).map(u => { const w = Math.max(8 * k, 12), h = Math.max(5 * k, 8), x0 = X(u.unit.x) - w / 2, y0 = Y(u.unit.y) - h / 2;
    return '<g class="rtu" data-tag="' + esc(u.tag) + '">' + rect(x0, y0, w, h, box('#fff', 1)) + rect(x0 + 2, y0 + 2, w - 4, h - 4, st(GREY, .5)) + line(x0, y0, x0 + w, y0 + h, st(GREY, .6)) + line(x0 + w, y0, x0, y0 + h, st(GREY, .6)) + label(X(u.unit.x), y0 + h + 7, u.tag, clamp(k * .9, 6, 7.5), 'font-weight="700"') + '</g>'; }).join('');
}
// the roof plan of a shaped building: eaves (or parapet) follow the outline, ridges and hips per rectangular piece
function roofShaped(t, d, g, k) {
  const W = d.W, D = d.D, oh = g.oh, { mL, mR, mT, mB } = PM, X = x => mL + (x + oh) * k, Y = y => mT + (D + oh - y) * k, FP = fpOf(d), pt = pitchTxt(g.p), hl = st(INK, 1.4);
  const arrow = (x1, y1, x2, y2, lab) => { const vert = Math.abs(y2 - y1) > Math.abs(x2 - x1), mx = (X(x1) + X(x2)) / 2, my = (Y(y1) + Y(y2)) / 2; return line(X(x1), Y(y1), X(x2), Y(y2), st(INK, 1, 'marker-end="url(#arr)"')) + (lab ? label(mx + (vert ? 18 : 0), my + (vert ? 0 : -9), lab, 9) : ''); };
  const P = pc => [pc.x, pc.y, pc.x + pc.w, pc.y + pc.d], pieces = piecesD(d);
  let s = '';
  if (g.type !== 'flat') {
    s += '<path d="' + ringD(offsetRing(FP, -oh), X, Y) + '" fill="#f6f6f5" stroke="#1b1e1f" stroke-width="1.8"/>' + '<path d="' + ringD(FP, X, Y) + '" ' + st(GREY, .8, 'stroke-dasharray="7 4"') + '/>';
    pieces.forEach((pc, i) => {
      const [x0, y0, x1, y1] = P(pc), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, alongX = g.type === 'hip' ? pc.w >= pc.d : g.ridgeAx === 'x', big = i === 0;
      if (g.type === 'shed') { s += arrow(cx, y0 + pc.d * .15, cx, y1 - pc.d * .15, big ? pt : ''); return; }
      if (g.type === 'hip') { const r = Math.min(pc.w, pc.d) / 2; s += alongX ? line(X(x0 + r), Y(cy), X(x1 - r), Y(cy), hl) + [[x0, y0, x0 + r], [x0, y1, x0 + r], [x1, y0, x1 - r], [x1, y1, x1 - r]].map(([x, y, e]) => line(X(x), Y(y), X(e), Y(cy), hl)).join('')
        : line(X(cx), Y(y0 + r), X(cx), Y(y1 - r), hl) + [[x0, y0, y0 + r], [x1, y0, y0 + r], [x0, y1, y1 - r], [x1, y1, y1 - r]].map(([x, y, e]) => line(X(x), Y(y), X(cx), Y(e), hl)).join(''); }
      else s += alongX ? line(X(x0), Y(cy), X(x1), Y(cy), hl) : line(X(cx), Y(y0), X(cx), Y(y1), hl);
      s += alongX ? arrow(cx, cy - pc.d * .08, cx, y0 + pc.d * .12, big ? pt : '') + arrow(cx, cy + pc.d * .08, cx, y1 - pc.d * .12, big ? pt : '') : arrow(cx - pc.w * .08, cy, x0 + pc.w * .12, cy, big ? pt : '') + arrow(cx + pc.w * .08, cy, x1 - pc.w * .12, cy, big ? pt : '');
    });
    s += label(X(pieces[0].x + pieces[0].w / 2), Y(pieces[0].y + pieces[0].d * .3), clip(roofing(d, g), 48).toUpperCase(), clamp(k * .35, 7, 9));
  } else {
    // parapet along the outline; scuppers on the back-facing parapets, interior drains on deep pieces
    s += '<path d="' + ringD(FP, X, Y) + '" fill="#f6f6f5" stroke="#1b1e1f" stroke-width="1.8"/><path d="' + ringD(offsetRing(FP, .67), X, Y) + '" ' + st(INK, .8) + '/>';
    let first = true;
    for (const e of edgesOf(FP).filter(e => e.face === 'back' && e.b - e.a >= 12)) {
      const ns = Math.max(1, Math.round((e.b - e.a) / 60));
      for (let i = 0; i < ns; i++) { const x = e.a + (e.b - e.a) * (i + .5) / ns, L2 = Math.min(40, e.at * .6); s += rect(X(x - .75), Y(e.at), 1.5 * k, Math.max(.67 * k, 3), box('#fff')) + rect(X(x) - Math.max(.5 * k, 3), Y(e.at) - Math.max(1.2 * k, 7), Math.max(k, 6), Math.max(k, 6), box('#fff'));
        if (inFP(d, x, e.at - L2)) s += arrow(x, e.at - L2, x, e.at - 2.5, '1/4":12');
        if (first) { s += label(X(x), Y(e.at) - Math.max(1.2 * k, 7) - 12, 'SCUPPER + DS (TYP.)', 8); first = false; } }
    }
    for (const pc of pieces.filter(pc => pc.d > 150)) { const nx = Math.ceil(pc.w / 60), ny = Math.ceil(pc.d / 60); for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const x = X(pc.x + (i + .5) * pc.w / nx), y = Y(pc.y + (j + .5) * pc.d / ny); s += circle(x, y, Math.max(k, 4), box('#fff')) + line(x - 3, y, x + 3, y, st(INK, .7)) + line(x, y - 3, x, y + 3, st(INK, .7)); } }
    const p0 = pieces[0], stp = d.rooms.find(r => r.type === 'stair' && r.floor === g.F), hx = stp ? stp.x + stp.w / 2 : p0.x + p0.w - 6, hy = stp ? stp.y + stp.d / 2 : p0.y + p0.d - 6, hs = Math.max(3 * k, 7);
    s += rect(X(hx) - hs / 2, Y(hy) - hs / 2, hs, hs, box('#fff')) + line(X(hx) - hs / 2, Y(hy) - hs / 2, X(hx) + hs / 2, Y(hy) + hs / 2, st(INK, .6)) + line(X(hx) + hs / 2, Y(hy) - hs / 2, X(hx) - hs / 2, Y(hy) + hs / 2, st(INK, .6)) + label(X(hx), Y(hy) + hs / 2 + 8, 'ROOF HATCH', 7.5);
    s += label(X(p0.x + p0.w / 2), Y(p0.y + p0.d * .15), clip(roofing(d, g), 48).toUpperCase() + ' · TAPERED INSULATION', clamp(k * .35, 7, 9));
  }
  // overall and every jog of the outline
  const brk = vals => [...new Set(vals.map(v => Math.round(v * 4) / 4))].sort((a, b) => a - b), fx = brk([0, W, ...FP.map(q => q[0])]), fy = brk([0, D, ...FP.map(q => q[1])]);
  for (let i = 1; i < fx.length; i++) s += dim(X(fx[i - 1]), Y(-oh), X(fx[i]), Y(-oh), (fx[i] - fx[i - 1]) * k >= 34 ? ftIn(fx[i] - fx[i - 1]) : '', 40);
  for (let i = 1; i < fy.length; i++) s += dim(X(-oh), Y(fy[i]), X(-oh), Y(fy[i - 1]), (fy[i] - fy[i - 1]) * k >= 34 ? ftIn(fy[i] - fy[i - 1]) : '', 40);
  s += dim(X(0), Y(-oh), X(W), Y(-oh), ftIn(W), 64, 9) + dim(X(-oh), Y(D), X(-oh), Y(0), ftIn(D), 64, 9) + label(X(W / 2), Y(-oh) + 96, 'FRONT (STREET)', 10, 'font-weight="700" letter-spacing="1"');
  s += rtuMarks(t, d, X, Y, k);
  return { body: s, w: (W + 2 * oh) * k + mL + mR, h: (D + 2 * oh) * k + mT + mB };
}
function roofView(t, d, g, k) {
  if (shaped(d)) return roofShaped(t, d, g, k);
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
    s += label(X(W * .5), Y(D * (g.ridgeAx === 'x' && g.type === 'gable' ? .3 : .5)) + (g.ridgeAx === 'x' ? 0 : 16), clip(roofing(d, g), 48).toUpperCase(), clamp(k * .35, 7, 9));
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
    const stp = d.rooms.find(r => r.type === 'stair' && r.floor === g.F), hx = stp ? stp.x + stp.w / 2 : W - 6, hy = stp ? stp.y + stp.d / 2 : D - 6, hs = Math.max(3 * k, 7);
    s += rect(X(hx) - hs / 2, Y(hy) - hs / 2, hs, hs, box('#fff')) + line(X(hx) - hs / 2, Y(hy) - hs / 2, X(hx) + hs / 2, Y(hy) + hs / 2, st(INK, .6)) + line(X(hx) + hs / 2, Y(hy) - hs / 2, X(hx) - hs / 2, Y(hy) + hs / 2, st(INK, .6)) + label(X(hx), Y(hy) + hs / 2 + 8, 'ROOF HATCH', 7.5);
    s += label(X(W * .5), Y(D * .12), clip(roofing(d, g), 48).toUpperCase() + ' · TAPERED INSULATION', clamp(k * .35, 7, 9));
  }
  s += dim(X(0), Y(-oy), X(W), Y(-oy), ftIn(W), 40, 9) + dim(X(-ox), Y(D), X(-ox), Y(0), ftIn(D), 40, 9) + label(X(W / 2), Y(-oy) + 96, 'FRONT (STREET)', 10, 'font-weight="700" letter-spacing="1"');
  s += rtuMarks(t, d, X, Y, k);
  return { body: s, w: (W + 2 * ox) * k + mL + mR, h: (D + 2 * oy) * k + mT + mB };
}

// the side column of the plan sheet: room schedule, areas, legend, the unit row key, notes
const jogNote = (t, d) => fin(t.jog) > 0 ? 'The site plan draws a ' + ftIn(t.jog) + ' step in the face of ' + (t.count > 1 ? 'these buildings' : 'this building') + '; the design is drawn as the base ' + ftIn(d.W) + ' × ' + ftIn(d.D) + ' rectangle, and the step is set in design development.' : '';
function planSide(ctx, t, d, g, f) {
  if (isCor(t)) return corSide(ctx, t, d, g, f);
  const rooms = d.rooms.slice().sort((a, b) => a.floor - b.floor || a.y - b.y || a.x - b.x), max = 44, res = isRes(t), sched = sheetNo(ctx, 'a-sched', t.id) || 'A-6xx', shell = f?.scope?.kind === 'shell';
  let h = table('Room schedule', ['Room', 'Floor', 'Size', 'Area (sf)'], rooms.slice(0, max).map(r => [r.name + (byTenant(f, r) ? ' (by tenant)' : ''), r.floor, ftIn(r.w) + ' × ' + ftIn(r.d), f0(r.area)]), [1, 3]) +
    (rooms.length > max ? '<p class="muted sm">+ ' + (rooms.length - max) + ' more rooms: see the finish schedule on ' + esc(sched) + '.</p>' : '');
  const by = ty => d.rooms.filter(r => ty.includes(r.type)).reduce((a, r) => a + r.area, 0), garage = by(['garage']), porch = by(['porch']);
  const fa = [...Array(g.F)].map((_, i) => ['Floor ' + (i + 1) + (i ? ' (rooms)' : ' (gross)'), f0(i ? roomsOn(d, i + 1).reduce((a, r) => a + r.area, 0) : footA(d)) + ' sf']);
  const tot = d.rooms.reduce((a, r) => a + r.area, 0);
  h += '<div class="blk">' + table('Areas', null, [...fa, ...(res ? [['Living (conditioned)', f0(tot - garage - porch) + ' sf'], ['Garage', f0(garage) + ' sf']].concat(porch ? [['Porch', f0(porch) + ' sf']] : []) : [['Total of rooms', f0(tot) + ' sf']]),
    ['Buildings of this type', String(t.count || 1) + (t.attached ? ' rows × ' + t.unitsPer + ' units' : '')]], [1]) + '</div>';
  h += '<div class="blk"><div class="bh">Legend</div>' + legendRow(rect(4, 6, 36, 6, fl(INK)), 'Exterior wall, 8" (schematic)') + legendRow(rect(4, 7.5, 36, 3, fl('#4d5457')), 'Interior partition, 4-1/2"') +
    (shell ? legendRow(rect(4, 8, 36, 2, fl('#a3a8aa')), 'Tenant layout inside a suite: typical, by the tenant, for pricing') : '') +
    (d.attached ? legendRow(rectH(4, 5, 36, 8, HF('diag2', 'fill="#fff" stroke="#1b1e1f" stroke-width="1.2"', 4)), '1-hr rated party wall (' + partyRef(t) + ')') : '') +
    legendRow(doorTag(22, 9, 7.5, '101').replace(' class="dtag"', ''), 'Door tag: see door schedule ' + sched) + legendRow(winTag(22, 9, 8, 'A1').replace(' class="wtag"', ''), 'Window tag: see window schedule ' + sched) +
    legendRow(rect(4, 6, 36, 6, 'fill="#fff" stroke="#1b1e1f" stroke-width=".8"') + line(4, 9, 40, 9, st(INK, .7)), 'Window in exterior wall') + legendRow(line(4, 9, 40, 9, st(INK, 1, 'marker-end="url(#arr)"')), 'Stair: UP / DN from this floor') + '</div>';
  if (d.attached && g.n > 1) {
    const kw = 620, uw = kw / g.n, kh = Math.min(120, kw * d.D / g.RW);
    let s2 = ''; for (let i = 0; i < g.n; i++) s2 += rectH(10 + i * uw, 10, uw, kh, i === 0 || i === g.n - 1 ? HF('diag', 'fill="#fff" stroke="#1b1e1f" stroke-width="1"', 8) : 'fill="#f1f2f1" stroke="#1b1e1f" stroke-width="1"') + text(10 + i * uw + uw / 2, 10 + kh / 2, String(i + 1), 11, 'fill="#1b1e1f" text-anchor="middle" dominant-baseline="central" font-weight="700"');
    for (let i = 1; i < g.n; i++) s2 += line(10 + i * uw, 6, 10 + i * uw, 14 + kh, st(INK, 3));
    s2 += text(10 + kw / 2, kh + 30, 'FRONT (STREET)', 9, 'fill="#1b1e1f" text-anchor="middle" font-weight="700"');
    h += '<div class="blk"><div class="bh">Unit row key</div>' + svg(kw + 20, kh + 40, s2) + '<p class="sm">' + g.n + ' units in a row, ' + ftIn(g.RW) + ' × ' + ftIn(d.D) + '. Every unit is this plan (end units hatched); heavy lines are 1-hr rated party walls (' + (t.use === 'duplex' ? 'IRC R302.3; 1/2-hr where sprinklered' : 'IRC R302.2; 2-hr where the townhouses are not sprinklered — confirm') + ').</p></div>';
  }
  const rtus = rooftopUnits(t, d);
  const def = res ? ['Dimensions are schematic, to room boundaries (wall centrelines) and outside face of exterior walls; confirm in design development.',
    'Exterior walls 2x4 / 2x6 wood studs @ 16" o.c. with veneer, drawn 8" thick; interior partitions 2x4 @ 16" o.c., drawn 4-1/2".',
    'Every sleeping room has an emergency escape window: 5.7 sf net clear opening, sill 44" max. above the floor (IRC R310).',
    'Smoke alarms in each bedroom, outside each sleeping area and on every story; CO alarms outside sleeping areas (IRC R314, R315).',
    'Garage separated from the dwelling with 1/2" gyp. bd. (5/8" Type X under rooms above); the door between is 20-min or solid core and self-closing (IRC R302.5–R302.6).',
    'Safety glazing at doors, tubs and showers and near doors (IRC R308.4).', g.F > 1 ? 'Stairs: 7-3/4" max. riser, 10" min. tread, 36" min. width, handrail 34–38" (IRC R311.7).' : '',
    'Plumbing fixtures, cabinets and appliances are shown for layout only.']
    : ['Scope — ' + (f?.scope?.text || scopeOf(t).text), 'Dimensions are schematic, to room boundaries and outside face of exterior walls; confirm in design development.',
      shell ? 'Demising walls between suites run to the roof deck; tenant improvements are permitted separately by each tenant.' : '',
      'Exit doors swing in the direction of egress where the room serves 50 or more people (IBC 1010.1.2.1)' + (/^A/.test(t.occupancy || '') ? '; panic hardware on the exit doors (IBC 1010.2.9).' : '.'),
      'Restrooms are accessible single-user or multi-stall rooms with a 60" turning space (TAS 603–604).',
      rtus.length ? 'Rooftop units ' + rtus[0].tag + (rtus.length > 1 ? ' to ' + rtus[rtus.length - 1].tag : '') + ' as the mechanical plans list them' + (g.type === 'flat' ? ', screened from the street by the parapet' : '') + '; curbs and openings per mechanical.' : '',
      d.rooms.some(r => r.type === 'commercial_kitchen') ? 'Kitchen hood, walk-in and food service equipment by the food service designer.' : '',
      'Fixtures and equipment are shown for layout only.', jogNote(t, d)];
  const nn = discNotes(ctx, 'arch'); h += notes('Notes', nn.length ? [res ? '' : def[0], ...nn] : def);
  return h;
}
// apartments: the unit mix of the building, the common rooms, areas, legend and the code notes the plans rest on
function corSide(ctx, t, d, g, f) {
  const P = d.unitPlans || {}, mix = d.corridor?.mix || [], hotel = t.use === 'hotel', U = hotel ? 'Room' : 'Unit', units = d.rooms.filter(r => r.type === 'unit');
  let h = table(U + ' mix — this building (' + units.length + ')', ['Code', 'Type', 'Beds', 'Baths', 'Size', 'SF', 'No.'], mix.map(m => [m.code, m.name, String(m.beds), String(P[m.code]?.baths ?? '—'), P[m.code] ? ftIn(P[m.code].w) + ' × ' + ftIn(P[m.code].d) : '—', f0(m.sf), String(m.per)])
    .concat([['Total', '', '', '', '', f0(mix.reduce((a, m) => a + m.sf * m.per, 0)), String(mix.reduce((a, m) => a + m.per, 0))]]), [2, 3, 5, 6]);
  const seen = new Map(); for (const r of d.rooms.filter(r => r.type !== 'unit')) { const k = r.name + '|' + r.w + '|' + r.d; if (!seen.has(k)) seen.set(k, { r, fl: [] }); seen.get(k).fl.push(r.floor); }
  h += '<div class="blk">' + table('Common rooms', ['Room', 'Floors', 'Size', 'SF'], [...seen.values()].map(({ r, fl }) => [r.name, fl.length === g.F ? 'All' : fl.join(', '), ftIn(r.w) + ' × ' + ftIn(r.d), f0(r.area)]), [3]) + '</div>';
  const net = fl => roomsOn(d, fl).filter(r => r.type === 'unit').reduce((a, r) => a + r.area, 0), gross = footA(d);
  h += '<div class="blk">' + table('Areas', null, [['Floor area, each floor (gross)', f0(gross) + ' sf'], ['Building (gross, ' + g.F + ' floors)', f0(gross * g.F) + ' sf'], [U + 's (net), all floors', f0([...Array(g.F)].reduce((a, _, i) => a + net(i + 1), 0)) + ' sf'],
    ['Efficiency (net ÷ gross)', Math.round([...Array(g.F)].reduce((a, _, i) => a + net(i + 1), 0) / (gross * g.F) * 100) + '%'], ['Buildings of this type', String(t.count || 1) + ' · ' + f0((t.count || 1) * units.length) + ' ' + U.toLowerCase() + 's in all']], [1]) + '</div>';
  h += '<div class="blk"><div class="bh">Legend</div>' + legendRow(rect(4, 6, 36, 6, fl(INK)), 'Exterior wall, 8" (schematic)') + legendRow(rect(4, 7, 36, 4, fl('#2a2e30')), (hotel ? 'Guest room' : 'Dwelling unit') + ' separation, corridor and shaft walls (rated)') +
    legendRow(rect(4, 7.5, 36, 3, fl('#4d5457')), 'Partition inside a unit, 4-1/2"') + legendRow(unitTag(22, 9, '101', 'A1').replace(' class="utag"', '').replace(/ data-unit="[^"]*" data-code="[^"]*"/, ''), U + ' number and plan type (see ' + (sheetNo(ctx, 'a-units', t.id) || 'A-4xx') + ')') +
    legendRow(doorTag(22, 9, 7.5, '101').replace(' class="dtag"', ''), 'Door tag: see door schedule ' + (sheetNo(ctx, 'a-sched', t.id) || 'A-6xx')) + legendRow(line(4, 9, 40, 9, st(INK, 1, 'marker-end="url(#arr)"')), 'Stair: UP / DN from this floor') + '</div>';
  const sp = f?.sprinkler || {}, s13 = sp.system === 'NFPA 13';
  h += notes('Notes', ['Scope — ' + (f?.scope?.text || scopeOf(t).text), 'Sprinklers: ' + (sp.system || 'NFPA 13R') + ' throughout (' + (sp.ref || 'IBC 903.2.8') + ').',
    (hotel ? 'Guest room' : 'Dwelling unit') + ' separations: 1-hr fire partitions (IBC 708.3) and 1-hr floor/ceiling assemblies (IBC 711.2.4)' + (s13 ? ', 1/2-hr permitted with NFPA 13 throughout.' : '; the 1/2-hr exceptions need NFPA 13, not 13R.'),
    'Corridor walls: 1/2-hr fire partitions with 20-min self-closing unit entry doors (IBC Table 1020.2 and 716.1(2), sprinklered).',
    'Exit stairs at both ends of the corridor in 1-hr enclosures (IBC 1023.2, fewer than four stories), 44" min. width; each discharges directly outside.',
    g.F >= 3 ? 'Elevator in a 1-hr hoistway (IBC 713.4); it serves every floor, so every unit is an FHA Type B unit, with Accessible (Type A) units per IBC 1107.6.2.' : '',
    'Unit plans are drawn to scale on ' + (sheetNo(ctx, 'a-units', t.id) || 'A-4xx') + '; rooms, doors and fixtures there govern.', jogNote(t, d)]);
  return h;
}
function aPlans(ctx, sheet) {
  const { t, d, f } = look(ctx, sheet); if (!d) return noDesign(sheet, t);
  const g = f.height, mw = PM.mL + PM.mR, mh = PM.mT + PM.mB + TITLE;
  const views = [...Array(g.F)].map((_, i) => ({ f: i + 1, wf: d.W, hf: d.D, mw, mh })).concat([{ f: 0, wf: d.W + 2 * (d.attached ? 0 : g.oh), hf: d.D + 2 * g.oh, mw, mh }]);
  const lays = views.map((_, i) => chunk(views, i + 1)), boxS = { x: 0, y: 0, w: toPx(MAIN.w), h: toPx(MAIN.h) }, BAND = 470;
  // apartments: every floor, so the drawings can take the full width with the tables in a band along the bottom
  const boxB = { x: 0, y: 0, w: toPx(AREA.w), h: toPx(AREA.h - BAND) }, bS = bestLayout(lays, boxS.w, boxS.h), bB = isCor(t) ? bestLayout(lays, boxB.w, boxB.h) : null, wide = bB && bB.s.k > bS.s.k + 1e-9;
  const best = wide ? bB : bS, k = best.s.k, bx = wide ? boxB : boxS;
  sheet.scale = best.s.label;
  const html = placeRows(best.rows, k, bx).map((p, i) => { const v = p.v, dr = v.f ? planView(t, d, v.f, k, { facts: f }) : roofView(t, d, g, k); return placed(p, dr, i + 1, v.f ? (FLOORS[v.f] || 'Level ' + v.f) + ' floor plan' : 'Roof plan', best.s.label); }).join('');
  const sideHtml = planSide(ctx, t, d, g, f);
  return html + (wide ? at(AREA.x, AREA.y + AREA.h - BAND + 16, AREA.w, BAND - 16, '<div style="column-count:4;column-gap:22pt;column-fill:auto;height:' + (BAND - 16) + 'pt" class="ar-band">' + sideHtml + '</div><style>.ar-band .blk,.ar-band table{break-inside:avoid}</style>') : side(sideHtml));
}

// ---------- enlarged unit plans (A-4xx, apartments and hotels) ----------
// every unit plan of the type, drawn from its own plan (lib/plandesign.mjs unitPlan) at the largest scale that fits:
// rooms named with their sizes, doors (A the unit's entry, B its interior doors), windows by type mark, kitchen and bath
// fixtures; the corridor at the bottom, the outside wall at the top
const UM = { mL: 70, mR: 60, mT: 46, mB: 100 };
function unitView(t, d, P, k, wm) {
  const ori = q => Math.abs(q.y1 - q.y2) < 1e-6 ? 'h' : 'v';
  const ud = { W: P.w, D: P.d, floors: 1, floorH: d.floorH, use: d.use, roof: d.roof, footprint: [[0, 0], [P.w, 0], [P.w, P.d], [0, P.d]], rooms: P.rooms.map(r => ({ ...r, floor: 1, area: Math.round(r.w * r.d) })),
    doors: P.doors.map(q => ({ ...q, floor: 1, orient: ori(q), exterior: false, cut: q.b === 'corridor', into: q.a, id: q.b === 'corridor' ? 'A' : q.kind === 'opening' ? '' : 'B' })),
    windows: P.windows.map(q => ({ ...q, floor: 1, orient: 'h', y1: P.d, y2: P.d, side: 'back', id: wm.of(q) })) };
  const extra = (X, Y) => text(X(0) - 16, Y(P.d / 2), (t.use === 'hotel' ? 'GUEST ROOM' : 'UNIT') + ' SEPARATION (1-HR)', 8, 'fill="#1b1e1f" text-anchor="middle" dominant-baseline="central" font-weight="700" transform="rotate(-90 ' + num(X(0) - 16) + ' ' + num(Y(P.d / 2)) + ')"') +
    label(X(P.w / 2), Y(P.d) - 30, 'EXTERIOR WALL', 9, 'font-weight="700" letter-spacing="1"');
  return planView(t, ud, 1, k, { label: r => [r.name, ftIn(r.w) + ' × ' + ftIn(r.d)], extra, front: 'CORRIDOR', inner: true });
}
function aUnits(ctx, sheet) {
  const { t, d, f } = look(ctx, sheet); if (!d) return noDesign(sheet, t);
  const plans = Object.values(d.unitPlans || {}), mix = d.corridor?.mix || [], U = t.use === 'hotel' ? 'Room' : 'Unit';
  if (!plans.length) { sheet.scale = 'N.T.S.'; return at(MAIN.x, MAIN.y + 40, 760, 0, '<div class="warnbox"><b>No unit plans.</b> ' + esc(typeName(t)) + ' has no unit plans in its design; make the building designs again from the Plans tab.</div>'); }
  const wm = winMarks(d), mw = UM.mL + UM.mR, mh = UM.mT + UM.mB + TITLE, views = plans.map(P => ({ P, wf: P.w, hf: P.d, mw, mh }));
  // rows of plans: in order, or the widest first into the row with the least width so far (fills rows evenly)
  const lpt = r => { const rows = [...Array(r)].map(() => []), wsum = Array(r).fill(0); for (const v of views.slice().sort((a, b) => b.wf - a.wf)) { const i = wsum.indexOf(Math.min(...wsum)); rows[i].push(v); wsum[i] += v.wf; } return rows.filter(x => x.length).map(x => x.sort((a, b) => views.indexOf(a) - views.indexOf(b))); };
  const bx = { x: 0, y: 0, w: toPx(MAIN.w), h: toPx(MAIN.h) }, best = bestLayout([...views.map((_, i) => chunk(views, i + 1)), ...views.map((_, i) => lpt(i + 1))], bx.w, bx.h), k = best.s.k;
  sheet.scale = best.s.label;
  const html = placeRows(best.rows, k, bx).map((p, i) => { const P = p.v.P, m = mix.find(x => x.code === P.code), dr = unitView(t, d, P, k, wm);
    return '<div data-plan="' + esc(P.code) + '">' + placed(p, dr, i + 1, U + ' ' + P.code + ' — ' + P.name + ', ' + f0(P.sf) + ' sf' + (m ? ' · ' + m.per + ' in this building' : ''), best.s.label) + '</div>'; }).join('');
  const n = t.count || 1, rows = plans.map(P => { const m = mix.find(x => x.code === P.code); return [P.code, P.name, String(P.beds), String(P.baths), ftIn(P.w) + ' × ' + ftIn(P.d), f0(P.sf), String(m?.per ?? 0), String((m?.per ?? 0) * n)]; });
  const tot = mix.reduce((a, m) => a + m.per, 0), wins = [...wm.m].map(([key, mark]) => { const [wh, sill] = key.split('@'), [w, h] = wh.split('x').map(Number); return [mark, ftIn(w) + ' × ' + ftIn(h), ftIn(+sill), 'Single-hung, vinyl, low-E']; });
  const sp = f.sprinkler || {};
  const sideHtml = '<div data-sched="units">' + table(U + ' schedule', ['Code', 'Type', 'Beds', 'Baths', 'Size', 'SF', 'Bldg', 'All ' + n], rows.concat([['Total', '', '', '', '', f0(mix.reduce((a, m) => a + m.sf * m.per, 0)), String(tot), String(tot * n)]]), [2, 3, 5, 6, 7]) + '</div>' +
    '<div class="blk">' + table('Window types', ['Mark', 'Size W × H', 'Sill', 'Type'], wins) + '</div>' +
    '<div class="blk">' + table('Door types', ['Tag', 'Door', 'Rating'], [['A', U + ' entry, 3\'-0" × 6\'-8", solid core, closer, deadbolt, viewer', '20-min, self-closing (IBC 716)'], ['B', 'Interior, 3\'-0" × 6\'-8", hollow core; privacy lever at baths and bedrooms', '—'], ['—', 'Cased opening (untagged)', '—']]) + '</div>' +
    notes('Notes', [U + ' plans are drawn from the same plans the floor plans place; dimensions are to wall centrelines, schematic.', 'Kitchens: range, refrigerator, sink and dishwasher; 36" counters; baths: tub/shower, water closet, lavatory; washer and dryer in each unit.',
      'Accessibility: FHA Type B units (an elevator serves every floor), with Accessible (Type A) units, 2% min., per IBC 1107.6.2; adaptable kitchens and baths shown at this scale only.',
      sp.on ? 'Emergency escape openings are not required in a building sprinklered throughout (IBC 1031.1, exception 1); bedroom windows give light and air (IBC 1204, 1202).' : 'Every sleeping room has an emergency escape window (IBC 1031).', 'Smoke alarms in each sleeping room and outside it, and on each story of a unit, interconnected (IBC 907.2.11.2); CO alarms where fuel-burning appliances are installed (IBC 915).',
      'Unit separation walls and the corridor wall: see the floor plans and wall sections for their ratings and assemblies.']);
  return html + side(sideHtml);
}

// ---------- exterior elevations ----------
const EM = { mL: 34, mR: 160, mT: 30, mB: 40 };
// wall material -> hatch kind and spacing in feet (brick coursing every 4" read as lines a few px apart, lap siding at 7")
const MATS = { brick: ['horiz', .333], siding: ['horiz', .583], stucco: ['dots', 1.2], metal: ['vert', 1] };
const matOf = s => /brick|stone|masonry/.test(s) ? 'brick' : /siding|lap|board|hardie|fiber cement|cement board/.test(s) ? 'siding' : /tilt|concrete|precast|cmu/.test(s) ? 'tilt' : /stucco|eifs|plaster/.test(s) ? 'stucco' : /metal/.test(s) ? 'metal' : '';
// the wall materials: lower and upper skins and where they change
function skin(t, d, g) {
  const w = String(d.exterior?.walls || '').toLowerCase();
  if (isRes(t) || isCor(t)) { const lo = matOf(w) || 'brick', hi = /siding|lap|board|hardie|fiber cement/.test(w) ? 'siding' : lo; return { lo, hi, split: g.F > 1 ? g.fh : g.plate, gable: hi === 'brick' ? 'siding' : hi }; }
  const lo = matOf(w) || 'stucco', hi = (lo === 'brick' && /eifs|stucco/.test(w)) ? 'stucco' : lo;
  return { lo, hi, split: hi !== lo ? Math.min(12, g.plate * .6) : g.plate, gable: hi };
}
const doorH = (t, dr) => dr.kind === 'overhead' ? (isRes(t) ? (dr.width >= 18 ? 8 : 7) : dr.width >= 12 ? 14 : 10) : dr.kind === 'storefront' ? 7 : isRes(t) || (isCor(t) && !dr.exterior) ? 6.67 : 7;

function elevView(t, d, g, sd, k) {
  const fr = sd === 'front' || sd === 'back', n = fr ? g.n : 1, A = fr ? g.RW : d.D, U = d.W, res = isRes(t), sk = skin(t, d, g), p = g.p / 12, oh = g.oh;
  const zTop = g.top + 1.5, zBot = -g.grade - 1, X = s => EM.mL + (s + oh) * k, Y = z => EM.mT + (zTop - z) * k, resLike = res || isCor(t);
  const flat = g.type === 'flat', shed = g.type === 'shed', zE = g.plate - oh * p;
  const sv = (a, b) => [X(a), Y(b)];
  let s = '';
  // what this side shows: the outline's faces that look this way, each at its own depth (an L or a stepped front shows
  // its set-back faces as separate panels), and the rectangular masses that carry the roofs. An attached row is one face.
  const FP = fpOf(d), att = n > 1, viewAx = fr ? 'x' : 'y', top = flat ? g.parapet : g.plate;
  const mapS = (a, b) => sd === 'back' || sd === 'left' ? [(fr ? A : d.D) - b, (fr ? A : d.D) - a] : [a, b];
  const faces = att ? [{ a: 0, b: A, dep: 0 }] : edgesOf(FP).filter(e => e.face === sd).map(e => { const [a, b] = mapS(e.a, e.b); return { a, b, dep: sd === 'front' || sd === 'left' ? e.at : (fr ? d.D : d.W) - e.at }; });
  const masses = (att ? [{ x: 0, y: 0, w: g.RW, d: d.D }] : piecesD(d)).map(m => { const [a, b] = fr ? mapS(m.x, m.x + m.w) : mapS(m.y, m.y + m.d); return { ...m, a, b, dep: sd === 'front' ? m.y : sd === 'back' ? d.D - m.y - m.d : sd === 'left' ? m.x : d.W - m.x - m.w }; });
  const near = Math.min(...faces.map(f => f.dep));
  const fill = (pts, m, base = '#fff') => { const pp = pts.map(([a, b]) => sv(a, b)), M = MATS[m]; return poly(pp, fl(base)) + (m === 'tilt' ? poly(pp, fl(base === '#fff' ? '#f2f2f0' : '#e8e9e7')) : M ? hatch(pp, M[0], Math.max(M[1] * k, M[0] === 'dots' ? 9 : 4.5)) : ''); };
  const RF = 'fill="#e2e4e3" stroke="#1b1e1f" stroke-width="1.2"', BAND = box('#4d5457', 1);
  const roofPoly = pts => polyH(pts.map(([a, b]) => sv(a, b)), HF('horiz', RF, Math.max(.5 * k, 5)));
  const panel = f => {
    const base = f.dep > near + .1 ? '#eceeed' : '#fff', R4 = (z0, z1) => [[f.a, z0], [f.b, z0], [f.b, z1], [f.a, z1]]; let o = fill(R4(0, Math.min(top, sk.split)), sk.lo, base);
    if (top > sk.split) o += fill(R4(sk.split, top), sk.hi, base) + (sk.lo !== sk.hi ? line(X(f.a), Y(sk.split), X(f.b), Y(sk.split), st(INK, 1.2)) : '');
    if (sk.lo === 'tilt') { const np = Math.max(1, Math.round((f.b - f.a) / 26)); for (let i = 1; i < np; i++) o += line(X(f.a + (f.b - f.a) * i / np), Y(0), X(f.a + (f.b - f.a) * i / np), Y(top), st(GREY, .8)); o += line(X(f.a), Y(Math.min(4, top / 4)), X(f.b), Y(Math.min(4, top / 4)), st(GREY, .6)); }
    if (att) for (let i = 1; i < n; i++) o += line(X(i * U), Y(0), X(i * U), Y(g.plate), st(INK, 1.2));
    if (flat) o += rect(X(f.a), Y(g.parapet), (f.b - f.a) * k, .5 * k, box('#cfd3d1', 1.2));
    return o + poly(R4(0, top).map(([a, b]) => sv(a, b)), st(INK, 1.6)) + rect(X(f.a), Y(0), (f.b - f.a) * k, g.grade * k, box('#fff', .8));
  };
  // a mass's roof (pitched roofs only; a flat roof's coping is on its faces)
  let roofAnchor = null;
  const massRoof = m => {
    const sp = m.b - m.a; let o = '';
    if (g.type === 'gable') {
      if (g.ridgeAx === viewAx) { const zR = g.plate + (g.ridgeAx === 'x' ? m.d : m.w) / 2 * p; o += roofPoly([[m.a - oh, zE], [m.b + oh, zE], [m.b + oh, zR], [m.a - oh, zR]]); roofAnchor = [m.a + sp * .7, (zE + zR) / 2]; }
      else for (const [a, b] of att && fr ? [...Array(n)].map((_, i) => [i * U, (i + 1) * U]) : [[m.a, m.b]]) { const mid = (a + b) / 2, zr = g.plate + (b - a) / 2 * p; o += fill([[a, g.plate], [mid, zr], [b, g.plate]], sk.gable) + poly([[a, g.plate], [mid, zr], [b, g.plate]].map(([x, z]) => sv(x, z)), st(INK, 1.2)) + poly([sv(a - oh, zE), sv(mid, zr), sv(b + oh, zE), sv(b + oh, zE + .6), sv(mid, zr + .6), sv(a - oh, zE + .6)], BAND); roofAnchor = [a + (b - a) * .3, g.plate + (b - a) * .3 * p + .3]; }
    } else if (g.type === 'hip') { const run = Math.min(m.w, m.d) / 2, zR = g.plate + run * p, r0 = ((m.w >= m.d ? 'x' : 'y') === viewAx) ? run : sp / 2; o += roofPoly([[m.a - oh, zE], [m.b + oh, zE], [m.b - r0, zR], [m.a + r0, zR]]); roofAnchor = [(m.a + m.b) / 2, (zE + zR) / 2]; }
    else if (shed) { // high at the mass's front
      const zH = g.plate + m.d * p, loE = g.plate - oh * p, hiE = zH + oh * p;
      if (sd === 'front') o += fill([[m.a, g.plate], [m.b, g.plate], [m.b, zH], [m.a, zH]], sk.hi) + poly([sv(m.a, g.plate), sv(m.b, g.plate), sv(m.b, zH), sv(m.a, zH)], st(INK, 1.4)) + poly([sv(m.a - oh, zH), sv(m.b + oh, zH), sv(m.b + oh, zH + .7), sv(m.a - oh, zH + .7)], BAND);
      else if (sd === 'back') o += poly([sv(m.a - oh, loE), sv(m.b + oh, loE), sv(m.b + oh, loE + .7), sv(m.a - oh, loE + .7)], BAND);
      else { const hiAtB = sd === 'left', tri = hiAtB ? [[m.a, g.plate], [m.b, g.plate], [m.b, zH]] : [[m.a, g.plate], [m.b, g.plate], [m.a, zH]], [e0, e1] = hiAtB ? [[m.a - oh, loE], [m.b + oh, hiE]] : [[m.a - oh, hiE], [m.b + oh, loE]];
        o += fill(tri, sk.hi) + poly(tri.map(([x, z]) => sv(x, z)), st(INK, 1.4)) + poly([sv(...e0), sv(...e1), sv(e1[0], e1[1] + .7), sv(e0[0], e0[1] + .7)], BAND); }
      roofAnchor = [(m.a + m.b) / 2, sd === 'back' ? loE + .35 : sd === 'front' ? zH + .35 : (g.plate + zH) / 2 + .35];
    }
    return o;
  };
  // farthest first, a mass's walls before its roof, so nearer faces and roofs cover what they hide
  const items = [...faces.map(f => ({ dep: f.dep, o: 0, draw: () => panel(f) })), ...(flat ? [] : masses.map(m => ({ dep: m.dep, o: 1, draw: () => massRoof(m) })))].sort((a, b) => b.dep - a.dep || a.o - b.o);
  for (const it of items) s += it.draw();
  if (flat) { const f0 = faces.find(f => f.dep === near) || faces[0]; roofAnchor = [(f0.a + f0.b) / 2, g.parapet - .25]; }
  const wtop = top, nf = faces.filter(f => f.dep === near).sort((a, b) => a.a - b.a)[0] || { a: 0, b: A };
  // windows and doors on this side, each unit of a row in turn
  const sOf = (u, a, b) => sd === 'front' ? [u * U + a, u * U + b] : sd === 'back' ? [A - (u * U + b), A - (u * U + a)] : sd === 'left' ? [d.D - b, d.D - a] : [a, b];
  let winAnchor = null, doorAnchor = null, canopy = /canop/i.test(d.exterior?.accent || '');
  for (let u = 0; u < n; u++) {
    for (const w of allWins(t, d).filter(x => faceAt(FP, x.orient, dAt(x), (span(x)[0] + span(x)[1]) / 2) === sd)) {
      const [a, b] = sOf(u, ...span(w)), z0 = (w.floor - 1) * g.fh + fin(w.sill), z1 = z0 + fin(w.height), x0 = X(a), x1 = X(b), y0 = Y(z1), hh = (z1 - z0) * k;
      if (resLike && sk.lo === 'brick' && w.floor === 1) s += rect(x0 - .2 * k, y0 - .55 * k, (b - a + .4) * k, .55 * k, box('#fff', .7)) + rect(x0 - .25 * k, Y(z0), (b - a + .5) * k, .3 * k, box('#fff', .7));
      s += rect(x0, y0, x1 - x0, hh, 'fill="#e3eaee" stroke="#1b1e1f" stroke-width="1.1"') + rect(x0 + 2, y0 + 2, x1 - x0 - 4, hh - 4, st(INK, .5));
      if (resLike) { s += line(x0, y0 + hh / 2, x1, y0 + hh / 2, st(INK, .9)); if (b - a >= 5) s += line((x0 + x1) / 2, y0, (x0 + x1) / 2, y0 + hh, st(INK, .9)); }
      else { const nm = Math.max(1, Math.round((b - a) / 5)); for (let i = 1; i < nm; i++) s += line(x0 + (x1 - x0) * i / nm, y0, x0 + (x1 - x0) * i / nm, y0 + hh, st(INK, .9)); if (z1 - z0 > 8) s += line(x0, Y(z0 + 7), x1, Y(z0 + 7), st(INK, .9)); }
      winAnchor = winAnchor || [(a + b) / 2, z1 - .5];
    }
    for (const dr of (d.doors || []).filter(x => x.exterior && x.floor === 1 && faceAt(FP, x.orient, dAt(x), (span(x)[0] + span(x)[1]) / 2) === sd)) {
      const [a, b] = sOf(u, ...span(dr)), hgt = Math.min(doorH(t, dr), g.plate - 1), x0 = X(a), x1 = X(b), y0 = Y(hgt), hh = hgt * k, w = x1 - x0;
      if (dr.kind === 'overhead') { s += rect(x0, y0, w, hh, box('#f4f4f2', 1.2)); const ns = Math.max(3, Math.round(hgt / (res ? 1.75 : 2))); for (let i = 1; i < ns; i++) s += line(x0, y0 + hh * i / ns, x1, y0 + hh * i / ns, st(INK, .6)); if (res && k >= 6) for (let i = 1; i < 4; i++) s += line(x0 + w * i / 4, y0, x0 + w * i / 4, y0 + hh, st(GREY, .4)); }
      else if (dr.kind === 'storefront' || dr.kind === 'sliding') { const th = dr.kind === 'storefront' ? Math.min(10, g.plate - 1) : hgt; s += rect(x0, Y(th), w, th * k, 'fill="#e3eaee" stroke="#1b1e1f" stroke-width="1.2"'); const nm = Math.max(2, Math.round((b - a) / 3)); for (let i = 1; i < nm; i++) s += line(x0 + w * i / nm, Y(th), x0 + w * i / nm, Y(0), st(INK, .8)); if (th > hgt) s += line(x0, y0, x1, y0, st(INK, .9)); if (dr.kind === 'storefront') s += line(x0 + w * .3, Y(3.5), x0 + w * .45, Y(3.5), st(INK, 1.4)) + line(x0 + w * .55, Y(3.5), x0 + w * .7, Y(3.5), st(INK, 1.4)); if (canopy && !res && g.plate > 13) s += rect(X(a - 2), Y(th + 1.4), (b - a + 4) * k, .6 * k, box('#4d5457', 1)) + line(X(a - 2), Y(th + .8), X(a + 1), Y(th + 4), st(INK, .8)) + line(X(b + 2), Y(th + .8), X(b - 1), Y(th + 4), st(INK, .8)); }
      else if (dr.kind === 'opening') s += rect(x0, y0, w, hh, st(INK, 1, DASH));
      else { const lv = dr.kind === 'double' ? 2 : 1; s += rect(x0, y0, w, hh, box('#fbfbfa', 1.2)); for (let i = 0; i < lv; i++) { const lx = x0 + w * i / lv, lw = w / lv; s += rect(lx + lw * .18, y0 + hh * .1, lw * .64, hh * .35, st(INK, .5)) + rect(lx + lw * .18, y0 + hh * .52, lw * .64, hh * .38, st(INK, .5)) + circle(i ? lx + lw * .12 : lx + lw * .88, Y(3), Math.max(1.2, .12 * k), fl(INK)); } if (lv === 2) s += line(x0 + w / 2, y0, x0 + w / 2, Y(0), st(INK, .9)); }
      doorAnchor = doorAnchor || [(a + b) / 2, hgt * .75];
    }
  }
  // grade and the exposed slab edge
  s += hatch([X(-oh) - 12, Y(-g.grade), (A + 2 * oh) * k + 24, 12], 'earth') + line(X(-oh) - 12, Y(-g.grade), X(A + oh) + 12, Y(-g.grade), st(INK, 2.4));
  s += levelMarks(levelList(g), X(A) + 4, X(A + oh) + 14, Y);
  // material keynotes
  const ka = nf.a + (nf.b - nf.a) * .06, kn = [[1, [ka, Math.min(sk.split, g.plate) * .45]], ...(sk.hi !== sk.lo && wtop > sk.split + 1 ? [[2, [ka, (sk.split + Math.min(wtop, g.plate)) / 2]]] : []), [3, roofAnchor], [4, winAnchor], [5, doorAnchor]].filter(x => x[1]);
  for (const [nmb, [a, b]] of kn) { const x = X(a), y = Y(b), tx = Math.max(12, x - 28), ty = Math.max(10, y - 28); s += line(x, y, tx, ty, st(INK, .7)) + circle(x, y, 1.8, fl(INK)) + rect(tx - 8, ty - 8, 16, 16, box('#fff', 1)) + text(tx, ty, String(nmb), 9, 'fill="#1b1e1f" text-anchor="middle" dominant-baseline="central" font-weight="700"'); }
  return { body: s, w: (A + 2 * oh) * k + EM.mL + EM.mR, h: (zTop - zBot) * k + EM.mT + EM.mB };
}
const ELEV_TITLES = { front: 'Front elevation', back: 'Rear elevation', left: 'Left side elevation', right: 'Right side elevation' };
function aElev(ctx, sheet) {
  const { t, d, f } = look(ctx, sheet); if (!d) return noDesign(sheet, t);
  const g = f.height, V = ['front', 'back', 'left', 'right'].map(sd => ({ sd, wf: (sd === 'front' || sd === 'back' ? g.RW : d.D) + 2 * g.oh, hf: g.top + g.grade + 2.5, mw: EM.mL + EM.mR, mh: EM.mT + EM.mB + TITLE }));
  const [F, B, L, R] = V, bx = { x: 0, y: 0, w: toPx(MAIN.w), h: toPx(MAIN.h) }, best = bestLayout([[[F, B], [L, R]], [[F], [B], [L, R]], [[F], [B], [L], [R]]], bx.w, bx.h);
  sheet.scale = best.s.label;
  const html = placeRows(best.rows, best.s.k, bx).map(p => placed(p, elevView(t, d, g, p.v.sd, best.s.k), V.indexOf(p.v) + 1, ELEV_TITLES[p.v.sd] + (p.v.sd === 'front' ? ' (street)' : ''), best.s.label)).join('');
  const ex = d.exterior || {}, sk = skin(t, d, g), res = isRes(t), cor = isCor(t);
  const key = [['1', sk.lo === 'brick' && (res || cor) ? 'Walls, first floor' : 'Walls', ex.walls || '—'], ...(sk.hi !== sk.lo ? [['2', 'Walls above', sk.hi === 'siding' ? 'Fiber cement lap siding, painted' : sk.hi === 'stucco' ? 'EIFS / stucco finish' : ex.walls]] : []),
    ['3', 'Roof', roofing(d, g) + (g.type === 'flat' ? ' behind 3\'-0" parapet, prefinished metal coping' : ', ' + pitchTxt(g.p) + ', ' + ftIn(g.oh) + ' overhang')], ['4', 'Windows', ex.windows || '—'], ['5', 'Doors', ex.doors || '—'], ...(ex.accent ? [['6', 'Accent / trim', ex.accent]] : [])];
  const def = ['Elevations are schematic: window and door sizes and places come from the floor plans' + (cor ? ' and the unit plans' : '') + '; materials from the design narrative.', 'Levels are from the top of the first floor slab, which sits ' + ftIn(g.grade) + ' above the grade plane; finish grade falls 6" min. in the first 10 ft from the walls (IRC R401.3 / IBC 1804.4).',
    'Building height ' + ftIn(g.buildingHeight) + ' above the grade plane to ' + (g.type === 'flat' ? 'the roof deck' : 'the mean roof height') + ' (IBC 202), as the code analysis and the fire access plan state it.',
    res || cor ? 'Brick veneer: weep holes at 33" o.c. above flashing at the base and over openings (IRC R703.8 / TMS 402).' : 'Rooftop equipment screened from the street by the parapet; confirm sight lines.', 'Final colors and materials are selected in design development.', jogNote(t, d)];
  return html + side(table('Material keynotes', ['No.', 'Item', 'Material'], key) + '<div class="blk">' + table('Levels', ['Level', 'Height'], levelList(g).map(l => [l.n, l.t || ftIn(l.z)]), [1]) + '</div>' +
    '<div class="blk" data-heights="' + g.buildingHeight + '|' + g.fireAccessHeight + '">' + table('Heights the code counts', null, heightRows(g), [1]) + '</div>' +
    (d.attached ? '<p class="sm" style="margin-top:8pt">Front and rear elevations show the whole row of ' + g.n + ' units (' + ftIn(g.RW) + '); side elevations show an end unit. Heavy lines mark the 1-hr rated party walls.</p>' : '') + notes('Notes', def));
}

// ---------- building sections ----------
const SM = { mL: 70, mR: 160, mT: 30, mB: 46 };
// the wall assembly drawn and named for a type: its structural walls (lib/plandesign.mjs structureOf) with the veneer
// its exterior asks for. 'stud' is a 2x6 wood stud wall with veneer (commercial wood frame)
function wallKind(t, d, stc) {
  const w = String(d?.exterior?.walls || '').toLowerCase(), k = stc?.walls?.kind;
  if (k === 'tilt-up') return 'tilt'; if (k === 'cmu') return 'cmu';
  if (isRes(t) || isCor(t)) return /siding|lap|board|hardie|fiber cement/.test(w) && !/brick|stone|masonry/.test(w) ? 'wood-siding' : 'wood-brick';
  if (!k && (/tilt|precast/.test(w) || t.use === 'industrial')) return 'tilt';
  return !k && /^I/.test(t.construction || '') ? 'cmu' : 'stud';
}
const slabText = stc => stc?.foundation?.kind === 'pt-slab' ? '4" post-tensioned slab on grade, 10 mil vapor retarder' : '5" reinforced slab on grade (6" in warehouses), 15 mil vapor retarder';
function sectionNotes(t, d, g, stc) {
  const ex = d.exterior || {}, res = isRes(t), cor = isCor(t), kind = wallKind(t, d, stc), flat = g.type === 'flat', sw = stc?.walls?.text || '';
  const wall = { 'wood-brick': 'Brick veneer, 1" air space, WRB, ' + (res ? '7/16" OSB on 2x4 studs @ 16" o.c., R-13 batts' : '7/16" OSB on 2x6 studs @ 16" o.c., R-19 batts') + ', 1/2" gyp. bd.' + (cor ? ' (5/8" Type X where rated)' : ''),
    'wood-siding': 'Fiber cement lap siding, WRB, 7/16" OSB on ' + (res ? '2x4 studs @ 16" o.c., R-13 batts' : '2x6 studs @ 16" o.c., R-19 batts') + ', 1/2" gyp. bd.',
    tilt: '9-1/4" concrete tilt-wall panels, painted; furring, R-7.5 rigid insulation and 5/8" gyp. bd. at conditioned rooms', cmu: 'Brick veneer on 8" CMU, grouted and reinforced per structural, R-7.5 c.i., furring and 5/8" gyp. bd.',
    stud: (ex.walls || 'Veneer') + ' on 7/16" OSB, 2x6 wood studs @ 16" o.c., R-19 batts, 5/8" gyp. bd.' }[kind];
  return [['Roofing', flat ? roofing(d, g) + ' on cover board over R-25 c.i. polyiso, tapered to drains 1/4":12 min.' : roofing(d, g) + ' on synthetic underlayment, 7/16" OSB with radiant barrier'],
    ['Roof structure', (stc?.roof?.text || (flat ? 'Steel roof deck on open-web steel joists' : 'Pre-engineered wood roof trusses at 24" o.c.')) + (flat ? '; depth per structural' : '; ' + pitchTxt(g.p) + ', ' + ftIn(g.oh) + ' overhang, hurricane ties at every bearing')],
    ['Insulation', flat ? 'Continuous roof insulation above the deck (IECC C402, climate zone 2A)' : 'R-38 blown attic insulation (R-49 where the 2021 IECC is adopted), baffles at the eaves'],
    ['Exterior wall', wall + (sw ? '. Structure: ' + sw : '')], ...(g.F > 1 && stc?.floor ? [['Floor', stc.floor.text]] : []),
    ...(cor ? [['Separations', (t.use === 'hotel' ? 'Guest room' : 'Unit') + ' walls 1-hr fire partitions (IBC 708.3), floors 1-hr horizontal assemblies (IBC 711.2.4), corridor walls 1/2-hr (IBC Table 1020.2, sprinklered)']] : []),
    ...(stc?.columns ? [['Columns', stc.columns.text]] : []),
    ['Slab', slabText(stc)], ['Foundation', stc?.foundation?.text || 'Slab on grade with grade beams per structural and the geotechnical report'],
    ['Ceiling', res ? '1/2" gyp. bd. (5/8" Type X at the garage)' : cor ? '5/8" Type X gyp. bd. on resilient channel (part of the 1-hr floor/ceiling), 9\'-0" in the units, 8\'-0" at baths and the corridor' : '2x4 lay-in acoustical tile where scheduled; open to structure in shell, warehouse and assembly rooms']];
}
// where a section cuts: through the middle of the largest rectangular piece (never across open ground), nudged off wall
// lines so it shows rooms (an apartment building: through a unit on each side of the corridor, clear of the core and
// stairs); the cut spans the building's own extent along that line -> { m, c, s0, L, o0, other }
export function sectionCut(d, axis) {
  const m = piecesD(d)[0], FP = fpOf(d), o0 = axis === 'y' ? m.x : m.y, other = axis === 'y' ? m.w : m.d, edges = d.rooms.flatMap(r => axis === 'y' ? [r.x, r.x + r.w] : [r.y, r.y + r.d]);
  const across = cc => d.rooms.filter(r => r.floor === 1 && (axis === 'y' ? r.x < cc && r.x + r.w > cc : r.y < cc && r.y + r.d > cc));
  const units = !!d.corridor && d.rooms.some(r => r.type === 'unit'), steps = units ? [...Array(Math.ceil(other))].flatMap((_, i) => i ? [i, -i] : [0]) : [0, 2, -2, 4, -4, 6, -6, 8, -8];
  let c = o0 + other / 2;
  for (const dd of steps) { const cc = o0 + other / 2 + dd; if (cc > o0 + .5 && cc < o0 + other - .5 && !edges.some(e => Math.abs(e - cc) < 1) && (!units || across(cc).every(r => r.type === 'unit' || r.type === 'corridor'))) { c = cc; break; } }
  const xs = edgesOf(FP).filter(e => e.o === (axis === 'y' ? 'h' : 'v') && e.a < c && e.b > c).map(e => e.at).sort((a, b) => a - b), pc = axis === 'y' ? m.y + m.d / 2 : m.x + m.w / 2;
  let s0 = 0, s1 = axis === 'y' ? d.D : d.W; for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i] <= pc + .01 && xs[i + 1] >= pc - .01) { s0 = xs[i]; s1 = xs[i + 1]; }
  return { m, c, s0, L: Math.max(1, s1 - s0), o0, other };
}
function sectionView(t, d, g0, axis, k, stc) {
  // the roof of the piece the cut runs through
  const cut = sectionCut(d, axis), g = shaped(d) ? heightsOf(t, { ...d, W: cut.m.w, D: cut.m.d }) : g0, L = cut.L, other = cut.other, c = cut.c, cr = c - cut.o0, s00 = cut.s0;
  const res = isRes(t), p = g.p / 12, oh = g.type === 'flat' ? 0 : axis === 'x' && d.attached ? 0 : g.oh, kind = wallKind(t, d, stc), grd = -(g.grade || .5);
  const zTop = g.top + 2, zBot = -4.5, X = s => SM.mL + (s + oh + 3) * k, Y = z => SM.mT + (zTop - z) * k, te = Math.max(.67 * k, 2.4), ti = Math.max(.375 * k, 1.3);
  const R = (s0, z0, s1, z1, a) => rectH(X(s0), Y(z1), (s1 - s0) * k, (z1 - z0) * k, a), CON = w2 => HF('dots', box('#fff', w2), 9), WALL = (kind === 'tilt' || kind === 'cmu') ? CON(1) : HF('diag', box('#fff', 1), 7);
  let s = MYDEFS + hatch([X(-oh - 3), Y(grd), (L + 2 * oh + 6) * k, (4.5 + grd) * k], 'earth', 18) + line(X(-oh - 3), Y(grd), X(L + oh + 3), Y(grd), st(INK, 2.2));
  // slab and beams (grade beams at the walls and every ~15 ft; footings at the columns of long-span roofs)
  const slabT = stc?.foundation?.kind === 'pt-slab' || res ? .33 : .5, span0 = (stc ? stc.columns : g.type === 'flat') && L > 60 ? Math.ceil(L / 50) : 1, cols = [...Array(span0 - 1)].map((_, i) => L * (i + 1) / span0);
  s += R(0, -slabT, L, 0, CON(1));
  const beams = [.5, L - .5]; if (!cols.length) for (let b = 15; b < L - 8; b += 15) beams.push(b);
  for (const b of beams) s += R(b - .5, -2.5, b + .5, -slabT, CON(.8));
  for (const b of cols) s += R(b - 2, -3.2, b + 2, -2.2, CON(.8)) + R(b - .5, -2.2, b + .5, -slabT, CON(.8));
  // the roof profile along the cut
  const tri = (g.type === 'gable' || g.type === 'hip') && g.ridgeAx !== axis, flat = g.type === 'flat';
  const zCut = g.type === 'shed' ? (axis === 'y' ? null : g.ridge - cr * p) : !tri && !flat ? g.plate + Math.max(0, g.run - Math.abs(cr - other / 2)) * p : null;
  const topAt = s0 => flat ? g.plate : g.type === 'shed' ? (axis === 'y' ? g.ridge - s0 * p : zCut) : tri ? g.plate + Math.min(s0, L - s0) * p : g.type === 'hip' ? Math.min(zCut, g.plate + Math.min(s0, L - s0) * p) : zCut;
  const endTop = [0, L].map(s0 => flat ? g.parapet : g.type === 'shed' ? topAt(s0) : !tri && g.type === 'gable' ? zCut : g.plate);
  // the cut exterior walls (gable ends run up to the roof; parapets 3 ft above the deck)
  s += R(0, 0, .67, endTop[0], WALL) + R(L - .67, 0, L, endTop[1], WALL);
  if (flat) s += R(-.1, g.parapet, .77, g.parapet + .35, box('#cfd3d1', 1)) + R(L - .77, g.parapet, L + .1, g.parapet + .35, box('#cfd3d1', 1));
  // floors, cut partitions, ceilings and room names, floor by floor
  const wf = res || /^wood/.test(stc?.floor?.kind || ''), fd = res ? 1.1 : wf ? 1.33 : 2; // floor/ceiling depth: wood floor trusses (and gypsum topping), or concrete on steel deck and beams
  for (let f = 1; f <= g.F; f++) {
    const z0 = (f - 1) * g.fh;
    if (f > 1 && wf) { s += R(.67, z0 - fd, L - .67, z0, box('#fff', 1)); const zz = [], n2 = Math.max(2, Math.round((L - 1.3) / 2.5)); for (let i = 0; i <= n2; i++) zz.push([X(.67 + (L - 1.34) * i / n2), Y(i % 2 ? z0 - .15 : z0 - fd + .15)]); s += pline(zz, st(GREY, .6)); if (!res) s += R(.67, z0 - .13, L - .67, z0, fl('#9aa0a2')); }
    else if (f > 1) s += R(.67, z0 - .4, L - .67, z0, CON(1)) + R(.67, z0 - fd, L - .67, z0 - fd + .25, fl(INK));
    const iv = (isCor(t) ? partsOf(t, d, f, true).rooms : roomsOn(d, f)).filter(r => axis === 'y' ? r.x < c && r.x + r.w > c : r.y < c && r.y + r.d > c).map(r => ({ r, a: (axis === 'y' ? r.y : r.x) - s00, b: (axis === 'y' ? r.y + r.d : r.x + r.w) - s00 })).filter(q => q.b > .1 && q.a < L - .1).sort((q, w) => q.a - w.a);
    const zTopF = f < g.F ? f * g.fh - fd : g.plate - (flat ? 2.2 : 0), walls = new Set();
    for (const q of iv) for (const e of [q.a, q.b]) if (e > .8 && e < L - .8) walls.add(Math.round(e * 2) / 2);
    for (const e of walls) { const ch = Math.max(...iv.filter(q => Math.abs(q.a - e) < .6 || Math.abs(q.b - e) < .6).map(q => ceilOf(t, g, q.r))); s += rectH(X(e) - ti / 2, Y(ch ? z0 + ch : zTopF), ti, ((ch ? z0 + ch : zTopF) - z0) * k, HF('diag', box('#fff', .6), 7)); }
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
    s += R(.67, zj, L - .67, g.plate, fl(INK)) + R(.67, g.plate, L - .67, g.plate + .4, HF('cross', box('#fff', .6))) + line(X(.67), Y(g.plate + .42), X(L - .67), Y(g.plate + .42), st(INK, 1.6));
    s += line(X(.67), Y(zj - .1), X(L - .67), Y(zj - .1), st(INK, .9)) + line(X(.67), Y(zj - jd), X(L - .67), Y(zj - jd), st(INK, .9));
    const zz = []; for (let i = 0; i <= n2; i++) zz.push([X(.67 + (L - 1.34) * i / n2), Y(i % 2 ? zj - .1 : zj - jd)]); s += pline(zz, st(GREY, .6));
    for (const b of cols) s += R(b - .3, 0, b + .3, zj - jd, fl(INK));
  } else {
    // topAt runs on past the walls, so the eaves and rakes follow the same slope
    const brks = [-oh, 0, L / 2, L, L + oh, ...(g.type === 'hip' && zCut > g.plate ? [(zCut - g.plate) / p, L - (zCut - g.plate) / p] : [])], pts = [...new Set(brks.filter(v => v >= -oh && v <= L + oh))].sort((a, b) => a - b).map(s0 => [s0, topAt(s0)]);
    s += pline(pts.map(([a, b]) => [X(a), Y(b)]), st(INK, 2)) + pline(pts.map(([a, b]) => [X(a), Y(b + .4)]), st(INK, 1.2));
    s += line(X(.67), Y(g.plate), X(L - .67), Y(g.plate), st(INK, 1.2));
    // webs (W trusses where the cut crosses them; truss ends seen at 24" o.c. where it runs along the ridge)
    if (tri || (g.type === 'shed' && axis === 'y')) { const nw = Math.max(2, Math.round(L / 7) * 2), zz = []; for (let i = 0; i <= nw; i++) { const s0 = L * i / nw; zz.push([X(s0), Y(i % 2 ? topAt(s0) - .05 : g.plate)]); } s += pline(zz, st(GREY, .7)); }
    else if (2 * k >= 4) for (let s0 = 2; s0 < L - 1; s0 += 2) s += line(X(s0), Y(g.plate), X(s0), Y(topAt(s0) - .05), st(GREY, .5));
    const ins = []; for (let i = 0; i <= 24; i++) { const s0 = .67 + (L - 1.34) * i / 24; ins.push([s0, Math.max(g.plate + .05, Math.min(g.plate + 1.1, topAt(s0) - .25))]); }
    s += hatch([[X(.67), Y(g.plate)], ...ins.map(([a, b]) => [X(a), Y(b)]), [X(L - .67), Y(g.plate)]], 'batt');
    if (oh > 0) s += R(-oh - .1, zE - .5, -oh, zE + .3, box('#fff', .8)) + R(L + oh, zE - .5, L + oh + .1, zE + .3, box('#fff', .8));
    for (const b of cols) s += R(b - .3, 0, b + .3, g.plate, fl(INK)) + R(b - .6, g.plate - .8, b + .6, g.plate, fl(INK)); // the steel beam line the trusses bear on
  }
  s += levelMarks(levelList(g), X(-oh - 3), X(L + oh + 3) + 6, Y);
  // keynotes, numbered as the side column lists them
  const KN = sectionNotes(t, d, g, stc), ks = KN.map(x => x[0]), at2 = (name, a, b) => { const i = ks.indexOf(name); if (i < 0) return ''; const x = X(a), y = Y(b), tx = x + 22, ty = y - 22; return line(x, y, tx, ty, st(INK, .7)) + circle(x, y, 1.8, fl(INK)) + poly([[tx, ty - 9], [tx + 9, ty], [tx, ty + 9], [tx - 9, ty]], box('#fff', 1)) + text(tx, ty, String(i + 1), 8.5, 'fill="#1b1e1f" text-anchor="middle" dominant-baseline="central" font-weight="700"'); };
  s += at2('Roofing', L * .28, topAt(L * .28) + .4) + at2('Roof structure', L * .42, flat ? g.plate - 1 : (g.plate + topAt(L * .42)) / 2) + at2('Insulation', L * .62, g.plate + (flat ? .2 : .5)) + at2('Exterior wall', .33, g.fh * .35) + at2('Floor', L * .55, g.fh - fd / 2) + at2('Slab', L * .7, -slabT / 2) + at2('Foundation', .5, -1.6);
  const rc = roomsOn(d, 1).find(r => ceilOf(t, g, r)); if (rc) s += at2('Ceiling', L * .8, ceilOf(t, g, rc));
  if (cols.length) s += at2('Columns', cols[0] + .3, g.fh * .6);
  s += dim(X(0), Y(-4.2), X(L), Y(-4.2), ftIn(L), 18, 9) + label(X(0), Y(-4.2) + 30, axis === 'y' ? 'FRONT' : 'LEFT', 8, 'font-weight="700"') + label(X(L), Y(-4.2) + 30, axis === 'y' ? 'BACK' : 'RIGHT', 8, 'font-weight="700"');
  // floor-to-floor and roof heights on the left
  const zs = [0, ...[...Array(g.F)].map((_, i) => (i + 1) * g.fh), g.top].filter((v, i, a) => i === 0 || v - a[i - 1] > .3);
  for (let i = 1; i < zs.length; i++) s += dim(X(-oh - 3), Y(zs[i]), X(-oh - 3), Y(zs[i - 1]), (zs[i] - zs[i - 1]) * k > 30 ? ftIn(zs[i] - zs[i - 1]) : '', 24, 8);
  return { body: s, w: (L + 2 * oh + 6) * k + SM.mL + SM.mR, h: (zTop - zBot) * k + SM.mT + SM.mB, cut: c };
}

// ---------- wall sections and details (drawn from shapes in feet: x through the wall, outside negative; z up) ----------
const DSCALES = [{ ft: 2 / 3, label: '1-1/2" = 1\'-0"' }, { ft: 1, label: '1" = 1\'-0"' }, { ft: 4 / 3, label: '3/4" = 1\'-0"' }, ...ARCH_SCALES];
const WOOD = HF('diag', box('#fff', .8), 6), CONC = HF('dots', box('#fff', .9), 9), BRK = HF('diag2', box('#fff', .8), 4.5), BATT = HF('batt', box('#fff', .6)), WHITE = box('#fff', .7), EARTH = HF('earth', fl('none'), 15), RIGID = HF('cross', box('#fff', .6));
function wallParts(kind, o) {
  const H = o.H, flat = !!o.flat, p = (o.p || 6) / 12, oh = flat ? 0 : o.oh ?? 1.5, R = 3.2, S = [], Lb = [], res = kind.startsWith('wood'), homes = o.res ?? res, tilt = kind === 'tilt', cmu = kind === 'cmu', pt = o.stc ? o.stc.foundation?.kind === 'pt-slab' : res;
  const r = (x0, z0, x1, z1, a) => S.push({ r: [x0, z0, x1, z1], a }), pg = (pts, a) => S.push({ p: pts, a }), ln = (pts, a) => S.push({ l: pts, a }), lab = (x, z, s2) => Lb.push({ x, z, s: s2 });
  const L = kind === 'wood-brick' ? [['brick', -.427, -.125], ['air', -.125, -.042], ['sheath', -.042, 0], ['stud', 0, .292], ['gyp', .292, .333]]
    : kind === 'wood-siding' ? [['siding', -.1, -.042], ['sheath', -.042, 0], ['stud', 0, .292], ['gyp', .292, .333]]
    : kind === 'stud' ? [['brick', -.427, -.125], ['air', -.125, -.042], ['sheath', -.042, 0], ['stud', 0, .458], ['gyp', .458, .51]]
    : cmu ? [['brick', -1.177, -.875], ['rigid', -.875, -.75], ['air', -.75, -.667], ['cmu', -.667, 0], ['furr', 0, .125], ['gyp', .125, .167]]
    : [['panel', -.771, 0], ['furr', 0, .167], ['gyp', .167, .208]];
  const xo = L[0][1], xi = L[L.length - 1][2], brick = L[0][0] === 'brick', jd = o.jd || 2, Hp = flat ? H + 3 : H, struct = L.find(l => ['stud', 'cmu', 'panel'].includes(l[0])), xmin = Math.min(xo, -oh) - .9;
  const LT = { brick: 'Brick veneer, galv. ties @ 16" o.c. each way, weeps @ 33" o.c. over through-wall flashing', air: '1" air space (2" with rigid insulation)', sheath: '7/16" OSB wood structural panel sheathing (the shear walls) + WRB, taped seams',
    stud: homes ? '2x4 studs @ 16" o.c., R-13 batts (2x6 / R-19 where noted)' : '2x6 wood studs @ 16" o.c., R-19 batts', gyp: homes ? '1/2" gyp. bd., painted' : '5/8" gyp. bd., painted', siding: 'Fiber cement lap siding, 7" exposure, on WRB',
    panel: '9-1/4" concrete tilt-wall panel, painted both faces', furr: tilt ? 'Furring, R-7.5 rigid insulation at conditioned rooms' : 'Furring + R-7.5 rigid insulation', cmu: '8" CMU, grouted and reinforced cells per structural', rigid: '1-1/2" rigid insulation, R-7.5 c.i.' };
  // ground, slab, foundation
  const gz = res ? -.67 : -.5, slabT = pt ? .33 : tilt ? .5 : .42;
  r(xmin, -3.6, R, gz, EARTH); r(xo, -3.6, R, -slabT, EARTH); ln([[xmin, gz], [xo - .05, gz]], st(INK, 1.8));
  lab(xmin + .3, gz + .02, 'Finish grade, 6" fall in the first 10\'-0" away from the wall');
  if (tilt) { r(-1.6, -3.4, 1, -2.4, CONC); r(0, -slabT, R, 0, CONC); ln([[2, -slabT], [2, 0]], st(INK, .8, 'stroke-dasharray="3 2"')); lab(.4, -2.9, 'Grade beam / continuous footing under the panels, size per structural'); lab(1.2, -.25, '6" slab on grade, 4,000 psi, 15 mil vapor retarder; pour-back strip at panels'); }
  else {
    const bo = xo - .04, bi = res ? .75 : 1, bd = res ? -2.33 : -2.5, lz = brick ? -.33 : 0, lx = brick ? -.042 : bo;
    pg([[bo, bd], [bo, lz], [lx, lz], [lx, 0], [R, 0], [R, -slabT], [bi + .35, -slabT], [bi, bd]], CONC);
    ln([[bi + .35, -slabT - .03], [R, -slabT - .03]], st(INK, .8, 'stroke-dasharray="5 3"'));
    if (res) ln([[.3, -slabT / 2], [R, -slabT / 2]], st(INK, .8, 'stroke-dasharray="9 3"'));
    for (const [a, b] of [[bo + .25, bd + .25], [bi - .2, bd + .25], [bo + .25, -.7], [bi - .05, -.7]]) S.push({ c: [a, b, .045], a: fl(INK) });
    lab((bo + bi) / 2, bd + .6, 'Grade beam' + (brick ? ' with brick ledge' : '') + ', size and steel per structural'); lab(1.6, -slabT / 2, pt ? '4" post-tensioned slab, tendons per PT supplier' : '5" reinforced slab on grade, 4,000 psi'); lab(2.4, -slabT - .03, (pt ? '10' : '15') + ' mil vapor retarder over select fill');
  }
  // the wall's layers
  const zc = x => H + .5 + x * p, zs = flat ? 0 : zc(-oh) - .45;
  L.forEach(([nm, x0, x1], i) => {
    const zb = nm === 'brick' ? -.33 : nm === 'panel' ? -2.4 : nm === 'siding' ? -.2 : 0;
    const zt = flat ? (['gyp', 'furr'].includes(nm) ? H - jd - .4 : Hp - (['brick', 'rigid', 'air'].includes(nm) ? .25 : 0)) : (['brick', 'air', 'siding'].includes(nm) ? zs : nm === 'gyp' ? H - .05 : H);
    r(x0, zb, x1, zt, { brick: BRK, air: WHITE, sheath: fl(INK), stud: BATT, gyp: WHITE, siding: WHITE, panel: CONC, furr: BATT, cmu: HF('diag', box('#fff', .8), 7), rigid: RIGID }[nm]);
    lab((x0 + x1) / 2, 1.2 + i * .4, LT[nm]);
  });
  if (kind === 'wood-siding') { const zz = []; for (let z = -.2; z < zs; z += .58) zz.push([-.042, z], [-.1, z + .02], [-.06, z + .58]); ln(zz, st(INK, .6)); }
  if (struct && struct[0] === 'stud') { r(0, 0, struct[2], .125, WOOD); r(0, (flat ? Hp : H) - .25, struct[2], flat ? Hp : H, WOOD); lab(struct[2] / 2, (flat ? Hp : H) - .12, flat ? 'Double top plate, blocking for the coping' : 'Double top plate'); }
  // roof
  if (!flat) {
    r(0, H, R, H + .29, WOOD); pg([[-oh, zc(-oh)], [R, zc(R)], [R, zc(R) + .4], [-oh, zc(-oh) + .4]], WOOD); pg([[-oh, zc(-oh) + .4], [R, zc(R) + .4], [R, zc(R) + .47], [-oh, zc(-oh) + .47]], fl(INK));
    ln([[-oh - .05, zc(-oh) + .53], [R, zc(R) + .53]], st(INK, 2)); r(.05, H + .29, .2, zc(.125), WOOD);
    r(-oh - .1, zc(-oh) - .45, -oh, zc(-oh) + .45, WOOD); r(-oh, zs - .05, xo, zs, WHITE);
    ln([[-oh - .1, zc(-oh) + .25], [-oh - .15, zc(-oh) - .25], [-oh - .6, zc(-oh) - .25], [-oh - .65, zc(-oh) + .3]], st(INK, 1));
    const ins = []; for (let i = 0; i <= 16; i++) { const x = .35 + (R - .35) * i / 16; ins.push([x, Math.min(H + .29 + 1.1, zc(x) - .15)]); }
    pg([[.35, H + .29], ...ins, [R, H + .29]], HF('batt', fl('none'))); ln([[.2, zc(.2) - .12], [2.2, zc(2.2) - .12]], st(INK, .8)); r(xi, H - .05, R, H, WHITE);
    lab(R - .6, zc(R - .6) + .5, o.roofing ? o.roofing + ' on synthetic underlayment' : 'Architectural shingles on synthetic underlayment'); lab(R - 1.2, zc(R - 1.2) + .43, '7/16" OSB roof sheathing with radiant barrier');
    lab(R - 1.6, zc(R - 1.6) + .1, (o.stc?.roof?.text || 'Pre-engineered wood roof trusses at 24" o.c.') + ', hurricane tie at each bearing'); lab(1.9, H + .8, 'R-38 blown insulation (R-49 under 2021 IECC); vent baffle at eave');
    lab(-oh - .05, zc(-oh), 'Fascia, vented soffit, 6" seamless gutter'); lab(R - .4, H - .03, homes ? '1/2" gyp. bd. ceiling' : '5/8" gyp. bd. ceiling');
  } else {
    const xin = struct ? struct[2] : 0, xst = struct ? struct[1] : xo, zj = H - .125;
    r(xin, zj, R, H, fl(INK)); r(xin + .3, zj - .2, R, zj, WOOD); r(.6, zj - jd, R, zj - jd + .2, WOOD); const zz = []; for (let x = .6, i = 0; x <= R; x += .8, i++) zz.push([x, i % 2 ? zj - .2 : zj - jd + .2]); ln(zz, st(GREY, .9));
    if (tilt || cmu) pg([[0, zj - .2], [.3, zj - .2], [.3, zj - .25], [.05, zj - .25], [.05, zj - .55], [0, zj - .55]], fl(INK));
    r(xin, H, R, H + .42, RIGID); ln([[xin + .02, Hp - .3], [xin + .02, H + .45], [R, H + .45]], st(INK, 1.8)); pg([[xin, H + .42], [xin + .35, H + .42], [xin, H + .77]], WOOD);
    r(xst, Hp, xin, Hp + .17, WOOD); ln([[xin + .12, Hp - .35], [xin + .12, Hp + .26], [xo - .1, Hp + .26], [xo - .1, Hp - .3], [xo - .02, Hp - .38]], st(INK, 1.8));
    lab(R - .4, H + .45, (o.roofing || 'TPO membrane') + ' on cover board'); lab(R - .8, H + .2, 'R-25 c.i. polyiso, tapered 1/4":12 min.'); lab(R - .3, H - .06, '1-1/2" 22 ga. steel roof deck'); lab(R - .5, zj - jd / 2, (o.stc?.roof?.text || 'Open-web steel joists') + ', depth per structural');
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
  const rr = (x0, z0, x1, z1, a) => rectH(X(x0), Y(z1), (x1 - x0) * k, Y(z0) - Y(z1), a);
  let s = '';
  for (const sh of P.S) {
    if (sh.r) { let [x0, z0, x1, z1] = sh.r; if (brk && z0 < brk[0] && z1 > brk[1]) s += rr(x0, z0, x1, brk[0], sh.a) + rr(x0, brk[1], x1, z1, sh.a); else if (!(brk && z0 >= brk[0] && z1 <= brk[1])) { if (brk && z0 > brk[0] && z0 < brk[1]) z0 = brk[1]; if (brk && z1 > brk[0] && z1 < brk[1]) z1 = brk[0]; if (z1 > z0) s += rr(x0, z0, x1, z1, sh.a); } }
    else if (sh.p) s += polyH(sh.p.map(([x, z]) => [X(x), Y(z)]), sh.a);
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
const wallTitle = { 'wood-brick': 'Wall section — wood frame, brick veneer', 'wood-siding': 'Wall section — wood frame, lap siding', tilt: 'Wall section — concrete tilt-wall', cmu: 'Wall section — CMU with brick veneer', stud: 'Wall section — wood stud with veneer' };
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
  const { t, d, f } = look(ctx, sheet); if (!d) return noDesign(sheet, t);
  const g = f.height, stc = f.structure, mk = axis => ({ axis, wf: sectionCut(d, axis).L + 2 * (axis === 'x' && d.attached ? 0 : g.oh) + 6, hf: g.top + 6.5, mw: SM.mL + SM.mR, mh: SM.mT + SM.mB + TITLE });
  const C = mk('y'), Lg = mk('x'), bw = toPx(MAIN.w), bh = toPx(MAIN.h), bp = bestPair(C, Lg, bw, bh), ka = DPI / bp.sa.ft, kb = DPI / bp.sb.ft;
  const da = sectionView(t, d, g, 'y', ka, stc), db = sectionView(t, d, g, 'x', kb, stc), ha = da.h + TITLE, hb = db.h + TITLE;
  const pa = bp.lay === 'stack' ? { x: (bw - da.w) / 2, y: (bh - ha - hb) / 3 } : { x: (bw - da.w - db.w) / 3, y: (bh - ha) / 2 }, pb = bp.lay === 'stack' ? { x: (bw - db.w) / 2, y: pa.y * 2 + ha } : { x: pa.x * 2 + da.w, y: (bh - hb) / 2 };
  const html = placed(pa, da, 1, 'Cross section (front to back)', bp.sa.label) + placed(pb, db, 2, 'Longitudinal section (left to right)', bp.sb.label);
  sheet.scale = 'As noted';
  const kind = wallKind(t, d, stc), sw = toPx(SIDE_W), wd = wallDetail(kind, { H: g.plate, flat: g.type === 'flat', p: g.p, oh: g.oh, roofing: roofing(d, g), ceiling: roomsOn(d, g.F).some(r => ceilOf(t, g, r)), stc, res: isRes(t) }, sw, toPx(AREA.h) * .44);
  const KN = sectionNotes(t, d, g, stc);
  return html + side(svg(wd.w, wd.h, wd.body) + '<div style="margin:4pt 0 10pt">' + viewTitle(3, wallTitle[kind] + ' (typical, full height, broken)', wd.scale) + '</div>' +
    table('Section keynotes', ['No.', 'Item', 'Description'], KN.map((x, i) => [String(i + 1), x[0], x[1]])) +
    '<div class="blk" data-heights="' + g.buildingHeight + '|' + g.fireAccessHeight + '">' + table('Heights the code counts', null, heightRows(g), [1]) + '</div>' +
    notes('Notes', ['Sections are cut through the middle of the building, nudged off wall lines' + (isCor(t) ? ' and through a unit on each side of the corridor' : '') + '; see the floor plans for where rooms fall.', 'Structure as the structural sheets show it: ' + stc.summary + '. Sizes, spacing and connections by the structural engineer.',
      'Energy: IECC climate zone 2A prescriptive values shown; confirm the edition the jurisdiction has adopted.', g.type !== 'flat' ? 'Attic ventilation 1/150 of the attic floor (1/300 with balanced high/low vents), ' + (isRes(t) ? 'IRC R806.' : 'IBC 1202.2.1.') : 'Roof slope 1/4":12 min. to drains (IBC 1502 / 1507.12); secondary overflow drainage required.', jogNote(t, d)]));
}

function aDetails(ctx, sheet) {
  sheet.scale = 'As noted';
  // one wall section for each wall and roof framing the set's types use, drawn with that type's structure (so a clubhouse
  // with a pitched roof is shown on wood trusses, as its framing plan frames it)
  const combos = [], add = c => { const k = c.k + '|' + c.flat; const x = combos.find(q => q.key === k); if (x) x.ids.push(c.id); else combos.push({ ...c, key: k, ids: [c.id] }); }; let flatAny = false, resAny = false, comAny = false;
  const srow = [];
  for (const t of (ctx.types || []).filter(t => t.supported !== false)) {
    const d = ctx.designs?.[t.id]; if (!d?.rooms?.length) continue;
    const f = factsOf(ctx, t, d), g = f.height, stc = f.structure, k = wallKind(t, d, stc), flat = g.type === 'flat';
    add({ k, flat, id: t.id, stc, res: isRes(t), H: Math.min(g.plate, flat ? 18 : g.fh || 9), p: g.p, oh: g.oh });
    if (isRes(t)) resAny = true; else comAny = true; if (flat) flatAny = true;
    srow.push(['Type ' + t.id, stc.foundation.text, stc.walls.text, stc.floor?.text || '—', stc.roof.text + (stc.columns ? '; ' + stc.columns.text : '')]);
  }
  if (!combos.length) add({ k: 'wood-brick', flat: false, id: '', stc: null, res: true, H: 9, p: 6, oh: 1.5 });
  const typical = c => c.flat ? { H: Math.max(10, c.H), flat: true, ceiling: c.k !== 'tilt', stc: c.stc, res: c.res } : { H: Math.max(8, c.H), flat: false, p: c.p || 6, oh: c.oh ?? 1.5, stc: c.stc, res: c.res };
  // two rows: the wall sections (and the parapet when there's room) on top, the smaller details below
  const row1 = combos.slice(0, 4).map(c => ({ kind: 'wall', c })), row2 = [], pc = combos.find(c => c.flat), par = pc ? { kind: 'parapet', c: pc } : null;
  if (par) (row1.length < 3 ? row1 : row2).push(par);
  row2.push({ kind: 'slab', c: combos.find(c => c.res) || combos[0] }, { kind: 'door' }, { kind: 'window' });
  const rh = [toPx(MAIN.h) * .52, toPx(MAIN.h) * .48], boxes = [...row1.map((b, i) => ({ ...b, row: 0, i, n: row1.length })), ...row2.map((b, i) => ({ ...b, row: 1, i, n: row2.length }))];
  const ids = c => c.ids.filter(Boolean).length ? ' (Type' + (c.ids.length > 1 ? 's ' : ' ') + c.ids.join(', ') + ')' : '';
  let html = '';
  boxes.forEach((b, i) => {
    const bw = toPx(MAIN.w) / b.n, bh = rh[b.row] - TITLE - 10, x = MAIN.x + toPt(b.i * bw), y = MAIN.y + (b.row ? toPt(rh[0]) : 0);
    let body = '', w = 0, h = 0, title = '', scale = '';
    if (b.kind === 'wall' || b.kind === 'parapet' || b.kind === 'slab') {
      const o = typical(b.c), P = wallParts(b.c.k, o), crop = b.kind === 'parapet' ? { z0: o.H - 3.6, z1: P.zmax } : b.kind === 'slab' ? { z0: -3.6, z1: 2.4 } : null;
      const s = fitDetail(P.xmax - P.xmin, partsH(P, crop || {}), bw - 290, bh - 10, b.kind === 'wall' ? DSCALES.slice(2) : DSCALES), dr = drawParts(P, s.k, { labelW: 270, ...(crop || {}) });
      body = svg(dr.w, dr.h, dr.body); w = dr.w; h = dr.h; scale = s.label; title = (b.kind === 'wall' ? wallTitle[b.c.k] + (b.c.flat ? ', steel joist roof' : ', wood truss roof') : b.kind === 'parapet' ? 'Parapet and roof edge' : 'Slab edge at exterior wall') + ids(b.c);
    } else {
      const parts = hjsParts(b.kind, comAny && !resAny), each = (bh - 30) / 3, k = DPI / (fitDetail(2.6, 2.5, bw - 280, each - 24).ft);
      parts.forEach(([nm, P]) => { const dr = drawParts(P, k, { labelW: 260, size: 9.5 }); body += '<div style="font:700 8pt Arial;text-transform:uppercase;margin:2pt 0">' + esc(nm) + '</div>' + svg(dr.w, dr.h, dr.body); w = Math.max(w, dr.w); h += dr.h + 16; });
      scale = DSCALES.find(s2 => Math.abs(DPI / s2.ft - k) < .01)?.label || '1-1/2" = 1\'-0"'; title = b.kind === 'door' ? 'Exterior door head, jamb and sill' : 'Window head, jamb and sill';
    }
    html += at(x + 6, y, toPt(bw) - 12, toPt(bh), body, 'display:flex;flex-direction:column;justify-content:center') + at(x + 6, y + toPt(bh) + 4, toPt(bw) - 12, 40, viewTitle(i + 1, title, scale));
  });
  const def = ['Details are typical for the construction types in this set; the architect and structural engineer of record complete them in design development.', 'Flash every opening: sill pan first, jamb flashing over the fin, head flashing last, lapped shingle fashion over the WRB.',
    'Brick veneer: ties at 16" o.c. each way (max. 2.67 sf per tie), weep holes at 33" o.c. over through-wall flashing at the base and every lintel (IRC R703.8 / TMS 402).',
    'Slab and foundation per the structure table and the geotechnical report; vapor retarder lapped 6" and taped; slab 6" min. above finish grade.', 'Air barrier continuous across walls, roof and openings; seal all penetrations (IECC R402.4 / C402.5).',
    'Fenestration U ≤ 0.40, SHGC ≤ 0.25 (IECC climate zone 2A).', flatAny ? 'Low-slope roofs: 1/4":12 min. slope, secondary (overflow) drainage, membrane turned up 8" min. at parapets.' : ''];
  const nn = discNotes(ctx, 'arch');
  return html + side((srow.length ? '<div style="font-size:7.4pt" class="ar-st">' + table('Structure by building type (as the structural sheets frame it)', ['Type', 'Foundation', 'Walls', 'Floors', 'Roof'], srow) + '</div><style>.ar-st table{font-size:7.2pt}.ar-st td{padding:1.4pt 3pt}</style>' : '') +
    notes('Detail notes', def) + (nn.length ? notes('Architectural notes', nn) : '') + '<div class="blk"><div class="bh">Material hatches</div>' +
    legendRow(rectH(4, 3, 36, 12, BRK), 'Brick / masonry veneer') + legendRow(rectH(4, 3, 36, 12, CONC), 'Concrete (cut)') + legendRow(rectH(4, 3, 36, 12, WOOD), 'Wood framing (cut)') + legendRow(rectH(4, 3, 36, 12, BATT), 'Batt insulation') +
    legendRow(rectH(4, 3, 36, 12, RIGID), 'Rigid insulation') + legendRow(rectH(4, 3, 36, 12, EARTH), 'Earth / fill') + '</div>');
}

// ---------- schedules ----------
const DT = { swing: 'Single swing', double: 'Pair', sliding: 'Sliding', pocket: 'Pocket', overhead: 'Overhead sectional', storefront: 'Storefront entrance', opening: 'Cased opening' };
function doorRow(t, d, dr, byId, o = {}) {
  const a = byId.get(dr.a), b = dr.b === 'outside' ? null : byId.get(dr.b), res = isRes(t), types = [a?.type, b?.type];
  const loc = (a?.name || dr.a) + ' → ' + (b ? b.name : 'Exterior (' + (dr.side || '') + ')'), garageHouse = res && !dr.exterior && types.includes('garage') && types.some(x => x && x !== 'garage');
  const wet = types.some(x => ['bath', 'half_bath', 'restroom'].includes(x)), stair = !res && !dr.exterior && types.includes('stair') && (d.floors || 1) > 1, hgt = dr.kind === 'storefront' ? 7 : doorH(t, dr);
  const mat = dr.kind === 'opening' ? '—' : dr.kind === 'overhead' ? 'Insulated steel sectional' : dr.kind === 'storefront' ? 'Aluminum / 1" insulated tempered glass' : dr.kind === 'sliding' ? (dr.exterior ? 'Vinyl / aluminum, tempered low-E glass' : 'Hollow core slider') : res ? (dr.exterior || garageHouse ? (garageHouse ? 'Solid core wood / steel' : 'Fiberglass, insulated') : 'Hollow core, molded panel') : dr.exterior ? 'Insulated hollow metal in HM frame' : 'Solid core wood in HM frame';
  const hw = dr.kind === 'opening' ? '—' : dr.kind === 'overhead' ? (res ? 'Opener with reversing sensors' : 'Motor operator, weather seals') : res ? (dr.exterior ? 'Entry lockset + deadbolt, threshold, weatherstripping' : garageHouse ? 'Entry lockset, deadbolt, self-closing hinges' : wet || types.some(x => /bedroom/.test(x || '')) ? 'Privacy lever' : 'Passage lever')
    : dr.exterior ? (/^A/.test(t.occupancy || '') ? 'Panic hardware (IBC 1010.2.9), closer, threshold' : 'Exit device / lever lockset, closer, threshold') : wet ? 'Privacy lock with indicator, closer, kick plate' : stair ? 'Closer, latch, positive latching' : 'Lever lockset (TAS 404)';
  const elev = types.includes('elevator'), trash = !res && types.includes('trash'), tenant = o.facts && [a, b].some(r => byTenant(o.facts, r));
  const rate = garageHouse ? '20-min / solid core, self-closing, IRC R302.5.1' : stair ? '60-min, closer (IBC 716, 1023)' : elev ? '60-min hoistway door (IBC 716, 3006)' : trash ? '45-min, self-closing (chute access room, IBC 713.13)' : '—';
  if (tenant) return [dr.id, loc, ftIn(dr.width) + ' × ' + ftIn(hgt), DT[dr.kind] || dr.kind, 'By tenant', 'By tenant', '—'];
  return [dr.id, loc, ftIn(dr.width) + ' × ' + ftIn(hgt), DT[dr.kind] || dr.kind, elev ? 'By the elevator maker' : mat, elev ? 'By the elevator maker' : hw, rate];
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
const sch = (title, attr, head, rows, right = []) => '<div class="bh">' + esc(title) + '</div><div data-sched="' + attr + '">' + table('', head, rows, right) + '</div>';
const SCHED_CSS = '<style>.ar-s table{font-size:7.4pt}.ar-s td,.ar-s th{padding:1.4pt 3.5pt}.ar-s .bh{margin-top:8pt}</style>';
function aSched(ctx, sheet) {
  const { t, d, f } = look(ctx, sheet); if (!d) return noDesign(sheet, t);
  sheet.scale = 'N.T.S.';
  if (isCor(t)) return corSched(ctx, t, d, f);
  const g = f.height, byId = new Map(d.rooms.map(r => [r.id, r])), doors = d.doors || [], wins = d.windows || [], rooms = d.rooms.slice().sort((a, b) => a.floor - b.floor || a.y - b.y || a.x - b.x);
  // a shell lists the landlord's finishes only; the rooms of the typical tenant layout are the tenants' to finish
  const shell = f.scope.kind === 'shell', ten = rooms.filter(r => byTenant(f, r)), land = rooms.filter(r => !byTenant(f, r));
  const res = isRes(t), def = [shell ? 'Shell: the finish schedule is the landlord’s work; suites are finished by their tenants. ' + f.scope.text : '', 'Door sizes are nominal leaf sizes; frames, hardware sets and finishes are confirmed in design development.', res ? 'Interior doors 6\'-8" (8\'-0" where ceilings are 10\'-0" or higher, by owner choice).' : 'Doors on accessible routes: 32" min. clear, 18" pull-side latch clearance, 5 lbf max. opening force (TAS 404).',
    'Windows: U ≤ 0.40 and SHGC ≤ 0.25 (IECC climate zone 2A); NFRC labels required.', res ? 'Every bedroom window meets emergency escape (IRC R310): 5.7 sf net clear, 24" high, 20" wide, sill ≤ 44" above the floor.' : 'Storefront glazing within 24" of doors and below 60" is tempered (IBC 2406.4).',
    'Finishes are a schematic basis for pricing; owner selections replace them.', 'Ceiling heights are above the finished floor.'];
  const fr = land.map(r => finishRow(t, g, r)).concat(ten.length ? [['Tenant layout rooms (' + ten.length + ')', [...new Set(ten.map(r => r.floor))].join(', '), f0(ten.reduce((a, r) => a + r.area, 0)), 'By tenant', 'By tenant', 'By tenant', 'By tenant', '—']] : []);
  const A1 = sch('Door schedule (' + doors.length + ')', 'doors', ['Mark', 'From → to', 'Size W × H', 'Type', 'Material', 'Hardware', 'Fire rating'], doors.map(dr => doorRow(t, d, dr, byId, { facts: f }))) +
    sch('Window schedule (' + wins.length + ')', 'windows', ['Mark', 'Room', 'Size W × H', 'Type', 'Sill', 'Head', 'Energy', 'Notes'], wins.map(w => windowRow(t, d, w, byId)));
  const A2 = sch('Room finish schedule (' + fr.length + (shell ? ', landlord work' : '') + ')', 'finishes', ['Room', 'Fl.', 'Area', 'Floor', 'Base', 'Walls', 'Ceiling', 'Clg. ht.'], fr, [2]) + notes('Schedule notes', def);
  // about 13 pt a row at this size: two side-by-side columns when both halves fit, else three flowing columns
  const two = (doors.length + wins.length) * 13 + 90 <= AREA.h && fr.length * 13 + 260 <= AREA.h;
  const body = two ? '<div class="ar-s" style="display:flex;gap:26pt;height:' + AREA.h + 'pt"><div style="flex:1.1;min-width:0">' + A1 + '</div><div style="flex:1;min-width:0">' + A2 + '</div></div>'
    : '<div class="ar-s" style="column-count:3;column-gap:22pt;column-fill:auto;height:' + AREA.h + 'pt">' + A1 + A2 + '</div>';
  return at(AREA.x, AREA.y, AREA.w, AREA.h, SCHED_CSS + body);
}
// apartments: the unit mix, the building's doors (unit entries a row a floor, unit doors by plan type), the unit window
// types and the finishes of the units and the common rooms
const UNIT_FIN = { kitchen: ['LVP (luxury vinyl plank)', 'Painted MDF', 'Painted gyp. bd.; tile backsplash', 'Painted gyp. bd.'], bath: ['Porcelain tile', 'Tile / painted MDF', 'MR gyp. bd.; tile at tub / shower on cement board', 'MR gyp. bd., semi-gloss'],
  bedroom: ['Carpet on pad', 'Painted MDF 5-1/4"', 'Painted gyp. bd.', '5/8" Type X gyp. bd. (rated ceiling), painted'], living: ['LVP (luxury vinyl plank)', 'Painted MDF 5-1/4"', 'Painted gyp. bd.', '5/8" Type X gyp. bd. (rated ceiling), painted'],
  laundry: ['LVP', 'Painted MDF', 'Painted gyp. bd.', 'Painted gyp. bd.'], closet: ['Carpet / LVP', 'Painted MDF', 'Painted gyp. bd.', 'Painted gyp. bd.'], hall: ['LVP', 'Painted MDF', 'Painted gyp. bd.', 'Painted gyp. bd.'], entry: ['LVP', 'Painted MDF', 'Painted gyp. bd.', 'Painted gyp. bd.'],
  corridor: ['Carpet tile', 'Rubber 4"', 'Painted gyp. bd. (1/2-hr corridor walls)', 'Gyp. bd., painted'], lobby: ['Porcelain tile', 'Tile', 'Painted gyp. bd., accent wall', 'Gyp. bd. / ACT'], mail: ['Porcelain tile', 'Tile', 'Painted gyp. bd.', 'ACT 2x2'],
  stair: ['Rubber treads on steel pans', 'Rubber', 'Painted gyp. bd. (1-hr enclosure)', 'Painted gyp. bd.'], elevator: ['Cab by the elevator maker', '—', 'Cab by the elevator maker', 'Cab by the elevator maker'], trash: ['Sealed concrete', 'Rubber 4"', 'Painted gyp. bd. (1-hr)', 'Painted gyp. bd.'],
  electrical: ['Sealed concrete', 'Rubber 4"', 'Painted gyp. bd.', 'Open to structure'], mechanical: ['Sealed concrete', 'Rubber 4"', 'Painted gyp. bd.', 'Open to structure'], office: ['Carpet tile', 'Rubber 4"', 'Painted gyp. bd.', 'ACT 2x2'] };
const unitFinKey = ty => ['primary_bedroom', 'bedroom'].includes(ty) ? 'bedroom' : ['bath', 'half_bath'].includes(ty) ? 'bath' : ['closet', 'walk_in_closet', 'pantry'].includes(ty) ? 'closet' : UNIT_FIN[ty] ? ty : 'living';
function entryDoors(d) {
  const byR = new Map(d.rooms.map(r => [r.id, r])), out = new Map();
  for (const x of d.doors || []) { const A = byR.get(x.a), B = byR.get(x.b); if ((A?.unit && B?.type === 'corridor') || (B?.unit && A?.type === 'corridor')) out.set(x, A?.unit ? A : B); }
  return out;
}
// door numbers as runs: 106–108, 111, 116–121
const idRuns = ids => { const n = ids.map(Number).filter(Number.isFinite).sort((a, b) => a - b), out = []; for (let i = 0; i < n.length; i++) { let j = i; while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++; out.push(j > i ? n[i] + '–' + n[j] : String(n[i])); i = j; } return out.join(', ') || ids.join(', '); };
function corSched(ctx, t, d, f) {
  const g = f.height, byId = new Map(d.rooms.map(r => [r.id, r])), P = d.unitPlans || {}, mix = d.corridor?.mix || [], n = t.count || 1, hotel = t.use === 'hotel', U = hotel ? 'Room' : 'Unit';
  const mixRows = mix.map(m => [m.code, m.name, String(m.beds), String(P[m.code]?.baths ?? '—'), P[m.code] ? ftIn(P[m.code].w) + ' × ' + ftIn(P[m.code].d) : '—', f0(m.sf), String(m.per), String(m.per * n)])
    .concat([['Total', '', '', '', '', f0(mix.reduce((a, m) => a + m.sf * m.per, 0)) + ' net', String(mix.reduce((a, m) => a + m.per, 0)), String(mix.reduce((a, m) => a + m.per, 0) * n)]]);
  const ent = entryDoors(d), bldg = (d.doors || []).filter(x => !ent.has(x)), rows = bldg.map(dr => doorRow(t, d, dr, byId));
  for (let fl = 1; fl <= g.F; fl++) { const es = [...ent].filter(([x]) => x.floor === fl).map(([x]) => x); if (!es.length) continue;
    rows.push([idRuns(es.map(x => x.id)), U + ' entries, floor ' + fl + ' (' + es.length + ') → corridor', "3'-0\" × 6'-8\"", 'Single swing', 'Solid core wood in HM frame, labeled', 'Lockset + deadbolt, closer (self-closing), viewer, kick plate', '20-min, self-closing (IBC Table 716.1(2): 1/2-hr corridor)']); }
  for (const p of Object.values(P)) { const inner = (p.doors || []).filter(x => x.b !== 'corridor'), sw = inner.filter(x => x.kind !== 'opening'), op = inner.length - sw.length, per = mix.find(m => m.code === p.code)?.per || 0;
    if (inner.length) rows.push([p.code + '-x', 'Inside ' + U.toLowerCase() + ' ' + p.code + ': ' + sw.length + ' door' + (sw.length === 1 ? '' : 's') + (op ? ' + ' + op + ' cased opening' + (op > 1 ? 's' : '') : '') + ' a unit × ' + per, "3'-0\" × 6'-8\"" + (op ? ' / openings' : ''), 'Single swing' + (op ? ' / cased opening' : ''), 'Hollow core, molded panel', 'Privacy lever (bath, bedroom), passage lever', '—']); }
  const wm = winMarks(d), all = allWins(t, d), byMark = new Map();
  for (const w of all) { const m = wm.of(w) || w.id || '—', rn = (w.lroom || w.room || '').split(':').pop(); if (!byMark.has(m)) byMark.set(m, { w, n: 0, rooms: new Set(), codes: new Set() }); const x = byMark.get(m); x.n++; const ur = byId.get(w.unit); if (ur?.unit) { const pr = P[ur.unit.code]?.rooms.find(q => q.id === rn); x.rooms.add(pr?.name || rn); x.codes.add(ur.unit.code); } }
  const winRows = [...byMark].map(([m, x]) => [m, [...x.rooms].join(', ') + (x.codes.size ? ' (' + [...x.codes].sort().join(', ') + ')' : ''), ftIn(x.w.width) + ' × ' + ftIn(x.w.height), 'Single-hung, vinyl, low-E', ftIn(fin(x.w.sill)), ftIn(fin(x.w.sill) + fin(x.w.height)), String(x.n), 'U ≤ 0.40 / SHGC ≤ 0.25; ' + (f.sprinkler?.on ? 'emergency escape openings not required, sprinklered (IBC 1031.1 exc. 1)' : 'bedroom windows are emergency escape openings (IBC 1031)')]);
  const seen = new Map(); for (const r of d.rooms.filter(r => r.type !== 'unit')) if (!seen.has(r.name)) seen.set(r.name, r);
  const ut = new Map(); for (const p of Object.values(P)) for (const r of p.rooms) { const k = unitFinKey(r.type); if (!ut.has(k)) ut.set(k, new Set()); ut.get(k).add(r.name); }
  const fr = [...[...seen.values()].map(r => [r.name, [...new Set(d.rooms.filter(q => q.name === r.name).map(q => q.floor))].join(', '), ...(UNIT_FIN[r.type] || UNIT_FIN.office), ftIn(ceilOf(t, g, r)) === "0'-0\"" ? 'Open' : ftIn(ceilOf(t, g, r))]),
    ...[...ut].map(([k, names]) => [U + 's: ' + [...names].join(', '), 'All', ...UNIT_FIN[k], ftIn(ceilOf(t, g, { type: k === 'living' ? 'living' : k, floor: 1 }))])];
  const def = ['Unit entry doors: 20-minute, self-closing and latching, smoke- and draft-control gasketing (IBC 716.2.2.1); 32" clear.', 'Stair and shaft doors: 60-minute, self-closing, positive latching; stair doors with panic-free lever hardware, never locked from the stair side against egress.',
    'Accessibility: every unit an FHA Type B unit where an elevator serves it; Accessible (Type A) units per IBC 1107.6.2 (2% min.) and TAS where public funds apply.', 'Windows: U ≤ 0.40 and SHGC ≤ 0.25 (IECC climate zone 2A); fall protection where a sill is under 36" and 72" above grade (IBC 1015.8).',
    'Finishes are a schematic basis for pricing; owner selections replace them.', 'Ceiling heights are above the finished floor.'];
  const body = sch(U + ' mix schedule (' + mix.reduce((a, m) => a + m.per, 0) + ' a building × ' + n + ')', 'mix', ['Code', 'Type', 'Beds', 'Baths', 'Size', 'SF', 'Bldg', 'All'], mixRows, [2, 3, 5, 6, 7]) +
    sch('Door schedule', 'doors', ['Mark', 'From → to', 'Size W × H', 'Type', 'Material', 'Hardware', 'Fire rating'], rows) +
    sch('Window schedule (' + all.length + ' a building)', 'windows', ['Mark', 'Rooms', 'Size W × H', 'Type', 'Sill', 'Head', 'No.', 'Notes'], winRows, [6]) +
    sch('Finish schedule — ' + U.toLowerCase() + 's and common rooms', 'finishes', ['Room', 'Fl.', 'Floor', 'Base', 'Walls', 'Ceiling', 'Clg. ht.'], fr) + notes('Schedule notes', def);
  return at(AREA.x, AREA.y, AREA.w, AREA.h, SCHED_CSS + '<div class="ar-s ar-s2" style="column-count:3;column-gap:22pt;column-fill:balance;height:' + AREA.h + 'pt">' + body + '</div><style>.ar-s [data-sched] table tr{break-inside:avoid}.ar-s2 table{font-size:8.6pt}.ar-s2 td,.ar-s2 th{padding:2.2pt 4pt}.ar-s2 ol{font-size:9pt}</style>');
}

// ---------- life safety ----------
// IBC 2021 limits by occupancy group, [not sprinklered, sprinklered]: exit access travel distance (Table 1017.2; R-2
// with NFPA 13R counts as sprinklered), common path of egress travel (Table 1006.2.1), dead-end corridors (1020.5)
const grp = t => { const o = t.occupancy || 'B'; return /^A/.test(o) ? 'A' : /^R/.test(o) ? 'R' : /^S-2/.test(o) ? 'S-2' : /^S/.test(o) ? 'S-1' : ['M', 'E', 'B'].includes(o) ? o : /^F/.test(o) ? 'S-1' : 'B'; };
const TRAVEL = { A: [200, 250], M: [200, 250], 'S-1': [200, 250], R: [200, 250], B: [200, 300], E: [200, 250], 'S-2': [300, 400] };
const COMMON = { A: [75, 75], M: [75, 75], E: [75, 75], R: [75, 125], B: [100, 100], 'S-1': [75, 100], 'S-2': [75, 100] };
const travelLimit = t => TRAVEL[grp(t)][t.sprinklered ? 1 : 0];
const commonLimit = t => COMMON[grp(t)][t.sprinklered ? 1 : 0];
const deadLimit = t => t.sprinklered && ['B', 'E', 'M', 'R', 'S-1', 'S-2'].includes(grp(t)) ? 50 : 20;
// corridor fire rating (IBC Table 1020.2) -> words
const corridorRating = t => { const g2 = grp(t); if (g2 === 'R') return t.sprinklered ? '1/2-hr (R, more than 10 occupants, sprinklered; IBC Table 1020.2)' : '1-hr (R, more than 10 occupants; IBC Table 1020.2)';
  return t.sprinklered ? 'Not required (sprinklered; IBC Table 1020.2)' : '1-hr where the corridor serves more than 30 occupants (IBC Table 1020.2)'; };
const exitsReq = n => n > 1000 ? 4 : n > 500 ? 3 : n > 49 ? 2 : 1;
const loadLabel = x => x.factor ? f0(x.area) + ' SF ' + (x.basis === 'net' ? 'NET' : 'GROSS') + ' ÷ ' + x.factor + ' = ' + x.load + ' OCC' : 'Accessory — 0 OCC';
// the rows the occupant load table shows, every row of occupantLoad (IBC Table 1004.5): factor, net or gross, the area
// it was taken on (gross areas carry their share of the floor's corridors, restrooms and walls) and the load. Apartments
// group their units a floor at a time (the load is the sum of each unit's).
function loadTable(OL, t, max = 34) {
  const rows = OL.rows.slice().sort((a, b) => a.room.floor - b.room.floor || b.load - a.load), out = [];
  if (isCor(t)) { const by = new Map(); for (const x of rows) { const k = x.room.type === 'unit' ? 'u' + x.room.floor : x.room.id; if (!by.has(k)) by.set(k, []); by.get(k).push(x); }
    for (const xs of by.values()) { const x = xs[0]; out.push(xs.length > 1 ? [(t.use === 'hotel' ? 'Guest rooms' : 'Dwelling units') + ' (' + xs.length + ')', String(x.room.floor), x.label, x.basis, f0(xs.reduce((a, q) => a + q.area, 0)), String(x.factor), String(xs.reduce((a, q) => a + q.load, 0))]
      : [x.room.name, String(x.room.floor), x.label || '—', x.factor ? x.basis : '—', f0(x.area), x.factor ? String(x.factor) : '—', String(x.load)]); } }
  else for (const x of rows) out.push([x.room.name, String(x.room.floor), x.label || '—', x.factor ? x.basis : '—', f0(x.area), x.factor ? String(x.factor) : '—', String(x.load)]);
  const more = out.length > max ? out.length - max : 0;
  return '<div class="blk" data-loads="' + esc(OL.rows.map(x => x.room.id + '=' + x.load).join(';')) + '"><div class="ar-ol">' + table('Occupant load (IBC Table 1004.5)', ['Room', 'Fl.', 'Use (Table 1004.5)', 'Basis', 'Area sf', 'Factor', 'Load'], out.slice(0, max).concat([['Total', '', '', '', '', '', String(OL.total)]]), [1, 4, 5, 6]) + '</div>' +
    (more ? '<p class="muted sm">+ ' + more + ' more rows in the total.</p>' : '') + '<p class="sm muted">Gross factors apply to the room plus its share of the floor’s corridors, restrooms, stairs and walls; net factors to the room alone.</p></div><style>.ar-ol table{font-size:7.4pt}.ar-ol td,.ar-ol th{padding:1.3pt 3pt}</style>';
}
// apartments: from the far corner of each unit to its door, then along the corridor to the nearest exit (upper floors:
// the stair doors; floor 1: the doors to outside). The unit is the common path: at its door both stairs are open.
function corridorEgress(t, d, f) {
  const P = partsOf(t, d, f, false), cor = P.rooms.find(r => r.type === 'corridor'), ax = d.corridor?.along === 'y' ? 'y' : 'x', mid = x => [(x.x1 + x.x2) / 2, (x.y1 + x.y2) / 2];
  const stairs = new Set(P.rooms.filter(r => r.type === 'stair').map(r => r.id)), cid = cor?.id;
  const exits = P.doors.filter(x => f === 1 ? x.exterior && x.kind !== 'overhead' : (stairs.has(x.a) && x.b === cid) || (stairs.has(x.b) && x.a === cid));
  const rows = [];
  for (const { r } of P.units) {
    const e = P.doors.find(x => x.entry && x.unit === r.id); if (!e || !exits.length) continue; const [dx, dy] = mid(e);
    const far = [[r.x + 1, r.y + 1], [r.x + r.w - 1, r.y + 1], [r.x + 1, r.y + r.d - 1], [r.x + r.w - 1, r.y + r.d - 1]].map(p => ({ p, d: Math.abs(p[0] - dx) + Math.abs(p[1] - dy) })).sort((p, q) => q.d - p.d)[0];
    const cc = cor ? (ax === 'x' ? cor.y + cor.d / 2 : cor.x + cor.w / 2) : (ax === 'x' ? dy : dx);
    const leg = exits.map(x => { const [qx, qy] = mid(x); return { x, d: ax === 'x' ? Math.abs(dy - cc) + Math.abs(dx - qx) + Math.abs(cc - qy) : Math.abs(dx - cc) + Math.abs(dy - qy) + Math.abs(cc - qx) }; }).sort((p, q) => p.d - q.d)[0];
    rows.push({ r, e, far: far.p, within: far.d, leg, total: far.d + leg.d, cc });
  }
  // dead ends: the corridor beyond the last exit at each end
  const along = x => ax === 'x' ? mid(x)[0] : mid(x)[1], ce = exits.filter(x => x.a === cid || x.b === cid).map(along), c0 = cor ? (ax === 'x' ? cor.x : cor.y) : 0, c1 = cor ? (ax === 'x' ? cor.x + cor.w : cor.y + cor.d) : 0;
  const dead = ce.length ? Math.max(0, Math.min(...ce) - c0 - 1.5, c1 - Math.max(...ce) - 1.5) : 0;
  return { P, cor, ax, exits, rows, dead, worst: rows.slice().sort((p, q) => q.total - p.total)[0] || null, common: rows.slice().sort((p, q) => q.within - p.within)[0] || null };
}
function aLS(ctx, sheet) {
  const { t, d, f } = look(ctx, sheet); if (!d) return noDesign(sheet, t);
  if (isCor(t)) return corLS(ctx, t, d, f, sheet);
  const g = f.height, OL = occupantLoad(d, t.occupancy), byRoom = new Map(OL.rows.map(x => [x.room.id, x])), lim = travelLimit(t);
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
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const px = (i + .5) * d.W / nx, py = (j + .5) * d.D / ny, r = f1.find(q => px >= q.x && px <= q.x + q.w && py >= q.y && py <= q.y + q.d) ||
        (inFP(d, px, py) ? null : f1.slice().sort((a, b) => Math.hypot(a.x + a.w / 2 - px, a.y + a.d / 2 - py) - Math.hypot(b.x + b.w / 2 - px, b.y + b.d / 2 - py))[0]); // over open ground: the nearest room's wall
      let [qx, qy] = [px, py]; if (r) { const dl = [[px - r.x, r.x + .8, py], [r.x + r.w - px, r.x + r.w - .8, py], [py - r.y, px, r.y + .8], [r.y + r.d - py, px, r.y + r.d - .8]].sort((a, b) => a[0] - b[0])[0]; [qx, qy] = [dl[1], dl[2]]; }
      o += sym('extinguisher', X(qx), Y(qy), fz); }
    for (const r of f1.filter(r => r.type === 'commercial_kitchen')) o += sym('extinguisher', X(r.x + 1.5), Y(r.y + 1.5), fz) + label(X(r.x + 1.5) + fz * 1.6, Y(r.y + 1.5), 'K', fz, 'font-weight="700"');
    return o;
  };
  const lab = r => { const x = byRoom.get(r.id); return [r.name, x ? loadLabel(x) : 'Accessory — 0 OCC']; };
  const dr = planView(t, d, 1, k, { fixtures: false, tags: false, dims: 'overall', label: lab, extra, inner: false }), p = placeRows([[{ wf: d.W, hf: d.D, mw, mh }]], k, { x: 0, y: 0, w: toPx(MAIN.w), h: toPx(MAIN.h) })[0];
  const perFloor = [...Array(g.F)].map((_, i) => OL.rows.filter(x => x.room.floor === i + 1).reduce((a, x) => a + x.load, 0)), capT = exits.reduce((a, e) => a + Math.floor(e.width * 12 / .2), 0), area = footA(d) * g.F, sp = f.sprinkler;
  const summary = [['Occupancy', t.occupancy || '—'], ['Construction type', t.construction || '—'], ['Sprinklers', sp.on ? sp.system + ' throughout (' + sp.ref + ')' : 'None — ' + sp.why + ' (' + sp.ref + ')'], ['Building area', f0(area) + ' sf (' + g.F + (g.F > 1 ? ' stories)' : ' story)')],
    ...perFloor.map((v, i) => ['Occupant load, floor ' + (i + 1), String(v)]), ['Total occupant load', String(OL.total)], ['Exits required (floor 1)', String(exitsReq(perFloor[0] || 0)) + ' (IBC 1006.2–1006.3)'], ['Exits provided (floor 1)', String(exits.length)],
    ['Exit width required', f0(Math.ceil((perFloor[0] || 0) * .2)) + '" (0.2"/occ., IBC 1005.3.2)'], ['Exit capacity provided', capT + ' occupants'], ['Max. travel distance', exits.length ? ftIn(maxT) + ' (limit ' + lim + "', IBC 1017.2)" : 'No exit doors in the design'],
    ['Common path of egress', 'Limit ' + commonLimit(t) + "' (IBC Table 1006.2.1)"], ['Corridors', corridorRating(t)], ['Dead-end corridors', 'Limit ' + deadLimit(t) + "' (IBC 1020.5)"],
    ['Fire extinguishers', '2-A:10-B:C within 75 ft travel (IFC 906)' + (f1.some(r => r.type === 'commercial_kitchen') ? '; Class K at cooking' : '')]];
  const sideHtml = '<div class="bh">Code summary</div><div data-occ="' + OL.total + '" class="ar-ls">' + table('', null, summary, [1]) + '</div><style>.ar-ls td:first-child{width:32%}.ar-ls td.r{white-space:normal;text-align:left}</style>' + loadTable(OL, t, 30) +
    '<div class="blk"><div class="bh">Legend</div>' + legendSym('exitsign') + legendSym('extinguisher') + legendRow(line(4, 9, 40, 9, st(RED, 1.6, 'stroke-dasharray="8 4" marker-end="url(#arr)"')), 'Egress path, farthest point to nearest exit (orthogonal)') + '</div>' +
    notes('Notes', [...discNotes(ctx, 'fire'), 'Travel distances are orthogonal approximations on the schematic plan; verify with the final layout and furniture.', g.F > 1 ? 'Upper floors exit by the stairs (see floor plans); exit stairs 44" min. width, enclosures 1-hr for three stories or fewer (IBC 1011, 1023).' : '',
      'Exit signs and emergency lighting at every exit and along the egress path (IBC 1008, 1013).', 'Doors serving 50 or more occupants swing outward; panic hardware where required (IBC 1010).'].filter(Boolean).slice(0, 10));
  return placed(p, dr, 1, 'Life safety plan — first floor', s.label) + side(sideHtml);
}
// apartments: the first floor and a typical upper floor, each unit with its load, the worst travel to a stair and the
// longest common path drawn, the stairs as the exits, and the ratings the corridor, units and stairs need
function corLS(ctx, t, d, f, sheet) {
  const g = f.height, OL = occupantLoad(d, t.occupancy), byRoom = new Map(OL.rows.map(x => [x.room.id, x])), lim = travelLimit(t), cl = commonLimit(t), dl = deadLimit(t), hotel = t.use === 'hotel';
  const lvs = g.F > 1 ? [1, 2] : [1], mw = PM.mL + PM.mR, mh = PM.mT + PM.mB + TITLE, views = lvs.map(lv => ({ fl: lv, wf: d.W, hf: d.D, mw, mh })), bx = { x: 0, y: 0, w: toPx(MAIN.w), h: toPx(MAIN.h) };
  const best = bestLayout([[views], views.map(v => [v])], bx.w, bx.h), k = best.s.k; sheet.scale = best.s.label;
  const eg = {}; for (let lv = 1; lv <= g.F; lv++) eg[lv] = corridorEgress(t, d, lv);
  const fz = clamp(k * .9, 7, 11);
  const draw = lv => { const E = eg[lv], mid = x => [(x.x1 + x.x2) / 2, (x.y1 + x.y2) / 2];
    const extra = (X, Y) => { let o = '';
      // the worst travel to a stair (red), and the longest common path, inside a unit to its door (purple)
      for (const [w, col] of [[E.worst, RED], [E.common, '#7b3fa0']]) { if (!w) continue; const [dx, dy] = mid(w.e), [qx, qy] = mid(w.leg.x), cc = w.cc, cp = col !== RED;
        const pts = (E.ax === 'x' ? [w.far, [dx, w.far[1]], [dx, cp ? dy : cc], ...(cp ? [] : [[qx, cc], [qx, qy]])] : [w.far, [w.far[0], dy], [cp ? dx : cc, dy], ...(cp ? [] : [[cc, qy], [qx, qy]])]).map(([a, b]) => [X(a), Y(b)]);
        o += pline(pts, st(col, 1.6, 'stroke-dasharray="8 4" marker-end="url(#arr)"')) + circle(pts[0][0], pts[0][1], 3.5, fl(col));
        const m = cp ? pts[0] : pts[2], n2 = cp ? pts[1] : pts[3]; o += label((m[0] + n2[0]) / 2, (m[1] + n2[1]) / 2 + (cp ? 10 : -9), cp ? 'COMMON PATH ' + ftIn(w.within) + ' ≤ ' + cl + "'" : 'TRAVEL ' + ftIn(w.total) + ' ≤ ' + lim + "'", fz, 'font-weight="700" fill="' + col + '"'); }
      E.exits.forEach(e => { const [ex, ey] = mid(e); o += sym('exitsign', X(ex), Y(ey), fz * .9); });
      if (E.cor) { const a0 = E.ax === 'x', L0 = a0 ? E.cor.w : E.cor.d, ex = E.worst ? (a0 ? mid(E.worst.leg.x)[0] - E.cor.x : mid(E.worst.leg.x)[1] - E.cor.y) : 0, u = ex < L0 / 2 ? L0 * .8 : L0 * .2; // (the end away from the drawn travel path)
        const cx = a0 ? E.cor.x + u : E.cor.x + E.cor.w / 2, cy = a0 ? E.cor.y + E.cor.d / 2 : E.cor.y + u;
        o += label(X(cx), Y(cy), (t.sprinklered ? '1/2-HR' : '1-HR') + ' CORRIDOR · DEAD END ' + (E.dead > .5 ? ftIn(E.dead) : 'NONE'), fz * .85, 'font-weight="700"' + (a0 ? '' : ' transform="rotate(-90 ' + num(X(cx)) + ' ' + num(Y(cy)) + ')"')); }
      return o; };
    const lab = r => { const x = byRoom.get(r.id); return r.type === 'corridor' ? [''] : r.type === 'stair' ? [r.name, 'EXIT · 1-HR ENCLOSURE'] : [r.name, x && x.factor ? loadLabel(x) : 'Accessory — 0 OCC']; };
    const ul = (r, x, y, fs) => { const q = byRoom.get(r.id); return unitTag(x, y, r.unit.no, q ? q.load + ' OCC' : r.unit.code, fs); };
    return planView(t, d, lv, k, { fixtures: false, tags: false, dims: 'overall', label: lab, unitLabel: ul, extra, inner: false }); };
  const html = placeRows(best.rows, k, bx).map((p, i) => placed(p, draw(p.v.fl), i + 1, 'Life safety plan — ' + (p.v.fl === 1 ? 'first floor' : 'typical upper floor (floors 2' + (g.F > 2 ? '–' + g.F : '') + ')'), best.s.label)).join('');
  const per = fl => OL.rows.filter(x => x.room.floor === fl).reduce((a, x) => a + x.load, 0), worst = Math.max(0, ...Object.values(eg).map(E => E.worst?.total || 0)), common = Math.max(0, ...Object.values(eg).map(E => E.common?.within || 0)), dead = Math.max(0, ...Object.values(eg).map(E => E.dead));
  const sp = f.sprinkler, s13 = sp.system === 'NFPA 13', U = hotel ? 'Guest room' : 'Dwelling unit';
  const summary = [['Occupancy', t.occupancy], ['Construction type', t.construction], ['Sprinklers', sp.on ? sp.system + ' throughout (' + sp.ref + ')' : 'None'], ['Building area', f0(footA(d) * g.F) + ' sf (' + g.F + ' stories)'],
    ...[...Array(g.F)].map((_, i) => ['Floor ' + (i + 1) + ': occupants · exits', per(i + 1) + ' · ' + exitsReq(per(i + 1)) + ' required (IBC 1006.3.4), ' + (i ? '2 exit stairs' : eg[1].exits.length + ' exit doors') + ' provided']),
    ['Total occupant load', String(OL.total)], ['Exit access travel', ftIn(worst) + ' max., to the nearest stair (limit ' + lim + "', IBC Table 1017.2)"], ['Common path of egress', ftIn(common) + ' max., inside a unit to its door (limit ' + cl + "', IBC Table 1006.2.1)"],
    ['Dead-end corridors', (dead > .5 ? ftIn(dead) + ' max.' : 'None') + ': the stairs close the corridor ends (limit ' + dl + "', IBC 1020.5)"], ['Corridor', corridorRating(t) + '; 44" min. width (IBC 1020.3); unit doors 20-min'],
    [U + ' separations', '1-hr fire partitions and 1-hr floor/ceiling assemblies (IBC 708.3, 711.2.4)' + (s13 ? '; 1/2-hr permitted with NFPA 13' : '; the 1/2-hr exceptions need NFPA 13, not 13R')],
    ['Exit stairs', '2, at the corridor ends, 1-hr enclosures (IBC 1023.2), 44" min. width (IBC 1011.2), discharging outside'], ['Exit width', 'Doors 0.2"/occ., stairs 0.3"/occ. (IBC 1005.3): ' + f0(Math.ceil(Math.max(...[...Array(g.F)].map((_, i) => per(i + 1))) * .3)) + '" of stair at the busiest floor; 44" stairs give ' + Math.floor(44 / .3) + ' each'],
    ['Smoke alarms', 'In and outside every sleeping room, every story of a unit (IBC 907.2.11.2); fire alarm per IBC 907.2.9'], ['Fire extinguishers', '2-A:10-B:C within 75 ft travel (IFC 906)']];
  const sideHtml = '<div class="bh">Code summary</div><div data-occ="' + OL.total + '" class="ar-ls">' + table('', null, summary, [1]) + '</div><style>.ar-ls td:first-child{width:32%}.ar-ls td.r{white-space:normal;text-align:left}</style>' + loadTable(OL, t, 30) +
    '<div class="blk"><div class="bh">Legend</div>' + legendSym('exitsign') + legendRow(line(4, 9, 40, 9, st(RED, 1.6, 'stroke-dasharray="8 4" marker-end="url(#arr)"')), 'Exit access travel: far corner of a unit to the nearest stair (orthogonal)') +
    legendRow(line(4, 9, 40, 9, st('#7b3fa0', 1.6, 'stroke-dasharray="8 4" marker-end="url(#arr)"')), 'Common path: inside a unit to its door, where both stairs are open') + '</div>' +
    notes('Notes', [...discNotes(ctx, 'fire').slice(0, 4), 'Distances are measured orthogonally on the schematic plans from the unit plans’ own doors; verify with the final layout.', 'Unit loads: 200 sf gross a person (IBC Table 1004.5, residential).', jogNote(t, d)]);
  return html + side(sideHtml);
}

// ---------- code analysis ----------
// Every number here is the type's own decision (lib/buildcode.mjs codeBasis through lib/plandesign.mjs buildingTypes: t.code,
// t.sprinkler*, t.construction) and its drawn facts (ctx.tf: heights, occupant load): G-003 restates them and works the
// frontage increase out in the open, it never re-derives them (Oct 20 review: a type marked "Revise" with no resolution).
// IPC Table 2902.1 ratios: water closets [male, female] occupants per fixture, lavatories, drinking fountains
const IPC = { 'A-2': { wc: [75, 75], lav: 200, df: 500, row: 'A-2 restaurants' }, 'A-3w': { wc: [150, 75], lav: 200, df: 1000, row: 'A-3 places of worship' }, 'A-3': { wc: [125, 65], lav: 200, df: 500, row: 'A-3 assembly' },
  B: { wc: 'B', lav: 'B', df: 100, row: 'B business' }, M: { wc: [500, 500], lav: 750, df: 1000, row: 'M mercantile' }, 'S-1': { wc: [100, 100], lav: 100, df: 1000, row: 'S-1 storage' } };
function fixturesReq(t, load) {
  const o = t.occupancy || 'B', key = o === 'A-3' && t.use === 'church' ? 'A-3w' : IPC[o] ? o : 'B', R = IPC[key], half = Math.ceil(load / 2);
  const wcB = n => n <= 50 ? Math.ceil(n / 25) : 2 + Math.ceil((n - 50) / 50), lavB = n => n <= 80 ? Math.ceil(n / 40) : 2 + Math.ceil((n - 80) / 80);
  const wc = R.wc === 'B' ? [wcB(half), wcB(half)] : [Math.ceil(half / R.wc[0]), Math.ceil(half / R.wc[1])], lav = R.lav === 'B' ? lavB(half) * 2 : Math.ceil(half / R.lav) * 2;
  return { row: R.row, wc: wc.map(x => Math.max(1, x)), lav: Math.max(2, lav), df: Math.max(1, Math.ceil(load / R.df)), single: load <= 15 || (o === 'M' && load <= 100) || (o === 'B' && load <= 25) };
}
const pct = v => Math.round(v * 100) + '%';
function codeRows(ctx, t) {
  const d = ctx.designs?.[t.id], f = d?.rooms?.length ? factsOf(ctx, t, d) : null, h = f?.height, c = t.code || {}, A = c.allow, fr = c.frontage, sp = f?.sprinkler || { on: !!t.sprinklered, system: t.sprinklerSystem || (t.sprinklered ? 'NFPA 13' : 'none'), why: t.sprinklerWhy || '', ref: t.sprinklerRef || '' };
  const occ = t.occupancy || 'B', cons = c.cons, F = t.floors || 1, ok = c.ok !== false, cor = isCor(t);
  const bh = h ? h.buildingHeight : c.heightFt || 0, flat = h ? h.type === 'flat' : c.roof?.type === 'flat', load = f?.occupants ?? t.occupantsEst ?? 0;
  const rows = [['Occupancy (IBC 302)', occ + ' — ' + (t.label || t.use)], ['Construction type (IBC 602)', t.construction || '—'],
    ['Sprinklers (IBC 903)', sp.on ? sp.system + ' throughout' : 'Not required'], ['Why', (sp.why || '—') + (sp.ref ? ' (' + sp.ref + ')' : '') + (!sp.on && /^A/.test(occ) && f ? '. As drawn: ' + load + ' occupants (IBC Table 1004.5), ' + (load < (/^A-2/.test(occ) ? 100 : 300) ? 'still under ' + (/^A-2/.test(occ) ? 100 : 300) + '.' : 'over the limit: see the open item.') : '')]];
  if (ok && c.changed) rows.push(['Sprinklers added', c.changed + ': the allowable area for ' + cons + ' needs them (IBC 506.2).']);
  let tag = 'NS';
  if (A && cons) {
    const sys = sp.system === 'NFPA 13R' ? 'NFPA 13R' : sp.on ? 'NFPA 13' : 'none', NS = allowedBy(occ, cons, 'none', F, 0)?.areaPerStory, At = allowedBy(occ, cons, sys, F, 0)?.areaPerStory, If = fr?.If || 0;
    tag = sys === 'NFPA 13R' ? 'S13R' : sys === 'NFPA 13' ? (F > 1 ? 'SM' : 'S1') : 'NS';
    if (fr) { const raw = (fr.share - .25) * fr.width / 30; rows.push(['Frontage increase (IBC 506.3)', 'If = (F/P − 0.25) × W/30 = (' + fr.share.toFixed(2) + ' − 0.25) × ' + fr.width + '/30 = ' + Math.max(0, raw).toFixed(2) + (raw > .75 + 1e-9 ? ', 0.75 max.' : '') + ': ' + pct(fr.share) + ' of the perimeter (F/P) faces open space at least ' + fr.width + ' ft wide (W), measured on the site plan']); }
    else rows.push(['Frontage increase (IBC 506.3)', 'None taken']);
    if (NS && At) rows.push(['Allowable area a story (IBC 506.2)', 'Aa = At + (NS × If) = ' + f0(At) + ' + (' + f0(NS) + ' × ' + If.toFixed(2) + ') = ' + f0(A.areaPerStory) + ' sf (Table 506.2, ' + occ.replace(/\s.*$/, '') + ', ' + cons + ', ' + tag + ')']);
    rows.push(['Area a story', f0(c.storyArea) + ' sf proposed of ' + f0(A.areaPerStory) + ' sf allowed — ' + (c.storyArea <= A.areaPerStory ? 'complies' : 'over')]);
    if (F > 1) rows.push(['Building area (IBC 506.2.3)', f0(t.buildingGsf) + ' sf of ' + f0(A.totalArea) + ' sf allowed — ' + (t.buildingGsf <= A.totalArea ? 'complies' : 'over')]);
    rows.push(['Stories (IBC Table 504.4)', F + ' of ' + A.stories + ' allowed — ' + (F <= A.stories ? 'complies' : 'over')]);
    rows.push(['Building height (IBC 504.3)', ftIn(bh) + ' above the grade plane to ' + (flat ? 'the roof deck' : 'the mean roof height') + ' (IBC 202), of ' + A.heightFt + ' ft allowed — ' + (bh <= A.heightFt + .5 ? 'complies' : 'over')]);
  }
  if (h) rows.push(['Fire access height (IFC D105.1)', ftIn(h.fireAccessHeight) + ', grade to ' + h.fireAccessTo + (h.fireAccessHeight > 30 ? ': over 30 ft, so an aerial fire apparatus access road is required (IFC D105)' : ': 30 ft or less, no aerial access road required')]);
  rows.push(['Result', ok ? 'Complies as one building' + (c.changed ? ', sprinklered as above' : '') : 'Fire walls (IBC 706) needed: ' + (c.fireWalls || 2) + ' fire areas of ' + (A ? f0(A.areaPerStory) + ' sf a story or less' : 'the allowable area or less')]);
  for (const x of f?.issues || []) rows.push(['Open item', x]);
  const n1 = Math.ceil(load / F), lim = travelLimit(t);
  rows.push(['Occupant load (IBC 1004.5)', String(load) + (f ? ' as drawn (see the life safety plan)' : ' (estimated before design)')]);
  rows.push(['Exits required (IBC 1006)', cor ? '2 a story: more than 4 units a story (IBC 1006.3.4); two exit stairs, one at each end of the corridor' : exitsReq(n1) + ' a story' + ( exitsReq(n1) === 1 ? '; one exit only where the common path ≤ ' + commonLimit(t) + ' ft (1006.2.1)' : ', separated by 1/' + (t.sprinklered ? '3' : '2') + ' of the diagonal (1007.1.1)')]);
  rows.push(['Egress width (IBC 1005.3)', f0(Math.ceil(n1 * .2)) + '" of doors' + (F > 1 ? ', ' + f0(Math.ceil(n1 * .3)) + '" of stairs' : '') + ' a story by load; at least 32" clear a door' + (F > 1 ? ' and 44" a stair (IBC 1010.1.1, 1011.2)' : ' (IBC 1010.1.1)')]);
  rows.push(['Travel · common path · dead end', lim + ' ft (1017.2) · ' + commonLimit(t) + ' ft (1006.2.1) · ' + deadLimit(t) + ' ft (1020.5)']);
  rows.push(['Corridors (IBC 1020.2)', corridorRating(t)]);
  if (cor) rows.push([(t.use === 'hotel' ? 'Guest room' : 'Dwelling unit') + ' separations', '1-hr fire partitions (IBC 708.3) and horizontal assemblies (IBC 711.2.4)' + (sp.system === 'NFPA 13' ? '; 1/2-hr permitted with NFPA 13' : '; the 1/2-hr exceptions need NFPA 13, not 13R')]);
  const sum = [t.id, t.label || t.use, occ, cons || (t.construction || '').split(' ')[0], sp.on ? sp.system : 'None', A ? f0(c.storyArea) + ' (' + f0(A.areaPerStory) + ')' : f0(c.storyArea || 0), A ? F + ' (' + A.stories + ')' : String(F), A ? Math.round(bh) + "' (" + A.heightFt + "')" : Math.round(bh) + "'", String(load), ok ? (c.changed ? 'Complies, sprinklers added' : 'Complies') : 'Fire walls: ' + (c.fireWalls || 2) + ' areas'];
  return { rows, sum, load, f };
}
function gCode(ctx, sheet) {
  sheet.scale = 'N.T.S.';
  const types = (ctx.types || []).filter(t => t.supported !== false), com = types.filter(t => !isRes(t)), res = types.filter(isRes);
  // a summary of every type across the top, then each type's analysis and the notes balanced over three columns
  const sum = [];
  let cols = '';
  for (const t of com) {
    const { rows, sum: s1, load } = codeRows(ctx, t); sum.push(s1);
    let frows;
    if (isCor(t)) frows = [['IPC Table 2902.1', t.use === 'hotel' ? 'R-1: each guest room 1 water closet, 1 lavatory, 1 bathtub or shower' : 'R-2 apartments: each unit 1 water closet, 1 lavatory, 1 bathtub or shower, 1 kitchen sink; 1 clothes washer connection per 20 units'], ['In the design', Object.values(ctx.designs?.[t.id]?.unitPlans || {}).every(p => p.baths >= 1 && p.kitchen) ? 'Every unit plan has a bath and a kitchen' + (t.use === 'hotel' ? '' : ', and a washer and dryer') : 'Check the unit plans']];
    else { const fx = fixturesReq(t, load), rr = (ctx.designs?.[t.id]?.rooms || []).filter(r => r.type === 'restroom').length;
      frows = [['IPC 2902.1 row', fx.row], ['Water closets', 'Men ' + fx.wc[0] + ' · Women ' + fx.wc[1] + (fx.row.startsWith('B') || fx.row.startsWith('M') ? '' : ' (urinals may replace up to 67% of men’s WCs)')], ['Lavatories', String(fx.lav)], ['Drinking fountains', fx.df + ' (hi-lo pair, TAS 211)'], ['Service sink', '1'],
        ['Separate facilities', fx.single ? 'Not required at this load (IPC 2902.2): single-user rooms acceptable' : 'Required, men and women'], ['Restrooms in the design', String(rr)]]; }
    cols += '<div class="blk">' + table(typeName(t), null, rows) + '</div><div class="blk">' + table('Plumbing fixtures — Type ' + t.id, null, frows) + '</div>';
  }
  if (com.length) cols += notes('Accessibility (TAS 2012)', ['Register with TDLR and get a Registered Accessibility Specialist review and inspection where the construction cost is $50,000 or more (Texas Government Code ch. 469).', 'Accessible route from accessible parking and the public way to every accessible entrance; 60% of public entrances accessible (TAS 206).',
    'Accessible parking per TAS 208.2 for each parking facility, one in six van accessible; residential parking per TAS 208.2.3; see the site plans.', 'Toilet rooms: 60" turning space, water closet 16–18" to centreline, grab bars, lavatory knee clearance (TAS 603–606).', 'Doors: 32" min. clear, maneuvering clearances, hardware 34–48" AFF, no tight grasping (TAS 404).',
    com.some(isCor) ? 'Apartments: every unit on an accessible route an FHA Type B unit (an elevator serves every floor); Accessible (Type A) units, 2% min., per IBC 1107.6.2.' : '',
    com.some(t => /^A/.test(t.occupancy || '')) ? 'Assembly seating: wheelchair spaces and companion seats (TAS 221); assistive listening systems (TAS 219).' : '']);
  if (res.length) {
    for (const t of res) cols += '<div class="blk">' + table(typeName(t), null, [['Code', 'IRC (edition adopted by the jurisdiction; Texas counties: none unless adopted — confirm)'], ['Dwellings', t.attached ? (t.use === 'townhomes' ? 'Townhouses, ' + t.unitsPer + ' units a row (IRC R302.2)' : 'Two-family dwelling (IRC R302.3)') : 'One-family dwelling'],
      ['Construction', t.construction || 'V-B wood frame'], ['Stories / height', t.floors + (t.floors > 1 ? ' stories' : ' story') + ' (IRC max. 3 stories above grade plane)'],
      ['Fire separation', t.use === 'townhomes' ? 'Common walls 1-hr where sprinklered (P2904), 2-hr where not; continuous to the roof sheathing (IRC R302.2)' : t.attached ? '1-hr separation between units, 1/2-hr where sprinklered (IRC R302.3)' : 'Exterior walls within 5 ft of the lot line 1-hr rated (IRC Table R302.1(1))'],
      ['Sprinklers', (t.sprinklerWhy || '—') + (t.sprinklerRef ? ' (' + t.sprinklerRef + ')' : '')], ['Egress', 'Every sleeping room: emergency escape opening (IRC R310); exit door 32" clear (R311.2)'], ['Alarms', 'Interconnected smoke alarms (R314); CO alarms with fuel-fired appliances or an attached garage (R315)'],
      ['Garage', 'Separation per IRC R302.5–R302.6; door 20-min / solid core, self-closing'], ['Energy', 'IECC CZ 2A: windows U ≤ 0.40 / SHGC ≤ 0.25; ceiling R-38 (R-49 under 2021); walls R-13'], ['Accessibility', 'Not required for one- and two-family dwellings and townhouses (FHA applies at 4+ units in a building)']]) + '</div>';
  }
  const crit = Array.isArray(ctx.disc?.arch?.criteria) ? ctx.disc.arch.criteria.filter(x => typeof x === 'string') : [];
  const hC = AREA.h - (sum.length ? (sum.length + 2) * 15 + 30 : 0);
  let body = (sum.length ? '<div style="margin-bottom:12pt">' + table('Code summary — building types under the IBC', ['Type', 'Use', 'Occupancy', 'Construction', 'Sprinklers', 'Area a story sf (allowed)', 'Stories (allowed)', 'Height (allowed)', 'Occupants', 'Result'], sum, [5, 6, 7, 8]) + '</div>' : '') +
    '<style>.ar-c table{font-size:' + (com.length + res.length > 5 ? 7.6 : 8.8) + 'pt}.ar-c td,.ar-c th{padding:' + (com.length + res.length > 5 ? 1.4 : 2.4) + 'pt 4pt}.ar-c .blk{break-inside:avoid}.ar-c .blk:first-child{margin-top:0}.ar-c td:first-child{width:30%}</style><div class="ar-c" style="column-count:3;column-gap:20pt;column-fill:balance;height:' + hC + 'pt">' + cols;
  body += notes('Code analysis notes', [...crit.slice(0, 6), 'Allowable values from the 2021 IBC (Tables 504.3, 504.4, 506.2) for each type’s construction and sprinkler system, with the frontage increase measured on the site plan (IBC 506.3); confirm the edition and amendments the authority having jurisdiction has adopted.',
    'Building height is measured from the grade plane, with the first floor slab 1 ft above it; elevations, sections and the fire access plan show the same heights.', 'Occupant loads from IBC Table 1004.5 on the schematic rooms (net or gross as the table says); the life safety plans list every room.', 'Fixture counts from IPC Table 2902.1, occupants split 50/50; tenants with higher loads need more fixtures.', 'Fire department access and hydrants: see the fire access plan.']) + '</div>';
  return at(AREA.x, AREA.y, AREA.w, AREA.h, body);
}

export const RENDERERS = { 'a-plans': aPlans, 'a-units': aUnits, 'a-elev': aElev, 'a-section': aSection, 'a-sched': aSched, 'a-details': aDetails, 'ls-plan': aLS, 'g-code': gCode };
