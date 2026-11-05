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

// ---------- after a run ----------
// the type's site features on the option's elements: { els, notes } (the same array when the type needs none)
export function siteFeatures(plan, els, prog) {
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
