// The MCP plan_set and plan_set_status tools (lib/mcp/planset.mjs): a set made on the server from a saved site plan, as a
// job worked on across calls. Claude, the sheet printer, the border and the clock are stood in for (each Claude answer
// takes 40 s of the fake clock, so a set needs several calls, as a real one does); storage is in memory.
// Covers: the whole set across calls, a design fixed on its second try, Claude off (standard notes, rule-based designs),
// another call holding the job, and the plain-words errors.
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), P = await import('../lib/planset.mjs');
const ST = await import('../lib/mcp/store.mjs'), PSET = await import('../lib/mcp/planset.mjs'), { callTool, TOOLS } = await import('../lib/mcp/server.mjs');

// the 7.7 acre FM 362 lot (test/planset.mjs) laid out as townhomes: building types the set can design
const mk = (o, pts) => { const k = 364567 * Math.cos(o[1] * Math.PI / 180); return { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(([x, y]) => [o[0] + x / k, o[1] + y / 364567])] }; };
const b = S.unionParcels([mk([-95.98, 30.06], [[0, 0], [920, 0], [920, 259], [822, 259], [822, 378], [0, 378]])]);
const site = { ...b, front: b.ring.findIndex((p, i) => S.outwardOf(b.ring, i)[0] < -0.9), setbacks: { ...S.SETBACKS } };
const o = L.layoutOptions(site, { use: 'townhomes' })[0], plan = { ...site, name: 'A', elements: o.elements, zones: o.zones, program: o.program };

const mem = ST.memoryStore(); ST.hooks.store = mem;
const save = (id, extra = {}) => ST.putJSON(mem, 'plans/' + id + '.json', { v: 1, id, plan, layout: 'Layout 1', verdict: 'ready', fails: 0, request: 'townhomes', projectName: 'FM 362 Townhomes', preparedFor: 'Acme Holding Group',
  address: 'FM 362, Waller, TX 77484', county: 'Waller County, Texas', parcels: [{ label: 'FM 362', owner: 'ACME LAND LP', propId: '123456', acres: 7.7 }], facts: ['FEMA flood zone X — outside the 100-year floodplain.'], checks: [], boundarySource: 'the county appraisal district parcel outline', vicinity: '', ...extra });
await save('plan0000001');

// stand-ins: a fake clock, Claude, the printer (a one-page 36 x 24 PDF titled for the sheet) and the border
let T = 0; PSET.hooks.now = () => T; PSET.hooks.waitStepMs = 1;
const page = async title => { const d = await PDFDocument.create(); d.setTitle(title || 'x'); d.addPage([2592, 1728]).drawRectangle({ x: 10, y: 10, width: 20, height: 20 }); return Buffer.from(await d.save()); };
// with CHROME_PATH (a local Chrome) the sheets are printed for real and laid on the real border; MCP_DUMP=<dir> keeps the set
if (!process.env.CHROME_PATH) { PSET.hooks.render = async (html, { title }) => { assert.match(html, /^<!doctype html>/); return page(title); }; PSET.hooks.border = await page('border'); }
const calls = [];
const goodAI = async body => { calls.push(body.mode + (body.discipline ? ':' + body.discipline : '') + (body.type ? ':' + body.type : '')); T += 40000;
  if (body.mode === 'notes') return { notes: { description: 'Townhomes on FM 362.', general_notes: ['Note one.'], codes: ['IRC 2021'], next_steps: ['Boundary survey.'] }, model: 'claude-test' };
  if (body.mode === 'disc') return { disc: { notes: ['A ' + body.discipline + ' note.'], criteria: [{ item: 'Basis', value: 'Schematic' }] }, model: 'claude-test' };
  return { design: body.previous ? body.seed : { rooms: [] }, model: 'claude-test' }; }; // the first design fails the checks, the fix passes
PSET.hooks.ai = goodAI;
const text = r => r.content.find(c => c.type === 'text').text;

// ---------- a whole set, across calls ----------
let r = await callTool('plan_set', { plan_id: 'plan0000001', sections: ['civil', 'landscape', 'arch', 'structural', 'mechanical', 'plumbing', 'electrical', 'fire'] });
assert.notEqual(r.isError, true, text(r));
assert.match(text(r), /Not finished\. Call plan_set_status with job_id "([\w-]+)"/, 'a set takes more than one call');
const jobId = /job_id "([\w-]+)"/.exec(text(r))[1];
let n = 0;
while (!/Download:/.test(text(r)) && n++ < 12) { T += 1000; r = await callTool('plan_set_status', { job_id: jobId }); assert.notEqual(r.isError, true, text(r)); }
assert.ok(n > 1, 'worked on across several calls (' + n + ')');
const job = await ST.getJSON(mem, 'jobs/' + jobId + '/job.json');
assert.equal(job.state, 'done'); assert.ok(!job.lease, 'the lease is given back');
assert.ok(job.steps.every(x => x.status === 'done'), 'every step done: ' + job.steps.filter(x => x.status !== 'done').map(x => x.key + ' ' + x.status + ' ' + (x.note || '')).join('; '));
assert.ok(job.sheets.length >= 20, 'a full set (' + job.sheets.length + ' sheets)'); assert.ok(!job.sheets.some(s => s.section === 'renderings' || s.section === 'fuel' || s.section === 'telecom'));
const types = job.types.filter(t => t.supported); assert.ok(types.length >= 1);
for (const t of types) assert.equal(job.designBy[t.id], 'Claude', 'type ' + t.id + ' designed by Claude');
assert.ok(job.steps.filter(x => x.key.startsWith('design:')).every(x => x.note === 'fixed in 2 tries'), 'the failing design went back with its problems');
assert.equal(calls.filter(c => c === 'notes').length, 1, 'each Claude step once'); assert.equal(calls.filter(c => c.startsWith('disc:')).length, job.steps.filter(x => x.key.startsWith('disc:')).length);
const t1 = text(r);
assert.match(t1, new RegExp(job.sheets.length + ' sheets on 24 × 36')); assert.match(t1, /Site & civil: C-001 Existing conditions; C-101 Overall site plan/); assert.match(t1, /Building designs: Type A — .*: Claude/);
assert.match(t1, /Claude: claude-test/); assert.match(t1, /Download: https:\/\/storage\.test\/mcp\/jobs\/[\w-]+\/fm-362-townhomes-plan-set\.pdf/); assert.match(t1, /not for construction, bidding or permit/);
// a small set comes with the PDF itself (stand-in sheets); a real one is a few MB and comes as a link
const res = r.content.find(c => c.type === 'resource'), big = job.file.size > (await import('../lib/mcp/reports.mjs')).PDF_LIMIT;
assert.equal(!!res, !big, 'the PDF itself only when it fits'); assert.equal(r.content.some(c => c.type === 'resource_link'), big, 'a link when it doesn’t');
if (res) assert.equal(res.resource.mimeType, 'application/pdf');
const setBytes = await mem.get(job.file.path), set = await PDFDocument.load(setBytes); assert.equal(set.getPageCount(), job.sheets.length, 'one page a sheet, in one PDF');
assert.match(set.getTitle(), /FM 362 Townhomes — Layout 1 — Schematic design set, issue 0/);
if (process.env.MCP_DUMP) (await import('node:fs')).writeFileSync(process.env.MCP_DUMP + '/plan-set.pdf', setBytes);
// asked again: the set again, with a new link
r = await callTool('plan_set_status', { job_id: jobId }); assert.match(text(r), /Download:/);
// a big set: a link instead of the PDF
{ const PDF_LIMIT = (await import('../lib/mcp/reports.mjs')).PDF_LIMIT, j = await ST.getJSON(mem, 'jobs/' + jobId + '/job.json'); j.file.size = PDF_LIMIT + 1; await ST.putJSON(mem, 'jobs/' + jobId + '/job.json', j);
  r = await callTool('plan_set_status', { job_id: jobId }); const link = r.content.find(c => c.type === 'resource_link'); assert.ok(link, 'a resource link'); assert.equal(link.mimeType, 'application/pdf'); assert.match(link.uri, /^https:\/\/storage\.test\//);
  assert.equal(r.content.some(c => c.type === 'resource'), false); }
console.log('mcp plan_set: a whole set across calls ok (' + job.sheets.length + ' sheets, ' + n + ' status calls)');

// ---------- Claude off: standard notes and rule-based designs, the set still made ----------
PSET.hooks.ai = async () => { T += 1000; throw Object.assign(new Error('no key'), { status: 503 }); };
r = await callTool('plan_set', { plan_id: 'plan0000001', sections: ['civil', 'arch'] });
for (let k = 0; k < 6 && !/Download:/.test(text(r)); k++) { const id = /job_id "([\w-]+)"|Job: ([\w-]+)/.exec(text(r)); r = await callTool('plan_set_status', { job_id: id[1] || id[2] }); }
assert.match(text(r), /Download:/); assert.match(text(r), /Claude: not used \(Claude isn’t set up on this deployment/); assert.match(text(r), /Type A — .*: rule-based/);
console.log('mcp plan_set without Claude ok');

// ---------- another call holding the job; the plain-words errors ----------
PSET.hooks.ai = goodAI;
r = await callTool('plan_set', { plan_id: 'plan0000001' }); const held = /job_id "([\w-]+)"/.exec(text(r))[1];
{ const j = await ST.getJSON(mem, 'jobs/' + held + '/job.json'); j.lease = { by: 'someone', until: T + 600000 }; await ST.putJSON(mem, 'jobs/' + held + '/job.json', j); }
r = await callTool('plan_set_status', { job_id: held, wait_seconds: 0 }); assert.match(text(r), /Another call is working on it right now/); assert.match(text(r), /Not finished/);
r = await callTool('plan_set', { plan_id: 'nope00000000' }); assert.equal(r.isError, true); assert.match(text(r), /no saved site plan with plan_id nope00000000/);
r = await callTool('plan_set', {}); assert.equal(r.isError, true); assert.match(text(r), /Give the plan_id a site_plan answer gave/);
r = await callTool('plan_set', { plan_id: 'plan0000001', sections: ['civil', 'gas'] }); assert.equal(r.isError, true); assert.match(text(r), /Unknown section: gas/);
r = await callTool('plan_set_status', { job_id: 'nojob0000000' }); assert.equal(r.isError, true); assert.match(text(r), /no plan set job nojob0000000/);
ST.hooks.store = null; { const k = process.env.SUPABASE_SECRET_KEY, k2 = process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_SECRET_KEY; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  r = await callTool('plan_set', { plan_id: 'plan0000001' }); assert.equal(r.isError, true); assert.match(text(r), /Plan sets need storage/);
  if (k) process.env.SUPABASE_SECRET_KEY = k; if (k2) process.env.SUPABASE_SERVICE_ROLE_KEY = k2; }
// listed with the other tools; renderings a section to ask for, not a default; a set asking for renderings a plan doesn't have says so
{ const t = TOOLS.find(x => x.name === 'plan_set'); assert.ok(t.inputSchema.required.includes('plan_id')); assert.ok(t.inputSchema.properties.sections.items.enum.includes('renderings')); assert.ok(!PSET.DEFAULT_SECTIONS.includes('renderings')); assert.ok(TOOLS.some(x => x.name === 'plan_set_status')); }
ST.hooks.store = mem; r = await callTool('plan_set', { plan_id: 'plan0000001', sections: ['renderings'] }); assert.match(text(r), /Renderings: none kept for this plan yet/); ST.hooks.store = null;
console.log('mcp plan_set errors ok');
if (process.env.CHROME_PATH) await (await import('../lib/pdf.mjs')).closeBrowser();
console.log('mcp plan_set tests passed');
