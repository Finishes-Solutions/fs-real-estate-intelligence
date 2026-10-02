// Assistant tool helpers: filter clean-up, geocoder result picking and framing.
import assert from 'node:assert/strict';
import { cleanFilterArgs, pickPlace, frame, ZOOM, splitFollowups, plainText } from '../lib/assist-logic.mjs';
import { USES } from '../lib/taxonomy.mjs';
import { categoryOf, parsePlaces, overpassQuery } from '../lib/nearby.mjs';
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
assert.equal(pickPlace('Daikin Park Houston', [houston, dt, park]).kind, 'poi', 'a landmark named in full still wins');
assert.equal(pickPlace('Cypress', [{ t: 'Cypress, Texas', name: 'Cypress', type: 'place', c: [-95.69, 29.97] }]).kind, 'town');

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
console.log('assistant ok');
