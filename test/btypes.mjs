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
  p = g('express car wash'); assert.equal(p.btype, 'car-wash'); assert.equal(p.custom.buildings[0].w, 130);
  assert.equal(g('gas station with a car wash').btype, undefined, 'a gas station’s wash stays the gas station’s');
  p = g('parking garage, 600 spaces'); assert.equal(p.btype, undefined); assert.match(p.btNotes[0], /not drawn yet/);
  p = g('a 2-story trampoline park 30,000 sf'); assert.equal(p.btype, 'custom'); assert.equal(p.use, 'other'); assert.equal(p.btName, 'Trampoline Park'); assert.match(p.btNotes[0], /No building type matches "trampoline park".*bar primitive.*30,000 sf, 2 floors/);
  assert.equal(g('a 10,000 sf building').btype, undefined, 'a plain building is no type');
  for (const a of ['a 60,000 sf shopping center with a bank pad', 'strip center with a gym, 30,000 sf', '200 apartments with a daycare', 'retail strip with a car wash pad, 20,000 sf']) assert.equal(g(a).btype, undefined, 'the main use stays: ' + a);
  // several uses: the zones keep the engine's types
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
console.log('btypes ok');
