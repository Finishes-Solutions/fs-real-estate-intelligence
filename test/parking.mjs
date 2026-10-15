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
// ---- one smooth paved surface: an exact union, no staircase on a row turned a fraction of a degree, curbs rounded ----
{
  const row = { id: 'r', kind: 'parking', x: 0, y: 0, w: 270, d: 18, rot: 90.676 }, aisle = { id: 'a', kind: 'drive', x: 21, y: 0.25, w: 270, d: 24, rot: 90.676 };
  const pv = S.pavement({ ...small, elements: [row, aisle] }); assert.equal(pv.length, 1, 'a row and its aisle pour as one');
  const o = pv[0].outer, A = S.ringArea(o); assert.ok(Math.abs(A - 270 * 42) < 270 * 42 * 0.02, 'the area of the two, not a grid of cells: ' + A);
  const short = o.filter((p, k) => { const q = o[(k + 1) % o.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]) < 2; }).length;
  assert.ok(o.length < 60 && short <= 4 * 19, 'four rounded corners and four long sides, no steps: ' + o.length + ' points, ' + short + ' short sides');
  const loop = { id: 'd', kind: 'drive', path: [[0, 0], [200, 0], [200, 150], [0, 150]], width: 26, r: 40 }, pl = S.pavement({ ...small, elements: [loop] })[0].outer;
  for (let k = 0; k < pl.length; k++) { const a = pl[(k - 1 + pl.length) % pl.length], b = pl[k], c = pl[(k + 1) % pl.length], t = Math.abs(Math.atan2((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]), (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])));
    assert.ok(t < Math.PI / 2 + 0.01, 'a curved drive stays smooth: no corner sharper than the drive’s own (' + (t * 180 / Math.PI).toFixed(0) + '°)'); }
}
// ---- every aisle ends where its stalls (or a connection, or the entry) end: no stubs of asphalt to nowhere ----
{
  const irregular = lot(0, 0, { ring: [[144, 442], [45, 190], [-278, 161], [-274, -268], [230, -261], [222, 420]], front: 4 }); // a real 5.9 ac tract: street on one side, a dog-leg at the back
  for (const [site, ask] of [[small, '25,000 sf retail strip'], [irregular, '30,000 sf office'], [irregular, '30,000 sf retail strip with 2 pads']]) {
    const o = L.layoutOptions(site, S.guessProgram(ask))[0], els = o.elements, paved = els.filter(e => S.PAVED.includes(e.kind));
    for (const d of els.filter(e => e.kind === 'drive' && /drive aisle$/.test(e.note || '') && !S.isFree(e))) {
      const u = [Math.cos((d.rot || 0) * Math.PI / 180), Math.sin((d.rot || 0) * Math.PI / 180)], others = paved.filter(q => q !== d).map(S.outline);
      for (const end of [-1, 1]) { const p = [d.x + u[0] * end * (d.w / 2 - 20), d.y + u[1] * end * (d.w / 2 - 20)], gap = Math.min(...others.map(r => r.reduce((m, a, k) => Math.min(m, S.segDist(p, a, r[(k + 1) % r.length])), Infinity)));
        assert.ok(gap < d.d / 2 + 8, ask + ': an aisle end ' + gap.toFixed(0) + ' ft from any stall or drive (a stub)'); }
    }
  }
  // a re-fit after the building is slid along the street: the drives and parking are laid out again round it, not lost
  // (6 spaces of 120 before)
  const o = L.layoutOptions(irregular, S.guessProgram('30,000 sf retail strip with 2 pads'))[0], p = { ...irregular, program: o.program, elements: structuredClone(o.elements), recipe: o.recipe };
  const b = p.elements.find(e => e.kind === 'building'), f = p.ring[4], g = p.ring[5], L0 = Math.hypot(g[0] - f[0], g[1] - f[1]); // slid 50 ft along the street
  b.x += (g[0] - f[0]) / L0 * 50; b.y += (g[1] - f[1]) / L0 * 50; b.pinned = true;
  const r = L.refit(p, { amount: 'current' }), m = S.metrics({ ...p, elements: r.elements });
  assert.ok(m.spaces >= m.required && m.spaces <= Math.ceil(m.required * 1.15) + 4, 'moved building re-fitted: ' + m.spaces + ' spaces for ' + m.required);
  assert.ok(!S.check({ ...p, elements: r.elements }).some(i => i.level === 'bad'), 'and nothing overlaps it');
}
// ---- a main entrance bent by hand (a route, pinned) stays the one way in when the site re-fits ----
{
  const T = await import('../lib/sitetools.mjs'), o = L.layoutOptions(small, S.guessProgram('25,000 sf retail strip'))[0], p = { ...small, program: o.program, elements: structuredClone(o.elements), recipe: o.recipe };
  const k = p.elements.findIndex(e => e.name === 'Main entry'), r = T.routeOf(p.elements[k], p.ring), A = r.path[0], B = r.path[1], n = [-(B[1] - A[1]), B[0] - A[0]], L0 = Math.hypot(...n);
  r.path = [A, [(A[0] + B[0]) / 2 + n[0] / L0 * 30, (A[1] + B[1]) / 2 + n[1] / L0 * 30], B]; r.pinned = true; p.elements[k] = r; // a bend 30 ft off to one side
  const out = L.refit(p, { amount: 'current' }), els = out.elements, mains = els.filter(e => e.name === 'Main entry');
  assert.equal(mains.length, 1, 'one Main entry, not the layout\'s own beside it'); assert.ok(mains[0].path?.length === 3, 'the bent one');
  const m = S.metrics({ ...p, elements: els }); assert.ok(m.spaces >= m.required, 'still parks what it needs: ' + m.spaces + '/' + m.required);
  assert.ok(!S.check({ ...p, elements: els }).some(i => i.level === 'bad'), 'nothing overlaps: ' + S.check({ ...p, elements: els }).filter(i => i.level === 'bad').map(i => i.text).join('; '));
  assert.equal(S.pavement({ ...p, elements: els }).length, 1, 'and its drives and parking pour as one surface with the entrance');
  const mo = S.outline(mains[0]); assert.ok(!els.some(e => e.kind === 'green' && S.rectsOverlap({ poly: S.outline(e) }, { poly: S.grow(mo, -2) }, 0)), 'no lawn laid over the entrance');
}
// ---- a stall row moved off its aisle (as a drag can leave one) is flagged; the rows a layout lays out never are ----
{
  const o = L.layoutOptions(small, S.guessProgram('25,000 sf retail strip'))[0], p = { ...small, elements: structuredClone(o.elements) };
  assert.deepEqual(S.check(p).filter(i => /no aisle/.test(i.text)), [], 'every generated row faces an aisle');
  const row = p.elements.filter(e => e.kind === 'parking' && e.row).sort((a, b) => b.w - a.w)[0], u = [-Math.sin((row.rot || 0) * Math.PI / 180), Math.cos((row.rot || 0) * Math.PI / 180)], sg = row.row > 0 ? -1 : 1;
  row.x += u[0] * sg * 60; row.y += u[1] * sg * 60; // 60 ft back, away from the aisle it faced
  assert.ok(S.check(p).some(i => i.id === row.id && /has no aisle to drive in from/.test(i.text)), 'the moved row is flagged: ' + S.check(p).map(i => i.text).join('; '));
}
// ---- a way through: aisles don't stop at a curb with stalls along them ----
{ // by hand: a 40-stall double-loaded aisle stops 30 ft short of a cross drive. Opened, it runs on to meet it: nothing lost
  const A = { id: 'a', kind: 'drive', x: 0, y: 0, w: 180, d: 24, rot: 0, note: '24 ft drive aisle' }, rows = [{ id: 'r1', kind: 'parking', x: 0, y: 21, w: 180, d: 18, rot: 0, row: 1 }, { id: 'r2', kind: 'parking', x: 0, y: -21, w: 180, d: 18, rot: 0, row: -1 }];
  const cross = { id: 'c', kind: 'drive', x: 133, y: 0, w: 26, d: 160, rot: 0, note: '26 ft drive' }, feed = { id: 'f', kind: 'drive', x: -103, y: 0, w: 26, d: 160, rot: 0 };
  const p = { ...lot(640, 400), program: { use: 'retail', gfa: 8000 }, elements: [A, ...rows, cross, feed] };
  const de = S.deadEnds(p.elements); assert.equal(de.length, 1, 'one closed end: ' + JSON.stringify(de.map(d => d.stalls))); assert.equal(de[0].stalls, 40, 'all 40 stalls lie between the only join (the far end) and the curb');
  assert.ok(S.check(p).some(i => i.id === 'a' && /dead-ends with 40 spaces/.test(i.text)), 'and the plan says so');
  const r = S.openDeadEnds(p, p.elements), a2 = r.elements.find(e => e.id === 'a');
  assert.equal(r.opened, 1); assert.ok(Math.abs(a2.x + a2.w / 2 - 120) < 3, 'the aisle runs on to the cross drive: ends at ' + (a2.x + a2.w / 2));
  assert.equal(S.deadEnds(r.elements).length, 0, 'no closed end left'); assert.equal(S.metrics({ ...p, elements: r.elements }).spaces, S.metrics(p).spaces, 'no stall lost');
  // boxed in by a building past the end, nothing beside it: a hammerhead when the plan has stalls to spare, else nothing
  const bl = { id: 'b', kind: 'building', x: 150, y: 0, w: 40, d: 100, rot: 0, use: 'retail', floors: 1 }, boxed = { ...p, program: { use: 'retail', gfa: 4000 }, elements: [A, ...rows, bl, feed] };
  const h = S.openDeadEnds(boxed, boxed.elements); assert.equal(h.opened, 1);
  assert.equal(S.metrics({ ...boxed, elements: h.elements }).spaces, S.metrics(boxed).spaces - 4, 'two stalls off each row at the closed end');
  assert.equal(S.deadEnds(h.elements).length, 0, 'the clear end is a place to turn');
  const tight = { ...boxed, elements: boxed.elements.map(e => e === bl ? { ...bl, floors: 3 } : e) }; assert.ok(S.metrics(tight).spaces <= S.metrics(tight).required + 3);
  assert.equal(S.openDeadEnds(tight, tight.elements).opened, 0, 'no stalls to spare: left as it is (and flagged)'); }
{ // generated: on the 19730 FM 362 lot (8 sides, a notch for an out-parcel; FM 362 on the west, a local road on the east) and
  // two plain lots, most aisles go through, none is cut short of the parking the plan needs, and stalls never hang past an aisle
  const ring = [[-441.8, -191.92], [475.3, -185.63], [474.61, -55.83], [354.06, -58.81], [353.81, 31.2], [474.04, 34.19], [472.83, 185.77], [-446.13, 190.03]];
  const sites = [[{ origin: [-95.93, 30.05], ring, front: 7, streets: [1, 5], setbacks: { rear: 20, side: 10, front: 25, paving: 10 } }, S.guessProgram('30,000 sf office and 40,000 sf warehouse')],
    [lot(350, 380, { streets: [1] }), { use: 'office' }], [lot(700, 620), { use: 'multifamily' }]];
  let n = 0, dead = 0;
  for (const [plan, prog] of sites) for (const o of L.layoutOptions({ ...plan, elements: [] }, prog)) {
    const p = { ...plan, elements: o.elements }, m = S.metrics(p); n++; dead += S.deadEnds(o.elements).length;
    const before = (o.notes || []).join(' '); assert.ok(m.spaces >= m.required || /short/i.test(before) || S.check(p).some(i => /short/.test(i.text)), o.name + ': parked');
    for (const d of S.deadEnds(o.elements, 1)) assert.ok((d.rowEnd - d.L / 2 * d.sgn) * d.sgn < 2, o.name + ': no stall past the end of its aisle');
  }
  assert.ok(dead <= Math.floor(n / 3), dead + ' closed aisle ends in ' + n + ' layouts'); }

if (process.env.PARKING_TABLE) console.log(table.map(r => r.join(' | ')).join('\n'));
console.log('parking ok');
