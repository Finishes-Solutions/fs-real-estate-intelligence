// Where you are survives a reload: the camera, property card, site plan and project in the address (lib/urlstate.mjs),
// and the map search's "this is an address" check (Enter waits for the address lookup).
import assert from 'node:assert/strict';
import { camStr, parseCam, parseLatLng, parsePlanRef, startHash, showsFilings, hasSpec, looksLikeAddress } from '../lib/urlstate.mjs';

// camera round trip; a flat, north-up view stays three numbers (the same as a copied link)
assert.equal(camStr({ lat: 29.98123456, lng: -95.72, zoom: 7.7 }), '29.98123,-95.72000,7.70');
const tilted = camStr({ lat: 29.7604, lng: -95.3698, zoom: 17.25, bearing: -32.44, pitch: 55 });
assert.equal(tilted, '29.76040,-95.36980,17.25,-32.4,55.0');
assert.deepEqual(parseCam(tilted), { center: [-95.3698, 29.7604], zoom: 17.25, bearing: -32.4, pitch: 55 });
assert.deepEqual(parseCam('29.9,-95.7,10'), { center: [-95.7, 29.9], zoom: 10, bearing: 0, pitch: 0 });
for (const bad of ['', 'x', '29.9,-95.7', '29.9,-95.7,10,5', '95,-95.7,10', '29.9,-195,10', '29.9,-95.7,0.5', '29.9,-95.7,30', '29.9,-95.7,NaN'])
  assert.equal(parseCam(bad), null, bad);
assert.equal(parseCam('29.9,-95.7,10,0,200').pitch, 85);

// property card and site plan references
assert.deepEqual(parseLatLng('29.760400,-95.369800'), [-95.3698, 29.7604]);
assert.equal(parseLatLng('29.7'), null); assert.equal(parseLatLng('100,1'), null);
assert.deepEqual(parsePlanRef('mgz1abcd3kq2.mgz1abce9xx1'), ['mgz1abcd3kq2', 'mgz1abce9xx1']);
for (const bad of ['', 'abc', 'a.b.c', 'mgz1abcd3kq2.', 'mgz1<x>.mgz1abce9xx1']) assert.equal(parsePlanRef(bad), null, bad);

// the bare page comes back to the last address kept on this device; a link with anything in it wins
assert.equal(startHash('', 'd=2025-01_2026-09&ml=29.9,-95.7,12'), 'd=2025-01_2026-09&ml=29.9,-95.7,12');
assert.equal(startHash('f=abc', 'ml=29.9,-95.7,12'), 'f=abc');
assert.equal(startHash('', null), '');

// where-you-are keys and the date range never turn the filing dots on; a real filter does
const keys = s => [...new URLSearchParams(s).keys()];
assert.equal(showsFilings(keys('d=2025-01_2026-09&ml=29.9,-95.7,12&b=29.7,-95.3&pj=x&sp=a1b2.c3d4&v=projects')), false);
assert.equal(showsFilings(keys('d=2025-01_2026-09&t=retail')), true);
assert.equal(hasSpec(keys('ml=29.9,-95.7,12&b=29.7,-95.3')), false);
assert.equal(hasSpec(keys('d=2025-01_2026-09&ml=29.9,-95.7,12')), true);

// Enter on an address waits for the address lookup; names and places don't
for (const q of ['1004 Priya Ln', '12b Main St', ' 300 W 5th']) assert.ok(looksLikeAddress(q), q);
for (const q of ['Starbucks', '77494', 'Katy', '29.7, -95.3', '1004']) assert.ok(!looksLikeAddress(q), q);

console.log('url state ok');
