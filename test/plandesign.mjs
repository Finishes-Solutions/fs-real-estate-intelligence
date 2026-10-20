// Building designs for plan sets (lib/plandesign.mjs): the plan's buildings grouped into types on realistic layouts (the
// FM 362 lot as shops, townhomes, a warehouse, a restaurant, a 3-story office; the 27 acre tract as 71 homes of eight
// sizes and as apartments), the rule-based design passing every check for every type, and the checks catching what a
// bad answer from Claude would get wrong.
import assert from 'node:assert/strict';
const PD = await import('../lib/plandesign.mjs'), { planFor } = await import('./helpers/setctx.mjs'), S0 = await import('../lib/siteplan.mjs');

// ---------- types ----------
{ const t = PD.buildingTypes(planFor('townhomes')); assert.equal(t.length, 1); assert.equal(t[0].attached, true); assert.deepEqual([t[0].W, t[0].D, t[0].floors, t[0].unitsPer], [24, 40, 3, 6], 'a townhome row is designed as one 24 ft unit');
  assert.equal(t[0].units, t[0].count * 6); assert.match(t[0].occupancy, /R-3/); }
{ const t = PD.buildingTypes(planFor('sfr')); assert.ok(t.length <= PD.MAX_TYPES); assert.equal(t.reduce((s, x) => s + x.count, 0), 71, 'every home is drawn as one of the types');
  assert.ok(t.every(x => x.use === 'sfr' && x.supported && x.garage === 2)); assert.deepEqual(t.map(x => x.id), t.map((x, i) => String.fromCharCode(65 + i))); }
{ const t = PD.buildingTypes(planFor('industrial'))[0]; assert.equal(t.occupancy, 'S-1'); assert.match(t.construction, /II-B/); assert.equal(t.sprinklered, true, 'a 78,000 sf warehouse is sprinklered'); }
{ const p = planFor('retail'), t = PD.buildingTypes(p); assert.equal(t.reduce((s, x) => s + x.count, 0), p.elements.filter(e => e.kind === 'building').length, 'every shop building is drawn as one of the types'); assert.ok(t.every(x => x.occupancy === 'M' && x.sprinklered), 'retail shells over 12,000 sf are sprinklered'); }
{ const t = PD.buildingTypes(planFor('restaurant')); assert.ok(t.every(x => x.occupancy === 'A-2' && x.sprinklered === (x.buildingGsf > 5000 || x.occupantsEst >= 100)), 'A-2: over 5,000 sf or 100 occupants (IBC 903.2.1.2)'); }
// the code's triggers (IBC 903.2), then the allowable area (IBC 506) — the Oct 20 review caught a blanket "assembly over 5,000 sf"
assert.equal(PD.sprinklerRule('office', 60000, 3).on, false, 'Group B: no area trigger in 903.2'); assert.equal(PD.sprinklerRule('office', 9000, 4).on, false);
{ const r = PD.sprinklerRule('amenity', 5400, 1, 160); assert.equal(r.on, false, 'A-3 clubhouse: under 12,000 sf and 300 occupants'); assert.match(r.ref, /903\.2\.1\.3/); assert.match(r.why, /12,000/); }
assert.equal(PD.sprinklerRule('amenity', 5400, 1, 320).on, true, 'A-3 with 300 or more occupants'); assert.equal(PD.sprinklerRule('restaurant', 3600, 1, 120).on, true, 'A-2 with 100 or more occupants');
{ const r = PD.sprinklerRule('multifamily', 40000, 3); assert.equal(r.system, 'NFPA 13R', 'R-2 up to 4 stories: 13R'); assert.equal(PD.sprinklerRule('multifamily', 80000, 5).system, 'NFPA 13'); }
{ const BC = await import('../lib/buildcode.mjs');
  assert.equal(BC.frontageIf(1, 30), 0.75); assert.equal(BC.frontageIf(0.5, 30), 0.25); assert.equal(BC.frontageIf(0.2, 30), 0);
  const a = BC.codeBasis('retail', { gsf: 10000, storyArea: 10000, floors: 1, heightFt: 21, If: 0.75, sprinkler: BC.sprinklerFor('retail', { gsf: 10000, floors: 1 }) });
  assert.equal(a.ok, true); assert.match(a.construction, /^V-B/); assert.equal(a.sprinkler.on, false, '10,000 sf of M on V-B: 9,000 + 6,750 frontage, no sprinklers (the reviewed "Revise")');
  const b = BC.codeBasis('retail', { gsf: 10000, storyArea: 10000, floors: 1, heightFt: 21, If: 0, sprinkler: BC.sprinklerFor('retail', { gsf: 10000, floors: 1 }) });
  assert.equal(b.sprinkler.system, 'NFPA 13', 'no frontage: sprinklered to fit V-B'); assert.match(b.changed, /allowable area/);
  const m = BC.codeBasis('multifamily', { gsf: 38000, storyArea: 12700, floors: 3, heightFt: 39, If: 0.75, sprinkler: BC.sprinklerFor('multifamily', { gsf: 38000, floors: 3, heightFt: 39 }) });
  assert.match(m.construction, /^V-A/); assert.equal(m.sprinkler.system, 'NFPA 13R', 'a garden apartment building: V-A with 13R'); }
// occupant load (IBC Table 1004.5): exercise 50 gross, unconcentrated assembly 15 net
{ const BC = await import('../lib/buildcode.mjs'); assert.deepEqual(BC.LOAD.fitness.slice(0, 2), [50, 'gross']); assert.deepEqual(BC.LOAD.lounge.slice(0, 2), [15, 'net']); assert.deepEqual(BC.LOAD.unit.slice(0, 2), [200, 'gross']); }
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

// ---------- buildings that aren't rectangles (an L drawn on Oct 19 came out as a box) ----------
{ const S = await import('../lib/siteplan.mjs'), base = planFor('retail'), b0 = base.elements.find(e => e.kind === 'building');
  for (const [form, extra, corners] of [['L', {}, 6], ['U', {}, 8], ['bar', { jog: 6, w: 240 }, 8]]) for (const rot of [0, 90, 270]) {
    const b = { ...b0, form, rot, w: 150, d: 100, ...extra }, plan = { ...base, elements: [b, ...base.elements.filter(e => e.kind !== 'building')] }, t = PD.buildingTypes(plan)[0], tag = form + ' at ' + rot + '°';
    assert.ok(t.fp && t.fp.length >= corners, tag + ': the type keeps the outline (' + (t.fp || []).length + ' corners)');
    assert.ok(Math.abs(t.footArea - S.footArea(b)) / S.footArea(b) < 0.02, tag + ': footprint area is the outline\'s, not the bounding box\'s');
    assert.ok(Math.abs(PD.polyArea(t.fp) - t.footArea) < 2); assert.match(PD.typeName(t), /overall/);
    assert.ok(PD.notchesOf(t).length >= 1, tag + ': the notch is open ground');
    assert.match(PD.designBrief(t), /outline through these corners/, tag + ': Claude is told the shape');
    const { design, problems } = PD.placeDesign(PD.fallbackDesign(t), t);
    assert.deepEqual(problems, [], tag + ': the rule-based design fits the outline');
    assert.deepEqual(design.footprint, t.fp); assert.equal(design.footArea, t.footArea);
    for (const r of design.rooms) assert.ok(PD.inPoly([r.x + r.w / 2, r.y + r.d / 2], t.fp), tag + ': ' + r.name + ' sits inside the building');
    const rooms = design.rooms.filter(r => r.floor === 1).reduce((s, r) => s + r.w * r.d, 0); assert.ok(rooms > 0.9 * t.footArea && rooms < 1.02 * t.footArea, tag + ': rooms fill the outline');
    for (const w of design.windows) { const o = { front: [0, -0.5], back: [0, 0.5], left: [-0.5, 0], right: [0.5, 0] }[w.side]; assert.ok(!PD.inPoly([(w.x1 + w.x2) / 2 + o[0], (w.y1 + w.y2) / 2 + o[1]], t.fp), tag + ': window ' + w.id + ' looks out on open ground'); }
  }
  // a room in the notch of an L is caught
  const b = { ...b0, form: 'L', rot: 0, w: 150, d: 100 }, t = PD.buildingTypes({ ...base, elements: [b, ...base.elements.filter(e => e.kind !== 'building')] })[0], n = PD.notchesOf(t)[0], raw = PD.fallbackDesign(t);
  raw.rooms.push({ id: 'shed', name: 'Storage', type: 'storage', floor: 1, x: n.x + 1, y: n.y + 1, w: Math.min(10, n.w - 2), d: Math.min(10, n.d - 2) });
  assert.ok(PD.placeDesign(raw, t).problems.some(x => /notch|outside|open ground/i.test(x)), 'a room in the notch is a problem');
}
{ const t = PD.buildingTypes(planFor('shaped')); assert.ok(t.some(x => x.shape === 'L-shape') && t.some(x => x.shape === 'stepped front'), 'the shaped test plan has an L and a stepped front'); }

// ---------- apartments and hotels: a double-loaded corridor, unit by unit (the Oct 20 set had 298 units and no unit drawn) ----------
{ const p = planFor('mixed'), types = PD.buildingTypes(p), mf = types.filter(t => t.use === 'multifamily');
  assert.ok(mf.length >= 2 && types.some(t => t.use === 'amenity') && types.some(t => t.use === 'retail'), 'apartments, the shops and the clubhouse each have their own types');
  assert.ok(mf.every(t => t.supported && t.occupancy === 'R-2' && t.sprinklered && t.sprinklerSystem === 'NFPA 13R' && /^V-A/.test(t.construction)), 'R-2: sprinklered (13R) on V-A');
  assert.equal(mf.reduce((s, t) => s + t.units, 0), S0.metrics(p).units, 'the types carry every unit the plan counts');
  for (const t of mf) {
    const { design, problems } = PD.placeDesign(PD.fallbackDesign(t), t); assert.deepEqual(problems, [], PD.typeName(t) + ' passes the checks');
    const units = design.rooms.filter(r => r.type === 'unit'); assert.ok(Math.abs(units.length / t.floors - t.unitsPer / t.floors) <= Math.max(2, t.unitsPer / t.floors * 0.15), PD.typeName(t) + ': ' + units.length + ' units drawn for ' + t.unitsPer + ' planned');
    for (let f = 1; f <= t.floors; f++) { const fl = design.rooms.filter(r => r.floor === f); assert.equal(fl.filter(r => r.type === 'stair').length, 2, 'two exit stairs on floor ' + f); assert.ok(fl.some(r => r.type === 'corridor')); if (t.floors >= 3) assert.ok(fl.some(r => r.type === 'elevator'), 'an elevator at 3 stories'); }
    for (const u of units) {
      const L = PD.unitLayout(design, u); assert.ok(L, u.name + ' has a plan');
      for (const r of L.rooms) assert.ok(r.x >= u.x - 0.01 && r.y >= u.y - 0.01 && r.x + r.w <= u.x + u.w + 0.01 && r.y + r.d <= u.y + u.d + 0.01, u.name + ': ' + r.name + ' stays in the unit');
      const ua = L.rooms.reduce((s, r) => s + r.w * r.d, 0); assert.ok(Math.abs(ua - u.w * u.d) < 2, u.name + ': rooms fill the unit');
      assert.ok(L.plan.baths >= 1 && L.plan.kitchen, u.name + ': a kitchen and a bath');
      for (const r of L.plan.rooms.filter(r => /bedroom/.test(r.type))) assert.ok(L.plan.windows.some(w => w.room === r.id), u.name + ': ' + r.name + ' has a window (egress)');
    }
    for (const P of Object.values(design.unitPlans)) for (const dr of P.doors) { // every door on a wall its two rooms share (the front door on the corridor wall)
      const A = P.rooms.find(r => r.id === dr.a), B = P.rooms.find(r => r.id === dr.b), mid = [(dr.x1 + dr.x2) / 2, (dr.y1 + dr.y2) / 2], on = (r, [x, y]) => (Math.abs(x - r.x) < 0.01 || Math.abs(x - r.x - r.w) < 0.01) && y >= r.y - 0.01 && y <= r.y + r.d + 0.01 || (Math.abs(y - r.y) < 0.01 || Math.abs(y - r.y - r.d) < 0.01) && x >= r.x - 0.01 && x <= r.x + r.w + 0.01;
      assert.ok(on(A, mid) && (dr.b === 'corridor' ? Math.abs(mid[1]) < 0.01 : on(B, mid)), P.code + ': door ' + dr.a + '–' + dr.b + ' on a shared wall'); }
  }
  // a hotel and an end-on building
  for (const t of [{ id: 'H', use: 'hotel', W: 260, D: 60, floors: 4, floorH: 10, unitsPer: 120, supported: true, occupancy: 'R-1', sprinklered: true, code: { cons: 'V-A' }, mix: PD.HOTEL_MIX },
    { id: 'Y', use: 'multifamily', W: 60, D: 220, floors: 3, floorH: 10, unitsPer: 30, supported: true, occupancy: 'R-2', sprinklered: true, code: { cons: 'V-A' } }]) {
    const { design, problems } = PD.placeDesign(PD.fallbackDesign(t), t); assert.deepEqual(problems, [], t.use + ' ' + t.W + 'x' + t.D + ' passes'); assert.ok(design.rooms.filter(r => r.type === 'unit').every(u => PD.unitLayout(design, u))); }
  assert.ok(!PD.claudeDesigns(mf[0]) && PD.claudeDesigns(types.find(t => t.use === 'retail')), 'apartments are laid out by rule, the shops by Claude');
}
