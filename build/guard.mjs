// Safeguards before new filings replace the last good data: the build refuses to publish an empty or collapsed list.
// (The whole run stops; data/ is left as it was, and the next run tries again.) ALLOW_SHRINK=1 forces a publish.
export const SHRINK_MIN = 200, SHRINK_RATIO = 0.5;

// counts of the previous filings and the new TABS rows by county; a county with a solid history that comes back
// empty or under half its previous size is a sign of a failed or truncated source, not of a quiet month
export function shrinkProblems(prevFilings, rows, counties, { min = SHRINK_MIN, ratio = SHRINK_RATIO } = {}) {
  const names = counties.map(c => c.name), prevHere = prevFilings.filter(f => names.includes(f.county));
  const out = [];
  if (prevHere.length && !rows.length) return [`TABS returned 0 filings vs ${prevHere.length} last run`];
  if (prevHere.length > min && rows.length < prevHere.length * ratio) out.push(`TABS returned ${rows.length} filings vs ${prevHere.length} last run`);
  for (const n of names) {
    const was = prevHere.filter(f => f.county === n).length, now = rows.filter(r => r._county === n).length;
    if (was > min && now < was * ratio) out.push(`${n}: ${now} filings vs ${was} last run`);
  }
  return out;
}
export function checkShrink(prevFilings, rows, counties, env = process.env) {
  const problems = shrinkProblems(prevFilings, rows, counties);
  if (problems.length && !env.ALLOW_SHRINK) throw new Error('refusing to overwrite the last good filings: ' + problems.join('; ') + ' (set ALLOW_SHRINK=1 to force)');
  return problems;
}
