// Preload for test/crimelibrary.sh: a fake FBI Crime Data Explorer (agency lists for TX and LA, monthly counts per
// department), counting calls in $MOCK_LOG. TX2370700 always fails, like a department the FBI can't serve.
import fs from 'node:fs';
const json = o => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
const A = (ori, name, type, counties, st) => ({ ori, agency_name: name, agency_type_name: type, counties, state_abbr: st, latitude: 30, longitude: -96, is_nibrs: true, nibrs_start_date: '2019-01-01' });
const DIR = {
  TX: { WALLER: [A('TX2370100', 'Brookshire Police Department', 'City', 'WALLER', 'TX'), A('TX2370700', 'Hempstead Police Department', 'City', 'WALLER', 'TX'), A('TX2370000', "Waller County Sheriff's Office", 'County', 'WALLER', 'TX'),
    A('TX2370900', 'Prairie View A&M University', 'University or College', 'WALLER', 'TX'), A('TX2379999', 'Quiet Town Police Department', 'City', 'WALLER', 'TX')] },
  LA: { ORLEANS: [A('LANPD0000', 'New Orleans Police Department', 'City', 'ORLEANS', 'LA')] }
};
const NAME = Object.fromEntries(Object.values(DIR).flatMap(d => Object.values(d).flat()).map(a => [a.ori, a.agency_name]));
const months = (y, f) => Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1).padStart(2, '0') + '-' + y, f(i)]));
const inner = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = new URL(String(url));
  if (u.host !== 'cde.ucr.cjis.gov') return inner(url, opts);
  if (process.env.MOCK_LOG) fs.appendFileSync(process.env.MOCK_LOG, u.pathname + '\n');
  const d = u.pathname.match(/\/agency\/byStateAbbr\/(\w\w)$/); if (d) return json(DIR[d[1]] || {});
  const m = u.pathname.match(/\/summarized\/agency\/(\w+)\/([\w-]+)$/);
  if (!m || m[1] === 'TX2370700' || process.env.MOCK_FBI_DOWN) return new Response('<!DOCTYPE html><html>Service Unavailable</html>', { status: 503 });
  const name = NAME[m[1]], st = m[1].slice(0, 2) === 'TX' ? 'Texas' : 'Louisiana', quiet = m[1] === 'TX2379999';
  const act = {}, cl = {}, pop = {}, sr = {}, us = {};
  for (const y of [2024, 2025]) {
    Object.assign(act, months(y, i => quiet || (m[1] === 'LANPD0000' && y === 2025) ? null : 4)); Object.assign(cl, months(y, i => quiet ? null : 1));
    Object.assign(pop, months(y, () => 6000)); Object.assign(sr, months(y, () => 30)); Object.assign(us, months(y, () => 25));
  }
  return json({ offenses: { rates: { [st + ' Offenses']: sr, 'United States Offenses': us }, actuals: { [name + ' Offenses']: act, [name + ' Clearances']: cl } },
    populations: { population: { [name]: pop } }, cde_properties: { max_data_date: { UCR: '09/2026' }, last_refresh_date: { UCR: '09/15/2026' } } });
};
