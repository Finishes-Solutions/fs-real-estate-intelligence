// Offline tests for high-res site imagery (lib/hires.mjs, api/imagery.js) with mocked Esri Wayback and Planetary Computer.
import assert from 'node:assert/strict';
const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, send(b) { r.body = b; return r; }, end() { return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
const META = n => 'https://metadata.maptiles.arcgis.com/arcgis/rest/services/World_Imagery_Metadata_' + n + '/MapServer';
// releases out of date order on purpose, like the real config
const CONFIG = { 60: ['2022-05-05', 'a'], 100: ['2026-02-26', 'e'], 80: ['2024-03-07', 'c'], 90: ['2025-06-01', 'd'], 70: ['2023-01-01', 'b'] };
// what each release's tile at the test spot really comes from: 2026 = 2025's imagery, 2024 and 2023 = 2022's
const SELECT = { 100: 90, 90: 90, 80: 60, 70: 60, 60: 60 };
const seen = []; let mode = 'ok';
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)); seen.push(u);
  if (u.host === 's3-us-west-2.amazonaws.com') return json(Object.fromEntries(Object.entries(CONFIG).map(([r, [d, m]]) => [r, { itemTitle: 'World Imagery (Wayback ' + d + ')', metadataLayerUrl: META(m) }])));
  if (u.host === 'wayback.maptiles.arcgis.com' && u.pathname.includes('/tilemap/')) {
    if (mode === 'no-tilemap') return json({ error: 'x' }, 500);
    const r = +u.pathname.split('/tilemap/')[1].split('/')[0]; return json({ valid: true, data: [1], select: [SELECT[r]] });
  }
  if (u.host === 'wayback.maptiles.arcgis.com' && u.pathname.includes('/tile/')) return new Response(new Uint8Array([255, 216]), { headers: { 'Content-Type': 'image/jpeg' } });
  if (u.host === 'metadata.maptiles.arcgis.com') {
    if (u.searchParams.get('f') === 'json' && !u.pathname.endsWith('/query')) return json({ layers: [{ id: 0, minScale: 0, maxScale: 50000 }, { id: 3, minScale: 9000, maxScale: 3000 }] });
    assert.ok(u.pathname.endsWith('/3/query'), 'queries the layer for zoom 17: ' + u.pathname);
    const m = u.pathname.match(/Metadata_(\w)/)[1];
    return json({ features: [{ attributes: { SRC_DATE2: m === 'd' ? Date.UTC(2025, 0, 15) : Date.UTC(2021, 11, 2), SAMP_RES: 0.3, NICE_DESC: 'Maxar' } }] });
  }
  if (u.host === 'planetarycomputer.microsoft.com' && u.pathname === '/api/stac/v1/search') {
    const body = JSON.parse(opts.body); assert.deepEqual(body.collections, ['naip']);
    return json({ features: [
      { id: 'tx_m_2909536_ne_15_060_20220512', bbox: [-95.4, 29.7, -95.3, 29.8], properties: { datetime: '2022-05-12T00:00:00Z', gsd: 0.6 } },
      { id: 'tx_m_2909536_nw_15_060_20220512', bbox: [-95.37, 29.7, -95.3, 29.8], properties: { datetime: '2022-05-12T00:00:00Z', gsd: 0.6 } },
      { id: 'tx_m_2909536_ne_15_060_20200901', bbox: [-95.4, 29.7, -95.3, 29.8], properties: { datetime: '2020-09-01T00:00:00Z', gsd: 0.6 } }] });
  }
  if (u.host === 'planetarycomputer.microsoft.com' && u.pathname.endsWith('/WebMercatorQuad/tilejson.json')) return json({ detail: 'Not Found' }, 404);
  if (u.host === 'planetarycomputer.microsoft.com' && u.pathname.endsWith('/tilejson.json')) return json({ tiles: ['https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/{z}/{x}/{y}@1x?collection=naip'] });
  if (u.host === 'planetarycomputer.microsoft.com' && u.pathname.includes('/tiles/')) return new Response(new Uint8Array([137, 80]), { headers: { 'Content-Type': 'image/png' } });
  return json({ error: 'unmocked ' + u }, 599);
};

const { tileOf, waybackReleases, waybackChanges, imageryCatalog } = await import('../lib/hires.mjs');
const C = [-95.3647, 29.7577];
const { tileLonLat } = await import('../api/tile.js');
{ const t = tileOf(C, 17), b = tileLonLat(t.z, t.x, t.y); assert.ok(b[0] <= C[0] && C[0] < b[2] && b[1] <= C[1] && C[1] < b[3], 'tileOf matches the tile proxy maths'); }
const rel = await waybackReleases();
assert.deepEqual(rel.map(x => x.date), ['2026-02-26', '2025-06-01', '2024-03-07', '2023-01-01', '2022-05-05'], 'newest first by date, not release number');
assert.deepEqual((await waybackChanges(C, rel)).map(x => x.r), [90, 60], 'only versions where the imagery here changed');
mode = 'no-tilemap';
const guess = await waybackChanges(C, rel); assert.equal(guess.length, 5); assert.ok(guess.every(x => x.guessed), 'one a year when the tilemap is down');
mode = 'ok';

const cat = await imageryCatalog(C);
assert.deepEqual(cat.wayback.map(x => [x.release, x.published, x.captured, x.res_m, x.provider]), [[90, '2025-06-01', '2025-01-15', 0.3, 'Maxar'], [60, '2022-05-05', '2021-12-02', 0.3, 'Maxar']]);
assert.deepEqual(cat.naip.map(x => [x.item, x.date, x.style]), [['tx_m_2909536_ne_15_060_20220512', '2022-05-12', 'xyz'], ['tx_m_2909536_ne_15_060_20200901', '2020-09-01', 'xyz']], 'one per year, point furthest from the edge, tile style from tilejson');

// ---- endpoint ----
const { default: imagery, upstream } = await import('../api/imagery.js');
const H = { 'x-forwarded-for': '7.7.7.7' };
let res = mock(); await imagery({ query: { at: '-95.3647,29.7577' }, headers: H }, res);
assert.equal(res.code, 200); assert.equal(res.body.wayback.length, 2); assert.match(res.headers['Cache-Control'], /s-maxage=86400/);
res = mock(); await imagery({ query: { at: '-120,45' }, headers: H }, res); assert.equal(res.code, 400, 'outside the region');
const t = tileOf(C, 18);
res = mock(); await imagery({ query: { src: 'wb', r: '90', ...t }, headers: H }, res);
assert.equal(res.code, 200); assert.equal(res.headers['Content-Type'], 'image/jpeg'); assert.match(res.headers['Cache-Control'], /s-maxage=2592000/);
assert.ok(seen.some(u => u.pathname.endsWith('/tile/90/18/' + t.y + '/' + t.x)), 'wayback tile path is release/z/row/col');
res = mock(); await imagery({ query: { src: 'naip', item: 'tx_m_2909536_ne_15_060_20220512', s: 'xyz', ...t }, headers: H }, res); assert.equal(res.code, 200);
assert.ok(seen.some(u => u.pathname === '/api/data/v1/item/tiles/18/' + t.x + '/' + t.y + '@1x.png' && u.searchParams.get('item') === 'tx_m_2909536_ne_15_060_20220512'));
assert.ok(upstream({ src: 'naip', item: 'x', s: 'tms', z: 18, x: t.x, y: t.y }).error, 'item ids are checked');
assert.ok(upstream({ src: 'naip', item: 'tx_m_2909536_ne_15_060_20220512', ...tileOf(C, 19) }).error, 'NAIP stops at z18');
assert.ok(upstream({ src: 'wb', r: '90', ...tileOf(C, 19) }).url, 'Wayback goes to z19');
assert.ok(upstream({ src: 'wb', r: '../x', z: 18, x: t.x, y: t.y }).error);
assert.ok(upstream({ src: 'wb', r: '90', z: 8, x: 1, y: 1 }).error, 'site imagery only, no low zooms');
assert.ok(upstream({ src: 'wb', r: '90', ...tileOf([-120, 45], 18) }).outside);
res = mock(); await imagery({ query: { src: 'wb', r: '90', ...t }, headers: { ...H, origin: 'https://evil.example', host: 'fs.example' } }, res); assert.equal(res.code, 403);

console.log('imagery tests passed');
