// Quick layouts in a real browser (not part of npm test: it needs Chromium and the dev server). Opens the sample project's
// site plan, clicks each development type under Build and checks the layouts land in Layouts with no AI call: the page's
// projects requests go to the real API code against an in-memory Supabase; any AI endpoint is answered 500 and counted.
//   PORT=8799 node scripts/dev.mjs &   then   node test/quick-browser.mjs [port] [maplibre dist dir] [screenshot dir]
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fakeSupabase } from './helpers/fakesupa.mjs';
import { sampleProject } from '../scripts/sample-project.mjs';

const PORT = +(process.argv[2] || 8799), ML = process.argv[3] || '', SHOTS = process.argv[4] || '', BASE = 'http://127.0.0.1:' + PORT;
const FS = fakeSupabase(); process.env.SUPABASE_URL = FS.host; process.env.SUPABASE_SECRET_KEY = 'sb_secret_test'; delete process.env.FIELD_ACCESS_CODE; FS.install();
const projects = (await import('../api/projects.js')).default;
const project = await sampleProject(); project.id = 'samplequick1'; project.plans[0].id = 'samplequicka';
for (const k of ['elements', 'lastRun', 'variant']) delete project.plans[0][k]; project.plans[0].elements = [];
const pl = project.plans[0], pid = project.id;
FS.rows.set(pid, { id: pid, name: project.name, doc: { ...project, updated: '2026-11-03T10:00:00.000Z' }, deleted: false, updated_by: 'seed', updated_at: '2026-11-03T10:00:00.000Z' });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: SHOTS ? 2 : 1 });
await ctx.addInitScript(() => { try { localStorage.setItem('fs-team-name', 'Tester'); localStorage.setItem('fs-intro-seen', '1'); } catch (e) {} });
let aiCalls = 0;
await ctx.route(/\/api\/(siteplan|runs|chat|brief)(\?|$)/, route => { if (/ping=1/.test(route.request().url())) return route.fulfill({ status: 503, body: '{}' }); aiCalls++; console.log('AI-ish call:', route.request().method(), route.request().url(), (route.request().postData() || '').slice(0, 120)); return route.fulfill({ status: 500, body: '{}' }); });
await ctx.route(/\/api\/projects(\?|$)/, async route => {
  const rq = route.request(), u = new URL(rq.url());
  let body = rq.postData(); try { body = body ? JSON.parse(body) : undefined; } catch (e) { /* as is */ }
  const res = { code: 200, headers: {}, out: null, status(c) { this.code = c; return this; }, json(o) { this.out = JSON.stringify(o); this.headers['content-type'] = 'application/json'; return this; }, send(b) { this.out = b; return this; }, setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; }, end(b) { this.out = b ?? this.out; return this; } };
  await projects({ method: rq.method(), query: Object.fromEntries(u.searchParams), body, headers: { ...rq.headers(), host: '127.0.0.1:' + PORT, 'x-forwarded-for': '9.9.9.9' } }, res);
  await route.fulfill({ status: res.code, headers: res.headers, body: res.out ?? '' });
});
await ctx.route(FS.host + '/**', async route => { const rq = route.request(); const r = await FS.handle(rq.url(), { method: rq.method(), body: rq.postDataBuffer(), headers: rq.headers() }); await route.fulfill({ status: r.status, body: Buffer.from(await r.arrayBuffer()), headers: Object.fromEntries(r.headers) }); });
const BLANK = JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e8eae6' } }] });
await ctx.route(/api\.maptiler\.com|tiles\.openfreemap\.org|server\.arcgisonline/, route => /style|\/styles\//.test(route.request().url()) ? route.fulfill({ status: 200, contentType: 'application/json', body: BLANK }) : route.fulfill({ status: 404, body: '' }));
if (ML) await ctx.route('https://cdn.jsdelivr.net/npm/maplibre-gl@*/dist/**', route => route.fulfill({ path: ML + '/' + route.request().url().split('/dist/')[1] }));
const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
await page.goto(BASE + '/#v=map&sp=' + pid + '.' + pl.id, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#spDone', { timeout: 60000 });
const conf = page.getByRole('button', { name: /Confirm Site/ }); if (await conf.count()) await conf.first().click();
await page.waitForSelector('#spQuick', { timeout: 60000 }).catch(async e => { await page.screenshot({ path: (SHOTS || '/tmp') + '/quick-fail.png' }); console.log('errors:', errs.join(' | ').slice(0, 1500)); throw e; });
const types = await page.$$eval('[data-quick]', bs => bs.map(b => ({ id: b.dataset.quick, label: b.textContent, off: b.disabled })));
console.log('site types:', types.map(t => t.label + (t.off ? ' (off)' : '')).join(', '));
if (SHOTS) await (await page.$('#spQuick')).screenshot({ path: SHOTS + '/quick-panel.png' });
const want = (process.env.TYPES || 'multifamily,retail,industrial').split(',');
for (const id of want) {
  const t = types.find(x => x.id === id); if (!t || t.off) { console.log('skip', id); continue; }
  const t0 = Date.now();
  if (process.env.SF || process.env.BLDG) { await page.fill('#spQSf', process.env.SF || ''); await page.fill('#spQBld', process.env.BLDG || ''); }
  await page.click('[data-quick="' + id + '"]');
  await page.waitForSelector('[data-quick="' + id + '"][aria-pressed="true"]', { timeout: 180000 });
  await page.waitForFunction(() => !document.querySelector('#spRunPill:not([hidden])') && document.querySelectorAll('#spVariants [data-var], #spVariants [data-usevar]').length > 0, null, { timeout: 180000 });
  const names = await page.$$eval('#spVariants .sp-vname, #spVariants [data-var] b, #spVariants h4', els => els.map(e => e.textContent.trim()).filter(Boolean));
  const cnt = await page.textContent('.sp-lcount');
  console.log(id + ': ' + ((Date.now() - t0) / 1000).toFixed(1) + 's, layouts' + cnt + ' — ' + names.slice(0, 6).join(' | '));
  if (SHOTS) await page.screenshot({ path: SHOTS + '/quick-' + id + (process.env.SF ? '-sized' : '') + '.png' });
}
assert.equal(aiCalls, 0, 'no AI endpoint called');
assert.deepEqual(errs, [], 'no page errors');
await browser.close(); console.log('quick layouts in the browser ok'); process.exit(0);
