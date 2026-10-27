// What a site plan option remembers about its last build, kept with the option so nothing is lost by switching options,
// closing or reloading: the generated layouts (numbered "Layout 1, 2, 3…", never letters, so they can't be mistaken for an
// Option), which one is on the map, and the projects a parcel already belongs to. No DOM and no engine here: plain data
// in, plain data out, so it can be tested (test/planruns.mjs). Used by src/siteplan.js.
import { passes, recommended, aiText } from './planpick.mjs';

const f0 = v => Math.round(v).toLocaleString('en-US');

// an engine or stored name without its number ("Layout 2 · Rows facing the street" → "Rows facing the street"; old saved
// runs used letters, "B · …")
export const baseName = n => String(n || '').replace(/^(?:Layout \d+|[A-Z]|\d+) · /, '');

// a short, stable hash of a string (for layouts without a recipe)
export function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

// What identifies a layout across re-sorts, "More layouts" and a re-solve with new settings: its arrangement (the
// recipe's structure, not its dimensions, which move with the setbacks), the arrangement name and which one of that
// name it is. Without a recipe (homes on lots, hand-made), a hash of its pieces' ids and sizes.
export function layoutKey(v, nth = 0) {
  const r = v?.recipe;
  if (r?.pods) return ['p', v.arr || baseName(v.name), r.pods.kind, r.pods.at, r.pods.D || 0, v.revisedBy ? 'rev' : '', nth].join('|'); // a plan in pods: its skeleton
  if (r && typeof r === 'object' && (r.seq || r.o)) {
    const o = r.o || {};
    return ['r', v.arr || baseName(v.name), v.program?.use || '', r.deep ? 'deep' : 'across', r.align || '', r.wave ? 'wave' : '', o.pondAt || '', o.shift || '', o.win ? 'phase' : '', v.revisedBy ? 'rev' : '', nth].join('|');
  }
  return 'h' + hash((v?.elements || []).map(e => e.id + ':' + Math.round(e.w || 0) + 'x' + Math.round(e.d || 0)).join(','));
}

// Keys for a whole list, in order: the nth layout of the same arrangement gets its own key.
export function layoutKeys(list) {
  const seen = new Map();
  return list.map(v => { const a = v.arr || baseName(v.name), n = seen.get(a) || 0; seen.set(a, n + 1); return layoutKey(v, n); });
}

// Names for a list of layouts: "Layout 1 · Rows facing the street · pond at the back". Two layouts with the same
// arrangement are told apart by the first number that differs between them ("· 114 spaces"), else "variant 2".
const TELL = [[m => m.units || 0, n => f0(n) + ' units'], [m => Math.round((m.gfa || 0) / 100) * 100, n => f0(n) + ' sf'], [m => m.spaces || 0, n => f0(n) + ' spaces'],
  [m => m.buildings || 0, n => n + ' building' + (n === 1 ? '' : 's')], [m => Math.round((m.coverage || 0) * 100), n => n + '% coverage']];
export function layoutNames(list) {
  const groups = new Map();
  list.forEach((v, i) => { const a = v.arr || baseName(v.name); if (!groups.has(a)) groups.set(a, []); groups.get(a).push(i); });
  const tag = new Map();
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    const t = TELL.find(([f]) => { const vals = idx.map(i => list[i].m ? f(list[i].m) : null); return vals.every(x => x != null) && new Set(vals).size === vals.length; });
    idx.forEach((i, k) => tag.set(i, t ? t[1](t[0](list[i].m)) : k ? 'variant ' + (k + 1) : ''));
  }
  return list.map((v, i) => 'Layout ' + (i + 1) + ' · ' + (v.arr || baseName(v.name)) + (tag.get(i) ? ' · ' + tag.get(i) : ''));
}

// Find a layout again in a new list: by key; failing that, the same arrangement name; then the same first part of the
// name ("Rows facing the street"). exact says whether it's really the same one.
// More layouts: the new list, with the layout on the map kept first when the new list doesn't hold it (the program
// changed since it was laid out), so it stays marked On map. Its own name stays; the new ones are numbered after it.
export function keepCurrent(cur, list) {
  if (!cur?.key || (list || []).some(v => v.key === cur.key)) return list || [];
  const names = layoutNames([cur, ...list]);
  return [cur, ...list.map((v, k) => ({ ...v, name: names[k + 1] }))].map((v, k) => ({ ...v, rank: -k }));
}

export function matchLayout(list, key, name) {
  if (!list?.length) return { index: -1, exact: false };
  let i = key ? list.findIndex(v => v.key === key) : -1; if (i >= 0) return { index: i, exact: true };
  const arr = v => v.arr || baseName(v.name).replace(/ · (?:variant \d+|[\d,]+ (?:units|sf|spaces|buildings?)|\d+% coverage)$/, '');
  const want = name ? baseName(name).replace(/ · (?:variant \d+|[\d,]+ (?:units|sf|spaces|buildings?)|\d+% coverage)$/, '') : '';
  if (want) { i = list.findIndex(v => arr(v) === want && v.elements?.length !== 0); if (i >= 0) return { index: i, exact: false }; }
  const head = want.split(' · ')[0];
  if (head) { i = list.findIndex(v => arr(v).split(' · ')[0] === head && v.elements?.length !== 0); if (i >= 0) return { index: i, exact: false }; }
  i = list.findIndex(v => v.elements?.length !== 0);
  return { index: i, exact: false };
}

// What a run keeps of each layout (the numbers, money, AI review and how to lay it out again)
export const RUN_FIELDS = ['key', 'arr', 'name', 'rank', 'm', 'fin', 'finAt', 'ai', 'notes', 'program', 'params', 'setbacks', 'zones', 'recipe', 'revisedBy', 'chk', 'm1', 'elements', 'stale', 'laidAs', 'aiBrief', 'pondDepth']; // pondDepth: a deeper pond's layout (lib/sitelayout.mjs withDeeper); aiBrief: the AI's plan (lib/planbrief.mjs): its brief, reasons and what the engine changed
const pick = v => Object.fromEntries(RUN_FIELDS.filter(k => v[k] !== undefined).map(k => [k, v[k]]));
const bare = v => { const o = { ...v }; delete o.elements; return o; };

// The run as it's saved on the option: at most `max` layouts; pieces only for the first `top` and the one on the map
// (the rest keep their numbers and are laid out again when clicked); if it's still over `limit` characters of JSON, only
// the one on the map keeps its pieces.
export function slimRun(run, applied, { max = 6, top = 3, limit = 1.5e6 } = {}) {
  if (!run?.variants) return run;
  let vs = run.variants.slice(0, max);
  if (applied && !vs.some(v => v.key === applied)) { const a = run.variants.find(v => v.key === applied); if (a) vs = vs.slice(0, max - 1).concat([a]); }
  vs = vs.map((v, i) => { const p = pick(v); return i < top || v.key === applied ? p : bare(p); });
  let out = { ...run, variants: vs };
  if (JSON.stringify(out).length > limit) out = { ...out, variants: vs.map(v => v.key === applied ? v : bare(v)) };
  return out;
}

// The money the Pro forma shows for a plan, from proforma.mjs run(): total cost, value, profit, yield on cost and levered
// IRR, in the method the Pro forma is set to (month by month, or TestFit's one page), plus the land price it used.
export function finOf(R) {
  if (!R) return null;
  const simple = R.A?.method === 'simple', r = R.returns || {}, S1 = R.simple || {};
  const cost = simple ? S1.cost : R.budget?.total; if (!(cost > 0)) return null;
  const value = simple ? S1.value : r.value ?? R.exit?.price ?? null, yoc = simple ? S1.yoc : r.yoc, irr = simple ? S1.levIrr : r.levIrr;
  return { cost: Math.round(cost), value: value == null || !isFinite(value) ? null : Math.round(value), profit: Math.round(simple ? S1.profit ?? (value || 0) - cost : r.profit ?? (value || 0) - cost),
    yoc: yoc != null && isFinite(yoc) ? yoc : null, spread: simple ? (S1.spread ?? null) : r.spread ?? null, irr: irr != null && isFinite(irr) ? irr : null, margin: r.margin != null && isFinite(r.margin) ? r.margin : null,
    forSale: !!R.forSale, land: Math.round(R.budget?.land ?? R.A?.landPrice ?? 0), method: simple ? 'simple' : 'schedule' };
}

// Projects that already hold any of these parcels, newest first, each with the option to open: the newest one on those
// parcels (else the project's newest option).
const tm = s => Date.parse(s || 0) || 0;
export function projectsWith(projects, keys) {
  const want = new Set(keys.filter(Boolean)); if (!want.size) return [];
  return (projects || []).filter(p => (p.parcels || []).some(x => want.has(x.key)))
    .sort((a, b) => tm(b.updated || b.created) - tm(a.updated || a.created))
    .map(p => { const plans = (p.plans || []).slice().sort((a, b) => tm(b.updated || b.created) - tm(a.updated || a.created));
      const on = plans.filter(pl => (pl.parcels || (pl.parcel ? [pl.parcel] : [])).some(k => want.has(k)));
      return { p, plan: on[0] || plans[0] || null }; });
}

// What changed for the layout on the map after new settings: "Front setback 35 ft: 22,800 sf (−2,200), 104/92 spaces"
export function deltaText(label, a, b) {
  if (!b) return label;
  const d = (x, y) => { const v = Math.round((y || 0) - (x || 0)); return a && v ? ' (' + (v > 0 ? '+' : '−') + f0(Math.abs(v)) + ')' : ''; };
  const what = b.units ? f0(b.units) + ' units' + d(a?.units, b.units) : f0(Math.round((b.gfa || 0) / 100) * 100) + ' sf' + d(a && Math.round(a.gfa / 100) * 100, Math.round((b.gfa || 0) / 100) * 100);
  return (label ? label + ': ' : '') + what + ', ' + f0(b.spaces || 0) + '/' + f0(b.required || 0) + ' spaces';
}

// A run with every layout as numbers only (each is laid out again from its recipe when clicked)
export const bareRun = run => run?.variants ? { ...run, variants: run.variants.map(bare) } : run;

// The copy of a project that goes to the team: saved layouts as numbers only, since the team store takes at most about
// 500,000 characters a project (one 43-acre homes run with its pieces is about that on its own); if it's still over
// `limit`, the copy goes without saved layouts. The option's own pieces always go.
export function syncCopy(p, limit = 480000) {
  if (!p?.plans?.some(pl => pl.lastRun)) return p;
  const out = { ...p, plans: p.plans.map(pl => pl.lastRun ? { ...pl, lastRun: bareRun(pl.lastRun) } : pl) };
  if (JSON.stringify(out).length <= limit) return out;
  return { ...out, plans: out.plans.map(pl => { if (!pl.lastRun) return pl; const { lastRun, ...rest } = pl; return rest; }) };
}

// The browser's store is full: the saved layouts of every option except `keep` (the one open) lose their pieces.
// Changes the projects in place; says whether anything was slimmed.
export function lightenRuns(projects, keep) {
  let n = 0;
  for (const p of projects || []) for (const pl of p.plans || []) if (pl.id !== keep && pl.lastRun?.variants?.some(v => v.elements)) { pl.lastRun = bareRun(pl.lastRun); n++; }
  return n > 0;
}

// ---------- before a build: suggestions that fit the site, and what the request was read as ----------
const rnd = (v, step, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v / step) * step));
const plural = (n, w) => f0(n) + ' ' + w + (n === 1 ? '' : 's');
// Suggestions for a site of `acres` with `frontage` feet of street: what usually goes on land that size, sized to it and
// rounded. Each is { text, want } where want is what the text asks for (use, gfa, units, floors, pads, extras, truck,
// max, zones), so a test can check the words are read that way. With the AI known to be off, only suggestions the app
// reads fully from the words (no "with 2 pads": pads come from the AI) are offered.
export function presets(acres, frontage = 0, { aiOff = false } = {}) {
  const a = +acres || 0, out = [], add = (text, want, ai) => { if (!(ai && aiOff)) out.push({ text, want }); };
  if (a < 2) {
    const qsr = a < 0.7 ? 2500 : 3500, ret = rnd(a * 8000, 1000, 4000, 14000), med = rnd(a * 6000, 500, 3000, 10000);
    add(f0(qsr) + ' sf QSR pad with drive-thru', { use: 'restaurant', gfa: qsr, extras: ['drivethru'] });
    if (a >= 0.6 && frontage >= 120) add(f0(ret) + ' sf retail strip', { use: 'retail', gfa: ret });
    add(f0(med) + ' sf medical office, 1 story', { use: 'medical', gfa: med, floors: 1 });
  } else if (a < 10) {
    const ret = rnd(a * 5500, 5000, 10000, 55000), pads = frontage >= 450 ? 2 : 1, apts = rnd(a * 22, 10, 40, 220), wh = rnd(a * 11000, 5000, 15000, 110000);
    add(f0(ret) + ' sf retail strip with ' + plural(pads, 'pad'), { use: 'retail', gfa: ret, pads }, true);
    if (aiOff) add(f0(ret) + ' sf retail strip', { use: 'retail', gfa: ret });
    add(apts + ' apartments, 3 stories', { use: 'multifamily', units: apts, floors: 3 });
    add(f0(wh) + ' sf warehouse with truck court', { use: 'industrial', gfa: wh, truck: true });
  } else if (a < 25) {
    const apts = rnd(a * 18, 10, 150, 450);
    add(apts + ' apartments, 3 stories', { use: 'multifamily', units: apts, floors: 3 });
    add('Single-family homes, mostly 2-story', { use: 'sfr', floors: 2 });
    add('Warehouse with truck court, as big as fits', { use: 'industrial', truck: true, max: true });
  } else {
    const apts = rnd(a * 4, 20, 100, 400), th = rnd(a * 0.8, 2, 12, 80);
    add('Mixed use: retail in front, a commons with a lake, ' + apts + ' apartments, ' + th + ' townhomes', { zones: [{ use: 'retail' }, { use: 'amenity' }, { use: 'multifamily', units: apts }, { use: 'townhomes', units: th }] });
    add('Single-family homes, mostly 2-story', { use: 'sfr', floors: 2 });
    add('Distribution warehouse with truck court, as big as fits', { use: 'industrial', truck: true, max: true });
  }
  return out;
}

// What a request was read as, as short chips: "Retail", "25,000 sf", "1 building", "4/1,000 parking". `prog` is a
// normalized program (lib/siteplan.mjs normalizeProgram), `uses` its USES table (for the labels).
const UNIT_WORD = { multifamily: 'apartment', townhomes: 'townhome', duplex: 'duplex unit', sfr: 'home' };
const EXTRA_WORD = { patio: 'Outdoor seating', playground: 'Playground', lawn: 'Lawn', drivethru: 'Drive-thru' };
const STORM_WORD = { retention: 'Retention pond', underground: 'Underground storage', none: 'No pond' };
export function readAs(prog, uses = {}) {
  if (!prog) return [];
  const lab = u => uses[u]?.label || (u === 'garage' ? 'Parking garage' : u), out = [], story = n => plural(n, 'story').replace('storys', 'stories');
  if (prog.zones?.length > 1) {
    out.push('Mixed use');
    for (const z of prog.zones) out.push(z.use === 'garage' ? 'Parking garage' : z.use === 'fuel' && z.fuel ? 'Gas station · ' + plural(z.fuel.pumps, 'pump') + ' · ' + f0(z.fuel.storeSf) + ' sf store' + (z.fuel.wash ? ' · car wash' : '') : z.units && UNIT_WORD[z.use] ? plural(z.units, UNIT_WORD[z.use]) : (z.use === 'amenity' ? 'Commons' : lab(z.use)) + (z.gfa ? ' ' + f0(z.gfa) + ' sf' : '') + (z.pads ? ' + ' + plural(z.pads, 'pad') : ''));
  } else {
    const u = prog.use, cu = prog.custom?.name ? prog.custom : null, hk = u === 'sfr' && prog.homeKind; out.push(cu ? cu.name + ' · AI-crafted' : hk ? ({ manufactured: 'Manufactured home community', tiny: 'Tiny home community', mixed: 'Tiny & manufactured home community' })[hk] || lab(u) : lab(u)); // an AI-crafted type (lib/customtypes.mjs): its name and figures
    if (cu) out.push(...(cu.figures || []).slice(0, 3), ...(prog.gfa ? [f0(prog.gfa) + ' sf'] : []));
    else if (prog.compare) out.push('Apartments, townhomes and duplexes compared');
    else if (prog.units && UNIT_WORD[u]) out.push(plural(prog.units, u === 'multifamily' ? 'unit' : UNIT_WORD[u]));
    else if (u === 'storage' && prog.storage) { const st = prog.storage; // the climate-controlled building and the drive-up rows, each as asked or as fits
      out.push(st.climateSf === 0 ? 'Drive-up only' : (st.climateSf ? f0(st.climateSf) + ' sf' : 'Building sized to the site') + ' climate-controlled', st.driveSf === 0 ? 'No drive-up' : st.driveSf ? f0(st.driveSf) + ' sf drive-up' : 'Drive-up as fits');
      if (st.rv) out.push(st.rv + ' RV / boat'); if (st.fence === false) out.push('No fence'); }
    else if (u === 'foodtrucks' && prog.foodtrucks) { const f = prog.foodtrucks; // the trucks, the pavilion, the bar, the playground
      out.push(f.trucks ? plural(f.trucks, 'truck') : 'Trucks as fit', f.pavilionSf ? f0(f.pavilionSf) + ' sf pavilion' : 'No pavilion', f.bar ? f0(f.barSf) + ' sf bar' : 'No bar'); if (f.playground) out.push('Playground'); }
    else if (u === 'fuel' && prog.fuel) { const fu = prog.fuel; // the pumps, the store and the extras
      out.push(plural(fu.pumps, 'pump') + ' · ' + 2 * fu.pumps + ' fueling positions', f0(fu.storeSf) + ' sf store'); if (fu.wash) out.push('Car wash'); if (fu.vac === false) out.push('No air / vacuum');
      if (fu.canopy !== 'auto') out.push('Canopy along the ' + fu.canopy + ' street'); if (fu.islands === 'across') out.push('Pump islands across the street'); if (fu.truckStop) out.push('Cars only (no truck stop)'); }
    else if (prog.gfa) out.push(f0(prog.gfa) + ' sf');
    else out.push('As much as fits');
    if (u === 'sfr' && hk) out.push('Lanes in loops, lots both sides'); else if (u === 'sfr') out.push('Mostly ' + prog.floors + '-story'); else if (prog.floors && u !== 'foodtrucks' && u !== 'fuel' && !(cu && u === 'storage')) out.push(story(prog.floors));
    if (prog.buildings) out.push(plural(prog.buildings, 'building'));
  }
  out.push(...homeChips(prog));
  const res = ['multifamily', 'townhomes', 'duplex', 'sfr'].includes(prog.use);
  const rule = prog.custom?.parking, PER = { seat: 'a seat', court: 'a court', child: 'a child', space: 'a site', pad: 'a pad' };
  if (!(prog.zones?.length > 1) && prog.use !== 'amenity' && prog.use !== 'sfr') out.push(res ? +prog.perUnit.toFixed(2) + '/unit parking' : prog.foodtrucks ? +(+prog.foodtrucks.perTruck).toFixed(2) + '/truck parking' : rule && PER[rule.per] ? +(+rule.rate).toFixed(2) + ' spaces ' + PER[rule.per] : +prog.ratio.toFixed(2) + '/1,000 parking');
  if (prog.use === 'industrial' && prog.truck) out.push('Truck court');
  for (const x of prog.extras || []) if (EXTRA_WORD[x]) out.push(EXTRA_WORD[x]);
  if (STORM_WORD[prog.storm]) out.push(STORM_WORD[prog.storm]);
  if (prog.entrances > 1) out.push(prog.entrances + ' entrances');
  if (prog.garage && !(prog.zones?.length > 1)) out.push('Parking garage');
  return out;
}

// the homes' size, floor plans and smallest lot as asked (the program's, or its home zone's: lib/siteplan.mjs homeSpec)
const HOME_Z = ['sfr', 'townhomes', 'duplex'];
function homeChips(prog) {
  const z = (prog.zones || []).find(q => HOME_Z.includes(q.use)), homes = z || HOME_Z.includes(prog.use); if (!homes) return [];
  const k = key => z?.[key] ?? prog[key] ?? null, mn = k('homeSfMin'), mx = k('homeSfMax'), n = k('floorPlans'), lot = Math.max(k('minLotSf') || 0, prog.lot?.minSf || 0), w = k('lotW'), out = [];
  if (mn || mx) out.push('Homes ' + (mn && mx && mn !== mx ? f0(mn) + '–' + f0(mx) : mn && !mx ? f0(mn) + '+' : f0(mx || mn)) + ' sf');
  if (n) out.push(plural(n, 'floor plan'));
  if (k('homeKind')) { const d = k('lotSet') ? k('lotD') : null, hw = k('homeW'), hd = k('homeD'); if (w || d) out.push('Pads ' + (w && d ? w + ' × ' + d + ' ft' : w ? w + ' ft wide' : d + ' ft deep')); if (hw && hd) out.push('Homes ' + hw + ' × ' + hd + ' ft'); if (+k('buffer') > 0) out.push(k('buffer') + ' ft buffer'); if (lot) out.push('Lots at least ' + f0(lot) + ' sf'); return out; } // (a home community's pads and homes)
  if (lot) out.push('Lots at least ' + f0(lot) + ' sf'); if (w) out.push('Lots at least ' + w + ' ft wide');
  return out;
}

// The numbers in a request that the program doesn't carry ("160 homes" the program has no count for: ["160 homes"]). Deliberately cautious: only a number with one of a few nouns right after it (sf, units,
// apartments, homes, townhomes, duplexes, lots, stories, buildings, pads), or after a word or two such as single-family or
// two-story ("120 single-family homes"), compared with the program's own numbers.
const SMALL = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
export function notUnderstood(text, prog) {
  if (!text || !prog) return [];
  const t = String(text).toLowerCase().replace(/\b\d{1,3}\s*(?:'|ft|foot|feet)?\s*(?:x|×|by)\s*\d{1,3}\s*(?:'|ft|foot|feet)?/g, ' ').replace(/\b(an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?=(?:separate\s+)?(?:pads?|buildings?)\b)/g, (m, w) => SMALL[w] + ' ').replace(/(\d),(?=\d{3}\b)/g, '$1');
  const zs = prog.zones?.length > 1 ? prog.zones : [], sum = k => zs.reduce((s, z) => s + (+z[k] || 0), 0), each = k => [prog[k], ...zs.map(z => z[k])], vals = k => [prog[k], prog.asked?.[k], ...zs.map(z => z[k]), sum(k), ...(k === 'gfa' && prog.storage ? [prog.storage.climateSf, prog.storage.driveSf] : []), ...(k === 'gfa' && prog.foodtrucks ? [prog.foodtrucks.pavilionSf, prog.foodtrucks.barSf, prog.foodtrucks.restroomSf] : []), ...(k === 'gfa' && prog.fuel ? [prog.fuel.storeSf] : []), ...(k === 'gfa' ? [...each('homeSfMin'), ...each('homeSfMax'), ...each('minLotSf'), prog.lot?.minSf] : [])].filter(v => +v > 0).map(Number); // (storage: either part's size; a gas station: its store's; homes: one home's size and the smallest lot)
  const near = (n, list) => list.some(v => Math.abs(v - n) <= Math.max(1, n * 0.01));
  const re = /(\d+(?:\.\d+)?)\s*(k|thousand)?[\s-]*(?:(?:single[- ]family|multi[- ]?family|detached|attached|rental|for[- ]sale|luxury|senior|affordable|garden[- ]style|(?:[1-4]|one|two|three|four)[- ]stor(?:y|ey))\s+){0,2}(sf|sq\.?\s*ft|square[- ]f(?:ee|oo)t|units?|apartments?|homes?|houses|townho(?:me|use)s?|duplex(?:es)?|lots|floor[- ]?plans?|house plans?|home plans?|stor(?:y|ies|ey)|floors?|buildings?|pads?)\b(?!\s*(?:per|an?|\/)\s*(?:acre|ac)\b)/g, out = [];
  for (const m of t.matchAll(re)) {
    const n = +m[1] * (m[2] ? 1000 : 1), w = m[3];
    const ok = /^s|^square/.test(w) && !/^stor/.test(w) ? near(n, vals('gfa')) || (prog.buildings > 0 && near(n * prog.buildings, vals('gfa')))
      : /^(?:unit|apartment|home|house|townho|duplex|lot)/.test(w) ? near(n, vals('units'))
      : /plans?$/.test(w) ? near(n, vals('floorPlans'))
      : /^(?:stor|floor)/.test(w) ? near(n, vals('floors')) || (prog.use === 'sfr' && n >= 1 && n <= 3)
      : /^building/.test(w) ? near(n, vals('buildings'))
      : /^pad/.test(w) ? near(n, vals('pads')) || prog.buildings > n : true;
    if (!ok) out.push(m[0].replace(/\s+/g, ' ').trim());
  }
  return [...new Set(out)];
}

// ---------- a build's layouts held back until the AI has reviewed them ----------
// With the AI on (and an effort level that reviews), a build's layouts are not listed or put on the map while the AI is
// still looking at them: the panel shows the run's progress, and the layouts come in once the review is back, ranked
// by it, each with its score, verdict, strengths and problems, the AI's pick on the map. A review that fails, takes too
// long or is cancelled still shows the engine's layouts, marked as not reviewed. Used by src/siteplan.js build().

// whether a build's layouts wait for the review: the AI answered, the effort level reviews, and something was laid out
export const holdsForReview = ({ ai, rounds, any }) => !!(ai && rounds > 0 && any);
// how long the whole review may take before the layouts are shown without it (one call can take a few minutes; the
// server stops a call at five)
export const reviewLimitMs = rounds => 200000 + 100000 * Math.max(1, Math.min(3, Math.round(+rounds) || 1));
// the line shown with layouts the AI did not review, by why: failed, timeout, cancelled, edit (a hand edit stopped it),
// closed (the plan was closed mid-review)
const UNREV = { failed: 'The AI review didn’t answer', timeout: 'The AI review took too long', cancelled: 'AI review cancelled', edit: 'AI review stopped because you changed the plan', closed: 'The plan was closed before the AI finished its review' };
export const unreviewedNote = (why, note = '') => [note, (UNREV[why] || UNREV.failed) + ', so these layouts were not reviewed by the AI: they’re as the engine ranked them.'].filter(Boolean).join(' ');
export const isUnreviewedNote = s => /were not reviewed by the AI/.test(String(s || ''));

const numOfName = v => (v?.name || '').match(/^Layout \d+/)?.[0] || 'That layout';
// the review's scores and words onto the layouts it saw (pool[i] is option i), matched by key, never by position.
// "Option A" / "option 1" in its words become the layout's own name. keep: a layout that already carries a review keeps
// it (More layouts: the one sent along for scale). Changes nothing in place. -> { list, summary }
export function attachReviews(list, pool, rv, { keep = false } = {}) {
  const byKey = new Map((list || []).map(v => [v.key, v])), names = (pool || []).map(v => numOfName(byKey.get(v.key) || v)), tx = t => aiText(t, names), got = new Map();
  for (const r of rv?.reviews || []) { const v = pool[r.option] && byKey.get(pool[r.option].key); if (!v || keep && v.ai) continue;
    got.set(v.key, { ...r, verdict: tx(r.verdict), strengths: (r.strengths || []).map(tx), problems: (r.problems || []).map(tx) }); }
  return { list: (list || []).map(v => got.has(v.key) ? { ...v, ai: got.get(v.key) } : v), summary: tx(rv?.summary || '') };
}
// the AI review into a build's layouts: scores by key, its order (best first), then the rest as the engine ranked them,
// then the layouts from its revised program (extra: named on from the others, keys made unique; pool may hold the same
// objects). Names don't change, so "Layout 3" is still Layout 3 after the review.
// -> { variants, first (keys in the AI's ranking), summary }
export function mergeReviewed(list, pool, rv, extra = []) {
  const base = (list || []).slice(), seen = new Set(base.map(v => v.key)), names = extra.length ? layoutNames([...base, ...extra]) : [];
  const add = extra.map((v, k) => { let key = v.key; while (seen.has(key)) key += '+'; seen.add(key); return { ...v, key, name: names[base.length + k] }; });
  const pool2 = (pool || []).map(v => { const k = extra.indexOf(v); return k >= 0 ? add[k] : v; });
  const { list: withAi, summary } = attachReviews(base.concat(add), pool2, rv), byKey = new Map(withAi.map(v => [v.key, v]));
  const first = [...new Set((rv?.ranking || []).map(i => pool2[i]?.key).filter(k => byKey.has(k)))], put = new Set(first);
  const order = [...first, ...base.map(v => v.key).filter(k => !put.has(k)), ...add.map(v => v.key).filter(k => !put.has(k))];
  return { variants: order.map((k, i) => ({ ...byKey.get(k), rank: -i })), first, summary };
}
// what goes on the map when held layouts come in: the AI's pick, unless it fails a check while another layout passes
// (then the best that passes goes on, and the AI's pick is offered), or nothing when the plan was changed by hand while
// the AI was reviewing (the pick is offered instead). -> { put: index for the map or -1, ai: the AI's pick's index or
// -1, failing, offer: the index to offer in a toast or -1 }
export function landing(list, aiPick, { edited = false } = {}) {
  const vs = list || [], ai = aiPick ? vs.findIndex(v => v.key === aiPick) : -1;
  const failing = ai >= 0 && passes(vs[ai].chk) === false && vs.some(v => passes(v.chk));
  const rec = recommended(vs, failing ? null : aiPick), best = rec ? rec.index : vs.findIndex(v => v.elements?.length);
  return { put: edited ? -1 : best, ai, failing, offer: ai >= 0 && (failing || edited) ? ai : edited ? best : -1 };
}
// More layouts with the AI on: the new layouts it hasn't seen (laid out, not "nothing fits"), at most `max`, in batches
// of `size`, each sent with the AI's pick (when it has a review) so the scores are on the same scale
export function reviewBatches(list, refKey, { max = 10, size = 5 } = {}) {
  const todo = (list || []).filter(v => !v.ai && v.elements?.length).slice(0, max), ref = refKey ? (list || []).find(v => v.key === refKey && v.ai && v.elements?.length) : null, out = [];
  for (let i = 0; i < todo.length; i += size) out.push(ref ? [ref, ...todo.slice(i, i + size)] : todo.slice(i, i + size));
  return out;
}

// ---------- the land a layout doesn't need (Settings › Leftover land) ----------
// The engine fills the site by default (lib/siteplan.mjs fillMode: more homes, longer shop rows, more buildings, as one
// plan): the owner's goal is the most leasable and sellable floor area the land holds. Land is held for later only when
// someone asks for it: in the words ("leave the rest for a future phase", "hold the back for later": 'hold'; "with the
// rest as phase 2", "in phases": 'phase', filled and marked Phase 2) or under Settings (params.fillBy 'you').
const HOLD = /\b(?:hold|reserve|bank|keep|save|set aside|leave)\b[^.;]{0,50}?\b(?:for (?:a |the )?(?:later|future)|undeveloped|vacant|open for|unbuilt)|\bland ?bank|\bfuture (?:development|pads?|phases?|expansion)\b|\bfor (?:a )?(?:later|future) phase\b|\bnot in this phase\b/i;
const PHASE = /\bphase\s*(?:2|ii|two)\b|\bphased\b|\bin (?:two |2 )?phases\b/i;
export function holdAsked(text) { const t = String(text || ''); return HOLD.test(t) ? 'hold' : PHASE.test(t) ? 'phase' : null; }
// the layout settings a build runs with (params.fill): what the person set under Settings (fillBy 'you') stands; else what
// the words ask (fillBy 'ask'); else the site fills, whatever an AI's plan or review suggested and whatever a saved plan's
// settings say that nobody chose (an AI's fill: false from an earlier build)
export function fillParams(params = {}, { ask = '' } = {}) {
  const p = { ...(params || {}) };
  if (p.fillBy === 'you') return p;
  const w = holdAsked(ask);
  if (w) return { ...p, fill: w === 'hold' ? false : 'phase', fillBy: 'ask' };
  delete p.fill; delete p.fillBy; // (an AI's suggestion alone never holds land: the owner wants the site filled)
  return p;
}
// what Settings shows for it: 'fill' | 'phase' | 'hold', and the choices
export const leftoverOf = params => params?.fill === false ? 'hold' : params?.fill === 'phase' ? 'phase' : 'fill';
export const LEFTOVER = [['fill', 'More of the program (fill the site)'], ['phase', 'More of the program, marked Phase 2'], ['hold', 'Hold it for later']];
export const leftoverParam = v => v === 'hold' ? false : v === 'phase' ? 'phase' : true;
