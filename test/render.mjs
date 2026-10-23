// Offline tests for renderings: lib/render.mjs (the camera presets, the brief, the prompt, the model pick) and
// api/render.js with a mocked OpenAI Images API and a mocked Supabase (the monthly budget). Run: node test/render.mjs
import assert from 'node:assert/strict';
process.env.OPENAI_API_KEY = 'sk-test'; process.env.SUPABASE_URL = 'https://x.supabase.co'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
const R = await import('../lib/render.mjs');

// a 300 × 200 ft lot, street along the south side (front edge 0: (0,0)→(300,0)), three buildings
const plan = { origin: [-95.78, 29.78], ring: [[0, 0], [300, 0], [300, 200], [0, 200]], front: 0, params: { trees: true },
  elements: [{ id: 'b1', kind: 'building', use: 'retail', x: 150, y: 150, w: 200, d: 60, rot: 0, floors: 1 }, { id: 'b2', kind: 'building', use: 'restaurant', x: 50, y: 60, w: 60, d: 40, rot: 0, floors: 1, form: 'L' },
    { id: 'b3', kind: 'building', use: 'multifamily', x: 250, y: 60, w: 60, d: 50, rot: 0, floors: 3, units: 24 }, { id: 'p', kind: 'parking', x: 150, y: 80, w: 200, d: 60, rot: 0 }, { id: 'd', kind: 'pond', x: 280, y: 180, w: 30, d: 30, rot: 0 }] };

// the street is to the south: looking from it into the site is looking north (bearing 0)
assert.equal(Math.round(R.streetBearing(plan)), 0, 'front view looks north from the street');
assert.equal(Math.round(R.streetBearing({ ...plan, front: 2 })), 180, 'a site fronting the north edge is looked at from the north');
const cam = R.cameraFor('front', plan);
assert.equal(cam.bearing, 0); assert.equal(cam.pitch, 48);
assert.ok(cam.zoom > 16 && cam.zoom <= 19, 'a 300 ft lot is framed at the map’s closest zoom: ' + cam.zoom);
assert.ok(cam.center[1] > 100, 'the pitched camera aims past the middle so the whole site sits in the frame: ' + cam.center);
const corner = R.cameraFor('corner', plan); assert.equal(corner.bearing, 325, 'the corner view turns toward the left corner');
const rear = R.cameraFor('rear', plan); assert.equal(rear.bearing, 205, 'the rear view looks back toward the street');
const big = R.cameraFor('front', { ...plan, ring: [[0, 0], [3000, 0], [3000, 2000], [0, 2000]] }); big.ring = [[0, 0], [3000, 0], [3000, 2000], [0, 2000]]; assert.ok(big.zoom < cam.zoom - 2, 'a 140-acre site zooms out: ' + big.zoom);
assert.equal(R.cameraFor('nonsense', plan).view, 'corner', 'an unknown view is the corner one, the default');
// the camera sizes the frame to the canvas: a narrower canvas needs to zoom out
assert.ok(R.cameraFor('front', { ...plan, ring: big.ring }, { px: 600 }).zoom < big.zoom, 'narrower canvas, lower zoom');

// the building close-up: the selected building wins; else the building nearest the street (the front edge is y = 0:
// b3's front wall is 35 ft back, b2's 40 ft, b1's 120 ft); a selected piece that isn't a building doesn't count
assert.equal(R.heroTarget(plan).id, 'b3', 'nothing selected: the building nearest the street');
assert.equal(R.heroTarget(plan, 'b1').id, 'b1', 'the selected building wins');
assert.equal(R.heroTarget(plan, 'p').id, 'b3', 'a selected parking row is not a building: nearest the street');
assert.equal(R.heroTarget({ ...plan, front: 2 }).id, 'b1', 'a site fronting the north edge: the back building is now the front one');
assert.equal(R.heroTarget({ ...plan, elements: plan.elements.filter(e => e.kind !== 'building') }), null, 'no buildings, no close-up');
assert.ok(!R.SITE_VIEWS.includes('hero') && R.SITE_VIEWS.length === 4, 'All site views is the four whole-site views');
const hero = R.cameraFor('hero', plan);
assert.equal(hero.pitch, 45); assert.equal(hero.bearing, corner.bearing, 'the close-up turns like the corner view'); assert.deepEqual(hero.target, { id: 'b3', name: 'Building' }, 'unnamed: Building');
assert.ok(hero.zoom >= cam.zoom, 'closer than the whole-site view: ' + hero.zoom + ' vs ' + cam.zoom);
const bigSite = { ...plan, ring: [[0, 0], [3000, 0], [3000, 2000], [0, 2000]], elements: plan.elements.map(e => e.id === 'b1' ? { ...e, name: 'Building A' } : e) };
const heroBig = R.cameraFor('hero', bigSite, { target: 'b1' }), wideBig = R.cameraFor('corner', bigSite);
assert.equal(heroBig.target.name, 'Building A'); assert.ok(heroBig.zoom > wideBig.zoom + 2, 'on a big site the close-up is far closer: ' + heroBig.zoom + ' vs ' + wideBig.zoom);
assert.ok(Math.hypot(heroBig.center[0] - 150, heroBig.center[1] - 150) < 60, 'aimed at the chosen building: ' + heroBig.center);
assert.equal(R.cameraFor('hero', plan, { target: plan.elements[0] }).target.id, 'b1', 'the target can be the element itself');
// the framed box: the building's footprint grown 45 ft each side, along the building's own axes
const hp = R.heroPoints({ x: 0, y: 0, w: 100, d: 50, rot: 90 }), xs = hp.map(p => p[0]), ys = hp.map(p => p[1]);
assert.ok(Math.abs(Math.max(...xs) - 70) < 1e-6 && Math.abs(Math.max(...ys) - 95) < 1e-6, 'a 100 × 50 building turned 90° frames 140 × 190 ft: ' + JSON.stringify(hp));
assert.equal(R.renderLabel('hero', { name: 'Building A' }), 'Building close-up · Building A'); assert.equal(R.renderLabel('hero', null), 'Building close-up · Building'); assert.equal(R.renderLabel('front', { name: 'x' }), 'From the street');

// the brief: uses grouped with their floors and forms, what else is on the site
const brief = R.briefOf(plan, { metrics: { acres: 1.377, spaces: 112.4 }, address: '123 Main St, Katy', facts: ['FEMA flood zone X.'], look: 'brick', time: 'dusk', basemap: 'sat' });
assert.equal(brief.buildings, 3); assert.equal(brief.parking, 112); assert.equal(brief.acres, 1.38); assert.equal(brief.pond, true); assert.equal(brief.pool, undefined);
assert.deepEqual(brief.uses.map(u => u.use), ['retail', 'restaurant', 'multifamily']);
assert.deepEqual(brief.uses[1].forms, ['L']); assert.equal(brief.uses[2].units, 24); assert.deepEqual(brief.uses[2].floors, [3]);
assert.equal(brief.basemap, 'satellite'); assert.equal(brief.look, 'brick');

// the prompt: what must not change, the buildings, the materials, the light, the surroundings
const pr = R.renderPrompt(brief, 'corner');
for (const s of ['must not change', '1 1-storey retail building', '1 1-storey restaurant building (L-shaped)', '1 3-storey multifamily building, 24 units in all', 'about 112 parking spaces', 'detention pond', 'red and tan brick', 'dusk', 'real aerial imagery', 'FEMA flood zone X.', 'No text, labels'])
  assert.ok(pr.includes(s), 'prompt says: ' + s + '\n' + pr);
assert.ok(!pr.includes('undefined') && !pr.includes('null'), 'no holes in the prompt');
const pr2 = R.renderPrompt({ ...brief, look: 'auto', basemap: 'map', facts: [] }, 'low');
assert.ok(pr2.includes('garden-style apartments') && pr2.includes('retail strip'), 'no look picked: materials by use'); assert.ok(pr2.includes('replace the flat map graphics'), 'map base: invent the surroundings'); assert.ok(pr2.includes('low aerial from over the entry drive'), 'the low view is from the entry drive'); assert.ok(pr.includes('whole site in the frame'), 'composed wide');
assert.ok(R.renderPrompt({}, 'front').length > 200, 'an empty brief still makes a usable prompt');
// the close-up's prompt: about the focused building, the rest of the site around it, still nothing changed and no text
const hb = R.briefOf(plan, { metrics: { acres: 1.377, spaces: 112.4 }, look: 'auto', focus: { ...plan.elements[2], name: 'Building C' } });
assert.deepEqual(hb.focus, { name: 'Building C', use: 'multifamily', floors: 3, label: R.briefOf(plan).uses[2].label }); assert.equal(brief.focus, undefined, 'no focus unless asked');
const hpr = R.renderPrompt(hb, 'hero');
for (const s of ['hero photograph', 'close-up aerial of Building C', '3-storey multifamily building', 'rest of the site continues around it', 'Materials for Building C: garden-style apartments', 'must not change', 'No text, labels'])
  assert.ok(hpr.includes(s), 'close-up prompt says: ' + s + '\n' + hpr);
assert.ok(!hpr.includes('whole site in the frame') && !hpr.includes('undefined'), 'the close-up is not composed wide');
assert.ok(!R.renderPrompt(hb, 'corner').includes('close-up'), 'a site view ignores the focus');
assert.ok(R.renderPrompt({}, 'hero').includes('close-up aerial of Building,'), 'a close-up with no focus still makes a usable prompt');

// the model: gpt-image-2.5-sunburst when the key lists it; else the newest GPT Image it lists, never a mini; the
// environment's pick wins; the preferred one when nothing is known
assert.equal(R.PREFERRED_IMAGE_MODEL, 'gpt-image-2.5-sunburst');
assert.equal(R.pickImageModel([{ id: 'gpt-image-1' }, { id: 'gpt-image-2.5-sunburst' }, { id: 'gpt-image-2' }]), 'gpt-image-2.5-sunburst');
assert.equal(R.pickImageModel([{ id: 'gpt-image-1' }, { id: 'gpt-image-2' }, { id: 'gpt-image-1-mini' }, { id: 'gpt-image-1.5' }, { id: 'gpt-5' }]), 'gpt-image-2');
assert.equal(R.pickImageModel(['gpt-image-1', 'gpt-image-1.5']), 'gpt-image-1.5');
assert.equal(R.pickImageModel(['gpt-image-2', 'gpt-image-2-aurora']), 'gpt-image-2-aurora', 'a named edition edges out the plain one');
assert.equal(R.pickImageModel(['gpt-image-1-mini', 'gpt-4o']), 'gpt-image-2.5-sunburst', 'nothing usable listed: try the preferred one');
assert.equal(R.pickImageModel([]), 'gpt-image-2.5-sunburst');
assert.equal(R.pickImageModel([], 'gpt-image-9'), 'gpt-image-9');

// ---------- the endpoint, with OpenAI mocked ----------
const calls = [], PNG = 'data:image/png;base64,' + Buffer.from('fake-png-bytes').toString('base64');
let refuseSize = 1, refuseFidelity = 1, fail500 = 0;
// this month's Renderings rows in ai_usage (the budget read), and whether that read fails
let usage = [], supaFail = false; const reads = [];
globalThis.fetch = async (url, opts = {}) => {
  url = String(url); const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.startsWith('https://x.supabase.co/rest/v1/rpc/ai_usage_add')) return new Response(null, { status: 204 });
  if (url.startsWith('https://x.supabase.co/rest/v1/ai_usage?')) { reads.push(url); return supaFail ? new Response('{"message":"bad gateway"}', { status: 503 }) : json(usage); }
  if (url.endsWith('/models')) return json({ data: [{ id: 'gpt-image-1' }, { id: 'gpt-image-2' }, { id: 'gpt-image-2.5-sunburst' }, { id: 'gpt-5' }] });
  if (url.endsWith('/images/edits')) {
    const f = opts.body, rec = { model: f.get('model'), size: f.get('size'), quality: f.get('quality'), fidelity: f.get('input_fidelity'), prompt: f.get('prompt'), img: f.get('image[]'), n: f.get('n'), fmt: f.get('output_format') }; calls.push(rec);
    if (fail500 > 0) { fail500--; return json({ error: { message: 'overloaded' } }, 500); }
    if (refuseFidelity > 0 && rec.fidelity) { refuseFidelity--; return json({ error: { message: "Unknown parameter: 'input_fidelity'." } }, 400); }
    if (refuseSize > 0 && rec.size === '1920x1080') { refuseSize--; return json({ error: { message: "Invalid value: '1920x1080'. Supported values are: '1024x1024', '1536x1024', '1024x1536', and 'auto'." } }, 400); }
    return json({ created: 1, data: [{ b64_json: Buffer.from('jpeg-bytes').toString('base64') }], usage: { input_tokens: 1200, output_tokens: 6000, input_tokens_details: { image_tokens: 1100, text_tokens: 100 } } });
  }
  throw new Error('unexpected fetch ' + url);
};
function mockRes() { const r = { code: 200, headers: {}, body: null, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; }
const req = o => ({ method: 'POST', headers: { host: 'x.test', 'x-forwarded-for': o.ip || '9.9.9.1' }, query: {}, url: '/', ...o });
const { default: render, cleanBrief, dataImage } = await import('../api/render.js');

let res = mockRes(); await render(req({ body: { image: PNG, brief, view: 'corner' } }), res);
assert.equal(res.code, 200, JSON.stringify(res.body));
assert.ok(res.body.image.startsWith('data:image/jpeg;base64,'), 'the picture comes back as a JPEG data URL');
assert.equal(res.body.model, 'gpt-image-2.5-sunburst', 'the preferred image model, which the key lists'); assert.equal(res.headers['X-AI-Model'], 'gpt-image-2.5-sunburst');
assert.equal(res.body.size, '1536x1024', 'a model that refuses 1080p gets the next size'); assert.equal(res.body.view, 'corner');
assert.equal(calls.length, 3, 'fidelity refused, size refused, then painted: ' + calls.map(c => c.size + '/' + c.fidelity).join(' '));
assert.deepEqual(calls.map(c => c.fidelity), ['high', null, null]); assert.deepEqual(calls.map(c => c.size), ['1920x1080', '1920x1080', '1536x1024']);
assert.equal(calls[2].quality, 'high'); assert.equal(calls[2].n, '1'); assert.equal(calls[2].fmt, 'jpeg'); assert.equal(calls[2].model, 'gpt-image-2.5-sunburst');
assert.ok(calls[2].img && calls[2].img.size === 'fake-png-bytes'.length && calls[2].img.type === 'image/png', 'the massing picture is sent as the image to edit');
assert.ok(calls[2].prompt.includes('must not change') && calls[2].prompt.includes('From the corner'.toLowerCase().split(' ')[0]) && calls[2].prompt.includes('red and tan brick'), 'the prompt is the lib’s, from the brief');

// a model that takes 1080p and input_fidelity straight away: one call
calls.length = 0; refuseSize = 0; refuseFidelity = 0;
res = mockRes(); await render(req({ body: { image: PNG, brief: {}, view: 'front' }, ip: '9.9.9.2' }), res);
assert.equal(res.code, 200); assert.equal(res.body.size, '1920x1080'); assert.equal(calls.length, 1); assert.equal(calls[0].fidelity, 'high');
// a 500 is retried, then succeeds
calls.length = 0; fail500 = 1;
res = mockRes(); await render(req({ body: { image: PNG, brief: {}, view: 'front' }, ip: '9.9.9.3' }), res);
assert.equal(res.code, 200); assert.equal(calls.length, 2, 'one retry after a 500');
// bad input
res = mockRes(); await render(req({ body: { image: 'https://evil.example/x.png', brief: {} }, ip: '9.9.9.4' }), res); assert.equal(res.code, 400, 'only data URLs');
res = mockRes(); await render(req({ body: { image: 'data:image/svg+xml;base64,AAAA', brief: {} }, ip: '9.9.9.5' }), res); assert.equal(res.code, 400, 'no SVG');
res = mockRes(); await render(req({ method: 'PUT' }), res); assert.equal(res.code, 405);
assert.equal(dataImage('data:image/jpeg;base64,' + 'A'.repeat(4_000_000)), null, 'too big');
// the brief is cleaned, not trusted
const cb = cleanBrief({ address: 'x'.repeat(500), acres: -4, uses: [{ use: 'retail', count: 1e9, floors: [0, 999, 'a'], forms: ['bar', 'blob'], units: '12' }], buildings: 'many', parking: 1e9, facts: Array(40).fill('f'.repeat(900)), look: 'brick', basemap: 'hacked' });
assert.equal(cb.address.length, 120); assert.equal(cb.acres, undefined); assert.equal(cb.uses[0].count, 500); assert.deepEqual(cb.uses[0].floors, [1, 60, 1]); assert.deepEqual(cb.uses[0].forms, ['bar']); assert.equal(cb.uses[0].units, 12);
const cf = cleanBrief({ focus: { name: 'B'.repeat(300), use: 'retail', floors: 999, label: 'Retail', evil: 'x' } });
assert.deepEqual(cf.focus, { name: 'B'.repeat(40), use: 'retail', floors: 60, label: 'Retail' }, 'the focus is kept, clipped'); assert.equal(cb.focus, undefined); assert.equal(cleanBrief({ focus: 'Building A' }).focus, undefined);
assert.ok(R.renderPrompt(cleanBrief(hb), 'hero').includes('close-up aerial of Building C'), 'the focus survives the trip to the server');
assert.equal(cb.buildings, undefined); assert.equal(cb.parking, 50000); assert.equal(cb.facts.length, 6); assert.equal(cb.facts[0].length, 200); assert.equal(cb.basemap, 'map');
// the environment's model pick wins and no model list is read
process.env.OPENAI_IMAGE_MODEL = 'gpt-image-7'; calls.length = 0;
res = mockRes(); await render(req({ body: { image: PNG, brief: {}, view: 'rear' }, ip: '9.9.9.6' }), res);
assert.equal(res.body.model, 'gpt-image-7'); assert.equal(calls[0].model, 'gpt-image-7');
// ---------- the monthly budget (RENDER_MONTHLY_CAP_USD, $100 by default) ----------
const { dayOf } = await import('../lib/aiusage.mjs'), month = dayOf().slice(0, 7);
assert.ok(reads.length === 4 && reads.every(u => u.includes('feature=eq.render') && u.includes('day=gte.' + month + '-01')), 'each render reads this month’s Renderings rows first: ' + reads[0]);
// under the cap: paints, and says what's spent including this picture (gpt-image-7 has no price: the $0.25 estimate)
usage = [{ model: 'gpt-image-2.5-sunburst', requests: 30, input_tokens: 36000, cached_tokens: 0, output_tokens: 180000 }]; // 30 × $0.192 + $0.288 = $6.048
calls.length = 0; res = mockRes(); await render(req({ body: { image: PNG, brief: {}, view: 'front' }, ip: '9.9.8.1' }), res);
assert.equal(res.code, 200); assert.equal(calls.length, 1, 'under the cap: painted');
assert.deepEqual(res.body.budget, { spent: 6.298, cap: 100, month }, 'spent includes this picture’s estimate');
// GET: the budget, for the panel before rendering
res = mockRes(); await render(req({ method: 'GET', ip: '9.9.8.2' }), res);
assert.equal(res.code, 200); assert.deepEqual(res.body.budget, { spent: 6.048, cap: 100, month, images: 30, priced: true });
// at the cap: 402 with the reason, and OpenAI is never asked
usage = [{ model: 'gpt-image-2.5-sunburst', requests: 500, input_tokens: 600000, cached_tokens: 0, output_tokens: 3_000_000 }]; // $4.80 + $96 = $100.80
calls.length = 0; res = mockRes(); await render(req({ body: { image: PNG, brief: {}, view: 'front' }, ip: '9.9.8.3' }), res);
assert.equal(res.code, 402); assert.equal(calls.length, 0, 'no OpenAI call once the budget is spent');
assert.equal(res.body.error, 'This month’s rendering budget ($100) is used up. It resets on the 1st.'); assert.equal(res.body.cap, 100); assert.equal(res.body.month, month); assert.ok(res.body.spent >= 100);
// the cap from the environment
process.env.RENDER_MONTHLY_CAP_USD = '250'; calls.length = 0; res = mockRes(); await render(req({ body: { image: PNG, brief: {}, view: 'front' }, ip: '9.9.8.4' }), res);
assert.equal(res.code, 200); assert.equal(res.body.budget.cap, 250); assert.equal(calls.length, 1);
process.env.RENDER_MONTHLY_CAP_USD = '12.5'; res = mockRes(); await render(req({ body: { image: PNG, brief: {}, view: 'front' }, ip: '9.9.8.5' }), res);
assert.equal(res.code, 402); assert.match(res.body.error, /\(\$12\.50\)/); delete process.env.RENDER_MONTHLY_CAP_USD;
// a model with no known price: $0.25 a picture (RENDER_FALLBACK_USD_PER_IMAGE overrides), and said to be an estimate
usage = [{ model: 'gpt-image-9', requests: 40, input_tokens: 48000, cached_tokens: 0, output_tokens: 240000 }, { model: 'gpt-image-2.5-sunburst', requests: 1, input_tokens: 1200, cached_tokens: 0, output_tokens: 6000 }];
res = mockRes(); await render(req({ method: 'GET', ip: '9.9.8.6' }), res);
assert.deepEqual(res.body.budget, { spent: 10.2016, cap: 100, month, images: 41, priced: false }, '40 × $0.25 + $0.2016');
process.env.RENDER_FALLBACK_USD_PER_IMAGE = '2.5'; res = mockRes(); await render(req({ body: { image: PNG, brief: {}, view: 'front' }, ip: '9.9.8.7' }), res);
assert.equal(res.code, 402, '40 × $2.50 = $100: the cap'); delete process.env.RENDER_FALLBACK_USD_PER_IMAGE;
// Supabase failing: the budget can't be read, so the picture is painted anyway (fail open), with no spent figure
supaFail = true; calls.length = 0; res = mockRes(); await render(req({ body: { image: PNG, brief: {}, view: 'front' }, ip: '9.9.8.8' }), res);
assert.equal(res.code, 200, JSON.stringify(res.body)); assert.equal(calls.length, 1, 'painted though the budget couldn’t be read'); assert.equal(res.body.budget.spent, null);
res = mockRes(); await render(req({ method: 'GET', ip: '9.9.8.9' }), res); assert.equal(res.code, 200); assert.equal(res.body.budget.spent, null); assert.equal(res.body.budget.cap, 100);
// a $0 budget turns renderings off, even when the usage can't be read (no fail open), and says so plainly
process.env.RENDER_MONTHLY_CAP_USD = '0'; calls.length = 0; res = mockRes(); await render(req({ body: { image: PNG, brief: {}, view: 'front' }, ip: '9.9.8.10' }), res);
assert.equal(res.code, 402); assert.equal(calls.length, 0, 'no OpenAI call with renderings off'); assert.equal(res.body.error, 'Renderings are turned off on this site.'); delete process.env.RENDER_MONTHLY_CAP_USD;
supaFail = false; usage = [];

// the model's refusal reaches the user in words; a network failure is a plain retry message
globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Your request was rejected by the safety system.' } }), { status: 400 });
res = mockRes(); await render(req({ body: { image: PNG, brief: {}, view: 'front' }, ip: '9.9.9.7' }), res);
assert.equal(res.code, 502); assert.ok(/refused: Your request was rejected/.test(res.body.error), res.body.error);
console.log('render tests passed: camera presets, brief, prompt, model pick and the endpoint');

// Cancel: when the browser drops the request before the picture is done, the OpenAI call is aborted and nothing is billed
{
  let seenSignal = null, closeFn = null;
  globalThis.fetch = async (url, opts = {}) => {
    url = String(url); const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.endsWith('/models')) return json({ data: [{ id: 'gpt-image-2.5-sunburst' }] });
    if (url.includes('supabase')) return json([]);
    if (url.endsWith('/images/edits')) { seenSignal = opts.signal; return new Promise((ok, no) => { opts.signal.addEventListener('abort', () => no(Object.assign(new Error('aborted'), { name: 'AbortError' }))); setTimeout(() => ok(json({ data: [{ b64_json: 'QUJD' }], usage: { input_tokens: 1, output_tokens: 1 } })), 400); }); }
    throw new Error('unexpected fetch ' + url);
  };
  const r = mockRes(); r.writableEnded = false; r.on = (ev, fn) => { if (ev === 'close') closeFn = fn; };
  const done = render(req({ body: { image: PNG, brief: {}, view: 'front' }, ip: '9.9.9.21' }), r);
  await new Promise(ok => setTimeout(ok, 50)); assert.ok(closeFn, 'listens for the connection closing'); closeFn();
  await done;
  assert.ok(seenSignal?.aborted, 'the OpenAI request is aborted when the browser cancels');
  assert.equal(r.code, 499, 'answers cancelled, not 502');
}
console.log('render cancel test passed');

// ---- the hidden map's style: the basemap's own layers only (a filings dot or heat blob would be painted as part of the site)
{
  const page = { version: 8, terrain: { source: 'live-dem', exaggeration: 1.8 },
    sources: { omt: { type: 'vector' }, filings: { type: 'geojson' }, sel: { type: 'geojson' }, 'live-dem': { type: 'raster-dem' }, hires: { type: 'raster' }, 'fs-sp': { type: 'geojson' }, unused: { type: 'vector' } },
    layers: [{ id: 'background', type: 'background' }, { id: 'road', type: 'line', source: 'omt' }, { id: 'building-3d', type: 'fill-extrusion', source: 'omt' },
      { id: 'live-hires', type: 'raster', source: 'hires' }, { id: 'filings', type: 'circle', source: 'filings' }, { id: 'heat', type: 'heatmap', source: 'filings' },
      { id: 'sel-line', type: 'line', source: 'sel' }, { id: 'focus-dot', type: 'circle', source: 'sel' }, { id: 'fs-bldg', type: 'fill-extrusion', source: 'omt' }, { id: 'fs-sp-b', type: 'fill-extrusion', source: 'fs-sp' }] };
  const base = new Set(['background', 'road', 'building-3d']), st = R.baseStyle(page, base);
  assert.deepEqual(st.layers.map(l => l.id), ['background', 'road', 'building-3d', 'live-hires'], 'the basemap and the imagery laid on it; no filings, heat, selection, pins, app buildings or plan');
  assert.deepEqual(Object.keys(st.sources).sort(), ['hires', 'live-dem', 'omt'], 'only the sources those use, and the terrain’s');
  assert.equal(page.layers.length, 10, 'the page map’s style is left as it was');
  assert.deepEqual(R.baseStyle(page, null).layers.map(l => l.id).filter(id => /^fs-/.test(id)), [], 'no base ids known: still no fs- layers');
  assert.ok(R.CAPTURE.w / R.CAPTURE.h === 16 / 9 && R.CAPTURE.ratio >= 2, 'a 16:9 picture drawn at twice the size');
}
console.log('render base style test passed');
