// Nightly: development activity for the seven counties -> Supabase dev_items ("County data" workflow,
// supabase/migrations/20261021000000_county_data.sql). One step per source; a source that fails keeps last night's rows
// and the others carry on. Sources and their row shapes are in lib/countydata.mjs.
//   permits    Harris County building permits from HCAD's weekly Real_acct_owner.zip (only downloaded when it changed),
//              placed on the parcel through HCAD's parcel layer; last 24 months
//   plats      City of Houston plat applications (city + ETJ, last 24 months), Fort Bend recorded subdivisions (10 years),
//              and the undated subdivision maps of Montgomery, Waller, Austin and Washington
//   txdot      TxDOT projects planned, under way, or finished in the last two years
//   districts  TCEQ water districts with outlines, creation dates (TCEQ district pages, a slice per night) and the Bond
//              Review Board's newest debt report (tax rate, bonds outstanding)
//   schools    TEA public school campuses with enrollment
// Env: ONLY=permits,plats,txdot,districts,schools (subset), FORCE=1 (reload files that haven't changed),
// ALLOW_SHRINK=1 (accept a load under half the rows before), IWUD_MAX (district pages per night, default 300),
// LOCATE_MAX (new permit parcels to place per night, default 60000), HCAD_ZIP (a local Real_acct_owner.zip for tests),
// COUNTY_MIN_ROWS (the fewest rows a source may parse before it counts as broken; per source by default),
// DRY=1 (parse and report, write nothing).
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { hash, sleep, readJSON } from './util.mjs';
import { supa } from '../lib/supa.mjs';
import { inOutline } from '../lib/places.mjs';
import * as C from '../lib/countydata.mjs';

const E = process.env, log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const ONLY = (E.ONLY || 'permits,plats,txdot,districts,schools').split(',').map(x => x.trim());
const FORCE = !!E.FORCE, DRY = !!E.DRY, MIN_KEEP = E.ALLOW_SHRINK ? 0 : 0.5;
const IWUD_MAX = +(E.IWUD_MAX || 300), LOCATE_MAX = +(E.LOCATE_MAX || 60000);
const minRows = m => E.COUNTY_MIN_ROWS != null ? +E.COUNTY_MIN_ROWS : m; // tests run on a handful of rows
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const monthsAgo = m => { const d = new Date(today + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - m); return d.toISOString().slice(0, 10); };
const LOAD = new Date().toISOString().replace(/\D/g, '').slice(0, 17) + '-' + process.pid; // unique per run, even two in a minute
const UA = { 'User-Agent': 'FinishesSolutions-RE-Intelligence/1.0 (county data; github actions)' };
const COLS = ['id', 'kind', 'source', 'county', 'name', 'cat', 'status', 'day', 'amount', 'units', 'addr', 'attrs', 'lon', 'lat', 'shape_json', 'h', 'load_id'];

const db = DRY ? null : supa();
if (!DRY && !db) { console.error('SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY, or GitHub OIDC) must be set'); process.exit(1); }
if (db) {
  try { await db.select('dev_items', 'select=id&limit=1'); }
  catch (e) { console.error('The county data tables are missing. Run supabase/migrations/20261021000000_county_data.sql in the Supabase SQL editor.\n' + e.message); process.exit(1); }
}
const geo = await readJSON((E.DATA_DIR || 'data/') + 'geo.json', { counties: [] });
const outlines = geo.counties.map(c => { let b = [Infinity, Infinity, -Infinity, -Infinity]; for (const p of c.outline) for (const r of p) for (const [x, y] of r) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]; return { name: c.name, outline: c.outline, b }; });
const countyOf = (lon, lat) => lon == null ? null : outlines.find(c => lon >= c.b[0] && lon <= c.b[2] && lat >= c.b[1] && lat <= c.b[3] && inOutline([lon, lat], c.outline))?.name || null;
const REGION = (() => { let b = [Infinity, Infinity, -Infinity, -Infinity]; for (const c of outlines) b = [Math.min(b[0], c.b[0]), Math.min(b[1], c.b[1]), Math.max(b[2], c.b[2]), Math.max(b[3], c.b[3])]; return b.every(Number.isFinite) ? b : [-97.3, 28.8, -94.3, 31.2]; })();

async function get(url, opts = {}, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(opts.timeout || 90000) });
      if (r.ok || (r.status < 500 && r.status !== 429) || i >= tries - 1) return r;
    } catch (e) { if (i >= tries - 1) throw e; }
    await sleep(1500 * (i + 1));
  }
}
async function getJSON(url, opts) { const r = await get(url, opts), t = await r.text(); let d; try { d = JSON.parse(t); } catch { throw new Error(url.split('?')[0] + ' answered ' + r.status + ' ' + t.slice(0, 120)); } if (d?.error) throw new Error(url.split('?')[0] + ': ' + (d.error.message || JSON.stringify(d.error))); return d; }
// every feature of an ArcGIS layer that matches, paged, in longitude / latitude, simplified to about 3 m
async function arcAll(url, where, { fields = '*', geometry = true, page = 1000, box = null, max = 200000 } = {}) {
  const out = [];
  for (let off = 0; off < max; off += page) {
    const p = { f: 'json', where, outFields: fields, returnGeometry: String(geometry), outSR: '4326', geometryPrecision: '5', maxAllowableOffset: '0.00003', resultOffset: String(off), resultRecordCount: String(page) };
    if (box) Object.assign(p, { geometry: box.join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' });
    const d = await getJSON(url + '/query?' + new URLSearchParams(p), { method: 'GET', timeout: 120000 });
    out.push(...(d.features || []));
    if (!(d.features?.length) || (!d.exceededTransferLimit && d.features.length < page)) break;
  }
  return out;
}
const socrata = (url, p) => getJSON(url + '?' + new URLSearchParams(p), { timeout: 180000 });

const stats = {}, failed = [];
const STEP_SOURCES = { permits: ['hcad-permits'], plats: ['coh-plats', 'fbc-subdivisions', 'mcad-subdivisions'], txdot: ['txdot'], districts: ['tceq-districts'], schools: ['tea-schools'] };
async function step(name, fn) {
  if (!ONLY.includes(name)) return;
  const t = Date.now();
  try { stats[name] = await fn(); log(name, JSON.stringify(stats[name]), ((Date.now() - t) / 1000).toFixed(0) + 's'); }
  catch (e) {
    failed.push(name); log(name, 'FAILED', e.message);
    // Data & help shows the failure on the step's sources; their rows stay as they were
    if (db) await db.upsert('county_loads', (STEP_SOURCES[name] || [name]).map(source => ({ source, at: new Date().toISOString(), status: 'failed', note: String(e.message).slice(0, 300) })), 'source').catch(() => {});
  }
}
const lastLoad = async source => db ? (await db.select('county_loads', 'select=*&source=eq.' + encodeURIComponent(source)))[0] || null : null;

// write a source's rows: only new or changed rows are sent, unchanged ones are marked as seen, rows the source no longer
// lists are removed (refused when that would remove more than half). undated: the first load of a source whose rows
// carry no date backdates them, so only rows that appear on later nights count as new.
async function save(source, rows, { min = 1, undated = false, meta = {} } = {}) {
  const seen = new Set(); rows = rows.filter(r => r && !seen.has(r.id) && seen.add(r.id));
  min = minRows(min);
  if (rows.length < min) throw new Error(source + ': only ' + rows.length + ' rows parsed (expected at least ' + min + '); nothing changed');
  for (const r of rows) { r.source = source; r.load_id = LOAD; r.h = C.rowHash(r, hash); }
  if (DRY) return { source, rows: rows.length, sample: rows.slice(0, 2).map(r => ({ ...r, shape_json: r.shape_json ? r.shape_json.type : null })) };
  const old = {};
  for (let after = ''; ;) { const page = await db.rpc('dev_hashes', { p_source: source, p_after: after, p_n: 50000 }), ks = Object.keys(page); Object.assign(old, page); if (ks.length < 50000) break; after = ks.sort().pop(); }
  const first = !Object.keys(old).length, changed = rows.filter(r => old[r.id] !== r.h), same = rows.filter(r => old[r.id] === r.h).map(r => r.id);
  const out = changed.map(r => { const o = {}; for (const k of COLS) o[k] = r[k] ?? null; if (first && undated) o.first_seen = '2000-01-01'; if (o.attrs == null) o.attrs = {}; return o; });
  for (let i = 0; i < out.length; i += 500) await db.upsert('dev_items', out.slice(i, i + 500), 'id', 500);
  for (let i = 0; i < same.length; i += 2000) await db.rpc('dev_touch', { p_source: source, p_load: LOAD, p_ids: same.slice(i, i + 2000) });
  const pr = await db.rpc('dev_prune', { p_source: source, p_load: LOAD, p_min_keep: MIN_KEEP });
  if (pr?.refused) throw new Error(source + ': this load has ' + pr.kept + ' rows against ' + pr.total + ' before; old rows kept. Run with ALLOW_SHRINK=1 to accept it.');
  await db.upsert('county_loads', [{ source, at: new Date().toISOString(), load_id: LOAD, rows: rows.length, written: out.length, removed: pr?.removed ?? 0, status: 'ok', note: null, url: meta.url || null, etag: meta.etag || null, modified: meta.modified || null }], 'source');
  return { source, rows: rows.length, written: out.length, removed: pr?.removed ?? 0 };
}
// a source that didn't change since last night: mark it checked without touching its rows
async function unchanged(source, prev) { if (db) await db.upsert('county_loads', [{ ...prev, at: new Date().toISOString(), status: 'ok', note: 'unchanged since ' + (prev.modified || prev.at) }], 'source'); return { source, unchanged: true }; }

// ---------- Harris County permits ----------
await step('permits', async () => {
  const src = 'hcad-permits', prev = await lastLoad(src);
  let url = null, head = null, file = E.HCAD_ZIP;
  if (!file) {
    for (const y of [new Date().getUTCFullYear(), new Date().getUTCFullYear() - 1]) { const r = await get(C.SRC.hcadZip(y), { method: 'HEAD' }); if (r.ok) { url = C.SRC.hcadZip(y); head = r.headers; break; } }
    if (!url) throw new Error('HCAD Real_acct_owner.zip not found for this year or last');
    const etag = head.get('etag'), modified = head.get('last-modified');
    if (!FORCE && prev && prev.etag && prev.etag === etag && prev.url === url) return unchanged(src, prev);
    file = path.join(os.tmpdir(), 'hcad-acct.zip');
    const r = await get(url, { timeout: 900000 }); if (!r.ok) throw new Error('HCAD download ' + r.status);
    await pipeline(Readable.fromWeb(r.body), createWriteStream(file));
    head = { etag, modified };
  }
  const text = execFileSync('unzip', ['-p', file, 'permits.txt'], { maxBuffer: 1024 * 1048576 }).toString('latin1');
  const rows = C.parseHcadPermits(text, { since: monthsAgo(24) });
  log('permits parsed', rows.length, 'since', monthsAgo(24));
  // where each permit is: the parcel's spot, from last night's rows when the account was already placed, else HCAD's layer
  const at = new Map();
  if (db) for (const r of await db.selectAll('dev_items', 'select=id,lon,lat&source=eq.' + src + '&lon=not.is.null', 1000)) if (r.lon != null) at.set(r.id.split(':')[2], [r.lon, r.lat]);
  const need = [...new Set(rows.map(r => r.acct))].filter(a => !at.has(a)).slice(0, LOCATE_MAX);
  let placed = 0;
  for (let i = 0; i < need.length; i += 100) {
    const ids = need.slice(i, i + 100);
    try {
      const d = await getJSON(C.SRC.hcadParcels + '/query?' + new URLSearchParams({ f: 'json', where: "HCAD_NUM IN ('" + ids.join("','") + "')", outFields: 'HCAD_NUM', returnGeometry: 'true', outSR: '4326', geometryPrecision: '5', maxAllowableOffset: '0.0001' }), { timeout: 60000 });
      for (const f of d.features || []) { const p = C.labelPoint(C.esriToGeo(f.geometry)); if (p) { at.set(String(f.attributes.HCAD_NUM).trim(), p); placed++; } }
    } catch (e) { log('permits: parcel lookup failed for a batch:', e.message); }
    if (i && i % 5000 === 0) log('permits placed', placed, '/', need.length);
  }
  for (const r of rows) { const p = at.get(r.acct); r.lon = p?.[0] ?? null; r.lat = p?.[1] ?? null; }
  const res = await save(src, rows, { min: 1000, meta: { url, etag: head?.etag, modified: head?.modified } });
  return { ...res, placedNew: placed, unplaced: rows.filter(r => r.lon == null).length };
});

// ---------- plats and subdivisions ----------
await step('plats', async () => {
  const out = {};
  const coh = (await arcAll(C.SRC.cohPlats, "AppSubmitDate >= DATE '" + monthsAgo(24) + "'")).map(C.cohPlatRow).filter(Boolean);
  for (const r of coh) r.county = countyOf(r.lon, r.lat);
  out.coh = await save('coh-plats', coh.filter(r => r.county), { min: 200 });
  const fbc = (await arcAll(C.SRC.fbcSubdivisions, "REC_DATE >= DATE '" + monthsAgo(120) + "'")).map(C.fbcSubdivisionRow).filter(Boolean);
  out.fbc = await save('fbc-subdivisions', fbc, { min: 100 });
  const mcad = (await arcAll(C.SRC.mcadSubdivisions, '1=1')).map(f => C.undatedSubdivisionRow(f, { source: 'mcad-subdivisions', county: 'Montgomery', nameField: 'Sub_Name', by: 'Montgomery Central Appraisal District' })).filter(Boolean);
  out.mcad = await save('mcad-subdivisions', mcad, { min: 500, undated: true });
  for (const county of ['Waller', 'Austin', 'Washington']) {
    const key = county.toLowerCase() + '-subdivisions';
    try {
      const rows = (await arcAll(C.SRC.bis[county] + '/2', '1=1')).map(f => C.undatedSubdivisionRow(f, { source: key, county, nameField: 'DESC_', by: county + ' County Appraisal District' })).filter(Boolean);
      out[county] = await save(key, rows, { min: 20, undated: true });
    } catch (e) { out[county] = { failed: e.message }; log(key, 'FAILED', e.message); }
  }
  return out;
});

// ---------- TxDOT projects ----------
await step('txdot', async () => {
  const feats = await arcAll(C.SRC.txdot, "COUNTY_NAME IN ('" + C.COUNTIES.join("','") + "')");
  const rows = feats.map(f => C.txdotRow(f, { today })).filter(Boolean);
  return save('txdot', rows, { min: 300 });
});

// ---------- water districts ----------
await step('districts', async () => {
  const list = C.tceqDistricts(await socrata(C.SRC.tceqList, { $where: "county in ('" + C.COUNTIES.map(c => c.toUpperCase()).join("','") + "') AND activity_status = 'Active'", $limit: '50000' }));
  log('districts listed', list.length);
  // outlines by TCEQ district number, or by name where the outline layer (last edited 2021) numbers it differently
  const shapes = new Map(), byName = new Map();
  for (const f of await arcAll(C.SRC.tceqShapes, '1=1', { fields: 'DISTRICT_ID,NAME', box: REGION })) {
    if (!f.geometry) continue; const k = String(f.attributes.DISTRICT_ID || '').trim(), nk = C.districtKey(f.attributes.NAME);
    if (k && !shapes.has(k)) shapes.set(k, f.geometry); if (nk && !byName.has(nk)) byName.set(nk, f.geometry);
  }
  // the newest Bond Review Board report for every water district in the counties
  const fy = (await socrata(C.SRC.brb, { $select: 'max(fiscalyear) as fy', $where: "governmenttype = 'WD'" }))[0]?.fy;
  const brb = await socrata(C.SRC.brb, { $where: "governmenttype = 'WD' AND fiscalyear = '" + fy + "' AND (" + C.COUNTIES.map(c => "upper(county) like '%" + c.toUpperCase() + "%'").join(' OR ') + ')', $limit: '50000' });
  const bonds = C.bondRows(brb);
  // creation dates: kept from earlier nights, and a slice of district pages each night until every one has been read
  const prev = new Map();
  if (db) for (const r of await db.selectAll('dev_items', 'select=id,day,attrs&source=eq.tceq-districts', 1000)) prev.set(r.id, r);
  const iwudIds = new Map();
  for (const [county, no] of Object.entries(C.TX_COUNTY_NO)) {
    let start = null;
    for (let page = 0; page < 40; page++) {
      let html; try { html = await (await get(C.SRC.iwudList(no, start))).text(); } catch (e) { log('districts: TCEQ list page failed for', county, e.message); break; }
      const { ids, next } = C.parseIwudList(html); for (const x of ids) iwudIds.set(C.districtKey(x.name), x.iwud);
      if (!next || !ids.length || next === start) break; start = next; await sleep(300);
    }
  }
  const todo = list.filter(d => { const p = prev.get('district:' + d.id); return !p?.attrs?.checked && iwudIds.has(C.districtKey(d.name)); }).slice(0, IWUD_MAX);
  const pages = new Map();
  for (const d of todo) {
    const iw = iwudIds.get(C.districtKey(d.name));
    try { pages.set(d.id, { ...C.parseIwud(await (await get(C.SRC.iwud(iw))).text()), iwud: iw }); } catch (e) { log('districts: page', iw, e.message); }
    await sleep(250);
  }
  const rows = list.map(d => {
    const p = prev.get('district:' + d.id), page = pages.get(d.id);
    const iwud = page || (p?.attrs?.checked ? { created: p.day, iwud: p.attrs.iwud, acres: p.attrs.acres, creationType: p.attrs.creationType, bonds: p.attrs.bondAuthority } : null);
    return C.districtRow(d, { shape: shapes.get(d.id) || byName.get(C.districtKey(d.name)), iwud, bonds: bonds.get(C.districtKey(d.name)), today: page ? today : p?.attrs?.checked || null });
  });
  const res = await save('tceq-districts', rows, { min: 300 });
  return { ...res, withShape: rows.filter(r => r.shape_json).length, withCreated: rows.filter(r => r.day).length, pagesRead: pages.size, withBonds: rows.filter(r => r.attrs.bonds.length).length, bondYear: fy };
});

// ---------- TEA schools ----------
await step('schools', async () => {
  const names = ((await getJSON(C.SRC.teaOrg + '?f=json')).services || []).map(s => s.name), svc = C.newestTeaService(names);
  if (!svc) throw new Error('no TEA districts_schools_…_C service listed');
  const feats = await arcAll(C.SRC.teaOrg + '/' + svc + '/FeatureServer/0', '1=1', { box: REGION });
  // enrollment from the newest yearly schools layer (the dated directory has none)
  const yearly = names.filter(n => /^Schools_\d{4}_to_\d{4}$/.test(n)).sort().pop();
  let enrollment = new Map();
  if (yearly) try { enrollment = C.teaEnrollment(await arcAll(C.SRC.teaOrg + '/' + yearly + '/FeatureServer/0', '1=1', { box: REGION, geometry: false }), C.teaYearLabel(yearly)); } catch (e) { log('schools: enrollment layer failed', e.message); }
  const rows = feats.map(f => C.teaSchoolRow(f, { enrollment })).filter(Boolean);
  const res = await save('tea-schools', rows, { min: 300, meta: { url: svc + (yearly ? ' + ' + yearly : '') } });
  return { ...res, service: svc, enrollmentFrom: yearly || null, withEnrollment: rows.filter(r => r.units).length };
});

log('done', JSON.stringify({ failed }));
if (failed.length && failed.length === ONLY.filter(x => ['permits', 'plats', 'txdot', 'districts', 'schools'].includes(x)).length) process.exit(1);
