// Street rules by location (NEIGHBORHOOD-PLAN.md, phase 4b): one rule sheet per jurisdiction (a city, a county, a city's
// ETJ in a county, a drainage district), each value with the page it was read from, a sure / unsure flag and where it
// came from (the code, Waller County's defaults standing in, a person's edit). The AI reads the codes (api/siteplan.js
// mode 'rules'); this file turns its answer into a sheet, cleans sheets stored or synced (api/rulesheets.js,
// src/rulesheets.js), says what still wants a person to confirm, and gives the plan its snapshot (plan.params.code) that
// the street generator, the entries, the storm sizing and the checks read. Pure: no imports, so lib/siteplan.mjs and
// lib/streetnet.mjs can both use it. Never a compliance claim: the AI's reading of the code, for the engineer to confirm.

// the values a sheet holds, in the order Settings shows them: { k, label, unit, lo, hi, group, choice? }
export const FIELDS = [
  { k: 'localRow', label: 'Local street right-of-way', unit: 'ft', lo: 40, hi: 120, group: 'streets' },
  { k: 'localPave', label: 'Local street pavement', unit: 'ft', lo: 20, hi: 40, group: 'streets' },
  { k: 'collRow', label: 'Collector right-of-way', unit: 'ft', lo: 50, hi: 120, group: 'streets' },
  { k: 'collPave', label: 'Collector pavement', unit: 'ft', lo: 24, hi: 48, group: 'streets' },
  { k: 'blockMax', label: 'Longest block', unit: 'ft', lo: 600, hi: 3000, group: 'streets' },
  { k: 'culMax', label: 'Longest cul-de-sac', unit: 'ft', lo: 300, hi: 1500, group: 'streets' },
  { k: 'bulbRow', label: 'Cul-de-sac right-of-way radius', unit: 'ft', lo: 40, hi: 75, group: 'streets' },
  { k: 'bulbR', label: 'Cul-de-sac pavement radius', unit: 'ft', lo: 35, hi: 60, group: 'streets' },
  { k: 'junctionMin', label: 'Intersection spacing', unit: 'ft', lo: 60, hi: 400, group: 'streets' },
  { k: 'collJunctionMin', label: 'Intersection spacing on a collector', unit: 'ft', lo: 100, hi: 1000, group: 'streets' },
  { k: 'drivewaySpacing', label: 'Driveway spacing', unit: 'ft', lo: 0, hi: 2000, group: 'entries' },
  { k: 'drivewayCorner', label: 'Driveway corner clearance', unit: 'ft', lo: 0, hi: 1000, group: 'entries' },
  { k: 'sidewalk', label: 'Sidewalks', unit: '', choice: ['both', 'one', 'none'], group: 'walks' },
  { k: 'sidewalkW', label: 'Sidewalk width', unit: 'ft', lo: 3, hi: 10, group: 'walks' },
  { k: 'minLotSf', label: 'Smallest lot', unit: 'sf', lo: 1000, hi: 87120, group: 'lots' },
  { k: 'minLotW', label: 'Smallest lot frontage', unit: 'ft', lo: 20, hi: 200, group: 'lots' },
  { k: 'frontBL', label: 'Front building line', unit: 'ft', lo: 0, hi: 100, group: 'lots' },
  { k: 'sideBL', label: 'Side building line on a street', unit: 'ft', lo: 0, hi: 60, group: 'lots' },
  { k: 'detention', label: 'Detention', unit: 'ac-ft/ac', lo: 0, hi: 2, group: 'drainage' },
  { k: 'secondAt', label: 'Second way in over', unit: 'lots', lo: 10, hi: 2000, group: 'streets' }
];
const BY = Object.fromEntries(FIELDS.map(f => [f.k, f])), CHOICE = ['both', 'one', 'none'];
export const KEYS = FIELDS.map(f => f.k);
const str = (v, n) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '', iso = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(Date.parse(v)).toISOString() : null;
const url0 = v => { if (typeof v !== 'string' || v.length > 500) return null; try { const u = new URL(v.trim()); return /^https?:$/.test(u.protocol) ? u.href : null; } catch (e) { return null; } }, hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
// a value held to its field: a number in range, or one of the sidewalk choices; else null
export const valueOk = (k, v) => { const f = BY[k]; if (!f) return null; if (f.choice) return f.choice.includes(v) ? v : null; if (v === null || v === '' || typeof v === 'boolean' || !Number.isFinite(+v)) return null; const n = +v; return n >= f.lo && n <= f.hi ? Math.round(n * 100) / 100 : null; };
// a value said in words: "60 ft", "both sides, 5 ft", "0.55 ac-ft/ac"
export const valueText = (k, v) => { const f = BY[k]; if (!f || v == null) return '—'; if (f.choice) return { both: 'both sides', one: 'one side', none: 'none' }[v] || v; return (+v).toLocaleString('en-US') + (f.unit ? ' ' + f.unit : ''); };
export const slug = s => String(s || '').toLowerCase().replace(/\b(county|city of|city|town of|village of)\b/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const title = s => String(s || '').replace(/\s+county$/i, '').trim().replace(/\b[a-z]/g, c => c.toUpperCase());

// ---------- Waller County's rules: the default where a place's own code can't be found (decided Oct 19) ----------
// Read once (Oct 20, 2026) through search snippets: the county's site is blocked from where this was built, so values not
// quoted there are typical ones, marked unsure, until someone reads the PDF. The detention rate in Appendix E wasn't read:
// 0.55 (typical Harris County) stands in, flagged, so layouts size ponds as before.
const REGS = 'https://www.co.waller.tx.us/upload/page/0263/Subdivision%20-%20Development%20Regulations%20REVISED_FINAL-12-06-2023.pdf';
const CHECK = 'https://www.co.waller.tx.us/upload/page/0263/Preliminary%20Plat%20Replat%20Checklist%2002-22-2024.pdf';
const TYPICAL = 'not found in the regulations; typical value';
const W = (v, sure, url, cite, quote = null) => ({ v, url, cite, quote, sure, from: 'waller' });
export const WALLER = { v: 1, key: 'county:waller', name: 'Waller County', kind: 'county', etj: null, at: '2026-10-20T00:00:00.000Z', updated: '2026-10-20T00:00:00.000Z', by: 'Read for the app', src: 'waller',
  summary: 'Waller County Subdivision and Development Regulations (revised Dec 6, 2023) and the preliminary plat checklist (Feb 22, 2024). Values marked unsure weren’t found in the text that could be read: typical values stand in.',
  values: {
    localRow: W(60, true, REGS, 'Street design: local street right-of-way 60 ft (70 ft for a rural open-ditch section)'),
    localPave: W(28, false, REGS, TYPICAL),
    collRow: W(80, false, REGS, '§4.2.2: collector right-of-way 80 ft (from a 2024 variance asking for 60 ft instead of 80 ft)'),
    collPave: W(36, false, REGS, TYPICAL),
    blockMax: W(1400, false, REGS, 'Block length: a table by average lot size (not read); typical value'),
    culMax: W(800, false, REGS, TYPICAL),
    bulbRow: W(70, true, REGS, 'Cul-de-sacs: right-of-way radius 70 ft'),
    bulbR: W(50, true, REGS, 'Cul-de-sacs: pavement (base) radius 50 ft'),
    junctionMin: W(125, false, REGS, TYPICAL),
    collJunctionMin: W(300, false, REGS, TYPICAL),
    drivewaySpacing: W(150, false, REGS, TYPICAL),
    drivewayCorner: W(100, false, REGS, TYPICAL),
    sidewalk: W('both', false, REGS, TYPICAL),
    sidewalkW: W(5, false, REGS, TYPICAL),
    minLotSf: W(6000, false, REGS, TYPICAL),
    minLotW: W(50, true, REGS, '§3.4.7: lots at least 50 ft wide at the right-of-way line (50 ft at the building line on a cul-de-sac)'),
    frontBL: W(25, true, CHECK, 'Preliminary plat checklist: front building line 25 ft'),
    sideBL: W(15, true, CHECK, 'Preliminary plat checklist: side building line 15 ft on a local street (25 ft on a collector, 35 ft on an arterial)'),
    detention: W(0.55, false, REGS, 'Appendix E §5 (detention): rate not read; 0.55 (typical Harris County) stands in'),
    secondAt: W(30, false, REGS, TYPICAL)
  } };

// ---------- where a site is ----------
// the jurisdiction from the project's facts (lib/project.mjs siteFactsFrom: county, place, water districts) and the AI's
// ETJ decision ({ city, decided }): { key, name, kind, county, city, dd } or null with no county
export function jurisdictionOf(facts, etj = null) {
  const f = facts || {}, c = title(f.county), cs = slug(c); if (!cs) return null;
  const place = f.place?.name ? str(f.place.name, 60) : null, ec = !place && etj?.decided === 'in' && etj.city ? title(String(etj.city).replace(/^city of\s+/i, '')) : null;
  const dd = (Array.isArray(f.water) ? f.water : []).find(w => /drainage/i.test((w?.type || '') + ' ' + (w?.name || '')));
  const base = place ? { key: 'city:' + slug(place), name: 'City of ' + place, kind: 'city', city: place } : ec ? { key: 'etj:' + slug(ec) + '|county:' + cs, name: ec + ' ETJ in ' + c + ' County', kind: 'etj', city: ec } : { key: 'county:' + cs, name: c + ' County', kind: 'county', city: null };
  return { ...base, key: (base.key + (dd && slug(dd.name) ? '|dd:' + slug(dd.name) : '')).slice(0, 120), county: c, dd: dd ? str(dd.name, 80) : null };
}
// the AI's ETJ answer (JSON, perhaps fenced or with a sentence round it): { etj, decided, why, url } or null
export function parseEtj(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/); if (!m) return null; let d; try { d = JSON.parse(m[0]); } catch (e) { return null; }
  const city = typeof d.etj === 'string' && d.etj.trim() && !/^(none|null|no)$/i.test(d.etj.trim()) ? str(d.etj, 60) : null, dec = ['in', 'out', 'unsure'].includes(d.decided) ? d.decided : city ? 'unsure' : 'out';
  return { etj: dec === 'out' ? null : city, decided: dec === 'in' && !city ? 'unsure' : dec, why: str(d.why, 300), url: url0(d.url) };
}

// ---------- sheets ----------
const etjIn = e => e && typeof e === 'object' ? { city: str(e.city, 60) || null, decided: ['in', 'out', 'unsure'].includes(e.decided) ? e.decided : 'unsure', why: str(e.why, 300), url: url0(e.url) } : null;
const okIn = o => o && typeof o === 'object' && iso(o.at) ? { by: str(o.by, 80), at: iso(o.at) } : null;
function valIn(k, x) {
  if (!x || typeof x !== 'object') return null; const v = valueOk(k, x.v); if (v == null) return null; const from = ['code', 'waller', 'hand'].includes(x.from) ? x.from : 'code', ok = okIn(x.ok), url = url0(x.url);
  return { v, url, cite: str(x.cite, 160) || null, quote: str(x.quote, 200) || null, sure: !!x.sure && (!!url || from === 'hand'), from, ...(ok ? { ok } : {}), ...(x.was && typeof x.was === 'object' ? { was: { url: url0(x.was.url), cite: str(x.was.cite, 160) || null } } : {}) };
}
// a sheet stored or synced, cleaned (unknown keys dropped, values held to their fields, at most 40 KB); null when it isn't one
export function sheetIn(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null; const key = typeof doc.key === 'string' ? doc.key.toLowerCase() : '';
  if (!/^[a-z0-9:|_-]{3,120}$/.test(key) || !doc.values || typeof doc.values !== 'object') return null;
  const values = {}; for (const k of KEYS) { const v = valIn(k, doc.values[k]); if (v) values[k] = v; } if (!Object.keys(values).length) return null;
  const now = new Date().toISOString(), out = { v: 1, key, name: str(doc.name, 120) || key, kind: ['city', 'county', 'etj'].includes(doc.kind) ? doc.kind : 'county', etj: etjIn(doc.etj), at: iso(doc.at) || now, updated: iso(doc.updated) || iso(doc.at) || now, by: str(doc.by, 80), src: ['ai', 'waller', 'hand'].includes(doc.src) ? doc.src : 'ai', summary: str(doc.summary, 800), values };
  return JSON.stringify(out).length <= 40000 ? out : null;
}
// Waller County's values standing in for a place whose code couldn't be found or read: every one a Waller default, unsure
export function standIn(o = {}) {
  const now = o.now || new Date().toISOString();
  return { ...structuredClone(WALLER), key: o.key || WALLER.key, name: o.name || WALLER.name, kind: o.kind || 'county', etj: etjIn(o.etj), at: now, updated: now, by: str(o.by, 80), src: 'waller', summary: 'The local code couldn’t be found or read, so Waller County’s rules stand in.' + (o.why ? ' ' + str(o.why, 200) : ''), values: Object.fromEntries(Object.entries(WALLER.values).map(([k, x]) => [k, { ...x, sure: false, from: 'waller' }])) };
}
// the AI's structured reading of the codes (api/siteplan.js RULES_SCHEMA) as a sheet: only fields it knows, each in range;
// a value is sure only when the AI says so and its page is among the pages the search read (or on the same site); what's
// missing is Waller's value, standing in (unsure)
export function sheetFrom(ai, o = {}) {
  const now = o.now || new Date().toISOString(), src = (o.sources || []).map(s => url0(typeof s === 'string' ? s : s?.url)).filter(Boolean), hosts = new Set(src.map(hostOf)), values = {};
  for (const x of Array.isArray(ai?.values) ? ai.values : []) { const k = x?.field; if (!BY[k] || values[k]) continue; const v = valueOk(k, BY[k].choice ? x.choice ?? x.value : x.value); if (v == null) continue;
    const url = url0(x.url), seen = !!url && (src.includes(url) || hosts.has(hostOf(url)));
    values[k] = { v, url, cite: str(x.cite, 160) || null, quote: str(x.quote, 200) || null, sure: !!x.sure && seen, from: 'code' }; }
  for (const k of KEYS) if (!values[k]) values[k] = { ...WALLER.values[k], sure: o.key === WALLER.key && WALLER.values[k].sure, from: 'waller' };
  return { v: 1, key: o.key || WALLER.key, name: o.name || str(ai?.jurisdiction?.name, 120) || WALLER.name, kind: o.kind || (['city', 'county', 'etj'].includes(ai?.jurisdiction?.kind) ? ai.jurisdiction.kind : 'county'), etj: etjIn(o.etj), at: now, updated: now, by: str(o.by, 80), src: 'ai', summary: str(ai?.summary, 800), values };
}
const standing = s => k => s.values[k]?.from === 'waller' && s.key !== WALLER.key;
// the values a person should confirm: those the AI marked unsure, and Waller defaults standing in, not yet confirmed
export const flagged = s => !s?.values ? [] : KEYS.filter(k => s.values[k] && !s.values[k].ok && (!s.values[k].sure || standing(s)(k)));
const bump = (s, k, x) => ({ ...s, updated: new Date(Math.max(Date.now(), Date.parse(s.updated || 0) + 1)).toISOString(), values: { ...s.values, [k]: x } });
// a value confirmed as it stands, by a person
export const confirm = (s, k, by) => !s?.values?.[k] ? s : bump(s, k, { ...s.values[k], ok: { by: str(by, 80), at: new Date().toISOString() } });
// a value edited by hand (null when it isn't one the field takes): sure, confirmed, its old source kept in was
export function edit(s, k, v, by) {
  const val = valueOk(k, v); if (val == null || !s?.values) return null; const o = s.values[k] || {};
  return bump(s, k, { v: val, url: null, cite: null, quote: null, sure: true, from: 'hand', ok: { by: str(by, 80), at: new Date().toISOString() }, ...(o.url || o.cite ? { was: { url: o.url || null, cite: o.cite || null } } : {}) });
}
// a place's rules read again (Refresh) over the team's sheet: a value a person edited stays as they set it, one read from
// the code before stays when the new reading found nothing (a Waller default now), and a confirmation stays on a value that
// came back the same. A reading that failed altogether (Waller's standing in for every value) changes nothing
export function merge(was, s) {
  if (!was?.values || !s?.values || was.key !== s.key) return s; if (s.src === 'waller' && was.src !== 'waller') return was;
  const values = { ...s.values }; for (const k of KEYS) { const o = was.values[k], n = s.values[k]; if (!o) continue;
    if (o.from === 'hand' || !n || n.from === 'waller' && o.from === 'code') values[k] = o; else if (o.ok && n.v === o.v && n.from === o.from) values[k] = { ...n, ok: o.ok }; }
  return { ...s, values };
}
export const old = (s, now = Date.now()) => !s || now - Date.parse(s.at || s.updated || 0) > 365 * 864e5;
// the plan's snapshot of a sheet (plan.params.code): the numbers the layout engine reads (its worker has no network)
export function codeParams(s) {
  if (!s?.values) return null; const v = k => s.values[k]?.v ?? WALLER.values[k].v;
  return { key: s.key, name: s.name, kind: s.kind, at: s.at, updated: s.updated, flagged: flagged(s), stand: KEYS.filter(standing(s)), etj: s.etj || null,
    streetRules: { local: { pave: v('localPave'), row: v('localRow') }, collector: { pave: v('collPave'), row: v('collRow') }, blockMax: v('blockMax'), culMax: v('culMax'), bulbR: v('bulbR'), bulbRow: v('bulbRow'), junctionMin: v('junctionMin'), collJunctionMin: v('collJunctionMin'), frontBL: v('frontBL'), sideBL: v('sideBL'), minLotW: v('minLotW'), minLotSf: v('minLotSf'), secondAt: v('secondAt') },
    entry: { spacing: v('drivewaySpacing'), corner: v('drivewayCorner') }, storm: { rate: v('detention') }, sidewalk: { sides: v('sidewalk'), w: v('sidewalkW') } };
}
const plur = (n, one, many) => n + ' ' + (n === 1 ? one : many);
// the line the notes, the layout card and the sheet carry: which rules the streets follow, and never a compliance claim
export function rulesLine(code) {
  if (!code?.name) return 'Street rules: typical values (no rule sheet for this place yet).';
  const f = (code.flagged || []).length, st = (code.stand || []).length, who = code.kind === 'city' || code.kind === 'etj' ? 'the city' : 'the county';
  return 'Street rules: ' + code.name + ' rule sheet (' + (f ? plur(f, 'value', 'values') + ' still to confirm' : 'every value read or confirmed') + (st ? '; Waller defaults stand in for ' + st : '') + '). The AI’s reading of the code, not a compliance check: confirm with the engineer and ' + who + '.';
}
