// MONTREVE MOUNTAIN CLUB: 2481 Happy Hollow Road, Sevierville, Tennessee (Sevier County parcel 122 005.00, 30.05 acres),
// laid out as Will Essner's full resort program (Montreve Smoky Mountain Resort Business Plan, Oct 22 2026, p. 5-6) on
// the recorded 2007 subdivision (30 lots, Amber Valley Way and Creeksong Way), fitted to the ground.
//   The lots and roads are the Montreve vector lot map's (projects/montreve/scripts/lots.py), laid on the Regrid parcel
//     outline by best overlap (scripts/georef.py: no turn, 2.5% larger) and kept exactly: one lot, one use.
//   The ground is USGS 3DEP 1 m lidar from the app's own terrain service (projects/montreve/data/terrain.json, 10 ft):
//     the site runs 1,348 to 1,837 ft and every lot slopes 35-70%.
//   Lots 14-15: the 6,000 sf glass wedding pavilion, its ceremony lawn and arrival parking. Lots 12-13: the 2,500 sf
//     dining and catering hall, its service yard and parking. Lots 10-11: a tennis court and two pickleball courts. The
//     seven financed homes (lots 1, 3, 6, 18, 21, 28, 30) and a new Montreve cabin on each of the other 17 lots.
//   Each piece is placed where the ground suits it best (lib/terrain.mjs padFit): a cabin facing downhill (its deck to
//     the view, the walk-out level below) where the fall across it is closest to one floor and its driveway stays under
//     15%; a level piece (the pavilion, the hall, the courts, parking) turned along the contours where its retaining
//     walls and earthwork are least. Each carries its pad elevation, cut, fill and walls (e.grade).
// The existing homes' positions are not surveyed: they are placed by the same rule as the new cabins.
// buildProject(parcels) returns the project document (id mvv5sk2y6l0dq, the team's existing MONTREVE MOUNTAIN CLUB),
// the new option first and the team's Option A kept as it was.
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

export const PROJECT = {
  id: SAVED.doc.id, name: SAVED.doc.name, county: 'Sevier', apns: FALLBACK_PARCELS.map(p => p.propId),
  community: 'Montreve Mountain Club'
};
const CABIN = typeById('cabin-montreve-cabin-3-level-2-444-sf-indoor-pool'), PAVILION = typeById('venue-glass-event-pavilion-6-000-sf'), HALL = typeById('resort-dining-catering-hall-2-500-sf');
const EXISTING = [1, 3, 6, 18, 21, 28, 30];
const DECK = 9, SIDE = 10, FRONT = 20, DRIVE_MAX = 0.15; // deck depth; side yard to a lot line; front yard to the road; steepest driveway

// ---------- geometry helpers (plan feet) ----------
const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return [Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy), [a[0] + t * dx, a[1] + t * dy]]; };
const nearest = (p, ring) => { let best = [Infinity, null]; for (let i = 0; i < ring.length; i++) { const r = segDist(p, ring[i], ring[(i + 1) % ring.length]); if (r[0] < best[0]) best = r; } return best; };
const edgeDist = (p, ring) => nearest(p, ring)[0];
const samples = r => { const out = []; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; for (let t = 0; t < 1; t += 0.25) out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } return out; };
// a rectangle piece's corners and edge points lie inside the ring, at least `inset` ft from its edge
const fits = (r, ring, inset) => samples(r).every(p => SP.inRing(p, ring) && edgeDist(p, ring) >= inset);
const cross = (a, b, c, d) => { const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; };
// two rings touch or overlap (any edges crossing, or one inside the other): the app's own test (lib/siteplan.mjs polysOverlap)
const meet = (A, B) => A.some((p, i) => B.some((q, j) => cross(p, A[(i + 1) % A.length], q, B[(j + 1) % B.length]))) || A.some(p => SP.inRing(p, B)) || B.some(p => SP.inRing(p, A));
const clear = (r, others, gap) => others.every(o => samples(r).every(p => !SP.inRing(p, o) && edgeDist(p, o) >= gap) && samples(o).every(p => !SP.inRing(p, r)));
const rect = (x, y, w, d, rot) => ({ x, y, w, d, rot });
const at = (e, u, v) => { const q = SP.rotPt([u, v], e.rot || 0); return [e.x + q[0], e.y + q[1]]; };
const ROADS = GEO.roads.map(r => r.ring);
const toRoad = p => ROADS.map(r => nearest(p, r)).sort((a, b) => a[0] - b[0])[0]; // [ft, the point on the road's edge]
// where a driveway may meet a road: the internal roads' edges every 8 ft, and Happy Hollow Road along the parcel's west
// line (lot 1, the financed home at 2479 Happy Hollow Road, is reached from it)
const ACCESS = [...ROADS.flatMap(r => samples(r).concat(r.flatMap((a, i) => { const b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.floor(L / 8); return Array.from({ length: n }, (_, k) => [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }))),
  ...GEO.parcel.flatMap((a, i) => { const b = GEO.parcel[(i + 1) % GEO.parcel.length]; if (a[0] > -950 || b[0] > -950) return []; const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.floor(L / 8), m = [(b[1] - a[1]) / L * -7, (b[0] - a[0]) / L * 7]; return Array.from({ length: n }, (_, k) => [a[0] + (b[0] - a[0]) * k / n + m[0], a[1] + (b[1] - a[1]) * k / n + m[1]]); })]; // 7 ft inside the line (the parcel ring runs counter-clockwise: inward is left)
const downhill = ([x, y], h = 15) => { const gx = (TR.zAt(TERRAIN, [x + h, y]) - TR.zAt(TERRAIN, [x - h, y])) / (2 * h), gy = (TR.zAt(TERRAIN, [x, y + h]) - TR.zAt(TERRAIN, [x, y - h])) / (2 * h), L = Math.hypot(gx, gy) || 1; return [-gx / L, -gy / L]; };
const deg = ([dx, dy]) => Math.atan2(dy, dx) * 180 / Math.PI;
const bbox = ring => { const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
const cen = ring => SP.centroid(ring);
// the long axis of a ring (its vertices' principal direction), degrees
const axisOf = ring => { const c = cen(ring); let a = 0, b = 0, d = 0; for (const p of ring) { const x = p[0] - c[0], y = p[1] - c[1]; a += x * x; b += x * y; d += y * y; } return 0.5 * Math.atan2(2 * b, a - d) * 180 / Math.PI; };
const r1 = v => Math.round(v * 10) / 10;

// ---------- a cabin on its lot ----------
// candidates every 6 ft over the lot; each faces downhill (its deck to the view). Cost: the fall a walk-out can't take
// (heavily), a driveway steeper than 15% (more heavily), then a long driveway and being far down the lot.
function placeCabin(n, lot) {
  const [x0, y0, x1, y1] = bbox(lot), W = CABIN.w, D = CABIN.d, cand = [];
  // pass 1: every spot the house and deck fit, facing downhill, by how well it takes a walk-out
  for (let x = x0; x <= x1; x += 6) for (let y = y0; y <= y1; y += 6) {
    if (!SP.inRing([x, y], lot)) continue;
    const dir = downhill([x, y]), rot = Math.round((deg(dir) - 90) / 5) * 5; // local +y downhill: the deck side
    const house = rect(x, y, W, D, rot), deck = rect(...at(house, 0, D / 2 + DECK / 2), W, DECK, rot), all = rect(...at(house, 0, DECK / 2), W, D + DECK, rot);
    const ring = SP.outline(all); if (!fits(ring, lot, SIDE) || ROADS.some(r => samples(ring).some(p => edgeDist(p, r) < FRONT || SP.inRing(p, r)))) continue;
    const f = TR.padFit(TERRAIN, { kind: 'building', use: 'sfr', floors: 3, ...house }); if (!f) continue;
    cand.push({ pre: 6 * Math.max(0, f.fall - 12) + 0.5 * Math.abs(f.fall - 10) + 0.04 * toRoad([x, y])[0], house, deck, f, ring });
  }
  cand.sort((a, b) => a.pre - b.pre);
  // pass 2, the best 30: the driveway, from either end of the house (8 ft out) to any point on a road's edge within
  // 280 ft, straight, on its own lot and off the easement; the gentlest wins (a diagonal across the slope, as mountain
  // driveways run). It meets the floor nearest the road's grade: the main floor, or the walk-out level below.
  let best = null;
  for (const c of cand.slice(0, 30)) {
    const { house, deck, f } = c; let lg = null;
    for (const p of [at(house, 0, -D / 2 - 8), at(house, 0, D / 2 + DECK + 8)]) {
      if (!SP.inRing(p, lot)) continue;
      for (const q of ACCESS) {
        const L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L > 280 || L < 6) continue;
        const zr = TR.zAt(TERRAIN, q), grade = Math.min(Math.abs(f.pad - zr), Math.abs(f.min - zr)) / L, cc = 400 * Math.max(0, grade - DRIVE_MAX) + 0.06 * L;
        if (lg && cc >= lg.c) continue; // (the geometry checks only for a better one)
        const ring = SP.outline({ kind: 'drive', path: [p, q], width: 12, r: 0, x: 0, y: 0, w: 12, d: L, rot: 0 }), band = samples(ring); // the app's own driveway outline
        if (meet(ring, GEO.easement.ring) || band.some(b => edgeDist(b, GEO.easement.ring) < 2)) continue;
        if (meet(ring, c.ring) || band.some(b => edgeDist(b, c.ring) < 1.5)) continue;
        if (band.some(b => !SP.inRing(b, lot) && !ROADS.some(r => SP.inRing(b, r)) && toRoad(b)[0] > 3 && !(edgeDist(b, GEO.parcel) < 8 && b[0] < -900))) continue; // (the strip along the west line meets Happy Hollow Road)
        lg = { c: cc, p, q, L, grade };
      }
    }
    if (!lg) continue;
    const cost = c.pre + lg.c;
    if (!best || cost < best.cost) best = { cost, house, deck, f, drive: { from: lg.p, to: lg.q, len: lg.L, grade: lg.grade } };
  }
  return best;
}

// ---------- a level piece on a site ----------
// candidates every `step` ft, turned along the contours there (and the site's own axes); cost: the taller retaining wall
// plus a little for earthwork, and for parking its distance to the road (it has to be reached)
function placeLevel(site, w, d, { taken = [], gap = 10, inset = 8, step = 8, nearRoad = 0, kind = 'court', toward = null, align = null } = {}) {
  const [x0, y0, x1, y1] = bbox(site), ax = axisOf(site); let best = null;
  for (let x = x0; x <= x1; x += step) for (let y = y0; y <= y1; y += step) {
    if (!SP.inRing([x, y], site)) continue;
    const c = deg(downhill([x, y])) - 90, rots = align != null ? [align, align + 90] : [...new Set([c, c + 90, ax, ax + 90].map(v => Math.round(v / 5) * 5))]; // align: square to a piece already placed
    for (const rot of rots) {
      const e = rect(x, y, w, d, rot), ring = SP.outline(e);
      if (!fits(ring, site, inset) || !clear(ring, taken, gap)) continue;
      const f = TR.padFit(TERRAIN, { kind, ...e }); if (!f) continue;
      const road = toRoad([x, y])[0], edge = Math.min(...ring.map(p => toRoad(p)[0]));
      let cost = Math.max(f.cutWall, f.fillWall) + 0.002 * (f.cutCy + f.fillCy);
      if (nearRoad) cost += nearRoad * Math.max(0, edge - 4);
      if (toward) cost += 0.08 * Math.hypot(x - toward[0], y - toward[1]);
      if (!best || cost < best.cost) best = { cost, e, f, road };
    }
  }
  return best;
}

// head-in parking rows along the road (the private road is their aisle, as on a mountain resort's drive): 18 ft deep,
// their long side on the road's edge, cutting about 9 ft into the hill instead of a 60 ft bay's 30. Greedy: the row
// with the lowest wall first, then the next, until `want` spaces or no row under `maxWall` fits.
function placeRows(site, want, { taken = [], maxWall = 10 } = {}) {
  const rows = [], edge = []; let got = 0;
  for (let i = 0; i < site.length; i++) { const a = site[i], b = site[(i + 1) % site.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let t = 5; t < L; t += 10) { const p = [a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L]; if (toRoad(p)[0] < 3) edge.push(p); } }
  while (got < want) {
    let best = null;
    for (const p of edge) {
      const q = toRoad(p)[1], road = ROADS.find(r => nearest(p, r)[0] < 3.5) || ROADS[0];
      const k = road.map((v, i) => [segDist(q, v, road[(i + 1) % road.length])[0], i]).sort((a, b) => a[0] - b[0])[0][1], u = [road[(k + 1) % road.length][0] - road[k][0], road[(k + 1) % road.length][1] - road[k][1]], Lu = Math.hypot(...u) || 1;
      let n = [-u[1] / Lu, u[0] / Lu]; if (!SP.inRing([p[0] + n[0] * 12, p[1] + n[1] * 12], site)) n = [-n[0], -n[1]];
      for (const len of [180, 144, 108, 72]) {
        const e = rect(p[0] + n[0] * 9.5, p[1] + n[1] * 9.5, len, 18, Math.round(deg([u[0], u[1]]) * 10) / 10), ring = SP.outline(e);
        if (!fits(ring, site, 0.3) || !clear(ring, [...taken, ...rows.map(r => SP.outline(r.e))], 6)) continue;
        const f = TR.padFit(TERRAIN, { kind: 'parking', ...e }); if (!f) continue;
        const wall = Math.max(f.cutWall, f.fillWall); if (wall > maxWall) continue;
        const cost = wall - len / 40; if (!best || cost < best.cost) best = { cost, e, f };
      }
    }
    if (!best) break;
    rows.push(best); got += Math.floor(best.e.w / 9);
  }
  return rows;
}

// parallel parking on the road's shoulder in front of a site (the 50 ft right-of-way is wider than a mountain road's
// paving): 22 x 8.5 ft spaces in straight pieces of two, chained along the curve, at the road's own grade (no walls)
function placeParallel(site, { piece = 44, depth = 8.5 } = {}) {
  const pts = [];
  for (let i = 0; i < site.length; i++) { const a = site[i], b = site[(i + 1) % site.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let t = 0; t < L; t += 3) { const p = [a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L]; pts.push({ p, on: toRoad(p)[0] < 2.5 }); } }
  const k0 = pts.findIndex(q => !q.on); const ring = k0 < 0 ? pts : pts.slice(k0).concat(pts.slice(0, k0)), runs = []; let cur = [];
  for (const q of ring) { if (q.on) cur.push(q.p); else if (cur.length) { runs.push(cur); cur = []; } } if (cur.length) runs.push(cur);
  const out = [];
  for (const run of runs) {
    let i = 0;
    while (i < run.length - 1) {
      let j = i; while (j < run.length - 1 && Math.hypot(run[j + 1][0] - run[i][0], run[j + 1][1] - run[i][1]) <= piece) j++;
      const a = run[i], b = run[j], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < piece - 2) break;
      const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; let n = [-u[1], u[0]];
      if (SP.inRing([mid[0] + n[0] * 6, mid[1] + n[1] * 6], site)) n = [-n[0], -n[1]]; // toward the road
      for (let off = 0.5; off <= 8; off += 0.5) { // out from the chord until it sits wholly on the right-of-way (a curve bows past the chord)
        const e = rect(mid[0] + n[0] * (depth / 2 + off), mid[1] + n[1] * (depth / 2 + off), piece, depth, Math.round(deg(u) * 10) / 10);
        if (samples(SP.outline(e)).every(p => ROADS.some(r => SP.inRing(p, r)))) { out.push(e); break; }
      }
      i = j;
    }
  }
  return out;
}

const grade = f => ({ pad: f.pad, fall: f.fall, slope: f.slope, toward: f.toward, cutCy: f.cutCy, fillCy: f.fillCy, cutWall: f.cutWall, fillWall: f.fillWall, level: f.level, ...(f.walkout != null ? { walkout: f.walkout } : {}) });
const g0 = v => Math.round(v).toLocaleString('en-US');
const padNote = f => 'Pad ' + g0(f.pad) + ' ft · walls to ' + g0(Math.max(f.cutWall, f.fillWall)) + ' ft · ' + g0(f.cutCy) + ' CY cut / ' + g0(f.fillCy) + ' CY fill';

export function buildOption({ now }) {
  const els = [], ring = GEO.parcel, notes = [];
  const poly = (id, kind, pts, extra) => { const b = bbox(pts), c = cen(pts); return { id, kind, poly: pts, x: r1(c[0]), y: r1(c[1]), w: r1(b[2] - b[0]), d: r1(b[3] - b[1]), rot: 0, ...extra }; };
  // the roads (50 ft rights-of-way, as platted) and the lot 2 easement
  GEO.roads.forEach((r, i) => els.push(poly('mv-road-' + (i + 1), 'drive', r.ring, { name: r.name, note: '50 ft right-of-way (2007 plat)', pinned: true })));
  els.push(poly('mv-easement', 'keepout', GEO.easement.ring, { name: 'Lot 2 utility / sewage disposal easement', note: GEO.easement.acres + ' ac (2024 appraisal: 0.77 ac)' }));
  // every platted lot, as recorded
  for (const [n, L] of Object.entries(GEO.lots)) els.push(poly('mv-lot-' + n, 'lot', L.ring, { name: 'Lot ' + n, note: L.acres_listed.toFixed(2) + ' ac platted' + (EXISTING.includes(+n) ? ' · financed home' : L.use === 'cabin' ? ' · cabin for sale' : ' · resort core'), on: null }));

  // cabins: the seven financed homes and a new cabin on every other sale lot
  const cabins = [];
  for (const [n, L] of Object.entries(GEO.lots)) {
    if (!['cabin', 'existing'].includes(L.use)) continue;
    const b = placeCabin(+n, L.ring); if (!b) { notes.push('Lot ' + n + ': no spot fits the cabin inside its yards'); continue; }
    const old = EXISTING.includes(+n), h = { id: 'mv-cabin-' + n, ...fromType(CABIN, [b.house.x, b.house.y], b.house.rot), name: 'Lot ' + n, note: (old ? 'Financed home (position not surveyed)' : 'Montreve cabin · for sale') + ' · 3 bed · indoor pool', grade: grade(b.f), pinned: true };
    h.x = r1(h.x); h.y = r1(h.y);
    els.push(h, { id: 'mv-deck-' + n, kind: 'plaza', ...b.deck, x: r1(b.deck.x), y: r1(b.deck.y), name: '', note: 'Deck', pinned: true },
      { id: 'mv-drive-' + n, kind: 'drive', path: [b.drive.from, b.drive.to].map(p => p.map(r1)), width: 12, r: 0, x: r1((b.drive.from[0] + b.drive.to[0]) / 2), y: r1((b.drive.from[1] + b.drive.to[1]) / 2), w: 12, d: r1(b.drive.len), rot: 0, name: '', note: 'Driveway · ' + Math.round(b.drive.len) + ' ft at ' + Math.round(b.drive.grade * 100) + '%', pinned: true });
    cabins.push({ n: +n, old, f: b.f, drive: b.drive });
  }

  // the resort core
  const P = GEO.pairs, core = [];
  const put = (id, kind, b, extra) => { const e = { id, kind, ...b.e, x: r1(b.e.x), y: r1(b.e.y), grade: grade(b.f), pinned: true, ...extra }; els.push(e); core.push(SP.outline(e)); return e; };
  // lots 14-15: the pavilion where its pad is cheapest, arrival parking toward the road, the lawn beside the pavilion
  const pav = placeLevel(P.pavilion, PAVILION.w, PAVILION.d, { kind: 'building' });
  const pv = put('mv-pavilion', 'building', pav, { use: 'venue', floors: 1, type: PAVILION.id, name: 'Glass wedding pavilion', note: 'Wedding / event venue · ~150 guests · ' + padNote(pav.f) });
  placeRows(P.pavilion, 40, { taken: core }).forEach((b, i) => put('mv-park-pavilion-' + (i + 1), 'parking', b, { row: 1, name: '', note: 'Head-in off Amber Valley Way · ' + padNote(b.f) }));
  const lawn = placeLevel(P.pavilion, 70, 50, { kind: 'green', taken: core, gap: 12, toward: [pv.x, pv.y], align: pv.rot }) || placeLevel(P.pavilion, 70, 50, { kind: 'green', taken: core, gap: 12, toward: [pv.x, pv.y] });
  if (lawn) put('mv-lawn', 'green', lawn, { name: 'Ceremony lawn', note: padNote(lawn.f) }); else notes.push('The ceremony lawn did not fit on lots 14-15');
  // lots 12-13: the dining and catering hall, its service yard, parking toward the road
  const hall = placeLevel(P.dining, HALL.w, HALL.d, { kind: 'building' });
  const hl = put('mv-hall', 'building', hall, { use: 'restaurant', floors: 1, type: HALL.id, name: 'Dining & catering hall', note: 'Owners’ dining · caterers’ kitchen · ' + padNote(hall.f) });
  placeRows(P.dining, 40, { taken: core }).forEach((b, i) => put('mv-park-hall-' + (i + 1), 'parking', b, { row: 1, name: '', note: 'Head-in off Amber Valley Way · ' + padNote(b.f) }));
  const svc = placeLevel(P.dining, 30, 24, { kind: 'plaza', taken: core, toward: [hl.x, hl.y] });
  if (svc) put('mv-service', 'plaza', svc, { name: 'Service yard', note: 'Deliveries · trash · catering vans' });
  // event parking on the road's shoulder along the resort core's frontage
  let pp = 0; for (const site of [P.courts, P.dining, P.pavilion]) for (const e of placeParallel(site)) els.push({ id: 'mv-curb-' + (++pp), kind: 'parking', ...e, x: r1(e.x), y: r1(e.y), row: 1, sw: 22, sd: 8.5, name: '', note: 'Parallel parking on the road shoulder', pinned: true });
  // lots 10-11: one tennis court (60 x 120 fenced) and two pickleball courts (60 x 60), each turned along the contours
  const [tw, td] = SP.courtSize('tennis', 1), [pw, pd] = SP.courtSize('pickleball', 2);
  const ten = placeLevel(P.courts, tw, td, { kind: 'court' });
  if (ten) put('mv-tennis', 'court', ten, { sport: 'tennis', courts: 1, name: 'Tennis court', note: padNote(ten.f) });
  const pick = (ten && placeLevel(P.courts, pw, pd, { kind: 'court', taken: core, align: ten.e.rot, toward: [ten.e.x, ten.e.y] })) || placeLevel(P.courts, pw, pd, { kind: 'court', taken: core });
  if (pick) put('mv-pickleball', 'court', pick, { sport: 'pickleball', courts: 2, name: 'Pickleball courts', note: padNote(pick.f) }); else notes.push('The pickleball courts did not fit on lots 10-11');

  // footpaths from the parking up to the pavilion, the hall and the courts (5 ft, stepped where steep)
  const parks = els.filter(e => e.kind === 'parking' && !e.sw);
  for (const [k, e] of [['pavilion', pv], ['hall', hl], ['courts', ten ? els.find(x => x.id === 'mv-tennis') : null]]) {
    if (!e) continue; const ends = SP.outline(e).map((p, i, r) => [(p[0] + r[(i + 1) % r.length][0]) / 2, (p[1] + r[(i + 1) % r.length][1]) / 2]);
    const from = parks.length ? parks.map(q => [q.x, q.y]) : [toRoad([e.x, e.y])[1]], pair = ends.flatMap(a => from.map(b => [a, b])).sort((u, v) => Math.hypot(u[0][0] - u[1][0], u[0][1] - u[1][1]) - Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]))[0];
    const L = Math.hypot(pair[0][0] - pair[1][0], pair[0][1] - pair[1][1]), dz = Math.abs(TR.zAt(TERRAIN, pair[0]) - TR.zAt(TERRAIN, pair[1]));
    els.push({ id: 'mv-path-' + k, kind: 'trail', path: [pair[1], pair[0]].map(p => p.map(r1)), width: 5, r: 0, x: r1((pair[0][0] + pair[1][0]) / 2), y: r1((pair[0][1] + pair[1][1]) / 2), w: 5, d: r1(L), rot: 0, name: '', note: 'Footpath · ' + Math.round(L) + ' ft, ' + Math.round(dz) + ' ft climb' + (dz / Math.max(1, L) > 0.083 ? ' (steps or switchbacks)' : ''), pinned: true });
  }
  // the woodland trail: a loop 15 ft inside the property line (a path the owners would grant, not an easement today)
  const loop = SP.offsetRing(ring, -15).every(p => SP.inRing(p, ring)) ? SP.offsetRing(ring, -15) : SP.offsetRing(ring, 15);
  els.push({ id: 'mv-trail', kind: 'trail', path: loop.map(p => p.map(r1)), closed: true, width: 6, r: 20, x: r1(cen(ring)[0]), y: r1(cen(ring)[1]), w: 6, d: 6, rot: 0, name: 'Woodland trail', note: 'Desired loop · not an easement', pinned: true });
  // the entrance sign at Happy Hollow Road
  const entry = GEO.roads.flatMap(r => r.ring).sort((a, b) => a[0] - b[0])[0], solids = els.filter(e => ['building', 'lot', 'drive', 'keepout', 'plaza'].includes(e.kind)).map(e => e.poly || SP.outline(e)); // a sign stands on open landscape
  let sgn = null; for (let rr = 20; rr <= 400 && !sgn; rr += 5) for (let a = 0; a < 360 && !sgn; a += 10) { const p = [entry[0] + rr * Math.cos(a * Math.PI / 180), entry[1] + rr * Math.sin(a * Math.PI / 180)]; // beside the road at the gate, clear of the homes
    if (SP.inRing(p, ring) && edgeDist(p, ring) > 6 && toRoad(p)[0] < 30 && solids.every(o => !SP.inRing(p, o) && edgeDist(p, o) > 7)) sgn = p; }
  sgn ||= [entry[0] + 40, entry[1] + 20];
  els.push({ id: 'mv-sign', kind: 'sign', x: r1(sgn[0]), y: r1(sgn[1]), w: 10, d: 5, rot: 0, name: 'Montreve Mountain Club', pinned: true });

  // the front: the property line nearest the entrance (Happy Hollow Road)
  let front = 0, bd = Infinity; for (let k = 0; k < ring.length; k++) { const d = segDist(entry, ring[k], ring[(k + 1) % ring.length])[0]; if (d < bd) { bd = d; front = k; } }
  const A = SAVED.optionA;
  const plan = { id: 'mv-full', name: 'Full program · Will’s plan on the lidar', src: 'parcel', origin: GEO.origin, ring, front, frontGuess: false, streets: [], streetsSet: true, streetsBy: 2, streetNames: { [front]: 'Happy Hollow Road' },
    setbacks: { front: 30, side: 10, rear: 10, paving: 5 }, parcel: A.parcel, parcels: A.parcels, zoning: null,
    program: { use: 'sfr', community: PROJECT.community }, elements: els, created: now, updated: now,
    notes: [
      'Will Essner’s full program (Montreve Smoky Mountain Resort Business Plan, Oct 22 2026) on the 30 platted lots, fitted to USGS 3DEP 1 m lidar.',
      'Lots and roads from the Montreve vector lot map laid on the Regrid parcel (best overlap, no turn): not a survey. North is true north.',
      'Every lot slopes 35-70%: the cabins step down the hill as walk-outs; the pavilion, hall, courts and parking sit on level pads with retaining walls (each piece lists its pad, cut, fill and walls).',
      'The seven financed homes are shown in a standard position, not as built.',
      ...notes].join('\n') };
  return { plan, cabins, notes };
}

export function buildProject(parcels, { now = new Date().toISOString() } = {}) {
  const { plan } = buildOption({ now }), A = SAVED.optionA;
  return { ...SAVED.doc, parcels: parcels?.length ? parcels : SAVED.doc.parcels, notes: SAVED.doc.notes || 'Montreve Mountain Club: resort core on lots 10-15 and 24 cabins for sale.', plans: [plan, A], updated: now, by: 'Claude Code (Montreve full program on the lidar)' };
}

// what was built, in numbers (for the seed script's log and the test)
export function summary(doc) {
  const pl = doc.plans[0], m = SP.metrics(pl), B = pl.elements.filter(e => e.kind === 'building'), G = pl.elements.filter(e => e.grade);
  const level = G.filter(e => e.kind !== 'building' || e.use !== 'sfr');
  const outside = pl.elements.filter(e => !['trail', 'lot'].includes(e.kind) && !SP.shapeOf(e).every(p => SP.inRing(p, pl.ring) || edgeDist(p, pl.ring) < 1)).map(e => e.id);
  const overlaps = [];
  const solid = pl.elements.filter(e => ['building', 'court', 'parking', 'green', 'plaza'].includes(e.kind) && !(e.kind === 'green' && !e.name));
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) { if (solid[i].id.replace(/^mv-(cabin|deck)-/, '') === solid[j].id.replace(/^mv-(cabin|deck)-/, '') && /^mv-(cabin|deck)-/.test(solid[i].id + solid[j].id)) continue; /* a cabin and its own deck share a wall */ const a = SP.outline(solid[i]), b = SP.outline(solid[j]); if (a.some(p => SP.inRing(p, b)) || b.some(p => SP.inRing(p, a))) overlaps.push(solid[i].id + ' × ' + solid[j].id); }
  return { acres: +m.acres.toFixed(2), buildings: B.length, cabins: B.filter(e => e.use === 'sfr').length, gfa: Math.round(m.gfa), spaces: m.spaces, required: m.required, pondSf: 0, elements: pl.elements.length,
    walkouts: B.filter(e => e.use === 'sfr' && e.grade?.walkout).length, maxCabinExtra: Math.max(...B.filter(e => e.use === 'sfr').map(e => e.grade?.walkout === false ? Math.round((e.grade.fall - 12)) : 0)),
    level: Object.fromEntries(level.map(e => [e.id, { pad: e.grade.pad, wall: Math.max(e.grade.cutWall, e.grade.fillWall), cutCy: e.grade.cutCy, fillCy: e.grade.fillCy }])),
    cutCy: level.reduce((s, e) => s + e.grade.cutCy, 0), fillCy: level.reduce((s, e) => s + e.grade.fillCy, 0), overlaps, outside };
}
