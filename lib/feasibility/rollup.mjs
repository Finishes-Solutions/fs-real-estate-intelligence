// Ported from fs-budgeting-suite api/shared/budget-calc.js (origin/feature @ 4187c8c).
// Also carries sovRows/qtyOf from api/shared/sov.js, basisDiffers/stampCurrentPricing and the line construction of
// blankDoc() from app/index.html, and the input-driven-defaults transformation from tools/input-driven-defaults.js
// (all at the same commit).
//
// The budget roll-up: from a budget document (lines priced per basis, unit mix, other income, expenses, companies,
// contingency, project costs) to hard cost, contract sum and total project cost, plus income and the normalized
// schedule-of-values rows. Identical math to the source, which is itself a line-for-line port of the source app's
// browser CALC block.
//
// Functions take the document as an argument. Every numeric read is nz-coerced: older documents can carry absent
// properties, and absent must mean 0. All arithmetic is at full floating-point precision; nothing is rounded until
// it is displayed or stored.
//
// DOM-free and dependency-free: loaded by Node and by the browser.

export const nz = v => (Number.isFinite(+v) ? +v : 0);

// A percentage fee whose rates sum to 1 would divide by zero below. The divisor floors at FEE_FLOOR so the summary
// shows a large-but-finite number while the feeSum guard rail (max 95%) is already refusing the budget — a blocked
// budget must still render, not print $Infinity.
export const FEE_FLOOR = 0.05;

export function totUnits(doc) {
  return (doc.units || []).reduce((s, u) => s + nz(u.count), 0);
}

// Quantity of a line: a typed quantity unless auto, else by basis (sf = residential SF, asf = amenity SF,
// unit = total units, anything else = lump sum 1).
export function lineQty(doc, it) {
  if (!it.auto) return nz(it.qty);
  if (it.basis === 'sf') return nz(doc.resSF);
  if (it.basis === 'asf') return nz(doc.amenSF);
  if (it.basis === 'unit') return totUnits(doc);
  return 1;
}

// Amenity suppression is arithmetic, not display: an inactive amenity scope contributes zero even for lump-sum or
// manually-quantified lines.
export function scopeActive(doc, sc) {
  return sc !== 'amen' || (+doc.amenSF || 0) > 0;
}

export function activeScopes(doc) {
  return ['res', 'amen', 'soft'].filter(sc => scopeActive(doc, sc));
}

export function scopeSum(doc, sc) {
  if (!scopeActive(doc, sc)) return 0;
  return (doc.lines || []).filter(l => l.scope === sc)
    .reduce((s, it) => s + lineQty(doc, it) * nz(it.unit), 0);
}

// Developer fee, marketing and closing costs are each EITHER a dollar amount or a percentage — {mode:'amt'|'pct', val}
// — following the shape doc.contingency already uses. A bare number is an older document and reads as dollars.
export function feeMode(v) { return v && typeof v === 'object' && v.mode === 'pct' ? 'pct' : 'amt'; }
export function feeVal(v) { return v && typeof v === 'object' ? nz(v.val) : nz(v); }
export function feeRate(v) { return feeMode(v) === 'pct' ? feeVal(v) / 100 : 0; }
export function feeFixed(v) { return feeMode(v) === 'pct' ? 0 : feeVal(v); }

export function parts(doc) {
  const res = scopeSum(doc, 'res'), amen = scopeSum(doc, 'amen'), soft = scopeSum(doc, 'soft');
  const hard = res + amen;
  const profit = (doc.companies || []).reduce((s, c) => s + hard * nz(c.pct) / 100, 0);
  const c = doc.contingency || {};
  const cont = c.mode === 'pct' ? hard * nz(c.val) / 100
    : c.mode === 'psf' ? (nz(doc.resSF) + nz(doc.amenSF)) * nz(c.val) : nz(c.val);
  const contract = hard + profit + cont;
  const pc = doc.projectCosts || {};

  // "A percentage of the total project cost" is circular — the developer fee is itself part of that total. Resolved
  // in closed form rather than by iteration: with base = contract + soft + land and f the summed percentage rates,
  // project = (base + fixedFees) / (1 - f). So a 3% fee really is 3% of the number printed on the summary line.
  const base = contract + soft + nz(pc.land);
  const rate = feeRate(pc.dev) + feeRate(pc.mkt) + feeRate(pc.cls);
  const fixed = feeFixed(pc.dev) + feeFixed(pc.mkt) + feeFixed(pc.cls);
  const project = (base + fixed) / Math.max(1 - rate, FEE_FLOOR);

  const fee = {
    dev: feeFixed(pc.dev) + feeRate(pc.dev) * project,
    mkt: feeFixed(pc.mkt) + feeRate(pc.mkt) * project,
    cls: feeFixed(pc.cls) + feeRate(pc.cls) * project,
    // null when nothing is on a percentage, so the feeSum rail stays unjudged rather than reporting a meaningless 0%.
    pctRate: rate > 0 || feeMode(pc.dev) === 'pct' || feeMode(pc.mkt) === 'pct' || feeMode(pc.cls) === 'pct'
      ? rate : null
  };
  const fees = fee.dev + fee.mkt + fee.cls;
  return { res, amen, soft, hard, profit, cont, contract, fee, fees, project };
}

export function grossIncome(doc) {
  const tu = totUnits(doc);
  const rent = (doc.units || []).reduce((s, u) => s + nz(u.rent) * nz(u.count), 0);
  const other = (doc.other || []).reduce((s, o) => s + nz(o.rate) * (o.auto ? tu : nz(o.count)), 0);
  // Percent-of-income expenses (management fee, often taxes) are NOT circular: income does not depend on expenses,
  // so this is a straight computation off the rent + other-income total.
  const incomeMo = rent + other;
  const exp = (doc.expenses || []).reduce((s, e) => s + expenseMonthly(doc, e, incomeMo), 0);
  const netOther = other - exp;
  return { rentMo: rent, otherMo: other, expMo: exp, netOtherMo: netOther,
           grossYr: 12 * (rent + other), netYr: 12 * (rent + netOther) };
}

// The monthly amount one expense row contributes, and the ONE place the per-basis rule lives: grossIncome() sums it,
// and anything that itemises expenses must print from it so a pctIncome row prints the number it is charged at and
// the rows add up to the expense total.
export function expenseMonthly(doc, e, incomeMo) {
  const tu = totUnits(doc);
  if (e.per === 'pctIncome') {
    const g = Number.isFinite(+incomeMo) ? null : grossIncome(doc);
    const inc = g ? g.rentMo + g.otherMo : +incomeMo;
    return inc * nz(e.rate) / 100;
  }
  return nz(e.rate) * (e.per === 'fixed' ? (nz(e.count) || 1) : (e.auto ? tu : nz(e.count)));
}

// ---- schedule of values (api/shared/sov.js) ----

// Kept for callers of the old signature; a trailing units argument is ignored because totUnits() is the one count.
export function qtyOf(line, doc) { return lineQty(doc || {}, line); }

// Projection of a budget document into normalized SOV rows (what a lender package reads). lineOrder is document
// order; lineKey is the stable lineId where the document carries one, and duplicates or missing ids fall back to null.
//
// A line in a SUPPRESSED scope (amenity with amenSF <= 0) is still emitted — qty 0, total 0, its rate unchanged —
// rather than dropped, so its row keeps its identity across versions and a diff reads "amenity went to $0" instead
// of a line that vanished. Either way Σ total over res+amen = parts(doc).hard and over soft = parts(doc).soft.
export function sovRows(doc) {
  const seen = new Set();
  return (doc.lines || []).map((l, i) => {
    let key = typeof l.lineId === 'string' && l.lineId ? l.lineId.slice(0, 64) : null;
    if (key && seen.has(key)) key = null;
    if (key) seen.add(key);
    const scope = l.scope || 'res';
    const qty = scopeActive(doc, scope) ? lineQty(doc, l) : 0;
    const rate = nz(l.unit);
    return {
      lineOrder: i + 1,
      lineKey: key,
      scope,
      grp: l.grp || '',
      code: l.code || '',
      descr: l.desc || '',
      basis: l.basis || 'ls',
      qty,
      rate,
      total: qty * rate
    };
  });
}

// ---- building a budget from a template and a pricing library (app/index.html) ----

// The refresh key is scope|code|desc, which says nothing about basis. A library line re-based from per-SF to per-unit
// carries a rate in different units: copied onto a per-SF line it multiplies a per-unit dollar figure by every square
// foot. Such a line keeps its rate.
export function basisDiffers(it, m) { return !!(m.basis && it.basis && m.basis !== it.basis); }

// Brings a document's lines to a pricing library, but only the lines still AT their library rate: `unit !== baseUnit`
// means someone deliberately priced that line differently, and it keeps its rate. baseUnit always moves to the
// library rate, and pricingVersion is stamped. Mutates and returns `d`.
export function stampCurrentPricing(d, pricing) {
  const map = {};
  ((pricing && pricing.lines) || []).forEach(l => { map[l.scope + '|' + l.code + '|' + l.desc] = l; });
  (d.lines || []).forEach(it => {
    const m = map[it.scope + '|' + it.code + '|' + it.desc];
    if (!m) return;                                    // hand-added line: no library rate to take
    if (basisDiffers(it, m)) return;                   // a rate is only meaningful on its own basis
    if (nz(it.unit) === nz(it.baseUnit)) it.unit = m.unit;
    it.baseUnit = m.unit;
  });
  d.pricingVersion = pricing && pricing.version;
  return d;
}

// A new budget document from a template ({ doc } or a bare template doc) and a pricing library: every library line
// becomes a budget line at qty 1 / auto false for a lump sum, else qty 0 / auto true (the quantity follows its basis),
// with baseUnit = the library rate. Line ids are deterministic (`${idPrefix}${index}`) so two builds are comparable.
// The template's own lines, if it carries any, are used instead and stamped against the library.
export function docFromTemplate(template, pricing, { idPrefix = 'ln-', fields = {} } = {}) {
  const t = JSON.parse(JSON.stringify((template && template.doc) || template || {}));
  const lib = pricing || { lines: [] };
  const lines = Array.isArray(t.lines) && t.lines.length
    ? t.lines
    : (lib.lines || []).map((l, i) => ({ lineId: idPrefix + i, code: l.code, grp: l.grp, scope: l.scope, desc: l.desc,
        basis: l.basis, unit: l.unit, baseUnit: l.unit, qty: l.basis === 'ls' ? 1 : 0, auto: l.basis !== 'ls' }));
  const d = { projectId: '', name: '', address: '', ...t, lines, ...fields };
  return stampCurrentPricing(d, lib);
}

// ---- input-driven defaults (tools/input-driven-defaults.js) ----
//
// NOT APPLIED to the data in ./data/: at 4187c8c the source's publish of this transformation is written but marked
// "NOT YET RUN", so its current library is still 2026.08-v2 with every finish line per SF. The transformation is
// mirrored here, exported, so a caller can produce the 2026.10-v1 library and template it would publish.
//
// What it does to a pricing library and a template (inputs are never mutated):
//   * 13 11 00 Swimming Pool -> amenity scope, group "Amenity Site & Pool", lump sum (qty 1 / auto false in the
//     template), moved just after the last amenity line, so it drops out when amenity SF is 0;
//   * nine residential finish lines -> per unit, with " (per Unit)" appended to the description (a new
//     scope|code|desc key, so an existing per-SF line never meets a per-unit rate);
//   * a positive dollar developer fee -> the same dollars as a percentage of total project cost, to 4 places.
// Rates are back-solved from the template's own residential SF (S) and unit count (U) so its default totals do not
// move: per-unit = rate x S / U and pool = rate x S, each to the cent, half up. Back-solved starting points, not house
// numbers. Refusals carry the source's numeric error codes in `.code`.

const OLD_SCOPE = 'res';
const OLD_BASIS = 'sf';
export const INPUT_DEFAULT_TARGETS = [
  { ord: 1, kind: 'pool', code: '13 11 00', oldDesc: 'Swimming Pool w/ Pool Deck', newScope: 'amen', newGrp: 'Amenity Site & Pool', newDesc: 'Swimming Pool w/ Pool Deck', newBasis: 'ls' },
  { ord: 2, kind: 'unit', code: '11 31 00', oldDesc: 'Residential Appliances', newScope: 'res', newGrp: null, newDesc: 'Residential Appliances (per Unit)', newBasis: 'unit' },
  { ord: 3, kind: 'unit', code: '12 30 00', oldDesc: 'Casework / Stock Cabinets', newScope: 'res', newGrp: null, newDesc: 'Casework / Stock Cabinets (per Unit)', newBasis: 'unit' },
  { ord: 4, kind: 'unit', code: '12 36 00', oldDesc: 'Countertops', newScope: 'res', newGrp: null, newDesc: 'Countertops (per Unit)', newBasis: 'unit' },
  { ord: 5, kind: 'unit', code: '08 11 00', oldDesc: 'Interior Doors & Frames', newScope: 'res', newGrp: null, newDesc: 'Interior Doors & Frames (per Unit)', newBasis: 'unit' },
  { ord: 6, kind: 'unit', code: '08 71 00', oldDesc: 'Interior Door Hardware', newScope: 'res', newGrp: null, newDesc: 'Interior Door Hardware (per Unit)', newBasis: 'unit' },
  { ord: 7, kind: 'unit', code: '08 83 00', oldDesc: 'Mirrors', newScope: 'res', newGrp: null, newDesc: 'Mirrors (per Unit)', newBasis: 'unit' },
  { ord: 8, kind: 'unit', code: '10 28 00', oldDesc: 'Toilet, Bath & Laundry Accessories', newScope: 'res', newGrp: null, newDesc: 'Toilet, Bath & Laundry Accessories (per Unit)', newBasis: 'unit' },
  { ord: 9, kind: 'unit', code: '12 21 00', oldDesc: 'Window Blinds', newScope: 'res', newGrp: null, newDesc: 'Window Blinds (per Unit)', newBasis: 'unit' },
  { ord: 10, kind: 'unit', code: '10 55 00', oldDesc: 'Mailboxes', newScope: 'res', newGrp: null, newDesc: 'Mailboxes (per Unit)', newBasis: 'unit' }
];

// The line key the rate refresh matches on.
export const lineKeyOf = l => l.scope + '|' + l.code + '|' + l.desc;
const oldKey = t => OLD_SCOPE + '|' + t.code + '|' + t.oldDesc;
const newKey = t => t.newScope + '|' + t.code + '|' + t.newDesc;
const countKey = (lines, k) => lines.filter(l => lineKeyOf(l) === k).length;

// 'old' = every target exactly once under its old key and none under its new key; 'new' = the reverse; else 'mixed'.
export function classifyInputDefaults(doc) {
  const lines = (doc && doc.lines) || [];
  const T = INPUT_DEFAULT_TARGETS;
  const oldOnce = T.filter(t => countKey(lines, oldKey(t)) === 1).length;
  const oldAny = T.filter(t => countKey(lines, oldKey(t)) > 0).length;
  const newOnce = T.filter(t => countKey(lines, newKey(t)) === 1).length;
  const newAny = T.filter(t => countKey(lines, newKey(t)) > 0).length;
  if (oldOnce === T.length && newAny === 0) return 'old';
  if (newOnce === T.length && oldAny === 0) return 'new';
  return 'mixed';
}

// A plain decimal with at most `places` places, as a BigInt of value x 10^places; null if it is not one.
function scaled(v, places) {
  if (typeof v !== 'number' && !(typeof v === 'string' && v.trim() !== '')) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const s = Math.round(n * 10 ** places);
  if (s / 10 ** places !== n) return null;
  return BigInt(s);
}

// Whole-number division rounded half up, n and d non-negative BigInts.
/** @param {bigint} n @param {bigint} d @returns {bigint} */
export function halfUpCents(n, d) {
  const q = n / d, r = n % d;
  return 2n * r >= d ? q + 1n : q;
}

export class InputDefaultsRefusedError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// transformInputDefaults({ pricing, template, newPricingVersion, effective })
//   -> { alreadyDone: true }                                  (both already transformed)
//   -> { alreadyDone: false, pricing, template, devPct, tolerance, before, after }
// Throws InputDefaultsRefusedError where the publish would refuse.
export function transformInputDefaults({ pricing, template, newPricingVersion = '2026.10-v1', effective = '2026-10-15' }) {
  const Refused = InputDefaultsRefusedError;
  const pDoc = JSON.parse(JSON.stringify(pricing));
  const tDoc = JSON.parse(JSON.stringify(template));
  const pState = classifyInputDefaults(pDoc), tState = classifyInputDefaults(tDoc);
  if (pState === 'new' && tState === 'new') return { alreadyDone: true };
  if (!(pState === 'old' && tState === 'old')) {
    throw new Refused(50062, `Refusing to publish: pricing library is "${pState}" and template is "${tState}".`);
  }

  // Still plain residential per-SF (auto) lines with plain-decimal, non-negative rates.
  const bad = [];
  for (const [src, doc] of [['pricing', pDoc], ['template', tDoc]]) {
    for (const t of INPUT_DEFAULT_TARGETS) {
      const l = doc.lines.find(x => lineKeyOf(x) === oldKey(t));
      const u = scaled(l.unit, 4);
      let ok = l.basis === OLD_BASIS && u !== null && u >= 0n;
      if (src === 'template') {
        const b = scaled(l.baseUnit, 4);
        ok = ok && l.auto === true && b !== null && b >= 0n;
      }
      if (!ok) bad.push(src + ' ' + t.code + ' ' + t.oldDesc);
    }
  }
  if (bad.length) throw new Refused(50064, 'Refusing to publish: not plain residential per-SF auto lines: ' + bad.join('; '));

  // The calibration point.
  const S2 = scaled(tDoc.resSF, 2);
  if (S2 === null || S2 <= 0n) throw new Refused(50065, 'resSF is missing, zero, or has more than 2 places');
  const counts = (tDoc.units || []).map(u => scaled(u.count, 4));
  if (!counts.length || counts.some(c => c === null)) throw new Refused(50066, 'unit mix empty or non-numeric');
  const U4 = counts.reduce((s, c) => s + c, 0n);
  if (U4 <= 0n) throw new Refused(50066, 'unit mix totals zero');
  if (!(Number(tDoc.amenSF) > 0)) throw new Refused(50067, 'amenSF is 0 — the pool would leave the default total');

  // Per unit: cents = rate4 x S2 / U4; pool: rate4 x S2 / 10000.
  const rateOf = (t, v) => {
    const d = t.kind === 'unit' ? U4 : 10000n;
    return Number(halfUpCents(scaled(v, 4) * S2, d)) / 100;
  };

  // The pool goes just after the last amenity line.
  function rebuild(doc, isTemplate) {
    let amenLast = -1;
    doc.lines.forEach((l, i) => { if (l.scope === 'amen') amenLast = i; });
    const out = doc.lines.map((l, i) => {
      const t = INPUT_DEFAULT_TARGETS.find(x => lineKeyOf(l) === oldKey(x));
      if (!t) return { ord: i, v: l };
      let v;
      if (t.kind === 'pool') {
        v = { ...l, scope: t.newScope, grp: t.newGrp, basis: t.newBasis, unit: rateOf(t, l.unit) };
        if (isTemplate) Object.assign(v, { baseUnit: rateOf(t, l.baseUnit), qty: 1, auto: false });
        return { ord: amenLast >= 0 ? amenLast + 0.5 : i, v };
      }
      v = { ...l, desc: t.newDesc, basis: t.newBasis, unit: rateOf(t, l.unit) };
      if (isTemplate) v.baseUnit = rateOf(t, l.baseUnit);
      return { ord: i, v };
    });
    return out.sort((a, b) => a.ord - b.ord).map(x => x.v);
  }

  const newP = { ...pDoc, lines: rebuild(pDoc, false), version: newPricingVersion, effective };
  let newT = { ...tDoc, lines: rebuild(tDoc, true), pricingVersion: newPricingVersion };

  const p0 = parts(tDoc), p1 = parts(newT);

  // Only a positive DOLLAR developer fee (a bare number, or an object whose mode is not 'pct') is converted;
  // fee$ / project is exactly the share that reproduces the same project cost.
  const dev = (newT.projectCosts || {}).dev;
  const devIsAmt = typeof dev === 'number' || (dev && typeof dev === 'object' && dev.mode !== 'pct');
  let devPct = null;
  if (devIsAmt && p1.fee.dev > 0 && p1.project > 0) {
    devPct = Math.round(p1.fee.dev / p1.project * 100 * 1e4) / 1e4;
    newT = { ...newT, projectCosts: { ...newT.projectCosts, dev: { mode: 'pct', val: devPct } } };
  }
  const p2 = parts(newT);

  // The default totals may move only by cent rounding.
  const unitTargets = INPUT_DEFAULT_TARGETS.filter(t => t.kind === 'unit').length;
  const tol = 1 + 0.01 * (Number(U4) / 1e4) * unitTargets;
  if (Math.abs(p2.contract - p0.contract) > tol) throw new Refused(50071, 'default contract sum would move');
  if (Math.abs(p2.project - p0.project) > tol + 0.000001 * p0.project) throw new Refused(50072, 'default project cost would move');
  if ((p2.fee.pctRate || 0) > 0.95) throw new Refused(50073, 'fee percentages above 95%');

  return { alreadyDone: false, pricing: newP, template: newT, devPct, tolerance: tol,
           before: { contract: p0.contract, project: p0.project, devFee: p0.fee.dev },
           after: { contract: p2.contract, project: p2.project, devFee: p2.fee.dev } };
}
