// Plan sets, phase 1 (PLANSET-PLAN.md): the sections and the sheets they add (lib/planset.mjs) on realistic plans (the
// 7.7 acre FM 362 lot with its notch, laid out as shops and as townhomes; a 27 acre tract as a mixed plan), the set's
// HTML, the title block's fields on the Finishes Solutions border (lib/titleblock.mjs), the Claude client with a stubbed
// SDK (lib/anthropic.mjs) and the endpoint (api/planset.js): notes, the budget, the PDF laid on the border.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), P = await import('../lib/planset.mjs'), TB = await import('../lib/titleblock.mjs');
const A = await import('../lib/aimodels.mjs'), PR = await import('../lib/aiprices.mjs'), AN = await import('../lib/anthropic.mjs');

const mk = (o, pts) => { const k = 364567 * Math.cos(o[1] * Math.PI / 180); return { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(([x, y]) => [o[0] + x / k, o[1] + y / 364567])] }; };
const siteOf = (g, west) => { const b = S.unionParcels([g]); return { ...b, front: west ? b.ring.findIndex((p, i) => S.outwardOf(b.ring, i)[0] < -0.9) : null, setbacks: { ...S.SETBACKS } }; };
const fm362 = siteOf(mk([-95.98, 30.06], [[0, 0], [920, 0], [920, 259], [822, 259], [822, 378], [0, 378]]), true);
const tract = siteOf(mk([-95.6954, 29.6657], [[0, 0], [716, 25], [759, 1244], [-47, 1219]]));
const laid = (site, prog, name) => { const o = L.layoutOptions(site, prog)[0]; assert.ok(o, name + ': a layout'); return { ...site, name, elements: o.elements, zones: o.zones, program: o.program }; };
const retail = laid(fm362, { use: 'retail', gfa: 40000 }, 'Option A'), town = laid(fm362, { use: 'townhomes' }, 'Option B'), mixed = laid(tract, { use: 'multifamily', units: 240 }, 'Option C');

// ---------- sections ----------
assert.deepEqual(P.defaultSections(), ['general', 'civil', 'landscape', 'arch', 'structural', 'mechanical', 'plumbing', 'electrical', 'fire', 'fuel', 'renderings'], 'every section built and ticked except telecom (fuel: only a plan with a gas station gets its sheets)');
assert.equal(P.sectionById('telecom').on, false, 'telecom only when asked for (decided Oct 19)');
assert.ok(P.SECTIONS.every(P.built), 'phases 1 to 4 built');
assert.deepEqual(P.pickSections(['civil', 'structural', 'telecom', 'nope']), ['general', 'civil', 'telecom'], 'unknown sections dropped; General always in; structural goes without architecture');
assert.deepEqual(P.pickSections([]), ['general']);
assert.deepEqual(P.pickSections(null), ['general']);
assert.ok(P.SECTIONS.filter(s => s.needs).every(s => s.needs === 'arch'), 'the engineering sections are drawn on the building designs');

// ---------- the sheets ----------
const PD = await import('../lib/plandesign.mjs');
for (const plan of [retail, town, mixed]) {
  const types = PD.buildingTypes(plan), sup = types.filter(t => t.supported), all = P.sheetList(plan, { sections: P.defaultSections(), renders: 2, renderLabels: ['Aerial', 'Street'], types }), nums = all.map(s => s.number);
  assert.equal(new Set(nums).size, nums.length, plan.name + ': sheet numbers are unique');
  assert.deepEqual(nums.slice(0, 2), ['G-001', 'G-002']); assert.ok(nums.includes('C-101') && nums.includes('C-001') && nums.includes('L-101'), plan.name + ': site sheets');
  assert.equal(all.filter(s => s.kind === 'a-plans').length, sup.length, plan.name + ': floor plans for each building type the set can design');
  assert.ok(all.filter(s => s.typeId).every(s => sup.some(t => t.id === s.typeId)), 'building sheets only for supported types');
  assert.deepEqual(all.filter(s => s.kind === 'render').map(s => s.number), ['A-901', 'A-902']); assert.equal(all.find(s => s.number === 'A-901').sub, 'Aerial');
  assert.ok(!nums.some(n => n.startsWith('T-')), 'no telecom unless ticked');
  assert.ok(P.sheetList(plan, { sections: [...P.defaultSections(), 'telecom'], types }).some(s => s.number === 'T-101'), 'telecom when ticked');
  assert.deepEqual(P.sheetList(plan, { sections: ['general'], renders: 3, types }).map(s => s.kind).filter(k => k !== 'g-code'), ['cover', 'g-notes'], 'General alone: cover and notes (and code analysis for commercial)');
  assert.equal(P.sheetList(plan, { sections: ['renderings'], renders: 9, types }).filter(s => s.kind === 'render').length, 4, 'four renderings at most');
  const c = P.sectionCounts(plan, 0, types); assert.equal(c.general + c.civil + c.landscape + c.arch + c.structural + c.mechanical + c.plumbing + c.electrical + c.fire + c.telecom, P.sheetList(plan, { sections: P.SECTIONS.map(s => s.id), types }).length);
  const s = P.fitScale(plan, 21, 21); assert.ok([10, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300].includes(s), plan.name + ' at 1" = ' + s + "'");
}
{ const mf = P.sheetList(mixed, { sections: P.defaultSections() }); assert.ok(mf.every(s => !s.typeId || PD.buildingTypes(mixed).find(t => t.id === s.typeId)?.supported), 'apartments: no building sheets yet'); }
assert.deepEqual(P.sheetList({ ring: [] }, {}).map(s => s.number), ['G-001', 'G-002'], 'no site drawn: the general sheets only');
// Claude's discipline notes, cleaned to fit
{ const x = P.cleanDisc({ notes: ['a', '', 3, 'b'.repeat(500)], criteria: [{ item: 'Wind', value: '140 mph' }, { item: '', value: 'x' }], extra: 1 }); assert.deepEqual(x.notes.length, 2); assert.equal(x.notes[1].length, 360); assert.deepEqual(x.criteria, [{ item: 'Wind', value: '140 mph' }]); }
assert.equal(P.DISC_SCHEMA.additionalProperties, false); assert.ok(Object.values(P.SECTION_DISC).every(k => P.DISCIPLINES[k]));

// ---------- the set's HTML ----------
const text = P.cleanNotes({ description: 'A retail center <b>on FM 362</b>.', general_notes: ['One.', '', 'Two.', 7, 'x'.repeat(900)], codes: ['IBC'], next_steps: ['Survey'], extra: 'dropped' });
assert.deepEqual(Object.keys(text), ['description', 'general_notes', 'codes', 'next_steps']);
assert.deepEqual(text.general_notes.length, 3, 'empty and non-text notes dropped'); assert.equal(text.general_notes[2].length, 320, 'long notes cut to fit');
const d = { plan: retail, project: { name: 'Indican <script>alert(1)</script> Waller' }, client: 'FM 362 Development LLC', address: '0 FM 362 Rd, Waller, TX 77484', county: 'Waller County, Texas', parcels: [{ label: 'a' }, { label: 'b' }],
  facts: ['FEMA flood zone X — outside the 100-year floodplain.'], notes: S.check(retail).map(i => i.text), renders: [{ src: 'data:image/jpeg;base64,AAAA', caption: 'Aerial' }], text,
  date: 'October 19, 2026', drawnBy: 'MS', projectNumber: '', revisions: [{ no: '0', date: '10/19/26', desc: 'Schematic design set' }] };
d.sheets = P.sheetList(retail, { sections: ['general', 'civil', 'renderings'], renders: 1, renderLabels: ['Aerial'] }).filter(s => ['cover', 'siteplan', 'render', 'g-notes'].includes(s.kind));
const html = P.setHTML(d);
assert.ok(/^<!doctype html>/.test(html));
assert.equal((html.match(/<section class="pg">/g) || []).length, d.sheets.length, 'one page a sheet');
assert.ok(!/NaN|undefined/.test(html), 'no NaN or undefined on the sheets');
assert.ok(!html.includes('<script>'), 'the project name is escaped');
assert.ok(html.includes('@page{size:36in 24in;margin:0}'), '24 x 36 pages with no margin: the border is laid under them');
for (const n of ['G-001', 'C-101', 'A-901']) assert.ok(html.includes('<div class="tb-num">' + n + '</div>'), n + ' in its title block');
assert.equal((html.match(/PRELIMINARY — NOT FOR CONSTRUCTION, BIDDING OR PERMIT\./g) || []).length, d.sheets.length, 'the preliminary statement on every sheet');
assert.ok(html.includes('&lt;b&gt;on FM 362&lt;/b&gt;'), 'Claude’s words are escaped too');
assert.ok(/1(&quot;|") = \d+'-0(&quot;|")/.test(html), 'C-101 says its scale');
assert.ok(html.includes('FM 362 Development LLC') && html.includes('Schematic design · Option A'), 'client and phase in the title block');
assert.ok(P.setHTML({ ...d, text: null }).includes('weren’t written'), 'without Claude the cover says the notes were left out');
assert.ok(P.setHTML({ ...d, renders: [] }).includes('wasn’t available'), 'a rendering missing on this device says so');
// the brief Claude reads: the plan's numbers and the facts, short
const brief = P.notesBrief(d);
assert.ok(brief.includes('7.') && brief.includes('Retail') && brief.includes('FEMA') && brief.includes('G-001 Cover sheet') && brief.length < 12000 && !/NaN/.test(brief));
assert.equal(P.NOTES_SCHEMA.additionalProperties, false, 'structured output needs a closed schema');

// ---------- the title block on the border ----------
const { PAGE, FRAME, STRIP, FIELDS, REV, MASKS } = TB;
assert.ok(FRAME.x + FRAME.w < STRIP.x && FRAME.y + FRAME.h < PAGE.h, 'the drawing frame is clear of the strip');
for (const [k, f] of Object.entries(FIELDS)) assert.ok(f.x >= STRIP.x && f.x + f.w <= STRIP.x + STRIP.w + 1 && f.y > 500, k + ' sits in the strip, below the logo and the two empty boxes');
assert.ok(MASKS.plotStamp.x + MASKS.plotStamp.w < 105, 'the plot stamp mask stops short of the border line (x 105)');
assert.ok(MASKS.firmNumber.x > STRIP.x && MASKS.firmNumber.y + MASKS.firmNumber.h < 287, 'the firm number mask stays inside the logo box row');
assert.equal(TB.FIRM_NUMBER_ON, false, 'firm number off for now (decided Oct 19)');
const revs = Array.from({ length: 15 }, (_, i) => ({ no: String(i), date: '10/19/26', desc: 'Issue ' + i }));
const tbh = TB.titleBlockHTML({ sheet: { number: 'C-101', title: 'Overall site plan' }, revisions: revs });
assert.equal((tbh.match(/class="tb-rev"/g) || []).length, REV.rows * 3, 'the newest twelve issues fill the twelve rows');
assert.ok(tbh.includes('>Issue 14<') && !tbh.includes('>Issue 2<'));
assert.ok(!TB.titleBlockHTML({}).includes('undefined'));
const border = await readFile(new URL('../templates/titleblock.pdf', import.meta.url));
{ const b = await PDFDocument.load(border), pg = b.getPage(0); assert.equal(b.getPageCount(), 1); assert.deepEqual([pg.getWidth(), pg.getHeight(), pg.getRotation().angle], [2592, 1728, 0], 'the clean border: landscape, not rotated'); }

// ---------- Claude ----------
assert.deepEqual(A.claudeModels([{ id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', created_at: '2026-08-01T00:00:00Z' }, { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-09-01T00:00:00Z' }, { id: 'gpt-5', created_at: '2026-10-01' }, { id: 'claude-<x>' }]).map(m => m.id),
  ['claude-opus-5-5', 'claude-sonnet-5-5'], 'Claude models only, newest first');
assert.equal(A.pickedClaude('claude-opus-5-5'), 'claude-opus-5-5'); assert.equal(A.pickedClaude('gpt-5'), ''); assert.equal(A.pickedEffort('xhigh'), 'xhigh'); assert.equal(A.pickedEffort('max'), '', 'max is not offered');
assert.equal(A.DEFAULT_CLAUDE, 'claude-opus-5-5'); assert.equal(A.DEFAULT_EFFORT, 'medium');
assert.equal(AN.serverModel({}), 'claude-opus-5-5'); assert.equal(AN.serverModel({ ANTHROPIC_MODEL: 'claude-sonnet-5-5' }), 'claude-sonnet-5-5'); assert.equal(AN.serverModel({ ANTHROPIC_MODEL: 'gpt-5' }), 'claude-opus-5-5');
assert.equal(AN.effortFor('', {}), 'medium'); assert.equal(AN.effortFor('', { ANTHROPIC_EFFORT: 'high' }), 'high'); assert.equal(AN.effortFor('low', { ANTHROPIC_EFFORT: 'high' }), 'low');
assert.deepEqual(AN.usageOf({ input_tokens: 100, cache_read_input_tokens: 900, cache_creation_input_tokens: 50, output_tokens: 400 }), { input_tokens: 1050, output_tokens: 400, input_tokens_details: { cached_tokens: 900 } }, 'every input token counted, cache reads as cached');
assert.deepEqual(PR.priceOf('claude-opus-5-5'), [4, 0.2, 20]); assert.equal(PR.FEATURES.planset, 'Plan sets');

// the SDK, stubbed: what's sent, and what comes back
const sent = []; let reply = null, fail = null;
const fake = { beta: { messages: { stream: (p) => { sent.push(p); return { finalMessage: async () => { if (fail) { const e = fail; fail = null; throw e; } return reply; } }; } } },
  models: { list: () => (async function* () { yield { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-09-01T00:00:00Z' }; yield { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', created_at: '2026-08-01T00:00:00Z' }; })() } };
AN._setClient(fake, 'k');
const answer = { description: 'Shops on FM 362.', general_notes: ['A.'], codes: ['IBC'], next_steps: ['Survey'] };
reply = { model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(answer) }], usage: { input_tokens: 10, output_tokens: 20 } };
{ const r = await AN.claudeJSON({ key: 'k', model: 'claude-opus-5-5', effort: 'medium', system: 'sys', user: 'u', schema: P.NOTES_SCHEMA });
  assert.deepEqual(r.data, answer); const p = sent.at(-1);
  assert.deepEqual(p.output_config, { effort: 'medium', format: { type: 'json_schema', schema: P.NOTES_SCHEMA } });
  assert.deepEqual(p.thinking, { type: 'adaptive' }); assert.equal(p.fallbacks, 'default'); assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
  assert.deepEqual(p.system[0].cache_control, { type: 'ephemeral' }, 'the instructions are cached across a set’s calls'); }
fail = Object.assign(new Error('400 fallbacks: not supported for this model'), { status: 400 });
{ await AN.claudeJSON({ key: 'k', model: 'claude-haiku-4-5', system: 's', user: 'u', schema: P.NOTES_SCHEMA }); assert.equal(sent.at(-1).fallbacks, undefined, 'a model without fallbacks is asked again without them'); }
reply = { ...reply, stop_reason: 'refusal', stop_details: { category: 'cyber' } };
await assert.rejects(AN.claudeJSON({ key: 'k', model: 'claude-opus-5-5', system: 's', user: 'u', schema: P.NOTES_SCHEMA }), e => e.refusal === true);
reply = { ...reply, stop_reason: 'end_turn', content: [{ type: 'text', text: '{"half' }] };
await assert.rejects(AN.claudeJSON({ key: 'k', model: 'claude-opus-5-5', system: 's', user: 'u', schema: P.NOTES_SCHEMA }), /valid JSON/);
assert.equal(await AN.useClaude('k', 'claude-sonnet-5-5', {}), 'claude-sonnet-5-5', 'a model the key has: used');
assert.equal(await AN.useClaude('k', 'claude-opus-9', {}), 'claude-opus-5-5', 'one it doesn’t: the server’s');

// ---------- the endpoint ----------
for (const k of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) delete process.env[k];
const { default: handler, onBorder, capOf } = await import('../api/planset.js');
const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, send(b) { r.sent = b; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
let ip = 0; const call = async (method, body) => { const res = mock(); await handler({ method, body, headers: { 'x-forwarded-for': '7.7.7.' + (++ip) } }, res); return res; };
delete process.env.ANTHROPIC_API_KEY;
{ const r = await call('GET'); assert.equal(r.body.configured, false); assert.equal(r.body.model, 'claude-opus-5-5'); assert.equal(r.body.effort, 'medium'); assert.equal(r.body.budget.cap, 100, '$100 a month by default (decided Oct 19)'); }
assert.equal((await call('POST', { mode: 'notes', brief: brief })).code, 503, 'no key: the notes can’t be written');
process.env.ANTHROPIC_API_KEY = 'k'; AN._setClient(fake, 'k');
reply = { model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(answer) }], usage: { input_tokens: 10, output_tokens: 20 } };
{ const r = await call('GET'); assert.equal(r.body.configured, true); assert.deepEqual(r.body.models.map(m => m.id), ['claude-opus-5-5', 'claude-sonnet-5-5']); }
{ const r = await call('POST', { mode: 'notes', brief, model: 'claude-sonnet-5-5', effort: 'high' });
  assert.equal(r.code, 200); assert.deepEqual(r.body.notes, P.cleanNotes(answer)); assert.equal(sent.at(-1).model, 'claude-sonnet-5-5'); assert.equal(sent.at(-1).output_config.effort, 'high'); assert.equal(r.headers['X-AI-Model'], 'claude-opus-5-5', 'the model that answered'); }
{ const r = await call('POST', { mode: 'notes', brief, effort: 'max' }); assert.equal(sent.at(-1).output_config.effort, 'medium', 'an effort not offered: the server’s'); assert.equal(sent.at(-1).model, 'claude-opus-5-5'); }
assert.equal((await call('POST', { mode: 'notes', brief: 'short' })).code, 400);
process.env.PLANSET_MONTHLY_CAP_USD = '0'; assert.equal(capOf(), 0);
{ const n = sent.length, r = await call('POST', { mode: 'notes', brief }); assert.equal(r.code, 402, 'a $0 budget: no notes'); assert.equal(sent.length, n, 'and Claude isn’t asked'); }
delete process.env.PLANSET_MONTHLY_CAP_USD; assert.equal(capOf({ PLANSET_MONTHLY_CAP_USD: 'x' }), 100);
assert.equal((await call('POST', { mode: 'pdf', html: '<p>no</p>' })).code, 400, 'the PDF needs a whole document');
assert.equal((await call('POST', { mode: 'other' })).code, 400);
assert.equal((await call('PUT')).code, 405);
// the border under each page of a printed set
{ const c = await PDFDocument.create(); for (let i = 0; i < 2; i++) c.addPage([2592, 1728]).drawRectangle({ x: 200, y: 200, width: 100, height: 100 }); // (Chromium's pages always have content)
  const out = await PDFDocument.load(await onBorder(await c.save(), border));
  assert.equal(out.getPageCount(), 2); assert.deepEqual([out.getPage(1).getWidth(), out.getPage(1).getHeight()], [2592, 1728]); }
// the long job's modes: a discipline's notes, a building design, one sheet
reply = { model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ notes: ['Civil note.'], criteria: [{ item: 'Storm', value: '100-yr' }] }) }], usage: { input_tokens: 10, output_tokens: 20 } };
{ const r = await call('POST', { mode: 'disc', discipline: 'civil', brief }); assert.equal(r.code, 200); assert.deepEqual(r.body.disc, { notes: ['Civil note.'], criteria: [{ item: 'Storm', value: '100-yr' }] }); assert.ok(sent.at(-1).user === undefined && JSON.stringify(sent.at(-1).messages).includes('civil')); }
assert.equal((await call('POST', { mode: 'disc', discipline: 'astrology', brief })).code, 400);
{ const t = PD.buildingTypes(retail)[0], seed = PD.fallbackDesign(t); reply = { ...reply, content: [{ type: 'text', text: JSON.stringify(seed) }] };
  const r = await call('POST', { mode: 'design', type: t.id, brief: PD.designBrief(t), seed, previous: seed, problems: ['Room "x" overlaps'] });
  assert.equal(r.code, 200); assert.deepEqual(r.body.design, seed, 'the design comes back as Claude wrote it (the browser checks it)');
  const msg = JSON.stringify(sent.at(-1).messages); assert.ok(msg.includes('failed these checks') && msg.includes('overlaps'), 'the problems go back to Claude'); assert.deepEqual(sent.at(-1).output_config.format.schema, PD.DESIGN_SCHEMA); }
assert.equal((await call('POST', { mode: 'sheet', html: 'nope' })).code, 400, 'one sheet needs a whole document');
// the border alone, which the browser lays once under a long set's bare sheets
{ const res = mock(); await handler({ method: 'GET', query: { border: '1' }, headers: { 'x-forwarded-for': '7.7.8.1' } }, res);
  assert.equal(res.headers['Content-Type'], 'application/pdf'); const bd = await PDFDocument.load(res.sent); assert.deepEqual([bd.getPage(0).getWidth(), bd.getPage(0).getHeight()], [2592, 1728]); }
console.log('plan sets ok');
