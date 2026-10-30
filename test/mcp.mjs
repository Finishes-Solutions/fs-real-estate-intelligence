// The MCP server for the project app's agents (api/mcp.js, lib/mcp/): a real MCP SDK client connects to the handler over
// Streamable HTTP in this process, lists the tools and calls every one. Upstream services are faked with answers shaped like
// the live ones (the same shapes the other tests in test/ use, which came from the services' probes in build/probe-*.mjs);
// the app's own data files (data/*.json) are the real committed ones.
// Covers: a Houston property, a property outside Houston (crime says "not covered"), one outside the home counties, an
// upstream timeout, and auth on and off.
import assert from 'node:assert/strict';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

process.env.SUPABASE_URL = 'https://db.test'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_x'; delete process.env.MCP_ACCESS_TOKEN; delete process.env.TOMTOM_API_KEY;
const realFetch = globalThis.fetch, seen = [], flags = { femaSlow: false };
// the three places: downtown Houston (Harris), Katy (Fort Bend, outside Houston) and Austin (outside the home counties)
const HOU = [-95.3664, 29.7569], KATY = [-95.8245, 29.7858], AUS = [-97.7404, 30.2747], WALLER = [-95.9275, 30.0566];
const sq = ([x, y], d = 0.0008) => [[[x - d, y - d], [x + d, y - d], [x + d, y + d], [x - d, y + d], [x - d, y - d]]];
const near = (a, b, d = 0.02) => Math.abs(a[0] - b[0]) < d && Math.abs(a[1] - b[1]) < d;
const months = (y, f) => Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1).padStart(2, '0') + '-' + y, f(i)]));
const fbi = (agency, byYear, { stRate = 400, usRate = 360, pop = 26000 } = {}) => { const act = {}, cl = {}, ppl = {}, st = {}, us = {};
  for (const [y, n] of Object.entries(byYear)) { Object.assign(act, months(y, () => n / 12)); Object.assign(cl, months(y, () => n / 48)); Object.assign(ppl, months(y, () => pop)); Object.assign(st, months(y, () => stRate / 12)); Object.assign(us, months(y, () => usRate / 12)); }
  return { offenses: { rates: { 'Texas Offenses': st, 'United States Offenses': us, [agency + ' Offenses']: {} }, actuals: { [agency + ' Offenses']: act, [agency + ' Clearances']: cl } },
    populations: { population: { Texas: {}, 'United States': {}, [agency]: ppl } }, cde_properties: { max_data_date: { UCR: '09/2026' }, last_refresh_date: { UCR: '09/15/2026' } } }; };
const agencyRow = (ori, name, type, counties) => ({ ori, agency_name: name, agency_type_name: type, counties, state_abbr: 'TX', is_nibrs: true, nibrs_start_date: '2019-01-01' });
const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
const timeout = () => { throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }); };

function route(u, opts) {
  const q = u.searchParams, body = opts.body instanceof URLSearchParams ? opts.body : typeof opts.body === 'string' && !opts.body.startsWith('{') && !opts.body.startsWith('[') ? new URLSearchParams(opts.body) : null, P = k => q.get(k) ?? body?.get(k);
  const pt = () => { const g = P('geometry') || ''; if (g.startsWith('{')) { const o = JSON.parse(g); return o.x != null ? [o.x, o.y] : null; } const [x, y] = g.split(',').map(Number); return Number.isFinite(y) ? [x, y] : null; };
  // ---- US Census geocoder: addresses (the MCP resolver) and coordinates (api/crimeus) ----
  if (u.host === 'geocoding.geo.census.gov' && u.pathname.endsWith('/onelineaddress')) {
    const a = q.get('address').toUpperCase(), hit = [['1001 MAIN', HOU, '1001 MAIN ST, HOUSTON, TX, 77002', 'Harris', '48201', 'Houston'], ['24600 KATY', KATY, '24600 KATY FWY, KATY, TX, 77494', 'Fort Bend', '48157', 'Katy'], ['1100 CONGRESS', AUS, '1100 CONGRESS AVE, AUSTIN, TX, 78701', 'Travis', '48453', 'Austin']].find(h => a.includes(h[0]));
    return J({ result: { input: { address: { address: a } }, addressMatches: hit ? [{ matchedAddress: hit[2], coordinates: { x: hit[1][0], y: hit[1][1] }, addressComponents: { zip: hit[2].slice(-5) },
      geographies: { Counties: [{ BASENAME: hit[3], NAME: hit[3] + ' County', GEOID: hit[4] }], States: [{ STUSAB: 'TX' }], 'Incorporated Places': [{ BASENAME: hit[5], NAME: hit[5] + ' city' }] } }] : [] } });
  }
  if (u.host === 'geocoding.geo.census.gov') { const x = +q.get('x'), c = x < -97 ? 'Travis' : x < -95.7 ? 'Fort Bend' : 'Harris', p = x < -97 ? 'Austin' : x < -95.7 ? 'Katy' : 'Houston';
    return J({ result: { geographies: { States: [{ STUSAB: 'TX', STATE: '48' }], Counties: [{ BASENAME: c, NAME: c + ' County', STATE: '48' }], 'Incorporated Places': [{ BASENAME: p, NAME: p + ' city' }] } } }); }
  // ---- parcels: StratMap identify (Fort Bend), HCAD (Harris) ----
  if (u.host === 'feature.geographic.texas.gov') { const [x, y] = q.get('geometry').split(',').map(Number);
    return J({ results: near([x, y], KATY) ? [{ attributes: { PROP_ID: '412345', OWNER_NAME: 'KATY RETAIL PARTNERS LP', SITUS_ADDR: '24600 KATY FWY', SITUS_CITY: 'KATY', SITUS_ZIP: '77494', LOC_LAND_USE: 'F1', MKT_VALUE: '18500000', LAND_VALUE: '6500000', IMP_VALUE: '12000000', GIS_AREA: '12.48', YEAR_BUILT: '2008', TAX_YEAR: '2026', COUNTY: 'Fort Bend' }, geometry: { rings: sq(KATY, 0.0012) } }] : [] }); }
  if (u.host === 'arcweb.hcad.org') { const w = P('where') || '', p0 = pt();
    if (/HCAD_NUM = '0010010000001'/.test(w) || (p0 && near(p0, HOU, 0.003))) return J({ features: [{ attributes: { HCAD_NUM: '0010010000001', owner: 'MAIN STREET TOWER LP', address: '1001 MAIN ST', city: 'HOUSTON', zip: '77002', state_class: 'F1', mkt_val: 120000000, land_val: 20000000, impr_val: 100000000, legal_lines: 'LT 1 BLK 74|SSBB', subdivision: 'SSBB' }, geometry: { rings: sq(HOU) } }] });
    return J({ features: [] }); }
  // ---- roads (TIGERweb Transportation, the site_plan tool's streets): the layer list, then lines by layer ----
  if (u.host === 'tigerweb.geo.census.gov' && u.pathname.endsWith('/Transportation/MapServer')) return J({ layers: [{ id: 2, name: 'Primary Roads' }, { id: 3, name: 'Primary Roads Labels' }, { id: 4, name: 'Secondary Roads' }, { id: 8, name: 'Local Roads' }, { id: 9, name: 'Local Roads Labels' }] });
  if (u.host === 'tigerweb.geo.census.gov' && /\/Transportation\/MapServer\/\d+\/query/.test(u.pathname)) { const id = +u.pathname.split('/').at(-2), [w, s0, e, n] = P('geometry').split(',').map(Number), lines = [];
    if (id === 2 && near([(w + e) / 2, (s0 + n) / 2], KATY)) lines.push(['KATY FWY', [[KATY[0] - 0.01, KATY[1] - 0.0015], [KATY[0] + 0.01, KATY[1] - 0.0015]]]); // I-10 along the south side
    if (id === 8 && near([(w + e) / 2, (s0 + n) / 2], KATY)) lines.push(['Pin Oak Rd', [[KATY[0] - 0.0014, KATY[1] - 0.004], [KATY[0] - 0.0014, KATY[1] + 0.004]]]); // a street along the west side
    if (id === 4 && near([(w + e) / 2, (s0 + n) / 2], WALLER, 0.05)) lines.push(['FM 362', [[WALLER[0] - 0.01, WALLER[1] - 0.0013], [WALLER[0] + 0.01, WALLER[1] - 0.0013]]]);
    if (id === 8 && near([(w + e) / 2, (s0 + n) / 2], WALLER, 0.05)) lines.push(['Cross St', [[WALLER[0], WALLER[1] - 0.004], [WALLER[0], WALLER[1] + 0.004]]]); // between the two Waller parcels
    return J({ features: lines.map(([NAME, path]) => ({ attributes: { NAME, MTFCC: 'S1400' }, geometry: { paths: [path] } })) }); }
  // ---- city limits, schools, counties (TIGERweb) ----
  if (u.host === 'tigerweb.geo.census.gov' && u.pathname.includes('/Places_CouSub_ConCity_SubMCD/MapServer/4/') && P('returnCountOnly')) { const x = JSON.parse(P('geometry')).rings[0][0][0]; return J({ count: x > -95.7 && x < -95 ? 1 : 0 }); }
  if (u.host === 'tigerweb.geo.census.gov' && u.pathname.includes('/Places_CouSub_ConCity_SubMCD/MapServer/4/')) { const p0 = pt(), dist = P('distance');
    const name = p0 && p0[0] < -97 ? 'Austin' : p0 && near(p0, WALLER, 0.01) ? 'Waller' : p0 && p0[0] < -95.7 ? 'Katy' : 'Houston', list = [{ attributes: { BASENAME: name, NAME: name + ' city' } }]; if (dist && name === 'Katy') list.push({ attributes: { BASENAME: 'Brookshire', NAME: 'Brookshire city' } });
    return J({ features: list }); }
  if (u.host === 'tigerweb.geo.census.gov' && u.pathname.includes('/School/')) return J({ features: u.pathname.includes('/MapServer/0/') ? [{ attributes: { NAME: 'Katy Independent School District' } }] : [] });
  if (u.host === 'tigerweb.geo.census.gov' && u.pathname.includes('State_County')) return J({ type: 'FeatureCollection', features: /TRAVIS/.test(q.get('where') || '') ? [{ type: 'Feature', properties: { GEOID: '48453', BASENAME: 'Travis' }, geometry: { type: 'Polygon', coordinates: sq(AUS, 0.3) } }] : [] });
  // ---- FEMA ----
  if (u.pathname.endsWith('/NFHL/MapServer/28/query')) { if (flags.femaSlow) timeout(); const gt = P('geometryType'), p0 = pt();
    if (gt === 'esriGeometryPoint' && P('where')) return J({ features: [{ attributes: { FLD_ZONE: 'AE' }, geometry: { rings: [[[p0[0] + 0.004, p0[1] - 0.01], [p0[0] + 0.01, p0[1] - 0.01], [p0[0] + 0.01, p0[1] + 0.01], [p0[0] + 0.004, p0[1] + 0.01], [p0[0] + 0.004, p0[1] - 0.01]]] } }] });
    if (gt === 'esriGeometryPoint') return J({ features: [near(p0, HOU) ? { attributes: { FLD_ZONE: 'AE', ZONE_SUBTY: null, SFHA_TF: 'T', STATIC_BFE: 41.5 } } : { attributes: { FLD_ZONE: 'X', ZONE_SUBTY: 'AREA OF MINIMAL FLOOD HAZARD', SFHA_TF: 'F', STATIC_BFE: -9999 } }] });
    const [x, y] = (gt === 'esriGeometryMultipoint' ? JSON.parse(P('geometry')).points[0] : JSON.parse(P('geometry')).rings[0][0]);
    return J({ features: [{ attributes: { OBJECTID: 1, FLD_ZONE: 'AE', ZONE_SUBTY: null, SFHA_TF: 'T', STATIC_BFE: 41 }, geometry: { rings: [[[x - 0.05, y - 0.05], [x + 0.0005, y - 0.05], [x + 0.0005, y + 0.05], [x - 0.05, y + 0.05], [x - 0.05, y - 0.05]]] } },
      { attributes: { OBJECTID: 2, FLD_ZONE: 'X', ZONE_SUBTY: '0.2 PCT ANNUAL CHANCE FLOOD HAZARD', SFHA_TF: 'F', STATIC_BFE: -9999 }, geometry: { rings: [[[x + 0.0005, y - 0.05], [x + 0.05, y - 0.05], [x + 0.05, y + 0.05], [x + 0.0005, y + 0.05], [x + 0.0005, y - 0.05]]] } }] }); }
  if (u.pathname.includes('National_Risk_Index_Census_Tracts')) return J({ features: [{ attributes: { TRACTFIPS: '48201100000', COUNTY: 'Harris', STCOFIPS: '48201', POPULATION: 3200, BUILDVALUE: 9e8, RISK_SCORE: 71, RISK_RATNG: 'Relatively High', EAL_VALT: 2400000, SOVI_SCORE: 40, RESL_SCORE: 55, HRCN_EALT: 1400000, HRCN_RISKR: 'Very High', RFLD_EALT: 600000, RFLD_RISKR: 'Relatively High' } }] });
  if (u.pathname === '/api/open/v3/NfipClaims') return J({ metadata: { count: 2 }, NfipClaims: [{ yearOfLoss: 2017, dateOfLoss: '2017-08-27T00:00:00.000Z', amountPaidOnBuildingClaim: 250000, amountPaidOnContentsClaim: 50000, occupancyType: 4, ratedFloodZone: 'AE', floodEvent: 'Hurricane Harvey' },
    { yearOfLoss: 2001, dateOfLoss: '2001-06-09T00:00:00.000Z', amountPaidOnBuildingClaim: 80000, occupancyType: 4, ratedFloodZone: 'AE', floodEvent: 'Tropical Storm Allison' }] });
  if (u.pathname === '/api/open/v2/DisasterDeclarationsSummaries') return J({ DisasterDeclarationsSummaries: [{ disasterNumber: 4798, declarationDate: '2024-07-09T00:00:00.000Z', incidentType: 'Hurricane', declarationTitle: 'HURRICANE BERYL', declarationType: 'DR', ihProgramDeclared: true }] });
  // ---- TxDOT counts: the site's GET (roads beside a point) and the area report's POST ----
  if (u.pathname.includes('TxDOT_AADT')) {
    if (P('outStatistics')) return J({ features: [{ attributes: { RTE_PRFX: 'IH', avg: 210000, n: 6, mx: 250000 } }, { attributes: { RTE_PRFX: 'CS', avg: 9000, n: 30, mx: 31000 } }] });
    if (opts.method === 'POST') return J({ features: [{ attributes: { RTE_PRFX: 'IH', RTE_NBR: '0010', AADT_CUR: 250000, SYSTEM: 'On', EXT_DATE: '2025-12-31', BEGIN_DFO: 12.1 }, geometry: { paths: [[[-95.83, 29.784], [-95.82, 29.785]]] } },
      { attributes: { RTE_PRFX: 'CS', RTE_NM: 'GRAND PKWY', AADT_CUR: 31000, SYSTEM: 'Off', EXT_DATE: '2025-12-31', BEGIN_DFO: 1 }, geometry: { paths: [[[-95.81, 29.78], [-95.81, 29.79]]] } }] });
    return J({ features: [{ attributes: { RTE_PRFX: 'IH', RTE_NBR: '0010', AADT_CUR: 250000, SYSTEM: 'On' } }, { attributes: { RTE_PRFX: 'CS', RTE_NBR: '255262', AADT_CUR: 11969, SYSTEM: 'Off' } }] });
  }
  // ---- districts, ECHO, Comptroller ----
  if (u.pathname.includes('TCEQ_Water_Districts')) return J({ features: [{ attributes: { NAME: 'Fort Bend County MUD 81', TYPE: 'MUD', TYPE_DESCRIPTION: 'Municipal Utility District', STATUS: 'A', Area_SqMi: 2.1 } }] });
  if (u.pathname.includes('Opportunity_Zones')) return J({ features: [] });
  if (u.pathname.endsWith('COH_Tax_Incentive_Reinvestment_Zones_view/FeatureServer')) return J({ layers: [{ id: 3, name: 'TIRZ' }] });
  if (u.pathname.endsWith('COH_Tax_Incentive_Reinvestment_Zones_view/FeatureServer/3/query')) return J({ features: [{ attributes: { NAME: 'Downtown', TIRZ_NO: 3 } }] });
  if (u.pathname.endsWith('COH_METRO_Bus_Stops_view/FeatureServer')) return J({ layers: [{ id: 0 }] });
  if (u.pathname.endsWith('COH_METRO_Bus_Stops_view/FeatureServer/0/query')) return J({ count: 14 });
  if (u.pathname.endsWith('get_facilities')) return J({ Results: { QueryID: '985', QueryRows: '2' } });
  if (u.pathname.endsWith('get_qid')) return J({ Results: { Facilities: [{ FacName: 'CLEAN CO', FacSNCFlg: 'N' }, { FacName: 'SPILL CO', FacStreet: '1 MAIN', FacSNCFlg: 'Y', TRIFlag: 'Y' }] } });
  if (u.host === 'data.texas.gov' && u.pathname.endsWith('naix-2893.json')) return J([]);
  if (u.host === 'data.texas.gov' && u.pathname.endsWith('jrea-zgmq.json')) return J([{ outlet_name: 'BUC-EES #12', taxpayer_name: 'BUC-EES LTD', outlet_address: '24600 KATY FWY', outlet_city: 'KATY', outlet_zip_code: '77494', outlet_naics_code: '447110', outlet_permit_issue_date: '2021-05-01T00:00:00.000' },
    { outlet_name: 'KOLACHE CORNER', taxpayer_name: 'KC FOODS LLC', outlet_address: '24600 KATY FWY STE 120', outlet_city: 'KATY', outlet_zip_code: '77494', outlet_naics_code: '722513', outlet_permit_issue_date: '2025-02-10T00:00:00.000' }]);
  if (u.host === 'comptroller.texas.gov') return J(q.get('name') ? { success: true, data: [{ name: 'PROLOGIS-A4 TX, L.P.', taxpayerId: '12345678901' }], count: 1 }
    : { success: true, data: { taxpayerId: '12345678901', name: 'PROLOGIS-A4 TX, L.P.', rightToTransactTX: 'ACTIVE', sosRegistrationStatus: 'ACTIVE', stateOfFormation: 'DE', effectiveSosRegistrationDate: '2012-03-01', registeredAgentName: 'CT CORPORATION SYSTEM', registeredOfficeAddressStreet: '1999 BRYAN ST', registeredOfficeAddressCity: 'DALLAS', registeredOfficeAddressState: 'TX', registeredOfficeAddressZip: '75201', reportYear: 2026,
      officerInfo: [{ AGNT_NM: 'PROLOGIS LOGISTICS SERVICES', AGNT_TITL_TX: 'GENERAL PA', AGNT_ACTV_YR: 2026 }] } });
  // ---- environmental layers (TCEQ, EPA, Railroad Commission, wetlands) and soils ----
  if (/gisweb\.tceq|geopub\.epa|gis\.rrc|fwspublicservices/.test(u.host)) {
    if (P('returnIdsOnly')) return J({ objectIds: [] });
    if (u.pathname.includes('/LPST/')) return J({ features: [{ attributes: { SITE_NAME: 'CORNER STORE #4', PHYS_ADDR: '24550 KATY FWY', CITY: 'KATY', LPST_ID: '118822' }, geometry: { x: KATY[0] + 0.002, y: KATY[1] } }] });
    return J({ features: [] }); }
  if (u.host.toLowerCase() === 'sdmdataaccess.sc.egov.usda.gov') return J({ Table: [['mukey', 'muname', 'drclassdcd', 'hydgrpdcd', 'flodfreqdcd', 'pondfreqprs', 'engdwbll', 'engdwobdcd', 'engsldcd', 'wtdepannmin'], ['1', 'Katy fine sandy loam, 0 to 1 percent slopes', 'Moderately well drained', 'C', 'None', '0', 'Very limited', 'Somewhat limited', 'Somewhat limited', '61']] });
  // ---- utilities ----
  if (u.pathname.endsWith('/interpreter')) return J({ elements: [{ type: 'way', id: 1, tags: { power: 'line', voltage: '138000', operator: 'CenterPoint Energy' }, geometry: [{ lon: KATY[0] + 0.003, lat: KATY[1] - 0.01 }, { lon: KATY[0] + 0.003, lat: KATY[1] + 0.01 }] }] });
  if (u.pathname.includes('PUC_CCN_Sewer_Water/MapServer/1/')) return J({ features: [{ attributes: { UTILITY: 'CITY OF KATY', CCN_NO: '10511' } }] });
  if (u.pathname.includes('PUC_CCN_Sewer_Water/MapServer/2/')) return J({ features: [{ attributes: { UTILITY: 'CITY OF KATY', CCN_NO: '20220' } }] });
  if (u.pathname.includes('PUC_CCN_Sewer_Water/MapServer/0/')) return J({ features: [] });
  // ---- elevations: USGS 3DEP, land falling to the south-east about 1% ----
  if (u.pathname.endsWith('/3DEPElevation/ImageServer/getSamples')) { const g = JSON.parse(P('geometry'));
    return J({ samples: g.points.map((p, i) => ({ locationId: i, value: String(30 + (p[1] - KATY[1]) * 1110 - (p[0] - KATY[0]) * 965), resolution: 1.15 })) }); }
  // ---- FBI Crime Data Explorer ----
  if (u.pathname.endsWith('/agency/byStateAbbr/TX')) return J({ HARRIS: [agencyRow('TXHPD0000', 'Houston Police Department', 'City', 'FORT BEND, HARRIS, MONTGOMERY'), agencyRow('TX1012700', 'Katy Police Department', 'City', 'FORT BEND, HARRIS, WALLER'), agencyRow('TX1010000', "Harris County Sheriff's Office", 'County', 'HARRIS')],
    'FORT BEND': [agencyRow('TX0790000', "Fort Bend County Sheriff's Office", 'County', 'FORT BEND')], TRAVIS: [agencyRow('TX2270100', 'Austin Police Department', 'City', 'TRAVIS'), agencyRow('TX2270000', "Travis County Sheriff's Office", 'County', 'TRAVIS')] });
  { const sm = u.pathname.match(/\/summarized\/agency\/(\w+)\/([\w-]+)$/); if (sm) { const name = { TX1012700: 'Katy Police Department', TX2270100: 'Austin Police Department', TXHPD0000: 'Houston Police Department' }[sm[1]] || 'X';
    return J(fbi(name, { 2024: sm[2] === 'violent-crime' ? 40 : 600, 2025: sm[2] === 'violent-crime' ? 36 : 560 })); } }
  // ---- the app's database (PostgREST) ----
  if (u.host === 'db.test') return db(u.pathname.replace('/rest/v1/', ''), q, opts.body ? JSON.parse(opts.body) : null);
  return new Response('unmocked ' + u, { status: 599 });
}
const FILINGS = [
  { id: 'TABS2026010001', name: 'Katy Crossing Retail Center', county: 'Fort Bend', city: 'Katy', addr: '24700 Katy Fwy', type: 'New', cost: 14500000, sqft: 62000, owner: 'KATY RETAIL PARTNERS LP', reg: '2026-03-02', status: 'Registered', ts: '2026-05-01', te: '2027-04-30', lat: KATY[1] + 0.004, lon: KATY[0] + 0.003, use: 'Retail', subtype: 'shopping center', developer: 'NewQuest Properties', architect: 'Powers Brown Architecture', gc: 'Tribble & Stephens', units: null },
  { id: 'TABS2026010002', name: 'Katy ISD Elementary #47', county: 'Fort Bend', city: 'Katy', addr: '2100 Spring Green Blvd', type: 'New', cost: 48000000, sqft: 120000, owner: 'Katy ISD', reg: '2025-11-14', status: 'Review complete', ts: '2026-01-05', te: '2027-07-30', lat: KATY[1] - 0.01, lon: KATY[0] - 0.006, use: 'Education', subtype: 'elementary school', developer: 'Katy ISD', architect: 'PBK Architects', gc: 'Tribble & Stephens', units: null },
  { id: 'TABS2026010003', name: 'Main Street Tower Lobby', county: 'Harris', city: 'Houston', addr: '1001 Main St', type: 'Reno', cost: 2100000, sqft: 9000, owner: 'MAIN STREET TOWER LP', reg: '2026-06-20', status: 'Registered', ts: '2026-08-01', te: '2026-12-31', lat: HOU[1], lon: HOU[0], use: 'Office', subtype: 'lobby renovation', developer: 'Hines', architect: 'Gensler', gc: 'Harvey Builders', units: null }];
function db(path, q, body) {
  if (path === 'rpc/crime_near') return J([{ period: 'last12', cat: 'v', n: 120, latest: '2026-07-31' }, { period: 'last12', cat: 'p', n: 800, latest: '2026-07-31' }, { period: 'last12', cat: 'o', n: 300 }, { period: 'prior12', cat: 'v', n: 100 }, { period: 'prior12', cat: 'p', n: 900 }]);
  if (path === 'rpc/crime_report') return J({ latest: '2026-07-31', from: '2025-08-01', area_sqmi: 0.785, totals: { last12_v: 150, last12_p: 728, last12_o: 1283, prior12_v: 145, prior12_p: 927, prior12_o: 1293 },
    by_code: [['13B', 255, 'o'], ['23H', 204, 'p'], ['13A', 94, 'v']], by_premise: [['Parking Lot, Garage', 245]], by_month: [['2026-07', 11, 35, 91]], city_last12: { v: 25000, p: 90000, o: 107000 } });
  if (path === 'rpc/crime_latest') return J('2026-07-31');
  if (path === 'rpc/crime_list_json') return J(Array.from({ length: Math.min(body.p_limit, 1200) }, (_, i) => ({ day: '2026-07-' + String(31 - (i % 30)).padStart(2, '0'), code: i % 3 ? '23F' : '13A', cat: i % 3 ? 'p' : 'v', n: 1, premise: 'Parking Lot, Garage', lon: HOU[0] + (i % 40) * 0.0002, lat: HOU[1] + Math.floor(i / 40) * 0.0002 })));
  if (path === 'rpc/places_search') return J([{ id: 'ov:1', name: "Buc-ee's", grp: 'auto', cat: 'gas_station', brand: "Buc-ee's", addr: '27700 Katy Fwy', city: 'Katy', lon: -95.86, lat: 29.78, rank: 0, km: 3.5 }]);
  if (path === 'rpc/places_near') return J([{ id: 'ov:2', name: 'Kolache Corner', grp: 'food', cat: 'bakery', addr: '24600 Katy Fwy', city: 'Katy', lon: KATY[0], lat: KATY[1], m: 40 }, { id: 'ov:3', name: 'Katy Dental', grp: 'health', cat: 'dentist', addr: '24610 Katy Fwy', city: 'Katy', lon: KATY[0], lat: KATY[1], m: 120 }]);
  if (path === 'rpc/places_counts') return J({ food: 140, shop: 220, health: 90, office: 60 });
  if (path === 'rpc/places_in_box') return J([['ov:2', 'Kolache Corner', 'food', KATY[0], KATY[1]]]);
  if (path === 'rpc/dev_in_box') return J([['permit:hcad:1', 'permit', 'New commercial building', 'New commercial', '2026-08-02', KATY[0] + 0.002, KATY[1] + 0.003, null, 3200000, null],
    ['plat:fb:1', 'plat', 'Cross Creek Ranch Sec 41', 'Residential', '2026-05-01', KATY[0] - 0.004, KATY[1] - 0.004, 88, null, null], ['district:1', 'district', 'Fort Bend County MUD 81', 'MUD', '1998-01-01', KATY[0], KATY[1] + 0.002, null, 0.58, null],
    ['plat:old', 'plat', 'Old Plat', 'Residential', '2019-01-01', KATY[0], KATY[1], 10, null, null]]);
  if (path === 'rpc/county_meta') return J({ hcad_permits: { at: '2026-10-22T05:00:00Z' } });
  if (path === 'rpc/airports_near') return J([{ ident: 'KIAH', name: 'George Bush Intercontinental Houston Airport', type: 'large_airport', lon: -95.3414, lat: 29.9844, iata: 'IAH', icao: 'KIAH', scheduled: true, km: 25.4 }, { ident: 'KHOU', name: 'William P Hobby Airport', type: 'large_airport', lon: -95.2789, lat: 29.6454, iata: 'HOU', icao: 'KHOU', scheduled: true, km: 14.9 }]);
  if (path === 'airport_runways') return J([{ airport_ident: 'KHOU', le_ident: '04', he_ident: '22', length_ft: 7602, surface: 'CON', closed: false, le_lat: 29.6375, le_lon: -95.2877, he_lat: 29.6537, he_lon: -95.2693 }]);
  if (path === 'rpc/crime_peer_rank') return J({ peers: 310, type: 'City', state: 'TX', year: 2025, v_lower_than_pct: 82, p_lower_than_pct: 64 });
  if (path === 'rpc/crime_rankings') return J([{ ori: 'TX1012700', name: 'Katy Police Department', pop: 26000, v_rate: 138.5, p_rate: 2153.8 }]);
  if (path === 'crime_agencies') return J(q.get('state') ? [{ data_through: '2025-12-31' }] : []);
  if (path === 'filings') return J(+q.get('offset') ? [] : FILINGS);
  if (path === 'news_articles') return J([{ url: 'https://example.com/katy-crossing', title: 'NewQuest breaks ground on Katy Crossing', domain: 'Houston Business Journal', published: '2026-04-02', filing_news: [{ filing_id: 'TABS2026010001' }] }]);
  if (path === 'places_loads') return J([{ at: '2026-10-01T06:00:00Z' }]);
  return J({ message: 'unmocked ' + path }, 404);
}
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)); if (u.hostname === '127.0.0.1') return realFetch(url, opts);
  seen.push(u.host + u.pathname); return route(u, opts);
};

// ---------- the handler, served in this process like Vercel would (req.body parsed) ----------
const { default: handler, authorized, LIMITS } = await import('../api/mcp.js');
const srv = http.createServer(async (req, res) => { let b = ''; for await (const c of req) b += c; req.body = b ? JSON.parse(b) : undefined; req.query = {}; await handler(req, res); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const URL0 = 'http://127.0.0.1:' + srv.address().port + '/api/mcp';
const connect = async (headers = {}) => { const c = new Client({ name: 'amp-test', version: '1.0.0' }); await c.connect(new StreamableHTTPClientTransport(new URL(URL0), { requestInit: { headers } })); return c; };
const c = await connect();
const call = async (name, args) => { const r = await c.callTool({ name, arguments: args }); const t = r.content.find(x => x.type === 'text')?.text || ''; return { ...r, text: t }; };

// ---------- tools/list: names, schemas, read-only ----------
const { tools } = await c.listTools();
const NAMES = ['list_datasets', 'find_property', 'site_facts', 'flood', 'terrain', 'environmental', 'utilities', 'traffic_counts', 'demographics', 'market_context', 'businesses', 'businesses_at_address', 'company_lookup', 'development_activity', 'construction_filings', 'top_companies', 'crime_near', 'crime_by_agency', 'news', 'airports_near', 'area_overview', 'site_plan', 'report_flood', 'report_environmental', 'report_crime', 'report_crime_agency', 'report_demographics', 'report_market', 'plan_set', 'plan_set_status', 'site_renderings'];
for (const n of NAMES) assert.ok(tools.some(t => t.name === n), 'tool ' + n);
for (const t of tools) {
  assert.equal(t.annotations?.readOnlyHint, true, t.name + ' read-only'); assert.equal(t.annotations?.openWorldHint, true, t.name);
  assert.equal(t.inputSchema.type, 'object', t.name); assert.ok(t.description.length > 60, t.name + ' describes itself');
}
assert.ok(['address', 'apn', 'county', 'lat', 'lon', 'radius_mi', 'bbox', 'geojson'].every(k => tools.find(t => t.name === 'flood').inputSchema.properties[k]), 'one location input everywhere');
assert.ok(JSON.stringify(tools).length < 85000, 'the tool list stays small'); // (both branches' tools: plan sets, renderings, parcel-by-parcel site plans, projects and the study together)
console.log('mcp tools/list ok:', tools.length, 'tools');

// every answer: compact, with sources; never secrets or internal URLs
const clean = (r, name) => { assert.ok(r.text.length < 15500, name + ' is compact (' + r.text.length + ')'); assert.ok(!/sb_secret|db\.test|SUPABASE|service.role/i.test(r.text), name + ' leaks nothing'); };

// ---------- list_datasets ----------
let r = await call('list_datasets', {}); clean(r, 'list_datasets');
assert.match(r.text, /Covers the seven home counties/); assert.match(r.text, /City of Houston only/); assert.match(r.text, /current as of 2026-/, 'data file dates'); assert.match(r.text, /Not included on purpose: Google Places, TomTom/);

// ---------- a Houston property ----------
r = await call('find_property', { address: '1001 Main St, Houston, TX 77002' }); clean(r, 'find_property');
assert.match(r.text, /\[exact, US Census Geocoder\]/); assert.match(r.text, /Harris County/); assert.match(r.text, /Inside the city limits of Houston city/);
assert.match(r.text, /Owner \(appraisal roll\): MAIN STREET TOWER LP/); assert.match(r.text, /Market value: \$120,000,000/); assert.match(r.text, /Outline \(GeoJSON, lon\/lat\): \{"type":"Polygon"/); assert.match(r.text, /Harris Central Appraisal District/);
r = await call('find_property', { apn: '001-001-000-0001', county: 'Harris' }); assert.match(r.text, /APN 0010010000001/, 'APN lookup (HCAD)');
r = await call('find_property', { apn: '412345', county: 'Fort Bend' }); assert.equal(r.isError, true); assert.match(r.text, /Fort Bend County isn’t searchable by APN/);
r = await call('site_facts', { address: '1001 Main St, Houston, TX 77002' }); clean(r, 'site_facts');
assert.match(r.text, /Zone AE.*high risk/); assert.match(r.text, /I-10: 250,000 vehicles\/day/); assert.match(r.text, /TIRZ \(Houston\): Downtown \(TIRZ 3\)/); assert.match(r.text, /1,220 incidents \(120 violent, 800 property\)/); assert.match(r.text, /Census tract: 48201/);
r = await call('crime_near', { address: '1001 Main St, Houston, TX 77002' }); clean(r, 'crime_near');
assert.match(r.text, /Incidents, last 12 months: 2,161/); assert.match(r.text, /Houston citywide 347/); assert.match(r.text, /Per 1,000 residents/); assert.match(r.text, /incidents through 2026-07-31/);
r = await call('flood', { address: '1001 Main St, Houston, TX 77002' }); clean(r, 'flood');
assert.match(r.text, /Area measured: Parcel at 1001 Main St, Houston \(APN 0010010000001\)/); assert.match(r.text, /Zone AE.*Base flood elevation: 41.5 ft/); assert.match(r.text, /Nearest high-risk \(100-year\) zone: 0\.2\d mi away \(zone AE\)/); assert.match(r.text, /Flood zones across the area \([\d.]+ acres\)/); assert.match(r.text, /Hurricane Harvey 1/); assert.match(r.text, /HURRICANE BERYL/); assert.match(r.text, /Overall: Relatively High/);
r = await call('airports_near', { address: '1001 Main St, Houston, TX 77002' }); clean(r, 'airports_near'); assert.match(r.text, /George Bush Intercontinental.*IAH \/ KIAH/); assert.match(r.text, /04\/22 7,602 ft/);
console.log('mcp Houston property ok');

// ---------- a property outside Houston (Katy, Fort Bend) ----------
const K = { address: '24600 Katy Fwy, Katy, TX 77494' };
r = await call('crime_near', K); clean(r, 'crime_near outside'); assert.equal(r.isError, undefined);
assert.match(r.text, /not covered here \(covers the City of Houston only/); assert.match(r.text, /This place is in Katy city/); assert.match(r.text, /crime_by_agency/);
r = await call('find_property', K); assert.match(r.text, /Inside the city limits of Katy city\. Also within 0.5 mi of: Brookshire city \(a city’s extraterritorial jurisdiction/); assert.match(r.text, /KATY RETAIL PARTNERS LP/); assert.match(r.text, /Acreage: 12.5 acres/);
r = await call('site_facts', K); assert.match(r.text, /Street-level crime: not covered here/); assert.match(r.text, /Fort Bend County MUD 81/); assert.match(r.text, /Katy Independent School District/);
r = await call('terrain', K); clean(r, 'terrain');
assert.match(r.text, /Site measured: Parcel at 24600 KATY FWY \(APN 412345\)/); assert.match(r.text, /falls about [\d.]+ ft toward the south-east/); assert.match(r.text, /Share of the site by slope: 0–2% [\d.]+%, 2–5%/); assert.match(r.text, /USGS 3DEP \(1 m lidar\)/);
assert.ok(!seen.some(s => s.includes('open-meteo')), 'no Open-Meteo');
r = await call('environmental', K); clean(r, 'environmental'); assert.match(r.text, /Leaking petroleum storage tank \(TCEQ LPST\) \(within 0.5 mi\): 1/); assert.match(r.text, /CORNER STORE #4/); assert.match(r.text, /Katy fine sandy loam/); assert.match(r.text, /not a Phase I/);
r = await call('utilities', K); clean(r, 'utilities'); assert.match(r.text, /138 kV transmission line \(CenterPoint Energy\)/); assert.match(r.text, /Water service area: City Of Katy \(CCN 10511\)/); assert.match(r.text, /ODbL/);
r = await call('traffic_counts', K); clean(r, 'traffic_counts'); assert.match(r.text, /I-10: 250,000/); assert.match(r.text, /Grand Pkwy: 31,000/); assert.match(r.text, /TxDOT file of 2025-12-31/);
r = await call('demographics', K); clean(r, 'demographics'); assert.match(r.text, /## 1 mi[\s\S]*## 3 mi[\s\S]*## 5 mi/); assert.match(r.text, /Median household income \(approx\.\): \$/); assert.match(r.text, /Households by income/); assert.match(r.text, /ACS 20\d\d–20\d\d/);
r = await call('demographics', { county: 'Waller' }); assert.match(r.text, /## Waller County/); assert.match(r.text, /Population: [\d,]+/);
r = await call('market_context', K); clean(r, 'market_context'); assert.match(r.text, /Market context: Fort Bend County/); assert.match(r.text, /## Jobs \(LODES/); assert.match(r.text, /Construction pipeline/);
r = await call('market_context', { county: 'all', topic: 'rates' }); assert.match(r.text, /10-yr Treasury/); assert.ok(!/## Jobs/.test(r.text), 'one topic');
r = await call('businesses', { ...K, radius_mi: 0.25 }); clean(r, 'businesses'); assert.match(r.text, /Retail: 220/); assert.match(r.text, /Kolache Corner/);
r = await call('businesses', { query: "Buc-ee's", ...K }); assert.match(r.text, /Buc-ee's \(gas station\), 27700 Katy Fwy/);
r = await call('businesses_at_address', K); clean(r, 'businesses_at_address'); assert.match(r.text, /BUC-EES #12 \(owner: BUC-EES LTD\)/); assert.match(r.text, /suite 120/);
r = await call('company_lookup', { name: 'PROLOGIS-A4 TX LP' }); clean(r, 'company_lookup'); assert.match(r.text, /Texas taxpayer number: 12345678901/); assert.match(r.text, /CT CORPORATION SYSTEM/);
r = await call('company_lookup', { name: 'SMITH JOHN & MARY' }); assert.match(r.text, /looks like a person’s name/);
r = await call('development_activity', K); clean(r, 'development_activity'); assert.match(r.text, /Plats and new subdivisions: 1/, 'the 2019 plat is older than 12 months'); assert.match(r.text, /Fort Bend County MUD 81/); assert.match(r.text, /Harris County only/);
r = await call('construction_filings', { ...K, radius_mi: 3 }); clean(r, 'construction_filings');
assert.match(r.text, /2 filings, \$62.5M/); assert.match(r.text, /Katy ISD Elementary #47/); assert.ok(!/Main Street Tower/.test(r.text), 'only filings inside the circle'); assert.match(r.text, /statewide table/);
r = await call('construction_filings', { ...K, radius_mi: 3, uses: ['Retail'] }); assert.match(r.text, /1 filings, \$14.5M/);
r = await call('top_companies', { ...K, radius_mi: 3 }); clean(r, 'top_companies'); assert.match(r.text, /Tribble & Stephens: 2 filings, \$62.5M/); assert.match(r.text, /PBK Architects/);
r = await call('crime_by_agency', { ...K, rankings: true }); clean(r, 'crime_by_agency');
assert.match(r.text, /Katy Police Department \[TX1012700\]/); assert.match(r.text, /Violent crime: [\d.]+ per 100,000 \(Texas 400/); assert.match(r.text, /lower than 82%/); assert.match(r.text, /Katy Police Department \[TX1012700\]: violent 138.5/);
r = await call('news', { place: 'Waller' }); clean(r, 'news'); assert.match(r.text, /Local development news: Waller/); assert.match(r.text, /https:\/\//);
r = await call('news', { query: 'Katy Crossing' }); assert.match(r.text, /NewQuest breaks ground on Katy Crossing.*filing TABS2026010001/);
r = await call('area_overview', K); clean(r, 'area_overview');
for (const h of ['Demographics (1 mi)', 'Construction filings', 'Development activity', 'Businesses by category', 'Crime (Houston)', 'County market']) assert.ok(r.text.includes('## ' + h), h);
assert.match(r.text, /not covered here \(covers the City of Houston only/);
console.log('mcp property outside Houston ok');

// ---------- outside the home counties (Austin) ----------
const AU = { address: '1100 Congress Ave, Austin, TX 78701' };
r = await call('demographics', AU); assert.match(r.text, /Travis County/); assert.match(r.text, /Census tract demographics: not covered here \(covers the seven home counties/);
r = await call('market_context', AU); assert.match(r.text, /not covered here/);
r = await call('development_activity', AU); assert.match(r.text, /Development activity: not covered here/);
r = await call('businesses', AU); assert.match(r.text, /Business listings: not covered here/);
r = await call('crime_near', AU); assert.match(r.text, /not covered here \(covers the City of Houston only/);
r = await call('flood', AU); assert.match(r.text, /Zone X/, 'FEMA is national');
r = await call('crime_by_agency', AU); assert.match(r.text, /Austin Police Department \[TX2270100\]/);
r = await call('find_property', AU); assert.match(r.text, /Home region \(the app’s seven counties\): no/); assert.match(r.text, /No parcel found/);
r = await call('demographics', { county: 'Travis' }); assert.match(r.text, /not covered here/);
console.log('mcp outside the home counties ok');

// ---------- an upstream timeout: a short note for that part, the rest still answers ----------
flags.femaSlow = true;
r = await call('flood', { address: '1001 Main St, Houston, TX 77002' }); assert.notEqual(r.isError, true, 'partial, not a failure');
assert.match(r.text, /FEMA’s flood map didn’t answer in time; try again/); assert.match(r.text, /HURRICANE BERYL/, 'OpenFEMA still answered');
r = await call('site_facts', { address: '1001 Main St, Houston, TX 77002' }); assert.match(r.text, /FEMA didn’t answer in time/); assert.match(r.text, /I-10: 250,000/);
flags.femaSlow = false;
console.log('mcp upstream timeout ok');

// ---------- reports: the website's PDFs as embedded resources ----------
{
  const fs = await import('node:fs'), { PDFDocument } = await import('pdf-lib'), R = await import('../lib/mcp/reports.mjs');
  const { localChrome } = await import('./helpers/chrome.mjs'), haveChrome = !!localChrome();
  if (!haveChrome) { // no local Chromium: a stand-in that makes a real one-page PDF with the HTML's title
    R.hooks.render = async (html, { title }) => { const d = await PDFDocument.create(); d.setTitle(title); d.addPage(); return Buffer.from(await d.save()); };
    console.log('mcp reports: no Chromium at CHROME_PATH, rendering with a stand-in'); }
  let dumps = 0; const pdfOf = async (r, kind) => {
    assert.notEqual(r.isError, true, kind + ': ' + r.text); const res = r.content.find(x => x.type === 'resource'); assert.ok(res, kind + ' has a resource');
    assert.equal(res.resource.mimeType, 'application/pdf'); assert.match(res.resource.uri, new RegExp('^report://' + kind + '/[a-z0-9-]+\\.pdf$'));
    const buf = Buffer.from(res.resource.blob, 'base64'); assert.equal(buf.subarray(0, 5).toString(), '%PDF-', kind + ' is a PDF');
    if (process.env.MCP_DUMP) fs.writeFileSync(process.env.MCP_DUMP + '/' + kind + '-' + (++dumps) + '.pdf', buf); // to look at them
    const pdf = await PDFDocument.load(buf); assert.ok(pdf.getPageCount() >= 1); assert.ok(buf.length < R.PDF_LIMIT, kind + ' fits (' + buf.length + ')');
    assert.ok(JSON.stringify(r).length < R.VERCEL_RESPONSE_LIMIT, 'the whole answer fits under Vercel’s cap'); assert.match(r.text, /Attached: .* report PDF \(\d+ pages?, /); return { buf, pdf }; };
  const H = { address: '1001 Main St, Houston, TX 77002' };
  let ipn = 0; const call = async (name, args, ip = '10.9.0.' + (++ipn)) => { const c3 = await connect({ 'X-Forwarded-For': ip }); try { const x = await c3.callTool({ name, arguments: args }); return { ...x, text: x.content.find(y => y.type === 'text')?.text || '' }; } finally { await c3.close(); } };
  r = await call('report_flood', H); clean(r, 'report_flood'); await pdfOf(r, 'flood'); assert.match(r.text, /FEMA flood & hazard report: Parcel at 1001 Main St/); assert.match(r.text, /NFIP claims/);
  r = await call('report_environmental', { ...K, include_csv: true }); clean(r, 'report_environmental'); await pdfOf(r, 'environmental');
  { const csv = r.content.find(x => x.resource?.mimeType === 'text/csv'); assert.ok(csv, 'CSV when asked'); assert.match(csv.resource.uri, /^report:\/\/environmental\/.*\.csv$/); assert.match(csv.resource.text, /^Database,Search \(mi\),Name/); assert.match(csv.resource.text, /CORNER STORE #4/); }
  r = await call('report_crime', { ...H, include_csv: true }); clean(r, 'report_crime'); await pdfOf(r, 'crime'); assert.match(r.text, /Incidents, 12 months through 2026-07-31: 2,161/);
  assert.match(r.content.find(x => x.resource?.mimeType === 'text/csv').resource.text, /^Date,Offense,NIBRS code/);
  r = await call('report_crime', K); assert.equal(r.content.some(x => x.type === 'resource'), false, 'no PDF outside Houston'); assert.match(r.text, /not covered here \(covers the City of Houston only/); assert.match(r.text, /report_crime_agency/);
  r = await call('report_crime_agency', K); clean(r, 'report_crime_agency'); await pdfOf(r, 'crime_agency'); assert.match(r.text, /Katy Police Department \[TX1012700\]/);
  r = await call('report_crime_agency', AU); await pdfOf(r, 'crime_agency');
  r = await call('report_demographics', { ...K, include_csv: true }); clean(r, 'report_demographics'); { const { buf } = await pdfOf(r, 'demographics');
    assert.match(r.text, /Demographics report: 24600 KATY FWY/); assert.match(r.text, /^1 mi: [\d,]+ people/m); assert.match(r.text, /^5 mi: /m);
    const csv = r.content.find(x => x.resource?.mimeType === 'text/csv').resource.text; assert.match(csv, /^Area,Table,Item,Value/); assert.match(csv, /1 mi,Figures,Population,\d+/); assert.match(csv, /Households by income/); }
  r = await call('report_demographics', { ...K, radii: [2, 10] }); await pdfOf(r, 'demographics'); assert.match(r.text, /^2 mi: /m); assert.match(r.text, /^10 mi: /m);
  r = await call('report_demographics', { county: 'Waller' }); await pdfOf(r, 'demographics'); assert.match(r.text, /Waller County: [\d,]+ people/);
  r = await call('report_market', { county: 'Waller', include_csv: true }); clean(r, 'report_market'); await pdfOf(r, 'market');
  assert.match(r.text, /Market report: Waller County/); assert.match(r.text, /Under construction \(TDLR filings\): \$/);
  assert.match(r.content.find(x => x.resource?.mimeType === 'text/csv').resource.text, /^Area,Section,Item,Value,Note/);
  r = await call('report_market', { counties: ['Harris', 'Fort Bend'] }); await pdfOf(r, 'market'); assert.match(r.text, /Market report: Harris \+ Fort Bend counties/);
  r = await call('report_market', { ...H }); await pdfOf(r, 'market'); assert.match(r.text, /Market report: Harris County/, 'the county the property is in');
  r = await call('report_market', { county: 'all' }); await pdfOf(r, 'market'); assert.match(r.text, /Houston region \(7 counties\)/);
  r = await call('report_market', AU); assert.equal(r.content.some(x => x.type === 'resource'), false); assert.match(r.text, /not covered here/);
  r = await call('report_market', { counties: ['Waller', 'Travis'] }); assert.match(r.text, /Travis.*not covered here/);
  { const M = await R.marketReportData({ all: false, fips: ['48201'], label: 'Harris County' }), html = (await import('../lib/reports/market.mjs')).marketReport(R.serverKit(24)).reportHtml(M);
    for (const h of ['What’s moving', 'Construction pipeline', 'Growth &amp; demand', 'Housing &amp; rents', 'Costs &amp; rates', 'Area: crime, roads and news']) assert.ok(html.includes('<h2>' + h), h);
    assert.match(html, /Crime, City of Houston/, 'Harris gets Houston crime'); assert.match(html, /Busiest roads \(TxDOT/); assert.ok(!/<script/.test(html)); }
  r = await call('report_demographics', AU); assert.equal(r.content.some(x => x.type === 'resource'), false); assert.match(r.text, /not covered here \(covers the seven home counties/);
  { const R2 = await import('../lib/reports/demographics.mjs'), { demographicsData } = await import('../lib/mcp/area.mjs');
    const { rings } = await demographicsData({ center: KATY, kind: 'point', geometry: null }, [1, 3, 5]);
    const html = R2.demographicsReport(R.serverKit(24)).reportHtml({ label: 'Katy', center: KATY, rings: rings.map(x => ({ ...x, label: x.mi + ' mi' })), years: { acs: '2020–2024' } });
    assert.match(html, /<div class="kicker">Demographics report<\/div>|class="k">Demographics report/); assert.match(html, /By ring/); assert.match(html, /Households by income/); assert.match(html, /Consumer spending by category/);
    assert.equal((html.match(/stroke-dasharray="7 4"/g) || []).length, 2, 'the 3 and 5 mile rings dashed'); assert.match(html, />Site</); }
  if (haveChrome) { // the report is the website's: its title band and sections, no logo or name
    const html = await R.finishHtml((await import('../lib/reports/fema.mjs')).femaReport(R.serverKit(24)).reportHtml({ ...(await (await import('../api/fema.js')).femaReport({ type: 'Polygon', coordinates: [[[-95.37, 29.75], [-95.36, 29.75], [-95.36, 29.76], [-95.37, 29.76], [-95.37, 29.75]]] })), area_sqmi: 0.4 }, 'Check', null));
    assert.match(html, /FEMA flood &amp; hazard report/); assert.ok(!/logo-white\.png|Real Estate Intelligence|Finishes/.test(html), 'no logo or name'); }
  // the size check: a report that can't fit says so, it doesn't fail silently or send a cut-off PDF
  R.hooks.pdfLimit = 2000;
  r = await call('report_flood', H); assert.equal(r.isError, true); assert.equal(r.content.some(x => x.type === 'resource'), false);
  assert.match(r.text, /The PDF came out at [\d.]+ MB, over the 0\.0 MB that fits in one answer here \(Vercel caps a response at 4\.5 MB and base64 adds a third\)/);
  R.hooks.pdfLimit = null;
  // reports are rate-limited tighter than data tools (they launch Chromium)
  const { allow } = await import('../api/_lib/guard.mjs'); while (allow('mcp-report:10.9.9.9', LIMITS.report));
  r = await call('report_flood', H, '10.9.9.9'); assert.equal(r.isError, true); assert.match(r.text, /Too many requests for report_flood/);
  r = await call('flood', H, '10.9.9.9'); assert.notEqual(r.isError, true, 'data tools still answer');
  console.log('mcp reports ok' + (haveChrome ? ' (Chromium)' : ''));

  // ---------- site_plan: the app's layout engine on a parcel, with the AI's steps stood in for ----------
  const SPT = await import('../lib/mcp/siteplan.mjs'), aiCalls = [];
  if (!haveChrome) { SPT.hooks.render = R.hooks.render; SPT.hooks.snapshots = async svgs => svgs.map(() => 'data:image/jpeg;base64,AAAA'); }
  const stubAI = async b => { aiCalls.push(b);
    if (b.mode === 'bestuse') return { status: 200, model: 'test-model', body: { summary: 'Freeway frontage with a side street.', ideas: [
      { title: 'Retail strip with pads', use: 'retail', fit: 84, why: 'I-10 frontage and traffic.', risks: ['Driveway permits from TxDOT'], request: '30,000 sf retail strip with 2 pad sites' },
      { title: 'Medical office', use: 'medical', fit: 70, why: 'Growing area.', risks: [], request: '20,000 sf medical office building' }] } };
    if (b.mode === 'strategy') return { status: 200, model: 'test-model', body: { pick: 0, why: 'Shops face the freeway.', strategies: [{ name: 'Shops on the frontage, pond at the back', settings: {} }] } };
    if (b.mode === 'review') return { status: 200, model: 'test-model', body: { reviews: b.options.map((o, i) => ({ option: i, score: 88 - i * 6, verdict: 'Faces the freeway and parks well.', strengths: ['Visible'], problems: [] })), ranking: b.options.map((_, i) => i), revise: false, program: null, params: {}, why: '', summary: 'The first layout is best.', brief: null } };
    return { status: 200, model: 'test-model', body: { program: { use: 'retail', gfa: 30000, floors: 1, parkingRatio: 4 }, setbacks: { front: 25, side: 10, rear: 20, paving: 10 }, summary: 'A 30,000 sf strip with two pads.', assumptions: ['4 spaces per 1,000 sf'] } }; };
  const spOf = async (r, what) => { const pdf = await pdfOf(r, 'site_plan'); assert.match(r.text, /## Layouts/, what); assert.match(r.text, /## Picked: Layout \d/, what); assert.match(r.text, /Concept only/, what); return pdf; };
  // a request on the Katy parcel (Fort Bend: found by its address), Low: no planning or review, the front on the freeway
  SPT.hooks.ai = stubAI; aiCalls.length = 0;
  const ST = await import('../lib/mcp/store.mjs'), mem = ST.memoryStore(); ST.hooks.store = mem; // the picked plan is saved for plan_set and site_renderings
  r = await call('site_plan', { ...K, request: '30,000 sf retail strip', effort: 'low', include_geojson: true }); clean(r, 'site_plan');
  { const id = /^Plan id: ([\w-]+) \(give it to plan_set/m.exec(r.text)?.[1]; assert.ok(id, 'a plan_id'); const saved = await ST.getJSON(mem, 'plans/' + id + '.json');
    assert.ok(saved.plan.elements.some(e => e.kind === 'building'), 'the picked layout saved'); assert.ok(saved.plan.ring.length >= 3); assert.match(saved.address, /24600 KATY FWY/); assert.ok(saved.facts.length, 'with the site facts'); assert.equal(saved.verdict, /Quality check: (\w[\w ]*?) \(/.exec(r.text)[1].toLowerCase()); }
  ST.hooks.store = null;
  await spOf(r, 'low'); assert.match(r.text, /front [\d,]+ ft on KATY FWY/, 'the front faces I-10'); assert.match(r.text, /side street/, 'and the street on the west side');
  assert.match(r.text, /Read as: Retail · 30,000 sf/); assert.deepEqual(aiCalls.map(b => b.mode || 'program'), ['program'], 'Low: the program only');
  { const gj = JSON.parse(r.content.find(x => x.resource?.mimeType === 'application/geo+json').resource.text); assert.equal(gj.type, 'FeatureCollection'); assert.ok(gj.features.some(f => f.properties.kind === 'building' && f.properties.floorAreaSf > 0), 'buildings in the GeoJSON');
    assert.ok(gj.features.every(f => f.geometry.coordinates[0].every(([x, y]) => Math.abs(x - KATY[0]) < 0.01 && Math.abs(y - KATY[1]) < 0.01)), 'in lon/lat on the parcel'); }
  // no request: the AI's best-use ideas, the best one laid out, planned and reviewed (Medium), the drawings sent as pictures
  aiCalls.length = 0; r = await call('site_plan', { ...K });
  await spOf(r, 'best use'); assert.match(r.text, /## Best-use ideas/); assert.match(r.text, /laid out #1 \(Retail strip with pads\)/); assert.match(r.text, /The AI’s pick: Faces the freeway/);
  assert.deepEqual(aiCalls.map(b => b.mode || 'program'), ['bestuse', 'strategy', 'program', 'review'], 'Medium: plan, program, review');
  { const bu = aiCalls[0]; assert.ok(bu.site.acres > 10 && bu.site.frontageFt > 500, 'the AI gets the site'); assert.ok(bu.nearby?.restaurant || Object.keys(bu.nearby || {}).length, 'and what is nearby (the app\'s places, not OpenStreetMap)');
    assert.ok(bu.facts.some(f => /FEMA flood zone/.test(f)), 'and the site facts'); const rv = aiCalls.at(-1); assert.ok(rv.options.length >= 1 && rv.options.every(o => o.metrics.floorAreaSf >= 0)); assert.match(rv.options[0].image || '', /^data:image\/jpeg;base64,/, 'drawings go with the review'); }
  aiCalls.length = 0; r = await call('site_plan', { ...K, idea: 2, effort: 'low' }); assert.match(r.text, /laid out #2 \(Medical office\)/); assert.match(r.text, /Read as: /);
  // two parcels with a street between them (Waller, inside the City of Waller): merged as one site with the street a no-build
  // strip, laid out under the Waller guardrails, the guardrails page on the sheet
  { const k = 364567 * Math.cos(WALLER[1] * Math.PI / 180), ll = ([x, y]) => [WALLER[0] + x / k, WALLER[1] + y / 364567], box = (x0, x1) => [[[x0, -400], [x1, -400], [x1, 400], [x0, 400], [x0, -400]].map(ll)];
    aiCalls.length = 0; r = await call('site_plan', { geojson: { type: 'MultiPolygon', coordinates: [box(-470, -20), box(20, 470)] }, request: 'shopping center with a grocery anchor', effort: 'low', include_geojson: true });
    await spOf(r, 'two parcels'); assert.match(r.text, /2 parcels merged/); assert.match(r.text, /front [\d,]+ ft on FM 362/); assert.match(r.text, /inside the city limits of Waller/); assert.match(r.text, /Waller planning guardrails/);
    assert.ok(JSON.parse(r.content.find(x => x.resource?.mimeType === 'application/geo+json').resource.text).features.some(f => f.properties.kind === 'keepout'), 'the street between them is a no-build strip');
    if (haveChrome) { const d = await PDFDocument.load(Buffer.from(r.content.find(x => x.resource?.mimeType === 'application/pdf').resource.blob, 'base64')); assert.equal(d.getPageCount(), 2, 'SP-1 and the guardrails page SP-1A'); } }
  // no AI on the deployment: a request is read directly; with no request there's nothing to suggest
  SPT.hooks.ai = async () => ({ status: 503, body: { error: 'AI is not configured on this deployment (OPENAI_API_KEY is missing).' } });
  r = await call('site_plan', { ...K, request: '200 apartments, 3 stories', effort: 'high' }); await spOf(r, 'no AI'); assert.match(r.text, /read directly/); assert.match(r.text, /Read as: Multifamily · 200 units · 3 stories/);
  assert.ok(!/passes every check/.test(r.text) || /\| Passes \|/.test(r.text), 'never says a failing pick passes'); { const picked = /\*\*(Layout \d+)[^|]*\(picked\) \|[^\n]*\| ([^|]+) \| [^|]+ \|\n/.exec(r.text); if (picked && !/Passes/.test(picked[2])) assert.match(r.text, /No layout passes every check/); }
  r = await call('site_plan', { ...K }); assert.equal(r.isError, true); assert.match(r.text, /Give a request instead/);
  // a slow AI near the time limit: its steps are skipped or cut off, and the plan still comes back, saying so
  SPT.hooks.ai = () => new Promise(() => {}); SPT.hooks.budgetMs = 36000;
  { const t = Date.now(); r = await call('site_plan', { ...K, request: '30,000 sf retail strip', effort: 'medium' }); await spOf(r, 'slow AI'); assert.ok(Date.now() - t < 20000, 'cut off in time');
    assert.match(r.text, /Planning step skipped to stay inside the time limit/); assert.match(r.text, /the AI didn’t answer, so the request was read directly/); }
  SPT.hooks.budgetMs = null;
  // not a site: a county, a circle; and the plain-words errors
  r = await call('site_plan', { county: 'Waller', request: 'retail' }); assert.equal(r.isError, true); assert.match(r.text, /needs one site/);
  r = await call('site_plan', { ...K, radius_mi: 1, request: 'retail' }); assert.equal(r.isError, true); assert.match(r.text, /not a circle/);
  r = await call('site_plan', { address: 'Katy', request: 'retail' }); assert.equal(r.isError, true); assert.match(r.text, /is a town, not a site/);
  { const { siteAI } = await import('../api/siteplan.js'), key = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY; // the in-process entry: no key, a 503 like the endpoint's
    const x = await siteAI({ mode: 'bestuse', site: { acres: 5 } }); assert.equal(x.status, 503); assert.match(x.body.error, /not configured/); if (key) process.env.OPENAI_API_KEY = key; }
  SPT.hooks.ai = null;
  console.log('mcp site_plan ok' + (haveChrome ? ' (Chromium)' : ''));
}

// ---------- bad input: a sentence, not a crash ----------
r = await call('flood', {}); assert.equal(r.isError, true); assert.match(r.text, /Give a location/);
r = await call('find_property', { address: '99999 Nowhere Rd, Nowhere, TX' }); assert.equal(r.isError, true); assert.match(r.text, /found no match/);
r = await call('demographics', { lat: 29.7, lon: -95.4, radius_mi: 400 }); assert.equal(r.isError, true); assert.match(r.text, /radius_mi must be between/);
r = await call('find_property', { geojson: { type: 'Point', coordinates: [0, 0] } }); assert.equal(r.isError, true);
await c.close();

// ---------- auth: off (above), then on ----------
process.env.MCP_ACCESS_TOKEN = 'amp-secret-token';
assert.equal(authorized({ headers: {} }), false); assert.equal(authorized({ headers: { authorization: 'Bearer amp-secret-token' } }), true); assert.equal(authorized({ headers: { authorization: 'Bearer amp-secret-tokeX' } }), false);
await assert.rejects(connect(), /401|Unauthorized/, 'no token: 401');
await assert.rejects(connect({ Authorization: 'Bearer wrong' }), /401|Unauthorized/);
const c2 = await connect({ Authorization: 'Bearer amp-secret-token' }); assert.ok((await c2.listTools()).tools.length >= 27); await c2.close();
delete process.env.MCP_ACCESS_TOKEN;
// GET / DELETE: 405
for (const method of ['GET', 'DELETE']) { const x = await realFetch(URL0, { method }); assert.equal(x.status, 405); assert.equal((await x.json()).error.code, -32000); }
assert.ok(LIMITS.report.perMinute < LIMITS.data.perMinute, 'reports are limited tighter');
console.log('mcp auth ok');

srv.close(); await (await import('../lib/pdf.mjs')).closeBrowser();
console.log('mcp tests passed');
