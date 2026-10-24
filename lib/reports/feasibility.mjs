// @ts-check
// The Feasibility report (the study's PDF): one project from its site to its returns, in the same report kit and style as
// every other report (src/reportkit.js, passed in as K). Built from a study (lib/feasibility/pipeline.mjs runStudy):
// every figure on it is the engine's, and the Fact & Assumption Register at the back says where each input came from.
// An optional narrative paragraph (api/feasibility.js, Claude) is shown only after lib/feasibility/guards.mjs passes it,
// and it never supplies a number. DOM-free: the API renders it to PDF with lib/pdf.mjs; the browser can preview it.

import { usd, usdM, pct, num, tornadoSvg, gridTitle, breakEvenText } from '../feasibility/format.mjs';

const LEVEL = { high: '#b42318', medium: '#8a5a12', low: '#4d5457' };

// K: src/reportkit.js ({ esc, kpiStrip, table, reportDoc })
export function feasibilityReport(K) {
  const { esc, kpiStrip, table, reportDoc } = K;

  // study: runStudy(); o: { planSvg (the layout drawing), narrative (checked text), scenarios (compareScenarios), title }
  function reportHtml(study, o = {}) {
    const h = study.pf.headline, s = study.site, B = study.budget, T = B.totals, R = study.pf.R, v = study.values, fs = h.forSale;
    const kp1 = kpiStrip([[usdM(h.totalCost), 'Total development cost'], fs ? [pct(h.margin), 'Margin on sales'] : [usdM(h.noi), 'Stabilized NOI'], fs ? [usdM(R.exit.sales), 'Home sales'] : [pct(h.yoc), 'Yield on cost'], [pct(h.levIrr), 'Levered IRR']]);
    const kp2 = kpiStrip([[s.units ? num(s.units) + ' units' : num(s.gfa) + ' sf', s.units ? num(s.gfa) + ' gross sf' : 'Gross building area'], [usdM(T.land), 'Land'], [usdM(h.profit), 'Levered profit'], [usdM(h.npvLev), 'Levered NPV at ' + v.discountRate + '%']]);
    // ---- executive summary: plain sentences from the numbers ----
    const top = study.risks.filter(x => x.level === 'high').slice(0, 3);
    const summary = '<p>' + esc(study.project.name) + ': ' + num(s.acres, 2) + ' acres laid out as ' + esc(study.option?.name || 'one option') + ' — ' + (s.units ? num(s.units) + ' units, ' : '') + num(s.gfa) + ' gross sf, ' + num(s.spaces) + ' parking spaces. ' +
      'Total development cost ' + usd(h.totalCost) + (s.units ? ' (' + usd(h.totalCost / s.units) + ' a unit)' : '') + ', of which land ' + usd(T.land) + ', construction contract ' + usd(T.contract) + ', soft costs ' + usd(T.soft) + ' and financing ' + usd(h.interest + h.loanFees) + '. ' +
      (fs ? 'Home sales return a ' + pct(h.margin) + ' margin. ' : 'Stabilized NOI ' + usd(h.noi) + ' is a ' + pct(h.yoc) + ' yield on cost against a ' + v.marketCap + '% market cap rate; ') +
      'levered IRR ' + pct(h.levIrr) + ', unlevered ' + pct(h.unlevIrr) + ', equity multiple ' + num(h.multiple, 2) + '×, over ' + num(h.months / 12, 1) + ' years.</p>' +
      (top.length ? '<p><b>What matters most:</b> ' + top.map(x => esc(x.title.toLowerCase())).join('; ') + '.</p>' : '') +
      (o.narrative ? '<div class="nar"><div class="k">Commentary (AI-written from the figures above; it adds no numbers)</div><p>' + esc(o.narrative) + '</p></div>' : '');
    const scope = '<div class="scope"><b>Scope.</b> ' + esc(study.scope) + '</div>';
    // ---- site ----
    const siteRows = [['Site area', num(s.acres, 2) + ' acres · ' + num(s.siteSf) + ' sf'], ...(s.envelope ? [['Buildable envelope', num(s.envelope.envelopeSf) + ' sf at a ' + s.envelope.setbackFt + ' ft setback (' + pct(s.envelope.ratio, 0) + ' of the site)']] : []),
      ['Program', esc(s.use) + (s.units ? ' · ' + num(s.units) + ' units' : '')], ['Building area', num(s.gfa) + ' gross sf · footprint ' + num(s.footprint) + ' sf'], ['Coverage / FAR', pct(s.coverage, 1) + ' / ' + num(s.far, 2)],
      ['Parking', num(s.spaces) + ' spaces of ' + num(s.required) + ' required'], ['Detention', num(s.detentionAcFt, 2) + ' ac-ft (rule of thumb)'], ...Object.entries(s.jurisdiction || {}).map(([k, x]) => [esc(k), esc(x)])];
    const mix = (s.mix || []).length ? table(['Unit', { t: 'Size (sf)', r: true }, { t: 'Units', r: true }], s.mix.map(t => [esc(t.name), num(t.sf), num(t.n)])) : '';
    const site = '<h2>Site and layout</h2><div class="two"><div>' + table(['', ''], siteRows.map(([a, b]) => [a, b])) + mix + (s.issues?.length ? '<p class="rnote">Layout checks: ' + s.issues.map(esc).join(' ') + '</p>' : '') + '</div><div>' +
      (o.planSvg ? '<div class="map plan">' + o.planSvg + '</div><p class="cap">' + esc(study.option?.name || '') + ': concept layout from the platform’s layout engine, not a survey or an engineered plan.</p>' : '') + '</div></div>';
    // ---- plan set ----
    const ps = study.planset, planset = ps ? '<h2>Plan set (schematic)</h2><p>' + num(ps.sheets.length) + ' sheets on the Finishes Solutions title block' + (ps.issued.length ? ', ' + ps.issued.length + ' set' + (ps.issued.length > 1 ? 's' : '') + ' issued' : ', not issued yet (made from the project’s Plans tab)') + '. ' +
      (ps.notDesigned.length ? 'Building types the set cannot design yet (no floor-plan sheets): ' + esc([...new Set(ps.notDesigned)].join(', ')) + '. ' : '') + 'Schematic design only: not for permit or construction.</p>' +
      table(['Sheet', 'Title'], ps.sheets.map(x => ['<span class="m">' + esc(x.number) + '</span>', esc(x.title + (x.sub ? ' — ' + x.sub : ''))])) : '';
    // ---- budget ----
    const bud = [['Land and closing', T.land], ['Building', T.building], ['GC fee (library lines)', T.gcFee], ['Site work', T.site], ...(T.ffe ? [['FF&E', T.ffe]] : []), ...(T.ti ? [['Tenant improvements', T.ti]] : []), ['Hard-cost contingency', T.contingency],
      ['<b>Construction contract</b>', T.contract], ['Soft costs', T.softLines], ...(T.lc ? [['Leasing commissions', T.lc]] : []), ['Developer fee', T.devFee], ['<b>Project cost before financing</b>', T.project],
      ['Construction interest', h.interest], ['Loan fees', h.loanFees], ['<b>Total development cost</b>', h.totalCost]];
    const per = (x) => [usd(x), s.units ? usd(x / s.units) : '—', s.gfa ? '$' + num(x / s.gfa, 2) : '—', pct(x / h.totalCost, 1)];
    const budget = '<h2 class="full">Budget</h2><p>Priced from the layout’s quantities: the Finishes Solutions budget workbook’s CSI lines for apartment and townhome buildings, the platform’s parametric rates for other uses and for site work, escalated ' +
      '× ' + num(B.escalation.library.factor, 4) + ' (library) / × ' + num(B.escalation.parametric.factor, 4) + ' (parametric) and at a location factor of ' + num(B.escalation.location, 2) + '. Rolled up the budgeting suite’s way: contract = hard + GC fee + contingency; the developer fee is ' + v.devFeePct + '% of the total it is part of.</p>' +
      table(['', { t: 'Amount', r: true }, { t: 'A unit', r: true }, { t: 'A gross sf', r: true }, { t: 'Share', r: true }], bud.map(([a, x]) => [a, ...per(x)])) +
      (B.csi?.divisions?.length ? '<h3 style="margin-top:14px">Construction by CSI division</h3>' + table(['Division', { t: 'Amount', r: true }, { t: 'Share', r: true }], B.csi.divisions.map(d => [esc(d.title), usd(d.total), pct(d.total / Math.max(1, T.contract), 1)])
        .concat((B.csi.markups || []).map(m => [esc(m.desc), usd(m.total), pct(m.total / Math.max(1, T.contract), 1)]))) : '') +
      (study.budgetChecks.length ? '<p class="rnote">' + study.budgetChecks.map(c => esc(c.text)).join(' ') + '</p>' : '');
    // ---- pro forma ----
    const ops = fs ? '' : table(['Stabilized year (today’s rents)', { t: 'Amount', r: true }], [...R.ops.lines.map(l => [esc(l.k), usd(l.v)]), ['Vacancy and credit loss', usd(-R.ops.loss)], ['<b>Effective gross income</b>', usd(R.ops.egi)],
      ['Operating costs, taxes, management, reserves', usd(-R.ops.opex)], ['<b>Net operating income</b>', usd(R.ops.noi)]]);
    const ann = table(['Year', { t: 'Cost', r: true }, { t: fs ? 'Sales' : 'NOI', r: true }, { t: 'Levered cash', r: true }], R.annual.map(y => [String(y.year), usd(y.cost), usd(y.noi), usd(y.levered)]));
    const sched = 'Pre-development ' + R.sched.pre + ' months, construction ' + R.sched.build + ', lease-up ' + (R.sched.lease || 0) + '; stabilized month ' + R.sched.toStabilize + ', sale at month ' + R.sched.total + '.';
    const rets = table(['Return', { t: 'Value', r: true }], [['Unlevered IRR', pct(h.unlevIrr)], ['Levered IRR', pct(h.levIrr)], ['Unlevered NPV at ' + v.discountRate + '%', usd(h.npvUnlev)], ['Levered NPV at ' + v.discountRate + '%', usd(h.npvLev)],
      ['Equity multiple', num(h.multiple, 2) + '×'], ['Peak equity', usd(h.equity)], ['Levered profit (cash out − cash in)', usd(h.profit)], ...(fs ? [['Margin on sales', pct(h.margin)]] : [['Yield on cost', pct(h.yoc)], ['Stabilized value at the market cap', usd(h.value)], ['Value over cost', usd(h.valueCreation)], ['DSCR, first stabilized year', h.dscr != null ? num(h.dscr, 2) + '×' : '—'], ['Cash on cash', pct(h.coc)]]),
      ['Peak construction loan', usd(h.peakLoan) + ' (' + pct(h.ltc, 1) + ' of cost)']]);
    const be = study.pf.breakEven, beTxt = !be ? '' : '<p class="rnote">' + breakEvenText(be) + ' ' + esc(be.note) + '</p>';
    const proforma = '<h2 class="full">Pro forma</h2><p>The platform’s month-by-month development model: land at closing, soft costs through pre-development and construction, hard costs on an S-curve, equity first then a ' + v.ltc + '% construction loan at ' + v.rate + '% (interest capitalized), lease-up income paying the loan down, ' +
      (fs ? 'homes closing at ' + (v.absorption ?? R.A.absorption) + ' a month.' : 'a permanent loan at stabilization (the smaller of ' + v.ltv + '% of value and ' + v.dscr + '× coverage at ' + v.permRate + '%), and a sale on forward NOI at a ' + v.exitCap + '% cap rate after ' + v.hold + ' years.') + ' ' + sched + '</p>' +
      '<div class="two"><div>' + rets + beTxt + '</div><div>' + ops + '</div></div><h3 style="margin-top:14px">Annual cash flow</h3>' + ann;
    // ---- hold ----
    const hr = study.hold?.result, hold = hr ? '<h2>Hold analysis (stabilized, before tax)</h2><p>The stabilized asset bought at its total development cost and held ' + hr.annual.length + ' years, on the budgeting suite’s before-tax engine (proven on five reference deals): ' +
      'year-1 NOI ' + usd(hr.summary.year1NOI) + ', a ' + pct(hr.summary.acquisitionCapRate) + ' cap on cost; optimal hold year ' + (hr.summary.optimalHoldingYear ?? '—') + ' at ' + pct(hr.summary.optimalHoldingYield) + ' equity IRR.</p>' +
      table(['Year', { t: 'NOI', r: true }, { t: 'Debt service', r: true }, { t: 'Cash flow', r: true }, { t: 'DSCR', r: true }, { t: 'Cash on cash', r: true }, { t: 'Equity IRR if sold', r: true }],
        hr.annual.map(y => [String(y.year), usd(y.netOperatingIncome), usd(y.debtService), usd(y.cashFlowBeforeTaxes), y.dscr != null ? num(y.dscr, 2) + '×' : '—', pct(y.cashOnCash), pct(y.equityIRR)])) : '';
    // ---- sensitivity ----
    const sv = study.sensitivity, mName = sv?.metric === 'margin' ? 'margin' : 'levered IRR';
    const grids = (sv?.grids || []).map(g => '<h3 style="margin-top:12px">' + esc(mName[0].toUpperCase() + mName.slice(1)) + ': ' + esc(gridTitle(g)) + '</h3>' +
      table(['', ...g.cols.map(c => ({ t: c, r: true }))], g.cells.map((row, i) => [esc(g.rows[i]), ...row.map(c => pct(c, 1))]))).join('');
    const sens = sv ? '<h2 class="full">Sensitivity</h2><p>Each case re-runs the budget and the pro forma (a cost change carries its contingency, fees and interest).</p>' + tornadoSvg(sv.tornado, esc) +
      table(['Input', 'Low case', { t: mName, r: true }, 'High case', { t: mName, r: true }], sv.tornado.rows.map(x => [esc(x.label), esc(x.loText), pct(x.lo), esc(x.hiText), pct(x.hi)])) + grids : '';
    // ---- scenarios ----
    const sc = (o.scenarios || []).length > 1 ? '<h2>Scenarios</h2>' + table(['Scenario', { t: 'Total cost', r: true }, { t: 'NOI', r: true }, { t: 'Yield on cost', r: true }, { t: 'Levered IRR', r: true }, { t: 'Profit', r: true }],
      o.scenarios.map(x => [esc(x.name), usd(x.headline.totalCost), usd(x.headline.noi), pct(x.headline.yoc), pct(x.headline.levIrr), usd(x.headline.profit)])) : '';
    // ---- registers ----
    const risk = '<h2 class="full">Risk analysis</h2>' + table(['Level', 'Risk', 'Why', 'What settles it'], study.risks.map(x => ['<b style="color:' + LEVEL[x.level] + '">' + x.level.toUpperCase() + '</b>', esc(x.title), esc(x.detail), esc(x.settle)]));
    const reg = '<h2 class="full">Fact &amp; assumption register</h2><p>Every input and measured fact with where it came from. <i>Public data</i>: the platform’s nightly data; <i>Cost library</i>: the FS budget workbook; <i>From the concept plan</i>: measured on the layout; <i>House assumption</i>: a platform default, not verified; <i>Your input</i>: changed in the workspace.</p>' +
      table(['Group', 'Item', 'Value', 'Source', 'Confidence'], study.facts.map(f => [esc(f.group), esc(f.label), esc(f.value), esc(f.source), esc(f.confidence)]));
    const lines = '<h2 class="full">Budget line items</h2>' + table(['CSI', 'Item', { t: 'Qty', r: true }, 'Unit', { t: 'Rate', r: true }, { t: 'Amount', r: true }, 'Source'],
      study.budgetRows.map(l => ['<span class="m">' + esc(l.csi) + '</span>', esc(l.desc) + (l.edited ? ' <i>(edited)</i>' : '') + (l.off ? ' <i>(off)</i>' : ''), num(l.qty, l.qty < 10 ? 2 : 0), esc(l.unit), l.unit === '$ base' ? pct(l.rate, 1) : '$' + num(l.rate, 2), usd(l.amount), esc(l.source || '')]));
    const body = scope + kp1 + kp2 + '<h2>Summary</h2>' + summary + site + planset + budget + proforma + hold + sens + sc + risk + reg + lines;
    const sources = 'Parcels: appraisal district / provider outlines held by the platform. Layout, quantities and plan set: the platform’s layout engine and plan-set builder (concept, schematic). Costs: Finishes Solutions budget workbook (2026.08-v2, Waller County TX), platform parametric rates (2026, UNVERIFIED), BLS PPI construction materials via FRED (escalation). Rates: SOFR and 10-yr Treasury via FRED. Rents: platform assumptions with Zillow ZORI as a check. Returns: the platform’s development model and the budgeting suite’s before-tax engine.';
    return reportDoc({ kicker: 'Feasibility report' + (study.scenario ? ' · ' + study.scenario.name : ''), title: o.title || study.project.name, meta: esc((study.option?.name || '') + (study.project.client ? ' · for ' + study.project.client : '') + ' · inputs ' + study.inputsHash), body, sources,
      css: '.scope{margin-top:14px;border:1px solid #e8ebeb;border-left:3px solid #b7791f;border-radius:6px;padding:9px 12px;font-size:9.5px;color:#4d5457}.nar{margin-top:10px;border:1px dashed #bcc2c4;border-radius:6px;padding:8px 12px}.plan svg{max-height:360px}' });
  }
  return { reportHtml };
}
