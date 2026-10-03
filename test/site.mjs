// Offline tests for the site panel (api/site.js), Houston crime (lib/crime.mjs) and the economics build (build/econ.mjs).
import assert from 'node:assert/strict';
process.env.SUPABASE_URL = 'https://db.test'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_x';
const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)); calls.push(u.host + u.pathname);
  const j = d => Response.json(d);
  if (u.host === 'hazards.fema.gov') return j({ features: [{ attributes: { FLD_ZONE: 'AE', ZONE_SUBTY: '', SFHA_TF: 'T', STATIC_BFE: 51.2 } }] });
  if (u.pathname.includes('TxDOT_AADT')) return j({ features: [{ attributes: { RTE_PRFX: 'IH', RTE_NBR: '0010', AADT_CUR: 250000, SYSTEM: 'On' } }, { attributes: { RTE_PRFX: 'IH', RTE_NBR: '0010', AADT_CUR: 180000, SYSTEM: 'On' } }, { attributes: { RTE_PRFX: 'CS', RTE_NBR: '255262', AADT_CUR: 11969, SYSTEM: 'Off' } }, { attributes: { RTE_PRFX: 'FM', RTE_NBR: '1093', AADT_CUR: 0 } }] });
  if (u.pathname.includes('TCEQ_Water_Districts')) return j({ features: [{ attributes: { NAME: 'Harris County MUD 61', TYPE: 'MUD', TYPE_DESCRIPTION: 'Municipal Utility District', STATUS: 'A', Area_SqMi: 2.1 } }, { attributes: { NAME: 'San Jacinto River Authority', TYPE: 'RA', STATUS: 'A', Area_SqMi: 2453 } }, { attributes: { NAME: 'West Harris County RWA', TYPE: 'OTH', TYPE_DESCRIPTION: 'Other', STATUS: 'A', Area_SqMi: 225 } }] });
  if (u.pathname.includes('Opportunity_Zones')) return j({ features: [{ attributes: { CENSUSTRAC: '48201211300' } }] });
  if (u.pathname.endsWith('COH_Tax_Incentive_Reinvestment_Zones_view/FeatureServer')) return j({ layers: [{ id: 3, name: 'TIRZ' }] });
  if (u.pathname.endsWith('COH_Tax_Incentive_Reinvestment_Zones_view/FeatureServer/3/query')) return j({ features: [{ attributes: { NAME: 'Downtown', TIRZ_NO: 3 } }] });
  if (u.pathname.endsWith('COH_METRO_Bus_Stops_view/FeatureServer')) return j({ layers: [{ id: 0 }] });
  if (u.pathname.endsWith('COH_METRO_Bus_Stops_view/FeatureServer/0/query')) { assert.equal(u.searchParams.get('returnCountOnly'), 'true'); return j({ count: 14 }); }
  if (u.host === 'tigerweb.geo.census.gov') return j({ features: u.pathname.includes('/School/MapServer/0/') ? [{ attributes: { NAME: 'Houston Independent School District' } }] : [] });
  if (u.pathname.endsWith('get_facilities')) return j({ Results: { QueryID: '985', QueryRows: '3' } });
  if (u.pathname.endsWith('get_qid')) return j({ Results: { Facilities: [{ FacName: 'CLEAN CO', FacSNCFlg: 'N', FacQtrsWithNC: '0', TRIFlag: 'N' }, { FacName: 'SPILL CO', FacStreet: '1 MAIN', FacSNCFlg: 'Y', TRIFlag: 'Y' }, { FacName: 'DRY CLEAN', RCRAComplianceStatus: 'No Violation Identified' }, { FacName: 'OFFICE', RCRAComplianceStatus: 'Not Applicable' }] } });
  if (u.host === 'data.texas.gov' && u.pathname.endsWith('naix-2893.json')) {
    assert.match(u.searchParams.get('$where'), /like '1001 %MAIN%' AND location_zip like '77002%'/);
    return j([{ tabc_permit_number: 'MB1', location_name: 'THE BAR', obligation_end_date_yyyymmdd: '2026-08-31T00:00:00.000', total_receipts: '100000' }, { tabc_permit_number: 'MB1', location_name: 'THE BAR', obligation_end_date_yyyymmdd: '2026-07-31T00:00:00.000', total_receipts: '90000.5' }, { tabc_permit_number: 'MB2', location_name: 'OLD PLACE', obligation_end_date_yyyymmdd: '2024-01-31T00:00:00.000', total_receipts: '5' }]);
  }
  if (u.host === 'db.test' && u.pathname === '/rest/v1/rpc/crime_near') { const a = JSON.parse(opts.body); assert.equal(a.p_m, 805);
    return j([{ period: 'last12', cat: 'v', n: 12, latest: '2026-08-31' }, { period: 'last12', cat: 'p', n: 80, latest: '2026-08-31' }, { period: 'last12', cat: 'o', n: 8, latest: '2026-08-31' }, { period: 'prior12', cat: 'v', n: 10 }, { period: 'prior12', cat: 'p', n: 100 }]); }
  return new Response('unmocked ' + u, { status: 599 });
};

const { site, floodInfo, trafficInfo, roadName, waterDistricts, echoInfo, barsInfo, default: handler } = await import('../api/site.js');
const d = await site(-95.3698, 29.7604, { addr: '1001 Main St', zip: '77002' });
assert.equal(d.flood.zone, 'AE'); assert.equal(d.flood.risk, 'high'); assert.equal(d.flood.bfe, 51.2);
assert.deepEqual(d.traffic.roads.map(r => r.road + ' ' + r.aadt), ['I-10 250000', 'City street 11969'], 'busiest per road, zero counts dropped');
assert.deepEqual(d.districts.water.map(w => w.name), ['Harris County MUD 61', 'West Harris County RWA'], 'river authorities dropped');
assert.equal(d.districts.opportunityZone, true); assert.deepEqual(d.districts.tirz, ['Downtown (TIRZ 3)']); assert.deepEqual(d.districts.schools, ['Houston Independent School District']);
assert.equal(d.transit.stops, 14);
assert.equal(d.environment.total, 3); assert.deepEqual(d.environment.flagged[1].flags, ['handles hazardous waste']); assert.equal(d.environment.flaggedCount, 2); assert.deepEqual(d.environment.flagged[0].flags, ['violations', 'toxic releases']);
assert.equal(d.crime.last12.total, 100); assert.equal(d.crime.prior12.total, 110); assert.equal(d.crime.change.v, 20); assert.equal(d.crime.change.p, -20); assert.equal(d.crime.latest, '2026-08-31');
assert.equal(d.bars.length, 1, 'only the last 12 months'); assert.equal(d.bars[0].total, 190001); assert.equal(d.bars[0].months, 2); assert.equal(d.bars[0].last, '2026-08');
// outside Houston: no TIRZ / METRO / crime calls
const before = calls.length; const k = await site(-97.74, 30.27); const extra = calls.slice(before);
assert.ok(!extra.some(c => /COH_|db\.test/.test(c)), 'Houston-only sources skipped elsewhere'); assert.deepEqual(k.districts.tirz, []); assert.equal(k.crime, null); assert.equal(k.bars, null);
// one failing source doesn't sink the rest
const real = globalThis.fetch; globalThis.fetch = async (url, o) => String(url).includes('hazards.fema.gov') ? new Response('down', { status: 503 }) : real(url, o);
const e = await site(-95.36, 29.76); assert.match(e.flood.error, /503/); assert.equal(e.traffic.roads[0].road, 'I-10'); globalThis.fetch = real;
// unit pieces
assert.equal(floodInfo([{ FLD_ZONE: 'X', ZONE_SUBTY: '0.2 PCT ANNUAL CHANCE FLOOD HAZARD', SFHA_TF: 'F' }]).risk, 'moderate');
assert.equal(floodInfo([{ FLD_ZONE: 'X', ZONE_SUBTY: 'AREA OF MINIMAL FLOOD HAZARD', SFHA_TF: 'F', STATIC_BFE: -9999 }]).bfe, null);
assert.equal(floodInfo([]).zone, null);
assert.equal(roadName({ RTE_PRFX: 'SL', RTE_NBR: '0610' }), 'Loop 610'); assert.equal(roadName({ RTE_PRFX: 'FM', RTE_NBR: '1093' }), 'FM 1093');
assert.equal(trafficInfo([]).roads.length, 0); assert.equal(waterDistricts([{ NAME: 'X', TYPE: 'MUD', STATUS: 'I' }]).length, 0, 'inactive dropped');
assert.equal(echoInfo([]).count, 0); assert.deepEqual(barsInfo([], new Date('2026-10-01')), []);
// handler: bad coordinates, cache header
const res = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
let r = res(); await handler({ headers: {}, query: { lat: '40', lon: '-74' } }, r); assert.equal(r.code, 400);
r = res(); await handler({ headers: {}, query: { lat: '29.76041234', lon: '-95.36981234' } }, r); assert.equal(r.code, 200); assert.equal(r.body.lat, 29.76041); assert.match(r.headers['Cache-Control'], /s-maxage=604800/);

// ---------- Houston crime CSV ----------
const { parseHpd, category, crimeSummary } = await import('../lib/crime.mjs');
const csv = 'Incident,Occurrence Date,Occurrence Hour,NIBRS Class,NIBRS Description,Offense Count,Beat,Premise,Street Number,Street Name,Street Type,Street Suffix,City,ZIP Code,Map Longitude,Map Latitude\r\n' +
  '027174226,2026-01-01,00,26A,"False pretenses, swindle",1,Beat 17E10,"Residence, Home (Includes Apartment)",6440,HILLCROFT,AVE,,HOUSTON,77081,-95.494197,29.712354\r\n' +
  '027174226,2026-01-01,00,26A,"False pretenses, swindle",2,Beat 17E10,"Residence",6440,HILLCROFT,AVE,,HOUSTON,77081,-95.494197,29.712354\r\n' +
  '084915426,2026-01-02,00,13A,Aggravated assault,1,Beat 16E10,Parking lot,13501,HOOPER,RD,,HOUSTON,77047,-95.405133,29.611885\r\n' +
  '099,2026-01-03,00,240,Motor vehicle theft,1,Beat 1,Street,1,MAIN,ST,,HOUSTON,77002,0,0\r\n' +
  '100,2023-01-03,00,23F,Theft from motor vehicle,1,Beat 1,Street,1,MAIN,ST,,HOUSTON,77002,-95.36,29.76\r\n';
const rows = parseHpd(csv, { since: '2025-01-01' });
assert.equal(rows.length, 2, 'ungeocoded and old rows dropped, repeat offense rows merged'); assert.equal(rows[0].n, 3); assert.equal(rows[0].cat, 'o'); assert.equal(rows[1].cat, 'v'); assert.equal(rows[0].premise, 'Residence, Home (Includes Apartment)');
assert.equal(category('23F'), 'p'); assert.equal(category('120'), 'v'); assert.equal(category('35A'), 'o');
assert.equal(crimeSummary([], 0.5).last12.total, 0); assert.equal(crimeSummary([], 0.5).change.total, null);
assert.throws(() => parseHpd('a,b\n1,2'), /unexpected HPD header/);
// the older yearly files: run-together header names, M/D/YYYY dates
const old = parseHpd('Incident,RMSOccurrenceDate,RMSOccurrenceHour,NIBRSClass,NIBRSDescription,OffenseCount,Beat,Premise,StreetNo,StreetName,StreetType,Suffix,City,ZIPCode,MapLongitude,MapLatitude\n' +
  '1,11/15/2025,10,120,Robbery,1,1A10,Street,1,MAIN,ST,,HOUSTON,77002,-95.37,29.76\n', { since: '2025-01-01' });
assert.deepEqual(old.map(r => [r.day, r.cat]), [['2025-11-15', 'v']]);

// ---------- economics ----------
const econ = await import('../build/econ.mjs');
assert.deepEqual(econ.parseFredCsv('observation_date,DGS10\n2026-09-29,.\n2026-09-30,5.29\n2026-10-01,5.24\n'), [['2026-09-30', 5.29], ['2026-10-01', 5.24]]);
const pts = []; for (let i = 0; i < 400; i++) pts.push([new Date(Date.UTC(2025, 8, 1) + i * 864e5).toISOString().slice(0, 10), 4 + i / 1000]);
const sm = econ.summarizeSeries(pts, Date.UTC(2026, 9, 5)); assert.equal(sm.date, pts[399][0]); assert.ok(Math.abs(sm.yearAgo - (4 + 34 / 1000)) < 1e-9, 'value a year before the latest'); assert.ok(sm.weekly.length >= 52 && sm.weekly.length <= 60);
assert.equal(econ.TX_COUNTY_FIPS.length, 254); assert.equal(econ.TX_COUNTY_FIPS.at(-1), '48507'); assert.ok(econ.TX_COUNTY_FIPS.includes('48201'));
assert.deepEqual(econ.lausSummary({ data: [{ year: '2026', period: 'M08', value: '5.0', footnotes: [{ code: 'P' }] }, { year: '2026', period: 'M13', value: '4' }, { year: '2025', period: 'M08', value: '4.6', footnotes: [{}] }] }),
  { period: '2026-08', rate: 5, yearAgo: 4.6, preliminary: true });
assert.equal(econ.lausSummary({ data: [] }), null);
const zori = 'RegionID,SizeRank,RegionName,RegionType,StateName,State,City,Metro,CountyName,2025-08-31,2025-09-30,2025-10-31,2025-11-30,2025-12-31,2026-01-31,2026-02-28,2026-03-31,2026-04-30,2026-05-31,2026-06-30,2026-07-31,2026-08-31\n' +
  '1,1,77002,zip,TX,TX,Houston,"Houston-Pasadena-The Woodlands, TX",Harris County,1500,1,1,1,1,1,1,1,1,1,1,1,1590\n' +
  '2,2,10001,zip,NY,NY,New York,"New York, NY",New York County,4000,1,1,1,1,1,1,1,1,1,1,1,4100\n' +
  '3,3,7701,zip,TX,TX,Somewhere,,X County,,,,,,,,,,,,1200,\n';
const z = econ.parseZori(zori); assert.deepEqual(Object.keys(z.zips), ['77002', '07701']); assert.equal(z.zips['77002'].rent, 1590); assert.equal(z.zips['77002'].yoy, 6); assert.equal(z.zips['77002'].metro, 'Houston-Pasadena-The Woodlands, TX');
assert.equal(z.zips['07701'].month, '2026-07'); assert.equal(z.zips['07701'].yoy, null); assert.equal(z.latest, '2026-08');
assert.deepEqual(econ.parseLausAreas('A\tCN4820100000000\tHarris County, TX\t0\tT\nA\tCN4815700000000\tFort Bend County, TX\t0\nB\tMT4810180000000\tAbilene, TX Metropolitan Statistical Area\t0'), { 48201: 'Harris', 48157: 'Fort Bend' });
console.log('site tests passed');
