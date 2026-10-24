// Offline tests for a project's reference files: lib/sitefiles.mjs (paths, the AI's strict schema and what's kept of its
// answer, a DXF read as words, confirmed facts for the AI, a floor plan as a team type, an easement as a strip inside a
// real parcel outline) and /api/sitefiles against an in-memory Supabase storage and a mocked OpenAI (upload on a signed
// link, list, open, read a PDF / a picture / a DXF, delete, not set up), then the confirmed facts reaching the site-plan
// AI calls (/api/siteplan: the program, the plan, the review, a change and a question).
import assert from 'node:assert/strict';
const RF = await import('../lib/sitefiles.mjs'), S = await import('../lib/siteplan.mjs'), T = await import('../lib/sitetools.mjs'), CU = await import('../lib/customtypes.mjs');

// ---- paths: one project's files only, safe names ----
assert.equal(RF.safeName('Boundary Survey (Lot 7) – rev 2.PDF'), 'Boundary-Survey-Lot-7-rev-2.pdf');
assert.equal(RF.pathFor('p-abc1', 'k3x9a7b2c', 'Survey 2024.pdf'), 'projects/p-abc1/k3x9a7b2c__Survey-2024.pdf');
assert.equal(RF.pathFor('p-abc1', 'k3x9a7b2c', 'evil.exe'), null, 'only the file types the AI reads');
assert.equal(RF.pathFor('../x', 'k3x9a7b2c', 'a.pdf'), null);
assert.deepEqual(RF.parsePath('projects/p-abc1/k3x9a7b2c__Survey-2024.pdf', 'p-abc1'), { pid: 'p-abc1', id: 'k3x9a7b2c', name: 'Survey-2024.pdf' });
assert.equal(RF.parsePath('projects/p-other/k3x9a7b2c__Survey-2024.pdf', 'p-abc1'), null, 'another project\'s file is refused');
assert.equal(RF.parsePath('projects/p-abc1/../../etc__passwd.pdf', 'p-abc1'), null);
assert.equal(RF.parsePath('field/x.jpg'), null);

// ---- the AI's answer: a strict schema (every object: every property required, nothing else allowed) ----
const strict = (sc, w) => {
  if (sc?.type === 'object' || (Array.isArray(sc?.type) && sc.type.includes('object'))) { assert.equal(sc.additionalProperties, false, 'no extra properties: ' + w); assert.deepEqual(sc.required.slice().sort(), Object.keys(sc.properties).sort(), 'all required: ' + w); for (const [k, v] of Object.entries(sc.properties)) strict(v, w + '.' + k); }
  if (sc?.items) strict(sc.items, w + '[]');
};
strict(RF.READ_SCHEMA, 'read'); assert.ok(RF.READ_SCHEMA.properties.facts.items.properties.confidence.enum.join() === 'sure,unsure');
assert.ok(/Never invent/.test(RF.READ_SYSTEM) && /readable false/.test(RF.READ_SYSTEM), 'the model is told never to invent and to say when it can\'t read');
// what's kept of it: unknown categories dropped, numbers in range, a side it knows, ids, every fact new
const raw = { kind: 'survey', title: 'Boundary Survey, 4.721 Acres', readable: true, unreadable: 'The flood note in the lower right is blurred.', summary: 'A boundary survey of a 4.721-acre tract on FM 362.', facts: [
  { category: 'site_area', label: 'Tract area', text: '4.721 acres (205,646 sq. ft.)', value: 205646, unit: 'sf', widthFt: null, depthFt: null, side: 'whole', beds: null, baths: null, stories: null, bearing: null, confidence: 'sure', source: 'page 1, title block' },
  { category: 'easement', label: '16 ft drainage easement', text: '16\' drainage easement, Vol. 2140 Pg. 77', value: 16, unit: 'ft', widthFt: 16, depthFt: null, side: 'north', beds: null, baths: null, stories: null, bearing: null, confidence: 'sure', source: 'north line label' },
  { category: 'boundary', label: 'North line', text: 'N 89°59\'12" E 600.00\'', value: 600, unit: 'ft', widthFt: null, depthFt: null, side: 'north', beds: null, baths: null, stories: null, bearing: 'N 89°59\'12" E 600.00\'', confidence: 'unsure', source: 'north line' },
  { category: 'spaceship', label: 'x', text: 'y', value: 1, unit: 'ft', widthFt: null, depthFt: null, side: null, beds: null, baths: null, stories: null, bearing: null, confidence: 'sure', source: '' },
  { category: 'setback', label: 'Front building line', text: '25\' B.L.', value: 1e12, unit: 'parsecs', widthFt: -4, depthFt: null, side: 'up', beds: null, baths: null, stories: null, bearing: null, confidence: 'maybe', source: 'south line' }] };
const out = RF.readOut(raw);
assert.equal(out.read.kind, 'survey'); assert.equal(out.read.readable, true); assert.match(out.read.unreadable, /blurred/, 'what couldn\'t be read is kept to show');
assert.deepEqual(out.facts.map(f => f.id), ['f1', 'f2', 'f3', 'f4'], 'the unknown category dropped'); assert.ok(out.facts.every(f => f.status === 'new'), 'nothing is confirmed until a person confirms it');
const sb = out.facts[3]; assert.equal(sb.value, null); assert.equal(sb.unit, null); assert.equal(sb.widthFt, null); assert.equal(sb.side, null); assert.equal(sb.confidence, 'unsure', 'anything but sure reads as unsure');
const none = RF.readOut({ kind: 'other', title: null, readable: false, unreadable: 'The scan is blank.', summary: 'A blank page.', facts: [raw.facts[0]] });
assert.equal(none.read.readable, false); assert.deepEqual(none.facts, [], 'an unreadable file gives no facts, even if the model listed some');

// ---- a DXF as words: units, extents, layers, the labels and dimensions ----
const dxf = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '2', '9', '$EXTMIN', '10', '0.0', '20', '0.0', '30', '0.0', '9', '$EXTMAX', '10', '600.0', '20', '340.0', '30', '0.0', '0', 'ENDSEC',
  '0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '8', 'BOUNDARY', '10', '0', '20', '0', '11', '600', '21', '0', '0', 'TEXT', '8', 'EASEMENT', '10', '10', '20', '330', '1', '16\' DRAINAGE ESMT.', '0', 'MTEXT', '8', 'NOTES', '1', 'FLOOD ZONE X\\PPER FIRM 48473C0150E', '0',
  'DIMENSION', '8', 'DIMS', '42', '600.0', '1', '', '0', 'ENDSEC', '0', 'EOF'].join('\r\n');
const dg = RF.dxfDigest(dxf);
assert.match(dg, /units: feet/); assert.match(dg, /Extents: 0\.0, 0\.0 to 600\.0, 340\.0/); assert.match(dg, /Layers: BOUNDARY, EASEMENT, NOTES, DIMS/);
assert.match(dg, /\[EASEMENT\] 16' DRAINAGE ESMT\./); assert.match(dg, /\[NOTES\] FLOOD ZONE X PER FIRM 48473C0150E/, 'MTEXT paragraph breaks become spaces'); assert.match(dg, /\(dimension 600\.00\)/);
assert.ok(RF.dxfDigest(dxf, 200).length < 260, 'cut to the limit');

// ---- confirmed facts for the AI; the block every site-plan call gets ----
const files = [{ name: 'Boundary Survey.pdf', read: { kind: 'survey' }, facts: out.facts.map((f, i) => ({ ...f, status: i === 1 ? 'ok' : i === 0 ? 'ok' : i === 2 ? 'no' : 'new' })) },
  { name: 'Plans.pdf', read: { kind: 'floor_plan' }, facts: [{ id: 'f1', category: 'floor_plan', label: 'Plan 2140 "The Aspen"', text: 'The Aspen, 2,140 sf living', value: 2140, unit: 'sf', widthFt: 40, depthFt: 58.5, side: null, beds: 4, baths: 3, stories: 2, bearing: null, confidence: 'sure', source: 'sheet A1', status: 'ok', edited: true }] }];
const refs = RF.refsForAI(files);
assert.equal(refs.length, 3, 'only confirmed facts'); assert.ok(refs.every(r => !/N 89°59/.test(r)), 'a dismissed fact never goes'); assert.ok(!refs.some(r => /Front building line/.test(r)), 'an unchecked fact never goes');
assert.equal(refs[1], '[Boundary Survey.pdf, survey] Easement · 16 ft drainage easement: 16\' drainage easement, Vol. 2140 Pg. 77 (16 ft wide, north side)');
assert.match(refs[2], /^\[Plans\.pdf, floor plan\] Floor plan · Plan 2140 "The Aspen": .*\(40 × 58\.5 ft, 2,140 sf, 4 bed, 3 bath, 2 stories\) \(corrected by the team\)$/);
assert.deepEqual(RF.refsForAI([]), []); assert.equal(RF.refBlock([]), ''); assert.equal(RF.refBlock('nope'), '');
assert.ok(RF.refsForAI([{ name: 'x', facts: Array.from({ length: 90 }, (_, i) => ({ ...files[0].facts[1], id: 'f' + i })) }]).length <= 40, 'at most 40 lines');
const blk = RF.refBlock(refs); assert.match(blk, /^\n\nReference facts the team confirmed/); assert.ok(blk.includes('- [Boundary Survey.pdf, survey] Easement'));
assert.deepEqual(RF.refsIn([1, '', 'ok', { a: 1 }, 'x'.repeat(900)]).map(s => s.length), [2, 400], 'the server keeps short strings only');

// ---- a floor plan as a building type for the team library ----
const ft = RF.floorPlanType(files[1].facts[0], 'Plans.pdf'), tt = CU.teamTypeIn({ ...ft, id: 'bt-aspen1' });
assert.ok(tt, 'a type the team library takes'); assert.equal(tt.w, 40); assert.equal(tt.d, 59); assert.equal(tt.floors, 2); assert.equal(tt.use, 'sfr'); assert.match(tt.note, /2,140 sf · 4 bd · 3 ba · from Plans\.pdf/);
assert.equal(RF.floorPlanType({ ...files[1].facts[0], widthFt: null }), null, 'no width: no type (never a guessed size)');
assert.equal(RF.floorPlanType(files[0].facts[1]), null, 'only floor plans');

// ---- an easement along a side of a real parcel outline, as a strip inside it ----
// a 4.7-acre lot shaped like the appraisal district draws it: a curved corner digitised as many points, a stray
// collinear point and a slightly skewed east line, tidied by boundaryFrom as a parcel is
{ const O = [-95.98, 30.06], k = 364567 * Math.cos(O[1] * Math.PI / 180), ll = ([x, y]) => [O[0] + x / k, O[1] + y / 364567];
  const arc = Array.from({ length: 9 }, (_, i) => { const a = (0 + 90 * i / 8) * Math.PI / 180; return [560 + 40 * Math.cos(a), 300 + 40 * Math.sin(a)]; });
  const pts = [[0, 0], [300, 0.6], [604, 1], ...arc, [0, 340]], b = S.boundaryFrom({ type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(ll)] });
  const R = b.ring, n = R.length, southOf = i => { const a = R[i], c = R[(i + 1) % n], L = Math.hypot(c[0] - a[0], c[1] - a[1]); return L > 100 ? (c[0] - a[0]) / L : 0; }; // (counter-clockwise: an edge running east faces south)
  const front = R.map((_, i) => i).sort((i, j) => southOf(j) - southOf(i))[0], plan = { ...b, front, program: S.guessProgram('25,000 sf retail strip'), elements: [] }, Y = R.map(p => p[1]), X = R.map(p => p[0]);
  assert.ok(S.signedArea(R) > 0 && southOf(front) > 0.99, 'the street side is the south line');
  const north = RF.easementStrip(plan.ring, 'north', 16, plan.front);
  assert.ok(north, 'a strip along the north line'); assert.equal(T.areaError(plan, north, 'keepout'), '', 'inside the lot, along its line');
  const ys = north.map(p => p[1]), maxY = Math.max(...plan.ring.map(p => p[1])); assert.ok(Math.abs(Math.max(...ys) - maxY) < 1.5 && Math.abs(Math.max(...ys) - Math.min(...ys) - 16) < 1.5, 'on the north line, 16 ft deep: ' + ys.join(','));
  assert.ok(Math.abs(S.ringArea(north) - 16 * Math.hypot(north[1][0] - north[0][0], north[1][1] - north[0][1])) < 5, 'its area is its width times the line');
  const piece = T.areaPiece(plan, 'keepout', north, 'ko1'); assert.equal(piece.kind, 'keepout'); assert.ok(S.ringArea(piece.poly) > 16 * 400);
  const fr = RF.easementStrip(plan.ring, 'front', 10, plan.front), rear = RF.easementStrip(plan.ring, 'rear', 10, plan.front);
  assert.ok(fr && rear); assert.ok(Math.max(...fr.map(p => p[1])) < Math.min(...Y) + 12, 'the front is the street side (south here)'); assert.ok(Math.min(...rear.map(p => p[1])) > Math.max(...Y) - 12, 'the rear is across from it');
  const west = RF.easementStrip(plan.ring, 'west', 20, plan.front), left = RF.easementStrip(plan.ring, 'left', 20, plan.front);
  assert.ok(Math.max(...west.map(p => p[0])) < Math.min(...X) + 22); assert.deepEqual(left, RF.easementStrip(plan.ring, 'east', 20, plan.front), 'facing the street (south) from the site, its left is east');
  assert.equal(T.areaError(plan, RF.easementStrip(plan.ring, 'east', 20, plan.front), 'keepout'), '', 'the skewed east line too');
  assert.equal(RF.easementStrip(plan.ring, 'interior', 16, 0), null); assert.equal(RF.easementStrip(plan.ring, 'north', 400, 0), null, 'wider than half the lot: not a strip');
  assert.equal(RF.easementStrip(plan.ring, 'front', 10, null), null, 'front needs the street side');
  assert.ok(RF.placeable(files[0].facts[1])); assert.ok(!RF.placeable({ ...files[0].facts[1], side: 'interior' })); }

// ---- the storage list and the project's own record ----
{ const own = [{ id: 'a1b2c3d4', path: 'projects/p-abc1/a1b2c3d4__Survey.pdf', name: 'Survey.pdf', facts: [{ id: 'f1', status: 'ok' }] }, { id: 'zzzzzz99', path: 'projects/p-abc1/zzzzzz99__Old.png', name: 'Old.png', facts: [] }];
  const got = RF.reconcile(own, [{ path: 'projects/p-abc1/a1b2c3d4__Survey.pdf', size: 1000 }, { path: 'projects/p-abc1/q9w8e7r6__Plans.pdf', size: 2000, at: '2026-10-20T10:00:00Z' }]);
  assert.equal(got.length, 3); assert.equal(got[0].missing, false); assert.equal(got[1].missing, true, 'gone from storage: marked, its facts kept'); assert.equal(got[2].name, 'Plans.pdf'); assert.equal(got[2].read, null, 'a file only storage knew joins, unread');
  assert.equal(got[0].facts[0].status, 'ok');
  assert.ok(RF.reconcile(own, []).every(f => !f.missing), 'an empty listing marks nothing missing (more likely a listing that failed)'); }
console.log('sitefiles lib ok: paths, strict read schema, kept answer, DXF words, confirmed facts for the AI, floor plan types, easement strips on a real parcel, reconcile');

// ---- /api/sitefiles: an in-memory Supabase storage and a mocked OpenAI ----
const objects = new Map(), media = new Set(), seen = [], ai = [];
let bucket = true, aiReply = null;
const json = (o, s = 200) => new Response(o == null ? null : JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)), m = opts.method || 'GET';
  if (u.host === 'api.openai.com') { if (u.pathname.includes('/models')) return json({ id: 'gpt-test', data: [{ id: 'gpt-test' }] }); const b = JSON.parse(opts.body); ai.push(b); return json({ choices: [{ message: { content: JSON.stringify(aiReply(b)) }, finish_reason: 'stop' }] }); }
  seen.push(m + ' ' + u.pathname); assert.equal(opts.headers.apikey, 'sb_secret_test');
  if (!bucket) return json({ statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' }, 400);
  const P = '/storage/v1/object';
  if (u.pathname === P + '/list/site-files' && m === 'POST') { const { prefix } = JSON.parse(opts.body); return json([...objects.entries()].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => ({ name: k.slice(prefix.length), id: 'uuid-' + k.length, created_at: '2026-10-21T10:00:00Z', metadata: { size: v.length, mimetype: 'application/pdf' } }))); }
  if (u.pathname.startsWith(P + '/upload/sign/site-files/') && m === 'POST') { const path = decodeURIComponent(u.pathname.slice((P + '/upload/sign/site-files/').length)); return json({ url: '/object/upload/sign/site-files/' + path + '?token=tok-' + path.length }); }
  if (u.pathname.startsWith(P + '/sign/site-files/') && m === 'POST') { const path = decodeURIComponent(u.pathname.slice((P + '/sign/site-files/').length)); assert.equal(JSON.parse(opts.body).expiresIn, 600); return json({ signedURL: '/object/sign/site-files/' + path + '?token=dl' }); }
  if (u.pathname === P + '/site-files' && m === 'DELETE') { for (const p of JSON.parse(opts.body).prefixes) objects.delete(p); return json([]); }
  if (u.pathname.startsWith(P + '/site-files/') && m === 'GET') { const path = decodeURIComponent(u.pathname.slice((P + '/site-files/').length)); return objects.has(path) ? new Response(objects.get(path), { headers: { 'content-length': String(objects.get(path).length) } }) : json({ message: 'not found' }, 404); }
  const MP = path => decodeURIComponent(u.pathname.slice(path.length));
  if (u.pathname.startsWith(P + '/upload/sign/project-media/') && m === 'POST') return json({ url: '/object/upload/sign/project-media/' + MP(P + '/upload/sign/project-media/') + '?token=m' });
  if (u.pathname.startsWith(P + '/sign/project-media/') && m === 'POST') { const path = MP(P + '/sign/project-media/'); return media.has(path) ? json({ signedURL: '/object/sign/project-media/' + path + '?token=g' }) : json({ statusCode: '404', error: 'not_found', message: 'Object not found' }, 400); }
  if (u.pathname === P + '/project-media' && m === 'DELETE') { for (const p of JSON.parse(opts.body).prefixes) media.delete(p); return json([]); }
  return json({ message: 'unexpected ' + m + ' ' + u.pathname }, 500);
};
const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, send(b) { r.body = b; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
const { default: handler, contentFor } = await import('../api/sitefiles.js');
let ip = 0; const call = async (method, { body, query = {} } = {}) => { const res = mock(); await handler({ method, body, query, headers: { 'x-forwarded-for': '9.8.7.' + (ip++ % 200) } }, res); return res; };

delete process.env.SUPABASE_SECRET_KEY; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
let res = await call('GET', { query: { pid: 'p-abc1' } }); assert.equal(res.code, 503); assert.equal(res.body.setup, 'key', 'no secret key: says so, nothing breaks');
process.env.SUPABASE_URL = 'http://supa.test'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_test'; process.env.OPENAI_API_KEY = 'sk-test'; process.env.OPENAI_MODEL = 'gpt-test';
bucket = false; res = await call('GET', { query: { pid: 'p-abc1' } }); assert.equal(res.code, 503); assert.equal(res.body.setup, 'bucket', 'no bucket yet: says so'); bucket = true;
res = await call('GET', { query: { pid: '../etc' } }); assert.equal(res.code, 400);

// upload: a signed one-time link (the file goes straight to storage), only known types, up to 20 MB
res = await call('POST', { body: { pid: 'p-abc1', upload: { name: 'Boundary Survey (Lot 7).pdf', size: 2_400_000 } } });
assert.equal(res.code, 200, JSON.stringify(res.body)); const up = res.body;
assert.match(up.path, /^projects\/p-abc1\/[a-z0-9]{6,24}__Boundary-Survey-Lot-7\.pdf$/); assert.equal(up.url, 'http://supa.test/storage/v1/object/upload/sign/site-files/' + up.path + '?token=tok-' + up.path.length); assert.equal(up.type, 'application/pdf');
res = await call('POST', { body: { pid: 'p-abc1', upload: { name: 'setup.exe', size: 10 } } }); assert.equal(res.code, 400);
res = await call('POST', { body: { pid: 'p-abc1', upload: { name: 'huge.pdf', size: 21 * 2 ** 20 } } }); assert.equal(res.code, 413);
// (the browser PUTs the file to the link; here it lands in the store)
const PDF = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer\n%%EOF'); objects.set(up.path, PDF);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]), pngPath = 'projects/p-abc1/b7c8d9e0f1__Old-site-plan.png'; objects.set(pngPath, PNG);
const dxfPath = 'projects/p-abc1/c1d2e3f4a5__Survey.dxf'; objects.set(dxfPath, Buffer.from(dxf));
objects.set('projects/p-other/d1d2d3d4d5__Theirs.pdf', PDF);

// list: this project's files only
res = await call('GET', { query: { pid: 'p-abc1' } }); assert.equal(res.code, 200);
assert.deepEqual(res.body.files.map(f => f.name).sort(), ['Boundary-Survey-Lot-7.pdf', 'Old-site-plan.png', 'Survey.dxf']); assert.ok(res.body.files.every(f => f.path.startsWith('projects/p-abc1/') && f.size > 0));
// open: a ten-minute link
res = await call('GET', { query: { pid: 'p-abc1', open: up.path } }); assert.equal(res.body.url, 'http://supa.test/storage/v1/object/sign/site-files/' + up.path + '?token=dl');
res = await call('GET', { query: { pid: 'p-abc1', open: 'projects/p-other/d1d2d3d4d5__Theirs.pdf' } }); assert.equal(res.code, 400, 'another project\'s file can\'t be opened from this one');

// read a PDF: the document itself goes to the model with the strict schema; what comes back is cleaned
aiReply = () => raw;
res = await call('POST', { body: { pid: 'p-abc1', read: { path: up.path } } });
assert.equal(res.code, 200, JSON.stringify(res.body)); assert.equal(res.body.read.kind, 'survey'); assert.equal(res.body.facts.length, 4); assert.ok(res.body.facts.every(f => f.status === 'new'));
let sent = ai.at(-1); assert.equal(sent.response_format.json_schema.strict, true); assert.equal(sent.response_format.json_schema.name, 'reference_facts'); assert.deepEqual(sent.response_format.json_schema.schema, RF.READ_SCHEMA);
let parts = sent.messages[1].content; assert.ok(Array.isArray(parts)); const doc = parts.find(p => p.type === 'file');
assert.ok(doc && doc.file.file_data === 'data:application/pdf;base64,' + PDF.toString('base64') && doc.file.filename === 'Boundary-Survey-Lot-7.pdf', 'the PDF goes as a file part');
assert.match(parts[0].text, /Reference file: Boundary-Survey-Lot-7\.pdf \(pdf\)/); assert.equal(sent.messages[0].content, RF.READ_SYSTEM);
// a picture as an image; a DXF as its words
res = await call('POST', { body: { pid: 'p-abc1', read: { path: pngPath } } }); assert.equal(res.code, 200);
parts = ai.at(-1).messages[1].content; assert.ok(parts.some(p => p.type === 'image_url' && p.image_url.url.startsWith('data:image/png;base64,')));
res = await call('POST', { body: { pid: 'p-abc1', read: { path: dxfPath } } }); assert.equal(res.code, 200);
assert.equal(typeof ai.at(-1).messages[1].content, 'string'); assert.match(ai.at(-1).messages[1].content, /16' DRAINAGE ESMT\./, 'the DXF\'s labels go as text');
// a "PDF" that isn't one: refused before the AI is asked; an AI that can't read it: says so
const n0 = ai.length, fake = 'projects/p-abc1/e5e5e5e5e5__Fake.pdf'; objects.set(fake, Buffer.from('<html>not a pdf</html>'));
res = await call('POST', { body: { pid: 'p-abc1', read: { path: fake } } }); assert.equal(res.code, 422); assert.equal(ai.length, n0, 'never sent to the AI');
aiReply = () => ({ kind: 'other', title: null, readable: false, unreadable: 'The scan is too faint to read.', summary: 'A faint scan.', facts: [] });
res = await call('POST', { body: { pid: 'p-abc1', read: { path: up.path } } }); assert.equal(res.body.read.readable, false); assert.match(res.body.read.unreadable, /too faint/); assert.deepEqual(res.body.facts, []);
delete process.env.OPENAI_API_KEY; res = await call('POST', { body: { pid: 'p-abc1', read: { path: up.path } } }); assert.equal(res.code, 503); assert.equal(res.body.ai, false); process.env.OPENAI_API_KEY = 'sk-test';
res = await call('POST', { body: { pid: 'p-abc1', read: { path: 'projects/p-other/d1d2d3d4d5__Theirs.pdf' } } }); assert.equal(res.code, 400);
assert.equal(contentFor(Buffer.from([0xff, 0xd8, 0xff]), 'a.png'), null, 'a JPEG named .png isn\'t sent as a PNG');

// delete: this project's paths only
res = await call('POST', { body: { pid: 'p-abc1', remove: [pngPath, 'projects/p-other/d1d2d3d4d5__Theirs.pdf', '../x'] } });
assert.equal(res.body.removed, 1); assert.ok(!objects.has(pngPath)); assert.ok(objects.has('projects/p-other/d1d2d3d4d5__Theirs.pdf'), 'another project\'s file stays');
// renderings, massing and plan sets kept for the team (project-media): an upload link, a link to open, a 404 when none
// was kept, deletes of this project's only, and nothing outside the three kinds
assert.equal(RF.mediaPath('p-abc1', 'render/' + RF.mediaKey('pl1/mx9-corner')), 'p-abc1/render/pl1_mx9-corner.jpg');
assert.equal(RF.mediaPath('p-abc1', 'set/s1'), 'p-abc1/set/s1.pdf'); assert.equal(RF.mediaPath('p-abc1', 'evil/x'), null); assert.equal(RF.mediaPath('p-abc1', 'render/..'), null); assert.equal(RF.mediaPath('../x', 'render/a'), null);
res = await call('POST', { body: { pid: 'p-abc1', media: { kind: 'render', key: 'pl1_mx9-corner', size: 900_000 } } });
assert.equal(res.code, 200, JSON.stringify(res.body)); assert.equal(res.body.url, 'http://supa.test/storage/v1/object/upload/sign/project-media/p-abc1/render/pl1_mx9-corner.jpg?token=m');
res = await call('POST', { body: { pid: 'p-abc1', media: { kind: 'set', key: 's1', size: 60 * 2 ** 20 } } }); assert.equal(res.code, 413, 'over 50 MB');
res = await call('POST', { body: { pid: 'p-abc1', media: { kind: 'exe', key: 's1', size: 10 } } }); assert.equal(res.code, 400);
res = await call('GET', { query: { pid: 'p-abc1', media: 'render/pl1_mx9-corner' } }); assert.equal(res.code, 404, 'none kept yet');
media.add('p-abc1/render/pl1_mx9-corner.jpg'); media.add('p-abc1/massing/pl1_mx9-corner.jpg'); media.add('p-other/render/a.jpg');
res = await call('GET', { query: { pid: 'p-abc1', media: 'render/pl1_mx9-corner' } }); assert.equal(res.code, 200); assert.equal(res.body.url, 'http://supa.test/storage/v1/object/sign/project-media/p-abc1/render/pl1_mx9-corner.jpg?token=g');
res = await call('POST', { body: { pid: 'p-abc1', unmedia: ['render/pl1_mx9-corner', 'massing/pl1_mx9-corner', '../p-other/render/a', 'evil/x'] } });
assert.equal(res.body.removed, 2); assert.equal(media.size, 1, 'another project\'s picture stays');
console.log('sitefiles api ok: not set up (key, bucket), signed upload, types and size, list, open, read PDF / PNG / DXF with the strict schema, unreadable, delete, team copies of renderings and plan sets');

// ---- the confirmed facts reach the site-plan AI: the program, the plan, the review, a change, a question ----
{ const { default: sp } = await import('../api/siteplan.js'); const got = [];
  globalThis.fetch = async (url, opts = {}) => { const u = String(url); if (u.includes('/models')) return json({ id: 'gpt-test', data: [{ id: 'gpt-test' }] }); const b = JSON.parse(opts.body); got.push(b);
    const name = b.response_format.json_schema.name, reply = { site_program: null, site_review: { reviews: [{ option: 0, score: 80, verdict: 'ok', strengths: [], problems: [] }], ranking: [0], revise: false, program: null, params: { fill: null, streets: null, form: null, storm: null }, why: '', summary: 'fine', brief: null, briefWhy: '' }, plan_answer: { answer: 'The 16 ft drainage easement on the north line has to stay clear.', followups: [] } }[name];
    return json({ choices: [{ message: { content: JSON.stringify(reply || {}) }, finish_reason: 'stop' }] }); };
  const spCall = async body => { const res = mock(); await sp({ method: 'POST', body, headers: { 'x-forwarded-for': '9.9.' + (ip++ % 200) + '.1' } }, res); return res; };
  const userText = b => { const c = b.messages[1].content; return Array.isArray(c) ? c[0].text : c; };
  await spCall({ prompt: '25,000 sf retail strip', site: { acres: 4.72 }, refs });
  const prog = got.at(-1); assert.equal(prog.response_format.json_schema.name, 'site_program');
  assert.ok(userText(prog).includes(RF.refBlock(refs)), 'the program prompt carries the confirmed facts'); assert.ok(userText(prog).includes('16\' drainage easement'), 'the easement as confirmed');
  assert.ok(!userText(prog).includes('Front building line'), 'an unchecked fact is not in it');
  await spCall({ mode: 'review', prompt: '25,000 sf retail strip', site: { acres: 4.72 }, program: { use: 'retail' }, round: 1, options: [{ name: 'Layout 1', metrics: { floorAreaSf: 25000 }, issues: [], notes: [] }], refs });
  assert.ok(userText(got.at(-1)).includes('Plan 2140 "The Aspen"'), 'the review sees them');
  await spCall({ mode: 'ask', question: 'What has to stay clear?', plan: { option: 'Option A' }, refs }); assert.ok(userText(got.at(-1)).indexOf('Reference facts') < userText(got.at(-1)).indexOf('Question: What has to stay clear?'), 'a question: the facts before it');
  await spCall({ mode: 'edit', prompt: 'remove bldg 3', plan: { pieces: [{ id: 'b3', name: 'Bldg 3', kind: 'building' }] }, refs }); assert.ok(userText(got.at(-1)).includes(RF.refBlock(refs)), 'a change sees them');
  await spCall({ mode: 'strategy', prompt: '25,000 sf retail strip', site: { acres: 4.72 }, refs }); assert.ok(userText(got.at(-1)).includes(RF.refBlock(refs)), 'the plan before placing sees them');
  const n = got.length; await spCall({ prompt: '25,000 sf retail strip', site: { acres: 4.72 } }); assert.ok(!userText(got[n]).includes('Reference facts'), 'none confirmed: no block'); }
console.log('sitefiles ok: confirmed facts reach the program, plan, review, change and question prompts');
