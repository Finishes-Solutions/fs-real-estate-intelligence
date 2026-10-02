// Week-over-week change feed: compares the previous filings.json with the new one.
const KEEP_RUNS = 26;
const FIELDS = [['status', 'Status'], ['cost', 'Est. value'], ['start', 'Est. start'], ['end', 'Est. end'], ['sqft', 'Sq ft']];

export function diff(prev, next) {
  const before = new Map((prev || []).map(f => [f.id, f])), items = [];
  if (!before.size) return items; // first build: everything would be "new", which says nothing
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
  const runs = [run, ...((feed && feed.runs) || [])].slice(0, KEEP_RUNS);
  return { runs };
}
