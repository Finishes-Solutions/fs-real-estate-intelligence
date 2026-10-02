// Phone and tablet behaviour. Phone (≤700px): full-screen map, bottom tab bar, floating ask bar,
// list as its own tab, swipeable bottom-sheet cards and a "More" sheet. Tablet/desktop: collapsible side list.
export function initMobile(ctx) {
  const { map, fmtN, fmtM } = ctx;
  const app = document.querySelector('.app'), nav = document.getElementById('mnav'), sheet = document.getElementById('msheet'), scrim = document.getElementById('mscrim');
  const card = ctx.card, panel = ctx.panel, phoneMQ = window.matchMedia('(max-width:700px)');
  const isPhone = () => phoneMQ.matches;
  app.dataset.mtab = 'map';

  // ---- side list toggle (tablet + desktop) ----
  const ptoggle = document.getElementById('panelToggle');
  try { if (localStorage.getItem('fs-panel') === '0' && !isPhone()) app.classList.add('pcollapsed'); } catch (e) {}
  ptoggle.onclick = () => { app.classList.toggle('pcollapsed'); try { localStorage.setItem('fs-panel', app.classList.contains('pcollapsed') ? '0' : '1'); } catch (e) {} setTimeout(() => map.resize(), 50); };

  // ---- bottom tabs (phone) ----
  function setTab(t) {
    if (t === 'more') { openSheet(); return; }
    closeSheet();
    if (t !== 'map' && card.classList.contains('open')) ctx.closeCard();
    app.dataset.mtab = t;
    if (t === 'map' || t === 'list') { if (ctx.view !== 'map') ctx.setView('map'); }
    else ctx.setView(t);
    syncNav();
    if (t === 'map') setTimeout(() => map.resize(), 30);
  }
  function syncNav() {
    const t = app.dataset.mtab;
    nav.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.tab === t || (t === 'changes' && b.dataset.tab === 'more') || (t === 'field' && b.dataset.tab === 'more')));
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
  document.getElementById('mFilters').onclick = () => { setTab('list'); const f = panel.querySelector('.filters'); setTimeout(() => f.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30); };

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
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; document.getElementById('mInstall').hidden = false; });
  const chg = ctx.CHANGED.size; document.getElementById('mChgN').textContent = chg ? fmtN(chg) : ''; document.getElementById('mMoreN').textContent = chg ? fmtN(chg) : '';
  sheet.querySelectorAll('[data-go]').forEach(b => b.onclick = async () => {
    const go = b.dataset.go; closeSheet();
    if (go === 'changes' || go === 'field') setTab(go);
    else if (go === 'note') { setTab('map'); ctx.addNote?.({ gps: true }); }
    else if (go === 'near') { setTab('map'); ctx.nearMe(); }
    else if (go === 'saved') { setTab('list'); const box = document.getElementById('savedBox'); if (box.style.display === 'none') ctx.toast('No saved searches yet. Set filters, then tap "Save search".'); else { box.open = true; box.scrollIntoView({ block: 'center' }); } }
    else if (go === 'layers') { setTab('map'); setTimeout(() => document.getElementById('layersBtn').click(), 50); }
    else if (go === 'export') document.getElementById('exXlsx').click();
    else if (go === 'install' && installEvt) { installEvt.prompt(); installEvt = null; b.hidden = true; }
    else if (go === 'theme') document.getElementById('themeBtn').click();
  });

  // ---- swipeable bottom-sheet card (phone) ----
  let y0 = null, dy = 0;
  card.addEventListener('touchstart', e => { if (!isPhone()) return; const r = card.getBoundingClientRect(), t = e.touches[0]; if (t.clientY - r.top < 48 && card.scrollTop <= 0) { y0 = t.clientY; dy = 0; } }, { passive: true });
  card.addEventListener('touchmove', e => { if (y0 == null) return; dy = e.touches[0].clientY - y0; if (dy > 0) card.style.transform = 'translateY(' + dy + 'px)'; }, { passive: true });
  card.addEventListener('touchend', () => {
    if (y0 == null) return; card.style.transform = '';
    if (dy > 90) ctx.closeCard(); else if (dy < -30) card.classList.add('full'); else if (Math.abs(dy) < 6) card.classList.toggle('full');
    y0 = null;
  });
  ctx.onCardClose(() => card.classList.remove('full'));

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
