// Offline tests for the budget roll-up ported from fs-budgeting-suite (origin/feature @ 4187c8c):
// lib/feasibility/rollup.mjs, csi.mjs, guardrails.mjs, impactfees.mjs and the data modules in lib/feasibility/data/.
// Ports of the source's test/budget-calc.test.js, calculations.test.js, sov.test.js, guardrails.test.js,
// impact-fees.test.js and input-defaults.test.js, followed by new checks: the default multifamily budget built from
// the template and pricing data, CSI reconciliation, and the circular-fee closed form. Expected values are worked by
// hand or taken from the source's own published figures, not from the code under test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const R = await import('../lib/feasibility/rollup.mjs');
const C = await import('../lib/feasibility/csi.mjs');
const G = await import('../lib/feasibility/guardrails.mjs');
const IF = await import('../lib/feasibility/impactfees.mjs');
const { PRICING } = await import('../lib/feasibility/data/fs-pricing-2026-08.mjs');
const { MF_TEMPLATE, TEMPLATE_DEFAULT } = await import('../lib/feasibility/data/fs-mf-template.mjs');
const { TX_WALLER } = await import('../lib/feasibility/data/fees-tx-waller.mjs');
const fixture = name => JSON.parse(readFileSync(new URL('./fixtures/fz/budget/' + name, import.meta.url), 'utf8'));

let checks = 0;
const test = (name, fn) => { try { fn(); checks++; } catch (e) { e.message = name + ' — ' + e.message; throw e; } };
const clone = o => JSON.parse(JSON.stringify(o));
const cents = n => Math.round(n * 100) / 100;
const close = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${msg || ''}: ${a} vs ${b}`);
const { nz, totUnits, lineQty, scopeSum, scopeActive, parts, grossIncome, expenseMonthly, sovRows, qtyOf } = R;

// =====================================================================================================================
// budget-calc.test.js — parts(), grossIncome() and their helpers
// =====================================================================================================================

// A small but complete document exercising every arithmetic branch.
const baseDoc = () => ({
  projectId: 'TST-0001',
  resSF: 100000, amenSF: 5000, siteSF: 200000,
  units: [
    { label: '1BR', count: 40, sf: 700, rent: 1200 },
    { label: '2BR', count: 10, sf: 1000, rent: 1600 }
  ],
  lines: [
    // auto sf: qty = resSF = 100000 → 100000 × 2.50 = 250,000
    { scope: 'res',  grp: 'G', code: '09 29 00', desc: 'Drywall', basis: 'sf',   auto: true,  qty: 0,  unit: 2.50 },
    // auto unit: qty = 50 units → 50 × 800 = 40,000
    { scope: 'res',  grp: 'G', code: '10 28 00', desc: 'Accessories', basis: 'unit', auto: true, qty: 0, unit: 800 },
    // manual qty beats basis: 12 × 100 = 1,200
    { scope: 'res',  grp: 'G', code: '12 21 00', desc: 'Blinds', basis: 'unit', auto: false, qty: 12, unit: 100 },
    // amenity, auto asf: 5000 × 4 = 20,000
    { scope: 'amen', grp: 'G', code: '09 68 00', desc: 'Carpet', basis: 'asf',  auto: true,  qty: 0,  unit: 4 },
    // amenity lump-sum (basis 'ls' falls through to qty 1): 15,000
    { scope: 'amen', grp: 'G', code: '11 40 00', desc: 'Kitchen', basis: 'ls',  auto: true,  qty: 0,  unit: 15000 },
    // soft costs: 25,000
    { scope: 'soft', grp: 'Eng', code: 'SC-01', desc: 'Civil', basis: 'ls', auto: true, qty: 0, unit: 25000 }
  ],
  companies: [{ name: 'A', pct: 5 }, { name: 'B', pct: 2.5 }],
  contingency: { mode: 'pct', val: 2 },
  projectCosts: { land: 1200000, dev: 200000, mkt: 75000, cls: 25000 },
  other: [{ label: 'Parking', rate: 25, auto: true, count: 0 },
          { label: 'Storage', rate: 40, auto: false, count: 10 }],
  expenses: [{ label: 'Trash', per: 'unit', rate: 12, auto: true, count: 0 },
             { label: 'Internet', per: 'fixed', rate: 500, auto: false, count: 2 }]
});

// Hand-computed: res = 250000+40000+1200 = 291200; amen = 20000+15000 = 35000
// hard = 326200; profit = 326200×7.5% = 24465; cont = 326200×2% = 6524
// contract = 357189; soft = 25000; fees = 300000; project = 357189+25000+1200000+300000 = 1882189
test('parts: every component on the base document', () => {
  const p = parts(baseDoc());
  assert.equal(p.res, 291200);
  assert.equal(p.amen, 35000);
  assert.equal(p.hard, 326200);
  assert.equal(cents(p.profit), 24465);
  assert.equal(cents(p.cont), 6524);
  assert.equal(cents(p.contract), 357189);
  assert.equal(p.soft, 25000);
  assert.equal(p.fees, 300000);
  assert.equal(cents(p.project), 1882189);
});

test('amenity suppression is arithmetic: amenSF=0 removes amenity money everywhere', () => {
  const d = baseDoc(); d.amenSF = 0;
  const p = parts(d);
  assert.equal(p.amen, 0, 'lump-sum and manual amenity lines must stop contributing');
  assert.equal(p.hard, 291200);
  assert.equal(cents(p.profit), 21840);
  assert.equal(cents(p.cont), 5824);
  assert.ok(scopeActive(d, 'res') && !scopeActive(d, 'amen'));
  assert.deepEqual(R.activeScopes(d), ['res', 'soft']);
});

test('contingency modes: psf and fixed', () => {
  const d1 = baseDoc(); d1.contingency = { mode: 'psf', val: 2 };
  assert.equal(parts(d1).cont, (100000 + 5000) * 2);
  const d2 = baseDoc(); d2.contingency = { mode: 'fixed', val: 50000 };
  assert.equal(parts(d2).cont, 50000);
});

test('lineQty basis routing and manual override', () => {
  const d = baseDoc();
  assert.equal(lineQty(d, { auto: true, basis: 'sf' }), 100000);
  assert.equal(lineQty(d, { auto: true, basis: 'asf' }), 5000);
  assert.equal(lineQty(d, { auto: true, basis: 'unit' }), 50);
  assert.equal(lineQty(d, { auto: true, basis: 'ls' }), 1);
  assert.equal(lineQty(d, { auto: false, basis: 'sf', qty: 7 }), 7);
});

test('grossIncome: rent, other (auto and manual), fixed and per-unit expenses', () => {
  const g = grossIncome(baseDoc());
  assert.equal(g.rentMo, 40 * 1200 + 10 * 1600);       // 64,000
  assert.equal(g.otherMo, 25 * 50 + 40 * 10);          // 1,650
  assert.equal(g.expMo, 12 * 50 + 500 * 2);            // 1,600
  assert.equal(g.netOtherMo, 50);
  assert.equal(g.grossYr, 12 * (64000 + 1650));
  assert.equal(g.netYr, 12 * (64000 + 50));
});

test('absent properties coerce to zero, never NaN (old documents)', () => {
  const p = parts({ projectId: 'TST-0002' });
  for (const k of Object.keys(p)) {
    if (k === 'fee') continue;
    assert.ok(Number.isFinite(p[k]), k + ' must be finite');
  }
  for (const k of ['dev', 'mkt', 'cls']) assert.ok(Number.isFinite(p.fee[k]), 'fee.' + k + ' must be finite');
  assert.equal(p.fee.pctRate, null);
  const g = grossIncome({ projectId: 'TST-0002' });
  for (const k of Object.keys(g)) assert.ok(Number.isFinite(g[k]), k + ' must be finite');
  assert.equal(totUnits({}), 0);
  assert.equal(scopeSum({ lines: [{ scope: 'res', auto: false, unit: 10 }] }, 'res'), 0);
  assert.equal(nz('abc'), 0);
  assert.equal(nz('12.5'), 12.5);
});

test('percentage fees resolve against the FINAL total project cost', () => {
  const base = { lines: [{ scope: 'res', basis: 'ls', auto: false, qty: 1, unit: 1000000 }],
                 companies: [], contingency: { mode: 'amt', val: 0 } };
  // A bare number is an older document and reads as dollars.
  const legacy = parts({ ...base, projectCosts: { land: 100000, dev: 200000, mkt: 75000, cls: 0 } });
  assert.equal(legacy.project, 1375000);
  assert.equal(legacy.fees, 275000);
  assert.equal(legacy.fee.pctRate, null);
  // 3% dev + 1% closing means 3% and 1% OF THE PRINTED TOTAL: project = (base+fixed)/(1-f).
  const mixed = parts({ ...base,
    projectCosts: { land: 100000, dev: { mode: 'pct', val: 3 },
                    mkt: { mode: 'amt', val: 75000 }, cls: { mode: 'pct', val: 1 } } });
  assert.ok(Math.abs(mixed.fee.dev / mixed.project - 0.03) < 1e-12, 'dev fee is 3% of the total');
  assert.ok(Math.abs(mixed.fee.cls / mixed.project - 0.01) < 1e-12, 'closing is 1% of the total');
  assert.equal(mixed.fee.mkt, 75000);
  assert.ok(Math.abs((1000000 + 100000 + mixed.fees) - mixed.project) < 1e-6,
    'contract + soft + land + fees reconciles to the total');
  assert.ok(Math.abs(mixed.fee.pctRate - 0.04) < 1e-12);
  // Rates that sum past the floor still render a finite number; the feeSum rail is what refuses the budget.
  const absurd = parts({ ...base,
    projectCosts: { land: 0, dev: { mode: 'pct', val: 99 }, mkt: { mode: 'amt', val: 0 }, cls: { mode: 'amt', val: 0 } } });
  assert.ok(Number.isFinite(absurd.project), 'an over-100% fee rate must not print Infinity');
});

test('percent-of-income expenses are charged off rent + other income', () => {
  const doc = {
    units: [{ sf: 800, count: 10, rent: 1500 }],
    other: [{ rate: 50, count: 0, auto: true }],
    expenses: [{ per: 'pctIncome', rate: 4 }, { per: 'unit', rate: 60, auto: true }]
  };
  const g = grossIncome(doc);
  const incomeMo = 10 * 1500 + 10 * 50;      // 15,500
  assert.equal(g.rentMo, 15000);
  assert.equal(g.otherMo, 500);
  assert.equal(g.expMo, incomeMo * 0.04 + 10 * 60);
  assert.equal(expenseMonthly(doc, doc.expenses[0], incomeMo), incomeMo * 0.04);
  assert.equal(expenseMonthly(doc, doc.expenses[1], incomeMo), 600);
  assert.equal(expenseMonthly(doc, doc.expenses[0]), incomeMo * 0.04, 'no income passed: computed from the document');
});

test('fee helpers: {mode,val} and a bare number', () => {
  assert.equal(R.feeMode({ mode: 'pct', val: 3 }), 'pct'); assert.equal(R.feeMode(5), 'amt'); assert.equal(R.feeMode(null), 'amt');
  assert.equal(R.feeRate({ mode: 'pct', val: 3 }), 0.03); assert.equal(R.feeFixed({ mode: 'pct', val: 3 }), 0);
  assert.equal(R.feeFixed(200000), 200000); assert.equal(R.feeVal({ mode: 'amt', val: '7' }), 7);
  assert.equal(R.FEE_FLOOR, 0.05);
});

// =====================================================================================================================
// calculations.test.js — the reference workbook (Budget For Projects 3.0 MAIN), rates from the pricing data module
// =====================================================================================================================
{
  const rateSum = scope => PRICING.lines.filter(l => l.scope === scope).reduce((t, l) => t + l.unit, 0);
  const near = (a, b, eps = 0.005) => Math.abs(a - b) < eps;
  function compute({ resSF, amenSF, resRate, amenRate, softRate, profitPct, contingencyPsf, land = 0, dev = 0, mkt = 0, cls = 0 }) {
    const res = resSF * resRate, amen = amenSF * amenRate, hard = res + amen;
    const profit = hard * profitPct / 100, cont = (resSF + amenSF) * contingencyPsf;
    const contract = hard + profit + cont, soft = resSF * softRate;
    return { res, amen, hard, profit, cont, contract, soft, project: contract + soft + land + dev + mkt + cls };
  }
  test('the pricing library is 2026.08-v2, 103 lines, with its source', () => {
    assert.equal(PRICING.version, '2026.08-v2'); assert.equal(PRICING.effective, '2026-08-10');
    assert.equal(PRICING.lines.length, 103);
    assert.deepEqual(['res', 'amen', 'soft'].map(s => PRICING.lines.filter(l => l.scope === s).length), [58, 23, 22]);
    for (const k of ['label', 'ref', 'asOf', 'region', 'confidence', 'note']) assert.ok(PRICING.source[k], 'source.' + k);
    assert.equal(PRICING.source.confidence, 'medium-low');
    assert.match(PRICING.source.note, /not a cost database/);
    const keys = new Set(PRICING.lines.map(R.lineKeyOf)); assert.equal(keys.size, 103, 'scope|code|desc is unique');
  });
  test('published library rate sums are stable', () => {
    assert.equal(rateSum('res').toFixed(2), '126.93', 'residential $/SF');
    assert.equal(rateSum('amen').toFixed(2), '125.57', 'amenity $/ASF');
    assert.equal(rateSum('soft').toFixed(3), '18.030', 'soft cost $/SF');
  });
  // The workbook's headline residential rate is $128.93/SF; the library totals $126.93/SF. The $2.00 gap is exactly
  // the default construction contingency, carried explicitly as CSI 99 03 00 rather than blended into trade lines.
  test('residential rate plus the default contingency matches the workbook', () => {
    assert.equal((rateSum('res') + 2).toFixed(2), '128.93');
    assert.ok(near(51365 * (rateSum('res') + 2), 6622489.45), '51,365 SF x $128.93 must equal $6,622,489.45');
  });
  test('workbook reference multiplications reconcile', () => {
    assert.ok(near(51365 * 105.75, 5431848.75));
    assert.ok(near(1203 * 150.57, 181135.71));
    assert.ok(near(51365 * 105.75 + 1203 * 150.57, 5612984.46));
    assert.ok(near(51365 * 18.029, 926059.585, 0.001));
  });
  // The workbook's project cost per SF divides by RESIDENTIAL SF alone (51,365), not by building SF (52,568).
  test('workbook cost per SF uses residential SF as the denominator', () => {
    assert.ok(near(8688625.16 / 169.154583, 51365, 0.01));
    assert.notEqual(Math.round(8688625.16 / 169.154583), 52568);
  });
  test('amenity difference is exactly one $25/ASF project-specific item', () => {
    assert.equal((150.57 - rateSum('amen')).toFixed(2), '25.00');
  });
  test('soft cost difference is display rounding only', () => {
    const delta = Math.abs(18.029 - rateSum('soft'));
    assert.ok(delta <= 0.001, 'rate delta is a tenth of a cent');
    assert.ok(51365 * delta < 60, 'under $60 across the whole project');
  });
  const BASE = { resSF: 51365, amenSF: 1200, resRate: rateSum('res'), amenRate: rateSum('amen'), softRate: rateSum('soft'),
                 profitPct: 12, contingencyPsf: 2, land: 1200000, dev: 200000, mkt: 75000, cls: 0 };
  test('soft costs, land and project costs sit outside the contract sum', () => {
    const c = compute(BASE);
    assert.equal(c.contract, c.hard + c.profit + c.cont);
    assert.ok(c.soft > 0 && c.project - c.contract > c.soft, 'soft sits outside the contract');
    const noLand = compute({ ...BASE, land: 0 });
    assert.equal(c.contract, noLand.contract, 'land must not move the contract sum');
    assert.equal(c.project - noLand.project, BASE.land);
  });
  test('profit is a share of hard cost only; contingency is per SF across both buildings', () => {
    const c = compute(BASE);
    assert.ok(near(c.profit, c.hard * 0.12));
    assert.ok(near(compute({ ...BASE, profitPct: 0 }).profit, 0));
    assert.ok(near(c.cont, (51365 + 1200) * 2));
  });
  test('edge cases: zero SF is zero, zero amenity SF contributes nothing, extremes stay finite', () => {
    const z = compute({ ...BASE, resSF: 0, amenSF: 0, land: 0, dev: 0, mkt: 0, cls: 0 });
    Object.values(z).forEach(v => assert.ok(Number.isFinite(v) && v === 0));
    const a = compute({ ...BASE, amenSF: 0 }); assert.equal(a.amen, 0); assert.equal(a.hard, a.res);
    assert.ok(Number.isFinite(compute({ ...BASE, resSF: -100 }).project));
    assert.ok(Number.isFinite(compute({ ...BASE, resSF: 1e9 }).project));
    const p = compute({ ...BASE, resRate: 1 / 3, resSF: 3, amenSF: 0, profitPct: 0, contingencyPsf: 0, land: 0, dev: 0, mkt: 0, cls: 0 });
    assert.ok(Math.abs(p.res - 1) < 1e-12, 'no premature rounding of the rate');
  });
  test('the hand formula and parts() agree on the template budget', () => {
    const c = compute(BASE), p = parts(R.docFromTemplate(MF_TEMPLATE, PRICING));
    for (const k of ['res', 'amen', 'hard', 'profit', 'cont', 'contract', 'soft', 'project']) close(p[k], c[k], k, 1e-4);
  });
}

// =====================================================================================================================
// sov.test.js — SOV rows agree with parts(): Σ res+amen = hard, Σ soft = soft
// =====================================================================================================================
{
  const doc = amenSF => ({
    resSF: 10000, amenSF,
    units: [{ count: 10 }, { count: 5 }],
    lines: [
      { lineId: 'r1', scope: 'res', grp: 'G', code: '03 30 00', basis: 'sf', auto: true, unit: 5 },
      { lineId: 'r2', scope: 'res', grp: 'G', code: '11 31 00', basis: 'unit', auto: true, unit: 100 },
      { lineId: 'r3', scope: 'res', grp: 'G', code: '12 21 00', basis: 'unit', auto: false, qty: 7, unit: 40 },
      { lineId: 'a1', scope: 'amen', grp: 'A', code: '09 60 00', basis: 'asf', auto: true, unit: 4 },
      // The two shapes suppression exists for: neither follows amenSF to zero.
      { lineId: 'a2', scope: 'amen', grp: 'A', code: '11 40 00', basis: 'ls', auto: false, qty: 1, unit: 15000 },
      { lineId: 'a3', scope: 'amen', grp: 'A', code: '12 50 00', basis: 'unit', auto: false, qty: 3, unit: 900 },
      { lineId: 's1', scope: 'soft', grp: 'S', code: 'SC-01', basis: 'ls', auto: false, qty: 1, unit: 25000 },
      { lineId: 's2', scope: 'soft', grp: 'S', code: 'SC-20', basis: 'ls', auto: false, qty: 1, unit: 637944.36, derived: 'impactFees' }
    ]
  });
  const sum = (rows, scopes) => rows.filter(r => scopes.includes(r.scope)).reduce((s, r) => s + r.total, 0);
  for (const amenSF of [2000, 0]) {
    test(`SOV totals equal parts() with amenity ${amenSF ? 'on' : 'off'}`, () => {
      const d = doc(amenSF), rows = sovRows(d), p = parts(d);
      close(sum(rows, ['res', 'amen']), p.hard, 'res + amen = hard');
      close(sum(rows, ['soft']), p.soft, 'soft = soft');
      close(sum(rows, ['amen']), p.amen, 'amen = amen');
    });
  }
  test('a suppressed amenity line keeps its row, at quantity and total 0', () => {
    const on = sovRows(doc(2000)), off = sovRows(doc(0));
    assert.equal(off.length, on.length, 'no row is dropped');
    assert.deepEqual(off.map(r => r.lineKey), on.map(r => r.lineKey), 'lineKey continuity');
    for (const code of ['09 60 00', '11 40 00', '12 50 00']) {
      const r = off.find(x => x.code === code);
      assert.equal(r.qty, 0, code + ' qty');
      assert.equal(r.total, 0, code + ' total');
      assert.equal(r.rate, on.find(x => x.code === code).rate, code + ' keeps its rate');
    }
    assert.equal(on.find(x => x.code === '11 40 00').total, 15000);
    assert.equal(on.find(x => x.code === '12 50 00').total, 2700);
  });
  test('a line with no auto field is a typed quantity, as lineQty() says', () => {
    const d = { resSF: 10000, amenSF: 0, units: [{ count: 4 }],
      lines: [{ scope: 'res', basis: 'sf', qty: 12, unit: 3 }, { scope: 'res', basis: 'unit', unit: 10 }] };
    const rows = sovRows(d);
    assert.equal(rows[0].qty, 12);
    assert.equal(rows[0].qty, lineQty(d, d.lines[0]));
    assert.equal(rows[1].qty, 0, 'absent auto and absent qty is 0, not the unit count');
    close(sum(rows, ['res', 'amen']), parts(d).hard, 'still equals hard');
  });
  test('string unit counts are numbers, not concatenated', () => {
    const d = { resSF: 0, amenSF: 0, units: [{ count: '10' }, { count: '5' }],
      lines: [{ scope: 'res', basis: 'unit', auto: true, unit: '100' }] };
    const r = sovRows(d)[0];
    assert.equal(r.qty, 15); assert.equal(r.rate, 100); assert.equal(r.total, 1500);
    close(r.total, parts(d).hard, 'equals hard');
  });
  test('qtyOf is lineQty, ignoring the old trailing units argument', () => {
    const d = doc(2000);
    for (const l of d.lines) assert.equal(qtyOf(l, d, 999), lineQty(d, l));
  });
  test('duplicate and missing lineIds fall back to a null key; order is document order', () => {
    const rows = sovRows({ lines: [{ lineId: 'x', scope: 'res' }, { lineId: 'x', scope: 'res' }, { scope: 'soft' }] });
    assert.deepEqual(rows.map(r => r.lineKey), ['x', null, null]);
    assert.deepEqual(rows.map(r => r.lineOrder), [1, 2, 3]);
  });
}

// =====================================================================================================================
// guardrails.test.js — the rails judge only what they can judge. (The source's byte-identity check between its two
// copies has no counterpart: here there is one module.)
// =====================================================================================================================
{
  const healthyDoc = () => ({
    type: 'Multifamily', opexSchemaVersion: 2,
    resSF: 50000, amenSF: 2000, siteSF: 120000,
    units: [{ label: '1BR', sf: 800, count: 50, rent: 1600 }],
    other: [{ label: 'Parking', rate: 40, count: 0, auto: true }],
    // 45% of income: 50×1600 + 50×40 = 82,000/mo income, 36,900/mo expenses
    expenses: [{ label: 'Operations', per: 'pctIncome', rate: 45 }],
    lines: [
      { scope: 'res', basis: 'sf', auto: true, unit: 160 },       // 8,000,000
      { scope: 'soft', basis: 'ls', auto: true, unit: 1000000 }   // 1,000,000
    ],
    companies: [{ name: 'FS', pct: 12 }],
    contingency: { mode: 'pct', val: 3 },
    projectCosts: { land: 2000000, dev: { mode: 'pct', val: 3 }, mkt: { mode: 'pct', val: 1 }, cls: { mode: 'pct', val: 1 } }
  });
  const run = (doc, policy) => { const p = parts(doc); return G.evaluate({ doc, parts: p, gross: grossIncome(doc), fee: p.fee, policy }); };
  const why = r => r.breaches.map(b => b.message).join(' | ');

  test('a healthy multifamily budget clears every rail', () => {
    const r = run(healthyDoc());
    assert.equal(r.blocking, 0, why(r)); assert.equal(r.status, 'ok', why(r));
  });
  test('the 35-55% expense rail blocks a full-schedule budget outside the range', () => {
    const low = healthyDoc(); low.expenses = [{ label: 'Operations', per: 'pctIncome', rate: 20 }];
    const rl = run(low), railLow = rl.breaches.find(b => b.id === 'opexRatio');
    assert.ok(railLow, 'a 20% expense ratio must breach');
    assert.equal(railLow.severity, 'error'); assert.equal(rl.status, 'breach');
    const high = healthyDoc(); high.expenses = [{ label: 'Operations', per: 'pctIncome', rate: 70 }];
    const railHigh = run(high).breaches.find(b => b.id === 'opexRatio');
    assert.ok(railHigh && railHigh.severity === 'error', 'a 70% expense ratio must breach');
  });
  test('a pre-schedule budget warns instead of blocking', () => {
    const old = healthyDoc(); delete old.opexSchemaVersion;
    old.expenses = [{ label: 'Trash', per: 'unit', rate: 60, auto: true }];   // ~3.7% of income
    const r = run(old), rail = r.breaches.find(b => b.id === 'opexRatio');
    assert.ok(rail, 'the ratio is still reported');
    assert.equal(rail.severity, 'warn'); assert.equal(rail.staleSchedule, true);
    assert.equal(r.blocking, 0, 'an existing budget must remain saveable');
  });
  test('a rail with no denominator is not judged, so a blank budget cannot be blocked', () => {
    const r = run({ type: 'Multifamily', opexSchemaVersion: 2 });
    assert.equal(r.blocking, 0); assert.equal(r.status, 'ok');
    assert.equal(r.rails.length, 0, 'nothing is judgeable on an empty document');
  });
  test('an acknowledgement downgrades a blocking rail and carries its reason', () => {
    const doc = healthyDoc(); doc.expenses = [{ label: 'Operations', per: 'pctIncome', rate: 20 }];
    assert.equal(run(doc).blocking, 1);
    doc.guardrailAcks = [{ id: 'opexRatio', reason: 'Ground lease covers taxes and insurance', byId: 'u1', byName: 'M', at: '2026-08-21T00:00:00Z' }];
    const acked = run(doc), rail = acked.breaches.find(b => b.id === 'opexRatio');
    assert.equal(acked.blocking, 0, 'an acknowledged rail no longer blocks');
    assert.equal(rail.severity, 'warn'); assert.equal(rail.acked, true);
    assert.equal(rail.ackReason, 'Ground lease covers taxes and insurance');
    doc.guardrailAcks = [{ id: 'opexRatio', reason: '   ' }];
    assert.equal(run(doc).blocking, 1, 'an ack with no reason is not an acknowledgement');
  });
  test('acks are pruned once the rail is back in range', () => {
    const doc = healthyDoc();
    doc.guardrailAcks = [{ id: 'opexRatio', reason: 'was out of range' }, { id: 'notARail', reason: 'nonsense' }];
    assert.deepEqual(G.pruneAcks(doc, run(doc)), []);
  });
  test('fee percentages summing past the ceiling block', () => {
    const doc = healthyDoc();
    doc.projectCosts.dev = { mode: 'pct', val: 60 }; doc.projectCosts.mkt = { mode: 'pct', val: 40 };
    const rail = run(doc).breaches.find(b => b.id === 'feeSum');
    assert.ok(rail && rail.severity === 'error', 'a 100% fee rate cannot be saved');
  });
  test('unit SF above residential SF blocks; a blank type carries only the hard rails', () => {
    const doc = healthyDoc(); doc.units = [{ label: '1BR', sf: 1200, count: 50, rent: 1600 }];   // 60,000 > 50,000
    const rail = run(doc).breaches.find(b => b.id === 'unitSF');
    assert.ok(rail && rail.severity === 'error');
    const blank = healthyDoc(); blank.type = 'Blank'; blank.expenses = [];
    assert.ok(!run(blank).rails.map(r => r.id).includes('opexRatio'), 'a blank budget is not judged by the multifamily rails');
  });
  test('income with NO expense rows is not judged; rows that total zero are', () => {
    const none = healthyDoc(); none.expenses = [];
    const r = run(none);
    assert.ok(!r.rails.some(x => x.id === 'opexRatio')); assert.equal(r.blocking, 0, why(r));
    const absent = healthyDoc(); delete absent.expenses;
    assert.ok(!run(absent).rails.some(x => x.id === 'opexRatio'), 'an absent schedule is the same');
    const zero = healthyDoc(); zero.expenses = [{ label: 'Operations', per: 'pctIncome', rate: 0 }];
    const rail = run(zero).breaches.find(b => b.id === 'opexRatio');
    assert.ok(rail && rail.severity === 'error' && rail.actual === 0, 'zeroed rows are judged');
  });
  test('policyForType: only Blank is Blank; anything unknown is judged as Multifamily', () => {
    assert.equal(G.policyForType('Multifamily'), G.DEFAULT_POLICY.Multifamily);
    assert.equal(G.policyForType('Blank'), G.DEFAULT_POLICY.Blank);
    assert.equal(G.policyForType('Commercial'), G.DEFAULT_POLICY.Multifamily);
    assert.equal(G.policyForType(undefined), G.DEFAULT_POLICY.Multifamily);
    assert.equal(G.policyForType('constructor'), G.DEFAULT_POLICY.Multifamily, 'an inherited property name is not a policy');
  });
  test('an explicit policy ignores doc.guardrails and doc.type', () => {
    const doc = healthyDoc(); doc.expenses = [{ label: 'Operations', per: 'pctIncome', rate: 20 }];
    assert.equal(run(doc).blocking, 1);
    const forgedPolicy = Object.assign(healthyDoc(), { expenses: doc.expenses, guardrails: { Multifamily: {} } });
    assert.equal(run(forgedPolicy).blocking, 0, 'without a policy the document can switch its own rails off');
    const forgedType = Object.assign(healthyDoc(), { expenses: doc.expenses, type: 'Blank' });
    assert.equal(run(forgedType).blocking, 0, 'or claim to be Blank');
    const mf = G.policyForType('Multifamily');
    assert.equal(run(forgedPolicy, mf).blocking, 1, 'doc.guardrails is ignored');
    assert.equal(run(forgedType, mf).blocking, 1, 'doc.type is ignored');
    assert.deepEqual(run(healthyDoc(), G.policyForType('Blank')).rails.map(r => r.id).sort(), ['feeSum', 'unitSF']);
  });
  test('fmt and constants', () => {
    assert.equal(G.fmt(0.4567, 'pct'), '45.7%'); assert.equal(G.fmt(1234.5, 'usd'), '$1,234.50'); assert.equal(G.fmt(null), '—');
    assert.equal(G.OPEX_SCHEMA_FULL, 2); assert.equal(G.RAILS.length, 14);
  });
}

// =====================================================================================================================
// impact-fees.test.js — the City of Waller schedule reproduces the city's published low/high totals
// =====================================================================================================================
{
  const SCHEDULE = fixture('fee-schedules.json')['tx-waller'];
  const one = (rowId, basis, sel) => IF.evaluate(SCHEDULE, { scheduleKey: 'tx-waller', basis, meters: [Object.assign({ rowId, qty: 1 }, sel || {})] }).total;
  const PUBLISHED = [
    ['m-58-34-10', 15472.94, 16588.94], ['m-34-15', 21156.41, 22279.66], ['m-1-25', 33095.85, 35851.73],
    ['m-1p5-50', 63931.18, 66427.81], ['m-2-80', 98458.00, 100354.63], ['m-2-100', 121075.87, 122972.50],
    ['m-3-160', 190198.00, 193386.75], ['m-3-240', 280669.50, 283858.25], ['m-4-250', 308822.43, 318972.18],
    ['m-4-420', 501074.37, 511224.12], ['m-6-500', 602910.87, 616276.87], ['m-6-920', 1077886.23, 1091252.23],
    ['m-8-800', 957796.99, 975867.49], ['m-8-1600', 1862511.98, 1880582.48], ['m-10-1150', 1372947.79, 1393927.79],
    ['m-10-2500', 2899654.33, 2920634.33], ['m-12-3300', 3824419.90, 3852287.55]
  ];

  test('the data module is the fixture schedule, with a dated source', () => {
    const { source, version, ...rest } = TX_WALLER, { source: fxSource, ...fx } = SCHEDULE;
    assert.deepEqual(rest, fx);
    assert.equal(source.label, fxSource);
    assert.equal(source.asOf, '2025-10-15');
    for (const k of ['label', 'ref', 'asOf', 'region', 'confidence', 'note']) assert.ok(source[k], 'source.' + k);
    assert.equal(TX_WALLER.meters.length, 17);
    assert.deepEqual(TX_WALLER.eduRates, { water: 3689.91, sewer: 7619.03 });
  });
  for (const [label, sch] of [['fixture', SCHEDULE], ['data module', TX_WALLER]]) {
    test('every meter row reproduces the published low and high totals (' + label + ')', () => {
      assert.equal(PUBLISHED.length, sch.meters.length, 'row count');
      for (const [rowId, low, high] of PUBLISHED) {
        const t = basis => IF.evaluate(sch, { basis, meters: [{ rowId, qty: 1 }] }).total;
        assert.equal(cents(t('low')), low, rowId + ' low');
        assert.equal(cents(t('high')), high, rowId + ' high');
      }
    });
  }
  test('average sits exactly between low and high', () => {
    for (const [rowId, low, high] of PUBLISHED) assert.equal(cents(one(rowId, 'avg')), cents((low + high) / 2), rowId + ' avg');
  });
  test('impact fees are single-valued — only the adders move with basis', () => {
    const m = SCHEDULE.meters.find(x => x.rowId === 'm-4-250');
    const r = IF.rowAmounts(m, { qty: 1 }, 'low'), h = IF.rowAmounts(m, { qty: 1 }, 'high');
    assert.equal(r.each.waterImpact, h.each.waterImpact);
    assert.equal(r.each.sewerImpact, h.each.sewerImpact);
    assert.equal(cents(h.each.total - r.each.total), cents(318972.18 - 308822.43));
  });
  test('the per-EDU rates explain the impact fees to within rounding', () => {
    for (const m of SCHEDULE.meters) {
      const bound = m.edu * 0.005 + 1e-9;
      assert.ok(Math.abs(m.edu * SCHEDULE.eduRates.water - m.waterImpact) <= bound, m.rowId + ' water');
      assert.ok(Math.abs(m.edu * SCHEDULE.eduRates.sewer - m.sewerImpact) <= bound, m.rowId + ' sewer');
    }
    const big = SCHEDULE.meters.find(m => m.rowId === 'm-12-3300');
    assert.notEqual(cents(big.edu * SCHEDULE.eduRates.water), big.waterImpact, 'the 330-EDU row is the rounding case');
  });
  test('meters 3 inch and under have no vault, and it contributes nothing', () => {
    const noVault = SCHEDULE.meters.filter(m => !m.vault);
    assert.equal(noVault.length, 8); assert.equal(SCHEDULE.meters.filter(m => m.vault).length, 9);
    for (const m of noVault) { const r = IF.rowAmounts(m, { qty: 1 }, 'high'); assert.equal(r.each.vault, 0, m.rowId); assert.equal(r.hasVault, false); }
  });
  test('an absent range and an explicit null price identically', () => {
    const base = SCHEDULE.meters.find(m => m.rowId === 'm-58-34-10');
    assert.equal(IF.rowAmounts(base, { qty: 1 }, 'high').total, IF.rowAmounts({ ...base, vault: null }, { qty: 1 }, 'high').total);
    assert.equal(IF.pick(null, 'high'), 0); assert.equal(IF.pick({ low: 2, high: 4 }, 'avg'), 3);
  });
  test('quantity multiplies, and zero contributes nothing', () => {
    assert.equal(cents(one('m-4-250', 'high', { qty: 2 })), cents(2 * 318972.18));
    assert.equal(one('m-4-250', 'high', { qty: 0 }), 0);
  });
  test('a mixed meter mix sums its rows exactly', () => {
    const r = IF.evaluate(SCHEDULE, { scheduleKey: 'tx-waller', basis: 'high', meters: [{ rowId: 'm-2-100', qty: 2 }, { rowId: 'm-6-500', qty: 1 }] });
    assert.equal(cents(r.total), cents(2 * 122972.50 + 616276.87)); assert.equal(r.rows.length, 2);
  });
  test('include toggles drop only what they name', () => {
    const full = one('m-4-250', 'high');
    assert.equal(cents(full - one('m-4-250', 'high', { includeMeter: false })), 4748.75);
    assert.equal(cents(full - one('m-4-250', 'high', { includeTaps: false })), cents(5250 + 5250));
    assert.equal(cents(full - one('m-4-250', 'high', { includeVault: false })), 21000);
    assert.equal(cents(one('m-4-250', 'high', { includeMeter: false, includeVault: false, includeTaps: false })), cents(92247.76 + 190475.67));
  });
  test('no schedule, no selection, and junk input all total zero rather than NaN', () => {
    for (const [sch, f] of [[null, null], [SCHEDULE, null], [null, { basis: 'high' }],
                            [SCHEDULE, { meters: [{ rowId: 'nope', qty: 3 }] }],
                            [SCHEDULE, { meters: [{ rowId: 'm-2-100', qty: 'abc' }] }]]) {
      const r = IF.evaluate(sch, f, {}); assert.equal(r.total, 0); assert.ok(Number.isFinite(r.total));
    }
  });
  test('an unknown basis falls back to high, which is the conservative side', () => {
    assert.equal(one('m-4-250', 'sideways'), one('m-4-250', 'high'));
    assert.equal(one('m-4-250', undefined), one('m-4-250', 'high'));
    assert.equal(IF.DEFAULT_BASIS, 'high');
  });
  test('generic fees price against the budget they are attached to', () => {
    const sch = { ...SCHEDULE, fees: [
      { feeId: 'road', label: 'Roadway Impact Fee', basis: 'unit', amount: { low: 800, high: 1200 } },
      { feeId: 'park', label: 'Park Fee', basis: 'flat', amount: { low: 25000, high: 25000 } },
      { feeId: 'drain', label: 'Drainage', basis: 'acre', amount: { low: 500, high: 900 } },
      { feeId: 'plan', label: 'Plan Review', basis: 'pctHard', amount: { low: 0.5, high: 0.75 } }] };
    const ctx = { units: 58, acres: 7.6, resSF: 51365, amenSF: 1200, hard: 10000000 };
    const r = IF.evaluate(sch, { scheduleKey: 'tx-waller', basis: 'high', meters: [],
      extras: [{ feeId: 'road' }, { feeId: 'park' }, { feeId: 'drain' }, { feeId: 'plan' }] }, ctx);
    assert.equal(cents(r.extrasTotal), cents(1200 * 58 + 25000 + 900 * 7.6 + 10000000 * 0.75 / 100));
    assert.equal(r.extras.length, 4);
  });
  test('manual one-off fees add on top and need no schedule entry', () => {
    const r = IF.evaluate(SCHEDULE, { scheduleKey: 'tx-waller', basis: 'high', meters: [{ rowId: 'm-2-100', qty: 1 }],
      manual: [{ rowId: 'man-1', label: 'Fire line tap', amount: 12500 }] });
    assert.equal(cents(r.total), cents(122972.50 + 12500)); assert.equal(cents(r.manualTotal), 12500);
  });
  test('provenance names the jurisdiction, the basis and the version', () => {
    const r = IF.evaluate(SCHEDULE, { scheduleKey: 'tx-waller', scheduleName: 'City of Waller, TX', scheduleVersion: 1,
      basis: 'high', meters: [{ rowId: 'm-4-250', qty: 1 }] });
    assert.equal(IF.provenance(r), 'City of Waller, TX (high side, v1)');
    assert.equal(IF.provenance(IF.evaluate(null, null, {})), '');
  });
  test('the same meter size can be carried twice and does not collapse', () => {
    const r = IF.evaluate(SCHEDULE, { scheduleKey: 'tx-waller', basis: 'high', meters: [
      { id: 'a', rowId: 'm-2-100', label: 'Domestic', qty: 1 }, { id: 'b', rowId: 'm-2-100', label: 'Irrigation', qty: 1 }] });
    assert.equal(r.rows.length, 2); assert.equal(cents(r.total), cents(2 * 122972.50));
    assert.deepEqual(r.rows.map(x => x.label), ['Domestic', 'Irrigation']); assert.deepEqual(r.rows.map(x => x.id), ['a', 'b']);
  });
  test('a mixed set of meters prices as the sum of its rows', () => {
    const r = IF.evaluate(SCHEDULE, { scheduleKey: 'tx-waller', basis: 'high', meters: [
      { id: 'a', rowId: 'm-2-100', qty: 1 }, { id: 'b', rowId: 'm-1-25', qty: 1 }, { id: 'c', rowId: 'm-6-500', qty: 1 }] });
    assert.equal(cents(r.total), cents(122972.50 + 35851.73 + 616276.87));
  });
  test('a meter name always carries the rate, because size is ambiguous', () => {
    const two = SCHEDULE.meters.filter(m => m.size === '2');
    assert.equal(two.length, 2);
    assert.deepEqual(two.map(IF.meterName), ['2" · 80 gpm · 8 EDU', '2" · 100 gpm · 10 EDU']);
    assert.notEqual(cents(one('m-2-80', 'high')), cents(one('m-2-100', 'high')));
  });
  test('a selection naming a meter the schedule does not have is dropped, not counted', () => {
    const r = IF.evaluate(SCHEDULE, { scheduleKey: 'tx-waller', basis: 'high', meters: [{ id: 'a', rowId: 'm-2-100', qty: 1 }, { id: 'b', rowId: 'm-nonexistent', qty: 5 }] });
    assert.equal(r.rows.length, 1); assert.equal(cents(r.total), 122972.50);
  });
}

// =====================================================================================================================
// input-defaults.test.js — the input-driven defaults transformation (exported, NOT applied to the data modules)
// =====================================================================================================================
{
  const ref = fixture('input-defaults-reference.json');
  // The multifamily template as the source seeds it (lines from the pricing library: qty 1 / auto false for lump sums,
  // else qty 0 / auto true; baseUnit = the library rate; bare-number fees), with the full expense schedule on top.
  const seedTemplate = () => ({
    templateSchemaVersion: 1, name: 'Multifamily', type: 'Multifamily',
    resSF: 51365, amenSF: 1200, siteSF: 0,
    units: [
      { label: 'Studio (630)', bd: 0, bth: 1, sf: 630, count: 16, rent: 1203 },
      { label: 'Studio (400)', bd: 0, bth: 1, sf: 400, count: 14, rent: 1160 },
      { label: 'Townhome (1,063)', bd: 2, bth: 2, sf: 1063, count: 14, rent: 1520 },
      { label: 'Townhome (1,200)', bd: 2, bth: 2.5, sf: 1200, count: 14, rent: 1500 }],
    other: [{ label: 'Utilities billback', rate: 77, count: 0, auto: true }],
    expenses: [
      { label: 'Property Taxes', per: 'pctIncome', rate: 12, count: 0, auto: false },
      { label: 'Property Insurance', per: 'unit', rate: 65, count: 0, auto: true }],
    lines: PRICING.lines.map((l, i) => ({
      lineId: 'tpl-' + i, code: l.code, grp: l.grp, scope: l.scope, desc: l.desc, basis: l.basis,
      unit: l.unit, baseUnit: l.unit, qty: l.basis === 'ls' ? 1 : 0, auto: l.basis !== 'ls' })),
    companies: [{ name: 'Finishes Solutions LLC', pct: 12 }],
    contingency: { mode: 'psf', val: 2 },
    projectCosts: { land: 1200000, dev: 200000, mkt: 75000, cls: 0 },
    status: 'Draft', pricingVersion: PRICING.version, opexSchemaVersion: 2
  });
  const { source: _s, ...pricing } = PRICING;          // the library document as the source stores it
  const run = (tpl = seedTemplate(), lib = pricing) =>
    R.transformInputDefaults({ pricing: lib, template: tpl, newPricingVersion: '2026.10-v1', effective: '2026-10-15' });
  const libKey = R.lineKeyOf;
  const byNewDesc = (doc, desc) => doc.lines.find(l => l.desc === desc);
  const rails = d => { const p = parts(d); return G.evaluate({ doc: d, parts: p, gross: grossIncome(d), fee: p.fee }); };
  function repriceBudget(d, lib) {   // the source app's Update Pricing, reduced to what it does to a line
    const map = {}; lib.lines.forEach(l => { map[libKey(l)] = l; });
    d.lines.forEach(it => { const m = map[libKey(it)]; if (!m) return; it.unit = m.unit; it.baseUnit = m.unit; });
    d.pricingVersion = lib.version; return d;
  }

  test('the transformation reproduces the reference output captured from the source', () => {
    const r = run();
    assert.equal(r.pricing.version, ref.pricing.version);
    assert.equal(r.pricing.lines.length, ref.pricing.lineCount);
    for (const { index, line } of ref.pricing.lines) assert.deepStrictEqual(r.pricing.lines[index], line);
    assert.equal(r.template.lines.length, ref.template.lineCount);
    for (const { index, line } of ref.template.lines) {
      const { lineId, ...rest } = r.template.lines[index];
      assert.deepStrictEqual(rest, line, 'template line ' + index);
    }
    assert.deepStrictEqual(r.template.projectCosts, ref.template.projectCosts);
    assert.equal(r.template.pricingVersion, ref.template.pricingVersion);
  });
  test('rates are back-solved from the template\'s own size (51,365 SF) and unit count (58)', () => {
    const r = run();
    const expect = {
      'Residential Appliances (per Unit)': 3081.90, 'Casework / Stock Cabinets (per Unit)': 1780.06,
      'Countertops (per Unit)': 1000.73, 'Interior Doors & Frames (per Unit)': 1160.14,
      'Interior Door Hardware (per Unit)': 177.12, 'Mirrors (per Unit)': 256.83,     // 256.825 exactly: half rounds UP
      'Toilet, Bath & Laundry Accessories (per Unit)': 549.07, 'Window Blinds (per Unit)': 292.25,
      'Mailboxes (per Unit)': 221.40
    };
    for (const [desc, rate] of Object.entries(expect)) {
      for (const doc of [r.pricing, r.template]) {
        const l = byNewDesc(doc, desc);
        assert.equal(l.basis, 'unit', desc); assert.equal(l.scope, 'res', desc); assert.equal(l.unit, rate, desc);
      }
      assert.equal(byNewDesc(r.template, desc).baseUnit, rate, desc + ' baseUnit');
      assert.equal(byNewDesc(r.template, desc).auto, true, desc + ' stays auto');
    }
    const pool = r.template.lines.find(l => l.code === '13 11 00');
    assert.deepStrictEqual(
      { scope: pool.scope, grp: pool.grp, basis: pool.basis, unit: pool.unit, baseUnit: pool.baseUnit, qty: pool.qty, auto: pool.auto },
      { scope: 'amen', grp: 'Amenity Site & Pool', basis: 'ls', unit: 165395.30, baseUnit: 165395.30, qty: 1, auto: false });
    assert.deepStrictEqual(r.template.projectCosts.dev, { mode: 'pct', val: 2.0046 });
    assert.equal(R.halfUpCents(25n, 10n), 3n, 'half rounds up');
    assert.equal(R.halfUpCents(24n, 10n), 2n);
  });
  test('(a) the template\'s default totals do not move', () => {
    const before = parts(seedTemplate()), r = run(), after = parts(r.template);
    assert.ok(Math.abs(after.contract - before.contract) < 1, `contract ${before.contract} -> ${after.contract}`);
    assert.ok(Math.abs(after.project - before.project) < 5, `project ${before.project} -> ${after.project}`);
    assert.ok(Math.abs(after.fee.dev - 200000) < 5, 'the fee is still about $200k: ' + after.fee.dev);
    const changed = new Set(R.INPUT_DEFAULT_TARGETS.map(t => t.newScope + '|' + t.code + '|' + t.newDesc));
    const old = new Map(seedTemplate().lines.map(l => [l.lineId, l]));
    for (const l of r.template.lines) if (!changed.has(libKey(l))) assert.deepStrictEqual(l, old.get(l.lineId));
    // The source's own published deltas: contract -$0.34, project 9,977,137.61 -> 9,977,139.01, fee $200,001.73.
    assert.equal(cents(after.contract - before.contract), -0.34);
    assert.equal(cents(before.project), 9977137.61); assert.equal(cents(after.project), 9977139.01);
    assert.equal(cents(after.fee.dev), 200001.73);
  });
  test('(a) the guard rails reach the same verdicts', () => {
    const b = rails(seedTemplate()), a = rails(run().template);
    const ok = (res, id) => { const x = res.rails.find(y => y.id === id); return x ? x.ok : null; };
    assert.equal(ok(a, 'devFee'), ok(b, 'devFee')); assert.equal(ok(a, 'devFee'), true, 'and inside 2-5%');
    assert.equal(ok(b, 'feeSum'), null, 'no percentage fee before: feeSum not judged');
    assert.equal(ok(a, 'feeSum'), true, 'feeSum judged now, and passes');
    assert.equal(a.blocking, b.blocking);
  });
  test('(b) with Amenity SF at 0 the pool is gone', () => {
    const o = parts({ ...seedTemplate(), amenSF: 0 }), newNoAmen = { ...run().template, amenSF: 0 }, n = parts(newNoAmen);
    assert.equal(n.amen, 0);
    assert.ok(Math.abs((o.hard - n.hard) - 165395.30) < 1, `hard ${o.hard} -> ${n.hard}`);
    const poolRow = sovRows(newNoAmen).find(x => x.code === '13 11 00');
    assert.equal(poolRow.scope, 'amen'); assert.equal(poolRow.total, 0);
    assert.ok(Math.abs(parts(run().template).amen - (parts(seedTemplate()).amen + 165395.30)) < 0.01);
  });
  test('(c) the per-unit lines follow the unit count', () => {
    const dbl = d => ({ ...d, units: d.units.map(u => ({ ...u, count: u.count * 2 })) });
    const r = run();
    assert.equal(scopeSum(dbl(seedTemplate()), 'res'), scopeSum(seedTemplate(), 'res'), 'before: doubling the units changed nothing');
    const perUnit = r.template.lines.filter(l => l.basis === 'unit').reduce((s, l) => s + l.unit, 0);
    const newRes = scopeSum(r.template, 'res'), newResDbl = scopeSum(dbl(r.template), 'res');
    assert.ok(Math.abs((newResDbl - newRes) - perUnit * 58) < 0.01);
    assert.ok(newResDbl - newRes > 450000, 'about $8,520 of finishes per added unit');
  });
  test('(d) only known scopes and bases are produced', () => {
    const r = run();
    for (const doc of [r.pricing, r.template]) for (const l of doc.lines) {
      assert.ok(['res', 'amen', 'soft'].includes(l.scope), l.code + ' scope ' + l.scope);
      assert.ok(['sf', 'asf', 'unit', 'ls'].includes(l.basis), l.code + ' basis ' + l.basis);
    }
    const dev = r.template.projectCosts.dev;
    assert.ok(dev.mode === 'pct' && Number.isFinite(dev.val));
    assert.deepStrictEqual(Object.keys(r.template).sort(), Object.keys(seedTemplate()).sort(), 'no new top-level fields');
  });
  test('a budget created from the new template is born on its rates', () => {
    const r = run();
    const born = R.stampCurrentPricing(clone(r.template), r.pricing);
    assert.deepStrictEqual(born.lines, r.template.lines);
    assert.equal(born.pricingVersion, '2026.10-v1');
  });
  test('an EXISTING budget repriced against the new library keeps its per-SF lines', () => {
    const existing = seedTemplate(), lib = run().pricing;
    const map = new Map(lib.lines.map(l => [libKey(l), l]));
    for (const l of existing.lines) { const m = map.get(libKey(l)); if (m) assert.equal(m.basis, l.basis, libKey(l)); }
    assert.equal(parts(repriceBudget(clone(existing), lib)).contract, parts(existing).contract);
    const kept = repriceBudget(seedTemplate(), lib).lines.find(l => l.code === '11 31 00');
    assert.deepStrictEqual([kept.scope, kept.basis, kept.unit], ['res', 'sf', 3.48]);
    // and stampCurrentPricing refuses a same-key line on a different basis
    const d = { lines: [{ scope: 'res', code: 'X', desc: 'x', basis: 'sf', unit: 2, baseUnit: 2 }] };
    R.stampCurrentPricing(d, { version: 'v', lines: [{ scope: 'res', code: 'X', desc: 'x', basis: 'unit', unit: 3000 }] });
    assert.equal(d.lines[0].unit, 2, 'a per-unit rate never lands on a per-SF line');
  });
  test('the pool sits at the end of the amenity lines, in both documents', () => {
    const r = run();
    for (const doc of [r.pricing, r.template]) {
      assert.equal(doc.lines.findIndex(l => l.code === '13 11 00'), doc.lines.map(l => l.scope).lastIndexOf('amen'));
      assert.equal(doc.lines.length, 103);
    }
  });
  test('re-running on the transformed result is a no-op', () => {
    const r = run();
    assert.deepStrictEqual(R.transformInputDefaults({ pricing: r.pricing, template: r.template }), { alreadyDone: true });
    assert.equal(R.classifyInputDefaults(r.pricing), 'new'); assert.equal(R.classifyInputDefaults(seedTemplate()), 'old');
  });
  test('it refuses, loudly, anything it did not expect', () => {
    const r = run();
    const refused = (code, fn) => assert.throws(fn, e => e instanceof R.InputDefaultsRefusedError && e.code === code);
    refused(50062, () => run(seedTemplate(), r.pricing));
    refused(50062, () => run(r.template, pricing));
    const missing = seedTemplate(); missing.lines = missing.lines.filter(l => l.desc !== 'Window Blinds');
    refused(50062, () => run(missing));
    const dup = seedTemplate(); dup.lines.push({ ...dup.lines.find(l => l.desc === 'Mailboxes'), lineId: 'x' });
    refused(50062, () => run(dup));
    const manual = seedTemplate(); Object.assign(manual.lines.find(l => l.desc === 'Residential Appliances'), { auto: false, qty: 40000 });
    refused(50064, () => run(manual));
    const odd = clone(pricing); odd.lines.find(l => l.desc === 'Countertops').unit = 1.12345;
    refused(50064, () => run(seedTemplate(), odd));
    refused(50065, () => run({ ...seedTemplate(), resSF: 0 }));
    refused(50066, () => run({ ...seedTemplate(), units: [] }));
    refused(50067, () => run({ ...seedTemplate(), amenSF: 0 }));
  });
  test('inputs are never mutated', () => {
    const tpl = seedTemplate(), snapT = JSON.stringify(tpl), snapP = JSON.stringify(pricing);
    run(tpl);
    assert.equal(JSON.stringify(tpl), snapT); assert.equal(JSON.stringify(pricing), snapP);
  });
  test('a fee already on a percentage is left alone', () => {
    const t = seedTemplate(); t.projectCosts = { land: 1200000, dev: { mode: 'pct', val: 3 }, mkt: 75000, cls: 0 };
    const r = run(t);
    assert.equal(r.devPct, null); assert.deepStrictEqual(r.template.projectCosts.dev, { mode: 'pct', val: 3 });
  });
  test('the data modules are NOT transformed (the source has not run the publish)', () => {
    assert.equal(R.classifyInputDefaults(PRICING), 'old');
    assert.equal(R.classifyInputDefaults(R.docFromTemplate(MF_TEMPLATE, PRICING)), 'old');
  });
}

// =====================================================================================================================
// New: the default multifamily budget, CSI reconciliation, the circular fee
// =====================================================================================================================

// (a) Template + pricing → the source's default budget. Verified against the source's own budget-calc.js on the same
// inputs, and against the figures its input-defaults publish script prints for the shipped template (project cost
// 9,977,137.61 before rounding).
const DEFAULT_BUDGET = { hard: 6670443, profit: 800453, cont: 105130, contract: 7576027, soft: 926111, project: 9977138 };
const mf = R.docFromTemplate(MF_TEMPLATE, PRICING);
test('(a) the default multifamily budget reproduces the contract sum and total project cost', () => {
  const p = parts(mf);
  assert.equal(mf.lines.length, 103); assert.equal(mf.pricingVersion, '2026.08-v2');
  assert.equal(totUnits(mf), 58);
  const got = Object.fromEntries(Object.keys(DEFAULT_BUDGET).map(k => [k, Math.round(p[k])]));
  assert.deepEqual(got, DEFAULT_BUDGET);
  close(p.contract, 7576026.664, 'contract to the tenth of a cent', 1e-4);
  close(p.project, 9977137.614, 'project to the tenth of a cent', 1e-4);
  close(p.res, 6519759.45, 'residential', 1e-4); close(p.amen, 150684, 'amenity', 1e-4);
  assert.equal(p.fees, 275000); assert.equal(p.fee.pctRate, null, 'dollar fees: feeSum not judged');
  close(p.project, p.contract + p.soft + 1200000 + p.fees, 'contract + soft + land + fees = total');
  // every value is labelled as a template default
  for (const k of ['units', 'other', 'expenses', 'companies']) for (const row of MF_TEMPLATE.doc[k]) assert.equal(row.src, TEMPLATE_DEFAULT, k);
  assert.equal(TEMPLATE_DEFAULT, 'FS template default');
  assert.match(MF_TEMPLATE.source.note, /[Ss]tarting points, not house numbers/);
  for (const k of ['label', 'ref', 'asOf', 'region', 'confidence', 'note']) assert.ok(MF_TEMPLATE.source[k], 'source.' + k);
  assert.equal(MF_TEMPLATE.doc.opexSchemaVersion, 2); assert.equal(MF_TEMPLATE.doc.expenses.length, 16);
});
test('(a) the bare-number fee shape of the seeded template computes the same budget', () => {
  const t = clone(MF_TEMPLATE.doc); t.projectCosts = { land: 1200000, dev: 200000, mkt: 75000, cls: 0 };
  assert.equal(parts(R.docFromTemplate(t, PRICING)).project, parts(mf).project);
});
test('(a) the default budget\'s income and guard rails', () => {
  const g = grossIncome(mf), p = parts(mf);
  assert.equal(g.rentMo, 16 * 1203 + 14 * 1160 + 14 * 1520 + 14 * 1500);                       // 80,768
  assert.equal(g.otherMo, 58 * (77 + 75 + 20 + 25 + 15) + 25 * 15 + 25 * 18 + 25 * 23);       // 13,696
  const inc = g.rentMo + g.otherMo;
  const perUnit = 60 + 40 + 15 + 15 + 10 + 65 + 95 + 55 + 30 + 22 + 18 + 20 + 25;
  close(g.expMo, 58 * perUnit + 383 + inc * 0.16, 'expenses');
  const r = G.evaluate({ doc: mf, parts: p, gross: g, fee: p.fee, policy: G.policyForType('Multifamily') });
  const opex = r.rails.find(x => x.id === 'opexRatio');
  assert.ok(opex.ok && opex.actual > 0.44 && opex.actual < 0.48, 'the template lands near 46% of income: ' + opex.actual);
  assert.equal(r.blocking, 0, r.breaches.map(b => b.message).join(' | '));
});
test('(a) the SOV rows of the default budget equal its hard and soft cost', () => {
  const rows = sovRows(mf);
  close(rows.filter(r => r.scope !== 'soft').reduce((s, r) => s + r.total, 0), parts(mf).hard, 'hard', 1e-6);
  close(rows.filter(r => r.scope === 'soft').reduce((s, r) => s + r.total, 0), parts(mf).soft, 'soft', 1e-6);
});

// (b) CSI divisions + markups reconcile to the contract sum.
const reconcile = (doc, msg) => {
  const sch = C.csiSchedule(doc), p = parts(doc);
  const divs = sch.divisions.reduce((s, d) => s + d.total, 0);
  close(divs, p.hard, msg + ': divisions = hard', 1e-6);
  close(divs + sch.markupsTotal, p.contract, msg + ': divisions + markups = contract', 1e-6);
  close(sch.softTotal, p.soft, msg + ': soft reported separately', 1e-6);
  assert.equal(sch.contract, p.contract);
  return sch;
};
test('(b) CSI divisions + markups sum to the contract sum on the default budget', () => {
  const sch = reconcile(mf, 'default');
  assert.equal(Math.round(sch.contract), 7576027);
  assert.deepEqual(sch.markups.map(m => [m.code, m.desc]), [['99 01 00', 'Profit — Finishes Solutions LLC'], ['99 03 00', 'Construction contingency']]);
  close(sch.markupsTotal, 800453.214 + 105130, 'markups', 1e-4);
  const keys = sch.divisions.map(d => d.key);
  assert.deepEqual(keys, [...keys].sort(), 'divisions sorted by number');
  assert.ok(!keys.includes('--'), 'every library line carries a real CSI code');
  assert.equal(sch.divisions.find(d => d.key === '06').title, 'Division 06 — Wood, Plastics, and Composites');
  for (const d of sch.divisions) assert.deepEqual(d.rows.map(r => r.code), [...d.rows.map(r => r.code)].sort((a, z) => a.localeCompare(z)));
  assert.equal(sch.softGroups.length, 2); close(C.csiPct(sch.softTotal, sch.softTotal), 1, 'soft % denominator');
  assert.equal(C.csiPct(5, 0), null);
});
test('(b) CSI reconciles with amenity off, with uncoded lines, and with % and $ contingency', () => {
  reconcile({ ...mf, amenSF: 0 }, 'amenity off');
  const d = clone(mf);
  d.lines.push({ scope: 'res', code: '', desc: 'Custom scope', basis: 'ls', auto: false, qty: 1, unit: 12345, custom: true });
  d.lines.push({ scope: 'amen', code: 'ZZ', desc: 'Odd code', basis: 'asf', auto: true, unit: 3, baseUnit: 3 });
  d.contingency = { mode: 'pct', val: 5 }; d.companies.push({ name: 'Partner', pct: 3 });
  const sch = reconcile(d, 'uncoded + pct');
  const un = sch.divisions[sch.divisions.length - 1];
  assert.equal(un.key, '--'); assert.equal(un.title, 'Uncoded / Custom Scope'); assert.equal(un.rows.length, 2);
  assert.equal(sch.markups.filter(m => m.code === '99 01 00').length, 2);
  reconcile({ ...d, contingency: { mode: 'amt', val: 0 } }, 'no contingency');
  assert.ok(!C.csiSchedule({ ...d, contingency: { mode: 'amt', val: 0 } }).markups.some(m => m.code === '99 03 00'), 'no zero contingency row');
});
test('(b) the source\'s worked example: CSI and the impact fee line (BUDGET-SYSTEM §14)', () => {
  const fee = IF.evaluate(TX_WALLER, { scheduleKey: 'tx-waller', scheduleName: TX_WALLER.name, scheduleVersion: 1, basis: 'high',
    meters: [{ id: 'm1', rowId: 'm-4-250', qty: 1 }] });
  assert.equal(cents(fee.total), 318972.18);
  const doc = {
    resSF: 50000, amenSF: 2000, siteSF: 200000,
    units: [{ label: '1BR', sf: 700, count: 40, rent: 1400 }, { label: '2BR', sf: 1000, count: 20, rent: 1900 }],
    lines: [
      { scope: 'res', code: '06 10 00', desc: 'Framing', basis: 'sf', auto: true, unit: 20, baseUnit: 20 },
      { scope: 'res', code: '11 31 00', desc: 'Appliances', basis: 'unit', auto: true, unit: 3000, baseUnit: 3000 },
      { scope: 'res', code: '22 05 00', desc: 'Plumbing', basis: 'sf', auto: false, qty: 48000, unit: 9, baseUnit: 9 },
      { scope: 'amen', code: '08 40 00', desc: 'Storefront', basis: 'asf', auto: true, unit: 21.16, baseUnit: 21.16 },
      { scope: 'amen', code: '11 65 00', desc: 'Fitness', basis: 'ls', auto: false, qty: 1, unit: 60000, baseUnit: 60000 },
      { scope: 'soft', code: 'SC-01', desc: 'Architect', basis: 'sf', auto: true, unit: 2.65, baseUnit: 2.65 },
      // the materialized impact-fee line: lump sum, derived, provenance in the description
      { scope: 'soft', code: 'SC-20', desc: 'Water & Sewer Impact & Tap Fees — ' + IF.provenance(fee), basis: 'ls', auto: false, qty: 1,
        unit: fee.total, baseUnit: 7.5, derived: 'impactFees' }
    ],
    companies: [{ name: 'GC', pct: 10 }], contingency: { mode: 'pct', val: 5 },
    projectCosts: { land: 1500000, dev: { mode: 'pct', val: 3 }, mkt: { mode: 'amt', val: 50000 }, cls: { mode: 'pct', val: 1 } }
  };
  const p = parts(doc);
  assert.equal(cents(p.hard), 1714320); assert.equal(cents(p.contract), 1971468);
  assert.equal(cents(p.soft), 451472.18); assert.equal(cents(p.project), 4138479.35);
  assert.equal(cents(p.fee.dev), 124154.38); assert.equal(cents(p.fee.cls), 41384.79);
  const sch = reconcile(doc, 'worked example');
  assert.deepEqual(sch.divisions.map(d => [d.key, cents(d.total)]), [['06', 1000000], ['08', 42320], ['11', 240000], ['22', 432000]]);
  assert.equal(cents(sch.markupsTotal), 257148);
  const sc20 = sch.soft.find(r => r.code === 'SC-20');
  assert.equal(sc20.derived, true); assert.equal(sc20.edited, false, 'derived, not edited');
  assert.equal(C.lineFlag(doc.lines[6]), 'derived'); assert.equal(C.lineFlag(doc.lines[0]), '');
  assert.equal(C.lineFlag({ ...doc.lines[0], unit: 21 }), 'edited');
  assert.equal(C.csiDivKey('06 10 00'), '06'); assert.equal(C.csiDivKey('SC-20'), null); assert.equal(C.csiDivKey('15 00 00'), null, 'reserved division');
  assert.equal(C.csiDivOf('99'), 'Custom');
});

// (c) The circular fee: project = (base + fixed) / max(1 − rate, FEE_FLOOR), so fee = rate × project exactly.
test('(c) the closed form satisfies fee = rate × project', () => {
  for (const [dev, mkt, cls] of [[3, 0, 0], [3, 1.5, 1], [0.5, 2, 2.5], [10, 10, 10], [0, 0, 0.0001]]) {
    const d = clone(mf);
    d.projectCosts = { land: 1200000, dev: { mode: 'pct', val: dev }, mkt: { mode: 'pct', val: mkt }, cls: { mode: 'pct', val: cls } };
    const p = parts(d), rate = (dev + mkt + cls) / 100;
    close(p.fee.dev, dev / 100 * p.project, 'dev', 1e-6);
    close(p.fee.mkt, mkt / 100 * p.project, 'mkt', 1e-6);
    close(p.fee.cls, cls / 100 * p.project, 'cls', 1e-6);
    close(p.fees, rate * p.project, 'fees = rate × project', 1e-6);
    close(p.project, (p.contract + p.soft + 1200000) / (1 - rate), 'closed form', 1e-6);
    close(p.project, p.contract + p.soft + 1200000 + p.fees, 'the total contains its own fees', 1e-6);
    close(p.fee.pctRate, rate, 'pctRate', 1e-12);
  }
  // a mix of dollars and percent: the dollar fee joins the numerator, the percent fees are still a share of the total
  const d = clone(mf); d.projectCosts = { land: 1200000, dev: { mode: 'pct', val: 2.0046 }, mkt: { mode: 'amt', val: 75000 }, cls: { mode: 'amt', val: 0 } };
  const p = parts(d);
  close(p.fee.dev, 0.020046 * p.project, 'dev share', 1e-6);
  close(p.project, (p.contract + p.soft + 1200000 + 75000) / (1 - 0.020046), 'mixed closed form', 1e-6);
  // 9,977,139.35 on the per-SF template; the source's 9,977,139.01 at 2.0046% also carries the per-unit lines' cent
  // rounding (contract −$0.34), asserted in the input-defaults section above.
  assert.equal(cents(p.project), 9977139.35);
  // past the floor the total stays finite and the identity is given up on purpose
  const f = clone(mf); f.projectCosts = { land: 0, dev: { mode: 'pct', val: 60 }, mkt: { mode: 'pct', val: 40 }, cls: { mode: 'amt', val: 0 } };
  const pf = parts(f);
  close(pf.project, (pf.contract + pf.soft) / R.FEE_FLOOR, 'floored', 1e-6);
  assert.ok(Number.isFinite(pf.project));
});

console.log('fz-budget tests passed (' + checks + ' checks)');
