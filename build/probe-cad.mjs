// Diagnostic: what the county appraisal districts publish for free, in bulk, for our seven counties (owner, value,
// parcel outlines). Run "Probe services" with script=cad. Prints download pages, file listings and headers, the first
// lines of the HCAD files, and any public ArcGIS parcel services. Read-only.
import { time, links, head, zipPeek, arcLayer, agol, get } from './probe-kit.mjs';
const year = new Date().getUTCFullYear();

// Harris: HCAD bulk downloads (CAMA text and GIS) and its public map services
for (const u of ['https://hcad.org/pdata/pdata-property-downloads.html', 'https://hcad.org/pdata/', 'https://download.hcad.org/', 'https://download.hcad.org/data/CAMA/', `https://download.hcad.org/data/CAMA/${year}/`, 'https://download.hcad.org/data/GIS/'])
  await time('hcad page ' + u, () => links(u), 6000);
for (const y of [year, year - 1])
  for (const f of ['Real_acct_owner.zip', 'Real_building_land.zip', 'Real_jur_exempt.zip', 'Code_description_real.zip', 'PP_files.zip'])
    await time(`hcad head ${y}/${f}`, () => head(`https://download.hcad.org/data/CAMA/${y}/${f}`));
for (const f of ['Parcels.zip', `Parcels_${year}.zip`, 'parcels.zip'])
  await time('hcad gis head ' + f, () => head('https://download.hcad.org/data/GIS/' + f));
await time('hcad zip Real_acct_owner', () => zipPeek(`https://download.hcad.org/data/CAMA/${year}/Real_acct_owner.zip`), 12000);
await time('hcad zip Real_building_land', () => zipPeek(`https://download.hcad.org/data/CAMA/${year}/Real_building_land.zip`), 12000);
for (const u of ['https://arcweb.hcad.org/server/rest/services', 'https://arcweb.hcad.org/server/rest/services/public', 'https://www.gis.hctx.net/arcgis/rest/services'])
  await time('hcad/hc arcgis ' + u, () => arcLayer(u), 4000);
await time('hcad parcel layer', () => arcLayer('https://arcweb.hcad.org/server/rest/services/public/public_query/MapServer/0'), 4000);

// Other CADs: home pages and their download links
const cads = { 'Fort Bend': ['https://www.fbcad.org/', 'https://www.fbcad.org/data-downloads/', 'https://www.fbcad.org/gis-data/'], Montgomery: ['https://mcad-tx.org/', 'https://mcad-tx.org/data-downloads', 'https://mcad-tx.org/gis-data'], Waller: ['https://waller-cad.org/', 'https://www.waller-cad.org/', 'https://wallercad.org/'], Austin: ['https://www.austincad.org/', 'https://austincad.org/'], Washington: ['https://www.washingtoncad.org/', 'https://washingtoncad.org/'], Grimes: ['https://grimescad.org/', 'https://www.grimescad.org/'] };
for (const [c, us] of Object.entries(cads)) for (const u of us) await time(`cad ${c} ${u}`, () => links(u), 5000);

// Statewide: TxGIO land parcels downloads (the source behind StratMap) per county, and ArcGIS parcel services found by search
await time('txgio data hub', () => links('https://data.geographic.texas.gov/collection/?c=ca3d0f2c-7f5f-4b0c-8a9b-2b8c6b0e5b2f', /parcel|download|zip/i), 4000);
await time('txgio stratmap parcels collection', () => links('https://tnris.org/stratmap/land-parcels/', /parcel|download|zip|county/i), 6000);
for (const q of ['parcels appraisal district', 'CAD parcels', 'Waller County parcels', 'Fort Bend parcels', 'Montgomery County parcels', 'Austin County parcels', 'Washington County parcels', 'Grimes County parcels'])
  await time('agol ' + q, () => agol(q), 5000);
console.log('done');
