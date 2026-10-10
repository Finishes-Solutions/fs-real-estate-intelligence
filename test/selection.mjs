// Offline tests for the parcels behind a map selection (lib/selection.mjs): what a report or the CRE report runner gets
// when several buildings and parcels are picked. Realistic picks, per CLAUDE.md: a warehouse that sits on two parcels,
// the same parcel reached from two picks, open ground picked inside a parcel already listed, a parcel in two pieces
// (the county service's ArcGIS rings), and Harris / Waller picks that only have a Regrid record (two real records saved
// by api/regrid.js, 2026-10).
import assert from 'node:assert/strict';
const { selectedParcels, combineParcels, runnerFeatures, enrichmentBlock, areaSqft, acresOf, parcelFromRegrid, esriRings } = await import('../lib/selection.mjs');

// --- real Regrid records (Harris County, from the regrid_parcels cache) ---
const waller_isd = { ll_uuid: 'a3a13fd5-729f-4456-b321-946fa978b88a', headline: '19455 Stokes Rd',
  fields: [['Parcel number', '0451510000097'], ['Owner', 'WALLER ISD'], ['Mailing address', '1918 KEY ST, WALLER TX 77484-8400'], ['Land use (county)', 'Land Neighborhood Section 4'], ['Zoning', 'NZ'], ['Zoning description', 'No Zoning'], ['Acres', '27.19019'], ['Legal description', 'TR 63A ABST 847 J WOODWARD']],
  more: [['county', 'harris'], ['gisacre', '27.16'], ['ll_gissqft', '1184429']],
  geom: { type: 'Polygon', coordinates: [[[-95.910874, 30.0542135], [-95.910869, 30.0538835], [-95.9087685, 30.05391], [-95.9088785, 30.058805], [-95.9109745, 30.0587885], [-95.910974, 30.058761], [-95.910947, 30.0575345], [-95.9109315, 30.0567925], [-95.9109225, 30.056363], [-95.9109105, 30.055827], [-95.9108955, 30.0551115], [-95.910874, 30.0542135]]] } };
const pine_dr = { ll_uuid: '6f6fead3-9f3d-4015-b19e-25e4bb353b37', headline: '13463 Pine Dr',
  fields: [['Parcel number', '1359790010045'], ['Owner', 'GRIFFITH BEKET M'], ['Acres', '2.46507'], ['Total value', '1156167'], ['Land value', '529929'], ['Improvement value', '572660'], ['Year built', '1980'], ['Legal description', 'RES C1 BLK 1 WILDWOOD AT NORTHPOINTE SEC 17']],
  more: [['county', 'harris'], ['ll_gissqft', '107381']],
  geom: { type: 'Polygon', coordinates: [[[-95.6439025, 30.0225675], [-95.643898, 30.022461], [-95.6438135, 30.022392], [-95.6426535, 30.0224135], [-95.6425615, 30.0224175], [-95.6425615, 30.022573], [-95.642561, 30.022587], [-95.642555, 30.0227385], [-95.642544, 30.02289], [-95.6439335, 30.023295], [-95.6439025, 30.0225675]]] } };

// area measured from the outline agrees with Regrid's own (1,184,429 sq ft; 107,381 sq ft) within 0.5%
assert.ok(Math.abs(areaSqft(waller_isd.geom) / 1184429 - 1) < 0.005, 'Waller ISD tract area: ' + areaSqft(waller_isd.geom));
assert.ok(Math.abs(areaSqft(pine_dr.geom) / 107381 - 1) < 0.005, 'Pine Dr lot area: ' + areaSqft(pine_dr.geom));
assert.equal(acresOf('1.08 acres'), 1.08); assert.equal(acresOf('43,560 sq ft'), 1); assert.equal(acresOf(''), null); assert.equal(acresOf('Null'), null);
const rp = parcelFromRegrid(waller_isd);
assert.equal(rp.owner, 'WALLER ISD'); assert.equal(rp.county, 'harris'); assert.equal(rp.marketValue, null, 'an exempt school tract has no value: not $0'); assert.equal(rp.zoning, 'NZ · No Zoning');
assert.equal(parcelFromRegrid({ none: true }), null);

// --- appraisal-record parcels (api/building.js normalizeParcel shape) in Fort Bend: two lots side by side ---
const sq = (x0, y0, x1, y1) => [[x0, y0], [x0, y1], [x1, y1], [x1, y0], [x0, y0]]; // clockwise, as ArcGIS sends outer rings
const west = { propId: '264714', owner: 'WEST LOGISTICS LLC', situs: '1200 Industrial Blvd, Sugar Land', county: 'Fort Bend', area: '1.08 acres', landValue: 400000, improvementValue: 2100000, marketValue: 2500000,
  raw: { LEGAL_DESC: 'LOT 1 BLK 2 SUGAR LAND INDUSTRIAL' }, geometry: { type: 'Polygon', coordinates: [sq(-95.6200, 29.6000, -95.6190, 29.6010)] } };
const east = { propId: '264715', owner: 'EAST PARTNERS LP', situs: '1220 Industrial Blvd, Sugar Land', county: 'Fort Bend', area: '1.10 acres', landValue: 420000, improvementValue: 0, marketValue: 420000,
  geometry: { type: 'Polygon', coordinates: [sq(-95.6190, 29.6000, -95.6180, 29.6010)] } };
// a ranch tract the county stores as two outer rings (a road splits it), plus a hole (a cemetery carved out)
const split = { propId: 'R88001', owner: 'BRAZOS RANCH LTD', county: 'Fort Bend', area: '40 acres', marketValue: 900000,
  geometry: { type: 'Polygon', coordinates: [sq(-95.70, 29.50, -95.69, 29.51), sq(-95.688, 29.50, -95.680, 29.51), sq(-95.6975, 29.5025, -95.6970, 29.5030).slice().reverse()] } };

// the warehouse sits on both lots (the card lists both); the west lot was also picked as open ground; a second pick on
// the same warehouse; open ground picked inside the east lot before its record loaded (no record on the pick itself)
const items = [
  // (the card keeps a building's parcel list where src/building.js puts it: b.d.parcels)
  { center: [-95.6190, 29.6005], footprint: { type: 'Polygon', coordinates: [sq(-95.6196, 29.6002, -95.6184, 29.6008)] }, parcel: west, d: { parcel: west, parcels: [west, east] } },
  { center: [-95.6197, 29.6009], footprint: null, parcel: west },
  { center: [-95.6186, 29.6004], footprint: { type: 'Polygon', coordinates: [sq(-95.6196, 29.6002, -95.6184, 29.6008)] }, parcel: east },
  { center: [-95.6182, 29.6001], footprint: null, parcel: null },
  { center: [-95.6950, 29.5050], footprint: null, parcel: split },
  { center: [-95.9099, 30.0563], footprint: null, parcel: null, regrid: waller_isd },
  { center: [-95.6432, 30.0227], footprint: null, parcel: null, regrid: pine_dr },
  { center: [-95.6432, 30.0228], footprint: null, parcel: null, regrid: pine_dr }, // the same Regrid parcel, clicked twice
  { center: [-96.2, 30.3], footprint: null, parcel: null } // nothing known here
];
const { parcels, missing } = selectedParcels(items);
assert.deepEqual(parcels.map(p => p.propId), ['264714', '264715', 'R88001', '0451510000097', '1359790010045'], 'each parcel once, in pick order');
assert.equal(missing.length, 1, 'only the pick with no record anywhere is missing (the open-ground pick inside the east lot is that lot)');
assert.deepEqual(missing[0].center, [-96.2, 30.3]);
// each parcel sits at its own middle, not at the one click on the warehouse
assert.ok(parcels[0].center[0] < -95.619 && parcels[1].center[0] > -95.619, 'west and east lots keep their own centers');
assert.equal(parcels[0].legal, 'LOT 1 BLK 2 SUGAR LAND INDUSTRIAL');
assert.equal(parcels[3].source, 'Regrid'); assert.equal(parcels[0].source, 'County appraisal district');
// no building footprint ever stands in for a parcel
assert.ok(parcels.every(p => !p.geometry || areaSqft(p.geometry) > 30000), 'parcel outlines, not the warehouse');

// the split ranch tract: two pieces and the hole in the first, not one piece with two holes
const g = esriRings(split.geometry);
assert.equal(g.type, 'MultiPolygon'); assert.equal(g.coordinates.length, 2); assert.equal(g.coordinates[0].length, 2, 'the cemetery is a hole in the first piece');
assert.ok(areaSqft(g) > areaSqft({ type: 'Polygon', coordinates: [split.geometry.coordinates[0]] }), 'both pieces count');
assert.deepEqual(esriRings(west.geometry), west.geometry, 'a one-ring parcel is left alone');

// --- the site ---
const site = combineParcels(parcels);
assert.equal(site.count, 5); assert.equal(site.withOutline, 5);
assert.equal(site.geometry.type, 'MultiPolygon'); assert.equal(site.geometry.coordinates.length, 6, 'west, east, two ranch pieces, two Harris lots');
assert.equal(site.totals.acres, Math.round((1.08 + 1.10 + 40 + 27.19019 + 2.46507) * 1e4) / 1e4, 'record acreage, each parcel once');
assert.equal(site.totals.marketValue, 2500000 + 420000 + 900000 + 1156167, 'the exempt tract adds nothing rather than NaN');
assert.deepEqual(site.counties, ['Fort Bend', 'harris']);
assert.equal(site.label, '1200 Industrial Blvd, Sugar Land + 4 more parcels');
assert.equal(combineParcels([parcels[1]]).geometry.type, 'Polygon');
assert.equal(combineParcels([parcels[1]]).label, '1220 Industrial Blvd, Sugar Land');
// one parcel with no outline (record only): the site has no outline, and says so
const noOutline = combineParcels(selectedParcels([{ center: [-95.6, 29.6], parcel: { propId: '9', county: 'Austin', area: '5 acres' } }]).parcels);
assert.equal(noOutline.geometry, null); assert.equal(noOutline.withOutline, 0); assert.equal(noOutline.totals.acres, 5);

// --- what the runner gets ---
const fc = runnerFeatures(parcels);
assert.equal(fc.features.length, 5); assert.equal(fc.features[0].properties.parcelId, '264714'); assert.equal(fc.features[0].properties.acres, 1.08);
assert.equal(fc.features[2].geometry.type, 'MultiPolygon');
const block = enrichmentBlock(parcels, site);
assert.match(block, /5-Parcel Assemblage/); assert.match(block, /\| Total Acreage \| 71\.84 ac \|/); assert.match(block, /WALLER ISD/);
assert.match(block, /\| Legal Description \| LOT 1 BLK 2 SUGAR LAND INDUSTRIAL \|/);
assert.doesNotMatch(block, /\| Total \/ Assessed Value \| \$0/, 'no invented zero value');
const one = enrichmentBlock([parcels[4]], combineParcels([parcels[4]]));
assert.match(one, /^## Confirmed Parcel Record \(Authoritative Source\)/); assert.match(one, /retrieved DIRECTLY from Regrid/);

console.log('selection: ok');
