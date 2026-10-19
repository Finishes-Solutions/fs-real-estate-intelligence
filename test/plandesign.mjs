// Building designs for plan sets (lib/plandesign.mjs): the plan's buildings grouped into types on realistic layouts (the
// FM 362 lot as shops, townhomes, a warehouse, a restaurant, a 3-story office; the 27 acre tract as 71 homes of eight
// sizes and as apartments), the rule-based design passing every check for every type, and the checks catching what a
// bad answer from Claude would get wrong.
import assert from 'node:assert/strict';
const PD = await import('../lib/plandesign.mjs'), { planFor } = await import('./helpers/setctx.mjs');

// ---------- types ----------
{ const t = PD.buildingTypes(planFor('townhomes')); assert.equal(t.length, 1); assert.equal(t[0].attached, true); assert.deepEqual([t[0].W, t[0].D, t[0].floors, t[0].unitsPer], [24, 40, 3, 6], 'a townhome row is designed as one 24 ft unit');
  assert.equal(t[0].units, t[0].count * 6); assert.match(t[0].occupancy, /R-3/); }
{ const t = PD.buildingTypes(planFor('sfr')); assert.ok(t.length <= PD.MAX_TYPES); assert.equal(t.reduce((s, x) => s + x.count, 0), 71, 'every home is drawn as one of the types');
  assert.ok(t.every(x => x.use === 'sfr' && x.supported && x.garage === 2)); assert.deepEqual(t.map(x => x.id), t.map((x, i) => String.fromCharCode(65 + i))); }
{ const t = PD.buildingTypes(planFor('industrial'))[0]; assert.equal(t.occupancy, 'S-1'); assert.match(t.construction, /II-B/); assert.equal(t.sprinklered, true, 'a 78,000 sf warehouse is sprinklered'); }
{ const t = PD.buildingTypes(planFor('retail')); assert.equal(t.length, 2); assert.ok(t.every(x => x.occupancy === 'M' && x.sprinklered), 'retail shells over 12,000 sf are sprinklered'); }
{ const t = PD.buildingTypes(planFor('restaurant')); assert.ok(t.every(x => x.occupancy === 'A-2' && x.sprinklered === x.buildingGsf > 5000)); }
assert.equal(PD.sprinklerRule('office', 60000, 3).on, false, 'a 3-story business occupancy needs none by area'); assert.equal(PD.sprinklerRule('office', 9000, 4).on, true);
assert.match(PD.sprinklerRule('townhomes', 3000, 3).why, /R313/);

// ---------- the rule-based design passes for every type of every case ----------
for (const name of ['retail', 'restaurant', 'townhomes', 'sfr', 'industrial', 'office3', 'medical', 'fuel', 'duplex', 'church']) {
  for (const t of PD.buildingTypes(planFor(name)).filter(t => t.supported)) {
    const { design, problems } = PD.placeDesign(PD.fallbackDesign(t), t);
    assert.deepEqual(problems, [], name + ' ' + PD.typeName(t) + ': the rule-based design passes');
    assert.ok(design.doors.every(d => d.exterior ? true : Math.abs(d.x2 - d.x1) + Math.abs(d.y2 - d.y1) === d.width), 'doors placed at their width');
    assert.ok(design.windows.every(w => w.x1 >= 0 && w.x2 <= t.W && w.y1 >= 0 && w.y2 <= t.D), 'windows on the footprint');
    if (t.attached) assert.ok(design.windows.every(w => w.side === 'front' || w.side === 'back'), 'no windows on party walls');
    if (t.floors > 1) assert.ok(design.rooms.filter(r => r.type === 'stair').length >= t.floors, 'a stair on every floor');
  }
}
for (const name of ['retail', 'sfr']) assert.ok(PD.designBrief(PD.buildingTypes(planFor(name))[0], { county: 'Waller County, Texas' }).includes('Waller County'));

// ---------- the checks catch a bad answer ----------
const T = { id: 'Z', use: 'sfr', W: 40, D: 50, floors: 1, floorH: 10, attached: false, sprinklered: false };
const room = (id, type, x, y, w, d, floor = 1) => ({ id, name: id, type, floor, x, y, w, d });
const ok = { rooms: [room('liv', 'living', 0, 0, 40, 30), room('bed', 'bedroom', 0, 30, 20, 20), room('bath', 'bath', 20, 30, 20, 20)],
  doors: [{ a: 'liv', b: 'outside', width: 3, kind: 'swing', side: 'front' }, { a: 'liv', b: 'bed', width: 3, kind: 'swing', side: 'any' }, { a: 'liv', b: 'bath', width: 3, kind: 'swing', side: 'any' }],
  windows: [{ room: 'bed', side: 'back', count: 1, width: 3, height: 5 }, { room: 'liv', side: 'front', count: 2, width: 4, height: 5 }], roof: { type: 'gable', pitch: 6, ridge: 'along_front', overhang: 1 }, exterior: {}, systems: {} };
assert.deepEqual(PD.placeDesign(ok, T).problems, []);
{ const d = PD.placeDesign(ok, T).design, door = d.doors.find(x => x.b === 'bed'); assert.equal(door.orient, 'h'); assert.equal(door.y1, 30); assert.ok(door.x1 >= 0 && door.x2 <= 20, 'the door sits on the wall the rooms share'); }
const bad = (patch, re, msg) => { const p = PD.placeDesign({ ...ok, ...patch(JSON.parse(JSON.stringify(ok))) }, T).problems; assert.ok(p.some(x => re.test(x)), msg + ': ' + p.join(' | ')); };
bad(o => ({ rooms: [...o.rooms.slice(0, 2), room('bath', 'bath', 15, 30, 25, 20)] }), /overlap/, 'overlapping rooms');
bad(o => ({ rooms: [o.rooms[0], o.rooms[1], room('bath', 'bath', 20, 30, 30, 20)] }), /outside the 40 × 50/, 'a room outside the footprint');
bad(o => ({ rooms: o.rooms.slice(0, 2) }), /without a room/, 'floor 1 not covered');
bad(o => ({ doors: o.doors.slice(0, 2) }), /No way in to: "bath"/, 'a room with no door');
bad(o => ({ windows: o.windows.slice(1) }), /no window/, 'a bedroom without a window');
bad(o => ({ rooms: [o.rooms[0], room('bed', 'bedroom', 0, 30, 6, 20), room('bath', 'bath', 6, 30, 34, 20)] }), /at least 70 sf and 7 ft/, 'a bedroom too narrow');
bad(o => ({ rooms: [...o.rooms, room('cl', 'closet', 15, 25, 6, 4)], doors: [...o.doors, { a: 'cl', b: 'outside', width: 3, kind: 'swing', side: 'front' }] }), /exterior wall/, 'a door to outside from a room with no exterior wall');
// a door to outside asked for on a side the room doesn't touch goes on one it does
{ const d = PD.placeDesign({ ...ok, doors: [...ok.doors, { a: 'bath', b: 'outside', width: 3, kind: 'swing', side: 'front' }] }, T).design; assert.ok(['back', 'right'].includes(d.doors.find(x => x.a === 'bath' && x.exterior).side)); }
bad(o => ({ windows: [{ room: 'bed', side: 'right', count: 1, width: 3, height: 5 }] }), /doesn't touch that side/, 'a window on an inside wall');
assert.ok(PD.placeDesign({ ...ok, windows: [...ok.windows, { room: 'liv', side: 'left', count: 1, width: 3, height: 5 }] }, { ...T, attached: true }).problems.some(x => /party wall/.test(x)), 'a window on a party wall');
assert.ok(PD.placeDesign(null, T).problems.length, 'no answer at all');
{ const two = { ...T, floors: 2 }; assert.ok(PD.placeDesign(ok, two).problems.some(x => /no stair/.test(x)), 'two floors need a stair'); }
// several doors on one edge are spread out, not stacked
{ const t = PD.buildingTypes(planFor('industrial'))[0], d = PD.placeDesign(PD.fallbackDesign(t), t).design, oh = d.doors.filter(x => x.kind === 'overhead');
  assert.ok(oh.length > 1); const xs = oh.map(x => x.x1).sort((a, b) => a - b); assert.ok(xs.every((x, i) => !i || x - xs[i - 1] >= 10), 'dock doors spaced along the wall'); }
// quantities the sheets use
{ const t = PD.buildingTypes(planFor('restaurant'))[0], d = PD.placeDesign(PD.fallbackDesign(t), t).design, ol = PD.occupantLoad(d); assert.ok(ol.total > 50, 'a restaurant\'s dining room holds many people'); }
assert.equal(PD.occupantLoad(PD.placeDesign(ok, T).design).total, 0, 'occupant load is for commercial buildings');
console.log('plan designs ok');
