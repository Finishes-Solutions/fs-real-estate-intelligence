// Export history for the Reports tab (kept in this browser): which saved files to keep.
// list: newest first [{ id, size, stored }]. Keeps the newest maxFiles files within maxBytes; older entries stay listed
// (stored: false, "re-run to regenerate") up to maxEntries. Returns the trimmed list and the ids whose files to delete.
export function pruneReports(list, { maxFiles = 50, maxBytes = 150e6, maxEntries = 200 } = {}) {
  let files = 0, bytes = 0; const drop = [];
  const keep = list.slice(0, maxEntries).map(r => {
    if (!r.stored) return r;
    if (files < maxFiles && bytes + (r.size || 0) <= maxBytes) { files++; bytes += r.size || 0; return r; }
    drop.push(r.id); return { ...r, stored: false };
  });
  for (const r of list.slice(maxEntries)) if (r.stored) drop.push(r.id);
  return { keep, drop, bytes };
}
export const fmtBytes = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' MB' : n >= 1e3 ? Math.round(n / 1e3) + ' KB' : (n || 0) + ' B';
