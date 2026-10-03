// Diagnostic: run the site panel lookups (api/site.js), the economics build (build/econ.mjs) and the Houston crime parser
// against the live sources from a cloud server (Actions). Run "Probe services" with script=sources.
import { site } from '../api/site.js';
import { buildRates, buildUnemployment, buildRents, buildMortgages } from './econ.mjs';
import { HPD_CSV, parseHpd } from '../lib/crime.mjs';
const short = (o, n = 1400) => JSON.stringify(o).slice(0, n);
const time = async (name, fn) => { const t = Date.now(); try { const r = await fn(); console.log('##', name, '|', Date.now() - t, 'ms |', short(r)); return r; } catch (e) { console.log('##', name, '| ERROR', e.message, '|', Date.now() - t, 'ms'); } };
for (const [name, p, addr, zip] of [['downtown houston', [-95.3698, 29.7604], '1001 Main St', '77002'], ['katy', [-95.8244, 29.7858]], ['midtown bar street', [-95.3826, 29.7445], '2700 Milam St', '77006'], ['austin', [-97.7431, 30.2672]], ['5th ward OZ', [-95.335, 29.775]]])
  await time('site ' + name, () => site(p[0], p[1], { addr, zip }));
await time('rates', buildRates);
await time('unemployment', async () => { const u = await buildUnemployment(); return { state: u.state, metros: u.metros, n: Object.keys(u.counties).length, harris: u.counties['48201'], named: Object.values(u.counties).filter(c => c.name).length }; });
await time('rents', async () => { const r = await buildRents(); return { latest: r.latest, n: Object.keys(r.zips).length, z77002: r.zips['77002'], z77494: r.zips['77494'] }; });
await time('mortgages', () => buildMortgages(['48201', '48473']));
await time('hpd parse', async () => { const csv = await (await fetch(HPD_CSV(new Date().getUTCFullYear()))).text(); const rows = parseHpd(csv); const by = rows.reduce((m, r) => (m[r.cat] = (m[r.cat] || 0) + 1, m), {}); return { rows: rows.length, by, last: rows.reduce((m, r) => r.day > m ? r.day : m, ''), sample: rows[0] }; });
console.log('done');
