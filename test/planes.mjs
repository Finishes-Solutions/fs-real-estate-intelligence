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
const seen = [], rpc = []; let mode = 'ok', REG = [];
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
  if (u.host === 'db.example' && u.pathname === '/rest/v1/aircraft_registry') {
    const or = u.searchParams.get('or'); assert.match(or, /^\((hex\.in\.\([0-9a-f,]+\))?,?(n_number\.in\.\([0-9A-Z,]+\))?\)$/, or);
    return json(REG.filter(r => or.includes(r.hex) || or.includes('n_number.in.(' + r.n_number) || or.includes(',' + r.n_number + ',') || or.includes(',' + r.n_number + ')')));
  }
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

// ---- FAA registry (lib/faa.mjs, api/planes.js ?reg=) ----
{ const { parseRegistry, present, regKey, usHex, unzip } = await import('../lib/faa.mjs');
  const { deflateRawSync } = await import('node:zlib');
  const head = '\uFEFFN-NUMBER,SERIAL NUMBER,MFR MDL CODE,ENG MFR MDL,YEAR MFR,TYPE REGISTRANT,NAME,STREET,STREET2,CITY,STATE,ZIP CODE,REGION,COUNTY,COUNTRY,LAST ACTION DATE,CERT ISSUE DATE,CERTIFICATION,TYPE AIRCRAFT,TYPE ENGINE,STATUS CODE,MODE S CODE,FRACT OWNER,AIR WORTH DATE,OTHER NAMES(1),OTHER NAMES(2),OTHER NAMES(3),OTHER NAMES(4),OTHER NAMES(5),EXPIRATION DATE,UNIQUE ID,KIT MFR, KIT MODEL,MODE S CODE HEX,';
  const MASTER = [head,
    '12345,17281234     ,2072738,41514,2004,7,ACME AVIATION LLC        ,100 MAIN ST   ,          ,HOUSTON    ,TX,770241234 ,2,201,US,20240115,20200310,1N   ,4,1 ,V,50455351,N,20040601,JANE DOE   ,     ,     ,     ,     ,20270331,00123456,     ,     ,A0B1C2    ,',
    '812DN,30001       ,1384911,     ,2015,3,DELTA AIR LINES INC      ,PO BOX 20706  ,DEPT 595  ,ATLANTA    ,GA,30320     ,2,121,US,20250101,20150601,1T   ,5,5 ,V,53021341,N,20150501,     ,     ,     ,     ,     ,20280630,00222222,     ,     ,AB1234    ,',
    'BAD!,x,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,'].join('\r\n');
  const ACFTREF = '\uFEFFCODE,MFR,MODEL,TYPE-ACFT,TYPE-ENG,AC-CAT,BUILD-CERT-IND,NO-ENG,NO-SEATS,AC-WEIGHT,SPEED,TC-DATA-SHEET,TC-DATA-HOLDER,\r\n2072738,CESSNA                        ,T182T               ,4,1 ,1,0,01,004,CLASS 1,0000,  ,  ,\r\n1384911,BOEING                        ,737-932ER           ,5,5 ,1,0,02,189,CLASS 3,0000,  ,  ,';
  const ENGINE = '\uFEFFCODE,MFR,MODEL,TYPE,HORSEPOWER,THRUST,\r\n41514,LYCOMING  ,IO-540-AB1A5 ,1 ,00230,000000,';
  const rows = parseRegistry({ MASTER, ACFTREF, ENGINE });
  assert.equal(rows.length, 2, 'a malformed N-number is skipped');
  assert.deepEqual([rows[0].n_number, rows[0].hex, rows[0].mfr, rows[0].model, rows[0].year_mfr, rows[0].registrant_type, rows[0].zip, rows[0].cert_issued, rows[0].expires, rows[0].engine, rows[0].seats, rows[0].other_names],
    ['12345', 'a0b1c2', 'CESSNA', 'T182T', 2004, 'LLC', '77024-1234', '2020-03-10', '2027-03-31', 'LYCOMING IO-540-AB1A5', 4, ['JANE DOE']]);
  assert.equal(rows[1].street, 'PO BOX 20706, DEPT 595'); assert.equal(rows[1].engine, null, 'no engine code'); assert.equal(rows[1].aircraft_type, 'Fixed wing, multi engine');
  assert.match(rows[0].h, /^[0-9a-f]{16}$/); assert.equal(parseRegistry({ MASTER, ACFTREF, ENGINE })[0].h, rows[0].h, 'stable hash');
  assert.notEqual(parseRegistry({ MASTER: MASTER.replace('ACME AVIATION LLC', 'ACME AVIATION INC'), ACFTREF, ENGINE })[0].h, rows[0].h, 'an owner change changes the hash');
  const pr = present(rows[0]), pr0w = () => pr.owner_withheld;
  assert.deepEqual([rows[0].airworthiness, rows[1].airworthiness, rows[0].weight_class, rows[1].weight_class], ['Standard', 'Standard', 'Up to 12,499 lb', '20,000 lb and over']);
  assert.deepEqual([present({ ...rows[0], status: '27' }).status, present({ ...rows[0], status: '27' }).valid, present({ ...rows[0], status: 'T' }).valid], ['Registration expired', false, true]);
  assert.deepEqual([present({ ...rows[0], name: null }).owner_withheld, pr0w()], [true, false]);
  assert.deepEqual([pr.n_number, pr.owner, pr.city, pr.aircraft, pr.status, pr.address], ['N12345', 'ACME AVIATION LLC', 'Houston', '2004 CESSNA T182T', 'Valid', '100 MAIN ST, HOUSTON, TX 77024-1234']);
  assert.match(pr.faa_url, /nNumberTxt=12345$/);
  assert.deepEqual(['N123AB', 'a1b2c3', '~A1B2C3', 'n-12', '123456', 'N0123', 'DAL1601x'].map(regKey), [{ n: '123AB' }, { hex: 'a1b2c3' }, { hex: 'a1b2c3' }, { n: '12' }, { hex: '123456' }, null, null]);
  assert.ok(usHex('a0b1c2') && usHex('adf7c7') && !usHex('ae0001') && !usHex('4ca123'));
  // a zip as the FAA ships it (deflated entries in a folder-less archive)
  const zipOf = files => { const parts = [], dir = []; let off = 0;
    for (const [name, text] of Object.entries(files)) {
      const data = deflateRawSync(Buffer.from(text)), n = Buffer.from(name), loc = Buffer.alloc(30);
      loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(8, 8); loc.writeUInt32LE(data.length, 18); loc.writeUInt32LE(Buffer.byteLength(text), 22); loc.writeUInt16LE(n.length, 26);
      const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(8, 10); cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(Buffer.byteLength(text), 24); cen.writeUInt16LE(n.length, 28); cen.writeUInt32LE(off, 42);
      parts.push(loc, n, data); dir.push(cen, n); off += 30 + n.length + data.length;
    }
    const d = Buffer.concat(dir), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(dir.length / 2, 8); end.writeUInt16LE(dir.length / 2, 10); end.writeUInt32LE(d.length, 12); end.writeUInt32LE(off, 16);
    return Buffer.concat([...parts, d, end]); };
  const z = unzip(zipOf({ 'MASTER.txt': MASTER, 'DEREG.txt': 'big', 'ACFTREF.txt': ACFTREF, 'ENGINE.txt': ENGINE }));
  assert.deepEqual(Object.keys(z).sort(), ['ACFTREF', 'ENGINE', 'MASTER'], 'only the wanted files');
  assert.equal(z.MASTER, MASTER); assert.ok(!('DEREG' in z));
  assert.throws(() => unzip(Buffer.from('nope, not a zip at all, definitely not')), /not a zip/);

  // endpoint: no database -> FAA link only; with it -> owner by hex or N-number
  const { registration } = await import('../api/planes.js');
  let o = await registration(['a0b1c2', 'N12345', '4ca123'], null);
  assert.equal(o.registry, false); assert.deepEqual([o.aircraft.a0b1c2.us, o.aircraft['4ca123'].us], [true, false], 'Irish hex: not a US aircraft'); assert.match(o.aircraft.N12345.faa_url, /nNumberTxt=12345/);
  process.env.SUPABASE_URL = 'https://db.example'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_test'; REG = rows.map(({ h, airworthy, ...r }) => r);
  res = mock(); await planes({ query: { reg: 'a0b1c2,N812DN,a99999,4ca123' }, headers: H }, res);
  assert.equal(res.code, 200); assert.equal(res.body.registry, true); assert.match(res.headers['Cache-Control'], /s-maxage=43200/);
  assert.deepEqual([res.body.aircraft.a0b1c2.owner, res.body.aircraft.a0b1c2.n_number, res.body.aircraft.N812DN.owner, res.body.aircraft.N812DN.aircraft],
    ['ACME AVIATION LLC', 'N12345', 'DELTA AIR LINES INC', '2015 BOEING 737-932ER']);
  assert.deepEqual(res.body.aircraft.a99999, { found: false, us: true }); assert.equal(res.body.aircraft['4ca123'].us, false);
  res = mock(); await planes({ query: { reg: Array(26).fill('a0b1c2').join(',') }, headers: H }, res); assert.equal(res.code, 400, 'at most 25');
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SECRET_KEY; }
console.log('faa registry ok');

console.log('planes tests passed');
// sampling rate doesn't change the index: a day at 5-minute samples and a day at 1-minute samples of the same traffic read the same
{ const { summarize, perDay } = await import('../lib/planes.mjs');
  const five = summarize([{ n: 24, min_alt: 900 }], 288, 30), one = summarize([{ n: 120, min_alt: 900 }], 1440, 30);
  assert.equal(five.low_per_day, 24); assert.equal(one.low_per_day, 24, 'same traffic, 5x the samples and sightings, same index');
  assert.equal(one.sampled_days, 1, 'a full day at one-minute sampling'); assert.equal(perDay(5, 0), null);
  console.log('planes sampling-rate tests passed'); }

// ---- FlightAware AeroAPI behind the monthly cap (lib/aeroapi.mjs) ----
{ const { flights, budget, identType, cleanIdent, shape, capCents } = await import('../lib/aeroapi.mjs');
  assert.deepEqual(['N123AB', 'DAL1601', 'EJA512'].map(identType), ['registration', 'designator', 'designator']); assert.equal(cleanIdent('n-123ab'), 'N123AB'); assert.equal(cleanIdent('x; drop'), null);
  assert.equal(capCents({}), 475, 'default cap $4.75'); assert.equal(capCents({ AEROAPI_MONTHLY_CAP: '2' }), 200);
  // a fake database that behaves like the migration's functions
  const fakeDb = () => { const d = { via: 'key', calls: [], reported: 0, reportedAt: null, cache: new Map(), reserves: 0,
    async rpc(fn, a) {
      const since = c => !d.reportedAt || c.at > d.reportedAt;
      if (fn === 'aeroapi_status') return [{ reported_cents: d.reported, pending_cents: d.calls.filter(since).reduce((x, c) => x + c.cents, 0), calls: d.calls.length, reported_at: d.reportedAt }];
      if (fn === 'aeroapi_reserve') { d.reserves++; const pending = d.calls.filter(since).reduce((x, c) => x + c.cents, 0); if (d.reported + pending + a.p_cents > a.p_cap_cents) return false; d.calls.push({ at: new Date().toISOString(), cents: a.p_cents }); return true; }
      if (fn === 'aeroapi_report') { d.reported = a.p_cents; d.reportedAt = new Date(Date.parse(a.p_as_of) - 600e3).toISOString(); return null; }
      throw new Error('rpc ' + fn); },
    async select(t, q) { const k = decodeURIComponent(q.match(/k=eq\.([^&]+)/)[1]); const c = d.cache.get(k); return c ? [c] : []; },
    async upsert(t, rows) { for (const r of rows) d.cache.set(r.k, { data: r.data, at: r.at }); } }; return d; };
  const now = Date.now(), iso = ms => new Date(now + ms).toISOString(), hits = [];
  const fa = async (url, o) => { const u = new URL(url); hits.push(u.pathname); assert.equal(o.headers['x-apikey'], 'k');
    if (u.pathname.endsWith('/account/usage')) return json({ total_calls: 40, total_cost: 0.2 });
    if (u.pathname === '/aeroapi/flights/N123AB') { assert.equal(u.searchParams.get('ident_type'), 'registration'); assert.equal(u.searchParams.get('max_pages'), '1');
      return json({ flights: [
        { fa_flight_id: 'a', ident: 'N123AB', registration: 'N123AB', origin: { code: 'KHOU', code_iata: 'HOU', name: 'Houston Hobby', city: 'Houston' }, destination: { code: 'KAUS', code_iata: 'AUS', city: 'Austin' }, actual_off: iso(-1800e3), estimated_on: iso(1200e3), status: 'En Route', filed_altitude: 150 },
        { fa_flight_id: 'b', ident: 'N123AB', origin: { code: 'KAUS', code_iata: 'AUS' }, destination: { code: 'KHOU', code_iata: 'HOU' }, actual_off: iso(-90000e3), actual_on: iso(-87000e3), status: 'Arrived' },
        { fa_flight_id: 'c', ident: 'N123AB', origin: { code_lid: 'T41' }, destination: { code: 'KHOU', code_iata: 'HOU' }, scheduled_out: iso(86400e3), status: 'Scheduled' } ] }); }
    if (u.pathname === '/aeroapi/flights/EJA512') return new Response('slow down', { status: 429 });
    return json({ title: 'not found' }, 404); };
  const env = { AEROAPI_KEY: 'k' };
  assert.equal((await flights('N123AB', { db: fakeDb(), env: {}, fetchImpl: fa })).available, false, 'no key: no call');
  assert.equal((await flights('N123AB', { db: null, env, fetchImpl: fa })).available, false, 'no database: no cap, so no call'); assert.equal(hits.length, 0);
  let db = fakeDb(), o = await flights('N123AB', { db, env, fetchImpl: fa });
  assert.deepEqual([o.current.origin.code, o.current.destination.code, o.current.filed_altitude_ft, o.recent.length, o.recent[1].origin.code], ['HOU', 'AUS', 15000, 2, 'AUS']);
  assert.equal(db.reported, 20, 'FlightAware usage read first: $0.20'); assert.equal(db.calls.length, 1);
  o = await flights('N123AB', { db, env, fetchImpl: fa }); assert.ok(o.cached); assert.equal(db.reserves, 1, 'a cached answer costs nothing');
  assert.deepEqual(await budget(db, env).then(b => [b.cap, b.spent]), [4.75, 0.21], 'reported 20c + the 1c call since');
  // the cap: FlightAware says $4.74 used -> the next 1c lookup would pass $4.75 ... at 4.74 + 1 = 4.75 exactly it may go; one more may not
  db = fakeDb(); const n0 = hits.length;
  const nearly = async (url, opt) => new URL(url).pathname.endsWith('/account/usage') ? json({ total_cost: 4.745 }) : fa(url, opt);
  o = await flights('N9ZZ', { db, env, fetchImpl: nearly }); assert.equal(o.capped, true, 'over the cap: refused'); assert.match(o.note, /\$4\.75/);
  assert.ok(!hits.slice(n0).some(h => h.includes('/flights/')), 'no paid call once the cap is reached');
  // usage endpoint down: estimates alone hold the line (475 one-cent lookups at most)
  db = fakeDb(); db.calls = Array.from({ length: 475 }, () => ({ at: new Date().toISOString(), cents: 1 }));
  const noUsage = async (url, opt) => new URL(url).pathname.endsWith('/account/usage') ? json({}, 404) : fa(url, opt);
  o = await flights('N777', { db, env: { ...env, AEROAPI_MONTHLY_CAP: '4.75' }, fetchImpl: noUsage }); assert.equal(o.capped, true, 'estimates alone stop it');
  o = await flights('EJA512', { db: fakeDb(), env, fetchImpl: fa }); assert.equal(o.busy, true, '429 is reported, not thrown');
  assert.deepEqual(shape([{ origin: { code: 'X' }, cancelled: true, actual_off: iso(-1) }]), { current: null, recent: [] }); }
console.log('aeroapi cap ok');

{ const { default: planes } = await import('../api/planes.js'), H = { 'x-forwarded-for': '9.9.9.9' }, mk = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
  let r = mk(); await planes({ query: { flight: 'N123AB' }, headers: H }, r); assert.equal(r.body.available, false); assert.equal(r.headers['Cache-Control'], 'no-store', 'not connected: nothing cached');
  r = mk(); await planes({ query: { flight: 'x;y' }, headers: H }, r); assert.equal(r.code, 400);
  r = mk(); await planes({ query: { aeroapi: 'budget' }, headers: H }, r); assert.deepEqual([r.body.configured, r.body.cap], [false, 4.75]); }
console.log('aeroapi endpoint ok');
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

// map icons: one silhouette per kind of aircraft, from the ICAO type, else the ADS-B category
{ const { shapeOf, SHAPES, SIZE } = await import('../lib/aircraft-shapes.mjs'), { normalize } = await import('../lib/planes.mjs');
  const want = { B744: 'heavy4', A388: 'heavy4', B77W: 'heavy2', B789: 'heavy2', A333: 'heavy2', B738: 'jet', B38M: 'jet', A21N: 'jet', E175: 'jet', CRJ9: 'regional', E145: 'regional',
    C68A: 'bizjet', GLF5: 'bizjet', LJ45: 'bizjet', E55P: 'bizjet', F16: 'fighter', DH8D: 'turboprop2', AT72: 'turboprop2', B350: 'turboprop2', PC12: 'turboprop1', C208: 'turboprop1',
    BE58: 'twin', PA34: 'twin', C172: 'single', P28A: 'single', SR22: 'single', M20P: 'single', R44: 'heli', EC35: 'heli', B407: 'heli', S76: 'heli', ASK21: 'glider', BALL: 'balloon' };
  for (const [t, k] of Object.entries(want)) assert.equal(shapeOf(t), k, t);
  assert.deepEqual(['A1', 'A2', 'A3', 'A5', 'A7', 'B1', 'B2', 'B6', 'C1', ''].map(c => shapeOf('ZZZZ', c)), ['single', 'bizjet', 'jet', 'heavy2', 'heli', 'glider', 'balloon', 'drone', 'ground', 'jet']);
  for (const k of SHAPES) assert.ok(SIZE[k] > 0, 'size for ' + k);
  assert.ok(SIZE.heavy4 > SIZE.jet && SIZE.jet > SIZE.single, 'a 747 is drawn bigger than a 737, bigger than a Cessna');
  assert.equal(normalize({ hex: 'a1', t: 'R44', lat: 30, lon: -95, alt_baro: 800 }).shape, 'heli'); assert.equal(normalize({ hex: 'a2', category: 'A5', lat: 30, lon: -95, alt_baro: 9000 }).shape, 'heavy2'); }
console.log('aircraft shapes ok');

