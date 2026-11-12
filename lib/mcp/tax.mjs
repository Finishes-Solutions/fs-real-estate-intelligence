// The property tax and assessment tools (lib/mcp/server.mjs): tax_estimate, assessment_history and assessment_comps, over
// the appraisal-roll and tax-rate tables the "CAD rolls" job loads (build/cad-rolls.mjs; sources in
// docs/data-sources/cad-and-tax-rates.md). Read-only. Every answer names its sources with the tax year, the roll and the
// date the file was loaded.
import { UserError, resolve } from './resolve.mjs';
import { db } from './area.mjs';
import { doc, usd, n0, pct, clip, kv, list } from './text.mjs';
import { parcel as parcelAt } from '../../api/building.js';
import { supaStore, hooks } from '../cad/store.mjs';
import { estimate, history, stats, milesBetween, keysOf, COUNTYWIDE } from '../cad/tax.mjs';
import { circle } from '../../api/crime.js';
import { bbox as bboxOf } from '../fema.mjs';

export const TAX_COUNTIES = ['Harris', 'Fort Bend', 'Montgomery', 'Waller', 'Austin', 'Washington', 'Grimes'];
// what each county's roll comes from (said when an account isn't loaded)
const COVERAGE = {
  Harris: 'HCAD bulk files (accounts, buildings, units, exemptions; the current tax year)',
  'Fort Bend': 'Fort Bend CAD certified exports and supplements',
  Washington: 'Washington CAD certified appraisal export',
  Grimes: 'Grimes CAD certified roll (printed report: values and units, no buildings)',
  Waller: 'Waller CAD parcel layer (current year only, county / city / school units only; the full roll needs a public information request)',
  Austin: 'Austin CAD parcel layer (current year only, county / city / school units only; the full roll needs a public information request)',
  Montgomery: 'no roll: Montgomery CAD publishes no export (public information request pending); rates only'
};
const store = () => { if (hooks.store) return hooks.store; const d = db(); return d && d.via === 'key' ? supaStore(d) : null; };
const needStore = what => what + ' needs the app’s database, which isn’t configured on this deployment.';
const tc = s => String(s || '').replace(/\s+county$/i, '').trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const rate = r => r == null ? '—' : (+r).toFixed(6).replace(/0+$/, '').replace(/\.$/, '') + '%';
const day = v => v ? String(v).slice(0, 10) : null;

// an account number as each district writes it (HCAD: 13 digits; Fort Bend: R + digits; the others: plain digits)
export function accountVariants(county, apn) {
  const s = String(apn || '').trim().toUpperCase(), d = s.replace(/\D/g, '');
  if (county === 'Harris') return d ? [d.padStart(13, '0')] : [];
  if (county === 'Fort Bend') return [...new Set([s, /^\d+$/.test(s) ? 'R' + s : null, d && /^[A-Z]\d+$/.test(s) ? s : null].filter(Boolean))];
  return [...new Set([d ? String(+d) : null, s].filter(Boolean))];
}

// the county and account for the tool's location: apn + county directly, else the parcel at the address or point
async function locate(a) {
  if (a.apn) {
    if (!a.county) throw new UserError('An APN needs its county too (apn + county).');
    const county = tc(a.county); if (!TAX_COUNTIES.includes(county)) throw new UserError('Property tax data covers ' + TAX_COUNTIES.join(', ') + ' counties.');
    return { county, ids: accountVariants(county, a.apn), label: 'APN ' + a.apn + ' (' + county + ' County)', loc: null };
  }
  const loc = await resolve(a); if (loc.kind !== 'point' && loc.kind !== 'parcel') throw new UserError('Give one property: an address, apn + county, or lat + lon.');
  const county = loc.county?.name; if (!TAX_COUNTIES.includes(county)) throw new UserError('Property tax data covers ' + TAX_COUNTIES.join(', ') + ' counties; this point is in ' + (county ? county + ' County' : 'no Texas county') + '.');
  let p = null; try { p = await parcelAt(loc.center[1], loc.center[0]); } catch (e) { /* no parcel record: the county's rates only */ }
  return { county, ids: p?.propId ? accountVariants(county, p.propId) : [], label: loc.label, loc, parcel: p };
}
async function bundleFor(S, county, ids) { for (const id of ids) { const b = await S.bundle(county, id); if (b?.accounts?.length) return { ...b, account_id: id }; } return null; }
const sourcesOf = (b, extra = [], ids = null) => [...(b?.runs || []).filter(r => !ids || ids.includes(r.id)).sort((x, y) => (y.tax_year || 0) - (x.tax_year || 0)).map(r => '- ' + RUN_NAME(r) + (r.tax_year ? ', tax year ' + r.tax_year : '') + (r.roll && r.roll !== 'rates' ? ', ' + r.roll + ' roll' : '') + (r.finished_at ? ', loaded ' + day(r.finished_at) : '') + (r.url ? ' ' + r.url : '')), ...extra];
const RUN_NAME = r => ({ hcad: 'Harris Central Appraisal District bulk files', fbcad: 'Fort Bend CAD Orion export', 'washington-pacs': 'Washington CAD appraisal export', 'grimes-roll': 'Grimes CAD certified roll', 'bis-layer': 'Appraisal district parcel layer',
  'comptroller-rates': 'Texas Comptroller tax rates and levies', 'wcad-rates': 'Waller CAD tax rate table', 'mctotx-rates': 'Montgomery County Tax Office rate table', 'fbcad-rates': 'Fort Bend CAD tax rate workbook' })[r.source] || r.source;

// ---------- tax_estimate ----------
export async function taxEstimateTool(a = {}) {
  const S = store(); if (!S) return doc('Property tax estimate', [needStore('Property tax estimates')]);
  const L = await locate(a), value = a.value == null ? null : +a.value;
  if (value != null && !(value >= 0)) throw new UserError('value must be a dollar amount, e.g. 25000000.');
  const b = L.ids.length ? await bundleFor(S, L.county, L.ids) : null;
  const years = (b?.accounts || []).map(r => r.tax_year), year = +a.tax_year || Math.max(0, ...years) || new Date().getFullYear();
  const acct = b?.accounts?.find(r => r.tax_year === year) || null;
  // the units of that year, else of the nearest year loaded (a unit list changes rarely: annexations, new districts)
  const units = b?.units?.find(r => r.tax_year === year) || (b?.units || []).slice().sort((p, q) => Math.abs(p.tax_year - year) - Math.abs(q.tax_year - year))[0] || null;
  if (b && COUNTYWIDE[L.county]) { // a county-wide fund the parcel record doesn't list (lib/cad/tax.mjs COUNTYWIDE): its unit and rates too
    const want = COUNTYWIDE[L.county].filter(c => !b.taxing_units.some(u => u.unit_code === c)), tu = want.length ? (await S.countyUnits(L.county)).filter(u => want.includes(u.unit_code)) : [];
    if (tu.length) { b.taxing_units.push(...tu); b.rates.push(...await S.rates(tu.flatMap(u => keysOf(L.county, u)))); }
  }
  if (!b) { // no roll for this account: the county's own units and their rates, said plainly
    const tu = await S.countyUnits(L.county), countyUnit = tu.filter(u => u.unit_type === 'county'), city = L.parcel?.situsCity ? tu.filter(u => u.unit_type === 'city' && u.name.toLowerCase().replace(/^city of /, '') === L.parcel.situsCity.toLowerCase()) : [];
    const pick = [...countyUnit, ...city], rates = await S.rates(pick.flatMap(u => keysOf(L.county, u)));
    const e = estimate({ county: L.county, year, account: null, units: null, taxingUnits: tu, rates, value, fallbackCodes: pick.map(u => u.unit_code) });
    return doc('Property tax estimate: ' + L.label, [
      'No appraisal roll record loaded for ' + (L.ids[0] ? 'account ' + L.ids[0] : 'this parcel') + ' in ' + L.county + ' County. Roll source here: ' + COVERAGE[L.county] + '.',
      pick.length ? 'Rates of the units that can be told from the location alone (county' + (city.length ? ', city' : '') + '); the school district and special districts are not known without the roll:' : 'No taxing units loaded for ' + L.county + ' County yet.',
      ...e.lines.map(l => '- ' + l.name + ' (' + (l.type || 'unit') + '): ' + rate(l.rate) + (l.rateYear ? ' (' + l.rateYear + ', ' + l.rateSource + ')' : '') + (value != null && l.taxAtValue != null ? ' → ' + usd(l.taxAtValue) + ' at ' + usd(value) : '')),
      e.lines.length ? 'Partial combined rate: ' + rate(e.rate) + (value != null ? ' → ' + usd(e.taxAtValue) + ' a year at ' + usd(value) + ' (before any ISD and special-district tax)' : '') : null
    ], sourcesOf({ runs: [] }, ['- Texas Comptroller tax rates and levies https://comptroller.texas.gov/taxes/property-tax/rates/']), e.notes);
  }
  const e = estimate({ county: L.county, year, account: acct || b.accounts[0], units, taxingUnits: b.taxing_units, rates: b.rates, value });
  const A = acct || b.accounts[0];
  const lines = [
    ...kv([['Account', b.account_id + (A.geo_id ? ' (map / property number ' + A.geo_id + ')' : '')], ['County', L.county], ['Owner', A.owner], ['Situs', A.situs], ['Land use / state class', A.state_class], ['Acres', A.acreage]]),
    'Tax year ' + year + (acct ? ' (' + acct.roll + ' roll)' : ' (no ' + year + ' record; values shown are tax year ' + A.tax_year + ')') + '. Other years loaded: ' + ([...new Set(years)].filter(y => y !== year).sort().join(', ') || 'none') + '.',
    'Appraisal district value: market ' + usd(A.market_value) + (A.appraised_value != null && A.appraised_value !== A.market_value ? ', appraised ' + usd(A.appraised_value) : '') + ' (land ' + usd(A.land_value) + ', improvements ' + usd(A.improvement_value) + ')' + (A.exemptions?.length ? '; exemptions ' + A.exemptions.join(', ') : '') + '.',
    '', '## Taxing units and rates (per $100 of taxable value)',
    ...e.lines.map(l => '- ' + l.name + (l.codes.length > 1 ? ' (' + l.codes.join(' + ') + ')' : ' (' + l.code + ')') + ', ' + (l.type || 'unit') + ': ' + rate(l.rate) + (l.mo != null && l.is != null ? ' (M&O ' + rate(l.mo) + ', I&S ' + rate(l.is) + ')' : '') +
      (l.rateYear ? ' · ' + l.rateYear + ' ' + l.rateSource + (l.rateStatus && l.rateStatus !== 'adopted' ? ' ' + l.rateStatus : '') : '') + (l.taxableCad != null ? ' · taxable ' + usd(l.taxableCad) + ' → ' + usd(l.taxCad) : '') + (value != null && l.taxAtValue != null ? ' · at ' + usd(value) + ' → ' + usd(l.taxAtValue) : '') + (l.note ? ' · ' + l.note : '')),
    '', '## Estimate',
    'Combined rate: ' + rate(e.rate) + '.',
    'At the appraisal district value: ' + usd(e.taxCad) + ' a year.',
    value != null ? 'At ' + usd(value) + ' (no exemptions): ' + usd(e.taxAtValue) + ' a year.' : 'Give value to see the tax at a price or a valuation (e.g. a purchase price).'
  ];
  const used = [A.source_run_id, units?.source_run_id, ...e.runIds].filter(Boolean);
  return doc('Property tax estimate: ' + (A.situs || L.label), lines, sourcesOf(b, [], used), [...e.notes, 'An estimate from the appraisal roll and published rates, not a tax bill; the tax assessor-collector’s statement governs.']);
}

// ---------- assessment_history ----------
export async function assessmentHistoryTool(a = {}) {
  const S = store(); if (!S) return doc('Assessment history', [needStore('Assessment history')]);
  const L = await locate(a), b = L.ids.length ? await bundleFor(S, L.county, L.ids) : null;
  if (!b) return doc('Assessment history: ' + L.label, ['No appraisal roll record loaded for ' + (L.ids[0] ? 'account ' + L.ids[0] : 'this parcel') + ' in ' + L.county + ' County. Roll source here: ' + COVERAGE[L.county] + '.']);
  const H = history(b.accounts), A = b.accounts[0];
  return doc('Assessment history: ' + (A.situs || L.label), [
    ...kv([['Account', b.account_id], ['County', L.county], ['Owner (latest)', A.owner], ['Land use / state class', A.state_class]]),
    '', '| Tax year | Roll | Land | Improvements | Market | Change | Appraised | Change |', '|---|---|---|---|---|---|---|---|',
    ...H.slice().reverse().map(r => '| ' + [r.year, r.roll, usd(r.land), usd(r.improvement), usd(r.market), r.marketChange == null ? '—' : pct(r.marketChange), usd(r.appraised), r.appraisedChange == null ? '—' : pct(r.appraisedChange)].join(' | ') + ' |'),
    H.length < 2 ? '(Only one tax year is loaded for this account so far: history builds up as each year’s roll is loaded' + (['Waller', 'Austin'].includes(L.county) ? '; this county publishes only its current year' : '') + '.)' : null
  ], sourcesOf(b, [], b.accounts.map(r => r.source_run_id)), ['Texas appraisal districts value property as of January 1 of each tax year; a “current” roll is the district’s working value for the year ahead and can change before certification.']);
}

// ---------- assessment_comps ----------
const USE_CLASS = { multifamily: 'B', apartments: 'B', residential: 'A', 'single-family': 'A', commercial: 'F1', industrial: 'F2', land: 'C', vacant: 'C', ag: 'D', rural: 'D', 'mobile home': 'M' };
export async function assessmentCompsTool(a = {}) {
  const S = store(); if (!S) return doc('Assessment comparables', [needStore('Assessment comparables')]);
  let county = a.county ? tc(a.county) : null, subject = null, center = null, bbox = null, zip = a.zip ? String(a.zip).slice(0, 5) : null;
  const miR = a.radius_mi != null ? Math.min(10, Math.max(0.1, +a.radius_mi)) : null;
  if (a.apn || a.address || a.lat != null) {
    const L = await locate(a); county = L.county; center = L.loc?.center || null;
    const b = L.ids.length ? await bundleFor(S, L.county, L.ids) : null; subject = b?.accounts?.[0] || null;
    if (!center && subject?.lon != null) center = [subject.lon, subject.lat];
    if (center) bbox = bboxOf(circle(center[0], center[1], miR || 1)); else if (!zip && subject?.situs_zip) zip = subject.situs_zip;
  }
  if (!county || !TAX_COUNTIES.includes(county)) throw new UserError('Give county (one of ' + TAX_COUNTIES.join(', ') + ') or a property (address, apn + county, lat + lon).');
  const year = +a.tax_year || await S.latestYear(county); if (!year) return doc('Assessment comparables', ['No appraisal roll loaded for ' + county + ' County yet. Roll source here: ' + COVERAGE[county] + '.']);
  const use = a.land_use ? (USE_CLASS[String(a.land_use).toLowerCase()] || String(a.land_use).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)) : null;
  const f = { county, tax_year: year, state_class: use, zip, city: a.city || null, bbox, year_built: [a.year_built_min ?? null, a.year_built_max ?? null], units: [a.units_min ?? null, a.units_max ?? null], sqft: [a.sqft_min ?? null, a.sqft_max ?? null], limit: 2000 };
  const noClass = use && ['Waller', 'Austin'].includes(county) && (await S.comps({ ...f, state_class: null, limit: 50 })).every(r => !r.state_class);
  let rows = noClass ? await S.comps({ ...f, state_class: null }) : await S.comps(f);
  if (center && bbox) rows = rows.filter(r => r.lon != null && milesBetween(center, [r.lon, r.lat]) <= (miR || 1));
  if (subject) rows = rows.filter(r => r.account_id !== subject.account_id);
  const area = center && bbox ? (miR || 1) + ' mi around the property' : zip ? 'ZIP ' + zip : a.city ? a.city : county + ' County';
  const per = (r, k) => r[k] > 0 ? r.market_value / r[k] : null;
  const sUnit = stats(rows.map(r => per(r, 'units'))), sSf = stats(rows.map(r => per(r, 'bldg_sqft'))), sAc = stats(rows.map(r => per(r, 'acreage'))), sVal = stats(rows.map(r => r.market_value));
  const row = (lab, s, money = true) => s ? lab + ': median ' + (money ? usd(s.median) : n0(s.median)) + ' (middle half ' + (money ? usd(s.p25) : n0(s.p25)) + '–' + (money ? usd(s.p75) : n0(s.p75)) + ', ' + n0(s.n) + ' properties)' : null;
  const top = rows.slice().sort((p, q) => (center && p.lon != null && q.lon != null ? milesBetween(center, [p.lon, p.lat]) - milesBetween(center, [q.lon, q.lat]) : q.market_value - p.market_value));
  const L = [
    'Tax year ' + year + ', ' + county + ' County, ' + area + (use ? ', state class ' + use + '*' : '') + (a.year_built_min || a.year_built_max ? ', built ' + (a.year_built_min || '…') + '–' + (a.year_built_max || '…') : '') + (a.units_min || a.units_max ? ', ' + (a.units_min || '…') + '–' + (a.units_max || '…') + ' units' : '') + '.',
    subject ? 'Subject: ' + (subject.situs || subject.account_id) + ' · market ' + usd(subject.market_value) + (subject.units ? ' · ' + usd(subject.market_value / subject.units) + ' a unit' : '') + (subject.bldg_sqft ? ' · ' + usd(subject.market_value / subject.bldg_sqft) + ' a building sf' : '') : null,
    noClass ? 'The ' + county + ' parcel layer carries no state class, so land_use was not applied: all property types are listed. A full roll (public information request) would add it.' : null,
    rows.length ? n0(rows.length) + ' comparable properties' + (rows.length >= 2000 ? ' (the first 2,000 by value)' : '') + '.' : 'No properties match. Widen the filters (radius_mi, years, units) or drop one.',
    row('Market value a unit', sUnit), row('Market value a building sf', sSf), row('Market value an acre', sAc), row('Market value', sVal),
    !sUnit && (a.units_min || a.units_max || use === 'B') ? 'Unit counts aren’t in this county’s roll as loaded (HCAD’s commercial building records have them), so per-unit figures can’t be given.' : null,
    '', '## Closest / largest',
    ...list(top, 15, r => clip(r.situs || r.account_id, 60) + ' · ' + (r.state_class || '') + ' · ' + usd(r.market_value) + (r.units ? ' · ' + n0(r.units) + ' units (' + usd(r.market_value / r.units) + ' each)' : '') + (r.bldg_sqft ? ' · ' + n0(r.bldg_sqft) + ' sf (' + usd(r.market_value / r.bldg_sqft) + '/sf)' : '') + (r.year_built ? ' · built ' + r.year_built : '') + (center && r.lon != null ? ' · ' + milesBetween(center, [r.lon, r.lat]).toFixed(2) + ' mi' : '') + ' · acct ' + r.account_id)
  ];
  const meta = await S.meta().catch(() => ({}));
  const src = Object.entries(meta || {}).filter(([k, v]) => k.endsWith(':' + county) && v.roll !== 'rates').map(([k, v]) => '- ' + RUN_NAME({ source: k.split(':')[0] }) + ', tax year ' + v.tax_year + (v.roll ? ', ' + v.roll + ' roll' : '') + (v.at ? ', loaded ' + day(v.at) : '') + (v.url ? ' ' + v.url : ''));
  return doc('Assessment comparables: ' + area, L, src.length ? src : ['- ' + COVERAGE[county]], ['Appraisal district values, not sale prices (Texas doesn’t disclose sale prices). Use them for tax-comparable (equity) tables, not market value.',
    center && bbox && !rows.length ? 'A radius needs parcel coordinates, which are loaded for Waller and Austin (and Washington and Grimes from their parcel layers when a year newer than the roll is posted); elsewhere give zip or city.' : null]);
}
