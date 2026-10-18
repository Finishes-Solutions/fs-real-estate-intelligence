// Site layouts the way a site planner draws them: the drive network first, then everything hangs off it.
//
//  - Drive aisles run in parallel rows across the site, joined at their ends by connector drives that curve into them
//    (a loop or a ladder), so every aisle, parking row and building is reached from the entry without dead ends.
//  - 90° parking rows line the aisles; buildings sit between the rows, facing the parking across a walk.
//  - Extra parking bays run between aisles where the buildings need more parking, and double as cross drives.
//  - The entry is a boulevard (or a driveway with curb returns) from the street straight into the network.
//  - Apartments get a clubhouse with its pool deck beside it at the entry; retail gets pad sites with drive-thru lanes
//    along the street; warehouses get a truck court on their dock side.
//  - Land the layout can't use becomes the detention pond (an organic shape, with a walking trail around it for
//    apartments), lawns, a dog park and a playground: nothing is left as unexplained empty space.
//
// The work happens in a frame turned so the aisles run along x: "across" layouts have the street at the bottom (rows
// parallel to the street), "deep" layouts have it on the left (rows running back from the street). A layout is a
// stack of blocks between aisles from the bottom up; layoutOptions() tries stacks for the program, keeps the ones that
// pass the plan checks, and returns the three best that differ. Planning sketch only: no grading, utilities or code
// review. Built on lib/siteplan.mjs.
import * as S from './siteplan.mjs';
import { composeSite } from './sitecompose.mjs';
import { HOUSE_PLANS } from './buildings.mjs';
import * as PF from './proforma.mjs';
import polyclip from './vendor/polyclip.mjs';
import * as FTP from './sitefoodtruck.mjs';
import { fuelOptions } from './sitefuel.mjs';
import { cornerRetail } from './sitecorner.mjs';

const rot = S.rotPt, WALK = 12, f0 = v => Math.round(v).toLocaleString('en-US');
// the plan's own parameters (stall and aisle size, building depth and length, shape style), set at the start of each run
let ROW = S.STALL.d, AISLE = S.STALL.aisle, SW = S.STALL.w, PAR = {};
export const PARAMS = { stallW: 9, stallD: 18, aisle: 24, bldgDepth: 60, maxLen: 260, bldgGap: 30, trees: true, style: { ponds: 'square', islands: 'square', corners: 'curved' }, fill: true };
function useParams(plan) {
  PAR = { ...PARAMS, ...(plan.params || {}), style: { ...PARAMS.style, ...(plan.params?.style || {}) } };
  SW = +PAR.stallW || 9; ROW = +PAR.stallD || 18; AISLE = +PAR.aisle || 24;
}
useParams({});
const stallKeys = () => SW !== 9 || ROW !== 18 || AISLE !== 24 ? { sw: SW, sd: ROW, sa: AISLE } : {};
const COMMERCIAL = S.COMMERCIAL;

// ---------- the turned frame ----------
// the angle the street front runs at (the chord of the run of front edges): a wedge or a curved frontage squares up with
// its street rather than its longest lot lines
export function frontAngle(plan) {
  const ring = plan.ring, n = ring.length, f = plan.front != null && plan.front < n ? plan.front : S.longestEdge(ring), roles = S.edgeRoles(ring, f);
  let a = f, b = f; while (roles[(a - 1 + n) % n] === 'front' && (a - 1 + n) % n !== f) a = (a - 1 + n) % n; while (roles[(b + 1) % n] === 'front' && (b + 1) % n !== a) b = (b + 1) % n;
  const p = ring[a], q = ring[(b + 1) % n]; return ((Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI) % 90 + 90) % 90;
}
export function frameOf(plan, deep = false, align = 'main') {
  const ring = plan.ring, front = plan.front != null && plan.front < ring.length ? plan.front : S.longestEdge(ring);
  const n0 = S.outwardOf(ring, front), a0 = align === 'front' ? frontAngle(plan) : S.mainAngle(ring);
  let phi = a0, down = -2; for (let k = 0; k < 4; k++) { const s = rot(n0, -(a0 + k * 90)); if (-s[1] > down) { down = -s[1]; phi = a0 + k * 90; } }
  const psi = deep ? phi + 90 : phi, rules = S.edgeRules(ring, front, plan.setbacks, plan.streets), rr = ring.map(p => rot(p, -psi));
  const xs = rr.map(p => p[0]), ys = rr.map(p => p[1]);
  return { ring, rr, rrT: rr.map(([x, y]) => [y, x]), psi, phi, front, deep, rules, site: S.ringArea(ring), sb: { ...S.SETBACKS, ...(plan.setbacks || {}) },
    build: rules.map(r => Math.max(0.5, r.build)), pave: rules.map(r => Math.max(0.5, r.pave)), paveF: rules.map(r => Math.max(0.5, r.pave, r.role === 'front' ? 60 : 0)), X0: Math.min(...xs), X1: Math.max(...xs), Y0: Math.min(...ys), Y1: Math.max(...ys), cache: new Map() };
}
const toPlan = (F, p) => rot(F.wave ? F.fw(p) : p, F.psi);
// ---------- curving streets ----------
// A neighbourhood's streets curve: the straight layout is worked out in bent coordinates and bent back, so every street
// row follows the same gentle wave, y + A·sin(k·x + ph), with lot rows keeping their depth. The site is unbent first
// (its edges densified), so lots, setbacks and buffers are fitted to the real lot lines.
export function waveOf(F) { const W = F.X1 - F.X0, lam = Math.max(360, Math.min(900, W * 0.8)); return { A: +Math.max(12, Math.min(28, lam * 0.03)).toFixed(1), lam: Math.round(lam), ph: 0.6 }; }
function waveFrame(F, wv) {
  const k = 2 * Math.PI / wv.lam, x0 = F.X0, Y0 = F.Y0, Y1 = F.Y1, ramp = Math.max(60, Math.min(260, (Y1 - Y0) / 3)), sm = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  const amp = y => wv.A * sm((y - Y0) / ramp) * sm((Y1 - y) / ramp); // straight along the lot lines front and back, curving in between
  const dy = (x, y) => amp(y) * Math.sin(k * (x - x0) + wv.ph), slope = (x, y) => amp(y) * k * Math.cos(k * (x - x0) + wv.ph);
  const fw = ([x, y]) => [x, y + dy(x, y)], bw = ([x, y]) => { let v = y; for (let i = 0; i < 6; i++) v = y - dy(x, v); return [x, v]; };
  const pts = [], idx = [];
  F.rr.forEach((a, i) => { const b = F.rr[(i + 1) % F.rr.length], m = Math.max(1, Math.ceil(Math.abs(b[0] - a[0]) / 30)); for (let j = 0; j < m; j++) { pts.push(bw([a[0] + (b[0] - a[0]) * j / m, a[1] + (b[1] - a[1]) * j / m])); idx.push(i); } }); // a lot line across the wave: a point every 30 ft
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), pick = arr => idx.map(i => arr[i]);
  return { ...F, rr: pts, rrT: pts.map(([x, y]) => [y, x]), rules: pick(F.rules), build: pick(F.build), pave: pick(F.pave), paveF: pick(F.paveF), X0: Math.min(...xs), X1: Math.max(...xs), Y0: Math.min(...ys), Y1: Math.max(...ys), cache: new Map(),
    wave: { ...wv, slope }, fw, bw };
}
const densify = (pts, closed, step) => { const out = [], n = pts.length; for (let i = 0; i < (closed ? n : n - 1); i++) { const a = pts[i], b = pts[(i + 1) % n], m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)); for (let j = 0; j < m; j++) out.push([a[0] + (b[0] - a[0]) * j / m, a[1] + (b[1] - a[1]) * j / m]); } if (!closed) out.push(pts[n - 1]); return out; };
// one piece of a bent layout: streets follow the wave, lots and lawns bend with it, buildings and driveways turn with it
function waveEl(F, e) {
  const fw = F.fw, at = e.labelAt ? { labelAt: fw(e.labelAt) } : {};
  if (e.path) return { ...e, path: densify(S.fillet(e.path, e.r ?? 30, e.closed), e.closed, 12).map(fw), r: 0, ...at };
  if (e.poly) return { ...e, poly: densify(e.poly, true, 10).map(fw), ...at };
  if (e.kind === 'drive' && !e.turn && !e.bulb && e.name !== 'Main entry' && e.shape !== 'circle' && Math.max(e.w, e.d) >= 2 * Math.min(e.w, e.d)) { // a straight street: its centre line, bent
    const along = e.w >= e.d, L = along ? e.w : e.d, a = along ? [e.x - L / 2, e.y] : [e.x, e.y - L / 2], b = along ? [e.x + L / 2, e.y] : [e.x, e.y + L / 2];
    return { ...e, path: densify([a, b], false, 12).map(fw), width: Math.min(e.w, e.d), r: 0, ...at };
  }
  if (['lot', 'green', 'pond', 'trail', 'fence'].includes(e.kind) || e.kind === 'drive') return { ...e, poly: densify(S.outline(e), true, 10).map(fw), ...at };
  const c = fw([e.x, e.y]); return { ...e, x: c[0], y: c[1], rotL: (e.rotL || 0) + Math.atan(F.wave.slope(e.x, e.y)) * 180 / Math.PI, ...at }; // squared up with the street where it stands
}

// ---------- where a band fits ----------
// clip a polygon to y0 <= y <= y1
function clipY(r, y0, y1) {
  const half = (r, v, s) => { const out = []; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], ia = s * (a[1] - v) >= 0, ib = s * (b[1] - v) >= 0; if (ia) out.push(a); if (ia !== ib) { const t = (v - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, v]); } } return out; };
  return half(half(r, y0, 1), y1, -1);
}
// the x-range of the points within r of segment ab that lie in y0 <= y <= y1 (a capsule, drawn slightly large)
function capX(a, b, r, y0, y1) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), base = L > 1e-9 ? Math.atan2(b[1] - a[1], b[0] - a[0]) : 0, R = r / Math.cos(Math.PI / 16), pts = [];
  for (let i = 0; i <= 8; i++) { const t = base + Math.PI / 2 + i * Math.PI / 8; pts.push([a[0] + R * Math.cos(t), a[1] + R * Math.sin(t)]); }
  for (let i = 0; i <= 8; i++) { const t = base - Math.PI / 2 + i * Math.PI / 8; pts.push([b[0] + R * Math.cos(t), b[1] + R * Math.sin(t)]); }
  const c = clipY(pts, y0, y1); if (!c.length) return null;
  return [Math.min(...c.map(p => p[0])), Math.max(...c.map(p => p[0]))];
}
const merge = iv => { iv.sort((a, b) => a[0] - b[0]); const out = []; for (const v of iv) { const l = out[out.length - 1]; if (l && v[0] <= l[1]) l[1] = Math.max(l[1], v[1]); else out.push(v.slice()); } return out; };
const minus = (sp, bl) => { let out = sp.map(s => s.slice()); for (const [c, d] of bl) out = out.flatMap(([a, b]) => d <= a || c >= b ? [[a, b]] : [[a, c], [d, b]].filter(([p, q]) => q - p > 0.5)); return out; };
// x-intervals of a horizontal band y0..y1 where a rectangle spanning the whole band stays inside the lot and at least
// need[k] from edge k, and clear of the obstacles ({ p: polygon, g: gap }). Exact up to the capsule's polygon.
function spans(F, y0, y1, needKey, obst = [], T = false) {
  const R = T ? F.rrT : F.rr, need = F[needKey], key = (T ? 'T' : '') + needKey + '|' + y0.toFixed(1) + '|' + y1.toFixed(1);
  let base = F.cache.get(key);
  if (!base) {
    const iv = [];
    for (let k = 0; k < R.length; k++) { const a = R[k], b = R[(k + 1) % R.length], nk = need[k]; if (Math.min(a[1], b[1]) - nk > y1 || Math.max(a[1], b[1]) + nk < y0) continue; const r = capX(a, b, nk, y0, y1); if (r) iv.push(r); }
    const m = merge(iv), xs = R.map(p => p[0]), lo = Math.min(...xs) - 10, hi = Math.max(...xs) + 10; base = []; let x = lo;
    for (const [a, b] of m.concat([[hi, hi]])) { if (a > x && S.inRing([(x + a) / 2, (y0 + y1) / 2], R)) base.push([x, a]); x = Math.max(x, b); }
    F.cache.set(key, base);
  }
  const bl = [];
  for (const o of obst) {
    const p = T ? o.pT || (o.pT = o.p.map(([x, y]) => [y, x])) : o.p, g = o.g || 0;
    let ylo = Infinity, yhi = -Infinity; for (const q of p) { if (q[1] < ylo) ylo = q[1]; if (q[1] > yhi) yhi = q[1]; }
    if (ylo - g > y1 || yhi + g < y0) continue;
    const c = clipY(p, y0, y1); if (c.length) bl.push([Math.min(...c.map(q => q[0])) - g, Math.max(...c.map(q => q[0])) + g]);
    if (g > 0) for (let i = 0; i < p.length; i++) { const r = capX(p[i], p[(i + 1) % p.length], g, y0, y1); if (r) bl.push(r); }
  }
  return minus(base, merge(bl));
}
const covers = (sp, a, b) => sp.some(([p, q]) => p <= a + 0.01 && q >= b - 0.01);
const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

// ---------- one layout from a stack ----------
// spec: { deep, aisles: [{ y, w, kind }], blocks: [{ fill, use, D, floors, rowsDown, rowsUp, walkDown, walkUp }] (one more
// than aisles: below the first, between, above the last), conW, curveR, spineX, bays: { pair: count }, entry: { w, boulevard,
// at }, reserve: [polygon], pads, prog }. Returns { els (frame feet), stats }.
export function layoutStack(F, spec) {
  guestOwed = 0;
  const A = spec.aisles, B = spec.blocks, n = A.length, els = [], obst = [], notes = [], conW = spec.conW || 26, R = spec.curveR ?? 30;
  const reserve = (spec.reserve || []).map(p => ({ p, g: 0 }));
  const XW = spec.window || [F.X0, F.X1];
  for (const b of B) if (b.parts) { let acc = 0; for (const q of b.parts) { q.x0 = acc ? XW[0] + (XW[1] - XW[0]) * acc : -Infinity; acc += q.frac; q.x1 = acc < 0.999 ? XW[0] + (XW[1] - XW[0]) * acc : Infinity; } }
  const partsOf = i => B[i]?.parts || (B[i] ? [{ ...B[i], x0: -Infinity, x1: Infinity }] : []);
  const clipX = (sp, q) => sp.map(([a, b]) => [Math.max(a, q.x0 + (q.x0 > -Infinity ? 15 : 0)), Math.min(b, q.x1 - (q.x1 < Infinity ? 15 : 0))]).filter(([a, b]) => b - a > 1);
  const rowsBelow = i => B[i].rowsUp ? ROW : 0, rowsAbove = i => B[i + 1].rowsDown ? ROW : 0; // stall rows on aisle i's sides
  // 1. aisle runs: where the aisle itself fits on the paving side of the buffer (long pieces only)
  const runs = A.map((a, i) => spans(F, a.y - a.w / 2, a.y + a.w / 2, F.deep ? 'paveF' : 'pave', reserve).filter(([p, q]) => q - p >= 90).map(([p, q]) => ({ i, a: p, b: q })));
  // 2. connections between neighbouring aisles: at both ends of where they overlap, the spine, and bays between
  const cons = [];
  const conOK = (x, y0, y1, w) => covers(spans(F, x - w / 2, x + w / 2, F.deep ? 'paveF' : 'pave', reserve, true), y0, y1);
  for (let i = 0; i + 1 < n; i++) for (const s of runs[i]) for (const t of runs[i + 1]) {
    const lo = Math.max(s.a, t.a), hi = Math.min(s.b, t.b); if (hi - lo < 90) continue;
    const y0 = A[i].y, y1 = A[i + 1].y, find = (x, dir) => { for (let k = 0; k < 30; k++, x += dir * 6) { if ((x - lo) * (hi - x) < 0) return null; if (conOK(x, y0, y1, conW)) return x; } return null; };
    const xl = find(lo + conW / 2, 1), xr = find(hi - conW / 2, -1), here = [];
    if (xl != null) here.push({ i, x: xl, w: conW, end: true, s, t });
    if (xr != null && (xl == null || xr - xl > 120)) here.push({ i, x: xr, w: conW, end: true, s, t });
    if (spec.spineX != null && spec.spineX > lo + 40 && spec.spineX < hi - 40 && conOK(spec.spineX, y0, y1, spec.spineW || 30) && !here.some(c => Math.abs(c.x - spec.spineX) < 200)) here.push({ i, x: spec.spineX, w: spec.spineW || 30, spine: true, s, t });
    // bays between: evenly along the overlap (every ~420 ft for access, more where the parking needs them)
    const ends = here.map(c => c.x).sort((a, b) => a - b), a0 = ends[0] ?? lo, a1 = ends[ends.length - 1] ?? hi, sto = spec.storage && i > 0, solid = B[i + 1].fill === 'bldg' && B[i + 1].use !== 'multifamily' && !sto || !!B[i + 1].parts;
    const want = solid ? 0 : sto ? Math.max(Math.ceil((a1 - a0) / 260) - 1, 0) : Math.max(Math.ceil((a1 - a0) / 420) - 1, 0) + (spec.bays?.[i] || 0); // storage: a cross drive through the rows every ~250 ft
    const inner = B[i + 1].fill, bayW = inner === 'bldg' && spec.bayRows !== false && !sto ? AISLE + 2 * ROW : AISLE;
    for (let k = 1; k <= want; k++) { const x = a0 + (a1 - a0) * k / (want + 1); if (here.some(c => Math.abs(c.x - x) < bayW / 2 + 40)) continue; if (conOK(x, y0, y1, AISLE)) here.push({ i, x, w: AISLE, bay: bayW > AISLE, s, t }); }
    if (!here.length) notes.push('rows ' + (i + 1) + ' and ' + (i + 2) + ' could not be joined');
    cons.push(...here);
  }
  // 3. aisle extents: from the outermost connection on each side (short stubs only), the whole run for a lone aisle
  for (const rs of runs) for (const r of rs) {
    const xs = cons.filter(c => c.s === r || c.t === r).map(c => c.x);
    if (!xs.length) { r.ea = r.a; r.eb = r.b; continue; }
    r.ea = Math.max(r.a, Math.min(...xs) - (Math.min(...xs) - r.a > 110 ? 90 : 0)); r.eb = Math.min(r.b, Math.max(...xs) + (r.b - Math.max(...xs) > 110 ? 90 : 0));
    if (r.ea > Math.min(...xs) - 1) r.ea = Math.min(...xs); if (r.eb < Math.max(...xs) + 1) r.eb = Math.max(...xs);
    r.cl = Math.min(...xs); r.cr = Math.max(...xs);
  }
  const live = runs.flat().filter(r => r.eb - r.ea > 30);
  // 4. the entry: straight in from the street to the first aisle (across) or along an aisle (deep)
  const entry = spec.noEntry ? null : makeEntry(F, spec, live, cons);
  if (!entry && !spec.noEntry) return null;
  // 5. drive pieces. Ends of the network curve: a connection that meets an aisle at the aisle's end turns into it.
  const drives = [];
  for (const r of live) {
    const a = A[r.i], hook = (x, dir) => { if (R < 1) return false; const at = cons.filter(c => Math.abs(c.x - x) < 1 && (c.s === r || c.t === r)); return at.length === 1 && at[0].end && !(entry?.aisle === r && entry.side === dir); }; // an L corner, not a T
    const truck = a.kind === 'truck', lc = !truck && r.cl != null && Math.abs(r.ea - r.cl) < 1 && hook(r.cl, -1), rc = !truck && r.cr != null && Math.abs(r.eb - r.cr) < 1 && hook(r.cr, 1);
    const x0 = lc ? r.ea + 2 * R - 2 : r.ea - (r.cl != null && Math.abs(r.ea - r.cl) < 1 ? cons.find(c => Math.abs(c.x - r.ea) < 1)?.w / 2 || 0 : 0), x1 = rc ? r.eb - 2 * R + 2 : r.eb + (r.cr != null && Math.abs(r.eb - r.cr) < 1 ? cons.find(c => Math.abs(c.x - r.eb) < 1)?.w / 2 || 0 : 0);
    r.hookL = lc; r.hookR = rc;
    if (x1 - x0 > 4) drives.push({ kind: 'drive', ...rectL(x0, a.y - a.w / 2, x1, a.y + a.w / 2), name: a.kind === 'service' ? 'Service drive' : '', note: a.kind === 'lane' ? 'Private lane · ' + a.w + ' ft' : a.kind === 'street' ? 'Street · ' + a.w + ' ft' : a.w + ' ft drive aisle', aisle: r });
  }
  for (const c of cons) {
    const y0 = A[c.i].y, y1 = A[c.i + 1].y, path = [[c.x, y0], [c.x, y1]];
    const lowR = c.s, upR = c.t, dirOf = (r, x) => r.hookL && Math.abs(r.cl - x) < 1 ? 1 : r.hookR && Math.abs(r.cr - x) < 1 ? -1 : 0;
    const dl = dirOf(lowR, c.x), du = dirOf(upR, c.x), alsoBelow = cons.some(o => o !== c && o.i === c.i - 1 && Math.abs(o.x - c.x) < 1), alsoAbove = cons.some(o => o !== c && o.i === c.i + 1 && Math.abs(o.x - c.x) < 1);
    if (dl && !alsoBelow) path.unshift([c.x + dl * 2 * R, y0]); else if (!alsoBelow) path[0] = [c.x, y0 - A[c.i].w / 2];
    if (du && !alsoAbove) path.push([c.x + du * 2 * R, y1]); else if (!alsoAbove) path[path.length - 1] = [c.x, y1 + A[c.i + 1].w / 2];
    const e = path.length > 2 ? { kind: 'drive', path, width: c.w, r: R, name: c.spine ? 'Main drive' : '', note: c.w + ' ft drive' } : { kind: 'drive', ...rectL(c.x - c.w / 2, path[0][1], c.x + c.w / 2, path[1][1]), name: c.spine ? 'Main drive' : '', note: c.w + ' ft drive' };
    e.con = c; drives.push(e);
  }
  if (entry) drives.push(...entry.els);
  // a street with no connection at an end gets a cul-de-sac (a fire truck can turn round in 90 ft of paving)
  for (const r of live) {
    if (cons.some(c => c.s === r || c.t === r) || r.eb - r.ea < 200) continue;
    const a = A[r.i], Rb = Math.max(42, a.w / 2 + 28), ends = entry?.aisle === r && F.deep ? [1] : entry?.aisle === r ? [-1, 1] : [-1, 1];
    for (const end of ends) {
      const x = end > 0 ? r.eb - Rb : r.ea + Rb; if (entry && Math.hypot(x - entry.at[0], a.y - (entry.at[1] ?? a.y)) < 120) continue;
      if (!covers(spans(F, a.y - Rb, a.y + Rb, 'pave', reserve), x - Rb, x + Rb)) { // no room for a bulb: a hammerhead (a 20 ft T across the end) so a fire or trash truck can turn
        const xe = end > 0 ? r.eb - 2 : r.ea + 2, x0h = end > 0 ? xe - 20 : xe, x1h = end > 0 ? xe : xe + 20, key = F.deep ? 'paveF' : 'pave';
        for (const half of [60, 50, 42]) if (covers(spans(F, a.y - half, a.y + half, key, reserve), x0h, x1h)) { drives.push({ kind: 'drive', ...rectL(x0h, a.y - half, x1h, a.y + half), name: '', note: 'Hammerhead turnaround · ' + 2 * half + ' ft', turn: true }); break; }
        continue;
      }
      const poly = []; for (let k = 0; k < 32; k++) { const t = k / 32 * 2 * Math.PI; poly.push([x + Rb * Math.cos(t), a.y + Rb * Math.sin(t)]); }
      drives.push({ kind: 'drive', poly, name: '', note: 'Cul-de-sac · ' + Math.round(2 * Rb) + ' ft', bulb: true });
    }
  }
  els.push(...drives);
  const driveOb = drives.map(d => ({ p: S.outline(d), g: 1, d }));
  const conOb = cons.map(c => ({ p: box(c.x - c.w / 2, A[c.i].y, c.x + c.w / 2, A[c.i + 1].y), g: 1 + (c.end ? R * 0.4 : 0) }));
  // 6. pads along the street (retail) and the clubhouse with its pool at the entry (apartments)
  const blockBand = (i, part) => { // the building band of block i (or of one part of it): [y0, y1] or null
    const b = part || B[i]; if (!b || !['bldg', 'pads', 'garage'].includes(b.fill)) return null; const D = b.D;
    if (i === 0) { const top = A[0].y - A[0].w / 2 - rowsBelow(0) - (b.walkUp ?? WALK); return [top - D, top]; }
    if (i === n) { const bot = A[n - 1].y + A[n - 1].w / 2 + rowsAbove(n - 1) + (b.walkDown ?? WALK); return [bot, bot + D]; }
    const lo = A[i - 1].y + A[i - 1].w / 2 + rowsAbove(i - 1) + (b.walkDown ?? WALK), hi = A[i].y - A[i].w / 2 - rowsBelow(i) - (b.walkUp ?? WALK);
    if (hi - lo < D - 0.5) return null; const mid = b.align === 'down' ? lo + D / 2 : b.align === 'up' ? hi - D / 2 : (lo + hi) / 2; return [mid - D / 2, mid + D / 2];
  };
  const bayRows = [];
  for (const c of cons.filter(c => c.bay)) { // the bay's own stall rows, between the aisles' rows
    const y0 = A[c.i].y + A[c.i].w / 2 + rowsAbove(c.i), y1 = A[c.i + 1].y - A[c.i + 1].w / 2 - rowsBelow(c.i + 1);
    for (const side of [-1, 1]) { const xa = side < 0 ? c.x - c.w / 2 - ROW : c.x + c.w / 2, xb = xa + ROW, sp = spans(F, xa, xb, 'pave', reserve, true).filter(([p, q]) => q > y0 && p < y1).map(([p, q]) => [Math.max(p, y0), Math.min(q, y1)]);
      for (const [p, q] of sp) if (q - p >= 36) bayRows.push({ x0: xa, x1: xb, y0: p, y1: q, side }); }
  }
  const bayOb = bayRows.map(b => ({ p: box(b.x0, b.y0, b.x1, b.y1), g: 0 }));
  const extra = [];
  if (spec.amenity && entry) {
    const am = amenityCenter(F, spec, blockBand, driveOb.concat(bayOb, reserve), entry);
    if (am) { extra.push(...am.els); obst.push(...am.els.map(e => ({ p: S.outline(e), g: 14 }))); } else notes.push('no room for the clubhouse and pool by the entry');
  }
  if (spec.pads > 0 && B[0].fill === 'pads') { const pd = padsAlong(F, spec, blockBand(0), driveOb.concat(reserve)); extra.push(...pd.els); obst.push(...pd.ob); }
  els.push(...extra);
  // 7. parking rows along the aisles and in the bays
  const rowOb = driveOb.filter(o => !o.d.aisle && !o.d.con).concat(conOb, reserve, obst.map(o => ({ p: o.p, g: 2 })), bayOb.map(o => ({ p: o.p, g: 1 })));
  // the entry's throat: no stalls beside it for the first THROAT ft in from the street (cars turning in from the road
  // don't meet cars backing out), across the driveway, its curb returns and a stall's width more each side
  if (entry) { const P = entry.els[0].poly, xs = P.map(p => p[0]), ys = P.map(p => p[1]), m = SW + 2;
    rowOb.push({ p: F.deep ? box(Math.min(...xs) - 5, Math.min(...ys) - m, Math.min(...xs) + (spec.throat ?? THROAT), Math.max(...ys) + m) : box(Math.min(...xs) - m, Math.min(...ys) - 5, Math.max(...xs) + m, Math.min(...ys) + (spec.throat ?? THROAT)), g: 0 }); }
  for (let i = 0; i <= n; i++) if (B[i].parts) for (const q of B[i].parts) {
    if (i > 0 && B[i].rowsDown && !q.rowsDown) rowOb.push({ p: box(q.x0, A[i - 1].y + A[i - 1].w / 2 + 0.5, q.x1, A[i - 1].y + A[i - 1].w / 2 + ROW - 0.5), g: 0 });
    if (i < n && B[i].rowsUp && !q.rowsUp) rowOb.push({ p: box(q.x0, A[i].y - A[i].w / 2 - ROW + 0.5, q.x1, A[i].y - A[i].w / 2 - 0.5), g: 0 });
  }
  const lots = [];
  for (const r of live) {
    const a = A[r.i];
    for (const [side, has] of [[-1, rowsBelow(r.i)], [1, rowsAbove(r.i)]]) {
      if (!has) continue; const y0 = side < 0 ? a.y - a.w / 2 - ROW : a.y + a.w / 2, y1 = y0 + ROW;
      for (const [p, q] of spans(F, y0, y1, 'pave', rowOb).map(([p, q]) => [Math.max(p, r.ea - 4), Math.min(q, r.eb + 4)]).filter(([p, q]) => q - p >= 36)) {
        const nS = Math.floor((q - p) / SW), w = nS * SW, x0 = (p + q - w) / 2;
        lots.push({ kind: 'parking', ...rectL(x0, y0, x0 + w, y1), row: side < 0 ? 1 : -1, lock: true, islands: true, caps: nS >= 8 && PAR.style.islands !== 'square', ...stallKeys() });
      }
    }
  }
  for (const b of bayRows) { // rows running across, turned a quarter: local +v points to -x in the frame
    const nS = Math.floor((b.y1 - b.y0) / SW), h = nS * SW, y0 = (b.y0 + b.y1 - h) / 2;
    if (nS >= 4) lots.push({ kind: 'parking', x: (b.x0 + b.x1) / 2, y: y0 + h / 2, w: h, d: ROW, rotL: 90, row: b.side < 0 ? -1 : 1, lock: true, islands: true, caps: nS >= 8 && PAR.style.islands !== 'square', ...stallKeys() });
  }
  if (spec.sideRow && n > 1) { // a row of stalls along the drive that joins the aisles' ends (lib/sitecorner.mjs: before an L's side wing)
    const { x0, x1, row } = spec.sideRow, ya = A[0].y - A[0].w / 2, yb = A[n - 1].y + A[n - 1].w / 2, nS = Math.floor((yb - ya) / SW), xc = row < 0 ? x1 : x0, D = Math.abs(x1 - x0);
    const near = cons.filter(c => Math.abs(c.x + c.w / 2 * row - xc) < 10), e0 = row < 0 ? Math.min(...near.map(c => c.x - c.w / 2)) : Math.max(...near.map(c => c.x + c.w / 2)); // its aisle side on the drive, where the drive came out
    if (nS >= 4 && near.length >= n - 1) lots.push({ kind: 'parking', x: row < 0 ? e0 - D / 2 : e0 + D / 2, y: (ya + yb) / 2, w: nS * SW, d: D, rotL: 90, row, lock: true, islands: nS >= 13, caps: false, ...stallKeys() });
  }
  els.push(...lots);
  if (B[n].fill === 'rv' && spec.storage) { // RV / boat stalls (12 x 40, back-in) along the last aisle, as many as asked
    let left = spec.prog?.storage?.rv || 0; const a = A[n - 1], W0 = S.STORAGE.rvW, y0 = a.y + a.w / 2, y1 = y0 + S.STORAGE.rvD;
    for (const r of live.filter(q => q.i === n - 1)) for (const [p, q] of spans(F, y0, y1, 'pave', rowOb).map(([p, q]) => [Math.max(p, r.ea), Math.min(q, r.eb)]).filter(([p, q]) => q - p >= 3 * W0)) {
      const k = Math.min(left, Math.floor((q - p) / W0)); if (k < 3) continue; left -= k; const x0 = (p + q - k * W0) / 2;
      els.push({ kind: 'parking', ...rectL(x0, y0, x0 + k * W0, y1), row: -1, lock: true, islands: false, sw: W0, sd: S.STORAGE.rvD, sa: a.w, rv: true, name: '', note: 'RV / boat · ' + W0 + ' × ' + S.STORAGE.rvD + ' ft' });
    }
  }
  // 8. buildings in their bands
  const bOb = driveOb.filter(o => !o.d.aisle && !o.d.con).map(o => ({ p: o.p, g: o.d.turn ? 6 : 14 })).concat(cons.map(c => ({ p: box(c.x - c.w / 2, A[c.i].y, c.x + c.w / 2, A[c.i + 1].y), g: spec.storage ? 4 + (c.end ? R * 0.3 : 0) : 12 + (c.end ? R * 0.5 : 0) })), /* (storage: drive-up doors face the aisles, so rows run close to a cross drive) */ driveOb.filter(o => o.d.con && o.d.path).map(o => ({ p: o.p, g: 1 }))) /* aisles: the bands already keep clear; curves: their own outline */.concat(bayOb.map(o => ({ p: o.p, g: 10 })), reserve, obst);
  const left = { all: spec.footLeft ?? Infinity, ...(spec.footByZone || {}) }, homesLeft = { ...(spec.unitsByZone || {}) };
  // a requested number of buildings: spread over the building rows by their length, front rows first
  const counts = spec.countByZone || (spec.count ? { all: spec.count } : null), plan8 = new Map(), keyOf = b => b.zone != null && left[b.zone] != null ? b.zone : 'all';
  if (counts) {
    const segs = [];
    for (let i = 0; i <= n; i++) for (const b of partsOf(i)) if (b.fill === 'bldg') { const band = blockBand(i, b); if (band) clipX(spans(F, band[0], band[1], 'build', bOb), b).forEach(([p, q]) => segs.push({ i, b, key: keyOf(b), p, q, L: q - p, c: 0 })); }
    for (const [key, N] of Object.entries(counts)) {
      const mine = segs.filter(g => String(g.key) === String(key)), g0 = mine[0]?.b, { min, gap } = splitRule(g0?.use); if (!mine.length || !(N > 0)) continue;
      mine.forEach(g => { g.cap = Math.max(0, Math.floor((g.L + gap) / (min + gap))); });
      const tot = mine.reduce((s, g) => s + (g.cap ? g.L : 0), 0) || 1; let placed = 0;
      mine.forEach(g => { g.raw = g.cap ? N * g.L / tot : 0; g.c = Math.min(g.cap, Math.floor(g.raw)); placed += g.c; });
      while (placed < N) { const g = mine.filter(x => x.c < x.cap).sort((a, b) => (b.raw - b.c) - (a.raw - a.c) || a.i - b.i)[0]; if (!g) break; g.c++; placed++; }
      mine.forEach(g => { if (g.c) { const k = g.i + ':' + (g.b.zone ?? ''), l = plan8.get(k) || []; l.push(g); plan8.set(k, l); } });
      if (placed < N) notes.push('room for ' + placed + ' of the ' + N + ' buildings asked for');
    }
  }
  for (let i = 0; i <= n; i++) {
    for (const b of partsOf(i)) {
      const key = keyOf(b);
      if (b.fill === 'bldg' && counts?.[key]) { // so many buildings, each an even share of the floor area wanted
        const band = blockBand(i, b), segs = plan8.get(i + ':' + (b.zone ?? '')) || []; if (!band || !segs.length) continue;
        const D = band[1] - band[0], N = counts[key], fo = formOf(b.use, D, b.floors || S.USES[b.use].floors, 200), each = Number.isFinite(spec.footByZone?.[key] ?? spec.footLeft) ? (spec.footByZone?.[key] ?? spec.footLeft) / N / D / fo.af : Infinity, { gap } = splitRule(b.use);
        for (const g of segs) {
          let len = Math.min(each, (g.L - (g.c - 1) * gap) / g.c); if (PAR.unitW && b.use === 'multifamily') len = Math.max(PAR.unitW, Math.floor(len / PAR.unitW + 1e-6) * PAR.unitW); const x0 = (g.p + g.q - (g.c * len + (g.c - 1) * gap)) / 2;
          for (let j = 0; j < g.c; j++) { const xa = x0 + j * (len + gap); els.push({ kind: 'building', ...rectL(xa, band[0], xa + len, band[1]), use: b.use, ...(b.zone != null ? { zone: b.zone } : {}), floors: b.floors || S.USES[b.use].floors, ...fo.props, ...(b.use === 'multifamily' && !fo.props.form && PAR.jog !== false ? { jog: 5 } : {}) }); left[key] -= len * D * fo.af; }
        }
        continue;
      }
      if (b.fill === 'bldg') { const band = blockBand(i, b); if (band && left[key] > 0) { const got = buildingsIn(F, band, { ...b, need: left[key], whole: spec.footByZone?.[key] ?? spec.footLeft }, clipX(spans(F, band[0], band[1], 'build', bOb), b)); left[key] -= got.reduce((s, e) => s + e.w * e.d, 0); els.push(...got);
        if (b.also && left.drive > 0) { // storage: drive-up units beside the climate building, a single row along the back of the band facing the aisle behind
          const sd = Math.min(S.STORAGE.single, band[1] - band[0]), b2 = [band[1] - sd, band[1]], g2 = buildingsIn(F, b2, { fill: 'bldg', use: b.use, D: sd, floors: 1, zone: 'drive', storage: 'drive', need: left.drive }, clipX(spans(F, b2[0], b2[1], 'build', bOb.concat(got.map(e => ({ p: outL(e), g: 30 })))), b));
          left.drive -= g2.reduce((s, e) => s + e.w * e.d, 0); els.push(...g2); } } }
      if (b.fill === 'homes' || b.fill === 'duplex' || b.fill === 'sfr') { const k = b.zone ?? 'all', got = homesIn(F, i, { ...b, max: homesLeft[k] ?? Infinity, prog: b.prog || spec.prog }, A, bOb, b); homesLeft[k] = (homesLeft[k] ?? Infinity) - got.reduce((s, e) => s + (e.units || 0), 0); els.push(...got); }
      if (b.fill === 'garage') { // a parking garage: one structure as long as its program wants, near the main drive, reached from the aisles both sides
        const band = blockBand(i, b), sp = band && clipX(spans(F, band[0], band[1], 'build', bOb), b).sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
        if (sp && sp[1] - sp[0] >= 120) { const L = Math.min(sp[1] - sp[0], b.len || 300), sx = spec.spineX ?? (sp[0] + sp[1]) / 2, x0 = Math.max(sp[0], Math.min(sp[1] - L, sx - L / 2)), g = { kind: 'garage', ...rectL(x0, band[0], x0 + L, band[1]), levels: b.levels || 4, name: 'Parking garage', ...(b.zone != null ? { zone: b.zone } : {}) }; els.push(g);
          const k2 = b.with != null ? String(b.with) : null; // the rest of the row: more of the zone the garage serves, beside it
          if (k2 != null && left[k2] > 0) { const got = buildingsIn(F, band, { fill: 'bldg', use: b.withUse, D: band[1] - band[0], floors: b.withFloors, zone: b.with, need: left[k2], whole: spec.footByZone?.[k2] }, clipX(spans(F, band[0], band[1], 'build', bOb.concat([{ p: outL(g), g: 30 }])), b)); left[k2] -= got.reduce((t, e) => t + e.w * e.d, 0); els.push(...got); }
        }
        else notes.push('no room for the parking garage');
      }
      if (b.fill === 'commons' && i > 0) { const lo = A[i - 1].y + A[i - 1].w / 2 + 15, hi = i < n ? A[i].y - A[i].w / 2 - 15 : profile(F).p[1] - 15; if (hi - lo > 60) { els.push(...commonsIn(F, [lo, hi], spec, bOb, b)); (spec.parkBands ||= []).push([lo - 15, hi + 15]); } } // at the back too; what's left of it is a park
    }
  }
  // 9. truck courts (an aisle of kind 'truck' is the court itself)
  for (const e of els.filter(e => e.kind === 'drive' && e.aisle && A[e.aisle.i].kind === 'truck')) { e.kind = 'truck'; e.name = 'Truck court'; e.note = A[e.aisle.i].w + ' ft · dock doors'; }
  return { els, notes, cons, live, entry, fenceY: spec.storage ? blockBand(spec.fenceBlock ?? 1)?.[0] : null };
}

const THROAT = 50; // ft in from the street at an entry with no parking along it (attempt() sizes it to the traffic: 30 to 75)
const rectL = (x0, y0, x1, y1) => ({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, d: y1 - y0 });

// the entry drive. Across: from the front line straight up to the first aisle, at a connection or the middle of the
// frontage. Deep: the aisle nearest the middle of the frontage runs straight out to the street.
function makeEntry(F, spec, live, cons) {
  const e = spec.entry || {}, w = e.w || 30, Rc = 25, A = spec.aisles;
  const fronts = F.rr.map((a, k) => F.rules[k].role === 'front' ? [a, F.rr[(k + 1) % F.rr.length]] : null).filter(Boolean);
  // where a ray from p going -y (across) or -x (deep) meets the front line
  const hitFront = (p, deep) => { let best = null; for (const [a, b] of fronts) { const ax = deep ? 1 : 0, ay = 1 - ax, lo = Math.min(a[ax], b[ax]), hi = Math.max(a[ax], b[ax]); if (p[ax] < lo || p[ax] > hi || Math.abs(b[ax] - a[ax]) < 1e-6) continue; const t = (p[ax] - a[ax]) / (b[ax] - a[ax]), v = a[ay] + (b[ay] - a[ay]) * t; if (v <= p[ay] && (best == null || v > best)) best = v; } return best; };
  const sideNeed = F.rules.map(r => r.role === 'front' ? -1 : r.pave);
  const fits = poly => !(spec.entryAvoid || []).some(r => S.rectsOverlap({ poly }, { poly: r }, 0)) && poly.every(p => S.inRing(p, F.rr) || fronts.some(([a, b]) => S.segDist(p, a, b) < 2)) &&
    F.rr.every((a, k) => sideNeed[k] < 0 || poly.every((p, i) => S.segSeg(p, poly[(i + 1) % poly.length], a, F.rr[(k + 1) % F.rr.length]) >= sideNeed[k] - 0.5));
  const cands = [];
  if (!F.deep) {
    const first = live.filter(r => r.i === 0); if (!first.length) return null;
    const fx = fronts.flatMap(s => s.map(p => p[0])), mid = (Math.min(...fx) + Math.max(...fx)) / 2;
    const xs = new Set([mid, spec.spineX, e.at].filter(v => v != null)); for (const c of cons.filter(c => c.i === 0)) xs.add(c.x); for (const r of first) { xs.add((r.ea + r.eb) / 2); xs.add(r.ea + (r.eb - r.ea) * 0.3); xs.add(r.ea + (r.eb - r.ea) * 0.7); }
    for (const x of xs) {
      const r = first.find(r => x - w / 2 >= r.ea - 1 && x + w / 2 <= r.eb + 1); if (!r) continue;
      const top = A[0].y + A[0].w / 2, yl = hitFront([x - w / 2 - Rc, top], false), yr = hitFront([x + w / 2 + Rc, top], false); if (yl == null || yr == null) continue;
      const poly = entryPoly(x, yl, yr, top, w, Rc); if (!fits(poly)) continue;
      const aligned = cons.some(c => c.i === 0 && Math.abs(c.x - x) < 2) || Math.abs((spec.spineX ?? -1e9) - x) < 2;
      cands.push({ x, poly, r, score: Math.abs(x - (e.at ?? mid)) * (e.at != null ? 3 : 1) - (aligned ? 40 : 0) + (top - Math.max(yl, yr)) * 0.2 });
    }
  } else {
    const fy = fronts.flatMap(s => s.map(p => p[1])), mid = (Math.min(...fy) + Math.max(...fy)) / 2;
    for (const r of live) {
      const y = A[r.i].y; if (A[r.i].kind === 'truck' || A[r.i].kind === 'service') continue;
      const xl = hitFront([r.ea, y - w / 2 - Rc], true), xr = hitFront([r.ea, y + w / 2 + Rc], true); if (xl == null || xr == null) continue;
      const poly = entryPoly(y, xl, xr, r.ea + 2, w, Rc).map(([u, v]) => [v, u]); if (!fits(poly)) continue;
      cands.push({ y, poly, r, score: Math.abs(y - (e.at ?? mid)) });
    }
  }
  if (!cands.length) return null;
  const c = cands.sort((a, b) => a.score - b.score)[0], els = [{ kind: 'drive', poly: c.poly, name: 'Main entry', note: e.boulevard ? 'Boulevard · ' + w + ' ft' : w + ' ft driveway', entry: true }];
  if (e.boulevard) { // a planted median down the middle for the first stretch
    const ys = c.poly.map(p => F.deep ? p[0] : p[1]), base = Math.max(...(F.deep ? [c.poly[0][0], c.poly[1][0]] : [c.poly[0][1], c.poly[1][1]])) + Rc + 6, len = Math.min(140, Math.max(...ys) - base - 45);
    if (len > 30) { const m = stadium(F.deep ? c.y : c.x, base, base + len, 5, F.deep); els.push({ kind: 'green', poly: m, name: '', trees: false, median: true, island: true }); }
  }
  return { els, aisle: c.r, side: F.deep ? -1 : 0, at: F.deep ? [c.r.ea, c.y] : [c.x, spec.aisles[0].y], x: c.x, y: c.y };
}
// a driveway in plan: width w from the front line (yl at its left curb return, yr at its right) up to `top`, with
// curb returns of radius Rc. In the frame's across direction (x across, y in from the street).
function entryPoly(x, yl, yr, top, w, Rc) {
  const out = [[x - w / 2 - Rc, yl - 1], [x + w / 2 + Rc, yr - 1]];
  for (let k = 0; k <= 6; k++) { const t = -Math.PI / 2 - k * Math.PI / 12; out.push([x + w / 2 + Rc + Rc * Math.cos(t), yr + Rc + Rc * Math.sin(t)]); }
  out.push([x + w / 2, top], [x - w / 2, top]);
  for (let k = 0; k <= 6; k++) { const t = -k * Math.PI / 12; out.push([x - w / 2 - Rc + Rc * Math.cos(t), yl + Rc + Rc * Math.sin(t)]); }
  return out;
}
// a rounded strip (median, island) from y0 to y1 at x, half-width h
function stadium(x, y0, y1, h, swap) {
  const out = []; for (let k = 0; k <= 8; k++) { const t = Math.PI + k * Math.PI / 8; out.push([x + h * Math.cos(t), y0 + h + h * Math.sin(t)]); }
  for (let k = 0; k <= 8; k++) { const t = k * Math.PI / 8; out.push([x + h * Math.cos(t), y1 - h + h * Math.sin(t)]); }
  return swap ? out.map(([u, v]) => [v, u]) : out;
}

// split the building band's free stretches into buildings
function buildingsIn(F, band, b, sp) {
  const out = [], D = band[1] - band[0], use = b.use, U = S.USES[use];
  const rule = use === 'multifamily' ? [Math.min(110, PAR.maxLen * 0.6), Math.min(210, PAR.maxLen * 0.85), PAR.maxLen, PAR.bldgGap] : use === 'industrial' ? [150, 900, 1100, 70] : use === 'storage' ? (b.storage === 'drive' ? [40, 200, 250, 20] : [30, 1e6, 1e6, 0]) : use === 'restaurant' ? [40, 70, b.one ? 200 : 90, 60] : [60, b.len || 1e6, b.len || 1e6, 0];
  const [lo, T, hi, gap] = rule, fo = formOf(use, D, b.floors || U.floors, Math.min(T, 300)), af = fo.af;
  let left = b.need ?? Infinity; // floor area still wanted (sq ft of footprint)
  for (const [p, q] of sp.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))) {
    if (use === 'storage' && b.storage !== 'drive' && out.length) break; // one climate-controlled building (or office)
    let L = q - p; if (L < lo || left <= 0) continue;
    if (left !== Infinity && L > left / D / af) L = Math.max(lo, left / D / af);
    if ((out.length || b.whole && left < b.whole * 0.9) && use !== 'multifamily' && use !== 'restaurant' && L < Math.max(lo, D * 0.8)) continue; // what's left over: not a sliver of a building in another gap
    let k = Math.max(1, Math.round((L + gap) / (T + gap))); while (k > 1 && (L - (k - 1) * gap) / k < lo) k--; while ((L - (k - 1) * gap) / k > hi) k++;
    let len = (L - (k - 1) * gap) / k; if (PAR.unitW && use === 'multifamily') { len = Math.floor(len / PAR.unitW + 1e-6) * PAR.unitW; if (len < PAR.unitW) continue; L = k * len + (k - 1) * gap; } // whole units
    const x0 = b.at === 'right' ? q - L : b.at === 'left' ? p : (p + q - L) / 2;
    for (let j = 0; j < k; j++) { const xa = x0 + j * (len + gap); out.push({ kind: 'building', ...rectL(xa, band[0], xa + len, band[1]), use, ...(b.zone != null ? { zone: b.zone } : {}), ...(b.storage ? { storage: b.storage } : {}), floors: b.floors || U.floors, ...fo.props, ...(use === 'multifamily' && !fo.props.form && PAR.jog !== false ? { jog: 5 } : {}), ...(b.note ? { note: b.note } : {}) }); }
    left -= L * D * af;
  }
  return out;
}

// the building shape chosen under Site parameters: an L, a U round a courtyard (wings as deep as an apartment bar, or
// half an office's depth), or a tower on a two-floor podium (4 floors and up). af: its share of the plain box's floor
// area, so buildings are drawn that much longer and a sized program still gets its floor area.
function formOf(use, D, floors, len) {
  const f = PAR.form; if (!f || f === 'bar' || ['townhomes', 'duplex', 'sfr', 'amenity', 'restaurant', 'industrial', 'storage'].includes(use)) return { props: {}, af: 1 };
  if (f === 'tower') { if ((floors || 1) < 4) return { props: {}, af: 1 }; const e = { kind: 'building', x: 0, y: 0, w: len, d: D, floors, form: 'tower', podium: 2 }; return { props: { form: 'tower', podium: 2 }, af: S.gfaOf(e) / (len * D * floors) }; }
  const wing = use === 'multifamily' ? +PAR.bldgDepth || 60 : Math.max(40, D * 0.5), e = { kind: 'building', x: 0, y: 0, w: len, d: D, form: f, wing };
  return { props: { form: f, wing }, af: S.footArea(e) / (len * D) };
}
// how short a building may be and the space between buildings, when a number of buildings is asked for
function splitRule(use) {
  if (use === 'multifamily') return { min: 80, gap: PAR.bldgGap || 30 };
  if (use === 'industrial') return { min: 120, gap: 60 };
  if (use === 'storage') return { min: 40, gap: 20 };
  if (use === 'restaurant') return { min: 40, gap: 60 };
  return { min: 30, gap: 24 }; // shops: a 24 ft breezeway or walk between buildings
}

// townhome rows (rear-load: garages on the lane, front doors on a green court) and duplexes (front-load off a street)
let guestOwed = 0; // townhome guest spaces still owed, carried along the rows of one layout (layoutStack starts it at 0)
function homesIn(F, i, b, A, bOb, part) {
  if (b.fill === 'sfr') return lotsIn(F, i, b, A, bOb, part);
  const out = [], n = A.length, th = b.fill === 'homes', D = 40, apron = th ? 5 : 25, unitW = th ? 24 : 64, gap = th ? 20 : 22;
  const bands = [];
  if (i > 0) { const y = A[i - 1].y + A[i - 1].w / 2 + apron; bands.push([y, y + D, 'down']); }
  if (i < n) { const y = A[i].y - A[i].w / 2 - apron; bands.push([y - D, y, 'up']); }
  if (bands.length === 2 && bands[0][1] + 20 > bands[1][0]) bands.pop();
  // townhomes: guest parking (a quarter space a home, a little over for the accessible stalls) in short rows of 90° stalls
  // off the lane between the rows of homes
  const guest = th ? (S.USES.townhomes.guest || 0) * 1.15 : 0;
  for (const [y0, y1, side] of bands) for (const [p, q] of spans(F, y0, y1, 'build', bOb).map(([a, c]) => [Math.max(a, part.x0 + (part.x0 > -Infinity ? 15 : 0)), Math.min(c, part.x1 - (part.x1 < Infinity ? 15 : 0))]).filter(([a, c]) => c > a)) {
    let x = p;
    const lane = side === 'down' ? y0 - apron : y1 + apron, stallsAt = (xa, n) => out.push({ kind: 'parking', ...rectL(xa, side === 'down' ? lane : lane - ROW, xa + n * SW, side === 'down' ? lane + ROW : lane), row: side === 'down' ? -1 : 1, lock: true, islands: false, name: '', note: 'Guest parking', ...stallKeys() });
    if (th) while (x + 3 * unitW <= q && b.max > 0) {
      if (guestOwed >= 4) { const n = Math.min(8, Math.round(guestOwed)), xa = x > p ? x - gap + 6 : p; if (xa + n * SW + 6 + 3 * unitW <= q) { stallsAt(xa, n); guestOwed -= n; x = xa + n * SW + 6; } }
      const k = Math.min(b.maxUnits || 6, Math.floor((q - x) / unitW), Math.max(3, b.max)); if (k < 3) break; b.max -= k; out.push({ kind: 'building', ...rectL(x, y0, x + k * unitW, y1), use: 'townhomes', floors: b.floors || 3, units: k, note: k + ' units · ' + unitW + '×' + D + ' · rear-load' }); x += k * unitW + gap; guestOwed += k * guest;
    }
    if (th && guestOwed > 0.3) { const xa = x > p ? x - gap + 6 : p, n = Math.min(8, Math.ceil(guestOwed - 0.3), Math.floor((q - xa) / SW)); if (n >= 1) { stallsAt(xa, n); guestOwed -= n; } } // in the strip left at the end of the row, else between the rows when it falls behind
    if (!th) while (x + unitW <= q && b.max > 0) { b.max -= 2; out.push({ kind: 'building', ...rectL(x, y0, x + unitW, y1), use: 'duplex', floors: b.floors || 2, units: 2, note: 'Front-load · private yards' }); x += unitW + gap; }
  }
  return out;
}

// single-family lots along the streets: each lot the width its home type needs (the mix in turn), the home 20 ft back from
// the right-of-way with a driveway to the street, lot lines drawn
function lotsIn(F, i, b, A, bOb, part) {
  const out = [], n = A.length, prog = b.prog || {}, lotD = prog.lotD || 115, mix = (prog.homeMix || S.HOME_MIX).filter(t => t.pct > 0), tot = mix.reduce((s, t) => s + t.pct, 0) || 1, count = {};
  const next = placed => mix.reduce((best, t) => { const want = (placed + 1) * t.pct / tot - (count[t.stories] || 0); return !best || want > best.want ? { t, want } : best; }, null).t;
  const sides = [];
  if (i > 0) { const y = A[i - 1].y + A[i - 1].w / 2 + 11; sides.push({ ly0: y, ly1: y + lotD, front: y, dir: 1 }); }
  if (i < n) { const y = A[i].y - A[i].w / 2 - 11; sides.push({ ly0: y - lotD, ly1: y, front: y, dir: -1 }); }
  if (sides.length === 2 && sides[0].ly1 > sides[1].ly0 + 1) { const mid = (sides[0].ly1 + sides[1].ly0) / 2; sides[0].ly1 = mid; sides[1].ly0 = mid; }
  let placed = 0;
  for (const sd of sides) {
    const clipP = ([a, c]) => [Math.max(a, part.x0 + (part.x0 > -Infinity ? 15 : 0)), Math.min(c, part.x1 - (part.x1 < Infinity ? 15 : 0))];
    const lotSp = spans(F, Math.min(sd.ly0, sd.ly1 - 30) + 2, sd.ly1 - 2, 'pave', bOb), hs = {}; // lot lines may run to the landscape buffer
    const houseSp = T => { const hb = sd.dir > 0 ? [sd.front + 20, sd.front + 20 + T.d] : [sd.front - 20 - T.d, sd.front - 20]; return hs[T.d] ||= { hb, sp: spans(F, hb[0], hb[1], 'build', bOb) }; };
    for (const [p, q] of lotSp.map(clipP).filter(([a, c]) => c - a > 40)) {
      let x = p;
      while (b.max > 0) {
        const t = next(placed), T0 = S.HOME_TYPES[t.stories]; if (x + T0.lotW > q) break;
        const plans = HOUSE_PLANS.filter(h => h.floors === t.stories && h.lotW <= T0.lotW && !/rear-load/.test(h.id)), H = plans.length && PAR.housePlans !== false ? plans[(placed * 7 + Math.round(x)) % plans.length] : null; // the builder's plans for that lot, varied along the street
        const T = H ? { ...T0, w: H.w, d: H.d, sf: H.sf, plan: H } : T0, cx = x + T0.lotW / 2, { hb, sp } = houseSp(T);
        if (sp.some(([a, c]) => a <= cx - T.w / 2 && c >= cx + T.w / 2)) {
          out.push({ kind: 'lot', ...rectL(x, sd.ly0, x + T.lotW, sd.ly1), name: '', note: T.lotW + ' × ' + Math.round(sd.ly1 - sd.ly0) + ' ft lot' });
          out.push({ kind: 'building', ...rectL(cx - T.w / 2, hb[0], cx + T.w / 2, hb[1]), use: 'sfr', floors: t.stories, units: 1, sf: T.sf, nowalk: true, note: (T.plan ? T.plan.note : t.stories + '-story · ' + T.sf.toLocaleString('en-US') + ' sf'), ...(T.plan ? { type: T.plan.id } : {}) });
          const dw = sd.dir > 0 ? [sd.front - 11, sd.front + 20] : [sd.front - 20, sd.front + 11], gx = cx + T.w / 2 - 10;
          out.push({ kind: 'plaza', ...rectL(gx - 8, dw[0], gx + 8, dw[1]), name: '', note: 'Driveway' });
          count[t.stories] = (count[t.stories] || 0) + 1; placed++; b.max--;
        }
        x += T0.lotW;
      }
    }
  }
  return out;
}

// what a commons holds, as words from the program: a pool always comes with the building it needs (restrooms, the
// pump room, someone at the desk), so a pool alone means a community centre with its pool; a clubhouse or an amenity
// centre is that centre. When the apartments' own clubhouse and pool serve everyone (no for-sale homes), the commons
// is the park: no second clubhouse, no second pool.
export function commonsWants(items, { clubhouse = false, homes = false } = {}) {
  const want = new Set((items?.length ? items : ['lake', 'pavilion', 'courts', 'playground', 'restrooms']).map(s => String(s).toLowerCase().trim()));
  for (const k of ['clubhouse', 'community center', 'amenity center', 'club house', 'centre']) if (want.delete(k)) want.add('center');
  if (want.has('pool')) want.add('center'); if (want.has('center')) want.add('pool');
  if (clubhouse && !homes) { want.delete('center'); want.delete('pool'); }
  return want;
}
// a commons: the community centre and its pool by the main drive, then the pavilion, courts and playground beside
// them, all along the edge that meets the drive (where people arrive and park); the land behind becomes the amenity
// lake and lawns
function commonsIn(F, band, spec, ob, b) {
  const out = [], want = commonsWants(b.items, spec.commons);
  const put = (key, kind, w, d, extra, prefer, near) => {
    if (!want.has(key)) return; const all = ob.concat(out.map(e => ({ p: outL(e), g: 20 })));
    const y0 = Math.min(band[0] + 12, band[1] - d), y1 = y0 + d; // against the drive, never out in the middle of the park
    const sp = spans(F, y0, y1, 'pave', all).map(([p, q]) => [Math.max(p, b.x0 + 20), Math.min(q, b.x1 - 20)]).filter(([p, q]) => q - p >= w); if (!sp.length) return;
    const xs = sp.flatMap(([p, q]) => [p, q - w, ...[sx - w / 2, sx + 30, sx - w - 30, sx + 140, sx - w - 140, ...(near != null ? [near, near - w] : [])].map(v => Math.max(p, Math.min(q - w, v)))]), x = xs.sort((a, c) => prefer(a) - prefer(c))[0]; // anywhere along the band, by the main drive first
    out.push({ kind, ...rectL(x, y0, x + w, y1), ...extra });
  };
  const sx = spec.spineX ?? (F.X0 + F.X1) / 2;
  if (want.has('center')) { // a community centre: the building, its pool and a row of parking off the drive below
    put('center', 'building', 110, 70, { use: 'amenity', floors: 1, name: 'Community center', note: 'Event hall · fitness · offices' }, x => Math.abs(x + 55 - sx));
    const c = out.find(e => e.name === 'Community center');
    if (c) { // its pool on a deck against one side of it (the side toward the main drive first), like the apartments' clubhouse
      const cy0 = c.y - c.d / 2, cy1 = c.y + c.d / 2, dw = 100, free = spans(F, cy0, cy1, 'pave', ob).map(([p, q]) => [Math.max(p, b.x0 + 20), Math.min(q, b.x1 - 20)]);
      for (const side of (c.x < sx ? [1, -1] : [-1, 1])) {
        const x0 = side > 0 ? c.x + c.w / 2 : c.x - c.w / 2 - dw, x1 = x0 + dw; if (!free.some(([p, q]) => p <= x0 + 0.5 && q >= x1 - 0.5)) continue;
        out.push({ kind: 'plaza', ...rectL(x0, cy0, x1, cy1), name: '', note: 'Pool deck' }, { kind: 'pool', ...rectL(x0 + 12, c.y - 17, x1 - 12, c.y + 17), name: 'Pool', note: 'Resort-style' }); break;
      }
      const y0 = band[0] - 14, row = { kind: 'parking', ...rectL(c.x - 81, y0, c.x + 81, y0 + 18), name: '', note: '' }; if (!ob.concat(out.map(e => ({ p: outL(e), g: 2 }))).some(o => S.rectsOverlap({ poly: outL(row) }, { poly: o.p }, -o.g))) out.push(row);
    }
  }
  put('pavilion', 'building', 80, 50, { use: 'amenity', floors: 1, name: 'Pavilion', note: 'Open-air · covered' }, x => Math.abs(x + 40 - sx));
  put('courts', 'court', 128, 120, { name: 'Pickleball', note: '4 courts' }, x => Math.abs(Math.abs(x + 64 - sx) - 300)); // a little off the pool and the lawns (the noise), still in the group
  put('playground', 'play', 76, 56, { name: 'Playground' }, x => Math.abs(Math.abs(x + 38 - sx) - 160));
  put('restrooms', 'building', 36, 24, { use: 'amenity', floors: 1, name: 'Restrooms' }, x => Math.abs(x - sx - 70));
  return out;
}

// apartments: the clubhouse (leasing, fitness) right by the entry with its pool deck beside it
function amenityCenter(F, spec, blockBand, ob, entry) {
  const want = 90 + 10 + 110; let best = null;
  for (let i = 0; i <= spec.blocks.length - 1; i++) for (const part of spec.blocks[i].parts || [{ ...spec.blocks[i], x0: -Infinity, x1: Infinity }]) {
    const band = blockBand(i, part); if (!band || part.use !== 'multifamily') continue;
    for (const [p, q] of spans(F, band[0], band[1], 'build', ob.map(o => ({ p: o.p, g: o.d ? 14 : o.g }))).map(([a, c]) => [Math.max(a, part.x0 + 15), Math.min(c, part.x1 - 15)])) {
      if (q - p < 150) continue;
      for (const end of [-1, 1]) {
        const x = end < 0 ? p : q, at = F.deep ? [x, (band[0] + band[1]) / 2] : [x, (band[0] + band[1]) / 2], d = Math.hypot(at[0] - entry.at[0], at[1] - entry.at[1]);
        if (!best || d < best.d) best = { d, p, q, end, band };
      }
    }
  }
  if (!best) return null;
  const { p, q, end, band } = best, L = Math.min(want, q - p), D = band[1] - band[0], cw = 90, cd = Math.min(D, 60), out = [];
  const cx0 = end < 0 ? p : q - cw, deck0 = end < 0 ? p + cw : q - L, deck1 = end < 0 ? p + L : q - cw;
  out.push({ kind: 'building', ...rectL(cx0, band[0] + (D - cd) / 2, cx0 + cw, band[0] + (D + cd) / 2), use: 'amenity', floors: 1, name: 'Clubhouse', note: 'Leasing · fitness · lounge', nowalk: false });
  if (deck1 - deck0 >= 60) {
    out.push({ kind: 'plaza', ...rectL(deck0, band[0], deck1, band[1]), name: '', note: 'Pool deck' });
    const pw = Math.min(70, deck1 - deck0 - 24), pd = Math.min(32, D - 24), pc = [(deck0 + deck1) / 2, (band[0] + band[1]) / 2];
    out.push(PAR.style.ponds === 'organic' ? { kind: 'pool', poly: kidney(pc, pw, pd), name: 'Pool', note: 'Resort-style' } : { kind: 'pool', ...rectL(pc[0] - pw / 2, pc[1] - pd / 2, pc[0] + pw / 2, pc[1] + pd / 2), ...(PAR.style.ponds === 'rounded' ? { shape: 'round' } : {}), name: 'Pool', note: '' });
  }
  return { els: out };
}
// a pool outline: a rounded, slightly pinched oval w x d centred on c
function kidney(c, w, d) {
  const out = []; for (let k = 0; k < 40; k++) { const t = k / 40 * 2 * Math.PI, pinch = 1 - 0.18 * Math.max(0, Math.sin(t)) * Math.cos(t * 2) ** 2; out.push([c[0] + w / 2 * Math.cos(t), c[1] + d / 2 * Math.sin(t) * pinch]); }
  return out;
}

// pad sites along the street: a restaurant / coffee building with a drive-thru lane wrapping it, parking off the first aisle
function padsAlong(F, spec, band, ob) {
  const els = [], obs = []; if (!band) return { els, ob: obs };
  const top = band[1], bw = 60, bd = 50, lane = 12;
  const sp = spans(F, top - bd - lane - 4, top, 'build', ob.map(o => ({ p: o.p, g: o.d?.entry ? 30 : o.g + 4 }))).filter(([p, q]) => q - p >= bw + 2 * lane + 20);
  let made = 0;
  const at = spec.padAt ? ([p, q]) => [spec.padAt > 0 ? q - bw - lane - 6 : p + lane + 6] : null; // a pad at the street corner (lib/sitecorner.mjs): from that end
  for (const [p, q] of spec.padAt > 0 ? sp.slice().reverse() : sp) for (let x = at ? at([p, q])[0] : p + lane + 6; (at ? x >= p + lane + 5.99 && x + bw + lane + 6 <= q + 0.01 : x + bw + lane + 6 <= q) && made < spec.pads; x += at ? 1e9 : bw + 2 * lane + 110) {
    const y1 = top, y0 = y1 - bd, b = { kind: 'building', ...rectL(x, y0, x + bw - 16, y1), use: 'restaurant', floors: 1, note: 'QSR / coffee · drive-thru' }, patio = { kind: 'patio', ...rectL(x + bw - 15, y1 - 34, x + bw, y1), name: '', note: 'Outdoor seating' }; // the patio at the front corner, by the door
    const path = [[x - lane / 2 - 4, top + WALK + ROW + 2], [x - lane / 2 - 4, y0 - lane / 2 - 4], [x + bw + lane / 2 + 4, y0 - lane / 2 - 4], [x + bw + lane / 2 + 4, top + WALK + ROW + 2]];
    const dt = { kind: 'drive', path, width: lane, r: 14, name: '', note: 'Drive-thru lane' };
    els.push(b, patio, dt); obs.push({ p: S.outline(dt), g: 1 }, { p: S.outline(b), g: 4 }, { p: S.outline(patio), g: 2 }); made++;
  }
  return { els, ob: obs };
}

// ---------- leftover land: pond, lawns, dog park, playground ----------
// Paint everything placed onto a grid, keep the open land inside the landscape buffer, drop slivers, and trace each
// open piece as a smooth outline.
function openLand(F, els, margin = {}) {
  const c = Math.max(4, Math.min(10, Math.sqrt(F.site) / 110)), X0 = F.X0, Y0 = F.Y0, nx = Math.ceil((F.X1 - X0) / c) + 1, ny = Math.ceil((F.Y1 - Y0) / c) + 1, M = new Uint8Array(nx * ny);
  const at = (i, j) => [X0 + (i + 0.5) * c, Y0 + (j + 0.5) * c];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const q = at(i, j); if (!S.inRing(q, F.rr)) continue; let ok = true; for (let k = 0; k < F.rr.length && ok; k++) if (S.segDist(q, F.rr[k], F.rr[(k + 1) % F.rr.length]) < F.pave[k]) ok = false; if (ok) M[j * nx + i] = 1; }
  for (const e of els) {
    const g = margin[e.kind] ?? 4, o = e.kind === 'green' && !e.median ? null : outL(e); if (!o) continue;
    const xs = o.map(p => p[0]), ys = o.map(p => p[1]), i0 = Math.max(0, Math.floor((Math.min(...xs) - g - X0) / c)), i1 = Math.min(nx - 1, Math.ceil((Math.max(...xs) + g - X0) / c)), j0 = Math.max(0, Math.floor((Math.min(...ys) - g - Y0) / c)), j1 = Math.min(ny - 1, Math.ceil((Math.max(...ys) + g - Y0) / c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { if (!M[j * nx + i]) continue; const q = at(i, j); if (S.inRing(q, o) || o.some((p, k) => S.segDist(q, p, o[(k + 1) % o.length]) < g)) M[j * nx + i] = 0; }
  }
  // opening: drop anything narrower than ~24 ft
  const r = Math.max(1, Math.round(17 / c)), er = new Uint8Array(M.length), di = new Uint8Array(M.length);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let v = 1; for (let dj = -r; dj <= r && v; dj++) for (let d2 = -r; d2 <= r && v; d2++) { const x = i + d2, y = j + dj; if (x < 0 || y < 0 || x >= nx || y >= ny || !M[y * nx + x]) v = 0; } er[j * nx + i] = v; }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (er[j * nx + i]) for (let dj = -r; dj <= r; dj++) for (let d2 = -r; d2 <= r; d2++) { const x = i + d2, y = j + dj; if (x >= 0 && y >= 0 && x < nx && y < ny && M[y * nx + x]) di[y * nx + x] = 1; }
  // pieces, each with its outline and its most open point (for a playground or a fountain)
  const lab = new Int32Array(nx * ny), pieces = [];
  for (let s0 = 0; s0 < nx * ny; s0++) if (di[s0] && !lab[s0]) {
    const id = pieces.length + 1, st = [s0], cells = []; lab[s0] = id;
    while (st.length) { const q = st.pop(); cells.push(q); const i = q % nx, j = (q - i) / nx; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = i + a, y = j + b; if (x < 0 || y < 0 || x >= nx || y >= ny) continue; const t = y * nx + x; if (di[t] && !lab[t]) { lab[t] = id; st.push(t); } } }
    const area = cells.length * c * c; if (area < 2500) continue;
    const ring = trace(lab, id, nx, ny, c, X0, Y0); if (ring.length < 4) continue;
    // distance to the edge of the piece (a breadth-first walk in from the edge cells), for the most open point and for ponds
    const dist = new Map(cells.map(q => [q, 1e9])), inP = q => lab[q] === id;
    for (const q of cells) { const i = q % nx, j = (q - i) / nx; if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => { const x = i + a, y = j + b; return x < 0 || y < 0 || x >= nx || y >= ny || !inP(y * nx + x); })) dist.set(q, 1); }
    { const qd = cells.filter(q => dist.get(q) === 1); for (let h = 0; h < qd.length; h++) { const q = qd[h], i = q % nx, j = (q - i) / nx, d = dist.get(q); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = i + a, y = j + b; if (x < 0 || y < 0 || x >= nx || y >= ny) continue; const t = y * nx + x; if (dist.has(t) && dist.get(t) > d + 1) { dist.set(t, d + 1); qd.push(t); } } } }
    let core = cells[0]; for (const q of cells) if (dist.get(q) > dist.get(core)) core = q;
    // the part of the piece at least t cells in from its edge, as an outline (ponds sit inside their piece)
    const sub = t => { const L2 = new Int32Array(nx * ny); let k = 0; for (const q of cells) if (dist.get(q) >= t) { L2[q] = 1; k++; } return k ? { ring: trace(L2, 1, nx, ny, c, X0, Y0), area: k * c * c } : null; };
    const areaAt = t => cells.reduce((s, q) => s + (dist.get(q) >= t ? 1 : 0), 0) * c * c;
    const rect = t => { // the biggest square-cornered rectangle in the part t cells in (histogram method)
      const is = cells.map(q => q % nx), js = cells.map(q => (q - q % nx) / nx), i0 = Math.min(...is), i1 = Math.max(...is), j0 = Math.min(...js), j1 = Math.max(...js), W = i1 - i0 + 1, h = new Int32Array(W); let best = null;
      for (let j = j0; j <= j1; j++) {
        for (let i = 0; i < W; i++) { const q = j * nx + i0 + i; h[i] = dist.has(q) && dist.get(q) >= t ? h[i] + 1 : 0; }
        const st = []; for (let i = 0; i <= W; i++) { const v = i < W ? h[i] : 0; let start = i; while (st.length && st[st.length - 1][1] >= v) { const [k, hv] = st.pop(); const a = hv * (i - k); if (!best || a > best.a) best = { a, ia: i0 + k, ib: i0 + i, jb: j + 1, ja: j + 1 - hv }; start = k; } st.push([start, v]); }
      }
      return best && best.a ? [X0 + best.ia * c, Y0 + best.ja * c, X0 + best.ib * c, Y0 + best.jb * c] : null;
    };
    // a pond of about `want` sq ft at least t cells in from the edge, as close to `to` as it gets (beside the buildings,
    // not out in the middle of land kept for later); square-cornered growth when asked for
    const blob = (to, t, want, cheb) => {
      const xy = q => at(q % nx, (q - q % nx) / nx), cand = new Set(cells.filter(q => dist.get(q) >= t)); if (!cand.size) return null;
      let s0 = null, bd = Infinity; for (const q of cand) { const [x, y] = xy(q), d = (x - to[0]) ** 2 + (y - to[1]) ** 2; if (d < bd) { bd = d; s0 = q; } }
      const conn = [s0], seen = new Set(conn); for (let h = 0; h < conn.length; h++) { const q = conn[h], i = q % nx, j = (q - i) / nx; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t2 = (j + b) * nx + i + a; if (i + a >= 0 && i + a < nx && cand.has(t2) && !seen.has(t2)) { seen.add(t2); conn.push(t2); } } }
      const [sx, sy] = xy(s0), m = q => { const [x, y] = xy(q); return cheb ? Math.max(Math.abs(x - sx), Math.abs(y - sy)) : Math.hypot(x - sx, y - sy); };
      const k = Math.min(conn.length, Math.ceil(want / (c * c))), L2 = new Int32Array(nx * ny); conn.sort((a, b) => m(a) - m(b)).slice(0, k).forEach(q => { L2[q] = 1; });
      return { ring: trace(L2, 1, nx, ny, c, X0, Y0), area: k * c * c };
    };
    // a clean rectangle of about `want` sq ft, t cells in from the edge, as near `to` as fits (a summed-area table over
    // the cells far enough in; a few proportions from square to 1:3 each way)
    const rectNear = (to, t, want) => {
      const is = cells.map(q => q % nx), js = cells.map(q => (q - q % nx) / nx), lim = a => { let lo = Infinity, hi = -Infinity; for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; } return [lo, hi]; }, [i0, i1] = lim(is), [j0, j1] = lim(js), W = i1 - i0 + 1, H = j1 - j0 + 1, I = new Int32Array((W + 1) * (H + 1)); // (loops, not Math.min(...cells): a 270-acre site has more cells than a worker's stack takes as arguments)
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const q = (j0 + j) * nx + i0 + i, v = dist.has(q) && dist.get(q) >= t ? 1 : 0; I[(j + 1) * (W + 1) + i + 1] = v + I[j * (W + 1) + i + 1] + I[(j + 1) * (W + 1) + i] - I[j * (W + 1) + i]; }
      const sum = (i, j, w, h) => I[(j + h) * (W + 1) + i + w] - I[j * (W + 1) + i + w] - I[(j + h) * (W + 1) + i] + I[j * (W + 1) + i];
      let best = null;
      for (const a of [1, 1.5, 2, 3, 5, 8, 12, 1 / 1.5, 0.5, 1 / 3, 1 / 5, 1 / 8, 1 / 12]) { // up to a long strip along a band
        const w = Math.max(3, Math.round(Math.sqrt(want * a) / c)), h = Math.max(3, Math.ceil(want / (w * c * c)));
        for (let j = 0; j + h <= H; j++) for (let i = 0; i + w <= W; i++) if (sum(i, j, w, h) === w * h) {
          const cx = X0 + (i0 + i + w / 2) * c, cy = Y0 + (j0 + j + h / 2) * c, d = Math.hypot(cx - to[0], cy - to[1]);
          if (!best || d < best.d) best = { d, b: [X0 + (i0 + i) * c, Y0 + (j0 + j) * c, X0 + (i0 + i + w) * c, Y0 + (j0 + j + h) * c] };
        }
      }
      return best?.b || null;
    };
    pieces.push({ area, ring, core: at(core % nx, (core - core % nx) / nx), room: dist.get(core) * c, sub, areaAt, rect, rectNear, blob, c });
  }
  return pieces.sort((a, b) => b.area - a.area);
}
function trace(lab, id, nx, ny, c, X0, Y0) {
  const inn = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && lab[j * nx + i] === id, next = new Map(), key = (x, y) => x + ',' + y;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (inn(i, j)) {
    if (!inn(i, j - 1)) next.set(key(i, j), [i + 1, j]); if (!inn(i + 1, j)) next.set(key(i + 1, j), [i + 1, j + 1]);
    if (!inn(i, j + 1)) next.set(key(i + 1, j + 1), [i, j + 1]); if (!inn(i - 1, j)) next.set(key(i, j + 1), [i, j]);
  }
  let best = []; const seen = new Set();
  for (const [k0] of next) { if (seen.has(k0)) continue; const loop = []; let kk = k0; while (!seen.has(kk) && next.has(kk)) { seen.add(kk); const [x, y] = kk.split(',').map(Number); loop.push([X0 + x * c, Y0 + y * c]); const nn = next.get(kk); kk = key(nn[0], nn[1]); } if (loop.length > best.length) best = loop; }
  return best;
}
// a frame-feet outline of an element (in the frame, before it's turned to the plan)
function outL(e) { if (e.poly || e.path) return S.outline(e); return S.corners({ ...e, rot: e.rotL || 0 }); }


// detention and open space from the leftover land
function finishLand(F, els, spec, stats) {
  const pieces = openLand(F, els, { building: 16, parking: 5, drive: 5, truck: 8, plaza: 8, pool: 8, court: 8, play: 6, pond: 12 }), out = [], c = Math.max(4, Math.min(10, Math.sqrt(F.site) / 110));
  const need = spec.pond || 0; let got = 0;
  const res = spec.reserve?.length ? spec.reserve : null, inRes = p => res && res.some(r => S.inRing(p.core, r));
  const order = pieces.slice().sort((a, b) => (inRes(b) - inRes(a)) || b.area - a.area);
  const used = new Set();
  for (const p of order) {
    if (got >= need * 0.95 || p.room < 22 || (got > 0 && (p.area < need * 0.3 || need - got < need * 0.3)) || out.filter(e => e.kind === 'pond').length >= 2) continue; // one pond, or two good ones: never a scatter of puddles (the rest goes underground)
    // as deep into the piece as keeps the pond near what's still needed (never closer than ~10 ft to its edge)
    let t = Math.max(2, Math.ceil(16 / p.c)); /* no thin arms: a pond is a pond, not a moat */ while (p.areaAt(t + 1) > Math.max(need - got, 8000) * 1.15 && t < 400) t++; // no bigger than the storage needs
    // a piece wrapped round a building traces round it too: go deeper until the pond is clear of everything
    const solid = els.filter(e => e.kind !== 'green' && e.kind !== 'trail' && e.kind !== 'fence').map(e => ({ poly: outL(e) }));
    let poly = null;
    const style = PAR.style.ponds; let box0 = null;
    // much more land than the pond needs: put the pond beside the buildings and keep the rest in one piece
    const B = els.filter(e => e.kind === 'building'), left = Math.max(need - got, 8000), tb = Math.max(2, Math.ceil(20 / p.c)), wide = B.length > 0 && p.areaAt(tb) > left * 2.5;
    if (wide && style === 'organic') {
      const to = [B.reduce((s, e) => s + e.x, 0) / B.length, B.reduce((s, e) => s + e.y, 0) / B.length], bl = p.blob(to, tb, left * 1.05, false);
      const q = bl && bl.ring.length >= 4 ? style === 'square' ? S.tidyRing(bl.ring, p.c * 0.9) : S.tidyRing(S.smooth(S.tidyRing(bl.ring, p.c * 0.9), 3), 0.4) : null;
      if (q && !solid.some(o => S.rectsOverlap({ poly: q }, o, 0.5))) poly = q;
    }
    const beside = !!poly || wide;
    if (!poly && style !== 'organic') { // a clean rectangle near the buildings (or the middle of its band), not the piece's leftover shape
      const to = wide ? [B.reduce((s, e) => s + e.x, 0) / B.length, B.reduce((s, e) => s + e.y, 0) / B.length] : p.core;
      for (const want of [left * 1.05, left * 0.9, left * 0.8]) { const b = p.rectNear(to, Math.max(2, Math.ceil(16 / p.c)), want); if (b && !solid.some(o => S.rectsOverlap({ poly: box(...b) }, o, 0.5))) { poly = box(...b); box0 = b; break; } }
      if (!poly) for (let k = 0, tt = t; k < 6 && !poly; k++, tt += 2) { // no rectangle holds enough (an L-shaped strip): follow the strip, with straight edges
        const sb = p.sub(tt); if (!sb || sb.ring.length < 4) break; const q = S.tidyRing(sb.ring, p.c * 1.6), qx = q.map(v => v[0]), qy = q.map(v => v[1]), compact = S.ringArea(q) / ((Math.max(...qx) - Math.min(...qx)) * (Math.max(...qy) - Math.min(...qy)) || 1) > 0.5 || !B.some(e => !HOMES.includes(e.use) && e.x > Math.min(...qx) && e.x < Math.max(...qx) && e.y > Math.min(...qy) && e.y < Math.max(...qy)); /* a straight strip, not a moat round a building */ if (q.length >= 4 && compact && !solid.some(o => S.rectsOverlap({ poly: q }, o, 0.5))) poly = q;
      }
    }
    for (let k = 0; k < 6 && !poly; k++, t += 2) {
      if (style !== 'organic') { const b = p.rect(Math.max(1, t - 1)); if (!b) break; const q = box(...b); if (!solid.some(o => S.rectsOverlap({ poly: q }, o, 0.5))) { poly = q; box0 = b; } continue; }
      const sb = p.sub(t); if (!sb || sb.ring.length < 4) break; const q = S.tidyRing(S.smooth(S.tidyRing(sb.ring, p.c * 0.9), 3), 0.4); if (!solid.some(o => S.rectsOverlap({ poly: q }, o, 0.5))) poly = q;
    }
    if (!poly) continue;
    const pondEl = box0 ? { kind: 'pond', ...rectL(...box0), ...(style === 'rounded' ? { shape: 'round' } : {}) } : { kind: 'pond', poly, labelAt: S.centroid(poly) };
    const a = S.elArea(pondEl); if (a < 3000) continue;
    if (p.area - a > 9000) out.push(beside && p.area - a > 0.6 * 43560 ? landAround(landPiece({ ...p, area: p.area - a }, spec), p, pondEl) : { ...landPiece(p, { ...spec, future: false }), name: '', note: '' });
    out.push({ ...pondEl, name: spec.lakeName || (PAR.storm?.mode === 'retention' ? 'Retention pond' : 'Detention'), note: spec.lakeName ? (PAR.storm?.mode === 'retention' ? 'Wet pond · permanent pool' : 'Wet detention') : PAR.storm?.mode === 'retention' ? 'Wet pond · permanent pool' : 'Dry basin' }); got += a; used.add(p); if (box0) poly = S.outline(pondEl);
    if (spec.trail && a > 15000 && t * p.c >= 26) out.push({ kind: 'trail', path: S.tidyRing(S.grow(poly, 14), 1), width: 6, r: 0, closed: true, name: '', note: 'Walking trail' });
  }
  stats.pond = got; stats.pondNeed = need;
  let dog = !spec.amenity, play = !spec.amenity, k = 0, fut = true;
  for (const p of pieces) {
    if (used.has(p) || p.area < 4000) continue;
    const g = landPiece(p, spec, !dog && p.area >= 9000 && p.area < 43560); if (S.ringArea(g.poly) < 3000) continue;
    if (g.name === 'Dog park') dog = true;
    if (!play && p.room >= 44 && g.name !== 'Dog park') { play = true; out.push({ kind: 'play', x: p.core[0], y: p.core[1], w: 64, d: 48, name: 'Playground' }); }
    out.push(g); k++;
  }
  return out;
}

// open land as a planted piece: a lawn, a dog park, or land kept for a future phase
// Land the plan doesn't use is not a park: a piece big enough to build on is marked for a future pad or phase.
function landPiece(p, spec, dog) {
  if (spec.parkBands?.some(([a, b]) => p.core[1] >= a && p.core[1] <= b)) { const poly = S.tidyRing(p.ring, p.c * 0.9); return { kind: 'green', poly, name: p.area > 20000 ? 'Community park' : '', note: p.area > 20000 ? (p.area / 43560).toFixed(1) + ' ac · lawn and trees' : '', trees: true, labelAt: p.core }; } // the commons: park, not land for later
  const poly = PAR.style.ponds === 'square' ? S.tidyRing(p.ring, p.c * 0.9) : S.tidyRing(S.smooth(S.tidyRing(p.ring, p.c * 0.9), 3), 0.4);
  if (spec.openSpace && p.core[1] > (spec.frontY ?? -Infinity) + 400) { const poly2 = S.tidyRing(p.ring, p.c * 0.9); return { kind: 'green', poly: poly2, name: p.area > 1.5 * 43560 ? 'Open space' : '', note: p.area > 1.5 * 43560 ? (p.area / 43560).toFixed(1) + ' ac' : '', trees: true, labelAt: p.core }; } // a filled neighbourhood: land left between the homes is open space, not land for later
  // a future pad only where a pad would really go: on the frontage, big enough for a building and its parking, two at most; the rest is landscape
  const front = spec.frontY == null || p.core[1] - spec.frontY < 360, pad = spec.padUse && front && p.area >= 0.6 * 43560 && p.room >= 70 && (spec.pads = (spec.pads || 0) + 1) <= 2, big = p.area >= (spec.padUse ? 3 : 1) * 43560 && p.room >= 60, ac = (p.area / 43560).toFixed(2) + ' ac';
  const name = pad && !big ? 'Future pad site' : big ? 'Future development' : dog ? 'Dog park' : '', note = pad || big ? ac + ' · not in this phase' : dog ? 'Fenced · small | large' : '';
  return { kind: 'green', poly, name, note, trees: !(pad || big), future: pad || big || undefined, labelAt: p.core };
}

// the land round a pond put beside the buildings: its name off the pond (the nearest point of the piece clear of it)
function landAround(g, p, pond) {
  if (!g.name) return g; const o = S.outline(pond), xs = o.map(v => v[0]), ys = o.map(v => v[1]), m = 30, off = q => q[0] < Math.min(...xs) - m || q[0] > Math.max(...xs) + m || q[1] < Math.min(...ys) - m || q[1] > Math.max(...ys) + m;
  if (off(p.core)) return g; const R = p.ring, rx = R.map(v => v[0]), ry = R.map(v => v[1]); let best = null, bd = Infinity;
  for (let x = Math.min(...rx) + 20; x < Math.max(...rx) - 20; x += 10) for (let y = Math.min(...ry) + 20; y < Math.max(...ry) - 20; y += 10) { const q = [x, y], d = Math.hypot(x - p.core[0], y - p.core[1]); if (d < bd && off(q) && S.inRing(q, R) && R.every((v, i) => S.segDist(q, v, R[(i + 1) % R.length]) > 15)) { best = q; bd = d; } }
  return best ? { ...g, labelAt: best } : g;
}

const { stormNeed, stormAcres } = S; export const STORM = S.STORM; export { stormNeed }; // (they live in lib/siteplan.mjs: the pro forma prices them too)

// ---------- stacks for each use ----------

// the block sequences worth trying for a use, bottom to top (the bottom is the street side across, a side line deep)
function sequences(use, prog, F, avail) {
  const out = [], fl = prog.floors, U = S.USES[use];
  if (use === 'multifamily') {
    const D = (+PAR.bldgDepth || 60) * (PAR.form === 'U' || PAR.form === 'L' ? 2 : 1), inB = { fill: 'bldg', use, D, floors: fl, rowsDown: true, rowsUp: true, h: 2 * ROW + 2 * WALK + D }, inP = { fill: 'park', rowsDown: true, rowsUp: true, h: 2 * ROW + 4 };
    for (let na = 1; na <= 14; na++) for (const eb of [true, false]) for (const et of [true, false]) for (let np = 0; np < na; np++) {
      const inner = []; for (let k = 0; k < na - 1; k++) inner.push(np && (k + 1) % Math.max(1, Math.round((na - 1) / np)) === 0 && inner.filter(b => b.fill === 'park').length < np ? inP : inB);
      const bot = eb ? { fill: 'bldg', use, D, floors: fl, rowsUp: true, h: ROW + WALK + D } : { fill: 'none', rowsUp: true, h: ROW }, top = et ? { fill: 'bldg', use, D, floors: fl, rowsDown: true, h: ROW + WALK + D } : { fill: 'none', rowsDown: true, h: ROW };
      out.push({ blocks: [bot, ...inner, top], aisles: Array(na).fill(0).map(() => ({ w: AISLE, kind: 'aisle' })) });
    }
  } else if (use === 'townhomes' || use === 'duplex') {
    const th = use === 'townhomes', aw = th ? 24 : 26, inner = th ? 5 + 40 + 36 + 40 + 5 : 25 + 40 + 40 + 40 + 25, edge = (th ? 5 : 25) + 40;
    for (let na = 1; na <= 16; na++) out.push({ blocks: [{ fill: use === 'townhomes' ? 'homes' : 'duplex', h: edge }, ...Array(na - 1).fill(0).map(() => ({ fill: th ? 'homes' : 'duplex', h: inner })), { fill: th ? 'homes' : 'duplex', h: edge }], aisles: Array(na).fill(0).map(() => ({ w: aw, kind: th ? 'lane' : 'street' })) });
  } else if (use === 'sfr') { // single-family lots on both sides of 28 ft streets (in a 50 ft right-of-way), backs of lots meeting
    const lot = 11 + (prog.lotD || 115);
    for (let na = 1; na <= 12; na++) out.push({ blocks: [{ fill: 'sfr', h: lot }, ...Array(na - 1).fill(0).map(() => ({ fill: 'sfr', h: 2 * lot })), { fill: 'sfr', h: lot }], aisles: Array(na).fill(0).map(() => ({ w: 28, kind: 'street' })) });
  } else if (use === 'storage') { // self storage: the climate-controlled building (or the office) at the front facing a few
    // stalls, the drive-up rows behind it between drive aisles, a row along the back (or the RV / boat stalls)
    const st = prog.storage, aw = st.aisle, rd = st.rowD, office = st.climateSf === 0;
    for (const cD of office ? [40] : [60, 80, 100, 120]) for (let nd = 0; nd <= 16; nd++) for (const back of ['row', 'none', ...(st.rv ? ['rv'] : [])]) {
      const front = { fill: 'bldg', use, D: cD, floors: office ? 1 : prog.floors, zone: 'climate', storage: office ? 'office' : 'climate', also: true, rowsDown: true, walkDown: 12, walkUp: 0, h: ROW + 12 + cD };
      const row = { fill: 'bldg', use, D: rd, floors: 1, zone: 'drive', storage: 'drive', walkDown: 0, walkUp: 0, h: rd };
      const end = back === 'row' ? { ...row, D: S.STORAGE.single, h: S.STORAGE.single } : back === 'rv' ? { fill: 'rv', h: S.STORAGE.rvD } : { fill: 'none', h: 0 };
      // a landscaped strip between the street and the customer drive (no stalls at the entrance's mouth)
      out.push({ blocks: [{ fill: 'none', h: 24 }, front, ...Array(nd).fill(row), end], aisles: [{ w: 26, kind: 'aisle' }, ...Array(nd + 1).fill(0).map(() => ({ w: aw, kind: 'aisle' }))], storage: true, fenceBlock: 1 });
      // compact (a small lot): the building on the street with its visitor stalls just inside the gate, the yard's first aisle behind it
      out.push({ blocks: [{ ...front, also: false, rowsDown: false, walkDown: 0, rowsUp: true, walkUp: 12, h: cD + 12 + ROW }, ...Array(nd).fill(row), end], aisles: Array(nd + 1).fill(0).map(() => ({ w: aw, kind: 'aisle' })), storage: true, fenceBlock: 0, compact: true });
    }
  } else if (use === 'industrial') {
    for (const D of [180, 240, 300, 360, 420, 520]) for (const cars of [1, 2]) {
      const park = cars > 1 ? [{ fill: 'park', rowsDown: true, rowsUp: true, h: 2 * ROW + 4 }] : [];
      const blocks = [{ fill: 'none', rowsUp: true, h: ROW }, ...park, { fill: 'bldg', use, D, floors: 1, rowsDown: true, walkDown: WALK, walkUp: 0, h: ROW + WALK + D }, { fill: 'none', h: 0 }];
      out.push({ blocks, aisles: [...Array(cars).fill(0).map(() => ({ w: AISLE, kind: 'aisle' })), { w: 130, kind: 'truck' }] });
    }
  } else { // retail, restaurant, office, medical, other: a building row at the back facing parking toward the street
    const per = prog.gfa ? prog.gfa / prog.floors / (prog.buildings || 1) : Infinity, /* one building's footprint */ D = use === 'restaurant' ? 70 : per < 12000 ? 70 : per < 25000 ? Math.min(85, prog.depth || U.depth) : prog.depth || U.depth; // small shop buildings are shallower
    for (let na = 1; na <= 8; na++) for (const pads of prog.pads && !F.deep ? [true, false] : [false]) {
      const inner = Array(na - 1).fill(0).map(() => ({ fill: 'park', rowsDown: true, rowsUp: true, h: 2 * ROW + 4 }));
      const bot = pads ? { fill: 'pads', D: 50, rowsUp: true, h: ROW + WALK + 50 + 30 } : { fill: 'none', rowsUp: true, h: ROW };
      const bl = { fill: 'bldg', use, D, floors: prog.floors, one: prog.buildings === 1, rowsDown: true, walkDown: 15, walkUp: 0, h: ROW + 15 + D };
      out.push({ blocks: [bot, ...inner, bl, { fill: 'none', h: 0 }], aisles: [...Array(na).fill(0).map(() => ({ w: AISLE, kind: 'aisle' })), { w: AISLE, kind: 'service' }], pads });
      if (na <= 3 && profile(F).width < 300) out.push({ blocks: [bot, ...inner, bl], aisles: Array(na).fill(0).map(() => ({ w: AISLE, kind: 'aisle' })), pads, noService: true }); // a narrow lot: no drive round the back, deliveries from the front
    }
    // a deep site: more rows of buildings in the lot, each with parking on both sides (fronts both ways), so the
    // whole site is used instead of one row at the back and lawn behind it
    for (let na = 2; na <= 10; na++) for (let nb = 1; nb < na; nb++) for (const pads of prog.pads && !F.deep ? [true, false] : [false]) {
      const inner = Array(na - 1).fill(0).map((_, k) => (k + 1) % Math.max(1, Math.round((na - 1) / nb)) === 0 && k < (na - 1) ? { fill: 'bldg', use, D, floors: prog.floors, one: prog.buildings === 1, rowsDown: true, rowsUp: true, h: 2 * ROW + 2 * WALK + D } : { fill: 'park', rowsDown: true, rowsUp: true, h: 2 * ROW + 4 });
      if (inner.filter(b => b.fill === 'bldg').length !== nb) continue;
      const bot = pads ? { fill: 'pads', D: 50, rowsUp: true, h: ROW + WALK + 50 + 30 } : { fill: 'none', rowsUp: true, h: ROW };
      const bl = { fill: 'bldg', use, D, floors: prog.floors, one: prog.buildings === 1, rowsDown: true, walkDown: 15, walkUp: 0, h: ROW + 15 + D };
      out.push({ blocks: [bot, ...inner, bl, { fill: 'none', h: 0 }], aisles: [...Array(na).fill(0).map(() => ({ w: AISLE, kind: 'aisle' })), { w: AISLE, kind: 'service' }], pads });
    }
  }
  return out;
}

// ---------- trying stacks ----------
// how wide the usable land is at each height: the lowest and highest y where a row is worth starting
function profile(F) {
  if (F.prof) return F.prof;
  const step = Math.max(4, (F.Y1 - F.Y0) / 160), rows = [];
  for (let y = F.Y0; y <= F.Y1; y += step) rows.push([y, spans(F, y, y + 1, 'build').reduce((s, [a, b]) => s + b - a, 0), spans(F, y, y + 1, 'pave').reduce((s, [a, b]) => s + b - a, 0)]);
  const mb = Math.max(...rows.map(r => r[1])), mp = Math.max(...rows.map(r => r[2]));
  const ok = (r, k) => r[k] >= Math.max(90, (k === 1 ? mb : mp) * 0.15), lo = k => rows.find(r => ok(r, k))?.[0] ?? F.Y0, hi = k => rows.slice().reverse().find(r => ok(r, k))?.[0] ?? F.Y1;
  return (F.prof = { b: [lo(1), hi(1) + 1], p: [lo(2), hi(2) + 1], width: rows.reduce((s, r) => s + r[1], 0) * step / Math.max(1, hi(1) - lo(1)), step });
}
// land kept for the pond: a band at the back (or front) of the site holding about `area`
function reserveBand(F, area, at, win) {
  if (!(area > 0) || at === 'none') return null;
  const T = r => r.map(([x, y]) => [y, x]), base = win ? T(clipY(F.rrT, win[0], win[1])) : F.rr; if (base.length < 3) return null; // a first phase: its own stretch of the site
  const deep = F.deep !== (at === 'end'), R = deep ? T(base) : base, lo = Math.min(...R.map(p => p[1])), hi = Math.max(...R.map(p => p[1])), inBand = (a, b) => S.ringArea(clipY(R, a, b)) || 0; // 'end': beside the rows instead of behind them
  const back = at !== 'front'; let a = lo, b = hi; area += (win ? 45 : 22) * (Math.max(...R.map(p => p[0])) - Math.min(...R.map(p => p[0]))); // a phase's short band loses its edges to buffers and banks
  for (let it = 0; it < 30; it++) { const m = (a + b) / 2; if (back ? inBand(m, hi) > area : inBand(lo, m) < area) a = m; else b = m; }
  const v = (a + b) / 2, big = 1e5, bx = back ? [v, hi + 50] : [lo - 50, v];
  return deep ? box(bx[0], -big, bx[1], big) : box(-big, bx[0], big, bx[1]);
}
const fit = v => +v.toFixed(2);
// one attempt: a block sequence placed in the frame, laid out, balanced for parking, finished and checked
function attempt(plan, F, seq, prog, o) {
  const P = profile(F), blocks = seq.blocks.map(b => ({ ...b })), aisles = seq.aisles.map(a => ({ ...a })), n = aisles.length;
  const ko = KO ? KO.map(e => S.grow(S.shapeOf(e), 4).map(p => F.wave ? F.bw(rot(p, -F.psi)) : rot(p, -F.psi))) : []; // easements (opts.keepout), in the frame
  const res0 = reserveBand(F, o.pond * 1.2, o.pondAt, o.winX), keep = (o.keep || []).concat(ko, res0 ? [res0] : []);
  let lo = (['bldg', 'pads', 'homes', 'duplex'].includes(blocks[0].fill) ? P.b : P.p)[0], hi = (['bldg', 'homes', 'duplex'].includes(blocks[n].fill) ? P.b : P.p)[1];
  if (res0 && !F.deep && o.pondAt !== 'end') { const ys = res0.map(p => p[1]); if (o.pondAt === 'front') lo = Math.max(lo, Math.max(...ys) + 4); else hi = Math.min(hi, Math.min(...ys) - 4); }
  let y = lo + blocks[0].h + aisles[0].w / 2; aisles[0].y = y;
  for (let i = 1; i < n; i++) aisles[i].y = y = y + aisles[i - 1].w / 2 + blocks[i].h + aisles[i].w / 2;
  const slack = hi - (y + aisles[n - 1].w / 2 + blocks[n].h); if (slack < -2) return null;
  const shift = o.shift === 'mid' ? slack / 2 : o.shift === 'top' ? slack : 0; for (const a of aisles) a.y += shift;
  const spec = { deep: F.deep, aisles, blocks, reserve: keep, entryAvoid: (o.keep || []).concat(ko), conW: o.conW || 26, curveR: PAR.style.corners === 'square' ? 0 : o.curveR ?? 30, spineX: o.spineX, entry: o.entry, amenity: prog.use === 'multifamily' && o.amenity !== false && F.site > 4 * 43560 && !(prog.units != null && prog.units < 100), pads: seq.pads ? prog.pads || 2 : 0, bays: {}, prog, count: prog.buildings || null, ...(o.spec || {}) };
  if (prog.use === 'storage') Object.assign(spec, storageSpec(F, prog), { fenceBlock: seq.fenceBlock ?? 1 });
  let cap = o.footprint ?? Infinity, best = null; // footprint wanted (sq ft), spent front to back
  const per = prog.use === 'multifamily' ? prog.floors * 0.85 / prog.unitSf * prog.perUnit : prog.floors / 1000 * prog.ratio; // spaces per sq ft of footprint
  { const need = (Number.isFinite(cap) ? cap * per : 0) + (o.xNeed || 0); spec.throat = need < 100 ? 30 : need < 300 ? 50 : 75; } // the entry's throat grows with the traffic (spaces it serves)
  for (let it = 0; it < 8; it++) {
    const sp2 = { ...spec, bays: { ...spec.bays }, footLeft: cap }, r = layoutStack(F, sp2); if (!r) return null; r.parkBands = sp2.parkBands;
    const st = tally(r.els, prog); st.need += o.xNeed || 0; st.stalls += o.xHave || 0; // pinned pieces: their parking need and their spaces
    const have = st.stalls + st.garages, short = Math.max(0, st.need - have), sc = short ? st.footprint * 0.5 - short / Math.max(per, 1e-6) : st.footprint + 1e8; // enough parking first, then the most building
    if (!best || sc > best.sc) best = { r, st, sc };
    if (!short || prog.use === 'industrial' || prog.use === 'storage' || !st.need) break;
    // short of parking: a bay across a long building row (it adds spaces and a cross drive), else less building
    const rows = blocks.map((b, i) => i).filter(i => i > 0 && i < n && blocks[i].fill === 'bldg').map(i => {
      const sp = r.live.filter(q => q.i === i - 1), up = r.live.filter(q => q.i === i), len = Math.max(0, ...sp.flatMap(a => up.map(b => Math.min(a.eb, b.eb) - Math.max(a.ea, b.ea))));
      const k = (spec.bays[i - 1] || 0) + Math.max(0, Math.ceil(len / 420) - 1) + 1; return { i, room: len - (90 + 80 * k + 135 * (k + 1)) }; }).filter(q => q.room > 0).sort((a, b) => b.room - a.room);
    if (rows.length && it < 5) { spec.bays[rows[0].i - 1] = (spec.bays[rows[0].i - 1] || 0) + 1; continue; }
    cap = Math.min(cap, st.footprint) - short / Math.max(per, 1e-6) / (1 + (prog.use === 'multifamily' ? 0.25 : 0.1)) - 400;
    if (spec.footByZone) { // mixed use: take it off each zone's building in proportion to what was placed
      const placed = {}; for (const e of r.els) if (e.kind === 'building' && e.zone != null) placed[e.zone] = (placed[e.zone] || 0) + S.footArea(e);
      const f = Math.max(0.5, cap / Math.max(1, st.footprint)); spec.footByZone = Object.fromEntries(Object.keys(spec.footByZone).map(k => [k, (placed[k] ?? spec.footByZone[k]) * f]));
    }
    if (cap < 2000) break;
  }
  const { r, st } = best, pre = { ...st }; // (pre: the stalls the aisles hold before the surplus is trimmed)
  if (!['townhomes', 'duplex', 'sfr'].includes(prog.use)) { trimParking(r, st.need > 0 && !o.noTrim ? st.need - (o.xHave || 0) - st.deck : Infinity, o.anchors); openEnds(r, F, keep, (o.solid || []).map(outL).concat((o.anchors || []).filter(q => q?.length >= 3))); Object.assign(st, tally(r.els, prog)); st.need += o.xNeed || 0; st.stalls += o.xHave || 0; } // surplus stalls and drives to nowhere, then a way through
  if (prog.use === 'storage') { const D = r.els.filter(e => e.kind === 'drive').map(outL), n0 = r.els.length; // a drive-up row with no aisle at its doors can't be rented: gone
    r.els = r.els.filter(e => e.storage !== 'drive' || D.some(d => S.rectsOverlap({ poly: S.grow(outL(e), 3) }, { poly: d }, 0)));
    if (r.els.length < n0) { Object.assign(st, tally(r.els, prog)); st.need += o.xNeed || 0; st.stalls += o.xHave || 0; } }
  const land = finishLand(F, r.els.concat(o.solid || [], ko.map(poly => ({ kind: 'building', use: 'amenity', poly }))), { parkBands: r.parkBands, pond: o.pond, reserve: res0 ? [res0] : [], trail: prog.use === 'multifamily' || prog.use === 'townhomes' || !!o.mixed, amenity: spec.amenity, padUse: COMMERCIAL.includes(prog.use) || !!o.mixed, openSpace: !!o.openSpace, frontY: profile(F).b[0], future: o.footprint != null && st.footprint >= o.footprint * 0.97 || !!o.future, lakeName: o.lake || (prog.use === 'multifamily' && o.pond ? (PAR.storm?.mode === 'retention' ? 'Retention pond' : 'Detention pond') : '') }, st);
  const els = r.els.concat(land, prog.use === 'storage' && prog.storage.fence && r.fenceY != null && r.els.some(e => e.storage === 'drive' || e.rv) ? fenceOf(F, r.els.concat(land), r.fenceY) : []); // (a climate building alone locks its own doors)
  return { F, r, els, st, pre, seq, o, slack, spec };
}
// a program doesn't need every stall the aisles could hold: keep the ones nearest the buildings (the requirement plus
// a twentieth, the accessible aisles' share and two to spare), dropping whole rows farthest out first and then the far
// ends of rows, then drop drive aisles and connectors nothing uses any more, as long as everything left is still
// reached from the entry. The land freed goes to a future pad or phase. need: the surface stalls the plan needs.
// ---------- self storage ----------
// what a storage layout spends: the climate-controlled building's footprint (its floor area over its floors; a small
// office when there's none; when no size is given, a building for the site: up to 30,000 sf a floor) and the drive-up
// rows' (as much as fits when no size is given)
function storageSpec(F, prog) {
  const st = prog.storage, climate = st.climateSf === 0 ? S.STORAGE.office : st.climateSf != null ? st.climateSf / prog.floors : Math.min(30000, Math.max(8000, F.site * 0.1));
  return { storage: true, count: null, conW: st.aisle, curveR: 30, footByZone: { climate, drive: st.driveSf ?? Infinity } };
}
// the fence round a storage yard: from the climate building's front corners out to the sides and round the back, just
// inside the landscape buffer; a gate wherever a drive goes through the front line. Frame feet, like the layout.
function fenceOf(F, els, yF) {
  let yard = clipY(S.insetRing(F.rr, F.pave.map(p => Math.max(1, p - 2))), yF, 1e7); if (yard.length < 3) return [];
  const cl = r => { const q = S.signedArea(r) < 0 ? r.slice().reverse() : r.slice(); return q.concat([q[0]]); };
  const ponds = els.filter(e => e.kind === 'pond' && outL(e).some(p => p[1] < yF + 1)); // a pond across the front line stays outside the fence, which runs round its top
  let rings = [yard];
  if (ponds.length) try { // (a strip under 40 ft between the pond and the lot line goes outside too: no fenced-in sliver)
    const yx = yard.map(p => p[0]), yy = yard.map(p => p[1]), X0 = Math.min(...yx), X1 = Math.max(...yx), Y1 = Math.max(...yy), cuts = [];
    for (const e of ponds) { const g = S.grow(outL(e), 6), xs = g.map(p => p[0]), ys = g.map(p => p[1]), a = Math.min(...xs), b = Math.max(...xs), c = Math.min(...ys), d = Math.max(...ys); cuts.push(g);
      if (a - X0 < 40) cuts.push(box(X0 - 20, c, a + 1, d)); if (X1 - b < 40) cuts.push(box(b - 1, c, X1 + 20, d)); if (Y1 - d < 40) cuts.push(box(a, d - 1, b, Y1 + 20)); }
    rings = polyclip.difference([cl(yard)], ...cuts.map(q => [cl(q)])).map(pg => pg[0].slice(0, -1)).filter(r => S.ringArea(r) > 2000); } catch (e) { rings = [yard]; }
  const on = p => Math.abs(p[1] - yF) < 0.05, cut = [], gates = [], out = [], fence = path => out.push({ kind: 'fence', path, width: 1.5, r: 0, name: '', note: 'Security fence' });
  const across = e => { const c = clipY(outL(e), yF - 0.5, yF + 0.5); return c.length ? [Math.min(...c.map(p => p[0])), Math.max(...c.map(p => p[0]))] : null; };
  for (const e of els) { if (e.kind !== 'building' && e.kind !== 'drive' && e.kind !== 'truck') continue; const x = across(e); if (!x) continue; cut.push(x); if (e.kind !== 'building') gates.push(x); }
  const cuts = merge(cut), front = [];
  for (const R of rings) { // the ring's edges along the front line are the front (with gaps for the building and the gates); the rest is one run of fence
    const n = R.length, isF = i => on(R[i]) && on(R[(i + 1) % n]); let k = [...Array(n).keys()].find(isF); if (k == null) { fence(R.concat([R[0]])); continue; }
    let run = [];
    for (let j = 1; j <= n; j++) { const i = (k + j) % n; if (isF(i)) { if (run.length > 1) fence(run); run = []; front.push([Math.min(R[i][0], R[(i + 1) % n][0]), Math.max(R[i][0], R[(i + 1) % n][0])]); } else { if (!run.length) run.push(R[i]); run.push(R[(i + 1) % n]); } }
    if (run.length > 1) fence(run);
  }
  for (const [lo, hi] of merge(front)) { let x = lo; for (const [a, b] of cuts.filter(([a, b]) => b > lo && a < hi).concat([[hi, hi]])) { if (a - x > 4) fence([[x, yF], [Math.min(a, hi), yF]]); x = Math.max(x, b); } }
  merge(gates).filter(([a, b]) => front.some(([p, q]) => b > p && a < q)).forEach(([a, b], i) => out.push({ kind: 'fence', gate: true, path: [[a, yF], [b, yF]], width: 3, r: 0, name: i ? 'Gate' : 'Entry gate', note: 'Keypad gate' }));
  return out;
}
function trimTarget(need) { const want = Math.ceil(need * 1.05 - 0.01); return want + S.adaLoss(want + 8) + 2; }
// anchors: the pinned buildings (outlines in the layout's frame) a re-fit lays out round; with every building pinned
// the engine places none of its own, and the parking is still trimmed to the need, nearest them
function trimParking(r, need, anchors = []) {
  const box = q => { const xs = q.map(p => p[0]), ys = q.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); return { kind: 'building', x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, d: y1 - y0 }; };
  const els = r.els, P = els.filter(e => e.kind === 'parking' && !e.rv), B = els.filter(e => e.kind === 'building').concat(anchors.filter(q => q?.length >= 3).map(box)), count = e => S.stalls({ ...e, rot: 0 }).count;
  const near = e => Math.min(...B.map(b => Math.max(0, Math.abs(e.x - b.x) - (b.w + (e.rotL ? e.d : e.w)) / 2) + Math.max(0, Math.abs(e.y - b.y) - (b.d + (e.rotL ? e.w : e.d)) / 2)), 1e9);
  let total = P.reduce((s, e) => s + count(e), 0); const target = need < Infinity && B.length ? trimTarget(Math.max(0, need)) : Infinity, gone = new Set(); // (no need given: only the drives to nowhere)
  const frag = e => count(e) < 6; // a scrap of a row (a few stalls left between a drive and the lot line) goes before a whole row does
  if (total > target) for (const e of P.slice().sort((a, b) => frag(b) - frag(a) || near(b) - near(a))) { const c = count(e); if (total - c >= target) { gone.add(e); total -= c; } }
  // then stalls off the far end of a row (whole stalls; islands are worked out again from the row's length)
  const toB = p => Math.min(...B.map(b => Math.hypot(Math.max(0, Math.abs(p[0] - b.x) - b.w / 2), Math.max(0, Math.abs(p[1] - b.y) - b.d / 2))));
  const cuts = new Map();
  for (const e of P.filter(e => !gone.has(e) && e.lock).sort((a, b) => near(b) - near(a))) {
    if (total <= target) break;
    const sw = e.sw || SW, n = Math.round(e.w / sw), c0 = count(e); if (n <= 6) continue;
    let k = 0; while (n - k - 1 >= 6 && c0 - count({ ...e, w: (n - k - 1) * sw }) <= total - target) k++;
    if (!k) continue;
    const ax = e.rotL ? [0, 1] : [1, 0], h = e.w / 2, a = [e.x - ax[0] * h, e.y - ax[1] * h], b = [e.x + ax[0] * h, e.y + ax[1] * h], dir = toB(a) > toB(b) ? 1 : -1; // cut from the end farther from the buildings
    const w = (n - k) * sw; cuts.set(e, { ...e, w, x: e.x + ax[0] * dir * k * sw / 2, y: e.y + ax[1] * dir * k * sw / 2 }); total -= c0 - count({ ...e, w });
  }
  const NB = new Map(), nearB = (d, b, g) => { const k = g, G = NB.get(b) || NB.set(b, {}).get(b), gb = G[k] ??= S.grow(outL(b), g), D = geo(d); return S.rectsOverlap({ poly: D.o }, { poly: gb }, 0); }; // a drive within g ft of a building
  const C = new Map(), geo = e => C.get(e) || C.set(e, (o => { const g = S.grow(o, 2), xs = g.map(p => p[0]), ys = g.map(p => p[1]); return { o, g, b: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }; })(outL(e))).get(e); // outlines once
  const touch = (a, b) => { const A = geo(a), B = geo(b); if (A.b[0] > B.b[2] || B.b[0] > A.b[2] || A.b[1] > B.b[3] || B.b[1] > A.b[3]) return false; return S.rectsOverlap({ poly: A.o }, { poly: B.g }, 0) || S.rectsOverlap({ poly: B.o }, { poly: A.g }, 0); };
  const reached = keep => { const D = keep.filter(e => e.kind === 'drive' || e.kind === 'truck'), seen = new Set(D.filter(e => e.entry || e.name === 'Main entry')), st = [...seen];
    while (st.length) { const e = st.pop(); for (const f of D) if (!seen.has(f) && touch(e, f)) { seen.add(f); st.push(f); } } return seen; };
  const ok = keep => { // every parking row and building still on the network from the entry
    const seen = reached(keep);
    return keep.filter(e => e.kind === 'truck').every(t => seen.has(t)) && keep.filter(e => e.kind === 'parking').every(p => [...seen].some(d => touch(p, d))) && keep.filter(e => e.kind === 'building').every(b => [...seen].some(d => nearB(d, b, 160)));
  };
  let keep = els.filter(e => !gone.has(e)).map(e => cuts.get(e) || e); if (!ok(keep)) { if (globalThis.SP_DEBUG) console.log('trim refused', gone.size); keep = els.slice(); } // rows can't strand anything, but be sure
  // drives that serve nothing: no parking row on them and no building beside them
  for (let pass = 0; pass < 3; pass++) for (const d of keep.filter(e => e.kind === 'drive' && !e.entry && !e.turn && !e.bulb && e.name !== 'Main entry').sort((a, b) => near(b) - near(a))) {
    const serves = d.aisle && keep.some(e => e.kind === 'parking' && touch(e, d)) || keep.some(e => e.kind === 'building' && nearB(d, e, 40));
    if (serves) continue; const trial = keep.filter(e => e !== d); if (ok(trial)) keep = trial;
  }
  // a connection whose far aisle was trimmed away (no stalls left on it) is a drive that ends in the grass, often in the
  // landscape buffer at the back: gone, if nothing needs it to be reached
  for (let pass = 0; pass < 2; pass++) for (const d of keep.filter(e => e.kind === 'drive' && e.con && !e.entry && e.name !== 'Main entry')) {
    if (keep.filter(e => e !== d && (e.kind === 'drive' || e.kind === 'truck') && touch(e, d)).length > 1) continue; // joins two pieces of the network: a real link
    if (keep.some(e => e.kind === 'parking' && touch(e, d))) continue; // stalls along it
    const trial = keep.filter(e => e !== d); if (ok(trial)) keep = trial;
  }
  if (ok(keep)) { const seen = reached(keep); keep = keep.filter(e => !(e.kind === 'drive' || e.kind === 'truck') || seen.has(e) || e.note === 'Drive-thru lane'); } // nothing left cut off
  // an aisle cut back to what it serves: past its last stall, connection or the entry it's a stub to nowhere (a strip of
  // asphalt sticking out of the lot). Its ends then meet the rows' ends, so the curb runs straight across.
  for (const d of keep.filter(e => e.kind === 'drive' && e.aisle && !e.path && !e.poly && !e.rotL && /drive aisle$/.test(e.note || ''))) {
    const x0 = d.x - d.w / 2, x1 = d.x + d.w / 2; let lo = Infinity, hi = -Infinity;
    for (const e of keep) { if (e === d || !(['parking', 'drive', 'truck'].includes(e.kind) || e.kind === 'building' && e.use === 'storage') || !touch(e, d)) continue; /* (storage: drive-up doors open onto the aisle) */ const xs = geo(e).o.map(p => p[0]); lo = Math.min(lo, Math.max(x0, Math.min(...xs))); hi = Math.max(hi, Math.min(x1, Math.max(...xs))); }
    if (!(hi > lo) || (lo - x0 < 6 && x1 - hi < 6)) continue;
    const trial = keep.map(e => e === d ? { ...d, x: (lo + hi) / 2, w: hi - lo } : e); if (ok(trial)) keep = trial;
  }
  r.els = keep;
}

// an aisle with stalls along it shouldn't end at a curb: a driver who finds no space has to back out or turn in the aisle.
// Each closed end is opened the cheapest way the land allows: run the aisle on until it meets a drive (a connector, the
// loop, the truck court), or join it to the aisle beside it with a short drive across the rows' ends (a loop through
// both). Nothing is built over: buildings (and their walks), stalls, the pond's land and easements stay as they are, so
// no stall is lost; an end that can't be opened stays (S.check says so when it holds 10 or more stalls).
function openEnds(r, F, keep, solid = []) {
  const CW = 26, ob = keep.map(p => ({ p, g: 0 })), net = e => (e.kind === 'drive' && e.note !== 'Drive-thru lane') || e.kind === 'truck';
  const bx = q => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of q) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
  const OL = new Map(), ol = e => OL.get(e) || OL.set(e, (o => ({ o, b: bx(o) }))(e.kind === 'building' ? S.grow(outL(e), 6) : outL(e))).get(e); // outlines once (buildings with their walk)
  const SO = solid.map(o => ({ o, b: bx(o) }));
  const hitO = (q, Q, O, slack = 0.5) => !(Q[0] >= O.b[2] - slack || O.b[0] >= Q[2] - slack || Q[1] >= O.b[3] - slack || O.b[1] >= Q[3] - slack) && S.rectsOverlap({ poly: q }, { poly: O.o }, slack);
  const hit = (q, a, slack = 0.5) => hitO(q, bx(q), { o: a, b: bx(a) }, slack);
  const blocked = (q, skip) => { const Q = bx(q); return !covers(spans(F, Q[1], Q[3], 'pave', ob), Q[0], Q[2]) || SO.some(O => hitO(q, Q, O)) || r.els.some(e => !net(e) && !skip.includes(e) && hitO(q, Q, ol(e))); };
  const joins = (q, skip) => { const g = S.grow(q, 1), Q = bx(g); return r.els.some(e => net(e) && !skip.includes(e) && hitO(g, Q, ol(e), 0)); };
  const rect = e => !e.path && !e.poly && !e.rotL, aisles = () => r.els.filter(e => e.kind === 'drive' && e.aisle && rect(e));
  const rowsOn = A => r.els.filter(e => e.kind === 'parking' && hit(S.grow(outL(e), 2), outL(A), 0));
  for (let pass = 0; pass < 2; pass++) for (const A0 of aisles()) for (const s of [-1, 1]) {
    const A = r.els.find(e => e === A0); if (!A) continue;
    const end = A.x + s * A.w / 2, y0 = A.y - A.d / 2, y1 = A.y + A.d / 2;
    if (joins(box(Math.min(end, end + s * 4), y0 + 3, Math.max(end, end + s * 4), y1 - 3), [A])) continue; // already goes somewhere
    const rows = rowsOn(A).filter(e => (e.x - A.x) * s > -A.w / 4); if (rows.reduce((n, e) => n + S.stalls({ ...e, rot: 0 }).count, 0) < 6) continue; // a stub with a stall or two
    let best = null;
    // 1. run it on until it meets a drive
    for (let L = 4; L <= 140; L += 4) { const xa = Math.min(end, end + s * L), xb = Math.max(end, end + s * L), q = box(xa, y0, xb, y1); if (blocked(q, [A])) break;
      if (joins(box(xa, y0 + 3, xb, y1 - 3), [A])) { best = { cost: L, els: [[A, { ...A, x: (Math.min(A.x - A.w / 2, xa) + Math.max(A.x + A.w / 2, xb)) / 2, w: A.w + L }]] }; break; } }
    // 2. a drive across the rows' ends to the aisle beside it (run on to meet it if that one stops short)
    for (const B of aisles()) {
      if (B === A || Math.abs(B.y - A.y) > 260 || Math.abs(B.y - A.y) < (A.d + B.d) / 2) continue;
      const cx0 = s < 0 ? end - CW : end, cx1 = cx0 + CW, bl = B.x - B.w / 2, br = B.x + B.w / 2;
      if (s < 0 ? bl > cx1 + 140 || br < cx1 : br < cx0 - 140 || bl > cx0) continue; // it has to reach (or nearly reach) this end
      const ya = Math.min(y0, B.y - B.d / 2), yb = Math.max(y1, B.y + B.d / 2), q = box(cx0, ya, cx1, yb), skip = [A, B];
      if (blocked(q, skip)) continue;
      const short = s < 0 ? bl - cx0 : cx1 - br, ext = short > 0 ? (s < 0 ? box(cx0, B.y - B.d / 2, bl, B.y + B.d / 2) : box(br, B.y - B.d / 2, cx1, B.y + B.d / 2)) : null;
      if (ext && blocked(ext, skip)) continue;
      const cost = (yb - ya) + Math.max(0, short) + 40; if (best && best.cost <= cost) continue;
      const con = { kind: 'drive', x: (cx0 + cx1) / 2, y: (ya + yb) / 2, w: CW, d: yb - ya, con: true, name: '', note: CW + ' ft drive', rot: 0 };
      best = { cost, els: [[A, { ...A, x: A.x + s * (CW - 1) / 2, w: A.w + CW - 1 }]].concat(ext ? [[B, { ...B, x: B.x + s * short / 2, w: B.w + short }]] : []), add: [con] };
    }
    if (!best) continue;
    for (const [a, b] of best.els) r.els[r.els.indexOf(a)] = b;
    if (best.add) r.els.push(...best.add);
  }
}

// numbers for a frame-feet layout (counted as S.metrics counts them)
function tally(els, prog) {
  let footprint = 0, gfa = 0, units = 0, garages = 0, need = 0, surf = 0, deck = 0;
  for (const e of els) {
    if (e.kind === 'parking' && !e.rv) surf += S.stalls({ ...e, rot: 0 }).count; // RV / boat stalls are storage, not parking
    if (e.kind === 'garage') deck += Math.floor(e.w * e.d * (e.levels || 4) / 330); // a parking garage: about 330 sq ft a space on each level
    if (e.kind !== 'building' || e.use === 'amenity') continue;
    const a = S.footArea(e), U = S.USES[e.use] || S.USES.other, P = e.use === prog.use && !prog.zones ? prog : S.normalizeProgram({ use: e.use }); /* mixed use: each building by its own numbers */ footprint += a; gfa += e.sf != null ? a * (e.floors || 1) : S.gfaOf(e);
    if (e.use === 'multifamily') { const u = Math.floor(a * (e.floors || 1) * (P.eff || 0.85) / P.unitSf); units += u; need += u * P.perUnit; }
    else if (U.garage) { units += e.units || 1; garages += (e.units || 1) * U.garage + S.drivewayOf(e); need += (e.units || 1) * (P.perUnit + (U.guest || 0)); } // (a front-load duplex's driveway holds its second car)
    else need += a * (e.floors || 1) / 1000 * P.ratio;
  }
  return { footprint, gfa, units, garages, need: Math.ceil(need - 0.01), stalls: surf - S.adaLoss(surf) + deck, surf, deck };
}

// ---------- the three options ----------
// the stretch along the rows a fixed program needs (its building row or its parking, whichever is longer), so the
// rest of a big site is left in one piece for a later phase; null when it would use most of the site anyway
function windowFor(F, seq, prog, foot) {
  if (prog.use === 'multifamily' || !seq.blocks.some(b => b.fill === 'bldg')) return null;
  const D = seq.blocks.find(b => b.fill === 'bldg').D, rows = seq.blocks.reduce((s, b) => s + (b.rowsDown ? 1 : 0) + (b.rowsUp ? 1 : 0), 0) || 1;
  const rowLen = foot / D + Math.max(0, (prog.buildings || 1) - 1) * splitRule(prog.use).gap, park = S.required(prog, foot * prog.floors) * SW / rows * 1.15;
  const len = Math.max(rowLen * 1.15 + 60, park) + 2 * 60 + 60, span = F.X1 - F.X0; if (len > span * 0.7) return null;
  if (F.deep) return [F.X0 - 10, F.X0 + 60 + len]; // from the street back
  const mid = (F.X0 + F.X1) / 2; return [mid - len / 2, mid + len / 2]; // centred on the frontage
}
const sig = els => { const B = els.filter(e => e.kind === 'building'), P = els.filter(e => e.kind === 'parking'); return B.length + '|' + Math.round(B.reduce((s, e) => s + S.gfaOf(e), 0) / 500) + '|' + P.reduce((s, e) => s + S.stalls(e).count, 0); }; // what a reader would call the same plan
// options that look the same on the plan: the same numbers, buildings of the same uses in the same places, the pond in
// the same spot (parking trimmed to the need often leaves two arrangements with the same numbers)
const look = els => sig(els) + '|' + els.filter(e => e.kind === 'building').map(e => e.use + '@' + Math.round(e.x / 60) + ',' + Math.round(e.y / 60)).sort().join(';') + '|' + els.filter(e => e.kind === 'pond').map(e => Math.round(e.x / 150) + ',' + Math.round(e.y / 150)).join(';');
const ENTRY = { multifamily: { w: 40, boulevard: true }, townhomes: { w: 36, boulevard: true }, duplex: { w: 36, boulevard: true }, sfr: { w: 40, boulevard: true }, industrial: { w: 40 } };
const DRIVES = { industrial: { conW: 32, curveR: 50 }, townhomes: { conW: 26, curveR: 40 }, duplex: { conW: 26, curveR: 40 }, sfr: { conW: 28, curveR: 45 } };
// the footprint the program asks for (sq ft), or null for "as much as fits"
function wantFoot(prog) {
  if (prog.max) return null;
  if (prog.use === 'multifamily') return prog.units ? prog.units * prog.unitSf / 0.85 / prog.floors : prog.gfa ? prog.gfa / prog.floors : null;
  if (prog.use === 'townhomes' || prog.use === 'duplex' || prog.use === 'sfr') return null;
  if (prog.use === 'storage') { const st = prog.storage; return st.driveSf == null || st.climateSf == null ? null : (st.climateSf ? st.climateSf / prog.floors : S.STORAGE.office) + st.driveSf; }
  if (prog.use === 'foodtrucks') return null; // sized by its trucks (lib/sitefoodtruck.mjs)
  if (prog.use === 'fuel') return null; // a gas station is sized by its pumps and store (lib/sitefuel.mjs), not filled
  return prog.gfa ? prog.gfa / prog.floors : null;
}
// a quick estimate to rank block sequences before laying them out
function estimate(F, seq, prog, pond, pondAt, foot) {
  const P = profile(F), W = P.width * 0.82 - (pondAt === 'end' ? pond * 1.35 / Math.max(1, P.b[1] - P.b[0]) : 0), n = seq.aisles.length, Hs = seq.blocks.reduce((s, b) => s + b.h, 0) + seq.aisles.reduce((s, a) => s + a.w, 0);
  const avail = P.b[1] - P.b[0] + (seq.blocks[0].fill === 'bldg' ? 0 : P.b[0] - P.p[0]) - (pondAt !== 'none' && pondAt !== 'end' && !F.deep ? pond * 1.35 / Math.max(W, 1) : 0);
  if (Hs > avail + 2) return null;
  const B = seq.blocks.filter(b => b.fill === 'bldg'), rows = seq.blocks.reduce((s, b) => s + (b.rowsDown ? 1 : 0) + (b.rowsUp ? 1 : 0), 0), slack = avail - Hs;
  let value;
  if (prog.use === 'storage') { const fcap = B.reduce((s, b) => s + W * 0.9 * (b.also ? Math.max(b.D * 0.6, 30) : b.D), 0); const cb = B.find(b => b.also || b.storage === 'climate'), cw = prog.storage.climateSf > 0 ? prog.storage.climateSf / prog.floors : 0; value = (foot ? -Math.abs(Math.min(fcap, foot) - foot) : fcap) - (cb && cw ? Math.max(0, cw - W * 0.8 * cb.D) * 4 : 0) /* a climate building too shallow for its size on this frontage */ + (seq.blocks[n].fill === 'rv' ? Math.min(prog.storage.rv, W / S.STORAGE.rvW) * S.STORAGE.rvW * S.STORAGE.rvD : 0); if (seq.compact) value -= Math.abs(value) * 0.15 + 2000; } // (compact: only where the usual one won't go) // building rows (and RV stalls asked for), no parking to weigh
  else if (prog.use === 'townhomes' || prog.use === 'duplex' || prog.use === 'sfr') { const th = prog.use === 'townhomes', rowsH = seq.blocks.reduce((s, b, i) => s + (i === 0 || i === n ? 1 : 2), 0); value = rowsH * W * (th ? 0.8 / 24 : prog.use === 'sfr' ? 0.85 / 52 : 2 * 0.75 / 86); if (prog.units) value = -Math.abs(value - prog.units); }
  else {
    const fcap = B.reduce((s, b) => s + W * (b.use === 'multifamily' ? 0.78 : 0.95) * b.D, 0), perSf = prog.use === 'multifamily' ? prog.floors * 0.85 / prog.unitSf * prog.perUnit : prog.floors / 1000 * prog.ratio;
    const stalls = rows * W * 0.85 / 9, fb = prog.use === 'industrial' ? Math.min(fcap, stalls / Math.max(perSf, 1e-6) * 1.05) : Math.min(fcap, (stalls + (prog.use === 'multifamily' ? fcap * 0.12 : 0)) / Math.max(perSf, 1e-6));
    value = foot ? -Math.abs(Math.min(fb, foot) - foot) - (fb < foot ? 0 : Hs * W * 0.02) : fb;
    if (prog.use !== 'industrial') value -= Math.max(0, stalls - Math.min(fb, foot || fb) * perSf * 1.08) / Math.max(perSf, 1e-6) * 0.6; // parking nobody needs
  }
  return value - slack * W * (foot ? 0.002 : 0.05) * (prog.use === 'multifamily' ? 0.004 : 1);
}
// how shops and offices sit with their parking (plan feet): the share of their floor area whose front (the long side with
// the most stalls before it) faces the street, and the average walk from each front to the nearest stalls it needs
export function frontage(plan, els) {
  const B = els.filter(e => e.kind === 'building' && COMMERCIAL.includes(e.use) && !S.isFree(e)), st = els.filter(e => e.kind === 'parking').flatMap(e => S.stallCentres(e));
  if (!B.length || !st.length) return null;
  const ring = plan.ring, f = plan.front != null && plan.front < ring.length ? plan.front : S.longestEdge(ring), out = S.outwardOf(ring, f);
  let face = 0, walk = 0, all = 0;
  for (const b of B) {
    const a = S.footArea(b), long = b.w >= b.d, L = long ? b.w : b.d, half = long ? b.d / 2 : b.w / 2; let best = null;
    for (const n of long ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]]) { // the two long sides
      const nw = S.rotPt(n, b.rot || 0), tw = [-nw[1], nw[0]], mid = [b.x + nw[0] * half, b.y + nw[1] * half], p0 = [mid[0] - tw[0] * L / 2, mid[1] - tw[1] * L / 2], p1 = [mid[0] + tw[0] * L / 2, mid[1] + tw[1] * L / 2];
      const d = st.filter(p => (p[0] - mid[0]) * nw[0] + (p[1] - mid[1]) * nw[1] > 0).map(p => S.segDist(p, p0, p1)); if (!best || d.filter(v => v < 80).length > best.n) best = { n: d.filter(v => v < 80).length, nw, d };
    }
    const need = Math.max(4, Math.ceil(S.gfaOf(b) / 1000 * (S.USES[b.use]?.ratio ?? 3))), near = best.d.sort((x, y) => x - y).slice(0, need);
    all += a; if (best.nw[0] * out[0] + best.nw[1] * out[1] > 0.7) face += a; walk += (near.length ? near.reduce((s2, v) => s2 + v, 0) / near.length : 300) * a;
  }
  return { face: face / all, walk: walk / all };
}
// a small nudge toward plans a site planner would draw: storefronts toward the street, parking by the doors
const frontScore = (plan, els) => { const f = frontage(plan, els); return f ? f.face * 40 - Math.min(120, Math.max(0, f.walk - 55) * 0.8) : 0; };
function score(a, prog, foot) {
  const st = a.st, mf = prog.use === 'multifamily', homes = prog.use === 'townhomes' || prog.use === 'duplex' || prog.use === 'sfr';
  const sto = prog.use === 'storage', V = mf || homes ? st.units : st.gfa, T = mf ? (prog.units || (foot ? Math.floor(foot * prog.floors * 0.85 / prog.unitSf) : null)) : homes ? prog.units : sto ? (foot ? prog.gfa : null) : foot ? foot * prog.floors : null;
  let s = T ? 1000 - Math.abs(V - T) / T * 1000 - (V < T ? 300 * (T - V) / T : 0) - (V < T * 0.97 ? 200 : 0) : V / (mf || homes ? 1 : 100); // what was asked for, as close as it fits
  if (sto && a.els && prog.storage.climateSf !== 0) { const c = a.els.filter(e => e.kind === 'building' && e.storage === 'climate').reduce((t, e) => t + S.gfaOf(e), 0), want = prog.storage.climateSf ?? c; if (!c) s -= 2300; else if (want) { const sh = Math.max(0, want - c) / want; s -= sh * 2000 + (sh > 0.03 ? 300 : 0); } } // (in points, not a share: on a lot too small for it, the biggest building that fits still wins) // the climate building, at its size
  if (sto && a.seq?.compact) s -= Math.abs(s) * 0.15; // the compact one (visitors park inside the gate) only where the usual one doesn't fit
  if (sto && a.els && prog.storage.rv) { const got = a.els.filter(e => e.rv).reduce((t, e) => t + S.stalls(e).count, 0); s -= Math.max(0, prog.storage.rv - got) / prog.storage.rv * Math.abs(s) * 0.25; } // the RV / boat stalls asked for
  if (prog.buildings && a.els) { const nb = a.els.filter(e => e.kind === 'building' && e.use === prog.use).length; s -= Math.abs(nb - prog.buildings) / prog.buildings * Math.abs(s) * 0.5; } // as many buildings as asked
  const have = st.stalls + st.garages; if (st.need > have) s -= (st.need - have) / st.need * 1500;
  if (st.need && have > st.need * 1.08) s -= Math.abs(s) * Math.min(0.3, (have / st.need - 1.08) * 0.5); // paving nobody needs
  if (st.pondNeed > 0) s -= Math.max(0, st.pondNeed * 0.95 - st.pond) / st.pondNeed * Math.abs(s) * 1.5; // detention is a requirement, not a nice-to-have
  return s;
}
const norm = d => +((((d % 360) + 360) % 360).toFixed(3));
// frame-feet pieces to plan pieces: centres, outlines and turns
function toPlanEls(F, els) {
  let k = 0;
  return els.map(e0 => { const e = F.wave ? waveEl(F, e0) : e0;
    const o = { ...e }; for (const key of ['aisle', 'con', 'rotL', 'entry', 'median', 'need', 'labelAt', 'zone', 'bulb', 'prog']) delete o[key];
    if (e.path || e.poly) {
      const L = e.poly || S.outline(e), xs = L.map(p => p[0]), ys = L.map(p => p[1]), c = e.labelAt || (e.path ? e.path[Math.floor((e.path.length - 1) / 2)] : S.centroid(e.poly)), cp = toPlan(F, c);
      if (e.poly) o.poly = e.poly.map(p => toPlan(F, p).map(fit)); else o.path = e.path.map(p => toPlan(F, p).map(fit));
      Object.assign(o, { x: fit(cp[0]), y: fit(cp[1]), w: fit(Math.max(...xs) - Math.min(...xs)), d: fit(Math.max(...ys) - Math.min(...ys)), rot: norm(F.psi) });
    } else { const c = toPlan(F, [e.x, e.y]); Object.assign(o, { x: fit(c[0]), y: fit(c[1]), w: +e.w.toFixed(3), d: fit(e.d), rot: norm(F.psi + (e.rotL || 0)) }); }
    o.id = 'e' + (++k).toString(36) + Math.random().toString(36).slice(2, 6);
    return o;
  });
}
// names, front to back from the entry: Apt Bldg 1…, Building A…, Pad A…, Townhome Row 1…, Duplex 1…, Warehouse. Shops,
// offices, restaurants and the rest share one run of letters across the plan (Building A, B, C…), so no two
// buildings share a name; a lone warehouse is the Warehouse.
export const nameKey = (e, pad, B) => pad ? 'pad' : e.use === 'foodtrucks' ? 'ft-' + S.ftKind(e) : e.use === 'storage' ? 'sto-' + S.storageKind(e) : e.use === 'fuel' ? 'fuel-' + S.fuelKind(e) : HOMES.includes(e.use) || e.use === 'multifamily' ? e.use : e.use === 'industrial' && B.filter(b => b.use === 'industrial').length === 1 ? 'warehouse' : 'bldg';
function nameAll(els, at, prog, taken = new Set()) {
  const B = els.filter(e => e.kind === 'building' && e.use !== 'amenity').sort((a, b) => Math.hypot(a.x - at[0], a.y - at[1]) - Math.hypot(b.x - at[0], b.y - at[1])), count = {};
  for (const e of B) {
    const pad = /drive-thru/.test(e.note || ''), key = nameKey(e, pad, B); let i = 0;
    do { i = count[key] = (count[key] || 0) + 1; e.name = nameFor(e, key, i); } while (taken.has(e.name) && i < 999); // a pinned "Apt Bldg 7" keeps its name; the new ones go round it
    if (e.use === 'multifamily') e.units = Math.floor(S.gfaOf(e) * (prog.eff || 0.85) / (prog.unitSf || 900));
    if (e.use === 'storage') e.note = S.storageNote(e);
  }
}
const letter = i => i <= 26 ? String.fromCharCode(64 + i) : String.fromCharCode(64 + Math.ceil(i / 26) - 1) + String.fromCharCode(65 + (i - 1) % 26); // A…Z, AA, AB…
const nameFor = (e, key, i) => key === 'pad' ? 'Pad ' + letter(i) : key.startsWith('ft-') ? { pavilion: 'Pavilion', restroom: 'Restrooms', bar: 'Bar' }[key.slice(3)] + (i > 1 ? ' ' + i : '') : key === 'fuel-store' ? (i > 1 ? 'C-store ' + letter(i) : 'C-store') : key === 'fuel-wash' ? (i > 1 ? 'Car wash ' + letter(i) : 'Car wash') : key === 'sto-climate' ? (i > 1 ? 'Climate Bldg ' + letter(i) : 'Climate-controlled') : key === 'sto-office' ? 'Office' : key === 'sto-drive' ? 'Drive-up ' + letter(i) : key === 'multifamily' ? 'Apt Bldg ' + i : key === 'townhomes' ? 'Townhome Row ' + i : key === 'duplex' ? 'Duplex ' + i : key === 'sfr' ? 'Lot ' + i : key === 'warehouse' ? 'Warehouse' : 'Building ' + letter(i);
// the network from the entrances: drives that touch, parking that touches a drive. A parking field with its own aisle
// (a module of the simple layouts, not a row along a drive) carries the network on. Returns the ids reached.
function reach(els) {
  const D = els.filter(e => e.kind === 'drive' || e.kind === 'truck' || e.kind === 'parking' && !e.row && !S.isFree(e) && Math.min(e.w, e.d) >= 2 * ROW + AISLE - 1), grown = e => e.poly ? { ...e, poly: S.grow(e.poly, 1.5) } : e.path ? { ...e, width: (e.width || 26) + 3 } : { ...e, w: e.w + 3, d: e.d + 3 };
  const G = D.map(grown), seen = new Set(), st = D.filter(e => e.kind === 'drive' && (e.entry || e.name === 'Main entry' || e.through || /^Entrance\b/.test(e.name || '')));
  st.forEach(e => seen.add(e.id));
  while (st.length) { const e = st.pop(), ge = G[D.indexOf(e)]; D.forEach((f, i) => { if (!seen.has(f.id) && S.rectsOverlap(ge, G[i], 0)) { seen.add(f.id); st.push(f); } }); }
  const lots = els.filter(e => e.kind === 'parking' && D.some((d, i) => seen.has(d.id) && S.rectsOverlap(G[i], { ...e, w: e.w + 3, d: e.d + 3 }, 0)));
  lots.forEach(e => seen.add(e.id));
  return seen;
}
// check a plan option; drop pieces that fail and anything cut off from the entry. Returns the problems left.
function repair(plan, els, keep = new Set()) {
  let out = els;
  for (let pass = 0; pass < 3; pass++) {
    const bad = S.check({ ...plan, elements: out }).filter(i => i.level === 'bad' && i.id), ids = new Set(bad.map(i => i.id));
    if (!ids.size) break;
    out = out.filter(e => !ids.has(e.id) || e.name === 'Main entry' || keep.has(e.id));
    if (![...ids].some(id => !keep.has(id))) break;
  }
  const ok = reach(out), cut = out.filter(e => (e.kind === 'drive' || e.kind === 'truck' || e.kind === 'parking') && !ok.has(e.id) && e.note !== 'Drive-thru lane' && !keep.has(e.id));
  out = out.filter(e => !cut.includes(e));
  return { els: out, cut: cut.length, bad: S.check({ ...plan, elements: out }).filter(i => i.level === 'bad') };
}

const OPTION_NAMES = { across: 'Rows facing the street', deep: 'Rows running back' };
// ---------- filling the site ----------
// What was asked for is laid out first; with "fill the site" on (the default) the rest of the land isn't left as lawn:
// it holds more of the same (as many more same-size buildings as fit, or as much floor area / as many units as
// park), marked Phase 2. The program then carries `asked` (phase 1) so a re-solve or re-fit keeps the split.
const HOMES = ['townhomes', 'duplex', 'sfr'];
// ---------- homes on a shared parking court ----------
// Duplexes or townhomes asked for in a number the lots can't hold (24 duplex units on 1.5 acres) are laid out the way a
// rental community on one tract is: two-story buildings of attached units (2 to a duplex, 6 to a townhome row) lining a
// shared parking court, fronts on a walk, patios and yards behind. Units are whole units of a set width.
export const COURTS = {
  court: { label: 'Duplex court', per: 2, unitW: 20, D: 32, gap: 15, what: 'duplex', note: 'Duplex · 2 units · 2-story' },
  court6: { label: 'Townhome court', per: 6, unitW: 19, D: 28, gap: 40, what: 'townhome row', note: 'Townhome row · 6 units · 2-story' }
};
function courtOptions(plan0, req, opts, kinds) {
  const out = [];
  for (const k of kinds) {
    const C = COURTS[k], prog = { use: 'multifamily', units: req.units, buildings: Math.ceil(req.units / C.per), floors: 2, unitSf: C.unitW * C.D * 2, eff: 1, perUnit: req.perUnit && req.perUnit !== S.USES[req.use]?.perUnit ? req.perUnit : 2, storm: req.storm, detentionPct: req.detentionPct, through: req.through, product: k };
    const params = { ...(plan0.params || {}), bldgDepth: C.D, maxLen: C.unitW * C.per, bldgGap: C.gap, unitW: C.unitW, jog: false, fill: false };
    for (const o of layoutCore({ ...plan0, params }, prog, { ...opts, count: 2, noTrim: !!req.through })) { if (o.score === -1e9) continue; // not the plain fallbacks: a court or nothing
      let n = 0; for (const e of o.elements) if (e.kind === 'building' && e.use === 'multifamily') { e.name = (C.per === 2 ? 'Duplex ' : 'Bldg ') + (++n); const u = Math.round(e.w / C.unitW); e.units = u; e.note = u === C.per ? C.note : u + ' units · 2-story'; e.unitW = C.unitW; }
      let els = o.elements, notes = o.notes.filter(t => !/^Fits about/.test(t)); const got = els.reduce((s, e) => s + (e.kind === 'building' && e.units || 0), 0);
      if (got < req.units) notes.unshift('Fits ' + got + ' of the ' + req.units + ' units asked for.');
      if (req.through) { const pt = pullThrough(plan0, els); if (pt) { els = pt; notes.push('A second, pull-through drive runs out to the side street.'); } else notes.push(plan0.streets?.length ? 'No gap between buildings lines up with the side street for a pull-through drive.' : 'Mark the side street (Side Street, then its lot line) to add the pull-through drive.'); }
      out.push({ ...o, elements: els, notes, name: C.label + ' · ' + o.name, params, program: { ...o.program, product: k, perUnit: prog.perUnit, unitSf: prog.unitSf, eff: 1, floors: 2 } });
    }
  }
  return out;
}
// a pull-through: a second drive from the court's spine out to a side street, through the widest gap between buildings
// (parking rows it crosses are cut). Plan feet; returns the new elements, or null when there's no side street or gap.
export function pullThrough(plan, els, W = 24) {
  const ring = plan.ring, rules = S.edgeRules(ring, plan.front, plan.setbacks, plan.streets), n = ring.length;
  const spine = els.filter(e => e.kind === 'drive' && !S.isFree(e) && !e.turn && e.name !== 'Main entry').sort((a, b) => Math.max(b.w, b.d) - Math.max(a.w, a.d))[0]; if (!spine) return null;
  const along = spine.w >= spine.d, L = along ? spine.w : spine.d, u = rot([1, 0], (spine.rot || 0) + (along ? 0 : 90)), B = els.filter(e => e.kind === 'building').map(S.outline);
  const solid = els.filter(e => e.kind === 'building' || e.kind === 'trash' || e.kind === 'garage' || e.kind === 'pond' || e.name === 'Main entry' || e.turn).map(e => ({ e, o: S.shapeOf(e) }));
  let best = null;
  rules.forEach((r, k) => {
    if (!r.street) return;
    const a = ring[k], b = ring[(k + 1) % n], o = S.outwardOf(ring, k); if (Math.abs(o[0] * u[0] + o[1] * u[1]) > 0.35) return; // the street runs along the spine
    const s = Math.abs(o[0] * -u[1] + o[1] * u[0]) > 0 ? (o[0] * -u[1] + o[1] * u[0] > 0 ? [-u[1], u[0]] : [u[1], -u[0]]) : null; if (!s) return;
    for (let t = -L / 2 + W / 2 + 30; t <= L / 2 - W / 2 - 30; t += 2) {
      const A = [spine.x + u[0] * t, spine.y + u[1] * t], den = (b[0] - a[0]) * s[1] - (b[1] - a[1]) * s[0]; if (Math.abs(den) < 1e-9) continue;
      const q = ((b[0] - a[0]) * (a[1] - A[1]) - (b[1] - a[1]) * (a[0] - A[0])) / den, f = ((A[0] - a[0]) * s[1] - (A[1] - a[1]) * s[0]) / den; // A + s q on edge at fraction f
      if (q < 20 || f < 0.05 || f > 0.95) continue;
      const strip = [[0, -W / 2], [q + 1, -W / 2], [q + 1, W / 2], [0, W / 2]].map(([v, w]) => [A[0] + s[0] * v + u[0] * w, A[1] + s[1] * v + u[1] * w]);
      const gap = Math.min(...B.map(o2 => Math.min(...o2.map((p, i) => S.segSeg(p, o2[(i + 1) % o2.length], strip[0], strip[1])), ...o2.map((p, i) => S.segSeg(p, o2[(i + 1) % o2.length], strip[2], strip[3])), ...o2.map(p => S.inRing(p, strip) ? 0 : Infinity))));
      if (gap < 6 || solid.some(({ e, o: sh }) => e.kind !== 'building' && (sh.some(p => S.inRing(p, strip)) || strip.some(p => S.inRing(p, sh))))) continue;
      const v = gap * 2 - Math.abs(t) * 0.05; if (!best || v > best.v) best = { v, A, s, q, t, k };
    }
  });
  if (!best) return null;
  const { A, s, q } = best, R = 15, h = W / 2, at = (v, w) => [+(A[0] + s[0] * v + u[0] * w).toFixed(2), +(A[1] + s[1] * v + u[1] * w).toFixed(2)], poly = [at(0, -h)];
  for (let i = 0; i <= 6; i++) { const g = i / 6 * Math.PI / 2; poly.push(at(q - R + R * Math.sin(g), -h - R + R * Math.cos(g))); } // flare into the street
  poly.push(at(q + 1, -h - R), at(q + 1, h + R));
  for (let i = 6; i >= 0; i--) { const g = i / 6 * Math.PI / 2; poly.push(at(q - R + R * Math.sin(g), h + R - R * Math.cos(g))); }
  poly.push(at(0, h));
  const out = S.cutRows(els, poly, 1); // parking rows across the drive: what's left either side
  out.push({ kind: 'drive', poly, name: 'Second entry', note: 'Pull-through · ' + W + ' ft to the side street', through: true });
  return out;
}
// the extras asked for with a single use, on the land the layout left open: outdoor seating against the main building,
// a playground and a named lawn on the biggest open piece. Notes what didn't fit.
function withExtras(plan, o, extras) {
  if (!extras?.length) return o;
  const ring = plan.ring, els = o.elements.slice(), notes = o.notes.slice(), rules = S.edgeRules(ring, plan.front, plan.setbacks, plan.streets);
  const hard = () => els.filter(e => !['green', 'lot', 'trail', 'fence'].includes(e.kind)), clear = (c, pad) => S.corners(c).every(q => S.inRing(q, ring) && ring.every((a, k) => S.segDist(q, a, ring[(k + 1) % ring.length]) >= Math.min(rules[k].pave, 10) - 0.5)) && !hard().some(e => S.rectsOverlap({ ...c, w: c.w + 2 * pad, d: c.d + 2 * pad }, e, 0.3));
  const B = els.filter(e => e.kind === 'building' && e.use !== 'amenity').sort((a, b) => S.footArea(b) - S.footArea(a))[0];
  if (extras.includes('patio') && B && !els.some(e => e.kind === 'patio')) { // against a wall, clear of the drives (the walk round the building is 8 ft)
    let best = null;
    for (const side of [[0, -1], [0, 1], [-1, 0], [1, 0]]) for (const len of [Math.min(48, (side[0] ? B.d : B.w) * 0.7), 30, 20]) {
      const w = side[0] ? 16 : len, d = side[0] ? len : 16, q = S.rotPt([side[0] * (B.w / 2 + 8.5), side[1] * (B.d / 2 + 8.5)], B.rot || 0), c = { kind: 'patio', x: B.x + q[0], y: B.y + q[1], w, d, rot: B.rot || 0 }; // against the wall, in place of the walk there
      if (clear(c, 0.5)) { const v = len - (side[1] === -1 ? 0 : 5); if (!best || v > best.v) best = { v, c }; break; }
    }
    if (best) els.push({ ...best.c, x: +best.c.x.toFixed(2), y: +best.c.y.toFixed(2), name: '', note: 'Outdoor seating' }); else notes.push('No room for the outdoor seating beside the building.');
  }
  const greens = els.filter(e => e.kind === 'green' && !e.future && !e.name).sort((a, b) => S.elArea(b) - S.elArea(a));
  if (extras.includes('playground') && !els.some(e => e.kind === 'play')) {
    let best = null; const to = B ? [B.x, B.y] : S.centroid(ring), rotP = B?.rot || 0;
    for (const g of greens.slice(0, 4)) { const o2 = S.outline(g), xs = o2.map(q => q[0]), ys = o2.map(q => q[1]);
      for (const [w, d] of [[64, 48], [50, 40], [40, 32]]) { for (let x = Math.min(...xs); x <= Math.max(...xs); x += 6) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 6) {
        const c = { kind: 'play', x, y, w, d, rot: rotP }; if (!S.corners(c).every(q => S.inRing(q, o2)) || !clear(c, 4)) continue;
        const v = w * d - Math.hypot(x - to[0], y - to[1]) * 2; if (!best || v > best.v) best = { v, c }; } if (best) break; } }
    if (best) els.push({ ...best.c, x: +best.c.x.toFixed(2), y: +best.c.y.toFixed(2), name: 'Playground' }); else notes.push('No room left for the playground.');
  }
  const playEl = els.find(e => e.kind === 'play');
  if (extras.includes('lawn')) { const g = (playEl && greens.find(e => S.inRing([playEl.x, playEl.y], S.outline(e)))) || greens.find(e => S.elArea(e) >= 2500); /* the lawn round the playground, else the biggest */ if (g) { const i = els.indexOf(g); els[i] = { ...g, name: 'Lawn', note: 'Open grass · ' + Math.round(S.elArea(g)).toLocaleString('en-US') + ' sf', trees: false }; } else notes.push('No open lawn left beside the building.'); }
  return { ...o, elements: els, notes };
}
// housing in general ("multifamily", "rental housing"): lay out the products a developer would weigh (garden
// apartments, studio and one-bed apartments, townhomes, duplexes) and rank them by what they'd be worth: the
// stabilized value from the pro forma's defaults, discounted when a product's yield on cost trails the best one's
export const PRODUCTS = [
  ['Garden apartments', p => ({ ...p, compare: false })],
  ['Studio and 1-bed apartments', p => ({ ...p, compare: false, mix: [{ name: 'Studio', sf: 520, pct: 35, beds: 0 }, { name: '1 BR', sf: 720, pct: 50, beds: 1 }, { name: '2 BR', sf: 1000, pct: 15, beds: 2 }] })],
  ['Townhomes for rent', p => ({ use: 'townhomes', floors: 2, storm: p.storm ?? null, detentionPct: p.detentionPct ?? null, entrances: p.entrances ?? null })],
  ['Duplexes', p => ({ use: 'duplex', storm: p.storm ?? null, detentionPct: p.detentionPct ?? null, entrances: p.entrances ?? null })]];
function compareProducts(plan0, programIn, opts) {
  const all = [];
  for (const [label, f] of PRODUCTS) { const prog = f({ ...programIn, units: null, gfa: null }); let list = []; try { list = layoutOptions(plan0, prog, { ...opts, count: 2, noCompare: true }); } catch (e) { list = []; }
    for (const o of list.filter(o => o.elements.length && !/Simple layout/.test(o.name))) { const q = PF.quick({ ...plan0, elements: o.elements, program: o.program }); if (q) all.push({ ...o, name: label + ' · ' + o.name, product: label, fin: q }); } }
  if (!all.length) return layoutOptions(plan0, { ...programIn, compare: false }, { ...opts, noCompare: true });
  const best = Math.max(...all.map(o => o.fin.yoc || 0)) || 1, worth = o => o.fin.value * Math.min(1, (o.fin.yoc || 0) / best) ** 2;
  all.sort((a, b) => worth(b) - worth(a));
  const pick = [], seen = new Set(); for (const o of all) if (!seen.has(o.product) && pick.length < 3) { pick.push(o); seen.add(o.product); } // the best of each product first
  for (const o of all) if (pick.length < Math.max(3, opts.count || 3) && !pick.includes(o)) pick.push(o);
  return pick.map((o, i) => ({ ...o, notes: [(i === 0 ? 'Best value of the housing types tried: ' : '') + o.product + ' ≈ $' + (o.fin.value / 1e6).toFixed(1) + 'M stabilized value on $' + (o.fin.cost / 1e6).toFixed(1) + 'M cost (' + ((o.fin.yoc || 0) * 100).toFixed(1) + '% yield on cost, pro forma defaults).', ...o.notes] }));
}
// opts.keepout: easements drawn on the plan (no-build areas). Every attempt keeps its drives, parking, buildings and pond
// off them (the same way it keeps off a reserved strip), and each option gets them back on its own elements, options
// with nothing on an easement first. Separate from opts.pinned, so none of a re-fit's rules apply.
let KO = null;
export function layoutOptions(plan0, programIn, opts = {}) {
  if (opts.keepout?.length && !KO) { KO = opts.keepout; try { const out = layoutOptions(plan0, programIn, { ...opts, keepout: null }), ko = opts.keepout.map(e => ({ ...e, pinned: true }));
    const on = o => S.check({ ...plan0, elements: o.elements.concat(ko), program: o.program }).filter(i => / is on /.test(i.text)).length;
    return out.map(o => ({ ...o, elements: o.elements.concat(ko.map(e => ({ ...e }))), _on: on(o) })).sort((a, b) => a._on - b._on).map(({ _on, ...o }) => o); } finally { KO = null; } }
  if (S.normalizeProgram(programIn).compare && S.normalizeProgram(programIn).use === 'multifamily' && !opts.pinned?.length && !opts.noCompare) return compareProducts(plan0, programIn, opts);
  const out0 = layoutOptions0(plan0, programIn, opts), asked = S.normalizeProgram(programIn).entrances || 0;
  // last, with every way in down: aisles that stop at a curb run on to a drive, or get a place to turn
  return withEntrances(plan0, out0, asked, opts).map(o => o.elements?.length && !opts.pinned?.length ? { ...o, elements: S.openDeadEnds(plan0, o.elements).elements } : o);
}
function withEntrances(plan0, out, asked, opts) {
  if (asked === 1 || opts.pinned?.length && !asked) return out; // one, as asked; a re-fit keeps the ways in the plan has
  const wants = new Map(out.map(o => [o, asked ? { n: asked, why: '' } : entranceNeed(plan0, o.elements)]));
  if (![...wants.values()].some(w => w.n >= 2)) return out;
  const done = out.map(o => { // more ways in, as asked or as the site needs: on the front or a side street, as far from the others as they can be
    const want = wants.get(o), have = S.entrancesOf(o.elements).length; if (have >= want.n || !o.elements.length || o.ownEntrances) return o; // (a gas station places its own, back from the corner)
    const r = S.moreEntrances({ ...plan0, elements: o.elements }, want.n - have, { side: want.why === 'corner' }), auto = !asked && r.added.length;
    return { ...o, elements: r.elements, notes: o.notes.concat(auto ? [ENTRY_WHY[want.why] || r.added.length + ' more entrance' + (r.added.length > 1 ? 's' : '') + ' in from the street.'] : r.added.length ? [r.added.length + ' more entrance' + (r.added.length > 1 ? 's' : '') + ' in from the street.'] : [], r.note && asked ? [r.note + (plan0.streets?.length ? '' : ' Mark a side street (Side Street) for room on another side.')] : []) };
  });
  if (!asked) { // the site's own need: fire access (homes, apartments, a very big site) puts the layouts that have it first, and says so on the rest; a corner or a big lot just takes what fits
    const must = o => ['homes', 'apts', 'huge'].includes(wants.get(out[done.indexOf(o)])?.why), short = o => S.entrancesOf(o.elements).length < wants.get(out[done.indexOf(o)]).n;
    const flagged = done.map(o => must(o) && short(o) ? { ...o, notes: o.notes.concat(['Needs a second way in for fire access, and there’s no clear spot on the street side for one: plan an emergency access drive, or mark a side street (Side Street) for room on another side.']) } : o);
    // a layout that has the ways in goes first only when it's about as good otherwise (within a tenth of the homes or floor
    // area, the same amenities): the entrances never outrank what was asked for
    const top = flagged[0], val = o => { const m = S.metrics({ ...plan0, elements: o.elements }); return (m.units || 0) * 1000 + m.gfa / 100; }, ams = o => o.elements.filter(e => e.use === 'amenity' || e.kind === 'pool').length;
    if (top && must(done[0]) && short(done[0])) { const alt = flagged.find((o, i) => i > 0 && !short(done[i]) && val(o) >= val(top) * 0.9 && ams(o) >= ams(top)); if (alt) return [alt, ...flagged.filter(o => o !== alt)]; }
    return flagged;
  }
  const ok = o => S.entrancesOf(o.elements).length >= asked; return done.filter(ok).concat(done.filter(o => !ok(o))); // the ones with every entrance first
}
// how many ways in a layout wants when the request doesn't say: two for a corner lot (one on each street) past a small
// pad, for more than 30 homes or 200 apartments (fire access wants a second way in), for a big parking field (over
// about 400 spaces) or a site over 15 acres; three for a very large one. { n, why }
const ENTRY_WHY = { corner: 'A second entrance on the side street: a corner lot is reached from both streets.', homes: 'A second way in: a neighbourhood of more than 30 homes needs one for fire access.', apts: 'A second way in: more than 200 apartments need one for fire access.', big: 'A second entrance: a parking field this size needs more than one way in and out.', huge: 'More entrances: a site this size needs three ways in.' };
export function entranceNeed(plan, els) {
  const m = S.metrics({ ...plan, elements: els }), ac = S.ringArea(plan.ring || []) / 43560, rules = S.edgeRules(plan.ring, plan.front, plan.setbacks, plan.streets);
  const homes = els.filter(e => e.kind === 'building' && HOMES.includes(e.use)).reduce((t, e) => t + (e.units || 1), 0), apts = Math.max(0, (m.units || 0) - homes);
  const corner = rules.some((r, k) => r.street && r.role !== 'front' && S.edgeLen(plan.ring, k) >= 150);
  if (m.spaces > 1200 || ac > 60 || apts > 600 || homes > 300) return { n: 3, why: 'huge' };
  if (homes > 30) return { n: 2, why: 'homes' }; if (apts > 200) return { n: 2, why: 'apts' };
  if (corner && (ac >= 1.5 || m.spaces >= 60 || (m.units || 0) >= 40)) return { n: 2, why: 'corner' };
  if (m.spaces > 400 || ac > 15) return { n: 2, why: 'big' };
  return { n: 1, why: '' };
}
function layoutOptions0(plan0, programIn, opts = {}) {
  let Q = S.normalizeProgram(programIn);
  const built = (Q.zones || []).filter(z => z.use !== 'amenity');
  if (built.length === 1 && S.ringArea(plan0.ring) < 12 * 43560 && !opts.pinned?.length) { // one use with a lawn or a playground on a small site: one layout, the extras on its open land
    const z = built[0], items = (Q.zones || []).filter(x => x.use === 'amenity').flatMap(x => x.items || []).map(t => t === 'lake' ? null : t === 'playground' ? 'playground' : 'lawn').filter(Boolean);
    programIn = { ...programIn, zones: null, use: z.use, gfa: z.gfa ?? programIn.gfa ?? null, units: z.units ?? programIn.units ?? null, floors: z.floors ?? programIn.floors, buildings: z.buildings ?? programIn.buildings, extras: [...new Set([...(Q.extras || []), ...(items.length ? items : ['lawn'])])] };
    Q = S.normalizeProgram(programIn);
  }
  if (Q.extras?.length && !Q.zones) return layoutChoices(plan0, programIn, opts).map(o => withExtras(plan0, o, Q.extras));
  const out = layoutChoices(plan0, programIn, opts);
  return out.length || !Q.zones || opts.pinned?.length || opts.noShrink ? out : mixedShrunk(plan0, Q, opts);
}
// several uses that don't lay out together on this site (a wedge too tight for shops and apartments side by side):
// the same mix smaller, then the main use alone, saying so, rather than no layouts at all
function mixedShrunk(plan0, Q, opts) {
  const sized = Q.zones.filter(z => z.use !== 'garage' && z.use !== 'amenity'), label = z => (S.USES[z.use]?.label || z.use).split(' / ')[0].toLowerCase();
  for (const f of [0.75, 0.5]) {
    const zones = Q.zones.map(z => ({ ...z, ...(z.gfa ? { gfa: Math.round(z.gfa * f / 100) * 100 } : {}), ...(z.units ? { units: Math.max(1, Math.floor(z.units * f)) } : {}) }));
    const out = layoutChoices(plan0, { ...Q, zones }, { ...opts, noShrink: true }); if (out.length) return out.map(o => ({ ...o, notes: ['The mix as asked doesn’t lay out on this site; this is it at about ' + Math.round(f * 100) + '% of the size.', ...(o.notes || [])] }));
  }
  const main = sized.slice().sort((a, b) => (b.units ? b.units * 900 : b.gfa || 0) - (a.units ? a.units * 900 : a.gfa || 0))[0]; if (!main) return [];
  const one = { ...Q, zones: null, use: main.use, gfa: main.gfa, units: main.units, floors: main.floors ?? Q.floors, buildings: main.buildings };
  return layoutChoices(plan0, one, { ...opts, noShrink: true }).map(o => ({ ...o, notes: [sized.filter(z => z !== main).map(label).join(' and ').replace(/^./, c => c.toUpperCase()) + ' and ' + label(main) + ' don’t fit together on this site; this is the ' + label(main) + ' alone.', ...(o.notes || [])] }));
}
// an ask bigger than the site holds with its parking (100,000 sf on an acre): try sizes down from what the land could
// carry and keep the largest that lays out whole, parked and inside every setback. null when the ask fits as it is.
function feasibleSize(plan0, programIn, opts) {
  const Q = S.normalizeProgram(programIn), foot = wantFoot(Q); if (Q.zones || HOMES.includes(Q.use) || opts.pinned?.length || opts.noFeasible || foot == null) return null;
  const mf = Q.use === 'multifamily', gfa = mf ? Q.units * Q.unitSf / 0.85 : Q.gfa, site = S.ringArea(plan0.ring);
  const per1k = 1000 / Q.floors + (mf ? Q.perUnit * 1000 / (Q.unitSf / 0.85) : Q.ratio) * 330, cap = site * 0.72 / per1k * 1000; // land a thousand sq ft of floor takes: its footprint and its parking
  if (gfa <= cap * 1.1) return null;
  const ok = o => { const p = { ...plan0, elements: o.elements, program: o.program }, m = S.metrics(p); return m.spaces >= m.required && !S.check(p).some(i => i.level === 'bad') ? m.gfa : 0; };
  let best = null;
  for (const f of [1.3, 1.1, 0.95, 0.8, 0.65, 0.5, 0.35, 0.2]) {
    const t = cap * f, pr = mf ? { ...programIn, units: Math.max(4, Math.floor(t * 0.85 / Q.unitSf)), gfa: null, asked: null } : { ...programIn, gfa: Math.round(t / 100) * 100, max: false, asked: null };
    const r = layoutCore(plan0, pr, { ...opts, count: 3, budgetMs: 900 }).filter(o => o.score !== -1e9), g = Math.max(0, ...r.map(ok));
    if (g > (best?.g || 0)) best = { g, r, pr };
    if (best && best.g >= t * 0.9) break; // the largest size tried that lays out (nearly) whole
  }
  if (!best) return null;
  const what = mf ? Q.units + ' units' : Math.round(gfa).toLocaleString('en-US') + ' sq ft', got = mf ? (o => S.metrics({ ...plan0, elements: o.elements, program: o.program }).units) : (o => Math.round(S.metrics({ ...plan0, elements: o.elements, program: o.program }).gfa).toLocaleString('en-US') + ' sq ft');
  const ac = (site / 43560).toFixed(2);
  return best.r.sort((a, b) => ok(b) - ok(a)).map(o => ({ ...o, notes: [what + ' won’t fit on ' + ac + ' acres with ' + (mf ? 'its' : 'their') + ' parking and setbacks; this is about the most that does: ' + got(o) + (mf ? ' units' : '') + '.', ...o.notes.filter(n => !/^Fits about/.test(n))] }));
}
function layoutChoices(plan0, programIn, opts = {}) {
  const fz = feasibleSize(plan0, programIn, opts); if (fz?.length) return fz;
  const Q = S.normalizeProgram(programIn);
  if ((Q.use === 'duplex' || Q.use === 'townhomes') && Q.units && !opts.pinned?.length && !opts.noCourt && Q.product !== 'lots') {
    const lots = Q.product ? [] : layoutCore(plan0, programIn, opts), got = Math.max(0, ...lots.map(o => S.metrics({ ...plan0, elements: o.elements, program: o.program }).units || 0));
    if (Q.product || got < Q.units * 0.9) {
      const courts = courtOptions(plan0, Q, opts, Q.product ? [Q.product] : Q.use === 'duplex' ? ['court', 'court6'] : ['court6', 'court']), close = o => Math.abs((S.metrics({ ...plan0, elements: o.elements, program: o.program }).units || 0) - Q.units);
      const note = Q.product ? 'Laid out as a community on one tract: two-story rows on a shared parking court.' : Q.units + ' ' + (Q.use === 'duplex' ? 'duplex units' : 'townhomes') + ' on lots of their own don’t fit here' + (got ? ' (about ' + got + ' would)' : '') + ', so this is a rental community on one tract: two-story rows on a shared parking court.';
      const un = o => S.metrics({ ...plan0, elements: o.elements, program: o.program }).units || 0, most = Math.max(0, ...courts.map(un));
      const ranked = courts.filter(o => un(o) >= most * 0.75 && !courts.some(p => p !== o && p.name === o.name && un(p) > un(o))) /* and not a smaller copy of another */.sort((a, b) => close(a) - close(b) || b.score - a.score).map(o => note ? { ...o, notes: [note, ...o.notes] } : o); // well short of the best: left out
      return ranked.length ? ranked.slice(0, opts.count || 3) : lots;
    }
    return lots;
  }
  return layoutFill(plan0, programIn, opts);
}
function layoutFill(plan0, programIn, opts = {}) {
  const P0 = S.normalizeProgram(programIn), ask = P0.asked, req = ask ? S.normalizeProgram({ ...programIn, ...ask, asked: null, max: false, gfa: ask.gfa, units: ask.units, buildings: ask.buildings }) : P0;
  const fill = plan0.params?.fill !== false && !req.zones && !HOMES.includes(req.use) && wantFoot(req) != null && !opts.noFill;
  if (!fill) return layoutCore(plan0, ask ? { ...programIn, asked: null, gfa: req.gfa, units: req.units, buildings: req.buildings } : programIn, opts);
  if (opts.pinned?.length) return withPhases(plan0, layoutCore(plan0, programIn, opts), req); // a re-fit keeps the full build-out
  const asked = { gfa: req.gfa, units: req.units, buildings: req.buildings }, foot = wantFoot(req), mf = req.use === 'multifamily', t0 = Date.now();
  const plain = () => layoutCore(plan0, { ...programIn, asked: null }, opts), sizeOf = o => (o?.elements || []).filter(e => e.kind === 'building' && e.use === req.use).map(S.footArea);
  let full = null;
  if (req.buildings || !mf) { // the same size of building as asked for (a size with no count is one building), as many as the site holds
    const nb = req.buildings || 1, each = foot / nb;
    const probe = layoutCore(plan0, { ...programIn, gfa: null, units: null, buildings: null, max: true, asked: null }, { ...opts, count: 1, depth: 2, budgetMs: 0 })[0];
    let n = Math.floor(sizeOf(probe).reduce((a, b) => a + b, 0) * 0.97 / each);
    const progN = k => ({ ...programIn, asked: null, gfa: mf ? null : Math.round(k * each * req.floors), units: mf && req.units ? Math.round(req.units * k / nb) : null, buildings: k });
    for (let tries = 0; n > nb && tries < 4; tries++) { // fewer if they come out smaller than asked: as many as the floor area placed holds
      const r = layoutCore(plan0, progN(n), { ...opts, budgetMs: 1200 }), sz = sizeOf(r[0]);
      const parked = o => o && (m => m.spaces >= m.required)(S.metrics({ ...plan0, elements: o.elements, program: o.program }));
      if (sz.length >= n && Math.min(...sz) >= each * 0.97 && parked(r[0])) { full = r.filter(parked).concat(r.filter(o => !parked(o))); break; } // every building parked, the later phases too
      n = sz.length < n ? Math.min(n - 1, sz.length) : Math.min(n - 1, Math.floor(sz.reduce((a, b) => a + b, 0) / each));
    }
    if (!full) return plain();
    const okSize = o => sizeOf(o).length >= n && Math.min(...sizeOf(o)) >= each * 0.95; full = full.some(okSize) ? full.filter(okSize) : full; // only buildings the size asked for (fewer options rather than a wrong one)
  } else full = layoutCore(plan0, { ...programIn, gfa: null, units: null, max: true, asked: null }, opts);
  const out = withPhases(plan0, full, req);
  return out.some(o => o.phase2) ? out.map(o => ({ ...o, program: { ...o.program, asked } })) : plain();
}
// mark the buildings past what was asked for (furthest from the entry first) as Phase 2, with a note
function withPhases(plan, options, req) {
  return options.map(o => {
    const els = o.elements, B = els.filter(e => e.kind === 'building' && e.use === req.use), ent = els.find(e => e.name === 'Main entry'), at = ent ? [ent.x, ent.y] : S.centroid(plan.ring);
    B.sort((a, b) => Math.hypot(a.x - at[0], a.y - at[1]) - Math.hypot(b.x - at[0], b.y - at[1]));
    const mf = req.use === 'multifamily', want = req.buildings && !mf ? null : mf ? req.units : req.gfa, val = e => mf ? (e.units || 0) : S.gfaOf(e);
    let got = 0, n1 = 0; for (const e of B) { delete e.phase; if (req.buildings ? n1 < req.buildings : got < want * 0.97) { got += val(e); n1++; } else e.phase = 2; }
    const P2 = B.filter(e => e.phase === 2); if (!P2.length) return o;
    for (const e of P2) e.note = 'Phase 2';
    const g2 = P2.reduce((s, e) => s + val(e), 0), f = v => Math.round(v).toLocaleString('en-US');
    const note = 'Phase 1 is what was asked for: ' + n1 + ' building' + (n1 > 1 ? 's' : '') + ', ' + (mf ? f(got) + ' units' : f(got) + ' sq ft') + '. The rest of the site holds ' + P2.length + ' more (' + (mf ? f(g2) + ' units' : f(g2) + ' sq ft') + ') as Phase 2, so no land is left over.';
    return { ...o, phase2: P2.length, notes: [note, ...o.notes.filter(n => !/left for a future phase|Fits about/.test(n))] };
  });
}

function layoutCore(plan0, programIn, opts = {}) {
  const prog = S.normalizeProgram(programIn), plan = { ...plan0, setbacks: { ...S.SETBACKS, ...(plan0.setbacks || {}) } }, site = S.ringArea(plan.ring);
  useParams(plan); if (prog.storm) PAR.storm = { ...(PAR.storm || {}), mode: prog.storm }; // asked for in words: retention, underground…
  if (prog.use === 'foodtrucks') return foodTruckCore(plan, prog, opts);
  if (prog.zones) { // shops and offices with no garage asked for: also try one, where it adds more leasable floor area than it costs
    const a = mixedOptions(plan, prog, opts), commercial = prog.zones.filter(z => COMMERCIAL.includes(z.use)).length && !prog.zones.some(z => HOMES.includes(z.use) || z.use === 'multifamily');
    const spare = (a[0]?.elements || []).filter(e => e.kind === 'green' && e.future).reduce((t, e) => t + S.elArea(e), 0); // land kept for later: no garage while there's an acre to park on
    if (spare >= 43560 || prog.garage || prog.zones.some(z => z.use === 'garage') || !commercial || opts.pinned?.length || opts.noGarage || PARAMS.fill === false && plan.params?.fill !== true || plan.params?.fill === false) return a;
    const b = mixedOptions(plan, S.normalizeProgram({ ...prog, garage: true }), { ...opts, autoGarage: true }).filter(o => o.elements.some(e => e.kind === 'garage') && (m => m.spaces <= m.required * 1.1 + 2)(S.metrics({ ...plan, program: o.program, elements: o.elements }))).map(o => ({ ...o, name: o.name + ' · parking garage' }));
    const all = a.concat(b).filter(o => o.elements.length).sort((x, y) => (y.score ?? -1e9) - (x.score ?? -1e9)), N = opts.count || 3; return all.slice(0, Math.max(N, 3)).concat(all.length ? [] : a).slice(0, Math.max(N, 3));
  }
  if (prog.use === 'fuel') return fuelOptions(plan, prog, opts, { frameOf, spans, finishLand, toPlanEls, repair, withTrash, profile }); // a gas station: lib/sitefuel.mjs
  const pinned = opts.pinned || [], foot0 = wantFoot(prog), devAc = stormAcres(site, prog, foot0), storm = stormNeed(devAc, plan.params || {}, prog, site / 43560), pondHave = pinned.filter(e => e.kind === 'pond').reduce((s, e) => s + S.elArea(e), 0), pond = Math.max(0, storm.area - pondHave), foot = (f => f == null ? f : Math.max(0, f - pinned.filter(e => e.kind === 'building' && e.use === prog.use).reduce((t, e) => t + S.footArea(e), 0)))(wantFoot(prog)); // pinned buildings count toward the program
  const keepPlan = pinned.filter(e => e.kind !== 'lot' && e.kind !== 'green').map(e => obstacleOf(e)), keepIds = new Set(pinned.map(e => e.id)), pt = tally(pinned, prog);
  const found = [];
  const t0 = Date.now();
  const da = Math.abs(((frontAngle(plan) - S.mainAngle(plan.ring)) % 90 + 135) % 90 - 45), aligns = da > 4 ? ['main', 'front'] : ['main']; // squared with the lot, and with the street when that differs
  const waves = prog.use === 'sfr' && PAR.streets !== 'straight' ? [true] : [null]; // neighbourhood streets curve unless asked to run straight
  const pass = (depth, shifts, entries, limit = null, frames = [false, true]) => { for (const deep of prog.use === 'storage' ? [false] : frames) { // storage: the climate building and the gate face the street
    for (const wv of waves) {
    for (const align of aligns) {
    const F0 = frameOf(plan, deep, align), F = wv ? waveFrame(F0, waveOf(F0)) : F0, seqs = sequences(prog.use, prog, F);
    for (const pondAt of pond ? ['back', 'front', 'end'] : ['none']) {
      const ranked = seqs.map(seq => ({ seq, v: estimate(F, seq, prog, pond, pondAt, foot) })).filter(q => q.v != null).sort((a, b) => b.v - a.v).slice(0, depth); if (opts.debug) console.log('frame', deep, 'psi', F.psi.toFixed(1), 'pondAt', pondAt, 'seqs', seqs.length, 'ranked', ranked.length, 'X', F.X0.toFixed(0), F.X1.toFixed(0), 'Y', F.Y0.toFixed(0), F.Y1.toFixed(0));
      for (const q of ranked) for (const shift of shifts) for (const at of entries) for (const win of foot && !pinned.length ? [null, windowFor(F, q.seq, prog, foot)].filter((w, i) => !i || w) : [null]) {
        if (limit && ++limit.used > limit.n && Date.now() > limit.end || limit && Date.now() > limit.stop) return; // the wider look runs to its time, but never fewer than n tries (a busy machine still finds the good ones), and stops at four times its time
        const ent = { ...(ENTRY[prog.use] || { w: 30 }) }; if (at != null) { const P = profile(F); ent.at = F.deep ? P.b[0] + (P.b[1] - P.b[0]) * at : F.X0 + (F.X1 - F.X0) * at; }
        if (win && !F.deep) ent.at = (win[0] + win[1]) / 2;
        const share = win ? Math.min(1, (S.ringArea(clipY(F.rrT, win[0], win[1])) || site) / site) : 1, pw = win ? Math.max(0, stormNeed(Math.min(devAc, site * share / 43560), plan.params || {}, prog, site / 43560).area - pondHave) : pond; // a smaller first phase needs less detention
        const keepW = win ? [box(-1e5, -1e5, win[0], 1e5), box(win[1], -1e5, 1e5, 1e5)] : [];
        const o = { pond: pw, pondAt: pw < 3000 ? 'none' : pondAt, footprint: foot, noTrim: !!opts.noTrim, shift, entry: ent, ...(DRIVES[prog.use] || {}), ...(win ? { keep: keepW, win: share, winX: win } : {}), ...(pinned.length ? { xNeed: pt.need, xHave: pt.stalls + pt.garages, keep: keepPlan.map(r => r.map(p => rot(p, -F.psi))), anchors: pinned.filter(e => e.kind === 'building' && e.use !== 'amenity').map(e => S.shapeOf(e).map(p => rot(p, -F.psi))), solid: pinned.filter(e => !['lot', 'green', 'trail'].includes(e.kind)).map(e => ({ kind: 'building', use: 'amenity', poly: S.shapeOf(e).map(p => rot(p, -F.psi)) })) /* no lawn laid over a pinned piece */, spec: pinned.some(e => e.name === 'Clubhouse') ? { amenity: false } : {} } : {}) }, a = attempt(plan, F, q.seq, prog, o);
        if (!a) continue;
        const els = adoptEntry(toPlanEls(F, a.els), pinned), entry = els.find(e => e.name === 'Main entry') || pinned.find(e => e.name === 'Main entry');
        nameAll(els, entry ? [entry.x, entry.y] : S.centroid(plan.ring), prog);
        const fx = repair(plan, els.concat(pinned.map(e => ({ ...e }))), keepIds); a.st = { ...tally(a.els, prog), pond: a.st.pond, pondNeed: a.st.pondNeed };
        if (opts.debug) console.log((deep ? 'deep' : 'across'), pondAt, shift, o.win ? 'WIN ' + o.win.toFixed(2) : '', 'blocks', q.seq.blocks.map(b => b.fill[0]).join(''), 'aisles', a.r.live.map(r => r.i + ':' + Math.round(r.ea) + '-' + Math.round(r.eb)).join(' '), 'cons', a.r.cons.length, 'cut', fx.cut, 'bad', fx.bad.map(i => i.text).join(';'), 'st', JSON.stringify(a.st), 'notes', a.r.notes.join(';'));
        const club = prog.use !== 'multifamily' || !a.spec.amenity || fx.els.some(e => e.name === 'Clubhouse');
        found.push({ a, els: fx.els, bad: fx.bad.filter(i => !keepIds.has(i.id)), cut: fx.cut, recipe: { deep, seq: q.seq, o, ...(F.wave ? { wave: waveOf(F0) } : {}), ...(align !== 'main' ? { align } : {}) }, key: (deep ? 'deep' : 'across') + (align !== 'main' ? '|street' : '') + '|' + pondAt + (o.win ? '|phase' : '') + (F.wave ? '|wave' : ''), wave: !!F.wave, win: o.win, score: score(a, prog, foot) * (club ? 1 : 0.94) + (COMMERCIAL.includes(prog.use) ? frontScore(plan, fx.els) : 0) - fx.bad.length * 500 - fx.cut * 40 + (o.win && a.st.footprint >= foot * 0.97 ? (1 - o.win) * 120 : 0), deep, pondAt }); // compact only counts when the whole program fits
      }
    }
    }
    }
  } };
  const same0 = (f, p) => look(f.els) === look(p.els) || Math.abs(f.a.st.gfa - p.a.st.gfa) < 0.01 * p.a.st.gfa && f.key === p.key; // two tries that come out the same plan
  const parked = f => f.parked ??= (m => m.spaces >= m.required)(S.metrics({ ...plan, program: prog, elements: f.els }));
  const enough = () => { const u = found.filter(f => !f.bad.length && f.els.some(e => e.kind === 'building') && parked(f)).sort((a, b) => b.score - a.score), top = u[0]?.score ?? 0; // three good ones, not just three
    const num = f => Math.round(f.a.st.gfa / 500) + '|' + f.a.pre.surf; // (told apart by the stalls their aisles held before the trim, as before trimming)
    return u.filter((f, i) => f.score >= top - Math.abs(top) * 0.25 && !u.slice(0, i).some(p => num(p) === num(f))).length; };
  pass(opts.depth || 3, foot ? ['bottom'] : ['bottom', 'mid'], [null]);
  const lead = found.filter(f => !f.bad.length).sort((a, b) => b.score - a.score)[0]; // the wider look starts with the way that did best
  const budget = opts.budgetMs ?? 3000; // (about 60 tries in 3 s on a desktop on a busy site; most sites' wider look runs to the end inside it)
  if (enough() < 3) pass(6, ['bottom', 'mid', 'top'], [0.25, 0.75], { n: Math.round(budget / 3000 * 60), used: 0, end: t0 + budget, stop: t0 + budget * 4 }, lead?.deep ? [true, false] : [false, true]); // a wider look: more stacks, other entry spots
  if (prog.use === 'retail' && !pinned.length && !opts.noCorner && plan.streets?.length) found.push(...cornerRetail(plan, prog, { foot, pond }, { frameOf, spans, profile, sequences, estimate, attempt, tally, take: takeCorner })); // a corner lot: an L round the parking, a pad at the corner (lib/sitecorner.mjs)
  const usable = found.filter(f => !f.bad.length && f.els.some(e => e.kind === 'building')).sort((a, b) => b.score - a.score), pick = [];
  usable.forEach(parked);
  usable.sort((a, b) => !a.parked - !b.parked || b.score - a.score); // enough parking first
  const top = usable[0]?.score ?? 0, good = f => f.score >= top - Math.abs(top) * 0.25, same = same0;
  const N = opts.count || 3;
  for (const f of usable) if (pick.length < Math.min(3, N) && good(f) && f.parked && !pick.some(p => p.key === f.key || same(f, p))) pick.push(f); // different arrangements first, parked
  for (const f of usable) if (pick.length < Math.min(3, N) && good(f) && f.parked && !pick.includes(f) && !pick.some(p => same(f, p))) pick.push(f);
  for (const f of usable) if (pick.length < Math.min(3, N) && f.parked && !pick.includes(f) && !pick.some(p => same(f, p))) pick.push(f);
  for (const f of usable) if (pick.length < N && good(f) && (pick.length < 3 || f.parked) && !pick.includes(f) && !pick.some(p => same(f, p))) pick.push(f); // then other good versions
  for (const f of usable) if (pick.length < N && (pick.length < 3 || f.parked) && !pick.includes(f) && !pick.some(p => same(f, p))) pick.push(f);
  const out = pick.map(f => optionOf(plan, f, prog, foot, pond));
  return out.length >= 3 || pinned.length ? out : out.concat(fallback(plan, prog, 3 - out.length));
}
// ---------- food truck parks ----------
// the arrangements lib/sitefoodtruck.mjs composes in each frame, finished like any other: detention and lawns on the land
// left, plan feet, names, the checks (pieces that fail and anything cut off go), then the best that differ
function foodTruckCore(plan, prog, opts = {}) {
  const pinned = opts.pinned || [], keepIds = new Set(pinned.map(e => e.id)), site = S.ringArea(plan.ring), found = [];
  const pondHave = pinned.filter(e => e.kind === 'pond').reduce((s, e) => s + S.elArea(e), 0), pond = Math.max(0, stormNeed(stormAcres(site, prog, null), plan.params || {}, prog, site / 43560).area - pondHave);
  const have = { trucks: pinned.filter(e => e.kind === 'foodtruck').length, trash: pinned.some(e => e.kind === 'trash'), play: pinned.some(e => e.kind === 'play') }, pt = tally(pinned, prog);
  for (const e of pinned) if (e.kind === 'building' && e.use === 'foodtrucks') have[S.ftKind(e)] = true;
  const T = { spans, covers, box, rectL, outL, makeEntry, entryPoly, profile, ROW, AISLE, SW, stallKeys, curveR: PAR.style.corners === 'square' ? 12 : 30, roundIslands: PAR.style.islands !== 'square' };
  const da = Math.abs(((frontAngle(plan) - S.mainAngle(plan.ring)) % 90 + 135) % 90 - 45), aligns = da > 4 ? ['main', 'front'] : ['main'];
  for (const align of aligns) {
    const F = frameOf(plan, false, align), toL = p => rot(p, -F.psi), keep = (KO || []).map(e => S.grow(S.shapeOf(e), 4).map(toL)).concat(pinned.filter(e => e.kind !== 'lot' && e.kind !== 'green').map(e => obstacleOf(e).map(toL)));
    for (const v of FTP.variants(F, prog, pond, T)) {
      const c = FTP.compose(F, prog, { ...v, keep, have, xNeed: pt.need, xHave: pt.stalls + pt.garages }, T); if (!c) continue;
      const st = { footprint: 0 }, land = finishLand(F, c.els.concat(c.solid, keep.map(poly => ({ kind: 'building', use: 'amenity', poly }))), { pond, reserve: c.reserve, amenity: false, padUse: false, frontY: profile(F).b[0], lakeName: '' }, st);
      const els = toPlanEls(F, c.els.concat(land)), entry = els.find(e => e.name === 'Main entry'); for (const e of els) if (e.name === 'Service entry') e.entry = true; // (a way in of its own: the side street)
      nameAll(els, entry ? [entry.x, entry.y] : S.centroid(plan.ring), prog, new Set(pinned.map(e => e.name).filter(Boolean)));
      const fx = repair(plan, els.concat(pinned.map(e => ({ ...e }))), keepIds), lost = c.els.length + land.length + pinned.length - fx.els.length;
      const got = fx.els.filter(e => e.kind === 'foodtruck').length, askN = prog.foodtrucks.trucks; let sc = FTP.score({ ...c, stats: { ...c.stats, trucks: got } }, prog) - fx.bad.length * 500 - lost * 40;
      if (askN && got < askN) c.notes.unshift('Room for ' + got + ' of the ' + askN + ' food trucks asked for.');
      if (pond > 0) sc -= Math.max(0, pond * 0.95 - st.pond) / pond * Math.abs(sc) * 0.6; // detention: a pond where it fits, else underground (it costs)
      found.push({ els: fx.els, bad: fx.bad.filter(i => !keepIds.has(i.id)), score: sc, notes: c.notes, name: FTP.nameOf(c), pondAt: v.pondAt === 'side' ? 'end' : v.pondAt, deep: false, win: null, a: { F, st: { pondNeed: pond, pond: st.pond } },
        recipe: { ft: true, deep: false, ...(align !== 'main' ? { align } : {}), o: { style: v.style, nP: v.nP, pondAt: v.pondAt, side: v.side } }, key: v.style + '|' + v.pondAt + (v.side ? v.side : '') + '|' + align, parked: c.stats.have >= c.stats.need });
    }
  }
  const usable = found.filter(f => !f.bad.length && f.els.some(e => e.kind === 'foodtruck' || e.kind === 'building')).sort((a, b) => b.parked - a.parked || b.score - a.score), pick = [], N = opts.count || 3;
  const same = (f, p) => look(f.els) === look(p.els);
  for (const f of usable) if (pick.length < N && !pick.some(p => p.key === f.key || p.name === f.name && p.pondAt === f.pondAt || same(f, p))) pick.push(f); // different arrangements first
  for (const f of usable) if (pick.length < N && !pick.includes(f) && !pick.some(p => same(f, p))) pick.push(f);
  const out = pick.map(f => optionOf(plan, f, prog, null, pond));
  return out; // (nothing fits: no stand-in boxes; the app says so)
}
// a candidate from lib/sitecorner.mjs finished the way pass() finishes its own: to the plan, named, checked, scored
function takeCorner(plan, a, prog, foot, key, recipe, label) {
  const els = toPlanEls(a.F, a.els), entry = els.find(e => e.name === 'Main entry'); nameAll(els, entry ? [entry.x, entry.y] : S.centroid(plan.ring), prog);
  const fx = repair(plan, els); a.st = { ...tally(a.els, prog), pond: a.st.pond, pondNeed: a.st.pondNeed };
  return { a, els: fx.els, bad: fx.bad, cut: fx.cut, recipe, key, label, wave: false, win: null, deep: false, pondAt: a.o.pondAt, score: score(a, prog, foot) + frontScore(plan, fx.els) - fx.bad.length * 500 - fx.cut * 40 };
}
const sizesOf = els => ({ units: els.filter(e => e.kind === 'building').reduce((s, e) => s + (e.units || 0), 0), gfa: els.filter(e => e.kind === 'building').reduce((s, e) => s + S.gfaOf(e), 0) });
// trash enclosures for a finished option, by the rules in S.trashNeeds; says so when some don't find a spot
function withTrash(plan, prog, els, notes) {
  const t = S.placeTrash({ ...plan, program: prog, elements: els }), have = t.elements.filter(e => e.kind === 'trash').length;
  if (have < t.wanted) notes.push('Room for ' + have + ' of the ' + t.wanted + ' trash enclosures the rules call for; add the rest by hand.');
  return t.elements;
}
// more than one pond when one holds enough (a band pond and a leftover-land pond): keep the fewest that hold it
function trimPonds(els, need) {
  const P = els.filter(e => e.kind === 'pond' && !e.pinned).sort((a, b) => S.elArea(b) - S.elArea(a)); if (P.length < 2 || !(need > 0)) return els;
  let have = 0; const keep = new Set(); for (const p of P) { if (have >= need * 0.9) break; keep.add(p); have += S.elArea(p); }
  return els.map(e => e.kind === 'pond' && P.includes(e) && !keep.has(e) ? { kind: 'green', poly: S.outline(e), name: '', note: '', trees: true, id: e.id } : e);
}
function optionOf(plan, f, prog, foot, pond) {
  const notes = []; f.els = withTrash(plan, prog, trimPonds(f.els, f.a.st.pondNeed), notes);
  const m = S.metrics({ ...plan, program: prog, elements: f.els });
  const have = m.spaces, T = prog.use === 'multifamily' ? prog.units : prog.use === 'townhomes' || prog.use === 'duplex' || prog.use === 'sfr' ? prog.units : null;
  if (T && m.units && m.units < T * 0.97) notes.push('Fits about ' + m.units + ' of the ' + T + ' units asked for.');
  if (!T && foot && m.gfa < foot * prog.floors * 0.97) notes.push('Fits about ' + Math.round(m.gfa).toLocaleString('en-US') + ' of the ' + Math.round(foot * prog.floors).toLocaleString('en-US') + ' sq ft asked for.');
  if (m.required > have) notes.push('Parking is ' + S.spacesWord(m.required - have) + ' short of ' + m.required + '.');
  if (prog.use === 'storage' && prog.storage.climateSf > 0 && m.storage) { const c = m.storage.climateGsf, w = prog.storage.climateSf; if (c < w * 0.97) notes.push('The climate-controlled building fits ' + f0(c) + ' of the ' + f0(w) + ' sq ft asked for.'); }
  if (prog.use === 'storage' && prog.storage.rv > 0 && m.storage && m.storage.rv < prog.storage.rv) notes.push('Room for ' + m.storage.rv + ' of the ' + prog.storage.rv + ' RV / boat spaces asked for.');
  const dev = Math.min(stormAcres(m.acres * 43560, prog, foot), m.acres * (f.win || 1)), sn = stormNeed(dev, plan.params || {}, prog, m.acres);
  if (sn.mode !== 'none' && dev < m.acres * 0.9) notes.push('Stormwater sized for the ' + dev.toFixed(1) + ' developed acres; later phases add their own.');
  if (sn.mode === 'underground') notes.push('Stormwater: about ' + sn.volume.toFixed(1) + ' acre-feet of underground detention under the parking.');
  else if (sn.area > 0 && m.pond < sn.area * 0.9) notes.push((sn.mode === 'retention' ? 'Retention' : 'Detention') + ' holds about ' + Math.round(m.pond / sn.area * 100) + '% of the ' + sn.volume.toFixed(1) + ' acre-feet needed; plan on underground storage for the rest.');
  const fut = f.els.filter(e => e.name === 'Future development').reduce((s, e) => s + S.elArea(e), 0); if (fut > 0) notes.push((fut / 43560).toFixed(1) + ' acres are left for a future phase.');
  if (f.notes) notes.unshift(...f.notes); // (an arrangement's own: a food truck park's)
  const name = (f.name || (f.label || (f.deep ? OPTION_NAMES.deep : OPTION_NAMES.across))) + (f.win ? ' · compact, room to expand' : '') + (f.pondAt === 'front' ? ' · pond at the entry' : f.pondAt === 'back' ? ' · pond at the back' : f.pondAt === 'end' ? ' · pond at the end' : '');
  return { name, elements: f.els, notes, zones: [{ name: S.USES[prog.use].label, use: prog.use, ring: plan.ring, acres: S.ringArea(plan.ring) / 43560 }], program: prog, phi: f.a.F.phi, score: f.score, recipe: f.recipe, sizes: sizesOf(f.els) };
}

// ---------- mixed use: zones from the street back on one connected network ----------
// a parking garage for `stalls` spaces: two bays deep (124 ft), 2 levels and up (no more than `levels`) so it runs no
// longer than 300 ft (or most of the row), and never shorter than 100 ft. { len, levels, stalls } (stalls: what it holds)
const GARAGE_D = 124;
function garageSize(stalls, levels = 4, W = 1e4) {
  const Lmax = Math.max(100, Math.min(W * 0.7, 300)), lv = Math.max(2, Math.min(levels, Math.ceil(stalls * 330 / GARAGE_D / Lmax)));
  const len = Math.max(100, Math.min(Lmax, stalls * 330 / lv / GARAGE_D)); return { len, levels: lv, stalls: Math.floor(len * GARAGE_D * lv / 330) };
}
const ZONE_NAME = { garage: 'Parking garage', retail: 'Retail', restaurant: 'Restaurants', office: 'Office', medical: 'Medical', industrial: 'Industrial', storage: 'Self storage', fuel: 'Gas station', multifamily: 'Apartments', townhomes: 'Townhomes', duplex: 'Duplexes', sfr: 'Single-family', amenity: 'Commons', other: 'Commercial' };
// one zone's blocks and aisles: [block, aisle, block, aisle, …] (the next zone, or a closing block, follows the last aisle)
// grow (a number of extra parking bays, 0 or more; false = as asked): the building row as full as the zone's parking
// carries (with that many more bays), never less than asked
function zoneItems(z, zi, first, W, site, prog, scale = 1, grow = false, surf = 1, garage = null, lake = 0) {
  const items = [], U = S.USES[z.use], P = S.normalizeProgram({ use: z.use, floors: z.floors }), fl = P.floors, aisle = (kind = 'aisle', w = AISLE) => ({ t: 'a', w, kind });
  const rowStalls = W * 0.8 / 9;
  if (z.use === 'garage') { // the structure: two parking bays deep, as long as its share of the parking takes (garage = { stalls, levels, len })
    const D = GARAGE_D, len = garage?.len || garageSize(garage?.stalls || 300, garage?.levels || z.floors || 4, W).len;
    items.push({ fill: 'garage', D, len, levels: garage?.levels || z.floors || 4, walkUp: 8, walkDown: 8, h: D + 16, zone: zi }, aisle()); return { items };
  }
  if (COMMERCIAL.includes(z.use)) {
    const homesToo = (prog.zones || []).some(q => ['sfr', 'townhomes', 'duplex', 'multifamily'].includes(q.use)), D = z.use === 'restaurant' ? 70 : U.depth, ask = z.gfa || Math.min(W * 0.8 * D * fl, homesToo ? Math.max(20000, Math.min(120000, site / 43560 * 700)) : Infinity), /* shops with no size beside homes: a neighbourhood centre, not the whole frontage */ kAsk = Math.max(1, Math.ceil(ask / 1000 * P.ratio * surf / (2 * rowStalls))), kk = kAsk + (grow || 0), gfa = grow !== false ? Math.max(ask, Math.min(W * 0.78 * D * fl, 2 * kk * rowStalls * 0.9 / P.ratio / surf * 1000)) : ask * scale, need = gfa / 1000 * P.ratio * surf, k = Math.max(1, Math.ceil(need / (2 * rowStalls))); /* surf: the share of its parking on the surface (the rest in the garage) */
    items.push(first && z.pads ? { fill: 'pads', D: 50, rowsUp: true, h: ROW + WALK + 50 + 30, zone: zi } : { fill: first ? 'none' : 'park', rowsUp: true, rowsDown: !first, h: first ? ROW : 2 * ROW + 4, zone: zi });
    for (let j = 0; j < k; j++) items.push(aisle(), j < k - 1 ? { fill: 'park', rowsDown: true, rowsUp: true, h: 2 * ROW + 4, zone: zi } : { fill: 'bldg', use: z.use, D, floors: fl, rowsDown: true, walkDown: 15, walkUp: 0, h: ROW + 15 + D, zone: zi });
    items.push(aisle('service'));
    return { items, foot: gfa / fl, need };
  }
  if (z.use === 'industrial') { // a warehouse: car parking toward the drive, the building, its truck court behind (never homes)
    const ask = z.gfa || W * 0.8 * 300, gfa = grow !== false ? Math.max(ask, W * 0.75 * [0, 300, 400][Math.min(2, grow)]) : ask * scale, D = Math.max(140, Math.min(520, Math.round(gfa / (W * 0.75) / 20) * 20));
    items.push({ fill: first ? 'none' : 'park', rowsUp: true, rowsDown: !first, h: first ? ROW : 2 * ROW + 4, zone: zi }, aisle(), { fill: 'bldg', use: 'industrial', D, floors: 1, rowsDown: true, walkDown: WALK, walkUp: 0, h: ROW + WALK + D, zone: zi }, aisle('truck', 130));
    return { items, foot: gfa };
  }
  if (z.use === 'amenity') { const area = (z.acres ? z.acres * 43560 : Math.min(site * 0.14, Math.max(2, Math.min(5, site / 43560 * 0.04)) * 43560)) * scale; /* a commons of 2 to 5 acres, not a share of a big tract */ items.push({ fill: 'commons', h: Math.max(170, area / W), items: z.items, zone: zi }, aisle()); return { items }; }
  if (z.use === 'multifamily') {
    const per = W * 0.72 * 60 * fl * 0.85 / P.unitSf, units = (z.units || Math.min(per * 3, (prog.zones || []).some(q => q.use === 'sfr') ? 300 : Infinity)) * scale, nb = Math.max(1, Math.round(units / per)), parkB = Math.max(0, Math.ceil((units * P.perUnit - nb * 2 * rowStalls * 0.9) / (2 * rowStalls)));
    for (let j = 0; j < nb + parkB; j++) items.push(j % 3 === 2 && j - Math.floor(j / 3) <= parkB && parkB ? { fill: 'park', rowsDown: true, rowsUp: true, h: 2 * ROW + 4, zone: zi } : { fill: 'bldg', use: 'multifamily', D: +PAR.bldgDepth || 60, floors: fl, rowsDown: true, rowsUp: true, h: 2 * ROW + 2 * WALK + (+PAR.bldgDepth || 60), zone: zi }, aisle());
    return { items, foot: units * P.unitSf / 0.85 / fl, units };
  }
  if (z.use === 'sfr') { const P2 = S.normalizeProgram({ use: 'sfr', homeMix: z.homeMix || prog.homeMix, lotD: z.lotD || prog.lotD }), lot = 11 + P2.lotD, per = 2 * Math.floor(W * 0.9 / 52), units = (z.units || per * 2) * scale, nb = Math.max(1, Math.ceil(units / per));
    for (let j = 0; j < nb; j++) items.push({ fill: 'sfr', h: 2 * lot, zone: zi, prog: P2 }, aisle('street', 28));
    return { items, units }; }
  const th = z.use === 'townhomes', per = 2 * Math.floor(W * 0.8 / (th ? 24 : 43)), units = (z.units || per * 2) * scale, nb = Math.max(1, Math.ceil(units / per));
  for (let j = 0; j < nb; j++) items.push({ fill: th ? 'homes' : 'duplex', h: th ? 126 : 170, zone: zi }, aisle(th ? 'lane' : 'street', th ? 24 : 26));
  return { items, units };
}
// two commercial zones (each its parking aisles and a building row) as one: their buildings side by side in one row, each
// its share of the row by the length it needs (the first toward the second), with as many parking aisles as both need
function comMerge(a, b, fp, frac = 0.5) {
  const W = a.W, need = a.com.need + b.com.need, bl0 = [...a.com.bldgs, ...b.com.bldgs], k = Math.max(1, Math.ceil(need / (2 * a.rowStalls)));
  const bl = frac < 0.5 ? bl0.slice().reverse() : frac > 0.5 ? bl0.slice(-1).concat(bl0.slice(0, -1)) : bl0; // each try its own order along the row
  const len = bl.map(q => (fp[q.zone] || 5000) / q.D + 40), tot = len.reduce((s, v) => s + v, 0);
  const parts = bl.map((q, i) => ({ ...q, frac: len[i] / tot, at: bl.length > 1 && i === 0 ? 'right' : i === bl.length - 1 ? 'left' : undefined }));
  const split = { fill: 'split', parts, h: Math.max(...bl.map(q => q.h)), rowsDown: true, rowsUp: false, zone: bl[0].zone }, items = [a.com.lead];
  for (let j = 0; j < k; j++) items.push({ t: 'a', w: AISLE, kind: 'aisle' }, j < k - 1 ? { fill: 'park', rowsDown: true, rowsUp: true, h: 2 * ROW + 4, zone: a.zi } : split);
  items.push({ t: 'a', w: AISLE, kind: 'service' });
  return { z: a.z, zi: a.zi, items, merged: true, W, rowStalls: a.rowStalls, com: { need, lead: a.com.lead, bldgs: bl } };
}
export function mixedOptions(plan, prog, opts = {}) {
  useParams(plan);
  const zones = prog.zones, site = S.ringArea(plan.ring), found = [];
  const club = zones.some(z => z.use === 'multifamily' && (z.units || 100) >= 80); // the apartments get their clubhouse and pool at the entry
  const hasCommons = zones.some(z => z.use === 'amenity'), pond = stormNeed(site / 43560, plan.params || {}, prog).area;
  const F = frameOf(plan, false), P = profile(F);
  // a small program on a big tract: build it on the part of the frontage it needs, keep the rest for a future phase
  const landNeed = zones.reduce((s, z) => s + (z.use === 'garage' ? 0 : COMMERCIAL.includes(z.use) ? (z.gfa || 30000) / 0.22 : z.use === 'multifamily' ? (z.units || 200) / 20 * 43560 : z.use === 'townhomes' ? (z.units || 60) / 11 * 43560 : z.use === 'duplex' ? (z.units || 40) / 7 * 43560 : z.use === 'sfr' ? (z.units || 40) / 4.5 * 43560 : z.acres ? z.acres * 43560 : site * 0.12), 0) * 1.15 + pond;
  // homes with no count ("a residential neighbourhood") take whatever land the sized zones leave: the whole frontage, rows to the back
  const HOME_Z = ['sfr', 'townhomes', 'duplex', 'multifamily'], unsized = zones.map((z, i) => [z, i]).filter(([z]) => HOME_Z.includes(z.use) && !z.units && !z.gfa).sort((a, b) => HOME_Z.indexOf(a[0].use) - HOME_Z.indexOf(b[0].use))[0]?.[1] ?? -1;
  // homes with a count and land to spare (filling the site): the count is phase 1 and the homes go on to the back of the site
  const fillAt = PAR.fill === false ? -1 : unsized >= 0 ? unsized : zones.map((z, i) => [z, i]).filter(([z]) => ['sfr', 'townhomes', 'duplex'].includes(z.use) && z.units).sort((a, b) => HOME_Z.indexOf(a[0].use) - HOME_Z.indexOf(b[0].use))[0]?.[1] ?? -1;
  const span = F.X1 - F.X0, depth = P.b[1] - P.b[0], winW = fillAt < 0 && landNeed < site * 0.65 ? Math.max(500, landNeed / depth * 1.1) : Infinity;
  const W = Math.min(P.width, winW) * 0.9;
  const orders = [zones.map((z, i) => i)], ci = zones.findIndex(z => z.use === 'amenity');
  if (ci > 0 && ci < zones.length - 1) { const o = zones.map((z, i) => i).filter(i => i !== ci); o.push(ci); orders.push(o); } // the commons at the back instead
  // a parking garage carries about 60% of the shops' and offices' parking; the surface lots shrink by as much
  const gz = zones.find(z => z.use === 'garage'), needAll = zones.reduce((t, z) => t + (COMMERCIAL.includes(z.use) ? (z.gfa || 50000) / 1000 * S.normalizeProgram({ use: z.use }).ratio : 0), 0);
  if (gz && opts.autoGarage && needAll * 0.6 < 80) return []; // too little parking for a garage to pay (one asked for is still built)
  const garage = gz ? garageSize(Math.round(needAll * 0.6), gz.floors || 4, W) : null, surf = garage && needAll ? Math.max(0, 1 - garage.stalls / needAll) : 1; // the surface carries the rest
  const pondRes = hasCommons ? pond * 1.15 / Math.max(300, P.width * 0.9) : 0; // filling with homes: leave the depth the detention lake needs (it goes in the land left open)
  const growable = PAR.fill !== false && !zones.some(z => HOME_Z.includes(z.use)) && zones.some(z => COMMERCIAL.includes(z.use) || z.use === 'industrial'); // shops, offices, warehouses: as much leasable floor area as the land and parking hold
  const W8 = { retail: 22, restaurant: 30, office: 24, medical: 28, industrial: 8, other: 14, multifamily: 19 }, worth = els => els.reduce((t, e) => t + (e.kind === 'building' && e.use !== 'amenity' ? S.gfaOf(e) * (W8[e.use] || 12) : e.kind === 'garage' ? -S.garageStalls(e) * 1600 : 0), 0), /* a garage space costs about $1,600 a year more than a surface one */ asked = zones.reduce((t, z) => t + (z.gfa || 0) * (W8[z.use] || 12), 0) || 1; // rent a year, roughly: what the floor area earns
  for (const grow of growable ? [true, false] : [false]) for (const order of orders) for (const pondAt of hasCommons ? ['none'] : grow && COMMERCIAL.includes(zones[order[0]].use) ? ['back'] : ['back', 'front']) for (const frac of [0.5, 0.32, 0.68]) { /* (growing shops: a pond on their frontage never pays) */ let fits = 0; const scales = grow ? [2, 1, 0].map(x => [1, 0, x]) : [1, 0.85, 0.7, 0.55, 0.4].map(v => [v, 0, false]); /* growing: two more parking bays a zone, one, none (rows filled with what the parking carries) */ for (let si = 0; si < scales.length; si++) { const [scale, bonus, extra] = scales[si];
    if (fits >= 2) break;
    const zs = order.map(i => zones[i]); let items = [], fp = {}, un = {}, cz = {}, fillPh = 0;
    let zl = zs.map((z, k) => { const r = zoneItems(z, order[k], k === 0, W, site, prog, scale, grow ? extra : false, surf, garage, hasCommons ? pond : 0); const fl = S.normalizeProgram({ use: z.use, floors: z.floors }).floors; if (z.buildings && !['townhomes', 'duplex', 'sfr', 'amenity'].includes(z.use)) cz[order[k]] = z.buildings; if (COMMERCIAL.includes(z.use) || z.use === 'industrial') fp[order[k]] = z.gfa && !grow ? z.gfa / fl : r.foot; /* unsized shops: the neighbourhood size zoneItems chose */ if (z.use === 'multifamily' && z.units) fp[order[k]] = z.units * 900 / 0.85 / fl; if (z.units && (z.use === 'townhomes' || z.use === 'duplex' || z.use === 'sfr') && order[k] !== fillAt) un[order[k]] = z.units; /* the program itself, whatever the rows were scaled to */ return { z, zi: order[k], items: r.items, W, rowStalls: W * 0.8 / 9, com: COMMERCIAL.includes(z.use) ? { need: r.need, lead: r.items[0], bldgs: [r.items.find(it => it.fill === 'bldg')] } : null }; });
    zl.forEach((x, k) => { const g = x.items[0]; if (x.z.use === 'garage' && k > 0 && COMMERCIAL.includes(zl[k - 1].z.use)) Object.assign(g, { with: zl[k - 1].zi, withUse: zl[k - 1].z.use, withFloors: S.normalizeProgram({ use: zl[k - 1].z.use, floors: zl[k - 1].z.floors }).floors }); }); // the garage's row also holds the zone it serves
    if (fillAt >= 0) { // the unsized homes: as many more rows as the depth left holds
      const k = order.indexOf(fillAt), x = zl[k], hOf = its => its.reduce((t, it) => t + (it.t ? it.w : it.h), 0), pair = x.items.slice(0, 2), ph = hOf(pair);
      let room = (P.b[1] - P.b[0]) - zl.reduce((t, y) => t + hOf(y.items), 0) + 60 * scale - 60 - pondRes; while (ph > 0 && room >= ph * 0.75) { /* rows usually come out a little shorter than planned; a smaller scale tries one fewer */ x.items.push(...pair.map(o => ({ ...o }))); room -= ph; } for (let j = 0; j < bonus; j++) x.items.push(...pair.map(o => ({ ...o }))); /* and the rows a try found room for */ fillPh = ph;
      if (zones[fillAt].use !== 'multifamily') x.fill = true;
    }
    // too deep for the lot: zones of one row each share a row, side by side (never the street zone)
    const tall = () => zl.reduce((s, x) => s + x.items.reduce((t, it) => t + (it.t ? it.w : it.h), 0), 0) + 70 > P.b[1] - P.b[0] + 20;
    while (tall()) {
      let best = null;
      for (let k = 1; k + 1 < zl.length; k++) { const a = zl[k].items.filter(x => !x.t), b = zl[k + 1].items.filter(x => !x.t); if (a.length !== 1 || b.length !== 1 || a[0].parts || b[0].parts) continue; const save = Math.min(a[0].h, b[0].h); if (!best || save > best.save) best = { k, save, a: a[0], b: b[0] }; }
      if (!best) { // shops, restaurants and offices one behind another don't fit: side by side in one building row on one parking field
        const c = zl.findIndex((x, k) => x.com && zl[k + 1]?.com);
        if (c >= 0) { zl.splice(c, 2, comMerge(zl[c], zl[c + 1], fp, frac)); continue; }
        // still too deep: one parking aisle fewer in the zone with the most (the building gives way to the parking)
        const x = zl.filter(y => y.com && y.items.filter(it => it.fill === 'park').length).sort((p2, q2) => q2.items.filter(it => it.fill === 'park').length - p2.items.filter(it => it.fill === 'park').length)[0]; if (!x) break;
        const j = x.items.findIndex(it => it.fill === 'park' && it.rowsDown); if (j < 1) break; x.items.splice(j - 1, 2); continue;
      }
      const need = q => { const z = zones[q.zone]; return z.use === 'garage' ? 1 : z.use === 'multifamily' ? (z.units || 150) / 20 : z.use === 'townhomes' ? (z.units || 60) / 11 : z.use === 'sfr' ? (z.units || 40) / 4.5 : z.use === 'duplex' ? (z.units || 40) / 7 : z.acres || site * 0.12 / 43560; };
      const fa = Math.max(0.3, Math.min(0.7, need(best.a) / (need(best.a) + need(best.b)))), home = q => q.fill === 'homes' || q.fill === 'duplex' || q.fill === 'sfr';
      const blk = { fill: 'split', parts: [{ ...best.a, frac: fa }, { ...best.b, frac: 1 - fa }], h: Math.max(best.a.h, best.b.h), rowsDown: !!(best.a.rowsDown || best.b.rowsDown), rowsUp: !!(best.a.rowsUp || best.b.rowsUp), zone: best.a.zone };
      const ai = home(best.a) && home(best.b) ? { t: 'a', w: 26, kind: 'street' } : { t: 'a', w: AISLE, kind: 'aisle' };
      zl.splice(best.k, 2, { z: zl[best.k].z, zi: zl[best.k].zi, items: [blk, ai], merged: true });
    }
    const backCommons = !zl[zl.length - 1].merged && zs[zs.length - 1].use === 'amenity'; if (backCommons) zl[zl.length - 1].items.pop(); // the commons is the back of the site: no drive behind it
    zl.forEach(x => items.push(...x.items));
    const last = zl[zl.length - 1].merged ? { use: 'none' } : zs[zs.length - 1], zi = order[order.length - 1];
    if (!backCommons) items.push(last.use === 'multifamily' ? { fill: 'bldg', use: 'multifamily', D: +PAR.bldgDepth || 60, floors: S.normalizeProgram({ use: 'multifamily', floors: last.floors }).floors, rowsDown: true, h: ROW + WALK + (+PAR.bldgDepth || 60), zone: zi } : last.use === 'townhomes' ? { fill: 'homes', h: 45, zone: zi } : last.use === 'duplex' ? { fill: 'duplex', h: 65, zone: zi } : last.use === 'sfr' ? { fill: 'sfr', h: 11 + S.normalizeProgram({ use: 'sfr', lotD: last.lotD || prog.lotD }).lotD, zone: zi, prog: S.normalizeProgram({ use: 'sfr', homeMix: last.homeMix || prog.homeMix, lotD: last.lotD || prog.lotD }) } : { fill: 'none', h: 0, zone: zi });
    const blocks = items.filter(x => !x.t), aisles = items.filter(x => x.t).map(a => ({ w: a.w, kind: a.kind }));
    for (let i = 0; i < aisles.length; i++) { const lo = blocks[i], hi = blocks[i + 1]; if (aisles[i].kind === 'aisle' && ['homes', 'duplex', 'sfr'].includes(lo.fill) && ['homes', 'duplex', 'sfr'].includes(hi.fill)) Object.assign(aisles[i], lo.fill === 'homes' ? { kind: 'lane', w: 24 } : { kind: 'street', w: 26 }); }
    const seq = { blocks, aisles, pads: zones[order[0]].pads && COMMERCIAL.includes(zones[order[0]].use) };
    const win = winW < span * 0.85 ? (frac === 0.5 ? [F.X0 + (span - winW) / 2, F.X0 + (span + winW) / 2] : frac < 0.5 ? [F.X0, F.X0 + winW] : [F.X1 - winW, F.X1]) : null;
    const keep = win ? [box(-1e5, -1e5, win[0], 1e5), box(win[1], -1e5, 1e5, 1e5)] : [];
    const spineX = win ? (win[0] + win[1]) / 2 : F.X0 + span * frac, mixedProg = { ...prog, use: zones.some(z => z.use === 'multifamily') ? 'multifamily' : prog.use, pads: zones[order[0]].pads || 0 };
    let mo = { pond, keep, pondAt: win ? 'none' : pondAt, shift: 'bottom', entry: { w: 40, boulevard: true, at: spineX }, spineX, mixed: true, lake: hasCommons ? 'Amenity lake' : '', future: true, openSpace: fillAt >= 0,
      spec: { spineX, spineW: 32, footByZone: fp, unitsByZone: un, countByZone: Object.keys(cz).length ? cz : null, amenity: club, commons: { clubhouse: club, homes: zones.some(z => ['sfr', 'townhomes', 'duplex'].includes(z.use)) } } }; let a = attempt(plan, F, seq, mixedProg, mo);
    if (!a) continue;
    if (fillAt >= 0 && fillPh && bonus < 4) { // the back strip left over: room for more streets of homes? then try again with them
      const top = Math.max(...a.els.filter(e => (e.kind === 'lot' || e.kind === 'building') && e.use !== 'amenity' && e.name !== 'Community center' && e.kind !== 'pool').map(e => S.outline(e)).flat().map(p => p[1])), back = zones[order[order.length - 1]].use === 'amenity' ? 175 : 0, gap = P.b[1] - top - back - pondRes;
      if (gap >= fillPh * 0.85) { scales.splice(si + 1, 0, [scale, bonus + Math.floor(gap / fillPh + 0.15), extra]); continue; }
    }
    const full = new Set(), was = {}; // zones whose rows are full: they took nothing more when given more
    if (grow) for (let it = 0; it < 6; it++) { // parking to spare: longer buildings until the stalls are used, each zone by its own parking ratio
      const st = tally(a.els, mixedProg), s0 = a.pre, spare = s0.surf - S.adaLoss(s0.surf) + Math.min(s0.deck, garage ? Math.round(needAll * 0.6) : 0) - st.need * 1.03, CZ = Object.keys(mo.spec.footByZone || {}).filter(k => (COMMERCIAL.includes(zones[k]?.use) || zones[k]?.use === 'industrial') && !full.has(k)); if (spare < 25 || !CZ.length) break;
      const tot = CZ.reduce((t, k) => t + mo.spec.footByZone[k], 0) || 1, fp2 = { ...mo.spec.footByZone };
      for (const k of CZ) { const P2 = S.normalizeProgram({ use: zones[k].use, floors: zones[k].floors }); fp2[k] += spare * (fp2[k] / tot) * 1000 / P2.ratio / P2.floors; }
      const mo2 = { ...mo, spec: { ...mo.spec, footByZone: fp2 } }, a2 = attempt(plan, F, seq, mixedProg, mo2); if (!a2) break;
      const st2 = tally(a2.els, mixedProg), placed = {}; for (const e of a2.els) if (e.kind === 'building' && e.zone != null) placed[e.zone] = (placed[e.zone] || 0) + S.footArea(e);
      for (const k of CZ) { if ((placed[k] || 0) <= (was[k] ?? 0) + 300) full.add(k); was[k] = placed[k] || 0; }
      if (st2.stalls < st2.need) { full.add(...CZ.filter(k => !full.has(k)).slice(0, 1)); continue; } // overshot: try again without the biggest taker
      if (st2.gfa <= st.gfa + 500) continue; a = a2; mo = mo2;
    }
    fits++;
    const els = toPlanEls(F, a.els), entry = els.find(e => e.name === 'Main entry');
    nameAll(els, entry ? [entry.x, entry.y] : S.centroid(plan.ring), { ...prog, unitSf: 900 });
    const fx = repair(plan, els), m = S.metrics({ ...plan, program: prog, elements: fx.els });
    // how much of each zone's program made it
    let got = 0, n = 0; for (const z of zones) { const B = fx.els.filter(e => e.kind === 'building' && e.use === z.use); if (z.use === 'amenity' || z.use === 'garage') continue; n++;
      const v = z.use === 'multifamily' || z.use === 'townhomes' || z.use === 'duplex' || z.use === 'sfr' ? B.reduce((s, e) => s + (e.units || 0), 0) : B.reduce((s, e) => s + S.gfaOf(e), 0), t = z.units || z.gfa;
      got += t ? Math.min(1, v / t) - (growable || zones.indexOf(z) === fillAt ? 0 : Math.max(0, v / t - 1.1) * 0.5) : Math.min(1, v / 1e5); }
    const short = Math.max(0, m.required - m.spaces);
    if (!grow && got >= n * 0.97 && !short && !fx.bad.length) fits = Math.max(fits, 2); // the whole program fits, parked: a smaller scale can only do worse
    const sc = (got / Math.max(1, n)) * 1000 * (growable ? 1 : scale ** 0.2) - short / Math.max(1, m.required) * 1500 - fx.bad.length * 500 - fx.cut * 40 + (hasCommons && fx.els.some(e => e.name === 'Amenity lake') ? 30 : 0)
      + (growable ? Math.min(3, worth(fx.els) / asked) * 250 : 0) - (pondAt === 'front' && COMMERCIAL.includes(zones[order[0]].use) ? 150 : 0) + frontScore(plan, fx.els); // more leasable floor area is worth more; a pond on the shop frontage costs the best land
    // zones as drawn: from the aisle before a zone's first block to the aisle after its last
    const zb = new Map(); // each zone's extent: rows from the aisle below to the aisle above, and its side for a shared row
    const AY = a.spec.aisles; a.spec.blocks.forEach((b, i) => { const y0 = i ? AY[i - 1].y : F.Y0 - 5, y1 = i < AY.length ? AY[i].y : F.Y1 + 5; for (const q of b.parts || [{ ...b, x0: -1e6, x1: 1e6 }]) { const e = zb.get(q.zone) || { y0, y1, x0: q.x0, x1: q.x1 }; e.y0 = Math.min(e.y0, y0); e.y1 = Math.max(e.y1, y1); zb.set(q.zone, e); } });
    const ext = [...zb.entries()].sort((p, q) => p[1].y0 - q[1].y0); if (ext.length) { ext[0][1].y0 = F.Y0 - 5; ext[ext.length - 1][1].y1 = F.Y1 + 5; }
    const zoneOut = ext.map(([zi, e], k) => { const T = r => r.map(([x, y]) => [y, x]), r = T(clipY(T(clipY(F.rr, e.y0, e.y1)), Math.max(-1e6, e.x0), Math.min(1e6, e.x1))); return r.length >= 3 ? { name: (ext.length > 1 ? (e.y0 < F.Y0 ? 'Front' : e.y1 > F.Y1 ? 'Back' : 'Middle') + ' — ' : '') + (zones[zi].name || ZONE_NAME[zones[zi].use]), use: zones[zi].use, ring: r.map(p => toPlan(F, p).map(fit)), acres: S.ringArea(r) / 43560 } : null; }).filter(Boolean);
    found.push({ recipe: { deep: false, seq, o: mo, prog: mixedProg }, els: fx.els, bad: fx.bad, score: sc, key: order.join('') + '|' + frac + '|' + pondAt + (grow ? '|g' : ''), scale, zones: zoneOut, m, a, order, frac, win, pondAt });
  } }
  const ok = found.filter(f => !f.bad.length).sort((a, b) => b.score - a.score), pick = [];
  const N = opts.count || 3;
  for (const f of ok) if (pick.length < Math.min(3, N) && !pick.some(p => p.key === f.key || look(p.els) === look(f.els))) pick.push(f);
  for (const f of ok) if (pick.length < N && !pick.includes(f) && !pick.some(p => look(p.els) === look(f.els))) pick.push(f);
  const res = pick.map(f => {
    const notes = []; f.els = withTrash(plan, prog, f.els, notes); const m = S.metrics({ ...plan, program: prog, elements: f.els });
    for (const z of zones) { if (z.use === 'amenity' || z.use === 'garage') continue; const B = f.els.filter(e => e.kind === 'building' && e.use === z.use), t = z.units || z.gfa; if (!t) continue;
      const v = z.units ? B.reduce((s, e) => s + (e.units || 0), 0) : Math.round(B.reduce((s, e) => s + S.gfaOf(e), 0)); if (v < t * 0.97) notes.push(ZONE_NAME[z.use] + ': fits about ' + v.toLocaleString('en-US') + ' of ' + t.toLocaleString('en-US') + (z.units ? ' units.' : ' sq ft.')); else if (v > t * 1.05) notes.push(ZONE_NAME[z.use] + ': ' + t.toLocaleString('en-US') + (z.units ? ' homes' : ' sq ft') + ' asked for (phase 1); the land holds ' + v.toLocaleString('en-US') + ' in all, so the rest can be a later phase.'); }
    if (m.required > m.spaces) notes.push('Parking is ' + S.spacesWord(m.required - m.spaces) + ' short of ' + m.required + '.');
    if (pond > 0 && m.pond < pond * 0.9) notes.push('Ponds hold about ' + Math.round(m.pond / pond * 100) + '% of the detention the site needs (' + (pond / 43560).toFixed(1) + ' acres); plan on underground storage or a regional facility for the rest.');
    const name = (f.win ? (f.frac === 0.5 ? 'Centred on the frontage' : f.frac < 0.5 ? 'Left end of the frontage' : 'Right end of the frontage') : f.frac === 0.5 ? 'Central boulevard' : 'Side entry') + (f.order.join('') !== zones.map((z, i) => i).join('') ? ' · commons at the back' : '');
    return { name: name + (f.pondAt === 'front' ? ' · pond at the entry' : ''), elements: f.els, notes, zones: f.zones, program: prog, phi: F.phi, score: f.score, recipe: f.recipe, sizes: sizesOf(f.els) };
  });
  return res.length >= 3 || opts.autoGarage ? res : res.concat(fallback(plan, prog, 3 - res.length)); // (a garage only tried: no simple layouts to fill in)
}

// parking rows that chain off a connected one (end to end, as the simple layout draws them) are connected too: repair() only
// follows drives, so it cuts them; put back what touches a piece that stayed, unless it breaks a rule
function rejoin(plan, fx, all) {
  const gone = all.filter(e => (e.kind === 'parking' || e.kind === 'drive') && !fx.els.includes(e)), out = fx.els.slice(), near = (a, b) => S.rectsOverlap({ ...a, w: a.w + 3, d: a.d + 3 }, { ...b, w: b.w + 3, d: b.d + 3 }, 0);
  for (let moved = true; moved;) { moved = false; for (const e of gone.slice()) if (out.some(k => (k.kind === 'drive' || k.kind === 'parking') && near(k, e))) { out.push(e); gone.splice(gone.indexOf(e), 1); moved = true; } }
  const bad = new Set(S.check({ ...plan, elements: out }).filter(i => i.level === 'bad' && i.id).map(i => i.id)), els = out.filter(e => !bad.has(e.id) || fx.els.includes(e));
  return { ...fx, els, bad: S.check({ ...plan, elements: els }).filter(i => i.level === 'bad') };
}
// a main entrance placed or reshaped by hand (pinned) is the way in: the layout's own Main entry (and its median) goes,
// and when the hand-made one stops short of the drives, a drive joins its inner end to the nearest one (as wide as
// the entrance, rounded where it turns). Without this a re-fit drew a second Main entry beside it.
function adoptEntry(fresh, pinned) {
  const pm = pinned.find(e => e.kind === 'drive' && (e.name === 'Main entry' || e.entry)); if (!pm) return fresh;
  const gen = fresh.filter(e => e.kind === 'drive' && e.name === 'Main entry'), out = fresh.filter(e => !gen.includes(e) && !(e.median && gen.length));
  const net = out.filter(e => (e.kind === 'drive' || e.kind === 'truck') && !e.turn), po = S.outline(pm), gp = S.grow(po, 1.5);
  if (!net.length || net.some(d => S.rectsOverlap({ poly: gp }, { poly: S.outline(d) }, 0))) return out;
  const E = pm.path ? pm.path[pm.path.length - 1] : S.centroid(po); let best = null;
  for (const d of net) { const o = S.outline(d); for (let k = 0; k < o.length; k++) { const a = o[k], b = o[(k + 1) % o.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((E[0] - a[0]) * dx + (E[1] - a[1]) * dy) / L2)), q = [a[0] + dx * t, a[1] + dy * t], dd = Math.hypot(q[0] - E[0], q[1] - E[1]); if (!best || dd < best.d) best = { d: dd, q, c: S.centroid(o) }; } }
  if (!best || best.d > 400) return out;
  const u = [best.c[0] - best.q[0], best.c[1] - best.q[1]], ul = Math.hypot(u[0], u[1]) || 1, into = [best.q[0] + u[0] / ul * 10, best.q[1] + u[1] / ul * 10]; // into the drive it meets, so the two pour as one
  out.push({ kind: 'drive', path: [E, into].map(p => p.map(v => +v.toFixed(2))), width: pm.width || 26, r: 30, name: '', note: (pm.width || 26) + ' ft drive', ...(c => ({ x: +c[0].toFixed(2), y: +c[1].toFixed(2) }))([(E[0] + into[0]) / 2, (E[1] + into[1]) / 2]) });
  return out;
}
// the drives of a simple layout that meet a street edge are its ways in: the first is the Main entry, the rest Entrance 2, 3…
// (repair() drops whatever isn't connected to an entry, which used to take every stall with it)
function markEntries(plan, els) {
  const rules = S.edgeRules(plan.ring, plan.front, plan.setbacks, plan.streets), named = e => e.entry || e.name === 'Main entry' || /^Entrance\b/.test(e.name || '');
  let n = els.filter(e => e.kind === 'drive' && named(e)).length; // the engine names its own driveways (Main entry, Entrance 2…): number on from them
  for (const e of els) {
    if (e.kind !== 'drive' || named(e) || e.turn) continue;
    const c = S.shapeOf(e); if (!plan.ring.some((a, k) => (rules[k].role === 'front' || rules[k].street) && c.some((p, i) => S.segSeg(p, c[(i + 1) % c.length], a, plan.ring[(k + 1) % plan.ring.length]) <= 2.5))) continue;
    e.entry = true; e.name = ++n === 1 ? 'Main entry' : 'Entrance ' + n; e.note = (e.note || '') || '26 ft driveway';
  }
}
// the last resort when the planner can't find three good layouts: the earlier zone-band layouts, checked the same way
function fallback(plan, prog, n) {
  const out = [];
  for (let v = 0; v < 3 && out.length < n; v++) {
    let r; try { r = composeSite(plan, prog, v); } catch (e) { continue; }
    const els = r.elements.map(e => ({ ...e })); markEntries(plan, els);
    let fx = repair(plan, els), notes = (r.notes || []).slice(); const pg = r.program || prog;
    fx = rejoin(plan, fx, els);
    // nothing parked (the lot is small, or every parking area was cut off from the street): a simple apron between the building and the street
    const m0 = S.metrics({ ...plan, program: pg, elements: fx.els });
    if (m0.gfa && m0.required > 0 && m0.spaces === 0) {
      const ap = S.streetApron(plan, fx.els, pg);
      if (ap) { const ways = fx.els.filter(e => e.kind === 'drive' && (e.name === 'Main entry' || /^Entrance\b/.test(e.name || ''))).length; if (ways) ap.elements.forEach(e => { if (e.name === 'Main entry') e.name = 'Entrance ' + (ways + 1); }); fx = repair(plan, fx.els.concat(ap.elements));
        notes.unshift(ap.note); }
    }
    // the parking note says what this layout has now (what was cut off is gone), counted as the plan's header counts it
    const mf = S.metrics({ ...plan, program: pg, elements: fx.els });
    notes = notes.filter(t => !/^(?:[A-Za-z ]+: )?(?:Parking is \d[\d,]* spaces? short|A parking area has no straight drive)/.test(t)); // those areas are gone or joined to the entry now
    if (mf.gfa && mf.required > mf.spaces) notes.unshift('Parking is ' + S.spacesWord(mf.required - mf.spaces) + ' short of ' + mf.required + '.');
    if (fx.bad.length || !fx.els.some(e => e.kind === 'building')) continue;
    const m = S.metrics({ ...plan, program: pg, elements: fx.els }); if (m.required > 0 && m.spaces < m.required * 0.5) continue; // not a plan without its parking (after the apron: as much as fits)
    // filling in beside the planner's own layouts, a simple one has to be a working one: no stalls at an entrance's mouth,
    // every row on an aisle, and no more driveways than the site calls for (each parking field cut straight to the street)
    if (n < 3) { const w = S.check({ ...plan, program: pg, elements: fx.els }).filter(i => /is at the mouth of|has no aisle to drive in from/.test(i.text));
      if (w.length || S.entrancesOf(fx.els).length > entranceNeed(plan, fx.els).n + 1) continue; }
    if (pg.use === 'fuel') for (const e of fx.els) if (e.kind === 'building' && e.use !== 'amenity' && !e.fuel) { e.use = 'fuel'; e.fuel = 'store'; e.note = 'Convenience store'; } // (no canopy: the simple layouts know shops)
    if (pg.use === 'storage') for (const e of fx.els) if (e.kind === 'building' && e.use !== 'amenity' && !e.storage) { e.use = 'storage'; e.storage = pg.storage?.climateSf === 0 ? 'drive' : 'climate'; if (e.storage === 'drive') e.floors = 1; e.note = S.storageNote(e); } // (the simple layouts know shops, not storage)
    out.push({ name: ['Simple layout · parking in front', 'Simple layout · building at the street', 'Simple layout · parking beside'][v], elements: fx.els, notes, zones: r.zones || [], program: pg, phi: r.phi, score: -1e9 });
  }
  return out;
}

// ---------- re-fit around the pieces someone moved or resized ----------
// plan.recipe is the arrangement an option was built from; pieces marked `pinned` (moved, resized or added by hand) stay
// exactly where they are and everything else is laid out again around them: drives, parking and buildings go round them,
// a pinned pond counts toward the detention, a pinned clubhouse stands in for the generated one. Returns { elements, notes }.
// a pinned piece as an obstacle outline (plan feet), with the clearance new pieces keep from it
const clearOf = e => e.kind === 'building' ? 14 : e.kind === 'pond' ? 12 : e.kind === 'lot' || e.kind === 'green' ? 0 : 4;
const obstacleOf = e => { const g = clearOf(e); return e.poly ? S.grow(e.poly, g) : e.path ? S.outline({ ...e, width: (e.width || 26) + 2 * g }) : S.corners({ ...e, w: e.w + 2 * g, d: e.d + 2 * g }); };
// opts.amount 'current': lay out as much building as the plan has now (less a building that was removed, not the
// program it started from); a re-fit after changes asked for by name.
export function refit(plan0, opts = {}) {
  const a = refitRecipe(plan0, opts), pinned = (plan0.elements || []).filter(e => e.pinned), P0 = S.normalizeProgram(plan0.program), mixed = !!(plan0.recipe?.prog?.zones || P0.zones);
  // the better of the two: no rule broken, enough parking, then the most units / floor area
  const pin = new Set(pinned.map(e => e.id)), rank = r => { if (!r) return -Infinity; const p = { ...plan0, elements: r.elements }, m = S.metrics(p), bad = S.check(p).filter(i => i.level === 'bad' && !pin.has(i.id)).length; return -bad * 1e9 - Math.max(0, m.required - m.spaces) * 1e6 + (m.units || 0) * 1000 + m.gfa / 100; };
  const fine = r => { if (!r) return false; const p = { ...plan0, elements: r.elements }, m = S.metrics(p); return m.spaces >= m.required && !S.check(p).some(i => i.level === 'bad' && !pin.has(i.id)); };
  let b = null;
  if (!mixed && opts.amount !== 'current') try { b = layoutOptions(plan0, plan0.program, { pinned, count: 1 })[0]; } catch (e) { b = null; }
  // the plan as it is now, re-fitted after an edit: the layout's own recipe keeps its rows where they were, but a building
  // moved or turned into something that needs more parking can leave that recipe nothing to work with (its aisles run
  // into the building: 6 spaces of 120). Then the full search lays the drives and parking out afresh round the pinned
  // pieces, asked for just the floor area of the program's own use the plan has now (pinned ones are counted out there).
  else if (!mixed && opts.amount === 'current' && !fine(a)) try {
    const els = plan0.elements || [], same = els.filter(e => e.kind === 'building' && (e.use || P0.use) === P0.use).reduce((t, e) => t + S.gfaOf(e), 0);
    const units = els.filter(e => e.kind === 'building' && (e.use || P0.use) === P0.use).reduce((t, e) => t + (e.units || 0), 0);
    const prog = { ...plan0.program, gfa: Math.round(same) || 1, ...(P0.units != null ? { units: units || P0.units } : {}), buildings: null, asked: null };
    b = layoutOptions({ ...plan0, elements: [] }, prog, { pinned, count: 1 })[0];
  } catch (e) { b = null; }
  return rank(b) > rank(a) ? { elements: b.elements, notes: b.notes, recipe: b.recipe } : a;
}
function refitRecipe(plan0, opts = {}) {
  const plan = { ...plan0, setbacks: { ...S.SETBACKS, ...(plan0.setbacks || {}) } }, rc = plan.recipe; if (!rc || rc.ft) return null; // (a food truck park re-fits through layoutOptions with its pieces pinned)
  useParams(plan);
  const prog = rc.prog ? S.normalizeProgram(rc.prog) : S.normalizeProgram(plan.program); if (prog.storm) PAR.storm = { ...(PAR.storm || {}), mode: prog.storm }; const F0 = frameOf(plan, rc.deep, rc.align), F = rc.wave ? waveFrame(F0, rc.wave) : F0, toL = p => F.wave ? F.bw(rot(p, -F.psi)) : rot(p, -F.psi); // a bent layout re-fits bent
  const pinned = (plan.elements || []).filter(e => e.pinned), gap = e => e.kind === 'building' ? 9 : e.kind === 'pond' ? 12 : e.kind === 'lot' || e.kind === 'green' ? 0 : 4;
  const keepL = pinned.filter(e => gap(e) > 0 || e.kind === 'pond').map(e => (e.poly ? S.grow(e.poly, gap(e)) : e.path ? S.outline({ ...e, width: (e.width || 26) + 2 * gap(e) }) : S.corners({ ...e, w: e.w + 2 * gap(e), d: e.d + 2 * gap(e) })).map(toL));
  const pondHave = pinned.filter(e => e.kind === 'pond').reduce((s, e) => s + S.elArea(e), 0);
  const pt = tally(pinned, prog), o = { ...rc.o, xNeed: pt.need, xHave: pt.stalls + pt.garages, keep: (rc.o.keep || []).concat(keepL), pond: Math.max(0, (rc.o.pond || 0) - pondHave), spec: { ...(rc.o.spec || {}), ...(pinned.some(e => e.name === 'Clubhouse') ? { amenity: false } : {}) } };
  if (o.pond < 3000) o.pondAt = 'none';
  { const pm = pinned.find(e => e.kind === 'drive' && (e.name === 'Main entry' || e.entry)); if (pm) { const m = toL(pm.path ? pm.path[0] : S.centroid(S.outline(pm))); o.entry = { ...(o.entry || {}), at: rc.deep ? m[1] : m[0] }; } } // the layout's drives start where the hand-made entrance comes in
  o.solid = pinned.filter(e => !['lot', 'green', 'trail', 'fence'].includes(e.kind)).map(e => ({ kind: 'building', use: 'amenity', poly: (e.kind === 'building' ? S.grow(S.shapeOf(e), 8) : S.shapeOf(e)).map(toL) })); // land round the pinned pieces (and a building's walk) is theirs, not a lawn of its own
  // pinned buildings are part of the program: the engine lays out only what's still wanted around them
  const pb = pinned.filter(e => e.kind === 'building' && e.use !== 'amenity'); o.anchors = pb.map(e => S.shapeOf(e).map(toL));
  if (o.footprint != null) o.footprint = Math.max(0, o.footprint - pb.filter(e => e.use === prog.use).reduce((t, e) => t + S.footArea(e), 0));
  for (const [k, by, v] of [['footByZone', 'zone', e => S.footArea(e)], ['unitsByZone', 'zone', e => e.units || 0]]) if (o.spec?.[k]) { const m = { ...o.spec[k] }; for (const e of pb) if (e[by] != null && m[e[by]] != null) m[e[by]] = Math.max(0, m[e[by]] - v(e)); o.spec = { ...o.spec, [k]: m }; }
  if (opts.amount === 'current') { // the building the plan has now, less what's pinned (that stays as it is)
    const free = (plan.elements || []).filter(e => e.kind === 'building' && !e.pinned && e.use !== 'amenity');
    if (o.footprint != null || !prog.zones) o.footprint = free.filter(e => e.use === prog.use).reduce((t, e) => t + S.footArea(e), 0);
    if (o.spec?.footByZone) o.spec = { ...o.spec, footByZone: Object.fromEntries(Object.keys(o.spec.footByZone).map(k => [k, free.filter(e => String(e.zone) === k).reduce((t, e) => t + S.footArea(e), 0)])) };
    if (o.spec?.unitsByZone) o.spec = { ...o.spec, unitsByZone: Object.fromEntries(Object.keys(o.spec.unitsByZone).map(k => [k, free.filter(e => String(e.zone) === k).reduce((t, e) => t + (e.units || 0), 0)])) };
  }
  const a = attempt(plan, F, rc.seq, prog, o); if (!a) return null;
  const fresh = adoptEntry(toPlanEls(F, a.els), pinned), all = fresh.concat(pinned.map(e => ({ ...e }))), entry = all.find(e => e.name === 'Main entry');
  nameAll(fresh, entry ? [entry.x, entry.y] : S.centroid(plan.ring), prog, new Set(pinned.map(e => e.name).filter(Boolean)));
  const fx = repair(plan, all, new Set(pinned.map(e => e.id))), notes = []; fx.els = withTrash(plan, prog, fx.els, notes); const m = S.metrics({ ...plan, elements: fx.els });
  if (m.required > m.spaces) notes.push('Parking is ' + S.spacesWord(m.required - m.spaces) + ' short of ' + m.required + '.');
  if (fx.bad.length) notes.push(...fx.bad.map(i => i.text + '.'));
  return { elements: fx.els, notes };
}
