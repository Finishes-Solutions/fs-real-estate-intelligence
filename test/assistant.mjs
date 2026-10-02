// Assistant tool helpers: filter clean-up, geocoder result picking and framing.
import assert from 'node:assert/strict';
import { cleanFilterArgs, pickPlace, districtFor, isPromptEcho, fromNominatim, withTellMore, suggestQuestions, frame, ZOOM, splitFollowups, plainText, textBlocks } from '../lib/assist-logic.mjs';
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
console.log('assistant echo ok');
