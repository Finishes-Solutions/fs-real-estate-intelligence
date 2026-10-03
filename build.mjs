// Data pipeline for the Finishes Solutions real estate intelligence map.
//   node build.mjs             full refresh (GitHub Actions): TABS -> geocode -> AI enrichment -> change feed -> market data -> area context, then assemble
//   node build.mjs --assemble  copy src/ + committed data/ into public/ (Vercel build; no network)
// Everything slow is cached under data/cache/ and committed, so weekly runs only fetch what changed.
import fs from 'node:fs/promises';
import { log, hash, readJSON, writeMap, writeRows, iso, fetchRetry } from './build/util.mjs';
import { listCounty, details } from './build/tabs.mjs';
import { geocodeRows, cleanStreet, parseCity } from './build/geocode.mjs';
import { buildGeo } from './build/geometry.mjs';
import { toFiling, countyCheck } from './build/compact.mjs';
import { enrich, aiFields, aiKey } from './build/enrich.mjs';
import { diff, appendRun } from './build/changes.mjs';
import { buildMarket } from './build/market.mjs';
import { buildArea, mergeJobs } from './build/area.mjs';
import { buildCE } from './build/spending.mjs';
import { mergeSpending } from './lib/spending.mjs';

const KEY = process.env.MAPTILER_KEY || 'vA28jXazwpYesC2b1Ccp';
const D = process.env.DATA_DIR || 'data/', C = D + 'cache/';

async function assemble() {
  await fs.rm('public', { recursive: true, force: true });
  let ready = true; try { await fs.access(D + 'filings.json'); } catch (e) { ready = false; }
  if (!ready) { // first deploy before the data workflow has committed anything: publish a holding page instead of failing
    log('assemble: data/filings.json missing; publishing a holding page until the "Refresh data" workflow commits data');
    await fs.mkdir('public', { recursive: true }); await fs.copyFile('src/logo.png', 'public/logo.png');
    await fs.writeFile('public/index.html', '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Real Estate Intelligence — loading data</title>' +
      '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f8f9f9;color:#23282a}main{max-width:460px;padding:24px;text-align:center}img{height:40px}h1{font-size:22px;margin:18px 0 8px}p{color:#6b7174;line-height:1.5}' +
      '@media (prefers-color-scheme:dark){body{background:#16191a;color:#fff}img{filter:brightness(0) invert(1)}}</style></head><body><main><img src="logo.png" alt="Finishes Solutions">' +
      '<h1>Construction data is being prepared</h1><p>The first two-year data refresh is still running. This page updates automatically when it finishes (about 90 minutes after it starts).</p></main></body></html>');
    return;
  }
  await fs.mkdir('public/data', { recursive: true }); await fs.mkdir('public/lib', { recursive: true });
  for (const f of await fs.readdir('src')) await fs.copyFile('src/' + f, 'public/' + f);
  await fs.writeFile('public/sw.js', (await fs.readFile('src/sw.js', 'utf8')).replace('__BUILD__', Date.now().toString(36)));
  for (const f of ['geo.json', 'filings.json', 'changes.json', 'market.json', 'area.json']) { try { await fs.copyFile(D + f, 'public/data/' + f); } catch (e) { log('assemble: no', f); } }
  for (const f of ['taxonomy.mjs', 'filter.mjs', 'changes.mjs', 'agent-tools.mjs', 'assist-logic.mjs', 'nasa.mjs', 'height.mjs', 'sectors.mjs', 'nearby.mjs', 'reports.mjs', 'demographics.mjs', 'spending.mjs', 'nibrs.mjs', 'rulebook.mjs']) await fs.copyFile('lib/' + f, 'public/lib/' + f);
  // public Supabase settings for the browser (read-only publishable key; row level security limits it to public tables)
  const E = process.env, sbUrl = E.SUPABASE_URL || E.NEXT_PUBLIC_SUPABASE_URL || 'https://ytsxkipkobvcgysylfzc.supabase.co';
  const sbKey = E.SUPABASE_PUBLISHABLE_KEY || E.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || E.SUPABASE_ANON_KEY || E.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  await fs.writeFile('public/config.json', JSON.stringify(sbKey ? { supabase: { url: sbUrl.replace(/\/$/, ''), key: sbKey } } : {}));
  log('assemble: supabase config', sbKey ? 'on (' + sbUrl + ')' : 'off (no publishable key in env)');
  log('assembled public/');
}

async function refresh() {
  const regions = await readJSON(D + 'regions.json');
  await fs.mkdir(C, { recursive: true });
  const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
  const counties = regions.counties.filter(c => !ONLY.length || ONLY.includes(c.name));
  const now = new Date();
  const endD = process.env.PERIOD_END ? new Date(process.env.PERIOD_END) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const startD = process.env.PERIOD_START ? new Date(process.env.PERIOD_START) : new Date(Date.UTC(endD.getUTCFullYear(), endD.getUTCMonth() - (regions.months - 1), 1));
  log('period', iso(startD), '→', iso(endD), '|', counties.map(c => c.name).join(', '));

  // geometry (rebuilt only when regions change)
  const GEO_V = 2; // bump to rebuild geo.json (2: TIGER/Line county outlines)
  const rHash = hash(JSON.stringify(regions) + GEO_V);
  let geo = await readJSON(D + 'geo.json');
  if (!geo || geo._regions !== rHash || process.env.REBUILD_GEO) { geo = { ...(await buildGeo(regions)), _regions: rHash }; await fs.writeFile(D + 'geo.json', JSON.stringify(geo)); }

  // 1. TABS list
  let rows = [];
  for (const c of counties) { const r = await listCounty(c.name, c.tabsId, startD, endD); log(c.name, r.length); rows = rows.concat(r); }
  const seen = new Set(); rows = rows.filter(r => !seen.has(r.ProjectNumber) && seen.add(r.ProjectNumber));
  const prevFile = await readJSON(D + 'filings.json', { filings: [] });
  const prevHere = prevFile.filings.filter(f => counties.some(c => c.name === f.county));
  if (prevHere.length > 200 && rows.length < prevHere.length * 0.5 && !process.env.ALLOW_SHRINK) throw new Error(`TABS returned ${rows.length} filings vs ${prevHere.length} last run; refusing to overwrite (set ALLOW_SHRINK=1 to force)`);

  // 2. detail pages (cached)
  const tabsCache = await readJSON(C + 'tabs.json', {});
  await details(rows, tabsCache);
  rows.forEach(r => { const pc = parseCity(r.cityLine || ''); r.city = pc.city; r.zip = pc.zip; r.st = cleanStreet(r.street || ''); });

  // 3. geocoding (cached)
  const geoCache = await readJSON(C + 'geocode.json', {});
  const outlines = Object.fromEntries(geo.counties.map(c => [c.name, { type: 'MultiPolygon', coordinates: c.outline }]));
  const loc = await geocodeRows(rows, geoCache, { key: KEY, bbox: regions.bbox, places: geo.places, check: countyCheck(outlines), budget: { nominatim: +(process.env.NOMINATIM_MAX || 2500) } });

  // 4. AI enrichment (cached)
  const aiCache = await readJSON(C + 'ai.json', {});
  try { await enrich(rows, aiCache); } catch (e) { log('enrich stopped:', e.message); }

  // 5. compact filings
  const cg = outlines;
  const inBox = c => c && c[0] > regions.bbox[0] && c[0] < regions.bbox[2] && c[1] > regions.bbox[1] && c[1] < regions.bbox[3];
  const fresh = rows.filter(r => inBox(loc[r.ProjectNumber]?.c)).map(r => toFiling(r, loc[r.ProjectNumber], aiFields(r, aiCache), cg[r._county]));
  const other = prevFile.filings.filter(f => !counties.some(c => c.name === f.county));
  const filings = fresh.concat(other).sort((a, b) => b.cost - a.cost);
  log('mapped', fresh.length, 'of', rows.length, '| approx', fresh.filter(f => f.approx).length, '| enriched', fresh.filter(f => f.use).length);

  // 6. change feed
  const items = diff(prevHere, fresh);
  const feed = appendRun(await readJSON(D + 'changes.json'), { built: now.toISOString(), items });
  log('changes', items.length);

  // 7. market context (best effort)
  let market = null;
  try { market = await buildMarket(regions, await readJSON(D + 'market.json')); }
  catch (e) { log('market skipped:', e.message); market = await readJSON(D + 'market.json'); }

  // 8. area context: jobs (LODES), housing permits, new businesses, area news (best effort, see build/area.mjs)
  if (!ONLY.length || process.env.AREA) {
    try {
      const prev = await readJSON(D + 'area.json', {}), prevJobs = await readJSON(C + 'jobs.json');
      const area = await buildArea(regions, filings, { ...prev, jobs: prevJobs });
      if (area.jobs) { await fs.writeFile(C + 'jobs.json', JSON.stringify(area.jobs)); market = mergeJobs(market, area.jobs); area.jobs = { year: area.jobs.year, baseYear: area.jobs.baseYear }; }
      await fs.writeFile(D + 'area.json', JSON.stringify(area));
    } catch (e) { log('area skipped:', e.message); }
  }
  // 9. modeled consumer spending per tract: ACS income brackets × BLS Consumer Expenditure Survey (best effort)
  if (market?.tracts?.some(t => Array.isArray(t.ib))) {
    try { const ce = await buildCE(await readJSON(C + 'ce.json')); await fs.writeFile(C + 'ce.json', JSON.stringify(ce)); market = mergeSpending(market, ce); log('spending:', market.spendTracts, 'tracts, CE', ce.year); }
    catch (e) { log('spending skipped:', e.message); }
  }
  if (market) await fs.writeFile(D + 'market.json', JSON.stringify(market));

  // write data + caches (caches pruned to filings still in the window)
  const live = new Set(rows.map(r => r.ProjectNumber)), liveAi = new Set(rows.map(aiKey));
  for (const k of Object.keys(tabsCache)) if (!live.has(k) && !ONLY.length) delete tabsCache[k];
  for (const k of Object.keys(aiCache)) if (!liveAi.has(k) && !ONLY.length) delete aiCache[k];
  await writeMap(C + 'tabs.json', tabsCache); await writeMap(C + 'geocode.json', geoCache); await writeMap(C + 'ai.json', aiCache);
  await writeRows(D + 'filings.json', { period: { start: iso(startD), end: iso(endD) }, built: now.toISOString(), unmapped: rows.length - fresh.length }, 'filings', filings);
  await fs.writeFile(D + 'changes.json', JSON.stringify(feed));

  // optional weekly digest to a Zapier catch hook
  if (process.env.ZAPIER_DIGEST_WEBHOOK && items.length) {
    const byId = Object.fromEntries(filings.map(f => [f.id, f])), nu = items.filter(x => x.k === 'new').map(x => byId[x.id]).filter(Boolean).sort((a, b) => b.cost - a.cost);
    try { await fetchRetry(process.env.ZAPIER_DIGEST_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      built: now.toISOString(), newCount: nu.length, newValue: nu.reduce((s, f) => s + f.cost, 0), changed: items.length - nu.length,
      top: nu.slice(0, 15).map(f => ({ id: f.id, name: f.name, county: f.county, city: f.city, type: f.type, use: f.use || '', cost: f.cost, start: f.ts, link: 'https://www.tdlr.texas.gov/TABS/Projects/' + f.id })) }) }, 2); log('digest posted'); }
    catch (e) { log('digest failed:', e.message); }
  }
}

const assembleOnly = process.argv.includes('--assemble');
(assembleOnly ? assemble() : refresh().then(assemble)).catch(e => { console.error(e); process.exit(1); });
