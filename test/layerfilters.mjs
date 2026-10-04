// Offline tests for the Filters panel's layer filters: thresholds and matching (lib/screen.mjs), the per-tract busiest
// road and flood rating the nightly build adds (build/tractrisk.mjs), and the high-risk-only flood tiles (api/fema.js).
import assert from 'node:assert/strict';
import { CRITERIA, active, tractPasses, tractExpr, optLabel, describeScreen } from '../lib/screen.mjs';
import { maxAadtByTract, floodScore, addTractRisk } from '../build/tractrisk.mjs';

// thresholds
const t = { g: '1', inc: 90000, gr: 6.2, val: 310000, rent: 1400, vacr: 7.5, jobs: 1200, aadt: 30000, fl: 2 };
assert.equal(tractPasses(t, {}), true, 'nothing set: everything matches');
assert.equal(tractPasses(t, { inc: 75000, gr: 5, vacr: 8, aadt: 25000, fl: 2 }), true);
assert.equal(tractPasses(t, { inc: 100000 }), false, 'income below');
assert.equal(tractPasses(t, { vacr: 5 }), false, 'vacancy above the maximum');
assert.equal(tractPasses(t, { fl: 1 }), false, 'flood rating above the maximum');
assert.equal(tractPasses({ ...t, inc: null }, { inc: 50000 }), false, 'no data is not a match');
assert.equal(tractPasses(t, { inc: 100000, gr: 5 }, ['gr']), true, 'only the keys asked for');
assert.equal(tractPasses({ ...t, proj: 0 }, { proj: 'none' }), true); assert.equal(tractPasses({ ...t, proj: 6 }, { proj: '5+' }), true); assert.equal(tractPasses({ ...t, proj: 4 }, { proj: '5+' }), false);
assert.deepEqual(active({ inc: 75000, gr: '', aadt: null }).map(([c]) => c.k), ['inc']);
// the same test as a map expression
assert.equal(tractExpr({}), null);
assert.deepEqual(tractExpr({ inc: 75000, vacr: 8, proj: '1+' }), ['all', ['>=', ['coalesce', ['get', 'inc'], -1e15], 75000], ['<=', ['coalesce', ['get', 'vacr'], 1e15], 8]]);
assert.deepEqual(tractExpr({ inc: 75000, aadt: 25000 }, ['inc']), ['all', ['>=', ['coalesce', ['get', 'inc'], -1e15], 75000]]);
// labels
const by = k => CRITERIA.find(c => c.k === k);
assert.equal(optLabel(by('inc'), 75000), 'At least $75K'); assert.equal(optLabel(by('vacr'), 8), 'At most 8%'); assert.equal(optLabel(by('rent'), 1500), 'At least $1,500/mo');
assert.equal(optLabel(by('aadt'), 25000), 'At least 25,000 cars/day'); assert.equal(optLabel(by('fl'), 2), 'Relatively low or lower'); assert.equal(optLabel(by('proj'), 'none'), 'None');
assert.equal(describeScreen({ inc: 75000, aadt: 25000 }), 'Median household income: at least $75K · Busiest road: at least 25,000 cars/day');
assert.ok(CRITERIA.every(c => c.opts.length && c.label && c.group), 'every criterion has options, a label and a section');

// busiest road per tract: a segment counts for every tract one of its vertices falls in
const sq = (x0, y0) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x0 + 1, y0], [x0 + 1, y0 + 1], [x0, y0 + 1], [x0, y0]]] });
const tracts = [{ g: 'A', geom: sq(0, 0) }, { g: 'B', geom: sq(1, 0) }, { g: 'C', geom: sq(5, 5) }];
const m = maxAadtByTract(tracts, [{ aadt: 12000, paths: [[[0.2, 0.5], [0.8, 0.5]]] }, { aadt: 40000, paths: [[[0.9, 0.2], [1.5, 0.2]]] }, { aadt: 9000, paths: [[[1.2, 0.8], [1.4, 0.8]]] }]);
assert.deepEqual(m, { A: 40000, B: 40000, C: 0 });
// flood rating: the higher of riverine and coastal
assert.equal(floodScore({ RFLD_RISKR: 'Relatively Low', CFLD_RISKR: 'Very High' }), 5); assert.equal(floodScore({ RFLD_RISKR: 'Relatively Moderate' }), 3);
assert.equal(floodScore({ RFLD_RISKR: 'No Rating' }), null); assert.equal(floodScore(null), null);

// the build step, against mocked TxDOT and FEMA services
const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)), b = new URLSearchParams(opts.body || ''); calls.push(u.pathname);
  if (u.pathname.includes('TxDOT_AADT')) return Response.json({ features: +b.get('resultOffset') ? [] : [{ attributes: { AADT_CUR: 55000 }, geometry: { paths: [[[0.5, 0.5], [0.6, 0.6]]] } }] });
  if (u.pathname.includes('National_Risk_Index')) return Response.json({ features: [{ attributes: { TRACTFIPS: 'A', RFLD_RISKR: 'Very High' } }, { attributes: { TRACTFIPS: 'B', RFLD_RISKR: 'Very Low' } }] });
  return new Response('x', { status: 404 });
};
const market = { tracts: tracts.map(x => ({ ...x })) };
await addTractRisk(market, [0, 0, 6, 6], { now: Date.parse('2026-10-04') });
assert.deepEqual(market.tracts.map(x => [x.g, x.aadt, x.fl]), [['A', 55000, 5], ['B', null, 1], ['C', null, null]]);
assert.equal(market.riskBuilt, '2026-10-04T00:00:00.000Z');
const before = calls.length; await addTractRisk(market, [0, 0, 6, 6], { now: Date.parse('2026-10-20') }); assert.equal(calls.length, before, 'fresh for 30 days: no refetch');
await addTractRisk(market, [0, 0, 6, 6], { now: Date.parse('2026-11-10') }); assert.ok(calls.length > before, 'refreshed after 30 days');

// flood tiles: high-risk only adds a layer definition to FEMA's request
const seen = [];
globalThis.fetch = async url => { seen.push(new URL(String(url))); return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } }); };
const { default: fema } = await import('../api/fema.js');
const call = async query => { const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } }; await fema({ query, headers: { host: 'x' } }, res); return res; };
await call({ tile: '12/958/1693' }); assert.equal(seen.at(-1).searchParams.get('layerDefs'), null);
await call({ tile: '12/958/1693', cls: 'high' }); assert.equal(seen.at(-1).searchParams.get('layerDefs'), JSON.stringify({ 28: "SFHA_TF = 'T'" }));
console.log('layer filters ok');
