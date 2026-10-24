// Stabilized hold analysis (before-tax, one fully amortizing 30/360 first mortgage), ported from fs-budgeting-suite
// api/shared/investment/ (origin/feature @ 4187c8c) and documented there in docs/INVESTMENT_FORMULAS.md. Financial
// primitives (pmt, remainingBalance, roundToNearestThousand, irr) come from ../finance.mjs.
export { calculateInvestmentAnalysis } from './calculate.mjs';
export { analysisFacts, drivers, diagnostics, runScenario, headline, SCENARIO_KEYS } from './insight.mjs';
