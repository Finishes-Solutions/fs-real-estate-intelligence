// Offline tests for the feasibility site modules: the local plane (lib/feasibility/plane.mjs), the assemblage setback
// envelope (lib/feasibility/envelope.mjs) and boundary surveys (lib/feasibility/survey.mjs). The envelope cases are
// ported from fs-cre-report-runner tests/v2/site-plan.test.js; the survey cases are new.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const P = await import('../lib/feasibility/plane.mjs'), E = await import('../lib/feasibility/envelope.mjs'), SV = await import('../lib/feasibility/survey.mjs');
const fixture = name => JSON.parse(readFileSync(new URL('./fixtures/fz/site/' + name, import.meta.url), 'utf8'));
const FC3 = fixture('parcels-3.geojson'), SAMPLE = fixture('survey-sample.json');
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const near = (a, b, tol, what) => assert.ok(rel(a, b) <= tol, `${what || ''} ${a} vs ${b} (${(rel(a, b) * 100).toFixed(3)}%)`);

// A rectangle in feet, anchored at a Houston-area origin, as a GeoJSON feature.
const LAT = 29.7, LNG = -95.5, PLANE = P.planeAt(LNG, LAT);
const lnglat = pts => { const c = pts.map(PLANE.toLngLat); return c.concat([c[0]]); };
const box = (x, y, w, h) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [lnglat([[x, y], [x + w, y], [x + w, y + h], [x, y + h]])] } });

// ---------------------------------------------------------------- plane
{ // one acre square: treating degrees as square would be wrong by cos(29.7°), about 13%
  const side = Math.sqrt(P.SQFT_PER_ACRE);
  near(P.areaSqFt(box(0, 0, side, side).geometry, PLANE), P.SQFT_PER_ACRE, 0.001, 'one acre');
  near(P.areaSqFt(box(0, 0, side, side).geometry), P.SQFT_PER_ACRE, 0.001, 'one acre on its own plane');
  const back = PLANE.toFt(PLANE.toLngLat([1234.5, -678.9]));
  assert.ok(Math.abs(back[0] - 1234.5) < 1e-6 && Math.abs(back[1] + 678.9) < 1e-6, 'toFt inverts toLngLat');
}
{ // holes are subtracted
  const outer = lnglat([[0, 0], [400, 0], [400, 400], [0, 400]]), hole = lnglat([[100, 100], [200, 100], [200, 200], [100, 200]]);
  assert.ok(Math.abs(P.areaSqFt({ type: 'Polygon', coordinates: [outer, hole] }, PLANE) - 150000) < 1, 'hole subtracted');
  const multi = { type: 'MultiPolygon', coordinates: [[outer, hole], box(1000, 0, 100, 100).geometry.coordinates] };
  assert.ok(Math.abs(P.areaSqFt(multi, PLANE) - 160000) < 1, 'MultiPolygon parts add, holes subtract');
}
{ // the real assemblage measures within 2% of the county acreage
  const agg = P.collectionAreaSqFt(FC3.features);
  assert.equal(agg.parcels, 3);
  near(agg.acres, 16.1571, 0.02, 'GIS vs county acreage');
  assert.deepEqual(P.collectionAreaSqFt([]), { sqft: 0, acres: 0, plane: null, parcels: 0, centroid: null });
}
{ // the same degree-length series as the site planner's frame (lib/siteplan.mjs), to well under 0.01%
  const { frame } = await import('../lib/siteplan.mjs');
  for (const lat of [25, 29.7, 35, 45]) {
    const F = frame([-95, lat]), Q = P.planeAt(-95, lat), a = F.toFt([-94.98, lat + 0.02]), b = Q.toFt([-94.98, lat + 0.02]);
    assert.ok(rel(a[0], b[0]) < 1e-4 && rel(a[1], b[1]) < 1e-4, `plane vs frame at ${lat}°: ${a} vs ${b}`);
  }
}
{ // a centroid on raw lon/lat keeps its precision
  const c = P.geometryCentroid(box(0, 0, 400, 200).geometry), f = PLANE.toFt(c);
  assert.ok(Math.hypot(f[0] - 200, f[1] - 100) < 0.01, 'centroid ' + f);
}

// ------------------------------------------------------------- envelope
{ // a square is inset on every side
  const env = E.buildEnvelope([box(0, 0, 400, 400)], 25, { plane: PLANE });
  near(env.envelopeSf, 350 * 350, 0.01, 'square envelope');
  assert.ok(env.rings.length >= 1, 'the envelope must be drawable');
  const drawn = env.rings.reduce((s, r) => s + P.signedArea(r), 0);
  near(drawn, env.envelopeSf, 0.02, 'the outline and the number agree');
  assert.ok(env.rings.every(r => P.signedArea(r) > 0), 'outer rings counter-clockwise');
  const ll = env.ringsLngLat[0];
  assert.deepEqual(ll[0], ll[ll.length - 1], 'lon/lat rings are closed');
  near(P.areaSqFt({ type: 'Polygon', coordinates: [ll] }, PLANE), env.rings[0] && Math.abs(P.signedArea(env.rings[0])), 1e-6, 'lon/lat ring is the same outline');
  assert.ok(env.cellFt >= E.MIN_CELL_FT && env.cellFt <= E.MAX_CELL_FT, 'cell ' + env.cellFt);
}
{ // an assemblage is set back around the outside, not on shared lines
  const env = E.buildEnvelope([box(0, 0, 400, 400), box(400, 0, 400, 400)], 25, { plane: PLANE });
  near(env.envelopeSf, 750 * 350, 0.015, 'merged envelope');
  assert.ok(env.envelopeSf > 2 * 350 * 350 * 1.05, 'the shared boundary must not be set back');
}
{ // a setback that consumes a narrow lot returns nothing, and says how much it could take
  const env = E.buildEnvelope([box(0, 0, 40, 1200)], 25, { plane: PLANE });
  assert.equal(env.ratio, 0);
  assert.equal(env.rings.length, 0);
  assert.ok(Math.abs(env.maxInsetFt - 20) < 1.5, 'maxInsetFt ' + env.maxInsetFt);
}
{ // a hole is set back from too (rounded corners around it)
  const outer = lnglat([[0, 0], [400, 0], [400, 400], [0, 400]]), hole = lnglat([[150, 150], [250, 150], [250, 250], [150, 250]]);
  const env = E.buildEnvelope([{ type: 'Polygon', coordinates: [outer, hole] }], 25, { plane: PLANE });
  near(env.envelopeSf, 350 * 350 - (100 * 100 + 4 * 100 * 25 + Math.PI * 25 * 25), 0.015, 'envelope around a hole');
  assert.ok(env.rings.some(r => P.signedArea(r) < 0), 'the hole comes back clockwise');
}
{ // the real assemblage: most of it survives a 25 ft setback (the merged envelope, not per parcel)
  const env = E.buildEnvelope(FC3, 25);
  assert.ok(env.ratio > 0.8 && env.ratio < 1, 'ratio ' + env.ratio);
  assert.ok(Math.abs(env.ratio - 0.8827) < 0.001, 'same ratio as the source implementation: ' + env.ratio);
  near(env.siteSf, env.geometrySf, 0.005, 'raster vs exact site area');
  assert.equal(env.unionRings.length, 1, 'the three parcels are one site');
  assert.equal(E.setbackRatio(FC3.features, 25), env.ratio, 'features, a FeatureCollection, the same answer');
  assert.equal(E.buildEnvelope(FC3.features.map(f => f.geometry), 25).ratio, env.ratio, 'bare geometries, the same answer');
  const multi = { type: 'MultiPolygon', coordinates: FC3.features.map(f => f.geometry.coordinates) };
  assert.equal(E.buildEnvelope(multi, 25).ratio, env.ratio, 'one MultiPolygon, the same answer');
  // per-parcel insets would keep far less
  const perParcel = FC3.features.reduce((s, f) => s + E.buildEnvelope([f], 25, { plane: env.plane }).envelopeSf, 0);
  assert.ok(env.envelopeSf > perParcel * 1.1, `merged ${env.envelopeSf} vs per-parcel ${perParcel}`);
}
{ // the ratio is monotonic in the setback, 1 at zero, 0 once the setback passes maxInsetFt
  const sbs = [0, 5, 10, 25, 50, 100, 200, 300, 400];
  const rs = sbs.map(sb => E.setbackRatio(FC3, sb));
  assert.equal(rs[0], 1, 'a zero setback keeps the whole site');
  for (let i = 1; i < rs.length; i++) assert.ok(rs[i] <= rs[i - 1], `ratio rises from ${sbs[i - 1]} to ${sbs[i]} ft: ${rs}`);
  const env = E.buildEnvelope(FC3, 0);
  assert.equal(E.setbackRatio(FC3, env.maxInsetFt + 2 * env.cellFt), 0, 'nothing left past maxInsetFt');
  assert.ok(E.setbackRatio(FC3, env.maxInsetFt - 2 * env.cellFt) > 0, 'something left just inside maxInsetFt');
}
{ // grid budget and cell bounds
  const small = E.buildEnvelope([box(0, 0, 50, 50)], 5, { plane: PLANE }), big = E.buildEnvelope([box(0, 0, 20000, 20000)], 25, { plane: PLANE });
  assert.equal(small.cellFt, E.MIN_CELL_FT);
  assert.equal(big.cellFt, E.MAX_CELL_FT);
  const mid = E.buildEnvelope(FC3, 25);
  assert.ok(mid.grid.W * mid.grid.H < E.TARGET_CELLS * 1.2, 'grid ' + mid.grid.W + 'x' + mid.grid.H);
}
{ // nothing to measure
  assert.equal(E.buildEnvelope([], 25), null);
  assert.equal(E.buildEnvelope(null, 25), null);
  assert.equal(E.setbackRatio([], 25), null);
  assert.equal(E.buildEnvelope({ type: 'FeatureCollection', features: [] }, 25), null);
  assert.equal(E.buildEnvelope([{ type: 'Feature', geometry: null }, { type: 'Point', coordinates: [LNG, LAT] }], 25), null);
  const line = lnglat([[0, 0], [100, 0], [200, 0]]);
  assert.equal(E.buildEnvelope([{ type: 'Polygon', coordinates: [line] }], 25), null, 'a zero-area ring');
  assert.throws(() => E.buildEnvelope([box(0, 0, 100, 100)], -5), RangeError);
  assert.throws(() => E.buildEnvelope([box(0, 0, 100, 100)], 'wide'), RangeError);
}

// --------------------------------------------------------------- survey
{ // bearings
  const b = SV.parseBearing, eq = (s, az) => { const v = b(s); assert.ok(v != null && Math.abs(v - az) < 1e-9, `${s} -> ${v}, want ${az}`); };
  eq('N42°00\'00"E', 42); eq('N 42-00-00 E', 42); eq('N42.5E', 42.5); eq('n42.5e', 42.5);
  eq('S 15 10 39 W', 180 + 15 + 10 / 60 + 39 / 3600); eq('S28°53\'49"E', 180 - (28 + 53 / 60 + 49 / 3600));
  eq('N15°10\'39"W', 360 - (15 + 10 / 60 + 39 / 3600)); eq('N 42:30 E', 42.5); eq('N42°00′00″E', 42); eq('N 0 W', 0); eq('S 90 E', 90);
  for (const bad of ['', 'north', 'N42', '42E', 'N95E', 'N42°61\'E', 'E42N', null, undefined]) assert.equal(b(bad), null, 'rejects ' + bad);
}
{ // calls
  assert.deepEqual(SV.parseCall('N42°00\'00"E, 160.00\''), { az: 42, dist: 160 });
  assert.deepEqual(SV.parseCall('N 42-00-00 E 160 ft'), { az: 42, dist: 160 });
  assert.deepEqual(SV.parseCall({ bearing: 'S 0 E', dist: 50 }), { az: 180, dist: 50 });
  assert.deepEqual(SV.parseCall({ bearing: 'N90W', distance: '25.5' }), { az: 270, dist: 25.5 });
  assert.equal(SV.parseCall('N42E'), null);
  assert.equal(SV.parseCall('N42E -10'), null);
  const p = SV.parseCalls('N 0 E 100\nN 90 E 50;\nS 0 E 100; S 90 W 50\n');
  assert.equal(p.calls.length, 4); assert.deepEqual(p.bad, []); assert.deepEqual(p.curves, []);
}
{ // a closed rectangle: exact area, no misclosure
  const calls = ['N 0 E 200', 'N 90 E 100', 'S 0 E 200', 'S 90 W 100'];
  const tr = SV.traverse(SV.parseCalls(calls).calls);
  assert.ok(Math.abs(tr.areaSf - 20000) < 1e-9 && tr.closureFt < 1e-9 && tr.perimeterFt === 600, JSON.stringify(tr));
  const r = SV.buildSurvey({ calls, anchor: { lat: LAT, lon: LNG } });
  assert.equal(r.error, undefined);
  assert.equal(r.areaSf, 20000); assert.equal(r.closureFt, 0); assert.equal(r.perimeterFt, 600);
  assert.ok(r.precision > 1e9, 'precision ' + r.precision);
  near(P.areaSqFt(r.geometry), 20000, 5e-5, 'placed rectangle (coordinates kept to 8 decimals, about 1 mm)');
  const ring = r.geometry.coordinates[0];
  assert.deepEqual(ring[0], [LNG, LAT], 'the point of beginning is at the anchor');
  assert.deepEqual(ring[0], ring[ring.length - 1], 'closed ring');
  assert.ok(P.signedArea(ring.map(p => PLANE.toFt(p))) > 0, 'counter-clockwise');
  const ne = PLANE.toFt(ring.reduce((m, p) => p[0] + p[1] > m[0] + m[1] ? p : m));
  assert.ok(Math.abs(ne[0] - 100) < 0.01 && Math.abs(ne[1] - 200) < 0.01, 'the far corner is 100 ft east, 200 ft north: ' + ne);
}
{ // the sample four-call survey: 95,036 SF / 2.18 ac, misclosure about 0.001 ft
  const r = SV.buildSurvey(SAMPLE);
  assert.equal(r.error, undefined, r.error);
  assert.equal(r.areaSf, SAMPLE.expect.areaSf);
  assert.equal(r.acres.toFixed(2), '2.18');
  assert.equal(r.closureFt, SAMPLE.expect.closureFt);
  assert.equal(r.calls, 4);
  assert.equal(r.perimeterFt, 1403);
  assert.ok(r.precision > 1e6 && /^1:[\d,]+$/.test(r.precisionText), r.precisionText);
  assert.equal(r.toleranceFt, 0.5, 'the 0.5 ft floor applies under 5,000 ft of perimeter');
  assert.match(r.placedBy, /point of beginning at 29\.780000, -95\.120000/);
  assert.equal(r.geometry.type, 'Polygon'); assert.equal(r.geometry.coordinates[0].length, 5);
  assert.deepEqual(SV.buildSurvey(JSON.stringify(SAMPLE)).geometry, r.geometry, 'a JSON string works too');
}
{ // FIX: the placed polygon measures the same area as the traverse (the source's flat 364,000 ft/degree did not)
  const tr = SV.traverse(SV.parseCalls(SAMPLE.calls).calls);
  for (const [lat, lon] of [[SAMPLE.anchor.lat, SAMPLE.anchor.lon], [25.9, -97.5], [30.06, -95.93], [45, -93], [61.2, -149.9]]) {
    const r = SV.buildSurvey({ calls: SAMPLE.calls, anchor: { lat, lon } });
    near(P.areaSqFt(r.geometry), tr.areaSf, 0.0005, `placed area at ${lat}°`);
    assert.ok(Math.abs(r.placedAreaSf - r.areaSf) / r.areaSf <= 0.0005, 'placedAreaSf ' + r.placedAreaSf);
  }
  // what the flat constant did at this latitude: about 0.3% too big, six times the allowed error
  const lat0 = SAMPLE.anchor.lat, k = 364000 * Math.cos(lat0 * Math.PI / 180);
  const flat = tr.ring.map(p => [SAMPLE.anchor.lon + p[0] / k, lat0 + p[1] / 364000]);
  assert.ok(rel(P.areaSqFt({ type: 'Polygon', coordinates: [flat] }), tr.areaSf) > 0.002, 'the old placement was off');
}
{ // placed on the provider polygon's centroid when there is no anchor
  const provider = box(-300, -300, 600, 600);
  const r = SV.buildSurvey({ calls: SAMPLE.calls }, provider);
  assert.equal(r.error, undefined, r.error);
  assert.match(r.placedBy, /centred on the provider polygon/);
  const c = PLANE.toFt(P.geometryCentroid(r.geometry));
  assert.ok(Math.hypot(c[0], c[1]) < 0.5, 'centred within half a foot: ' + c);
  near(P.areaSqFt(r.geometry), SV.traverse(SV.parseCalls(SAMPLE.calls).calls).areaSf, 0.0005, 'placed area');
  assert.ok(SV.buildSurvey({ calls: SAMPLE.calls }, { type: 'MultiPolygon', coordinates: [provider.geometry.coordinates] }).geometry, 'a MultiPolygon provider');
}
{ // calls that do not close are refused, with the precision reported; the tolerance is configurable
  const off = SAMPLE.calls.slice(0, 3).concat(['N15°10\'39"W 516.00']);
  const r = SV.buildSurvey({ calls: off, anchor: SAMPLE.anchor });
  assert.match(r.error, /do not close: misclosure 10\.00 ft over 1413 ft \(precision 1:141; allowed 0\.50 ft, 1:10,000\)/);
  assert.equal(r.geometry, undefined);
  assert.ok(Math.abs(r.precision - 141.3) < 0.1 && r.precisionText === '1:141' && r.closureFt === 10, JSON.stringify(r));
  assert.ok(SV.buildSurvey({ calls: off, anchor: SAMPLE.anchor }, null, { closureRatio: 100 }).geometry, 'accepted at 1:100');
  // 0.6 ft over 1,403 ft (1:2,339): refused at the default 1:10,000, accepted at the source's old 1:2,000
  const slight = SAMPLE.calls.slice(0, 3).concat(['N15°10\'39"W 506.60']);
  const d = SV.buildSurvey({ calls: slight, anchor: SAMPLE.anchor });
  assert.match(d.error, /do not close/); assert.match(d.precisionText, /^1:2,3\d\d$/);
  assert.ok(SV.buildSurvey({ calls: slight, anchor: SAMPLE.anchor }, null, { closureRatio: 2000 }).geometry, 'accepted at 1:2,000');
  assert.match(SV.buildSurvey({ calls: slight, anchor: SAMPLE.anchor }, null, { closureRatio: 2000, minClosureFt: 0 }).error || 'accepted', /accepted/);
  assert.match(SV.buildSurvey({ calls: slight, anchor: SAMPLE.anchor }, null, { closureRatio: 5000, minClosureFt: 0 }).error, /do not close/);
}
{ // curves are refused explicitly
  const curve = SAMPLE.calls.slice(0, 2).concat(['Curve to the right, radius 500.00, arc 120.00, chord S42°00\'00"W 119.71'], SAMPLE.calls.slice(3));
  const r = SV.buildSurvey({ calls: curve, anchor: SAMPLE.anchor });
  assert.match(r.error, /^curve calls are not supported yet/);
  assert.match(r.error, /radius 500\.00/);
  for (const c of ['ARC 120.00 R=500', 'along a chord bearing N10E 50', { radius: 500, arc: 120 }, { type: 'curve', bearing: 'N10E', dist: 50 }]) {
    assert.match(SV.buildSurvey({ calls: SAMPLE.calls.concat([c]), anchor: SAMPLE.anchor }).error, /curve calls are not supported yet/, JSON.stringify(c));
  }
}
{ // unreadable or unplaceable surveys say why
  assert.match(SV.buildSurvey({ calls: SAMPLE.calls.concat(['along the fence 100']), anchor: SAMPLE.anchor }).error, /^unreadable survey call\(s\): along the fence 100$/);
  assert.match(SV.buildSurvey({ calls: SAMPLE.calls.slice(0, 2), anchor: SAMPLE.anchor }).error, /at least 3 calls/);
  assert.match(SV.buildSurvey('{not json').error, /not valid JSON/);
  assert.match(SV.buildSurvey(null).error, /no survey/);
  assert.match(SV.buildSurvey({ calls: ['N 0 E 100', 'S 0 E 100', 'N 0 E 0.5', 'S 0 E 0.5'], anchor: SAMPLE.anchor }).error, /enclose no area/);
  const u = SV.buildSurvey({ calls: SAMPLE.calls });
  assert.match(u.error, /cannot be placed on the map/);
  assert.ok(u.precision > 1e6, 'precision still reported');
  assert.match(SV.buildSurvey({ calls: SAMPLE.calls, anchor: { lat: 'x', lon: -95 } }).error, /cannot be placed/);
  assert.match(SV.buildSurvey({ calls: SAMPLE.calls }, { type: 'Point', coordinates: [-95, 30] }).error, /cannot be placed/);
}

console.log('fz site passed');
