// Offline tests for api/crimeus.js and lib/fbicrime.mjs: matching a point to its police department, the yearly rates vs the
// state and the US, partial years, the other departments in the county, and input checks. Shapes copied from the FBI CDE
// responses build/probe-fbi.mjs printed.
import assert from 'node:assert/strict';
import { agencyKeys, placeKeys, flattenDirectory, matchAgency, countyAgency, summarizeOffense, latestFullYear, buildReport } from '../lib/fbicrime.mjs';

// ---------- names ----------
assert.deepEqual(agencyKeys('Houston Police Department'), ['houston']);
assert.ok(agencyKeys('Blasdell Village Police Department').includes('blasdell'));
assert.ok(agencyKeys('Metropolitan Nashville Police Department').includes('nashville'));
assert.ok(agencyKeys('New York City Police Department').includes('new york'));
assert.ok(agencyKeys('Prairie View  Police Department').includes('prairie view'));
assert.ok(placeKeys('Nashville-Davidson metropolitan government (balance)').includes('nashville'));
assert.deepEqual(placeKeys('Katy'), ['katy']);

// ---------- directory + matching ----------
const A = (ori, name, type, counties) => ({ ori, agency_name: name, agency_type_name: type, counties, state_abbr: 'TX', is_nibrs: true, nibrs_start_date: '2019-01-01' });
const DIR = {
  WALLER: [A('TX2370100', 'Brookshire Police Department', 'City', 'WALLER'), A('TX2370700', 'Hempstead Police Department', 'City', 'WALLER'), A('TX2370800', 'Prairie View  Police Department', 'City', 'WALLER'),
    A('TX2370900', 'Prairie View A&M University', 'University or College', 'WALLER'), A('TX2370300', 'Waller County Constable: Precinct 1', 'Other', 'WALLER'), A('TX2370000', "Waller County Sheriff's Office", 'County', 'WALLER'),
    A('TX1012700', 'Katy Police Department', 'City', 'FORT BEND, HARRIS, WALLER')],
  HARRIS: [A('TXHPD0000', 'Houston Police Department', 'City', 'FORT BEND, HARRIS, MONTGOMERY'), A('TX1011900', 'South Houston Police Department', 'City', 'HARRIS'), A('TX1010000', "Harris County Sheriff's Office", 'County', 'HARRIS'),
    A('TX1012700', 'Katy Police Department', 'City', 'FORT BEND, HARRIS, WALLER')]
};
const list = flattenDirectory(DIR);
assert.equal(list.length, 10); // Katy listed under two counties, kept once
assert.deepEqual(list.find(a => a.ori === 'TX1012700').counties, ['FORT BEND', 'HARRIS', 'WALLER']);
let m = matchAgency(list, { place: 'Houston', county: 'Harris' }); assert.equal(m.agency.ori, 'TXHPD0000'); assert.equal(m.why, 'city');
m = matchAgency(list, { place: 'South Houston', county: 'Harris' }); assert.equal(m.agency.ori, 'TX1011900');
m = matchAgency(list, { place: 'Prairie View', county: 'Waller' }); assert.equal(m.agency.ori, 'TX2370800'); // not the university
m = matchAgency(list, { place: 'Katy', county: 'Waller' }); assert.equal(m.agency.ori, 'TX1012700');
m = matchAgency(list, { place: 'Pine Island', county: 'Waller' }); assert.equal(m.agency.ori, 'TX2370000'); assert.equal(m.why, 'county-fallback');
m = matchAgency(list, { place: null, county: 'Harris' }); assert.equal(m.agency.ori, 'TX1010000'); assert.equal(m.why, 'county');
m = matchAgency(list, { place: null, county: 'Austin' }); assert.equal(m.agency, null);
// a township (a working government, not a place) with its own police
const pa = flattenDirectory({ MONTGOMERY: [A('PA0461900', 'Lower Merion Township Police Department', 'City', 'MONTGOMERY'), A('PA046SO00', "Montgomery County Sheriff's Office", 'County', 'MONTGOMERY')] });
m = matchAgency(pa, { place: null, subdivision: 'Lower Merion', county: 'Montgomery' }); assert.equal(m.agency.ori, 'PA0461900'); assert.equal(m.why, 'subdivision');
// county police over the sheriff where both report (Fairfax, Montgomery MD)
const va = flattenDirectory({ FAIRFAX: [A('VA029SO00', "Fairfax County Sheriff's Office", 'County', 'FAIRFAX'), A('VA0290100', 'Fairfax County Police Department', 'County', 'FAIRFAX'), A('VA1075000', 'Fairfax City Police Department', 'City', 'FAIRFAX CITY')] });
assert.equal(countyAgency(va, 'Fairfax').ori, 'VA0290100');
assert.equal(matchAgency(va, { place: 'Fairfax', county: 'Fairfax' }).agency.ori, 'VA1075000'); // independent city: its own "county"
// New York City: the department lists no county
const ny = flattenDirectory({ 'NOT SPECIFIED': [A('NY0303000', 'New York City Police Department', 'City', 'NOT SPECIFIED')], KINGS: [A('NY0303', 'Kings County Sheriff', 'County', 'KINGS')] });
assert.equal(matchAgency(ny, { place: 'New York', county: 'Kings' }).agency.ori, 'NY0303000');

// ---------- counts ----------
const months = (y, f) => Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1).padStart(2, '0') + '-' + y, f(i)]));
const resp = (agency, byYear, { stRate = 30, usRate = 25, pop = 100000, partial = {} } = {}) => {
  const act = {}, cl = {}, ppl = {}, st = {}, us = {};
  for (const [y, n] of Object.entries(byYear)) {
    Object.assign(act, months(y, i => i < (partial[y] ?? 12) ? n / 12 : null)); Object.assign(cl, months(y, i => i < (partial[y] ?? 12) ? n / 48 : null));
    Object.assign(ppl, months(y, () => pop)); Object.assign(st, months(y, () => stRate / 12)); Object.assign(us, months(y, () => usRate / 12));
  }
  return { offenses: { rates: { 'Texas Offenses': st, 'United States Offenses': us, [agency + ' Offenses']: {} }, actuals: { [agency + ' Offenses']: act, [agency + ' Clearances']: cl } },
    populations: { population: { Texas: {}, 'United States': {}, [agency]: ppl } }, cde_properties: { max_data_date: { UCR: '09/2026' }, last_refresh_date: { UCR: '09/15/2026' } } };
};
assert.equal(latestFullYear(resp('X', {})), 2025); assert.equal(latestFullYear({ cde_properties: { max_data_date: { UCR: '12/2025' } } }), 2025);
const s = summarizeOffense(resp('Waller County Sheriff\'s Office', { 2024: 240, 2025: 300 }, { stRate: 400, usRate: 360, pop: 60000 }), { agencyName: "Waller County Sheriff's Office", stateName: 'Texas' });
assert.equal(s.years[2025].n, 300); assert.equal(s.years[2025].months, 12); assert.equal(s.years[2025].pop, 60000); assert.equal(s.years[2025].state_rate, 400); assert.equal(s.years[2025].us_rate, 360); assert.equal(s.years[2025].cleared, 75);

// a department that reported only 6 months of 2025: its rate is annualized and flagged; the headline falls back to 2024 (whole)
const agency = { ori: 'TX2370000', name: "Waller County Sheriff's Office", type: 'County', counties: ['WALLER'] };
const sum = (byYear, o) => summarizeOffense(resp(agency.name, byYear, o), { agencyName: agency.name, stateName: 'Texas' });
const offenses = { homicide: sum({ 2024: 2, 2025: 1 }, { stRate: 6 }), larceny: sum({ 2024: 600, 2025: 500 }, { stRate: 1200 }) };
let rep = buildReport({ agency, stateAbbr: 'TX', totals: { v: sum({ 2023: 100, 2024: 120, 2025: 150 }, { stRate: 400, usRate: 360, pop: 60000 }), p: sum({ 2023: 900, 2024: 1000, 2025: 1100 }, { stRate: 1800, usRate: 1700, pop: 60000 }) }, offenses, lastYear: 2025, firstYear: 2016 });
assert.equal(rep.year, 2025); assert.equal(rep.partial, false); assert.equal(rep.population, 60000);
assert.equal(rep.headline.rate_v, 250); assert.equal(rep.headline.state_rate_v, 400); assert.equal(rep.headline.vs_state_v, 0.63); assert.equal(rep.headline.vs_us_v, 0.69);
assert.equal(rep.headline.change_v, 25); assert.equal(rep.headline.cleared_v, 25);
assert.deepEqual(rep.years.map(y => y.y), [2025, 2024, 2023]); assert.equal(rep.state_name, 'Texas');
assert.deepEqual(rep.offenses.map(o => o.name), ['Murder', 'Theft']); assert.equal(rep.offenses[1].state_rate, 1200);
rep = buildReport({ agency, stateAbbr: 'TX', totals: { v: sum({ 2024: 120, 2025: 150 }, { partial: { 2025: 6 }, pop: 60000 }), p: sum({ 2024: 1000, 2025: 1100 }, { partial: { 2025: 6 }, pop: 60000 }) }, offenses: {}, lastYear: 2025, firstYear: 2016 });
assert.equal(rep.year, 2024); assert.equal(rep.partial, false); assert.equal(rep.years[0].months, 6); assert.equal(rep.years[0].rate_v, Math.round(75 / 60000 * 1e5 * 2 * 10) / 10);
assert.equal(rep.headline.change_v, null); // no whole year before 2024 here
rep = buildReport({ agency, stateAbbr: 'TX', totals: { v: sum({ 2025: 150 }, { partial: { 2025: 9 } }), p: sum({ 2025: 1100 }, { partial: { 2025: 9 } }) }, offenses: {}, lastYear: 2025, firstYear: 2016 });
assert.equal(rep.year, 2025); assert.equal(rep.partial, true); assert.equal(rep.months, 9);

// ---------- the endpoint ----------
const seen = [];
globalThis.fetch = async url => {
  const u = String(url); seen.push(u);
  if (u.startsWith('https://geocoding.geo.census.gov/')) {
    const x = +new URL(u).searchParams.get('x');
    if (x > 0) return Response.json({ result: { geographies: {} } }); // outside the US
    const inBrookshire = x > -95.96 && x < -95.94;
    return Response.json({ result: { geographies: { States: [{ STUSAB: 'TX', STATE: '48' }], Counties: [{ BASENAME: 'Waller', NAME: 'Waller County', STATE: '48' }], 'County Subdivisions': [{ BASENAME: 'Brookshire', NAME: 'Brookshire CCD', FUNCSTAT: 'S' }],
      'Incorporated Places': inBrookshire ? [{ BASENAME: 'Brookshire', NAME: 'Brookshire city' }] : [] } } });
  }
  if (u.endsWith('/agency/byStateAbbr/TX')) return Response.json({ WALLER: [...DIR.WALLER, A('TX2370100', 'Brookshire Police Department', 'City', 'WALLER')] });
  const sm = u.match(/\/summarized\/agency\/(\w+)\/([\w-]+)\?from=01-(\d{4})&to=12-(\d{4})/);
  if (sm) { const name = { TX2370100: 'Brookshire Police Department', TX2370000: "Waller County Sheriff's Office" }[sm[1]]; if (!name) return new Response('<!DOCTYPE html><html>Not Found</html>', { status: 404 });
    return Response.json(resp(name, { 2024: sm[2] === 'violent-crime' ? 24 : 120, 2025: sm[2] === 'violent-crime' ? 30 : 100 }, { stRate: 400, usRate: 360, pop: 5000 })); }
  return new Response('unmocked ' + u, { status: 599 });
};
const { default: handler } = await import('../api/crimeus.js');
const res = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
const call = async query => { const r = res(); await handler({ headers: {}, query, method: 'GET' }, r); return r; };

let r = await call({ lat: '29.786', lon: '-95.95' });
assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.agency.ori, 'TX2370100'); assert.equal(r.body.why, 'city'); assert.match(r.body.note, /Inside Brookshire city/);
assert.equal(r.body.year, 2025); assert.equal(r.body.headline.rate_v, 600); assert.equal(r.body.headline.vs_state_v, 1.5); assert.equal(r.body.headline.change_v, 25);
assert.equal(r.body.data_through, '09/2026'); assert.match(r.body.coverage, /calendar year/); assert.match(r.headers['Cache-Control'], /s-maxage=604800/);
assert.ok(r.body.others.some(o => o.ori === 'TX2370000')); assert.ok(!r.body.others.some(o => o.type === 'University or College' || o.type === 'Other'));
assert.equal(r.body.others.at(-1).type, 'County'); // cities first
assert.equal(seen.filter(u => u.includes('/summarized/agency/TX2370100/')).length, 10); // two totals + eight offenses
// open country: the sheriff; and the department cached per instance
seen.length = 0; r = await call({ lat: '30.05', lon: '-96.0' });
assert.equal(r.body.agency.ori, 'TX2370000'); assert.equal(r.body.why, 'county'); assert.match(r.body.note, /Outside any city limits/);
seen.length = 0; r = await call({ lat: '30.06', lon: '-96.01' }); assert.equal(r.body.agency.ori, 'TX2370000'); assert.equal(seen.filter(u => u.includes('/summarized/')).length, 0);
// a chosen department by ID
r = await call({ ori: 'tx2370100' }); assert.equal(r.code, 200); assert.equal(r.body.agency.name, 'Brookshire Police Department'); assert.equal(r.body.why, 'chosen'); assert.equal(r.body.where, null);
// errors
assert.equal((await call({})).code, 400);
r = await call({ lat: '48.85', lon: '2.35' }); assert.equal(r.code, 404); assert.match(r.body.error, /United States only/);
r = await call({ ori: 'TX9999999' }); assert.equal(r.code, 404);
r = await call({ ori: 'ZZ1234567' }); assert.equal(r.code, 400);
console.log('crimeus ok');
