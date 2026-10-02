// Offline test for /api/field (team field notes without sign-in) against an in-memory Supabase REST + storage.
import assert from 'node:assert/strict';
const store = { field_notes: [], team_watchlist: [] }, files = new Map(), seen = [];
const json = (o, s = 200) => new Response(o == null ? null : JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)), m = opts.method || 'GET'; seen.push(m + ' ' + u.pathname);
  assert.equal(opts.headers.apikey, 'sb_secret_test'); assert.ok(!opts.headers.Authorization, 'new-style secret keys go in apikey only');
  if (u.pathname.startsWith('/storage/v1/object/field-photos')) {
    const p = decodeURIComponent(u.pathname.replace('/storage/v1/object/field-photos', '').replace(/^\//, ''));
    if (m === 'POST') { files.set(p, Buffer.from(opts.body)); return json({ Key: p }); }
    if (m === 'DELETE') { for (const x of JSON.parse(opts.body).prefixes) files.delete(x); return json([]); }
    return files.has(p) ? new Response(files.get(p), { headers: { 'Content-Type': 'image/jpeg' } }) : json({ message: 'not found' }, 404);
  }
  const t = u.pathname.split('/').pop(), rows = store[t]; if (!rows) return json({ message: 'no table ' + t }, 404);
  const filt = r => [...u.searchParams].every(([k, v]) => ['select', 'order', 'limit', 'on_conflict'].includes(k) || (v.startsWith('eq.') ? String(r[k]) === v.slice(3) : v.startsWith('in.(') ? v.slice(4, -1).split(',').map(x => x.replace(/"/g, '')).includes(String(r[k])) : true));
  if (m === 'GET') return json(rows.filter(filt));
  if (m === 'DELETE') { store[t] = rows.filter(r => !filt(r)); return json(null, 204); }
  const keys = u.searchParams.get('on_conflict').split(',');
  for (const r of JSON.parse(opts.body)) { const ex = rows.find(x => keys.every(k => x[k] === r[k])); if (ex) Object.assign(ex, r); else rows.push({ ...r }); }
  return json(null, 201);
};
const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, send(b) { r.body = b; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
const call = async (method, { body, query = {}, headers = {} } = {}) => { const res = mock(); await handler({ method, body, query, headers: { 'x-forwarded-for': '9.9.9.9', ...headers } }, res); return res; };
const { default: handler, cleanNote } = await import('../api/field.js');

let res = await call('GET'); assert.equal(res.code, 503, 'no secret key -> off');
process.env.SUPABASE_URL = 'http://supa.test'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';

// push a note, a star and a photo
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
res = await call('POST', { body: { photo: { path: 'shared/n-abc1/p1.jpg', data: JPEG.toString('base64') } } }); assert.equal(res.code, 200); assert.ok(files.has('shared/n-abc1/p1.jpg'));
res = await call('POST', { body: { photo: { path: '../etc/passwd', data: JPEG.toString('base64') } } }); assert.equal(res.code, 400, 'path traversal refused');
res = await call('POST', { body: { photo: { path: 'shared/n-abc1/p2.jpg', data: Buffer.from('<svg/>').toString('base64') } } }); assert.equal(res.code, 400, 'non-JPEG refused');
res = await call('POST', { body: { name: 'Matthew', notes: [{ id: 'n-abc1', lng: -95.93, lat: 30.05, title: 'Corner lot', text: 'Call broker', tag: 'Opportunity', photos: ['shared/n-abc1/p1.jpg', 'p-local-only', 'http://evil/x.jpg'], created: '2026-10-01T10:00:00Z', updated: '2026-10-01T11:00:00Z' }, { id: 'x', lng: 999, lat: 0 }],
  watch: [{ id: 'w1', kind: 'filing', ref: 'TABS2025000001', label: 'Clinic', lng: -95.9, lat: 30 }, { kind: 'nope', ref: 'x' }] } });
assert.equal(res.code, 200); assert.equal(res.body.notes, 1, 'invalid note dropped'); assert.equal(res.body.watch, 1);
const n = store.field_notes[0]; assert.deepEqual(n.photos, ['shared/n-abc1/p1.jpg'], 'only shared photo paths stored'); assert.equal(n.created_by_email, 'Matthew'); assert.equal(n.body, 'Call broker');

// a teammate edits; author stays
res = await call('POST', { body: { name: 'Amy', notes: [{ ...cleanNoteBack(n), title: 'Corner lot (listed)', by: 'Matthew', updated: '2026-10-02T09:00:00Z' }] } });
assert.equal(store.field_notes[0].title, 'Corner lot (listed)'); assert.equal(store.field_notes[0].updated_by_email, 'Amy'); assert.equal(store.field_notes[0].created_by_email, 'Matthew');
function cleanNoteBack(r) { return { id: r.client_id, lng: r.lng, lat: r.lat, title: r.title, text: r.body, tag: r.tag, photos: r.photos, created: r.created_at }; }

// pull
res = await call('GET'); assert.equal(res.body.notes.length, 1); assert.equal(res.body.notes[0].id, 'n-abc1'); assert.equal(res.body.notes[0].text, 'Call broker'); assert.equal(res.body.notes[0].editedBy, 'Amy'); assert.equal(res.body.watch[0].ref, 'TABS2025000001');
res = await call('GET', { query: { photo: 'shared/n-abc1/p1.jpg' } }); assert.equal(res.code, 200); assert.deepEqual(Buffer.from(res.body), JPEG);
res = await call('GET', { query: { photo: 'shared/../../x.jpg' } }); assert.equal(res.code, 400);

// deletes
res = await call('POST', { body: { deletes: [{ kind: 'note', id: 'n-abc1' }, { kind: 'photo', path: 'shared/n-abc1/p1.jpg' }, { kind: 'watch', wkind: 'filing', ref: 'TABS2025000001' }, { kind: 'photo', path: '/etc/x' }] } });
assert.equal(res.code, 200); assert.equal(store.field_notes.length, 0); assert.equal(store.team_watchlist.length, 0); assert.equal(files.size, 0);

// optional passcode
process.env.FIELD_ACCESS_CODE = 'waller-2026';
res = await call('GET'); assert.equal(res.code, 401); assert.equal(res.body.passcode, true);
res = await call('GET', { headers: { 'x-field-code': 'waller-2026' } }); assert.equal(res.code, 200);
delete process.env.FIELD_ACCESS_CODE;

// upstream failure is a clean 502, not a crash
globalThis.fetch = async () => new Response('down', { status: 500 });
res = await call('GET'); assert.equal(res.code, 502); assert.match(res.body.error, /kept on this device/);
assert.equal(cleanNote({ id: 'ok-1', lng: -95, lat: 30, title: 'x'.repeat(500) }).title.length, 200);
console.log('field api tests passed');
