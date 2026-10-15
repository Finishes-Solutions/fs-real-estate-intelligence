// Diagnostic: water districts (MUDs) with their creation dates, and bond issues, for our counties.
// Run "Probe services" with script=districts. Read-only.
import { time, arcLayer, links, socrata, agol, json, get } from './probe-kit.mjs';
const TCEQ = 'https://services2.arcgis.com/LYMgRMwHfrWWEg3s/arcgis/rest/services/TCEQ_Water_Districts/FeatureServer/0';
await time('tceq water districts', () => arcLayer(TCEQ, { sample: 3, countyField: 'COUNTY' }), 6000);
await time('tceq services list', () => arcLayer('https://services2.arcgis.com/LYMgRMwHfrWWEg3s/arcgis/rest/services'), 6000);
// iWUD: the TCEQ water utility database (district detail pages carry the creation date)
for (const u of ['https://www14.tceq.texas.gov/iwud/', 'https://www14.tceq.texas.gov/iwud/dist/index.cfm', 'https://www14.tceq.texas.gov/iwud/reports/index.cfm'])
  await time('iwud ' + u, () => links(u, /dist|report|county|search|csv|xls/i, 60), 5000);
// Bond Review Board local government debt, Comptroller and data.texas.gov
for (const u of ['https://www.brb.texas.gov/local-government-debt/', 'https://www.brb.texas.gov/', 'https://www.brb.texas.gov/local-government-search/'])
  await time('brb ' + u, () => links(u, /debt|data|download|xls|csv|search|local|annual|report/i, 60), 6000);
for (const q of ['local government debt', 'water district debt', 'municipal utility district', 'bond issuance', 'MUD'])
  await time('socrata ' + q, () => socrata(q, 'data.texas.gov'), 5000);
for (const q of ['municipal utility district', 'MUD boundaries', 'water districts Fort Bend', 'Montgomery County MUD'])
  await time('agol ' + q, () => agol(q), 4000);
console.log('done');
