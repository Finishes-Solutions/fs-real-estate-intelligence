// Building lookup for the click-in panel: GET /api/building?lat=..&lon=..
//   parcel: Texas GIO StratMap land parcels (statewide county appraisal data, free ArcGIS service); where StratMap has no
//           parcel (all of Harris and Waller counties) the county appraisal district's own public parcel layer
//   places: named businesses within ~80 m from OpenStreetMap (Overpass API, free)
//   photo:  nearest Mapillary street-level image (free; only when MAPILLARY_TOKEN is set)
//   height: roof height from USGS 3DEP lidar (Planetary Computer) over the footprint (&fp=lon,lat;lon,lat;…)
//   osm:    the OpenStreetMap building there (levels, height, name, and its whole outline) when it is mapped
//   parcels: every parcel the building sits on (when it spans more than one), from its outline
// Every part is optional: a failing source returns an error string for that section, never a 500.
import { rateLimit } from './_lib/guard.mjs';
import { lidarHeight } from '../lib/height.mjs';

const PARCELS = process.env.PARCEL_SERVICE || 'https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer/0';
// the main public Overpass server is often busy; two community mirrors carry the same OpenStreetMap data
const OVERPASS = [process.env.OVERPASS_URL, 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'].filter(Boolean);
const UA = { 'User-Agent': 'FinishesSolutions-RE-Intelligence/1.0 (building panel)' };

async function getJSON(url, opts = {}, ms = 8000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { ...opts, signal: ctl.signal, headers: { ...UA, ...(opts.headers || {}) } }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  catch (e) { throw new Error(e.name === 'AbortError' ? 'timed out' : e.message); }
  finally { clearTimeout(t); }
}

// StratMap field names vary a little by year; look them up case-insensitively.
const pick = (a, ...keys) => { for (const k of keys) { const hit = Object.keys(a).find(x => x.toLowerCase() === k.toLowerCase()); if (hit && a[hit] != null && String(a[hit]).trim() !== '' && String(a[hit]).trim() !== '0' && !/^null$/i.test(String(a[hit]).trim())) return a[hit]; } return null; };
const num = v => { const n = Number(String(v ?? '').replace(/[$,]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
function fmtDate(v) {
  if (v == null) return null;
  if (typeof v === 'number' && v > 1e11) return new Date(v).toISOString().slice(0, 10); // epoch ms
  const s = String(v).trim();
  // Fort Bend (and others) send spreadsheet day numbers: 46082 = 2026-03-01
  if (/^\d{5}$/.test(s) && +s > 20000 && +s < 80000) return new Date(Date.UTC(1899, 11, 30) + +s * 864e5).toISOString().slice(0, 10);
  if (/^\d{8}$/.test(s)) return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6);
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (us) return us[3] + '-' + us[1].padStart(2, '0') + '-' + us[2].padStart(2, '0'); // the appraisal districts' 01/24/2025
  return s.slice(0, 20);
}
// ArcGIS polygon rings as GeoJSON. rings can hold several OUTER rings (a parcel drawn in separate pieces, clockwise) as
// well as holes (counter-clockwise, inside an outer ring); reading every ring after the first as a hole lost the other
// pieces. Each outer ring is a polygon with the holes that fall in it: a Polygon for one piece, a MultiPolygon for more.
// (A service that winds every ring the same way: the rings inside another ring are its holes, the rest are pieces.)
export function esriPolygon(geometry) {
  const rings = (geometry?.rings || []).filter(r => Array.isArray(r) && r.length >= 4); if (!rings.length) return null;
  const area2 = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return s; }; // > 0: counter-clockwise
  const inside = (a, b) => a !== b && Math.abs(area2(a)) < Math.abs(area2(b)) && inRing(b, a[0]) && inRing(b, a[Math.floor(a.length / 2)]);
  const mixed = rings.some(r => area2(r) < 0) && rings.some(r => area2(r) > 0);
  let outer = rings.filter(r => mixed ? area2(r) < 0 : !rings.some(o => inside(r, o)));
  const holes = rings.filter(r => !outer.includes(r)), polys = outer.map(o => [o]);
  for (const h of holes) { const host = polys.filter(p => inside(h, p[0])).sort((a, b) => Math.abs(area2(a[0])) - Math.abs(area2(b[0])))[0];
    if (host) host.push(h); else polys.push([h]); } // a counter-clockwise ring inside no piece is a piece of its own
  return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
}
export function normalizeParcel(attrs, geometry) {
  const a = attrs || {}, area = num(pick(a, 'GIS_AREA', 'LEGAL_AREA')), unit = pick(a, 'GIS_AREA_UNIT', 'LGL_AREA_UNIT');
  const mail = [pick(a, 'MAIL_LINE1', 'MAIL_ADDR'), pick(a, 'MAIL_LINE2'), [pick(a, 'MAIL_CITY'), pick(a, 'MAIL_STAT', 'MAIL_STATE'), pick(a, 'MAIL_ZIP')].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const tidy = v => String(v || '').replace(/\s+,/g, ',').replace(/(,\s*)+$/, '').replace(/,\s*,/g, ',').trim(); // "Highway 90A , ," -> "Highway 90A"
  const situs = tidy(pick(a, 'SITUS_ADDR') || [pick(a, 'SITUS_NUM'), pick(a, 'SITUS_STREET', 'SITUS_STRE', 'SITUS_ST_1'), pick(a, 'SITUS_ST_2')].filter(Boolean).join(' ')), city = pick(a, 'SITUS_CITY');
  const raw = Object.fromEntries(Object.entries(a).filter(([k, v]) => v != null && String(v).trim() !== '' && !/^null$/i.test(String(v).trim()) && !/^(objectid|shape|globalid|st_area|st_perimeter)/i.test(k)).slice(0, 60).map(([k, v]) => [k, String(v).slice(0, 160)]));
  return {
    propId: pick(a, 'PROP_ID', 'GEO_ID'), owner: pick(a, 'OWNER_NAME'), mailing: mail || null,
    situs: situs ? (city && !situs.toLowerCase().includes(String(city).toLowerCase()) ? situs + ', ' + city : situs) : null, county: pick(a, 'COUNTY'),
    situsStreet: situs || null, situsCity: city, situsZip: (String(pick(a, 'SITUS_ZIP') || '').match(/\d{5}/) || [null])[0],
    landUse: pick(a, 'LOC_LAND_USE', 'LAND_USE', 'STATE_CD'), marketValue: num(pick(a, 'MKT_VALUE')), landValue: num(pick(a, 'LAND_VALUE')),
    improvementValue: num(pick(a, 'IMP_VALUE')), yearBuilt: pick(a, 'YEAR_BUILT'), acquired: fmtDate(pick(a, 'DATE_ACQ', 'DEED_DATE')), taxYear: pick(a, 'TAX_YEAR'),
    area: area ? Math.round(area * 100) / 100 + ' ' + (unit ? String(unit).toLowerCase() : 'acres') : null, raw, // StratMap areas are acres unless a unit says otherwise
    buildingSqft: num(pick(a, 'BLDG_SQFT', 'IMPRV_SQFT', 'IMP_SQFT', 'LIVING_AREA', 'LIV_AREA', 'BLD_AREA', 'BLDG_AREA', 'TOT_SQFT', 'SQ_FT', 'SQFT')),
    stories: num(pick(a, 'STORIES', 'NUM_STORIES', 'NO_STORIES', 'FLOORS')),
    geometry: esriPolygon(geometry)
  };
}

// County appraisal districts' own public parcel layers, asked when StratMap has nothing at the point. Harris (HCAD) and
// the BIS-hosted districts (Waller, Austin, Washington, Grimes; checked 2026-10-14 with build/probe-county2/3.mjs).
// box: a generous outline of the county, so only the likely district is asked (a point outside it finds nothing anyway).
export const CADS = [
  { county: 'Harris', name: 'Harris Central Appraisal District', url: 'https://arcweb.hcad.org/server/rest/services/public/public_query/MapServer/0', box: [-96.0, 29.48, -94.88, 30.19], kind: 'hcad' },
  { county: 'Waller', name: 'Waller County Appraisal District', url: 'https://services3.arcgis.com/KKhSlBnH1Rm0YK62/arcgis/rest/services/WallerCADWebService/FeatureServer/0', box: [-96.21, 29.72, -95.79, 30.36], kind: 'bis' },
  { county: 'Austin', name: 'Austin County Appraisal District', url: 'https://services7.arcgis.com/rNakmFefTO1XjYg4/arcgis/rest/services/AustinCADWebService/FeatureServer/0', box: [-96.64, 29.59, -95.99, 30.18], kind: 'bis' },
  { county: 'Washington', name: 'Washington County Appraisal District', url: 'https://services3.arcgis.com/42lb4t0mpCcD1zg8/arcgis/rest/services/WashingtonCADMatixService/FeatureServer/0', box: [-96.81, 29.97, -96.07, 30.43], kind: 'bis' },
  { county: 'Grimes', name: 'Grimes Central Appraisal District', url: 'https://services8.arcgis.com/fpr21jaV02YtR7tv/arcgis/rest/services/GrimesCADWebService/FeatureServer/0', box: [-96.21, 30.26, -95.79, 30.66], kind: 'bis' }
];
const t = v => v == null ? '' : String(v).trim();
const caseName = v => t(v).toLowerCase().replace(/\s+/g, ' ').replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\b(Llc|Lp|Ltd|Inc|Tx|Us|Fm|Sh|Ih|Cr|Ii|Iii|Iv)\b/g, w => w.toUpperCase());
// a CAD record in the same shape as normalizeParcel, plus where it came from
export function normalizeCad(cad, attrs, geometry, shared = 1) {
  const a = attrs || {}, raw = Object.fromEntries(Object.entries(a).filter(([k, v]) => v != null && t(v) !== '' && !/^(objectid|shape|globalid|fid|creat|last_ed|edit)/i.test(k)).slice(0, 60).map(([k, v]) => [k, t(v).slice(0, 200)]));
  const base = { county: cad.county, source: cad.name, sourceUrl: cad.url.replace(/\/\d+$/, ''), geometry: esriPolygon(geometry), raw, stories: null, buildingSqft: null, shared: shared > 1 ? shared : undefined };
  if (cad.kind === 'hcad') {
    const situs = caseName(a.address && !/^0\s/.test(t(a.address)) ? a.address : ''), city = caseName(a.city);
    return { ...base, propId: t(a.HCAD_NUM) || null, owner: t(a.owner) || null, mailing: null, situs: situs ? situs + (city ? ', ' + city : '') : null, situsStreet: situs || null, situsCity: city || null,
      situsZip: (t(a.zip).match(/\d{5}/) || [null])[0], landUse: t(a.state_class) || null, marketValue: num(a.mkt_val) || num(a.appr_val), landValue: num(a.land_val), improvementValue: num(a.impr_val),
      yearBuilt: null, acquired: null, taxYear: null, area: null, legal: t(a.legal_lines).replace(/\|/g, ' · ') || null, subdivision: caseName(a.subdivision) || null };
  }
  const street = [t(a.situs_num), t(a.situs_street_prefx), t(a.situs_street), t(a.situs_street_sufix)].filter(Boolean).join(' '), city = caseName(a.situs_city);
  const mail = [t(a.addr_line1), t(a.addr_line2), t(a.addr_line3), [t(a.addr_city), t(a.addr_state), t(a.zip)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const acres = num(a.legal_acreage);
  return { ...base, propId: t(a.prop_id_text || a.propidtxt || a.prop_id) || null, owner: t(a.file_as_name) || null, mailing: mail || null,
    situs: street ? caseName(street) + (city ? ', ' + city : '') : null, situsStreet: street ? caseName(street) : null, situsCity: city || null, situsZip: (t(a.situs_zip).match(/\d{5}/) || [null])[0],
    landUse: t(a.statecode).split(',')[0] || null, marketValue: num(a.market), landValue: num(a.land_val), improvementValue: num(a.imprv_val), yearBuilt: null,
    acquired: fmtDate(a.Deed_Date), taxYear: t(a.owner_tax_yr) || null, area: acres ? Math.round(acres * 100) / 100 + ' acres' : null,
    legal: [t(a.legal_desc), t(a.legal_desc2), t(a.legal_desc3)].filter(Boolean).join(' ') || null, buildingSqft: num(a.livarea) };
}
// the CAD parcel under the point: the point itself, then a few meters around it (a click on a lot line); condominium units
// share one outline, so the record says how many do
export async function cadParcel(lat, lon) {
  for (const cad of CADS.filter(c => lon >= c.box[0] && lon <= c.box[2] && lat >= c.box[1] && lat <= c.box[3])) {
    for (const pad of [0, 0.00006]) {
      const g = pad ? { geometry: [lon - pad, lat - pad, lon + pad, lat + pad].join(','), geometryType: 'esriGeometryEnvelope' } : { geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPoint' };
      const q = new URLSearchParams({ f: 'json', ...g, inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: '*', returnGeometry: 'true', outSR: '4326', geometryPrecision: '6', resultRecordCount: '25' });
      const d = await getJSON(cad.url + '/query?' + q, {}, 7000);
      if (d.error) throw new Error(cad.name + ': ' + (d.error.message || 'service error'));
      const fs = (d.features || []).filter(f => f.attributes && (f.attributes.owner || f.attributes.file_as_name || f.attributes.HCAD_NUM));
      if (!fs.length) continue;
      const hit = fs.find(f => f.geometry?.rings?.some(r => inRing(r, [lon, lat]))) || fs[0];
      const ring = JSON.stringify(hit.geometry?.rings?.[0]?.[0]), same = fs.filter(f => JSON.stringify(f.geometry?.rings?.[0]?.[0]) === ring).length;
      return normalizeCad(cad, hit.attributes, hit.geometry, same);
    }
  }
  return null;
}

export async function parcel(lat, lon) {
  const p = await stratParcel(lat, lon);
  if (p) return p;
  // StratMap has nothing here (all of Harris and Waller): the county appraisal district's own layer
  return cadParcel(lat, lon);
}
async function stratParcel(lat, lon) {
  // the StratMap service refuses /query; map-click "identify" on the service is what it answers
  const q = new URLSearchParams({ geometry: lon + ',' + lat, geometryType: 'esriGeometryPoint', sr: '4326', layers: 'all:' + (PARCELS.match(/\/(\d+)$/) || [0, 0])[1], tolerance: '1',
    mapExtent: [lon - .002, lat - .002, lon + .002, lat + .002].join(','), imageDisplay: '400,400,96', returnGeometry: 'true', f: 'json' });
  const d = await getJSON(PARCELS.replace(/\/\d+$/, '') + '/identify?' + q);
  if (d.error) throw new Error(d.error.message || 'service error');
  const f = (d.results || [])[0];
  return f ? normalizeParcel(f.attributes, f.geometry) : null;
}

export function inRing(r, [x, y]) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
// every parcel a building outline touches (a building can straddle lot lines): identify with the polygon, nearest 10
async function parcelsIn(g) {
  const ring = g?.coordinates?.[0]; if (!ring || ring.length < 4) return [];
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]), pad = .0005;
  const q = new URLSearchParams({ geometry: JSON.stringify({ rings: [ring], spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPolygon', sr: '4326', layers: 'all:' + (PARCELS.match(/\/(\d+)$/) || [0, 0])[1], tolerance: '0',
    mapExtent: [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad].join(','), imageDisplay: '400,400,96', returnGeometry: 'true', f: 'json' });
  const d = await getJSON(PARCELS.replace(/\/\d+$/, '') + '/identify?' + q);
  if (d.error) throw new Error(d.error.message || 'service error');
  const seen = new Set(), out = [];
  for (const f of d.results || []) { const p = normalizeParcel(f.attributes, f.geometry), k = p.propId || JSON.stringify(f.geometry?.rings?.[0]?.[0]); if (seen.has(k)) continue; seen.add(k); out.push(p); if (out.length >= 10) break; }
  return out;
}
const ringArea = r => { let s2 = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s2 += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return Math.abs(s2) / 2; };

const KINDS = ['shop', 'amenity', 'office', 'healthcare', 'craft', 'leisure', 'tourism', 'club'];
// one Overpass call: named businesses within 150 m (big buildings and strip centers reach well past 80 m), then the
// building outline(s) under the point; the card sorts them into "in this building" and "nearby"
async function places(lat, lon) {
  const ql = `[out:json][timeout:12];nwr(around:150,${lat},${lon})[name][~"^(${KINDS.join('|')})$"~"."];out tags center 80;way(around:6,${lat},${lon})[building];out tags geom 3;`;
  // staggered: the next server is asked when the one before hasn't answered within 2.5 s (or failed), and the first good
  // answer wins, so a stalled server costs 2.5 s instead of its whole 9 s timeout
  const ask = url => getJSON(url, { method: 'POST', body: new URLSearchParams({ data: ql }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 9000)
    .then(d => d?.remark && !d.elements?.length ? Promise.reject(new Error(d.remark)) : d);
  const d = await new Promise((done, fail) => {
    let left = OVERPASS.length, i = 0, timer = null, over = false;
    const next = () => { clearTimeout(timer); if (over || i >= OVERPASS.length) return; const url = OVERPASS[i++];
      ask(url).then(d => { over = true; clearTimeout(timer); done(d); }, e => { if (--left === 0) { over = true; fail(e); } else if (!over) next(); }); timer = setTimeout(next, 2500); };
    next();
  });
  const els = d.elements || [];
  // the building whose outline contains the point (a click near a wall can also find the neighbour), else the nearest
  const outlineOf = e => { const g = (e.geometry || []).map(n => [n.lon, n.lat]); return g.length >= 4 && g[0][0] === g[g.length - 1][0] && g[0][1] === g[g.length - 1][1] ? { type: 'Polygon', coordinates: [g] } : null; };
  const bldgs = els.filter(e => e.type === 'way' && e.tags?.building), inside = bldgs.find(e => { const o = outlineOf(e); return o && inRing(o.coordinates[0], [lon, lat]); });
  const els0 = els.filter(e => e.tags?.building && !KINDS.some(k => e.tags[k] && e.tags.name)).concat(els.filter(e => e.tags?.building)), b = inside || els0[0];
  const t = b?.tags || {}, levels = num(t['building:levels']), h = num(String(t.height || '').replace(/\s*m$/, ''));
  const osm = b ? { levels, height_m: h, name: t.name || null, use: t.building !== 'yes' ? t.building.replace(/_/g, ' ') : null, roofLevels: num(t['roof:levels']), outline: inside ? outlineOf(inside) : null } : null;
  return { osm, list: els.filter(e => e.tags?.name && KINDS.some(k => e.tags[k])).map(e => {
    const t = e.tags || {}, k = KINDS.find(x => t[x]), c = e.center || e;
    return { name: String(t.name).slice(0, 120), kind: k ? (t[k] === 'yes' ? k : t[k].replace(/_/g, ' ')) : '', brand: t.brand || '', lat: c.lat, lon: c.lon };
  }).filter(p => p.lat != null).sort((a, b) => Math.hypot(a.lat - lat, a.lon - lon) - Math.hypot(b.lat - lat, b.lon - lon)) };
}

async function photo(lat, lon) {
  const token = process.env.MAPILLARY_TOKEN; if (!token) return null;
  const d = 0.0008, q = new URLSearchParams({ access_token: token, fields: 'id,thumb_1024_url,captured_at,geometry', bbox: [lon - d, lat - d, lon + d, lat + d].join(','), limit: '25' });
  const r = await getJSON('https://graph.mapillary.com/images?' + q);
  const best = (r.data || []).filter(x => x.geometry?.coordinates).sort((a, b) => Math.hypot(a.geometry.coordinates[0] - lon, a.geometry.coordinates[1] - lat) - Math.hypot(b.geometry.coordinates[0] - lon, b.geometry.coordinates[1] - lat))[0];
  return best ? { thumb: best.thumb_1024_url, captured: best.captured_at ? new Date(best.captured_at).toISOString().slice(0, 10) : '', link: 'https://www.mapillary.com/app/?pKey=' + best.id } : null;
}

export default async function handler(req, res) {
  const lat = +req.query.lat, lon = +req.query.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 25 || lat > 37 || lon < -107 || lon > -93) return res.status(400).json({ error: 'lat/lon must be inside Texas' });
  if (!rateLimit(req, res, { perMinute: 60, perDay: 1200 })) return; // two requests per card (parcel, then the rest)
  const r5 = v => Math.round(v * 1e5) / 1e5;
  // footprint for the lidar height: "lon,lat;lon,lat;…" (closed or not), at most 120 vertices
  const fp = String(req.query.fp || '').split(';').slice(0, 121).map(x => x.split(',').map(Number)).filter(c => c.length === 2 && c.every(Number.isFinite) && Math.abs(c[0] - lon) < .02 && Math.abs(c[1] - lat) < .02);
  const footprint = fp.length >= 3 ? { type: 'Polygon', coordinates: [fp[0][0] === fp[fp.length - 1][0] && fp[0][1] === fp[fp.length - 1][1] ? fp : fp.concat([fp[0]])] } : null;
  // &part=parcel: the appraisal record alone (the card shows it first); &part=rest: everything but the parcel
  const part = req.query.part === 'parcel' || req.query.part === 'rest' ? req.query.part : null, skip = Promise.resolve(null);
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
  if (part === 'parcel') {
    try { return res.json({ parcel: await parcel(r5(lat), r5(lon)) }); } catch (e) { res.setHeader('Cache-Control', 'no-store'); return res.json({ parcel: null, parcelError: e.message }); }
  }
  const [p, pl, ph, ht, pf] = await Promise.allSettled([part === 'rest' ? skip : parcel(r5(lat), r5(lon)), places(r5(lat), r5(lon)), photo(r5(lat), r5(lon)), lidarHeight(footprint, [r5(lon), r5(lat)]), footprint ? parcelsIn(footprint) : Promise.resolve([])]);
  // the map's footprint can be a tile-clipped piece of a big building: when OpenStreetMap's outline is clearly bigger,
  // look for parcels under the whole of it too
  const outline = pl.status === 'fulfilled' ? pl.value.osm?.outline : null;
  let parcels = pf.status === 'fulfilled' ? pf.value : [];
  if (outline && (!footprint || ringArea(outline.coordinates[0]) > 1.2 * ringArea(footprint.coordinates[0]))) {
    try { const more = await parcelsIn(outline), have = new Set(parcels.map(x => x.propId)); parcels = parcels.concat(more.filter(x => !have.has(x.propId))).slice(0, 10); } catch (e) {}
  }
  // a source that failed (busy server, timeout) is retried in a few minutes rather than cached for a day
  if ((part !== 'rest' && p.status === 'rejected') || pl.status === 'rejected' || ht.status === 'rejected' || pf.status === 'rejected') res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
  return res.json({
    ...(part === 'rest' ? {} : { parcel: p.status === 'fulfilled' ? p.value : null }), parcelError: p.status === 'rejected' ? p.reason.message : undefined,
    places: pl.status === 'fulfilled' ? pl.value.list : [], placesError: pl.status === 'rejected' ? pl.reason.message : undefined,
    osm: pl.status === 'fulfilled' ? pl.value.osm : null,
    parcels: parcels.length > 1 ? parcels : undefined,
    height: ht.status === 'fulfilled' ? ht.value : { source: 'none', note: 'Lidar lookup failed: ' + ht.reason?.message },
    photo: ph.status === 'fulfilled' ? ph.value : null
  });
}
