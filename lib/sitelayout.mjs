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

const rot = S.rotPt, WALK = 12;
// the plan's own parameters (stall and aisle size, building depth and length, shape style), set at the start of each run
let ROW = S.STALL.d, AISLE = S.STALL.aisle, SW = S.STALL.w, PAR = {};
export const PARAMS = { stallW: 9, stallD: 18, aisle: 24, bldgDepth: 60, maxLen: 260, bldgGap: 30, trees: true, style: { ponds: 'organic', islands: 'rounded', corners: 'curved' } };
function useParams(plan) {
  PAR = { ...PARAMS, ...(plan.params || {}), style: { ...PARAMS.style, ...(plan.params?.style || {}) } };
  SW = +PAR.stallW || 9; ROW = +PAR.stallD || 18; AISLE = +PAR.aisle || 24;
}
useParams({});
const stallKeys = () => SW !== 9 || ROW !== 18 || AISLE !== 24 ? { sw: SW, sd: ROW, sa: AISLE } : {};
const COMMERCIAL = ['retail', 'restaurant', 'office', 'medical', 'other'];

// ---------- the turned frame ----------
export function frameOf(plan, deep = false) {
  const ring = plan.ring, front = plan.front != null && plan.front < ring.length ? plan.front : S.longestEdge(ring);
  const n0 = S.outwardOf(ring, front), a0 = S.mainAngle(ring);
  let phi = a0, down = -2; for (let k = 0; k < 4; k++) { const s = rot(n0, -(a0 + k * 90)); if (-s[1] > down) { down = -s[1]; phi = a0 + k * 90; } }
  const psi = deep ? phi + 90 : phi, rules = S.edgeRules(ring, front, plan.setbacks), rr = ring.map(p => rot(p, -psi));
  const xs = rr.map(p => p[0]), ys = rr.map(p => p[1]);
  return { ring, rr, rrT: rr.map(([x, y]) => [y, x]), psi, phi, front, deep, rules, site: S.ringArea(ring), sb: { ...S.SETBACKS, ...(plan.setbacks || {}) },
    build: rules.map(r => Math.max(0.5, r.build)), pave: rules.map(r => Math.max(0.5, r.pave)), paveF: rules.map(r => Math.max(0.5, r.pave, r.role === 'front' ? 60 : 0)), X0: Math.min(...xs), X1: Math.max(...xs), Y0: Math.min(...ys), Y1: Math.max(...ys), cache: new Map() };
}
const toPlan = (F, p) => rot(p, F.psi);

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
    const ends = here.map(c => c.x).sort((a, b) => a - b), a0 = ends[0] ?? lo, a1 = ends[ends.length - 1] ?? hi, solid = B[i + 1].fill === 'bldg' && B[i + 1].use !== 'multifamily' || !!B[i + 1].parts;
    const want = solid ? 0 : Math.max(Math.ceil((a1 - a0) / 420) - 1, 0) + (spec.bays?.[i] || 0);
    const inner = B[i + 1].fill, bayW = inner === 'bldg' && spec.bayRows !== false ? AISLE + 2 * ROW : AISLE;
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
      if (!covers(spans(F, a.y - Rb, a.y + Rb, 'pave', reserve), x - Rb, x + Rb)) continue;
      const poly = []; for (let k = 0; k < 32; k++) { const t = k / 32 * 2 * Math.PI; poly.push([x + Rb * Math.cos(t), a.y + Rb * Math.sin(t)]); }
      drives.push({ kind: 'drive', poly, name: '', note: 'Cul-de-sac · ' + Math.round(2 * Rb) + ' ft', bulb: true });
    }
  }
  els.push(...drives);
  const driveOb = drives.map(d => ({ p: S.outline(d), g: 1, d }));
  const conOb = cons.map(c => ({ p: box(c.x - c.w / 2, A[c.i].y, c.x + c.w / 2, A[c.i + 1].y), g: 1 + (c.end ? R * 0.4 : 0) }));
  // 6. pads along the street (retail) and the clubhouse with its pool at the entry (apartments)
  const blockBand = (i, part) => { // the building band of block i (or of one part of it): [y0, y1] or null
    const b = part || B[i]; if (!b || !['bldg', 'pads'].includes(b.fill)) return null; const D = b.D;
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
  els.push(...lots);
  // 8. buildings in their bands
  const bOb = driveOb.filter(o => !o.d.aisle && !o.d.con).map(o => ({ p: o.p, g: 14 })).concat(cons.map(c => ({ p: box(c.x - c.w / 2, A[c.i].y, c.x + c.w / 2, A[c.i + 1].y), g: 12 + (c.end ? R * 0.5 : 0) })), driveOb.filter(o => o.d.con && o.d.path).map(o => ({ p: o.p, g: 1 }))) /* aisles: the bands already keep clear; curves: their own outline */.concat(bayOb.map(o => ({ p: o.p, g: 10 })), reserve, obst);
  const left = { all: spec.footLeft ?? Infinity, ...(spec.footByZone || {}) }, homesLeft = { ...(spec.unitsByZone || {}) };
  for (let i = 0; i <= n; i++) {
    for (const b of partsOf(i)) {
      const key = b.zone != null && left[b.zone] != null ? b.zone : 'all';
      if (b.fill === 'bldg') { const band = blockBand(i, b); if (band && left[key] > 0) { const got = buildingsIn(F, band, { ...b, need: left[key] }, clipX(spans(F, band[0], band[1], 'build', bOb), b)); left[key] -= got.reduce((s, e) => s + e.w * e.d, 0); els.push(...got); } }
      if (b.fill === 'homes' || b.fill === 'duplex' || b.fill === 'sfr') { const k = b.zone ?? 'all', got = homesIn(F, i, { ...b, max: homesLeft[k] ?? Infinity, prog: b.prog || spec.prog }, A, bOb, b); homesLeft[k] = (homesLeft[k] ?? Infinity) - got.reduce((s, e) => s + (e.units || 0), 0); els.push(...got); }
      if (b.fill === 'commons' && i > 0 && i < n) { const lo = A[i - 1].y + A[i - 1].w / 2 + 15, hi = A[i].y - A[i].w / 2 - 15; if (hi - lo > 60) els.push(...commonsIn(F, [lo, hi], spec, bOb, b)); }
    }
  }
  // 9. truck courts (an aisle of kind 'truck' is the court itself)
  for (const e of els.filter(e => e.kind === 'drive' && e.aisle && A[e.aisle.i].kind === 'truck')) { e.kind = 'truck'; e.name = 'Truck court'; e.note = A[e.aisle.i].w + ' ft · dock doors'; }
  return { els, notes, cons, live, entry };
}

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
  const rule = use === 'multifamily' ? [Math.min(110, PAR.maxLen * 0.6), Math.min(210, PAR.maxLen * 0.85), PAR.maxLen, PAR.bldgGap] : use === 'industrial' ? [150, 900, 1100, 70] : use === 'restaurant' ? [40, 70, 90, 60] : [60, b.len || 1e6, b.len || 1e6, 0];
  const [lo, T, hi, gap] = rule;
  let left = b.need ?? Infinity; // floor area still wanted (sq ft of footprint)
  for (const [p, q] of sp.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))) {
    let L = q - p; if (L < lo || left <= 0) continue;
    if (left !== Infinity && L > left / D) L = Math.max(lo, left / D);
    let k = Math.max(1, Math.round((L + gap) / (T + gap))); while (k > 1 && (L - (k - 1) * gap) / k < lo) k--; while ((L - (k - 1) * gap) / k > hi) k++;
    const len = (L - (k - 1) * gap) / k, x0 = b.at === 'right' ? q - L : b.at === 'left' ? p : (p + q - L) / 2;
    for (let j = 0; j < k; j++) { const xa = x0 + j * (len + gap); out.push({ kind: 'building', ...rectL(xa, band[0], xa + len, band[1]), use, ...(b.zone != null ? { zone: b.zone } : {}), floors: b.floors || U.floors, ...(use === 'multifamily' ? { jog: 5 } : {}), ...(b.note ? { note: b.note } : {}) }); }
    left -= L * D;
  }
  return out;
}

// townhome rows (rear-load: garages on the lane, front doors on a green court) and duplexes (front-load off a street)
function homesIn(F, i, b, A, bOb, part) {
  if (b.fill === 'sfr') return lotsIn(F, i, b, A, bOb, part);
  const out = [], n = A.length, th = b.fill === 'homes', D = 40, apron = th ? 5 : 25, unitW = th ? 24 : 64, gap = th ? 20 : 22;
  const bands = [];
  if (i > 0) { const y = A[i - 1].y + A[i - 1].w / 2 + apron; bands.push([y, y + D, 'down']); }
  if (i < n) { const y = A[i].y - A[i].w / 2 - apron; bands.push([y - D, y, 'up']); }
  if (bands.length === 2 && bands[0][1] + 20 > bands[1][0]) bands.pop();
  for (const [y0, y1] of bands) for (const [p, q] of spans(F, y0, y1, 'build', bOb).map(([a, c]) => [Math.max(a, part.x0 + (part.x0 > -Infinity ? 15 : 0)), Math.min(c, part.x1 - (part.x1 < Infinity ? 15 : 0))]).filter(([a, c]) => c > a)) {
    let x = p;
    if (th) while (x + 3 * unitW <= q && b.max > 0) { const k = Math.min(b.maxUnits || 6, Math.floor((q - x) / unitW), Math.max(3, b.max)); if (k < 3) break; b.max -= k; out.push({ kind: 'building', ...rectL(x, y0, x + k * unitW, y1), use: 'townhomes', floors: b.floors || 3, units: k, note: k + ' units · ' + unitW + '×' + D + ' · rear-load' }); x += k * unitW + gap; }
    else while (x + unitW <= q && b.max > 0) { b.max -= 2; out.push({ kind: 'building', ...rectL(x, y0, x + unitW, y1), use: 'duplex', floors: b.floors || 2, units: 2, note: 'Front-load · private yards' }); x += unitW + gap; }
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
        const t = next(placed), T = S.HOME_TYPES[t.stories]; if (x + T.lotW > q) break;
        const cx = x + T.lotW / 2, { hb, sp } = houseSp(T);
        if (sp.some(([a, c]) => a <= cx - T.w / 2 && c >= cx + T.w / 2)) {
          out.push({ kind: 'lot', ...rectL(x, sd.ly0, x + T.lotW, sd.ly1), name: '', note: T.lotW + ' × ' + Math.round(sd.ly1 - sd.ly0) + ' ft lot' });
          out.push({ kind: 'building', ...rectL(cx - T.w / 2, hb[0], cx + T.w / 2, hb[1]), use: 'sfr', floors: t.stories, units: 1, sf: T.sf, nowalk: true, note: t.stories + '-story · ' + T.sf.toLocaleString('en-US') + ' sf' });
          const dw = sd.dir > 0 ? [sd.front - 11, sd.front + 20] : [sd.front - 20, sd.front + 11], gx = cx + T.w / 2 - 10;
          out.push({ kind: 'plaza', ...rectL(gx - 8, dw[0], gx + 8, dw[1]), name: '', note: 'Driveway' });
          count[t.stories] = (count[t.stories] || 0) + 1; placed++; b.max--;
        }
        x += T.lotW;
      }
    }
  }
  return out;
}

// a commons: pavilion by the main drive, courts and a playground; the rest of it becomes the amenity lake and lawns
function commonsIn(F, band, spec, ob, b) {
  const out = [], want = new Set(b.items?.length ? b.items.map(s => String(s).toLowerCase()) : ['lake', 'pavilion', 'courts', 'playground', 'restrooms']), mid = (band[0] + band[1]) / 2;
  const put = (key, kind, w, d, extra, prefer) => {
    if (!want.has(key)) return; const all = ob.concat(out.map(e => ({ p: outL(e), g: 20 })));
    const sp = spans(F, mid - d / 2, mid + d / 2, 'pave', all).map(([p, q]) => [Math.max(p, b.x0 + 20), Math.min(q, b.x1 - 20)]).filter(([p, q]) => q - p >= w); if (!sp.length) return;
    const xs = sp.flatMap(([p, q]) => [p, q - w]), x = xs.sort((a, c) => prefer(a) - prefer(c))[0];
    out.push({ kind, ...rectL(x, mid - d / 2, x + w, mid + d / 2), ...extra });
  };
  const sx = spec.spineX ?? (F.X0 + F.X1) / 2;
  put('pavilion', 'building', 80, 50, { use: 'amenity', floors: 1, name: 'Pavilion', note: 'Open-air · covered' }, x => Math.abs(x + 40 - sx));
  put('courts', 'court', 128, 120, { name: 'Pickleball', note: '4 courts' }, x => -Math.abs(x + 64 - sx));
  put('playground', 'play', 64, 64, { shape: 'circle', name: 'Playground' }, x => Math.abs(Math.abs(x + 32 - sx) - 160));
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
  for (const [p, q] of sp) for (let x = p + lane + 6; x + bw + lane + 6 <= q && made < spec.pads; x += bw + 2 * lane + 110) {
    const y1 = top, y0 = y1 - bd, b = { kind: 'building', ...rectL(x, y0, x + bw, y1), use: 'restaurant', floors: 1, note: 'QSR / coffee · drive-thru' };
    const path = [[x - lane / 2 - 4, top + WALK + ROW + 2], [x - lane / 2 - 4, y0 - lane / 2 - 4], [x + bw + lane / 2 + 4, y0 - lane / 2 - 4], [x + bw + lane / 2 + 4, top + WALK + ROW + 2]];
    const dt = { kind: 'drive', path, width: lane, r: 14, name: '', note: 'Drive-thru lane' };
    els.push(b, dt); obs.push({ p: S.outline(dt), g: 1 }, { p: S.outline(b), g: 4 }); made++;
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
    // distance to the edge of the piece (city-block passes), for the most open point
    const dist = new Map(cells.map(q => [q, 1e9])), inP = q => lab[q] === id;
    for (const q of cells) { const i = q % nx, j = (q - i) / nx; if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => { const x = i + a, y = j + b; return x < 0 || y < 0 || x >= nx || y >= ny || !inP(y * nx + x); })) dist.set(q, 1); }
    for (let pass = 0; pass < 2; pass++) for (const q of pass ? cells.slice().reverse() : cells) { const i = q % nx, j = (q - i) / nx; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = (j + b) * nx + i + a; if (dist.has(t)) dist.set(q, Math.min(dist.get(q), dist.get(t) + 1)); } }
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
    pieces.push({ area, ring, core: at(core % nx, (core - core % nx) / nx), room: dist.get(core) * c, sub, areaAt, rect, c });
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
    if (got >= need * 0.95 || p.room < 22 || (got > 0 && p.area < need * 0.3)) continue;
    // as deep into the piece as keeps the pond near what's still needed (never closer than ~10 ft to its edge)
    let t = Math.max(2, Math.ceil(16 / p.c)); // no thin arms: a pond is a pond, not a moat while (p.areaAt(t + 1) > Math.max(need - got, 8000) * 1.5 && t < 200) t++;
    // a piece wrapped round a building traces round it too: go deeper until the pond is clear of everything
    const solid = els.filter(e => e.kind !== 'green' && e.kind !== 'trail').map(e => ({ poly: outL(e) }));
    let poly = null;
    const style = PAR.style.ponds; let box0 = null;
    for (let k = 0; k < 6 && !poly; k++, t += 2) {
      if (style !== 'organic') { const b = p.rect(Math.max(1, t - 1)); if (!b) break; const q = box(...b); if (!solid.some(o => S.rectsOverlap({ poly: q }, o, 0.5))) { poly = q; box0 = b; } continue; }
      const sb = p.sub(t); if (!sb || sb.ring.length < 4) break; const q = S.tidyRing(S.smooth(S.tidyRing(sb.ring, p.c * 0.9), 3), 0.4); if (!solid.some(o => S.rectsOverlap({ poly: q }, o, 0.5))) poly = q;
    }
    if (!poly) continue;
    const pondEl = box0 ? { kind: 'pond', ...rectL(...box0), ...(style === 'rounded' ? { shape: 'round' } : {}) } : { kind: 'pond', poly, labelAt: S.centroid(poly) };
    const a = S.elArea(pondEl); if (a < 3000) continue;
    if (p.area - a > 9000) out.push({ ...landPiece(p, { ...spec, future: false }), name: '', note: '' });
    out.push({ ...pondEl, name: spec.lakeName || 'Detention', note: spec.lakeName ? 'Wet detention' : '' }); got += a; used.add(p); if (box0) poly = S.outline(pondEl);
    if (spec.trail && a > 15000 && t * p.c >= 26) out.push({ kind: 'trail', path: S.tidyRing(S.grow(poly, 14), 1), width: 6, r: 0, closed: true, name: '', note: 'Walking trail' });
  }
  stats.pond = got; stats.pondNeed = need;
  let dog = !spec.amenity, play = !spec.amenity, k = 0, fut = spec.future;
  for (const p of pieces) {
    if (used.has(p) || p.area < 4000) continue;
    const g = landPiece(p, { ...spec, future: fut }, !dog && p.area >= 9000 && p.area < 43560); if (S.ringArea(g.poly) < 3000) continue; if (g.name === 'Future development') fut = false;
    if (g.name === 'Dog park') dog = true;
    if (!play && p.room >= 44 && g.name !== 'Dog park') { play = true; out.push({ kind: 'play', x: p.core[0], y: p.core[1], w: 56, d: 56, shape: 'circle', name: 'Playground' }); }
    out.push(g); k++;
  }
  return out;
}

// open land as a planted piece: a lawn, a dog park, or land kept for a future phase
function landPiece(p, spec, dog) {
  const poly = PAR.style.ponds === 'square' ? S.tidyRing(p.ring, p.c * 0.9) : S.tidyRing(S.smooth(S.tidyRing(p.ring, p.c * 0.9), 3), 0.4), big = p.area >= 43560 && spec.future;
  return { kind: 'green', poly, name: big ? 'Future development' : dog ? 'Dog park' : p.area >= 12000 ? 'Open lawn' : '', note: big ? (p.area / 43560).toFixed(1) + ' ac' : dog ? 'Fenced · small | large' : '', trees: !big, labelAt: p.core };
}

// ---------- stacks for each use ----------

// the block sequences worth trying for a use, bottom to top (the bottom is the street side across, a side line deep)
function sequences(use, prog, F, avail) {
  const out = [], fl = prog.floors, U = S.USES[use];
  if (use === 'multifamily') {
    const D = +PAR.bldgDepth || 60, inB = { fill: 'bldg', use, D, floors: fl, rowsDown: true, rowsUp: true, h: 2 * ROW + 2 * WALK + D }, inP = { fill: 'park', rowsDown: true, rowsUp: true, h: 2 * ROW + 4 };
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
  } else if (use === 'industrial') {
    for (const D of [180, 240, 300, 360, 420, 520]) for (const cars of [1, 2]) {
      const park = cars > 1 ? [{ fill: 'park', rowsDown: true, rowsUp: true, h: 2 * ROW + 4 }] : [];
      const blocks = [{ fill: 'none', rowsUp: true, h: ROW }, ...park, { fill: 'bldg', use, D, floors: 1, rowsDown: true, walkDown: WALK, walkUp: 0, h: ROW + WALK + D }, { fill: 'none', h: 0 }];
      out.push({ blocks, aisles: [...Array(cars).fill(0).map(() => ({ w: AISLE, kind: 'aisle' })), { w: 130, kind: 'truck' }] });
    }
  } else { // retail, restaurant, office, medical, other: a building row at the back facing parking toward the street
    const D = use === 'restaurant' ? 70 : prog.depth || U.depth;
    for (let na = 1; na <= 8; na++) for (const pads of prog.pads && !F.deep ? [true, false] : [false]) {
      const inner = Array(na - 1).fill(0).map(() => ({ fill: 'park', rowsDown: true, rowsUp: true, h: 2 * ROW + 4 }));
      const bot = pads ? { fill: 'pads', D: 50, rowsUp: true, h: ROW + WALK + 50 + 30 } : { fill: 'none', rowsUp: true, h: ROW };
      const bl = { fill: 'bldg', use, D, floors: prog.floors, rowsDown: true, walkDown: 15, walkUp: 0, h: ROW + 15 + D };
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
function reserveBand(F, area, at) {
  if (!(area > 0) || at === 'none') return null;
  const deep = F.deep !== (at === 'end'), R = deep ? F.rrT : F.rr, lo = deep ? F.X0 : F.Y0, hi = deep ? F.X1 : F.Y1, inBand = (a, b) => S.ringArea(clipY(R, a, b)) || 0; // 'end': beside the rows instead of behind them
  const back = at !== 'front'; let a = lo, b = hi;
  for (let it = 0; it < 30; it++) { const m = (a + b) / 2; if (back ? inBand(m, hi) > area : inBand(lo, m) < area) a = m; else b = m; }
  const v = (a + b) / 2, big = 1e5, bx = back ? [v, hi + 50] : [lo - 50, v];
  return deep ? box(bx[0], -big, bx[1], big) : box(-big, bx[0], big, bx[1]);
}
const fit = v => +v.toFixed(2);
// one attempt: a block sequence placed in the frame, laid out, balanced for parking, finished and checked
function attempt(plan, F, seq, prog, o) {
  const P = profile(F), blocks = seq.blocks.map(b => ({ ...b })), aisles = seq.aisles.map(a => ({ ...a })), n = aisles.length;
  const res0 = reserveBand(F, o.pond * 1.35, o.pondAt), keep = (o.keep || []).concat(res0 ? [res0] : []), res = res0 || keep[0] || null;
  let lo = (['bldg', 'pads', 'homes', 'duplex'].includes(blocks[0].fill) ? P.b : P.p)[0], hi = (['bldg', 'homes', 'duplex'].includes(blocks[n].fill) ? P.b : P.p)[1];
  if (res0 && !F.deep && o.pondAt !== 'end') { const ys = res0.map(p => p[1]); if (o.pondAt === 'front') lo = Math.max(lo, Math.max(...ys) + 4); else hi = Math.min(hi, Math.min(...ys) - 4); }
  let y = lo + blocks[0].h + aisles[0].w / 2; aisles[0].y = y;
  for (let i = 1; i < n; i++) aisles[i].y = y = y + aisles[i - 1].w / 2 + blocks[i].h + aisles[i].w / 2;
  const slack = hi - (y + aisles[n - 1].w / 2 + blocks[n].h); if (slack < -2) return null;
  const shift = o.shift === 'mid' ? slack / 2 : o.shift === 'top' ? slack : 0; for (const a of aisles) a.y += shift;
  const spec = { deep: F.deep, aisles, blocks, reserve: keep, entryAvoid: o.keep || [], conW: o.conW || 26, curveR: PAR.style.corners === 'square' ? 0 : o.curveR ?? 30, spineX: o.spineX, entry: o.entry, amenity: prog.use === 'multifamily' && o.amenity !== false && F.site > 4 * 43560 && !(prog.units != null && prog.units < 100), pads: seq.pads ? prog.pads || 2 : 0, bays: {}, prog, ...(o.spec || {}) };
  let cap = o.footprint ?? Infinity, best = null; // footprint wanted (sq ft), spent front to back
  const per = prog.use === 'multifamily' ? prog.floors * 0.85 / prog.unitSf * prog.perUnit : prog.floors / 1000 * prog.ratio; // spaces per sq ft of footprint
  for (let it = 0; it < 8; it++) {
    const r = layoutStack(F, { ...spec, bays: { ...spec.bays }, footLeft: cap }); if (!r) return null;
    const st = tally(r.els, prog); st.need += o.xNeed || 0; st.stalls += o.xHave || 0; // pinned pieces: their parking need and their spaces
    const have = st.stalls + st.garages, short = Math.max(0, st.need - have), sc = short ? st.footprint * 0.5 - short / Math.max(per, 1e-6) : st.footprint + 1e8; // enough parking first, then the most building
    if (!best || sc > best.sc) best = { r, st, sc };
    if (!short || prog.use === 'industrial' || !st.need) break;
    // short of parking: a bay across a long building row (it adds spaces and a cross drive), else less building
    const rows = blocks.map((b, i) => i).filter(i => i > 0 && i < n && blocks[i].fill === 'bldg').map(i => {
      const sp = r.live.filter(q => q.i === i - 1), up = r.live.filter(q => q.i === i), len = Math.max(0, ...sp.flatMap(a => up.map(b => Math.min(a.eb, b.eb) - Math.max(a.ea, b.ea))));
      const k = (spec.bays[i - 1] || 0) + Math.max(0, Math.ceil(len / 420) - 1) + 1; return { i, room: len - (90 + 80 * k + 135 * (k + 1)) }; }).filter(q => q.room > 0).sort((a, b) => b.room - a.room);
    if (rows.length && it < 5) { spec.bays[rows[0].i - 1] = (spec.bays[rows[0].i - 1] || 0) + 1; continue; }
    cap = Math.min(cap, st.footprint) - short / Math.max(per, 1e-6) / (1 + (prog.use === 'multifamily' ? 0.25 : 0.1)) - 400;
    if (spec.footByZone) { // mixed use: take it off each zone's building in proportion to what was placed
      const placed = {}; for (const e of r.els) if (e.kind === 'building' && e.zone != null) placed[e.zone] = (placed[e.zone] || 0) + e.w * e.d;
      const f = Math.max(0.5, cap / Math.max(1, st.footprint)); spec.footByZone = Object.fromEntries(Object.keys(spec.footByZone).map(k => [k, (placed[k] ?? spec.footByZone[k]) * f]));
    }
    if (cap < 2000) break;
  }
  const { r, st } = best;
  const land = finishLand(F, r.els, { pond: o.pond, reserve: res0 ? [res0] : [], trail: prog.use === 'multifamily' || prog.use === 'townhomes' || !!o.mixed, amenity: spec.amenity, future: o.footprint != null && st.footprint >= o.footprint * 0.97 || !!o.future, lakeName: o.lake || (prog.use === 'multifamily' && o.pond ? 'Detention pond' : '') }, st);
  const els = r.els.concat(land);
  return { F, r, els, st, seq, o, slack, spec };
}
// numbers for a frame-feet layout
function tally(els, prog) {
  let footprint = 0, gfa = 0, units = 0, garages = 0, need = 0, stalls = 0;
  for (const e of els) {
    if (e.kind === 'parking') stalls += S.stalls({ ...e, rot: 0 }).count;
    if (e.kind !== 'building' || e.use === 'amenity') continue;
    const a = e.w * e.d, U = S.USES[e.use] || S.USES.other, P = e.use === prog.use && !prog.zones ? prog : S.normalizeProgram({ use: e.use }); /* mixed use: each building by its own numbers */ footprint += a; gfa += a * (e.floors || 1);
    if (e.use === 'multifamily') { const u = Math.floor(a * (e.floors || 1) * 0.85 / P.unitSf); units += u; need += u * P.perUnit; }
    else if (U.garage) { units += e.units || 1; garages += (e.units || 1) * U.garage; need += (e.units || 1) * P.perUnit; }
    else need += a * (e.floors || 1) / 1000 * P.ratio;
  }
  return { footprint, gfa, units, garages, need: Math.ceil(need - 0.01), stalls };
}

// ---------- the three options ----------
const sig = els => { const B = els.filter(e => e.kind === 'building'), P = els.filter(e => e.kind === 'parking'); return B.length + '|' + Math.round(B.reduce((s, e) => s + e.w * e.d * (e.floors || 1), 0) / 500) + '|' + P.reduce((s, e) => s + S.stalls(e).count, 0); }; // what a reader would call the same plan
const ENTRY = { multifamily: { w: 40, boulevard: true }, townhomes: { w: 36, boulevard: true }, duplex: { w: 36, boulevard: true }, sfr: { w: 40, boulevard: true }, industrial: { w: 40 } };
const DRIVES = { industrial: { conW: 32, curveR: 50 }, townhomes: { conW: 26, curveR: 40 }, duplex: { conW: 26, curveR: 40 }, sfr: { conW: 28, curveR: 45 } };
// the footprint the program asks for (sq ft), or null for "as much as fits"
function wantFoot(prog) {
  if (prog.max) return null;
  if (prog.use === 'multifamily') return prog.units ? prog.units * prog.unitSf / 0.85 / prog.floors : prog.gfa ? prog.gfa / prog.floors : null;
  if (prog.use === 'townhomes' || prog.use === 'duplex' || prog.use === 'sfr') return null;
  return prog.gfa ? prog.gfa / prog.floors : null;
}
// a quick estimate to rank block sequences before laying them out
function estimate(F, seq, prog, pond, pondAt, foot) {
  const P = profile(F), W = P.width * 0.82 - (pondAt === 'end' ? pond * 1.35 / Math.max(1, P.b[1] - P.b[0]) : 0), n = seq.aisles.length, Hs = seq.blocks.reduce((s, b) => s + b.h, 0) + seq.aisles.reduce((s, a) => s + a.w, 0);
  const avail = P.b[1] - P.b[0] + (seq.blocks[0].fill === 'bldg' ? 0 : P.b[0] - P.p[0]) - (pondAt !== 'none' && pondAt !== 'end' && !F.deep ? pond * 1.35 / Math.max(W, 1) : 0);
  if (Hs > avail + 2) return null;
  const B = seq.blocks.filter(b => b.fill === 'bldg'), rows = seq.blocks.reduce((s, b) => s + (b.rowsDown ? 1 : 0) + (b.rowsUp ? 1 : 0), 0), slack = avail - Hs;
  let value;
  if (prog.use === 'townhomes' || prog.use === 'duplex' || prog.use === 'sfr') { const th = prog.use === 'townhomes', rowsH = seq.blocks.reduce((s, b, i) => s + (i === 0 || i === n ? 1 : 2), 0); value = rowsH * W * (th ? 0.8 / 24 : prog.use === 'sfr' ? 0.85 / 52 : 2 * 0.75 / 86); if (prog.units) value = -Math.abs(value - prog.units); }
  else {
    const fcap = B.reduce((s, b) => s + W * (b.use === 'multifamily' ? 0.78 : 0.95) * b.D, 0), perSf = prog.use === 'multifamily' ? prog.floors * 0.85 / prog.unitSf * prog.perUnit : prog.floors / 1000 * prog.ratio;
    const stalls = rows * W * 0.85 / 9, fb = prog.use === 'industrial' ? Math.min(fcap, stalls / Math.max(perSf, 1e-6) * 1.05) : Math.min(fcap, (stalls + (prog.use === 'multifamily' ? fcap * 0.12 : 0)) / Math.max(perSf, 1e-6));
    value = foot ? -Math.abs(Math.min(fb, foot) - foot) - (fb < foot ? 0 : Hs * W * 0.02) : fb;
    if (prog.use !== 'industrial') value -= Math.max(0, stalls - Math.min(fb, foot || fb) * perSf * 1.15) / Math.max(perSf, 1e-6) * 0.6; // parking nobody needs
  }
  return value - slack * W * (foot ? 0.002 : 0.05) * (prog.use === 'multifamily' ? 0.004 : 1);
}
function score(a, prog, foot) {
  const st = a.st, mf = prog.use === 'multifamily', homes = prog.use === 'townhomes' || prog.use === 'duplex' || prog.use === 'sfr';
  const V = mf || homes ? st.units : st.gfa, T = mf ? (prog.units || (foot ? Math.floor(foot * prog.floors * 0.85 / prog.unitSf) : null)) : homes ? prog.units : foot ? foot * prog.floors : null;
  let s = T ? 1000 - Math.abs(V - T) / T * 1000 - (V < T ? 300 * (T - V) / T : 0) : V / (mf || homes ? 1 : 100);
  const have = st.stalls + st.garages; if (st.need > have) s -= (st.need - have) / st.need * 1500;
  if (st.need && have > st.need * 1.15) s -= Math.abs(s) * Math.min(0.3, (have / st.need - 1.15) * 0.4); // paving nobody needs
  if (st.pondNeed > 0) s -= Math.max(0, st.pondNeed * 0.95 - st.pond) / st.pondNeed * Math.abs(s) * 1.5; // detention is a requirement, not a nice-to-have
  return s;
}
const norm = d => +((((d % 360) + 360) % 360).toFixed(3));
// frame-feet pieces to plan pieces: centres, outlines and turns
function toPlanEls(F, els) {
  let k = 0;
  return els.map(e => {
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
// names, front to back from the entry: Apt Bldg 1…, Building A…, Pad A…, Townhome Row 1…, Duplex 1…, Warehouse
function nameAll(els, at, prog) {
  const B = els.filter(e => e.kind === 'building' && e.use !== 'amenity').sort((a, b) => Math.hypot(a.x - at[0], a.y - at[1]) - Math.hypot(b.x - at[0], b.y - at[1])), count = {};
  for (const e of B) {
    const pad = /drive-thru/.test(e.note || ''), key = pad ? 'pad' : e.use, i = count[key] = (count[key] || 0) + 1;
    e.name = pad ? 'Pad ' + String.fromCharCode(64 + i) : e.use === 'multifamily' ? 'Apt Bldg ' + i : e.use === 'townhomes' ? 'Townhome Row ' + i : e.use === 'duplex' ? 'Duplex ' + i : e.use === 'sfr' ? 'Lot ' + i : e.use === 'industrial' ? (B.filter(b => b.use === 'industrial').length > 1 ? 'Building ' + String.fromCharCode(64 + i) : 'Warehouse') : 'Building ' + String.fromCharCode(64 + i);
    if (e.use === 'multifamily') e.units = Math.floor(e.w * e.d * (e.floors || 1) * (prog.eff || 0.85) / (prog.unitSf || 900));
  }
}
// the network from the entry: drives that touch, parking that touches a drive. Returns the ids reached.
function reach(els) {
  const D = els.filter(e => e.kind === 'drive' || e.kind === 'truck'), grown = e => e.poly ? { ...e, poly: S.grow(e.poly, 1.5) } : e.path ? { ...e, width: (e.width || 26) + 3 } : { ...e, w: e.w + 3, d: e.d + 3 };
  const G = D.map(grown), seen = new Set(), st = D.filter(e => e.name === 'Main entry' || e.note === 'Drive-thru lane' && false);
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
export function layoutOptions(plan0, programIn, opts = {}) {
  const prog = S.normalizeProgram(programIn), plan = { ...plan0, setbacks: { ...S.SETBACKS, ...(plan0.setbacks || {}) } }, site = S.ringArea(plan.ring);
  useParams(plan);
  if (prog.zones) return mixedOptions(plan, prog, opts);
  const pinned = opts.pinned || [], pondPct = prog.detentionPct ?? (site < 43560 ? 0 : site < 3 * 43560 ? 8 : 10), pond = Math.max(0, site * pondPct / 100 - pinned.filter(e => e.kind === 'pond').reduce((s, e) => s + S.elArea(e), 0)), foot = wantFoot(prog);
  const keepPlan = pinned.filter(e => e.kind !== 'lot' && e.kind !== 'green').map(e => obstacleOf(e)), keepIds = new Set(pinned.map(e => e.id)), pt = tally(pinned, prog);
  const found = [];
  const t0 = Date.now();
  const pass = (depth, shifts, entries, until = Infinity) => { for (const deep of [false, true]) {
    const F = frameOf(plan, deep), seqs = sequences(prog.use, prog, F);
    for (const pondAt of pond ? ['back', 'front', 'end'] : ['none']) {
      const ranked = seqs.map(seq => ({ seq, v: estimate(F, seq, prog, pond, pondAt, foot) })).filter(q => q.v != null).sort((a, b) => b.v - a.v).slice(0, depth);
      for (const q of ranked) for (const shift of shifts) for (const at of entries) {
        if (Date.now() > until) return; // the wider look has a time limit: the page waits on it
        const ent = { ...(ENTRY[prog.use] || { w: 30 }) }; if (at != null) { const P = profile(F); ent.at = F.deep ? P.b[0] + (P.b[1] - P.b[0]) * at : F.X0 + (F.X1 - F.X0) * at; }
        const o = { pond, pondAt: pond < 3000 ? 'none' : pondAt, footprint: foot, shift, entry: ent, ...(DRIVES[prog.use] || {}), ...(pinned.length ? { xNeed: pt.need, xHave: pt.stalls + pt.garages, keep: keepPlan.map(r => r.map(p => rot(p, -F.psi))), spec: pinned.some(e => e.name === 'Clubhouse') ? { amenity: false } : {} } : {}) }, a = attempt(plan, F, q.seq, prog, o);
        if (!a) continue;
        const els = toPlanEls(F, a.els), entry = els.find(e => e.name === 'Main entry');
        nameAll(els, entry ? [entry.x, entry.y] : S.centroid(plan.ring), prog);
        const fx = repair(plan, els.concat(pinned.map(e => ({ ...e }))), keepIds); a.st = { ...tally(a.els, prog), pond: a.st.pond, pondNeed: a.st.pondNeed };
        if (opts.debug) console.log((deep ? 'deep' : 'across'), pondAt, shift, 'blocks', q.seq.blocks.map(b => b.fill[0]).join(''), 'aisles', a.r.live.map(r => r.i + ':' + Math.round(r.ea) + '-' + Math.round(r.eb)).join(' '), 'cons', a.r.cons.length, 'cut', fx.cut, 'bad', fx.bad.map(i => i.text).join(';'), 'st', JSON.stringify(a.st), 'notes', a.r.notes.join(';'));
        const club = prog.use !== 'multifamily' || !a.spec.amenity || fx.els.some(e => e.name === 'Clubhouse');
        found.push({ a, els: fx.els, bad: fx.bad.filter(i => !keepIds.has(i.id)), cut: fx.cut, recipe: { deep, seq: q.seq, o }, key: (deep ? 'deep' : 'across') + '|' + pondAt, score: score(a, prog, foot) * (club ? 1 : 0.94) - fx.bad.length * 500 - fx.cut * 40, deep, pondAt });
      }
    }
  } };
  const parked = f => f.parked ??= (m => m.spaces >= m.required)(S.metrics({ ...plan, program: prog, elements: f.els }));
  const enough = () => { const u = found.filter(f => !f.bad.length && f.els.some(e => e.kind === 'building') && parked(f)).sort((a, b) => b.score - a.score), top = u[0]?.score ?? 0; // three good ones, not just three
    return u.filter((f, i) => f.score >= top - Math.abs(top) * 0.25 && !u.slice(0, i).some(p => sig(p.els) === sig(f.els))).length >= 3; };
  pass(opts.depth || 3, foot ? ['bottom'] : ['bottom', 'mid'], [null]);
  if (!enough()) pass(6, ['bottom', 'mid', 'top'], [0.25, 0.75], t0 + (opts.budgetMs ?? 3000)); // a wider look: more stacks, other entry spots
  const usable = found.filter(f => !f.bad.length && f.els.some(e => e.kind === 'building')).sort((a, b) => b.score - a.score), pick = [];
  usable.forEach(parked);
  usable.sort((a, b) => !a.parked - !b.parked || b.score - a.score); // enough parking first
  const top = usable[0]?.score ?? 0, good = f => f.score >= top - Math.abs(top) * 0.25, same = (f, p) => sig(f.els) === sig(p.els) || Math.abs(f.a.st.gfa - p.a.st.gfa) < 0.01 * p.a.st.gfa && f.key === p.key;
  const N = opts.count || 3;
  for (const f of usable) if (pick.length < Math.min(3, N) && good(f) && f.parked && !pick.some(p => p.key === f.key)) pick.push(f); // different arrangements first, parked
  for (const f of usable) if (pick.length < Math.min(3, N) && good(f) && f.parked && !pick.includes(f) && !pick.some(p => same(f, p))) pick.push(f);
  for (const f of usable) if (pick.length < Math.min(3, N) && f.parked && !pick.includes(f) && !pick.some(p => same(f, p))) pick.push(f);
  for (const f of usable) if (pick.length < N && good(f) && (pick.length < 3 || f.parked) && !pick.includes(f) && !pick.some(p => same(f, p))) pick.push(f); // then other good versions
  for (const f of usable) if (pick.length < N && (pick.length < 3 || f.parked) && !pick.includes(f) && !pick.some(p => same(f, p))) pick.push(f);
  const out = pick.map(f => optionOf(plan, f, prog, foot, pond));
  return out.length >= 3 || pinned.length ? out : out.concat(fallback(plan, prog, 3 - out.length));
}
const sizesOf = els => ({ units: els.filter(e => e.kind === 'building').reduce((s, e) => s + (e.units || 0), 0), gfa: els.filter(e => e.kind === 'building').reduce((s, e) => s + (e.sf ?? e.w * e.d * (e.floors || 1)), 0) });
function optionOf(plan, f, prog, foot, pond) {
  const m = S.metrics({ ...plan, program: prog, elements: f.els }), notes = [];
  const have = m.spaces, T = prog.use === 'multifamily' ? prog.units : prog.use === 'townhomes' || prog.use === 'duplex' || prog.use === 'sfr' ? prog.units : null;
  if (T && m.units && m.units < T * 0.97) notes.push('Fits about ' + m.units + ' of the ' + T + ' units asked for.');
  if (!T && foot && m.gfa < foot * prog.floors * 0.97) notes.push('Fits about ' + Math.round(m.gfa).toLocaleString('en-US') + ' of the ' + Math.round(foot * prog.floors).toLocaleString('en-US') + ' sq ft asked for.');
  if (m.required > have) notes.push('Parking is ' + (m.required - have) + ' spaces short of ' + m.required + '.');
  if (pond > 0 && m.pond < pond * 0.9) notes.push('Detention holds about ' + Math.round(m.pond / pond * 100) + '% of a typical 10% pond; plan on underground storage for the rest.');
  const fut = f.els.filter(e => e.name === 'Future development').reduce((s, e) => s + S.elArea(e), 0); if (fut > 0) notes.push((fut / 43560).toFixed(1) + ' acres are left for a future phase.');
  const name = (f.deep ? OPTION_NAMES.deep : OPTION_NAMES.across) + (f.pondAt === 'front' ? ' · pond at the entry' : f.pondAt === 'back' ? ' · pond at the back' : f.pondAt === 'end' ? ' · pond at the end' : '');
  return { name, elements: f.els, notes, zones: [{ name: S.USES[prog.use].label, use: prog.use, ring: plan.ring, acres: S.ringArea(plan.ring) / 43560 }], program: prog, phi: f.a.F.phi, score: f.score, recipe: f.recipe, sizes: sizesOf(f.els) };
}

// ---------- mixed use: zones from the street back on one connected network ----------
const ZONE_NAME = { retail: 'Retail', restaurant: 'Restaurants', office: 'Office', medical: 'Medical', industrial: 'Industrial', multifamily: 'Apartments', townhomes: 'Townhomes', duplex: 'Duplexes', sfr: 'Single-family', amenity: 'Commons', other: 'Commercial' };
// one zone's blocks and aisles: [block, aisle, block, aisle, …] (the next zone, or a closing block, follows the last aisle)
function zoneItems(z, zi, first, W, site, prog, scale = 1) {
  const items = [], U = S.USES[z.use], P = S.normalizeProgram({ use: z.use, floors: z.floors }), fl = P.floors, aisle = (kind = 'aisle', w = AISLE) => ({ t: 'a', w, kind });
  const rowStalls = W * 0.8 / 9;
  if (COMMERCIAL.includes(z.use)) {
    const D = z.use === 'restaurant' ? 70 : U.depth, gfa = (z.gfa || W * 0.8 * D * fl) * scale, need = gfa / 1000 * P.ratio, k = Math.max(1, Math.ceil(need / (2 * rowStalls)));
    items.push(first && z.pads ? { fill: 'pads', D: 50, rowsUp: true, h: ROW + WALK + 50 + 30, zone: zi } : { fill: first ? 'none' : 'park', rowsUp: true, rowsDown: !first, h: first ? ROW : 2 * ROW + 4, zone: zi });
    for (let j = 0; j < k; j++) items.push(aisle(), j < k - 1 ? { fill: 'park', rowsDown: true, rowsUp: true, h: 2 * ROW + 4, zone: zi } : { fill: 'bldg', use: z.use, D, floors: fl, rowsDown: true, walkDown: 15, walkUp: 0, h: ROW + 15 + D, zone: zi });
    items.push(aisle('service'));
    return { items, foot: gfa / fl };
  }
  if (z.use === 'amenity') { const area = (z.acres ? z.acres * 43560 : site * 0.14) * scale; items.push({ fill: 'commons', h: Math.max(170, area / W), items: z.items, zone: zi }, aisle()); return { items }; }
  if (z.use === 'multifamily') {
    const per = W * 0.72 * 60 * fl * 0.85 / P.unitSf, units = (z.units || per * 3) * scale, nb = Math.max(1, Math.round(units / per)), parkB = Math.max(0, Math.ceil((units * P.perUnit - nb * 2 * rowStalls * 0.9) / (2 * rowStalls)));
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
export function mixedOptions(plan, prog, opts = {}) {
  useParams(plan);
  const zones = prog.zones, site = S.ringArea(plan.ring), found = [];
  const hasCommons = zones.some(z => z.use === 'amenity'), pond = site * (prog.detentionPct ?? 10) / 100;
  const F = frameOf(plan, false), P = profile(F);
  // a small program on a big tract: build it on the part of the frontage it needs, keep the rest for a future phase
  const landNeed = zones.reduce((s, z) => s + (COMMERCIAL.includes(z.use) ? (z.gfa || 30000) / 0.22 : z.use === 'multifamily' ? (z.units || 200) / 20 * 43560 : z.use === 'townhomes' ? (z.units || 60) / 11 * 43560 : z.use === 'duplex' ? (z.units || 40) / 7 * 43560 : z.use === 'sfr' ? (z.units || 40) / 4.5 * 43560 : z.acres ? z.acres * 43560 : site * 0.12), 0) * 1.15 + pond;
  const span = F.X1 - F.X0, depth = P.b[1] - P.b[0], winW = landNeed < site * 0.65 ? Math.max(500, landNeed / depth * 1.1) : Infinity;
  const W = Math.min(P.width, winW) * 0.9;
  const orders = [zones.map((z, i) => i)], ci = zones.findIndex(z => z.use === 'amenity');
  if (ci > 0 && ci < zones.length - 1) { const o = zones.map((z, i) => i).filter(i => i !== ci); o.push(ci); orders.push(o); } // the commons at the back instead
  for (const order of orders) for (const pondAt of hasCommons ? ['none'] : ['back', 'front']) for (const frac of [0.5, 0.32, 0.68]) { let fits = 0; for (const scale of [1, 0.85, 0.7, 0.55, 0.4]) {
    if (fits >= 2) break;
    const zs = order.map(i => zones[i]); let items = [], fp = {}, un = {};
    let zl = zs.map((z, k) => { const r = zoneItems(z, order[k], k === 0, W, site, prog, scale); const fl = S.normalizeProgram({ use: z.use, floors: z.floors }).floors; if (COMMERCIAL.includes(z.use) && z.gfa) fp[order[k]] = z.gfa / fl; if (z.use === 'multifamily' && z.units) fp[order[k]] = z.units * 900 / 0.85 / fl; if (z.units && (z.use === 'townhomes' || z.use === 'duplex' || z.use === 'sfr')) un[order[k]] = z.units; /* the program itself, whatever the rows were scaled to */ return { z, zi: order[k], items: r.items }; });
    // too deep for the lot: zones of one row each share a row, side by side (never the street zone)
    const tall = () => zl.reduce((s, x) => s + x.items.reduce((t, it) => t + (it.t ? it.w : it.h), 0), 0) + 70 > P.b[1] - P.b[0] + 20;
    while (tall()) {
      let best = null;
      for (let k = 1; k + 1 < zl.length; k++) { const a = zl[k].items.filter(x => !x.t), b = zl[k + 1].items.filter(x => !x.t); if (a.length !== 1 || b.length !== 1 || a[0].parts || b[0].parts) continue; const save = Math.min(a[0].h, b[0].h); if (!best || save > best.save) best = { k, save, a: a[0], b: b[0] }; }
      if (!best) break;
      const need = q => { const z = zones[q.zone]; return z.use === 'multifamily' ? (z.units || 150) / 20 : z.use === 'townhomes' ? (z.units || 60) / 11 : z.use === 'sfr' ? (z.units || 40) / 4.5 : z.use === 'duplex' ? (z.units || 40) / 7 : z.acres || site * 0.12 / 43560; };
      const fa = Math.max(0.3, Math.min(0.7, need(best.a) / (need(best.a) + need(best.b)))), home = q => q.fill === 'homes' || q.fill === 'duplex' || q.fill === 'sfr';
      const blk = { fill: 'split', parts: [{ ...best.a, frac: fa }, { ...best.b, frac: 1 - fa }], h: Math.max(best.a.h, best.b.h), rowsDown: !!(best.a.rowsDown || best.b.rowsDown), rowsUp: !!(best.a.rowsUp || best.b.rowsUp), zone: best.a.zone };
      const ai = home(best.a) && home(best.b) ? { t: 'a', w: 26, kind: 'street' } : { t: 'a', w: AISLE, kind: 'aisle' };
      zl.splice(best.k, 2, { z: zl[best.k].z, zi: zl[best.k].zi, items: [blk, ai], merged: true });
    }
    zl.forEach(x => items.push(...x.items));
    const last = zl[zl.length - 1].merged ? { use: 'none' } : zs[zs.length - 1], zi = order[order.length - 1];
    items.push(last.use === 'multifamily' ? { fill: 'bldg', use: 'multifamily', D: +PAR.bldgDepth || 60, floors: S.normalizeProgram({ use: 'multifamily', floors: last.floors }).floors, rowsDown: true, h: ROW + WALK + (+PAR.bldgDepth || 60), zone: zi } : last.use === 'townhomes' ? { fill: 'homes', h: 45, zone: zi } : last.use === 'duplex' ? { fill: 'duplex', h: 65, zone: zi } : last.use === 'sfr' ? { fill: 'sfr', h: 11 + S.normalizeProgram({ use: 'sfr', lotD: last.lotD || prog.lotD }).lotD, zone: zi, prog: S.normalizeProgram({ use: 'sfr', homeMix: last.homeMix || prog.homeMix, lotD: last.lotD || prog.lotD }) } : { fill: 'none', h: 0, zone: zi });
    const blocks = items.filter(x => !x.t), aisles = items.filter(x => x.t).map(a => ({ w: a.w, kind: a.kind }));
    for (let i = 0; i < aisles.length; i++) { const lo = blocks[i], hi = blocks[i + 1]; if (aisles[i].kind === 'aisle' && ['homes', 'duplex', 'sfr'].includes(lo.fill) && ['homes', 'duplex', 'sfr'].includes(hi.fill)) Object.assign(aisles[i], lo.fill === 'homes' ? { kind: 'lane', w: 24 } : { kind: 'street', w: 26 }); }
    const seq = { blocks, aisles, pads: zones[order[0]].pads && COMMERCIAL.includes(zones[order[0]].use) };
    const win = winW < span * 0.85 ? (frac === 0.5 ? [F.X0 + (span - winW) / 2, F.X0 + (span + winW) / 2] : frac < 0.5 ? [F.X0, F.X0 + winW] : [F.X1 - winW, F.X1]) : null;
    const keep = win ? [box(-1e5, -1e5, win[0], 1e5), box(win[1], -1e5, 1e5, 1e5)] : [];
    const spineX = win ? (win[0] + win[1]) / 2 : F.X0 + span * frac, mixedProg = { ...prog, use: zones.some(z => z.use === 'multifamily') ? 'multifamily' : prog.use, pads: zones[order[0]].pads || 0 };
    const mo = { pond, keep, pondAt: win ? 'none' : pondAt, shift: 'bottom', entry: { w: 40, boulevard: true, at: spineX }, spineX, mixed: true, lake: hasCommons ? 'Amenity lake' : '', future: true,
      spec: { spineX, spineW: 32, footByZone: fp, unitsByZone: un, amenity: zones.some(z => z.use === 'multifamily' && (z.units || 100) >= 80) } }, a = attempt(plan, F, seq, mixedProg, mo);
    if (!a) continue; fits++;
    const els = toPlanEls(F, a.els), entry = els.find(e => e.name === 'Main entry');
    nameAll(els, entry ? [entry.x, entry.y] : S.centroid(plan.ring), { ...prog, unitSf: 900 });
    const fx = repair(plan, els), m = S.metrics({ ...plan, program: prog, elements: fx.els });
    // how much of each zone's program made it
    let got = 0, n = 0; for (const z of zones) { const B = fx.els.filter(e => e.kind === 'building' && e.use === z.use); if (z.use === 'amenity') continue; n++;
      const v = z.use === 'multifamily' || z.use === 'townhomes' || z.use === 'duplex' || z.use === 'sfr' ? B.reduce((s, e) => s + (e.units || 0), 0) : B.reduce((s, e) => s + e.w * e.d * (e.floors || 1), 0), t = z.units || z.gfa;
      got += t ? Math.min(1, v / t) - Math.max(0, v / t - 1.1) * 0.5 : Math.min(1, v / 1e5); }
    const short = Math.max(0, m.required - m.spaces);
    const sc = (got / Math.max(1, n)) * 1000 * scale ** 0.2 - short / Math.max(1, m.required) * 1500 - fx.bad.length * 500 - fx.cut * 40 + (hasCommons && fx.els.some(e => e.name === 'Amenity lake') ? 30 : 0);
    // zones as drawn: from the aisle before a zone's first block to the aisle after its last
    const zb = new Map(); // each zone's extent: rows from the aisle below to the aisle above, and its side for a shared row
    const AY = a.spec.aisles; a.spec.blocks.forEach((b, i) => { const y0 = i ? AY[i - 1].y : F.Y0 - 5, y1 = i < AY.length ? AY[i].y : F.Y1 + 5; for (const q of b.parts || [{ ...b, x0: -1e6, x1: 1e6 }]) { const e = zb.get(q.zone) || { y0, y1, x0: q.x0, x1: q.x1 }; e.y0 = Math.min(e.y0, y0); e.y1 = Math.max(e.y1, y1); zb.set(q.zone, e); } });
    const ext = [...zb.entries()].sort((p, q) => p[1].y0 - q[1].y0); if (ext.length) { ext[0][1].y0 = F.Y0 - 5; ext[ext.length - 1][1].y1 = F.Y1 + 5; }
    const zoneOut = ext.map(([zi, e], k) => { const T = r => r.map(([x, y]) => [y, x]), r = T(clipY(T(clipY(F.rr, e.y0, e.y1)), Math.max(-1e6, e.x0), Math.min(1e6, e.x1))); return r.length >= 3 ? { name: (ext.length > 1 ? (e.y0 < F.Y0 ? 'Front' : e.y1 > F.Y1 ? 'Back' : 'Middle') + ' — ' : '') + (zones[zi].name || ZONE_NAME[zones[zi].use]), use: zones[zi].use, ring: r.map(p => toPlan(F, p).map(fit)), acres: S.ringArea(r) / 43560 } : null; }).filter(Boolean);
    found.push({ recipe: { deep: false, seq, o: mo, prog: mixedProg }, els: fx.els, bad: fx.bad, score: sc, key: order.join('') + '|' + frac + '|' + pondAt, scale, zones: zoneOut, m, a, order, frac, win, pondAt });
  } }
  const ok = found.filter(f => !f.bad.length).sort((a, b) => b.score - a.score), pick = [];
  const N = opts.count || 3;
  for (const f of ok) if (pick.length < Math.min(3, N) && !pick.some(p => p.key === f.key || sig(p.els) === sig(f.els))) pick.push(f);
  for (const f of ok) if (pick.length < N && !pick.includes(f) && !pick.some(p => sig(p.els) === sig(f.els))) pick.push(f);
  const res = pick.map(f => {
    const notes = [], m = f.m;
    for (const z of zones) { if (z.use === 'amenity') continue; const B = f.els.filter(e => e.kind === 'building' && e.use === z.use), t = z.units || z.gfa; if (!t) continue;
      const v = z.units ? B.reduce((s, e) => s + (e.units || 0), 0) : Math.round(B.reduce((s, e) => s + e.w * e.d * (e.floors || 1), 0)); if (v < t * 0.97) notes.push(ZONE_NAME[z.use] + ': fits about ' + v.toLocaleString('en-US') + ' of ' + t.toLocaleString('en-US') + (z.units ? ' units.' : ' sq ft.')); }
    if (m.required > m.spaces) notes.push('Parking is ' + (m.required - m.spaces) + ' spaces short of ' + m.required + '.');
    const name = (f.win ? (f.frac === 0.5 ? 'Centred on the frontage' : f.frac < 0.5 ? 'Left end of the frontage' : 'Right end of the frontage') : f.frac === 0.5 ? 'Central boulevard' : 'Side entry') + (f.order.join('') !== zones.map((z, i) => i).join('') ? ' · commons at the back' : '');
    return { name: name + (f.pondAt === 'front' ? ' · pond at the entry' : ''), elements: f.els, notes, zones: f.zones, program: prog, phi: F.phi, score: f.score, recipe: f.recipe, sizes: sizesOf(f.els) };
  });
  return res.length >= 3 ? res : res.concat(fallback(plan, prog, 3 - res.length));
}

// the last resort when the planner can't find three good layouts: the earlier zone-band layouts, checked the same way
function fallback(plan, prog, n) {
  const out = [];
  for (let v = 0; v < 3 && out.length < n; v++) {
    let r; try { r = composeSite(plan, prog, v); } catch (e) { continue; }
    const els = r.elements.map(e => ({ ...e })), fx = repair(plan, els);
    if (fx.bad.length || !fx.els.some(e => e.kind === 'building')) continue;
    out.push({ name: ['Simple layout · parking in front', 'Simple layout · building at the street', 'Simple layout · parking beside'][v], elements: fx.els, notes: r.notes || [], zones: r.zones || [], program: r.program || prog, phi: r.phi, score: -1e9 });
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
export function refit(plan0) {
  const a = refitRecipe(plan0), pinned = (plan0.elements || []).filter(e => e.pinned);
  let b = null; if (!plan0.recipe?.prog?.zones && !S.normalizeProgram(plan0.program).zones) try { b = layoutOptions(plan0, plan0.program, { pinned, count: 1 })[0]; } catch (e) { b = null; }
  // the better of the two: no rule broken, enough parking, then the most units / floor area
  const pin = new Set(pinned.map(e => e.id)), rank = r => { if (!r) return -Infinity; const p = { ...plan0, elements: r.elements }, m = S.metrics(p), bad = S.check(p).filter(i => i.level === 'bad' && !pin.has(i.id)).length; return -bad * 1e9 - Math.max(0, m.required - m.spaces) * 1e6 + (m.units || 0) * 1000 + m.gfa / 100; };
  return rank(b) > rank(a) ? { elements: b.elements, notes: b.notes, recipe: b.recipe } : a;
}
function refitRecipe(plan0) {
  const plan = { ...plan0, setbacks: { ...S.SETBACKS, ...(plan0.setbacks || {}) } }, rc = plan.recipe; if (!rc) return null;
  useParams(plan);
  const prog = rc.prog ? S.normalizeProgram(rc.prog) : S.normalizeProgram(plan.program), F = frameOf(plan, rc.deep), toL = p => rot(p, -F.psi);
  const pinned = (plan.elements || []).filter(e => e.pinned), gap = e => e.kind === 'building' ? 14 : e.kind === 'pond' ? 12 : e.kind === 'lot' || e.kind === 'green' ? 0 : 4;
  const keepL = pinned.filter(e => gap(e) > 0 || e.kind === 'pond').map(e => (e.poly ? S.grow(e.poly, gap(e)) : e.path ? S.outline({ ...e, width: (e.width || 26) + 2 * gap(e) }) : S.corners({ ...e, w: e.w + 2 * gap(e), d: e.d + 2 * gap(e) })).map(toL));
  const pondHave = pinned.filter(e => e.kind === 'pond').reduce((s, e) => s + S.elArea(e), 0);
  const pt = tally(pinned, prog), o = { ...rc.o, xNeed: pt.need, xHave: pt.stalls + pt.garages, keep: (rc.o.keep || []).concat(keepL), pond: Math.max(0, (rc.o.pond || 0) - pondHave), spec: { ...(rc.o.spec || {}), ...(pinned.some(e => e.name === 'Clubhouse') ? { amenity: false } : {}) } };
  if (o.pond < 3000) o.pondAt = 'none';
  const a = attempt(plan, F, rc.seq, prog, o); if (!a) return null;
  const fresh = toPlanEls(F, a.els), all = fresh.concat(pinned.map(e => ({ ...e }))), entry = all.find(e => e.name === 'Main entry');
  nameAll(fresh, entry ? [entry.x, entry.y] : S.centroid(plan.ring), prog);
  const fx = repair(plan, all, new Set(pinned.map(e => e.id))), m = S.metrics({ ...plan, elements: fx.els }), notes = [];
  if (m.required > m.spaces) notes.push('Parking is ' + (m.required - m.spaces) + ' spaces short of ' + m.required + '.');
  if (fx.bad.length) notes.push(...fx.bad.map(i => i.text + '.'));
  return { elements: fx.els, notes };
}
