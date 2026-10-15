// Navigation: one registry for the desktop app bar, the sub-tab row on grouped pages, the phone bottom bar and the
// phone More sheet. Every page keeps its own id (timeline, who, changes, compare, field, …), so links (#v=who), saved
// reports, the assistant's show_view and every setView('map') keep working; a group only remembers which of its pages
// was used last (per browser tab).
// Order follows what matters most: the map (parcels and property information), Projects (site plans), Reports, Market
// (area data), then the construction filings and the person's own notes and searches.
export const NAV = [
  { id: 'map', label: 'Map' },
  { id: 'projects', label: 'Projects' },
  { id: 'reports', label: 'Reports' },
  { id: 'marketgrp', label: 'Market', children: [['market', 'Overview'], ['compare', 'Compare areas']] },
  { id: 'filings', label: 'Filings', children: [['timeline', 'Timeline'], ['who', 'Companies'], ['changes', 'Changes']] },
  { id: 'work', label: 'My Work', children: [['field', 'Notes & watchlist'], ['saved', 'Saved searches']] },
];
// utility pages (right side of the app bar): Data & help opens the Sources page
export const UTIL = [{ id: 'sources', label: 'Data & help' }];

const PARENT = new Map(NAV.flatMap(g => (g.children || []).map(([c]) => [c, g.id])));
const LABEL = new Map([...NAV.map(g => [g.id, g.label]), ...NAV.flatMap(g => g.children || []), ...UTIL.map(u => [u.id, u.label])]);
export const parentOf = id => PARENT.get(id) || id;
export const groupOf = id => NAV.find(g => g.id === id);
export const labelOf = id => LABEL.get(id) || id;
// where a page sits, in words: "Filings › Companies", "Projects", "Reports", "Data & help"
export const pathOf = id => { const p = PARENT.get(id); return p ? labelOf(p) + ' › ' + labelOf(id) : labelOf(id); };
const MEM = 'fs-nav-';
export function lastChild(gid) {
  const g = groupOf(gid); if (!g?.children) return gid;
  let v = null; try { v = sessionStorage.getItem(MEM + gid); } catch (e) {}
  return g.children.some(([c]) => c === v) ? v : g.children[0][0];
}
function remember(leaf) { const p = PARENT.get(leaf); if (p) try { sessionStorage.setItem(MEM + p, leaf); } catch (e) {} }
// a group id opens its last-used page; a page id is itself
export const leafFor = id => groupOf(id)?.children ? lastChild(id) : id;

// the phone bottom bar: Map · Explore (the list) · Projects · Reports · More (Market, Filings and My Work are in More)
export const PHONE = ['map', 'list', 'projects', 'reports', 'more'];
// badge ids other code and older links know: [desktop badge (sub-tab, or the app-bar tab for a top-level page), phone
// badge (More row, or the bottom-bar tab)]
const BADGE = { compare: ['cmpBadge', 'mCmpN'], field: ['fieldBadge', 'mFieldN'], projects: ['pjBadge', 'mPjN'], changes: ['chgBadge', 'mChgN'] };

const svg = (d, s = 20, w = 1.7, fill = 'none') => '<svg width="' + s + '" height="' + s + '" viewBox="0 0 20 20" fill="' + fill + '" stroke="currentColor" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
const IC = {
  map: svg('<path d="M2.5 5l5-2 5 2 5-2v12l-5 2-5-2-5 2z"/><path d="M7.5 3v12M12.5 5v12"/>'),
  list: svg('<path d="M6.5 5h10M6.5 10h10M6.5 15h10"/><circle cx="3.2" cy="5" r=".9" fill="currentColor"/><circle cx="3.2" cy="10" r=".9" fill="currentColor"/><circle cx="3.2" cy="15" r=".9" fill="currentColor"/>'),
  filings: svg('<path d="M3 5h8M6 10h9M4 15h7"/>'),
  timeline: svg('<path d="M3 5h8M6 10h9M4 15h7"/>', 20, 1.5),
  who: svg('<circle cx="7" cy="7" r="2.6"/><circle cx="14" cy="8.2" r="2"/><path d="M2.5 16.5c.5-3 2.3-4.5 4.5-4.5s4 1.5 4.5 4.5M12.2 12.6c.6-.5 1.2-.7 1.8-.7 1.8 0 3 1.4 3.4 4.6"/>', 20, 1.5),
  changes: svg('<path d="M15.8 8A6 6 0 0 0 4.6 6.2M4.2 12a6 6 0 0 0 11.2 1.8"/><path d="M15.9 3.5V8h-4.5M4.1 16.5V12h4.5"/>', 20, 1.5),
  market: svg('<path d="M2.5 17h15M4.5 14V9.5M8.5 14V5.5M12.5 14V8M16.5 14V3"/>', 20, 1.5),
  compare: svg('<rect x="2.5" y="4" width="6" height="12" rx="1"/><rect x="11.5" y="4" width="6" height="12" rx="1"/>', 20, 1.5),
  export: svg('<path d="M10 2.5v10M6 8.5l4 4 4-4M3.5 13.5v4h13v-4"/>', 20, 1.5),
  marketgrp: svg('<path d="M2.5 17h15M4.5 14V9.5M8.5 14V5.5M12.5 14V8M16.5 14V3"/>'),
  more: '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="4.5" cy="10" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="15.5" cy="10" r="1.6"/></svg>',
  projects: svg('<rect x="2.5" y="2.5" width="15" height="15" rx="1.5"/><path d="M5.5 5.5h5v4.5h-5zM12.5 5.5h2M12.5 8.5h2M5.5 13h9"/>', 20, 1.5),
  field: svg('<path d="M4 2.5h12V13l-4.5 4.5H4z"/><path d="M11.5 17.5V13H16M7 7h6M7 10h4"/>', 20, 1.5),
  saved: svg('<path d="M5 2.5h10v15l-5-3.8-5 3.8z"/>', 20, 1.5),
  reports: svg('<path d="M5 2.3h7L15.6 6v11.7H5z"/><path d="M12 2.3V6h3.6M7.5 10.5h5.5M7.5 13.5h5.5"/>', 20, 1.5),
  layers: svg('<path d="M10 2.5 18 7l-8 4.5L2 7z"/><path d="M3.2 10.2 10 14l6.8-3.8M3.2 13.6 10 17.4l6.8-3.8"/>', 20, 1.5),
  near: svg('<circle cx="10" cy="10" r="5.6"/><circle cx="10" cy="10" r="1.6" fill="currentColor"/><path d="M10 1.3v2.5M10 16.2v2.5M1.3 10h2.5M16.2 10h2.5"/>', 20, 1.5),
  note: svg('<path d="M10 18s-5.6-5.4-5.6-9.6a5.6 5.6 0 0 1 11.2 0C15.6 12.6 10 18 10 18z"/><path d="M10 6v4.5M7.8 8.2h4.5"/>', 20, 1.5),
  settings: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  sources: svg('<ellipse cx="10" cy="4.8" rx="6.2" ry="2.2"/><path d="M3.8 4.8v10.4c0 1.2 2.8 2.2 6.2 2.2s6.2-1 6.2-2.2V4.8M3.8 10c0 1.2 2.8 2.2 6.2 2.2s6.2-1 6.2-2.2"/>', 20, 1.5),
};
const CHEV = '<svg class="mr-chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg>';

let ctxRef = null;
const badges = new Map(); // leaf -> { n, alert }

// Draws every menu from NAV. Runs before the modules start, so the badge spans exist when they look for them.

export function renderNav(ctx) {
  ctxRef = ctx;
  const { esc } = ctx, $ = id => document.getElementById(id);
  // desktop app bar: the destinations. A group's tab shows the "needs attention" counts of its pages; a top-level page with
  // a count of its own (Projects) shows it on its tab.
  const bar = $('viewbar');
  bar.innerHTML = NAV.map(g => '<button type="button" data-nav="' + g.id + '" aria-pressed="' + (g.id === 'map') + '">' + esc(g.label) +
    (g.children ? '<span class="badge" data-roll="' + g.id + '"></span>' : BADGE[g.id] ? '<span class="badge" id="' + BADGE[g.id][0] + '"></span>' : '') + '</button>').join('');
  bar.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => ctx.setView(leafFor(b.dataset.nav)));
  // sub-tab rows: one per group, shown above that group's pages (the pages draw themselves; this row sits outside them)
  const tabs = $('vtabs');
  tabs.innerHTML = NAV.filter(g => g.children).map(g => '<div class="vt-row" data-group="' + g.id + '" role="group" aria-label="' + esc(g.label) + '" hidden>' +
    g.children.map(([id, label]) => '<button type="button" data-view="' + id + '" aria-current="false"><span>' + esc(label) + '</span>' + (BADGE[id] ? '<span class="badge" id="' + BADGE[id][0] + '"></span>' : '') + '</button>').join('') + '</div>').join('');
  tabs.querySelectorAll('[data-view]').forEach(b => b.onclick = () => ctx.setView(b.dataset.view));
  // right-hand utilities: Ask AI (the assistant starts later, so look it up on click), Data & help, Settings
  const mod = /Mac|iPhone|iPad|iPod/.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl+';
  const ask = $('askTop'); ask.title = 'Ask AI (' + mod + '/)'; ask.setAttribute('aria-keyshortcuts', mod === '⌘' ? 'Meta+/' : 'Control+/');
  ask.onclick = () => { const app = document.querySelector('.app'); if (app.classList.contains('ai-open')) ctx.assistant?.close(); else ctx.assistant?.open(); };
  $('helpBtn').onclick = () => ctx.helpToggle ? ctx.helpToggle() : ctx.setView('sources'); // pressed (on Data & help): back to the page before
  // Settings: the gear opens the Settings sheet (src/settings.js starts later, so look it up on click)
  $('settingsBtn').onclick = () => ctx.openSettings?.();

  // phone bottom bar
  const PH_LABEL = { map: 'Map', list: 'Explore', projects: 'Projects', reports: 'Reports', more: 'More' };
  $('mnav').innerHTML = PHONE.map(t => '<button type="button" data-tab="' + t + '" aria-pressed="' + (t === 'map') + '">' + IC[t] + '<span>' + PH_LABEL[t] + '</span>' +
    (t === 'more' ? '<span class="badge" id="mMoreN"></span>' : groupOf(t)?.children ? '<span class="badge" data-roll="' + t + '"></span>' : BADGE[t] ? '<span class="badge" id="' + BADGE[t][1] + '"></span>' : '') + '</button>').join('');
  // phone More sheet: grouped rows. Everything that isn't in the bottom bar lives here: Market, Filings and My Work (each
  // group's pages, from NAV), then export, map tools, settings and help.
  const row = (go, label, extra = '') => '<button type="button" class="mrow" data-go="' + go + '"' + extra + '><i class="mr-ic">' + (IC[go] || '') + '</i><span class="mr-l">' + label + '</span>' + (BADGE[go] && !PHONE.includes(go) ? '<b class="badge" id="' + BADGE[go][1] + '"></b>' : '') + CHEV + '</button>';
  const groupRows = NAV.filter(g => g.children && !PHONE.includes(g.id)).map(g => '<div class="mt-h">' + esc(g.label) + '</div><div class="mrows">' + g.children.map(([id, label]) => row(id, esc(label))).join('') + '</div>').join('');
  $('msheet').innerHTML = '<div class="msh-top"><button type="button" class="mgrab" id="mshGrab" aria-label="Close More"></button><button type="button" class="msh-x" id="mshX" aria-label="Close More" title="Close"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>' + groupRows +
    '<div class="mt-h">Export</div><div class="mrows">' + row('export', 'Quick export', ' aria-label="Quick export: a spreadsheet or PDF of what the map shows"') + '</div>' +
    '<div class="mt-h">Map tools</div><div class="mrows">' + row('layers', 'Layers') + row('near', 'Nearby', ' aria-label="Nearby: the area around my location"') + row('note', 'Pin a note', ' aria-label="Pin a site note at my location"') + '</div>' +
    '<div class="mt-h">Settings</div><div class="mrows">' + row('settings', 'Settings', ' aria-label="Settings: your name and team, map, install, layout"') + '</div>' +
    '<div class="mt-h">Data &amp; help</div><div class="mrows">' + row('sources', 'Data sources &amp; freshness') + '</div>';

  ctx.setBadge = setBadge; ctx.navPath = pathOf;
}

// n: the count (0 hides it). alert: a "needs attention" pill that rolls up to the parent tab and More; otherwise a muted
// count beside the label. roll: false keeps an alert on its own sub-tab / More row only (Changes: every nightly check has
// new filings, so it would sit on the Filings tab for good). text: what to show instead of the number. title: a tooltip.
export function setBadge(leaf, n, { alert = false, roll = true, text = null, title = null } = {}) {
  badges.set(leaf, { n: n || 0, alert, roll });
  const fmtN = ctxRef?.fmtN || (x => String(x));
  for (const id of BADGE[leaf] || []) {
    const el = document.getElementById(id); if (!el) continue;
    el.textContent = n ? (text ?? fmtN(n)) : ''; el.classList.toggle('muted', !alert);
    if (title) el.title = title; else el.removeAttribute('title');
  }
  rollUp();
}
function rollUp() {
  const fmtN = ctxRef?.fmtN || (x => String(x));
  const sum = pred => { let s = 0; for (const [leaf, b] of badges) if (b.alert && b.roll && pred(leaf)) s += b.n; return s; };
  document.querySelectorAll('[data-roll]').forEach(el => { const g = el.dataset.roll, s = sum(l => parentOf(l) === g); el.textContent = s ? fmtN(s) : ''; });
  const more = document.getElementById('mMoreN'); if (more) { const s = sum(l => !PHONE.includes(parentOf(l))); more.textContent = s ? fmtN(s) : ''; }
}

// called by setView: which tab is lit, which sub-tab row shows, and the group's memory
export function syncNav(v) {
  const p = parentOf(v), app = document.querySelector('.app');
  document.querySelectorAll('#viewbar [data-nav]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.nav === p)));
  document.getElementById('helpBtn')?.setAttribute('aria-pressed', String(v === 'sources'));
  const g = groupOf(p)?.children ? p : null;
  if (g) app.dataset.vgroup = g; else delete app.dataset.vgroup;
  document.querySelectorAll('#vtabs .vt-row').forEach(r => { r.hidden = r.dataset.group !== g; });
  document.querySelectorAll('#vtabs [data-view]').forEach(b => b.setAttribute('aria-current', String(b.dataset.view === v)));
  remember(v);
}
