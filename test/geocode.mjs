// Address clean-up, highway spelling variants and the no-house-number parsers used by build/geocode.mjs.
import assert from 'node:assert/strict';
import { cleanStreet, streetVariants, parseCross, parseStreetOnly, geocodeRows, MISS_V, streetMatch, streetName } from '../build/geocode.mjs';
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
  if (u.host === 'api.maptiler.com') { const q = decodeURIComponent(u.pathname);
    if (/^\/geocoding\/Austin, Texas/.test(q)) return json({ features: [{ place_type: ['county'], text: 'Austin County', center: [-96.24, 29.89] }] });
    if (/^\/geocoding\/Sealy, Texas/.test(q)) return json({ features: [{ place_type: ['county'], text: 'Austin County', center: [-96.24, 29.89] }, { place_type: ['municipality'], text: 'Sealy', center: [-96.157, 29.781] }] });
    if (/Waxwing/i.test(q)) return json({ features: [{ place_type: ['address'], text: 'Waxwing Drive', place_name: 'Waxwing Drive, Brookshire, Texas 77423, United States', center: [-95.95, 29.80], context: [{ id: 'postal_code.9', text: '77423' }] }] });
    if (/Fry Rd/i.test(q)) return json({ features: [{ place_type: ['address'], text: 'Fry Road', place_name: 'Fry Road, Katy, Texas 77449, United States', center: [-95.72, 29.85] }] }); // other ZIP: rejected
  }
  return json({ features: [], results: [] });
};
const cache = { '12206 interstate 45 n|willis|77378': { c: null, src: null, at: '2026-10-01', v: 3 } };
const rows = [{ ProjectNumber: 'T1', st: '12206 Interstate 45 N', street: '12206 Interstate 45 N', city: 'Willis', zip: '77378' },
  { ProjectNumber: 'T2', st: 'Intersection of Spacek Rd', street: 'Intersection of Spacek Rd. and Evergreen Falls Dr.', city: 'Rosenberg', zip: '77469' },
  { ProjectNumber: 'T3', st: '7612 Fry Rd', street: '7612 Fry Rd', city: 'Cypress', zip: '77433' },
  { ProjectNumber: 'T4', st: '0 Waxwing Dr', street: '0 Waxwing Dr.', city: 'Brookshire', zip: '77423' }];
const places = [['Willis', -95.48, 30.42], ['Rosenberg', -95.80, 29.56], ['Cypress', -95.70, 29.97]];
const out = await geocodeRows(rows, cache, { key: 'k', bbox: [-97.6, 28.6, -94.2, 31.4], places, addressPoints: false, budget: { nominatim: 0 } });
assert.equal(out.T1.via, 'census', 'old miss retried with the I-45 spelling'); assert.deepEqual(out.T1.c, [-95.55, 30.4]);
assert.equal(out.T2.via, 'intersection'); assert.deepEqual(out.T2.c, [-95.75, 29.55]);
assert.equal(out.T3.src, 'city', 'Fry Road in another ZIP is not accepted');
assert.equal(out.T4.via, 'street', 'no house number: placed on Waxwing Drive in 77423'); assert.deepEqual(out.T4.c, [-95.95, 29.80]);
// street matching: same name, same type, same ZIP
const F = (text, zip) => ({ place_type: ['address'], text, place_name: text + ', Texas ' + zip + ', United States', center: [0, 0] });
assert.ok(streetMatch(F('Jebbia Lane', '77477'), { zip: '77477' }, 'Jebbia Ln'));
assert.ok(!streetMatch(F('Jebbia Court', '77477'), { zip: '77477' }, 'Jebbia Ln'), 'Court is not Lane');
assert.ok(!streetMatch(F('Jebbia Lane', '77478'), { zip: '77477' }, 'Jebbia Ln'), 'other ZIP');
assert.ok(!streetMatch(F('Clay Road', '77041'), { zip: '77041' }, 'Clayton Rd'), 'every word of the name must match');
assert.ok(streetMatch(F('Farm-to-Market Road 1093', '77441'), { zip: '77441' }, 'FM 1093'), 'numbered highway');
assert.equal(streetName('12907-A Fry Rd'), 'Fry Rd'); assert.equal(streetName('0 Mason Road'), 'Mason Road');
assert.equal(cache['7612 fry rd|cypress|77433'], undefined, 'the Census batch failed, so no miss is cached: it is retried next run');
assert.equal(cache['12206 interstate 45 n|willis|77378'].src, 'census');
// town-center fallback: "Austin" filed under Austin County is the City of Austin, not the county: never the county's center
const out2 = await geocodeRows([{ ProjectNumber: 'A1', st: 'xyz', street: 'xyz', city: 'Austin', zip: '78701' }, { ProjectNumber: 'A2', st: 'xyz', street: 'xyz', city: 'Sealy', zip: '77474' }], {},
  { key: 'k', bbox: [-97.3, 28.8, -94.3, 31.2], places: [], addressPoints: false, budget: { nominatim: 0 } });
assert.equal(out2.A1, undefined, 'a county match is not a town: left unmapped');
assert.equal(out2.A2.src, 'city'); assert.ok(Math.abs(out2.A2.c[0] + 96.157) < 0.02, 'the town, not the county');
console.log('geocode helpers ok');
