// Offline tests for api/crime.js: the map grid, area reports (circle and polygon), incident lists and input checks.
import assert from 'node:assert/strict';
process.env.SUPABASE_URL = 'https://db.test'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_x';
const seen = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)), path = u.pathname.replace('/rest/v1/', ''), body = opts.body ? JSON.parse(opts.body) : null; seen.push([path, body]);
  if (path === 'rpc/crime_grid_json') return Response.json([[-95.368, 29.76, 3, 10, 7], [-95.372, 29.764, 0, 0, 0]]);
  if (path === 'rpc/crime_latest') return Response.json('2026-06-30');
  if (path === 'rpc/crime_report') {
    if (body.p_geom.coordinates[0].length > 200) return new Response(JSON.stringify({ message: 'area too large (over 1,500 square miles)' }), { status: 400 });
    return Response.json({ latest: '2026-06-30', from: '2024-07-01', area_sqmi: 0.785, totals: { last12_v: 150, last12_p: 728, last12_o: 1283, prior12_v: 145, prior12_p: 927, prior12_o: 1293 },
      by_code: [['13B', 255, 'o'], ['23H', 204, 'p'], ['13A', 94, 'v']], by_premise: [['Parking Lot, Garage', 245]], by_month: [['2026-06', 11, 35, 91]], city_last12: { v: 25000, p: 90000, o: 107000 } });
  }
  if (path === 'rpc/crime_list_json') return Response.json([{ day: '2026-06-30', code: '23F', cat: 'p', n: 1, premise: 'Parking Lot, Garage', lon: -95.37, lat: 29.76 }]);
  return new Response('unmocked ' + u, { status: 599 });
};
const { default: handler, circle, cleanGeometry, shapeReport } = await import('../api/crime.js');
const res = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
const call = async (req) => { const r = res(); await handler({ headers: {}, query: {}, method: 'GET', ...req }, r); return r; };

// grid: empty cells dropped, rounded, cached a day, with the latest month
let r = await call({ query: { grid: '1' } });
assert.equal(r.code, 200); assert.deepEqual(r.body.cells, [[-95.368, 29.76, 3, 10, 7]]); assert.equal(r.body.latest, '2026-06-30'); assert.match(r.headers['Cache-Control'], /s-maxage=86400/);
// circle report
r = await call({ query: { lat: '29.7604', lon: '-95.3698', mi: '0.5', list: '50' } });
assert.equal(r.code, 200); assert.equal(r.body.last12.total, 2161); assert.equal(r.body.change.total, -9); assert.equal(r.body.change.p, -21); assert.equal(r.body.change.v, 3);
assert.equal(r.body.per_sqmi.total, Math.round(2161 / 0.785)); assert.equal(r.body.city_per_sqmi.total, Math.round(222000 / 640));
assert.deepEqual(r.body.offenses.map(o => o.name), ['Simple assault', 'Other theft', 'Aggravated assault']); assert.equal(r.body.incidents[0].offense, 'Theft from a vehicle'); assert.match(r.body.coverage, /City of Houston only/);
const sent = seen.find(([p]) => p === 'rpc/crime_report')[1].p_geom; assert.equal(sent.type, 'Polygon'); assert.equal(sent.coordinates[0].length, 65);
assert.equal(seen.find(([p]) => p === 'rpc/crime_list_json')[1].p_limit, 50);
// polygon report by POST (a Feature is accepted), no list unless asked
seen.length = 0;
const box = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-95.375, 29.755], [-95.36, 29.755], [-95.36, 29.765], [-95.375, 29.765], [-95.375, 29.755]]] } };
r = await call({ method: 'POST', body: { geometry: box } }); assert.equal(r.code, 200); assert.equal(r.body.incidents, undefined); assert.ok(!seen.some(([p]) => p === 'rpc/crime_list_json')); assert.equal(r.headers['Cache-Control'], 'no-store');
// bad input
assert.equal((await call({ method: 'POST', body: { geometry: { type: 'Point', coordinates: [0, 0] } } })).code, 400);
assert.equal((await call({ query: { lat: '40', lon: '-74' } })).code, 400);
r = await call({ method: 'POST', body: { geometry: circle(-95.4, 29.8, 30, 300) } }); assert.equal(r.code, 400); assert.match(r.body.error, /too large/);
// pieces
assert.equal(cleanGeometry({ type: 'MultiPolygon', coordinates: [box.geometry.coordinates] }).type, 'MultiPolygon'); assert.equal(cleanGeometry(null), null);
const c = circle(-95.37, 29.76, 0.5); assert.deepEqual(c.coordinates[0][0], c.coordinates[0][64], 'closed ring'); assert.ok(Math.abs(c.coordinates[0][16][1] - 29.76 - 0.5 / 69) < 1e-5);
assert.equal(shapeReport({ latest: null }).latest, null);
assert.equal(shapeReport({ latest: '2026-06-30', area_sqmi: 0.01, totals: {} }).per_sqmi, null, 'no per-square-mile rate for a tiny area');
// no database: clear 503
delete process.env.SUPABASE_URL; assert.equal((await call({ query: { grid: '1' } })).code, 503);
console.log('crime tests passed');
