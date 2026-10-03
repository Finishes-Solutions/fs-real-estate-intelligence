// FAA aircraft registry (the "Releasable Aircraft Database", public, updated every night by the FAA):
// https://registry.faa.gov/database/ReleasableAircraft.zip
//   MASTER.txt   every US-registered aircraft: N-number, Mode S hex (what ADS-B broadcasts), registrant, address, dates
//   ACFTREF.txt  MFR MDL CODE -> manufacturer, model, seats, engines
//   ENGINE.txt   ENG MFR MDL  -> engine manufacturer and model
// (DEREG, RESERVED, DEALER and DOCINDEX in the same zip aren't needed: live planes are all currently registered.)
// build/live-sync.mjs (step "aircraft") loads it into Supabase (aircraft_registry); api/planes.js ?reg= reads it.
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';

export const FAA_ZIP = 'https://registry.faa.gov/database/ReleasableAircraft.zip';
export const faaUrl = n => 'https://registry.faa.gov/AircraftInquiry/Search/NNumberResult?nNumberTxt=' + encodeURIComponent(String(n || '').replace(/^N/i, ''));

// the named files from a zip (Buffer) -> { MASTER: text, ... } (upper case, without .txt). Stored and deflated entries; no zip64 (the FAA zip is ~60 MB).
export function unzip(buf, want = ['MASTER.txt', 'ACFTREF.txt', 'ENGINE.txt']) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10), out = {}, wanted = new Set(want.map(w => w.toUpperCase()));
  for (let k = 0, p = buf.readUInt32LE(eocd + 16); k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip directory');
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42), name = buf.toString('utf8', p + 46, p + 46 + nameLen), base = name.split('/').pop();
    p += 46 + nameLen + extra + comment;
    if (!wanted.has(base.toUpperCase())) continue;
    if (size === 0xffffffff) throw new Error('zip64 entries are not supported');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28), data = buf.subarray(start, start + size);
    if (method !== 0 && method !== 8) throw new Error('unsupported zip compression ' + method + ' for ' + name);
    out[base.toUpperCase().replace(/\.TXT$/, '')] = (method === 8 ? inflateRawSync(data) : data).toString('utf8');
  }
  return out;
}

// FAA text files: comma-separated, fixed-width padded, no quoting, a UTF-8 BOM and a trailing comma
function table(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/);
  const h = lines[0].split(',').map(x => x.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''));
  return { col: name => h.indexOf(name), rows: lines.slice(1).filter(l => l.trim()).map(l => l.split(',').map(x => x.trim())) };
}
const day = v => /^\d{8}$/.test(v || '') && v !== '00000000' ? v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6, 8) : null;
const int = v => /^\d+$/.test(v || '') ? +v : null;
const zip = v => /^\d{9}$/.test(v || '') ? v.slice(0, 5) + '-' + v.slice(5) : v || null;

// FAA codes -> words (from the database's field documentation, ardata.pdf)
export const REGISTRANT = { 1: 'Individual', 2: 'Partnership', 3: 'Corporation', 4: 'Co-owned', 5: 'Government', 7: 'LLC', 8: 'Non-citizen corporation', 9: 'Non-citizen co-owned' };
export const AIRCRAFT = { 1: 'Glider', 2: 'Balloon', 3: 'Blimp / dirigible', 4: 'Fixed wing, single engine', 5: 'Fixed wing, multi engine', 6: 'Rotorcraft', 7: 'Weight-shift control', 8: 'Powered parachute', 9: 'Gyroplane', H: 'Hybrid lift', O: 'Other' };
export const ENGINE = { 0: 'None', 1: 'Reciprocating', 2: 'Turboprop', 3: 'Turboshaft', 4: 'Turbojet', 5: 'Turbofan', 6: 'Ramjet', 7: '2-cycle', 8: '4-cycle', 9: 'Unknown', 10: 'Electric', 11: 'Rotary' };

// MASTER + ACFTREF + ENGINE text -> rows for public.aircraft_registry (one per N-number, `h` = a hash of the rest so
// the nightly sync only rewrites the aircraft that changed)
export function parseRegistry({ MASTER, ACFTREF, ENGINE: ENG }) {
  const ref = new Map(), eng = new Map();
  if (ACFTREF) { const t = table(ACFTREF), c = ['CODE', 'MFR', 'MODEL', 'NOSEATS', 'NOENG'].map(t.col);
    for (const r of t.rows) ref.set(r[c[0]], { mfr: r[c[1]] || null, model: r[c[2]] || null, seats: int(r[c[3]]), engines: int(r[c[4]]) }); }
  if (ENG) { const t = table(ENG), c = ['CODE', 'MFR', 'MODEL'].map(t.col);
    for (const r of t.rows) { const s = [r[c[1]], r[c[2]]].filter(x => x && x !== 'NONE').join(' '); if (s) eng.set(r[c[0]], s); } }
  const t = table(MASTER), c = {};
  for (const k of ['NNUMBER', 'SERIALNUMBER', 'MFRMDLCODE', 'ENGMFRMDL', 'YEARMFR', 'TYPEREGISTRANT', 'NAME', 'STREET', 'STREET2', 'CITY', 'STATE', 'ZIPCODE', 'COUNTRY',
    'LASTACTIONDATE', 'CERTISSUEDATE', 'TYPEAIRCRAFT', 'TYPEENGINE', 'STATUSCODE', 'FRACTOWNER', 'AIRWORTHDATE', 'EXPIRATIONDATE', 'KITMFR', 'KITMODEL', 'MODESCODEHEX']) c[k] = t.col(k);
  if (c.NNUMBER < 0 || c.NAME < 0 || c.MODESCODEHEX < 0) throw new Error('unexpected MASTER.txt header');
  const other = [1, 2, 3, 4, 5].map(i => t.col('OTHERNAMES' + i)).filter(i => i >= 0), out = new Map();
  for (const r of t.rows) {
    const n = (r[c.NNUMBER] || '').toUpperCase(); if (!/^[1-9][0-9A-Z]{0,4}$/.test(n)) continue;
    const a = ref.get(r[c.MFRMDLCODE]) || {}, hex = (r[c.MODESCODEHEX] || '').toLowerCase();
    const row = { n_number: n, hex: /^[0-9a-f]{6}$/.test(hex) ? hex : null, serial: r[c.SERIALNUMBER] || null,
      mfr: a.mfr || null, model: a.model || null, year_mfr: int(r[c.YEARMFR]), aircraft_type: AIRCRAFT[r[c.TYPEAIRCRAFT]] || null, engine_type: ENGINE[r[c.TYPEENGINE]] || null,
      engine: eng.get(r[c.ENGMFRMDL]) || null, seats: a.seats ?? null, engines: a.engines ?? null,
      registrant_type: REGISTRANT[r[c.TYPEREGISTRANT]] || null, name: r[c.NAME] || null, street: [r[c.STREET], r[c.STREET2]].filter(Boolean).join(', ') || null,
      city: r[c.CITY] || null, state: r[c.STATE] || null, zip: zip(r[c.ZIPCODE]), country: r[c.COUNTRY] || null,
      other_names: other.map(i => r[i]).filter(Boolean), cert_issued: day(r[c.CERTISSUEDATE]), last_action: day(r[c.LASTACTIONDATE]),
      airworthy: day(r[c.AIRWORTHDATE]), expires: day(r[c.EXPIRATIONDATE]), status: r[c.STATUSCODE] || null, fractional: r[c.FRACTOWNER] === 'Y',
      kit: [r[c.KITMFR], r[c.KITMODEL]].filter(Boolean).join(' ') || null };
    if (!row.other_names.length) row.other_names = null;
    row.h = createHash('sha1').update(JSON.stringify(row)).digest('hex').slice(0, 16);
    out.set(n, row);
  }
  return [...out.values()];
}

// what someone typed or ADS-B sent -> { hex } (6 hex digits) or { n } (N-number without the N), else null.
// An N-number is at most 5 characters after the N, so 6 hex digits are always a Mode S code.
export function regKey(s) {
  const t = String(s || '').trim().replace(/^~/, '').replace(/[\s-]/g, '').toUpperCase();
  if (/^[0-9A-F]{6}$/.test(t)) return { hex: t.toLowerCase() };
  const m = t.match(/^N?([1-9][0-9A-Z]{0,4})$/); return m ? { n: m[1] } : null;
}
// Mode S codes the FAA assigns to N-numbers (A00001 = N1 … ADF7C7 = N99999)
export const usHex = hex => /^[0-9a-f]{6}$/.test(hex || '') && hex >= 'a00001' && hex <= 'adf7c7';

const STATUS = { V: 'Valid', R: 'Registration pending' };
const title = s => s ? String(s).toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()) : null;
// a database row -> what the plane card and the assistant show
export function present(r) {
  if (!r) return null;
  return { n_number: 'N' + r.n_number, hex: r.hex, owner: r.name, owner_type: r.registrant_type, other_owners: r.other_names || [],
    address: [r.street, r.city, [r.state, r.zip].filter(Boolean).join(' '), r.country && r.country !== 'US' ? r.country : ''].filter(Boolean).join(', ') || null,
    city: title(r.city), state: r.state, country: r.country,
    aircraft: [r.year_mfr, r.mfr, r.model].filter(Boolean).join(' ') || null, aircraft_type: r.aircraft_type, engine: r.engine, engine_type: r.engine_type,
    seats: r.seats, serial: r.serial, kit: r.kit, fractional: !!r.fractional,
    status: STATUS[r.status] || (r.status ? 'FAA status code ' + r.status : null), registered: r.cert_issued, expires: r.expires, last_action: r.last_action,
    faa_url: faaUrl(r.n_number) };
}

// the three files, from FAA_DIR (a folder with the unzipped files; names may carry a prefix, e.g. "abc-MASTER.txt"),
// FAA_ZIP (a local zip or a URL) or, by default, the FAA's own nightly zip
export async function loadRegistry(env = process.env, fetchImpl = globalThis.fetch) {
  const { readFile, readdir } = await import('node:fs/promises');
  if (env.FAA_DIR) {
    const names = await readdir(env.FAA_DIR), out = {};
    for (const want of ['MASTER', 'ACFTREF', 'ENGINE']) {
      const f = names.find(n => n.toUpperCase().endsWith(want + '.TXT')); if (f) out[want] = await readFile(env.FAA_DIR.replace(/\/$/, '') + '/' + f, 'utf8');
    }
    if (!out.MASTER) throw new Error('no MASTER.txt in ' + env.FAA_DIR + ' (it holds the registered aircraft; DEREG.txt is only the deregistered ones)');
    return out;
  }
  const src = env.FAA_ZIP || FAA_ZIP;
  let buf;
  if (/^https?:/.test(src)) {
    // the FAA site turns away requests without a browser-like User-Agent
    const r = await fetchImpl(src, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) FinishesSolutions RE intelligence', Accept: 'application/zip,*/*' }, signal: AbortSignal.timeout(600000) });
    if (!r.ok) throw new Error('FAA registry download ' + r.status);
    buf = Buffer.from(await r.arrayBuffer());
  } else buf = await readFile(src);
  const files = unzip(buf);
  if (!files.MASTER) throw new Error('MASTER.txt is not in the FAA zip');
  return { MASTER: files.MASTER, ACFTREF: files.ACFTREF, ENGINE: files.ENGINE };
}
