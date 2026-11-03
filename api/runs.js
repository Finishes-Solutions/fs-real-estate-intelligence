// Server runs (api/_lib/jobs.mjs): Build with AI, renderings and plan sets, worked by the server so they keep going when
// the page is refreshed or closed, and seen by everyone on the team.
//   GET ?ping=1                         -> { ok, kinds }   (503 when the team's storage isn't set up: the page runs them itself)
//   GET ?pid=<project>                  -> { jobs: [run] }  the project's runs, newest first; a stalled one is picked up
//   GET ?pid=&id=                       -> { job, result? } one run, with what it made once it's done
//   POST { start: { id, kind, pid, plid, input, by } }      -> { job }   kind: build | render | planset
//   POST { cancel: { pid, id } }                            -> { ok }
//   POST { upload: { pid, id, names: [..] } }               -> { urls: { name: signed upload URL } }  (pictures a run needs)
//   POST { work: { pid, id } } + x-run-key                  -> 202   (the server handing a run on to its next slice)
// Same team passcode as projects (FIELD_ACCESS_CODE, header x-field-code).
import crypto from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { rateLimit, sameOrigin, clip } from './_lib/guard.mjs';
import { conn } from './field.js';
import { jobStore, newJob, work, view, stalled, ID, PID } from './_lib/jobs.mjs';
import { changeProject } from './projects.js';
import * as build from './_lib/runs/build.mjs';
import * as renderRun from './_lib/runs/render.mjs';
import * as plansetRun from './_lib/runs/planset.mjs';

export const KINDS = { build, render: renderRun, planset: plansetRun };
export const hooks = { db: null, kick: null, budgetMs: null, settleMs: null };
const UPLOADS = /^[\w.-]{1,80}\.(jpg|png|json)$/;

// the key that lets a slice hand on to the next (only the server knows the secret it's made from)
const keyFor = (pid, id) => crypto.createHmac('sha256', String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'none')).update(pid + '/' + id).digest('hex');
const sameKey = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };
// the deployment that started the run (so a preview's runs stay on the preview's code); APP_URL only without a host
const originOf = req => { const h = req.headers['x-forwarded-host'] || req.headers.host; return h ? (req.headers['x-forwarded-proto'] || 'https') + '://' + h : (process.env.APP_URL || '').replace(/\/$/, ''); };

// the next slice: a call to this same endpoint, which answers at once and works the run after (waitUntil)
async function kick(job) {
  if (hooks.kick) return hooks.kick(job);
  if (!job.origin) return;
  const h = { 'Content-Type': 'application/json', 'x-run-key': keyFor(job.pid, job.id), ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {}) };
  await fetch(job.origin + '/api/runs', { method: 'POST', headers: h, body: JSON.stringify({ work: { pid: job.pid, id: job.id } }), signal: AbortSignal.timeout(15000) }).catch(e => console.warn('runs: hand-on failed', e.message));
}
// a slice, then the next one if it isn't finished (a run nobody hands on is picked up by the next page that polls it)
export async function slice(db, pid, id) {
  const { job, more } = await work(db, pid, id, { kinds: KINDS, budgetMs: hooks.budgetMs || null, ctx: { changeProject: (p, fn) => changeProject(db, p, fn, { by: 'server run' }), ...(hooks.settleMs != null ? { settleMs: hooks.settleMs } : {}) } });
  if (more) await kick(job);
  return job;
}
const later = p => { const q = p.catch(e => console.error('runs:', e.message)); try { waitUntil(q); } catch (e) { /* not on Vercel: it runs on anyway */ } return q; };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const b = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})) : {};
  const internal = req.method === 'POST' && b.work && sameKey(req.headers['x-run-key'], keyFor(String(b.work.pid), String(b.work.id)));
  if (!internal) {
    if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 240, perDay: 20000 })) return;
    const code = process.env.FIELD_ACCESS_CODE;
    if (code && String(req.headers['x-field-code'] || '') !== code) return res.status(401).json({ error: 'Enter the team passcode.', passcode: true });
  }
  const db = hooks.db || conn(); if (!db) return res.status(503).json({ error: 'Server runs need the team’s storage (SUPABASE_SECRET_KEY) on the site.', local: true });
  const S = jobStore(db), q = req.query || {};
  try {
    if (req.method === 'GET') {
      if (q.ping) return res.json({ ok: true, kinds: Object.keys(KINDS) });
      const pid = String(q.pid || ''); if (!PID.test(pid)) return res.status(400).json({ error: 'Which project?' });
      if (q.id) {
        const id = String(q.id); if (!ID.test(id)) return res.status(400).json({ error: 'Which run?' });
        const job = await S.get(pid, id); if (!job) return res.status(404).json({ error: 'No such run.' });
        if (stalled(job)) later(slice(db, pid, id));
        const out = { job: view(job) };
        if (job.state === 'done' && q.result !== '0') { const d = await S.data(pid, id); out.result = d.result ?? null; }
        return res.json(out);
      }
      const jobs = await S.list(pid);
      for (const j of jobs) if (stalled(j)) later(slice(db, pid, j.id));
      return res.json({ jobs: jobs.map(view) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });
    if (b.work) {
      if (!internal) return res.status(403).json({ error: 'Not allowed.' });
      later(slice(db, String(b.work.pid), String(b.work.id))); return res.status(202).json({ ok: true });
    }
    if (b.upload) {
      const { pid, id } = b.upload, names = (Array.isArray(b.upload.names) ? b.upload.names : []).slice(0, 20);
      if (!PID.test(String(pid)) || !ID.test(String(id)) || !names.every(n => UPLOADS.test(String(n)))) return res.status(400).json({ error: 'Bad upload.' });
      const urls = {}; for (const n of names) { const s = await S.file.signUpload(pid, id, n); urls[n] = db.url + '/storage/v1' + s.url; }
      return res.json({ urls });
    }
    if (b.cancel) {
      const { pid, id } = b.cancel; if (!PID.test(String(pid)) || !ID.test(String(id))) return res.status(400).json({ error: 'Which run?' });
      await S.cancel(pid, id); const job = await S.get(pid, id);
      if (job?.state === 'running' && !(job.lease && job.lease.until > Date.now())) { job.state = 'cancelled'; job.label = 'Cancelled'; job.updated = new Date().toISOString(); await S.put(job); }
      return res.json({ ok: true, job: view(job) });
    }
    if (b.start) {
      const { id, kind, pid, plid } = b.start;
      if (!ID.test(String(id)) || !PID.test(String(pid)) || !KINDS[kind]) return res.status(400).json({ error: 'Bad run.' });
      if (await S.get(pid, id)) return res.status(409).json({ error: 'That run has started already.' });
      let started; try { started = await KINDS[kind].start(b.start.input || {}, { db, store: S, pid, id }); } catch (e) { return res.status(400).json({ error: e.message }); }
      const { job, data } = newJob({ id, pid, plid: plid ? clip(plid, 60) : null, kind, by: clip(b.start.by, 80), origin: originOf(req) }, started);
      await S.putData(pid, id, data); await S.put(job);
      later(slice(db, pid, id));
      return res.json({ job: view(job) });
    }
    return res.status(400).json({ error: 'Nothing to do.' });
  } catch (e) {
    console.error('runs', e.message);
    return res.status(502).json({ error: 'The team storage didn’t answer: ' + clip(e.message, 160) });
  }
}
