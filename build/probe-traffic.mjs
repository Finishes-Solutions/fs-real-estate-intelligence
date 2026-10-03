// Diagnostic: the TxDOT AADT layer's fields and the busiest count stations in a box (for the Market view's traffic section).
// Run "Probe services" with script=traffic.
const L = 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_AADT/FeatureServer/0';
const j = async u => { const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); return r.json(); };
const meta = await j(L + '?f=json');
console.log('fields:', (meta.fields || []).map(f => f.name + ':' + f.type.replace('esriFieldType', '')).join(', '));
console.log('maxRecordCount', meta.maxRecordCount, 'supportsStatistics', meta.advancedQueryCapabilities?.supportsStatistics, 'orderBy', meta.advancedQueryCapabilities?.supportsOrderBy);
const env = { xmin: -95.82, ymin: 29.52, xmax: -95.05, ymax: 30.12, spatialReference: { wkid: 4326 } };
const q = new URLSearchParams({ f: 'json', where: 'AADT_CUR > 0', geometry: JSON.stringify(env), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: '*', orderByFields: 'AADT_CUR DESC', resultRecordCount: '5', returnGeometry: 'true', outSR: '4326' });
const d = await j(L + '/query?' + q);
console.log('sample rows:'); for (const f of d.features || []) console.log(JSON.stringify(f.attributes), 'geom', JSON.stringify(f.geometry).slice(0, 120));
const c = await j(L + '/query?' + new URLSearchParams({ f: 'json', where: 'AADT_CUR > 0', geometry: JSON.stringify(env), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', returnCountOnly: 'true' }));
console.log('stations in Houston box:', c.count);
