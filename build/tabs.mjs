// TDLR TABS: project list (by county and month) and project detail pages (cached).
import { fetchRetry, pool, log, mdY, safeUrl } from './util.mjs';

const SEARCH = 'https://www.tdlr.texas.gov/TABS/Search/SearchProjects';
// the list is the one thing the refresh cannot do without, so it gets more patience than a detail page; a maintenance
// window (503s for hours) still fails within a couple of minutes and the run stops with data/ untouched
export const LIST_RETRY = { tries: 6, timeout: 45000, maxDelay: 60000 };
export const DETAIL_RETRY = { tries: 4, timeout: 30000 };

// the search answers JSON; during maintenance it may answer an HTML page with a 200, which must not pass for "no filings"
export async function parseSearch(r, label) {
  const text = await r.text(); let d;
  try { d = JSON.parse(text); } catch { throw new Error(`TABS search (${label}) answered ${r.status} with something other than JSON (maintenance page?): ${text.replace(/\s+/g, ' ').slice(0, 80)}`); }
  if (!d || typeof d !== 'object' || (d.data != null && !Array.isArray(d.data))) throw new Error(`TABS search (${label}) answered JSON of an unexpected shape`);
  return d;
}

async function listRange(id, start, end, county = id) {
  const rows = []; let s = 0;
  for (;;) {
    const label = `TABS list ${county} ${mdY(start)}-${mdY(end)} from ${s}`;
    const body = new URLSearchParams({ draw: '1', start: String(s), length: '100', LocationCounty: id, RegistrationDateBegin: mdY(start), RegistrationDateEnd: mdY(end) });
    const r = await fetchRetry(SEARCH, { method: 'POST', body, headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' }, label }, LIST_RETRY);
    const d = await parseSearch(r, label); rows.push(...(d.data || []));
    s += 100; if (s >= (d.recordsFiltered || 0) || !(d.data || []).length) break;
  }
  return rows;
}

// One request window per calendar month keeps paging short for Harris.
export async function listCounty(name, id, startD, endD) {
  const rows = [];
  for (let m = new Date(Date.UTC(startD.getUTCFullYear(), startD.getUTCMonth(), 1)); m <= endD; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
    const a = m < startD ? startD : m, last = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)), b = last > endD ? endD : last;
    (await listRange(id, a, b, name)).forEach(x => rows.push({ ...x, _county: name }));
  }
  return rows;
}

const decode = s => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));
async function fetchDetail(num) {
  const h = await (await fetchRetry('https://www.tdlr.texas.gov/TABS/Projects/' + num, { label: 'TABS detail' }, DETAIL_RETRY)).text();
  const L = decode(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n')).split('\n').map(s => s.trim()).filter(Boolean);
  // A blank field is followed directly by the next label; never return a label as a value.
  const after = (lbl, n = 1) => { const i = L.indexOf(lbl); if (i < 0) return ''; const v = L.slice(i + 1, i + 1 + n).filter(x => !/:$/.test(x)); return v.join(' | '); };
  const loc = after('Location Address:', 2).split(' | ');
  return { street: loc[0] || '', cityLine: loc[1] || '', owner: after('Owner Name:'), scope: after('Scope of Work:'), sqft: after('Square Footage:'),
    design: after('Design Firm Name:'), tenant: after('Tenant Name:'), facility: after('Facility Name:') };
}

// Too many failed detail pages means the site is down, not that a few projects are odd: the new filings would be
// published without addresses (so unmapped) while the file claimed to be today's. Stop the run instead.
export const detailFailureLimit = n => Math.max(20, Math.ceil(n * 0.5));

// cache: ProjectNumber -> detail + the list-row cost it was fetched against. A cost change triggers a re-fetch.
// A failed page keeps the cached detail it had (if any) and is tried again next run.
export async function details(rows, cache, concurrency = 8) {
  const todo = rows.filter(r => { const c = cache[r.ProjectNumber]; return !c || Math.round((c.cost || 0) * 100) !== Math.round((r.EstimatedCost || 0) * 100); });
  log('tabs details: cached', rows.length - todo.length, 'fetch', todo.length);
  let failed = 0, lastErr;
  await pool(todo, concurrency, async r => {
    try { cache[r.ProjectNumber] = { ...(await fetchDetail(r.ProjectNumber)), cost: r.EstimatedCost || 0, at: new Date().toISOString().slice(0, 10) }; }
    catch (e) { failed++; lastErr = e; }
  });
  if (failed) log('tabs details failed', failed, 'of', todo.length, lastErr ? '| last: ' + String(lastErr.message).slice(0, 160) : '');
  if (failed >= detailFailureLimit(todo.length)) throw new Error(`TABS detail pages: ${failed} of ${todo.length} failed (${safeUrl('https://www.tdlr.texas.gov/TABS/Projects/')}); not publishing filings without their addresses`);
  rows.forEach(r => Object.assign(r, cache[r.ProjectNumber] || { street: '' }));
  return { fetched: todo.length - failed, failed };
}
