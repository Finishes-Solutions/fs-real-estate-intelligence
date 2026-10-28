// Offline tests for the feasibility endpoint (api/feasibility.js) and the report set: the study summary, the CSVs, the
// workbook, the rendered report's checks, the narrative guard, and saving a set to Storage, against a stubbed Supabase
// and a stubbed Claude. The PDF is printed through local Chromium when one is found (test/helpers/chrome.mjs), else
// only its HTML is checked. Nothing here reaches the network.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
const { localChrome } = await import('./helpers/chrome.mjs'); const chrome = localChrome();
process.env.DATA_DIR = 'test/fixtures/fz/market/data'; // (api/_lib/data.mjs reads area.json / markets.json from here)
process.env.SUPABASE_URL = 'https://stub.supabase.test'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_test'; delete process.env.FIELD_ACCESS_CODE;
const calls = [];
globalThis.fetch = async (url, opts = {}) => { url = String(url); calls.push({ url, method: opts.method || 'GET', bytes: opts.body?.length ?? 0, type: opts.headers?.['Content-Type'] });
  if (url.startsWith('https://stub.supabase.test/storage/v1/object/sign/')) return new Response(JSON.stringify({ signedURL: '/object/sign/report-sets/x?token=t' }), { status: 200 });
  if (url.startsWith('https://stub.supabase.test/storage/v1/object/')) return new Response('{"Key":"ok"}', { status: 200 });
  throw new Error('unexpected network call in a test: ' + url); };
const API = await import('../api/feasibility.js'), P = await import('../lib/feasibility/pipeline.mjs'), M0 = await import('../lib/feasibility/model.mjs'), G = await import('../lib/feasibility/guards.mjs');
const kit = await import('../src/reportkit.js'), { feasibilityReport } = await import('../lib/reports/feasibility.mjs');

// the frozen market slice as the data files the endpoint loads
{ const fs = await import('node:fs/promises'), fx = JSON.parse(await readFile(new URL('./fixtures/fz/market/market-2026-10-24.json', import.meta.url))); await fs.mkdir('test/fixtures/fz/market/data', { recursive: true });
  await fs.writeFile('test/fixtures/fz/market/data/area.json', JSON.stringify(fx.area)); await fs.writeFile('test/fixtures/fz/market/data/markets.json', JSON.stringify(fx.markets)); }
const mk = (o, pts) => { const k = 364567 * Math.cos(o[1] * Math.PI / 180); return { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(([x, y]) => [o[0] + x / k, o[1] + y / 364567])] }; };
const parcel = M0.parcelFrom({ key: 'p1', label: 'FM 362 tract', acres: 7.72, landValue: 900000, zip: '77484', county: 'Waller', geometry: mk([-95.98, 30.06], [[0, 0], [920, 0], [920, 259], [822, 259], [822, 378], [0, 378]]) });
const site = P.siteFromParcels([parcel]), project = { id: 'api-test', name: 'API Test Apartments', client: 'Test Client', parcels: [parcel], plans: [P.autoLayout(site, { use: 'multifamily' })], fz: { ...M0.newFeasibility(), scenarios: [{ id: 's1', name: 'Rates +1%', overrides: { rate: 7.9 } }] } };

const mockRes = () => { const r = { code: 200, headers: {}, body: null, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, send(s) { r.body = s; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
const req = body => ({ method: 'POST', headers: { host: 'x.test', 'x-forwarded-for': '1.2.3.' + Math.floor(Math.random() * 250) }, query: {}, url: '/api/feasibility', body });
const call = async body => { const res = mockRes(); await API.default(req(body), res); return res; };

// ---- the study summary, with scenarios ----
let r = await call({ op: 'study', project }); assert.equal(r.code, 200, JSON.stringify(r.body).slice(0, 300));
assert.ok(r.body.study.pf.headline.totalCost > 0 && r.body.study.register.length > 20 && r.body.study.risks.length, 'a study summary');
assert.ok(!r.body.study.pf.R && !r.body.study.metrics, 'the summary leaves out the big arrays'); assert.deepEqual(r.body.scenarios.map(s => s.id), ['base', 's1']);
assert.ok(JSON.stringify(r.body).length < 1.5e6, 'the summary is small enough to send');
// ---- bad requests ----
assert.equal((await call({ op: 'study' })).code, 400); assert.equal((await call({ op: 'study', project: { id: '!' } })).code, 400);
{ const res = mockRes(); await API.default({ ...req({}), method: 'GET' }, res); assert.equal(res.code, 405); }
{ const res = mockRes(); await API.default({ ...req({ op: 'study', project }), headers: { host: 'x.test', origin: 'https://evil.test' } }, res); assert.equal(res.code, 403, 'same origin only'); }
assert.equal((await call({ op: 'file', kind: 'pdf', project: { ...project, plans: [] } })).code, 409, 'nothing to report without a layout');
process.env.FIELD_ACCESS_CODE = 'pass'; assert.equal((await call({ op: 'study', project })).code, 401, 'the team passcode'); delete process.env.FIELD_ACCESS_CODE;
// ---- CSVs and the workbook ----
r = await call({ op: 'file', kind: 'register', project }); assert.equal(r.code, 200); assert.match(r.body, /^Group,Item,Value,Source kind,Source,As of,Confidence\n/); assert.ok(r.body.includes('SOFR'), 'the register names the rate source');
r = await call({ op: 'file', kind: 'budget', project }); assert.ok(r.body.split('\n').length > 50 && r.body.includes('Division'), 'budget CSV');
r = await call({ op: 'file', kind: 'xlsx', project }); assert.equal(r.code, 200); const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.body);
assert.deepEqual(wb.worksheets.map(w => w.name), ['Summary', 'Assumptions', 'Budget', 'CSI', 'Monthly', 'Annual', 'Hold', 'Sensitivity', 'Scenarios', 'Risks']);
assert.ok(wb.getWorksheet('Assumptions').rowCount > 20 && wb.getWorksheet('Budget').rowCount > 50, 'workbook filled');
// ---- the report HTML passes its checks, with the scope statement and the register ----
const study = P.runStudy(project, { market: await API.marketFromData() });
const html = feasibilityReport(kit).reportHtml(study, { planSvg: '<svg/>', scenarios: P.compareScenarios(project, { market: await API.marketFromData() }) });
assert.deepEqual(G.checkRenderedHtml(html, { title: project.name }).problems, [], 'the report renders cleanly');
for (const s of ['not a permit set', 'Fact &amp; assumption register', 'Risk analysis', 'Budget line items', 'Sensitivity', 'Hold analysis', 'Scenarios', 'Rates +1%']) assert.ok(html.includes(s), 'the report has: ' + s);
// ---- the narrative guard: a paragraph that invents a number is dropped ----
const h = study.pf.headline;
assert.ok(G.checkNarrative('The project costs $' + (h.totalCost / 1e6).toFixed(1) + 'M and yields ' + (h.yoc * 100).toFixed(2) + '% on cost.', study).ok, 'numbers from the study pass');
assert.ok(!G.checkNarrative('Comparable sales suggest a value of $41.7M and 9.75% rent growth.', study).ok, 'invented numbers are caught');
assert.ok(!G.checkNarrative('Here is the report. Let me know if you would like more detail.', study).text.includes('Let me know'), 'chatter stripped');
{ process.env.FEASIBILITY_NARRATIVE = 'on'; process.env.ANTHROPIC_API_KEY = 'sk-ant-test'; const AN = await import('../lib/anthropic.mjs');
  const said = t => AN._setClient({ beta: { messages: { stream: () => ({ finalMessage: async () => ({ model: 'claude-test', stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: t }] }) }) } }, messages: { stream: () => ({ finalMessage: async () => ({ model: 'claude-test', stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: t }] }) }) } }, 'sk-ant-test');
  said('A lender will want to see rents near $9,999 a unit.'); let n = await API.narrativeFor(study); assert.equal(n.text, '', 'a made-up figure keeps the commentary off the report: ' + JSON.stringify(n));
  said('The yield on cost of ' + (h.yoc * 100).toFixed(2) + '% sits close to the market cap rate, so the deal depends on rents.'); n = await API.narrativeFor(study); assert.ok(n.text.startsWith('The yield on cost'), 'a grounded paragraph is kept: ' + JSON.stringify(n));
  delete process.env.FEASIBILITY_NARRATIVE; }
// ---- the PDF and saving the set (with Chromium when there is one) ----
if (chrome) {
  r = await call({ op: 'file', kind: 'pdf', project }); assert.equal(r.code, 200, JSON.stringify(r.body).slice(0, 300)); assert.equal(r.headers['Content-Type'], 'application/pdf'); assert.ok(r.body.subarray(0, 5).toString() === '%PDF-' && r.body.length > 50000, 'a real PDF');
  calls.length = 0; r = await call({ op: 'save', project, by: 'Tester' }); assert.equal(r.code, 200, JSON.stringify(r.body).slice(0, 300));
  const rep = r.body.report; assert.equal(rep.files.length, 5); assert.ok(rep.files.every(f => f.path.startsWith('projects/api-test/reports/' + rep.id + '/') && f.bytes > 0));
  assert.equal(calls.filter(c => c.method === 'POST' && c.url.includes('/storage/v1/object/report-sets/projects/api-test/reports/')).length, 5, 'five uploads to the platform’s own bucket');
  assert.ok(calls.every(c => c.url.startsWith('https://stub.supabase.test/')), 'only the platform’s (stubbed) Supabase was called');
  r = await call({ op: 'link', path: rep.files[0].path }); assert.match(r.body.url, /^https:\/\/stub\.supabase\.test\/storage\/v1\/object\/sign\//);
  assert.equal((await call({ op: 'link', path: '../../etc/passwd' })).code, 400, 'only report files can be linked');
  (await import('../lib/pdf.mjs')).closeBrowser();
} else console.log('fz api: no local Chromium, PDF and save skipped');
{ const saved = process.env.SUPABASE_SECRET_KEY; delete process.env.SUPABASE_SECRET_KEY; r = await call({ op: 'save', project }); assert.equal(r.code, 503); assert.ok(r.body.local, 'without storage the set downloads instead'); process.env.SUPABASE_SECRET_KEY = saved; }
console.log('fz api passed' + (chrome ? ' (with Chromium)' : ''));
