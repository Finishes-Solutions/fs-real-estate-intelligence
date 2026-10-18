// Self storage: the words, the program, the layout (climate-controlled building at the street, drive-up rows on aisles,
// fence and gate, RV / boat stalls), the numbers, the pro forma and the read-out, on realistic lots: a 5.3 acre lot a
// little out of square, the 8-sided 19730 FM 362 parcel with its notch, a narrow deep lot, a 1 acre lot and a wedge.
import assert from 'node:assert/strict';
import * as S from '../lib/siteplan.mjs';
import * as L from '../lib/sitelayout.mjs';
import * as PF from '../lib/proforma.mjs';
import { readAs, notUnderstood } from '../lib/planruns.mjs';
import { headline } from '../lib/planpick.mjs';
import { keyItems } from '../lib/planmap.mjs';
import { BUILDING_TYPES, fromType } from '../lib/buildings.mjs';

// ---------- the words ----------
{ const g = S.guessProgram('Self storage: a 3-story climate controlled building, about 90,000 sf, plus drive-up units and some RV and boat parking');
  assert.equal(g.use, 'storage', 'self storage is its own use, not a warehouse'); assert.equal(g.floors, 3);
  assert.equal(g.storage.climateSf, 90000, 'the size goes with the climate-controlled building named just before it'); assert.equal(g.storage.driveSf, undefined, 'drive-up with no size: as much as fits');
  assert.equal(g.storage.rv, 24, 'RV and boat parking with no count: a typical 24'); assert.equal(g.units, undefined, '"drive-up units" is not a dwelling count'); }
{ const g = S.guessProgram('self storage 60,000 sf climate controlled and 35,000 sf drive-up, 30 RV spaces');
  assert.deepEqual([g.storage.climateSf, g.storage.driveSf, g.storage.rv], [60000, 35000, 30]);
  assert.equal(S.normalizeProgram(g).gfa, 95000, 'both parts sized: the total is theirs'); }
assert.equal(S.guessProgram('drive-up only mini storage').storage.climateSf, 0, 'drive-up only: no climate-controlled building');
assert.equal(S.guessProgram('a warehouse with a storage yard').use, 'industrial', 'a storage yard is still industrial');
{ const p = S.normalizeProgram({ use: 'storage', gfa: 100000 }); assert.deepEqual([p.storage.climateSf, p.storage.driveSf], [65000, 35000], 'a total with no split: about two thirds climate-controlled'); }
{ const p = S.normalizeProgram({ use: 'storage', storage: { rowD: 5, aisle: 99, rv: -3, fence: false } }); assert.deepEqual([p.storage.rowD, p.storage.aisle, p.storage.rv, p.storage.fence], [20, 40, 0, false], 'settings kept in range'); }

// ---------- layouts on real shapes ----------
const lot = (ring, prog, extra = {}) => { const plan = { ring, origin: [-95.8245, 29.7855], front: 0, setbacks: { ...S.SETBACKS, paveFront: 10, paveSide: 5, paveRear: 5 }, program: prog, elements: [], ...extra }; return { plan, opts: L.layoutOptions(plan, prog, {}) }; };
const of = (plan, o) => ({ ...plan, program: o.program, elements: o.elements });
const touches = (a, b, g = 2) => S.rectsOverlap({ poly: S.grow(S.shapeOf(a), g) }, { poly: S.shapeOf(b) }, 0);
function sound(name, plan, o) {
  const pl = of(plan, o), els = pl.elements, bad = S.check(pl).filter(i => i.level === 'bad');
  assert.equal(bad.length, 0, name + ': passes the checks: ' + bad.map(i => i.text).join('; '));
  const drives = els.filter(e => e.kind === 'drive');
  for (const e of els.filter(e => e.kind === 'building' && e.storage === 'drive')) assert.ok(drives.some(d => touches(e, d)), name + ': ' + e.name + ' opens onto a drive aisle');
  for (const e of els.filter(e => e.kind === 'building' && e.use === 'storage')) assert.ok(e.storage && e.note, name + ': every storage building says what it is: ' + e.name);
  const fence = els.filter(e => e.kind === 'fence');
  for (const f of fence) for (const p of els.filter(e => e.kind === 'pond')) assert.ok(!S.rectsOverlap({ poly: S.outline(f) }, { poly: S.shapeOf(p) }, 0.5), name + ': the fence never runs through a pond');
  if (fence.length) assert.ok(fence.some(f => f.gate), name + ': a fenced yard has a gate');
  return S.metrics(pl);
}
// 5.3 acres: 90,000 sf climate-controlled, drive-up as fits, 24 RV / boat
{ const { plan, opts } = lot([[0, 0], [520, 0], [540, 430], [10, 445]], S.normalizeProgram(S.guessProgram('Self storage: a 3-story climate controlled building, about 90,000 sf, plus drive-up units and some RV and boat parking')));
  assert.ok(opts.length >= 2, 'several layouts');
  for (const [i, o] of opts.entries()) {
    const m = sound('5.3 ac #' + i, plan, o), cl = o.elements.filter(e => e.storage === 'climate');
    assert.equal(cl.length, 1, 'one climate-controlled building'); assert.ok(Math.abs(S.gfaOf(cl[0]) - 90000) < 2700 || o.notes.some(n => /climate-controlled building fits/.test(n)), 'at the size asked, or says what fits: ' + S.gfaOf(cl[0]));
    if (i === 0) assert.ok(Math.abs(S.gfaOf(cl[0]) - 90000) < 2700, 'the recommended layout has the building asked for');
    assert.ok(o.elements.filter(e => e.storage === 'drive').length >= 2, 'drive-up rows behind it');
    assert.ok(m.storage.nrsf > 70000 && m.storage.units > 600, 'rentable area and units: ' + JSON.stringify([Math.round(m.storage.nrsf), m.storage.units]));
    assert.ok(m.spaces >= m.required && m.required <= 15, 'a few spaces at the office, enough: ' + m.spaces + '/' + m.required);
    // the climate building faces the street side of the fence: its front no further back than its back
    const gates = o.elements.filter(e => e.gate); assert.ok(gates.length >= 1, 'a keypad gate'); assert.ok(gates.some(g => g.name === 'Entry gate'));
    const fr = S.outwardOf(plan.ring, 0), along = e => e.x * fr[0] + e.y * fr[1];
    for (const d of o.elements.filter(e => e.storage === 'drive')) assert.ok(along(d) <= along(cl[0]) + 1, 'drive-up rows sit behind the climate building, away from the street');
  }
  const rv = opts.map(o => o.elements.filter(e => e.rv).reduce((s, e) => s + S.stalls(e).count, 0));
  assert.ok(rv.some(n => n === 24), 'the 24 RV / boat stalls asked for: ' + rv);
  opts.forEach((o, i) => { if (rv[i] < 24) assert.ok(o.notes.some(n => /RV \/ boat spaces asked for/.test(n)), 'short of RV stalls: it says so'); });
  const o = opts[rv.indexOf(24)], pl = of(plan, o), m = S.metrics(pl);
  assert.equal(m.storage.rv, 24); assert.ok(!o.elements.filter(e => e.kind === 'parking' && !e.rv).some(e => e.sw === 12), 'RV stalls are their own rows');
  assert.equal(m.stalls, S.metrics({ ...pl, elements: pl.elements.filter(e => !e.rv) }).stalls, 'RV / boat stalls are storage, not parking');
  assert.ok(keyItems(pl).kinds.includes('rv') && keyItems(pl).kinds.includes('fence'), 'the plan key lists RV / boat parking and the fence');
  const h = headline(m, null, null); assert.match(h.sub, /sf rentable · ~\d/, 'the layout card leads with what it rents: ' + h.sub);
  // pro forma: storage rent is gross, the owner pays the costs; nothing undefined
  const r = PF.run(pl, {}), op = r.ops, ratio = 1 - op.noi / op.egi;
  assert.ok(Number.isFinite(op.noi) && op.noi > 0, 'a positive NOI'); assert.ok(ratio > 0.3 && ratio < 0.55, 'an expense ratio like storage’s: ' + ratio.toFixed(2));
  assert.equal(op.recoverable, 0, 'no expense recoveries billed to storage tenants'); assert.ok(op.lines.some(l => /self storage/.test(l.label || l.t || l.name || JSON.stringify(l))), 'the rent line names self storage');
  assert.ok(PF.scheduleFor(PF.programOf(pl)).lease >= 24, 'storage leases up over two years or more');
}
// 19730 FM 362, Waller (8 sides, a notch on the east; FM 362 on the west, edge 7): drive-up only
{ const ring = [[-441.8, -191.92], [475.3, -185.63], [474.61, -55.83], [354.06, -58.81], [353.81, 31.2], [474.04, 34.19], [472.83, 185.77], [-446.13, 190.03]];
  const { plan, opts } = lot(ring, S.normalizeProgram({ use: 'storage', storage: { climateSf: 0 } }), { front: 7 });
  assert.ok(opts.length >= 1);
  for (const [i, o] of opts.entries()) { const m = sound('FM 362 #' + i, plan, o);
    assert.ok(!o.elements.some(e => e.storage === 'climate'), 'drive-up only: no climate building'); assert.equal(o.elements.filter(e => e.storage === 'office').length, 1, 'a leasing office');
    assert.ok(m.storage.driveNrsf > 40000, 'drive-up fills the lot: ' + Math.round(m.storage.driveNrsf)); }
}
// a narrow, deep lot (180 × 900 ft) and a 1 acre lot still get storage, not a box
for (const [name, ring] of [['narrow', [[0, 0], [180, 0], [185, 900], [0, 890]]], ['1 acre', [[0, 0], [210, 0], [210, 205], [0, 205]]], ['wedge', [[0, 0], [700, 0], [60, 620]]]]) {
  const { plan, opts } = lot(ring, S.normalizeProgram({ use: 'storage', storage: {} }));
  assert.ok(opts.length >= 1, name + ': layouts');
  for (const [i, o] of opts.entries()) { const m = sound(name + ' #' + i, plan, o); assert.ok(m.storage?.nrsf > 0 && o.elements.some(e => e.storage === 'climate'), name + ': a climate building and rentable area'); }
  assert.ok(opts.some(o => o.elements.some(e => e.storage === 'drive')), name + ': drive-up rows in at least one layout');
}
// climate-controlled only: no yard, so no fence
{ const { plan, opts } = lot([[0, 0], [900, 0], [900, 260], [0, 260]], S.normalizeProgram({ use: 'storage', floors: 4, storage: { climateSf: 100000, driveSf: 0 } }));
  for (const o of opts) { sound('climate only', plan, o); assert.ok(!o.elements.some(e => e.kind === 'fence'), 'no fence round a climate building alone'); assert.ok(!o.elements.some(e => e.storage === 'drive'), 'no drive-up rows'); } }
// fence off
{ const { plan, opts } = lot([[0, 0], [520, 0], [540, 430], [10, 445]], S.normalizeProgram({ use: 'storage', storage: { fence: false } }));
  assert.ok(opts.every(o => !o.elements.some(e => e.kind === 'fence')), 'fence switched off: none drawn'); }

// ---------- read-out, library, labels ----------
{ const p = S.normalizeProgram(S.guessProgram('Self storage: a 3-story climate controlled building, about 90,000 sf, plus drive-up units and 30 RV spaces'));
  assert.deepEqual(readAs(p, S.USES).slice(0, 4), ['Self storage', '90,000 sf climate-controlled', 'Drive-up as fits', '30 RV / boat']);
  assert.deepEqual(notUnderstood('a 3-story climate controlled building, about 90,000 sf', p), [], 'the climate building’s size is understood'); }
{ const lib = BUILDING_TYPES.filter(t => t.group === 'Self storage'); assert.ok(lib.length >= 10 && lib.every(t => t.use === 'storage' && t.storage));
  const e = fromType(lib.find(t => t.storage === 'drive'), [0, 0]); assert.equal(e.storage, 'drive'); assert.equal(e.floors, 1);
  assert.ok(!BUILDING_TYPES.some(t => t.group === 'Industrial' && /storage/i.test(t.name)), 'storage no longer filed under industrial');
  const lab = S.labelOf({ ...e, id: 'x', name: 'Drive-up A' }, { use: 'storage' }); assert.match(lab.size, /^~\d+ units · /, 'a drive-up row is labelled with its units'); }
assert.equal(S.storageKind({ name: 'Drive-up C' }), 'drive', 'older plans: the kind from the name');
assert.equal(S.storageAvg(S.STORAGE_MIX.climate), 97.25); assert.equal(S.storageAvg([]), 0, 'an empty mix averages 0 (the numbers fall back)');
console.log('storage ok');
