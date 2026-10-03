// Nightly: save the live-data facts behind the map into Supabase (.github/workflows/live-sync.yml).
//   news_articles + filing_news  GDELT articles for the developer / tenant / owner of active filings (rotates through them, ~5 s per search)
//   imagery_passes               NASA HLS passes (date, cloud %) over each active filing
//   weather_daily                Open-Meteo daily weather at each county centroid (3 days back, 7 ahead)
//   storm_advisories             NOAA NHC active-storm snapshot
//   tracts                       ACS census tracts from data/market.json
//   crime_incidents              Houston Police NIBRS incidents (yearly CSVs), last ~25 months, for crime near a site on building cards
// Reads the regional data/filings.json and data/geo.json the "Refresh data" workflow commits. Needs the
// 20261004000000_live_data.sql migration. Env: NEWS_MAX (searches per night, default 120), IMAGERY_MAX (default 600),
// IMAGERY_DAYS (look-back, default 30), ONLY=news,imagery,weather,storms,tracts,crime (subset). Crime needs 20261010000000_site_data.sql.
import { log, readJSON } from './util.mjs';
import { supa } from '../lib/supa.mjs';
import { hlsPasses } from '../lib/nasa.mjs';
import { news, phrase } from '../api/news.js';
import { daily, storms } from '../api/weather.js';
import { HPD_CSV, parseHpd } from '../lib/crime.mjs';

const D = process.env.DATA_DIR || 'data/';
const ONLY = (process.env.ONLY || 'news,imagery,weather,storms,tracts,crime').split(',');
const NEWS_MAX = +(process.env.NEWS_MAX || 120), IMAGERY_MAX = +(process.env.IMAGERY_MAX || 600), IMAGERY_DAYS = +(process.env.IMAGERY_DAYS || 30);
const NEWS_GAP_MS = +(process.env.NEWS_GAP_MS ?? 5500); // GDELT asks for at most one request per 5 seconds
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const dayNo = Math.floor(Date.now() / 864e5);
// a different slice of a long list each night, so everything gets visited over a few nights
export const rotate = (list, n, k = dayNo) => list.length <= n ? list : Array.from({ length: n }, (_, i) => list[(k * n + i) % list.length]);
const addDays = (s, n) => new Date(Date.parse(s + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

const db = supa();
if (!db) { console.error('SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY, or GitHub OIDC) must be set'); process.exit(1); }
try { await db.select('news_articles', 'select=url&limit=1'); }
catch (e) {
  console.error('The live-data tables are missing. Run supabase/migrations/20261004000000_live_data.sql in the Supabase SQL editor (and redeploy the pipeline edge function if this workflow has no secret key).\n' + e.message);
  process.exit(1);
}

const F = (await readJSON(D + 'filings.json', { filings: [] })).filings, geo = await readJSON(D + 'geo.json', { counties: [] });
// active = under construction or starting within 90 days (ended at most 60 days ago)
const active = F.filter(f => f.ts <= addDays(today, 90) && f.te >= addDays(today, -60));
const stats = {}, failed = [];
async function step(name, fn) {
  if (!ONLY.includes(name)) return;
  const t = Date.now();
  try { stats[name] = await fn(); log(name, JSON.stringify(stats[name]), ((Date.now() - t) / 1000).toFixed(0) + 's'); }
  catch (e) { failed.push(name); log(name, 'FAILED', e.message); }
}

await step('storms', async () => {
  const { storms: list } = await storms(), hour = new Date(); hour.setUTCMinutes(0, 0, 0);
  const rows = list.map(s => ({ storm_id: s.id, observed_at: s.updated ? new Date(s.updated).toISOString() : hour.toISOString(), name: s.name, classification: s.classification,
    wind_mph: s.wind_mph, pressure_mb: s.pressure_mb, lat: s.lat, lon: s.lon, moving: s.moving, advisory_url: s.advisory }));
  if (rows.length) await db.upsert('storm_advisories', rows, 'storm_id,observed_at');
  return { active: rows.length };
});

await step('weather', async () => {
  const spots = geo.counties.filter(c => c.label).map(c => ({ county: c.name, c: c.label })); if (!spots.length) return { counties: 0 };
  const res = await daily(spots.map(s => s.c)), rows = [];
  res.forEach((days, i) => days.forEach(d => rows.push({ county: spots[i].county, lat: spots[i].c[1], lon: spots[i].c[0], ...d, is_forecast: d.day > today, updated_at: new Date().toISOString() })));
  await db.upsert('weather_daily', rows, 'county,day');
  return { counties: spots.length, rows: rows.length };
});

await step('tracts', async () => {
  const m = await readJSON(D + 'market.json'); if (!m?.tracts?.length) return { tracts: 0, note: 'no data/market.json (set the CENSUS_KEY secret for the Refresh data workflow)' };
  const rows = m.tracts.filter(t => t.g && t.geom).map(t => ({ geoid: String(t.g), acs_year: m.year, base_year: m.baseYear ?? null, pop: t.pop ?? null, growth_pct: t.gr ?? null, income: t.inc ?? null,
    home_value: t.val ?? null, rent: t.rent ?? null, vacancy_pct: t.vacr ?? null, median_age: t.age ?? null, housing_units: t.hu ?? null, geom_json: t.geom, updated_at: new Date().toISOString() }));
  await db.upsert('tracts', rows, 'geoid', 200);
  return { tracts: rows.length };
});

await step('crime', async () => {
  // first run: 25 months; after that only the months HPD may still be revising (it republishes the yearly files monthly)
  const latest = await db.rpc('crime_latest', {}), now = new Date();
  const since = latest ? addDays(String(latest).slice(0, 10), -75) : addDays(today, -760);
  let rows = 0; const errors = [];
  for (let y = +since.slice(0, 4); y <= now.getUTCFullYear(); y++) {
    const r = await fetch(HPD_CSV(y), { headers: { 'User-Agent': 'Mozilla/5.0 (FinishesSolutions RE intelligence)' }, signal: AbortSignal.timeout(180000) });
    if (!r.ok) { if (y === now.getUTCFullYear() && r.status === 404) continue; throw new Error('HPD ' + y + ' ' + r.status); }
    let list; try { list = parseHpd(await r.text(), { since }); } catch (e) { errors.push(y + ': ' + e.message); continue; } // one odd year doesn't block the others
    await db.upsert('crime_incidents', list, 'id', 1000); rows += list.length;
  }
  if (!rows && errors.length) throw new Error(errors.join('; '));
  const pruned = await db.rpc('crime_prune', { p_keep_days: 760 });
  return { since, rows, pruned, errors: errors.length ? errors : undefined };
});

await step('imagery', async () => {
  const list = rotate(active.filter(f => !f.approx).sort((a, b) => b.cost - a.cost), IMAGERY_MAX); let rows = 0, errors = 0;
  for (let i = 0; i < list.length; i += 4) {
    const batch = await Promise.all(list.slice(i, i + 4).map(f => hlsPasses([f.lon - .005, f.lat - .005, f.lon + .005, f.lat + .005], IMAGERY_DAYS)
      .then(p => p.map(x => ({ filing_id: f.id, product: x.product, day: x.day, cloud: x.cloud, checked_at: new Date().toISOString() }))).catch(() => { errors++; return []; })));
    const flat = batch.flat(); if (flat.length) { await db.upsert('imagery_passes', flat, 'filing_id,product,day'); rows += flat.length; }
  }
  if (errors > list.length / 2) throw new Error(errors + ' of ' + list.length + ' NASA lookups failed');
  return { filings: list.length, passes: rows, errors };
});

await step('news', async () => {
  // one search per developer/tenant/owner + city; the filings that share it all get the articles
  const groups = new Map();
  for (const f of active.filter(f => f.cost >= 1e6).sort((a, b) => b.cost - a.cost)) {
    const who = f.dev || f.ten || f.owner || f.name; if (!phrase(who)) continue;
    const k = phrase(who).toLowerCase() + '|' + (f.city || '').toLowerCase();
    if (!groups.has(k)) groups.set(k, { who, city: f.city || '', ids: [] }); groups.get(k).ids.push(f.id);
  }
  const todo = rotate([...groups.values()], NEWS_MAX); let found = 0, links = 0, errors = 0;
  for (const [i, g] of todo.entries()) {
    if (i) await sleep(NEWS_GAP_MS);
    try {
      const { query, articles } = await news(g.who, g.city, 10); if (!articles.length) continue;
      await db.upsert('news_articles', articles.map(a => ({ url: a.url, title: a.title, domain: a.domain, published: a.date, image: a.image })), 'url');
      const l = g.ids.flatMap(id => articles.map(a => ({ filing_id: id, url: a.url, query }))); await db.upsert('filing_news', l, 'filing_id,url');
      found += articles.length; links += l.length;
    } catch (e) { errors++; if (/limit/i.test(e.message)) await sleep(15000); }
  }
  if (todo.length && errors === todo.length) throw new Error('every news search failed');
  return { searches: todo.length, of: groups.size, articles: found, links, errors };
});

log('live-sync done', failed.length ? 'with failures: ' + failed.join(', ') : 'ok');
process.exit(failed.length && failed.length === ONLY.length ? 1 : 0);
