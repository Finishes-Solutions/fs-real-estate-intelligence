// Appraisal rolls and tax rates for the seven home counties -> Supabase ("CAD rolls" workflow,
// supabase/migrations/20261112000000_cad_rolls.sql). Sources and why: docs/data-sources/cad-and-tax-rates.md. Parsing is
// in lib/cad/parse.mjs. One step per source; a source that fails is logged and the others carry on.
//   comptroller  the Comptroller's rates and levies for every taxing unit (school, city, county, special district), by year
//   rates        the districts' own current rate tables: HCAD (in its jurisdiction file), Waller CAD (PDF), Fort Bend CAD
//                (XLSX, with each code's Comptroller ID), Montgomery tax office (PDF)
//   hcad         Harris: accounts, owners, buildings, units and exemptions from HCAD's weekly bulk files (one tax year)
//   fbcad        Fort Bend: the Orion certified export of each year posted, then that year's supplements, or the newest
//                preliminary export for a year not yet certified
//   washington   Washington: the PACS certified (or preliminary) appraisal export
//   grimes       Grimes: the certified roll printed as text, each year posted
//   layers       Waller and Austin (no roll file published): the BIS parcel layers' current year; Washington and Grimes
//                too for a year newer than their latest roll file
//
// Idempotent: each file's SHA-256 is checked against source_runs and a file already loaded is skipped (FORCE=1 reloads).
// A load writes only the tax year its file is for, so earlier years are never touched. Raw files up to RAW_MAX_MB are kept
// in Storage (bucket cad-raw) with their checksum; bigger ones keep the checksum and URL only.
// Checks: rows read vs the last run (a swing over SWING_PCT is a warning, over half fails the job unless ALLOW_SHRINK=1),
// market value sums, rates outside 0–5 per $100 dropped, a sample of account numbers looked up in the parcel layers.
//
// Env: ONLY (comma list of the steps above), YEARS (e.g. 2024,2025,2026; default the last three), FORCE=1, DRY=1 (parse and
// report, write nothing; OUT_DIR=… also writes the rows as JSON lines), ALLOW_SHRINK=1, SWING_PCT (default 20),
// RAW_MAX_MB (default 45), LAYER_COUNTIES (which parcel layers, default all four), MAX_ROWS (stop each file after this many records: tests), CAD_DIR (read files from here instead
// of downloading, named as the URL's last part: tests), SUPABASE_URL + SUPABASE_SECRET_KEY (or GitHub OIDC).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { spawn, execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import ExcelJS from 'exceljs';
import { supa } from '../lib/supa.mjs';
import * as P from '../lib/cad/parse.mjs';

const E = process.env, log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const STEPS = ['comptroller', 'rates', 'hcad', 'fbcad', 'washington', 'grimes', 'layers'];
const ONLY = (E.ONLY || STEPS.join(',')).split(',').map(x => x.trim()).filter(Boolean);
const NOW_YEAR = +new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }).slice(0, 4);
const YEARS = (E.YEARS || [NOW_YEAR - 2, NOW_YEAR - 1, NOW_YEAR].join(',')).split(',').map(Number).filter(Boolean);
const FORCE = !!E.FORCE, DRY = !!E.DRY, OUT = E.OUT_DIR || null, MAX_ROWS = +E.MAX_ROWS || Infinity, SWING = +(E.SWING_PCT || 20), RAW_MAX = +(E.RAW_MAX_MB || 45) * 1048576;
const UA = { 'User-Agent': 'RealEstateIntelligence/1.0 (appraisal rolls; github actions)' };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const t1 = v => String(v ?? '').trim();

const db = DRY ? null : supa();
if (!DRY && !db) { console.error('SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY, or GitHub OIDC) must be set'); process.exit(1); }
if (db) {
  try { await db.select('source_runs', 'select=id&limit=1'); }
  catch (e) { console.error('The CAD tables are missing. Run supabase/migrations/20261112000000_cad_rolls.sql in the Supabase SQL editor.\n' + e.message); process.exit(1); }
}
if (OUT) fs.mkdirSync(OUT, { recursive: true });

// ---------- writing ----------
let runSeq = 0; const runsMem = [], problems = [];
const outFile = name => OUT ? fs.createWriteStream(path.join(OUT, name + '.jsonl'), { flags: 'a' }) : null;
const outs = {};
function writer(table, conflict, chunk = 1000) {
  let buf = [], n = 0;
  const flush = async () => {
    if (!buf.length) return; const rows = buf; buf = [];
    if (db) await db.upsert(table, rows, conflict, 500);
    if (OUT) { const f = outs[table] ||= outFile(table); for (const r of rows) f.write(JSON.stringify(r) + '\n'); }
  };
  return { async push(row) { buf.push(row); n++; if (buf.length >= chunk) await flush(); }, flush, get n() { return n; } };
}
async function startRun(o) {
  const row = { ...o, status: 'running', started_at: new Date().toISOString() };
  if (db) return { ...row, id: (await db.insertOne('source_runs', row)).id };
  return { ...row, id: ++runSeq };
}
async function endRun(run, patch) {
  const r = { ...run, ...patch, finished_at: new Date().toISOString() }; runsMem.push(r);
  if (db) await db.update('source_runs', 'id=eq.' + run.id, { ...patch, finished_at: r.finished_at });
  if (OUT) (outs.source_runs ||= outFile('source_runs')).write(JSON.stringify(r) + '\n');
  if (r.status === 'failed' || r.status === 'warning') problems.push(r);
  log(r.source, r.county || '', r.tax_year || '', r.roll || '', r.status, 'read', r.rows_read ?? '', 'written', r.rows_written ?? '', r.note ? '(' + r.note + ')' : '');
  return r;
}
// the last finished run of the same source / county / roll kind: its row count and value sum (the swing check)
async function lastRun({ source, county, roll }) {
  if (!db) return null;
  const q = 'source=eq.' + source + (county ? '&county=eq.' + encodeURIComponent(county) : '') + '&status=in.(ok,warning)&order=finished_at.desc&limit=5';
  return (await db.select('source_runs', q)).find(r => (r.roll || '').split(' ')[0] === (roll || '').split(' ')[0]) || null;
}
async function seenFile(source, sha) { return !FORCE && db ? (await db.select('source_runs', 'source=eq.' + source + '&sha256=eq.' + sha + '&status=in.(ok,warning)&limit=1')).length > 0 : false; }

// ---------- files ----------
async function get(url, tries = 4) {
  for (let i = 0; ; i++) {
    try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(600000) }); if (r.ok || (r.status < 500 && r.status !== 429) || i >= tries - 1) return r; }
    catch (e) { if (i >= tries - 1) throw e; }
    await sleep(3000 * 2 ** i);
  }
}
// a file on disk with its SHA-256 and size (downloaded, or from CAD_DIR in tests); null when the source has no such file
async function fetchFile(url) {
  const name = decodeURIComponent(url.split('/').pop().split('?')[0]), local = E.CAD_DIR ? path.join(E.CAD_DIR, name) : null;
  let file;
  if (local) { if (!fs.existsSync(local)) return null; file = local; }
  else {
    const r = await get(url); if (r.status === 404) return null; if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
    file = path.join(TMP, crypto.randomBytes(4).toString('hex') + '-' + name.replace(/[^\w.-]+/g, '_'));
    await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(file));
  }
  const h = crypto.createHash('sha256'); for await (const c of fs.createReadStream(file)) h.update(c);
  return { file, name, url, sha256: h.digest('hex'), bytes: fs.statSync(file).size };
}
// keep the raw file in Storage when it fits (direct key only: the OIDC pipeline proxies the database, not Storage)
async function keepRaw(f, source, year) {
  if (!db || db.via !== 'key') return { storage_path: null, note: db ? 'raw file not kept (no storage key on this run)' : null };
  if (f.bytes > RAW_MAX) return { storage_path: null, note: 'raw file not kept (' + Math.round(f.bytes / 1048576) + ' MB is over ' + Math.round(RAW_MAX / 1048576) + ' MB); the district keeps it at the URL' };
  const key = E.SUPABASE_SECRET_KEY || E.SUPABASE_SERVICE_ROLE_KEY, url = E.SUPABASE_URL.replace(/\/$/, ''), p = source + '/' + (year || 'all') + '/' + f.sha256.slice(0, 12) + '-' + f.name.replace(/[^\w.-]+/g, '_');
  const r = await fetch(url + '/storage/v1/object/cad-raw/' + p, { method: 'POST', body: fs.createReadStream(f.file), duplex: 'half', headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: 'Bearer ' + key } : {}), 'x-upsert': 'true', 'Content-Type': 'application/octet-stream' } });
  if (!r.ok) return { storage_path: null, note: 'raw file not kept (storage ' + r.status + ')' };
  return { storage_path: 'cad-raw/' + p, note: null };
}
const zipList = file => execFileSync('unzip', ['-Z1', file], { maxBuffer: 64 * 1048576 }).toString('utf8').split('\n').filter(Boolean);
// the lines of one file inside a zip (or of a plain file), streamed
async function* zipLines(file, entry, encoding = 'latin1') {
  const src = entry ? spawn('unzip', ['-p', file, entry]).stdout : fs.createReadStream(file);
  src.setEncoding(encoding);
  const rl = readline.createInterface({ input: src, crlfDelay: Infinity });
  let n = 0; for await (const l of rl) { yield l; if (++n > MAX_ROWS) { rl.close(); src.destroy(); break; } }
}
async function* records(file, entry, split) { let row = null; for await (const l of zipLines(file, entry)) { if (!row) { row = P.headerOf(l, split); continue; } if (l) yield row(split(l)); } }
async function sheetRows(file) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file); const ws = wb.worksheets[0], out = [];
  ws.eachRow({ includeEmpty: false }, r => out.push(r.values.slice(1).map(v => v && typeof v === 'object' ? ('result' in v ? v.result : v.text ?? v.richText?.map(x => x.text).join('') ?? null) : v)));
  return out;
}
const pdfText = file => execFileSync('pdftotext', ['-layout', file, '-'], { maxBuffer: 64 * 1048576 }).toString('utf8');
// the links on a page (for sources that post a new file name each time)
async function links(url) { const r = await get(url); if (!r.ok) throw new Error(url + ': HTTP ' + r.status); const html = await r.text(); return [...new Set([...html.matchAll(/href="([^"#]+)"/gi)].map(m => { try { return new URL(m[1].replace(/&amp;/g, '&'), url).href; } catch (e) { return null; } }).filter(Boolean))]; } // (a malformed link on the page is skipped)

// ---------- checks ----------
async function swingCheck(run, read, sum) {
  const prev = await lastRun(run); if (!prev || !prev.rows_read) return { status: 'ok', note: null };
  const d = (read / prev.rows_read - 1) * 100, dv = prev.value_sum && sum ? (sum / prev.value_sum - 1) * 100 : null;
  const notes = [];
  if (Math.abs(d) > SWING) notes.push('rows ' + (d > 0 ? '+' : '') + d.toFixed(1) + '% vs the last run (' + prev.rows_read + ')');
  if (dv != null && Math.abs(dv) > SWING * 1.5) notes.push('market value sum ' + (dv > 0 ? '+' : '') + dv.toFixed(1) + '% vs the last run');
  const bad = d < -50 && !E.ALLOW_SHRINK;
  return { status: bad ? 'failed' : notes.length ? 'warning' : 'ok', note: notes.join('; ') || null };
}
// look a sample of account numbers up in the district's parcel layer: the share found
const LAYERS = {
  Harris: { url: 'https://arcweb.hcad.org/server/rest/services/public/public_query/MapServer/0', field: 'HCAD_NUM', q: v => "'" + v + "'" },
  Waller: { url: 'https://services3.arcgis.com/KKhSlBnH1Rm0YK62/arcgis/rest/services/WallerCADWebService/FeatureServer/0', field: 'prop_id', q: v => +v },
  Austin: { url: 'https://services7.arcgis.com/rNakmFefTO1XjYg4/arcgis/rest/services/AustinCADWebService/FeatureServer/0', field: 'prop_id', q: v => +v },
  Washington: { url: 'https://services3.arcgis.com/42lb4t0mpCcD1zg8/arcgis/rest/services/WashingtonCADMatixService/FeatureServer/0', field: 'prop_id', q: v => +v },
  Grimes: { url: 'https://services8.arcgis.com/fpr21jaV02YtR7tv/arcgis/rest/services/GrimesCADWebService/FeatureServer/0', field: 'prop_id', q: v => +v }
};
async function geometryCheck(county, ids) {
  const L = LAYERS[county]; if (!L || !ids.length || E.CAD_DIR) return null;
  const pick = [...ids].sort(() => Math.random() - 0.5).slice(0, 25).filter(v => L.field !== 'prop_id' || /^\d+$/.test(v));
  if (!pick.length) return null;
  try {
    const q = new URLSearchParams({ f: 'json', where: L.field + ' in (' + pick.map(L.q).join(',') + ')', outFields: L.field, returnGeometry: 'false', resultRecordCount: '100' });
    const d = await (await get(L.url + '/query?' + q)).json(); const found = new Set((d.features || []).map(f => String(f.attributes[L.field]).trim()));
    const hit = pick.filter(v => found.has(String(L.field === 'prop_id' ? +v : v))).length; return Math.round(hit / pick.length * 100);
  } catch (e) { return null; }
}

// ---------- the Comptroller's rates (and the crosswalk pool) ----------
const COMP_KINDS = ['county', 'city', 'school-district', 'special-district'];
const compUrl = (y, k) => 'https://comptroller.texas.gov/taxes/property-tax/docs/' + y + '-' + k + '-rates-levies.xlsx';
let compPool = null; // the newest Comptroller rows, for matching district units by name
async function comptroller({ write = true } = {}) {
  const years = [...new Set([...YEARS, NOW_YEAR - 1])].sort();
  const pool = [];
  for (const y of years) for (const k of COMP_KINDS) {
    const url = compUrl(y, k), f = await fetchFile(url).catch(e => { problems.push({ source: 'comptroller', note: url + ': ' + e.message }); return null; });
    if (!f) continue;
    const rows = P.parseComptrollerRates(await sheetRows(f.file), { year: y, kind: k });
    pool.push(...rows);
    if (!write || await seenFile('comptroller-rates', f.sha256)) { if (write) log('comptroller', y, k, 'unchanged'); continue; }
    const run = await startRun({ source: 'comptroller-rates', county: null, tax_year: y, roll: 'rates', url, file_name: f.name, sha256: f.sha256, bytes: f.bytes, ...(await keepRaw(f, 'comptroller', y)) });
    const W = writer('tax_rates', 'unit_key,tax_year,source'), bad = [];
    for (const r of rows) { if (r.total_rate != null && !(r.total_rate >= 0 && r.total_rate <= 5)) { bad.push(r.unit_key + ' ' + r.total_rate); continue; } await W.push({ ...P.stripPrivate(r), source_run_id: run.id }); }
    await W.flush();
    await endRun(run, { status: bad.length ? 'warning' : 'ok', rows_read: rows.length, rows_written: W.n, errors: bad.slice(0, 50), note: bad.length ? bad.length + ' rates outside 0–5 per $100 dropped' : null });
  }
  const newest = Math.max(0, ...pool.map(r => r.tax_year));
  compPool = pool.filter(r => r.tax_year >= newest - 1);
  return compPool;
}
const pool = async () => compPool || comptroller({ write: false });

// district units: linked to the Comptroller's by ID or name, written to taxing_units
async function writeUnits(units, county, runId) {
  const linked = P.crosswalk(units, await pool(), county), W = writer('taxing_units', 'county,unit_code');
  for (const u of linked) await W.push({ county: u.county, unit_code: u.unit_code, name: u.name, unit_type: u.unit_type, comptroller_id: u.comptroller_id, match: u.match, updated_at: new Date().toISOString() });
  await W.flush();
  log('units', county, linked.length, 'linked', linked.filter(u => u.comptroller_id).length, runId ? '' : '');
  return linked;
}
async function writeRates(rows, runId) {
  const W = writer('tax_rates', 'unit_key,tax_year,source'), bad = [];
  for (const r of rows) { if (r.total_rate != null && !(r.total_rate >= 0 && r.total_rate <= 5)) { bad.push(r.unit_key + ' ' + r.total_rate); continue; } await W.push({ ...P.stripPrivate(r), source_run_id: runId }); }
  await W.flush(); return { n: W.n, bad };
}

// ---------- the districts' own rate tables ----------
async function districtRates() {
  // Waller CAD: "<year>-tax-rates.pdf" on its certified totals page (older years are scanned images: no text, skipped)
  try {
    const pdfs = (await links('https://waller-cad.org/certified-totals-exemptions/')).map(u => [u, /(\d{4})-tax-rates\.pdf$/i.exec(u)?.[1]]).filter(([, y]) => y && YEARS.includes(+y));
    for (const [url, y] of pdfs) await oneRateFile({ source: 'wcad-rates', county: 'Waller', url, year: +y, parse: f => P.wallerRateText(pdfText(f.file), { taxYear: +y }) });
  } catch (e) { problems.push({ source: 'wcad-rates', note: e.message }); log('wcad-rates failed', e.message); }
  // Montgomery tax office: "<year> Rates-<year> Exemptions.pdf"
  for (const y of YEARS) {
    const url = 'https://cms2.revize.com/revize/montgomerytax/Document%20Center/Property/' + y + '%20Rates-' + y + '%20Exemptions.pdf';
    await oneRateFile({ source: 'mctotx-rates', county: 'Montgomery', url, year: y, parse: f => P.montgomeryRateText(pdfText(f.file), { taxYear: y }), optional: true });
  }
  // Fort Bend CAD: the tax rate workbooks (XLSX only; its older .xls files can't be read here) carry each code's Comptroller ID
  try {
    const xl = (await links('https://www.fbcad.org/tax-rates/')).filter(u => /\.xlsx$/i.test(u) && /tax.?rate/i.test(u)).map(u => [u, +(/(20\d\d)/.exec(u.split('/').pop())?.[1] || 0)]).filter(([, y]) => y).sort((a, b) => b[1] - a[1]);
    for (const [url, y] of xl.slice(0, 3)) await oneRateFile({ source: 'fbcad-rates', county: 'Fort Bend', url, year: y, parse: async f => P.fbcadRateRows(await sheetRows(f.file), { taxYear: y }) });
  } catch (e) { problems.push({ source: 'fbcad-rates', note: e.message }); log('fbcad-rates failed', e.message); }
}
async function oneRateFile({ source, county, url, year, parse, optional = false }) {
  try {
    const f = await fetchFile(url); if (!f) { if (!optional) log(source, year, 'not posted'); return; }
    if (await seenFile(source, f.sha256)) { log(source, year, 'unchanged'); return; }
    const run = await startRun({ source, county, tax_year: year, roll: 'rates', url, file_name: f.name, sha256: f.sha256, bytes: f.bytes, ...(await keepRaw(f, source, year)) });
    const rows = await parse(f);
    if (!rows.length) { await endRun(run, { status: 'warning', rows_read: 0, rows_written: 0, note: 'no rate rows found (a scanned PDF?)' }); return; }
    await writeUnits(rows.map(x => x.unit), county, run.id);
    const w = await writeRates(rows.map(x => x.rate), run.id);
    await endRun(run, { status: w.bad.length ? 'warning' : 'ok', rows_read: rows.length, rows_written: w.n, errors: w.bad.slice(0, 50), note: w.bad.length ? w.bad.length + ' rates outside 0–5 per $100 dropped' : null });
  } catch (e) { problems.push({ source, county, status: 'warning', note: url.split('/').pop() + ': ' + e.message }); log(source, 'skipped', e.message); } // (one unreadable rate file doesn't fail the load)
}

// ---------- Harris (HCAD) ----------
async function hcad() {
  const y = Math.max(...YEARS), base = 'https://download.hcad.org/data/CAMA/' + y + '/';
  const files = {}; for (const n of ['Real_acct_owner', 'Real_jur_exempt', 'Real_building_land']) { files[n] = await fetchFile(base + n + '.zip'); if (!files[n]) { log('hcad', y, n + '.zip not posted'); return; } }
  const sha = crypto.createHash('sha256').update(Object.values(files).map(f => f.sha256).join(',')).digest('hex');
  if (await seenFile('hcad', sha)) { log('hcad', y, 'unchanged'); return; }
  const roll = await hcadRoll(y);
  const run = await startRun({ source: 'hcad', county: 'Harris', tax_year: y, roll, url: base, file_name: Object.values(files).map(f => f.name).join(', '), sha256: sha, bytes: Object.values(files).reduce((s, f) => s + f.bytes, 0),
    storage_path: null, note: 'raw files not kept (HCAD zips are 100–230 MB); their checksums: ' + Object.values(files).map(f => f.name + ' ' + f.sha256.slice(0, 16)).join(', ') });
  try {
    const jz = files.Real_jur_exempt.file, bz = files.Real_building_land.file, az = files.Real_acct_owner.file;
    // rates and units (the jurisdiction file has each unit's current and proposed rate)
    const rateRows = []; for await (const r of records(jz, 'jur_tax_dist_exempt_value_rate.txt', P.splitTsv)) rateRows.push(r);
    const hr = P.hcadRates(rateRows, { taxYear: y });
    await writeUnits(hr.map(x => x.unit), 'Harris', run.id); await writeRates(hr.map(x => x.rate), run.id);
    // exemptions by account
    // (1.6 million accounts: kept as short strings, not objects, to stay inside a runner's memory)
    const ex = new Map(); // acct → "district:cat:value;…"
    for await (const r of records(jz, 'jur_exempt.txt', P.splitTsv)) { const a = r.acct?.trim(); if (!a) continue; const v = r.tax_district?.trim() + ':' + r.exempt_cat?.trim() + ':' + (+r.exempt_val || 0); ex.set(a, ex.has(a) ? ex.get(a) + ';' + v : v); }
    const exOf = s => { const by = {}, cats = new Set(); for (const p of (s || '').split(';').filter(Boolean)) { const [d, c, v] = p.split(':'); cats.add(c); (by[d] ||= {})[c] = +v; } return { cats, by }; };
    // buildings: detail rows written now, a summary kept for the account
    // HCAD writes a row per building section; the property's unit count and net rentable area repeat on each row
    const sum = new Map(), seq = new Map(), IW = writer('cad_improvements', 'county,account_id,tax_year,imp_id');
    for (const [entry, kind] of [['building_res.txt', 'residential'], ['building_other.txt', 'commercial']]) {
      for await (const r of records(bz, entry, P.splitTsv)) {
        const b = P.hcadBuilding(r, { taxYear: y, kind }); if (!b.account_id) continue;
        const k = b.account_id + '|' + kind, n = (seq.get(k) || 0) + 1; seq.set(k, n);
        b.imp_id = (kind === 'commercial' ? 'C' : 'R') + b.imp_id + '-' + n; await IW.push({ ...b, source_run_id: run.id }); // (building number + section: unique within the account)
        const s = sum.get(b.account_id) || [null, 0, 0, 0, null, 0], first = t1(r.bld_num) === '1'; // [year built, from building 1?, sq ft, units, class, net rentable sf]
        if (b.year_built) { if (first) { if (!s[1]) { s[0] = b.year_built; s[1] = 1; } } else if (!s[1] && (!s[0] || b.year_built < s[0])) s[0] = b.year_built; } // (building 1's year, else the oldest)
        s[2] += b.sqft || 0; s[3] = Math.max(s[3], b.units || 0); s[4] ||= b.bldg_class; s[5] = Math.max(s[5], +r.nra || 0); sum.set(b.account_id, s);
      }
    }
    await IW.flush();
    // each account's units and taxable values
    const jv = new Map(); // acct → "district:taxable,…"
    for await (const r of records(jz, 'jur_value.txt', P.splitTsv)) { const a = r.acct?.trim(); if (!a) continue; const v = r.tax_district?.trim() + ':' + (+r.taxable_val || 0); jv.set(a, jv.has(a) ? jv.get(a) + ',' + v : v); }
    const jvOf = s => s ? Object.fromEntries(s.split(',').map(p => { const [d, v] = p.split(':'); return [d, +v]; })) : null;
    // accounts
    const AW = writer('cad_accounts', 'county,account_id,tax_year'), UW = writer('account_taxing_units', 'county,account_id,tax_year');
    let read = 0, vsum = 0; const ids = [];
    for await (const r of records(az, 'real_acct.txt', P.splitTsv)) {
      const a = P.hcadAccount(r, { roll }); if (!a.account_id || a.tax_year !== y) continue; read++; vsum += a.market_value || 0; if (ids.length < 5000) ids.push(a.account_id);
      const s = sum.get(a.account_id), e = ex.has(a.account_id) ? exOf(ex.get(a.account_id)) : null, v = jvOf(jv.get(a.account_id));
      if (s) { a.year_built = s[0] || a.year_built; a.bldg_sqft = s[5] || s[2] || a.bldg_sqft; a.units = s[3] || null; a.bldg_class = s[4] || a.bldg_class; } // (net rentable area where HCAD gives it: building sections include garages)
      if (e) a.exemptions = [...e.cats].filter(c => c && c !== 'NONE');
      const row = { ...P.stripPrivate(a), source_run_id: run.id }; row.h = P.rowHash(row); await AW.push(row);
      const codes = v ? Object.keys(v) : a._jurs; if (codes.length) await UW.push({ county: 'Harris', account_id: a.account_id, tax_year: y, unit_codes: codes, taxable: v || {}, exemptions: e?.by || {}, partial: false, source_run_id: run.id });
    }
    await AW.flush(); await UW.flush();
    const geo = await geometryCheck('Harris', ids), sw = await swingCheck({ source: 'hcad', county: 'Harris', roll }, read, vsum);
    await endRun(run, { status: sw.status === 'ok' && geo != null && geo < 80 ? 'warning' : sw.status, rows_read: read, rows_written: AW.n, value_sum: vsum,
      note: [run.note, sw.note, geo != null ? geo + '% of a sample of accounts found in the HCAD parcel layer' : null, IW.n + ' buildings'].filter(Boolean).join('; ') });
  } catch (e) { await endRun(run, { status: 'failed', errors: [String(e.message)], note: e.message }); }
}
// HCAD's own flag: is the year certified yet
async function hcadRoll(y) {
  if (E.CAD_DIR) return 'certified';
  try { const d = await (await get('https://hcad.org/actions/hcad-pdata/default/get-certification-flag?t=' + y)).json(); return d?.[0]?.certflg === 'Y' ? 'certified' : 'preliminary'; } catch (e) { return 'certified'; }
}

// ---------- Fort Bend (Orion exports) ----------
async function fbcad() {
  const all = (await links('https://www.fbcad.org/certified-and-supplements-reports/')).filter(u => /Orion-(\d{4})-(Certified|Supplement-\d+|Preliminary)-Export/i.test(u));
  for (const y of YEARS) {
    const mine = all.map(u => { const m = /Orion-(\d{4})-(Certified|Supplement-(\d+)|Preliminary)-Export/i.exec(u); return { u, y: +m[1], kind: /cert/i.test(m[2]) ? 'certified' : /pre/i.test(m[2]) ? 'preliminary' : 'supplement', sup: +(m[3] || 0), stamp: (/(\d{4})_(\d\d)_(\d\d)_(\d{4})/.exec(u) || []).slice(1).join('') }; }).filter(x => x.y === y);
    const cert = mine.filter(x => x.kind === 'certified').sort((a, b) => b.stamp.localeCompare(a.stamp))[0];
    const plan = cert ? [cert, ...mine.filter(x => x.kind === 'supplement').sort((a, b) => a.sup - b.sup)] : mine.filter(x => x.kind === 'preliminary').sort((a, b) => b.stamp.localeCompare(a.stamp)).slice(0, 1);
    for (const x of plan) await fbcadOne(x.u, y, x.kind === 'supplement' ? 'supplement ' + x.sup : x.kind);
  }
}
async function fbcadOne(url, y, roll) {
  const f = await fetchFile(url); if (!f) return;
  if (await seenFile('fbcad', f.sha256)) { log('fbcad', y, roll, 'unchanged'); return; }
  const run = await startRun({ source: 'fbcad', county: 'Fort Bend', tax_year: y, roll, url, file_name: f.name, sha256: f.sha256, bytes: f.bytes, ...(await keepRaw(f, 'fbcad', y)) });
  try {
    const list = zipList(f.file), entry = k => list.find(n => new RegExp(k + 'Export\\.txt$', 'i').test(n));
    // a property with several owners has an owner record each, and its entity and exemption records are per owner: rolled up to the property
    const owners = new Map(), ents = new Map(), exs = new Map(), propOf = new Map();
    for await (const r of records(f.file, entry('Owner'), P.splitCsv)) { const o = P.orionOwner(r); if (!o.account_id) continue; if (o.owner_ref && o.owner_ref !== o.account_id) propOf.set(o.owner_ref, o.account_id); if (!owners.has(o.account_id)) owners.set(o.account_id, o); }
    const byUnit = new Map(); // property|code → [market, assessed, taxable] summed over owners
    for await (const r of records(f.file, entry('Entity'), P.splitCsv)) { const e = P.orionEntity(r); if (!e.owner_ref) continue; const k = (propOf.get(e.owner_ref) || e.owner_ref) + '|' + e.code, v = byUnit.get(k) || [0, 0, 0]; v[0] += e.market || 0; v[1] += e.assessed || 0; v[2] += e.taxable || 0; byUnit.set(k, v); }
    for (const [k, v] of byUnit) { const [id, code] = k.split('|'), o = ents.get(id) || ents.set(id, { codes: [], taxable: {}, market: 0, assessed: 0 }).get(id); if (!o.codes.includes(code)) o.codes.push(code); o.taxable[code] = v[2]; o.market = Math.max(o.market, v[0]); o.assessed = Math.max(o.assessed, v[1]); }
    byUnit.clear();
    for await (const r of records(f.file, entry('Exemption'), P.splitCsv)) { const e = P.orionExemption(r); if (!e.owner_ref) continue; const id = propOf.get(e.owner_ref) || e.owner_ref; (exs.get(id) || exs.set(id, new Set()).get(id)).add(e.code); }
    const AW = writer('cad_accounts', 'county,account_id,tax_year'), UW = writer('account_taxing_units', 'county,account_id,tax_year');
    let read = 0, vsum = 0; const codes = new Set();
    for await (const r of records(f.file, entry('Property'), P.splitCsv)) {
      const a = P.orionProperty(r); if (!a.account_id || !(/^R/.test(a._type) || a._type === 'M') || (a.tax_year && a.tax_year !== y)) continue; // (RR residential, RL land, RD ag, RC commercial, RX exempt, M mobile home; P personal and N minerals left out)
      const o = owners.get(a.account_id), e = ents.get(a.account_id); read++;
      Object.assign(a, { tax_year: y, roll, owner: o?.owner || null, mailing: o?.mailing || null, land_value: o?.land_value ?? null, improvement_value: o?.improvement_value ?? null, ag_value: o?.ag_use || null,
        market_value: e?.market || ((o?.land_value || 0) + (o?.improvement_value || 0) + (o?.ag_market || 0)) || null, appraised_value: e?.assessed || null, exemptions: [...(exs.get(a.account_id) || [])],
        year_built: null, bldg_sqft: null, units: null, stories: null, bldg_class: null, neighborhood: null, lon: null, lat: null });
      vsum += a.market_value || 0;
      const row = { ...P.stripPrivate(a), source_run_id: run.id }; row.h = P.rowHash(row); await AW.push(row);
      const uc = e?.codes?.length ? e.codes : a._entities; uc.forEach(c => codes.add(c));
      if (uc.length) await UW.push({ county: 'Fort Bend', account_id: a.account_id, tax_year: y, unit_codes: uc.filter(c => c !== 'CAD'), taxable: e?.taxable || {}, exemptions: {}, partial: false, source_run_id: run.id });
    }
    await AW.flush(); await UW.flush();
    const sw = roll.startsWith('supplement') ? { status: 'ok', note: null } : await swingCheck({ source: 'fbcad', county: 'Fort Bend', roll }, read, vsum);
    await endRun(run, { status: sw.status, rows_read: read, rows_written: AW.n, value_sum: vsum, note: [run.note, sw.note, codes.size + ' unit codes (names and Comptroller IDs from Fort Bend’s rate workbook: the rates step)'].filter(Boolean).join('; ') });
  } catch (e) { await endRun(run, { status: 'failed', errors: [String(e.message)], note: e.message }); }
}

// ---------- PACS appraisal export (Washington) ----------
async function washington() {
  const ls = await links('https://washingtoncad.org/downloads/');
  for (const y of YEARS) {
    const cert = ls.find(u => new RegExp(y + '-Certified-Appraisal-Roll\\.zip$', 'i').test(u)), pre = ls.find(u => new RegExp(y + '-Preliminary-Appraisal-Roll\\.zip$', 'i').test(u));
    const url = cert || pre; if (!url) continue;
    await pacsOne({ source: 'washington-pacs', county: 'Washington', url, y, roll: cert ? 'certified' : 'preliminary' });
  }
}
async function pacsOne({ source, county, url, y, roll }) {
  const f = await fetchFile(url); if (!f) return;
  if (await seenFile(source, f.sha256)) { log(source, y, 'unchanged'); return; }
  const run = await startRun({ source, county, tax_year: y, roll, url, file_name: f.name, sha256: f.sha256, bytes: f.bytes, ...(await keepRaw(f, source, y)) });
  try {
    const list = zipList(f.file), entry = k => list.find(n => n.toUpperCase().endsWith('_' + k + '.TXT'));
    // units: names from the entity file, codes and taxable values per account
    const names = new Map(), au = new Map();
    for await (const l of zipLines(f.file, entry('APPRAISAL_ENTITY_INFO'))) {
      const e = P.fixed(l, P.PACS.entity), id = String(+e.prop_id); if (!+e.prop_id || +e.prop_val_yr !== y) continue;
      if (e.entity_cd !== 'CAD') { names.set(e.entity_cd, e.entity_name); const o = au.get(id) || au.set(id, { codes: [], taxable: {}, ex: {} }).get(id); if (!o.codes.includes(e.entity_cd)) o.codes.push(e.entity_cd); o.taxable[e.entity_cd] = +e.taxable_val || 0;
        const exm = { HS: +e.hs_amt, OV65: +e.ov65_amt, DP: +e.dp_amt, DV: +e.dv_amt, EX: +e.ex_amt }; for (const k of Object.keys(exm)) if (!exm[k]) delete exm[k]; if (Object.keys(exm).length) o.ex[e.entity_cd] = exm; }
    }
    await writeUnits([...names].map(([code, name]) => ({ county, unit_code: code, name: P.typeOfName(name) === 'county' ? name.replace(/\s+/g, ' ') : name, unit_type: P.typeOfName(name) })), county, run.id);
    // buildings: main area year built, total area, class; stories from the "Construction Style" feature
    const sum = new Map(), IW = writer('cad_improvements', 'county,account_id,tax_year,imp_id'), dets = new Map(), stories = new Map();
    for await (const l of zipLines(f.file, entry('APPRAISAL_IMPROVEMENT_DETAIL_ATTR'))) { const a = P.fixed(l, P.PACS.attr); if (/construction style/i.test(a.desc)) { const s = /(one|single|1)/i.test(a.code) ? 1 : /(two|2)/i.test(a.code) ? 2 : /(three|3)/i.test(a.code) ? 3 : null; if (s) stories.set(String(+a.prop_id) + '|' + +a.imprv_id, s); } }
    for await (const l of zipLines(f.file, entry('APPRAISAL_IMPROVEMENT_DETAIL'))) { const d = P.fixed(l, P.PACS.det), k = String(+d.prop_id) + '|' + +d.imprv_id; (dets.get(k) || dets.set(k, []).get(k)).push({ type: d.type_cd, desc: d.type_desc, cls: d.class_cd, year: +d.yr_built || null, area: +d.area || 0 }); }
    for await (const l of zipLines(f.file, entry('APPRAISAL_IMPROVEMENT_INFO'))) {
      const m = P.fixed(l, P.PACS.imp), id = String(+m.prop_id), k = id + '|' + +m.imprv_id; if (!+m.prop_id || +m.prop_val_yr !== y) continue;
      const segs = dets.get(k) || [], main = segs.filter(s => /^MA/.test(s.type)), area = (main.length ? main : segs).reduce((s, x) => s + x.area, 0), yb = Math.min(...(main.length ? main : segs).map(s => s.year).filter(Boolean)) || null;
      await IW.push({ county, account_id: id, tax_year: y, imp_id: String(+m.imprv_id), imp_type: [m.imprv_type_cd, m.imprv_type_desc].filter(Boolean).join(' '), bldg_class: main[0]?.cls || segs[0]?.cls || null, year_built: Number.isFinite(yb) ? yb : null, eff_year: null,
        sqft: area || null, units: null, stories: stories.get(k) || null, value: +m.imprv_val || null, segments: segs.slice(0, 40), source_run_id: run.id });
      const s = sum.get(id) || sum.set(id, { yb: null, sq: 0, cls: null, st: null }).get(id); if (main.length) { s.sq += area; s.yb = s.yb && yb ? Math.min(s.yb, yb) : s.yb || (Number.isFinite(yb) ? yb : null); s.cls ||= main[0].cls; s.st = Math.max(s.st || 0, stories.get(k) || 0) || null; }
    }
    await IW.flush(); dets.clear();
    const AW = writer('cad_accounts', 'county,account_id,tax_year'), UW = writer('account_taxing_units', 'county,account_id,tax_year');
    let read = 0, vsum = 0; const ids = [], seen = new Set();
    for await (const l of zipLines(f.file, entry('APPRAISAL_INFO'))) {
      const a = P.pacsAccount(P.fixed(l, P.PACS.info), { county, roll }); if (!a.account_id || a.tax_year !== y || !['R', 'MH'].includes(a._type) || seen.has(a.account_id)) continue; // (a property with several owners has a row each: the first is kept)
      seen.add(a.account_id); read++; vsum += a.market_value || 0; if (ids.length < 5000) ids.push(a.account_id);
      const s = sum.get(a.account_id); if (s) Object.assign(a, { year_built: s.yb, bldg_sqft: s.sq || null, bldg_class: s.cls, stories: s.st });
      const row = { ...P.stripPrivate(a), source_run_id: run.id }; row.h = P.rowHash(row); await AW.push(row);
      const u = au.get(a.account_id), codes = u?.codes?.length ? u.codes : a._entities.filter(c => c !== 'CAD' && c !== 'ZZZ');
      if (codes.length) await UW.push({ county, account_id: a.account_id, tax_year: y, unit_codes: codes, taxable: u?.taxable || {}, exemptions: u?.ex || {}, partial: false, source_run_id: run.id });
    }
    await AW.flush(); await UW.flush();
    const geo = await geometryCheck(county, ids), sw = await swingCheck({ source, county, roll }, read, vsum);
    await endRun(run, { status: sw.status === 'ok' && geo != null && geo < 80 ? 'warning' : sw.status, rows_read: read, rows_written: AW.n, value_sum: vsum,
      note: [run.note, sw.note, geo != null ? geo + '% of a sample of accounts found in the parcel layer' : null, IW.n + ' improvements', names.size + ' units'].filter(Boolean).join('; ') });
  } catch (e) { await endRun(run, { status: 'failed', errors: [String(e.message)], note: e.message }); }
}

// ---------- Grimes (printed certified roll) ----------
async function grimes() {
  const ls = await links('https://grimescad.org/General-Information/Appraisal-Data/Appraisal-Roll');
  for (const y of YEARS) {
    const url = ls.find(u => new RegExp('/' + y + '%20Certified%20Roll\\.txt|/' + y + ' Certified Roll\\.txt', 'i').test(u)); if (!url) continue;
    const f = await fetchFile(url.split('?')[0]); if (!f) continue;
    if (await seenFile('grimes-roll', f.sha256)) { log('grimes', y, 'unchanged'); continue; }
    const run = await startRun({ source: 'grimes-roll', county: 'Grimes', tax_year: y, roll: 'certified', url: f.url, file_name: f.name, sha256: f.sha256, bytes: f.bytes, ...(await keepRaw(f, 'grimes', y)) });
    try {
      const AW = writer('cad_accounts', 'county,account_id,tax_year'), UW = writer('account_taxing_units', 'county,account_id,tax_year'), names = new Map();
      let read = 0, vsum = 0; const ids = [], seen = new Set();
      for (const b of P.grimesBlocks(fs.readFileSync(f.file, 'latin1').split('\n').slice(0, MAX_ROWS))) { // (about 100 MB of text: read whole)
        const r = P.grimesAccount(b, { taxYear: y }); if (!r || r.account._prefix !== 'R' || seen.has(r.account.account_id)) continue; // (real property: minerals N, personal P left out; a property with several owners is printed once each: the first is kept)
        seen.add(r.account.account_id);
        read++; vsum += r.account.market_value || 0; if (ids.length < 5000) ids.push(r.account.account_id);
        for (const u of r.unitNames) names.set(u.code, u.name);
        const row = { ...P.stripPrivate(r.account), source_run_id: run.id }; row.h = P.rowHash(row); await AW.push(row);
        if (r.units.unit_codes.length) await UW.push({ ...r.units, source_run_id: run.id });
      }
      await AW.flush(); await UW.flush();
      await writeUnits([...names].map(([code, name]) => ({ county: 'Grimes', unit_code: code, name: name.replace(/^CITY (?!OF)/, 'CITY OF '), unit_type: P.typeOfName(name.replace(/^CITY (?!OF)/, 'CITY OF ')) })), 'Grimes', run.id);
      const geo = await geometryCheck('Grimes', ids), sw = await swingCheck({ source: 'grimes-roll', county: 'Grimes', roll: 'certified' }, read, vsum);
      await endRun(run, { status: sw.status === 'ok' && geo != null && geo < 80 ? 'warning' : sw.status, rows_read: read, rows_written: AW.n, value_sum: vsum,
        note: [run.note, sw.note, geo != null ? geo + '% of a sample of accounts found in the parcel layer' : null, 'printed report: no improvement detail'].filter(Boolean).join('; ') });
    } catch (e) { await endRun(run, { status: 'failed', errors: [String(e.message)], note: e.message }); }
  }
}

// ---------- the BIS parcel layers (current year) ----------
const BIS = { Waller: LAYERS.Waller.url, Austin: LAYERS.Austin.url, Washington: LAYERS.Washington.url, Grimes: LAYERS.Grimes.url };
const ROLL_SOURCE = { Washington: 'washington-pacs', Grimes: 'grimes-roll' };
async function layers() {
  const pick = E.LAYER_COUNTIES ? E.LAYER_COUNTIES.split(',').map(x => x.trim()) : Object.keys(BIS);
  for (const [county, url] of Object.entries(BIS).filter(([c]) => pick.includes(c))) {
    try {
      // the layer's tax year; for a county with roll files, only a year newer than its latest roll file is written
      const yq = new URLSearchParams({ f: 'json', where: '1=1', outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: 'owner_tax_yr', outStatisticFieldName: 'y' }]) });
      const y = E.CAD_DIR ? +E.LAYER_YEAR || NOW_YEAR : +((await (await get(url + '/query?' + yq)).json()).features?.[0]?.attributes?.y || 0);
      if (!y) { log('layer', county, 'no tax year'); continue; }
      if (ROLL_SOURCE[county] && db) { const had = await db.select('source_runs', 'source=eq.' + ROLL_SOURCE[county] + '&tax_year=gte.' + y + '&status=in.(ok,warning)&limit=1'); if (had.length) { log('layer', county, y, 'covered by the roll file'); continue; } }
      const run = await startRun({ source: 'bis-layer', county, tax_year: y, roll: 'current', url, file_name: 'FeatureServer/0', sha256: null });
      const AW = writer('cad_accounts', 'county,account_id,tax_year'), UW = writer('account_taxing_units', 'county,account_id,tax_year'), h = crypto.createHash('sha256');
      let read = 0, vsum = 0, off = 0; const seen = new Set();
      for (;;) {
        const page = E.CAD_DIR ? JSON.parse(fs.readFileSync(path.join(E.CAD_DIR, 'layer-' + county + '-' + off + '.json'), 'utf8')) : await (await get(url + '/query?' + new URLSearchParams({ f: 'json', where: 'owner_tax_yr=' + y, outFields: '*', returnGeometry: 'true', outSR: '4326', geometryPrecision: '6', orderByFields: 'ObjectID_1', resultOffset: String(off), resultRecordCount: '2000' }))).json();
        if (page.error) throw new Error(county + ' layer: ' + (page.error.message || 'error'));
        for (const f of page.features || []) {
          const r = P.bisAccount(f.attributes, { county, centroid: P.ringCentroid(f.geometry) }); if (!r.account.account_id || r.account.tax_year !== y || seen.has(r.account.account_id)) continue; // (an account drawn as several polygons: once)
          seen.add(r.account.account_id);
          read++; vsum += r.account.market_value || 0; h.update(JSON.stringify(f.attributes));
          const row = { ...r.account, source_run_id: run.id }; row.h = P.rowHash(row); await AW.push(row);
          if (r.units.unit_codes.length) await UW.push({ ...r.units, source_run_id: run.id });
        }
        if (!(page.features || []).length || !page.exceededTransferLimit || read >= MAX_ROWS) break;
        off += (page.features || []).length; if (!E.CAD_DIR) await sleep(300);
      }
      await AW.flush(); await UW.flush();
      const sw = await swingCheck({ source: 'bis-layer', county, roll: 'current' }, read, vsum);
      await endRun(run, { status: sw.status, rows_read: read, rows_written: AW.n, value_sum: vsum, sha256: h.digest('hex'), note: ['the layer holds only the current year; units listed: county, city and school', sw.note].filter(Boolean).join('; ') });
    } catch (e) { problems.push({ source: 'bis-layer', county, note: e.message }); log('layer', county, 'failed', e.message); }
  }
}

// ---------- run ----------
const T0 = Date.now();
try {
  if (ONLY.includes('comptroller')) await comptroller().catch(e => { problems.push({ source: 'comptroller', note: e.message }); log('comptroller failed', e.message); });
  if (ONLY.includes('rates')) await districtRates();
  if (ONLY.includes('hcad')) await hcad().catch(e => { problems.push({ source: 'hcad', note: e.message }); log('hcad failed', e.message); });
  if (ONLY.includes('fbcad')) await fbcad().catch(e => { problems.push({ source: 'fbcad', note: e.message }); log('fbcad failed', e.message); });
  if (ONLY.includes('washington')) await washington().catch(e => { problems.push({ source: 'washington-pacs', note: e.message }); log('washington failed', e.message); });
  if (ONLY.includes('grimes')) await grimes().catch(e => { problems.push({ source: 'grimes-roll', note: e.message }); log('grimes failed', e.message); });
  if (ONLY.includes('layers')) await layers();
} finally {
  for (const f of Object.values(outs)) f?.end();
  fs.rmSync(TMP, { recursive: true, force: true });
}
log('done in', Math.round((Date.now() - T0) / 1000) + ' s;', runsMem.length, 'files loaded;', problems.length, 'problems');
for (const p of problems) console.log('::' + (p.status === 'warning' ? 'warning' : 'error') + '::' + [p.source, p.county, p.tax_year, p.roll].filter(Boolean).join(' ') + ': ' + (p.note || p.status));
if (problems.some(p => p.status !== 'warning')) process.exitCode = 1;
