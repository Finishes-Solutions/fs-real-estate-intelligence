// Diagnostic: run the Environmental Report (api/env.js) and the sites layer against the live services from a cloud
// server (Actions), plus the Comptroller company lookup. Run "Probe services" with script=env.
import { envReport, sitesInBox, tileUrl } from '../api/env.js';
import { circle } from '../api/crime.js';
import { lookupEntity } from '../api/entity.js';
const short = (o, n = 3000) => JSON.stringify(o).slice(0, n);
const time = async (name, fn, n) => { const t = Date.now(); try { const r = await fn(); console.log('##', name, '|', Date.now() - t, 'ms |', short(r, n)); return r; } catch (e) { console.log('##', name, '| ERROR', e.message, '|', Date.now() - t, 'ms'); } };
const brief = d => ({ area: d.area_sqmi, kinds: Object.fromEntries(Object.entries(d.kinds).map(([k, v]) => [k, v.error ? 'ERR ' + v.error : v.count + (v.onsite ? ' (' + v.onsite + ' on site)' : '') + (v.nearest?.[0] ? ' nearest ' + v.nearest[0].name + ' ' + v.nearest[0].mi + 'mi ' + (v.nearest[0].dir || '') : '') + (v.truncated ? ' TRUNC' : '')])), soils: Array.isArray(d.soils) ? d.soils.map(s => s.name + ' / ' + s.drainage + ' / ' + s.flooding) : d.soils });
for (const [name, p, mi] of [['downtown houston', [-95.3698, 29.7604], 0.1], ['katy freeway', [-95.8244, 29.7858], 0.1], ['baytown industrial', [-94.98, 29.75], 0.2], ['hempstead rural', [-96.08, 30.10], 0.1], ['pasadena refinery row', [-95.18, 29.72], 0.15]])
  await time('report ' + name, async () => brief(await envReport(circle(p[0], p[1], mi), { label: name })), 5000);
await time('report full sample', async () => { const d = await envReport(circle(-95.3698, 29.7604, 0.1)); return { lpst: d.kinds.lpst, pipelines: d.kinds.pipelines, wells: d.kinds.wells }; }, 4000);
for (const set of ['cleanup', 'tanks', 'epa'])
  await time('box ' + set, async () => { const d = await sitesInBox([-95.38, 29.75, -95.36, 29.77], set); return { n: d.sites.length, areas: d.areas.length, errors: d.errors, sample: d.sites.slice(0, 3) }; });
for (const l of ['rrc', 'wetlands', 'soils'])
  await time('tile ' + l, async () => { const r = await fetch(tileUrl(l, 15, 7671, 13561)); return { status: r.status, type: r.headers.get('content-type'), bytes: (await r.arrayBuffer()).byteLength }; });
for (const n of ['KATY ASIAN TOWN RETAIL CONDOMINIUM ASSOCIATION', 'WAL-MART REAL ESTATE BUSINESS TRUST', 'HOUSTON INDEPENDENT SCHOOL DISTRICT', 'SMITH JOHN', 'PROLOGIS-A4 TX LP', 'HINES REIT 1001 MAIN LLC'])
  await time('entity ' + n, () => lookupEntity(n), 2500);
console.log('done');
