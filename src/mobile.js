// Phone and tablet behaviour. Phone (≤700px): full-screen map, bottom tab bar, floating ask bar,
// list as its own tab, swipeable bottom-sheet cards and a "More" sheet. Tablet/desktop: collapsible side list.
// The bottom bar and the More sheet are drawn from the navigation registry (src/nav.js).
import { PHONE, parentOf, leafFor } from './nav.js';

export function initMobile(ctx) {
  const { map, fmtN, fmtM } = ctx;
  const app = document.querySelector('.app'), nav = document.getElementById('mnav'), sheet = document.getElementById('msheet'), scrim = document.getElementById('mscrim');
  const card = ctx.card, panel = ctx.panel, phoneMQ = window.matchMedia('(max-width:700px)');
  const isPhone = () => phoneMQ.matches;
  app.dataset.mtab = 'map';

  // ---- side list toggle (tablet + desktop) ----
  const ptoggle = document.getElementById('panelToggle');
  // the saved choice wins; with none, tablets (narrower than 1100px) start with the list closed so the map isn't halved
  try { const saved = localStorage.getItem('fs-panel'); if (!isPhone() && (saved === '0' || (saved == null && innerWidth < 1100))) app.classList.add('pcollapsed'); } catch (e) {}
  ptoggle.onclick = () => {
    // on a page (not the Map) the list is hidden so the page gets the full width; the button shows it over this page only
    // and leaves the Map's own open/closed setting alone
    if (ctx.view !== 'map' && !isPhone()) { app.classList.toggle('pview-open'); return; }
    app.classList.toggle('pcollapsed'); try { localStorage.setItem('fs-panel', app.classList.contains('pcollapsed') ? '0' : '1'); } catch (e) {} setTimeout(() => map.resize(), 50);
  };

  // ---- side list width: drag the edge (or arrow keys on it); double-click goes back to the default. Saved per browser. ----
  const grip = document.getElementById('pResize'), W_KEY = 'fs-panel-w';
  const maxW = () => Math.max(320, Math.min(820, Math.round(innerWidth * .6)));
  let wantW = null; try { wantW = +localStorage.getItem(W_KEY) || null; } catch (e) {}
  let resizeRaf = 0;
  const mapResize = () => { if (!resizeRaf) resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; map.resize(); }); };
  function applyW() { // the stored width, kept inside what this window can fit; null = the stylesheet default
    if (wantW && !isPhone()) app.style.setProperty('--pw', Math.max(300, Math.min(maxW(), wantW)) + 'px'); else app.style.removeProperty('--pw');
    mapResize();
  }
  const saveW = () => { try { wantW ? localStorage.setItem(W_KEY, String(Math.round(wantW))) : localStorage.removeItem(W_KEY); } catch (e) {} };
  applyW(); addEventListener('resize', applyW);
  grip.addEventListener('pointerdown', e => {
    if (e.button !== 0) return; e.preventDefault(); grip.setPointerCapture(e.pointerId); app.classList.add('presizing');
    const left = app.getBoundingClientRect().left;
    const move = ev => { wantW = Math.max(300, Math.min(maxW(), ev.clientX - left)); applyW(); };
    const up = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); app.classList.remove('presizing'); saveW(); map.resize(); };
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
  });
  grip.addEventListener('dblclick', () => { wantW = null; saveW(); applyW(); });
  ctx.resetPanelWidth = () => { wantW = null; saveW(); applyW(); }; // Settings › Appearance
  grip.addEventListener('keydown', e => {
    const d = e.key === 'ArrowLeft' ? -24 : e.key === 'ArrowRight' ? 24 : 0; if (!d) return; e.preventDefault();
    wantW = Math.max(300, Math.min(maxW(), (wantW || panel.getBoundingClientRect().width) + d)); applyW(); saveW();
  });

  // ---- bottom tabs (phone) ----
  function setTab(t) {
    if (t === 'more') { openSheet(); return; }
    closeSheet();
    if (t !== 'map' && card.classList.contains('open')) ctx.closeCard();
    if (t === 'map' || t === 'list') { app.dataset.mtab = t; if (ctx.view !== 'map') ctx.setView('map'); }
    // Explore shows the filings straight away: the section opens for this visit (not saved, and the map's dots stay as they are)
    if (t === 'list' && document.getElementById('secFilings')?.getAttribute('aria-expanded') !== 'true') ctx.setFilingsOpen?.(true);
    else { const leaf = leafFor(t); app.dataset.mtab = leaf; ctx.setView(leaf); } // Filings / Market open the page used last
    syncNav();
    if (t === 'map') setTimeout(() => map.resize(), 30);
  }
  // a tab is lit for its own pages; every page that isn't in the bottom bar lights More
  const inNav = new Set(PHONE);
  function syncNav() {
    const p = parentOf(app.dataset.mtab);
    nav.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === p || (b.dataset.tab === 'more' && !inNav.has(p)))));
  }
  nav.querySelectorAll('button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
  ctx.onViewChange(v => { // views opened from elsewhere (citations, "who" clicks, change items)
    if (!isPhone()) return;
    if (v === 'map') { if (app.dataset.mtab !== 'list') app.dataset.mtab = 'map'; }
    else app.dataset.mtab = v;
    syncNav();
  });
  // opening a filing or building from the list should show it on the map
  new MutationObserver(() => { if (isPhone() && card.classList.contains('open') && app.dataset.mtab === 'list') { app.dataset.mtab = 'map'; syncNav(); setTimeout(() => map.resize(), 30); } })
    .observe(card, { attributes: true, attributeFilter: ['class'] });

  // ---- floating assistant bar (phone) ----
  document.getElementById('mAsk').onclick = () => { ctx.assistant.open(); setTimeout(() => document.getElementById('aiQ').focus(), 80); };
  document.getElementById('mMic').onclick = () => ctx.assistant.startVoice();
  phoneMQ.addEventListener('change', () => { if (!isPhone()) { app.dataset.mtab = 'map'; closeSheet(); card.classList.remove('full'); } setTimeout(() => map.resize(), 50); });
  document.getElementById('mFilters').onclick = () => { setTab('map'); ctx.openFilters?.(); };

  // live count + filter badge
  function syncCount() {
    const v = ctx.visible, spec = ctx.curSpec(), n = Object.keys(spec).filter(k => k !== 'd').length + (ctx.state.month ? 1 : 0);
    document.getElementById('mCount').textContent = fmtN(v.length) + ' filings · ' + fmtM(v.reduce((s, f) => s + f.cost, 0));
    document.getElementById('mFiltN').textContent = n ? n : '';
  }
  ctx.onChange(syncCount); syncCount();

  // ---- "More" sheet ----
  function openSheet() { sheet.classList.add('on'); scrim.classList.add('on'); }
  function closeSheet() { sheet.classList.remove('on'); scrim.classList.remove('on'); }
  scrim.onclick = closeSheet;
  sheet.querySelectorAll('[data-go]').forEach(b => b.onclick = async () => {
    const go = b.dataset.go; closeSheet();
    if (go === 'note') { setTab('map'); ctx.addNote?.({ gps: true }); }
    else if (go === 'near') { setTab('map'); ctx.nearMe(); }
    else if (go === 'layers') { setTab('map'); setTimeout(() => document.getElementById('layersBtn').click(), 50); }
    else if (go === 'export') ctx.openExport();
    else if (go === 'settings') ctx.openSettings?.(); // theme, team, install and the rest (src/settings.js)
    else if (document.getElementById('view-' + go)) setTab(go); // every page in the registry (My Work, Reports, Data & help)
  });

  // ---- swipeable bottom-sheet card (phone) ----
  let y0 = null, dy = 0;
  card.addEventListener('touchstart', e => { if (!isPhone()) return; const r = card.getBoundingClientRect(), t = e.touches[0]; if (t.clientY - r.top < 48 && card.scrollTop <= 0) { y0 = t.clientY; dy = 0; } }, { passive: true });
  card.addEventListener('touchmove', e => { if (y0 == null) return; dy = e.touches[0].clientY - y0; if (dy > 0) card.style.transform = 'translateY(' + dy + 'px)'; }, { passive: true });
  card.addEventListener('touchend', () => {
    if (y0 == null) return; card.style.transform = '';
    const min = card.classList.contains('min');
    // swipe down: full → normal → minimized (title bar only, still selected) → closed; swipe up or tap brings it back
    if (dy > 90) { if (card.classList.contains('full')) card.classList.remove('full'); else if (!min) setMin(true); else ctx.closeCard(); }
    else if (dy < -30) { if (min) setMin(false); else card.classList.add('full'); }
    else if (Math.abs(dy) < 6 && !min) card.classList.toggle('full');
    y0 = null;
  });
  ctx.onCardClose(() => { card.classList.remove('full'); setMin(false); });

  // ---- minimize any card to its title bar (all screen sizes) ----
  // The selection, the plane being followed, its flight path and the route stay on the map; tap the bar (or the
  // button) to bring the card back. Cards are re-rendered often (a plane card every 10 s), so the button is added
  // back after every render and the state lives on the card element.
  const MIN_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>';
  function setMin(on) {
    const was = card.classList.contains('min'); card.classList.toggle('min', !!on); if (on) card.classList.remove('full');
    const b = card.querySelector('.top .mn'); if (b) { b.setAttribute('aria-label', on ? 'Expand card' : 'Minimize card'); b.title = on ? 'Expand' : 'Minimize'; b.setAttribute('aria-expanded', String(!on)); }
    if (was !== !!on) { card.scrollTop = 0; setTimeout(() => ctx.map?.resize?.(), 220); }
  }
  ctx.minimizeCard = setMin;
  function addButton() {
    const top = card.querySelector(':scope > .top'), x = top?.querySelector('.x'); if (!top || !x || top.querySelector('.mn')) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'mn'; b.innerHTML = MIN_ICON;
    b.onclick = e => { e.stopPropagation(); setMin(!card.classList.contains('min')); };
    x.before(b); setMin(card.classList.contains('min'));
  }
  new MutationObserver(addButton).observe(card, { childList: true });
  // minimized: a tap anywhere on the title bar (not its buttons or links) expands it
  card.addEventListener('click', e => { if (card.classList.contains('min') && e.target.closest('.top') && !e.target.closest('button,a')) setMin(false); });
  addButton();

  // ---- near me ----
  ctx.locate = () => new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('This browser can’t share its location.'));
    navigator.geolocation.getCurrentPosition(p => res([p.coords.longitude, p.coords.latitude]), e => rej(new Error(e.code === 1 ? 'Location permission was denied.' : 'Couldn’t get your location.')), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
  ctx.nearMe = async () => {
    try { const c = await ctx.locate(); ctx.setMiles(3, false, true); ctx.setRadiusCenter(c, 'My location', true); ctx.toast('Showing filings within 3 miles of you.'); }
    catch (e) { ctx.toast(e.message); }
  };
  document.getElementById('locate').onclick = ctx.nearMe;
}
