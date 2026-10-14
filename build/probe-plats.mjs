// Diagnostic: where plats and new subdivisions are published for our counties (Houston Planning Commission agendas,
// plat layers on ArcGIS). Run "Probe services" with script=plats. Read-only.
import { time, links, agol, arcLayer, head, get } from './probe-kit.mjs';

for (const u of ['https://www.houstontx.gov/planning/Commissions/commiss_plan.html', 'https://www.houstontx.gov/planning/Commissions/', 'https://www.houstontx.gov/planning/DevelopRegs/', 'https://www.houstonplanning.com/'])
  await time('houston planning ' + u, () => links(u, /agenda|plat|\.pdf|commission|subdivision/i, 80), 8000);
// The newest agenda PDF's size and first bytes (is it text or scanned?)
await time('houston newest agenda pdf', async () => {
  const p = await links('https://www.houstontx.gov/planning/Commissions/commiss_plan.html', /agenda.*\.pdf|\.pdf/i, 200);
  const pdf = p.links.find(l => /\.pdf$/i.test(l.href)); if (!pdf) return p;
  const h = await head(pdf.href); const r = await get(pdf.href); const b = Buffer.from(await r.arrayBuffer());
  return { pdf, h, bytes: b.length, fonts: (b.toString('latin1').match(/\/Font/g) || []).length, images: (b.toString('latin1').match(/\/Image/g) || []).length };
}, 3000);
for (const q of ['plats', 'plat tracker', 'recorded plats', 'subdivisions', 'subdivision plats Fort Bend', 'subdivisions Montgomery County', 'Harris County plats', 'Houston plat', 'Waller County subdivisions', 'Katy subdivisions', 'Conroe plats', 'Sugar Land plats', 'master planned community', 'development applications'])
  await time('agol ' + q, () => agol(q), 4000);
for (const u of ['https://www.fortbendcountytx.gov/', 'https://www.mctx.org/', 'https://www.co.waller.tx.us/', 'https://engineering.hctx.net/'])
  await time('county site ' + u, () => links(u, /plat|subdivision|development|engineering|gis|map/i, 40), 4000);
console.log('done');
