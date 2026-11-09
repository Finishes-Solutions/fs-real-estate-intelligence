// The Finishes budget library (lib/feasibility/data/fs-budget-library-v1.mjs, run by lib/feasibility/budgetlib.mjs) and
// its place in a project budget (lib/feasibility/budget.mjs): houses, cottages and townhomes priced line by line with a
// low / likely / high range; apartments, duplexes and every other use on the rates they had. No network, no files
// beyond the repo's own.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const BL = await import('../lib/feasibility/budgetlib.mjs'), D = await import('../lib/feasibility/data/fs-budget-library-v1.mjs');
const PF = await import('../lib/proforma.mjs'), BB = await import('../lib/feasibility/budget.mjs'), AS = await import('../lib/feasibility/assumptions.mjs'), CL = await import('../lib/feasibility/costlib.mjs');
let checks = 0;
const test = (name, fn) => { try { fn(); checks++; } catch (e) { console.error('FAILED: ' + name); throw e; } };
const close = (a, b, what, tol = 0.005) => assert.ok(Math.abs(a - b) <= tol, what + ': ' + a + ' vs ' + b);
const sum = (ls, k = 'amount') => ls.reduce((s, l) => s + l[k], 0);

// =====================================================================================================================
// the calculator against the workbook's own BUDGET_ENGINE tab
// =====================================================================================================================
test('the data: 92 lines, four with no rate, nothing but the computable layer', () => {
  assert.equal(D.LINES.length, 92); assert.equal(new Set(D.LINES.map(l => l.id)).size, 92);
  assert.deepEqual(D.LINES.filter(l => l.likely == null).map(l => l.id), ['T-071', 'T-072', 'T-073', 'T-076']);
  const keys = ['id', 'code', 'csi', 'group', 'phase', 'desc', 'cond', 'driver', 'factor', 'per', 'low', 'likely', 'high', 'confidence', 'mf'].sort();
  for (const l of D.LINES) { assert.deepEqual(Object.keys(l).sort(), keys, l.id + ' carries no vendor, basis note or source file'); assert.ok(l.low == null || (l.low <= l.likely && l.likely <= l.high), l.id + ' low ≤ likely ≤ high'); }
  const C = BL.conditionsOf(BL.inputsOf()), Dr = BL.driversOf(BL.inputsOf());
  for (const l of D.LINES) { assert.ok(l.cond in C, l.id + ' condition ' + l.cond); assert.ok(l.driver in Dr, l.id + ' driver ' + l.driver); assert.ok(/^(\d\d \d\d \d\d|SC-FS\d+)$/.test(l.csi), l.id + ' CSI ' + l.csi); }
});
test('the workbook\'s default house (1,402 sf, one storey, Dayton): its drivers and its totals', () => {
  const r = BL.priceOf({}), d = r.drivers;
  close(d.TOTAL_SF, 1878.68, 'total sf'); close(d.SLAB_SF, 1878.68, 'slab'); close(d.ROOF_SQ, 28.931672, 'roof squares', 1e-6); close(d.WINDOWS, 8.7625, 'windows', 1e-6); assert.equal(d.EXT_DOORS, 3); close(d.BOARD_SF, 7430.6, 'board sf');
  close(d.BOARD_FT, 6477.24, 'board ft'); close(d.TOPS_SF, 67.296, 'tops', 1e-6); close(d.LVT_SF, 734.3676, 'lvt', 1e-6); close(d.CARPET_SF, 625.5724, 'carpet', 1e-6); assert.equal(d.HVAC_TONS, 2.5); close(d.MASONRY_SF, 436.7931, 'masonry', 1e-4);
  assert.equal(r.lines.length, 70); assert.equal(r.unpriced.length, 0);
  // the workbook's engine gives exactly this HIGH; its LOW and LIKELY differ only by the insulation line, re-based here
  close(r.totals.high, 189217.437437, 'high', 1e-4); close(r.totals.likely, 143061.375185, 'likely', 1e-4); close(r.totals.low, 117049.776767, 'low', 1e-4);
  const by = id => r.lines.find(x => x.id === id); close(by('T-018').qty * by('T-018').low, 14540.9832, 'slab low', 1e-4); close(by('T-042').qty * by('T-042').low, 5340, 'HVAC low');
});
test('conditions switch lines: Houston adders, elevated foundations, storeys, options stay off', () => {
  const ids = o => BL.priceOf(o).lines.map(x => x.id), base = ids({});
  assert.ok(base.includes('T-040') && !base.includes('T-039') && !base.includes('T-034') && !base.includes('T-085'), 'Dayton adder; no Houston adder; options off');
  const coh = ids({ jurisdiction: 'COH' }); for (const k of ['T-004', 'T-030', 'T-039', 'T-079']) assert.ok(coh.includes(k), k); assert.ok(!coh.includes('T-040'));
  const el = ids({ elevated: 'Y' }); assert.ok(el.includes('T-019') && !el.includes('T-018') && !el.includes('T-020'));
  const two = ids({ stories: 2 }); assert.ok(two.includes('T-025') && two.includes('T-066') && !two.includes('T-024'));
  assert.equal(BL.inputsOf({ jurisdiction: 'KATY', product_type: 'CASTLE', stories: 9 }).jurisdiction, 'OTHER'); assert.equal(BL.inputsOf({ product_type: 'CASTLE' }).product_type, 'SF_DETACHED'); assert.equal(BL.inputsOf({ stories: 9 }).stories, 4);
  assert.deepEqual(BL.priceOf({}, { skip: ['T-012', 'T-013'] }).skipped, ['T-012', 'T-013']);
});
test('townhomes and apartments take the multifamily rates; a line with no rate is listed, not zero', () => {
  const th = BL.priceOf({ product_type: 'TOWNHOME', units: 40, buildings: 8, living_sf_per_unit: 1345, stories: 2, attached: 'Y', jurisdiction: 'WALLER' });
  assert.equal(th.lines.find(x => x.id === 'T-035').likely, 8550); assert.ok(th.lines.find(x => x.id === 'T-035').mf); assert.ok(th.lines.some(x => x.id === 'T-075') && th.lines.some(x => x.id === 'T-070'));
  const apt = BL.priceOf({ product_type: 'APARTMENT', units: 110, buildings: 5, living_sf_per_unit: 850, stories: 3, garage: 'N', baths_per_unit: 1, jurisdiction: 'WALLER' });
  assert.deepEqual(apt.unpriced.map(x => x.id), ['T-071', 'T-072', 'T-073', 'T-076']); assert.ok(!apt.lines.some(x => x.likely == null));
  close(apt.drivers.EXT_STAIR_FLIGHTS, 20, 'stair flights'); close(apt.drivers.TOTAL_SF, 110 * 850 * 1.18, 'apartment gross');
  close(BL.priceOf({ living_sf_per_unit: 1000, total_sf_per_unit: 1500 }).drivers.TOTAL_SF, 1500, 'a plan\'s own gross replaces the ratio');
});
test('jurisdiction from the intake; the benchmark band', () => {
  assert.equal(BL.jurisdictionOf({ city: 'Houston' }), 'COH'); assert.equal(BL.jurisdictionOf({ city: 'Dayton', county: 'Liberty' }), 'DAYTON'); assert.equal(BL.jurisdictionOf({ city: 'Katy', county: 'Waller' }), 'OTHER');
  assert.equal(BL.jurisdictionOf({ county: 'Waller County' }), 'WALLER'); assert.equal(BL.jurisdictionOf({}), 'OTHER'); assert.equal(BL.jurisdictionOf({ jurisdiction: 'City of Conroe' }), 'CONROE');
  const b = BL.benchOf('SF_DETACHED'); assert.equal(b.low, 69.83); assert.equal(b.high, 108.61); assert.equal(BL.benchOf('NOPE'), null);
});

// =====================================================================================================================
// in a project budget
// =====================================================================================================================
const budget = (use, c, { place = { city: 'Waller', county: 'Waller' }, edits = {}, meters = null, tweak = null, costFactor = 1 } = {}) => {
  const M = PF.compactMetrics(c, use); if (tweak) tweak(M);
  const reg = AS.registerFor(M, {}), v = AS.valuesOf(reg), R0 = PF.proFormaOf(M, null, AS.pfOverrides(v));
  return { B: BB.buildBudget(M, { ...AS.budgetInputs(v), escalationPct: 0 }, { R0, place, edits, meters, costFactor }), reg, R0 };
};
const houses = { buildingSf: 40 * 1600, units: 40, parking: 0, acres: 10 };
test('houses: priced line by line from the library, the GC fee on its hard lines, its own soft lines', () => {
  const { B, reg } = budget('sfr', houses), fs = B.lines.filter(l => l.fs === 'sfr');
  assert.deepEqual(B.fsUses, ['sfr']); assert.deepEqual(B.teamUses, []); assert.deepEqual(B.libUses, []);
  assert.ok(fs.length > 55 && !B.lines.some(l => l.id.startsWith('tb:') || l.id.startsWith('lib:') || l.id === 'par:hard|sfr'), 'only library lines for the houses: ' + fs.length);
  for (const k of CL.FSLIB_SITE_BY_PLAN) assert.ok(!fs.some(l => l.id.endsWith('|' + k)), k + ' is left to the site lines');
  assert.ok(B.lines.some(l => l.id === 'site:lots'), 'the finished lots are still the platform\'s site line');
  const hard = fs.filter(l => l.group === 'hard'), soft = fs.filter(l => l.group === 'soft');
  assert.ok(soft.some(l => l.id === 'fs:sfr|T-006') && soft.every(l => l.rate === l.baseRate && l.division === 'Soft costs'), 'permits and engineering are soft and not escalated');
  close(B.totals.gcFee, sum(hard) * 0.12, 'GC fee on the library\'s hard lines', 1); close(B.totals.building, sum(hard), 'building', 0.01);
  for (const l of fs) { assert.equal(l.source.kind, 'library'); assert.ok(l.source.ref.includes(l.id.split('|')[1]) && /cost code \d\d\.\d\d/.test(l.source.ref)); assert.ok(l.lowRate <= l.rate && l.rate <= l.highRate, l.id); assert.ok(l.amount >= 0); }
  // 40 one-storey... the compact plan says two storeys: the two-storey frame line, stairs, 2.5 baths
  assert.ok(fs.some(l => l.id === 'fs:sfr|T-025') && fs.some(l => l.id === 'fs:sfr|T-066') && fs.some(l => l.id === 'fs:sfr|T-036'));
  const U = B.fsLib.uses.sfr; assert.equal(U.product, 'SF_DETACHED'); assert.equal(U.units, 40); close(U.livingSf, 64000, 'living sf'); assert.equal(U.jurisdiction, 'WALLER');
  close(U.likely, sum(fs), 'the range\'s likely is the budget\'s', 0.01); assert.ok(U.low < U.likely && U.likely < U.high); close(B.fsLib.likely, U.likely, 'total', 0.01);
  assert.ok(!reg.some(a => a.key === 'hard.sfr'), 'no parametric $/sf input for houses the library prices'); assert.ok(reg.some(a => a.key === 'softPct'), 'soft % still applies to the site work');
  const rows = BB.budgetRows(B), r = rows.find(x => x.id === 'fs:sfr|T-018'); assert.equal(r.costCode, '18.40'); assert.ok(r.low <= r.amount && r.amount <= r.high); assert.equal(rows.find(x => x.id === 'site:lots').low, undefined);
});
test('houses: an edited rate has no range; a line switched off leaves it; a cost case scales it', () => {
  const { B } = budget('sfr', houses, { edits: { 'fs:sfr|T-018': { rate: 9 }, 'fs:sfr|T-080': { off: true } } }), U = B.fsLib.uses.sfr, fs = B.lines.filter(l => l.fs === 'sfr' && !l.off);
  const slab = B.lines.find(l => l.id === 'fs:sfr|T-018'); assert.ok(slab.edited && slab.lowRate == null && slab.source.kind === 'user');
  close(U.likely, sum(fs), 'likely', 0.01); close(U.low, sum(fs.map(l => ({ amount: l.lowRate != null ? Math.round(l.qty * l.lowRate * 100) / 100 : l.amount }))), 'low keeps the edit', 0.01);
  const up = budget('sfr', houses, { costFactor: 1.1 }).B.fsLib, base = budget('sfr', houses).B.fsLib; close(up.low / base.low, 1.1, 'low × 1.1', 1e-4); close(up.high / base.high, 1.1, 'high × 1.1', 1e-4);
});
test('houses in Houston carry the city adders; with meters the fee schedule replaces impact fees and taps', () => {
  const ids = B => B.lines.map(l => l.id);
  assert.ok(ids(budget('sfr', houses, { place: { city: 'Houston', county: 'Harris' } }).B).includes('fs:sfr|T-039'));
  const w = ids(budget('sfr', houses).B); assert.ok(w.includes('fs:sfr|T-007') && w.includes('fs:sfr|T-008') && !w.includes('fs:sfr|T-039'));
  const m = budget('sfr', houses, { meters: [{ rowId: CL.TX_WALLER.meters?.[0]?.rowId || 'none', qty: 40 }] }).B; assert.ok(!ids(m).includes('fs:sfr|T-007') && !ids(m).includes('fs:sfr|T-008') && ids(m).includes('fee:impact'));
});
test('a tiny or manufactured home community keeps its delivered-home pricing; cottages are the library\'s cottage', () => {
  const tiny = budget('sfr', houses, { tweak: M => { M.uses.sfr.homes = { tiny: 40 }; } }).B; assert.deepEqual(tiny.fsUses, []); assert.ok(tiny.lines.some(l => l.id === 'par:hard|sfr')); assert.equal(tiny.fsLib, null);
  const cot = budget('sfr', { ...houses, buildingSf: 40 * 1100 }, { tweak: M => { M.uses.sfr.homes = { cottage: 40 }; } }).B, U = cot.fsLib.uses.sfr;
  assert.equal(U.product, 'COTTAGE'); assert.equal(U.stories, 1); assert.ok(!cot.lines.some(l => l.id === 'fs:sfr|T-068'), 'no garage door'); assert.equal(U.bench.low, 71.35);
});
test('townhomes: the library\'s lines on the multifamily rates, marked placeholders; storeys from the plan', () => {
  const c = { buildingSf: 60 * 2000, units: 60, parking: 15, acres: 5 }, { B } = budget('townhomes', c), fs = B.lines.filter(l => l.fs === 'townhomes');
  assert.deepEqual(B.fsUses, ['townhomes']); assert.deepEqual(B.libUses, []); assert.ok(!B.lines.some(l => l.id.startsWith('lib:')));
  const U = B.fsLib.uses.townhomes; assert.equal(U.product, 'TOWNHOME'); assert.equal(U.stories, 3); close(U.livingSf, 60 * 2000 * 0.85, 'living = 85% of gross'); close(U.inputs.total_sf_per_unit, 2000, 'gross from the plan');
  assert.ok(fs.some(l => l.id === 'fs:townhomes|T-026') && fs.some(l => l.id === 'fs:townhomes|T-075') && fs.some(l => l.id === 'fs:townhomes|T-070'));
  assert.ok(fs.every(l => l.source.confidence !== 'high' && l.source.confidence !== 'medium' && /placeholders/.test(l.source.label))); assert.equal(fs.find(l => l.id === 'fs:townhomes|T-035').source.confidence, 'low');
  close(fs.find(l => l.id === 'fs:townhomes|T-078').qty, 60 * 1200 * 0.6, 'a townhome\'s driveway is 0.6 of a house\'s');
  const two = budget('townhomes', c, { tweak: M => { M.uses.townhomes.byFloors = { 2: 60 }; } }).B; assert.equal(two.fsLib.uses.townhomes.stories, 2); assert.ok(two.lines.some(l => l.id === 'fs:townhomes|T-025'));
  const notes = BB.budgetLibNotes(B); assert.ok(notes.some(n => n.level === 'note' && /placeholders/.test(n.text)) && notes.some(n => /low, .* likely, .* high/.test(n.text)));
});
test('apartments and duplexes stay on the workbook; the library\'s apartment rates are a cross-check with four lines to bid', () => {
  const { B } = budget('multifamily', { buildingSf: 200000, units: 200, parking: 300, acres: 9 });
  assert.deepEqual(B.libUses, ['multifamily']); assert.deepEqual(B.fsUses, []); assert.ok(B.lines.some(l => l.id.startsWith('lib:res|')) && !B.lines.some(l => l.fs));
  const A = B.fsLib.apartments; assert.equal(A.unpriced.length, 4); assert.ok(A.psf > 50 && A.psf < 200 && A.workbookPsf > 50 && A.workbookPsf < 200, A.psf + ' / ' + A.workbookPsf);
  const n = BB.budgetLibNotes(B); assert.equal(n.length, 1); assert.match(n[0].text, /stay on the team’s budget workbook .* 4 lines not priced/);
  const dup = budget('duplex', { buildingSf: 20 * 1800, units: 20, parking: 0, acres: 4 }).B; assert.deepEqual(dup.libUses, ['duplex']); assert.deepEqual(dup.fsUses, []);
});
test('every other use is priced as before', () => {
  const ind = budget('industrial', { buildingSf: 30000, parking: 40, acres: 3 }).B; assert.deepEqual(ind.teamUses, ['industrial']); assert.equal(ind.fsLib, null); assert.deepEqual(BB.budgetLibNotes(ind), []);
  const off = budget('office', { buildingSf: 30000, parking: 120, acres: 3 }).B; assert.ok(off.lines.some(l => l.id === 'par:hard|office')); assert.equal(off.fsLib, null);
  const st = budget('storage', { buildingSf: 80000, parking: 10, acres: 4 }).B; assert.ok(st.lines.some(l => l.id === 'par:hard|storage'), 'storage keeps its own rates (the library has one benchmark line)');
});
test('notes: a big house is flagged as beyond the library\'s plans; the benchmark gap is said', () => {
  const big = BB.budgetLibNotes(budget('sfr', { ...houses, buildingSf: 40 * 2600 }).B); assert.ok(big.some(n => n.level === 'note' && /stretched/.test(n.text)));
  const ok = BB.budgetLibNotes(budget('sfr', houses).B); assert.ok(!ok.some(n => /stretched/.test(n.text))); assert.ok(ok.some(n => /benchmark range of \$69\.83–\$108\.61/.test(n.text)) && ok.some(n => /not Finishes’ own/.test(n.text)));
});
test('the browser bundle carries no evidence layer', async () => {
  const t = await readFile(new URL('../lib/feasibility/data/fs-budget-library-v1.mjs', import.meta.url), 'utf8');
  assert.ok(!/@[a-z0-9-]+\.(com|net)|\b\d{3}-\d{3}-\d{4}\b|past due|lien filed|\bR-0\d{3}\b/i.test(t), 'no contacts, phone numbers, payables or rate-library rows');
});
await Promise.resolve();
console.log('fz-budgetlib tests passed (' + checks + ' checks)');
