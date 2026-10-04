// Offline tests for the US county lines: the national file's shaping (build/geometry.mjs) and the exact-lines proxy (api/counties.js).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { shapeUsCounties, countyLabel } from '../build/geometry.mjs';
const require = createRequire(import.meta.url);

// labels
assert.equal(countyLabel('Harris', '48201'), 'Harris Co., TX');
assert.equal(countyLabel('Orleans', '22071'), 'Orleans Par., LA');
assert.equal(countyLabel('Anchorage', '02020'), 'Anchorage, AK');
assert.equal(countyLabel('Richmond', '51760'), 'Richmond, VA', 'Virginia independent city');
assert.equal(countyLabel('Fairfax', '51059'), 'Fairfax Co., VA');
assert.equal(countyLabel('San Juan', '72127'), 'San Juan, PR');

// a tiny topology: two squares sharing one edge (arc 1), each in its own state
const topo = { type: 'Topology', arcs: [[[0, 0], [0, 1], [1, 1], [1, 0]], [[1, 0], [1, 1]], [[1, 1], [2, 1], [2, 0], [1, 0]]],
  objects: {
    counties: { type: 'GeometryCollection', geometries: [
      { type: 'Polygon', id: '01001', properties: { name: 'Autauga' }, arcs: [[0, ~1]] },
      { type: 'Polygon', id: '13001', properties: { name: 'Appling' }, arcs: [[1, 2]] }] },
    states: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', id: '01', arcs: [[0, ~1]] }, { type: 'Polygon', id: '13', arcs: [[1, 2]] }] } } };
const s = shapeUsCounties(topo);
assert.equal(s.lines.length, 1, 'only the shared border, once'); assert.deepEqual(s.lines[0].slice().sort(), [[1, 0], [1, 1]]);
assert.equal(s.states.length, 1);
assert.deepEqual(s.labels.map(l => l[0]).sort(), ['Appling Co., GA', 'Autauga Co., AL']);
const home = shapeUsCounties(topo, ['01001']);
assert.equal(home.lines.length, 0, 'borders of home counties are drawn by the app itself'); assert.deepEqual(home.labels.map(l => l[0]), ['Appling Co., GA']);

// the real file: every county in the US and territories except the 7 home counties
const us = shapeUsCounties(require('us-atlas/counties-10m.json'), ['48473', '48201', '48157', '48339', '48015', '48477', '48185']);
assert.ok(us.labels.length > 3200, us.labels.length + ' counties');
for (const st of ['AK', 'HI', 'PR', 'ME', 'CA']) assert.ok(us.labels.some(l => l[0].endsWith(', ' + st)), st);
assert.equal(us.labels.filter(l => l[0].endsWith(', TX')).length, 247);
assert.ok(!us.labels.some(l => l[0] === 'Harris Co., TX'), 'home county left to the app');
assert.ok(JSON.stringify(us).length < 1.2e6, 'small enough to ship');

// the proxy
const seen = [];
globalThis.fetch = async (url) => {
  const u = new URL(String(url)); seen.push(u);
  if (u.host === 'tigerweb.geo.census.gov') {
    if (u.searchParams.get('geometry') === '-100,40,-99.5,40.5') return Response.json({ error: { message: 'boom' } });
    return Response.json({ type: 'FeatureCollection', features: [
      { properties: { GEOID: '48201', NAME: 'Harris County' }, geometry: { type: 'MultiPolygon', coordinates: [[[[-95.123456, 29.5], [-95, 29.5], [-95, 30], [-95.123456, 29.5]]], [[[-94.9, 29.6], [-94.8, 29.6], [-94.9, 29.6]]]] } },
      { properties: { GEOID: '48157', NAME: 'Fort Bend County' }, geometry: { type: 'Polygon', coordinates: [[[-95.6, 29.4], [-95.4, 29.4], [-95.6, 29.4]]] } },
      { properties: { GEOID: '', NAME: 'x' }, geometry: null }] });
  }
  return new Response('unmocked', { status: 599 });
};
const { default: handler, countyCell, ringsToLines } = await import('../api/counties.js');
assert.deepEqual(ringsToLines({ type: 'Polygon', coordinates: [[[1.234567, 2], [3, 4]], [[5, 6]]] }), [[[1.23457, 2], [3, 4]]], 'rounded, single-point rings dropped');
const cell = await countyCell(-95.5, 29.5);
assert.deepEqual(cell.cell, [-95.5, 29.5]); assert.equal(cell.counties.length, 2); assert.equal(cell.counties[0].lines.length, 2, 'both parts of a multipolygon');
assert.equal(cell.counties[0].lines[0][0][0], -95.12346);
const q = seen[0].searchParams; assert.equal(q.get('geometry'), '-95.5,29.5,-95,30'); assert.equal(q.get('geometryType'), 'esriGeometryEnvelope'); assert.equal(q.get('maxAllowableOffset'), '0.00005');

const call = async (query) => { const out = { headers: {} }; const res = { setHeader: (k, v) => { out.headers[k] = v; }, status(c) { out.status = c; return res; }, json(b) { out.body = b; out.status ??= 200; return res; } };
  await handler({ query, headers: { host: 'x' }, socket: {} }, res); return out; };
let r = await call({ x: '-95.5', y: '29.5' });
assert.equal(r.status, 200); assert.equal(r.body.counties[1].name, 'Fort Bend County'); assert.match(r.headers['Cache-Control'], /s-maxage=2592000/);
for (const bad of [{ x: '-95.3', y: '29.5' }, { x: 'a', y: '1' }, {}, { x: '10', y: '45' }, { x: '-95.5', y: '80' }]) assert.equal((await call(bad)).status, 400, JSON.stringify(bad));
assert.equal((await call({ x: '170', y: '52' })).status, 200, 'Aleutians, across the date line');
r = await call({ x: '-100', y: '40' }); assert.equal(r.status, 502); assert.equal(r.headers['Cache-Control'], 'no-store'); assert.match(r.body.error, /boom/);
console.log('counties ok:', us.labels.length, 'counties,', us.lines.length, 'border lines');
