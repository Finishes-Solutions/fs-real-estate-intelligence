// Diagnostic: which cities and counties in our region publish building permits as open data, and in what shape.
// Run "Probe services" with script=permits. Read-only.
import { time, ckan, socrata, agol, arcLayer, links, head, json } from './probe-kit.mjs';

// Houston: CKAN portal (weekly permit files) and COH ArcGIS
for (const q of ['permit', 'building permits', 'certificate of occupancy', 'sold permits'])
  await time('houston ckan ' + q, () => ckan('https://data.houstontx.gov', q), 6000);
await time('houston permits page', () => links('https://www.houstonpermittingcenter.org/', /permit|report|data|download|xls|csv/i), 5000);
for (const u of ['https://services.arcgis.com/NummVBqZSIJKUeVR/arcgis/rest/services', 'https://mycity2.houstontx.gov/pubgis02/rest/services', 'https://geogimsprod.houstontx.gov/arcgis/rest/services'])
  await time('houston arcgis ' + u, async () => { const r = await arcLayer(u); return { ...r, services: r.services?.filter(s => /permit|plat|develop|plan|construct|occupan/i.test(s)) }; }, 5000);

// Harris County Office of the County Engineer: the public "Permits Dashboard" (ArcGIS Experience 6dee5875…) and the
// feature services behind it, which would add contractor, value and status for unincorporated-county permits
await time('oce experience item', () => json('https://www.arcgis.com/sharing/rest/content/items/6dee5875d8ed477bb5b1bed209c5fd4b?f=json'), 6000);
await time('oce experience data (service URLs)', async () => { const d = await json('https://www.arcgis.com/sharing/rest/content/items/6dee5875d8ed477bb5b1bed209c5fd4b/data?f=json'); const urls = [...new Set(JSON.stringify(d).match(/https?:\/\/[^"\\]+\/rest\/services\/[^"\\]+/g) || [])], items = [...new Set(JSON.stringify(d).match(/"itemId":"([0-9a-f]{32})"/g) || [])]; return { urls, items }; }, 8000);
for (const u of ['https://www.gis.hctx.net/arcgis/rest/services', 'https://gis.hctx.net/arcgis/rest/services', 'https://services.arcgis.com/su8ic9KbA7PYVxPS/arcgis/rest/services', 'https://oce.harriscountytx.gov/arcgis/rest/services', 'https://epermits.harriscountytx.gov/arcgis/rest/services'])
  await time('harris county arcgis ' + u, async () => { const r = await arcLayer(u); return { ...r, services: r.services?.filter(s => /permit|oce|engineer|inspect|develop|plat/i.test(s)) }; }, 6000);
await time('agol harris county permits', () => agol('Harris County permits OCE', { num: 30 }), 6000);
// the feature service behind that dashboard: its layers, fields, counts, date range and sample rows
for (const u of ['https://www.gis.hctx.net/arcgishcpid/rest/services/Permits/ePermits_Report/FeatureServer/0', 'https://www.gis.hctx.net/arcgishcpid/rest/services/Permits/ePermits_Report/FeatureServer/1'])
  await time('oce ePermits_Report ' + u.slice(-1), () => arcLayer(u, { sample: 3 }), 10000);
await time('oce ePermits_Report service', () => json('https://www.gis.hctx.net/arcgishcpid/rest/services/Permits/ePermits_Report/FeatureServer?f=json'), 6000);
for (const l of [0, 1]) {
  const base = 'https://www.gis.hctx.net/arcgishcpid/rest/services/Permits/ePermits_Report/FeatureServer/' + l + '/query?f=json&where=1%3D1';
  await time('oce layer ' + l + ' count', () => json(base + '&returnCountOnly=true'), 8000);
  await time('oce layer ' + l + ' first rows by objectid', () => json(base + '&outFields=*&resultRecordCount=3&orderByFields=OBJECTID%20ASC&returnGeometry=false'), 8000);
  await time('oce layer ' + l + ' last rows by objectid', () => json(base + '&outFields=*&resultRecordCount=3&orderByFields=OBJECTID%20DESC&returnGeometry=false'), 8000);
}
// Harris County Engineering (unincorporated) and other counties
for (const u of ['https://www.gis.hctx.net/arcgis/rest/services', 'https://gis.hctx.net/arcgis/rest/services'])
  await time('harris county arcgis ' + u, () => arcLayer(u), 5000);
// Catalog searches across ArcGIS Online and Socrata for every city in the region
for (const q of ['building permits', 'permits issued', 'permit Sugar Land', 'permit Katy', 'permit Conroe', 'permit Missouri City', 'permit Pearland', 'permit Tomball', 'permit Fort Bend County', 'permit Montgomery County', 'permit Harris County', 'permit Brenham', 'permit Navasota', 'permit Hempstead', 'permit The Woodlands', 'permit Rosenberg', 'permit Fulshear', 'permit League City', 'permit Baytown', 'permit Pasadena'])
  await time('agol ' + q, () => agol(q), 4000);
for (const q of ['building permits Texas', 'permits Houston', 'permits Sugar Land', 'permits Conroe', 'permits Fort Bend'])
  await time('socrata ' + q, () => socrata(q), 4000);
console.log('done');
