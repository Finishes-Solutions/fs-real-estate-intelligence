// @ts-check
// The cost library a project budget is priced from (docs/INTEGRATION_PLAN.md §5.1). Four sources, each labelled with
// where it comes from, its region, its as-of date and how far to trust it. No rate is invented here:
//  1. LIBRARY: the team's budget workbook (lib/feasibility/data/fs-pricing-2026-08.mjs), CSI-coded $ per
//     residential / amenity sf and soft costs, for apartment and attached-home buildings. One Waller County project's
//     workbook back-solved to $/SF: medium-low confidence.
//  2. TEAM BUDGETS: the medians of the team's own 2024–25 Smartsheet budgets by building type
//     (lib/feasibility/data/fs-budgets-2024-25.mjs), $ per building sf line by line before a 10% contractor fee, for the
//     uses the workbook doesn't cover: houses, retail and restaurants, small industrial / flex, a c-store. Medium confidence.
//  3. FINISHES BUDGET LIBRARY: the purchasing workbook's line-item template (lib/feasibility/data/fs-budget-library-v1.mjs,
//     run by lib/feasibility/budgetlib.mjs): about 70 lines a home, each a quantity taken off the home's size and a
//     LOW / LIKELY / HIGH rate from bids, quotes and closed-home actuals. Prices houses, cottages and townhomes; its
//     apartment rates are placeholders and only a cross-check beside the workbook's. Medium confidence for houses,
//     medium-low for townhomes (none has been built from these rates).
//  4. PARAMETRIC: the platform's own $ per gross sf by use and its site-work unit rates (lib/proforma.mjs HARD, SITE,
//     TI…), 2026 Houston / Katy / Waller starting points marked UNVERIFIED there: low confidence. Used for every use
//     no source above covers, and for site work, which is priced from the layout's own quantities (paving sf,
//     stalls, detention acre-feet…) rather than the workbook's $/SF infrastructure lines, so nothing is counted twice.
import { PRICING, source as LIB_SOURCE } from './data/fs-pricing-2026-08.mjs';
import * as TB from './data/fs-budgets-2024-25.mjs';
import { TX_WALLER } from './data/fees-tx-waller.mjs';
import * as FS from './data/fs-budget-library-v1.mjs';
import { priceOf, jurisdictionOf } from './budgetlib.mjs';
import { src } from './model.mjs';

export { TX_WALLER };
export const LIB_MONTH = PRICING.effective.slice(0, 7);

// the uses the workbook prices (its lines are a garden apartment project; townhomes moved to the Finishes budget
// library, FSLIB_USES below)
export const LIBRARY_USES = ['multifamily', 'duplex'];

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
  if (LIBRARY_USES.includes(u) || FSLIB_USES.includes(u) && fsLibInputs(u, use) || !use || !(use.gsf > 0) || !(hardByUse[u] > 0)) return null;
  if (u === 'sfr' && (use.homes?.tiny || use.homes?.manufactured)) return null;
  return TB.ratesFor(u, { gsf: use.gsf });
}
export const TEAM_USES = ['sfr', 'retail', 'restaurant', 'industrial', 'fuel'];

// ---------- the Finishes budget library (houses, cottages, townhomes) ----------
export const FSLIB_USES = ['sfr', 'townhomes'];
export const FSLIB_MONTH = FS.source.asOf.slice(0, 7);
// Template lines left out because the platform already prices that work from the layout: a finished lot (streets,
// utilities, its share of detention) and site preparation cover storm-water protection, lot clearing, the pad and fill,
// and a culvert. On-lot work stays in (driveway and walks, sod, landscape, fence, final grade): no site line has it.
export const FSLIB_SITE_BY_PLAN = ['T-010', 'T-012', 'T-013', 'T-014'];
// the template's impact fee and water / sewer tap lines, replaced by the fee calculator when meters are given
export const FSLIB_FEE_LINES = ['T-007', 'T-008'];
// a townhome's share of a detached home's driveway, sod and fence (the same 0.6 the platform prices its lot at)
const TOWNHOME_LOT_SHARE = 0.6;
const FS_CONF = { sfr: { high: 'medium', med: 'medium-low', low: 'low' }, townhomes: { high: 'medium-low', med: 'medium-low', low: 'low' } };
/** the SourceRef of a library line for a use: a townhome line, or one on the multifamily rates, is a placeholder until bid */
export const fsSource = (u, line, mf = false) => src('library', FS.source.label + (u === 'townhomes' ? '; townhome rates are placeholders until bid' : ''),
  { ref: FS.source.ref + ' ' + line.id + ' (cost code ' + line.code + ')', asOf: FS.source.asOf, confidence: mf ? 'low' : FS_CONF[u]?.[line.confidence] || 'low' });

/**
 * The library's inputs for a use on a plan, or null where it doesn't price it (no homes, or a community's tiny and
 * manufactured homes, which keep their delivered-home pricing). use: P.uses[u] (lib/proforma.mjs areaOf); place: the
 * intake's { city, county, jurisdiction }. What the plan doesn't say is the workbook's default (masonry on a quarter of
 * the walls, windstorm strapping, all-electric, slab on grade) and is listed in the budget's notes.
 */
export function fsLibInputs(u, use, place = {}) {
  if (!FSLIB_USES.includes(u) || !use || !(use.gsf > 0) || !(use.units > 0)) return null;
  const jurisdiction = jurisdictionOf(place), units = use.units, base = { units, jurisdiction, sitework_by_hart: 'N' };
  if (u === 'sfr') {
    const h = use.homes || {}; if (h.tiny || h.manufactured) return null;
    const by = { 1: (h[1] || 0) + (h.cottage || 0), 2: h[2] || 0, 3: h[3] || 0 }, stories = +Object.keys(by).sort((a, b) => by[b] - by[a] || +a - +b)[0] || 2; // (the storeys most homes have)
    const cottage = !!h.cottage && !h[1] && !h[2] && !h[3];
    return { ...base, product_type: cottage ? 'COTTAGE' : 'SF_DETACHED', buildings: units, living_sf_per_unit: use.gsf / units, stories: cottage ? 1 : stories, garage: cottage ? 'N' : 'Y', baths_per_unit: stories >= 2 && !cottage ? 2.5 : 2 };
  }
  const f = use.byFloors || {}, n = Object.values(f).reduce((s, v) => s + v, 0), stories = n ? Math.round(Object.entries(f).reduce((s, [k, v]) => s + +k * v, 0) / n) : 3; // (a plan's own floors; 3 where it doesn't say)
  return { ...base, product_type: 'TOWNHOME', buildings: Math.max(1, Math.round(units / 5)), living_sf_per_unit: (use.nrsf > 0 ? use.nrsf : use.gsf * 0.85) / units, total_sf_per_unit: use.gsf / units, stories, garage: 'Y', attached: 'Y', baths_per_unit: 2.5,
    flatwork_sf_per_unit: FS.INPUTS.flatwork_sf_per_unit * TOWNHOME_LOT_SHARE, sod_sy_per_unit: FS.INPUTS.sod_sy_per_unit * TOWNHOME_LOT_SHARE, fence_lf_per_unit: FS.INPUTS.fence_lf_per_unit * TOWNHOME_LOT_SHARE };
}
/** a use priced from the library: its lines, the ones left out and the ones still to bid */
export function fsLibPrice(u, use, place, { meters = false } = {}) {
  const inputs = fsLibInputs(u, use, place); if (!inputs) return null;
  return priceOf(inputs, { skip: [...FSLIB_SITE_BY_PLAN, ...(meters ? FSLIB_FEE_LINES : [])] });
}
// The library's apartment rates beside the workbook's, as a cross-check only: every one is a placeholder until bid and
// four lines have no rate at all. Three storeys, about 24 homes a building, no garages, baths from the unit mix, site
// work and flatwork by others (the workbook's own notes for apartments).
export function fsLibApartmentCheck(use, mix = []) {
  if (!use || !(use.units > 0) || !(use.gsf > 0)) return null;
  const n = mix.reduce((s, t) => s + t.n, 0), baths = n ? mix.reduce((s, t) => s + t.n * (/^\s*[23]/.test(t.name) ? 2 : 1), 0) / n : 1.5;
  const pr = priceOf({ product_type: 'APARTMENT', units: use.units, buildings: Math.max(1, Math.round(use.units / 24)), living_sf_per_unit: (use.nrsf > 0 ? use.nrsf : use.gsf * 0.85) / use.units, total_sf_per_unit: use.gsf / use.units, stories: 3, garage: 'N',
    baths_per_unit: Math.round(baths * 2) / 2, jurisdiction: 'OTHER', sitework_by_hart: 'N', lvt_share: 0.6, flatwork_sf_per_unit: 0, sod_sy_per_unit: 0, fence_lf_per_unit: 0 }, { skip: FSLIB_SITE_BY_PLAN });
  return { likely: pr.totals.likely, low: pr.totals.low, high: pr.totals.high, psf: pr.totals.likely / use.gsf, unpriced: pr.unpriced.map(x => x.desc) };
}

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
