// @ts-check
// The Finishes budget library's calculator (the workbook's BUDGET_ENGINE tab as code): project inputs → drivers
// (project-total quantities) → condition flags → the template's lines, each with a quantity and a LOW / LIKELY / HIGH
// rate → totals → the top-down benchmark band. The data is lib/feasibility/data/fs-budget-library-v1.mjs.
//
//   qty  = the line's quantity factor × its driver
//   rate = low / likely / high, replaced by the multifamily rates for townhomes and apartments where the line has them
//   a line with no rate is "bid required": listed in `unpriced`, left out of the totals, never a silent zero
//
// Pure functions of the inputs: no rounding of amounts here (the budget rounds its own lines). DOM-free.
import { INPUTS, K, LINES, BENCHMARKS, PRODUCTS, JURISDICTIONS } from './data/fs-budget-library-v1.mjs';

const yes = v => v === true || v === 'Y';
const DETACHED_LOTS = ['SF_DETACHED', 'COTTAGE', 'TOWNHOME'];

/** the workbook's defaults with a project's values over them; unknown product types and jurisdictions fall back */
export function inputsOf(over = {}) {
  const i = { ...INPUTS, ...Object.fromEntries(Object.entries(over).filter(([, v]) => v != null)) };
  if (!PRODUCTS.includes(i.product_type)) i.product_type = 'SF_DETACHED';
  if (!JURISDICTIONS.includes(i.jurisdiction)) i.jurisdiction = 'OTHER';
  i.units = Math.max(1, Math.round(+i.units || 1)); i.buildings = Math.max(1, Math.round(+i.buildings || 1)); i.stories = Math.min(4, Math.max(1, Math.round(+i.stories || 1)));
  return i;
}

/** the project-total quantities (DRIVERS tab). total_sf_per_unit, when given, replaces the living-sf ratio. */
export function driversOf(i) {
  const p = i.product_type, u = i.units, st = i.stories, L = u * i.living_sf_per_unit, lots = DETACHED_LOTS.includes(p);
  const ratio = p === 'APARTMENT' ? K.totalPerLiving.apartment : !yes(i.garage) && st === 1 ? K.totalPerLiving.noGarage : st === 1 ? K.totalPerLiving.oneStory : K.totalPerLiving.multiStory;
  const total = i.total_sf_per_unit > 0 ? u * i.total_sf_per_unit : L * ratio, slab = total - L * (1 - 1 / st);
  const wall = total * K.wallSfPerTotalSf * (yes(i.attached) ? K.attachedWallShare : 1), lvt = Math.min(1, Math.max(0, +i.lvt_share || 0));
  return {
    UNITS: u, BLDGS: i.buildings, PROJECT: 1, LOTS: lots ? u : i.buildings, LIVING_SF: L, TOTAL_SF: total, SLAB_SF: slab, GSF: total,
    ROOF_SQ: slab * K.roofSqPerSlabSf * (st >= 2 ? K.roofMultiStory : 1), WINDOWS: L / K.livingSfPerWindow, WINDOW_SF: L * K.windowSfPerLivingSf,
    EXT_DOORS: u * (lots ? 2 : 1) + u * (yes(i.garage) ? 1 : 0), INT_DOORS: L / K.livingSfPerIntDoor,
    BOARD_SF: L * K.boardSfPerLivingSf, BOARD_FT: L * (st === 1 ? K.boardFtPerLivingSf.oneStory : K.boardFtPerLivingSf.multiStory), BASE_LF: L * K.baseLfPerLivingSf, TOPS_SF: L * K.topsSfPerLivingSf,
    LVT_SF: L * K.floorShare * lvt, CARPET_SF: L * K.floorShare * (1 - lvt),
    HVAC_TONS: u * Math.max(0.5, Math.round(i.living_sf_per_unit * K.tonsPer1000Sf / 1000 * 2) / 2), // (rounded to half a ton a home)
    BATHS: u * i.baths_per_unit, EXTRA_BATHS: u * Math.max(i.baths_per_unit - 2, 0), FIXTURES: u * i.baths_per_unit * K.fixturesPerBath,
    FLATWORK_SF: u * (+i.flatwork_sf_per_unit || 0), APPROACH_SF: i.jurisdiction === 'COH' ? u * (+i.approach_sf_per_unit || 0) : 0, SOD_SY: u * (+i.sod_sy_per_unit || 0), FENCE_LF: u * (+i.fence_lf_per_unit || 0),
    WALL_SF: wall, MASONRY_SF: wall * i.masonry_pct, SIDING_SF: wall * (1 - i.masonry_pct), ELEVATED_SF: L * (1 - 1 / st), EXT_STAIR_FLIGHTS: i.buildings * 2 * (st - 1)
  };
}

/** the condition flags (DRIVERS tab, lower block): a template line is in the budget when its flag is true */
export function conditionsOf(i) {
  const p = i.product_type, st = i.stories, S = p === 'STORAGE', mf = p === 'APARTMENT' || p === 'TOWNHOME';
  return {
    ALWAYS: true, RESI: !S, SF_ONLY: p === 'SF_DETACHED' || p === 'COTTAGE', MF_ONLY: mf, APARTMENT: p === 'APARTMENT', TOWNHOME: p === 'TOWNHOME', STORAGE: S,
    STORIES1: st === 1 && !S, STORIES2: st === 2, STORIES3P: st >= 3, MULTISTORY: st >= 2 && !S, MF_MULTISTORY: st >= 2 && mf, UNIT_STAIRS: st >= 2 && p !== 'APARTMENT' && !S,
    GARAGE: yes(i.garage) && !S, COH: i.jurisdiction === 'COH', DAYTON: i.jurisdiction === 'DAYTON', ELEVATED: yes(i.elevated), NOT_ELEVATED: !yes(i.elevated) && !S,
    SITEWORK: yes(i.sitework_by_hart), MASONRY: i.masonry_pct > 0 && !S, SIDING: i.masonry_pct < 1 && !S, GAS: yes(i.gas), TAKEOVER: yes(i.takeover), ATTACHED: yes(i.attached),
    WINDSTORM: yes(i.windstorm) && !S, OPTION: false // (an option line is out unless an approver switches it on)
  };
}

/**
 * The budget for a set of inputs. skip: line ids left out (work another part of the budget already prices).
 * @returns {{ inputs: object, drivers: Object<string, number>, lines: { id: string, line: import('./data/fs-budget-library-v1.mjs').LibLine, qty: number, low: number, likely: number, high: number, mf: boolean }[],
 *   unpriced: { id: string, desc: string, qty: number, per: string }[], skipped: string[], totals: { low: number, likely: number, high: number }, livingSf: number, units: number }}
 */
export function priceOf(over = {}, { skip = [] } = {}) {
  const i = inputsOf(over), D = driversOf(i), C = conditionsOf(i), mf = C.MF_ONLY, out = [], unpriced = [], skipped = [];
  for (const l of LINES) {
    if (!C[l.cond]) continue;
    if (skip.includes(l.id)) { skipped.push(l.id); continue; }
    const qty = l.factor * (D[l.driver] || 0), useMf = mf && !!l.mf, r = useMf ? l.mf : [l.low, l.likely, l.high];
    if (r[1] == null) { unpriced.push({ id: l.id, desc: l.desc, qty, per: l.per }); continue; }
    out.push({ id: l.id, line: l, qty, low: r[0] ?? r[1], likely: r[1], high: r[2] ?? r[1], mf: useMf });
  }
  const sum = k => out.reduce((s, x) => s + x.qty * x[k], 0);
  return { inputs: i, drivers: D, lines: out, unpriced, skipped, totals: { low: sum('low'), likely: sum('likely'), high: sum('high') }, livingSf: D.LIVING_SF, units: i.units };
}

// the workbook's benchmark band for a product: the lowest low and the highest high of its checks, $ per living sf
export function benchOf(product) {
  const b = BENCHMARKS[product]; if (!b?.length) return null;
  return { low: Math.min(...b.map(x => x.low)), high: Math.max(...b.map(x => x.high)), n: b.length, rows: b };
}

// the workbook's jurisdiction for a place: its named cities, else OTHER (which carries no city adders)
export function jurisdictionOf({ city = '', jurisdiction = '', county = '' } = {}) {
  const s = (jurisdiction + ' ' + city).toLowerCase();
  if (/\bhouston\b/.test(s)) return 'COH';
  for (const j of ['dayton', 'conroe', 'liberty', 'waller', 'anahuac', 'alvin']) if (new RegExp('\\b' + j + '\\b').test(s)) return j.toUpperCase();
  return /\bwaller\b/i.test(county) && !s.trim() ? 'WALLER' : 'OTHER';
}
