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
res = mock(); await building({ query: { lat: '40', lon: '-95', part: 'parcel' }, headers: {} }, res); assert.equal(res.code, 200, 'outside Texas: the card still answers');
assert.equal(res.body.parcel, null); assert.match(res.body.parcelError, /Texas only.*Regrid/, 'and says the free record is Texas only, Regrid has it');
res = mock(); await building({ query: { lat: '60', lon: '10' }, headers: {} }, res); assert.equal(res.code, 400, 'outside the US rejected');
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
// Harris and Waller: StratMap has no parcel, so the county appraisal district's own layer answers, in the same shape;
// a click on a lot line finds the parcel a few meters away; condominium units sharing an outline are counted
{ const { normalizeCad, CADS } = await import('../api/building.js');
  const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  const asked = [];
  globalThis.fetch = async (url) => {
    url = String(url); const json = o => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } }), u = new URL(url);
    if (url.includes('/MapServer/identify')) return json({ results: [] }); // StratMap: nothing in Harris
    if (u.host === 'arcweb.hcad.org') { asked.push(u.searchParams.get('geometryType'));
      if (u.searchParams.get('geometryType') === 'esriGeometryPoint') return json({ features: [] }); // the click is on the lot line
      const a = { HCAD_NUM: '1205380000001', owner: 'IA LODGING HOUSTON GALLERIA LP', address: '5115 WESTHEIMER RD', city: 'HOUSTON', zip: '77056', state_class: 'F1', mkt_val: 59159643, land_val: 10125150, impr_val: 49034493, legal_lines: 'UNITS 1 & 1D|(WESTIN GALLERIA HOTEL)' };
      return json({ features: [{ attributes: a, geometry: { rings: [sq(-95.4612, 29.7390, -95.4600, 29.7400)] } }, { attributes: { ...a, HCAD_NUM: '1205380000002' }, geometry: { rings: [sq(-95.4612, 29.7390, -95.4600, 29.7400)] } }] }); }
    return new Response('nope', { status: 500 });
  };
  const res = mock(); await building({ query: { lat: '29.7392', lon: '-95.4610', part: 'parcel' }, headers: { 'x-forwarded-for': '9.9.9.8' } }, res);
  const p = res.body.parcel;
  assert.deepEqual(asked, ['esriGeometryPoint', 'esriGeometryEnvelope'], 'the point, then a few meters around it');
  assert.equal(p.source, 'Harris Central Appraisal District'); assert.equal(p.owner, 'IA LODGING HOUSTON GALLERIA LP'); assert.equal(p.situs, '5115 Westheimer Rd, Houston');
  assert.equal(p.marketValue, 59159643); assert.equal(p.propId, '1205380000001'); assert.equal(p.shared, 2); assert.equal(p.geometry.type, 'Polygon'); assert.equal(p.legal, 'UNITS 1 & 1D · (WESTIN GALLERIA HOTEL)');
  // a Waller County (BIS-hosted) record
  const w = normalizeCad(CADS.find(c => c.county === 'Waller'), { prop_id_text: '274402', file_as_name: 'MILLROSE PROPERTIES TEXAS LLC', legal_acreage: 195.347, legal_desc: 'ABS A314300 A-143 H & T C R R CO TRACT 1-10', land_val: 6251100, imprv_val: 0, market: 6251100,
    situs_street: 'FM 362', situs_city: 'BROOKSHIRE', situs_zip: '77423', addr_line2: '600 BRICKELL', addr_line3: 'SUITE 1400', addr_city: 'MIAMI', addr_state: 'FL', zip: '33131', Deed_Date: '01/24/2025', owner_tax_yr: 2027 }, null);
  assert.deepEqual([w.owner, w.situs, w.area, w.acquired, w.marketValue, w.mailing, w.county], ['MILLROSE PROPERTIES TEXAS LLC', 'FM 362, Brookshire', '195.35 acres', '2025-01-24', 6251100, '600 BRICKELL, SUITE 1400, MIAMI FL 33131', 'Waller']);
  // outside every district's box (Fort Bend, which StratMap covers): no appraisal district is asked
  asked.length = 0; const r2 = mock(); await building({ query: { lat: '29.40', lon: '-95.75', part: 'parcel' }, headers: { 'x-forwarded-for': '9.9.9.7' } }, r2);
  assert.equal(r2.body.parcel, null); assert.equal(asked.length, 0);
  console.log('county appraisal district fallback ok'); }
// ArcGIS rings: several outer rings are several pieces, not holes. The Fort Bend record 156001 (City of Katy, the First
// Street right-of-way, as StratMap returned it Oct 22) is two pieces, both clockwise: the strip and a sliver east of it.
{ const { esriPolygon, normalizeParcel, normalizeCad, CADS } = await import('../api/building.js'), { inGeom } = await import('../lib/footprint.mjs');
  const katy = { rings: [[[-95.82386645308436,29.786332098783426],[-95.82439129828069,29.786335534627977],[-95.82438973880534,29.786474772381986],[-95.82421990870762,29.786473832145393],[-95.82404293341014,29.786472851367847],[-95.82386847609037,29.78647206004103],[-95.82380895821123,29.786471554059602],[-95.82341367882498,29.786469363292685],[-95.82326088437827,29.786468455020987],[-95.82294151263353,29.78646691680626],[-95.82279079509178,29.786466194866644],[-95.82229816437987,29.786463764752416],[-95.82229772240875,29.786326618739796],[-95.82323736468751,29.786328949064263],[-95.8236714656671,29.786330569922253],[-95.82386645308436,29.786332098783426]],
    [[-95.82185707989726,29.78632059996909],[-95.82211158968525,29.786321789689897],[-95.82211329289103,29.786457547963316],[-95.82211339529897,29.786465646005436],[-95.82185707989726,29.78632059996909]]] };
  const g = normalizeParcel({ PROP_ID: '156001', OWNER_NAME: 'City of Katy' }, katy).geometry;
  assert.equal(g.type, 'MultiPolygon'); assert.equal(g.coordinates.length, 2, 'two pieces'); assert.ok(g.coordinates.every(p => p.length === 1), 'neither is a hole');
  assert.ok(inGeom([-95.8220, 29.78638], g), 'a click on the second piece is on the parcel (as a hole it was outside)'); assert.ok(inGeom([-95.8235, 29.7864], g), 'and on the first');
  // one piece with a hole (an out-parcel), clockwise outside and counter-clockwise inside: a Polygon with its hole
  const cw = (x0, y0, x1, y1) => [[x0, y0], [x0, y1], [x1, y1], [x1, y0], [x0, y0]], ccw = (x0, y0, x1, y1) => cw(x0, y0, x1, y1).reverse();
  const holed = esriPolygon({ rings: [cw(-95.9, 30, -95.89, 30.01), ccw(-95.897, 30.003, -95.893, 30.007)] });
  assert.equal(holed.type, 'Polygon'); assert.equal(holed.coordinates.length, 2); assert.ok(!inGeom([-95.895, 30.005], holed), 'the hole is out'); assert.ok(inGeom([-95.899, 30.001], holed));
  // two pieces, one with a hole, the hole listed first
  const two = esriPolygon({ rings: [ccw(-95.897, 30.003, -95.893, 30.007), cw(-95.9, 30, -95.89, 30.01), cw(-95.88, 30, -95.87, 30.01)] });
  assert.equal(two.type, 'MultiPolygon'); assert.deepEqual(two.coordinates.map(p => p.length), [2, 1], 'the hole goes with the piece it is in');
  // a service that winds every ring the same way: a ring inside another is its hole, the rest are pieces
  const same = esriPolygon({ rings: [cw(-95.9, 30, -95.89, 30.01), cw(-95.897, 30.003, -95.893, 30.007), cw(-95.88, 30, -95.87, 30.01)] });
  assert.equal(same.type, 'MultiPolygon'); assert.deepEqual(same.coordinates.map(p => p.length), [2, 1]);
  assert.equal(esriPolygon({ rings: [ccw(-95.9, 30, -95.89, 30.01)] }).type, 'Polygon', 'one ring either way round: a Polygon');
  assert.equal(esriPolygon(null), null); assert.equal(esriPolygon({ rings: [] }), null);
  assert.equal(normalizeCad(CADS.find(c => c.county === 'Waller'), { prop_id_text: '1', file_as_name: 'X' }, katy).geometry.type, 'MultiPolygon', 'the appraisal districts\' layers too');
  console.log('multi-part parcels ok'); }
// &apn: the account drawn on the map under the click. StratMap's record at the point is another account (on Waller Tomball
// Rd one 128-acre outline holds a dozen accounts), so the appraisal district's own record for that account is used.
{ const sq = (x0, y0, x1, y1) => [[x0, y0], [x0, y1], [x1, y1], [x1, y0], [x0, y0]], asked = [];
  globalThis.fetch = async url => { url = String(url); const json = o => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } }), u = new URL(url);
    if (url.includes('/MapServer/identify')) return json({ results: [{ attributes: { PROP_ID: '0422450000001', OWNER_NAME: 'TERPSTRA PETER S TRUSTEE', LEGAL_AREA: '0.429' }, geometry: { rings: [sq(-95.8998, 30.0584, -95.8914, 30.0654)] } }] });
    if (u.host === 'arcweb.hcad.org') { asked.push(u.searchParams.get('where'));
      return json({ features: u.searchParams.get('where') === "HCAD_NUM = '0422450000072'" ? [{ attributes: { HCAD_NUM: '0422450000072', owner: 'DAVIS JERRY LEE', address: '0 STOKES RD', city: 'WALLER', mkt_val: 412000 }, geometry: { rings: [sq(-95.8998, 30.0584, -95.8914, 30.0615)] } }] : [] }); }
    return new Response('nope', { status: 500 }); };
  const r1 = mock(); await building({ query: { lat: '30.06', lon: '-95.896', part: 'parcel', apn: '0422450000072' }, headers: { 'x-forwarded-for': '9.9.9.10' } }, r1);
  assert.equal(r1.body.parcel.propId, '0422450000072'); assert.equal(r1.body.parcel.owner, 'DAVIS JERRY LEE'); assert.equal(r1.body.parcel.marketValue, 412000);
  assert.deepEqual(asked, ["HCAD_NUM = '0422450000072'"], 'asked by account number');
  asked.length = 0; const r2 = mock(); await building({ query: { lat: '30.064', lon: '-95.896', part: 'parcel', apn: '0422450000001' }, headers: { 'x-forwarded-for': '9.9.9.10' } }, r2);
  assert.equal(r2.body.parcel.propId, '0422450000001'); assert.equal(asked.length, 0, 'StratMap\'s record is that account: nothing else asked');
  asked.length = 0; const r3 = mock(); await building({ query: { lat: '30.06', lon: '-95.896', part: 'parcel', apn: '0422450000099' }, headers: { 'x-forwarded-for': '9.9.9.10' } }, r3);
  assert.equal(r3.body.parcel.propId, '0422450000001', 'the district has no such account: StratMap\'s record (the card then goes by the line drawn on the map)');
  console.log('parcel by the account drawn on the map ok'); }
