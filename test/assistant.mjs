// Assistant tool helpers: filter clean-up, geocoder result picking and framing.
import assert from 'node:assert/strict';
import { cleanFilterArgs, pickPlace, districtFor, isPromptEcho, stripEcho, fromNominatim, withTellMore, suggestQuestions, frame, ZOOM, splitFollowups, plainText, textBlocks, placeCandidates, kindOf, pickAircraft, aircraftName, splitWithin, applyPlaceAlias, mentions, extentMeters, zoomForBox, BIG_PLACE_M } from '../lib/assist-logic.mjs';
import { pruneReports, fmtBytes } from '../lib/reports.mjs';
import { tractsFor, summarizeTracts, inGeom } from '../lib/demographics.mjs';
import { nameQuery } from '../api/tenants.js';
import { USES } from '../lib/taxonomy.mjs';
import { makeMatcher, encode, decode, describe } from '../lib/filter.mjs';
import { categoryOf, parsePlaces, overpassQuery, businessQuery, mergeBusinesses } from '../lib/nearby.mjs';
import { roofFromHistogram, floorsFromHeight } from '../lib/height.mjs';

// the model filled every filter: all uses, all types, $5M–$1T, changed this week
let a = cleanFilterArgs({ uses: USES, types: ['New', 'Reno', 'Addition'], min_value: 5e6, max_value: 1e12, changed: 'any', counties: ['Waller'], keywords: '' }, 'Show medical projects over $5M filed in the last year');
assert.deepEqual(a, { min_value: 5e6, counties: ['Waller'] });
a = cleanFilterArgs({ uses: ['Medical'], min_value: 0, max_value: 2e7, changed: 'new' }, 'what changed this week in medical?');
assert.deepEqual(a, { uses: ['Medical'], max_value: 2e7, changed: 'new' });
assert.equal(cleanFilterArgs({ min_value: 5e6, max_value: 1e6 }).max_value, undefined, 'max below min dropped');

// "Astros stadium" must not settle for the city
const houston = { t: 'Houston, Texas', name: 'Houston', type: 'municipality', c: [-95.36, 29.76] };
assert.ok(pickPlace('Astro Stadium', [houston]).error);
// a part of a bigger place, and the nicknames for it ("Terminal B at George Bush airport")
assert.deepEqual(splitWithin('Terminal B at George Bush airport'), { part: 'Terminal B', within: 'George Bush Intercontinental Airport' });
assert.deepEqual(splitWithin('IAH Terminal B'), { part: 'Terminal B', within: 'George Bush Intercontinental Airport' });
assert.deepEqual(splitWithin('the food court inside Memorial City Mall, TX'), { part: 'food court', within: 'Memorial City Mall' });
assert.deepEqual(splitWithin('Katy'), { part: 'Katy', within: '' });
assert.equal(applyPlaceAlias('George Bush Intercontinental Airport'), 'George Bush Intercontinental Airport', 'the full name stays as is');
assert.equal(applyPlaceAlias('Houston Intercontinental Airport'), 'George Bush Intercontinental Airport'); assert.equal(applyPlaceAlias('Hobby airport'), 'William P. Hobby Airport');
assert.equal(applyPlaceAlias('InterContinental Houston Medical Center'), 'InterContinental Houston Medical Center', 'a hotel is not the airport');
assert.equal(applyPlaceAlias('Memorial Hermann Medical Center'), 'Memorial Hermann Medical Center'); assert.equal(applyPlaceAlias('med center'), 'Texas Medical Center');
assert.ok(mentions('Terminal B, George Bush Intercontinental Airport', 'Terminal B')); assert.ok(!mentions('George Bush Intercontinental Airport, Houston', 'Terminal B'));
assert.ok(mentions('The Grove at Katy, Katy', 'the Grove'));
// big places are framed whole: an airport (~6.6 km) lands around zoom 13, not the 17.2 used for a landmark
const iah = [-95.371, 29.9532, -95.3086, 30.0101];
assert.ok(extentMeters(iah) > 6000 && extentMeters(iah) < 7000); assert.ok(extentMeters([-95.3700, 29.7600, -95.3695, 29.7604]) < BIG_PLACE_M, 'one building is small');
assert.ok(zoomForBox(iah, 900) > 12.5 && zoomForBox(iah, 900) < 14, 'airport zoom ' + zoomForBox(iah, 900)); assert.ok(zoomForBox(iah) < ZOOM.poi - 3);
assert.deepEqual(fromNominatim([{ lat: '29.98', lon: '-95.34', display_name: 'George Bush Intercontinental Airport, Houston, Harris County, Texas, United States', name: 'George Bush Intercontinental Airport', addresstype: 'aeroway', boundingbox: ['29.9532', '30.0101', '-95.3710', '-95.3086'] }])[0].bbox, iah, 'the extent comes through');
{ const air = { t: 'George Bush Intercontinental Airport, Houston', name: 'George Bush Intercontinental Airport', type: 'poi', c: [-95.34, 29.98], bbox: iah };
  assert.deepEqual(pickPlace('George Bush Intercontinental Airport', [air]).bbox, iah, 'a landmark keeps its extent'); }
assert.deepEqual(pickPlace('Houston city center', [houston]), { c: houston.c, label: 'Houston, Texas', kind: 'town' });
const park = { t: 'Daikin Park, 501 Crawford St, Houston, Texas', name: 'Daikin Park', type: 'poi', c: [-95.3555, 29.7573] };
const other = { t: 'Park Ln, Houston, Texas', name: 'Park Ln', type: 'street', c: [-95.4, 29.8] };
assert.equal(pickPlace('Daikin Park, Houston', [houston, other, park]).label, park.t);
assert.equal(pickPlace('Daikin Park, Houston', [houston, other, park]).kind, 'poi');
const addr = { t: '1004 Priya Lane, Waller, Texas 77484', name: 'Priya Lane', type: 'address', c: [-95.9, 30.05] };
assert.equal(pickPlace('1004 Priya ln', [addr]).kind, 'address');
assert.ok(ZOOM.address >= 17.5 && ZOOM.poi >= 17, 'single building / landmark is close up');
// "downtown Houston" is the district, not a bar called "Downtown Split" and not the whole city
const dtSplit = { t: 'Downtown Split, Houston, Texas 77006', name: 'Downtown Split', type: 'poi', c: [-95.39, 29.74] };
const dt = { t: 'Downtown, Houston, Texas', name: 'Downtown', type: 'neighbourhood', c: [-95.366, 29.758], bbox: [-95.375, 29.748, -95.353, 29.769] };
const dtPick = pickPlace('downtown Houston', [dtSplit, dt, houston]);
assert.equal(dtPick.kind, 'area'); assert.equal(dtPick.label, dt.t); assert.deepEqual(dtPick.bbox, dt.bbox);
assert.ok(ZOOM.area >= 14, 'a district opens at block level');
// the geocoders often return no "Downtown" area at all: then the interchange / tower must not stand in for it
assert.ok(pickPlace('downtown Houston', [dtSplit, houston], ['Houston']).error, 'Downtown Split is not downtown');
assert.ok(pickPlace('Downtown Houston, TX', [{ t: 'JPMorgan Chase Tower, 600 Travis Street, Downtown, Houston', name: 'JPMorgan Chase Tower', type: 'poi', c: [-95.364, 29.760] }], ['Houston']).error, 'a tower in downtown is not downtown');
// built-in districts: a real outline and a wide view
for (const q of ['Downtown Houston', 'downtown Houston, TX', 'Downtown Houston, Texas', 'the downtown houston area', 'Houston downtown', 'Houston CBD']) assert.equal(districtFor(q)?.name, 'Downtown Houston', q);
for (const q of ['Downtown Katy', 'Downtown Split', 'JPMorgan Chase Tower', 'Houston', 'downtown']) assert.equal(districtFor(q), null, q);
const D = districtFor('Downtown Houston'); assert.equal(D.geom.type, 'Polygon'); assert.ok(D.zoom < ZOOM.area, 'wider than a neighbourhood default');
const inPoly = (pt, ring) => { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) ins = !ins; } return ins; };
for (const [n, pt] of [['City Hall', [-95.3693, 29.7604]], ['Daikin Park', [-95.3555, 29.7573]], ['George R. Brown', [-95.3597, 29.7520]], ['Toyota Center', [-95.3621, 29.7508]], ['JPMorgan Chase Tower', [-95.3640, 29.7597]]]) assert.ok(inPoly(pt, D.geom.coordinates[0]), n + ' inside the downtown outline');
assert.ok(!inPoly([-95.39, 29.74], D.geom.coordinates[0]), 'Midtown is outside');
assert.equal(pickPlace('Daikin Park Houston', [houston, dt, park]).kind, 'poi', 'a landmark named in full still wins');
assert.equal(pickPlace('Cypress', [{ t: 'Cypress, Texas', name: 'Cypress', type: 'place', c: [-95.69, 29.97] }]).kind, 'town');
// a street that only shares the city's name is not the place ("C. Baldwin Hotel, Houston" flew to Houston Avenue, Pasadena)
const pas = { t: 'Houston Avenue, Pasadena, Texas 77502', name: 'Houston Avenue', type: 'street', c: [-95.2, 29.69] }, towns = ['Houston', 'Katy', 'Pasadena'];
assert.ok(pickPlace('C. Baldwin Hotel, Houston', [pas], towns).error);
assert.ok(pickPlace('Baldwin Hotel in Houston', [pas], towns).error);
assert.ok(pickPlace('Minute Maid Park, Houston, TX', [pas], towns).error);
assert.ok(pickPlace('Washington Avenue, Houston', [pas], towns).error, 'street type alone is not a match');
assert.ok(pickPlace('Daikin Park, Houston', [other], towns).error, 'venue word alone is not a match');
assert.equal(pickPlace('Houston Avenue, Pasadena', [pas], towns).label, pas.t);
const osm = fromNominatim([{ lat: '29.7577', lon: '-95.3647', name: 'C. Baldwin', addresstype: 'tourism', display_name: 'C. Baldwin, 400, Dallas Street, Downtown, Houston, Harris County, Texas, 77002, United States' }]);
assert.equal(osm[0].t, 'C. Baldwin, 400 Dallas Street, Downtown, Houston, Texas');
assert.equal(pickPlace('C. Baldwin Hotel, Houston', osm, towns).kind, 'poi');
// "Tell me more about …" follow-up
assert.deepEqual(withTellMore(['Take me there', 'Show hotels nearby'], 'Daikin Park, 501 Crawford St'), ['Tell me more about Daikin Park', 'Take me there', 'Show hotels nearby']);
assert.equal(withTellMore(['a', 'b', 'c', 'd'], 'X').length, 4);
assert.deepEqual(withTellMore(['Tell me more about it'], 'X'), ['Tell me more about it']);
assert.deepEqual(withTellMore(['a'], ''), ['a']);
// pills above the Ask AI button
const sf = suggestQuestions({ card: { kind: 'filing', name: 'George R Brown Convention Center Buildout', dev: 'Houston First Corporation' } });
assert.ok(sf.length >= 3 && sf.length <= 5); assert.match(sf[0], /^Tell me more about George R Brown/); assert.ok(sf.some(q => /Houston First/.test(q)));
assert.ok(sf.every(q => q.length <= 60), 'short enough for a pill: ' + sf.join(' | '));
const sb = suggestQuestions({ card: { kind: 'building', label: '2200 Texas Ave, Houston, TX 77003' } }); assert.equal(sb[0], 'Who owns 2200 Texas Ave?');
const sm = suggestQuestions({ near: 'Katy', zoom: 12, inView: 41, changed: 3 });
assert.ok(sm.includes('What is being built near Katy?') && sm.includes('Summarize the 41 filings in view') && sm.length <= 5);
// anywhere in the world: ask when several places fit a bare name
const NM = (name, type, lat, lon, imp, cc, state, country, extra = '') => ({ name, addresstype: type, lat: String(lat), lon: String(lon), importance: imp, address: { country_code: cc, state, country },
  display_name: [name, extra, state, cc === 'us' ? 'United States' : country].filter(Boolean).join(', ') });
const parisR = fromNominatim([NM('Paris', 'city', 48.85, 2.35, 0.88, 'fr', 'Île-de-France', 'France', 'Paris'), NM('Paris', 'city', 33.66, -95.55, 0.52, 'us', 'Texas', 'United States', 'Lamar County'),
  NM('Paris', 'town', 43.2, -80.38, 0.41, 'ca', 'Ontario', 'Canada'), NM('Paris', 'city', 36.3, -88.33, 0.45, 'us', 'Tennessee', 'United States')]);
assert.deepEqual(placeCandidates('Paris', parisR).map(c => c.label), ['Paris, France', 'Paris, Texas'], 'Paris: France or the Texas namesake, not minor ones');
assert.match(pickPlace('Paris, France', parisR).label, /France$/);
const lyonR = fromNominatim([NM('Lyon', 'city', 45.76, 4.83, 0.8, 'fr', 'Auvergne-Rhône-Alpes', 'France', 'Métropole de Lyon'), NM('Lyon', 'village', 32.1, -90.2, 0.3, 'us', 'Mississippi', 'United States')]);
assert.equal(placeCandidates('Lyon', lyonR), null, 'one clear Lyon'); assert.equal(pickPlace('Lyon', lyonR).kind, 'town');
assert.deepEqual(placeCandidates('Georgia', fromNominatim([NM('Georgia', 'country', 42.3, 43.4, 0.86, 'ge', null, 'Georgia'), NM('Georgia', 'state', 32.6, -83.4, 0.82, 'us', 'Georgia', 'United States')])).map(c => c.label), ['Georgia (country)', 'Georgia (US state)']);
assert.equal(placeCandidates('Dallas', fromNominatim([NM('Dallas', 'city', 32.78, -96.8, 0.78, 'us', 'Texas', 'United States'), NM('Dallas', 'city', 33.92, -84.84, 0.4, 'us', 'Georgia', 'United States')])), null, 'Dallas is Dallas');
const de = fromNominatim([NM('Germany', 'country', 51.1, 10.4, 0.92, 'de', null, 'Germany')]); assert.equal(pickPlace('Germany', de).kind, 'country'); assert.ok(ZOOM.country < 6 && ZOOM.region <= 6.5);
const sfar = suggestQuestions({ far: 'Lyon, Auvergne-Rhône-Alpes, France', zoom: 11, inView: 0 });
assert.deepEqual(sfar.slice(0, 2), ['Tell me about Lyon', 'What is being built in Lyon?'], 'outside Texas: questions about that place');
const sw = suggestQuestions({ zoom: 6 }); assert.ok(sw.length >= 1 && sw.length <= 5 && !sw.some(q => /near undefined|in view/.test(q)));

// framing several filings
const f = frame([[-95.70, 29.97], [-95.701, 29.971]]); assert.ok(f.zoom > 16 && f.zoom <= 17.5, 'close group stays close: ' + f.zoom);
assert.ok(frame([[-95.9, 30.0], [-95.3, 29.7]]).zoom < 12, 'spread group zooms out');
// follow-up pills and plain text
let fu = splitFollowups('Waller has 37 projects, est. $138M.\n[[Take me to Waller County | Show similar projects | When will IDV Brookshire finish? | a | b]]');
assert.equal(fu.text, 'Waller has 37 projects, est. $138M.'); assert.deepEqual(fu.pills, ['Take me to Waller County', 'Show similar projects', 'When will IDV Brookshire finish?', 'a']);
assert.deepEqual(splitFollowups('No pills here.'), { text: 'No pills here.', pills: [] });
assert.equal(plainText('Waller County has **about est. $138.0M across 37 projects** and (**est. $40.1M**) TABS1'), 'Waller County has about est. $138.0M across 37 projects and (est. $40.1M) TABS1');
assert.equal(plainText('## Top\n* one\n- two\n1. three'), 'Top\n• one\n• two\n1. three');
assert.equal(plainText('est. $5M * 2 rooms'), 'est. $5M * 2 rooms', 'a lone asterisk stays');
// nearest-place categories
assert.equal(categoryOf('airports'), 'airport'); assert.equal(categoryOf('gas station'), 'gas'); assert.equal(categoryOf('nearest restaurant'), 'restaurant'); assert.equal(categoryOf('H-E-B'), 'grocery'); assert.equal(categoryOf("Buc-ee's"), null);
assert.match(overpassQuery(null, "Buc-ee's", 30, -95.9, 3000, 5), /"name"~"Buc-ee's",i/);
const pl = parsePlaces([{ lat: 29.99, lon: -95.34, tags: { name: 'George Bush Intercontinental', aeroway: 'aerodrome', iata: 'IAH' } }, { lat: 30.06, lon: -95.92, tags: { name: 'Ranch strip', aeroway: 'aerodrome', 'aerodrome:type': 'private' } }, { lat: 29.65, lon: -95.28, tags: { name: 'Hobby', aeroway: 'aerodrome', iata: 'HOU' } }], [30.05, -95.93], 'airport', 5);
assert.deepEqual(pl.map(p => p.code), ['IAH', 'HOU'], 'private strips dropped, nearest first'); assert.ok(pl[0].miles > 30 && pl[0].miles < 40);
// lidar roof height and floors
assert.equal(roofFromHistogram([[500, 0, 0], [0, 1, 2, 3]]).height_m, 0, 'flat ground → no building');
assert.equal(floorsFromHeight(272, 'office'), 70); assert.equal(floorsFromHeight(7, 'house'), 2); assert.equal(floorsFromHeight(1), null);
// the newer filters: status, sq ft, company, exact address, housing units
const fs = [
  { id: 'A', county: 'Harris', type: 'New', cost: 9e6, status: 'Registered', sqft: 40000, units: 120, owner: 'Hines Interests', gc: 'Tellepsen Builders', name: 'Tower' },
  { id: 'B', county: 'Harris', type: 'Reno', cost: 1e6, status: 'Closed', sqft: 3000, owner: 'H-E-B', approx: 1, name: 'Store' },
  { id: 'C', county: 'Harris', type: 'New', cost: 2e6, status: '', prec: 'street', owner: 'Smith Family', arch: 'Gensler', name: 'Clinic' }];
const ids = spec => fs.filter(makeMatcher(spec)).map(f => f.id).join('');
assert.equal(ids({ st: ['Registered', 'Unknown'] }), 'AC');
assert.equal(ids({ sqmin: 10000 }), 'A'); assert.equal(ids({ sqmax: 10000 }), 'B', 'no sq ft is not under the max');
assert.equal(ids({ co: 'tellepsen' }), 'A'); assert.equal(ids({ co: 'gensler' }), 'C'); assert.equal(ids({ co: 'tower' }), '', 'company text skips project names');
assert.equal(ids({ exact: 1 }), 'A'); assert.equal(ids({ umin: 100 }), 'A');
const spec = { st: ['Registered', 'Review complete'], sqmin: 5000, sqmax: 90000, co: 'hines', exact: 1, umin: 50 };
assert.deepEqual(decode(encode(spec)), spec, 'new fields survive a link round trip');
assert.match(describe(spec), /5,000–90,000 sq ft.*50\+ units.*Company: “hines”.*Exact addresses only/);
a = cleanFilterArgs({ sqft_min: 0, sqft_max: 5000, status: ['Registered', 'Review complete', 'Inspection complete', 'Closed'], company: ' ', exact_only: false, min_units: -1 });
assert.deepEqual(a, { sqft_max: 5000 }, 'empty / all-status / false filters dropped');
// chat replies: numbered and bulleted lines become real lists, a short "…:" line above a list is its lead-in
assert.equal(textBlocks('Summary of 13 filings.\n\nLargest projects:\n1. Tower, est. $9M\n2. Clinic\n• note'),
  '<p>Summary of 13 filings.</p><p class="lead">Largest projects:</p><ol><li>Tower, est. $9M</li><li>Clinic</li></ol><ul><li>note</li></ul>');
assert.equal(textBlocks('One line\nnext line'), '<p>One line<br>next line</p>');
// business search: OpenStreetMap shops and services only, Comptroller rows merged without duplicates
const bq = businessQuery('St. Luke (Katy)', 29.7, -95.8, 8000, 8);
assert.match(bq, /\["name"~"St\. Luke \.Katy\.",i\]\[~"\^\(shop\|amenity/); assert.ok(!/\\/.test(bq), 'no backslashes for Overpass');
const mb = mergeBusinesses([{ name: 'Starbucks', kind: 'cafe', address: '123 Main St, Katy', lat: 29.7, lon: -95.8, miles: 1.2 }],
  [{ name: 'STARBUCKS #1234', addr: '123 MAIN ST STE 4', city: 'Katy' }, { name: 'STARBUCKS #99', addr: '9 ELM RD', city: 'Katy', zip: '77494' }]);
assert.deepEqual(mb.map(b => b.src + ':' + b.name), ['osm:Starbucks', 'comptroller:STARBUCKS #99'], 'same store from both sources listed once');
assert.equal(mb[1].address, '9 ELM RD, Katy');
assert.equal(nameQuery("Buc-ee's", ['Katy', 'Waller']), "(upper(outlet_name) like '%BUC-EE''S%' OR upper(taxpayer_name) like '%BUC-EE''S%') AND upper(outlet_city) in ('KATY', 'WALLER')");
assert.equal(nameQuery('ab', ['Katy']), null, 'too short'); assert.equal(nameQuery('starbucks', []), null, 'needs towns');
// past exports: newest 50 files within the size cap stay; older ones stay listed without their file
const hist = Array.from({ length: 55 }, (_, i) => ({ id: 'r' + i, size: 1e6, stored: true }));
const pr = pruneReports(hist);
assert.equal(pr.keep.filter(r => r.stored).length, 50); assert.deepEqual(pr.drop, ['r50', 'r51', 'r52', 'r53', 'r54']); assert.equal(pr.keep.length, 55);
assert.deepEqual(pruneReports([{ id: 'a', size: 9e7, stored: true }, { id: 'b', size: 9e7, stored: true }]).drop, ['b'], 'size cap');
assert.equal(fmtBytes(2.5e6), '2.5 MB'); assert.equal(fmtBytes(800), '800 B');
// demographics from the tract data: the tract at the point plus tracts within the radius, household-weighted medians
const sq = (x, y, d = .01) => ({ type: 'Polygon', coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]] });
const tr = [{ g: 'a', pop: 1000, inc: 50000, hu: 400, vac: 0, val: 200000, rent: 1000, age: 30, gr: 25, geom: sq(-96, 30) },
  { g: 'b', pop: 3000, inc: 100000, hu: 1300, vac: 100, val: 400000, rent: 2000, age: 40, gr: 0, geom: sq(-96.02, 30) },
  { g: 'c', pop: 9999, inc: 1, hu: 1, vac: 0, geom: sq(-95, 31) }];
assert.ok(inGeom([-95.995, 30.005], tr[0].geom));
const near = tractsFor(tr, { c: [-95.995, 30.005], mi: 2 });
assert.deepEqual(near.map(t => t.g), ['a', 'b'], 'far tract left out');
const dm = summarizeTracts(near);
assert.equal(dm.population, 4000); assert.equal(dm.median_household_income_approx, 87500, 'weighted by households 400 : 1200');
assert.equal(dm.vacancy_rate_pct, 5.9); assert.equal(dm.population_growth_pct, 5.3);
assert.deepEqual(tractsFor(tr, { geom: { type: 'MultiPolygon', coordinates: [sq(-95.5, 30.5, 1).coordinates] } }).map(t => t.g), ['c'], 'county outline');
assert.equal(summarizeTracts([]), null);
console.log('assistant ok');

// voice: the transcriber echoing its own hint list is not something the user said
{ const v = 'Houston area, Texas. Cypress, Katy, Fulshear, Brookshire, Waller, Hempstead, Prairie View, Hockley, TDLR, TABS, Finishes Solutions, multifamily, Waller, Harris, TxDOT District Houston';
  assert.ok(isPromptEcho('Houston area, Texas. Cypress, Katy, Fulshear, Brookshire, Waller, Hempstead, Prairie View, Hockley, Tomball, TxDOT District Houston', v), 'echo of the hint list');
  assert.ok(isPromptEcho('Cypress, Katy, Fulshear, Brookshire.', v));
  for (const t of ['Take me to the JP Morgan Chase Tower and tell me about it.', 'Show multifamily in Katy', 'Compare Katy, Cypress, Waller.', 'Katy and Cypress, which has more?']) assert.ok(!isPromptEcho(t, v), t);
  assert.ok(!isPromptEcho('Cypress, Katy, Fulshear', ''), 'no hint list, no echo'); }
// the echo stripped from a real sentence; names the user lists themselves stay
{ const v = 'Houston, Texas commercial real estate. Katy, Cypress, Sugar Land, The Woodlands, Pearland, Conroe, Tomball, Fulshear, TDLR, TABS, multifamily';
  assert.equal(stripEcho('Show me multifamily near Katy. Katy, Cypress, Sugar Land, The Woodlands, Pearland.', v), 'Show me multifamily near Katy', 'echo tail removed');
  assert.equal(stripEcho('Katy Cypress Sugar Land The Woodlands Pearland Conroe', v), '', 'comma-free echo');
  assert.equal(stripEcho('Katy, Cypress and Sugar Land', v), '', 'and glue');
  assert.equal(stripEcho('Compare Katy, Tomball, Cypress.', v), 'Compare Katy, Tomball, Cypress.', 'out of list order: the user said it');
  assert.equal(stripEcho('Compare Katy and Cypress', v), 'Compare Katy and Cypress', 'two places is a request');
  assert.equal(stripEcho('Take me to the Galleria', v), 'Take me to the Galleria');
  assert.equal(stripEcho('Katy, Cypress, Sugar Land', ''), 'Katy, Cypress, Sugar Land', 'no hint list'); }
console.log('assistant echo ok');

// voice turns: one reply at a time, retries, no double answers
{ const { createTurns, withTimeout, createVoiceLog } = await import('../lib/voice-state.mjs');
  const mk = () => { const sent = [], st = [], timers = new Map(); let id = 0;
    const t = createTurns({ send: o => sent.push(o.type), onStatus: s => st.push(s), setTimer: (f, ms) => { timers.set(++id, { f, ms }); return id; }, clearTimer: i => timers.delete(i) });
    const fire = ms => { for (const [k, v] of [...timers]) if (v.ms === ms) { timers.delete(k); v.f(); } };
    return { t, sent, st, fire, timers }; };
  { const { t, sent, fire } = mk(); t.committed('a'); assert.equal(t.transcript('a', true), true); t.created(); fire(7000); assert.equal(sent.length, 1, 'transcript answered: the no-transcript fallback does not fire again');
    assert.equal(t.transcript('a', true), false, 'late duplicate transcript never answers twice'); }
  { const { t, sent } = mk(); t.committed('a'); t.transcript('a', true); t.created(); t.committed('b'); t.transcript('b', true); assert.equal(sent.length, 1, 'second turn waits');
    assert.equal(t.done('completed'), 'queued'); assert.equal(sent.length, 2, 'then it goes'); }
  { const { t, sent } = mk(); t.committed('a'); t.fire; t.transcript('a', false); assert.equal(sent.length, 0, 'dropped turn'); }
  { const { t, sent, fire } = mk(); t.committed('a'); fire(7000); assert.equal(sent.length, 1, 'no transcript: reply from the audio'); }
  { const { t, sent, st } = mk(); t.transcript('a', true); t.created(); assert.equal(t.done('failed'), 'retry'); assert.equal(sent.length, 2); t.created(); assert.equal(t.done('failed'), 'failed'); assert.deepEqual(st, ['failed'], 'second failure is reported'); }
  { const { t, sent, st, fire } = mk(); t.transcript('a', true); fire(5000); assert.equal(sent.length, 2, 'no reply started: one retry'); fire(5000); assert.deepEqual(st, ['noreply']); assert.equal(t.busy, false); }
  { const { t, sent } = mk(); t.transcript('a', true); t.created(); assert.equal(t.done('completed', { calls: 1 }), 'tools'); t.toolsDone(); assert.equal(sent.length, 2); }
  { const { t, st, fire } = mk(); t.transcript('a', true); t.created(); fire(45000); assert.deepEqual(st, ['stuck']); assert.equal(t.busy, false); }
  { const { t, sent } = mk(); t.alreadyActive(); t.transcript('a', true); assert.equal(sent.length, 0); t.done('completed'); assert.equal(sent.length, 1, 'sent once the running reply ends'); }
  assert.deepEqual(await withTimeout(new Promise(() => {}), 20, { error: 'timed out' }), { error: 'timed out' });
  assert.equal(await withTimeout(Promise.resolve(5), 1000, 0), 5);
  const vl = createVoiceLog(3); for (let i = 0; i < 5; i++) vl.add('e' + i); assert.deepEqual(vl.list().map(r => r.type), ['e2', 'e3', 'e4']); }
console.log('assistant voice turns ok');

// follow_aircraft: by callsign (any spacing / case), hex or registration; with no id the nearest airborne plane
{ const ac = [{ hex: 'a0b1c2', flight: 'N123AB', reg: 'N123AB', ground: true }, { hex: 'abc123', flight: 'DAL1601', reg: 'N812DN' }, { hex: 'a77777', flight: 'UAL1234', reg: 'N-777UA' }];
  assert.equal(pickAircraft(ac, 'dal 1601').hex, 'abc123'); assert.equal(pickAircraft(ac, 'ABC123').flight, 'DAL1601');
  assert.equal(pickAircraft(ac, 'n777ua').hex, 'a77777'); assert.equal(pickAircraft(ac, '').hex, 'abc123', 'skips the plane on the ground');
  assert.equal(pickAircraft(ac, 'SWA9'), null); assert.equal(pickAircraft([ac[0]], '').hex, 'a0b1c2'); assert.equal(pickAircraft([], ''), null);
  assert.deepEqual(['BOEING 737-800', 'AIRBUS A-321neo', 'DE HAVILLAND CANADA DHC-8-400', ''].map(aircraftName), ['Boeing 737-800', 'Airbus A-321neo', 'De Havilland Canada DHC-8-400', null]); }

// ---- rulebook and camera ----
{ const { TOOLS, systemPrompt, VOICE_STYLE } = await import('../lib/agent-tools.mjs'), { RULEBOOK, SECTIONS } = await import('../lib/rulebook.mjs'), { cameraMove } = await import('../lib/assist-logic.mjs');
  const names = new Set(TOOLS.map(t => t.name));
  for (const n of names) assert.ok(RULEBOOK.includes(n), 'rulebook mentions tool ' + n);
  const mentioned = new Set((RULEBOOK.match(/\b[a-z]+(?:_[a-z]+)+\b/g) || []).filter(w => !['start_month', 'finish_month', 'show_on_map', 'nasa_imagery'].includes(w)));
  for (const n of mentioned) assert.ok(names.has(n), 'rulebook names a tool that does not exist: ' + n);
  assert.equal(names.size, TOOLS.length, 'tool names are unique');
  for (const [title, rules] of SECTIONS) { assert.ok(title && rules.length, 'section ' + title); for (const r of rules) assert.ok(r.length < 900, 'rule stays one readable line: ' + r.slice(0, 40)); }
  const p = systemPrompt({ coverage: 'x', filters: 'none', screen: 'View: map', followups: true });
  assert.ok(p.includes(RULEBOOK) && /Pick the right tool:/.test(p) && /double square brackets/.test(p)); assert.ok(p.length < 12000, 'prompt stays bounded: ' + p.length);
  assert.ok(!/double square brackets/.test(systemPrompt({})), 'no pills unless asked'); assert.match(VOICE_STYLE, /confirm what changed/);
  const c = { center: [-95.7, 30], zoom: 12, bearing: 170, pitch: 60, bounds: [-96, 29.8, -95.4, 30.2] };
  assert.equal(cameraMove(c, { action: 'zoom_out', amount: 'little' }).zoom, 11.3);
  assert.equal(cameraMove({ ...c, zoom: 18.5 }, { action: 'zoom_in', amount: 'lot' }).zoom, 19, 'zoom clamped');
  assert.equal(cameraMove(c, { action: 'rotate', direction: 'right' }).bearing, -145, 'bearing wraps');
  assert.equal(cameraMove(c, { action: 'tilt_up', amount: 'lot' }).pitch, 70, 'pitch clamped');
  assert.equal(cameraMove(c, { action: 'tilt_down', amount: 'lot' }).pitch, 25);
  assert.deepEqual(cameraMove(c, { action: 'pan', direction: 'north' }).center, [-95.7, 30.2]);
  assert.deepEqual(cameraMove(c, { action: 'pan', direction: 'west', amount: 'lot' }).center, [-96.3, 30]);
  assert.ok(cameraMove(c, { action: 'rotate' }).error && cameraMove(c, { action: 'pan' }).error && cameraMove(c, { action: 'spin' }).error);
  assert.ok(cameraMove(c, { action: 'orbit' }).orbit && cameraMove(c, { action: 'stop' }).stop && cameraMove(c, { action: 'region' }).region);
  assert.equal(cameraMove(c, { action: 'north_up' }).bearing, 0); assert.equal(cameraMove(c, { action: 'flat' }).pitch, 0); }
console.log('assistant rulebook ok');
