// Ported from fs-budgeting-suite api/shared/investment/result-rows.js (origin/feature @ 4187c8c).
// Flatten a canonical result's annual array into one flat row per analysis
// year. One place defines the column mapping so every consumer of per-year
// rows (stored rows, exports, verification) agrees about what a column means.
export const COLUMNS = [
  'periodEnd', 'potentialIncome', 'vacancyLoss', 'effectiveRentalIncome', 'otherIncome',
  'grossOperatingIncome', 'operatingExpenses', 'netOperatingIncome', 'capitalExpenses',
  'debtService', 'cashFlowBeforeTaxes', 'endingLoanBalance', 'grossSalePrice',
  'sellingCosts', 'netSaleProceeds', 'projectedLTV', 'dscr', 'debtYield', 'cashOnCash',
  'returnOnEquity', 'equityMultiple', 'propertyIRR', 'effectiveLoanRate', 'equityIRR',
  'leverageImpact'
];

export function annualRows(result) {
  return result.annual.map(a => {
    const row = { analysisYear: a.year };
    for (const c of COLUMNS) row[c] = a[c] === undefined ? null : a[c];
    return row;
  });
}
