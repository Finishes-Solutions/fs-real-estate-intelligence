// Diagnostic: check the free environmental and business-entity services (TCEQ, Railroad Commission, wetlands, soils, EPA,
// Texas Comptroller) from a cloud server (Actions). Run "Probe services" with script=env.
const UA = { 'User-Agent': 'FinishesSolutions-RE-Intelligence/1.0 (probe)' };
const short = (o, n = 2500) => (typeof o === 'string' ? o : JSON.stringify(o)).slice(0, n);
const get = async (u, opts = {}, ms = 25000) => { const r = await fetch(u, { ...opts, headers: { ...UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(ms) }); const ct = r.headers.get('content-type') || ''; if (/image/.test(ct)) return { image: ct, bytes: (await r.arrayBuffer()).byteLength, status: r.status }; const t = await r.text(); if (!r.ok) throw new Error(r.status + ' ' + t.slice(0, 200)); try { return JSON.parse(t); } catch { return t; } };
const time = async (name, fn, n) => { const t = Date.now(); try { const r = await fn(); console.log('##', name, '|', Date.now() - t, 'ms |', short(r, n)); return r; } catch (e) { console.log('##', name, '| ERROR', e.message, '|', Date.now() - t, 'ms'); } };
const KATY = [-95.8244, 29.7858], HOU = [-95.3698, 29.7604], BAYTOWN = [-94.98, 29.75];
const near = (layer, p, mi, extra = {}) => get(layer + '/query?' + new URLSearchParams({ geometry: p.join(','), geometryType: 'esriGeometryPoint', inSR: '4326', outSR: '4326', distance: String(mi), units: 'esriSRUnit_StatuteMile', spatialRel: 'esriSpatialRelIntersects', f: 'json', ...extra }));
const T = 'https://gisweb.tceq.texas.gov/arcgis/rest/services/', RRC = 'https://gis.rrc.texas.gov/server/rest/services/rrc_public/RRC_Public_Viewer_Srvs/MapServer', EF = 'https://geopub.epa.gov/arcgis/rest/services/EMEF/efpoints/MapServer';

await time('tceq Public folder', async () => (await get(T + 'Public?f=json')).services.map(s => s.name), 6000);
await time('tceq REM folder', async () => (await get(T + 'REM?f=json')).services.map(s => s.name), 3000);
await time('tceq PST folder', async () => (await get(T + 'PST?f=json')).services.map(s => s.name), 3000);
for (const s of ['Public/PST', 'Public/MSD_Points', 'Public/MSD_Polys', 'Public/Landfills', 'PST/PSTViewer_PRD', 'REM/SuperfundViewer_PRD'])
  await time('layers ' + s, async () => { const d = await get(T + s + '/MapServer?f=json'); const out = []; for (const l of d.layers || []) { if (l.subLayerIds) { out.push(l.id + ':' + l.name + ' (group)'); continue; } const m = await get(T + s + '/MapServer/' + l.id + '?f=json'); out.push(l.id + ':' + l.name + ' [' + m.geometryType + '] {' + (m.fields || []).map(f => f.name).join(',') + '}'); } return out; }, 5000);
for (const [n, s] of [['LPST', 'Public/LPST'], ['DryCleaner', 'Public/DryCleaner'], ['Superfund', 'Public/Superfund'], ['VCP', 'Public/VCP'], ['IHWCA', 'Public/IHWCA'], ['Brownfield', 'Public/Brownfield'], ['Landfills', 'Public/Landfills'], ['PST', 'Public/PST'], ['MSD_Points', 'Public/MSD_Points'], ['MSD_Polys', 'Public/MSD_Polys']])
  await time('near HOU 1mi ' + n, async () => { const d = await near(T + s + '/MapServer/0', HOU, 1, { outFields: '*', returnGeometry: 'false', resultRecordCount: '2' }); return { n: d.features?.length, exceeded: d.exceededTransferLimit, sample: d.features?.[0]?.attributes }; }, 1500);
await time('LPST count HOU 1mi', () => near(T + 'Public/LPST/MapServer/0', HOU, 1, { returnCountOnly: 'true' }));
await time('tceq export PNG', () => get(T + 'Public/LPST/MapServer/export?' + new URLSearchParams({ bbox: '-10620000,3470000,-10610000,3480000', bboxSR: '3857', imageSR: '3857', size: '256,256', format: 'png32', transparent: 'true', f: 'image' })));

await time('rrc layers', async () => (await get(RRC + '?f=json')).layers.map(l => l.id + ':' + l.name + (l.subLayerIds ? ' (group)' : '') + ' ' + l.minScale + '-' + l.maxScale), 5000);
await time('rrc wells near Katy 1mi', async () => { const d = await near(RRC + '/1', KATY, 1, { outFields: '*', returnGeometry: 'false', resultRecordCount: '3' }); return { n: d.features?.length, sample: d.features?.slice(0, 2).map(f => f.attributes) }; });
await time('rrc wells near Baytown 1mi', async () => { const d = await near(RRC + '/1', BAYTOWN, 1, { returnCountOnly: 'true' }); return d; });
await time('rrc pipelines near Baytown 0.5mi', async () => { const d = await near(RRC + '/13', BAYTOWN, 0.5, { outFields: 'OPERATOR,COMMODITY_DESCRIPTION,SYSTEM_NAME,DIAMETER,STATUS,INTERSTATE', returnGeometry: 'false' }); return { n: d.features?.length, sample: d.features?.slice(0, 3).map(f => f.attributes) }; });
await time('rrc export PNG', () => get(RRC + '/export?' + new URLSearchParams({ bbox: '-10580000,3470000,-10570000,3480000', bboxSR: '3857', imageSR: '3857', size: '256,256', format: 'png32', transparent: 'true', layers: 'show:1,13', f: 'image' })));
await time('epa efpoints layers', async () => (await get(EF + '?f=json')).layers.map(l => l.id + ':' + l.name), 3000);
await time('nwi export PNG', () => get('https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/export?' + new URLSearchParams({ bbox: '-10670000,3470000,-10660000,3480000', bboxSR: '3857', imageSR: '3857', size: '256,256', format: 'png32', transparent: 'true', f: 'image' })));
await time('ssurgo WMS GetMap', () => get('https://SDMDataAccess.sc.egov.usda.gov/Spatial/SDM.wms?' + new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap', LAYERS: 'mapunitpoly', STYLES: '', SRS: 'EPSG:3857', BBOX: '-10670000,3470000,-10665000,3475000', WIDTH: '256', HEIGHT: '256', FORMAT: 'image/png', TRANSPARENT: 'true' })));
await time('SDA soils in polygon', () => get('https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'JSON+COLUMNNAME', query:
  "SELECT mu.mukey, mu.muname, ma.drclassdcd, ma.hydgrpdcd, ma.flodfreqdcd, ma.pondfreqprs, ma.engdwbll, ma.engdwobdcd, ma.engsldcd, ma.wtdepannmin, ma.brockdepmin FROM mapunit mu JOIN muaggatt ma ON ma.mukey = mu.mukey WHERE mu.mukey IN (SELECT DISTINCT mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('polygon((-95.83 29.78,-95.82 29.78,-95.82 29.79,-95.83 29.79,-95.83 29.78))'))" }) }));
await time('SDA area shares', () => get('https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'JSON+COLUMNNAME', query:
  "SELECT mukey, SUM(area_ac) ac FROM (SELECT mukey, area_ac FROM SDA_Get_MupolygonWktWgs84_from_Mukey('3103244')) x GROUP BY mukey" }) }));

for (const id of ['32060853200', '17104151885', '32089946696'])
  await time('comptroller detail ' + id, () => get('https://comptroller.texas.gov/data-search/franchise-tax/' + id), 4000);
await time('comptroller search LLC', () => get('https://comptroller.texas.gov/data-search/franchise-tax?name=' + encodeURIComponent('KATY 1 HOUND LLC')));
await time('tckn-sxa6 sample', () => get('https://data.texas.gov/resource/tckn-sxa6.json?$limit=2'));
await time('tckn-sxa6 meta', async () => { const d = await get('https://data.texas.gov/api/views/tckn-sxa6.json'); return { name: d.name, attribution: d.attribution, desc: d.description, rows: d.rowsUpdatedAt }; });
await time('9cir meta', async () => { const d = await get('https://data.texas.gov/api/views/9cir-efmm.json'); return { name: d.name, attribution: d.attribution, desc: d.description, updated: d.rowsUpdatedAt }; });
console.log('done');
