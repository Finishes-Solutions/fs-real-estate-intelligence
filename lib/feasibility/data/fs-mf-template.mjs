// @ts-check
// Ported from fs-budgeting-suite app/index.html (origin/feature @ 4187c8c).
// The Real Estate Intelligence multifamily budget template's default document: blankDoc('multifamily') with its
// DEFAULT_OTHER and DEFAULT_EXPENSES constants. It is the same document the source suite seeds as the multifamily
// template's first version, plus the full operating-expense schedule it publishes as the next version
// (opexSchemaVersion 2: property taxes, insurance, management, payroll, R&M, turnover, marketing, G&A, landscaping
// and reserves appended after the six service rows). That full schedule is the newest one the source uses.
//
// The template carries no line items: a budget's lines are the pricing library's lines (see docFromTemplate() in
// ../rollup.mjs), each at qty 1 / auto false for a lump sum, else qty 0 / auto true.
//
// Every value here is a TEMPLATE DEFAULT. In the source's own words the expense rates are "starting points, not house
// numbers", chosen so the template lands at roughly 46% of income against its own unit mix; a real budget replaces
// them. Each row carries `src: 'FS template default'` so a screen or report can say where a number came from; the
// rollup ignores the field.
//
// Two shapes follow the source's newest conventions: the developer, marketing and closing fees are
// {mode:'amt'|'pct', val} (a bare number in an older template means dollars and reads the same), and impactFees starts
// present and empty at the high basis (a budget with no jurisdiction picked keeps SC-20 at its library $/SF).
//
// DOM-free and dependency-free: loaded by Node and by the browser.

export const TEMPLATE_DEFAULT = 'FS template default';

export const source = {
  kind: 'house',
  label: 'Template default — multifamily budget template',
  ref: 'fs-budgeting-suite multifamily template, full operating-expense schedule (opexSchemaVersion 2) (origin/feature @ 4187c8c)',
  asOf: '2026-10-15',          // the source's budget specification was last verified against this template on this date
  region: 'Waller County, TX',
  confidence: 'medium-low',
  note: 'Starting points, not house numbers. The unit mix, rents, SF, land, fees, contingency and operating-expense rates are '
    + 'the template\'s defaults from one Waller County project; expense rates were chosen to land near 46% of income. '
    + 'Replace every value with the project\'s own before relying on it.'
};

const S = TEMPLATE_DEFAULT;

export const MF_TEMPLATE = {
  key: 'multifamily',
  name: 'Multifamily',
  type: 'Multifamily',
  source,
  doc: {
    type: 'Multifamily',
    resSF: 51365,            // residential buildable SF: the quantity behind every 'sf' line
    amenSF: 1200,            // amenity / clubhouse SF: 0 switches the amenity scope off
    siteSF: 0,               // land area; prices nothing
    units: [
      { label: 'Studio (630)', bd: 0, bth: 1, sf: 630, count: 16, rent: 1203, src: S },
      { label: 'Studio (400)', bd: 0, bth: 1, sf: 400, count: 14, rent: 1160, src: S },
      { label: 'Townhome (1,063)', bd: 2, bth: 2, sf: 1063, count: 14, rent: 1520, src: S },
      { label: 'Townhome (1,200)', bd: 2, bth: 2.5, sf: 1200, count: 14, rent: 1500, src: S }
    ],
    // monthly, per unit when auto (x total units), else x count
    other: [
      { label: 'Utilities billback', rate: 77, count: 0, auto: true, src: S },
      { label: 'Technology package (fiber + comms)', rate: 75, count: 0, auto: true, src: S },
      { label: 'Parking (reserved spaces)', rate: 25, count: 15, auto: false, src: S },
      { label: 'Pet rent (~30% of units)', rate: 25, count: 18, auto: false, src: S },
      { label: 'Admin fees', rate: 20, count: 0, auto: true, src: S },
      { label: 'Premium units', rate: 25, count: 23, auto: false, src: S },
      { label: 'Valet trash', rate: 25, count: 0, auto: true, src: S },
      { label: 'Misc', rate: 15, count: 0, auto: true, src: S }
    ],
    // monthly; per 'unit' (x total units when auto), 'fixed' (x count, or 1) or 'pctIncome' (% of rent + other income)
    expenses: [
      { label: 'City of Waller water & sewer (≈$40–60/unit)', per: 'unit', rate: 60, count: 0, auto: true, src: S },
      { label: 'Ezee Fiber', per: 'unit', rate: 40, count: 0, auto: true, src: S },
      { label: 'Communications (low voltage)', per: 'unit', rate: 15, count: 0, auto: true, src: S },
      { label: 'Ally Waste valet trash service', per: 'unit', rate: 15, count: 0, auto: true, src: S },
      { label: 'City of Waller dumpster — 1 cu yd, 2×/wk pickup', per: 'fixed', rate: 383, count: 1, auto: false, src: S },
      { label: 'Admin / processing costs', per: 'unit', rate: 10, count: 0, auto: true, src: S },
      { label: 'Property Taxes', per: 'pctIncome', rate: 12, count: 0, auto: false, src: S },
      { label: 'Property Insurance', per: 'unit', rate: 65, count: 0, auto: true, src: S },
      { label: 'Property Management Fee', per: 'pctIncome', rate: 4, count: 0, auto: false, src: S },
      { label: 'On-Site Payroll', per: 'unit', rate: 95, count: 0, auto: true, src: S },
      { label: 'Repairs & Maintenance', per: 'unit', rate: 55, count: 0, auto: true, src: S },
      { label: 'Turnover / Make-Ready', per: 'unit', rate: 30, count: 0, auto: true, src: S },
      { label: 'Marketing & Leasing', per: 'unit', rate: 22, count: 0, auto: true, src: S },
      { label: 'General & Administrative', per: 'unit', rate: 18, count: 0, auto: true, src: S },
      { label: 'Landscaping & Amenity Upkeep', per: 'unit', rate: 20, count: 0, auto: true, src: S },
      { label: 'Replacement Reserves', per: 'unit', rate: 25, count: 0, auto: true, src: S }
    ],
    // profit, as a percent of construction HARD cost only
    companies: [{ name: 'Developer (company profit)', pct: 12, src: S }],
    // $2.00 per building SF (resSF + amenSF)
    contingency: { mode: 'psf', val: 2, src: S },
    // land is dollars; each fee is {mode:'amt'|'pct', val}
    projectCosts: {
      land: 1200000,
      dev: { mode: 'amt', val: 200000 },
      mkt: { mode: 'amt', val: 75000 },
      cls: { mode: 'amt', val: 0 },
      src: S
    },
    opexSchemaVersion: 2,
    guardrailAcks: [],
    impactFees: { scheduleKey: null, scheduleName: null, scheduleVersion: null, effective: null,
                  excluded: false, basis: 'high', meters: [], extras: [], manual: [] },
    status: 'Draft'
  }
};

export default MF_TEMPLATE;
