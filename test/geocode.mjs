// Address clean-up, highway spelling variants and the no-house-number parsers used by build/geocode.mjs.
import assert from 'node:assert/strict';
import { cleanStreet, streetVariants, parseCross, parseStreetOnly, geocodeRows, MISS_V } from '../build/geocode.mjs';
assert.ok(streetVariants('12206 Interstate 45 N').includes('12206 I-45 N'));
assert.ok(streetVariants('10004 Highway 6').includes('10004 State Highway 6'));
assert.ok(streetVariants('4435 FM 762 Road').includes('4435 FM 762'));
assert.deepEqual(parseCross('Intersection of Spacek Rd. and Evergreen Falls Dr.'), ['Spacek Rd', 'Evergreen Falls Dr']);
assert.deepEqual(parseCross('Kingsland Blvd and Pappas Dr.'), ['Kingsland Blvd', 'Pappas Dr']);
assert.equal(parseCross('3712 Autry Park Dr & 5'), null, 'a house number with & is an address, not a junction');
assert.equal(parseCross('From: W Commerce St (South) To: US 290'), null);
assert.equal(parseCross('Empress Dr, Princess Dr, Outlook Dr and Freemont'), null, 'lists of streets stay at the town');
assert.equal(parseStreetOnly('0 Mason Road'), 'Mason Road'); assert.equal(parseStreetOnly('Bevis Street'), 'Bevis Street');
assert.equal(parseStreetOnly('Montgomery County'), null); assert.equal(parseStreetOnly('7612 Fry Rd'), null);
assert.equal(cleanStreet('1550 Lamar Floors 11, 12 & 14'), '1550 Lamar'); assert.equal(cleanStreet('3875 Holman Street Room 202'), '3875 Holman Street');

// geocodeRows: an old miss is retried; a failed Census batch is not cached as a miss; junctions come from OpenStreetMap
const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)); calls.push(u.host + u.pathname);
  const json = o => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (u.pathname.endsWith('/addressbatch')) return new Response('busy', { status: 503 });
  if (u.pathname.endsWith('/onelineaddress')) return json({ result: { addressMatches: /I-45/.test(u.searchParams.get('address')) ? [{ coordinates: { x: -95.55, y: 30.40 }, addressComponents: { zip: '77378' } }] : [] } });
  if (u.host === 'overpass-api.de') { const ql = decodeURIComponent(String(opts.body)); return json({ elements: /node\(w\.a\)\(w\.b\)/.test(ql) ? [{ type: 'node', lat: 29.55, lon: -95.75 }] : [] }); }
  return json({ features: [], results: [] });
};
const cache = { '12206 interstate 45 n|willis|77378': { c: null, src: null, at: '2026-10-01', v: 3 } };
const rows = [{ ProjectNumber: 'T1', st: '12206 Interstate 45 N', street: '12206 Interstate 45 N', city: 'Willis', zip: '77378' },
  { ProjectNumber: 'T2', st: 'Intersection of Spacek Rd', street: 'Intersection of Spacek Rd. and Evergreen Falls Dr.', city: 'Rosenberg', zip: '77469' },
  { ProjectNumber: 'T3', st: '7612 Fry Rd', street: '7612 Fry Rd', city: 'Cypress', zip: '77433' }];
const places = [['Willis', -95.48, 30.42], ['Rosenberg', -95.80, 29.56], ['Cypress', -95.70, 29.97]];
const out = await geocodeRows(rows, cache, { key: 'k', bbox: [-97.6, 28.6, -94.2, 31.4], places, addressPoints: false, budget: { nominatim: 0 } });
assert.equal(out.T1.via, 'census', 'old miss retried with the I-45 spelling'); assert.deepEqual(out.T1.c, [-95.55, 30.4]);
assert.equal(out.T2.via, 'intersection'); assert.deepEqual(out.T2.c, [-95.75, 29.55]);
assert.equal(out.T3.src, 'city', 'still unplaced this run');
assert.equal(cache['7612 fry rd|cypress|77433'], undefined, 'the Census batch failed, so no miss is cached: it is retried next run');
assert.equal(cache['12206 interstate 45 n|willis|77378'].src, 'census');
console.log('geocode helpers ok');
