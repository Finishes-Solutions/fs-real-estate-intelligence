// Statewide TDLR TABS -> Supabase. Runs in GitHub Actions (.github/workflows/statewide.yml).
//   MODE=backfill  counties not yet done (todo / error / interrupted), highest priority first, until TIME_BUDGET_MIN
//   MODE=recent    re-list the last RECENT_MONTHS for every county and record what changed (nightly)
//   MODE=auto      backfill while any county is pending, otherwise recent (3 months; 24 on Sundays)
// Optional: MAX_COUNTIES=n (stop after n counties), COUNTIES="Harris,Dallas" (only these, any status), PERIOD_START=YYYY-MM-DD (backfill start; default 5 years back).
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { log, iso, readJSON } from './util.mjs';
import { listCounty, details } from './tabs.mjs';
import { geocodeRows, cleanStreet, parseCity, addrKey } from './geocode.mjs';
import { enrich, aiFields, aiKey } from './enrich.mjs';
import { diff } from './changes.mjs';
import { toFiling, toRow } from './compact.mjs';
import { texasCounties, texasPlaces, TX_BBOX } from './texas.mjs';
import { supa } from '../lib/supa.mjs';

const HOME = ['Waller', 'Harris', 'Fort Bend', 'Montgomery', 'Austin', 'Washington', 'Grimes'];
const METROS = ['Dallas', 'Tarrant', 'Bexar', 'Travis', 'Collin', 'Denton', 'Williamson', 'Galveston', 'Brazoria', 'Hays', 'El Paso', 'Hidalgo', 'Comal', 'Guadalupe',
  'Ellis', 'Kaufman', 'Rockwall', 'Johnson', 'Parker', 'Liberty', 'Chambers', 'Bell', 'McLennan', 'Brazos', 'Lubbock', 'Nueces', 'Cameron', 'Webb', 'Midland', 'Ector',
  'Smith', 'Jefferson', 'Potter', 'Randall', 'Bastrop', 'Hunt', 'Grayson', 'Taylor', 'Tom Green', 'Wichita', 'Gregg', 'Victoria'];
const KEY = process.env.MAPTILER_KEY || 'vA28jXazwpYesC2b1Ccp';
const DATA = process.env.DATA_DIR || 'data/';
const BUDGET_MIN = +(process.env.TIME_BUDGET_MIN || 270);
const t0 = Date.now(), minutes = () => (Date.now() - t0) / 6e4;
const gkey = k => createHash('sha1').update(k).digest('hex');
const SLICE = 1000;

const db = supa();
if (!db) { console.error('SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set'); process.exit(1); }

function period(mode) {
  const now = new Date(), end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  if (mode === 'recent') {
    const months = +(process.env.RECENT_MONTHS || (now.getUTCDay() === 0 ? 24 : 3));
    return [new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (months - 1), 1)), end];
  }
  return [process.env.PERIOD_START ? new Date(process.env.PERIOD_START) : new Date(Date.UTC(end.getUTCFullYear() - 5, end.getUTCMonth(), 1)), end];
}

// counties table + one-time import of the regional git caches
async function seed() {
  const have = await db.select('counties', 'select=fips');
  if (have.length < 254) {
    const cs = await texasCounties();
    const pri = n => { const h = HOME.indexOf(n), m = METROS.indexOf(n); return h >= 0 ? h + 1 : m >= 0 ? 100 + m : 1000; };
    await db.upsert('counties', cs.map(c => ({ ...c, priority: pri(c.name) })), 'fips', 50);
    log('seeded', cs.length, 'counties');
  }
  if (!(await db.select('tabs_cache', 'select=k&limit=1')).length) {
    const t = await readJSON(DATA + 'cache/tabs.json', {}), g = await readJSON(DATA + 'cache/geocode.json', {}), a = await readJSON(DATA + 'cache/ai.json', {});
    await db.cachePut('tabs_cache', t);
    await db.cachePut('geocode_cache', Object.fromEntries(Object.entries(g).map(([k, v]) => [gkey(k), v])));
    await db.cachePut('ai_cache', a);
    log('imported regional caches: tabs', Object.keys(t).length, 'geocode', Object.keys(g).length, 'ai', Object.keys(a).length);
  }
}

async function processCounty(c, [startD, endD], mode, ctx) {
  const t = Date.now();
  await db.update('counties', 'fips=eq.' + c.fips, { status: mode === 'recent' ? c.status : 'running', updated_at: new Date().toISOString() });
  let rows = await listCounty(c.name, c.tabs_id, startD, endD);
  const seen = new Set(); rows = rows.filter(r => !seen.has(r.ProjectNumber) && seen.add(r.ProjectNumber));
  log(`${c.name}: ${rows.length} filings ${iso(startD)} → ${iso(endD)}`);

  // detail pages: cached in the database, saved every SLICE rows so an interrupted run keeps its work
  const tabsCache = await db.cacheGet('tabs_cache', rows.map(r => r.ProjectNumber));
  for (let i = 0; i < rows.length; i += SLICE) {
    const part = rows.slice(i, i + SLICE);
    const stamp = Object.fromEntries(part.map(r => [r.ProjectNumber, tabsCache[r.ProjectNumber]]));
    await details(part, tabsCache, ctx.detailConcurrency);
    const fresh = Object.fromEntries(part.filter(r => tabsCache[r.ProjectNumber] && tabsCache[r.ProjectNumber] !== stamp[r.ProjectNumber]).map(r => [r.ProjectNumber, tabsCache[r.ProjectNumber]]));
    if (Object.keys(fresh).length) await db.cachePut('tabs_cache', fresh);
  }
  rows.forEach(r => { const pc = parseCity(r.cityLine || ''); r.city = pc.city; r.zip = pc.zip; r.st = cleanStreet(r.street || ''); r._county = c.name; });

  // geocoding
  const keys = [...new Set(rows.filter(r => r.st && r.city).map(addrKey))];
  const stored = await db.cacheGet('geocode_cache', keys.map(gkey)), geoCache = {};
  for (const k of keys) if (stored[gkey(k)]) geoCache[k] = stored[gkey(k)];
  const snap = JSON.stringify(geoCache);
  const loc = await geocodeRows(rows, geoCache, { key: KEY, bbox: TX_BBOX, places: ctx.places, budget: ctx.budget });
  const was = JSON.parse(snap), newGeo = {};
  for (const k of keys) if (geoCache[k] && JSON.stringify(geoCache[k]) !== JSON.stringify(was[k])) newGeo[gkey(k)] = geoCache[k];
  if (Object.keys(newGeo).length) await db.cachePut('geocode_cache', newGeo);

  // wrong-county guard: the derived TDLR county id must actually return this county's filings
  const outline = c.outline, exact = rows.filter(r => loc[r.ProjectNumber]?.src === 'address');
  const filings = rows.map(r => toFiling(r, loc[r.ProjectNumber], null, outline, { fullScope: true }));
  const off = filings.filter(f => f.misfiled && !f.approx).length;
  if (exact.length >= 20 && off / exact.length > 0.4) throw new Error(`${off} of ${exact.length} geocoded filings fall outside ${c.name}; TDLR county id ${c.tabs_id} may be wrong`);

  // AI enrichment (cached by filing content), saved per chunk
  const aiCache = await db.cacheGet('ai_cache', rows.map(aiKey));
  const ai = await enrich(rows, aiCache, { onSave: got => db.cachePut('ai_cache', got) });
  if (ai) { ctx.tokensIn += ai.tokensIn; ctx.tokensOut += ai.tokensOut; if (ai.sent) log(`${c.name}: AI tokens per filing in ${Math.round(ai.tokensIn / ai.sent)} out ${Math.round(ai.tokensOut / ai.sent)}`); }

  const out = rows.map(r => toFiling(r, loc[r.ProjectNumber], aiFields(r, aiCache), outline, { fullScope: true }));

  // change history (nightly mode): compare with what the database had for this window
  let items = [];
  if (mode === 'recent') {
    const prev = (await db.selectAll('filings', `select=id,name,county,cost,status,est_start,est_end,sqft,reg&fips=eq.${c.fips}&reg=gte.${iso(startD)}`))
      .map(p => ({ ...p, start: p.est_start || '', end: p.est_end || '' }));
    items = diff(prev, out.map(f => ({ ...f, start: f.start || '', end: f.end || '' })), { firstRun: false });
    if (items.length) await db.insert('changes', items.map(x => ({ run_at: ctx.runAt, filing_id: x.id, kind: x.k, label: x.label || null, from_v: x.from == null ? null : String(x.from), to_v: x.to == null ? null : String(x.to) })));
  }

  await db.upsert('filings', out.map((f, i) => toRow(f, rows[i], c.fips)), 'id', 250);
  const mapped = out.filter(f => f.lat != null).length;
  const patch = { filings: mode === 'recent' ? c.filings : out.length, mapped: mode === 'recent' ? c.mapped : mapped, updated_at: new Date().toISOString(), error: null };
  if (mode !== 'recent') Object.assign(patch, { status: 'done', period_start: iso(startD), period_end: iso(endD) });
  await db.update('counties', 'fips=eq.' + c.fips, patch);
  ctx.filings += out.length;
  log(`${c.name}: done in ${((Date.now() - t) / 6e4).toFixed(1)} min | mapped ${mapped}/${out.length} (approx ${out.filter(f => f.approx).length}) | enriched ${out.filter(f => f.use).length} | changes ${items.length}`);
}

async function main() {
  await seed();
  const only = (process.env.COUNTIES || '').split(',').map(s => s.trim()).filter(Boolean);
  const all = await db.selectAll('counties', 'select=fips,name,tabs_id,outline,status,priority,filings,mapped&order=priority.asc,name.asc');
  const pending = all.filter(c => c.status !== 'done');
  let mode = process.env.MODE || 'auto';
  if (mode === 'auto') mode = pending.length ? 'backfill' : 'recent';
  let queue = only.length ? all.filter(c => only.includes(c.name)) : mode === 'recent' ? all : pending;
  if (only.length && queue.length !== only.length) log('unknown county names:', only.filter(n => !all.some(c => c.name === n)).join(', '));
  const per = period(mode);
  const run = await db.insertOne('runs', { kind: mode });
  const ctx = { runAt: new Date().toISOString(), places: await texasPlaces(), budget: { nominatim: +(process.env.NOMINATIM_MAX || 2500) },
    detailConcurrency: +(process.env.DETAIL_CONCURRENCY || 8), tokensIn: 0, tokensOut: 0, filings: 0 };
  log(`mode ${mode} | ${queue.length} counties queued | period ${iso(per[0])} → ${iso(per[1])} | budget ${BUDGET_MIN} min`);

  let done = 0, failed = 0, fatal = null;
  for (const c of queue) {
    if (minutes() > BUDGET_MIN) { log('time budget reached'); break; }
    if (done + failed >= +(process.env.MAX_COUNTIES || Infinity)) { log('MAX_COUNTIES reached'); break; }
    c.outline = c.outline && c.outline.coordinates ? c.outline : null;
    try { await processCounty(c, per, mode, ctx); done++; }
    catch (e) {
      failed++; log(`${c.name}: FAILED ${e.message}`);
      await db.update('counties', 'fips=eq.' + c.fips, { status: mode === 'recent' ? c.status : 'error', error: String(e.message).slice(0, 500), updated_at: new Date().toISOString() }).catch(() => {});
      if (/OpenAI rejected the API key|supabase/i.test(e.message)) { fatal = e; break; }
    }
  }
  const left = (await db.select('counties', 'select=fips&status=neq.done')).length;
  await db.update('runs', 'id=eq.' + run.id, { finished_at: new Date().toISOString(), counties: done, filings: ctx.filings, tokens_in: ctx.tokensIn, tokens_out: ctx.tokensOut,
    notes: `${mode}; failed ${failed}; ${left} counties not done` });
  log(`run finished: ${done} counties, ${failed} failed, ${ctx.filings} filings, AI tokens in ${ctx.tokensIn} out ${ctx.tokensOut}, ${left} counties left, ${minutes().toFixed(0)} min`);
  // keep chaining only while counties are left that aren't all failing
  const remaining = mode === 'backfill' && !only.length && done > 0 ? left : 0;
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `remaining=${remaining}\n`);
  if (fatal) throw fatal;
}

main().catch(e => { console.error(e); process.exit(1); });
