// Diagnostic: which cities and counties in our region publish building permits as open data, and in what shape.
// Run "Probe services" with script=permits. Read-only.
import { time, ckan, socrata, agol, arcLayer, links, head } from './probe-kit.mjs';

// Houston: CKAN portal (weekly permit files) and COH ArcGIS
for (const q of ['permit', 'building permits', 'certificate of occupancy', 'sold permits'])
  await time('houston ckan ' + q, () => ckan('https://data.houstontx.gov', q), 6000);
await time('houston permits page', () => links('https://www.houstonpermittingcenter.org/', /permit|report|data|download|xls|csv/i), 5000);
for (const u of ['https://services.arcgis.com/NummVBqZSIJKUeVR/arcgis/rest/services', 'https://mycity2.houstontx.gov/pubgis02/rest/services', 'https://geogimsprod.houstontx.gov/arcgis/rest/services'])
  await time('houston arcgis ' + u, async () => { const r = await arcLayer(u); return { ...r, services: r.services?.filter(s => /permit|plat|develop|plan|construct|occupan/i.test(s)) }; }, 5000);

// Harris County Engineering (unincorporated) and other counties
for (const u of ['https://www.gis.hctx.net/arcgis/rest/services', 'https://gis.hctx.net/arcgis/rest/services'])
  await time('harris county arcgis ' + u, () => arcLayer(u), 5000);
// Catalog searches across ArcGIS Online and Socrata for every city in the region
for (const q of ['building permits', 'permits issued', 'permit Sugar Land', 'permit Katy', 'permit Conroe', 'permit Missouri City', 'permit Pearland', 'permit Tomball', 'permit Fort Bend County', 'permit Montgomery County', 'permit Harris County', 'permit Brenham', 'permit Navasota', 'permit Hempstead', 'permit The Woodlands', 'permit Rosenberg', 'permit Fulshear', 'permit League City', 'permit Baytown', 'permit Pasadena'])
  await time('agol ' + q, () => agol(q), 4000);
for (const q of ['building permits Texas', 'permits Houston', 'permits Sugar Land', 'permits Conroe', 'permits Fort Bend'])
  await time('socrata ' + q, () => socrata(q), 4000);
console.log('done');
