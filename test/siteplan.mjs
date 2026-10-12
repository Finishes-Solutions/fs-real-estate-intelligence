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
  assert.deepEqual(S.check(plan).map(i => i.text), ['Parking is 8 spaces short of 48 required']);
  plan.elements[0].y = 85; assert.match(S.check(plan)[0].text, /Building is inside the 20 ft rear setback/);
  plan.elements[0].y = 60; plan.elements[2] = { id: 'd', kind: 'drive', x: 95, y: 0, w: 26, d: 60, rot: 0 };
  assert.match(S.check(plan).find(i => i.id === 'd').text, /Drive runs outside the lot/, 'a drive through a side line is outside');
  plan.elements[2] = { id: 'd', kind: 'pond', x: 0, y: 20, w: 40, d: 40, rot: 0 }; assert.ok(S.check(plan).some(i => /Building overlaps detention/.test(i.text)));
  plan.elements.pop(); plan.zoning = { max_coverage_pct: 15, max_far: 0.1 };
  const z = S.check(plan).map(i => i.text).join(' | '); assert.match(z, /Coverage 20% is over the zoning limit of 15%/); assert.match(z, /FAR 0.20 is over the zoning limit of 0.1/);
  const m = S.metrics(plan); assert.equal(m.gfa, 12000); assert.equal(m.spaces, 40); assert.equal(m.required, 48); assert.equal(+m.coverage.toFixed(2), 0.2); }

// ---- words -> program ----
assert.deepEqual(S.guessProgram('25,000 sf retail strip with 4.5/1000 parking'), { use: 'retail', gfa: 25000, ratio: 4.5 });
assert.deepEqual(S.guessProgram('200 apartments, 3 stories, 1.75 spaces per unit'), { use: 'multifamily', floors: 3, units: 200, perUnit: 1.75 });
assert.deepEqual(S.guessProgram('150k sq ft warehouse, no detention'), { use: 'industrial', gfa: 150000, detentionPct: 0 });
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
  const ents = g.filter((x, i) => i % 2 && g[i - 1] === '0'); assert.equal(ents.filter(x => x === 'POLYLINE').length, done.elements.length + 3, 'lot, setback line, every element, north arrow');
  assert.ok(ents.filter(x => x === 'LINE').length > 40, 'stall stripes'); assert.ok(!/[^\x00-\x7f]/.test(dxf), 'plain ASCII (the en dash in the title is replaced)');
  assert.ok(dxf.includes('LON ' + done.origin[0]), 'the origin is written on the drawing'); }

// ---- /api/siteplan ----
{ const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
  let sent = null;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url); if (u.includes('/models/')) return Response.json({ id: 'm' });
    sent = JSON.parse(opts.body); const user = JSON.parse(sent.messages[1].content);
    assert.equal(user.site.acres, 3.1); assert.equal(user.request, '120 apartments'); assert.equal(sent.reasoning_effort, 'low');
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

console.log('site plans ok');
