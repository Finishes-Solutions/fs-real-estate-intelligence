// Ground elevations (lib/terrain.mjs, api/terrain.js): the grid over a site, what the ground does inside the boundary,
// and the endpoint against stand-ins for the USGS image service, the point service and Open-Meteo (failing in turn).
import assert from 'node:assert/strict';
const T = await import('../lib/terrain.mjs'), S = await import('../lib/siteplan.mjs'), { fm362 } = await import('./helpers/setctx.mjs');

// ---------- the grid ----------
{ const sp = T.gridSpec(fm362.ring); assert.ok(sp.nx * sp.ny <= T.MAX_POINTS && sp.cell >= 10, 'up to 3,600 points, at least 10 ft apart');
  const xs = fm362.ring.map(p => p[0]); assert.ok(sp.x0 <= Math.min(...xs) - 29 && sp.x0 + (sp.nx - 1) * sp.cell >= Math.max(...xs) + 29, 'the grid runs past the boundary');
  const ll = T.gridLL(sp, fm362.origin); assert.equal(ll.length, sp.nx * sp.ny); const back = S.frame(fm362.origin).toFt(ll[sp.nx + 1]); assert.ok(Math.abs(back[0] - (sp.x0 + sp.cell)) < 0.01 && Math.abs(back[1] - (sp.y0 + sp.cell)) < 0.01, 'points in row order'); }
{ const big = T.gridSpec([[0, 0], [8000, 0], [8000, 6000], [0, 6000]]); assert.ok(big.nx * big.ny <= T.MAX_POINTS && big.cell > 100, 'a big tract gets a wider grid'); }
assert.equal(T.terrainSig(fm362.origin, fm362.ring), T.terrainSig(fm362.origin, fm362.ring.map(p => [p[0] + 0.001, p[1]])), 'the same boundary, the same signature');
assert.notEqual(T.terrainSig(fm362.origin, fm362.ring), T.terrainSig(fm362.origin, fm362.ring.map(p => [p[0] + 5, p[1]])), 'a moved boundary: a new one');
assert.equal(T.cleanZ('NoData'), null); assert.equal(T.cleanZ(-3.4e38), null); assert.equal(T.cleanZ('41.5'), 41.5);

// a site falling 1% to the east and 0.5% to the south from 160 ft
const plane = (sp, f = (x, y) => 160 - 0.01 * x + 0.005 * y) => { const z = []; for (let j = 0; j < sp.ny; j++) for (let i = 0; i < sp.nx; i++) z.push(f(sp.x0 + i * sp.cell, sp.y0 + j * sp.cell)); return { ...sp, z, source: 'USGS 3DEP', detail: '1 m lidar' }; };
{ const t = plane(T.gridSpec(fm362.ring)), s = T.summary(t, fm362.ring);
  assert.equal(s.toward, 'south-east'); assert.ok(Math.abs(s.slope - Math.hypot(1, 0.5)) < 0.01, 'slope of the best-fit plane: ' + s.slope);
  assert.ok(s.low[0] > 400 && s.high[0] < -400, 'low on the east side, high on the west'); assert.ok(!s.flat && !s.rough);
  assert.ok(Math.abs(T.zAt(t, [123, 45]) - (160 - 1.23 + 0.225)) < 1e-6, 'bilinear on a plane is exact');
  const e = fm362.ring[s.lowEdge], e2 = fm362.ring[(s.lowEdge + 1) % fm362.ring.length]; assert.ok(Math.min(e[0], e2[0]) > 370, 'the low edge is on the east');
  const line = T.factLine(t, fm362.ring); assert.match(line, /falls about \d+\.\d ft toward the south-east/); assert.match(line, /USGS 3DEP \(1 m lidar\)/); assert.match(line, /not a survey/);
  assert.ok(T.heightShare(t, fm362.ring, s.low) < 0.05 && T.heightShare(t, fm362.ring, s.high) > 0.95);
  assert.equal(T.heightShare({ ...t, coarse: true }, fm362.ring, s.low), null, 'a coarse model doesn\'t steer the layout'); }
{ const sp = T.gridSpec(fm362.ring), t = plane(sp, () => 150.3), s = T.summary(t, fm362.ring); assert.ok(s.flat); assert.equal(s.toward, ''); assert.match(T.factLine(t, fm362.ring), /nearly flat/); assert.equal(T.heightShare(t, fm362.ring, [10, 10]), null); }
{ const sp = T.gridSpec([[0, 0], [300, 0], [300, 300], [0, 300]]), t = plane(sp, (x, y) => 150 - 6 * Math.exp(-((x - 150) ** 2 + (y - 150) ** 2) / 6000)), s = T.summary(t, [[0, 0], [300, 0], [300, 300], [0, 300]]);
  assert.ok(s.rough, 'a hole in the middle: the plane misses'); assert.ok(Math.hypot(s.low[0] - 150, s.low[1] - 150) < 15); }
// holes filled from the neighbours; too few points: nothing
{ const sp = { x0: 0, y0: 0, cell: 10, nx: 4, ny: 4 }, z = Array.from({ length: 16 }, (_, k) => k % 5 ? 100 + k : null), f = T.fillGaps({ ...sp, z }); assert.ok(f.z.every(v => v != null)); assert.equal(f.z[1], 101, 'data kept');
  assert.equal(T.fillGaps({ ...sp, z: z.map((v, k) => k < 2 ? 100 : null) }), null); }
{ const sp = { x0: 0, y0: 0, cell: 10, nx: 5, ny: 5 }, z = Array(25).fill(100); z[12] = 109; const sm = T.smoothed({ ...sp, z }); assert.equal(sm.z[12], 101, 'a spike averaged down'); }

// ---------- the layout engine puts the pond on the low side ----------
{ const L = await import('../lib/sitelayout.mjs');
  for (const [prog, f, dir] of [[{ use: 'retail', gfa: 40000 }, (x, y) => 150 + 0.01 * y, 'south'], [{ use: 'townhomes' }, (x, y) => 150 - 0.01 * x, 'east']]) {
    const sp = T.gridSpec(fm362.ring), z = []; for (let j = 0; j < sp.ny; j++) for (let i = 0; i < sp.nx; i++) z.push(f(sp.x0 + i * sp.cell, sp.y0 + j * sp.cell));
    const plan = { ...fm362, terrain: { ...sp, z } }, top = L.layoutOptions(plan, prog)[0], ps = top.elements.filter(e => e.kind === 'pond');
    assert.ok(ps.length && ps.every(e => T.heightShare(plan.terrain, fm362.ring, [e.x, e.y]) < 0.3), prog.use + ' on land falling to the ' + dir + ': the first option\'s pond is on the low side'); } }

// ---------- the endpoint ----------
const api = await import('../api/terrain.js'), real = globalThis.fetch;
let calls = [], mode = 'usgs';
globalThis.fetch = async (url, o = {}) => {
  url = String(url); calls.push(url.split('?')[0]);
  const ok = d => ({ ok: true, status: 200, json: async () => d }), down = () => ({ ok: false, status: 503, json: async () => ({}) });
  const ft = ([lon, lat]) => S.frame(fm362.origin).toFt([lon, lat]), zft = p => { const [x, y] = ft(p); return 160 - 0.01 * x + 0.005 * y; };
  if (url.startsWith(api.USGS)) { if (mode !== 'usgs') return down(); const g = JSON.parse(new URLSearchParams(o.body).get('geometry'));
    return ok({ samples: g.points.map((p, i) => ({ locationId: i, location: { x: p[0], y: p[1] }, value: i % 97 === 5 ? 'NoData' : String(zft(p) / 3.28084), resolution: 1.15 })) }); }
  if (url.startsWith(api.EPQS)) { if (mode !== 'epqs') return down(); const q = new URL(url).searchParams; return ok({ value: String(zft([+q.get('x'), +q.get('y')])) }); }
  if (url.startsWith(api.METEO)) { if (mode !== 'meteo') return down(); const q = new URL(url).searchParams, la = q.get('latitude').split(','), lo = q.get('longitude').split(','); return ok({ elevation: la.map((v, i) => zft([+lo[i], +v]) / 3.28084) }); }
  return down();
};
const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
let ip = 0; const call = async body => { const res = mock(); await api.default({ method: 'POST', body, headers: { 'x-forwarded-for': '9.9.9.' + (++ip) } }, res); return res; };
{ const r = await call({ origin: fm362.origin, ring: fm362.ring }), t = r.body; assert.equal(r.code, 200);
  assert.equal(t.source, 'USGS 3DEP'); assert.equal(t.detail, '1 m lidar', 'web-mercator 1.15 m at 30°N is 1 m on the ground'); assert.equal(t.coarse, false); assert.equal(t.sig, T.terrainSig(fm362.origin, fm362.ring));
  assert.ok(t.z.every(v => v != null), 'NoData points filled'); assert.ok(calls.filter(u => u === api.USGS).length >= Math.ceil(t.nx * t.ny / 400), 'in batches');
  assert.ok(Math.abs(T.zAt(t, [400, 100]) - (160 - 4 + 0.5)) < 0.05, 'feet, in the plan\'s own coordinates'); assert.equal(T.summary(t, fm362.ring).toward, 'south-east'); }
{ const res = mock(); await api.default({ method: 'GET', query: { lon: String(fm362.origin[0]), lat: String(fm362.origin[1]), ft: '400', sum: '1' }, headers: { 'x-forwarded-for': '9.9.8.1' } }, res);
  assert.equal(res.code, 200); assert.ok(!res.body.z && res.body.points > 100); assert.equal(res.body.summary.toward, 'south-east'); assert.match(res.body.fact, /^Ground \d+ to \d+ ft/); }
mode = 'epqs'; calls = [];
{ const t = (await call({ origin: fm362.origin, ring: fm362.ring })).body; assert.equal(t.coarse, true); assert.equal(t.detail, 'point samples'); assert.ok(t.nx * t.ny <= 121); assert.equal(T.summary(t, fm362.ring).toward, 'south-east'); assert.match(t.why, /503/); }
mode = 'meteo';
{ const t = (await call({ origin: fm362.origin, ring: fm362.ring })).body; assert.equal(t.source, 'Copernicus DEM'); assert.equal(t.coarse, true); assert.match(T.factLine(t, fm362.ring), /approximate/); }
mode = 'none';
{ const r = await call({ origin: fm362.origin, ring: fm362.ring }); assert.equal(r.code, 502); assert.match(r.body.error, /No elevation source/); }
assert.equal((await call({ origin: [1], ring: fm362.ring })).code, 400);
assert.equal((await call({ origin: fm362.origin, ring: [[0, 0], [1, 1]] })).code, 400);
assert.equal((await call({ origin: fm362.origin, ring: [[0, 0], [40000, 0], [0, 100]] })).code, 400, 'over 5 miles across');
globalThis.fetch = real;
console.log('terrain ok');
