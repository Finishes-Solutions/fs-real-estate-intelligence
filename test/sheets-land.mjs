// The landscape sheets (lib/sheets/land.mjs) on every realistic plan (test/helpers/setctx.mjs): the planting design
// meets the rules it states (street trees on the frontage, a tree for every ten parking spaces, a tree in nearly every
// front yard, no species over 40%), puts no tree on paving, in a building, in a pond, in a sight triangle or on a
// hydrant, and the sheets agree: L-001's quantities are L-101's schedule, L-201 waters what L-001 says. Then the
// section in the set: six sheets (L-102 only when the site plan is drawn small), each with the plant names it should.
import assert from 'node:assert/strict';
import { ctxFor, CASES } from './helpers/setctx.mjs';
import * as P from '../lib/planset.mjs';
import * as S from '../lib/siteplan.mjs';
import { KIT as K } from '../lib/sheets/site.mjs';
import { design, hydro, calcs, plantCounts, PLANTS, RULES } from '../lib/sheets/land.mjs';

const un = s => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
const TREE = c => ['canopy', 'ornamental'].includes(PLANTS[c][3]);

for (const name of Object.keys(CASES)) {
  const ctx = ctxFor(name), G = K.geo(ctx), Ld = design(G), C = calcs(ctx), H = hydro(G), row = re => C.rows.find(r => re.test(r[0]));
  // the rules it states
  const fr = row(/^Street frontage/); assert.ok(fr && fr[3] === 'Meets', name + ': street trees ' + fr);
  const pk = row(/^Parking: 1 tree/); if (Ld.req.park.stalls) assert.equal(pk[3], 'Meets', name + ': parking trees ' + pk);
  if (Ld.req.lots.need) assert.ok(Ld.req.lots.have >= Ld.req.lots.need * 0.95, name + ': front yard trees ' + Ld.req.lots.have + ' of ' + Ld.req.lots.need);
  assert.ok(C.share <= RULES.maxSpecies, name + ': species diversity ' + Math.round(C.share * 100) + '%');
  // where the trees stand
  const ring = G.ring, hyd = K.hydrants(G), ponds = G.ponds.map(q => q.o);
  for (const t of Ld.trees) {
    const at = name + ': ' + t.code + ' (' + t.why + ') at ' + t.p.map(Math.round);
    assert.ok(S.inRing(t.p, ring), at + ' is on the site');
    assert.ok(t.why === 'island' || !K.isPaving(G, t.p), at + ' is not on paving');
    assert.ok(!G.B.some(b => S.inRing(t.p, b.o)), at + ' is not in a building');
    assert.ok(!ponds.some(o => S.inRing(t.p, o)), at + ' is not in a pond');
    assert.ok(!Ld.sight.some(tri => S.inRing(t.p, tri)), at + ' is out of the sight triangles');
    assert.ok(!hyd.some(h => Math.hypot(h[0] - t.p[0], h[1] - t.p[1]) < 7), at + ' is clear of the hydrants');
  }
  assert.ok(Ld.trees.filter(t => TREE(t.code)).length >= 10, name + ': a planting plan, not a few dots');
  // the sheets agree
  const sheets = ctx.sheets.filter(s => s.section === 'landscape'), kinds = sheets.map(s => s.kind);
  for (const k of ['l-notes', 'l-plan', 'l-irrig', 'l-details', 'l-irr-details']) assert.ok(kinds.includes(k), name + ': ' + k);
  assert.deepEqual(sheets.map(s => s.number).filter(n => n !== 'L-102'), ['L-001', 'L-101', 'L-201', 'L-501', 'L-502'], name + ': numbering');
  const html = Object.fromEntries(sheets.map(s => [s.kind, un(P.sheetPage(ctx, s))])), cnt = plantCounts(Ld);
  for (const [code, q] of Object.entries(cnt)) {
    const nm = PLANTS[code][0], qty = Math.round(q).toLocaleString('en-US');
    assert.ok(html['l-notes'].includes(nm) && html['l-notes'].includes('>' + qty + '<'), name + ': L-001 lists ' + qty + ' ' + nm);
    assert.ok(html['l-plan'].includes(nm), name + ': L-101 lists ' + nm);
  }
  assert.ok(/St\. Augustine/.test(html['l-notes']) && /Bermuda/.test(html['l-irrig']), name + ': turf named');
  if ((H.sf.spray || 0) + (H.sf.rotor || 0) > 2000) assert.ok(H.valves.length > 0 && /POC: METER \+ RPZ BACKFLOW/.test(html['l-irrig']), name + ': zones and a point of connection');
  for (const k of ['spray', 'rotor', 'drip']) if (H.sf[k]) assert.ok(H.valves.filter(v => v.k === k).length >= Math.ceil(H.sf[k] / 6000), name + ': enough ' + k + ' valves (about 25 gpm a zone)');
  assert.ok(/Tree planting/.test(html['l-details']) && /Parking island tree/.test(html['l-details']) && /Backflow preventer/.test(html['l-irr-details']), name + ': details');
  for (const [k, h] of Object.entries(html)) assert.ok(!/NaN|undefined|Infinity|couldn’t be drawn/.test(h), name + ' ' + k + ' draws clean');
  if (kinds.includes('l-enlarge')) assert.ok(/Main entry — planting enlargement/.test(html['l-enlarge']), name + ': entry enlargement');
}
// a big site gets the enlargements; a small one is legible on L-101 alone
{ const sfr = ctxFor('sfr'), small = ctxFor('restaurant');
  assert.ok(sfr.sheets.some(s => s.kind === 'l-enlarge'), 'the 27 acre tract gets L-102');
  assert.equal(P.sheetList(small.plan).some(s => s.kind === 'l-enlarge'), P.fitScale(small.plan, 25, 20) > 30, 'L-102 follows the site plan scale'); }
// lots are the builder's: the common system doesn't water them
{ const H = hydro(K.geo(ctxFor('sfr'))); assert.ok(H.sf.lot > H.sf.spray, 'lots are left to the builder'); }
console.log('landscape sheets ok');
