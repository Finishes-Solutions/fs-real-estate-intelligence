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
import { cornerOf } from '../lib/sitefuel.mjs';
import { readAs, notUnderstood } from '../lib/planruns.mjs';
import { headline } from '../lib/planpick.mjs';
import { keyItems } from '../lib/planmap.mjs';
import { planSVG, LEGEND } from '../lib/sitesheet.mjs';
import { BUILDING_TYPES, fromType } from '../lib/buildings.mjs';
import { SCHEMA } from '../api/siteplan.js';

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
assert.equal(S.normalizeProgram({ use: 'fuel', fuel: { pumps: 10 } }).fuel.pumps, 8, 'pumps come in 4, 6, 8 or 12');
assert.equal(S.normalizeProgram({ use: 'fuel', fuel: { pumps: 13, storeSf: 90 } }).fuel.storeSf, 1500, 'a store kept in range');
assert.equal(S.normalizeProgram({ use: 'fuel', fuel: { canopy: 'side' } }).fuel.canopy, 'side');
{ const p = S.normalizeProgram({ use: 'fuel', zones: [{ use: 'fuel' }, { use: 'retail', gfa: 12000 }] }); assert.equal(p.use, 'retail', 'a gas station beside other uses: a shop zone'); assert.ok(p.zones.every(z => z.use === 'retail')); }
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
  assert.ok(!L.layoutOptions({ ...plan, streets: [] }, prog, { count: 6 }).some(o => /on the corner|at the corner/.test(o.name)), 'an inside lot: no corner shapes in a mixed plan'); }

// ---------- Site parameters: only what the plan's uses read ----------
{ const f = w => { const u = S.usesOf(S.guessProgram(w)), has = l => l.some(x => u.includes(x)); return { form: has(S.FORM_USES), apts: u.includes('multifamily'), streets: u.includes('sfr'), trash: !u.every(x => S.CART_USES.includes(x)), perSf: u.some(S.PER_SF_TRASH) }; };
  assert.deepEqual(f('gas station with 8 pumps'), { form: false, apts: false, streets: false, trash: true, perSf: true }, 'a gas station: no building shape or apartment settings');
  assert.deepEqual(f('self storage, 90,000 sf climate controlled'), { form: false, apts: false, streets: false, trash: true, perSf: true }, 'self storage');
  assert.deepEqual(f('20,000 sf retail strip'), { form: true, apts: false, streets: false, trash: true, perSf: true }, 'shops: the building shape');
  assert.deepEqual(f('200 apartments'), { form: true, apts: true, streets: false, trash: true, perSf: false }, 'apartments');
  assert.deepEqual(f('40 single-family homes'), { form: false, apts: false, streets: true, trash: false, perSf: false }, 'homes: streets, carts at the curb');
  assert.deepEqual(f('30,000 sf retail and 150 apartments'), { form: true, apts: true, streets: false, trash: true, perSf: true }, 'a mixed plan: both'); }
console.log('fuel ok');
