// Street names for a neighbourhood (NEIGHBORHOOD-PLAN.md "Names", decided: off by default, a toggle). Every street (a
// chain of the junction graph, lib/streetnet.mjs chainsOf) gets one name, grander for the boulevard and collectors
// (Parkway, Boulevard), plainer for the locals and cul-de-sacs (Lane, Way, Court); no two share a base name within the
// community, nor with the streets nearby (911 addressing refuses near-duplicates such as Oak Lane and Oak Court). The AI
// names them from a theme (api/siteplan.js mode 'streetNames'); without it, a plain list. A name is kept as `street` on
// the drives (never `name`: "Main entry" and "Loop road" stay what the plan calls them) and on the recipe's streets, so
// re-fits keep it. Shared by the browser, the API and the tests.
import { chainsOf } from './streetnet.mjs';

export const SUFFIX = { boulevard: ['Parkway', 'Boulevard'], entry: ['Parkway', 'Boulevard', 'Drive'], collector: ['Parkway', 'Boulevard', 'Drive'], local: ['Lane', 'Way', 'Drive', 'Trail'], court: ['Court', 'Circle'] };
export const SUFFIXES = [...new Set(Object.values(SUFFIX).flat())];
// words read as a street's type, not its name (a nearby "Stokes Rd" is Stokes)
const TYPES = /\s+(?:parkway|pkwy|boulevard|blvd|drive|dr|lane|ln|way|trail|trl|court|ct|circle|cir|street|st|road|rd|avenue|ave|place|pl|loop|run|crossing|xing|bend|pass|path|terrace|ter|cove|cv|highway|hwy|freeway|fwy)\.?$/i;
// the plain list (trees, birds, Texas plants and land): the offline names, in order; one plain word each, no punctuation
// (911 addressing), none a word of another (Oak and Live Oak too alike)
export const PLAIN = ['Oak', 'Cedar', 'Pecan', 'Magnolia', 'Willow', 'Cypress', 'Bluebonnet', 'Mockingbird', 'Possumhaw', 'Elm', 'Hickory', 'Sycamore', 'Mesquite', 'Juniper', 'Laurel', 'Holly', 'Redbud', 'Dogwood', 'Persimmon', 'Hackberry', 'Bayberry', 'Yaupon', 'Sweetgum', 'Loblolly', 'Longleaf', 'Cardinal', 'Bluebird', 'Wren', 'Finch', 'Heron', 'Egret', 'Kestrel', 'Meadowlark', 'Sparrow', 'Dove', 'Quail', 'Hawk', 'Owl', 'Kingfisher', 'Paintbrush', 'Primrose', 'Coneflower', 'Sunflower', 'Lantana', 'Salvia', 'Yucca', 'Agave', 'Prairie', 'Meadow', 'Brook', 'Creek', 'Spring', 'Ridge', 'Hollow', 'Glen', 'Grove', 'Orchard', 'Field', 'Harvest', 'Saddle', 'Spur', 'Lariat', 'Mustang', 'Bison', 'Longhorn', 'Pinto', 'Palomino', 'Sage', 'Thistle', 'Clover', 'Fern', 'Aspen', 'Birch', 'Hazel', 'Linden', 'Poplar', 'Walnut', 'Chestnut', 'Mulberry'];
// a base name cleaned: letters, spaces, apostrophes and hyphens, at most 24 characters, title case, no street-type word
export function clean(name) {
  let s = String(name || '').replace(/<[^>]*>/g, ' ').replace(/[’`]/g, '’').replace(/[^A-Za-zÀ-ɏ’' -]/g, ' ').replace(/\s+/g, ' ').trim(); for (let i = 0; i < 3; i++) s = s.replace(TYPES, '').trim();
  s = s.split(' ').filter(w => !SUFFIXES.some(x => x.toLowerCase() === w.toLowerCase())).join(' ').slice(0, 24).trim();
  return s.replace(/(^|[\s-])([a-z])/g, (m, a, c) => a + c.toUpperCase());
}
// a street name's base: "Oak Lane" Oak, "N Stokes Rd" Stokes, "FM 362" fm 362 (compared in lower case, plurals as one)
export const baseOf = name => String(name || '').trim().replace(/^(?:north|south|east|west|n|s|e|w)\.?\s+/i, '').replace(TYPES, '').trim();
const key0 = b => String(b || '').toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').replace(/(?<=\w{3})s$/, '').trim();
// the names taken so far: a base's whole and its first word (Bunker and Bunker Hill too alike for 911), and a one-word
// base never a word of another (Oak and Live Oak)
const words = b => key0(b).split(' ').map(w => w.replace(/(?<=\w{3})s$/, '')).filter(w => w.length > 2);
function pool(names = []) {
  const used = new Set(), single = new Set(), part = new Set();
  const taken = b => { const k = key0(b), w = words(b); return !k || used.has(k) || (w.length > 1 ? used.has(w[0]) || w.some(x => single.has(x)) : part.has(k)); };
  const take = b => { const k = key0(b), w = words(b); if (!k) return; used.add(k); if (w.length > 1) { used.add(w[0]); for (const x of w) part.add(x); } else single.add(k); };
  for (const n of names) take(baseOf(n)); return { taken, take };
}
// past the plain list (a big community, or one beside many roads named for trees and birds): one-word compounds of it,
// Oakwood, Cedarbrook… (hundreds more); null only when every one is taken
const COMPOUND = ['wood', 'brook', 'field', 'crest', 'dale', 'view', 'haven', 'stone', 'ridge', 'glen'];
const short = c => (c.role === 'boulevard' || c.role === 'entry') && c.L < 400; // (a short way in takes the name of the street it meets)
const fits = (role, sfx) => (SUFFIX[role] || SUFFIX.local).includes(sfx);
// names for the chains (longest first): the AI's (ai: [{ id, base, suffix }] by chain key) where each fits (a suffix its
// role takes, else the role's first; a base no other street here or nearby has), the rest from the plain list. opts:
// avoid (names nearby), keep (Map key → name kept as it is). Map(key → 'Base Suffix')
export function namesFor(chains, ai, opts = {}) {
  const { taken, take } = pool(opts.avoid || []), out = new Map(), by = new Map((ai || []).map(x => [String(x?.id), x])), turn = {};
  for (const [k, n] of opts.keep || []) { out.set(k, n); take(baseOf(n)); }
  let p = 0, q = 0; const plain = () => { while (p < PLAIN.length) { const b = PLAIN[p++]; if (!taken(b)) return b; }
    while (q < PLAIN.length * COMPOUND.length) { const w = PLAIN[q % PLAIN.length], c = COMPOUND[Math.floor(q++ / PLAIN.length)], b = w + c; if (w.length <= 7 && w.slice(-1).toLowerCase() !== c[0] && !w.toLowerCase().endsWith(c) && !taken(b)) return b; }
    return null; };
  for (const c of chains.slice().sort((a, b) => b.L - a.L || String(a.key).localeCompare(String(b.key)))) { if (out.has(c.key) || short(c)) continue;
    const role = SUFFIX[c.role] ? c.role : 'local', x = by.get(String(c.key)), b0 = x ? clean(x.base) : '', ok = b0 && b0.length >= 2 && !taken(b0), base = ok ? b0 : plain(); if (!base) continue; // (every name taken: left unnamed)
    const list = SUFFIX[role], sfx = x && ok && fits(role, x.suffix) ? x.suffix : list[(turn[role] = (turn[role] ?? -1) + 1) % list.length];
    take(base); out.set(c.key, base + ' ' + sfx); }
  return out;
}
export const plainNames = (chains, avoid = []) => namesFor(chains, null, { avoid });
// the names on the plan: `street` on every drive of each chain named (and on the recipe's streets drawn by them); a way in
// shorter than 400 ft takes the name of the street it meets, a longer one its own. map: Map(key → name, or '' / null to
// clear). { elements, recipe }
export function applyNames(plan, map, chains = chainsOf(plan)) {
  const nameOf = new Map(), byId = new Map(); for (const c of chains) for (const id of c.ids) byId.set(id, c);
  for (const c of chains) nameOf.set(c, map.has(c.key) ? map.get(c.key) || null : c.name);
  for (const c of chains) if (short(c)) { const to = c.ends.find(e => e?.kind === 'tee')?.to, o = to && byId.get(to); if (o && o !== c) nameOf.set(c, nameOf.get(o)); }
  const st = new Map(); for (const c of chains) for (const id of c.ids) st.set(id, nameOf.get(c));
  const elements = (plan.elements || []).map(e => { if (!st.has(e.id)) return e; const n = st.get(e.id), { street, ...o } = e; return n ? { ...o, street: n } : o; });
  const net = plan.recipe?.net, sOf = new Map(); for (const e of elements) if (e.kind === 'drive' && e.net && st.has(e.id)) sOf.set(e.net, st.get(e.id));
  const recipe = net ? { ...plan.recipe, net: { ...net, streets: net.streets.map(s => { if (!sOf.has(s.id) && !sOf.has(String(s.id).replace(/\.\d+$/, ''))) return s; const n = sOf.get(s.id) ?? sOf.get(String(s.id).replace(/\.\d+$/, '')), { street, ...o } = s; return n ? { ...o, street: n } : o; }) } } : plan.recipe;
  return { elements, recipe };
}
// one street renamed by hand (its whole chain): refused, as namesFor would, when another street here or nearby on the map
// (plan.nearRoads, or opts.avoid) has its base name or one too like it
export function rename(plan, key, name, chains = chainsOf(plan), opts = {}) {
  const c = chains.find(x => x.key === key || x.ids.includes(key)); if (!c) return { error: 'Couldn’t find that street.' };
  const raw = String(name || '').trim(); if (!raw) return applyNames(plan, new Map([[c.key, null]]), chains);
  const words = raw.split(/\s+/), last = words[words.length - 1], sfx = SUFFIXES.find(x => x.toLowerCase() === last.toLowerCase()) || (TYPES.test(' ' + last) ? last.replace(/\b[a-z]/g, m => m.toUpperCase()) : null), base = clean(sfx ? words.slice(0, -1).join(' ') : raw);
  if (!base) return { error: 'Give the street a name: a word or two, like “Heritage Parkway”.' };
  const like = (names, b) => names.find(n => pool([n]).taken(b) || pool([b]).taken(baseOf(n)));
  const other = like(chains.filter(x => x !== c && x.name).map(x => x.name), base); if (other) return { error: other + (key0(baseOf(other)) === key0(base) ? ' is already a street here' : ' is a street here already, too like it') + ': two streets with names alike confuse 911 addressing.' };
  const near = like(opts.avoid || plan.nearRoads || [], base); if (near) return { error: near + ' is a road nearby: two streets with names alike confuse 911 addressing.' };
  const full = base + ' ' + (sfx || (SUFFIX[c.role] || SUFFIX.local)[0]); return { ...applyNames(plan, new Map([[c.key, full]]), chains), name: full };
}
// the plan's street names setting ({ on, theme }), off by default
export const namesOn = plan => !!plan?.params?.streetNames?.on;
