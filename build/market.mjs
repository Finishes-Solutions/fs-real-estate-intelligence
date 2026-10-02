// Market context: Census ACS 5-year tract demographics + simplified tract outlines (TIGERweb).
// Refreshed when the newest ACS year changes or the file is missing; failures leave the old file in place.
import { fetchRetry, log } from './util.mjs';

const VARS = { pop: 'B01003_001E', inc: 'B19013_001E', hu: 'B25001_001E', vac: 'B25002_003E', rent: 'B25064_001E', val: 'B25077_001E', age: 'B01002_001E' };
const num = v => { const n = +v; return Number.isFinite(n) && n > -1e8 ? n : null; };

async function acs(year, fips, vars) {
  const out = {};
  for (const f of fips) {
    const u = `https://api.census.gov/data/${year}/acs/acs5?get=${vars.join(',')}&for=tract:*&in=state:${f.slice(0, 2)}&in=county:${f.slice(2)}` + (process.env.CENSUS_KEY ? '&key=' + process.env.CENSUS_KEY : '');
    const rows = await (await fetchRetry(u, {}, 3)).json(); const h = rows[0];
    for (const r of rows.slice(1)) { const o = Object.fromEntries(h.map((k, i) => [k, r[i]])); out[o.state + o.county + o.tract] = o; }
  }
  return out;
}

async function tracts(fips) {
  const where = `STATE='${fips[0].slice(0, 2)}' AND COUNTY IN (${fips.map(f => "'" + f.slice(2) + "'").join(',')})`, feats = [];
  for (let off = 0; ; off += 500) {
    const q = new URLSearchParams({ where, outFields: 'GEOID', returnGeometry: 'true', outSR: '4326', geometryPrecision: '4', maxAllowableOffset: '0.0008', f: 'geojson', resultOffset: String(off), resultRecordCount: '500' });
    const d = await (await fetchRetry('https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/0/query?' + q, {}, 3)).json();
    feats.push(...(d.features || [])); if ((d.features || []).length < 500) break;
  }
  return feats;
}

export async function buildMarket(regions, prev) {
  const fips = regions.counties.map(c => c.fips), now = new Date().getUTCFullYear();
  let year = null, cur = null;
  for (let y = now - 1; y >= now - 5 && !cur; y--) { try { cur = await acs(y, fips, Object.values(VARS)); year = y; } catch (e) { log('market: ACS', y, 'unavailable:', e.message.slice(0, 160)); } }
  if (!cur) throw new Error('no ACS year available');
  if (prev && prev.year === year && prev.tracts?.length && !process.env.REBUILD_MARKET) { log('market: ACS', year, 'unchanged, reusing'); return prev; }
  let base = null, baseYear = null;
  for (const y of [year - 5, year - 4, year - 3]) {
    try { const b = await acs(y, fips, [VARS.pop]); const match = Object.keys(cur).filter(g => b[g]).length; if (match / Object.keys(cur).length > 0.8) { base = b; baseYear = y; break; } } catch (e) {}
  }
  const geo = await tracts(fips);
  const out = geo.map(f => {
    const g = f.properties.GEOID, o = cur[g]; if (!o) return null;
    const v = Object.fromEntries(Object.entries(VARS).map(([k, code]) => [k, num(o[code])]));
    const bp = base && num(base[g]?.[VARS.pop]);
    return { g, ...v, vacr: v.hu ? Math.round(v.vac / v.hu * 1000) / 10 : null, gr: bp && v.pop != null ? Math.round((v.pop - bp) / bp * 1000) / 10 : null, geom: f.geometry };
  }).filter(Boolean);
  log('market: ACS', year, 'vs', baseYear, '|', out.length, 'tracts');
  return { year, baseYear, tracts: out };
}
