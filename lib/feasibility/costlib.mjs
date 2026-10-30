// @ts-check
// The cost library a project budget is priced from (docs/INTEGRATION_PLAN.md §5.1). Two sources, each labelled with
// where it comes from, its region, its as-of date and how far to trust it. No rate is invented here:
//  1. LIBRARY: the the team's budget workbook (lib/feasibility/data/fs-pricing-2026-08.mjs), CSI-coded $ per
//     residential / amenity sf and soft costs, for apartment and attached-home buildings. One Waller County project's
//     workbook back-solved to $/SF: medium-low confidence.
//  2. TEAM BUDGETS: the medians of the team's own 2024–25 Smartsheet budgets by building type
//     (lib/feasibility/data/fs-budgets-2024-25.mjs), $ per building sf line by line before a 10% contractor fee, for the
//     uses the workbook doesn't cover: houses, retail and restaurants, small industrial / flex, a c-store. Medium confidence.
//  3. PARAMETRIC: the platform's own $ per gross sf by use and its site-work unit rates (lib/proforma.mjs HARD, SITE,
//     TI…), 2026 Houston / Katy / Waller starting points marked UNVERIFIED there: low confidence. Used for every use
//     the workbook doesn't cover, and for site work, which is priced from the layout's own quantities (paving sf,
//     stalls, detention acre-feet…) rather than the workbook's $/SF infrastructure lines, so nothing is counted twice.
import { PRICING, source as LIB_SOURCE } from './data/fs-pricing-2026-08.mjs';
import * as TB from './data/fs-budgets-2024-25.mjs';
import { TX_WALLER } from './data/fees-tx-waller.mjs';
import { src } from './model.mjs';

export { TX_WALLER };
export const LIB_MONTH = PRICING.effective.slice(0, 7);

// the uses the workbook prices (its lines are a garden apartment / townhome project); everything else is parametric
export const LIBRARY_USES = ['multifamily', 'townhomes', 'duplex'];

// Workbook lines left out because the layout prices that work from its own quantities (site prep covers clearing,
// grading, on-site utilities, landscaping and irrigation; paving, stalls and detention are their own lines; a pool is
// an amenity piece of the plan). Kept: testing and inspections (general conditions), mailboxes, access control,
// fences and site furnishings, which no site line covers.
const SITE_BY_PLAN = new Set(['31 10 00', '31 20 00', '31 23 00', '32 10 00', '32 30 00', '33 10 00', '33 30 00', '33 40 00', '33 70 00', '33 80 00', '33 90 00', '13 11 00', '32 80 00', '32 90 00']);
const planPriced = l => l.scope === 'res' && SITE_BY_PLAN.has(l.code);
export const libraryLines = () => PRICING.lines.filter(l => !planPriced(l));
export const excludedLibraryLines = () => PRICING.lines.filter(planPriced);
export const IMPACT_LINE = { scope: 'soft', code: 'SC-20' }; // the workbook's water & sewer impact / tap line ($/sf), replaced by the fee calculator when meters are given

export const libSource = () => src('library', LIB_SOURCE.label, { ref: LIB_SOURCE.ref, asOf: LIB_SOURCE.asOf, confidence: 'medium-low' });
export const teamSource = r => src('library', TB.source.label + (r ? ' (median of ' + r.n + ' budget' + (r.n === 1 ? '' : 's') + ')' : ''), { ref: TB.source.ref, asOf: TB.source.asOf, confidence: r && r.n < 3 ? 'medium-low' : TB.source.confidence });
export const TEAM_MONTH = TB.source.asOf.slice(0, 7), TEAM_FEE_PCT = TB.FEE_PCT, TEAM_LINES = TB.LINES;
// the team budgets' rate table for a use on this plan, or null (the workbook's uses, uses they don't cover, a big
// warehouse, a home community's tiny or manufactured homes, a gas station the owner doesn't build)
export function teamRates(u, use, hardByUse = {}) {
  if (LIBRARY_USES.includes(u) || !use || !(use.gsf > 0) || !(hardByUse[u] > 0)) return null;
  if (u === 'sfr' && (use.homes?.tiny || use.homes?.manufactured)) return null;
  return TB.ratesFor(u, { gsf: use.gsf });
}
export const TEAM_USES = ['sfr', 'retail', 'restaurant', 'industrial', 'fuel'];

export const PARAM_SOURCE = src('house', 'Platform parametric rate, 2026 Houston / Katy / Waller suburban starting point (UNVERIFIED; range in the pro forma notes)', { ref: 'lib/proforma.mjs', asOf: '2026', confidence: 'low' });


// site-work lines: the pro forma's site parts, with the CSI division, what the quantity is and its unit
export const SITE_LINES = {
  prep: { csi: '31 00 00', desc: 'Site preparation: clearing, mass grading, lime-stabilized pads, erosion control, on-site utilities, landscaping, lighting', unit: 'sf developed', qtyOf: (M, R) => R.siteQty?.prep },
  paving: { csi: '32 12 00', desc: 'Drives, fire lanes and plazas outside the parking lots (concrete; truck courts at 1.25×)', unit: 'sf', qtyOf: M => (M.pavedSf || 0) + (M.truckSf || 0) * 1.25 },
  stalls: { csi: '32 17 00', desc: 'Surface parking spaces: paving, striping, lighting, islands', unit: 'spaces', qtyOf: (M, R) => R.P?.stalls ?? M.stalls },
  deck: { csi: '03 40 00', desc: 'Structured parking spaces (precast garage)', unit: 'spaces', qtyOf: M => M.deck || 0 },
  pond: { csi: '33 46 00', desc: 'Detention pond: excavation, outfall structure, slopes and seeding', unit: 'ac-ft', qtyOf: M => Math.max(0, (M.detentionAcFt || 0) - (M.vaultAcFt || 0)) },
  vault: { csi: '33 46 00', desc: 'Underground detention vaults / chambers', unit: 'ac-ft', qtyOf: M => M.vaultAcFt || 0 },
  lots: { csi: '31 00 00', desc: 'Finished single-family lots: streets, utilities, detention share', unit: 'lots', qtyOf: (M, R) => R.siteQty?.lots },
  amenities: { csi: '11 68 00', desc: 'Amenity pieces on the plan: courts, pool and deck, playground', unit: 'ls', qtyOf: () => 1 },
  trucks: { csi: '11 40 00', desc: 'Food truck stalls: pad, power, water and grease', unit: 'stalls', qtyOf: M => M.trucks || 0 }
};
