// lib/countydata.mjs: each county data source's rows, as the probes saw them on 2026-10-14 (build/probe-county*.mjs).
import assert from 'node:assert/strict';
import * as C from '../lib/countydata.mjs';

// dates: epoch ms, US m/d/Y, ISO; nothing for blanks
assert.equal(C.isoDay(1788825600000), '2026-09-08');
assert.equal(C.isoDay('6/3/1997'), '1997-06-03');
assert.equal(C.isoDay('2025-08-28T00:00:00.000'), '2025-08-28');
assert.equal(C.isoDay(''), null); assert.equal(C.isoDay(null), null);

// shapes: rings -> Polygon (or MultiPolygon), paths -> LineString; a label point inside a square, the middle of a line
const sq = { rings: [[[-95.5, 29.7], [-95.4, 29.7], [-95.4, 29.8], [-95.5, 29.8], [-95.5, 29.7]]] };
assert.deepEqual(C.esriToGeo(sq).type, 'Polygon');
assert.deepEqual(C.labelPoint(C.esriToGeo(sq)), [-95.45, 29.75]);
assert.equal(C.esriToGeo({ rings: [sq.rings[0], sq.rings[0]] }).type, 'MultiPolygon');
const line = C.esriToGeo({ paths: [[[-95, 29], [-95.1, 29.1], [-95.2, 29.2]]] });
assert.equal(line.type, 'LineString'); assert.deepEqual(C.labelPoint(line), [-95.1, 29.1]);
assert.equal(C.esriToGeo(null), null);

// HCAD permits.txt: only building activity, inside the window, with a readable address and the agency named
const permits = ['acct\tid\tagency_id\tstatus\tdscr\tdor_cd\tpermit_type\tpermit_tp_descr\tproperty_tp\tissue_date\tyr\tsite_num\tsite_pfx\tsite_str\tsite_tp\tsite_sfx\tsite_apt',
  '0010180000001\t2047052\t061 \tC\tPPR COMMERCIAL PARTIAL DEMO\tX1\t3\tAddtns, Remodels, Lease Space\t \t09/11/2025\t2026\t750\t \tCONGRESS\tST\t \t ',
  '0010020000013\t1\t000 \tC\tFIRELOSS#2505140553\tX1\t84\tExempt Property\t \t05/14/2025\t2026\t98\t \tMAIN\t \tST\t ',
  '1234567890123\t9\t040 \tC\tNEW SFR\tA1\t1\tNew Dwelling - permit\t \t03/02/2026\t2026\t21\t \tOAK GLEN\tDR\t \t ',
  '1234567890124\t2\t074 \tM\tNEW RETAIL\tF1\t5\tNew Building\t \t01/05/2023\t2023\t9\t \tTEXAS\tAVE\t \t ',
  '1234567890125\t3\t071 \tC\tNEW RETAIL\tF1\t5\tNew Building\t \t02/05/2026\t2026\t0\t \tFM 1960\t \t \t5'].join('\r\n');
const P = C.parseHcadPermits(permits, { since: '2024-10-14' });
assert.equal(P.length, 3, 'fire reports and permits before the window are left out');
assert.deepEqual(P.map(p => p.cat), ['remodel', 'new-home', 'new-commercial']);
assert.equal(P[0].addr, '750 Congress St'); assert.equal(P[0].attrs.agency, 'City of Houston'); assert.equal(P[0].day, '2025-09-11');
assert.equal(P[1].attrs.agency, 'Harris County'); assert.equal(P[1].county, 'Harris');
assert.match(P[2].attrs.agency, /HCAD code 071/, 'unverified agency codes are not given a city name');
assert.equal(P[2].addr, 'FM 1960 #5', 'house number 0 is left off, the unit kept');
assert.equal(P[0].id, 'permit:hcad:0010180000001:2047052:2025-09-11');
assert.throws(() => C.parseHcadPermits('acct\tfoo\n1\t2'), /header changed/);

// City of Houston plat applications
const plat = C.cohPlatRow({ attributes: { AppId: 93620, AppNo: '2026-1484', AppCode: 'C3N', AppStatus: 'Being Reviewed', SubdivisionName: 'Ronson Landing', SubdivisionSectionNo: '0', PCDate: 1792022400000, LotCount: 1, ReserveCount: 0, AppSubmitDate: 1788825600000 }, geometry: sq });
assert.equal(plat.name, 'Ronson Landing'); assert.equal(plat.cat, 'replat'); assert.equal(plat.attrs.type, 'Replat with notice');
assert.equal(plat.day, '2026-09-08'); assert.equal(plat.units, 1); assert.equal(plat.shape_json.type, 'Polygon'); assert.deepEqual([plat.lon, plat.lat], [-95.45, 29.75]);
assert.equal(C.cohPlatRow({ attributes: { AppId: 1, AppCode: 'GP', SubdivisionName: 'Generation Park West', SubdivisionSectionNo: '3' } }).name, 'Generation Park West Sec 3');
assert.equal(C.cohPlatRow({ attributes: { AppId: 1, AppCode: 'GP', SubdivisionName: 'X' } }).cat, 'planned');
assert.equal(C.cohPlatRow({ attributes: { AppId: 2 } }), null);

// Fort Bend recorded subdivisions: section 0 isn't a section; odd TYPE values aren't shown
const fb = C.fbcSubdivisionRow({ attributes: { OBJECTID: 1840, SUBDIV_NM: 'GREATWOOD LAKE', SECTION: '0', LOTS: 14, TYPE: 'How', REC_DATE: 865296000000, ACRES: 4.19 }, geometry: sq });
assert.equal(fb.name, 'Greatwood Lake'); assert.equal(fb.day, '1997-06-03'); assert.equal(fb.attrs.type, null); assert.equal(fb.units, 14);
assert.equal(C.fbcSubdivisionRow({ attributes: { OBJECTID: 1, SUBDIV_NM: 'NEW TERRITORY', SECTION: 'SF20', TYPE: 'RESIDENTIAL' } }).name, 'New Territory Sec SF20');

// subdivision maps without dates
const ud = C.undatedSubdivisionRow({ attributes: { OBJECTID: 7, CODE: 'S582882', DESC_: 'MARSHALL SUBDIVIDION SEC 2' }, geometry: sq }, { source: 'waller-subdivisions', county: 'Waller', nameField: 'DESC_', by: 'Waller County Appraisal District' });
assert.equal(ud.id, 'plat:waller-subdivisions:7'); assert.equal(ud.day, null); assert.equal(ud.name, 'Marshall Subdividion Sec 2');
assert.equal(C.undatedSubdivisionRow({ attributes: { OBJECTID: 8, DESC_: null } }, { source: 'grimes-subdivisions', county: 'Grimes', nameField: 'DESC_' }), null, 'nameless outlines (Grimes) are skipped');

// TxDOT: phases, cancelled projects dropped, old finished ones dropped
const tx = a => C.txdotRow({ attributes: { CONTROL_SECT_JOB: '140001033', HIGHWAY_NUMBER: 'FM 1774', TYPE_OF_WORK: 'PROFILE MARKINGS', COUNTY_NAME: 'Grimes', EST_CONSTRUCTION_COST: 374043.95, LIMITS_FROM: 'SH 90', LIMITS_TO: 'SH 105', ...a }, geometry: { paths: [[[-95.9, 30.4], [-95.91, 30.43]]] } }, { today: '2026-10-14' });
assert.equal(tx({ PT_PHASE: 'Construction Underway or Begins Soon', PROJ_STG: 'Construction' }).cat, 'underway');
assert.equal(tx({ PT_PHASE: 'Construction begins within 4 years', PROJ_STG: 'PS&E' }).cat, 'within-4');
assert.equal(tx({ PT_PHASE: 'Project is not a part of Project Tra', PROJ_STG: 'Construction' }).attrs.phase, null, 'TxDOT’s placeholder isn’t shown as a phase');
assert.equal(tx({ PROJ_STG: 'Cancelled' }), null);
assert.equal(tx({ PROJ_STG: 'Closed', CNST_EST_CMPLT_DT: Date.parse('2022-01-01') }), null, 'finished over two years ago');
assert.equal(tx({ PROJ_STG: 'Closed', CNST_EST_CMPLT_DT: Date.parse('2026-01-01') }).cat, 'finished');
const t1 = tx({ PT_PHASE: 'Construction Underway or Begins Soon', ACTUAL_LET_DATE: Date.parse('2025-09-25') });
assert.equal(t1.name, 'FM 1774 · Profile Markings'); assert.equal(t1.addr, 'SH 90 to SH 105'); assert.equal(t1.day, '2025-09-25'); assert.equal(t1.shape_json.type, 'LineString');

// water districts: names compared without zeros and long forms; one row per district, without the contacts
assert.equal(C.districtKey('HARRIS COUNTY MUD 004'), C.districtKey('Harris County Municipal Utility District No. 4'));
assert.equal(C.districtKey('Harris-Waller Counties MUD 04'), C.districtKey('HARRIS-WALLER COUNTY MUD 4'));
assert.notEqual(C.districtKey('Harris County MUD 41'), C.districtKey('Harris County MUD 4'));
const list = C.tceqDistricts([
  { county: 'WALLER', district_number: '8344284', distict_name: 'WALLER COUNTY MUD 34D', district_type: 'Municipal Utility District', activity_status: 'Active', first_name: 'JIM', last_name: 'BAILEY', phone: '(713) 555-0100' },
  { county: 'WALLER', district_number: '8344284', distict_name: 'WALLER COUNTY MUD 34D', district_type: 'Municipal Utility District', activity_status: 'Active', first_name: 'ANN' },
  { county: 'TRAVIS', district_number: '1', distict_name: 'X' }]);
assert.equal(list.length, 1); assert.equal(list[0].county, 'Waller'); assert.ok(!JSON.stringify(list).includes('BAILEY'), 'no people');
const page = '<td>District Type: MUNICIPAL MANAGEMENT DISTRICT</td><td>Creation Type: TCEQ</td> Primary County: HARRIS Financial Status: FINANCIAL REPORT FILED Acre Size: 265.878 Directors: 5 TAX BOND AUTHORITY 09/11/2023 Activity Creation Date: 09/06/2023 Activity Date: 12/31/2024';
assert.deepEqual(C.parseIwud(page), { created: '2023-09-06', creationType: 'TCEQ', acres: 265.878, financial: 'FINANCIAL REPORT FILED', bonds: true });
const lp = C.parseIwudList('<a href="index.cfm?fuseaction=DetailDistrict&ID=10882&command=list&name=BROOKSHIRE+KATY+DRAINAGE+DISTRICT">x</a> <a href="index.cfm?fuseaction=listdistricts&Command=NEXT&StartName=ZZ+MUD&ID=1">Next</a>');
assert.deepEqual(lp.ids, [{ iwud: '10882', name: 'BROOKSHIRE KATY DRAINAGE DISTRICT' }]); assert.equal(lp.next, 'ZZ MUD');
const bonds = C.bondRows([
  { governmenttype: 'WD', governmentname: 'Katy West MUD', issuancename: 'Unl Tax Bonds Ser 2025', closingdate: '2025-08-28T00:00:00.000', fiscalyear: '2025', totalprincipaloutstanding: '15750000', taxratetotal: '0.8' },
  { governmenttype: 'WD', governmentname: 'Katy West MUD', issuancename: 'Unl Tax Bonds Ser 2019', closingdate: '2019-03-01T00:00:00.000', fiscalyear: '2025', totalprincipaloutstanding: '5000000', taxratetotal: '0.8' },
  { governmenttype: 'WD', governmentname: 'Katy West MUD', issuancename: 'Old report', fiscalyear: '2024', totalprincipaloutstanding: '1' },
  { governmenttype: 'CITY', governmentname: 'Katy', fiscalyear: '2025' }]);
const kw = bonds.get(C.districtKey('KATY WEST MUD'));
assert.equal(kw.length, 2, 'the newest fiscal year only'); assert.equal(kw[0].issue, 'Unl Tax Bonds Ser 2025'); assert.equal(bonds.size, 1);
const dr = C.districtRow({ id: '8344284', name: 'KATY WEST MUD', type: 'Municipal Utility District', status: 'Active', county: 'Waller' }, { shape: sq, iwud: { created: '2023-09-06', iwud: '101946', acres: 265.9 }, bonds: kw, today: '2026-10-14' });
assert.equal(dr.cat, 'MUD'); assert.equal(dr.name, 'Katy West MUD'); assert.equal(dr.day, '2023-09-06'); assert.equal(dr.amount, 20750000); assert.equal(dr.attrs.taxRate, 0.8); assert.equal(dr.shape_json.type, 'Polygon');

// TEA: newest dated service; county from the campus number; enrollment joined from the yearly layer
assert.equal(C.newestTeaService(['districts_schools_20260924_C', 'districts_schools_20261005_D', 'districts_schools_20261005_C', 'districts_schools_2026_0814C_view', 'Current_Schools']), 'districts_schools_20261005_C');
const enr = C.teaEnrollment([{ attributes: { School_Number: "'008902001", School_Enrollment_as_of_Oct_2025: 1180, District_Enrollment_as_of_Oct_2025: 3200 } }]);
const sc = C.teaSchoolRow({ attributes: { id: '008902001', district_name: 'Sealy ISD', campus_type: 'High School', low_grade: 'Grade 9', high_grade: 'Grade 12', name: 'Sealy HS', address: '2372 Championship Dr. Sealy. TX 77474', rating: 'B' }, geometry: { x: -96.1743469, y: 29.76199096 } }, { enrollment: enr });
assert.equal(sc.county, 'Austin'); assert.equal(sc.cat, 'high'); assert.equal(sc.units, 1180); assert.equal(sc.attrs.enrolledAsOf, 'Oct 2025'); assert.equal(sc.attrs.grades, '9–12'); assert.equal(sc.addr, '2372 Championship Dr, Sealy, TX 77474');
assert.equal(C.teaSchoolRow({ attributes: { id: '227901001', name: 'Austin HS', campus_type: 'High School' }, geometry: { x: -97.7, y: 30.3 } }), null, 'Travis County (227) is outside the region');
assert.equal(C.teaSchoolRow({ attributes: { id: '237902041', name: 'Waller JH', campus_type: 'Middle / Jr. High' }, geometry: { x: -95.9, y: 30.05 } }).cat, 'middle');

// the change hash ignores load bookkeeping
const h = s => s; assert.equal(C.rowHash({ id: 'a', name: 'x', load_id: '1', h: 'z', first_seen: 'd' }, h), C.rowHash({ id: 'a', name: 'x', load_id: '2' }, h));
console.log('countydata ok');
