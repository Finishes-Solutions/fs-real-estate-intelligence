// Environmental screening data: which free government layers to search, how far, and the geometry helpers that measure
// each record's distance from a site. Shared by api/env.js, the browser (layer colors, labels) and the tests.
// Search distances follow the usual Phase I environmental site assessment practice (ASTM E1527-21 standard search
// distances, rounded), so the report reads like the database section of a Phase I, which it is not.
const TCEQ = 'https://gisweb.tceq.texas.gov/arcgis/rest/services/';
const EPA = 'https://geopub.epa.gov/arcgis/rest/services/EMEF/efpoints/MapServer/';
export const RRC = 'https://gis.rrc.texas.gov/server/rest/services/rrc_public/RRC_Public_Viewer_Srvs/MapServer';
export const NWI = 'https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer';
export const SDA = 'https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest';
export const SOILS_WMS = 'https://SDMDataAccess.sc.egov.usda.gov/Spatial/SDM.wms';

// set: which map-layer choice shows the kind (cleanup = contamination and cleanup programs, tanks, epa = permitted
// facilities). f: field names in that layer. mi: search distance from the site's edge.
const tceqF = { name: 'SITE_NAME', addr: 'PHYS_ADDR', city: 'CITY' }, epaF = { name: 'primary_name', addr: 'location_address', city: 'city_name', url: 'facility_url' };
export const KINDS = {
  npl: { label: 'EPA Superfund (National Priorities List)', short: 'EPA Superfund', url: EPA + '0', f: { ...epaF, id: 'registry_id', url: 'profile_url' }, mi: 1, set: 'cleanup', color: '#c92a2a' },
  superfund: { label: 'State Superfund (TCEQ)', short: 'State Superfund', url: TCEQ + 'Public/Superfund/MapServer/0', f: { ...tceqF, id: 'SF_ID', url: 'WEB_URL' }, mi: 1, set: 'cleanup', color: '#e03131' },
  ihwca: { label: 'Industrial & hazardous waste cleanup (TCEQ IHWCA)', short: 'Hazardous waste cleanup', url: TCEQ + 'Public/IHWCA/MapServer/0', f: { ...tceqF, id: 'IHWCA_ID' }, mi: 1, set: 'cleanup', color: '#862e9c' },
  vcp: { label: 'Voluntary cleanup (TCEQ VCP)', short: 'Voluntary cleanup', url: TCEQ + 'Public/VCP/MapServer/0', f: { ...tceqF, id: 'VCP_ID' }, mi: 0.5, set: 'cleanup', color: '#1c7ed6' },
  brownfield: { label: 'Brownfield (TCEQ)', short: 'Brownfield', url: TCEQ + 'Public/Brownfield/MapServer/0', f: { ...tceqF, id: 'BSA_ID' }, mi: 0.5, set: 'cleanup', color: '#5c940d' },
  epa_bf: { label: 'Brownfield (EPA)', short: 'EPA brownfield', url: EPA + '5', f: { ...epaF, id: 'registry_id' }, mi: 0.5, set: 'cleanup', color: '#74b816' },
  drycleaner: { label: 'Dry cleaner cleanup (TCEQ)', short: 'Dry cleaner cleanup', url: TCEQ + 'Public/DryCleaner/MapServer/0', f: { ...tceqF, id: 'DCRP_ID' }, mi: 0.5, set: 'cleanup', color: '#ae3ec9' },
  lpst: { label: 'Leaking petroleum storage tank (TCEQ LPST)', short: 'Leaking tank', url: TCEQ + 'Public/LPST/MapServer/0', f: { ...tceqF, id: 'LPST_ID' }, mi: 0.5, set: 'cleanup', color: '#e8590c' },
  landfill: { label: 'Active landfill (TCEQ)', short: 'Landfill', url: TCEQ + 'Public/Landfills/MapServer/0', f: { name: 'FACILITY_N', addr: 'ADDRESS', city: 'COUNTY', id: 'PERMIT_NUM', type: 'LANDFILL_T' }, mi: 0.5, set: 'cleanup', color: '#795548' },
  msd: { label: 'Groundwater use restricted (TCEQ Municipal Setting Designation)', short: 'Groundwater restriction', url: TCEQ + 'Public/MSD_Polys/MapServer/0', f: { ...tceqF, id: 'MSD_ID' }, mi: 0.5, set: 'cleanup', color: '#0b7285', poly: true },
  pst: { label: 'Registered petroleum storage tanks (TCEQ PST)', short: 'Storage tanks', url: TCEQ + 'Public/PST/MapServer/0', f: { name: 'FACILITY_NAME', addr: 'ADDRESS', city: 'CITY', id: 'FAC_ID', n: 'NUM_ACTIVE_UST' }, mi: 0.25, set: 'tanks', color: '#f59f00' },
  rcra: { label: 'Hazardous waste handler (EPA RCRA)', short: 'Hazardous waste handler', url: EPA + '4', f: { ...epaF, id: 'registry_id' }, mi: 0.25, set: 'epa', color: '#9c36b5' },
  tri: { label: 'Toxic release reporter (EPA TRI)', short: 'Toxic releases', url: EPA + '1', f: { ...epaF, id: 'registry_id' }, mi: 0.5, set: 'epa', color: '#f76707' },
  air: { label: 'Air emissions permit (EPA)', short: 'Air permit', url: EPA + '3', f: { ...epaF, id: 'registry_id' }, mi: 0.25, set: 'epa', color: '#868e96' },
  water: { label: 'Water discharge permit (EPA)', short: 'Water discharge', url: EPA + '2', f: { ...epaF, id: 'registry_id' }, mi: 0.25, set: 'epa', color: '#4dabf7' },
  wells: { label: 'Oil & gas wells (Railroad Commission)', short: 'Oil & gas well', url: RRC + '/1', f: { name: 'GIS_SYMBOL_DESCRIPTION', id: 'API' }, mi: 0.25, set: 'oilgas', color: '#212529' },
  orphan: { label: 'Orphan wells (Railroad Commission)', short: 'Orphan well', url: RRC + '/2', f: { id: 'API' }, mi: 0.5, set: 'oilgas', color: '#c92a2a' },
  pipelines: { label: 'Pipelines (Railroad Commission)', short: 'Pipeline', url: RRC + '/13', f: { name: 'OPERATOR', id: 'T4PERMIT', commodity: 'COMMODITY_DESCRIPTION', system: 'SYSTEM_NAME', diameter: 'DIAMETER', status: 'STATUS', interstate: 'INTERSTATE' }, mi: 0.25, set: 'oilgas', color: '#d6336c', line: true },
  wetlands: { label: 'Wetlands (US Fish & Wildlife Service)', short: 'Wetland', url: NWI + '/0', f: { name: 'Wetlands.WETLAND_TYPE', id: 'Wetlands.ATTRIBUTE', acres: 'Wetlands.ACRES' }, mi: 0.1, set: 'wetlands', color: '#1098ad', poly: true }
};
export const SETS = { cleanup: 'Contamination & cleanup sites', tanks: 'Petroleum storage tanks', epa: 'EPA-permitted facilities' };
export const kindsIn = set => Object.keys(KINDS).filter(k => set === 'all' ? ['cleanup', 'tanks', 'epa'].includes(KINDS[k].set) : KINDS[k].set === set);

// ---------- geometry (planar in miles around the site; fine within a few miles) ----------
const MI_PER_DEG = 69.17;
export const projector = lat0 => { const k = Math.cos(lat0 * Math.PI / 180); return ([x, y]) => [x * MI_PER_DEG * k, y * MI_PER_DEG]; };
export const rings = g => !g ? [] : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : g.rings || [];
export const paths = g => !g ? [] : g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : g.paths || [];
export function inRings(p, rs) {
  let c = false;
  for (const r of rs) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; }
  return c;
}
const segPt = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const cross = (a, b, c, d) => { const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b); };
const segs = lines => lines.flatMap(l => l.slice(1).map((p, i) => [l[i], p]));
// the site's center and the distance (miles) from it to its farthest corner
export function siteExtent(site) {
  const rs = rings(site), pts = rs.flat(); if (!pts.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const c = [(x0 + x1) / 2, (y0 + y1) / 2], pr = projector(c[1]), pc = pr(c);
  return { center: c, radius: Math.max(...pts.map(p => { const q = pr(p); return Math.hypot(q[0] - pc[0], q[1] - pc[1]); })), bbox: [x0, y0, x1, y1] };
}
// distance in miles from the site (polygon) to a feature: GeoJSON-ish { x, y } point, { rings } polygon or { paths } line; 0 when they touch
export function distanceMi(site, geom) {
  const sr = rings(site); if (!sr.length || !geom) return null;
  const pr = projector(sr[0][0][1]), S = sr.map(r => r.map(pr)), sSegs = segs(S);
  if (geom.x != null) { const p = pr([geom.x, geom.y]); return inRings(p, S) ? 0 : Math.min(...sSegs.map(([a, b]) => segPt(p, a, b))); }
  const fr = rings(geom).map(r => r.map(pr)), fl = paths(geom).map(l => l.map(pr)), fSegs = segs(fr.length ? fr : fl);
  if (!fSegs.length) return null;
  if (fr.length && S.some(r => r.some(p => inRings(p, fr)))) return 0; // site inside the feature
  if (fSegs.some(([a]) => inRings(a, S))) return 0; // feature inside / crossing into the site
  let best = Infinity;
  for (const [a, b] of fSegs) for (const [c, d] of sSegs) { if (cross(a, b, c, d)) return 0; best = Math.min(best, segPt(a, c, d), segPt(b, c, d), segPt(c, a, b), segPt(d, a, b)); }
  return best;
}
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function direction(from, to) {
  const k = Math.cos(from[1] * Math.PI / 180), a = Math.atan2((to[0] - from[0]) * k, to[1] - from[1]) * 180 / Math.PI;
  return DIRS[Math.round(((a + 360) % 360) / 45) % 8];
}
export const featurePoint = g => g?.x != null ? [g.x, g.y] : (rings(g)[0] || paths(g)[0] || [])[0] || null;

// one ArcGIS feature -> a report row
export function featureRow(kind, f, site, center) {
  const K = KINDS[kind], a = f.attributes || {}, val = k => K.f[k] ? a[K.f[k]] : undefined, mi = distanceMi(site, f.geometry), pt = featurePoint(f.geometry);
  const clean = v => v == null || v === -9999 || String(v).trim() === '' ? undefined : String(v).trim();
  const row = { kind, id: clean(val('id')), name: clean(val('name')) || K.short, addr: clean(val('addr')), city: clean(val('city')), mi: mi == null ? null : Math.round(mi * 100) / 100,
    dir: pt && mi > 0 ? direction(center, pt) : undefined, url: clean(val('url')) };
  if (kind === 'pst') row.tanks = +val('n') || undefined;
  if (kind === 'landfill') row.type = clean(val('type'));
  if (kind === 'pipelines') Object.assign(row, { commodity: clean(val('commodity')), system: clean(val('system')), diameter: +val('diameter') || undefined, status: clean(val('status')), interstate: clean(val('interstate')) });
  if (kind === 'wetlands') { row.code = row.id; row.acres = +val('acres') ? Math.round(+val('acres') * 10) / 10 : undefined; row.id = undefined; }
  if (kind === 'orphan') row.name = 'Orphan well';
  return row;
}
// rows within the kind's search distance, nearest first; wells and wetlands are summarized by type too
export function summarize(kind, rows) {
  const K = KINDS[kind], keep = rows.filter(r => r.mi != null && r.mi <= K.mi + 1e-9).sort((a, b) => a.mi - b.mi);
  const dedup = []; const seen = new Set();
  for (const r of keep) { const k = kind === 'pipelines' ? [r.name, r.system, r.commodity, r.diameter].join('|') : kind === 'wetlands' ? r.code + '|' + r.acres : (r.id || r.name + '|' + r.addr); if (seen.has(k)) continue; seen.add(k); dedup.push(r); }
  const out = { kind, label: K.label, search_mi: K.mi, count: dedup.length, onsite: dedup.filter(r => r.mi === 0).length, nearest: dedup.slice(0, kind === 'wells' ? 8 : 12) };
  if (kind === 'wells' || kind === 'wetlands') { const by = {}; for (const r of dedup) by[r.name] = (by[r.name] || 0) + 1; out.by_type = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([type, n]) => ({ type, n })); }
  return out;
}

// soils (USDA Soil Data Access): map units under the site with the ratings that matter for building
export function soilsQuery(site) {
  const r = rings(site)[0]; if (!r) return null;
  const step = Math.max(1, Math.ceil(r.length / 120)), pts = r.filter((_, i) => i % step === 0); if (pts[0] !== pts[pts.length - 1]) pts.push(pts[0]);
  const wkt = 'polygon((' + pts.map(p => p[0].toFixed(6) + ' ' + p[1].toFixed(6)).join(',') + '))';
  return "SELECT mu.mukey, mu.muname, ma.drclassdcd, ma.hydgrpdcd, ma.flodfreqdcd, ma.pondfreqprs, ma.engdwbll, ma.engdwobdcd, ma.engsldcd, ma.wtdepannmin " +
    "FROM mapunit mu JOIN muaggatt ma ON ma.mukey = mu.mukey WHERE mu.mukey IN (SELECT DISTINCT mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('" + wkt + "'))";
}
export function parseSoils(d) {
  const t = d?.Table; if (!Array.isArray(t) || t.length < 2) return [];
  const h = t[0], rows = t.slice(1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
  const seen = new Map();
  for (const r of rows) { const k = r.muname; if (!seen.has(k)) seen.set(k, { name: r.muname, drainage: r.drclassdcd, hydrologic_group: r.hydgrpdcd, flooding: r.flodfreqdcd, ponding_pct: r.pondfreqprs != null ? +r.pondfreqprs : undefined,
    dwellings_with_basements: r.engdwbll, dwellings_without_basements: r.engdwobdcd, small_commercial: r.engsldcd, water_table_cm: r.wtdepannmin != null ? +r.wtdepannmin : undefined }); }
  return [...seen.values()];
}
export const SOURCES = 'Texas Commission on Environmental Quality (Superfund, IHWCA, VCP, Brownfields, Dry Cleaner Remediation, LPST, PST, Landfills, MSD); US EPA Facility Registry (Superfund NPL, TRI, RCRA, air and water permits, brownfields); Railroad Commission of Texas (wells, orphan wells, pipelines); US Fish & Wildlife Service National Wetlands Inventory; USDA NRCS Soil Survey (SSURGO).';
