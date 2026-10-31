// Building permits from public open-data portals nationwide -> Supabase dev_items (kind 'permit', one source per portal
// dataset), the same table, map layer, property card and MCP tools as Harris County's permits. Sources and any field
// overrides: data/permit-sources.json; fields are otherwise matched by name (lib/permitsources.mjs autoMap).
// Streams each dataset page by page and writes only rows that are new or changed (by hash), so a full reload of a
// multi-million-row city sends little after the first night. Rows a portal drops are kept (permits are history).
// Env:
//   ONLY=slug,slug            just these sources (default: every enabled source)
//   SHARD=i/n                 this job's share of the sources (the workflow runs several at once)
//   SINCE_DAYS=45             only permits issued or applied for in the last N days (the nightly run); unset = everything
//   MAX_ROWS                  stop each source after this many rows (tests)
//   SOCRATA_APP_TOKEN         optional: Socrata's higher rate limit
//   GEOCODE_MAX=50000         rows without a point placed by address per source per run (US Census batch geocoder,
//                             newest first; the rest wait for the next run). 0 = skip.
//   DRY=1                     read and map, write nothing
import fs from 'node:fs';
import { supa } from '../lib/supa.mjs';
import { autoMap, rowFrom, parseCensusBatch } from '../lib/permitsources.mjs';
import { rowHash } from '../lib/countydata.mjs';
import { hash, sleep } from './util.mjs';

const E = process.env, DRY = !!E.DRY, log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const SOURCES = JSON.parse(fs.readFileSync(new URL('../data/permit-sources.json', import.meta.url), 'utf8')).sources.filter(s => s.enabled !== false);
const ONLY = E.ONLY ? E.ONLY.split(',').map(x => x.trim()).filter(Boolean) : null;
const [SI, SN] = (E.SHARD || '0/1').split('/').map(Number);
const SINCE = E.SINCE_DAYS ? new Date(Date.now() - +E.SINCE_DAYS * 864e5).toISOString().slice(0, 10) : null;
const MAX = +(E.MAX_ROWS || 0) || Infinity;
const LOAD = new Date().toISOString().replace(/\D/g, '').slice(0, 17) + '-' + process.pid;
const COLS = ['id', 'kind', 'source', 'county', 'name', 'cat', 'status', 'day', 'amount', 'units', 'addr', 'attrs', 'lon', 'lat', 'shape_json', 'h', 'load_id'];
const UA = { 'User-Agent': 'FinishesSolutions-RE-Intelligence/1.0 (permit data; github actions)', ...(E.SOCRATA_APP_TOKEN ? { 'X-App-Token': E.SOCRATA_APP_TOKEN } : {}) };
const db = DRY ? null : supa();
if (!DRY && !db) { console.error('SUPABASE_URL and SUPABASE_SECRET_KEY are needed (or DRY=1)'); process.exit(1); }

async function getJSON(url, { timeout = 180000, tries = 5 } = {}) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeout) }), t = await r.text();
      if (r.ok) { const d = JSON.parse(t); if (d && d.error && !Array.isArray(d)) throw new Error(JSON.stringify(d.error).slice(0, 200)); return d; }
      if (r.status < 500 && r.status !== 429) throw Object.assign(new Error(r.status + ' ' + t.slice(0, 200)), { fatal: true });
      if (i >= tries - 1) throw new Error(r.status + ' ' + t.slice(0, 200));
    } catch (e) { if (e.fatal || i >= tries - 1) throw e; }
    await sleep(2000 * 2 ** i);
  }
}

// ---------- readers: each yields pages of records ----------
async function socrataFields(src) {
  const v = await getJSON('https://' + src.domain + '/api/views/' + src.id + '.json', { timeout: 60000 });
  return (v.columns || []).map(c => ({ name: c.fieldName, type: c.dataTypeName }));
}
async function* socrataPages(src, map) {
  const base = 'https://' + src.domain + '/resource/' + src.id + '.json', page = 50000;
  const dateField = map.issued || map.applied;
  const where = [src.where, SINCE && dateField ? dateField + " >= '" + SINCE + "T00:00:00'" : null].filter(Boolean).join(' AND ');
  for (let off = 0; off < MAX; off += page) {
    const q = new URLSearchParams({ $select: ':id,*', $order: ':id', $limit: String(Math.min(page, MAX - off)), $offset: String(off), ...(where ? { $where: where } : {}) });
    const rows = await getJSON(base + '?' + q); if (!rows.length) break;
    yield rows; if (rows.length < page) break;
  }
}
async function arcMeta(src) { return getJSON(src.url + '?f=json', { timeout: 60000 }); }
async function* arcPages(src, map, meta) {
  const oid = meta.objectIdField || (meta.fields || []).find(f => f.type === 'esriFieldTypeOID')?.name || 'OBJECTID';
  const page = Math.min(meta.maxRecordCount || 1000, 2000), dateField = map.issued || map.applied;
  const extra = [src.where, SINCE && dateField ? dateField + " >= DATE '" + SINCE + "'" : null].filter(Boolean);
  let last = -1, n = 0;
  while (n < MAX) {
    const q = new URLSearchParams({ f: 'json', where: [oid + ' > ' + last, ...extra].join(' AND '), outFields: '*', returnGeometry: 'true', outSR: '4326', orderByFields: oid, resultRecordCount: String(page) });
    const d = await getJSON(src.url + '/query?' + q); const f = d.features || []; if (!f.length) break;
    last = Math.max(...f.map(x => +x.attributes[oid]).filter(Number.isFinite)); n += f.length;
    yield f; if (!Number.isFinite(last)) break;
  }
}

// ---------- writing ----------
async function oldHashes(slug) {
  const old = new Map(); if (!db) return old;
  for (let after = ''; ;) { const pg = await db.rpc('dev_hashes', { p_source: slug, p_after: after, p_n: 50000 }), ks = Object.keys(pg); for (const k of ks) old.set(k, pg[k]); if (ks.length < 50000) break; after = ks.sort().pop(); }
  return old;
}
async function loadSource(src) {
  const t0 = Date.now();
  let fields, meta = null;
  if (src.via === 'socrata') fields = await socrataFields(src);
  else { meta = await arcMeta(src); fields = (meta.fields || []).map(f => ({ name: f.name, type: String(f.type).replace('esriFieldType', '') })); }
  const map = { ...autoMap(fields), ...(src.map || {}), oid: meta?.objectIdField || (meta?.fields || []).find(f => f.type === 'esriFieldTypeOID')?.name || null };
  if (!map.issued && !map.applied && !map.final && !map.year) throw new Error('no date field among ' + fields.map(f => f.name).join(', ').slice(0, 300));
  log(src.slug, 'fields', JSON.stringify(map));
  const old = SINCE ? new Map() : await oldHashes(src.slug), seen = new Set();
  let read = 0, kept = 0, written = 0, placed = 0;
  const pages = src.via === 'socrata' ? socrataPages(src, map) : arcPages(src, map, meta);
  for await (const recs of pages) {
    read += recs.length; const out = [];
    for (const rec of recs) {
      const r = rowFrom(src, map, rec); if (!r || seen.has(r.id)) continue; seen.add(r.id); kept++; if (r.lon != null) placed++;
      r.load_id = LOAD; r.h = rowHash(r, hash);
      if (old.get(r.id) === r.h) continue;
      const o = {}; for (const k of COLS) o[k] = r[k] ?? null; o.attrs = Object.fromEntries(Object.entries(r.attrs || {}).filter(([, v]) => v != null && v !== '')); out.push(o);
    }
    if (DRY && !written && out[0]) log(src.slug, 'sample', JSON.stringify(out[0]).slice(0, 700));
    if (db) for (let i = 0; i < out.length; i += 1000) await db.upsert('dev_items', out.slice(i, i + 1000), 'id', 1000);
    written += out.length;
    if (read % 200000 < recs.length) log(src.slug, 'read', read, 'kept', kept, 'written', written);
  }
  const res = { source: src.slug, read, rows: kept, written, placed, since: SINCE, sec: Math.round((Date.now() - t0) / 1000) };
  if (db) await db.upsert('county_loads', [{ source: src.slug, at: new Date().toISOString(), load_id: LOAD, rows: kept, written, removed: 0, status: 'ok', note: (src.place || '') + ', ' + (src.state || '') + (SINCE ? ' (since ' + SINCE + ')' : ''), url: src.via === 'socrata' ? 'https://' + src.domain + '/d/' + src.id : src.url, etag: null, modified: null }], 'source');
  return res;
}

// ---------- placing rows without a point: the US Census batch geocoder (free, 10,000 addresses a request) ----------
const GEOCODE_MAX = E.GEOCODE_MAX != null ? +E.GEOCODE_MAX : 50000;
const csvCell = v => '"' + String(v ?? '').replace(/"/g, "'").replace(/[\r\n,]+/g, ' ').trim() + '"';
async function censusBatch(rows) {
  const csv = rows.map(r => [r.i, r.street, r.city, r.state, r.zip].map(csvCell).join(',')).join('\n');
  const fd = new FormData(); fd.append('addressFile', new Blob([csv], { type: 'text/csv' }), 'a.csv'); fd.append('benchmark', 'Public_AR_Current');
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch('https://geocoding.geo.census.gov/geocoder/locations/addressbatch', { method: 'POST', body: fd, headers: { 'User-Agent': UA['User-Agent'] }, signal: AbortSignal.timeout(900000) }); if (r.ok) return parseCensusBatch(await r.text()); }
    catch (e) { if (i === 3) throw e; }
    await sleep(15000 * (i + 1));
  }
  return new Map();
}
async function geocodeMissing(src) {
  if (!db || !GEOCODE_MAX) return null;
  let done = 0, placed = 0;
  while (done < GEOCODE_MAX) {
    const rows = await db.select('dev_items', 'select=id,addr,attrs&source=eq.' + encodeURIComponent(src.slug) + '&lon=is.null&addr=not.is.null&attrs->>geocode=is.null&order=day.desc&limit=' + Math.min(10000, GEOCODE_MAX - done));
    if (!rows.length) break;
    const ask = rows.map((r, i) => ({ i: String(i), id: r.id, street: r.addr, city: src.place && !/county|region/i.test(src.place) ? src.place : r.attrs?.place || '', state: src.state || r.attrs?.state || '', zip: r.attrs?.zip || '' }));
    const got = await censusBatch(ask), pts = [];
    for (const a of ask) { const p = got.get(a.i); pts.push({ id: a.id, lon: p ? p[0] : null, lat: p ? p[1] : null, miss: !p }); }
    await db.rpc('dev_set_points', { p_rows: pts });
    done += rows.length; placed += pts.filter(p => !p.miss).length;
    log(src.slug, 'geocoded', done, 'placed', placed);
    if (rows.length < 10000) break;
  }
  return { geocoded: done, placed };
}

const mine = SOURCES.filter((s, i) => (ONLY ? ONLY.includes(s.slug) : true) && (ONLY || i % SN === SI));
log('sources', mine.length, 'of', SOURCES.length, SINCE ? 'since ' + SINCE : 'full', 'shard', SI + '/' + SN);
const failed = [];
for (const src of mine) {
  try { const res = await loadSource(src); if (res.rows > res.placed) res.geocode = await geocodeMissing(src); log(src.slug, 'done', JSON.stringify(res)); }
  catch (e) {
    failed.push(src.slug); log(src.slug, 'FAILED', e.message);
    if (db) await db.upsert('county_loads', [{ source: src.slug, at: new Date().toISOString(), status: 'failed', note: String(e.message).slice(0, 300) }], 'source').catch(() => {});
  }
}
log('finished', JSON.stringify({ sources: mine.length, failed }));
if (mine.length && failed.length === mine.length) process.exit(1);
