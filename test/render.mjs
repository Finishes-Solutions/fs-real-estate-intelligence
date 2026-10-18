// Offline tests for renderings: lib/render.mjs (the camera presets, the brief, the prompt, the model pick) and
// api/render.js with a mocked OpenAI Images API. Run: node test/render.mjs
import assert from 'node:assert/strict';
process.env.OPENAI_API_KEY = 'sk-test';
const R = await import('../lib/render.mjs');

// a 300 × 200 ft lot, street along the south side (front edge 0: (0,0)→(300,0)), three buildings
const plan = { origin: [-95.78, 29.78], ring: [[0, 0], [300, 0], [300, 200], [0, 200]], front: 0, params: { trees: true },
  elements: [{ id: 'b1', kind: 'building', use: 'retail', x: 150, y: 150, w: 200, d: 60, rot: 0, floors: 1 }, { id: 'b2', kind: 'building', use: 'restaurant', x: 50, y: 60, w: 60, d: 40, rot: 0, floors: 1, form: 'L' },
    { id: 'b3', kind: 'building', use: 'multifamily', x: 250, y: 60, w: 60, d: 50, rot: 0, floors: 3, units: 24 }, { id: 'p', kind: 'parking', x: 150, y: 80, w: 200, d: 60, rot: 0 }, { id: 'd', kind: 'pond', x: 280, y: 180, w: 30, d: 30, rot: 0 }] };

// the street is to the south: looking from it into the site is looking north (bearing 0)
assert.equal(Math.round(R.streetBearing(plan)), 0, 'front view looks north from the street');
assert.equal(Math.round(R.streetBearing({ ...plan, front: 2 })), 180, 'a site fronting the north edge is looked at from the north');
const cam = R.cameraFor('front', plan);
assert.equal(cam.bearing, 0); assert.equal(cam.pitch, 56);
assert.ok(cam.zoom > 16 && cam.zoom <= 19, 'a 300 ft lot is framed at the map’s closest zoom: ' + cam.zoom);
assert.ok(cam.center[1] > 100, 'the pitched camera aims past the middle so the whole site sits in the frame: ' + cam.center);
const corner = R.cameraFor('corner', plan); assert.equal(corner.bearing, 322, 'the corner view turns toward the left corner');
const rear = R.cameraFor('rear', plan); assert.equal(rear.bearing, 205, 'the rear view looks back toward the street');
const big = R.cameraFor('front', { ...plan, ring: [[0, 0], [3000, 0], [3000, 2000], [0, 2000]] }); big.ring = [[0, 0], [3000, 0], [3000, 2000], [0, 2000]]; assert.ok(big.zoom < cam.zoom - 2, 'a 140-acre site zooms out: ' + big.zoom);
assert.equal(R.cameraFor('nonsense', plan).view, 'front', 'an unknown view is the front one');
// the camera sizes the frame to the canvas: a narrower canvas needs to zoom out
assert.ok(R.cameraFor('front', { ...plan, ring: big.ring }, { px: 600 }).zoom < big.zoom, 'narrower canvas, lower zoom');

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
assert.ok(pr2.includes('garden-style apartments') && pr2.includes('retail strip'), 'no look picked: materials by use'); assert.ok(pr2.includes('replace the flat map graphics'), 'map base: invent the surroundings'); assert.ok(pr2.includes('from a car arriving'), 'the low view is from the entry drive');
assert.ok(R.renderPrompt({}, 'front').length > 200, 'an empty brief still makes a usable prompt');

// the model: the newest GPT Image this key lists, never a mini; the environment's pick wins; gpt-image-1 when nothing is known
assert.equal(R.pickImageModel([{ id: 'gpt-image-1' }, { id: 'gpt-image-2' }, { id: 'gpt-image-1-mini' }, { id: 'gpt-image-1.5' }, { id: 'gpt-5' }]), 'gpt-image-2');
assert.equal(R.pickImageModel(['gpt-image-1', 'gpt-image-1.5']), 'gpt-image-1.5');
assert.equal(R.pickImageModel(['gpt-image-1-mini', 'gpt-4o']), 'gpt-image-1');
assert.equal(R.pickImageModel([], 'gpt-image-9'), 'gpt-image-9');

// ---------- the endpoint, with OpenAI mocked ----------
const calls = [], PNG = 'data:image/png;base64,' + Buffer.from('fake-png-bytes').toString('base64');
let refuseSize = 1, refuseFidelity = 1, fail500 = 0;
globalThis.fetch = async (url, opts = {}) => {
  url = String(url); const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.endsWith('/models')) return json({ data: [{ id: 'gpt-image-1' }, { id: 'gpt-image-2' }, { id: 'gpt-5' }] });
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
assert.equal(res.body.model, 'gpt-image-2', 'the newest image model the key lists'); assert.equal(res.headers['X-AI-Model'], 'gpt-image-2');
assert.equal(res.body.size, '1536x1024', 'a model that refuses 1080p gets the next size'); assert.equal(res.body.view, 'corner');
assert.equal(calls.length, 3, 'fidelity refused, size refused, then painted: ' + calls.map(c => c.size + '/' + c.fidelity).join(' '));
assert.deepEqual(calls.map(c => c.fidelity), ['high', null, null]); assert.deepEqual(calls.map(c => c.size), ['1920x1080', '1920x1080', '1536x1024']);
assert.equal(calls[2].quality, 'high'); assert.equal(calls[2].n, '1'); assert.equal(calls[2].fmt, 'jpeg'); assert.equal(calls[2].model, 'gpt-image-2');
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
res = mockRes(); await render(req({ method: 'GET' }), res); assert.equal(res.code, 405);
assert.equal(dataImage('data:image/jpeg;base64,' + 'A'.repeat(4_000_000)), null, 'too big');
// the brief is cleaned, not trusted
const cb = cleanBrief({ address: 'x'.repeat(500), acres: -4, uses: [{ use: 'retail', count: 1e9, floors: [0, 999, 'a'], forms: ['bar', 'blob'], units: '12' }], buildings: 'many', parking: 1e9, facts: Array(40).fill('f'.repeat(900)), look: 'brick', basemap: 'hacked' });
assert.equal(cb.address.length, 120); assert.equal(cb.acres, undefined); assert.equal(cb.uses[0].count, 500); assert.deepEqual(cb.uses[0].floors, [1, 60, 1]); assert.deepEqual(cb.uses[0].forms, ['bar']); assert.equal(cb.uses[0].units, 12);
assert.equal(cb.buildings, undefined); assert.equal(cb.parking, 50000); assert.equal(cb.facts.length, 6); assert.equal(cb.facts[0].length, 200); assert.equal(cb.basemap, 'map');
// the environment's model pick wins and no model list is read
process.env.OPENAI_IMAGE_MODEL = 'gpt-image-7'; calls.length = 0;
res = mockRes(); await render(req({ body: { image: PNG, brief: {}, view: 'rear' }, ip: '9.9.9.6' }), res);
assert.equal(res.body.model, 'gpt-image-7'); assert.equal(calls[0].model, 'gpt-image-7');
// the model's refusal reaches the user in words; a network failure is a plain retry message
globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Your request was rejected by the safety system.' } }), { status: 400 });
res = mockRes(); await render(req({ body: { image: PNG, brief: {}, view: 'front' }, ip: '9.9.9.7' }), res);
assert.equal(res.code, 502); assert.ok(/refused: Your request was rejected/.test(res.body.error), res.body.error);
console.log('render tests passed: camera presets, brief, prompt, model pick and the endpoint');
