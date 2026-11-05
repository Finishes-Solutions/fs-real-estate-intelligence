// An AI agent driving the whole system through the MCP server, end to end, as a real agent would: a real MCP SDK client
// on the server (in memory), one tool call after another, each answer read for the ids the next call needs.
//   address → find_property → site_facts → site_report (parcel map) → site_plan "garden apartments, as many as fit, pool in
//   the center" → plan_check → plan_get → plan_edit "move the clubhouse to the entry" → plan_compare → plan_numbers →
//   plan_export (sheet PDF, SVG, DXF, GeoJSON, BIM) → plan_pick → locks → plan_set starts from the edited plan
// Every outside service is stood in for (fetch is replaced: the geocoder, the parcel layer, roads, FEMA and the rest answer
// with shapes like the live ones, anything else with an empty answer), the AI answers like the app's endpoints, plans are
// kept in memory, and the PDFs are printed by a local Chromium when there is one (else a one-page stand-in). Nothing
// leaves the process. MCP_E2E_OUT=<dir> writes the session's transcript (each call, its arguments and its answer) and the
// files it made there.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { PDFDocument } from 'pdf-lib';

process.env.SUPABASE_URL = 'https://db.test'; delete process.env.SUPABASE_SECRET_KEY; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.MCP_ACCESS_TOKEN;
delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.BIMCRAFT_CLI; delete process.env.MCP_SITEPLAN_PROVIDER;

// ---------- the outside world: a 13.4 acre parcel on FM 362 in Waller ----------
const PT = [-95.9275, 30.0566], K = 364567 * Math.cos(PT[1] * Math.PI / 180), ll = ([x, y]) => [+(PT[0] + x / K).toFixed(7), +(PT[1] + y / 364567).toFixed(7)];
const RING = [[-450, -325], [450, -325], [450, 325], [-450, 325], [-450, -325]].map(ll); // 900 × 650 ft, the front on FM 362 to the south
const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
const hosts = new Set();
function route(u, opts) {
  const q = u.searchParams, body = typeof opts.body === 'string' && !/^[[{]/.test(opts.body) ? new URLSearchParams(opts.body) : opts.body instanceof URLSearchParams ? opts.body : null, P = k => q.get(k) ?? body?.get(k);
  if (u.host === 'geocoding.geo.census.gov' && u.pathname.endsWith('/onelineaddress')) {
    const hit = /1004 PRIYA/i.test(q.get('address') || '');
    return J({ result: { addressMatches: hit ? [{ matchedAddress: '1004 PRIYA LN, WALLER, TX, 77484', coordinates: { x: PT[0], y: PT[1] }, addressComponents: { zip: '77484' }, geographies: { Counties: [{ BASENAME: 'Waller', NAME: 'Waller County', GEOID: '48473' }], States: [{ STUSAB: 'TX' }], 'Incorporated Places': [{ BASENAME: 'Waller', NAME: 'Waller city' }] } }] : [] } });
  }
  if (u.host === 'geocoding.geo.census.gov') return J({ result: { geographies: { States: [{ STUSAB: 'TX', STATE: '48' }], Counties: [{ BASENAME: 'Waller', NAME: 'Waller County', STATE: '48', GEOID: '48473' }], 'Incorporated Places': [{ BASENAME: 'Waller', NAME: 'Waller city' }] } } });
  if (u.host === 'feature.geographic.texas.gov') return J({ results: [{ attributes: { PROP_ID: '334455', OWNER_NAME: 'PRIYA LAND PARTNERS LP', SITUS_ADDR: '1004 PRIYA LN', SITUS_CITY: 'WALLER', SITUS_ZIP: '77484', LOC_LAND_USE: 'D1', MKT_VALUE: '2350000', LAND_VALUE: '2350000', IMP_VALUE: '0', GIS_AREA: '13.43', TAX_YEAR: '2026', COUNTY: 'Waller' }, geometry: { rings: [RING] } }],
    features: [{ attributes: { PROP_ID: '334455', OWNER_NAME: 'PRIYA LAND PARTNERS LP', SITUS_ADDR: '1004 PRIYA LN', SITUS_CITY: 'WALLER', SITUS_ZIP: '77484', LOC_LAND_USE: 'D1', MKT_VALUE: '2350000', LAND_VALUE: '2350000', GIS_AREA: '13.43', COUNTY: 'Waller' }, geometry: { rings: [RING] } }] });
  if (u.host === 'tigerweb.geo.census.gov' && u.pathname.endsWith('/Transportation/MapServer')) return J({ layers: [{ id: 2, name: 'Primary Roads' }, { id: 4, name: 'Secondary Roads' }, { id: 8, name: 'Local Roads' }] });
  if (u.host === 'tigerweb.geo.census.gov' && /\/Transportation\/MapServer\/\d+\/query/.test(u.pathname)) { const id = +u.pathname.split('/').at(-2);
    return J({ features: id === 4 ? [{ attributes: { NAME: 'FM 362', MTFCC: 'S1200' }, geometry: { paths: [[ll([-2000, -360]), ll([2000, -360])]] } }] : [] }); }
  if (u.host === 'tigerweb.geo.census.gov' && u.pathname.includes('/Places_CouSub_ConCity_SubMCD/') && P('returnCountOnly')) return J({ count: 1 });
  if (u.host === 'tigerweb.geo.census.gov' && u.pathname.includes('/Places_CouSub_ConCity_SubMCD/')) return J({ features: [{ attributes: { BASENAME: 'Waller', NAME: 'Waller city' } }] });
  if (u.host === 'tigerweb.geo.census.gov' && u.pathname.includes('/School/')) return J({ features: u.pathname.includes('/MapServer/0/') ? [{ attributes: { NAME: 'Waller Independent School District' } }] : [] });
  if (u.pathname.endsWith('/NFHL/MapServer/28/query')) return J({ features: [{ attributes: { FLD_ZONE: 'X', ZONE_SUBTY: 'AREA OF MINIMAL FLOOD HAZARD', SFHA_TF: 'F', STATIC_BFE: -9999 }, geometry: { rings: [RING] } }] });
  if (u.pathname.includes('TxDOT_AADT')) return J({ features: [{ attributes: { RTE_PRFX: 'FM', RTE_NBR: '0362', AADT_CUR: 8400, SYSTEM: 'On', EXT_DATE: '2025-12-31' }, geometry: { paths: [[ll([-2000, -360]), ll([2000, -360])]] } }] });
  if (u.pathname.includes('TCEQ_Water_Districts')) return J({ features: [{ attributes: { NAME: 'Waller County MUD 33', TYPE: 'MUD', TYPE_DESCRIPTION: 'Municipal Utility District', STATUS: 'A' } }] });
  if (u.pathname.endsWith('/3DEPElevation/ImageServer/getSamples')) { const g = JSON.parse(P('geometry')); return J({ samples: g.points.map((p, i) => ({ locationId: i, value: String(250 + (p[1] - PT[1]) * 900), resolution: 1 })) }); } // falling gently to the street
  if (u.pathname.endsWith('get_facilities')) return J({ Results: { QueryID: '1', QueryRows: '0' } });
  if (u.pathname.endsWith('get_qid')) return J({ Results: { Facilities: [] } });
  if (u.pathname.endsWith('/interpreter')) return J({ elements: [] });
  if (u.host === 'db.test') return J([]);
  return J({ features: [], results: [], layers: [], elements: [], data: [] }); // everything else: an empty answer
}
globalThis.fetch = async (url, opts = {}) => { const u = new URL(String(url)); hosts.add(u.host); return route(u, opts); };

// ---------- stand-ins: the AI (as api/siteplan.js answers), the printer, storage ----------
const { localChrome } = await import('./helpers/chrome.mjs'), haveChrome = !!localChrome();
const ST = await import('../lib/mcp/store.mjs'), mem = ST.memoryStore(); ST.hooks.store = mem;
const SPT = await import('../lib/mcp/siteplan.mjs'), PL = await import('../lib/mcp/plans.mjs'), REP = await import('../lib/mcp/reports.mjs'), PSET = await import('../lib/mcp/planset.mjs');
const onePage = async title => { const d = await PDFDocument.create(); d.setTitle(title || 'x'); d.addPage([1224, 792]).drawRectangle({ x: 10, y: 10, width: 20, height: 20 }); return Buffer.from(await d.save()); };
if (!haveChrome) { const r = async (html, { title } = {}) => { assert.match(html, /<html|<!doctype/i); return onePage(title); }; SPT.hooks.render = r; PL.hooks.render = r; REP.hooks.render = r; const sn = async svgs => svgs.map(() => 'data:image/jpeg;base64,/9j/AAAA'); SPT.hooks.snapshots = sn; PL.hooks.snapshots = sn; }
const aiCalls = [];
const AI = async b => { aiCalls.push(b.mode || 'program');
  if (b.mode === 'strategy') return { status: 200, model: 'test-model', body: { pick: 0, why: 'Garden buildings round a central amenity court.', strategies: [{ name: 'Garden buildings round the pool', settings: {} }] } };
  if (b.mode === 'review') return { status: 200, model: 'test-model', body: { reviews: b.options.map((o, i) => ({ option: i, score: 90 - i * 5, verdict: 'Buildings ring the pool and clubhouse; parking is close to every door.', strengths: ['Amenities central'], problems: [] })), ranking: b.options.map((_, i) => i), revise: false, program: null, params: {}, why: '', summary: 'The first layout is best.', brief: null } };
  if (b.mode === 'edit') { const pcs = b.plan.pieces, club = pcs.find(p => /clubhouse/i.test(p.name)), ent = pcs.find(p => p.kind === 'drive' && /entr|entry/i.test(p.name)) || pcs.find(p => p.kind === 'drive');
    return { status: 200, model: 'test-model', body: club && ent ? { ops: [{ action: 'move', target: club.id, with: ent.id }], homeMix: [], names: null, streetNames: null, refit: 'none', summary: 'Moved the clubhouse beside the main entry, so it greets residents and visitors.', question: null } : { ops: [], question: 'Which piece is the clubhouse?' } }; }
  return { status: 200, model: 'test-model', body: { program: { use: 'multifamily', floors: 3, form: 'garden' }, setbacks: { front: 25, side: 10, rear: 20, paving: 10 }, summary: 'Three-story garden apartments filling the site, the pool and clubhouse in the middle.', assumptions: ['2 spaces a unit'] } }; };
SPT.hooks.ai = AI; PL.hooks.ai = AI;

// ---------- the agent's session ----------
const S = await import('../lib/mcp/server.mjs');
const server = S.createServer({ writes: false }), client = new Client({ name: 'e2e-agent', version: '1.0.0' }), [ta, tb] = InMemoryTransport.createLinkedPair();
await server.connect(ta); await client.connect(tb);
const transcript = [], files = [];
async function call(name, args, { error = false } = {}) {
  const t0 = Date.now(), r = await client.callTool({ name, arguments: args }), text = r.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  const res = r.content.filter(c => c.type === 'resource' || c.type === 'image').map(c => c.type === 'image' ? { uri: '(image)', mimeType: c.mimeType, bytes: Buffer.from(c.data, 'base64') } : { uri: c.resource.uri, mimeType: c.resource.mimeType, bytes: c.resource.blob ? Buffer.from(c.resource.blob, 'base64') : Buffer.from(c.resource.text || '') });
  transcript.push({ name, args, ms: Date.now() - t0, isError: !!r.isError, text, res: res.map(x => ({ uri: x.uri, mimeType: x.mimeType, size: x.bytes.length })) }); files.push(...res);
  assert.equal(!!r.isError, error, name + (error ? ' should fail' : ' failed') + ': ' + text.slice(0, 500));
  return { text, res, r };
}
const idOf = t => /Plan id: ([\w-]{8,40})/.exec(t)?.[1];
const ADDR = '1004 Priya Ln, Waller, TX 77484';

const names = (await client.listTools()).tools.map(t => t.name);
for (const n of ['find_property', 'site_facts', 'site_report', 'site_plan', 'plan_get', 'plan_edit', 'plan_pick', 'plan_compare', 'plan_check', 'plan_numbers', 'plan_export', 'plan_from_project', 'plan_set', 'site_renderings', 'layout_run', 'layout_edit']) assert.ok(names.includes(n), 'listed: ' + n);
assert.ok(!names.includes('save_plan_to_project'), 'a write tool stays hidden on a read-only connection');

// 1. the site
let r = await call('find_property', { address: ADDR });
assert.match(r.text, /334455/); assert.match(r.text, /PRIYA LAND PARTNERS/); assert.match(r.text, /13\.4/);
r = await call('site_facts', { address: ADDR });
assert.match(r.text, /flood/i); assert.match(r.text, /MUD 33|Waller County MUD/);
r = await call('site_report', { address: ADDR, kind: 'parcel_map' });
assert.equal(r.res[0].mimeType, 'application/pdf'); assert.ok((await PDFDocument.load(r.res[0].bytes)).getPageCount() >= 1);
r = await call('site_report', { address: ADDR, kind: 'parcel_outline' });
assert.equal(JSON.parse(r.res[0].bytes).features[0].properties.apn, '334455');

// 2. a site plan from words
const ASK = 'garden apartments, as many as fit, pool in the center';
r = await call('site_plan', { address: ADDR, request: ASK, effort: 'medium', project_name: 'Priya Lane Apartments' });
const p1 = idOf(r.text); assert.ok(p1, 'a plan id');
assert.match(r.text, /Read as: Multifamily/); assert.match(r.text, /## Picked: /); assert.match(r.text, /Quality check: (READY|READY WITH NOTES|NOT READY)/);
assert.deepEqual([...new Set(aiCalls)].sort(), ['program', 'review', 'strategy'], 'medium: planned, read and reviewed');
assert.ok(r.res.some(x => x.mimeType === 'application/pdf'), 'the sheet PDF');
const rec1 = await ST.getJSON(mem, 'plans/' + p1 + '.json'); assert.ok(rec1.alts?.length >= 1, 'the run’s other layouts kept with the plan'); assert.ok(rec1.plan.recipe, 'with its layout recipe');
const units1 = PL.numbersOf(rec1.plan).units; assert.ok(units1 >= 150, 'garden apartments filling 13 acres (' + units1 + ')');
assert.ok(rec1.plan.elements.some(e => e.kind === 'pool') && rec1.plan.elements.some(e => /clubhouse/i.test(e.name || '')), 'a pool and a clubhouse');

// 3. check it, open it
r = await call('plan_check', { plan_id: p1 });
assert.match(r.text, /## Independent check: /); assert.match(r.text, /site\.containment/); assert.match(r.text, /## Quality check: /);
r = await call('plan_get', { plan_id: p1 });
assert.match(r.text, /Clubhouse \(building, amenity\)/); assert.match(r.text, /## Other layouts from the same run/); assert.match(r.text, /entrances: /);

// 4. edit it in words: the AI reads them (the app's Change With AI), a new plan comes back, the old one is kept
const SPL = await import('../lib/siteplan.mjs'), cen = e => SPL.centroid(SPL.shapeOf(e)), club = p => p.plan.elements.find(e => /clubhouse/i.test(e.name || ''));
const ent = p => { const es = SPL.entrancesOf(p.plan.elements); return es.find(e => /main/i.test(e.name || '')) || es[0]; }, dist = p => Math.hypot(cen(club(p))[0] - cen(ent(p))[0], cen(club(p))[1] - cen(ent(p))[1]);
const d1 = dist(rec1); // (the engine already puts the clubhouse near the main entry, in front of the pool in the middle)
{ const f = (await import('../lib/siteedit.mjs')).sheetFrame(rec1.plan), pool = f.to(cen(rec1.plan.elements.find(e => e.kind === 'pool'))); assert.ok(Math.abs(pool[0] - f.width / 2) < f.width * 0.25 && Math.abs(pool[1] - f.depth / 2) < f.depth * 0.25, 'the pool in the center (' + pool.map(Math.round) + ')'); }
r = await call('plan_edit', { plan_id: p1, words: 'move the clubhouse to the entry' });
const p2 = idOf(r.text); assert.ok(p2 && p2 !== p1, 'a new plan id'); assert.match(r.text, /Read by: AI/); assert.match(r.text, /Moved Clubhouse/i);
const rec2 = await ST.getJSON(mem, 'plans/' + p2 + '.json'); assert.equal(rec2.parent, p1); assert.ok(await ST.getJSON(mem, 'plans/' + p1 + '.json'), 'the plan before is kept');
assert.notDeepEqual(cen(club(rec2)), cen(club(rec1)), 'the clubhouse moved'); assert.ok(dist(rec2) <= Math.max(d1, 260), 'beside the entry (' + Math.round(d1) + ' → ' + Math.round(dist(rec2)) + ' ft)');
// from the back of the site, the same words with the AI off (read directly) bring it to the entry
r = await call('plan_edit', { plan_id: p1, edits: [{ action: 'move', target: 'Clubhouse', to: 'back' }] }); const pBack = idOf(r.text), recB = await ST.getJSON(mem, 'plans/' + pBack + '.json');
assert.ok(dist(recB) > d1 + 150, 'moved to the back (' + Math.round(dist(recB)) + ' ft from the entry)');
r = await call('plan_edit', { plan_id: pBack, words: 'move the clubhouse to the entry', use_ai: false });
assert.match(r.text, /read directly/); const recF = await ST.getJSON(mem, 'plans/' + idOf(r.text) + '.json'); assert.ok(dist(recF) < dist(recB) - 150, 'read directly, back by the entry (' + Math.round(dist(recB)) + ' → ' + Math.round(dist(recF)) + ' ft)');

// 5. compare, numbers, export
r = await call('plan_compare', { plan_ids: [p1, p2] });
assert.match(r.text, /\| Plan \| Layout \| Units/); assert.ok(r.text.includes(p1) && r.text.includes(p2)); assert.match(r.text, /## Against /);
r = await call('plan_compare', { plan_ids: [p1], include_alternatives: true }); assert.match(r.text, /layout 2/);
r = await call('plan_numbers', { plan_id: p2, land_price: 2350000 });
assert.match(r.text, /Units: \d/); assert.match(r.text, /Unit mix: /); assert.match(r.text, /Total cost \$/); assert.match(r.text, /land \$2,350,000/);
r = await call('plan_export', { plan_id: p2, formats: ['pdf', 'svg', 'image', 'dxf', 'geojson', 'json', 'bim'], sheet: '24x36' });
const got = Object.fromEntries(r.res.map(x => [x.mimeType, x]));
assert.ok((await PDFDocument.load(got['application/pdf'].bytes)).getPageCount() >= 1, 'the sheet PDF');
assert.match(got['image/svg+xml'].bytes.toString(), /^<svg/); assert.match(got['application/dxf'].bytes.toString(), /SECTION[\s\S]*ENTITIES[\s\S]*EOF/);
assert.ok(JSON.parse(got['application/geo+json'].bytes).features.some(f => f.properties.kind === 'building'));
assert.equal(JSON.parse(got['application/json'].bytes).id, p2); assert.match(got['text/plain'].bytes.toString(), /^new /m, 'the BIM model script'); assert.match(r.text, /IFC: the BIM tool isn’t installed/);
assert.ok(got['image/jpeg'], 'a picture of the plan');

// 6. pick another layout of the run; lock a piece and an edit on it is refused
r = await call('plan_pick', { plan_id: p1, layout: 2 }); const p3 = idOf(r.text); assert.ok(p3 && p3 !== p1);
r = await call('plan_edit', { plan_id: p2, words: 'lock the pool' }); const p4 = idOf(r.text); assert.match(r.text, /Locked Pool/);
const pool4 = (await ST.getJSON(mem, 'plans/' + p4 + '.json')).plan.elements.find(e => e.kind === 'pool');
r = await call('plan_edit', { plan_id: p4, edits: [{ action: 'move', target: 'Pool', to: 'back' }] }, { error: true }); assert.match(r.text, /Pool is locked/);
r = await call('plan_edit', { plan_id: p4, edits: [{ action: 'change', every: 'multifamily', floors: 4 }] }); const p5 = idOf(r.text);
const rec5 = await ST.getJSON(mem, 'plans/' + p5 + '.json'); assert.deepEqual(rec5.plan.elements.find(e => e.id === pool4.id), pool4, 'the locked pool is untouched');
assert.ok(rec5.plan.elements.filter(e => e.use === 'multifamily').every(e => e.floors === 4), 'every apartment building 4 stories'); assert.match(r.text, /Changed: units \d/);

// 7. a set of plans starts from the edited plan (the set itself has its own test: test/mcp-planset.mjs)
let T = 0; PSET.hooks.now = () => T; PSET.hooks.waitStepMs = 1; PSET.hooks.ai = async body => { T += 400000; return body.mode === 'notes' ? { notes: { description: 'x', general_notes: ['n'], codes: ['IBC 2021'], next_steps: ['s'] }, model: 'claude-test' } : { disc: { notes: ['n'], criteria: [] }, model: 'claude-test' }; };
PSET.hooks.render = async (html, { title } = {}) => onePage(title); PSET.hooks.border = await onePage('border');
r = await call('plan_set', { plan_id: p2, sections: ['civil'] }); assert.match(r.text, /job_id|Download:/);

// 8. plain-sentence errors
r = await call('plan_get', { plan_id: 'nosuchplan1' }, { error: true }); assert.match(r.text, /There’s no saved plan nosuchplan1/);
r = await call('plan_edit', { plan_id: p2, words: 'zzz qqq' , use_ai: false }, { error: true }); assert.match(r.text, /Nothing on the plan was changed/);
r = await call('plan_export', { plan_id: p2, formats: ['docx'] }, { error: true }); assert.match(r.text, /formats are pdf/);
r = await call('site_report', { address: ADDR, kind: 'weather' }, { error: true }); assert.match(r.text, /kind is one of/);

// nothing went anywhere but the stand-ins (fetch was replaced): list what the session asked for
for (const h of hosts) assert.ok(!/fs-budgeting|cre-report|vercel\.app|supabase\.co/.test(h), 'no source-repo or platform infrastructure: ' + h);

if (process.env.MCP_E2E_OUT) {
  const out = process.env.MCP_E2E_OUT; fs.mkdirSync(out, { recursive: true });
  const md = ['# MCP agent session (test/mcp-agent-e2e.mjs)', '', 'Printed with ' + (haveChrome ? 'a local Chromium' : 'the one-page stand-in') + '. Outside services stood in for: ' + [...hosts].sort().join(', ') + '.', ''];
  for (const [i, t] of transcript.entries()) { md.push('## ' + (i + 1) + '. ' + t.name + (t.isError ? ' (error, as expected)' : '') + ' — ' + t.ms + ' ms', '', '```json', JSON.stringify(t.args), '```', '', '```', t.text.length > 6000 ? t.text.slice(0, 6000) + '\n… (' + t.text.length + ' characters)' : t.text, '```'); if (t.res.length) md.push('', 'Resources: ' + t.res.map(x => x.uri + ' (' + x.mimeType + ', ' + x.size + ' bytes)').join('; ')); md.push(''); }
  fs.writeFileSync(path.join(out, 'transcript.md'), md.join('\n'));
  const ext = { 'application/pdf': 'pdf', 'image/svg+xml': 'svg', 'application/dxf': 'dxf', 'application/geo+json': 'geojson', 'application/json': 'json', 'text/plain': 'txt', 'image/jpeg': 'jpg' };
  files.forEach((f, i) => { if (ext[f.mimeType]) fs.writeFileSync(path.join(out, String(i).padStart(2, '0') + '-' + (f.uri.split('/').pop() || 'file').replace(/[^\w.-]/g, '_').replace(/\.\w+$/, '') + '.' + ext[f.mimeType]), f.bytes); });
}
await client.close();
if (haveChrome) await (await import('../lib/pdf.mjs')).closeBrowser();
console.log('mcp agent e2e ok (' + transcript.length + ' calls' + (haveChrome ? ', Chromium' : '') + ')');
