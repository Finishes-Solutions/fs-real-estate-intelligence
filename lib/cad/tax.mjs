// Property tax arithmetic for one account (lib/mcp/tax.mjs tax_estimate): which rate applies to each taxing unit for a tax
// year, and the tax at the appraisal district's value and at a value the caller supplies. Pure functions of the rows the
// store returns (lib/cad/store.mjs), so the tests run them on fixtures.
//
// Rates are per $100 of taxable value. For each unit the rate is the district's own table for the year when loaded
// (hcad, wcad, fbcad, mctotx), else the Comptroller's for that year, else the newest earlier year (said so in the note).

export const DISTRICT_SOURCES = ['hcad', 'wcad', 'fbcad', 'mctotx', 'gcad', 'washcad', 'acad'];

// Units a district taxes county-wide that its parcel layer doesn't list on each parcel. Waller County levies its general
// fund (GWA) and a farm-to-market / flood control fund (RFM) as two codes; the layer lists GWA only.
export const COUNTYWIDE = { Waller: ['RFM'] };

// the rate rows that could apply to one unit: by the district's own code and by the Comptroller ID it maps to
export const keysOf = (county, tu) => [county + ':' + tu.unit_code, ...(tu.comptroller_id ? [tu.comptroller_id] : [])];

// the best rate row for a unit and year: [row, note]
export function pickRate(rates, keys, year) {
  const mine = rates.filter(r => keys.includes(r.unit_key) && r.total_rate != null && r.status !== 'not reported');
  const rank = r => (r.tax_year === year ? 0 : 100) + (DISTRICT_SOURCES.includes(r.source) ? 0 : 10) + (r.status === 'proposed' ? 5 : 0);
  const same = mine.filter(r => r.tax_year === year).sort((a, b) => rank(a) - rank(b));
  if (same.length) return [same[0], null];
  const earlier = mine.filter(r => r.tax_year < year).sort((a, b) => b.tax_year - a.tax_year || rank(a) - rank(b));
  if (earlier.length) return [earlier[0], earlier[0].tax_year + ' rate (no ' + year + ' rate loaded yet)'];
  const later = mine.filter(r => r.tax_year > year).sort((a, b) => a.tax_year - b.tax_year || rank(a) - rank(b));
  if (later.length) return [later[0], later[0].tax_year + ' rate (no ' + year + ' rate loaded)'];
  return [null, 'no rate loaded'];
}

/**
 * The estimate for one account and year.
 * @param {object} o { county, year, account (cad_accounts row, may be null), units (account_taxing_units row, may be null),
 *   taxingUnits (taxing_units rows of the county), rates (tax_rates rows), value (a value to test, optional),
 *   fallbackCodes (unit codes to use when there is no units row, e.g. found by name) }
 */
export function estimate({ county, year, account, units, taxingUnits, rates, value = null, fallbackCodes = [] }) {
  const notes = [], byCode = new Map(taxingUnits.map(u => [u.unit_code, u]));
  let codes = units?.unit_codes?.length ? [...units.unit_codes] : [...fallbackCodes];
  // a county-wide fund the parcel record doesn't list: added only where the district's own table prices it for the year
  // (the Comptroller's county rate already includes it, so with that rate it would count twice)
  for (const c of COUNTYWIDE[county] || []) {
    if (!byCode.has(c) || codes.includes(c)) continue;
    const [r] = pickRate(rates, [county + ':' + c], year), [base] = pickRate(rates, codes.flatMap(k => byCode.has(k) && byCode.get(k).unit_type === 'county' ? keysOf(county, byCode.get(k)) : []), year);
    if (r && DISTRICT_SOURCES.includes(r.source) && base && base.source === r.source && base.tax_year === r.tax_year) codes.push(c);
  }
  codes = codes.filter(c => c !== 'CAD' && c !== 'ZZZ'); // (PACS lists the appraisal district itself and a placeholder)
  if (units?.partial) notes.push('The parcel record lists only its county, city and school district; emergency service, water (MUD / WCID), drainage and other special districts may also tax it and are not included.');
  const cadValue = account ? (account.appraised_value ?? account.market_value) : null;
  const lines = [], seen = new Map();
  for (const code of codes) {
    const tu = byCode.get(code) || { unit_code: code, name: code, unit_type: null, comptroller_id: null };
    const [r, note] = pickRate(rates, keysOf(county, tu), year);
    // two district codes that map to one Comptroller unit (Waller's GWA and RFM are both "Waller County" there): the
    // Comptroller's county rate already holds both funds, so it is counted once
    const shareKey = r && r.source === 'comptroller' ? r.unit_key : null;
    if (shareKey && seen.has(shareKey)) { seen.get(shareKey).codes.push(code); continue; }
    const taxable = units?.taxable && units.taxable[code] != null ? +units.taxable[code] : cadValue;
    const line = { code, codes: [code], name: tu.name, type: tu.unit_type || r?.unit_type || null, rate: r ? r.total_rate : null, mo: r?.mo_rate ?? null, is: r?.is_rate ?? null,
      rateYear: r?.tax_year ?? null, rateSource: r?.source ?? null, rateStatus: r?.status ?? null, runId: r?.source_run_id ?? null, note,
      taxableCad: taxable, taxCad: r && taxable != null ? taxable * r.total_rate / 100 : null, taxAtValue: r && value != null ? value * r.total_rate / 100 : null };
    lines.push(line); if (shareKey) seen.set(shareKey, line);
  }
  const priced = lines.filter(l => l.rate != null), rate = priced.reduce((s, l) => s + l.rate, 0);
  const missing = lines.filter(l => l.rate == null).map(l => l.name);
  if (missing.length) notes.push('No rate loaded for ' + missing.join(', ') + ': left out of the total.');
  const years = [...new Set(priced.map(l => l.rateYear))].sort();
  if (years.length > 1 || (years.length && years[0] !== year)) notes.push('Rates are from ' + years.join(' and ') + ' for tax year ' + year + '.');
  if (units?.taxable && Object.keys(units.taxable).length) notes.push('Tax at the district value uses each unit’s taxable value from the roll (after that unit’s exemptions).');
  else if (account?.exemptions?.length) notes.push('Exemptions on the account (' + account.exemptions.join(', ') + ') are not taken off: the roll loaded here doesn’t give each unit’s taxable value.');
  notes.push('Homestead tax ceilings (over 65, disabled) and abatements aren’t applied.');
  return { lines, runIds: [...new Set(lines.map(l => l.runId).filter(Boolean))], rate: round6(rate), taxCad: sum(priced.map(l => l.taxCad)), taxAtValue: value != null ? sum(priced.map(l => l.taxAtValue)) : null, cadValue, notes };
}
const round6 = v => Math.round(v * 1e6) / 1e6;
const sum = a => a.filter(x => x != null).reduce((s, x) => s + x, 0);

// values by year with the change from the year before
export function history(accounts) {
  const rows = [...accounts].sort((a, b) => a.tax_year - b.tax_year);
  return rows.map((r, i) => { const p = rows[i - 1], ch = (k) => p && p[k] && r[k] != null ? (r[k] / p[k] - 1) * 100 : null;
    return { year: r.tax_year, roll: r.roll, land: r.land_value, improvement: r.improvement_value, market: r.market_value, appraised: r.appraised_value, marketChange: ch('market_value'), appraisedChange: ch('appraised_value') }; });
}

// quartiles of a list of numbers
export function stats(xs) {
  const a = xs.filter(x => Number.isFinite(x)).sort((p, q) => p - q); if (!a.length) return null;
  const q = f => { const i = (a.length - 1) * f, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
  return { n: a.length, p25: q(0.25), median: q(0.5), p75: q(0.75), min: a[0], max: a[a.length - 1] };
}
export const milesBetween = ([x1, y1], [x2, y2]) => { const R = 3958.8, r = Math.PI / 180, dy = (y2 - y1) * r, dx = (x2 - x1) * r, a = Math.sin(dy / 2) ** 2 + Math.cos(y1 * r) * Math.cos(y2 * r) * Math.sin(dx / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); };
