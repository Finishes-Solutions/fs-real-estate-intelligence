// Quick layer buttons on the map, under the search box: the layers people reach for most, one tap each. They work the
// same controls as the Map Layers panel (which keeps every layer and the finer options: demographic measure, crime type,
// filing dot size, heatmap, basemap styles, live weather…), so the two always agree. "More" opens the panel.
const SAT = new Set(['sat', 'esri']);
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
  radar: I('<path d="M4.5 11.5a4.5 4.5 0 1 1 7 0"/><path d="M8 8 11 4.5M8 8h.01"/><path d="M3 14h10"/>'),
  more: I('<path d="M8 2 14.5 5.5 8 9 1.5 5.5z"/><path d="M2.5 8.2 8 11.2l5.5-3M2.5 10.9 8 13.9l5.5-3"/>')
};

export function initQuickLayers(ctx) {
  const box = document.getElementById('qlayers'); if (!box) return;
  const { map } = ctx, el = id => document.getElementById(id);
  const fire = x => x.dispatchEvent(new Event('change', { bubbles: true }));
  const check = id => ({ on: () => !!el(id)?.checked, toggle: () => { const c = el(id); if (c) { c.checked = !c.checked; fire(c); } } });
  const live = k => ({ on: () => !!ctx.live?.state?.()?.[k], toggle: () => ctx.live?.set({ [k]: !ctx.live.state()[k] }) });
  let lastBase = 'dots', lastDemo = 'inc';
  const CHIPS = [
    { k: 'sat', label: 'Satellite', title: 'Satellite imagery (Map Layers has more basemaps)', on: () => SAT.has(ctx.basemap()),
      toggle: () => { const b = ctx.basemap(); if (SAT.has(b)) ctx.setMapOptions({ basemap: lastBase }); else { lastBase = b; ctx.setMapOptions({ basemap: 'sat' }); } } },
    { k: 'tilt', label: '3D', title: 'Tilt the map: 3D buildings, terrain and planes in the air', on: () => map.getPitch() > 1, toggle: () => ctx.setMapOptions({ tilt: !(map.getPitch() > 1) }) },
    { k: 'parcels', label: 'Parcels', title: 'Parcel lines at street zoom (Regrid)', ...check('lyRegrid') },
    { k: 'flood', label: 'Flood Zones', title: 'FEMA 100- and 500-year flood zones (zoom in)', ...check('lyFema') },
    { k: 'demo', label: 'Demographics', title: 'Census tracts coloured by a measure (pick which in Map Layers)', on: () => !!el('lyDemo')?.value,
      toggle: () => { const s = el('lyDemo'); if (!s) return; if (s.value) { lastDemo = s.value; s.value = ''; } else s.value = lastDemo; fire(s); } },
    { k: 'traffic', label: 'Traffic Counts', title: 'TxDOT average daily traffic on counted roads', ...check('lyAadt') },
    { k: 'filings', label: 'Filings', title: 'Construction filings (TDLR) as dots', ...check('lyFilings') },
    { k: 'planes', label: 'Planes', title: 'Live aircraft', ...live('planes') },
    { k: 'radar', label: 'Radar', title: 'Live rain radar', ...live('radar') }
  ];
  box.innerHTML = CHIPS.map(c => '<button class="qchip" type="button" data-q="' + c.k + '" aria-pressed="false" title="' + c.title + '">' + ICON[c.k] + '<span>' + c.label + '</span></button>').join('') +
    '<button class="qchip qmore" type="button" data-q="more" title="All map layers and options">' + ICON.more + '<span>More</span></button>';
  function sync() {
    for (const c of CHIPS) { const b = box.querySelector('[data-q="' + c.k + '"]'); let v = false; try { v = !!c.on(); } catch (e) {} if (b.getAttribute('aria-pressed') !== String(v)) b.setAttribute('aria-pressed', String(v)); }
    const m = box.querySelector('.qmore'); m.setAttribute('aria-pressed', String(!!el('layers')?.classList.contains('on')));
  }
  box.addEventListener('click', async e => {
    const b = e.target.closest('.qchip'); if (!b) return;
    if (b.dataset.q === 'more') { el('layersBtn')?.click(); sync(); return; }
    const c = CHIPS.find(x => x.k === b.dataset.q); try { await c.toggle(); } catch (err) { console.error(err); }
    sync(); setTimeout(sync, 500); setTimeout(sync, 2000); // some layers can refuse a moment later (Regrid allowance, no traffic key)
  });
  // anything else that changes a layer (the panel, the assistant, a report's "show on map") shows up here too
  el('layers')?.addEventListener('change', () => setTimeout(sync, 0));
  map.on('idle', sync); map.on('pitchend', sync);
  new MutationObserver(sync).observe(el('layers'), { attributes: true, attributeFilter: ['class'] });
  sync();
  ctx.syncQuickLayers = sync;
}
