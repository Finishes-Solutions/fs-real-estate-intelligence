// Building permits from public open-data portals nationwide (build/permits-us.mjs loads them into dev_items, the same
// table and map layer as Harris County's permits). Every portal names its fields its own way, so a source's fields are
// matched to ours by name (autoMap) and a registry entry can override any of them (data/permit-sources.json).
//   rowFrom(src, map, rec) -> one dev_items row: kind 'permit', source <slug>, the permit's kind classified with the same
//   words as HCAD's (permitCat), its issued date (else applied), valuation, address, point, and the portal's own fields
//   (type, description, contractor, permit number) in attrs. Contacts (phones, emails) are never copied.
import { permitCat, plausibleDay, titleCase } from './countydata.mjs';

const s = v => v == null ? '' : String(v).trim();
const num = v => { const x = Number(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(x) ? x : null; };
// field roles, best first; a field name is matched after lower-casing and dropping everything but letters and digits
const ROLES = {
  id: [/^permitnumber$/, /^pcispermit$/, /^jobfilingnumber$/, /^filenumber$/, /^numstring$/, /^record$/, /^usersrecordnumber$/, /^pnum$/, /^cofonumber$/, /^workpermit$/, /^permitno$/, /^permitnum$/, /^permitnbr$/, /^permit$/, /^permitid$/, /^recordid$/, /^recordnumber$/, /^applicationnumber$/, /^applicationno$/, /^jobnumber$/, /^job$/, /^casenumber$/, /^folderrsn$/, /^apno$/, /^permit.*(number|no|id)$/, /recordnumber$/, /^id$/],
  issued: [/^issueddate$/, /^usersdateissued$/, /^dateapprov/, /^approveddate$/, /^issuedate$/, /^dateissued$/, /^permitissueddate$/, /^permitissuedate$/, /^issued$/, /^issuancedate$/, /^issueddt$/, /^issuedt$/, /^issdttm$/, /^issudate$/, /^issdate$/, /^dateofpermitissuance$/, /^permitlicenseissueddate$/, /^permitdat[e]?$/, /^bldprcisdt$/, /^issue.*date/, /^iss.*(date|dt|dttm)$/, /issued/, /issuance/, /^issue$/, /^date$/],
  applied: [/^applieddate$/, /^applied$/, /^submit$/, /^dateentered$/, /^datereceiv/, /^started$/, /^appdate$/, /^usersdatesubmitted$/, /^usersapplicationdate$/, /^applicationdate$/, /^filingdate$/, /^fileddate$/, /^filedate$/, /^submitteddate$/, /^datesubmitted$/, /^datefiled$/, /^appldate$/, /^applydate$/, /^applicationdatetime$/, /^apdttm$/, /^indate$/, /^opened$/, /^caseopened$/, /^submitdt$/, /^dateofapplication$/, /^creationdate$/, /^createddate$/, /^createddt$/, /^startdate$/, /(applied|application|apply|filing|filed|file|submit|created|open|intake).*(date|dt)|date.*(applied|filed|opened|submitted)/],
  final: [/^finaldate$/, /^finaled$/, /^completeddate$/, /^completiondate$/, /^closeddate$/, /^finaleddate$/, /^datefinaled$/, /^finalizedate$/, /^finalleddate$/, /^codate$/, /^coodttm$/, /^statusdate$/, /(final|complet|closed|expir|status).*(date|dt)/],
  type: [/^permittype$/, /^permittypedesc$/, /^permittypemapped$/, /^worktype$/, /^typeofwork$/, /^permitclass$/, /^permitclassmapped$/, /^permitcategory$/, /^recordtype$/, /^jobtype$/, /^type$/, /^category$/, /^subtype$/, /^permitsubtype$/, /^worktypedesc$/, /^applicationtype$/, /(permit|work|job|record).*(type|class)/],
  desc: [/^description$/, /^workdescription$/, /^jobdescription$/, /^projectdescription$/, /^descriptionofwork$/, /^workdesc$/, /^scopeofwork$/, /^jobdesc$/, /^proposeduse$/, /^projectname$/, /description|scope/],
  value: [/^valuation$/, /^jobvaluation$/, /^totaljobvaluation$/, /^estimatedcost$/, /^estprojectcost$/, /^reportedcost$/, /^declaredvaluation$/, /^totalvaluation$/, /^projectvalue$/, /^value$/, /^constructionvalue$/, /^totalvalue$/, /^jobvalue$/, /(valuation|value|cost)/],
  address: [/^address$/, /^situsconcat$/, /^situsaddress$/, /^matchaddr$/, /^stAddr$/i, /^inaddress$/, /^usersaddress$/, /^fulladdress$/, /^originaladdress$/, /^originaladdress1$/, /^siteaddress$/, /^streetaddress$/, /^propertyaddress$/, /^locationaddress$/, /^permitaddress$/, /^addr$/, /^location$/, /^projectaddress$/, /^address1$/, /address/],
  number: [/^houseno$/, /^addressstart$/, /^situsbldgnum$/, /^situsnumber$/, /^housenumber$/, /^streetnumber$/, /^stno$/, /^streetno$/, /^addressnumber$/, /^originaladdressnumber$/, /^house$/, /^addrnum$/, /^streetnum$/],
  street: [/^streetname$/, /^situsstreetname$/, /^street$/, /^stname$/, /^originalstreetname$/, /^addressstreet$/, /^streetfullname$/],
  suffix: [/^streetsuffix$/, /^suffix$/, /^streettype$/, /^sttype$/],
  city: [/^city$/, /^originalcity$/, /^municipality$/, /^jurisdiction$/, /^town$/],
  zip: [/^zip$/, /^zipcode$/, /^originalzip$/, /^postalcode$/, /^zip5$/],
  lat: [/^latitude$/, /^lat$/, /^y$/, /^ycoord$/, /^latitudeperm$/, /^gisy$/, /latitude$/],
  lon: [/^longitude$/, /^lon$/, /^lng$/, /^long$/, /^x$/, /^xcoord$/, /^longitudeperm$/, /^gisx$/, /longitude$/],
  year: [/^year$/, /^yr$/, /^issueyear$/],
  month: [/^month$/, /^mon$/, /^issuemonth$/],
  dom: [/^day$/],
  point: [/^location$/, /^locationpoint$/, /^geocodedcolumn$/, /^point$/, /^thegeom$/, /^geolocation$/, /^location1$/, /^mappedlocation$/, /^latlon$/, /^geom$/],
  status: [/^status$/, /^permitstatus$/, /^currentstatus$/, /^statuscurrent$/, /^recordstatus$/, /^jobstatus$/, /status/],
  contractor: [/^permitteesbusinessname$/, /^contractorname$/, /^contractor$/, /^contractorbusinessname$/, /^contractorcompanyname$/, /^contractorcompany$/, /^contractorsbusinessname$/, /^contractorfullname$/, /contractor.*(name|business|company)/],
  sqft: [/^squarefeet$/, /^sqft$/, /^totalsqft$/, /^totalsquarefeet$/, /^buildingsqft$/, /^floorarea$/, /(squarefe|sqft|squarefootage|floorarea|buildingarea|grossarea)/],
  units: [/^housingunits$/, /^dwellingunits$/, /^units$/, /^proposedunits$/, /^numberofunits$/, /^totalunits$/, /^newunits$/, /^unitsadded$/, /units/]
};
const NEVER = /phone|email|e_mail|fax|ssn|license_?no|owner_?(name|address)|applicant_?(name|address|phone)|contact/i;
const SITE_ROLES = new Set(['address', 'number', 'street', 'suffix', 'city', 'zip']);
const NOT_SITE = /applicant|owner|representative|agent|mailing|billing|contractor|party|permittee|business|builder|issuedto|^in_?(city|state|zip)$/i;
const key = f => String(f).toLowerCase().replace(/[^a-z0-9]/g, '');

// fields: [{ name, type }] (Socrata datatype or ArcGIS type); returns { role: fieldName }
export function autoMap(fields) {
  const F = fields.map(f => typeof f === 'string' ? { name: f.split(':')[0], type: f.split(':')[1] || '' } : f).filter(f => f.name && !/^[:@]/.test(f.name) && !NEVER.test(f.name));
  const used = new Set(), out = {};
  for (const role of Object.keys(ROLES)) {
    for (const re of ROLES[role]) {
      const f = F.find(x => !used.has(x.name) && re.test(key(x.name)) && fits(role, x.type) && !(SITE_ROLES.has(role) && NOT_SITE.test(x.name)));
      if (f) { out[role] = f.name; used.add(f.name); break; }
    }
  }
  return out;
}
function fits(role, type) {
  const t = String(type || '').toLowerCase();
  if (['issued', 'applied', 'final'].includes(role)) return !t || /date|time|text|string|integer|double/.test(t);
  if (['lat', 'lon', 'value', 'sqft', 'units'].includes(role)) return !t || /number|double|integer|single|text|string|money/.test(t);
  if (role === 'point') return /point|location|geometry|text/.test(t) || !t;
  return !t || /text|string|number|integer|double|url/.test(t);
}

// a Socrata or ArcGIS value as a day
export function dayOf(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') { if (v > 1e11 || v < -1e11) return new Date(v).toISOString().slice(0, 10); if (v > 19000101 && v < 21001231) return String(v).replace(/^(\d{4})(\d\d)(\d\d)$/, '$1-$2-$3'); return null; }
  const t = s(v); let m;
  if ((m = t.match(/^(\d{4})-(\d\d)-(\d\d)/))) return m[0];
  if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  if ((m = t.match(/^(\d{4})(\d\d)(\d\d)$/))) return m[1] + '-' + m[2] + '-' + m[3];
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  if ((m = t.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/)) && MON[m[1].toLowerCase()]) return m[3] + '-' + String(MON[m[1].toLowerCase()]).padStart(2, '0') + '-' + m[2].padStart(2, '0');
  const d = Date.parse(t); return Number.isFinite(d) ? new Date(d).toISOString().slice(0, 10) : null;
}
// a point from a Socrata location / point column, a GeoJSON point, an ArcGIS geometry, or "(lat, lon)" text
export function pointOf(v) {
  if (v == null) return null;
  if (typeof v === 'string') { const m = v.match(/\(?\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\)?/); if (m) { const a = +m[1], b = +m[2]; return Math.abs(a) <= 90 && Math.abs(b) > 60 ? [b, a] : [a, b]; } const w = v.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)/i); return w ? [+w[1], +w[2]] : null; }
  if (Array.isArray(v.coordinates)) return [+v.coordinates[0], +v.coordinates[1]];
  if (v.longitude != null && v.latitude != null) return [+v.longitude, +v.latitude];
  if (v.x != null && v.y != null) return [+v.x, +v.y];
  return null;
}
// a Socrata "location" value's street line
const humanAddress = v => { try { return typeof v.human_address === 'string' ? JSON.parse(v.human_address).address || '' : v.human_address?.address || v.address || ''; } catch (e) { return ''; } };
const inUS = p => p && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[0] > -180 && p[0] < -60 && p[1] > 15 && p[1] < 72;
const r6 = v => Math.round(v * 1e6) / 1e6;

// src: { slug, place, state, county, agency }; map: autoMap's result with overrides; rec: one record (Socrata row, or
// ArcGIS { attributes, geometry })
export function rowFrom(src, map, rec) {
  const a = rec.attributes || rec, g = rec.geometry, get = role => map[role] ? a[map[role]] : undefined;
  const id = s(get('id')) || s((map.oid && a[map.oid]) ?? a[':id'] ?? a.OBJECTID ?? a.ObjectID ?? a.ObjectId ?? a.objectid ?? a.FID); if (!id) return null;
  const ymd = map.year && num(get('year')) > 1900 ? String(num(get('year'))) + '-' + String(Math.min(12, Math.max(1, num(get('month')) || 1))).padStart(2, '0') + '-' + String(Math.min(28, Math.max(1, num(get('dom')) || 1))).padStart(2, '0') : null;
  const day = [get('issued'), get('applied'), get('final'), ymd].map(dayOf).find(d => d && plausibleDay(d)); if (!day) return null;
  const type = s(get('type')).slice(0, 120), desc = s(get('desc')).replace(/\s+/g, ' ').slice(0, 240);
  const av = get('address'), addr0 = s(av && typeof av === 'object' ? humanAddress(av) : av) || [get('number'), get('street'), get('suffix')].map(s).filter(Boolean).join(' ');
  const addr = titleCase(addr0.replace(/\s+/g, ' ')).slice(0, 140) || null;
  let p = map.lat && map.lon ? [num(get('lon')), num(get('lat'))] : null;
  if (!inUS(p)) p = pointOf(get('point'));
  if (!inUS(p) && g) p = pointOf(g);
  if (!inUS(p) && map.lat && map.lon) p = [num(get('lat')), num(get('lon'))]; // (a few portals swap the two)
  const value = num(get('value')), units = num(get('units')), sqft = num(get('sqft'));
  const cat = permitCat(type) === 'other' || !type ? (permitCat([type, desc].join(' ')) || 'other') : permitCat(type);
  return { id: 'permit:' + (src.group || src.slug) + ':' + id.slice(0, 80), kind: 'permit', source: src.slug, county: src.county || null, name: addr || desc.slice(0, 80) || type || 'Permit', cat: cat || 'other',
    status: s(get('status')).slice(0, 60) || null, day, addr, amount: value != null && value > 0 && value < 5e10 ? Math.round(value) : null, units: units != null && units > 0 && units < 100000 ? Math.round(units) : null,
    attrs: { type: type || null, desc: desc || null, permit: id, contractor: s(get('contractor')).slice(0, 120) || null, sqft: sqft != null && sqft > 0 && sqft < 5e7 ? Math.round(sqft) : null,
      place: src.place || s(get('city')) || null, state: src.state || null, zip: s(get('zip')).slice(0, 10) || null, agency: src.agency || (src.place ? src.place + ' building department' : null),
      applied: dayOf(get('applied')), issued: dayOf(get('issued')), final: dayOf(get('final')) },
    lon: inUS(p) ? r6(p[0]) : null, lat: inUS(p) ? r6(p[1]) : null, shape_json: null };
}

// the US Census batch geocoder's answer (CSV: id, input, Match / No_Match, exactness, matched address, "lon,lat", ...)
export function parseCensusBatch(text) {
  const out = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const c = line.match(/"([^"]*)"/g)?.map(x => x.slice(1, -1)) || []; if (c.length < 6 || c[2] !== 'Match') continue;
    const [lon, lat] = c[5].split(',').map(Number); if (Number.isFinite(lon) && Number.isFinite(lat)) out.set(c[0], [Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6]);
  }
  return out;
}
