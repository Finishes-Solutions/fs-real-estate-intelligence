// A retail plaza round a central court (lib/sitegencom.mjs plaza): the words that ask for it, the plaza alone on a
// parcel, and a plaza with a neighborhood behind it on 1 Ralston Rd (lib/sitetract.mjs: the plaza on a tract of its own
// at the front, the homes the rest), where the agent's first plan had two boxes at the corner and 17 homes on 40 acres.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as S from '../lib/siteplan.mjs';
import { layoutOptions, layoutGallery } from '../lib/sitelayout.mjs';

const read = f => JSON.parse(fs.readFileSync(new URL('./fixtures/real/' + f, import.meta.url)));
const dirOf = c => ({ E: [1, 0], W: [-1, 0], N: [0, 1], S: [0, -1], NW: [-0.72, 0.69] })[c], edgeTo = (ring, c) => { const d = dirOf(c); return ring.map((p, i) => ({ i, k: S.outwardOf(ring, i)[0] * d[0] + S.outwardOf(ring, i)[1] * d[1], L: S.edgeLen(ring, i) })).filter(e => e.k > 0.6).sort((a, b) => b.k - a.k || b.L - a.L)[0]?.i; };
const planOf = (geom, front, streets = []) => { const b = S.boundaryFrom(geom), plan = { id: 'p', name: 'A', origin: b.origin, ring: b.ring, frontGuess: false, setbacks: { ...S.SETBACKS }, program: { use: 'retail' }, elements: [], streets: [] }; plan.front = edgeTo(plan.ring, front); plan.streets = streets.map(c => edgeTo(plan.ring, c)).filter(i => i != null && i !== plan.front); return plan; };

// ---- the words ----
const words = 'a COMMERCIAL RETAIL PLAZA WITH A CENTRAL COURT CONTAIING A HANG OUT AREA AND A PARK. IN THE MIDDLE AND RESIDENTIAL NEIGHBORHOOD IN THE BACK.';
const P = S.normalizeProgram(S.guessProgram(words));
assert.equal(P.arrangement, 'plaza'); assert.ok(P.plaza && P.court.includes('lawn') && P.court.includes('pavilion') && P.court.includes('plaza'), 'the court holds a lawn, a pavilion and the plaza');
assert.deepEqual(P.zones.map(z => z.use), ['retail', 'sfr'], 'the commons "in the middle" is the plaza’s court, not a zone: shops and homes');
assert.ok(P.zones[0].plaza && P.zones[1].place?.where === 'back');
const one = S.normalizeProgram(S.guessProgram('a 40,000 sf retail plaza with a central park and a pavilion for hanging out'));
assert.ok(one.plaza && one.gfa === 40000 && !one.zones);
assert.ok(!S.normalizeProgram(S.guessProgram('30,000 sf of retail shops with 2 pads')).plaza, 'shops alone are no plaza');

// ---- the plaza alone (the 5.88-acre parcel on FM 362) ----
const FX = read('old-houston-fm362.json'), P1 = planOf(FX.parcels[0].geometry, 'E');
const t0 = Date.now(), g = layoutGallery(P1, S.guessProgram('a 40,000 sf retail plaza with a central park and a pavilion for hanging out'), { budgetMs: 20000 }), ms = Date.now() - t0;
assert.ok(g.length >= 5 && ms < 20000, 'a gallery in seconds: ' + g.length + ' in ' + ms + ' ms');
const first = g[0]; assert.ok(/^Retail plaza round a central court/.test(first.label), 'the plaza leads: ' + first.label); assert.equal(first.bad.length, 0); assert.equal(first.warnings.length, 0, 'clean: ' + first.warnings.join('; '));
const kinds = first.elements, has = (k, n) => kinds.some(e => e.kind === k && (!n || e.name === n));
assert.ok(has('plaza', 'Plaza') && has('green', 'Park') && kinds.some(e => e.name === 'Pavilion'), 'the plaza, the park and the pavilion in the court');
const shops = kinds.filter(e => e.kind === 'building' && e.use === 'retail'); assert.equal(shops.length, 3, 'shops on three sides');
const m1 = S.metrics({ ...P1, program: first.program, elements: first.elements }); assert.ok(m1.gfa >= 30000 && m1.spaces >= m1.required, 'sized and parked: ' + Math.round(m1.gfa) + ' sf, ' + m1.spaces + '/' + m1.required);
const opts1 = layoutOptions(P1, S.guessProgram('a 40,000 sf retail plaza with a central park and a pavilion for hanging out'), { count: 3 });
assert.ok(opts1.length && /^Retail plaza/.test(opts1[0].name), 'the three options lead with the plaza: ' + opts1[0].name);

// ---- the plaza with a neighborhood behind it (1 Ralston Rd) ----
const R = read('ralston-rd.json'), plan = planOf(R.site, R.front, [R.streets]);
assert.ok(Math.abs(S.ringArea(plan.ring) / 43560 - 39.86) < 0.2);
const t1 = Date.now(), os = layoutOptions(plan, S.guessProgram(R.ask), { count: 3 }), ms1 = Date.now() - t1;
assert.ok(os.length >= 2 && ms1 < 60000, os.length + ' options in ' + ms1 + ' ms');
const o = os[0]; assert.ok(/^Retail plaza on their own tract/.test(o.name), 'the plaza on its own tract leads: ' + o.name);
assert.ok(o.elements.some(e => e.kind === 'plaza') && o.elements.some(e => e.name === 'Pavilion') && o.elements.some(e => e.name === 'Park'), 'the court holds the plaza, the pavilion and the park');
const tract = o.recipe?.tract?.ring; assert.ok(tract?.length >= 3, 'the plaza’s tract in the recipe');
for (const e of o.elements.filter(e => e.kind === 'building' && e.use === 'retail')) assert.ok(S.inRing([e.x, e.y], tract), 'every shop on the tract');
const m = S.metrics({ ...plan, program: o.program, elements: o.elements, zones: o.zones || [] });
assert.ok(m.units >= 80, 'a neighborhood behind: ' + m.units + ' homes'); assert.ok(m.gfa >= 25000, 'a plaza of ' + Math.round(m.gfa) + ' sf'); assert.ok(m.spaces >= m.required * 0.97, 'parked: ' + m.spaces + '/' + m.required);
const homes = o.elements.filter(e => e.kind === 'building' && e.use === 'sfr'); assert.ok(homes.every(e => !S.inRing([e.x, e.y], tract)), 'no home on the plaza’s tract');
assert.ok(S.entrancesOf(o.elements).length >= 2, 'the plaza and the neighborhood each have a way in');
console.log('siteplaza ok: a gallery of ' + g.length + ' on the 5.88 ac (' + ms + ' ms), ' + os.length + ' options on Ralston Rd (' + ms1 + ' ms): ' + o.name + ' · ' + m.units + ' homes · ' + Math.round(m.gfa) + ' sf');
