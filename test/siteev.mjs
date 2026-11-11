// EV chargers reserve existing stalls; they never create a new parking or land-use type.
import assert from 'node:assert/strict';
import * as S from '../lib/siteplan.mjs';
import * as EV from '../lib/siteev.mjs';
import * as L from '../lib/sitelayout.mjs';
import * as M from '../lib/planmap.mjs';
import * as SH from '../lib/sitesheet.mjs';
import * as PS from '../lib/planset.mjs';
import * as RUN from '../lib/layoutrun.mjs';
import * as LE from '../lib/layoutedit.mjs';
import * as T from '../lib/sitetools.mjs';
import { ctxFor, fm362, tract } from './helpers/setctx.mjs';

const plan = {
  origin: [-95.78, 29.78], ring: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]], front: 0,
  setbacks: { ...S.SETBACKS }, program: { use: 'retail' }, elements: []
};
const parking = { id: 'pk-1', kind: 'parking', x: 500, y: 500, w: 360, d: 60, rot: 0 };
const drive = { id: 'drive-1', kind: 'drive', x: 500, y: 360, w: 500, d: 26, rot: 0 };

// Off/default stays byte-for-byte unchanged, and generated layouts only gain equipment when requested.
const untouched = { elements: [parking, drive] };
assert.strictEqual(EV.withEV(plan, untouched), untouched);
assert.equal(S.normalizeProgram({ use: 'retail' }).ev, null);
const generated = L.layoutOptions({ ...plan, ring: [[0, 0], [600, 0], [600, 400], [0, 400]] }, {
  use: 'retail', ratio: 3, ev: { enabled: true, mode: 'count', value: 2, type: 'level2' }
});
assert.ok(generated.some(o => o.elements.filter(e => e.kind === 'evcharger').length === 2));
assert.ok(generated.every(o => o.elements.every(e => !['evcharger', 'evpower', 'evcanopy'].includes(e.kind)) || o.program.ev?.enabled));
const generatedOff = L.layoutOptions({ ...plan, ring: [[0, 0], [600, 0], [600, 400], [0, 400]] }, { use: 'retail', ratio: 3 });
assert.ok(generatedOff.every(o => !o.elements.some(e => e.kind.startsWith('ev'))));

// Share uses eligible surface stalls; charger markers avoid accessible stalls/routes and drives.
const option = {
  program: { use: 'retail', ev: { enabled: true, mode: 'share', value: 5, type: 'level2', power: { w: 20, d: 20 }, canopy: { w: 40, d: 18 } } },
  elements: [parking, drive], notes: []
};
const placed = EV.withEV(plan, option), p = { ...plan, program: placed.program, elements: placed.elements };
const chargers = p.elements.filter(e => e.kind === 'evcharger'), access = S.accessible(p);
const disabledAgain = EV.withEV(plan, { program: { use: 'retail' }, elements: p.elements, notes: placed.notes });
assert.ok(disabledAgain.elements.every(e => !['evcharger', 'evpower', 'evcanopy'].includes(e.kind)));
assert.ok(disabledAgain.notes.every(n => !n.startsWith('EV charging:')));
assert.equal(chargers.length, 4);
assert.ok(chargers.every(e => e.parkingId === parking.id));
assert.ok(chargers.every(e => ![...access.stalls, ...access.aisles].some(a => S.rectsOverlap(e, { poly: a.poly }))));
assert.ok(chargers.every(e => !S.rectsOverlap(e, drive)));
assert.equal(S.metrics(p).spaces, S.metrics({ ...p, elements: [parking, drive] }).spaces);
assert.deepEqual(S.metrics(p).ev, {
  requested: 4, placed: 4, short: 0, type: 'level2', powerSf: 400, canopySf: 720,
  powerRequested: true, canopyRequested: true, powerIncomplete: false, canopyIncomplete: false
});
assert.deepEqual(S.check(p).filter(i => i.level === 'bad'), []);
assert.ok(!S.check(p).some(i => i.level === 'warn' && /EV/.test(i.text)));

// A 0% share reserves nothing and reports no shortfall.
const zeroShare = EV.withEV(plan, { program: { use: 'retail', ev: { enabled: true, mode: 'share', value: 0 } }, elements: [parking, drive], notes: [] });
assert.equal(zeroShare.elements.filter(e => e.kind === 'evcharger').length, 0);
assert.equal(S.metrics({ ...plan, program: zeroShare.program, elements: zeroShare.elements }).ev.requested, 0);
assert.ok(!S.check({ ...plan, program: zeroShare.program, elements: zeroShare.elements }).some(i => /EV charging is/.test(i.text)));

// Unfit requests are reported both in option notes and plan checks, without changing parking counts.
const tooMuch = EV.withEV(plan, {
  program: { use: 'retail', ev: { enabled: true, mode: 'count', value: 5000, type: 'dcfc', canopy: { w: 40, d: 25 } } },
  elements: [parking, drive], notes: []
});
const shortPlan = { ...plan, program: tooMuch.program, elements: tooMuch.elements };
assert.ok(S.metrics(shortPlan).ev.short > 0);
assert.ok(tooMuch.notes.some(n => /EV charging:/.test(n) && /requested/.test(n)));
assert.ok(tooMuch.notes.some(n => /canopy.*does not fit/.test(n)));
assert.ok(S.check(shortPlan).some(i => i.level === 'warn' && /EV charging is/.test(i.text)));
assert.ok(S.check(shortPlan).some(i => i.level === 'warn' && /EV canopy/.test(i.text)));
const partial = EV.withEV(plan, { program: { use: 'retail', ev: { enabled: true, mode: 'count', value: 1, power: { w: 20 }, canopy: { d: 18 } } }, elements: [parking, drive] });
assert.ok(partial.notes.some(n => /power equipment: enter both width and depth/.test(n)));
assert.ok(partial.notes.some(n => /canopy: enter both width and depth/.test(n)));
assert.ok(S.check({ ...plan, program: partial.program, elements: partial.elements }).some(i => /canopy needs both a width and a depth/.test(i.text)));

// The same equipment is visible in the map key, site sheet, electrical sheet and CAD export.
const fc = S.planFeatures(p), marker = fc.features.find(f => f.properties.k === 'evcharger');
assert.equal(marker.geometry.type, 'Point');
assert.equal(marker.properties.charger, 'level2');
assert.ok(M.keyItems(p).kinds.includes('evcharger') && /EV charger stalls/.test(M.keyHtml(p)));
const svg = SH.planSVG(p, { px: 900 }).svg;
assert.ok(svg.includes('#0b7a5f'), 'site-plan SVG has the EV charger symbol');
assert.ok(/EV charger stalls|EV charging canopy/.test(SH.sheetHTML({ plan: p, size: 'tabloid' })));
assert.ok(SH.sheetData(p).parking.some(([name]) => name.includes('EV charger stalls')));
const dxf = S.toDXF(p, 'EV TEST');
assert.match(dxf, /EV_CHARGERS/); assert.match(dxf, /EV_POWER/); assert.match(dxf, /EV_CANOPY/);

// Each parking lot's label says how many of its stalls have chargers: the map, the site sheet, the DXF and the Items list.
{
  const n = S.stalls(parking).count, lot = p.elements.find(e => e.id === parking.id);
  assert.deepEqual([...S.evByLot(p.elements)], [[parking.id, 4]]);
  assert.equal(S.labelOf(lot, p.program, 4).size, n + ' spaces · 4 EV');
  assert.equal(S.labelOf(lot, p.program).size, n + ' spaces', 'without a count the label is as before');
  assert.ok(S.planFeatures(p).features.some(f => f.properties.k === 'label' && f.properties.t === n + ' spaces · 4 EV'), 'map label');
  assert.ok(SH.planSVG(p, { px: 1400 }).svg.includes(n + ' SPACES · 4 EV'), 'site sheet label');
  assert.ok(S.toDXF(p, 'EV TEST').includes(n + ' SPACES, 4 EV'), 'DXF label');
  assert.equal(T.itemSub(lot, p), S.spacesWord(n) + ' · 4 EV', 'Items list');
  const off = { ...plan, elements: [parking, drive] };
  assert.ok(!S.planFeatures(off).features.some(f => f.properties.k === 'label' && /EV/.test(f.properties.t)), 'no EV in labels without chargers');
  assert.ok(!/ EV\b/.test(S.toDXF(off, 'X').replace(/EV_(CHARGERS|POWER|CANOPY)/g, '')));
}

const ctx = ctxFor('retail'), sitePlan = { ...ctx.plan, program: { ...ctx.plan.program, ev: { enabled: true, mode: 'count', value: 2, type: 'dcfc' } } };
const withEquipment = EV.withEV(sitePlan, { program: sitePlan.program, elements: sitePlan.elements });
const evCtx = PS.setContext({ ...ctx, plan: { ...sitePlan, elements: withEquipment.elements } }, ctx.sheets);
const electrical = PS.sheetPage(evCtx, evCtx.sheets.find(s => s.kind === 'e-site'));
const civil = PS.sheetPage(evCtx, evCtx.sheets.find(s => s.kind === 'c-dims'));
assert.match(electrical, /EV charging equipment/);
assert.match(electrical, /DC fast charger/);
assert.match(civil, /DCFC/);

// Realistic generated layouts (the 7.7 acre FM 362 lot): every charger sits in a stall the engine draws, the canopy
// fits over a row whose aisle drive runs flush along it, and the power pad stays off the walks round the buildings.
const EVK = ['evcharger', 'evpower', 'evcanopy'];
const onReal = (prog, ev) => L.layoutOptions({ ...fm362, elements: [] }, { ...prog, ev }, { count: 3 }).map(o => ({ o, p: { ...fm362, program: o.program, elements: o.elements } }));
// the engine's own stalls: an angled row's parallelograms, else square stalls round S.stallCentres
const stallShapes = park => {
  if (S.stallAng(park)) return S.angledStallPolys(park).map(q => ({ poly: q.poly }));
  const st = S.stalls(park), sw = park.sw || S.STALL.w, sd = park.sd || S.STALL.d, rot = (park.rot || 0) + (st.swap ? -90 : 0);
  return S.stallCentres(park).map(([x, y]) => ({ x, y, w: sw, d: sd, rot }));
};
const inShape = (r, q) => r.poly ? S.inRing(q, r.poly) : S.hitRect(r, q);
// every charger fully inside a stall the engine draws, on the piece it names, one to a stall, none on an accessible
// stall, a drive or a building's walk; parking the same as without the equipment
function onStalls(p, label) {
  const cs = p.elements.filter(e => e.kind === 'evcharger'), A = S.accessible(p), routes = [...A.stalls, ...A.aisles].map(a => ({ poly: a.poly })), walks = S.details(p).walks, used = new Set();
  for (const c of cs) {
    const park = p.elements.find(e => e.kind === 'parking' && e.id === c.parkingId), shapes = park ? stallShapes(park) : [], at = shapes.findIndex(r => inShape(r, [c.x, c.y])), stall = shapes[at];
    assert.ok(stall && S.corners(c).every(q => inShape(stall, q)), label + ': ' + c.id + ' inside a drawn stall of ' + c.parkingId);
    const key = c.parkingId + ':' + at; assert.ok(!used.has(key), label + ': one charger to a stall'); used.add(key);
    assert.ok(!routes.some(a => S.rectsOverlap(stall, a)), label + ': not an accessible stall or aisle');
    assert.ok(!p.elements.some(e => e.kind === 'drive' && S.rectsOverlap(c, e)), label + ': clear of drives');
    assert.ok(!walks.some(w => S.rectsOverlap(c, w, 0.1)), label + ': off the building walks');
  }
  assert.equal(S.metrics(p).spaces, S.metrics({ ...p, elements: p.elements.filter(e => !EVK.includes(e.kind)) }).spaces, label + ': parking unchanged');
  assert.deepEqual(S.check(p).filter(i => i.level === 'bad' && EVK.includes(p.elements.find(e => e.id === i.id)?.kind)).map(i => i.text), [], label + ': no plan-check problems on the equipment');
  return cs;
}
for (const { o, p } of onReal({ use: 'retail', gfa: 40000 }, { enabled: true, mode: 'count', value: 4, type: 'level2', power: { w: 10, d: 6 }, canopy: { w: 40, d: 18 } })) {
  const cs = onStalls(p, 'retail'), canopy = p.elements.find(e => e.kind === 'evcanopy');
  assert.equal(cs.length, 4);
  assert.ok(canopy, 'a 40 x 18 ft canopy fits over four reserved stalls: ' + o.notes.join(' | '));
  assert.ok(cs.every(c => S.hitRect(canopy, [c.x, c.y])));
  assert.ok(!p.elements.some(e => e.kind === 'drive' && S.rectsOverlap(canopy, e)));
}
for (const { p } of onReal({ use: 'office', gfa: 60000, floors: 3 }, { enabled: true, mode: 'count', value: 6, type: 'level2', power: { w: 12, d: 8 } })) {
  const pad = p.elements.find(e => e.kind === 'evpower');
  if (pad) assert.ok(!S.details(p).walks.some(w => S.rectsOverlap(pad, w, 0.1)), 'power equipment stays off the building walks');
}

// The reserved stalls are tinted on the map and the site sheet (the engine's own stall: square here, angled below), and in 3D
// each charger stands as a post with the canopy's roof deck on columns along the chargers' side, clear of the drives.
{
  const FT = 3.280839895, ev = { enabled: true, mode: 'count', value: 4, type: 'level2', canopy: { w: 40, d: 18 } };
  for (const { p: q } of onReal({ use: 'retail', gfa: 40000 }, ev)) {
    const cs = q.elements.filter(e => e.kind === 'evcharger'), st = S.evStalls(q), fc = S.planFeatures(q).features;
    assert.equal(st.length, cs.length, 'a tinted stall for every charger');
    for (const c of cs) { const mine = st.filter(x => S.inRing([c.x, c.y], x.poly)); assert.equal(mine.length, 1); assert.equal(mine[0].id, c.id); assert.ok(S.corners(c).every(pt => S.inRing(pt, mine[0].poly))); }
    assert.equal(fc.filter(f => f.properties.k === 'evstall').length, cs.length, 'map tint');
    assert.equal((SH.planSVG(q, { px: 1400 }).svg.match(/fill-opacity=".3" stroke="none"/g) || []).length, cs.length, 'sheet tint');
    const c3 = fc.filter(f => f.properties.k === 'c3'), posts = c3.filter(f => f.properties.part === 'post');
    assert.equal(posts.length, cs.length); assert.ok(posts.every(f => Math.abs(f.properties.h * FT - 5.5) < 0.05 && f.properties.b === 0), '5½ ft posts on the ground');
    const can = q.elements.find(e => e.kind === 'evcanopy'); assert.ok(can);
    const roof = c3.filter(f => f.properties.part === 'roof'); assert.equal(roof.length, 1); assert.ok(Math.abs(roof[0].properties.b * FT - S.EV_CANOPY_H) < 0.05);
    const cols = S.ev3d(can, cs.filter(c => S.hitRect(can, [c.x, c.y]))).filter(x => x.part === 'column');
    assert.ok(cols.length >= 2 && cols.every(x => x.ring.every(pt => S.hitRect({ ...can, w: can.w + 0.01, d: can.d + 0.01 }, pt))), 'columns under the roof');
    assert.ok(cols.every(x => !q.elements.some(d => d.kind === 'drive' && S.rectsOverlap({ poly: x.ring }, d, 0.1))), 'columns clear of the drives');
    const head = cs.filter(c => S.hitRect(can, [c.x, c.y])), side = x => { const u = S.rotPt([0, 1], can.rot || 0); return Math.sign((x[0] - can.x) * u[0] + (x[1] - can.y) * u[1]); };
    assert.ok(cols.every(x => side(S.centroid(x.ring)) === side([head[0].x, head[0].y])), 'columns on the chargers\' side of the canopy');
    const off = { ...q, program: { ...q.program, ev: null }, elements: q.elements.filter(e => !EVK.includes(e.kind)) }, fo = S.planFeatures(off).features;
    assert.ok(!fo.some(f => f.properties.k === 'evstall' || f.properties.k === 'c3'), 'nothing EV without chargers');
  }
  for (const { p: q } of onReal({ use: 'restaurant' }, { enabled: true, mode: 'count', value: 5, type: 'dcfc' })) {
    for (const x of S.evStalls(q)) { const pk = q.elements.find(e => e.id === x.parkingId); if (S.stallAng(pk)) assert.ok(S.angledStallPolys(pk).some(r => JSON.stringify(r.poly) === JSON.stringify(x.poly)), 'angled stall tinted as drawn'); assert.ok(x.dcfc); }
    assert.ok(S.planFeatures(q).features.filter(f => f.properties.k === 'evstall').every(f => f.properties.dcfc === 1), 'DC fast stalls tinted blue');
  }
}
// On a real layout every lot keeps its sheet label with the longer EV text (a small lot of 7 spaces, all of them EV, too)
{
  const ev = { enabled: true, mode: 'count', value: 40, type: 'level2' }, o = onReal({ use: 'retail', gfa: 40000 }, ev)[0], q = o.p;
  const lots = svg => (svg.match(/>[0-9]+ SPACES[^<]*</g) || []).length, evBy = S.evByLot(q.elements), svg = SH.planSVG(q, { px: 1400 }).svg;
  assert.equal(lots(svg), lots(SH.planSVG({ ...q, elements: q.elements.filter(e => !EVK.includes(e.kind)) }, { px: 1400 }).svg), 'no lot label lost');
  for (const [id, k] of evBy) assert.ok(svg.includes(S.stalls(q.elements.find(e => e.id === id)).count + ' SPACES · ' + k + ' EV'), 'lot ' + id + ' says its ' + k + ' EV');
}
// Angled rows (a restaurant's 45° one-way rows): the charger at the head of an angled stall, inside its parallelogram.
{ let angled = 0;
  for (const { p } of onReal({ use: 'restaurant' }, { enabled: true, mode: 'share', value: 10, type: 'dcfc', power: { w: 20, d: 20 } })) {
    const cs = onStalls(p, 'restaurant'); angled += cs.filter(c => S.stallAng(p.elements.find(e => e.id === c.parkingId))).length;
  }
  assert.ok(angled > 0, 'chargers were placed on angled stalls'); }
// A row parked head-in against the buildings has its heads on the building's walk: no charger there.
for (const { p } of onReal({ use: 'multifamily', units: 200 }, { enabled: true, mode: 'share', value: 10, type: 'dcfc', power: { w: 20, d: 20 } })) onStalls(p, 'multifamily');

// Build (lib/layoutrun.mjs): chargers go on last, after the run's passes have moved and trimmed parking; asking for them
// leaves the layout itself as it is without them (the same pond, the same pick of layout).
{
  const ev = { enabled: true, mode: 'count', value: 6, type: 'level2', power: { w: 10, d: 6 }, canopy: { w: 60, d: 18 } };
  const off = RUN.runPlan({ ...fm362, elements: [] }, { use: 'retail', gfa: 40000 }, { count: 3 }).options, on = RUN.runPlan({ ...fm362, elements: [] }, { use: 'retail', gfa: 40000, ev }, { count: 3 }).options;
  const bare = els => JSON.stringify(els.filter(e => !EVK.includes(e.kind)));
  assert.deepEqual(on.map(o => bare(o.elements)), off.map(o => bare(o.elements)), 'the run picks and draws the same layouts with EV asked for');
  for (const o of on) {
    assert.deepEqual(o.program.ev, S.normalizeProgram({ use: 'retail', ev }).ev);
    const p = { ...fm362, program: o.program, elements: o.elements }, cs = onStalls(p, 'run');
    assert.equal(cs.length, 6); assert.equal(o.check.status, off[on.indexOf(o)].check.status);
    assert.ok(o.elements.some(e => e.kind === 'evcanopy'), 'a 60 ft canopy over a 72 ft row: ' + o.notes.filter(n => /^EV/.test(n)).join(' | '));
    assert.ok(!('rankHash' in o));
  }
  for (const o of RUN.runPlan({ ...tract, elements: [] }, { use: 'restaurant', ev }, { count: 3 }).options) onStalls({ ...tract, program: o.program, elements: o.elements }, 'tract run');
  // edits (lib/layoutedit.mjs) lay the rest out again: the chargers follow onto the stalls as they are after the edit
  const rec = RUN.runBrief(RUN.briefForPlan({ ...fm362, elements: [] }, { use: 'retail', gfa: 40000, ev }, { count: 3 }));
  let r = LE.applyEdit(rec, { op: 'lock', target: { kind: 'building' } }); assert.ok(r.ok); r = LE.applyEdit(r.record, { op: 'regenerate' }); assert.ok(r.ok, (r.conflicts || []).join(' | '));
  assert.equal(onStalls({ ...fm362, program: r.record.options[0].program, elements: r.record.options[0].elements }, 'locked regenerate').length, 6, 'chargers over the parking field paving');
  assert.ok(!('rankHash' in r.record.options[0]));
  const mf = RUN.runBrief(RUN.briefForPlan({ ...fm362, elements: [] }, { use: 'multifamily', units: 200, ev }, { count: 3 }));
  const mv = LE.applyEdit(mf, { op: 'move', target: { kind: 'pool' }, to: 'center' }); assert.ok(mv.ok, (mv.conflicts || []).join(' | '));
  assert.equal(onStalls({ ...fm362, program: mv.record.options[0].program, elements: mv.record.options[0].elements }, 'moved pool').length, 6);
}

// A canopy shorter than the chargers' run covers as many as it can and says so; equipment dragged onto a building's
// walk is a plan-check problem.
{
  const o = EV.withEV(plan, { program: { use: 'retail', ev: { enabled: true, mode: 'count', value: 6, canopy: { w: 20, d: 18 } } }, elements: [parking, drive], notes: [] });
  const canopy = o.elements.find(e => e.kind === 'evcanopy'), cs = o.elements.filter(e => e.kind === 'evcharger');
  assert.ok(canopy && cs.filter(c => S.hitRect(canopy, [c.x, c.y])).length === 3); // (chargers 9 ft apart: a 20 ft canopy over three)
  assert.ok(o.notes.some(n => /canopy: covers 3 of the 6 chargers/.test(n)), o.notes.join(' | '));
  const bldg = { id: 'b-1', kind: 'building', use: 'retail', x: 500, y: 600, w: 200, d: 80, rot: 0, floors: 1 };
  const onWalk = { id: 'ev-charger-x', kind: 'evcharger', x: 500, y: 555, w: 2, d: 2, rot: 0, chargerType: 'level2', parkingId: null };
  const iss = S.check({ ...plan, program: { use: 'retail', ev: { enabled: true, mode: 'count', value: 1 } }, elements: [bldg, onWalk] }).filter(i => i.id === onWalk.id);
  assert.ok(iss.some(i => i.level === 'bad' && /walk round a building/.test(i.text)), JSON.stringify(iss));
}

console.log('EV site-layout tests passed');
