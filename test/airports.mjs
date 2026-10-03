// Offline tests for airports (lib/airports.mjs, api/airports.js) and takeoff / landing counting.
import assert from 'node:assert/strict';
import { parseCsv, airportRow, runwayRow, dtppCycle, parseDtpp, parseAirlines, parseTables, cleanWiki, underPath, opsStep, distNm } from '../lib/airports.mjs';

// CSV: quotes, doubled quotes, commas and newlines inside fields
const rows = parseCsv('"a","b","c"\n1,"x, ""y""","multi\nline"\r\n2,,\n');
assert.deepEqual(rows, [{ a: '1', b: 'x, "y"', c: 'multi\nline' }, { a: '2', b: '', c: '' }]);
const ap = airportRow({ ident: 'KIAH', type: 'large_airport', name: 'Bush', latitude_deg: '29.98', longitude_deg: '-95.34', elevation_ft: '97', scheduled_service: 'yes', iata_code: 'IAH', icao_code: 'KIAH' });
assert.equal(ap.scheduled, true); assert.equal(ap.elevation_ft, 97); assert.equal(ap.home_link, null); assert.match(ap.h, /^[0-9a-f]{16}$/);
assert.equal(airportRow({ ident: 'X', latitude_deg: '' }), null, 'no position, no row');
const rw = runwayRow({ id: '1', airport_ident: 'KIAH', length_ft: '9000', lighted: '1', closed: '0', le_ident: '08L', le_latitude_deg: '30.0072', le_longitude_deg: '-95.3588', he_ident: '26R', he_latitude_deg: '30.0072', he_longitude_deg: '-95.3304', le_heading_degT: '89.9' });
assert.equal(rw.lighted, true); assert.equal(rw.le_heading, 89.9); assert.equal(rw.he_heading, null);

// FAA chart cycles: 2610 began 2026-10-01, every 28 days, numbered within the year
assert.deepEqual(dtppCycle(new Date('2026-10-03T12:00:00Z')), { cycle: '2610', start: '2026-10-01' });
assert.equal(dtppCycle(new Date('2026-10-29T12:00:00Z')).cycle, '2611');
assert.equal(dtppCycle(new Date('2026-09-20T12:00:00Z')).cycle, '2609');
assert.equal(dtppCycle(new Date('2027-01-05T12:00:00Z')).cycle, '2613', 'the cycle that began 2026-12-24 keeps its 2026 number');
assert.equal(dtppCycle(new Date('2027-01-25T12:00:00Z')).cycle, '2701');
const pdfs = parseDtpp('<x><airport_name ID="A" apt_ident="IAH" icao_ident="KIAH"><record><chart_code>MIN</chart_code><pdf_name>A.PDF</pdf_name></record><record><chart_code>APD</chart_code><pdf_name>00189AD.PDF</pdf_name></record></airport_name><airport_name apt_ident="T41" icao_ident=""><record><chart_code>IAP</chart_code><pdf_name>B.PDF</pdf_name></record></airport_name></x>');
assert.equal(pdfs.get('KIAH'), '00189AD.PDF'); assert.equal(pdfs.get('IAH'), '00189AD.PDF'); assert.equal(pdfs.has('T41'), false, 'no diagram, no entry');

// Wikipedia: the airlines list (Airport-dest-list template) and statistics tables
const pax = `===Passenger ===
<!-- note -->
{{Airport-dest-list|
{{nowrap|[[Aeroméxico]]}} | [[Mexico City International Airport|Mexico City–Benito Juárez]]<ref>{{Cite web |title=x |url=https://a.b/c?d=1|e}}</ref>
<!-- -->
| [[Air Canada]] | [[Montréal–Trudeau International Airport|Montréal–Trudeau]],<ref name="AC">{{cite news |a=b}}</ref> [[Toronto Pearson International Airport|Toronto–Pearson]],<ref name="AC"/> [[Vancouver International Airport|Vancouver]]
| [[United Airlines]] | [[Austin–Bergstrom International Airport|Austin]], [[Denver International Airport|Denver]] <br>'''Seasonal:''' [[Aspen/Pitkin County Airport|Aspen]]
}}`;
const al = parseAirlines(pax);
assert.deepEqual(al.map(x => [x.airline, x.destinations, x.seasonal]), [['Air Canada', 3, 0], ['United Airlines', 2, 1], ['Aeroméxico', 1, 0]]);
const tables = parseTables(`==Statistics==
{| class="wikitable sortable"
|+Busiest Domestic Routes from IAH (June 2025 – May 2026)<ref name="t">{{Cite web |title=x}}</ref>
|-
! Rank
! City
! Passengers
|-
| style="text-align:center;"|1
| [[O'Hare International Airport|Chicago–O'Hare, Illinois]]
| style="text-align:center;"|831,556
|-
| 2 || [[Denver International Airport|Denver, Colorado]] || 824,987
|}`);
assert.equal(tables.length, 1); assert.match(tables[0].caption, /^Busiest Domestic Routes from IAH/);
assert.deepEqual(tables[0].headers, ['Rank', 'City', 'Passengers']);
assert.deepEqual(tables[0].rows, [['1', "Chicago–O'Hare, Illinois", '831,556'], ['2', 'Denver, Colorado', '824,987']]);
assert.equal(cleanWiki("'''Bold''' [[A|b]] {{nowrap|c}}<ref>x</ref>"), 'Bold b c');

// approach paths: a point 3 nm east of runway 26R's threshold (on the centerline) is under the path; 2 nm off it is not
const iah = [{ le_ident: '08L', le_lat: 30.0072, le_lon: -95.3588, he_ident: '26R', he_lat: 30.0072, he_lon: -95.3304, length_ft: 9000 }];
const east3 = [-95.3304 + 3 * 1852 / (111320 * Math.cos(30.0072 * Math.PI / 180)), 30.0072];
const p = underPath(east3, iah); assert.equal(p.end, '26R'); assert.ok(Math.abs(p.beyond_nm - 3) < 0.05); assert.ok(p.offset_nm < 0.05);
assert.equal(underPath([east3[0], 30.0072 + 2 / 60], iah), null, '2 nm off the centerline');
assert.equal(underPath([-95.345, 30.0072], iah), null, 'over the runway itself is not "beyond" it');
assert.ok(Math.abs(distNm([-95.34, 29.98], [-95.34, 30.98]) - 60) < 0.2);

// takeoffs and landings
{ const A = [{ ident: 'KHOU', lon: -95.2789, lat: 29.6454, elev: 46 }];
  const prev = new Map([['a1', { hex: 'a1', ident: 'KHOU', ground: true }], ['a2', { hex: 'a2', ident: '', ground: false, alt: 1200 }], ['a3', { hex: 'a3', ident: '', ground: false, alt: 30000 }]]);
  const now = [
    { hex: 'a1', lat: 29.66, lon: -95.27, alt: 1500, ground: false, vs: 1800 },   // was on the ground: took off
    { hex: 'a2', lat: 29.646, lon: -95.279, alt: 0, ground: true },               // was airborne: landed
    { hex: 'a3', lat: 29.7, lon: -95.2, alt: 32000, ground: false },              // cruising: ignored
    { hex: 'a4', lat: 29.655, lon: -95.27, alt: 900, ground: false, vs: 1500 },    // first seen just after takeoff
    { hex: 'a5', lat: 29.645, lon: -95.279, alt: 0, ground: true }];               // first seen on the ground: nothing yet
  const { events, states } = opsStep(A, now, prev);
  assert.deepEqual(events, [{ ident: 'KHOU', dep: 2, arr: 1 }]);
  assert.deepEqual(states.find(s => s.hex === 'a5'), { hex: 'a5', ident: 'KHOU', ground: true, alt: 0 });
  assert.ok(!states.some(s => s.hex === 'a3'), 'cruising planes are not tracked');
  const again = opsStep(A, [{ hex: 'a2', lat: 29.646, lon: -95.279, alt: 0, ground: true }], new Map([['a2', { ground: true, ident: 'KHOU' }]]));
  assert.deepEqual(again.events, [], 'still on the ground: no second landing');
  const fin = opsStep(A, [{ hex: 'f1', lat: 29.69, lon: -95.2789, alt: 650, ground: false, vs: -700 }], new Map([['f1', { ground: false, ident: '', alt: 1800 }]]));
  assert.deepEqual(fin.events, [{ ident: 'KHOU', dep: 0, arr: 1 }], 'short final counts as a landing (the feed often drops planes before touchdown)');
  const roll = opsStep(A, [{ hex: 'f1', lat: 29.646, lon: -95.279, alt: 0, ground: true }], new Map([['f1', fin.states[0]]]));
  assert.deepEqual(roll.events, [], 'and touchdown after it is not a second landing');
  const go = opsStep(A, [{ hex: 'g1', lat: 29.69, lon: -95.2789, alt: 650, ground: false, vs: 900 }], new Map([['g1', { ground: false, ident: '', alt: 400 }]]));
  assert.deepEqual(go.events, [], 'climbing at 650 ft is not a landing'); }

// the API: Wikipedia airlines, METAR, approach path near an airport
{ const { detail, wikiFacts, metar } = await import('../api/airports.js');
  const f = async (url, o = {}) => {
    const u = new URL(String(url)), j = x => new Response(JSON.stringify(x), { headers: { 'Content-Type': 'application/json' } });
    if (u.host === 'query.wikidata.org') return j({ results: { bindings: [{ img: { value: 'http://commons.wikimedia.org/wiki/Special:FilePath/IAH%20Aerial.jpg' } }] } });
    if (u.pathname.includes('/page/summary/')) return j({ extract: 'Big airport.', thumbnail: { source: 'https://x/logo.svg.png' } });
    if (u.searchParams.get('prop') === 'sections') return j({ parse: { sections: [{ index: '10', line: 'Airlines and destinations' }, { index: '11', line: 'Passenger' }, { index: '12', line: 'Cargo' }, { index: '13', line: 'Statistics' }] } });
    if (u.searchParams.get('prop') === 'wikitext') return j({ parse: { wikitext: { '*': u.searchParams.get('section') === '11' ? pax : u.searchParams.get('section') === '12' ? '{{Airport-dest-list|\n[[FedEx Express]] | [[Memphis International Airport|Memphis]]\n}}' : '' } } });
    if (u.host === 'aviationweather.gov') return j(u.pathname.endsWith('metar') ? [{ rawOb: 'METAR KIAH 030653Z 06006KT 10SM', reportTime: '2026-10-03T07:00:00Z', temp: 25.6, wdir: 60, wspd: 6, visib: '10+', fltCat: 'VFR', clouds: [{ cover: 'FEW', base: 2000 }] }] : [{ rawTAF: 'TAF KIAH …' }]);
    throw new Error('unexpected ' + u);
  };
  const w = await wikiFacts({ ident: 'KIAH', icao: 'KIAH', wikipedia_link: 'https://en.wikipedia.org/wiki/George_Bush_Intercontinental_Airport' }, f);
  assert.equal(w.image.url, 'https://commons.wikimedia.org/wiki/Special:FilePath/IAH%20Aerial.jpg?width=960'); assert.equal(w.airlines[0].airline, 'Air Canada'); assert.equal(w.cargo[0].airline, 'FedEx Express');
  const m = await metar('KIAH', f); assert.equal(m.temp_f, 78); assert.equal(m.clouds, 'FEW 2000 ft'); assert.equal(m.taf, 'TAF KIAH …');
  const fakeDb = { rpc: async (fn, a) => fn === 'airport_detail' && a.p_ident === 'IAH' ? { airport: { ident: 'KIAH', icao: 'KIAH', iata: 'IAH', iso_country: 'US', wikipedia_link: 'https://en.wikipedia.org/wiki/X' }, runways: [], ops: [] } : null };
  const d = await detail('iah', fakeDb, f); assert.equal(d.airport.ident, 'KIAH'); assert.equal(d.metar.category, 'VFR');
  assert.equal(await detail('nope', fakeDb, f), null); }
console.log('airports ok');
