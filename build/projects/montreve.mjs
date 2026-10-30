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

const grade = f => ({ pad: f.pad, fall: f.fall, slope: f.slope, toward: f.toward, cutCy: f.cutCy, fillCy: f.fillCy, cutWall: f.cutWall, fillWall: f.fillWall, level: f.level, ...(f.walkout != null ? { walkout: f.walkout } : {}) });
const g0 = v => Math.round(v).toLocaleString('en-US');
const padNote = f => 'Pad ' + g0(f.pad) + ' ft · walls to ' + g0(Math.max(f.cutWall, f.fillWall)) + ' ft · ' + g0(f.cutCy) + ' CY cut / ' + g0(f.fillCy) + ' CY fill';

export function buildOption({ now }) {
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
    cabins.push({ n: +n, old, f: b.f, drive: b.drive });
  }

  // the resort core
  const P = GEO.pairs, core = [];
  const put = (id, kind, b, extra) => { const e = { id, kind, ...b.e, x: r1(b.e.x), y: r1(b.e.y), rot: r1(b.e.rot), grade: grade(b.f), pinned: true, ...extra }; els.push(e); core.push(SP.outline(e)); return e; };
  // head-in parking along the pavement first (it fronts every amenity lot), then the buildings and courts behind it
  let k = 0;
  for (const site of [P.courts, P.dining, P.pavilion]) for (const b of frontRows(site, siteFrame(site))) put('mv-park-' + (++k), 'parking', b, { row: b.e.row, name: '', note: 'Head-in off Amber Valley Way · ' + padNote(b.f) });
  const behind = { taken: core.slice(), v0: 50 };
  const Fp = siteFrame(P.pavilion), pav = placeRow(Fp, P.pavilion, [{ id: 'mv-pavilion', kind: 'building', w: PAVILION.w, d: PAVILION.d }, { id: 'mv-lawn', kind: 'green', w: 70, d: 50 }], behind)
    || placeRow(Fp, P.pavilion, [{ id: 'mv-pavilion', kind: 'building', w: PAVILION.w, d: PAVILION.d }], behind);
  const pv = pav && put('mv-pavilion', 'building', pav[0], { use: 'venue', floors: 1, type: PAVILION.id, name: 'Glass wedding pavilion', note: 'Wedding / event venue · ~150 guests · ' + padNote(pav[0].f) });
  if (pav?.[1]) put('mv-lawn', 'green', pav[1], { name: 'Ceremony lawn', note: padNote(pav[1].f) }); else notes.push('The ceremony lawn did not fit beside the pavilion');
  const Fd = siteFrame(P.dining), din = placeRow(Fd, P.dining, [{ id: 'mv-hall', kind: 'building', w: HALL.w, d: HALL.d }, { id: 'mv-service', kind: 'plaza', w: 30, d: 24 }], { ...behind, gap: 8 });
  const hl = din && put('mv-hall', 'building', din[0], { use: 'restaurant', floors: 1, type: HALL.id, name: 'Dining & catering hall', note: 'Owners’ dining · caterers’ kitchen · ' + padNote(din[0].f) });
  if (din?.[1]) put('mv-service', 'plaza', din[1], { name: 'Service yard', note: 'Deliveries · trash · catering vans' });
  const Fc = siteFrame(P.courts), [tw, td] = SP.courtSize('tennis', 1), [pw, pd] = SP.courtSize('pickleball', 2);
  // courts: their length along the road (local y along it), side by side
  const crt = placeRow(Fc, P.courts, [{ id: 'mv-tennis', kind: 'court', w: td, d: tw }, { id: 'mv-pickleball', kind: 'court', w: pd, d: pw }], { ...behind, gap: 12 });
  if (crt) {
    const turn = b => ({ ...b, e: { ...b.e, w: b.e.d, d: b.e.w, rot: b.e.rot + 90 } }); // a court's own axes: across (w) and its length (d)
    put('mv-tennis', 'court', turn(crt[0]), { sport: 'tennis', courts: 1, name: 'Tennis court', note: padNote(crt[0].f) });
    put('mv-pickleball', 'court', turn(crt[1]), { sport: 'pickleball', courts: 2, name: 'Pickleball courts', note: padNote(crt[1].f) });
  } else notes.push('The courts did not fit on lots 10-11');
  if (!pv) notes.push('The pavilion did not fit on lots 14-15'); if (!hl) notes.push('The hall did not fit on lots 12-13');

  // walks from the parking up to each building and the courts (5 ft; steps where steep)
  const parks = els.filter(e => e.kind === 'parking');
  for (const [key, e] of [['pavilion', pv], ['hall', hl], ['courts', els.find(x => x.id === 'mv-tennis')]]) {
    if (!e || !parks.length) continue; const F = siteFrame(key === 'pavilion' ? P.pavilion : key === 'hall' ? P.dining : P.courts);
    const front = add([e.x, e.y], F.n, -Math.abs(SP.rotPt([0, 1], e.rot)[0] * F.n[0] + SP.rotPt([0, 1], e.rot)[1] * F.n[1]) > 0.7 ? -e.d / 2 : -e.w / 2), pk = parks.map(q => [q.x, q.y]).sort((a, b) => Math.hypot(a[0] - front[0], a[1] - front[1]) - Math.hypot(b[0] - front[0], b[1] - front[1]))[0];
    const from = add(pk, F.n, 10), L = Math.hypot(front[0] - from[0], front[1] - from[1]), dz = Math.abs(z(front) - z(from));
    if (L > 8) els.push(pathEl('mv-walk-' + key, 'trail', [from, front], 5, { r: 0, d: r1(L), name: '', note: 'Walk · ' + Math.round(L) + ' ft, ' + Math.round(dz) + ' ft climb' + (dz / L > 0.083 ? ' (steps)' : ''), pinned: true }));
  }

  // the woodland trail: a loop 15 ft inside the property line (a path the owners would grant, not an easement today)
  const loop = SP.offsetRing(ring, -15).every(p => SP.inRing(p, ring)) ? SP.offsetRing(ring, -15) : SP.offsetRing(ring, 15);
  els.push({ id: 'mv-trail', kind: 'trail', path: loop.map(p => p.map(r1)), closed: true, width: 6, r: 20, x: r1(cen(ring)[0]), y: r1(cen(ring)[1]), w: 6, d: 6, rot: 0, name: 'Woodland trail', note: 'Desired loop · not an easement', pinned: true });
  // the entrance sign beside Creeksong Way at Happy Hollow Road, on open ground
  const gate = NET[0].path[0], open = els.filter(e => ['building', 'lot', 'keepout', 'plaza'].includes(e.kind)).map(e => e.poly || SP.outline(e)).concat(PAVED);
  let sgn = null; for (let rr = 20; rr <= 300 && !sgn; rr += 5) for (let a = 0; a < 360 && !sgn; a += 10) { const p = [gate[0] + rr * Math.cos(a * Math.PI / 180), gate[1] + rr * Math.sin(a * Math.PI / 180)];
    if (SP.inRing(p, ring) && edgeDist(p, ring) > 6 && toRoad(p).d < 30 && open.every(o => !SP.inRing(p, o) && edgeDist(p, o) > 7)) sgn = p; }
  if (sgn) els.push({ id: 'mv-sign', kind: 'sign', x: r1(sgn[0]), y: r1(sgn[1]), w: 10, d: 5, rot: r1(deg(toRoad(sgn).t)), name: 'Montreve Mountain Club', pinned: true });

  let front = 0, bd = Infinity; for (let i = 0; i < ring.length; i++) { const d = segDist(gate, ring[i], ring[(i + 1) % ring.length])[0]; if (d < bd) { bd = d; front = i; } }
  const A = SAVED.optionA;
  const plan = { id: 'mv-full', name: 'Full program · Will’s plan on the lidar', src: 'parcel', origin: GEO.origin, ring, front, frontGuess: false, streets: [], streetsSet: true, streetsBy: 2, streetNames: { [front]: 'Happy Hollow Road' },
    setbacks: { front: 30, side: 10, rear: 10, paving: 0 }, parcel: A.parcel, parcels: A.parcels, zoning: null,
    program: { use: 'sfr', community: PROJECT.community }, elements: els, created: now, updated: now,
    notes: ['Will Essner’s full program (Montreve Smoky Mountain Resort Business Plan, Oct 22 2026) on the 30 platted lots, fitted to USGS 3DEP 1 m lidar.',
      'Lots from the Montreve vector lot map laid on the Regrid parcel (best overlap, no turn): not a survey. Roads drawn on the platted rights-of-way’ centrelines.',
      'Every lot slopes 35-70%: the cabins sit square to their roads and step down the hill as walk-outs; the pavilion, hall, courts and parking sit on level pads with retaining walls (each lists its pad, cut, fill and walls).',
      'The seven financed homes are shown in a standard position, not as built.', ...notes].join('\n') };
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
  const overlaps = [], solid = pl.elements.filter(e => ['building', 'court', 'parking', 'green', 'plaza'].includes(e.kind) && !(e.kind === 'green' && !e.name));
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) { if (solid[i].id.replace(/^mv-(cabin|deck)-/, '') === solid[j].id.replace(/^mv-(cabin|deck)-/, '') && /^mv-(cabin|deck)-/.test(solid[i].id + solid[j].id)) continue; /* a cabin and its own deck share a wall */
    const a = SP.outline(solid[i]), b = SP.outline(solid[j]); if (a.some(p => SP.inRing(p, b)) || b.some(p => SP.inRing(p, a))) overlaps.push(solid[i].id + ' × ' + solid[j].id); }
  const lots = pl.elements.filter(e => e.kind === 'lot'), roadsOnLots = pl.elements.filter(e => e.kind === 'drive' && /^mv-road/.test(e.id)).flatMap(e => lots.filter(l => samples(SP.outline(e)).filter(p => SP.inRing(p, l.poly) && edgeDist(p, l.poly) > 2).length > 0).map(l => e.name + ' on ' + l.name));
  return { acres: +m.acres.toFixed(2), buildings: B.length, cabins: B.filter(e => e.use === 'sfr').length, gfa: Math.round(m.gfa), spaces: m.spaces, required: m.required, pondSf: 0, elements: pl.elements.length,
    walkouts: B.filter(e => e.use === 'sfr' && e.grade?.walkout).length, maxCabinExtra: Math.max(...B.filter(e => e.use === 'sfr').map(e => e.grade?.walkout === false ? Math.round(e.grade.fall - 12) : 0)),
    level: Object.fromEntries(level.map(e => [e.id, { pad: e.grade.pad, wall: Math.max(e.grade.cutWall, e.grade.fillWall), cutCy: e.grade.cutCy, fillCy: e.grade.fillCy }])),
    cutCy: level.reduce((s, e) => s + e.grade.cutCy, 0), fillCy: level.reduce((s, e) => s + e.grade.fillCy, 0), overlaps, outside, roadsOnLots };
}
