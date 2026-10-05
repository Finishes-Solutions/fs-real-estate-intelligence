// Market tab calculations (lib/marketcalc.mjs): pipeline, housing, rents by county, monthly series, "What's moving".
import assert from 'node:assert/strict';
const { pipeline, housing, cityCounties, rents, monthly, movers, addMonths, OUTLIER } = await import('../lib/marketcalc.mjs');

assert.equal(addMonths('2026-01', -1), '2025-12'); assert.equal(addMonths('2025-11', 14), '2027-01');

// ---------- pipeline ----------
const today = '2026-10-05';
const F = [
  { id: 'a', name: 'Hospital tower', county: 'Harris', cost: 300e6, type: 'New', use: 'Medical', ts: '2025-06-01', te: '2027-12-31' },
  { id: 'b', name: 'Office refresh', county: 'Harris', cost: 5e6, type: 'Reno', use: 'Office', ts: '2026-09-01', te: '2026-11-30' },
  { id: 'c', name: 'Warehouse', county: 'Waller', cost: 40e6, type: 'New', use: 'Industrial', ts: '2026-11-15', te: '2027-08-01' }, // starts in 41 days
  { id: 'd', name: 'School wing', county: 'Fort Bend', cost: 20e6, type: 'Addition', use: 'Education', ts: '2027-06-01', te: '2028-06-01' }, // future, not within 90 days
  { id: 'e', name: 'Done store', county: 'Harris', cost: 2e6, type: 'Reno', use: 'Retail', ts: '2024-01-01', te: '2025-01-31' }, // finished
  { id: 'x', name: 'Garth Road Reconstruction', county: 'Harris', cost: 6.49e9, type: 'New', use: 'Government', ts: '2025-07-01', te: '2028-04-30' }, // mis-entered
  { id: 'n', name: 'No dates', county: 'Harris', cost: 1e6, type: 'New', use: 'Retail' }
];
const p = pipeline(F, { today, since: '2020-01-01' });
assert.deepEqual([p.active.n, p.active.v], [2, 305e6], 'hospital + office under construction, the $6.5B outlier left out');
assert.deepEqual(p.outliers.map(o => o.name), ['Garth Road Reconstruction']); assert.ok(OUTLIER < 6.49e9);
assert.deepEqual([p.starting.n, p.starting.v, p.starting.list[0].id], [1, 40e6, 'c'], 'starting within 90 days');
assert.deepEqual([p.upcoming.n, p.upcoming.v], [2, 60e6]);
assert.equal(p.months.length, 37); assert.equal(p.months[0].m, '2024-10'); assert.equal(p.months.at(-1).m, '2027-10');
const oct = p.months.find(r => r.m === '2026-10'), dec = p.months.find(r => r.m === '2026-12'), past = p.months.find(r => r.m === '2024-12');
assert.deepEqual([oct.New, oct.Reno, oct.n, oct.future], [300e6, 5e6, 2, false]);
assert.deepEqual([dec.New, dec.Reno, dec.future], [340e6, 0, true], 'December: hospital + warehouse, office finished');
assert.equal(past.Reno, 2e6, 'a job finished last year still shows in its months');
assert.deepEqual(p.byUse.map(u => u.name), ['Medical', 'Office']); assert.equal(p.byUse[0].list[0].id, 'a');
assert.deepEqual(p.largest.map(f => f.id), ['a', 'b']);
assert.ok(p.change > 0, 'more under construction than a year ago');
assert.equal(pipeline(F, { today, since: '2024-11-01' }).change, null, 'no year-on-year change while the filing list is too young to compare');
assert.equal(pipeline(F, { today }).change, null, 'nor without knowing when it starts');
const w = pipeline(F, { today, counties: new Set(['Waller']) });
assert.deepEqual([w.active.n, w.starting.n, w.outliers.length], [0, 1, 0], 'county filter');

// ---------- housing ----------
const ib = (a) => { const x = new Array(16).fill(0); a.forEach(([i, n]) => x[i] = n); return x; };
const tr = [{ pop: 1000, hu: 400, vac: 40, inc: 60000, val: 250000, rent: 1200, age: 35, gr: 10, ib: ib([[0, 50], [10, 150], [15, 160]]) },
  { pop: 3000, hu: 1100, vac: 100, inc: 90000, val: 350000, rent: 1500, age: 38, gr: 5, ib: ib([[12, 600], [14, 400]]) }];
const h = housing(tr);
assert.equal(h.households, 1360); assert.ok(h.median_household_income_approx > 60000 && h.median_household_income_approx < 90000);
assert.deepEqual(h.income.map(b => b.n), [50, 0, 150, 0, 600, 400, 160], 'brackets folded into bands');
assert.ok(Math.abs(h.income.reduce((a, b) => a + b.pct, 0) - 100) < 1e-9);
assert.equal(housing([]), null);

// ---------- rents by county ----------
const sq = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const cc = cityCounties([['Waller', -95.93, 30.06], ['Katy', -95.82, 29.79], ['Nowhere', -90, 30]], [{ name: 'Waller', geom: sq(-96.2, 29.95, -95.7, 30.3) }, { name: 'Harris', geom: sq(-95.9, 29.5, -94.9, 29.95) }]);
assert.deepEqual(cc, { Waller: 'Waller', Katy: 'Harris' });
const Z = { 77484: { rent: 1600, yoy: 2, month: '2026-08', city: 'Waller', metro: 'Houston-The Woodlands-Sugar Land, TX' },
  77494: { rent: 1933, yoy: -2.1, month: '2026-08', city: 'Katy', metro: 'Houston-The Woodlands-Sugar Land, TX' },
  77002: { rent: 2100, yoy: 1, month: '2026-08', city: 'Houston', metro: 'Houston-The Woodlands-Sugar Land, TX' },
  75001: { rent: 1563, yoy: 0, month: '2026-08', city: 'Addison', metro: 'Dallas-Fort Worth-Arlington, TX' } };
const all = rents(Z, { cityCounty: cc });
assert.deepEqual(all.rows.map(r => r.zip), ['77002', '77494', '77484'], 'Houston metro only, dearest first'); assert.equal(all.typical, 1933); assert.equal(all.yoy, 1);
assert.deepEqual(rents(Z, { counties: new Set(['Harris']), cityCounty: cc }).rows.map(r => r.zip), ['77002', '77494'], 'Houston counts as Harris');
assert.equal(rents(Z, { counties: new Set(['Grimes']), cityCounty: cc }), null);

// ---------- monthly series ----------
const m = monthly({ months: { start: '2024-01', v: Array.from({ length: 25 }, (_, i) => 100 + i) } }, 13);
assert.equal(m.pts.length, 13); assert.equal(m.last.m, '2026-01'); assert.ok(Math.abs(m.yoy - (124 / 112 - 1) * 100) < 1e-9); assert.equal(m.chg, 12);
assert.equal(monthly(null), null);

// ---------- what's moving ----------
assert.deepEqual(movers([{ text: 'a', score: 3 }, { text: 'b', score: -40 }, { text: 'c', score: NaN }, null, { text: 'd', score: 12 }], 2).map(x => x.text), ['b', 'd']);
console.log('market calc ok');
