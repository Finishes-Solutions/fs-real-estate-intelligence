// Utilities near a site: power lines and substations, who holds the water and sewer service areas (CCNs), and public
// water and sewer mains where a city publishes them. Shared by api/utilities.js and the tests; no network here.
//  - Power: OpenStreetMap (power=line / minor_line / cable, power=substation), through the Overpass API. High-voltage
//    lines are mapped well in Texas; neighbourhood distribution lines only in part, so "none mapped" isn't "none there".
//    (The federal HIFLD transmission-line layer was taken offline in August 2025.)
//  - Water and sewer service areas: the Public Utility Commission of Texas CCN maps (TWDB and Harris County copies),
//    plus the CCN water facility lines, the utilities' own mapped lines used for their service areas.
//  - Mains: City of Houston (Houston Public Works) sanitary gravity mains; water mains when the city's published
//    utility service has a water-main layer. Elsewhere mains sit with the city or MUD engineer.
// Distances are in feet, from the site's edge when the parcel outline is known (0 when a line crosses the site).

export const FT_PER_DEG = 364567; // feet per degree of latitude (about)

// ---------- sources (ArcGIS REST layers; each is best effort) ----------
const HCTX = 'https://www.gis.hctx.net/arcgishcpid/rest/services/State/PUC_CCN_Sewer_Water/MapServer';
export const CCN = {
  water: [HCTX + '/1', 'https://services.twdb.texas.gov/arcgis/rest/services/PWS/Public_Utility_Commission_CCN_Water/MapServer/0'],
  sewer: [HCTX + '/2'],
  waterLines: [HCTX + '/0'] // CCN water facility lines
};
// published utility services to look in for mains (a layer is picked by its name), and direct layers
export const MAINS = {
  sewer: { layers: ['https://services.arcgis.com/NummVBqZSIJKUeVR/ArcGIS/rest/services/sGravityMain/FeatureServer/0'], services: ['https://geogimsms.houstontx.gov/arcgis/rest/services/CAS/Water_Utility_Infrastructure/MapServer'], match: /gravity\s*main|sanitary|sewer\s*main|wastewater\s*main/i, owner: 'City of Houston' },
  water: { layers: [], services: ['https://geogimsms.houstontx.gov/arcgis/rest/services/CAS/Water_Utility_Infrastructure/MapServer'], match: /water\s*main|distribution\s*main|transmission\s*main|water\s*line/i, owner: 'City of Houston' }
};
// Houston-area box where the city's mains are worth asking for
export const HOUSTON_BOX = [-95.92, 29.5, -95.0, 30.13];
export const inBox = ([lon, lat], b) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];

// a published service's layers -> the polyline layer whose name matches
export function pickLayer(layers, match) {
  const L = (layers || []).filter(l => /polyline/i.test(l.geometryType || '') || l.geometryType == null).filter(l => match.test(l.name || ''));
  return L.sort((a, b) => /label|anno/i.test(a.name) - /label|anno/i.test(b.name) || (a.name || '').length - (b.name || '').length)[0] || null;
}

// ---------- geometry ----------
// a local flat frame in feet around a point: [lon, lat] -> [x, y]
export function frameAt([lon0, lat0]) {
  const kx = FT_PER_DEG * Math.cos(lat0 * Math.PI / 180);
  return p => [(p[0] - lon0) * kx, (p[1] - lat0) * FT_PER_DEG];
}
const segDist = ([px, py], [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0; return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
const cross = (a, b, c, d) => { const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; };
const inRing = ([x, y], r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c; };
// the site as rings in feet (a point is a ring of one)
export function siteShape(center, geometry) {
  const f = frameAt(center);
  const polys = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : null;
  return { f, rings: polys ? polys.map(p => p[0].map(f)) : [[f(center)]] };
}
// shortest distance (ft) from the site to a polyline given as [[lon, lat], …] (or several paths)
export function distToPaths(site, paths) {
  let best = Infinity;
  for (const path of paths) {
    const P = path.map(site.f); if (!P.length) continue;
    for (const R of site.rings) {
      if (R.length > 2 && P.some(p => inRing(p, R))) return 0;
      for (let i = 0; i < R.length; i++) {
        const a = R[i], b = R[(i + 1) % R.length];
        for (let k = 0; k + 1 < P.length; k++) { if (R.length > 1 && cross(a, b, P[k], P[k + 1])) return 0; best = Math.min(best, segDist(a, P[k], P[k + 1])); }
        if (P.length === 1) best = Math.min(best, Math.hypot(a[0] - P[0][0], a[1] - P[0][1]));
        if (R.length > 1) for (const p of P) best = Math.min(best, segDist(p, a, b));
      }
    }
  }
  return best;
}
export function distToPoint(site, pt) { return distToPaths(site, [[pt]]); }

// ---------- power (OpenStreetMap) ----------
export function powerQuery(lat, lon, lineM = 800, subM = 8000) {
  return '[out:json][timeout:20];(way["power"~"^(line|minor_line|cable)$"](around:' + lineM + ',' + lat + ',' + lon + '););out tags geom;' +
    '(nwr["power"="substation"](around:' + subM + ',' + lat + ',' + lon + '););out tags center;';
}
export function powerBoxQuery([w, s, e, n], minor = true) {
  const bb = [s, w, n, e].map(v => +(+v).toFixed(5)).join(',');
  return '[out:json][timeout:20];(way["power"~"^(line' + (minor ? '|minor_line|cable' : '|cable') + ')$"](' + bb + '););out tags geom;(nwr["power"="substation"](' + bb + '););out tags center;';
}
// "138000;69000" -> 138 (kV); "12.47 kV" -> 12.47
export function kvOf(v) {
  const n = String(v || '').split(/[;,/]/).map(s => parseFloat(s)).filter(x => x > 0).map(x => x >= 1000 ? x / 1000 : x);
  return n.length ? Math.max(...n) : null;
}
export function lineClass(t = {}) {
  const kv = kvOf(t.voltage);
  if (t.power === 'cable') return { cls: 'cable', label: 'Underground power cable', kv };
  if (t.power === 'minor_line' || (kv != null && kv < 35)) return { cls: 'distribution', label: 'Distribution line', kv };
  return { cls: 'transmission', label: 'Transmission line', kv };
}
const kvText = kv => kv == null ? '' : (kv >= 10 ? Math.round(kv) : +kv.toFixed(1)) + ' kV';
export function parsePower(elements, site) {
  const lines = [], subs = [];
  for (const e of elements || []) {
    const t = e.tags || {};
    if (t.power === 'substation') {
      const c = e.center || (e.lat != null ? { lat: e.lat, lon: e.lon } : null); if (!c) continue;
      subs.push({ name: t.name || 'Substation', operator: t.operator || null, kv: kvOf(t.voltage), ft: Math.round(distToPoint(site, [c.lon, c.lat])), lon: c.lon, lat: c.lat });
    } else if (e.geometry?.length) {
      const c = lineClass(t), path = e.geometry.map(g => [g.lon, g.lat]);
      lines.push({ ...c, kvText: kvText(c.kv), operator: t.operator || null, name: t.name || t.ref || null, ft: Math.round(distToPaths(site, [path])), id: e.id });
    }
  }
  lines.sort((a, b) => a.ft - b.ft); subs.sort((a, b) => a.ft - b.ft);
  const nearest = {}; for (const l of lines) nearest[l.cls] ??= l;
  return { nearest, lines: lines.slice(0, 8), substations: subs.slice(0, 3) };
}
// map layer: OSM elements -> GeoJSON features (k: transmission | distribution | cable | substation)
export function powerFeatures(elements) {
  const out = [];
  for (const e of elements || []) {
    const t = e.tags || {};
    if (t.power === 'substation') { const c = e.center || (e.lat != null ? { lat: e.lat, lon: e.lon } : null); if (c) out.push({ type: 'Feature', properties: { k: 'substation', n: t.name || 'Substation', o: t.operator || '', kv: kvOf(t.voltage) }, geometry: { type: 'Point', coordinates: [+c.lon.toFixed(6), +c.lat.toFixed(6)] } }); continue; }
    if (!e.geometry?.length) continue;
    const c = lineClass(t); out.push({ type: 'Feature', properties: { k: c.cls, kv: c.kv, o: t.operator || '', n: t.name || '' }, geometry: { type: 'LineString', coordinates: e.geometry.map(g => [+g.lon.toFixed(6), +g.lat.toFixed(6)]) } });
  }
  return out;
}

// ---------- ArcGIS results: service areas and mains ----------
const pick = (a, re) => { for (const [k, v] of Object.entries(a || {})) if (re.test(k) && v != null && String(v).trim() !== '') return v; return null; };
const title = s => String(s || '').trim().replace(/\s+/g, ' ').replace(/\b([A-Z])([A-Z']+)\b/g, (m, a, b) => /^(MUD|WCID|FWSD|SUD|WSC|LLC|LP|INC|LTD|USA|II|III|IV)$/.test(m) ? m : a + b.toLowerCase());
// CCN service areas: utility name and CCN number (a CCN starting with 1 is water, 2 sewer)
export function parseCCN(features) {
  const seen = new Set(), out = [];
  for (const f of features || []) {
    const a = f.attributes || {}, no = pick(a, /^ccn_?(no|num|number)?$/i) ?? pick(a, /ccn/i), name = pick(a, /^(utility|utility_?name|utl_?name|name|ccn_?name|owner)$/i);
    const key = String(no || name); if (seen.has(key)) continue; seen.add(key);
    const typ = pick(a, /^type$/i), kind = /sewer|waste/i.test(typ || '') || /^2/.test(String(no || '')) ? 'sewer' : /water/i.test(typ || '') || /^1/.test(String(no || '')) ? 'water' : null;
    out.push({ utility: name ? title(name) : null, ccn: no != null ? String(no) : null, kind, county: pick(a, /^county$/i) });
  }
  return out;
}
// polylines from ArcGIS (paths in lon/lat) with their nearest distance, size and material
// a pipe's size (inches), material, owner and name from whatever the layer calls them
export function pipeInfo(a = {}, owner = null) {
  const d = pick(a, /^(diameter|diam|pipe_?diam(eter)?|pipe_?size|size|nominal_?size|nominalsize|width)$/i), m = pick(a, /^(material|pipe_?material|matl|mat|material_?code)$/i);
  return { size: d != null && +d > 0 ? +d : null, material: m != null ? String(m) : null, owner: pick(a, /^(owner|ownedby|owner_?name|maint_?by)$/i) || owner || null, name: pick(a, /^(utility|utility_?name|name)$/i) };
}
export function parseMains(features, site, owner) {
  const out = [];
  for (const f of features || []) { const paths = f.geometry?.paths; if (paths?.length) out.push({ ft: Math.round(distToPaths(site, paths)), ...pipeInfo(f.attributes, owner) }); }
  return out.sort((x, y) => x.ft - y.ft);
}
// pipe size in inches: 8 -> '8"', 48 -> '4 ft'
export const sizeText = s => s ? (s >= 36 ? +(s / 12).toFixed(1) + ' ft' : s + '"') : '';
export const distText = ft => ft == null || !isFinite(ft) ? '' : ft === 0 ? 'on the site' : ft < 1000 ? Math.round(ft / 5) * 5 + ' ft' : (ft / 5280).toFixed(ft < 5280 * 10 ? 2 : 1) + ' mi';

// one-line facts for the property card and the site plan sheet
export function summaryLines(d) {
  const out = [], p = d.power || {}, n = p.nearest || {};
  const ln = l => (l.kvText ? l.kvText + ' ' : '') + l.label.toLowerCase() + (l.operator ? ' (' + l.operator + ')' : '') + ', ' + distText(l.ft);
  if (n.transmission) out.push('Nearest mapped ' + ln(n.transmission));
  if (n.distribution) out.push('Nearest mapped ' + ln(n.distribution));
  if (!n.transmission && !n.distribution && p.lines && !p.error) out.push('No power lines mapped within ' + distText(p.searchedFt || 2640) + ' (street distribution lines are often unmapped).');
  if (p.substations?.[0]) out.push('Nearest substation: ' + (p.substations[0].name || 'Substation') + (p.substations[0].operator ? ' (' + p.substations[0].operator + ')' : '') + ', ' + distText(p.substations[0].ft));
  const prov = k => (d[k]?.ccn || []).filter(c => c.utility || c.ccn).map(c => (c.utility || 'CCN') + (c.ccn ? ' (CCN ' + c.ccn + ')' : '')).join(', ');
  if (d.water && !d.water.error) out.push(prov('water') ? 'Water service area: ' + prov('water') : 'No water CCN here (often a city or MUD that holds no CCN).');
  if (d.sewer && !d.sewer.error) out.push(prov('sewer') ? 'Sewer service area: ' + prov('sewer') : 'No sewer CCN here (often a city or MUD).');
  const m = (k, w) => { const x = d[k]?.mains?.[0]; if (x) out.push('Nearest ' + w + ' main: ' + [sizeText(x.size), x.material].filter(Boolean).join(' ') + (x.size || x.material ? ', ' : '') + distText(x.ft) + (x.owner ? ' (' + x.owner + ')' : '')); };
  m('water', 'public water'); m('sewer', 'public sewer');
  const fl = d.water?.lines?.[0]; if (fl && !d.water?.mains?.length) out.push('Nearest mapped water utility line (CCN facility line): ' + distText(fl.ft) + (fl.name ? ' (' + title(fl.name) + ')' : ''));
  return out;
}
export const SOURCES = 'OpenStreetMap contributors (power lines and substations); Public Utility Commission of Texas CCN maps via Harris County and the Texas Water Development Board (water and sewer service areas, water facility lines); City of Houston, Houston Public Works (public sewer and water mains, where published).';
