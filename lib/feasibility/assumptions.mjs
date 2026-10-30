// @ts-check
// The assumptions register (docs/INTEGRATION_PLAN.md §5): every input the budget and pro forma use, with its value,
// unit, usual range and SourceRef. Defaults come from the platform's data where it has some (interest rates from FRED,
// the land from the appraisal district or the asking price), the cost library, or a labelled house assumption. A user's
// change replaces the value and becomes kind 'user'; scenarios are named sets of such changes.
//
// Keys are the pro forma's own (lib/proforma.mjs defaultsFor), dotted for nested ones ('rents.1 BR', 'hard.retail',
// 'sched.build'), plus the budget's (locationFactor, gcFeePct, devFeePct…).
import * as PF from '../proforma.mjs';
import { src, userSource } from './model.mjs';
import { zoriFor } from './market.mjs';
import { LIBRARY_USES, teamRates } from './costlib.mjs';

const HOUSE = src('house', 'Platform default: 2026 Houston / Katy / Waller suburban market assumption (UNVERIFIED)', { ref: 'lib/proforma.mjs', asOf: '2026', confidence: 'low' });
const house = (label, o = {}) => src('house', label, { confidence: 'low', ...o });

// the budget's own inputs (not in the pro forma's defaults)
const BUDGET = {
  locationFactor: { label: 'Location cost factor', group: 'cost', unit: 'x', range: [0.8, 1.3] },
  materialsShare: { label: 'Materials share of hard cost (escalated by the PPI)', group: 'cost', unit: 'share', range: [0.4, 0.65], value: 0.55, source: house('Typical materials share of building cost (labor and fees are the rest)') },
  escalationPct: { label: 'Forward cost escalation', group: 'cost', unit: 'pct', range: [0, 8], value: 3.5, source: house('Annual construction-cost escalation to the construction midpoint') },
  gcFeePct: { label: 'GC fee on library lines', group: 'cost', unit: 'pct', range: [6, 18], value: 12, source: src('library', 'Budget template: company profit 12% of hard cost', { asOf: '2026-08-10', confidence: 'medium-low' }) },
  devFeePct: { label: 'Developer fee (of total project cost)', group: 'cost', unit: 'pct', range: [1.5, 5], value: 3, source: house('Developer fee, a share of total project cost before financing (2–5%)') },
  landClosingPct: { label: 'Land closing costs', group: 'cost', unit: 'pct', range: [0.5, 3] },
  discountRate: { label: 'Discount rate (NPV)', group: 'returns', unit: 'pct', range: [6, 18], value: 10, source: house('Discount rate for net present value: a levered development hurdle') }
};
// the pro forma inputs the register shows (others keep their defaults silently: efficiencies, recoveries…), by group
const GROUP = k => /^(rents|homeRent|commRent|storageRent|salePsf|hotel)\b|^(otherPerUnit|vacancyPct|creditPct|absorption|commissionPct)$/.test(k) ? 'revenue'
  : /^(opexPerUnit|opexPerHome|opexPsf|taxPct|taxBasisPct|mgmtPct|reservesPerUnit|reservesPsf)/.test(k) ? 'operations'
  : /^(ltc|rate|loanFeePct|permRate|amort|ltv|dscr)$/.test(k) ? 'financing'
  : /^(marketCap|exitCap|dispPct|rentGrowth|expGrowth|hold)$/.test(k) ? 'returns'
  : /^sched\./.test(k) ? 'schedule'
  : /^(hard|storageHard|ti)\.|^(sitePrepPsf|pavingPsf|stallCost|deckPerSpace|pondPerAcFt|vaultPerAcFt|lotCost|softPct|contPct|landPrice)$/.test(k) ? 'cost' : null;
const UNITS = { ltc: 'pct', rate: 'pct', loanFeePct: 'pct', permRate: 'pct', amort: 'years', ltv: 'pct', dscr: 'x', marketCap: 'pct', exitCap: 'pct', dispPct: 'pct', rentGrowth: 'pct', expGrowth: 'pct', hold: 'years',
  otherPerUnit: 'mo', reservesPerUnit: 'usd', reservesPsf: 'psf', absorption: 'homes/mo', commissionPct: 'pct', landPrice: 'usd', 'sched.pre': 'months', 'sched.build': 'months', 'sched.lease': 'months' };
const NAMES = { loanFeePct: 'Loan fee', amort: 'Amortization', ltv: 'Loan to value', dscr: 'Debt coverage (DSCR)', dispPct: 'Sale costs', hold: 'Hold after stabilizing', otherPerUnit: 'Other income a unit',
  reservesPerUnit: 'Reserves a unit', reservesPsf: 'Reserves a sf', absorption: 'Home sales a month', commissionPct: 'Sales commission', landPrice: 'Land price',
  'sched.pre': 'Pre-development', 'sched.build': 'Construction', 'sched.lease': 'Lease-up' };
export const labelOf = k => BUDGET[k]?.label || NAMES[k] || PF.nameOf(k);
const unitOf = k => BUDGET[k]?.unit || UNITS[k] || PF.RANGES[k]?.[2] || (/Pct$/.test(k) ? 'pct' : 'usd');
const rangeOf = k => BUDGET[k]?.range || (PF.RANGES[k] ? PF.RANGES[k].slice(0, 2) : null);

const flat = D => { const out = {}; for (const [k, v] of Object.entries(D)) { if (v && typeof v === 'object' && !Array.isArray(v)) { for (const [k2, v2] of Object.entries(v)) if (typeof v2 === 'number') out[k + '.' + k2] = v2; } else if (typeof v === 'number') out[k] = v; } return out; };

// the land: the asking price when given, else the parcels' appraised land value, else (only when asked) their total
// appraised value, else the platform's $ an acre for the main use
function landDefault(intake = {}, parcels = [], acres = 0, D = null) {
  const sum = k => parcels.reduce((s, x) => s + (+x[k] || 0), 0), n = parcels.length;
  const basis = intake.landBasis || 'appraised-land';
  if (basis === 'asking' && Number.isFinite(+intake.landPrice) && intake.landPrice > 0) return { value: +intake.landPrice, source: src('user', 'Asking / contract price entered at intake', { confidence: 'medium' }) };
  if (basis === 'appraised-total' && sum('marketValue') > 0) return { value: sum('marketValue'), source: src('data', 'Appraisal district total market value of ' + n + ' parcel' + (n > 1 ? 's' : '') + ' (includes any buildings)', { confidence: 'medium-low' }) };
  if ((basis === 'appraised-land' || basis === 'appraised-total') && sum('landValue') > 0) return { value: sum('landValue'), source: src('data', 'Appraisal district land value of ' + n + ' parcel' + (n > 1 ? 's' : '') + ' (land only, not market price)', { confidence: 'medium-low' }) };
  const perAc = D?.landPerAc || 175000;
  return { value: Math.round(acres * perAc / 1000) * 1000, source: house('Platform land $' + perAc.toLocaleString('en-US') + ' an acre for the main use × ' + (+acres).toFixed(2) + ' acres') };
}

/**
 * The register for a plan's metrics. ctx: { intake, parcels, market (marketContext), inRegion (bool: the site is in the
 * platform's 7-county cost-basis region), zip }
 * @returns {import('./model.mjs').Assumption[]}
 */
export function registerFor(M, ctx = {}) {
  const P = PF.areaOf(M), land = landDefault(ctx.intake, ctx.parcels || [], P.acres, null);
  const D = PF.defaultsFor(M, land.value, {}), F = flat(D), out = [];
  const add = (key, value, source, extra = {}) => out.push({ key, label: labelOf(key), group: extra.group || BUDGET[key]?.group || GROUP(key) || 'other', value, unit: unitOf(key), source, range: rangeOf(key), ...extra });
  const libOnly = Object.keys(P.uses).filter(u => u !== 'amenity').every(u => LIBRARY_USES.includes(u)), libUses = Object.keys(P.uses).some(u => LIBRARY_USES.includes(u));
  // ---- cost ----
  add('landPrice', land.value, land.source);
  add('landClosingPct', D.landClosingPct, house('Title, survey, legal at closing (1–2%)'));
  add('locationFactor', 1, ctx.inRegion === false ? house('No location-factor data in the platform: 1.00 is a placeholder outside the Houston-area cost basis; enter a factor for this market', { confidence: 'low' })
    : house('1.00: the site is in the region the cost library and parametric rates were priced for (Waller / Houston area)', { confidence: 'medium-low' }));
  for (const k of ['materialsShare', 'escalationPct', 'gcFeePct', 'devFeePct']) add(k, BUDGET[k].value, BUDGET[k].source);
  if (D.contPct != null) add('contPct', D.contPct, house('Hard-cost contingency at concept stage (3–10%)'));
  if (!libOnly && D.softPct != null) add('softPct', D.softPct, house('Soft costs, % of non-library hard and site cost (10–15%; warehouses and storage 7–10%)'));
  for (const k of Object.keys(F).filter(k => /^(hard|storageHard|ti)\./.test(k))) { const u = k.split('.')[1]; if (k.startsWith('hard.') && (LIBRARY_USES.includes(u) || (u === 'amenity' && libUses) || teamRates(u, P.uses[u], { [u]: 1 }))) continue; add(k, F[k], HOUSE); } // (library-priced homes and their clubhouse are priced by the workbook's lines, and the uses the team's budgets cover by theirs)
  for (const k of ['sitePrepPsf', 'pavingPsf', 'stallCost', 'pondPerAcFt']) add(k, D[k], HOUSE);
  if (M.deck) add('deckPerSpace', D.deckPerSpace, HOUSE);
  if (M.vaultAcFt) add('vaultPerAcFt', D.vaultPerAcFt, HOUSE);
  if (['sfr', 'duplex', 'townhomes'].some(u => P.uses[u])) add('lotCost', D.lotCost, HOUSE);
  // ---- revenue and operations ----
  const zori = zoriFor(ctx.market, ctx.zip || ctx.intake?.zip);
  for (const k of Object.keys(F).filter(k => /^(rents|homeRent|commRent|storageRent|hotel)\./.test(k) && !/Opex$|ffeKey|otherPct|mgmtPct|ffePct/.test(k))) {
    if (k.startsWith('homeRent.') && !P.uses[k.split('.')[1]] && !(k.startsWith('homeRent.sfr') && P.uses.sfr)) continue;
    add(k, F[k], HOUSE, k.startsWith('rents.') && zori ? { marketCheck: 'ZIP ' + zori.zip + ' typical rent $' + zori.rent.toLocaleString('en-US') + '/mo (' + zori.month + ', all homes; ' + (zori.yoy >= 0 ? '+' : '') + zori.yoy + '% a year): ' + zori.source } : {});
  }
  for (const k of ['otherPerUnit', 'vacancyPct', 'creditPct']) if (D[k] != null && (k !== 'otherPerUnit' || P.uses.multifamily)) add(k, D[k], HOUSE);
  if (D.forSale || ['sfr', 'duplex', 'townhomes'].some(u => P.uses[u])) { for (const k of Object.keys(F).filter(k => k.startsWith('salePsf.') && P.uses[k.split('.')[1]])) add(k, F[k], HOUSE); }
  if (P.uses.multifamily) add('opexPerUnit', D.opexPerUnit, HOUSE);
  if (['sfr', 'duplex', 'townhomes'].some(u => P.uses[u])) add('opexPerHome', D.opexPerHome, HOUSE);
  for (const k of Object.keys(F).filter(k => k.startsWith('opexPsf.'))) add(k, F[k], HOUSE);
  for (const k of ['taxPct', 'taxBasisPct', 'mgmtPct']) add(k, D[k], HOUSE);
  // ---- financing: rates from the platform's FRED data plus a house spread ----
  const R = ctx.market?.rates || {}, pct = v => v.toFixed(2) + '%';
  if (R.sofr) add('rate', +(R.sofr.value + 3).toFixed(2), src('derived', 'SOFR ' + pct(R.sofr.value) + ' (FRED, ' + R.sofr.date + ') + 3.00% construction-loan spread (house)', { asOf: R.sofr.date, confidence: 'medium' }));
  else add('rate', D.rate, HOUSE);
  if (R.t10) add('permRate', +(R.t10.value + 1.75).toFixed(2), src('derived', '10-yr Treasury ' + pct(R.t10.value) + ' (FRED, ' + R.t10.date + ') + 1.75% permanent-loan spread (house)', { asOf: R.t10.date, confidence: 'medium' }));
  else add('permRate', D.permRate, HOUSE);
  for (const k of ['ltc', 'loanFeePct', 'amort', 'ltv', 'dscr']) add(k, D[k], HOUSE);
  // ---- exit and returns ----
  add('marketCap', D.marketCap, house('Going-in cap rate by use, Houston suburban 2026 (UNVERIFIED: the platform has no sale comps)'));
  add('exitCap', D.exitCap, house('Exit cap = market cap + 0.25%'));
  for (const k of ['dispPct', 'rentGrowth', 'expGrowth', 'hold']) add(k, D[k], HOUSE);
  add('discountRate', BUDGET.discountRate.value, BUDGET.discountRate.source);
  // ---- schedule ----
  for (const k of ['pre', 'build', 'lease']) add('sched.' + k, D.sched[k], house('Schedule from the program’s size and type (lib/proforma.mjs scheduleFor)'));
  return out;
}

// the register with a study's and a scenario's changes applied: each changed value labelled as the user's
export function applyOverrides(reg, ...overrideSets) {
  const o = Object.assign({}, ...overrideSets.filter(Boolean));
  return reg.map(a => Object.prototype.hasOwnProperty.call(o, a.key) && o[a.key] !== a.value && o[a.key] != null && o[a.key] !== '' ? { ...a, value: +o[a.key], default: a.value, edited: true, source: userSource(a.source) } : a);
}
// { key: value }
export const valuesOf = reg => Object.fromEntries(reg.map(a => [a.key, a.value]));
export const knownKeys = reg => new Set(reg.map(a => a.key));

// the values as the pro forma's overrides: nested keys rebuilt, budget-only keys left out
export function pfOverrides(v) {
  const out = {};
  for (const [k, val] of Object.entries(v)) {
    if (BUDGET[k] && k !== 'landClosingPct') continue;
    const [a, b] = k.split('.'); if (b == null) out[a] = val; else (out[a] ||= {})[b] = val;
  }
  return out;
}
// what the budget needs from the values
export function budgetInputs(v) {
  const land = v.landPrice * (1 + (v.landClosingPct || 0) / 100);
  return { landTotal: land, locationFactor: v.locationFactor ?? 1, materialsShare: v.materialsShare, escalationPct: v.escalationPct, gcFeePct: v.gcFeePct, contPct: v.contPct ?? 5, softPct: v.softPct ?? 12, devFeePct: v.devFeePct,
    monthsToMid: (v['sched.pre'] || 0) + (v['sched.build'] || 0) / 2 };
}

// out-of-range notes for the register
export function rangeNotes(reg) {
  return reg.filter(a => a.range && Number.isFinite(+a.value) && (a.value < a.range[0] || a.value > a.range[1])).map(a => ({ key: a.key, level: 'note', text: a.label + ' ' + a.value + ' is outside the usual ' + a.range[0] + '–' + a.range[1] + '.' }));
}
