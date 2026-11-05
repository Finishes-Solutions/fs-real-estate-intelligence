// Building types as parametric primitives (lib/btypes.mjs): the engine's existing types are presets with the engine's own
// numbers and leave every existing request's program as it was; the new presets read from the words and modified by them;
// unknown types mapped to the closest primitive with a note; after a run each building of the type is named, counted and
// coloured, the brief carries the type's parking rule, and the run replays identically.
import assert from 'node:assert/strict';
import * as S from '../lib/siteplan.mjs';
import * as BT from '../lib/btypes.mjs';
import * as B from '../lib/layoutbrief.mjs';
import * as RUN from '../lib/layoutrun.mjs';
import { TYPES, WRAP, GATE } from '../lib/sitegen.mjs';
import { REF_TEMPLATES } from '../lib/reftemplates.mjs';
import { USE_COL } from '../lib/planmap.mjs';

const P = id => BT.presetOf(id);
const polyArea = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return Math.abs(s / 2); };

// ---------- 1. the registry ----------
{
  for (const [id, pr] of Object.entries(BT.PRIMITIVES)) { const o = pr.outline({}); assert.ok(o.length >= 4 && polyArea(o) > 0, id + ': an outline'); if (pr.mapsTo) assert.ok(BT.PRIMITIVES[pr.mapsTo], id + ' maps to a primitive'); }
  const ids = new Set();
  for (const p of BT.PRESETS) {
    assert.ok(!ids.has(p.id), 'one preset a name: ' + p.id); ids.add(p.id);
    assert.ok(BT.PRIMITIVES[p.primitive], p.id + ': its primitive exists');
    assert.ok(S.USES[p.use], p.id + ': its engine use exists');
    assert.ok(['reviewed', 'engine', 'standard', 'estimate'].includes(p.src?.cls) && p.src.ref, p.id + ': where its numbers come from');
    if (p.color) assert.ok(BT.TYPE_COLORS[p.color] && USE_COL[p.color], p.id + ': its colour on the map and the plan key');
    if (!p.existing) assert.ok(typeof p.when === 'function' && typeof p.apply === 'function' && p.label && p.short, p.id + ': words and a program');
  }
  for (const k of Object.keys(BT.TYPE_COLORS)) assert.ok(BT.TYPE_LABELS[k] && !S.USES[k], k + ': a plan key label, apart from the engine uses');
  assert.ok(BT.PRESETS.filter(p => p.existing).length >= 30, 'the engine’s types are presets');
  assert.ok(BT.PRESETS.filter(p => !p.existing).length >= 20, 'and the new ones: ' + BT.PRESETS.filter(p => !p.existing).length);
}

// ---------- 2. existing presets carry the engine's own numbers ----------
{
  const U = S.USES;
  for (const id of ['office', 'medical', 'hotel', 'church', 'venue', 'storage']) { const p = P(id).params, u = U[P(id).use]; for (const k of ['depth', 'floors', 'ratio', 'floorH']) if (p[k] != null) assert.equal(p[k], u[k], id + ' ' + k); }
  assert.equal(P('hotel').params.sfPerKey, U.hotel.roomSf);
  for (const [id, u] of [['ret-inline', 'retail'], ['ret-restaurant', 'restaurant'], ['ind-warehouse', 'industrial']]) for (const k of ['depth', 'ratio', 'floorH']) assert.equal(P(id).params[k], U[u][k], id + ' ' + k);
  assert.equal(P('ind-warehouse').params.truck, U.industrial.truck);
  assert.equal(P('mf-garden').params.perUnit, U.multifamily.perUnit); assert.equal(P('mf-garden').params.floorH, U.multifamily.floorH);
  for (const k of ['unitW', 'depth', 'floors', 'perUnit', 'floorH']) assert.equal(P('mf-townhome').params[k], U.townhomes[k], 'townhome ' + k);
  assert.equal(P('mf-plex').params.depth, U.duplex.depth); assert.equal(P('mf-plex').params.perUnit, U.duplex.perUnit);
  const tpl = (id, t) => { const m = REF_TEMPLATES[t].module, p = P(id).params; assert.equal(p.moduleW ?? p.unitW, m.w, id + ' module'); assert.equal(p.depth, m.d, id + ' depth'); if (p.unitsPerFloor) assert.equal(p.unitsPerFloor, m.unitsPerFloor, id + ' units a floor'); assert.equal(p.floors, REF_TEMPLATES[t].floors, id + ' floors'); };
  tpl('mf-garden', 'mf-garden-breezeway-3s'); tpl('mf-garden-studio', 'mf-garden-studio-3s'); tpl('mf-midrise', 'mf-midrise-corridor-4s'); tpl('mf-tuck-under', 'mf-tuckunder-2s'); tpl('mf-stacked-townhome', 'mf-stacked-2over2-4s');
  assert.equal(P('mf-courtyard').params.wing, TYPES.wing.D); assert.equal(P('mf-courtyard').params.gate, GATE); assert.equal(P('mf-wrap').params.wing, WRAP.D);
  assert.equal(P('mf-tower-podium').params.depth, S.PODIUM.depth);
  assert.deepEqual([P('sfr-subdivision').params.w, P('sfr-subdivision').params.d, P('sfr-subdivision').params.lotW], [S.HOME_TYPES[2].w, S.HOME_TYPES[2].d, S.HOME_TYPES[2].lotW]);
  assert.equal(P('fuel').params.pumps, S.FUEL.pumps); assert.equal(P('fuel').params.storeSf, S.FUEL.storeSf);
}

// ---------- 3. existing requests: the program is exactly what it was (no type fields) ----------
{
  const asks = ['exactly 120 garden apartments, 3 stories', 'courtyard apartments, 150 units', 'mid-rise apartments, 4 stories, as many as fit', 'townhomes, as many as fit', 'fee simple townhomes with garages, as many as fit',
    'duplexes, as many as fit', 'tower on a podium, 8 stories, 300 apartments', 'a wrap building with 300 apartments', 'tuck-under apartments, 120 units', 'stacked townhomes, 120 units', 'build-to-rent cottages, as many as fit',
    'exactly 28,000 sf retail in four buildings', 'anchored shopping center with a 40,000 sf anchor, 80,000 sf total', '2,500 sf restaurant with a drive-thru', 'warehouse with truck court, 250,000 sf', 'cross-dock warehouse, 400,000 sf',
    'flex industrial buildings, 60,000 sf', '20,000 sf retail along the main road, 240 apartments behind and 80 townhomes', 'a 5-story mixed-use building with 20,000 sf ground-floor retail and 200 apartments above', '30,000 sf retail',
    'hotel, 60,000 sf', '20,000 sf medical', 'self storage with RV parking', 'gas station with 12 pumps', 'church with 600 seats', 'food truck park with 10 trucks', 'a 4,000 sf coffee shop with a drive-thru', '6000+ sf L-shaped retail building with a drive thru drive and adequate parking',
    'senior apartments, mid-rise, 4 stories, as many as fit', 'exactly 355 senior apartments, mid-rise, 4 stories, with elevators', 'student apartments, garden style, 200 units', 'exactly 82 townhomes', 'a wrap building with 172 apartments'];
  for (const a of asks) { const g = S.guessProgram(a); assert.ok(!Object.keys(g).some(k => k.startsWith('bt')) && !(g.zones || []).some(z => Object.keys(z).some(k => k.startsWith('bt'))), 'no type change for an existing request: ' + a + ' ' + JSON.stringify(g)); }
}

// ---------- 4. the words: types named and modified ----------
{
  const g = a => S.guessProgram(a);
  let p = g('L-shaped 4-story apartments');
  assert.equal(p.btype, 'mf-l'); assert.equal(p.form, 'L'); assert.equal(p.floors, 4); assert.equal(p.btForm, 'multifamily');
  p = g('U building around a pool'); assert.equal(p.btype, 'mf-courtyard-u'); assert.equal(p.use, 'multifamily'); assert.equal(p.arrangement, 'courtyard'); assert.match(p.btNotes[0], /read as apartments/);
  p = g('a 6-story hotel with 120 keys'); assert.equal(p.btype, 'hotel-limited'); assert.equal(p.floors, 6); assert.equal(p.gfa, 120 * 550);
  p = g('extended-stay hotel, 110 keys'); assert.equal(p.btype, 'hotel-extended'); assert.equal(p.gfa, 110 * 650); assert.equal(p.btFloors, 4); assert.equal(p.floors, undefined, 'a preset’s usual floors are not the words’ floors');
  p = g('3-story self storage 90,000 sf'); assert.equal(p.btype, 'storage-multi'); assert.deepEqual(p.storage, { climateSf: 90000, driveSf: 0 }); assert.equal(p.floors, 3);
  p = g('single-story drive-up self storage, 60,000 sf'); assert.equal(p.btype, 'storage-single'); assert.equal(p.storage.climateSf, 0); assert.equal(p.storage.driveSf, 60000);
  p = g('flex buildings 120 ft deep with mezzanine'); assert.equal(p.btype, 'flex-mezz'); assert.equal(p.depthFix, 120); assert.equal(p.mezzanine, 0.25); assert.equal(p.use, 'industrial');
  p = g('flex buildings 100 ft deep with a 40% mezzanine, 50,000 sf'); assert.equal(p.depthFix, 100); assert.equal(p.mezzanine, 0.4); assert.equal(p.gfa, 50000);
  p = g('a custom type: 2-story clinic 12,000 sf, 5 per 1,000 parking'); assert.equal(p.btype, 'clinic'); assert.equal(p.use, 'medical'); assert.equal(p.gfa, 12000); assert.equal(p.floors, 2); assert.deepEqual([p.btRule.key, p.btRule.v], ['parkingPer1000', 5]);
  p = g('assisted living, 120 beds'); assert.equal(p.btype, 'senior-al'); assert.equal(p.units, 120); assert.equal(p.perUnit, 0.5); assert.deepEqual([p.btRule.key, p.btRule.v], ['parkingPerUnit', 0.5]);
  p = g('student housing, 600 beds'); assert.equal(p.btype, 'student'); assert.equal(p.units, 200); assert.equal(p.perUnit, 1.8); assert.equal(p.compare, undefined);
  p = g('student housing, 400 beds, 4 bed units'); assert.equal(p.units, 100); assert.equal(p.perUnit, 2.4);
  p = g('fourplexes, 48 units'); assert.equal(p.btype, 'plex'); assert.equal(p.use, 'duplex'); assert.equal(p.units, 48);
  p = g('live-work townhomes, 24 units'); assert.equal(p.btype, 'live-work'); assert.equal(p.use, 'townhomes');
  p = g('cold storage facility, 200,000 sf'); assert.equal(p.btype, 'cold-storage'); assert.equal(p.use, 'industrial'); assert.equal(p.storage, undefined, 'cold storage is a warehouse, not self storage'); assert.equal(p.btFloorH, 45);
  p = g('data center 100,000 sf'); assert.equal(p.btype, 'data-center'); assert.equal(p.use, 'industrial'); assert.equal(p.truck, false);
  p = g('fitness center 40,000 sf'); assert.equal(p.btype, 'fitness'); assert.equal(p.ratio, 5);
  p = g('a big box store'); assert.equal(p.btype, 'big-box'); assert.equal(p.gfa, 120000);
  p = g('bank with drive-thru'); assert.equal(p.btype, 'bank'); assert.equal(p.use, 'restaurant'); assert.ok(p.extras.includes('drivethru')); assert.equal(p.ratio, 4);
  p = g('a daycare for 150 children'); assert.equal(p.btype, 'daycare'); assert.equal(p.custom.name, 'Daycare'); assert.equal(p.btCounts.children, 150); assert.ok(p.custom.outdoor.some(o => o.key === 'play'));
  p = g('high school for 1,200 students'); assert.equal(p.btype, 'school'); assert.equal(p.custom.name, 'High school'); assert.equal(p.btCounts.students, 1200); assert.equal(p.floors, 2);
  p = g('express car wash'); assert.equal(p.btype, 'car-wash'); assert.equal(p.gfa, 130 * 32, 'the tunnel’s floor area is what is asked'); assert.deepEqual([p.custom.buildings[0].w, p.custom.buildings[0].d], [186, 64], 'drawn in an envelope that holds its lanes'); assert.ok(p.btEnvelope.carve && p.btSite.kind === 'carwash');
  assert.equal(g('gas station with a car wash').btype, undefined, 'a gas station’s wash stays the gas station’s');
  p = g('parking garage, 600 spaces'); assert.equal(p.btype, 'garage-standalone'); assert.equal(p.btCounts.asked, 600); assert.ok(p.btCounts.spaces >= 600 && p.btCounts.levels <= 6); assert.equal(p.ratio, 0); assert.equal(p.garage, undefined);
  p = g('a 2-story trampoline park 30,000 sf'); assert.equal(p.btype, 'custom'); assert.equal(p.use, 'other'); assert.equal(p.btName, 'Trampoline Park'); assert.match(p.btNotes[0], /No building type matches "trampoline park".*bar primitive.*30,000 sf, 2 floors/);
  assert.equal(g('a 10,000 sf building').btype, undefined, 'a plain building is no type');
  for (const a of ['a 60,000 sf shopping center with a bank pad', 'strip center with a gym, 30,000 sf', '200 apartments with a daycare', 'retail strip with a car wash pad, 20,000 sf']) assert.equal(g(a).btype, undefined, 'the main use stays: ' + a);
  // several uses: no type for the whole program (each zone its own: section 6)
  assert.equal(g('a hotel with 120 keys and 20,000 sf of retail').btype, undefined);
}

// ---------- 5. runs: named, counted, coloured; the brief's parking rule; replay ----------
{
  const site = (w, h) => ({ origin: [-96.42, 30.38], ring: [[0, 0], [w, 0], [w, h], [0, h]], front: 0, streets: [], setbacks: { front: 25, side: 10, rear: 20, paving: 10 }, elements: [] });
  const run = (ask, w, h) => { const b = B.briefFromRequest(ask, site(w, h)), rec = RUN.runBrief(b); return { b, rec, o: rec.options[0] }; };
  let { b, rec, o } = run('bank with drive-thru', 220, 230);
  assert.equal(b.rules.values.parkingPer1000.v, 4); assert.match(b.rules.values.parkingPer1000.source, /Bank branch/);
  assert.equal(o.validation.status, 'pass'); const bk = o.elements.find(e => e.kind === 'building');
  assert.equal(bk.btype, 'bank'); assert.equal(bk.tc, 'bank'); assert.equal(bk.floorH, 16); assert.match(bk.name, /^Bank/); assert.match(bk.note, /3,500 sf/);
  assert.ok(o.notes.some(n => /^Building type: Bank branch with drive-thru, the Drive-thru pad primitive/.test(n)));
  assert.ok(RUN.replayRun(rec).identical, 'replay identical');
  // the map: the block in the type's colour at its floor height
  const fc = S.planFeatures({ ...site(220, 230), elements: o.elements, program: o.program }), f = fc.features.find(x => x.properties.id === bk.id && x.properties.k === 'building');
  assert.equal(f.properties.use, 'bank'); assert.equal(f.properties.h, +(16 / 3.280839895).toFixed(1));
  assert.ok(fc.features.some(x => x.properties.k === 'b3' && x.properties.use === 'bank' && x.properties.part === 'parapet'), 'parapet in the type’s colour key');
  ({ o } = run('a 6-story hotel with 120 keys', 420, 300));
  assert.equal(o.validation.status, 'pass'); assert.match(o.elements.find(e => e.btype === 'hotel-limited').note, /6-story · 120 keys/);
  ({ b, o } = run('assisted living, 120 beds', 600, 420));
  assert.equal(b.program.uses[0].form, 'multifamily', 'counted from floor area, not the garden stack'); assert.equal(o.validation.status, 'pass');
  assert.equal(o.quantities.totals.units, 120); assert.equal(o.quantities.parking.required, 60);
  assert.ok(o.notes.some(n => /120 beds in 120 units/.test(n)));
  // existing request, untouched: no type fields on its buildings
  ({ o } = run('exactly 28,000 sf retail in four buildings', 900, 500));
  assert.ok(!o.elements.some(e => e.btype || e.tc), 'an existing type’s buildings carry nothing new');
}

// ---------- 6. round 2: footprints of their own, site features and queues, a type per zone, the editor's presets ----------
{
  const site = (w, h) => ({ origin: [-96.42, 30.38], ring: [[0, 0], [w, 0], [w, h], [0, h]], front: 0, streets: [], setbacks: { front: 25, side: 10, rear: 20, paving: 10 }, elements: [] });
  const run = (ask, w, h) => { const b = B.briefFromRequest(ask, site(w, h)), rec = RUN.runBrief(b); return { b, rec, o: rec.options[0] }; };
  const chk = (o, id) => o.validation.checks.find(c => c.id === id);
  // a T drawn as a T: a bar along the back with its wing off the middle (8 corners), not an L
  const T = S.outline({ kind: 'building', x: 0, y: 0, w: 240, d: 130, form: 'T', wing: 60 });
  assert.equal(T.length, 8); assert.equal(S.footArea({ kind: 'building', x: 0, y: 0, w: 240, d: 130, form: 'T', wing: 60 }), 240 * 60 + 60 * 70);
  let p = S.guessProgram('T-shaped 4-story apartments, 150 units'); assert.equal(p.btype, 'mf-t'); assert.equal(p.form, 'T'); assert.equal(S.normalizeProgram(p).form, 'T');
  let { o, rec, b } = run('T-shaped 4-story apartments, 150 units', 900, 500);
  assert.equal(o.validation.status, 'pass'); assert.ok(o.elements.filter(e => e.kind === 'building' && e.use === 'multifamily').every(e => e.form === 'T'), 'every apartment building a T');
  // a point tower: a slim tower on its podium (the tower's plate under half the podium's footprint)
  p = S.guessProgram('a 14-story point tower with 200 apartments'); assert.equal(p.btype, 'point-tower'); assert.equal(p.point, true); assert.equal(p.form, 'tower');
  const pt = { kind: 'building', x: 0, y: 0, w: 240, d: 128, floors: 14, form: 'tower', podium: 2, parkLevels: 'auto' };
  assert.ok(S.ringArea(S.towerOutline({ ...pt, point: true })) < 0.6 * S.ringArea(S.towerOutline(pt)), 'slimmer than the podium tower');
  ({ o } = run('a 14-story point tower with 200 apartments', 600, 450));
  assert.equal(o.validation.status, 'pass'); assert.ok(o.elements.some(e => e.point && e.btype === 'point-tower'));
  // a fourplex and a triplex of their own, not duplexes
  assert.equal(S.guessProgram('fourplexes, 48 units').plex, 4); assert.equal(S.guessProgram('triplexes, as many as fit').plex, 3);
  ({ o } = run('fourplexes, 48 units', 700, 520));
  const fx = o.elements.filter(e => e.kind === 'building' && e.use === 'duplex');
  assert.equal(o.validation.status, 'pass'); assert.ok(fx.length === 12 && fx.every(e => e.units === 4 && e.w === S.PLEX[4].w && e.d === S.PLEX[4].d && /^Fourplex/.test(e.name)), '12 fourplexes of 4');
  // a full-service hotel and a hotel over shops
  p = S.guessProgram('a full-service hotel with 250 keys'); assert.equal(p.btype, 'hotel-full'); assert.equal(p.gfa, 250 * 1000);
  p = S.guessProgram('a 120-key hotel over retail'); assert.equal(p.btype, 'hotel-over-retail'); assert.equal(p.gfa, 66000, 'the hotel’s floor area is what is asked'); assert.equal(p.floors, 5); assert.ok(p.btEnvelope.f > 1 && !p.btEnvelope.carve);
  ({ b, o } = run('a 120-key hotel over retail', 600, 400));
  const h = o.elements.find(e => e.btype === 'hotel-over-retail');
  assert.equal(o.validation.status, 'pass'); assert.equal(h.ground.use, 'retail'); assert.equal(o.elements.filter(e => e.btype === 'hotel-over-retail').reduce((t, e) => t + e.keys, 0), 120);
  assert.ok(o.quantities.byUse.retail.gfa > 0 && Math.abs(o.quantities.byUse.hotel.gfa - 66000) <= 660, 'shops on the ground floor, the hotel’s own floor area above');
  // a stand-alone garage: the parking structure itself, its spaces on the stall grid, the program's floor area its levels
  ({ o } = run('parking garage, 400 spaces', 500, 330));
  const gar = o.elements.find(e => e.kind === 'garage' && e.standalone);
  assert.equal(o.validation.status, 'pass'); assert.ok(gar && gar.grid && S.garageStalls(gar) >= 400); assert.equal(o.quantities.parking.garage, S.garageStalls(gar));
  // a cluster of pads
  ({ o } = run('a pad-site village with 6 pads', 600, 400));
  assert.equal(o.validation.status, 'pass'); assert.equal(o.elements.filter(e => e.btype === 'pad-village' && e.tc === 'pads').length, 6);
  // an express car wash: its tunnel, two stacking lanes from a drive, an exit; the queue clear of the drives and 12+ cars
  ({ o, rec } = run('express car wash', 330, 300));
  const lanes = o.elements.filter(e => e.queue === 'carwash'), tun = o.elements.find(e => e.btype === 'car-wash');
  assert.equal(o.validation.status, 'pass'); assert.equal(lanes.length, 2); assert.equal(tun.w * tun.d, 130 * 32);
  assert.equal(chk(o, 'queues.clear').status, 'pass'); assert.equal(chk(o, 'queues.stack').status, 'pass'); assert.ok(chk(o, 'queues.stack').measured >= 12);
  assert.ok(o.elements.some(e => e.note === 'Car wash exit')); assert.ok(RUN.replayRun(rec).identical);
  // the independent check catches a queue across a parking row (a row laid over the outer lane's middle)
  const q1 = lanes.find(e => e.name === 'Stacking lane 1'), mp = q1.path[Math.floor(q1.path.length / 2)];
  const V = await import('../lib/layoutcheck.mjs'), bad = V.validateLayout({ ...site(330, 300), elements: [...o.elements, { id: 'xrow', kind: 'parking', x: mp[0], y: mp[1], w: 60, d: 60, rot: 0 }], program: o.program }, b.brief || B.briefFromRequest('express car wash', site(330, 300)));
  assert.equal(bad.checks.find(c => c.id === 'queues.clear').status, 'fail', 'a parking row across the queue is caught');
  // a restaurant's drive-thru (no type): its stacking checked against the engine's 8 cars
  ({ o } = run('2,500 sf restaurant with a drive-thru', 210, 230));
  assert.equal(chk(o, 'queues.clear').status, 'pass'); assert.equal(chk(o, 'queues.stack').status, 'pass'); assert.equal(chk(o, 'queues.stack').required, 8);
  // a data centre: a fenced equipment yard at the back, the building the floor area asked
  ({ o } = run('data center 100,000 sf', 800, 600));
  const dc = o.elements.find(e => e.btype === 'data-center'), yard = o.elements.find(e => e.yard === 'equipment');
  assert.equal(o.validation.status, 'pass'); assert.ok(yard && o.elements.some(e => e.kind === 'fence' && e.note === 'Equipment yard fence')); assert.ok(Math.abs(dc.w * dc.d - 100000) <= 1000); assert.ok(yard.y > dc.y, 'the yard on the side away from the street');
  // a type per zone
  p = S.guessProgram('a hotel with 120 keys and 20,000 sf of retail');
  assert.deepEqual(p.btZones, [{ zone: 1, btype: 'hotel-limited', name: 'Hotel' }]); assert.equal(p.zones[1].gfa, 66000);
  ({ o } = run('a hotel with 120 keys and 20,000 sf of retail', 700, 520));
  assert.equal(o.validation.status, 'pass'); assert.equal(o.elements.filter(e => e.btype === 'hotel-limited').reduce((t, e) => t + e.keys, 0), 120); assert.ok(o.elements.some(e => e.kind === 'building' && e.use === 'retail' && !e.btype));
  p = S.guessProgram('a daycare and a bank on pads in front of townhomes');
  assert.deepEqual(p.zones.map(z => z.use), ['other', 'restaurant', 'townhomes']); assert.deepEqual(p.btZones.map(z => z.btype), ['daycare', 'bank']); assert.equal(p.zones[0].place.where, 'front');
  ({ o } = run('a daycare and a bank on pads in front of townhomes', 700, 520));
  assert.equal(o.validation.status, 'pass'); assert.ok(o.elements.some(e => e.btype === 'daycare' && e.tc === 'civic' && e.children === 150)); assert.ok(o.elements.some(e => e.btype === 'bank' && e.tc === 'bank'));
  assert.ok(o.notes.some(n => /^Building type: Daycare/.test(n)) && o.notes.some(n => /^Building type: Bank/.test(n)));
  for (const a of ['20,000 sf retail along the main road, 240 apartments behind and 80 townhomes', '200 apartments with a daycare', 'a 60,000 sf shopping center with a bank pad']) assert.ok(!S.guessProgram(a).btZones, 'no zone types: ' + a);
  // the editor's presets: a block of the type at its usual size, coloured by type on the 3D map
  const cat = BT.presetCatalog(); assert.ok(cat.length >= 50 && cat.every(c => BT.presetBuilding(c.id)?.kind === 'building'));
  const hb = BT.presetBuilding('hotel-limited'); assert.deepEqual([hb.use, hb.keys, hb.floors], ['hotel', 120, 4]);
  const dcb = BT.presetBuilding('daycare'), fc = S.planFeatures({ ...site(400, 300), elements: [{ ...dcb, id: 'd1', x: 200, y: 150 }] });
  assert.ok(fc.features.some(f => f.properties.k === 'b3' && f.properties.use === 'civic' && f.properties.part === 'parapet'));
}

// ---------- 7. round 3: the lanes and yards a type needs (lib/btlanes.mjs, lib/btsite.mjs typeFeatures) ----------
{
  const SITE = await import('../lib/btsite.mjs'), V = await import('../lib/layoutcheck.mjs');
  const site = (w, h) => ({ origin: [-96.42, 30.38], ring: [[0, 0], [w, 0], [w, h], [0, h]], front: 0, streets: [], setbacks: { front: 25, side: 10, rear: 20, paving: 10 }, elements: [] });
  const run = (ask, w, h) => { const b = B.briefFromRequest(ask, site(w, h)), rec = RUN.runBrief(b); return { b, rec, o: rec.options[0] }; };
  const chk = (o, id) => o.validation.checks.find(c => c.id === id);
  const inPoly = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], q = r[j]; if ((a[1] > p[1]) !== (q[1] > p[1]) && p[0] < (q[0] - a[0]) * (p[1] - a[1]) / (q[1] - a[1]) + a[0]) c = !c; } return c; };
  const along = P => { const out = []; for (let i = 0; i + 1 < P.length; i++) { const a = P[i], q = P[i + 1], L = Math.hypot(q[0] - a[0], q[1] - a[1]); for (let s = 0; s < L; s += 2) out.push([a[0] + (q[0] - a[0]) * s / L, a[1] + (q[1] - a[1]) * s / L]); } return out; };
  // the queue estimates (sources in QUEUE_TYPES): 10% of an elementary school's students in cars, a bus a 60 riders, a car a 25 children
  assert.equal(SITE.queueWant('school-car', { students: 600, level: 'elementary' }), 60); assert.equal(SITE.queueWant('school-bus', { students: 600 }), 5); assert.equal(SITE.queueWant('daycare', { children: 150 }), 6);
  for (const k of Object.keys(SITE.QUEUE_TYPES)) assert.match(SITE.QUEUE_TYPES[k].src, /estimate/, k + ': marked an estimate');
  assert.equal(S.guessProgram('elementary school for 600 students').btCounts.level, 'elementary');
  // a school: a parent queue and a bus loop, each from a drive (or the street) to its curb beside the school and back out,
  // apart from each other, over open ground only (never a building, parking, a pond or the play yard), the play yard and
  // field on dry ground; the 3D map keeps the plain block (the lanes are flat paving)
  let { o, rec } = run('elementary school for 600 students', 900, 700);
  const car = o.elements.find(e => e.queue === 'school-car'), bus = o.elements.find(e => e.queue === 'school-bus'), sch = o.elements.find(e => e.btype === 'school');
  assert.equal(o.validation.status, 'pass'); assert.ok(car && bus, 'both lanes drawn');
  assert.equal(chk(o, 'queues.stack').status, 'pass'); assert.ok(chk(o, 'queues.stack').measured['school-car'] >= 60 && chk(o, 'queues.stack').measured['school-bus'] >= 5);
  assert.equal(chk(o, 'queues.clear').status, 'pass'); assert.equal(chk(o, 'queues.apart').status, 'pass'); assert.notEqual(chk(o, 'site.grounds-dry')?.status, 'fail'); assert.equal(chk(o, 'eng.turning.car').status === 'fail', false);
  const solid = o.elements.filter(e => ['building', 'parking', 'pond', 'play'].includes(e.kind) || e.kind === 'green' && e.part).map(e => S.shapeOf(e));
  for (const L of [car, bus]) { const pts = along(L.path).slice(8, -8); assert.ok(!pts.some(p => solid.some(r => inPoly(p, r))), L.name + ': over open ground only'); assert.ok(pts.every(p => inPoly(p, site(900, 700).ring) || p[1] < 1), L.name + ': inside the lot'); }
  assert.ok(o.notes.some(n => /^School: a parent drop-off/.test(n)) && o.notes.some(n => /^School: a bus loop/.test(n)));
  assert.ok(RUN.replayRun(rec).identical, 'replay identical');
  const fc = S.planFeatures({ ...site(900, 700), elements: o.elements, program: o.program });
  assert.ok(fc.features.some(f => f.properties.id === sch.id && f.properties.k === 'building' && f.properties.use === 'civic'), 'the school a plain block coloured by type');
  assert.ok(!fc.features.some(f => f.properties.id === car.id && /^b3|^c3/.test(f.properties.k)), 'the lane is no block');
  // the independent check: a parking row laid across the parent queue, and the bus loop taken away
  const mp = car.path[Math.floor(car.path.length / 2)], b0 = B.briefFromRequest('elementary school for 600 students', site(900, 700));
  let bad = V.validateLayout({ ...site(900, 700), elements: [...o.elements, { id: 'xrow', kind: 'parking', x: mp[0], y: mp[1], w: 40, d: 40, rot: 0 }], program: o.program }, b0);
  assert.equal(bad.checks.find(c => c.id === 'queues.clear').status, 'fail', 'a parking row across the queue is caught');
  bad = V.validateLayout({ ...site(900, 700), elements: o.elements.filter(e => e !== bus), program: o.program }, b0);
  assert.equal(bad.checks.find(c => c.id === 'queues.stack').status, 'fail'); assert.ok(bad.checks.find(c => c.id === 'queues.stack').features.includes('school-bus: not drawn'));
  // a daycare: its play yard fenced beside the building and a drop-off lane along a face, from the drive and back
  ({ o } = run('a daycare for 150 children', 500, 400));
  assert.equal(o.validation.status, 'pass'); assert.ok(o.elements.some(e => e.kind === 'fence' && /Play yard fence/.test(e.note)));
  const dl = o.elements.find(e => e.queue === 'daycare'); assert.ok(dl, 'drop-off lane'); assert.equal(chk(o, 'queues.stack').status, 'pass'); assert.equal(chk(o, 'queues.clear').status, 'pass');
  // a hotel: a porte-cochère (a 24 ft drive-through lane under a canopy at the entrance)
  ({ o, rec } = run('a 6-story hotel with 120 keys', 600, 450));
  assert.equal(o.validation.status, 'pass'); const pc = o.elements.find(e => e.queue === 'porte'), cn = o.elements.find(e => e.porte);
  assert.ok(pc && pc.width === 24 && cn && cn.kind === 'plaza', 'lane and canopy'); assert.equal(chk(o, 'queues.stack').status, 'pass'); assert.ok(RUN.replayRun(rec).identical);
  // a tight lot: the run lays out the parking again with room for it (docs/LAYOUT-ENGINE.md item 37), nothing broken
  ({ o } = run('a 6-story hotel with 120 keys', 420, 300));
  assert.equal(o.validation.status, 'pass'); assert.ok(o.elements.some(e => e.queue === 'porte') && o.quantities.totals.gfa === 66000 && o.quantities.parking.provided >= o.quantities.parking.required);
  // too tight even for that: no room, said, nothing broken
  ({ o } = run('a 6-story hotel with 120 keys', 300, 260));
  assert.ok(o.elements.some(e => e.queue === 'porte') || o.notes.some(n => /no room .* porte-cochère/.test(n)));
  // a hotel over the shops asked (not the whole ground floor)
  ({ o } = run('a 120-key hotel over 8,000 sf of retail', 600, 400));
  const hr = o.elements.filter(e => e.btype === 'hotel-over-retail');
  assert.equal(o.validation.status, 'pass'); assert.ok(Math.abs(hr.reduce((t, e) => t + S.groundOf(e).gfa, 0) - 8000) <= 10, 'the shops the sf asked'); assert.equal(hr.reduce((t, e) => t + e.keys, 0), 120);
  assert.ok(Math.abs(o.quantities.byUse.retail.gfa - 8000) <= 10); assert.ok(o.notes.some(n => /8,000 sf of shops on the ground floor \(as asked/.test(n)));
  // a gas station: a lane each side of each island row, the waiting cars past the canopy's ends
  ({ o } = run('gas station with 12 pumps', 330, 300));
  const fq = o.elements.filter(e => e.queue === 'fuel'), cano = o.elements.find(e => e.kind === 'canopy');
  assert.equal(o.validation.status, 'pass'); assert.equal(fq.length, cano.rows * 2); assert.equal(chk(o, 'queues.stack').status, 'pass'); assert.equal(chk(o, 'queues.clear').status, 'pass');
  // zones: a bank zone gets its drive-thru lane, a daycare zone its fenced play yard; each zone carries its type's parking rule
  const pz = S.guessProgram('a daycare and a bank on pads in front of townhomes');
  assert.deepEqual([pz.btZones[1].rule.key, pz.btZones[1].rule.v], ['parkingPer1000', 4], 'a bank zone parks like a bank (the parking helper reads btZones[].rule)');
  ({ o } = run('a daycare and a bank on pads in front of townhomes', 700, 520));
  assert.equal(o.validation.status, 'pass'); assert.ok(o.elements.some(e => e.queue === 'bank')); assert.ok(o.elements.some(e => e.kind === 'play' && e.zone === 0)); assert.equal(chk(o, 'queues.stack').status, 'pass');
  // existing requests: no lane, no new element
  for (const a of ['2,500 sf restaurant with a drive-thru', 'exactly 28,000 sf retail in four buildings']) { ({ o } = run(a, a.startsWith('2,5') ? 210 : 900, a.startsWith('2,5') ? 230 : 500)); assert.ok(!o.elements.some(e => SITE.QUEUE_TYPES[e.queue] && e.queue !== 'bank'), 'nothing new: ' + a); }
}

// ---------- 8. a zone parks at its own type's rule (btZones[].rule into rules.parkingByUse), with and without a city's rules ----------
{
  const site = (w, h) => ({ origin: [-96.42, 30.38], ring: [[0, 0], [w, 0], [w, h], [0, h]], front: 0, streets: [], setbacks: { front: 25, side: 10, rear: 20, paving: 10 }, elements: [] });
  const ask = 'a daycare and a bank on pads in front of townhomes', b = B.briefFromRequest(ask, site(700, 520)), BU = b.rules.values.parkingByUse?.v;
  assert.deepEqual(BU?.restaurant, { per1000: 4, type: 'bank' }, 'the bank zone (laid out as a restaurant pad) at the bank’s 4 a 1,000 sf, not 10');
  assert.equal(BU?.other?.type, 'daycare'); assert.ok(Math.abs(BU.other.per1000 - 0.2 * 150 / 7.442) < 0.01, 'the daycare zone at 0.2 a child');
  assert.equal(BU?.townhomes, undefined, 'a use of no type keeps its own rule');
  const E = B.toEngine(b); assert.ok(E.opts.parkF.restaurant < 1, 'the engine lays the bank zone out at its type’s rule (below the restaurant default)');
  const o = RUN.runBrief(b).options[0], need = Math.ceil(7442 / 1000 * BU.other.per1000 + 3.5 * 4 + 60 * 2.25 - 0.01);
  assert.equal(o.validation.status, 'pass'); assert.equal(o.quantities.parking.required, need, 'the check counts the zones at their types’ rules'); assert.ok(o.quantities.parking.provided >= need);
  assert.equal(B.typeZoneRules(S.guessProgram('a hotel with 120 keys and 20,000 sf of retail')), null, 'no rule a hotel zone or a plain use takes');
  // under a city's rules: the governing per-use rule keeps the zone's type, with the city's count reserve
  const gb = B.briefFromRequest(ask, site(700, 520)), prog = S.guessProgram(ask);
  RUN.governingParking(gb, { ...site(700, 520), program: prog, __guard: { cf: 1.05, profile: 'waller' } }, prog);
  assert.deepEqual(gb.rules.values.parkingByUse.v.restaurant, { per1000: 4.2, type: 'bank' }); assert.equal(gb.rules.values.parkingByUse.v.other.type, 'daycare');
}
console.log('btypes ok');
