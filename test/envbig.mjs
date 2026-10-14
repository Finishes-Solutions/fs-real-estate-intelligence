// Environmental report for sites of any size, against a fake ArcGIS world (no network): exact counts from id lists,
// on-site vs nearby, lists capped at 1,000 with the rest in the full export, type breakdowns from statistics, the
// circle fallback for a service that can't search around a polygon, retrying one source, and the time budget.
import assert from 'node:assert/strict';
import { KINDS, distanceMi } from '../lib/env.mjs';

// a ~9 x 7 mile box (about 63 sq mi) in NW Houston
const W = -95.66, E = -95.51, S = 29.84, N = 29.94;
const site = { type: 'Polygon', coordinates: [[[W, S], [E, S], [E, N], [W, N], [W, S]]] };
// fake records: a grid of PST (tank) sites inside the box (3,000 of them) plus a ring just outside it, one LPST outside,
// and a few wells
const world = { pst: [], lpst: [], wells: [] };
let id = 1;
for (let i = 0; i < 60; i++) for (let j = 0; j < 50; j++) world.pst.push({ id: id++, x: W + 0.001 + i * (E - W - 0.002) / 59, y: S + 0.001 + j * (N - S - 0.002) / 49, name: 'TANK ' + id });
for (let i = 0; i < 40; i++) world.pst.push({ id: id++, x: W + i * (E - W) / 40, y: N + 0.1 / 69.17, name: 'NEARBY TANK ' + i }); // 0.1 mi north
world.pst.push({ id: id++, x: E + 2 / 60, y: S, name: 'FAR TANK' }); // ~2 mi east: outside 0.25 mi
world.lpst.push({ id: id++, x: E + 0.3 / 60, y: (S + N) / 2, name: 'LEAKY GAS' }); // ~0.3 mi east
for (let i = 0; i < 1500; i++) world.wells.push({ id: id++, x: W + 0.01 + (i % 50) * 0.002, y: S + 0.01 + Math.floor(i / 50) * 0.002, name: i % 3 ? 'Plugged Oil Well' : 'Dry Hole' });

const kindOf = url => Object.keys(KINDS).find(k => url.startsWith(KINDS[k].url + '/'));
const calls = []; let noDistance = new Set(), slow = false;
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('SDMDataAccess')) { const q = JSON.parse(opts.body).query; calls.push(['soils', q.includes('share_area')]);
    return Response.json({ Table: [['mukey', 'muname', 'drclassdcd', 'hydgrpdcd', 'flodfreqdcd', 'pondfreqprs', 'engdwbll', 'engdwobdcd', 'engsldcd', 'wtdepannmin', ...(q.includes('share_area') ? ['share_area'] : [])],
      ['1', 'Katy fine sandy loam', 'Moderately well drained', 'C', 'None', '1', 'x', 'x', 'Somewhat limited', null, ...(q.includes('share_area') ? ['0.003'] : [])],
      ['2', 'Addicks loam', 'Poorly drained', 'D', 'None', '1', 'x', 'x', 'Very limited', null, ...(q.includes('share_area') ? ['0.001'] : [])]] }); }
  const kind = kindOf(url); if (!kind) return new Response('no', { status: 404 });
  const p = Object.fromEntries(new URLSearchParams(opts.body)), K = KINDS[kind], pts = world[kind] || [];
  calls.push([kind, p.returnIdsOnly ? 'ids' : p.objectIds ? 'byid' : p.outStatistics ? 'stats' : 'other', p.distance]);
  if (slow) await new Promise(r => setTimeout(r, 300));
  if (p.geometryType === 'esriGeometryPolygon' && p.distance && noDistance.has(kind)) return Response.json({ error: { code: 400, message: 'Query with distance is not supported' } });
  const within = mi => pts.filter(r => (distanceMi(site, { x: r.x, y: r.y }) ?? 99) <= mi + 1e-9);
  const feat = r => ({ attributes: { [K.f.id || 'OBJECTID']: r.id, [K.f.name]: r.name, OBJECTID: r.id }, ...(p.returnGeometry === 'false' ? {} : { geometry: { x: r.x, y: r.y } }) });
  if (p.returnIdsOnly) return Response.json({ objectIdFieldName: 'OBJECTID', objectIds: within(+p.distance || 0).map(r => r.id) });
  if (p.objectIds) { const want = new Set(p.objectIds.split(',').map(Number)); return Response.json({ features: pts.filter(r => want.has(r.id)).map(feat) }); }
  if (p.outStatistics) { const by = {}; for (const r of within(+p.distance)) by[r.name] = (by[r.name] || 0) + 1; return Response.json({ features: Object.entries(by).map(([k, n]) => ({ attributes: { [K.f.name.split('.').pop()]: k, n } })) }); }
  if (p.geometryType === 'esriGeometryPolygon' && p.outFields) { const w = within(+p.distance || 0); return Response.json({ features: w.slice(0, 1000).map(feat), exceededTransferLimit: w.length > 1000 || undefined }); }
  if (p.geometryType === 'esriGeometryPoint') { const all = pts.slice(0, 1000); return Response.json({ features: all.map(feat), exceededTransferLimit: pts.length > 1000 }); }
  return Response.json({ features: [] });
};
const { envReport, kindReport, limiter, default: handler } = await import('../api/env.js');
const { siteExtent } = await import('../lib/env.mjs');

// big site, every source: no size refusal, exact counts
let d = await envReport(site, { label: 'NW Houston box' });
assert.ok(d.area_sqmi > 50, 'area ' + d.area_sqmi);
const pst = d.kinds.pst;
assert.equal(pst.count, 3040, 'every tank within ¼ mi counted (3,000 on site + 40 just north), the far one not');
assert.equal(pst.onsite, 3000); assert.ok(pst.listed <= 1000 && pst.listed > 0, 'listed ' + pst.listed); assert.ok(!pst.truncated);
assert.equal(pst.nearest[0].mi, 0, 'on-site records come first');
assert.equal(d.kinds.lpst.count, 1); assert.ok(Math.abs(d.kinds.lpst.nearest[0].mi - 0.3) < 0.05 && d.kinds.lpst.nearest[0].dir === 'E', 'small kinds are listed with distance and direction');
assert.equal(d.kinds.wells.count, 1500); assert.deepEqual(d.kinds.wells.by_type, [{ type: 'Plugged Oil Well', n: 1000 }, { type: 'Dry Hole', n: 500 }], 'well types from the service statistics');
assert.ok(Array.isArray(d.soils.list) && d.soils.list[0].pct === 75 && d.soils.list[1].pct === 25, 'soils by share of the site for a large area');
assert.ok(calls.some(c => c[0] === 'soils' && c[1] === true));
for (const [k, v] of Object.entries(d.kinds)) assert.ok(!v.error, k + ': ' + v.error);
// no single ArcGIS request asks for more than 400 records by id
assert.ok(calls.filter(c => c[1] === 'byid').length >= 3);
// a source with few records: one request, no id lists
assert.ok(!calls.some(c => c[0] === 'lpst' && (c[1] === 'ids' || c[1] === 'byid')), 'lpst answered in one request');
assert.equal(calls.filter(c => c[0] === 'lpst').length, 1);

// the full list for the export: every tank, sorted nearest first (all on site, then the 40 nearby)
const r = await kindReport('pst', site, siteExtent(site), { full: true });
assert.equal(r.total, 3040); assert.equal(r.rows.length, 3040); assert.equal(r.rows.at(-1).mi > 0, true); assert.equal(r.next, null);
// in pages: every record exactly once
{ const got = []; for (let offset = 0; offset != null;) { const p = await kindReport('pst', site, siteExtent(site), { full: true, offset, page: 1000 }); got.push(...p.rows); offset = p.next; }
  assert.equal(got.length, 3040); assert.equal(new Set(got.map(x => x.id)).size, 3040); }

// a service that can't search around a polygon: the old circle search, marked
noDistance.add('lpst');
d = await envReport(site, { kinds: ['lpst'] });
assert.equal(d.kinds.lpst.method, 'circle'); assert.equal(d.kinds.lpst.count, 1); assert.equal(d.soils, undefined, 'soils only when asked');
noDistance.clear();

// the time budget: a source that can't finish says so instead of holding up the report
slow = true; d = await envReport(site, { kinds: ['pst'], deadline: Date.now() + 400 }); slow = false;
assert.match(d.kinds.pst.error, /didn’t finish in time/);

// limiter: never more than n at once
{ let now = 0, max = 0; const run = limiter(3); await Promise.all(Array.from({ length: 12 }, () => run(async () => { now++; max = Math.max(max, now); await new Promise(r => setTimeout(r, 5)); now--; }))); assert.equal(max, 3); }

// API: kinds / full in the request body
const res = () => { const o = { code: 200, headers: {}, status(c) { o.code = c; return o; }, json(b) { o.body = b; return o; }, setHeader(k, v) { o.headers[k] = v; } }; return o; };
let out = res(); await handler({ method: 'POST', headers: {}, query: {}, body: { geometry: site, kinds: ['pst'], full: true } }, out);
assert.equal(out.code, 200); assert.equal(out.body.kinds.pst.rows.length, 3040); assert.equal(out.body.kinds.pst.next, null);
out = res(); await handler({ method: 'POST', headers: {}, query: {}, body: { geometry: { type: 'Polygon', coordinates: [[[-100, 25], [-90, 25], [-90, 35], [-100, 35], [-100, 25]]] } } }, out);
assert.equal(out.code, 400); assert.match(out.body.error, /larger than 10,000 square miles/);
console.log('environmental big-site tests passed');
