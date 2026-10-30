// The Montreve builder (build/projects/montreve.mjs): Will's full program on the 30 platted lots, fitted to the lidar.
// Every lot kept, one cabin on each sale lot facing downhill with a drivable driveway, the resort core on lots 10-15,
// every piece on the parcel and clear of the others, no problems from the app's own checks, and a document the sync takes.
import assert from 'node:assert/strict';
import * as M from '../build/projects/montreve.mjs';
import * as SP from '../lib/siteplan.mjs';
import * as TR from '../lib/terrain.mjs';
import { cleanProject } from '../api/projects.js';

const doc = M.buildProject(null, { now: '2026-10-30T18:00:00.000Z' }), pl = doc.plans[0], s = M.summary(doc), E = pl.elements, by = id => E.find(e => e.id === id);
assert.equal(doc.id, 'mvv5sk2y6l0dq', 'the team’s existing project'); assert.equal(doc.plans.length, 2); assert.deepEqual(doc.plans[1], M.SAVED.optionA, 'Option A kept as it was');
assert.ok(cleanProject(doc), 'the sync accepts it'); assert.ok(JSON.stringify(doc).length < 500000);
assert.ok(Math.abs(s.acres - 30.05) < 0.05, 'the Regrid parcel: ' + s.acres);

// the lots: all 30, as platted, on the parcel
const lots = E.filter(e => e.kind === 'lot'); assert.equal(lots.length, 30);
assert.deepEqual(lots.map(e => +e.name.slice(4)).sort((a, b) => a - b), [...Array(16).keys()].map(i => i + 1).concat([18, 19, 20, 21, 22, 23, 26, 27, 28, 29, 30, 31, 32, 33]));
assert.ok(lots.every(e => e.poly.every(p => SP.inRing(p, pl.ring) || Math.min(...pl.ring.map((a, i) => { const b = pl.ring[(i + 1) % pl.ring.length], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); })) < 1)), 'every lot on the parcel');
assert.ok(by('mv-easement') && Math.abs(M.GEO.easement.acres - 0.77) < 0.06, 'lot 2’s easement, about the appraisal’s 0.77 ac');

// the cabins: 24, each on its own lot, facing downhill, a walk-out or close to one, a driveway to a road
const cabins = E.filter(e => e.kind === 'building' && e.use === 'sfr');
assert.equal(cabins.length, 24); assert.ok(cabins.every(e => e.cabin && e.type === 'cabin-montreve-cabin-3-level-2-444-sf-indoor-pool' && e.floors === 3));
for (const c of cabins) {
  const lot = lots.find(l => l.name === c.name); assert.ok(lot && SP.outline(c).every(p => SP.inRing(p, lot.poly)), c.name + ' sits on its own lot');
  const deck = by('mv-deck-' + c.name.slice(4)), dz = TR.zAt(M.TERRAIN, [deck.x, deck.y]) - TR.zAt(M.TERRAIN, [c.x, c.y]); assert.ok(dz < 0, c.name + ': the deck is downhill of the house');
  assert.ok(c.grade.fall < 26, c.name + ': ' + c.grade.fall + ' ft across the house');
  const dr = by('mv-drive-' + c.name.slice(4)); assert.ok(dr && dr.path.length === 2, c.name + ' has a driveway'); assert.ok(+dr.note.match(/at (\d+)%/)[1] <= 30, c.name + ' driveway ' + dr.note);
}
assert.ok(s.walkouts >= 12, 'at least half are clean walk-outs: ' + s.walkouts);
assert.deepEqual(cabins.filter(c => /Financed/.test(c.note)).map(c => +c.name.slice(4)).sort((a, b) => a - b), [1, 3, 6, 18, 21, 28, 30], 'the seven financed homes');

// the resort core, on Will's lots, level pads with their earthwork
const inLots = (e, ns) => SP.outline(e).every(p => ns.some(n => SP.inRing(p, lots.find(l => l.name === 'Lot ' + n).poly) || lots.find(l => l.name === 'Lot ' + n).poly.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 12)));
const pav = by('mv-pavilion'), hall = by('mv-hall'), ten = by('mv-tennis'), pick = by('mv-pickleball'), lawn = by('mv-lawn');
assert.equal(pav.use, 'venue'); assert.equal(pav.w * pav.d, 6000); assert.ok(inLots(pav, [14, 15]), 'the pavilion on lots 14-15'); assert.ok(lawn && inLots(lawn, [14, 15]), 'its lawn too');
assert.equal(hall.use, 'restaurant'); assert.ok(Math.abs(hall.w * hall.d - 2500) < 30); assert.ok(inLots(hall, [12, 13]), 'the hall on lots 12-13');
assert.equal(ten.sport, 'tennis'); assert.deepEqual([ten.w, ten.d], [60, 120]); assert.equal(pick.sport, 'pickleball'); assert.equal(SP.courtGrid(pick).n, 2); assert.ok(inLots(ten, [10, 11]) && inLots(pick, [10, 11]), 'the courts on lots 10-11');
assert.equal(pick.rot % 90, ten.rot % 90, 'the pickleball courts square to the tennis court');
for (const e of [pav, hall, ten, pick, lawn]) { assert.ok(e.grade && Number.isFinite(e.grade.pad) && e.grade.cutCy >= 0, e.id + ' carries its pad'); const f = TR.padFit(M.TERRAIN, e); assert.ok(Math.abs(f.pad - e.grade.pad) < 0.2, e.id + ' pad matches the ground'); }
assert.ok(Math.max(pav.grade.cutWall, pav.grade.fillWall) < 25, 'the pavilion’s walls stay under 25 ft: ' + JSON.stringify(pav.grade));
assert.ok(E.filter(e => e.kind === 'parking').every(e => SP.stalls(e).count > 0) && E.filter(e => e.kind === 'parking' && !e.sw).every(e => Math.max(e.grade.cutWall, e.grade.fillWall) <= 10), 'head-in rows cut no more than 10 ft into the hill');

// the app's own checks: nothing outside, nothing overlapping, no problems
assert.deepEqual(s.outside, []); assert.deepEqual(s.overlaps, []);
assert.deepEqual(SP.check(pl).filter(i => i.level === 'bad').map(i => i.text), []);
console.log('montreve ok: ' + s.cabins + ' cabins (' + s.walkouts + ' walk-outs), the pavilion, hall and courts on lots 10-15, ' + s.cutCy.toLocaleString('en-US') + ' CY cut and fill on the level pads');
