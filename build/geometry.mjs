// Base map geometry: county outlines + dot grids, ring counties, Texas and world dot grids, places gazetteer.
// Rebuilt only when regions.json changes (or REBUILD_GEO=1), since none of it changes week to week.
import { geoContains, geoArea, geoCentroid } from 'd3-geo';
import { feature } from 'topojson-client';
import { fetchRetry, log } from './util.mjs';

export function rewind(g) { // d3 wants clockwise exterior rings
  const fix = poly => { const p = { type: 'Polygon', coordinates: poly }; return geoArea(p) > 2 * Math.PI ? poly.map(r => r.slice().reverse()) : poly; };
  return g.type === 'Polygon' ? { type: 'MultiPolygon', coordinates: [fix(g.coordinates)] } : { type: 'MultiPolygon', coordinates: g.coordinates.map(fix) };
}
export const round = c => Array.isArray(c[0]) ? c.map(round) : [Math.round(c[0] * 1e4) / 1e4, Math.round(c[1] * 1e4) / 1e4];
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
  const cj = await (await fetchRetry('https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json')).json();
  const byFips = Object.fromEntries(cj.features.filter(f => f.id.startsWith('48')).map(f => [f.id, f]));
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
    counties: counties.map(c => ({ name: c.name, outline: round(c.geom.coordinates), label: geoCentroid(c.geom).map(v => Math.round(v * 1e3) / 1e3), dots: grid(c.geom, 0.02) })),
    ring: regions.ring.filter(f => byFips[f]).map(f => ({ name: byFips[f].properties.NAME, outline: round(rewind(byFips[f].geometry).coordinates) })),
    texas: grid(texas, 0.1), land: grid(landGeom, 1.0), places, roads: {}
  };
}
