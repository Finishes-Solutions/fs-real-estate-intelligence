// Requests as people type them, read and laid out as asked (scripts/layout-review.mjs draws the same cases for a person
// to look at). Each check here was a wrong result on the review sheets of Oct 27: the number asked for lost behind a
// word ("120 garden apartments"), "homes" not read as houses, pad sites asked for on a single-use plan dropped, and a
// commons asked for at the entry left as bare land marked "Pad site".
import assert from 'node:assert/strict';
import * as S from '../lib/siteplan.mjs';
import * as L from '../lib/sitelayout.mjs';
import { LOTS } from '../scripts/layout-review.mjs';

// ---- reading ----
const read = t => S.guessProgram(t);
assert.equal(read('120 garden apartments, 3 stories, with a clubhouse and pool').units, 120, 'a word between the number and "apartments"');
assert.equal(read('40 for-rent townhomes on 5 acres').units, 40);
assert.equal(read('3 story apartments').units, undefined, 'a storey count is not a unit count');
assert.equal(read('200 apartments, 3 floors').units, 200);
assert.deepEqual([read('50 homes').use, read('50 homes').units], ['sfr', 50], '"homes" alone are houses');
assert.deepEqual([read('50 single family homes').use, read('50 single family homes').units], ['sfr', 50]);
assert.equal(read('150 townhomes').use, 'townhomes', '(townhomes stay townhomes)');
assert.equal(read('25,000 sf retail strip with 2 pad sites').pads, 2, 'pads on a single-use request');
assert.equal(S.normalizeProgram(read('retail center 30,000 sf plus 3 pads')).pads, 3, 'the program keeps them');
assert.equal(S.normalizeProgram({ use: 'multifamily', pads: 2 }).pads, null, '(pads only for uses that have them)');

// ---- pads laid out on the frontage ----
{
  const plan = LOTS.rect5.plan(), os = L.layoutOptions(plan, read('25,000 sf retail strip with 2 pad sites'));
  const pads = o => o.elements.filter(e => e.kind === 'building' && e.pad), withPads = os.filter(o => pads(o).length === 2);
  assert.ok(withPads.length >= 1, 'an option with both pads: ' + os.map(o => pads(o).length).join(','));
  for (const o of withPads) {
    const strip = o.elements.find(e => e.kind === 'building' && e.use === 'retail'), F = L.frameOf(plan), y = e => S.rotPt([e.x, e.y], -F.psi)[1];
    for (const p of pads(o)) assert.ok(y(p) < y(strip), 'the pads are between the street and the strip');
  }
  for (const o of os.filter(o => pads(o).length < 2)) assert.ok(o.notes.some(n => /pad sites/.test(n)), 'an option short of pads says so');
}
// ---- a commons asked for at the entry is built ----
{
  const o = L.layoutOptions(LOTS.trap20.plan(), read('150 townhomes with an amenity center'))[0], names = o.elements.map(e => e.name || '');
  assert.ok(names.includes('Community center'), 'the community center: ' + names.filter(Boolean).slice(0, 12).join(', '));
  assert.ok(o.elements.some(e => e.kind === 'play') && names.includes('Pavilion'), 'its playground and pavilion');
  assert.ok(!o.elements.some(e => /pad site/i.test(e.name || '')), 'no "pad site" on a townhome plan');
}
// ---- townhome options meet their own parking (the narrow lot was 2–3 guest spaces short on every option) ----
{
  const plan = LOTS.narrow7.plan(), prog = read('townhomes for rent, 2 car garages');
  for (const o of L.layoutOptions(plan, prog)) { const m = S.metrics({ ...plan, elements: o.elements, zones: o.zones, program: o.program || prog }); assert.ok(m.spaces >= m.required, o.name + ': parking ' + m.spaces + ' of ' + m.required); }
}
console.log('layout asks ok');
