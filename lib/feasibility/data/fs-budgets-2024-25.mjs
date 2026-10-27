// @ts-check
// The team's own budgets, 2024–25: Smartsheet "Budget For Projects 2024-2025" (about 100 budgets, Mar 2024 – Mar 2025,
// Waller, Harris, Montgomery, Grimes and other Texas counties). Each budget prices a building per square foot of building,
// line by line, with a contractor fee (general conditions, overhead and profit, 10% in nearly every budget) on the
// subtotal. These are the MEDIANS of the new-construction budgets of each type (the building sections of multi-building
// budgets counted apart; build-outs, remodels and renovations left out), read on 2026-10-27.
//
// Only the building's own lines are here (foundations, shell, services, interiors). The budgets also carry the site's
// infrastructure per building sf (excavation, water / sewer / storm, power, fiber, paving: about $25–30/sf for
// apartments) and the site finish (irrigation, sod, striping); the platform prices that work from the layout's own
// quantities instead (lib/feasibility/costlib.mjs SITE_LINES), so it isn't counted twice.
//
// DOM-free and dependency-free: loaded by Node and by the browser.

export const source = {
  kind: 'library',
  label: 'Finishes Solutions budgets 2024–25 (Smartsheet Budget For Projects 2024-2025), medians by building type',
  ref: 'Budget For Projects 2024-2025, read 2026-10-27',
  asOf: '2024-10-01', // (the middle of the budgets' dates: their rates escalate from here)
  region: 'Houston region and Texas, TX',
  confidence: 'medium',
  note: 'Medians of the team\'s own new-construction budgets of each type; n says how many. Tiny homes rest on one budget.'
};

// the lines, with a CSI division for the schedule; the budgets' own group names
export const LINES = [
  ['foundations', '03 30 00', 'Infrastructure', 'Foundations: strip footings and slab, reinforced concrete'],
  ['roof', '07 50 00', 'Shell of Building', 'Roof and gutters'],
  ['walls', '06 10 00', 'Shell of Building', 'Exterior framing and walls: framing, sheathing and wrap, siding / brick / panels, trim, fascia, soffit, roof decking'],
  ['windows', '08 50 00', 'Shell of Building', 'Exterior windows / storefront'],
  ['doors', '08 10 00', 'Shell of Building', 'Exterior doors and frames'],
  ['mechanical', '23 00 00', 'Services (MEP)', 'Mechanical: HVAC equipment and distribution'],
  ['plumbing', '22 00 00', 'Services (MEP)', 'Plumbing: fixtures, sinks, water heaters, piping'],
  ['electrical', '26 00 00', 'Services (MEP)', 'Electrical: switchgear, feeders, devices, conduit and wire'],
  ['sprinkler', '21 00 00', 'Services (MEP)', 'Fire sprinklers and alarm'],
  ['partitions', '09 21 00', 'Interiors', 'Partitions: gypsum board on studs, insulation'],
  ['carpentry', '06 20 00', 'Interiors', 'Carpentry: interior doors, base, rails, shelving'],
  ['fittings', '12 30 00', 'Interiors', 'Fittings: cabinets and countertops'],
  ['finishes', '09 90 00', 'Interiors', 'Wall finishes: painting'],
  ['flooring', '09 60 00', 'Interiors', 'Flooring and tile'],
  ['appliances', '11 30 00', 'Interiors', 'Appliances']
].map(([key, code, grp, desc]) => ({ key, code, grp, desc }));

// $ per building sf before the contractor fee, by type; n: budgets (or building sections) behind the medians
const R = (n, v) => ({ n, psf: Object.fromEntries(LINES.map((l, i) => [l.key, v[i] || 0])) });
//                                found roof  walls  win   door  mech plumb elec  sprk part  carp fit   fin  floor appl
export const RATES = {
  multifamily: R(34, [12, 2.5, 28, 2.5, 2, 6, 8, 7, 2.5, 6.75, 6, 5, 4, 7.75, 2]),
  townhomes: R(4, [10.5, 4.33, 29, 3.66, 2.55, 6, 6.75, 7, 0, 7, 6, 4.88, 4, 8.6, 2]),
  duplex: R(3, [7.5, 3.95, 20.98, 2.88, 2.33, 6, 8.12, 7, 0, 6, 5.75, 4.4, 3, 6.9, 2.5]),
  sfr: R(3, [13, 2.6, 28, 4, 3, 6, 7.75, 7, 2.5, 8, 7.5, 7, 3, 10, 2]),
  tiny: R(1, [0, 2.5, 27, 3, 2, 7, 7.75, 8, 0, 4, 5, 5, 3, 8, 0]),
  retail: R(6, [12, 17.5, 44, 13.5, 12, 7, 8.75, 8, 0, 8, 4, 3, 5, 7.5, 0]),
  industrial: R(12, [12, 15.91, 30, 10, 9, 8, 6.88, 7.12, 0, 6.5, 4.5, 3, 5, 7, 0]),
  fuel: R(8, [12, 25.5, 40, 6, 5, 7, 5.75, 6.5, 3, 5, 2, 3, 4, 8.5, 0])
};
// the whole of a budget per building sf before the contractor fee (the building lines above plus the site's
// infrastructure and finish the budgets carry per building sf): the medians the platform's budget is checked against
export const ALL_IN_PSF = { multifamily: 129, townhomes: 126, duplex: 112, sfr: 137, retail: 179, industrial: 155, fuel: 162 };
// a clubhouse / leasing office and amenity building: the budgets price it whole ("Leasing Office / Club House", $170–220/sf)
export const AMENITY_PSF = 195;
// the contractor fee the budgets carry on their subtotal (general conditions, overhead and profit)
export const FEE_PCT = 10;
// shares after construction, the medians of the budgets that carry them: soft costs and due diligence of construction;
// marketing / brokerage and closing of construction and land. The budgets carry no contingency and no developer fee.
export const ADDONS = { softPct: 7.4, ddPct: 0.7, mktPct: 1.1, closingPct: 3.0 };
// industrial: the budgets are small multi-tenant and flex buildings with finished bays; a big bulk warehouse costs far
// less a sf, so above this size the platform's own warehouse rate is used
export const INDUSTRIAL_MAX_SF = 40000;

// the rate table for a use (and its size, for industrial; tiny: a tiny-home community's homes), or null where the budgets
// don't cover it (offices, medical, hotels, churches, storage, food trucks…)
export function ratesFor(use, { gsf = 0, tiny = false } = {}) {
  if (use === 'sfr' && tiny) return RATES.tiny;
  if (use === 'restaurant') return RATES.retail;
  if (use === 'industrial' && gsf > INDUSTRIAL_MAX_SF) return null;
  return RATES[use] || null;
}
export const psfOf = r => r ? Object.values(r.psf).reduce((s, v) => s + v, 0) : null;
