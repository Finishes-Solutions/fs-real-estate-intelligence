// Offline tests for the CRE report runner hand-off (lib/runner.mjs, api/runner.js): what is sent to the runner for each
// kind of run, signed callbacks, the documents saved as they arrive, the run's status, renderings only when asked for,
// and the stored HTML served with scripts off. Supabase (PostgREST) and the runner are mocked in memory.
import assert from 'node:assert/strict';
process.env.SUPABASE_URL = 'https://db.test'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_x';
process.env.REPORT_RUNNER_URL = 'https://runner.test/'; process.env.REPORT_RUNNER_SECRET = 'shh'; process.env.RUNNER_DAILY_CAP = '2';
delete process.env.FIELD_ACCESS_CODE; delete process.env.PUBLIC_URL;

const tables = { report_runs: [], report_run_docs: [] }, sent = [];
let runnerDown = false;
const match = (row, sp) => [...sp].every(([k, v]) => ['select', 'order', 'limit', 'on_conflict'].includes(k) || (v.startsWith('eq.') ? String(row[k]) === v.slice(3) : v.startsWith('gte.') ? row[k] >= v.slice(4) : true));
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)), m = opts.method || 'GET';
  if (u.host === 'db.test') {
    const t = u.pathname.replace('/rest/v1/', ''), rows = tables[t]; assert.ok(rows, 'table ' + t);
    if (m === 'GET') { const cols = (u.searchParams.get('select') || '*').split(','), out = rows.filter(r => match(r, u.searchParams)).map(r => cols[0] === '*' ? r : Object.fromEntries(cols.map(c => [c, r[c]])));
      return Response.json(u.searchParams.get('limit') ? out.slice(0, +u.searchParams.get('limit')) : out); }
    if (m === 'PATCH') { const patch = JSON.parse(opts.body); rows.filter(r => match(r, u.searchParams)).forEach(r => Object.assign(r, patch)); return new Response(null, { status: 204 }); }
    if (m === 'POST') {
      const body = [].concat(JSON.parse(opts.body)), keys = (u.searchParams.get('on_conflict') || '').split(',').filter(Boolean), out = [];
      for (const b of body) {
        const hit = keys.length && rows.find(r => keys.every(k => r[k] === b[k]));
        if (hit) Object.assign(hit, b); else rows.push(Object.assign(b, t === 'report_runs' ? { id: b.id || crypto.randomUUID(), created_at: new Date().toISOString(), error: null } : {}));
        out.push(hit || b);
      }
      return /representation/.test(opts.headers?.Prefer || '') ? Response.json(out) : new Response('', { status: 201 });
    }
  }
  if (u.host === 'runner.test') { if (runnerDown) return new Response('{"ok":false,"error":"bad secret"}', { status: 401 }); sent.push({ path: u.pathname, body: JSON.parse(opts.body) }); return Response.json({ ok: true, accepted: true }, { status: 202 }); }
  return new Response('unmocked ' + u, { status: 599 });
};
const lib = await import('../lib/runner.mjs');
const { default: handler, cleanParcels } = await import('../api/runner.js');
const res = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, send(b) { r.body = b; return r; }, end() { return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
// each call from its own address, so the per-visitor limit doesn't mask the team-wide daily cap
let ip = 0;
const call = async (method, query, body, headers = {}) => { const r = res(); await handler({ method, query, body, headers: { host: 'map.test', 'x-forwarded-proto': 'https', 'x-forwarded-for': '10.0.0.' + (++ip), ...headers } }, r); return r; };

// two adjacent Waller lots (outlines from the map) and a Harris lot known only by its acreage
const sq = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x0, y1], [x1, y1], [x1, y0], [x0, y0]]] });
const parcels = [
  { propId: '12345', owner: 'ACME HOLDINGS LLC', situs: '100 Main St, Waller', city: 'Waller', zip: '77484', county: 'Waller', acres: 2.5, sqft: 108900, marketValue: 300000, landValue: 300000, source: 'Regrid', geometry: sq(-95.93, 30.05, -95.929, 30.051), center: [-95.9295, 30.0505] },
  { propId: '12346', owner: 'ACME HOLDINGS LLC', situs: '110 Main St, Waller', county: 'Waller', acres: 3, marketValue: 350000, source: 'Regrid', geometry: sq(-95.929, 30.05, -95.928, 30.051), center: [-95.9285, 30.0505] }
];

// --- parcel checking: bad input never reaches the runner ---
const cp = cleanParcels([...parcels, { center: [999, 0] }, { center: [-95, 30], owner: 'X\u0000Y', geometry: { type: 'Point', coordinates: [0, 0] }, acres: -4 }, 'junk']);
assert.equal(cp.length, 3, 'bad centers and non-objects dropped'); assert.equal(cp[2].owner, 'X Y'); assert.equal(cp[2].geometry, null, 'only polygons'); assert.equal(cp[2].acres, null);
assert.equal(cleanParcels(Array.from({ length: 30 }, () => parcels[0])).length, 20, 'at most 20 parcels, as the runner allows');

// --- request bodies ---
const opts = lib.cleanOptions({ program: '96 townhomes for sale', notes: 'Owner wants to keep the frontage', purchase_price: '$1,250,000', images: 1, floors: 'x' });
assert.equal(opts.purchase_price, 1250000); assert.equal(opts.floors, ''); assert.equal(opts.images, true);
const f = lib.requestsFor('feasibility', parcels, opts, { callbackUrl: 'https://cb', secret: 'shh' });
assert.deepEqual(f.map(r => r.endpoint), ['/api/run-report', '/api/run-sitemap'], 'the chain starts at the research report; the parcel map runs beside it');
const fb = f[0].body;
assert.equal(fb.test_mode, true, 'documents come back to us only: no Monday item, no Zaps');
assert.equal(fb.address, '100 Main St, Waller, TX, 77484'); assert.equal(fb.county, 'Waller'); assert.equal(fb.state, 'TX'); assert.equal(fb.parcelId, '12345, 12346');
assert.equal(fb.total_acres, 5.5); assert.equal(fb.total_assessed_value, 650000);
assert.match(fb.parcel_enrichment, /2-Parcel Assemblage/); assert.match(fb.intake_block, /Owner Proposed Best Use \| 96 townhomes for sale/); assert.match(fb.intake_block, /\$1,250,000/);
assert.equal(JSON.parse(fb.parcels_geojson).features.length, 2); assert.equal(fb.secret, 'shh');
const sp = lib.requestsFor('site_plan', parcels, opts, { callbackUrl: 'https://cb' })[0].body;
assert.equal(sp.selected_program, '96 townhomes for sale'); assert.equal(sp.parcels_geojson.type, 'FeatureCollection'); assert.equal(sp.secret, undefined);
const bare = [{ propId: '9', county: 'Harris', acres: 4, center: [-95.6, 30.0] }];
assert.equal(lib.requestsFor('site_plan', bare, opts, { callbackUrl: 'x' })[0].body.total_acres, 4, 'a site plan works from acreage alone');
assert.throws(() => lib.requestsFor('parcel_map', bare, opts, { callbackUrl: 'x' }), /outlines/);
assert.deepEqual(lib.expectedDocs('feasibility', bare, {}), ['screening', 'report', 'business', 'proforma', 'preliminary_site', 'verify', 'risk'], 'no parcel map without outlines');
assert.ok(!lib.intakeFor({}).block, 'no intake block when the person said nothing');

// --- signatures ---
const s = lib.sign('abc', 'k'); assert.ok(lib.verify('abc', s, 'k')); assert.ok(!lib.verify('abd', s, 'k')); assert.ok(!lib.verify('abc', s, '')); assert.ok(!lib.verify('abc', s.slice(1), 'k'));

// --- status ---
const E = ['report', 'site_map'];
assert.equal(lib.runStatus(E, []), 'running');
assert.equal(lib.runStatus(E, [{ doc_type: 'site_map', ok: false }]), 'running', 'a failed side document doesn’t stop the chain');
assert.equal(lib.runStatus(E, [{ doc_type: 'site_map', ok: false }, { doc_type: 'report', ok: true }]), 'partial');
assert.equal(lib.runStatus(E, [{ doc_type: 'error', ok: false }]), 'failed', 'a pipeline error ends it');
assert.equal(lib.runStatus(E, [{ doc_type: 'report', ok: true }, { doc_type: 'site_map', ok: true }]), 'done');
assert.equal(lib.readDrop({ ok: false, stage: 1, error: 'max_tokens' }).doc.meta.stage, 'Initial Information Report', 'stage failures without a doc_type are caught');

// --- the endpoint: start ---
let r = await call('POST', {}, { kind: 'feasibility', parcels, options: { program: 'townhomes', images: true } });
assert.equal(r.code, 200, JSON.stringify(r.body)); const id = r.body.id;
assert.deepEqual(r.body.expected, ['screening', 'report', 'business', 'proforma', 'preliminary_site', 'verify', 'risk', 'site_map', 'images']);
assert.deepEqual(sent.map(x => x.path), ['/api/run-report', '/api/run-sitemap']);
const cb = new URL(sent[0].body.callbackUrl);
assert.equal(cb.origin, 'https://map.test'); assert.equal(cb.searchParams.get('cb'), id); assert.equal(sent[0].body.idColumn, 'MAP-' + id.slice(0, 8));
assert.equal(sent[0].body.secret, 'shh');
assert.equal((await call('POST', {}, { kind: 'nope', parcels })).code, 400);
assert.equal((await call('POST', {}, { kind: 'feasibility', parcels: [] })).code, 400);
assert.equal((await call('POST', {}, { kind: 'feasibility', parcels }, { origin: 'https://evil.test' })).code, 403, 'other sites can’t start paid runs');
process.env.FIELD_ACCESS_CODE = 'team'; assert.equal((await call('POST', {}, { kind: 'site_plan', parcels })).code, 401, 'the team passcode applies'); delete process.env.FIELD_ACCESS_CODE;

// --- callbacks ---
const drop = (body, sig = cb.searchParams.get('sig')) => call('POST', { cb: id, sig }, body);
assert.equal((await drop({ doc_type: 'report', report_html: '<p>x</p>' }, 'forged')).code, 403, 'unsigned callbacks are refused');
assert.equal((await call('POST', { cb: crypto.randomUUID(), sig: cb.searchParams.get('sig') }, { doc_type: 'report' })).code, 403, 'a signature only fits its own run');
await drop({ ok: true, doc_type: 'parcel', parcels_geojson: {} });
assert.equal(tables.report_run_docs.length, 0, 'parcel drops are not documents');
await drop({ ok: true, doc_type: 'report', report_html: '<html><body><h1>Initial Information</h1><script>alert(1)</script></body></html>', pdf_name: '100_Main_IIR.pdf' });
await drop({ ok: true, doc_type: 'preliminary_site', pdf_html: '<html>plan</html>', program: 'Townhomes', units: 64, total_project_cost: 18400000, site_basis: 'long text' });
await drop({ ok: false, doc_type: 'site_map', error: 'no geometry' });
let run = tables.report_runs.find(x => x.id === id);
assert.equal(run.status, 'running'); assert.match(run.error, /Parcel Map: no geometry/);
const ps = tables.report_run_docs.find(d => d.doc_type === 'preliminary_site');
assert.deepEqual(ps.meta, { program: 'Townhomes', units: 64, total_project_cost: 18400000 }, 'headline figures kept, long fields not');
// the risk stage asks for renderings: forwarded to the runner because this run asked for them
sent.length = 0;
await drop({ doc_type: 'images-kickoff', report_text: 'r', business_text: 'b', address: '100 Main St' });
assert.equal(sent.length, 1); assert.equal(sent[0].path, '/api/run-images'); assert.equal(sent[0].body.test_mode, true); assert.equal(new URL(sent[0].body.callbackUrl).searchParams.get('cb'), id);
for (const t of ['business', 'proforma', 'verify', 'risk']) await drop({ ok: true, doc_type: t, [t + '_html']: '<html>' + t + '</html>' });
await drop({ ok: true, doc_type: 'screening', screening_html: '<html>packet</html>', recommendation: 'advance_narrowed', viability_score: 64 });
await drop({ ok: true, doc_type: 'images', image_1_url: 'https://blob.test/1.png', image_1_label: 'Aerial', hbu: { a: 1 } });
run = tables.report_runs.find(x => x.id === id);
assert.equal(run.status, 'partial', 'everything in, but the parcel map failed');

// --- reading ---
r = await call('GET', { id });
assert.equal(r.body.docs.length, 9); assert.ok(r.body.docs.every(d => !('html' in d)), 'the list never carries the documents');
assert.deepEqual(r.body.docs.find(d => d.doc_type === 'images').meta.images, [{ url: 'https://blob.test/1.png', label: 'Aerial' }]);
assert.equal(r.body.docs.find(d => d.doc_type === 'screening').meta.recommendation, 'advance_narrowed');
r = await call('GET', { id, doc: 'report' });
assert.match(r.body, /Initial Information/); assert.match(r.headers['Content-Security-Policy'], /^sandbox; default-src 'none'/, 'scripts in the runner’s HTML never run on our site');
assert.equal((await call('GET', { id, doc: 'site_map' })).code, 404, 'a failed document has nothing to show');
assert.equal((await call('GET', { id, doc: '../etc' })).code, 400);
assert.equal((await call('GET', { list: '1' })).body.runs.length, 1);

// --- the daily ceiling, and a runner that refuses ---
await call('POST', {}, { kind: 'feasibility', parcels });
r = await call('POST', {}, { kind: 'feasibility', parcels });
assert.equal(r.code, 429, 'two feasibility runs a day with RUNNER_DAILY_CAP=2'); assert.match(r.body.error, /daily limit/);
runnerDown = true; r = await call('POST', {}, { kind: 'site_plan', parcels });
assert.equal(r.code, 502); assert.match(r.body.error, /bad secret/);
assert.equal(tables.report_runs.find(x => x.id === r.body.id).status, 'failed', 'a run the runner refused is marked failed, not left running');
runnerDown = false;
delete process.env.REPORT_RUNNER_URL; assert.equal((await call('POST', {}, { kind: 'site_plan', parcels })).code, 503);

console.log('runner: ok');
