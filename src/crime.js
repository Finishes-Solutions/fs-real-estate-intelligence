// Crime (Houston Police NIBRS incidents, via api/crime):
//   Map layer "Crime (Houston)": a heat map zoomed out, ~400 m squares zoomed in, for all / violent / property incidents in the last 12 months.
//   Crime report for any area: the current selection (box, polygon, county or radius), a building (0.5 mile) or a map square.
//   The report opens in the card (totals vs the year before and vs the city, monthly bars, top offenses and places,
//   recent incidents), can put the incidents on the map, and exports as a PDF report or CSV.
import { offenseName, CAT_NAME } from './lib/nibrs.mjs';
import { tractsFor, summarizeTracts } from './lib/demographics.mjs';
import { reportDoc, savePdf, saveCsv, fileBase, areaSvg, getJSON, errorBox, layerFailed, layerOK, inHouston, viewLabel, friendly } from './reportkit.js';
import { reveal } from './motion.js';
import { crimeReport, crimeCsvRows, COL } from './lib/reports/crime.mjs';

const SRC = 'crime', HEAT = 'crime-heat', CELLS = 'crime-cells', PTS = 'crime-pts';

export function initCrime(ctx) {
  const { map, esc, fmtN } = ctx, box = document.getElementById('lyCrime'), catSel = document.getElementById('lyCrimeCat'), note = document.getElementById('lyCrimeNote');
  let on = false, cat = 't', grid = null, gridP = null, shown = null, last = null;
  // the crime type lives with the Filters (src/layerfilters.js, fs-lf); fs-crime-cat is the old key, read until it's migrated
  try { cat = localStorage.getItem('fs-crime-cat') || JSON.parse(localStorage.getItem('fs-lf') || 'null')?.crime || 't'; } catch (e) {}
  if (catSel) catSel.value = cat;

  // the map tooltip (#tip): text at a map point, or hidden
  const tip = (pt, text) => { const t = ctx.tip; if (!t) return; if (!pt) { t.style.opacity = 0; return; } t.textContent = text; t.style.opacity = 1; const w = t.offsetWidth, vw = ctx.viewport?.clientWidth || innerWidth; let x = pt.x + 14; if (x + w > vw - 8) x = pt.x - w - 14; t.style.left = x + 'px'; t.style.top = (pt.y + 14) + 'px'; };
  const loadGrid = () => gridP ||= getJSON('api/crime?grid=1', { what: 'Crime data' }).then(d => grid = d).catch(e => { gridP = null; throw e; });
  const valueOf = c => cat === 'v' ? c[2] : cat === 'p' ? c[3] : c[2] + c[3] + c[4];
  function features() {
    const h = grid.cell / 2, pts = [], sq = [];
    for (const c of grid.cells) {
      const n = valueOf(c); if (!n) continue; const props = { n, v: c[2], p: c[3], o: c[4] };
      pts.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [c[0], c[1]] } });
      sq.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [[[c[0] - h, c[1] - h], [c[0] + h, c[1] - h], [c[0] + h, c[1] + h], [c[0] - h, c[1] + h], [c[0] - h, c[1] - h]]] } });
    }
    return { pts: { type: 'FeatureCollection', features: pts }, sq: { type: 'FeatureCollection', features: sq } };
  }
  // color stops from the data itself (median → 99th percentile), so the scale works for violent-only as well as all incidents
  function stops() {
    const vals = grid.cells.map(valueOf).filter(Boolean).sort((a, b) => a - b), q = p => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] || 1;
    const s = [q(.5), q(.75), q(.9), q(.97), q(.995)]; for (let i = 1; i < s.length; i++) if (s[i] <= s[i - 1]) s[i] = s[i - 1] + 1;
    return s;
  }
  function addLayers() {
    if (!on || !grid || !map.getStyle()) return;
    const f = features(), s = stops();
    if (map.getSource(SRC)) map.getSource(SRC).setData(f.pts); else map.addSource(SRC, { type: 'geojson', data: f.pts });
    if (map.getSource(SRC + '-sq')) map.getSource(SRC + '-sq').setData(f.sq); else map.addSource(SRC + '-sq', { type: 'geojson', data: f.sq });
    const ramp = ['interpolate', ['linear'], ['get', 'n'], s[0], '#fde68a', s[1], '#f59e0b', s[2], '#ea580c', s[3], '#c2410c', s[4], '#7f1d1d'];
    const before = map.getLayer('filings') ? 'filings' : undefined;
    if (!map.getLayer(HEAT)) map.addLayer({ id: HEAT, type: 'heatmap', source: SRC, maxzoom: 13.5, paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'n'], 0, 0, s[4], 1], 'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, .6, 13, 1.4],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 6, 11, 14, 13, 26], 'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 12, .75, 13.5, 0],
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(253,230,138,0)', .2, 'rgba(253,230,138,.55)', .45, '#f59e0b', .7, '#ea580c', .9, '#c2410c', 1, '#7f1d1d'] } }, before);
    else map.setPaintProperty(HEAT, 'heatmap-weight', ['interpolate', ['linear'], ['get', 'n'], 0, 0, s[4], 1]);
    if (!map.getLayer(CELLS)) map.addLayer({ id: CELLS, type: 'fill', source: SRC + '-sq', minzoom: 12, paint: { 'fill-color': ramp, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 13, .5, 16, .35], 'fill-outline-color': 'rgba(255,255,255,.35)' } }, before);
    else map.setPaintProperty(CELLS, 'fill-color', ramp);
    if (note) note.textContent = 'Houston Police incidents in the 12 months through ' + monthName(grid.latest || last) + ', per ~0.25-mile square. City of Houston only. Click a square for its numbers.';
  }
  function removeLayers() { for (const id of [HEAT, CELLS]) if (map.getLayer(id)) map.removeLayer(id); for (const s of [SRC, SRC + '-sq']) if (map.getSource(s)) map.removeSource(s); }
  const monthName = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'the latest month';

  const crimeLegend = () => ctx.setLegend?.('crime', on ? '<div class="t">Crime · ' + ({ t: 'all incidents', v: 'violent', p: 'property' }[cat] || 'incidents') + '</div><div class="lg-grad" style="background:linear-gradient(90deg,#fde68a,#f59e0b,#ea580c,#c2410c,#7f1d1d)"></div><div class="lg-ticks"><span>Fewer</span><span>More</span></div><div class="lg-note">Last 12 months · City of Houston</div>' : null);
  async function setOn(v) {
    on = v; if (box) box.checked = v; if (catSel) catSel.hidden = !v; if (note) note.hidden = !v; if (v) layerOK(note);
    crimeLegend();
    if (!v) { removeLayers(); return; }
    try { await loadGrid(); addLayers(); if (map.getZoom() < 9) map.easeTo({ center: [-95.37, 29.76], zoom: 10, duration: ctx.reduceMotion ? 0 : 800 }); }
    catch (e) { setOn(false); layerFailed(ctx, e, { what: 'Crime data', note }); }
  }
  if (box) box.onchange = () => setOn(box.checked);
  // the picker here and the one in Filters share one value: setCrimeCat saves it, updates both and comes back to applyCrimeCat
  function applyCat(v) { if (!['t', 'v', 'p'].includes(v) || v === cat) return; cat = v; if (catSel && catSel.value !== v) catSel.value = v; if (on && grid) { removeLayers(); addLayers(); } crimeLegend(); }
  ctx.applyCrimeCat = applyCat;
  if (catSel) catSel.onchange = () => { if (ctx.setCrimeCat) ctx.setCrimeCat(catSel.value); else applyCat(catSel.value); };
  ctx.onOverlays(addLayers);
  ctx.crimeLayer = v => setOn(v !== false);

  // hover / click a square
  map.on('mousemove', CELLS, e => { const f = e.features?.[0]; if (!f) return; map.getCanvas().style.cursor = 'var(--cur-pointer)'; const p = f.properties; tip(e.point, fmtN(p.v + p.p + p.o) + ' incidents in 12 months · ' + fmtN(p.v) + ' violent · ' + fmtN(p.p) + ' property'); });
  map.on('mouseleave', CELLS, () => { map.getCanvas().style.cursor = ''; tip(null); });
  ctx.mapClickHandlers.unshift(e => {
    if (!on || !map.getLayer(CELLS) || map.getZoom() < 12) return false;
    const f = map.queryRenderedFeatures(e.point, { layers: [CELLS] })[0]; if (!f) return false;
    const ring = f.geometry.coordinates[0], c = [(ring[0][0] + ring[2][0]) / 2, (ring[0][1] + ring[2][1]) / 2];
    report({ geometry: f.geometry, label: '0.25-mile square near ' + c[1].toFixed(4) + ', ' + c[0].toFixed(4), center: c });
    return true;
  });

  // ---------- area report ----------
  const { pct, monthBars, catBars, hourList, dowList, whenLine, yearRows, rateLine, reportHtml } = crimeReport({ esc, fmtN, areaSvg, reportDoc });
  const reportFor = (geometry, list = 2000) => getJSON('api/crime', { what: 'Crime data', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ geometry, list }) });
  ctx.crimeReportData = reportFor;
  // incidents per 1,000 residents (census tracts whose middle is inside the area); needs the Market data
  async function perResidents(geometry, d) {
    try { const m = await ctx.loadMarket?.(); if (!m?.tracts) return null; const x = summarizeTracts(tractsFor(m.tracts, { geom: geometry }));
      if (!x?.population || x.population < 500) return null; return { pop: x.population, rate: Math.round(d.last12.total / x.population * 10000) / 10, v: Math.round(d.last12.v / x.population * 10000) / 10 }; }
    catch (e) { return null; }
  }
  async function report({ geometry, label, center }) {
    const card = ctx.card || document.getElementById('card');
    ctx.closeCard?.(); card.innerHTML = '<div class="top"><div><div class="kicker">Crime report</div><h2>' + esc(label) + '</h2></div><button class="x" aria-label="Close">×</button></div><div class="bsec"><div class="rnote loading">Counting incidents…</div></div>';
    card.classList.add('open'); card.querySelector('.x').onclick = () => ctx.closeCard();
    showArea(geometry);
    let d; try { d = await reportFor(geometry); } catch (e) { card.querySelector('.bsec').replaceChildren(errorBox(e, () => report({ geometry, label, center }), 'Crime data')); return; }
    last = { d, label, geometry, center }; if (!d.latest) { card.querySelector('.bsec').innerHTML = '<div class="rnote">No crime data loaded yet.</div>'; return; }
    const L = d.last12, P = d.prior12;
    card.innerHTML = '<div class="top"><div><div class="kicker">Crime report</div><h2>' + esc(label) + '</h2><div class="bsub">12 months through ' + esc(monthName(d.latest)) + (d.area_sqmi ? ' · ' + (d.area_sqmi < 10 ? d.area_sqmi.toFixed(2) : fmtN(d.area_sqmi)) + ' sq mi' : '') + '</div></div><button class="x" aria-label="Close">×</button></div>' +
      '<div class="bsec"><div class="kgrid"><div><b>' + fmtN(L.total) + '</b><span>Incidents · ' + pct(d.change.total) + '</span></div><div><b class="cr-v">' + fmtN(L.v) + '</b><span>Violent · ' + pct(d.change.v) + '</span></div>' +
      '<div><b class="cr-p">' + fmtN(L.p) + '</b><span>Property · ' + pct(d.change.p) + '</span></div><div><b>' + fmtN(L.o) + '</b><span>Other · ' + pct(d.change.o) + '</span></div></div>' +
      '<div class="rnote">Change is vs the 12 months before (' + fmtN(P.total) + ' incidents). ' + esc(rateLine(d)) + '</div></div>' +
      '<div class="bsec"><div class="lt">Per month (24 months)</div>' + monthBars(d.months) + '<div class="cr-leg"><span><i style="background:' + COL.v + '"></i>Violent</span><span><i style="background:' + COL.p + '"></i>Property</span><span><i style="background:' + COL.o + ';opacity:.55"></i>Other</span></div></div>' +
      '<div class="bsec"><div class="lt">When it happens (last 12 months)</div>' + (d.hours?.length ? '<div class="fl">By hour of day</div>' + catBars(hourList(d), 'Incidents by hour of day') : '<div class="rnote">Hour of day appears after the next nightly data refresh.</div>') +
        '<div class="fl">By day of week</div>' + catBars(dowList(d), 'Incidents by day of week') + '<div class="rnote">' + esc(whenLine(d)) + '</div></div>' +
      (yearRows(d).length > 1 ? '<div class="bsec"><div class="lt">Year by year</div><dl>' + yearRows(d).map(y => '<dt>' + y.y + (y.partial ? '*' : '') + '</dt><dd class="mono">' + fmtN(y.total) + (y.partial ? ' <span class="sc">(' + fmtN(y.pace) + ' a year pace)</span>' : '') + (y.change != null ? ' <span class="sc">' + pct(y.change) + (y.city_change != null ? ' vs Houston ' + pct(y.city_change) : '') + '</span>' : '') + '</dd>').join('') + '</dl><div class="rnote">* Partial year; change compares yearly pace. History kept: ' + esc((d.years[0]?.from || '') + ' to ' + (d.latest || '')) + '.</div></div>' : '') +
      '<div class="bsec" id="crRes"></div>' +
      '<div class="bsec"><div class="lt">Top offenses</div><dl>' + d.offenses.slice(0, 10).map(o => '<dt>' + esc(o.name) + '</dt><dd class="mono">' + fmtN(o.n) + ' <span class="sc">' + esc(CAT_NAME[o.cat] || '') + '</span></dd>').join('') + '</dl></div>' +
      '<div class="bsec"><div class="lt">Where they happened</div><dl>' + d.premises.slice(0, 8).map(p => '<dt>' + esc(p.premise) + '</dt><dd class="mono">' + fmtN(p.n) + '</dd>').join('') + '</dl></div>' +
      '<div class="bacts"><button class="btn" id="crPts" type="button">Show Incidents on Map</button><button class="btn primary" id="crPdf" type="button">Export PDF</button><button class="btn" id="crCsv" type="button">Export CSV</button></div>' +
      '<div class="bsec"><div class="lt">Most recent incidents</div>' + (d.incidents || []).slice(0, 15).map(x => '<div class="pl"><b>' + esc(x.offense) + '</b><span>' + esc(x.day + (x.premise ? ' · ' + x.premise : '')) + '</span></div>').join('') +
      ((d.incidents || []).length >= 2000 ? '<div class="rnote">The map shows the newest 2,000 incidents and Export CSV the newest 20,000; the totals above count all of them.</div>' : '') + (d.incidents_note ? '<div class="rnote">' + esc(d.incidents_note) + '</div>' : '') + '</div>' +
      '<div class="rnote bsec">Offenses as reported by Houston Police (NIBRS). Counts follow where people are, so busy commercial areas show more than homes nearby; compare with similar places.<span class="src"> ' + esc(d.coverage) + '</span></div>';
    card.classList.add('open'); card.querySelector('.x').onclick = () => ctx.closeCard();
    reveal(card, 'card:crime|' + label); // its charts draw in once per report (src/motion.js)
    card.querySelector('#crPts').onclick = () => showPoints(d.incidents || []);
    perResidents(geometry, d).then(r => { const el = card.querySelector('#crRes'); if (!el || last?.d !== d) return; last.res = r;
      el.innerHTML = r ? '<div class="lt">Per resident</div><div><b>' + r.rate + '</b> incidents per 1,000 residents a year (' + r.v + ' violent), ' + fmtN(r.pop) + ' people living here.</div><div class="rnote">Busy commercial areas with few residents read high: people who work and shop here count too.</div>' : ''; if (!r) el.remove(); });
    card.querySelector('#crCsv').onclick = () => exportCsv();
    card.querySelector('#crPdf').onclick = () => exportReport();
  }
  ctx.crimeReport = report;
  ctx.onCardClose(() => { showArea(null); showPoints(null); });

  function showArea(g) { try { drawArea(g); } catch (e) { /* map style still loading: the outline is optional */ } }
  function drawArea(g) {
    const s = map.getSource('crime-area'), data = { type: 'FeatureCollection', features: g ? [{ type: 'Feature', properties: {}, geometry: g }] : [] };
    if (s) { s.setData(data); return; } if (!g) return;
    map.addSource('crime-area', { type: 'geojson', data }); map.addLayer({ id: 'crime-area', type: 'line', source: 'crime-area', paint: { 'line-color': '#c2410c', 'line-width': 2, 'line-dasharray': [2, 1.5] } });
  }
  // hover handlers once (they ignore the layer while it isn't on the map); adding them with the layer stacked a new pair every time
  map.on('mousemove', PTS, e => { const f = e.features?.[0]; if (f) tip(e.point, f.properties.t); }); map.on('mouseleave', PTS, () => tip(null));
  function showPoints(list) { try { drawPoints(list); } catch (e) { ctx.toast?.('The map is still loading; try again in a moment.'); } }
  function drawPoints(list) {
    shown = list; const data = { type: 'FeatureCollection', features: (list || []).map(x => ({ type: 'Feature', properties: { c: x.cat, t: x.offense + ' · ' + x.day + (x.premise ? ' · ' + x.premise : '') }, geometry: { type: 'Point', coordinates: [x.lon, x.lat] } })) };
    const s = map.getSource(PTS); if (s) s.setData(data);
    else if (list) { map.addSource(PTS, { type: 'geojson', data }); map.addLayer({ id: PTS, type: 'circle', source: PTS, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 16, 6], 'circle-color': ['match', ['get', 'c'], 'v', COL.v, 'p', COL.p, COL.o], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1, 'circle-opacity': .9 } }); }
    if (list?.length && last?.geometry) ctx.fitGeom?.(last.geometry);
  }
  ctx.onOverlays(() => { if (shown) { const s = shown; shown = null; if (map.getSource(PTS)) { map.removeLayer(PTS); map.removeSource(PTS); } showPoints(s); } if (last && map.getSource('crime-area') == null && document.getElementById('card')?.classList.contains('open')) showArea(last.geometry); });

  async function exportCsv() {
    if (!last?.d?.incidents) return;
    // the report carries the newest 2,000; the CSV asks for up to 20,000
    let list = last.d.incidents; const mine = last;
    if (list.length >= 2000 && (mine.d.last12?.total || 0) > list.length) { ctx.toast?.('Gathering up to 20,000 incidents…');
      try { const d = await reportFor(mine.geometry, 20000); if (d.incidents?.length > list.length) list = mine.d.incidents_all = d.incidents; } catch (e) { ctx.toast?.('Only the newest 2,000: ' + friendly(e, 'Crime data')); } }
    if (last !== mine) return;
    if (list.length >= 20000) ctx.toast?.('The CSV has the newest 20,000 incidents; the report counts all of them.');
    ctx.exportMeta = { report: 'crime', format: 'csv', scope: last.label, filings: list.length, unit: 'incidents', geom: last.geometry };
    try { ctx.exportCsv(crimeCsvRows(list), fileBase('crime', last.label)); }
    finally { ctx.exportMeta = null; }
  }
  async function exportReport() {
    if (!last?.d) return; const { d, label, geometry } = last;
    const list = d.incidents || [];
    await savePdf(ctx, 'crime', label, reportHtml(d, label, geometry, last.res), { meta: { filings: list.length, unit: 'incidents', geom: geometry } });
  }

  // property cards: "Crime" pill → incidents within 1 mile (last 12 months vs the year before), with the full report a click away.
  // HPD data covers the City of Houston only, so elsewhere the section says so instead of showing zeros: the box first,
  // then the city limits (api/crime answers outside: true for a Katy or Sugar Land point; partial: true just outside the limits).
  const circleMi = ([lon, lat], mi) => { const r = mi / 69, k = Math.cos(lat * Math.PI / 180), ring = []; for (let i = 0; i <= 64; i++) { const a = (i % 64) / 64 * 2 * Math.PI; ring.push([lon + r * Math.cos(a) / k, lat + r * Math.sin(a)]); } return { type: 'Polygon', coordinates: [ring] }; };
  ctx.renderCrimeNear = async (el, center, label = () => 'this property', still = () => true) => {
    if (!el) return;
    const head = '<div class="lt">Crime within 1 mile</div>';
    const only = where => head + '<div class="rnote">Street-level incidents cover the City of Houston only' + (where ? '; this property is ' + esc(where) : '') + '. The local police department’s yearly figures are below, under Crime by city / county.</div>';
    if (!inHouston(center)) { el.innerHTML = only(); return; }
    el.innerHTML = head + '<div class="rnote loading">Counting reported incidents…</div>';
    const near = () => ctx.renderCrimeNear(el, center, label, still);
    let d; try { d = await getJSON('api/crime?lat=' + center[1].toFixed(5) + '&lon=' + center[0].toFixed(5) + '&mi=1&list=8', { what: 'Crime data' }); }
    catch (e) { if (still()) { el.innerHTML = head; el.append(errorBox(e, near, 'Crime data')); } return; }
    if (!still()) return;
    if (d.outside) { el.innerHTML = only(d.place ? 'in ' + d.place.name : 'outside any city’s limits'); return; }
    if (!d.latest) { el.innerHTML = head + '<div class="rnote">No crime data loaded yet.</div>'; return; }
    const L = d.last12;
    el.innerHTML = head + '<div class="kgrid"><div><b>' + fmtN(L.total) + '</b><span>Incidents · ' + pct(d.change.total) + '</span></div><div><b class="cr-v">' + fmtN(L.v) + '</b><span>Violent · ' + pct(d.change.v) + '</span></div>' +
      '<div><b class="cr-p">' + fmtN(L.p) + '</b><span>Property · ' + pct(d.change.p) + '</span></div><div><b>' + (d.per_sqmi && d.city_per_sqmi && !d.partial ? (d.per_sqmi.total / d.city_per_sqmi.total).toFixed(1) + '×' : '—') + '</b><span>vs Houston average</span></div></div>' +
      (d.offenses?.length ? '<dl>' + d.offenses.slice(0, 5).map(o => '<dt>' + esc(o.name) + '</dt><dd>' + fmtN(o.n) + '</dd>').join('') + '</dl>' : '') +
      (d.partial ? '<div class="rnote">This property is just outside Houston’s city limits' + (d.place ? ', in ' + esc(d.place.name) : '') + ': only the incidents inside the city are counted. The local police department’s yearly figures are below, under Crime by city / county.</div>' : '') +
      (d.incidents?.length ? '<div class="rnote"><b>Most recent:</b> ' + d.incidents.slice(0, 4).map(x => esc(x.offense + ' (' + x.day + ')')).join(' · ') + '</div>' : '') +
      '<div class="bacts"><button class="btn" type="button" data-push data-cr="report">Full crime report</button><button class="btn" type="button" data-cr="layer">Crime map layer</button></div>' +
      '<div class="ssrc src">Reported incidents, 12 months through ' + esc(monthName(d.latest)) + ' (change vs the 12 months before). Houston Police (NIBRS); the file runs about three months behind. City of Houston only.</div>';
    el.querySelector('[data-cr="report"]').onclick = () => report({ geometry: circleMi(center, 1), label: '1 mile around ' + label(), center });
    el.querySelector('[data-cr="layer"]').onclick = () => setOn(true);
  };
  // the Reports tab offers the crime report (for the selection or the map view); exports are recorded there
  ctx.crimeReportFor = which => {
    // street-level data covers the City of Houston only: say so rather than open a report of zeros
    if (!inHouston(which === 'selection' ? ctx.areaCenter() : [map.getCenter().lng, map.getCenter().lat])) { ctx.toast?.('Street-level crime data covers the City of Houston only. Try City / County Crime Report.'); return false; }
    if (which === 'selection') { const s = ctx.sel; if (!s?.feature) return false; report({ geometry: s.feature.geometry || s.feature, label: s.label || 'Selected area' }); return true; }
    const b = map.getBounds(), w = b.getWest(), s = b.getSouth(), e = b.getEast(), n = b.getNorth();
    report({ geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] }, label: viewLabel(ctx) }); return true;
  };
  // the Map panel's "Reports for this area" row: the selection (or the map view) when its middle is in Houston, else greyed out
  const row = document.getElementById('selCrime');
  if (row) {
    const sync = () => { let ok = false; try { ok = inHouston(ctx.areaCenter()); } catch (e) {}
      row.hidden = false; row.disabled = !ok; row.setAttribute('aria-disabled', String(!ok));
      row.querySelector('.ar-d').textContent = !ok ? 'Houston only' : ctx.sel?.feature ? 'Last 12 months' : 'Run on map view';
      row.title = ok ? 'Houston Police incidents: the last 12 months against the year before' : 'Street-level crime data covers the City of Houston only. Move the map to Houston or pick an area there.'; };
    row.onclick = () => { if (!row.disabled) ctx.crimeReportFor(ctx.sel?.feature ? 'selection' : 'view'); };
    ctx.onChange?.(sync); map.on('moveend', sync); sync();
  }
}
