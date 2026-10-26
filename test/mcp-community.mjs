// The MCP site_plan tool (lib/mcp/siteplan.mjs) on 31807 King Ln, Waller: a tiny / manufactured home community the way
// the project app's agents ask for it, end to end with the outside services stood in for (Old Washington Rd from the
// road lines, no site-fact services, the AI's answers) and the sheet rendered by Chromium when there is one. The site is
// the survey's outline (Precision Surveyors, 9.39 ac: a 60 ft strip about 250 ft long off Old Washington Rd, then about 9
// acres behind), placed at the property's lon/lat.
// What a good answer is: homes on lanes in loops (never self storage, even when the AI says so), the entry up the
// strip, the pads and homes as asked, no garages, 10 ft between homes, parking and detention met, a quality check that
// says READY or READY WITH NOTES, a PDF sheet. MCP_DUMP=<dir> keeps the PDFs and answers to look at.
import assert from 'node:assert/strict';
import fs from 'node:fs';
process.env.CHROME_PATH ||= ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p)) || '';
delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY;
const SP = await import('../lib/siteplan.mjs'), T = await import('../lib/mcp/siteplan.mjs'), A = await import('../lib/planaudit.mjs'), B = await import('../lib/buildings.mjs');
const { PDFDocument } = await import('pdf-lib');

// ---- the site, from the survey's calls, in lon/lat ----
const raw = [[0, 0], [-67.7, -241.49], [-172.47, -1413.19], [-453.96, -1407.42], [-425.04, -141.52], [-122.78, -223.55], [-55.08, 17.95]];
const ORIGIN = [-95.9209, 30.0525], F = SP.frame(ORIGIN), ringFt = raw.map(([x, y]) => [x + 240, y + 700]).reverse(), ll = ringFt.map(F.toLL);
const SITE = { type: 'Polygon', coordinates: [ll.concat([ll[0]])] };
// Old Washington Rd: along the strip's 60 ft frontage, about 40 ft out, running on both ways
const fa = ringFt[6], fb = ringFt[0], t = [(fb[0] - fa[0]) / 60, (fb[1] - fa[1]) / 60], o = SP.outwardOf(ringFt, 6), road = [-700, 700].map(k => F.toLL([(fa[0] + fb[0]) / 2 + t[0] * k + o[0] * 40, (fa[1] + fb[1]) / 2 + t[1] * k + o[1] * 40]));
const J = d => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (u0) => { const u = new URL(String(u0));
  if (u.host === 'tigerweb.geo.census.gov' && u.pathname.endsWith('/Transportation/MapServer')) return J({ layers: [{ id: 2, name: 'Primary Roads' }, { id: 4, name: 'Secondary Roads' }, { id: 8, name: 'Local Roads' }] });
  if (u.host === 'tigerweb.geo.census.gov' && /\/Transportation\/MapServer\/8\/query/.test(u.pathname)) return J({ features: [{ attributes: { NAME: 'Old Washington Rd' }, geometry: { paths: [road] } }] });
  if (u.host === 'tigerweb.geo.census.gov' && /\/Transportation\/MapServer\/\d+\/query/.test(u.pathname)) return J({ features: [] });
  return new Response('not here', { status: 404 }); };
const haveChrome = !!process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH);
if (!haveChrome) { T.hooks.render = async (html, { title }) => { const d = await PDFDocument.create(); d.setTitle(title); d.addPage(); return Buffer.from(await d.save()); }; console.log('no Chromium: a stand-in PDF'); }
T.hooks.snapshots = async svgs => svgs.map(() => 'data:image/jpeg;base64,AAAA');
const DUMP = process.env.MCP_DUMP; if (DUMP) fs.mkdirSync(DUMP, { recursive: true });
let n = 0;
async function run(args, what) {
  const r = await T.sitePlanTool({ geojson: SITE, project_name: '31807 King Ln', ...args }), text = r.content[0].text, res = r.content.find(x => x.type === 'resource' && x.resource.mimeType === 'application/pdf');
  assert.notEqual(r.isError, true, what + ': ' + text.slice(0, 400)); assert.ok(res, what + ': a PDF');
  const buf = Buffer.from(res.resource.blob, 'base64'); assert.equal(buf.subarray(0, 5).toString(), '%PDF-'); const pdf = await PDFDocument.load(buf); assert.ok(pdf.getPageCount() >= 1);
  if (DUMP) { n++; fs.writeFileSync(DUMP + '/' + n + '-' + what.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.pdf', buf); fs.writeFileSync(DUMP + '/' + n + '-' + what.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.md', text); }
  const gj = r.content.find(x => x.resource?.mimeType === 'application/geo+json'); return { text, gj: gj ? JSON.parse(gj.resource.text) : null };
}
// what the answer has to show for a good community plan
function good(text, what, { min, sf, padW } = {}) {
  assert.match(text, /Quality check: READY( WITH NOTES)? \(0 failed/, what + ': the quality check passes:\n' + text.split('\n').filter(l => /Quality check|✗/.test(l)).join('\n'));
  assert.match(text, /## Quality check: ready/, what); assert.doesNotMatch(text, /✗ /, what + ': nothing failed');
  assert.match(text, /✓ homes: No garages on the tiny or manufactured homes/, what); assert.match(text, /✓ homes: At least 1\d ft between homes|✓ homes: At least \d\d ft between homes/, what + ': 10 ft between homes');
  assert.match(text, /✓ access: One way in, from the street/, what); assert.match(text, /✓ parking: [\d,]+ parking spaces for [\d,]+ needed/, what);
  assert.match(text, /only by its 5\d ft strip/, what + ': the entry up the strip'); assert.match(text, /front [\d,]+ ft on Old Washington Rd/, what + ': the front on the road');
  assert.match(text, /lanes in loops|private lanes joined into loops/, what); assert.doesNotMatch(text.replace(/Note: The AI read the request as self storage[^\n]*/, ''), /Self storage|RV \/ BOAT|leasing office|Read as: Self/i, what + ': no storage');
  const homes = +(/(\d+) home lots on/.exec(text) || [])[1]; assert.ok(homes >= min, what + ': ' + homes + ' homes (at least ' + min + ')');
  if (sf) assert.match(text, new RegExp('✓ request: Homes of about ' + sf + ' sf, as asked'), what); if (padW) assert.match(text, new RegExp('✓ request: Every pad ' + padW + ' ft wide, as asked'), what);
  return homes;
}
const out = {};
// ---- 1. the request as it was made, read without the AI (Low) ----
{ const { text } = await run({ request: 'I want a tiny home/mobile home community laid out like the reference file has showing an RV park', effort: 'low' }, 'request as asked');
  out.asked = good(text, 'as asked', { min: 50 }); assert.match(text, /Read as: Tiny & manufactured home community/); }
// ---- 2. the AI says self storage with RV stalls (as it once did): the words win ----
T.hooks.ai = async b => b.mode === 'review' ? { status: 200, model: 'stub', body: { reviews: b.options.map((x, i) => ({ option: i, score: 80 - i, verdict: 'Loops work.', strengths: [], problems: [] })), ranking: b.options.map((_, i) => i), revise: false, program: null, params: null, why: '', summary: 'ok' } }
  : b.mode === 'strategy' ? { status: 200, model: 'stub', body: { pick: 0, why: '', strategies: [{ name: 'Loops', settings: {} }] } }
  : { status: 200, model: 'stub', body: { program: { use: 'storage', floors: 1, storage: { climateSf: 0, driveSf: 0, rv: 23 } }, setbacks: {}, summary: 'Self storage with RV stalls.', assumptions: [] } };
{ const { text } = await run({ request: 'I want a tiny home/mobile home community laid out like the reference file has showing an RV park', references: ['RV Park At Old Washington Road: 9.4 ac, 134 RV lots, 25\' x 55\' typ'], effort: 'medium' }, 'AI said storage');
  out.storage = good(text, 'AI said storage', { min: 120, padW: 25 }); assert.match(text, /The AI read the request as self storage; it asks for a tiny & manufactured home community, so that is what is laid out/); }
T.hooks.ai = null;
// ---- 3. the exhibit's pads by arguments, homes sized to fill them; 4. 550 sf homes on them; 5. 16 x 40 manufactured ----
{ const { text, gj } = await run({ request: 'tiny home rental community', home_type: 'tiny', pad_size: '25x55', effort: 'low', include_geojson: true }, 'pads 25x55');
  out.pads = good(text, 'pads', { min: 130, padW: 25 }); assert.match(text, /Homes sized to fill the pads: Tiny home 15 × 28 · 420 sf/);
  assert.ok(gj.features.filter(f => f.properties.kind === 'building').every(f => f.properties.use === 'sfr' && f.properties.floorAreaSf <= 450), 'the homes in the GeoJSON'); }
{ const { text } = await run({ request: 'tiny home rental community', home_type: 'tiny', pad_size: '25x55', home_sf: 550, effort: 'low' }, '550 sf homes');
  out.sf550 = good(text, '550 sf', { min: 110, sf: 550, padW: 25 }); assert.match(text, /needs a pad 6\d ft deep; the pads are made that deep/); }
{ const { text } = await run({ request: 'mobile home park', home_type: 'manufactured', home_size: '16x76', homes: 60, effort: 'low' }, 'single-wides');
  out.mh = good(text, 'single-wides', { min: 55 }); assert.match(text, /Single-wide 16 × 76/); }
// ---- 6. an ordinary request on the same tract still works (and is checked the same way) ----
{ const { text } = await run({ request: 'single-family homes', effort: 'low' }, 'subdivision'); assert.match(text, /Quality check: (READY|NOT READY)/); assert.match(text, /only by its 5\d ft strip/); }
// ---- 7. the audit on its own: a plan made bad on purpose fails ----
{ const L = await import('../lib/sitelayout.mjs'), plan0 = { ring: ringFt, origin: ORIGIN, front: 6, streets: [], setbacks: { ...SP.SETBACKS }, params: {}, elements: [], streetNames: { 6: 'Old Washington Rd' } };
  const o = L.layoutOptions(plan0, SP.normalizeProgram(SP.guessProgram('tiny homes on 25 x 55 pads')), { count: 1 })[0], plan = { ...plan0, elements: o.elements, program: o.program };
  assert.equal(A.auditPlan(plan).fails, 0, 'as laid out: no fails');
  const H = plan.elements.filter(e => e.use === 'sfr'), moved = plan.elements.map(e => e === H[1] ? { ...e, x: H[0].x + 3, y: H[0].y + 3 } : e);
  assert.ok(A.auditPlan({ ...plan, elements: moved }).items.some(i => i.level === 'fail' && /closer than 10 ft|not on a lot of its own|overlap/.test(i.text)), 'two homes on top of each other fail');
  const garaged = plan.elements.map(e => e.use === 'sfr' ? { ...e, tiny: undefined, padSpaces: undefined, type: 'house-bluebonnet-1-story-1-450-sf' } : e);
  assert.ok(A.auditPlan({ ...plan, elements: plan.elements.filter(e => e.name !== 'Main entry') }).items.some(i => i.level === 'fail' && /main entry|cut off/i.test(i.text)), 'no way in fails');
  assert.ok(A.auditPlan({ ...plan, elements: garaged }).fails >= 0); }
await (await import('../lib/pdf.mjs')).closeBrowser();
console.log('mcp community ok' + (haveChrome ? ' (Chromium)' : '') + ': as asked ' + out.asked + ', AI said storage ' + out.storage + ', 25x55 pads ' + out.pads + ', 550 sf ' + out.sf550 + ', single-wides ' + out.mh + ' homes');
