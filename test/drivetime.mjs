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

// traffic report (api/traffic.js): TxDOT counts in a polygon, TomTom live speeds and incidents
{ const { trafficReport, countsIn } = await import('../api/traffic.js');
  const sq = { type: 'Polygon', coordinates: [[[-95.5, 29.7], [-95.4, 29.7], [-95.4, 29.8], [-95.5, 29.8], [-95.5, 29.7]]] };
  const f = async (url, o = {}) => {
    const u = new URL(String(url));
    if (u.host === 'services.arcgis.com') { const p = new URLSearchParams(o.body); assert.equal(p.get('geometryType'), 'esriGeometryPolygon');
      if (p.get('outStatistics')) return json({ features: [{ attributes: { RTE_PRFX: 'IH', avg: 180000, n: 4, mx: 250000 } }, { attributes: { RTE_PRFX: 'CS', avg: 9000, n: 30, mx: 30000 } }] });
      return json({ features: [
        { attributes: { RTE_PRFX: 'IH', RTE_NBR: '0010', RTE_NM: 'IH0010', AADT_CUR: 250000, SYSTEM: 'On', EXT_DATE: 1700000000000 }, geometry: { paths: [[[-95.48, 29.75], [-95.45, 29.75], [-95.42, 29.75]]] } },
        { attributes: { RTE_PRFX: 'IH', RTE_NBR: '0010', RTE_NM: 'IH0010', AADT_CUR: 200000, SYSTEM: 'On' }, geometry: { paths: [[[-95.42, 29.75], [-95.41, 29.75]]] } },
        { attributes: { RTE_PRFX: 'CS', RTE_NM: 'WESTHEIMER RD-KG', AADT_CUR: 30000, SYSTEM: 'Off' }, geometry: { paths: [[[-95.46, 29.74], [-95.44, 29.74]]] } }] }); }
    if (u.pathname.includes('flowSegmentData')) return json({ flowSegmentData: { currentSpeed: 30, freeFlowSpeed: 60, currentTravelTime: 120, freeFlowTravelTime: 60, confidence: 1 } });
    if (u.pathname.includes('incidentDetails')) { assert.ok(u.searchParams.get('bbox')); return json({ incidents: [{ geometry: { type: 'LineString', coordinates: [[-95.45, 29.75], [-95.44, 29.75]] }, properties: { iconCategory: 1, magnitudeOfDelay: 3, events: [{ description: 'Stationary traffic' }], from: 'Bunker Hill', to: 'Gessner', roadNumbers: ['I-10'], delay: 600 } }] }); }
    throw new Error('unexpected ' + u);
  };
  const c = await countsIn(sq, f);
  assert.deepEqual(c.roads.map(r => [r.road, r.aadt, r.segments, r.avg]), [['I-10', 250000, 2, 225000], ['WESTHEIMER RD', 30000, 1, 30000]], 'busiest per road, with averages');
  assert.equal(c.segments.length, 3); assert.equal(c.types[0].label, 'Interstates');
  const d = await trafficReport(sq, { key: 'k', fetchImpl: f, label: 'x' });
  assert.equal(d.live[0].congestion_pct, 50); assert.equal(d.live[0].road, 'I-10');
  assert.equal(d.incidents[0].kind, 'Crash'); assert.equal(d.incidents[0].delay_min, 10); assert.equal(d.incidents[0].lon, -95.45);
  const n = await trafficReport(sq, { key: '', fetchImpl: f }); assert.match(n.live.error, /TomTom/); assert.equal(n.counts.roads.length, 2, 'counts work without TomTom');
  const big = { type: 'Polygon', coordinates: [[[-96, 29], [-95, 29], [-95, 30], [-96, 30], [-96, 29]]] };
  await assert.rejects(trafficReport(big, { key: '', fetchImpl: f }), /too large/); }
console.log('traffic report ok');
