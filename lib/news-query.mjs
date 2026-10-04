// Google News queries for a place: the project, the companies behind it, the businesses there, the owner, the street
// address, the subdivision and the town itself. A town is never searched as a bare word ("Waller" is also a Fed governor):
// it is always "Waller, TX", "Waller, Texas" or "Waller County".
// Shared by api/news.js (property news) and build/area.mjs (county and town news).

// development words for an area search (and for a lone one-word company with nothing else to narrow it)
export const TOPIC = '(development OR construction OR "breaks ground" OR groundbreaking OR rezoning OR "real estate" OR "new store" OR expansion OR "plans to build")';

// LLC suffixes match nothing in the news; quote what's left as a phrase. Filler words only go at the ends, so
// "City of Baytown" stays whole while "Pulte Homes of Texas" becomes "Pulte Homes".
const SUFFIX = /\b(l\.?l\.?c|inc|ltd|l\.?p|corp(oration)?|co|company|holdings?|partners(hip)?|properties|investments?|group|tx|texas)\b\.?/gi;
const FILLER = /^(the|of|and|at|&)\s+|\s+(the|of|and|at|&)$/i;
export function phrase(s) {
  let t = String(s || '').replace(/["()\\]/g, ' ').replace(SUFFIX, ' ').replace(/[^\p{L}\p{N}&' -]/gu, ' ').replace(/\s+/g, ' ').trim();
  while (FILLER.test(t)) t = t.replace(FILLER, '').trim();
  return t.length >= 4 ? '"' + t.slice(0, 60) + '"' : '';
}
const bare = p => p.slice(1, -1).toLowerCase();

// "Waller", "Waller, TX", "Waller County" -> { city, county }
export function placeParts(city, county) {
  const tidy = s => String(s || '').replace(/["()\\]/g, ' ').replace(/,?\s*\b(tx|texas|usa?)\b\.?/gi, ' ').replace(/\s+/g, ' ').trim();
  const title = s => s === s.toUpperCase() ? s.toLowerCase().replace(/\b[a-z]/g, x => x.toUpperCase()) : s; // "WALLER" -> "Waller"
  let c = title(tidy(city)), k = title(tidy(county).replace(/\s+county$/i, ''));
  if (/\s+county$/i.test(c)) { k = k || c.replace(/\s+county$/i, ''); c = ''; }
  return { city: c.slice(0, 40), county: k.slice(0, 40) };
}
// ("Waller, TX" OR "Waller, Texas" OR "Waller County"); loose adds Texas for names that anchor the search on their own
export function local(city, county, loose = false) {
  const p = placeParts(city, county), t = [];
  if (p.city) t.push('"' + p.city + ', TX"', '"' + p.city + ', Texas"');
  if (p.county) t.push('"' + p.county + ' County"');
  if (loose && t.length) t.push('Texas');
  return t.length ? '(' + t.join(' OR ') + ')' : '';
}

const PERSON_NO = /\b(llc|inc|ltd|lp|corp|co|company|trust|trustee|estate|church|isd|district|city|county|state|bank|properties|property|investments?|holdings?|partners|group|ventures?|realty|development|homes|builders|association|assn|hoa|ministries|school|college|university|hospital|authority|fund|capital|management|mgmt|enterprises|the|of)\b/i;
// appraisal-roll owners: "SMITH JOHN A & MARY B" -> "John Smith"; companies are cleaned like any name.
// One short word ("Smith Family Trust" -> "Smith") is too vague to search for, so it is dropped.
export function ownerName(s) {
  const raw = String(s || '').split(/\s*(&|\band\b|\/|;)\s*/i)[0].replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  const w = raw.split(' ');
  if (raw && raw === raw.toUpperCase() && w.length >= 2 && w.length <= 4 && !PERSON_NO.test(raw) && w.every(x => /^[A-Z'-]+$/.test(x))) {
    const first = w.slice(1).find(x => x.length > 1), cap = x => x[0] + x.slice(1).toLowerCase();
    if (first) return '"' + cap(first) + ' ' + cap(w[0]) + '"';
  }
  const p = phrase(String(s || '').replace(/\b(living|revocable|family|irrevocable)\b|\btrust(ee)?s?\b|\bestate\b/gi, ' '));
  return p && (/\s/.test(bare(p)) || bare(p).length >= 6) ? p : '';
}

// "6615 Garth Rd" -> "6615 Garth"; "266 FM 1488" stays; no house number, no address search
const STREET_TYPE = /\s+(rd|road|st|street|dr|drive|ln|lane|blvd|boulevard|ave|avenue|pkwy|parkway|hwy|highway|way|ct|court|cir|circle|fwy|freeway|pl|place|trl|trail|loop|expy|expressway)\b\.?.*$/i;
export function streetPhrase(s) {
  const a = String(s || '').split(',')[0].replace(/\s+(ste|suite|unit|bldg|#)\s*\S+.*$/i, '').replace(/\s+/g, ' ').trim();
  if (!/^\d+[A-Za-z]?\s+\S/.test(a)) return '';
  const t = a.replace(STREET_TYPE, '').replace(/["\\]/g, '').trim();
  return t.split(' ').length >= 2 ? '"' + t.slice(0, 50) + '"' : '';
}

// the subdivision in a legal description: "STOKESBURY SEC 2, BLOCK 3, LOT 4" or "LT 4 BLK 3 CANE ISLAND SEC 7" -> "Stokesbury" /
// "Cane Island". Survey and abstract acreage ("ABST 123 J SMITH TRACT 5") names a 19th-century survey, not a neighborhood.
const LEGAL_WORD = /^(lots?|lt|blk|block|sec|section|ph|phase|res|reserve|restricted|tr|tract|ac|acres?|unit|bldg|amended|amend|replat|partial|pt|part|of|the|and|an|a|no|abst|abstract|survey|sur|sub|subdivision|add|addition|plat|ft|sq|undiv|int|interest|being|out|n|s|e|w|ne|nw|se|sw|mh|imp|only|r|v|x)$/i;
export function subdivision(legal) {
  const s = String(legal || '').replace(/^"+|"+$/g, '');
  if (!s || /\b(abst|abstract|survey|a-\d)/i.test(s)) return '';
  let best = '', run = [];
  const flush = () => { const t = run.join(' '); if (t.replace(/\s/g, '').length > best.replace(/\s/g, '').length) best = t; run = []; };
  for (const w of s.split(/[\s,;()]+/)) { if (/^[A-Za-z][A-Za-z'&-]*$/.test(w) && !LEGAL_WORD.test(w)) run.push(w); else flush(); }
  flush();
  if (best.replace(/\s/g, '').length < 5) return '';
  return '"' + best.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/ (At|Of|On|In)\b/g, m => m.toLowerCase()).slice(0, 40) + '"';
}

const list = v => (Array.isArray(v) ? v : v == null ? [] : [v]).map(x => String(x || '').trim()).filter(Boolean);
const label = p => bare(p).replace(/\b[a-z]/g, c => c.toUpperCase());
// everything known about a place -> [{ kind, label, query }], most specific first, at most 7 searches.
// kinds: project, company (developer / tenant / owner from the filing), business (open at the spot), owner (appraisal roll),
// address, hood (subdivision or neighborhood), area (the town or county itself, with development words)
export function buildQueries(s = {}) {
  const { city, county } = placeParts(s.city, s.county), strict = local(city, county), loose = local(city, county, true);
  const out = [], seen = new Set(), add = (kind, p, scope, lab) => {
    if (!p || seen.has(bare(p)) || out.length >= 7) return; seen.add(bare(p));
    // a lone short word with no place to pin it to ("Hines") also matches sports and people: add development words
    const ctx = !scope && kind !== 'area' && !/\s/.test(bare(p)) ? TOPIC : '';
    out.push({ kind, label: lab || label(p), query: [p, scope, ctx].filter(Boolean).join(' ') });
  };
  // a town's own name is not a project, company or owner ("Waller" for a filing in Waller)
  if (city) seen.add(city.toLowerCase()); if (county) seen.add(county.toLowerCase());
  const project = phrase(s.project);
  if (project && /\s/.test(bare(project))) add('project', project, loose); // a one-word project name ("Warehouse") is noise
  for (const c of list(s.company).slice(0, 4)) add('company', phrase(c), loose);
  for (const b of list(s.business).slice(0, 6)) { if (out.filter(q => q.kind === 'business').length >= 3) break; add('business', phrase(b), strict); }
  add('owner', ownerName(s.owner), strict, s.owner ? 'Owner: ' + label(ownerName(s.owner) || '""') : '');
  if (strict) add('address', streetPhrase(s.address), strict, 'This address');
  if (strict) add('hood', subdivision(s.legal) || phrase(s.hood), strict);
  if (strict && s.area !== false) out.push({ kind: 'area', label: 'Around ' + (city || county + ' County'), query: strict + ' ' + TOPIC });
  return out;
}
