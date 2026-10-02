// Offline tests for the modeled consumer spending (lib/spending.mjs, build/spending.mjs) with a mocked BLS.
import assert from 'node:assert/strict';
const { parseRange, bracketMap, spendFor, mergeSpending, parseTsv, pickSeries, ceFrom } = await import('../lib/spending.mjs');

assert.deepEqual(parseRange('Less than $15,000'), [0, 14999]);
assert.deepEqual(parseRange('$15,000 to $29,999'), [15000, 29999]);
assert.equal(parseRange('$200,000 and more')[0], 200000); assert.ok(parseRange('$200,000 and more')[1] > 1e9);
assert.equal(parseRange('All Consumer Units'), null);
const RANGES = ['Less than $15,000', '$15,000 to $29,999', '$30,000 to $39,999', '$40,000 to $49,999', '$50,000 to $69,999', '$70,000 to $99,999', '$100,000 to $149,999', '$150,000 to $199,999', '$200,000 and more'];
const R = RANGES.map(parseRange);
assert.deepEqual(bracketMap(R), [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6, 6, 7, 8], 'ACS brackets land in the CE range holding their midpoint');

const ce = { year: 2024, ranges: R, means: { total: [32000, 40000, 48000, 55000, 63000, 76000, 95000, 120000, 180000], fa: [1500, 2000, 2500, 3000, 3400, 4000, 5200, 6800, 10000] }, south: { total: 0.95, fa: 1 } };
const ib = new Array(16).fill(0); ib[0] = 10; ib[15] = 10; // 10 households under $10K, 10 at $200K+
const s = spendFor(ib, ce);
assert.equal(s.hh, 20); assert.equal(s.spend, Math.round((10 * 32000 + 10 * 180000) * 0.95)); assert.equal(s.sph, Math.round(s.spend / 20)); assert.equal(s.sp.fa, 10 * 1500 + 10 * 10000);
assert.equal(spendFor(new Array(16).fill(0), ce), null, 'no households, no estimate');
const m = mergeSpending({ year: 2024, tracts: [{ g: '1', ib }, { g: '2' }] }, ce);
assert.equal(m.spendYear, 2024); assert.equal(m.spendTracts, 1); assert.equal(m.tracts[0].dine, s.sp.fa); assert.equal(m.tracts[1].spend, undefined, 'tracts without brackets untouched');
// survives a JSON round trip (the open top range is finite)
assert.equal(spendFor(ib, JSON.parse(JSON.stringify(ce))).spend, s.spend);

// ---- the BLS catalog + API ----
const tsv = rows => rows.map(r => r.join('\t')).join('\n');
const ITEMS = [['item_code', 'item_text', 'display_level'], ['TOTALEXP', 'Average annual expenditures', '0'], ['FOODAWAY', 'Food away from home', '2'], ['FOODHOME', 'Food at home', '2'], ['HOUSING', 'Housing', '1'], ['HHFURNSH', 'Household furnishings and equipment', '2']];
const DEMO = [['demographics_code', 'demographics_text'], ['LB01', 'All consumer units'], ['LB02', 'Income before taxes'], ['LB13', 'Quintiles of income before taxes'], ['LB05', 'Region of residence']];
const CHARS = [['demographics_code', 'characteristics_code', 'characteristics_text'], ['LB02', '01', 'All Consumer Units'], ...RANGES.map((t, i) => ['LB02', String(i + 2).padStart(2, '0'), t]),
  ['LB05', '01', 'All consumer units'], ['LB05', '04', 'South'], ['LB13', '02', 'Lowest 20 percent']];
const SERIES = [['series_id', 'item_code', 'demographics_code', 'characteristics_code', 'process_code']];
const VAL = {};
for (const [code] of ITEMS.slice(1)) {
  RANGES.forEach((_, i) => { const id = 'CXU' + code + 'LB02' + String(i + 2).padStart(2, '0') + 'M'; SERIES.push([id, code, 'LB02', String(i + 2).padStart(2, '0'), 'M']); VAL[id] = (code === 'TOTALEXP' ? 30000 : 1000) * (i + 1); });
  for (const [ch, f] of [['01', 1], ['04', 0.9]]) { const id = 'CXU' + code + 'LB05' + ch + 'M'; SERIES.push([id, code, 'LB05', ch, 'M']); VAL[id] = 50000 * f; }
}
const picked = pickSeries({ series: parseTsv(tsv(SERIES)), items: parseTsv(tsv(ITEMS)), demographics: parseTsv(tsv(DEMO)), characteristics: parseTsv(tsv(CHARS)), processes: [{ process_code: 'M', process_text: 'Mean' }] });
assert.equal(picked.ranges.length, 9); assert.ok(picked.missing.includes('ap'), 'items not in the catalog are reported');
assert.equal(picked.want.total.ranges[0], 'CXUTOTALEXPLB0202M'); assert.equal(picked.want.total.south, 'CXUTOTALEXPLB0504M');
const ce2 = ceFrom(picked, VAL, 2024);
assert.deepEqual(ce2.means.total.slice(0, 3), [30000, 60000, 90000]); assert.equal(ce2.south.total, 0.9);

let calls = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.host === 'download.bls.gov') {
    assert.match(opts.headers?.['User-Agent'] || '', /FinishesSolutions/, 'BLS wants a descriptive user agent');
    const f = u.pathname.split('/').pop();
    const body = { 'cx.series': SERIES, 'cx.item': ITEMS, 'cx.demographics': DEMO, 'cx.characteristics': CHARS, 'cx.process': [['process_code', 'process_text'], ['M', 'Mean']] }[f];
    return body ? new Response(tsv(body)) : new Response('', { status: 404 });
  }
  if (u.host === 'api.bls.gov') {
    calls++; const b = JSON.parse(opts.body); assert.ok(b.seriesid.length <= 25, 'v1: 25 series a request');
    return Response.json({ status: 'REQUEST_SUCCEEDED', Results: { series: b.seriesid.map(id => ({ seriesID: id, data: [{ year: '2024', period: 'A01', value: String(VAL[id]) }, { year: '2023', period: 'A01', value: '1' }] })) } });
  }
  return new Response('unmocked', { status: 599 });
};
const { buildCE } = await import('../build/spending.mjs');
const built = await buildCE(null, {});
assert.equal(built.year, 2024, 'newest year with the values'); assert.ok(calls >= 2, 'batched'); assert.ok(built.at);
assert.equal(await buildCE(built, {}), built, 'cached for 30 days');
globalThis.fetch = async () => new Response('', { status: 503 });
const old = { ...built, at: '2020-01-01T00:00:00Z' };
assert.equal((await buildCE(old, {})).year, 2024, 'BLS down: keeps the cached coefficients');
await assert.rejects(buildCE(null, {}), 'no cache and BLS down: the build step is skipped');

console.log('spending tests passed');
