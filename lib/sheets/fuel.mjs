// Fuel canopy and fuel system sheets of the plan set (lib/planset.mjs RENDERERS), for a plan with a gas station: F-001
// notes, schedules and separation checks, F-101 the fuel system plan (the underground tanks, product piping to each
// dispenser, vents, fills, monitoring wells, the emergency shutoff), F-102 hazardous areas and the canopy's electrical
// (NEC 514 classified areas, dispenser and pump power, the canopy lights), F-201 the canopy plan and reflected ceiling,
// F-301 canopy elevations and a section, F-401 canopy foundation and framing, F-501 fuel system and canopy details.
// The c-store and a car wash are buildings and get the building sheets (A, S, M, P, E, FP) like any other; these are
// what a fuel retailer's set adds for the canopy, the pumps and the tanks.
//
// Everything is drawn from the plan's own canopy (its size, pumps, rows and which way the islands run), tank pad and
// store, in the station's frame: the canopy's long side across the sheet, the street at the bottom, the store behind.
// Tank sizes, products, pipe routes, member sizes and footings are SCHEMATIC rules of thumb, labelled for the fuel
// retailer's engineer, the canopy manufacturer and the petroleum contractor to replace. No DOM, no network.
import * as S from '../siteplan.mjs';
import { scaleBar } from '../sitesheet.mjs';
import { esc, f0, f1, PT, MAIN, side, engScale, archScale, viewTitle, table, notes, at, svg, line, rect, circle, path, poly, pline, dim, ftIn, n, AREA } from '../sheetkit.mjs';

const INK = '#1b1e1f', GREY = '#8d9290', PALE = '#d5d8d6', RED = '#c0392b';
const PROD = [ // the products, their tanks' tags and how their pipes are drawn
  { key: 'reg', name: 'Regular unleaded (87)', short: 'REG', col: '#1f6fb5', dash: '' },
  { key: 'prem', name: 'Premium unleaded (93)', short: 'PREM', col: '#b5443a', dash: '10 4' },
  { key: 'dsl', name: 'Diesel (ULSD)', short: 'DSL', col: '#2c8a4b', dash: '12 3 3 3' }];
const VENT = { col: '#7a5aa6', dash: '3 3' }, ELEC = { col: '#c2731a', dash: '14 4' };
const TANK_SIZES = [4000, 6000, 8000, 10000, 12000, 15000, 20000];

// ---------- the station in its own frame ----------
// local feet: x along the canopy's long side, y from the street (negative) toward the store (positive), the canopy's
// centre at 0,0. null when the plan has no canopy.
export function stationOf(plan) {
  const els = plan.elements || [], cv = els.find(e => e.kind === 'canopy'); if (!cv) return null;
  const lotted = els.some(e => e.lot === 'fuel'), mine = e => !lotted || e.lot === 'fuel';
  const store = els.find(e => e.kind === 'building' && e.use === 'fuel' && S.fuelKind(e) === 'store' && mine(e)), wash = els.find(e => e.kind === 'building' && e.use === 'fuel' && S.fuelKind(e) === 'wash' && mine(e));
  const tanks = els.find(e => e.kind === 'tanks' && mine(e));
  let a = (cv.rot || 0) + (cv.w >= cv.d ? 0 : 90);
  const at0 = p => S.rotPt([p[0] - cv.x, p[1] - cv.y], -a);
  if (store && at0([store.x, store.y])[1] < 0) a += 180;
  const L = p => S.rotPt([p[0] - cv.x, p[1] - cv.y], -a), back = p => { const q = S.rotPt(p, a); return [q[0] + cv.x, q[1] + cv.y]; };
  const bx = pts => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), pts }; };
  const of = e => e ? bx(S.outline(e).map(L)) : null, W = Math.max(cv.w, cv.d), D = Math.min(cv.w, cv.d);
  const lotRing = (plan.zones || []).find(z => z.use === 'fuel' && z.ring?.length >= 3)?.ring || plan.ring;
  const parts = S.canopy3d(cv), isl = S.pumpsOf(cv).map((q, i) => ({ ...bx(S.corners(q).map(L)), i, c: L([q.x, q.y]) }));
  const cols = parts.filter(p => p.part === 'column').map(p => bx(p.ring.map(L))), mpds = parts.filter(p => p.part === 'mpd').map(p => bx(p.ring.map(L)));
  const rowsY = [...new Set(isl.map(q => Math.round(q.c[1] * 2) / 2))].sort((p, q) => p - q);
  const core = [cv, store, wash, tanks].filter(Boolean).map(e => bx(S.outline(e).map(L))), cb = { x0: Math.min(...core.map(b => b.x0)) - 60, y0: Math.min(...core.map(b => b.y0)) - 60, x1: Math.max(...core.map(b => b.x1)) + 60, y1: Math.max(...core.map(b => b.y1)) + 60 }; // (the paving round the station, not the whole site's)
  const near = els.filter(e => mine(e) && ['drive', 'parking'].includes(e.kind)).map(e => ({ e, ...bx(S.outline(e).map(L)) })).filter(q => q.x1 > cb.x0 && q.x0 < cb.x1 && q.y1 > cb.y0 && q.y0 < cb.y1).map(q => ({ ...q, ...bx(q.pts.map(([x, y]) => [Math.max(cb.x0, Math.min(cb.x1, x)), Math.max(cb.y0, Math.min(cb.y1, y))])) }));
  return { plan, cv, a, L, back, W, D, islands: isl.sort((p, q) => p.c[1] - q.c[1] || p.c[0] - q.c[0]).map((q, i) => ({ ...q, no: i + 1 })), cols, mpds, rowsY, across: cv.islands === 'across', pumps: cv.pumps || isl.length,
    store: of(store), storeE: store, wash: of(wash), washE: wash, tank: of(tanks), tankE: tanks, lot: bx(lotRing.map(L)), lotPts: lotRing.map(L), near, H: S.FUEL.canopyH };
}

// the tanks laid out in the pad: as many 12,000-gallon-class tanks as there are products, side by side along the pad's
// long side, each with its submersible pump (STP) sump at the end toward the canopy and its fill and gauge at the other
export function tanksOf(st) {
  const p = st.tank; if (!p) return [];
  const along = p.x1 - p.x0 >= p.y1 - p.y0, Lp = along ? p.x1 - p.x0 : p.y1 - p.y0, Sp = along ? p.y1 - p.y0 : p.x1 - p.x0, n0 = PROD.length;
  const dia = Math.max(6, Math.min(10, (Sp - 3 - (n0 - 1) * 1.5) / n0)), len = Math.max(12, Lp - 6), gal = Math.PI * (dia / 2) ** 2 * len * 7.48, cap = TANK_SIZES.filter(v => v <= gal).pop() || TANK_SIZES[0];
  const towardCanopy = along ? (Math.abs(p.x0) < Math.abs(p.x1) ? -1 : 1) : (Math.abs(p.y0) < Math.abs(p.y1) ? -1 : 1); // (which end of the tank faces the canopy)
  return PROD.map((pr, i) => {
    const s = (along ? p.y0 : p.x0) + 1.5 + dia / 2 + i * (dia + 1.5), m = (along ? (p.x0 + p.x1) : (p.y0 + p.y1)) / 2, pt = (u, v) => along ? [u, v] : [v, u];
    const end = t => pt(m + t * len / 2, s), stp = end(towardCanopy * 0.82), fill = end(-towardCanopy * 0.82), atg = end(-towardCanopy * 0.45), vent = end(-towardCanopy * 0.62);
    const r = along ? { x0: m - len / 2, y0: s - dia / 2, x1: m + len / 2, y1: s + dia / 2 } : { x0: s - dia / 2, y0: m - len / 2, x1: s + dia / 2, y1: m + len / 2 };
    return { tag: 'T-' + (i + 1), prod: pr, dia, len, gal: Math.round(gal), cap, ...r, stp, fill, atg, vent, along };
  });
}
// where the rest of the fuel system goes: the vent risers (beside the store's side wall nearest the tanks, toward its back
// corner), the emergency shutoff (on the store's front wall), the dispensers each product reaches (diesel at the end
// dispensers), the conduit from the store to the canopy
export function systemOf(st) {
  const T = tanksOf(st), s = st.store, disp = st.islands.map(q => ({ ...q, c: q.c })), endX = st.cv && st.W / 2;
  const tc = st.tank ? [(st.tank.x0 + st.tank.x1) / 2, (st.tank.y0 + st.tank.y1) / 2] : [st.W / 2 + 30, 0], padSide = Math.sign(tc[0]) || 1;
  const vent = s ? [padSide > 0 ? s.x1 + 5 : s.x0 - 5, s.y1 - 6] : [tc[0], tc[1] + 30];
  const dd = (p, q) => Math.hypot(q.c[0] - p[0], q.c[1] - p[1]), fits = E => disp.every(q => E.some(p => dd(p, q) <= 100)) && E.every(p => disp.every(q => dd(p, q) >= 20)), worst = E => Math.max(...disp.map(q => Math.min(...E.map(p => dd(p, q)))));
  const wall = s ? Array.from({ length: 9 }, (_, i) => [s.x0 + (s.x1 - s.x0) * (i + 1) / 10, s.y0 - 1]) : [[0, st.D / 2 + 30]], posts = [-1, 1].flatMap(sd => [[sd * (st.W / 2 + 24), -st.D / 2 - 6], [sd * (st.W / 2 + 24), st.D / 2 + 6]]); // (a remote ESO on a post past an end of the canopy)
  const mid = [0, -st.W / 4, st.W / 4].map(x => [x, st.D / 2 + S.FUEL.back + 3]); // (on a post at the edge of the store's parking row, behind the canopy's back lane)
  let esos = wall.filter(p => fits([p])).sort((p, q) => worst([p]) - worst([q])).slice(0, 1);
  if (!esos.length) esos = mid.filter(p => fits([p])).slice(0, 1);
  if (!esos.length) { // the store's and one post past an end of the canopy, else one past each end, else the best there is
    const sets = [...wall.flatMap(a => posts.concat(mid).map(b => [a, b])), ...wall.flatMap(a => posts.slice(0, 2).flatMap(b => posts.slice(2).map(c => [a, b, c])))];
    esos = sets.filter(fits).sort((p, q) => p.length - q.length || worst(p) - worst(q))[0] || [wall.sort((p, q) => worst([p]) - worst([q]))[0]]; }
  const eso = esos[0], onWall = s && Math.abs(eso[1] - (s.y0 - 1)) < 0.1;
  const xs = disp.map(q => q.c[0]).concat(disp.length ? [] : [0]), lo = Math.min(...xs), hi = Math.max(...xs), dsl = disp.filter(q => Math.abs(q.c[0] - (padSide > 0 ? hi : lo)) < 1); // (diesel at the dispensers nearest the tanks)
  const elec = s ? [padSide > 0 ? s.x1 - 6 : s.x0 + 6, s.y0 + 6] : [0, st.D / 2 + 40]; // the store's electrical room: its front corner toward the canopy's tank side (schematic)
  const near = disp.map(q => Math.min(...esos.map(p => dd(p, q)))), all = disp.flatMap(q => esos.map(p => dd(p, q)));
  return { tanks: T, disp, dsl: new Set(dsl.map(q => q.no)), vent, eso, esos, onWall, esoNear: all.length ? Math.min(...all) : 0, esoFar: near.length ? Math.max(...near) : 0, elec, padSide, header: padSide > 0 ? st.W / 2 + 4 : -st.W / 2 - 4 };
}
// separation checks (NFPA 30A): each { item, need, have, ok }
export function checksOf(st) {
  const sys = systemOf(st), segD = (p, R) => Math.min(...R.map((a, i) => S.segDist(p, a, R[(i + 1) % R.length])));
  const dispC = sys.disp.flatMap(q => [[q.x0, q.y0], [q.x1, q.y0], [q.x1, q.y1], [q.x0, q.y1]]), toLot = dispC.length ? Math.min(...dispC.map(p => segD(p, st.lotPts))) : 0;
  const storeR = st.store ? [[st.store.x0, st.store.y0], [st.store.x1, st.store.y0], [st.store.x1, st.store.y1], [st.store.x0, st.store.y1]] : null, toBldg = storeR && dispC.length ? Math.min(...dispC.map(p => segD(p, storeR))) : null;
  const fills = sys.tanks.map(t => t.fill), fillB = storeR && fills.length ? Math.min(...fills.map(p => segD(p, storeR))) : null, ventB = storeR ? segD(sys.vent, storeR) : null;
  const out = [
    { item: 'Dispensers to property lines', need: '10 ft min. (NFPA 30A 6.2.1)', have: toLot, ok: toLot >= 10 },
    ...(toBldg != null ? [{ item: 'Dispensers to the store', need: '10 ft min. (NFPA 30A 6.2.1)', have: toBldg, ok: toBldg >= 10 }] : []),
    { item: 'Emergency shutoff' + (sys.esos.length > 1 ? 's (' + sys.esos.length + ')' : '') + ' to the dispensers', need: '20–100 ft (NFPA 30A 6.7.1)', have: sys.esoNear, have2: sys.esoFar, ok: sys.esoNear >= 20 && sys.esoFar <= 100 },
    ...(fillB != null ? [{ item: 'Tank fills to the store', need: '5 ft min. from openings (typ.)', have: fillB, ok: fillB >= 5 }] : []),
    ...(ventB != null ? [{ item: 'Vent risers to the store', need: '5 ft min. from openings; 12 ft above grade', have: ventB, ok: ventB >= 4.9 }] : [])];
  return out;
}

// ---------- drawing ----------
// a view of local feet: box [x0, y0, x1, y1] fitted in wIn x hIn inches at an engineering or architectural scale
function viewOf(b, wIn, hIn, arch = false) {
  const sc = arch ? archScale(b[2] - b[0], b[3] - b[1], wIn, hIn) : engScale(b[2] - b[0], b[3] - b[1], wIn, hIn), k = sc.k, X = p => [(p[0] - b[0]) * k, (b[3] - p[1]) * k];
  return { k, sc, X, P: pts => pts.map(X), W: (b[2] - b[0]) * k, H: (b[3] - b[1]) * k, R: (x0, y0, x1, y1) => { const a = X([x0, y1]); return [a[0], a[1], (x1 - x0) * k, (y1 - y0) * k]; } };
}
const T = (x, y, s, size = 8, o = {}) => '<text x="' + n(x) + '" y="' + n(y) + '" font-size="' + n(size) + '" font-family="Arial, Helvetica, sans-serif" text-anchor="' + (o.anchor || 'middle') + '" dominant-baseline="central" fill="' + (o.fill || INK) + '"' + (o.bold ? ' font-weight="700"' : '') +
  (o.halo === false ? '' : ' paint-order="stroke" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"') + (o.rot ? ' transform="rotate(' + n(o.rot) + ' ' + n(x) + ' ' + n(y) + ')"' : '') + '>' + esc(s) + '</text>';
const R = (V, b, a) => { const r = V.R(b.x0, b.y0, b.x1, b.y1); return rect(r[0], r[1], r[2], r[3], a); };
const lead = (x1, y1, x2, y2, s, size = 8, anchor = 'start') => line(x1, y1, x2, y2, 'stroke="' + INK + '" stroke-width=".7"') + circle(x1, y1, 1.6, 'fill="' + INK + '"') + T(x2 + (anchor === 'start' ? 3 : anchor === 'end' ? -3 : 0), y2, s, size, { anchor });
const pipe = (V, pts, col, dash, w = 1.6) => pline(V.P(pts), 'fill="none" stroke="' + col + '" stroke-width="' + w + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' stroke-linejoin="round"');
const blk = (title, html) => '<div class="blk"><div class="bh">' + esc(title) + '</div>' + html + '</div>';
const tbl = (title, head, rows, right = []) => '<div class="blk">' + table(title, head, rows, right) + '</div>';
const warn = s => '<div class="blk"><div class="warnbox"><b>SCHEMATIC.</b> ' + esc(s) + '</div></div>';
const sw = (body, label) => '<div class="lg2">' + svg(44, 16, body) + '<span>' + esc(label) + '</span></div>';
function discBlocks(ctx, label) {
  const d = ctx.disc?.fuel || {}, nn = (Array.isArray(d.notes) ? d.notes : []).filter(x => typeof x === 'string' && x.trim()).slice(0, 12);
  const cr = Array.isArray(d.criteria) ? d.criteria.filter(c => c && c.item).slice(0, 14).map(c => [String(c.item), String(c.value ?? '')]) : [];
  return (cr.length ? tbl(label + ' design criteria', null, cr) : '') + notes(label + ' notes', nn);
}
const none = () => '<p class="muted">This option has no fuel canopy.</p>';
// the box the station's plan sheets show: the canopy, the tank pad, the store and the station's paving, with a margin
function stationBox(st, pad = 25) {
  const B = [{ x0: -st.W / 2, y0: -st.D / 2, x1: st.W / 2, y1: st.D / 2 }, st.tank, st.store, st.wash, ...st.near].filter(Boolean);
  const box = [Math.min(...B.map(b => b.x0)), Math.min(...B.map(b => b.y0)), Math.max(...B.map(b => b.x1)), Math.max(...B.map(b => b.y1))];
  const lb = st.lot; return [Math.max(box[0], lb.x0) - pad, Math.max(box[1], lb.y0) - pad, Math.min(box[2], lb.x1) + pad, Math.min(box[3], lb.y1) + pad];
}
// the station in grey under a sheet's own layer: paving, the store (and car wash), the canopy outline, islands, the tank
// pad and the property line
function base(st, V, o = {}) {
  const out = [];
  for (const q of st.near) out.push(poly(V.P(q.pts), 'fill="#f1f1ef" stroke="' + PALE + '" stroke-width=".6"'));
  for (const b of [st.store, st.wash]) if (b) out.push(poly(V.P(b.pts), 'fill="#e4e4e1" stroke="#6b7174" stroke-width="1.2"'));
  if (st.store) { const c = V.X([(st.store.x0 + st.store.x1) / 2, (st.store.y0 + st.store.y1) / 2]); out.push(T(c[0], c[1], 'C-STORE', 10, { bold: true, fill: '#4d5457' })); }
  if (st.wash) { const c = V.X([(st.wash.x0 + st.wash.x1) / 2, (st.wash.y0 + st.wash.y1) / 2]); out.push(T(c[0], c[1], 'CAR WASH', 9, { bold: true, fill: '#4d5457' })); }
  if (st.tank && o.pad !== false) out.push(R(V, st.tank, 'fill="#faf6ea" stroke="#8a6d1f" stroke-width="1" stroke-dasharray="6 3"'));
  out.push(R(V, { x0: -st.W / 2, y0: -st.D / 2, x1: st.W / 2, y1: st.D / 2 }, 'fill="none" stroke="' + (o.canopy || '#6b7174') + '" stroke-width="' + (o.canopyW || 1) + '"' + (o.canopyDash === false ? '' : ' stroke-dasharray="10 4"')));
  for (const q of st.islands) out.push(R(V, q, 'fill="#e9e9e6" stroke="#6b7174" stroke-width=".8"'));
  out.push(poly(V.P(st.lotPts), 'fill="none" stroke="' + RED + '" stroke-width="1.4" stroke-dasharray="16 4 3 4"'));
  return out.join('');
}
// a plan sheet: the drawing in the main area, its title and scale bar, the side column
function planPage(sh, V, body, sideHtml, title, sub = '') {
  sh.scale = V.sc.label;
  return at(MAIN.x, MAIN.y, MAIN.w, MAIN.h - 64, svg(V.W, V.H, body), 'display:flex;align-items:center;justify-content:center') +
    at(MAIN.x, MAIN.y + MAIN.h - 52, MAIN.w, 52, '<div style="display:flex;align-items:center;gap:28pt;height:100%">' + viewTitle(1, title, V.sc.label + ' on 24" × 36"' + (sub ? ' · ' + sub : '')) + (V.sc.ft >= 10 ? scaleBar(V.sc.ft) : '') + '</div>') + side(sideHtml);
}
const STREET = (V, b) => { const y = V.X([0, b[1]])[1] - 4; return T(V.W / 2, y, '← STREET (CANOPY SIDE) →', 9, { bold: true, fill: '#6b7174' }); };

// ---------- F-001 notes, schedules, checks ----------
function fNotes(ctx, sh) {
  const st = stationOf(ctx.plan); if (!st) return none(); sh.scale = 'N.T.S.';
  const sys = systemOf(st), ch = checksOf(st), nd = st.islands.length, fu = (S.normalizeProgram(ctx.plan.program).zones || []).find(z => z.use === 'fuel')?.fuel || S.normalizeProgram(ctx.plan.program).fuel || {};
  const tanks = sys.tanks.map(t => [t.tag, t.prod.name, f0(t.cap) + ' gal', ftIn(t.dia) + ' dia. × ' + ftIn(t.len), 'Double-wall fiberglass (UL 1316) or steel-composite (UL 58 / 1746), interstitial monitoring']);
  const disp = st.islands.map(q => ['D-' + q.no, 'MPD, ' + (sys.dsl.has(q.no) ? '3 grades + diesel' : '3 grades'), (2 * q.no - 1) + ' / ' + 2 * q.no, sys.dsl.has(q.no) ? 'REG, PREM, DSL' : 'REG, PREM (mid-grade blended)']);
  const eq = [['STP-1 to STP-' + sys.tanks.length, 'Submersible turbine pump, one per tank, variable speed, 3/4–1-1/2 HP; line leak detector', 'In each tank’s STP sump'],
    ['ATG', 'Automatic tank gauge console with in-tank probes, sump and interstitial sensors', 'In the c-store (back room)'],
    ['ESO', 'Emergency fuel shutoff, push-button, signed EMERGENCY FUEL SHUTOFF; another at the cashier', (sys.esos.length > 2 ? 'Store front wall and posts past the canopy\'s ends, ' : sys.esos.length > 1 ? 'Store front wall and a post, ' : sys.onWall ? 'Store front wall, ' : 'A post at the parking row behind the canopy, ') + f0(sys.esoNear) + '–' + f0(sys.esoFar) + ' ft from the dispensers'],
    ['Piping', '2" double-wall flexible product piping (UL 971), contained sumps at each end', 'Trench, 18" min. cover'],
    ['Spill / overfill', '5 gal min. spill bucket at each fill; overfill valve in the drop tube at 95%', 'Each tank fill'],
    ['Vents', '2" vent from each tank to a riser 12 ft min. above grade, pressure / vacuum cap where Stage I applies', 'Beside the store, see F-101'],
    ['Under-dispenser containment', 'Sump under each dispenser with sensor; emergency shear valves on each product line', 'Each island']];
  const yes = ok => ok ? '✓' : '✗ review';
  const checks = ch.map(c => [c.item, c.need, c.have2 != null ? f0(c.have) + '–' + f0(c.have2) + ' ft' : f1(c.have) + ' ft', yes(c.ok)]);
  const haz = [['Dispenser', 'Inside the enclosure and its sump', 'Within 20 ft horizontally of the enclosure, up to 18" above grade'], ['Tank fill (tight fill)', 'Within the fill box / pit', 'Within 5 ft horizontally, up to 18" above grade'],
    ['Vent (upward)', 'Within 3 ft of the open end', 'Between 3 and 5 ft of the open end'], ['Sumps, pits below grade', 'Any pit or box below grade within a classified area', '—']];
  const L = '<div style="display:flex;gap:22pt;height:100%">', col = w => '<div style="width:' + w + 'pt">';
  const W1 = (AREA.w - 44) / 3;
  return at(AREA.x, AREA.y, AREA.w, AREA.h, L +
    col(W1) + tbl('Station summary', null, [['Pumps (MPDs)', nd + ' · ' + 2 * nd + ' fueling positions'], ['Islands', st.rowsY.length + ' row' + (st.rowsY.length > 1 ? 's' : '') + ', ' + (st.across ? 'across the street (cars pull in toward the store)' : 'along the street (cars pull through)')], ['Canopy', ftIn(st.W) + ' × ' + ftIn(st.D) + ' = ' + f0(st.W * st.D) + ' sf, ' + ftIn(st.H) + ' clear'], ['Tanks', sys.tanks.length + ' × ' + f0(sys.tanks[0]?.cap || 0) + ' gal (' + f0(sys.tanks.reduce((t, x) => t + x.cap, 0)) + ' gal)'], ['Car wash', fu.wash ? 'Yes (building sheets)' : 'No'], ['Store', st.store ? f0((st.store.x1 - st.store.x0) * (st.store.y1 - st.store.y0)) + ' sf (building sheets)' : '—']]) +
      tbl('Underground storage tanks', ['Tag', 'Product', 'Capacity', 'Size', 'Construction'], tanks) + tbl('Dispensers', ['Tag', 'Type', 'Positions', 'Products'], disp) +
    '</div>' + col(W1) + tbl('Fuel system equipment', ['Item', 'Description', 'Where'], eq) +
      tbl('Separation checks (from this plan)', ['Check', 'Requirement', 'This plan', ''], checks) +
      tbl('Hazardous (classified) locations — NEC 514 / NFPA 30A Table 8.3.1 (extract)', ['Source', 'Class I, Div. 1', 'Class I, Div. 2'], haz) +
    '</div>' + col(W1) + notes('Codes and rules (basis of design)', ['NFPA 30A, Code for Motor Fuel Dispensing Facilities and Repair Garages, and NFPA 30, editions adopted by the authority having jurisdiction', 'International Fire Code Chapter 23 (Motor Fuel-Dispensing Facilities) as adopted locally', 'NFPA 70 (NEC) Article 514', 'TCEQ 30 TAC Chapter 334 (underground storage tanks): registration, 30-day construction notice, installer and on-site supervisor licensing', 'EPA 40 CFR Part 280; PEI RP100 (installation) and RP1200 (testing)', 'TCEQ 30 TAC Chapter 115 Stage I vapor recovery where the county requires it: confirm for the site'], false) +
      notes('General notes', ['Tank sizes, products and dispenser models are placeholders: the fuel retailer confirms them before design.', 'Product piping, vents and conduit routes are schematic; the petroleum contractor lays them out to the tanks, sumps and dispensers chosen, with continuous slope back to the tanks.', 'Tanks set on a level bed in an excavation sized by the manufacturer, anchored against buoyancy (deadmen or a hold-down slab), 3 ft min. cover with a reinforced concrete pad over.', 'Every sump, spill bucket and the interstitial spaces are monitored by the ATG; line leak detectors on each STP.', 'The canopy, its columns, footings and lighting are designed by the canopy manufacturer\'s Texas-registered engineer (F-401).', 'Classified areas govern the wiring under and around the canopy (F-102): seals at the dispensers and at the boundaries, rigid conduit below grade per NEC 514.8.', 'Fire extinguishers within 75 ft of each dispenser (IFC 2305.5); "no smoking" and "stop motor" signs at each island.', 'Crash protection (bollards or 6" curbed islands) at every dispenser and canopy column.']) +
      discBlocks(ctx, 'Fuel system') + warn('Drawn from the site plan by rules of thumb; the fuel retailer\'s engineer and the petroleum contractor\'s drawings govern.') +
    '</div></div>');
}

// ---------- F-101 fuel system plan ----------
function fPlan(ctx, sh) {
  const st = stationOf(ctx.plan); if (!st) return none();
  const sys = systemOf(st), b = stationBox(st, 30), V = viewOf(b, MAIN.w / PT, (MAIN.h - 64) / PT), X = V.X, o = [base(st, V)];
  // the tanks: each tank, its STP sump, its fill with the spill bucket, its gauge; monitoring wells at the pad corners
  for (const t of sys.tanks) {
    o.push(R(V, t, 'fill="#fff" stroke="' + t.prod.col + '" stroke-width="1.6"'));
    const c = X([(t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2]); o.push(T(c[0], c[1], t.tag + ' · ' + f0(t.cap / 1000) + 'K ' + t.prod.short, Math.min(9, V.k * t.dia * 0.6), { bold: true, fill: t.prod.col }));
    const s = X(t.stp), f = X(t.fill), g = X(t.atg); o.push(circle(s[0], s[1], Math.max(4, V.k * 2), 'fill="#fff" stroke="' + INK + '" stroke-width="1"'), circle(f[0], f[1], Math.max(3, V.k * 1.2), 'fill="' + t.prod.col + '" stroke="' + INK + '" stroke-width=".8"'), rect(g[0] - 2.5, g[1] - 2.5, 5, 5, 'fill="' + INK + '"'));
  }
  if (st.tank) for (const p of [[st.tank.x0 + 2, st.tank.y0 + 2], [st.tank.x1 - 2, st.tank.y0 + 2], [st.tank.x1 - 2, st.tank.y1 - 2], [st.tank.x0 + 2, st.tank.y1 - 2]]) { const q = X(p); o.push(circle(q[0], q[1], 3.2, 'fill="#fff" stroke="' + INK + '" stroke-width="1"'), line(q[0] - 3.2, q[1], q[0] + 3.2, q[1], 'stroke="' + INK + '" stroke-width=".8"')); }
  // product piping: from each STP out to a header beyond the canopy's end on the tank side, along each row of islands, a
  // branch to each dispenser that takes that product
  sys.tanks.forEach((t, k) => {
    const off = (k - 1) * 1.6, hx = sys.header + sys.padSide * k * 1.6;
    st.rowsY.forEach(ry => {
      const y = ry + off, D = st.islands.filter(q => Math.abs(q.c[1] - ry) < 1 && (t.prod.key !== 'dsl' || sys.dsl.has(q.no))); if (!D.length) return;
      const far = sys.padSide > 0 ? Math.min(...D.map(q => q.c[0])) : Math.max(...D.map(q => q.c[0]));
      o.push(pipe(V, [t.stp, [t.stp[0], y], [hx, y], [far, y]].filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 0.1), t.prod.col, t.prod.dash));
      for (const q of D) { const a = X([q.c[0], y]); o.push(circle(a[0], a[1], 1.8, 'fill="' + t.prod.col + '"')); }
    });
  });
  // vents: from each tank's fill end to the riser beside the store
  for (const t of sys.tanks) o.push(pipe(V, [t.vent, [t.vent[0], sys.vent[1] - 2 - sys.tanks.indexOf(t) * 1.2], [sys.vent[0], sys.vent[1] - 2 - sys.tanks.indexOf(t) * 1.2], sys.vent], VENT.col, VENT.dash, 1.2));
  { const v = X(sys.vent); o.push(circle(v[0], v[1], 5, 'fill="#fff" stroke="' + VENT.col + '" stroke-width="1.6"'), T(v[0], v[1] - 14, 'VR', 9, { bold: true, fill: VENT.col })); }
  // dispensers numbered, the emergency shutoff, extinguishers
  for (const q of st.islands) { const c = X(q.c); o.push(T(c[0], c[1] + Math.max(10, (q.y1 - q.y0) * V.k / 2 + 9), 'D-' + q.no, 9, { bold: true })); }
  for (const m of st.mpds) o.push(R(V, m, 'fill="' + INK + '" stroke="none"'));
  sys.esos.forEach((p, i) => { const e = X(p); o.push(rect(e[0] - 5, e[1] - 5, 10, 10, 'fill="' + RED + '" stroke="' + INK + '" stroke-width=".8"'), T(e[0], e[1] + 13, 'ESO-' + (i + 1) + (i || !sys.onWall ? ' (ON A POST)' : ''), 9, { bold: true, fill: RED })); });
  const Lb = [], cx = V.W - 8; let ly = 30;
  const callout = (p, s) => { const q = X(p); Lb.push(lead(q[0], q[1], Math.min(cx - 160, q[0] + 70), q[1] - 30 - (Lb.length % 3) * 12, s)); };
  if (sys.tanks[0]) { callout(sys.tanks[0].stp, 'STP SUMP (TYP.)'); callout(sys.tanks[0].fill, 'FILL W/ SPILL BUCKET (TYP.)'); }
  callout(sys.vent, "VENT RISERS, 12'-0\" MIN. ABOVE GRADE");
  o.push(...Lb, STREET(V, b));
  const legend = blk('Legend', PROD.map(p => sw(line(2, 8, 42, 8, 'stroke="' + p.col + '" stroke-width="1.8"' + (p.dash ? ' stroke-dasharray="' + p.dash + '"' : '')), p.name + ' product line')).join('') +
    sw(line(2, 8, 42, 8, 'stroke="' + VENT.col + '" stroke-width="1.4" stroke-dasharray="' + VENT.dash + '"'), 'Vent line') + sw(circle(22, 8, 5, 'fill="#fff" stroke="' + INK + '"'), 'STP sump') + sw(circle(22, 8, 3, 'fill="#1f6fb5" stroke="' + INK + '"'), 'Fill with spill bucket') +
    sw(rect(19, 5, 6, 6, 'fill="' + INK + '"'), 'Tank gauge (ATG) probe') + sw(circle(22, 8, 3.5, 'fill="#fff" stroke="' + INK + '"') + line(18.5, 8, 25.5, 8, 'stroke="' + INK + '"'), 'Monitoring well') + sw(rect(17, 3, 10, 10, 'fill="' + RED + '"'), 'Emergency fuel shutoff (ESO)') +
    sw(line(2, 8, 42, 8, 'stroke="' + RED + '" stroke-width="1.6" stroke-dasharray="16 4 3 4"'), 'Property / outparcel line'));
  const ch = checksOf(st);
  return planPage(sh, V, o.join(''), legend + tbl('Tanks', ['Tag', 'Product', 'Capacity'], sys.tanks.map(t => [t.tag, t.prod.name, f0(t.cap) + ' gal'])) +
    tbl('Checks', null, ch.map(c => [c.item, (c.have2 != null ? f0(c.have) + '–' + f0(c.have2) : f1(c.have)) + ' ft (' + c.need + ')', c.ok ? '✓' : '✗ review'])) +
    notes('Notes', ['Piping routes are schematic: double-wall flexible piping in a trench, continuous slope back to the tanks, entering each dispenser sump through a test boot.', 'Diesel is piped to the dispensers nearest the tanks (D-' + [...sys.dsl].join(', D-') + '); confirm with the fuel retailer.', 'Vents run to risers 12 ft min. above grade, 5 ft min. from building openings and air intakes.', 'Tanks set in the excavation per the manufacturer and PEI RP100; the pad over them is reinforced concrete, kept clear of parking.', 'The tanker parks beside the pad on the drive with the fills, clear of the dispensers.']) +
    warn('Pipe sizes, routes and equipment are placeholders for the petroleum contractor\'s design.'), 'Fuel system plan', 'Tanks · Product piping · Vents · ESO');
}

// ---------- F-102 hazardous areas and canopy electrical ----------
function fElec(ctx, sh) {
  const st = stationOf(ctx.plan); if (!st) return none();
  const sys = systemOf(st), b = stationBox(st, 30), V = viewOf(b, MAIN.w / PT, (MAIN.h - 64) / PT), X = V.X, o = [];
  // classified areas first, under everything: 20 ft round each dispenser (Div. 2), 5 ft round each fill, 5 ft round the vents
  const zone = (p, r, fill) => { const q = X(p); return circle(q[0], q[1], r * V.k, 'fill="' + fill + '" stroke="none"'); };
  o.push(base(st, V), '<g opacity=".5">' + st.mpds.map(m => zone([(m.x0 + m.x1) / 2, (m.y0 + m.y1) / 2], 20 + Math.max(m.x1 - m.x0, m.y1 - m.y0) / 2, '#efb36b')).join('') + sys.tanks.map(t => zone(t.fill, 5, '#efb36b')).join('') + zone(sys.vent, 5, '#efb36b') + '</g>');
  for (const q of st.islands) o.push(R(V, q, 'fill="none" stroke="#6b7174" stroke-width=".8"'));
  for (const m of st.mpds) o.push(R(V, m, 'fill="#c0392b" stroke="none"'));
  // canopy lights (from F-201) and their circuits; feeders from the store's electrical room to the canopy and the pumps
  const Lt = lightsOf(st); for (const p of Lt.pts) { const q = X(p); o.push(rect(q[0] - 4, q[1] - 4, 8, 8, 'fill="#fff" stroke="' + INK + '" stroke-width=".9"'), line(q[0] - 4, q[1] - 4, q[0] + 4, q[1] + 4, 'stroke="' + INK + '" stroke-width=".6"')); }
  const el = sys.elec, col0 = st.cols.slice().sort((p, q) => Math.hypot((p.x0 + p.x1) / 2 - el[0], (p.y0 + p.y1) / 2 - el[1]) - Math.hypot((q.x0 + q.x1) / 2 - el[0], (q.y0 + q.y1) / 2 - el[1]))[0];
  const cc = col0 ? [(col0.x0 + col0.x1) / 2, (col0.y0 + col0.y1) / 2] : [0, st.D / 2];
  o.push(pipe(V, [el, [el[0], cc[1] + 4], [cc[0], cc[1] + 4], cc], ELEC.col, ELEC.dash, 2));
  st.rowsY.forEach(ry => { const D = st.islands.filter(q => Math.abs(q.c[1] - ry) < 1).sort((p, q) => p.c[0] - q.c[0]); if (D.length) o.push(pipe(V, [[cc[0], ry - 3], [D[0].c[0], ry - 3], [D[D.length - 1].c[0], ry - 3]], ELEC.col, ELEC.dash, 1.4)); });
  for (const t of sys.tanks) o.push(pipe(V, [el, [el[0], t.stp[1] + 2], [t.stp[0], t.stp[1] + 2], t.stp], ELEC.col, '4 3', 1));
  { const e = X(el); o.push(rect(e[0] - 4, e[1] - 9, 8, 18, 'fill="' + INK + '"'), T(e[0] + 10, e[1], 'PANEL "CP" / ATG / STP CONTROLS (IN STORE)', 8, { anchor: 'start' })); }
  sys.esos.forEach((p, i) => { const e = X(p); o.push(rect(e[0] - 5, e[1] - 5, 10, 10, 'fill="' + RED + '"'), T(e[0], e[1] + 13, 'ESO-' + (i + 1), 9, { bold: true, fill: RED })); });
  o.push(STREET(V, b));
  const legend = blk('Legend', sw(circle(22, 8, 7, 'fill="#efb36b" fill-opacity=".5" stroke="none"'), 'Class I, Div. 2 to 18" above grade (Div. 1 inside dispensers, sumps, pits)') + sw(rect(18, 4, 8, 8, 'fill="#fff" stroke="' + INK + '"') + line(18, 4, 26, 12, 'stroke="' + INK + '"'), 'LED canopy light, recessed (CL-1)') +
    sw(line(2, 8, 42, 8, 'stroke="' + ELEC.col + '" stroke-width="2" stroke-dasharray="' + ELEC.dash + '"'), 'Conduit: dispenser power, data, ESO, canopy lights') + sw(line(2, 8, 42, 8, 'stroke="' + ELEC.col + '" stroke-width="1" stroke-dasharray="4 3"'), 'Conduit: STP power and ATG wiring') + sw(rect(17, 3, 10, 10, 'fill="' + RED + '"'), 'Emergency fuel shutoff'));
  const loads = [['Dispensers', st.islands.length + ' × 2 circuits, 120 V', f0(st.islands.length * 1.2) + ' kVA'], ['STPs', sys.tanks.length + ' × 1-1/2 HP, 208/230 V', f0(sys.tanks.length * 2.4) + ' kVA'], ['Canopy lights', Lt.pts.length + ' × ' + Lt.watts + ' W, 277 V', f1(Lt.pts.length * Lt.watts / 1000) + ' kW'], ['ATG, POS, controls', '120 V', '1.5 kVA']];
  return planPage(sh, V, o.join(''), legend + tbl('Canopy and fuel system loads (estimate)', ['Load', 'Circuits', 'Load'], loads, [2]) +
    notes('Notes', ['Classified areas per NEC 514.3 and NFPA 30A Table 8.3.1: wiring in and under them is in threaded rigid metal conduit or PVC-coated RMC below grade per NEC 514.8, with seals at each dispenser and where conduit leaves a classified area (NEC 501.15).', 'Each dispenser: its power, the data loop to the POS, and the emergency shutoff circuit; the ESO de-energizes every dispenser and STP (NFPA 30A 6.7).', 'The canopy lights are on a photocell and time clock through a lighting contactor in the store; the fixtures are listed for wet locations and mounted on the deck above the classified area.', 'Feeders, panel and service sizes follow the store\'s E sheets; this sheet shows the canopy and fuel system additions only.']) +
    warn('Conduit routes and loads are placeholders for the electrical engineer\'s design.'), 'Hazardous areas & canopy electrical', 'NEC 514 classified areas · Power · Lighting');
}

// ---------- F-201 canopy plan and reflected ceiling plan ----------
// the canopy lights: a grid of recessed LED fixtures, about one for every 150 sf
export function lightsOf(st) {
  const nx = Math.max(2, Math.round(st.W / 18)), ny = Math.max(2, Math.round(st.D / 18)), pts = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) pts.push([-st.W / 2 + st.W * (i + 0.5) / nx, -st.D / 2 + st.D * (j + 0.5) / ny]);
  const watts = 120, lm = 15500, fc = pts.length * lm * 0.72 / (st.W * st.D);
  return { pts, nx, ny, watts, lm, fc };
}
function fCanopy(ctx, sh) {
  const st = stationOf(ctx.plan); if (!st) return none();
  const half = (MAIN.h - 64) / 2 - 30, pad = 14, bx = [-st.W / 2 - pad, -st.D / 2 - pad - 6, st.W / 2 + pad, st.D / 2 + pad], V = viewOf(bx, MAIN.w / PT, half / PT, true), X = V.X;
  // 1: canopy plan: the deck edge, the fascia, the islands with their dispensers and columns, the column grid and dimensions
  const p = [R(V, { x0: -st.W / 2, y0: -st.D / 2, x1: st.W / 2, y1: st.D / 2 }, 'fill="#fbfbfa" stroke="' + INK + '" stroke-width="2"'), R(V, { x0: -st.W / 2 + 1.2, y0: -st.D / 2 + 1.2, x1: st.W / 2 - 1.2, y1: st.D / 2 - 1.2 }, 'fill="none" stroke="' + INK + '" stroke-width=".7"')];
  for (const q of st.islands) p.push(R(V, q, 'fill="#e4e4e1" stroke="' + INK + '" stroke-width="1"'));
  for (const m of st.mpds) p.push(R(V, m, 'fill="' + INK + '"'));
  for (const c of st.cols) p.push(R(V, c, 'fill="#6b7174" stroke="' + INK + '" stroke-width="1"'));
  const cxs = [...new Set(st.cols.map(c => Math.round((c.x0 + c.x1) * 5) / 10))].sort((a, b) => a - b), cys = [...new Set(st.cols.map(c => Math.round((c.y0 + c.y1) * 5) / 10))].sort((a, b) => a - b);
  cxs.forEach((x, i) => { const a = X([x, st.D / 2 + 6]), b = X([x, -st.D / 2 - 6]); p.push(line(a[0], a[1], b[0], b[1], 'stroke="#6b7174" stroke-width=".6" stroke-dasharray="12 3 2 3"'), circle(a[0], a[1] - 9, 9, 'fill="#fff" stroke="' + INK + '"'), T(a[0], a[1] - 9, String(i + 1), 9, { bold: true, halo: false })); });
  cys.forEach((y, i) => { const a = X([-st.W / 2 - 6, y]); p.push(line(a[0], a[1], X([st.W / 2 + 6, y])[0], a[1], 'stroke="#6b7174" stroke-width=".6" stroke-dasharray="12 3 2 3"'), circle(a[0] - 9, a[1], 9, 'fill="#fff" stroke="' + INK + '"'), T(a[0] - 9, a[1], String.fromCharCode(65 + i), 9, { bold: true, halo: false })); });
  for (const q of st.islands) { const c = X(q.c); p.push(T(c[0], c[1] - Math.max(9, (q.y1 - q.y0) * V.k / 2 + 8), 'D-' + q.no + ' · ' + (2 * q.no - 1) + '/' + 2 * q.no, 8, { bold: true })); }
  const tl = X([-st.W / 2, -st.D / 2]), br = X([st.W / 2, st.D / 2]);
  p.push(dim(tl[0], tl[1], br[0], tl[1], ftIn(st.W), 26, 9), dim(br[0], tl[1], br[0], br[1], ftIn(st.D), 26, 9));
  for (let i = 1; i < cxs.length; i++) { const a = X([cxs[i - 1], -st.D / 2]), b = X([cxs[i], -st.D / 2]); p.push(dim(a[0], a[1], b[0], a[1], ftIn(cxs[i] - cxs[i - 1]), 12, 7)); }
  // 2: reflected ceiling plan: the deck, the lights, the drains, the fascia sign bands
  const Lt = lightsOf(st), q2 = [R(V, { x0: -st.W / 2, y0: -st.D / 2, x1: st.W / 2, y1: st.D / 2 }, 'fill="#fbfbfa" stroke="' + INK + '" stroke-width="2"')];
  for (let x = -st.W / 2 + 2; x < st.W / 2; x += 2) { const a = X([x, -st.D / 2]), b = X([x, st.D / 2]); q2.push(line(a[0], a[1], b[0], b[1], 'stroke="#e1e3e2" stroke-width=".5"')); }
  for (const c of st.cols) q2.push(R(V, c, 'fill="#6b7174"'));
  for (const pt of Lt.pts) { const q = X(pt), s = 2 * V.k; q2.push(rect(q[0] - s, q[1] - s, 2 * s, 2 * s, 'fill="#fff" stroke="' + INK + '" stroke-width="1"'), line(q[0] - s, q[1] - s, q[0] + s, q[1] + s, 'stroke="' + INK + '" stroke-width=".6"'), line(q[0] - s, q[1] + s, q[0] + s, q[1] - s, 'stroke="' + INK + '" stroke-width=".6"')); }
  { const a = X([-st.W / 2, st.D / 2]); q2.push(T(a[0] + 6, a[1] + 12, 'DECK SLOPES 1/4"/FT TO INTERNAL GUTTER; DOWNSPOUTS INSIDE THE COLUMNS TO STORM', 8, { anchor: 'start' })); }
  const vh = V.H * PT / 96, gap = 60; // (pt: the drawing's height on the page)
  sh.scale = V.sc.label;
  return at(MAIN.x, MAIN.y, MAIN.w, vh + 10, svg(V.W, V.H, p.join('')), 'display:flex;justify-content:center') + at(MAIN.x, MAIN.y + vh + 12, MAIN.w, 44, viewTitle(1, 'Canopy plan', V.sc.label)) +
    at(MAIN.x, MAIN.y + vh + gap + 20, MAIN.w, vh + 10, svg(V.W, V.H, q2.join('')), 'display:flex;justify-content:center') + at(MAIN.x, MAIN.y + 2 * vh + gap + 32, MAIN.w, 44, viewTitle(2, 'Canopy reflected ceiling plan', V.sc.label)) +
    side(tbl('Canopy', null, [['Size', ftIn(st.W) + ' × ' + ftIn(st.D) + ' (' + f0(st.W * st.D) + ' sf)'], ['Clear height', ftIn(st.H) + ' to the underside of the deck'], ['Fascia', "3'-6\" band round the edge, illuminated, brand by the fuel retailer"], ['Columns', st.cols.length + ' × HSS 12 × 12, one at the end of each island'], ['Pump islands', st.islands.length + ', ' + (st.across ? 'across the street' : 'along the street') + ', 6" curb, 4\' wide']]) +
      tbl('Light fixture schedule', ['Tag', 'Description', 'Qty'], [['CL-1', 'LED canopy light, recessed, ' + Lt.watts + ' W, about ' + f0(Lt.lm) + ' lm, 5000 K, wet location', String(Lt.pts.length)]], [2]) +
      tbl('Lighting estimate', null, [['Average under the canopy', 'about ' + f0(Lt.fc) + ' fc (maintained, 0.72 light loss)'], ['Target', '20–30 fc typical for fueling areas (IES); check the local light-trespass rules']]) +
      notes('Notes', ['Columns sit on the islands, protected by the 6" island curb and bollards at each end.', 'The canopy deck, fascia, columns and footings are a pre-engineered package by the canopy manufacturer (F-401).', 'Dispensers bolt to their under-dispenser sumps set in the islands; the column bases stay clear of the sumps.', 'The fascia is the fuel retailer\'s brand band; its signs need a separate sign permit.']) +
      warn('Sizes and fixture counts are planning estimates.'));
}

// ---------- F-301 canopy elevations and section ----------
function fElev(ctx, sh) {
  const st = stationOf(ctx.plan); if (!st) return none();
  const H = st.H, top = H + 3.5, hIn = (MAIN.h - 64) / PT / 3 - 0.6, wIn = MAIN.w / PT;
  const elevation = (span, cols, items, label, no) => {
    const bx = [-span / 2 - 12, -9, span / 2 + 12, top + 6], V = viewOf(bx, wIn, hIn, true), X = V.X, o = [];
    o.push(line(...X([-span / 2 - 12, 0]), ...X([span / 2 + 12, 0]), 'stroke="' + INK + '" stroke-width="2"'));
    { const a = X([-span / 2 - 12, 0]), b = X([span / 2 + 12, -9]); o.push(rect(a[0], a[1], b[0] - a[0], b[1] - a[1], 'fill="#f4efe4" stroke="none"')); }
    for (const it of items) { const a = X([it.x0, it.h]), b = X([it.x1, it.b || 0]); o.push(rect(a[0], a[1], b[0] - a[0], b[1] - a[1], it.a)); }
    for (const x of cols) { const a = X([x - 1, H]), b = X([x + 1, 0]); o.push(rect(a[0], a[1], b[0] - a[0], b[1] - a[1], 'fill="#9aa1a5" stroke="' + INK + '" stroke-width="1"')); }
    { const a = X([-span / 2, top]), b = X([span / 2, H]); o.push(rect(a[0], a[1], b[0] - a[0], b[1] - a[1], 'fill="#a83232" stroke="' + INK + '" stroke-width="1.4"'), T((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 'ILLUMINATED FASCIA — BRAND BY FUEL RETAILER', 9, { bold: true, fill: '#fff', halo: false })); }
    const r = X([span / 2 + 4, 0]), u = X([span / 2 + 4, H]), t2 = X([span / 2 + 9, top]);
    o.push(dim(r[0], r[1], u[0], u[1], ftIn(H) + ' CLEAR', -14, 9), dim(t2[0], r[1], t2[0], t2[1], 'T.O. FASCIA ' + ftIn(top), -14, 9));
    return { html: svg(V.W, V.H, o.join('')), V, label, no };
  };
  const along = st.islands.map(q => ({ x0: q.x0, x1: q.x1, h: 0.5, a: 'fill="#d5d8d6" stroke="' + INK + '" stroke-width=".8"' })).concat(st.mpds.map(m => ({ x0: m.x0, x1: m.x1, h: 7, b: 0.5, a: 'fill="#2b3033" stroke="' + INK + '" stroke-width=".8"' })));
  const across = st.islands.map(q => ({ x0: q.y0, x1: q.y1, h: 0.5, a: 'fill="#d5d8d6" stroke="' + INK + '" stroke-width=".8"' })).concat(st.mpds.map(m => ({ x0: m.y0, x1: m.y1, h: 7, b: 0.5, a: 'fill="#2b3033" stroke="' + INK + '" stroke-width=".8"' })));
  const cx = [...new Set(st.cols.map(c => Math.round((c.x0 + c.x1) * 5) / 10))], cy = [...new Set(st.cols.map(c => Math.round((c.y0 + c.y1) * 5) / 10))];
  const e1 = elevation(st.W, cx, along, 'Front elevation (from the street)', 1), e2 = elevation(st.D, cy, across, 'Side elevation', 2);
  // the section across the canopy at a column: footing, pier, column, girder, purlins and deck, the island with its
  // dispenser on its sump
  const sx = [-st.D / 2 - 12, -9, st.D / 2 + 12, top + 6], V3 = viewOf(sx, wIn, hIn, true), X = V3.X, s = [];
  { const a = X([sx[0], 0]), b = X([sx[2], -9]); s.push(rect(a[0], a[1], b[0] - a[0], b[1] - a[1], 'fill="#f4efe4" stroke="none"'), line(a[0], a[1], b[0], a[1], 'stroke="' + INK + '" stroke-width="2"')); }
  const c0 = st.cols.slice().sort((p, q) => Math.abs((p.x0 + p.x1) / 2) - Math.abs((q.x0 + q.x1) / 2))[0], cxs = c0 ? st.cols.filter(c => Math.abs((c.x0 + c.x1) / 2 - (c0.x0 + c0.x1) / 2) < 3).map(c => (c.y0 + c.y1) / 2) : []; // (a canopy drawn by hand with no pumps: no columns to cut through)
  for (const y of cxs) { const pt0 = X([y - 1.25, 0]), pt1 = X([y + 1.25, -5]), ft = X([y - 3.5, -5]), fb = X([y + 3.5, -7.5]); // the pier down from grade, the spread footing under it
    s.push(rect(pt0[0], pt0[1], pt1[0] - pt0[0], pt1[1] - pt0[1], 'fill="#cfd2d0" stroke="' + INK + '" stroke-width="1"'), rect(ft[0], ft[1], fb[0] - ft[0], fb[1] - ft[1], 'fill="#cfd2d0" stroke="' + INK + '" stroke-width="1"'));
    const a = X([y - 1, H]), b = X([y + 1, 0]); s.push(rect(a[0], a[1], b[0] - a[0], b[1] - a[1], 'fill="#9aa1a5" stroke="' + INK + '" stroke-width="1"')); }
  { const a = X([-st.D / 2, H + 2]), b = X([st.D / 2, H]); s.push(rect(a[0], a[1], b[0] - a[0], b[1] - a[1], 'fill="#6b7174" stroke="' + INK + '" stroke-width="1"')); const c = X([-st.D / 2, top]), d = X([-st.D / 2 + 0.6, H]); s.push(rect(c[0], c[1], d[0] - c[0], d[1] - c[1], 'fill="#a83232"'), rect(X([st.D / 2 - 0.6, top])[0], c[1], d[0] - c[0], d[1] - c[1], 'fill="#a83232"')); }
  for (const q of c0 ? st.islands.filter(q => Math.abs(q.c[0] - (c0.x0 + c0.x1) / 2) < Math.max(q.x1 - q.x0, 4)) : []) { const a = X([q.y0, 0.5]), b = X([q.y1, 0]); s.push(rect(a[0], a[1], b[0] - a[0], b[1] - a[1], 'fill="#d5d8d6" stroke="' + INK + '"')); const sm = X([q.c[1] - 2, 0]), sb = X([q.c[1] + 2, -3]); s.push(rect(sm[0], sm[1], sb[0] - sm[0], sb[1] - sm[1], 'fill="#fff" stroke="' + INK + '" stroke-dasharray="4 2"')); }
  const lbl = (p, q, t) => { const a = X(p), b = X(q); return lead(a[0], a[1], b[0], b[1], t, 9); };
  if (cxs.length) { const y = cxs[0]; s.push(lbl([y + 1, H * 0.6], [st.D / 2 + 2, H * 0.6], 'HSS 12×12 COLUMN W/ INTERNAL DOWNSPOUT'), lbl([y + 3.5, -6.5], [st.D / 2 + 2, -6], 'PIER AND SPREAD FOOTING (BY CANOPY MFR.)'), lbl([0, H + 1], [st.D / 2 + 2, H + 5], 'STEEL GIRDER, PURLINS, 24 GA DECK')); }
  s.push(lbl([st.islands[0]?.c[1] ?? 0, -2], [-st.D / 2 - 2, -7], 'UNDER-DISPENSER SUMP'));
  sh.scale = 'As noted';
  const hpx = hIn * 96, blockH = hpx * 72 / 96 + 50;
  const view = (y, v, no, title, V) => at(MAIN.x, MAIN.y + y, MAIN.w, blockH, '<div style="display:flex;flex-direction:column;align-items:center">' + v + '</div>') + at(MAIN.x, MAIN.y + y + blockH - 44, MAIN.w, 44, viewTitle(no, title, V.sc.label));
  return view(0, e1.html, 1, e1.label, e1.V) + view(blockH + 6, e2.html, 2, e2.label, e2.V) + view(2 * (blockH + 6), svg(V3.W, V3.H, s.join('')), 3, 'Section through the canopy at a column', V3) +
    side(tbl('Heights', null, [['Clear under the deck', ftIn(H) + ' (14\'-6" min. for most delivery trucks; confirm with the retailer)'], ['Top of fascia', ftIn(top)], ['Fascia band', "3'-6\""], ['Dispensers', "about 7'-0\" tall on a 6\" island"]]) +
      notes('Notes', ['Elevations are schematic: the fascia profile, colors and brand panels are the fuel retailer\'s standard.', 'The canopy drains internally to downspouts inside the columns, tied to the storm sewer (C-301).', 'Bollards (6" steel pipe, concrete-filled, 4\'-0" above grade) at the ends of each island.']) +
      warn('Heights and member sizes are planning values for the canopy manufacturer\'s design.'));
}

// ---------- F-401 canopy foundation and framing ----------
function fStruct(ctx, sh) {
  const st = stationOf(ctx.plan); if (!st) return none();
  const half = (MAIN.h - 64) / 2 - 30, pad = 16, bx = [-st.W / 2 - pad, -st.D / 2 - pad, st.W / 2 + pad, st.D / 2 + pad], V = viewOf(bx, MAIN.w / PT, half / PT, true), X = V.X;
  const F = 7, o = [R(V, { x0: -st.W / 2, y0: -st.D / 2, x1: st.W / 2, y1: st.D / 2 }, 'fill="none" stroke="#9aa0a2" stroke-width="1" stroke-dasharray="10 4"')];
  for (const q of st.islands) o.push(R(V, q, 'fill="#f1f1ef" stroke="#c9ccca" stroke-width=".6"'));
  for (const c of st.cols) { const m = [(c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2]; o.push(R(V, { x0: m[0] - F / 2, y0: m[1] - F / 2, x1: m[0] + F / 2, y1: m[1] + F / 2 }, 'fill="#eef0ee" stroke="' + INK + '" stroke-width="1" stroke-dasharray="6 3"'), R(V, { x0: m[0] - 1.25, y0: m[1] - 1.25, x1: m[0] + 1.25, y1: m[1] + 1.25 }, 'fill="#cfd2d0" stroke="' + INK + '"'), R(V, c, 'fill="' + INK + '"')); const t = X([m[0], m[1] - F / 2 - 3]); o.push(T(t[0], t[1], 'F1', 8, { bold: true })); }
  // framing: a girder along each line of columns, cantilevered to the fascia; purlins across at 5 ft; the fascia frame
  const g = [R(V, { x0: -st.W / 2, y0: -st.D / 2, x1: st.W / 2, y1: st.D / 2 }, 'fill="none" stroke="' + INK + '" stroke-width="2"')];
  const lines = [...new Set(st.cols.map(c => Math.round((c.y0 + c.y1) * 5) / 10))];
  for (let x = -st.W / 2 + 5; x < st.W / 2 - 0.5; x += 5) { const a = X([x, -st.D / 2]), b = X([x, st.D / 2]); g.push(line(a[0], a[1], b[0], b[1], 'stroke="#6b7174" stroke-width=".8"')); }
  for (const y of lines) { const a = X([-st.W / 2, y]), b = X([st.W / 2, y]); g.push(line(a[0], a[1], b[0], b[1], 'stroke="' + INK + '" stroke-width="3"'), T((a[0] + b[0]) / 2, a[1] - 9, 'W18 GIRDER (TYP.)', 8, { bold: true })); }
  for (const c of st.cols) g.push(R(V, c, 'fill="' + INK + '"'));
  { const a = X([st.W / 2 - 2.5, st.D / 2]); g.push(T(a[0], a[1] + 12, 'C10 PURLINS @ 5\'-0" O.C.', 8, { anchor: 'end' })); }
  sh.scale = V.sc.label;
  const vh = V.H * PT / 96;
  return at(MAIN.x, MAIN.y, MAIN.w, vh + 10, svg(V.W, V.H, o.join('')), 'display:flex;justify-content:center') + at(MAIN.x, MAIN.y + vh + 12, MAIN.w, 44, viewTitle(1, 'Canopy foundation plan', V.sc.label)) +
    at(MAIN.x, MAIN.y + vh + 80, MAIN.w, vh + 10, svg(V.W, V.H, g.join('')), 'display:flex;justify-content:center') + at(MAIN.x, MAIN.y + 2 * vh + 92, MAIN.w, 44, viewTitle(2, 'Canopy framing plan', V.sc.label)) +
    side(tbl('Design criteria (confirm)', null, [['Code', 'IBC 2021 as adopted; ASCE 7-22'], ['Risk category', 'II'], ['Wind', 'Ultimate design wind speed for the site per ASCE 7-22 (the Houston region is about 140–150 mph): confirm'], ['Roof live load', '20 psf'], ['Collateral', '5 psf (lights, signs)'], ['Soils', 'Per the geotechnical report; footings below the active zone of expansive clays']]) +
      tbl('Schedule (indicative)', ['Mark', 'Member', 'Size'], [['C1', 'Column', 'HSS 12×12×3/8 on a base plate with 4 anchor rods'], ['F1', 'Footing', ftIn(F) + ' sq. × 2\'-6" deep with a 30" pier, #6 each way'], ['G1', 'Girder', 'W18 continuous over the columns, cantilevered to the fascia'], ['P1', 'Purlin', 'C10 at 5\'-0" o.c.'], ['Deck', 'Roof deck', '24 ga. steel, sloped to internal gutters']]) +
      notes('Notes', ['The canopy is a pre-engineered package: the canopy manufacturer\'s Texas-registered engineer designs the members, connections, footings and anchor rods for the site\'s wind and soils.', 'Footings sit clear of the tank excavation, the product piping trenches and the under-dispenser sumps.', 'Columns are set on the islands; the footings may need to be combined where columns are close together.']) +
      warn('Member and footing sizes are placeholders, not a design.'));
}

// ---------- F-501 details ----------
function fDetails(ctx, sh) {
  const st = stationOf(ctx.plan); if (!st) return none(); sh.scale = 'N.T.S.';
  const sys = systemOf(st), t0 = sys.tanks[0], dia = t0?.dia || 8;
  const W1 = AREA.w - 520 - 24, DW = 560, DH = 380, k = 22, Z = Math.min((W1 - 3 * 16) / 3 * 96 / 72 / DW, ((AREA.h - 3 * 60) / 3) * 96 / 72 / DH); // (each detail drawn 560 x 380 and shown as big as three rows of three allow)
  const box = (no, title, body) => '<div style="width:' + (DW * Z * 72 / 96 + 4) + 'pt;display:inline-block;vertical-align:top;margin:0 12pt 14pt 0">' + svg(DW, DH, rect(1, 1, DW - 2, DH - 2, 'fill="#fff" stroke="#c9ccca"') + body).replace('width="' + DW + '" height="' + DH + '"', 'width="' + n(DW * Z) + '" height="' + n(DH * Z) + '"') + viewTitle(no, title, 'N.T.S.') + '</div>';
  const G = 80, gl = (y = G) => line(20, y, DW - 20, y, 'stroke="' + INK + '" stroke-width="2"'), soil = (y0, y1) => rect(20, y0, DW - 40, y1 - y0, 'fill="#f4efe4" stroke="none"'), ld = (x1, y1, x2, y2, s, a = 'start') => lead(x1, y1, x2, y2, s, 10, a);
  // 1 the tank in its excavation
  const tr = dia * k / 2, ty = G + 36 * 1 + 3 * k * 0.4 + tr + 30, d1 = soil(G, DH - 20) + rect(60, G + 8, DW - 120, DH - G - 40, 'fill="#efe9d8" stroke="' + INK + '" stroke-dasharray="6 3"') + rect(40, G - 8, DW - 80, 8, 'fill="#cfd2d0" stroke="' + INK + '"') + gl(G - 8) +
    circle(DW / 2, Math.min(ty, DH - 40 - tr), tr, 'fill="#fff" stroke="' + INK + '" stroke-width="2"') + circle(DW / 2, Math.min(ty, DH - 40 - tr), tr - 6, 'fill="none" stroke="' + INK + '" stroke-dasharray="3 2"') +
    rect(DW / 2 - 18, G - 8, 36, Math.min(ty, DH - 40 - tr) - tr - G + 8, 'fill="#fff" stroke="' + INK + '"') + rect(80, DH - 50, 60, 22, 'fill="#cfd2d0" stroke="' + INK + '"') + rect(DW - 140, DH - 50, 60, 22, 'fill="#cfd2d0" stroke="' + INK + '"') +
    line(110, DH - 50, DW / 2 - tr * 0.7, Math.min(ty, DH - 40 - tr) - tr * 0.7, 'stroke="' + INK + '"') + line(DW - 110, DH - 50, DW / 2 + tr * 0.7, Math.min(ty, DH - 40 - tr) - tr * 0.7, 'stroke="' + INK + '"') +
    ld(DW / 2 + 18, G + 20, DW - 40, G + 18, 'STP MANWAY / SUMP', 'end') + ld(60, G - 4, 40, G - 40, '8" REINF. CONC. PAD') + ld(DW / 2 - tr, Math.min(ty, DH - 40 - tr), 30, Math.min(ty, DH - 40 - tr) - 40, 'DOUBLE-WALL TANK, ' + ftIn(dia) + ' DIA.') + ld(110, DH - 44, 30, DH - 30, 'DEADMAN ANCHOR + STRAPS') + ld(DW - 80, G + 60, DW - 40, G + 90, 'PEA GRAVEL / BACKFILL PER MFR.', 'end') + T(DW / 2, G - 30, "3'-0\" MIN. COVER", 10, { bold: true });
  // 2 the dispenser island
  const d2 = soil(G + 120, DH - 20) + gl(G + 120) + rect(120, G + 108, DW - 240, 12, 'fill="#d5d8d6" stroke="' + INK + '"') + rect(DW / 2 - 30, G - 30, 60, 138, 'fill="#2b3033" stroke="' + INK + '"') + rect(DW / 2 - 50, G + 120, 100, 70, 'fill="#fff" stroke="' + INK + '" stroke-dasharray="5 3"') +
    rect(100, G + 30, 14, 78, 'fill="#f1c40f" stroke="' + INK + '"') + rect(DW - 114, G + 30, 14, 78, 'fill="#f1c40f" stroke="' + INK + '"') + line(DW / 2 - 50, G + 150, 40, G + 150, 'stroke="' + PROD[0].col + '" stroke-width="3"') +
    ld(DW / 2 + 30, G, DW - 40, G - 30, 'MPD DISPENSER', 'end') + ld(DW / 2 + 50, G + 170, DW - 40, G + 200, 'UNDER-DISPENSER SUMP W/ SENSOR', 'end') + ld(DW / 2 - 40, G + 128, 40, G + 200, 'SHEAR VALVE AT GRADE') + ld(107, G + 40, 40, G + 10, '6" BOLLARD, CONC.-FILLED') + ld(130, G + 112, 40, G + 90, '6" CURBED ISLAND');
  // 3 the piping trench
  const d3 = soil(G, DH - 20) + gl(G) + rect(DW / 2 - 90, G, 180, 170, 'fill="#efe9d8" stroke="' + INK + '" stroke-dasharray="6 3"') + rect(40, G - 10, DW - 80, 10, 'fill="#cfd2d0" stroke="' + INK + '"') +
    PROD.map((p, i) => circle(DW / 2 - 40 + i * 40, G + 130, 13, 'fill="#fff" stroke="' + p.col + '" stroke-width="3"') + circle(DW / 2 - 40 + i * 40, G + 130, 8, 'fill="none" stroke="' + p.col + '"')).join('') + line(DW / 2 - 80, G + 60, DW / 2 + 80, G + 60, 'stroke="#d29a1f" stroke-width="2" stroke-dasharray="8 3"') +
    ld(DW / 2 + 53, G + 130, DW - 40, G + 150, '2" DOUBLE-WALL FLEX PIPING', 'end') + ld(DW / 2 + 80, G + 60, DW - 40, G + 40, 'WARNING TAPE', 'end') + ld(DW / 2 - 90, G + 100, 40, G + 120, 'PEA GRAVEL BEDDING') + T(DW / 2, G + 30, '18" MIN. COVER UNDER PAVING', 10, { bold: true });
  // 4 fill, spill and overfill
  const d4 = soil(G, DH - 20) + gl(G) + rect(DW / 2 - 60, G - 6, 120, 70, 'fill="#fff" stroke="' + INK + '"') + rect(DW / 2 - 14, G - 10, 28, DH - G - 20, 'fill="#e4e4e1" stroke="' + INK + '"') + rect(DW / 2 - 10, DH - 120, 20, 24, 'fill="' + RED + '"') +
    ld(DW / 2 + 60, G + 20, DW - 40, G + 10, '5 GAL. MIN. SPILL BUCKET, MONITORED', 'end') + ld(DW / 2 + 10, DH - 108, DW - 40, DH - 90, 'OVERFILL VALVE AT 95% IN THE DROP TUBE', 'end') + ld(DW / 2 - 14, G + 120, 40, G + 140, 'DROP TUBE TO 6" OFF THE TANK BOTTOM') + T(DW / 2, G - 30, 'COLOR-CODED FILL CAP (API RP 1637)', 10, { bold: true });
  // 5 vent riser
  const d5 = gl(DH - 40) + rect(DW / 2 - 4, 40, 8, DH - 80, 'fill="#fff" stroke="' + VENT.col + '" stroke-width="2"') + rect(DW / 2 - 14, 28, 28, 14, 'fill="' + VENT.col + '"') + rect(80, 120, 120, DH - 160, 'fill="#e4e4e1" stroke="' + INK + '"') +
    dim(DW / 2 + 40, DH - 40, DW / 2 + 40, 40, "12'-0\" MIN.", -16, 10) + dim(200, 160, DW / 2 - 4, 160, "5'-0\" MIN.", 14, 10) + ld(DW / 2 + 14, 35, DW - 40, 30, 'P/V VENT CAP (WHERE REQUIRED)', 'end') + T(140, 130, 'BUILDING', 10, { bold: true });
  // 6 column base
  const d6 = soil(G + 100, DH - 20) + gl(G + 100) + rect(DW / 2 - 130, G + 170, 260, 70, 'fill="#cfd2d0" stroke="' + INK + '"') + rect(DW / 2 - 50, G + 100, 100, 70, 'fill="#cfd2d0" stroke="' + INK + '"') + rect(DW / 2 - 30, 20, 60, G + 74, 'fill="#9aa1a5" stroke="' + INK + '"') + rect(DW / 2 - 44, G + 94, 88, 8, 'fill="' + INK + '"') +
    ld(DW / 2 + 30, 60, DW - 40, 50, 'HSS 12×12 COLUMN', 'end') + ld(DW / 2 + 44, G + 96, DW - 40, G + 80, 'BASE PLATE, ANCHOR RODS, NON-SHRINK GROUT', 'end') + ld(DW / 2 + 50, G + 140, DW - 40, G + 150, '30" PIER', 'end') + ld(DW / 2 - 130, G + 210, 40, G + 260, 'SPREAD FOOTING (BY CANOPY MFR.)');
  // 7 the emergency shutoff station
  const d7 = rect(60, 30, 200, DH - 70, 'fill="#e4e4e1" stroke="' + INK + '"') + gl(DH - 40) + rect(110, 120, 100, 40, 'fill="#fff" stroke="' + RED + '" stroke-width="2"') + T(160, 140, 'EMERGENCY FUEL SHUTOFF', 9, { bold: true, fill: RED, halo: false }) + rect(140, 175, 40, 40, 'fill="#fff" stroke="' + INK + '" stroke-width="1.6"') + circle(160, 195, 13, 'fill="' + RED + '"') +
    dim(230, DH - 40, 230, 195, "4'-0\" MAX. TO THE BUTTON", -14, 10) + ld(180, 195, DW - 40, 200, 'RED PUSH BUTTON, MAINTAINED, MANUAL RESET', 'end') + ld(210, 140, DW - 40, 120, 'SIGN: EMERGENCY FUEL SHUTOFF (IFC 2303.2)', 'end') + ld(160, 30, DW - 40, 50, 'STORE FRONT WALL OR A POST, 20–100 FT FROM THE DISPENSERS', 'end');
  // 8 a monitoring (observation) well
  const d8 = soil(G, DH - 20) + gl(G) + rect(DW / 2 - 50, G - 8, 100, 14, 'fill="#fff" stroke="' + INK + '"') + path('M' + (DW / 2 - 10) + ' ' + (G - 3) + 'l10 -0 l-5 -0 z', 'fill="' + INK + '"') + rect(DW / 2 - 12, G + 6, 24, DH - G - 40, 'fill="#fff" stroke="' + INK + '"') +
    Array.from({ length: 9 }, (_, i) => line(DW / 2 - 12, G + 120 + i * 20, DW / 2 + 12, G + 120 + i * 20, 'stroke="' + INK + '" stroke-width=".8"')).join('') + T(DW / 2, G - 24, '▲ BLACK TRIANGLE ON THE COVER (API RP 1637)', 10, { bold: true }) +
    ld(DW / 2 + 12, G + 60, DW - 40, G + 40, '4" PVC CASING, SOLID TO 2 FT', 'end') + ld(DW / 2 + 12, G + 180, DW - 40, G + 200, 'SLOTTED SCREEN TO BELOW THE TANK BOTTOM', 'end') + ld(DW / 2 - 50, G, 40, G + 40, 'BOLT-DOWN MANHOLE, WATERTIGHT');
  // 9 the STP sump on a tank
  const d9 = soil(G, DH - 20) + gl(G) + rect(40, G - 8, DW - 80, 8, 'fill="#cfd2d0" stroke="' + INK + '"') + rect(DW / 2 - 90, G - 8, 180, 160, 'fill="#fff" stroke="' + INK + '" stroke-width="1.6"') + path('M40 ' + (DH - 60) + ' Q' + DW / 2 + ' ' + (DH - 110) + ' ' + (DW - 40) + ' ' + (DH - 60), 'fill="none" stroke="' + INK + '" stroke-width="2"') +
    rect(DW / 2 - 30, G + 50, 60, 50, 'fill="#9aa1a5" stroke="' + INK + '"') + rect(DW / 2 - 8, G + 100, 16, DH - 60 - G - 100, 'fill="#e4e4e1" stroke="' + INK + '"') + line(DW / 2 + 30, G + 75, DW / 2 + 90, G + 75, 'stroke="' + PROD[0].col + '" stroke-width="4"') + rect(DW / 2 - 80, G + 130, 18, 14, 'fill="' + INK + '"') +
    ld(DW / 2 + 30, G + 60, DW - 40, G + 30, 'STP HEAD W/ LINE LEAK DETECTOR', 'end') + ld(DW / 2 + 70, G + 75, DW - 40, G + 100, 'FLEX CONNECTOR, ENTRY BOOT', 'end') + ld(DW / 2 - 71, G + 137, 40, G + 170, 'SUMP SENSOR TO THE ATG') + ld(DW / 2 - 90, G + 20, 40, G - 30, 'CONTAINMENT SUMP, WATERTIGHT LID');
  return at(AREA.x, AREA.y, W1, AREA.h, box(1, 'Underground tank installation', d1) + box(2, 'Dispenser island', d2) + box(3, 'Product piping trench', d3) + box(4, 'Fill, spill and overfill', d4) + box(5, 'Vent riser', d5) + box(6, 'Canopy column base', d6) + box(7, 'Emergency shutoff station', d7) + box(8, 'Monitoring well', d8) + box(9, 'STP sump', d9)) +
    side(notes('Notes', ['Details are typical and schematic, for the petroleum contractor and the canopy manufacturer to replace with their own.', 'Install tanks and piping per the manufacturers and PEI RP100; test tanks, piping, sumps and spill buckets before backfill and at startup (PEI RP1200).', 'Register the tanks with TCEQ and give the 30-day construction notice before installation (30 TAC 334).', 'Keep every sump and spill bucket watertight; the ATG alarms on liquid in any of them.']) + warn('Typical details, not to scale.'));
}

export const RENDERERS = { 'f-notes': fNotes, 'f-plan': fPlan, 'f-elec': fElec, 'f-canopy': fCanopy, 'f-elev': fElev, 'f-struct': fStruct, 'f-details': fDetails };
