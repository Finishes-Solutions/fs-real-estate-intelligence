// Week-over-week change feed: compares the previous filings.json with the new one.
const KEEP_DAYS = 400; // keep 13 months of nightly change runs; empty nights are not stored
const FIELDS = [['status', 'Status'], ['cost', 'Est. value'], ['start', 'Est. start'], ['end', 'Est. end'], ['sqft', 'Sq ft']];

// firstRun (default: prev is empty) returns no items, since everything would be "new", which says nothing.
export function diff(prev, next, { firstRun } = {}) {
  const before = new Map((prev || []).map(f => [f.id, f])), items = [];
  if (firstRun ?? !before.size) return items;
  for (const f of next) {
    const p = before.get(f.id);
    if (!p) { items.push({ id: f.id, k: 'new' }); continue; }
    for (const [k, label] of FIELDS) {
      const a = p[k] ?? null, b = f[k] ?? null;
      if (k === 'cost' && a && b && Math.abs(a - b) / Math.max(a, b) < 0.01) continue;
      if (a !== b && !(a == null && b === '') && !(a === '' && b == null)) items.push({ id: f.id, k, label, from: a, to: b });
    }
  }
  // "gone" = dropped from TABS results while still inside the window (not just aged out of it)
  const ids = new Set(next.map(f => f.id)), oldest = next.reduce((m, f) => f.reg && f.reg < m ? f.reg : m, '9999');
  for (const [id, p] of before) if (!ids.has(id) && p.reg >= oldest) items.push({ id, k: 'gone', name: p.name, county: p.county, cost: p.cost });
  return items;
}

export function appendRun(feed, run) {
  const old = (feed && feed.runs) || [];
  const cutoff = new Date(run.built).getTime() - KEEP_DAYS * 864e5;
  const runs = (run.items.length || !old.length ? [run, ...old] : old).filter(r => new Date(r.built).getTime() >= cutoff);
  return { runs };
}
