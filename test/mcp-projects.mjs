// The MCP project tools (lib/mcp/projects.mjs): list, read, create and change the team's projects, the feasibility study
// and its report set, through the server's own tool calls. The team database is an in-memory stand-in for Supabase
// (site_projects rows and storage), the market is the frozen slice the feasibility tests use, and every other request is
// refused, so nothing here touches real infrastructure. Covers: write tools hidden and refused without the access token,
// reading, what-ifs that aren't saved, saving assumptions / budget edits / scenarios, a save that meets someone else's
// save (made again on the new copy), site_plan saving its pick to a project, creating a project from an outline, and the
// report set (with Chromium when there is one).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

process.env.SUPABASE_URL = 'https://db.test'; delete process.env.SUPABASE_SECRET_KEY; delete process.env.MCP_ACCESS_TOKEN; delete process.env.FEASIBILITY_NARRATIVE;
const outbound = [];
globalThis.fetch = async u => { outbound.push(String(u)); throw new Error('network refused in tests: ' + u); };
const S = await import('../lib/mcp/server.mjs'), PR = await import('../lib/mcp/projects.mjs'), MK = await import('../lib/feasibility/market.mjs'), SAMPLE = await import('../scripts/sample-project.mjs');
const { localChrome } = await import('./helpers/chrome.mjs');
const market = MK.marketContext(JSON.parse(await readFile(new URL('./fixtures/fz/market/market-2026-10-24.json', import.meta.url))));

// ---- the stand-in team database: PostgREST for site_projects, Storage for the report sets ----
function fakeDb() {
  const rows = new Map(), objects = new Map(), url = 'https://db.test', o = { url, rows, objects, bumpBeforePatch: 0, patches: 0 };
  const eq = (u, k) => { const v = u.searchParams.get(k); return v == null ? null : v.replace(/^eq\./, ''); };
  o.json = async (path, opts = {}) => {
    const u = new URL(url + path), m = opts.method || 'GET';
    if (u.pathname === '/rest/v1/site_projects') {
      if (m === 'GET') {
        let list = [...rows.values()]; const id = eq(u, 'id'); if (id) list = list.filter(r => r.id === id); if (u.searchParams.get('deleted')) list = list.filter(r => !r.deleted);
        list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        if (/doc->/.test(u.searchParams.get('select'))) return list.map(r => ({ id: r.id, name: r.name, updated_at: r.updated_at, updated_by: r.updated_by, status: r.doc.status ?? null, client: r.doc.client ?? null, notes: r.doc.notes ?? null, site: r.doc.parcels?.[0]?.label ?? null, county: r.doc.parcels?.[0]?.county ?? null }));
        return list.map(r => ({ id: r.id, doc: structuredClone(r.doc), deleted: r.deleted, updated_at: r.updated_at }));
      }
      const body = JSON.parse(opts.body);
      if (m === 'POST') { if (rows.has(body.id)) throw new Error('POST /rest/v1/site_projects 409 duplicate'); rows.set(body.id, structuredClone(body)); return [body]; }
      if (m === 'PATCH') { o.patches++; const id = eq(u, 'id'), at = eq(u, 'updated_at'), r = rows.get(id);
        if (o.bumpBeforePatch > 0) { o.bumpBeforePatch--; r.updated_at = new Date(Date.parse(r.updated_at) + 1).toISOString(); r.doc = { ...r.doc, notes: (r.doc.notes || '') + ' [a teammate’s edit]' }; } // someone saved in between
        if (!r || r.updated_at !== at) return []; rows.set(id, structuredClone(body)); return [body]; }
    }
    let x = /^\/storage\/v1\/object\/sign\/([\w-]+)\/(.+)$/.exec(u.pathname); if (x && m === 'POST') return { signedURL: '/object/sign/' + x[1] + '/' + x[2] + '?token=t' };
    if (/^\/storage\/v1\/object\/list\//.test(u.pathname)) return [];
    throw new Error('unexpected database call ' + m + ' ' + path);
  };
  o.call = async (path, opts = {}) => { const x = /^\/storage\/v1\/object\/([\w-]+)\/(.+)$/.exec(path); if (x && opts.method === 'POST') { objects.set(x[1] + '/' + decodeURIComponent(x[2]), opts.body); return new Response(''); } throw new Error('unexpected storage call ' + path); };
  return o;
}
const db = fakeDb(); PR.hooks.db = db; PR.hooks.market = async () => market;
const sample = await SAMPLE.sampleProject({ market }), at0 = '2026-10-24T12:00:00.000Z';
db.rows.set(sample.id, { id: sample.id, name: sample.name, doc: structuredClone(sample), deleted: false, updated_by: 'Sample run', updated_at: at0 });
const text = r => r.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
const call = async (name, args, ctx = { writes: true }) => S.callTool(name, args, ctx);
const ok = (r, what) => { assert.ok(!r.isError, what + ': ' + text(r).slice(0, 400)); return text(r); };
const docOf = id => db.rows.get(id).doc;

// ---- writes are off without the access token: not listed, and refused ----
for (const writes of [false, true]) {
  const server = S.createServer({ writes }), client = new Client({ name: 't', version: '1' }), [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b);
  const names = (await client.listTools()).tools.map(t => t.name);
  for (const n of ['list_projects', 'get_project', 'feasibility_study', 'feasibility_report', 'project_files']) assert.ok(names.includes(n), n + ' is always listed');
  for (const n of ['create_project', 'update_project', 'set_assumptions', 'edit_budget', 'save_scenario']) assert.equal(names.includes(n), writes, n + (writes ? ' listed with writes on' : ' hidden with writes off'));
  const sp = (await client.listTools()).tools.find(t => t.name === 'site_plan'); assert.equal(sp.annotations.readOnlyHint, !writes, 'site_plan says it can write only when it can');
  assert.match(client.getInstructions(), writes ? /create_project/ : /read-only/);
  await client.close();
}
assert.equal(PR.writesOn({}), false); assert.equal(PR.writesOn({ MCP_ACCESS_TOKEN: 'x' }), true); assert.equal(PR.writesOn({ MCP_ACCESS_TOKEN: 'x', MCP_WRITES: 'off' }), false);
let r = await call('update_project', { project_id: sample.id, status: 'dead' }, {}); assert.ok(r.isError && /off on this server/.test(text(r)), 'a write tool is refused when writes are off');
r = await call('feasibility_report', { project_id: sample.id, save: true }, {}); assert.ok(r.isError && /off on this server/.test(text(r)), 'saving a report set is refused when writes are off');
r = await call('site_plan', { project_id: sample.id, request: 'apartments' }, {}); assert.ok(r.isError && /off on this server/.test(text(r)), 'site_plan does not save to a project when writes are off');
assert.equal(docOf(sample.id).status, 'review', 'nothing changed');

// ---- reading ----
let t = ok(await call('list_projects', {}), 'list');
assert.match(t, /Sample: Waller garden apartments/); assert.match(t, new RegExp(sample.id)); assert.match(t, /Under review/);
t = ok(await call('list_projects', { query: 'nothing like this' }), 'list none'); assert.match(t, /No project matches/);
t = ok(await call('list_projects', { status: 'review' }), 'list by status'); assert.match(t, /1 project matching/);
r = await call('get_project', { project_id: 'nope-123' }); assert.ok(r.isError && /no project nope-123/i.test(text(r)), 'an unknown project is a sentence');
t = ok(await call('get_project', { project_id: sample.id }), 'get');
for (const re of [/## Parcels \(3/, /Option A \(option_id sample-opt-a\)/, /the feasibility study’s option/, /units/, /Rates \+1%/, /scenario_id rates-up/, /\$2,600,000 \(asking/, /#v=projects&pj=sample-waller-apartments/]) assert.match(t, re);

// ---- the study: sections, what-if (not saved), bad inputs ----
t = ok(await call('feasibility_study', { project_id: sample.id, sections: PR.SECTIONS }), 'study');
for (const re of [/## Summary/, /total development cost \$79,227,648/, /levered IRR 3\.51%/, /## Assumptions/, /- rate = /, /lib:res\|01 01 00\|Project Management/, /Division 01/, /\| Year \| Cost/, /## Hold analysis/, /What moves the levered IRR most/, /\| Base case \| base \|/, /\[high\] Returns: Thin development spread/, /## Fact & assumption register/, /Feasibility \/ schematic level only/]) assert.match(t, re);
const irrOf = s => +/\*\*levered IRR (-?[\d.]+)%/.exec(s)[1];
const base = irrOf(t), up = ok(await call('feasibility_study', { project_id: sample.id, what_if: { 'rents.1 BR': '$2,400' }, sections: ['summary'] }), 'what-if');
assert.ok(irrOf(up) > base + 1, 'higher rents raise the IRR: ' + irrOf(up) + ' vs ' + base); assert.match(up, /What-if \(not saved\)/);
assert.equal(docOf(sample.id).fz.overrides['rents.1 BR'], undefined, 'a what-if is never saved');
r = await call('feasibility_study', { project_id: sample.id, what_if: { rentz: 1 } }); assert.ok(r.isError && /Not an assumption of this study: rentz/.test(text(r)) && /rents\.1 BR/.test(text(r)), 'an unknown key lists the real ones');
r = await call('feasibility_study', { project_id: sample.id, scenario_id: 'nope' }); assert.ok(r.isError && /rates-up/.test(text(r)), 'an unknown scenario lists the real ones');
t = ok(await call('feasibility_study', { project_id: sample.id, scenario_id: 'rates-up', sections: ['summary'] }), 'scenario'); assert.match(t, /scenario Rates \+1% \(rates-up\)/); assert.ok(irrOf(t) < base, 'higher rates lower the IRR');

// ---- saving assumptions, with someone else saving in between ----
db.bumpBeforePatch = 1; const p0 = db.patches;
t = ok(await call('set_assumptions', { project_id: sample.id, set: { rate: '8.0', vacancyPct: 6 }, by: 'Matt' }), 'set');
assert.match(t, /rate = 8; vacancyPct = 6/); assert.match(t, /Before: total cost/); assert.match(t, /After: total cost/);
assert.equal(db.patches - p0, 2, 'the save met a teammate’s save and was made again on the new copy');
let d = docOf(sample.id); assert.equal(d.fz.overrides.rate, 8); assert.equal(d.fz.overrides.vacancyPct, 6); assert.match(d.notes || '', /a teammate’s edit/, 'the teammate’s change is kept');
assert.equal(d.by, 'Matt (agent)'); assert.equal(db.rows.get(sample.id).updated_by, 'Matt (agent)'); assert.ok(db.rows.get(sample.id).updated_at > at0, 'the change is dated, so browsers pick it up');
db.bumpBeforePatch = 2; r = await call('set_assumptions', { project_id: sample.id, set: { rate: 9 } }); assert.ok(r.isError && /kept changing/.test(text(r)), 'a second clash gives up and says so'); assert.equal(docOf(sample.id).fz.overrides.rate, 8);
r = await call('set_assumptions', { project_id: sample.id, set: { rate: 'high' } }); assert.ok(r.isError && /takes a number/.test(text(r)));
ok(await call('set_assumptions', { project_id: sample.id, scenario_id: 'cost-up', set: { contPct: 7 } }), 'set on a scenario'); assert.equal(docOf(sample.id).fz.scenarios.find(s => s.id === 'cost-up').overrides.contPct, 7);
ok(await call('set_assumptions', { project_id: sample.id, reset: ['vacancyPct'] }), 'reset'); assert.equal(docOf(sample.id).fz.overrides.vacancyPct, undefined);

// ---- the budget ----
t = ok(await call('edit_budget', { project_id: sample.id, edits: [{ line_id: 'lib:res|01 01 00|Project Management', off: true }, { line_id: 'lib:res|01 02 00|Insurance', rate: 1 }] }), 'budget');
assert.match(t, /Project Management: left out/); const [c0, c1] = /Construction contract (\$[\d,]+) → (\$[\d,]+)/.exec(t).slice(1).map(x => +x.replace(/[$,]/g, '')); assert.ok(c1 < c0 - 3e6, 'leaving out a $3.4M line lowers the contract');
assert.deepEqual(docOf(sample.id).fz.budgetEdits['lib:res|01 01 00|Project Management'], { off: true });
r = await call('edit_budget', { project_id: sample.id, edits: [{ line_id: 'nope', off: true }] }); assert.ok(r.isError && /Not a budget line/.test(text(r)));
ok(await call('edit_budget', { project_id: sample.id, reset_all: true }), 'budget reset'); assert.deepEqual(docOf(sample.id).fz.budgetEdits, {});

// ---- scenarios ----
t = ok(await call('save_scenario', { project_id: sample.id, name: 'Lean build', overrides: { gcFeePct: 3 }, mix: [{ name: '1 BR', sf: 700, pct: 70 }, { name: '2 BR', sf: 1000, pct: 30 }], make_active: true }), 'scenario');
const sid = /scenario_id (s\w+)/.exec(t)[1]; d = docOf(sample.id); assert.equal(d.fz.activeScenario, sid); assert.equal(d.fz.scenarios.length, 4); assert.match(t, /Base case: \$/); assert.match(t, /This scenario: \$/);
r = await call('save_scenario', { project_id: sample.id, name: 'Bad', mix: [{ name: 'x', sf: -1, pct: 5 }] }); assert.ok(r.isError && /mix is/.test(text(r)));
ok(await call('save_scenario', { project_id: sample.id, scenario_id: sid, remove: true }), 'remove scenario'); d = docOf(sample.id); assert.equal(d.fz.scenarios.length, 3); assert.equal(d.fz.activeScenario, null);

// ---- the project itself ----
ok(await call('update_project', { project_id: sample.id, status: 'contract', add_note: 'Seller countered at $2.4M.', land_price: 2400000, by: 'Matt' }), 'update');
d = docOf(sample.id); assert.equal(d.status, 'contract'); assert.match(d.notes, /\d{4}-\d\d-\d\d \(Matt \(agent\)\): Seller countered/); assert.equal(d.fz.intake.landPrice, 2400000); assert.equal(d.fz.intake.landBasis, 'asking');
r = await call('update_project', { project_id: sample.id, status: 'gone' }); assert.ok(r.isError && /status is one of/.test(text(r)));
r = await call('update_project', { project_id: sample.id }); assert.ok(r.isError && /Nothing to change/.test(text(r)));

// ---- site_plan with project_id: the pick saved as a new option (the layout run is stood in for) ----
let gotSite = null;
PR.hooks.sitePlan = async (args, ctx) => { gotSite = ctx.site; const line = await ctx.onPlan({ plan: { ...structuredClone(sample.plans[0]), id: 'mcp', name: 'A', terrain: { big: true } }, request: args.request }); return { content: [{ type: 'text', text: '# Site plan\n' + line }] }; };
t = ok(await call('site_plan', { project_id: sample.id, request: '300 apartments, 3 stories', effort: 'low' }), 'site plan into the project');
assert.equal(gotSite.recs.length, 3, 'laid out on the project’s own three parcels'); assert.match(t, /Saved to .* as Option B \(option_id \w+\), now the feasibility study’s option/);
d = docOf(sample.id); const nb = d.plans.at(-1); assert.equal(d.plans.length, 2); assert.equal(nb.name, 'Option B'); assert.equal(d.fz.optionId, nb.id); assert.equal(nb.terrain, undefined, 'the ground grid isn’t stored'); assert.equal(nb.request, '300 apartments, 3 stories'); assert.deepEqual(nb.parcels, d.parcels.map(x => x.key));
// laid out at a location given with it: that parcel joins the project and the option is on it
PR.hooks.sitePlan = async (args, ctx) => { assert.equal(ctx.site, null, 'a given location is looked up by the tool'); const g = { type: 'Polygon', coordinates: [[[-95.94, 30.06], [-95.938, 30.06], [-95.938, 30.062], [-95.94, 30.062], [-95.94, 30.06]]] };
  return { content: [{ type: 'text', text: await ctx.onPlan({ plan: { ...structuredClone(sample.plans[0]), id: 'mcp' }, request: args.request, recs: [{ label: '100 Next Door Rd', propId: 'R999', owner: 'Neighbor LLC', acres: 4.4, geometry: g, center: null, landValue: 300000 }], county: 'Waller' }) }] }; };
ok(await call('site_plan', { project_id: sample.id, apn: 'R999', county: 'Waller', request: 'townhomes', make_study_option: false }), 'site plan next door');
d = docOf(sample.id); const nc = d.plans.at(-1), added = d.parcels.find(x => x.key === 'pid:R999');
assert.equal(d.parcels.length, 4, 'the parcel laid out on joins the project'); assert.equal(added.county, 'Waller'); assert.equal(added.landValue, 300000); assert.deepEqual(nc.parcels, ['pid:R999']); assert.equal(nc.name, 'Option C'); assert.equal(d.fz.optionId, nb.id, 'make_study_option: false keeps the study on its option');
PR.hooks.sitePlan = null;

// ---- a new project from a drawn outline (no lookups: road lines refused, facts skipped) ----
const sq = [[-95.93, 30.05], [-95.927, 30.05], [-95.927, 30.053], [-95.93, 30.053], [-95.93, 30.05]];
t = ok(await call('create_project', { geojson: { type: 'Polygon', coordinates: [sq] }, name: 'Agent test site', land_price: 1500000, target_use: 'townhomes', gather_facts: false, by: 'Matt' }), 'create');
const nid = /project_id: (\w+)/.exec(t)[1], np = docOf(nid);
assert.equal(np.name, 'Agent test site'); assert.equal(np.status, 'prospect'); assert.equal(np.plans.length, 1); assert.equal(np.plans[0].name, 'Option A'); assert.ok(np.plans[0].ring.length >= 4); assert.equal(np.fz.optionId, np.plans[0].id);
assert.equal(np.fz.intake.landPrice, 1500000); assert.equal(np.fz.intake.targetUse, 'townhomes'); assert.match(t, /front street guessed/);
r = await call('feasibility_study', { project_id: nid }); assert.ok(r.isError && /no buildings laid out yet.*site_plan with project_id/.test(text(r)), 'a study before a layout says what to do');
assert.match(ok(await call('list_projects', {}), 'list again'), /Agent test site/);

// ---- files, and the report set (Chromium prints the PDF) ----
t = ok(await call('project_files', { project_id: sample.id }), 'files'); assert.match(t, /Saved report sets \(0\)/);
if (localChrome()) {
  r = await call('feasibility_report', { project_id: sample.id, files: ['pdf', 'xlsx', 'budget_csv'], save: true, by: 'Matt' }); t = ok(r, 'report set');
  const res = r.content.filter(c => c.type === 'resource'); assert.equal(res.length, 3);
  assert.ok(Buffer.from(res.find(c => c.resource.mimeType === 'application/pdf').resource.blob, 'base64').subarray(0, 5).toString() === '%PDF-', 'a real PDF');
  assert.match(res.find(c => c.resource.mimeType === 'text/csv').resource.text, /^Group,CSI,Division/);
  assert.equal([...db.objects.keys()].filter(k => k.startsWith('report-sets/projects/' + sample.id + '/reports/')).length, 5, 'the whole set stored in the platform’s own bucket');
  d = docOf(sample.id); assert.equal(d.fz.reports.length, 1); assert.equal(d.fz.reports[0].by, 'Matt (agent)'); assert.match(t, /Saved for the team as report set r\w+/); assert.match(t, /https:\/\/db\.test\/storage\/v1\/object\/sign\/report-sets\//);
  t = ok(await call('project_files', { project_id: sample.id }), 'files after'); assert.match(t, /Saved report sets \(1\)/); assert.match(t, /\.xlsx \(\d+ KB\): https:\/\/db\.test/);
  r = await call('feasibility_report', { project_id: sample.id, files: ['json'] }, { writes: true, pdfLimit: 1000 }); assert.match(text(r), /Too big to attach in one answer/);
  (await import('../lib/pdf.mjs')).closeBrowser();
} else console.log('mcp projects: no local Chromium, report set skipped');

assert.ok(outbound.every(u => /tigerweb\.geo\.census\.gov/.test(u)), 'the only outbound requests were the (refused) road lines: ' + outbound.join(', '));
console.log('mcp projects passed');
