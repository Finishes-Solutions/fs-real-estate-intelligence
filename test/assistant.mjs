// Assistant tool helpers: filter clean-up, geocoder result picking and framing.
import assert from 'node:assert/strict';
import { cleanFilterArgs, pickPlace, frame, ZOOM, splitFollowups, plainText } from '../lib/assist-logic.mjs';
import { USES } from '../lib/taxonomy.mjs';

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
console.log('assistant ok');
