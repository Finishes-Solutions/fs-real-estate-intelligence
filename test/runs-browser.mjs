// Server runs in a real browser (not part of npm test: it needs Chromium and the dev server): a Build with AI, renderings
// and a plan set started from the page, the page reloaded while each runs, the run picked up again after the reload,
// and what it made on the map, in the list and in the team's copy. The page's projects, runs and files requests go to
// the real API code running here against an in-memory Supabase (test/helpers/fakesupa.mjs); the AI, the image model
// and the sheet printer are stand-ins (slowed so a reload lands mid-run). The map runs on a blank style.
//   PORT=8799 node scripts/dev.mjs &   then   node test/runs-browser.mjs [port] [maplibre dist dir]
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { fakeSupabase } from './helpers/fakesupa.mjs';
import { sampleProject } from '../scripts/sample-project.mjs';

const PORT = +(process.argv[2] || 8799), ML = process.argv[3] || '', BASE = 'http://127.0.0.1:' + PORT;
const FS = fakeSupabase(); process.env.SUPABASE_URL = FS.host; process.env.SUPABASE_SECRET_KEY = 'sb_secret_test'; delete process.env.FIELD_ACCESS_CODE; FS.install();
const { conn } = await import('../api/field.js');
const projects = (await import('../api/projects.js')).default, sitefiles = (await import('../api/sitefiles.js')).default;
const R = await import('../api/runs.js'), build = await import('../api/_lib/runs/build.mjs'), renderRun = await import('../api/_lib/runs/render.mjs'), plansetRun = await import('../api/_lib/runs/planset.mjs');
const wait = ms => new Promise(res => setTimeout(res, ms));
// the hand-on to the next slice, done here (the dev server's own api/runs doesn't see this Supabase)
R.hooks.kick = async job => { setTimeout(() => R.slice(conn(), job.pid, job.id).catch(e => console.error('slice', e)), 10); };
// stand-ins, slowed
const asked = [];
build.hooks.shots = async svgs => svgs.map(() => 'data:image/jpeg;base64,AAAA');
build.hooks.ai = async b => { asked.push(b.mode || 'program'); await wait(3000);
  if (b.mode === 'strategy') return { status: 200, body: { strategies: [{ name: 'Walk-ups around a green', settings: {}, buildings: {} }], pick: 0, why: 'deep lot' } };
  if (b.mode === 'review') return { status: 200, body: { reviews: b.options.map((o, i) => ({ option: i, score: 60 + i, verdict: 'Works.' })), ranking: b.options.map((_, i) => i).reverse(), revise: false, summary: 'Reviewed on the server.' } };
  return { status: 200, body: { program: { use: 'multifamily', units: 240, floors: 3 }, setbacks: {}, summary: 'Garden apartments, 240 units.' } }; };
renderRun.hooks.key = 'sk-test'; renderRun.hooks.spend = async () => ({ spent: null }); renderRun.hooks.model = 'gpt-image-test';
renderRun.hooks.paint = async (key, o) => { await wait(4000); return { b64: o.image.bytes.toString('base64'), model: 'gpt-image-test', size: '1600x900' }; };
const tinyPdf = async () => { const d = await PDFDocument.create(); d.addPage([2592, 1728]).drawRectangle({ x: 10, y: 10, width: 100, height: 50 }); return d.save(); };
plansetRun.hooks.ai = async b => { await wait(1500); if (b.mode === 'notes') return { notes: { description: 'Garden apartments.' }, model: 'claude-test' }; if (b.mode === 'disc') return { disc: { notes: ['n'], criteria: [] }, model: 'claude-test' }; throw Object.assign(new Error('no designs here'), { status: 500 }); };
plansetRun.hooks.render = async () => { await wait(400); return tinyPdf(); }; plansetRun.hooks.border = await tinyPdf();

// the project in the team's copy
const project = await sampleProject(); project.id = 'samplewaller1'; project.plans[0].id = 'sampleopta'; // (the app's own ids: letters and digits, as links to a plan take them)
const pl = project.plans[0], pid = project.id;
FS.rows.set(pid, { id: pid, name: project.name, doc: { ...project, updated: '2026-11-03T10:00:00.000Z' }, deleted: false, updated_by: 'seed', updated_at: '2026-11-03T10:00:00.000Z' });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => { try { localStorage.setItem('fs-team-name', 'Tester'); localStorage.setItem('fs-render-surround', 'none'); localStorage.setItem('fs-intro-seen', '1'); } catch (e) {} });
// the API code here, as Vercel would run it
const api = { projects, runs: R.default, sitefiles };
await ctx.route(/\/api\/(projects|runs|sitefiles)(\?|$)/, async route => {
  const rq = route.request(), u = new URL(rq.url()), name = u.pathname.split('/').pop();
  let body = rq.postData(); try { body = body ? JSON.parse(body) : undefined; } catch (e) { /* as is */ }
  const res = { code: 200, headers: {}, out: null, status(c) { this.code = c; return this; }, json(o) { this.out = JSON.stringify(o); this.headers['content-type'] = 'application/json'; return this; }, send(b) { this.out = b; return this; }, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, on() {} };
  await api[name]({ method: rq.method(), query: Object.fromEntries(u.searchParams), body, headers: { ...rq.headers(), host: '127.0.0.1:' + PORT, 'x-forwarded-for': '9.9.9.9' } }, res);
  await route.fulfill({ status: res.code, headers: res.headers, body: res.out ?? '' });
});
await ctx.route(FS.host + '/**', async route => { const rq = route.request(); const r = await FS.handle(rq.url(), { method: rq.method(), body: rq.postDataBuffer(), headers: rq.headers() }); await route.fulfill({ status: r.status, body: Buffer.from(await r.arrayBuffer()), headers: { 'access-control-allow-origin': '*' } }); });
// a blank map style; the map library from a local copy when given (the CDN may be out of reach)
const BLANK = JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e8eae6' } }] });
await ctx.route(/api\.maptiler\.com|tiles\.openfreemap\.org|server\.arcgisonline/, route => /style|\/styles\//.test(route.request().url()) ? route.fulfill({ status: 200, contentType: 'application/json', body: BLANK }) : route.fulfill({ status: 404, body: '' }));
if (ML) await ctx.route('https://cdn.jsdelivr.net/npm/maplibre-gl@*/dist/**', route => route.fulfill({ path: ML + '/' + route.request().url().split('/dist/')[1] }));
const page = await ctx.newPage(); const errs = [], logs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => logs.push(m.type() + ': ' + m.text().slice(0, 200)));
page.on('dialog', d => d.accept());
const doc = () => FS.rows.get(pid).doc, plan = () => doc().plans.find(x => x.id === pl.id);
const go = async url => { await page.goto('about:blank'); await page.goto(url, { waitUntil: 'domcontentloaded' }); }; // (a fresh load: a change after # alone isn't one)
async function until(fn, ms, what) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return; await wait(500); } throw new Error('timed out: ' + what); }

// ---- 1. Build with AI, reloaded mid-run ----
await go(BASE + '/#v=map&sp=' + pid + '.' + pl.id);
await page.waitForSelector('#spAsk', { timeout: 60000 }).catch(async e => { await page.screenshot({ path: process.env.SHOT || '/tmp/runs-browser.png' }); console.log('errors:', errs.join(' | ').slice(0, 1500)); throw e; });
const toBuild = async () => { if (!(await page.isVisible('#spAsk').catch(() => false))) await page.getByRole('button', { name: 'Build', exact: true }).first().click(); await wait(500); if (!(await page.isVisible('#spAsk').catch(() => false))) await page.getByRole('button', { name: 'New request' }).first().click().catch(() => {}); await page.waitForSelector('#spAsk', { state: 'visible', timeout: 30000 }).catch(async e => { await page.screenshot({ path: process.env.SHOT || '/tmp/runs-browser.png' }); throw e; }); };
await toBuild(); await page.fill('#spAsk', '240 garden apartments, 3 stories'); await page.click('#spGo');
await page.waitForSelector('#spRunCard', { timeout: 30000 });
await until(async () => /runs on the server/.test(await page.textContent('#spRunCard').catch(() => '')), 30000, 'the run card says it runs on the server');
await until(() => asked.length >= 2, 30000, 'the server run under way');
console.log('build: started on the server, reloading mid-run (AI asked: ' + asked.join(', ') + ')');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#spRunCard', { timeout: 60000 }); console.log('build: the run card is back after the reload');
await until(async () => !(await page.$('#spRunCard')) , 120000, 'the build to land');
await until(() => !plan().lastRun?.pending, 30000, 'the landed layouts synced to the team (pending cleared)');
assert.ok(plan().lastRun.variants.length >= 2 && plan().lastRun.summary === 'Reviewed on the server.', 'the reviewed layouts are on the option');
assert.ok(plan().variant?.key, 'a layout is on the map');
console.log('build: landed after the reload; pick ' + plan().variant.key + ', ' + plan().lastRun.variants.length + ' layouts');

// ---- 2. a build finishing while nobody has the plan open: put on the map at the next open ----
asked.length = 0;
await toBuild(); await page.fill('#spAsk', '200 apartments, 3 stories'); await page.click('#spGo');
await until(() => asked.length >= 1, 30000, 'the second build under way');
await go(BASE + '/#v=projects&pj=' + pid); // left: nobody has the plan open
await until(() => plan().lastRun?.pending, 120000, 'the server kept the finished build with the option');
await go(BASE + '/#v=map&sp=' + pid + '.' + pl.id);
await until(() => !plan().lastRun?.pending, 60000, 'put on the map when the option opened, and synced').catch(async e => { console.log('server pending', plan().lastRun?.pending, 'local', await page.evaluate(() => { try { const d = JSON.parse(localStorage.getItem('fs-projects-v1')); return JSON.stringify({ pending: d.projects[0].plans[0].lastRun?.pending, dirty: d.dirty, at: d.projects[0].plans[0].lastRun?.at, upd: d.projects[0].updated }); } catch (x) { return x.message; } }), 'server upd', doc().updated, FS.rows.get(pid).updated_at, 'console:', logs.slice(-15).join(' | ')); throw e; });
console.log('build: one that finished while nobody had it open went on the map at the next open');

// ---- 3. renderings from the project page, reloaded mid-paint ----
await go(BASE + '/#v=projects&pj=' + pid + '&pt=renderings');
await page.waitForSelector('#rsGo', { timeout: 60000 });
await page.selectOption('#rsView', 'all').catch(() => page.selectOption('#rsView', 'corner'));
const before = (plan().renders || []).length;
await page.click('#rsGo');
await until(async () => [...FS.files.keys()].some(k => k.includes('/jobs/') && k.endsWith('.jpg')), 90000, 'the massing pictures uploaded');
await until(() => (plan().renders || []).length > before, 60000, 'the first picture kept');
await page.reload({ waitUntil: 'domcontentloaded' });
await until(async () => /on the server/.test(await page.textContent('#view-projects').catch(() => '')), 30000, 'the painting run shown again after the reload');
await until(async () => !(await page.$('#rsStop')), 120000, 'the renderings to finish');
const made = plan().renders.filter(r => r.job);
assert.ok(made.length >= 2 && made.every(r => r.cloud), made.length + ' renderings kept for the team');
console.log('renderings: ' + made.length + ' painted on the server across a reload');

// ---- 4. a plan set, reloaded mid-run ----
await go(BASE + '/#v=projects&pj=' + pid + '&pt=plans');
await page.waitForSelector('#psMake', { timeout: 60000 }); await page.click('#psMake');
await page.waitForSelector('#psJob', { timeout: 60000 });
await until(async () => /on the server/.test(await page.textContent('#psJob').catch(() => '')), 60000, 'the set panel says it runs on the server');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#psJob', { timeout: 60000 }); console.log('plan set: the panel is back after the reload');
await until(() => (plan().sets || []).some(x => x.job), 240000, 'the set listed on the option');
const set = plan().sets.find(x => x.job);
assert.ok(FS.files.has(pid + '/set/' + set.id + '.pdf'), 'the PDF in the team’s storage');
console.log('plan set: issue ' + set.no + ', ' + set.sheets.length + ' sheets, made on the server across a reload');

assert.deepEqual(errs.filter(e => !/maplibre|WebGL|style|tile/i.test(e)), [], 'no page errors');
await browser.close();
console.log('runs-browser ok');
process.exit(0);
