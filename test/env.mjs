// Environmental screen (lib/env.mjs, api/env.js) and the company owner lookup (api/entity.js), without the network.
// Run: node test/env.mjs
import assert from 'node:assert/strict';
import { KINDS, kindsIn, siteExtent, distanceMi, direction, featureRow, summarize, soilsQuery, parseSoils } from '../lib/env.mjs';
import { tileUrl } from '../api/env.js';
import { isEntity, cleanOwner, normEntity, bestMatch, shapeDetail, lookupEntity } from '../api/entity.js';

// ---------- geometry: distances measured from the site's edge ----------
// a 0.1 mi square site around downtown Houston
const lon = -95.37, lat = 29.76, d = 0.1 / 69.17, dx = d / Math.cos(lat * Math.PI / 180);
const site = { type: 'Polygon', coordinates: [[[lon - dx, lat - d], [lon + dx, lat - d], [lon + dx, lat + d], [lon - dx, lat + d], [lon - dx, lat - d]]] };
const ext = siteExtent(site);
assert.ok(Math.abs(ext.radius - Math.SQRT2 * 0.1) < 0.002, 'radius is center to corner');
assert.equal(distanceMi(site, { x: lon, y: lat }), 0, 'a point inside is on site');
assert.ok(Math.abs(distanceMi(site, { x: lon, y: lat + d + 0.5 / 69.17 }) - 0.5) < 0.005, 'half a mile north of the north edge');
const pipe = { paths: [[[lon - 0.05, lat + d + 0.2 / 69.17], [lon + 0.05, lat + d + 0.2 / 69.17]]] };
assert.ok(Math.abs(distanceMi(site, pipe) - 0.2) < 0.005, 'a line passing 0.2 mi north (its vertices are far away)');
const crossing = { paths: [[[lon - 0.05, lat], [lon + 0.05, lat]]] };
assert.equal(distanceMi(site, crossing), 0, 'a pipeline crossing the site');
const wet = { rings: [[[lon - 0.1, lat - 0.1], [lon + 0.1, lat - 0.1], [lon + 0.1, lat + 0.1], [lon - 0.1, lat + 0.1], [lon - 0.1, lat - 0.1]]] };
assert.equal(distanceMi(site, wet), 0, 'a site inside a large wetland');
assert.equal(direction([lon, lat], [lon, lat + 0.01]), 'N'); assert.equal(direction([lon, lat], [lon + 0.01, lat - 0.01]), 'SE');

// ---------- rows and summaries ----------
const lpst = (id, mi) => ({ attributes: { SITE_NAME: 'GAS STATION ' + id, PHYS_ADDR: '1 MAIN ST', CITY: 'HOUSTON', LPST_ID: id }, geometry: { x: lon, y: lat + d + mi / 69.17 } });
const rows = [lpst(1, 0.3), lpst(2, 0.05), lpst(3, 0.7), lpst(2, 0.05)].map(f => featureRow('lpst', f, site, ext.center));
assert.equal(rows[1].dir, 'N'); assert.equal(rows[1].id, '2');
const s = summarize('lpst', rows);
assert.equal(s.count, 2, 'within 0.5 mi, the duplicate record counted once'); assert.equal(s.nearest[0].id, '2'); assert.equal(s.search_mi, 0.5);
const w = summarize('wells', [{ name: 'Plugged Oil Well', mi: 0.1 }, { name: 'Oil Well', mi: 0.2, id: 'b' }, { name: 'Plugged Oil Well', mi: 0.15, id: 'c' }].map((r, i) => ({ ...r, id: r.id || 'a' + i })));
assert.deepEqual(w.by_type, [{ type: 'Plugged Oil Well', n: 2 }, { type: 'Oil Well', n: 1 }]);
const p = featureRow('pipelines', { attributes: { OPERATOR: 'ACME PIPELINE', COMMODITY_DESCRIPTION: 'Natural Gas', DIAMETER: 12, STATUS: 'In Service', SYSTEM_NAME: 'X' }, geometry: pipe }, site, ext.center);
assert.equal(p.name, 'ACME PIPELINE'); assert.equal(p.diameter, 12); assert.ok(p.mi < 0.25);
assert.deepEqual(kindsIn('tanks'), ['pst']); assert.ok(kindsIn('cleanup').includes('lpst') && !kindsIn('cleanup').includes('wells'));
for (const [k, K] of Object.entries(KINDS)) { assert.ok(K.url.startsWith('https://'), k); assert.ok(K.mi > 0 && K.mi <= 1, k); assert.ok(K.f.id || K.f.name, k); }

// ---------- soils ----------
assert.match(soilsQuery(site), /SDA_Get_Mukey_from_intersection_with_WktWgs84\('polygon\(\(-95\.37/);
const soil = parseSoils({ Table: [['mukey', 'muname', 'drclassdcd', 'hydgrpdcd', 'flodfreqdcd', 'pondfreqprs', 'engdwbll', 'engdwobdcd', 'engsldcd', 'wtdepannmin'],
  ['1', 'Katy fine sandy loam', 'Moderately well drained', 'C', 'None', '1', 'Not limited', 'Not limited', 'Somewhat limited', null], ['2', 'Katy fine sandy loam', 'x', 'x', 'x', '1', 'x', 'x', 'x', null]] });
assert.equal(soil.length, 1); assert.equal(soil[0].small_commercial, 'Somewhat limited');

// ---------- tiles ----------
assert.match(tileUrl('rrc', 15, 7671, 13561), /RRC_Public_Viewer_Srvs\/MapServer\/export\?.*layers=show%3A1%2C2%2C13/);
assert.match(tileUrl('soils', 15, 7671, 13561), /SDM\.wms\?.*LAYERS=mapunitpoly/); assert.equal(tileUrl('nope', 15, 1, 1), null);

// ---------- company owners ----------
assert.ok(!isEntity('SMITH JOHN & MARY')); assert.ok(isEntity('PROLOGIS-A4 TX LP')); assert.ok(isEntity('SMITH FAMILY TRUST')); assert.ok(isEntity('Hines REIT 1001 Main, L.L.C.'));
assert.equal(cleanOwner('WAL-MART REAL ESTATE BUSINESS TRUST C/O PROPERTY TAX DEPT'), 'WAL-MART REAL ESTATE BUSINESS TRUST');
assert.equal(normEntity('Hines REIT 1001 Main, L.L.C.'), normEntity('HINES REIT 1001 MAIN LLC'));
assert.equal(normEntity('ACME HOLDINGS, LIMITED PARTNERSHIP'), normEntity('Acme Holdings L.P.'));
assert.ok(bestMatch('KATY ASIAN TOWN RETAIL CONDOMINIUM ASSOCIATION IN', [{ name: 'KATY ASIAN TOWN RETAIL CONDOMINIUM ASSOCIATION, IN' }]), 'names cut at 50 characters still match');
assert.equal(bestMatch('ACME LLC', [{ name: 'ACME HOLDINGS LLC' }]), null, 'a different company is not a match');
assert.ok(bestMatch('KATY ASIAN TOWN RETAIL CONDOMINIUM ASSOCIATION', [{ name: 'KATY ASIAN TOWN RETAIL CONDOMINIUM ASSOCIATION, IN' }]), 'the Comptroller name runs on into a cut-off "INC"');
assert.equal(bestMatch('SMITH PROPERTIES', [{ name: 'SMITH PROPERTIES HOLDINGS GROUP LLC' }]), null, 'a longer, different name is not a match');
assert.deepEqual(await lookupEntity('HOUSTON INDEPENDENT SCHOOL DISTRICT', async () => { throw new Error('no call'); }), { query: 'HOUSTON INDEPENDENT SCHOOL DISTRICT', public: true });
assert.deepEqual(await lookupEntity('HARRIS COUNTY', async () => { throw new Error('no call'); }), { query: 'HARRIS COUNTY', public: true });
const cw = { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] }; // clockwise
assert.match(soilsQuery(cw), /polygon\(\(0\.000000 0\.000000,1\.000000 0\.000000,1\.000000 1\.000000/, 'rings go to SQL Server counter-clockwise');
const det = shapeDetail({ taxpayerId: '1', name: 'X LLC', rightToTransactTX: 'ACTIVE', stateOfFormation: ' DE', reportYear: '2026', registeredAgentName: 'C T CORPORATION SYSTEM',
  registeredOfficeAddressStreet: '1999 BRYAN ST', registeredOfficeAddressCity: 'DALLAS', registeredOfficeAddressState: 'TX', registeredOfficeAddressZip: '75201', mailingAddressStreet: '9550 SPRING GREEN BLVD_STE 408',
  officerInfo: [{ AGNT_NM: 'JANE DOE', AGNT_TITL_TX: 'VICE PRESI', AGNT_ACTV_YR: '2026' }, { AGNT_NM: 'JANE DOE', AGNT_TITL_TX: 'DIRECTOR', AGNT_ACTV_YR: '2026' }, { AGNT_NM: 'OLD GUY', AGNT_TITL_TX: 'DIRECTOR', AGNT_ACTV_YR: '2020' }, { AGNT_NM: 'STEVE LI', AGNT_TITL_TX: 'VICE-PRESI', AGNT_ACTV_YR: '2026' }] });
assert.equal(det.state, 'DE'); assert.equal(det.status, 'Active'); assert.equal(det.agent.address, '1999 BRYAN ST, DALLAS, TX 75201'); assert.equal(det.mailing, '9550 SPRING GREEN BLVD STE 408');
assert.deepEqual(det.officers.map(o => [o.name, o.titles]), [['Jane Doe', ['Vice President', 'Director']], ['Steve Li', ['Vice President']]], 'only the latest report year, titles combined and spelled out');
const calls = [];
const fake = async u => { calls.push(u); return { ok: true, json: async () => u.includes('?name=') ? { success: true, data: [{ name: 'PROLOGIS-A4 TX, L.P.', taxpayerId: '12345678901' }, { name: 'PROLOGIS-A5 TX LP', taxpayerId: '2' }], count: 2 } : { success: true, data: { taxpayerId: '12345678901', name: 'PROLOGIS-A4 TX, L.P.', rightToTransactTX: 'ACTIVE' } } }; };
const look = await lookupEntity('PROLOGIS-A4 TX LP', fake);
assert.equal(look.match.taxpayer_id, '12345678901'); assert.equal(look.candidates.length, 1);
assert.match(calls[0], /name=PROLOGIS-A4%20TX$/, 'searched without the legal ending');
assert.deepEqual(await lookupEntity('SMITH JOHN & MARY', fake), { query: 'SMITH JOHN & MARY', individual: true }, 'people are not looked up');
console.log('env ok');
