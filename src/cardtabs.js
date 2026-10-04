// Tabs on the card: select several things at once (buildings, parcels, filings, planes, airports, up to 10) and flip
// between their cards. Shift-click adds to the tabs; on touch screens the "+" button on the tab bar makes the next taps
// add. Buildings get an "All" tab with the totals (src/building.js).
// Contract with the card modules:
//   ctx.tabs.arm(e)       in a click handler, before opening: makes the open add a tab when Shift is held or "+" is on
//   ctx.tabs.track(entry) after a card renders: { id, kind, label, reopen() [, leave()] [, pinned] [, ref] }
//   ctx.tabs.mount()      after a card re-renders itself (a refresh), to put the tab bar back
// A card that renders without track() (a report, a note, a search result) takes the card over and the tabs go away.
const ICON = {
  building: '<path d="M3 14V4.5L8 2l5 2.5V14M6 6.5h1M9 6.5h1M6 9h1M9 9h1M7 14v-2.5h2V14"/>',
  filing: '<path d="M3 14V6l5-4 5 4v8"/><path d="M6.5 14v-4h3v4"/>',
  plane: '<path d="M8 1.8v12.4M8 6.3 2 9v1.4l6-1.6 6 1.6V9zM5.8 13.6 8 12.8l2.2.8"/>',
  airport: '<path d="M2 13h12M4 13V8l4-3 4 3v5M8 2v3"/>',
  summary: '<path d="M2.5 3.5h11M2.5 8h11M2.5 12.5h7"/>'
};
const MAX = 10;

export function initCardTabs(ctx) {
  const card = document.getElementById('card'), esc = ctx.esc;
  let tabs = [], active = null, addMode = false, armed = false, switching = false, bar = null;
  const adding = e => addMode || !!(e?.originalEvent?.shiftKey || e?.shiftKey);
  const items = () => tabs.filter(t => !t.pinned);

  function render() {
    if (!tabs.length) { bar?.remove(); bar = null; card.classList.remove('has-tabs'); return; }
    if (!bar) { bar = document.createElement('div'); bar.className = 'ctabs'; bar.setAttribute('role', 'tablist'); bar.setAttribute('aria-label', 'Selected items');
      bar.addEventListener('click', onClick); }
    const n = items().length;
    bar.innerHTML = tabs.map(t => { const i = items().indexOf(t);
      return '<button type="button" role="tab" class="ctab' + (t.pinned ? ' cpin' : '') + '" data-id="' + esc(t.id) + '" aria-selected="' + (t.id === active) + '" title="' + esc(t.label) + '">' +
        (i >= 0 && n > 1 ? '<b class="cnum">' + (i + 1) + '</b>' : '') + '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + (ICON[t.kind] || ICON.summary) + '</svg>' +
        '<span>' + esc(t.label) + '</span>' + (t.pinned || n < 2 ? '' : '<i class="cx" data-x="' + esc(t.id) + '" aria-label="Remove ' + esc(t.label) + '">×</i>') + '</button>'; }).join('') +
      '<button type="button" class="ctadd" aria-pressed="' + addMode + '" title="' + (addMode ? 'Stop adding' : 'Add more: then click or tap other buildings, parcels, filings, planes or airports (or Shift-click)') + '">' +
      (addMode ? 'Done' : '+ Add') + '</button>';
    mount(); bar.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function mount() { if (!tabs.length || !bar) return; if (bar.parentNode !== card || card.firstElementChild !== bar) card.prepend(bar); card.classList.add('has-tabs'); }
  function onClick(e) {
    const x = e.target.closest('[data-x]'); if (x) { e.stopPropagation(); remove(x.dataset.x); return; }
    if (e.target.closest('.ctadd')) { setAdding(!addMode); return; }
    const t = e.target.closest('.ctab'); if (t) activate(t.dataset.id);
  }
  function setAdding(v) {
    addMode = !!v; card.classList.toggle('adding', addMode); render(); ctx.onTabsChange?.();
    if (addMode) ctx.toast?.((matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click') + ' more buildings, parcels, filings, planes or airports to add them (up to ' + MAX + ').');
  }
  function activate(id) {
    const t = tabs.find(x => x.id === id); if (!t || (id === active && card.classList.contains('open'))) return;
    const prev = tabs.find(x => x.id === active); if (prev && prev !== t) { try { prev.leave?.(); } catch (e) {} }
    active = id; switching = true; try { t.reopen(); } finally { switching = false; } render(); hooks.forEach(fn => fn());
  }
  function remove(id) {
    const i = tabs.findIndex(t => t.id === id); if (i < 0) return; const t = tabs[i]; tabs.splice(i, 1); try { t.removed?.(); } catch (e) {}
    if (!items().length) { tabs = []; active = null; ctx.closeCard(); return; }
    hooks.forEach(fn => fn());
    if (active === id) { active = null; activate((items()[Math.min(i, items().length - 1)] || tabs[0]).id); } else render();
  }
  // a card was opened (or re-opened from its tab)
  function track(entry) {
    if (switching) { const t = tabs.find(x => x.id === entry.id); if (t) Object.assign(t, entry, { reopen: entry.reopen || t.reopen }); active = entry.id; render(); return; }
    const add = armed && tabs.length > 0; armed = false;
    const have = tabs.find(x => x.id === entry.id), prev = tabs.find(x => x.id === active);
    if (prev && prev.id !== entry.id) { try { prev.leave?.(); } catch (e) {} } // e.g. a plane card stops refreshing itself
    if (add) {
      if (!have) { if (items().length >= MAX) { ctx.toast?.('Up to ' + MAX + ' at a time. Remove one from the tabs first.'); active = entry.id; } else tabs.push(entry); }
      else Object.assign(have, entry);
    } else tabs = [entry];
    active = entry.id; render(); hooks.forEach(fn => fn());
  }
  const hooks = [];
  ctx.tabs = {
    arm(e) { armed = adding(e); return armed; },
    adding,
    track, mount, remove, setAdding, activate,
    list: kind => tabs.filter(t => !kind || t.kind === kind),
    active: () => tabs.find(t => t.id === active) || null,
    // label a tab once its card knows its name (an address, a callsign)
    label(id, label) { const t = tabs.find(x => x.id === id); if (t && label && t.label !== label) { t.label = label; render(); } },
    // keep a pinned tab (the buildings' "All") in place, or drop it
    pin(entry) { const i = tabs.findIndex(t => t.id === entry.id); if (entry.drop) { if (i >= 0) { tabs.splice(i, 1); if (active === entry.id) active = items()[0]?.id || null; render(); } return; }
      if (i >= 0) Object.assign(tabs[i], entry); else tabs.unshift({ ...entry, pinned: true }); render(); },
    onChange: fn => hooks.push(fn),
    count: () => items().length
  };
  // closing the card closes every tab; a card opened while adding or switching tabs is not a close
  ctx.onCardClose(() => { if (armed || switching) return; for (const t of tabs) { try { t.removed?.(); } catch (e) {} } tabs = []; active = null; addMode = false; card.classList.remove('adding'); render(); hooks.forEach(fn => fn()); });
  // a card that renders without track() (reports, notes, search results) replaces the card: the tabs go with it
  new MutationObserver(() => { if (tabs.length && bar && bar.parentNode !== card) { tabs = []; active = null; addMode = false; bar = null; card.classList.remove('has-tabs', 'adding'); hooks.forEach(fn => fn()); } }).observe(card, { childList: true });
}
