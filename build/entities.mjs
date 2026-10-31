// State business-entity registries -> Supabase entities (supabase/migrations/20261031010000_entities.sql). Sources and
// their field maps: data/entity-sources.json. Streams each registry page by page and writes only new or changed rows (by
// hash); entities a registry drops are kept with their last status (registries rarely delete; they mark inactive).
// Readers: socrata (a state open-data portal), sunbiz (Florida's public SFTP quarterly corporate file, fixed width).
// Env: ONLY=slug,slug  SHARD=i/n  MAX_ROWS (tests)  SOCRATA_APP_TOKEN (optional)  DRY=1
import fs from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { supa } from '../lib/supa.mjs';
import { entityRow, sunbizRow } from '../lib/entities.mjs';
import { hash, sleep } from './util.mjs';

const E = process.env, DRY = !!E.DRY, log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const SOURCES = JSON.parse(fs.readFileSync(new URL('../data/entity-sources.json', import.meta.url), 'utf8')).sources.filter(s => s.enabled !== false);
const ONLY = E.ONLY ? E.ONLY.split(',').map(x => x.trim()).filter(Boolean) : null;
const [SI, SN] = (E.SHARD || '0/1').split('/').map(Number);
const MAX = +(E.MAX_ROWS || 0) || Infinity;
const LOAD = new Date().toISOString().replace(/\D/g, '').slice(0, 17) + '-' + process.pid;
const COLS = ['id', 'state', 'number', 'name', 'name_norm', 'kind', 'status', 'active', 'formed', 'juris', 'agent', 'agent_addr', 'addr', 'city', 'zip', 'attrs', 'source', 'h', 'load_id'];
const UA = { 'User-Agent': 'FinishesSolutions-RE-Intelligence/1.0 (business entity data; github actions)', ...(E.SOCRATA_APP_TOKEN ? { 'X-App-Token': E.SOCRATA_APP_TOKEN } : {}) };
const db = DRY ? null : supa();
if (!DRY && !db) { console.error('SUPABASE_URL and SUPABASE_SECRET_KEY are needed (or DRY=1)'); process.exit(1); }

async function getJSON(url, { timeout = 180000, tries = 5 } = {}) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeout) }), t = await r.text();
      if (r.ok) return JSON.parse(t);
      if (r.status < 500 && r.status !== 429) throw Object.assign(new Error(r.status + ' ' + t.slice(0, 200)), { fatal: true });
      if (i >= tries - 1) throw new Error(r.status + ' ' + t.slice(0, 200));
    } catch (e) { if (e.fatal || i >= tries - 1) throw e; }
    await sleep(2000 * 2 ** i);
  }
}

// ---------- readers ----------
async function* socrata(src) {
  const base = 'https://' + src.domain + '/resource/' + src.id + '.json', page = 50000;
  for (let off = 0; off < MAX; off += page) {
    const q = new URLSearchParams({ $order: ':id', $limit: String(Math.min(page, MAX - off)), $offset: String(off), ...(src.where ? { $where: src.where } : {}) });
    const rows = await getJSON(base + '?' + q); if (!rows.length) break;
    if (!off) { const keys = Object.keys(rows[0] || {}), miss = Object.values(src.map).flat().filter(f => typeof f === 'string' && !rows.some(r => f in r)); log(src.slug, 'fields', keys.join(',')); if (miss.length) log(src.slug, 'MAP FIELDS NOT IN THE DATA', miss.join(',')); }
    yield rows.map(r => entityRow(src, r)); if (rows.length < page) break;
  }
}
// Florida Division of Corporations: the quarterly corporate data file on its public SFTP server (credentials published
// on dos.fl.gov "Data Downloads"), fixed-width records cut by lib/entities.mjs sunbizRow.
async function* sunbiz(src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sunbiz-')), zip = path.join(dir, 'cordata.zip');
  const auth = (E.SUNBIZ_USER || 'Public') + ':' + (E.SUNBIZ_PASS || 'PubAccess1845!');
  log(src.slug, 'downloading', src.file);
  execFileSync('curl', ['-sS', '--fail', '--retry', '3', '-k', '--user', auth, '-o', zip, 'sftp://sftp.floridados.gov' + src.file], { stdio: 'inherit', timeout: 3 * 3600e3 });
  const unz = spawn('unzip', ['-p', zip], { stdio: ['ignore', 'pipe', 'inherit'] });
  const rl = readline.createInterface({ input: unz.stdout, crlfDelay: Infinity });
  let batch = [], n = 0;
  for await (const line of rl) { const r = sunbizRow(src, line); if (r) batch.push(r); if (++n >= MAX) break; if (batch.length >= 20000) { yield batch; batch = []; } }
  if (batch.length) yield batch;
  unz.kill(); fs.rmSync(dir, { recursive: true, force: true });
}
async function* arcgis(src) {
  const meta = await getJSON(src.url + '?f=json'), oid = meta.objectIdField || 'OBJECTID', page = Math.min(meta.maxRecordCount || 1000, 2000);
  let last = -1, n = 0;
  while (n < MAX) {
    const q = new URLSearchParams({ f: 'json', where: oid + ' > ' + last + (src.where ? ' AND (' + src.where + ')' : ''), outFields: '*', returnGeometry: 'false', orderByFields: oid, resultRecordCount: String(page) });
    const d = await getJSON(src.url + '/query?' + q), f = d.features || []; if (!f.length) break;
    last = Math.max(...f.map(x => +x.attributes[oid]).filter(Number.isFinite)); n += f.length;
    yield f.map(x => entityRow(src, x.attributes)); if (!Number.isFinite(last)) break;
  }
}
const READERS = { socrata, sunbiz, arcgis };

// ---------- writing ----------
async function oldHashes(slug) {
  const old = new Map(); if (!db) return old;
  for (let after = ''; ;) { const pg = await db.rpc('entity_hashes', { p_source: slug, p_after: after, p_n: 50000 }), ks = Object.keys(pg); for (const k of ks) old.set(k, pg[k]); if (ks.length < 50000) break; after = ks.sort().pop(); }
  return old;
}
async function loadSource(src) {
  const t0 = Date.now(), old = await oldHashes(src.slug), seen = new Set();
  let read = 0, kept = 0, written = 0, active = 0;
  for await (const rows of READERS[src.via](src)) {
    read += rows.length; const out = [];
    for (const r of rows) {
      if (!r || seen.has(r.id)) continue; seen.add(r.id); kept++; if (r.active) active++;
      const { h, load_id, ...rest } = r; r.h = hash(JSON.stringify(rest)); r.load_id = LOAD; void h; void load_id;
      if (old.get(r.id) === r.h) continue;
      const o = {}; for (const k of COLS) o[k] = r[k] ?? null; o.attrs = r.attrs || {}; out.push(o);
    }
    if (DRY && !written && out[0]) log(src.slug, 'sample', JSON.stringify(out[0]).slice(0, 700));
    if (db) for (let i = 0; i < out.length; i += 1000) await db.upsert('entities', out.slice(i, i + 1000), 'id', 1000);
    written += out.length;
    if (read % 250000 < rows.length) log(src.slug, 'read', read, 'kept', kept, 'written', written);
  }
  const res = { source: src.slug, state: src.state, read, rows: kept, active, written, sec: Math.round((Date.now() - t0) / 1000) };
  if (db) await db.upsert('county_loads', [{ source: 'entities:' + src.slug, at: new Date().toISOString(), load_id: LOAD, rows: kept, written, removed: 0, status: 'ok', note: src.name, url: src.url || (src.domain ? 'https://' + src.domain + '/d/' + src.id : null), etag: null, modified: null }], 'source');
  return res;
}

const mine = SOURCES.filter((s, i) => (ONLY ? ONLY.includes(s.slug) : true) && (ONLY || i % SN === SI));
log('sources', mine.length, 'of', SOURCES.length, 'shard', SI + '/' + SN);
const failed = [];
// AUTO=1 (the scheduled runs): a registry loaded in full in the last 6 days is skipped; a run GitHub stops after 6 hours
// loses nothing (the next run writes only the entities still missing)
const AUTO = E.AUTO === '1';
const loads = AUTO && db ? Object.fromEntries((await db.selectAll('county_loads', 'select=source,at,status')).map(r => [r.source, r])) : {};
for (const src of mine) {
  const last = loads['entities:' + src.slug];
  if (AUTO && last?.status === 'ok' && (Date.now() - Date.parse(last.at)) / 864e5 < 6) { log(src.slug, 'loaded', last.at, '- skipped'); continue; }
  try { log(src.slug, 'done', JSON.stringify(await loadSource(src))); }
  catch (e) {
    failed.push(src.slug); log(src.slug, 'FAILED', e.message);
    if (db) await db.upsert('county_loads', [{ source: 'entities:' + src.slug, at: new Date().toISOString(), status: 'failed', note: String(e.message).slice(0, 300) }], 'source').catch(() => {});
  }
}
log('finished', JSON.stringify({ sources: mine.length, failed }));
if (mine.length && failed.length === mine.length) process.exit(1);
