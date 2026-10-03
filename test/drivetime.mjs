// Offline tests for drive-time areas (api/isochrone.js): TomTom reachable range, the Valhalla fallback, limits.
import assert from 'node:assert/strict';
import { parseMinutes, departAt, isochrones, tomtomRange, valhalla } from '../api/isochrone.js';

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
const square = (lat, lon, d) => [[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d]];
const seen = [];
let mode = 'ok';
const fake = async url => {
  const u = new URL(String(url)); seen.push(u);
  if (u.host === 'api.tomtom.com') {
    if (mode === 'tomtom-down') return json({ error: 'x' }, 403);
    const sec = +u.searchParams.get('timeBudgetInSec'), d = sec / 60 * 0.01;
    return json({ reachableRange: { center: { latitude: 29.76, longitude: -95.37 }, boundary: square(29.76, -95.37, d).map(([lon, lat]) => ({ latitude: lat, longitude: lon })) } });
  }
  if (u.host === 'valhalla1.openstreetmap.de') {
    const q = JSON.parse(u.searchParams.get('json'));
    assert.equal(q.costing, 'auto'); assert.equal(q.polygons, true);
    return json({ type: 'FeatureCollection', features: q.contours.map(c => ({ type: 'Feature', properties: { contour: c.time }, geometry: { type: 'Polygon', coordinates: [square(29.76, -95.37, c.time * 0.01)] } })).reverse() });
  }
  throw new Error('unexpected ' + u);
};

assert.deepEqual(parseMinutes('30,10,20,10'), [10, 20, 30], 'sorted, de-duplicated');
assert.deepEqual(parseMinutes('5,10,15,20,25'), [5, 10, 15, 20], 'at most 4 bands');
assert.equal(parseMinutes('0,90'), null, '1 to 60 minutes only');
assert.deepEqual(parseMinutes(''), [10, 20, 30], 'default');

// departure times: the next Tuesday/Wednesday 8 AM or 5 PM, or Sunday 11 AM, in Houston time with its offset
const fri = new Date('2026-10-02T15:00:00Z'); // a Friday
assert.equal(departAt('now', fri), 'now');
assert.equal(departAt('weekday-am', fri), '2026-10-06T08:00:00-05:00', 'Tuesday, daylight time');
assert.equal(departAt('weekday-pm', fri), '2026-10-06T17:00:00-05:00');
assert.equal(departAt('weekend', fri), '2026-10-04T11:00:00-05:00', 'Sunday');
assert.equal(departAt('weekday-am', new Date('2026-12-04T15:00:00Z')), '2026-12-08T08:00:00-06:00', 'standard time in winter');

{ const d = await tomtomRange('k', 29.76, -95.37, [10, 20], '2026-10-06T08:00:00-05:00', fake);
  assert.equal(d.features.length, 2); assert.equal(d.traffic, true); assert.match(d.source, /typical traffic/);
  const r = d.features[0].geometry.coordinates[0]; assert.deepEqual(r[0], r[r.length - 1], 'ring closed');
  assert.ok(d.features[1].properties.sqmi > d.features[0].properties.sqmi, 'bigger band, bigger area');
  const u = seen[seen.length - 1]; assert.equal(u.searchParams.get('departAt'), '2026-10-06T08:00:00-05:00'); assert.equal(u.searchParams.get('traffic'), 'true'); }

{ seen.length = 0; const d = await isochrones({ lat: 29.76, lon: -95.37, minutes: [10, 20, 30], depart: 'now', key: 'k', fetchImpl: fake });
  assert.equal(d.features.length, 3); assert.equal(d.depart, 'now'); assert.ok(!seen.some(u => u.searchParams.has('departAt')), 'leaving now: no departAt');
  assert.match(d.source, /live traffic/); }

{ mode = 'tomtom-down'; const d = await isochrones({ lat: 29.76, lon: -95.37, minutes: [10, 20], depart: 'weekday-am', key: 'k', fetchImpl: fake });
  assert.equal(d.traffic, false); assert.match(d.note, /Traffic unavailable \(TomTom 403\)/); assert.deepEqual(d.features.map(f => f.properties.minutes), [10, 20], 'sorted small to big'); }

{ const d = await isochrones({ lat: 29.76, lon: -95.37, minutes: [15], key: '', fetchImpl: fake });
  assert.match(d.source, /Valhalla/); assert.match(d.note, /without traffic/); assert.ok(!/unavailable/.test(d.note), 'no key: no error note'); }

{ await assert.rejects(isochrones({ lat: 29.76, lon: -95.37, minutes: [15], key: '', fetchImpl: async () => json({}, 500) }), /Couldn’t work out drive-time areas/); }

// the handler: validation and caching
{ const { default: handler } = await import('../api/isochrone.js');
  const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
  globalThis.fetch = fake; mode = 'ok'; process.env.TOMTOM_API_KEY = 'k';
  const req = q => ({ method: 'GET', query: q, headers: { host: 'x', 'x-forwarded-for': '1.2.3.' + Math.floor(Math.random() * 200) } });
  let r = mock(); await handler(req({ lat: '29.76', lon: '-95.37', minutes: '0' }), r); assert.equal(r.code, 400);
  r = mock(); await handler(req({ lat: '29.76', lon: '-95.37', minutes: '10,20', depart: 'weekend' }), r);
  assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.type, 'FeatureCollection'); assert.match(r.headers['Cache-Control'], /s-maxage=604800/, 'typical times cached');
  r = mock(); await handler(req({ lat: '29.76', lon: '-95.37', minutes: '10' }), r); assert.match(r.headers['Cache-Control'], /private/, 'now is not shared'); }
console.log('drivetime ok');
