// Offline tests for the Markets data (lib/markets.mjs, build/markets.mjs) and the correlation explorer maths (lib/correlate.mjs).
import assert from 'node:assert/strict';
const { SERIES, BY_ID, GROUPS, monthly, summarize, parseYahoo, parseFred, yahooPrice } = await import('../lib/markets.mjs');
const { correlate, scan, describe, pValue, transform, fromMonths, fromObject, addMonths, pearson } = await import('../lib/correlate.mjs');
const { buildMarkets } = await import('../build/markets.mjs');

// catalog
assert.equal(new Set(SERIES.map(s => s.id)).size, SERIES.length, 'unique ids');
assert.ok(SERIES.every(s => GROUPS.some(g => g[0] === s.group)), 'every series in a group');
assert.ok(['btc', 'eth', 'xom', 'itb', 'dcoilwtico', 'hous448bpprivsa', 'spx'].every(id => BY_ID.has(id)));
// parsing and monthly values
assert.deepEqual(parseFred('observation_date,X\n2026-01-02,5.1\n2026-01-03,.\n2026-02-01,6'), [['2026-01-02', 5.1], ['2026-02-01', 6]]);
const yj = { chart: { result: [{ meta: { gmtoffset: -18000, regularMarketPrice: 12, regularMarketTime: 1791000000, chartPreviousClose: 11 }, timestamp: [1767387600, 1767474000], indicators: { quote: [{ close: [10, null] }] } }] } };
assert.deepEqual(parseYahoo(yj), [['2026-01-02', 10]]); assert.equal(yahooPrice(yj).price, 12);
assert.deepEqual(monthly([['2026-01-02', 1], ['2026-01-30', 3], ['2026-03-01', 5]]), { start: '2026-01', v: [2, null, 5] }, 'gaps kept as null');
assert.deepEqual(monthly([['2026-01-02', 1], ['2026-01-30', 3]], 'last').v, [3]);
const sm = summarize(BY_ID.get('xom'), [['2025-01-02', 100], ['2026-01-02', 120], ['2026-01-05', 126]], Date.parse('2026-01-06'));
assert.deepEqual([sm.value, sm.chg, sm.yr, sm.chgYr, sm.recent.t.length], [126, 5, 100, 26, 3]);
console.log('markets catalog ok');

// statistics
assert.ok(Math.abs(pValue(.5, 30) - .0049) < .0005, 'p for r=.5, n=30: ' + pValue(.5, 30));
assert.ok(Math.abs(pValue(.3, 50) - .034) < .003, 'p for r=.3, n=50: ' + pValue(.3, 50));
assert.equal(pValue(0, 20), 1);
assert.equal(addMonths('2025-11', 3), '2026-02'); assert.equal(addMonths('2026-01', -1), '2025-12');
assert.deepEqual([...transform(new Map([['2025-01', 100], ['2026-01', 110]]), 'yoy')], [['2026-01', 10]]);
assert.deepEqual([...transform(new Map([['2025-01', 4], ['2026-01', 4.5]]), 'yoy', { diff: true })], [['2026-01', .5]], 'rates: point change');
assert.equal(fromMonths({ start: '2025-11', v: [1, null, 3] }).get('2026-01'), 3); assert.equal(fromObject({ '2026-02': 2, '2026-01': '1', bad: 3 }).size, 2);

// a seeded random walk
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - .5; };
const walk = (n, s = 1) => { let v = 100; return Array.from({ length: n }, () => (v *= 1 + rnd() * .06 * s)); };
const toMap = (arr, start = '2016-01') => new Map(arr.map((v, i) => [addMonths(start, i), v]));
// B leads A by 3 months
const b = walk(130), a = b.map((v, i) => (b[i - 3] ?? b[0]) * (1 + rnd() * .01));
const res = correlate(toMap(a), toMap(b));
assert.equal(res.lag, 3, 'finds the 3-month lead'); assert.ok(res.r > .8, 'r ' + res.r); assert.equal(res.verdict, 'strong'); assert.ok(res.neff < res.n, 'overlapping changes: fewer independent points');
assert.match(describe(res, { a: 'Permits', b: 'Oil' }), /Oil leading by 3 months.*doesn’t show that one causes/);
// unrelated random walks: almost never called a relationship (the corrections at work)
let called = 0; for (let k = 0; k < 40; k++) { const r2 = correlate(toMap(walk(120)), toMap(walk(120))); if (r2.strength > 0) called++; }
assert.ok(called <= 3, called + ' of 40 unrelated pairs called related');
// raw levels of two trending series correlate; the change-based comparison doesn't
const up1 = Array.from({ length: 120 }, (_, i) => 100 * 1.01 ** i * (1 + rnd() * .04)), up2 = Array.from({ length: 120 }, (_, i) => 50 * 1.015 ** i * (1 + rnd() * .04));
assert.ok(pearson(up1, up2) > .9, 'levels look related'); assert.equal(correlate(toMap(up1), toMap(up2)).strength, 0, 'their changes are not');
assert.equal(correlate(toMap([1, 2, 3]), toMap([1, 2, 3])).verdict, 'not enough overlap');
// scan: the planted relationship ranks first and the others are discounted for the number of tests
const sc = scan(toMap(a), [{ id: 'noise1', map: toMap(walk(130)) }, { id: 'lead', map: toMap(b) }, { id: 'noise2', map: toMap(walk(130)) }]);
assert.equal(sc.results[0].id, 'lead'); assert.equal(sc.tests, 75); assert.equal(sc.reliable, 1);
console.log('correlation ok');

// the nightly build: a failing source keeps last night's numbers, marked stale
const fake = async url => { if (url.includes('XOM')) throw new Error('blocked'); return { json: async () => yj, text: async () => 'observation_date,X\n2026-01-02,5' }; };
const m = await buildMarkets({ series: { xom: { id: 'xom', value: 99 } } }, fake);
assert.equal(m.series.xom.stale, true); assert.equal(m.series.xom.value, 99); assert.ok(m.errors.some(e => /^xom:/.test(e))); assert.equal(m.series.itb.value, 10);
console.log('markets build ok');
