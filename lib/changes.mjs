// "This week" = every change run in the 7 days up to the latest run (refresh runs nightly).
export function recentChanges(feed, days = 7) {
  const runs = feed?.runs || [], m = new Map(); if (!runs.length) return m;
  const cutoff = new Date(runs[0].built).getTime() - days * 864e5;
  for (const r of runs) { if (new Date(r.built).getTime() < cutoff) break; for (const x of r.items) if (!m.has(x.id) || x.k === 'new') m.set(x.id, x.k); }
  return m;
}
