// Ported from fs-budgeting-suite api/shared/investment/constants.js (origin/feature @ 4187c8c).
// Versioning is two independent axes: what shape the input takes, and which
// formulas produced the result. A saved analysis records both, and an old
// version is never silently recalculated with a newer engine.
export const SCHEMA_VERSION = 1;
// 1.1.0: projections generalized to five OR ten years (Year-N sale still
// uses Year-N+1 NOI; one extra operating year is always computed).
export const CALCULATION_VERSION = 'before-tax-1.1.0';
export const SQFT_PER_ACRE = 43560;
// Sensitivity scenarios: percent of base acquisition price, base LTV preserved.
export const SENSITIVITY_FACTORS = [0.90, 0.95, 1.00, 1.05, 1.10];
// The validator rejects any horizon not in this list.
export const ALLOWED_YEARS = [5, 10];
export const SUPPORTED_TAX_MODE = 'beforeTax';
export const SUPPORTED_INTEREST_CALC = '30/360';
export const MAX_OTHER_INCOME_ROWS = 20;
export const MAX_CAPEX_ROWS = 20;
export const MAX_TEXT = 500;
