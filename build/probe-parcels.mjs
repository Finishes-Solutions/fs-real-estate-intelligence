// Diagnostic: how to query the StratMap parcel layer by address. Run in Actions (workflow "Probe services").
import fs from 'node:fs';
import { splitStreet } from './geocode.mjs';
const L = process.env.PARCEL_SERVICE || 'https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer/0';
const meta = await (await fetch(L + '?f=json')).json();
console.log('objectIdField', meta.objectIdField, '| maxRecordCount', meta.maxRecordCount, '| advanced', JSON.stringify(meta.advancedQueryCapabilities || {}).slice(0, 300));
console.log('fields', (meta.fields || []).map(f => f.name + ':' + f.type.replace('esriFieldType', '')).join(', '));
const filings = JSON.parse(fs.readFileSync('data/filings.json', 'utf8')).filings.filter(f => !f.approx && /^\d+\s/.test(f.addr)).slice(0, 400).filter((f, i) => i % 50 === 0);
const q = s => String(s).replace(/'/g, "''");
async function run(label, where) {
  const t = Date.now(), p = new URLSearchParams({ where, outFields: 'situs_addr,situs_zip,situs_city', returnGeometry: 'true', outSR: '4326', geometryPrecision: '6', maxAllowableOffset: '0.0001', resultRecordCount: '6', f: 'json' });
  try { const d = await (await fetch(L + '/query?' + p)).json();
    console.log('  ' + label.padEnd(10), (Date.now() - t + 'ms').padStart(7), d.error ? 'ERROR ' + JSON.stringify(d.error).slice(0, 200) : (d.features || []).length + ' hits ' + JSON.stringify((d.features || []).slice(0, 2).map(x => x.attributes)).slice(0, 160)); }
  catch (e) { console.log('  ' + label, 'FAIL', e.message); }
}
for (const f of filings) {
  const st = f.addr.split(/\s(?=[A-Za-z .'-]+,?\s*(?:TX|Texas))/)[0], zip = (f.addr.match(/\b(7\d{4})\b/) || [])[1] || '', s = splitStreet(st);
  console.log(f.id, '|', f.addr, '| num', s?.num, 'core', s?.core, 'zip', zip, '| our point', f.lat, f.lon, f.gp || '');
  if (!s || !zip) continue;
  const w = s.core.split(' ')[0];
  await run('A upper', `UPPER(situs_addr) LIKE '${q(s.num)} %${q(w)}%' AND situs_zip LIKE '${zip}%'`);
  await run('B num+zip', `situs_num = '${q(s.num)}' AND situs_zip = '${zip}' AND situs_stre LIKE '%${q(w)}%'`);
  await run('C addr', `situs_addr LIKE '${q(s.num)} %${q(w)}%' AND situs_zip = '${zip}'`);
}
