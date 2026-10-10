// Feasibility package, preliminary site plan and parcel map for parcels picked on the map, made by the CRE report runner
// (a separate Vercel project; lib/runner.mjs explains the hand-off). Runs and their documents are kept in Supabase
// (report_runs, report_run_docs; supabase/migrations/20261018000000_report_runs.sql) so the whole team sees them.
//   POST { kind, parcels, options }        -> { id, status, expected }    start a run (parcels: lib/selection.mjs shape)
//   POST ?cb=<id>&sig=<sig>  (the runner)  -> { ok }                       one finished document
//   GET  ?id=<id>                          -> { run, docs:[{doc_type,title,ok,error,meta,bytes}] }
//   GET  ?id=<id>&doc=<doc_type>[&pdf=1]   -> the document as a web page, or as a PDF
//   GET  ?list=1                           -> { runs: [...] } the latest 40
// Setup (Vercel env): REPORT_RUNNER_URL (the runner's https://… address), REPORT_RUNNER_SECRET (its SHARED_SECRET),
// SUPABASE_URL + SUPABASE_SECRET_KEY. Optional: RUNNER_DAILY_CAP (runs a day, default 20), FIELD_ACCESS_CODE (the
// team passcode, also needed to start a run when set), PUBLIC_URL (this site's address, if callbacks should go to a
// different host than the one the request came in on).
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { supa } from '../lib/supa.mjs';
import { KINDS, DOCS, sign, verify, cleanOptions, requestsFor, expectedDocs, readDrop, runStatus } from '../lib/runner.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PARCELS = 20; // the runner's own PARCEL_MAX
const runnerUrl = () => String(process.env.REPORT_RUNNER_URL || '').replace(/\/+$/, '');
const secret = () => process.env.REPORT_RUNNER_SECRET || '';
const cbKey = () => process.env.RUNNER_CALLBACK_KEY || process.env.REPORT_RUNNER_SECRET || process.env.SUPABASE_SECRET_KEY || '';

// the parcels as sent by the browser, checked field by field (they go into a paid AI pipeline and into its prompts)
const str = (v, n) => v == null ? null : String(v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) || null;
const pos = v => { const n = +v; return Number.isFinite(n) && n > 0 && n < 1e12 ? n : null; };
const coord = c => Array.isArray(c) && c.length >= 2 && Number.isFinite(+c[0]) && Number.isFinite(+c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;
function cleanGeom(g) {
  if (!g || !/^(Multi)?Polygon$/.test(g.type) || !Array.isArray(g.coordinates)) return null;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; let n = 0;
  const ok = polys.length <= 50 && polys.every(rings => Array.isArray(rings) && rings.length <= 50 && rings.every(r => Array.isArray(r) && r.length >= 4 && (n += r.length) <= 20000 && r.every(coord)));
  return ok ? { type: g.type, coordinates: JSON.parse(JSON.stringify(g.coordinates, (k, v) => typeof v === 'number' ? Math.round(v * 1e7) / 1e7 : v)) } : null;
}
export function cleanParcels(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_PARCELS).map(p => p && typeof p === 'object' && coord(p.center) ? {
    propId: str(p.propId, 40), owner: str(p.owner, 200), situs: str(p.situs, 200), county: str(p.county, 40), city: str(p.city, 60), zip: str(p.zip, 10),
    landUse: str(p.landUse, 120), yearBuilt: str(p.yearBuilt, 10), legal: str(p.legal, 400), zoning: str(p.zoning, 200), source: str(p.source, 60) || 'Map selection',
    landValue: pos(p.landValue), improvementValue: pos(p.improvementValue), marketValue: pos(p.marketValue), acres: pos(p.acres) && Math.min(pos(p.acres), 1e5), sqft: pos(p.sqft),
    geometry: cleanGeom(p.geometry), center: [+p.center[0], +p.center[1]], regridId: str(p.regridId, 60)
  } : null).filter(Boolean);
}

function origin(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host, proto = req.headers['x-forwarded-proto'] || 'https';
  return proto + '://' + host;
}
const passcodeOk = req => !process.env.FIELD_ACCESS_CODE || req.headers['x-field-code'] === process.env.FIELD_ACCESS_CODE;
const runCols = 'id,kind,label,status,expected,options,site,error,created_at,updated_at';

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
  const t = await r.text(); let d = null; try { d = JSON.parse(t); } catch (e) {}
  if (!r.ok) throw new Error('The report runner answered ' + r.status + (d?.error ? ': ' + d.error : ''));
  return d;
}

// ---- the runner calling back with a document ----
async function callback(req, res, db) {
  const id = String(req.query.cb || '');
  if (!UUID.test(id) || !verify(id, req.query.sig, cbKey())) return res.status(403).json({ error: 'bad signature' });
  const run = (await db.select('report_runs', 'id=eq.' + id + '&select=' + runCols))[0];
  if (!run) return res.status(404).json({ error: 'no such run' });
  const body = req.body && typeof req.body === 'object' ? req.body : (() => { try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; } })();
  const d = readDrop(body);
  if (d.kickoff) {
    // the risk stage asks for the concept renderings; only when the person asked for them (they cost extra)
    if (run.options?.images) {
      try { await post(runnerUrl() + '/api/run-images', { ...d.kickoff, callbackUrl: callbackFor(req, id), test_mode: true, ...(secret() ? { secret: secret() } : {}) }); }
      catch (e) { await saveDoc(db, run, { doc_type: 'images', ok: false, title: DOCS.images, name: '', html: '', error: 'Renderings didn’t start: ' + e.message, meta: {} }); }
    }
    return res.json({ ok: true });
  }
  if (d.note) return res.json({ ok: true, ignored: d.note });
  await saveDoc(db, run, d.doc);
  return res.json({ ok: true });
}
async function saveDoc(db, run, doc) {
  await db.upsert('report_run_docs', [{ run_id: run.id, ...doc, bytes: doc.html.length, created_at: new Date().toISOString() }], 'run_id,doc_type');
  const docs = await db.select('report_run_docs', 'run_id=eq.' + run.id + '&select=doc_type,ok');
  const status = runStatus(run.expected || [], docs);
  await db.update('report_runs', 'id=eq.' + run.id, { status, updated_at: new Date().toISOString(), ...(doc.ok ? {} : { error: (doc.title + ': ' + doc.error).slice(0, 2000) }) });
}
const callbackFor = (req, id) => origin(req) + '/api/runner?cb=' + id + '&sig=' + sign(id, cbKey());

// ---- start a run ----
async function start(req, res, db) {
  if (!runnerUrl()) return res.status(503).json({ error: 'The feasibility report runner isn’t connected to this site yet (REPORT_RUNNER_URL is missing on the server).' });
  if (!cbKey()) return res.status(503).json({ error: 'The report runner needs REPORT_RUNNER_SECRET (or RUNNER_CALLBACK_KEY) on the server to sign its callbacks.' });
  if (!passcodeOk(req)) return res.status(401).json({ error: 'Enter the team passcode first.', code: true });
  const b = req.body || {}, kind = String(b.kind || '');
  if (!KINDS[kind]) return res.status(400).json({ error: 'Unknown report: ' + kind });
  const parcels = cleanParcels(b.parcels);
  if (!parcels.length) return res.status(400).json({ error: 'Pick at least one parcel on the map first.' });
  const opts = cleanOptions(b.options);
  // a team-wide daily ceiling: each feasibility run is several long AI calls with web search
  const cap = Math.max(1, +process.env.RUNNER_DAILY_CAP || 20), since = new Date(Date.now() - 864e5).toISOString();
  const today = await db.select('report_runs', 'kind=eq.feasibility&created_at=gte.' + since + '&select=id&limit=' + (cap + 1));
  if (kind === 'feasibility' && today.length >= cap) return res.status(429).json({ error: 'The team has run ' + cap + ' feasibility packages in the last 24 hours, the daily limit. Site plans and parcel maps still work.' });
  let reqs;
  try { reqs = requestsFor(kind, parcels, opts, { callbackUrl: 'pending', secret: secret() }); } catch (e) { return res.status(400).json({ error: e.message }); }
  const expected = expectedDocs(kind, parcels, opts);
  const site = { parcels: parcels.map(p => ({ propId: p.propId, owner: p.owner, situs: p.situs, county: p.county, acres: p.acres, center: p.center, source: p.source })),
    acres: reqs[0].body.total_acres || null, label: label(parcels) };
  const run = await db.insertOne('report_runs', { kind, label: site.label, status: 'running', expected, options: opts, site });
  const cb = callbackFor(req, run.id);
  try {
    for (const r of reqs) await post(runnerUrl() + r.endpoint, { ...r.body, callbackUrl: cb, idColumn: 'MAP-' + run.id.slice(0, 8) });
  } catch (e) {
    await db.update('report_runs', 'id=eq.' + run.id, { status: 'failed', error: e.message.slice(0, 2000), updated_at: new Date().toISOString() });
    return res.status(502).json({ error: e.message, id: run.id });
  }
  return res.json({ id: run.id, status: 'running', expected, label: site.label });
}
function label(parcels) {
  const first = parcels.find(p => p.situs)?.situs || parcels[0].propId || 'Selected parcel';
  return parcels.length > 1 ? first + ' + ' + (parcels.length - 1) + ' more' : first;
}

// ---- reading ----
const CSP = "sandbox; default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data:";
async function read(req, res, db) {
  const q = req.query;
  if (q.list) return res.json({ runs: await db.select('report_runs', 'select=' + runCols + '&order=created_at.desc&limit=40') });
  const id = String(q.id || ''); if (!UUID.test(id)) return res.status(400).json({ error: 'id needed' });
  if (q.doc) {
    const t = String(q.doc); if (!DOCS[t]) return res.status(400).json({ error: 'unknown document' });
    const doc = (await db.select('report_run_docs', 'run_id=eq.' + id + '&doc_type=eq.' + t + '&select=title,name,html,ok'))[0];
    if (!doc?.ok || !doc.html) return res.status(404).json({ error: 'That document isn’t ready.' });
    if (q.pdf) {
      if (!rateLimit(req, res, { perMinute: 6, perDay: 200 })) return;
      const { render } = await import('./pdf.js');
      const pdf = await render(doc.html, { title: doc.title });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="' + (doc.name || doc.title + '.pdf').replace(/[^\w.() -]+/g, '_') + '"');
      return res.status(200).send(Buffer.from(pdf));
    }
    // the runner's own HTML, shown as it is but with no scripts and nothing loaded but images
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Content-Security-Policy', CSP); res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(doc.html);
  }
  const run = (await db.select('report_runs', 'id=eq.' + id + '&select=' + runCols))[0];
  if (!run) return res.status(404).json({ error: 'No such run.' });
  const docs = await db.select('report_run_docs', 'run_id=eq.' + id + '&select=doc_type,title,name,ok,error,meta,bytes,created_at&order=created_at');
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ run, docs });
}

export default async function handler(req, res) {
  const db = supa();
  if (!db) return res.status(503).json({ error: 'Report runs need SUPABASE_URL and SUPABASE_SECRET_KEY on the server.' });
  try {
    if (req.method === 'POST' && req.query?.cb) return await callback(req, res, db); // server to server: no origin check
    if (!sameOrigin(req, res)) return;
    if (req.method === 'POST') { if (!rateLimit(req, res, { perMinute: 4, perDay: 40 })) return; return await start(req, res, db); }
    if (req.method === 'GET') return await read(req, res, db);
    return res.status(405).json({ error: 'GET or POST' });
  } catch (e) {
    console.error('runner', e.message);
    return res.status(502).json({ error: e.message });
  }
}
