// Diagnostic: find and check the free environmental and business-entity services (TCEQ, Railroad Commission, wetlands,
// soils, EPA, Texas Comptroller) from a cloud server (Actions). Run "Probe services" with script=env.
const UA = { 'User-Agent': 'FinishesSolutions-RE-Intelligence/1.0 (probe)' };
const short = (o, n = 900) => (typeof o === 'string' ? o : JSON.stringify(o)).slice(0, n);
const get = async (u, opts = {}, ms = 25000) => { const r = await fetch(u, { ...opts, headers: { ...UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(ms) }); const t = await r.text(); if (!r.ok) throw new Error(r.status + ' ' + t.slice(0, 200)); try { return JSON.parse(t); } catch { return t; } };
const time = async (name, fn) => { const t = Date.now(); try { const r = await fn(); console.log('##', name, '|', Date.now() - t, 'ms |', short(r, 2500)); return r; } catch (e) { console.log('##', name, '| ERROR', e.message, '|', Date.now() - t, 'ms'); } };
const KEY = /petrol|lpst|tank|ust|dry|clean|superfund|npl|waste|landfill|msw|ihw|vcp|brown|remed|spill|well|pipe|wetland|efpoint|frs|rcra|tri|emef|haz|soil|ssurgo|district|edwards|permit|air|water|enviro/i;

async function catalog(root, depth = 0, out = []) {
  const d = await get(root + '?f=json');
  for (const s of d.services || []) out.push({ url: root.replace(/\/services(\/.*)?$/, '/services') + '/' + s.name + '/' + s.type, name: s.name, type: s.type });
  if (depth < 2) for (const f of d.folders || []) { try { await catalog(root.replace(/\/$/, '') + '/' + f.split('/').pop(), depth + 1, out); } catch (e) { console.log('folder', f, e.message); } }
  return out;
}
async function describe(svc) {
  const d = await get(svc + '?f=json');
  const layers = [...(d.layers || []), ...(d.tables || [])].slice(0, 40);
  const res = [];
  for (const l of layers) {
    if (!KEY.test(l.name) && layers.length > 6) { res.push(l.id + ':' + l.name); continue; }
    try { const m = await get(svc + '/' + l.id + '?f=json'); res.push(l.id + ':' + l.name + ' [' + m.geometryType + '] {' + (m.fields || []).map(f => f.name).join(',').slice(0, 500) + '}'); }
    catch (e) { res.push(l.id + ':' + l.name + ' ERR ' + e.message); }
  }
  return res;
}
const KATY = [-95.8244, 29.7858], HOU = [-95.3698, 29.7604];
async function countNear(layer, p, mi = 1) {
  const q = new URLSearchParams({ geometry: p.join(','), geometryType: 'esriGeometryPoint', inSR: '4326', distance: String(mi), units: 'esriSRUnit_StatuteMile', spatialRel: 'esriSpatialRelIntersects', returnCountOnly: 'true', f: 'json' });
  return get(layer + '/query?' + q);
}
async function sampleNear(layer, p, mi = 1) {
  const q = new URLSearchParams({ geometry: p.join(','), geometryType: 'esriGeometryPoint', inSR: '4326', outSR: '4326', distance: String(mi), units: 'esriSRUnit_StatuteMile', spatialRel: 'esriSpatialRelIntersects', outFields: '*', resultRecordCount: '2', returnGeometry: 'true', f: 'json' });
  const d = await get(layer + '/query?' + q); return { n: d.features?.length, f: d.features?.slice(0, 2) };
}

for (const root of ['https://services2.arcgis.com/LYMgRMwHfrWWEg3s/arcgis/rest/services', 'https://gisweb.tceq.texas.gov/arcgis/rest/services', 'https://gis.rrc.texas.gov/server/rest/services',
  'https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services', 'https://geopub.epa.gov/arcgis/rest/services', 'https://mapservices.weather.noaa.gov/arcgis/rest/services']) {
  const list = await time('catalog ' + root, async () => (await catalog(root)).map(s => s.name + ' (' + s.type + ')'));
  if (!list) continue;
  const all = await catalog(root).catch(() => []);
  for (const s of all.filter(s => KEY.test(s.name) && /MapServer|FeatureServer/.test(s.type)).slice(0, 25)) await time('layers ' + s.url, () => describe(s.url));
}
// ArcGIS Hub: TCEQ and RRC open data layers hosted elsewhere
for (const q of ['TCEQ petroleum storage tank', 'TCEQ dry cleaner', 'TCEQ superfund', 'TCEQ municipal solid waste', 'TCEQ industrial hazardous waste', 'TCEQ voluntary cleanup', 'Railroad Commission wells', 'Railroad Commission pipelines', 'TCEQ brownfields', 'TCEQ underground storage tank'])
  await time('hub ' + q, async () => { const d = await get('https://hub.arcgis.com/api/search/v1/collections/dataset/items?' + new URLSearchParams({ q, limit: '6' })); return (d.features || []).map(f => [f.properties?.title, f.properties?.source, f.properties?.url].join(' | ')); });

// candidate layers we may use directly
for (const [name, u] of [
  ['RRC wells', 'https://gis.rrc.texas.gov/server/rest/services/rrc_public/RRC_Public_Viewer_Srvs/MapServer'],
  ['NWI wetlands', 'https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer'],
  ['EPA EMEF', 'https://geopub.epa.gov/arcgis/rest/services/EMEF/efpoints/MapServer'],
  ['TCEQ water districts', 'https://services2.arcgis.com/LYMgRMwHfrWWEg3s/arcgis/rest/services/TCEQ_Water_Districts/FeatureServer']])
  await time('describe ' + name, () => describe(u));
await time('NWI near Katy', () => sampleNear('https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0', KATY, 0.3));
await time('EPA EMEF count Houston 1mi', async () => { const d = await get('https://geopub.epa.gov/arcgis/rest/services/EMEF/efpoints/MapServer?f=json'); const o = {}; for (const l of (d.layers || []).slice(0, 12)) { try { o[l.name] = (await countNear('https://geopub.epa.gov/arcgis/rest/services/EMEF/efpoints/MapServer/' + l.id, HOU, 1)).count; } catch (e) { o[l.name] = e.message; } } return o; });
await time('ECHO facilities Houston 0.25mi', () => get('https://echodata.epa.gov/echo/echo_rest_services.get_facilities?' + new URLSearchParams({ output: 'JSON', p_lat: HOU[1], p_long: HOU[0], p_radius: '0.25', responseset: '3' })));

// soils: USDA Soil Data Access (SSURGO), map unit at a point
await time('SDA soil at Katy', () => get('https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'JSON+COLUMNNAME', query:
  "SELECT TOP 3 mu.mukey, mu.muname, ma.drclassdcd, ma.hydgrpdcd, ma.flodfreqdcd, ma.engdwbll, ma.engdwobdcd FROM mapunit mu JOIN muaggatt ma ON ma.mukey = mu.mukey WHERE mu.mukey IN (SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(" + KATY.join(' ') + ")'))" }) }));
await time('SDA WMS caps', async () => String(await get('https://SDMDataAccess.sc.egov.usda.gov/Spatial/SDM.wms?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.1.1')).match(/<Name>[^<]+<\/Name>/g)?.slice(0, 30));

// business entities: Texas Comptroller franchise tax data
await time('data.texas.gov catalog franchise', async () => { const d = await get('https://data.texas.gov/api/catalog/v1?' + new URLSearchParams({ q: 'franchise tax', limit: '10' })); return d.results.map(r => [r.resource.id, r.resource.name, (r.resource.columns_field_name || []).join(',')].join(' | ')); });
await time('data.texas.gov catalog sos', async () => { const d = await get('https://data.texas.gov/api/catalog/v1?' + new URLSearchParams({ q: 'secretary of state business entity', limit: '8' })); return d.results.map(r => [r.resource.id, r.resource.name, (r.resource.columns_field_name || []).join(',')].join(' | ')); });
await time('franchise 9cir-efmm sample', () => get('https://data.texas.gov/resource/9cir-efmm.json?$limit=2&$where=' + encodeURIComponent("taxpayer_name like 'KATY%LLC'")));
for (const u of ['https://comptroller.texas.gov/data-search/franchise-tax?name=' + encodeURIComponent('KATY ASIAN TOWN'), 'https://comptroller.texas.gov/data-search/franchise-tax?name=WALMART', 'https://mycpa.cpa.state.tx.us/coa/coaSearchBtn'])
  await time('comptroller ' + u, () => get(u));
console.log('done');
