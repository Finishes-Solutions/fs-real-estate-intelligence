// Quick layouts (lib/quicklayouts.mjs): every request of every type, on sites from 1 to 60 acres, is read by the words
// parser (no AI) as the use it is meant to be, and asks for as much as fits (no fixed size that leaves land over); the type buttons are offered only where something fits; the set is
// fixed for a site (the same requests every time); and a type's set laid out on a sample site gives real, different layouts.
import assert from 'node:assert/strict';
import * as Q from '../lib/quicklayouts.mjs';
import * as S from '../lib/siteplan.mjs';
import * as RUN from '../lib/planruns.mjs';
import { runPlan } from '../lib/layoutrun.mjs';
import { LOTS } from '../scripts/layout-review.mjs';
import * as PARC from '../lib/siteparcels.mjs';
import polyclip from '../lib/vendor/polyclip.mjs';

const USE = { multifamily: ['multifamily'], townhomes: ['townhomes', 'duplex', 'sfr'], sfr: ['sfr'], retail: ['retail', 'restaurant', 'fuel'], office: ['office', 'medical'], hotel: ['retail', 'restaurant'], industrial: ['industrial'], storage: ['storage'] };
const usesOf = p => (p.zones?.length > 1 ? p.zones.map(z => z.use) : [p.use]).filter(u => u !== 'amenity'); // (a commons rides along with homes)
for (const acres of [1, 2.5, 5.5, 11, 20, 40, 60]) for (const fr of [150, 400, 900]) {
  const types = Q.quickTypes(acres, fr);
  assert.equal(types.length, 9);
  for (const t of types) {
    const set = Q.quickSet(t.id, acres, fr), all = Q.quickSet(t.id, acres, fr, { all: true });
    assert.equal(t.count, set.length); assert.ok(set.length <= Q.QUICK_MAX); assert.deepEqual(all.slice(0, set.length), set, 'the first five, then spares');
    if (!t.count) assert.match(t.why, /acres/, 'a greyed type says why');
    assert.equal(new Set(all.map(q => q.ask + JSON.stringify(q.hotel || ''))).size, all.length, 'no request twice: ' + t.id);
    assert.deepEqual(Q.quickSet(t.id, acres, fr, { all: true }), all, 'the same requests every time');
    for (const q of all) {
      const p = S.normalizeProgram(S.guessProgram(q.ask)), u = usesOf(p);
      if (t.id === 'mixed') assert.ok(u.length >= 2, q.ask + ' reads as mixed use: ' + u);
      else assert.ok(u.every(x => USE[t.id].includes(x)), q.ask + ' reads as ' + u + ' (' + t.id + ')');
      // the site is filled: every request asks for as much as fits, but for those whose program fills by itself (homes on
      // lots, self storage, flex, a gas station on a small corner)
      if (!/single[- ]family|self storage|flex buildings 120|gas station with 8 pumps/i.test(q.ask)) assert.match(q.ask, /as (?:many as fit|big as fits)/, q.ask + ': fills the site');
      assert.ok(!p.units && !(p.gfa && !/gas station/i.test(q.ask)), q.ask + ': no fixed size (' + (p.units || p.gfa) + ')');
    }
  }
}
assert.equal(Q.quickTypes(1.1, 210).find(t => t.id === 'multifamily').count, 0, 'no apartments on a pad site');
assert.ok(Q.quickTypes(1.1, 210).find(t => t.id === 'retail').count >= 2, 'a pad site still gets retail');
assert.equal(Q.quickArr('Mid-rise, 4 stories', 'Rows facing the street'), 'Mid-rise, 4 stories · Rows facing the street');

// a set laid out (as the page does, one run a request) on a 5.5-acre lot: every request draws something, the best of
// each run passes its checks, and the layouts differ
{
  const plan = LOTS.rect5.plan(), acres = S.ringArea(plan.ring) / 43560, fr = S.edgeLen(plan.ring, plan.front ?? S.longestEdge(plan.ring)), sigs = new Set();
  for (const q of Q.quickSet('multifamily', acres, fr)) {
    const prog = S.guessProgram(q.ask), r = runPlan({ ...plan, params: RUN.fillParams(plan.params, { ask: q.ask }) }, prog, { count: 3 }, { ask: q.ask });
    const o = r.options.find(x => x.check.status === 'pass') || r.options[0]; assert.ok(o?.elements.length, q.ask + ': a layout');
    assert.equal(o.check.status, 'pass', q.ask + ': passes its checks');
    const m = S.metrics({ ...plan, elements: o.elements, zones: o.zones, program: o.program || prog }); assert.ok(m.units > 40, q.ask + ': ' + m.units + ' units');
    sigs.add([m.units, Math.round(m.gfa), m.spaces].join('|'));
  }
  assert.ok(sigs.size >= 4, 'at least four different layouts: ' + [...sigs].join(' / '));
}
// ---- sizes someone gives: square feet and buildings in place of "as big as fits" ----
{
  const r = Q.quickSet('retail', 11, 1000, { sf: 60000, buildings: 2 });
  assert.equal(r[0].ask, 'Retail strip, 60,000 sf, in 2 buildings');
  const p = S.normalizeProgram(S.guessProgram(r[0].ask)); assert.deepEqual([p.gfa, p.buildings, p.max], [60000, 2, false], 'read as asked');
  const m = Q.quickSet('multifamily', 11, 1000, { sf: 60000, buildings: 6 })[0].ask; assert.equal(m, 'Garden apartments, 3 stories, as many as fit, in 6 buildings', 'square feet don’t size homes; buildings do');
  assert.equal(S.normalizeProgram(S.guessProgram(m)).buildings, 6);
  assert.ok(!/building/.test(Q.quickSet('sfr', 11, 1000, { buildings: 6 })[0].ask), 'no building count on homes on lots');
  assert.equal(Q.sizeNote('multifamily'), 'Square feet apply to commercial types and hotels'); assert.equal(Q.sizeNote('retail'), '');
  const o = Q.quickSet('office', 11, 1000, { sf: 50000 })[0]; assert.equal(S.normalizeProgram(S.guessProgram(o.ask)).gfa, 50000);
}
// ---- a hotel is one building on its own parcel, retail the rest ----
{
  const h = Q.quickSet('hotel', 11, 1000);
  assert.equal(h.length, 5); for (const q of h) { assert.equal(q.hotel.buildings, 1); assert.match(q.hotel.words, /in 1 building$/); assert.equal(S.normalizeProgram(S.guessProgram(q.hotel.words)).buildings, 1); }
  assert.equal(Q.quickSet('hotel', 11, 1000, { sf: 99000 })[0].hotel.keys, 180, 'square feet set the keys (550 sf a key)');
  assert.equal(Q.quickSet('hotel', 11, 1000, { buildings: 2 })[0].hotel.buildings, 2, 'buildings when given');
  assert.equal(Q.quickTypes(3, 1000).find(t => t.id === 'hotel').count, 0, 'not on a small site');
  assert.equal(Q.quickTypes(7.2, 260).find(t => t.id === 'hotel').count, 0, 'not on a narrow frontage');
  const plan = LOTS.wedge10.plan(), front = plan.front ?? S.longestEdge(plan.ring), q = h[0];
  for (const end of [false, true]) {
    const sp = Q.splitSite(plan.ring, front, q.hotel.acres, { clip: polyclip.intersection, diff: polyclip.difference, area: S.ringArea, width: q.hotel.width, end });
    assert.ok(sp, 'split'); assert.ok(Math.abs(S.ringArea(sp.first) / 43560 - q.hotel.acres) < 0.1, 'the hotel parcel is the land it needs: ' + (S.ringArea(sp.first) / 43560).toFixed(2));
    assert.ok(Math.abs(S.ringArea(sp.first) + S.ringArea(sp.rest) - S.ringArea(plan.ring)) < 100, 'the two parcels make the site');
  }
  const sp = Q.splitSite(plan.ring, front, q.hotel.acres, { clip: polyclip.intersection, diff: polyclip.difference, area: S.ringArea, width: q.hotel.width }), F = S.frame(plan.origin), geo = r => ({ type: 'Polygon', coordinates: [r.concat([r[0]]).map(F.toLL)] });
  const parts = PARC.partsOf(plan, [{ key: 'hotel', geometry: geo(sp.first) }, { key: 'retail', geometry: geo(sp.rest) }]); assert.ok(parts.every(x => !x.landlocked), 'both parcels on the street');
  const prog = { use: 'retail', parcels: [{ parcel: 'hotel', program: S.guessProgram(q.hotel.words) }, { parcel: 'retail', program: S.guessProgram(q.ask) }] };
  const r = runPlan(plan, prog, { count: 3, parcels: parts, perParcel: true }, { ask: q.hotel.words + '; ' + q.ask }), o = r.options.find(x => x.check.status === 'pass');
  assert.ok(o, 'a layout that passes'); const B = o.elements.filter(e => e.kind === 'building');
  assert.equal(B.filter(e => e.use === 'hotel').length, 1, 'one hotel building'); assert.ok(B.some(e => e.use === 'retail'), 'and retail');
  assert.ok(!o.elements.some(e => e.future), 'nothing held for later');
}
console.log('quick layouts ok');
