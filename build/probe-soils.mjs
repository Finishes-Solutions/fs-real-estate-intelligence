// Diagnostic: USDA Soil Data Access response times for different site shapes. Run "Probe services" with script=soils.
import { soilsQuery } from '../lib/env.mjs';
import { soils } from '../api/env.js';
import { circle } from '../api/crime.js';
const SDA = 'https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest';
const run = async (name, q) => { const t = Date.now(); try { const r = await fetch(SDA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'JSON+COLUMNNAME', query: q }), signal: AbortSignal.timeout(40000) }); const x = await r.text(); console.log('##', name, r.status, Date.now() - t, 'ms', x.slice(0, 300)); } catch (e) { console.log('##', name, 'ERR', e.message, Date.now() - t, 'ms'); } };
const sq = { type: 'Polygon', coordinates: [[[-95.83, 29.78], [-95.82, 29.78], [-95.82, 29.79], [-95.83, 29.79], [-95.83, 29.78]]] };
await run('square 5pt', soilsQuery(sq));
for (const n of [8, 16, 32]) { const c = circle(-95.82, 29.785, 0.1); const r = c.coordinates[0], step = Math.ceil(r.length / n); await run('circle ' + n, soilsQuery({ type: 'Polygon', coordinates: [r.filter((_, i) => i % step === 0).concat([r[0]])] })); }
await run('circle full', soilsQuery(circle(-95.82, 29.785, 0.1)));
await run('point', "SELECT mu.mukey, mu.muname FROM mapunit mu WHERE mu.mukey IN (SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(-95.82 29.785)'))");
const t = Date.now(); try { const s = await soils(circle(-95.82, 29.785, 0.1)); console.log('## soils() ', Date.now() - t, 'ms', JSON.stringify(s).slice(0, 300)); } catch (e) { console.log('## soils() ERR', e.message, Date.now() - t); }
console.log('done');
