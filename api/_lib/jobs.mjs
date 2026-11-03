// Server runs (api/runs.js): a layout build, renderings or a plan set started from the page and carried on by the server,
// so a refresh, a closed tab or another page doesn't stop it, and anyone on the team sees it and gets what it made.
// A run lives in the project-media bucket beside the project's other files:
//   <project>/jobs/<id>.json        what the page shows: kind, state, steps, the step it's on, when, who (small)
//   <project>/jobs/<id>/data.json   what it works from and what it made so far (input, state, result)
//   <project>/jobs/<id>/cancel      there when someone pressed Cancel
//   <project>/jobs/<id>/files/...   pictures and pages it uploads or makes
// It's worked in slices: a slice claims the run (a lease, so two never work it at once), does steps until its time is
// nearly up, saves after each one, and hands on to the next slice (a call to itself; and any page polling a run whose
// lease has run out starts one too, so a slice that died is picked up). A step that throws is tried again in the next
// slice, three times at most.
import { storage } from './storage.mjs';
import * as RF from '../../lib/sitefiles.mjs';

export const ID = /^[a-z0-9]{6,32}$/, PID = /^[\w-]{3,60}$/;
export const STATES = ['running', 'done', 'failed', 'cancelled'];
const J = 'application/json';
const sleep = ms => new Promise(res => setTimeout(res, ms));

export function jobStore(db, bucket = RF.MEDIA_BUCKET) {
  const st = storage(db, bucket), base = (pid, id) => pid + '/jobs/' + id;
  const read = async path => { try { const r = await st.get(path); return JSON.parse(await r.text()); } catch (e) { if (/ 4\d\d /.test(e.message) || /not.?found/i.test(e.message)) return null; throw e; } };
  return {
    get: (pid, id) => read(base(pid, id) + '.json'),
    put: job => st.put(base(job.pid, job.id) + '.json', JSON.stringify(job), J),
    data: (pid, id) => read(base(pid, id) + '/data.json').then(d => d || {}),
    putData: (pid, id, d) => st.put(base(pid, id) + '/data.json', JSON.stringify(d), J),
    cancelled: async (pid, id) => !!(await read(base(pid, id) + '/cancel')),
    cancel: (pid, id) => st.put(base(pid, id) + '/cancel', '{"cancel":true}', J),
    // the runs of a project, newest first (the small records only)
    async list(pid, n = 12) {
      const files = ((await st.list(pid + '/jobs/')) || []).filter(f => /\.json$/.test(f.name)).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, n);
      return (await Promise.all(files.map(f => read(pid + '/jobs/' + f.name).catch(() => null)))).filter(Boolean).sort((a, b) => String(b.created).localeCompare(String(a.created)));
    },
    file: {
      put: (pid, id, name, body, type) => st.put(base(pid, id) + '/files/' + name, body, type),
      get: (pid, id, name) => st.get(base(pid, id) + '/files/' + name),
      signUpload: (pid, id, name) => st.signUpload(base(pid, id) + '/files/' + name),
      path: (pid, id, name) => base(pid, id) + '/files/' + name
    },
    media: st
  };
}

// a new run: kind.start(input) checks the input and says the steps; nothing is worked yet
export function newJob({ id, pid, plid, kind, by, origin }, started) {
  const now = new Date().toISOString();
  const job = { id, pid, plid: plid || null, kind, state: 'running', steps: started.steps || [], step: 1, label: started.label || '', created: now, updated: now, by: String(by || '').slice(0, 80), origin: origin || '', tries: 0, lease: null };
  return { job, data: started.data || {} };
}

// One slice of work on a run. kinds: { [kind]: { step(job, data, ctx), minMs } }. hooks.changeProject: (pid, fn) for
// steps that write to the project. Returns the run as it was left, and whether it wants another slice.
export async function work(db, pid, id, { kinds, budgetMs = null, now = () => Date.now(), ctx = {}, store = jobStore(db) } = {}) {
  let job = await store.get(pid, id);
  if (!job || job.state !== 'running') return { job, more: false };
  budgetMs = budgetMs || kinds[job.kind]?.budgetMs || 240000; // a kind's own share of the function's time (tests pass a smaller one)
  const t = now(); if (job.lease && job.lease.until > t) return { job, more: false, busy: true }; // another slice has it
  const token = Math.random().toString(36).slice(2, 12);
  job.lease = { until: t + budgetMs + 45000, token }; await store.put(job);
  await sleep(ctx.settleMs ?? 400); const mine = await store.get(pid, id); if (mine?.lease?.token !== token) return { job: mine, more: false, busy: true };
  const K = kinds[job.kind]; if (!K) { job.state = 'failed'; job.error = 'unknown kind of run'; job.lease = null; await store.put(job); return { job, more: false }; }
  const data = await store.data(pid, id), t0 = now(), left = () => budgetMs - (now() - t0), C = { ...ctx, left, db, store, job };
  try {
    while (job.state === 'running' && left() > (K.minMs || 60000)) {
      if (await store.cancelled(pid, id)) { job.state = 'cancelled'; job.label = 'Cancelled'; break; }
      await K.step(job, data, C);
      job.updated = new Date(now()).toISOString(); job.tries = 0;
      await store.putData(pid, id, data); await store.put({ ...job, lease: job.state === 'running' ? job.lease : null });
      if (K.oneStep) break; // (a step that uses the whole slice: a picture, a stretch of a plan set)
    }
  } catch (e) {
    job.tries = (job.tries || 0) + 1; job.lastError = String(e?.message || e).slice(0, 300);
    if (job.tries >= 3) { job.state = 'failed'; job.error = 'Stopped: ' + job.lastError; }
    await store.putData(pid, id, data).catch(() => {});
  }
  if (job.state === 'cancelled' && K.cancelled) await K.cancelled(job, data, C).catch(() => {});
  job.lease = null; job.updated = new Date(now()).toISOString(); await store.put(job);
  return { job, more: job.state === 'running' };
}

// what a page is shown of a run (no lease token)
export const view = job => job && { ...(job.steps2 ? { detail: job.steps2 } : {}), id: job.id, pid: job.pid, plid: job.plid, kind: job.kind, state: job.state, steps: job.steps, step: job.step, label: job.label, created: job.created, updated: job.updated, by: job.by, error: job.error || '', progress: job.progress ?? null, working: !!(job.lease && job.lease.until > Date.now()), ...(job.note ? { note: job.note } : {}) };
// a running run nobody is working (its lease ran out, or it never got one): needs a slice started
export const stalled = (job, t = Date.now()) => job?.state === 'running' && (!job.lease || job.lease.until < t) && t - Date.parse(job.updated || job.created) > 15000;
