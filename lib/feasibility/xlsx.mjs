// @ts-check
// The study as an Excel workbook (server side: api/feasibility.js and scripts/sample-run.mjs; the browser downloads it
// from the API). Sheets: Summary, Assumptions (with sources), Budget lines, CSI, Monthly cash flow, Annual, Hold,
// Sensitivity, Scenarios, Risks. Values, not formulas: the engine computed them, and the Assumptions sheet says where
// every input came from. Also the register and budget as CSV.
import ExcelJS from 'exceljs';

const GREEN = 'FF006527';
const head = (ws, cols) => { ws.columns = cols.map(c => ({ header: c.h, key: c.k, width: c.w || 14, style: c.f ? { numFmt: c.f } : {} })); const r = ws.getRow(1); r.font = { bold: true, color: { argb: 'FFFFFFFF' } }; r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } }; ws.views = [{ state: 'frozen', ySplit: 1 }]; };
const $ = '"$"#,##0;[Red]-"$"#,##0', P = '0.00%', N = '#,##0', N2 = '#,##0.00';

export async function workbookBuffer(study, { scenarios = [] } = {}) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Finishes Solutions feasibility workspace'; wb.created = new Date(0); // (a fixed date: the same study gives the same file)
  const h = study.pf.headline, T = study.budget.totals, R = study.pf.R;
  // ---- summary ----
  const s = wb.addWorksheet('Summary'); head(s, [{ h: 'Item', k: 'a', w: 44 }, { h: 'Value', k: 'b', w: 22 }]);
  const rows = [['Project', study.project.name], ['Site option', study.option?.name || ''], ['Scenario', study.scenario?.name || 'Base case'], ['Inputs hash', study.inputsHash], ['Scope', study.scope],
    ['Site acres', study.site.acres], ['Gross building sf', study.site.gfa], ['Units', study.site.units], ['Parking spaces', study.site.spaces],
    ['Land and closing', T.land], ['Construction contract', T.contract], ['Soft costs', T.softLines], ['Developer fee', T.devFee], ['Project cost before financing', T.project], ['Construction interest', h.interest], ['Loan fees', h.loanFees], ['Total development cost', h.totalCost],
    ['Stabilized NOI', h.noi], ['Yield on cost', h.yoc], ['Unlevered IRR', h.unlevIrr], ['Levered IRR', h.levIrr], ['Unlevered NPV', h.npvUnlev], ['Levered NPV', h.npvLev], ['Equity multiple', h.multiple], ['Peak equity', h.equity], ['Levered profit', h.profit], ['DSCR', h.dscr], ['Margin (for sale)', h.margin]];
  for (const [a, b] of rows) { const r = s.addRow({ a, b }); if (typeof b === 'number') r.getCell(2).numFmt = /IRR|Yield|Margin/.test(a) ? P : /multiple|DSCR|acres/.test(a) ? N2 : /sf|Units|spaces/.test(a) ? N : $; }
  s.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
  // ---- assumptions ----
  const a = wb.addWorksheet('Assumptions'); head(a, [{ h: 'Group', k: 'g', w: 12 }, { h: 'Key', k: 'k', w: 22 }, { h: 'Assumption', k: 'l', w: 34 }, { h: 'Value', k: 'v', w: 14 }, { h: 'Unit', k: 'u', w: 8 }, { h: 'Default', k: 'd', w: 12 },
    { h: 'Usual low', k: 'lo', w: 10 }, { h: 'Usual high', k: 'hi', w: 10 }, { h: 'Source kind', k: 'sk', w: 12 }, { h: 'Source', k: 's', w: 70 }, { h: 'As of', k: 'as', w: 12 }, { h: 'Confidence', k: 'c', w: 12 }, { h: 'Market check', k: 'mc', w: 60 }]);
  for (const x of study.register) a.addRow({ g: x.group, k: x.key, l: x.label, v: x.value, u: x.unit, d: x.edited ? x.default : '', lo: x.range?.[0] ?? '', hi: x.range?.[1] ?? '', sk: x.source.kind, s: x.source.label, as: x.source.asOf || '', c: x.source.confidence || '', mc: x.marketCheck || '' });
  // ---- budget ----
  const b = wb.addWorksheet('Budget'); head(b, [{ h: 'Group', k: 'group', w: 10 }, { h: 'CSI', k: 'csi', w: 12 }, { h: 'Division', k: 'division', w: 30 }, { h: 'Item', k: 'desc', w: 50 }, { h: 'Qty', k: 'qty', w: 12, f: N2 }, { h: 'Unit', k: 'unit', w: 14 },
    { h: 'Rate', k: 'rate', w: 12, f: N2 }, { h: 'Amount', k: 'amount', w: 16, f: $ }, { h: 'Edited', k: 'edited', w: 8 }, { h: 'Off', k: 'off', w: 6 }, { h: 'Source', k: 'source', w: 70 }, { h: 'Confidence', k: 'confidence', w: 12 }]);
  for (const r of study.budgetRows) b.addRow(r);
  for (const [l, v] of [['GC fee (library lines)', T.gcFee], ['Contingency', T.contingency], ['Developer fee', T.devFee], ['Land and closing', T.land], ['Construction interest (pro forma)', h.interest], ['Loan fees (pro forma)', h.loanFees], ['TOTAL DEVELOPMENT COST', h.totalCost]]) { const r = b.addRow({ desc: l, amount: v }); r.font = { bold: /TOTAL/.test(l) }; }
  // ---- CSI ----
  const c = wb.addWorksheet('CSI'); head(c, [{ h: 'Division', k: 'd', w: 46 }, { h: 'Amount', k: 'v', w: 16, f: $ }, { h: 'Share of contract', k: 'p', w: 16, f: P }]);
  for (const d of study.budget.csi?.divisions || []) c.addRow({ d: d.title || d.key, v: d.total, p: d.total / Math.max(1, T.contract) });
  for (const m of study.budget.csi?.markups || []) c.addRow({ d: m.desc, v: m.total, p: m.total / Math.max(1, T.contract) });
  c.addRow({ d: 'Contract sum', v: T.contract, p: 1 }).font = { bold: true };
  // ---- monthly ----
  const m = wb.addWorksheet('Monthly'); head(m, [{ h: 'Month', k: 't', w: 8 }, { h: 'Cost', k: 'cost', w: 16, f: $ }, { h: 'NOI', k: 'noi', w: 16, f: $ }, { h: 'Unlevered', k: 'u', w: 16, f: $ }, { h: 'Levered', k: 'l', w: 16, f: $ }]);
  R.monthly.cost.forEach((x, t) => m.addRow({ t, cost: x, noi: R.monthly.noi[t], u: R.monthly.unlevered[t], l: R.monthly.levered[t] }));
  // ---- annual ----
  const y = wb.addWorksheet('Annual'); head(y, [{ h: 'Year', k: 'year', w: 8 }, { h: 'Cost', k: 'cost', w: 16, f: $ }, { h: 'NOI / sales', k: 'noi', w: 16, f: $ }, { h: 'Levered cash', k: 'levered', w: 16, f: $ }]);
  for (const r of R.annual) y.addRow(r);
  // ---- hold ----
  if (study.hold?.result) { const ho = wb.addWorksheet('Hold'); head(ho, [{ h: 'Year', k: 'year', w: 8 }, { h: 'NOI', k: 'netOperatingIncome', w: 16, f: $ }, { h: 'Debt service', k: 'debtService', w: 16, f: $ }, { h: 'Cash flow', k: 'cashFlowBeforeTaxes', w: 16, f: $ },
    { h: 'DSCR', k: 'dscr', w: 8, f: N2 }, { h: 'Cash on cash', k: 'cashOnCash', w: 12, f: P }, { h: 'Sale price', k: 'grossSalePrice', w: 16, f: $ }, { h: 'Net proceeds', k: 'netSaleProceeds', w: 16, f: $ }, { h: 'Equity IRR', k: 'equityIRR', w: 12, f: P }, { h: 'Property IRR', k: 'propertyIRR', w: 12, f: P }]);
    for (const r of study.hold.result.annual) ho.addRow(r); }
  // ---- sensitivity ----
  if (study.sensitivity) { const se = wb.addWorksheet('Sensitivity'); head(se, [{ h: 'Input', k: 'a', w: 30 }, { h: 'Low case', k: 'b', w: 14 }, { h: 'Result', k: 'c', w: 12, f: P }, { h: 'High case', k: 'd', w: 14 }, { h: 'Result', k: 'e', w: 12, f: P }]);
    for (const r of study.sensitivity.tornado.rows) se.addRow({ a: r.label, b: r.loText, c: r.lo, d: r.hiText, e: r.hi });
    for (const g of study.sensitivity.grids) { se.addRow({}); se.addRow({ a: study.sensitivity.metric + ' grid', b: g.cols[0], c: null }).font = { bold: true }; se.addRow(['', ...g.cols]); g.cells.forEach((row, i) => { const r = se.addRow([g.rows[i], ...row]); row.forEach((_, j) => { r.getCell(j + 2).numFmt = P; }); }); } }
  // ---- scenarios ----
  if (scenarios.length) { const sc = wb.addWorksheet('Scenarios'); head(sc, [{ h: 'Scenario', k: 'n', w: 24 }, { h: 'Total cost', k: 'tc', w: 16, f: $ }, { h: 'NOI', k: 'noi', w: 16, f: $ }, { h: 'Yield on cost', k: 'y', w: 12, f: P }, { h: 'Levered IRR', k: 'i', w: 12, f: P }, { h: 'Profit', k: 'p', w: 16, f: $ }]);
    for (const x of scenarios) sc.addRow({ n: x.name, tc: x.headline.totalCost, noi: x.headline.noi, y: x.headline.yoc, i: x.headline.levIrr, p: x.headline.profit }); }
  // ---- risks ----
  const rk = wb.addWorksheet('Risks'); head(rk, [{ h: 'Level', k: 'level', w: 8 }, { h: 'Category', k: 'category', w: 12 }, { h: 'Risk', k: 'title', w: 44 }, { h: 'Why', k: 'detail', w: 70 }, { h: 'What settles it', k: 'settle', w: 50 }]);
  for (const r of study.risks) rk.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// CSV (RFC 4180 quoting)
const cell = v => v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
export const toCsv = (cols, rows) => [cols.map(c => cell(c[1])).join(','), ...rows.map(r => cols.map(c => cell(r[c[0]])).join(','))].join('\n') + '\n';
export const registerCsv = study => toCsv([['group', 'Group'], ['label', 'Item'], ['value', 'Value'], ['kindLabel', 'Source kind'], ['source', 'Source'], ['asOf', 'As of'], ['confidence', 'Confidence']], study.facts);
export const budgetCsv = study => toCsv([['group', 'Group'], ['csi', 'CSI'], ['division', 'Division'], ['desc', 'Item'], ['qty', 'Qty'], ['unit', 'Unit'], ['rate', 'Rate'], ['amount', 'Amount'], ['edited', 'Edited'], ['off', 'Off'], ['source', 'Source'], ['confidence', 'Confidence']], study.budgetRows);
