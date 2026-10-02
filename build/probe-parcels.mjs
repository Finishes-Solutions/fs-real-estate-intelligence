// Diagnostic: how to query the StratMap parcel layer by address. Run in Actions (workflow "Probe services").
import fs from 'node:fs';
import { splitStreet } from './geocode.mjs';
const L = process.env.PARCEL_SERVICE || 'https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer/0';
const meta = await (await fetch(L + '?f=json')).json();
console.log('objectIdField', meta.objectIdField, '| maxRecordCount', meta.maxRecordCount, '| advanced', JSON.stringify(meta.advancedQueryCapabilities || {}).slice(0, 300));
console.log('fields', (meta.fields || []).map(f => f.name + ':' + f.type.replace('esriFieldType', '')).join(', '));
const filings = JSON.parse(fs.readFileSync('data/filings.json', 'utf8')).filings.filter(f => !f.approx && /^\d+\s/.test(f.addr)).slice(0, 400).filter((f, i) => i % 50 === 0);
const q = s => String(s).replace(/'/g, "''");
async function run(label, params) {
  const t = Date.now(), p = new URLSearchParams({ f: 'json', ...params });
  try { const d = await (await fetch(L + '/query?' + p)).json();
    console.log('  ' + label.padEnd(14), (Date.now() - t + 'ms').padStart(7), d.error ? 'ERROR ' + JSON.stringify(d.error).slice(0, 160) : (d.features || []).length + ' hits ' + JSON.stringify((d.features || []).slice(0, 2).map(x => x.attributes)).slice(0, 200)); }
  catch (e) { console.log('  ' + label, 'FAIL', e.message); }
}
console.log('capabilities', meta.capabilities, '| supportsAdvancedQueries', meta.supportsAdvancedQueries);
for (const f of filings) {
  const before = f.addr.split(/,\s*TX/i)[0], i = before.toLowerCase().lastIndexOf((f.city || '').toLowerCase()), st = (i > 0 ? before.slice(0, i) : before).trim(), zip = (f.addr.match(/\b(7\d{4})\b/) || [])[1] || '', s = splitStreet(st);
  console.log(f.id, '|', st, '| num', s?.num, 'core', s?.core, 'zip', zip, '| our point', f.lat, f.lon, f.gp || '');
  const w = s ? s.core.split(' ')[0] : 'X';
  await run('point', { geometry: f.lon + ',' + f.lat, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'situs_addr,situs_zip', returnGeometry: 'false' });
  await run('where 1=1', { where: '1=1', outFields: 'situs_addr', returnGeometry: 'false', resultRecordCount: '1' });
  if (!s || !zip) continue;
  await run('where nogeom', { where: `situs_zip = '${zip}' AND situs_num = '${q(s.num)}'`, outFields: 'situs_addr,situs_zip', returnGeometry: 'false' });
  await run('where+env', { where: `situs_num = '${q(s.num)}'`, geometry: [f.lon - .02, f.lat - .02, f.lon + .02, f.lat + .02].join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'situs_addr,situs_zip', returnGeometry: 'false' });
  await run('where+geom', { where: `situs_zip = '${zip}' AND situs_num = '${q(s.num)}' AND situs_stre LIKE '%${q(w)}%'`, outFields: 'situs_addr', returnGeometry: 'true', outSR: '4326' });
}
