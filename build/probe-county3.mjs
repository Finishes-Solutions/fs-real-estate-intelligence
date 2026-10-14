// Diagnostic, third pass: the exact query shapes the county-data loaders will use. Run "Probe services" with
// script=county3. Read-only.
import { json, get, arcLayer } from './probe-kit.mjs';
const cut = (o, n = 2400) => JSON.stringify(o).slice(0, n);
const say = async (name, fn, n) => { try { console.log('##', name, '|', cut(await fn(), n)); } catch (e) { console.log('##', name, '| ERROR', e.message); } };
const q = (u, p) => json(u + '/query?' + new URLSearchParams({ f: 'json', ...p }));
const HCAD = 'https://arcweb.hcad.org/server/rest/services/public/public_query/MapServer/0';
const pt = (x, y) => ({ geometry: JSON.stringify({ x, y, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outSR: '4326' });
for (const [n, x, y] of [['katy mills', -95.8106, 29.7764], ['galleria', -95.4610, 29.7392], ['house in bellaire', -95.4587, 29.7058]])
  await say('hcad point ' + n, async () => { const d = await q(HCAD, { ...pt(x, y), outFields: 'HCAD_NUM,owner,address,city,zip,state_class,appr_val,mkt_val,land_val,impr_val,legal_lines,subdivision', returnGeometry: 'true' }); return { n: d.features?.length, a: d.features?.[0]?.attributes, ring: d.features?.[0]?.geometry?.rings?.[0]?.slice(0, 2), err: d.error }; });
await say('hcad by acct list', async () => { const d = await q(HCAD, { where: "HCAD_NUM IN ('0010010000013','0221090010009')", outFields: 'HCAD_NUM,owner', returnGeometry: 'true', outSR: '4326', returnCentroid: 'true', geometryPrecision: '5' }); return { n: d.features?.length, f: d.features?.map(f => ({ a: f.attributes, c: f.centroid, pts: f.geometry?.rings?.[0]?.length })), err: d.error }; });
await say('hcad layer caps', async () => { const m = await json(HCAD + '?f=json'); return { caps: m.capabilities, sr: m.extent?.spatialReference, adv: m.advancedQueryCapabilities, maxRec: m.maxRecordCount }; });
const WALLER = 'https://services3.arcgis.com/KKhSlBnH1Rm0YK62/arcgis/rest/services/WallerCADWebService/FeatureServer';
await say('waller point', async () => { const d = await q(WALLER + '/0', { ...pt(-95.9269, 30.0566), outFields: '*', returnGeometry: 'true' }); return { n: d.features?.length, a: d.features?.[0]?.attributes, err: d.error }; });
for (const [c, u] of [['waller', WALLER], ['austin', 'https://services7.arcgis.com/rNakmFefTO1XjYg4/arcgis/rest/services/AustinCADWebService/FeatureServer'], ['grimes', 'https://services8.arcgis.com/fpr21jaV02YtR7tv/arcgis/rest/services/GrimesCADWebService/FeatureServer'], ['washington', 'https://services3.arcgis.com/42lb4t0mpCcD1zg8/arcgis/rest/services/WashingtonCADMatixService/FeatureServer']])
  await say('subdivisions ' + c, async () => { const l = await arcLayer(u + '/2', { sample: 2 }); return { total: l.total, fields: l.fields, edited: l.edited, sample: l.sample }; }, 1500);
await say('fortbend subdivisions recent', async () => { const d = await q('https://services.arcgis.com/HfQs2ClqmipKpmFK/arcgis/rest/services/Subdivisions/FeatureServer/0', { where: "REC_DATE >= DATE '2025-01-01'", returnCountOnly: 'true' }); return d; });
await say('mcad subdivisions recent', async () => q('https://services1.arcgis.com/PRoAPGnMSUqvTrzq/arcgis/rest/services/SubdivisionBoundary/FeatureServer/0', { where: "CreateDate >= DATE '2025-01-01'", returnCountOnly: 'true' }));
const PT = 'https://mycity2.houstontx.gov/geoplat01/rest/services/PlatTracker/PT365_PLAT_MAPPING/MapServer/1';
await say('coh plats recent', async () => q(PT, { where: "AppSubmitDate >= DATE '2024-10-01'", returnCountOnly: 'true' }));
await say('coh plats codes', async () => { const d = await q(PT, { where: "AppSubmitDate >= DATE '2024-10-01'", groupByFieldsForStatistics: 'AppCode', outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: 'AppCode', outStatisticFieldName: 'n' }]) }); return d.features?.map(f => f.attributes.AppCode + '=' + f.attributes.n).join(', ') || d.error; });
await say('coh plats sample geom', async () => { const d = await q(PT, { where: "AppSubmitDate >= DATE '2026-09-01'", outFields: '*', returnGeometry: 'true', outSR: '4326', resultRecordCount: '1', geometryPrecision: '5' }); return { a: d.features?.[0]?.attributes, pts: d.features?.[0]?.geometry?.rings?.[0]?.length, err: d.error }; });
// TCEQ water districts (data.texas.gov) and iWUD detail pages
const soc = (id, p) => json('https://data.texas.gov/resource/' + id + '.json?' + new URLSearchParams(p), { timeout: 120000 });
await say('tceq counts', async () => soc('hr84-s96f', { $select: 'county, district_type, count(*)', $group: 'county, district_type', $where: "county in ('WALLER','HARRIS','FORT BEND','MONTGOMERY','AUSTIN','WASHINGTON','GRIMES')", $limit: 200 }), 3000);
await say('tceq one full row', async () => soc('hr84-s96f', { $limit: 1, $where: "county='FORT BEND' AND activity_status='Active'" }), 2000);
await say('iwud detail', async () => { const h = await (await get('https://www14.tceq.texas.gov/iwud/dist/index.cfm?fuseaction=DetailDistrict&ID=101946&command=list&name=290+BETKA+MMD+1')).text(); const t = h.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' '); const i = t.search(/Creat/i); return { len: h.length, around: t.slice(Math.max(0, i - 400), i + 900) }; }, 2400);
await say('iwud list by county', async () => { const h = await (await get('https://www14.tceq.texas.gov/iwud/dist/index.cfm?fuseaction=ListDistricts&COMMAND=LIST&compress=N&CountyCode=237&ActivityStatus=A')).text(); return { len: h.length, rows: (h.match(/DetailDistrict&ID=\d+/g) || []).length, first: (h.match(/DetailDistrict&ID=\d+[^"]*/g) || []).slice(0, 3) }; });
// Bond Review Board local debt by issuance
await say('brb types', async () => soc('3qmf-seku', { $select: 'governmenttype, count(*)', $group: 'governmenttype', $limit: 50 }));
await say('brb waller sample', async () => soc('3qmf-seku', { $limit: 2, $where: "upper(county) like '%WALLER%'", $order: 'closingdate DESC' }), 2400);
await say('brb fiscal years', async () => soc('3qmf-seku', { $select: 'fiscalyear, count(*)', $group: 'fiscalyear', $order: 'fiscalyear DESC', $limit: 5 }));
// TEA current schools and districts
const TEA = 'https://services2.arcgis.com/5MVN2jsqIrNZD4tP/arcgis/rest/services';
for (const n of ['Current_Schools', 'Current_Districts', 'School_Districts__2026'])
  await say('tea ' + n, async () => { const l = await arcLayer(TEA + '/' + n + '/FeatureServer/0', { sample: 1 }); return { total: l.total, inRegion: l.inRegion, edited: l.edited, geom: l.geom, fields: l.fields, sample: l.sample }; }, 3500);
console.log('done');
