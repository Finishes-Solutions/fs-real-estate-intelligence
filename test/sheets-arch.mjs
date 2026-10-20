// Architecture sheets (lib/sheets/arch.mjs): every fixture's floor plans, enlarged unit plans, elevations, sections,
// details, schedules, life safety plan and code analysis draw without errors or bad numbers, and what they show agrees
// with the design and with the rest of the set: every room named, a tag for every door, a schedule row for every door
// and window, the occupant load rows the design gives (IBC Table 1004.5), the heights, structure, scope and code basis
// each type decided once (ctx.tf, t.code), and the rooftop units the mechanical sheets schedule. A richer two-story
// house written by hand (the size of a design Claude returns) draws too.
import assert from 'node:assert/strict';
import { ctxFor } from './helpers/setctx.mjs';
import * as P from '../lib/planset.mjs';
import * as PD from '../lib/plandesign.mjs';
import { RENDERERS, wallRuns, sectionCut, rooftopUnits } from '../lib/sheets/arch.mjs';
import { hvacLayout } from '../lib/sheets/eng.mjs';
import { ftIn, f0 } from '../lib/sheetkit.mjs';

const KINDS = ['a-plans', 'a-units', 'a-elev', 'a-section', 'a-sched', 'a-details', 'ls-plan', 'g-code'];
assert.deepEqual(Object.keys(RENDERERS).sort(), KINDS.slice().sort(), 'a renderer for every architecture kind');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const rowsIn = (html, attr) => [...html.matchAll(new RegExp('<div data-sched="' + attr + '">([\\s\\S]*?)</div>', 'g'))].reduce((a, m) => a + (m[1].match(/<tr><td/g) || []).length, 0);
const schedIn = (html, attr) => (html.match(new RegExp('<div data-sched="' + attr + '">([\\s\\S]*?)</div>')) || [])[1] || '';
const LANDLORD = ['tenant', 'restroom', 'storage', 'stair', 'corridor', 'lobby', 'mechanical', 'electrical', 'janitor', 'elevator', 'hall', 'entry', 'trash'];
const rtuTags = (t, d) => hvacLayout(t, d).systems.filter(s => s.kind === 'rtu').map(s => s.tag);

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
    assert.ok(!/paint-order/.test(html.replace(/<text[^>]*class="dimt"[^>]*>/g, '').replace(/<text [^>]*text-anchor="middle" dominant-baseline="middle" transform="rotate\([^"]*\)" fill="#1b1e1f" paint-order[^>]*>/g, '')), what + ': no paint-order halos (dimension text aside)');
    assert.ok(!/Revise|revise/.test(html), what + ': never "Revise" without a resolution');
    assert.ok(Date.now() - t0 < 3000, what + ': drawn quickly');
    const t = sh.typeId ? ctx.types.find(x => x.id === sh.typeId) : null, d = sh.typeId ? ctx.designs[sh.typeId] : null, tf = t ? ctx.tf[t.id] : null, cor = t && PD.CORRIDOR.includes(t.use);
    const s2 = { ...sheet }; RENDERERS[sh.kind](ctx, s2); assert.ok(s2.scale && !/NaN|undefined/.test(s2.scale), what + ': states the scale it drew at (' + s2.scale + ')');
    if (sh.kind === 'a-plans') {
      // apartments: every unit by its number and plan type; every other room by its name
      for (const r of d.rooms) if (r.unit) assert.ok(html.includes('data-unit="' + r.unit.no + '" data-code="' + r.unit.code + '"'), what + ': unit ' + r.unit.no + ' ' + r.unit.code); else assert.ok(html.includes(esc(r.name)), what + ': names room ' + r.name);
      assert.equal((html.match(/class="dtag"/g) || []).length, d.doors.length, what + ': a tag for every door');
      // the roof plan's rooftop units are the mechanical sheets' (lib/sheets/eng.mjs hvacLayout), by tag
      assert.deepEqual([...html.matchAll(/class="rtu" data-tag="([^"]+)"/g)].map(m => m[1]), rtuTags(t, d), what + ': rooftop units as the mechanical plans list them');
      if (tf.scope.kind === 'shell') assert.ok(html.includes(esc(tf.scope.text)), what + ': states the landlord scope');
      if (t.jog > 0) assert.ok(html.includes('step in the face of'), what + ': notes the facade step the site plan draws');
    }
    if (sh.kind === 'a-units') for (const p of Object.values(d.unitPlans)) { assert.ok(html.includes('data-plan="' + p.code + '"'), what + ': unit plan ' + p.code); for (const r of p.rooms) assert.ok(html.includes(esc(r.name.toUpperCase())), what + ': ' + p.code + ' names ' + r.name); }
    if (sh.kind === 'a-elev') for (const ti of ['Front elevation', 'Rear elevation', 'Left side elevation', 'Right side elevation']) assert.ok(html.includes(ti), what + ': ' + ti);
    if (sh.kind === 'a-section') {
      assert.ok(html.includes('Cross section') && html.includes('Longitudinal section') && html.includes('Wall section'), what + ': both sections and the wall section');
      // the roof framing named as the structural sheets frame it (Oct 20 review: a clubhouse on wood trusses here, steel joists there)
      assert.ok(html.includes(esc(tf.structure.roof.text)), what + ': roof framing is ' + tf.structure.roof.kind);
      assert.ok(html.includes(esc(tf.structure.foundation.text)), what + ': foundation as the structural sheets');
      if (tf.structure.roof.kind === 'wood-trusses') assert.ok(!/steel joist/i.test(html), what + ': no steel joists under a wood truss roof'); else assert.ok(!/wood (roof )?truss/i.test(html), what + ': no wood trusses under a steel joist roof');
    }
    if (sh.kind === 'a-elev' || sh.kind === 'a-section') {
      // the same heights FP-101 and G-003 show (lib/plandesign.mjs heightsOf)
      const h = tf.height; assert.ok(html.includes('data-heights="' + h.buildingHeight + '|' + h.fireAccessHeight + '"') && html.includes(esc(ftIn(h.buildingHeight))) && html.includes(esc(ftIn(h.fireAccessHeight))), what + ': building and fire access heights as ctx.tf');
    }
    if (sh.kind === 'a-sched' && !cor) {
      assert.equal(rowsIn(html, 'doors'), d.doors.length, what + ': a row for every door');
      assert.equal(rowsIn(html, 'windows'), d.windows.length, what + ': a row for every window');
      const shell = tf.scope.kind === 'shell', ten = d.rooms.filter(r => shell && !LANDLORD.includes(r.type));
      assert.equal(rowsIn(html, 'finishes'), d.rooms.length - ten.length + (ten.length ? 1 : 0), what + ': a finish row for every ' + (shell ? 'landlord ' : '') + 'room');
    }
    if (sh.kind === 'a-sched' && cor) {
      const doors = schedIn(html, 'doors'), ent = d.doors.filter(x => [x.a, x.b].some(id => d.rooms.find(r => r.id === id)?.unit));
      for (const x of d.doors.filter(x => !ent.includes(x))) assert.ok(doors.includes('<td>' + x.id + '</td>'), what + ': door ' + x.id + ' scheduled');
      assert.equal((doors.match(/entries, floor \d/g) || []).length, d.floors, what + ': unit entry doors a row a floor');
      assert.ok(/20-min, self-closing/.test(doors), what + ': unit entry doors 20-minute, self-closing');
      const nW = d.rooms.filter(r => r.unit).reduce((a, r) => a + d.unitPlans[r.unit.code].windows.length, 0);
      assert.ok(html.includes('Window schedule (' + nW + ' a building)'), what + ': every unit window counted (' + nW + ')');
      const mix = schedIn(html, 'mix'); for (const m of d.corridor.mix) assert.ok(mix.includes('<td>' + m.code + '</td>'), what + ': mix row ' + m.code);
    }
    if (sh.kind === 'ls-plan') {
      // the loads are occupantLoad's rows (IBC Table 1004.5 factors, net or gross), every one of them
      const OL = PD.occupantLoad(d, t.occupancy);
      assert.equal(+(html.match(/data-occ="(\d+)"/) || [])[1], OL.total, what + ': the design’s occupant load');
      assert.equal((html.match(/data-loads="([^"]*)"/) || [])[1], esc(OL.rows.map(x => x.room.id + '=' + x.load).join(';')), what + ': every occupant load row');
      if (cor) assert.ok(/IBC Table 1017\.2/.test(html) && /common path/i.test(html) && /dead-end/i.test(html) && /1\/2-hr|1-hr \(R/.test(html), what + ': travel, common path, dead ends and corridor rating');
    }
    if (sh.kind === 'g-code') for (const x of ctx.types.filter(x => !PD.RESIDENTIAL.includes(x.use) && x.supported)) {
      assert.ok(html.includes(esc(PD.typeName(x))), what + ': analyses ' + x.id);
      if (x.code?.allow) assert.ok(html.includes(f0(x.code.allow.areaPerStory) + ' sf'), what + ': type ' + x.id + ' allowable area from t.code');
      if (x.sprinklerRef) assert.ok(html.includes(esc(x.sprinklerRef)), what + ': type ' + x.id + ' sprinkler reference');
      if (x.code?.frontage) assert.ok(html.includes('If = (F/P − 0.25) × W/30 = (' + x.code.frontage.share.toFixed(2)), what + ': type ' + x.id + ' frontage increase spelled out');
      if (x.code && !x.code.ok) assert.ok(html.includes('Fire walls (IBC 706) needed'), what + ': type ' + x.id + ' over the area needs fire walls');
    }
    if (sh.kind === 'a-details') for (const x of ctx.types.filter(x => ctx.tf[x.id])) assert.ok(html.includes(esc(ctx.tf[x.id].structure.roof.text)), what + ': type ' + x.id + ' roof framing as the structural sheets');
  }
  return seen;
}
// the rooftop units on A-1xx are M-1xx's, and the fire alarm plan's duct detectors count the same list
function rtuCross(ctx, label) {
  for (const t of ctx.types.filter(x => ctx.designs[x.id])) {
    const d = ctx.designs[t.id], tags = rtuTags(t, d), sh = k => ctx.sheets.find(s => s.kind === k && s.typeId === t.id);
    assert.deepEqual(rooftopUnits(t, d).map(u => u.tag), tags, label + ' ' + t.id + ': arch reads hvacLayout');
    if (sh('m-hvac')) { const m = P.sheetPage(ctx, { ...sh('m-hvac') }); for (const g of tags) assert.ok(m.includes(g), label + ' ' + t.id + ': ' + g + ' on the mechanical plan'); }
    const fa = sh('fa-plan') && P.sheetPage(ctx, { ...sh('fa-plan') }), dd = fa && fa.match(/Duct smoke detectors[^<]*<\/td><td[^>]*>(\d+)/);
    // IMC 606.2.1: a duct detector at every unit over 2,000 cfm in the HVAC list, the rooftop units the roof plan shows among them
    if (dd) { const big = hvacLayout(t, d).systems.filter(s => s.cfm > 2000); assert.equal(+dd[1], big.length, label + ' ' + t.id + ': duct detectors from the same HVAC list');
      for (const g of big.filter(s => s.kind === 'rtu').map(s => s.tag)) assert.ok(tags.includes(g), label + ' ' + t.id + ': ' + g + ' detected and on the roof plan'); }
  }
}

const all = new Set();
for (const name of ['retail', 'restaurant', 'townhomes', 'sfr', 'industrial', 'office3', 'medical', 'fuel', 'duplex', 'church', 'shaped', 'mixed']) { const ctx = ctxFor(name); for (const k of check(ctx, name)) all.add(k); rtuCross(ctx, name); }
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
      const { design } = PD.placeDesign({ ...PD.fallbackDesign(t), roof }, t), ctx = P.setContext({ ...base, designs: { ...base.designs, [t.id]: design } }, base.sheets);
      check({ ...ctx, sheets: ctx.sheets.filter(s => s.typeId === t.id || s.kind === 'a-details') }, name + ' ' + roof.type + ' roof');
    }
  }
  // a bare one-room design (no windows, one door) still draws every sheet
  const base = ctxFor('fuel'), t = base.types[0], { design } = PD.placeDesign({ rooms: [{ id: 's', name: 'Sales', type: 'sales', floor: 1, x: 0, y: 0, w: t.W, d: t.D }], doors: [{ a: 's', b: 'outside', width: 6, kind: 'storefront', side: 'front' }], windows: [] }, t);
  check(P.setContext({ ...base, designs: { [t.id]: design } }, base.sheets), 'one-room shop');
}

// the reviewed project (FM 362 & Betka Rd, Oct 20): apartments drawn unit by unit, the clubhouse framed one way everywhere,
// its sprinkler rationale the code's own (IBC 903.2.1.3), no blanket 5,000 sf rule, and loads by Table 1004.5
{
  const ctx = ctxFor('mixed'), page = n => P.sheetPage(ctx, { ...ctx.sheets.find(s => s.number === n) }), byKind = (k, id) => P.sheetPage(ctx, { ...ctx.sheets.find(s => s.kind === k && s.typeId === id) });
  const apts = ctx.types.filter(t => t.use === 'multifamily'), club = ctx.types.find(t => t.use === 'amenity'), shop = ctx.types.find(t => t.use === 'retail');
  assert.ok(apts.length >= 3 && club && shop, 'the mixed fixture has apartments, a clubhouse and shops');
  for (const t of apts) {
    assert.ok(ctx.sheets.some(s => s.kind === 'a-units' && s.typeId === t.id), 'type ' + t.id + ' has enlarged unit plans');
    const plans = byKind('a-plans', t.id); assert.equal((plans.match(/class="utag"/g) || []).length, ctx.designs[t.id].rooms.filter(r => r.unit).length, 'type ' + t.id + ': every unit tagged on its floor plan');
    const ls = byKind('ls-plan', t.id); assert.ok(/IBC 1006\.3\.4/.test(ls) && /250'/.test(ls) && /125'/.test(ls), 'type ' + t.id + ': R-2 sprinklered travel 250 ft, common path 125 ft');
  }
  const sec = byKind('a-section', club.id), det = page('A-501'), g3 = page('G-003');
  assert.equal(ctx.tf[club.id].structure.roof.kind, 'wood-trusses', 'the clubhouse has a pitched roof on wood trusses');
  assert.ok(sec.includes('wood roof trusses') && !/steel joist/i.test(sec), 'its sections frame it on wood trusses only');
  assert.ok(g3.includes('IBC 903.2.1.3') && !/5,000 sf/.test(g3), 'G-003: the clubhouse sprinkler rationale is IBC 903.2.1.3, no blanket 5,000 sf rule');
  assert.ok(g3.includes('As drawn: ' + ctx.tf[club.id].occupants + ' occupants'), 'G-003: the clubhouse load as drawn');
  const lsc = byKind('ls-plan', club.id); assert.ok(lsc.includes('Exercise rooms') && lsc.includes('Assembly, unconcentrated') && /<td>net<\/td>/.test(lsc) && /<td>gross<\/td>/.test(lsc), 'LS: fitness 50 gross, lounge 15 net, with the basis');
  assert.ok(byKind('a-plans', shop.id).includes(esc(ctx.tf[shop.id].scope.text)) && /landlord work/.test(byKind('a-sched', shop.id)), 'the retail shell states its landlord scope on the plans and schedules');
  assert.ok(det.includes('wood truss roof') && det.includes('steel joist roof'), 'A-501 draws both roof framings the set uses');
}

// a shell's tenant layout is drawn light and labeled by tenant; its finishes are not in the landlord's schedule
{
  const base = ctxFor('retail'), t = base.types[0], raw = PD.fallbackDesign(t), sp = raw.rooms.find(r => r.type === 'tenant'), w0 = sp.w;
  sp.w = w0 - 12; raw.rooms.push({ id: 'off0', name: 'Manager office', type: 'office', floor: 1, x: sp.x + w0 - 12, y: sp.y, w: 12, d: 12 }, { id: 'sales0b', name: 'Fitting rooms', type: 'sales', floor: 1, x: sp.x + w0 - 12, y: sp.y + 12, w: 12, d: sp.d - 12 });
  raw.doors.push({ a: sp.id, b: 'off0', width: 3, kind: 'swing', side: 'any' }, { a: sp.id, b: 'sales0b', width: 3, kind: 'swing', side: 'any' });
  const { design, problems } = PD.placeDesign(raw, t); assert.deepEqual(problems.filter(p => /overlap|No way in/.test(p)), [], 'the tenant rooms fit');
  const ctx = P.setContext({ ...base, designs: { ...base.designs, [t.id]: design } }, base.sheets), sh = k => ({ ...ctx.sheets.find(s => s.kind === k && s.typeId === t.id) });
  const plan = P.sheetPage(ctx, sh('a-plans')), sched = P.sheetPage(ctx, sh('a-sched'));
  assert.ok(plan.includes('BY TENANT') && plan.includes('#a3a8aa'), 'tenant layout labeled and drawn light');
  assert.ok(/Tenant layout rooms \(2\)/.test(sched) && !/<td>Manager office<\/td><td>1<\/td>/.test(schedIn(sched, 'finishes')), 'finish schedule: landlord rooms, the tenant layout as one by-tenant row');
  check({ ...ctx, sheets: ctx.sheets.filter(s => s.typeId === t.id) }, 'retail with a tenant layout');
}

console.log('arch sheets ok');
