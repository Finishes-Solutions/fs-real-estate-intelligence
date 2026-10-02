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
  function render() {
    const a = read(); box.style.display = a.length ? '' : 'none';
    let total = 0;
    listEl.innerHTML = a.map((s, i) => { const n = newSince(s); total += n; return '<div class="sv"><button class="lnk" data-i="' + i + '">' + esc(s.name) + '</button>' + (n ? '<span class="bdg new">' + fmtN(n) + ' new</span>' : '') +
      '<a class="lnk" href="api/feed?' + esc(s.hash.replace(/(^|&)(m|v|f)=[^&]*/g, '')) + '" target="_blank" rel="noopener" title="RSS feed">RSS</a><button class="lnk x" data-del="' + i + '" aria-label="Delete">×</button></div>'; }).join('');
    nEl.textContent = total ? '· ' + fmtN(total) + ' new' : '';
    listEl.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const all = read(), s = all[+b.dataset.i]; s.seen = new Date().toISOString(); write(all);
      const p = new URLSearchParams(s.hash); ctx.fromSpec(decode(s.hash)); if (p.get('m')) ctx.setMonth(p.get('m')); else if (ctx.state.month) ctx.setMonth(null); render(); });
    listEl.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { const all = read(); all.splice(+b.dataset.del, 1); write(all); render(); });
  }
  document.getElementById('saveSearch').onclick = () => {
    const name = prompt('Name this search', ctx.filterText().slice(0, 60) || 'All filings'); if (!name) return;
    const p = new URLSearchParams(ctx.hashStr()); p.delete('f'); p.delete('v');
    const all = read(); all.unshift({ name: name.slice(0, 80), hash: p.toString(), seen: new Date().toISOString() }); write(all.slice(0, 30)); render(); box.open = true;
    ctx.toast('Saved in this browser. Use RSS for alerts by email or in a reader.');
  };
  render();
}
