// Diagnostic, second pass over the county-data sources the first probes found: fields, counts per county, date ranges
// and freshness of each candidate layer or file. Run "Probe services" with script=county2. Read-only. Output is kept
// short (one line per source).
import { execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { time, json, get, arcLayer, socrata } from './probe-kit.mjs';
const cut = (o, n = 2400) => JSON.stringify(o).slice(0, n);
const say = async (name, fn, n) => { const t = Date.now(); try { console.log('##', name, '|', cut(await fn(), n)); } catch (e) { console.log('##', name, '| ERROR', e.message); } };
const C = ['WALLER', 'HARRIS', 'FORT BEND', 'MONTGOMERY', 'AUSTIN', 'WASHINGTON', 'GRIMES'];
const q = (u, p) => json(u + '/query?' + new URLSearchParams({ f: 'json', ...p }));
const stats = (u, field, where = '1=1') => q(u, { where, groupByFieldsForStatistics: field, outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: field, outStatisticFieldName: 'n' }]) }).then(d => d.error ? d.error : d.features.map(f => f.attributes[field] + '=' + f.attributes.n).join(', '));
const range = (u, field, where = '1=1') => q(u, { where, outStatistics: JSON.stringify([{ statisticType: 'min', onStatisticField: field, outStatisticFieldName: 'lo' }, { statisticType: 'max', onStatisticField: field, outStatisticFieldName: 'hi' }]) }).then(d => d.error ? d.error : [d.features[0].attributes.lo, d.features[0].attributes.hi].map(v => typeof v === 'number' && v > 1e11 ? new Date(v).toISOString().slice(0, 10) : v));
const layer = async (u, extra) => { const l = await arcLayer(u, { sample: 1 }); return { name: l.name, geom: l.geom, max: l.max, edited: l.edited, total: l.total, inRegion: l.inRegion, fields: l.fields, sample: l.sample, ...(extra ? await extra() : {}) }; };
const services = async (org, re) => (await json(org + '?f=json')).services?.map(s => s.name).filter(n => re.test(n));

// ---- appraisal districts
const HCAD = 'https://arcweb.hcad.org/server/rest/services/public/public_query/MapServer/0';
await say('cad harris identify', async () => { const d = await q(HCAD, { geometry: '-95.3698,29.7604', geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: '*', returnGeometry: 'true', outSR: '4326' }); return { n: d.features?.length, attrs: d.features?.[0]?.attributes, rings: d.features?.[0]?.geometry?.rings?.[0]?.length, err: d.error }; });
for (const [c, u] of [['waller', 'https://services3.arcgis.com/KKhSlBnH1Rm0YK62/arcgis/rest/services/WallerCADWebService/FeatureServer'], ['austin', 'https://services7.arcgis.com/rNakmFefTO1XjYg4/arcgis/rest/services/AustinCADWebService/FeatureServer'], ['grimes', 'https://services8.arcgis.com/fpr21jaV02YtR7tv/arcgis/rest/services/GrimesCADWebService/FeatureServer'], ['washington', 'https://services3.arcgis.com/42lb4t0mpCcD1zg8/arcgis/rest/services/WashingtonCADMatixService/FeatureServer'], ['fortbend', 'https://services2.arcgis.com/D4saGHECICkCeoJm/arcgis/rest/services/FBCAD_ATP_GIS_Map/FeatureServer']]) {
  await say('cad ' + c + ' layers', async () => (await json(u + '?f=json')).layers?.map(l => l.id + ':' + l.name));
  await say('cad ' + c + ' parcels', () => layer(u + '/0'), 3500);
}
await say('cad montgomery org services', () => services('https://services1.arcgis.com/PRoAPGnMSUqvTrzq/arcgis/rest/services', /./));
await say('cad fortbend org services', () => services('https://services2.arcgis.com/D4saGHECICkCeoJm/arcgis/rest/services', /parcel|cad|account|subdiv|mud|permit|new/i));

// ---- permits
for (const n of ['ActivePermits_SZ', 'SF_BuildingPermits_SZ', 'City_of_Houston_2023_SF_and_MF_Permits_KL', 'Developments_Update', 'Under_construction_MRA_Aug_2026_A', 'Development_map_2'])
  await say('permits houston ' + n, () => layer('https://services.arcgis.com/NummVBqZSIJKUeVR/arcgis/rest/services/' + n + '/FeatureServer/0'), 2000);
await say('permits montgomery PermitAppDataView', () => layer('https://services1.arcgis.com/PRoAPGnMSUqvTrzq/arcgis/rest/services/PermitAppDataView/FeatureServer/0'), 2500);
await say('permits katy energov layers', async () => (await json('https://services8.arcgis.com/ihZy0ZJt5Ea5u0dK/arcgis/rest/services/Katy_Energov/FeatureServer?f=json')).layers?.map(l => l.id + ':' + l.name));
await say('permits katy energov 0', () => layer('https://services8.arcgis.com/ihZy0ZJt5Ea5u0dK/arcgis/rest/services/Katy_Energov/FeatureServer/0'), 2000);
await say('permits fulshear commercial', () => layer('https://services5.arcgis.com/k1ZyjVw1fpWcwy7h/arcgis/rest/services/Commercial_June2024_Today/FeatureServer/0'), 2000);
// HCAD permits.txt inside Real_acct_owner.zip: rows per year and per agency, permit types
await say('permits hcad file', async () => {
  const zip = '/tmp/acct.zip'; const r = await get('https://download.hcad.org/data/CAMA/2026/Real_acct_owner.zip', { timeout: 600000 });
  await pipeline(Readable.fromWeb(r.body), createWriteStream(zip));
  const txt = execFileSync('unzip', ['-p', zip, 'permits.txt'], { maxBuffer: 400 * 1048576 }).toString('latin1').split(/\r?\n/);
  const h = txt[0].split('\t'), ix = k => h.indexOf(k), by = (k, f = x => x) => { const m = {}; for (const l of txt.slice(1)) { const v = f(l.split('\t')[ix(k)] || ''); m[v] = (m[v] || 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 25); };
  const recent = txt.filter(l => /\t(2026|2025)\t/.test(l)).slice(0, 4);
  return { header: h, rows: txt.length - 1, byYear: by('yr').slice(0, 10), byAgency: by('agency_id'), byType: by('permit_tp_descr'), byStatus: by('status'), recent };
}, 6000);
await say('hcad real_acct header', async () => execFileSync('sh', ['-c', 'unzip -p /tmp/acct.zip real_acct.txt | head -2']).toString('latin1'), 3500);
await say('hcad deeds recent', async () => execFileSync('sh', ['-c', "unzip -p /tmp/acct.zip deeds.txt | awk -F'\\t' '{print substr($2,7,4)}' | sort | uniq -c | sort -k2 | tail -5"]).toString());

// ---- plats and subdivisions
const PT = 'https://mycity2.houstontx.gov/geoplat01/rest/services/PlatTracker/PT365_PLAT_MAPPING/MapServer';
await say('plats coh layers', async () => (await json(PT + '?f=json')).layers?.map(l => l.id + ':' + l.name));
for (const i of [0, 1, 2, 3]) await say('plats coh ' + i, () => layer(PT + '/' + i), 2600);
await say('plats fortbend subdivisions', () => layer('https://services.arcgis.com/HfQs2ClqmipKpmFK/arcgis/rest/services/Subdivisions/FeatureServer/0'), 1800);
await say('plats montgomery mcad subdivisions', () => layer('https://services1.arcgis.com/PRoAPGnMSUqvTrzq/arcgis/rest/services/SubdivisionBoundary/FeatureServer/0'), 1800);
await say('plats waller new subdivision selection', () => layer('https://services1.arcgis.com/BqVKz0o32DERqyE4/arcgis/rest/services/New_Subdivision_Selection/FeatureServer/0'), 1800);
await say('plats katy isd subdivisions', () => layer('https://services2.arcgis.com/9CHraavTCffxXvGX/arcgis/rest/services/Subdivisions_Master/FeatureServer/0'), 2200);
await say('plats fortbend exceptions', async () => (await json('https://arcgisweb.fortbendcountytx.gov/arcgis/rest/services/Engineering/Platting_Exception_and_Variances/MapServer?f=json')).layers?.map(l => l.id + ':' + l.name));
await say('plats houston activity reports', async () => { const h = await (await get('https://www.houstontx.gov/planning/DevelopRegs/dev_reports.html')).text(); return [...h.matchAll(/href="([^"]+\.(?:pdf|xlsx?|csv))"/gi)].map(m => m[1]).slice(0, 25); });

// ---- districts and bonds
const soc = (id, p) => json('https://data.texas.gov/resource/' + id + '.json?' + new URLSearchParams(p));
await say('districts tceq columns', async () => Object.keys((await soc('hr84-s96f', { $limit: 1 }))[0] || {}));
await say('districts tceq sample', async () => soc('hr84-s96f', { $limit: 2, $where: "upper(county) like '%WALLER%'" }), 2400);
await say('districts tceq counts', async () => Promise.all(C.map(async c => c + '=' + ((await soc('hr84-s96f', { $select: 'count(*)', $where: `upper(county) like '%${c}%'` }))[0]?.count))));
await say('bonds brb by issuance columns', async () => Object.keys((await soc('3qmf-seku', { $limit: 1 }))[0] || {}));
await say('bonds brb by issuance sample', async () => soc('3qmf-seku', { $limit: 2, $where: "upper(issuer) like '%MUD%' OR upper(issuer) like '%MUNICIPAL UTILITY%'" }), 2400);
await say('bonds brb issuer types', async () => soc('txkd-3wwk', { $limit: 3 }), 1200);
await say('bonds brb data center', async () => { const h = await (await get('https://data.brb.texas.gov/')).text(); return { len: h.length, links: [...h.matchAll(/href="([^"]+)"/g)].map(m => m[1]).filter(x => /debt|local|issu|download|csv|xls/i.test(x)).slice(0, 30) }; });

// ---- TEA, TxDOT
await say('tea services', () => services('https://services2.arcgis.com/5MVN2jsqIrNZD4tP/arcgis/rest/services', /^(Schools?|Current|District|Campus|School_Dist)/i));
await say('tea services 2', () => services('https://services2.arcgis.com/5MVN2jsqIrNZD4tP/arcgis/rest/services', /20(25|26)|current/i));
const TX = 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Projects_Info_All/FeatureServer/0';
await say('txdot by county', () => stats(TX, 'COUNTY_NAME', "COUNTY_NAME IN ('Waller','Harris','Fort Bend','Montgomery','Austin','Washington','Grimes')"));
await say('txdot phases', () => stats(TX, 'PT_PHASE', "COUNTY_NAME IN ('Waller','Harris','Fort Bend','Montgomery','Austin','Washington','Grimes')"));
await say('txdot stages', () => stats(TX, 'PROJ_STG', "COUNTY_NAME IN ('Waller','Harris','Fort Bend','Montgomery','Austin','Washington','Grimes')"));
await say('txdot let range', () => range(TX, 'PROJ_ESTMTD_LET_D', "COUNTY_NAME = 'Harris'"));
console.log('done');
