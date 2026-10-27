// The BIM worker: BIMCraft as a small HTTP service, since its binary can't run on Vercel (it needs glibc 2.35; see
// BIM-PLAN.md). POST /model { plan, name?, png? } with `Authorization: Bearer $BIM_WORKER_TOKEN`
//   plan: a site plan option as the app keeps it (lib/siteplan.mjs: { elements, … }, in feet)
//   -> { quantities (lib/bim.mjs takeoff), ifc, bimcraft, png (base64; png unless png: false), ms, version }
// GET /health -> { ok, version }. One model at a time (BIMCraft is quick: a five-building apartment plan takes ~6 s).
// Run: BIM_WORKER_TOKEN=… BIMCRAFT_CLI=/usr/local/bin/bimcraft-cli node worker/bim/server.mjs (PORT, 8080 by default)
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { runModel, cliPath } from '../../lib/bimrun.mjs';

const TOKEN = process.env.BIM_WORKER_TOKEN || '', MAX = 8 << 20;
let version = 'unknown'; try { version = execFileSync(cliPath(), ['--version']).toString().trim(); } catch { /* reported by /health */ }
const authed = req => { const got = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, '')), want = Buffer.from(TOKEN); return TOKEN && got.length === want.length && timingSafeEqual(got, want); };
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
let busy = Promise.resolve();

export const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return send(res, version === 'unknown' ? 503 : 200, { ok: version !== 'unknown', version });
  if (req.method !== 'POST' || req.url !== '/model') return send(res, 404, { error: 'POST /model or GET /health' });
  if (!authed(req)) return send(res, 401, { error: 'Missing or wrong token.' });
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > MAX) return send(res, 413, { error: 'Plan too big.' }); chunks.push(c); }
  let body; try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return send(res, 400, { error: 'Not JSON.' }); }
  if (!Array.isArray(body?.plan?.elements) || !body.plan.elements.some(e => e?.kind === 'building')) return send(res, 400, { error: 'The plan has no buildings to model.' });
  const job = busy.then(() => runModel(body.plan, { name: typeof body.name === 'string' ? body.name.slice(0, 80) : undefined, png: body.png !== false }));
  busy = job.catch(() => {});
  try {
    const r = await job;
    send(res, 200, { quantities: r.quantities, ifc: r.ifc.toString('base64'), bimcraft: r.bimcraft.toString('base64'), png: r.png ? r.png.toString('base64') : null, ms: r.ms, version });
  } catch (e) { send(res, 422, { error: 'BIMCraft could not build the model: ' + e.message }); }
});
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) server.listen(+process.env.PORT || 8080, () => console.log('BIM worker on', +process.env.PORT || 8080, version));
