// Pure helpers behind the assistant's map tools (src/assistant.js): argument clean-up and picking the right geocoder
// result. Kept free of DOM / map code so test/assistant.mjs can run them in Node.
import { USES } from './taxonomy.mjs';

// The model sometimes fills every filter (all uses, all types, $0–$1T, "changed this week"). Drop the ones that
// don't narrow anything, and the change filter unless the user actually asked about recent changes.
const ASKED_CHANGES = /chang|updat|this week|past week|last week|last few days|since (yesterday|last)|newly|just (filed|registered|posted)|what'?s new|anything new|latest filings/i;
export function cleanFilterArgs(a = {}, userText = '') {
  const o = { ...a };
  const num = v => (typeof v === 'number' && isFinite(v) ? v : null);
  if (Array.isArray(o.types) && new Set(o.types).size >= 3) delete o.types;
  if (Array.isArray(o.uses) && new Set(o.uses.filter(u => USES.includes(u))).size >= Math.ceil(USES.length * 0.8)) delete o.uses;
  if (!(num(o.min_value) > 0)) delete o.min_value;
  if (!(num(o.max_value) > 0) || o.max_value >= 1e11 || (o.min_value && o.max_value <= o.min_value)) delete o.max_value;
  if (o.changed && !ASKED_CHANGES.test(userText || '')) delete o.changed;
  for (const k of ['keywords', 'developer', 'near_place', 'date_from', 'date_to', 'date_field', 'period']) if (typeof o[k] === 'string' && !o[k].trim()) delete o[k];
  if (!(num(o.radius_miles) > 0)) delete o.radius_miles;
  return o;
}

// Zoom per kind of target. One building or address fills the view; a landmark shows its block.
export const ZOOM = { address: 18, building: 18, poi: 17.2, street: 16, area: 14.5, town: 11.5, county: 9.5, approx: 13.5 };
const KIND = { poi: 'poi', address: 'address', street: 'street', road: 'street', neighbourhood: 'area', locality: 'area',
  place: 'town', municipality: 'town', municipal_district: 'town', joint_municipality: 'town', county: 'county', subregion: 'county', region: 'county', postal_code: 'area' };
export const kindOf = type => KIND[type] || 'town';

// words that don't identify a place on their own
const GENERIC = new Set(['tx', 'texas', 'the', 'of', 'in', 'at', 'and', 'city', 'center', 'centre', 'area', 'near', 'please', 'usa', 'us', 'county']);
export const placeTokens = q => String(q || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t && !GENERIC.has(t));
const covers = (r, toks) => { const hay = (r.t + ' ' + (r.name || '')).toLowerCase(); return toks.every(t => hay.includes(t)); };
const overlap = (r, toks) => { const hay = (r.t + ' ' + (r.name || '')).toLowerCase(); return toks.filter(t => t.length > 2 && hay.includes(t)).length; };

// results: [{ t, name, type, c }] from the geocoder. Returns { c, label, kind } or { error } — never quietly settles
// for the whole city when the user named something inside it ("Astros stadium" must not become "Houston").
export function pickPlace(query, results) {
  const toks = placeTokens(query), list = (results || []).filter(r => r && Array.isArray(r.c));
  if (!list.length) return { error: 'Couldn’t find “' + query + '”.' };
  const fine = list.filter(r => ['poi', 'address', 'street'].includes(kindOf(r.type)));
  const coarse = list.filter(r => !fine.includes(r));
  // a coarse result is right only when it accounts for every word the user said ("Cypress", "Houston city center")
  const coarseHit = coarse.find(r => covers(r, toks));
  // a neighbourhood / district that accounts for every word ("downtown Houston") beats a bar or shop that merely
  // mentions it ("Downtown Split"); a landmark whose own name has every word still wins
  const nameCovers = r => { const n = (r.name || '').toLowerCase(); return toks.every(t => n.includes(t)); };
  if (coarseHit && (!fine.some(r => covers(r, toks)) || (kindOf(coarseHit.type) === 'area' && !fine.some(nameCovers)))) return { c: coarseHit.c, label: coarseHit.t, kind: kindOf(coarseHit.type), ...(coarseHit.bbox ? { bbox: coarseHit.bbox } : {}) };
  if (fine.length) {
    const best = fine.map((r, i) => ({ r, s: overlap(r, toks) * 10 - i })).sort((a, b) => b.s - a.s)[0].r;
    return { c: best.c, label: best.t, kind: kindOf(best.type) };
  }
  if (coarseHit) return { c: coarseHit.c, label: coarseHit.t, kind: kindOf(coarseHit.type) };
  return { error: 'Only found “' + list[0].t + '” for “' + query + '”, not the place itself. Try the official name with its city (a venue’s current name, e.g. “<name>, Houston”) or a street address.' };
}

// Center and zoom that frame a set of [lon, lat] points (used when orbiting several filings).
export function frame(points) {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const span = Math.max(x1 - x0, (y1 - y0) * 1.15, 1e-6);
  // ~0.0016° (a few buildings) → 17.5; each doubling of the span is one zoom level out
  const zoom = Math.max(9, Math.min(17.5, 17.5 - Math.log2(span / 0.0016)));
  return { c: [(x0 + x1) / 2, (y0 + y1) / 2], zoom };
}

// Follow-up suggestions: the chat model ends a reply with [[option | option | option]]. Pull them out (up to 4).
export function splitFollowups(text) {
  const s = String(text || ''); let pills = [];
  const out = s.replace(/\[\[([^\]]{2,400})\]\]\s*$/, (m, inner) => { pills = inner.split('|').map(x => x.trim().replace(/^["“]|["”]$/g, '')).filter(x => x && x.length <= 70); return ''; })
    .replace(/\[\[[^\]]*\]\]/g, '').trim();
  return { text: out, pills: [...new Set(pills)].slice(0, 4) };
}
// Plain text for the chat bubbles: markdown emphasis, headings and bullets the model slips in come out clean.
export function plainText(text) {
  return String(text || '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/__([^_\n]+)__/g, '$1').replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/^\s*[*•]\s+/gm, '• ').replace(/^\s*-\s+(?=\S)/gm, '• ')
    .replace(/`([^`\n]+)`/g, '$1').replace(/\*{2,}/g, '');
}
