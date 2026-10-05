// Businesses and places (lib/places.mjs, build/places.mjs): grouping, quality filters, merging the two sources'
// duplicates, county clipping and finding the latest releases. Run: node test/places.mjs
import assert from 'node:assert/strict';
import { groupOf, overtureRow, fsqRow, dedupe, normName, cleanPhone, inOutline, GROUPS } from '../lib/places.mjs';
import { inCounties, countyBox, latestOverture, latestFoursquare } from '../build/places.mjs';
import { mergeBusinesses } from '../lib/nearby.mjs';

// ---------- groups: the source's own top level first, keywords inside business services ----------
const G = {
  'shopping > specialty_store > sporting_goods_store > fitness_equipment_store': 'shop', // not "industrial" for "equipment"
  'shopping > vehicle_dealer > car_dealer': 'auto',
  'shopping > food_and_beverage_store > grocery_store': 'shop',
  'services_and_business > financial_service > insurance_agency': 'finance',
  'services_and_business > home_service > contractor': 'trades',
  'services_and_business > laundry_service > dry_cleaning': 'personal',
  'services_and_business > b2b_service > manufacturer': 'industrial',
  'services_and_business > shipping_or_delivery_service > post_office': 'community',
  'services_and_business > real_estate_service > real_estate_agent': 'realestate',
  'services_and_business > professional_service': 'office',
  'travel_and_transportation > vehicle_service > automotive_service': 'auto',
  'health_care > outpatient_care_facility > behavioral_or_mental_health_clinic': 'health',
  'cultural_and_historic > place_of_worship > christian_place_of_worship': 'community',
  'lodging > hotel': 'lodging',
  'Dining and Drinking > Restaurant > Mexican Restaurant': 'food',
  'Travel and Transportation > Lodging > Hotel': 'lodging',
  'Community and Government > Education > Primary and Secondary School': 'education',
  'Retail > Automotive Retail > Car Dealership': 'auto',
  'Business and Professional Services > Construction > Electrician': 'trades',
  'Landmarks and Outdoors > Park': 'recreation',
  'Dining and Drinking > Bar | Arts and Entertainment > Music Venue': 'food',
  '': 'other'
};
for (const [t, g] of Object.entries(G)) assert.equal(groupOf(t), g, t);
for (const g of Object.values(G)) assert.ok(GROUPS[g], 'group ' + g + ' has a label and color');

// ---------- Overture rows ----------
const ov = { id: 'a1', name: 'Prosperity Bank', cat: 'bank', hier: ['services_and_business', 'financial_service', 'bank_or_credit_union', 'bank'], conf: 0.92, web: 'locations.prosperitybankusa.com/pin-oak/',
  phone: '+17136693315', brand: 'Prosperity Bank', addr: '550 Pin Oak Rd', city: 'KATY', zip: '77494-1223', status: 'open', srcs: ['meta', 'Overture', 'Overture-signals'], lon: -95.8251, lat: 29.7861 };
const r = overtureRow(ov);
assert.equal(r.id, 'ov:a1'); assert.equal(r.grp, 'finance'); assert.equal(r.phone, '(713) 669-3315'); assert.equal(r.zip, '77494'); assert.equal(r.city, 'Katy');
assert.equal(r.web, 'https://locations.prosperitybankusa.com/pin-oak'); assert.deepEqual(r.src, ['overture', 'meta']);
assert.equal(overtureRow({ ...ov, status: 'permanently_closed' }), null, 'closed places are dropped');
assert.equal(overtureRow({ ...ov, name: '' }), null, 'unnamed places are dropped');
// a business pinned to the town center (no street number) needs high confidence: maid services, mobile mechanics …
assert.equal(overtureRow({ ...ov, addr: 'Katy', conf: 0.6 }), null);
assert.ok(overtureRow({ ...ov, addr: 'Katy', conf: 0.8 }));
assert.equal(overtureRow({ ...ov, conf: 0.3 }), null, 'very doubtful places are dropped even with an address');
assert.equal(overtureRow({ ...ov, hier: ['geographic_entities', 'water_feature', 'river'] }), null, 'rivers are left to the base map');

// ---------- Foursquare rows ----------
const fq = { fsq_place_id: 'f9', name: 'Prosperity Bank', latitude: 29.78615, longitude: -95.82505, address: '550 Pin Oak Rd', locality: 'Katy', postcode: '77494', tel: '(713) 669-3315',
  website: 'http://www.prosperitybankusa.com', date_refreshed: '2025-11-02', date_closed: null, fsq_category_labels: ['Business and Professional Services > Financial Service > Bank'] };
const f = fsqRow(fq);
assert.equal(f.id, 'fsq:f9'); assert.equal(f.grp, 'finance'); assert.equal(f.cat, 'Bank');
assert.equal(fsqRow({ ...fq, date_closed: '2024-01-01' }), null, 'closed');
assert.equal(fsqRow({ ...fq, date_refreshed: '2019-05-01' }), null, 'not confirmed in years');

// ---------- merging duplicates ----------
const merged = dedupe([r, f, { ...f, id: 'fsq:x', name: 'Prosperity Bank', lat: 29.79, lon: -95.83 }]);
assert.equal(merged.length, 2, 'same name a few steps apart is one place; the same name 600 m away is another branch');
assert.deepEqual(merged[0].src, ['overture', 'meta', 'foursquare']); assert.equal(merged[0].id, 'ov:a1');
const b2 = dedupe([{ ...r, web: null }, { ...f, web: 'https://x.example' }]); assert.equal(b2[0].web, 'https://x.example', 'empty fields are filled from the duplicate');
const pre = dedupe([{ ...r, name: 'Whataburger' }, { ...f, name: 'Whataburger #123' }]); assert.equal(pre.length, 1, 'one name starting with the other, very close');
const diff = dedupe([{ ...r, name: 'Shell' }, { ...f, name: 'Subway' }]); assert.equal(diff.length, 2, 'different businesses in one building stay apart');
assert.equal(normName('Bank of Texas, N.A.'), normName('The Bank Of Texas')); assert.equal(normName('Joe’s Café LLC'), 'joes cafe');
assert.equal(cleanPhone('+1 281-555-0100'), '(281) 555-0100');

// ---------- county clipping ----------
const sq = [[[[-96, 29], [-95, 29], [-95, 30], [-96, 30], [-96, 29]]]];
assert.ok(inOutline([-95.5, 29.5], sq)); assert.ok(!inOutline([-94.5, 29.5], sq));
const cl = inCounties([{ ...r, lon: -95.5, lat: 29.5 }, { ...r, id: 'out', lon: -94.5, lat: 29.5 }], [{ name: 'Test', fips: '48999', outline: sq }]);
assert.equal(cl.length, 1); assert.equal(cl[0].county, '48999');
assert.deepEqual(countyBox([{ outline: sq }]), [-96, 29, -95, 30]);

// ---------- latest releases ----------
const s3 = '<ListBucketResult><CommonPrefixes><Prefix>release/2026-08-19.0/</Prefix></CommonPrefixes><CommonPrefixes><Prefix>release/2026-09-23.1/</Prefix></CommonPrefixes><CommonPrefixes><Prefix>release/2026-09-23.0/</Prefix></CommonPrefixes></ListBucketResult>';
assert.equal(await latestOverture(async () => ({ text: async () => s3 })), '2026-09-23.1');
assert.equal(await latestFoursquare('t', async (u, o) => { assert.equal(o.headers.Authorization, 'Bearer t'); return { ok: true, json: async () => [{ path: 'release/dt=2026-08-12' }, { path: 'release/dt=2026-09-15' }] }; }), '2026-09-15');
await assert.rejects(latestFoursquare('t', async () => ({ ok: false, status: 403 })), /accept the dataset terms/);

// ---------- map search: open-data places and OpenStreetMap listing the same shop ----------
const m = mergeBusinesses([{ src: 'places', name: 'Starbucks', address: '1 Main St, Katy', lat: 29.78, lon: -95.82 }, { name: 'Starbucks', lat: 29.7802, lon: -95.8201 }, { name: 'Starbucks', lat: 29.80, lon: -95.80 }], [], 8);
assert.equal(m.length, 2, 'the OpenStreetMap copy a few steps away is dropped, the other branch stays');
assert.equal(m[0].src, 'places'); assert.equal(m[1].src, 'osm');

console.log('places ok');
