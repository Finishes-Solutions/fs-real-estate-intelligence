// Airport data helpers shared by the nightly sync (build/live-sync.mjs step "airports"), api/airports.js, the plane
// sampler (takeoffs and landings) and the browser. Pure functions, no network.
//   OurAirports CSVs (airports, runways, frequencies; public domain) -> table rows with a change hash
//   FAA d-TPP: the current 28-day chart cycle and each airport's diagram PDF
//   Wikipedia: "Airlines and destinations" and statistics tables out of the article's wikitext
//   runway geometry: is a point under a runway's extended centerline (approach / departure path)?
//   takeoffs and landings from one-minute ADS-B snapshots

export const OURAIRPORTS = 'https://davidmegginson.github.io/ourairports-data/';
export const TYPE_LABEL = { large_airport: 'Large airport', medium_airport: 'Medium airport', small_airport: 'Small airport', heliport: 'Heliport', seaplane_base: 'Seaplane base', balloonport: 'Balloonport', closed: 'Closed' };

// full CSV (quoted fields may hold commas, doubled quotes and newlines) -> array of objects keyed by the header
export function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift() || [];
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
// change hash for a row (no node:crypto, so this file also loads in the browser): two 32-bit FNV-1a passes
const hash = o => { const s = JSON.stringify(o); let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822519) ^ (b >>> 13); }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0'); };
const num = v => v === '' || v == null || Number.isNaN(+v) ? null : +v;
const int = v => num(v) == null ? null : Math.round(+v);
const txt = v => { const s = String(v ?? '').trim(); return s || null; };
export function airportRow(r) {
  const o = { ident: txt(r.ident), type: txt(r.type) || 'small_airport', name: txt(r.name) || r.ident, lat: num(r.latitude_deg), lon: num(r.longitude_deg), elevation_ft: int(r.elevation_ft),
    continent: txt(r.continent), iso_country: txt(r.iso_country), iso_region: txt(r.iso_region), municipality: txt(r.municipality), scheduled: r.scheduled_service === 'yes',
    icao: txt(r.icao_code), iata: txt(r.iata_code), gps_code: txt(r.gps_code), local_code: txt(r.local_code), home_link: txt(r.home_link), wikipedia_link: txt(r.wikipedia_link), keywords: txt(r.keywords) };
  if (!o.ident || o.lat == null || o.lon == null) return null;
  return { ...o, h: hash(o) };
}
export function runwayRow(r) {
  const e = p => ({ [p + '_ident']: txt(r[p + '_ident']), [p + '_lat']: num(r[p + '_latitude_deg']), [p + '_lon']: num(r[p + '_longitude_deg']), [p + '_elevation_ft']: int(r[p + '_elevation_ft']), [p + '_heading']: num(r[p + '_heading_degT']), [p + '_displaced_ft']: int(r[p + '_displaced_threshold_ft']) });
  const o = { id: int(r.id), airport_ident: txt(r.airport_ident), length_ft: int(r.length_ft), width_ft: int(r.width_ft), surface: txt(r.surface), lighted: r.lighted === '1', closed: r.closed === '1', ...e('le'), ...e('he') };
  if (o.id == null || !o.airport_ident) return null;
  return { ...o, h: hash(o) };
}
export function frequencyRow(r) {
  const o = { id: int(r.id), airport_ident: txt(r.airport_ident), type: txt(r.type), description: txt(r.description), mhz: num(r.frequency_mhz) };
  return o.id == null || !o.airport_ident ? null : { ...o, h: hash(o) };
}
export const SURFACE = s => { const x = String(s || '').toUpperCase(); return /^(ASP|ASPH|BIT|PEM)/.test(x) ? 'Asphalt' : /^(CON|PEM|CONC)/.test(x) ? 'Concrete' : /TURF|GRASS|GRS/.test(x) ? 'Grass' : /GRAV|GRVL|GVL/.test(x) ? 'Gravel' : /DIRT|SAND|SOIL/.test(x) ? 'Dirt' : /WATER/.test(x) ? 'Water' : s || '—'; };

// ---------- FAA d-TPP (terminal procedures: the airport diagram PDF) ----------
// 28-day AIRAC cycles numbered YY + sequence within the year; cycle 2610 began 2026-10-01
const REF = Date.UTC(2026, 9, 1), CYCLE = 28 * 864e5;
export function dtppCycle(d = new Date()) {
  const k = Math.floor((d.getTime() - REF) / CYCLE), start = REF + k * CYCLE, y = new Date(start).getUTCFullYear();
  let first = start; while (new Date(first - CYCLE).getUTCFullYear() === y) first -= CYCLE;
  return { cycle: String(y % 100).padStart(2, '0') + String(Math.round((start - first) / CYCLE) + 1).padStart(2, '0'), start: new Date(start).toISOString().slice(0, 10) };
}
// the metafile XML -> Map(FAA ident and ICAO -> diagram PDF name)
export function parseDtpp(xml) {
  const out = new Map(), re = /<airport_name\b([^>]*)>([\s\S]*?)<\/airport_name>/g; let m;
  while ((m = re.exec(xml))) {
    const at = m[1], ident = (at.match(/apt_ident="([^"]*)"/) || [])[1], icao = (at.match(/icao_ident="([^"]*)"/) || [])[1];
    const rec = m[2].split('<record>').find(r => /<chart_code>APD<\/chart_code>/.test(r)); if (!rec) continue;
    const pdf = (rec.match(/<pdf_name>([^<]+)<\/pdf_name>/) || [])[1]; if (!pdf) continue;
    if (ident) out.set(ident, pdf); if (icao) out.set(icao, pdf);
  }
  return out;
}

// ---------- Wikipedia ----------
// wikitext -> plain text: links keep their label, templates and refs go
export function cleanWiki(s) {
  let t = String(s || '').replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  for (let i = 0; i < 4; i++) t = t.replace(/\{\{(?:nowrap|nobr|small|flagicon[^|}]*)\|([^{}]*)\}\}/gi, '$1').replace(/\{\{[^{}]*\}\}/g, '');
  return t.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').replace(/'''?/g, '').replace(/<br\s*\/?>/g, ', ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
// the "Passenger" (or "Cargo") airlines and destinations list -> [{ airline, destinations: n, seasonal: n }]
export function parseAirlines(wikitext) {
  const s = String(wikitext || '').replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const out = new Map();
  // {{Airport-dest-list| airline | destinations | airline | destinations … }} or wikitable rows "| [[Airline]] || dests"
  const body = (s.match(/\{\{\s*Airport[- ]dest[- ]list\s*\|([\s\S]*)\}\}/i) || [])[1];
  const pairs = [];
  if (body) {
    // split on top-level pipes only
    const parts = []; let depth = 0, cur = '';
    for (let i = 0; i < body.length; i++) { const two = body.slice(i, i + 2);
      if (two === '{{' || two === '[[') { depth++; cur += two; i++; continue; } if (two === '}}' || two === ']]') { depth--; cur += two; i++; continue; }
      if (body[i] === '|' && depth === 0) { parts.push(cur); cur = ''; continue; } cur += body[i]; }
    parts.push(cur);
    const clean = parts.map(p => p.trim()).filter(p => p !== '' && !/^\d+\s*=/.test(p) && !/^(3rdcoltitle|3rdcolunsortable)/i.test(p));
    for (let i = 0; i + 1 < clean.length; i += 2) pairs.push([clean[i], clean[i + 1]]);
  } else {
    for (const row of s.split(/\n\|-/)) { const cells = row.split(/\n\||\|\|/).map(c => c.trim()).filter(Boolean); if (cells.length >= 2 && /\[\[/.test(cells[0])) pairs.push([cells[0], cells[1]]); }
  }
  for (const [a, d] of pairs) {
    const airline = cleanWiki(a).replace(/\s*\|.*$/, ''); if (!airline || airline.length > 60) continue;
    const seasonalAt = d.search(/\{\{\s*Airline[- ]dest[- ]seasonal|'''Seasonal/i), main = seasonalAt >= 0 ? d.slice(0, seasonalAt) : d, seas = seasonalAt >= 0 ? d.slice(seasonalAt) : '';
    const count = x => (x.match(/\[\[/g) || []).length;
    const e = out.get(airline) || { airline, destinations: 0, seasonal: 0 }; e.destinations += count(main); e.seasonal += count(seas); out.set(airline, e);
  }
  return [...out.values()].filter(x => x.destinations + x.seasonal > 0).sort((a, b) => (b.destinations + b.seasonal) - (a.destinations + a.seasonal));
}
// every wikitable in a section -> [{ caption, headers, rows }]
export function parseTables(wikitext) {
  const out = [];
  for (const m of String(wikitext || '').matchAll(/\{\|([\s\S]*?)\n\|\}/g)) {
    const body = m[1], caption = cleanWiki((body.match(/\n\|\+([^\n]*)/) || [])[1] || '');
    const chunks = body.split(/\n\|-[^\n]*/).slice(1);
    let headers = []; const rows = [];
    for (const c of chunks) {
      const lines = c.split('\n').filter(l => /^[!|]/.test(l) && !/^\|\+/.test(l));
      const isHead = lines.length && lines.every(l => l.startsWith('!'));
      const cells = lines.flatMap(l => l.slice(1).split(/\|\||!!/)).map(x => { const i = x.indexOf('|'); return cleanWiki(i >= 0 && !/\[\[|\{\{/.test(x.slice(0, i)) ? x.slice(i + 1) : x); }); // drop a cell's style=… prefix
      if (!cells.length) continue; if (isHead && !headers.length) headers = cells; else rows.push(cells);
    }
    if (rows.length) out.push({ caption, headers, rows: rows.slice(0, 40) });
  }
  return out;
}

// ---------- geometry ----------
const NM = 1852, R = 6371008.8;
// metres east / north of p from o (fine within a few tens of km)
const enu = (o, p) => [(p[0] - o[0]) * Math.PI / 180 * R * Math.cos(o[1] * Math.PI / 180), (p[1] - o[1]) * Math.PI / 180 * R];
export const distNm = (a, b) => { const [x, y] = enu(a, b); return Math.hypot(x, y) / NM; };
// a point under a runway's extended centerline: within `width` nm either side, out to `out` nm beyond either end
export function underPath(pt, runways, { out = 10, width = 0.5 } = {}) {
  let best = null;
  for (const r of runways || []) {
    if (r.closed || r.le_lat == null || r.he_lat == null) continue;
    const le = [r.le_lon, r.le_lat], he = [r.he_lon, r.he_lat], [dx, dy] = enu(le, he), len = Math.hypot(dx, dy); if (len < 100) continue;
    const ux = dx / len, uy = dy / len, [px, py] = enu(le, pt), along = px * ux + py * uy, off = Math.abs(px * uy - py * ux) / NM;
    let beyond = null, end = null;
    if (along < 0) { beyond = -along / NM; end = r.le_ident; } else if (along > len) { beyond = (along - len) / NM; end = r.he_ident; }
    if (beyond == null || beyond > out || off > width) continue;
    // aircraft landing on the runway at `end` fly over this point (and aircraft taking off the other way climb out over it)
    const c = { runway: r.le_ident + '/' + r.he_ident, end, landing_runway: end, beyond_nm: +beyond.toFixed(2), offset_nm: +off.toFixed(2), length_ft: r.length_ft };
    if (!best || c.beyond_nm < best.beyond_nm) best = c;
  }
  return best;
}

// ---------- takeoffs and landings from one-minute ADS-B snapshots ----------
// airports: [{ ident, lon, lat, elev }], aircraft: normalized (lib/planes.mjs), prev: Map(hex -> { ident, ground, alt })
// A plane is "low" at an airport when it reports being on the ground there, or is within 2 nm under 200 ft above it.
// Landing: low now, airborne at the previous sample. Takeoff: low at the previous sample, now 400+ ft up (or seen for the
// first time within 3 nm under 1,500 ft and climbing). Returns the events and the states to remember.
export function opsStep(airports, aircraft, prev) {
  const near = p => { let best = null, bd = Infinity; for (const a of airports) { if (Math.abs(a.lat - p[1]) > .08 || Math.abs(a.lon - p[0]) > .09) continue; const d = distNm(p, [a.lon, a.lat]); if (d < bd) { bd = d; best = a; } } return best ? { a: best, d: bd } : null; };
  const events = new Map(), states = [];
  const add = (ident, k) => { const e = events.get(ident) || { ident, dep: 0, arr: 0 }; e[k]++; events.set(ident, e); };
  for (const x of aircraft || []) {
    if (!x.hex || x.lat == null || x.lon == null) continue;
    const ground = x.ground === true || x.alt === 'ground'; const alt = ground ? 0 : +x.alt;
    if (!ground && !(alt < 6000)) continue; // cruising traffic isn't arriving or leaving here
    const n = near([x.lon, x.lat]); const agl = ground ? 0 : n ? alt - (n.a.elev || 0) : alt;
    const low = !!n && (ground ? n.d <= 3 : n.d <= 2 && agl < 200);
    const p = prev.get(x.hex);
    if (p) {
      if (low && !p.ground) add(n.a.ident, 'arr');
      else if (p.ground && p.ident && !low && !ground && agl >= 400) add(p.ident, 'dep');
    } else if (!low && n && n.d <= 3 && agl < 1500 && (x.vs || 0) > 300) add(n.a.ident, 'dep');
    states.push({ hex: x.hex, ident: low ? n.a.ident : '', ground: low, alt: Math.round(agl) });
  }
  return { events: [...events.values()], states };
}
