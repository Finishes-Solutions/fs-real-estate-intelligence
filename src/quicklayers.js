// Quick layer buttons on the map, under its tool row: the data layers people reach for most, one tap each, on one row that
// scrolls sideways. They work the same controls as the Map layers panel (every layer and the finer options: demographic
// measure, crime type, filing dot size, heatmap, base maps, live weather…), so the two always agree.
// The buttons and the panel's groups are ordered by what this person turns on most (counted per browser, lib/layeruse.mjs);
// a new user gets parcels, flood zones, demographics, traffic, satellite and 3D first, then filings and the live feeds.
// This file also keeps the panel's counts: the [Layers · N] button, the panel header, its "On now" list and each group's
// count, all from activeLayers() (every layer drawing data on the map; display settings like roads or 3D buildings don't count).
import { parseUse, bumpUse, orderByUse, orderGroups, CHIP_GROUP, PANEL_KEY } from './lib/layeruse.mjs';
const SAT = new Set(['sat', 'esri']);
const USE_KEY = 'fs-layer-use';
function readUse() { try { return parseUse(localStorage.getItem(USE_KEY)); } catch (e) { return {}; } }
function noteUse(key) { try { localStorage.setItem(USE_KEY, JSON.stringify(bumpUse(readUse(), key))); } catch (e) {} }
const I = d => '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
const ICON = {
  sat: I('<circle cx="8" cy="8" r="5.6"/><path d="M2.6 8h10.8M8 2.4c1.9 2 1.9 9.2 0 11.2M8 2.4c-1.9 2-1.9 9.2 0 11.2"/>'),
  tilt: I('<path d="M8 2 14 5.2v5.6L8 14 2 10.8V5.2z"/><path d="M2 5.2 8 8.4l6-3.2M8 8.4V14"/>'),
  parcels: I('<path d="M2 3h12v10H2zM7 3v10M2 8h5M7 6h7"/>'),
  flood: I('<path d="M2 10c1.5 1.2 2.5 1.2 4 0s2.5-1.2 4 0 2.5 1.2 4 0M2 13c1.5 1.2 2.5 1.2 4 0s2.5-1.2 4 0 2.5 1.2 4 0M8 2 5.5 6a2.6 2.6 0 1 0 5 0z"/>'),
  demo: I('<circle cx="5.5" cy="5.5" r="2"/><circle cx="11" cy="6.5" r="1.6"/><path d="M1.8 13c.4-2.4 1.8-3.6 3.7-3.6S8.8 10.6 9.2 13M9.6 10.2c.5-.5 1-.7 1.6-.7 1.5 0 2.6 1.1 2.9 3.5"/>'),
  traffic: I('<path d="M5 2 3 14M11 2l2 12M8 3v2M8 7.5v2M8 12v2"/>'),
  filings: I('<path d="M3 14V6l5-4 5 4v8"/><path d="M6.5 14v-4h3v4"/>'),
  planes: I('<path d="M8 1.8v12.4M8 6.3 2 9v1.4l6-1.6 6 1.6V9zM5.8 13.6 8 12.8l2.2.8"/>'),
  radar: I('<path d="M4.5 11.5a4.5 4.5 0 1 1 7 0"/><path d="M8 8 11 4.5M8 8h.01"/><path d="M3 14h10"/>')
};

export function initQuickLayers(ctx) {
  const box = document.getElementById('qlayers'); if (!box) return;
  const { map } = ctx, el = id => document.getElementById(id);
  const fire = x => x.dispatchEvent(new Event('change', { bubbles: true }));
  const check = id => ({ on: () => !!el(id)?.checked, toggle: () => { const c = el(id); if (c) { c.checked = !c.checked; fire(c); } } });
  const live = k => ({ on: () => !!ctx.live?.state?.()?.[k], toggle: () => ctx.live?.set({ [k]: !ctx.live.state()[k] }) });
  let lastBase = 'dots', lastDemo = 'inc';
  const CHIPS = [
    { k: 'parcels', label: 'Parcels', title: 'Parcel lines at street zoom (Regrid)', ...check('lyRegrid') },
    { k: 'flood', label: 'Flood Zones', title: 'FEMA 100- and 500-year flood zones (zoom in)', ...check('lyFema') },
    { k: 'demo', label: 'Demographics', title: 'Census tracts coloured by a measure (pick which in Map Layers)', on: () => !!el('lyDemo')?.value,
      toggle: () => { const s = el('lyDemo'); if (!s) return; if (s.value) { lastDemo = s.value; s.value = ''; } else s.value = lastDemo; fire(s); } },
    { k: 'traffic', label: 'Traffic Counts', title: 'TxDOT average daily traffic on counted roads', ...check('lyAadt') },
    { k: 'filings', label: 'Filings', title: 'Construction filings (TDLR): dots, or the heatmap set in Map Layers', on: () => ctx.filingsShown ? ctx.filingsShown() : !!el('lyFilings')?.checked,
      toggle: () => ctx.setFilingsShown ? ctx.setFilingsShown(!ctx.filingsShown()) : check('lyFilings').toggle() },
    { k: 'planes', label: 'Planes', title: 'Live aircraft', ...live('planes') },
    { k: 'radar', label: 'Radar', title: 'Live rain radar', ...live('radar') },
    { k: 'sat', label: 'Satellite', title: 'Satellite imagery (Map Layers has more basemaps)', on: () => SAT.has(ctx.basemap()),
      toggle: () => { const b = ctx.basemap(); if (SAT.has(b)) ctx.setMapOptions({ basemap: lastBase }); else { lastBase = b; ctx.setMapOptions({ basemap: 'sat' }); } } },
    { k: 'tilt', label: '3D', title: 'Tilt the map: 3D buildings, terrain and planes in the air', on: () => map.getPitch() > 1, toggle: () => ctx.setMapOptions({ tilt: !(map.getPitch() > 1) }) }
  ];
  // most used first (read once per visit, so the row never shuffles under the pointer)
  const order = orderByUse(CHIPS.map(c => c.k), readUse());
  CHIPS.sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k));
  box.innerHTML = CHIPS.map(c => '<button class="qchip" type="button" data-q="' + c.k + '" aria-pressed="false" title="' + c.title + '">' + ICON[c.k] + '<span>' + c.label + '</span></button>').join('');
  // the row scrolls sideways when the chips don't all fit: an arrow at each end that has more chips past it (the faded edge alone gave no cue)
  const ARROW = d => '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
  const mkArrow = (dir) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'qarrow ' + (dir < 0 ? 'ql' : 'qr'); b.hidden = true; b.tabIndex = -1;
    b.setAttribute('aria-label', dir < 0 ? 'Show earlier layer buttons' : 'Show more layer buttons'); b.title = dir < 0 ? 'Earlier layers' : 'More layers'; b.innerHTML = ARROW(dir < 0 ? 'M10 3 5 8l5 5' : 'M6 3l5 5-5 5');
    b.onclick = () => box.scrollBy({ left: dir * Math.max(120, box.clientWidth * .7), behavior: ctx.reduceMotion ? 'auto' : 'smooth' }); return b; };
  const arrL = mkArrow(-1), arrR = mkArrow(1); box.prepend(arrL); box.append(arrR);
  // ---------- what's on, for the Layers button, the panel header, "On now" and the group counts ----------
  const panel = el('layers'), NOT_LAYERS = new Set(['lyFilings', 'lyBldg', 'lyLotFill', 'lyGrid', 'lyCounties', 'lyRoads', 'lyNames', 'ly3d']);
  const nameOf = lab => { const sp = lab?.querySelector('span'); if (!sp) return ''; const c = sp.cloneNode(true); c.querySelector('.ly-na')?.remove(); return c.textContent.trim(); };
  function activeLayers() {
    const out = [];
    try { if (ctx.filingsShown?.()) out.push({ k: 'filings', g: 'filings', label: ctx.layersState?.dots ? 'Construction filings' : 'Filings heatmap', off: () => ctx.setFilingsShown(false) }); } catch (e) {}
    for (const i of panel.querySelectorAll('input[type=checkbox]')) {
      if (!i.checked || NOT_LAYERS.has(i.id) || i.closest('[hidden]') || i.closest('#lyOnNow')) continue;
      const lab = i.closest('label'); out.push({ k: i.id || 'live-' + i.dataset.live, g: i.closest('[data-lyg]')?.dataset.lyg || '', label: nameOf(lab), off: () => { i.checked = false; fire(i); } });
    }
    const d = el('lyDemo'); if (d?.value) out.push({ k: 'lyDemo', g: 'demo', label: 'Demographics: ' + (d.selectedOptions[0]?.textContent || d.value), off: () => { d.value = ''; fire(d); } });
    return out;
  }
  ctx.activeLayers = activeLayers;
  let onKey = null, onNow = [];
  function syncCounts() {
    const on = activeLayers(), n = on.length, ln = el('layersN');
    if (ln) { ln.textContent = n || ''; ln.hidden = !n; }
    const lo = el('layersOpen'); if (lo) { lo.classList.toggle('on', n > 0); const t = n ? 'Map layers: ' + on.map(x => x.label).join(', ') : 'Map layers'; lo.title = t; lo.setAttribute('aria-label', n ? 'Map layers, ' + n + ' on' : 'Map layers'); }
    const lb = el('layersBtn'); if (lb) { lb.classList.toggle('on', n > 0); lb.title = n ? 'Map layers · ' + n + ' on' : 'Map layers'; }
    const hn = el('lyHeadN'); if (hn) hn.textContent = n ? ' · ' + n + ' on' : '';
    for (const sec of panel.querySelectorAll('details[data-lyg]')) { const c = on.filter(x => x.g === sec.dataset.lyg).length, em = sec.querySelector('summary em'); const t = c ? c + ' on' : ''; if (em && em.textContent !== t) em.textContent = t; }
    onNow = on; const key = on.map(x => x.k + ':' + x.label).join('|'); if (key === onKey) return; onKey = key;
    const wrap = el('lyOnNow'), list = el('lyOnList'); if (!wrap || !list) return;
    wrap.hidden = !n;
    list.innerHTML = on.map((x, i) => '<label class="tg2"><input type="checkbox" checked data-onk="' + i + '"><span>' + ctx.esc(x.label) + '</span></label>').join('');
  }
  el('lyOnList')?.addEventListener('change', e => { const i = e.target.closest('[data-onk]'); if (!i || i.checked) return; e.stopPropagation(); const x = onNow[+i.dataset.onk]; try { x?.off(); } catch (err) { console.error(err); } setTimeout(sync, 0); setTimeout(sync, 600); });
  // the panel's groups, most used first ("Map display" stays last). Each layer's key is its quick button's when it has one.
  const panelKey = i => { const k = i.id || (i.dataset.live ? 'live-' + i.dataset.live : ''); return PANEL_KEY[k] || k; };
  function groupOfKey(k) {
    if (CHIP_GROUP[k]) return CHIP_GROUP[k];
    const i = k.startsWith('live-') ? panel.querySelector('input[data-live="' + CSS.escape(k.slice(5)) + '"]') : el(k);
    return i && panel.contains(i) ? i.closest('[data-lyg]')?.dataset.lyg : undefined;
  }
  function orderPanel() {
    const secs = [...panel.querySelectorAll(':scope > details[data-lyg]')], last = secs.find(s => s.dataset.lyg === 'display'), lead = secs.filter(s => s !== last);
    if (!lead.length) return;
    const order = orderGroups(lead.map(s => s.dataset.lyg), readUse(), groupOfKey), anchor = last || lead[lead.length - 1].nextSibling;
    for (const g of order) { const s = lead.find(x => x.dataset.lyg === g); if (s) panel.insertBefore(s, anchor); }
  }
  orderPanel();
  // opening the panel: groups re-ordered by use; the groups with something on open, the rest fold (with nothing on, the
  // most used group opens)
  ctx.openLayerGroups = () => {
    orderPanel();
    const on = activeLayers(), first = panel.querySelector(':scope > details[data-lyg]');
    for (const sec of panel.querySelectorAll('details[data-lyg]')) sec.open = on.some(x => x.g === sec.dataset.lyg) || (!on.length && sec === first);
  };
  // counting uses: a person turning a layer ON (a quick button, a panel switch, the demographics menu or a satellite base
  // map). Changes made by code (the assistant, a report's "show on map", a button working the panel's switch) don't count.
  panel.addEventListener('change', e => {
    if (!e.isTrusted) return; const i = e.target;
    if (!i || i.closest('#lyOnNow')) return;
    if (i.type === 'checkbox' ? !i.checked || NOT_LAYERS.has(i.id) && i.id !== 'lyFilings' : !(i.id === 'lyDemo' && i.value)) return;
    const k = panelKey(i); if (k) noteUse(k);
  }, true);
  panel.addEventListener('click', e => { const b = e.isTrusted && e.target.closest?.('#styleSeg [data-style]'); if (b && SAT.has(b.dataset.style) && !SAT.has(ctx.basemap())) noteUse('sat');
    const h = e.isTrusted && e.target.closest?.('#heatSeg [data-heat]'); if (h && h.dataset.heat !== 'off' && h.getAttribute('aria-pressed') !== 'true') noteUse('filings'); }, true);
  // the row scrolls sideways; a faded edge shows on whichever side has more
  function fade() { const l = box.scrollLeft > 2, r = box.scrollLeft + box.clientWidth < box.scrollWidth - 2; box.classList.toggle('fl', l); box.classList.toggle('fr', r); arrL.hidden = !l; arrR.hidden = !r; }
  box.addEventListener('scroll', fade, { passive: true });
  // a mouse wheel scrolls the row sideways when it has more chips than fit
  box.addEventListener('wheel', e => { if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || box.scrollWidth <= box.clientWidth) return; e.preventDefault(); box.scrollLeft += e.deltaY; }, { passive: false }); addEventListener('resize', fade);
  if (window.ResizeObserver) new ResizeObserver(fade).observe(box);
  function sync() {
    for (const c of CHIPS) { const b = box.querySelector('[data-q="' + c.k + '"]'); let v = false; try { v = !!c.on(); } catch (e) {} if (b.getAttribute('aria-pressed') !== String(v)) b.setAttribute('aria-pressed', String(v)); }
    syncCounts(); fade();
  }
  box.addEventListener('click', async e => {
    const b = e.target.closest('.qchip'); if (!b) return;
    const c = CHIPS.find(x => x.k === b.dataset.q); let was = true; try { was = !!c.on(); } catch (err) {}
    if (!was && e.isTrusted) noteUse(c.k);
    try { await c.toggle(); } catch (err) { console.error(err); }
    sync(); setTimeout(sync, 500); setTimeout(sync, 2000); // some layers can refuse a moment later (Regrid allowance, no traffic key)
  });
  // anything else that changes a layer (the panel, the assistant, a report's "show on map") shows up here too
  el('layers')?.addEventListener('change', () => setTimeout(sync, 0), true); // capture: code that fires a non-bubbling change counts too
  map.on('idle', sync); map.on('pitchend', sync);
  new MutationObserver(sync).observe(el('layers'), { attributes: true, attributeFilter: ['class'] });
  sync();
  ctx.syncQuickLayers = sync;
}
