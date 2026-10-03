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
  for (const k of ['sqft_min', 'sqft_max', 'min_units']) if (!(num(o[k]) > 0)) delete o[k];
  if (o.sqft_min && o.sqft_max && o.sqft_max <= o.sqft_min) delete o.sqft_max;
  if (Array.isArray(o.status) && (!o.status.length || new Set(o.status).size >= 4)) delete o.status;
  if (!o.exact_only) delete o.exact_only;
  for (const k of ['keywords', 'developer', 'company', 'near_place', 'date_from', 'date_to', 'date_field', 'period']) if (typeof o[k] === 'string' && !o[k].trim()) delete o[k];
  if (!(num(o.radius_miles) > 0)) delete o.radius_miles;
  return o;
}

// Zoom per kind of target. One building or address fills the view; a landmark shows its block.
export const ZOOM = { address: 18, building: 18, poi: 17.2, street: 16, area: 14.5, town: 11.5, county: 9.5, region: 6, country: 4.5, approx: 13.5 };
const KIND = { poi: 'poi', address: 'address', street: 'street', road: 'street', neighbourhood: 'area', locality: 'area',
  place: 'town', municipality: 'town', municipal_district: 'town', joint_municipality: 'town', county: 'county', subregion: 'county', region: 'region', state: 'region', country: 'country', postal_code: 'area' };
export const kindOf = type => KIND[type] || 'town';

// words that don't identify a place on their own
const GENERIC = new Set(['tx', 'texas', 'the', 'of', 'in', 'at', 'and', 'city', 'center', 'centre', 'area', 'near', 'please', 'usa', 'us', 'county']);
export const placeTokens = q => String(q || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t && !GENERIC.has(t));
// The words that name the place itself: "C. Baldwin Hotel, Houston" → baldwin, hotel. Everything after the first comma is
// context, and so is a town name at the end without a comma ("Baldwin Hotel Houston", towns from the caller): a street
// called "Houston Avenue" in Pasadena shares the word "houston" with the query but is not the hotel.
function subjectTokens(query, towns) {
  let head = String(query || '').split(',')[0].toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const t of [...(towns || [])].map(x => String(x).toLowerCase()).sort((a, b) => b.length - a.length)) {
    const cut = head.replace(new RegExp('(\\s+in)?\\s+' + t.replace(/[^a-z0-9 ]/g, '') + '$'), '');
    if (cut !== head && cut.trim()) { head = cut; break; }
  }
  const toks = placeTokens(head), long = toks.filter(t => t.length > 1);
  return long.length ? long : toks;
}
// how many of the place's own words a result's own name carries, as whole words or word starts ("lane" counts for "ln")
const SPELL = { ln: 'lane', dr: 'drive', st: 'street', rd: 'road', ave: 'avenue', blvd: 'boulevard', pkwy: 'parkway', hwy: 'highway', fwy: 'freeway', ct: 'court', cir: 'circle', trl: 'trail' };
// street types and venue words: shared by too many places to identify one ("Park Ln" is not "Daikin Park")
const WEAK = new Set(['street', 'st', 'avenue', 'ave', 'road', 'rd', 'lane', 'ln', 'drive', 'dr', 'boulevard', 'blvd', 'parkway', 'pkwy', 'highway', 'hwy', 'freeway', 'fwy',
  'court', 'ct', 'circle', 'cir', 'trail', 'trl', 'way', 'place', 'pl', 'north', 'south', 'east', 'west', 'n', 's', 'e', 'w', 'park', 'hotel', 'inn', 'suites', 'plaza', 'tower', 'towers',
  'building', 'center', 'mall', 'square', 'station', 'stadium', 'arena', 'school', 'hospital', 'church', 'office', 'offices', 'apartments', 'store', 'restaurant', 'bar', 'cafe', 'club']);
const enough = (r, subj) => { const strong = subj.filter(t => !WEAK.has(t)), use = strong.length ? strong : subj; return nameHits(r, use) >= Math.max(1, Math.ceil(use.length / 2)); };
const nameHits = (r, subj) => { const words = placeTokens(String(r.t || '').split(',')[0] + ' ' + (r.name || ''));
  return subj.filter(t => words.some(w => w.startsWith(t) || (SPELL[t] && w === SPELL[t]))).length; };
const covers = (r, toks) => { const hay = (r.t + ' ' + (r.name || '')).toLowerCase(); return toks.every(t => hay.includes(t)); };
const overlap = (r, toks) => { const hay = (r.t + ' ' + (r.name || '')).toLowerCase(); return toks.filter(t => t.length > 2 && hay.includes(t)).length; };

// Districts the geocoders don't return as areas: "Downtown Houston" comes back as a skyscraper in it (JPMorgan Chase Tower)
// or as the "Downtown Split" freeway interchange. Outlines are approximate; Downtown is the freeway loop (I-45, I-69, I-10).
export const DISTRICTS = [
  { name: 'Downtown Houston', re: /^(downtown|central business district|cbd)( of)? houston$|^houston (downtown|cbd|central business district)$/, c: [-95.3643, 29.7578], zoom: 14.2,
    geom: { type: 'Polygon', coordinates: [[[-95.3745, 29.7665], [-95.3640, 29.7700], [-95.3550, 29.7680], [-95.3535, 29.7560], [-95.3610, 29.7445], [-95.3775, 29.7520], [-95.3745, 29.7665]]] } }
];
export function districtFor(q) {
  const n = String(q || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^the /, '').replace(/( (tx|texas|usa|us))+$/, '').replace(/ area$/, '').trim();
  return DISTRICTS.find(d => d.re.test(n)) || null;
}
// words that name a kind of district, not a place: "Downtown Houston" asks for the district, never "Downtown Split" or "Downtown Bar"
const DISTRICT_WORD = new Set(['downtown', 'midtown', 'uptown', 'cbd']);

// results: [{ t, name, type, c }] from the geocoder. Returns { c, label, kind } or { error } — never quietly settles
// for the whole city when the user named something inside it ("Astros stadium" must not become "Houston").
// A street, address or point of interest only counts when its own name carries at least half of the place's distinctive words,
// so a lookup that comes back with the wrong street fails (and the map stays put) instead of flying somewhere else.
export function pickPlace(query, results, towns = []) {
  const toks = placeTokens(query), list = (results || []).filter(r => r && Array.isArray(r.c));
  if (!list.length) return { error: 'Couldn’t find “' + query + '”.' };
  const subj = subjectTokens(query, towns);
  const districtAsk = subj.length && subj.every(t => DISTRICT_WORD.has(t));
  const fine = districtAsk ? [] : list.filter(r => ['poi', 'address', 'street'].includes(kindOf(r.type)) && enough(r, subj));
  const coarse = list.filter(r => !fine.includes(r) && !(districtAsk && ['poi', 'address', 'street'].includes(kindOf(r.type))));
  // a coarse result is right only when it accounts for every word the user said ("Cypress", "Houston city center")
  const coarseHit = coarse.find(r => covers(r, toks));
  // a neighbourhood / district that accounts for every word ("downtown Houston") beats a bar or shop that merely
  // mentions it ("Downtown Split"); a landmark whose own name has every word still wins
  const nameCovers = r => { const n = (r.name || '').toLowerCase(); return toks.every(t => n.includes(t)); };
  if (coarseHit && (!fine.some(r => covers(r, toks)) || (kindOf(coarseHit.type) === 'area' && !fine.some(nameCovers)))) return { c: coarseHit.c, label: coarseHit.t, kind: kindOf(coarseHit.type), ...(coarseHit.bbox ? { bbox: coarseHit.bbox } : {}) };
  if (fine.length) {
    const best = fine.map((r, i) => ({ r, s: nameHits(r, subj) * 100 + overlap(r, toks) * 10 - i })).sort((a, b) => b.s - a.s)[0].r;
    return { c: best.c, label: best.t, kind: kindOf(best.type) };
  }
  if (coarseHit) return { c: coarseHit.c, label: coarseHit.t, kind: kindOf(coarseHit.type) };
  return { error: 'Only found “' + list[0].t + '” for “' + query + '”, not the place itself. Try the official name with its city (a venue’s current name, e.g. “<name>, Houston”) or a street address.' };
}

// OpenStreetMap Nominatim (jsonv2) results in the geocoder's shape, for landmarks MapTiler doesn't know by name
// (hotels, stadiums, venues). display_name runs "Name, number, street, …, city, county, Texas, zip, United States".
const OSM_TYPE = t => /^(road|street|highway)$/.test(t) ? 'street' : /^(city|town|village|hamlet|municipality)$/.test(t) ? 'place'
  : /^(suburb|neighbourhood|quarter)$/.test(t) ? 'neighbourhood' : t === 'county' ? 'county' : t === 'postcode' ? 'postal_code' : /^(state|province|region)$/.test(t) ? 'region' : t === 'country' ? 'country' : 'poi';
export function fromNominatim(list) {
  return (list || []).filter(r => r && isFinite(+r.lon) && isFinite(+r.lat)).map(r => {
    const a = r.address || {}, us = !a.country_code || a.country_code === 'us';
    const parts = String(r.display_name || '').split(',').map(x => x.trim()).filter(x => x && x !== 'United States' && !/County$/.test(x));
    const n = parts.findIndex((x, i) => i && /^\d+[A-Za-z]?$/.test(x)); if (n > 0 && parts[n + 1]) parts.splice(n, 2, parts[n] + ' ' + parts[n + 1]); // "400", "Dallas Street" → "400 Dallas Street"
    const name = r.name || parts[0] || '', where = us ? a.state : a.country;
    // outside the US the country is the last part of display_name: keep it so "Paris, France" reads as such
    const t = us ? parts.slice(0, 5).join(', ') : [...new Set([...parts.slice(0, 3), a.country || parts[parts.length - 1]].filter(Boolean))].join(', ');
    const type = OSM_TYPE(r.addresstype || r.type || '');
    const short = type === 'country' ? name + ' (country)' : us && type === 'region' ? name + ' (US state)' : where && where !== name ? name + ', ' + where : t.split(',').slice(0, 2).join(',');
    return { t, name, short, type, c: [+r.lon, +r.lat],
      imp: +r.importance || 0, tx: us && (a.state === 'Texas' || /, Texas(,|$)/.test(String(r.display_name || ''))) };
  });
}

// Several real places share the name and the query doesn't say which ("Paris", "Springfield", "Georgia"): the candidates
// to ask about, or null when one place clearly wins. Results need Nominatim's importance (fromNominatim → imp). A place
// stays a candidate when it is at least 60% as prominent as the top match, or when it is in Texas (this app's home turf:
// "Paris" from Houston might mean Paris, TX). Results within 50 km of a more prominent one are the same place.
const PLACE_KINDS = new Set(['town', 'area', 'county', 'region', 'country']);
const kmBetween = (a, b) => { const R = Math.PI / 180, h = Math.sin((b[1] - a[1]) * R / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin((b[0] - a[0]) * R / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
export function placeCandidates(query, results, towns = []) {
  const subj = subjectTokens(query, towns), strong = subj.filter(t => !WEAK.has(t)), use = strong.length ? strong : subj; if (!use.length) return null;
  const full = (results || []).filter(r => r && Array.isArray(r.c) && PLACE_KINDS.has(kindOf(r.type)) && nameHits(r, use) === use.length)
    .sort((a, b) => (b.imp || 0) - (a.imp || 0));
  const uniq = []; for (const r of full) if (!uniq.some(u => kmBetween(u.c, r.c) < 50)) uniq.push(r);
  const top = uniq[0]?.imp || 0, keep = uniq.filter((r, i) => !i || r.tx || (top > 0 && (r.imp || 0) >= top * 0.6));
  return keep.length >= 2 ? keep.slice(0, 5).map(r => ({ label: r.short || r.t, full: r.t, c: r.c, kind: kindOf(r.type) })) : null;
}

// "Tell me more about X" as a follow-up whenever the turn was about one project, place or building, unless the model
// already offered it. It goes first; the list stays at 4.
export function withTellMore(pills, subject) {
  const list = (pills || []).slice(0, 4), name = String(subject || '').trim();
  if (!name || list.some(p => /^tell me more/i.test(p))) return list;
  return ['Tell me more about ' + shortName(name), ...list].slice(0, 4);
}

// A name short enough for a pill: first part before a comma, cut at a word near n characters.
export function shortName(name, n = 32) {
  let s = String(name || '').split(',')[0].trim(); if (s.length > n) s = s.slice(0, n).replace(/\s+\S*$/, '').replace(/[\s(·–-]+$/, '') + '…';
  return s;
}

// Up to 5 questions for the pills above the Ask AI button, from what is on screen:
//   { card: { kind: 'filing', name, dev, approx } | { kind: 'building', label } | null, near: town or null, zoom,
//     inView: filings in view, filtered: bool, selection: area label or null, changed: recent change count }
export function suggestQuestions(v = {}) {
  const out = [], add = q => { if (q && !out.includes(q)) out.push(q); };
  const c = v.card;
  if (c?.kind === 'filing') {
    // the project is named once; the other pills say "it" (they're about what's open)
    add('Tell me more about ' + shortName(c.name, 30)); add('When will it finish?');
    if (c.dev) add('What else is ' + shortName(c.dev, 30) + ' building?');
    add('What else is being built near it?');
    add(c.approx ? 'Any news on this project?' : 'Show site imagery of it');
  } else if (c?.kind === 'building') {
    const n = c.label && !/^-?\d+\.\d+,\s*-?\d/.test(c.label) ? shortName(c.label, 26) : 'this building';
    add('Who owns ' + n + '?'); add('What is being built within 1 mile?'); add('Show site imagery of it'); add('How far is it from me?');
  } else if (v.far && !v.inView) {
    // looking somewhere the filings don't cover (another state, Europe…): questions about that place
    const p = shortName(v.far, 26);
    add('Tell me about ' + p); add('What is being built in ' + p + '?'); add('What is the economy like in ' + p + '?'); add('Take me back to Waller County');
  } else {
    if (v.selection) add('Summarize ' + shortName(v.selection, 26));
    if (v.near && v.zoom >= 10) { add('What is being built near ' + v.near + '?'); add('Biggest projects near ' + v.near); }
    if (v.inView > 0 && v.zoom >= 8) add('Summarize the ' + v.inView.toLocaleString('en-US') + ' filing' + (v.inView === 1 ? '' : 's') + ' in view');
    if (v.filtered) add('Who are the top developers in these filings?');
    if (v.changed > 0) add('What changed in the latest update?');
    if (!v.zoom || v.zoom < 10) { add('Which areas have the most new construction?'); add('What are the biggest projects starting soon?'); }
    add('Show medical projects over $5M');
  }
  return out.slice(0, 5);
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

// The voice transcriber gets a hint list of local names ("Houston area, Texas. Cypress, Katy, …"). On silence or noise
// it can "hear" that list back, which used to show up as a message the user never said (and get acted on).
// True when most of a transcript is items from the hint list.
export function isPromptEcho(transcript, vocab) {
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  const terms = new Set(String(vocab || '').split(/[,.]/).map(norm).filter(t => t.length > 1));
  if (!terms.size) return false;
  const parts = String(transcript || '').split(/[,.]/).map(norm).filter(Boolean);
  if (parts.length < 3) return false; // a real request names one or two places, not a list
  const hits = parts.filter(p => terms.has(p)).length;
  return hits >= 3 && hits / parts.length >= 0.6;
}
// Already-escaped plain text -> blocks: "1. …" lines become a numbered list, "• …" lines a bulleted list,
// a short line ending in ":" right before a list becomes its lead-in, everything else paragraphs.
export function textBlocks(escaped) {
  const lines = String(escaped || '').split('\n'), out = []; let para = [], list = null;
  const flushP = () => { if (para.length) out.push('<p>' + para.join('<br>') + '</p>'); para = []; };
  const flushL = () => { if (list) out.push('<' + list.tag + '>' + list.items.map(x => '<li>' + x + '</li>').join('') + '</' + list.tag + '>'); list = null; };
  for (const raw of lines) {
    const l = raw.trim(), num = l.match(/^(\d{1,2})[.)]\s+(.+)$/), bul = l.match(/^•\s*(.+)$/);
    if (num || bul) {
      const tag = num ? 'ol' : 'ul';
      if (!list || list.tag !== tag) { flushL();
        // "Largest projects:" just above the list reads as its heading
        if (para.length === 1 && /:$/.test(para[0]) && para[0].length <= 80) { out.push('<p class="lead">' + para[0] + '</p>'); para = []; } else flushP();
        list = { tag, items: [] }; }
      list.items.push(num ? num[2] : bul[1]);
    } else if (!l) { flushL(); flushP(); }
    else { flushL(); para.push(l); }
  }
  flushL(); flushP(); return out.join('');
}

// move_camera: the camera after one nudge. cur = { center: [lng, lat], zoom, bearing, pitch, bounds: [w, s, e, n] }.
// Returns the fields to ease to plus a short label, or { orbit | stop | region } for the actions app.js handles itself.
const STEP = { zoom: { little: 0.7, some: 1.5, lot: 3 }, rotate: { little: 20, some: 45, lot: 90 }, tilt: { little: 10, some: 20, lot: 35 }, pan: { little: 0.25, some: 0.5, lot: 1 } };
const wrap = b => { b = ((b + 180) % 360 + 360) % 360 - 180; return b === -180 ? 180 : b; };
export function cameraMove(cur, { action, amount = 'some', direction } = {}) {
  const k = STEP.zoom[amount] ? amount : 'some', clampZ = z => Math.max(1, Math.min(19, z)), clampP = p => Math.max(0, Math.min(70, p));
  switch (action) {
    case 'zoom_in': { const zoom = clampZ(cur.zoom + STEP.zoom[k]); return { zoom, label: 'Zoomed in to ' + zoom.toFixed(1) }; }
    case 'zoom_out': { const zoom = clampZ(cur.zoom - STEP.zoom[k]); return { zoom, label: 'Zoomed out to ' + zoom.toFixed(1) }; }
    case 'rotate': { const d = direction === 'right' ? 1 : direction === 'left' ? -1 : null; if (!d) return { error: 'Say rotate left or right.' };
      const bearing = wrap(cur.bearing + d * STEP.rotate[k]); return { bearing, label: 'Rotated ' + direction }; }
    case 'tilt_up': { const pitch = clampP(cur.pitch + STEP.tilt[k]); return { pitch, label: 'Tilted to ' + Math.round(pitch) + '°' }; }
    case 'tilt_down': { const pitch = clampP(cur.pitch - STEP.tilt[k]); return { pitch, label: pitch ? 'Tilted to ' + Math.round(pitch) + '°' : 'Flat view' }; }
    case 'flat': return { pitch: 0, label: 'Flat view' };
    case 'tilt_3d': return { pitch: Math.max(55, cur.pitch), label: 'Tilted 3D view' };
    case 'north_up': return { bearing: 0, label: 'North up' };
    case 'pan': {
      const [w, s, e, n] = cur.bounds || [], f = STEP.pan[k]; if (![w, s, e, n].every(isFinite)) return { error: 'Map bounds unknown.' };
      const dx = { east: 1, west: -1 }[direction] || 0, dy = { north: 1, south: -1 }[direction] || 0; if (!dx && !dy) return { error: 'Say pan north, south, east or west.' };
      const lat = Math.max(-85, Math.min(85, cur.center[1] + dy * f * (n - s))), lng = ((cur.center[0] + dx * f * (e - w) + 540) % 360) - 180;
      return { center: [+lng.toFixed(6), +lat.toFixed(6)], label: 'Panned ' + direction };
    }
    case 'orbit': return { orbit: true, label: 'Orbiting' };
    case 'stop': return { stop: true, label: 'Stopped' };
    case 'region': return { region: true, label: 'Back to the whole region' };
    default: return { error: 'Unknown camera action ' + action };
  }
}

// follow_aircraft: a plane by hex ("a1b2c3"), callsign ("DAL1601", "dal 1601") or registration ("N123AB"); with no id,
// the nearest airborne one (the list is sorted nearest first), falling back to the nearest on the ground
export function pickAircraft(aircraft, id) {
  const norm = v => String(v || '').trim().toLowerCase().replace(/[\s-]+/g, ''), q = norm(id), list = aircraft || [];
  if (!q) return list.find(p => !p.ground) || list[0] || null;
  return list.find(p => norm(p.hex) === q || norm(p.flight) === q || norm(p.reg) === q) || null;
}

// ADS-B type names come in capitals ("BOEING 737-800", "AIRBUS A-321neo"): the maker in title case, the model as is
export const aircraftName = d => String(d || '').replace(/^[A-Z][A-Z.&-]+(?: [A-Z][A-Z.&-]+)*(?= |$)/, m => m.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase())) || null;
