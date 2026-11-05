// Numbers and the pro forma by a building type's own count (lib/proforma.mjs metricsOf / areaOf, lib/btypes.mjs): a
// hotel type's keys as the type counts them (an extended stay at 650 sf a key is not re-counted at 550), beds, children,
// students and an estimate of the storage units; plans without type counts read exactly as before. And the editor's
// preset picker: every listed preset makes a building the plan draws, coloured by its type on the 3D map.
import assert from 'node:assert/strict';
import * as S from '../lib/siteplan.mjs';
import * as PF from '../lib/proforma.mjs';
import * as BT from '../lib/btypes.mjs';

const ring = [[0, 0], [600, 0], [600, 450], [0, 450]];
const plan = (use, elements, extra = {}) => ({ origin: [-96.42, 30.38], ring, front: 0, streets: [], setbacks: { front: 25, side: 10, rear: 20, paving: 10 }, program: { use, ...extra }, elements });
const bld = (o, i = 0) => ({ id: 'b' + i, kind: 'building', x: 150 + i * 300, y: 200, w: 246, d: 66, floors: 4, ...o });
const strip = o => { const { keys, beds, children, students, btype, tc, floorH, ...r } = o; return r; };

// ---------- 1. a hotel: the type's keys, else the old 550 sf a key ----------
{
  const typed = plan('hotel', [bld({ use: 'hotel', btype: 'hotel-extended', keys: 100 })]), plain = plan('hotel', [strip(typed.elements[0])]);
  const Mt = PF.metricsOf(typed), Mp = PF.metricsOf(plain);
  assert.equal(Mt.uses.hotel.keys, 100, 'the extended stay’s own 100 keys');
  assert.equal(Mp.uses.hotel.keys, Math.round(246 * 66 * 4 / 550), 'no type count: gross sf at 550 a key, as before');
  assert.equal(PF.areaOf(Mt).keys, 100); assert.equal(PF.areaOf(Mp).keys, Mp.uses.hotel.keys);
  // two hotels, one typed and one not: the typed one's keys plus the other's floor area at 550
  const mix = plan('hotel', [bld({ use: 'hotel', btype: 'hotel-extended', keys: 100 }), strip(bld({ use: 'hotel' }, 1))]);
  assert.equal(PF.metricsOf(mix).uses.hotel.keys, 100 + Math.round(246 * 66 * 4 / 550));
  const R = PF.run(typed, PF.defaults(typed));
  assert.equal(R.area.keys, 100, 'the pro forma prices 100 keys');
}
// ---------- 2. beds, children, students carried by use and in total ----------
{
  const st = plan('multifamily', [bld({ use: 'multifamily', units: 60, beds: 180, btype: 'student' }), bld({ use: 'multifamily', units: 60, beds: 180, btype: 'student' }, 1)]);
  const A = PF.areaOf(PF.metricsOf(st)); assert.equal(A.uses.multifamily.beds, 360); assert.equal(A.beds, 360);
  const dc = plan('other', [bld({ use: 'other', w: 110, d: 70, floors: 1, children: 150, btype: 'daycare', tc: 'civic' })]);
  const D = PF.areaOf(PF.metricsOf(dc)); assert.equal(D.children, 150); assert.equal(D.uses.other.children, 150); assert.equal(D.students, undefined);
  const sc = plan('other', [bld({ use: 'other', w: 390, d: 195, floors: 1, students: 600, btype: 'school', tc: 'civic' })]);
  assert.equal(PF.areaOf(PF.metricsOf(sc)).students, 600);
  const R = PF.run(dc, PF.defaults(dc)); assert.equal(R.area.children, 150);
}
// ---------- 3. storage: about how many units ----------
{
  const sp = plan('storage', [bld({ use: 'storage', w: 300, d: 100, floors: 3 })]), A = PF.areaOf(PF.metricsOf(sp));
  assert.ok(A.uses.storage.nrsf > 0); assert.equal(A.uses.storage.storageUnits, Math.round(A.uses.storage.nrsf / BT.STORAGE_UNIT_SF)); assert.equal(A.storageUnits, A.uses.storage.storageUnits);
}
// ---------- 4. plans with no type counts: every number as before (no new fields on the totals) ----------
{
  for (const [use, o] of [['retail', { use: 'retail', w: 250, d: 100, floors: 1 }], ['office', { use: 'office', w: 180, d: 110, floors: 2 }], ['multifamily', { use: 'multifamily', units: 40 }]]) {
    const A = PF.areaOf(PF.metricsOf(plan(use, [bld(o)])));
    for (const k of ['beds', 'children', 'students', 'storageUnits']) assert.equal(A[k], undefined, use + ': no ' + k);
    assert.equal(A.keys, 0);
  }
}
// ---------- 5. the editor's picker: each preset a building the plan draws, coloured by type ----------
{
  const cat = BT.presetCatalog(); assert.ok(cat.length >= 40, 'the picker lists the presets: ' + cat.length);
  for (const c of cat) {
    const e = BT.presetBuilding(c.id); assert.ok(e && e.kind === 'building' && S.USES[e.use] && e.w > 0 && e.d > 0 && e.floors >= 1, c.id + ': a building');
    const fc = S.planFeatures({ ...plan(e.use, [{ id: 'x', x: 300, y: 225, rot: 0, ...e }]) }), f = fc.features.find(x => x.properties.id === 'x' && x.properties.k === 'building');
    assert.ok(f, c.id + ': drawn'); assert.equal(f.properties.use, BT.colorKey(e), c.id + ': coloured by its type');
    if (e.floorH) assert.equal(f.properties.h, +((e.floors * e.floorH) / 3.280839895).toFixed(1), c.id + ': at the type’s floor height');
  }
  const h = BT.presetBuilding('hotel-limited'), M = PF.metricsOf(plan('hotel', [{ id: 'h', x: 300, y: 225, rot: 0, ...h }]));
  assert.equal(M.uses.hotel.keys, 120, 'a hotel added from the picker counts its 120 keys');
}
console.log('btnumbers ok');
