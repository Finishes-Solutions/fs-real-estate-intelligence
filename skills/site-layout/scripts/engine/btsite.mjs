// The site features a building type needs beside its building, drawn after the run (lib/layoutrun.mjs) in the room the
// engine gave the type's building: the type is laid out as a bigger box (its envelope, lib/btypes.mjs btEnvelope), and
// here the box is cut back to the building and the rest becomes what the type needs.
//
//  - An express car wash: the tunnel at the back of its envelope, two 12 ft stacking lanes along the front to the pay
//    stations, merging round the far end into the tunnel's mouth, and an exit apron out of the tunnel's other end. The
//    lanes and the apron run on out of the envelope, square to it, to the nearest drive (across landscape or a walk, never
//    across parking, a building or a pond); the side and the hand that reach a drive with the shortest runs win.
//  - A data centre: the back of its envelope (the side away from the drives) a fenced yard for its generators and
//    cooling.
// queueOf(els) reads the stacking every queue lane on a plan holds (a car wash's, a bank's or a restaurant's drive-thru:
// lib/sitepad.mjs), for the notes and the independent check (lib/layoutcheck.mjs queues.*).
//
// Planning estimates, not a design: a car is 20 ft of queue; the counts each type asks for are in QUEUE_NEED with where
// they come from.
import * as S from './siteplan.mjs';
import * as LN from './btlanes.mjs';

export const CAR = 20, LANE = 12; // ft: a car in a queue (the engine's drive-thru lanes, lib/sitepad.mjs CAR / LANE)
// the cars of stacking each type's queue should hold, and the basis
export const QUEUE_NEED = {
  'car-wash': { cars: 12, what: 'stacking to the tunnel', src: 'an estimate: express tunnels are commonly planned for 10-12 or more cars of stacking before the pay stations; local rules run about 6-15' },
  bank: { cars: 5, what: 'cars a drive-thru lane behind the window', src: 'an estimate: rules for bank drive-thrus commonly ask 4-6 cars a lane' },
  'ret-drive-through': { cars: 8, what: 'cars behind the order point', src: 'the engine’s drive-thru rule (lib/sitepad.mjs STACK: 8 cars behind the order point)' }
};
// a car wash's envelope: the exit apron (A), the tunnel (L), the turn round the far end (T) along its length; the two lanes
// (2 x 12), a 6 ft gap and the tunnel (Wt) with 2 ft to spare across it
const A = 18, T = 38, GAP = 6, R = 20; // (R: the lanes' corners, a car's 14.4 ft inside / 25.5 ft outside turn on a 12 ft lane: lib/turning.mjs P)
export const envelope = (L, Wt) => ({ w: A + L + T, d: 2 * LANE + GAP + Wt + 2 });

const rot = (p, deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
const plen = P => P.slice(1).reduce((t, q, i) => t + Math.hypot(q[0] - P[i][0], q[1] - P[i][1]), 0);
// a path's corridor (w wide) as one outline per leg
const legs = (P, w) => P.slice(1).map((q, i) => { const p = P[i], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, n = [-(q[1] - p[1]) / L * w / 2, (q[0] - p[0]) / L * w / 2], u = [(q[0] - p[0]) / L * w / 2, (q[1] - p[1]) / L * w / 2];
  return [[p[0] - u[0] + n[0], p[1] - u[1] + n[1]], [q[0] + u[0] + n[0], q[1] + u[1] + n[1]], [q[0] + u[0] - n[0], q[1] + u[1] - n[1]], [p[0] - u[0] - n[0], p[1] - u[1] - n[1]]]; });
// points spread over an outline (every ~3 ft), for "does it cross X" by sampling
function samples(R, step = 3) {
  const xs = R.map(p => p[0]), ys = R.map(p => p[1]), out = [];
  for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) if (S.inRing([x, y], R)) out.push([x, y]);
  return out;
}
const BLOCK = ['building', 'garage', 'parking', 'pond', 'pool', 'court', 'play', 'trash', 'canopy', 'foodtruck', 'keepout', 'tanks'];
const isDrive = e => (e.kind === 'drive' || e.kind === 'truck') && e.note !== 'Drive-thru lane';

// ---------- the car wash ----------
// its pieces in the envelope's own frame (u along its length, v across; mirror su / sv): the tunnel, the two lanes, the
// apron, each lane's and the apron's open end (where it runs on out to a drive), and the cars the lanes hold
function washPieces(env, L, Wt, su, sv) {
  const W = env.w / 2, D = env.d / 2, f = ([u, v]) => [u * su, v * sv];
  const t0 = -W + A, t1 = t0 + L, vt = D - 2 - Wt / 2, v1 = -D + LANE / 2, v2 = v1 + LANE, u1 = W - 2 - LANE / 2, u2 = u1 - LANE;
  return {
    tunnel: { u: (t0 + t1) / 2 * su, v: vt * sv, w: L, d: Wt },
    lane1: [[-W, v1], [u1, v1], [u1, vt], [t1 + LANE / 2 + 0.5, vt]].map(f), /* (each path stops half its width short of the tunnel: its paving meets the tunnel's face) */ lane2: [[-W + 4, v1], [-W + 40, v2], [u2, v2], [u2, vt]].map(f), /* (it splits off lane 1 just inside the envelope: one way in, two lanes to the pay stations) */ apron: [[-W, vt], [t0 - 8.5, vt]].map(f), 
    out: [-su, 0] // (the open ends face -u)
  };
}
// a car wash envelope (B) on the plan made into its tunnel, lanes and apron, or null when no side and hand reach a drive
export function carWash(plan, els, B, spec) {
  const L = spec.L, Wt = spec.Wt, env = envelope(L, Wt), long = B.w >= B.d, ang = (B.rot || 0) + (long ? 0 : 90);
  if ((long ? B.w : B.d) < env.w * 0.85 || (long ? B.d : B.w) < env.d * 0.8) return null; // (much smaller than the envelope it was drawn as: no room for the lanes; a little smaller and the pieces are checked against what is round it)
  const toPlan = ([u, v]) => { const q = rot([u, v], ang); return [B.x + q[0], B.y + q[1]]; };
  const others = els.filter(e => e !== B && e.id !== B.id), drives = others.filter(isDrive).map(e => S.shapeOf(e)), blocks = others.filter(e => BLOCK.includes(e.kind)).map(e => S.shapeOf(e));
  const ring = plan.ring || [], base = S.check({ ...plan, elements: els }).filter(i => i.level === 'bad').map(i => i.text);
  let best = null;
  // each open end runs on out to a drive: straight on past the envelope's end, or a short way on and then square to it
  // (turn: toward +v or -v), the ends nearer the way they turn turning first so the runs never cross
  const runOut = (end, d1, d2, w) => { // from the open end on along d1, then along d2 (null: straight) to the first spot on a drive (2 ft steps, up to 90 ft)
    const corner = d2 ? [end[0] + d1[0] * w.a, end[1] + d1[1] * w.a] : end, dir = d2 || d1;
    for (let d = 0; d <= 90; d += 2) { const q = [corner[0] + dir[0] * d, corner[1] + dir[1] * d]; if (drives.some(r => S.inRing(q, r))) { const start = [corner[0] + dir[0] * (d + 3), corner[1] + dir[1] * (d + 3)]; return d2 ? [start, corner, end] : [start, end]; } }
    return null; };
  const clear = (run, w) => { // through landscape or a walk only (nothing in BLOCK), inside the lot, onto the drive only at its start
    const start = run[0], pts = legs(run, w).flatMap(c => samples(c)), far = pts.filter(p => Math.hypot(p[0] - start[0], p[1] - start[1]) > w / 2 + 4);
    return !pts.some(p => blocks.some(r => S.inRing(p, r))) && pts.every(p => S.inRing(p, ring)) && !far.some(p => drives.some(r => S.inRing(p, r))); };
  const hits = (A, wa, Bp, wb) => { const cs = legs(Bp, wb); return legs(A, wa).flatMap(c => samples(c)).some(p => cs.some(c => S.inRing(p, c))); };
  for (const su of [1, -1]) for (const sv of [1, -1]) for (const tl of [0, 1, -1]) for (const ta of [0, 1, -1]) { // (tl, ta: which way the way in and the exit turn, 0 straight on)
    const P = washPieces(env, L, Wt, su, sv), d1 = rot(P.out, ang), runs = [], same = tl && tl === ta;
    const order = ['lane1', 'apron'].map(k => ({ k, v: P[k][0][1], t: k === 'lane1' ? tl : ta })).sort((x, y) => same ? tl * (y.v - x.v) : 0); // (both turning one way: the one farthest that way turns first)
    let ok = true, a = R;
    for (const { k, t } of order) {
      const path = P[k].map(toPlan), w = k === 'lane1' ? LANE : 16, run = runOut(path[0], d1, t ? rot([0, t], ang) : null, { a });
      if (same) a += 16;
      if (!run || !clear(run, w) || runs.some(r => hits(run, w, r.run0, r.w))) { ok = false; break; }
      runs.push({ k, path: [...run, ...path.slice(1)], w, run: plen(run), run0: run });
    }
    if (!ok) continue;
    const inner = ['lane1', 'lane2', 'apron'].map(k => P[k].map(toPlan)); // (the pieces inside the envelope: clear of whatever stands round it when the envelope came out smaller)
    if (inner.some(p => legs(p, LANE).flatMap(c => samples(c)).some(q => blocks.some(r => S.inRing(q, r)) || !S.inRing(q, ring)))) continue;
    const tot = runs.reduce((t, r) => t + r.run + (r.run0.length > 2 ? 40 : 0), 0); // (straight runs before ones that turn)
    if (best && best.tot <= tot) continue;
    best = { su, sv, P, runs, tot };
  }
  if (!best) return null;
  const { P, runs } = best, tc = toPlan([P.tunnel.u, P.tunnel.v]), r = runs.find(x => x.k === 'lane1'), r2 = { k: 'lane2', path: P.lane2.map(toPlan), w: LANE }, ap = runs.find(x => x.k !== 'lane1');
  // the cars: lane 1 from its drive to the tunnel's mouth, lane 2 to where it joins lane 1's last leg
  const cars1 = Math.floor(plen(r.path) / CAR + 1e-6), cars2 = Math.floor(plen(r2.path) / CAR + 1e-6), cars = cars1 + cars2;
  const tunnel = { ...B, x: +tc[0].toFixed(2), y: +tc[1].toFixed(2), w: L, d: Wt, rot: +(((ang % 360) + 360) % 360).toFixed(4), note: String(B.note || '').replace(/[\d,]+ sf$/, (L * Wt).toLocaleString('en-US') + ' sf') }; delete tunnel.gfa;
  const lane = (x, nm, k) => ({ id: B.id + '-' + k, kind: 'drive', path: x.path.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]), width: x.w, r: R, name: nm, note: 'Drive-thru lane', ...(k === 'q1' ? { queue: 'carwash', stack: cars1 } : k === 'q2' ? { queue: 'carwash', stack: cars2, merge: true } : { exit: true }), oneWay: true });
  const out = els.map(e => e === B ? tunnel : e).concat([lane(r, 'Stacking lane 1', 'q1'), lane(r2, 'Stacking lane 2', 'q2'), { ...lane(ap, 'Exit', 'ex'), path: lane(ap, '', 'ex').path.reverse(), note: 'Car wash exit' }]);
  const now = S.check({ ...plan, elements: out }).filter(i => i.level === 'bad' && !base.includes(i.text));
  if (globalThis.BTDEBUG) console.log('now', JSON.stringify(now), JSON.stringify(out.filter(e=>e.queue||e.btype).map(e=>e.path||[e.x,e.y,e.w,e.d,e.rot])));
  if (now.length) return null; // (anything the engine's own check would call broken: not drawn)
  return { els: out, cars, note: 'Car wash: one way in from the drive, splitting into two 12 ft stacking lanes along the front to the pay stations that merge round the far end into the tunnel (' + cars + ' cars of stacking: ' + cars1 + ' in the outer lane from the drive, ' + cars2 + ' in the inner between the split and the merge; ' + QUEUE_NEED['car-wash'].cars + ' wanted, ' + QUEUE_NEED['car-wash'].src + '), and an exit apron out of the tunnel’s other end to the drive.' };
}

// ---------- a data centre's equipment yard ----------
// the back of the building's envelope (the long side farther from the street) a fenced yard of its share: the generators
// out of sight of the street, fuelled from the back (the truck court where there is one)
export function equipmentYard(plan, els, B, spec) {
  if (B.poly || B.form || !(B.w > 0 && B.d > 0)) return null;
  const share = Math.max(0.1, Math.min(0.4, +spec.share || 0.25)), ring = plan.ring || [], f = +plan.front || 0, a = ring[f] || [0, 0], b = ring[(f + 1) % (ring.length || 1)] || [1, 0];
  const near = p => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L / L)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }; // (distance from the street edge)
  const long = B.w >= B.d, side = (s) => { const q = rot(long ? [0, s * B.d / 2] : [s * B.w / 2, 0], B.rot || 0); return [B.x + q[0], B.y + q[1]]; };
  const s = near(side(1)) >= near(side(-1)) ? 1 : -1, D = long ? B.d : B.w, y = D * share; // (the yard on the side farther from the street)
  const keep = long ? { w: B.w, d: B.d - y } : { w: B.w - y, d: B.d }, off = rot(long ? [0, -s * y / 2] : [-s * y / 2, 0], B.rot || 0), yo = rot(long ? [0, s * (D / 2 - y / 2)] : [s * (D / 2 - y / 2), 0], B.rot || 0);
  const bld = { ...B, ...keep, x: +(B.x + off[0]).toFixed(2), y: +(B.y + off[1]).toFixed(2), note: String(B.note || '').replace(/[\d,]+ sf$/, Math.round(keep.w * keep.d * (B.floors || 1)).toLocaleString('en-US') + ' sf') }; delete bld.gfa;
  const yard = { id: B.id + '-yard', kind: 'plaza', x: +(B.x + yo[0]).toFixed(2), y: +(B.y + yo[1]).toFixed(2), w: long ? B.w : y, d: long ? y : B.d, rot: B.rot || 0, name: 'Equipment yard', note: 'Generators and cooling · fenced', yard: 'equipment' };
  const c = S.corners(yard), fence = { id: B.id + '-fence', kind: 'fence', path: [...c, c[0]].map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]), name: '', note: 'Equipment yard fence' };
  const out = els.map(e => e === B ? bld : e).concat([yard, fence]);
  return { els: out, note: 'Data center: the back ' + Math.round(y) + ' ft of its building plot (' + Math.round(share * 100) + '% of the footprint) is a fenced yard for its generators and cooling, on the side away from the street (an estimate to confirm with the equipment layout).' };
}

// ---------- round 3: the lanes and yards a type needs (lib/btlanes.mjs) ----------
// the queues these types ask for: a car's (or a bus's) length in the queue and how many, with where the numbers come from
export const QUEUE_TYPES = {
  'school-car': { car: 25, what: 'cars in the parent drop-off / pick-up queue', share: { elementary: 0.10, middle: 0.08, high: 0.05 },
    src: 'an estimate: pick-up queues measured at charter schools ran about 10% of enrollment in cars, at 25 ft a car (FHWA); South Carolina DOT school guidance recommends roughly 900-1,500 ft of on-site stacking for an elementary school; 8% at a middle school and 5% at a high school, where many students drive themselves, are estimates; the school district and the local DOT set the real figure' },
  'school-bus': { bus: 45, what: 'buses the bus loop holds at once (loading at the curb and lined up behind)', ride: { elementary: 0.5, middle: 0.5, high: 0.35 }, seats: 60,
    src: 'an estimate: about half of elementary and middle school students and a third of high school students ride the bus (district dependent), about 60 a bus, the loop holding every bus at once (at the curb and lined up behind it), 45 ft a bus (a 40 ft bus and a gap)' },
  daycare: { car: 20, per: 25, min: 4, what: 'cars in the drop-off lane',
    src: 'an estimate: a drop-off lane holding a car for every 25 children, at least 4 (arrivals spread over the morning, and parents commonly park and walk in to sign children in, so the short-term spaces near the door matter as much)' },
  porte: { car: 20, cars: 3, what: 'cars under and before the porte-cochère',
    src: 'an estimate: a porte-cochère about 60 ft long holds about 3 cars at the entrance, with a lane beside them to pass (brand standards vary)' },
  bank: { car: 20, cars: QUEUE_NEED.bank.cars, what: QUEUE_NEED.bank.what, src: QUEUE_NEED.bank.src },
  fuel: { car: 20, cars: 1, what: 'cars waiting at each side of a pump island',
    src: 'an estimate from local codes: at least one car waiting at each accessible side of a pump island (Huron, OH; Seven Hills, OH asks two; Durham, NC two a fueling position)' }
};
const LEVELS = ['elementary', 'middle', 'high'];
// how many a queue of this kind should hold for counts { students, level, children }
export function queueWant(kind, c = {}) {
  const Q = QUEUE_TYPES[kind]; if (!Q) return 0; const lvl = LEVELS.includes(c.level) ? c.level : 'elementary';
  if (kind === 'school-car') return Math.ceil((+c.students || 0) * Q.share[lvl]);
  if (kind === 'school-bus') return Math.max(1, Math.ceil((+c.students || 0) * Q.ride[lvl] / Q.seats));
  if (kind === 'daycare') return Math.max(Q.min, Math.ceil((+c.children || 0) / Q.per));
  return Q.cars;
}
// the street side of the plan, as a cost for a face of B pointing away from it (ft): the face toward the street costs 0
function streetCost(plan, B, k = 60) {
  const ring = plan.ring || [], f = +plan.front || 0, a = ring[f], b = ring[(f + 1) % (ring.length || 1)]; if (!a || !b) return () => 0;
  const m = [(a[0] + b[0]) / 2 - B.x, (a[1] + b[1]) / 2 - B.y], L = Math.hypot(...m) || 1, u = rot([m[0] / L, m[1] / L], -(B.rot || 0));
  return (f0, F) => (1 - (F.n[0] * u[0] + F.n[1] * u[1])) * k;
}
const r2 = p => [+p[0].toFixed(2), +p[1].toFixed(2)];
const laneEl = (B, key, path, o) => ({ id: B.id + '-' + key, kind: 'drive', path: path.map(r2), width: o.w, r: o.R, name: o.name, note: 'Drive-thru lane', queue: o.queue, ...o.extra, oneWay: true });
// the first try of a lane the engine's own check finds nothing new wrong with: { els, t, lane } or null
function firstGood(plan, els, B, spec, key, mk, base) {
  const got = LN.laneOn(plan, els, B, spec); if (!got) return null;
  for (const t of got.tries.slice(0, 8)) {
    const path = LN.planPath(t, got.toP), made = mk(t, path); if (!made) continue;
    const out = els.concat(made.add), now = S.check({ ...plan, elements: out }).filter(i => i.level === 'bad' && !base.includes(i.text));
    if (globalThis.BTDEBUG) console.log('lane', key, 'face', t.f, 'rows', t.n, 'score', Math.round(t.score), 'bad', JSON.stringify(now.map(i => i.text)), now.length ? JSON.stringify(path) + ' B=' + JSON.stringify([B.x, B.y, B.w, B.d, B.rot]) + ' ' + JSON.stringify(now.map(i => i.id)) + JSON.stringify(els.filter(e => now.some(i => i.id === e.id)).map(e => [e.kind, e.x, e.y, e.w, e.d, e.rot])) : '');
    if (!now.length) return { els: out, t, made };
  }
  return null;
}
const badOf = (plan, els) => S.check({ ...plan, elements: els }).filter(i => i.level === 'bad').map(i => i.text);

// a school: the parent drop-off / pick-up queue along one face (doubling back in rows when the queue is longer than the
// face) and the bus loop along another, apart from the cars; the play yard and fields are the recipe's own
function schoolLanes(plan, els, B, counts, notes) {
  const QC = QUEUE_TYPES['school-car'], QB = QUEUE_TYPES['school-bus'], cars = queueWant('school-car', counts), buses = queueWant('school-bus', counts), fc = streetCost(plan, B), base = badOf(plan, els);
  // one lane, or (when one lane can't hold the queue) two side by side, merging at the curb ("double stacking", as schools
  // commonly run it): 24 ft, its turns wider for the inner lane's car
  const placeCar = on => { const tryCar = (w, sp, R) => firstGood(plan, on, B, { w, off: 10, sp, R, need: cars * QC.car / (w / 12), maxRows: 6, curb: 'face', ext: 10, window: 'end', faceCost: (f, F) => fc(f, F) * 0.5 }, 'parent', (t, path) => {
      const held = Math.floor((t.windowAt - (w / 2 + 4)) / QC.car + 1e-6) * (w / 12);
      return { add: [laneEl(B, 'parent', path, { w, R, name: 'Parent drop-off', queue: 'school-car', extra: { stack: held, windowAt: +t.windowAt.toFixed(1), carLen: QC.car, ...(w > 12 ? { lanes: w / 12 } : {}) } })], held };
    }, base);
    let car = tryCar(12, 40, 20);
    if (!car || car.made.held < cars) { const two = tryCar(24, 56, 28); if (two && (!car || two.made.held > car.made.held)) car = two; }
    return car; };
  const busNeed = buses * QB.bus;
  const placeBus = on => firstGood(plan, on, B, { w: 24, off: 10, sp: 80, R: 40, K: 28, street: true, need: busNeed + 16, maxRows: 0, minCurb: 2 * QB.bus, curb: F => 2 * F.hl + 20, ext: 10, window: 'end', faceCost: fc }, 'bus', (t, path) => {
    const held = Math.floor((t.windowAt - 16) / QB.bus + 1e-6); // (the buses at the curb and lined up behind it in the loop)
    return { add: [laneEl(B, 'bus', path, { w: 24, R: 40, name: 'Bus loop', queue: 'school-bus', extra: { stack: held, windowAt: +t.windowAt.toFixed(1), buses: held } })], held };
  }, base);
  // the parents' queue first, then the bus loop clear of it; and the other way round: the pair holding more wins
  const miss = (x, need) => !x ? 2 : x.made.held >= need ? 0 : 1;
  const tryOrder = busFirst => { let on = els, car = null, bus = null;
    if (busFirst) { bus = placeBus(on); if (bus) on = bus.els; car = placeCar(on); if (car) on = car.els; }
    else { car = placeCar(on); if (car) on = car.els; bus = placeBus(on); if (bus) on = bus.els; }
    return { on, car, bus, m: miss(car, cars) + miss(bus, buses) }; };
  let pick = tryOrder(false); if (pick.m > 0) { const o2 = tryOrder(true); if (o2.m < pick.m) pick = o2; }
  const { car, bus } = pick, side = t => t.f === 0 ? 'front' : t.f === 2 ? 'back' : 'side';
  if (car) notes.push('School: a parent drop-off and pick-up lane' + (car.made.add[0].lanes ? ' (two lanes side by side, merging at the curb)' : '') + ' from the drive along the ' + side(car.t) + ' of the school' + (car.t.n ? ', doubling back ' + car.t.n + ' time' + (car.t.n > 1 ? 's' : '') + ' to hold its queue' : '') + ', and back out to the drive: ' + car.made.held + ' cars of stacking at 25 ft (' + cars + ' wanted for ' + counts.students + ' students; ' + QC.src + ').');
  else notes.push('School: no room beside the school for a parent drop-off queue reaching a drive (' + cars + ' cars wanted); the queue check fails. Add it by hand where the land allows.');
  if (bus) notes.push('School: a bus loop of its own (24 ft: a loading lane at the curb and a lane to pass) along the ' + side(bus.t) + ', kept apart from the parents’ cars: ' + bus.made.held + ' buses at the curb at once (' + buses + ' wanted; ' + QB.src + ').');
  else notes.push('School: no room for a bus loop of its own reaching a drive (' + buses + ' buses wanted); buses would share the parking aisles. Add it by hand where the land allows.');
  return pick.on;
}
// a daycare: a drop-off lane along a face near the door, and the play yard fenced (the recipe's, or one laid beside it)
function daycareLanes(plan, els, B, counts, notes, zone) {
  const Q = QUEUE_TYPES.daycare, cars = queueWant('daycare', counts), fc = streetCost(plan, B), base = badOf(plan, els);
  let out = els;
  // the play yard: the recipe's own beside the building, else (a daycare zone) one laid beside it on open ground
  let yard = out.find(e => e.kind === 'play' && e.custom && e.custom === B.custom && e.part === 'play');
  if (!yard) {
    const kids = +counts.children || 0, play = Math.max(1500, kids * 0.5 * 75), pw = Math.round(Math.sqrt(play * 1.6) / 2) * 2, pd = Math.round(play / pw);
    const at = LN.yardBeside(plan, out, B, pw, pd, 4, (f, F) => (60 - fc(f, F)) * 0.5); // (the play yard away from the street)
    if (at) { yard = { id: B.id + '-play', kind: 'play', x: at.x, y: at.y, w: at.w, d: at.d, rot: at.rot, name: 'Play yard', note: Math.round(pw) + ' × ' + Math.round(pd) + ' ft · preset (estimate)', part: 'play', ...(B.zone != null ? { zone: B.zone } : {}) };
      const now = S.check({ ...plan, elements: out.concat([yard]) }).filter(i => i.level === 'bad' && !base.includes(i.text)); if (!now.length) out = out.concat([yard]); else yard = null; }
  }
  if (yard) { const c = S.shapeOf(yard); out = out.concat([{ id: B.id + '-playfence', kind: 'fence', path: [...c, c[0]].map(r2), name: '', note: 'Play yard fence · 4 ft' }]); notes.push('Daycare: the play yard (' + Math.round(S.ringArea(c)).toLocaleString('en-US') + ' sf) beside the building, fenced (licensing commonly asks a fence of at least 4 ft round outdoor play; 75 sf a child for those outside at once).'); }
  else if (zone) notes.push('Daycare: no open ground beside the building for its play yard; add it by hand.');
  const dl = firstGood(plan, out, B, { w: 12, off: 8, sp: 40, R: 20, need: cars * Q.car, maxRows: 1, curb: 'face', ext: 10, window: 'end', faceCost: fc, avoid: [] }, 'dropoff', (t, path) => {
    const held = Math.floor((t.windowAt - 10) / Q.car + 1e-6);
    return { add: [laneEl(B, 'dropoff', path, { w: 12, R: 20, name: 'Drop-off lane', queue: 'daycare', extra: { stack: held, windowAt: +t.windowAt.toFixed(1) } })], held };
  }, badOf(plan, out));
  if (dl) { out = dl.els; notes.push('Daycare: a drop-off lane from the drive along the building’s ' + (dl.t.f === 0 ? 'front' : dl.t.f === 2 ? 'back' : 'side') + ' and back out: ' + dl.made.held + ' cars (' + cars + ' wanted; ' + Q.src + ').'); }
  else notes.push('Daycare: no room for a drop-off lane reaching a drive (' + cars + ' cars wanted); the parking nearest the door serves for drop-off.');
  return out;
}
// a hotel: a porte-cochère at the entrance, a drive-through lane under a canopy along the face toward the street
function porteCochere(plan, els, B, notes) {
  const Q = QUEUE_TYPES.porte, fc = streetCost(plan, B, 200), base = badOf(plan, els), SPAN = 60;
  const got = firstGood(plan, els, B, { w: 24, off: 6, sp: 60, R: 25, street: true, need: Q.cars * Q.car, maxRows: 0, curb: 100, ext: 10, window: 'mid', faceCost: fc }, 'porte', (t, path) => {
    const ring = LN.faceRect(B, t.f, -SPAN / 2, SPAN / 2, 0, 6 + 24 + 2), c = ring.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]);
    const held = Math.floor((t.windowAt + SPAN / 2 - 16) / Q.car + 1e-6);
    return { add: [laneEl(B, 'porte', path, { w: 24, R: 25, name: 'Porte-cochère drive', queue: 'porte', extra: { stack: held, windowAt: +(t.windowAt + SPAN / 2).toFixed(1) } }),
      { id: B.id + '-portecanopy', kind: 'plaza', poly: ring, x: +c[0].toFixed(2), y: +c[1].toFixed(2), name: 'Porte-cochère', note: 'Canopy over the drop-off lane at the entrance', porte: true }], held };
  }, base);
  if (got) { notes.push('Hotel: a porte-cochère at the entrance on the ' + (got.t.f === 0 ? 'front' : got.t.f === 2 ? 'back' : 'side') + ' (a 24 ft drive-through lane under a ' + SPAN + ' ft canopy, a lane to stop and one to pass, in from the drive and back out): ' + got.made.held + ' cars at the door (' + Q.cars + ' wanted; ' + Q.src + ').'); return got.els; }
  notes.push('Hotel: no room between the hotel and its parking for a porte-cochère reaching a drive; guests drop off from the parking aisle. Add one by hand where the land allows.');
  return els;
}
// a bank drawn as a zone of a mixed plan: its drive-thru lane along a side, the window at the face's middle
function bankLane(plan, els, B, notes) {
  const Q = QUEUE_TYPES.bank, fc = streetCost(plan, B), base = badOf(plan, els);
  const got = firstGood(plan, els, B, { w: 12, off: 6, sp: 40, R: 20, need: Q.cars * Q.car + 10, maxRows: 1, curb: 'face', ext: 10, window: 'mid', faceCost: (f, F) => 60 - Math.abs(60 - fc(f, F)) }, 'dt', (t, path) => {
    const held = Math.floor((t.windowAt - 10) / Q.car + 1e-6);
    return { add: [laneEl(B, 'dt', path, { w: 12, R: 20, name: 'Drive-thru lane', queue: 'bank', extra: { stack: held, windowAt: +t.windowAt.toFixed(1) } })], held };
  }, base);
  if (got) { notes.push('Bank: its drive-thru lane along the building’s side, in from the drive to the window and back out: ' + got.made.held + ' cars before the window (' + Q.cars + ' wanted; ' + Q.src + ').'); return got.els; }
  notes.push('Bank: no room beside the bank for its drive-thru lane reaching a drive; add it by hand.');
  return els;
}
// a school zone of a mixed plan: a play yard and a field beside the building where the land allows
function schoolGrounds(plan, els, B, counts, notes) {
  const lvl = LEVELS.includes(counts.level) ? counts.level : 'elementary', fc = streetCost(plan, B), pieces = lvl === 'high' ? [['green', 'Playing field', 360, 210]] : [['play', 'Play yard', 120, 80], ['green', 'Playing field', 240, 160]];
  let out = els; const got = [];
  for (const [kind, name, w, d] of pieces) {
    const at = LN.yardBeside(plan, out, B, w, d, 10, (f, F) => (60 - fc(f, F)) * 0.5); if (!at) continue;
    const el = { id: B.id + '-' + kind, kind, x: at.x, y: at.y, w: at.w, d: at.d, rot: at.rot, name, note: w + ' × ' + d + ' ft · preset (estimate)', part: kind, ...(B.zone != null ? { zone: B.zone } : {}), ...(kind === 'green' ? { trees: false } : {}) };
    const base = badOf(plan, out), now = S.check({ ...plan, elements: out.concat([el]) }).filter(i => i.level === 'bad' && !base.includes(i.text)); if (now.length) continue;
    out = out.concat([el]); got.push(name.toLowerCase());
  }
  notes.push(got.length ? 'School: its ' + got.join(' and ') + ' beside the building.' : 'School: no open ground beside the building for its play yard and field; add them by hand.');
  return out;
}

// the pump queues at a gas station's canopy: a lane each side of each island row, through the canopy and out into the
// drive lanes at its ends, holding a car at each pump and the cars waiting in the paving past the canopy (up to two an end)
function fuelQueues(plan, els, notes) {
  const C = els.filter(e => e.kind === 'canopy' && e.pumps > 0 && !e.poly); if (!C.length) return els;
  const ring = plan.ring || [], Q = QUEUE_TYPES.fuel, paved = els.filter(e => e.kind === 'drive' && !e.queue || e.kind === 'canopy').map(e => S.shapeOf(e)), block = els.filter(e => ['parking', 'building', 'tanks', 'pond'].includes(e.kind)).map(e => S.shapeOf(e));
  const okAt = p => S.inRing(p, ring) && paved.some(r => S.inRing(p, r)) && !block.some(r => S.inRing(p, r));
  const add = []; let lanes = 0, short = 0, waiting = 0;
  for (const c of C) {
    const isl = S.pumpsOf(c); if (!isl.length) continue;
    const along = c.w >= c.d, x = c.islands === 'across', axisU = along !== x; // (cars run along the islands' long side)
    const L = axisU ? c.w : c.d, th = c.rot || 0, toP = ([u, v]) => { const q = rot(axisU ? [u, v] : [v, u], th); return [c.x + q[0], c.y + q[1]]; }, toL = p => { const q = rot([p[0] - c.x, p[1] - c.y], -th); return axisU ? q : [q[1], q[0]]; };
    const lines = [...new Set(isl.map(i => Math.round(toL([i.x, i.y])[1] * 10) / 10))].sort((a, b) => a - b), half = Math.min(isl[0].w, isl[0].d) / 2;
    for (const v0 of lines) for (const sd of [-1, 1]) {
      const v = v0 + sd * (half + 6), clear = dir => { let s = 0; for (; s < 40; s += 2) if (!okAt(toP([dir * (L / 2 + s + 2), v]))) break; return s; };
      const e0 = clear(-1), e1 = clear(1), held = Math.min(2, Math.floor(e0 / Q.car + 1e-6)) + Math.min(2, Math.floor(e1 / Q.car + 1e-6)); lanes++; waiting += held; if (held < Q.cars) short++;
      const path = [toP([-L / 2 - e0, v]), toP([L / 2 + e1, v])];
      add.push({ id: (c.id || 'canopy') + '-q' + lanes, kind: 'drive', path: path.map(r2), width: 12, r: 0, name: '', note: 'Drive-thru lane', queue: 'fuel', stack: held, oneWay: false, fuelQ: true });
    }
  }
  if (!add.length) return els;
  notes.push('Gas station: ' + lanes + ' pump lanes under the canopy (a car at each fueling position), ' + waiting + ' cars waiting in the drive lanes past the canopy’s ends' + (short ? '; ' + short + ' lane' + (short > 1 ? 's have' : ' has') + ' no room for a waiting car' : '') + ' (' + Q.src + ').');
  return els.concat(add);
}

const civic = (els, Z, id) => els.filter(e => e.kind === 'building' && e.btype === id && (Z == null || e.zone === Z));
// a recipe's play yard or field the layout left on a detention pond (the pond moved after the grounds were placed): moved
// to open ground beside the building, else left and said
function dryGrounds(plan, els, B, notes) {
  const ponds = els.filter(e => e.kind === 'pond').map(e => S.shapeOf(e)); if (!ponds.length) return els;
  let out = els;
  for (const g of els.filter(e => e.custom && e.custom === B.custom && ['play', 'green'].includes(e.part))) {
    const R = S.shapeOf(g), xs = R.map(p => p[0]), ys = R.map(p => p[1]); let wet = false;
    for (let x = Math.min(...xs) + 2; x < Math.max(...xs) && !wet; x += 5) for (let y = Math.min(...ys) + 2; y < Math.max(...ys); y += 5) if (S.inRing([x, y], R) && ponds.some(r => S.inRing([x, y], r))) { wet = true; break; }
    if (!wet) continue;
    const rest = out.filter(e => e !== g), at = LN.yardBeside(plan, rest, B, g.w, g.d, 10, null);
    if (!at) { notes.push('The ' + String(g.name || 'outdoor piece').toLowerCase() + ' overlaps the detention pond: no open ground beside the building to move it to; move one by hand.'); continue; }
    const moved = { ...g, x: at.x, y: at.y, w: at.w, d: at.d, rot: at.rot }, base = badOf(plan, out), now = S.check({ ...plan, elements: rest.concat([moved]) }).filter(i => i.level === 'bad' && !base.includes(i.text));
    if (now.length) continue;
    out = out.map(e => e === g ? moved : e); notes.push('The ' + String(g.name || 'outdoor piece').toLowerCase() + ' moved off the detention pond to open ground beside the building.');
  }
  return out;
}
function typeFeatures(plan, els, prog) {
  if (!Array.isArray(els) || !prog) return { els, notes: [] };
  let out = els; const notes = [];
  const one = (btype, counts, Z) => {
    one0(btype, counts, Z);
    if ((btype === 'school' || btype === 'daycare') && Z == null) { const B = civic(out, Z, btype)[0]; if (B) out = dryGrounds(plan, out, B, notes); } // (after its lanes: the grounds moved to what is left)
  };
  const one0 = (btype, counts, Z) => {
    if (btype === 'school') { const B = civic(out, Z, 'school').sort((a, b) => b.w * b.d - a.w * a.d)[0]; if (!B) return; if (Z != null && !out.some(e => e.kind === 'play' && e.zone === Z)) out = schoolGrounds(plan, out, B, counts || {}, notes); out = schoolLanes(plan, out, B, counts || {}, notes); }
    else if (btype === 'daycare') { const B = civic(out, Z, 'daycare')[0]; if (B) out = daycareLanes(plan, out, B, counts || {}, notes, Z != null); }
    else if (/^hotel-(?:limited|extended|full|over-retail)$/.test(btype)) { const B = civic(out, Z, btype).sort((a, b) => b.w * b.d - a.w * a.d)[0]; if (B && !B.poly && !B.form) out = porteCochere(plan, out, B, notes); }
    else if (btype === 'bank' && Z != null) { const B = civic(out, Z, 'bank')[0]; if (B && !out.some(e => e.queue && e.kind === 'drive' && String(e.id).startsWith(B.id))) out = bankLane(plan, out, B, notes); }
  };
  if (prog.btype) one(prog.btype, prog.btCounts, null);
  for (const Z of prog.btZones || []) one(Z.btype, Z.counts, Z.zone);
  if (prog.use === 'fuel' || (prog.zones || []).some(z => z?.use === 'fuel')) out = fuelQueues(plan, out, notes);
  return { els: out, notes };
}

// ---------- after a run ----------
// the type's site features on the option's elements: { els, notes } (the same array when the type needs none)
export function siteFeatures(plan, els, prog) {
  const a = siteFeatures0(plan, els, prog), b = typeFeatures(plan, a.els, prog); // (round 3: the lanes and yards each type and zone needs, lib/btlanes.mjs; none: the same array)
  return b.els === a.els && !b.notes.length ? a : { els: b.els, notes: [...a.notes, ...b.notes] };
}
function siteFeatures0(plan, els, prog) {
  const sp = prog?.btSite; if (!sp || !Array.isArray(els)) return { els, notes: [] };
  const mine = els.filter(e => e.kind === 'building' && e.btype === prog.btype);
  if (sp.kind === 'carwash') {
    const B = mine[0]; if (!B) return { els, notes: [] };
    const got = carWash(plan, els, B, sp);
    if (got) return { els: got.els, notes: [got.note] };
    // no side reaches a drive: the tunnel alone in its plot, and the notes say the lanes are missing
    const L = sp.L, Wt = sp.Wt, long = B.w >= B.d, ang = (B.rot || 0) + (long ? 0 : 90), env = envelope(L, Wt), P = washPieces(env, L, Wt, 1, 1), q = rot([P.tunnel.u, P.tunnel.v], ang);
    const t = { ...B, x: +(B.x + q[0]).toFixed(2), y: +(B.y + q[1]).toFixed(2), w: L, d: Wt, rot: +(((ang % 360) + 360) % 360).toFixed(4) }; delete t.gfa;
    return { els: els.map(e => e === B ? t : e), notes: ['Car wash: no side of its plot reaches a drive for the stacking lanes, so they are not drawn (the queue check fails); move the tunnel or a drive by hand.'] };
  }
  if (sp.kind === 'yard') {
    let out = els; const notes = [];
    for (const B of mine) { const got = equipmentYard(plan, out, out.find(e => e.id === B.id) || B, sp); if (got) { out = got.els; if (!notes.length) notes.push(got.note); } }
    return { els: out, notes };
  }
  return { els, notes: [] };
}
// every queue lane on a plan and the cars it holds: a car wash's lanes measured along their paths (to the tunnel, or to
// where the inner lane joins), a drive-thru's as its lane says (behind the order point, lib/sitepad.mjs dtInfo)
export function queueOf(els) {
  return (els || []).filter(e => e.kind === 'drive' && e.note === 'Drive-thru lane' && Array.isArray(e.path) && e.path.length > 1).map(e => ({ id: e.id, kind: e.queue || 'drive-thru', cars: e.queue === 'carwash' ? Math.floor(plen(e.path) / CAR + 1e-6) : +e.stack || 0, len: Math.round(plen(e.path)), merge: !!e.merge }));
}
