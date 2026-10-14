// Settings: one sheet for everything you set once and forget. The app-bar gear, the phone's More › Settings and
// Explore gear, ⌘, / Ctrl+, and ctx.openSettings(section) all open it. Desktop: a 420px sheet on the right over a scrim;
// phones: full screen. Sections: Appearance · You & your team · Map · Saved on this device · App · Help.
// Options shown elsewhere (the Layers panel's map display, the panel's headline metrics) stay where they are and are
// linked from here. Nothing here deletes notes, projects or the team's sync queue.
const SECTIONS = [['appearance', 'Appearance', 'Appearance'], ['team', 'You & your team', 'Team'], ['map', 'Map', 'Map'], ['saved', 'Saved on this device', 'Saved'], ['app', 'App', 'App'], ['help', 'Help', 'Help']];
const BASES = { dots: 'Default', streets: 'Streets', sat: 'Satellite', topo: 'Topo', esri: 'ESRI imagery', free: 'Free Map' };
const BASE_KEY = 'fs-basemap';
// Reset layout clears only these (never localStorage.clear()): panel open/closed and width, assistant width, which
// panel sections are open, headline metrics, timeline options, export dialog choices and the Projects cards/list view
const LAYOUT_KEYS = ['fs-panel', 'fs-panel-w', 'fs-ai-w', 'fs-kpis', 'fs-tl', 'fs-export', 'fs-projects-view'];
const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const count = k => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v.length : 0; } catch (e) { return 0; } };

export function initSettings(ctx) {
  const { esc, fmtN } = ctx, app = document.querySelector('.app'), gear = document.getElementById('settingsBtn');
  const mod = /Mac|iPhone|iPad|iPod/.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl+';

  // ---------- install (desktop Chrome/Edge and Android offer it; iPhone uses Share › Add to Home Screen) ----------
  let installEvt = null, installed = false;
  const standalone = () => installed || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; paintSec('app'); });
  addEventListener('appinstalled', () => { installed = true; installEvt = null; paintSec('app'); });
  ctx.install = {
    get available() { return !!installEvt; },
    async prompt() { if (!installEvt) return false; const e = installEvt; installEvt = null; e.prompt(); const r = await e.userChoice.catch(() => null); if (r?.outcome === 'accepted') installed = true; paintSec('app'); return r?.outcome === 'accepted'; }
  };

  // ---------- voice log (also linked from Data & help) ----------
  ctx.saveVoiceLog = () => {
    const t = ctx.voiceLog?.() || '';
    if (!t) { ctx.toast('No voice session yet in this visit.'); return; }
    ctx.saveFile('voice-log-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.txt', t, 'text/plain');
  };

  // ---------- the sheet ----------
  const scrim = document.createElement('div'); scrim.className = 'set-scrim'; scrim.hidden = true;
  const sheet = document.createElement('aside'); sheet.id = 'settingsSheet'; sheet.className = 'setsheet'; sheet.hidden = true;
  sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', 'setTitle'); sheet.tabIndex = -1;
  sheet.innerHTML = '<header class="set-h"><h2 id="setTitle">Settings</h2><button type="button" class="set-x" id="setClose" aria-label="Close settings" title="Close (Esc)">' +
    '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></header>' +
    '<nav class="set-jump" aria-label="Settings sections">' + SECTIONS.map(([id, , short]) => '<button type="button" data-jump="' + id + '">' + esc(short) + '</button>').join('') + '</nav>' +
    '<div class="set-body">' + SECTIONS.map(([id, l]) => '<section class="set-sec" data-sec="' + id + '" aria-labelledby="setH-' + id + '"><h3 id="setH-' + id + '">' + esc(l) + '</h3><div class="set-in"></div></section>').join('') + '</div>';
  document.body.append(scrim, sheet);
  const body = sheet.querySelector('.set-body'), secEl = id => sheet.querySelector('[data-sec="' + id + '"] .set-in');
  let lastFocus = null, toastHome = null;
  const toastEl = document.getElementById('toast');

  const row = (label, ctl, hint = '', cls = '') => '<div class="set-row' + (cls ? ' ' + cls : '') + '"><div class="set-rl"><span class="set-l">' + label + '</span>' + (hint ? '<span class="set-hint">' + hint + '</span>' : '') + '</div><div class="set-rc">' + ctl + '</div></div>';
  const go = (label, attr, hint = '') => '<button type="button" class="set-go" ' + attr + '><span><b>' + label + '</b>' + (hint ? '<em>' + hint + '</em>' : '') + '</span><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg></button>';

  const PAINT = {
    appearance(el) {
      const pref = ctx.themePref?.() || 'light', had = el.contains(document.activeElement) ? document.activeElement.dataset.themePick : null;
      el.innerHTML = row('Theme', '<div class="seg seg3" role="radiogroup" aria-label="Theme">' + [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Match device']].map(([k, l]) =>
          '<button type="button" role="radio" data-theme-pick="' + k + '" aria-checked="' + (pref === k) + '" aria-pressed="' + (pref === k) + '">' + l + '</button>').join('') + '</div>',
          pref === 'auto' ? 'Follows your computer or phone: now ' + (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light') + '.' : '') +
        row('Show sources on cards and panels', '<label class="tg2"><input type="checkbox" id="setSources"' + (ctx.showSources?.() ? ' checked' : '') + ' aria-label="Show sources on cards and panels"></label>', 'Off by default for a clean view. Exported reports always list their sources.') +
        row('Panel width', '<button type="button" class="btn sm" id="setPw"' + (get('fs-panel-w') ? '' : ' disabled') + '>Reset</button>', get('fs-panel-w') ? 'The Map’s side panel is ' + get('fs-panel-w') + 'px wide. Reset puts it back to the default.' : 'The Map’s side panel is at its default width. Drag its edge to change it.', 'set-desk'); // phones have no side panel
      el.querySelectorAll('[data-theme-pick]').forEach(b => b.onclick = () => { ctx.setTheme?.(b.dataset.themePick); PAINT.appearance(el); el.querySelector('[data-theme-pick="' + b.dataset.themePick + '"]')?.focus(); });
      if (had) el.querySelector('[data-theme-pick="' + had + '"]')?.focus(); // a redraw keeps the keyboard where it was
      el.querySelector('#setSources').onchange = e => { ctx.showSources?.(e.target.checked); ctx.refreshSources?.(); };
      el.querySelector('#setPw').onclick = () => { ctx.resetPanelWidth?.(); ctx.toast('Panel width reset.'); PAINT.appearance(el); };
    },
    team(el) {
      if (!el.firstChild || !el.querySelector('.team')) { el.innerHTML = ''; const slot = document.createElement('div'); el.append(slot); ctx.team?.mountSettings?.(slot); }
      else ctx.team?.refresh?.();
      if (!ctx.team) el.innerHTML = '<div class="set-note">Team sharing isn’t available in this browser.</div>';
    },
    map(el) {
      const cur = BASES[get(BASE_KEY)] ? get(BASE_KEY) : 'dots';
      el.innerHTML = row('Default base map', '<select class="chip" id="setBase" aria-label="Default base map">' + Object.entries(BASES).map(([k, l]) => '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>', 'The map opens with this one. You can still switch any time under Layers.') +
        '<div class="set-links">' + go('Map layers &amp; display…', 'data-act="layers"', 'Dot grid, county lines, roads, road names, 3D and every data layer') +
        go('Headline metrics…', 'data-act="kpis"', 'The 3 to 9 numbers above the filing list') + '</div>';
      el.querySelector('#setBase').onchange = e => { try { localStorage.setItem(BASE_KEY, e.target.value); } catch (err) {} if (ctx.basemap?.() !== e.target.value) ctx.setMapOptions?.({ basemap: e.target.value }); ctx.toast('The map will open with ' + BASES[e.target.value] + '.'); };
      wireActs(el);
    },
    saved(el) {
      const n = { searches: count('fs-saved-searches'), compare: count('fs-compare'), notes: ctx.field?.db?.notes?.length || 0, watch: ctx.field?.db?.watch?.length || 0, projects: ctx.sitePlan?.projects?.length || 0, files: count('fs-reports') };
      const it = (label, num, view, extra = '') => '<li><span><b>' + fmtN(num) + '</b> ' + label + extra + '</span><button type="button" class="lnk" data-open="' + view + '">Open</button></li>';
      el.innerHTML = '<ul class="set-saved">' +
        it(n.searches === 1 ? 'saved search' : 'saved searches', n.searches, 'saved') +
        it(n.compare === 1 ? 'area in Compare' : 'areas in Compare', n.compare, 'compare') +
        it(n.notes === 1 ? 'site note' : 'site notes', n.notes, 'field', n.watch ? ' · <b>' + fmtN(n.watch) + '</b> watched' : '') +
        it(n.projects === 1 ? 'project' : 'projects', n.projects, 'projects') +
        it(n.files === 1 ? 'saved report file' : 'saved report files', n.files, 'reports') + '</ul>' +
        '<div class="set-note">Kept in this browser. Notes and projects are also shared with your team when team sharing is on.</div>';
      el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { close(); ctx.setView(b.dataset.open); });
    },
    app(el) {
      const inst = standalone() ? '<span class="set-ok">Installed ✓</span>' : installEvt ? '<button type="button" class="btn primary sm" id="setInstall">Install app</button>' : '';
      const how = standalone() ? 'It opens in its own window and keeps working offline with the last data it loaded.'
        : installEvt ? 'Opens in its own window and keeps working offline.'
        : isIOS ? 'Opens like an app and keeps working offline. In Safari, tap Share → Add to Home Screen.'
        : 'Opens in its own window and keeps working offline. In Chrome or Edge, use the install button in the address bar; other browsers may not offer it.';
      el.innerHTML = row('Install the app', inst, how) +
        '<div class="set-keys set-desk"><span class="set-l">Keyboard shortcuts</span><dl>' +
        [[mod + 'K', 'Search the map'], [mod + '/', 'Ask AI'], [mod + ',', 'Settings'], ['Esc', 'Close a card, menu or this sheet']].map(([k, d]) => '<div><dt><kbd>' + esc(k) + '</kbd></dt><dd>' + esc(d) + '</dd></div>').join('') + '</dl></div>' +
        row('Reset layout', '<button type="button" class="btn sm" id="setReset">Reset…</button>', 'Puts the panel, its sections, headline metrics, timeline and export choices back to how they started. Your notes, projects, saved searches and settings stay.');
      el.querySelector('#setInstall')?.addEventListener('click', () => ctx.install.prompt());
      el.querySelector('#setReset').onclick = resetLayout;
    },
    help(el) {
      el.innerHTML = '<div class="set-links">' + go('Getting started', 'data-act="intro"', 'The short tip on what the app does, at the top of the Map panel') + go('Data sources &amp; freshness', 'data-act="sources"', 'Where every number comes from and when it was last refreshed') +
        go('Save voice log', 'data-act="voicelog"', 'What the voice assistant heard and did in this visit, for troubleshooting') + '</div>';
      wireActs(el);
    },
  };
  function wireActs(el) {
    el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
      const a = b.dataset.act;
      if (a === 'voicelog') { ctx.saveVoiceLog(); return; }
      close();
      if (a === 'intro') { ctx.showIntro?.(); return; }
      if (a === 'sources') { ctx.setView('sources'); return; }
      ctx.setView('map');
      const phone = matchMedia('(max-width:700px)').matches;
      if (a === 'layers') {
        if (phone) document.querySelector('#mnav [data-tab=map]')?.click();
        setTimeout(() => { if (!document.getElementById('layers')?.classList.contains('on')) document.getElementById('layersBtn')?.click(); }, 60);
      } else if (a === 'kpis') {
        // the metrics sit in the panel's Construction Filings section: show the panel, open the section, then the picker
        if (phone) document.querySelector('#mnav [data-tab=list]')?.click();
        else if (app.classList.contains('pcollapsed')) document.getElementById('panelToggle')?.click();
        const sec = document.getElementById('secFilings'); if (sec?.getAttribute('aria-expanded') !== 'true') sec?.click();
        setTimeout(() => { ctx.openKpis?.(); requestAnimationFrame(() => document.getElementById('kpiPop')?.scrollIntoView({ block: 'nearest' })); }, 80);
      }
    });
  }
  function resetLayout() {
    if (!confirm('Reset the layout?\n\nThe panel, its sections, headline metrics, timeline and export choices go back to how they started, and the page reloads. Your notes, projects, saved searches and other settings are kept.')) return;
    try {
      const keys = LAYOUT_KEYS.slice();
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('fs-sec-')) keys.push(k); }
      keys.forEach(k => localStorage.removeItem(k));
    } catch (e) {}
    location.reload();
  }
  function paintSec(id) { if (!sheet.hidden) PAINT[id](secEl(id)); } // closed: it's drawn fresh when it opens

  // ---------- open / close, focus kept inside, Esc and the scrim close ----------
  function open(section) {
    if (sheet.hidden) {
      lastFocus = document.activeElement;
      SECTIONS.forEach(([id]) => PAINT[id](secEl(id)));
      sheet.hidden = false; scrim.hidden = false; app.classList.add('set-open'); gear?.setAttribute('aria-expanded', 'true');
      if (toastEl) { toastHome = [toastEl.parentNode, toastEl.nextSibling]; document.body.append(toastEl); } // messages from here show over the sheet
      requestAnimationFrame(() => { sheet.classList.add('on'); scrim.classList.add('on'); });
    }
    const target = section && sheet.querySelector('[data-sec="' + section + '"]');
    if (target) { body.scrollTop = 0; target.scrollIntoView({ block: 'start' }); flash(target); }
    else body.scrollTop = 0;
    setTimeout(() => (target?.querySelector('input,select,button') || sheet.querySelector('#setClose')).focus({ preventScroll: true }), 30);
  }
  function close() {
    if (sheet.hidden) return;
    sheet.classList.remove('on'); scrim.classList.remove('on'); app.classList.remove('set-open'); gear?.setAttribute('aria-expanded', 'false');
    sheet.hidden = true; scrim.hidden = true;
    if (toastHome?.[0]?.isConnected) toastHome[0].insertBefore(toastEl, toastHome[1]?.parentNode === toastHome[0] ? toastHome[1] : null); toastHome = null;
    ctx.team?.refresh?.(); // the header chips pick up a new name
    if (lastFocus?.isConnected) lastFocus.focus?.({ preventScroll: true }); lastFocus = null;
  }
  function flash(el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  ctx.openSettings = open; ctx.closeSettings = close;
  sheet.querySelector('#setClose').onclick = close;
  scrim.onclick = close;
  sheet.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => { const t = sheet.querySelector('[data-sec="' + b.dataset.jump + '"]'); t.scrollIntoView({ block: 'start', behavior: ctx.reduceMotion ? 'auto' : 'smooth' }); flash(t); });
  // Esc closes the sheet first (and only the sheet), wherever the focus is
  addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) { e.preventDefault(); e.stopImmediatePropagation(); close(); } }, true);
  sheet.addEventListener('keydown', e => ctx.trapTab(sheet, e)); // Tab stays in the sheet (app.js; Export uses the same)
  addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === ',' || e.code === 'Comma')) { e.preventDefault(); if (sheet.hidden) open(); else close(); }
  });
  document.getElementById('exploreSettings')?.addEventListener('click', () => open());
  // the theme can change under an open sheet (Match device, the OS switches)
  new MutationObserver(() => { if (!sheet.hidden) PAINT.appearance(secEl('appearance')); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
