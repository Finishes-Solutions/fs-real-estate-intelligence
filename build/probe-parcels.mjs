// Diagnostic: which TxGIO services can be searched by address. Run in Actions (workflow "Probe services").
import fs from 'node:fs';
import { splitStreet } from './geocode.mjs';
const AP = 'https://feature.geographic.texas.gov/arcgis/rest/services/Address_Points/stratmap_address_points_48_most_recent/MapServer';
const PARCELS = 'https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer';
const j = async u => { const t = Date.now(); try { const r = await fetch(u); const d = await r.json(); return { d, ms: Date.now() - t }; } catch (e) { return { d: { error: e.message }, ms: Date.now() - t }; } };
for (const base of [AP, PARCELS]) {
  const { d } = await j(base + '?f=json');
  console.log(base.split('/services/')[1], '| capabilities', d.capabilities, '| layers', JSON.stringify((d.layers || []).map(l => l.id + ':' + l.name)).slice(0, 200));
}
const { d: m } = await j(AP + '/0?f=json');
console.log('address points layer 0:', m.name, '| capabilities', m.capabilities, '| fields', (m.fields || []).map(f => f.name).join(', '));
const filings = JSON.parse(fs.readFileSync('data/filings.json', 'utf8')).filings.filter(f => !f.approx && /^\d+\s/.test(f.addr)).slice(0, 400).filter((f, i) => i % 50 === 0);
const q = s => String(s).replace(/'/g, "''");
const F = n => (m.fields || []).map(f => f.name).find(x => n.test(x));
const num = F(/^(add_number|addnum|address_number|hse_num|st_num|add_num)/i), street = F(/^(st_name|street_name|stname|st_nam)$/i), zip = F(/^(post_code|zip|zipcode|zip_code|postal_code)/i), full = F(/^(full_addr|fulladdr|address|full_address|addr)/i);
console.log('using fields num', num, 'street', street, 'zip', zip, 'full', full);
for (const f of filings) {
  const before = f.addr.split(/,\s*TX/i)[0], i = before.toLowerCase().lastIndexOf((f.city || '').toLowerCase()), st = (i > 0 ? before.slice(0, i) : before).trim(), z = (f.addr.match(/\b(7\d{4})\b/) || [])[1] || '', s = splitStreet(st);
  if (!s || !z) continue;
  const w = s.core.split(' ')[0];
  const where = num && street ? `${num} = ${/Integer|Double/.test(((m.fields || []).find(x => x.name === num) || {}).type) ? +s.num : "'" + q(s.num) + "'"} AND UPPER(${street}) LIKE '%${q(w)}%'` + (zip ? ` AND ${zip} = '${z}'` : '') : `UPPER(${full}) LIKE '${q(s.num)} %${q(w)}%'`;
  const { d, ms } = await j(AP + '/0/query?' + new URLSearchParams({ where, outFields: '*', returnGeometry: 'true', outSR: '4326', resultRecordCount: '3', f: 'json' }));
  console.log(st, z, '| our', f.lat, f.lon, f.gp || '', '|', ms + 'ms', d.error ? 'ERROR ' + JSON.stringify(d.error).slice(0, 140) : (d.features || []).length + ' hits ' + JSON.stringify((d.features || []).slice(0, 1).map(x => [x.geometry, Object.fromEntries(Object.entries(x.attributes).slice(0, 12))])).slice(0, 300));
  const id = await j(PARCELS + '/identify?' + new URLSearchParams({ geometry: f.lon + ',' + f.lat, geometryType: 'esriGeometryPoint', sr: '4326', layers: 'all:0', tolerance: '2', mapExtent: [f.lon - .01, f.lat - .01, f.lon + .01, f.lat + .01].join(','), imageDisplay: '400,400,96', returnGeometry: 'false', f: 'json' }));
  console.log('   parcel identify', id.ms + 'ms', id.d.error ? 'ERROR ' + JSON.stringify(id.d.error).slice(0, 120) : (id.d.results || []).length + ' results ' + JSON.stringify((id.d.results || []).slice(0, 1).map(r => r.attributes && { situs: r.attributes.situs_addr || r.attributes.SITUS_ADDR, owner: r.attributes.owner_name || r.attributes.OWNER_NAME })));
}
