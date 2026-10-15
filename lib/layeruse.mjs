// Which map layers this person turns on most, so the quick layer buttons and the Layers panel's groups lead with them.
// Pure functions only: the browser (src/quicklayers.js) keeps the counts in localStorage and calls these.

// a new user's order: property information and area data first, the construction filings and live feeds after
export const DEFAULT_CHIPS = ['parcels', 'flood', 'demo', 'traffic', 'sat', 'tilt', 'filings', 'planes', 'radar'];
// the Layers panel's groups for a new user ("Map display" isn't a data layer and always stays last)
export const DEFAULT_GROUPS = ['property', 'demo', 'base', 'env', 'util', 'filings', 'live'];
// which panel group each quick button's layer lives in
export const CHIP_GROUP = { parcels: 'property', flood: 'property', traffic: 'property', demo: 'demo', sat: 'base', tilt: 'base', filings: 'filings', planes: 'live', radar: 'live' };
// a panel control that is also a quick button counts under the button's key
export const PANEL_KEY = { lyRegrid: 'parcels', lyFema: 'flood', lyAadt: 'traffic', lyDemo: 'demo', lyFilings: 'filings', 'live-planes': 'planes', 'live-radar': 'radar' };

const MAX = 1e6, MAX_KEYS = 80;

// stored text -> { key: count }, dropping anything that isn't a sensible count (old, hand-edited or broken storage)
export function parseUse(text) {
  let o = null; try { o = JSON.parse(text || '{}'); } catch (e) { return {}; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
  const out = {};
  for (const [k, v] of Object.entries(o).slice(0, MAX_KEYS)) if (typeof k === 'string' && k.length <= 40 && Number.isFinite(v) && v > 0) out[k] = Math.min(MAX, Math.floor(v));
  return out;
}

// one more use of a layer (a new object; the input isn't changed)
export function bumpUse(use, key) {
  const out = { ...(use || {}) }; if (!key || typeof key !== 'string') return out;
  out[key] = Math.min(MAX, (Number.isFinite(out[key]) ? out[key] : 0) + 1);
  return out;
}

// most used first; ties (and layers never used) keep the default order, then the order they were given in
export function orderByUse(keys, use = {}, defaults = DEFAULT_CHIPS) {
  const n = k => (use && Number.isFinite(use[k]) ? use[k] : 0);
  const d = k => { const i = defaults.indexOf(k); return i < 0 ? defaults.length : i; };
  return keys.map((k, i) => ({ k, i })).sort((a, b) => n(b.k) - n(a.k) || d(a.k) - d(b.k) || a.i - b.i).map(x => x.k);
}

// the panel's groups, ordered by the uses of the layers inside them. groupOf(key) names a key's group; a key it doesn't
// know (an id from an older version) is ignored.
export function orderGroups(groups, use = {}, groupOf = k => CHIP_GROUP[k], defaults = DEFAULT_GROUPS) {
  const sum = {};
  for (const [k, v] of Object.entries(use || {})) { const g = groupOf(k); if (g && Number.isFinite(v)) sum[g] = (sum[g] || 0) + v; }
  return orderByUse(groups, sum, defaults);
}
