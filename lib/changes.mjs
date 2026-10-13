// "This week" = every change run in the 7 days up to the latest run (refresh runs nightly).
export function recentChanges(feed, days = 7) {
  const runs = feed?.runs || [], m = new Map(); if (!runs.length) return m;
  const cutoff = new Date(runs[0].built).getTime() - days * 864e5;
  for (const r of runs) { if (new Date(r.built).getTime() < cutoff) break; for (const x of r.items) if (!m.has(x.id) || x.k === 'new') m.set(x.id, x.k); }
  return m;
}

// The same runs as one list, for the Changes page's "Last 7 days": a filing first seen in the window is listed once, as new
// (as in recentChanges, 'new' wins); otherwise each kind of change is listed once, from its first 'from' to its latest 'to'.
// Returns { items, ids (the distinct filings, the same set as recentChanges), runs (how many runs), since, built }.
export function mergeRecent(feed, days = 7) {
  const runs = feed?.runs || [], out = { items: [], ids: new Set(), runs: 0, since: null, built: runs[0]?.built || null };
  if (!runs.length) return out;
  const kinds = recentChanges(feed, days), cutoff = new Date(runs[0].built).getTime() - days * 864e5, byKey = new Map();
  for (const r of runs) {
    if (new Date(r.built).getTime() < cutoff) break;
    out.runs++; out.since = r.built;
    for (const x of r.items) {
      const isNew = kinds.get(x.id) === 'new';
      if (isNew && x.k !== 'new') continue;
      const key = isNew ? x.id : x.id + '|' + x.k, had = byKey.get(key);
      if (!had) byKey.set(key, { ...x });
      else if ('from' in x) had.from = x.from; // runs go newest first: an older run holds the earlier starting value
    }
  }
  out.items = [...byKey.values()]; out.items.forEach(x => out.ids.add(x.id));
  return out;
}
