// Sports courts: tennis, pickleball and basketball pieces at regulation sizes, their lines and nets on the plan map, the
// sheet and the massing picture, the label, and adding them by words ("add 2 tennis courts beside the clubhouse").
import assert from 'node:assert/strict';
import * as S from '../lib/siteplan.mjs';
import { guessEdits } from '../lib/siteedit.mjs';

// sizes and the grid of courts a piece holds
assert.deepEqual(S.courtSize('tennis', 1), [60, 120]); assert.deepEqual(S.courtSize('pickleball', 4), [120, 60]);
const pb = { id: 'p', kind: 'court', x: 0, y: 0, w: 120, d: 60, rot: 0, sport: 'pickleball' };
assert.equal(S.courtGrid(pb).n, 4); assert.equal(S.courtGrid({ ...pb, courts: 3 }).n, 3, 'a count below what fits is kept');
assert.equal(S.courtSport({ kind: 'court', name: 'Tennis courts' }), 'tennis', 'read from the name'); assert.equal(S.courtSport({ kind: 'court' }), 'pickleball', 'older plans: pickleball');

// the lines: every court's outline inside the piece, the net across the middle of its length
const ten = { id: 't', kind: 'court', x: 100, y: 50, w: 60, d: 120, rot: 30, sport: 'tennis' }, L = S.courtLines(ten);
assert.equal(L.areas.length, 1); assert.equal(L.nets.length, 1);
const ring = S.outline(ten); assert.ok(L.lines.flat().every(p => S.inRing(p, ring)), 'tennis lines inside the court piece');
assert.ok(Math.abs(Math.hypot(L.nets[0][1][0] - L.nets[0][0][0], L.nets[0][1][1] - L.nets[0][0][1]) - 38) < 0.01, 'the net spans the 36 ft doubles court');
const side = L.lines.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1])); assert.ok(side.some(v => Math.abs(v - 78) < 0.01), 'a 78 ft sideline');
assert.equal(S.courtLines(pb).nets.length, 4); assert.equal(S.courtLines({ ...pb, sport: 'basketball', w: 60, d: 110 }).nets.length, 0, 'no net on a basketball court');

// on the map: the playing surface, white lines and the net, the surround in the sport's colour
const plan = { origin: [-83.69, 35.72], ring: [[-200, -200], [200, -200], [200, 200], [-200, 200]], front: 0, program: { use: 'amenity' }, elements: [ten, pb] };
const fs = S.planFeatures(plan).features;
assert.equal(fs.filter(f => f.properties.k === 'courtarea').length, 5); assert.ok(fs.filter(f => f.properties.k === 'mark' && f.properties.c === '#1b1e1f').length === 5, 'five nets');
assert.equal(fs.find(f => f.properties.id === 't').properties.c, S.SPORTS.tennis.surf);
assert.deepEqual(S.labelOf(pb), { name: 'Pickleball courts', what: '4 pickleball courts', size: '' }); assert.equal(S.labelOf({ ...ten, name: 'Club tennis' }).what, '1 tennis court');

// by words
const ops = guessEdits('add 2 tennis courts beside the clubhouse', { ...plan, elements: [{ id: 'b', kind: 'building', x: 0, y: 0, w: 60, d: 40, rot: 0, use: 'amenity', name: 'Clubhouse' }] });
const add = (ops.ops || ops).find(o => o.action === 'add'); assert.equal(add?.kind, 'court'); assert.equal(add.sport, 'tennis'); assert.equal(add.courts, 2);
console.log('courts ok: tennis, pickleball and basketball lines, nets, labels and words');
