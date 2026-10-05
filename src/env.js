// Environment (api/env: TCEQ, EPA, Railroad Commission, US Fish & Wildlife Service, USDA; all free):
//   Map layers: Environmental sites (contamination and cleanup sites, petroleum tanks or EPA-permitted facilities, as
//   clickable dots, plus areas where groundwater use is restricted), Oil & gas wells and pipelines, Wetlands, Soils.
//   Environmental Report for a site or area: every record within Phase I style search distances of the site's edge,
//   nearest first, wells and pipelines, wetlands and soils; opens in the card and exports as PDF or CSV.
import { KINDS, SETS } from './lib/env.mjs';
import { esc, fmt, kgrid, reportDoc, savePdf, saveCsv, openCard, cardTop, fillCard, areaMap } from './reportkit.js';

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
      const res = await fetch('api/env?box=' + key, { signal: ctl.signal }), d = await res.json().catch(() => ({})); if (!res.ok) throw new Error(d.error || 'unavailable');
      if (my !== seq) return; lastKey = key; setSites(d);
      const by = {}; for (const s of d.sites) by[s[0]] = (by[s[0]] || 0) + 1;
      say(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, n]) => fmt(n) + ' ' + KINDS[k].short.toLowerCase()).join(', ') + (d.areas?.length ? (Object.keys(by).length ? ', ' : '') + d.areas.length + ' groundwater restriction area' + (d.areas.length > 1 ? 's' : '') : '') + (d.sites.length || d.areas?.length ? ' in view.' : 'None in view.') + (d.errors ? ' Some sources did not answer.' : '') + ' Click a dot for details.');
    } catch (e) { if (e.name !== 'AbortError') say(e.message); }
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
    st.sites = !!v; save(); if (sbox) sbox.checked = st.sites; if (snote) snote.hidden = !st.sites; if (ssel) ssel.hidden = !st.sites;
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
  const reportFor = async (geometry, label) => { const r = await fetch('api/env', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ geometry, label }) }), d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Environmental report failed'); return d; };
  ctx.envReportData = reportFor;
  const ORDER = ['npl', 'superfund', 'ihwca', 'vcp', 'brownfield', 'epa_bf', 'drycleaner', 'lpst', 'landfill', 'msd', 'pst', 'rcra', 'tri', 'air', 'water'];
  const miTxt = v => v === 0 ? 'on site' : v < 0.1 ? Math.round(v * 5280) + ' ft' : v.toFixed(2) + ' mi';
  const where = r => [miTxt(r.mi), r.mi > 0 ? r.dir : ''].filter(Boolean).join(' ');
  const errNote = x => '<div class="rnote err">Unavailable right now (' + esc(x.error) + ').</div>';
  function headline(d) {
    const k = d.kinds, n = ks => ks.reduce((s, x) => s + (k[x]?.count || 0), 0), on = ks => ks.reduce((s, x) => s + (k[x]?.onsite || 0), 0);
    const cleanup = ['npl', 'superfund', 'ihwca', 'vcp', 'brownfield', 'epa_bf', 'drycleaner', 'lpst', 'landfill', 'msd'];
    return kgrid([[fmt(n(cleanup)), 'Cleanup & contamination records', n(cleanup) ? '#c92a2a' : ''], [fmt(on(cleanup)), 'Of them on the site'], [fmt(k.lpst?.count || 0), 'Leaking tanks within ½ mi'],
      [fmt(k.wells?.count || 0), 'Oil & gas wells within ¼ mi'], [fmt(k.pipelines?.count || 0), 'Pipelines within ¼ mi'], [k.wetlands?.onsite ? 'Yes' : k.wetlands?.count ? 'Nearby' : 'No', 'Mapped wetlands on site']]);
  }
  function body(d, { full = false } = {}) {
    const k = d.kinds, row = x => '<tr><td>' + esc(KINDS[x].label) + '</td><td class="mono">' + KINDS[x].mi + ' mi</td><td class="mono">' + (k[x]?.error ? '—' : fmt(k[x]?.count || 0)) + (k[x]?.truncated ? '+' : '') + '</td><td>' + (k[x]?.error ? 'unavailable' : k[x]?.nearest?.[0] ? esc(k[x].nearest[0].name) + ' · ' + esc(where(k[x].nearest[0])) : '—') + '</td></tr>';
    const list = (x, max) => { const s = k[x]; if (!s?.nearest?.length) return '';
      return '<div class="env-k"><div class="fl"><span class="pl-dot" style="background:' + KINDS[x].color + '"></span>' + esc(KINDS[x].label) + ' (' + fmt(s.count) + ')</div>' + s.nearest.slice(0, max).map(r => '<div class="pl"><b>' + (r.url ? '<a target="_blank" rel="noopener" href="' + esc(r.url) + '">' + esc(r.name) + '</a>' : esc(r.name)) + '</b><span>' + esc([r.addr, r.city].filter(Boolean).join(', ')) + (r.addr || r.city ? ' · ' : '') + esc(where(r)) + (r.tanks ? ' · ' + r.tanks + ' tank' + (r.tanks > 1 ? 's' : '') : '') + (r.id ? ' · ID ' + esc(r.id) : '') + '</span></div>').join('') + '</div>'; };
    const w = k.wells, o = k.orphan, p = k.pipelines, wt = k.wetlands, soils = d.soils;
    return '<div class="bsec">' + headline(d) + '</div>' +
      '<div class="bsec"><div class="lt">Records within the search distances</div><table class="mini env-t"><thead><tr><th>Database</th><th>Search</th><th>Found</th><th>Nearest</th></tr></thead><tbody>' + ORDER.map(row).join('') + '</tbody></table>' +
      '<div class="rnote">Distances are from the edge of the site. ' + (ORDER.some(x => k[x]?.truncated) ? 'A + means the source returned its maximum; there may be more. ' : '') + 'Search distances follow common Phase I practice.</div></div>' +
      '<div class="bsec"><div class="lt">Sites found</div>' + (ORDER.map(x => list(x, full ? 12 : 5)).join('') || '<div class="rnote">No cleanup, contamination, tank or permitted-facility records within the search distances.</div>') + '</div>' +
      '<div class="bsec"><div class="lt">Oil &amp; gas</div>' + (w?.error ? errNote(w) : '<div class="rnote">' + fmt(w?.count || 0) + ' well' + (w?.count === 1 ? '' : 's') + ' within ¼ mile' + (w?.by_type?.length ? ': ' + esc(w.by_type.map(t => t.n + ' ' + t.type.toLowerCase()).join(', ')) : '') + (w?.nearest?.[0] ? '. Nearest ' + esc(where(w.nearest[0])) + (w.nearest[0].id ? ' (API ' + esc(w.nearest[0].id) + ')' : '') : '') + '.' +
        (o?.count ? ' <b>' + fmt(o.count) + ' orphan well' + (o.count > 1 ? 's' : '') + '</b> (abandoned with no responsible operator) within ½ mile, nearest ' + esc(where(o.nearest[0])) + '.' : '') + '</div>') +
        (p?.error ? errNote(p) : p?.nearest?.length ? p.nearest.map(r => '<div class="pl"><b>' + esc(r.name) + '</b><span>' + esc([r.commodity, r.diameter ? r.diameter + '" pipe' : '', r.status, r.interstate === 'Y' ? 'interstate' : ''].filter(Boolean).join(' · ')) + ' · ' + esc(where(r)) + '</span></div>').join('') : '<div class="rnote">No pipelines mapped within ¼ mile.</div>') + '</div>' +
      '<div class="bsec"><div class="lt">Wetlands</div>' + (wt?.error ? errNote(wt) : wt?.count ? wt.nearest.map(r => '<div class="pl"><b>' + esc(r.name) + '</b><span>' + esc([r.code, r.acres ? fmt(r.acres) + ' acres' : '', where(r)].filter(Boolean).join(' · ')) + '</span></div>').join('') + '<div class="rnote">US Fish &amp; Wildlife Service National Wetlands Inventory. Building in a wetland can need a federal (Section 404) permit; a delineation decides.</div>' : '<div class="rnote">No mapped wetlands on or within 500 ft of the site.</div>') + '</div>' +
      '<div class="bsec"><div class="lt">Soils</div>' + (soils?.error ? errNote(soils) : soils?.skipped ? '<div class="rnote">' + esc(soils.skipped) + '</div>' : soils?.length ? '<table class="mini env-t"><thead><tr><th>Soil</th><th>Drainage</th><th>Flooding</th><th>Small commercial buildings</th></tr></thead><tbody>' +
        soils.map(s => '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.drainage || '—') + '</td><td>' + esc(s.flooding || '—') + '</td><td>' + esc(s.small_commercial || '—') + '</td></tr>').join('') + '</tbody></table><div class="rnote">USDA soil survey ratings for building without engineering. "Very limited" usually means shrink-swell clay, a high water table or flooding; plan a geotechnical study.</div>' : '<div class="rnote">No soil survey data here.</div>') + '</div>';
  }
  let last = null;
  async function report({ geometry, label }) {
    if (ctx.view !== 'map') ctx.setView?.('map');
    const card = openCard(ctx, { kicker: 'Environmental report', title: label, loading: 'Searching state and federal environmental records…' });
    let d; try { d = await reportFor(geometry, label); } catch (e) { card.querySelector('.bsec').innerHTML = '<div class="rnote err">' + esc(e.message) + '</div>'; return { error: e.message }; }
    last = { d, label, geometry };
    fillCard(ctx, card, cardTop('Environmental report', label, (d.area_sqmi < 1 ? Math.round(d.area_sqmi * 640) + ' acres' : d.area_sqmi.toFixed(2) + ' sq mi') + ' searched, plus the distances below') + body(d) +
      '<div class="bacts"><button class="btn" id="envLayers" type="button">Show on Map</button><button class="btn primary" id="envPdf" type="button">Export PDF</button><button class="btn" id="envCsv" type="button">Export CSV</button></div>' +
      '<div class="rnote bsec">A screen of public databases, not a Phase I environmental site assessment: records can be mislocated or missing, and nothing here says whether a site is contaminated.<span class="src"> ' + esc(d.sources) + '</span></div>');
    card.querySelector('#envLayers').onclick = () => { setSitesOn(true); setRaster('rrc', true); ctx.fitGeom?.(geometry); };
    card.querySelector('#envPdf').onclick = exportPdf; card.querySelector('#envCsv').onclick = exportCsv;
    return d;
  }
  ctx.envReport = report;
  function exportCsv() {
    if (!last) return; const rows = [], k = last.d.kinds;
    for (const [x, s] of Object.entries(k)) for (const r of s.nearest || []) rows.push({ Database: KINDS[x].label, 'Search (mi)': KINDS[x].mi, Name: r.name, Address: [r.addr, r.city].filter(Boolean).join(', '), 'Distance (mi)': r.mi, Direction: r.dir || '', ID: r.id || r.code || '', Detail: [r.commodity, r.diameter && r.diameter + ' in', r.status, r.tanks && r.tanks + ' tanks', r.acres && r.acres + ' acres', r.type].filter(Boolean).join('; '), Link: r.url || '' });
    for (const s of Array.isArray(last.d.soils) ? last.d.soils : []) rows.push({ Database: 'Soils (USDA)', 'Search (mi)': 0, Name: s.name, Address: '', 'Distance (mi)': 0, Direction: '', ID: '', Detail: [s.drainage, 'flooding: ' + s.flooding, 'small commercial: ' + s.small_commercial].join('; '), Link: '' });
    saveCsv(ctx, 'environmental', last.label, rows);
  }
  function exportPdf() {
    if (!last) return; const { d, label, geometry } = last;
    // the site on a street map (the screen covers the area plus each database's search distance around it)
    const map = geometry ? '<div class="map">' + areaMap([{ geometry, stroke: '#b45309', fill: 'rgba(180,83,9,.08)', dash: true }], { fit: geometry, W: 1000, H: 360, minSpanM: 1500 }) + '</div>' : '';
    const css = '.kgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.kgrid div{border:1px solid #e8ebeb;border-radius:6px;padding:8px}.kgrid b{display:block;font-size:16px}.kgrid span{font-size:9.5px;color:#6b7174}' +
      '.pl{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e8ebeb;padding:4px 0;break-inside:avoid}.pl span{color:#6b7174;font-size:9px;text-align:right}.fl{font-weight:700;margin:10px 0 2px}.pl-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px}' +
      'table.mini{width:100%;border-collapse:collapse;font-size:9.5px}table.mini th,table.mini td{border-bottom:1px solid #e8ebeb;padding:4px 6px;text-align:left;vertical-align:top}.mono{font-family:"IBM Plex Mono",monospace}.err{color:#b42318}.bacts{display:none}';
    const html = reportDoc({ kicker: 'Environmental screening report', title: label, meta: (d.area_sqmi < 1 ? Math.round(d.area_sqmi * 640) + ' acres' : d.area_sqmi.toFixed(2) + ' sq mi') + ' · ' + d.center[1] + ', ' + d.center[0], css,
      sources: esc(d.sources) + ' A screen of public databases, not a Phase I environmental site assessment (ASTM E1527-21): records can be mislocated or missing, and nothing here says whether a site is contaminated.', body: map + body(d, { full: true }) });
    return savePdf(ctx, 'environmental', label, html);
  }

  // entry points: the selection bar and the strip under Area at a Glance
  const run = () => { const s = ctx.sel; if (s?.feature) report({ geometry: s.feature.geometry || s.feature, label: s.label || 'Selected area' }); };
  const strip = document.querySelector('.crsel');
  if (strip && !strip.querySelector('.env-go')) { const b = document.createElement('button'); b.className = 'btn env-go'; b.type = 'button'; b.textContent = 'Environmental Report'; b.onclick = run; strip.querySelector('button')?.before(b); }
  const sb = document.getElementById('selEnv'), sync = () => { if (sb) sb.style.display = ctx.sel?.feature ? '' : 'none'; };
  if (sb) sb.onclick = run; ctx.onChange?.(sync); sync();
}
