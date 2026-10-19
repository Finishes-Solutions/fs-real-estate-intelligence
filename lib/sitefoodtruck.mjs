// Food truck parks, the way they're built: the trucks on concrete stalls along a service lane, round a gathering area
// (a covered pavilion with picnic seating on a lawn, restrooms, a bar or beer garden with its patio, a playground), the
// customers' parking on the street side so they park and walk straight in.
//
//  - The service lane is one drive: up one side, across the back, down the other, joining the parking aisle at both
//    ends (a loop, so a fire truck or a food truck never backs out). On a corner lot it also gets its own driveway from
//    the side street, so the trucks come and go without driving through the customer parking.
//  - Stalls (15 × 35 ft) sit along the inside of the lane, the truck against the lane side and its serving window
//    toward the seating; a truck pulls in along the lane and out the same way, never across the seating. A plaza strip in
//    front of them is where people queue and order. "Round the commons" puts trucks along the back and both sides;
//    "along the back" one row.
//  - Parking: 90° rows on aisles parallel to the street, as many as the trucks (about 5 spaces each) and the bar need.
//    No stalls at the entrance's mouth.
//  - A dumpster and grease enclosure takes a stall's spot on the lane.
// Works in the layout engine's turned frame (lib/sitelayout.mjs frameOf: the street along the bottom, y in from it); the
// engine passes its helpers in (T) and finishes the option the usual way (detention on the land left, names, the
// checks, entrances). Planning sketch only: no health-code, utility or fire review.
import * as S from './siteplan.mjs';

const FT = S.FOODTRUCK;

// the arrangements worth trying on a site: trucks round the commons or along the back, 1 to 5 parking aisles, the
// pond at the back, the front, a side or nowhere (none: in leftover land, else underground)
export function variants(F, prog, pond, T) {
  const out = [], P = T.profile(F), W = Math.max(60, F.X1 - F.X0 - 30), H = Math.max(60, P.p[1] - P.p[0]);
  const at = pond > 3000 ? [['back', pond * 1.2 / W + 14], ['front', pond * 1.2 / W + 14], ['side', pond * 1.2 / H + 14, -1], ['side', pond * 1.2 / H + 14, 1], ['none', 0]] : [['none', 0]];
  const ats = W < 300 && F.site < 2 * 43560 ? [null, 'L', 'R'] : [null]; // a short frontage: the entrance toward one end too, so the street-side row keeps more of its stalls
  for (const style of ['ring', 'back']) for (let nP = 1; nP <= 5; nP++) for (const [pondAt, depth, side] of at) for (const a of ats) out.push({ style, nP, pondAt, pondDepth: depth, side, at: a });
  return out;
}

// a w × d rectangle inside region [x0, y0, x1, y1], clear of `avoid` rectangles ([x0, y0, x1, y1], each kept `gap`
// away) and of the keep-out outlines, nearest `want` [x, y]; null when none fits
function placeIn(reg, w, d, want, avoid, gap, keep = []) {
  if (reg[2] - reg[0] < w - 0.01 || reg[3] - reg[1] < d - 0.01) return null;
  let best = null; const step = Math.max(2, Math.min(w, d) / 6);
  for (let y = reg[1]; y <= reg[3] - d + 0.01; y += step) for (let x = reg[0]; x <= reg[2] - w + 0.01; x += step) {
    const r = [x, y, x + w, y + d];
    if (avoid.some(a => { const g = a.soft ? 0 : gap; return r[0] < a[2] + g && a[0] < r[2] + g && r[1] < a[3] + g && a[1] < r[3] + g; })) continue; // (soft: the ordering plaza, already kept 4 ft off by the region)
    if (keep.some(k => S.rectsOverlap({ poly: [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]] }, { poly: k }, 0))) continue;
    const c = Math.hypot(x + w / 2 - want[0], y + d / 2 - want[1]); if (!best || c < best.c) best = { c, r };
  }
  return best?.r || null;
}
const R4 = r => ({ x: (r[0] + r[2]) / 2, y: (r[1] + r[3]) / 2, w: r[2] - r[0], d: r[3] - r[1] });

// one arrangement in the frame: { els (frame feet), solid (the gathering area, for the land step), notes, stats } or null.
// v: { style, nP, pondAt, pondDepth, side, keep (outlines to stay off: easements, pinned pieces), have (pinned: trucks,
// pavilion, bar, restroom, play) }
export function compose(F, prog, v, T) {
  const ft = prog.foodtrucks, { ROW, AISLE, SW } = T, LW = FT.lane, SD = FT.stallD, SL = FT.stallL, GAP = FT.gap, R = T.curveR ?? 30, rIn = Math.max(1, R - LW / 2), CR = rIn - Math.sqrt(Math.max(0, rIn * rIn - (rIn - 0.5) ** 2)) + 1.5; // CR: a stall's end kept clear of the lane's rounded inside corner
  const keep = v.keep || [], have = v.have || {}, P = T.profile(F), notes = [];
  let yF = P.p[0], yB = P.p[1];
  if (v.pondAt === 'front') yF += v.pondDepth; else if (v.pondAt === 'back') yB -= v.pondDepth;
  const res = v.pondAt === 'side' ? (v.side < 0 ? T.box(-1e6, -1e6, F.X0 + v.pondDepth, 1e6) : T.box(F.X1 - v.pondDepth, -1e6, 1e6, 1e6)) : null; // the pond's strip down one side
  const obs = keep.map(p => ({ p, g: 2 })).concat(res ? [{ p: res, g: 0 }] : []);
  const yA0 = yF + ROW + AISLE / 2, pitch = AISLE + 2 * ROW, yTopPark = yA0 + AISLE / 2 + ROW + (v.nP - 1) * pitch, yCom0 = yTopPark + 13; // parking aisles from the street back; a walk, then the gathering area
  // the trucks the plan wants (as many as fit when no number is given): the back lane comes forward until the U holds them
  const want = v.fixN ?? (ft.trucks != null ? Math.max(0, ft.trucks - (have.trucks || 0)) : Infinity);
  // where each leg of the lane can run from the front aisle back to y: the top of the clear strip at each x
  const tops = []; for (let x = F.X0; x <= F.X1 - LW; x += 2) { const sp = T.spans(F, x, x + LW, 'pave', obs, true).find(([a, b]) => a <= yA0 - AISLE / 2 + 0.01 && b >= yA0 + AISLE / 2); tops.push([x, sp ? sp[1] : -Infinity]); }
  const legsAt = y1 => { const ok = tops.filter(([, t]) => t >= y1); return ok.length ? [ok[0][0], ok[ok.length - 1][0]] : null; };
  const minDepth = v.style === 'ring' ? 16 + 40 : 16 + 30, /* trucks along the back of a small lot: a shallower seating area (the pavilion shrinks or turns to fit, and says so) */ deep = y1 => y1 - LW - SD - yCom0; // the gathering area's depth for a back lane at y1
  const comfy = 16 + 4 + (ft.pavilionSf > 0 ? Math.max(30, Math.min(70, Math.sqrt(ft.pavilionSf / 1.6))) + 12 : 0) + (ft.bar ? Math.max(30, Math.sqrt(ft.barSf / 1.4)) + 12 : 30) + 8; // what the gathering area wants: the pavilion behind the bar and restrooms
  let L = null;
  for (let y1 = yB; deep(y1) >= minDepth; y1 -= 4) {
    const lg = legsAt(y1); if (!lg) continue; const [xL, xR] = lg; if (xR - xL < LW + (v.style === 'ring' ? 2 * SD + 2 : 0) + 96) continue; // room for the gathering area between
    if (!T.covers(T.spans(F, y1 - LW, y1, 'pave', obs), xL, xR + LW)) continue;
    if (L == null) L = { xL, xR, y1 }; // the deepest that works
    if (!Number.isFinite(want)) break;
    // fewer trucks than the U holds at full depth: the shallowest U that holds them (the land behind is left for later)
    const sl = slotsFor(xL, xR, y1), cap = sl.length; if (cap >= want && deep(y1) >= comfy) L = { xL, xR, y1 }; else break; // (never so shallow the pavilion and bar lose their room)
  }
  if (!L) return null;
  function slotsFor(xL, xR, y1) { // stall spots: the back row from the middle out, then the sides from the back down
    const yl = y1 - LW, out = [], bx0 = xL + LW + CR, bx1 = xR - CR, nb = Math.max(0, Math.floor((bx1 - bx0 + GAP) / (SL + GAP))), s0 = (bx0 + bx1 - (nb * SL + (nb - 1) * GAP)) / 2;
    for (let k = 0; k < nb; k++) out.push({ x: s0 + k * (SL + GAP) + SL / 2, y: yl - 0.5 - SD / 2, w: SL, d: SD, rotL: 0, o: Math.abs(k - (nb - 1) / 2), side: 0 });
    if (v.style === 'ring') { const sy1 = yl - CR, ns = Math.max(0, Math.floor((sy1 - yCom0 + GAP) / (SL + GAP)));
      for (let k = 0; k < ns; k++) { const y = sy1 - k * (SL + GAP) - SL / 2; out.push({ x: xL + LW + 0.5 + SD / 2, y, w: SL, d: SD, rotL: 90, o: 100 + k, side: -1 }, { x: xR - 0.5 - SD / 2, y, w: SL, d: SD, rotL: -90, o: 100.5 + k, side: 1 }); }
      const y0 = sy1 - ns * (SL + GAP) + GAP; if (y0 - yCom0 >= 26) out.trash = { x: xR - 0.5 - 6, y: y0 - 2 - 12, w: 24, d: 12, rotL: -90 }; } // room left below the right row: the enclosure there, not in a truck's spot
    out.trash ||= { x: xR - 0.5 - 12, y: yTopPark + 0.5 + 6, w: 24, d: 12, rotL: 0, band: true }; // else in the walk's corner by the lane, beside the parking
    const tr = out.trash; out.sort((a, b) => a.o - b.o); out.trash = tr; return out;
  }
  const { xL, xR, y1 } = L, yl = y1 - LW, cx = (xL + xR + LW) / 2, els = [];
  // ---- the entry and the parking ----
  const aisles = []; for (let i = 0; i < v.nP; i++) { const y = yA0 + i * pitch; if (!T.covers(T.spans(F, y - AISLE / 2, y + AISLE / 2, 'pave', obs), xL, xR + LW)) return null; aisles.push(y); }
  const entry = T.makeEntry(F, { aisles: [{ y: yA0, w: AISLE }], entry: { w: xR - xL < 260 ? 26 : 30, at: v.at === 'L' ? xL + LW + 30 : v.at === 'R' ? xR - 30 : cx }, entryAvoid: keep }, [{ i: 0, ea: xL + LW, eb: xR }], []); if (!entry) return null;
  const ep = entry.els[0].poly, exs = ep.map(p => p[0]), eys = ep.map(p => p[1]), m = SW + 2;
  const rowOb = obs.concat([{ p: T.box(Math.min(...exs) - m, Math.min(...eys) - 5, Math.max(...exs) + m, Math.min(...eys) + 40), g: 0 }]); // no stalls at the entrance's mouth
  for (const y of aisles) els.push({ kind: 'drive', ...T.rectL(xL, y - AISLE / 2, xR + LW, y + AISLE / 2), name: '', note: AISLE + ' ft drive aisle' });
  els.push(...entry.els);
  let rows = [];
  aisles.forEach((y, i) => { for (const side of [-1, 1]) { const y0 = side < 0 ? y - AISLE / 2 - ROW : y + AISLE / 2;
    const lo = i === 0 && side < 0 ? xL + 0.5 : xL + LW + 0.5, hi = i === 0 && side < 0 ? xR + LW - 0.5 : xR - 0.5; // (the street-side row runs on under the lane's ends, which stop at the aisle)
    for (const [p, q] of T.spans(F, y0, y0 + ROW, 'pave', rowOb).map(([p, q]) => [Math.max(p, lo), Math.min(q, hi)]).filter(([p, q]) => q - p >= 36)) {
      const nS = Math.floor((q - p) / SW), w = nS * SW, x0 = (p + q - w) / 2;
      rows.push({ kind: 'parking', ...T.rectL(x0, y0, x0 + w, y0 + ROW), row: side < 0 ? 1 : -1, lock: true, islands: true, caps: nS >= 8 && T.roundIslands, ...T.stallKeys(), _i: i }); } } });
  // ---- the trucks ----
  const slots = slotsFor(xL, xR, y1); if (!slots.length) return null;
  const cnt = e => S.stalls({ ...e, rot: 0 }).count, spaces = list => { const n = list.reduce((s, e) => s + cnt(e), 0); return n - S.adaLoss(n); };
  // what the parking carries: the trucks first. When it can't carry them and the bar too, the bar shrinks or goes (the
  // switch stays on, so a bigger site gets it back); as many as fit keeps the bar while that still leaves 4 trucks
  const per = ft.perTruck || 0, room = spaces(rows) - (v.xNeed || 0), cap = Math.min(slots.length, want), barOf = sf => prog.ratio > 0 ? Math.ceil(sf / 1000 * prog.ratio - 0.01) : 0;
  let barSf = v.fixBar ?? (ft.bar && !have.bar ? ft.barSf : 0), n = cap;
  const fitBar = left => { const sf = prog.ratio > 0 ? Math.min(barSf, Math.floor(Math.max(0, left) / prog.ratio * 9.6) * 100) : barSf; return sf >= 600 ? sf : 0; }; // (smaller than 600 sf: no bar)
  if (per > 0) { const free = v.fixBar == null; // (fixBar: the bar's size already settled)
    if (!Number.isFinite(want)) { n = Math.max(0, Math.min(cap, Math.floor((room - barOf(barSf)) / per))); if (free && barSf && n < 4) { n = Math.max(0, Math.min(cap, Math.floor(room / per))); barSf = fitBar(room - n * per); } }
    else if (n * per + barOf(barSf) > room) { if (n * per > room) n = Math.max(0, Math.floor(room / per)); if (free) barSf = fitBar(room - n * per); }
  }
  const barNeed = barOf(barSf);
  if (n < 1 && !(have.trucks > 0)) return null;
  if (!Number.isFinite(want) && n < slots.length) return compose(F, prog, { ...v, fixN: n, fixBar: barSf }, T); // as many as the parking carries: the U drawn round just those
  if (v.barNoRoom) notes.push('No room for the bar.'); else if (ft.bar && !have.bar && barSf < ft.barSf) notes.push(barSf ? 'The bar is cut to ' + barSf.toLocaleString('en-US') + ' of the ' + ft.barSf.toLocaleString('en-US') + ' sq ft asked for, so the parking carries the trucks.' : 'No bar here: the parking carries the trucks but not a bar as well (a bigger site gets one).');
  const used = slots.slice(0, n);
  // the trash and grease enclosure: on the lane below a row of trucks, else in the walk's corner beside the parking; gate on the lane
  const tSlot = slots.trash;
  const stallsOf = (s, i) => ({ kind: 'foodtruck', x: s.x, y: s.y, w: s.w, d: s.d, rotL: s.rotL, name: '', note: 'Food truck · ' + SD + ' × ' + SL + ' ft · power + water', _s: s });
  const trucks = used.map(stallsOf).filter(e => !keep.some(k => S.rectsOverlap({ poly: T.outL(e) }, { poly: k }, 0)));
  // numbered round the U: up the left side, across the back, down the right
  const ang = e => { const a = Math.atan2(e.y - (yCom0 + yl) / 2, e.x - cx); return (a < -Math.PI / 2 ? a + 2 * Math.PI : a); };
  trucks.sort((a, b) => ang(b) - ang(a)).forEach((e, i) => { e.name = 'Truck ' + (i + 1 + (have.trucks || 0)); delete e._s; });
  els.push(...trucks);
  if (tSlot && !have.trash) els.push({ kind: 'trash', x: tSlot.x, y: tSlot.y, w: tSlot.w, d: tSlot.d, rotL: tSlot.rotL, name: 'Trash', note: 'Dumpster + grease bin · gate on the lane' }); // against the lane
  // the service lane: up one leg, across the back, down the other, joining the front aisle at both ends
  const lane = { kind: 'drive', path: [[xL + LW / 2, yA0], [xL + LW / 2, y1 - LW / 2], [xR + LW / 2, y1 - LW / 2], [xR + LW / 2, yA0]], width: LW, r: R, name: 'Service lane', note: LW + ' ft · trucks pull in and out behind their stalls' };
  els.push(lane);
  // a corner lot: the lane gets its own driveway from the side street, so the trucks never cross the customer parking
  const svc = sideEntry(F, xL, xR + LW, [y1 - LW / 2, yA0 + 80], keep, T, ep); if (svc) { els.push(svc); notes.push('The trucks come and go by their own service entry on the side street, not through the customer parking.'); }
  else notes.push('The trucks reach the service lane from the end of the parking aisle and pull in and out behind their stalls, never across the seating.');
  // ---- the gathering area ----
  const sides = { L: trucks.some(e => e.rotL === 90), R: trucks.some(e => e.rotL === -90), B: trucks.some(e => e.rotL === 0) };
  const xC0 = xL + LW + 0.5 + (v.style === 'ring' ? SD : 0), xC1 = xR - 0.5 - (v.style === 'ring' ? SD : 0), yC1 = yl - 0.5 - SD, Q = 16; // Q: the ordering plaza in front of the trucks
  const plaza = [];
  if (sides.B) { const xs = trucks.filter(e => e.rotL === 0).map(e => e.x); plaza.push([Math.max(xC0, Math.min(...xs) - SL / 2 - 4), yC1 - Q, Math.min(xC1, Math.max(...xs) + SL / 2 + 4), yC1]); }
  for (const [k, rl, x0] of [['L', 90, xC0], ['R', -90, xC1 - Q]]) if (sides[k]) { const ys = trucks.filter(e => e.rotL === rl).map(e => e.y); plaza.push([x0, Math.max(yCom0, Math.min(...ys) - SL / 2 - 4), x0 + Q, Math.min(yC1, Math.max(...ys) + SL / 2 + 4)]); }
  for (const r of plaza) els.push({ kind: 'plaza', ...R4(r), name: '', note: 'Ordering plaza · string lights' });
  const reg = [xC0 + (sides.L ? Q + 4 : 8), yCom0 + 2, xC1 - (sides.R ? Q + 4 : 8), yC1 - (sides.B ? Q + 4 : 8)], placed = plaza.map(r => Object.assign(r.slice(), { soft: true })), kp = keep;
  const put = (r, e) => { placed.push(r); els.push({ ...e, ...R4(r) }); return r; };
  let pav = null;
  // the bar at the front corner (seen from the street and the parking) with its beer garden toward the middle
  let bar = null;
  if (barSf > 0 && !have.bar) {
    const d = Math.min(45, Math.max(30, Math.round(Math.sqrt(barSf / 1.4)))), w = Math.ceil(barSf / d), pa = Math.max(600, Math.round(barSf * 0.6 / 100) * 100), pd = d, pw = Math.ceil(pa / pd);
    for (const dir of [1, -1, 0]) { // the right front corner, else the left; on a narrow lot the beer garden behind the bar
      const ph = Math.ceil(pa / w), r = dir ? placeIn(reg, w + pw, d, [dir > 0 ? reg[2] : reg[0], reg[1]], placed, 12, kp) : placeIn(reg, w, d + ph, [reg[2], reg[1]], placed, 12, kp); if (!r) continue;
      const rb = dir > 0 ? [r[2] - w, r[1], r[2], r[3]] : dir < 0 ? [r[0], r[1], r[0] + w, r[3]] : [r[0], r[1], r[2], r[1] + d], rp = dir > 0 ? [r[0], r[1], r[2] - w, r[3]] : dir < 0 ? [r[0] + w, r[1], r[2], r[3]] : [r[0], r[1] + d, r[2], r[3]];
      bar = put(rb, { kind: 'building', use: 'foodtrucks', ft: 'bar', floors: 1, name: 'Bar', note: 'Bar · beer garden' }); put(rp, { kind: 'patio', name: 'Beer garden', note: 'Patio seating' }); break;
    }
    if (!bar) { const r = placeIn(reg, w, d, [reg[2], reg[1]], placed, 12, kp); if (r) bar = put(r, { kind: 'building', use: 'foodtrucks', ft: 'bar', floors: 1, name: 'Bar', note: 'Taps · indoor seating' }); }
    if (!bar && v.fixBar !== 0) return compose(F, prog, { ...v, fixBar: 0, fixN: undefined, barNoRoom: true }, T); // no room for it: the parking it would have taken goes to trucks
  }
  // the pavilion in the middle (as big as asked, else as big as fits, at least 600 sf) with room left for the restrooms
  // beside it, toward the front on the other side from the bar (on a small lot the pavilion gives way, then the restrooms shrink)
  const toward = bar && R4(bar).x > cx ? reg[0] : reg[2], rsf0 = ft.restroomSf || FT.restroomSf;
  const roomFor = list => { if (have.restroom) return true; for (const sf of [rsf0, Math.min(rsf0, 600), Math.min(rsf0, 400)]) { const d = sf > 500 ? 22 : 20, r = placeIn(reg, Math.ceil(sf / d), d, [toward, reg[1] + 10], list, 10, kp); if (r) return { r, sf }; } return null; };
  let rr = null, pav1 = null;
  if (ft.pavilionSf > 0 && !have.pavilion) {
    for (let sf = ft.pavilionSf; sf >= Math.min(600, ft.pavilionSf) && !pav; sf = Math.floor(sf * 0.85)) { // (a small lot: down to a 600 sf shelter)
      for (const d of [Math.max(24, Math.min(70, Math.round(Math.sqrt(sf / 1.6)))), 70, 34, 24]) { const w = Math.ceil(sf / d); if (w < 24) continue; // wider than deep, else turned to suit the space
      const far = toward === reg[0] ? reg[2] : reg[0], mid = (reg[0] + reg[2]) / 2, y58 = reg[1] + (reg[3] - reg[1]) * 0.58;
      for (const at of [[mid, y58], [far, y58], [mid, reg[3]], [far, reg[3]]]) { // in the middle, else toward the back or the far side so the restrooms fit
        const r = placeIn(reg, w, d, at, placed, 10, kp); if (!r) continue;
        pav1 ||= { r, w, d }; if (roomFor(placed.concat([r]))) { pav = { r, w, d }; break; } }
      if (pav) break; }
    }
    pav ||= pav1; // (no size leaves room for the restrooms: the biggest pavilion, and they're noted)
    if (pav) { const { r, w, d } = pav; pav = put(r, { kind: 'building', use: 'foodtrucks', ft: 'pavilion', floors: 1, name: 'Pavilion', note: 'Covered · picnic seating' }); if (w * d < ft.pavilionSf * 0.97) notes.push('The pavilion fits ' + Math.round(w * d).toLocaleString('en-US') + ' of the ' + ft.pavilionSf.toLocaleString('en-US') + ' sq ft asked for.'); }
    else notes.push('No room for the covered pavilion.');
  }
  if (!have.restroom) { const q = roomFor(placed); if (q) rr = put(q.r, { kind: 'building', use: 'foodtrucks', ft: 'restroom', floors: 1, name: 'Restrooms', note: 'Men’s · women’s · family' }); else notes.push('No room for the restrooms.'); }
  // the playground on the lawn, away from the bar
  let play = null;
  if (ft.playground && !have.play) for (const [w, d] of [[64, 48], [50, 40], [40, 32]]) {
    const away = bar && R4(bar).x > cx ? reg[0] : reg[2], r = placeIn(reg, w, d, [away, (reg[1] + reg[3]) / 2], placed, 10, kp); if (r) { play = put(r, { kind: 'play', name: 'Playground' }); break; } }
  if (ft.playground && !have.play && !play) notes.push('No room left for the playground.');
  // the lawn under it all (lawn games, picnic tables, shade trees)
  const lawn = [xC0, yCom0, xC1, yC1];
  els.unshift({ kind: 'green', ...R4(lawn), name: 'Lawn', note: 'Lawn games · picnic tables', trees: true });
  // ---- parking trimmed to the need: the rows farthest from the gathering area go first, then the ends of rows ----
  const need = n * per + (have.trucks || 0) * per + barNeed + (v.xNeed || 0), target = Math.ceil(need * 1.05 - 0.01) + S.adaLoss(Math.ceil(need * 1.05) + 8) + 2;
  let tot = rows.reduce((s, e) => s + cnt(e), 0);
  for (const e of rows.slice().sort((a, b) => a.y - b.y)) { const c = cnt(e); if (tot - c >= target) { rows = rows.filter(r => r !== e); tot -= c; } }
  for (const e of rows.slice().sort((a, b) => a.y - b.y)) { let k = Math.round(e.w / (e.sw || SW)); while (tot > target && k > 6) { const w2 = (k - 1) * (e.sw || SW), c0 = cnt(e), nx = { ...e, w: w2, x: e.x }; const c1 = cnt(nx); if (tot - (c0 - c1) < target) break; tot -= c0 - c1; Object.assign(e, { w: w2 }); k--; } }
  for (let i = 1; i < v.nP; i++) if (!rows.some(e => e._i === i)) return null; // an aisle with nothing on it: the variant with fewer aisles does better
  rows.forEach(e => delete e._i); els.push(...rows);
  const have2 = spaces(rows) + (v.xHave || 0);
  if (sides.B && rows.length === 0) return null;
  // what the land step keeps clear: the gathering area and the lane's inside
  const solid = [{ kind: 'building', use: 'amenity', poly: T.box(xL, yCom0 - 12, xR + LW, y1) }];
  return { els, solid, notes, reserve: res ? [res] : v.pondAt === 'back' ? [T.box(-1e6, yB, 1e6, 1e6)] : v.pondAt === 'front' ? [T.box(-1e6, -1e6, 1e6, yF)] : [],
    stats: { trucks: trucks.length + (have.trucks || 0), want: ft.trucks, need, have: have2, pavilion: !!pav || !!have.pavilion, restroom: !!rr || !!have.restroom, bar: !!bar || !!have.bar, barSf: bar ? barSf : 0, barNoRoom: !!v.barNoRoom, play: !!play || !!have.play, style: v.style, nP: v.nP, svc: !!svc } };
}

// a driveway from a side street (a street lot line to the left or right of the lane's back corners) into the lane at
// height y; null when the lane doesn't meet one. Frame feet.
function sideEntry(F, xa, xb, [yHi, yLo], keep, T, main) {
  const w = 24, Rc = 15, ring = F.rr, n = ring.length;
  const hit = (yy, dir, x0) => { let best = null; for (let k = 0; k < n; k++) { const a = ring[k], b = ring[(k + 1) % n]; if (!F.rules[k].street || F.rules[k].role === 'front') continue; if ((a[1] - yy) * (b[1] - yy) > 0 || Math.abs(b[1] - a[1]) < 1e-6) continue; const x = a[0] + (b[0] - a[0]) * (yy - a[1]) / (b[1] - a[1]); if ((x - x0) * dir < 0) continue; if (best == null || Math.abs(x - x0) < Math.abs(best - x0)) best = x; } return best; };
  const near = (yy, dir, x0) => { let best = null; for (let k = 0; k < n; k++) { const a = ring[k], b = ring[(k + 1) % n]; if (Math.abs(b[1] - a[1]) < 1e-6 || (a[1] - yy) * (b[1] - yy) > 0) continue; const x = a[0] + (b[0] - a[0]) * (yy - a[1]) / (b[1] - a[1]); if ((x - x0) * dir < 0) continue; if (best == null || Math.abs(x - x0) < Math.abs(best - x0)) best = x; } return best; };
  const mc = main ? [main.reduce((s, p) => s + p[0], 0) / main.length, main.reduce((s, p) => s + p[1], 0) / main.length] : null;
  for (const dir of [-1, 1]) for (let y = yHi; y >= yLo; y -= 10) { // as far back along the lane as it fits, 150 ft or more from the main entry
    if (mc && Math.hypot((dir < 0 ? xa : xb) - mc[0], y - mc[1]) < 150) continue;
    const x0 = dir < 0 ? xa : xb, ys = [y - w / 2 - Rc, y + w / 2 + Rc], hs = ys.map(yy => hit(yy, dir, x0)), h0 = hit(y, dir, x0);
    if (hs.some(v => v == null) || h0 == null || hs.some((v, i) => v !== near(ys[i], dir, x0))) continue; // the first lot line that way is the side street, all across the driveway
    if (Math.abs(h0 - x0) > 120) continue; // (the lane runs close along that side)
    const poly = dir < 0 ? T.entryPoly(y, hs[0], hs[1], x0 + w / 2, w, Rc).map(([u, v]) => [v, u]) : T.entryPoly(y, -hs[0], -hs[1], -(x0 - w / 2), w, Rc).map(([u, v]) => [-v, u]);
    if (keep.some(k => S.rectsOverlap({ poly }, { poly: k }, 0))) continue;
    if (ring.some((a, k) => !(F.rules[k].street || F.rules[k].role === 'front') && poly.some((p, i) => S.segSeg(p, poly[(i + 1) % poly.length], a, ring[(k + 1) % n]) < F.pave[k] - 0.5))) continue; // its curb returns clear of the other lot lines' buffers
    return { kind: 'drive', poly, name: 'Service entry', note: w + ' ft · trucks in and out', entry: true };
  }
  return null;
}

// how good an arrangement is: the trucks asked for (or the most that fit), parked, with the pavilion, bar and
// playground asked for; round the commons a little ahead of a single row
export function score(c, prog) {
  const ft = prog.foodtrucks, st = c.stats, N = ft.trucks, got = st.trucks;
  let s = N ? 1000 - Math.abs(got - N) / N * 1000 - (got < N ? 300 : 0) : 400 + got * 60;
  if (st.need > st.have) s -= (st.need - st.have) / Math.max(1, st.need) * 1500;
  if (st.have > st.need * 1.15 + 4) s -= (st.have - st.need * 1.15) * 3; // paving nobody needs
  if (ft.pavilionSf > 0 && !st.pavilion) s -= 400; if (ft.bar && !st.bar) s -= st.barNoRoom ? 300 : 150; else if (ft.bar && st.barSf < ft.barSf) s -= 150 * (1 - st.barSf / ft.barSf); // (a bar the parking can't carry costs less than one with no room: the trucks come first)
  if (ft.playground && !st.play) s -= 80; if (!st.restroom) s -= 400; // (restrooms aren't optional)
  if (st.style === 'ring') s += 25; if (st.svc) s += 40;
  return s;
}
export const nameOf = c => (c.stats.style === 'ring' ? 'Trucks round the commons' : 'Trucks along the back');
