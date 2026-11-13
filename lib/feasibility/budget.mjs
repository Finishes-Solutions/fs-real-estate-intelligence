// @ts-check
// A project budget from a site layout: CSI-coded lines priced from the layout's quantities and the cost library
// (lib/feasibility/costlib.mjs), escalated and located, then rolled up with the budgeting suite's own arithmetic
// (lib/feasibility/rollup.mjs parts(): hard → GC fee → contingency → contract sum → soft → land → the developer fee
// solved in closed form → total project cost before financing). The pro forma (lib/proforma.mjs) then adds the
// financing to reach total development cost.
//
// Every line carries its quantity, unit, rate and SourceRef, so the budget can be read back to where each dollar came
// from. budgetEdits ({ lineId: { rate, qty, off } }) are the user's changes, applied last and labelled as theirs.
import { parts } from './rollup.mjs';
import { csiSchedule, csiDivOf } from './csi.mjs';
import { evaluate as feeEvaluate } from './impactfees.mjs';
import { escalation } from './escalation.mjs';
import { libraryLines, excludedLibraryLines, LIB_MONTH, LIBRARY_USES, libSource, PARAM_SOURCE, teamRates, teamSource, TEAM_MONTH, TEAM_FEE_PCT, TEAM_LINES, SITE_LINES, TX_WALLER, IMPACT_LINE, FSLIB_USES, FSLIB_MONTH, fsSource, fsLibPrice, fsLibApartmentCheck } from './costlib.mjs';
import { benchOf } from './budgetlib.mjs';
import { src, userSource } from './model.mjs';
import * as TB from './data/fs-budgets-2024-25.mjs';
import { round2 as r2 } from './finance.mjs';

const label = u => ({ multifamily: 'Apartments', townhomes: 'Townhomes', duplex: 'Duplexes', sfr: 'Single-family homes', retail: 'Retail', restaurant: 'Restaurant', office: 'Office', medical: 'Medical office',
  hotel: 'Hotel', church: 'Church', venue: 'Event / wedding venue', industrial: 'Industrial', storage: 'Self storage', foodtrucks: 'Food truck park', fuel: 'Gas station / c-store', amenity: 'Clubhouse / amenity', other: 'Other' })[u] || u;

/**
 * @param {object} M   plan metrics (lib/proforma.mjs metricsOf / compactMetrics)
 * @param {object} a   resolved assumption values (lib/feasibility/assumptions.mjs values()): landTotal, locationFactor,
 *                     materialsShare, escalationPct, gcFeePct, contPct, softPct, devFeePct, monthsToMid, plus the pro
 *                     forma keys (hard.*, site rates…) as overrides
 * @param {object} o   { market (marketContext), R0 (the parametric pro forma run on the same metrics and overrides),
 *                     edits (budgetEdits), meters (impact-fee meters, optional), jurisdiction, place (the intake's city,
 *                     county and jurisdiction: the budget library's city adders), costFactor (a sensitivity
 *                     case: every line but leasing commissions × it, before the roll-up, so contingency and fees follow) }
 */
export function buildBudget(M, a, { market = null, R0, edits = {}, meters = null, jurisdiction = '', place = null, costFactor = 1 } = {}) {
  const P = R0.P, uses = Object.keys(P.uses);
  const libUses = uses.filter(u => LIBRARY_USES.includes(u) && P.uses[u].gsf > 0);
  const resSF = libUses.reduce((s, u) => s + P.uses[u].gsf, 0), units = libUses.reduce((s, u) => s + (P.uses[u].units || 0), 0);
  const amenSF = libUses.length && P.uses.amenity ? P.uses.amenity.gsf : 0; // (a clubhouse with library-priced homes uses the workbook's amenity lines)
  const loc = a.locationFactor ?? 1;
  const escLib = escalation(market, { basisMonth: LIB_MONTH, materialsShare: a.materialsShare, forwardPct: a.escalationPct, monthsToMid: a.monthsToMid });
  const escPar = escalation(market, { basisMonth: null, materialsShare: a.materialsShare, forwardPct: a.escalationPct, monthsToMid: a.monthsToMid });
  const escTeam = escalation(market, { basisMonth: TEAM_MONTH, materialsShare: a.materialsShare, forwardPct: a.escalationPct, monthsToMid: a.monthsToMid });
  const escFs = escalation(market, { basisMonth: FSLIB_MONTH, materialsShare: a.materialsShare, forwardPct: a.escalationPct, monthsToMid: a.monthsToMid });
  const fLib = escLib.factor * loc, fPar = escPar.factor * loc, fTeam = escTeam.factor * loc, fFs = escFs.factor * loc;
  const lines = [];
  const add = l => { lines.push({ ...l, amount: r2(l.qty * l.rate) }); };

  // ---- building: the workbook's lines for its uses (qty = residential / amenity sf, units) ----
  if (libUses.length) for (const l of libraryLines()) {
    if (l.scope === 'amen' && !amenSF) continue;
    const qty = l.basis === 'sf' ? resSF : l.basis === 'asf' ? amenSF : l.basis === 'unit' ? units : 1;
    if (l.scope === 'soft' && l.code === IMPACT_LINE.code && meters?.length) continue; // replaced by the fee calculator below
    const hard = l.scope !== 'soft', rate = l.unit * (hard ? fLib : 1);
    add({ id: 'lib:' + l.scope + '|' + l.code + '|' + l.desc, group: hard ? 'hard' : 'soft', scope: l.scope, csi: l.code, division: csiDivOf(l.code), grp: l.grp,
      desc: l.desc + (l.scope === 'amen' ? ' (amenity)' : ''), qty, unit: l.scope === 'amen' ? 'amenity sf' : l.basis === 'unit' ? 'units' : l.basis === 'ls' ? 'ls' : 'residential sf', baseRate: l.unit, rate,
      feeable: hard, source: libSource(), note: hard ? escNote(escLib, loc) : 'Soft costs are not escalated (design fees track the hard cost).' });
  }
  // ---- building: houses, cottages and townhomes line by line from the Finishes budget library: a quantity taken off
  // the home's size and a low / likely / high rate (the likely one is the budget's; the range rides along) ----
  const fsUses = [], fsPriced = {};
  for (const u of FSLIB_USES) {
    const pr = fsLibPrice(u, P.uses[u], place || { jurisdiction }, { meters: !!meters?.length }); if (!pr) continue;
    fsUses.push(u); fsPriced[u] = pr;
    for (const x of pr.lines) {
      const l = x.line, hard = l.group === 'hard', f = hard ? fFs : 1;
      add({ id: 'fs:' + u + '|' + l.id, group: hard ? 'hard' : 'soft', scope: hard ? 'res' : 'soft', csi: l.csi, division: hard ? csiDivOf(l.csi) : 'Soft costs', grp: l.phase, desc: label(u) + ': ' + l.desc, qty: r2(x.qty), unit: l.per, baseRate: x.likely, rate: x.likely * f,
        lowRate: x.low * f, highRate: x.high * f, costCode: l.code, feeable: hard, fs: u, source: fsSource(u, l, x.mf), note: (hard ? escNote(escFs, loc) : 'Soft costs are not escalated.') + ' Library range $' + (+x.low.toFixed(2)) + '–$' + (+x.high.toFixed(2)) + ' a ' + l.per + '.' });
    }
  }
  // ---- building: the team's own budgets for the uses they cover, line by line per gross sf; a leased commercial
  // building leaves out the interiors, which its tenant improvement allowance pays for ----
  const teamUses = [];
  for (const u of uses) {
    const r = teamRates(u, P.uses[u], R0.budget.hardByUse); if (!r) continue;
    teamUses.push(u); const gsf = P.uses[u].gsf, shellOnly = (R0.A?.ti?.[u] ?? 0) > 0;
    for (const l of TEAM_LINES) {
      const base = r.psf[l.key]; if (!(base > 0) || (shellOnly && l.grp === 'Interiors')) continue;
      add({ id: 'tb:' + u + '|' + l.key, group: 'hard', scope: 'res', csi: l.code, division: csiDivOf(l.code), grp: l.grp, desc: label(u) + ': ' + l.desc, qty: gsf, unit: 'gross sf', baseRate: base, rate: base * fTeam,
        feeable: false, team: true, source: teamSource(r), note: escNote(escTeam, loc) });
    }
  }
  if (teamUses.length) { // (the budgets' own contractor fee, 10%: a line of its own so the workbook's GC fee % doesn't apply to it)
    const base = lines.filter(l => l.team).reduce((s, l) => s + l.amount, 0);
    add({ id: 'tb:fee', group: 'hard', scope: 'res', csi: '01 01 00', division: csiDivOf('01 01 00'), desc: 'Contractor fee on the team-budget lines: general conditions, overhead and profit (' + TEAM_FEE_PCT + '%)', qty: base, unit: '$ base',
      baseRate: TEAM_FEE_PCT / 100, rate: TEAM_FEE_PCT / 100, feeable: false, team: true, source: teamSource(null) });
  }
  // ---- building: every other use at the platform's all-in $ per gross sf (and amenity buildings without library homes) ----
  for (const u of uses) {
    if (libUses.includes(u) || fsUses.includes(u) || teamUses.includes(u) || (u === 'amenity' && amenSF)) continue;
    const base = R0.budget.hardByUse?.[u] || 0, gsf = P.uses[u].gsf || 0; if (!(base > 0) || !(gsf > 0)) continue;
    add({ id: 'par:hard|' + u, group: 'hard', scope: 'res', csi: 'PB-' + u, division: 'Building, all-in parametric (not split by division)', desc: label(u) + ' building, all-in', qty: gsf, unit: 'gross sf',
      baseRate: base / gsf, rate: base / gsf * fPar, feeable: false, source: PARAM_SOURCE, note: escNote(escPar, loc) });
  }
  if (R0.budget.equip > 0) add({ id: 'par:hard|fuel-equip', group: 'hard', scope: 'res', csi: '33 56 00', division: csiDivOf('33 56 00'), desc: 'Fuel canopy, dispensers and tanks', qty: 1, unit: 'ls', baseRate: R0.budget.equip, rate: R0.budget.equip * fPar, feeable: false, source: PARAM_SOURCE, note: escNote(escPar, loc) });
  // ---- site work from the layout's quantities ----
  for (const [k, d] of Object.entries(SITE_LINES)) {
    const amt = R0.budget.siteParts?.[k] || 0; if (!(amt > 0)) continue;
    const qty = +d.qtyOf(M, { P, siteQty: R0.budget.siteQty }) || 1, rate = amt / qty * fPar;
    add({ id: 'site:' + k, group: 'site', scope: 'res', csi: d.csi, division: csiDivOf(d.csi), desc: d.desc, qty, unit: d.unit, baseRate: amt / qty, rate, feeable: false,
      source: { ...PARAM_SOURCE, label: PARAM_SOURCE.label + '; quantity from the concept layout' }, note: escNote(escPar, loc) });
  }
  // ---- FF&E and tenant improvements (the pro forma's own rates on the plan's leasable area) ----
  const keys = P.keys || P.uses.hotel?.keys || 1;
  if (R0.budget.ffe > 0) add({ id: 'par:ffe', group: 'ffe', scope: 'res', csi: '12 00 00', division: csiDivOf('12 00 00'), desc: 'Hotel furniture, fixtures and equipment at opening', qty: keys, unit: 'keys', baseRate: R0.budget.ffe / keys, rate: R0.budget.ffe / keys * fPar, feeable: false, source: PARAM_SOURCE });
  if (R0.budget.ti > 0) add({ id: 'par:ti', group: 'ti', scope: 'res', csi: 'TI', division: 'Tenant improvements', desc: 'Tenant improvement allowances on the leasable area', qty: 1, unit: 'ls', baseRate: R0.budget.ti, rate: R0.budget.ti * fPar, feeable: false, source: PARAM_SOURCE, note: 'Per-use $/leasable sf in the pro forma inputs' });
  // ---- soft costs: the workbook's for library homes; a % of the rest ----
  const parHard = lines.filter(l => (l.group === 'hard' && !l.feeable) || l.group === 'ffe').reduce((s, l) => s + l.amount, 0), siteAmt = lines.filter(l => l.group === 'site').reduce((s, l) => s + l.amount, 0);
  const softBase = parHard + (libUses.length ? 0 : siteAmt); // (the workbook's soft lines already carry civil and site design)
  if (softBase > 0) add({ id: 'par:soft', group: 'soft', scope: 'soft', csi: 'SC-P', division: 'Soft costs', desc: 'Soft costs: design and engineering, permits and fees, legal, insurance, taxes during construction (' + a.softPct + '% of ' + (libUses.length ? 'non-library building' : fsUses.length ? 'site and non-library building' : 'hard and site') + ' cost)', qty: softBase, unit: '$ base', baseRate: a.softPct / 100, rate: a.softPct / 100, feeable: false,
    source: src('house', 'Platform soft-cost share by use (10–15%; warehouses and storage 7–10%)', { ref: 'lib/proforma.mjs', confidence: 'low' }) });
  // impact & tap fees: the City of Waller schedule when meters are given (the only sourced fee table in the platform)
  let fees = null;
  if (meters?.length) {
    fees = feeEvaluate(TX_WALLER, { basis: 'high', meters }, { units, resSF, amenSF }); // meters: [{ rowId, qty }]
    const tot = fees?.total || 0;
    add({ id: 'fee:impact', group: 'soft', scope: 'soft', csi: 'SC-20', division: 'Soft costs', desc: 'Water & sewer impact and tap fees (' + TX_WALLER.name + ', high estimate)', qty: 1, unit: 'ls', baseRate: tot, rate: tot, feeable: false,
      source: src('library', TX_WALLER.source?.label || 'City of Waller impact fee schedule', { asOf: TX_WALLER.source?.asOf, confidence: 'medium' }), note: jurisdiction && !/waller/i.test(jurisdiction) ? 'The only fee schedule on file is the City of Waller’s; this site is in ' + jurisdiction + '.' : '' });
  }
  if (R0.budget.lc > 0) add({ id: 'par:lc', group: 'lc', scope: 'soft', csi: 'LC', division: 'Leasing', desc: 'Leasing commissions on the first leases', qty: 1, unit: 'ls', baseRate: R0.budget.lc, rate: R0.budget.lc, feeable: false, source: PARAM_SOURCE });

  // ---- the user's edits, last ----
  for (const l of lines) {
    const e = edits?.[l.id]; if (!e) continue;
    if (e.off) { l.off = true; l.amount = 0; }
    if (Number.isFinite(e.rate)) { l.rate = e.rate; l.edited = true; delete l.lowRate; delete l.highRate; } // (an edited rate is the user's: it has no library range)
    if (Number.isFinite(e.qty)) { l.qty = e.qty; l.edited = true; }
    if (l.edited || l.off) { l.source = userSource(l.source); if (!l.off) l.amount = r2(l.qty * l.rate); }
  }

  if (costFactor !== 1) for (const l of lines) if (!l.off && l.group !== 'lc') { l.rate *= costFactor; l.amount = r2(l.qty * l.rate); if (l.lowRate != null) { l.lowRate *= costFactor; l.highRate *= costFactor; } }

  // ---- roll-up: the budgeting suite's arithmetic on a document of these lines ----
  const on = lines.filter(l => !l.off), sumOf = g => on.filter(l => l.group === g).reduce((s, l) => s + l.amount, 0);
  const doc = {
    resSF, amenSF, units: [{ count: units }],
    lines: on.map(l => ({ lineId: l.id, code: l.csi, grp: l.grp || l.division, scope: l.scope === 'amen' ? 'amen' : l.scope === 'soft' ? 'soft' : 'res', desc: l.desc, basis: 'ls', auto: false, qty: 1, unit: l.amount, ...(l.feeable ? {} : { nofee: true }) })),
    companies: [{ name: 'GC fee on library lines', pct: a.gcFeePct }], // (the parametric and site lines are nofee: their rates are all-in)
    contingency: { mode: 'pct', val: a.contPct },
    projectCosts: { land: a.landTotal, dev: { mode: 'pct', val: a.devFeePct }, mkt: { mode: 'amt', val: 0 }, cls: { mode: 'amt', val: 0 } }
  };
  const p = parts(doc);
  const totals = {
    land: a.landTotal, building: sumOf('hard'), site: sumOf('site'), ffe: sumOf('ffe'), ti: sumOf('ti'), gcFee: p.profit, contingency: p.cont, contract: p.contract,
    softLines: sumOf('soft'), lc: sumOf('lc'), soft: p.soft, devFee: p.fee.dev, fees: p.fees, project: p.project,
    hard: p.hard, perGsf: P.gsf ? p.project / P.gsf : null, perUnit: P.units ? p.project / P.units : null
  };
  // what the pro forma prices from here (land, hard with the GC fee, site, FF&E, TI, LC, soft, contingency, fee)
  const budgetIn = { land: totals.land, hard: totals.building + totals.gcFee, ffe: totals.ffe, site: totals.site, ti: totals.ti, lc: totals.lc, soft: totals.softLines, cont: totals.contingency, fee: totals.fees };
  // ---- the budget library's part of this budget: its low / likely / high direct cost by use, what was left out and
  // what is still to bid, the workbook's own benchmark band, and its apartment rates beside the workbook's ----
  let fsLib = null;
  if (fsUses.length || libUses.includes('multifamily')) {
    const byUse = {};
    for (const u of fsUses) {
      const pr = fsPriced[u], mine = on.filter(l => l.fs === u), amt = k => mine.reduce((s, l) => s + (l[k] != null ? r2(l.qty * l[k]) : l.amount), 0);
      byUse[u] = { product: pr.inputs.product_type, units: pr.units, livingSf: pr.livingSf, stories: pr.inputs.stories, jurisdiction: pr.inputs.jurisdiction, lines: mine.length, low: amt('lowRate'), likely: mine.reduce((s, l) => s + l.amount, 0), high: amt('highRate'),
        basePsf: pr.totals.likely / pr.livingSf, bench: benchOf(pr.inputs.product_type), skipped: pr.skipped, unpriced: pr.unpriced, inputs: pr.inputs };
    }
    const mf = libUses.includes('multifamily') ? fsLibApartmentCheck(P.uses.multifamily, P.mix) : null;
    if (mf) mf.workbookPsf = resSF ? lines.filter(l => l.id.startsWith('lib:res|')).reduce((s, l) => s + l.qty * l.baseRate, 0) / resSF : null;
    const tot = k => Object.values(byUse).reduce((s, x) => s + x[k], 0);
    fsLib = { uses: byUse, low: tot('low'), likely: tot('likely'), high: tot('high'), apartments: mf };
  }
  let csi; try { csi = csiSchedule(doc, p); } catch (e) { csi = null; } // (a schedule that can't be grouped is left off, the totals stand)
  return { lines, totals, budgetIn, csi, doc, parts: p, escalation: { library: escLib, team: escTeam, fs: escFs, parametric: escPar, location: loc }, excluded: excludedLibraryLines().map(l => l.code + ' ' + l.desc), fees, resSF, amenSF, units, libUses, teamUses, fsUses, fsLib };
}

const escNote = (e, loc) => 'Escalation × ' + e.factor.toFixed(4) + ' (' + [e.toDate.note, e.forward.note].filter(Boolean).join('; ') + ')' + (loc !== 1 ? '; location × ' + loc : '');

// the budget's lines as rows for a table or a CSV (financing comes from the pro forma and is added by the caller)
export function budgetRows(B) {
  return B.lines.map(l => ({ id: l.id, group: l.group, csi: l.csi, division: l.division, desc: l.desc, qty: l.qty, unit: l.unit, rate: l.rate, amount: l.off ? 0 : l.amount, off: !!l.off, edited: !!l.edited, source: l.source?.label, confidence: l.source?.confidence || '', asOf: l.source?.asOf || '',
    ...(l.fs ? { costCode: l.costCode, low: l.off ? 0 : l.lowRate != null ? r2(l.qty * l.lowRate) : l.amount, high: l.off ? 0 : l.highRate != null ? r2(l.qty * l.highRate) : l.amount } : {}) }));
}

// the budget's guard rails on the ratios that a feasibility budget has (land share, soft %, contingency %, hard $/SF)
// the budget's building and site work per gross sf beside the team's own 2024–25 budgets for the same kind of building
// (data/fs-budgets-2024-25.mjs ALL_IN_PSF, with their 10% fee), for a plan of one main use; null for a mix or a use the
// budgets don't cover. Not escalated: the team's are 2024–25 prices, so a few percent over them is expected.
export function budgetBench(B, P) {
  const main = Object.keys(P?.uses || {}).filter(u => u !== 'amenity' && P.uses[u].gsf > 0); if (main.length !== 1) return null;
  const u = main[0], base = TB.ALL_IN_PSF[u], r = TB.RATES[u]; if (!base || !(P.gsf > 0) || (u === 'industrial' && P.uses[u].gsf > TB.INDUSTRIAL_MAX_SF)) return null;
  const t = B.totals, ours = (t.building + t.gcFee + t.site - (B.lines.find(l => l.id === 'par:hard|fuel-equip')?.amount || 0)) / P.gsf, theirs = base * (1 + TB.FEE_PCT / 100), diff = (ours / theirs - 1) * 100;
  const name = { multifamily: 'apartments', townhomes: 'townhomes', duplex: 'duplexes', sfr: 'houses', retail: 'retail buildings', industrial: 'flex / industrial buildings', fuel: 'c-stores' }[u];
  return { use: u, n: r?.n || 0, ours, theirs, diff, text: 'Building and site work come to $' + ours.toFixed(0) + ' a gross sf; the team’s 2024–25 budgets for ' + name + ' came to $' + theirs.toFixed(0) + ' (the median of ' + (r?.n || 0) + ', with the 10% contractor fee): ' + Math.abs(diff).toFixed(0) + '% ' + (diff >= 0 ? 'higher' : 'lower') + '.' };
}
export function budgetChecks(B, gsf, P = null) {
  const t = B.totals, out = [], pct = (v, lo, hi, what) => { if (v != null && Number.isFinite(v) && (v < lo || v > hi)) out.push({ level: 'note', text: what + ' ' + (v * 100).toFixed(1) + '%, outside the usual ' + (lo * 100).toFixed(0) + '–' + (hi * 100).toFixed(0) + '%.' }); };
  pct(t.land / t.project, 0.05, 0.3, 'Land is a share of project cost of'); pct(t.soft / Math.max(1, t.hard), 0.06, 0.22, 'Soft costs are a share of hard cost of'); pct(t.contingency / Math.max(1, t.hard), 0.02, 0.1, 'Contingency is a share of hard cost of');
  const bench = P ? budgetBench(B, P) : null; if (bench && Math.abs(bench.diff) > 20) out.push({ level: 'note', text: bench.text + ' Check the rates against the team’s.' });
  const psf = gsf ? (t.hard + t.gcFee) / gsf : null; if (psf != null && (psf < 60 || psf > 400)) out.push({ level: 'note', text: 'Hard cost $' + psf.toFixed(0) + '/gsf is outside $60–400: check the building use and rates.' });
  return out;
}

// What the Finishes budget library says about this budget, as plain sentences: the low / likely / high range of the
// homes it priced, where the likely cost sits against the library's own benchmarks, what it left to the site lines,
// what still has to be bid, and its apartment rates beside the workbook's. level 'info' is context; 'note' wants a look.
const money = v => '$' + Math.round(v).toLocaleString('en-US');
const NAME = { sfr: 'houses', townhomes: 'townhomes' };
export function budgetLibNotes(B) {
  const F = B?.fsLib, out = []; if (!F) return out;
  for (const [u, x] of Object.entries(F.uses)) {
    const name = x.product === 'COTTAGE' ? 'cottages' : NAME[u] || u, per = v => money(v / x.units);
    out.push({ level: 'info', text: 'The ' + x.units + ' ' + name + ' are priced line by line from the Finishes budget library (' + x.lines + ' lines, ' + x.stories + ' stor' + (x.stories === 1 ? 'ey' : 'eys') + ', about ' + Math.round(x.livingSf / x.units).toLocaleString('en-US') + ' living sf each): '
      + 'direct cost ' + money(x.low) + ' low, ' + money(x.likely) + ' likely, ' + money(x.high) + ' high (' + per(x.low) + ' / ' + per(x.likely) + ' / ' + per(x.high) + ' a home), before the GC fee and contingency. The budget carries the likely figure.' });
    if (x.bench) { const v = x.basePsf, where = v < x.bench.low ? 'below' : v > x.bench.high ? 'above' : 'inside';
      out.push({ level: where === 'inside' ? 'info' : 'note', text: 'At the library’s own prices the ' + name + ' come to $' + v.toFixed(2) + ' a living sf, ' + where + ' its benchmark range of $' + x.bench.low.toFixed(2) + '–$' + x.bench.high.toFixed(2) + ' (' + x.bench.rows.map(r => r.what).join('; ') + ').'
        + (where === 'inside' ? '' : ' Check the home size, storeys and rates.') }); }
    const each = x.livingSf / x.units; if (x.product === 'SF_DETACHED' && (each < 1000 || each > 2100)) out.push({ level: 'note', text: 'The library’s house plans run about 1,050 to 2,065 living sf; these average ' + Math.round(each).toLocaleString('en-US') + ', so its rates are stretched beyond the homes they were bid for.' });
    if (u === 'townhomes') out.push({ level: 'note', text: 'Townhome rates in the library are placeholders: none has been built from them. Bid the framing, party walls, stairs and upper floor system before relying on this budget.' });
    if (x.unpriced.length) out.push({ level: 'note', text: x.unpriced.length + ' line' + (x.unpriced.length > 1 ? 's have' : ' has') + ' no rate in the library and must be bid (not in the totals): ' + x.unpriced.map(l => l.desc).join('; ') + '.' });
    out.push({ level: 'info', text: 'Left to the site lines so nothing is counted twice: storm-water protection, lot clearing, pad and fill, culvert' + (x.skipped.includes('T-007') ? '; impact fees and taps come from the fee schedule' : '') + '. Assumed where the plan doesn’t say: '
      + Math.round(x.inputs.masonry_pct * 100) + '% of the walls in brick or stone, ' + (x.inputs.windstorm === 'Y' ? 'windstorm strapping, ' : '') + 'all-electric, slab on grade, ' + x.inputs.baths_per_unit + ' baths'
      + (x.jurisdiction === 'OTHER' ? ', no city adders (the library has them for Houston and Dayton only)' : ', ' + (x.jurisdiction === 'COH' ? 'City of Houston' : x.jurisdiction[0] + x.jurisdiction.slice(1).toLowerCase()) + ' as the jurisdiction') + '.' });
  }
  if (Object.keys(F.uses).length) out.push({ level: 'info', text: 'The library’s rates are what Hart Homes was quoted or paid, mostly in 2025 and early 2026. They are not Finishes’ own current prices, which may run higher on finish trades.' });
  const A = F.apartments;
  if (A && A.workbookPsf) out.push({ level: 'info', text: 'Cross-check: the apartments stay on the team’s budget workbook at $' + A.workbookPsf.toFixed(0) + ' a building sf. The Finishes budget library’s apartment rates, all placeholders until bid, come to $' + A.psf.toFixed(0)
    + ' a building sf with ' + A.unpriced.length + ' lines not priced (' + A.unpriced.join('; ') + ').' });
  return out;
}
