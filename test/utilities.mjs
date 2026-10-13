// Offline tests for utilities near a site (lib/utilities.mjs, api/utilities.js): distances from a parcel's edge to
// power lines and mains, OpenStreetMap power tags, PUC CCN service areas in their different field spellings, and the
// API answering with a source down. Responses are shaped like the real Overpass and ArcGIS ones.
import assert from 'node:assert/strict';
const U = await import('../lib/utilities.mjs');

const C = [-95.6, 29.8], kx = U.FT_PER_DEG * Math.cos(C[1] * Math.PI / 180), ll = ([x, y]) => [C[0] + x / kx, C[1] + y / U.FT_PER_DEG];
// a 200 x 200 ft parcel centred on C
const parcel = { type: 'Polygon', coordinates: [[[-100, -100], [100, -100], [100, 100], [-100, 100], [-100, -100]].map(ll)] };
const site = U.siteShape(C, parcel), point = U.siteShape(C, null);
const near = (a, b, tol = 2) => assert.ok(Math.abs(a - b) <= tol, a + ' vs ' + b);

// ---- distances ----
near(U.distToPaths(site, [[ll([300, -500]), ll([300, 500])]]), 200, 1); // a line 300 ft east of the middle: 200 ft from the edge
near(U.distToPaths(point, [[ll([300, -500]), ll([300, 500])]]), 300, 1);
assert.equal(U.distToPaths(site, [[ll([-500, 0]), ll([500, 0])]]), 0, 'a line across the site');
assert.equal(U.distToPaths(site, [[ll([10, 10]), ll([20, 20])]]), 0, 'a line inside the site');
near(U.distToPoint(site, ll([100, 400])), 300, 1);

// ---- power from OpenStreetMap ----
assert.equal(U.kvOf('138000;69000'), 138); assert.equal(U.kvOf('12470'), 12.47); assert.equal(U.kvOf('345 kV'), 345); assert.equal(U.kvOf(''), null);
assert.equal(U.lineClass({ power: 'line', voltage: '138000' }).cls, 'transmission'); assert.equal(U.lineClass({ power: 'line', voltage: '12470' }).cls, 'distribution', 'a low-voltage "line" is distribution');
assert.equal(U.lineClass({ power: 'minor_line' }).cls, 'distribution'); assert.equal(U.lineClass({ power: 'cable' }).cls, 'cable');
const geom = pts => pts.map(p => { const q = ll(p); return { lon: q[0], lat: q[1] }; });
const osm = [
  { type: 'way', id: 1, tags: { power: 'line', voltage: '138000', operator: 'CenterPoint Energy' }, geometry: geom([[600, -2000], [600, 2000]]) },
  { type: 'way', id: 2, tags: { power: 'minor_line' }, geometry: geom([[-2000, 160], [2000, 160]]) },
  { type: 'way', id: 3, tags: { power: 'line', voltage: '345000' }, geometry: geom([[-3000, -1500], [3000, -1500]]) },
  { type: 'way', id: 4, tags: { power: 'substation', name: 'Westchase', operator: 'CenterPoint Energy', voltage: '138000;12470' }, center: (q => ({ lon: q[0], lat: q[1] }))(ll([2000, 0])) },
  { type: 'node', id: 5, tags: { power: 'substation' }, lat: ll([0, -5000])[1], lon: ll([0, -5000])[0] }
];
const P = U.parsePower(osm, site);
near(P.nearest.transmission.ft, 500); assert.equal(P.nearest.transmission.kv, 138); assert.equal(P.nearest.transmission.operator, 'CenterPoint Energy');
near(P.nearest.distribution.ft, 60); assert.equal(P.lines.length, 3); assert.equal(P.lines[0].cls, 'distribution', 'nearest first');
assert.equal(P.substations[0].name, 'Westchase'); near(P.substations[0].ft, 1900); assert.equal(P.substations[1].name, 'Substation');
const PF = U.powerFeatures(osm); assert.deepEqual(PF.map(f => f.properties.k), ['transmission', 'distribution', 'transmission', 'substation', 'substation']);
assert.match(U.powerQuery(29.8, -95.6), /around:800,29\.8,-95\.6/); assert.match(U.powerBoxQuery([-95.61, 29.79, -95.59, 29.81], false), /line\|cable/);

// ---- water and sewer service areas (CCN), field names vary by copy ----
const W = U.parseCCN([{ attributes: { UTILITY: 'CITY OF HOUSTON', CCN_NO: '10000', TYPE: 'WATER', COUNTY: 'HARRIS' } }, { attributes: { UTILITY: 'CITY OF HOUSTON', CCN_NO: '10000' } }]);
assert.deepEqual(W, [{ utility: 'City Of Houston', ccn: '10000', kind: 'water', county: 'HARRIS' }], 'one row per CCN, title case');
const S2 = U.parseCCN([{ attributes: { Utility_Name: 'HARRIS COUNTY MUD 102', CCN: 20512 } }]);
assert.equal(S2[0].utility, 'Harris County MUD 102', 'district abbreviations kept'); assert.equal(S2[0].kind, 'sewer', 'a CCN starting with 2 is sewer');

// ---- mains: whatever the layer calls size and material ----
const mains = U.parseMains([
  { attributes: { DIAMETER: 8, MATERIAL: 'PVC' }, geometry: { paths: [[ll([150, -300]), ll([150, 300])]] } },
  { attributes: { PIPE_SIZE: '24', Pipe_Material: 'RCP' }, geometry: { paths: [[ll([-400, -300]), ll([-400, 300])]] } }
], site, 'City of Houston');
assert.equal(mains.length, 2); near(mains[0].ft, 50); assert.equal(mains[0].size, 8); assert.equal(mains[0].material, 'PVC'); assert.equal(mains[0].owner, 'City of Houston'); assert.equal(mains[1].size, 24);
assert.equal(U.sizeText(8), '8"'); assert.equal(U.sizeText(48), '4 ft'); assert.equal(U.distText(0), 'on the site'); assert.equal(U.distText(62), '60 ft'); assert.equal(U.distText(7920), '1.50 mi');
assert.equal(U.pickLayer([{ id: 0, name: 'Water Main Labels', geometryType: 'esriGeometryPolyline' }, { id: 3, name: 'Water Mains', geometryType: 'esriGeometryPolyline' }, { id: 4, name: 'Hydrants', geometryType: 'esriGeometryPoint' }], U.MAINS.water.match).id, 3, 'the main layer, not its labels');
assert.equal(U.pickLayer([{ id: 1, name: 'Manholes', geometryType: 'esriGeometryPoint' }], U.MAINS.sewer.match), null);
assert.ok(U.inBox([-95.37, 29.76], U.HOUSTON_BOX) && !U.inBox([-97.74, 30.27], U.HOUSTON_BOX), 'downtown Houston in, Austin out');

// ---- the API: every source answers, or one is down and the rest still do ----
const fc = features => ({ ok: true, status: 200, json: async () => ({ features }) });
let down = new Set();
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (down.has(new URL(u).host)) throw new Error('fetch failed');
  if (u.includes('interpreter')) return { ok: true, status: 200, json: async () => ({ elements: osm }) };
  if (u.endsWith('/layers?f=json')) return { ok: true, status: 200, json: async () => ({ layers: [{ id: 7, name: 'Water Mains', geometryType: 'esriGeometryPolyline' }, { id: 8, name: 'Gravity Mains', geometryType: 'esriGeometryPolyline' }] }) };
  if (u.includes('PUC_CCN_Sewer_Water/MapServer/1/')) return fc([{ attributes: { UTILITY: 'CITY OF HOUSTON', CCN_NO: '10000' } }]);
  if (u.includes('PUC_CCN_Sewer_Water/MapServer/2/')) return fc([{ attributes: { UTILITY: 'CITY OF HOUSTON', CCN_NO: '20000' } }]);
  if (u.includes('PUC_CCN_Sewer_Water/MapServer/0/')) return fc([{ attributes: { UTILITY: 'CITY OF HOUSTON' }, geometry: { paths: [[ll([0, 700]), ll([500, 700])]] } }]);
  if (u.includes('sGravityMain') || u.includes('MapServer/8/')) return fc([{ attributes: { DIAMETER: 10, MATERIAL: 'VCP' }, geometry: { paths: [[ll([-130, -300]), ll([-130, 300])]] } }]);
  if (u.includes('MapServer/7/')) return fc([{ attributes: { DIAMETER: 12 }, geometry: { paths: [[ll([-300, 220]), ll([300, 220])]] } }]);
  return { ok: false, status: 404, json: async () => ({}) };
};
const A = await import('../api/utilities.js');
let d = await A.utilitiesNear(C, parcel);
near(d.power.nearest.transmission.ft, 500); assert.equal(d.water.ccn[0].ccn, '10000'); assert.equal(d.sewer.ccn[0].ccn, '20000');
near(d.sewer.mains[0].ft, 30); assert.equal(d.sewer.mains[0].size, 10); near(d.water.mains[0].ft, 120); assert.equal(d.water.mains[0].size, 12, 'a water-main layer found by name');
near(d.water.lines[0].ft, 600);
assert.ok(d.summary.some(t => /138 kV transmission line \(CenterPoint Energy\), 500 ft/.test(t)), d.summary.join(' | '));
assert.ok(d.summary.some(t => /Sewer service area: City Of Houston \(CCN 20000\)/.test(t)) && d.summary.some(t => /public sewer main: 10" VCP, 30 ft/.test(t)));
down = new Set(['overpass-api.de', 'overpass.private.coffee']);
d = await A.utilitiesNear(C, parcel); assert.ok(d.power.error && d.water.ccn.length && d.sewer.mains.length, 'OpenStreetMap down: power says so, water and sewer still answer');
down = new Set();
d = await A.utilitiesNear([-97.74, 30.27], null); assert.equal(d.sewer.mainsNote, 'outside Houston'); assert.equal(d.sewer.mains.length, 0);
// the map layer and the handler's limits
const res = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
const req = query => ({ method: 'GET', query, headers: { host: 'x', origin: 'https://x' }, socket: { remoteAddress: '1.2.3.4' } });
let r = res(); await A.default(req({ box: '-95.62,29.79,-95.58,29.81', z: '15' }), r);
assert.equal(r.code, 200, JSON.stringify(r.body)); const ks = new Set(r.body.features.map(f => f.properties.k)); assert.ok(ks.has('transmission') && ks.has('substation') && ks.has('sewer') && ks.has('water'), [...ks].join());
r = res(); await A.default(req({ box: '-96,29,-95,30', z: '15' }), r); assert.equal(r.code, 400, 'too big a box');
r = res(); await A.default(req({ lat: '29.8', lon: '-95.6' }), r); assert.equal(r.code, 200); assert.ok(r.body.summary.length >= 4);
console.log('utilities ok');
