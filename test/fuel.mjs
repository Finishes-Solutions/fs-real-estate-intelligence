// Gas stations and corner sites: the words, the program, the layout (the canopy between the store and the busier street
// with lanes all round it, the store facing it, the tank pad the fuel truck reaches, a driveway on each street kept back
// from the corner, air / vacuum stalls, a car wash with its stacking lane), the numbers, the pro forma and the read-out,
// on realistic lots: a corner lot, an inside lot, a wedge, a corner clipped at the intersection, the 8-sided 19730 FM 362
// parcel and a small corner pad; then the corner shapes of a shopping strip (an L round the parking, a pad at the corner),
// which an inside lot never gets.
import assert from 'node:assert/strict';
import * as S from '../lib/siteplan.mjs';
import * as L from '../lib/sitelayout.mjs';
import * as PF from '../lib/proforma.mjs';
import { cornerOf, fuelLotPlan, FUEL_LOT } from '../lib/sitefuel.mjs';
import * as TOOLS from '../lib/sitetools.mjs';
import { placeWing } from '../lib/sitecorner.mjs';
import { readAs, notUnderstood } from '../lib/planruns.mjs';
import { headline } from '../lib/planpick.mjs';
import { keyItems } from '../lib/planmap.mjs';
import { planSVG, LEGEND } from '../lib/sitesheet.mjs';
import { BUILDING_TYPES, fromType } from '../lib/buildings.mjs';
import { SCHEMA, cleanZones } from '../api/siteplan.js';
import * as PS from '../lib/planset.mjs';
import * as PD from '../lib/plandesign.mjs';
import { stationOf, systemOf, checksOf, lightsOf } from '../lib/sheets/fuel.mjs';
import { fm362 } from './helpers/setctx.mjs';

// ---------- the words ----------
{ const g = S.guessProgram('gas station with 8 pumps and a 4,500 sf c-store on the corner');
  assert.equal(g.use, 'fuel', 'a gas station is its own use, not retail'); assert.ok(!g.zones, 'the c-store is the gas station’s, not a shop zone');
  assert.deepEqual([g.fuel.pumps, g.fuel.storeSf], [8, 4500]); const p = S.normalizeProgram(g); assert.equal(p.gfa, 4500); assert.equal(p.floors, 1); assert.equal(p.fuel.vac, true, 'air / vacuum unless they say no'); }
{ const g = S.guessProgram('QT style gas station with 12 pumps and a 5,500 sf store'); assert.equal(g.use, 'fuel'); assert.ok(!g.zones, '"a 5,500 sf store" with a gas station is its store'); assert.deepEqual([g.fuel.pumps, g.fuel.storeSf], [12, 5500]); }
{ const g = S.guessProgram('convenience store with 16 fueling positions and an express car wash'); assert.equal(g.use, 'fuel'); assert.equal(g.fuel.pumps, 8, '16 positions = 8 pumps'); assert.equal(g.fuel.wash, true);
  assert.equal(S.normalizeProgram(g).gfa, S.FUEL.storeSf + S.FUEL.washW * S.FUEL.washLen, 'the floor area: the store and the wash'); }
{ const g = S.guessProgram('a Buc-ee’s style travel center with diesel for trucks'); assert.equal(g.use, 'fuel'); assert.equal(g.fuel.truckStop, true); assert.equal(g.fuel.pumps, 12, 'a big store: 12 pumps'); }
assert.equal(S.guessProgram('20,000 sf retail strip on a corner lot').use, 'retail', 'a shopping strip is still retail');
assert.equal(S.guessProgram('self storage, 90,000 sf climate controlled').use, 'storage', 'self storage is still storage');
assert.equal(S.normalizeProgram({ use: 'fuel', fuel: { pumps: 10 } }).fuel.pumps, 10, '10 pumps is a size of its own');
assert.equal(S.normalizeProgram({ use: 'fuel', fuel: { pumps: 9 } }).fuel.pumps, 8, 'pumps come in 4, 6, 8, 10, 12 or 16 (9: the nearer below)');
assert.equal(S.normalizeProgram({ use: 'fuel', fuel: { pumps: 20 } }).fuel.pumps, 16);
assert.equal(S.normalizeProgram({ use: 'fuel' }).fuel.islands, 'along', 'pump islands along the street unless asked');
assert.equal(S.normalizeProgram({ use: 'fuel', fuel: { islands: 'across' } }).fuel.islands, 'across');
assert.equal(S.normalizeProgram({ use: 'fuel', fuel: { pumps: 13, storeSf: 90 } }).fuel.storeSf, 1500, 'a store kept in range');
assert.equal(S.normalizeProgram({ use: 'fuel', fuel: { canopy: 'side' } }).fuel.canopy, 'side');
{ const p = S.normalizeProgram({ use: 'fuel', fuel: { pumps: 10, wash: true }, zones: [{ use: 'fuel' }, { use: 'retail', gfa: 12000 }] }); assert.equal(p.use, 'retail', 'a gas station beside other uses: the plan’s use is the other one');
  assert.deepEqual(p.zones.map(z => z.use), ['retail', 'fuel'], 'its zone kept, and last (its own outparcel)'); assert.deepEqual([p.zones[1].fuel.pumps, p.zones[1].fuel.wash], [10, true], 'with the pumps and car wash asked for');
  assert.equal(p.zones[1].gfa, S.FUEL.storeSf + S.FUEL.washW * S.FUEL.washLen, 'its floor area: the store and the wash'); assert.deepEqual(S.normalizeProgram(p), p, 'normalized twice: the same'); }
{ const p = S.normalizeProgram({ use: 'retail', zones: [{ use: 'fuel' }, { use: 'retail' }, { use: 'fuel' }] }); assert.deepEqual(p.zones.map(z => z.use), ['retail', 'retail', 'fuel'], 'one gas station zone; a second is a shop zone'); }
assert.ok(SCHEMA.required.includes('fuel') && SCHEMA.properties.use.enum.includes('fuel') && SCHEMA.properties.fuel.required.every(k => k in SCHEMA.properties.fuel.properties), 'the AI’s program has a fuel object');

// ---------- layouts on real shapes ----------
const lot = (ring, words, extra = {}) => { const prog = S.guessProgram(words), plan = { ring, origin: [-95.8245, 29.7855], front: 0, setbacks: { ...S.SETBACKS, paveFront: 10, paveSide: 5, paveRear: 5 }, program: prog, elements: [], ...extra }; return { plan, prog, opts: L.layoutOptions(plan, prog, {}) }; };
const of = (plan, o) => ({ ...plan, program: o.program, elements: o.elements });
const touches = (a, b, g = 2) => S.rectsOverlap({ poly: S.grow(S.shapeOf(a), g) }, { poly: S.shapeOf(b) }, 0);
const streetsOf = plan => { const R = S.edgeRules(plan.ring, plan.front, plan.setbacks, plan.streets); return plan.ring.map((a, k) => R[k].role === 'front' || R[k].street ? k : -1).filter(k => k >= 0); };
const toEdge = (plan, k, p) => S.segDist(p, plan.ring[k], plan.ring[(k + 1) % plan.ring.length]);
function sound(name, plan, o, want) {
  const pl = of(plan, o), els = pl.elements, iss = S.check(pl), bad = iss.filter(i => i.level === 'bad');
  assert.equal(bad.length, 0, name + ': passes the checks: ' + bad.map(i => i.text).join('; '));
  assert.ok(!iss.some(i => /is at the mouth of|has no aisle|dead-ends|fuel truck can’t/.test(i.text)), name + ': no parking at a driveway’s mouth, every row on an aisle, no dead ends, the fuel truck gets in: ' + iss.map(i => i.text).join('; '));
  const can = els.filter(e => e.kind === 'canopy'), store = els.filter(e => e.kind === 'building' && e.fuel === 'store'), drives = els.filter(e => e.kind === 'drive');
  assert.equal(can.length, 1, name + ': one canopy'); assert.equal(store.length, 1, name + ': one store'); const c = can[0], st = store[0];
  assert.ok(c.pumps === want.pumps || o.notes.some(n => /of the \d+ pumps/.test(n)), name + ': the pumps asked for, or it says so: ' + c.pumps);
  assert.ok(Math.abs(S.gfaOf(st) - want.storeSf) < 50, name + ': the store at its size: ' + S.gfaOf(st));
  // the canopy runs along a street, between it and the store, and the store faces it
  const ks = streetsOf(plan), k = ks.slice().sort((a, b) => toEdge(plan, a, [c.x, c.y]) - toEdge(plan, b, [c.x, c.y]))[0], a = plan.ring[k], b = plan.ring[(k + 1) % plan.ring.length];
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI, along = c.w >= c.d ? c.rot : c.rot + 90, da = Math.abs(((along - ang) % 180 + 270) % 180 - 90);
  assert.ok(da < 6, name + ': the canopy runs along its street: ' + da.toFixed(1) + '°');
  assert.ok(toEdge(plan, k, [c.x, c.y]) < toEdge(plan, k, [st.x, st.y]) - 60, name + ': the canopy is between that street and the store');
  const u = S.rotPt([0, 1], c.rot), side = [c.x + u[0] * (c.d / 2 + 1), c.y + u[1] * (c.d / 2 + 1)], back = [c.x - u[0] * (c.d / 2 + 1), c.y - u[1] * (c.d / 2 + 1)], far = toEdge(plan, k, side) > toEdge(plan, k, back) ? side : back;
  assert.ok(Math.abs(((Math.atan2(st.y - far[1], st.x - far[0]) - Math.atan2(far[1] - c.y, far[0] - c.x)) * 180 / Math.PI + 540) % 360 - 180) < 50, name + ': the store sits across the parking from the canopy, facing it');
  // drive lanes on all four sides, 24 ft or more
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = S.rotPt([dx * (c.w / 2 + 12), dy * (c.d / 2 + 12)], c.rot), p = [c.x + q[0], c.y + q[1]];
    assert.ok(drives.some(d => S.hitRect(d, p) && Math.min(d.w, d.d) >= 23.5), name + ': a drive lane round the canopy (' + dx + ',' + dy + ')'); }
  // the tank pad: clear, and the fuel truck reaches it
  const t = els.filter(e => e.kind === 'tanks'); assert.equal(t.length, 1, name + ': a tank pad'); assert.ok(S.tankerReach(pl, t[0]), name + ': the fuel truck reaches the tanks');
  assert.ok(!els.some(e => (e.kind === 'parking' || e.kind === 'building') && S.rectsOverlap(e, t[0])), name + ': nothing over the tanks');
  // every drive on the network from an entrance
  const D = drives, seen = new Set(D.filter(e => S.entrancesOf([e]).length)), stack = [...seen];
  while (stack.length) { const e = stack.pop(); for (const f of D) if (!seen.has(f) && touches(e, f, 1.5)) { seen.add(f); stack.push(f); } }
  assert.equal(seen.size, D.length, name + ': every drive is reached from a driveway');
  for (const p of els.filter(e => e.kind === 'parking')) assert.ok(D.some(d => touches(p, d, 1)), name + ': every stall row on a drive');
  return S.metrics(pl);
}
const corner = (plan, o) => { const c = cornerOf(plan); return S.entrancesOf(o.elements).map(e => { const k = S.nearestEdge(plan.ring, S.centroid(S.shapeOf(e))); return { k, d: Math.hypot(e.x - c.at[0], e.y - c.at[1]) }; }); };
// a 1.65 acre corner lot: 8 pumps, a 4,500 sf store; one driveway on each street, back from the corner
{ const { plan, opts } = lot([[0, 0], [300, 0], [300, 240], [0, 240]], 'gas station with 8 pumps and a 4,500 sf c-store on the corner', { streets: [1] });
  assert.ok(opts.length >= 2, 'several layouts');
  for (const [i, o] of opts.entries()) {
    const m = sound('corner #' + i, plan, o, { pumps: 8, storeSf: 4500 });
    assert.equal(m.fuel.positions, 16); assert.ok(m.fuel.canopySf > 6000 && m.fuel.canopySf < 10000, 'a canopy for 8 pumps: ' + m.fuel.canopySf);
    assert.ok(Math.abs(m.coverage * m.siteSf - (m.footprint + m.fuel.canopySf)) < 1, 'the canopy counts toward coverage');
    const ents = corner(plan, o); assert.deepEqual([...new Set(ents.map(x => x.k))].sort(), [0, 1], 'a driveway on each street');
    for (const x of ents) assert.ok(x.d >= 100, 'each driveway 100 ft or more from the corner: ' + Math.round(x.d));
    if (i === 0) { assert.ok(m.spaces >= m.required, 'the recommended layout parks the store: ' + m.spaces + '/' + m.required); assert.ok(m.fuel.vac >= 3, 'air / vacuum stalls'); assert.match(o.name, /front street/, 'the canopy along the busier street first'); }
  }
  const o = opts[0], pl = of(plan, o);
  assert.ok(keyItems(pl).kinds.includes('canopy') && keyItems(pl).kinds.includes('tanks'), 'the plan key lists the canopy and the tanks');
  assert.match(headline(S.metrics(pl), null, null).sub, /8 pumps · 16 fueling positions/, 'the layout card says what it pumps');
  assert.equal(S.labelOf(o.elements.find(e => e.kind === 'canopy'), o.program).what, '8 pumps · 16 fueling positions');
  assert.equal(S.details(pl).pumps.length, 8, 'eight pump islands drawn under the canopy');
  const svg = planSVG(pl).svg; assert.ok(svg.includes('stroke-dasharray="5 3"'), 'the PDF draws the canopy'); assert.ok(LEGEND.some(([, k]) => k === 'canopy') && LEGEND.some(([, k]) => k === 'fuel'));
  assert.ok(S.toDXF(pl).includes('CANOPY'), 'the DXF has a canopy layer');
  // pro forma: a ground lease by default, or built and run by the owner
  const r = PF.run(pl, {}), d = PF.defaults(pl);
  assert.equal(d.fuel.mode, 'lease'); assert.ok(r.ops.noi > 0 && r.ops.lines.some(l => /Ground lease/.test(l.k)), 'a ground lease to a fuel retailer: ' + r.ops.lines.map(l => l.k));
  assert.equal(r.ops.tax, 0, 'a ground lease is net: the tenant pays the taxes'); assert.ok(r.budget.hard === 0, 'the retailer builds the store');
  const own = PF.run({ ...pl, pf: { fuel: { mode: 'owner' } } }, { ...PF.defaults({ ...pl, pf: { fuel: { mode: 'owner' } } }), fuel: { ...d.fuel, mode: 'owner' } });
  assert.ok(own.ops.lines.some(l => /gal a year/.test(l.k)) && own.ops.lines.some(l => /Inside sales/.test(l.k)), 'owner-run: fuel and inside-sales margins');
  assert.ok(own.budget.hard > 1e6 && own.ops.noi > 0 && own.A.marketCap >= 7.5, 'owner-run: the store, canopy, pumps and tanks priced, an operating business’s cap: ' + own.A.marketCap);
  assert.deepEqual(readAs(o.program, S.USES).slice(0, 3), ['Gas station / c-store', '8 pumps · 16 fueling positions', '4,500 sf store']);
  assert.deepEqual(notUnderstood('gas station with 8 pumps and a 4,500 sf c-store', o.program), [], 'the store’s size is understood');
}
// an inside lot: one or two driveways, both on the front, lined up with the canopy's end lanes
{ const { plan, opts } = lot([[0, 0], [280, 0], [280, 230], [0, 230]], 'gas station with 8 pumps and a 4,500 sf c-store');
  for (const [i, o] of opts.entries()) { sound('inside #' + i, plan, o, { pumps: 8, storeSf: 4500 }); const ents = S.entrancesOf(o.elements); assert.ok(ents.length >= 1 && ents.length <= 2 && ents.every(e => S.nearestEdge(plan.ring, [e.x, e.y]) === 0), 'inside lot: driveways on the front only'); }
  assert.equal(S.entrancesOf(opts[0].elements).length, 2, 'the frontage takes two: in at one end lane, out at the other'); }
// a car wash: the tunnel beside the store, its stacking lane off the back lane
{ const { plan, opts } = lot([[0, 0], [340, 0], [340, 300], [0, 300]], 'gas station, 8 pumps, 5,000 sf c-store and a car wash on the corner', { streets: [1] });
  const o = opts[0], m = sound('wash', plan, o, { pumps: 8, storeSf: 5000 }), w = o.elements.find(e => e.fuel === 'wash'), lane = o.elements.find(e => e.kind === 'drive' && e.wash);
  assert.ok(w && lane, 'a car wash and its stacking lane'); assert.ok(m.fuel.washSf > 1000, 'the wash counts: ' + m.fuel.washSf);
  assert.ok(touches(lane, w, 1.5) && o.elements.some(d => d.kind === 'drive' && d !== lane && !d.wash && touches(lane, d, 1)), 'the lane runs from a drive lane into the tunnel');
  assert.equal(m.required, Math.ceil(5000 / 1000 * 4), 'the car wash needs no parking of its own'); }
// odd corner lots: a wedge (the side street on the long slant), a corner clipped at the intersection, 19730 FM 362
for (const [name, ring, extra, words, want] of [
  ['wedge', [[0, 0], [420, 0], [40, 380]], { streets: [1] }, 'gas station with 8 pumps and a 4,500 sf c-store', { pumps: 8, storeSf: 4500 }],
  ['clipped corner', [[0, 0], [260, 0], [300, 40], [300, 260], [0, 260]], { streets: [1, 2] }, 'gas station with 8 pumps and a 4,500 sf c-store on the corner', { pumps: 8, storeSf: 4500 }],
  ['19730 FM 362', [[-441.8, -191.92], [475.3, -185.63], [474.61, -55.83], [354.06, -58.81], [353.81, 31.2], [474.04, 34.19], [472.83, 185.77], [-446.13, 190.03]], { front: 7, streets: [0] }, 'QT style gas station with 12 pumps and a 5,500 sf store', { pumps: 12, storeSf: 5500 }],
  ['small corner', [[0, 0], [200, 0], [200, 190], [0, 190]], { streets: [1] }, 'small gas station with 4 pumps and a 3,000 sf c-store', { pumps: 4, storeSf: 3000 }]]) {
  const { plan, opts } = lot(ring, words, extra); assert.ok(opts.length >= 1, name + ': layouts');
  for (const [i, o] of opts.entries()) { sound(name + ' #' + i, plan, o, want); const ents = corner(plan, o);
    assert.ok(new Set(ents.map(x => streetsOf({ ...plan, streets: plan.streets }).includes(x.k) ? x.k : -1)).size >= 1 && ents.length >= 1, name + ': driveways on the streets'); }
  const best = opts[0], ents = corner(plan, best); if (name !== 'small corner') for (const x of ents) assert.ok(x.d >= 100, name + ': driveways back from the corner: ' + Math.round(x.d));
  if (name === '19730 FM 362') assert.ok(best.notes.some(n => /acres are left for a future pad/.test(n)), 'a big parcel: the rest kept for later');
}
// the canopy along the side street, when asked
{ const { plan, opts } = lot([[0, 0], [240, 0], [240, 340], [0, 340]], 'gas station with 8 pumps and a 4,500 sf c-store, canopy along the side street', { streets: [1] });
  assert.ok(opts.length && opts.every(o => /side street/.test(o.name)), 'canopy along the side street, as asked');
  const c = opts[0].elements.find(e => e.kind === 'canopy'), along = c.w >= c.d ? c.rot : c.rot + 90; assert.ok(Math.abs(((along - 90) % 180 + 270) % 180 - 90) < 6, 'it runs along the side street (north-south)'); }
// ---------- re-fit round pieces placed by hand ----------
// the canopy dragged along the street (a drag pins it, as the editor does): it stays exactly there and the lanes, the
// store, its parking, the tanks and the driveways are laid out again round it; the same after the store is moved, after a
// pad is added at the back, and with the canopy turned to run back from the street; dragged off where its lanes can't
// go, nothing changes and the re-fit says why
{ const { plan, opts } = lot([[0, 0], [300, 0], [300, 240], [0, 240]], 'gas station with 8 pumps and a 4,500 sf c-store on the corner', { streets: [1] }), o = opts[0];
  assert.deepEqual(o.recipe, { fuel: true }, 'a gas station layout can be re-fitted');
  const edit = (pick, act, more = []) => { const els = JSON.parse(JSON.stringify(o.elements)), e = els.find(pick); act(e); e.pinned = true; return { p: { ...plan, program: o.program, recipe: o.recipe, elements: els.concat(more) }, e }; };
  const isC = e => e.kind === 'canopy', isS = e => e.kind === 'building' && e.fuel === 'store';
  for (const [name, pick, act] of [['canopy dragged 20 ft', isC, e => S.moveBy(e, 20, 0)], ['canopy dragged back 15 ft', isC, e => S.moveBy(e, -15, 6)], ['store dragged 25 ft', isS, e => S.moveBy(e, 25, 0)]]) {
    const { p, e } = edit(pick, act), r = L.refit(p, { amount: 'current' }); assert.ok(r?.elements?.length, name + ': re-fits');
    const m = sound('re-fit, ' + name, plan, { ...o, elements: r.elements }, { pumps: 8, storeSf: 4500 }); assert.ok(m.spaces >= m.required, name + ': parked: ' + m.spaces + '/' + m.required);
    const kept = r.elements.find(x => x.id === e.id); assert.ok(kept && kept.pinned && kept.x === e.x && kept.y === e.y && kept.rot === e.rot, name + ': stays where it was put');
    assert.equal(r.elements.filter(isC).length + r.elements.filter(isS).length, 2, name + ': one canopy, one store');
    assert.deepEqual([...new Set(corner(plan, { elements: r.elements }).map(x => x.k))].sort(), [0, 1], name + ': a driveway on each street still');
    assert.ok(L.refit(p)?.elements?.length, name + ': Re-fit Plan too'); }
  // a pad building placed at the back by hand: the station keeps clear of it
  { const pad = { id: 'pad1', kind: 'building', use: 'retail', x: 60, y: 195, w: 60, d: 40, rot: 0, floors: 1, name: 'Pad', pinned: true }, { p } = edit(isC, () => {}, [pad]), r = L.refit(p, { amount: 'current' });
    assert.ok(r?.elements?.length, 'a pad placed by hand: re-fits'); const pl = { ...p, elements: r.elements }; assert.equal(S.check(pl).filter(i => i.level === 'bad').length, 0, 'round the pad: passes: ' + S.check(pl).filter(i => i.level === 'bad').map(i => i.text));
    assert.ok(r.elements.some(e => e.id === 'pad1') && !r.elements.some(e => e.id !== 'pad1' && e.kind !== 'green' && e.kind !== 'tree' && S.rectsOverlap(e, pad, 0)), 'nothing laid over the pad'); }
  // off where its lanes can't go: nothing changes, and why
  { const { p } = edit(isC, e => S.moveBy(e, 120, 0)), r = L.refit(p, { amount: 'current' }); assert.ok(r && !r.elements.length && /drive lane all round/.test(r.why), 'no room for its lanes: says so: ' + r?.why); }
}
// the canopy turned to run back from the street (and set back so its lanes fit): lanes all round it, the store behind
{ const { plan, opts } = lot([[0, 0], [340, 0], [340, 300], [0, 300]], 'gas station with 8 pumps and a 4,500 sf c-store on the corner', { streets: [1] }), o = opts[0];
  const els = JSON.parse(JSON.stringify(o.elements)), c = els.find(e => e.kind === 'canopy'); c.rot = (c.rot || 0) + 90; S.moveBy(c, 0, 40); c.pinned = true;
  const p = { ...plan, program: o.program, recipe: o.recipe, elements: els }, r = L.refit(p, { amount: 'current' }); assert.ok(r?.elements?.length, 'a turned canopy re-fits');
  const pl = { ...p, elements: r.elements }, iss = S.check(pl); assert.equal(iss.filter(i => i.level === 'bad').length, 0, 'turned canopy: passes: ' + iss.filter(i => i.level === 'bad').map(i => i.text));
  const t = r.elements.find(e => e.kind === 'tanks'); assert.ok(t && S.tankerReach(pl, t), 'turned canopy: the fuel truck reaches the tanks');
  const c2 = r.elements.find(e => e.kind === 'canopy'), drives = r.elements.filter(e => e.kind === 'drive');
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = S.rotPt([dx * (c2.w / 2 + 12), dy * (c2.d / 2 + 12)], c2.rot); assert.ok(drives.some(d => S.hitRect(d, [c2.x + q[0], c2.y + q[1]])), 'turned canopy: a lane on each side'); } }

// ---------- the library ----------
{ const lib = BUILDING_TYPES.filter(t => t.group === 'Gas station'); assert.ok(lib.length >= 6 && lib.every(t => t.use === 'fuel' && t.fuel)); const e = fromType(lib.find(t => t.fuel === 'wash'), [0, 0]); assert.equal(e.fuel, 'wash');
  assert.ok(S.metrics({ ring: [[0, 0], [200, 0], [200, 200], [0, 200]], program: { use: 'fuel' }, elements: [{ ...e, id: 'w' }] }).required === 0, 'a car wash from the library needs no parking'); }

// ---------- corner shapes of a shopping strip ----------
{ const ring = [[0, 0], [380, 0], [380, 420], [0, 420]], words = '24,000 sf retail strip';
  const { plan, opts } = lot(ring, words, { streets: [1] }), names = opts.map(o => o.name);
  assert.ok(names.some(n => /L-shaped strip/.test(n)), 'a corner lot gets an L round the parking: ' + names);
  const o = opts.find(o => /L-shaped strip/.test(o.name)), pl = of(plan, o), Lb = o.elements.find(e => e.kind === 'building' && e.poly), m = S.metrics(pl);
  assert.equal(S.check(pl).filter(i => i.level === 'bad').length, 0, 'the L passes the checks'); assert.ok(m.spaces >= m.required, 'and parks: ' + m.spaces + '/' + m.required);
  assert.ok(Lb && Lb.poly.length === 6 && Math.abs(S.gfaOf(Lb) - 24000) < 600, 'one L-shaped building, the size asked: ' + Math.round(S.gfaOf(Lb)));
  // its storefronts face the parking in the crook: stalls run along both wings' inside faces
  const o2 = S.offsetRing(Lb.poly, 25), rows = o.elements.filter(e => e.kind === 'parking'); assert.ok(rows.filter(r => S.rectsOverlap({ poly: o2 }, r, 0)).length >= 2, 'parking along both wings');
  const ents = S.entrancesOf(o.elements).map(e => S.nearestEdge(ring, [e.x, e.y])); assert.deepEqual([...new Set(ents)].sort(), [0, 1], 'a driveway on each street');
  const all = L.layoutOptions(plan, S.guessProgram(words), { count: 8 }); assert.ok(all.some(x => /pad at the corner/.test(x.name)), 'and a pad at the corner with the strip behind: ' + all.map(x => x.name));
  const pad = all.find(x => /pad at the corner/.test(x.name)), pb = pad.elements.find(e => /Corner pad/.test(e.note || '')), cn = cornerOf(plan).at;
  assert.ok(pb && Math.hypot(pb.x - cn[0], pb.y - cn[1]) < Math.min(...pad.elements.filter(e => e.kind === 'building' && e !== pb).map(e => Math.hypot(e.x - cn[0], e.y - cn[1]))), 'the pad is the building nearest the corner');
  assert.equal(S.check(of(plan, pad)).filter(i => i.level === 'bad').length, 0, 'the pad layout passes the checks');
  // an inside lot never gets them
  const inside = lot(ring, words); assert.ok(!inside.opts.some(o => /L-shaped|pad at the corner/.test(o.name)), 'an inside lot: no corner shapes');
  // the L re-fits: the rows laid out again, the L back where it was
  const r = L.refit({ ...pl, recipe: o.recipe }); assert.ok(r?.elements?.length, 'the L layout re-fits');
  const L2 = r.elements.find(e => e.kind === 'building' && e.poly); assert.ok(L2 && Math.abs(S.gfaOf(L2) - S.gfaOf(Lb)) < 1, 'with its L');
  assert.equal(S.check({ ...pl, elements: r.elements }).filter(i => i.level === 'bad').length, 0, 'and passes');
}
// shops at the front of a mixed plan on a corner lot: an L of shops round their parking, and a pad at the corner, ranked
// with the usual layouts; the same plan on an inside lot gets neither
{ const ring = [[0, 0], [700, 0], [700, 900], [0, 900]], words = '30,000 sf retail and 150 apartments', prog = S.guessProgram(words);
  const plan = { ring, origin: [-95.8245, 29.7855], front: 0, streets: [1], setbacks: { ...S.SETBACKS, paveFront: 10, paveSide: 5, paveRear: 5 }, program: prog, elements: [] };
  const all = L.layoutOptions(plan, prog, { count: 6 }), names = all.map(o => o.name);
  for (const [re, what] of [[/L-shaped shops on the corner/, 'an L of shops'], [/pad at the corner/, 'a pad at the corner']]) {
    const o = all.find(x => re.test(x.name)); assert.ok(o, 'mixed corner lot: ' + what + ': ' + names);
    const pl = { ...plan, program: o.program, elements: o.elements }, m = S.metrics(pl); assert.equal(S.check(pl).filter(i => i.level === 'bad').length, 0, what + ': passes');
    assert.ok(m.spaces >= m.required * 0.97 && m.units >= 140, what + ': parks, and the apartments are there: ' + m.spaces + '/' + m.required + ', ' + m.units + ' units'); }
  const Lb = all.find(x => /L-shaped shops/.test(x.name)).elements.find(e => e.kind === 'building' && e.use === 'retail' && e.poly); assert.ok(Lb && Lb.poly.length === 6, 'an L-shaped shop building');
  const pd = all.find(x => /pad at the corner/.test(x.name)).elements.find(e => /Corner pad/.test(e.note || '')), cn = cornerOf(plan).at; assert.ok(pd && Math.hypot(pd.x - cn[0], pd.y - cn[1]) < 250, 'the pad by the corner');
  assert.ok(!L.layoutOptions({ ...plan, streets: [] }, prog, { count: 6 }).some(o => /on the corner|at the corner/.test(o.name)), 'an inside lot: no corner shapes in a mixed plan');
  // the wing on its own (frame feet): an aisle with stalls to its end, run under the wing, stops at the wing's walk
  // with its last 18 ft clear of stalls (a hammerhead), so it doesn't dead-end; its other end joins a drive
  { const els = [{ kind: 'drive', id: 'a', x: 250, y: 40, w: 400, d: 24, name: '', note: '' }, { kind: 'parking', id: 'p', x: 248, y: 61, w: 396, d: 18, row: -1 }, { kind: 'drive', id: 'c', x: 462, y: 110, w: 24, d: 180, name: '', note: '' },
      { kind: 'building', id: 'b', zone: 0, use: 'retail', floors: 1, x: 300, y: 135, w: 400, d: 100 }];
    assert.ok(placeWing(els, { s: 1, zone: 0, D: 100, x: 100, y0: 10, use: 'retail', floors: 1 }), 'the wing fits');
    const a = els.find(e => e.id === 'a'), p = els.find(e => e.id === 'p'), Lw = els.find(e => e.cornerL);
    assert.ok(Lw && Lw.poly.length === 6 && Math.abs(a.x - a.w / 2 - (200 + 12)) < 0.01, 'the aisle ends at the wing’s walk');
    assert.ok(p.x - p.w / 2 >= a.x - a.w / 2 + 18 - 0.01, 'its stalls stop 18 ft short of that end');
    assert.equal(S.deadEnds(els, 1).length, 0, 'no dead end'); }
  // the aisle that now stops at the L's side wing has room to turn (a hammerhead: no stalls on its last 18 ft), not a dead end
  const oL = all.find(x => /L-shaped shops/.test(x.name)), wing = S.shapeOf(Lb), near = p => S.distToPoly ? S.distToPoly(p, wing) : Math.min(...wing.map(q => Math.hypot(q[0] - p[0], q[1] - p[1])));
  const dead = S.deadEnds(oL.elements, 1).filter(d => near(d.end) < 60); assert.equal(dead.length, 0, 'the L: no aisle dead-ends at the wing: ' + dead.map(d => d.stalls + ' stalls'));
  assert.ok(!S.check({ ...plan, program: oL.program, elements: oL.elements }).some(i => /dead-ends/.test(i.text)), 'the L: no dead-end warning');
  // a hand edit, then the auto re-fit: the buildings keep their zones, so each zone keeps what it has (the shops' L too),
  // and Re-fit Plan agrees
  assert.ok(oL.elements.filter(e => e.kind === 'building' && e.use !== 'amenity').every(e => e.zone != null), 'mixed buildings keep their zone in the plan');
  const m0 = S.metrics({ ...plan, program: oL.program, elements: oL.elements }), retail = els => els.filter(e => e.kind === 'building' && e.use === 'retail').reduce((t, e) => t + S.gfaOf(e), 0);
  const els = JSON.parse(JSON.stringify(oL.elements)), apt = els.filter(e => e.use === 'multifamily').sort((a, b) => b.y - a.y)[0]; S.moveBy(apt, 0, -8); apt.pinned = true;
  const p1 = { ...plan, program: oL.program, recipe: oL.recipe, elements: els };
  for (const [nm, r] of [['auto re-fit', L.refit(p1, { amount: 'current' })], ['Re-fit Plan', L.refit(p1)]]) {
    assert.ok(r?.elements?.length, nm + ': re-fits'); const q = { ...p1, elements: r.elements }, m = S.metrics(q), bad = S.check(q).filter(i => i.level === 'bad');
    assert.equal(bad.length, 0, nm + ': passes: ' + bad.map(i => i.text));
    assert.ok(Math.abs(retail(r.elements) - retail(oL.elements)) <= retail(oL.elements) * 0.03, nm + ': the shops keep their floor area: ' + Math.round(retail(r.elements)) + ' of ' + Math.round(retail(oL.elements)));
    assert.ok(m.units >= m0.units * 0.97, nm + ': the apartments keep their units: ' + m.units + ' of ' + m0.units);
    assert.ok(r.elements.some(e => e.cornerL && e.poly), nm + ': the L stays'); assert.ok(r.elements.some(e => e.id === apt.id && e.y === apt.y), nm + ': the moved building stays where it was put');
    assert.ok(TOOLS.refitVerdict({ m: S.metrics(p1), issues: S.check(p1) }, { m, issues: S.check(q) }).ok, nm + ': the editor would take it'); }
  // an apartment building turned into offices by hand (Change use pins it and drops its units): it no longer counts
  // toward the apartment zone, so Re-fit Plan lays out the apartments asked for round it (141 of 150 when it still did)
  { const e2 = JSON.parse(JSON.stringify(oL.elements)), t = e2.filter(e => e.use === 'multifamily').sort((a, b) => b.y - a.y)[0], ask = S.normalizeProgram(oL.program).zones.find(z => z.use === 'multifamily').units;
    t.use = 'office'; delete t.units; t.pinned = true;
    const p2 = { ...plan, program: oL.program, recipe: oL.recipe, elements: e2 }, r = L.refit(p2); assert.ok(r?.elements?.length, 'use changed: re-fits');
    const u = r.elements.filter(e => e.kind === 'building' && e.use === 'multifamily').reduce((s, e) => s + (e.units || 0), 0), q = { ...p2, elements: r.elements };
    assert.ok(u >= ask * 0.97, 'use changed: the apartments asked for, round the offices: ' + u + ' of ' + ask);
    assert.deepEqual(S.check(q).filter(x => x.level === 'bad').map(x => x.text), [], 'use changed: passes');
    assert.ok(r.elements.some(e => e.id === t.id && e.use === 'office'), 'use changed: the offices stay'); } }

// ---------- Site parameters: only what the plan's uses read ----------
{ const f = w => { const u = S.usesOf(S.guessProgram(w)), has = l => l.some(x => u.includes(x)); return { form: has(S.FORM_USES), apts: u.includes('multifamily'), streets: u.includes('sfr'), trash: !u.every(x => S.CART_USES.includes(x)), perSf: u.some(S.PER_SF_TRASH) }; };
  assert.deepEqual(f('gas station with 8 pumps'), { form: false, apts: false, streets: false, trash: true, perSf: true }, 'a gas station: no building shape or apartment settings');
  assert.deepEqual(f('self storage, 90,000 sf climate controlled'), { form: false, apts: false, streets: false, trash: true, perSf: true }, 'self storage');
  assert.deepEqual(f('20,000 sf retail strip'), { form: true, apts: false, streets: false, trash: true, perSf: true }, 'shops: the building shape');
  assert.deepEqual(f('200 apartments'), { form: true, apts: true, streets: false, trash: true, perSf: false }, 'apartments');
  assert.deepEqual(f('40 single-family homes'), { form: false, apts: false, streets: true, trash: false, perSf: false }, 'homes: streets, carts at the curb');
  assert.deepEqual(f('30,000 sf retail and 150 apartments'), { form: true, apts: true, streets: false, trash: true, perSf: true }, 'a mixed plan: both'); }

// ---------- a gas station beside other uses: its own outparcel ----------
// The 20.78-acre 0 Waller Tomball Rd parcel (0422460000011): FM 2920 along the north (the front), a side street marked
// on the west, as the project has it
const WTR = { ring: [[492.21, 460.25], [-346.09, 448.76], [-507.78, 447.67], [-488.89, -461.27], [504.61, -447.67]], front: 0, streets: [1, 2], origin: [-95.8897177, 30.0640874], setbacks: { rear: 20, side: 10, front: 25, paving: 10 }, params: {}, elements: [] };
{ const g = S.guessProgram('gas station with 10 pumps and a 4,500 sf c-store on the corner with 40,000 sf of retail behind it and 200 apartments at the back'), p = S.normalizeProgram(g);
  assert.deepEqual(p.zones.map(z => z.use), ['retail', 'multifamily', 'fuel'], 'the gas station a zone of its own, last'); assert.equal(p.use, 'retail');
  assert.deepEqual([p.zones[2].fuel.pumps, p.zones[2].fuel.storeSf], [10, 4500]); assert.equal(p.zones[0].gfa, 40000);
  assert.deepEqual(readAs(p, S.USES).slice(0, 4), ['Mixed use', 'Retail 40,000 sf', '200 apartments', 'Gas station · 10 pumps · 4,500 sf store']); }
{ const p = S.normalizeProgram(S.guessProgram('c-store with 8 pumps, 30,000 sf of retail and 150 single family homes')); assert.equal(p.zones.find(z => z.use === 'fuel').fuel.storeSf, S.FUEL.storeSf, 'the store isn’t given the shops’ 30,000 sf');
  assert.equal(p.zones.find(z => z.use === 'retail').gfa, 30000); }
assert.equal(cleanZones([{ use: 'fuel' }, { use: 'retail' }], { words: [{ use: 'retail' }, { use: 'fuel' }] })?.length, 2, 'a gas station and unsized shops: still a mix (the shops take the land it leaves)');
// laid out on the parcel: the station on a corner outparcel, the shops and apartments behind and beside it
const ASK = 'gas station with 10 pumps and a 4,500 sf c-store on the corner with 40,000 sf of retail behind it and 200 apartments at the back';
const mixOut = L.layoutOptions(WTR, S.guessProgram(ASK), {});
assert.ok(mixOut.length >= 2, 'layouts');
for (const o of mixOut) {
  const pl = { ...WTR, program: o.program, elements: o.elements }, m = S.metrics(pl), lot = o.zones.find(z => z.use === 'fuel').ring, inLot = S.grow(lot, -3);
  assert.equal(o.elements.filter(e => e.kind === 'canopy').length, 1, 'one canopy'); assert.equal(m.fuel.mpds, 10, 'every pump asked for'); assert.equal(m.fuel.tanks, 1, 'its tank pad');
  assert.ok(o.elements.some(e => e.kind === 'building' && e.use === 'fuel' && S.fuelKind(e) === 'store'), 'the c-store');
  assert.ok(o.recipe.fuelLot && o.zones.at(-1).acres > 1.2 && o.zones.at(-1).acres < 3, 'an outparcel of 1.2–3 acres: ' + o.zones.at(-1).acres.toFixed(2));
  const station = o.elements.filter(e => e.lot === 'fuel'), rest = o.elements.filter(e => e.lot !== 'fuel' && !e.cross && !['green', 'lot', 'trail', 'fence'].includes(e.kind));
  for (const e of station.filter(e => e.kind !== 'green')) assert.ok(S.isEntrance(e) ? S.inRing(S.centroid(S.outline(e)), S.grow(lot, 2)) : S.outline(e).every(q => S.inRing(q, S.grow(lot, 2))), e.kind + ' ' + (e.name || '') + ' is on the outparcel'); // (a driveway runs on to the street)
  for (const e of rest) assert.ok(!S.rectsOverlap({ poly: S.shapeOf(e) }, { poly: inLot }, 0), e.kind + ' ' + (e.name || '') + ' of the center is off the outparcel');
  assert.ok(cornerOf({ ...WTR, ring: lot }) || S.distToPoly([WTR.ring[2][0], WTR.ring[2][1]], lot) < 5, 'at the north-west corner (FM 2920 and the side street)');
  assert.ok(o.elements.some(e => e.cross), 'a cross-access drive between the station and the center');
  assert.equal(S.check(pl).filter(i => i.level === 'bad').length, 0, 'no rule broken: ' + S.check(pl).filter(i => i.level === 'bad').map(i => i.text).join('; '));
  const names = S.entrancesOf(o.elements).map(e => e.name); assert.equal(new Set(names).size, names.length, 'each driveway its own name: ' + names); assert.equal(names.filter(n => n === 'Main entry').length, 1, 'one main entry for the site');
  assert.ok(m.gfa > 40000 && (m.units || 0) >= 190, 'the shops and apartments behind it: ' + Math.round(m.gfa) + ' sf, ' + m.units + ' units');
}
{ const o = mixOut[0], pl = { ...WTR, program: o.program, elements: o.elements }, m = S.metrics(pl); assert.ok(m.spaces >= m.required, 'the best one parked: ' + m.spaces + ' / ' + m.required);
  const R = PF.run(pl); assert.ok(R.ops.lines.some(l => /Ground lease to a fuel retailer, NNN \(10 pumps\)/.test(l.k)), 'the pro forma: the ground lease beside the rents');
  // the outparcel's own lot lines: the streets stay streets, the inside lines are lot lines with a 10 ft building line
  const lp = fuelLotPlan(WTR, o.zones.at(-1).ring), R2 = S.edgeRules(lp.ring, lp.front, lp.setbacks, lp.streets);
  assert.equal(R2[lp.front].role, 'front'); assert.ok(R2.some(r => r.street), 'the side street'); assert.ok(R2.some(r => r.inside && r.build === 10), 'an inside lot line');
  // a re-fit after the canopy is moved along the street: the station re-fits on its outparcel, the rest round it
  const p2 = structuredClone(pl), c = p2.elements.find(e => e.kind === 'canopy'), a = (c.rot || 0) * Math.PI / 180; c.x += 20 * Math.cos(a); c.y += 20 * Math.sin(a); c.pinned = true; p2.recipe = o.recipe;
  const r = L.refit(p2, { amount: 'current' }), m2 = S.metrics({ ...pl, elements: r.elements });
  assert.equal(m2.fuel.mpds, 10, 're-fit: every pump'); assert.ok(m2.units >= m.units * 0.95, 're-fit: the apartments kept: ' + m2.units); assert.ok(r.recipe?.fuelLot, 're-fit: the outparcel kept in the recipe');
  const c2 = r.elements.find(e => e.kind === 'canopy'); assert.ok(Math.hypot(c2.x - c.x, c2.y - c.y) < 1, 're-fit: the canopy stays where it was put');
  assert.equal(S.check({ ...pl, elements: r.elements }).filter(i => i.level === 'bad' && !i.id?.startsWith?.(c.id)).length, 0, 're-fit: no rule broken'); }
// an inside lot (no side street): the station at one end of the frontage
{ const o = L.layoutOptions({ ...WTR, streets: [1] }, S.guessProgram('gas station with 8 pumps and retail behind'), { count: 1 })[0], lot = o.zones.at(-1).ring;
  assert.equal(S.metrics({ ...WTR, elements: o.elements }).fuel.mpds, 8); assert.ok(/^Gas station at the front/.test(o.name), o.name);
  const xs = lot.map(q => q[0]); assert.ok(Math.min(...xs) < -480 || Math.max(...xs) > 480, 'at an end of the frontage'); }
// pump islands across the street: each island turned toward the store, the canopy sized for them
{ const c = S.canopyOf(10, 2, 'across'); assert.deepEqual([c.per, c.w, c.d, c.islands], [5, 5 * S.FUEL.pitchX + 6, 2 * S.FUEL.rowX + 6, 'across']); assert.deepEqual([S.canopyOf(8, 2).w, S.canopyOf(8, 2).d], [4 * 30 + 6, 2 * 28 + 6], 'along: as before');
  const e = { kind: 'canopy', x: 0, y: 0, w: c.w, d: c.d, rot: 0, pumps: 10, rows: 2, islands: 'across' }, P = S.pumpsOf(e);
  assert.equal(P.length, 10); assert.ok(P.every(q => q.d > q.w), 'across: each island runs across the canopy'); assert.ok(S.pumpsOf({ ...e, islands: 'along' }).every(q => q.w > q.d), 'along: each island runs along it');
  const P0 = S.normalizeProgram(S.guessProgram(ASK)); P0.zones.at(-1).fuel.islands = 'across'; const o = L.layoutOptions(WTR, P0, { count: 1 })[0], cv = o.elements.find(x => x.kind === 'canopy');
  assert.equal(cv.islands, 'across', 'the layout draws them across'); assert.ok(Math.abs(Math.max(cv.w, cv.d) - c.w) < 1 && Math.abs(Math.min(cv.w, cv.d) - c.d) < 1, 'its canopy sized for them'); }
// the canopy in 3D: per island a curb, its dispenser and a column up to the clearance; the roof deck and the fascia band
{ const e = { kind: 'canopy', id: 'cv', x: 0, y: 0, w: 156, d: 62, rot: 0, pumps: 10, rows: 2 }, parts = S.canopy3d(e), by = k => parts.filter(p => p.part === k);
  assert.deepEqual(['curb', 'mpd', 'column', 'roof', 'fascia'].map(k => by(k).length), [10, 10, 10, 1, 1]);
  assert.ok(by('column').every(p => p.b < 1 && p.h === S.FUEL.canopyH), 'columns from the island to the clearance'); assert.ok(by('mpd').every(p => p.h === 7), 'dispensers 7 ft');
  assert.ok(by('roof')[0].b >= S.FUEL.canopyH && by('fascia')[0].b === S.FUEL.canopyH && by('fascia')[0].hole?.length >= 4, 'the deck above the clearance, the fascia a band round it');
  for (const q of by('column')) assert.ok(S.pumpsOf(e).some(i => S.inRing(S.centroid(q.ring), S.corners(i))), 'each column stands on an island');
  const fc = S.planFeatures({ ...WTR, elements: [e] }, null), c3 = fc.features.filter(f => f.properties.k === 'c3');
  assert.equal(c3.length, parts.length, 'on the map'); assert.ok(c3.every(f => f.properties.h > f.properties.b), 'each piece has height'); assert.equal(c3.find(f => f.properties.part === 'fascia').geometry.coordinates.length, 2, 'the fascia a ring with a hole'); }

// ---------- the plan set: the canopy, the pumps and the tanks get sheets of their own; every building its own type ----------
const setOf = (plan, sections = PS.SECTIONS.map(x => x.id)) => { const types = PD.buildingTypes(plan), designs = {}; for (const t of types.filter(t => t.supported)) designs[t.id] = PD.placeDesign(PD.fallbackDesign(t), t).design;
  const sheets = PS.sheetList(plan, { types, sections }); return { types, sheets, ctx: PS.setContext({ plan, project: { name: 'Test' }, address: '0 Waller Tomball Rd', county: 'Harris County, Texas', parcels: [], facts: [], notes: [], types, designs, date: 'October 22, 2026', revisions: [] }, sheets) }; };
const F_SHEETS = ['F-001', 'F-101', 'F-102', 'F-201', 'F-301', 'F-401', 'F-501'];
{ // the Waller mixed plan: a station among shops and apartments
  const o = mixOut[0], plan = { ...WTR, name: 'Option A', program: o.program, elements: o.elements, zones: o.zones, recipe: o.recipe }, { types, sheets, ctx } = setOf(plan);
  assert.deepEqual(sheets.filter(x => x.section === 'fuel').map(x => x.number), F_SHEETS, 'a gas station: its fuel system and canopy sheets');
  const store = types.find(t => t.use === 'fuel'); assert.ok(store && store.supported && !store.wash, 'the c-store keeps a building type of its own among the apartments and shops (its plans, elevations, structure, MEP)');
  assert.ok(sheets.some(x => x.typeId === store.id && x.kind === 'a-plans') && sheets.some(x => x.typeId === store.id && x.kind === 's-found') && sheets.some(x => x.typeId === store.id && x.kind === 'e-plan'), 'the c-store’s A, S and E sheets');
  for (const u of new Set(plan.elements.filter(e => e.kind === 'building').map(e => e.use))) assert.ok(types.some(t => t.use === u), 'every use keeps a type: ' + u);
  for (const sh of sheets.filter(x => x.section === 'fuel')) { const html = PS.sheetPage(ctx, sh); assert.ok(!/couldn’t be drawn|isn’t drawn yet/.test(html), sh.number + ' draws'); assert.ok(html.length > 3000, sh.number + ' has a drawing'); assert.match(html, /1&quot; = \d+'-0&quot;|&quot; = 1'-0&quot;|N\.T\.S\.|As noted/, sh.number + ' says its scale'); }
  const st = stationOf(plan), sys = systemOf(st);
  assert.equal(st.islands.length, 10, 'ten dispensers'); assert.equal(st.cols.length, 10, 'a column on each island'); assert.ok(Math.abs(st.W - Math.max(o.elements.find(e => e.kind === 'canopy').w, o.elements.find(e => e.kind === 'canopy').d)) < 0.01);
  assert.equal(sys.tanks.length, 3, 'a tank for each product'); for (const t of sys.tanks) assert.ok(t.x0 >= st.tank.x0 - 0.01 && t.x1 <= st.tank.x1 + 0.01 && t.y0 >= st.tank.y0 - 0.01 && t.y1 <= st.tank.y1 + 0.01 && t.cap >= 6000, t.tag + ' in the tank pad, ' + t.cap + ' gal');
  for (const c of checksOf(st)) assert.ok(c.ok, 'separation: ' + c.item + ' ' + c.have.toFixed(1) + (c.have2 != null ? '–' + c.have2.toFixed(1) : '') + ' ft');
  const L = lightsOf(st); assert.ok(L.fc >= 20 && L.fc <= 40, 'canopy lighting about 20–40 fc: ' + L.fc.toFixed(0));
  assert.ok(PS.DISCIPLINES.fuel && PS.SECTION_DISC.fuel === 'fuel', 'the fuel section has its own notes from the AI'); }
{ // a station with a car wash: the wash is designed as a car wash, not a second store
  const o = L.layoutOptions(fm362, { use: 'fuel', fuel: { pumps: 10, wash: true } })[0], plan = { ...fm362, name: 'Option A', program: o.program, elements: o.elements, zones: o.zones }, { types, sheets, ctx } = setOf(plan);
  const wash = types.find(t => t.wash), store = types.find(t => t.use === 'fuel' && !t.wash); assert.ok(wash && store, 'the store and the car wash, each a type');
  assert.equal(wash.label, 'Car wash'); assert.equal(wash.occupancy, 'B');
  const d = PD.placeDesign(PD.fallbackDesign(wash), wash); assert.deepEqual(d.problems, [], 'the car wash design passes the checks'); assert.ok(d.design.rooms.some(r => r.name === 'Wash tunnel') && d.design.doors.filter(x => x.kind === 'overhead').length === 2, 'a tunnel with an overhead door at each end');
  assert.ok(!d.design.rooms.some(r => r.type === 'sales'), 'no sales floor in the car wash');
  assert.match(PD.designBrief(wash), /car wash tunnel/, 'the AI is asked for a car wash'); assert.match(PD.designBrief(store), /convenience store/);
  for (const sh of sheets.filter(x => x.section === 'fuel')) assert.ok(!/couldn’t be drawn/.test(PS.sheetPage(ctx, sh)), sh.number + ' draws');
  for (const c of checksOf(stationOf(plan))) assert.ok(c.ok, 'separation (10 pumps, store far back): ' + c.item); }
{ // a canopy drawn by hand, no pumps, store or tanks yet: every F sheet still draws
  const plan = { ring: [[0, 0], [300, 0], [300, 250], [0, 250]], front: 0, origin: [-95.8, 29.7], setbacks: {}, program: { use: 'fuel' }, elements: [{ id: 'c', kind: 'canopy', x: 150, y: 60, w: 120, d: 60, rot: 0, pumps: 0, rows: 1 }] }, { sheets, ctx } = setOf(plan);
  assert.equal(sheets.filter(x => x.section === 'fuel').length, 7); for (const sh of sheets.filter(x => x.section === 'fuel')) assert.ok(!/couldn’t be drawn/.test(PS.sheetPage(ctx, sh)), 'bare canopy: ' + sh.number + ' draws'); }
{ // no canopy, no fuel sheets
  const o = L.layoutOptions(fm362, { use: 'retail', gfa: 20000 })[0], plan = { ...fm362, program: o.program, elements: o.elements };
  assert.ok(!PS.sheetList(plan, { types: PD.buildingTypes(plan) }).some(x => x.section === 'fuel'), 'a shopping center: no fuel sheets'); assert.equal(PS.sectionCounts(plan, 0, PD.buildingTypes(plan)).fuel, 0); }
console.log('fuel ok');
