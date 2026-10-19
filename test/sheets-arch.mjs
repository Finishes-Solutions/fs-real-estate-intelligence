// Architecture sheets (lib/sheets/arch.mjs): every fixture's floor plans, elevations, sections, details, schedules, life
// safety plan and code analysis draw without errors or bad numbers, and what they show agrees with the design: every room
// named, a tag for every door, a schedule row for every door and window, the occupant load the design gives. A richer
// two-story house written by hand (the size of a design Claude returns) draws too.
import assert from 'node:assert/strict';
import { ctxFor } from './helpers/setctx.mjs';
import * as P from '../lib/planset.mjs';
import * as PD from '../lib/plandesign.mjs';
import { RENDERERS, wallRuns, sectionCut } from '../lib/sheets/arch.mjs';

const KINDS = ['a-plans', 'a-elev', 'a-section', 'a-sched', 'a-details', 'ls-plan', 'g-code'];
assert.deepEqual(Object.keys(RENDERERS).sort(), KINDS.slice().sort(), 'a renderer for every architecture kind');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const rowsIn = (html, attr) => [...html.matchAll(new RegExp('<div data-sched="' + attr + '">([\\s\\S]*?)</div>', 'g'))].reduce((a, m) => a + (m[1].match(/<tr><td/g) || []).length, 0);

function check(ctx, label) {
  const seen = new Set();
  for (const sheet of ctx.sheets.filter(s => KINDS.includes(s.kind))) {
    const sh = { ...sheet }, t0 = Date.now(), html = P.sheetPage(ctx, sh), what = label + ' ' + sh.number + ' ' + sh.kind;
    seen.add(sh.kind);
    assert.ok(!/NaN|undefined|Infinity/.test(html), what + ': no NaN / undefined / Infinity');
    assert.ok(!/couldn’t be drawn|isn’t drawn yet|Design not available/.test(html), what + ': drawn');
    assert.ok(html.length < 6e5, what + ': HTML under 600 KB (' + html.length + ')');
    // no SVG pattern fills: Chromium expands them into PDFs of many MB (an sfr section printed at 11.6 MB); hatching is drawn as lines
    assert.ok(!/(fill|stroke)="url\(#/.test(html), what + ': no pattern fills');
    assert.ok(Date.now() - t0 < 3000, what + ': drawn quickly');
    const d = sh.typeId ? ctx.designs[sh.typeId] : null;
    const s2 = { ...sheet }; RENDERERS[sh.kind](ctx, s2); assert.ok(s2.scale && !/NaN|undefined/.test(s2.scale), what + ': states the scale it drew at (' + s2.scale + ')');
    if (sh.kind === 'a-plans') {
      for (const r of d.rooms) assert.ok(html.includes(esc(r.name)), what + ': names room ' + r.name);
      assert.equal((html.match(/class="dtag"/g) || []).length, d.doors.length, what + ': a tag for every door');
    }
    if (sh.kind === 'a-elev') for (const ti of ['Front elevation', 'Rear elevation', 'Left side elevation', 'Right side elevation']) assert.ok(html.includes(ti), what + ': ' + ti);
    if (sh.kind === 'a-section') assert.ok(html.includes('Cross section') && html.includes('Longitudinal section') && html.includes('Wall section'), what + ': both sections and the wall section');
    if (sh.kind === 'a-sched') {
      assert.equal(rowsIn(html, 'doors'), d.doors.length, what + ': a row for every door');
      assert.equal(rowsIn(html, 'windows'), d.windows.length, what + ': a row for every window');
      assert.equal(rowsIn(html, 'finishes'), d.rooms.length, what + ': a finish row for every room');
    }
    if (sh.kind === 'ls-plan') assert.equal(+(html.match(/data-occ="(\d+)"/) || [])[1], PD.occupantLoad(d).total, what + ': the design’s occupant load');
    if (sh.kind === 'g-code') for (const t of ctx.types.filter(t => !PD.RESIDENTIAL.includes(t.use))) assert.ok(html.includes(esc(PD.typeName(t))), what + ': analyses ' + t.id);
  }
  return seen;
}

const all = new Set();
for (const name of ['retail', 'restaurant', 'townhomes', 'sfr', 'industrial', 'office3', 'medical', 'fuel', 'duplex', 'church', 'shaped']) for (const k of check(ctxFor(name), name)) all.add(k);
assert.deepEqual([...all].sort(), KINDS.slice().sort(), 'the fixtures cover every kind');

// shaped buildings (an L and a stepped front) are drawn by their outline, not their bounding box
{
  const ctx = ctxFor('shaped'), inNotch = (d, x, y) => (d.notches || []).some(n => x > n.x + .01 && x < n.x + n.w - .01 && y > n.y + .01 && y < n.y + n.d - .01);
  assert.deepEqual(ctx.types.map(t => t.shape).sort(), ['L-shape', 'stepped front'], 'the fixture has an L and a stepped front');
  for (const t of ctx.types) {
    const d = ctx.designs[t.id], what = 'shaped type ' + t.id + ' (' + t.shape + ')', sh = n => ({ ...ctx.sheets.find(s => s.kind === n && s.typeId === t.id) });
    assert.ok(d.footprint.length >= 6 && d.notches.length >= 1, what + ': a real outline with open ground');
    // the plan's exterior wall is one path along the outline: as many corners as the footprint
    const plan = P.sheetPage(ctx, sh('a-plans')), ring = (plan.match(/class="ar-walls" d="M([^Z]*)Z/) || [])[1] || '';
    assert.equal(ring.split('L').length, d.footprint.length, what + ': the wall path turns at every corner of the outline');
    // nothing drawn in the open ground: no room, no interior wall
    for (const r of d.rooms) assert.ok(!inNotch(d, r.x + r.w / 2, r.y + r.d / 2), what + ': room ' + r.name + ' outside the notches');
    for (let f = 1; f <= d.floors; f++) for (const w of wallRuns(d, f)) for (const [a, b] of w.iv) { const m = (a + b) / 2; assert.ok(!inNotch(d, ...(w.o === 'h' ? [m, w.a] : [w.a, m])), what + ': interior wall at ' + w.o + ' ' + w.a + ' is inside the building'); }
    // sections cut through the building, never across open ground
    for (const axis of ['y', 'x']) { const c = sectionCut(d, axis), mid = c.s0 + c.L / 2; assert.ok(PD.inPoly(axis === 'y' ? [c.c, mid] : [mid, c.c], d.footprint) && c.L <= (axis === 'y' ? d.D : d.W), what + ': the ' + axis + ' cut runs inside the outline'); }
    // set-back faces show on the elevations; areas come from the outline, not the bounding box
    assert.ok(P.sheetPage(ctx, sh('a-elev')).includes('fill="#eceeed"'), what + ': set-back faces drawn as their own panels');
    assert.ok(P.sheetPage(ctx, sh('ls-plan')).includes(Math.round(d.footArea * d.floors).toLocaleString('en-US') + ' sf'), what + ': life safety area from the outline');
    assert.ok(plan.includes(Math.round(d.footArea).toLocaleString('en-US') + ' sf'), what + ': floor area from the outline');
  }
}

// a type with no design draws a plain message instead of failing
{
  const ctx = ctxFor('restaurant'), sh = ctx.sheets.find(s => s.kind === 'a-plans');
  const html = P.sheetPage({ ...ctx, designs: {} }, { ...sh });
  assert.ok(html.includes('Design not available') && !/couldn’t be drawn|NaN|undefined/.test(html), 'a missing design says so');
  for (const kind of ['a-elev', 'a-section', 'a-sched', 'ls-plan']) { const s2 = ctx.sheets.find(s => s.kind === kind); assert.ok(P.sheetPage({ ...ctx, designs: {} }, { ...s2 }).includes('Design not available'), kind + ' without a design'); }
  assert.ok(!/couldn’t be drawn|NaN/.test(P.sheetPage({ ...ctx, designs: {} }, { ...ctx.sheets.find(s => s.kind === 'a-details') })), 'details without designs');
}

// a hand-written two-story house the size Claude designs: 26 rooms, a hip roof, a porch, a loft open to the kitchen below
{
  const t = { id: 'A', use: 'sfr', label: 'Single-family home', W: 50, D: 44, floors: 2, floorH: 10, attached: false, unitsPer: 1, count: 3, units: 3, unitGsf: 4400, buildingGsf: 4400, garage: 2,
    occupancy: 'R-3 (IRC)', construction: 'V-B (wood frame, IRC)', sprinklered: false, sprinklerWhy: 'Not required for one- and two-family dwellings (NFPA 13D optional)', supported: true, names: [], elementIds: [] };
  const R = (id, name, type, floor, x, y, w, d) => ({ id, name, type, floor, x, y, w, d });
  const raw = { summary: 'Two-story house: front garage, study and dining, kitchen and family room at the back; four bedrooms up with a loft over the kitchen.',
    rooms: [R('gar', 'Garage', 'garage', 1, 0, 0, 22, 24), R('porch', 'Porch', 'porch', 1, 22, 0, 14, 6), R('entry', 'Foyer', 'entry', 1, 22, 6, 14, 12), R('hall1', 'Gallery', 'hall', 1, 22, 18, 14, 6),
      R('study', 'Study', 'office', 1, 36, 0, 14, 14), R('dining', 'Dining', 'dining', 1, 36, 14, 14, 12), R('family', 'Family room', 'family', 1, 36, 26, 14, 18), R('kit', 'Kitchen', 'kitchen', 1, 22, 24, 14, 20),
      R('lau', 'Mud / laundry', 'laundry', 1, 0, 24, 12, 8), R('pwd', 'Powder', 'half_bath', 1, 12, 24, 5, 8), R('st1', 'Stair', 'stair', 1, 17, 24, 5, 11), R('bh', 'Back hall', 'hall', 1, 17, 35, 5, 9), R('flex', 'Breakfast / flex', 'flex', 1, 0, 32, 17, 12),
      R('bd3', 'Bedroom 3', 'bedroom', 2, 0, 0, 16, 14), R('bd4', 'Bedroom 4', 'bedroom', 2, 16, 0, 18, 14), R('bd2', 'Bedroom 2', 'bedroom', 2, 34, 0, 16, 14), R('ba2', 'Bath 2', 'bath', 2, 0, 14, 10, 9),
      R('h2a', 'Hall', 'hall', 2, 10, 14, 30, 4), R('lin', 'Linen', 'closet', 2, 10, 18, 7, 5), R('h2b', 'Hall', 'hall', 2, 22, 18, 4, 17), R('h2c', 'Hall', 'hall', 2, 26, 26, 8, 4), R('st2', 'Stair', 'stair', 2, 17, 24, 5, 11),
      R('loft', 'Loft', 'flex', 2, 0, 23, 17, 21), R('pba', 'Primary bath', 'bath', 2, 40, 14, 10, 12), R('wic', 'Walk-in closet', 'walk_in_closet', 2, 34, 18, 6, 8), R('pri', 'Primary bedroom', 'primary_bedroom', 2, 34, 26, 16, 18)],
    doors: [['porch', 'outside', 8, 'opening', 'front'], ['porch', 'entry', 3.5], ['gar', 'outside', 16, 'overhead', 'front'], ['gar', 'outside', 3, 'swing', 'left'], ['gar', 'lau', 3], ['lau', 'flex', 2.67], ['pwd', 'flex', 2.5],
      ['kit', 'st1', 3, 'opening'], ['bh', 'kit', 3, 'opening'], ['flex', 'bh', 3, 'opening'], ['entry', 'hall1', 6, 'opening'], ['entry', 'study', 5, 'double'], ['hall1', 'dining', 5, 'opening'], ['hall1', 'kit', 8, 'opening'],
      ['dining', 'family', 6, 'opening'], ['kit', 'family', 10, 'opening'], ['family', 'outside', 8, 'sliding', 'back'],
      ['h2b', 'st2', 3, 'opening'], ['h2a', 'h2b', 3, 'opening'], ['h2a', 'bd3', 2.67], ['h2a', 'bd4', 2.67], ['h2a', 'bd2', 2.67], ['h2a', 'ba2', 2.5], ['h2a', 'lin', 2], ['h2b', 'h2c', 3, 'opening'], ['h2c', 'pri', 2.67],
      ['pri', 'pba', 2.67], ['pri', 'wic', 2.5, 'pocket'], ['st2', 'loft', 3, 'opening']].map(([a, b, width, kind = 'swing', side = 'any']) => ({ a, b, width, kind, side })),
    windows: [['bd3', 'front', 2], ['bd3', 'left', 1], ['bd4', 'front', 2], ['bd2', 'front', 2], ['bd2', 'right', 1], ['pri', 'back', 2], ['pri', 'right', 1], ['loft', 'left', 2], ['loft', 'back', 1], ['ba2', 'left', 1, 3, 4], ['pba', 'right', 1, 4, 4],
      ['study', 'front', 2], ['study', 'right', 1], ['dining', 'right', 2], ['family', 'back', 2, 4, 6], ['family', 'right', 1], ['kit', 'back', 1, 4, 4], ['flex', 'left', 2], ['flex', 'back', 1], ['lau', 'left', 1, 3, 3]]
      .map(([room, side, count, width = 3, height = 5]) => ({ room, side, count, width, height })),
    roof: { type: 'hip', pitch: 7, ridge: 'along_front', overhang: 2 }, exterior: { walls: 'Brick veneer at the first floor, fiber cement lap siding above', accent: 'Cedar porch posts', roofing: 'Architectural asphalt shingles', windows: 'Black vinyl single-hung, low-E', doors: 'Stained wood entry door' },
    systems: { structure: 'Wood frame', foundation: 'Post-tensioned slab on grade', hvac: 'split_system', water_heater: 'tankless_gas', sprinklered: false, fire_alarm: false } };
  const { design, problems } = PD.placeDesign(raw, t);
  assert.deepEqual(problems, [], 'the hand-written design passes the design checks');
  assert.equal(design.rooms.length, 26); assert.equal(design.doors.length, raw.doors.length);
  const base = ctxFor('sfr'), ctx = P.setContext({ ...base, types: [t], designs: { A: design } }, P.sheetList(base.plan, { types: [t], sections: P.SECTIONS.map(s => s.id), renders: 0 }));
  const seen = check(ctx, 'rich house');
  assert.deepEqual([...seen].sort(), ['a-details', 'a-elev', 'a-plans', 'a-sched', 'a-section'], 'a house set has the residential architecture sheets');
}

// every roof form and both kinds of footprint draw: gable both ways, hip, shed, flat, on a house, a townhome row and a shop
{
  for (const name of ['sfr', 'townhomes', 'fuel']) {
    const base = ctxFor(name), t = base.types[0];
    for (const roof of [{ type: 'gable', pitch: 8, ridge: 'front_to_back', overhang: 1 }, { type: 'hip', pitch: 5, ridge: 'along_front', overhang: 2 }, { type: 'shed', pitch: 3, ridge: 'along_front', overhang: 1.5 }, { type: 'flat', pitch: 0, ridge: 'along_front', overhang: 0 }]) {
      const { design } = PD.placeDesign({ ...PD.fallbackDesign(t), roof }, t), ctx = { ...base, designs: { ...base.designs, [t.id]: design } };
      check({ ...ctx, sheets: ctx.sheets.filter(s => s.typeId === t.id || s.kind === 'a-details') }, name + ' ' + roof.type + ' roof');
    }
  }
  // a bare one-room design (no windows, one door) still draws every sheet
  const base = ctxFor('fuel'), t = base.types[0], { design } = PD.placeDesign({ rooms: [{ id: 's', name: 'Sales', type: 'sales', floor: 1, x: 0, y: 0, w: t.W, d: t.D }], doors: [{ a: 's', b: 'outside', width: 6, kind: 'storefront', side: 'front' }], windows: [] }, t);
  check({ ...base, designs: { [t.id]: design } }, 'one-room shop');
}

console.log('arch sheets ok');
