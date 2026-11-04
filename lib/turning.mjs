// Turning movements and fire-lane geometry on a drawn plan, for the independent check (lib/layoutcheck.mjs). Planning
// level, not a swept-path analysis: a declared design vehicle is reduced to its turning envelope (an inside radius Ri and
// an outside radius Ro: the inner rear wheel's path and the outer front corner's), and a turn passes when some centre
// lets the band Ri..Ro, swept through the turn's angle, stay on the paving as drawn (within TOL ft). That is the vehicle
// turning at its tightest; its band develops over the first and last quarter of the turn (at the turn's ends only the
// vehicle's own width on its outer path, as the inner wheels and a trailer cut in gradually), roughly as AASHTO's
// turning templates do. A multi-point turn is never assumed.
// Turn sites: every bend of a drive drawn along a path (its interior vertices, 20 degrees or more) and every inside
// corner where two square drives meet at right angles (an L or a T: an aisle meeting a drive, a connector meeting an
// aisle). Pure geometry, no clock, no randomness.
import * as S from './siteplan.mjs';

// design vehicles (feet). AASHTO Green Book (2018) Table 2-2a gives the minimum inside radius and the minimum design
// turning radius (the outer front wheel's path); about 1.5 ft of body overhang is added outside. Fire apparatus: the fire
// code's own figures (commonly 30 ft inside / 50 ft outside, a 20 ft clear width; IFC 503.2.1, 503.2.4, Appendix D103).
export const VEHICLES = {
  P: { label: 'Passenger car (P)', Ri: 14.4, Ro: 25.5, width: 7, source: 'AASHTO Green Book (2018) Table 2-2a: P, 14.4 ft minimum inside radius, 24 ft design turning radius, plus 1.5 ft body overhang' },
  FIRE: { label: 'Fire apparatus', Ri: 30, Ro: 50, clear: 20, width: 8.5, source: 'Local fire code governs; commonly 30 ft inside / 50 ft outside turning radius and 20 ft clear width (IFC 503.2.1, 503.2.4, Appendix D103)' },
  'SU-30': { label: 'Single-unit truck (SU-30)', Ri: 28.4, Ro: 43.5, source: 'AASHTO Green Book (2018) Table 2-2a: SU-30, 28.4 ft minimum inside radius, 42 ft design turning radius, plus 1.5 ft overhang' },
  'WB-67': { label: 'Interstate semitrailer (WB-67)', Ri: 7.9, Ro: 46.5, source: 'AASHTO Green Book (2018) Table 2-2a: WB-67, 7.9 ft minimum inside radius, 45 ft design turning radius, plus 1.5 ft overhang' }
};
export const DEFAULT_USE = { car: 'P', fire: 'FIRE', service: 'SU-30', truck: 'WB-67' }; // which vehicle checks which turns
export const TOL = 1;// ft a swept point may sit off the paving (a curb's lip, the drawing's rounding)
export const APPROACH = 30; // ft a drive must run on past a junction for a turn into the other to be one
export const STEM = 20; // ft the other drive must run past this one's side
export const DEAD_END = 150; // ft: a dead-end fire apparatus access road longer than this needs a turnaround (IFC 503.2.5, D103.4)

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, k) => [a[0] * k, a[1] * k];
const unit = v => { const L = Math.hypot(v[0], v[1]) || 1; return [v[0] / L, v[1] / L]; };
const cross = (a, b) => a[0] * b[1] - a[1] * b[0], dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const leftOf = h => [-h[1], h[0]], rightOf = h => [h[1], -h[0]];
const rotv = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
function lineX(p, u, q, v) { const den = cross(u, v); if (Math.abs(den) < 1e-9) return null; const t = cross(sub(q, p), v) / den; return add(p, mul(u, t)); }
function segDist(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
function inPoly(p, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
const bboxOf = r => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, y] of r) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; } return [a, b, c, d]; };
export const onPave = (p, polys) => polys.some(({ r, bb }) => p[0] >= bb[0] - TOL && p[0] <= bb[2] + TOL && p[1] >= bb[1] - TOL && p[1] <= bb[3] + TOL && (inPoly(p, r) || r.some((a, i) => segDist(p, a, r[(i + 1) % r.length]) <= TOL)));

// a piece's paving outline as drawn (a drive along a path: its filleted band)
function paveOf(e) { try { const r = e.path?.length >= 2 && !e.poly ? S.outline(e) : S.shapeOf(e); return r?.length >= 3 ? r : null; } catch { return null; } }
// a square drive's frame: centre, long axis, length and width
function rectFrame(e) {
  if (e.poly || e.path || !(+e.w > 0 && +e.d > 0)) return null;
  const a = (e.rot || 0) * Math.PI / 180, ux = [Math.cos(a), Math.sin(a)], uy = [-Math.sin(a), Math.cos(a)];
  return e.w >= e.d ? { c: [e.x, e.y], ax: ux, n: uy, L: +e.w, W: +e.d } : { c: [e.x, e.y], ax: uy, n: mul(ux, -1), L: +e.d, W: +e.w };
}

// the turn sites of a set of drive pieces: [{ at (the inside corner), u1 (heading in), u2 (heading out), s (+1 left,
// -1 right), theta (radians), pieces: [ids], where: [x, y] }]
export function turnSites(drives, idOf = e => e.id) {
  const out = [], seen = new Set(), key = p => Math.round(p[0] / 4) + ',' + Math.round(p[1] / 4), ang = v => Math.round((Math.atan2(v[1], v[0]) * 180 / Math.PI + 360) % 360 / 15);
  // (a turn and the same turn driven the other way sweep the same corner: one site, keyed by the corner and its two edges)
  const push = t => { const k = key(t.at) + '|' + [ang(mul(t.u1, -1)), ang(t.u2)].sort((a, b) => a - b).join(','); if (seen.has(k)) return; seen.add(k); out.push(t); };
  // bends of drives drawn along a path
  for (const e of drives) {
    if (!(e.path?.length >= 3) || e.poly || e.closed || e.rb) continue; const P = e.path, w = +e.width || 24;
    for (let i = 1; i < P.length - 1; i++) {
      const u1 = unit(sub(P[i], P[i - 1])), u2 = unit(sub(P[i + 1], P[i])), s = cross(u1, u2) >= 0 ? 1 : -1, th = Math.acos(Math.max(-1, Math.min(1, dot(u1, u2))));
      if (th < 20 * Math.PI / 180) continue;
      const nIn = s > 0 ? leftOf : rightOf, at = lineX(add(P[i], mul(nIn(u1), w / 2)), u1, add(P[i], mul(nIn(u2), w / 2)), u2) || P[i];
      push({ at, u1, u2, s, theta: th, pieces: [idOf(e)], where: P[i] });
    }
  }
  // inside corners where two square drives meet at right angles
  const R = drives.map(e => ({ e, f: rectFrame(e) })).filter(q => q.f);
  for (const A of R) for (const B of R) {
    if (A === B || Math.abs(dot(A.f.ax, B.f.ax)) > 0.05) continue;
    const loc = p => { const v = sub(p, A.f.c); return [dot(v, A.f.ax), dot(v, A.f.n)]; }, wor = ([x, y]) => add(A.f.c, add(mul(A.f.ax, x), mul(A.f.n, y)));
    const bc = loc(B.f.c), bx0 = bc[0] - B.f.W / 2, bx1 = bc[0] + B.f.W / 2, by0 = bc[1] - B.f.L / 2, by1 = bc[1] + B.f.L / 2, ha = A.f.W / 2, la = A.f.L / 2;
    if (bx1 < -la - 1 || bx0 > la + 1) continue; // (B beside A's ends, not on it)
    for (const side of [1, -1]) { // B leaves A on its +n side (up) or its -n side (down)
      const reach = side > 0 ? by1 > ha + STEM && by0 <= ha + 1 : by0 < -ha - STEM && by1 >= -ha - 1; if (!reach) continue; // (B runs on at least STEM ft past A's side: an entrance's short stem from the street counts)
      const out2 = mul(A.f.n, side), edge = side * ha;
      // (only where A runs on at least APPROACH ft past B: a stub of A beyond B's side is no way in)
      if (bx0 > -la + APPROACH) push({ at: wor([bx0, edge]), u1: A.f.ax, u2: out2, s: side, theta: Math.PI / 2, pieces: [idOf(A.e), idOf(B.e)], where: wor([bx0, edge]) }); // (along A in +ax, then into B)
      if (bx1 < la - APPROACH) push({ at: wor([bx1, edge]), u1: mul(A.f.ax, -1), u2: out2, s: -side, theta: Math.PI / 2, pieces: [idOf(A.e), idOf(B.e)], where: wor([bx1, edge]) }); // (along A in -ax, then into B)
    }
  }
  return out;
}

// does a vehicle (Ri, Ro) make the turn on the paving? { ok, centre } — the band Ri..Ro swept through the turn about some
// centre c = at - a u1 + b u2 (a, b from -6 to Ro + 12 ft, every 2 ft) stays on the paving (within TOL)
export function turnFits(t, veh, polys) {
  const near = polys.filter(q => q.bb[0] <= t.at[0] + veh.Ro + 40 && q.bb[2] >= t.at[0] - veh.Ro - 40 && q.bb[1] <= t.at[1] + veh.Ro + 40 && q.bb[3] >= t.at[1] - veh.Ro - 40);
  // (the band develops over the first and last quarter of the turn: at its ends only the vehicle's own width on the
  // outer path, the inner wheels cutting in, or the trailer offtracking, building to the full Ri..Ro by a quarter in)
  const steps = Math.max(4, Math.round(t.theta / (Math.PI / 12))), out = t.s > 0 ? rightOf : leftOf, vw = veh.width || 8.5;
  const pts = []; for (let k = 0; k <= steps; k++) { const f = k / steps, g = Math.min(1, Math.min(f, 1 - f) / 0.25), ri = veh.Ro - vw - (veh.Ro - vw - veh.Ri) * g, h = rotv(t.u1, t.s * t.theta * f), o = out(h); for (const q of [0, 0.25, 0.5, 0.75, 1]) pts.push(mul(o, ri + (veh.Ro - ri) * q)); }
  // (the extreme radii first: a failing centre is found out in a point or two)
  pts.sort((p, q) => Math.abs(Math.hypot(...q) - (veh.Ri + veh.Ro) / 2) - Math.abs(Math.hypot(...p) - (veh.Ri + veh.Ro) / 2));
  for (let a = -6; a <= veh.Ro + 12; a += 2) for (let b = -6; b <= veh.Ro + 12; b += 2) {
    const c = add(t.at, add(mul(t.u1, -a), mul(t.u2, b))); let ok = true;
    for (const p of pts) if (!onPave(add(c, p), near)) { ok = false; break; }
    if (ok) return { ok: true, centre: c };
  }
  return { ok: false, centre: null };
}

// the paving a vehicle may use: drives, truck courts and parking fields' aisles as drawn (not stalls: a parked car is
// in the way), as [{ r, bb }]
export function pavingOf(els, { stalls = false } = {}) {
  return els.filter(e => e.kind === 'drive' || e.kind === 'truck' || stalls && e.kind === 'parking').map(paveOf).filter(Boolean).map(r => ({ r, bb: bboxOf(r) }));
}

// drive pieces that are parking aisles: a parking row runs along one (within 3 ft, along at least 40% of the row)
export function aisleIds(els, idOf = e => e.id) {
  const rows = els.filter(e => e.kind === 'parking' && !e.poly && +e.w > 0 && +e.d > 0), out = new Set();
  for (const d of els.filter(e => e.kind === 'drive' && !e.entry && !e.emergency && !e.poly && !e.path)) {
    const f = rectFrame(d); if (!f) continue;
    for (const r of rows) { const g = rectFrame(r); if (!g || Math.abs(Math.abs(dot(f.ax, g.ax)) - 1) > 0.02) continue;
      const v = sub(g.c, f.c), along = dot(v, f.ax), across = Math.abs(dot(v, f.n)); if (Math.abs(across - (f.W + g.W) / 2) > 3) continue;
      const ov = Math.min(f.L / 2, along + g.L / 2) - Math.max(-f.L / 2, along - g.L / 2); if (ov >= 0.4 * g.L) { out.add(idOf(d)); break; } }
  }
  return out;
}
// the street beside the site's street edges, as paving a turn may use: STREET_LANES ft out from each street edge (the
// near travel lane and its gutter; a vehicle turning in off the street swings through it)
export const STREET_LANES = 24;
export function streetPaving(ring, edges) {
  const n = ring.length, cx = ring.reduce((t, p) => t + p[0], 0) / n, cy = ring.reduce((t, p) => t + p[1], 0) / n;
  return edges.filter(k => k != null && k >= 0 && k < n).map(k => { const a = ring[k], b = ring[(k + 1) % n], u = unit(sub(b, a)); let o = [u[1], -u[0]]; const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (dot(o, [m[0] - cx, m[1] - cy]) < 0) o = mul(o, -1);
    const ext = 60, r = [add(a, mul(u, -ext)), add(b, mul(u, ext)), add(add(b, mul(u, ext)), mul(o, STREET_LANES)), add(add(a, mul(u, -ext)), mul(o, STREET_LANES))]; return { r, bb: bboxOf(r) }; });
}
// a drive piece's clear width (null where it isn't a strip: an entrance drawn as an outline with its curb returns). A
// short piece crossed the long way (a garage's 24 ft apron 8 ft deep) is as wide as it is long.
export function clearWidth(e) { if (e.path?.length >= 2 && !e.poly) return +e.width || null; if (e.poly) return null; if (!(+e.w > 0 && +e.d > 0)) return null; const a = Math.min(+e.w, +e.d), b = Math.max(+e.w, +e.d); return a < 20 && b <= 40 ? b : a; }
// one-way lanes that aren't fire lanes (a drive-thru's queue and its bypass)
export const oneWayLane = e => e.oneWay || /drive-?thru|bypass|one[- ]way/i.test((e.name || '') + ' ' + (e.note || ''));
// the fire route: the drives of the network that aren't parking aisles or one-way lanes
export function fireRoute(drives, els, idOf = e => e.id) { const aisle = aisleIds(els, idOf); return drives.filter(e => !aisle.has(idOf(e)) && !oneWayLane(e)); }
// dead ends of a drive network: runs from a piece that meets only one other (not an entrance, not a turnaround) back to
// the first junction, longer than DEAD_END, with no turnaround at the end: [{ id, length }]. The network is every drive
// (parking aisles included: they join the loops); only runs that end on the fire route (onRoute) are reported (a parking
// aisle that stops at a row's end isn't a fire apparatus road)
export function deadEnds(drives, touch, idOf = e => e.id, isEntry = e => !!e.entry, onRoute = () => true) {
  const adj = new Map(drives.map(e => [e, drives.filter(o => o !== e && touch(e, o))])), turnaround = e => !!(e.bulb || e.turn || e.rb || e.closed || e.loop || e.kind === 'truck');
  const out = [];
  for (const leaf of drives) {
    if (adj.get(leaf).length !== 1 || isEntry(leaf) || turnaround(leaf) || leaf.emergency || !onRoute(leaf)) continue;
    let L = runLength(leaf), prev = leaf, cur = adj.get(leaf)[0];
    while (cur && adj.get(cur).length === 2 && !isEntry(cur) && !turnaround(cur) && L <= DEAD_END + 1) { L += runLength(cur); const nx = adj.get(cur).find(o => o !== prev); prev = cur; cur = nx; }
    if (L > DEAD_END + 0.5) out.push({ id: idOf(leaf), length: Math.round(L) });
  }
  return out;
}
// a curb return at a turn's inside corner: the paving between the two inner edges and an arc of radius R tangent to
// both (a 90 degree turn; R the design vehicle's inside radius), as an outline
export function curbReturn(t, R) {
  const P1 = add(t.at, mul(t.u1, -R)), P2 = add(t.at, mul(t.u2, R)), C = add(t.at, add(mul(t.u1, -R), mul(t.u2, R))), a1 = Math.atan2(P1[1] - C[1], P1[0] - C[0]), a2 = Math.atan2(P2[1] - C[1], P2[0] - C[0]);
  let da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  const arc = Array.from({ length: 9 }, (_, k) => { const a = a1 + da * k / 8; return [C[0] + R * Math.cos(a), C[1] + R * Math.sin(a)]; });
  return [t.at, ...arc].map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]);
}
// a strip's length along its run
export function runLength(e) { if (e.path?.length >= 2 && !e.poly) { let L = 0; for (let i = 1; i < e.path.length; i++) L += Math.hypot(e.path[i][0] - e.path[i - 1][0], e.path[i][1] - e.path[i - 1][1]); return L; } if (e.poly) { const b = bboxOf(e.poly); return Math.max(b[2] - b[0], b[3] - b[1]); } return Math.max(+e.w || 0, +e.d || 0); }
