// Preload for test/countydata.sh (before test/mock-supa.mjs): fakes for every county data source build/county-data.mjs
// reads, shaped like the live answers the probes saw. MOCK_COUNTY_V=2 changes one row of each, drops one, as a later night.
import fs from 'node:fs';
const LOG = process.env.MOCK_LOG, V = process.env.MOCK_COUNTY_V || '1';
const count = h => { if (LOG) fs.appendFileSync(LOG, h + '\n'); };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
const sq = (x, y, d = 0.002) => ({ rings: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]] });
const page = (u, feats) => +u.searchParams.get('resultOffset') ? [] : feats;
const inner = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)), q = u.searchParams; count(u.host + u.pathname);
  // HCAD parcel layer: the accounts asked for, as small squares in Harris County
  if (u.host === 'arcweb.hcad.org') {
    const ids = (q.get('where') || '').match(/'(\d+)'/g)?.map(x => x.slice(1, -1)) || [];
    return json({ features: ids.map((id, i) => ({ attributes: { HCAD_NUM: id }, geometry: sq(-95.4 + i * 0.01, 29.75) })) });
  }
  if (u.host === 'mycity2.houstontx.gov') return json({ features: page(u, [
    { attributes: { AppId: 93620, AppNo: '2026-1484', AppCode: 'C3N', AppStatus: V === '2' ? 'Approved' : 'Being Reviewed', SubdivisionName: 'Ronson Landing', SubdivisionSectionNo: '0', LotCount: 1, AppSubmitDate: Date.parse('2026-09-08') }, geometry: sq(-95.42, 29.85) },
    { attributes: { AppId: 82210, AppNo: '2024-2078', AppCode: 'C3F', AppStatus: 'Action Form Completed', SubdivisionName: 'Express Mart 59', LotCount: 0, AppSubmitDate: Date.parse('2024-10-18') }, geometry: sq(-95.196, 30.096) },
    { attributes: { AppId: 1, AppCode: 'C3F', SubdivisionName: 'In Brazoria', AppSubmitDate: Date.parse('2025-01-01') }, geometry: sq(-95.3, 29.2) }]) });
  if (u.host === 'services.arcgis.com' && u.pathname.includes('/HfQs2ClqmipKpmFK/')) return json({ features: page(u, [{ attributes: { OBJECTID: 1840, SUBDIV_NM: 'CROSS CREEK RANCH', SECTION: '41', LOTS: 88, TYPE: 'RESIDENTIAL', REC_DATE: Date.parse('2026-05-01') }, geometry: sq(-95.85, 29.69) }]) });
  if (u.host === 'services1.arcgis.com' && u.pathname.includes('/PRoAPGnMSUqvTrzq/')) return json({ features: page(u, [{ attributes: { OBJECTID: 521114, ASCODE: 'S643332', Sub_Name: 'Kingwood Place 32' }, geometry: sq(-95.25, 30.04) }].concat(V === '2' ? [{ attributes: { OBJECTID: 600001, Sub_Name: 'Brand New Woods' }, geometry: sq(-95.4, 30.3) }] : [])) });
  if (/^services\d\.arcgis\.com$/.test(u.host) && /CADWebService|CADMatixService/.test(u.pathname)) {
    const c = u.pathname.match(/(\w+?)CAD/)[1]; return json({ features: page(u, [{ attributes: { OBJECTID: 1, CODE: 'S1', DESC_: c.toUpperCase() + ' ACRES SEC 1' }, geometry: sq(c === 'Waller' ? -96.0 : c === 'Austin' ? -96.3 : -96.4, c === 'Washington' ? 30.2 : 29.9) }]) });
  }
  if (u.host === 'services.arcgis.com' && u.pathname.includes('TxDOT_Projects_Info_All')) return json({ features: page(u, [
    { attributes: { CONTROL_SECT_JOB: '140001033', HIGHWAY_NUMBER: 'FM 1774', TYPE_OF_WORK: 'PROFILE MARKINGS', COUNTY_NAME: 'Grimes', PT_PHASE: 'Construction Underway or Begins Soon', PROJ_STG: 'Construction', EST_CONSTRUCTION_COST: V === '2' ? 400000 : 374043.95, ACTUAL_LET_DATE: Date.parse('2025-09-25') }, geometry: { paths: [[[-95.9, 30.4], [-95.91, 30.43]]] } },
    { attributes: { CONTROL_SECT_JOB: '000000001', HIGHWAY_NUMBER: 'US 290', COUNTY_NAME: 'Harris', PROJ_STG: 'Cancelled' }, geometry: { paths: [[[-95.6, 29.9], [-95.7, 29.95]]] } }]) });
  // TCEQ, Bond Review Board (data.texas.gov) and TCEQ's district pages
  if (u.host === 'data.texas.gov' && u.pathname.includes('hr84-s96f')) return json([
    { county: 'WALLER', district_number: '8344284', distict_name: 'WALLER COUNTY MUD 34D', district_type: 'Municipal Utility District', activity_status: 'Active', first_name: 'JIM' },
    { county: 'HARRIS', district_number: '101', distict_name: 'HARRIS COUNTY MUD 004', district_type: 'Municipal Utility District', activity_status: 'Active' }]);
  if (u.host === 'data.texas.gov' && u.pathname.includes('3qmf-seku')) return json(/max\(fiscalyear\)/.test(q.get('$select') || '') ? [{ fy: '2025' }] : [
    { governmenttype: 'WD', governmentname: 'Harris County MUD 04', county: 'Harris', issuancename: 'Unl Tax Bonds Ser 2024', closingdate: '2024-06-01T00:00:00.000', fiscalyear: '2025', totalprincipaloutstanding: '9000000', taxratetotal: '0.95', taxablevalue: '500000000', population: '4000' }]);
  if (u.host === 'services2.arcgis.com' && u.pathname.includes('TCEQ_Water_Districts')) return json({ features: page(u, [{ attributes: { DISTRICT_ID: '8344284', NAME: 'WALLER COUNTY MUD 34D' }, geometry: sq(-95.95, 29.95, 0.01) }, { attributes: { DISTRICT_ID: '999', NAME: 'HARRIS COUNTY MUD 4' }, geometry: sq(-95.5, 29.9, 0.01) }]) });
  if (u.host === 'www14.tceq.texas.gov' && /ListDistricts/i.test(u.search)) return new Response(q.get('CountyCode') === '237' ? '<a href="index.cfm?fuseaction=DetailDistrict&ID=555&command=list&name=WALLER+COUNTY+MUD+34D">x</a>' : q.get('CountyCode') === '101' ? '<a href="index.cfm?fuseaction=DetailDistrict&ID=556&command=list&name=HARRIS+COUNTY+MUD+4">x</a>' : '');
  if (u.host === 'www14.tceq.texas.gov') return new Response('Creation Type: LEGISLATURE Primary County: X Financial Status: FILED Acre Size: 300.5 TAX BOND AUTHORITY Activity Creation Date: ' + (q.get('ID') === '555' ? '03/02/2025' : '01/15/1979') + ' Activity Date');
  // TEA: the org's services, the dated directory (schools) and the yearly layer (enrollment)
  if (u.host === 'services2.arcgis.com' && u.pathname.endsWith('/5MVN2jsqIrNZD4tP/arcgis/rest/services')) return json({ services: [{ name: 'districts_schools_20261005_C' }, { name: 'districts_schools_20260924_C' }, { name: 'Schools_2024_to_2025' }, { name: 'Schools_2023_to_2024' }] });
  if (u.host === 'services2.arcgis.com' && u.pathname.includes('districts_schools_20261005_C')) return json({ features: page(u, [
    { attributes: { id: '237902041', district_name: 'Waller ISD', campus_type: 'Middle / Jr. High', low_grade: 'Grade 6', high_grade: 'Grade 8', name: 'Waller JH', rating: 'B' }, geometry: { x: -95.93, y: 30.06 } },
    { attributes: { id: '227901001', name: 'Austin HS', campus_type: 'High School' }, geometry: { x: -96.1, y: 29.95 } }]) });
  if (u.host === 'services2.arcgis.com' && u.pathname.includes('Schools_2024_to_2025')) return json({ features: page(u, [{ attributes: { USER_School_Number: "'237902041", USER_School_Enrollment_as_of_Oc: 950 } }]) });
  if (/arcgis\.com$|tceq\.texas\.gov$|hcad\.org$|houstontx\.gov$/.test(u.host)) return json({ error: { message: 'unmocked ' + u } }, 200);
  return inner(url, opts);
};
