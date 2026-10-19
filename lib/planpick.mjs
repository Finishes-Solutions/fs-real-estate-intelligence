// Choosing between generated layouts: whether each passes the checks, which one is recommended and why, what makes the
// others different, what the engine's notes mean (a problem, a warning, or just information), Phase 1 (what was asked
// for) before the full build-out, and the sort orders. No DOM and no engine here: plain data in, plain data out, so it
// can be tested (test/planpick.mjs). Used by src/siteplan.js for the Layouts cards and the overview.

const f0 = v => Math.round(v).toLocaleString('en-US');
const plural = (n, w) => f0(n) + ' ' + w + (n === 1 ? '' : 's');

// ---------- the checks ----------
// What the checks found, kept per layout: problems that block it (outside the lot, in a setback, overlaps, over the
// zoning limits: level 'bad') and how many parking spaces it is short. The same levels as the overview's.
export function checksOf(issues, m) {
  const bad = (issues || []).filter(i => i.level === 'bad').length, short = m && m.gfa ? Math.max(0, Math.round((m.required || 0) - (m.spaces || 0))) : 0;
  return { bad, short };
}
// a layout passes when nothing blocks it and it parks; unknown (not checked yet) is null
export const passes = c => !c || c.bad == null ? null : !c.bad && !(c.short > 0);
// the checks as a pill: "Passes", "Parking short 79", "2 problems"
export function checkLabel(c) {
  if (!c) return { level: 'na', text: 'Not checked' };
  if (c.bad == null) return c.short > 0 ? { level: 'bad', text: 'Parking short ' + f0(c.short) } : { level: 'na', text: 'Checked when laid out' };
  const n = c.bad + (c.short > 0 ? 1 : 0);
  if (!n) return { level: 'ok', text: 'Passes' };
  if (!c.bad) return { level: 'bad', text: 'Parking short ' + f0(c.short) };
  return { level: 'bad', text: plural(n, 'problem') };
}

// ---------- the engine's notes, by how much they matter ----------
// Free text from the layout engine, sorted by a few patterns (until the engine tags its own levels). The first rule that
// matches wins; anything else is information, never a warning.
export const NOTE_RULES = [
  ['info', /^stormwater(?: sized|:)|^phase 1 is what was asked/i],
  ['warn', /\b(?:detention|retention|ponds?|lake)\b.*\b(?:holds? about|no room)|no room left for detention/i],
  ['bad', /\bshort\b|didn[’']t fit|did not fit|could ?n[o’']t|cannot|no room|fits (?:about )?[\d,]+ of|room for [\d,]+ of|needs about [\d.]+ acres|scaled to fit|only [\d,]+ of/i],
  ['warn', /\b(?:drive|driveway|entry|entrance|side street|pull-through|access|turn lanes?|parking|stacking)\b/i]
];
export function noteLevel(text) { const t = String(text || ''); for (const [level, re] of NOTE_RULES) if (re.test(t)) return level; return 'info'; }
const ORDER = { bad: 0, warn: 1, info: 2 };
export const byLevel = notes => (notes || []).filter(Boolean).map(text => ({ text, level: noteLevel(text) })).sort((a, b) => ORDER[a.level] - ORDER[b.level]);
// Notes every layout has (said once, above the cards) and each one's own
export function splitNotes(lists) {
  const ls = (lists || []).map(l => [...new Set((l || []).filter(Boolean))]); // the engine can say the same thing twice (one per zone)
  const shared = ls.length > 1 ? (ls[0] || []).filter(t => ls.every(l => l.includes(t))) : [];
  return { shared, own: ls.map(l => l.filter(t => !shared.includes(t))) };
}
// "The program needs about 12.9 acres; it was scaled to fit 4.7." → { need: 12.9, site: 4.7 }
export function acreageGap(notes) {
  for (const t of notes || []) { const m = /needs about (\d+(?:\.\d+)?) acres; it was scaled to fit (\d+(?:\.\d+)?)/i.exec(t || ''); if (m) return { need: +m[1], site: +m[2] }; }
  return null;
}

// ---------- Phase 1 (what was asked for) before the full build-out ----------
// what was asked for: the program's `asked` (a filled site), else its own size when it names one
export function askedOf(prog) {
  if (!prog) return null;
  if (prog.asked && (prog.asked.units || prog.asked.gfa || prog.asked.buildings)) return prog.asked;
  if (prog.max || prog.zones?.length > 1) return null;
  return prog.units || prog.gfa ? { units: prog.units || null, gfa: prog.units ? null : prog.gfa || null, buildings: null } : null;
}
// The headline for a layout: Phase 1 first. m: the whole site's metrics; m1: Phase 1's (null when there's no Phase 2).
// → { big: '216 units', sub: '7 buildings · as asked', fit: '' | '160 of 200 units', p2: '' | '+ Phase 2: 31 more buildings, 997 units', units: bool }
export function headline(m, m1, asked) {
  if (!m) return { big: '—', sub: '', fit: '', p2: '' };
  const a = m1 || m, units = !!(a.units || m.units), big = units ? plural(a.units || 0, 'unit') : f0(a.gfa || 0) + ' sf';
  const B = a.buildings || 0; let fit = '', ok = false;
  if (asked) {
    if (asked.units && units) { ok = (a.units || 0) >= asked.units * 0.97; fit = ok ? '' : f0(a.units || 0) + ' of ' + f0(asked.units) + ' units'; }
    else if (asked.gfa && !units) { ok = (a.gfa || 0) >= asked.gfa * 0.97; fit = ok ? '' : f0(a.gfa || 0) + ' of ' + f0(asked.gfa) + ' sf'; }
    else if (asked.buildings) { ok = B >= asked.buildings; fit = ok ? '' : B + ' of ' + plural(asked.buildings, 'building'); }
  }
  const sub = [a.storage?.units ? f0(a.storage.nrsf) + ' sf rentable · ~' + f0(a.storage.units) + ' units' : a.foodtrucks?.trucks ? plural(a.foodtrucks.trucks, 'food truck') + ' · ~' + f0(a.foodtrucks.seats) + ' seats' : a.fuel?.mpds ? plural(a.fuel.mpds, 'pump') + ' · ' + a.fuel.positions + ' fueling positions' : plural(B, 'building'), ok ? 'as asked' : ''].filter(Boolean).join(' · '); // storage: what it rents; a gas station: its pumps
  let p2 = '';
  if (m1) { const b2 = (m.buildings || 0) - (m1.buildings || 0), u2 = (m.units || 0) - (m1.units || 0), g2 = (m.gfa || 0) - (m1.gfa || 0);
    if (b2 > 0) p2 = '+ Phase 2: ' + f0(b2) + ' more building' + (b2 === 1 ? '' : 's') + ', ' + (units && u2 > 0 ? plural(u2, 'unit') : f0(Math.round(g2 / 100) * 100) + ' sf'); }
  return { big, sub, fit, p2, units };
}

// ---------- money ----------
// $M with one decimal, or two when one decimal would make two different amounts read the same
export function moneyDigits(values) {
  const vs = (values || []).filter(v => v != null && isFinite(v)), one = new Map();
  for (const v of vs) { const k = (v / 1e6).toFixed(1), was = one.get(k); if (was != null && Math.round(was / 1e4) !== Math.round(v / 1e4)) return 2; one.set(k, v); }
  return 1;
}
export function fmtM(v, d = 1) {
  if (v == null || !isFinite(v)) return '—';
  const s = v < 0 ? '−' : '', a = Math.abs(v);
  return s + '$' + (a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(d) + 'M' : a >= 1e3 ? Math.round(a / 1e3) + 'k' : f0(a));
}
export const fmtPct = (v, d = 2) => v == null || !isFinite(v) ? '—' : (v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(d) + '%';

// ---------- the set: recommended, badges, what differs, what's the same ----------
// The recommended layout: the AI's first choice when it reviewed them, else the engine's first layout that passes every
// check (engine order is `rank`, highest first). Returns { index, by: 'ai' | 'engine' } or null.
export function recommended(list, aiPick) {
  const vs = list || [];
  if (aiPick) { const i = vs.findIndex(v => v.key === aiPick); if (i >= 0) return { index: i, by: 'ai' }; }
  let best = -1; vs.forEach((v, i) => { if (passes(v.chk) && v.m?.gfa && (best < 0 || (v.rank ?? -i) > (vs[best].rank ?? -best))) best = i; });
  return best >= 0 ? { index: best, by: 'engine' } : null;
}
// A short reason the engine's pick is recommended
export function engineReason(list, i) {
  const v = list[i], ok = list.filter(x => passes(x.chk) && x.m?.gfa), g = x => Math.round((x.m1 || x.m).gfa), top = Math.max(...ok.map(g));
  return g(v) === top && ok.filter(x => g(x) === top).length === 1 ? 'Most floor area that passes every check' : 'The planner’s first layout that passes every check';
}
// Badges across the set (a badge only for a clear leader, among the layouts that pass when any do)
export function badges(list, rec) {
  const out = (list || []).map(() => []), has = list.map((v, i) => v.m?.gfa ? i : -1).filter(i => i >= 0);
  if (rec) out[rec.index].push('Recommended');
  if (has.length < 2) return out;
  const pool = has.some(i => passes(list[i].chk)) ? has.filter(i => passes(list[i].chk)) : has;
  const lead = (f, label) => { const vals = pool.map(i => f(list[i])), best = Math.max(...vals.filter(v => v != null && isFinite(v))); if (!isFinite(best)) return;
    const at = pool.filter((i, k) => vals[k] === best); if (at.length === 1 && pool.length > 1) out[at[0]].push(label); };
  const units = pool.some(i => (list[i].m1 || list[i].m).units);
  lead(v => units ? (v.m1 || v.m).units || 0 : Math.round((v.m1 || v.m).gfa), units ? 'Most units' : 'Most floor area');
  lead(v => v.fin?.forSale ? null : v.fin?.yoc != null ? Math.round(v.fin.yoc * 1e4) : null, 'Best yield');
  return out;
}
// what a layout has compared with another (the recommended one): "+7 spaces · −$0.1M cost"
export function deltas(v, ref, d = 1) {
  if (!v?.m || !ref?.m || v === ref) return [];
  const a = v.m1 || v.m, b = ref.m1 || ref.m, out = [], sg = x => x > 0 ? '+' : '−';
  const ph = v.m1 || ref.m1 ? ' in Phase 1' : '';
  if (a.units || b.units) { const x = (a.units || 0) - (b.units || 0); if (x) out.push(sg(x) + f0(Math.abs(x)) + ' unit' + (Math.abs(x) === 1 ? '' : 's') + ph); }
  else { const x = Math.round(((a.gfa || 0) - (b.gfa || 0)) / 100) * 100; if (x) out.push(sg(x) + f0(Math.abs(x)) + ' sf' + ph); }
  const s = (v.m.spaces || 0) - (ref.m.spaces || 0); if (s) out.push(sg(s) + f0(Math.abs(s)) + ' space' + (Math.abs(s) === 1 ? '' : 's'));
  if (v.fin && ref.fin) {
    const c = v.fin.cost - ref.fin.cost; if (Math.abs(c) >= 5e4) out.push(sg(c) + fmtM(Math.abs(c), d) + ' cost');
    if (!v.fin.forSale && v.fin.yoc != null && ref.fin.yoc != null) { const y = Math.round((v.fin.yoc - ref.fin.yoc) * 1e4) / 100; if (Math.abs(y) >= 0.01) out.push(sg(y) + Math.abs(y).toFixed(2) + ' pts yield'); }
  }
  return out;
}
// Layouts whose numbers are the same as an earlier one: index → the index of the first of them (or itself)
export function similar(list) {
  const sig = v => v.m ? [Math.round(v.m.gfa || 0), v.m.units || 0, v.m.spaces || 0, v.m.required || 0, Math.round((v.m.coverage || 0) * 1000), v.m.buildings || 0, v.fin ? Math.round(v.fin.cost / 1e4) : ''].join('|') : null;
  const first = new Map();
  return (list || []).map((v, i) => { const s = sig(v); if (s == null || !v.m.gfa) return i; if (!first.has(s)) { first.set(s, i); return i; } return first.get(s); });
}

// ---------- sorting ----------
export const SORTS = [
  ['rec', 'Recommended', 'The AI’s order when it reviewed the layouts (its first choice on top), else the planner’s; layouts that fail a check go after the ones that pass'],
  ['profit', 'Profit', 'The Pro forma’s profit: what comes back over the hold and the sale, less what went in'],
  ['yoc', 'Yield on cost', 'Stabilized income ÷ total cost'],
  ['ai', 'AI score', 'The AI review’s score, out of 100'],
  ['size', 'Units / Floor area', 'Phase 1 units, or floor area'],
  ['ratio', 'Parking ratio', 'Spaces provided ÷ spaces required'],
  ['open', 'Open space', 'Share of the site that isn’t building, paving or pond']
];
const SORT_VAL = {
  profit: v => v.fin?.profit, yoc: v => v.fin?.forSale ? v.fin?.margin : v.fin?.yoc, ai: v => v.ai?.score,
  size: v => { const a = v.m1 || v.m; return a ? (a.units || 0) * 1e7 + (a.gfa || 0) : null; }, ratio: v => v.m?.required ? v.m.spaces / v.m.required : v.m?.spaces ?? null, open: v => v.m?.green
};
// The order to show layouts in (indexes into list): ones that pass before ones that don't; then by the sort (Recommended:
// the recommended one first, then rank).
export function sortOrder(list, by = 'rec', recIndex = -1) {
  const vs = list || [], f = SORT_VAL[by], fail = v => passes(v.chk) === false ? 1 : 0, val = v => { const x = f?.(v); return x == null || !isFinite(x) ? -Infinity : x; };
  return vs.map((v, i) => i).sort((a, b) => {
    if (by === 'rec') { if (a === recIndex) return -1; if (b === recIndex) return 1; }
    const fa = fail(vs[a]) - fail(vs[b]); if (fa) return fa;
    if (f) { const d = val(vs[b]) - val(vs[a]); if (d) return d; }
    return (vs[b].rank ?? -b) - (vs[a].rank ?? -a) || a - b;
  });
}

// ---------- the AI's words ----------
// The AI sees the layouts as "option 0, 1, 2…" and may write "Option A" or "option 1": those become the layouts' own
// names ("Layout 2"), in the order they were sent. `names` are the names of the layouts sent, in order.
export function aiText(text, names = []) {
  let s = String(text || '');
  s = s.replace(/\b[Oo]ption ([A-F])\b(?![\w'’])/g, (m, L) => names[L.charCodeAt(0) - 65] || m);
  s = s.replace(/\b[Oo]ption #?(\d)\b/g, (m, n) => names[+n] || m);
  return s.replace(/\boptions\b/g, 'layouts').replace(/\bOptions\b/g, 'Layouts');
}
export const firstSentence = t => { const s = String(t || '').trim(), m = /^(.+?[.!?])(?:\s|$)/.exec(s); return m ? m[1] : s; };
export const restSentences = t => { const s = String(t || '').trim(), f = firstSentence(s); return s.slice(f.length).trim(); };
// what the AI changed about the program when it revised it: "25,000 → 28,000 sf"
export function programChange(from, to) {
  if (!from || !to) return '';
  const out = [];
  if (from.units && to.units && from.units !== to.units) out.push(f0(from.units) + ' → ' + f0(to.units) + ' units');
  else if (from.gfa && to.gfa && from.gfa !== to.gfa) out.push(f0(from.gfa) + ' → ' + f0(to.gfa) + ' sf');
  else if (!from.gfa && to.gfa) out.push(f0(to.gfa) + ' sf');
  if (from.floors && to.floors && from.floors !== to.floors) out.push(from.floors + ' → ' + to.floors + ' stories');
  if (from.use && to.use && from.use !== to.use) out.push(from.use + ' → ' + to.use);
  if ((from.buildings || to.buildings) && from.buildings !== to.buildings && to.buildings) out.push(plural(to.buildings, 'building'));
  return out.join(', ');
}

// ---------- nothing fits ----------
// A build that came back with no layout at all: what to say where the layouts would be (a toast alone was gone in a few
// seconds and left an empty list with a sort menu). ask: the request as typed; acres: the site's area.
export function noFit(ask, acres) {
  const a = acres > 0.005 ? (acres < 10 ? acres.toFixed(2) : acres.toFixed(1)) : null, what = ask ? '“' + String(ask).trim() + '”' : 'that request';
  if (!a) return { title: 'Nothing fits: the site outline has no area.', tip: 'Redraw the site, or pick its parcels again, under Site.' };
  return { title: 'Nothing fits ' + what + ' on this ' + a + '-acre site.', tip: 'Ask for less (fewer square feet, units or buildings), add a parcel to the site under Site, or place pieces by hand under Add.' };
}

// ---------- a self-storage unit mix ----------
// Its footer: the average unit by count, and what the numbers do when the shares don't add up to 100% (they're read as
// parts of the total, so 80% and 90% split the units 8:9) or there are none (each unit counted at fallbackSf).
export function mixFoot(list, fallbackSf) {
  const L = Array.isArray(list) ? list : [], use = L.filter(t => +t.pct > 0 && +t.sf > 0), tot = L.reduce((s, t) => s + (+t.pct || 0), 0), w = use.reduce((s, t) => s + +t.pct, 0);
  if (!w) return { text: 'No size has a share yet, so units are counted at ' + f0(fallbackSf) + ' sf each. Give the sizes a %.', warn: true };
  const avg = 'Average ' + f0(use.reduce((s, t) => s + t.sf * t.pct, 0) / w) + ' sf';
  if (Math.abs(tot - 100) > 0.5) return { text: avg + ' · the shares add up to ' + f0(tot) + '%, so they’re scaled to 100%', warn: true };
  return { text: avg + ' · 100%', warn: false };
}
