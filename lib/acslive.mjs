// Census tracts with their ACS 5-year figures for anywhere in the US, fetched live: the Area Report's rings outside the
// region the app holds tract data for (data/market.json). Tract outlines from TIGERweb, figures from the Census API
// (CENSUS_KEY when set; it works without one at a lower rate). The tracts come back in data/market.json's shape so the
// same roll-up (lib/demographics.mjs) and report (lib/reports/rings.mjs) use them. Server only (network).
//   liveTracts([lon, lat], mi, { year }) -> [{ g, pop, inc, hu, vac, rent, val, age, hh, ib, geom }]
const TRACTS = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/0/query';
const ACS = year => 'https://api.census.gov/data/' + year + '/acs/acs5';
const UA = { 'User-Agent': 'RealEstateIntelligence/1.0 (area report)' };
// the figures asked for, and how each lands on a tract (B19001_002..017: households by income, the 16 brackets)
export const VARS = { B01003_001E: 'pop', B19013_001E: 'inc', B25001_001E: 'hu', B25002_003E: 'vac', B25064_001E: 'rent', B25077_001E: 'val', B01002_001E: 'age', B11001_001E: 'hh' };
const IB = Array.from({ length: 16 }, (_, i) => 'B19001_' + String(i + 2).padStart(3, '0') + 'E');
// the Census API's "no estimate" codes are large negative numbers
export const val = v => { const n = +v; return Number.isFinite(n) && n > -100000 ? n : null; };

// one row of the Census API's table (header, row) -> a tract's figures
export function acsRow(head, row) {
  const at = k => row[head.indexOf(k)], t = { g: String(at('state')) + at('county') + at('tract') };
  for (const [k, name] of Object.entries(VARS)) t[name] = val(at(k));
  t.ib = IB.map(k => val(at(k)) || 0);
  return t;
}
async function json(url, ms = 20000) { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(new URL(url).host + ' ' + r.status); return r.json(); }

// tract outlines within mi of c (an envelope round the circle), every page
export async function tractShapes([lon, lat], mi) {
  const dLat = mi / 69, dLon = mi / (69 * Math.cos(lat * Math.PI / 180)), out = [];
  for (let offset = 0; offset < 5000; offset += 1000) {
    const q = new URLSearchParams({ f: 'json', geometry: [lon - dLon, lat - dLat, lon + dLon, lat + dLat].join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: 'GEOID,STATE,COUNTY', returnGeometry: 'true', maxAllowableOffset: '0.0003', geometryPrecision: '5', resultOffset: String(offset), resultRecordCount: '1000' });
    const d = await json(TRACTS + '?' + q); if (d.error) throw new Error(d.error.message || 'TIGERweb error');
    for (const f of d.features || []) if (f.geometry?.rings?.length) out.push({ g: f.attributes.GEOID, state: f.attributes.STATE, county: f.attributes.COUNTY, geom: { type: 'Polygon', coordinates: f.geometry.rings } });
    if (!d.exceededTransferLimit) break;
  }
  return out;
}
export async function liveTracts(c, mi, { year = 2024, key = process.env.CENSUS_KEY } = {}) {
  const shapes = await tractShapes(c, mi), counties = [...new Set(shapes.map(s => s.state + '|' + s.county))], figures = new Map();
  await Promise.all(counties.map(async sc => { const [st, co] = sc.split('|');
    const q = new URLSearchParams({ get: Object.keys(VARS).concat(IB).join(','), for: 'tract:*', in: 'state:' + st + ' county:' + co, ...(key ? { key } : {}) });
    const d = await json(ACS(year) + '?' + q); const head = d[0]; for (const row of d.slice(1)) { const t = acsRow(head, row); figures.set(t.g, t); } }));
  return shapes.map(s => figures.has(s.g) ? { ...figures.get(s.g), geom: s.geom } : null).filter(Boolean);
}
