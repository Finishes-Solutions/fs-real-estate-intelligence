// MapTiler out of quota: what counts as a refusal, which keyless map stands in, and Photon search results in the
// geocoder's shape (lib/maptiler.mjs); the nightly geocoder must not cache a refusal as "address not found".
import assert from 'node:assert/strict';
import { refused, mapErrorRefused, standIn, downSince, markDown, DOWN_HOURS, photonSearchUrl, photonReverseUrl, fromPhoton } from '../lib/maptiler.mjs';
import { kindOf } from '../lib/assist-logic.mjs';
import { keyRefused, geocodeRows } from '../build/geocode.mjs';

// refusals
for (const s of [401, 403, 429]) assert.ok(refused(s));
assert.ok(refused(0, 'MapTiler Error: Monthly API request quota exceeded, account temporarily suspended.'));
assert.ok(!refused(500) && !refused(404) && !refused(0, 'Failed to fetch'));
const ajax = (status, url) => ({ error: Object.assign(new Error('AJAXError: Forbidden (' + status + '): ' + url), { status, url }) });
assert.ok(mapErrorRefused(ajax(403, 'https://api.maptiler.com/maps/dataviz/style.json?key=k')));
assert.ok(mapErrorRefused(ajax(429, 'https://api.maptiler.com/tiles/v3/14/1/2.pbf?key=k')));
assert.ok(!mapErrorRefused(ajax(403, 'https://tiles.openfreemap.org/planet/1/2/3.pbf')), 'another source failing is not MapTiler');
assert.ok(!mapErrorRefused(ajax(503, 'https://api.maptiler.com/tiles/v3/14/1/2.pbf')), 'a MapTiler hiccup is not a refusal');
assert.ok(!mapErrorRefused({}) && !mapErrorRefused(null));

// stand-ins
assert.equal(standIn('dots', false), 'https://tiles.openfreemap.org/styles/positron');
assert.equal(standIn('dots', true), 'https://tiles.openfreemap.org/styles/dark');
assert.equal(standIn('streets', false), 'https://tiles.openfreemap.org/styles/liberty');
assert.equal(standIn('topo', true), 'https://tiles.openfreemap.org/styles/dark');
assert.equal(standIn('sat', false), null);

// remembered for DOWN_HOURS, then MapTiler is tried again
const mem = new Map(), store = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
assert.equal(downSince(store), 0);
markDown(store, 1000); assert.equal(downSince(store, 1000 + 36e5), 1000); assert.equal(downSince(store, 1000 + DOWN_HOURS * 36e5 + 1), 0);
assert.equal(downSince({ getItem() { throw new Error('blocked'); } }), 0, 'blocked storage just means "not known down"');
mem.set('fs-maptiler-down', '{bad'); assert.equal(downSince(store), 0);

// Photon URLs
const u = new URL(photonSearchUrl('1004 Priya Ln', { limit: 6, prox: '-95.9,30.0', bbox: '-97.6,28.6,-94.2,31.4' }));
assert.equal(u.host, 'photon.komoot.io'); assert.equal(u.searchParams.get('q'), '1004 Priya Ln'); assert.equal(u.searchParams.get('lon'), '-95.9');
assert.equal(u.searchParams.get('lat'), '30.0'); assert.equal(u.searchParams.get('bbox'), '-97.6,28.6,-94.2,31.4'); assert.equal(u.searchParams.get('limit'), '6');
assert.ok(!new URL(photonSearchUrl('Lyon')).searchParams.has('bbox'));
assert.equal(photonReverseUrl([-95.36, 29.76]), 'https://photon.komoot.io/reverse?lon=-95.36&lat=29.76&limit=1&lang=en');

// Photon results (shapes as photon.komoot.io returns them)
const F = (properties, c = [-95.4, 29.8]) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties });
const got = fromPhoton({ features: [
  F({ osm_key: 'building', osm_value: 'house', type: 'house', housenumber: '1004', street: 'Priya Lane', city: 'Katy', state: 'Texas', postcode: '77494', countrycode: 'US', country: 'United States' }),
  F({ osm_key: 'tourism', osm_value: 'hotel', type: 'house', name: 'Hotel ZaZa', housenumber: '5701', street: 'Main Street', city: 'Houston', state: 'Texas', postcode: '77005', countrycode: 'US' }),
  F({ osm_key: 'highway', osm_value: 'secondary', type: 'street', name: 'Westheimer Road', city: 'Houston', state: 'Texas', countrycode: 'US', extent: [-95.6, 29.75, -95.38, 29.73] }),
  F({ osm_key: 'place', osm_value: 'city', type: 'city', name: 'Houston', county: 'Harris County', state: 'Texas', countrycode: 'US', extent: [-95.9, 30.1, -95.0, 29.5] }),
  F({ osm_key: 'boundary', osm_value: 'administrative', type: 'county', name: 'Harris County', state: 'Texas', countrycode: 'US' }),
  F({ osm_key: 'place', osm_value: 'neighbourhood', type: 'district', name: 'Montrose', city: 'Houston', state: 'Texas', countrycode: 'US' }),
  F({ osm_key: 'place', osm_value: 'city', type: 'city', name: 'Lyon', state: 'Auvergne-Rhône-Alpes', country: 'France', countrycode: 'FR' }, [4.83, 45.76]),
  F({ osm_key: 'place', osm_value: 'state', type: 'state', name: 'Texas', country: 'United States', countrycode: 'US' }),
  { type: 'Feature', properties: { name: 'no geometry' } },
] });
assert.deepEqual(got.map(r => [r.t, r.type, r.k, kindOf(r.type)]), [
  ['1004 Priya Lane, Katy, Texas 77494', 'address', 'Address', 'address'],
  ['Hotel ZaZa, 5701 Main Street, Houston, Texas 77005', 'poi', 'Poi', 'poi'],
  ['Westheimer Road, Houston, Texas', 'street', 'Street', 'street'],
  ['Houston, Harris County, Texas', 'place', 'Place', 'town'],
  ['Harris County, Texas', 'county', 'County', 'county'],
  ['Montrose, Houston, Texas', 'neighbourhood', 'Neighbourhood', 'area'],
  ['Lyon, Auvergne-Rhône-Alpes, France', 'place', 'Place', 'town'],
  ['Texas', 'region', 'Region', 'region'],
]);
assert.deepEqual(got[0].c, [-95.4, 29.8]); assert.equal(got[0].name, '1004 Priya Lane'); assert.equal(got[1].name, 'Hotel ZaZa');
assert.deepEqual(got[2].bbox, [-95.6, 29.73, -95.38, 29.75], 'Photon extent [w,n,e,s] becomes [w,s,e,n]');
assert.deepEqual(fromPhoton(null), []); assert.deepEqual(fromPhoton({}), []);

// nightly geocoder: a refused key is an error (retried next run), never a cached miss
assert.ok(keyRefused(new Error('https://api.maptiler.com/geocoding/x.json?key=k 403')));
assert.ok(keyRefused(new Error('failed https://api.maptiler.com/geocoding/x.json?key=k')));
assert.ok(!keyRefused(new Error('https://api.maptiler.com/geocoding/x.json?key=k 404')) && !keyRefused(new Error('https://nominatim.openstreetmap.org/x 403')));
globalThis.fetch = async url => { const h = new URL(String(url)).host;
  if (h === 'api.maptiler.com') return new Response('MapTiler Error: Monthly API request quota exceeded, account temporarily suspended.', { status: 403 });
  if (h === 'geocoding.geo.census.gov') return new Response('');
  return new Response(JSON.stringify(h === 'nominatim.openstreetmap.org' ? [] : { features: [], elements: [] }), { status: 200 }); };
const cache = {}, rows = [{ ProjectNumber: 'TABS1', st: '12 Nowhere St', city: 'Waller', zip: '77484' }, { ProjectNumber: 'TABS2', st: 'Main St and 2nd St', city: 'Waller', zip: '77484' }];
await geocodeRows(rows, cache, { key: 'k', bbox: [-97.6, 28.6, -94.2, 31.4], places: [], addressPoints: false });
assert.equal(Object.keys(cache).length, 0, 'nothing cached while MapTiler refuses: ' + JSON.stringify(cache));
console.log('maptiler ok');
