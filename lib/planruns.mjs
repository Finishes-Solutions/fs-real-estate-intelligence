// What a site plan option remembers about its last build, kept with the option so nothing is lost by switching options,
// closing or reloading: the generated layouts (numbered "Layout 1, 2, 3…", never letters, so they can't be mistaken for an
// Option), which one is on the map, and the projects a parcel already belongs to. No DOM and no engine here: plain data
// in, plain data out, so it can be tested (test/planruns.mjs). Used by src/siteplan.js.

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
export const RUN_FIELDS = ['key', 'arr', 'name', 'rank', 'm', 'fin', 'finAt', 'ai', 'notes', 'program', 'params', 'setbacks', 'zones', 'recipe', 'revisedBy', 'elements'];
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
    yoc: yoc != null && isFinite(yoc) ? yoc : null, irr: irr != null && isFinite(irr) ? irr : null, margin: r.margin != null && isFinite(r.margin) ? r.margin : null,
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
