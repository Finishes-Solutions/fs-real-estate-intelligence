// Engineering sheets of the plan set (lib/planset.mjs RENDERERS): structural (S), mechanical (M), plumbing (P),
// electrical (E), fire sprinkler and alarm (FP / FA) and telecom (T).
//
// These are RULE-BASED SCHEMATIC LAYOUTS, a "basis of design" for pricing and consultant kickoff, not engineering. A
// smoke alarm goes in every bedroom, a receptacle every 12 ft of wall, a ton of cooling per 550 sf of house, sprinkler
// heads on their hazard's grid, and so on. Every sheet says so. The engineers of record design, calculate and seal the
// real work. The rules are small exported pure functions (tested in test/sheets-eng.mjs). The per-type sheets place
// their results on a light floor plan of the building type: front (street side) at the bottom, every floor side by side
// at one architectural scale. No DOM, no network.
import { esc, f0, f1, PT, DPI, MAIN, side, archScale, viewTitle, table, notes, at, svg, line, rect, circle, path, poly, pline, sym, legendSym, legendLine, lineAttr, n } from '../sheetkit.mjs';
import { occupantLoad, roomsOn, RESIDENTIAL, typeName, outlineOf, inPoly, piecesOf, notchesOf } from '../plandesign.mjs';

// ---------- small shared pieces ----------
const INK = '#1b1e1f', GREY = '#a9aeb0', GREY2 = '#80878a', RED = '#c0392b', BLUE = '#2f6db5', BROWN = '#6b4a2b', GAS = '#d29a1f', DUCT = '#2b5f8a', PURPLE = '#7b3fa0';
const isRes = u => RESIDENTIAL.includes(u);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = v => Number.isFinite(+v) ? +v : 0;
const area = r => num(r.w) * num(r.d);
const cx = r => r.x + r.w / 2, cy = r => r.y + r.d / 2;
const sum = (a, f = x => x) => a.reduce((s, x) => s + num(f(x)), 0);
const up = (v, list) => list.find(x => x >= v - 1e-9) ?? list[list.length - 1];
const dist = (a, b) => Math.hypot(cx(a) - cx(b), cy(a) - cy(b));
const BEDS = ['bedroom', 'primary_bedroom'];
const SMALL = ['closet', 'walk_in_closet', 'pantry'];
const plural = (k, w, s = 's') => k + ' ' + w + (k === 1 ? '' : s);
const gasService = d => /gas/.test(d.systems?.water_heater || '') || d.use === 'restaurant';
const floorName = (f, F) => F === 1 ? 'Floor plan' : 'Floor ' + f;
// SVG text on a white backing so it reads over linework; s may hold several lines split by \n. The backing is a plain
// rectangle, not a stroked halo: Chromium prints stroked text as outlines and a sheet of labels grew to megabytes.
function T(x, y, s, size = 7, o = {}) {
  const a = o.a || 'middle';
  return String(s).split('\n').map((l, i) => {
    const yy = y + i * size * 1.15, w = l.length * size * (o.b ? 0.6 : 0.55) + 2, x0 = a === 'start' ? x - 1 : a === 'end' ? x - w + 1 : x - w / 2;
    const bg = o.halo === false || !l ? '' : '<rect x="' + n(x0) + '" y="' + n(yy - size * 0.86) + '" width="' + n(w) + '" height="' + n(size * 1.12) + '" fill="#fff"/>';
    const t = '<text x="' + n(x) + '" y="' + n(yy) + '" font-size="' + n(size) + '" font-family="Arial, Helvetica, sans-serif" text-anchor="' + a + '" fill="' + (o.c || INK) + '"' + (o.b ? ' font-weight="700"' : '') + '>' + esc(l) + '</text>';
    return o.rot ? '<g transform="rotate(' + o.rot + ' ' + n(x) + ' ' + n(y) + ')">' + bg + t + '</g>' : bg + t;
  }).join('');
}
// a dimension line (as lib/sheetkit dim, with the backed label above)
function dim(x1, y1, x2, y2, label, off = 14, size = 8) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy * off, ny = ux * off, a = Math.atan2(dy, dx) * 180 / Math.PI;
  const X1 = x1 + nx, Y1 = y1 + ny, X2 = x2 + nx, Y2 = y2 + ny, tk = (x, y) => line(x - 3 * (ux - uy), y - 3 * (uy + ux), x + 3 * (ux - uy), y + 3 * (uy + ux), 'stroke="' + INK + '" stroke-width="1"');
  const rot = a > 90 || a < -90 ? a + 180 : a, mx = (X1 + X2) / 2, my = (Y1 + Y2) / 2;
  return line(x1, y1, X1 + nx * 0.2, Y1 + ny * 0.2, 'stroke="#6b7174" stroke-width=".6"') + line(x2, y2, X2 + nx * 0.2, Y2 + ny * 0.2, 'stroke="#6b7174" stroke-width=".6"') + line(X1, Y1, X2, Y2, 'stroke="' + INK + '" stroke-width=".7"') + tk(X1, Y1) + tk(X2, Y2) + T(mx, my + size * 0.35, label, size, { rot: Math.abs(rot) > 0.1 ? rot : 0 });
}
const tag = (x, y, s, size = 6.5, c = INK) => T(x, y, s, size, { b: true, c });

// ---------- the context: types, designs, Claude's notes (optional) ----------
const typeOf = (ctx, sh) => (ctx.types || []).find(t => t.id === sh.typeId);
const designOf = (ctx, t) => { const d = t && ctx.designs?.[t.id]; return d && Array.isArray(d.rooms) && d.rooms.length ? { doors: [], windows: [], systems: {}, roof: {}, ...d } : null; };
const typesWith = ctx => (ctx.types || []).filter(t => t.supported !== false).map(t => ({ t, d: designOf(ctx, t) }));
function disc(ctx, key) {
  const o = ctx.disc?.[key] || {};
  return { notes: (Array.isArray(o.notes) ? o.notes : []).filter(s => typeof s === 'string' && s.trim()).slice(0, 14),
    criteria: (Array.isArray(o.criteria) ? o.criteria : []).filter(c => c && c.item).map(c => [String(c.item), String(c.value ?? '')]).slice(0, 20) };
}
const pick = (ctx, key, defs) => { const d = disc(ctx, key).notes; return d.length ? d : defs; };
const missing = (sh, what) => { sh.scale = 'N.T.S.'; return at(MAIN.x, MAIN.y, 640, 0, '<div class="warnbox"><b>Design not available.</b> ' + esc(what) + ' The building type’s floor plan wasn’t designed for this set, so this sheet can’t be laid out. Make the set again once the type has a design.</div>'); };
const BOD = what => '<div class="warnbox" style="margin:6pt 0"><b>Basis of design — schematic.</b> ' + esc(what) + ' Laid out by rule for pricing and coordination; not an engineered design. The engineer of record designs, sizes and seals the work.</div>';
const head = (t, extra = '') => '<div class="bh">' + esc(typeName(t)) + '</div><div class="sm">' + esc([t.count + ' building' + (t.count > 1 ? 's' : '') + (t.attached ? ' of ' + t.unitsPer + ' units' : ''), f0(t.unitGsf) + ' sf' + (t.attached ? ' per unit' : ''), t.occupancy, t.construction, t.sprinklered ? 'sprinklered' : 'not sprinklered'].join(' · ')) + (extra ? '<br>' + esc(extra) : '') + '</div>';
const legend = kinds => '<div class="blk"><div class="bh">Legend</div><div style="columns:2;column-gap:10pt">' + kinds.map(k => k.startsWith('line:') ? legendLine(k.slice(5)) : k.startsWith('raw:') ? k.slice(4) : legendSym(k)).join('') + '</div></div>';
const rawLeg = (label, body, w = 44) => 'raw:<div class="lg2">' + svg(w, 14, body) + '<span>' + esc(label) + '</span></div>';
const blk = (title, html) => '<div class="blk"><div class="bh">' + esc(title) + '</div>' + html + '</div>';
const tbl = (title, head, rows, right) => '<div class="blk">' + table(title, head, rows, right) + '</div>';
// the notes sheets: blocks flowing down four columns
const CSS = '<style>.engc{columns:4;column-gap:22pt;column-fill:balance;max-height:100%}.engc>div{break-inside:avoid;margin:0 0 10pt}.engc .blk{margin-top:0}.engc table{font-size:7.4pt}.engc td,.engc th{padding:1.5pt 4pt}.engc li{font-size:8pt}.engs table{font-size:7.4pt}.engs td,.engs th{padding:1.5pt 4pt}</style>';
const columns = (sh, blocks) => { sh.scale = 'N.T.S.'; return CSS + '<div class="engc">' + blocks.filter(Boolean).map(b => '<div>' + b + '</div>').join('') + '</div>'; };

// ---------- the light floor plan every per-type sheet draws on ----------
// views: [{ floor (the walls drawn), title, roof? }]. Each view at one common scale, laid out in the grid of columns and
// rows that gives the largest scale; overlay(view, g) adds the discipline's drawing. g: feet -> px (front at the bottom).
const M_IN = 0.95; // paper margin round each plan (in), room for equipment outside the walls and labels
function drawViews(d, views, overlay, sideHtml) {
  const W = d.W, D = d.D, nV = Math.max(1, views.length), aw = MAIN.w / PT, ah = MAIN.h / PT, tIn = 0.65;
  let best = null;
  // a narrower margin when it buys a larger scale (big buildings); ties go to the wide margin, then to more columns
  for (const mIn of [M_IN, 0.6]) for (let cols = 1; cols <= nV; cols++) {
    const rows = Math.ceil(nV / cols), cw = aw / cols, ch = ah / rows, s = archScale(W, D, cw - 2 * mIn - 0.2, ch - 2 * mIn - tIn - 0.2);
    if (!best || s.ft < best.s.ft - 1e-9 || (Math.abs(s.ft - best.s.ft) < 1e-9 && mIn === best.mIn && cols > best.cols)) best = { cols, cw, ch, s, mIn };
  }
  const { cols, cw, ch, s, mIn } = best, k = s.k, m = mIn * DPI, wpx = W * k + 2 * m, hpx = D * k + 2 * m;
  let html = '';
  views.forEach((v, i) => {
    const c = i % cols, r = Math.floor(i / cols), x0 = MAIN.x + c * cw * PT, y0 = MAIN.y + r * ch * PT, wpt = wpx * PT / DPI, hpt = hpx * PT / DPI;
    const left = x0 + (cw * PT - wpt) / 2, top = y0 + Math.max(0, (ch * PT - hpt - tIn * PT) / 2);
    const g = { k, m, W, D, f: v.floor, X: x => m + x * k, Y: y => m + (D - y) * k, r: clamp(k * 0.55, 3.4, 6.5), fs: clamp(k * 0.7, 5.6, 8), out: ft => Math.min(ft, Math.max(0.8, (m - 30) / k)) }; // out: feet beyond a wall that still fit the margin
    let body = '';
    try { body = lightPlan(d, v, g) + overlay(v, g); } catch (e) { body = T(wpx / 2, hpx / 2, 'This view couldn’t be laid out: ' + e.message, 9); }
    html += at(left, top, wpt, hpt, svg(wpx, hpx, body)) + at(left + m * PT / DPI * 0.6, top + hpt - 10, Math.max(220, wpt - m * PT / DPI * 0.6), tIn * PT + 10, viewTitle(String(i + 1), v.title, s.label));
  });
  return { html: html + side('<div class="engs">' + CSS + sideHtml + '</div>'), scale: s.label };
}
function lightPlan(d, v, g) {
  const f = v.floor, k = g.k, rooms = roomsOn(d, f);
  let s = '';
  for (const r of rooms) {
    s += rect(g.X(r.x), g.Y(r.y + r.d), r.w * k, r.d * k, 'fill="#fff" stroke="' + GREY + '" stroke-width=".7"');
    if (r.type === 'stair' && !v.roof) { const along = r.d >= r.w, L = along ? r.d : r.w, nT = clamp(Math.floor(L), 2, 18); for (let i = 1; i < nT; i++) s += along ? line(g.X(r.x), g.Y(r.y + i * r.d / nT), g.X(r.x + r.w), g.Y(r.y + i * r.d / nT), 'stroke="#d0d3d4" stroke-width=".5"') : line(g.X(r.x + i * r.w / nT), g.Y(r.y), g.X(r.x + i * r.w / nT), g.Y(r.y + r.d), 'stroke="#d0d3d4" stroke-width=".5"'); }
  }
  s += path(polyD(g, outline(d)), 'fill="none" stroke="' + GREY2 + '" stroke-width="1.8"');
  if (d.attached) for (const x of [0, d.W]) s += line(g.X(x), g.Y(0), g.X(x), g.Y(d.D), 'stroke="' + GREY2 + '" stroke-width="3.4"') + T(g.X(x) + (x ? 9 : -9), g.Y(d.D / 2), 'PARTY WALL', 5.5, { rot: -90, c: GREY2 });
  if (!v.roof) {
    for (const o of (d.doors || []).filter(x => x.floor === f)) {
      const a = 'stroke="' + GREY + '" stroke-width=".6"', h = o.orient === 'h', t = 2.5;
      s += line(g.X(o.x1), g.Y(o.y1), g.X(o.x2), g.Y(o.y2), 'stroke="#fff" stroke-width="' + (o.exterior ? 3.4 : 2.2) + '"') +
        (h ? line(g.X(o.x1), g.Y(o.y1) - t, g.X(o.x1), g.Y(o.y1) + t, a) + line(g.X(o.x2), g.Y(o.y2) - t, g.X(o.x2), g.Y(o.y2) + t, a) : line(g.X(o.x1) - t, g.Y(o.y1), g.X(o.x1) + t, g.Y(o.y1), a) + line(g.X(o.x2) - t, g.Y(o.y2), g.X(o.x2) + t, g.Y(o.y2), a));
    }
    for (const w of (d.windows || []).filter(x => x.floor === f)) s += line(g.X(w.x1), g.Y(w.y1), g.X(w.x2), g.Y(w.y2), 'stroke="#fff" stroke-width="2.8"') + line(g.X(w.x1), g.Y(w.y1), g.X(w.x2), g.Y(w.y2), 'stroke="' + GREY + '" stroke-width=".6"');
    for (const r of rooms) {
      if (r.d * k < g.fs * 2.4) continue;
      let name = String(r.name || r.type).toUpperCase(); if (name.length * g.fs * 0.6 > r.w * k - 4) name = name.split(/[\s/,]+/)[0]; if (name.length * g.fs * 0.6 > r.w * k - 4) continue;
      s += T(g.X(cx(r)), g.Y(r.y + r.d) + g.fs + 2.5, name, g.fs, { c: GREY2, halo: false });
    }
  }
  s += T(g.X(d.W), g.Y(0) + g.m - 6, '▲ FRONT (STREET SIDE)', 6.5, { a: 'end', c: GREY2, halo: false });
  return s;
}
// the rooms' floor views of one design, a title each
const floorViews = (d, what) => Array.from({ length: d.floors }, (_, i) => ({ floor: i + 1, title: floorName(i + 1, d.floors) + ' — ' + what }));
// orthogonal runs from a source to points: one trunk along the longer spread, a branch to each point (feet)
export function trunkRuns(src, pts, orient) {
  if (!pts.length) return [];
  const xs = pts.map(p => p.x).concat(src.x), ys = pts.map(p => p.y).concat(src.y);
  const h = orient ? orient === 'h' : Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
  const out = [h ? [Math.min(...xs), src.y, Math.max(...xs), src.y] : [src.x, Math.min(...ys), src.x, Math.max(...ys)]], seen = new Set();
  for (const p of pts) { const sgm = h ? [p.x, src.y, p.x, p.y] : [src.x, p.y, p.x, p.y], key = sgm.map(v => Math.round(v * 4)).join(','); if (!seen.has(key) && (sgm[0] !== sgm[2] || sgm[1] !== sgm[3])) { seen.add(key); out.push(sgm); } }
  return out;
}
const segs = (list, g, a) => list.map(([x1, y1, x2, y2]) => line(g.X(x1), g.Y(y1), g.X(x2), g.Y(y2), a)).join('');
// points spread on a grid through a room: n of them, or at most sx / sy apart
export function spread(r, count) {
  if (count <= 0) return [];
  const nx = Math.max(1, Math.round(Math.sqrt(count * r.w / Math.max(r.d, 0.1)))), ny = Math.max(1, Math.ceil(count / nx)), out = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (out.length < count) out.push({ x: r.x + (i + 0.5) * r.w / nx, y: r.y + (j + 0.5) * r.d / ny });
  return out;
}
export function gridIn(r, sx, sy, cap = 2000) {
  let nx = Math.max(1, Math.round(r.w / sx)), ny = Math.max(1, Math.round(r.d / sy));
  if (nx * ny > cap) { const f = Math.sqrt(cap / (nx * ny)); nx = Math.max(1, Math.floor(nx * f)); ny = Math.max(1, Math.floor(ny * f)); }
  const out = []; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) out.push({ x: r.x + (i + 0.5) * r.w / nx, y: r.y + (j + 0.5) * r.d / ny });
  return out;
}
// the exterior side of a room to put a panel, meter or tap on (never a party wall)
const extSide = (d, r, order = ['back', 'left', 'right', 'front']) => order.find(s => r.ext?.[s] && !(d.attached && (s === 'left' || s === 'right'))) || null;
// ---------- the building's outline ----------
// A design's footprint (lib/plandesign.mjs) is an orthogonal polygon: an L, a U, a stepped front or the W x D rectangle.
// W and D are only its bounding box, and the notches inside that box are open ground, so walls, slab edges, grid lines
// and runs follow the outline, and nothing inside the building is placed in a notch.
const shapeOf = d => ({ W: d.W, D: d.D, fp: d.shape && d.shape !== 'rectangle' && d.footprint?.length >= 4 ? d.footprint : null });
export const outline = d => outlineOf(shapeOf(d));
export const pieces = d => piecesOf(shapeOf(d));
export const notchList = d => notchesOf(shapeOf(d));
export const inNotch = (d, x, y) => notchList(d).some(c => x > c.x + 0.01 && x < c.x + c.w - 0.01 && y > c.y + 0.01 && y < c.y + c.d - 0.01);
const signedArea = P => P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const footArea = d => num(d.footArea) || Math.abs(signedArea(outline(d)));
// the outline's edges, each with the side its outside faces (front -y, back +y, left -x, right +x)
export function edgesOf(d) {
  const P = outline(d), k = signedArea(P) >= 0 ? 1 : -1, out = [];
  for (let i = 0; i < P.length; i++) {
    const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length], L = Math.hypot(x2 - x1, y2 - y1); if (L < 1e-6) continue;
    const nx = k * (y2 - y1) / L, ny = -k * (x2 - x1) / L;
    out.push({ x1, y1, x2, y2, L, nx, ny, side: Math.abs(ny) >= Math.abs(nx) ? (ny < 0 ? 'front' : 'back') : (nx < 0 ? 'left' : 'right') });
  }
  return out;
}
// the outline moved inward by t ft (outward when t < 0): each corner moves along both of its edges' inward normals
export function insetOutline(d, t) {
  const E = edgesOf(d), P = E.map(e => [e.x1, e.y1]);
  return P.map((p, i) => { const a = E[(i - 1 + E.length) % E.length], b = E[i], same = Math.abs(a.nx - b.nx) + Math.abs(a.ny - b.ny) < 1e-6; return [p[0] - t * (a.nx + (same ? 0 : b.nx)), p[1] - t * (a.ny + (same ? 0 : b.ny))]; });
}
// the stretches of the line y = at (horiz) or x = at that lie inside the outline -> [[from, to], …]
export function clipLine(d, at, horiz = true) {
  const P = outline(d), v = [];
  for (let i = 0; i < P.length; i++) { const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length]; if (horiz ? (y1 > at) !== (y2 > at) : (x1 > at) !== (x2 > at)) v.push(horiz ? x1 + (at - y1) * (x2 - x1) / (y2 - y1) : y1 + (at - x1) * (y2 - y1) / (x2 - x1)); }
  v.sort((a, b) => a - b); const out = []; for (let i = 0; i + 1 < v.length; i += 2) if (v[i + 1] - v[i] > 0.01) out.push([v[i], v[i + 1]]); return out;
}
// inside the outline or on its edge
export const onOrIn = (d, x, y, e = 0.05) => inPoly([x, y], outline(d)) || [[e, e], [-e, e], [e, -e], [-e, -e]].some(([a, b]) => inPoly([x + a, y + b], outline(d)));
// well inside the outline: every point within e ft of (x, y) is in it
export const strictlyIn = (d, x, y, e = 0.5) => [[e, e], [-e, e], [e, -e], [-e, -e], [0, 0]].every(([a, b]) => inPoly([x + a, y + b], outline(d)));
const polyD = (g, P) => 'M' + P.map(p => n(g.X(p[0])) + ' ' + n(g.Y(p[1]))).join('L') + 'Z';
const secM = (x, y, num) => circle(x, y, 9, 'fill="#fff" stroke="' + INK + '" stroke-width="1"') + line(x - 9, y, x + 9, y, 'stroke="' + INK + '" stroke-width=".7"') + T(x, y - 2, num, 6.5, { b: true, halo: false }) + T(x, y + 7, 'S-501', 5, { halo: false });
// a structural grid drawn only where the building is: numbered bubbles along the top, lettered down the left, each line
// over the stretches of the outline it crosses
function gridMarks(d, g, G) {
  const ln = 'stroke="' + GREY2 + '" stroke-width=".6" stroke-dasharray="14 3 3 3"', lead = 'stroke="' + GREY2 + '" stroke-width=".4"'; let s = '';
  G.xs.forEach((x, i) => { const iv = clipLine(d, clamp(x, 0.01, d.W - 0.01), false); if (!iv.length) return; const top = Math.max(...iv.map(q => q[1]));
    s += line(g.X(x), g.Y(d.D) - 41, g.X(x), g.Y(top) - 6, lead) + iv.map(([a, b]) => line(g.X(x), g.Y(b) - 6, g.X(x), g.Y(a) + 6, ln)).join('') + circle(g.X(x), g.Y(d.D) - 50, 9, 'fill="#fff" stroke="' + INK + '" stroke-width="1"') + T(g.X(x), g.Y(d.D) - 47, String(i + 1), 8, { b: true, halo: false }); });
  G.ys.forEach((y, j) => { const iv = clipLine(d, clamp(y, 0.01, d.D - 0.01), true); if (!iv.length) return; const lft = Math.min(...iv.map(q => q[0]));
    s += line(g.X(0) - 41, g.Y(y), g.X(lft) - 6, g.Y(y), lead) + iv.map(([a, b]) => line(g.X(a) - 6, g.Y(y), g.X(b) + 6, g.Y(y), ln)).join('') + circle(g.X(0) - 50, g.Y(y), 9, 'fill="#fff" stroke="' + INK + '" stroke-width="1"') + T(g.X(0) - 50, g.Y(y) + 3, String.fromCharCode(65 + j), 8, { b: true, halo: false }); });
  return s;
}
// orthogonal runs from a source to points that stay inside the outline: a trunk and branches in each piece of the
// footprint, reached from the source's piece through the openings where pieces meet (trunkRuns on a rectangle)
export function treeRuns(d, src, pts) {
  const R = pieces(d); if (R.length < 2 || !pts.length) return trunkRuns(src, pts);
  const dr = (p, r) => Math.hypot(Math.max(r.x - p.x, 0, p.x - r.x - r.w), Math.max(r.y - p.y, 0, p.y - r.y - r.d)), at = p => R.reduce((b, r, i) => dr(p, r) < dr(p, R[b]) - 1e-9 ? i : b, 0);
  const link = (a, b) => { for (const [p, q, h] of [[a, b, false], [b, a, false], [a, b, true], [b, a, true]]) { if (h ? Math.abs(p.y + p.d - q.y) < 0.01 : Math.abs(p.x + p.w - q.x) < 0.01) { const lo = h ? Math.max(p.x, q.x) : Math.max(p.y, q.y), hi = h ? Math.min(p.x + p.w, q.x + q.w) : Math.min(p.y + p.d, q.y + q.d); if (hi - lo > 0.5) return h ? { x: (lo + hi) / 2, y: p.y + p.d } : { x: p.x + p.w, y: (lo + hi) / 2 }; } } return null; };
  const s0 = at(src), prev = new Map([[s0, null]]), entry = new Map([[s0, src]]), todo = [s0];
  while (todo.length) { const i = todo.shift(); R.forEach((r, j) => { if (prev.has(j)) return; const m = link(R[i], r); if (m) { prev.set(j, i); entry.set(j, m); todo.push(j); } }); }
  const groups = new Map(); for (const p of pts) { const i = at(p), g = prev.has(i) ? i : s0; groups.set(g, [...(groups.get(g) || []), p]); }
  const out = [], seen = new Set(), add = s => { const key = s.map(v => Math.round(v * 4)).join(','); if (!seen.has(key) && (s[0] !== s[2] || s[1] !== s[3])) { seen.add(key); out.push(s); } };
  for (const [i, list] of groups) {
    const chain = []; for (let j = i; j != null; j = prev.get(j)) chain.unshift(entry.get(j));
    for (let c = 0; c + 1 < chain.length; c++) { const a = chain[c], b = chain[c + 1]; add([a.x, a.y, b.x, a.y]); add([b.x, a.y, b.x, b.y]); }
    trunkRuns(chain[chain.length - 1], list).forEach(add);
  }
  return out;
}
// a spot on the outline's outside wall, on floor 1, nearest p and clear of doors and windows -> { x, y, side }
export function wallSpot(d, p, sides = ['front', 'back', 'left', 'right']) {
  const open = [...(d.doors || []), ...(d.windows || [])].filter(o => o.floor === 1), ok = sides.filter(q => !(d.attached && (q === 'left' || q === 'right'))); let best = null;
  for (const e of edgesOf(d)) {
    if (!ok.includes(e.side) || e.L < 2) continue;
    const step = Math.max(0.5, e.L / 300);
    for (let u = 1; u <= e.L - 1; u += step) {
      const q = { x: e.x1 + (e.x2 - e.x1) * u / e.L, y: e.y1 + (e.y2 - e.y1) * u / e.L };
      if (open.some(o => onDoor(o, q.x, q.y, 1.2))) continue;
      const dd = Math.hypot(q.x - p.x, q.y - p.y); if (!best || dd < best.dd) best = { ...q, side: e.side, dd };
    }
  }
  return best || (sides.length < 4 ? wallSpot(d, p) : { x: Math.max(0, d.W - 1), y: 0, side: 'front', dd: 0 });
}
const onWall = (r, s, along = 0.5) => s === 'back' ? { x: r.x + r.w * along, y: r.y + r.d } : s === 'front' ? { x: r.x + r.w * along, y: r.y } : s === 'left' ? { x: r.x, y: r.y + r.d * along } : { x: r.x + r.w, y: r.y + r.d * along };
const outward = (s, ft) => s === 'back' ? [0, ft] : s === 'front' ? [0, -ft] : s === 'left' ? [-ft, 0] : [ft, 0];
const firstOf = (rooms, types, f = 1) => { for (const ty of types) { const r = rooms.find(q => q.type === ty && q.floor === f); if (r) return r; } return null; };
// the room most "central" on a floor among the kinds people pass through
function central(rooms, W, D) {
  const pref = rooms.filter(r => ['hall', 'corridor', 'entry', 'living', 'family', 'lobby'].includes(r.type)), list = pref.length ? pref : rooms.filter(r => !SMALL.includes(r.type) && r.type !== 'garage');
  return (list.length ? list : rooms).reduce((p, q) => Math.hypot(cx(q) - W / 2, cy(q) - D / 2) < Math.hypot(cx(p) - W / 2, cy(p) - D / 2) ? q : p);
}
// the leasable spaces of a multi-tenant shell on a floor, each with the rooms that open off it; [] for a single tenant
export function tenantsOn(d, f = 1) {
  if (isRes(d.use)) return [];
  const fr = roomsOn(d, f), mains = fr.filter(r => r.type === 'tenant'); if (mains.length < 2) return [];
  const g = mains.map((m, i) => ({ id: 'T' + (i + 1), main: m, rooms: [m] })), doors = (d.doors || []).filter(o => o.floor === f && !o.exterior);
  for (const r of fr.filter(q => q.type !== 'tenant')) {
    const via = doors.filter(o => o.a === r.id || o.b === r.id).map(o => g.find(x => x.main.id === (o.a === r.id ? o.b : o.a))).find(Boolean);
    (via || g.reduce((p, q) => dist(q.main, r) < dist(p.main, r) ? q : p)).rooms.push(r);
  }
  return g;
}

// ---------- rules: electrical ----------
const NO_RECEP = ['closet', 'walk_in_closet', 'pantry', 'stair', 'walk_in_cooler', 'porch'];
const GFCI_RES = ['bath', 'half_bath', 'kitchen', 'garage', 'laundry'];
const GFCI_COM = ['restroom', 'commercial_kitchen', 'janitor', 'break_room', 'kitchen', 'bath', 'half_bath', 'laundry', 'garage', 'mechanical'];
const onDoor = (o, x, y, tol) => o.orient === 'h' ? Math.abs(y - o.y1) <= tol && x >= Math.min(o.x1, o.x2) - tol && x <= Math.max(o.x1, o.x2) + tol : Math.abs(x - o.x1) <= tol && y >= Math.min(o.y1, o.y2) - tol && y <= Math.max(o.y1, o.y2) + tol;
// receptacles along a room's walls -> [{ x, y, side, kind }] (feet, on the wall line). Dwellings: NEC 210.52(A), no point
// along a wall more than 6 ft from one, so one at least every 12 ft (kitchens ~6 ft for the counters, one GFCI at a bath
// lavatory); commercial about every 20 ft (warehouse 40 ft). Doorways are skipped; party walls get none.
export function receptacles(r, o = {}) {
  const res = o.res !== false, doors = o.doors || [];
  if (NO_RECEP.includes(r.type) || r.w < 3 || r.d < 3) return [];
  const kind = (res ? GFCI_RES : GFCI_COM).includes(r.type) ? 'gfci' : 'receptacle';
  if (['bath', 'half_bath', 'restroom'].includes(r.type)) return [{ x: r.x + Math.min(2.5, r.w / 2), y: r.y + r.d, side: 'back', kind }];
  if (['hall', 'corridor'].includes(r.type)) return Math.max(r.w, r.d) >= 10 ? [r.w >= r.d ? { x: cx(r), y: r.y + r.d, side: 'back', kind } : { x: r.x + r.w, y: cy(r), side: 'right', kind }] : [];
  const sp = res ? (r.type === 'kitchen' ? 6 : 12) : r.type === 'warehouse' ? 40 : 20, out = [];
  const walls = [['front', r.x, r.y, r.x + r.w, r.y], ['back', r.x, r.y + r.d, r.x + r.w, r.y + r.d], ['left', r.x, r.y, r.x, r.y + r.d], ['right', r.x + r.w, r.y, r.x + r.w, r.y + r.d]];
  for (const [s, x1, y1, x2, y2] of walls) {
    if (o.attached && ((s === 'left' && r.x <= 0.5) || (s === 'right' && o.W && r.x + r.w >= o.W - 0.5))) continue;
    const L = Math.hypot(x2 - x1, y2 - y1); if (L < 2) continue;
    const P = t => [x1 + (x2 - x1) * t / L, y1 + (y2 - y1) * t / L], cnt = Math.max(1, Math.ceil(L / sp));
    for (let i = 0; i < cnt; i++) {
      const t = (i + 0.5) * L / cnt, free = u => u > 0.6 && u < L - 0.6 && !doors.some(dd => onDoor(dd, ...P(u), 0.6));
      const u = [t, t + 2, t - 2, t + 4, t - 4, t + 7, t - 7].find(free); if (u == null) continue;
      const [x, y] = P(u); out.push({ x, y, side: s, kind });
    }
  }
  return out;
}
// lights in a room -> [{ x, y, kind }]: homes one fixture a room, recessed cans in kitchen and living spaces; commercial
// 2x4 troffers on about an 8 x 10 ft grid; warehouse high-bays on about a 25 ft grid
export function lights(r, res = true) {
  const g = (sx, sy, kind) => gridIn(r, sx, sy, 600).map(p => ({ ...p, kind }));
  if (r.type === 'stair' || r.type === 'porch') return [{ x: cx(r), y: cy(r), kind: 'light' }];
  if (res) {
    if (r.type === 'kitchen') return g(6, 6, 'recessed');
    if (['living', 'family', 'dining'].includes(r.type)) return g(7, 7, 'recessed');
    if (r.type === 'garage' || (r.type === 'hall' && Math.max(r.w, r.d) > 14)) return g(12, 12, 'light');
    return [{ x: cx(r), y: cy(r), kind: 'light' }];
  }
  if (r.type === 'warehouse') return g(25, 25, 'light');
  if (area(r) < 120) return [{ x: cx(r), y: cy(r), kind: 'fixture2x4' }];
  return g(10, 8, 'fixture2x4');
}
// smoke and CO alarms in a dwelling -> [{ floor, x, y, kind, room }]: IRC R314 smoke alarms in every sleeping room,
// outside each sleeping area and on every story; IRC R315 CO alarms outside sleeping areas where there is a fuel-burning
// appliance or an attached garage
export function alarms(d) {
  const out = [], rooms = d.rooms || []; if (!isRes(d.use)) return out;
  const co = gasService(d) || rooms.some(r => r.type === 'garage'), doors = d.doors || [], byId = new Map(rooms.map(r => [r.id, r]));
  const add = (r, kind, dx = 0, dy = 0) => out.push({ floor: r.floor, x: cx(r) + dx, y: cy(r) + dy, kind, room: r.id });
  for (const r of rooms.filter(q => BEDS.includes(q.type))) add(r, 'smoke', 0, -Math.min(2.5, r.d / 4));
  const outside = new Set();
  for (const o of doors) for (const [a, b] of [[o.a, o.b], [o.b, o.a]]) { const A = byId.get(a), B = byId.get(b); if (A && B && BEDS.includes(A.type) && !BEDS.includes(B.type) && !SMALL.includes(B.type) && !['bath', 'half_bath', 'garage'].includes(B.type)) outside.add(B.id); }
  for (const id of outside) { const r = byId.get(id); add(r, 'smoke', -1.2, 0); if (co) add(r, 'co', 1.2, 0); }
  for (let f = 1; f <= d.floors; f++) if (!out.some(a => a.floor === f)) { const fr = roomsOn(d, f).filter(r => r.type !== 'garage'); if (fr.length) { const r = central(fr, d.W, d.D); add(r, 'smoke', -1.2, 0); if (co && f === 1 && !out.some(a => a.kind === 'co')) add(r, 'co', 1.2, 0); } }
  return out;
}

// ---------- rules: HVAC ----------
const COND_EXCL = ['garage', 'porch', 'warehouse', 'walk_in_cooler'];
export const conditioned = r => !COND_EXCL.includes(r.type);
// floor area a ton of cooling covers, by rule of thumb (a Manual J / ASHRAE load calculation governs)
export function sfPerTon(use, type) { if (isRes(use)) return 550; if (['dining_room', 'commercial_kitchen'].includes(type)) return 200; if (['sanctuary', 'classroom'].includes(type)) return 250; return 350; }
export const coolingTons = (rooms, use) => sum(rooms.filter(conditioned), r => area(r) / sfPerTon(use, r.type));
export const roundTons = v => Math.max(1.5, Math.ceil(num(v) * 2) / 2);
export const RTU_SIZES = [3, 4, 5, 6, 7.5, 8.5, 10, 12.5, 15, 20, 25];
const NO_SUPPLY = ['closet', 'walk_in_closet', 'pantry', 'stair', 'garage', 'porch', 'walk_in_cooler', 'mechanical', 'electrical', 'warehouse'];
// supply diffusers in a room: one per ~150 sf in homes, ~250 sf commercial; none in closets, stairs, garages; commercial
// restrooms and janitor rooms are exhausted and take transfer air
export function diffusers(r, res = true) {
  if (NO_SUPPLY.includes(r.type) || (!res && ['restroom', 'janitor'].includes(r.type)) || area(r) < 20) return [];
  const cnt = Math.min(80, Math.max(1, Math.round(area(r) / (res ? 150 : 250))));
  return spread(r, cnt);
}
// the HVAC systems of a design: homes get split systems (AHU + condensing unit) of at most 5 tons, floors grouped from
// the bottom; commercial gets rooftop units per tenant or per large room, at most about 3,500 sf and 25 tons each.
// -> { systems: [{ tag, cu, kind, tons, cfm, area, floors, roomIds, zone, unit: { floor, x, y, where } }], exhaust, vents, hood, tons, area }
export function hvacLayout(t, d) {
  const res = isRes(d.use), F = d.floors, rooms = d.rooms || [], systems = [], exhaust = [], vents = [];
  if (res) {
    let groups = [], cur = null;
    for (let f = 1; f <= F; f++) {
      const fr = roomsOn(d, f).filter(conditioned), tn = coolingTons(fr, d.use);
      if (cur && (cur.tn + tn > 5 || cur.floors.length >= 2)) { groups.push(cur); cur = null; } // one system serves at most two floors
      if (!cur) cur = { floors: [], rooms: [], tn: 0 }; cur.floors.push(f); cur.rooms.push(...fr); cur.tn += tn;
    }
    if (cur) groups.push(cur);
    // one floor over 5 tons: two systems, left and right
    groups = groups.flatMap(gp => gp.tn <= 5.25 ? [gp] : [true, false].map(L => { const rs = gp.rooms.filter(r => (cx(r) < d.W / 2) === L); return { floors: gp.floors, rooms: rs, tn: coolingTons(rs, d.use), half: L ? 'left' : 'right' }; }).filter(x => x.rooms.length));
    groups.forEach((gp, i) => {
      const top = Math.max(...gp.floors), low = Math.min(...gp.floors), tons = Math.min(5, roundTons(gp.tn));
      const closet = rooms.find(r => r.floor === low && r.type === 'mechanical') || (low === 1 && rooms.find(r => r.floor === 1 && r.type === 'garage')) || gp.rooms.find(r => r.floor === low && ['laundry', 'storage', 'closet'].includes(r.type) && area(r) >= 12);
      let unit;
      if (top === F || !closet) { const c = central(gp.rooms.filter(r => r.floor === top), d.W, d.D); unit = { floor: top, x: cx(c), y: cy(c), where: 'attic' }; }
      else unit = closet.type === 'garage' ? { floor: low, x: closet.x + closet.w - 2.2, y: closet.y + closet.d - 2, where: 'garage' } : { floor: low, x: cx(closet), y: cy(closet), where: closet.type };
      systems.push({ tag: 'AHU-' + (i + 1), cu: 'CU-' + (i + 1), kind: d.systems?.hvac === 'heat_pump' ? 'hp' : 'split', tons, cfm: tons * 400, area: sum(gp.rooms, area), floors: gp.floors, roomIds: new Set(gp.rooms.map(r => r.id)), zone: i, unit });
    });
  } else {
    let k = 0, z = 0;
    for (let f = 1; f <= F; f++) {
      const fr = roomsOn(d, f).filter(conditioned), ten = tenantsOn(d, f); if (!fr.length) continue;
      let zones;
      if (ten.length) zones = ten.map(x => x.rooms.filter(conditioned)).filter(x => x.length);
      else {
        const mains = fr.filter(r => area(r) >= 1500 && !['corridor', 'stair', 'restroom', 'storage', 'mechanical'].includes(r.type));
        zones = mains.length ? mains.map(m => [m]) : [fr];
        if (mains.length) for (const r of fr.filter(q => !mains.includes(q))) zones.reduce((p, q) => dist(q[0], r) < dist(p[0], r) ? q : p).push(r);
      }
      for (const zr of zones) {
        const a = sum(zr, area), tn = coolingTons(zr, d.use), cnt = clamp(Math.max(Math.ceil(a / 3500), Math.ceil(tn / 25)), 1, 24), per = up(tn / cnt, RTU_SIZES);
        const main = zr.reduce((p, q) => area(q) > area(p) ? q : p), long = main.w >= main.d;
        for (let i = 0; i < cnt; i++) {
          const u = (i + 0.5) / cnt, x = long ? main.x + main.w * u : cx(main), y = long ? cy(main) : main.y + main.d * u;
          systems.push({ tag: 'RTU-' + (++k), kind: 'rtu', tons: per, cfm: per * 400, area: a / cnt, floors: [f], roomIds: new Set(zr.map(r => r.id)), zone: z, unit: { floor: f, x, y, where: 'roof' } });
        }
        z++;
      }
    }
  }
  // exhaust: baths 80 cfm (half baths and laundry 50), commercial restrooms 75 cfm a water closet, janitor 75
  for (const r of rooms) {
    const cfm = r.type === 'bath' ? 80 : r.type === 'half_bath' ? 50 : r.type === 'laundry' && res ? 50 : r.type === 'restroom' ? 75 * Math.max(1, wcIn(r)) : r.type === 'janitor' ? 75 : 0;
    if (cfm) exhaust.push({ tag: 'EF-' + (exhaust.length + 1), room: r, floor: r.floor, x: cx(r) + Math.min(1.5, r.w / 4), y: cy(r) + Math.min(1.5, r.d / 4), cfm });
  }
  // warehouse: ventilation only (about 1 cfm/sf of relief, a wall fan per ~10,000 sf) and intake louvers at the front
  for (const r of rooms.filter(q => q.type === 'warehouse')) {
    const cnt = Math.max(1, Math.ceil(area(r) / 10000)), s = r.ext?.back ? 'back' : r.ext?.right ? 'right' : r.ext?.left ? 'left' : 'front';
    for (let i = 0; i < cnt; i++) { const p = onWall(r, s, (i + 0.5) / cnt); vents.push({ tag: 'EF-' + (exhaust.length + vents.length + 1), room: r, floor: r.floor, ...p, side: s, cfm: Math.round(area(r) / cnt / 500) * 500 }); }
  }
  const kit = rooms.find(r => r.type === 'commercial_kitchen'), hood = kit ? { room: kit, x: kit.x + 2, y: kit.y + kit.d - 4.5, w: Math.min(16, kit.w - 4), d: 4 } : null;
  return { systems, exhaust, vents, hood, tons: sum(systems, s => s.tons), area: sum(rooms.filter(conditioned), area) };
}
function heatOf(d, s) {
  if (s.kind === 'rtu') { const mbh = up(s.tons * 25, [60, 90, 125, 150, 180, 250, 300, 400]); return { text: 'Gas heat ' + mbh + ' MBH in', kw: 0 }; }
  if (s.kind === 'hp' || !gasService(d)) { const kw = up(s.tons * 2.5, [5, 8, 10, 15, 20]); return { text: (s.kind === 'hp' ? 'Heat pump + ' : 'Electric ') + kw + ' kW strip', kw }; }
  return { text: 'Gas furnace ' + up(s.tons * 20, [40, 60, 80, 100, 120]) + ' MBH, 95% AFUE', kw: 0 };
}
const effOf = s => s.kind === 'rtu' ? (s.tons < 5.4 ? 'SEER2 ≥ 13.4' : s.tons < 11.25 ? 'IEER ≥ 14.8' : s.tons < 20 ? 'IEER ≥ 14.2' : 'IEER ≥ 13.5') : s.kind === 'hp' ? 'SEER2 ≥ 15.2, HSPF2 ≥ 7.8' : 'SEER2 ≥ 15.2';
const mcaOf = s => s.kind === 'rtu' ? Math.round(s.tons * 3.6 + 3) : Math.round(s.tons * 6 + 1);

// ---------- rules: plumbing ----------
// fixtures (IPC 2021 Table E103.3(2) supply fixture units, Table 709.1 drainage fixture units; pipe sizes typical)
export const FIX = {
  WC: { name: 'Water closet, tank, 1.28 gpf', cold: 2.2, hot: 0, wsfu: 2.2, dfu: 3, cw: '1/2"', hw: '—', w: '3"', v: '2"', ft: 2.5, dp: 2.4 },
  WCA: { name: 'Water closet, accessible (public)', cold: 5, hot: 0, wsfu: 5, dfu: 4, cw: '1"', hw: '—', w: '3"', v: '2"', ft: 3, dp: 2.5 },
  LAV: { name: 'Lavatory', cold: 0.5, hot: 0.5, wsfu: 0.7, dfu: 1, cw: '1/2"', hw: '1/2"', w: '1-1/4"', v: '1-1/4"', ft: 2, dp: 1.7 },
  LAVA: { name: 'Lavatory, accessible (public)', cold: 1.5, hot: 1.5, wsfu: 2, dfu: 1, cw: '1/2"', hw: '1/2"', w: '1-1/2"', v: '1-1/4"', ft: 2.2, dp: 1.8 },
  TUB: { name: 'Bathtub / shower', cold: 1, hot: 1, wsfu: 1.4, dfu: 2, cw: '1/2"', hw: '1/2"', w: '1-1/2"', v: '1-1/2"', ft: 5, dp: 2.6 },
  SHR: { name: 'Shower', cold: 1, hot: 1, wsfu: 1.4, dfu: 2, cw: '1/2"', hw: '1/2"', w: '2"', v: '1-1/2"', ft: 3.2, dp: 3.2 },
  KS: { name: 'Kitchen sink (with disposal)', cold: 1, hot: 1, wsfu: 1.4, dfu: 2, cw: '1/2"', hw: '1/2"', w: '1-1/2"', v: '1-1/2"', ft: 3, dp: 2 },
  DW: { name: 'Dishwasher', cold: 0, hot: 1.4, wsfu: 1.4, dfu: 2, cw: '—', hw: '1/2"', w: '(to KS)', v: '—', ft: 2, dp: 2 },
  WB: { name: 'Clothes washer box', cold: 1, hot: 1, wsfu: 1.4, dfu: 2, cw: '1/2"', hw: '1/2"', w: '2"', v: '1-1/2"', ft: 2.5, dp: 2.4 },
  MS: { name: 'Mop / service sink', cold: 2.25, hot: 2.25, wsfu: 3, dfu: 3, cw: '1/2"', hw: '1/2"', w: '3"', v: '1-1/2"', ft: 2.2, dp: 2.2 },
  CKS: { name: 'Three-compartment sink', cold: 3, hot: 3, wsfu: 4, dfu: 3, cw: '3/4"', hw: '3/4"', w: '2" (indirect)', v: '1-1/2"', ft: 7, dp: 2.2 },
  HS: { name: 'Hand sink (food service)', cold: 1.5, hot: 1.5, wsfu: 2, dfu: 1, cw: '1/2"', hw: '1/2"', w: '1-1/2"', v: '1-1/4"', ft: 1.6, dp: 1.4 },
  PS: { name: 'Prep sink', cold: 1.5, hot: 1.5, wsfu: 2, dfu: 2, cw: '1/2"', hw: '1/2"', w: '1-1/2" (indirect)', v: '1-1/2"', ft: 2.4, dp: 2 },
  FD: { name: 'Floor drain (trap primer)', cold: 0, hot: 0, wsfu: 0, dfu: 2, cw: '—', hw: '—', w: '3"', v: '2"', ft: 1, dp: 1 },
  DF: { name: 'Drinking fountain, hi-lo', cold: 0.25, hot: 0, wsfu: 0.25, dfu: 1, cw: '1/2"', hw: '—', w: '1-1/4"', v: '1-1/4"', ft: 3, dp: 1.6 },
  HB: { name: 'Hose bibb, frost-free', cold: 2.5, hot: 0, wsfu: 2.5, dfu: 0, cw: '3/4"', hw: '—', w: '—', v: '—', ft: 1, dp: 1 }
};
const wcIn = r => r.type !== 'restroom' ? 0 : area(r) <= 110 ? 1 : Math.max(1, Math.floor(area(r) / 60));
// the fixtures a room gets by its kind -> [codes]
export function fixturesFor(r, use) {
  const res = isRes(use), big = area(r) >= 90 || /primary|master/i.test(r.name || '');
  switch (r.type) {
    case 'bath': return big ? ['WC', 'LAV', 'LAV', 'SHR', 'TUB'] : ['WC', 'LAV', 'TUB'];
    case 'half_bath': return ['WC', 'LAV'];
    case 'kitchen': return res ? ['KS', 'DW'] : ['KS'];
    case 'living': case 'family': case 'dining': return /kitchen/i.test(r.name || '') ? ['KS', 'DW'] : [];
    case 'laundry': return ['WB'];
    case 'restroom': { const k = wcIn(r); return [...Array(k).fill(res ? 'WC' : 'WCA'), ...Array(Math.max(1, Math.ceil(k / 2))).fill(res ? 'LAV' : 'LAVA'), ...(res ? [] : ['FD'])]; }
    case 'commercial_kitchen': return ['CKS', 'HS', 'HS', 'PS', 'MS', 'FD', 'FD', 'FD'];
    case 'janitor': return ['MS', 'FD'];
    case 'break_room': return ['KS'];
    case 'exam': return ['LAV'];
    default: return [];
  }
}
// every wet room's fixtures, plus the building's: a service sink and a drinking fountain where a commercial building has
// none, two hose bibbs -> [{ room, codes }], extra: ['HB', …]
export function plumbingFixtures(d) {
  const list = (d.rooms || []).map(r => ({ room: r, codes: fixturesFor(r, d.use) })).filter(x => x.codes.length), res = isRes(d.use);
  if (!res) {
    const has = c => list.some(x => x.codes.includes(c)), rr = list.find(x => x.room.type === 'restroom' && x.room.floor === 1);
    if (!has('MS')) { const host = (d.rooms || []).find(r => r.floor === 1 && ['storage', 'mechanical'].includes(r.type)); if (host) list.push({ room: host, codes: ['MS'] }); else if (rr) rr.codes.push('MS'); }
    if (!has('DF') && rr) rr.codes.push('DF');
  }
  return { list, extra: ['HB', 'HB'] };
}
export function fixtureTotals(d, mult = 1) {
  const { list, extra } = plumbingFixtures(d), counts = {};
  for (const c of list.flatMap(x => x.codes).concat(extra)) counts[c] = (counts[c] || 0) + mult;
  const tot = k => sum(Object.entries(counts), ([c, q]) => (FIX[c]?.[k] || 0) * q);
  return { counts, wsfu: tot('wsfu'), hot: tot('hot'), dfu: tot('dfu') };
}
// IPC 2021 Table 2902.1 minimum fixtures: the occupant load splits 50/50 by sex, each side rounded up (IPC 2902.1.1);
// separate facilities aren't needed for 15 or fewer people, or mercantile with 100 or fewer (IPC 2902.2)
export function ipcRequired(occ, load) {
  const L = Math.max(0, Math.ceil(num(load))), o = String(occ || 'B').toUpperCase(), half = Math.ceil(L / 2);
  const per = (q, r) => Math.ceil(q / r), single = L <= 15 || (o.startsWith('M') && L <= 100);
  const both = f => single ? Math.max(1, f(L)) : 2 * Math.max(1, f(half));
  let wc, lav, df, ss = 1;
  if (o.startsWith('M')) { wc = both(q => per(q, 500)); lav = both(q => per(q, 750)); df = Math.max(1, per(L, 1000)); }
  else if (o.startsWith('A-2')) { wc = both(q => per(q, 75)); lav = both(q => per(q, 200)); df = Math.max(1, per(L, 500)); }
  else if (o.startsWith('A-3')) { wc = single ? 1 : Math.max(1, per(half, 150)) + Math.max(1, per(half, 75)); lav = both(q => per(q, 200)); df = Math.max(1, per(L, 1000)); }
  else if (o.startsWith('S')) { wc = both(q => per(q, 100)); lav = both(q => per(q, 100)); df = Math.max(1, per(L, 1000)); }
  else { wc = both(q => q <= 50 ? per(q, 25) : 2 + per(q - 50, 50)); lav = both(q => q <= 80 ? per(q, 40) : 2 + per(q - 80, 80)); df = Math.max(1, per(L, 100)); }
  if (L === 0) { wc = 0; lav = 0; df = 0; ss = 0; }
  return { load: L, wc, lav, df, ss };
}
export function fixturesProvided(d) { const c = fixtureTotals(d).counts; return { wc: (c.WC || 0) + (c.WCA || 0), lav: (c.LAV || 0) + (c.LAVA || 0), df: c.DF || 0, ss: c.MS || 0 }; }
// water heaters: homes one (tankless gas 199 MBH, or a tank sized by the baths); multi-tenant shells a small heater per
// tenant restroom; restaurants a gas tank sized by the kitchen; others one electric tank near the restrooms
export function waterHeaters(t, d) {
  const wh = d.systems?.water_heater || (isRes(d.use) ? 'tankless_gas' : 'tank_electric'), rooms = d.rooms || [], { list } = plumbingFixtures(d), out = [];
  const hotRooms = list.filter(x => x.codes.some(c => FIX[c]?.hot > 0)).map(x => x.room);
  if (wh === 'none' || !hotRooms.length) return out;
  const gas = /gas/.test(wh), tankless = /tankless/.test(wh);
  if (isRes(d.use)) {
    const baths = rooms.filter(r => r.type === 'bath').length + rooms.filter(r => r.type === 'half_bath').length / 2;
    const host = firstOf(rooms, ['garage', 'mechanical', 'laundry', 'storage']) || hotRooms[0], s = host.type === 'garage' ? { x: host.x + 1.5, y: host.y + host.d - 1.5 } : { x: cx(host), y: cy(host) };
    out.push({ tag: 'WH-1', floor: host.floor, ...s, room: host, serves: hotRooms.map(r => r.id), gas, size: tankless ? (gas ? 'Tankless gas, 199 MBH, ~9.5 gpm at 60°F rise, UEF ≥ 0.90' : 'Tankless electric, 27 kW, 240 V') : (baths <= 2 ? 40 : baths <= 3.5 ? 50 : 75) + ' gal ' + (gas ? 'gas, 40 MBH' : 'electric, 4.5 kW'), kw: tankless ? (gas ? 0 : 27) : gas ? 0 : 4.5, basis: plural(baths, 'bath') + '; ' + (tankless ? 'two showers and a lavatory at once' : 'first-hour rating ≥ 60 gal') });
    return out;
  }
  const ten = tenantsOn(d, 1);
  if (ten.length) {
    ten.forEach((tn, i) => { const rr = tn.rooms.find(r => hotRooms.includes(r)); if (rr) out.push({ tag: 'EWH-' + (i + 1), floor: 1, x: rr.x + rr.w - 1.5, y: rr.y + rr.d - 1.5, room: rr, serves: tn.rooms.filter(r => hotRooms.includes(r)).map(r => r.id), gas: false, size: '6 gal electric, point of use, 2 kW', kw: 2, basis: 'Tenant ' + tn.id + ' restroom' }); });
    const rest = hotRooms.filter(r => !out.some(w => w.serves.includes(r.id)));
    if (rest.length) out.push({ tag: 'EWH-' + (out.length + 1), floor: rest[0].floor, x: rest[0].x + rest[0].w - 1.5, y: rest[0].y + rest[0].d - 1.5, room: rest[0], serves: rest.map(r => r.id), gas: false, size: '10 gal electric, 3 kW', kw: 3, basis: 'Upper-floor restrooms' });
    return out;
  }
  const { counts } = fixtureTotals(d), gph = (counts.LAVA || 0) * 8 + (counts.LAV || 0) * 4 + (counts.MS || 0) * 15 + (counts.CKS || 0) * 30 + (counts.HS || 0) * 5 + (counts.PS || 0) * 10 + (counts.SHR || 0) * 30 + (counts.KS || 0) * 10;
  const gal = up(gph * 0.8, [10, 20, 30, 40, 50, 80, 100, 120]), host = firstOf(rooms, ['mechanical', 'janitor', 'storage', 'electrical']) || hotRooms[0];
  out.push({ tag: 'WH-1', floor: host.floor, x: host.x + Math.min(2, host.w / 2), y: host.y + host.d - Math.min(2, host.d / 2), room: host, serves: hotRooms.map(r => r.id), gas, size: gal + ' gal ' + (gas ? 'gas, ' + up(gal * 1.6, [40, 76, 100, 150, 199]) + ' MBH' : 'electric, ' + (gal <= 50 ? 4.5 : 9) + ' kW'), kw: gas ? 0 : gal <= 50 ? 4.5 : 9, basis: 'Peak hot water ~' + f0(gph) + ' gph by fixture count (ASHRAE method); ' + (d.use === 'restaurant' ? 'kitchen equipment to confirm' : 'confirm') });
  return out;
}

// ---------- rules: fire sprinklers and alarm ----------
export const HAZARDS = {
  light: { label: 'Light hazard', area: 225, s: 15, density: '0.10 gpm/sf over 1,500 sf', head: 'K5.6 quick-response pendent / concealed' },
  oh1: { label: 'Ordinary hazard, group 1', area: 130, s: 15, density: '0.15 gpm/sf over 1,500 sf', head: 'K5.6 / K8.0 quick-response' },
  oh2: { label: 'Ordinary hazard, group 2', area: 130, s: 15, density: '0.20 gpm/sf over 1,500 sf', head: 'K8.0 quick-response' },
  esfr: { label: 'Storage (S-1), ESFR', area: 100, s: 12, density: 'ESFR: 12 heads at the design pressure (NFPA 13 ch. 23); commodity class and storage height to confirm', head: 'K25.2 ESFR pendent' }
};
// NFPA 13 occupancy hazard by room (NFPA 13 A.4.3: offices, churches and restaurant seating light; kitchens, mechanical
// and storage ordinary 1; mercantile ordinary 2; warehouse rack storage ESFR)
export function hazardOf(use, type) {
  if (type === 'warehouse') return 'esfr';
  if (['commercial_kitchen', 'walk_in_cooler', 'mechanical', 'electrical', 'garage', 'storage', 'janitor', 'laundry'].includes(type)) return 'oh1';
  if (use === 'retail' || use === 'fuel' || type === 'sales') return 'oh2';
  return 'light';
}
// heads on a rectangular grid: no more than the hazard's spacing each way and its area per head
export function sprinklerGrid(r, hz = 'light') {
  const H = HAZARDS[hz] || HAZARDS.light, w = Math.max(1, num(r.w)), dd = Math.max(1, num(r.d));
  let nx = Math.max(1, Math.ceil(w / H.s)), ny = Math.max(1, Math.ceil(dd / H.s));
  while ((w / nx) * (dd / ny) > H.area) { if (w / nx >= dd / ny) nx++; else ny++; }
  const xs = Array.from({ length: nx }, (_, i) => r.x + (i + 0.5) * w / nx), ys = Array.from({ length: ny }, (_, j) => r.y + (j + 0.5) * dd / ny);
  return { hz, nx, ny, sx: w / nx, sy: dd / ny, count: nx * ny, xs, ys };
}
// horn/strobes: one in each restroom, one per ~2,500 sf of open room; none in closets and stairs
export function hornStrobes(r) {
  if (area(r) < 50 || ['closet', 'walk_in_closet', 'pantry', 'stair', 'walk_in_cooler'].includes(r.type)) return [];
  return spread(r, r.type === 'restroom' ? 1 : Math.max(1, Math.ceil(area(r) / 2500)));
}
const riserRoom = d => firstOf(d.rooms || [], ['mechanical', 'electrical', 'janitor', 'storage']) || (d.rooms || []).find(r => r.floor === 1 && r.type === 'warehouse') || (d.rooms || []).find(r => r.floor === 1 && r.ext?.front) || (d.rooms || [])[0];
// the sprinkler riser: in a service room, just inside the nearest stretch of outline wall that room has (the FDC and the
// fire line go through that wall)
function riserOf(d) {
  const r = riserRoom(d), sides = ['front', 'left', 'right', 'back'].filter(q => r.ext?.[q]), w = wallSpot(d, { x: cx(r), y: cy(r) }, sides.length ? sides : undefined), [ix, iy] = outward(w.side, -Math.min(2.5, r.w / 3, r.d / 3));
  let p = { x: w.x + ix, y: w.y + iy }; if (!(p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.d)) p = { x: clamp(p.x, r.x + Math.min(1, r.w / 2), r.x + r.w - Math.min(1, r.w / 2)), y: clamp(p.y, r.y + Math.min(1, r.d / 2), r.y + r.d - Math.min(1, r.d / 2)) };
  return { room: r, side: w.side, wall: w, ...p };
}
// which way a door opens into its room, along the door's normal (+1 toward larger x or y)
const doorInto = (d, o) => { const r = (d.rooms || []).find(q => q.id === o.a) || (d.rooms || []).find(q => q.id === o.b); return o.orient === 'h' ? (r ? Math.sign(cy(r) - o.y1) || 1 : o.y1 < d.D / 2 ? 1 : -1) : (r ? Math.sign(cx(r) - o.x1) || 1 : o.x1 < d.W / 2 ? 1 : -1); };
const mainEntry = d => (d.doors || []).filter(o => o.exterior && o.kind !== 'overhead').sort((a, b) => (a.side === 'front' ? 0 : 1) - (b.side === 'front' ? 0 : 1) || b.width - a.width)[0];

// ---------- rules: telecom ----------
// data outlets: homes 1–2 a room people live and work in; commercial one per ~100 sf of office, four a tenant or sales
// floor (point of sale and the back wall), a few in a warehouse
export function dataOutlets(r, res = true) {
  if (res) return { living: 2, family: 2, bedroom: 1, primary_bedroom: 2, office: 2, flex: 2, kitchen: 1 }[r.type] || 0;
  if (['office', 'exam', 'reception', 'conference', 'break_room', 'classroom'].includes(r.type)) return clamp(Math.ceil(area(r) / 100), 1, 48);
  if (['tenant', 'sales', 'dining_room', 'sanctuary', 'lobby'].includes(r.type)) return clamp(Math.ceil(area(r) / 1000), 4, 24);
  if (r.type === 'warehouse') return clamp(Math.ceil(area(r) / 10000), 2, 12);
  if (r.type === 'commercial_kitchen') return 2;
  return 0;
}
export const wapCount = (a, res = true) => Math.max(1, Math.ceil(num(a) / (res ? 1500 : 2500)));
// the head end: a structured media enclosure (homes, on the garage wall the house shares) or the MPOE backboard; the
// fiber enters at the nearest clear stretch of outside wall
const smeOf = d => { const r = firstOf(d.rooms || [], isRes(d.use) ? ['garage', 'laundry', 'mechanical', 'closet', 'storage'] : ['electrical', 'mechanical', 'storage', 'janitor', 'office']) || (d.rooms || [])[0]; const s = r.type === 'garage' ? 'back' : extSide(d, r, ['back', 'left', 'right', 'front']) || 'back', p = onWall(r, s, 0.6), [ox, oy] = outward(s, -1.2), q = { x: p.x + ox, y: p.y + oy }; return { room: r, side: s, ...q, entry: wallSpot(d, q, ['front', 'left', 'right']) }; }; // fiber comes from the street side

// ---------- rules: structure ----------
// interior beam lines so no bay of slab is wider than `max`: prefer walls already there, add lines where none fit
export function beamLines(cands, L, max = 20, min = 8) {
  const c = [...new Set(cands.map(v => Math.round(num(v) * 2) / 2))].filter(v => v > 2 && v < L - 2).sort((a, b) => a - b), out = [];
  let last = 0;
  while (L - last > max) {
    const pk = c.filter(v => v >= last + min && v <= last + max).pop();
    const next = pk ?? last + (L - last) / Math.ceil((L - last) / max);
    out.push(next); last = next;
  }
  return out;
}
// a structural grid of about `bay` ft each way, lines at the ends
export function structGrid(W, D, bay = 40) {
  const nx = Math.max(1, Math.ceil(W / bay)), ny = Math.max(1, Math.ceil(D / bay));
  return { xs: Array.from({ length: nx + 1 }, (_, i) => W * i / nx), ys: Array.from({ length: ny + 1 }, (_, j) => D * j / ny), sx: W / nx, sy: D / ny };
}
// a square spread footing for a tributary area (sf) at a load (psf) on soil of `bearing` psf -> { kips, side (ft) }
export function footingSize(trib, psf, bearing = 1500) { const P = num(trib) * num(psf); return { kips: Math.round(P / 100) / 10, side: Math.max(3, Math.ceil(Math.sqrt(P / bearing) * 2) / 2) }; }
const LIVE = { sfr: '40 psf living, 30 psf sleeping', townhomes: '40 psf living, 30 psf sleeping', duplex: '40 psf living, 30 psf sleeping', retail: '100 psf (first floor), 75 psf above', restaurant: '100 psf', office: '50 psf + 15 psf partitions; corridors 80 psf', medical: '50 psf + 15 psf partitions; corridors 80 psf', church: '100 psf (movable seats)', industrial: '125 psf light storage / 250 psf heavy (confirm racking)', fuel: '100 psf', amenity: '100 psf', other: '50 psf + 15 psf partitions' };
const floorPsf = use => isRes(use) ? 10 + 40 : use === 'industrial' ? 250 + 60 : ['retail', 'restaurant', 'church', 'fuel', 'amenity'].includes(use) ? 100 + 60 : 65 + 60;
const steelFrame = (t, d) => !isRes(d.use) && (String(t.construction).startsWith('II') || /steel|tilt|masonry/i.test(d.systems?.structure || ''));
const ptSlab = d => /post|PT\b|tension/i.test(d.systems?.foundation || '') || isRes(d.use);

// ---------- rules: electrical loads, panels and service ----------
const LIGHT_VA = { retail: 1.9, fuel: 1.9, restaurant: 1.5, office: 1.3, medical: 1.6, church: 2.2, industrial: 1.3, amenity: 1.5, foodtrucks: 1.5, other: 1.3 };
const lightVA = (use, r) => area(r) * (r.type === 'warehouse' ? 1.2 : LIGHT_VA[use] || 1.3);
const RES_SIZES = [100, 150, 200, 320, 400], COM_SIZES = [200, 400, 600, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000], PANEL_SIZES = [60, 100, 125, 150, 200, 225, 400, 600];
const BKR = [15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200];
// copper THWN-2 at 75°C for a feeder of `amps` (NEC Table 310.16), parallel sets above 400 A; the EOR sizes the real ones
export function wireFor(amps) {
  const T1 = [[20, '#12'], [30, '#10'], [50, '#8'], [65, '#6'], [85, '#4'], [100, '#3'], [130, '#1'], [150, '#1/0'], [175, '#2/0'], [200, '#3/0'], [230, '#4/0'], [255, '250 kcmil'], [310, '350 kcmil'], [380, '500 kcmil']];
  const a = num(amps), one = T1.find(([c]) => c >= a); if (one) return one[1];
  const sets = Math.ceil(a / 380); const per = T1.find(([c]) => c >= a / sets); return sets + ' sets ' + (per ? per[1] : '500 kcmil');
}
const recCount = (d, rs) => sum(rs, r => receptacles(r, { res: isRes(d.use), doors: (d.doors || []).filter(o => o.floor === r.floor), W: d.W, attached: d.attached }).length);
// a dwelling's panel: circuits by rule (NEC 210.11 small-appliance, laundry and bath circuits, dedicated appliance
// circuits, AFCI lighting and receptacle circuits) -> [{ desc, qty, poles, amps, va }]
function dwellingCircuits(t, d) {
  const H = hvacLayout(t, d), rooms = d.rooms || [], gas = gasService(d), c = [], add = (desc, poles, amps, va, qty = 1) => c.push({ desc, qty, poles, amps, va: Math.round(va) });
  for (const s of H.systems) { add(s.cu + ' condensing unit (' + f1(s.tons) + ' t)', 2, up(s.tons * 9, BKR), s.tons * 1150); const h = heatOf(d, s); if (h.kw) add(s.tag + ' air handler + ' + h.kw + ' kW heat', 2, up(h.kw * 1000 / 240 * 1.25, BKR), h.kw * 1000 + 700); else add(s.tag + ' furnace / air handler', 1, 15, 700); }
  for (const w of waterHeaters(t, d)) w.kw >= 20 ? add(w.tag + ' tankless water heater', 2, 40, w.kw * 1000 / 3, 3) : w.kw ? add(w.tag + ' water heater', 2, 30, w.kw * 1000) : add(w.tag + ' water heater controls (gas)', 1, 15, 120);
  add('Dryer', 2, 30, 5000); gas ? add('Range (gas) igniter / clock', 1, 20, 180) : add('Range', 2, 50, 8000);
  add('EV charger, ready (optional)', 2, 50, 0);
  add('Kitchen small-appliance (GFCI)', 1, 20, 1500, 2); add('Dishwasher', 1, 20, 1200); add('Disposal', 1, 20, 900); add('Microwave / hood', 1, 20, 1500); add('Refrigerator', 1, 20, 800);
  if (rooms.some(r => r.type === 'laundry')) add('Laundry (GFCI)', 1, 20, 1500);
  const baths = rooms.filter(r => ['bath', 'half_bath'].includes(r.type)).length; if (baths) add('Bath receptacles (GFCI)', 1, 20, 180 * baths, Math.max(1, Math.ceil(baths / 2)));
  if (rooms.some(r => r.type === 'garage')) { add('Garage receptacles (GFCI)', 1, 20, 1080); add('Garage door opener', 1, 20, 600); }
  add('Exterior receptacles (GFCI, WR)', 1, 20, 360);
  for (let f = 1; f <= d.floors; f++) { const fr = roomsOn(d, f).filter(conditioned), a = sum(fr, area); add('Lighting + smoke alarms, floor ' + f + ' (AFCI)', 1, 15, a * 1.5, Math.max(1, Math.ceil(a / 1200))); const rc = recCount(d, fr.filter(r => !['kitchen', 'bath', 'half_bath', 'laundry'].includes(r.type))); if (rc) add('General receptacles, floor ' + f + ' (AFCI)', 1, 20, rc * 180, Math.max(1, Math.ceil(rc / 8))); }
  add('Spare', 1, 20, 0, 2);
  return c;
}
// NEC 220 Part III standard calculation for a dwelling -> { lines: [[desc, va]], total, amps, service, volts }
export function dwellingLoad(t, d) {
  const H = hvacLayout(t, d), living = sum((d.rooms || []).filter(conditioned), area), gas = gasService(d), lines = [];
  const gl = living * 3, base = gl + 3000 + 1500, baseD = Math.min(base, 3000) + Math.max(0, Math.min(base, 120000) - 3000) * 0.35 + Math.max(0, base - 120000) * 0.25;
  lines.push(['General lighting 3 VA/sf × ' + f0(living) + ' sf (220.12)', gl], ['Small-appliance 2 × 1,500 + laundry 1,500', 4500], ['Demand: 3,000 at 100%, rest at 35% (220.42)', baseD]);
  const fixed = [['Dishwasher', 1200], ['Disposal', 900], ['Microwave / hood', 1500], ...waterHeaters(t, d).filter(w => w.kw).map(w => [w.tag + ' water heater', w.kw * 1000])];
  const fixedD = sum(fixed, x => x[1]) * (fixed.length >= 4 ? 0.75 : 1); lines.push(['Fixed appliances (' + fixed.length + (fixed.length >= 4 ? ', at 75%' : '') + ', 220.53)', fixedD]);
  lines.push(['Dryer (220.54)', 5000]); if (!gas) lines.push(['Range, 12 kW (Table 220.55)', 8000]);
  const cool = sum(H.systems, s => s.tons * 1150 + 700), heat = sum(H.systems, s => heatOf(d, s).kw * 1000 + 700);
  lines.push(['A/C or heat, larger (220.60): ' + (cool >= heat ? 'cooling ' + f1(H.tons) + ' t' : 'heat'), Math.max(cool, heat)]);
  const total = sum(lines.slice(2), x => x[1]), amps = total / 240, service = Math.max(up(amps * 1.25, RES_SIZES), living >= 1800 ? 200 : 100);
  return { lines, total, amps, service, volts: '120/240 V, 1Φ, 3W' };
}
// the loads of one commercial tenant or building (VA) by NEC 220.12 unit loads and rules of thumb
function comLoads(d, rooms, H, opts = {}) {
  const sys = H.systems.filter(s => rooms.some(r => s.roomIds.has(r.id))), wh = opts.wh || [], storefronts = (d.doors || []).filter(o => o.exterior && o.kind === 'storefront' && rooms.some(r => r.id === o.a)).length;
  const L = {
    light: sum(rooms, r => lightVA(d.use, r)), rec: recCount(d, rooms) * 180, hvac: sum(sys, s => s.tons * 1300),
    fans: sum(H.exhaust.filter(e => rooms.includes(e.room)), () => 120) + sum(H.vents.filter(e => rooms.includes(e.room)), () => 1500),
    kitchen: sum(rooms.filter(r => r.type === 'commercial_kitchen'), r => area(r) * 15) + (H.hood && rooms.includes(H.hood.room) ? 3500 : 0),
    wh: sum(wh.filter(w => rooms.some(r => w.serves.includes(r.id))), w => w.kw * 1000), sign: storefronts * 1200, ext: (d.doors || []).filter(o => o.exterior && rooms.some(r => r.id === o.a)).length * 150,
    docks: (d.doors || []).filter(o => o.exterior && o.kind === 'overhead' && rooms.some(r => r.id === o.a)).length * 1500,
    refr: d.use === 'fuel' ? sum(rooms.filter(r => r.type === 'sales'), r => area(r) * 8) : 0, fuel: d.use === 'fuel' && opts.building ? 15000 : 0, misc: opts.building ? 1500 : 0
  };
  const demand = L.light * 1.25 + Math.min(L.rec, 10000) + Math.max(0, L.rec - 10000) * 0.5 + L.hvac + L.fans + L.kitchen + L.wh + L.sign + L.ext + L.docks + L.refr + L.fuel + L.misc;
  return { L, sys, demand };
}
const amps3 = (va, v = 208) => va / (v * Math.sqrt(3));
// the building's service: NEC 220 commercial unit loads; 208Y/120 V up to about 1,200 A, 480Y/277 V above
export function commercialLoad(t, d) {
  const H = hvacLayout(t, d), { L, demand } = comLoads(d, d.rooms || [], H, { building: true, wh: waterHeaters(t, d) });
  const lines = [['Lighting, NEC 220.12 unit load × 125%', L.light * 1.25], ['Receptacles, 180 VA each; over 10 kVA at 50% (220.44)', Math.min(L.rec, 10000) + Math.max(0, L.rec - 10000) * 0.5], ['HVAC, ' + f1(H.tons) + ' t at 1.3 kVA/t', L.hvac], ['Exhaust and ventilation fans', L.fans]];
  if (L.kitchen) lines.push(['Kitchen equipment allowance + hood / MAU', L.kitchen]); if (L.wh) lines.push(['Electric water heating', L.wh]); if (L.sign) lines.push(['Sign outlets, 1,200 VA each (600.5)', L.sign]);
  if (L.docks) lines.push(['Dock levelers / doors', L.docks]); if (L.refr) lines.push(['Refrigerated cases and coolers', L.refr]); if (L.fuel) lines.push(['Fuel dispensers and canopy lighting', L.fuel]);
  lines.push(['Exterior lighting, fire alarm, misc.', L.ext + L.misc]);
  const a208 = amps3(demand), hv = a208 * 1.25 > 1200, amps = hv ? amps3(demand, 480) : a208;
  return { lines, total: demand, amps, service: up(amps * 1.25, COM_SIZES), volts: hv ? '480Y/277 V, 3Φ, 4W' : '208Y/120 V, 3Φ, 4W' };
}
export const loadCalc = (t, d) => isRes(d.use) ? dwellingLoad(t, d) : commercialLoad(t, d);
// commercial panels: one a tenant, else one for the building -> [{ name, rooms, circuits, amps, volts }]
function comPanels(t, d) {
  const H = hvacLayout(t, d), wh = waterHeaters(t, d), ten = tenantsOn(d, 1), groups = ten.length ? ten.map(x => ({ name: x.id, rooms: x.rooms })) : [{ name: 'A', rooms: roomsOn(d, 1) }];
  for (let f = 2; f <= d.floors; f++) groups.push({ name: 'F' + f, rooms: roomsOn(d, f) });
  return groups.map(gp => {
    const { L, sys } = comLoads(d, gp.rooms, H, { wh }), c = [], add = (desc, poles, amps, va, qty = 1) => qty > 0 && c.push({ desc, qty, poles, amps, va: Math.round(va) });
    add('Lighting', 1, 20, L.light, Math.max(1, Math.ceil(L.light / 1600))); add('Receptacles (8 per circuit)', 1, 20, L.rec, Math.max(1, Math.ceil(L.rec / 1440)));
    for (const s of sys) add(s.tag + ' rooftop unit (' + f1(s.tons) + ' t)', 3, up(mcaOf(s) * 1.6, BKR), s.tons * 1300);
    const ef = H.exhaust.filter(e => gp.rooms.includes(e.room)).length; add('Exhaust fans', 1, 20, ef * 120, Math.ceil(ef / 6));
    const vf = H.vents.filter(e => gp.rooms.includes(e.room)); add('Warehouse ventilation fans', 3, 15, vf.length * 1500, vf.length);
    for (const w of wh.filter(w => gp.rooms.some(r => w.serves.includes(r.id)))) w.kw && add(w.tag + ' water heater (' + w.kw + ' kW)', w.kw > 4.5 ? 3 : 2, up(w.kw * 1000 / 208 * 1.25, BKR), w.kw * 1000);
    if (L.kitchen) { add('Kitchen equipment (by kitchen consultant)', 1, 20, L.kitchen - 3500, Math.max(2, Math.ceil((L.kitchen - 3500) / 1800))); add('Hood fans / MAU-1', 3, 20, 3500); }
    if (L.sign) add('Sign', 1, 20, L.sign); if (L.ext) add('Exterior wall packs', 1, 20, L.ext); if (L.docks) add('Dock levelers / overhead doors', 3, 20, L.docks, Math.round(L.docks / 1500));
    if (L.refr) add('Refrigerated cases / walk-in', 1, 20, L.refr, Math.ceil(L.refr / 1600));
    if (gp === groups[0]) { add('Fire alarm panel (lock-on)', 1, 20, 500); add('Telecom / data', 1, 20, 500); }
    const va = sum(c, x => x.va), slots = sum(c, x => x.qty * x.poles), amps = up(amps3(va) * 1.25, PANEL_SIZES);
    add('Spare', 1, 20, 0, Math.max(2, Math.ceil(slots * 0.2)));
    return { name: gp.name, rooms: gp.rooms, circuits: c, va, amps, volts: '208Y/120 V, 3Φ, 4W', spaces: up(slots * 1.25 + 2, [24, 30, 42, 54, 66, 84]) };
  });
}
// the type's panels in one shape: [{ name, volts, amps, spaces, circuits }]
export function panelSchedule(t, d) {
  if (!isRes(d.use)) return comPanels(t, d);
  const c = dwellingCircuits(t, d), L = dwellingLoad(t, d), slots = sum(c, x => x.qty * x.poles);
  return [{ name: 'A', volts: L.volts, amps: L.service, spaces: up(slots + 2, [20, 24, 30, 40, 42]), circuits: c, va: sum(c, x => x.va * x.qty) }];
}

// ====================================================================================================================
// ---------- set-wide notes and schedule sheets ----------
const S_NOTES = [
  'These structural sheets are a rule-based schematic basis of design for pricing and coordination. A Texas-licensed structural engineer designs, details and seals the structure.',
  'Design to the IBC / IRC 2021 as adopted by the authority having jurisdiction (AHJ) and ASCE 7-22. Confirm the adopted editions and local amendments.',
  'No geotechnical report yet: foundations assume an allowable bearing of 1,500 psf on expansive clays typical of the Houston region. A geotechnical investigation is required and governs foundation type, PVR, beam depths and moisture treatment.',
  'Post-tensioned slabs: design per PTI DC10.5 for the soils report’s em and ym values; tendons by a PTI-certified supplier; stressing records to the EOR.',
  'Concrete per ACI 318; reinforcing ASTM A615 Grade 60; cover 3" cast against earth, 1-1/2" formed.',
  'Wood framing per the AWC NDS and the IRC: Southern pine No. 2 or better; a continuous load path from roof to foundation with manufactured connectors, hot-dip galvanized at treated lumber.',
  'Structural steel ASTM A992 (W shapes), A500 Gr. C (HSS), A36 (plates, angles); steel joists and joist girders per SJI, designed by the manufacturer for the loads shown; roof deck per SDI.',
  'Components and cladding (windows, doors, roof covering) to be rated for the ASCE 7-22 chapter 30 pressures at the site.',
  'Verify all dimensions with the architectural drawings; do not scale these drawings.'
];
function sNotesBody(ctx, sh) {
  const tw = typesWith(ctx), dc = disc(ctx, 'structural');
  const crit = [['Building code', 'IBC 2021 / IRC 2021 as adopted by the AHJ (verify)'], ['Loads', 'ASCE 7-22'], ['Risk category', 'II'], ['Basic wind speed (ult.)', 'About 140–150 mph, Houston region; verify with the ASCE Hazard Tool'],
    ['Exposure', 'C'], ['Internal pressure', 'Enclosed, GCpi = ±0.18'], ['Seismic', 'Site class D (assumed), seismic design category A'], ['Ground snow', '0 psf'], ['Roof live load', '20 psf (reducible)'],
    ['Roof dead load', '15 psf wood trusses + shingles; 20 psf steel joists + membrane'], ['Soils (assumed)', 'Allowable bearing 1,500 psf; expansive clays — geotechnical report required'], ['Flood', 'Finished floor at or above the elevation the county / FEMA requires (confirm)']];
  const live = [...new Set(tw.map(x => x.t.use))].map(u => ['Floor live load — ' + u, LIVE[u] || '50 psf']);
  const mats = [['Concrete', '3,000 psi foundations and slabs (homes); 4,000 psi commercial slabs, grade beams, tilt-wall'], ['Reinforcing', 'ASTM A615 Gr. 60; WWR ASTM A1064'], ['PT tendons', '1/2" Ø 270 ksi 7-wire strand, unbonded, encapsulated'],
    ['CMU', 'f\'m = 2,000 psi; grout 3,000 psi'], ['Lumber', 'Southern pine No. 2; LVL 2.0E; studs SPF / SYP stud grade'], ['Sheathing', '7/16" OSB walls; 15/32" (19/32" at high wind) roof'], ['Steel', 'ASTM A992 W shapes; A500 Gr. C HSS; A325 bolts; F1554 Gr. 36 anchor rods; E70XX welds']];
  const rows = tw.map(({ t, d }) => [t.id, t.label, String(t.floors), d ? d.systems.structure || t.construction : '—', d ? d.systems.foundation || '—' : 'design not available', d ? (isRes(t.use) ? 'Wood structural panel shear walls' : steelFrame(t, d) ? 'Tilt-wall / masonry shear walls, roof diaphragm' : 'Shear walls + roof diaphragm') : '—']);
  return columns(sh, [BOD('Design criteria, loads and foundation types below are typical assumptions, not engineering.'), notes('Structural general notes', pick(ctx, 'structural', S_NOTES)),
    tbl('Design criteria', ['Item', 'Value'], dc.criteria.length >= 4 ? dc.criteria : crit), tbl('Live loads by occupancy', ['Use', 'Load'], live), tbl('Materials', ['Material', 'Specification'], mats),
    tbl('Structure by building type', ['Type', 'Use', 'Fl.', 'Structure', 'Foundation', 'Lateral'], rows),
    notes('Foundation rules used on the S-1xx sheets', ['Perimeter grade beams 12" × 30" (homes) / 12" × 30" with 12" × 24" interior beams, under bearing lines no more than about 18–20 ft apart.', 'Commercial: a column grid of about 30–40 ft bays, spread footings sized for (dead + live) × tributary area on 1,500 psf.', 'Slab thickness: 4"–5" homes (PT), 5" commercial, 6"–7" warehouse; finished floor per the civil grading plan.'], false)]);
}
const M_NOTES = [
  'Mechanical sheets are a rule-based schematic layout for pricing and coordination. Equipment, duct sizes and routing by the mechanical engineer of record or design-build contractor with ACCA Manual J / S / D (homes) or ASHRAE load calculations (commercial).',
  'Codes: IMC and IRC 2021 as adopted, IECC 2021 (climate zone 2A), ASHRAE 62.1 / 62.2 ventilation, NFPA 90A / 96.',
  'Tonnage is by rule of thumb; the load calculation governs. Do not order equipment from these sheets.',
  'Ducts: sealed per IECC; R-8 insulation in unconditioned attics, R-6 elsewhere; commercial sheet metal per SMACNA.',
  'Outdoor air per ASHRAE 62.1 (commercial, with economizers where required) and 62.2 whole-house ventilation (homes).',
  'Condensate to an approved receptor; attic units get a secondary pan with a float switch.',
  'Kitchen hood, make-up air and grease duct by the kitchen consultant (NFPA 96).',
  'Gas piping per the IFGC / IRC chapter 24; sizes by the gas schedule.'
];
function mNotesBody(ctx, sh) {
  const tw = typesWith(ctx), dc = disc(ctx, 'mechanical'), eq = [], ef = [];
  for (const { t, d } of tw) {
    if (!d) { eq.push([t.id, '—', 'Design not available', '', '', '', '', '', '']); continue; }
    const H = hvacLayout(t, d), grp = new Map();
    for (const s of H.systems) { const key = s.kind + '|' + s.tons + '|' + s.floors.join(','); const g = grp.get(key) || { s, tags: [] }; g.tags.push(s.tag); grp.set(key, g); }
    for (const { s, tags } of grp.values()) {
      const where = s.kind === 'rtu' ? 'Roof' : s.unit.where === 'attic' ? 'Attic' : s.unit.where, serves = 'Floor' + (s.floors.length > 1 ? 's ' : ' ') + s.floors.join(', ') + (s.kind === 'rtu' ? '' : ' (' + f0(s.area) + ' sf)');
      const tg = tags.length > 2 ? tags[0] + '…' + tags[tags.length - 1].replace(/^\D+-/, '') : tags.join(', ');
      eq.push([t.id, tg + (s.kind === 'rtu' ? '' : ' / ' + tags.map(x => x.replace('AHU', 'CU')).join(', ')), (s.kind === 'rtu' ? 'Packaged rooftop unit' : s.kind === 'hp' ? 'Split heat pump' : 'Split system') + ', ' + where, serves, f1(s.tons), f0(s.cfm), heatOf(d, s).text, effOf(s), (s.kind === 'rtu' ? '208/3/60' : '208-230/1/60') + ', MCA ~' + mcaOf(s) + ' A']);
    }
    const eg = new Map(); for (const e of H.exhaust) { const k = e.room.type + '|' + e.cfm; eg.set(k, { e, q: (eg.get(k)?.q || 0) + 1 }); }
    for (const { e, q } of eg.values()) ef.push([t.id, e.room.type.replace(/_/g, ' '), String(q), f0(e.cfm), e.room.type === 'restroom' ? '75 cfm a water closet; ceiling cabinet fan, ducted out' : 'Ceiling fan, ≤ 1.0 sone, ducted to outside']);
    if (H.vents.length) ef.push([t.id, 'warehouse', String(H.vents.length), f0(H.vents[0].cfm), 'Wall propeller fan, ~1 cfm/sf relief, motorized louvers at the front']);
    if (H.hood) ef.push([t.id, 'kitchen hood KH-1 / MAU-1', '1', 'by consultant', 'Type I hood, grease duct and make-up air by the kitchen consultant (NFPA 96)']);
  }
  const cond = [['Outdoor, summer', '96°F DB / 77°F MCWB (ASHRAE 0.4%, Houston; confirm)'], ['Outdoor, winter', '33°F DB (ASHRAE 99.6%; confirm)'], ['Indoor, cooling', '75°F, 50% RH'], ['Indoor, heating', '70°F'], ['Ventilation', 'ASHRAE 62.1 / 62.2'], ['Energy code', 'IECC 2021, climate zone 2A'], ['Sizing rules (here)', 'Homes 1 t / 550 sf; retail and office 1 t / 350 sf; dining and kitchen 1 t / 200 sf; assembly 1 t / 250 sf; warehouse ventilated only; 400 cfm a ton']];
  return columns(sh, [BOD('Equipment counts, tonnage and airflow come from area rules of thumb.'), notes('Mechanical general notes', pick(ctx, 'mechanical', M_NOTES)), legend(['supply', 'return', 'thermostat', 'ahu', 'condenser', 'rtu', 'fan', rawLeg('Supply duct (trunk / branch)', line(2, 7, 42, 7, 'stroke="' + DUCT + '" stroke-width="3"')), rawLeg('Return duct', line(2, 7, 42, 7, 'stroke="' + DUCT + '" stroke-width="1.4" stroke-dasharray="5 3"')), rawLeg('Refrigerant piping', line(2, 7, 42, 7, 'stroke="' + INK + '" stroke-width=".8" stroke-dasharray="2 2"'))]),
    tbl('Design conditions', ['Item', 'Value'], dc.criteria.length >= 4 ? dc.criteria : cond),
    tbl('HVAC equipment schedule (basis of design)', ['Type', 'Tag', 'Unit', 'Serves', 'Tons', 'CFM', 'Heat', 'Efficiency', 'Electrical (est.)'], eq, [4, 5]),
    tbl('Exhaust fan schedule', ['Type', 'Serves', 'Qty', 'CFM', 'Notes'], ef, [2, 3])]);
}
const P_NOTES = [
  'Plumbing sheets are a rule-based schematic layout for pricing and coordination; the plumbing engineer or licensed plumber sizes and routes all piping.',
  'Codes: IPC and IRC 2021 as adopted, IFGC, TAS 2012 / ADA for accessible fixtures; confirm local amendments and the utility’s requirements.',
  'Water: PEX or type L copper; 3/4" minimum service to a home, building service sized by the fixture units. PRV where street pressure exceeds 80 psi; thermal expansion tank at storage water heaters.',
  'Drain, waste and vent: PVC schedule 40 DWV; 1/4" per foot to 3", 1/8" per foot above; cleanouts at the building drain exit, at changes of direction over 45° and every 100 ft.',
  'Backflow: RPZ at commercial domestic services, double check at fire lines, vacuum breakers at hose bibbs.',
  'Food service: grease interceptor sized by the local authority (IPC 1003); indirect waste at food sinks and ice machines.',
  'Water heaters: T&P relief piped to outside or an approved receptor; seismic straps not required (SDC A) but pans with drains where over finished space.'
];
function pNotesBody(ctx, sh) {
  const tw = typesWith(ctx), used = new Set(), cnt = [], req = [], whs = [];
  for (const { t, d } of tw) {
    if (!d) { cnt.push([t.id, 'design not available']); continue; }
    const ft = fixtureTotals(d); Object.keys(ft.counts).forEach(c => used.add(c));
    cnt.push({ t, ft });
    if (!isRes(d.use)) { const L = occupantLoad(d).total, r = ipcRequired(t.occupancy, L), p = fixturesProvided(d), ok = p.wc >= r.wc && p.lav >= r.lav && p.df >= r.df && p.ss >= r.ss; req.push([t.id, t.occupancy, f0(L), r.wc + ' / ' + p.wc, r.lav + ' / ' + p.lav, r.df + ' / ' + p.df, r.ss + ' / ' + p.ss, ok ? 'Meets' : 'Add fixtures']); }
    const wg = new Map(); for (const w of waterHeaters(t, d)) { const L = wg.get(w.size) || []; L.push(w); wg.set(w.size, L); }
    for (const [size, L] of wg) whs.push([t.id, L.length > 1 ? L[0].tag + '…' + L[L.length - 1].tag.replace(/^\D+-/, '') : L[0].tag, size, L.length > 1 ? L.length + ' heaters: ' + L[0].basis.replace(/\bT\d+\s/, '') + ', each' : L[0].basis]);
  }
  const codes = Object.keys(FIX).filter(c => used.has(c)), sched = codes.map(c => { const F = FIX[c]; return [c, F.name, F.cw, F.hw, F.w, F.v, f1(F.wsfu), f1(F.dfu)]; });
  const countRows = cnt.map(x => Array.isArray(x) ? [...x, ...codes.slice(1).map(() => ''), '', ''] : [x.t.id, ...codes.map(c => String(x.ft.counts[c] || '')), f1(x.ft.wsfu), f1(x.ft.dfu)]);
  return columns(sh, [BOD('Fixture counts follow the room types of each design; pipe sizes are typical.'), notes('Plumbing general notes', pick(ctx, 'plumbing', P_NOTES)),
    legend(['line:water', rawLeg('Hot water', line(2, 7, 42, 7, 'stroke="' + RED + '" stroke-width="1.4"')), 'line:sanitary', 'line:gas', 'waterheater', 'cleanout', 'floordrain', 'hosebibb', 'gatevalve', 'watermeter']),
    tbl('Plumbing fixture schedule', ['Mark', 'Fixture', 'CW', 'HW', 'Waste', 'Vent', 'WSFU', 'DFU'], sched, [6, 7]),
    tbl('Fixtures per building type (each unit)', ['Type', ...codes, 'WSFU', 'DFU'], countRows, codes.map((_, i) => i + 1).concat([codes.length + 1, codes.length + 2])),
    req.length ? tbl('Required / provided fixtures (IPC Table 2902.1)', ['Type', 'Occ.', 'Load', 'WC', 'Lav', 'DF', 'Serv. sink', 'Check'], req, [2]) + '<div class="sm muted">Required / provided. Occupant load from the floor areas (IBC Table 1004.5); 50/50 split by sex; mercantile up to 100 occupants and loads up to 15 may share a single-user room (IPC 2902.2).</div>' : '',
    tbl('Water heater sizing', ['Type', 'Tag', 'Heater', 'Basis'], whs)]);
}
const E_NOTES = [
  'Electrical sheets are a rule-based schematic layout for pricing and coordination; the electrical engineer of record designs circuits, feeders, fault current and coordination.',
  'Codes: NEC (NFPA 70) edition adopted in Texas (2023; verify with the AHJ), IECC 2021 lighting power and controls, NFPA 72 for alarms, NFPA 101 / IBC 1008 egress lighting.',
  'Service by the serving electric utility (confirm provider, transformer location and available fault current).',
  'Dwellings: AFCI per 210.12, GFCI per 210.8, tamper-resistant receptacles, receptacles per 210.52; smoke and CO alarms hard-wired, interconnected, battery backup.',
  'Commercial: exit signs and emergency lighting with 90-minute battery backup at exits and along the egress path; occupancy sensors and daylight controls per IECC C405.',
  'Copper conductors THWN-2 / XHHW-2; minimum #12 AWG; aluminum feeders allowed if the EOR permits.',
  'Grounding and bonding per NEC 250: concrete-encased electrode in the foundation plus ground rods.'
];
function eNotesBody(ctx, sh) {
  const tw = typesWith(ctx), blocks = [], loads = [];
  for (const { t, d } of tw) {
    if (!d) { blocks.push(blk('Type ' + t.id, '<p class="muted">Design not available.</p>')); continue; }
    const P = panelSchedule(t, d), L = loadCalc(t, d), shown = P.length > 3 ? P.slice(0, 2) : P;
    for (const p of shown) blocks.push(tbl('Panel ' + p.name + ' — Type ' + t.id + (P.length > 3 && p === shown[1] ? ' (typical of ' + (P.length - 1) + ')' : ''), ['Circuit', 'Qty', 'Poles', 'Bkr A', 'VA'], p.circuits.map(c => [c.desc, String(c.qty), String(c.poles), String(c.amps), f0(c.va * (isRes(d.use) ? c.qty : 1))]), [1, 2, 3, 4]) + '<div class="sm">' + esc(p.volts + ' · ' + p.amps + ' A ' + (isRes(d.use) ? 'main breaker' : 'bus') + ' · ' + p.spaces + ' spaces (est.)') + '</div>');
    loads.push(tbl('Load calculation — Type ' + t.id + (isRes(d.use) ? ' (NEC 220 standard method, per home)' : ' (NEC 220, building)'), ['Load', 'VA'], L.lines.map(([a, b]) => [a, f0(b)]).concat([['Demand total', f0(L.total)], ['Amps at ' + L.volts.split(',')[0], f0(L.amps)], ['Service', L.service + ' A, ' + L.volts]]), [1]));
  }
  return columns(sh, [BOD('Circuits, loads and service sizes come from NEC unit loads and rules of thumb.'), notes('Electrical general notes', pick(ctx, 'electrical', E_NOTES)),
    legend(['receptacle', 'gfci', 'receptacle240', 'switch', 'light', 'recessed', 'fixture2x4', 'exitsign', 'emergency', 'smoke', 'co', 'fan', 'panel', 'meter', 'transformer', 'wallpack']),
    disc(ctx, 'electrical').criteria.length ? tbl('Design criteria', ['Item', 'Value'], disc(ctx, 'electrical').criteria) : '', ...loads, ...blocks]);
}
const T_NOTES = [
  'Telecom sheets are a rule-based schematic layout for pricing and coordination; the provider and a BICSI RCDD design the outside plant and structured cabling.',
  'Standards: TIA-568.2-D (balanced twisted pair), TIA-568.3-D (fiber), TIA-569-E (pathways and spaces), TIA-570-D (residential), TIA-606-C (labeling), TIA-607-D (bonding), NEC articles 770 and 800.',
  'Horizontal cabling Category 6 U/UTP, plenum-rated where in return-air plenums; 90 m maximum permanent link; terminate on Cat 6 jacks and patch panels.',
  'Homes: a structured media enclosure (SME) with the ONT, a router and a Cat 6 home run to every outlet; ONT on a UPS (8 hours) where voice service is provided.',
  'Commercial: a telecom room (MPOE) per building, a backboard 4 ft × 8 ft, fire-retardant plywood; a 2" conduit from each tenant to the MPOE.',
  'Outside plant: 2" HDPE or PVC conduit from the provider’s handhole to the building, pull string, no more than two 90° bends between pull points.'
];
function tNotesBody(ctx, sh) {
  const box = (x, y, w, h, s) => rect(x, y, w, h, 'fill="#fff" stroke="' + INK + '" stroke-width="1.1"') + T(x + w / 2, y + h / 2 - 1, s, 8, { b: true, halo: false });
  const L = (x1, x2, y, s) => line(x1, y, x2, y, lineAttr('fiber')) + T((x1 + x2) / 2, y - 6, s, 6.5);
  const y = 40, dia = svg(640, 120, box(4, y - 16, 70, 34, 'OLT') + T(39, y + 30, 'Provider central office', 6.5) + L(74, 150, y + 1, 'Feeder fiber') + box(150, y - 16, 84, 34, '1:32 SPLITTER') + T(192, y + 30, 'Cabinet / FDH', 6.5) +
    L(234, 300, y + 1, 'Distribution') + sym('handhole', 322, y + 1, 12) + T(322, y + 30, 'Handhole / terminal', 6.5) + L(338, 410, y + 1, 'Drop') + sym('ont', 432, y + 1, 14) + T(432, y + 30, 'ONT (in SME / MPOE)', 6.5) +
    line(452, y + 1, 500, y + 1, 'stroke="' + PURPLE + '" stroke-width="1"') + box(500, y - 16, 64, 34, 'ROUTER') + line(564, y + 1, 600, y + 1, 'stroke="' + PURPLE + '" stroke-width="1"') + sym('data', 612, y + 1, 9) + T(612, y + 30, 'Cat 6 outlets', 6.5) + T(320, 108, 'Passive optical network (GPON / XGS-PON): one feeder fiber split to up to 32 homes or tenants', 7, { halo: false }));
  const rows = typesWith(ctx).map(({ t, d }) => { if (!d) return [t.id, 'design not available', '', '']; const res = isRes(d.use), out = sum(d.rooms, r => dataOutlets(r, res)), waps = sum(Array.from({ length: d.floors }, (_, i) => wapCount(sum(roomsOn(d, i + 1), area), res))); return [t.id, t.label, String(out), String(waps), res ? 'SME in ' + smeOf(d).room.name : 'MPOE in ' + smeOf(d).room.name]; });
  return columns(sh, [BOD('Outlet and access point counts come from room types and floor areas.'), notes('Telecom general notes', pick(ctx, 'telecom', T_NOTES)), legend(['data', 'wap', 'ont', 'handhole', 'line:fiber', rawLeg('Cat 6 cable path', line(2, 7, 42, 7, 'stroke="' + PURPLE + '" stroke-width=".8" stroke-dasharray="3 2"'))]),
    blk('FTTH architecture', dia), tbl('Structured cabling summary', ['Type', 'Use', 'Data outlets', 'WAPs', 'Head end'], rows, [2, 3]),
    disc(ctx, 'telecom').criteria.length ? tbl('Design criteria', ['Item', 'Value'], disc(ctx, 'telecom').criteria) : tbl('Design criteria', ['Item', 'Value'], [['Horizontal cable', 'Category 6 U/UTP, 4-pair'], ['Outlets', 'Homes 1–2 a living / bedroom / office; commercial 1 per ~100 sf of office, 4+ a tenant'], ['Wireless', 'One WAP per ~1,500 sf (homes), ~2,500 sf (commercial), Wi-Fi 6/6E'], ['Fiber drop', 'Single-mode, bend-insensitive (G.657), in 1" conduit'], ['Conduit to building', '2" from the provider handhole; pull string']])]);
}

// ---------- per-type plan sheets ----------
function typeSheet(ctx, sh, build) {
  const t = typeOf(ctx, sh), d = designOf(ctx, t);
  if (!t) return missing(sh, 'This sheet names a building type the set doesn’t have.');
  if (!d) return missing(sh, typeName(t) + '.');
  const { views, overlay, sideHtml } = build(t, d), r = drawViews(d, views, overlay, sideHtml);
  sh.scale = r.scale;
  return r.html;
}
const sideNotes = (title, list) => notes(title, list);

// S-1xx foundation plan
function sFound(ctx, sh) {
  return typeSheet(ctx, sh, (t, d) => {
    const res = isRes(d.use), W = d.W, D = d.D, pt = ptSlab(d), f1r = roomsOn(d, 1), steel = !res;
    const G = steel ? structGrid(W, D, 40) : null, bx = res ? beamLines(f1r.flatMap(r => [r.x, r.x + r.w]), W, 18) : G.xs.slice(1, -1), by = res ? beamLines(f1r.flatMap(r => [r.y, r.y + r.d]), D, 18) : G.ys.slice(1, -1);
    const trib = G ? G.sx * G.sy : 0, ftg = footingSize(trib, 40 + (d.floors - 1) * floorPsf(d.use)), slab = res ? (pt ? '5" PT' : '4"') : d.use === 'industrial' ? '7" reinforced' : '5" reinforced';
    const garage = f1r.find(r => r.type === 'garage');
    const overlay = (v, g) => {
      const k = g.k, bw = Math.max(1 * k, 2.5), outer = outline(d), inner = insetOutline(d, Math.max(1, 2.5 / k)), dash = 'stroke="' + INK + '" stroke-width=".8" stroke-dasharray="6 3"'; let s = '';
      // the slab edge and the perimeter beam follow the outline, re-entrant corners included
      s += path(polyD(g, outer) + ' ' + polyD(g, inner), 'fill="#dfe2e3" fill-rule="evenodd" stroke="none"') + path(polyD(g, outer), 'class="slab-edge" fill="none" stroke="' + INK + '" stroke-width="2.2"') + path(polyD(g, inner), 'fill="none" ' + dash);
      const beam = (x1, y1, x2, y2) => { const h = Math.abs(y1 - y2) < 1e-9, o = bw / 2; return h ? rect(g.X(x1), g.Y(y1) - o, (x2 - x1) * k, bw, 'fill="#e8eaeb" stroke="none"') + line(g.X(x1), g.Y(y1) - o, g.X(x2), g.Y(y2) - o, dash) + line(g.X(x1), g.Y(y1) + o, g.X(x2), g.Y(y2) + o, dash)
        : rect(g.X(x1) - o, g.Y(y2), bw, (y2 - y1) * k, 'fill="#e8eaeb" stroke="none"') + line(g.X(x1) - o, g.Y(y1), g.X(x2) - o, g.Y(y2), dash) + line(g.X(x1) + o, g.Y(y1), g.X(x2) + o, g.Y(y2), dash); };
      for (const x of bx) for (const [a, b] of clipLine(d, x, false)) s += beam(x, a, x, b);
      for (const y of by) for (const [a, b] of clipLine(d, y, true)) s += beam(a, y, b, y);
      if (d.attached) s += T(g.X(W / 2), g.Y(D) - 16, 'CONTINUOUS GRADE BEAM UNDER EACH 2-HR PARTY WALL (TYP.)', 6.5, { b: true });
      if (G) {
        const fs = ftg.side * k;
        s += gridMarks(d, g, G);
        for (const x of G.xs) for (const y of G.ys) if (strictlyIn(d, x, y, 1.5)) s += rect(g.X(x) - fs / 2, g.Y(y) - fs / 2, fs, fs, 'fill="#fff" stroke="' + INK + '" stroke-width=".8"') + rect(g.X(x) - 2.5, g.Y(y) - 2.5, 5, 5, 'fill="' + INK + '"');
        const f1p = G.xs.flatMap(x => G.ys.map(y => [x, y])).find(([x, y]) => strictlyIn(d, x, y, 1.5));
        if (f1p) s += T(g.X(f1p[0]) + fs / 2 + 4, g.Y(f1p[1]) - fs / 2 - 3, 'F1', 7, { a: 'start', b: true }) + secM(g.X(f1p[0]) - fs / 2 - 14, g.Y(f1p[1]) + fs / 2 + 14, '3');
        s += dim(g.X(G.xs[0]), g.Y(D) - 28, g.X(G.xs[1]), g.Y(D) - 28, ftInS(G.sx) + ' TYP.', -8, 7);
      }
      if (garage) { const gx2 = garage.x + garage.w, gy2 = garage.y + garage.d; s += line(g.X(gx2), g.Y(garage.y), g.X(gx2), g.Y(gy2), 'stroke="' + INK + '" stroke-width="1.6"') + line(g.X(garage.x), g.Y(gy2), g.X(gx2), g.Y(gy2), 'stroke="' + INK + '" stroke-width="1.6"') + T(g.X(cx(garage)), g.Y(garage.y + Math.min(5, garage.d / 3)), 'GARAGE SLAB 4" DOWN, SLOPE 1/8"/FT TO DOOR', g.fs + 0.5, { b: true }); }
      const host = f1r.filter(r => r !== garage).reduce((p, q) => area(q) > area(p) ? q : p, f1r[0]);
      s += T(g.X(cx(host)), g.Y(cy(host)) - 8, slab + ' SLAB ON GRADE\nFF = 100.00\' (SEE CIVIL)\n' + (pt ? 'PT TENDONS ~4\'-0" O.C. E.W.\n(BY PT SUPPLIER)' : '#4 @ 16" O.C. E.W.\n10 MIL VAPOR RETARDER'), g.fs + 1, { b: true });
      const m1 = wallSpot(d, { x: W * 0.3, y: 0 }, ['front']), [ox, oy] = outward(m1.side, 1);
      s += line(g.X(m1.x - ox * 0.5), g.Y(m1.y - oy * 0.5), g.X(m1.x) + ox * 13, g.Y(m1.y) - oy * 13, 'stroke="' + INK + '" stroke-width=".7"') + secM(g.X(m1.x) + ox * 22, g.Y(m1.y) - oy * 22, '1');
      const b2 = bx.map(x => [x, clipLine(d, x, false)[0]]).find(q => q[1]); if (b2) s += secM(g.X(b2[0]) + bw / 2 + 12, g.Y(b2[1][0] + (b2[1][1] - b2[1][0]) * 0.72), '2');
      s += dim(g.X(0), g.Y(0) + 34, g.X(W), g.Y(0) + 34, ftInS(W) + (d.shape && d.shape !== 'rectangle' ? ' OVERALL' : ''), 10, 8.5) + dim(g.X(W) + 30, g.Y(0), g.X(W) + 30, g.Y(D), ftInS(D), 10, 8.5);
      return s;
    };
    const live = LIVE[d.use] || '50 psf';
    return { views: [{ floor: 1, title: 'Foundation plan' }], overlay, sideHtml: head(t) + BOD('Foundation layout') + legend([rawLeg('Grade beam (shaded), 12" wide', rect(2, 3, 40, 8, 'fill="#e8eaeb" stroke="' + INK + '" stroke-width=".6" stroke-dasharray="4 2"')), rawLeg('Slab edge', line(2, 7, 42, 7, 'stroke="' + INK + '" stroke-width="2.2"')), ...(G ? [rawLeg('Spread footing + column', rect(15, 1, 12, 12, 'fill="none" stroke="' + INK + '" stroke-dasharray="3 2"') + rect(19, 5, 4, 4, 'fill="' + INK + '"'))] : [])]) +
      tbl('Foundation schedule', ['Mark', 'Size', 'Reinforcing'], [['Slab area', f0(footArea(d)) + ' sf' + (d.shape && d.shape !== 'rectangle' ? ' (' + d.shape + ')' : ''), '—'], ['Perimeter beam', '12" × 30"' + (res ? ' with 4" brick ledge' : ''), '(2) #5 top, (2) #5 bottom, #3 stirrups @ 24"'], ['Interior beam', '12" × 24"', '(2) #5 top and bottom'], ['Slab', slab, pt ? 'PT tendons per supplier' : '#4 @ 16" o.c. each way, mid-depth'], ...(G ? [['F1', ftInS(ftg.side) + ' sq. × 1\'-6"', '#5 @ 12" o.c. each way, bottom (~' + f1(ftg.kips) + ' k)']] : [])]) +
      sideNotes('Foundation notes', [d.systems.foundation + ' (design basis); final system per the geotechnical report.', 'Assumed allowable bearing 1,500 psf; expansive clays — moisture conditioning and a PVR limit per the geotechnical engineer.', res ? 'Interior beams under bearing lines no more than about 18 ft apart; beams at the garage step and party walls.' : 'Column grid about ' + ftInS(G.sx) + ' × ' + ftInS(G.sy) + '; footings sized for ' + f0(40 + (d.floors - 1) * floorPsf(d.use)) + ' psf × ' + f0(trib) + ' sf tributary.', 'Floor live load: ' + live + '.', 'Finished floor at least 8" above finished grade, and at or above the floodplain elevation the county requires.', 'Plumbing under the slab sleeved through beams; no penetrations through PT anchors.']) };
  });
}
const ftInS = v => { const t = Math.round(Math.abs(num(v)) * 12), f = Math.floor(t / 12), i = t % 12; return f + "'-" + i + '"'; };

// S-2xx framing: each upper floor and the roof, drawn over the walls that hold it up
function sFrame(ctx, sh) {
  return typeSheet(ctx, sh, (t, d) => {
    const res = isRes(d.use), W = d.W, D = d.D, F = d.floors, steel = steelFrame(t, d), G = res ? null : structGrid(W, D, 40), roof = d.roof || {};
    const views = [...Array.from({ length: F - 1 }, (_, i) => ({ floor: i + 1, level: i + 2, title: 'Floor ' + (i + 2) + ' framing plan' })), { floor: F, level: 'roof', title: 'Roof framing plan', roof: true }];
    const spanY = res ? (roof.ridge === 'front_to_back' ? false : true) : true; // the roof trusses span front to back unless the ridge runs that way
    const arrow = (g, x1, y1, x2, y2, label) => { const X1 = g.X(x1), Y1 = g.Y(y1), X2 = g.X(x2), Y2 = g.Y(y2); return line(X1, Y1, X2, Y2, 'stroke="' + INK + '" stroke-width="1" marker-start="url(#arr)" marker-end="url(#arr)"') + line(X1 - 4, Y1 - 4, X1 + 4, Y1 + 4, 'stroke="' + INK + '"') + line(X2 - 4, Y2 - 4, X2 + 4, Y2 + 4, 'stroke="' + INK + '"') + T((X1 + X2) / 2 + (x1 === x2 ? 4 : 0), (Y1 + Y2) / 2 - 4, label, g.fs + 0.5, { b: true, a: x1 === x2 ? 'start' : 'middle' }); };
    const overlay = (v, g) => {
      const k = g.k; let s = '';
      const below = roomsOn(d, v.floor);
      if (res) {
        // shear walls on the exterior walls of the story below (party walls are 2-hour fire walls)
        const sw = 'stroke="' + INK + '" stroke-width="3.2" stroke-dasharray="10 4" opacity=".55"';
        // shear walls on every outside edge of the outline (not the party walls), hold-downs at every corner
        for (const e of edgesOf(d)) { if (d.attached && (e.side === 'left' || e.side === 'right')) continue; const ix = -e.nx * 3, iy = e.ny * 3; s += line(g.X(e.x1) + ix, g.Y(e.y1) + iy, g.X(e.x2) + ix, g.Y(e.y2) + iy, sw) + (e.L >= 8 ? tag(g.X((e.x1 + e.x2) / 2) + ix * 4, g.Y((e.y1 + e.y2) / 2) + iy * 4 + 3, 'SW', 6.5) : ''); }
        for (const [x, y] of outline(d)) s += rect(g.X(x) - 3, g.Y(y) - 3, 6, 6, 'fill="' + INK + '"');
        if (v.roof) {
          const hip = roof.type === 'hip', P = pieces(d), one = P.length === 1;
          s += path(polyD(g, insetOutline(d, -num(roof.overhang))), 'fill="none" stroke="' + INK + '" stroke-width=".8" stroke-dasharray="6 3"');
          // trusses at 24" in each piece of the outline, across its short way (or as the ridge says on a plain box)
          P.forEach((pc, i) => {
            const sy = one ? spanY : pc.w >= pc.d, ridgeX = !sy, step = 2;
            for (let u = step; u < (sy ? pc.w : pc.d) - 0.5; u += step) s += sy ? line(g.X(pc.x + u), g.Y(pc.y), g.X(pc.x + u), g.Y(pc.y + pc.d), 'stroke="' + GREY + '" stroke-width=".45"') : line(g.X(pc.x), g.Y(pc.y + u), g.X(pc.x + pc.w), g.Y(pc.y + u), 'stroke="' + GREY + '" stroke-width=".45"');
            const h2 = hip && one, rl = ridgeX ? [pc.x + pc.w / 2, pc.y + (h2 ? pc.w / 2 : 0), pc.x + pc.w / 2, pc.y + pc.d - (h2 ? pc.w / 2 : 0)] : [pc.x + (h2 ? pc.d / 2 : 0), pc.y + pc.d / 2, pc.x + pc.w - (h2 ? pc.d / 2 : 0), pc.y + pc.d / 2];
            if (roof.type !== 'flat' && roof.type !== 'shed') s += line(g.X(rl[0]), g.Y(rl[1]), g.X(rl[2]), g.Y(rl[3]), 'stroke="' + INK + '" stroke-width="1.4" stroke-dasharray="16 4 3 4"') + (i === 0 ? T(g.X((rl[0] + rl[2]) / 2) + 4, g.Y((rl[1] + rl[3]) / 2) - 5, 'RIDGE', g.fs, { a: 'start', b: true }) : '');
            if (h2) for (const [x, y] of [[0, 0], [W, 0], [0, D], [W, D]]) s += line(g.X(x), g.Y(y), g.X(ridgeX ? rl[0] : (x ? rl[2] : rl[0])), g.Y(ridgeX ? (y ? rl[3] : rl[1]) : rl[1]), 'stroke="' + INK + '" stroke-width="1.1" stroke-dasharray="8 3"');
            if (i === 0) { const lab = 'PRE-ENG. WOOD TRUSSES @ 24" O.C.' + (roof.pitch ? ' (' + roof.pitch + ':12)' : ''); s += sy ? arrow(g, pc.x + pc.w * 0.3, pc.y + 0.8, pc.x + pc.w * 0.3, pc.y + pc.d - 0.8, lab) : arrow(g, pc.x + 0.8, pc.y + pc.d * 0.3, pc.x + pc.w - 0.8, pc.y + pc.d * 0.3, lab); }
            if (h2) s += tag(g.X(rl[0]) + 10, g.Y(rl[1]) + 12, 'GT (HIP GIRDER)', 6);
          });
          if (!one && roof.type !== 'flat' && roof.type !== 'shed') s += T(g.X(W / 2), g.Y(D) - 12, 'VALLEY / GIRDER TRUSSES WHERE THE WINGS MEET (BY TRUSS MFR.)', 6.2, { b: true });
          s += T(g.X(W / 2), g.Y(0) + 22, 'H2.5A HURRICANE TIE EACH TRUSS EACH END (4/S-501)', 6.2, { b: true });
        } else {
          const span = D <= 26 ? 'y' : W <= 26 ? 'x' : 'y', lab = '14" OPEN-WEB FLOOR TRUSSES @ 24" O.C.';
          if (span === 'y' && D > 26) { const yb = beamLines(below.flatMap(r => [r.y, r.y + r.d]), D, 24)[0]; if (yb) { const iv = clipLine(d, yb, true); s += iv.map(([a, b]) => line(g.X(a), g.Y(yb), g.X(b), g.Y(yb), 'stroke="' + INK + '" stroke-width="2.2" stroke-dasharray="14 4"')).join('') + (iv.length ? tag(g.X(iv[0][0] + (iv[0][1] - iv[0][0]) * 0.7), g.Y(yb) - 5, 'FLUSH BEAM / BEARING WALL', 6) : ''); } }
          for (const r of below.filter(q => area(q) >= 80).slice(0, 14)) s += span === 'y' ? arrow(g, cx(r), r.y + 0.8, cx(r), r.y + r.d - 0.8, r === below[0] ? lab : '') : arrow(g, r.x + 0.8, cy(r), r.x + r.w - 0.8, cy(r), r === below[0] ? lab : '');
          if (!below.some(q => area(q) >= 80)) s += arrow(g, W / 2, 0.8, W / 2, D - 0.8, lab);
          s += T(g.X(W / 2), g.Y(0) + 22, '23/32" T&G FLOOR SHEATHING, GLUED AND NAILED', 6.2, { b: true });
        }
        // headers over openings 6 ft and wider in the walls below
        const opens = [...(d.doors || []).filter(o => o.floor === v.floor && o.width >= 6), ...(d.windows || []).filter(w => w.floor === v.floor && w.width >= 6)];
        for (const o of opens) { const w = o.width, hd = w <= 10 ? '(2) 1-3/4x11-7/8 LVL' : w <= 16 ? '(3) 1-3/4x14 LVL' : '(3) 1-3/4x18 LVL'; s += line(g.X(o.x1), g.Y(o.y1), g.X(o.x2), g.Y(o.y2), 'stroke="' + RED + '" stroke-width="3.6"') + T(g.X((o.x1 + o.x2) / 2), g.Y((o.y1 + o.y2) / 2) + (o.orient === 'h' ? (o.y1 < D / 2 ? -6 : 12) : 3), hd + ' HDR', 6, { b: true, c: RED }); }
      } else {
        // commercial: grid, girders on the grid lines, joists between them
        // commercial: the grid where the building is, girders on its lines, joists between them, all clipped to the outline
        s += gridMarks(d, g, G);
        const jsp = v.roof ? (steel ? 5 : 4) : 10;
        for (let x = jsp; x < W - 0.5; x += jsp) for (const [a, b] of clipLine(d, x, false)) s += line(g.X(x), g.Y(a), g.X(x), g.Y(b), 'stroke="' + GREY + '" stroke-width=".45"');
        const gird = G.ys.slice(1, -1).flatMap(y => clipLine(d, y, true).map(([a, b]) => [a, y, b]));
        for (const [a, y, b] of gird) s += line(g.X(a), g.Y(y), g.X(b), g.Y(y), 'stroke="' + INK + '" stroke-width="2.4" stroke-dasharray="16 4"');
        for (const x of G.xs) for (const y of G.ys.slice(1, -1)) if (onOrIn(d, x, y)) s += rect(g.X(x) - 3, g.Y(y) - 3, 6, 6, 'fill="' + INK + '"');
        if (gird.length) s += tag(g.X(gird[0][0] + Math.min(G.sx, gird[0][2] - gird[0][0]) / 2), g.Y(gird[0][1]) - 6, v.roof ? (steel ? 'JG (JOIST GIRDER) TYP.' : 'GLULAM / STEEL BEAM TYP.') : 'W-SHAPE GIRDER TYP.', 6.5);
        const lab = v.roof ? (steel ? 'STEEL JOISTS @ 5\'-0" O.C. (SJI, BY MFR.)' : 'OPEN-WEB JOISTS @ 4\'-0" O.C. (BY MFR.)') : 'W-SHAPE BEAMS @ 10\'-0" O.C., COMPOSITE DECK';
        const pc = pieces(d)[0], ys = [pc.y, ...G.ys.filter(y => y > pc.y + 1 && y < pc.y + pc.d - 1), pc.y + pc.d], ax = pc.x + Math.min(G.sx, pc.w) * 0.5;
        s += arrow(g, ax, ys[0] + 0.8, ax, ys[1] - 0.8, lab);
        s += T(g.X(W / 2), g.Y(0) + 22, v.roof ? (steel ? '1-1/2" TYPE B 22 GA ROOF DECK, TPO MEMBRANE; ' : 'ROOF SHEATHING / DECK PER MFR.; ') + (steel ? 'TILT-WALL / MASONRY BEARING AND SHEAR WALLS (6/S-501)' : 'BEARING AND SHEAR WALLS AT PERIMETER') : '3-1/4" LW CONCRETE ON 2" COMPOSITE DECK', 6.2, { b: true });
        const opens = (d.doors || []).filter(o => o.floor === v.floor && o.exterior && o.width >= 6);
        for (const o of opens) s += line(g.X(o.x1), g.Y(o.y1), g.X(o.x2), g.Y(o.y2), 'stroke="' + RED + '" stroke-width="3.6"');
        if (opens.length) s += T(g.X(opens[0].x1), g.Y(opens[0].y1) + (opens[0].y1 < D / 2 ? -6 : 12), steel ? 'STEEL LINTEL / EMBED HDR' : 'LVL / STEEL HDR', 6, { b: true, c: RED, a: 'start' });
      }
      return s;
    };
    return { views, overlay, sideHtml: head(t) + BOD('Framing layout') + legend([rawLeg('Span direction and member', line(4, 7, 40, 7, 'stroke="' + INK + '" marker-start="url(#arr)" marker-end="url(#arr)"')), rawLeg('Header / beam over opening', line(2, 7, 42, 7, 'stroke="' + RED + '" stroke-width="3.6"')),
      rawLeg(res ? 'Shear wall (SW)' : 'Girder / beam on grid', line(2, 7, 42, 7, res ? 'stroke="' + INK + '" stroke-width="3.2" stroke-dasharray="10 4" opacity=".55"' : 'stroke="' + INK + '" stroke-width="2.4" stroke-dasharray="16 4"')), rawLeg(res ? 'Hold-down at shear wall ends' : 'Steel column', rect(18, 4, 6, 6, 'fill="' + INK + '"')), ...(res ? [rawLeg('Ridge', line(2, 7, 42, 7, 'stroke="' + INK + '" stroke-width="1.4" stroke-dasharray="16 4 3 4"'))] : [])]) +
      sideNotes('Framing notes', res ? ['Roof: ' + (roof.type || 'gable') + ' roof, pre-engineered wood trusses at 24" o.c., designed by the truss manufacturer for the ASCE 7-22 wind uplift; truss layout and girder trusses by the manufacturer.', 'Floors: 14" open-web floor trusses at 24" o.c. (or I-joists at 16" o.c.) spanning between the exterior walls and the bearing line shown.', 'Headers: LVL as shown over openings 6 ft and wider; (2) 2x10 over smaller openings at bearing walls; jack and king studs per the IRC.', 'Walls: 2x4 at 16" o.c. (2x6 where taller than 10 ft or at plumbing walls); continuous 7/16" OSB sheathing, wood structural panel bracing per IRC R602.10 or an engineered shear wall design.', 'Hold-downs at the ends of each shear wall and beside large openings (4/S-501).', d.attached ? 'Party walls: 2-hour fire-resistance-rated common walls per IRC R302.2 (UL U347 or equal), continuous to the roof sheathing.' : 'Uplift connectors at every truss (H2.5A or equal) and straps at floor lines.']
        : ['Roof: ' + (steel ? 'steel joists at about 5 ft o.c. on joist girders at the grid' : 'open-web joists at about 4 ft o.c. on beams at the grid') + ', designed by the manufacturer for net uplift; bridging per SJI.', 'Columns: HSS or W-shape at grid intersections on spread footings (S-1xx).', 'Lateral: ' + (steel ? 'tilt-wall / masonry shear walls with the metal roof deck as the diaphragm.' : 'perimeter shear walls with the roof deck as the diaphragm.'), 'Grid shown is about ' + ftInS(G.sx) + ' × ' + ftInS(G.sy) + '; the EOR sets the final grid with the architect.', 'Rooftop units on framed openings with supplemental angles; loads to the joist supplier.']) };
  });
}

// S-501 typical details
function sDetails(ctx, sh) {
  sh.scale = 'As noted';
  const L = (x1, y1, x2, y2, s, a = 'start') => line(x1, y1, x2, y2, 'stroke="' + INK + '" stroke-width=".6"') + circle(x1, y1, 1.6, 'fill="' + INK + '" stroke="none"') + T(x2 + (a === 'start' ? 3 : -3), y2 + 3, s, 7.4, { a });
  const C = 'stroke="' + INK + '" stroke-width="1.6"', thin = 'stroke="' + INK + '" stroke-width=".8"', bar = (x, y) => circle(x, y, 3, 'fill="' + INK + '" stroke="none"');
  // material fills drawn as a few explicit marks over a tint (SVG pattern fills print as megabytes of PDF)
  const earth = (x, y, w, h) => rect(x, y, w, h, 'fill="#efe6d7" stroke="none"') + Array.from({ length: Math.max(0, Math.floor(w / 12)) }, (_, i) => line(x + 4 + i * 12, y + 8, x + 10 + i * 12, y + 2, 'stroke="#8a6d4a" stroke-width=".6"')).join('');
  const conc = pts => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); let dots = ''; for (let yy = Math.min(...ys) + 6, j = 0; yy < Math.max(...ys) - 3; yy += 15, j++) for (let xx = Math.min(...xs) + 5 + (j % 2) * 8; xx < Math.max(...xs) - 3; xx += 17) if (inPoly([xx, yy], pts)) dots += circle(xx, yy, 0.8, 'fill="#6b7174" stroke="none"'); return poly(pts, 'fill="#f2f2ef" stroke="none"') + dots + poly(pts, 'fill="none" ' + C); };
  const concR = (x, y, w, h) => conc([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
  const brick = (x, y, w, h) => rect(x, y, w, h, 'fill="#ecdccf" stroke="none"') + Array.from({ length: Math.max(0, Math.floor(h / 8)) }, (_, i) => line(x, y + (i + 1) * 8, x + w, y + (i + 1) * 8, 'stroke="#8a8f8c" stroke-width=".5"')).join('') + rect(x, y, w, h, 'fill="none" ' + thin);
  const brk = (x, y1, y2) => pline([[x, y1], [x, (y1 + y2) / 2 - 6], [x + 5, (y1 + y2) / 2 - 2], [x - 5, (y1 + y2) / 2 + 2], [x, (y1 + y2) / 2 + 6], [x, y2]], thin);
  const ds = [];
  { // 1: PT slab edge with perimeter grade beam
    const k = 60, ox = 250, oy = 250, P = (x, y) => [ox + x * k, oy + y * k], ts = 5 / 12, bd = 30 / 12, lw = 4 / 12, Lx = 4.5;
    let s = earth(...P(-1.5, 8 / 12), 1.5 * k, (bd + 0.8 - 8 / 12) * k) + earth(...P(0, ts), Lx * k, (bd + 0.8 - ts) * k) + line(...P(-1.6, 8 / 12), ...P(0, 8 / 12), C);
    s += conc([P(lw, 0), P(Lx, 0), P(Lx, ts), P(1, ts), P(1, bd), P(0, bd), P(0, lw), P(lw, lw)]) + brk(...P(Lx, 0).slice(0, 1), oy - 4, oy + ts * k + 4);
    s += pline([P(Lx, ts + .04), P(1.04, ts + .04), P(1.04, bd)], 'fill="none" stroke="' + INK + '" stroke-width=".8" stroke-dasharray="5 2"');
    s += rect(...P(0.2, 0.42), 0.6 * k, (bd - 0.62) * k, 'fill="none" ' + thin) + [[0.3, 0.55], [0.7, 0.55], [0.3, bd - 0.3], [0.7, bd - 0.3]].map(([x, y]) => bar(...P(x, y))).join('');
    s += line(...P(lw + 0.15, ts / 2), ...P(Lx - 0.05, ts / 2), 'stroke="' + RED + '" stroke-width="1.6"') + rect(...P(lw + 0.05, ts / 2 - 0.09), 6, 0.18 * k, 'fill="' + RED + '"');
    s += brick(...P(0, -3), lw * k, (3 + lw) * k) + rect(...P(lw + 1 / 12, -3), (0.5 / 12) * k, 3 * k, 'fill="#c9ccc9" ' + thin) + rect(...P(lw + 1.5 / 12, -3), (3.5 / 12) * k, 3 * k - 0.125 * k, 'fill="none" ' + thin) + rect(...P(lw + 1.5 / 12, -0.125), (3.5 / 12) * k, 0.125 * k, 'fill="#e2d3b4" ' + thin);
    s += line(...P(lw + 3.25 / 12, -0.1), ...P(lw + 3.25 / 12, 0.6), 'stroke="' + INK + '" stroke-width="1.4"');
    s += L(...P(Lx - 0.6, ts / 2), ...P(Lx - 0.2, -1.6), '1/2" Ø PT TENDON ~4\'-0" O.C. E.W.') + L(...P(Lx - 1.6, 0.2), ...P(Lx - 1.2, -1.1), '5" PT SLAB, 3,000 PSI') + L(...P(2.4, ts + .04), ...P(Lx - 0.8, -0.55), '10 MIL VAPOR RETARDER') + L(...P(0.7, bd - 0.3), ...P(2, bd + 0.3), '(2) #5 TOP AND BOTTOM, #3 STIRRUPS @ 24"') + L(...P(0.5, 1.4), ...P(2, 1.6), '12" × 30" PERIMETER GRADE BEAM') + L(...P(lw + 3.25 / 12, 0.45), ...P(-1.3, 1.6), '1/2" Ø ANCHOR BOLT @ 6\'-0", 7" EMBED', 'end') + L(...P(lw / 2, -1), ...P(-0.6, -2), 'BRICK VENEER ON 4" LEDGE', 'end') + L(...P(-0.8, 8 / 12), ...P(-1, 1.2), 'FINISHED GRADE, 8" MIN. BELOW FF', 'end');
    s += dim(...P(1.25, 0), ...P(1.25, bd), '2\'-6"', -12, 7);
    ds.push(['Perimeter grade beam at PT slab edge', s, [0, 50, 670, 460], k]);
  }
  { // 2: interior grade beam
    const k = 60, ox = 90, oy = 120, P = (x, y) => [ox + x * k, oy + y * k], ts = 5 / 12, bd = 2, Lx = 5;
    let s = earth(...P(0, ts), Lx * k, (bd + 0.7) * k - ts * k);
    s += conc([P(0, 0), P(Lx, 0), P(Lx, ts), P(3, ts), P(3, bd), P(2, bd), P(2, ts), P(0, ts)]) + brk(...P(0, 0).slice(0, 1), oy - 4, oy + ts * k + 4) + brk(...P(Lx, 0).slice(0, 1), oy - 4, oy + ts * k + 4);
    s += rect(...P(2.2, 0.32), 0.6 * k, (bd - 0.52) * k, 'fill="none" ' + thin) + [[2.3, 0.45], [2.7, 0.45], [2.3, bd - 0.3], [2.7, bd - 0.3]].map(([x, y]) => bar(...P(x, y))).join('') + line(...P(0.1, ts / 2), ...P(Lx - 0.1, ts / 2), 'stroke="' + RED + '" stroke-width="1.6"');
    s += pline([P(0, ts + .04), P(1.96, ts + .04), P(1.96, bd + .04), P(3.04, bd + .04), P(3.04, ts + .04), P(Lx, ts + .04)], 'fill="none" stroke="' + INK + '" stroke-width=".8" stroke-dasharray="5 2"');
    s += L(...P(2.5, 1.2), ...P(3.5, 1.3), '12" × 24" INTERIOR GRADE BEAM') + L(...P(2.7, bd - 0.3), ...P(3.5, 1.75), '(2) #5 TOP AND BOTTOM') + L(...P(0.8, ts / 2), ...P(0.4, -0.6), 'PT TENDONS / SLAB REINF. CONTINUOUS') + dim(...P(1.8, ts), ...P(1.8, bd), '1\'-7"', 12, 7);
    ds.push(['Interior grade beam', s, [50, 60, 450, 300], k]);
  }
  { // 3: isolated spread footing at a steel column
    const k = 40, ox = 70, oy = 160, P = (x, y) => [ox + x * k, oy + y * k], ts = 5 / 12, F = 6, fd = 1.5, top = 1.5;
    let s = earth(...P(0, ts), (F + 2) * k, (top + fd + 0.6) * k);
    s += conc([P(1, top), P(1 + F, top), P(1 + F, top + fd), P(1, top + fd)]) + conc([P(0, 0), P(F + 2, 0), P(F + 2, ts), P(0, ts)]) + concR(...P(1 + F / 2 - 0.5, ts), k, (top - ts) * k);
    s += line(...P(1.2, top + fd - 0.3), ...P(F + 0.8, top + fd - 0.3), 'stroke="' + INK + '" stroke-width="1.4"') + Array.from({ length: 9 }, (_, i) => bar(...P(1.3 + i * (F - 0.6) / 8, top + fd - 0.42))).join('');
    s += rect(...P(1 + F / 2 - 0.35, -2.6), 0.7 * k, 2.6 * k, 'fill="#d8dadb" ' + C) + rect(...P(1 + F / 2 - 0.6, -0.12), 1.2 * k, 0.12 * k, 'fill="' + INK + '"');
    for (const dx of [-0.4, 0.4]) s += line(...P(1 + F / 2 + dx, -0.1), ...P(1 + F / 2 + dx, top - 0.2), 'stroke="' + INK + '" stroke-width="1.2"');
    s += poly([P(1 + F / 2 - 0.9, 0), P(1 + F / 2, -0.5), P(1 + F / 2 + 0.9, 0), P(1 + F / 2, ts + 0.1)], 'fill="none" stroke="' + INK + '" stroke-width=".8" stroke-dasharray="3 2"');
    s += L(...P(1 + F / 2, -1.8), ...P(F + 1.2, -2.2), 'HSS / W COLUMN PER PLAN') + L(...P(1 + F / 2 + 0.5, -0.06), ...P(F + 1.2, -1.2), 'BASE PLATE, 1" GROUT, (4) 3/4" Ø F1554 RODS') + L(...P(1 + F / 2 + 0.8, -0.3), ...P(F + 1.2, -0.6), 'ISOLATION JOINT (DIAMOND)') + L(...P(F - 0.2, top + fd - 0.42), ...P(F + 1.4, top + fd + 0.5), '#5 @ 12" O.C. E.W., 3" CLR') + L(...P(1.5, top + 0.7), ...P(-0.1, top + fd + 0.9), 'F1 SPREAD FOOTING, SEE SCHEDULE', 'start');
    s += dim(...P(1, top + fd), ...P(1 + F, top + fd), '6\'-0" SQ. (TYP., SEE PLAN)', 14, 7) + dim(...P(F + 1.4, top), ...P(F + 1.4, top + fd), '1\'-6"', -12, 7);
    ds.push(['Spread footing at steel column (commercial)', s, [30, 40, 550, 335], k]);
  }
  { // 4: shear wall hold-down, elevation
    const k = 36, ox = 70, oy = 50, P = (x, y) => [ox + x * k, oy + y * k], H = 9, Wd = 5;
    let s = rect(...P(0, 0), Wd * k, H * k, 'fill="#eef0f0" stroke="none"');
    s += concR(...P(-0.3, H), (Wd + 1.5) * k, 1.2 * k) + earth(...P(-0.3, H + 1.2), (Wd + 1.5) * k, 0.6 * k);
    s += rect(...P(0, H - 0.125), Wd * k, 0.125 * k, 'fill="#e2d3b4" ' + thin) + rect(...P(0, 0), Wd * k, 0.25 * k, 'fill="#e2d3b4" ' + thin);
    for (let x = 0; x <= Wd - 0.1; x += 16 / 12) s += rect(...P(x, 0.25), 0.125 * k, (H - 0.375) * k, 'fill="#fff" ' + thin);
    s += rect(...P(Wd - 0.25, 0.25), 0.25 * k, (H - 0.375) * k, 'fill="#fff" ' + thin) + rect(...P(0, 0.25), 0.25 * k, (H - 0.375) * k, 'fill="#fff" ' + thin);
    for (const x of [0.25, Wd - 0.5]) s += rect(...P(x, H - 1.6), 0.25 * k, 1.45 * k, 'fill="#5d6366" stroke="' + INK + '"');
    for (const x of [0.37, Wd - 0.37]) s += line(...P(x, H - 1.2), ...P(x, H + 1.05), 'stroke="' + INK + '" stroke-width="1.6"');
    for (const x of [1.4, 3.4]) s += line(...P(x, H - 0.3), ...P(x, H + 0.6), 'stroke="' + INK + '" stroke-width="1.1"');
    s += L(...P(Wd - 0.4, H - 1), ...P(Wd + 1.2, H - 2.2), 'HOLD-DOWN (HDU5 OR EQ.) AT EACH END') + L(...P(Wd - 0.37, H + 0.6), ...P(Wd + 1.2, H + 0.2), '5/8" Ø THREADED ROD, EPOXY / CAST-IN') + L(...P(Wd - 0.12, 4), ...P(Wd + 1.2, 4), '(2) 2x END POST') + L(...P(2.4, 2), ...P(Wd + 1.2, 1.2), '7/16" OSB, 8d @ 4" EDGES / 12" FIELD') + L(...P(3.4, H - 0.1), ...P(Wd + 1.2, H - 0.8), '1/2" Ø ANCHOR BOLTS @ 32" O.C.') + L(...P(1, 0.1), ...P(Wd + 1.2, -0.3), 'DOUBLE TOP PLATE') + L(...P(0.8, H - 0.06), ...P(-0.2, H + 2.4), 'PT SILL PLATE ON SLAB / GRADE BEAM', 'start');
    ds.push(['Wood shear wall hold-down (elevation)', s, [40, 30, 460, 470], k]);
  }
  { // 5: roof truss bearing and hurricane tie
    const k = 56, ox = 260, oy = 180, P = (x, y) => [ox + x * k, oy + y * k], pitch = 0.5;
    let s = brick(...P(0, 0), (3.5 / 12) * k, 3.2 * k, 'fill="none" ' + thin) + rect(...P(0, -0.25), (3.5 / 12) * k, 0.25 * k, 'fill="#e2d3b4" ' + thin) + rect(...P(-0.5 / 12, -0.25), (0.5 / 12) * k, 3.45 * k, 'fill="#c9ccc9" ' + thin) + rect(...P(-5.5 / 12, 0.5), (4 / 12) * k, 2.7 * k);
    s += line(...P(-1.6, -0.25 - 1.6 * pitch + 0.3), ...P(3.5, -0.25 - 3.5 * pitch - 0.1), 'stroke="' + INK + '" stroke-width="2.6"') + line(...P(-0.1, -0.33), ...P(3.5, -0.33), 'stroke="' + INK + '" stroke-width="2.6"');
    s += line(...P(0.6, -0.33), ...P(0.9, -0.25 - 0.9 * pitch - 0.1), thin) + line(...P(1.6, -0.33), ...P(1.3, -0.25 - 1.3 * pitch - 0.1), thin);
    s += line(...P(-1.6, -0.25 - 1.6 * pitch + 0.42), ...P(3.5, -0.25 - 3.5 * pitch + 0.02), 'stroke="' + INK + '" stroke-width="1"') + line(...P(-1.6, -0.25 - 1.6 * pitch + 0.25), ...P(-1.6, 0.35), thin) + line(...P(-1.6, 0.35), ...P(-0.45, 0.35), thin);
    s += path('M' + P(0.27, 0.15).join(' ') + 'L' + P(0.33, -0.3).join(' ') + 'L' + P(0.33, -0.55).join(' '), 'fill="none" stroke="' + RED + '" stroke-width="2"');
    s += L(...P(0.33, -0.45), ...P(1.6, 0.5), 'H2.5A HURRICANE TIE EACH TRUSS (OR PER UPLIFT)') + L(...P(2.4, -0.33), ...P(2.6, -0.1), 'TRUSS BOTTOM CHORD') + L(...P(2.8, -0.25 - 2.8 * pitch - 0.05), ...P(2.4, -2.3), 'TRUSS TOP CHORD, 7/16" OSB, SHINGLES') + L(...P(0.15, -0.12), ...P(1.6, 1.1), 'DOUBLE TOP PLATE') + L(...P(-1.6, 0), ...P(-1.9, 1.2), 'FASCIA / SOFFIT, 1\'-6" OVERHANG', 'end') + L(...P(-0.35, 1.5), ...P(-0.8, 2.6), 'BRICK VENEER, TIES @ 16"', 'end') + L(...P(0.15, 1.8), ...P(1.6, 2.1), '2x4 @ 16" O.C. STUD WALL');
    ds.push(['Roof truss bearing and hurricane tie', s, [10, 30, 600, 370], k]);
  }
  { // 6: steel joist bearing on tilt-wall / CMU
    const k = 48, ox = 230, oy = 120, P = (x, y) => [ox + x * k, oy + y * k];
    let s = concR(...P(0, -1.5), 0.67 * k, 6.5 * k) + rect(...P(0.55, 0.1), 0.12 * k, 0.9 * k, 'fill="' + INK + '"');
    s += line(...P(0.67, 0.15), ...P(1.1, 0.15), 'stroke="' + INK + '" stroke-width="2"') + line(...P(1.1, 0.15), ...P(1.1, 0.4), 'stroke="' + INK + '" stroke-width="2"');
    s += rect(...P(0.75, -0.05), 4 * k, 0.2 * k, 'fill="#5d6366" stroke="' + INK + '"') + line(...P(1.6, 2.2), ...P(4.75, 2.2), 'stroke="' + INK + '" stroke-width="2.4"');
    for (let i = 0; i < 5; i++) s += line(...P(1.1 + i * 0.7, 0.15), ...P(1.45 + i * 0.7, 2.2), thin) + line(...P(1.45 + i * 0.7, 2.2), ...P(1.8 + i * 0.7, 0.15), thin);
    s += pline(Array.from({ length: 21 }, (_, i) => P(0.75 + i * 0.2, -0.05 - (i % 2 ? 0.12 : 0.24))), 'fill="none" stroke="' + INK + '" stroke-width="1"') + line(...P(0.67, -0.36), ...P(4.75, -0.36), 'stroke="' + INK + '" stroke-width="1.6"');
    s += L(...P(0.6, 0.6), ...P(-0.6, 1.4), 'EMBED PLATE 3/8"x8"x1\'-0" W/ (4) 1/2" HSA', 'end') + L(...P(0.9, 0.12), ...P(2.4, -1.2), 'JOIST SEAT, 4" MIN. BEARING, (2) 1/8" × 1-1/2" FILLET WELDS') + L(...P(3.5, -0.25), ...P(3.2, -0.8), '1-1/2" TYPE B DECK + TPO ROOF') + L(...P(3.6, 2.2), ...P(3.2, 2.8), 'STEEL JOIST PER PLAN (SJI)') + L(...P(0.33, 3.5), ...P(1.2, 3.8), '7-1/4" TILT-WALL PANEL (OR 8" CMU, GROUTED BOND BEAM)') + L(...P(0.33, -1.2), ...P(1.2, -1.4), 'PARAPET, SEE ARCH.');
    ds.push(['Steel joist bearing on tilt-wall / CMU', s, [10, 30, 600, 370], k]);
  }
  // two columns of three, each detail at the largest standard scale that fits its cell
  const cols = 2, cw = MAIN.w / cols, chh = MAIN.h / 3, DS = [[2 / 3, '1-1/2" = 1\'-0"'], [1, '1" = 1\'-0"'], [4 / 3, '3/4" = 1\'-0"'], [2, '1/2" = 1\'-0"'], [8 / 3, '3/8" = 1\'-0"'], [4, '1/4" = 1\'-0"']];
  const cells = ds.map(([title, body, box, k], i) => {
    const c = i % cols, r = Math.floor(i / cols), x = MAIN.x + c * cw, y = MAIN.y + r * chh, wpx = (cw - 24) * DPI / PT, hpx = (chh - 70) * DPI / PT, bw = box[2] - box[0], bh = box[3] - box[1];
    const fit = Math.min(wpx / bw, hpx / bh), sc = DS.find(([ft]) => DPI / ft / k <= fit + 1e-9) || DS[DS.length - 1], sf = DPI / sc[0] / k;
    const tx = (wpx - bw * sf) / 2 - box[0] * sf, ty = (hpx - bh * sf) / 2 - box[1] * sf;
    return at(x + 12, y + 8, cw - 24, chh - 70, svg(wpx, hpx, '<g transform="translate(' + n(tx) + ' ' + n(ty) + ') scale(' + n(sf) + ')">' + body + '</g>')) + at(x + 14, y + chh - 60, cw - 28, 50, viewTitle(String(i + 1), title, sc[1])) +
      (c ? at(x, y + 10, 0.8, chh - 20, '', 'border-left:.6pt solid #c9ccc9') : '') + (r ? at(x + 10, y, cw - 20, 0.8, '', 'border-top:.6pt solid #c9ccc9') : '');
  }).join('');
  return cells + side('<div class="engs">' + CSS + BOD('Typical details') + notes('Detail notes', ['Typical schematic details for pricing; the EOR details every condition.', 'Detail 1–2: PT slab and grade beams per PTI DC10.5 and the geotechnical report; beam depths and reinforcing shown are typical of the Houston region, not designed.', 'Detail 3: footing sizes per the S-1xx schedules (1,500 psf assumed).', 'Detail 4: hold-downs at each shear wall end and at openings per the shear wall schedule; anchor rods cast in or epoxy per the EOR.', 'Detail 5: uplift connectors at every truss, each end; straps at girder trusses per the truss reactions.', 'Detail 6: joist seats, bridging and bearing per SJI; embeds placed in the panels before the pour.', ...disc(ctx, 'structural').notes.slice(0, 2)]) + '</div>');
}

// M-1xx HVAC plans
function mHvac(ctx, sh) {
  return typeSheet(ctx, sh, (t, d) => {
    const H = hvacLayout(t, d), res = isRes(d.use), F = d.floors;
    const overlay = (v, g) => {
      const f = v.floor, fr = roomsOn(d, f), k = g.k, sup = 'stroke="' + DUCT + '" stroke-width="' + n(clamp(k * 0.5, 1.6, 3.4)) + '" stroke-linecap="square"', br = 'stroke="' + DUCT + '" stroke-width="1"', ret = 'stroke="' + DUCT + '" stroke-width="1.2" stroke-dasharray="5 3"';
      let s = '', top = '';
      const bySys = new Map();
      for (const sys of H.systems) if (sys.floors.includes(f)) { const z = bySys.get(sys.zone) || []; z.push(sys); bySys.set(sys.zone, z); }
      for (const list of bySys.values()) {
        const rooms = fr.filter(r => list[0].roomIds.has(r.id)), pts = rooms.flatMap(r => diffusers(r, res));
        const own = new Map(list.map(sy => [sy, []])); for (const p of pts) own.get(list.reduce((a, b) => Math.hypot(b.unit.x - p.x, b.unit.y - p.y) < Math.hypot(a.unit.x - p.x, a.unit.y - p.y) ? b : a)).push(p);
        for (const sy of list) {
          const u = sy.unit, here = u.floor === f, src = { x: u.x, y: u.y }, mine = own.get(sy);
          const runs = treeRuns(d, src, mine), tk = runs.length - mine.length; s += segs(runs.slice(0, Math.max(1, tk)), g, sup) + segs(runs.slice(Math.max(1, tk)), g, br);
          for (const p of mine) s += sym('supply', g.X(p.x), g.Y(p.y), g.r);
          // return: at the unit for rooftop units, in the central hall for split systems
          const rr = res ? central(rooms.length ? rooms : fr, d.W, d.D) : null, rp0 = res ? { x: cx(rr) + Math.min(2, rr.w / 4), y: cy(rr) - Math.min(2, rr.d / 4) } : { x: u.x + Math.min(4, d.W / 10), y: u.y }, rp = strictlyIn(d, rp0.x, rp0.y, 0.3) ? rp0 : { x: u.x, y: u.y - 3 };
          s += segs(treeRuns(d, src, [rp]), g, ret) + sym('return', g.X(rp.x), g.Y(rp.y), g.r * 1.15);
          if (sy.kind === 'rtu') top += (here ? rect(g.X(u.x) - 3 * k, g.Y(u.y) - 2 * k, 6 * k, 4 * k, 'fill="none" stroke="' + INK + '" stroke-width="1" stroke-dasharray="5 2"') : '') + sym('rtu', g.X(u.x), g.Y(u.y), Math.max(g.r * 1.6, 7)) + tag(g.X(u.x), g.Y(u.y) - Math.max(g.r * 1.6, 7) - 4, sy.tag + ' (' + f1(sy.tons) + ' T) ON ROOF', 6.4);
          else if (here) top += sym('ahu', g.X(u.x), g.Y(u.y), Math.max(g.r * 1.5, 7)) + tag(g.X(u.x), g.Y(u.y) - Math.max(g.r * 1.5, 7) - 3, sy.tag + (u.where === 'attic' ? ' IN ATTIC ABOVE' : '') + ' — ' + f1(sy.tons) + ' T, ' + f0(sy.cfm) + ' CFM', 6.4);
          else top += rect(g.X(u.x) - 4, g.Y(u.y) - 4, 8, 8, 'fill="#fff" stroke="' + DUCT + '" stroke-width="1"') + line(g.X(u.x) - 4, g.Y(u.y) - 4, g.X(u.x) + 4, g.Y(u.y) + 4, 'stroke="' + DUCT + '"') + tag(g.X(u.x), g.Y(u.y) - 7, 'DUCT CHASE TO ' + sy.tag, 6);
          if (f === Math.min(...sy.floors) && sy.kind !== 'rtu') { const tr = rooms.find(r => ['living', 'family', 'hall', 'entry'].includes(r.type)) || rr; if (tr) top += sym('thermostat', g.X(tr.x) + g.r + 2, g.Y(cy(tr)), g.r); }
          if (sy.kind === 'rtu' && f === sy.floors[0]) { const host = rooms.find(r => r.ext?.left || r.ext?.right || r.ext?.front) || rooms[0]; if (host && sy === list[0]) top += sym('thermostat', g.X(host.x) + g.r + 3, g.Y(cy(host)), g.r); }
          // condensing unit outside the back wall, refrigerant lines to the air handler
          if (sy.kind !== 'rtu' && f === 1) { const i = H.systems.indexOf(sy), ws = wallSpot(d, { x: u.x + (i % 2 ? 5 : 0), y: d.D }, ['back', 'left', 'right']), [ox, oy] = outward(ws.side, g.out(4)), cxu = ws.x + ox, cyu = ws.y + oy, rl = 'stroke="' + INK + '" stroke-width=".8" stroke-dasharray="2 2"';
            top += sym('condenser', g.X(cxu), g.Y(cyu), Math.max(g.r * 1.4, 6)) + tag(g.X(cxu), g.Y(cyu) - Math.max(g.r * 1.4, 6) - 3, sy.cu, 6.4) + line(g.X(cxu), g.Y(cyu), g.X(ws.x), g.Y(ws.y), rl) + (here ? segs(treeRuns(d, { x: ws.x - Math.sign(ox) * 0.3, y: ws.y - Math.sign(oy) * 0.3 }, [{ x: u.x, y: u.y }]), g, rl) : ''); }
        }
      }
      for (const e of H.exhaust.filter(x => x.floor === f)) top += sym('fan', g.X(e.x), g.Y(e.y), g.r) + T(g.X(e.x) + g.r + 2, g.Y(e.y) + 3, e.tag + ' ' + e.cfm + ' CFM', 5.8, { a: 'start' });
      for (const e of H.vents.filter(x => x.floor === f)) { const [ox, oy] = outward(e.side, 1); top += sym('fan', g.X(e.x + ox), g.Y(e.y + oy), g.r * 1.3) + tag(g.X(e.x + ox * 3), g.Y(e.y + oy * 3) - 4, e.tag + ' ' + f0(e.cfm) + ' CFM', 6); }
      if (H.vents.length && f === 1) { const wr = fr.find(r => r.type === 'warehouse'); if (wr) top += T(g.X(cx(wr)), g.Y(cy(wr)), 'WAREHOUSE: VENTILATED, NOT CONDITIONED\nWALL EXHAUST FANS + MOTORIZED INTAKE LOUVERS\n(GAS UNIT HEATERS FOR FREEZE PROTECTION, OPTIONAL)', g.fs + 1.5, { b: true }); }
      if (H.hood && H.hood.room.floor === f) { const h = H.hood; top += rect(g.X(h.x), g.Y(h.y + h.d), h.w * k, h.d * k, 'fill="none" stroke="' + INK + '" stroke-width="1.2"') + line(g.X(h.x), g.Y(h.y + h.d), g.X(h.x + h.w), g.Y(h.y), 'stroke="' + INK + '" stroke-width=".6"') + tag(g.X(h.x + h.w / 2), g.Y(h.y) + 9, 'KH-1 TYPE I HOOD + MAU-1 — BY KITCHEN CONSULTANT', 6); }
      return s + top;
    };
    const rows = H.systems.slice(0, 14).map(s => [s.tag + (s.kind === 'rtu' ? '' : ' / ' + s.cu), s.kind === 'rtu' ? 'Rooftop unit' : (s.unit.where === 'attic' ? 'Attic' : s.unit.where), f1(s.tons), f0(s.cfm), heatOf(d, s).text]);
    if (H.systems.length > 14) rows.push(['…', (H.systems.length - 14) + ' more', '', '', '']);
    return { views: floorViews(d, 'HVAC plan'), overlay, sideHtml: head(t) + BOD('HVAC zoning, tonnage and diffuser counts') + legend(['supply', 'return', 'thermostat', 'fan', res ? 'ahu' : 'rtu', ...(res ? ['condenser'] : []), rawLeg('Supply duct, trunk / branch', line(2, 5, 42, 5, 'stroke="' + DUCT + '" stroke-width="3"') + line(2, 11, 42, 11, 'stroke="' + DUCT + '" stroke-width="1"')), rawLeg('Return duct', line(2, 7, 42, 7, 'stroke="' + DUCT + '" stroke-width="1.2" stroke-dasharray="5 3"'))]) +
      tbl('Equipment — Type ' + t.id, ['Tag', 'Location', 'Tons', 'CFM', 'Heat'], rows, [2, 3]) + '<div class="sm">Conditioned area ' + f0(H.area) + ' sf · ' + f1(H.tons) + ' tons in all' + (res ? ' (' + f0(H.area / Math.max(H.tons, 0.1)) + ' sf / ton)' : '') + ' · ' + plural(H.exhaust.length + H.vents.length, 'exhaust fan') + '</div>' +
      sideNotes('HVAC notes', [res ? 'Split systems of at most 5 tons; one per floor group, the air handler in the garage, a closet or the attic above the top floor; condensing units on pads behind the building.' : 'Packaged rooftop units, one per tenant or large room, about 3,500 sf and 25 tons each at most; economizers where IECC C403.5 requires.', 'Supply diffusers: one per ~' + (res ? 150 : 250) + ' sf of room, none in closets, stairs and the garage' + (res ? '' : '; restrooms and janitor rooms take transfer air') + '.', 'Ducts shown as single-line trunks and branches; sizes by Manual D / the EOR.', 'Exhaust fans: baths 80 cfm, half baths and laundry 50 cfm, restrooms 75 cfm a water closet, ducted to outside.', 'Thermostat about 48" above floor on an interior wall, away from supply air and sunlight.']) };
  });
}

// P-1xx plumbing plans
function plumbLayout(t, d) {
  const { list } = plumbingFixtures(d), wh = waterHeaters(t, d), fx = [];
  for (const { room: r, codes } of list) {
    const longBack = r.w >= r.d, walls = longBack ? ['back', 'front'] : ['left', 'right'], len = longBack ? r.w : r.d, items = codes.filter(c => c !== 'FD'), placed = [];
    let wi = 0, u = 0.4;
    for (const c of items) { const w = FIX[c].ft; if (u + w > len - 0.3 && wi === 0) { wi = 1; u = 0.4; } placed.push({ code: c, wall: walls[wi], u: u + w / 2 }); u += w + 0.3; }
    const fds = codes.filter(c => c === 'FD').map((c, i, a) => ({ code: c, x: r.x + r.w * (i + 1) / (a.length + 1), y: r.y + r.d * 0.42 }));
    const pos = p => p.wall === 'back' ? { x: r.x + p.u, y: r.y + r.d } : p.wall === 'front' ? { x: r.x + r.w - p.u, y: r.y } : p.wall === 'left' ? { x: r.x, y: r.y + p.u } : { x: r.x + r.w, y: r.y + r.d - p.u };
    const anchor = placed.length ? pos(placed[0]) : { x: cx(r), y: cy(r) };
    const inset = placed.length ? { x: anchor.x + (placed[0].wall === 'left' ? 0.6 : placed[0].wall === 'right' ? -0.6 : 0), y: anchor.y + (placed[0].wall === 'back' ? -0.6 : placed[0].wall === 'front' ? 0.6 : 0) } : anchor;
    fx.push({ room: r, codes, placed: placed.map(p => ({ ...p, ...pos(p) })), fds, anchor: inset, hot: codes.some(c => FIX[c].hot > 0) });
  }
  return { fx, wh };
}
// a fixture drawn in its own frame: origin on the wall at the fixture's middle, +x along the wall, +y into the room
function glyph(code, k) {
  const F = FIX[code], w = F.ft * k, dp = F.dp * k, a = 'fill="#fff" stroke="' + INK + '" stroke-width=".8"', h = w / 2;
  switch (code) {
    case 'WC': case 'WCA': return rect(-w * 0.32, 0, w * 0.64, dp * 0.28, a) + '<ellipse cx="0" cy="' + n(dp * 0.6) + '" rx="' + n(w * 0.24) + '" ry="' + n(dp * 0.34) + '" ' + a + '/>';
    case 'LAV': case 'LAVA': case 'HS': return rect(-h * 0.85, 0, w * 0.85, dp, a) + '<ellipse cx="0" cy="' + n(dp * 0.5) + '" rx="' + n(w * 0.28) + '" ry="' + n(dp * 0.3) + '" ' + a + '/>';
    case 'TUB': return rect(-h, 0, w, dp, a) + rect(-h + 2, 2, w - 4, dp - 4, a.replace('.8', '.5')) ;
    case 'SHR': return rect(-h, 0, w, dp, a) + line(-h, 0, h, dp, 'stroke="' + INK + '" stroke-width=".4"') + line(h, 0, -h, dp, 'stroke="' + INK + '" stroke-width=".4"');
    case 'KS': case 'PS': return rect(-h, 0, w, dp, a) + rect(-h + 2, 2, w / 2 - 3, dp - 4, a.replace('.8', '.5')) + (code === 'KS' ? rect(1, 2, w / 2 - 3, dp - 4, a.replace('.8', '.5')) : '');
    case 'CKS': return rect(-h, 0, w, dp, a) + [0, 1, 2].map(i => rect(-h + 2 + i * (w - 4) / 3, 2, (w - 4) / 3 - 2, dp - 4, a.replace('.8', '.5'))).join('');
    default: return rect(-h, 0, w, dp, a) + T(0, dp / 2 + 2.5, code, Math.min(7, Math.max(4, dp * 0.45)), { halo: false });
  }
}
const ROT = { back: 0, left: -90, front: 180, right: 90 };
function pPlan(ctx, sh) {
  return typeSheet(ctx, sh, (t, d) => {
    const PL = plumbLayout(t, d), W = d.W, D = d.D, gas = gasService(d), res = isRes(d.use);
    const all = PL.fx;
    const f1fx = all.filter(x => x.room.floor === 1), first = (f1fx.length ? f1fx : all).reduce((p, q) => q.anchor.y < p.anchor.y ? q : p, (f1fx.length ? f1fx : all)[0]);
    // the water service and the building sewer go through the nearest clear stretch of street-side wall, a few feet apart
    const we = wallSpot(d, { x: first ? first.anchor.x - 1.5 : W / 2, y: 0 }, ['front', 'left', 'right']), se0 = wallSpot(d, { x: we.x + 2.5, y: we.y }, [we.side]), se = Math.hypot(se0.x - we.x, se0.y - we.y) < 1 ? wallSpot(d, { x: we.x - 2.5, y: we.y }, [we.side]) : se0;
    const cw = 'stroke="' + BLUE + '" stroke-width="1.3"', hw = 'stroke="' + RED + '" stroke-width="1.3"', san = 'stroke="' + BROWN + '" stroke-width="1.6" stroke-dasharray="9 3"', gl = 'stroke="' + GAS + '" stroke-width="1.2" stroke-dasharray="8 3 2 3"';
    const kit = (d.rooms || []).find(r => r.type === 'commercial_kitchen'), resKit = (d.rooms || []).find(r => r.type === 'kitchen' && r.floor === 1);
    const overlay = (v, g) => {
      const f = v.floor, k = g.k; let s = '', top = '';
      for (const x of all.filter(q => q.room.floor === f)) {
        for (const p of x.placed) top += '<g transform="translate(' + n(g.X(p.x)) + ' ' + n(g.Y(p.y)) + ') rotate(' + ROT[p.wall] + ')">' + glyph(p.code, k) + '</g>';
        for (const p of x.fds) top += sym('floordrain', g.X(p.x), g.Y(p.y), g.r);
        const mk = [...new Set(x.codes)].map(c => c + (x.codes.filter(q => q === c).length > 1 ? '×' + x.codes.filter(q => q === c).length : '')).join(' ');
        if (x.room.w * k > mk.length * 3.6) top += T(g.X(cx(x.room)), g.Y(cy(x.room)) + 3, mk, 5.8, { b: true });
        if (f > 1) top += circle(g.X(x.anchor.x), g.Y(x.anchor.y), 3, 'fill="#fff" stroke="' + BROWN + '" stroke-width="1.2"') + T(g.X(x.anchor.x) + 5, g.Y(x.anchor.y) - 4, 'CW/HW + W&V STACK DN', 5.5, { a: 'start' });
      }
      if (f === 1) {
        const pts = all.map(x => x.anchor), o6 = g.out(6), o7 = g.out(7), inn = (p, ft = 0.6) => { const [a, b] = outward(p.side, -ft); return { x: p.x + a, y: p.y + b }; }, outp = (p, ft) => { const [a, b] = outward(p.side, ft); return { x: p.x + a, y: p.y + b }; };
        // domestic water from the meter at the street side, in through the nearest clear wall, a trunk and branches to every wet room and riser
        const wm = outp(we, o6), wv = outp(we, o6 * 0.45);
        s += line(g.X(wm.x), g.Y(wm.y), g.X(we.x), g.Y(we.y), cw) + segs(treeRuns(d, inn(we), pts), g, cw) + line(g.X(we.x), g.Y(we.y), g.X(inn(we).x), g.Y(inn(we).y), cw) + sym('watermeter', g.X(wm.x), g.Y(wm.y), g.r * 1.2) + sym('gatevalve', g.X(wv.x), g.Y(wv.y), g.r * 0.9) + T(g.X(wm.x) - 8, g.Y(wm.y) + 3, (res ? '1"' : '1-1/2"') + ' DOMESTIC WATER FROM METER' + (res ? '' : ' (RPZ)'), 6, { a: 'end' });
        for (const w of PL.wh) { const hp = all.filter(x => x.hot && w.serves.includes(x.room.id)).map(x => ({ x: x.anchor.x + 0.8, y: x.anchor.y })); if (hp.length) s += segs(treeRuns(d, { x: w.x, y: w.y }, hp), g, hw); top += sym('waterheater', g.X(w.x), g.Y(w.y), Math.max(g.r * 1.3, 6)) + tag(g.X(w.x), g.Y(w.y) - Math.max(g.r * 1.3, 6) - 3, w.tag, 6.4); }
        // the building drain: a branch from each wet room to a collector, out through the wall to the sewer, cleanouts at the exit and the head
        const drains = all.map(x => ({ x: x.anchor.x - 0.8, y: x.anchor.y })), so = outp(se, o7), sc = outp(se, o7 * 0.35), si = inn(se);
        s += segs(treeRuns(d, si, drains), g, san) + line(g.X(si.x), g.Y(si.y), g.X(so.x), g.Y(so.y), san) + sym('cleanout', g.X(sc.x), g.Y(sc.y), g.r) + T(g.X(so.x) + 6, g.Y(so.y) + 3, (res ? '4"' : '6"') + ' BUILDING SEWER TO SANITARY MAIN (SEE C-301)', 6, { a: 'start' });
        if (drains.length) { const far = drains.reduce((p, q) => Math.hypot(q.x - si.x, q.y - si.y) > Math.hypot(p.x - si.x, p.y - si.y) ? q : p); top += sym('cleanout', g.X(far.x), g.Y(far.y), g.r * 0.9); }
        // hose bibbs front and back
        for (const hb of [wallSpot(d, { x: W * (res ? 0.82 : 0.95), y: 0 }, ['front']), wallSpot(d, { x: W * (res ? 0.18 : 0.05), y: D }, ['back'])]) { const a = outp(hb, 0.8), b = outp(hb, 2.6); top += sym('hosebibb', g.X(a.x), g.Y(a.y), g.r) + T(g.X(b.x), g.Y(b.y) + 3, 'HB', 5.5, { b: true }); }
        // grease interceptor outside the kitchen's nearest back or side wall
        if (kit) {
          const ks = wallSpot(d, { x: cx(kit), y: kit.y + kit.d }, ['back', 'left', 'right']), gh = clamp(o7 - 1, 0.8, 3), c = outp(ks, o7 - gh / 2), hz = ks.side === 'back' || ks.side === 'front', a = all.find(x => x.room === kit), gw = hz ? 8 : gh, gd = hz ? gh : 8;
          top += rect(g.X(c.x - gw / 2), g.Y(c.y + gd / 2), gw * k, gd * k, 'fill="#fff" stroke="' + BROWN + '" stroke-width="1.4"') + tag(g.X(c.x), g.Y(c.y + gd / 2) - 4, 'GI-1 GREASE INTERCEPTOR (SIZE BY AHJ)', 6.2, BROWN);
          if (a) s += segs(treeRuns(d, inn(ks), [a.anchor]), g, san) + line(g.X(inn(ks).x), g.Y(inn(ks).y), g.X(c.x), g.Y(c.y), san);
        }
        // gas: meter at the front corner, lines to the gas appliances
        if (gas) {
          const gm = wallSpot(d, { x: W, y: 0 }, ['front', 'right', 'left']), [gx0, gy0] = outward(gm.side, g.out(3)), mx = gm.x + gx0, my = gm.y + gy0, apps = [...PL.wh.filter(w => w.gas).map(w => ({ x: w.x, y: w.y, s: w.tag })), ...(resKit ? [{ x: resKit.x + resKit.w - 2, y: resKit.y + 2, s: 'RANGE' }] : []), ...(kit ? [{ x: kit.x + kit.w / 2, y: kit.y + kit.d - 5, s: 'COOKING LINE' }] : [])];
          top += rect(g.X(mx) - 6, g.Y(my) - 4, 12, 8, 'fill="#fff" stroke="' + GAS + '" stroke-width="1.2"') + T(g.X(mx), g.Y(my) + 2.5, 'GM', 5.5, { b: true, halo: false, c: GAS }) + T(g.X(mx) - 8, g.Y(my) + 12, 'GAS METER / REGULATOR', 5.5, { a: 'end' });
          const [ix, iy] = outward(gm.side, -0.6); s += line(g.X(mx), g.Y(my), g.X(gm.x + ix), g.Y(gm.y + iy), gl) + segs(treeRuns(d, { x: gm.x + ix, y: gm.y + iy }, apps), g, gl);
        }
      }
      return s + top;
    };
    const ft = fixtureTotals(d);
    return { views: floorViews(d, 'Plumbing plan'), overlay, sideHtml: head(t) + BOD('Fixture placement and pipe routing') + legend(['line:water', rawLeg('Hot water', line(2, 7, 42, 7, 'stroke="' + RED + '" stroke-width="1.4"')), 'line:sanitary', ...(gas ? ['line:gas'] : []), 'waterheater', 'cleanout', 'floordrain', 'hosebibb', 'watermeter', 'gatevalve']) +
      tbl('Fixtures — Type ' + t.id + ' (each)', ['Mark', 'Fixture', 'Qty'], Object.entries(ft.counts).map(([c, q]) => [c, FIX[c].name, String(q)]), [2]) + '<div class="sm">' + f1(ft.wsfu) + ' WSFU · ' + f1(ft.dfu) + ' DFU · ' + PL.wh.map(w => w.tag + ': ' + w.size).join('; ') + '</div>' +
      sideNotes('Plumbing notes', ['Domestic water enters at the front from the meter; cold (blue) and hot (red) headers with a branch to each wet room; risers in walls to upper floors.', 'Sanitary waste (brown, dashed) to a building drain leaving the front of the building, with cleanouts at the exit, the ends of the drain and the base of each stack.', 'Vents: each fixture group vented through the roof (VTR) or with an air admittance valve where the AHJ allows; stack vents at each riser.', res ? 'Hose bibbs front and back; washer box with a drain pan where over finished space.' : 'Floor drains with trap primers in restrooms and the kitchen; grease waste to the interceptor; accessible fixtures per TAS.', gas ? 'Gas piping from the meter to the gas appliances, sized by the IFGC tables; sediment trap and shutoff at each appliance.' : 'No gas service assumed.']) };
  });
}

// one block a type on the main area (riser and one-line diagrams), each drawn at a base size and scaled to its cell
function typeBlocks(tw, title, draw) {
  const nB = Math.max(1, tw.length), cols = nB <= 4 ? 2 : nB <= 6 ? 3 : 4, rows = Math.max(2, Math.ceil(nB / cols)), cw = MAIN.w / cols, ch = MAIN.h / rows;
  return tw.map(({ t, d }, i) => {
    const c = i % cols, r = Math.floor(i / cols), x0 = MAIN.x + c * cw, y0 = MAIN.y + r * ch, wpx = (cw - 20) * DPI / PT, hpx = (ch - 64) * DPI / PT;
    if (!d) return at(x0 + 10, y0 + 8, cw - 20, 60, '<div class="warnbox"><b>Type ' + esc(t.id) + ':</b> design not available.</div>');
    const { body, w, h } = draw(t, d), sf = clamp(Math.min(wpx / w, hpx / h), 0.5, 1.9);
    const hpt = Math.min(ch - 64, h * sf * PT / DPI + 4);
    return at(x0 + 10, y0 + 6, cw - 20, hpt, svg(wpx, h * sf + 4, '<g transform="scale(' + n(sf) + ')">' + body + '</g>')) + at(x0 + 14, y0 + 10 + hpt, cw - 28, 48, viewTitle(String(i + 1), title(t), 'N.T.S.')) +
      (c ? at(x0, y0 + 10, 0.8, ch - 20, '', 'border-left:.6pt solid #c9ccc9') : '') + (r ? at(x0 + 10, y0, cw - 20, 0.8, '', 'border-top:.6pt solid #c9ccc9') : '');
  }).join('');
}
// P-601 riser diagrams: one block a type
function pRiser(ctx, sh) {
  sh.scale = 'N.T.S.';
  const cells = typeBlocks(typesWith(ctx), t => 'Riser diagrams — Type ' + t.id + ' (' + t.label + ')', (t, d) => { const w = 560, h = 170 + d.floors * 120; return { body: riserSVG(t, d, w, h), w, h }; });
  return cells + side('<div class="engs">' + CSS + BOD('Riser diagrams') + legend(['line:water', rawLeg('Hot water', line(2, 7, 42, 7, 'stroke="' + RED + '" stroke-width="1.4"')), 'line:sanitary', rawLeg('Vent', line(2, 7, 42, 7, 'stroke="' + BROWN + '" stroke-width="1" stroke-dasharray="2 2"')), 'line:gas', 'waterheater', 'cleanout', 'gatevalve', 'watermeter']) +
    notes('Riser notes', ['Schematic isometric diagrams: fixture groups by floor, not every fitting. Pipe sizes by the fixture units (P-001) and the engineer.', 'Domestic water: meter, backflow (RPZ at commercial services), main shutoff, water heater, cold and hot risers to each floor.', 'Waste and vent: each group drains to a stack, stacks to the building drain, a two-way cleanout outside at the building sewer; vents through the roof.', 'Gas: meter and regulator, a shutoff and sediment trap at each appliance; CFH from appliance input ratings.', ...disc(ctx, 'plumbing').notes.slice(0, 2)]) + '</div>');
}
function riserSVG(t, d, wpx, hpx) {
  const { fx, wh } = plumbLayout(t, d), F = d.floors, gas = gasService(d), res = isRes(d.use);
  const groups = []; for (const x of fx) { const key = x.room.floor + '|' + x.codes.join(','); const g = groups.find(q => q.key === key); if (g) g.n++; else groups.push({ key, floor: x.room.floor, name: x.room.type.replace(/_/g, ' '), codes: x.codes, n: 1 }); }
  const third = wpx / (gas ? 3 : 2), top = 30, bot = hpx - 46, lvl = f => bot - (f - 1) * (bot - top - 30) / Math.max(F, 1), cw = 'stroke="' + BLUE + '" stroke-width="1.4"', hw = 'stroke="' + RED + '" stroke-width="1.4"', san = 'stroke="' + BROWN + '" stroke-width="1.8"', vent = 'stroke="' + BROWN + '" stroke-width="1" stroke-dasharray="2 2"';
  let s = '';
  const head = (x, sTxt) => T(x + 6, 14, sTxt, 8, { a: 'start', b: true });
  // levels
  for (let f = 1; f <= F + 1; f++) { const y = f <= F ? lvl(f) : top + 10; s += line(4, y, wpx - 4, y, 'stroke="' + GREY + '" stroke-width=".5" stroke-dasharray="6 4"') + T(6, y - 3, f <= F ? 'FLOOR ' + f : 'ROOF', 6, { a: 'start', c: GREY2 }); }
  // domestic water
  { const x0 = 18, xr = x0 + 34, xh = xr + 12; s += head(0, 'DOMESTIC WATER');
    s += line(x0, bot + 26, xr, bot + 26, cw) + sym('watermeter', x0 + 8, bot + 26, 6) + (res ? '' : rect(x0 + 18, bot + 21, 12, 10, 'fill="#fff" stroke="' + BLUE + '"') + T(x0 + 24, bot + 28.5, 'RP', 5, { halo: false })) + T(x0, bot + 40, 'FROM METER', 5.5, { a: 'start' });
    s += line(xr, bot + 26, xr, lvl(F) - 6, cw) + sym('gatevalve', xr, bot + 12, 5);
    if (wh.length) { s += sym('waterheater', xh + 12, bot + 10, 8) + line(xr, bot + 18, xh + 12, bot + 18, cw) + line(xh + 12, bot + 2, xh, bot + 2, hw) + line(xh, bot + 2, xh, lvl(F) - 6, hw) + T(xh + 24, bot + 14, wh[0].tag + (wh.length > 1 ? ' (+' + (wh.length - 1) + ')' : ''), 5.5, { a: 'start' }); }
    const per = new Map(); for (const g of groups) { const L = per.get(g.floor) || []; L.push(g); per.set(g.floor, L); }
    for (const [f, L] of per) L.slice(0, 5).forEach((g, i) => { const y = lvl(f) - 8 - i * 11, xe = third - 14; s += line(xr, y, xe, y, cw) + (g.codes.some(c => FIX[c].hot) ? line(xh, y + 3, xe, y + 3, hw) : '') + T(xh + 8, y - 2.5, g.name + (g.n > 1 ? ' ×' + g.n : '') + ': ' + [...new Set(g.codes)].join(', '), 5.4, { a: 'start' }); });
  }
  // waste and vent
  { const x0 = third + 10, xs = x0 + 30; s += head(third, 'WASTE & VENT');
    s += line(xs, lvl(1) + 14, xs, top + 2, san) + line(xs + 10, lvl(F) - 4, xs + 10, top + 2, vent) + T(xs + 4, top - 2, 'VTR', 5.5, { a: 'start', b: true });
    s += line(x0 - 6, lvl(1) + 14, third * 2 - 16, lvl(1) + 14, san) + sym('cleanout', xs, lvl(1) + 22, 5) + line(third * 2 - 16, lvl(1) + 14, third * 2 - 16, bot + 30, san) + sym('cleanout', third * 2 - 16, bot + 22, 5) + T(third * 2 - 20, bot + 40, 'BUILDING SEWER TO SANITARY MAIN', 5.5, { a: 'end' });
    const per = new Map(); for (const g of groups) { const L = per.get(g.floor) || []; L.push(g); per.set(g.floor, L); }
    for (const [f, L] of per) L.slice(0, 5).forEach((g, i) => { const y = lvl(f) - 6 - i * 11, xe = third * 2 - 30; s += line(xs, y + 6, xe, y, san) + line(xe - 8, y, xe - 8, y - 8, vent) + line(xe - 8, y - 8, xs + 10, y - 8, vent) + T(xe + 2, y + 2, f1(sum(g.codes, c => FIX[c].dfu) * g.n) + ' DFU', 5.4, { a: 'start' }); });
  }
  // gas
  if (gas) { const x0 = third * 2 + 14, xg = x0 + 20; s += head(third * 2, 'GAS');
    const apps = [...wh.filter(w => w.gas).map(w => [w.tag, /tankless/.test(w.size) ? 199 : 40]), ...(res ? [['Range', 65], ['Furnace', 80]] : d.use === 'restaurant' ? [['Cooking line', 600], ['RTU heat', 250]] : [['RTU heat', 125]])];
    s += rect(x0 - 6, bot + 20, 14, 10, 'fill="#fff" stroke="' + GAS + '" stroke-width="1.2"') + T(x0 + 1, bot + 27.5, 'GM', 5, { b: true, halo: false }) + line(x0 + 8, bot + 25, xg, bot + 25, lineAttr('gas')) + line(xg, bot + 25, xg, bot - 10 - (apps.length - 1) * Math.min(40, (bot - top - 40) / apps.length), lineAttr('gas'));
    apps.forEach(([a, mbh], i) => { const y = bot - 10 - i * Math.min(40, (bot - top - 40) / apps.length); s += line(xg, y, wpx - 50, y, lineAttr('gas')) + sym('gatevalve', wpx - 60, y, 4) + T(wpx - 46, y + 3, a + ' ' + mbh + ' MBH', 5.6, { a: 'start' }); });
    s += T(x0, bot + 42, 'TOTAL ~' + f0(sum(apps, a => a[1])) + ' CFH (SIZE BY IFGC 402)', 5.5, { a: 'start' });
  }
  return s;
}

// E-2xx power and lighting plans
function ePlan(ctx, sh) {
  return typeSheet(ctx, sh, (t, d) => {
    const res = isRes(d.use), W = d.W, D = d.D, AL = alarms(d), ten = tenantsOn(d, 1);
    // panels: homes in the garage (or laundry); commercial one a tenant in its back room, else in a service room
    const panels = res ? [firstOf(d.rooms, ['garage', 'laundry', 'mechanical', 'storage', 'closet']) || d.rooms[0]].map(r => ({ name: 'A', room: r })) : ten.length ? ten.map(x => ({ name: x.id, room: x.rooms.find(r => r.type === 'storage') || x.main })) : [{ name: 'A', room: firstOf(d.rooms, ['electrical', 'mechanical', 'storage', 'janitor']) || (d.rooms || []).find(r => r.type === 'warehouse') || d.rooms[0] }];
    // homes: on the garage wall the house shares; the meter outside on the nearest clear stretch of wall
    for (const p of panels) { const r = p.room, s = r.type === 'garage' ? 'back' : extSide(d, r) || 'back', pt = onWall(r, s, s === 'back' || s === 'front' ? 0.8 : 0.75); Object.assign(p, { side: s, x: pt.x, y: pt.y, meter: wallSpot(d, pt) }); }
    const overlay = (v, g) => {
      const f = v.floor, fr = roomsOn(d, f), doors = (d.doors || []).filter(o => o.floor === f), k = g.k, r0 = g.r;
      let s = '';
      for (const r of fr) {
        for (const p of receptacles(r, { res, doors, W, attached: d.attached })) { const [ix, iy] = outward(p.side, -(r0 * 1.05) / k); s += sym(p.kind, g.X(p.x + ix), g.Y(p.y + iy), r0 * 0.9); }
        for (const p of lights(r, res)) s += sym(p.kind, g.X(p.x), g.Y(p.y), r0 * (p.kind === 'fixture2x4' ? 1.1 : 0.95));
        // switch inside the room beside its first door
        const o = doors.find(q => q.a === r.id || q.b === r.id);
        if (o && !['closet', 'walk_in_closet'].includes(r.type) || (o && SMALL.includes(r.type) && area(r) > 20)) {
          const h = o.orient === 'h', into = h ? (cy(r) > o.y1 ? 1 : -1) : (cx(r) > o.x1 ? 1 : -1), along = h ? Math.max(o.x1, o.x2) + 1 : Math.max(o.y1, o.y2) + 1;
          const fits = h ? along < r.x + r.w - 0.3 : along < r.y + r.d - 0.3, al = fits ? along : (h ? Math.min(o.x1, o.x2) - 1 : Math.min(o.y1, o.y2) - 1);
          s += sym('switch', h ? g.X(al) : g.X(o.x1 + into * 0.9), h ? g.Y(o.y1 + into * 0.9) : g.Y(al), r0 * 0.75);
        }
        if (res && r.type === 'laundry') s += sym('receptacle240', g.X(r.x + r.w - 1.5), g.Y(r.y + r.d) + r0 * 1.2, r0 * 0.9) + T(g.X(r.x + r.w - 1.5), g.Y(r.y + r.d) + r0 * 3.4, 'DRYER 30A', 5.2);
        if (res && r.type === 'kitchen' && !gasService(d)) s += sym('receptacle240', g.X(r.x + r.w / 2), g.Y(r.y) - r0 * 1.2, r0 * 0.9) + T(g.X(r.x + r.w / 2), g.Y(r.y) - r0 * 3, 'RANGE 50A', 5.2);
      }
      for (const a of AL.filter(q => q.floor === f)) s += sym(a.kind, g.X(a.x), g.Y(a.y), r0 * 1.05);
      // exits (commercial): exit sign and an emergency light at every exit door; exterior lights and receptacles
      for (const o of doors.filter(q => q.exterior)) {
        const into = doorInto(d, o), mx = (o.x1 + o.x2) / 2, my = (o.y1 + o.y2) / 2, ix = o.orient === 'v' ? into : 0, iy = o.orient === 'h' ? into : 0;
        if (!res && o.kind !== 'overhead') s += sym('exitsign', g.X(mx + ix * 1.6), g.Y(my + iy * 1.6), r0 * 1.1) + sym('emergency', g.X(mx + ix * 1.6 + (iy ? 4 : 0)), g.Y(my + iy * 1.6 + (ix ? 4 : 0)), r0 * 0.9);
        s += sym('wallpack', g.X(mx - ix * 1 + (iy ? o.width / 2 + 1 : 0)), g.Y(my - iy * 1 + (ix ? o.width / 2 + 1 : 0)), r0 * 0.9);
        if (res && o.kind !== 'overhead') s += sym('gfci', g.X(mx - ix * 1.4 - (iy ? o.width / 2 + 1.5 : 0)), g.Y(my - iy * 1.4 - (ix ? o.width / 2 + 1.5 : 0)), r0 * 0.9);
      }
      if (f === 1) for (const p of panels) {
        const [ox, oy] = outward(p.side, -0.6), m = p.meter, [mx, my] = outward(m.side, 1.8), px = g.X(p.x + ox), py = g.Y(p.y + oy), hz = p.side === 'back' || p.side === 'front';
        s += '<g transform="rotate(' + (hz ? 90 : 0) + ' ' + n(px) + ' ' + n(py) + ')">' + sym('panel', px, py, r0 * 1.2) + '</g>' + tag(px, py + (p.side === 'front' ? -8 : 12) * (hz ? 1 : 0) + (hz ? 0 : -r0 * 1.4), 'PANEL ' + p.name, 6.2) +
          line(px, py, g.X(m.x + mx), g.Y(m.y + my), 'stroke="' + INK + '" stroke-width=".6" stroke-dasharray="3 2"') + sym('meter', g.X(m.x + mx), g.Y(m.y + my), r0 * 1.1) + (p === panels[0] ? T(g.X(m.x + mx * 2.2) + (my ? 10 : 0), g.Y(m.y + my * 2.2) + 3, res ? 'METER' : 'METER (TYP.)', 5.6, { b: true, a: my ? 'start' : 'middle' }) : '');
      }
      return s;
    };
    const P = panelSchedule(t, d), L = loadCalc(t, d), counts = { rec: 0, light: 0 };
    for (const r of d.rooms) { counts.rec += receptacles(r, { res, doors: d.doors.filter(o => o.floor === r.floor), W, attached: d.attached }).length; counts.light += lights(r, res).length; }
    return { views: floorViews(d, 'Power & lighting plan'), overlay, sideHtml: head(t) + BOD('Device locations and circuits') + legend(['receptacle', 'gfci', 'receptacle240', 'switch', res ? 'light' : 'fixture2x4', res ? 'recessed' : 'light', ...(res ? ['smoke', 'co'] : ['exitsign', 'emergency']), 'panel', 'meter', 'wallpack']) +
      tbl('Service — Type ' + t.id, ['Item', 'Value'], [['Service', L.service + ' A, ' + L.volts], ['Calculated load', f0(L.total) + ' VA (' + f0(L.amps) + ' A)'], ['Panels', P.map(p => p.name + ' ' + p.amps + ' A').slice(0, 10).join(', ') + (P.length > 10 ? '…' : '')], ['Devices', counts.rec + ' receptacles, ' + counts.light + ' light fixtures' + (res ? ', ' + AL.length + ' smoke / CO alarms' : '')]]) +
      sideNotes('Electrical notes', res ? ['Receptacles so no point along a wall is more than 6 ft from one (NEC 210.52); GFCI in baths, kitchen, garage, laundry and outdoors; tamper-resistant throughout.', 'AFCI on the 120 V circuits in living spaces (NEC 210.12); lighting and receptacle circuits per E-001.', 'Smoke alarms in each bedroom, outside sleeping areas and on every floor (IRC R314); CO alarms outside sleeping areas (IRC R315); hard-wired and interconnected.', 'Switches at the room’s door; recessed LED in kitchen and living areas, a ceiling fixture elsewhere.', 'Panel ' + panels[0].name + ' in the ' + panels[0].room.name.toLowerCase() + '; meter outside on the ' + panels[0].meter.side + ' wall (confirm with the utility).']
        : ['Receptacles about every 20 ft of wall and per room; GFCI in restrooms, kitchens and wet areas.', 'Lighting: 2x4 LED troffers on about an 8 × 10 ft grid' + (d.rooms.some(r => r.type === 'warehouse') ? ', high-bay LED on about a 25 ft grid in the warehouse' : '') + '; occupancy and daylight controls per IECC.', 'Exit signs and emergency lights at every exit (IBC 1008 / 1013), 90-minute battery.', ten.length ? 'One meter and panel a tenant on the back wall; a house panel for the fire alarm and common loads.' : 'Service and panel in the ' + panels[0].room.name.toLowerCase() + '; meter / CT cabinet outside.', 'Rooftop units, exhaust fans and kitchen equipment on dedicated circuits (E-001).']) };
  });
}

// E-601 one-line diagram
function eOneline(ctx, sh) {
  sh.scale = 'N.T.S.';
  const cells = typeBlocks(typesWith(ctx), t => 'One-line — Type ' + t.id + ' (' + t.label + ')', (t, d) => onelineSVG(t, d, 520));
  return cells + side('<div class="engs">' + CSS + BOD('Service and distribution') + legend(['transformer', 'meter', 'panel', rawLeg('Circuit breaker', path('M14 9 A8 8 0 0 1 30 9', 'fill="none" stroke="' + INK + '" stroke-width="1.2"') + line(2, 9, 14, 9, 'stroke="' + INK + '"') + line(30, 9, 42, 9, 'stroke="' + INK + '"')), rawLeg('Grounding electrode', line(22, 1, 22, 8, 'stroke="' + INK + '"') + line(14, 8, 30, 8, 'stroke="' + INK + '"') + line(17, 11, 27, 11, 'stroke="' + INK + '"') + line(20, 14, 24, 14, 'stroke="' + INK + '"'))]) +
    notes('One-line notes', ['Utility transformer, primary and secondary service by the serving utility (confirm location, size and available fault current).', 'Feeder sizes shown are copper THWN-2 at 75°C for the overcurrent device — VERIFY BY EOR (voltage drop, ambient, conduit fill, parallel sets).', 'Homes: 120/240 V single-phase, one meter and a main-breaker panel each. Commercial: 3-phase 4-wire, a meter and panel per tenant on multi-tenant buildings, plus a house panel.', 'Service equipment rated for the available fault current; surge protection at the service (NEC 230.67 for dwellings).', 'Grounding: concrete-encased electrode plus ground rods, bonded to water and gas piping (NEC 250).', ...disc(ctx, 'electrical').notes.slice(0, 2)]) + '</div>');
}
function onelineSVG(t, d, wpx) {
  const res = isRes(d.use), L = loadCalc(t, d), P = panelSchedule(t, d), ink = 'stroke="' + INK + '" stroke-width="1.4"', thin = 'stroke="' + INK + '" stroke-width="1"';
  const bk = (x, y) => path('M' + n(x - 7) + ' ' + n(y) + ' A7 7 0 0 1 ' + n(x + 7) + ' ' + n(y), 'fill="none" stroke="' + INK + '" stroke-width="1.2"') + circle(x - 7, y, 1.5, 'fill="' + INK + '"') + circle(x + 7, y, 1.5, 'fill="' + INK + '"');
  const vbk = (x, y) => path('M' + n(x) + ' ' + n(y - 7) + ' A7 7 0 0 1 ' + n(x) + ' ' + n(y + 7), 'fill="none" stroke="' + INK + '" stroke-width="1.2"');
  const gnd = (x, y) => line(x, y, x, y + 8, thin) + line(x - 8, y + 8, x + 8, y + 8, thin) + line(x - 5, y + 11, x + 5, y + 11, thin) + line(x - 2, y + 14, x + 2, y + 14, thin);
  const xm = Math.min(90, wpx * 0.22);
  let s = sym('transformer', xm, 22, 14) + T(xm + 20, 18, 'UTILITY TRANSFORMER (BY UTILITY)', 6.5, { a: 'start' }) + T(xm + 20, 27, res ? (t.attached ? 'SHARED, ' : 'SHARED BY SEVERAL HOMES, ') + '120/240 V 1Φ' : L.volts, 6, { a: 'start' });
  s += line(xm, 32, xm, 60, ink) + T(xm + 6, 50, wireFor(L.service) + ' (VERIFY BY EOR)', 5.6, { a: 'start' });
  const multi = P.length > 1, attachedPack = res && t.attached;
  if (res || !multi) {
    s += sym('meter', xm, 70, 10) + T(xm + 14, 73, attachedPack ? t.unitsPer + '-GANG METER PACK (ONE A UNIT)' : res ? 'METER BASE ' + L.service + ' A' : 'CT CABINET + METER', 6.2, { a: 'start' });
    s += line(xm, 80, xm, 104, ink) + vbk(xm, 96) + T(xm + 10, 98, 'MAIN ' + L.service + ' A' + (res ? '/2P' : '/3P'), 6.2, { a: 'start', b: true }) + gnd(xm - 26, 104) + line(xm, 104, xm - 26, 104, thin);
    const p = P[0], y0 = 112, rowsMax = 34, cs = p.circuits.filter(c => c.va > 0 || /Spare|EV/.test(c.desc)).slice(0, rowsMax);
    s += rect(xm - 6, y0, 12, Math.max(30, cs.length * 15 + 8), 'fill="' + INK + '"') + T(xm - 12, y0 + 10, 'PANEL ' + p.name, 7, { a: 'end', b: true }) + T(xm - 12, y0 + 20, p.amps + ' A, ' + p.spaces + ' SP', 5.8, { a: 'end' }) + T(xm - 12, y0 + 29, p.volts.split(',')[0], 5.8, { a: 'end' }) + (attachedPack ? T(xm - 12, y0 + 38, '(TYP. EACH UNIT)', 5.8, { a: 'end' }) : '');
    cs.forEach((c, i) => { const y = y0 + 12 + i * 15; s += line(xm + 6, y, xm + 22, y, thin) + bk(xm + 29, y) + line(xm + 36, y, xm + 52, y, thin) + T(xm + 56, y + 2.5, (c.qty > 1 ? c.qty + ' × ' : '') + c.poles + 'P-' + c.amps + 'A  ' + c.desc, 6, { a: 'start' }); });
    if (p.circuits.length > cs.length) s += T(xm + 56, y0 + 12 + cs.length * 15 + 3, '… see panel schedule, E-001', 6, { a: 'start' });
    return { body: s, w: wpx, h: y0 + 30 + cs.length * 15 };
  }
  // multi-tenant / multi-panel: meter center or switchboard, a meter and panel a tenant, a house panel
  s += rect(xm - 40, 60, 80 + Math.min(wpx - xm - 60, 40), 26, 'fill="#fff" ' + ink) + T(xm, 72, 'MAIN SWITCHBOARD / METER CENTER', 6.2, { b: true }) + T(xm, 81, L.service + ' A, ' + L.volts.split(',')[0], 6);
  s += gnd(xm - 52, 86) + line(xm - 40, 80, xm - 52, 80, thin) + line(xm - 52, 80, xm - 52, 86, thin);
  const list = P.concat([{ name: 'H (house)', amps: 100, volts: '', circuits: [] }]), shown = list.slice(0, Math.max(3, Math.floor((wpx - 40) / 70))), bw = (wpx - 30) / shown.length, yb = 110;
  s += line(16 + bw / 2, yb, 16 + bw * (shown.length - 0.5), yb, 'stroke="' + INK + '" stroke-width="2.4"') + line(xm, 86, xm, yb, ink);
  shown.forEach((p, i) => {
    const x = 16 + bw * (i + 0.5), y = yb;
    s += line(x, y, x, y + 70, ink) + vbk(x, y + 16) + sym('meter', x, y + 36, 8) + T(x, y + 64, wireFor(p.amps), 5.4) + rect(x - 18, y + 72, 36, 20, 'fill="' + INK + '"') + T(x, y + 85, 'PANEL ' + p.name, 6, { halo: false, c: '#fff', b: true }) + T(x, y + 102, p.amps + ' A', 6) + T(x, y + 112, p.name.startsWith('H') ? 'FA, SITE, COMMON' : p.name.startsWith('F') ? 'FLOOR ' + p.name.slice(1) : 'TENANT ' + p.name, 5.6);
  });
  if (list.length > shown.length) s += T(wpx - 10, yb - 6, '+' + (list.length - shown.length) + ' MORE TENANT PANELS (TYP.)', 6, { a: 'end', b: true });
  s += T(16, yb + 135, 'Each tenant: meter, ' + wireFor(P[0].amps) + ' feeder, ' + P[0].amps + ' A ' + P[0].volts.split(',')[0] + ' panel (see E-001 for circuits).', 6.4, { a: 'start' });
  return { body: s, w: wpx, h: yb + 150 };
}

// FP-2xx sprinkler plans
function fpSprinkler(ctx, sh) {
  return typeSheet(ctx, sh, (t, d) => {
    const W = d.W, D = d.D, R = riserOf(d);
    const all = (d.rooms || []).map(r => ({ r, G: sprinklerGrid(r, hazardOf(d.use, r.type)) })), total = sum(all, x => x.G.count), bayOnly = total > 1500;
    const overlay = (v, g) => {
      const f = v.floor, red = 'stroke="' + RED + '" stroke-width=".7"', mainA = 'stroke="' + RED + '" stroke-width="2.4"', cross = 'stroke="' + RED + '" stroke-width="1.5"';
      let s = '', heads = '';
      const conns = [];
      // each room: branch lines across its short way, a cross main through its middle, fed from the riser by mains that stay inside the outline
      for (const { r, G } of all.filter(x => x.r.floor === f)) {
        let xs = G.xs, ys = G.ys; const cut = bayOnly && G.count > 200; if (cut) { xs = xs.slice(0, 4); ys = ys.slice(0, 4); }
        const xm = G.xs[Math.floor(G.xs.length / 2)], ym = G.ys[Math.floor(G.ys.length / 2)];
        if (r.w >= r.d) { for (const x of xs) s += line(g.X(x), g.Y(ys[0]), g.X(x), g.Y(ys[ys.length - 1]), red); s += line(g.X(G.xs[0]), g.Y(ym), g.X(G.xs[G.xs.length - 1]), g.Y(ym), cross); }
        else { for (const y of ys) s += line(g.X(xs[0]), g.Y(y), g.X(xs[xs.length - 1]), g.Y(y), red); s += line(g.X(xm), g.Y(G.ys[0]), g.X(xm), g.Y(G.ys[G.ys.length - 1]), cross); }
        conns.push({ x: xm, y: ym });
        for (const x of xs) for (const y of ys) if (inPoly([x, y], outline(d))) heads += sym('sprinkler', g.X(x), g.Y(y), clamp(g.r * 1.7, 6, 10));
        if (cut) heads += rect(g.X(xs[0] - G.sx / 2), g.Y(ys[ys.length - 1] + G.sy / 2), xs.length * G.sx * g.k, ys.length * G.sy * g.k, 'fill="none" stroke="' + RED + '" stroke-width=".8" stroke-dasharray="4 3"') + T(g.X(xs[xs.length - 1] + G.sx), g.Y(ys[ys.length - 1]), 'TYPICAL BAY: ' + G.count + ' HEADS ON THIS GRID THROUGHOUT', 6.5, { a: 'start', b: true, c: RED });
      }
      // the hazard and head spacing, once a hazard a floor, in its largest room
      const byHz = new Map(); for (const x of all.filter(q => q.r.floor === f)) if (!byHz.has(x.G.hz) || area(x.r) > area(byHz.get(x.G.hz).r)) byHz.set(x.G.hz, x);
      for (const { r, G } of byHz.values()) if (r.w * g.k > 120) heads += T(g.X(cx(r)), g.Y(cy(r)) + 12, HAZARDS[G.hz].label.toUpperCase() + '\nHEADS ' + ftInS(G.sx) + ' × ' + ftInS(G.sy) + ' (' + f0(G.sx * G.sy) + ' SF / HEAD) TYP.', g.fs + 1, { b: true, c: RED });
      s += segs(treeRuns(d, { x: R.x, y: R.y }, conns), g, mainA);
      const right = R.x > W / 2, an = right ? 'end' : 'start', dx = right ? -12 : 12;
      if (f === 1) {
        const w = R.wall, [ox, oy] = outward(w.side, g.out(3)), [lx, ly] = outward(w.side, g.out(9)), along = w.side === 'front' || w.side === 'back' ? [3, 0] : [0, 3], fd = { x: w.x + ox + along[0], y: w.y + oy + along[1] };
        s += line(g.X(R.x), g.Y(R.y), g.X(w.x), g.Y(w.y), lineAttr('fireline')) + line(g.X(w.x), g.Y(w.y), g.X(w.x + lx), g.Y(w.y + ly), lineAttr('fireline')) + sym('fdc', g.X(fd.x), g.Y(fd.y), 9) + line(g.X(fd.x), g.Y(fd.y), g.X(w.x + along[0]), g.Y(w.y + along[1]), 'stroke="' + RED + '" stroke-width="1"') + line(g.X(w.x + along[0]), g.Y(w.y + along[1]), g.X(R.x), g.Y(R.y), 'stroke="' + RED + '" stroke-width="1"');
        s += sym('riser', g.X(R.x), g.Y(R.y), 9) + T(g.X(R.x) + dx, g.Y(R.y) + (w.side === 'back' ? 18 : -10), 'RISER: ALARM CHECK VALVE, FLOW + TAMPER SWITCHES', 6.2, { a: an, b: true, c: RED }) + T(g.X(w.x + lx) + dx / 2, g.Y(w.y + ly) + 3, (d.use === 'industrial' ? '8"' : '6"') + ' FIRE LINE FROM SITE (DCDA)', 6, { a: an, c: RED }) + T(g.X(fd.x) + dx * 1.2, g.Y(fd.y) + 3, 'FDC', 6.5, { a: an, b: true, c: RED });
      } else s += sym('riser', g.X(R.x), g.Y(R.y), 7) + T(g.X(R.x) + dx, g.Y(R.y) - 8, 'RISER / FLOOR CONTROL VALVE', 6, { a: an, b: true, c: RED });
      return s + heads;
    };
    const hz = [...new Set(all.map(x => x.G.hz))].map(h => [HAZARDS[h].label, f0(HAZARDS[h].area) + ' sf / ' + HAZARDS[h].s + ' ft', HAZARDS[h].density, HAZARDS[h].head]);
    return { views: floorViews(d, 'Fire sprinkler plan'), overlay, sideHtml: head(t, t.sprinklerWhy) + BOD('Head layout and hazard classification') + legend(['sprinkler', 'riser', 'fdc', 'line:fireline', rawLeg('Cross main / feed main', line(2, 7, 42, 7, 'stroke="' + RED + '" stroke-width="2.4"')), rawLeg('Branch line', line(2, 7, 42, 7, 'stroke="' + RED + '" stroke-width=".7"'))]) +
      tbl('Hazard classification (NFPA 13)', ['Hazard', 'Max. per head', 'Design density', 'Heads'], hz) + '<div class="sm">' + f0(total) + ' heads by rule on ' + plural(d.floors, 'floor') + ', ' + f0(footArea(d) * d.floors) + ' sf of floor' + (d.shape && d.shape !== 'rectangle' ? ' (' + d.shape + ')' : '') + (bayOnly ? '; large rooms show a typical bay' : '') + '.</div>' +
      sideNotes('Sprinkler notes', ['NFPA 13 automatic wet-pipe system throughout' + (d.use === 'industrial' ? '; ESFR in the warehouse for rack storage — commodity class and storage height to confirm with the owner' : '') + '.', 'Hydraulic calculations by a licensed fire protection contractor (Texas RME-G) from a current flow test; NFPA 13 and the IFC / IBC as adopted.', 'Heads on the hazard’s grid: light hazard 225 sf / 15 ft; ordinary 130 sf / 15 ft; ESFR 100 sf / 12 ft.', 'Riser with alarm check valve, flow and tamper switches monitored by the fire alarm; FDC within 100 ft of a hydrant (confirm with the fire marshal, FP-101).', 'Double check detector assembly (DCDA) on the fire line; underground per NFPA 24.']) };
  });
}

// FA-2xx fire alarm plans
function faPlan(ctx, sh) {
  return typeSheet(ctx, sh, (t, d) => {
    const ent = mainEntry(d), H = hvacLayout(t, d), R = d.systems?.sprinklered !== false && t.sprinklered ? riserOf(d) : null, W = d.W, D = d.D;
    const entRoom = ent && d.rooms.find(r => r.id === ent.a), fp0 = ent ? (ent.orient === 'h' ? { x: Math.max(ent.x1, ent.x2) + 3, y: ent.y1 + doorInto(d, ent) * 1.2 } : { x: ent.x1 + doorInto(d, ent) * 1.2, y: Math.max(ent.y1, ent.y2) + 3 }) : { x: 2, y: 2 }, fpos = entRoom ? { x: clamp(fp0.x, entRoom.x + 1, entRoom.x + entRoom.w - 1), y: clamp(fp0.y, entRoom.y + 1, entRoom.y + entRoom.d - 1) } : fp0;
    const overlay = (v, g) => {
      const f = v.floor, fr = roomsOn(d, f), r0 = g.r; let s = '';
      for (const r of fr) for (const p of hornStrobes(r)) s += sym('hornstrobe', g.X(p.x), g.Y(p.y), r0 * 1.05);
      // pull stations inside every exit door; upper floors at the stair doors
      const exits = f === 1 ? (d.doors || []).filter(o => o.floor === 1 && o.exterior && o.kind !== 'overhead') : (d.doors || []).filter(o => o.floor === f && fr.some(r => r.type === 'stair' && (r.id === o.a || r.id === o.b)));
      for (const o of exits) { const into = doorInto(d, o), mx = Math.max(o.x1, o.x2), my = Math.max(o.y1, o.y2); s += o.orient === 'h' ? sym('pull', g.X(mx + 1), g.Y(o.y1 + into * 0.9), r0 * 0.9) : sym('pull', g.X(o.x1 + into * 0.9), g.Y(my + 1), r0 * 0.9); }
      if (f === 1) {
        s += sym('facp', g.X(fpos.x), g.Y(fpos.y), Math.max(r0 * 1.5, 8)) + tag(g.X(fpos.x), g.Y(fpos.y) - Math.max(r0 * 1.5, 8) - 3, 'FACP (MAIN ENTRY)', 6.2) + sym('smoke', g.X(fpos.x + 3), g.Y(fpos.y + 2.5), r0);
        if (R) s += sym('riser', g.X(R.x), g.Y(R.y), 8) + T(g.X(R.x) + (R.x > W / 2 ? -10 : 10), g.Y(R.y) + 3, 'FS / TS', 6.2, { a: R.x > W / 2 ? 'end' : 'start', b: true, c: RED });
      }
      for (const sy of H.systems.filter(q => q.kind === 'rtu' && q.floors.includes(f) && q.cfm > 2000)) s += T(g.X(sy.unit.x), g.Y(sy.unit.y) + 3, 'DD', 6, { b: true }) + circle(g.X(sy.unit.x), g.Y(sy.unit.y), 6, 'fill="none" stroke="' + INK + '" stroke-width=".8"');
      return s;
    };
    const devs = { hs: sum(d.rooms, r => hornStrobes(r).length), pull: (d.doors || []).filter(o => o.exterior && o.kind !== 'overhead').length, dd: H.systems.filter(q => q.kind === 'rtu' && q.cfm > 2000).length };
    return { views: floorViews(d, 'Fire alarm plan'), overlay, sideHtml: head(t) + BOD('Fire alarm device layout') + legend(['facp', 'pull', 'hornstrobe', 'smoke', 'riser', rawLeg('Duct smoke detector at RTU', circle(22, 7, 6, 'fill="none" stroke="' + INK + '" stroke-width=".8"') + T(22, 9.5, 'DD', 5.5, { halo: false }))]) +
      tbl('Devices — Type ' + t.id, ['Device', 'Qty'], [['Fire alarm control panel', '1'], ['Manual pull stations', String(devs.pull)], ['Horn / strobes', String(devs.hs)], ['Duct smoke detectors (RTU > 2,000 cfm)', String(devs.dd)], ['Sprinkler flow / tamper switches', R ? '1 / 1' : '—']], [1]) +
      sideNotes('Fire alarm notes', ['Addressable fire alarm system per NFPA 72 and IBC 907 / IFC 907 as adopted; design and permit by a licensed fire alarm contractor (Texas SFM).', 'FACP at the main entry with the annunciator where the fire department arrives; remote monitoring by a listed central station.', 'Manual pull stations within 5 ft of each exit door' + (d.floors > 1 ? ' and at each stair door on upper floors' : '') + ' (IBC 907.4.2); where the building is sprinklered the AHJ may waive all but one.', 'Horn / strobes so every room of size has visible coverage: about one per 2,500 sf of open area plus each restroom; candela by NFPA 72 tables.', 'Smoke detector at the FACP; duct detectors at air handlers over 2,000 cfm (IMC 606); sprinkler flow and tamper switches monitored.']) };
  });
}

// T-2xx structured cabling plans
function tBldg(ctx, sh) {
  return typeSheet(ctx, sh, (t, d) => {
    const res = isRes(d.use), SME = smeOf(d), W = d.W, D = d.D;
    const overlay = (v, g) => {
      const f = v.floor, fr = roomsOn(d, f), r0 = g.r, cab = 'stroke="' + PURPLE + '" stroke-width=".8" stroke-dasharray="3 2"';
      const pts = [];
      for (const r of fr) { const cnt = dataOutlets(r, res); if (!cnt) continue; const per = 2 * (r.w + r.d); if (cnt <= per / 8) { for (let i = 0; i < cnt; i++) { const u = (i + 0.5) / cnt * per, p = u < r.w ? { x: r.x + u, y: r.y + r.d, s: 'back' } : u < r.w + r.d ? { x: r.x + r.w, y: r.y + r.d - (u - r.w), s: 'right' } : u < 2 * r.w + r.d ? { x: r.x + r.w - (u - r.w - r.d), y: r.y, s: 'front' } : { x: r.x, y: r.y + (u - 2 * r.w - r.d), s: 'left' }; const [ix, iy] = outward(p.s, -(r0 * 1.1) / g.k); pts.push({ x: p.x + ix, y: p.y + iy }); } } else pts.push(...spread(r, cnt)); }
      const waps = fr.length ? spread({ x: 0, y: 0, w: W, d: D }, wapCount(sum(fr, area), res)).map(p => { const r = fr.find(q => p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.d); return r && !SMALL.includes(r.type) ? p : r ? { x: cx(central(fr, W, D)), y: cy(central(fr, W, D)) } : p; }) : [];
      const src = f === SME.room.floor ? SME : { x: SME.x, y: SME.y };
      let s = segs(treeRuns(d, src, pts.concat(waps)), g, cab);
      for (const p of pts) s += sym('data', g.X(p.x), g.Y(p.y), r0);
      for (const p of waps) s += sym('wap', g.X(p.x), g.Y(p.y), r0 * 1.15);
      if (f === SME.room.floor) {
        const e = SME.entry, [ox, oy] = outward(e.side, g.out(6)), hx = e.x + ox, hy = e.y + oy;
        const [ix, iy] = outward(e.side, -0.6); s += line(g.X(hx), g.Y(hy), g.X(e.x + ix), g.Y(e.y + iy), lineAttr('fiber')) + segs(treeRuns(d, { x: e.x + ix, y: e.y + iy }, [{ x: SME.x, y: SME.y }]), g, lineAttr('fiber')) + sym('handhole', g.X(hx), g.Y(hy), 9) + T(g.X(hx), g.Y(hy) + (oy > 0 ? -14 : 16), 'FIBER DROP FROM PROVIDER HANDHOLE (SEE T-101)', 5.8);
        s += sym('ont', g.X(SME.x), g.Y(SME.y), Math.max(r0 * 1.4, 8)) + tag(g.X(SME.x), g.Y(SME.y) - Math.max(r0 * 1.4, 8) - 3, res ? 'SME: ONT + ROUTER' : 'MPOE / TELECOM BACKBOARD', 6.2);
      } else s += rect(g.X(SME.x) - 4, g.Y(SME.y) - 4, 8, 8, 'fill="#fff" stroke="' + PURPLE + '"') + tag(g.X(SME.x), g.Y(SME.y) - 7, 'CABLE PATH TO ' + (res ? 'SME' : 'MPOE'), 5.8);
      return s;
    };
    const outs = sum(d.rooms, r => dataOutlets(r, res)), waps = sum(Array.from({ length: d.floors }, (_, i) => wapCount(sum(roomsOn(d, i + 1), area), res)));
    return { views: floorViews(d, 'Structured cabling plan'), overlay, sideHtml: head(t) + BOD('Outlet, access point and pathway layout') + legend(['data', 'wap', 'ont', 'handhole', 'line:fiber', rawLeg('Cat 6 home run / cable path', line(2, 7, 42, 7, 'stroke="' + PURPLE + '" stroke-width=".8" stroke-dasharray="3 2"'))]) +
      tbl('Cabling — Type ' + t.id, ['Item', 'Qty'], [['Data outlets (Cat 6, 2 jacks)', String(outs)], ['Wireless access points', String(waps)], [res ? 'Structured media enclosure' : 'Telecom backboard (MPOE)', '1 in the ' + SME.room.name.toLowerCase()]], [1]) +
      sideNotes('Telecom notes', [res ? 'Structured media enclosure (SME) with the ONT and router; a Cat 6 home run to every outlet and access point (TIA-570-D).' : 'MPOE backboard with the provider’s ONT / demarc; Cat 6 to every outlet, J-hooks above the ceiling at 4–5 ft (TIA-569-E).', 'Outlets: ' + (res ? 'living and family 2, bedrooms 1 (primary 2), office 2, kitchen 1.' : 'one per ~100 sf of office, four or more a tenant space, a few in a warehouse.'), 'Wireless access points: about one per ' + (res ? '1,500' : '2,500') + ' sf of floor, ceiling-mounted, PoE from the router / switch.', 'Fiber drop in 1" conduit from the provider handhole to the ' + (res ? 'SME' : 'MPOE') + '; ONT power on a UPS.', 'Bond the telecom ground bar to the electrical service ground (TIA-607-D).']) };
  });
}

export const RENDERERS = {
  's-notes': sNotesBody, 's-found': sFound, 's-frame': sFrame, 's-details': sDetails,
  'm-notes': mNotesBody, 'm-hvac': mHvac,
  'p-notes': pNotesBody, 'p-plan': pPlan, 'p-riser': pRiser,
  'e-notes': eNotesBody, 'e-plan': ePlan, 'e-oneline': eOneline,
  'fp-sprinkler': fpSprinkler, 'fa-plan': faPlan,
  't-notes': tNotesBody, 't-bldg': tBldg
};
