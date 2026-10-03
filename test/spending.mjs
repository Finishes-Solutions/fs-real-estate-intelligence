// Offline tests for the modeled consumer spending (lib/spending.mjs, build/spending.mjs) with a mocked BLS API.
// Numbers are the real 2024 CE values the API returned to GitHub Actions (build/probe-bls.mjs).
import assert from 'node:assert/strict';
const { CATS, seriesIds, sid, ceFrom, interp, spendFor, mergeSpending } = await import('../lib/spending.mjs');

const INC = [16658, 42925, 74474, 121548, 264510], TOT = [35046, 50054, 66900, 89972, 150342];
const VAL = {};
['02', '03', '04', '05', '06'].forEach((q, i) => {
  VAL[sid('INCBEFTX', 'LB01', q)] = INC[i];
  for (const [k, , item] of CATS) VAL[sid(item, 'LB01', q)] = k === 'total' ? TOT[i] : Math.round(TOT[i] / 20);
});
for (const [k, , item] of CATS) { VAL[sid(item, 'LB11', '01')] = k === 'total' ? 78535 : 4000; VAL[sid(item, 'LB11', '04')] = k === 'total' ? 70376 : 3600; }

const ids = seriesIds();
assert.equal(ids.length, 5 + CATS.length * 7, 'income + each category × (5 quintiles, South, all)');
assert.ok(ids.includes('CXUTOTALEXPLB0102M') && ids.includes('CXUTOTALEXPLB1104M') && ids.includes('CXUINCBEFTXLB0106M'));
const ce = ceFrom(VAL, 2024);
assert.deepEqual(ce.inc, INC); assert.deepEqual(ce.means.total, TOT);
assert.equal(ce.south.total, 0.896, 'South spends ~10% less than the US average'); assert.equal(ce.south.fa, 0.9);
assert.equal(ceFrom({ ...VAL, [sid('INCBEFTX', 'LB01', '04')]: 10 }, 2024), null, 'income must rise across quintiles');
assert.equal(ceFrom({ ...VAL, [sid('TOTALEXP', 'LB01', '06')]: 1 }, 2024), null, 'total spending must rise across quintiles');
assert.ok(ceFrom({ ...VAL, [sid('APPAREL', 'LB01', '03')]: undefined }, 2024).means.ap === undefined, 'a missing category is left out, not guessed');

// reading between quintiles
assert.equal(interp(INC, TOT, 5000), TOT[0], 'below the lowest quintile: flat');
assert.equal(interp(INC, TOT, 1e7), TOT[4], 'above the highest: flat');
assert.equal(interp(INC, TOT, 74474), 66900, 'at a quintile point');
assert.ok(Math.abs(interp(INC, TOT, (42925 + 74474) / 2) - (50054 + 66900) / 2) < 1, 'halfway between two quintiles');

const ib = new Array(16).fill(0); ib[0] = 10; ib[15] = 10; // 10 households under $10K, 10 at $200K+
const s = spendFor(ib, ce);
assert.equal(s.hh, 20); assert.equal(s.spend, Math.round((10 * 35046 + 10 * 150342) * 0.896)); assert.equal(s.sph, Math.round(s.spend / 20));
const mid = new Array(16).fill(0); mid[11] = 1; // one household at $75K–$99,999 (midpoint ~$87.5K)
const m1 = spendFor(mid, ce).spend; assert.ok(m1 > 66900 * 0.896 && m1 < 89972 * 0.896, 'between the 3rd and 4th quintile: ' + m1);
assert.equal(spendFor(new Array(16).fill(0), ce), null, 'no households, no estimate');
const m = mergeSpending({ year: 2024, tracts: [{ g: '1', ib }, { g: '2' }] }, ce);
assert.equal(m.spendYear, 2024); assert.equal(m.spendTracts, 1); assert.equal(m.tracts[0].dine, s.sp.fa); assert.equal(m.tracts[1].spend, undefined, 'tracts without brackets untouched');
assert.equal(spendFor(ib, JSON.parse(JSON.stringify(ce))).spend, s.spend, 'survives a JSON round trip');

// ---- the build step against a mocked BLS API (no flat files: download.bls.gov refuses cloud servers) ----
let calls = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  assert.notEqual(u.host, 'download.bls.gov', 'the build must not depend on the flat-file catalog');
  if (u.host === 'api.bls.gov') {
    calls++; const b = JSON.parse(opts.body); assert.ok(b.seriesid.length <= 25, 'v1: 25 series a request');
    assert.match(opts.headers?.['User-Agent'] || '', /FinishesSolutions/, 'descriptive user agent');
    return Response.json({ status: 'REQUEST_SUCCEEDED', Results: { series: b.seriesid.map(id => ({ seriesID: id, data: VAL[id] == null ? [] : [{ year: '2024', period: 'A01', value: String(VAL[id]) }, { year: '2023', period: 'A01', value: '1' }] })) } });
  }
  return new Response('unmocked', { status: 599 });
};
const { buildCE } = await import('../build/spending.mjs');
const built = await buildCE(null, {});
assert.equal(built.year, 2024, 'newest year with the values'); assert.equal(calls, Math.ceil(ids.length / 25), 'batched'); assert.ok(built.at);
assert.deepEqual(built.inc, INC);
assert.equal(await buildCE(built, {}), built, 'cached for 30 days');
assert.ok((await buildCE({ year: 2023, ranges: [], means: {}, at: new Date().toISOString() }, {})).inc, 'an old range-format cache is rebuilt');
globalThis.fetch = async () => new Response('', { status: 503 });
const old = { ...built, at: '2020-01-01T00:00:00Z' };
assert.equal((await buildCE(old, {})).year, 2024, 'BLS down: keeps the cached coefficients');
await assert.rejects(buildCE(null, {}), 'no cache and BLS down: the build step is skipped');

console.log('spending tests passed');
