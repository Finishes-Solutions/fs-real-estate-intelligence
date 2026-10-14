// Diagnostic: field names and two rows of TEA's newest dated school layer. Run "Probe services" with script=tea2.
import { json } from './probe-kit.mjs';
import { newestTeaService } from '../lib/countydata.mjs';
const ORG = 'https://services2.arcgis.com/5MVN2jsqIrNZD4tP/arcgis/rest/services';
const svc = newestTeaService(((await json(ORG + '?f=json')).services || []).map(s => s.name));
console.log('## service', svc);
const m = await json(ORG + '/' + svc + '/FeatureServer?f=json'); console.log('## layers', JSON.stringify(m.layers));
const L = await json(ORG + '/' + svc + '/FeatureServer/0?f=json'); console.log('## fields', (L.fields || []).map(f => f.name).join(' '));
const d = await json(ORG + '/' + svc + '/FeatureServer/0/query?' + new URLSearchParams({ f: 'json', where: '1=1', outFields: '*', outSR: '4326', resultRecordCount: '2', geometry: '-96.2,29.7,-95.8,30.3', geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' }));
console.log('## rows', JSON.stringify(d.features || d.error).slice(0, 4000));
for (const n of ['Schools_2024_to_2025', 'Schools_2023_to_2024']) {
  const F = await json(ORG + '/' + n + '/FeatureServer/0?f=json'); console.log('## fields ' + n, (F.fields || []).map(f => f.name).join(' '));
  const r = await json(ORG + '/' + n + '/FeatureServer/0/query?' + new URLSearchParams({ f: 'json', where: '1=1', outFields: '*', returnGeometry: 'false', resultRecordCount: '1' }));
  console.log('## row ' + n, JSON.stringify(r.features?.[0]?.attributes || r.error).slice(0, 2500));
}
