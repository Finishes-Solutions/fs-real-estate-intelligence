// Gas stations and convenience stores, laid out the way a fuel retailer draws one: the canopy over the pump islands
// between the store and the busier street, running along it; drive lanes all round the canopy wide enough to queue at
// the pumps (26 ft in front, 28 behind where the store's parking backs out, 30 at its ends); the store behind, facing
// the canopy across a row of parking along its front; the underground tanks under a pad beside an end lane, where the
// fuel truck pulls up on a straight run of drive; air / vacuum stalls; and a car wash tunnel beside the store with its
// stacking lane (the restaurants' drive-thru lane in lib/sitelayout.mjs is the model).
//
// Driveways: on a corner lot one on each street, each kept back from the intersection as far as the frontage allows
// (100 ft or more where it can be); on an inside lot one or two on the front, lined up with the canopy's end lanes.
// A truck stop or travel center is laid out as the car version (the program says so).
//
// Works in the turned frame lib/sitelayout.mjs uses (street at the bottom, x along it) and is called from its
// layoutCore() with the helpers it needs (H), so the two share one way of fitting bands between the setbacks.
import * as S from './siteplan.mjs';

const ROW = 18, SW = 9, rot = S.rotPt;
const rectL = (x0, y0, x1, y1) => ({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, d: y1 - y0 });
const covers = (sp, a, b) => sp.some(([p, q]) => p <= a + 0.01 && q >= b - 0.01);
const f0 = v => Math.round(v).toLocaleString('en-US');

// ---------- the corner ----------
// The street edges a lot has besides the one a frame puts at the bottom, and the corner: where the line of the front
// meets the line of the nearest side street (a clipped corner: the point the two streets' lot lines aim at, not the
// clip). null on an inside lot.
export function cornerOf(plan, front = plan.front) {
  const ring = plan.ring, n = ring.length, rules = S.edgeRules(ring, plan.front, plan.setbacks, plan.streets), f = front ?? S.longestEdge(ring);
  const isStreet = k => rules[k].role === 'front' || rules[k].street, nf = S.outwardOf(ring, f);
  const fronts = ring.map((_, k) => k).filter(k => isStreet(k) && (k === f || S.outwardOf(ring, k)[0] * nf[0] + S.outwardOf(ring, k)[1] * nf[1] > 0.8));
  const sides = ring.map((_, k) => k).filter(k => isStreet(k) && !fronts.includes(k) && S.edgeLen(ring, k) >= 40);
  if (!sides.length) return null;
  const P = (k, i) => ring[(k + i) % n], gap = k => Math.min(...fronts.flatMap(j => [0, 1].flatMap(a => [0, 1].map(b => Math.hypot(P(j, a)[0] - P(k, b)[0], P(j, a)[1] - P(k, b)[1])))));
  const side = sides.slice().sort((a, b) => gap(a) - gap(b))[0], near = fronts.slice().sort((a, b) => Math.min(...[0, 1].map(i => Math.hypot(P(a, i)[0] - P(side, 0)[0], P(a, i)[1] - P(side, 0)[1]), ...[0, 1].map(i => Math.hypot(P(a, i)[0] - P(side, 1)[0], P(a, i)[1] - P(side, 1)[1])))) - Math.min(...[0, 1].map(i => Math.hypot(P(b, i)[0] - P(side, 0)[0], P(b, i)[1] - P(side, 0)[1]), ...[0, 1].map(i => Math.hypot(P(b, i)[0] - P(side, 1)[0], P(b, i)[1] - P(side, 1)[1])))))[0];
  // where the two lines cross
  const a = P(near, 0), b = P(near, 1), c = P(side, 0), d = P(side, 1), den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  let at; if (Math.abs(den) < 1e-6) at = [a, b].flatMap(p => [c, d].map(q => [p, q])).sort((u, v) => Math.hypot(u[0][0] - u[1][0], u[0][1] - u[1][1]) - Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]))[0][0];
  else { const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den; at = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
  return { at, fronts, sides, side, front: near };
}

// ---------- the frame ----------
// The layout's frame with the canopy's street at the bottom: the front ('front'), or a side street ('side') with the
// lot's own setbacks kept (the edges keep their roles: only the drawing turns). side: which way (+1 / -1 along x) the
// other street lies, 0 on an inside lot.
export function frameFor(plan, orient, corner, H) {
  let F;
  if (orient === 'side') { F = H.frameOf({ ...plan, front: corner.side }, false, 'front'); const R = S.edgeRules(plan.ring, plan.front, plan.setbacks, plan.streets);
    Object.assign(F, { rules: R, build: R.map(r => Math.max(0.5, r.build)), pave: R.map(r => Math.max(0.5, r.pave)), paveF: R.map(r => Math.max(0.5, r.pave)), cache: new Map(), front: corner.side }); }
  else F = H.frameOf(plan, false, 'front');
  const other = corner ? (orient === 'side' ? corner.fronts : corner.sides) : [], n = F.rr.length, cx = (F.X0 + F.X1) / 2;
  const xs = other.map(k => (F.rr[k][0] + F.rr[(k + 1) % n][0]) / 2 - cx), ys = other.map(k => (F.rr[k][1] + F.rr[(k + 1) % n][1]) / 2);
  F.side = xs.length ? Math.sign(xs[ys.indexOf(Math.min(...ys))]) || 1 : 0; F.orient = orient;
  return F;
}

// ---------- one arrangement ----------
// c: { pumps, rows, sd (store depth), shift ('mid' | 'lo' | 'hi': where the canopy sits along the frontage), wash, tight (a small lot:
// 24 ft lanes, 26 at the canopy's ends, an 8 ft walk) }. Returns frame-feet pieces and what they hold, or null when they don't fit.
// A re-fit (pieces placed by hand, see pinsOf): F.fixC / F.fixS, the canopy's or the store's outline in the frame where
// it was put (the rest goes round it: the canopy's lanes, the store behind it, or the canopy between the store and the
// street); F.obst, what else stays, kept clear of; F.obstPark, what only the parking keeps clear of (a driveway placed by
// hand, the tank pad).
function place(F, prog, c, H) {
  const ob = F.obst || [], obP = ob.concat(F.obstPark || []), spans = (G, a, b, k, o = []) => H.spans(G, a, b, k, o.concat(ob)), spansP = (G, a, b, k, o = []) => H.spans(G, a, b, k, o.concat(obP));
  const fp = prog.fuel, fc = F.fixC, fs = F.fixS, cv = fc ? { pumps: c.pumps, rows: c.rows, per: Math.ceil(c.pumps / c.rows), w: fc.x1 - fc.x0, d: fc.y1 - fc.y0 } : S.canopyOf(c.pumps, c.rows);
  const L1 = c.tight ? 24 : S.FUEL.lane, L2 = c.tight ? 24 : S.FUEL.back, Le = c.tight ? 26 : S.FUEL.endLane, WALK = c.tight ? 8 : 10, need = cv.w + 2 * Le;
  // the front lane as near the street as the landscape buffer lets it
  let y0m = null; for (let y = Math.floor(F.Y0); y < F.Y1 - 120; y += 1) if (spans(F, y, y + L1, 'pave').some(([p, q]) => q - p >= need)) { y0m = y; break; }
  let y0, y1, y2, y3;
  if (fc) { y1 = fc.y0; y0 = y1 - L1; y2 = fc.y1; y3 = y2 + L2; } // the canopy where it was put: its lanes round it
  else if (fs) { y3 = fs.y0 - WALK - ROW; y2 = y3 - L2; y1 = y2 - cv.d; y0 = y1 - L1; if (y0m == null || y0 < y0m - 0.01) return null; } // between the store and the street
  else { if (y0m == null) return null; y0 = y0m; y1 = y0 + L1; y2 = y1 + cv.d; y3 = y2 + L2; }
  const y4 = fs ? fs.y0 : y3 + ROW + WALK, y5 = fs ? fs.y1 : y4 + c.sd;
  const ringSp = spans(F, y0, y3, 'pave').filter(([p, q]) => q - p >= need).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])); if (!ringSp.length) return null;
  const [p, q] = ringSp[0], room = q - p - need, toCorner = F.side || 1; // ('lo': toward the corner's far side, 'hi': toward the corner)
  let xa;
  if (fc) { xa = fc.x0 - Le; if (!covers(ringSp, xa, xa + need)) return null; } // no room for its lanes where it is
  else if (fs) { const sc = (fs.x0 + fs.x1) / 2; xa = ringSp.map(([a, b]) => Math.max(a, Math.min(b - need, sc - need / 2))).sort((u, v) => Math.abs(u + need / 2 - sc) - Math.abs(v + need / 2 - sc))[0]; if (Math.abs(xa + need / 2 - sc) > cv.w / 2 + 40) return null; }
  else xa = c.shift === 'mid' ? p + room / 2 : (c.shift === 'hi') === (toCorner > 0) ? q - need : p;
  const cx0 = xa + Le, cx1 = cx0 + cv.w, xb = cx1 + Le, cc = (cx0 + cx1) / 2;
  if (!fc && !covers(spans(F, y1, y2, 'build'), cx0, cx1)) return null; // the canopy inside the building lines
  // the store, facing the canopy across its parking: centred on it, else as near as the building lines let it (one
  // placed by hand stays; one turned out of line with the canopy keeps its own way, and the drives go round it)
  let sx0, sx1;
  if (fs) { sx0 = fs.x0; sx1 = fs.x1; } else if (F.haveStore) { sx0 = cx0; sx1 = cx1; } else {
    const sw = fp.storeSf / c.sd, stSp = spans(F, y4, y5, 'build').filter(([a, b]) => b - a >= sw); if (!stSp.length) return null;
    sx0 = stSp.map(([a, b]) => Math.max(a, Math.min(b - sw, cc - sw / 2))).sort((u, v) => Math.abs(u + sw / 2 - cc) - Math.abs(v + sw / 2 - cc))[0]; sx1 = sx0 + sw;
    if (Math.abs((sx0 + sx1) / 2 - cc) > cv.w / 2 + (fc ? 80 : 40)) return null; // a store that doesn't face its canopy
  }
  const back = spans(F, y2, y3, 'pave').find(([a, b]) => a <= xa + 0.01 && b >= xb - 0.01); if (!back) return null;
  const els = [], meta = { cv, y0, y1, y2, y3, y4, y5, xa, xb, cx0, cx1, sx0, sx1, shift: c.shift, gap: y0m == null ? 0 : Math.max(0, y0 - y0m), notes: [] };
  // the car wash beside the store (the side away from the corner first), its stacking lane round the back of the tunnel
  let wash = null;
  if (c.wash) for (const side of F.side > 0 ? [-1, 1] : [1, -1]) for (const wl of [S.FUEL.washLen, 90, 70]) {
    const ww = S.FUEL.washW, gap = 14, lane = S.FUEL.stackW, t0 = side < 0 ? sx0 - gap - ww : sx1 + gap, t1 = t0 + ww, lx = side < 0 ? t0 - 3 - lane / 2 : t1 + 3 + lane / 2;
    const ty0 = y3 + 6, ty1 = ty0 + wl, top = ty1 + 6 + lane / 2, tc = (t0 + t1) / 2, lo = Math.min(lx - lane / 2, t0) - 1, hi = Math.max(lx + lane / 2, t1) + 1;
    if (!covers(spans(F, ty0, ty1, 'build'), t0, t1) || !covers(spans(F, y3, top + lane / 2 + 1, 'pave'), lo, hi) || !covers([back], lo, hi)) continue;
    wash = { t0, t1, ty0, ty1, lx, tc, top, lo, hi, wl, side }; break;
  }
  if (c.wash && !wash) return null;
  if (c.wash && F.haveStore && !fs) return null; // (a store turned out of line: no car wash laid out beside it)
  // drives: the front lane, the end lanes, the back lane (on to the side street, and past the store and wash)
  let bx0 = Math.min(xa, sx0 - 12, wash ? wash.lo : Infinity), bx1 = Math.max(xb, sx1 + 12, wash ? wash.hi : -Infinity);
  if (F.haveStore && !fs) { bx0 = Math.min(xa, wash ? wash.lo : Infinity); bx1 = Math.max(xb, wash ? wash.hi : -Infinity); }
  if (F.side > 0) bx1 = back[1]; else if (F.side < 0) bx0 = back[0];
  bx0 = Math.max(bx0, back[0]); bx1 = Math.min(bx1, back[1]);
  els.push({ kind: 'drive', ...rectL(xa, y0, xb, y1), name: '', note: L1 + ' ft drive lane', fuelLane: 'front' },
    { kind: 'drive', ...rectL(xa, y0, cx0, y3), name: '', note: Le + ' ft drive lane', fuelLane: 'end' }, { kind: 'drive', ...rectL(cx1, y0, xb, y3), name: '', note: Le + ' ft drive lane', fuelLane: 'end' }, /* (the end lanes run on into the lanes they join) */
    { kind: 'drive', ...rectL(bx0, y2, bx1, y3), name: '', note: L2 + ' ft drive lane', fuelLane: 'back' });
  if (!fc) els.push({ kind: 'canopy', ...rectL(cx0, y1, cx1, y2), name: 'Fuel canopy', note: cv.rows + ' row' + (cv.rows > 1 ? 's' : '') + ' of ' + cv.per + ' pumps', pumps: c.pumps, rows: cv.rows });
  if (!F.haveStore) els.push({ kind: 'building', ...rectL(sx0, y4, sx1, y5), use: 'fuel', fuel: 'store', floors: 1, name: 'C-store', note: 'Convenience store' });
  if (wash) {
    const lane = S.FUEL.stackW, path = [[wash.lx, y3 - 3], [wash.lx, wash.top], [wash.tc, wash.top], [wash.tc, wash.ty1 + 0.6]];
    els.push({ kind: 'building', ...rectL(wash.t0, wash.ty0, wash.t1, wash.ty1), use: 'fuel', fuel: 'wash', floors: 1, name: 'Car wash', note: (wash.wl >= 90 ? 'Express tunnel · ' : 'In-bay wash · ') + wash.wl + ' ft', nowalk: true },
      { kind: 'drive', path, width: lane, r: 10, name: '', note: 'Drive-thru lane', wash: true });
  }
  // parking along the store front, facing the back lane (not in front of the car wash or its lane), trimmed to what the store needs
  const need0 = Math.ceil(fp.storeSf / 1000 * (prog.ratio ?? S.USES.fuel.ratio) - 0.01), bx = (a, b) => ({ p: [[a, y3 - 1], [b, y3 - 1], [b, y3 + ROW + 1], [a, y3 + ROW + 1]], g: 0 });
  const obstRow = (wash ? [bx(wash.lo - 3, wash.hi + 3)] : []).concat(F.side > 0 ? [bx(bx1 - 58, bx1 + 1)] : F.side < 0 ? [bx(bx0 - 1, bx0 + 58)] : []); // (and none at the mouth of the other street's driveway)
  const rowSp = spansP(F, y3, y3 + ROW, 'pave', obstRow).map(([a, b]) => [Math.max(a, bx0), Math.min(b, bx1)]).filter(([a, b]) => b - a >= 4 * SW);
  const want = need0 + S.adaLoss(need0 + 4) + 2, rows = [];
  // the stalls nearest the store's door first: a run centred on the store, as long as the parking needs
  for (const [a, b] of rowSp.sort((u, v) => Math.abs((u[0] + u[1]) / 2 - (sx0 + sx1) / 2) - Math.abs((v[0] + v[1]) / 2 - (sx0 + sx1) / 2))) {
    const have = rows.reduce((t, r) => t + r.n, 0); if (have >= want) break;
    const n = Math.min(Math.floor((b - a) / SW), want - have + (have ? 0 : 0)), L = Math.max(4, n) * SW; if (n < 4) continue;
    const mid = Math.max(a + L / 2, Math.min(b - L / 2, (sx0 + sx1) / 2)); rows.push({ x0: mid - L / 2, x1: mid + L / 2, n });
  }
  for (const r of rows) els.push({ kind: 'parking', ...rectL(r.x0, y3, r.x1, y3 + ROW), row: -1, lock: true, islands: false, caps: false });
  // beside the end lanes, outside the ring: the tank pad (away from the corner first), the air / vacuum stalls, then more parking
  const outer = [], sideOrder = F.side > 0 ? [-1, 1] : F.side < 0 ? [1, -1] : [-1, 1];
  for (const sd of sideOrder) { const xl = sd < 0 ? xa : xb; outer.push({ sd, xl, used: [] }); }
  const fitsOuter = (o, D, ya, yb) => { const x0 = o.sd < 0 ? o.xl - D : o.xl, x1 = o.sd < 0 ? o.xl : o.xl + D; return covers(spansP(F, ya, yb, 'pave'), x0, x1) && !o.used.some(([u, v]) => ya < v + 4 && yb > u - 4) ? [x0, x1] : null; };
  let tank = F.haveTank ? true : null; // (a pad placed by hand stays where it is)
  for (const o of outer) { if (tank) break; const T = S.FUEL.tankW, D = S.FUEL.tankD;
    for (const [ya, yb] of [[(y1 + y2) / 2 - T / 2, (y1 + y2) / 2 + T / 2], [y3 - T, y3], [y1, y1 + T], [y2 - T / 2, y2 + T / 2]]) { const x = fitsOuter(o, D, ya, yb); if (x) { tank = { kind: 'tanks', ...rectL(x[0], ya, x[1], yb), name: 'Fuel tanks', note: '3 underground tanks · keep clear for the fuel truck' }; o.used.push([ya, yb]); break; } } }
  if (!tank) for (const sd of sideOrder) { // a narrow lot: under the end lane itself (drives pass over tanks; parking never does)
    const T = S.FUEL.tankW, W = Le - 2, x0 = sd < 0 ? xa + 1 : xb - 1 - W, ya = (y1 + y2) / 2 - T / 2; if (W < 20) break;
    tank = { kind: 'tanks', ...rectL(x0, ya, x0 + W, ya + T), name: 'Fuel tanks', note: '3 underground tanks under the end lane · keep clear for the fuel truck' }; break; }
  if (!tank) return null; // no pad the fuel truck can pull up to: not a gas station
  if (tank !== true) els.push(tank);
  let vac = 0;
  if (fp.vac) for (const o of outer) { if (vac) break; const n = S.FUEL.vac, h = n * SW;
    for (const [ya, yb] of [[y3 - h, y3], [y1, y1 + h], [(y1 + y2) / 2 - h / 2, (y1 + y2) / 2 + h / 2]]) { const x = fitsOuter(o, ROW, ya, yb); if (x) { els.push({ kind: 'parking', x: (x[0] + x[1]) / 2, y: (ya + yb) / 2, w: h, d: ROW, rotL: 90, row: o.sd < 0 ? -1 : 1, lock: true, islands: false, vac: true, name: '', note: 'Air / vacuum' }); o.used.push([ya, yb]); vac = n; break; } } }
  let have = rows.reduce((t, r) => t + r.n, 0);
  if (have < want) for (const o of outer) { // more parking along the end lanes (the stretch beside the canopy)
    const ya0 = y1 + 2, yb0 = y3; let a = ya0; for (const [u, v] of o.used.slice().sort((p1, p2) => p1[0] - p2[0]).concat([[yb0 + 4, yb0 + 4]])) { const b = Math.min(u - 4, yb0), n = Math.min(Math.floor((b - a) / SW), want - have);
      if (n >= 4) { const h = n * SW, x = fitsOuter(o, ROW, a, a + h); if (x) { els.push({ kind: 'parking', x: (x[0] + x[1]) / 2, y: a + h / 2, w: h, d: ROW, rotL: 90, row: o.sd < 0 ? -1 : 1, lock: true, islands: false }); o.used.push([a, a + h]); have += n; } }
      a = Math.max(a, v + 4); if (have >= want) break; } }
  if (fp.vac && !vac) meta.notes.push('No room left for the air / vacuum stalls.');
  Object.assign(meta, { stalls: have, need: need0, vac, wash: !!wash, tank: !!tank });
  return { els, meta };
}

// ---------- the entrances ----------
// Driveways (30 ft, two-way) in plan feet once the pieces are placed: on the front, the far end lane from the corner (an
// inside lot: both end lanes when the frontage takes two 120 ft apart); on a corner lot one on the side street too,
// each as far from the corner as it can be while it still comes straight into a lane. Returns { els, ents, notes }.
function entrances(plan, els, corner, F, meta, prog, pinned = []) {
  const ring = plan.ring, n = ring.length, rules = S.edgeRules(ring, plan.front, plan.setbacks, plan.streets), toL = p => rot(p, -F.psi), W = 30;
  const edgeOf = e => { const c = S.centroid(S.shapeOf(e)); return ring.map((a, k) => [k, S.segDist(c, a, ring[(k + 1) % n])]).sort((u, v) => u[1] - v[1])[0][0]; };
  const held = new Set(S.entrancesOf(pinned).map(edgeOf)); // a street with a driveway placed by hand gets no other
  const fronts = ring.map((_, k) => k).filter(k => rules[k].role === 'front'), sides = corner ? corner.sides : [];
  const dist = p => corner ? Math.hypot(p[0] - corner.at[0], p[1] - corner.at[1]) : Infinity;
  const cands = (edges, maxDepth) => { const out = [];
    for (const k of edges) { const a = ring[k], b = ring[(k + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = W / 2 + 22; t <= L - W / 2 - 22; t += 4) { const p = [a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L], e0 = S.entranceAt({ ...plan, elements: els }, p, { W, slide: 0, els }); if (e0 && e0.depth <= maxDepth) out.push({ ...e0, k, d: dist(e0.at) }); } }
    return out; };
  let cur = els; const ents = [], notes = [];
  const add = e0 => { const r = S.addEntrance({ ...plan, elements: cur }, e0.at, { slide: 0, W }); if (r.error) return false; const e = r.entrance; delete e.pinned; e.note = W + ' ft driveway'; cur = r.elements; ents.push({ e, d: e0.d, k: e0.k, front: fronts.includes(e0.k) }); return true; };
  // the canopy's street: lined up with an end lane (cars drive straight on to the pumps); the other street: lined up with
  // the back lane, which runs out to it. Each as far from the corner as that allows.
  const bottom = F.orient === 'side' ? sides : fronts, other = corner ? (F.orient === 'side' ? fronts : sides) : [];
  const laneX = [(meta.xa + meta.cx0) / 2, (meta.cx1 + meta.xb) / 2], backY = (meta.y2 + meta.y3) / 2;
  const bot = cands(bottom, pinned.length ? 160 : 90) /* (a canopy placed back from the street: a longer driveway) */.map(c => { const x = toL(c.at)[0], off = Math.min(...laneX.map(v => Math.abs(v - x))); return { ...c, x, off, v: Math.min(c.d, 200) * 2 - off * 3 }; }).sort((a, b) => b.v - a.v);
  const oth = cands(other, 160).map(c => { const off = Math.abs(toL(c.at)[1] - backY); return { ...c, off, v: Math.min(c.d, 260) - off * 6 }; }).sort((a, b) => b.v - a.v);
  const has = ks => ks.some(k => held.has(k));
  if (!has(bottom) && (!bot.length || !add(bot[0]))) return null;
  if (corner && !has(other)) { if (!oth.length || !add(oth[0])) notes.push('No room for a driveway on the ' + (F.orient === 'side' ? 'front' : 'side') + ' street: the lot is reached from one street only.'); }
  else if (ents.length) { // an inside lot: a second driveway at the other end lane when the frontage is long enough for two
    const x0 = toL([ents[0].e.x, ents[0].e.y])[0], two = bot.filter(c => Math.abs(c.x - x0) >= 120 && c.off < 12).sort((a, b) => a.off - b.off)[0];
    if (two) add(two);
  }
  const taken = new Set(S.entrancesOf(pinned).map(e => e.name)); let k = 1;
  ents.sort((a, b) => b.front - a.front).forEach(t => { const nm = () => k === 1 ? 'Main entry' : 'Entrance ' + k; while (taken.has(nm())) k++; t.e.name = nm(); k++; }); // the main entry on the front street (unless one placed by hand has the name)
  for (const t of ents) if (corner && t.d < 100) notes.push((t.front ? 'The front street driveway' : 'The side street driveway') + ' is ' + Math.round(t.d) + ' ft from the corner (100 ft or more is the usual aim; the frontage is too short for more).');
  return { els: cur, ents, notes };
}

// ---------- a re-fit ----------
// Pieces placed by hand (moved, turned, resized: `pinned`) stay where they are and the rest of the station is laid out
// again round them. A canopy or store placed by hand sets the frame: square with it, a street it backs onto at the
// bottom (each street the lot has is tried); the canopy keeps its pumps, its lanes go all round it and the store goes
// behind it; a store alone gets the canopy between it and the street. A car wash, the tank pad, a driveway or anything
// else placed by hand stays too and the rest keeps clear of it. Why a re-fit found nothing: refitWhy().
let why = '', lost = { ents: 0, rule: 0 }; // (lost: why finished arrangements were turned down)
export const refitWhy = () => why;
const isEntry = e => S.entrancesOf([e]).length > 0;
function pinsOf(pinned) {
  const fuelB = k => pinned.find(e => e.kind === 'building' && e.use === 'fuel' && S.fuelKind(e) === k);
  return { canopy: pinned.find(e => e.kind === 'canopy'), store: fuelB('store'), wash: fuelB('wash'), tanks: pinned.find(e => e.kind === 'tanks'), all: pinned };
}
// the frame square with a piece placed by hand (its turn a0), street edge k at the bottom
function frameAt(plan, a0, k, corner) {
  const ring = plan.ring, n0 = S.outwardOf(ring, k); let psi = a0, down = -2;
  for (let i = 0; i < 4; i++) { const s = rot(n0, -(a0 + i * 90)); if (-s[1] > down + 1e-9) { down = -s[1]; psi = a0 + i * 90; } }
  psi = ((psi % 360) + 360) % 360;
  const R = S.edgeRules(ring, plan.front, plan.setbacks, plan.streets), rr = ring.map(p => rot(p, -psi)), xs = rr.map(p => p[0]), ys = rr.map(p => p[1]), pave = R.map(r => Math.max(0.5, r.pave));
  const F = { ring, rr, rrT: rr.map(([x, y]) => [y, x]), psi, phi: psi, front: k, deep: false, rules: R, site: S.ringArea(ring), sb: { ...S.SETBACKS, ...(plan.setbacks || {}) }, build: R.map(r => Math.max(0.5, r.build)), pave, paveF: pave, X0: Math.min(...xs), X1: Math.max(...xs), Y0: Math.min(...ys), Y1: Math.max(...ys), cache: new Map() };
  const sideK = !!corner?.sides.includes(k), other = corner ? (sideK ? corner.fronts : corner.sides) : [], m = rr.length, cx = (F.X0 + F.X1) / 2;
  const ox = other.map(j => (rr[j][0] + rr[(j + 1) % m][0]) / 2 - cx), oy = other.map(j => (rr[j][1] + rr[(j + 1) % m][1]) / 2);
  F.side = ox.length ? Math.sign(ox[oy.indexOf(Math.min(...oy))]) || 1 : 0; F.orient = sideK ? 'side' : 'front'; F.down = down;
  return F;
}
// a piece's outline in the frame, as a box when it's square with the frame (else null)
function boxIn(F, e) {
  const P = S.shapeOf(e).map(p => rot(p, -F.psi)), xs = P.map(p => p[0]), ys = P.map(p => p[1]), b = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  return Math.abs((b.x1 - b.x0) * (b.y1 - b.y0) - S.ringArea(P)) < 0.02 * S.ringArea(P) + 1 ? b : null;
}
// the frames a re-fit tries, each with what stays marked on it (F.fixC, F.fixS, F.obst, F.obstPark: see place())
function refitFrames(plan, pins, corner, H) {
  const a = pins.canopy || pins.store, ring = plan.ring, rules = S.edgeRules(ring, plan.front, plan.setbacks, plan.streets);
  let frames;
  if (a) { frames = []; const seen = new Set();
    for (const k of ring.map((_, k) => k).filter(k => rules[k].role === 'front' || rules[k].street)) { const F = frameAt(plan, a.rot || 0, k, corner), key = Math.round(F.psi) % 360; if (F.down < 0.5 || seen.has(key)) continue; seen.add(key); frames.push(F); } }
  else frames = (corner ? ['front', 'side'] : ['front']).map(o => frameFor(plan, o, corner, H));
  for (const F of frames) {
    const shp = e => S.shapeOf(e).map(p => rot(p, -F.psi)), gap = e => e.kind === 'building' ? (e === pins.store ? 4 : 10) : e.kind === 'pond' ? 12 : 4;
    F.fixC = pins.canopy ? boxIn(F, pins.canopy) : null; F.fixS = pins.store ? boxIn(F, pins.store) : null; F.haveStore = !!pins.store; F.haveTank = !!pins.tanks;
    F.obst = pins.all.filter(e => e !== pins.canopy && !(e === pins.store && F.fixS) && e.kind !== 'tanks' && !isEntry(e) && !['lot', 'green', 'trail', 'fence'].includes(e.kind)).map(e => ({ p: shp(e), g: gap(e) }));
    F.obstPark = pins.all.filter(e => e.kind === 'tanks' || isEntry(e) || e === pins.store && F.fixS).map(e => ({ p: shp(e), g: e.kind === 'tanks' ? 2 : 4 }));
  }
  return frames.filter(F => !pins.canopy || F.fixC);
}

// ---------- the options ----------
// lays out a gas station: every arrangement of the pumps (rows), store depth, canopy spot and car wash that fits,
// ranked; the best three that differ. H: helpers from lib/sitelayout.mjs. With pieces placed by hand (opts.pinned) the
// rest goes round them (refitFrames).
export function fuelOptions(plan, prog, opts = {}, H) {
  const fp = prog.fuel, corner = cornerOf(plan), site = S.ringArea(plan.ring), pinned = opts.pinned || [], pins = pinsOf(pinned); why = ''; lost = { ents: 0, rule: 0 };
  const orients = !corner ? ['front'] : fp.canopy === 'side' ? ['side'] : fp.canopy === 'front' ? ['front'] : ['front', 'side'];
  const frames = pinned.length ? refitFrames(plan, pins, corner, H) : orients.map(o => frameFor(plan, o, corner, H));
  const tries = [], seen = new Set();
  const rowsFor = n => pins.canopy ? [pins.canopy.rows || 1] : n <= 4 ? [1, 2] : n <= 8 ? [2, 1] : [2, 3];
  for (const pumps of pins.canopy ? [S.pumpsOf(pins.canopy) || fp.pumps] : [fp.pumps, ...S.PUMPS.filter(k => k < fp.pumps).reverse()]) {
    for (const tight of [false, true]) { // a small lot: the lanes at their narrowest
      for (const F of frames) { const orient = F.orient;
        for (const rows of rowsFor(pumps)) for (const sd of pins.store ? [60] : fp.storeSf <= 3600 ? [50, 60, 40] : [60, 70, 50]) for (const shift of pins.canopy || pins.store ? ['mid'] : ['mid', 'lo', 'hi']) for (const wash of fp.wash && !pins.wash ? [true, false] : [false]) {
          const r = place(F, prog, { pumps, rows, sd, shift, wash, tight }, H); if (!r) continue;
          const key = Math.round(F.psi) + '|' + orient + '|' + rows + '|' + sd + '|' + Math.round(r.meta.cx0) + '|' + wash; if (seen.has(key)) continue; seen.add(key);
          const pre = 1000 - r.meta.gap * 2 /* (a canopy placed by hand: the frame whose street it's nearest) */ - (pumps < fp.pumps ? 400 : 0) - (fp.wash && !wash ? 300 : 0) - Math.max(0, r.meta.need - r.meta.stalls) * 30 - (orient === 'side' && fp.canopy === 'auto' ? 80 : 0) - (tight ? 40 : 0) + (shift === (corner ? 'hi' : 'mid') ? 8 : shift === 'mid' ? 4 : 0) - (sd !== 60 ? 6 : 0) - (rows !== rowsFor(pumps)[0] ? 10 : 0) - Math.abs((r.meta.sx0 + r.meta.sx1) / 2 - (r.meta.cx0 + r.meta.cx1) / 2) * 0.3;
          tries.push({ F, r, orient, pumps, rows, sd, shift, wash, tight, pre });
        }
      }
      if (tries.length) break;
    }
    if (tries.some(t => t.r.meta.stalls >= t.r.meta.need)) break; // the most pumps that fit and park (fewer pumps are tried too while every try is short of parking)
  }
  if (!tries.length) { why = pins.canopy ? 'The canopy needs a drive lane all round it (24 ft or more) and room for the store behind it, and there isn’t room for those where it is now.' : pins.store ? 'The canopy, its lanes and the store’s parking don’t fit between the store and the street where the store is now.' : pinned.length ? 'The gas station doesn’t fit round the pieces placed by hand.' : ''; return []; }
  tries.sort((a, b) => b.pre - a.pre);
  const order = [], grp = new Set(); for (const t of tries) { const g = t.orient + t.rows + t.shift + t.wash; if (!grp.has(g)) { grp.add(g); order.push(t); } } // the best of each arrangement first, then the rest
  order.push(...tries.filter(t => !order.includes(t)));
  const out = [];
  for (const t of order.slice(0, 12)) { const o = finish(plan, prog, t, corner, site, H, pinned); if (o) out.push(o); if (out.length >= 6) break; }
  if (!out.length && pinned.length) why = lost.ents > lost.rule ? 'No driveway from the street can reach the drive lanes round the canopy where it is now.' : 'Laying the rest out round the pieces placed by hand would break a rule (a drive cut off, parking on the tanks, or a setback).';
  out.sort((a, b) => b.score - a.score);
  const pick = []; for (const o of out) if (pick.length < (opts.count || 3) && !pick.some(p => p.look === o.look)) pick.push(o);
  return pick.map(({ look, ...o }) => o);
}
// one arrangement made a finished option: the leftover land (detention, lawns, a future pad), the pieces turned to the
// plan, the driveways, the plan's checks and repairs, the trash enclosures if asked for, and its score
function finish(plan, prog, t, corner, site, H, pinned = []) {
  const { F, r } = t, fp = prog.fuel, stats = {}, notes = r.meta.notes.slice(), keep = new Set(pinned.map(e => e.id)), toL = p => rot(p, -F.psi);
  const dev = S.stormAcres(site, prog, null), sn = S.stormNeed(dev, plan.params || {}, prog, site / 43560), pondHave = pinned.filter(e => e.kind === 'pond').reduce((s, e) => s + S.elArea(e), 0);
  const pond0 = sn.mode === 'detention' || sn.mode === 'retention' ? Math.max(0, sn.area - pondHave) : 0, pond = pond0 < 3000 ? 0 : pond0;
  // what stays, in the frame, so the land left over (detention, lawns) goes round it too
  const pinF = pinned.map(e => e.poly ? { ...e, poly: e.poly.map(toL) } : e.path ? { ...e, path: e.path.map(toL) } : { ...e, ...(([x, y]) => ({ x, y }))(toL([e.x, e.y])), rotL: (e.rot || 0) - F.psi });
  const way = r.meta.gap > 10 ? [(r.meta.xa + r.meta.cx0) / 2, (r.meta.cx1 + r.meta.xb) / 2].map(x => ({ kind: "drive", ...rectL(x - 16, F.Y0 - 20, x + 16, r.meta.y0 + 1) })) : []; // (a canopy placed back from the street: room kept for the driveways up to it)
  const land = H.finishLand(F, r.els.concat(pinF, way), { pond, reserve: [], trail: false, amenity: false, padUse: true, openSpace: false, frontY: H.profile(F).b[0], future: true, hold: true, lakeName: '' }, stats);
  let els = H.toPlanEls(F, r.els.concat(land)).concat(pinned.map(e => ({ ...e })));
  const en = entrances(plan, els, corner, F, r.meta, prog, pinned); if (!en) { lost.ents++; return null; }
  els = en.els; notes.push(...en.notes);
  const mine = i => !keep.has(i.id); // (a rule a piece placed by hand breaks shows on it; it's no reason to drop the rest)
  const fx = H.repair({ ...plan, program: prog }, els, keep); if (fx.bad.some(mine)) { lost.rule++; return null; }
  els = fx.els; if (!els.some(e => e.kind === 'canopy') || !els.some(e => e.kind === 'building' && e.use === 'fuel' && S.fuelKind(e) === 'store')) return null;
  els = H.withTrash(plan, prog, els, notes);
  const pl = { ...plan, program: prog, elements: els }, m = S.metrics(pl), iss = S.check(pl);
  if (iss.some(i => i.level === 'bad' && mine(i))) { lost.rule++; return null; }
  const tankOk = !iss.some(i => /fuel truck can’t reach/.test(i.text)), mouth = iss.filter(i => /is at the mouth of/.test(i.text)).length;
  // what it says
  if (t.pumps < fp.pumps) notes.unshift('Room for ' + t.pumps + ' of the ' + fp.pumps + ' pumps asked for.');
  if (fp.wash && !els.some(e => e.fuel === 'wash')) notes.push('No room for the car wash and its stacking lane.');
  if (fp.truckStop) notes.push('Laid out as a gas station for cars: a truck stop’s diesel lanes, truck parking and scales aren’t drawn yet.');
  if (m.required > m.spaces) notes.push('Parking is ' + S.spacesWord(m.required - m.spaces) + ' short of ' + m.required + '.');
  if (pond > 0 && m.pond < pond * 0.9) notes.push('Detention holds about ' + Math.round(m.pond / pond * 100) + '% of the ' + sn.volume.toFixed(1) + ' acre-feet needed; plan on underground storage under the paving for the rest (usual at a gas station).');
  const fut = els.filter(e => e.kind === 'green' && e.future).reduce((s, e) => s + S.elArea(e), 0); if (fut > 0) notes.push((fut / 43560).toFixed(2) + ' acres are left for a future pad or phase.');
  const ents = en.ents, sideEnt = ents.some(x => corner?.sides.includes(x.k));
  let score = 1000 - (t.pumps < fp.pumps ? 400 : 0) - (fp.wash && !els.some(e => e.fuel === 'wash') ? 300 : 0) - (fp.vac && !m.fuel?.vac ? 60 : 0) - Math.max(0, m.required - m.spaces) / Math.max(1, m.required) * 500
    - (corner && !sideEnt ? 150 : 0) - ents.reduce((s, x) => s + (corner ? Math.max(0, 100 - x.d) * 2 : 0), 0) - (tankOk ? 0 : 500) - mouth * 40 - (t.orient === 'side' && fp.canopy === 'auto' ? 80 : 0)
    - (pond > 0 ? Math.max(0, 1 - m.pond / pond) * 60 : 0) + (!corner && ents.length > 1 ? 20 : 0) + (t.pre - 1000) * 0.5; // (an inside lot: in at one end lane, out at the other)
  const name = (corner ? (t.orient === 'side' ? 'Canopy along the side street' : 'Canopy along the front street') : 'Canopy facing the street') + ' · ' + (t.rows > 1 ? t.rows + ' rows of ' + Math.ceil(t.pumps / t.rows) + ' pumps' : t.pumps + ' pumps in a row') + (els.some(e => e.fuel === 'wash') ? ' · car wash' : '');
  const look = t.orient + '|' + t.rows + '|' + els.some(e => e.fuel === 'wash') + '|' + Math.round(r.meta.cx0 / 40);
  return { name, elements: els, notes, zones: [{ name: S.USES.fuel.label, use: 'fuel', ring: plan.ring, acres: site / 43560 }], program: prog, phi: F.phi, score, recipe: { fuel: true }, ownEntrances: true, look, // (a re-fit lays it out again through fuelOptions, round what's pinned)
    sizes: { units: 0, gfa: els.filter(e => e.kind === 'building').reduce((s, e) => s + S.gfaOf(e), 0) } };
}
