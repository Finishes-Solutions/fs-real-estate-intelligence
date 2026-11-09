// Quick layouts (lib/quicklayouts.mjs): every request of every type, on sites from 1 to 60 acres, is read by the words
// parser (no AI) as the use it is meant to be; the type buttons are offered only where something fits; the set is
// fixed for a site (the same requests every time); and a type's set laid out on a sample site gives real, different layouts.
import assert from 'node:assert/strict';
import * as Q from '../lib/quicklayouts.mjs';
import * as S from '../lib/siteplan.mjs';
import * as RUN from '../lib/planruns.mjs';
import { runPlan } from '../lib/layoutrun.mjs';
import { LOTS } from '../scripts/layout-review.mjs';

const USE = { multifamily: ['multifamily'], townhomes: ['townhomes', 'duplex', 'sfr'], sfr: ['sfr'], retail: ['retail', 'restaurant', 'fuel'], office: ['office', 'medical', 'hotel'], industrial: ['industrial', 'storage'] };
const usesOf = p => (p.zones?.length > 1 ? p.zones.map(z => z.use) : [p.use]).filter(u => u !== 'amenity'); // (a commons rides along with homes)
for (const acres of [1, 2.5, 5.5, 11, 20, 40, 60]) for (const fr of [150, 400, 900]) {
  const types = Q.quickTypes(acres, fr);
  assert.equal(types.length, 7);
  for (const t of types) {
    const set = Q.quickSet(t.id, acres, fr), all = Q.quickSet(t.id, acres, fr, { all: true });
    assert.equal(t.count, set.length); assert.ok(set.length <= Q.QUICK_MAX); assert.deepEqual(all.slice(0, set.length), set, 'the first five, then spares');
    if (!t.count) assert.match(t.why, /acres/, 'a greyed type says why');
    assert.equal(new Set(all.map(q => q.ask)).size, all.length, 'no request twice: ' + t.id);
    assert.deepEqual(Q.quickSet(t.id, acres, fr, { all: true }), all, 'the same requests every time');
    for (const q of all) {
      const p = S.normalizeProgram(S.guessProgram(q.ask)), u = usesOf(p);
      if (t.id === 'mixed') assert.ok(u.length >= 2, q.ask + ' reads as mixed use: ' + u);
      else assert.ok(u.every(x => USE[t.id].includes(x)), q.ask + ' reads as ' + u + ' (' + t.id + ')');
      if (/(\d[\d,]*) (?:sf|units|townhomes|apartments|keys)/.test(q.ask) && !/anchor|retail along|retail in front/.test(q.ask) && t.id !== 'mixed') assert.ok(p.gfa || p.units, q.ask + ': its number is read');
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
console.log('quick layouts ok');
