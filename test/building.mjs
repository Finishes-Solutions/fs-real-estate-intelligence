// Offline test for /api/building with mocked StratMap, Overpass and Mapillary responses.
import assert from 'node:assert/strict';
process.env.MAPILLARY_TOKEN = 'MLY|test';
const seen = [];
globalThis.fetch = async (url, opts = {}) => {
  url = String(url); seen.push(url);
  const json = o => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (url.includes('/MapServer/0/query')) return json({ features: [{ attributes: { OBJECTID: 1, PROP_ID: '12345', OWNER_NAME: 'ACME HOLDINGS LLC', SITUS_NUM: '100', SITUS_STREET: 'MAIN ST', SITUS_CITY: 'WALLER', COUNTY: 'Waller',
    MKT_VALUE: 2500000, LAND_VALUE: 500000, IMP_VALUE: 2000000, YEAR_BUILT: '2019', DATE_ACQ: 20210615, GIS_AREA: 2.5, GIS_AREA_UNIT: 'ACRES', MAIL_LINE1: 'PO BOX 1', MAIL_CITY: 'HOUSTON', MAIL_STAT: 'TX', MAIL_ZIP: '77001', LOC_LAND_USE: 'Commercial' },
    geometry: { rings: [[[-95.93, 30.05], [-95.92, 30.05], [-95.92, 30.06], [-95.93, 30.05]]] } }] });
  if (url.includes('overpass')) { const q = decodeURIComponent(String(opts.body)); assert.match(q, /around:80,30\.055,-95\.925/); return json({ elements: [{ type: 'node', lat: 30.055, lon: -95.925, tags: { name: 'Chick-fil-A', amenity: 'fast_food', brand: 'Chick-fil-A' } }, { type: 'way', center: { lat: 30.0551, lon: -95.9251 }, tags: { name: 'Clinic', healthcare: 'yes' } }] }); }
  if (url.includes('graph.mapillary.com')) return json({ data: [{ id: '9', thumb_1024_url: 'https://img/9.jpg', captured_at: 1700000000000, geometry: { coordinates: [-95.9251, 30.0551] } }] });
  return new Response('nope', { status: 500 });
};
const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
const { default: building } = await import('../api/building.js');
let res = mock(); await building({ query: { lat: '30.055', lon: '-95.925' }, headers: { 'x-forwarded-for': '7.7.7.7' } }, res);
assert.equal(res.code, 200);
const p = res.body.parcel;
assert.equal(p.owner, 'ACME HOLDINGS LLC'); assert.equal(p.situs, '100 MAIN ST, WALLER'); assert.equal(p.marketValue, 2500000); assert.equal(p.acquired, '2021-06-15');
assert.equal(p.yearBuilt, '2019'); assert.equal(p.area, '2.5 acres'); assert.equal(p.mailing, 'PO BOX 1, HOUSTON TX 77001'); assert.equal(p.geometry.type, 'Polygon'); assert.ok(!('OBJECTID' in p.raw));
assert.equal(res.body.places.length, 2); assert.equal(res.body.places[0].kind, 'fast food'); assert.equal(res.body.places[1].kind, 'healthcare');
assert.equal(res.body.photo.link, 'https://www.mapillary.com/app/?pKey=9'); assert.match(res.headers['Cache-Control'], /s-maxage/);
res = mock(); await building({ query: { lat: '40', lon: '-95' }, headers: {} }, res); assert.equal(res.code, 400, 'outside Texas rejected');
// a failing source degrades to an error string, not a 500
globalThis.fetch = async () => new Response('down', { status: 503 });
res = mock(); await building({ query: { lat: '30.05', lon: '-95.92' }, headers: { 'x-forwarded-for': '8.8.8.8' } }, res);
assert.equal(res.code, 200); assert.equal(res.body.parcel, null); assert.match(res.body.parcelError, /503/); assert.deepEqual(res.body.places, []);
console.log('building api tests passed');
