// Server runs (api/runs.js, api/_lib/jobs.mjs, api/_lib/runs/*): a Build with AI, renderings and a plan set started,
// worked in slices (as when the function's time runs out and the next call carries on), finished with no page open,
// and what they made written to the team's copy of the project. Everything external is faked: the team's database
// and storage (in memory), the AI, the image model, the sheet printer.
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import * as PS from '../lib/planset.mjs';
import * as PD from '../lib/plandesign.mjs';
import { sampleProject } from '../scripts/sample-project.mjs';

// ---- the team's database and storage, in memory (PostgREST site_projects + the project-media bucket) ----
const files = new Map(), rows = new Map();
const B = '/storage/v1/object/';
function fakeDb() {
  async function call(path, opts = {}) {
    const m = opts.method || 'GET', u = new URL('http://x' + path);
    if (u.pathname.startsWith(B + 'list/')) { const pre = JSON.parse(opts.body).prefix; return new Response(JSON.stringify([...files.keys()].filter(k => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map(k => ({ name: k.slice(pre.length), created_at: files.get(k).at })))); }
    if (u.pathname.startsWith(B + 'upload/sign/')) return new Response(JSON.stringify({ url: '/object/upload/sign/' + u.pathname.slice((B + 'upload/sign/').length) + '?token=t' }));
    if (u.pathname === B + 'project-media' && m === 'DELETE') { for (const k of JSON.parse(opts.body).prefixes) files.delete(k); return new Response('[]'); }
    if (u.pathname.startsWith(B + 'project-media/')) {
      const k = decodeURIComponent(u.pathname.slice((B + 'project-media/').length));
      if (m === 'POST') { const body = opts.body; files.set(k, { body: typeof body === 'string' ? Buffer.from(body) : Buffer.from(body), at: new Date().toISOString() + Math.random() }); return new Response('{}'); }
      if (!files.has(k)) throw new Error('GET ' + path + ' 400 {"error":"not_found","message":"Object not found"}');
      return new Response(files.get(k).body);
    }
    if (u.pathname === '/rest/v1/site_projects') {
      const id = (u.searchParams.get('id') || '').replace(/^eq\./, '');
      if (m === 'GET') { const r = rows.get(id); return new Response(JSON.stringify(r ? [r] : [])); }
      if (m === 'PATCH') { const r = rows.get(id), at = (u.searchParams.get('updated_at') || '').replace(/^eq\./, ''); if (!r || r.updated_at !== at) return new Response('[]'); const nr = JSON.parse(opts.body); rows.set(id, nr); return new Response(JSON.stringify([nr])); }
    }
    throw new Error('fake db: ' + m + ' ' + path);
  }
  return { url: 'https://db.test', call, json: async (p, o) => { const t = await (await call(p, o)).text(); return t ? JSON.parse(t) : null; } };
}
const db = fakeDb();
const R = await import('../api/runs.js'), build = await import('../api/_lib/runs/build.mjs'), renderRun = await import('../api/_lib/runs/render.mjs'), plansetRun = await import('../api/_lib/runs/planset.mjs');
const { jobStore } = await import('../api/_lib/jobs.mjs');
R.hooks.db = db; R.hooks.settleMs = 0; R.hooks.kick = async () => {}; // (the hand-on to the next slice: the test works the slices itself)
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
const call = async (method, body, query = {}, headers = {}) => { const res = mock(); await R.default({ method, body, query, headers: { 'x-forwarded-for': '8.8.8.8', host: 'app.test', ...headers } }, res); return res; };
const store = jobStore(db), settle = () => new Promise(res => setTimeout(res, 50));
// work a run to its end the way the server does it: one slice after another (each started by the last one's hand-on)
async function runOut(pid, id, max = 40) { let job, n = 0; for (let i = 0; i < 2000 && n < max; i++) { const cur = await store.get(pid, id); if (cur?.lease && cur.lease.until > Date.now()) { await new Promise(r => setTimeout(r, 50)); continue; } job = await R.slice(db, pid, id); n++; if (job.state !== 'running') return { job, slices: n }; } return { job, slices: n }; }

// ---- a real project: 16 acres of appraisal-district parcels near Waller, laid out as garden apartments ----
const project = await sampleProject(), pl = project.plans[0], pid = project.id;
rows.set(pid, { id: pid, name: project.name, doc: { ...project, updated: '2026-11-03T10:00:00.000Z' }, deleted: false, updated_by: 'x', updated_at: '2026-11-03T10:00:00.000Z' });
assert.ok(pl.elements.filter(e => e.kind === 'building').length > 5, 'a built option to start from');

// ---- not set up, ping, bad requests ----
{ R.hooks.db = null; delete process.env.SUPABASE_SECRET_KEY; let res = await call('GET', null, { ping: '1' }); assert.equal(res.code, 503, 'no team storage: the page runs it itself'); R.hooks.db = db; process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  res = await call('GET', null, { ping: '1' }); assert.deepEqual(res.body.kinds, ['build', 'render', 'planset']);
  res = await call('POST', { start: { id: 'bad id!', kind: 'build', pid } }); assert.equal(res.code, 400);
  res = await call('POST', { start: { id: 'abc123def', kind: 'build', pid, plid: pl.id, input: { plan: pl, ask: '' } } }); assert.equal(res.code, 400, 'no request: refused up front'); assert.match(res.body.error, /say what/);
  res = await call('POST', { work: { pid, id: 'abc123def' } }); assert.equal(res.code, 403, 'a slice can only be started by the server (its key)'); }

// ---- Build with AI: planned, read, laid out, reviewed, revised, compared; over several slices ----
{ const asked = [];
  build.hooks.shots = async svgs => svgs.map(() => 'data:image/jpeg;base64,AAAA');
  build.hooks.ai = async b => { asked.push(b.mode || 'program'); await settle();
    if (b.mode === 'strategy') return { status: 200, body: { strategies: [{ name: 'Garden walk-ups around a central green', settings: {}, buildings: {} }], pick: 0, why: 'the lot is deep' } };
    if (b.mode === 'review') return { status: 200, body: b.round === 1
      ? { reviews: b.options.map((o, i) => ({ option: i, score: 60 + i, verdict: 'Layout ' + (i + 1) + ' works.' })), ranking: b.options.map((_, i) => i).reverse(), revise: true, why: 'more units fit', program: { use: 'multifamily', units: 260, floors: 3 }, summary: 'first look' }
      : { reviews: b.options.map((o, i) => ({ option: i, score: 70 + i, verdict: 'Fine.' })), ranking: b.options.map((_, i) => i).reverse(), revise: false, summary: 'compared again' } };
    return { status: 200, body: { program: { use: 'multifamily', units: 240, floors: 3 }, setbacks: {}, summary: 'Garden apartments, 240 units.', assumptions: ['3 stories'] } }; };
  const input = { plan: pl, ask: '240 garden apartments, 3 stories', level: 'high', site: { acres: 16.16 }, facts: ['FEMA flood zone X'] };
  R.hooks.budgetMs = 71000; // a slice with room for little more than one step (a step needs 70 s left to start): the run has to carry on over several
  let res = await call('POST', { start: { id: 'build0001', kind: 'build', pid, plid: pl.id, input, by: 'Matthew' } }, {}, { origin: 'https://app.test' });
  assert.equal(res.code, 200, JSON.stringify(res.body)); assert.equal(res.body.job.state, 'running'); assert.ok(res.body.job.steps.length >= 4, 'the steps the page shows');
  await new Promise(r => setTimeout(r, 20)); // (the first slice started by the start call; let it settle before working the rest here)
  for (let i = 0; i < 200 && (await store.get(pid, 'build0001'))?.lease; i++) await new Promise(r => setTimeout(r, 50));
  const { job, slices } = await runOut(pid, 'build0001');
  R.hooks.budgetMs = null;
  assert.equal(job.state, 'done', job.error || job.lastError); assert.ok(slices >= 2, 'worked over several slices: ' + (slices + 1));
  assert.deepEqual(asked, ['strategy', 'program', 'review', 'review'], 'planned, read, reviewed, revised and compared again');
  res = await call('GET', null, { pid, id: 'build0001' });
  const run = res.body.result.run; assert.ok(run.variants.length >= 3 && run.variants.filter(v => v.elements?.length).length >= 2, 'layouts laid out by the engine');
  assert.ok(run.variants.some(v => v.revisedBy), 'the revised program’s layouts are among them'); assert.ok(run.pick && run.aiReviewed, 'the AI’s pick'); assert.match(run.note, /changed the program/);
  assert.ok(run.variants.every(v => v.m && v.chk && v.key && /^Layout \d+/.test(v.name)), 'named and measured as the page names them');
  assert.ok(run.read.chips.length && run.read.plan?.name, 'what the request was read as, and the AI’s plan');
  const saved = rows.get(pid).doc.plans.find(x => x.id === pl.id);
  assert.equal(saved.lastRun.pending, 'build0001', 'kept with the option in the team’s copy, waiting to go on the map'); assert.equal(saved.elements.length, pl.elements.length, 'the map is left for the page');
  assert.ok(JSON.stringify(saved.lastRun).length < 1.6e6, 'slimmed as the page keeps it');
  res = await call('GET', null, { pid }); assert.equal(res.body.jobs[0].id, 'build0001'); assert.equal(res.body.jobs[0].state, 'done'); }

// ---- the AI down: the request read from the words, the layouts as the engine ranked them ----
{ build.hooks.ai = async () => ({ status: 503, body: { error: 'off' } });
  await call('POST', { start: { id: 'build0002', kind: 'build', pid, plid: pl.id, input: { plan: pl, ask: '200 apartments, 3 stories', level: 'medium', site: {}, facts: [] } } });
  const { job } = await runOut(pid, 'build0002'); assert.equal(job.state, 'done');
  const r = (await store.data(pid, 'build0002')).result; assert.ok(r.run.variants.some(v => v.elements?.length)); assert.ok(!r.run.aiReviewed); }

// ---- a slice that dies: the run is picked up by the next page that asks about it ----
{ build.hooks.ai = async () => { throw new Error('boom'); };
  await call('POST', { start: { id: 'build0003', kind: 'build', pid, plid: pl.id, input: { plan: pl, ask: '120 apartments', level: 'low', site: {}, facts: [] } } });
  for (let i = 0; i < 100 && (await store.get(pid, 'build0003'))?.state === 'running'; i++) await new Promise(r => setTimeout(r, 50));
  assert.equal((await store.get(pid, 'build0003')).state, 'done', 'Low: no AI asked, done in the first slice');
  const j = { id: 'build0004', pid, plid: pl.id, kind: 'build', state: 'running', steps: ['x'], step: 1, label: '', created: new Date(Date.now() - 60000).toISOString(), updated: new Date(Date.now() - 60000).toISOString(), lease: { until: Date.now() - 1000, token: 'dead' } };
  await store.put(j); await store.putData(pid, j.id, { input: { plan: pl, ask: '100 apartments', level: 'low', site: {}, facts: [] }, phase: 'program', at: j.created });
  const res = await call('GET', null, { pid }); assert.equal(res.code, 200);
  for (let i = 0; i < 100 && (await store.get(pid, 'build0004'))?.state === 'running'; i++) await new Promise(r => setTimeout(r, 50));
  assert.equal((await store.get(pid, 'build0004')).state, 'done', 'a stalled run is started again by a page polling it'); }

// ---- cancel ----
{ await store.put({ id: 'build0005', pid, plid: pl.id, kind: 'build', state: 'running', steps: ['x'], step: 1, created: new Date().toISOString(), updated: new Date().toISOString(), lease: null });
  const res = await call('POST', { cancel: { pid, id: 'build0005' } }); assert.equal(res.body.job.state, 'cancelled');
  assert.equal((await R.slice(db, pid, 'build0005')).state, 'cancelled', 'nothing more is done'); }

// ---- renderings: the page's massing pictures, painted here one a slice, kept for the team and on the option ----
{ renderRun.hooks.key = 'sk-test'; renderRun.hooks.spend = async () => ({ spent: null }); renderRun.hooks.model = 'gpt-image-test'; let painted = 0;
  renderRun.hooks.paint = async (key, o) => { painted++; assert.ok(o.image.bytes.length > 10 && /Turn this 3D massing model/.test(o.prompt)); return { b64: Buffer.from('jpeg-' + painted).toString('base64'), model: 'gpt-image-test', size: '2048x1152' }; };
  let res = await call('POST', { upload: { pid, id: 'rend0001', names: ['corner.jpg', 'front.jpg'] } }); assert.ok(res.body.urls['corner.jpg'].startsWith('https://db.test/storage/v1/object/upload/sign/'));
  res = await call('POST', { upload: { pid, id: 'rend0001', names: ['../x.jpg'] } }); assert.equal(res.code, 400, 'only plain names');
  await store.file.put(pid, 'rend0001', 'corner.jpg', Buffer.from('massing-corner-jpeg'), 'image/jpeg'); await store.file.put(pid, 'rend0001', 'front.jpg', Buffer.from('massing-front-jpeg'), 'image/jpeg');
  res = await call('POST', { start: { id: 'rend0001', kind: 'render', pid, plid: pl.id, input: { views: [{ view: 'corner', file: 'corner.jpg' }, { view: 'front', file: 'front.jpg' }, { view: 'hero', file: 'front.jpg' }], brief: { acres: 16 }, o: { look: 'brick', time: 'golden', surround: 'none', res: 'hd', detail: 'high' }, sig: 's1', by: 'Matthew' } } });
  assert.equal(res.body.job.steps.length, 2, 'the retired close-up isn’t painted');
  for (let i = 0; i < 100 && (await store.get(pid, 'rend0001'))?.lease; i++) await new Promise(r => setTimeout(r, 50)); 
  const { job, slices } = await runOut(pid, 'rend0001'); assert.equal(job.state, 'done', JSON.stringify(job)); assert.equal(painted, 2); assert.ok(slices >= 1);
  const q = rows.get(pid).doc.plans.find(x => x.id === pl.id), recs = q.renders.filter(r => r.job === 'rend0001');
  assert.equal(recs.length, 2); assert.ok(recs.every(r => r.cloud && r.sig === 's1' && r.by === 'Matthew'));
  for (const r of recs) { const k = r.id.replace(/[^\w.-]+/g, '_'); assert.ok(files.has(pid + '/render/' + k + '.jpg') && files.has(pid + '/massing/' + k + '.jpg'), 'the picture and its massing in the team’s storage'); }
  assert.equal(q.lastRun.pending, 'build0004', 'the option’s other things are left as they were'); }

// ---- a plan set: Claude's notes and designs, every sheet printed, one PDF on the border, listed on the option ----
{ const doc1 = async () => { const d = await PDFDocument.create(); d.addPage([2592, 1728]).drawRectangle({ x: 10, y: 10, width: 100, height: 50 }); return d.save(); }, border = await doc1();
  let asked = 0; plansetRun.hooks.ai = async b => { asked++; if (b.mode === 'notes') return { notes: { description: 'Garden apartments.' }, model: 'claude-test' }; if (b.mode === 'disc') return { disc: { notes: ['n'], criteria: [] }, model: 'claude-test' }; throw Object.assign(new Error('no designs in this test'), { status: 500 }); };
  plansetRun.hooks.render = async () => doc1(); plansetRun.hooks.border = border;
  const pl2 = rows.get(pid).doc.plans.find(x => x.id === pl.id), sections = PS.pickSections(['site', 'arch']), types = PD.buildingTypes(pl2), sheets = PS.sheetList(pl2, { sections, renders: 0, types });
  const steps = [{ key: 'notes', kind: 'claude', label: 'Cover notes' }, ...types.filter(t => t.supported && t.use !== 'multifamily').map(t => ({ key: 'design:' + t.id, kind: 'claude', label: 'Design' })), ...sheets.map(sh => ({ key: sh.number, kind: 'sheet', label: sh.number })), { key: 'merge', kind: 'merge', label: 'Put together' }];
  const j = { id: 'set0001', no: '0', sig: 's1', sections, by: 'MS', madeBy: 'Matthew', at: new Date().toISOString(), date: 'November 3, 2026', revisions: [{ no: '0', date: '11/03/26', desc: 'Schematic design set' }], types, sheets, steps, base: { client: 'x', address: 'Waller', county: 'Waller County, Texas', parcels: project.parcels, facts: [], notes: [], vicinity: '' } };
  await call('POST', { start: { id: 'pset0001', kind: 'planset', pid, plid: pl.id, input: { job: j, plan: pl2, project: { name: project.name }, renders: [], terrain: { none: true } } } });
  for (let i = 0; i < 100 && (await store.get(pid, 'pset0001'))?.lease; i++) await new Promise(r => setTimeout(r, 50));
  const { job } = await runOut(pid, 'pset0001'); assert.equal(job.state, 'done', job.error || job.lastError); assert.ok(asked >= 1);
  const q = rows.get(pid).doc.plans.find(x => x.id === pl.id), set = q.sets.find(x => x.id === 'set0001');
  assert.ok(set?.cloud && set.sheets.length === sheets.length, 'every sheet in the set'); assert.equal(set.by, 'Matthew');
  const pdf = await PDFDocument.load(files.get(pid + '/set/set0001.pdf').body); assert.equal(pdf.getPageCount(), sheets.length, 'one PDF, a page a sheet');
  assert.ok(q.renders.some(r => r.job === 'rend0001'), 'the renderings made before are still there'); }

// ---- two runs writing to the project at once: both changes kept (each retried on the newer copy) ----
{ const { changeProject } = await import('../api/projects.js');
  await Promise.all([changeProject(db, pid, p => { p.notes = 'a'; }), changeProject(db, pid, p => { p.client = 'b'; })]);
  const d = rows.get(pid).doc; assert.equal(d.notes, 'a'); assert.equal(d.client, 'b'); }

console.log('runs ok: build over several slices with review and revision, AI down, a stalled run picked up, cancel, renderings and a plan set kept for the team, concurrent project changes');
