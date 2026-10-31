// County development data for the seven counties: where each source lives and how its rows become one shape
// (a dev_items row, supabase/migrations/20261021000000_county_data.sql). Pure functions, so the loader
// (build/county-data.mjs) and its tests share them. Every source was checked from GitHub Actions with the
// build/probe-cad, probe-permits, probe-plats, probe-districts, probe-txdot, probe-tea and probe-county2/3 scripts
// (2026-10-14). Not published openly, so not here: building permits outside Harris County (Fort Bend, Montgomery,
// Waller, Austin, Washington, Grimes and their cities), dates on the Montgomery, Waller, Austin, Washington and
// Grimes subdivision maps (their rows count as new from the night they first appear), and school enrollment forecasts.

export const COUNTIES = ['Waller', 'Harris', 'Fort Bend', 'Montgomery', 'Austin', 'Washington', 'Grimes'];

export const SRC = {
  // Harris Central Appraisal District weekly bulk files (permits.txt is inside Real_acct_owner.zip) and its parcel layer
  hcadZip: y => 'https://download.hcad.org/data/CAMA/' + y + '/Real_acct_owner.zip',
  hcadParcels: 'https://arcweb.hcad.org/server/rest/services/public/public_query/MapServer/0',
  // City of Houston plat tracker (the city and its ETJ, which reaches into Harris, Fort Bend, Montgomery and Waller)
  cohPlats: 'https://mycity2.houstontx.gov/geoplat01/rest/services/PlatTracker/PT365_PLAT_MAPPING/MapServer/1',
  // recorded subdivisions
  fbcSubdivisions: 'https://services.arcgis.com/HfQs2ClqmipKpmFK/arcgis/rest/services/Subdivisions/FeatureServer/0',
  mcadSubdivisions: 'https://services1.arcgis.com/PRoAPGnMSUqvTrzq/arcgis/rest/services/SubdivisionBoundary/FeatureServer/0',
  // the appraisal districts hosted by BIS: parcels (0) and subdivisions (2)
  bis: {
    Waller: 'https://services3.arcgis.com/KKhSlBnH1Rm0YK62/arcgis/rest/services/WallerCADWebService/FeatureServer',
    Austin: 'https://services7.arcgis.com/rNakmFefTO1XjYg4/arcgis/rest/services/AustinCADWebService/FeatureServer',
    Washington: 'https://services3.arcgis.com/42lb4t0mpCcD1zg8/arcgis/rest/services/WashingtonCADMatixService/FeatureServer',
    Grimes: 'https://services8.arcgis.com/fpr21jaV02YtR7tv/arcgis/rest/services/GrimesCADWebService/FeatureServer'
  },
  txdot: 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Projects_Info_All/FeatureServer/0',
  // TCEQ water districts: the list (data.texas.gov), the outlines (ArcGIS) and the district pages (creation date)
  tceqList: 'https://data.texas.gov/resource/hr84-s96f.json',
  tceqShapes: 'https://services2.arcgis.com/LYMgRMwHfrWWEg3s/arcgis/rest/services/TCEQ_Water_Districts/FeatureServer/0',
  iwud: id => 'https://www14.tceq.texas.gov/iwud/dist/index.cfm?fuseaction=DetailDistrict&ID=' + id + '&command=list',
  iwudList: (county, start) => 'https://www14.tceq.texas.gov/iwud/dist/index.cfm?fuseaction=ListDistricts&COMMAND=' + (start ? 'NEXT&StartName=' + encodeURIComponent(start) : 'LIST') + '&compress=N&CountyCode=' + county,
  // Bond Review Board: local government debt outstanding, by issuance (water districts are governmenttype WD)
  brb: 'https://data.texas.gov/resource/3qmf-seku.json',
  // TEA publishes a dated pair of school (…_C) and district (…_D) layers every few weeks; the loader takes the newest
  teaOrg: 'https://services2.arcgis.com/5MVN2jsqIrNZD4tP/arcgis/rest/services'
};
// Texas county numbers (alphabetical, 1-254) used by TCEQ's district pages
export const TX_COUNTY_NO = { Austin: 8, 'Fort Bend': 79, Grimes: 93, Harris: 101, Montgomery: 170, Waller: 237, Washington: 239 };

const s = v => v == null ? '' : String(v).trim();
const up = v => s(v).toUpperCase();
const n = v => { const x = Number(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(x) ? x : null; };
const pos = v => { const x = n(v); return x != null && x > 0 ? x : null; };
export const isoDay = v => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v > 1e11 || v < -1e11 ? new Date(v).toISOString().slice(0, 10) : null;
  const t = s(v), m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  const d = t.match(/^(\d{4})-(\d\d)-(\d\d)/); return d ? d[0] : null;
};
export const titleCase = v => s(v).toLowerCase().replace(/\s+/g, ' ').replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\b(Mud|Wcid|Fwsd|Mmd|Lid|Isd|Llc|Lp|Ii|Iii|Iv|Tx|Us|Fm|Sh|Ih|Cr)\b/g, w => w.toUpperCase());

// ---------- shapes ----------
// ArcGIS rings / paths (already in 4326) -> GeoJSON, coordinates rounded to ~1 m; a point to represent the shape
const r6 = v => Math.round(v * 1e5) / 1e5;
export function esriToGeo(g) {
  if (!g) return null;
  if (g.rings?.length) { const rings = g.rings.map(r => r.map(p => [r6(p[0]), r6(p[1])])).filter(r => r.length >= 4); return rings.length ? (rings.length === 1 ? { type: 'Polygon', coordinates: rings } : { type: 'MultiPolygon', coordinates: rings.map(r => [r]) }) : null; }
  if (g.paths?.length) { const paths = g.paths.map(p => p.map(q => [r6(q[0]), r6(q[1])])).filter(p => p.length >= 2); return paths.length ? (paths.length === 1 ? { type: 'LineString', coordinates: paths[0] } : { type: 'MultiLineString', coordinates: paths }) : null; }
  if (Number.isFinite(g.x) && Number.isFinite(g.y)) return { type: 'Point', coordinates: [r6(g.x), r6(g.y)] };
  return null;
}
// a label point: the middle vertex of a line, else the area-weighted centroid of the largest ring
export function labelPoint(geo) {
  if (!geo) return null;
  if (geo.type === 'Point') return geo.coordinates;
  if (geo.type === 'LineString' || geo.type === 'MultiLineString') { const p = geo.type === 'LineString' ? geo.coordinates : geo.coordinates.reduce((a, b) => b.length > a.length ? b : a); return p[Math.floor(p.length / 2)]; }
  const rings = geo.type === 'Polygon' ? [geo.coordinates[0]] : geo.coordinates.map(p => p[0]);
  let best = null, bestA = -1;
  for (const r of rings) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f; }
    if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = a ? [r6(cx / (3 * a)), r6(cy / (3 * a))] : r[0]; }
  }
  return best;
}
// ArcGIS layers on mycity2/arcweb are in Texas state plane; asking for outSR=4326 makes the server project them

// ---------- Harris County permits (HCAD permits.txt) ----------
// Only the permits that say something about building activity; HCAD also lists fire reports, disaster reviews and
// exempt-property notes in the same file.
export const PERMIT_TYPES = {
  'New Building': 'new-commercial', 'New Dwelling - permit': 'new-home', 'New Condominium Unit': 'new-home',
  'Addtns, Remodels, Lease Space': 'remodel', 'Additions or Remodeling': 'remodel', 'Condo addt, rmdl, combine': 'remodel', 'Rep, Addtn, Rmdl, Fire Dam': 'remodel',
  'Paving, Parking Lot, Slab': 'site-work', 'Commercial Demolition': 'demolition', 'Residential Demolition': 'demolition', 'Demolition': 'demolition',
  'Relocation / Bldg Move': 'other'
};
export const PERMIT_CATS = { 'new-commercial': 'New commercial building', 'new-home': 'New home', remodel: 'Addition, remodel or lease space', 'site-work': 'Paving or site work', demolition: 'Demolition',
  electrical: 'Electrical', plumbing: 'Plumbing', mechanical: 'Mechanical / HVAC', roofing: 'Roofing', fire: 'Fire sprinkler or alarm', sign: 'Sign', pool: 'Pool or spa', fence: 'Fence', occupancy: 'Certificate of occupancy',
  septic: 'Septic (on-site sewage)', floodplain: 'Floodplain development', 'right-of-way': 'Right of way or utility', other: 'Other permit' };
// every other permit type HCAD records, by words in its description (the type itself is kept in attrs.type)
const PERMIT_WORDS = [[/septic|sewerage|ossf/i, 'septic'], [/floodplain|flood plain/i, 'floodplain'], [/right.of.way|row permit|utility (line|cut)|pipeline|fiber/i, 'right-of-way'], [/electric/i, 'electrical'], [/plumb|water heater|gas line|sewer/i, 'plumbing'], [/mechan|hvac|air cond|a\/c|heating/i, 'mechanical'], [/roof/i, 'roofing'], [/fire|sprinkler|alarm/i, 'fire'], [/sign|billboard/i, 'sign'],
  [/pool|spa/i, 'pool'], [/fence/i, 'fence'], [/occupan/i, 'occupancy'], [/demol|wreck|raze/i, 'demolition'], [/new (dwell|home|sfr|res)|residential, new|new \d family|manufactured home|(new|erect).{0,40}(single.?family|dwelling|sfr|duplex|townho|one family|1 family)/i, 'new-home'],
  [/new (bldg|building|comm|construction|structure)|commercial, new|new commercial|^nb$|\berect\b/i, 'new-commercial'],
  [/addtn|addition|remodel|rmdl|repair|alter|renovat|accessory|tenant (improvement|finish)|interior|build.?out|^a[123]$/i, 'remodel'], [/pav|parking|slab|site|grading|drive|sidewalk|culvert|detention|drainage/i, 'site-work']];
// a permit date the records can be trusted on: HCAD's file holds a few typed-in dates like 1899-12-30 and 9005-09-01
export const plausibleDay = d => d >= '1980-01-01' && d <= new Date(Date.now() + 864e5).toISOString().slice(0, 10);
// HCAD rows that aren't permits at all (fire-loss reports on exempt property) are left out
const NOT_PERMITS = new Set(['Exempt Property', 'Fire Reports']);
const permitWords = t => (PERMIT_WORDS.find(([re]) => re.test(t || '')) || [null, null])[1];
export const permitCat = type => NOT_PERMITS.has(type) ? null : PERMIT_TYPES[type] || permitWords(type) || 'other';
// HCAD's agency codes are its jurisdiction codes (real_acct.txt "jurs" lists them per account: 040 Harris County,
// 061 City of Houston). Only those two are named; other cities' codes are shown as the code, not guessed at.
export const HCAD_AGENCY = { '061': 'City of Houston', '040': 'Harris County', '000': 'Harris Central Appraisal District' };
export function parseHcadPermits(text, { since } = {}) {
  const lines = text.split(/\r?\n/), h = lines[0].split('\t').map(x => x.trim()), ix = k => h.indexOf(k), out = [];
  const I = { acct: ix('acct'), id: ix('id'), agency: ix('agency_id'), status: ix('status'), dscr: ix('dscr'), type: ix('permit_tp_descr'), issued: ix('issue_date'), yr: ix('yr'),
    num: ix('site_num'), pfx: ix('site_pfx'), str: ix('site_str'), tp: ix('site_tp'), sfx: ix('site_sfx'), apt: ix('site_apt') };
  if (I.acct < 0 || I.type < 0 || I.issued < 0) throw new Error('permits.txt header changed: ' + h.join(','));
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split('\t'); if (c.length < 8) continue;
    const type = s(c[I.type]), cat = permitCat(type); if (!cat) continue;
    const day = isoDay(c[I.issued]); if (!day || !plausibleDay(day) || (since && day < since)) continue;
    const acct = s(c[I.acct]), agency = s(c[I.agency]).padStart(3, '0');
    const addr = [s(c[I.num]) !== '0' ? s(c[I.num]) : '', s(c[I.pfx]), s(c[I.str]).replace(/\s*,\s*HOUSTON\s*$/i, ''), s(c[I.tp]), s(c[I.sfx])].filter(Boolean).join(' ').replace(/\s+/g, ' ') + (s(c[I.apt]) ? ' #' + s(c[I.apt]) : '');
    out.push({ id: 'permit:hcad:' + acct + ':' + s(c[I.id]) + ':' + day, kind: 'permit', source: 'hcad-permits', county: 'Harris', acct,
      name: titleCase(addr) || 'Permit', cat, status: s(c[I.status]) === 'C' ? 'Recorded' : s(c[I.status]) || null, day, addr: titleCase(addr) || null,
      attrs: { type, agency: HCAD_AGENCY[agency] || (agency.trim() ? 'City or district (HCAD code ' + agency + ')' : null), note: s(c[I.dscr]).slice(0, 160) || null, acct } });
  }
  return out;
}

// Harris County Office of the County Engineer, ePermits_Report "Permits view" (the public Permits Dashboard's service):
// every permit the county itself issues in the unincorporated county (and some ETJ work): building, septic, driveway,
// floodplain, right of way, signs. Points come in EPSG:2278; the loader asks for 4326. Owner contact fields are left out.
export const OCE_PERMITS = 'https://www.gis.hctx.net/arcgishcpid/rest/services/Permits/ePermits_Report/FeatureServer/0';
export const OCE_FIELDS = 'ID,PROJECTNUMBER,PROJECTNAME,FULLADDRESS,APPTYPE,PROJECTSUBMITDATE,PERMITNUMBER,PERMITNAME,STATUS,ISSUEDDATE,ISCLOSED,PERMITCLASSCODE,PRECINCTNUMBER';
const epochDay = v => v == null || !Number.isFinite(+v) || +v <= 0 ? null : new Date(+v).toISOString().slice(0, 10);
export function ocePermitRow(f) {
  const a = f.attributes || {}, g = f.geometry, id = a.ID ?? a.OBJECTID; if (id == null) return null;
  const type = s(a.PERMITNAME), app = s(a.APPTYPE).replace(/^Legacy - /, ''), cat = PERMIT_TYPES[type] || permitWords(type) || permitWords(app) || 'other';
  const day = [epochDay(a.ISSUEDDATE), epochDay(a.PROJECTSUBMITDATE)].find(d => d && plausibleDay(d)); if (!day) return null;
  const addr = titleCase(s(a.FULLADDRESS).replace(/,?\s*TX\b.*$/i, '').replace(/,?\s+\d{5}$/, '')) || null;
  const lon = Number.isFinite(g?.x) ? Math.round(g.x * 1e6) / 1e6 : null, lat = Number.isFinite(g?.y) ? Math.round(g.y * 1e6) / 1e6 : null;
  return { id: 'permit:oce:' + id, kind: 'permit', source: 'oce-permits', county: 'Harris', name: addr || s(a.PROJECTNAME) || 'Permit', cat, status: s(a.STATUS) || null, day, addr, amount: null, units: null,
    attrs: { type: type || null, app: app || null, project: s(a.PROJECTNUMBER) || null, permit: s(a.PERMITNUMBER) || null, projectName: s(a.PROJECTNAME).slice(0, 160) || null, agency: 'Harris County Engineering (unincorporated county)',
      precinct: a.PRECINCTNUMBER != null ? 'Precinct ' + a.PRECINCTNUMBER : null, closed: a.ISCLOSED === 1 || a.ISCLOSED === true, submitted: epochDay(a.PROJECTSUBMITDATE) },
    lon: lon != null && lat != null && Math.abs(lon) <= 180 && Math.abs(lat) <= 90 ? lon : null, lat: lon != null && lat != null && Math.abs(lon) <= 180 && Math.abs(lat) <= 90 ? lat : null, shape_json: null };
}

// ---------- plats and subdivisions ----------
export const PLAT_CODES = { GP: 'General plan', C1: 'Class I plat', C2: 'Class II plat', C2R: 'Replat (Class II)', C3P: 'Preliminary plat', C3F: 'Final plat', C3R: 'Replat (Class III)', C3N: 'Replat with notice', SP: 'Street dedication plat', VP: 'Vacating plat', VF: 'Vacating plat (final)' };
export function cohPlatRow(f) {
  const a = f.attributes || {}, geo = esriToGeo(f.geometry), at = labelPoint(geo);
  const name = [s(a.SubdivisionName), s(a.SubdivisionSectionNo) && s(a.SubdivisionSectionNo) !== '0' ? 'Sec ' + s(a.SubdivisionSectionNo) : '', s(a.SubdivisionNameSuffix)].filter(Boolean).join(' ');
  if (!a.AppId || !name) return null;
  return { id: 'plat:coh:' + a.AppId, kind: 'plat', source: 'coh-plats', county: null, name, cat: /^(GP|C3P)$/.test(a.AppCode) ? 'planned' : /^V/.test(a.AppCode) ? 'vacated' : /R$|N$/.test(a.AppCode) ? 'replat' : 'plat',
    status: s(a.AppStatus) || null, day: isoDay(a.AppSubmitDate), units: pos(a.LotCount), amount: null, addr: null,
    attrs: { app: s(a.AppNo), type: PLAT_CODES[a.AppCode] || s(a.AppCode), commission: isoDay(a.PCDate), reserves: pos(a.ReserveCount), reserveAcres: pos(a.ReserveSize), recorded: s(a.RecordationStatus) || null, by: 'City of Houston Planning Commission' },
    lon: at?.[0] ?? null, lat: at?.[1] ?? null, shape_json: geo };
}
export function fbcSubdivisionRow(f) {
  const a = f.attributes || {}, geo = esriToGeo(f.geometry), at = labelPoint(geo), name = [titleCase(a.SUBDIV_NM), s(a.SECTION) && !/^0+$/.test(s(a.SECTION)) ? 'Sec ' + s(a.SECTION) : ''].filter(Boolean).join(' ');
  if (!a.OBJECTID || !name) return null;
  return { id: 'plat:fbc:' + a.OBJECTID, kind: 'plat', source: 'fbc-subdivisions', county: 'Fort Bend', name, cat: 'recorded', status: 'Recorded', day: isoDay(a.REC_DATE) || isoDay(a.RECDATE), units: pos(a.LOTS), amount: null, addr: null,
    attrs: { type: /^(RESIDENTIAL|COMMERCIAL|INDUSTRIAL|RESERVES?|MIXED|MULTI.*|APARTMENT.*|INSTITUTIONAL)$/i.test(s(a.TYPE)) ? titleCase(a.TYPE) : null, blocks: pos(a.BLOCKS), reserves: pos(a.RESERVES), acres: pos(a.ACRES), by: 'Fort Bend County' }, lon: at?.[0] ?? null, lat: at?.[1] ?? null, shape_json: geo };
}
// subdivision maps with no recording date (Montgomery appraisal district, and the BIS-hosted appraisal districts)
export function undatedSubdivisionRow(f, { source, county, nameField, idField = 'OBJECTID', by }) {
  const a = f.attributes || {}, geo = esriToGeo(f.geometry), at = labelPoint(geo), name = titleCase(a[nameField]);
  if (a[idField] == null || !name) return null;
  return { id: 'plat:' + source + ':' + a[idField], kind: 'plat', source, county, name, cat: 'recorded', status: 'Recorded', day: null, units: null, amount: null, addr: null,
    attrs: { code: s(a.CODE || a.ASCODE) || null, by }, lon: at?.[0] ?? null, lat: at?.[1] ?? null, shape_json: geo };
}

// ---------- TxDOT ----------
export const TXDOT_PHASE = { 'Construction Underway or Begins Soon': 'underway', 'Construction begins within 4 years': 'within-4', 'Construction begins in 5 to 10 years': '5-10', 'Planning, 10+ years': 'planning', 'Feasibility Studies': 'planning' };
export function txdotRow(f, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const a = f.attributes || {}, csj = s(a.CONTROL_SECT_JOB); if (!csj) return null;
  const stage = s(a.PROJ_STG), phase = TXDOT_PHASE[s(a.PT_PHASE)] || (/^Construction$/i.test(stage) ? 'underway' : /Closed|Operations/i.test(stage) ? 'finished' : /Cancel/i.test(stage) ? 'cancelled' : 'other');
  const let_ = isoDay(a.ACTUAL_LET_DATE) || isoDay(a.PROJ_ESTMTD_LET_D) || isoDay(a.DIST_LET_DATE);
  const done = isoDay(a.CNST_EST_CMPLT_DT);
  // keep what's planned or under way, and what finished in the last two years
  if (phase === 'cancelled') return null;
  if (phase === 'finished' && (!done || done < String(+today.slice(0, 4) - 2) + today.slice(4))) return null;
  const geo = esriToGeo(f.geometry), at = labelPoint(geo);
  const where = [s(a.LIMITS_FROM), s(a.LIMITS_TO)].filter(Boolean).join(' to ');
  return { id: 'txdot:' + csj, kind: 'txdot', source: 'txdot', county: titleCase(a.COUNTY_NAME) || null,
    name: [s(a.HIGHWAY_NUMBER || a.HWY_NBR), s(a.TYPE_OF_WORK) ? '· ' + titleCase(a.TYPE_OF_WORK) : ''].filter(Boolean).join(' ') || 'TxDOT project ' + csj,
    cat: phase, status: stage || null, day: let_, amount: pos(a.EST_CONSTRUCTION_COST) ?? pos(a.CNSTR_EST_AMT), units: null, addr: where || null,
    attrs: { csj, phase: TXDOT_PHASE[s(a.PT_PHASE)] ? s(a.PT_PHASE) : null, work: titleCase(a.TYPE_OF_WORK) || null, class: s(a.PROJ_CLASS) || null, from: s(a.LIMITS_FROM) || null, to: s(a.LIMITS_TO) || null,
      miles: pos(a.PROJ_LENGTH), fy: n(a.ESTMTD_FISCAL_YR), letting: let_, started: isoDay(a.CNSTR_WKBG_DT), finish: done, pctDone: n(a.CNSTR_PCT_COMPLETE),
      contractor: s(a.CNSTR_CMPNY_NM) || null, district: s(a.DISTRICT_NAME) || null, utp: a.PRJ_UTP ? true : false },
    lon: at?.[0] ?? null, lat: at?.[1] ?? null, shape_json: geo };
}

// ---------- water districts ----------
// "HARRIS COUNTY MUD 004" and "Harris County MUD 04" are the same district: compare names without zeros in front of
// numbers, punctuation or the common long forms
export function districtKey(name) {
  return up(name).replace(/MUNICIPAL UTILITY DISTRICT/g, 'MUD').replace(/WATER CONTROL (AND|&) IMPROVEMENT DISTRICT/g, 'WCID').replace(/MUNICIPAL MANAGEMENT DISTRICT/g, 'MMD')
    .replace(/FRESH WATER SUPPLY DISTRICT/g, 'FWSD').replace(/LEVEE IMPROVEMENT DISTRICT/g, 'LID').replace(/\bNO\.?\s*/g, '').replace(/\bCOUNTIES\b/g, 'COUNTY')
    .replace(/[^A-Z0-9 ]+/g, ' ').replace(/\b0+(\d)/g, '$1').replace(/\s+/g, ' ').trim();
}
const TYPE_SHORT = { 'Municipal Utility District': 'MUD', 'Municipal Management District': 'MMD', 'Water Control and Improvement District': 'WCID', 'Fresh Water Supply District': 'FWSD', 'Levee Improvement District': 'LID', 'Drainage District': 'Drainage', 'Special Utility District': 'SUD' };
// regional bodies that cover whole counties or river basins (river, groundwater, navigation and regional water
// authorities, the county flood control district) aren't development districts (a WCID or FWSD that happens to be
// called "… Water Authority", like Clear Lake City's, is a local district and stays): on a property card they would stand
// in for the MUD, and on the map they would cover everything
const REGIONAL = r => /^(River Authority|Groundwater Conservation District|Navigation District|Regional District)$/i.test(s(r.district_type))
  || (/^Other$/i.test(s(r.district_type)) && /\b(AUTHORITY|FLOOD CONTROL|FCD|SUBSIDENCE)\b/i.test(s(r.distict_name || r.district_name)));
// the data.texas.gov list has one row per contact; keep one per district, without the people
export function tceqDistricts(rows, counties = COUNTIES) {
  const want = new Set(counties.map(up)), out = new Map();
  for (const r of rows) {
    const id = s(r.district_number), county = up(r.county); if (!id || !want.has(county) || out.has(id) || REGIONAL(r)) continue;
    out.set(id, { id, name: s(r.distict_name || r.district_name), type: s(r.district_type), status: s(r.activity_status), county: titleCase(county) });
  }
  return [...out.values()];
}
// the TCEQ district page: "Creation Date: 09/06/2023", the acreage and the functions it may carry out
export function parseIwud(html) {
  const t = String(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  const pick = re => (t.match(re) || [])[1] || null;
  return { created: isoDay(pick(/Creation Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)), creationType: pick(/Creation Type:\s*([A-Z][A-Z .]+?)\s+Primary County/i), acres: pos(pick(/Acre Size:\s*([\d,.]+)/i)),
    financial: pick(/Financial Status:\s*([A-Z][A-Z ]+?)\s+Acre Size/i), bonds: /TAX BOND AUTHORITY/i.test(t) };
}
// the ids on a TCEQ county list page, and the name to ask for the next page with
export function parseIwudList(html) {
  const ids = [...String(html).matchAll(/DetailDistrict&(?:amp;)?ID=(\d+)[^"]*name=([^"&]+)/g)].map(m => ({ iwud: m[1], name: decodeURIComponent(m[2].replace(/\+/g, ' ')) }));
  const next = String(html).match(/Command=NEXT&(?:amp;)?StartName=([^&"]+)/i);
  return { ids, next: next ? decodeURIComponent(next[1].replace(/\+/g, ' ')) : null };
}
export function bondRows(rows) {
  const by = new Map();
  for (const r of rows) {
    if (s(r.governmenttype) !== 'WD') continue;
    const k = districtKey(r.governmentname), list = by.get(k) || []; by.set(k, list);
    list.push({ issue: s(r.issuancename), purpose: s(r.issuepurpose) || null, closed: isoDay(r.closingdate), principal: n(r.totalprincipaloutstanding), fy: n(r.fiscalyear),
      taxRate: n(r.taxratetotal), taxableValue: n(r.taxablevalue), population: n(r.population), pledge: s(r.pledgetype) || null });
  }
  // newest fiscal year's report per issue, newest issues first
  for (const [k, list] of by) {
    const top = Math.max(...list.map(x => x.fy || 0)), cur = list.filter(x => (x.fy || 0) === top).sort((a, b) => String(b.closed).localeCompare(String(a.closed)));
    by.set(k, cur);
  }
  return by;
}
export function districtRow(d, { shape, iwud, bonds, today }) {
  const geo = shape ? esriToGeo(shape) : null, at = labelPoint(geo), b = bonds || [];
  return { id: 'district:' + d.id, kind: 'district', source: 'tceq-districts', county: d.county, name: titleCase(d.name), cat: TYPE_SHORT[d.type] || d.type || 'Other',
    status: titleCase(d.status) || null, day: iwud?.created || null, amount: b.length ? b.reduce((t, x) => t + (x.principal || 0), 0) || null : null, units: null, addr: null,
    attrs: { type: d.type || null, tceq: d.id, iwud: iwud?.iwud || null, acres: iwud?.acres || null, creationType: iwud?.creationType || null, bondAuthority: iwud?.bonds ?? null,
      taxRate: b[0]?.taxRate ?? null, taxableValue: b[0]?.taxableValue ?? null, population: b[0]?.population ?? null, bondYear: b[0]?.fy ?? null,
      bonds: b.slice(0, 12).map(x => ({ issue: x.issue, closed: x.closed, principal: x.principal, purpose: x.purpose })), checked: today || null },
    lon: at?.[0] ?? null, lat: at?.[1] ?? null, shape_json: geo };
}

// ---------- TEA schools ----------
// the newest "districts_schools_YYYYMMDD_C" service (schools; _D is districts)
export function newestTeaService(names) {
  const dated = names.map(x => { const m = String(x).match(/^districts_schools_(\d{4})_?(\d{2})_?(\d{2})?.*_C(_view)?$/i) || String(x).match(/^districts_schools_(\d{8})_C$/i); if (!m) return null; const d = m[1].length === 8 ? m[1] : m[1] + (m[2] || '00') + (m[3] || '00'); return { name: x, d }; }).filter(Boolean);
  return dated.sort((a, b) => b.d.localeCompare(a.d))[0]?.name || null;
}
const fieldLike = (a, re) => { const k = Object.keys(a).filter(x => re.test(x)).sort().pop(); return k ? a[k] : null; };
const COUNTY_BY_NO = Object.fromEntries(Object.entries(TX_COUNTY_NO).map(([k, v]) => [String(v).padStart(3, '0'), k]));
// enrollment by campus number from TEA's yearly schools layer (Schools_2024_to_2025: USER_School_Number,
// USER_School_Enrollment_as_of_Oc[t…] — the field name is cut off, so asOf comes from the layer's name)
export function teaEnrollment(features, asOf = null) {
  const out = new Map();
  for (const f of features) {
    const a = f.attributes || {}, no = s(fieldLike(a, /^(USER_)?School_Num/i)).replace(/^'/, ''), e = pos(fieldLike(a, /^(USER_)?School_Enr/i));
    if (no && e) out.set(no.padStart(9, '0'), { enroll: e, asOf, districtEnrollment: pos(fieldLike(a, /^(USER_)?District_Enr/i)) });
  }
  return out;
}
// "Schools_2024_to_2025" -> "October 2024" (TEA counts enrollment each fall)
export const teaYearLabel = name => { const m = String(name || '').match(/(\d{4})_to_\d{4}/); return m ? 'October ' + m[1] : null; };
const grade = v => { const t = s(v).replace(/^Grade\s+/i, ''); return /^early/i.test(t) ? 'EE' : /^pre/i.test(t) ? 'PK' : /^kinder/i.test(t) ? 'K' : t; };
// a campus from TEA's newest dated directory layer (id, district_name, campus_type, low_grade, high_grade, name, address,
// latitude, longitude, rating); the county is the first three digits of the campus number
export function teaSchoolRow(f, { enrollment = new Map(), counties = COUNTIES } = {}) {
  const a = f.attributes || {}, no = s(a.id).replace(/^'/, '').padStart(9, '0'), county = COUNTY_BY_NO[no.slice(0, 3)];
  if (!county || !counties.includes(county) || !s(a.name)) return null;
  const x = f.geometry?.x ?? n(a.longitude), y = f.geometry?.y ?? n(a.latitude); if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const type = s(a.campus_type), level = /high/i.test(type) && !/jr/i.test(type) ? 'high' : /middle|jr/i.test(type) ? 'middle' : /elem|primary|intermediate/i.test(type) ? 'elementary' : 'other';
  const e = enrollment.get(no);
  return { id: 'school:' + no, kind: 'school', source: 'tea-schools', county, name: s(a.name), cat: level, status: null, day: null, units: e?.enroll ?? null, amount: null,
    addr: s(a.address).replace(/\.\s+TX/, ', TX').replace(/\.\s+/g, ', ') || null,
    attrs: { grades: [grade(a.low_grade), grade(a.high_grade)].filter(Boolean).join('–'), district: s(a.district_name) || null, districtEnrollment: e?.districtEnrollment ?? null, type: type || null,
      rating: s(a.rating) || null, website: s(a.website) || null, enrolledAsOf: e?.asOf ?? null, campus: no },
    lon: r6(x), lat: r6(y), shape_json: null };
}

// ---------- shared ----------
// what the loader compares to decide whether a row changed (everything but the load bookkeeping)
export function rowHash(r, hashFn) {
  const { load_id, h, first_seen, acct, ...rest } = r;
  return hashFn(JSON.stringify(rest));
}
