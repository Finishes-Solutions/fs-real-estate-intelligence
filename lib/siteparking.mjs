// Parking fields for shops, restaurants, offices, medical offices, hotels, churches and other commercial uses, laid out
// the way a civil engineer sketches one (lib/sitelayout.mjs hands these programs here; housing, storage, warehouses, gas
// stations and food truck parks keep their own engines).
//
// The plan is a stack of bands across the lot, from the street back, in a frame turned so the drive aisles run along x
// (the lot's own frame from lib/sitelayout.mjs frameOf: "across" has the street at the bottom, "deep" has it on the left):
//  - F: a parking field of whole modules: double-loaded bays (stall row + aisle + stall row) on the plan's stall width,
//    stall depth and aisle. Every aisle in a field runs between the same two drives, so its rows are straight and line up.
//  - B: a row of buildings, its storefront walk against the field it faces (down, up, or both ways for offices).
//  - S: a rear service and loading drive behind a row of shops (or shared by two rows back to back).
// Two collector drives (26 ft, fire lanes) run up both sides of the stack and join every aisle and service drive at its
// ends, so no aisle dead-ends and every wall of every building is within 150 ft of a fire lane. The main entry comes in
// from the street and runs straight, with no stall beside it, for the stacking distance (50 ft on a small site, 75 or
// 100 ft on a bigger one) before it meets the first aisle square on. Rows are whole stalls, six or more; land a row can't
// use is landscape. Islands: a planted end at each row end and one every thirteenth stall. Detention is one pond on the
// land behind, in front of or beside the stack, sized from the plan's own storm rules (lib/siteplan.mjs stormNeed).
//
// Sizes: a program with a floor area gets that floor area when it fits (a second floor for an office or a medical office
// when the program doesn't fix the floors, before building less); "as much as fits" grows the buildings (depth, length,
// more rows) until the parking at the use's ratio, the setbacks and side drives, the detention land or a coverage / FAR
// limit binds, and says which did. Parking is trimmed back to the need (a twentieth over and two to spare).
//
// The brief: opts.brief (normalizeBrief below) says what an AI (or anyone) wants built; the engine lays out just that
// when it fits and otherwise the nearest layout that does, with a note on what changed and why.
import * as S from './siteplan.mjs';
import * as PD from './sitepad.mjs';

const rot = S.rotPt, f0 = v => Math.round(v).toLocaleString('en-US');
const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const rectL = (x0, y0, x1, y1) => ({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, d: y1 - y0 });
export const FIELD_USES = ['retail', 'restaurant', 'office', 'medical', 'hotel', 'church', 'other'];

// ---------- the brief ----------
// opts.brief = {
//   buildings: [{ use, gfa?, floors?, w?, d?, at: 'front'|'back'|'middle'|'corner'|'left'|'right', facing: 'street'|'parking' }],
//   parking: 'front'|'wrap'|'sides'|'back',  // where the parking goes: in front of the buildings, round their front and
//                                            // sides, beside them (rows running back from the street), or behind them
//                                            // (the buildings at the street)
//   pond: 'back'|'front'|'side'|'none',      // the detention pond's spot ('none': no pond; underground, and it says so)
//   serviceDrive: true|false,                // a rear service and loading drive behind the buildings
//   pads: n                                  // pad sites along the street (a restaurant or coffee with its drive-thru)
// }
// Every key is optional. buildings[].use is one of FIELD_USES (default: the program's use); gfa in sq ft; w and d in feet
// (w along the row, d its depth); at: 'back' (the default when parked in front), 'front' (at the street), 'middle'
// (between fields), 'left' / 'right' / 'corner' (along the row; corner: toward a side street); facing: which way its
// storefront looks. The buildings asked for are the program (their floor area and parking). What can't be done as asked
// is done the nearest way that fits, and each option's notes say what changed.
export const BRIEF_SHAPE = Object.freeze({
  buildings: [{ use: FIELD_USES.join('|'), gfa: 'sq ft', floors: 'n', w: 'ft', d: 'ft', at: 'front|back|middle|corner|left|right', facing: 'street|parking', form: 'bar|L|U|tower' }],
  parking: 'front|wrap|sides|back', pond: 'back|front|side|none', serviceDrive: 'true|false', pads: '0-4'
});
const AT = ['front', 'back', 'middle', 'corner', 'left', 'right'], BRIEF_FORMS = ['bar', 'L', 'U', 'tower'];
export function normalizeBrief(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  const one = (v, list) => list.includes(v) ? v : null, num = (v, lo, hi) => v == null || v === '' || !Number.isFinite(+v) || +v < lo ? null : Math.min(hi, +v);
  const buildings = (Array.isArray(b.buildings) ? b.buildings : []).slice(0, 12).filter(x => x && typeof x === 'object').map(x => ({
    use: FIELD_USES.includes(x.use) ? x.use : null, gfa: num(x.gfa, 500, 2e6), floors: num(x.floors, 1, 40) == null ? null : Math.round(num(x.floors, 1, 40)),
    w: num(x.w, 20, 2000), d: num(x.d, 20, 600), at: one(x.at, AT), facing: one(x.facing, ['street', 'parking']), ...(one(x.form, BRIEF_FORMS) ? { form: x.form } : {}) })); // (form: its shape, "L"; the layout draws it through params.form)
  const out = { buildings, parking: one(b.parking, ['front', 'wrap', 'sides', 'back']), pond: one(b.pond, ['back', 'front', 'side', 'none']), serviceDrive: typeof b.serviceDrive === 'boolean' ? b.serviceDrive : null, pads: num(b.pads, 0, 4) == null ? null : Math.round(num(b.pads, 0, 4)) };
  return out.buildings.length || out.parking || out.pond || out.serviceDrive != null || out.pads != null ? out : null;
}

// the program a brief's buildings make: their use (when the program's isn't one of these), how many, their floors and,
// when every one is sized, their floor area added up
export function briefProgram(programIn, briefIn) {
  const brief = normalizeBrief(briefIn), p = { ...(programIn && typeof programIn === 'object' ? programIn : {}) }; if (!brief?.buildings?.length) return p;
  const B = brief.buildings; if (!FIELD_USES.includes(p.use)) { const u = B.find(b => b.use)?.use; if (u) p.use = u; }
  p.buildings = B.length; const fl = [...new Set(B.map(b => b.floors))]; if (fl.length === 1 && fl[0]) p.floors = fl[0];
  const fl0 = +p.floors || S.USES[p.use]?.floors || 1;
  if (B.every(b => b.gfa || b.w && b.d)) { p.gfa = Math.round(B.reduce((t, b) => t + (b.gfa || b.w * b.d * (b.floors || fl0)), 0)); p.max = false; }
  return p;
}
// the brief's buildings by row: at the street ('front'), between fields ('middle'), at the back; where each sits along
// its row; which way the street row faces (both ways, unless every one faces the parking). Deep (rows running back
// from the street, parking at the sides): one row, parking both sides.
function briefRows(brief, C) {
  if (!brief) return null; const list = brief.buildings?.length ? brief.buildings : brief.parking === 'back' || brief.parking === 'sides' ? [{}] : null; if (!list) return null;
  const rows = { front: [], middle: [], back: [] };
  for (const [i, b] of list.entries()) {
    const row = C.deep ? 'back' : b.at === 'front' || brief.parking === 'back' && b.at !== 'back' && b.at !== 'middle' ? 'front' : b.at === 'middle' ? 'middle' : 'back';
    rows[row].push({ ...b, i, pos: b.at === 'left' || b.at === 'right' ? b.at : b.at === 'corner' ? C.cornerSide || 'left' : null });
  }
  rows.frontFace = rows.front.length && rows.front.every(b => b.facing === 'parking') ? 'up' : 'both';
  return rows;
}

// ---------- what each use lays out as ----------
// depths tried (ft), whether a row of them gets a rear service drive, the gap between buildings in a row, the shortest
// and longest building (one: a single building asked for), and whether a row may face parking both ways (offices and
// the like have doors on both long sides)
const RULES = {
  retail: { depths: [70, 85, 100, 115, 130, 150, 170], service: true, gap: 24, min: 50, max: Infinity, both: false },
  restaurant: { depths: [60, 70, 80], service: true, gap: 50, min: 40, max: 90, one: 200, both: false },
  office: { depths: [65, 80, 95, 110, 125, 140], service: false, gap: 40, min: 60, max: 360, both: true },
  medical: { depths: [70, 85, 100, 110, 125], service: false, gap: 40, min: 60, max: 320, both: true },
  hotel: { depths: [60, 66, 72], service: false, gap: 40, min: 120, max: 330, both: true },
  church: { depths: [80, 100, 120, 140], service: false, gap: 40, min: 60, max: 300, both: true },
  other: { depths: [70, 90, 110, 130], service: false, gap: 30, min: 50, max: 400, both: true }
};
export const inScope = (prog, opts = {}) => FIELD_USES.includes(prog.use) && !prog.zones && !prog.custom && !opts.oldEngine;
// the stacking distance in from the street before the first aisle: 50 ft on a small site, 75 ft from about 120 spaces,
// 100 ft from about 400
export const throatFor = need => need > 400 ? 100 : need > 120 ? 75 : 50;
const FIRE = 150; // ft: every point of a building's walls within this of a fire lane (a drive 24 ft or wider)

// the module sizes for a plan's parameters
function dimsOf(H) {
  const { SW, ROW, AISLE, PAR } = H.par();
  return { sw: SW, sd: ROW, aw: AISLE, cw: 26, walk: 15, gs: 14, gr: 12, M: 2 * ROW + AISLE, ew: 30, Rc: 25, caps: PAR.style?.islands === 'square' ? 'square' : true, PAR };
}

// ---------- a frame and what's in it ----------
// the street line in the frame: the y of the front edge at an x (across), or its x at a y (deep)
function streetOf(F) {
  const n = F.rr.length, fr = F.rr.map((a, k) => F.rules[k].role === 'front' ? [a, F.rr[(k + 1) % n]] : null).filter(Boolean);
  const at = (v, deep) => { let best = null; for (const [a, b] of fr) { const ax = deep ? 1 : 0, ay = 1 - ax, lo = Math.min(a[ax], b[ax]), hi = Math.max(a[ax], b[ax]); if (v < lo - 0.5 || v > hi + 0.5 || Math.abs(b[ax] - a[ax]) < 1e-6) continue; const t = Math.max(0, Math.min(1, (v - a[ax]) / (b[ax] - a[ax]))), w = a[ay] + (b[ay] - a[ay]) * t; if (best == null || w > best) best = w; } return best; };
  const pts = fr.flat(), range = deep => { const ax = deep ? 1 : 0, v = pts.map(p => p[ax]); return [Math.min(...v), Math.max(...v)]; };
  return { fronts: fr, at, range };
}
// the interval of a list holding x, else the widest
const covers2 = (iv, a, b) => iv.some(([p, q]) => p <= a + 0.01 && q >= b - 0.01);
const pickIv = (iv, x) => { if (!iv.length) return null; if (x != null) { const h = iv.find(([a, b]) => a <= x && b >= x); if (h) return h; } return iv.slice().sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0]; };
// a driveway outline that stays in the lot (it may cross the street line) and keeps its side buffers, clear of obstacles
function entryFits(F, poly, ob) {
  const n = F.rr.length, fronts = F.rr.map((a, k) => F.rules[k].role === 'front' || F.rules[k].street ? [a, F.rr[(k + 1) % n]] : null).filter(Boolean), need = F.rules.map(r => r.role === 'front' || r.street ? -1 : r.pave);
  if (!poly.every(p => S.inRing(p, F.rr) || fronts.some(([a, b]) => S.segDist(p, a, b) < 2))) return false;
  if (!F.rr.every((a, k) => need[k] < 0 || poly.every((p, i) => S.segSeg(p, poly[(i + 1) % poly.length], a, F.rr[(k + 1) % n]) >= need[k] - 0.5))) return false;
  return !ob.some(o => S.rectsOverlap({ poly }, { poly: o.p }, 0.5));
}

// ---------- the pond ----------
// a ring clipped to one side of a line: keep the points with s·(v - c) >= 0, v the x (vert) or y of a point
function clipHalf(r, vert, c, s) { const out = [], k = vert ? 0 : 1; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], ia = s * (a[k] - c) >= 0, ib = s * (b[k] - c) >= 0; if (ia) out.push(a); if (ia !== ib) { const t = (c - a[k]) / (b[k] - a[k]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } } return out; }
function pondStrip(C, side, A) {
  const { F } = C, vert = side === 'left' || side === 'right', s = side === 'top' || side === 'right' ? 1 : -1, inner = S.insetRing(F.rr, F.rules.map(r => Math.min(Math.max(0.5, r.pave), 6)));
  const ext = vert ? [F.X0, F.X1] : [F.Y0, F.Y1], area = c => { const q = clipHalf(inner, vert, c, s); return q.length >= 3 ? S.ringArea(q) : 0; };
  if (area(s > 0 ? ext[0] : ext[1]) < A * 1.3) return null;
  let lo = ext[0], hi = ext[1]; // the line: the land beyond it holds the pond
  for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if ((area(m) >= A) === (s > 0)) lo = m; else hi = m; }
  const c = s > 0 ? lo : hi, poly = S.tidyRing(clipHalf(inner, vert, c, s), 0.5); if (poly.length < 3 || S.ringArea(poly) < A * 0.97) return null;
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]), depth = vert ? Math.max(...xs) - Math.min(...xs) : Math.max(...ys) - Math.min(...ys); if (depth < 24) return null;
  return { poly, rect: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], line: c, area: S.ringArea(poly) };
}
// one pond of `A` sq ft on one side of the frame ('top', 'bottom', 'left', 'right'): a clean rectangle in the land at
// that side, as long as it needs, beside the middle of the stack (near). Returns { rect: [x0, y0, x1, y1], line } or null.
// The back or a side of the lot with nothing in the way: the whole strip of land beyond a line, following the lot lines
// (a wedge's point, an odd back corner) and 6 ft in from them, so the land a stack of rows can't use holds the water.
function pondSpot(C, side, A, near) {
  if (side !== (C.deep ? 'left' : 'bottom') && !C.keep.length) { const g = pondStrip(C, side, A); if (g) return g; }
  const { F, H, keep } = C, vert = side === 'left' || side === 'right', ext = vert ? [F.X0, F.X1] : [F.Y0, F.Y1];
  const band = (a, b) => H.spans(F, a, b, 'pave', keep, vert); // (a vertical band's intervals run along y)
  const sg = side === 'top' || side === 'right' ? -1 : 1; // from the lot's far edge in toward the stack
  let far = null; for (let v = sg < 0 ? ext[1] : ext[0], k = 0; k < 600 && far == null; k++, v += sg * 4) { const iv = sg < 0 ? band(v - 4, v) : band(v, v + 4); if (iv.some(([a, b]) => b - a >= 40)) far = v; }
  if (far == null) return null;
  for (let depth = 30; depth <= 700; depth += 4) {
    const c = far + sg * depth; let best = null;
    for (const trim of [0, 12, 30]) { // (a slanted lot line: a little less depth for more width)
      const a = sg > 0 ? far + trim : c, b = sg > 0 ? c : far - trim; if (b - a < 24) continue;
      const iv = pickIv(band(a, b), near); if (!iv) continue; const area = (b - a) * (iv[1] - iv[0]);
      if (!best || area > best.area) best = { a, b, iv, area };
    }
    if (best && best.area >= A) {
      const front = side === 'bottom', room = best.iv[1] - best.iv[0] - (front ? 130 : 0); if (front && A / (best.b - best.a) > room) continue; // (at the street: beside the entry, never across it)
      const h = best.b - best.a, len = Math.min(room, Math.max(A / h, Math.min(h, 60))), mid = front ? best.iv[1] - len / 2 : near != null ? Math.max(best.iv[0] + len / 2, Math.min(best.iv[1] - len / 2, near)) : (best.iv[0] + best.iv[1]) / 2;
      const lo = mid - len / 2, hi = mid + len / 2;
      return { rect: vert ? [best.a, lo, best.b, hi] : [lo, best.a, hi, best.b], line: c, area: len * h };
    }
  }
  return null;
}

// ---------- one layout ----------
// cand: { seq: bands bottom to top ({ t: 'F', k } a field of k bays; { t: 'B', D, face: 'down'|'up'|'both', bl: [{ len, use,
//   floors, props }], fill?, gap } a building row; { t: 'S' } a service drive; { t: 'G', h } a gap), base (y of the stack's
//   bottom), xRef (the stack's middle), W (a width asked for; null: as wide as the lot lets it), at ('center', 'left',
//   'right': where a narrower stack sits), xMin / xMax, pond: { rect } | null }
// Returns the frame-feet pieces and their numbers, or null when it doesn't fit.
function build(C, cand) {
  if (cand.pad) return PD.buildPad(C, cand, { entryFits }); // (a small pad: lib/sitepad.mjs)
  const { F, P, H, deep } = C, keep = cand.pat === 'stand' ? C.keep.filter(o => !C.standIds?.has(o.id)) : C.keep, { sd, aw, cw, walk, sw, M } = P, gr = cand.gr ?? P.gr, gs = cand.gs ?? P.gs;
  const ob = keep.concat(cand.pond ? [{ p: cand.pond.poly || box(...cand.pond.rect), g: 12 }] : []);
  // 1. the bands, bottom to top
  let y = cand.base, padB = null; const aisles = [], service = [], rowsB = [], fields = [];
  for (let i = 0; i < cand.seq.length; i++) {
    const b = cand.seq[i], prev = cand.seq[i - 1], next = cand.seq[i + 1];
    if (b.t === 'F') { const off = b.half ? -sd : 0, f = { y0: y, y1: y + b.k * M + off, aisles: [] }; for (let j = 0; j < b.k; j++) { const a = { y: y + sd + aw / 2 + j * M + off, f, half: b.half && !j }; aisles.push(a); f.aisles.push(a); } fields.push(f); y = f.y1; }
    else if (b.t === 'B') { const lo = b.face === 'up' ? 0 : walk, hi = b.face === 'up' || b.face === 'both' ? walk : 0; rowsB.push({ b, y0: y + lo, y1: y + lo + b.D }); y += lo + b.D + hi; }
    else if (b.t === 'S') { if (prev?.t === 'B') y += gr; service.push({ y0: y, y1: y + cw }); y += cw; if (next?.t === 'B') y += gr; }
    else if (b.t === 'G') y += b.h;
    else if (b.t === 'P') { padB = { y0: y, y1: y + b.h, n: b.n }; y += b.h; }
  }
  if (!aisles.length) return null;
  const drv = [...aisles.map(a => [a.y - aw / 2, a.y + aw / 2]), ...service.map(s => [s.y0, s.y1])], yLo = Math.min(...drv.map(d => d[0])), yHi = Math.max(...drv.map(d => d[1]));
  // 2. the collectors. Each drive line (an aisle with its rows, a service drive) runs as far as the lot lets it at its own
  // height; the collectors join the lines' ends, sloping between the aisles of a field where the lot line slopes, and
  // straight up past a building row as far in as the lines either side and the row allow. As wide as asked, at most.
  const oL = cand.outer === 'both' || cand.outer === 'left', oR = cand.outer === 'both' || cand.outer === 'right'; // a row of stalls along the outside of a collector (between it and the lot line)
  // (cand.col: a collector up one side only, 'left' or 'right'; the aisles' other ends stop clear of their stalls, room to turn)
  const hasL = !cand.nocol && cand.col !== 'right', hasR = !cand.nocol && cand.col !== 'left', sides = [...(hasL ? [-1] : []), ...(hasR ? [1] : [])];
  const inL = hasL ? cw / 2 + (oL ? sd + 1 : 0) : 0, inR = hasR ? cw / 2 + (oR ? sd + 1 : 0) : 0;
  const lines = [...aisles.map(a => ({ y: a.y, h: aw / 2, band: [a.y - aw / 2 - (a.half ? 0 : sd), a.y + aw / 2 + sd], a })), ...service.map(s => ({ y: (s.y0 + s.y1) / 2, h: cw / 2, band: [s.y0, s.y1], s }))].sort((p, q) => p.y - q.y);
  for (const ln of lines) {
    const iv = pickIv(H.spans(F, ln.band[0], ln.band[1], 'pave', ob), cand.xRef); if (!iv) return null;
    ln.l = iv[0] + inL; ln.r = iv[1] - inR;
    if (deep) ln.l = Math.max(ln.l, C.frontX + C.T + cw / 2); // the stacking distance in from the street (on the left)
    if (cand.xMin != null) ln.l = Math.max(ln.l, cand.xMin); if (cand.xMax != null) ln.r = Math.min(ln.r, cand.xMax);
  }
  if (cand.W != null) { const w = cand.W - cw, b0 = lines[0], room = b0.r - b0.l - w; if (room > 0) { const x0 = b0.l + (cand.at === 'left' ? 0 : cand.at === 'right' ? room : Math.max(0, Math.min(room, (cand.xRef ?? (b0.l + b0.r) / 2) - w / 2 - b0.l))); for (const ln of lines) { ln.l = Math.max(ln.l, x0); ln.r = Math.min(ln.r, x0 + w); } } }
  if (cand.straight) { const l = Math.max(...lines.map(q => q.l)), r = Math.min(...lines.map(q => q.r)); for (const ln of lines) { ln.l = l; ln.r = r; } }
  if (lines.some(ln => ln.r - ln.l < cw + 6 * sw + 12)) return null;
  // where the collectors run: between two aisles of a field, sloping from one's end to the other's where the lot line
  // slopes (never steeper than about 50°, and only inside the lot), else straight at the inner of the two (the outer one
  // is cut back to it); past a building row, straight up at the inner of the lines either side and the row, and a line
  // with no field neighbour to slope to on that side is cut back to it too (no stalls past where it's joined)
  const sameF = (p, q) => p && q && p.a && q.a && p.a.f === q.a.f, SLOPE = 1.2;
  const slopeOK = (p, q, side) => { const x0 = side < 0 ? p.l : p.r, x1 = side < 0 ? q.l : q.r, dy = q.y - p.y; if (Math.abs(x1 - x0) < 2) return true; if (Math.abs(x1 - x0) > dy * SLOPE) return false;
    return [0.25, 0.5, 0.75].every(t => { const y = p.y + dy * t, x = x0 + (x1 - x0) * t, hw = cw / 2 * Math.hypot(1, (x1 - x0) / dy); return covers2(H.spans(F, y - 1, y + 1, 'pave', ob), x - hw, x + hw); }); };
  const upX = [];
  for (let it = 0; it < 8; it++) { let moved = false;
    const set = (ln, k, v) => { if (Math.abs(ln[k] - v) > 0.01) { ln[k] = v; moved = true; } };
    for (let i = 0; i + 1 < lines.length; i++) {
      const p = lines[i], q = lines[i + 1];
      if (sameF(p, q)) { for (const side of sides) if (!slopeOK(p, q, side)) { const k = side < 0 ? 'l' : 'r', v = side < 0 ? Math.max(p.l, q.l) : Math.min(p.r, q.r); set(p, k, v); set(q, k, v); } continue; }
      const iv = pickIv(H.spans(F, p.y, q.y, 'pave', ob), cand.xRef); if (!iv) return null;
      const l = Math.max(p.l, q.l, iv[0] + inL), r = Math.min(p.r, q.r, iv[1] - inR); if (r - l < 60) return null; upX[i] = { l, r };
      if (!sameF(lines[i - 1], p)) { set(p, 'l', l); set(p, 'r', r); } if (!sameF(q, lines[i + 2])) { set(q, 'l', l); set(q, 'r', r); }
    }
    if (!moved) break;
  }
  if (lines.some(ln => ln.r - ln.l < cw + 6 * sw + 12)) return null;
  // the collectors' pieces: { y0, y1, x0, x1 (centre line at y0 and y1), side }; a square end where each line meets them
  const segs = [], ups = [];
  for (const ln of lines) for (const side of sides) { const x = side < 0 ? ln.l : ln.r; segs.push({ y0: ln.y - ln.h, y1: ln.y + ln.h, x0: x, x1: x, side, cap: true }); }
  for (let i = 0; i + 1 < lines.length; i++) {
    const p = lines[i], q = lines[i + 1];
    if (sameF(p, q)) { for (const side of sides) segs.push({ y0: p.y, y1: q.y, x0: side < 0 ? p.l : p.r, x1: side < 0 ? q.l : q.r, side }); continue; }
    const { l, r } = upX[i] || { l: Math.max(p.l, q.l), r: Math.min(p.r, q.r) }, up = { y0: p.y, y1: q.y, l, r, lo: p, hi: q }; ups.push(up);
    for (const side of sides) segs.push({ y0: p.y, y1: q.y, x0: side < 0 ? l : r, x1: side < 0 ? l : r, side, up });
  }
  const xL = Math.max(...lines.map(q => q.l)), xR = Math.min(...lines.map(q => q.r)), xL0 = Math.min(...lines.map(q => q.l)), xR0 = Math.max(...lines.map(q => q.r));
  // how far in a row (y0..y1) may run from each side: clear of every collector piece beside it
  const reach = (y0, y1) => { let lo = -Infinity, hi = Infinity;
    for (const g of segs) { if (g.y1 < y0 - 0.01 || g.y0 > y1 + 0.01) continue; const dy = g.y1 - g.y0, k = dy > 1e-6 ? (g.x1 - g.x0) / dy : 0, hw = cw / 2 * Math.hypot(1, k), at = y => g.x0 + k * (Math.max(g.y0, Math.min(g.y1, y)) - g.y0), xa = at(y0), xb = at(y1);
      if (g.side < 0) lo = Math.max(lo, Math.max(xa, xb) + hw + 1); else hi = Math.min(hi, Math.min(xa, xb) - hw - 1); }
    return [lo, hi]; };
  const drives = [], rowOb = [];
  const drive = (x0, y0, x1, y1, extra = {}) => { const e = { kind: 'drive', ...rectL(x0, y0, x1, y1), name: '', note: Math.round(Math.min(x1 - x0, y1 - y0)) + ' ft drive', ...extra }; drives.push(e); return e; };
  // 3. buildings in their rows, between the collectors running up past them
  const B = [];
  for (const rb of rowsB) {
    const b = rb.b, up = ups.find(u => u.y0 <= rb.y0 + 0.5 && u.y1 >= rb.y1 - 0.5), last = lines[lines.length - 1], lim = pickIv(H.spans(F, rb.y0, rb.y1, 'build', ob), cand.xRef); if (!lim) return null;
    const cl = up ? up.l : last.l, cr = up ? up.r : last.r; rb.up = up;
    const lo = Math.max(lim[0], hasL ? cl + cw / 2 + gs : -Infinity), hi = Math.min(lim[1], hasR ? cr - cw / 2 - gs : Infinity), room = hi - lo; if (room < 30) return null;
    if (b.stand) { rb.els = b.stand.map(q => ({ kind: 'building', ...rectL(...q), ghost: true })); if (b.stand.some(q => q[0] < lo - 0.5 || q[2] > hi + 0.5)) return null; B.push(...rb.els); continue; } // (placed by hand: it stands in the row, the collectors either side of it)
    let bl = (b.bl || []).map(q => ({ ...q })); const gap = b.gap ?? 24;
    if (b.fill?.exact) { // buildings of a set size, as many as the row holds
      const len = b.fill.exact, k = Math.floor((room + gap) / (len + gap) + 1e-9); if (k < 1) return null;
      bl = Array.from({ length: k }, () => ({ ...b.fill.proto, len }));
    } else if (b.fill) { // as long as the row runs: one building, or several of the use's longest with their gaps (or as many as asked)
      const mx = b.fill.max, k = b.fill.n || Math.max(1, Math.ceil((room + gap) / (mx + gap) - 1e-9)), len = Math.min(b.fill.n ? mx : Infinity, (room - (k - 1) * gap) / k); if (len < b.fill.min) return null;
      bl = Array.from({ length: k }, (_, i) => ({ ...(b.fill.protos?.[i] || b.fill.proto), len }));
    }
    if (!bl.length) continue;
    const tot = bl.reduce((t, q) => t + q.len, 0) + (bl.length - 1) * gap; if (tot > room + 0.5) return null;
    const at = b.at || cand.at, x0 = at === 'left' ? lo : at === 'right' ? hi - tot : Math.max(lo, Math.min(hi - tot, (cl + cr) / 2 - tot / 2));
    let x = x0; for (const q of bl) { const e = { kind: 'building', ...rectL(x, rb.y0, x + q.len, rb.y1), use: q.use, floors: q.floors, ...(q.props || {}), ...(q.note ? { note: q.note } : {}) }; rb.els = (rb.els || []).concat(e); B.push(e); x += q.len + gap; }
  }
  // 4. the drives: aisles, service drives, the collectors' pieces, a spine through a wide field
  for (const ln of lines) { if (ln.a) ln.a.e = drive(ln.l, ln.y - aw / 2, ln.r, ln.y + aw / 2, { note: aw + ' ft drive aisle' }); else ln.s.e = drive(ln.l - cw / 2, ln.band[0], ln.r + cw / 2, ln.band[1], { name: C.svcName, note: cw + ' ft · ' + (C.svcName ? 'loading, trash, fire lane' : 'fire lane') }); ln.a && (ln.a.l = ln.l, ln.a.r = ln.r); }
  for (const g of segs) {
    if (g.cap) { drive(g.x0 - cw / 2, g.y0, g.x0 + cw / 2, g.y1, { note: cw + ' ft drive · fire lane' }); continue; }
    if (Math.abs(g.x1 - g.x0) < 0.01) drive(g.x0 - cw / 2, g.y0, g.x0 + cw / 2, g.y1, { note: cw + ' ft drive · fire lane' });
    else drives.push({ kind: 'drive', path: [[g.x0, g.y0], [g.x1, g.y1]], width: cw, r: 0, name: '', note: cw + ' ft drive · fire lane' });
  }
  const W = xR - xL, spines = [];
  if (!deep && W > 400) { const n = Math.max(1, Math.round(W / 330) - 1); for (let k = 1; k <= n; k++) spines.push(xL + W * k / (n + 1)); }
  // the entry: across, straight up from the street to the first aisle (on a spine when there is one); deep, in from the
  // street on the left on an aisle's line
  const { ew } = P; let entry = null, thr, Rc = P.Rc;
  for (const rc of [P.Rc, 15, 8]) { // curb returns: 25 ft, tighter where the frontage is short
    Rc = rc;
    if (!deep) {
      const a0 = aisles[0], want = cand.entryX ?? (cand.entrySide === 'left' ? -Infinity : cand.entrySide === 'right' ? Infinity : spines.length ? spines[Math.floor((spines.length - 1) / 2)] : (xL + xR) / 2);
      const lo = a0.l + (hasL ? cw / 2 : 0) + ew / 2 + Rc + 4, hi = a0.r - (hasR ? cw / 2 : 0) - ew / 2 - Rc - 4, inWay = B.filter(b => b.y - b.d / 2 < a0.y).map(b => ({ p: S.corners(b), g: 8 })); // (a row at the street: in beside it)
      let e = null, x, yl, yr;
      const pw = cand.pond && cand.pondSide === 'bottom' ? [cand.pond.rect[0] - ew / 2 - Rc - 16, cand.pond.rect[2] + ew / 2 + Rc + 16] : []; // (a pond at the street: in beside it)
      for (const w of [want, ...pw, ...(inWay.length ? [-Infinity, Infinity, ...B.flatMap(b => [b.x - b.w / 2 - ew / 2 - Rc - 10, b.x + b.w / 2 + ew / 2 + Rc + 10])] : [])]) {
        x = Math.max(lo, Math.min(hi, w)); yl = C.street.at(x - ew / 2 - Rc, false); yr = C.street.at(x + ew / 2 + Rc, false); if (yl == null || yr == null) continue;
        thr = a0.y - aw / 2 - Math.max(yl, yr); if (thr < C.T - (cand.pat === 'stand' ? 8 : 2)) return null;
        const q = { kind: 'drive', poly: H.entryPoly(x, yl, yr, a0.y + aw / 2, ew, Rc), name: 'Main entry', note: ew + ' ft driveway', entry: true, at: x }; if (entryFits(F, q.poly, ob.concat(inWay))) { e = q; break; }
      }
      if (!e) continue;
      entry = e; rowOb.push({ p: box(x - ew / 2 - P.Rc - sw - 2, Math.min(yl, yr) - 5, x + ew / 2 + P.Rc + sw + 2, a0.y - aw / 2 - 0.5), g: 0 }); // (the throat: no stall beside it, whatever its curb returns)
      if (spines.length) { const k = spines.reduce((b, s, i) => Math.abs(s - x) < Math.abs(spines[b] - x) ? i : b, 0); spines[k] = x; }
    } else {
      const [s0, s1] = C.street.range(true), fy = cand.entryY ?? (s0 + s1) / 2; // (the aisle nearest the middle of the frontage that a driveway reaches)
      for (const a of aisles.slice().sort((p, q) => Math.abs(p.y - fy) - Math.abs(q.y - fy))) {
        const yE = a.y, xl = C.street.at(yE - ew / 2 - Rc, true), xr = C.street.at(yE + ew / 2 + Rc, true); if (xl == null || xr == null) continue;
        const t = a.l - cw / 2 - Math.max(xl, xr); if (t < C.T - 2) continue;
        const e = { kind: 'drive', poly: H.entryPoly(yE, xl, xr, a.l + cw / 2, ew, Rc).map(([u, v]) => [v, u]), name: 'Main entry', note: ew + ' ft driveway', entry: true, at: yE }; if (!entryFits(F, e.poly, ob.concat(B.map(b => ({ p: S.corners(b), g: 6 }))))) continue;
        entry = e; thr = t; rowOb.push({ p: box(Math.min(xl, xr) - 5, yE - ew / 2 - P.Rc - sw - 2, a.l - cw / 2 - 0.5, yE + ew / 2 + P.Rc + sw + 2), g: 0 }); break;
      }
      if (!entry) continue;
    }
    break;
  }
  if (!entry) return null;
  // more ways in when the site wants them (a corner lot, a big field): square to a street lot line, lined up with a
  // drive (a side street's with the service drive or an aisle; the front's with a collector), as far from the others as
  // they go and 150 ft or more from them, with the same clear throat
  const ents = [entry], solidB = B.map(e => ({ p: S.corners(e), g: 8 }));
  for (let more = (cand.nEnt ?? C.nEnt ?? 1) - 1; more > 0; more--) {
    const n = F.rr.length, here = ents.map(e => S.centroid(e.poly)); let best = null;
    const targets = [...service.map(s => ({ y: (s.y0 + s.y1) / 2, w: cw, pri: 30 })), ...aisles.slice().reverse().map((a, i) => ({ y: a.y, w: aw, pri: 20 - i })), { x: lines[0].l, w: cw, pri: 10 }, { x: lines[0].r, w: cw, pri: 10 }];
    for (let k = 0; k < n; k++) {
      if (!(F.rules[k].role === 'front' || F.rules[k].street)) continue;
      const a = F.rr[k], b = F.rr[(k + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < ew + 60) continue;
      const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], ow = S.outwardOf(F.rr, k), nIn = [-ow[0], -ow[1]];
      for (const tg of targets) {
        const vert = Math.abs(u[1]) > 0.85, flat = Math.abs(u[0]) > 0.85; if (tg.y != null ? !vert : !flat) continue; // (square to the lot line, along the drive's line)
        const t = tg.y != null ? (tg.y - a[1]) / u[1] : (tg.x - a[0]) / u[0]; if (t < ew / 2 + Rc + 8 || t > L - ew / 2 - Rc - 8) continue;
        const p0 = [a[0] + u[0] * t, a[1] + u[1] * t]; let q = null;
        for (let v = 2; v <= 400 && q == null; v += 2) { const pt = [p0[0] + nIn[0] * v, p0[1] + nIn[1] * v]; if (!S.inRing(pt, F.rr)) break; if (drives.some(d => S.hitRect({ ...d, rot: 0 }, pt))) q = v + 8; }
        if (q == null) continue;
        const at = (v, w) => [p0[0] + nIn[0] * v + u[0] * w, p0[1] + nIn[1] * v + u[1] * w], h = ew / 2, R = Math.max(4, Math.min(Rc, q - 10)), poly = [at(-1, h + R)];
        for (let g = 1; g <= 6; g++) { const th = g / 6 * Math.PI / 2; poly.push(at(R - R * Math.cos(th), h + R - R * Math.sin(th))); }
        poly.push(at(q, h), at(q, -h)); for (let g = 6; g >= 1; g--) { const th = g / 6 * Math.PI / 2; poly.push(at(R - R * Math.cos(th), -h - R + R * Math.sin(th))); } poly.push(at(-1, -h - R));
        if (!entryFits(F, poly, ob.concat(solidB))) continue;
        const c = S.centroid(poly), d = Math.min(...here.map(e => Math.hypot(e[0] - c[0], e[1] - c[1]))); if (d < 150) continue;
        const sc = d + tg.pri * 4 + (F.rules[k].street && F.rules[k].role !== 'front' ? 200 : 0); // (a corner lot: the side street first)
        if (!best || sc > best.sc) best = { sc, poly, k, zone: [at(-5, -h - Rc - sw - 2), at(-5, h + Rc + sw + 2), at(q - 9, h + Rc + sw + 2), at(q - 9, -h - Rc - sw - 2)], side: F.rules[k].role !== 'front' };
      }
    }
    if (!best) break;
    ents.push({ kind: 'drive', poly: best.poly, name: 'Entrance ' + ents.length + 1, note: ew + ' ft driveway', entry: true, side: best.side }); rowOb.push({ p: best.zone, g: 0 });
  }
  for (const [i, e] of ents.entries()) if (i) e.name = 'Entrance ' + (i + 1);
  for (const f of fields) if (f.aisles.length >= 2) for (const x of spines) drive(x - cw / 2, f.aisles[0].y - aw / 2, x + cw / 2, f.aisles[f.aisles.length - 1].y + aw / 2, { note: cw + ' ft drive', name: f === fields[0] && Math.abs(x - entry.at) < 1 ? 'Main drive' : '' });
  const spineX = fields[0].aisles.length >= 2 ? spines : [];
  // a drive-thru lane round a restaurant facing the parking (round the shop at a row's end, for a shop's drive-thru): one
  // way, counter-clockwise so the window is on the driver's side, up its right end from the aisle, across the back and
  // down its left end to the aisle again, the window on that end wall (lib/sitepad.mjs dtInfo: the order point and the
  // cars it stacks)
  const lanes = [];
  if (cand.drivethru) for (const rb of rowsB.filter(r => r.b.face === 'down')) { const bs = (rb.els || []).filter(e => e.use === 'restaurant' || e.use === 'retail');
    for (const b of bs.some(e => e.use === 'restaurant') ? bs.filter(e => e.use === 'restaurant') : bs.slice().sort((p, q) => q.x - p.x).slice(0, 1)) {
      const L = 12, yA = rb.y0 - walk - sd - 1, x0 = b.x - b.w / 2 - L / 2 - 5, x1 = b.x + b.w / 2 + L / 2 + 5, yT = b.y + b.d / 2 + L / 2 + 5, path = [[x1, yA], [x1, yT], [x0, yT], [x0, yA]];
      const d = PD.dtInfo(path, [S.outline(b)]), lead = sd + 1; // (its first stretch crosses the row in front: not the queue)
      lanes.push({ kind: 'drive', path, width: L, r: 12, name: 'Drive-thru', note: 'Drive-thru lane', ...(d ? { stack: Math.floor(Math.max(0, d.orderAt - lead) / PD.CAR + 1e-6), orderAt: d.orderAt, windowAt: d.windowAt, queueFrom: lead } : { stack: 0 }) });
    } }
  // pad sites along the street, either side of the way in: a restaurant or coffee pad with its patio, the drive-thru
  // lane round its street side joining the first aisle at both ends (lib/sitelayout.mjs padsAlong's pads)
  const pads = [];
  if (padB) {
    const a0 = aisles[0], L = 12, bw = 60, bd = 50, yA = a0.y - aw / 2 + 1, yb0 = padB.y0 + L + 4, yb1 = yb0 + bd, obP = ob.concat(rowOb, ents.map(e => ({ p: e.poly, g: 8 })));
    const fits = x => covers2(H.spans(F, padB.y0, yA - 1, 'pave', obP), x - L - 4, x + bw + L + 4) && covers2(H.spans(F, yb0, yb1, 'build', obP), x, x + bw);
    const x0 = a0.l + cw / 2 + L + 6, x1 = a0.r - cw / 2 - L - 6 - bw, xs = [];
    for (let x = x0; x <= x1; x += 2) if (fits(x) && !xs.some(v => Math.abs(v - x) < bw + 2 * L + 40)) xs.push(x);
    const at = entry.at, pickP = xs.sort((p, q) => Math.abs(p + bw / 2 - at) - Math.abs(q + bw / 2 - at)).slice(0, padB.n); // (the nearest the way in)
    for (const x of pickP) {
      const b = { kind: 'building', ...rectL(x, yb0, x + bw - 16, yb1), use: 'restaurant', floors: 1, note: 'QSR / coffee · drive-thru', pad: true }, patio = { kind: 'patio', ...rectL(x + bw - 15, yb1 - 34, x + bw, yb1), name: '', note: 'Outdoor seating' };
      const path = [[x - L / 2 - 4, yA], [x - L / 2 - 4, padB.y0 + L / 2], [x + bw + L / 2 + 4, padB.y0 + L / 2], [x + bw + L / 2 + 4, yA]], d = PD.dtInfo(path, [S.outline(b)]);
      const lane = { kind: 'drive', path, width: L, r: 14, name: '', note: 'Drive-thru lane', ...(d ? { stack: d.stack, orderAt: d.orderAt, windowAt: d.windowAt } : {}) };
      pads.push(b, patio); lanes.push(lane); B.push(b);
    }
  }
  // 5. stall rows on both sides of every aisle, between the collectors and round the spine, in whole stalls, six or more
  const hard = ob.concat(pads.filter(e => e.kind === 'patio').map(e => ({ p: S.corners(e), g: 4 })), rowOb, B.map(e => ({ p: S.corners(e), g: 10 })), lanes.map(l => ({ p: S.outline(l), g: 2 })));
  const rows = [];
  // side: where the row's aisle is. A row along x: +1 the aisle above it, -1 below. A row turned a quarter (along y,
  // between x0 and x1; its local +v points to -x): +1 its aisle on the left, -1 on the right.
  const put = (p, q, y0, y1, side, turned) => {
    const n = Math.floor((q - p + 0.01) / sw), caps = n >= 8 ? P.caps : false, cnt = n - Math.floor(n / 13) - (caps ? 2 : 0); if (cnt < 6) return;
    const w = n * sw, a = (p + q - w) / 2;
    rows.push(turned ? { kind: 'parking', x: (y0 + y1) / 2, y: a + w / 2, w, d: sd, rotL: 90, row: side, lock: true, islands: true, caps, ...C.stallKeys() } : { kind: 'parking', ...rectL(a, y0, a + w, y1), row: side, lock: true, islands: true, caps, ...C.stallKeys() });
  };
  const turnedRows = (x0, x1, y0, y1, side, obs) => { for (const [p, q] of H.spans(F, x0, x1, 'pave', obs, true).map(([p, q]) => [Math.max(p, y0), Math.min(q, y1)]).filter(([p, q]) => q - p >= 6 * sw)) put(p, q, x0, x1, side, true); };
  const cuts = spineX.map(x => [x - cw / 2 - 1, x + cw / 2 + 1]);
  for (const a of aisles) for (const [y0, y1, side] of [[a.y - aw / 2 - sd, a.y - aw / 2, 1], [a.y + aw / 2, a.y + aw / 2 + sd, -1]]) { if (a.half && side > 0) continue; // (a single-loaded first aisle: no row between it and the street)
    const [rl, rr] = reach(y0, y1), endL = hasL ? cw / 2 + 1 : 18, endR = hasR ? cw / 2 + 1 : 18; let sg = [[Math.max(rl, a.l + endL), Math.min(rr, a.r - endR)]] /* (no collector: the aisle's last 18 ft clear of stalls, room to turn) */; if (a.f === fields[0] || cuts.length && a.f.aisles.length >= 2) for (const [c, d] of cuts) sg = sg.flatMap(([p, q]) => d <= p || c >= q ? [[p, q]] : [[p, c], [d, q]]);
    for (const [p0, q0] of sg) for (const [p, q] of H.spans(F, y0, y1, 'pave', hard).map(([p, q]) => [Math.max(p, p0), Math.min(q, q0)]).filter(([p, q]) => q - p >= 6 * sw)) put(p, q, y0, y1, side, false);
  }
  // rows along the collectors beside a building row shorter than the stack: facing the collector, backs to the building
  for (const rb of rowsB) {
    const bs = rb.els || [], up = rb.up; if (!bs.length || !up) continue; const bx0 = Math.min(...bs.map(e => e.x - e.w / 2)), bx1 = Math.max(...bs.map(e => e.x + e.w / 2));
    const yy0 = Math.max(up.y0 + up.lo.h, rb.y0 - (rb.b.face === 'up' ? 0 : walk) + 1), yy1 = Math.min(up.y1 - up.hi.h, rb.y1 + (rb.b.face === 'up' || rb.b.face === 'both' ? walk : 0) - 1);
    for (const [x0, x1, s, room] of [[up.l + cw / 2, up.l + cw / 2 + sd, 1, bx0 - (up.l + cw / 2)], [up.r - cw / 2 - sd, up.r - cw / 2, -1, (up.r - cw / 2) - bx1]]) if (room >= sd + 12) turnedRows(x0, x1, yy0, yy1, s, hard);
  }
  // rows along the outside of the collectors, where they run straight
  // (beside the collector between two drive lines, a few feet clear of where each line meets it, and inside the outermost
  // lines' edges: a stall beside a drive's end would be past the end of the network, seen from that drive)
  for (const g of segs) if (!g.cap && Math.abs(g.x1 - g.x0) < 0.01 && (g.side < 0 ? oL : oR)) { const svcAt = y => lines.some(l => l.s && Math.abs(l.y - y) < 0.5) ? cw / 2 : 0, x = g.x0, y0 = Math.max(g.y0 + 3 + svcAt(g.y0), lines[0].y + lines[0].h + 3), y1 = Math.min(g.y1 - 3 - svcAt(g.y1), lines[lines.length - 1].y - lines[lines.length - 1].h - 3); /* (a service drive runs on over the collector to its outer edge) */ if (y1 - y0 < 6 * sw) continue; if (g.side < 0) turnedRows(x - cw / 2 - sd, x - cw / 2, y0, y1, -1, hard); else turnedRows(x + cw / 2, x + cw / 2 + sd, y0, y1, 1, hard); }
  // 6. the pond
  const pondEl = cand.pond ? (() => { const [x0, y0, x1, y1] = cand.pond.rect; if (cand.pond.poly) return { kind: 'pond', poly: cand.pond.poly, labelAt: S.centroid(cand.pond.poly), name: C.pondName, note: C.pondNote }; return { kind: 'pond', ...rectL(x0, y0, x1, y1), ...(P.PAR.style?.ponds === 'rounded' ? { shape: 'round' } : {}), name: C.pondName, note: C.pondNote }; })() : null;
  const els = [...ents, ...drives, ...lanes, ...B.filter(e => !e.ghost), ...pads.filter(e => e.kind === 'patio'), ...rows, ...(pondEl ? [pondEl] : [])];
  const stalls = rows.reduce((t, e) => t + S.stalls({ ...e, rot: 0 }).count, 0);
  return { els, B: B.filter(e => !e.ghost), ghosts: B.filter(e => e.ghost), rows, drives, aisles, service, fields, rowsB, pads: pads.filter(e => e.kind === 'building'), xL: xL0, xR: xR0, yLo, yHi, thr, stalls, entry, ents, W, spines: spineX };
}

// ---------- trash ----------
// the enclosures the program asks for (lib/siteplan.mjs trashNeeds) on the service drive behind the buildings they
// serve, gate on the drive, on whichever side has room; any that don't find a spot there are placed the usual way after
function trashOn(C, r, prog, X) {
  if (!r.service.length) return [];
  const need = S.trashNeeds({ program: prog, params: X.params, elements: r.els }); if (!need.length) return [];
  const { F, H } = C, out = [], svc = new Set(r.service.map(s => s.e));
  const base = C.keep.concat(r.els.filter(e => !svc.has(e) && e.kind !== 'green').map(e => ({ p: S.outline({ ...e, rot: e.rotL || e.rot || 0 }), g: e.kind === 'building' ? 10 : 2 })));
  for (const t of need) {
    const sh = need.filter(q => q.near.length === t.near.length && q.near.every((x, i) => x === t.near[i])), m = sh.indexOf(t), x0 = Math.min(...t.near.map(b => b.x - b.w / 2)), x1 = Math.max(...t.near.map(b => b.x + b.w / 2)); // (several for the same buildings: spread along them)
    const T = S.TRASH[t.type] || S.TRASH.double, cx = x0 + (x1 - x0) * (m + 0.5) / sh.length, cy = t.near.reduce((v, b) => v + b.y, 0) / Math.max(1, t.near.length), ob = base.concat(out.map(e => ({ p: S.corners(e), g: 30 })));
    let got = null;
    for (const s of r.service.slice().sort((p, q) => Math.abs((p.y0 + p.y1) / 2 - cy) - Math.abs((q.y0 + q.y1) / 2 - cy))) {
      const e = s.e, xa = e.x - e.w / 2 + T.w / 2 + 8, xb = e.x + e.w / 2 - T.w / 2 - 8;
      for (const yc of [s.y1 + 1 + T.d / 2, s.y0 - 1 - T.d / 2]) {
        const iv = H.spans(F, yc - T.d / 2, yc + T.d / 2, 'pave', ob);
        for (let k = 0; k < 60 && !got; k++) { const x = cx + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 10; if (x < xa || x > xb) continue; if (covers2(iv, x - T.w / 2, x + T.w / 2)) got = { kind: 'trash', ...rectL(x - T.w / 2, yc - T.d / 2, x + T.w / 2, yc + T.d / 2), name: t.type === 'compactor' ? 'Compactor' : 'Trash', note: T.note }; }
        if (got) break;
      }
      if (got) break;
    }
    if (got) out.push(got);
  }
  return out;
}

// ---------- trimming the parking back to the need ----------
// whole rows farthest from the buildings first, then pairs of stalls off both ends of the farthest rows (keeping eight or
// more, so the end islands stay); an aisle left with no stalls on it and no building facing it goes too (the entry's stays)
function trim(r, target, P) {
  const B = r.B.concat(r.ghosts || []), cnt = e => S.stalls({ ...e, rot: 0 }).count, sp = n => n - S.adaLoss(n);
  const near = e => B.length ? Math.min(...B.map(b => Math.max(0, Math.abs(e.x - b.x) - (b.w + (e.rotL ? e.d : e.w)) / 2) + Math.max(0, Math.abs(e.y - b.y) - (b.d + (e.rotL ? e.w : e.d)) / 2))) : -Math.abs(e.y);
  let rows = r.rows.slice(), have = rows.reduce((t, e) => t + cnt(e), 0);
  if (sp(have) <= target) return r;
  for (const e of rows.slice().sort((a, b) => near(b) - near(a))) { const c = cnt(e); if (sp(have - c) >= target) { rows = rows.filter(x => x !== e); have -= c; } }
  for (const e of rows.slice().sort((a, b) => near(b) - near(a))) {
    if (sp(have) <= target + 1) break;
    const s = e.sw || P.sw, n = Math.round(e.w / s), c0 = cnt(e); let k = 0;
    while (n - k - 2 >= 8 && sp(have - (c0 - cnt({ ...e, w: (n - k - 2) * s }))) >= target) k += 2;
    if (!k) continue; const e2 = { ...e, w: (n - k) * s }, i = rows.indexOf(e); rows[i] = e2; have -= c0 - cnt(e2);
  }
  const keepRow = new Set(rows), hit = (a, e) => S.rectsOverlap({ ...a, rot: 0 }, { ...e, rot: e.rotL || 0, w: e.w + 2, d: e.d + 2 }, 0);
  const faces = a => B.some(b => Math.abs(b.y - b.d / 2 - (a.y + P.aw / 2 + P.sd + P.walk)) < 1.5 || Math.abs(b.y + b.d / 2 - (a.y - P.aw / 2 - P.sd - P.walk)) < 1.5);
  const drop = new Set(r.aisles.filter((a, i) => i > 0 && !faces(a) && !rows.some(e => !e.rotL && hit(a.e, e))).map(a => a.e));
  return { ...r, els: r.els.filter(e => e.kind !== 'parking' && !drop.has(e)).concat(rows), rows, stalls: have, drives: r.drives.filter(e => !drop.has(e)), aisles: r.aisles.filter(a => !drop.has(a.e)) };
}

// ---------- the checks this engine holds itself to ----------
// every point of every building's walls within 150 ft of a drive 24 ft or wider; returns the buildings that aren't
export function fireReach(els, maxD = FIRE) {
  const wide = els.filter(e => (e.kind === 'drive' || e.kind === 'truck') && e.note !== 'Drive-thru lane' && (e.poly ? true : e.path ? (e.width || 26) >= 23.5 : Math.min(e.w, e.d) >= 23.5)).map(e => S.shapeOf(e));
  const far = [];
  for (const b of els.filter(e => e.kind === 'building')) {
    const o = S.outline(b); let worst = 0;
    for (let i = 0; i < o.length; i++) { const a = o[i], c = o[(i + 1) % o.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]), n = Math.max(1, Math.ceil(L / 10));
      for (let k = 0; k <= n; k++) { const p = [a[0] + (c[0] - a[0]) * k / n, a[1] + (c[1] - a[1]) * k / n]; let d = Infinity; for (const w of wide) { if (S.inRing(p, w)) { d = 0; break; } for (let j = 0; j < w.length; j++) d = Math.min(d, S.segDist(p, w[j], w[(j + 1) % w.length])); } worst = Math.max(worst, d); } }
    if (worst > maxD) far.push({ b, d: worst });
  }
  return far;
}
// the main entry's stacking distance (plan feet): from the street in along the driveway to the first other drive it
// meets, and the stall rows beside it in that stretch (its full width, the curb returns and a stall either side).
// { len, stalls: [ids] }
export function throatOf(plan, els) {
  const e = els.find(x => x.kind === 'drive' && x.name === 'Main entry'); if (!e) return null;
  const ring = plan.ring, rules = S.edgeRules(ring, plan.front, plan.setbacks, plan.streets), o = S.shapeOf(e);
  let k = -1, bd = Infinity; ring.forEach((a, i) => { if (rules[i].role !== 'front' && !rules[i].street) return; const d = Math.min(...o.map(p => S.segDist(p, a, ring[(i + 1) % ring.length]))); if (d < bd) { bd = d; k = i; } }); if (k < 0) return null;
  const a = ring[k], b = ring[(k + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], ow = S.outwardOf(ring, k), nIn = [-ow[0], -ow[1]];
  const along = p => (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1], inn = p => (p[0] - a[0]) * nIn[0] + (p[1] - a[1]) * nIn[1];
  const core = o.filter(p => inn(p) > 30), pts = core.length ? core : o, lo = Math.min(...pts.map(along)), hi = Math.max(...pts.map(along)), c0 = (lo + hi) / 2, half = (hi - lo) / 2;
  const others = els.filter(x => (x.kind === 'drive' || x.kind === 'truck') && x !== e && x.note !== 'Drive-thru lane').map(x => S.shapeOf(x));
  let len = Infinity; for (let t = 1; t <= 500; t += 1) { const p = [a[0] + u[0] * c0 + nIn[0] * t, a[1] + u[1] * c0 + nIn[1] * t]; if (others.some(q => S.inRing(p, q))) { len = t; break; } }
  const span = Math.min(len, 500) - 0.5, zone = [[c0 - half - 34, 0], [c0 + half + 34, 0], [c0 + half + 34, span], [c0 - half - 34, span]].map(([s, t]) => [a[0] + u[0] * s + nIn[0] * t, a[1] + u[1] * s + nIn[1] * t]);
  const stalls = els.filter(x => x.kind === 'parking' && S.rectsOverlap({ poly: S.shapeOf(x) }, { poly: zone }, 0.5)).map(x => x.id);
  return { len, stalls };
}
// the ends of drive aisles and service drives that meet no other drive (an aisle that stops at a curb, stall-free tip
// or not): [{ e, end: [x, y] }]
export function aisleEnds(plan, els) {
  const net = els.filter(e => (e.kind === 'drive' || e.kind === 'truck') && e.note !== 'Drive-thru lane'), shp = new Map(net.map(e => [e, S.shapeOf(e)])), out = [];
  for (const e of net) {
    if (e.poly || e.path || !(/drive aisle/.test(e.note || '') || e.name === 'Service drive')) continue;
    const along = e.w >= e.d, L = along ? e.w : e.d, W = along ? e.d : e.w, u = rot(along ? [1, 0] : [0, 1], e.rot || 0), v = [-u[1], u[0]];
    for (const sg of [-1, 1]) {
      const at = (t, q) => [e.x + u[0] * t + v[0] * q, e.y + u[1] * t + v[1] * q], t0 = sg * L / 2, probe = [at(t0 - sg * 26, -W / 2 + 3), at(t0 + sg * 3, -W / 2 + 3), at(t0 + sg * 3, W / 2 - 3), at(t0 - sg * 26, W / 2 - 3)]; // (its last 26 ft and 3 ft past: where a collector joins it)
      const hits = net.filter(o => o !== e && S.rectsOverlap({ poly: shp.get(o) }, { poly: probe }, 0)); // (and that drive goes on somewhere: a square end piece that only this aisle touches is no way through)
      if (!hits.some(h => S.entrancesOf([h]).length || net.some(o => o !== e && o !== h && S.rectsOverlap({ poly: S.grow(shp.get(h), 1) }, { poly: shp.get(o) }, 0)))) out.push({ e, end: at(t0, 0) }); // (a driveway out to the street goes on)
    }
  }
  return out;
}
// rows with fewer than six stalls (a stub)
export const stubRows = els => els.filter(e => e.kind === 'parking' && !e.rv && S.stalls(e).count < 6);

// ---------- the search ----------
// layout options for a commercial program (lib/sitelayout.mjs layoutCore's shape: finished options), best first.
// H: helpers from lib/sitelayout.mjs. Empty when nothing fits (the caller falls back to the older stacks).
// Where no layout with a drive round both ends of every aisle parks the program at any size (a small or very narrow
// lot), then the ones whose aisles stop at one end with room to turn, and they say so.
export function fieldOptions(plan, programIn, prog0, opts, H) {
  const r = fieldOptions1(plan, programIn, prog0, opts, H); if (opts.openOK || r.some(o => o.parked)) return r;
  return r.concat(fieldOptions1(plan, programIn, prog0, { ...opts, openOK: true }, H).map(o => ({ ...o, notes: ['No room on this lot for a drive round both ends of the aisles: they stop at one end with room to turn.', ...o.notes] })));
}
function fieldOptions1(plan, programIn, prog0, opts, H) {
  const brief0 = normalizeBrief(opts.brief);
  if (brief0 && !opts.relaxed) { // the brief as asked; else the nearest that fits (its sizes and pads kept, the arrangement left to the engine); else without it
    const full = list => list.some(o => o.parked && o.briefOK);
    const got = fieldOptions(plan, programIn, prog0, { ...opts, relaxed: 'as-asked' }, H); if (full(got)) return got;
    const placed = brief0.parking || brief0.buildings.some(b => b.at || b.facing), near = { ...brief0, buildings: brief0.buildings.map(b => ({ ...b, at: null, facing: null })), parking: null };
    const why = placed ? 'the arrangement it asks for (' + [brief0.parking ? 'parking ' + (brief0.parking === 'front' ? 'in front' : brief0.parking === 'back' ? 'behind the buildings' : brief0.parking === 'wrap' ? 'wrapping the buildings' : 'at the sides') : '', ...brief0.buildings.filter(b => b.at).map(b => 'a building at the ' + b.at)].filter(Boolean).join(', ') + ') doesn’t fit with its parking' : 'it doesn’t fit as asked';
    const g2 = placed ? fieldOptions(plan, programIn, prog0, { ...opts, brief: near, relaxed: 'Not quite as the brief asks: ' + why + ', so this is the nearest layout that does.' }, H) : []; if (full(g2)) return g2;
    // then the pond wherever it fits and the service drive only where it fits, the brief's buildings, sizes and pads kept
    // (before giving up on the brief: the engine's own layout keeps none of them); its notes say what moved, measured
    // against the brief as asked (the pond's side, a service drive there's no room for)
    const loose = brief0.pond && brief0.pond !== 'none' || brief0.serviceDrive ? { ...near, pond: brief0.pond === 'none' ? 'none' : null, serviceDrive: null } : null;
    const g2b = loose ? fieldOptions(plan, programIn, prog0, { ...opts, brief: loose, briefAsked: brief0, relaxed: 'Not quite as the brief asks: ' + (placed ? why + '; ' : '') + 'this is the nearest layout that does, with its buildings and pads.' }, H) : []; if (full(g2b)) return g2b;
    const best = got.concat(g2, g2b).sort((a, b) => b.parked - a.parked || b.score - a.score)[0], short = [];
    if (!best) short.push(placed ? why : 'nothing it asks for fits with its parking');
    else { if (brief0.pads && best.padsN < brief0.pads) short.push('room for ' + best.padsN + ' of the ' + brief0.pads + ' pad sites');
      if (best.want && best.gM < best.want * 0.97) short.push('only ' + f0(best.gM) + ' of the ' + f0(best.want) + ' sq ft parks' + (best.padsN ? ' beside the pads' : ''));
      if (best.nBl < brief0.buildings.length) short.push('room for ' + best.nBl + ' of its ' + brief0.buildings.length + ' buildings');
      if (brief0.serviceDrive && !best.svc) short.push('no room for the service drive'); if (!best.parked) short.push('not enough parking'); }
    const g3 = fieldOptions(plan, programIn, prog0, { ...opts, brief: null, relaxed: 'none' }, H).map(o => ({ ...o, notes: ['The brief doesn’t fit this lot as asked (' + (short.join('; ') || 'it doesn’t fit as asked') + '): this is the engine’s own layout for the program.', ...o.notes] }));
    return [...got, ...g2, ...g2b, ...g3].sort((a, b) => b.parked - a.parked || b.score - a.score);
  }
  // a size that's a minimum ("6,000+ sq ft"): that size first, then as much as fits wherever that holds more
  const minG = prog0.atLeast && prog0.max ? +(prog0.asked?.gfa || prog0.gfa) || 0 : 0;
  if (minG > 0 && !opts.atLeastDone) {
    const keepProg = o => ({ ...o, prog: { ...o.prog, max: true, atLeast: true, gfa: prog0.gfa, asked: prog0.asked || { gfa: minG } } });
    const fixed = fieldOptions1(plan, programIn, { ...prog0, max: false, atLeast: false, gfa: minG }, { ...opts, atLeastDone: true }, H).map(keepProg);
    if (!fixed.some(o => o.parked && o.gM >= minG * 0.97)) return fixed;
    const grown = fieldOptions1(plan, programIn, prog0, { ...opts, atLeastDone: true }, H).filter(o => o.parked && o.gM >= minG * 1.03)
      .map(o => ({ ...keepProg(o), score: o.score - o.gM / 100 + 1000 + Math.min(150, (o.gM / minG - 1) * 300), notes: ['At least ' + f0(minG) + ' sq ft, as asked: this lot holds ' + f0(o.gM) + '.', ...o.notes.filter(t => !/^As much as fits/.test(t))] }));
    return grown.concat(fixed).sort((a, b) => b.parked - a.parked || b.score - a.score);
  }
  const P = dimsOf(H), t0 = Date.now(), pinned = opts.pinned || [], brief = normalizeBrief(opts.brief), R = RULES[prog0.use] || RULES.other;
  const site = S.ringArea(plan.ring), z = plan.zoning || {};
  // floors: as asked; an office or a medical office whose floors the program leaves open may go up one
  const floorsFree = (programIn?.floors == null || programIn.floors === '') && !(brief?.buildings || []).some(b => b.floors), floorOpts = floorsFree && (prog0.use === 'medical' || prog0.use === 'office') && !(opts.count === 1 && opts.budgetMs === 0) ? [prog0.floors, prog0.floors + 1] : [prog0.floors]; // (not for lib/sitelayout.mjs layoutFill's quick probe: it counts footprints)
  // pinned pieces: the program's buildings among them count toward it; everything placed by hand is in the way
  const pinB = pinned.filter(e => e.kind === 'building' && e.use !== 'amenity'), pinSame = pinB.filter(e => (e.use || prog0.use) === prog0.use).reduce((t, e) => t + S.footArea(e), 0), pt = H.tally(pinned, prog0);
  const X = { P, R, H, pinned, pinB, pt, KO: H.ko() || [], brief, asked: normalizeBrief(opts.briefAsked) || brief, relaxed: opts.relaxed && !['as-asked', 'none'].includes(opts.relaxed) ? opts.relaxed : null, t0, site, z, floorsFree, programIn, params: plan.params || {}, count: opts.count || 3, budgetMs: Math.max(1200, Math.min(2600, opts.budgetMs || 2600)), quick: opts.count === 1 && opts.budgetMs === 0, xNeed: opts.xNeed || 0, openOK: !!opts.openOK };
  const tries = [];
  for (const floors of floorOpts) {
    const prog = { ...prog0, floors }, foot0 = briefFoot(brief, prog) ?? (prog.max ? null : prog.gfa ? prog.gfa / floors : null);
    let foot = foot0 == null ? null : Math.max(0, foot0 - pinSame); if (foot != null && pinB.length && foot < Math.max(1500, pinSame * 0.05)) foot = 0; // (the pinned buildings are the program)
    const got = search(plan, prog, { ...X, foot, foot0, floors }), fits = got.some(o => o.parked && (foot0 == null || o.gM >= foot0 * floors * 0.97));
    tries.push({ prog, foot0, foot, got, fits });
    if (fits && foot0 != null) break; // the size asked for fits on these floors: no need to go up
  }
  const fit = tries.find(t => t.fits);
  if (fit && fit.foot0 != null) return fit.got.sort((a, b) => b.score - a.score);
  if (tries[0].foot0 == null) return tries.flatMap((t, i) => t.got.map(o => ({ ...o, score: o.score * (i ? 0.95 : 1) }))).sort((a, b) => b.score - a.score); // as much as fits (up a floor only when it holds a twentieth more), on each number of floors tried
  // the size asked for doesn't fit: the most that does, up to it (on the most floors tried), and it says so
  const out = [];
  for (const t of tries.slice().reverse()) { out.push(...search(plan, t.prog, { ...X, t0: Date.now(), budgetMs: Math.max(1200, X.budgetMs * 0.7), foot: null, foot0: t.foot0, cap: t.foot, floors: t.prog.floors }) /* (its own time: the first search used its share) */.map(o => ({ ...o, score: o.score - 2000 }))); if (out.some(o => o.parked)) break; }
  // then a set size between the most "as much as fits" found and the ask: buildings laid out at a size lay out tighter
  // than ones grown to fit
  const t1 = tries[tries.length - 1], g0 = Math.max(0, ...out.concat(tries.flatMap(t => t.got)).filter(o => o.parked).map(o => o.gM)), wantT = t1.foot0 * t1.prog.floors;
  for (const f of [1.3, 1.15]) {
    const size = Math.min(wantT * 0.99, g0 * f); if (!(size > g0 * 1.03)) continue;
    const r = search(plan, t1.prog, { ...X, t0: Date.now(), budgetMs: 1200, foot: Math.max(0, size / t1.prog.floors - pinSame), foot0: t1.foot0, floors: t1.prog.floors }).filter(o => o.parked && o.gM >= size * 0.97);
    if (r.length) { out.push(...r.map(o => ({ ...o, score: o.score - 2000 }))); break; }
  }
  return out.concat(tries.flatMap(t => t.got)).sort((a, b) => b.parked - a.parked || b.score - a.score);
}
// the footprint a brief's buildings add up to (null: the brief doesn't size them)
function briefFoot(brief, prog) {
  const B = (brief?.buildings || []).filter(b => b.at !== 'front' || brief.parking === 'back'); if (!B.length || !B.every(b => b.gfa || b.w && b.d)) return null;
  return B.reduce((t, b) => t + (b.w && b.d ? b.w * b.d : b.gfa / (b.floors || prog.floors)), 0);
}

// every frame, pond spot and stack worth trying, laid out, the best finished; returns finished candidates
function search(plan, prog, X) {
  const { P, H, pinB, brief, foot } = X;
  const A0 = H.pondNeed(plan, prog, foot, X.pinned), A = A0 < 3000 ? 0 : A0;
  const pondWant = brief?.pond === 'none' || !A ? [null] : brief?.pond ? [brief.pond === 'side' ? 'end' : brief.pond, 'vault'] : ['back', 'front', 'end', 'vault']; // (vault: no pond, the detention underground: where a pond would cost the building)
  // frames: the lot's own lines and the street's (when they differ); square with a building placed by hand
  const da = Math.abs(((H.frontAngle(plan) - S.mainAngle(plan.ring)) % 90 + 135) % 90 - 45), aligns = da > 4 ? ['main', 'front'] : ['main'];
  const rc = plan.recipe?.pf ? plan.recipe : null, pin = pinB.slice().sort((p, q) => S.footArea(q) - S.footArea(p))[0];
  const deeps = brief?.parking === 'sides' ? [true] : brief?.buildings?.length || brief?.parking === 'back' || brief?.pads ? [false] : rc ? [!!rc.deep, !rc.deep] : [false, true]; // (the brief's rows and pads are across the lot from the street; parking at the sides runs back from it)
  const frames = [];
  for (const deep of deeps) for (const align of pin ? ['pin'] : aligns) { const F = H.frameOf(plan, deep, align === 'pin' ? 'main' : align, align === 'pin' ? pin.rot || 0 : undefined); F.align = align; frames.push(F); }
  if (!pin && aligns.length > 1 && padsOK({ deep: false }, prog, X)) { // (a small pad on a lot whose street slants across its lines: squared up halfway between, too)
    const am = S.mainAngle(plan.ring), d = ((H.frontAngle(plan) - am) % 90 + 135) % 90 - 45;
    for (const f of [0.5]) { const F = H.frameOf(plan, false, 'main', am + d * f); F.align = 'mid'; F.padOnly = true; frames.push(F); } }
  if (foot === 0 && pinB.length) X = { ...X, standIds: new Set(pinB.map(e => e.id)) }; // (the buildings placed by hand are the program: the stack is laid out round them as its row)
  const raw = [];
  for (const F of frames) {
    const C = ctxOf(plan, F, prog, X); if (!C) continue;
    let spots = 0; // (the detention underground only on a small lot, or where no pond fits anywhere: a big lot keeps its pond)
    for (const pa of pondWant) {
      if (pa === 'vault' && spots && X.site > 3.2 * 43560) continue;
      const sides = pa == null || pa === 'vault' ? [null] : pa === 'back' ? [F.deep ? 'right' : 'top'] : pa === 'front' ? (F.deep ? [] : ['bottom']) : F.deep ? ['top', 'bottom'] : ['left', 'right'];
      for (const sd of sides) {
        const pond = sd ? pondSpot(C, sd, A * 1.03, F.deep ? null : C.xMid) : null; if (sd && !pond) continue; if (pond) spots++;
        const vault = pa === 'vault';
        if (!F.padOnly) for (const c of stacks(C, prog, X, pond, sd)) raw.push({ ...c, C, pond, pondAt: vault ? null : pa, pondSide: sd, vault, pre: c.pre - (vault ? 30 : 0) });
        if (padsOK(F, prog, X)) for (const c of PD.padCands(C, prog, X, pond, sd)) raw.push({ ...c, C, pond, pondAt: vault ? null : pa, pondSide: sd, vault, key: c.key + (vault ? '|v' : '') });
      }
    }
  }
  if (!raw.length) return [];
  // lay out the most promising of each arrangement, rank them on what they hold, finish the best
  raw.sort((a, b) => b.pre - a.pre);
  // (while the time lasts; a small lot's pads, the likeliest first, at least a set number of them laid out however long
  // that takes, so the layout a lot gets doesn't hang on how fast the machine is)
  const per = new Map(), built = [], padMin = Math.max(8, Math.round(X.budgetMs / 80)); let nPad = 0, tries = 0, late = false, pads = raw.some(c => c.pad);
  for (const c of raw) {
    const n = per.get(c.key) || 0; if (n >= 24) continue;
    const padDone = late && (!pads || nPad >= padMin || tries >= padMin * 4); if (padDone) break; if (late && !c.pad) continue;
    per.set(c.key, n + 1); if (c.pad) tries++;
    const r = build(c.C, c); if (r) { built.push({ c, r, v: value(c, r, prog, X) }); if (c.pad) nPad++; }
    late = late || built.length > 400 || Date.now() - X.t0 > X.budgetMs * 0.5;
  }
  built.sort((a, b) => b.v - a.v);
  const fin = [], done = new Map(), padOnly = raw.every(c => c.pad);
  for (const { c, r } of built) {
    const n = done.get(c.key) || 0; if (n >= 2) continue;
    const f = finish(plan, prog, c, r, X); if (!f) continue; done.set(c.key, n + 1); fin.push(f);
    if (fin.length >= 12 || fin.length >= (padOnly ? 8 : 4) && Date.now() - X.t0 > X.budgetMs) break;
  }
  return fin;
}

// a small pad (lib/sitepad.mjs) is worth trying: one building of the program's (no pads, no building placed by hand), on a
// lot of up to about three acres, in the frame across it
function padsOK(F, prog, X) {
  const b = X.brief; if (F.deep || X.site > 3.2 * 43560 || X.pinB.length || (prog.buildings || 1) !== 1 || b?.pads || (b?.buildings?.length || 0) > 1) return false;
  return !b?.parking || b.parking === 'front' || b.parking === 'wrap';
}
// what a frame knows: its street, what's in the way (easements, pinned pieces), the stacking distance, the names
function ctxOf(plan, F, prog, X) {
  const { H, P, pinned, KO } = X, toF = p => rot(p, -F.psi);
  const keep = KO.map(e => ({ p: S.grow(S.shapeOf(e), 4).map(toF), g: 0 })).concat(pinned.filter(e => !['lot', 'green', 'trail', 'fence'].includes(e.kind) && !(e.kind === 'drive' && (e.entry || e.name === 'Main entry'))).map(e => ({ p: H.obstacleOf(e).map(toF), g: 0, id: e.id })));
  const street = streetOf(F); if (!street.fronts.length) return null;
  const need = Math.ceil(X.foot != null ? X.foot * X.floors / 1000 * prog.ratio : Math.min(S.ringArea(plan.ring) * 0.22 / 1000 * prog.ratio, S.ringArea(plan.ring) * 0.35 / 330)) /* (as much as fits: no more parking than about a third of the site holds) */ + (X.pt.need || 0);
  const [s0, s1] = street.range(F.deep), storm = P.PAR.storm?.mode === 'retention';
  // ways in, by the usual rules (lib/sitelayout.mjs entranceNeed): as asked; else two on a corner lot (one on each street)
  // past a small pad, two for a field over about 400 spaces or a site over 15 acres, three for a very big one
  const ac = S.ringArea(plan.ring) / 43560, corner = plan.ring.some((a, k) => F.rules[k].street && F.rules[k].role !== 'front' && S.edgeLen(plan.ring, k) >= 150);
  const frs = F.rules.filter(r => r.role === 'front'), frontPave = Math.max(0, ...frs.map(r => r.pave)), frontBuild = Math.max(0, ...frs.map(r => r.build));
  let cornerSide = null; if (!F.deep) F.rr.forEach((a, k) => { if (cornerSide || !F.rules[k].street || F.rules[k].role === 'front') return; const b = F.rr[(k + 1) % F.rr.length]; cornerSide = (a[0] + b[0]) / 2 < (s0 + s1) / 2 ? 'left' : 'right'; });
  const nEnt = prog.entrances || (need > 1200 || ac > 60 ? 3 : corner && (ac >= 1.5 || need >= 60) ? 2 : need > 400 || ac > 15 ? 2 : 1), why = prog.entrances ? '' : need > 1200 || ac > 60 ? 'huge' : corner && (ac >= 1.5 || need >= 60) ? 'corner' : nEnt > 1 ? 'big' : '';
  return { F, H, P, keep, standIds: X.standIds || null, deep: F.deep, street, T: throatFor(need), nEnt, frontPave, frontBuild, cornerSide, entWhy: why, frontX: F.deep ? Math.max(...street.fronts.flat().map(p => p[0])) : null, xMid: (s0 + s1) / 2,
    svcName: RULES[prog.use]?.service ? 'Service drive' : '', pondName: storm ? 'Retention pond' : 'Detention', pondNote: storm ? 'Wet pond · permanent pool' : 'Dry basin', stallKeys: H.stallKeys,
    solid: pinned.filter(e => !['lot', 'green', 'trail', 'fence'].includes(e.kind)).map(e => ({ kind: 'building', use: 'amenity', poly: S.shapeOf(e).map(toF) })) };
}

// the stacks to try in a frame: building rows and fields, sized for the program
function stacks(C, prog, X, pond, pondSide) {
  const { F, P, H, deep } = C, { R, foot, floors, brief } = X, use = prog.use, out = [];
  const fo = D => H.formOf(use, D, floors, 200);
  const drivethru = (use === 'restaurant' || use === 'retail') && (prog.extras || []).includes('drivethru');
  const svc0 = brief?.serviceDrive ?? R.service, nB = prog.buildings || null, brP = brief?.parking, bRows = briefRows(brief, C);
  const padN = deep ? 0 : brief?.pads || 0, hP = padN ? 81 : 0; // pad sites along the street: a drive-thru lane, the pad, its walk
  // the stack's bottom: the stacking distance in from the street less a stall row (across), the lot's paving line (deep)
  // (the lot's near and far edges: where a strip across it is most of its widest, so a lot line slanting a few feet
  // doesn't push the stack to one end)
  const wAt = v => Math.max(0, ...H.spans(F, v, v + 2, 'pave', C.keep).map(([a, b]) => b - a)), wMax = Math.max(...Array.from({ length: 9 }, (_, i) => wAt(F.Y0 + (F.Y1 - F.Y0) * (i + 1) / 10)));
  const scan = (from, dir) => { for (let v = from, k = 0; k < 800; k++, v += dir * 2) if (wAt(dir > 0 ? v : v - 2) > Math.max(60, wMax * 0.6)) return v; return null; };
  const st0 = deep ? null : C.street.at(C.xMid, false) ?? F.Y0, [f0, f1] = C.street.range(false), stHi = deep ? null : Math.max(st0, ...Array.from({ length: 9 }, (_, i) => C.street.at(f0 + (f1 - f0) * (0.15 + 0.7 * i / 8), false) ?? -Infinity));
  // (pads, or a row of buildings at the street: in from the setbacks, wherever the street line is farthest in across the
  // middle of the frontage; else the stacking distance in, less a stall row)
  let base = deep ? scan(F.Y0, 1) : padN ? stHi + Math.max(C.frontPave + 1, C.frontBuild - 15, C.T - P.sd - hP) : bRows?.front.length ? stHi + Math.max(C.frontBuild, 10) + 1 - (bRows.frontFace === 'up' ? 0 : P.walk) : st0 + C.T - P.sd; if (base == null) return out;
  if (pond && pondSide === 'bottom') base = Math.max(base, pond.rect[3] + 12);
  let top = pond && pondSide === 'top' ? pond.rect[1] - 12 : scan(F.Y1, -1); if (top == null) return out;
  const Havail = top - base; if (Havail < P.M + 60) return out;
  const xMin = pond && pondSide === 'left' ? pond.rect[2] + 12 + P.cw / 2 : null, xMax = pond && pondSide === 'right' ? pond.rect[0] - 12 - P.cw / 2 : null;
  const xRef = deep ? null : xMin != null || xMax != null ? ((xMin ?? F.X0) + (xMax ?? F.X1)) / 2 : C.xMid;
  const height = seq => { let h = 0; for (let i = 0; i < seq.length; i++) { const b = seq[i]; h += b.t === 'F' ? b.k * P.M - (b.half ? P.sd : 0) : b.t === 'B' ? b.D + (b.face === 'both' ? 2 : 1) * P.walk : b.t === 'S' ? P.cw + (seq[i - 1]?.t === 'B' ? P.gr : 0) + (seq[i + 1]?.t === 'B' ? P.gr : 0) : b.h; } return h; };
  const widthAt = (y0, y1) => { const iv = pickIv(H.spans(F, y0, y1, 'pave', C.keep), xRef); if (!iv) return 0; let w = iv[1] - iv[0]; if (xMin != null) w -= Math.max(0, xMin - P.cw / 2 - iv[0]); if (xMax != null) w -= Math.max(0, iv[1] - xMax - P.cw / 2); if (deep) w -= Math.max(0, C.frontX + C.T - iv[0]); return w; };
  // patterns: rows facing the street (one or two, each with its service drive for shops), rows back to back sharing a
  // service drive, offices and the like with parking on both sides of a row
  const W0 = widthAt(base, Math.min(top, base + 240)), pats = [];
  for (const D of briefDepths(brief, R)) {
    const svc = svc0 || D > 117; // (a deeper building needs a drive behind it: every wall within 150 ft of a fire lane)
    const Bd = () => ({ t: 'B', D, face: 'down' }), Bu = () => ({ t: 'B', D, face: 'up' }), Bb = () => ({ t: 'B', D, face: 'both' });
    if (X.openOK && X.site < 2.2 * 43560 && D <= 117) pats.push({ D, name: 'tiny', fields: 1, nocol: true, seq: k => [{ t: 'F', k: k[0] }, Bd()] }); // a small lot: one field, the entry up its middle, turning room at the aisles' ends
    if (X.openOK && X.site < 3.2 * 43560 && D <= 117) pats.push({ D, name: 'side', fields: 1, col: true, svcNA: true, seq: k => [{ t: 'F', k: k[0] }, Bd()] }); // a small lot: one collector up one side, the aisles' other ends clear to turn
    if (svc0 && D <= 117 && (X.site < 3.2 * 43560 || W0 < 300 || Havail < 200)) pats.push({ D, name: 'nosvc', fields: 1, seq: k => [{ t: 'F', k: k[0] }, Bd()] }); // a lot too small or narrow for a rear service drive
    pats.push({ D, name: 'front', fields: 1, seq: k => [{ t: 'F', k: k[0] }, Bd(), ...(svc ? [{ t: 'S' }] : [])] });
    if (brP === 'wrap' || (brief?.buildings?.length || 0) === 1) continue;
    pats.push({ D, name: 'front2', fields: 2, seq: k => [{ t: 'F', k: k[0] }, Bd(), svc ? { t: 'S' } : { t: 'G', h: 12 }, { t: 'F', k: k[1] }, Bd(), ...(svc ? [{ t: 'S' }] : [])] });
    if (svc0) { pats.push({ D, name: 'b2b', fields: 2, seq: k => [{ t: 'F', k: k[0] }, Bd(), { t: 'S' }, Bu(), { t: 'F', k: k[1] }] });
      if (X.site > 8 * 43560) pats.push({ D, name: 'b2b4', fields: 3, seq: k => [{ t: 'F', k: k[0] }, Bd(), { t: 'S' }, Bu(), { t: 'F', k: k[1] }, Bd(), { t: 'S' }, Bu(), { t: 'F', k: k[2] }] });
      pats.push({ D, name: 'b2b3', fields: 2, seq: k => [{ t: 'F', k: k[0] }, Bd(), { t: 'S' }, Bu(), { t: 'F', k: k[1] }, Bd(), { t: 'S' }] }); }
    if (R.both && D <= 117) { pats.push({ D, name: 'both', fields: 2, seq: k => [{ t: 'F', k: k[0] }, Bb(), { t: 'F', k: k[1] }] });
      pats.push({ D, name: 'both1d', fields: 2, seq: k => [{ t: 'F', k: k[0] }, Bb(), { t: 'F', k: k[1] }, Bd()] });
      if (X.site > 8 * 43560) pats.push({ D, name: 'both2d', fields: 3, seq: k => [{ t: 'F', k: k[0] }, Bb(), { t: 'F', k: k[1] }, Bb(), { t: 'F', k: k[2] }, Bd()] });
      pats.push({ D, name: 'both2', fields: 3, seq: k => [{ t: 'F', k: k[0] }, Bb(), { t: 'F', k: k[1] }, Bb(), { t: 'F', k: k[2] }] }); }
  }
  if (bRows) { // the brief's rows, as it asks: the street row, the parking, a middle row and its field, the back row (with its service drive)
    pats.length = 0;
    for (const D of briefDepths(brief, R)) {
      const svc = svc0 || D > 117, Bx = (face, list) => ({ t: 'B', D, face, brief: list, at: list.find(b => b.pos)?.pos || null });
      const seq = k => { const s = [], f = [...k]; if (bRows.front.length) s.push({ t: 'G', h: 0 }, Bx(bRows.frontFace, bRows.front)); s.push({ t: 'F', k: f.shift() }); if (bRows.middle.length) s.push(Bx('both', bRows.middle), { t: 'F', k: f.shift() });
        if (bRows.back.length) { if (deep) s.push(Bx('both', bRows.back), { t: 'F', k: f.shift() }); else { s.push(Bx('down', bRows.back)); if (svc) s.push({ t: 'S' }); } } return s; };
      pats.push({ D, name: 'brief', brief: true, svcNA: !bRows.back.length, fields: 1 + (bRows.middle.length ? 1 : 0) + (deep && bRows.back.length ? 1 : 0), seq });
    }
  }
  // a building moved by hand (the program's own): the field in front of it sized to reach it from the stacking distance
  // (lawn takes the odd feet at the street), its walk against the field, and behind it what the use has (a service
  // drive, or a field when it faces both ways)
  const stand = X.standIds ? X.pinB.map(e => { const c = S.corners(e).map(q => rot(q, -F.psi)), xs = c.map(q => q[0]), ys = c.map(q => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }) : null;
  const sW = stand?.length ? Math.max(...stand.map(r => r[2])) - Math.min(...stand.map(r => r[0])) : 0, sD = stand?.length ? Math.max(...stand.map(r => r[3])) - Math.min(...stand.map(r => r[1])) : 0;
  if (stand?.length && sD <= Math.min(200, sW)) { // (a row: the buildings' long side along it)
    const by0 = Math.min(...stand.map(r => r[1])), by1 = Math.max(...stand.map(r => r[3])), D = by1 - by0, xS = (Math.min(...stand.map(r => r[0])) + Math.max(...stand.map(r => r[2]))) / 2;
    const tails = [[], ...(svc0 || D > 117 ? [[{ t: 'S' }], [{ t: 'S' }, { t: 'F', k: 1 }], [{ t: 'S' }, { t: 'F', k: 2 }]] : []), ...(R.both ? [[{ t: 'F', k: 1 }], [{ t: 'F', k: 2 }]] : [])];
    for (const face of R.both ? ['down', 'both'] : ['down']) for (const tail of tails) {
      if ((face === 'both') !== (tail[0]?.t === 'F')) continue; // (a field behind a row that faces both ways; a drive (and parking past it, where the front can't hold it all) or nothing behind one facing the street)
      for (const col of [null, 'left', 'right']) for (const half of [false, true]) for (let k0 = 1; k0 <= 14; k0++) { // (col: a building moved near a side of the lot leaves room for a fire lane up the other side only)
        let b0 = base + (half && !deep ? P.sd : 0), h0 = k0 * P.M - (half ? P.sd : 0), gapH = by0 - P.walk - h0 - b0; if (gapH < -6) break; if (gapH >= P.M) continue;
        if (gapH < 0) { b0 += gapH; gapH = 0; } // (nudged a few feet toward the street: the stacking distance gives the few feet)
        const seq = [{ t: 'G', h: gapH }, { t: 'F', k: k0, half }, { t: 'B', D, face, stand }, ...tail.map(b => ({ ...b }))], Hs = height(seq) + (half && !deep ? P.sd : 0); if (Hs > Havail + 0.5) continue;
        out.push({ nocol: false, seq, D, pat: 'stand', col, base: b0, xRef: xS, xMin, xMax, drivethru: false, gr: P.gr, gs: P.gs, Hs, K: k0 + tail.reduce((t, q) => t + (q.k || 0), 0), outer: null, half, svcNA: !svc0, key: (deep ? 'deep' : 'across') + '|stand|' + (pondSide || '') + '|' + face + '|' + tail.map(b => b.t + (b.k || '')).join('') + (half ? '|h' : '') + (col ? '|' + col : ''), pre: 2000 - gapH - (col ? 5 : 0) });
      }
    }
    if (!deep) for (const k1 of [1, 2, 3]) for (const col of [null, 'left', 'right']) { // (moved up to the street: its parking behind it, the way in beside it)
      const seq = [{ t: 'B', D, face: 'up', stand }, { t: 'F', k: k1 }], Hs = height(seq); if (by0 + Hs > top + 0.5) continue;
      out.push({ nocol: false, seq, D, pat: 'stand', col, base: by0, xRef: xS, xMin, xMax, drivethru: false, gr: P.gr, gs: P.gs, Hs, K: k1, outer: null, half: false, svcNA: true, key: 'across|stand|' + (pondSide || '') + '|up|F' + k1 + (col ? '|' + col : ''), pre: 1900 - k1 });
    }
  }
  const padNeed = padN * Math.ceil(2.2 * (S.USES.restaurant?.ratio || 10)); // (a pad: about 2,200 sq ft of restaurant)
  const rat = u => u === prog.use ? prog.ratio : S.USES[u]?.ratio ?? 3, bNeed = brief?.buildings?.length && brief.buildings.every(b => b.gfa || b.w && b.d) ? brief.buildings.reduce((t, b) => t + (b.gfa || b.w * b.d * (b.floors || floors)) / 1000 * rat(b.use || use), 0) : null; // (the brief's buildings, each at its own use's ratio)
  const need0 = foot != null ? Math.ceil(bNeed ?? foot * floors / 1000 * prog.ratio) + (X.pt.need || 0) - (X.pt.stalls || 0) + X.xNeed + padNeed : null;
  const keyOf = (pat, extra = '') => (deep ? 'deep' : 'across') + '|' + pat + '|' + (pondSide || '') + extra;
  for (const pat of pats) {
    const D = pat.D, fm = fo(D), A = fm.af, fixedH = height(pat.seq(Array(pat.fields).fill(0))), Kmax = Math.min(14, Math.floor((Havail - fixedH) / P.M)); if (Kmax < pat.fields) continue;
    for (let K = pat.fields; K <= Kmax; K++) {
      const splits = pat.fields === 1 ? [[K]] : pat.fields === 2 ? [[Math.ceil(K / 2), Math.floor(K / 2)], [Math.floor(K / 2), Math.ceil(K / 2)], [K - 1, 1]].filter((k, i, l) => k.every(v => v >= 1) && l.findIndex(q => q.join() === k.join()) === i) : [[Math.ceil(K / 3), Math.ceil((K - Math.ceil(K / 3)) / 2), K - Math.ceil(K / 3) - Math.ceil((K - Math.ceil(K / 3)) / 2)]].filter(k => k.every(v => v >= 1));
      for (const k of splits) for (const outer of [null, 'both']) for (const half of [false, true]) {
        const seq = pat.seq(k); if (half) { if (seq[0].t !== 'F') continue; seq[0] = { ...seq[0], half: true }; } if (padN) { if (half || seq[0].t !== 'F') continue; seq.unshift({ t: 'P', h: hP, n: padN }); } const Hs = height(seq) + (half && !deep ? P.sd : 0); if (Hs > Havail + 0.5) continue; // (single-loaded first aisle: it starts a stall depth further in, at the throat)
        const ow = outer ? 2 * (P.sd + 1) : 0, rowsB = seq.filter(b => b.t === 'B'), Wtop = widthAt(base, base + Hs) - ow, cols = pat.col ? P.cw + 18 : 2 * P.cw, Wb = Wtop - cols - (pat.col ? 1 : 2) * P.gs, /* (between the collectors' inner edges, less the gaps to them) */ rowsN = 2 * K - (half ? 1 : 0), outerN = outer ? 2 * Math.max(0, Math.floor((Hs - 2 * P.sd) / P.sw) - 3) : 0;
        if (Wb < R.min) continue;
        if (pat.nocol && K > 1 || pat.col && K > 3) continue;
        if (!X.openOK && K - (half ? 0 : 0) + seq.filter(b => b.t === 'S').length < 2) continue; // (one drive line alone has nothing to loop to: only where nothing else fits)
        for (const [entrySide, col] of pat.nocol ? [['center'], ['left'], ['right']] : pat.col ? [[null, 'left'], [null, 'right']] : [[null]]) {
        const common = { nocol: !!pat.nocol, col, svcNA: !!pat.svcNA && !svc0, entrySide, seq, D, pat: pat.name, base: base + (half && !deep ? P.sd : 0), xRef, xMin, xMax, drivethru, gr: drivethru ? 24 : P.gr, gs: drivethru ? 24 : P.gs, Hs, K, outer, half };
        const key = (extra = '') => keyOf(pat.name, extra + (outer ? '|o' : '') + (half ? '|h' : '') + (entrySide ? '|' + entrySide : '') + (col ? '|' + col : ''));
        if (foot == null) { // as much as fits: rows as long as they run, as many buildings as the use's longest makes them
          const exact = X.cap && nB > 1 ? X.cap / nB / D / A : null; // (a number of buildings of a size that don't all fit: as many of that size as do)
          for (const b of rowsB) { b.fill = { max: R.one && (prog.buildings === 1 || X.cap && !nB && X.cap / D / A <= R.one) ? R.one : R.max, min: R.min, exact: b.brief ? null : exact, proto: { use, floors, props: fm.props }, ...(b.brief ? { n: b.brief.length, protos: b.brief.map(q => ({ use: q.use || use, floors: q.floors || floors, props: fm.props })) } : {}) }; b.gap = R.gap; }
          const stallsGuess = rowsN * Math.max(0, Math.floor((Wtop - P.cw) / P.sw) * 0.86) + outerN, park = stallsGuess / prog.ratio * 1000, cap = rowsB.length * Wb * D * A * floors;
          out.push({ ...common, key: key(), pre: Math.min(cap, park) / 100 - Math.abs(cap - park) / 2000 });
          continue;
        }
        if (!(foot > 0)) { const sq = seq.filter(b => b.t === 'F' || b.t === 'P'); out.push({ ...common, seq: sq, Hs: height(sq), key: key('|0'), pre: -K * 10 - Hs / 10, noBldg: true }); continue; } // (the buildings are all placed by hand: just the parking, round them)
        // a set size: the floor area asked for, in as many buildings as asked (or as the use's longest makes it)
        const seqN = seq.map(b => ({ ...b })), rowsN2 = seqN.filter(b => b.t === 'B');
        if (pat.brief) { // each building as the brief sizes it (its length along the row, or its floor area over the row's depth)
          rowsN2.forEach(b => { b.bl = b.brief.map(q => ({ use: q.use || use, floors: q.floors || floors, props: fm.props, len: q.w || (q.gfa ? q.gfa / (q.floors || floors) : foot / b.brief.length) / D / A })); b.gap = R.gap; });
          if (rowsN2.some(b => b.bl.reduce((t, q) => t + q.len, 0) + (b.bl.length - 1) * R.gap > Wb + 0.5)) continue;
        } else {
          const total = foot / A, maxL = Math.min(R.max, Wb), n = nB || (R.one && total / D <= Math.min(R.one, Wb) ? 1 : Math.max(1, Math.ceil(total / D / maxL - 1e-9))), len = total / D / n; // (a restaurant program one building holds: one building) if (len < R.min * 0.8 || len > Wb + 0.5) continue;
          const perRow = Math.max(0, Math.floor((Wb + 2 * P.cw + R.gap) / (len + R.gap) + 1e-9)); if (perRow * rowsB.length < n) continue; // (generous: the rows' real room is worked out when it's laid out)
          const share = rowsB.map(() => 0); for (let i = 0, left = n; left > 0; i = (i + 1) % rowsB.length) { if (share[i] < perRow) { share[i]++; left--; } }
          if (share.some(v => v === 0)) continue; // (an empty building row: a shorter stack does that)
          rowsN2.forEach((b, i) => { b.bl = Array.from({ length: share[i] }, () => ({ use, floors, props: fm.props, len })); b.gap = R.gap; });
        }
        const wB = Math.max(...rowsN2.map(b => b.bl.reduce((t, q) => t + q.len, 0) + (b.bl.length - 1) * R.gap)) + 2 * P.gs + cols + ow;
        const per = w => { const n2 = Math.floor((w - ow - cols - 2) / P.sw); return Math.max(0, n2 - Math.floor(n2 / 13) - 2); };
        const lost = drivethru ? 8 * rowsN2.reduce((t, b) => t + b.bl.length, 0) : 0; // (a drive-thru lane takes stalls out of the row in front of its restaurant)
        let wP = Infinity; for (let w = ow + cols + 8 * P.sw; w <= Wtop + ow + P.cw + 1; w += P.sw) { const t = rowsN * per(w) + outerN; if (t - S.adaLoss(t) >= need0 * 1.02 + 2 + lost) { wP = w; break; } }
        if (wP === Infinity) continue; // not enough parking at this depth
        const Wc = Math.max(wB, wP), compact = Wc < Wtop + ow + P.cw - 50, area = Wc * Hs;
        for (const at of compact ? (deep ? ['left'] : ['center', 'left', 'right']) : ['center']) // (deep: the compact stack at the street, the land behind kept whole)
          out.push({ ...common, seq: seqN.map(b => b.t === 'B' ? { ...b, bl: b.bl.map(q => ({ ...q })) } : { ...b }), W: compact ? Wc : null, at, win: compact, key: key(compact ? '|c' : ''),
            pre: 1000 - area / 2000 - (rowsB.length - 1) * 30 - Math.max(0, wP - wB) / 20 + (at === 'center' ? 0 : -1) - (outer ? 4 : 0) });
        }
      }
    }
  }
  return out;
}
// what a layout did differently from its brief, and why
function briefNotes(X, c, r, pondHave, pondNeed) {
  const b = X.asked || X.brief, out = [], nB = r.B.filter(e => !e.pad).length, side = { top: 'back', bottom: 'front', left: 'side', right: 'side' }; // (b: the brief as asked, when a looser one was laid out)
  if (X.relaxed) out.push(X.relaxed);
  if (b.buildings.length && nB < b.buildings.length) out.push('Room for ' + nB + ' of the ' + b.buildings.length + ' buildings the brief asks for.');
  if (b.pads && (r.pads?.length || 0) < b.pads) out.push('Room for ' + (r.pads?.length || 0) + ' of the ' + b.pads + ' pad sites along the street' + (c.C.deep ? ' (the rows run back from the street here)' : ': the frontage beside the entry is too short') + '.');
  if (b.serviceDrive && !r.service.length) out.push('No room for the rear service drive the brief asks for: deliveries come in along the front aisle.');
  if (b.pond === 'none' && pondNeed > 0) out.push('No pond, as the brief asks: the stormwater (' + (pondNeed / 43560).toFixed(2) + ' acres of detention) goes underground or to a regional pond.');
  else if (b.pond && pondHave > 0 && c.pondSide && (b.pond === 'side' ? 'side' : b.pond) !== side[c.pondSide] && !(c.C.deep && b.pond === 'side')) out.push('The pond is at the ' + side[c.pondSide] + ': no room for it at the ' + b.pond + '.');
  if (b.parking === 'sides' && !c.C.deep) out.push('Parking in front rather than at the sides: rows running back from the street don’t fit this lot.');
  return out;
}
// the depths a brief's buildings ask for, else the use's
function briefDepths(brief, R) { const d = (brief?.buildings || []).map(b => b.d).filter(Boolean); return d.length ? [...new Set(d)] : R.depths; }

// how good a laid-out try is (before it's finished): the most floor area the parking carries (as much as fits), or the
// floor area asked for, parked, on the least land
function value(c, r, prog, X) {
  const sp = r.stalls - S.adaLoss(r.stalls), gfa = r.B.reduce((t, e) => t + S.gfaOf(e), 0), need = needOf(r.B, prog) + (X.pt.need || 0) - (X.pt.stalls || 0) + X.xNeed;
  if (X.foot == null) { const g = Math.min(need > sp ? gfa * sp / need : gfa, X.cap ? X.cap * X.floors : Infinity); return g / 100 - (need > sp ? 0 : (sp - need) / Math.max(1, need) * 20); }
  if (sp < need) return -1e6 + sp;
  return 1000 - (r.xR - r.xL) * c.Hs / 3000 - Math.max(0, sp - need * 1.1) / Math.max(1, need) * 100 + (c.win ? 20 : 0) - (X.R.service && !r.service.length && !c.svcNA ? 60 : 0) + (c.pat === 'stand' ? (c.seq[0]?.face === 'up' ? 150 : 300) : 0); // (with its service drive first; round a building moved by hand, the stack it stands in first)
}
// the spaces a set of buildings needs, each by its own use (the program's ratio for its own use)
function needOf(B, prog) { return Math.ceil(B.reduce((t, e) => t + S.gfaOf(e) / 1000 * (e.use === prog.use ? prog.ratio : S.USES[e.use]?.ratio ?? 3), 0) - 0.01); }

// a laid-out try sized, trimmed, finished (land, plan feet, names, the checks) and scored; null when it fails
function finish(plan, prog, c, r0, X) {
  const { H, P, foot, floors, R, pinned } = X, C = c.C, F = C.F;
  let r = r0, bind = null;
  // as much as fits: buildings as long as the parking at the ratio carries (shortened from the middle out, and laid out
  // again so the collectors' side rows can take the land freed), then a zoning limit on coverage or floor area
  const nB = prog.buildings || 0, exact = !!c.seq.find(b => b.t === 'B')?.fill?.exact;
  if (foot == null && r.B.length && !c.pad) { // (a pad is laid out as big as its room already)
    const sp = n => n - S.adaLoss(n);
    for (let it = 0; it < (exact ? 12 : 3); it++) {
      const need = needOf(r.B, prog) + (X.pt.need || 0) - (X.pt.stalls || 0) + X.xNeed, have = sp(r.stalls);
      const z = X.z, cov = r.B.reduce((t, e) => t + S.footArea(e), 0), gfa = r.B.reduce((t, e) => t + S.gfaOf(e), 0);
      const kq = X.cap ? Math.min(1, X.cap / cov) : 1, kp = Math.min(kq, need > have ? have / need : 1), kc = +z.max_coverage_pct ? Math.min(1, X.site * z.max_coverage_pct / 100 / cov) : 1, kf = +z.max_far ? Math.min(1, X.site * z.max_far / gfa) : 1, k = Math.min(kp, kc, kf);
      if (!bind) bind = k >= 0.999 ? 'land' : kp <= kc && kp <= kf ? 'parking' : kc <= kf ? 'coverage' : 'far';
      if (k >= 0.999 && !(nB > 1 && r.B.length > nB)) break;
      const seq = c.seq.map(b => ({ ...b })); let i = 0;
      if (exact) { // a set size: whole buildings come out, the farthest from the way in first, until the parking carries the rest
        const at = S.centroid(r.entry.poly), list = r.B.slice().sort((p, q) => Math.hypot(q.x - at[0], q.y - at[1]) - Math.hypot(p.x - at[0], p.y - at[1])), gfaE = list.length ? S.gfaOf(list[0]) : 0;
        let drop = Math.max(nB > 1 ? r.B.length - nB : 0, Math.ceil((need - have) / Math.max(1e-6, gfaE / 1000 * prog.ratio) - 1e-9)); if (drop >= r.B.length) return null; const gone = new Set(list.slice(0, Math.max(1, drop)));
        for (const b of seq) if (b.t === 'B') { const rb = r.rowsB.filter(q => q.b.t === 'B')[i++], bs = (rb?.els || []).filter(e => !gone.has(e)).sort((p, q) => p.x - q.x); b.fill = null; b.bl = bs.map(e => ({ use: e.use, floors: e.floors, props: e.form ? { form: e.form, wing: e.wing } : {}, len: e.w })); }
        const r2 = build(C, { ...c, seq }); if (!r2 || !r2.B.length) return null; r = r2; bind = 'parking'; continue;
      }
      for (const b of seq) if (b.t === 'B') { const rb = r.rowsB.filter(q => q.b.t === 'B')[i++], bs = (rb?.els || []).slice().sort((p, q) => p.x - q.x); b.fill = null; b.bl = bs.map(e => ({ use: e.use, floors: e.floors, props: e.form ? { form: e.form, wing: e.wing } : {}, len: e.w * k * (k === kq ? 1 : 0.995) })).filter(q => q.len >= R.min * 0.6); }
      const r2 = build(C, { ...c, seq }); if (!r2 || !r2.B.length) return null; r = r2;
    }
  }
  if (c.noBldg) r = { ...r, els: r.els.filter(e => e.kind !== 'building'), B: [] };
  const need = needOf(r.B, prog) + (X.pt.need || 0) - (X.pt.stalls || 0) + X.xNeed;
  if (r.stalls - S.adaLoss(r.stalls) < need) return null;
  r = trim(r, Math.ceil(need * 1.05 - 0.01) + 2, P);
  const tr = trashOn(C, r, prog, X); if (tr.length) r = { ...r, els: r.els.concat(tr) };
  // the land left over: lawns, a future pad or phase (the pond is already placed)
  const land = H.finishLand(F, r.els.concat(C.solid), { pond: 0, reserve: [], amenity: false, padUse: true, openSpace: false, frontY: H.profile(F).b[0], future: true, lakeName: '' }, {});
  let els = H.adoptEntry(H.toPlanEls(F, r.els.concat(land)), pinned);
  const entry = els.find(e => e.name === 'Main entry') || pinned.find(e => e.name === 'Main entry');
  H.nameAll(els, entry ? [entry.x, entry.y] : S.centroid(plan.ring), prog, new Set(pinned.map(e => e.name).filter(Boolean)));
  const keepIds = new Set(pinned.map(e => e.id)), fx = H.repair({ ...plan, program: prog }, els.concat(pinned.map(e => ({ ...e }))), keepIds);
  if (fx.els.filter(e => e.kind === 'building').length < r.B.length + pinned.filter(e => e.kind === 'building').length) return null; // (the checks took a building out: not this one)
  const bad = fx.bad.filter(i => !keepIds.has(i.id)); if (bad.length) return null;
  els = fx.els;
  // a pad's other ways in (asked for, or a corner lot's side street) go in now, where the parking counts what they take:
  // the building laid out again to what's left when they take stalls it needs (lib/sitelayout.mjs withEntrances adds
  // them after the layout otherwise)
  const entNotes = []; if (c.pad && (C.nEnt || 1) > 1) {
    const me = S.moreEntrances({ ...plan, elements: els }, C.nEnt - 1, { side: C.entWhy === 'corner' }), lost = S.metrics({ ...plan, program: prog, elements: els }).stalls - S.metrics({ ...plan, program: prog, elements: me.elements }).stalls;
    if (lost > 0 && !c.pad.lose && foot == null) { const c2 = { ...c, pad: { ...c.pad, lose: lost } }, r2 = build(C, c2); return r2 ? finish(plan, prog, c2, r2, X) : null; }
    els = me.elements; if (me.added.length && !C.entWhy) entNotes.push(me.added.length + ' more entrance' + (me.added.length > 1 ? 's' : '') + ' in from the street.');
  }
  const pl = { ...plan, program: prog, elements: els }, m = S.metrics(pl), iss = S.check(pl);
  const dead = iss.filter(i => / dead-ends /.test(i.text)).length, mouth = iss.filter(i => /is at the mouth of/.test(i.text)).length, far = fireReach(els).length;
  const gfa = m.gfa, want = X.foot0 != null ? X.foot0 * floors : null, pondNeed = H.pondNeed(plan, prog, foot, pinned), pondHave = m.pond;
  // the score: what was asked for (or the most floor area), parked, the detention held, the storefronts to the street
  const padG = (r.pads || []).reduce((t, e) => t + S.gfaOf(e), 0), gM = gfa - padG; // (pads the brief asks for are on top of the program)
  let sc = (want ? 1000 - Math.abs(gM - want) / want * 1000 - (gM < want * 0.97 ? 300 : 0) : gfa / 100) + (r.pads?.length || 0) * 60;
  if (m.required > m.spaces) sc -= (m.required - m.spaces) / Math.max(1, m.required) * 1500;
  if (m.required && m.spaces > m.required * 1.12 + 3) sc -= Math.abs(sc) * Math.min(0.3, m.spaces / m.required - 1.12);
  const vault = c.vault && pondNeed > 0 && !(pondHave > 0); // (no pond: the detention underground, which costs, but less than the building it would take)
  if (pondNeed > 0 && X.brief?.pond !== 'none') sc -= vault ? (want ? 150 : Math.abs(sc) * 0.2 + 50) /* (a size asked for: more than about a sixth of it lost to a pond, then underground) */ : Math.max(0, pondNeed * 0.95 - pondHave) / pondNeed * Math.abs(sc) * 1.5;
  const notes0 = [], noSvc = R.service && !r.service.length && !c.svcNA; if (noSvc) { sc -= want ? 400 : 150; /* (a set size: a layout with the drive comes first whenever one holds it) */ notes0.push('No room for a rear service drive on this lot: deliveries and trash come in along the front aisle, at quiet hours.'); }
  if (c.nocol) sc -= 60; if (c.col) sc -= 30; if (c.pat === 'stand') sc += c.seq[0]?.face === 'up' ? -100 : 150; /* (parking behind it only when the front can't hold its field) */ else if (c.noBldg) sc -= 150; // (a building moved by hand: the field laid out to face it) // (a collector up both sides first)
  if (C.entWhy === 'corner' && !r.ents.some(e => e.side)) sc -= 300; // (a corner lot: a way in from each street)
  sc += H.frontScore(plan, els) + (H.lowPond?.(plan, els) || 0) - dead * 400 - mouth * 200 - far * 300 - fx.cut * 40 + (c.win ? 10 : 0);
  if (want && floors > S.normalizeProgram({ use: prog.use }).floors) sc -= 40; // (up a floor only when that's what makes the size fit)
  const notes = [...notes0, ...entNotes], acres = v => (v / 43560).toFixed(2);
  if (want == null && gfa > 0) notes.push(bind === 'parking' ? 'As much as fits: ' + f0(gfa) + ' sq ft, sized to the parking (' + S.spacesWord(m.spaces) + ' at ' + prog.ratio + ' per 1,000 sq ft)' + (pondHave > 0 ? ' beside ' + acres(pondHave) + ' acres of detention' : '') + '.'
    : bind === 'coverage' ? 'As much as fits: ' + f0(gfa) + ' sq ft, held to the zoning’s ' + X.z.max_coverage_pct + '% lot coverage.' : bind === 'far' ? 'As much as fits: ' + f0(gfa) + ' sq ft, held to the zoning’s FAR of ' + X.z.max_far + '.'
    : 'As much as fits: ' + f0(gfa) + ' sq ft; the buildings run as long and as deep as the setbacks, the fire lanes' + (pondHave > 0 ? ' and the detention' : '') + ' allow (the parking could carry more).');
  if (want && floors > (X.programIn?.floors || S.USES[prog.use].floors)) notes.push(f0(want) + ' sq ft on two floors (a ' + f0(want / floors) + ' sq ft footprint): on one floor the building and its ' + S.spacesWord(Math.ceil(want / 1000 * prog.ratio)) + ' don’t fit with the detention and setbacks.');
  const nE = S.entrancesOf(els).length; if (nE > 1 && C.entWhy) notes.push(H.entryWhy[C.entWhy] || nE - 1 + ' more entrance' + (nE > 2 ? 's' : '') + ' in from the street.');
  if (want && gM > 0 && gM < want * 0.97 && c.pad) notes.push('Room for ' + f0(gM) + ' of the ' + f0(want) + ' sq ft asked for: the parking is what binds. ' + f0(want) + ' sq ft needs ' + S.spacesWord(Math.ceil(want / 1000 * prog.ratio - 0.01)) + ' at ' + prog.ratio + ' per 1,000 sq ft; with the ' + (r.dt ? 'drive-thru lanes' : 'drive') + ' round the building, ' + C.T + ' ft clear at the way in and the setbacks, this lot parks ' + S.spacesWord(m.spaces) + '.');
  else if (want && gM > 0 && gM < want * 0.97) notes.push('Room for ' + f0(gM) + ' of the ' + f0(want) + ' sq ft asked for: the rest won’t park at ' + prog.ratio + ' per 1,000 sq ft beside the detention and setbacks.');
  if (X.brief) notes.push(...briefNotes(X, c, r, pondHave, pondNeed));
  // a drive-thru asked for: its lane, the cars it stacks behind the order point
  const dtWant = (prog.extras || []).includes('drivethru') && ['retail', 'restaurant'].includes(prog.use), dtLanes = els.filter(e => e.note === 'Drive-thru lane'), dtMin = dtLanes.length ? Math.min(...dtLanes.map(e => e.stack ?? PD.STACK)) : null;
  if (dtWant && !dtLanes.length) { sc -= 600; notes.push('No room on this layout for the drive-thru lane and the eight cars it stacks.'); }
  else if (dtWant && dtLanes.length && dtMin < PD.STACK) { sc -= 300; notes.push('The drive-thru lane stacks ' + dtMin + ' cars behind the order point; ' + PD.STACK + ' is the usual minimum.'); }
  else if (c.pad && r.dt) notes.push('Drive-thru: one-way round the building with the window on the driver’s side, ' + r.dt.stack + ' cars of stacking behind the order point, and a bypass lane to leave the line or drive round.');
  if (c.pad) { notes.push('One building at the back with its parking in front and a drive round it: on a lot this size there’s no room for fire lanes up both sides of a parking field.');
    if (R.service) notes.push('No room for a rear service drive on this lot: deliveries and trash come round the back on the drive behind the building.');
    if (C.cornerSide && c.pad.wing && c.pad.wing !== 'both') sc += c.wingLeft === (C.cornerSide === 'right') ? 40 : 0; } // (a corner lot: the L opens toward the corner, its storefronts facing both streets)
  if (vault) notes.push('No room for a ' + acres(pondNeed) + '-acre detention pond with the building and its parking: the stormwater (about ' + S.stormOf(pl).volume.toFixed(2) + ' acre-feet) goes in underground vaults under the parking.');
  const recipe = { pf: true, deep: !!F.deep, align: F.align || 'main', pat: c.pat, ...(c.pad ? { pad: { sg: c.pad.sg, form: c.pad.form, wing: c.pad.wing, turn: !!c.pad.turn, front: !!c.pad.front } } : {}), D: c.D, pondAt: c.pondAt, at: c.at || 'center', floors, o: { pondAt: c.pondAt || 'none', shift: c.pat + (c.outer ? '|o' : '') + (c.half ? '|h' : '') + (c.win ? '|' + (c.at || 'center') : '') } }; // (o: what lib/planruns.mjs knows a layout by across a re-solve)
  return { openEnds: !!X.openOK, label: c.pad ? 'Building at the back' + (r.dt ? ', drive-thru round it' : ', drive round it') : null, a: { F, st: { gfa, footprint: m.footprint, need: m.required, stalls: m.spaces, pond: pondHave, pondNeed, vault }, pre: { surf: m.stalls } }, els, bad: [], cut: fx.cut, recipe, key: c.key, deep: !!F.deep, pondAt: pondHave > 0 ? c.pondAt : 'none', win: c.win ? 1 : null, score: sc, notes, gfa, gM, want, padsN: r.pads?.length || 0, nBl: r.B.filter(e => !e.pad).length, svc: r.service.length > 0, briefOK: !X.brief || (want == null || gM >= want * 0.97) && (r.pads?.length || 0) >= (X.brief.pads || 0) && r.B.filter(e => !e.pad).length >= X.brief.buildings.length && (!X.brief.serviceDrive || r.service.length > 0), parked: m.spaces >= m.required, ok: !dead && !mouth && !far && m.spaces >= m.required, m, dead, mouth, far, prog, floors, bind };
}
