// The layout engine's clock and random numbers, in one place so a run can be replayed exactly.
//
// Live (the default, as before): rand() is Math.random and now() is the wall clock, so the searches stop on their time
// budgets (a busy machine searches less) and every new piece gets a fresh random id.
//
// Deterministic (inside deterministic({ seed, tickMs }, fn)): rand() is a seeded generator (mulberry32) and now() is a
// virtual clock that moves on by tickMs each time it is read. The time budgets in the engine then become evaluation
// budgets: the same inputs, seed and tick always do the same amount of search, in the same order, and give the same ids,
// on any machine. lib/layoutrun.mjs runs every saved layout this way; the tick is saved with the run.
//
// Only synchronous work may run inside deterministic(): the engine's search is synchronous, and an await inside would let
// other work read the seeded generator.

let MODE = null;

// a 32-bit seed from a number or a string (FNV-1a)
export function seedOf(seed) {
  if (Number.isInteger(seed)) return seed >>> 0;
  const s = String(seed ?? 'rei'); let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const rand = () => MODE ? (MODE.draws++, MODE.rng()) : Math.random();
export const now = () => MODE ? (MODE.reads++, MODE.t += MODE.tick) : Date.now();
// a short id suffix (base 36), as the engine's ids have always used
export const rid = (n = 6) => MODE ? Math.floor(rand() * 36 ** n).toString(36).padStart(n, '0') : Math.random().toString(36).slice(2, 2 + n);
export const isDeterministic = () => !!MODE;

// Run fn on the side: in a deterministic run, with its own seeded generator and virtual clock (seeded from key and the
// run's clock), the run's own stream and clock left exactly where they were, so extra work added to a search (angled
// parking tried after the square search, lib/siteparking.mjs) never changes what the rest of the run does. Live: fn().
export function aside(key, fn) {
  if (!MODE) return fn();
  const prev = MODE; MODE = { rng: mulberry32(seedOf(String(key) + ':' + prev.t)), t: prev.t, tick: prev.tick, draws: 0, reads: 0 };
  try { return fn(); } finally { prev.aside = (prev.aside || 0) + MODE.reads; MODE = prev; }
}
export const DEFAULT_TICK_MS = 25; // virtual ms a clock read costs: about what a live search spends between reads

// Run fn with the seeded generator and the virtual clock. -> { value, stats: { draws, reads, virtualMs } }
export function deterministic({ seed = 'rei', tickMs = DEFAULT_TICK_MS } = {}, fn) {
  const prev = MODE;
  MODE = { rng: mulberry32(seedOf(seed)), t: 1e12, tick: Math.max(0.001, +tickMs || DEFAULT_TICK_MS), draws: 0, reads: 0 };
  const mine = MODE;
  try {
    const value = fn();
    if (value && typeof value.then === 'function') throw new Error('deterministic(): the work must be synchronous');
    return { value, stats: { draws: mine.draws, reads: mine.reads, virtualMs: Math.round(mine.t - 1e12) } };
  } finally { MODE = prev; }
}
