// TDLR TABS: project list (by county and month) and project detail pages (cached).
import { fetchRetry, pool, log, mdY } from './util.mjs';

async function listRange(id, start, end) {
  const rows = []; let s = 0;
  for (;;) {
    const body = new URLSearchParams({ draw: '1', start: String(s), length: '100', LocationCounty: id, RegistrationDateBegin: mdY(start), RegistrationDateEnd: mdY(end) });
    const r = await fetchRetry('https://www.tdlr.texas.gov/TABS/Search/SearchProjects', { method: 'POST', body, headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' } });
    const d = await r.json(); rows.push(...(d.data || []));
    s += 100; if (s >= (d.recordsFiltered || 0) || !(d.data || []).length) break;
  }
  return rows;
}

// One request window per calendar month keeps paging short for Harris.
export async function listCounty(name, id, startD, endD) {
  const rows = [];
  for (let m = new Date(Date.UTC(startD.getUTCFullYear(), startD.getUTCMonth(), 1)); m <= endD; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
    const a = m < startD ? startD : m, last = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)), b = last > endD ? endD : last;
    (await listRange(id, a, b)).forEach(x => rows.push({ ...x, _county: name }));
  }
  return rows;
}

const decode = s => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));
async function fetchDetail(num) {
  const h = await (await fetchRetry('https://www.tdlr.texas.gov/TABS/Projects/' + num)).text();
  const L = decode(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n')).split('\n').map(s => s.trim()).filter(Boolean);
  // A blank field is followed directly by the next label; never return a label as a value.
  const after = (lbl, n = 1) => { const i = L.indexOf(lbl); if (i < 0) return ''; const v = L.slice(i + 1, i + 1 + n).filter(x => !/:$/.test(x)); return v.join(' | '); };
  const loc = after('Location Address:', 2).split(' | ');
  return { street: loc[0] || '', cityLine: loc[1] || '', owner: after('Owner Name:'), scope: after('Scope of Work:'), sqft: after('Square Footage:'),
    design: after('Design Firm Name:'), tenant: after('Tenant Name:'), facility: after('Facility Name:') };
}

// cache: ProjectNumber -> detail + the list-row cost it was fetched against. A cost change triggers a re-fetch.
export async function details(rows, cache, concurrency = 8) {
  const todo = rows.filter(r => { const c = cache[r.ProjectNumber]; return !c || Math.round((c.cost || 0) * 100) !== Math.round((r.EstimatedCost || 0) * 100); });
  log('tabs details: cached', rows.length - todo.length, 'fetch', todo.length);
  let failed = 0;
  await pool(todo, concurrency, async r => {
    try { cache[r.ProjectNumber] = { ...(await fetchDetail(r.ProjectNumber)), cost: r.EstimatedCost || 0, at: new Date().toISOString().slice(0, 10) }; }
    catch (e) { failed++; }
  });
  if (failed) log('tabs details failed', failed);
  rows.forEach(r => Object.assign(r, cache[r.ProjectNumber] || { street: '' }));
}
