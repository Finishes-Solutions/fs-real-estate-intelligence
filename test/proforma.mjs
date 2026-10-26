// Offline tests for the pro forma (lib/proforma.mjs): the one-page method reproduces TestFit's custom pro forma for
// "The Commons Plaza" to the dollar, and the schedule model gives sane numbers on a real layout.
import assert from 'node:assert/strict';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), PF = await import('../lib/proforma.mjs');

// ---- TestFit's sheet: same inputs, same answers ----
const tf = PF.simple({ nrsf: 466560, gsf: 557115, land: 10e6, hard: 22e6, ti: 2e6, soft: 2.5e6, contPct: 7, finFee: 2.2e6, rentPsf: 30, recoveryPct: 85, otherPsf: 1, vacancyPct: 6, opexPsf: 8.5,
  ltc: 65, rate: 6, amort: 25, exitCap: 6.5, marketCap: 6.25, dispPct: 2.5, rentGrowth: 2.5, expGrowth: 2, hold: 5 });
const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, a + ' vs ' + b);
near(tf.cost, 40240000); near(tf.debt, 26156000); near(tf.equity, 14084000); near(tf.ds, 2046098); near(tf.noi, 12798441); near(tf.egi, 16764201); near(tf.gpr, 17834256);
near(tf.value, 204775050); near(tf.years[0].noi, 13122387); near(tf.years[4].cf, 12455946); near(tf.sale, 228686079); near(tf.net, 222968927); near(tf.bal, 23468583); near(tf.toEq, 199500343);
near(tf.ops, 58787602, 2); near(tf.profit, 244203945, 2);
assert.equal((tf.yoc * 100).toFixed(2), '31.81'); assert.equal((tf.dscr).toFixed(2), '6.26'); assert.equal((tf.coc * 100).toFixed(2), '76.34');
assert.equal((tf.unlevIrr * 100).toFixed(2), '61.51'); assert.equal((tf.levIrr * 100).toFixed(2), '114.44'); assert.equal(tf.multiple.toFixed(2), '18.34');

// ---- a real layout through the schedule model ----
const mk = (o, pts) => { const k = 364567 * Math.cos(o[1] * Math.PI / 180); return { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(([x, y]) => [o[0] + x / k, o[1] + y / 364567])] }; };
const b = S.unionParcels([mk([-95.98, 30.06], [[0, 0], [920, 0], [920, 259], [822, 259], [822, 378], [0, 378]])]);
const plan = { ...b, front: b.ring.findIndex((p, i) => S.outwardOf(b.ring, i)[0] < -0.9), setbacks: S.SETBACKS, program: { use: 'multifamily' } };
plan.elements = L.layoutOptions(plan, plan.program)[0].elements;
const A = PF.defaults(plan, 1500000), R = PF.run(plan, A);
assert.ok(R.P.units > 120 && R.P.mix.length === 4, 'units by type from the plan');
assert.ok(R.sched.pre === 9 && R.sched.build >= 14 && R.sched.build <= 20 && R.sched.lease >= 6, 'schedule ' + JSON.stringify(R.sched));
assert.ok(R.budget.total / R.P.units > 150000 && R.budget.total / R.P.units < 240000, 'about $150-240k a unit: ' + Math.round(R.budget.total / R.P.units));
assert.ok(R.budget.interest > 0 && R.budget.interest < 0.12 * R.budget.total, 'construction interest');
assert.ok(R.ops.noi > 0 && R.returns.yoc > 0.04 && R.returns.yoc < 0.08, 'yield on cost ' + R.returns.yoc);
assert.ok(Number.isFinite(R.returns.unlevIrr) && R.returns.unlevIrr > -0.2 && R.returns.unlevIrr < 0.3, 'unlevered IRR ' + R.returns.unlevIrr);
assert.ok(R.simple.unlevIrr > R.returns.unlevIrr, 'the no-schedule method reads higher');
assert.ok(R.monthly.cost.reduce((s, v) => s + v, 0) > 0.99 * (R.budget.budget), 'every budget dollar is spent in the schedule');
const wb = PF.workbook(R, 'Test'); assert.ok(wb['One page (TestFit method)'].some(r => r.some(c => c?.f?.startsWith('IRR('))));
// for-sale homes
const hp = { ...plan, program: { use: 'sfr' } }; hp.elements = L.layoutOptions(hp, hp.program)[0].elements;
const H = PF.run(hp, { ...PF.defaults(hp, 1500000), forSale: true }); assert.ok(H.forSale && H.exit.sales > H.budget.total * 0.7 && Number.isFinite(H.returns.margin) && H.sched.lease >= 4, 'for-sale homes: sales ' + Math.round(H.exit.sales) + ' cost ' + Math.round(H.budget.total));

// ---- realistic cases, the arithmetic checked by hand (each figure worked out on paper from the defaults' basis) ----
// The compact metrics a scenario passes: building sf, units, parking, detention and acres. Site prep covers what's
// built, paved and dug plus a third (not the whole lot); paving outside the lots is a third of the lots' ~300 sf a space.
{ // a 25,000 sf retail strip, NNN, on 2.5 acres with 100 spaces and a 1.375 ac-ft pond; land $1.0M
  const R = PF.proFormaOf({ buildingSf: 25000, parking: 100, acres: 2.5, detentionAcFt: 1.375 }, 'retail', { landPrice: 1e6 }), b = R.budget, o = R.ops;
  near(R.area.gross, 25000); near(R.area.leasable, 24250); // 97% leasable
  near(b.land, 1015000); near(b.hard, 2875000); // $1.0M + 1.5% closing; 25,000 × $115
  near(b.site, 708749); // prep (25,000 roof + 30,000 lot + 10,000 drives + 14,375 pond = 79,375 sf × 4/3 = 105,833 sf) × $3 = 317,499; drives 10,000 × $7.50 = 75,000; 100 spaces × $2,750 = 275,000; pond 1.375 × $30,000 = 41,250
  near(b.ti, 848750); near(b.lc, 283725); // 24,250 × $35; 24,250 × $26 × 10 yr × 4.5%
  near(b.soft, 430050); near(b.cont, 179187); near(b.fee, 213018); near(b.budget, 6553480); // 12% and 5% of (hard + site) 3,583,749; 4% of everything but the land 5,325,480
  near(o.tax, 114686); // 2.5% × 70% × 6,553,480
  near(o.gpr, 848880); // rent 24,250 × $26 = 630,500 + recoveries 95% × (CAM & insurance 24,250 × $4.75 = 115,187.50 + taxes 114,686) = 218,380
  near(o.egi, 797947); near(o.opex, 258662); near(o.noi, 539285); // EGI: 6% vacancy & credit; opex: CAM 115,188 + reserves 4,850 + taxes 114,686 + 3% management 23,938
  near(R.returns.yoc, o.noi / b.total, 1e-12); assert.ok(R.returns.yoc > 0.07 && R.returns.yoc < 0.085, 'retail yield on cost ' + R.returns.yoc);
  assert.ok(o.lines.some(l => /24,250 sf retail @ \$26\/sf NNN/.test(l.k)), 'rent on the leasable sf, NNN'); assert.deepEqual(R.warnings, [], 'nothing out of the ordinary');
  // the taxes are billed back: a NNN landlord carries only the unrecovered 5%
  assert.ok(o.lines.some(l => l.kind === 'rec' && Math.abs(l.v - 0.95 * (115187.5 + o.tax)) < 1), 'taxes recovered under NNN');
  // site work follows what's built, not the lot: the same center on 6 acres costs the same to build, only the land differs
  const R6 = PF.proFormaOf({ buildingSf: 25000, parking: 100, acres: 6, detentionAcFt: 1.375 }, 'retail', { landPrice: 1e6 }); near(R6.budget.site, b.site); }
{ // 200 garden apartments: 211,800 gross sf (3 stories), 320 spaces, 10 acres, 5.5 ac-ft pond; land $2.0M
  const R = PF.proFormaOf({ buildingSf: 211800, units: 200, parking: 320, acres: 10, detentionAcFt: 5.5 }, 'multifamily', { landPrice: 2e6 }), b = R.budget, o = R.ops;
  assert.deepEqual(R.P.mix.map(t => t.n), [20, 90, 70, 20], 'the usual unit mix: 10 / 45 / 35 / 10%');
  near(R.area.leasable, 183400); assert.ok(R.area.leasable / R.area.gross > 0.85 && R.area.leasable / R.area.gross < 0.88, 'net rentable from the unit mix'); // 20 × 550 + 90 × 760 + 70 × 1,100 + 20 × 1,350
  near(b.hard, 25416000); near(b.site, 2309397); // 211,800 × $120; prep (70,600 roof + 96,000 lots + 32,000 drives + 57,499 pond) × 4/3 × $3 = 1,024,397 + drives 240,000 + 320 × $2,750 + 5.5 × $30,000
  near(b.soft, 3327048); near(b.cont, 1386270); near(b.fee, 1297549); near(b.budget, 35766263); // ~$179k a unit before financing
  near(o.gpr, 4024800); // rents (20 × 1,175 + 90 × 1,425 + 70 × 1,795 + 20 × 2,150) × 12 = 3,844,800 + other income 200 × $75 × 12
  near(o.egi, 3702816); near(o.tax, 625910); near(o.opex, 1706994); near(o.noi, 1995822); // 8% vacancy & credit; 200 × ($4,600 + $250) + taxes + 3% management
  assert.ok(R.budget.total / 200 > 175000 && R.budget.total / 200 < 215000, 'all-in about $190k a unit: ' + Math.round(R.budget.total / 200));
  assert.ok(R.returns.yoc > 0.048 && R.returns.yoc < 0.058, 'a thin garden-apartment yield, Houston 2026: ' + R.returns.yoc); }
{ // 90,000 sf climate-controlled self storage (3 stories), 3 acres, 10 spaces, 1.65 ac-ft pond; land $780k
  const R = PF.proFormaOf({ buildingSf: 90000, climateSf: 90000, parking: 10, acres: 3, detentionAcFt: 1.65 }, 'storage', { landPrice: 780000 }), b = R.budget, o = R.ops;
  near(R.area.leasable, 64800); // 72% net rentable
  near(b.hard, 6120000); near(b.site, 289499); near(b.soft, 576855); near(b.budget, 8390802); // 90,000 × $68; soft 9% for a simple building
  near(o.gpr, 1049760); near(o.egi, 923789); near(o.tax, 146839); near(o.opex, 390186); near(o.noi, 533602); // 64,800 × $1.35 × 12; 12% economic vacancy; $2.75 + $0.15 reserves a sf, taxes, 6% management
  assert.equal(o.recoverable, 0, 'storage tenants pay gross rent'); assert.ok(o.opex / o.egi > 0.35 && o.opex / o.egi < 0.5, 'a storage expense ratio'); }
{ // 8 pumps and a 4,500 sf c-store on 2 acres, 18 spaces, 1.1 ac-ft; land $1.3M. Ground-leased by default
  const C = { buildingSf: 4500, pumps: 8, parking: 18, acres: 2, detentionAcFt: 1.1 }, R = PF.proFormaOf(C, 'fuel', { landPrice: 1.3e6 }), b = R.budget, o = R.ops;
  near(b.hard, 0); near(b.site, 79400); near(b.budget, 1416114); // the retailer builds; the pad delivered: (4,500 + 5,400 + 1,800 + 11,500 pond) × 4/3 × $3 × ½ + 1.1 × $30,000
  near(o.gpr, 180000); near(o.tax, 0); near(o.noi, 174600); // 8 × $22,500 ground rent; the tenant pays the taxes; 3% management
  const W = PF.proFormaOf(C, 'fuel', { landPrice: 1.3e6, fuel: { mode: 'owner' } });
  near(W.budget.hard, 2235500); near(W.ops.gpr, 1032000); near(W.ops.storeOpex, 567600); assert.equal(W.A.marketCap, 8, 'an operating business'); // store 4,500 × $275 + canopy 4,800 × $60 + 8 pumps × $45,000 + tanks $350,000; fuel 8 × 160,000 × 30¢ + inside 4,500 × $450 × 32%; store costs 55%
}
// every use: leasable never more than gross, a finite NOI, no undefined lines, a yield in a plausible band
for (const [use, c] of Object.entries({ retail: { buildingSf: 25000, parking: 100, acres: 2.5 }, restaurant: { buildingSf: 6000, parking: 60, acres: 1.2 }, office: { buildingSf: 40000, parking: 140, acres: 3.5 }, medical: { buildingSf: 20000, parking: 100, acres: 2.5 },
  hotel: { buildingSf: 60000, parking: 110, acres: 3 }, church: { buildingSf: 25000, parking: 250, acres: 5 }, industrial: { buildingSf: 150000, parking: 100, acres: 9 }, storage: { buildingSf: 90000, parking: 10, acres: 3 }, multifamily: { buildingSf: 211800, units: 200, parking: 320, acres: 10 },
  townhomes: { buildingSf: 120000, units: 60, parking: 15, acres: 6 }, duplex: { buildingSf: 72000, units: 40, parking: 0, acres: 6 }, sfr: { buildingSf: 100000, units: 40, parking: 0, acres: 10 }, fuel: { buildingSf: 4500, pumps: 8, parking: 18, acres: 2 }, other: { buildingSf: 10000, parking: 40, acres: 2 } })) {
  const R = PF.proFormaOf(c, use, {});
  for (const [k, u] of Object.entries(R.area.byUse)) assert.ok(u.leasable <= u.gross + 1e-6 && u.leasable >= 0, use + ': leasable ≤ gross (' + k + ')');
  assert.ok(R.area.leasable <= R.area.gross + 1e-6, use + ': leasable ≤ gross'); assert.ok(Number.isFinite(R.ops.noi) && Number.isFinite(R.budget.total) && R.budget.total > 0, use + ': finite');
  assert.ok(!R.ops.lines.some(l => /undefined|NaN/.test(l.k) || !Number.isFinite(l.v)), use + ': lines ' + R.ops.lines.map(l => l.k).join(' | '));
  if (use === 'church') { assert.equal(R.returns.yoc, null, 'a church built for its congregation: a budget, no yield'); assert.equal(R.ops.tax, 0, 'and no property tax'); continue; }
  assert.ok(R.returns.yoc > 0.035 && R.returns.yoc < 0.13, use + ': yield on cost ' + R.returns.yoc);
  if (use === 'office' || use === 'medical') { const u = R.area.byUse[use]; near(u.leasable, u.usable * u.load, 1e-6); assert.ok(u.usable < u.leasable, use + ': rentable = usable × load factor'); }
  if (use === 'hotel') assert.ok(R.area.keys === 109 && R.budget.ffe === 109 * 18000 && R.ops.lines[0].kind === 'hotel', 'a hotel by keys, with its FF&E'); }
// an efficiency the user sets moves the leasable area and the rent; a scenario's own leasable sf holds otherwise
{ const a = PF.proFormaOf({ buildingSf: 40000, parking: 140, acres: 3.5 }, 'office', {}), b = PF.proFormaOf({ buildingSf: 40000, parking: 140, acres: 3.5 }, 'office', { eff: { office: 0.8 }, load: { office: 1.1 } });
  near(a.area.leasable, 40000 * 0.85 * 1.12, 1e-6); near(b.area.leasable, 40000 * 0.8 * 1.1, 1e-6); assert.ok(b.ops.noi < a.ops.noi);
  near(PF.proFormaOf({ buildingSf: 25000, leasableSf: 24000, parking: 100, acres: 2.5 }, 'retail', {}).area.leasable, 24000);
  near(PF.proFormaOf({ buildingSf: 25000, leasableSf: 24000, parking: 100, acres: 2.5 }, 'retail', { eff: { retail: 0.95 } }).area.leasable, 23750);
  near(PF.proFormaOf({ buildingSf: 25000, leasableSf: 26000, parking: 100, acres: 2.5 }, 'retail', {}).area.leasable, 25000, 1e-6); }
// an AI-crafted RV park lays out as storage's RV rows but rents sites, not storage spaces
{ const M = { acres: 6, siteSf: 261360, devSf: 200000, uses: { storage: { gsf: 2400, officeGsf: 2400, rv: 60, eff: { climate: 0.72, drive: 0.92 } } }, mix: [], stalls: 10, deck: 0, parkingSf: 90000, truckSf: 0, pavedSf: 40000, detentionAcFt: 3.3, vaultAcFt: 0, amenities: {}, outdoorRentSf: 0, fuel: null, trucks: 0 };
  const park = PF.proFormaOf({ ...M, custom: 'RV park' }, null, {}), yard = PF.proFormaOf({ ...M, custom: 'Boat storage' }, null, {});
  assert.ok(park.ops.lines.some(l => /60 RV \/ boat spaces @ \$550\/mo/.test(l.k)) && yard.ops.lines.some(l => /@ \$125\/mo/.test(l.k)), 'an RV park’s sites at a park’s rent; boat storage at storage’s');
  assert.ok(park.ops.storeOpex >= 60 * 2400 && !park.warnings.some(w => w.key === 'storageRent.rv'), 'its site costs, and no note for a park’s rent'); }
// costs the old model missed: a parking garage's spaces, underground storage
{ const c = { buildingSf: 60000, parking: 50, acres: 2, detentionAcFt: 1.1 }, a = PF.proFormaOf(c, 'office', {}), d = PF.proFormaOf({ ...c, deck: 200 }, 'office', {}), v = PF.proFormaOf({ ...c, vaultAcFt: 1.1 }, 'office', {});
  near(d.budget.site - a.budget.site, 200 * 27500); assert.ok(v.budget.storm === 1.1 * 420000 && v.budget.siteParts.pond === 0, 'the vault instead of the pond'); }

// ---- the plan and its metrics: the pro forma is a pure function of them ----
{ const M = PF.metricsOf(plan); assert.ok(M.acres > 0 && M.uses.multifamily.gsf > 0 && M.mix.length === 4 && M.stalls > 0 && M.detentionAcFt > 0 && M.devSf <= M.siteSf, 'metrics from the plan');
  assert.deepEqual(JSON.parse(JSON.stringify(M)), M, 'plain data');
  const R2 = PF.proFormaOf(M, null, A); near(R2.ops.noi, R.ops.noi, 1e-6); near(R2.budget.total, R.budget.total, 1e-6);
  const s = PF.proFormaSummary(R); assert.deepEqual(Object.keys(s).slice(0, 5), ['totalCost', 'noi', 'yieldOnCost', 'value', 'profit']);
  assert.equal(s.totalCost, Math.round(R.budget.total)); assert.equal(s.profit, s.value - s.totalCost); assert.ok(s.leasableSf > 0 && s.leasableSf <= s.grossSf); assert.equal(s.basis, 'Market assumption, not verified');
  // three scenarios side by side: the same use, three sets of metrics
  const three = [{ buildingSf: 300000, units: 300, parking: 480, acres: 11.6 }, { buildingSf: 255000, units: 250, parking: 400, acres: 11.6 }, { buildingSf: 205000, units: 200, parking: 330, acres: 11.6 }].map(c => PF.proFormaSummary(PF.proFormaOf(c, 'multifamily', { landPrice: 2.3e6 })));
  assert.ok(three[0].totalCost > three[1].totalCost && three[1].totalCost > three[2].totalCost && three.every(x => x.yieldOnCost > 0.04), 'scenarios: ' + three.map(x => x.totalCost + ' ' + x.yieldOnCost.toFixed(4)).join(', ')); }

// ---- sanity ranges: a calm note at the edges ----
assert.equal(PF.checkInput('commRent.retail', 48).text, 'Retail rent $48/sf NNN is above the usual $18–35 here; check it.');
assert.equal(PF.checkInput('commRent.retail', 35), null); assert.equal(PF.checkInput('commRent.retail', 18), null); assert.ok(PF.checkInput('commRent.retail', 35.5)); assert.match(PF.checkInput('commRent.retail', 17.5).text, /below the usual \$18–35/);
assert.match(PF.checkInput('rents.1 BR', 2600).text, /^1 BR rent \$2,600\/mo is above the usual \$1,050–1,800 here/);
assert.match(PF.checkInput('eff.office', 0.95).text, /^Office usable share 95% is above the usual 78–90%/); assert.match(PF.checkInput('storageRent.climate', 2).text, /\$2\.00\/sf a month is above the usual \$0\.85–1\.75/);
assert.equal(PF.checkInput('commRent.church', 0), null, 'no rent for a church is fine');
{ const c = { buildingSf: 25000, parking: 100, acres: 2.5 }, keys = R => R.warnings.map(w => w.key);
  const hi = PF.proFormaOf(c, 'retail', { commRent: { retail: 48 } }); assert.ok(keys(hi).includes('commRent.retail') && keys(hi).includes('yoc') && hi.warnings.find(w => w.key === 'yoc').text.includes('over 12%'), 'a rent typed too high: its note and the yield flag: ' + keys(hi));
  const lo = PF.proFormaOf(c, 'retail', { commRent: { retail: 16 } }); assert.ok(lo.warnings.some(w => w.key === 'yoc' && /under 5%/.test(w.text)) && lo.warnings.some(w => w.key === 'spread'), 'a thin yield and a negative spread');
  assert.ok(PF.proFormaOf(c, 'retail', { marketCap: 4.4 }).warnings.some(w => w.key === 'marketCap' && /4\.4% is outside the usual 4\.5–9%/.test(w.text)));
  assert.ok(!PF.proFormaOf(c, 'retail', { marketCap: 4.5, exitCap: 9 }).warnings.some(w => w.key === 'marketCap' || w.key === 'exitCap'), 'the edges themselves are fine');
  assert.ok(PF.proFormaOf(c, 'retail', { exitCap: 9.25 }).warnings.some(w => w.key === 'exitCap'));
  const d = PF.proFormaOf(c, 'retail', { dscr: 1.0, ltv: 95 }); assert.ok(d.returns.dscr < 1.2 && d.warnings.some(w => w.key === 'dscr'), 'debt coverage under 1.2× when the loan is sized past it: ' + d.returns.dscr);
  assert.ok(!PF.proFormaOf(c, 'retail', {}).warnings.some(w => w.key === 'dscr'), 'the default loan covers'); assert.ok(PF.proFormaOf(c, 'retail', {}).returns.dscr >= 1.2);
  assert.ok(PF.proFormaOf(c, 'retail', { landPrice: 1e7 }).warnings.some(w => w.key === 'landPrice' && /an acre is above/.test(w.text)), 'land far over the usual a acre');
  assert.ok(PF.proFormaOf(c, 'retail', { vacancyPct: 22 }).warnings.some(w => w.text === 'Vacancy 22% is above the usual 3–15% here; check it.')); }

// ---- classification: market assumptions, never a promise ----
{ const R0 = PF.run({ ...plan, pf: { rents: { '1 BR': 1500 } } }, A);
  assert.equal(R0.basis.label, 'Market assumption, not verified'); assert.equal(R0.basis.inputs['rents.1 BR'], 'user'); assert.equal(R0.basis.inputs['rents.2 BR'], 'market'); assert.equal(PF.BASIS[R0.basis.inputs.marketCap].label, 'Market assumption, not verified');
  const src = (await import('node:fs')).readFileSync(new URL('../lib/proforma.mjs', import.meta.url), 'utf8'), ui = (await import('node:fs')).readFileSync(new URL('../src/siteplan.js', import.meta.url), 'utf8');
  const runs = [R0, ...['retail', 'office', 'hotel', 'storage', 'fuel'].map(u => PF.proFormaOf({ buildingSf: 30000, parking: 100, acres: 3 }, u, { commRent: { retail: 60 } }))];
  for (const t of [src, ui, JSON.stringify(runs.map(r => [r.ops.lines, r.warnings, r.basis, PF.proFormaSummary(r)])), JSON.stringify(PF.workbook(R0).Assumptions)]) assert.ok(!/guarantee/i.test(t), 'no “guarantee” wording');
  assert.match(PF.workbook(R0).Assumptions[1][0], /Market assumption, not verified/, 'the workbook says so too'); }
console.log('pro forma ok');

// ---- tiny homes: counted, rented and sold at their own size, not as 1,900 sf houses
{
  const B = await import('../lib/buildings.mjs'), t = B.BUILDING_TYPES.find(x => x.tiny && x.sf === 550);
  const els = Array.from({ length: 10 }, (_, i) => ({ ...B.fromType(t, [20 + i * 25, 60]), id: 't' + i }));
  const plan = { origin: [-95.92, 30.05], ring: [[0, 0], [300, 0], [300, 200], [0, 200]], front: 0, program: { use: 'sfr', units: 10 }, elements: els };
  const R = PF.run(plan, PF.defaults(plan)), A = PF.defaults(plan);
  assert.equal(A.homeRent.sfrtiny, PF.townhomeRent(550), 'rent from a 550 sf home');
  const l = R.ops.lines.find(x => /tiny homes/.test(x.k)); assert.ok(l && /^10 tiny homes @ \$/.test(l.k), 'an income line for 10 tiny homes: ' + R.ops.lines.map(x => x.k).join('; '));
  assert.ok(!R.ops.lines.some(x => /1-story homes/.test(x.k)), 'not counted as 1-story houses');
  const sale = PF.run(plan, { ...A, forSale: true });
  assert.ok(sale, 'a for-sale run works');
}
console.log('pro forma tiny homes ok');
