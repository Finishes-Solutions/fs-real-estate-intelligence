// Saved searches (this browser only): name + URL state, with a count of filings first seen since you last opened it.
import { decode, makeMatcher, matchSel } from './lib/filter.mjs';

const KEY = 'fs-saved-searches';
export function initSaved(ctx) {
  const { esc, fmtN, DATA, BY_ID } = ctx, box = document.getElementById('savedBox'), listEl = document.getElementById('savedList'), nEl = document.getElementById('savedN');
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
  const write = a => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { ctx.toast('This browser won’t let the page save searches.'); } };
  // filing id -> date first seen, from the change feed
  const firstSeen = new Map(); for (const r of DATA.changes.runs || []) for (const x of r.items) if (x.k === 'new') firstSeen.set(x.id, r.built);

  function newSince(s) {
    const spec = decode(s.hash), m = makeMatcher(spec, { changed: ctx.CHANGED }); let n = 0;
    for (const [id, at] of firstSeen) { if (at <= s.seen) continue; const f = BY_ID.get(id); if (f && m(f) && matchSel(f, spec.sel)) n++; }
    return n;
  }
  // one list, two places: the panel's Saved Searches box (compact) and My Work › Saved searches (a page)
  const page = document.getElementById('workSaved');
  const rss = s => 'api/feed?' + esc(s.hash.replace(/(^|&)(m|v|f)=[^&]*/g, ''));
  function open(i) { const all = read(), s = all[i]; if (!s) return; s.seen = new Date().toISOString(); write(all);
    const p = new URLSearchParams(s.hash); ctx.fromSpec(decode(s.hash)); if (p.get('m')) ctx.setMonth(p.get('m')); else if (ctx.state.month) ctx.setMonth(null); render(); }
  function paint(el, isPage) {
    if (!el) return 0; const a = read(); let total = 0;
    const row = (s, i) => { const n = newSince(s); total += n; const nb = n ? '<span class="bdg new">' + fmtN(n) + ' new</span>' : '';
      return isPage ? '<div class="svp-r"><div><b>' + esc(s.name) + '</b>' + (nb ? ' ' + nb : '') + '</div><div class="svp-a"><button type="button" class="btn sm primary" data-open="' + i + '">Show on map</button>' +
          '<a class="btn sm" href="' + rss(s) + '" target="_blank" rel="noopener" title="New matching filings as an RSS feed">RSS</a><button type="button" class="btn sm ghost" data-del="' + i + '" aria-label="Delete ' + esc(s.name) + '">Delete</button></div></div>'
        : '<div class="sv"><button class="lnk" data-open="' + i + '">' + esc(s.name) + '</button>' + nb + '<a class="lnk" href="' + rss(s) + '" target="_blank" rel="noopener" title="RSS feed">RSS</a><button class="lnk x" data-del="' + i + '" aria-label="Delete">×</button></div>'; };
    if (isPage) el.innerHTML = '<div class="vhead"><div><div class="kicker">My Work</div><h2>Saved searches</h2><div class="vsub">Searches you saved in this browser, with how many new filings match each one since you last opened it.</div></div>' +
        (a.length ? '<div class="vctl"><button type="button" class="btn md" id="svpGo">Save another on the Map</button></div>' : '') + '</div>' +
      (a.length ? '<div class="svp">' + a.map(row).join('') + '</div><p class="vfoot">To save a search, set filters on the Map, then choose Save Search under This Area.</p>'
        : ctx.vempty ? ctx.vempty({ icon: 'bookmark', title: 'No saved searches yet', text: 'Save a filter set to see how many new filings match each visit, or get an RSS alert. Set filters on the Map, then choose Save Search under This Area.', actions: [{ label: 'Go to the Map', id: 'svpGo', primary: true }] })
        : '<div class="empty">No saved searches yet. <button type="button" class="lnk" id="svpGo">Go to the Map</button> to set filters and save one.</div>');
    else el.innerHTML = a.map(row).join('');
    el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { open(+b.dataset.open); if (isPage) { ctx.showFilings?.(); ctx.setView('map'); } });
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { const all = read(); all.splice(+b.dataset.del, 1); write(all); render(); });
    el.querySelector('#svpGo')?.addEventListener('click', () => ctx.setView('map'));
    return total;
  }
  function render() {
    box.style.display = read().length ? '' : 'none';
    const total = paint(listEl, false); nEl.textContent = total ? '· ' + fmtN(total) + ' new' : '';
    if (ctx.view === 'saved') paint(page, true);
  }
  const renderPage = () => paint(page, true);
  ctx.onView('saved', renderPage);
  document.getElementById('saveSearch').onclick = () => {
    const name = prompt('Name this search', ctx.filterText().slice(0, 60) || 'All filings'); if (!name) return;
    const p = new URLSearchParams(ctx.hashStr()); p.delete('f'); p.delete('v');
    const all = read(); all.unshift({ name: name.slice(0, 80), hash: p.toString(), seen: new Date().toISOString() }); write(all.slice(0, 30)); render(); box.open = true;
    ctx.toast('Saved in this browser. Use RSS for alerts by email or in a reader.');
  };
  render();
}
