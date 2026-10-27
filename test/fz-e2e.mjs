// End to end, offline: one project from its parcel to the report data (lib/feasibility/pipeline.mjs) on a frozen slice
// of the platform's market data. Checks the budget roll-up identities, that the pro forma prices exactly the budget,
// that every number has a source, the pro forma fixes (lease-up cash pays the loan first), sensitivity, scenarios,
// overrides, edits and determinism; and that a for-sale and a commercial project run too.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const P = await import('../lib/feasibility/pipeline.mjs'), MK = await import('../lib/feasibility/market.mjs'), F = await import('../lib/feasibility/finance.mjs');
const M0 = await import('../lib/feasibility/model.mjs'), PF = await import('../lib/proforma.mjs');
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, (what || '') + ': ' + a + ' vs ' + b);

const fx = JSON.parse(await readFile(new URL('./fixtures/fz/market/market-2026-10-24.json', import.meta.url)));
const market = MK.marketContext(fx);
// the 7.7-acre FM 362 lot the layout tests use (920 × 378 ft with a notch), in Waller County
const mk = (o, pts) => { const k = 364567 * Math.cos(o[1] * Math.PI / 180); return { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(([x, y]) => [o[0] + x / k, o[1] + y / 364567])] }; };
const lot = mk([-95.98, 30.06], [[0, 0], [920, 0], [920, 259], [822, 259], [822, 378], [0, 378]]);
const parcel = M0.parcelFrom({ key: 'p-fm362', label: 'FM 362 tract', owner: 'Sample Owner LLC', acres: 7.72, landValue: 900000, marketValue: 1200000, address: '100 FM 362', city: 'Waller', zip: '77484', county: 'Waller', geometry: lot }, M0.src('data', 'Test parcel'));
const project = (use, extra = {}) => { const site = P.siteFromParcels([parcel]), opt = P.autoLayout(site, typeof use === 'string' ? { use } : use); assert.ok(opt, 'a layout for ' + JSON.stringify(use));
  return { id: 'e2e-' + (use.use || use), name: 'E2E ' + (use.use || use), parcels: [parcel], plans: [opt], fz: { ...M0.newFeasibility(), ...extra } }; };

// ---- intake: the parcel keeps its address and ZIP ----
assert.equal(parcel.zip, '77484'); assert.equal(M0.intakeFromParcels({}, [parcel]).city, 'Waller');

// ---- apartments ----
const apt = project('multifamily'), s = P.runStudy(apt, { market, today: '2026-10-24' });
assert.deepEqual(s.errors, [], 'a valid project'); assert.ok(!s.missing);
assert.ok(s.site.units > 100 && s.site.spaces >= s.site.required, 'units and parking from the layout: ' + s.site.units);
assert.ok(s.site.envelope && s.site.envelope.ratio > 0.8 && s.site.envelope.ratio < 1, 'buildable envelope measured');
assert.equal(s.planset.scope, 'schematic'); assert.ok(s.planset.sheets.some(x => x.number === 'C-101'), 'the plan set lists its sheets');
assert.ok(s.scope.includes('not a permit set'), 'the scope statement travels with the study');

// budget roll-up identities (the budgeting suite's arithmetic)
const T = s.budget.totals, lines = s.budget.lines.filter(l => !l.off);
near(T.contract, T.hard + T.gcFee + T.contingency, 0.01, 'contract = hard + GC fee + contingency');
near(T.hard, lines.filter(l => l.scope !== 'soft').reduce((a, l) => a + l.amount, 0), 0.01, 'hard = the hard lines');
near(T.soft, lines.filter(l => l.scope === 'soft').reduce((a, l) => a + l.amount, 0), 0.01, 'soft = the soft lines');
near(T.devFee, 0.03 * T.project, 0.01, 'the developer fee is 3% of the total it is part of (closed form)');
near(T.project, T.contract + T.soft + T.land + T.fees, 0.01, 'project = contract + soft + land + fees');
near(T.gcFee, 0.12 * lines.filter(l => l.feeable).reduce((a, l) => a + l.amount, 0), 0.01, 'GC fee: 12% of the library lines only');
near(T.contingency, 0.05 * T.hard, 0.01, 'contingency 5% of hard');
near(Object.values(s.budget.budgetIn).reduce((a, v) => a + v, 0), T.project, 0.01, 'what the pro forma gets adds up to the project cost');
if (s.budget.csi) near(s.budget.csi.contract ?? T.contract, T.contract, 0.5, 'CSI schedule reconciles to the contract sum');
assert.ok(lines.some(l => l.id.startsWith('lib:')) && lines.some(l => l.id.startsWith('site:')), 'library building lines and layout site lines');
assert.ok(!lines.some(l => l.csi === '32 10 00'), 'the workbook’s paving line is replaced by the layout’s own (no double count)');
for (const l of s.budget.lines) { assert.ok(l.source?.kind && l.source?.label, 'every budget line has a source: ' + l.id); assert.ok(Number.isFinite(l.amount), l.id); }
// escalation: PPI construction materials 2026-08 → 2026-09, on the materials share
const e = s.budget.escalation.library.toDate; near(e.factor, 1 + 0.55 * (378.61 / 375.792 - 1), 1e-12, 'to-date escalation from the PPI');

// the pro forma prices exactly this budget, then adds the financing
const R = s.pf.R; near(R.budget.budget, T.project, 0.5, 'pro forma budget = project budget'); assert.equal(R.budget.from, 'budget');
near(R.budget.total, T.project + R.budget.interest + R.budget.loanFees, 0.5, 'total development cost = budget + interest + loan fees');
// sources: every assumption has one; the rates come from the platform's FRED data
for (const a of s.register) { assert.ok(a.source?.kind && a.source.label, 'source for ' + a.key); assert.ok(Number.isFinite(+a.value), a.key); }
const rate = s.register.find(a => a.key === 'rate'), perm = s.register.find(a => a.key === 'permRate');
near(rate.value, 3.9 + 3, 1e-9, 'construction rate = SOFR + 3%'); assert.equal(rate.source.kind, 'derived'); near(perm.value, 4.96 + 1.75, 1e-9, 'permanent rate = 10-yr + 1.75%');
assert.equal(s.register.find(a => a.key === 'landPrice').value, 900000, 'land: the appraised land value by default (not the market value with buildings)');
assert.ok(s.register.find(a => a.key === 'rents.1 BR').marketCheck.includes('77484'), 'rents carry the ZIP’s ZORI as a market check');
// returns: the NPV at the IRR is zero; lease-up income pays the construction loan before anything is distributed
const lev = R.monthly.levered; near(F.npvMonthly(s.pf.headline.levIrr, lev), 0, 1, 'levered NPV at the levered IRR');
assert.ok(Math.max(...lev.slice(0, R.sched.toStabilize)) <= 1e-6, 'no distribution before the refinance while the construction loan is out');
assert.ok(Number.isFinite(s.pf.headline.npvLev) && Number.isFinite(s.pf.headline.yoc), 'NPV and yield on cost');
// the hold analysis on the fixture-proven engine, bought at the total development cost
assert.ok(!s.hold.error, s.hold.error); near(s.hold.result.summary.purchasePrice, Math.round(R.budget.total), 1, 'held at its cost');
assert.ok(s.pf.breakEven?.kind === 'rent' && s.pf.breakEven.rent > 0 && s.pf.breakEven.rentForTarget > s.pf.breakEven.rent, 'break-even and target rents');
// sensitivity: sorted by swing; each grid's centre cell is the base case
const tor = s.sensitivity.tornado; for (let i = 1; i < tor.rows.length; i++) assert.ok((tor.rows[i - 1].swing ?? 0) >= (tor.rows[i].swing ?? 0), 'tornado sorted');
assert.ok(tor.rows.find(r => r.id === 'cost').lo < tor.rows.find(r => r.id === 'cost').hi, 'each driver’s low case is the unfavourable one: costs up, returns down');
assert.ok(tor.rows.every(r => r.lo <= tor.base + 1e-9 && r.hi >= tor.base - 1e-9), 'every low case at or below the base, every high case at or above');
for (const g of s.sensitivity.grids) near(g.cells[2][2], tor.base, 1e-9, 'grid centre = base');
assert.ok(s.risks.length && s.risks.every(r => ['high', 'medium', 'low'].includes(r.level)), 'risk register'); assert.ok(s.facts.length > s.register.length, 'fact register');
// a cost case scales the budget's lines before the roll-up: soft costs, contingency and the developer fee follow; the hold grows rents from the end of construction
{ const ctx = P.prepare(apt, { market }), a = P.evaluate(ctx, ctx.values), b = P.evaluate(ctx, ctx.values, { costFactor: 1.1 });
  near(b.pf.R.budget.soft, a.pf.R.budget.soft * 1.1, 0.01, 'soft costs +10%'); near(b.budget.totals.devFee, 0.03 * b.budget.totals.project, 0.01, 'the developer fee still 3% of the (larger) total'); assert.ok(b.pf.R.budget.fee > a.pf.R.budget.fee * 1.05, 'and it rose with the cost');
  near(b.budget.totals.contingency, a.budget.totals.contingency * 1.1, 0.05, 'contingency follows the hard cost'); near(b.pf.R.budget.land, a.pf.R.budget.land, 0, 'land unchanged');
  const yr = Math.floor((R.sched.toStabilize + 1 - R.sched.pre - R.sched.build) / 12); near(s.hold.result.summary.year1PotentialIncome, Math.round(R.ops.lines.filter(l => l.kind === 'rent' || l.kind === 'rec').reduce((x, l) => x + l.v, 0) * (1 + R.A.rentGrowth / 100) ** yr), 1, 'hold year-1 income grown as the development model grows it'); }
// determinism
const s2 = P.runStudy(apt, { market, today: '2026-10-24' }); assert.equal(s2.inputsHash, s.inputsHash); assert.deepEqual(s2.pf.headline, s.pf.headline, 'same inputs, same answer');

// ---- the user's changes: an override, a budget edit, a scenario with a unit mix and higher rates ----
{ const p = structuredClone(apt); p.fz.overrides = { 'rents.1 BR': 1600 }; const t = P.runStudy(p, { market, sensitivity: false });
  const a = t.register.find(x => x.key === 'rents.1 BR'); assert.ok(a.edited && a.source.kind === 'user' && a.default === 1425, 'an edited rent is the user’s');
  assert.ok(t.pf.headline.levIrr > s.pf.headline.levIrr, 'higher rent, higher return'); assert.notEqual(t.inputsHash, s.inputsHash, 'a change changes the hash'); }
{ const p = structuredClone(apt), id = s.budget.lines.find(l => l.csi === '11 31 00').id; p.fz.budgetEdits = { [id]: { off: true } }; const t = P.runStudy(p, { market, sensitivity: false });
  const was = s.budget.lines.find(l => l.id === id).amount; assert.ok(t.budget.lines.find(l => l.id === id).source.kind === 'user', 'an edited line is the user’s');
  assert.ok(T.project - t.budget.totals.project > was && T.project - t.budget.totals.project < was * 1.3, 'a line off: the project drops by it plus its markups'); }
{ const p = structuredClone(apt); p.fz.scenarios = [{ id: 'hi-rate', name: 'Rates +1%', overrides: { rate: 7.9, permRate: 7.71 } }, { id: 'mix', name: 'More 1 BR', overrides: {}, mix: [{ name: 'Studio', sf: 550, pct: 10 }, { name: '1 BR', sf: 760, pct: 70 }, { name: '2 BR', sf: 1100, pct: 20 }] }];
  const c = P.compareScenarios(p, { market }); assert.deepEqual(c.map(x => x.id), ['base', 'hi-rate', 'mix']);
  near(c[0].headline.levIrr, s.pf.headline.levIrr, 1e-12, 'base case as in the study'); assert.ok(c[1].headline.levIrr < c[0].headline.levIrr, 'higher rates, lower return');
  assert.equal(c[2].units, c[0].units, 'a mix change keeps the unit count'); assert.notEqual(c[2].headline.noi, c[0].headline.noi, 'and changes the income'); }
assert.deepEqual(M0.validateProject({ ...apt, fz: { ...apt.fz, overrides: { nope: 1 } } }, { knownKeys: new Set(s.register.map(a => a.key)) }), ['The study changes an unknown assumption: nope.']);
{ const p = structuredClone(apt); p.fz.intake = { ...p.fz.intake, landBasis: 'asking', landPrice: 1350000 }; const t = P.runStudy(p, { market, sensitivity: false });
  assert.equal(t.register.find(a => a.key === 'landPrice').value, 1350000); near(t.budget.totals.land, 1350000 * 1.015, 0.01, 'the asking price plus closing'); }

// ---- pro forma: a budget given replaces the parametric lines exactly ----
{ const Mx = { buildingSf: 25000, parking: 100, acres: 2.5, detentionAcFt: 1.375 }, R0 = PF.proFormaOf(Mx, 'retail', { landPrice: 1e6 }), R1 = PF.proFormaOf(Mx, 'retail', { landPrice: 1e6, budgetIn: { hard: 3e6, site: 5e5 } });
  near(R1.budget.hard, 3e6, 0); near(R1.budget.site, 5e5, 0); near(R1.budget.land, R0.budget.land, 0, 'lines not given stay parametric'); assert.equal(R0.budget.from, 'parametric'); }

// ---- for-sale townhomes and a retail center run end to end ----
{ const p = project('townhomes'); p.fz.overrides = {}; const t = P.runStudy(p, { market, sensitivity: false });
  assert.ok(!t.missing && t.pf.headline.totalCost > 0, 'townhomes priced'); assert.ok(t.budget.lines.some(l => l.id.startsWith('lib:')), 'townhomes use the workbook lines'); }
{ const p = project({ use: 'retail', gfa: 40000 }), t = P.runStudy(p, { market, sensitivity: false });
  assert.ok(!t.budget.lines.some(l => l.id.startsWith('lib:')), 'retail has no workbook lines');
  // (retail is priced from the team's 2024–25 budgets, line by line: shell and services; the interiors are the TI allowance's)
  const tb = t.budget.lines.filter(l => l.id.startsWith('tb:retail|'));
  assert.ok(tb.some(l => l.id === 'tb:retail|walls') && !tb.some(l => l.grp === 'Interiors') && !t.budget.lines.some(l => l.id === 'par:hard|retail'), 'team-budget building lines, no interiors: ' + tb.map(l => l.id).join(','));
  assert.ok(t.budget.lines.some(l => l.id === 'par:ti') && t.budget.lines.some(l => l.id === 'par:soft'), 'the TI allowance and the soft costs');
  const fee = t.budget.lines.find(l => l.id === 'tb:fee'); near(fee.amount, tb.reduce((s, l) => s + l.amount, 0) * 0.10, 0.01, 'the budgets\' 10% contractor fee on their lines');
  near(t.budget.totals.gcFee, 0, 1e-9, 'no workbook GC fee on top'); assert.ok(!t.register.some(a => a.key === 'hard.retail'), 'no parametric retail rate in the register'); assert.ok(t.pf.headline.noi > 0 && t.pf.breakEven, 'a retail NOI and its break-even'); }

// ---- a synced document is data: a scenario's unit mix is read as numbers (no markup reaches the page) ----
{ const f = M0.fzOf({ fz: { scenarios: [{ id: 'x', name: 'X', overrides: {}, mix: [{ name: '1 BR', sf: '"><img src=x onerror=alert(1)>', pct: '50' }] }] } });
  assert.deepEqual(f.scenarios[0].mix, [{ name: '1 BR', sf: 0, pct: 50 }]); }

// ---- a project with no layout yet says what's missing ----
{ const p = { id: 'empty', name: 'Empty', parcels: [parcel], plans: [] }, t = P.runStudy(p, { market }); assert.equal(t.missing, 'site'); assert.equal(t.status.site.state, 'ready'); assert.equal(t.status.budget.state, 'blocked'); }

console.log('fz e2e passed: ' + s.site.units + ' units, project $' + Math.round(T.project).toLocaleString('en-US') + ', levered IRR ' + (s.pf.headline.levIrr * 100).toFixed(2) + '%');
