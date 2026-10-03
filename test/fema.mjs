// Offline tests for the FEMA report (api/fema.js, lib/fema.mjs): flood zone shares, NFIP claims, disaster declarations,
// National Risk Index, tiles and input checks.
import assert from 'node:assert/strict';
const seen = [];
// a square area split down the middle: west half in zone AE (high risk), east half in shaded X (0.2%)
const AREA = { type: 'Polygon', coordinates: [[[-95.40, 29.74], [-95.38, 29.74], [-95.38, 29.76], [-95.40, 29.76], [-95.40, 29.74]]] };
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)); seen.push(u.host + u.pathname + (u.search ? '?' + decodeURIComponent(u.search) : ''));
  if (u.pathname.endsWith('/NFHL/MapServer/28/query')) { const b = new URLSearchParams(opts.body); assert.match(b.get('geometry'), /rings/); return Response.json({ features: [
    { attributes: { FLD_ZONE: 'AE', ZONE_SUBTY: null, SFHA_TF: 'T', STATIC_BFE: 51 }, geometry: { rings: [[[-95.41, 29.73], [-95.39, 29.73], [-95.39, 29.77], [-95.41, 29.77], [-95.41, 29.73]]] } },
    { attributes: { FLD_ZONE: 'X', ZONE_SUBTY: '0.2 PCT ANNUAL CHANCE FLOOD HAZARD', SFHA_TF: 'F', STATIC_BFE: -9999 }, geometry: { rings: [[[-95.39, 29.73], [-95.37, 29.73], [-95.37, 29.77], [-95.39, 29.77], [-95.39, 29.73]]] } }] }); }
  if (u.pathname.endsWith('/NFHL/MapServer/export')) return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } });
  if (u.pathname.includes('National_Risk_Index_Census_Tracts')) return Response.json({ features: [
    { attributes: { TRACTFIPS: '48201412901', COUNTY: 'Harris', STCOFIPS: '48201', POPULATION: 1577, BUILDVALUE: 3e8, RISK_SCORE: 24, RISK_RATNG: 'Relatively Low', EAL_VALT: 1063751, SOVI_SCORE: 9, RESL_SCORE: 16, HRCN_EALT: 600000, HRCN_RISKR: 'Relatively High', RFLD_EALT: 300000, RFLD_RISKR: 'Relatively Moderate', HAIL_EALT: 456, HAIL_RISKR: 'Very Low' } },
    { attributes: { TRACTFIPS: '48201432900', COUNTY: 'Harris', STCOFIPS: '48201', POPULATION: 4000, BUILDVALUE: 1e8, RISK_SCORE: 80, RISK_RATNG: 'Very High', EAL_VALT: 2000000, SOVI_SCORE: 50, RESL_SCORE: 40, HRCN_EALT: 900000, HRCN_RISKR: 'Very High', RFLD_EALT: 1000000, RFLD_RISKR: 'Very High' } }] });
  if (u.pathname === '/api/open/v3/NfipClaims') { const f = u.searchParams.get('$filter'); assert.match(f, /startswith\(censusGeoid,'48201412901'\) or startswith\(censusGeoid,'48201432900'\)/);
    return Response.json({ metadata: { count: 3 }, NfipClaims: [
      { yearOfLoss: 2017, dateOfLoss: '2017-08-27T00:00:00.000Z', amountPaidOnBuildingClaim: 250000, amountPaidOnContentsClaim: 50000, occupancyType: 1, ratedFloodZone: 'AE', floodEvent: 'Hurricane Harvey' },
      { yearOfLoss: 2017, dateOfLoss: '2017-08-28T00:00:00.000Z', amountPaidOnBuildingClaim: 100000, amountPaidOnContentsClaim: 0, occupancyType: 4, ratedFloodZone: 'X', floodEvent: 'Hurricane Harvey' },
      { yearOfLoss: 2001, dateOfLoss: '2001-06-09T00:00:00.000Z', amountPaidOnBuildingClaim: 30000, occupancyType: 1, ratedFloodZone: 'C', floodEvent: 'Tropical Storm Allison' }] }); }
  if (u.pathname === '/api/open/v2/DisasterDeclarationsSummaries') { assert.match(u.searchParams.get('$filter'), /fipsStateCode eq '48' and fipsCountyCode eq '201'/);
    return Response.json({ DisasterDeclarationsSummaries: [
      { disasterNumber: 4798, declarationDate: '2024-07-09T00:00:00.000Z', incidentType: 'Hurricane', declarationTitle: 'HURRICANE BERYL', declarationType: 'DR', ihProgramDeclared: true },
      { disasterNumber: 4798, declarationDate: '2024-07-09T00:00:00.000Z', incidentType: 'Hurricane', declarationTitle: 'HURRICANE BERYL', declarationType: 'DR' },
      { disasterNumber: 3500, declarationDate: '2020-03-13T00:00:00.000Z', incidentType: 'Biological', declarationTitle: 'COVID-19', declarationType: 'EM' }] }); }
  return new Response('unmocked ' + u, { status: 599 });
};
const { default: handler, femaReport, tileBBox } = await import('../api/fema.js');
const { zoneClass, zoneShares, claimsSummary, nriSummary, areaSqMi, samplePoints } = await import('../lib/fema.mjs');

const d = await femaReport(AREA, { label: 'Test area' });
assert.ok(d.area_sqmi > 1.4 && d.area_sqmi < 1.8, 'about 1.6 sq mi: ' + d.area_sqmi);
assert.ok(Math.abs(d.flood_zones.shares.high - 50) < 6 && Math.abs(d.flood_zones.shares.moderate - 50) < 6, JSON.stringify(d.flood_zones.shares));
assert.deepEqual(d.flood_zones.bfe, { min: 51, max: 51 }); assert.equal(d.flood_zones.zones[0].zone.length > 0, true);
assert.equal(d.nfip_claims.claims, 3); assert.equal(d.nfip_claims.paid, 430000); assert.equal(d.nfip_claims.in_high_risk_zone_pct, 33); assert.equal(d.nfip_claims.residential_pct, 67);
assert.deepEqual(d.nfip_claims.top_events.map(e => e.event), ['Hurricane Harvey', 'Tropical Storm Allison']); assert.deepEqual(d.nfip_claims.by_year.map(y => y.year), [2001, 2017]);
assert.equal(d.disasters.count, 2, 'deduped by disaster number'); assert.equal(d.disasters.major, 1); assert.equal(d.disasters.list[0].title, 'HURRICANE BERYL');
assert.equal(d.risk_index.tracts, 2); assert.equal(d.risk_index.hazards[0].hazard, 'Hurricane'); assert.equal(d.risk_index.hazards[0].eal, 1500000); assert.equal(d.risk_index.hazards[0].rating, 'Very High');
assert.equal(d.risk_index.risk_score, 38, 'building-value weighted'); assert.equal(d.risk_index.risk_rating, 'Relatively Low'); assert.equal(d.risk_index.expected_annual_loss, 3063751);
// one failing source doesn't sink the report
const real = globalThis.fetch; globalThis.fetch = async (url, o) => String(url).includes('NfipClaims') ? new Response('down', { status: 503 }) : real(url, o);
const e = await femaReport(AREA); assert.match(e.nfip_claims.error, /OpenFEMA 503/, 'retried once, then reported'); assert.equal(e.risk_index.tracts, 2); globalThis.fetch = real;
// too large
await assert.rejects(femaReport({ type: 'Polygon', coordinates: [[[-96, 29], [-95, 29], [-95, 30], [-96, 30], [-96, 29]]] }), /too large/);
// big but allowed: zone shares skipped, the rest runs
const mid = await femaReport({ type: 'Polygon', coordinates: [[[-95.5, 29.7], [-95.35, 29.7], [-95.35, 29.85], [-95.5, 29.85], [-95.5, 29.7]]] }); assert.match(mid.flood_zones.skipped, /zone shares/);
// handler
const res = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, send(b) { r.body = b; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
let r = res(); await handler({ headers: {}, query: { tile: '14/3780/6770' } }, r); assert.equal(r.code, 200); assert.equal(r.headers['Content-Type'], 'image/png'); assert.match(r.headers['Cache-Control'], /s-maxage=2592000/);
{ const t = seen.find(s => s.includes('/export')); assert.ok(t && /bbox=-10/.test(t) && /layers=show:28/.test(t), t); }
r = res(); await handler({ headers: {}, query: { tile: '6/1/1' } }, r); assert.equal(r.code, 400, 'no tiles zoomed far out');
r = res(); await handler({ headers: {}, query: { lat: '29.75', lon: '-95.39', mi: '0.25' } }, r); assert.equal(r.code, 200); assert.ok(r.body.flood_zones.shares); assert.match(r.headers['Cache-Control'], /s-maxage/);
{ const real2 = globalThis.fetch; globalThis.fetch = async (url, o) => String(url).includes('NfipClaims') ? new Response('down', { status: 503 }) : real2(url, o);
  r = res(); await handler({ headers: {}, query: { lat: '29.75', lon: '-95.39', mi: '0.25' } }, r); assert.equal(r.headers['Cache-Control'], 'no-store', 'a report with a failed part is not cached'); globalThis.fetch = real2; }
r = res(); await handler({ headers: {}, method: 'POST', query: {}, body: { geometry: { type: 'Point', coordinates: [0, 0] } } }, r); assert.equal(r.code, 400);
// pieces
assert.equal(zoneClass('VE'), 'high'); assert.equal(zoneClass('X', 'AREA OF MINIMAL FLOOD HAZARD', 'F'), 'minimal'); assert.equal(zoneClass('D'), 'undetermined'); assert.equal(zoneClass(''), 'unmapped');
assert.equal(zoneShares(AREA, []).shares.unmapped, 100); assert.ok(samplePoints(AREA).length > 700);
assert.ok(Math.abs(areaSqMi({ type: 'MultiPolygon', coordinates: [AREA.coordinates, AREA.coordinates] }) - 2 * areaSqMi(AREA)) < 1e-9);
assert.equal(claimsSummary([]).claims, 0); assert.equal(nriSummary([]), null);
assert.deepEqual(tileBBox(0, 0, 0).map(Math.round), [-20037508, -20037508, 20037508, 20037508]);
console.log('fema tests passed');
