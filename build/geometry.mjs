// Base map geometry: county outlines + dot grids, ring counties, Texas and world dot grids, places gazetteer.
// Rebuilt only when regions.json changes (or REBUILD_GEO=1), since none of it changes week to week.
import { geoContains, geoArea, geoCentroid } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import { fetchRetry, log } from './util.mjs';

export function rewind(g) { // d3 wants clockwise exterior rings
  const fix = poly => { const p = { type: 'Polygon', coordinates: poly }; return geoArea(p) > 2 * Math.PI ? poly.map(r => r.slice().reverse()) : poly; };
  return g.type === 'Polygon' ? { type: 'MultiPolygon', coordinates: [fix(g.coordinates)] } : { type: 'MultiPolygon', coordinates: g.coordinates.map(fix) };
}
export const round = c => Array.isArray(c[0]) ? c.map(round) : [Math.round(c[0] * 1e4) / 1e4, Math.round(c[1] * 1e4) / 1e4];
const round5 = c => Array.isArray(c[0]) ? c.map(round5) : [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5];

// County outlines from the Census TIGER/Line boundaries (the legal lines, meter-accurate) via TIGERweb.
// offset = simplification tolerance in degrees (0.00002 ≈ 2 m). Returns { fips: Feature } for what it got.
const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query';
export async function tigerCounties(fips, { offset = 0.00002, digits = 5, batch = 10 } = {}) {
  const out = {};
  for (let i = 0; i < fips.length; i += batch) {
    const chunk = fips.slice(i, i + batch);
    const q = new URLSearchParams({ where: 'GEOID IN (' + chunk.map(f => "'" + f + "'").join(',') + ')', outFields: 'GEOID,NAME', outSR: '4326', f: 'geojson', returnGeometry: 'true', maxAllowableOffset: String(offset), geometryPrecision: String(digits) });
    try {
      const d = await (await fetchRetry(TIGER + '?' + q, {}, 3)).json();
      for (const f of d.features || []) { const id = f.properties?.GEOID; if (chunk.includes(id) && /Polygon/.test(f.geometry?.type || '')) out[id] = { type: 'Feature', id, properties: { NAME: f.properties.NAME }, geometry: f.geometry }; }
    } catch (e) { log('tigerweb counties failed:', e.message); }
  }
  return out;
}
function bounds(g) { let x0 = 180, y0 = 90, x1 = -180, y1 = -90; const walk = c => { if (typeof c[0] === 'number') { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); } else c.forEach(walk); }; walk(g.coordinates); return [x0, y0, x1, y1]; }
function grid(geom, step) {
  const out = []; const b = bounds(geom);
  for (let lat = Math.floor(b[1] / step) * step; lat <= b[3]; lat += step) {
    const ls = step / Math.max(Math.cos(lat * Math.PI / 180), 0.15);
    for (let lon = Math.floor(b[0] / ls) * ls; lon <= b[2]; lon += ls) if (geoContains(geom, [lon, lat])) out.push([Math.round(lon * 1e3) / 1e3, Math.round(lat * 1e3) / 1e3]);
  }
  return out;
}
export function minVertexDist(g, pt) { let m = 9; const walk = c => { if (typeof c[0] === 'number') m = Math.min(m, Math.hypot(c[0] - pt[0], c[1] - pt[1])); else c.forEach(walk); }; walk(g.coordinates); return m; }

export async function buildGeo(regions) {
  const bbox = regions.bbox, inBox = c => c && c[0] > bbox[0] && c[0] < bbox[2] && c[1] > bbox[1] && c[1] < bbox[3];
  // accurate TIGER/Line outlines: home counties at ~2 m, the ring around them at ~20 m; the coarse Plotly file only fills gaps
  const home = await tigerCounties(regions.counties.map(c => c.fips)), ring = await tigerCounties(regions.ring, { offset: 0.0002, digits: 4 });
  let byFips = { ...ring, ...home };
  const missing = [...regions.counties.map(c => c.fips), ...regions.ring].filter(f => !byFips[f]);
  if (missing.length) {
    log('county outlines: TIGERweb missing', missing.length, '- using the 1:20m fallback for', missing.join(','));
    const cj = await (await fetchRetry('https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json')).json();
    for (const f of cj.features) if (missing.includes(f.id)) byFips[f.id] = f;
  } else log('county outlines: TIGER/Line for', Object.keys(byFips).length, 'counties');
  const states = await (await fetchRetry('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json')).json();
  const texas = rewind(feature(states, states.objects.states).features.find(f => f.properties.name === 'Texas').geometry);
  const world = await (await fetchRetry('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json')).json();
  const land = feature(world, world.objects.land);
  const landGeom = land.features ? { type: 'MultiPolygon', coordinates: land.features.flatMap(f => rewind(f.geometry).coordinates) } : rewind(land.geometry);
  let places = [];
  try {
    const t = await (await fetchRetry('https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_gaz_place_48.txt')).text();
    const rows = t.split('\n').map(l => l.split('\t').map(s => s.trim())); const h = rows[0];
    const iN = h.indexOf('NAME'), iLa = h.indexOf('INTPTLAT'), iLo = h.indexOf('INTPTLONG');
    places = rows.slice(1).filter(r => r.length > iLo).map(r => [r[iN].replace(/ (city|town|CDP|village)$/, ''), +(+r[iLo]).toFixed(5), +(+r[iLa]).toFixed(5)]).filter(p => inBox([p[1], p[2]]));
  } catch (e) { log('places failed', e.message); }
  log('geometry built');
  return assembleGeo(regions, byFips, texas, landGeom, places);
}

// pure part, also used by test/fixture.mjs
export function assembleGeo(regions, byFips, texas, landGeom, places) {
  const counties = regions.counties.map(c => ({ name: c.name, geom: rewind(byFips[c.fips].geometry) }));
  return {
    home: regions.home,
    counties: counties.map(c => ({ name: c.name, outline: round5(c.geom.coordinates), label: geoCentroid(c.geom).map(v => Math.round(v * 1e3) / 1e3), dots: grid(c.geom, 0.02) })),
    ring: regions.ring.filter(f => byFips[f]).map(f => ({ name: byFips[f].properties.NAME, outline: round(rewind(byFips[f].geometry).coordinates) })),
    texas: grid(texas, 0.1), land: grid(landGeom, 1.0), places, roads: {}
  };
}

// County and state lines for the whole US (data/uscounties.json), drawn under the home counties' own accurate outlines.
// Census cartographic boundaries at 1:10m (us-atlas): good from the national view down to city level; the browser swaps in
// exact TIGER/Line lines from /api/counties when zoomed in closer. Each shared border is stored once (a topojson mesh).
const ST = { '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS',
  '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY',
  '60': 'AS', '66': 'GU', '69': 'MP', '72': 'PR', '78': 'VI' };
// "Harris Co., TX", "Orleans Par., LA"; Alaska boroughs, Virginia's independent cities and the territories keep their plain name
export function countyLabel(name, fips) {
  const s = fips.slice(0, 2), st = ST[s] || '';
  if (s === '22') return name + ' Par., ' + st;
  if (s === '02' || +s >= 60 || (s === '51' && +fips.slice(2) >= 500)) return name + ', ' + st;
  return name + ' Co., ' + st;
}
// pure part: us-atlas topology → { lines, states, labels }; `homeFips` counties are left out (the app draws them itself)
export function shapeUsCounties(topo, homeFips = []) {
  const home = new Set(homeFips.map(String)), isHome = g => home.has(String(g.id));
  const lines = mesh(topo, topo.objects.counties, (a, b) => a !== b && !isHome(a) && !isHome(b));
  const states = mesh(topo, topo.objects.states, (a, b) => a !== b);
  const labels = feature(topo, topo.objects.counties).features.filter(f => !isHome(f) && f.geometry)
    .map(f => { const [x, y] = geoCentroid(f); return [countyLabel(f.properties.name, String(f.id)), Math.round(x * 1e3) / 1e3, Math.round(y * 1e3) / 1e3]; })
    .filter(l => isFinite(l[1]) && isFinite(l[2]));
  const r4 = ls => ls.map(l => l.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]));
  return { v: 1, source: 'US Census cartographic boundaries 1:10m (us-atlas)', lines: r4(lines.coordinates), states: r4(states.coordinates), labels };
}
export async function buildUsCounties(regions) {
  let topo;
  try { topo = (await import('us-atlas/counties-10m.json', { with: { type: 'json' } })).default; }
  catch { topo = await (await fetchRetry('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json')).json(); }
  const out = shapeUsCounties(topo, regions.counties.map(c => c.fips));
  log('us counties:', out.labels.length, 'counties,', out.lines.length, 'border lines');
  return out;
}
