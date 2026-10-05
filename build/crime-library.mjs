// The crime library: the FBI Crime Data Explorer's yearly figures for every city and county police department in the US,
// saved into Supabase (crime_agencies, crime_agency_years, crime_area_years; migration 20261016000000_crime_library.sql)
// for api/crimeus (faster cards, state rankings). Run weekly by .github/workflows/crime-library.yml.
//   For each state: the FBI agency list (every type) is saved; then each city and county department whose figures are
//   missing or older than REFRESH_DAYS gets its two totals and eight offenses read (ten calls, monthly, FROM_YEAR to now)
//   and summed by calendar year. A department with nothing reported is still marked read, so it isn't asked again
//   until it is due. Stops cleanly after MAX_MINUTES; the next run carries on (the workflow restarts itself).
// Uses the FBI web app's endpoints without a key: the keyed api.data.gov copy allows only 1,000 calls an hour.
// Env: STATES (default all + DC), TYPES (City,County), REFRESH_DAYS (30), MAX_MINUTES (300), CONCURRENCY (3 departments
// at a time), RATE (FBI requests a second across them all, default 5), FROM_YEAR (2015).
// Politeness: unthrottled, the first run sent ~65 requests a second and the FBI stopped answering the runner after ~1,500.
// So every request waits its turn under RATE, and a run of failed departments pauses the loader (5 minutes, up to 3 times)
// before it gives up for this run.
import { appendFileSync } from 'node:fs';
import { log } from './util.mjs';
import { supa } from '../lib/supa.mjs';
import { cdeGet, OFFENSES, TOTALS, STATE_NAMES, flattenDirectory, summarizeOffense, libraryRows, areaRows } from '../lib/fbicrime.mjs';

const env = process.env;
const STATES = (env.STATES || Object.keys(STATE_NAMES).filter(s => s !== 'PR').join(',')).split(',').map(s => s.trim().toUpperCase()).filter(s => STATE_NAMES[s]);
const TYPES = new Set((env.TYPES || 'City,County').split(',').map(s => s.trim()));
const REFRESH_DAYS = +(env.REFRESH_DAYS || 30), MAX_MINUTES = +(env.MAX_MINUTES || 300), CONCURRENCY = Math.max(1, +(env.CONCURRENCY || 3)), FROM_YEAR = +(env.FROM_YEAR || 2015);
const RATE = Math.max(0.2, +(env.RATE || 5)), PAUSE_MS = +(env.PAUSE_MS ?? 300000), FAIL_STREAK = +(env.FAIL_STREAK || 10), MAX_PAUSES = +(env.MAX_PAUSES || 3);
const sleep = ms => new Promise(r => setTimeout(r, ms));
// one FBI request at a time per 1/RATE seconds, shared by every worker
let nextSlot = 0;
async function fbi(path, ms) { const now = Date.now(), at = Math.max(now, nextSlot); nextSlot = at + 1000 / RATE; if (at > now) await sleep(at - now); return cdeGet(path, { ms }); }
// consecutive failed departments: pause, then give up for this run (the next run carries on)
let streak = 0, pauses = 0, gaveUp = false, pausing = null;
async function failed() {
  if (++streak < FAIL_STREAK || gaveUp) return;
  if (pauses >= MAX_PAUSES) { gaveUp = true; log('the FBI keeps failing: stopping this run'); return; }
  if (!pausing) { pauses++; log('the FBI failed ' + streak + ' departments in a row: pausing ' + Math.round(PAUSE_MS / 6e4) + ' min (' + pauses + '/' + MAX_PAUSES + ')'); pausing = sleep(PAUSE_MS).then(() => { pausing = null; streak = 0; }); }
  await pausing;
}
const KEYS = [...TOTALS.map(t => t.key), ...OFFENSES.map(o => o.key)];

const db = supa();
if (!db) { console.error('SUPABASE_URL and SUPABASE_SECRET_KEY (or GitHub OIDC) must be set'); process.exit(1); }
try { await db.select('crime_agencies', 'select=ori&limit=1'); }
catch (e) { console.error('The crime library tables are missing: apply supabase/migrations/20261016000000_crime_library.sql.\n' + e.message); process.exit(1); }

const t0 = Date.now(), timeUp = () => Date.now() - t0 > MAX_MINUTES * 6e4, now = new Date().getUTCFullYear(), span = '?from=01-' + FROM_YEAR + '&to=12-' + now;
const stats = { states: 0, agencies: 0, read: 0, years: 0, empty: 0, failed: 0, remaining: 0 }, errors = [];
log('crime library: ' + STATES.length + ' states, types ' + [...TYPES].join('/') + ', refresh after ' + REFRESH_DAYS + ' days, database via ' + db.via);

// one department: ten calls -> its year rows and the state / US rates its answers carry
async function readAgency(a, st) {
  const resps = await Promise.all(KEYS.map(k => fbi('/summarized/agency/' + encodeURIComponent(a.ori) + '/' + k + span, 20000)));
  const sum = r => summarizeOffense(r, { agencyName: a.name, stateName: STATE_NAMES[st] }), s = { v: sum(resps[0]), p: sum(resps[1]), offenses: Object.fromEntries(OFFENSES.map((o, i) => [o.key, sum(resps[i + 2])])) };
  return { rows: libraryRows(a.ori, s), areas: areaRows(st, s), data_through: resps[0]?.cde_properties?.max_data_date?.UCR || null };
}

const agencyRow = (a, st, extra = {}) => ({ ori: a.ori, name: a.name, type: a.type, state: st, counties: a.counties, nibrs_since: a.nibrs_since, lat: a.lat, lon: a.lon, updated_at: new Date().toISOString(), ...extra });
let usDone = false;
for (const st of STATES) {
  if (timeUp() || gaveUp) { stats.remaining += 1; continue; }
  let dir;
  try { dir = flattenDirectory(await fbi('/agency/byStateAbbr/' + st, 60000)); }
  catch (e) { stats.failed++; errors.push(st + ' agency list: ' + e.message); continue; }
  await db.upsert('crime_agencies', dir.map(a => agencyRow(a, st)), 'ori');
  const have = await db.selectAll('crime_agencies', 'state=eq.' + st + '&select=ori,loaded_at');
  const fresh = new Set(have.filter(h => h.loaded_at && Date.now() - Date.parse(h.loaded_at) < REFRESH_DAYS * 864e5).map(h => h.ori));
  const todo = dir.filter(a => TYPES.has(a.type) && !fresh.has(a.ori));
  stats.states++; stats.agencies += dir.length;
  let stateDone = false, years = [], marks = [], i = 0;
  // take the batch before writing it: the other workers keep adding while the upsert is in flight
  const flush = async () => {
    const ys = years, ms = marks; years = []; marks = [];
    if (ys.length) { await db.upsert('crime_agency_years', ys, 'ori,year'); stats.years += ys.length; }
    if (ms.length) await db.upsert('crime_agencies', ms, 'ori');
  };
  const worker = async () => {
    while (i < todo.length && !timeUp() && !gaveUp) {
      const a = todo[i++];
      try {
        const r = await readAgency(a, st);
        if (!stateDone && r.areas.some(x => x.area === st)) { stateDone = true; await db.upsert('crime_area_years', r.areas.filter(x => x.area === st || !usDone), 'area,year'); usDone = true; }
        years.push(...r.rows); marks.push(agencyRow(a, st, { loaded_at: new Date().toISOString(), data_through: r.data_through }));
        stats.read++; streak = 0; if (!r.rows.length) stats.empty++;
        if (stats.read % 100 === 0) log('  ' + stats.read + ' departments read, ' + stats.failed + ' failed · ' + (stats.read / ((Date.now() - t0) / 6e4)).toFixed(0) + ' a minute');
      } catch (e) { stats.failed++; if (errors.length < 15) errors.push(a.ori + ' ' + a.name + ': ' + e.message); if (stats.failed <= 5) log('  failed ' + a.ori + ' ' + a.name + ': ' + e.message); await failed(); }
      if (marks.length >= 40) await flush();
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await flush();
  const left = todo.length - i; stats.remaining += left;
  log(st + ': ' + dir.length + ' agencies, ' + todo.length + ' to read' + (left ? ', ' + left + ' left for the next run' : '') + ' · ' + JSON.stringify(stats) + ' · ' + ((Date.now() - t0) / 6e4).toFixed(1) + ' min');
}
for (const e of errors) log('  ' + e);
log('crime library done: ' + JSON.stringify(stats));
// after giving up, don't let the workflow start another run straight away: the weekly schedule tries again
if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, 'remaining=' + (gaveUp ? 0 : stats.remaining) + '\n');
if (gaveUp) process.exit(1);
// a run where nearly everything failed means the FBI's endpoints changed or are down: fail so it shows in Actions
if (stats.failed > 20 && stats.failed > stats.read) process.exit(1);
