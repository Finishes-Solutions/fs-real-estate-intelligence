// Statewide TDLR TABS -> Supabase. Runs in GitHub Actions (.github/workflows/statewide.yml).
//   MODE=backfill  counties not yet done (todo / error / interrupted), highest priority first, until TIME_BUDGET_MIN
//   MODE=recent    re-list the last RECENT_MONTHS for every county and record what changed (nightly)
//   MODE=auto      backfill while any county is pending, otherwise recent (3 months; 24 on Sundays)
// Optional: MAX_COUNTIES=n (stop after n counties), COUNTIES="Harris,Dallas" (only these, any status), PERIOD_START=YYYY-MM-DD (backfill start; default 3 years back),
//   DB_MAX_MB (default 450: stop before the free-tier 500 MB database limit).
// Storage is lean for the free tier: each filings row carries its raw TDLR detail (detail jsonb) and the key of its AI
// tags (ai_key), so the rows themselves are the cache; only geocodes have a separate cache table.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { log, iso, readJSON } from './util.mjs';
import { listCounty, details } from './tabs.mjs';
import { geocodeRows, cleanStreet, parseCity, addrKey } from './geocode.mjs';
import { enrich, aiFields, aiKey } from './enrich.mjs';
import { diff } from './changes.mjs';
import { geoContains } from 'd3-geo';
import { minVertexDist } from './geometry.mjs';
import { toFiling, toRow, countyCheck } from './compact.mjs';
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
const SLICE = 1000, SCOPE_MAX = 1500, DB_MAX = +(process.env.DB_MAX_MB || 450) * 2 ** 20;
const AI_COLS = ['use', 'subtype', 'tenant', 'developer', 'architect', 'gc', 'units', 'summary'];

const db = supa();
if (!db) { console.error('SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set'); process.exit(1); }
{ // say which kind of key we were given: writes need the secret / service-role key, not the public one
  const k = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  let kind = k ? 'unknown' : 'none (GitHub OIDC via the pipeline edge function)';
  if (k.startsWith('sb_secret_')) kind = 'secret key'; else if (k.startsWith('sb_publishable_')) kind = 'PUBLISHABLE key (read-only: writes will fail)';
  else if (k.startsWith('eyJ')) { try { kind = 'legacy JWT, role ' + JSON.parse(Buffer.from(k.split('.')[1], 'base64url').toString()).role; } catch (e) {} }
  log('supabase:', process.env.SUPABASE_URL, '| key:', kind);
  if (/PUBLISHABLE|role anon/.test(kind)) { console.error('The Supabase key in GitHub secrets is the public one. Add the secret key (Project Settings → API Keys → Secret keys) as SUPABASE_SECRET_KEY.'); process.exit(1); }
}

function period(mode) {
  const now = new Date(), end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  if (mode === 'recent') {
    const months = +(process.env.RECENT_MONTHS || (now.getUTCDay() === 0 ? 24 : 3));
    return [new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (months - 1), 1)), end];
  }
  return [process.env.PERIOD_START ? new Date(process.env.PERIOD_START) : new Date(Date.UTC(end.getUTCFullYear() - 3, end.getUTCMonth(), 1)), end];
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
  // the regional build's caches (7 home counties) save re-fetching and re-tagging those filings
  const t = await readJSON(DATA + 'cache/tabs.json', {}), g = await readJSON(DATA + 'cache/geocode.json', {}), a = await readJSON(DATA + 'cache/ai.json', {});
  log('regional caches: tabs', Object.keys(t).length, 'geocode', Object.keys(g).length, 'ai', Object.keys(a).length);
  return { tabs: t, geo: g, ai: a };
}

// yearly windows, newest first, so each year is saved as soon as it is done
function windows([startD, endD]) {
  const out = []; let e = endD;
  while (e >= startD) { const s0 = new Date(Date.UTC(e.getUTCFullYear() - 1, e.getUTCMonth(), e.getUTCDate() + 1)); out.push([s0 < startD ? startD : s0, e]); e = new Date(s0.getTime() - 864e5); }
  return out;
}

async function processCounty(c, per, mode, ctx) {
  const t = Date.now(), outline = c.outline;
  await db.update('counties', 'fips=eq.' + c.fips, { status: mode === 'recent' ? c.status : 'running', updated_at: new Date().toISOString() });
  // what the database already has for this county doubles as the detail / AI cache
  const existing = await db.selectAll('filings', 'select=id,name,county,cost,status,est_start,est_end,sqft,reg,detail,ai_key,' + AI_COLS.join(',') + '&fips=eq.' + c.fips);
  const tabsCache = {}, aiCache = {};
  for (const e of existing) {
    if (e.detail) tabsCache[e.id] = e.detail;
    if (e.ai_key && e.use) aiCache[e.ai_key] = Object.fromEntries(AI_COLS.map(k => [k, e[k] ?? (k === 'units' ? null : '')]));
  }
  const seen = new Set(); let total = 0, mapped = 0, approx = 0, enriched = 0, nChanges = 0;
  for (const [ws, we] of mode === 'recent' ? [per] : windows(per)) {
    let rows = (await listCounty(c.name, c.tabs_id, ws, we)).filter(r => !seen.has(r.ProjectNumber) && seen.add(r.ProjectNumber));
    log(`${c.name}: ${rows.length} filings ${iso(ws)} → ${iso(we)}`);
    if (!rows.length) continue;
    for (const r of rows) { const g = ctx.git.tabs[r.ProjectNumber]; if (!tabsCache[r.ProjectNumber] && g) tabsCache[r.ProjectNumber] = g; }
    for (let i = 0; i < rows.length; i += SLICE) await details(rows.slice(i, i + SLICE), tabsCache, ctx.detailConcurrency);
    rows.forEach(r => { const pc = parseCity(r.cityLine || ''); r.city = pc.city; r.zip = pc.zip; r.st = cleanStreet(r.street || ''); r._county = c.name; });

    // wrong-county guard: the filings' cities must mostly lie in or near this county (the TDLR county id is derived, not read)
    if (outline) {
      // a "city" that is just the county's own name ("Austin" in Austin County, "Houston" in Houston County) is the filer
      // writing the county, not the faraway city of that name, so it doesn't count either way
      const own = c.name.toLowerCase();
      const known = rows.filter(r => (r.city || '').toLowerCase() !== own).map(r => ctx.placeIdx.get((r.city || '').toLowerCase())).filter(Boolean);
      const far = known.filter(p => !geoContains(outline, p) && minVertexDist(outline, p) > 0.3).length;
      if (known.length >= 10 && far / known.length > 0.5) throw new Error(`${far} of ${known.length} filings are in cities far from ${c.name}; TDLR county id ${c.tabs_id} may be wrong`);
    }

    // geocoding (database cache + the regional cache)
    const keys = [...new Set(rows.filter(r => r.st && r.city).map(addrKey))];
    const stored = await db.cacheGet('geocode_cache', keys.map(gkey)), geoCache = {};
    for (const k of keys) { const v = stored[gkey(k)] || ctx.git.geo[k]; if (v) geoCache[k] = v; }
    const snap = JSON.stringify(geoCache);
    const loc = await geocodeRows(rows, geoCache, { key: KEY, bbox: TX_BBOX, places: ctx.places, budget: ctx.budget, check: countyCheck(outline ? { [c.name]: outline } : {}) });
    const was = JSON.parse(snap), newGeo = {};
    for (const k of keys) if (geoCache[k] && JSON.stringify(geoCache[k]) !== JSON.stringify(was[k])) newGeo[gkey(k)] = geoCache[k];
    if (Object.keys(newGeo).length) await db.cachePut('geocode_cache', newGeo);

    // AI enrichment (cached by filing content)
    for (const r of rows) { const k = aiKey(r); if (!aiCache[k] && ctx.git.ai[k]) aiCache[k] = ctx.git.ai[k]; }
    const ai = await enrich(rows, aiCache);
    if (ai) { ctx.tokensIn += ai.tokensIn; ctx.tokensOut += ai.tokensOut; if (ai.sent) log(`${c.name}: AI tokens per filing in ${Math.round(ai.tokensIn / ai.sent)} out ${Math.round(ai.tokensOut / ai.sent)}`); }

    const out = rows.map(r => toFiling(r, loc[r.ProjectNumber], aiFields(r, aiCache), outline, { fullScope: true }));

    // change history (nightly mode): compare with what the database had for this window
    if (mode === 'recent') {
      const prev = existing.filter(p => p.reg && p.reg >= iso(ws)).map(p => ({ ...p, start: p.est_start || '', end: p.est_end || '' }));
      const items = diff(prev, out.map(f => ({ ...f, start: f.start || '', end: f.end || '' })), { firstRun: false });
      if (items.length) await db.insert('changes', items.map(x => ({ run_at: ctx.runAt, filing_id: x.id, kind: x.k, label: x.label || null, from_v: x.from == null ? null : String(x.from), to_v: x.to == null ? null : String(x.to) })));
      nChanges += items.length;
    }

    await upsertFilings(out.map((f, i) => { const r = rows[i], d = tabsCache[r.ProjectNumber];
      return { ...toRow({ ...f, scope: (f.scope || '').slice(0, SCOPE_MAX) }, r, c.fips), ai_key: aiFields(r, aiCache) ? aiKey(r) : null,
        detail: d ? { ...d, scope: String(d.scope || '').slice(0, SCOPE_MAX) } : null }; }));
    total += out.length; mapped += out.filter(f => f.lat != null).length; approx += out.filter(f => f.approx).length; enriched += out.filter(f => f.use).length;
  }
  const patch = { updated_at: new Date().toISOString(), error: null };
  if (mode !== 'recent') Object.assign(patch, { status: 'done', filings: total, mapped, period_start: iso(per[0]), period_end: iso(per[1]) });
  await db.update('counties', 'fips=eq.' + c.fips, patch);
  ctx.filings += total;
  log(`${c.name}: done in ${((Date.now() - t) / 6e4).toFixed(1)} min | mapped ${mapped}/${total} (approx ${approx}) | enriched ${enriched} | changes ${nChanges}`);
}

// filings.cost is numeric(14,2) after migration 20261003000000_cost_cents.sql. On a database that still has the
// old bigint column, keep loading with whole dollars rather than failing the run.
let wholeDollars = false;
async function upsertFilings(rows) {
  const round = () => rows.map(r => ({ ...r, cost: Math.round(r.cost) }));
  try { await db.upsert('filings', wholeDollars ? round() : rows, 'id', 250); }
  catch (e) {
    if (wholeDollars || !/22P02|type bigint/.test(e.message)) throw e;
    wholeDollars = true; log('filings.cost is still a whole-dollar column: storing rounded costs. Run supabase/migrations/20261003000000_cost_cents.sql to keep cents.');
    await db.upsert('filings', round(), 'id', 250);
  }
}

async function main() {
  const git = await seed();
  const only = (process.env.COUNTIES || '').split(',').map(s => s.trim()).filter(Boolean);
  const all = await db.selectAll('counties', 'select=fips,name,tabs_id,outline,status,priority,filings,mapped&order=priority.asc,name.asc');
  const pending = all.filter(c => c.status !== 'done');
  let mode = process.env.MODE || 'auto';
  if (mode === 'auto') mode = pending.length ? 'backfill' : 'recent';
  let queue = only.length ? all.filter(c => only.includes(c.name)) : mode === 'recent' ? all : pending;
  if (only.length && queue.length !== only.length) log('unknown county names:', only.filter(n => !all.some(c => c.name === n)).join(', '));
  const per = period(mode);
  const run = await db.insertOne('runs', { kind: mode });
  const places = await texasPlaces();
  const ctx = { runAt: new Date().toISOString(), places, placeIdx: new Map(places.map(p => [p[0].toLowerCase(), [p[1], p[2]]])), budget: { nominatim: +(process.env.NOMINATIM_MAX || 2500) },
    detailConcurrency: +(process.env.DETAIL_CONCURRENCY || 8), tokensIn: 0, tokensOut: 0, filings: 0, git };
  log(`mode ${mode} | ${queue.length} counties queued | period ${iso(per[0])} → ${iso(per[1])} | budget ${BUDGET_MIN} min`);

  let done = 0, failed = 0, fatal = null, full = false;
  for (const c of queue) {
    const size = await db.rpc('db_size', {}).catch(() => null);
    if (size != null && (done + failed) % 5 === 0) log(`database size ${(size / 2 ** 20).toFixed(0)} MB of ${(DB_MAX / 2 ** 20).toFixed(0)} MB allowed`);
    if (size != null && size > DB_MAX) { log('database size limit reached; stopping (raise DB_MAX_MB after upgrading the plan)'); full = true; break; }
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
  const remaining = mode === 'backfill' && !only.length && done > 0 && !full ? left : 0;
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `remaining=${remaining}\n`);
  if (fatal) throw fatal;
}

main().catch(e => { console.error(e); process.exit(1); });
