// Food truck parks: the words, the program, the layout (truck stalls on a service lane round a pavilion and lawn,
// restrooms, the bar and its beer garden, a playground, the trash and grease enclosure, customer parking on the street
// side), the numbers, the pro forma, the AI's program and the read-out, on realistic lots: 2.5 acres a little out of
// square, a narrow deep lot, a corner lot with a side street, the 8-sided 19730 FM 362 parcel with its notch, and 1.5 acres.
import assert from 'node:assert/strict';
import * as S from '../lib/siteplan.mjs';
import * as L from '../lib/sitelayout.mjs';
import * as PF from '../lib/proforma.mjs';
import * as R from '../lib/render.mjs';
import { readAs, notUnderstood } from '../lib/planruns.mjs';
import { headline } from '../lib/planpick.mjs';
import { keyItems, keyHtml } from '../lib/planmap.mjs';
import { planSVG, sheetHTML } from '../lib/sitesheet.mjs';
import { BUILDING_TYPES, fromType } from '../lib/buildings.mjs';

const ASK = 'a food truck park with 12 trucks, a covered pavilion, restrooms and a small bar';

// ---------- the words ----------
{ const g = S.guessProgram(ASK);
  assert.equal(g.use, 'foodtrucks', 'a food truck park is its own use, not a commons or "other"'); assert.equal(g.foodtrucks.trucks, 12); assert.equal(g.foodtrucks.barSf, 1500, 'a small bar: about 1,500 sf');
  assert.ok(!g.zones && !g.extras && g.gfa == null, 'one use: the pavilion is the park’s own, not a commons zone'); }
{ const g = S.guessProgram('Food truck court with 8 truck stalls, a 4,000 sf pavilion, no bar, 6 spaces per truck');
  assert.deepEqual([g.foodtrucks.trucks, g.foodtrucks.pavilionSf, g.foodtrucks.bar, g.foodtrucks.perTruck], [8, 4000, false, 6]); }
{ const g = S.guessProgram('food trucks and a 2,500 sf beer garden bar, no playground'); assert.deepEqual([g.foodtrucks.barSf, g.foodtrucks.playground], [2500, false]); }
assert.equal(S.guessProgram('a warehouse with a truck court').use, 'industrial', 'a truck court is still industrial');
{ const p = S.normalizeProgram({ use: 'foodtrucks', gfa: 9000, extras: ['patio'], foodtrucks: { trucks: 500, perTruck: -2, barSf: 1e6 } });
  assert.deepEqual([p.foodtrucks.trucks, p.foodtrucks.perTruck, p.foodtrucks.barSf, p.foodtrucks.bar, p.foodtrucks.playground, p.foodtrucks.pavilionSf], [60, 0, 10000, true, true, 3000], 'settings kept in range, defaults filled');
  assert.equal(p.gfa, null); assert.deepEqual(p.extras, [], 'no stray extras or size'); }

// ---------- layouts on real shapes ----------
const of = (plan, o) => ({ ...plan, program: o.program, elements: o.elements });
// every lot: every option has restrooms (the health code wants them), and no two options are the same choice (same trucks,
// seats within 10%, the bar and a pond both there or both not)
const lot = (ring, prog, extra = {}) => { const plan = { ring, origin: [-95.8245, 29.7855], front: 0, setbacks: { ...S.SETBACKS, paveFront: 10, paveSide: 5, paveRear: 5 }, program: prog, elements: [], ...extra }, opts = L.layoutOptions(plan, prog, {});
  const sig = opts.map(o => { const m = S.metrics(of(plan, o)), f = m.foodtrucks; assert.ok(f.restroomSf > 0 && o.elements.some(e => e.name === 'Restrooms'), 'restrooms in ' + o.name + ' (' + JSON.stringify(ring[2]) + ')'); return { n: f.trucks, seats: f.seats, bar: f.barSf > 0, pond: m.pond > 0 }; });
  sig.forEach((a, i) => sig.slice(0, i).forEach((b, j) => assert.ok(!(a.n === b.n && a.bar === b.bar && a.pond === b.pond && Math.abs(a.seats - b.seats) <= 0.1 * Math.max(a.seats, b.seats)), 'options ' + j + ' and ' + i + ' are the same choice: ' + JSON.stringify([b, a]))));
  return { plan, opts }; };
const touches = (a, b, g = 1.5) => S.rectsOverlap({ poly: S.grow(S.shapeOf(a), g) }, { poly: S.shapeOf(b) }, 0);
function sound(name, plan, o) {
  const pl = of(plan, o), els = pl.elements, issues = S.check(pl), bad = issues.filter(i => i.level === 'bad');
  assert.equal(bad.length, 0, name + ': passes the checks: ' + bad.map(i => i.text).join('; '));
  assert.ok(!issues.some(i => /is at the mouth of|has no aisle|dead-ends/.test(i.text)), name + ': no stalls at an entrance’s mouth, every row on an aisle: ' + issues.map(i => i.text).join('; '));
  const lane = els.find(e => e.name === 'Service lane'), trucks = els.filter(e => e.kind === 'foodtruck'), pav = els.find(e => e.kind === 'building' && e.ft === 'pavilion');
  assert.ok(lane && trucks.length, name + ': a service lane and truck stalls');
  for (const t of trucks) {
    assert.ok(touches(t, lane), name + ': ' + t.name + ' is on the service lane');
    assert.ok(Math.abs(t.w - 35) < 0.01 && Math.abs(t.d - 15) < 0.01, name + ': a 15 × 35 ft stall');
    assert.ok(!els.some(e => e.kind === 'parking' && S.rectsOverlap(t, e, 0)), name + ': no stall on the parking');
    if (pav) { const face = S.rotPt([0, -1], t.rot || 0); assert.ok(face[0] * (pav.x - t.x) + face[1] * (pav.y - t.y) > 0, name + ': ' + t.name + '’s serving window faces the seating'); }
    const q = S.truckParts(t), c = S.centroid(q.body); assert.ok(S.inRing(c, S.corners(t)), name + ': the truck sits on its pad');
  }
  // everything paved is reached from a way in (the checks dropped anything cut off; nothing should have been)
  const ways = S.entrancesOf(els); assert.ok(ways.some(e => e.name === 'Main entry'), name + ': a main entry');
  const net = els.filter(e => e.kind === 'drive'), seen = new Set(ways); for (let k = 0; k < 6; k++) for (const d of net) if (!seen.has(d) && [...seen].some(s => touches(s, d, 2))) seen.add(d);
  assert.equal(seen.size, net.length, name + ': every drive is reached from an entrance');
  const tr = els.filter(e => e.kind === 'trash'); assert.equal(tr.length, 1, name + ': a dumpster and grease enclosure'); assert.ok(touches(tr[0], lane, 2), name + ': its gate on the lane');
  return S.metrics(pl);
}
const ftOf = ask => S.normalizeProgram(S.guessProgram(ask));
// 2.5 acres: 12 trucks, a pavilion, restrooms, a small bar
{ const { plan, opts } = lot([[0, 0], [330, 0], [334, 330], [4, 328]], ftOf(ASK));
  assert.ok(opts.length >= 2, 'several layouts');
  for (const [i, o] of opts.entries()) {
    const m = sound('2.5 ac #' + i, plan, o), f = m.foodtrucks;
    assert.ok(f.trucks === 12 || o.notes.some(n => /of the 12 food trucks asked for/.test(n)), 'the trucks asked for, or it says how many fit');
    assert.equal(m.required, Math.ceil(f.trucks * 5 + f.barSf / 1000 * 8 - 0.01), 'parking: 5 a truck plus the bar');
    assert.equal(f.seats, Math.floor((f.pavilionSf + f.patioSf) / 15), 'seats: 15 sf of covered and patio seating each');
  }
  // the count asked for comes first (parked); a layout keeping detention in a pond is always among the choices
  const m0 = S.metrics(of(plan, opts[0])); assert.ok(m0.foodtrucks.trucks === 12 && m0.spaces >= m0.required, 'recommended: the 12 trucks asked for, parked: ' + m0.foodtrucks.trucks + ' trucks');
  assert.ok(opts.some(x => S.metrics(of(plan, x)).pond > 0), 'a pond layout among the choices');
  const o = opts.find(x => S.metrics(of(plan, x)).foodtrucks.trucks === 12), pl = of(plan, o), m = S.metrics(pl);
  assert.ok(o, 'a layout with the 12 trucks'); assert.ok(m.spaces >= m.required, 'and parks them: ' + m.spaces + '/' + m.required);
  assert.ok(m.foodtrucks.pavilionSf >= 2900 && m.foodtrucks.barSf >= 1400 && m.foodtrucks.restroomSf >= 600, 'pavilion, bar and restrooms: ' + JSON.stringify(m.foodtrucks));
  assert.ok(o.elements.some(e => e.kind === 'patio' && e.name === 'Beer garden') && o.elements.some(e => e.kind === 'play'), 'a beer garden and a playground');
  assert.deepEqual(['Pavilion', 'Restrooms', 'Bar'].filter(n => o.elements.some(e => e.name === n)), ['Pavilion', 'Restrooms', 'Bar'], 'named parts');
  assert.ok(new Set(o.elements.filter(e => e.kind === 'foodtruck').map(e => e.name)).size === 12, 'trucks numbered');
  // customers park on the street side: every stall row is nearer the street than any truck
  const fr = S.outwardOf(plan.ring, 0), back = e => -(e.x * fr[0] + e.y * fr[1]);
  assert.ok(Math.max(...o.elements.filter(e => e.kind === 'parking').map(back)) < Math.min(...o.elements.filter(e => e.kind === 'foodtruck').map(back)), 'the parking is on the street side, the trucks behind');
  const k = keyItems(pl); assert.ok(k.uses[0] === 'foodtrucks' && k.kinds.includes('foodtruck'), 'the plan key lists the park and the truck stalls'); assert.match(keyHtml(pl), /Food truck stall/);
  assert.match(headline(m, null, null).sub, /^12 food trucks · ~\d+ seats/, 'the layout card leads with trucks and seats');
  const lab = S.labelOf(o.elements.find(e => e.ft === 'pavilion'), pl.program); assert.match(lab.size, /^~\d+ seats · /, 'the pavilion is labelled with its seats');
  const svg = planSVG(pl).svg; assert.ok(svg.includes('#e9b44c') && svg.includes('#9c4f6b'), 'the PDF sheet draws stalls and the park’s buildings');
  assert.match(sheetHTML({ plan: pl, project: { name: 'FT' }, metrics: m }), /12 Trucks/, 'the sheet’s glance box');
  const fc = S.planFeatures(pl, null); assert.equal(fc.features.filter(f => f.properties.k === 'ftbody').length, 12, 'a truck drawn on each stall (3D)'); assert.equal(fc.features.filter(f => f.properties.k === 'pedestal').length, 12, 'and its pedestal');
  // pro forma: stall rent and the bar, the park's costs, nothing undefined
  const r = PF.run(pl, PF.defaults(pl)), op = r.ops;
  assert.ok(op.lines.some(l => /12 food truck stalls @ \$1,200\/mo/.test(l.k)) && op.lines.some(l => /Bar run by the owner/.test(l.k)), 'stall rent and the owner-run bar: ' + op.lines.map(l => l.k).join(' | '));
  assert.ok(Number.isFinite(op.noi) && op.noi > 0 && op.opex > 60000, 'a positive NOI after the park’s costs');
  const r2 = PF.run(pl, { ...PF.defaults(pl), ft: { ...PF.FT_PF, barMode: 'lease', stallRent: 1500 } });
  assert.ok(r2.ops.lines.some(l => /sf bar leased @ \$30\/sf NNN/.test(l.k)) && r2.ops.lines.some(l => /@ \$1,500\/mo/.test(l.k)), 'the bar leased instead, a higher stall rent');
  assert.ok(r.budget.site > PF.run({ ...pl, elements: pl.elements.filter(e => e.kind !== 'foodtruck') }, PF.defaults(pl)).budget.site, 'stall pads and hookups are in the site cost');
  const b = R.briefOf(pl, { metrics: m }); assert.equal(b.foodTrucks, 12); assert.match(R.renderPrompt(b), /12 food trucks parked on concrete pads/); assert.match(R.renderPrompt({ ...b, look: 'auto' }), /food truck park: colourful food trucks/);
}
// bar switched off, playground off: neither drawn, and the parking drops by the bar's share
{ const p = S.normalizeProgram({ use: 'foodtrucks', foodtrucks: { trucks: 10, bar: false, playground: false } }), { plan, opts } = lot([[0, 0], [330, 0], [334, 330], [4, 328]], p);
  for (const [i, o] of opts.entries()) { const m = sound('no bar #' + i, plan, o); assert.ok(!o.elements.some(e => e.ft === 'bar' || e.kind === 'patio' || e.kind === 'play'), 'no bar, no beer garden, no playground'); assert.equal(m.required, m.foodtrucks.trucks * 5); } }
// a narrow, deep lot (200 × 560 ft): the trucks down both long sides
{ const { plan, opts } = lot([[0, 0], [200, 0], [205, 560], [0, 550]], ftOf(ASK));
  assert.ok(opts.length >= 1, 'narrow: layouts');
  for (const [i, o] of opts.entries()) sound('narrow #' + i, plan, o);
  assert.equal(S.metrics(of(plan, opts[0])).foodtrucks.trucks, 12, 'narrow: the 12 trucks fit'); }
// a corner lot: a side street on the left (edge 3), so the lane gets its own service entry; no third driveway
{ const { plan, opts } = lot([[0, 0], [330, 0], [334, 330], [4, 328]], ftOf(ASK), { streets: [3] });
  for (const [i, o] of opts.entries()) { sound('corner #' + i, plan, o); const ways = S.entrancesOf(o.elements);
    assert.ok(ways.some(e => e.name === 'Service entry'), 'corner #' + i + ': a service entry for the trucks'); assert.equal(ways.length, 2, 'corner #' + i + ': two ways in, not three');
    const se = o.elements.find(e => e.name === 'Service entry'), a = plan.ring[3], bb = plan.ring[0]; assert.ok(S.shapeOf(se).some(p => S.segDist(p, a, bb) < 3), 'it meets the side street');
    assert.ok(o.notes.some(n => /own service entry on the side street/.test(n))); } }
// 19730 FM 362, Waller (8 sides, a notch on the east; FM 362 on the west, edge 7): as many trucks as fit
{ const ring = [[-441.8, -191.92], [475.3, -185.63], [474.61, -55.83], [354.06, -58.81], [353.81, 31.2], [474.04, 34.19], [472.83, 185.77], [-446.13, 190.03]];
  const { plan, opts } = lot(ring, ftOf('a food truck park'), { front: 7 });
  assert.ok(opts.length >= 2);
  for (const [i, o] of opts.entries()) { const m = sound('FM 362 #' + i, plan, o); assert.ok(m.foodtrucks.trucks >= 15, 'as many as fit: ' + m.foodtrucks.trucks); assert.ok(m.spaces >= m.required, 'as many as the parking carries: ' + m.spaces + '/' + m.required); } }
// 1.5 acres: fewer trucks fit, and it says so
{ const { plan, opts } = lot([[0, 0], [260, 0], [262, 250], [0, 252]], ftOf('food truck park with 8 trucks'));
  assert.ok(opts.length >= 1, '1.5 ac: layouts');
  for (const [i, o] of opts.entries()) { const m = sound('1.5 ac #' + i, plan, o); if (m.foodtrucks.trucks < 8) assert.ok(o.notes.some(n => /of the 8 food trucks asked for/.test(n))); if (m.spaces < m.required) assert.ok(o.notes.some(n => /Parking is/.test(n))); } }
// small lots with the app's default setbacks (10 ft buffers all round): the trucks come first, so the bar shrinks or goes
// (its switch stays on) and the seating area gets smaller, and every layout is fully parked
const SB0 = { setbacks: { front: 25, side: 10, rear: 20, paving: 10 } }, best = {};
for (const [name, ring] of [['1 ac', [[0, 0], [210, 0], [210, 205], [0, 205]]], ['1.5 ac', [[0, 0], [260, 0], [262, 250], [0, 252]]]]) for (const ask of ['a food truck park', 'a food truck park with 6 trucks', ASK]) {
  const p = ftOf(ask), { plan, opts } = lot(ring, p, SB0), tag = name + ' / ' + ask;
  assert.ok(opts.length >= 2, tag + ': layouts (as many as fit used to give none)');
  for (const [i, o] of opts.entries()) { const m = sound(tag + ' #' + i, plan, o); assert.ok(m.spaces >= m.required, tag + ' #' + i + ': fully parked: ' + m.spaces + '/' + m.required);
    if (m.foodtrucks.barSf < (p.foodtrucks.barSf || 0) * 0.97) assert.ok(o.notes.some(n => /bar/i.test(n)), tag + ' #' + i + ': says what happened to the bar');
    if (/pond/.test(o.name)) assert.ok(m.pond > 0, tag + ' #' + i + ': named for a pond it has'); }
  const m = S.metrics(of(plan, opts[0])); best[name] = Math.max(best[name] || 0, m.foodtrucks.trucks);
  assert.ok(m.foodtrucks.trucks >= (name === '1 ac' ? 4 : 5), tag + ': the recommended layout holds ' + m.foodtrucks.trucks + ' trucks');
  assert.ok(m.foodtrucks.seats >= 60, tag + ': a covered pavilion, smaller: ~' + m.foodtrucks.seats + ' seats');
  assert.equal(opts[0].program.foodtrucks.bar, true, tag + ': the bar switch stays on');
  assert.ok(m.foodtrucks.restroomSf >= 400, tag + ': restrooms: ' + m.foodtrucks.restroomSf);
}
assert.ok(best['1.5 ac'] > best['1 ac'], '1.5 acres holds more trucks than 1: ' + JSON.stringify(best));
// 2.5 acres, as many as fit: the most trucks that still keep half the detention on the surface first (10), a pond option too
{ const { plan, opts } = lot([[0, 0], [330, 0], [334, 330], [4, 328]], ftOf('a food truck park'), SB0), ms = opts.map(o => S.metrics(of(plan, o)));
  for (const [i, o] of opts.entries()) sound('2.5 ac fit #' + i, plan, o);
  assert.ok(ms[0].foodtrucks.trucks >= 10 && ms[0].spaces >= ms[0].required && ms[0].pond > 0, '2.5 ac as many as fit: ' + ms.map(m => m.foodtrucks.trucks + (m.pond > 0 ? ' with a pond' : '')).join(', '));
  assert.ok(ms.every(m => m.foodtrucks.trucks >= 6 && m.spaces >= m.required), 'every option a real park, parked'); }
// narrow, deep lots (150 and 180 ft wide, ~900 ft deep): too narrow for trucks on both sides, so they run down one long
// side (they used to get one back row of 2 trucks, or nothing at 150 ft)
for (const [wd, ring] of [[180, [[0, 0], [180, 0], [185, 900], [0, 890]]], [150, [[0, 0], [150, 0], [155, 900], [0, 890]]]]) for (const ask of ['a food truck park', ASK]) {
  const { plan, opts } = lot(ring, ftOf(ask), SB0), tag = wd + ' ft deep / ' + ask, ms = opts.map(o => S.metrics(of(plan, o)));
  assert.ok(opts.length >= 2, tag + ': layouts');
  for (const [i, o] of opts.entries()) { sound(tag + ' #' + i, plan, o); assert.ok(ms[i].spaces >= ms[i].required, tag + ' #' + i + ': parked ' + ms[i].spaces + '/' + ms[i].required); assert.ok(ms[i].foodtrucks.trucks >= 8, tag + ' #' + i + ': ' + ms[i].foodtrucks.trucks + ' trucks'); }
  assert.ok(ms[0].foodtrucks.trucks >= (ask === ASK ? 12 : 10), tag + ': the recommended layout holds ' + ms[0].foodtrucks.trucks);
  assert.equal(opts[0].name.split(' · ')[0].replace(/^Layout \d+ · /, ''), 'Trucks down one side', tag);
}
// a re-fit keeps a stall and the pavilion where they were put by hand
{ const { plan, opts } = lot([[0, 0], [330, 0], [334, 330], [4, 328]], ftOf(ASK)), o = opts[0];
  const els = o.elements.map(e => e.kind === 'foodtruck' && e.name === 'Truck 1' || e.ft === 'pavilion' ? { ...e, pinned: true } : { ...e }), pins = els.filter(e => e.pinned);
  const r = L.refit({ ...plan, program: o.program, elements: els, recipe: o.recipe }); assert.ok(r && r.elements.length, 'a re-fit');
  for (const p of pins) assert.ok(r.elements.some(e => e.id === p.id && e.x === p.x && e.y === p.y), 'the pinned ' + (p.name || p.kind) + ' stays put');
  assert.equal(S.check({ ...plan, program: o.program, elements: r.elements }).filter(i => i.level === 'bad').length, 0, 'the re-fit passes the checks'); }

// ---------- read-out, AI, library, geometry ----------
{ const p = ftOf(ASK); assert.deepEqual(readAs(p, S.USES), ['Food truck park', '12 trucks', '3,000 sf pavilion', '1,500 sf bar', 'Playground', '5/truck parking']);
  assert.deepEqual(notUnderstood('a food truck park with 12 trucks and a 1,500 sf bar', p), [], 'the bar’s size is understood'); }
{ const lib = BUILDING_TYPES.filter(t => t.group === 'Food trucks'); assert.ok(lib.length >= 9 && lib.every(t => t.use === 'foodtrucks' && t.ft));
  assert.deepEqual([...new Set(lib.map(t => t.ft))].sort(), ['bar', 'pavilion', 'restroom']); const e = fromType(lib.find(t => t.ft === 'bar'), [0, 0]); assert.equal(e.ft, 'bar'); assert.equal(S.ftKind(e), 'bar');
  assert.equal(S.metrics({ ring: [[0, 0], [400, 0], [400, 400], [0, 400]], program: { use: 'foodtrucks' }, elements: [{ ...e, id: 'b' }, { ...fromType(lib.find(t => t.ft === 'pavilion'), [200, 200]), id: 'p' }] }).required, Math.ceil(e.w * e.d / 1000 * 8 - 0.01), 'only the bar needs parking of the buildings'); }
assert.equal(S.ftKind({ name: 'Beer garden bar' }), 'bar', 'older plans: the part from the name');
{ const t = { kind: 'foodtruck', x: 0, y: 0, w: 35, d: 15, rot: 0 }, q = S.truckParts(t); assert.ok(q.window[0][1] < 0 && Math.max(...q.body.map(p => p[1])) <= 7.5, 'the window on the −v side (the seating), the truck against the +v side (the lane)'); }
{ const fetch0 = globalThis.fetch; let sent = null;
  globalThis.fetch = async (url, opts = {}) => { if (String(url).includes('/models/')) return Response.json({ id: 'm' }); sent = JSON.parse(opts.body);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ use: 'foodtrucks', gfa: null, floors: null, units: null, buildings: null, ratio: null, perUnit: null, depth: null, detentionPct: null, storm: null, truck: null, through: null, compare: null, trash: null, entrances: null, product: null, extras: [], storage: { climateSf: null, driveSf: null, rv: null },
      foodtrucks: { trucks: null, pavilionSf: 3500, bar: null, barSf: null, playground: null, perTruck: null }, setbacks: { front: null, side: null, rear: null, paving: null }, zones: [], summary: 'A food truck park.', assumptions: [] }) } }] }); };
  const { default: handler, SCHEMA, SYSTEM } = await import('../api/siteplan.js');
  const strict = (sc, at) => { if (sc?.type === 'object' && sc.properties) { assert.deepEqual(sc.required.slice().sort(), Object.keys(sc.properties).sort(), 'strict schema: ' + at); for (const [k, v] of Object.entries(sc.properties)) strict(v, at + '.' + k); } if (sc?.items) strict(sc.items, at + '[]'); };
  strict(SCHEMA, 'program'); assert.ok(SCHEMA.properties.use.enum.includes('foodtrucks')); assert.match(SYSTEM, /food truck park/i); assert.match(SYSTEM, /beer garden/);
  process.env.OPENAI_API_KEY = 'sk-test'; const res = { code: 200, status(c) { res.code = c; return res; }, json(o) { res.body = o; return res; }, setHeader() {} };
  await handler({ method: 'POST', body: { prompt: ASK, site: { acres: 2.5 } }, headers: { 'x-forwarded-for': '7.7.9.1' } }, res);
  assert.equal(res.code, 200); const p = res.body.program; assert.equal(p.use, 'foodtrucks'); assert.equal(p.foodtrucks.trucks, 12, 'the words fill what the model left open'); assert.equal(p.foodtrucks.pavilionSf, 3500, 'the model’s own numbers win'); assert.equal(p.foodtrucks.barSf, 1500); assert.ok(!p.zones, 'one use');
  globalThis.fetch = fetch0; delete process.env.OPENAI_API_KEY; }
console.log('food trucks ok');
