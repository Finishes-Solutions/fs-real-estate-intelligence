// The MCP site_renderings tool (lib/mcp/renderings.mjs) and the massing picture it paints from (lib/massingsvg.mjs): the plan's
// 3D massing drawn from the website's camera presets with the site in frame, the image model and the snapshot stood in
// for; the renderings kept with the saved plan and put on a plan set's A-9xx sheets (lib/mcp/planset.mjs).
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), M = { ...await import('../lib/massing.mjs'), ...await import('../lib/massingsvg.mjs') }, RD = await import('../lib/render.mjs');
const ST = await import('../lib/mcp/store.mjs'), RN = await import('../lib/mcp/renderings.mjs'), PSET = await import('../lib/mcp/planset.mjs'), { callTool } = await import('../lib/mcp/server.mjs');

const mk = (o, pts) => { const k = 364567 * Math.cos(o[1] * Math.PI / 180); return { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(([x, y]) => [o[0] + x / k, o[1] + y / 364567])] }; };
const b = S.unionParcels([mk([-95.98, 30.06], [[0, 0], [920, 0], [920, 259], [822, 259], [822, 378], [0, 378]])]);
const site = { ...b, front: b.ring.findIndex((p, i) => S.outwardOf(b.ring, i)[0] < -0.9), setbacks: { ...S.SETBACKS } };
const laid = prog => { const o = L.layoutOptions(site, prog)[0]; return { ...site, name: 'A', elements: o.elements, zones: o.zones, program: o.program }; };
const retail = laid({ use: 'retail', gfa: 40000 }), town = laid({ use: 'townhomes' });

// ---------- the massing picture ----------
for (const [name, plan] of [['retail', retail], ['townhomes', town]]) for (const view of RD.VIEWS.map(v => v.id)) {
  const svg = M.massingSVG(plan, view, { w: 1600, h: 900 });
  assert.match(svg, /^<svg [^>]*width="1600" height="900"/); assert.ok(!/NaN|Infinity/.test(svg), name + ' ' + view + ': finite');
  const n = (svg.match(/<polygon /g) || []).length; assert.ok(n > 50, name + ' ' + view + ': the pieces are drawn (' + n + ')');
  // the site fills most of the frame and stays inside it
  const K = M.fitCamera(M.massingCamera(plan, view, { w: 1600, h: 900 }), plan.ring.map(([x, y]) => [x, y, 0]));
  const pts = plan.ring.map(([x, y]) => { const v = [x - K.eye[0], y - K.eye[1], -K.eye[2]], c = [v[0] * K.r[0] + v[1] * K.r[1] + v[2] * K.r[2], v[0] * K.u[0] + v[1] * K.u[1] + v[2] * K.u[2], v[0] * K.f[0] + v[1] * K.f[1] + v[2] * K.f[2]]; return [800 + c[0] / c[2] * K.focal, 450 - c[1] / c[2] * K.focal]; });
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  assert.ok(Math.min(...xs) > -2 && Math.max(...xs) < 1602 && Math.min(...ys) > -2 && Math.max(...ys) < 902, name + ' ' + view + ': in frame');
  assert.ok(Math.max(Math.max(...xs) - Math.min(...xs), (Math.max(...ys) - Math.min(...ys)) * 16 / 9) > 900, name + ' ' + view + ': fills it');
}
assert.match(M.massingSVG(retail, 'corner', { surround: 'none' }), /fill="#d9dad6"/, 'the site alone: a plain grey ground');
console.log('massing pictures ok');

// ---------- site_renderings ----------
const mem = ST.memoryStore(); ST.hooks.store = mem;
await ST.putJSON(mem, 'plans/plan0000002.json', { v: 1, id: 'plan0000002', plan: retail, layout: 'Layout 1', verdict: 'ready', projectName: 'FM 362 Retail', address: 'FM 362, Waller, TX 77484', county: 'Waller County, Texas', parcels: [], facts: ['FEMA flood zone X.'], checks: [], vicinity: '' });
const painted = [], jpeg = Buffer.from('ffd8ffe000104a464946', 'hex').toString('base64');
RN.hooks.snapshot = async (svgs, { px }) => svgs.map(s => { assert.match(s, /^<svg/); assert.equal(px, 1600); return 'data:image/jpeg;base64,' + jpeg; });
RN.hooks.paint = async (key, o) => { painted.push(o); return { b64: jpeg, size: o.sizes[0], model: 'test-image-model' }; };
const text = r => r.content.find(c => c.type === 'text').text;
let r = await callTool('site_renderings', { plan_id: 'plan0000002', views: ['corner', 'hero'], look: 'brick', time: 'golden' });
assert.notEqual(r.isError, true, text(r));
assert.equal(painted.length, 2); assert.match(painted[0].prompt, /Turn this 3D massing model/); assert.match(painted[0].prompt, /red and tan brick/); assert.match(painted[0].prompt, /late-afternoon/);
assert.match(painted[1].prompt, /close-up aerial of /, 'the close-up frames one building'); assert.deepEqual(painted[0].sizes[0], '2048x1152');
assert.equal(r.content.filter(c => c.type === 'resource' && c.resource.mimeType === 'image/jpeg').length, 2, 'the JPEGs in the answer');
assert.match(text(r), /2 renderings \(brick and stone, late afternoon, typical surroundings\)/); assert.match(text(r), /- From the corner: 2048 × 1152, test-image-model\. https:\/\/storage\.test\//); assert.match(text(r), /Building close-up · /);
assert.match(text(r), /plan_set puts the newest four on its rendering sheets/); assert.match(text(r), /AI concept illustrations/);
const saved = await ST.getJSON(mem, 'plans/plan0000002.json'); assert.equal(saved.renders.length, 2); assert.ok(await mem.get(saved.renders[0].path), 'kept in storage');
// out of time: the views not started are named for the next call
{ let T = 0; RN.hooks.now = () => T; const p0 = RN.hooks.paint; RN.hooks.paint = async (k, o) => { T += 200000; return p0(k, o); };
  r = await callTool('site_renderings', { plan_id: 'plan0000002', views: ['front', 'rear'] }); assert.match(text(r), /Not made in this call \(out of time\): rear\. Call site_renderings again with views \["rear"\]/); RN.hooks.paint = p0; RN.hooks.now = null; }
// errors in plain words
r = await callTool('site_renderings', { plan_id: 'plan0000002', views: ['sky'] }); assert.equal(r.isError, true); assert.match(text(r), /Unknown view: sky/);
r = await callTool('site_renderings', { plan_id: 'nope00000000' }); assert.equal(r.isError, true); assert.match(text(r), /no saved site plan/);
{ const empty = { ...retail, elements: retail.elements.filter(e => e.kind !== 'building') }; await ST.putJSON(mem, 'plans/plan0000003.json', { plan: empty });
  r = await callTool('site_renderings', { plan_id: 'plan0000003' }); assert.equal(r.isError, true); assert.match(text(r), /no buildings to render/); }
console.log('mcp site_renderings ok');

// ---------- the renderings on a plan set's A-9xx sheets ----------
let T = 0; PSET.hooks.now = () => T; PSET.hooks.ai = async b => { T += 1000; throw Object.assign(new Error('off'), { status: 503 }); };
const pg = async () => { const d = await PDFDocument.create(); d.addPage([2592, 1728]).drawRectangle({ x: 1, y: 1, width: 5, height: 5 }); return Buffer.from(await d.save()); };
const htmls = []; PSET.hooks.render = async html => { htmls.push(html); return pg(); }; PSET.hooks.border = await pg();
r = await callTool('plan_set', { plan_id: 'plan0000002', sections: ['civil', 'renderings'] });
for (let k = 0; k < 6 && !/Download:/.test(text(r)); k++) r = await callTool('plan_set_status', { job_id: /Job: ([\w-]+)/.exec(text(r))[1] });
assert.match(text(r), /Renderings: A-901 Conceptual rendering; A-902 Conceptual rendering; A-903 Conceptual rendering/, 'one sheet a rendering (' + text(r).split('\n').find(l => /^Renderings/.test(l)) + ')');
assert.ok(htmls.some(h => h.includes('src="data:image/jpeg;base64,' + jpeg)), 'the rendering is in its sheet');
console.log('mcp plan_set with renderings ok');
console.log('mcp renderings tests passed');
