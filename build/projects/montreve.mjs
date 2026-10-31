// MONTREVE MOUNTAIN CLUB: 2481 Happy Hollow Road, Sevierville, Tennessee (Sevier County parcel 122 005.00, 30.05 acres),
// laid out as Will Essner's full resort program (Montreve Smoky Mountain Resort Business Plan, Oct 22 2026, p. 5-6) on
// the recorded 2007 subdivision (30 lots, Amber Valley Way and Creeksong Way), fitted to the ground.
//   The lots are the Montreve vector lot map's (projects/montreve/scripts/lots.py), laid on the Regrid parcel outline by
//     best overlap (scripts/georef.py: no turn, 2.5% larger) and kept exactly: one lot, one use. The roads are the plat's
//     50 ft rights-of-way traced to their centrelines (scripts/roads.py) and drawn as 24 ft paved roads.
//   The ground is USGS 3DEP 1 m lidar from the app's own terrain service (projects/montreve/data/terrain.json, 10 ft):
//     the site runs 1,348 to 1,837 ft and every lot slopes 35-70%. The roads follow the contours, as platted.
//   Everything is square to its road, as a subdivision is built: each cabin faces its street, centred on its lot, its
//     driveway straight in from the pavement beside it; the deck on the downhill side (away from the road below it,
//     toward the road above it) and the walk-out level under it. The lidar sets how far back each cabin sits (where the
//     fall across it is closest to one floor and its driveway is drivable) and the pads.
//   The resort core along Amber Valley Way: head-in parking along the pavement in front of lots 10-15, and behind it, square
//     to the road, the 6,000 sf glass wedding pavilion and its ceremony lawn (lots 14-15), the 2,500 sf dining and catering
//     hall and its service yard (12-13), a tennis court and two pickleball courts side by side (10-11), each on a level
//     pad set back where its retaining walls are least. Every piece carries its pad, cut, fill and walls (e.grade).
// The existing homes' positions are not surveyed: they are placed by the same rule as the new cabins.
// buildProject(parcels) returns the project document (id mvv5sk2y6l0dq, the team's existing MONTREVE MOUNTAIN CLUB),
// the Full program first, then Option B (the owners' resort concept: the resort as one terrace along the road, STRIP
// below), and the team's Option A kept as
// it was.
import fs from 'node:fs';
import * as SP from '../../lib/siteplan.mjs';
import * as TR from '../../lib/terrain.mjs';
import { typeById, fromType } from '../../lib/buildings.mjs';

const here = new URL('.', import.meta.url), proj = new URL('../../projects/montreve/data/', import.meta.url);
const read = (base, f) => JSON.parse(fs.readFileSync(new URL(f, base), 'utf8'));
export const SAVED = read(here, 'montreve.saved.json');
export const GEO = read(proj, 'plan_geometry.json');
export const TERRAIN = read(proj, 'terrain.json');
export const FALLBACK_PARCELS = SAVED.doc.parcels;

export const PROJECT = { id: SAVED.doc.id, name: SAVED.doc.name, county: 'Sevier', apns: FALLBACK_PARCELS.map(p => p.propId), community: 'Montreve Mountain Club' };
const CABIN = typeById('cabin-montreve-cabin-3-level-2-444-sf-indoor-pool'), PAVILION = typeById('venue-glass-event-pavilion-6-000-sf'), HALL = typeById('resort-dining-catering-hall-2-500-sf');
const EXISTING = [1, 3, 6, 18, 21, 28, 30];
const PAVE = 24, DECK = 9, SIDE = 10, DRIVE_W = 12, DRIVE_MAX = 0.15; // paved road; deck depth; side yard; driveway; steepest driveway

// ---------- geometry (plan feet) ----------
const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return [Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy), [a[0] + t * dx, a[1] + t * dy], t]; };
const nearest = (p, ring, open = false) => { let best = [Infinity, null, 0, 0]; for (let i = 0; i < ring.length - (open ? 1 : 0); i++) { const r = segDist(p, ring[i], ring[(i + 1) % ring.length]); if (r[0] < best[0]) best = [r[0], r[1], i, r[2]]; } return best; };
const edgeDist = (p, ring) => nearest(p, ring)[0];
const samples = r => { const out = []; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; for (let t = 0; t < 1; t += 0.25) out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } return out; };
const fits = (r, ring, inset) => samples(r).every(p => SP.inRing(p, ring) && edgeDist(p, ring) >= inset);
const cross = (a, b, c, d) => { const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; };
// two rings touch or overlap (any edges crossing, or one inside the other): the app's own test (lib/siteplan.mjs polysOverlap)
const meet = (A, B) => A.some((p, i) => B.some((q, j) => cross(p, A[(i + 1) % A.length], q, B[(j + 1) % B.length]))) || A.some(p => SP.inRing(p, B)) || B.some(p => SP.inRing(p, A));
const rect = (x, y, w, d, rot) => ({ x, y, w, d, rot });
const deg = ([dx, dy]) => Math.atan2(dy, dx) * 180 / Math.PI;
const cen = ring => SP.centroid(ring);
const r1 = v => Math.round(v * 10) / 10;
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
const z = p => TR.zAt(TERRAIN, p);

// the road network: each road's centreline, and the paving round it as the app draws it
const NET = GEO.network;
const PAVED = NET.map(r => SP.outline({ kind: 'drive', path: r.path, width: PAVE, r: 0, x: 0, y: 0, w: PAVE, d: 1, rot: 0 }));
const onRoad = p => PAVED.some(r => SP.inRing(p, r));
const ROW = GEO.roads.map(r => r.ring), onRow = p => onRoad(p) || ROW.some(r => SP.inRing(p, r) || edgeDist(p, r) < 1.5) || toRoad(p).d < 26; // the 50 ft right-of-way, paving and verge (and the cul-de-sac bulb)
// where a point sits against the nearest road: { d (ft to the centreline), q (the point on it), t (its direction), road }
function toRoad(p, only = null) {
  let best = null;
  for (const r of only ? [only] : NET) { const [d, q, i] = nearest(p, r.path, true), a = r.path[i], b = r.path[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; if (!best || d < best.d) best = { d, q, t: [(b[0] - a[0]) / L, (b[1] - a[1]) / L], road: r }; }
  return best;
}
// a lot's frontage: the road most of its outline lies along, the point on it nearest the lot's middle, the road's
// direction there (t) and the way into the lot (n, square to the road)
function frontage(lot) {
  const c = cen(lot), road = NET.map(r => ({ r, n: lot.filter(p => toRoad(p, r).d < 40).length })).sort((a, b) => b.n - a.n)[0].r;
  const f = toRoad(c, road); let n = [-f.t[1], f.t[0]]; if ((c[0] - f.q[0]) * n[0] + (c[1] - f.q[1]) * n[1] < 0) n = [-n[0], -n[1]];
  return { o: f.q, t: f.t, n, road };
}
const inFrame = (F, u, v) => add(add(F.o, F.t, u), F.n, v);
// the property line along Happy Hollow Road: the parcel edge nearest where Creeksong Way leaves it (the plan's front)
const FRONT_I = (g => { let k = 0, b = Infinity; for (let i = 0; i < GEO.parcel.length; i++) { const d = segDist(g, GEO.parcel[i], GEO.parcel[(i + 1) % GEO.parcel.length])[0]; if (d < b) { b = d; k = i; } } return k; })(NET[0].path[0]);
const FRONT_LINE = [GEO.parcel[FRONT_I], GEO.parcel[(FRONT_I + 1) % GEO.parcel.length]];

// ---------- a cabin, square to its road ----------
// The house and deck stack straight back from the road: house then deck (a lot below the road, the deck to the view
// behind) or deck then house (a lot above the road: the deck faces down toward the road, the walk-out under it). Search
// how far back (front face 22-200 ft from the centreline) and to either side, keeping the side yards. On these slopes a
// driveway can't climb or drop straight to a house, so the floor facing the road is set at the road's grade (the main
// floor of a house below the road, reached by a short level drive or bridge; the walk-out level of one above it), and the
// foundation makes up the ground: cost is the fall a walk-out can't take, then that exposed foundation, then distance back
// and off centre.
function placeCabin(n, lot) {
  const F = frontage(lot), W = CABIN.w, D = CABIN.d;
  let best = null;
  for (let vf = 22; vf <= 200; vf += 3) for (let u = -80; u <= 80; u += 4) {
    const up = z(inFrame(F, u, vf + D + DECK)) > z(inFrame(F, u, vf)), rot = deg(F.n) - 90 + (up ? 180 : 0); // the ground rises away from the road here: the deck faces the road; local +y is the deck side, downhill
    const hv = up ? vf + DECK + D / 2 : vf + D / 2, dv = up ? vf + DECK / 2 : vf + D + DECK / 2;
    const hc = inFrame(F, u, hv), dc = inFrame(F, u, dv), house = rect(...hc, W, D, rot), deck = rect(...dc, W, DECK, rot);
    const all = SP.outline(rect(...inFrame(F, u, vf + (D + DECK) / 2), W, D + DECK, deg(F.n) - 90));
    if (!fits(all, lot, SIDE) || samples(all).some(p => segDist(p, ...FRONT_LINE)[0] < 30)) continue; // and 30 ft back from Happy Hollow Road
    const f = TR.padFit(TERRAIN, { kind: 'building', use: 'sfr', floors: 3, ...house }); if (!f) continue;
    // the driveway: straight in from the pavement's edge to the house (or beside the deck), along its right side, else its left
    const L = vf - PAVE / 2, side = [1, -1].map(k => { const du = u + k * (W / 2 - DRIVE_W / 2 - 1), a = inFrame(F, du, PAVE / 2 - 1), b = inFrame(F, du, vf - 1);
      const drive = SP.outline({ kind: 'drive', path: [a, b], width: DRIVE_W, r: 0, x: 0, y: 0, w: DRIVE_W, d: L, rot: 0 });
      return meet(drive, GEO.easement.ring) || samples(drive).some(p => !SP.inRing(p, lot) && !onRow(p) && edgeDist(p, lot) > 1.5) ? null : [a, b]; }).find(Boolean);
    if (!side) continue; const [a, b] = side;
    const road = z(a), entryGround = z(inFrame(F, u, vf + 1)), foundation = road - entryGround; // the entry floor at road grade: + ground below it (a raised entry), − above it (dug in)
    const cost = 6 * Math.max(0, f.fall - 12) + 0.5 * Math.abs(f.fall - 10) + 1.5 * Math.max(0, Math.abs(foundation) - 4) + 0.15 * vf + 0.1 * Math.abs(u);
    if (!best || cost < best.cost) best = { cost, house, deck, f, drive: { path: [a, b], len: L, road, foundation }, up };
  }
  return best;
}

// ---------- the resort core, square to Amber Valley Way ----------
// a site's frame: its frontage on Amber Valley Way (the road's direction at the middle of the frontage)
function siteFrame(site) {
  const road = NET.find(r => r.name === 'Amber Valley Way'), front = site.filter(p => toRoad(p, road).d < 40), c = cen(front.length ? front : site), f = toRoad(c, road);
  let n = [-f.t[1], f.t[0]]; const sc = cen(site); if ((sc[0] - f.q[0]) * n[0] + (sc[1] - f.q[1]) * n[1] < 0) n = [-n[0], -n[1]];
  const us = site.map(p => (p[0] - f.q[0]) * f.t[0] + (p[1] - f.q[1]) * f.t[1]);
  return { o: f.q, t: f.t, n, road, u0: Math.min(...us), u1: Math.max(...us) };
}
// level pieces in a row along the frame, side by side (gap between), their fronts on one line `v` ft back: search that
// line and the row's slide along the frontage for the least retaining wall, square to the road
function placeRow(F, site, pieces, { gap = 16, v0 = 48, v1 = 160, taken = [] } = {}) {
  const len = pieces.reduce((s, p) => s + p.w, 0) + gap * (pieces.length - 1), rot = deg(F.t);
  let best = null;
  for (let s = F.u0 + 10; s + len <= F.u1 - 10; s += 4) {
    let u = s, out = [], wall = 0, earth = 0, ok = true;
    for (const p of pieces) { // each piece its own setback (its best pad), the row's order and spacing kept
      let pb = null; const prev = out[out.length - 1];
      for (let v = v0; v <= v1; v += 3) {
        const fr = toRoad(inFrame(F, u + p.w / 2, v), F.road), lr = deg(fr.t) + (deg(fr.t) - rot > 90 ? -180 : deg(fr.t) - rot < -90 ? 180 : 0); // square to the road in front of it
        const back = add(fr.q, F.n, v + p.d / 2), e = rect(...add(back, fr.t, 0), p.w, p.d, lr), ring = SP.outline(e);
        if (!fits(ring, site, 8) || taken.concat(out.map(o => SP.outline(o.e))).some(o => meet(ring, o))) continue;
        const f = TR.padFit(TERRAIN, { kind: p.kind, ...e }); if (!f) continue;
        const c = Math.max(f.cutWall, f.fillWall) + 0.002 * (f.cutCy + f.fillCy) + 0.12 * (v - v0) + (prev ? 0.15 * Math.abs(v - prev.v) : 0); if (!pb || c < pb.c) pb = { c, e, f, v };
      }
      if (!pb) { ok = false; break; }
      wall = Math.max(wall, pb.f.cutWall, pb.f.fillWall); earth += pb.f.cutCy + pb.f.fillCy; out.push({ ...p, e: pb.e, f: pb.f, v: pb.v }); u += p.w + gap;
    }
    if (!ok) continue; const v = 0;
    const mid = s + len / 2 - (F.u0 + F.u1) / 2, cost = wall + 0.002 * earth + 0.03 * v + 0.02 * Math.abs(mid);
    if (!best || cost < best.cost) best = { cost, out };
  }
  return best?.out || null;
}
// head-in parking along the pavement in front of a site: rows of 8 (72 x 18 ft) square to the road where they stand,
// stepping along its curve, the stalls opening straight onto the road; gaps for walks
function frontRows(site, F, { step = 80 } = {}) {
  const road = F.road, rows = [], L = road.path.reduce((s, p, i) => i ? s + Math.hypot(p[0] - road.path[i - 1][0], p[1] - road.path[i - 1][1]) : 0, 0);
  const at = s => { let acc = 0; for (let i = 1; i < road.path.length; i++) { const a = road.path[i - 1], b = road.path[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (acc + l >= s) { const k = (s - acc) / l; return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], t: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] }; } acc += l; } return null; };
  for (let s = 0; s <= L; s += 4) {
    const q = at(s); if (!q) break; let n = [-q.t[1], q.t[0]]; if (n[0] * F.n[0] + n[1] * F.n[1] < 0) n = [-n[0], -n[1]];
    const e = rect(...add(q.p, n, PAVE / 2 + 9.5), 72, 18, deg(q.t)), ring = SP.outline(e), left = [-q.t[1], q.t[0]];
    e.row = left[0] * n[0] + left[1] * n[1] > 0 ? -1 : 1; // the stalls open onto the road: their aisle side (row) toward it
    if (!samples(ring).every(p => SP.inRing(p, site) || onRoad(p) || edgeDist(p, site) < 14) || !SP.inRing(add(q.p, n, PAVE / 2 + 16), site)) continue;
    if (rows.some(r => { const o = SP.outline(r.e); return meet(ring, o) || samples(ring).some(p => SP.inRing(p, o) || edgeDist(p, o) < 4) || samples(o).some(p => SP.inRing(p, ring) || edgeDist(p, ring) < 4) || Math.hypot(r.e.x - e.x, r.e.y - e.y) < step; })) continue;
    const f = TR.padFit(TERRAIN, { kind: 'parking', ...e }); if (!f) continue;
    rows.push({ e, f }); s += step - 4;
  }
  return rows;
}

// ---------- the resort core: a designed plan, fitted to the hill ----------
// Lots 10-15 along Amber Valley Way: about 850 ft of frontage, the road bowing 110 ft downhill round lots 11-12, the lots
// rising 50-100 ft to the ridge. One grid for the whole core, square to the ridge (the frontage's chord): u along it
// from the west end, v up the hill. A straight stone promenade runs its length about 100 ft up; on its uphill side, in a
// row, the courts, the lodge, the cocktail terrace and the glass pavilion; below it, the guest parking field in the
// road's bend (one entry, two terraced bays with tree islands), the village green in front of the lodge, the ceremony
// lawn between garden beds in front of the pavilion facing the valley, and a fire-pit overlook. The lodge's service
// yard sits behind it on a service lane; the pavilion has its own drop-off lane from the road. The whole plan is slid
// a little along and up the hill (lidar) to where it fits the lots with the least wall.
export const CORE = (() => { const lots = [10, 11, 12, 13, 14, 15].map(n => GEO.lots[n].ring); return { lots, has: p => lots.some(r => SP.inRing(p, r) || edgeDist(p, r) < 0.8) }; })();
const AMBER = NET.find(r => r.name === 'Amber Valley Way');
export const CHORD = (() => { const f = AMBER.path.filter(p => CORE.lots.some(r => edgeDist(p, r) < 40)), a = f[0], b = f[f.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), t = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  let n = [-t[1], t[0]]; const c = cen(CORE.lots.flat()); if ((c[0] - a[0]) * n[0] + (c[1] - a[1]) * n[1] < 0) n = [-n[0], -n[1]]; return { a, t, n, L }; })();
// the master plan, in grid feet (u, v: centre; w along u, d along v). along: a court's length runs along u
const MASTER = [
  // the promenade, the spine: along the courts and the lodge, then down a flight of steps to the pavilion's terrace
  { id: 'mv-promenade', kind: 'plaza', path: [[120, 106], [528, 106], [548, 86], [800, 86]], width: 10, name: 'Promenade', note: 'Stone walk the length of the resort, steps down to the pavilion terrace' },
  // the courts (lots 10-11)
  { id: 'mv-tennis', kind: 'court', u: 185, v: 145, w: 120, d: 60, along: true, level: true, sport: 'tennis', courts: 1, name: 'Tennis court' },
  { id: 'mv-pickleball', kind: 'court', u: 290, v: 145, w: 60, d: 60, along: true, level: true, sport: 'pickleball', courts: 2, name: 'Pickleball courts' },
  { id: 'mv-courthouse', kind: 'building', u: 352, v: 128, w: 32, d: 24, level: true, use: 'amenity', floors: 1, name: 'Court pavilion', note: 'Shade, water, restrooms · court check-in' },
  { id: 'mv-courtdeck', kind: 'patio', u: 352, v: 154, w: 32, d: 22, level: true, name: 'Viewing deck', note: 'Shaded seating over the courts' },
  // the lodge (lots 12-13)
  { id: 'mv-terrace', kind: 'patio', u: 400, v: 135, w: 36, d: 40, level: true, name: 'Dining terrace', note: 'Outdoor dining facing the valley' },
  { id: 'mv-hall', kind: 'building', u: 452, v: 135, w: 62, d: 40, level: true, use: 'restaurant', floors: 1, type: 'hall', name: 'The Lodge · dining & catering', note: 'Owners’ dining · caterers’ kitchen · event service' },
  { id: 'mv-service', kind: 'plaza', u: 503, v: 133, w: 30, d: 28, level: true, name: 'Service yard', note: 'Deliveries and catering carts along the promenade; screened' },
  // the pavilion (lots 14-15)
  { id: 'mv-cocktail', kind: 'plaza', u: 590, v: 115, w: 56, d: 44, level: true, name: 'Cocktail terrace', note: 'Between the lodge and the pavilion' },
  { id: 'mv-pavilion', kind: 'building', u: 675, v: 122, w: 100, d: 60, level: true, use: 'venue', floors: 1, type: 'pavilion', name: 'Glass wedding pavilion', note: 'Wedding / event venue · ~150 guests' },
  { id: 'mv-pav-court', kind: 'plaza', u: 748, v: 120, w: 34, d: 50, level: true, name: 'Pavilion drop-off', note: 'Accessible drop-off · catering' },
  // below the promenade: the parking field in the road's bend, the village green, the fire pit, the ceremony lawn
  { id: 'mv-park-1', kind: 'parking', u: 340, v: 6, w: 180, d: 60, level: true, islands: true, name: '', note: 'Guest parking · tree islands' },
  { id: 'mv-park-2', kind: 'parking', u: 340, v: 68, w: 180, d: 60, level: true, islands: true, name: '', note: 'Guest parking · tree islands' },
  { id: 'mv-green', kind: 'green', u: 487, v: 62, w: 70, d: 56, level: true, name: 'Village green', note: 'Lawn and shade trees below the lodge' },
  { id: 'mv-firepit', kind: 'patio', u: 565, v: 50, w: 36, d: 36, level: true, name: 'Fire-pit overlook', note: 'Evening gathering over the valley' },
  { id: 'mv-lawn', kind: 'green', u: 675, v: 48, w: 86, d: 50, level: true, name: 'Ceremony lawn', note: 'Below the pavilion, facing the valley; seats ~150' },
  { id: 'mv-garden-w', kind: 'green', u: 622, v: 48, w: 14, d: 50, name: 'Garden', note: 'Flowering border' },
  { id: 'mv-garden-e', kind: 'green', u: 728, v: 48, w: 14, d: 50, name: 'Garden', note: 'Flowering border' }
];
// the walk up from the parking to the promenade, and the drives in from Amber Valley Way (each starts on the road square
// below its first grid point)
const WALKS = [{ id: 'mv-walk-park', from: [440, 70], to: [440, 101], name: 'Stair walk', note: 'Up from the parking to the promenade and the lodge' }];
const ENTRIES = [
  { id: 'mv-entry', to: [[340, 36]], width: 24, name: 'Resort entry', note: 'In from Amber Valley Way to the guest parking and the lodge' },
  { id: 'mv-pav-entry', to: [[780, 120]], width: 20, name: 'Pavilion lane', note: 'Drop-off and catering at the pavilion' }
];
export const grid = (u, v, du, dv) => add(add(CHORD.a, CHORD.t, u + du), CHORD.n, v + dv);
function masterAt(du, dv, G = {}) {
  const rot = deg(CHORD.t), out = [], off = q => G[q.group] || [0, 0];
  for (const q of MASTER) {
    if (q.path) { out.push({ ...q, path: q.path.map(([u, v]) => grid(u, v, du, dv)) }); continue; }
    const c = grid(q.u + off(q)[0], q.v + off(q)[1], du, dv), e = q.along ? { w: q.d, d: q.w, rot: rot - 90 } : { w: q.w, d: q.d, rot };
    const { u, v, ...rest } = q; out.push({ ...rest, x: c[0], y: c[1], ...e });
  }
  for (const E of ENTRIES) { // from the road, square to the grid, up to the drive's points
    const first = grid(E.to[0][0], E.to[0][1], du, dv), back = add(first, CHORD.n, -400), hit = (() => { let best = null; for (let i = 1; i < AMBER.path.length; i++) { const a = AMBER.path[i - 1], b = AMBER.path[i];
      const d = (b[0] - a[0]) * (first[1] - back[1]) - (b[1] - a[1]) * (first[0] - back[0]); if (Math.abs(d) < 1e-9) continue; const s = ((first[0] - back[0]) * (a[1] - back[1]) - (first[1] - back[1]) * (a[0] - back[0])) / d, r = ((b[0] - a[0]) * (a[1] - back[1]) - (b[1] - a[1]) * (a[0] - back[0])) / d;
      if (s >= 0 && s <= 1 && r >= 0 && r <= 1) { const p = [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s]; if (!best || Math.hypot(p[0] - first[0], p[1] - first[1]) < Math.hypot(best[0] - first[0], best[1] - first[1])) best = p; } } return best; })();
    if (hit) out.push({ id: E.id, kind: 'drive', path: [hit, ...E.to.map(([u, v]) => grid(u, v, du, dv))], width: E.width, name: E.name, note: E.note });
  }
  for (const W of WALKS) out.push({ id: W.id, kind: 'trail', path: [grid(...W.from, du, dv), grid(...W.to, du, dv)], width: 6, name: W.name, note: W.note });
  return out;
}
function designCore(els, notes) {
  const outlineOf = q => q.path ? SP.outline({ kind: q.kind, path: q.path, width: q.width, r: 0, x: 0, y: 0, w: q.width, d: 1, rot: 0 }) : SP.outline(q);
  const badOf = q => { const pts = samples(outlineOf(q)); return q.kind === 'drive' || q.kind === 'trail' ? pts.some(p => !CORE.has(p) && !onRow(p)) : pts.some(p => !CORE.has(p) || onRoad(p)) || q.kind !== 'plaza' && pts.some(p => edgeDist(p, GEO.parcel) < 8); };
  const score = ps => { let wall = 0, earth = 0, miss = 0; const fit = {}, rings = ps.map(outlineOf);
    ps.forEach((q, i) => { if (badOf(q)) { miss += q.level || q.kind === 'building' ? 10 : 3; return; }
      if (!['drive', 'trail', 'plaza'].includes(q.kind) && ps.some((o, j) => j !== i && (o.id === 'mv-promenade' || j < i && !['drive', 'trail', 'plaza'].includes(o.kind)) && meet(rings[i], rings[j]))) miss += 10; // pieces on top of each other, or on the promenade
      if (q.level) { const f = TR.padFit(TERRAIN, { ...q }); if (f) { fit[q.id] = f; wall = Math.max(wall, f.cutWall, f.fillWall); earth += f.cutCy + f.fillCy; } } });
    return { cost: 100 * miss + wall + 0.002 * earth, fit, miss }; };
  // the whole plan first, then each group slid along its row to its own best ground (a few passes)
  let best = null;
  for (let du = -40; du <= 40; du += 5) for (let dv = -24; dv <= 30; dv += 3) { const ps = masterAt(du, dv), sc = score(ps), cost = sc.cost + 0.05 * (Math.abs(du) + Math.abs(dv)); if (!best || cost < best.cost) best = { ...sc, cost, ps, du, dv, G: {} }; }
  const out = {}, kept = [];
  for (const q of best.ps) {
    const ring = outlineOf(q);
    if (badOf(q) || !['drive', 'trail', 'plaza'].includes(q.kind) && kept.some(o => meet(ring, o.ring) && !['drive', 'trail', 'plaza'].includes(o.kind))) { notes.push((q.name || q.id) + ' did not fit the core: left out'); continue; }
    const { level, along, group, ...e } = q; let el;
    if (q.path) el = { ...e, path: e.path.map(p => p.map(r1)), r: q.id === 'mv-promenade' ? 0 : 8, x: r1(e.path[0][0]), y: r1(e.path[0][1]), w: e.width, d: 1, rot: 0, pinned: true };
    else el = { ...e, x: r1(e.x), y: r1(e.y), rot: r1(e.rot), pinned: true };
    if (e.type === 'hall') el.type = HALL.id; if (e.type === 'pavilion') el.type = PAVILION.id;
    const f = best.fit[q.id]; if (f) { el.grade = grade(f); el.note = (el.note ? el.note + ' · ' : '') + padNote(f); }
    els.push(el); kept.push({ ring, kind: q.kind });
    if (q.id === 'mv-pavilion') out.pavilion = el; if (q.id === 'mv-hall') out.lodge = el; if (q.id === 'mv-tennis') out.courts = el;
  }
  out.at = { du: best.du, dv: best.dv, G: best.G };
  return out;
}

// ---------- Option B: the resort terrace along Amber Valley Way ----------
// The owners' concept (Montreve "overall resort concept" sketch): the resort reads as one terrace on the uphill side of
// Amber Valley Way across lots 10-15. Head-in parking straight off the road the whole way along, a walk behind it, and
// behind that, in one line from west to east: sports and the pool club, dining and catering, the wedding and conference
// hall, and the open-air pavilion at the east end. Each piece is square to the road where it stands (the road bends
// about 25° along the frontage) and set on a level pad from the lidar; the cabins below on wooded lots.
// Pieces in road feet: s (start) and w along Amber Valley Way from its west end, off (front edge) and d back from its
// centreline, the core on its left.
const STRIP = [
  // sports (lot 10): two court terraces, the tennis court below and four pickleball courts above, fenced, the court
  // pavilion between them at the east end (each court laid along the road: the least wall on this slope)
  { id: 'mv-tennis', kind: 'court', s: 1012, w: 120, off: 46, d: 60, level: true, sport: 'tennis', courts: 1, name: 'Tennis court', note: 'Lower court terrace · fenced · windscreens · lights' },
  { id: 'mv-pickleball', kind: 'court', s: 1012, w: 120, off: 112, d: 60, level: true, sport: 'pickleball', courts: 4, name: 'Pickleball courts', note: 'Four courts on the upper terrace · fenced' },
  { id: 'mv-courthouse', kind: 'building', s: 1140, w: 40, off: 112, d: 26, level: true, use: 'amenity', floors: 1, name: 'Court pavilion', note: 'Between the two court terraces · shade, water, restrooms · check-in' },
  { id: 'mv-courtdeck', kind: 'patio', s: 1140, w: 40, off: 52, d: 30, level: true, name: 'Viewing deck', note: 'Shaded seating beside the tennis court' },
  // the pool club (lot 11)
  { id: 'mv-pooldeck', kind: 'plaza', s: 1192, w: 104, off: 46, d: 54, level: true, name: 'Pool deck', note: 'Pool deck · loungers and umbrellas · gated' },
  { id: 'mv-pool', kind: 'pool', in: 'mv-pooldeck', du: -12, dv: -4, w: 64, d: 28, name: 'Owners’ pool', note: '28 × 64 ft resort pool · zero-entry end · heated' },
  { id: 'mv-spa', kind: 'pool', in: 'mv-pooldeck', du: 36, dv: -4, w: 12, d: 12, name: 'Spa', note: 'Hot tub · 8 seats' },
  { id: 'mv-poolhouse', kind: 'building', s: 1214, w: 60, off: 108, d: 32, level: true, use: 'amenity', floors: 1, name: 'Pool house & fitness', note: 'Changing rooms · fitness room · towel desk · pool equipment' },
  // the arrival plaza at the bend: the stair up from the parking, the resort sign, the way to every wing
  { id: 'mv-arrival', kind: 'plaza', s: 1338, w: 34, off: 46, d: 44, name: 'Arrival plaza', note: 'Stone plaza at the bend · resort sign · stair and ramp up from the parking' },
  // dining and catering (lots 11-12)
  { id: 'mv-terrace', kind: 'patio', s: 1380, w: 108, off: 46, d: 22, level: true, name: 'Dining terrace', note: 'Outdoor dining over the valley' },
  { id: 'mv-hall', kind: 'building', s: 1380, w: 62, off: 72, d: 40, level: true, use: 'restaurant', floors: 1, type: 'hall', name: 'The Lodge · dining', note: 'Owners’ dining room and bar · 2,500 sf' },
  { id: 'mv-catering', kind: 'building', s: 1450, w: 40, off: 72, d: 26, level: true, use: 'restaurant', floors: 1, type: 'resort-caterers-service-kitchen-800-sf', name: 'Catering kitchen', note: 'Licensed caterers’ prep and staging · serves the hall and pavilion' },
  { id: 'mv-service', kind: 'plaza', s: 1448, w: 44, off: 104, d: 26, level: true, name: 'Service yard', note: 'Deliveries · screened' },
  { id: 'mv-trash', kind: 'trash', s: 1410, w: 24, off: 118, d: 14, name: 'Trash & recycling', note: 'Screened enclosure on the service side' },
  // the wedding and conference hall (lots 13-14)
  { id: 'mv-cocktail', kind: 'plaza', s: 1500, w: 110, off: 46, d: 24, level: true, name: 'Cocktail terrace', note: 'Arrival and cocktails in front of the hall' },
  { id: 'mv-pavilion', kind: 'building', s: 1505, w: 100, off: 74, d: 60, level: true, use: 'venue', floors: 1, type: 'pavilion', name: 'Wedding & conference hall', note: 'Glass and timber hall · weddings, banquets, meetings · ~150 guests' },
  { id: 'mv-lawn', kind: 'green', s: 1512, w: 86, off: 140, d: 36, level: true, name: 'Ceremony lawn', note: 'Behind the hall, terraced into the hill · ~150 seats', trees: false },
  { id: 'mv-bridal', kind: 'building', s: 1618, w: 40, off: 52, d: 28, level: true, use: 'amenity', floors: 1, name: 'Bridal cottage', note: 'Getting-ready suites for the couple and wedding party · porch' },
  { id: 'mv-bridalgarden', kind: 'green', s: 1618, w: 40, off: 86, d: 22, name: 'Bridal garden', note: 'Photo garden · roses and boxwood', trees: false },
  // the open-air pavilion and its lawn (lots 14-15), at the east end
  { id: 'mv-openair', kind: 'building', s: 1672, w: 72, off: 48, d: 44, level: true, use: 'amenity', floors: 1, name: 'Open-air pavilion', note: 'Timber pavilion on stone piers, open sides · rehearsal dinners, receptions, concerts' },
  { id: 'mv-eventlawn', kind: 'green', s: 1754, w: 70, off: 46, d: 50, level: true, name: 'Pavilion lawn', note: 'Lawn games and tented events beside the pavilion', trees: false },
  { id: 'mv-firepit', kind: 'patio', s: 1680, w: 40, off: 104, d: 30, level: true, name: 'Fire-pit overlook', note: 'Evening gathering above the pavilion' },
  { id: 'mv-maint', kind: 'building', s: 1830, w: 40, off: 60, d: 30, level: true, use: 'amenity', floors: 1, name: 'Maintenance barn', note: 'Grounds equipment · golf carts · housekeeping and linens' }
];
const AMB = (() => { const P = AMBER.path, segs = []; let acc = 0; for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({ a, b, l, s: acc }); acc += l; }
  const at = s => { const g = segs.find(g => s <= g.s + g.l) || segs[segs.length - 1], k = Math.min(1, (s - g.s) / g.l), t = [(g.b[0] - g.a[0]) / g.l, (g.b[1] - g.a[1]) / g.l]; return { p: [g.a[0] + (g.b[0] - g.a[0]) * k, g.a[1] + (g.b[1] - g.a[1]) * k], t, n: [-t[1], t[0]] }; };
  // the road's direction over a stretch (the chord), so a long piece sits square to the road along its whole front
  const dir = (s0, s1) => { const a = at(s0).p, b = at(s1).p, L = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
  return { at, dir, length: acc }; })();
const STRIP_S = [1004, 1872]; // the core's frontage on Amber Valley Way (road feet)
function stripPiece(q, els = []) {
  if (q.in) { const h = els.find(e => e.id === q.in); if (!h) return null; const t = [Math.cos(h.rot * Math.PI / 180), Math.sin(h.rot * Math.PI / 180)], c = add(add([h.x, h.y], t, q.du), [-t[1], t[0]], q.dv); const { in: _, du, dv, level, ...rest } = q; return { ...rest, x: r1(c[0]), y: r1(c[1]), rot: h.rot, pinned: true }; }
  const sc = q.s + q.w / 2, t = AMB.dir(q.s, q.s + q.w), n = [-t[1], t[0]], at = off => add(AMB.at(sc).p, n, off + q.d / 2);
  // where the road curves toward the piece, its front corners come closer to the road than its middle: push it back so
  // the whole front keeps its distance
  let off = q.off; for (let i = 0; i < 3; i++) { const e = { x: at(off)[0], y: at(off)[1], w: q.w, d: q.d, rot: deg(t) }, near = Math.min(...samples(SP.outline(e)).map(p => toRoad(p, AMBER).d)); if (near >= q.off - 0.5) break; off += q.off - near; }
  const c = at(off), { s, off: _o, level, ...rest } = q; return { ...rest, x: r1(c[0]), y: r1(c[1]), rot: r1(deg(t)), pinned: true }; }
function designStrip(els, notes) {
  const pairOk = (a, b) => (a === 'pool' || b === 'pool') && (a === 'plaza' || b === 'plaza'), placed = [];
  const okIn = ring => samples(ring).every(p => CORE.has(p) && !onRoad(p) && edgeDist(p, GEO.parcel) >= 8);
  // the parking: rows of 8 head-in stalls straight off the road, each square to the road where it stands
  let s = STRIP_S[0], k = 0;
  while (s + 72 <= STRIP_S[1]) { const t = AMB.dir(s, s + 72), n = [-t[1], t[0]], c = add(add(AMB.at(s + 36).p, n, PAVE / 2 + 9), t, 0), e = { id: 'mv-park-' + (++k), kind: 'parking', x: r1(c[0]), y: r1(c[1]), w: 72, d: 18, rot: r1(deg(t)), row: -1, name: '', note: 'Head-in parking off Amber Valley Way', pinned: true }, ring = SP.outline(e);
    if (samples(ring).every(p => CORE.has(p) || onRow(p)) && !placed.some(o => meet(ring, o.ring))) { const f = TR.padFit(TERRAIN, { ...e }); if (f) { e.grade = grade(f); e.note += ' · ' + padNote(f); } els.push(e); placed.push({ e, ring }); s += 74; } else { k--; s += 6; } }
  // the walk behind the stalls, following the road
  const walk = []; for (let x = STRIP_S[0]; x <= STRIP_S[1]; x += 8) { const q = AMB.at(x); walk.push(add(q.p, q.n, PAVE / 2 + 26).map(r1)); }
  els.push({ id: 'mv-promenade', kind: 'plaza', path: walk, width: 8, r: 0, x: walk[0][0], y: walk[0][1], w: 8, d: 1, rot: 0, name: 'Promenade', note: 'Stone walk along the resort front, behind the parking', pinned: true });
  placed.push({ e: els[els.length - 1], ring: SP.outline(els[els.length - 1]) });
  // each piece at its spot, or slid along the road to the nearest spot where it fits (the order kept)
  for (const q of STRIP) {
    let el = null, ring = null, why = 'did not fit on lots 10-15';
    for (const ds of q.in ? [0] : [0, 2, -2, 4, -4, 6, -6, 8, -8, 10, -10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40]) {
      const e = stripPiece(q.in ? q : { ...q, s: q.s + ds }, els); if (!e) break; if (q.type === 'hall') e.type = HALL.id; else if (q.type === 'pavilion') e.type = PAVILION.id; else if (q.type) e.type = q.type;
      const r = SP.outline(e), hit = placed.find(o => !pairOk(o.e.kind, q.kind) && meet(r, o.ring));
      if (!okIn(r)) { why = 'did not fit on lots 10-15'; continue; } if (hit) { why = 'runs into ' + (hit.e.name || hit.e.id); continue; }
      el = e; ring = r; break;
    }
    if (!el) { notes.push(q.name + ' ' + why + ': left out'); continue; }
    if (q.level) { const f = TR.padFit(TERRAIN, { ...el }); if (f) { el.grade = grade(f); el.note = (el.note ? el.note + ' · ' : '') + padNote(f); } }
    els.push(el); placed.push({ e: el, ring });
  }
  // fences round the courts and the pool deck; walks from the promenade up to each building
  const fenceOf = (ids, id, name, note) => { const rs = ids.map(i => els.find(e => e.id === i)).filter(Boolean); if (!rs.length) return; const e0 = rs[0], pts = rs.flatMap(e => SP.outline(e)), t = [Math.cos(e0.rot * Math.PI / 180), Math.sin(e0.rot * Math.PI / 180)], n = [-t[1], t[0]];
    const us = pts.map(p => p[0] * t[0] + p[1] * t[1]), vs = pts.map(p => p[0] * n[0] + p[1] * n[1]), u0 = Math.min(...us) - 3, u1 = Math.max(...us) + 3, v0 = Math.min(...vs) - 3, v1 = Math.max(...vs) + 3, P = (u, v) => [u * t[0] + v * n[0], u * t[1] + v * n[1]].map(r1);
    els.push({ id, kind: 'fence', path: [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1), P(u0, v0)], width: 1, x: e0.x, y: e0.y, w: 1, d: 1, rot: 0, name, note, pinned: true }); };
  fenceOf(['mv-tennis', 'mv-pickleball'], 'mv-fence-courts', 'Court fence', '10 ft black vinyl chain link · windscreens · gates to the promenade');
  fenceOf(['mv-pooldeck'], 'mv-fence-pool', 'Pool fence', '5 ft ornamental pool fence · self-closing gates');
  // the woodland trail link: from the promenade's west end up beside the tennis court
  const w0 = AMB.at(STRIP_S[0] + 4), tl = [add(w0.p, w0.n, PAVE / 2 + 22), add(w0.p, w0.n, PAVE / 2 + 180)].map(p => p.map(r1));
  els.push({ id: 'mv-trail-link', kind: 'trail', path: tl, width: 6, r: 0, x: tl[0][0], y: tl[0][1], w: 6, d: 1, rot: 0, name: 'Trail link', note: 'Promenade up to the woodland trail', pinned: true });
  return { pavilion: els.find(e => e.id === 'mv-pavilion'), lodge: els.find(e => e.id === 'mv-hall'), courts: els.find(e => e.id === 'mv-tennis') };
}
// the gated entry: the gate house on the verge of Creeksong Way about 150 ft in from Happy Hollow Road (inbound side),
// a gate arm across the road beside it, and the mail kiosk on the far verge; each on open ground (not on a lot, the
// easement or the paving)
function entryGate(els, notes) {
  const road = NET[0], gate = road.path[0], lots = Object.values(GEO.lots).map(l => l.ring), out = [];
  const clear = ring => samples(ring).every(p => SP.inRing(p, GEO.parcel) && edgeDist(p, GEO.parcel) > 12 && !onRoad(p) && !lots.some(l => SP.inRing(p, l)) && !SP.inRing(p, GEO.easement.ring)) && !els.some(e => ['sign', 'building', 'drive', 'plaza'].includes(e.kind) && meet(ring, SP.outline(e)));
  for (const [id, w, d, name, note, extra] of [['mv-gatehouse', 20, 12, 'Gate house', 'Gated entry · guest check-in · 240 sf', { kind: 'building', use: 'amenity', floors: 1, type: 'resort-gate-house-240-sf' }], ['mv-mail', 16, 8, 'Mail kiosk', 'Cluster mailboxes · parcel lockers · covered', { kind: 'building', use: 'amenity', floors: 1 }]]) {
    let best = null;
    for (let s = 60; s <= 400 && !best; s += 5) { let acc = 0, q = null; for (let i = 1; i < road.path.length; i++) { const a = road.path[i - 1], b = road.path[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (acc + l >= s) { const k = (s - acc) / l; q = { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], t: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] }; break; } acc += l; }
      if (!q) break; for (const side of [1, -1]) { if (best) break; const n = [-q.t[1] * side, q.t[0] * side];
        for (const off of [PAVE / 2 + d / 2 + 3, PAVE / 2 + d / 2 + 8, PAVE / 2 + d / 2 + 14]) { const c = add(q.p, n, off), e = { id, ...extra, x: r1(c[0]), y: r1(c[1]), w, d, rot: r1(deg(q.t)), name, note, pinned: true }; if (clear(SP.outline(e))) { best = { e, q, n }; break; } } } }
    if (!best) { notes.push(name + ': no open ground by the entrance'); continue; }
    els.push(best.e); out.push(best);
    if (id === 'mv-gatehouse') { const a = add(best.q.p, best.n, PAVE / 2), b = add(best.q.p, best.n, -PAVE / 2); els.push({ id: 'mv-gate', kind: 'fence', path: [a, b].map(p => p.map(r1)), gate: true, width: 1, x: r1(best.q.p[0]), y: r1(best.q.p[1]), w: PAVE, d: 1, rot: 0, name: 'Entry gate', note: 'Owner fob and guest call box · emergency access', pinned: true }); }
  }
  return out;
}

// Option B's plan notes: what's where, with the walls that matter
function detailNotes(els) {
  const by = id => els.find(e => e.id === id), wall = id => { const e = by(id); return e?.grade ? Math.round(Math.max(e.grade.cutWall, e.grade.fillWall)) + ' ft' : '—'; };
  const patios = els.filter(e => /^mv-patio-/.test(e.id)).length, cabins = els.filter(e => e.kind === 'building' && e.use === 'sfr').length, rows = els.filter(e => e.kind === 'parking'), stalls = rows.reduce((t, e) => t + SP.stalls(e).count, 0);
  const walls = rows.filter(e => e.grade).map(e => Math.max(e.grade.cutWall, e.grade.fillWall));
  return ['Option B: the owners’ resort concept — one terrace along the uphill side of Amber Valley Way (lots 10-15): head-in parking off the road, a stone promenade behind it, and in one line west to east sports and the pool club, dining and catering, the wedding and conference hall, and the open-air pavilion. Same lots, roads and cabins as the Full program.',
    'Entry: gate house and gate arm (owner fob, guest call box, emergency access) on Creeksong Way, mail kiosk, monument sign at Happy Hollow Road.',
    'Parking: ' + stalls + ' head-in spaces in ' + rows.length + ' rows of 8 along the road (cut ' + (walls.length ? Math.round(Math.min(...walls)) + '-' + Math.round(Math.max(...walls)) : '—') + ' ft into the bank), plus three on each cabin driveway.',
    'Sports (lot 10): tennis court and four pickleball courts side by side inside a 10 ft fence (walls ' + wall('mv-tennis') + ' and ' + wall('mv-pickleball') + '), court pavilion and viewing deck behind.',
    'Pool club (lot 11): 28 × 64 ft heated pool and spa on a fenced deck (walls ' + wall('mv-pooldeck') + '), pool house and fitness room behind.',
    'Dining and catering (lots 11-12): dining terrace, The Lodge (2,500 sf dining room and bar) and the catering kitchen side by side, service yard and screened trash behind.',
    'Wedding and conference (lots 13-14): cocktail terrace, the 6,000 sf hall (walls ' + wall('mv-pavilion') + '), ceremony lawn terraced behind it, bridal cottage and photo garden beside it.',
    'East end (lots 14-15): the open-air pavilion and its lawn, a fire-pit overlook above, the maintenance barn.',
    'Cabins: ' + patios + ' of ' + cabins + ' have room for a walk-out patio (hot tub, fire pit) under the deck; every lot is kept wooded outside the cabin, deck and driveway.',
    'Retaining walls: stone, in tiers of about 10-12 ft with planting between wherever a pad needs more (every lot slopes 35-70%).'];
}

const grade = f => ({ pad: f.pad, fall: f.fall, slope: f.slope, toward: f.toward, cutCy: f.cutCy, fillCy: f.fillCy, cutWall: f.cutWall, fillWall: f.fillWall, level: f.level, ...(f.walkout != null ? { walkout: f.walkout } : {}) });
const g0 = v => Math.round(v).toLocaleString('en-US');
const padNote = f => 'Pad ' + g0(f.pad) + ' ft · walls to ' + g0(Math.max(f.cutWall, f.fillWall)) + ' ft · ' + g0(f.cutCy) + ' CY cut / ' + g0(f.fillCy) + ' CY fill';

export function buildOption({ now, detail = false }) {
  const els = [], ring = GEO.parcel, notes = [];
  const poly = (id, kind, pts, extra) => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), c = cen(pts); return { id, kind, poly: pts, x: r1(c[0]), y: r1(c[1]), w: r1(Math.max(...xs) - Math.min(...xs)), d: r1(Math.max(...ys) - Math.min(...ys)), rot: 0, ...extra }; };
  const pathEl = (id, kind, path, width, extra) => { const c = path[Math.floor(path.length / 2)]; return { id, kind, path: path.map(p => p.map(r1)), width, x: r1(c[0]), y: r1(c[1]), w: width, d: 1, rot: 0, ...extra }; };
  // the roads: 24 ft paving on the platted 50 ft rights-of-way, corners rounded
  NET.forEach((r, i) => els.push(pathEl('mv-road-' + (i + 1), 'drive', r.path, PAVE, { r: 0, name: r.name, note: '24 ft paved · 50 ft right-of-way (2007 plat)', pinned: true })));
  els.push(poly('mv-easement', 'keepout', GEO.easement.ring, { name: 'Lot 2 utility / sewage disposal easement', note: GEO.easement.acres + ' ac (2024 appraisal: 0.77 ac)' }));
  for (const [n, L] of Object.entries(GEO.lots)) els.push(poly('mv-lot-' + n, 'lot', L.ring, { name: 'Lot ' + n, note: L.acres_listed.toFixed(2) + ' ac platted' + (EXISTING.includes(+n) ? ' · financed home' : L.use === 'cabin' ? ' · cabin for sale' : ' · resort core') }));

  // the cabins
  const cabins = [];
  for (const [n, L] of Object.entries(GEO.lots)) {
    if (!['cabin', 'existing'].includes(L.use)) continue;
    const b = placeCabin(+n, L.ring); if (!b) { notes.push('Lot ' + n + ': no spot fits the cabin inside its yards'); continue; }
    const old = EXISTING.includes(+n), h = { id: 'mv-cabin-' + n, ...fromType(CABIN, [r1(b.house.x), r1(b.house.y)], r1(b.house.rot)), name: 'Lot ' + n, note: (old ? 'Financed home (position not surveyed)' : 'Montreve cabin · for sale') + ' · 3 bed · indoor pool' + (b.f.walkout ? ' · walk-out' : ''), grade: grade(b.f), pinned: true };
    els.push(h, { id: 'mv-deck-' + n, kind: 'plaza', ...b.deck, x: r1(b.deck.x), y: r1(b.deck.y), rot: r1(b.deck.rot), name: '', note: 'Deck', pinned: true },
      pathEl('mv-drive-' + n, 'drive', b.drive.path, DRIVE_W, { r: 0, d: r1(b.drive.len), name: '', note: 'Driveway · ' + Math.round(b.drive.len) + ' ft, level with the road (' + g0(b.drive.road) + ' ft) · ' + (b.up ? 'walk-out level' : 'main floor') + ' at road grade, ' + (b.drive.foundation >= 0 ? Math.round(b.drive.foundation) + ' ft of foundation under the entry' : 'dug ' + Math.round(-b.drive.foundation) + ' ft into the slope'), pinned: true }));
    h.entry = { floor: r1(b.drive.road), foundation: r1(b.drive.foundation), side: b.up ? 'walk-out level' : 'main floor' };
    if (detail) { // Option B: the walk-out patio below the deck (hot tub and fire pit), where it fits on the lot
      const dir = [b.deck.x - b.house.x, b.deck.y - b.house.y], k = Math.hypot(...dir) || 1, c = add([b.deck.x, b.deck.y], [dir[0] / k, dir[1] / k], DECK / 2 + 9), pat = { id: 'mv-patio-' + n, kind: 'patio', x: r1(c[0]), y: r1(c[1]), w: 24, d: 16, rot: r1(b.deck.rot), name: '', note: 'Walk-out patio · hot tub and fire pit under the deck', pinned: true };
      const ring = SP.outline(pat); if (fits(ring, L.ring, 3) && !els.some(e => e.kind === 'drive' && meet(ring, SP.outline(e)))) els.push(pat);
    }
    cabins.push({ n: +n, old, f: b.f, drive: b.drive });
  }

  // the resort core: three composed clusters along Amber Valley Way, each square to the road at its middle, linked by a
  // promenade (designCore below)
  const core = detail ? designStrip(els, notes) : designCore(els, notes);
  const pv = core.pavilion, hl = core.lodge;
  if (!pv) notes.push('The pavilion cluster did not fit on lots 14-15'); if (!hl) notes.push('The lodge cluster did not fit on lots 12-13'); if (!core.courts) notes.push('The courts did not fit on lots 10-11');

  // the woodland trail: a loop 15 ft inside the property line (a path the owners would grant, not an easement today)
  const loop = SP.offsetRing(ring, -15).every(p => SP.inRing(p, ring)) ? SP.offsetRing(ring, -15) : SP.offsetRing(ring, 15);
  els.push({ id: 'mv-trail', kind: 'trail', path: loop.map(p => p.map(r1)), closed: true, width: 6, r: 20, x: r1(cen(ring)[0]), y: r1(cen(ring)[1]), w: 6, d: 6, rot: 0, name: 'Woodland trail', note: 'Desired loop · not an easement', pinned: true });
  // the entrance sign beside Creeksong Way at Happy Hollow Road, on open ground
  const gate = NET[0].path[0], open = els.filter(e => ['building', 'lot', 'keepout', 'plaza'].includes(e.kind)).map(e => e.poly || SP.outline(e)).concat(PAVED);
  let sgn = null; for (let rr = 20; rr <= 300 && !sgn; rr += 5) for (let a = 0; a < 360 && !sgn; a += 10) { const p = [gate[0] + rr * Math.cos(a * Math.PI / 180), gate[1] + rr * Math.sin(a * Math.PI / 180)];
    if (SP.inRing(p, ring) && edgeDist(p, ring) > 6 && toRoad(p).d < 30 && open.every(o => !SP.inRing(p, o) && edgeDist(p, o) > 7)) sgn = p; }
  if (sgn) els.push({ id: 'mv-sign', kind: 'sign', x: r1(sgn[0]), y: r1(sgn[1]), w: 10, d: 5, rot: r1(deg(toRoad(sgn).t)), name: 'Montreve Mountain Club', pinned: true });

  if (detail) { // Option B: the plan worked up (DETAIL above), planted, and the entry gated
    entryGate(els, notes);
    // the lots stay wooded: everything outside a cabin, its deck and driveway, or the resort's terraces is kept forest
    for (const [n, L] of Object.entries(GEO.lots)) els.push(poly('mv-woods-' + n, 'green', SP.offsetRing(L.ring, -1.5), { name: '', trees: true, note: 'Lot ' + n + (['cabin', 'existing'].includes(L.use) ? ' kept wooded outside the cabin, deck and driveway' : ' kept wooded round the resort’s terraces') }));
  }
  let front = 0, bd = Infinity; for (let i = 0; i < ring.length; i++) { const d = segDist(gate, ring[i], ring[(i + 1) % ring.length])[0]; if (d < bd) { bd = d; front = i; } }
  const A = SAVED.optionA;
  const plan = { id: detail ? 'mv-option-b' : 'mv-full', name: detail ? 'Option B · the resort in detail' : 'Full program · Will’s plan on the lidar', src: 'parcel', origin: GEO.origin, ring, front, frontGuess: false, streets: [], streetsSet: true, streetsBy: 2, streetNames: { [front]: 'Happy Hollow Road' },
    setbacks: { front: 30, side: 10, rear: 10, paving: 0 }, parcel: A.parcel, parcels: A.parcels, zoning: null,
    program: { use: 'sfr', community: PROJECT.community }, elements: els, created: now, updated: now,
    notes: ['Will Essner’s full program (Montreve Smoky Mountain Resort Business Plan, Oct 22 2026) on the 30 platted lots, fitted to USGS 3DEP 1 m lidar.',
      'Lots from the Montreve vector lot map laid on the Regrid parcel (best overlap, no turn): not a survey. Roads drawn on the platted rights-of-way’ centrelines.',
      'Every lot slopes 35-70%: the cabins sit square to their roads and step down the hill as walk-outs; the pavilion, hall, courts and parking sit on level pads with retaining walls (each lists its pad, cut, fill and walls).',
      'The seven financed homes are shown in a standard position, not as built.', ...(detail ? detailNotes(els) : []), ...notes].join('\n') };
  return { plan, cabins, notes };
}

export function buildProject(parcels, { now = new Date().toISOString() } = {}) {
  const { plan } = buildOption({ now }), { plan: B } = buildOption({ now, detail: true }), A = SAVED.optionA;
  return { ...SAVED.doc, parcels: parcels?.length ? parcels : SAVED.doc.parcels, notes: SAVED.doc.notes || 'Montreve Mountain Club: resort core on lots 10-15 and 24 cabins for sale.', plans: [plan, B, A], updated: now, by: 'Claude Code (Montreve full program and Option B on the lidar)' };
}

// what was built, in numbers (for the seed script's log and the test)
export function summary(doc, k = 0) {
  const pl = doc.plans[k], m = SP.metrics(pl), B = pl.elements.filter(e => e.kind === 'building'), G = pl.elements.filter(e => e.grade);
  const level = G.filter(e => e.kind !== 'building' || e.use !== 'sfr');
  const outside = pl.elements.filter(e => !['trail', 'lot'].includes(e.kind) && !SP.shapeOf(e).every(p => SP.inRing(p, pl.ring) || edgeDist(p, pl.ring) < 1)).map(e => e.id);
  const overlaps = [], solid = pl.elements.filter(e => ['building', 'court', 'parking', 'green', 'plaza'].includes(e.kind) && !(e.kind === 'green' && !e.name));
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) { if (solid[i].id.replace(/^mv-(cabin|deck)-/, '') === solid[j].id.replace(/^mv-(cabin|deck)-/, '') && /^mv-(cabin|deck)-/.test(solid[i].id + solid[j].id)) continue; /* a cabin and its own deck share a wall */
    const a = SP.outline(solid[i]), b = SP.outline(solid[j]); if (a.some(p => SP.inRing(p, b)) || b.some(p => SP.inRing(p, a))) overlaps.push(solid[i].id + ' × ' + solid[j].id); }
  const lots = pl.elements.filter(e => e.kind === 'lot'), roadsOnLots = pl.elements.filter(e => e.kind === 'drive' && /^mv-road/.test(e.id)).flatMap(e => lots.filter(l => samples(SP.outline(e)).filter(p => SP.inRing(p, l.poly) && edgeDist(p, l.poly) > 2).length > 0).map(l => e.name + ' on ' + l.name));
  return { acres: +m.acres.toFixed(2), buildings: B.length, cabins: B.filter(e => e.use === 'sfr').length, gfa: Math.round(m.gfa), spaces: m.spaces, required: m.required, pondSf: 0, elements: pl.elements.length,
    walkouts: B.filter(e => e.use === 'sfr' && e.grade?.walkout).length, maxCabinExtra: Math.max(...B.filter(e => e.use === 'sfr').map(e => e.grade?.walkout === false ? Math.round(e.grade.fall - 12) : 0)),
    level: Object.fromEntries(level.map(e => [e.id, { pad: e.grade.pad, wall: Math.max(e.grade.cutWall, e.grade.fillWall), cutCy: e.grade.cutCy, fillCy: e.grade.fillCy }])),
    cutCy: level.reduce((s, e) => s + e.grade.cutCy, 0), fillCy: level.reduce((s, e) => s + e.grade.fillCy, 0), overlaps, outside, roadsOnLots };
}
