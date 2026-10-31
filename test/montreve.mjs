// The Montreve builder (build/projects/montreve.mjs): Will's full program on the 30 platted lots, fitted to the lidar.
// Every lot kept, one cabin on each sale lot facing downhill with a drivable driveway, the resort core on lots 10-15,
// every piece on the parcel and clear of the others, no problems from the app's own checks, and a document the sync takes.
import assert from 'node:assert/strict';
import * as M from '../build/projects/montreve.mjs';
import * as SP from '../lib/siteplan.mjs';
import * as TR from '../lib/terrain.mjs';
import { cleanProject } from '../api/projects.js';

const doc = M.buildProject(null, { now: '2026-10-30T18:00:00.000Z' }), pl = doc.plans[0], s = M.summary(doc), E = pl.elements, by = id => E.find(e => e.id === id);
assert.equal(doc.id, 'mvv5sk2y6l0dq', 'the team’s existing project'); assert.equal(doc.plans.length, 3); assert.deepEqual(doc.plans[2], M.SAVED.optionA, 'Option A kept as it was');
assert.ok(cleanProject(doc), 'the sync accepts it'); assert.ok(JSON.stringify(doc).length < 500000);
assert.ok(Math.abs(s.acres - 30.05) < 0.05, 'the Regrid parcel: ' + s.acres);

// the lots: all 30, as platted, on the parcel
const lots = E.filter(e => e.kind === 'lot'); assert.equal(lots.length, 30);
assert.deepEqual(lots.map(e => +e.name.slice(4)).sort((a, b) => a - b), [...Array(16).keys()].map(i => i + 1).concat([18, 19, 20, 21, 22, 23, 26, 27, 28, 29, 30, 31, 32, 33]));
assert.ok(lots.every(e => e.poly.every(p => SP.inRing(p, pl.ring) || Math.min(...pl.ring.map((a, i) => { const b = pl.ring[(i + 1) % pl.ring.length], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); })) < 1)), 'every lot on the parcel');
assert.ok(by('mv-easement') && Math.abs(M.GEO.easement.acres - 0.77) < 0.08, 'lot 2’s easement, about the appraisal’s 0.77 ac (less the road’s right-of-way): ' + M.GEO.easement.acres);

// the roads: the platted network as three smooth 24 ft roads on their centrelines, clear of every lot
const roads = E.filter(e => /^mv-road/.test(e.id)); assert.deepEqual(roads.map(e => e.name), ['Creeksong Way', 'Amber Valley Way', 'Creeksong Way']); assert.ok(roads.every(e => e.path.length > 5 && e.width === 24));
for (const r of roads) { const o = SP.outline(r); for (const l of lots) { const deep = o.filter(p => SP.inRing(p, l.poly)); assert.ok(deep.length <= 2, r.name + ' runs onto ' + l.name); } }

// the cabins: 24, each on its own lot square to its road, the deck downhill, a walk-out or close to one, a driveway straight in
const cabins = E.filter(e => e.kind === 'building' && e.use === 'sfr');
assert.equal(cabins.length, 24); assert.ok(cabins.every(e => e.cabin && e.type === 'cabin-montreve-cabin-3-level-2-444-sf-indoor-pool' && e.floors === 3));
for (const c of cabins) {
  const lot = lots.find(l => l.name === c.name); assert.ok(lot && SP.outline(c).every(p => SP.inRing(p, lot.poly)), c.name + ' sits on its own lot');
  const deck = by('mv-deck-' + c.name.slice(4)), dz = TR.zAt(M.TERRAIN, [deck.x, deck.y]) - TR.zAt(M.TERRAIN, [c.x, c.y]); assert.ok(dz < 2, c.name + ': the deck is not uphill of the house (' + dz.toFixed(1) + ' ft; a lot that falls sideways can be level)');
  assert.ok(c.grade.fall < 26, c.name + ': ' + c.grade.fall + ' ft across the house');
  const dr = by('mv-drive-' + c.name.slice(4)); assert.ok(dr && dr.path.length === 2, c.name + ' has a driveway');
  const t = roads.map(r => { let b = null; for (let i = 1; i < r.path.length; i++) { const a = r.path[i - 1], q = r.path[i], d = Math.hypot((a[0] + q[0]) / 2 - c.x, (a[1] + q[1]) / 2 - c.y); if (!b || d < b.d) b = { d, ang: Math.atan2(q[1] - a[1], q[0] - a[0]) * 180 / Math.PI }; } return b; }).sort((a, b) => a.d - b.d)[0];
  const off = ((c.rot - t.ang) % 90 + 90) % 90; assert.ok(Math.min(off, 90 - off) < 20, c.name + ' square to its road: ' + off.toFixed(1) + '°');
  assert.ok(c.entry && Math.abs(c.entry.foundation) <= 45, c.name + ' entry at road grade: ' + JSON.stringify(c.entry));
}
assert.ok(s.walkouts >= 10, 'most are walk-outs or close: ' + s.walkouts); assert.ok(cabins.filter(c => Math.abs(c.entry.foundation) <= 15).length >= 18, 'most entries within 15 ft of the ground');
assert.deepEqual(cabins.filter(c => /Financed/.test(c.note)).map(c => +c.name.slice(4)).sort((a, b) => a - b), [1, 3, 6, 18, 21, 28, 30], 'the seven financed homes');

// the resort core: one composed plan on lots 10-15 along a stone promenade (courts, court pavilion, dining terrace and
// the Lodge, its service yard, cocktail terrace, glass pavilion), parking, green and ceremony lawn below; level pads
const core = [10, 11, 12, 13, 14, 15].map(n => lots.find(l => l.name === 'Lot ' + n).poly);
const inCore = e => SP.outline(e).every(p => core.some(r => SP.inRing(p, r) || r.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 12)));
const pav = by('mv-pavilion'), hall = by('mv-hall'), ten = by('mv-tennis'), pick = by('mv-pickleball'), lawn = by('mv-lawn'), prom = by('mv-promenade');
assert.equal(pav.use, 'venue'); assert.equal(pav.w * pav.d, 6000); assert.equal(hall.use, 'restaurant'); assert.ok(Math.abs(hall.w * hall.d - 2500) < 30);
assert.equal(ten.sport, 'tennis'); assert.deepEqual([ten.w, ten.d], [60, 120]); assert.equal(pick.sport, 'pickleball'); assert.equal(SP.courtGrid(pick).n, 2);
assert.ok(prom && lawn && by('mv-service') && by('mv-terrace') && by('mv-cocktail'), 'the promenade, lawn, service yard and terraces');
const pieces = E.filter(e => /^mv-(tennis|pickleball|court|terrace|hall|service|cocktail|pav|park|green|firepit|lawn|garden)/.test(e.id) && e.kind !== 'drive');
for (const e of pieces) assert.ok(inCore(e), e.id + ' on lots 10-15');
// one grid: every piece square to the promenade's frontage
for (const e of pieces) { const off = Math.abs((((e.rot || 0) - ten.rot) % 90 + 90) % 90); assert.ok(Math.min(off, 90 - off) < 1, e.id + ' square to the core'); }
// the hall's service yard beside it and the lawn in front of the pavilion
assert.ok(Math.hypot(by('mv-service').x - hall.x, by('mv-service').y - hall.y) < 60, 'service yard next to the kitchen');
assert.ok(Math.hypot(lawn.x - pav.x, lawn.y - pav.y) < 100, 'the ceremony lawn in front of the pavilion');
for (const e of [pav, hall, ten, pick, lawn]) { assert.ok(e.grade && Number.isFinite(e.grade.pad) && e.grade.cutCy >= 0, e.id + ' carries its pad'); const f = TR.padFit(M.TERRAIN, e); assert.ok(Math.abs(f.pad - e.grade.pad) < 0.2, e.id + ' pad matches the ground'); }
assert.ok(Math.max(pav.grade.cutWall, pav.grade.fillWall) < 25, 'the pavilion’s walls stay under 25 ft: ' + JSON.stringify(pav.grade));
const bays = E.filter(e => e.kind === 'parking'); assert.equal(bays.length, 2); assert.ok(bays.reduce((t, e) => t + SP.stalls(e).count, 0) >= 72, 'two bays, enough for a 150-guest wedding (~60 cars)');
assert.ok(by('mv-entry') && by('mv-pav-entry'), 'the resort entry and pavilion lane from Amber Valley Way');

// the app's own checks: nothing outside, nothing overlapping, no problems
assert.deepEqual(s.outside, []); assert.deepEqual(s.overlaps, []);
assert.deepEqual(SP.check(pl).filter(i => i.level === 'bad').map(i => i.text), []);
// Option B: the owners' concept — the same lots, roads and cabins, the resort as one terrace along Amber Valley Way
{ const B = doc.plans[1], sB = M.summary(doc, 1), EB = B.elements, bb = id => EB.find(e => e.id === id);
  assert.equal(B.id, 'mv-option-b');
  for (const e of E.filter(e => /^mv-(lot|road|cabin|deck|drive|easement)-?/.test(e.id))) { const o = bb(e.id); assert.ok(o && o.x === e.x && o.y === e.y && o.rot === e.rot, e.id + ' in the same place in Option B'); }
  const ids = ['mv-tennis', 'mv-pickleball', 'mv-courthouse', 'mv-courtdeck', 'mv-pooldeck', 'mv-pool', 'mv-spa', 'mv-poolhouse', 'mv-terrace', 'mv-hall', 'mv-catering', 'mv-service', 'mv-trash', 'mv-cocktail', 'mv-pavilion', 'mv-lawn', 'mv-bridal', 'mv-bridalgarden', 'mv-openair', 'mv-eventlawn', 'mv-firepit', 'mv-maint', 'mv-promenade', 'mv-fence-courts', 'mv-fence-pool', 'mv-trail-link', 'mv-gatehouse', 'mv-gate', 'mv-mail'];
  for (const id of ids) assert.ok(bb(id), id + ' in Option B (' + B.notes.split('\n').filter(t => /left out|no open/.test(t)).join('; ') + ')');
  assert.ok(!/left out|did not fit|no open ground/.test(B.notes), 'everything placed');
  for (const id of ids.filter(i => !/fence|trail|gate|mail|promenade/.test(i))) assert.ok(inCore(bb(id)), id + ' on lots 10-15');
  // in one line along the road, west to east: sports, the pool club, dining, the wedding hall, the open-air pavilion
  const amber = roads.find(r => r.name === 'Amber Valley Way').path, along = e => { let best = null, acc = 0; for (let i = 1; i < amber.length; i++) { const a = amber[i - 1], q = amber[i], L = Math.hypot(q[0] - a[0], q[1] - a[1]), t = Math.max(0, Math.min(1, ((e.x - a[0]) * (q[0] - a[0]) + (e.y - a[1]) * (q[1] - a[1])) / (L * L))), d = Math.hypot(a[0] + t * (q[0] - a[0]) - e.x, a[1] + t * (q[1] - a[1]) - e.y); if (!best || d < best.d) best = { d, s: acc + t * L }; acc += L; } return best; };
  const order = ['mv-tennis', 'mv-pooldeck', 'mv-hall', 'mv-pavilion', 'mv-openair'].map(id => along(bb(id)));
  assert.ok(order.every((o, i) => !i || o.s > order[i - 1].s), 'west to east along Amber Valley Way: ' + order.map(o => Math.round(o.s)));
  assert.ok(order.every(o => o.d < 200), 'each close behind the road');
  // head-in parking straight off the road the whole way along, the promenade behind it
  const rowsB = EB.filter(e => e.kind === 'parking'); assert.ok(rowsB.length >= 10 && rowsB.every(e => SP.stalls(e).count === 8 && along(e).d < 30), 'rows of 8 along the road: ' + rowsB.length);
  assert.ok(sB.spaces >= sB.required, 'parked: ' + sB.spaces + ' of ' + sB.required);
  const pool = bb('mv-pool'), deck = bb('mv-pooldeck'); assert.ok(SP.outline(pool).every(p => SP.inRing(p, SP.outline(deck))) && SP.outline(bb('mv-spa')).every(p => SP.inRing(p, SP.outline(deck))), 'the pool and spa on their deck');
  for (const id of ['mv-tennis', 'mv-pickleball', 'mv-pavilion', 'mv-hall', 'mv-pooldeck']) { const e = bb(id); assert.ok(e.grade && Math.max(e.grade.cutWall, e.grade.fillWall) < 32, id + ' walls: ' + JSON.stringify(e.grade)); }
  assert.ok(EB.filter(e => /^mv-woods-/.test(e.id)).length === 30 && EB.filter(e => /^mv-patio-/.test(e.id)).length >= 12, 'wooded lots and walk-out patios');
  for (const p of EB.filter(e => /^mv-patio-/.test(e.id))) { const lot = lots.find(l => l.name === 'Lot ' + p.id.slice(9)); assert.ok(SP.outline(p).every(q => SP.inRing(q, lot.poly)), p.id + ' on its own lot'); }
  assert.deepEqual(sB.outside, []); assert.deepEqual(sB.overlaps, []);
  assert.deepEqual(SP.check(B).filter(i => i.level === 'bad').map(i => i.text), []);
  // the trees: the woods are planted (a lot line no longer keeps them out), the ceremony lawn kept open
  const trees = SP.details(B).trees, lawn = SP.outline(bb('mv-lawn'));
  assert.ok(trees.length > 2 * SP.details(pl).trees.length, 'Option B planted: ' + trees.length + ' trees');
  assert.ok(!trees.some(t => SP.inRing([t[0], t[1]], lawn)), 'no trees on the ceremony lawn');
}
console.log('montreve ok: ' + s.cabins + ' cabins (' + s.walkouts + ' walk-outs), the composed resort core on lots 10-15 (' + s.spaces + ' spaces), ' + s.cutCy.toLocaleString('en-US') + ' CY cut and fill on the level pads');
