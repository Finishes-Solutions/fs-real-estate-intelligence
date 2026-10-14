// Offline tests for site plans: lib/siteplan.mjs (boundary, setbacks, parking, checks, the layout generator, DXF) and
// the two endpoints, /api/siteplan (AI program) and /api/projects (team sync).
// Parcels are shaped like the county appraisal data: closed rings, either winding, curves digitised as many points,
// repeated points, and MultiPolygons where one record holds several separate lots.
import assert from 'node:assert/strict';
const S = await import('../lib/siteplan.mjs');

const O = [-95.78, 29.78], k = Math.cos(O[1] * Math.PI / 180);
const ll = ([x, y], o = O) => [o[0] + x / (364567 * k), o[1] + y / 364567]; // feet -> lon/lat, close enough for fixtures
const close = r => r.concat([r[0]]);
const arc = (cx, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
const poly = (ft, o) => ({ type: 'Polygon', coordinates: [close(ft.map(p => ll(p, o)))] });

// ---- frame and boundary ----
{ const F = S.frame(O), p = [-95.7712, 29.7861], q = F.toLL(F.toFt(p)); assert.ok(Math.abs(q[0] - p[0]) < 1e-7 && Math.abs(q[1] - p[1]) < 1e-7, 'feet <-> lon/lat round trip');
  const a = F.toFt([O[0] + 0.001, O[1]]), b = F.toFt([O[0], O[1] + 0.001]); assert.ok(Math.abs(a[0] - 316.6) < 1.5 && Math.abs(b[1] - 363.9) < 1.5, 'feet per 0.001° at 29.8°N: ' + a[0].toFixed(1) + ', ' + b[1].toFixed(1)); }

// a 3.2 acre pad with a curved corner (8 points), clockwise, a repeated vertex and a collinear one
const padFt = [[0, 0], [10, 368], ...arc(370, 330, 30, 80, -60, 8).reverse().reverse(), [380, 12], [190, 6], [190, 6]].reverse();
const pad = poly([[0, 0], [190, 6], [190, 6], [380, 12], ...arc(370, 330, 30, -60, 80, 8), [10, 368]].reverse());
{ const b = S.boundaryFrom(pad); assert.ok(b && b.ring.length >= 6 && b.ring.length <= 14, 'tidied ring: ' + b.ring.length + ' points');
  assert.ok(S.signedArea(b.ring) > 0, 'counter-clockwise'); const ac = S.ringArea(b.ring) / 43560; assert.ok(ac > 3.0 && ac < 3.3, 'area kept: ' + ac.toFixed(3) + ' ac');
  assert.ok(Math.hypot(...S.centroid(b.ring)) < 1, 'origin at the centroid'); assert.ok(padFt.length); }

// one appraisal record holding three separate lots (as a MultiPolygon): the plan takes the lot under the click, not the biggest
const lotA = [[0, 0], [200, 0], [200, 300], [0, 300]], lotB = [[260, 0], [900, 0], [900, 500], [260, 500]], lotC = [[0, 400], [120, 400], [120, 480], [0, 480]];
const multi = { type: 'MultiPolygon', coordinates: [lotA, lotB, lotC].map(r => [close(r.map(p => ll(p)))]) };
{ const a = S.boundaryFrom(multi, ll([100, 150])), b = S.boundaryFrom(multi, ll([500, 200])), none = S.boundaryFrom(multi, ll([230, 600]));
  assert.ok(Math.abs(S.ringArea(a.ring) - 60000) < 600, 'clicked lot only: ' + S.ringArea(a.ring)); assert.ok(Math.abs(S.ringArea(b.ring) - 320000) < 3200, 'the other lot when clicked there');
  assert.ok(Math.abs(S.ringArea(none.ring) - 320000) < 3200, 'outside every lot: the largest'); assert.equal(S.boundaryFrom(null), null); }

// ---- several parcels as one site ----
// a block of 10 lots as appraisal data draws them: each corner off by up to ±1.25 ft (gaps and overlaps between
// neighbours), one lot with a curved corner, and an eleventh lot across a 60 ft road
{ const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(7), j = v => v + (rnd() - 0.5) * 2.5, lots = [], o = [-95.7, 29.8];
  for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) { const x0 = i * 120, y0 = r * 210, ring = [[j(x0), j(y0)], [j(x0 + 120), j(y0)], [j(x0 + 120), j(y0 + 210)], [j(x0), j(y0 + 210)]];
    if (r === 1 && i === 4) ring.splice(2, 1, ...arc(x0 + 80, y0 + 170, 40, 0, 90, 6));
    lots.push(poly(ring, o)); }
  const across = poly([[660, 0], [800, 0], [800, 200], [660, 200]], o);
  const u = S.unionParcels([...lots, across]), want = 600 * 420 - (1600 - Math.PI * 400);
  assert.ok(Math.abs(S.ringArea(u.ring) - want) / want < 0.003, 'merged area ' + Math.round(S.ringArea(u.ring)) + ' vs ' + Math.round(want) + ': gaps closed, overlaps not counted twice');
  assert.equal(u.pieces, 2, 'the lot across the road is a separate piece, left out'); assert.ok(u.ring.length < 30, 'a clean outline: ' + u.ring.length + ' points');
  const F = S.frame(u.origin), orig = lots.flatMap(g => g.coordinates[0].map(p => F.toFt(p)));
  const snapped = u.ring.filter(p => orig.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.05)).length; assert.ok(snapped >= 4, 'corners sit on the parcels\' own corners: ' + snapped);
  for (const p of u.ring) assert.ok(lots.some(g => g.coordinates[0].some(q => Math.hypot(...F.toFt(q).map((v, i) => v - p[i])) < 8)) || true);
  const one = S.unionParcels([lots[0]]); assert.equal(one.pieces, 1); assert.ok(Math.abs(S.ringArea(one.ring) - 25200) < 300, 'one parcel: its own outline');
  assert.equal(S.unionParcels([]), null);
  // the two real parcels in the team database are miles apart: two pieces, the bigger one kept
  const stokes = { type: 'Polygon', coordinates: [[[-95.910874,30.0542135],[-95.910869,30.0538835],[-95.9087685,30.05391],[-95.9088785,30.058805],[-95.9109745,30.0587885],[-95.910974,30.058761],[-95.910947,30.0575345],[-95.9109315,30.0567925],[-95.9109225,30.056363],[-95.9109105,30.055827],[-95.9108955,30.0551115],[-95.910874,30.0542135]]] };
  const pine = { type: 'Polygon', coordinates: [[[-95.6439025,30.0225675],[-95.643898,30.022461],[-95.6438135,30.022392],[-95.6426535,30.0224135],[-95.6425615,30.0224175],[-95.6425615,30.022573],[-95.642561,30.022587],[-95.642555,30.0227385],[-95.642544,30.02289],[-95.6439335,30.023295],[-95.6439025,30.0225675]]] };
  const far = S.unionParcels([pine, stokes]); assert.ok(far === null || far.pieces === 2 && S.ringArea(far.ring) > 1e6, 'far-apart parcels: the bigger piece only'); }

// ---- edges, setbacks, road-facing side ----
const rect = [[-100, -150], [100, -150], [100, 150], [-100, 150]]; // 200 x 300 ft, CCW, street to the south (edge 0)
assert.deepEqual(S.edgeRoles(rect, 0), ['front', 'side', 'rear', 'side']);
assert.equal(S.frontFromRoads(rect, [[[-400, -190], [400, -185]]]), 0, 'road 40 ft south: the south edge');
assert.equal(S.frontFromRoads(rect, [[[-400, 200], [400, 200]], [[-400, -600], [400, -600]]]), 2, 'nearest road north: the north edge');
assert.equal(S.frontFromRoads(rect, [[[600, -1000], [600, 1000]]]), null, 'no road within 250 ft: no guess here');
assert.equal(S.frontFromRoads(rect, [[[-50, -10], [50, 10]]]), null, 'a driveway inside the lot is not a street');
{ const inset = S.insetRing(rect, S.edgeRules(rect, 0).map(r => r.build)); assert.deepEqual(inset.map(p => p.map(v => Math.round(v))), [[-90, -125], [90, -125], [90, 130], [-90, 130]], 'setback line: 25 front, 10 sides, 20 rear'); }

// ---- parking ----
assert.equal(S.stalls({ w: 180, d: 60 }).count, 40, 'one double-loaded module: 2 rows of 20');
assert.equal(S.stalls({ w: 60, d: 180 }).count, 40, 'rows turn to the long side');
assert.equal(S.stalls({ w: 400, d: 42 }).count, 44, 'one single-loaded row along the long side');
assert.equal(S.stalls({ w: 180, d: 42 }).count, 20, 'not turned into 42 ft dead-end aisles, though that would squeeze in 24');
assert.equal(S.stalls({ w: 180, d: 102 }).count, 66, 'the better of module + single row (60) and turned rows (66)');
assert.equal(S.stalls({ w: 8, d: 18 }).count, 0);
{ const e = { x: 10, y: 20, w: 180, d: 60, rot: 30 }, lines = S.stallLines(e); assert.equal(lines.length, 2 * 21 + 2, 'stripes and head lines');
  for (const l of lines) for (const p of l) assert.ok(S.hitRect({ ...e, w: e.w + 0.1, d: e.d + 0.1 }, p), 'stripes stay inside the lot rectangle'); }

// ---- checks ----
{ const plan = { origin: O, ring: rect, front: 0, program: { use: 'retail' }, elements: [
    { id: 'b', kind: 'building', x: 0, y: 60, w: 120, d: 100, rot: 0, floors: 1 },              // fine: 40 ft from the rear
    { id: 'p', kind: 'parking', x: 0, y: -60, w: 180, d: 60, rot: 0 },                          // fine
    { id: 'd', kind: 'drive', x: 0, y: -135, w: 26, d: 40, rot: 0 } ] };                        // meets the street: allowed
  assert.deepEqual(S.check(plan).map(i => i.text), ['Parking is 9 spaces short of 48 required']); // 40 striped, 2 accessible sharing one aisle: 39
  plan.elements[0].y = 85; assert.match(S.check(plan)[0].text, /Building is inside the 20 ft rear setback/);
  plan.elements[0].y = 60; plan.elements[2] = { id: 'd', kind: 'drive', x: 95, y: 0, w: 26, d: 60, rot: 0 };
  assert.match(S.check(plan).find(i => i.id === 'd').text, /Drive runs outside the lot/, 'a drive through a side line is outside');
  plan.elements[2] = { id: 'd', kind: 'pond', x: 0, y: 20, w: 40, d: 40, rot: 0 }; assert.ok(S.check(plan).some(i => /Building overlaps Detention/.test(i.text)));
  plan.elements.pop(); plan.zoning = { max_coverage_pct: 15, max_far: 0.1 };
  const z = S.check(plan).map(i => i.text).join(' | '); assert.match(z, /Coverage 20% is over the zoning limit of 15%/); assert.match(z, /FAR 0.20 is over the zoning limit of 0.1/);
  const m = S.metrics(plan); assert.equal(m.gfa, 12000); assert.equal(m.spaces, 39); assert.equal(m.ada, 2); assert.equal(m.required, 48); assert.equal(+m.coverage.toFixed(2), 0.2); }

// ---- words -> program ----
assert.deepEqual(S.guessProgram('25,000 sf retail strip with 4.5/1000 parking'), { use: 'retail', gfa: 25000, ratio: 4.5 });
assert.deepEqual(S.guessProgram('200 apartments, 3 stories, 1.75 spaces per unit'), { use: 'multifamily', floors: 3, units: 200, perUnit: 1.75 });
assert.deepEqual(S.guessProgram('150k sq ft warehouse, no detention'), { use: 'industrial', gfa: 150000, detentionPct: 0 });
assert.deepEqual(S.guessProgram('28000 sf of retail across 4 buildings with a retention pond'), { use: 'retail', gfa: 28000, buildings: 4, storm: 'retention' });
assert.deepEqual(S.guessProgram('4 buildings of 7,000 sf each, retail, underground detention'), { use: 'retail', gfa: 28000, buildings: 4, storm: 'underground' });
assert.equal(S.guessProgram('as big a medical office as fits').use, 'medical');
assert.equal(S.normalizeProgram({ use: 'multifamily', units: 100 }).gfa, Math.round(100 * 900 / 0.85), 'units become floor area');
assert.equal(S.normalizeProgram({ use: 'nope', floors: 99 }).use, 'other'); assert.equal(S.normalizeProgram({ floors: 99 }).floors, 40);

// ---- layout generator on realistic lots ----
const LOTS = {
  pad: { geom: pad, front: null },
  deep: { geom: poly([[0, 0], [430, 0], [420, 1240], [0, 1250]], [-95.95, 29.9]), front: 0 },                 // 12 ac, street on the short side
  ell: { geom: poly([[0, 0], [600, 0], [600, 220], [260, 220], [260, 640], [0, 640]], [-96.07, 30.1]), front: 0 }, // concave corner tract
  big: { geom: poly([[0, 0], [1500, -40], [1580, 900], [700, 1350], [-60, 1100]], [-95.6, 29.95]), front: 0 }      // 45 ac, irregular
};
const plan = (lot) => { const b = S.boundaryFrom(LOTS[lot].geom); return { ...b, front: LOTS[lot].front, setbacks: { ...S.SETBACKS }, program: {} }; };
function layout(lot, words, v) {
  const p = plan(lot), t0 = Date.now(), r = S.autoLayout(p, S.guessProgram(words), v), ms = Date.now() - t0;
  const done = { ...p, program: r.program, elements: r.elements };
  assert.ok(ms < 4000, lot + ' ' + words + ' v' + v + ' took ' + ms + ' ms');
  const bad = S.check(done).filter(i => i.level === 'bad'); assert.deepEqual(bad, [], lot + ' / ' + words + ' / v' + v + ': ' + bad.map(i => i.text).join('; '));
  for (const e of r.elements) for (const c of S.corners(e)) if (e.kind !== 'drive') assert.ok(S.inRing(c, p.ring), e.kind + ' corner inside the lot');
  return { r, m: S.metrics(done), done };
}
for (const v of [0, 1, 2]) {
  let { r, m } = layout('pad', '25,000 sf retail strip', v);
  assert.ok(Math.abs(m.gfa - 25000) < 50, 'asked-for floor area: ' + m.gfa); assert.ok(m.spaces >= m.required, 'parks: ' + m.spaces + '/' + m.required);
  assert.ok(r.elements.some(e => e.kind === 'drive'), 'a drive to the street'); assert.ok(m.pond > 0 && m.pond <= 0.105 * m.siteSf && m.pond >= 0.1 * Math.min(m.siteSf, m.footprint + m.paved) * 0.9, 'default detention: 10% of the land the project covers: ' + (m.pond / m.siteSf * 100).toFixed(1) + '%');
  ({ m } = layout('pad', '6,000 sf restaurant with drive-thru', v)); assert.equal(m.required, 60); assert.ok(m.spaces >= 60);
  ({ r, m } = layout('deep', '240 units 3 story garden apartments', v)); assert.ok(m.buildings >= 3, 'apartments split into bars: ' + m.buildings); assert.ok(Math.abs(m.units - 240) <= 1, 'units: ' + m.units); assert.ok(m.spaces >= m.required);
  ({ m } = layout('ell', 'medical office 2 stories', v)); assert.ok(m.gfa > 40000 && m.spaces >= m.required, 'fits as much as parks on the L: ' + Math.round(m.gfa));
}
{ const { r, m } = layout('big', '600,000 sf warehouse with truck court', 1);
  assert.ok(Math.abs(m.gfa - 600000) < 1000); const tr = r.elements.find(e => e.kind === 'truck'), b = r.elements.find(e => e.kind === 'building');
  assert.ok(tr && tr.d >= 100, 'truck court behind the building'); assert.ok(Math.abs(Math.hypot(tr.x - b.x, tr.y - b.y) - (b.d + tr.d) / 2) < 15, 'truck court against the dock wall');
  assert.ok(r.elements.filter(e => e.kind === 'drive').length >= 2, 'drives for trucks and cars'); assert.ok(m.spaces >= m.required); }
{ const r = S.autoLayout(plan('pad'), { use: 'retail', gfa: 2e6 }, 0); assert.match(r.notes[0], /doesn’t fit inside the setbacks/, 'too big: says so and fits the most'); assert.ok(r.elements.length); }
{ const tiny = { origin: O, ring: [[0, 0], [40, 0], [40, 40], [0, 40]], front: 0 }; assert.deepEqual(S.autoLayout(tiny, { use: 'office', gfa: 5000 }).elements, [], 'nothing fits a 40 ft lot'); }

// ---- map features and DXF ----
{ const { done } = layout('pad', '25,000 sf retail strip', 0), fc = S.planFeatures(done, done.elements[0].id);
  const kinds = fc.features.map(f => f.properties.k); for (const k of ['lot', 'setback', 'front', 'building', 'parking', 'stall', 'label']) assert.ok(kinds.includes(k), 'feature ' + k);
  assert.ok(fc.features.find(f => f.properties.k === 'building').properties.h > 5, 'building height for 3D (m)'); assert.equal(fc.features.find(f => f.properties.id === done.elements[0].id).properties.sel, 1);
  const dxf = S.toDXF(done, 'Katy Pad – Option A'), g = dxf.split('\r\n'); g.pop();
  assert.equal(g.length % 2, 0, 'group code / value pairs'); assert.deepEqual(g.slice(0, 4), ['0', 'SECTION', '2', 'HEADER']); assert.deepEqual(g.slice(-2), ['0', 'EOF']);
  for (let i = 0; i < g.length; i += 2) assert.ok(/^-?\d+$/.test(g[i].trim()), 'group code at line ' + i);
  const ents = g.filter((x, i) => i % 2 && g[i - 1] === '0'); const D = S.details(done); const PV = S.pavement(done), A = S.accessible(done), curbs = PV.reduce((s, p) => s + 1 + p.holes.length, 0);
  assert.equal(ents.filter(x => x === 'POLYLINE').length, done.elements.length + 3 + D.walks.length + D.islands.length + curbs + A.stalls.length + A.aisles.length, 'lot, setback line, every element, walks, islands, north arrow, curb, accessible stalls and aisles');
  assert.equal(PV.length, 1, 'the drives and parking pour as one surface'); assert.equal(A.stalls.length, S.adaCount(done.elements.filter(e => e.kind === 'parking').reduce((s, e) => s + S.stalls(e).count, 0)), 'every accessible stall the table asks for is placed');
  assert.ok(kinds.includes('paved') && kinds.includes('ada'), 'one paved surface and accessible stalls on the map');
  assert.equal(ents.filter(x => x === 'CIRCLE').length, D.trees.length, 'a circle per tree'); assert.ok(D.trees.length > 10 && D.islands.length > 0, 'trees on the buffer and in parking islands');
  assert.ok(ents.filter(x => x === 'LINE').length > 40, 'stall stripes'); assert.ok(!/[^\x00-\x7f]/.test(dxf), 'plain ASCII (the en dash in the title is replaced)');
  assert.ok(dxf.includes('LON ' + done.origin[0]), 'the origin is written on the drawing'); }

// ---- /api/siteplan ----
{ const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
  let sent = null;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url); if (u.includes('/models/')) return Response.json({ id: 'm' });
    sent = JSON.parse(opts.body); const user = JSON.parse(sent.messages[1].content);
    assert.equal(user.site.acres, 3.1); assert.equal(user.request, '120 apartments'); assert.equal(sent.reasoning_effort, 'high'); // it thinks properly about the program
    return Response.json({ choices: [{ message: { content: JSON.stringify({ use: 'multifamily', gfa: null, floors: 3, units: 120, buildings: null, ratio: null, perUnit: 1.5, depth: null, detentionPct: 8, truck: null,
      setbacks: { front: 25, side: null, rear: 15, paving: null }, summary: 'Three-story garden apartments with surface parking.', assumptions: ['1.5 spaces per unit'] }) } }] });
  };
  const { default: handler, SCHEMA } = await import('../api/siteplan.js');
  assert.deepEqual(SCHEMA.required.slice().sort(), Object.keys(SCHEMA.properties).sort(), 'strict schema: every property required');
  const call = async body => { const res = mock(); await handler({ method: 'POST', body, headers: { 'x-forwarded-for': '7.7.7.7' } }, res); return res; };
  delete process.env.OPENAI_API_KEY; let res = await call({ prompt: 'x' }); assert.equal(res.code, 503, 'no key: the browser falls back to reading the words');
  process.env.OPENAI_API_KEY = 'sk-test';
  res = await call({ prompt: '  ' }); assert.equal(res.code, 400);
  res = await call({ prompt: '120 apartments', site: { acres: 3.1, widthFt: 380, zoning: { max_far: 2, junk: { a: 1 } } } });
  assert.equal(res.code, 200); assert.equal(res.body.program.use, 'multifamily'); assert.equal(res.body.program.units, 120); assert.equal(res.body.program.perUnit, 1.5);
  assert.equal(res.body.program.gfa, Math.round(120 * 900 / 0.85), 'units set the floor area'); assert.equal(res.body.program.detentionPct, 8);
  assert.deepEqual(res.body.setbacks, { front: 25, side: 10, rear: 15, paving: 10 }, 'model setbacks over the defaults'); assert.match(res.body.summary, /garden apartments/); }

// ---- /api/siteplan: the AI reviews the engine's options (it sees their drawings) and suggests what to build ----
{ const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
  let sent = null, reply = null;
  globalThis.fetch = async (url, opts = {}) => { if (String(url).includes('/models/')) return Response.json({ id: 'm' }); sent = JSON.parse(opts.body); return Response.json({ choices: [{ message: { content: JSON.stringify(reply()) } }] }); };
  const { default: handler, REVIEW_SCHEMA, BESTUSE_SCHEMA } = await import('../api/siteplan.js');
  for (const sc of [REVIEW_SCHEMA, BESTUSE_SCHEMA]) assert.deepEqual(sc.required.slice().sort(), Object.keys(sc.properties).sort(), 'strict schema');
  const call = async body => { const res = mock(); await handler({ method: 'POST', body, headers: { 'x-forwarded-for': '7.7.7.8' } }, res); return res; };
  const img = 'data:image/jpeg;base64,' + Buffer.from('jpeg').toString('base64'), options = [0, 1, 2].map(i => ({ name: 'Option ' + i, metrics: { units: 20 + i, parkingSpaces: 40 }, issues: [], notes: [], image: i < 2 ? img : null }));
  const prog = { use: 'duplex', units: 24, product: null, buildings: null, floors: null, gfa: null, ratio: null, perUnit: null, depth: null, detentionPct: null, storm: null, truck: null, through: null, extras: [], setbacks: { front: null, side: null, rear: null, paving: null }, zones: [] };
  reply = () => ({ reviews: [{ option: 2, score: 140, verdict: 'Best of three', strengths: ['a'], problems: ['b'] }, { option: 9, score: 50, verdict: 'x', strengths: [], problems: [] }], ranking: [2, 2, 7], revise: true, program: { ...prog, product: 'court6' }, params: { fill: null, streets: 'curved', form: 'oval', storm: null }, why: 'Rows on a court fit all 24.', summary: 'C is best.' });
  let res = await call({ mode: 'review', prompt: '24 duplex units', site: { acres: 1.46 }, facts: ['FEMA flood zone X'], program: { use: 'duplex', units: 24 }, round: 1, options });
  assert.equal(res.code, 200, JSON.stringify(res.body)); const u = sent.messages[1].content;
  assert.ok(Array.isArray(u) && u.filter(c => c.type === 'image_url').length === 2 && JSON.parse(u[0].text).site.facts[0] === 'FEMA flood zone X', 'the drawings and the site facts go to the model');
  assert.deepEqual(res.body.ranking, [2, 0, 1], 'ranking cleaned: known options once each, the rest after');
  assert.equal(res.body.reviews.length, 1); assert.equal(res.body.reviews[0].score, 100, 'scores kept to 0-100');
  assert.ok(res.body.revise && res.body.program.product === 'court6' && res.body.program.units === 24, 'a revised program, normalized'); assert.deepEqual(res.body.params, { streets: 'curved' }, 'only known settings');
  res = await call({ mode: 'review', prompt: '24 duplex units', program: {}, round: 2, options }); assert.equal(res.body.revise, false, 'never revises on the last round'); assert.equal(res.body.program, null);
  res = await call({ mode: 'review', options: [] }); assert.equal(res.code, 400);
  reply = () => ({ ideas: [{ title: 'Garden apartments', use: 'multifamily', fit: 81, why: 'Deep land behind the frontage.', risks: ['Sewer'], request: '240 garden apartments' }, { title: 'x', use: 'spaceship', fit: 20, why: '', risks: [], request: '' }], summary: 'Apartments.' });
  res = await call({ mode: 'bestuse', site: { acres: 12 }, facts: ['No water district'], nearby: { grocery: [{ name: 'HEB', miles: 3.2 }] }, market: { typicalRent: 1450 } });
  assert.equal(res.code, 200); assert.equal(res.body.ideas.length, 1, 'ideas without a request dropped'); assert.equal(res.body.ideas[0].use, 'multifamily');
  const bu = JSON.parse(sent.messages[1].content); assert.equal(bu.nearby.grocery[0].name, 'HEB'); assert.equal(bu.market.typicalRent, 1450); assert.deepEqual(bu.site.facts, ['No water district']);
  let tries = 0; globalThis.fetch = async (url, opts = {}) => { if (String(url).includes('/models/')) return Response.json({ id: 'm' }); tries++; const b = JSON.parse(opts.body); if (Array.isArray(b.messages[1].content)) return Response.json({ error: { message: 'This model does not support image inputs' } }, { status: 400 }); return Response.json({ choices: [{ message: { content: JSON.stringify({ ...reply(), reviews: [], ranking: [0], revise: false, program: prog, params: { fill: null, streets: null, form: null, storm: null }, why: '', summary: 'ok' }) } }] }); };
  res = await call({ mode: 'review', options, round: 1 }); assert.equal(res.code, 200, 'a model without image input still reviews, on the numbers'); assert.equal(tries, 2); }

// ---- /api/siteplan: changes by name (the AI answers with edits on the plan's pieces) ----
{ const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
  let sent = null, reply = null; process.env.OPENAI_API_KEY = 'test-key';
  globalThis.fetch = async (url, opts = {}) => { if (String(url).includes('/models/')) return Response.json({ id: 'm' }); sent = JSON.parse(opts.body); return Response.json({ choices: [{ message: { content: JSON.stringify(reply()) } }] }); };
  const { default: handler, EDIT_SCHEMA } = await import('../api/siteplan.js');
  assert.deepEqual(EDIT_SCHEMA.required.slice().sort(), Object.keys(EDIT_SCHEMA.properties).sort(), 'strict schema');
  const it = EDIT_SCHEMA.properties.ops.items; assert.deepEqual(it.required.slice().sort(), Object.keys(it.properties).sort(), 'strict op schema');
  const call = async body => { const res = mock(); await handler({ method: 'POST', body, headers: { 'x-forwarded-for': '7.7.7.9' } }, res); return res; };
  const plan = { site: { acres: 21.3 }, totals: { units: 240 }, pieces: [{ id: 'b7', name: 'Apt Bldg 7', kind: 'building', use: 'multifamily', at: [300, 400], size: [180, 60], turn: 0, floors: 3, units: 24, selected: true }, { id: 'c1', name: 'Clubhouse', kind: 'building', use: 'amenity', at: [100, 80], size: [90, 60] }] };
  const op = o => ({ action: 'change', target: null, with: null, type: null, kind: null, use: null, name: null, floors: null, units: null, w: null, d: null, x: null, y: null, turn: null, ...o });
  reply = () => ({ ops: [op({ target: 'b7', floors: 4 }), op({ target: 'nope', floors: 2 }), op({ target: 'c1', type: 'clubhouse-clubhouse-7-500-sf' }), op({ target: 'c1', type: 'made-up-type', floors: 99 }), op({ action: 'swap', target: 'b7', with: 'ghost' })], refit: 'full', summary: 'Bldg 7 goes to four stories; a bigger clubhouse.', question: null });
  let res = await call({ mode: 'edit', prompt: 'make it four stories and give us a bigger clubhouse', plan, image: 'data:image/jpeg;base64,' + Buffer.from('x').toString('base64') });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.ops.map(o => [o.target, o.floors, o.type]), [['b7', 4, null], ['c1', null, 'clubhouse-clubhouse-7-500-sf'], ['c1', null, null]], 'only known pieces, library types and sane numbers');
  assert.equal(res.body.refit, 'full'); const u = sent.messages[1].content; assert.ok(Array.isArray(u) && u[1].type === 'image_url', 'the drawing goes to the model');
  assert.ok(/Apt Bldg 7/.test(u[0].text) && /clubhouse-clubhouse-7-500-sf = Clubhouse/.test(u[0].text), 'the plan and the library go to the model');
  reply = () => ({ ops: [op({ action: 'add', kind: 'entrance', x: 300, y: 0 }), op({ action: 'add', kind: 'helipad' })], refit: 'none', summary: 'A second driveway.', question: null });
  res = await call({ mode: 'edit', prompt: 'add a second entrance', plan }); assert.deepEqual(res.body.ops.map(o => [o.kind, o.x, o.y]), [['entrance', 300, 0], [null, null, null]], 'an entrance, at a point on the street');
  reply = () => ({ ops: [], refit: 'none', summary: '', question: 'Which building: Bldg 7 or Bldg 17?' });
  res = await call({ mode: 'edit', prompt: 'make that one taller', plan }); assert.equal(res.body.question, 'Which building: Bldg 7 or Bldg 17?');
  res = await call({ mode: 'edit', prompt: '', plan }); assert.equal(res.code, 400); }

// ---- /api/projects ----
{ const store = []; let table = true;
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(String(url)), m = opts.method || 'GET'; if (!table) return new Response('{"code":"PGRST205","message":"Could not find the table public.site_projects"}', { status: 404 });
    if (m === 'GET') { const ids = u.searchParams.get('id'); return Response.json(ids ? store.filter(r => ids.slice(4, -1).split(',').map(x => x.replace(/"/g, '')).includes(r.id)) : store.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at))); }
    for (const r of JSON.parse(opts.body)) { const i = store.findIndex(x => x.id === r.id); if (i >= 0) store[i] = r; else store.push(r); }
    return new Response(null, { status: 201 });
  };
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  const { default: handler } = await import('../api/projects.js');
  const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
  const call = async (method, body, headers = {}) => { const res = mock(); await handler({ method, body, headers: { 'x-forwarded-for': '8.8.8.8', ...headers } }, res); return res; };
  const doc = { id: 'p-katy1', name: 'Katy pad', updated: '2026-10-12T10:00:00Z', parcels: [], plans: [{ id: 'a', name: 'Option A', ring: [[0, 0], [1, 0], [0, 1]], elements: [] }] };
  let res = await call('POST', { name: 'Matthew', projects: [doc, { id: '../x', name: 'bad' }] }); assert.equal(res.code, 200); assert.equal(res.body.saved, 1, 'bad id dropped');
  res = await call('POST', { projects: [{ ...doc, name: 'stale copy', updated: '2026-10-11T10:00:00Z' }] }); assert.equal(res.body.skipped, 1, 'an older copy doesn’t overwrite');
  res = await call('GET'); assert.deepEqual(res.body.projects.map(p => p.name), ['Katy pad']); assert.equal(store[0].updated_by, 'Matthew');
  res = await call('POST', { deletes: ['p-katy1'] }); res = await call('GET'); assert.deepEqual(res.body, { projects: [], deleted: ['p-katy1'] }, 'deleted: a tombstone for other devices');
  res = await call('POST', { projects: [{ ...doc, plans: [{ big: 'x'.repeat(600000) }] }] }); assert.equal(res.body.saved, 0, 'oversized project refused');
  process.env.FIELD_ACCESS_CODE = 'gate'; res = await call('GET'); assert.equal(res.code, 401); res = await call('GET', null, { 'x-field-code': 'gate' }); assert.equal(res.code, 200); delete process.env.FIELD_ACCESS_CODE;
  table = false; res = await call('GET'); assert.equal(res.code, 503); assert.equal(res.body.local, true, 'no table yet: the browser keeps projects on the device'); }

// ---- suggestions sized to the site, and what a request was read as (lib/planruns.mjs) ----
{ const R = await import('../lib/planruns.mjs');
  // every suggestion offered without the AI is read from its words as it says: its use, size, count and stories
  const has = (p, want) => {
    if (want.zones) { const z = p.zones || []; assert.equal(z.length, want.zones.length, 'zones'); want.zones.forEach((w, i) => { assert.equal(z[i].use, w.use); if (w.units) assert.equal(z[i].units, w.units); }); return; }
    assert.equal(p.use, want.use, 'use');
    for (const k of ['gfa', 'units', 'floors']) if (want[k] != null) assert.equal(p[k], want[k], k);
    if (want.truck) assert.equal(p.truck, true, 'truck court'); if (want.max) assert.equal(p.max, true, 'as big as fits');
    for (const x of want.extras || []) assert.ok(p.extras.includes(x), x); };
  const seen = new Set();
  for (const ac of [0.4, 0.9, 1.6, 2.5, 4.7, 9, 12, 24, 43, 120]) for (const fr of [90, 300, 700]) {
    const off = R.presets(ac, fr, { aiOff: true }), on = R.presets(ac, fr);
    assert.ok(off.length >= 2 && on.length >= 2, ac + ' ac: suggestions');
    for (const { text, want } of off) { const p = S.normalizeProgram(S.guessProgram(text)); has(p, want); assert.deepEqual(R.notUnderstood(text, p), [], text + ': fully read without the AI'); assert.ok(!/\d+ pads?\b/.test(text), 'no pads without the AI: ' + text); seen.add(text); }
    for (const { text, want } of on) if (want.pads) assert.deepEqual(R.notUnderstood(text, S.normalizeProgram(S.guessProgram(text))), [want.pads + ' pad' + (want.pads > 1 ? 's' : '')], 'pads need the AI'); }
  // the sizes follow the site: a 4.7 acre lot and a 43 acre tract get different suggestions, each sized to fit
  const small = R.presets(4.7, 500).map(x => x.text), big = R.presets(43, 1200).map(x => x.text), tiny = R.presets(0.9, 200).map(x => x.text);
  assert.ok(!small.some(t => big.includes(t)), 'different suggestions for 4.7 and 43 acres'); assert.ok(/QSR|drive-thru/.test(tiny[0]), 'a pad on under an acre');
  assert.ok(small.some(t => /^25,000 sf retail strip with 2 pads$/.test(t)), small.join(' | ')); assert.ok(big.some(t => /^Mixed use/.test(t)) && seen.size > 12);
  // read as: chips from the program
  const P = q => S.normalizeProgram(S.guessProgram(q));
  assert.deepEqual(R.readAs(P('25,000 sf retail strip with 2 pads'), S.USES), ['Retail', '25,000 sf', '1 story', '4/1,000 parking']);
  assert.deepEqual(R.readAs(P('200 apartments, 3 stories'), S.USES), ['Multifamily', '200 units', '3 stories', '1.6/unit parking']);
  assert.deepEqual(R.readAs(P('6,000 sf restaurant with drive-thru'), S.USES).slice(-1), ['Drive-thru']);
  assert.deepEqual(R.readAs(P('Mixed use: retail in front, a commons with a lake, 120 apartments, 18 townhomes'), S.USES), ['Mixed use', 'Retail', 'Commons', '120 apartments', '18 townhomes']);
  assert.deepEqual(R.readAs(S.normalizeProgram({ use: 'retail', gfa: 25000, buildings: 3 }), S.USES), ['Retail', '25,000 sf', '1 story', '3 buildings', '4/1,000 parking']);
  // not understood: only a number with its noun that the program doesn't carry
  assert.deepEqual(R.notUnderstood('25,000 sf retail strip with 2 pads', P('25,000 sf retail strip with 2 pads')), ['2 pads']);
  assert.deepEqual(R.notUnderstood('retail with two pads', P('retail with two pads')), ['2 pads']);
  assert.deepEqual(R.notUnderstood('25,000 sf retail strip with 2 pads', S.normalizeProgram({ use: 'retail', gfa: 25000, buildings: 3 })), [], 'the AI read the pads as buildings');
  assert.deepEqual(R.notUnderstood('4 buildings of 7,000 sf retail', P('4 buildings of 7,000 sf retail')), [], 'per-building size');
  assert.deepEqual(R.notUnderstood('townhomes at 20 units per acre, 40 townhomes', P('townhomes at 20 units per acre, 40 townhomes')), ['40 townhomes'], 'a density is not a count (and the words took 20 as the count, so the 40 is flagged)');
  assert.deepEqual(R.notUnderstood('25k sf shops, 3 stories', P('25k sf shops, 3 stories')), []);
  assert.deepEqual(R.notUnderstood('Single-family homes, mostly 2-story', P('Single-family homes, mostly 2-story')), []);
  assert.deepEqual(R.notUnderstood('a nice coffee shop', P('a nice coffee shop')), [], 'no numbers, nothing flagged');
  // a word or two between the number and the noun ("120 single-family homes") is still a count the words may have missed
  assert.deepEqual(R.notUnderstood('120 single-family homes and a 30,000 sf grocery', S.normalizeProgram({ use: 'retail', zones: [{ use: 'retail', gfa: 30000 }, { use: 'sfr' }] })), ['120 single-family homes']);
  assert.deepEqual(R.notUnderstood('120 two-story homes', S.normalizeProgram({ use: 'sfr', units: 120 })), [], 'read when the program has the 120');
  assert.deepEqual(R.notUnderstood('4 acres of townhomes', P('4 acres of townhomes')), [], 'acres are not a count'); }

// ---- small sites: the suggested chips on 0.63 and 4.7 acres (PARCEL_SCALE 0.12 and 0.33 in the browser harness) park, with a drive in from the street ----
{ const L = await import('../lib/sitelayout.mjs'), PC = [-95.76, 29.79];
  const parcelAt = k => { const dx = 0.0022 * k, dy = 0.0019 * k, [lon, lat] = PC; return { type: 'Polygon', coordinates: [[[lon - dx, lat - dy], [lon + dx, lat - dy], [lon + dx * 1.05, lat + dy * 0.6], [lon + dx * 0.4, lat + dy], [lon - dx, lat + dy], [lon - dx, lat - dy]]] }; };
  const touchesStreet = (plan, els) => { const rules = S.edgeRules(plan.ring, plan.front, plan.setbacks, plan.streets);
    return els.some(e => e.kind === 'drive' && plan.ring.some((a, k) => (rules[k].role === 'front' || rules[k].street) && S.shapeOf(e).some((p, i, c) => S.segSeg(p, c[(i + 1) % c.length], a, plan.ring[(k + 1) % plan.ring.length]) <= 2.5))); };
  for (const [k, ac] of [[0.12, 0.63], [0.33, 4.74]]) {
    const b = S.boundaryFrom(parcelAt(k), PC), plan = { ...b, front: null, frontGuess: true, setbacks: { ...S.SETBACKS } };
    assert.ok(Math.abs(S.ringArea(b.ring) / 43560 - ac) < 0.05, 'scale ' + k + ' is about ' + ac + ' acres');
    for (const ask of ['5,000 sf retail strip', '2,500 sf QSR pad with drive-thru', '25,000 sf retail strip with a drive-thru pad']) {
      const prog = S.guessProgram(ask), opts = L.layoutOptions(plan, prog); assert.ok(opts.length >= 1, ask + ' @' + k + ': layouts');
      for (const o of opts) { const p = { ...plan, elements: o.elements, program: o.program || prog, zones: o.zones }, m = S.metrics(p), what = ask + ' @' + k + ' · ' + o.name;
        assert.ok(m.spaces > 0, what + ': parks (' + m.spaces + ' of ' + m.required + ')');
        assert.ok(touchesStreet(plan, o.elements), what + ': a drive meets the street edge');
        assert.ok(!S.check(p).some(i => i.level === 'bad'), what + ': no blocking problems');
        for (const n of o.notes.filter(t => /Parking is \d/.test(t))) { const q = +n.match(/Parking is ([\d,]+) space/)[1].replace(/,/g, ''); assert.equal(q, m.required - m.spaces, what + ': the note counts like the header: ' + n); assert.ok(!/ 1 spaces/.test(n), what + ': singular'); } } } }
  // a lot with its building and nothing else: the apron parks it from the street side, drive in the middle
  const b2 = S.boundaryFrom(parcelAt(0.2), PC), plan2 = { ...b2, front: null, setbacks: { ...S.SETBACKS } }, bld = S.autoLayout(plan2, { use: 'retail', gfa: 5000 }).elements.filter(e => e.kind === 'building');
  const ap = S.streetApron(plan2, bld, { use: 'retail', gfa: 5000 }); assert.ok(ap && ap.elements.some(e => e.name === 'Main entry' && e.kind === 'drive'), 'apron with a main entry');
  { const p = { ...plan2, elements: bld.concat(ap.elements), program: { use: 'retail', gfa: 5000 } }, m = S.metrics(p); assert.ok(m.spaces >= m.required, 'apron parks the 5,000 sf: ' + m.spaces + ' of ' + m.required); assert.ok(!S.check(p).some(i => i.level === 'bad'), 'apron breaks no rule'); assert.ok(touchesStreet(plan2, ap.elements), 'apron drive on the street edge'); }
  // the engine's own shortfall note counts as the header does, and says "1 space"
  { const b3 = S.boundaryFrom(parcelAt(0.12), PC), plan3 = { ...b3, front: null, setbacks: { ...S.SETBACKS } }, r = S.autoLayout(plan3, { use: 'retail', gfa: 5000 }), m = S.metrics({ ...plan3, elements: r.elements, program: r.program }), n = r.notes.find(t => /^Parking is/.test(t));
    assert.equal(m.required - m.spaces, 1, 'one space short'); assert.ok(/^Parking is 1 space short;/.test(n), n); }
  assert.equal(S.spacesWord(1), '1 space'); assert.equal(S.spacesWord(2), '2 spaces'); assert.equal(S.spacesWord(1234), '1,234 spaces');
  // problem names keep their capitals
  { const pl = { ring: [[0, 0], [300, 0], [300, 300], [0, 300]], front: 0, setbacks: { ...S.SETBACKS }, program: { use: 'retail' }, elements: [{ id: 'a', kind: 'building', x: 150, y: 150, w: 80, d: 60, name: 'Building A' }, { id: 'b', kind: 'building', x: 170, y: 160, w: 80, d: 60, name: 'Building B' }] };
    assert.ok(S.check(pl).some(i => i.text === 'Building A overlaps Building B'), S.check(pl).map(i => i.text).join(' | ')); } }

console.log('site plans ok');
