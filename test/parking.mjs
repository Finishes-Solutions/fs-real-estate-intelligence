// Parking in the generated site plans (lib/sitelayout.mjs, counted by lib/siteplan.mjs metrics): every option parks what
// it asks for without acres of spare stalls, Phase 1 shows its own share, a parking garage is sized to the parking it
// carries, no option comes back without its parking, and no two buildings in a plan share a name. Realistic sites: a
// 640 x 400 ft (5.9 ac) and a 900 x 625 ft (12.9 ac) lot with the street on the south edge.
// PARKING_TABLE=1 prints provided / required for every option.
import assert from 'node:assert/strict';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), C = await import('../lib/sitecompose.mjs');

const lot = (w, h, extra = {}) => ({ origin: [-95.5, 29.8], ring: [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], front: 0, setbacks: { ...S.SETBACKS }, ...extra });
const small = lot(640, 400), big = lot(900, 625), mixed = S.guessProgram('15,000 sf retail, 5,000 sf restaurant and 20,000 sf office');

// ---- the numbers: Phase 1, garages in the ratio, accessible stalls counted once ----
{
  const B = (x, y, w, d, extra) => ({ id: 'b' + x + y, kind: 'building', x, y, w, d, rot: 0, use: 'retail', floors: 1, ...extra }), row = (y, n) => ({ id: 'p' + y, kind: 'parking', x: 0, y, w: n * 9, d: 60, rot: 0 });
  const p = { ...small, program: { use: 'retail', gfa: 24000 }, elements: [B(-150, 120, 120, 100), B(150, 120, 120, 100, { phase: 2 }), row(0, 30)] }, m = S.metrics(p);
  assert.equal(m.required, 96); assert.equal(m.p1.need, 48, 'Phase 1 needs what its own buildings need');
  assert.equal(m.p1.stalls, Math.round(m.stalls * 48 / 96), 'and gets its share of the parking: ' + JSON.stringify(m.p1));
  assert.equal(m.need, m.required);
  const q = S.metrics({ ...p, elements: p.elements.map(e => ({ ...e, phase: undefined })) }); assert.deepEqual(q.p1, { need: q.required, stalls: q.spaces }, 'no Phase 2: Phase 1 is the plan');
  const g = { id: 'g', kind: 'garage', x: 0, y: -100, w: 120, d: 124, rot: 0, levels: 3 }, mg = S.metrics({ ...p, elements: [...p.elements, g] });
  assert.equal(mg.deck, Math.floor(120 * 124 * 3 / 330)); assert.ok(Math.abs(mg.per1k - mg.spaces / mg.gfa * 1000) < 1e-9, 'the ratio counts the garage');
  assert.equal(mg.spaces, 60 - S.adaLoss(60) + mg.deck, 'accessible aisles cost surface stalls only');
  // defaults: guest parking for townhomes, hotels by the room, churches by the seat, ratios capped at 15
  const th = S.metrics({ ...small, program: { use: 'townhomes' }, elements: [B(0, 0, 144, 40, { use: 'townhomes', units: 6 })] });
  assert.equal(th.required, Math.ceil(6 * 2.25), 'townhomes: 2 in the garage and a quarter guest space a home'); assert.equal(th.garages, 12);
  assert.equal(S.required(S.normalizeProgram({ use: 'hotel' }), 550 * 120), 121, 'a hotel: about a space a room');
  assert.equal(S.guessProgram('a 120 room hotel').gfa, 66000); assert.equal(S.guessProgram('a 600 seat church').use, 'church');
  assert.equal(S.required(S.normalizeProgram({ use: 'church' }), 20000), 200, 'a church: a space for every 3 of its 600 seats');
  assert.equal(S.normalizeProgram({ use: 'retail', ratio: 40 }).ratio, 15, 'ratios cap at 15 a 1,000 sf');
  assert.ok(S.USES.hotel.label && S.USES.church.label && S.COMMERCIAL.includes('hotel') && S.COMMERCIAL.includes('church'));
}

// ---- generated options: parked to the need, not far past it ----
const cases = [
  ['12k retail, fill on', small, { use: 'retail', gfa: 12000 }],
  ['12k retail, fill off', lot(640, 400, { params: { fill: false } }), { use: 'retail', gfa: 12000 }],
  ['25k retail', small, { use: 'retail', gfa: 25000 }],
  ['25k retail with a garage', small, S.guessProgram('25,000 sf retail with a parking garage')],
  ['6k restaurant', small, { use: 'restaurant', gfa: 6000 }],
  ['mixed use, 5.9 ac', small, mixed],
  ['mixed use, 12.9 ac', big, mixed],
  ['200 apartments', big, { use: 'multifamily', units: 200 }]
];
const table = [];
for (const [what, plan, prog] of cases) {
  const t0 = Date.now(), opts = L.layoutOptions(plan, prog), ms = Date.now() - t0;
  assert.ok(opts.length >= 2, what + ': ' + opts.length + ' options');
  for (const o of opts) {
    const p = { ...plan, elements: o.elements, program: o.program }, m = S.metrics(p), p1 = m.p1, tag = what + ' · ' + o.name;
    assert.ok(m.required > 0 && m.spaces > 0, tag + ': no option without its parking');
    assert.ok(p1.stalls >= p1.need, tag + ': Phase 1 parked ' + p1.stalls + '/' + p1.need);
    assert.ok(p1.stalls <= p1.need * 1.15 + 3, tag + ': Phase 1 not over-parked ' + p1.stalls + '/' + p1.need); // (+3: accessible-stall rounding)
    assert.ok(m.spaces <= m.required * 1.15 + 3, tag + ': the site not over-parked ' + m.spaces + '/' + m.required);
    if (o.elements.some(e => e.kind === 'garage')) assert.ok(m.spaces < m.required * 1.3, tag + ': a garage sized to its share ' + m.spaces + '/' + m.required);
    const names = o.elements.filter(e => e.kind === 'building' && e.name).map(e => e.name); assert.equal(new Set(names).size, names.length, tag + ': no two buildings share a name (' + names.join(', ') + ')');
    assert.equal(o.elements.filter(e => e.name === 'Main entry').length, 1, tag + ': one main entry');
    table.push([what, o.name, m.spaces + '/' + m.required, p1.need !== m.required ? p1.stalls + '/' + p1.need : '', ms]);
  }
  if (/garage/.test(what)) assert.ok(opts.some(o => o.elements.some(e => e.kind === 'garage')), what + ': the garage asked for');
}
// mixed use on 5.9 acres: shops, restaurant and offices side by side on one parking field (they don't fit one behind another)
{
  const opts = L.layoutOptions(small, mixed);
  assert.ok(opts.filter(o => !/Simple layout/.test(o.name)).length >= 2, opts.map(o => o.name).join(' | '));
  for (const o of opts.filter(o => !/Simple layout/.test(o.name))) for (const u of ['retail', 'restaurant', 'office']) assert.ok(o.elements.some(e => e.kind === 'building' && e.use === u), o.name + ': has ' + u);
}
// the simple layouts (the last resort) start from a named main entry, so their parking isn't cut away as unreachable
{
  const r = C.composeSite(small, mixed, 0), ways = r.elements.filter(e => e.name === 'Main entry');
  assert.equal(ways.length, 1, 'one main entry'); assert.ok(r.elements.some(e => e.kind === 'parking'));
  const names = r.elements.filter(e => e.kind === 'building').map(e => e.name); assert.equal(new Set(names).size, names.length, 'one run of letters: ' + names.join(', '));
  const one = S.autoLayout(small, { use: 'retail', gfa: 12000 }); assert.equal(one.elements.filter(e => e.name === 'Main entry').length, 1, 'the simple single-use layout names its driveway');
}
// storefronts toward the street, parking by the doors: the measure behind the ranking
{
  const o = L.layoutOptions(lot(640, 400, { params: { fill: false } }), { use: 'retail', gfa: 25000 })[0], f = L.frontage(small, o.elements);
  assert.ok(f && f.face === 1 && f.walk < 90, 'the best option faces the street with its parking by the doors: ' + JSON.stringify(f));
}
// ---- a re-fit round pinned buildings (moved, resized or given a new use: every edit pins) parks their need, not the whole lot ----
{
  const o = L.layoutOptions(small, { use: 'retail', gfa: 25000 })[0], pl = { ...small, program: { use: 'retail', gfa: 25000 }, elements: o.elements, recipe: o.recipe }, m0 = S.metrics(pl);
  for (const use of ['retail', 'office']) {
    const p = structuredClone(pl); for (const e of p.elements) if (e.kind === 'building') { e.pinned = true; e.use = use; }
    const r = L.refit(p, { amount: 'current' }), m = S.metrics({ ...p, elements: r.elements });
    assert.ok(m.spaces >= m.required && m.spaces <= Math.ceil(m.required * 1.15) + 4, use + ' pinned: ' + m.spaces + ' spaces for ' + m.required + ' needed (layout had ' + m0.spaces + ' for ' + m0.required + ')');
  }
}
if (process.env.PARKING_TABLE) console.log(table.map(r => r.join(' | ')).join('\n'));
console.log('parking ok');
