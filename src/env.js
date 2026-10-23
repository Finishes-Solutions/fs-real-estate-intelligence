// Environment (api/env: TCEQ, EPA, Railroad Commission, US Fish & Wildlife Service, USDA; all free):
//   Map layers: Environmental sites (contamination and cleanup sites, petroleum tanks or EPA-permitted facilities, as
//   clickable dots, plus areas where groundwater use is restricted), Oil & gas wells and pipelines, Wetlands, Soils.
//   Environmental Report for a site or area: every record within Phase I style search distances of the site's edge,
//   nearest first, wells and pipelines, wetlands and soils; opens in the card and exports as PDF or CSV.
import { KINDS, SETS } from './lib/env.mjs';
import { envReport, envCsvRows } from './lib/reports/env.mjs';
import { esc, fmt, kgrid, reportDoc, savePdf, saveCsv, openCard, cardTop, fillCard, areaMap, getJSON, errorBox, unavailable, friendly, layerFailed, layerOK } from './reportkit.js';

const SRC = 'env-sites', AREA = 'env-areas';
const RASTERS = { rrc: { box: 'lyRrc', note: 'lyRrcNote', minz: 11, opacity: .9, attr: 'Wells & pipelines: Railroad Commission of Texas', msg: 'Oil and gas wells (symbols by type: oil, gas, plugged, dry, injection) and pipelines from the Railroad Commission. Zoom in past neighborhood level.' },
  wetlands: { box: 'lyWetlands', note: 'lyWetlandsNote', minz: 11, opacity: .65, attr: 'Wetlands: US Fish & Wildlife Service NWI', msg: 'National Wetlands Inventory: green for marshes and swamps, blue for ponds, lakes and streams. Mapped from aerial photos; not a legal wetland determination.' },
  soils: { box: 'lySoils', note: 'lySoilsNote', minz: 13, opacity: .8, attr: 'Soils: USDA NRCS SSURGO', msg: 'USDA soil map units with their symbols. The Environmental Report lists each soil under a site with its drainage, flooding and building limits.' } };

export function initEnv(ctx) {
  const { map } = ctx, base = location.origin + location.pathname.replace(/[^/]*$/, '');
  const st = { sites: false, set: 'cleanup', rrc: false, wetlands: false, soils: false };
  try { Object.assign(st, JSON.parse(localStorage.getItem('fs-env') || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem('fs-env', JSON.stringify(st)); } catch (e) {} };
  const before = () => map.getLayer('filings') ? 'filings' : undefined;

  // ---------- raster layers ----------
  function addRaster(k) {
    if (!st[k] || !map.getStyle()) return; const R = RASTERS[k], id = 'env-' + k;
    try {
      if (!map.getSource(id)) map.addSource(id, { type: 'raster', tiles: [base + 'api/env?tile=' + k + '/{z}/{x}/{y}'], tileSize: 256, minzoom: R.minz, maxzoom: 19, attribution: R.attr });
      if (!map.getLayer(id)) map.addLayer({ id, type: 'raster', source: id, minzoom: R.minz, paint: { 'raster-opacity': R.opacity } }, before());
    } catch (e) { /* style loading */ }
  }
  const removeRaster = k => { const id = 'env-' + k; try { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id); } catch (e) {} };
  function setRaster(k, v) {
    st[k] = !!v; save(); const R = RASTERS[k], box = document.getElementById(R.box), note = document.getElementById(R.note);
    if (box) box.checked = st[k]; if (note) { note.hidden = !st[k]; note.textContent = R.msg; }
    if (!st[k]) { removeRaster(k); return; }
    addRaster(k); if (map.getZoom() < R.minz) ctx.toast?.('Zoom in to see this layer.');
  }
  for (const k of Object.keys(RASTERS)) { const box = document.getElementById(RASTERS[k].box); if (box) { box.checked = st[k]; box.onchange = () => setRaster(k, box.checked); } const note = document.getElementById(RASTERS[k].note); if (note) { note.hidden = !st[k]; note.textContent = RASTERS[k].msg; } }

  // ---------- environmental sites (dots) ----------
  const sbox = document.getElementById('lyEnvSites'), ssel = document.getElementById('lyEnvSet'), snote = document.getElementById('lyEnvSitesNote');
  if (ssel) { ssel.innerHTML = Object.entries(SETS).map(([k, v]) => '<option value="' + k + '">' + esc(v) + '</option>').join('') + '<option value="all">All of these</option>'; ssel.value = st.set; }
  let seq = 0, ctl = null, lastKey = '';
  const say = t => { if (snote) snote.textContent = t; };
  const kindColor = ['match', ['get', 'k'], ...Object.entries(KINDS).flatMap(([k, K]) => [k, K.color]), '#495057'];
  async function loadSites() {
    if (!st.sites) return; const my = ++seq, z = map.getZoom();
    if (z < 12) { setSites({ sites: [], areas: [] }); lastKey = ''; say('Zoom in to see environmental sites.'); return; }
    const b = map.getBounds(), r = v => Math.round(v * 200) / 200, bb = [r(b.getWest()) - .005, r(b.getSouth()) - .005, r(b.getEast()) + .005, r(b.getNorth()) + .005].map(v => +v.toFixed(3));
    if ((bb[2] - bb[0]) * (bb[3] - bb[1]) > 0.06) { say('Zoom in a little to see environmental sites.'); return; }
    const key = bb.join(',') + '&set=' + st.set; if (key === lastKey && map.getSource(SRC)) return;
    ctl?.abort(); ctl = new AbortController(); say('Loading environmental sites…');
    try {
      const d = await getJSON('api/env?box=' + key, { what: 'Environmental site data', signal: ctl.signal });
      if (my !== seq) return; lastKey = key; setSites(d);
      const by = {}; for (const s of d.sites) by[s[0]] = (by[s[0]] || 0) + 1;
      say(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, n]) => fmt(n) + ' ' + KINDS[k].short.toLowerCase()).join(', ') + (d.areas?.length ? (Object.keys(by).length ? ', ' : '') + d.areas.length + ' groundwater restriction area' + (d.areas.length > 1 ? 's' : '') : '') + (d.sites.length || d.areas?.length ? ' in view.' : 'None in view.') + (d.errors ? ' Some sources did not answer.' : '') + ' Click a dot for details.');
    } catch (e) { if (e.name !== 'AbortError') layerFailed(ctx, e, { what: 'Environmental site data', off: () => setSitesOn(false), note: snote }); }
  }
  function setSites(d) {
    const pts = { type: 'FeatureCollection', features: (d.sites || []).map(s => ({ type: 'Feature', properties: { k: s[0], id: s[1], name: s[2], addr: s[3] }, geometry: { type: 'Point', coordinates: [s[4], s[5]] } })) };
    const areas = { type: 'FeatureCollection', features: (d.areas || []).filter(a => a.rings?.length).map(a => ({ type: 'Feature', properties: { k: a.kind, id: a.id, name: a.name, addr: a.addr }, geometry: { type: 'Polygon', coordinates: a.rings } })) };
    try {
      if (map.getSource(SRC)) { map.getSource(SRC).setData(pts); map.getSource(AREA)?.setData(areas); return; }
      map.addSource(AREA, { type: 'geojson', data: areas }); map.addSource(SRC, { type: 'geojson', data: pts });
      map.addLayer({ id: AREA, type: 'fill', source: AREA, paint: { 'fill-color': KINDS.msd.color, 'fill-opacity': .12 } }, before());
      map.addLayer({ id: AREA + '-ln', type: 'line', source: AREA, paint: { 'line-color': KINDS.msd.color, 'line-width': 1.5, 'line-dasharray': [3, 2] } }, before());
      map.addLayer({ id: SRC, type: 'circle', source: SRC, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 3.5, 16, 6.5], 'circle-color': kindColor, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.3 } });
    } catch (e) { /* style loading */ }
  }
  function legend() {
    if (!st.sites) { ctx.setLegend?.('env', ''); return; }
    const ks = Object.keys(KINDS).filter(k => st.set === 'all' ? ['cleanup', 'tanks', 'epa'].includes(KINDS[k].set) : KINDS[k].set === st.set);
    ctx.setLegend?.('env', '<div class="t">' + esc(SETS[st.set] || 'Environmental sites') + '</div><div class="lg2">' + ks.map(k => '<div class="li" title="' + esc(KINDS[k].label) + '"><i style="background:' + KINDS[k].color + '"></i>' + esc(KINDS[k].short) + '</div>').join('') + '</div>');
  }
  function setSitesOn(v) {
    st.sites = !!v; save(); if (sbox) sbox.checked = st.sites; if (snote) snote.hidden = !st.sites; if (ssel) ssel.hidden = !st.sites; if (st.sites) layerOK(snote);
    if (!st.sites) { ctl?.abort(); lastKey = ''; try { for (const id of [SRC, AREA + '-ln', AREA]) if (map.getLayer(id)) map.removeLayer(id); for (const id of [SRC, AREA]) if (map.getSource(id)) map.removeSource(id); } catch (e) {} legend(); return; }
    legend(); loadSites(); if (map.getZoom() < 12) ctx.toast?.('Environmental sites show from neighborhood zoom: zoom in to see them.');
  }
  if (sbox) { sbox.checked = st.sites; sbox.onchange = () => setSitesOn(sbox.checked); }
  if (ssel) { ssel.hidden = !st.sites; ssel.onchange = () => { st.set = ssel.value; save(); lastKey = ''; if (st.sites) { legend(); loadSites(); } else setSitesOn(true); }; }
  if (snote) snote.hidden = !st.sites;
  let moveT = 0; map.on('moveend', () => { if (st.sites) { clearTimeout(moveT); moveT = setTimeout(loadSites, 350); } });
  ctx.onOverlays?.(() => { for (const k of Object.keys(RASTERS)) addRaster(k); if (st.sites) { lastKey = ''; legend(); loadSites(); } });
  const showPopup = e => {
    const f = e.features?.[0]; if (!f) return; const K = KINDS[f.properties.k] || {};
    const pop = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' }).setLngLat(e.lngLat).setHTML('<div class="env-pop"><span class="pl-dot" style="background:' + (K.color || '#555') + '"></span><b>' + esc(f.properties.name) + '</b><div>' + esc(K.label || '') + (f.properties.id ? ' · ID ' + esc(f.properties.id) : '') + '</div>' + (f.properties.addr ? '<div>' + esc(f.properties.addr) + '</div>' : '') +
      '<button class="btn sm" type="button">Environmental Report Here</button></div>').addTo(map);
    pop.getElement().querySelector('button').onclick = () => { pop.remove(); report({ geometry: circleAt([e.lngLat.lng, e.lngLat.lat], 0.05), label: f.properties.name }); };
  };
  // these layers handle their own clicks (the map's click doesn't also open a building)
  // (only the dots: a click inside a groundwater-restriction area still opens the building there)
  ctx.clickLayers?.push(SRC);
  for (const id of [SRC]) { map.on('click', id, showPopup); map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'var(--cur-pointer)'; }); map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; }); }
  ctx.envLayer = (which, v, set) => { if (which === 'sites') { if (set && (SETS[set] || set === 'all')) { st.set = set; if (ssel) ssel.value = set; lastKey = ''; } setSitesOn(v !== false); } else if (RASTERS[which]) setRaster(which, v !== false); };

  // ---------- the report ----------
  const circleAt = ([lon, lat], mi) => { const r = mi / 69.17, k = Math.cos(lat * Math.PI / 180), ring = []; for (let i = 0; i <= 48; i++) { const a = (i % 48) / 48 * 2 * Math.PI; ring.push([lon + r * Math.cos(a) / k, lat + r * Math.sin(a)]); } return { type: 'Polygon', coordinates: [ring] }; };
  const reportFor = (geometry, label, more = {}) => getJSON('api/env', { what: 'Environmental data', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ geometry, label, ...more }) });
  ctx.envReportData = reportFor;
  const { ORDER, miTxt, where, errNote, soilList, headline, body, reportHtml } = envReport({ esc, fmt, kgrid, unavailable, areaMap, reportDoc });
  let last = null;
  async function report({ geometry, label }) {
    if (ctx.view !== 'map') ctx.setView?.('map');
    const card = openCard(ctx, { kicker: 'Environmental report', title: label, loading: 'Searching state and federal environmental records…' });
    let d; try { d = await reportFor(geometry, label); } catch (e) { card.querySelector('.bsec').replaceChildren(errorBox(e, () => report({ geometry, label }), 'Environmental data')); return { error: friendly(e, 'Environmental data') }; }
    last = { d, label, geometry }; draw(card);
    return d;
  }
  // (re)draw the card from last.d; Retry asks again for just that source and redraws
  function draw(card) {
    const { d, label, geometry } = last;
    fillCard(ctx, card, cardTop('Environmental report', label, (d.area_sqmi < 1 ? Math.round(d.area_sqmi * 640) + ' acres' : d.area_sqmi.toFixed(2) + ' sq mi') + ' searched, plus the distances below') + body(d) +
      '<div class="bacts"><button class="btn" id="envLayers" type="button">Show on Map</button><button class="btn primary" id="envPdf" type="button">Export PDF</button><button class="btn" id="envCsv" type="button">Export CSV</button></div>' +
      '<div class="rnote bsec">A screen of public databases, not a Phase I environmental site assessment: records can be mislocated or missing, and nothing here says whether a site is contaminated.<span class="src"> ' + esc(d.sources) + '</span></div>');
    card.querySelector('#envLayers').onclick = () => { setSitesOn(true); setRaster('rrc', true); ctx.fitGeom?.(geometry); };
    card.querySelector('#envPdf').onclick = exportPdf; card.querySelector('#envCsv').onclick = exportCsv;
    card.querySelectorAll('[data-retry]').forEach(b => b.onclick = async () => {
      const k = b.dataset.retry, mine = last; b.disabled = true; b.textContent = 'Retrying…';
      try { const r = await reportFor(mine.geometry, mine.label, { kinds: [k] }); if (last !== mine) return; if (k === 'soils') mine.d.soils = r.soils; else mine.d.kinds[k] = r.kinds[k]; draw(card); }
      catch (e) { b.disabled = false; b.textContent = 'Retry'; ctx.toast?.(friendly(e, 'Environmental data')); }
    });
  }
  ctx.envReport = report;
  async function exportCsv() {
    if (!last) return; const k = last.d.kinds, mine = last;
    // a large area lists only part of some sources in the report: fetch every record of those first
    const big = Object.entries(k).filter(([, s]) => s.listed != null && s.listed < s.count).map(([x]) => x), fullRows = {};
    if (big.length) { ctx.toast?.('Gathering all ' + fmt(big.reduce((n, x) => n + k[x].count, 0)) + ' records…');
      for (const x of big) { try { const all = []; for (let offset = 0; offset != null;) { const r = (await reportFor(mine.geometry, mine.label, { kinds: [x], full: true, offset })).kinds[x]; if (r?.error) throw new Error(r.error); all.push(...(r?.rows || [])); offset = r?.next ?? null; } fullRows[x] = all; } catch (e) { ctx.toast?.(KINDS[x].short + ': ' + friendly(e, 'Environmental data') + ' (the CSV lists the ones shown)'); } } }
    if (last !== mine) return;
    saveCsv(ctx, 'environmental', last.label, envCsvRows(last.d, fullRows), { geom: last.geometry });
  }
  function exportPdf() {
    if (!last) return; const { d, label, geometry } = last;
    return savePdf(ctx, 'environmental', label, reportHtml(d, label, geometry), { meta: { geom: geometry } });
  }

  // the Reports tab: the selected area, or draw one (it has its own row in the Map panel and button in the Site section)
  ctx.addAreaReport?.({ key: 'environmental', label: 'Environmental Report', noPanel: true, noSite: true, modes: ['selection', 'pick'],
    desc: 'A screen of public environmental databases for an area: cleanup and contamination sites, tanks, permitted facilities, oil and gas wells, pipelines, wetlands and soils, nearest first. PDF or CSV.',
    note: 'Select an area on the Map, or draw one', run: ({ geometry, label }) => report({ geometry, label }) });
  // entry point: the Map panel's "Reports for this area" row (shown while an area is selected)
  const run = () => { const s = ctx.sel; if (s?.feature) report({ geometry: s.feature.geometry || s.feature, label: s.label || 'Selected area' }); };
  const sb = document.getElementById('selEnv'), sync = () => { if (sb) sb.style.display = ctx.sel?.feature ? '' : 'none'; };
  if (sb) sb.onclick = run; ctx.onChange?.(sync); sync();
}
