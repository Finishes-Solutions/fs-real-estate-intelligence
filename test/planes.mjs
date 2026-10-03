// Offline tests for live planes and the low-flight history (lib/planes.mjs, api/planes.js, api/planes-sample.js).
import assert from 'node:assert/strict';
const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, send(b) { r.body = b; return r; }, end() { return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
const AC = [
  { hex: 'a1b2c3', flight: 'UAL1234 ', r: 'N12345', t: 'B738', lat: 29.98, lon: -95.34, alt_baro: 1800, gs: 160, track: 268, baro_rate: -700, squawk: '4521', category: 'A3' },
  { hex: 'd4e5f6', flight: 'SWA88', t: 'B737', lat: 29.7, lon: -95.6, alt_baro: 35000, gs: 450, track: 90 },
  { hex: '~0abc', lat: 29.99, lon: -95.35, alt_baro: 'ground', gs: 12 },
  { hex: 'bad' } // no position
];
const seen = [], rpc = []; let mode = 'ok';
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)); seen.push(u);
  if (u.host === 'api.adsb.lol' && u.pathname.startsWith('/v2/point/')) return mode === 'lol-down' || mode === 'all-down' ? json({ error: 'x' }, 503) : json({ now: 1759440000000, ac: AC });
  if (u.host === 'opendata.adsb.fi') return mode === 'all-down' ? json({ error: 'x' }, 429) : json({ now: 1759440000, aircraft: AC.slice(0, 3) });
  if (u.host === 'api.adsb.one') return mode === 'all-down' ? json({ error: 'x' }, 503) : json({ now: 1759440000, ac: AC.slice(0, 2) });
  if (u.host === 'api.airplanes.live') return mode === 'all-down' ? json({ error: 'x' }, 503) : json({ now: 1759440000, ac: AC.slice(0, 2) });
  if (u.host === 'api.adsb.lol' && u.pathname === '/api/0/routeset') {
    const b = JSON.parse(opts.body); assert.equal(b.planes[0].callsign, 'UAL1234');
    return json([{ callsign: 'UAL1234', _airport_codes_iata: 'IAH-ORD', _airports: [{ iata: 'IAH', name: 'George Bush Intercontinental', location: 'Houston', countryiso2: 'US', lat: 29.984444, lon: -95.341389 }, { iata: 'ORD', name: "Chicago O'Hare", location: 'Chicago', countryiso2: 'US', lat: '41.978611', lon: '-87.904722' }], plausible: 1 }]);
  }
  if (u.host === 'db.example' && u.pathname === '/rest/v1/rpc/add_air_samples') { rpc.push(JSON.parse(opts.body)); return new Response(null, { status: 204 }); }
  if (u.host === 'db.example' && u.pathname === '/rest/v1/rpc/air_density') {
    const b = JSON.parse(opts.body); assert.ok(b.w < b.e && b.s < b.n && /^\d{4}-\d\d-\d\d$/.test(b.since));
    return json([{ lon: '-95.34', lat: '29.98', sightings: 120, min_alt: 800, samples: 576 }, { lon: '-95.35', lat: '29.98', sightings: 30, min_alt: 1500, samples: 576 }]);
  }
  if (u.host === 'db.example' && u.pathname === '/rest/v1/air_days') return json([{ samples: 288 }, { samples: 288 }]);
  return json({ error: 'unmocked ' + u }, 599);
};

const { normalize, isLow, pointQuery, binLow, cellOf, summarize, fetchPoint } = await import('../lib/planes.mjs');
const p = normalize(AC[0]);
assert.deepEqual([p.hex, p.flight, p.reg, p.type, p.alt, p.gs, p.track, p.vs, p.ground], ['a1b2c3', 'UAL1234', 'N12345', 'B738', 1800, 160, 268, -700, false]);
assert.equal(normalize(AC[2]).alt, 0); assert.equal(normalize(AC[2]).ground, true); assert.equal(normalize(AC[2]).hex, '0abc'); assert.equal(normalize(AC[3]), null);
assert.ok(isLow(p)); assert.ok(!isLow(normalize(AC[1])), 'cruise is not low'); assert.ok(!isLow(normalize(AC[2])), 'on the ground is not low');
const q = pointQuery([-96.2, 29.6, -95.2, 30.2]); assert.ok(q.nm >= 25 && q.nm <= 100, 'county view: ' + q.nm); assert.deepEqual(pointQuery([-96.21, 29.61, -95.21, 30.21]), q, 'nearby views share a cache key');
assert.equal(pointQuery([-130, 20, -60, 55]).nm, 250, 'capped at 250 nm');
assert.deepEqual(cellOf(29.7604, -95.3698), [-95.37, 29.76]);
assert.deepEqual(binLow([p, normalize(AC[1]), normalize(AC[2])]), [{ lon: -95.34, lat: 29.98, n: 1, min_alt: 1800 }]);
assert.deepEqual(summarize([{ n: 30, min_alt: 900 }, { n: 10, min_alt: 1500 }], 576, 30).low_per_day, 20, '40 sightings over 2 fully sampled days');
assert.equal(summarize([], 0, 30).low_per_day, null, 'no samples yet: unknown, not zero');
mode = 'lol-down'; assert.equal((await fetchPoint(29.9, -95.7, 50)).source, 'adsb.fi', 'falls back to the next feed'); mode = 'ok';

// ---- endpoint ----
const { default: planes } = await import('../api/planes.js');
const H = { 'x-forwarded-for': '8.8.8.8' };
let res = mock(); await planes({ query: { bbox: '-96.2,29.6,-95.2,30.2' }, headers: H }, res);
assert.equal(res.code, 200); assert.equal(res.body.source, 'adsb.lol'); assert.equal(res.body.aircraft.length, 3); assert.match(res.headers['Cache-Control'], /s-maxage=8/);
assert.ok(seen.some(u => /^\/v2\/point\/30\/-95\.6\/50$/.test(u.pathname)), 'rounded point query');
res = mock(); await planes({ query: { bbox: '2.2,48.8,2.5,48.95' }, headers: H }, res); assert.equal(res.code, 200, 'works over Paris too');
mode = 'lol-down'; res = mock(); await planes({ query: { bbox: '-80.2,25.6,-79.9,25.9' }, headers: H }, res); assert.equal(res.body.source, 'adsb.fi', 'adsb.lol rate-limited: next feed'); mode = 'ok';
mode = 'all-down'; res = mock(); await planes({ query: { bbox: '-96.2,29.6,-95.2,30.2' }, headers: H }, res);
assert.equal(res.code, 200); assert.equal(res.body.stale, true, 'every feed down: the last snapshot of the same area'); assert.equal(res.body.aircraft.length, 3);
res = mock(); await planes({ query: { bbox: '-120.2,34.6,-119.9,34.9' }, headers: H }, res); assert.equal(res.code, 502, 'never seen and all down'); assert.equal(res.headers['Cache-Control'], 'no-store'); mode = 'ok';
res = mock(); await planes({ query: { bbox: 'nope' }, headers: H }, res); assert.equal(res.code, 400);
res = mock(); await planes({ query: { route: 'ual1234', lat: '29.98', lon: '-95.34' }, headers: H }, res);
assert.deepEqual([res.body.origin.code, res.body.destination.code, res.body.destination.city], ['IAH', 'ORD', 'Chicago']);
assert.deepEqual([res.body.origin.lat, res.body.origin.lon, res.body.destination.lat, res.body.destination.lon], [29.9844, -95.3414, 41.9786, -87.9047], 'airport coordinates for drawing the route');
res = mock(); await planes({ query: { route: 'x; drop' }, headers: H }, res); assert.equal(res.code, 400);
{ const { route } = await import('../api/planes.js'); const r0 = await route('ZZZ999', 29.9, -95.3, async () => new Response('', { status: 200 })); assert.deepEqual([r0.origin, r0.destination], [null, null], 'unknown callsign: no route, no error'); }
// history without the database: says so, doesn't fail
res = mock(); await planes({ query: { history: '-95.34,29.98' }, headers: H }, res); assert.equal(res.body.history, false); assert.match(res.body.note, /SUPABASE_SECRET_KEY/);
process.env.SUPABASE_URL = 'https://db.example'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
res = mock(); await planes({ query: { history: '-95.34,29.98', km: '1' }, headers: H }, res);
assert.equal(res.body.history, true); assert.equal(res.body.low_per_day, 75, '150 sightings over 2 sampled days'); assert.equal(res.body.lowest_ft, 800); assert.match(res.headers['Cache-Control'], /s-maxage=3600/);
res = mock(); await planes({ query: { density: '-95.6,29.8,-95.1,30.1' }, headers: H }, res);
assert.equal(res.body.type, 'FeatureCollection'); assert.equal(res.body.features.length, 2); assert.equal(res.body.features[0].properties.per_day, 60);
res = mock(); await planes({ query: { density: '-100,25,-90,35' }, headers: H }, res); assert.equal(res.code, 400, 'density box capped');

// ---- sampler ----
const { default: sampler, center } = await import('../api/planes-sample.js');
assert.deepEqual(center({}), { lat: 29.85, lon: -95.65, nm: 100 });
res = mock(); await sampler({ headers: {} }, res); assert.equal(res.code, 401, 'cron only');
res = mock(); await sampler({ headers: { 'user-agent': 'curl/8' } }, res); assert.equal(res.code, 401);
process.env.CRON_SECRET = 'c';
res = mock(); await sampler({ headers: { authorization: 'Bearer wrong' } }, res); assert.equal(res.code, 401);
res = mock(); await sampler({ headers: { authorization: 'Bearer c' } }, res);
assert.equal(res.code, 200); assert.equal(res.body.low, 1); assert.equal(rpc.length, 1);
assert.ok(/^\d{4}-\d\d-\d\d$/.test(rpc[0].p_day)); assert.deepEqual(rpc[0].p_rows, [{ lon: -95.34, lat: 29.98, n: 1, min_alt: 1800 }]);
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SECRET_KEY; delete process.env.CRON_SECRET;

console.log('planes tests passed');
// sampling rate doesn't change the index: a day at 5-minute samples and a day at 1-minute samples of the same traffic read the same
{ const { summarize, perDay } = await import('../lib/planes.mjs');
  const five = summarize([{ n: 24, min_alt: 900 }], 288, 30), one = summarize([{ n: 120, min_alt: 900 }], 1440, 30);
  assert.equal(five.low_per_day, 24); assert.equal(one.low_per_day, 24, 'same traffic, 5x the samples and sightings, same index');
  assert.equal(one.sampled_days, 1, 'a full day at one-minute sampling'); assert.equal(perDay(5, 0), null);
  console.log('planes sampling-rate tests passed'); }

// routes: adsb.lol empty -> adsbdb; a stale route (the plane nowhere near it) is dropped; type names from the ICAO code
{ const { route, plausible } = await import('../api/planes.js'), { normalize } = await import('../lib/planes.mjs');
  const AP = { IAD: [38.9445, -77.4558], BOS: [42.3643, -71.0052], DEN: [39.8617, -104.673], IAH: [29.9844, -95.3414] };
  const db = (o, d) => ({ response: { flightroute: { origin: { iata_code: o, name: o + ' Airport', municipality: o + ' City', latitude: AP[o][0], longitude: AP[o][1] }, destination: { iata_code: d, name: d + ' Airport', municipality: d + ' City', latitude: AP[d][0], longitude: AP[d][1] } } } });
  const f = routes => async u => String(u).includes('routeset') ? new Response('', { status: 201 }) : routes[String(u).split('/').pop()] ? json(routes[String(u).split('/').pop()]) : json({ response: 'unknown callsign' }, 404);
  const fx = f({ FFT2996: db('DEN', 'IAH'), UAL1463: db('IAD', 'BOS') });
  const a = await route('FFT2996', 30.16, -95.77, fx); assert.deepEqual([a.origin.code, a.destination.code, a.source, a.plausible], ['DEN', 'IAH', 'adsbdb', true]);
  const b = await route('UAL1463', 29.99, -95.53, fx); assert.deepEqual([b.origin, b.destination], [null, null], 'IAD→BOS is not where a plane landing at Houston is going'); assert.deepEqual(b.rejected, ['adsbdb IAD-BOS']);
  const c = await route('LBQ640', 30.18, -95.31, fx); assert.equal(c.origin, null);
  assert.equal(plausible({ lat: 29.98, lon: -95.34 }, { lat: 41.98, lon: -87.9 }, 33.5, -92), true, 'en route IAH→ORD');
  assert.equal(plausible({ lat: 29.98, lon: -95.34 }, { lat: 41.98, lon: -87.9 }, 0, 0), null, 'no position: unknown');
  assert.equal(normalize({ hex: 'a8aeb6', t: 'A21N', lat: 30, lon: -95, alt_baro: 5700 }).desc, 'Airbus A321neo');
  assert.equal(normalize({ hex: 'a8aeb6', t: 'ZZZZ', lat: 30, lon: -95, alt_baro: 5700 }).desc, null);
  console.log('planes route fallback ok'); }
