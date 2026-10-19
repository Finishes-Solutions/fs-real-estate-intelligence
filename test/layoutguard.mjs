// Layouts that came back broken or empty on real-shaped lots (found by running every use on corner, clipped, wedge and
// odd lots): a dead-end aisle run on into the detention pond's edge, a shop-and-apartment mix on a wedge that laid out
// nothing at all, and duplexes that always read parking short (their driveways weren't counted).
import assert from 'node:assert/strict';
import * as S from '../lib/siteplan.mjs';
import * as L from '../lib/sitelayout.mjs';

const lot = (ring, p0, extra = {}) => { const prog = S.normalizeProgram(p0), plan = { ring, origin: [-95.8245, 29.7855], front: 0, setbacks: { ...S.SETBACKS }, program: prog, elements: [], ...extra }; return { plan, opts: L.layoutOptions(plan, prog, {}) }; };
const bad = (plan, o) => S.check({ ...plan, program: o.program, elements: o.elements }).filter(i => i.level === 'bad').map(i => i.text);

// a drive opened past a dead end never runs over a pond (it used to graze one, the row-width allowance applied to it)
const corner = [[0, 0], [380, 0], [380, 340], [0, 340]], clipped = [[0, 0], [330, 0], [400, 70], [400, 380], [0, 380]];
for (const [name, ring, p, streets] of [['medical, corner', corner, { use: 'medical', gfa: 20000 }, [1]], ['church, corner', corner, { use: 'church', gfa: 15000 }, [1]], ['retail, clipped corner', clipped, { use: 'retail', gfa: 25000 }, [2]]]) {
  const { plan, opts } = lot(ring, p, { streets });
  assert.ok(opts.length >= 1, name + ': layouts');
  opts.forEach((o, i) => assert.deepEqual(bad(plan, o), [], name + ' #' + i + ': passes the checks'));
}
// a mix that won't lay out as asked: smaller, and says so (never no layouts)
{ const { plan, opts } = lot([[0, 0], [700, 0], [60, 620]], { use: 'retail', zones: [{ use: 'retail', gfa: 15000 }, { use: 'multifamily', units: 120 }] });
  assert.ok(opts.length >= 1, 'a wedge too tight for shops and 120 apartments still gets layouts');
  for (const o of opts) { assert.deepEqual(bad(plan, o), []); assert.match(o.notes[0], /doesn’t lay out on this site|don’t fit together/, 'and says it is smaller than asked: ' + o.notes[0]); } }
// front-load duplexes park their second car on the driveway: no plan of them reads "parking short" (every one used to)
{ const { plan, opts } = lot([[0, 0], [700, 0], [720, 640], [0, 620]], { use: 'duplex', units: 24 });
  for (const o of opts) { const m = S.metrics({ ...plan, program: o.program, elements: o.elements }); if (!o.elements.some(e => /front-load/i.test(e.note || ''))) continue;
    assert.ok(m.driveways > 0 && m.spaces >= m.required, 'duplexes parked with their driveways: ' + m.spaces + '/' + m.required + ' (' + m.driveways + ' driveways)'); } }
console.log('layout guards ok');
