// FBI Crime Data Explorer (CDE): crime by police department anywhere in the US, for api/crimeus.
//   CDE_WEB/agency/byStateAbbr/{ST}                   the state's agencies: { COUNTY: [{ ori, agency_name, agency_type_name, counties, is_nibrs, nibrs_start_date, … }] }
//   CDE_WEB/summarized/agency/{ori}/{offense}?from=MM-YYYY&to=MM-YYYY
//       offenses.actuals["<Agency> Offenses"]["MM-YYYY"]   the department's count that month (null = not reported)
//       offenses.rates["<State> Offenses" | "United States Offenses"]["MM-YYYY"]   per 100,000 people that month
//       offenses.actuals / rates "… Clearances"           offenses cleared (solved) that month
//       populations.population["<Agency>"]["MM-YYYY"]     the population the department covers
//       cde_properties.max_data_date.UCR "MM/YYYY", last_refresh_date.UCR "MM/DD/YYYY"
// The web app's own endpoints answer without a key (checked by build/probe-fbi.mjs); with GOV_API_KEY (api.data.gov, lib/govkey.mjs) the
// same paths are used on api.usa.gov/crime/fbi/cde instead.
// Matching a point to a department: the Census geocoder gives the incorporated place (city, town, village) and county;
// the place's own police department wins, otherwise the county's (county police over the sheriff where both report).
export const CDE_WEB = 'https://cde.ucr.cjis.gov/LATEST';
export const CDE_API = 'https://api.usa.gov/crime/fbi/cde';

export const OFFENSES = [
  { key: 'homicide', name: 'Murder', cat: 'v' }, { key: 'rape', name: 'Rape', cat: 'v' }, { key: 'robbery', name: 'Robbery', cat: 'v' },
  { key: 'aggravated-assault', name: 'Aggravated assault', cat: 'v' }, { key: 'burglary', name: 'Burglary', cat: 'p' }, { key: 'larceny', name: 'Theft', cat: 'p' },
  { key: 'motor-vehicle-theft', name: 'Vehicle theft', cat: 'p' }, { key: 'arson', name: 'Arson', cat: 'o' }
];
export const TOTALS = [{ key: 'violent-crime', cat: 'v' }, { key: 'property-crime', cat: 'p' }];

export const STATE_FIPS = { '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY', '72': 'PR' };
export const STATE_NAMES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico' };

// ---------- names ----------
const norm = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/\([^)]*\)/g, ' ').replace(/[’'`.]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const KIND = /\s(city|town|village|township|borough|municipality|charter township|city and borough)$/;
// "Houston Police Department" -> houston; "Blasdell Village Police Department" -> blasdell village, blasdell; "Metropolitan Nashville Police Department" -> nashville
export function agencyKeys(name) {
  let s = norm(name).replace(/^(the|city of|town of|village of|borough of|township of)\s/, '');
  s = s.replace(/\s(police department|police dept|police|department of public safety|public safety department|public safety|marshals office|marshal office|sheriffs office|sheriffs department|sheriff office|sheriff)$/, '').trim();
  const out = new Set([s]); out.add(s.replace(/^metropolitan\s/, '')); out.add(s.replace(KIND, '')); out.add(s.replace(/\s(metro|metropolitan)$/, '')); // Louisville Metro
  return [...out].filter(Boolean);
}
// Census place / county subdivision names -> the same kind of keys. "Nashville-Davidson metropolitan government (balance)" -> nashville davidson, nashville
export function placeKeys(name) {
  const s = norm(name).replace(/\s(metropolitan government|unified government|consolidated government|consolidated city|urban county)$/, '').trim();
  const out = new Set([s, s.replace(KIND, '')]);
  if (s !== norm(name) && s.includes(' ')) out.add(s.split(' ')[0]); // only for the consolidated governments: "nashville"
  return [...out].filter(Boolean);
}
const countyBase = s => norm(s).replace(/\s(county|parish|borough|census area|city and borough|municipality)$/, '').trim();

// the state directory ({ COUNTY: [agency…] }) -> a flat list without repeats
export function flattenDirectory(d) {
  const seen = new Map();
  for (const list of Object.values(d || {})) for (const a of list || []) if (a?.ori && !seen.has(a.ori)) seen.set(a.ori, {
    ori: a.ori, name: String(a.agency_name || '').replace(/\s+/g, ' ').trim(), type: a.agency_type_name || 'Other', state: a.state_abbr || null,
    counties: String(a.counties || '').split(',').map(c => c.trim().toUpperCase()).filter(c => c && c !== 'NOT SPECIFIED'), nibrs_since: a.nibrs_start_date || null
  });
  return [...seen.values()];
}
const inCounty = (a, county) => !county || !a.counties.length || a.counties.some(c => countyBase(c) === countyBase(county));

// the department for a place: { agency, why } where why is city | subdivision | county | county-fallback, or { agency: null }
export function matchAgency(list, { place, subdivision, county }) {
  const cities = list.filter(a => a.type === 'City');
  const byName = (names, pool) => {
    const want = new Set(names.flatMap(placeKeys)); if (!want.size) return null;
    const hits = pool.filter(a => agencyKeys(a.name).some(k => want.has(k)));
    // a lone match outside the county still counts: Virginia's independent cities are their own county ("FAIRFAX CITY")
    return hits.find(a => inCounty(a, county) && a.counties.length) || hits.find(a => inCounty(a, county)) || (hits.length === 1 ? hits[0] : null);
  };
  if (place) { const a = byName([place], cities); if (a) return { agency: a, why: 'city' }; }
  if (subdivision) { const a = byName([subdivision], cities); if (a) return { agency: a, why: 'subdivision' }; }
  const c = countyAgency(list, county);
  if (c) return { agency: c, why: place ? 'county-fallback' : 'county' };
  // a consolidated city-county whose department is filed as a city one (Honolulu, outside any incorporated place)
  const cc = county && byName([county], cities); if (cc) return { agency: cc, why: 'county' };
  return { agency: null, why: null };
}
// county police where it exists (it patrols there, e.g. Fairfax, Montgomery MD), else the sheriff
export function countyAgency(list, county) {
  if (!county) return null; const base = countyBase(county);
  const pool = list.filter(a => a.type === 'County' && inCounty(a, county) && norm(a.name).startsWith(base + ' '));
  return pool.find(a => /police/i.test(a.name)) || pool.find(a => /sheriff/i.test(a.name)) || pool[0] || null;
}

// ---------- counts ----------
// "MM-YYYY" keyed map -> { year: { n, months } } (null months = not reported)
function byYear(m) {
  const out = {};
  for (const [k, v] of Object.entries(m || {})) { const y = +k.slice(3); if (!y || v == null) continue; const o = out[y] ||= { n: 0, months: 0 }; o.n += +v || 0; o.months++; }
  return out;
}
const series = (block, suffix, prefer) => { const k = Object.keys(block || {}).filter(k => k.endsWith(' ' + suffix)); return block?.[k.find(x => prefer && x.startsWith(prefer)) || k[0]] || null; };
const yearOf = s => +(String(s || '').match(/(\d{4})$/)?.[1] || 0);

// one offense's summarized response -> per year: the department's count, cleared count, months reported, population,
// and the state and national rates per 100,000 (the twelve monthly rates summed)
export function summarizeOffense(resp, { agencyName, stateName }) {
  const o = resp?.offenses || {}, act = o.actuals || {}, rates = o.rates || {}, pop = resp?.populations?.population || {};
  const own = Object.keys(act).find(k => k.endsWith(' Offenses') && (!agencyName || k.startsWith(agencyName))) || Object.keys(act).find(k => k.endsWith(' Offenses'));
  const name = own ? own.replace(/ Offenses$/, '') : agencyName;
  const n = byYear(act[own]), cl = byYear(act[name + ' Clearances']);
  const st = byYear(rates[(stateName || '') + ' Offenses'] || series(rates, 'Offenses', stateName)), us = byYear(rates['United States Offenses']);
  const ppl = pop[name] || {}, years = {};
  for (const y of new Set([...Object.keys(n), ...Object.keys(st), ...Object.keys(us)].map(Number))) {
    const p = Object.entries(ppl).filter(([k, v]) => yearOf(k) === y && v > 0).map(([, v]) => +v);
    years[y] = { n: n[y]?.n ?? null, months: n[y]?.months || 0, cleared: cl[y]?.n ?? null, pop: p.length ? Math.max(...p) : null,
      state_rate: st[y]?.months === 12 ? Math.round(st[y].n * 10) / 10 : null, us_rate: us[y]?.months === 12 ? Math.round(us[y].n * 10) / 10 : null };
  }
  return { name, years };
}
// the newest complete calendar year in the FBI's data: max_data_date "09/2026" -> 2025 (December 2026 would be 2026)
export function latestFullYear(resp) {
  const m = String(resp?.cde_properties?.max_data_date?.UCR || '').match(/^(\d{1,2})\/(\d{4})$/);
  return m ? (+m[1] === 12 ? +m[2] : +m[2] - 1) : new Date().getUTCFullYear() - 1;
}
const rate = (n, pop, months) => n != null && pop > 0 && months > 0 ? Math.round(n / pop * 1e5 * (12 / months) * 10) / 10 : null;

// every offense's summary -> the report: year rows (violent / property totals and rates vs state and US), the offense mix for
// the headline year, clearance rates. The headline year is the newest full year the department reported all 12 months of,
// or failing that the newest year it reported at all (flagged partial).
export function buildReport({ agency, stateAbbr, totals, offenses, lastYear, firstYear }) {
  const yrs = []; for (let y = lastYear; y >= firstYear; y--) yrs.push(y);
  const t = { v: totals.v?.years || {}, p: totals.p?.years || {} };
  const rows = yrs.map(y => {
    const v = t.v[y] || {}, p = t.p[y] || {}, months = Math.max(v.months || 0, p.months || 0), pop = v.pop || p.pop || null;
    return { y, months, pop, v: v.n ?? null, p: p.n ?? null, rate_v: rate(v.n, pop, v.months), rate_p: rate(p.n, pop, p.months),
      state_rate_v: v.state_rate ?? null, state_rate_p: p.state_rate ?? null, us_rate_v: v.us_rate ?? null, us_rate_p: p.us_rate ?? null,
      // clearances can include older offenses solved this year, so the share is capped at 100%
      cleared_v: v.n ? Math.min(100, Math.round((v.cleared || 0) / v.n * 100)) : null, cleared_p: p.n ? Math.min(100, Math.round((p.cleared || 0) / p.n * 100)) : null };
  }).filter(r => r.months > 0 || r.state_rate_v != null);
  const reported = rows.filter(r => r.months > 0);
  const head = reported.find(r => r.months === 12 && r.y >= lastYear - 1) || reported[0] || null;
  const prev = head && rows.find(r => r.y === head.y - 1 && r.months > 0), full = head?.months === 12 && prev?.months === 12; // change only between two whole years
  const pct = (a, b) => a != null && b ? Math.round((a / b - 1) * 100) : null;
  const ratio = (a, b) => a != null && b ? Math.round(a / b * 100) / 100 : null;
  const mix = head ? OFFENSES.map(o => { const y = offenses[o.key]?.years?.[head.y] || {}; return { key: o.key, name: o.name, cat: o.cat, n: y.n ?? null, rate: rate(y.n, head.pop, y.months), state_rate: y.state_rate ?? null, us_rate: y.us_rate ?? null }; }).filter(o => o.n != null) : [];
  return {
    agency, state: stateAbbr, state_name: STATE_NAMES[stateAbbr] || stateAbbr,
    year: head?.y ?? null, latest_full_year: lastYear, stale: head ? head.y < lastYear - 1 : null, partial: head ? head.months < 12 : null, months: head?.months ?? 0, population: head?.pop ?? null,
    headline: head ? { v: head.v, p: head.p, rate_v: head.rate_v, rate_p: head.rate_p, state_rate_v: head.state_rate_v, state_rate_p: head.state_rate_p, us_rate_v: head.us_rate_v, us_rate_p: head.us_rate_p,
      vs_state_v: ratio(head.rate_v, head.state_rate_v), vs_state_p: ratio(head.rate_p, head.state_rate_p), vs_us_v: ratio(head.rate_v, head.us_rate_v), vs_us_p: ratio(head.rate_p, head.us_rate_p),
      change_v: full ? pct(head.rate_v, prev.rate_v) : null, change_p: full ? pct(head.rate_p, prev.rate_p) : null,
      cleared_v: head.cleared_v, cleared_p: head.cleared_p } : null,
    years: rows, offenses: mix
  };
}
