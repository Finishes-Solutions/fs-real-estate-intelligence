// Offline test for /api/building with mocked StratMap, Overpass and Mapillary responses.
import assert from 'node:assert/strict';
process.env.MAPILLARY_TOKEN = 'MLY|test';
const seen = [];
globalThis.fetch = async (url, opts = {}) => {
  url = String(url); seen.push(url);
  const json = o => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (url.includes('/MapServer/identify')) return json({ results: [{ attributes: { OBJECTID: 1, PROP_ID: '12345', OWNER_NAME: 'ACME HOLDINGS LLC', SITUS_NUM: '100', SITUS_STREET: 'MAIN ST', SITUS_CITY: 'WALLER', COUNTY: 'Waller',
    MKT_VALUE: 2500000, LAND_VALUE: 500000, IMP_VALUE: 2000000, YEAR_BUILT: '2019', DATE_ACQ: 20210615, GIS_AREA: 2.5, GIS_AREA_UNIT: 'ACRES', MAIL_LINE1: 'PO BOX 1', MAIL_CITY: 'HOUSTON', MAIL_STAT: 'TX', MAIL_ZIP: '77001', LOC_LAND_USE: 'Commercial' },
    geometry: { rings: [[[-95.93, 30.05], [-95.92, 30.05], [-95.92, 30.06], [-95.93, 30.05]]] } }] });
  if (url.includes('overpass')) { const q = decodeURIComponent(String(opts.body)); assert.match(q, /around:150,30\.055,-95\.925/); return json({ elements: [{ type: 'node', lat: 30.055, lon: -95.925, tags: { name: 'Chick-fil-A', amenity: 'fast_food', brand: 'Chick-fil-A' } }, { type: 'way', center: { lat: 30.0551, lon: -95.9251 }, tags: { name: 'Clinic', healthcare: 'yes' } }, { type: 'way', center: { lat: 30.055, lon: -95.925 }, tags: { building: 'retail', 'building:levels': '3' } }] }); }
  if (url.includes('/stac/v1/search')) { const b = JSON.parse(opts.body); assert.equal(b.collections[0], '3dep-lidar-hag'); return json({ features: [{ id: 'TX_2018-hag-1', properties: { end_datetime: '2018-12-31T00:00:00Z' } }] }); }
  if (url.includes('/item/statistics')) { const b = JSON.parse(opts.body); assert.equal(b.geometry.type, 'Polygon'); assert.match(url, /histogram_range=0%2C340/);
    const counts = new Array(340).fill(0); counts[0] = 40; counts[13] = 300; counts[14] = 60; counts[20] = 5; return json({ properties: { statistics: { data_b1: { count: 405, histogram: [counts, Array.from({ length: 341 }, (_, i) => i)] } } } }); }
  if (url.includes('graph.mapillary.com')) return json({ data: [{ id: '9', thumb_1024_url: 'https://img/9.jpg', captured_at: 1700000000000, geometry: { coordinates: [-95.9251, 30.0551] } }] });
  return new Response('nope', { status: 500 });
};
const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
const { default: building } = await import('../api/building.js');
let res = mock(); await building({ query: { lat: '30.055', lon: '-95.925', fp: '-95.9252,30.0549;-95.9248,30.0549;-95.9248,30.0552;-95.9252,30.0552' }, headers: { 'x-forwarded-for': '7.7.7.7' } }, res);
assert.equal(res.code, 200);
const p = res.body.parcel;
assert.equal(p.owner, 'ACME HOLDINGS LLC'); assert.equal(p.situs, '100 MAIN ST, WALLER'); assert.equal(p.marketValue, 2500000); assert.equal(p.acquired, '2021-06-15');
assert.equal(p.yearBuilt, '2019'); assert.equal(p.area, '2.5 acres'); assert.equal(p.mailing, 'PO BOX 1, HOUSTON TX 77001'); assert.equal(p.geometry.type, 'Polygon'); assert.ok(!('OBJECTID' in p.raw));
assert.equal(res.body.places.length, 2); assert.equal(res.body.places[0].kind, 'fast food'); assert.equal(res.body.places[1].kind, 'healthcare');
assert.equal(res.body.osm.levels, 3); assert.equal(res.body.osm.use, 'retail');
assert.equal(res.body.height.source, '3dep-lidar'); assert.equal(res.body.height.date, '2018-12-31'); assert.ok(res.body.height.height_m >= 13 && res.body.height.height_m <= 15, 'roof ≈ 14 m: ' + res.body.height.height_m); assert.equal(res.body.height.max_m, 21);
assert.equal(res.body.photo.link, 'https://www.mapillary.com/app/?pKey=9'); assert.match(res.headers['Cache-Control'], /s-maxage/);
res = mock(); await building({ query: { lat: '40', lon: '-95' }, headers: {} }, res); assert.equal(res.code, 400, 'outside Texas rejected');
// the card asks for the parcel alone first, then everything else
seen.length = 0; res = mock(); await building({ query: { lat: '30.055', lon: '-95.925', part: 'parcel' }, headers: { 'x-forwarded-for': '7.7.7.8' } }, res);
assert.equal(res.body.parcel.owner, 'ACME HOLDINGS LLC'); assert.deepEqual(Object.keys(res.body), ['parcel']); assert.ok(seen.every(u => u.includes('/identify')), 'parcel only: no Overpass, lidar or photo calls');
seen.length = 0; res = mock(); await building({ query: { lat: '30.055', lon: '-95.925', part: 'rest' }, headers: { 'x-forwarded-for': '7.7.7.8' } }, res);
assert.ok(!('parcel' in res.body)); assert.equal(res.body.places.length, 2); assert.ok(!seen.some(u => u.includes('/identify')), 'rest: no parcel call');
// a failing source degrades to an error string, not a 500
globalThis.fetch = async () => new Response('down', { status: 503 });
res = mock(); await building({ query: { lat: '30.05', lon: '-95.92' }, headers: { 'x-forwarded-for': '8.8.8.8' } }, res);
assert.equal(res.code, 200); assert.equal(res.body.parcel, null); assert.match(res.body.parcelError, /503/); assert.deepEqual(res.body.places, []);
res = mock(); await building({ query: { lat: '30.05', lon: '-95.92', part: 'parcel' }, headers: { 'x-forwarded-for': '8.8.8.9' } }, res);
assert.match(res.body.parcelError, /503/); assert.equal(res.headers['Cache-Control'], 'no-store', 'a failed parcel lookup is not cached');
console.log('building api tests passed');
// Fort Bend style records: "Null" strings, spreadsheet day numbers, the city already in the address, trailing commas
{ const { normalizeParcel } = await import('../api/building.js');
  const p = normalizeParcel({ PROP_ID: '264714', SITUS_ADDR: '16145 City WALK, Sugar Land, TX 77479', SITUS_CITY: 'Sugar Land', DATE_ACQ: '46082', YEAR_BUILT: 'Null', GIS_AREA: '1.084995', GIS_AREA_UNIT: 'Null', LOC_LAND_USE: 'Null' });
  assert.deepEqual([p.situs, p.acquired, p.yearBuilt, p.area, p.landUse, 'YEAR_BUILT' in p.raw], ['16145 City WALK, Sugar Land, TX 77479', '2026-03-01', null, '1.08 acres', null, false]);
  assert.equal(normalizeParcel({ SITUS_ADDR: 'Highway 90A , ,', SITUS_CITY: 'Null' }).situs, 'Highway 90A');
  console.log('parcel clean-up ok'); }
// a big building: OpenStreetMap's whole outline comes back, and every parcel under it (identify with the polygon)
{ const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  const ids = [];
  globalThis.fetch = async (url, opts = {}) => {
    url = String(url); const json = o => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/MapServer/identify')) { const u = new URL(url), type = u.searchParams.get('geometryType'); ids.push(type);
      if (type === 'esriGeometryPoint') return json({ results: [{ attributes: { PROP_ID: 'A', OWNER_NAME: 'WEST LLC', MKT_VALUE: 1000000 }, geometry: { rings: [sq(-95.4, 29.7, -95.399, 29.701)] } }] });
      const ring = JSON.parse(u.searchParams.get('geometry')).rings[0]; assert.ok(ring.length >= 4);
      const wide = ring.some(p => p[0] > -95.3985); // the whole outline reaches the east lot
      return json({ results: [{ attributes: { PROP_ID: 'A', OWNER_NAME: 'WEST LLC' }, geometry: { rings: [sq(-95.4, 29.7, -95.399, 29.701)] } }, { attributes: { PROP_ID: 'A', OWNER_NAME: 'WEST LLC' } },
        ...(wide ? [{ attributes: { PROP_ID: 'B', OWNER_NAME: 'EAST LLC', MKT_VALUE: 2000000 }, geometry: { rings: [sq(-95.399, 29.7, -95.398, 29.701)] } }] : [])] }); }
    if (url.includes('overpass')) return json({ elements: [
      { type: 'way', tags: { building: 'yes' }, geometry: sq(-95.4005, 29.7, -95.4002, 29.7003).map(([lon, lat]) => ({ lat, lon })) }, // a neighbour within 6 m
      { type: 'way', tags: { building: 'warehouse', 'building:levels': '1' }, geometry: sq(-95.3995, 29.7002, -95.3982, 29.7008).map(([lon, lat]) => ({ lat, lon })) }] });
    return new Response('nope', { status: 500 });
  };
  const res = mock(); await building({ query: { lat: '29.7005', lon: '-95.3992', fp: '-95.3995,29.7002;-95.399,29.7002;-95.399,29.7008;-95.3995,29.7008' }, headers: { 'x-forwarded-for': '9.9.9.9' } }, res);
  assert.equal(res.body.osm.use, 'warehouse', 'the building the point is inside, not the neighbour');
  assert.deepEqual(res.body.osm.outline.coordinates[0][0], [-95.3995, 29.7002]);
  assert.deepEqual(res.body.parcels.map(p => p.propId), ['A', 'B'], 'both lots, each once');
  assert.ok(ids.filter(t => t === 'esriGeometryPolygon').length === 2, 'the clipped footprint first, then the whole outline');
  console.log('whole building outline and parcels ok'); }
