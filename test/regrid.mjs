// Offline tests for api/regrid.js: caps, saved records, fail-closed without a counter, token never sent to the browser.
import assert from 'node:assert/strict';
process.env.REGRID_TOKEN = 'rg-secret'; process.env.SUPABASE_URL = 'https://db.test'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_x';
process.env.REGRID_RECORD_CAP = '3'; process.env.REGRID_TILE_CAP = '2';
const db = { usage: {}, parcels: {} }, calls = [];
let regridUsed = { results: 0, tiles: 0 };
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)); calls.push(u.host + u.pathname);
  if (u.host === 'db.test') {
    const path = u.pathname.replace('/rest/v1/', '');
    if (path === 'rpc/regrid_take') { const a = JSON.parse(opts.body), k = a.p_cycle + '|' + a.p_kind; const cur = Math.max(db.usage[k] || 0, a.p_floor || 0);
      if (cur + a.p_n > a.p_cap) { db.usage[k] = cur; return Response.json(-1); } db.usage[k] = cur + a.p_n; return Response.json(cur + a.p_n); }
    if (path === 'regrid_usage') return Response.json(Object.entries(db.usage).filter(([k]) => k.startsWith(u.searchParams.get('cycle').slice(3) + '|')).map(([k, n]) => ({ kind: k.split('|')[1], n })));
    if (path === 'regrid_parcels' && (opts.method || 'GET') === 'GET') { const k = u.searchParams.get('k').slice(3); return Response.json(db.parcels[k] ? [db.parcels[k]] : []); }
    if (path === 'regrid_parcels') { for (const row of JSON.parse(opts.body)) db.parcels[row.k] = { data: row.data, geom: row.geom, fetched_at: '2026-10-02T00:00:00Z' }; return new Response('', { status: 201 }); }
  }
  if (u.host === 'app.regrid.com' && u.pathname === '/api/v2/usage') { assert.equal(opts.headers['x-regrid-token'], 'rg-secret'); return Response.json({ usage: { cycle_dates: { begin: 1790812800 }, cycle_usage: regridUsed } }); }
  if (u.host === 'app.regrid.com' && u.pathname === '/api/v2/parcels/point') {
    assert.equal(u.searchParams.get('limit'), '1'); assert.equal(u.searchParams.get('return_enhanced_ownership'), 'false');
    return Response.json({ parcels: { features: [{ geometry: { type: 'Polygon', coordinates: [] }, properties: { ll_uuid: 'uuid-1', headline: '101 Main St', path: '/us/tx/waller/1', fields: { parcelnumb: 'R123', owner: 'ACME LLC', mailadd: 'PO Box 1', mail_city: 'Waller', mail_state2: 'TX', mail_zip: '77484', usedesc: 'Commercial', zoning: 'C-2', ll_gisacre: 1.25, saleprice: 0, weird: '' } } }] }, zoning: { features: [{ properties: { zoning: 'C-2', max_building_height_ft: 45 } }] } });
  }
  if (u.host === 'tiles.regrid.com') { assert.equal(u.searchParams.get('token'), 'rg-secret'); return new Response(new Uint8Array([26, 2, 1, 2]), { headers: { 'Content-Type': 'application/x-protobuf' } }); }
  return new Response('unmocked ' + u, { status: 599 });
};
const { default: handler, trimRecord, cycleOf } = await import('../api/regrid.js');
const res = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, send(b) { r.body = b; return r; }, end() { return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
const call = async query => { const r = res(); await handler({ headers: {}, query }, r); return r; };

assert.equal(cycleOf({ usage: { cycle_dates: { begin: 1790812800 } } }), '2026-10-01'); assert.equal(cycleOf(null, new Date('2026-10-15')), '2026-10-01');
const t = trimRecord({ properties: { fields: { owner: 'A', mailadd: '1 X St', mail_city: 'Katy', saleprice: 0, foo: 'bar' } } });
assert.deepEqual(t.fields, [['Owner', 'A'], ['Mailing address', '1 X St, Katy']], 'empty and zero values dropped'); assert.deepEqual(t.more, [['foo', 'bar']]);

// a record: counted, saved, then free
let r = await call({ lat: '30.05', lon: '-95.93', key: 'Waller|12345' });
assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.cached, false); assert.ok(r.body.fields.some(([k, v]) => k === 'Zoning' && v === 'C-2')); assert.equal(r.body.zoning.max_building_height_ft, 45);
assert.equal(r.body.usage.records.used, 1); assert.ok(!JSON.stringify(r.body).includes('rg-secret'), 'token never in a response');
const before = calls.filter(c => c.endsWith('/parcels/point')).length;
r = await call({ lat: '30.05001', lon: '-95.93001', key: 'Waller|12345' });
assert.equal(r.body.cached, true); assert.equal(calls.filter(c => c.endsWith('/parcels/point')).length, before, 'saved parcel: no new Regrid call');
// the cap: Regrid already reports 2 used this cycle -> one more allowed, then refused without calling Regrid
regridUsed = { results: 2, tiles: 0 }; (await import('../api/regrid.js'));
r = await call({ lat: '30.1', lon: '-95.9' }); // cache still holds old usage (10 min), our counter is at 1 -> 2
assert.equal(r.code, 200); r = await call({ lat: '30.2', lon: '-95.9' }); assert.equal(r.code, 200, 'third record (cap 3)');
const n = calls.filter(c => c.endsWith('/parcels/point')).length;
r = await call({ lat: '30.3', lon: '-95.9' }); assert.equal(r.code, 429); assert.ok(r.body.capped); assert.equal(calls.filter(c => c.endsWith('/parcels/point')).length, n, 'capped: Regrid not called');
// tiles: only zoom 15-16, capped at 2
assert.equal((await call({ tile: '14/1/1' })).code, 400); assert.equal((await call({ tile: '17/1/1' })).code, 400);
r = await call({ tile: '15/7500/13500' }); assert.equal(r.code, 200); assert.match(r.headers['Cache-Control'], /s-maxage=604800/);
r = await call({ tile: '16/15000/27000' }); assert.equal(r.code, 200);
r = await call({ tile: '16/15001/27000' }); assert.equal(r.code, 204, 'tile cap reached: empty tile, no Regrid call'); assert.equal(r.headers['X-Regrid-Capped'], '1');
assert.equal(calls.filter(c => c.startsWith('tiles.regrid.com')).length, 2);
// usage
r = await call({ usage: '1' }); assert.equal(r.body.records.used, 3); assert.equal(r.body.tiles.used, 2); assert.equal(r.body.records.cap, 3);
// fail closed: no token / no counter
delete process.env.SUPABASE_URL; r = await call({ lat: '30.4', lon: '-95.9' }); assert.equal(r.code, 503); assert.match(r.body.error, /usage counter/);
process.env.SUPABASE_URL = 'https://db.test'; delete process.env.REGRID_TOKEN; r = await call({ tile: '15/1/1' }); assert.equal(r.code, 503);
console.log('regrid tests passed');
