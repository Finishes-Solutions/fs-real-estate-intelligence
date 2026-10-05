// Crime (Houston Police NIBRS incidents, via api/crime):
//   Map layer "Crime (Houston)": a heat map zoomed out, ~400 m squares zoomed in, for all / violent / property incidents in the last 12 months.
//   Crime report for any area: the current selection (box, polygon, county or radius), a building (0.5 mile) or a map square.
//   The report opens in the card (totals vs the year before and vs the city, monthly bars, top offenses and places,
//   recent incidents), can put the incidents on the map, and exports as a PDF report or CSV.
import { offenseName, CAT_NAME } from './lib/nibrs.mjs';
import { tractsFor, summarizeTracts } from './lib/demographics.mjs';
import { reportDoc, savePdf, areaSvg } from './reportkit.js';

const SRC = 'crime', HEAT = 'crime-heat', CELLS = 'crime-cells', PTS = 'crime-pts';
const COL = { v: '#c03b3a', p: '#d9822b', o: '#8a9396' };

export function initCrime(ctx) {
  const { map, esc, fmtN } = ctx, box = document.getElementById('lyCrime'), catSel = document.getElementById('lyCrimeCat'), note = document.getElementById('lyCrimeNote');
  let on = false, cat = 't', grid = null, gridP = null, shown = null, last = null;
  try { cat = localStorage.getItem('fs-crime-cat') || 't'; } catch (e) {}
  if (catSel) catSel.value = cat;

  // the map tooltip (#tip): text at a map point, or hidden
  const tip = (pt, text) => { const t = ctx.tip; if (!t) return; if (!pt) { t.style.opacity = 0; return; } t.textContent = text; t.style.opacity = 1; const w = t.offsetWidth, vw = ctx.viewport?.clientWidth || innerWidth; let x = pt.x + 14; if (x + w > vw - 8) x = pt.x - w - 14; t.style.left = x + 'px'; t.style.top = (pt.y + 14) + 'px'; };
  const loadGrid = () => gridP ||= fetch('api/crime?grid=1').then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'crime data unavailable'); return grid = d; }).catch(e => { gridP = null; throw e; });
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
    on = v; if (box) box.checked = v; if (catSel) catSel.hidden = !v; if (note) note.hidden = !v;
    crimeLegend();
    if (!v) { removeLayers(); return; }
    try { await loadGrid(); addLayers(); if (map.getZoom() < 9) map.easeTo({ center: [-95.37, 29.76], zoom: 10, duration: ctx.reduceMotion ? 0 : 800 }); }
    catch (e) { ctx.toast('Crime layer unavailable: ' + e.message); setOn(false); }
  }
  if (box) box.onchange = () => setOn(box.checked);
  if (catSel) catSel.onchange = () => { cat = catSel.value; try { localStorage.setItem('fs-crime-cat', cat); } catch (e) {} if (on && grid) { removeLayers(); addLayers(); } crimeLegend(); };
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
  const pct = v => v == null ? '—' : (v > 0 ? '+' : '') + v + '%';
  const reportFor = async (geometry, list = 2000) => {
    const r = await fetch('api/crime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ geometry, list }) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error || 'crime report failed'); return d;
  };
  ctx.crimeReportData = reportFor;
  function monthBars(months) {
    if (!months?.length) return '';
    const W = 320, H = 90, max = Math.max(1, ...months.map(m => m.v + m.p + m.o)), bw = W / months.length;
    return '<svg class="cr-bars" viewBox="0 0 ' + W + ' ' + (H + 14) + '" role="img" aria-label="Incidents per month">' + months.map((m, i) => {
      const x = i * bw + 1, w = Math.max(1, bw - 2), hv = m.v / max * H, hp = m.p / max * H, ho = m.o / max * H;
      return '<g><title>' + esc(m.m + ': ' + (m.v + m.p + m.o) + ' incidents (' + m.v + ' violent, ' + m.p + ' property, ' + m.o + ' other)') + '</title>' +
        '<rect x="' + x.toFixed(1) + '" y="' + (H - hv).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + hv.toFixed(1) + '" fill="' + COL.v + '"/>' +
        '<rect x="' + x.toFixed(1) + '" y="' + (H - hv - hp).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + hp.toFixed(1) + '" fill="' + COL.p + '"/>' +
        '<rect x="' + x.toFixed(1) + '" y="' + (H - hv - hp - ho).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + ho.toFixed(1) + '" fill="' + COL.o + '" fill-opacity=".55"/>' +
        (m.m.endsWith('-01') || i === 0 ? '<text x="' + x.toFixed(1) + '" y="' + (H + 11) + '" font-size="8.5" fill="currentColor" opacity=".6">' + m.m.slice(0, 4) + '</text>' : '') + '</g>';
    }).join('') + '</svg>';
  }
  // stacked violent / property / other bars for any list: [{ label, v, p, o }]
  function catBars(list, aria) {
    if (!list?.length || !list.some(x => x.v + x.p + x.o)) return '';
    const W = 320, H = 70, max = Math.max(1, ...list.map(m => m.v + m.p + m.o)), bw = W / list.length, every = list.length > 12 ? 3 : 1;
    return '<svg class="cr-bars" viewBox="0 0 ' + W + ' ' + (H + 14) + '" role="img" aria-label="' + esc(aria) + '">' + list.map((m, i) => {
      const x = i * bw + 1, w = Math.max(1, bw - 2), hv = m.v / max * H, hp = m.p / max * H, ho = m.o / max * H;
      return '<g><title>' + esc(m.label + ': ' + (m.v + m.p + m.o) + ' incidents (' + m.v + ' violent, ' + m.p + ' property, ' + m.o + ' other)') + '</title>' +
        '<rect x="' + x.toFixed(1) + '" y="' + (H - hv).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + hv.toFixed(1) + '" fill="' + COL.v + '"/>' +
        '<rect x="' + x.toFixed(1) + '" y="' + (H - hv - hp).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + hp.toFixed(1) + '" fill="' + COL.p + '"/>' +
        '<rect x="' + x.toFixed(1) + '" y="' + (H - hv - hp - ho).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + ho.toFixed(1) + '" fill="' + COL.o + '" fill-opacity=".55"/>' +
        (i % every === 0 ? '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H + 11) + '" font-size="8.5" text-anchor="middle" fill="currentColor" opacity=".6">' + esc(m.short || m.label) + '</text>' : '') + '</g>';
    }).join('') + '</svg>';
  }
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], HR = h => (h % 12 || 12) + (h < 12 ? 'a' : 'p');
  const hourList = d => Array.from({ length: 24 }, (_, h) => { const x = (d.hours || []).find(r => r.h === h) || { v: 0, p: 0, o: 0 }; return { label: HR(h), short: HR(h), v: x.v, p: x.p, o: x.o }; });
  const dowList = d => DOW.map((n, i) => { const x = (d.weekdays || []).find(r => r.d === i) || { v: 0, p: 0, o: 0 }; return { label: n, v: x.v, p: x.p, o: x.o }; });
  // "when" in words: the busiest 3-hour stretch and the busiest day
  function whenLine(d) {
    const hs = hourList(d).map(x => x.v + x.p + x.o), tot = hs.reduce((a, b) => a + b, 0), parts = [];
    if (tot) { let best = 0, at = 0; for (let h = 0; h < 24; h++) { const s = hs[h] + hs[(h + 1) % 24] + hs[(h + 2) % 24]; if (s > best) { best = s; at = h; } }
      parts.push('Busiest 3 hours: ' + HR(at) + '–' + HR((at + 3) % 24) + ' (' + Math.round(best / tot * 100) + '% of incidents with a known time)'); }
    const ds = dowList(d).map(x => ({ n: x.label, t: x.v + x.p + x.o })).sort((a, b) => b.t - a.t);
    if (ds[0]?.t) parts.push('busiest day ' + ds[0].n + ', quietest ' + ds[ds.length - 1].n);
    return parts.join('; ');
  }
  // year by year, as a yearly pace (partial years scaled to 365 days) next to Houston's own change
  function yearRows(d) {
    const city = new Map((d.city_years || []).map(x => [x.y, x.n])), ys = (d.years || []).filter(y => y.days >= 28);
    return ys.map((y, i) => { const pace = Math.round(y.total / y.days * 365), prev = ys[i - 1], pPace = prev ? prev.total / prev.days * 365 : null;
      const cNow = city.get(y.y), cPrev = prev ? city.get(prev.y) : null, cPace = cNow && y.days ? cNow / y.days * 365 : null, cPrevPace = cPrev && prev?.days ? cPrev / prev.days * 365 : null;
      return { y: y.y, total: y.total, v: y.v, p: y.p, days: y.days, partial: y.days < 360, pace, change: pPace ? Math.round((pace / pPace - 1) * 100) : null, city_change: cPace && cPrevPace ? Math.round((cPace / cPrevPace - 1) * 100) : null }; });
  }
  // incidents per 1,000 residents (census tracts whose middle is inside the area); needs the Market data
  async function perResidents(geometry, d) {
    try { const m = await ctx.loadMarket?.(); if (!m?.tracts) return null; const x = summarizeTracts(tractsFor(m.tracts, { geom: geometry }));
      if (!x?.population || x.population < 500) return null; return { pop: x.population, rate: Math.round(d.last12.total / x.population * 10000) / 10, v: Math.round(d.last12.v / x.population * 10000) / 10 }; }
    catch (e) { return null; }
  }
  const rateLine = d => d.per_sqmi && d.city_per_sqmi ? fmtN(d.per_sqmi.total) + ' per sq mi a year vs ' + fmtN(d.city_per_sqmi.total) + ' citywide (' + (d.per_sqmi.total / d.city_per_sqmi.total).toFixed(1) + '×)' : '';
  async function report({ geometry, label, center }) {
    const card = ctx.card || document.getElementById('card');
    ctx.closeCard?.(); card.innerHTML = '<div class="top"><div><div class="kicker">Crime report</div><h2>' + esc(label) + '</h2></div><button class="x" aria-label="Close">×</button></div><div class="bsec"><div class="rnote">Counting incidents…</div></div>';
    card.classList.add('open'); card.querySelector('.x').onclick = () => ctx.closeCard();
    showArea(geometry);
    let d; try { d = await reportFor(geometry); } catch (e) { card.querySelector('.bsec').innerHTML = '<div class="rnote err">' + esc(e.message) + '</div>'; return; }
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
      ((d.incidents || []).length >= 2000 ? '<div class="rnote">The map and export include the newest 2,000 incidents; the totals above count all of them.</div>' : '') + '</div>' +
      '<div class="rnote bsec">Offenses as reported by Houston Police (NIBRS). Counts follow where people are, so busy commercial areas show more than homes nearby; compare with similar places.<span class="src"> ' + esc(d.coverage) + '</span></div>';
    card.classList.add('open'); card.querySelector('.x').onclick = () => ctx.closeCard();
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

  const slug = s => String(s || 'area').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'area';
  async function exportCsv() {
    if (!last?.d?.incidents) return;
    ctx.exportMeta = { report: 'crime', format: 'csv', scope: last.label, filings: last.d.incidents.length, unit: 'incidents' };
    try { ctx.exportCsv(last.d.incidents.map(x => ({ Date: x.day, Offense: x.offense, 'NIBRS code': x.code, Category: CAT_NAME[x.cat] || x.cat, Count: x.n, Premise: x.premise || '', Latitude: x.lat, Longitude: x.lon })), 'crime-' + slug(last.label) + '-' + new Date().toISOString().slice(0, 10)); }
    finally { ctx.exportMeta = null; }
  }
  // the area and its incidents on a street map, for the printed report
  const reportMap = (g, list) => areaSvg([{ geometry: g, stroke: '#c2410c', fill: 'rgba(194,65,12,.06)', dash: true }],
    { fit: g, points: list.slice().reverse().map(x => ({ c: [x.lon, x.lat], r: x.cat === 'v' ? 3.6 : 2.6, color: COL[x.cat], o: x.cat === 'o' ? .5 : .9 })) });
  async function exportReport() {
    if (!last?.d) return; const { d, label, geometry } = last, L = d.last12;
    const list = d.incidents || [];
    const body = '' +
      '<div class="kp"><div><b>' + fmtN(L.total) + '</b><span>Incidents · ' + pct(d.change.total) + '</span></div><div><b style="color:' + COL.v + '">' + fmtN(L.v) + '</b><span>Violent · ' + pct(d.change.v) + '</span></div><div><b style="color:' + COL.p + '">' + fmtN(L.p) + '</b><span>Property · ' + pct(d.change.p) + '</span></div><div><b>' + fmtN(L.o) + '</b><span>Other · ' + pct(d.change.o) + '</span></div></div>' +
      '<p class="meta">Change is against the 12 months before (' + fmtN(d.prior12.total) + ' incidents). ' + esc(rateLine(d)) + '</p>' +
      '<div class="map">' + reportMap(geometry, list) + '</div><div class="lg"><span><i style="background:' + COL.v + '"></i>Violent</span><span><i style="background:' + COL.p + '"></i>Property</span><span><i style="background:' + COL.o + '"></i>Other</span>' + (list.length >= 2000 ? '<span>Newest 2,000 incidents shown</span>' : '') + '</div>' +
      '<h2>Incidents per month</h2><div class="bars">' + monthBars(d.months) + '</div>' +
      (d.hours?.length ? '<h2>By hour of day (last 12 months)</h2><div class="bars">' + catBars(hourList(d), 'By hour') + '</div>' : '') +
      '<h2>By day of week (last 12 months)</h2><div class="bars">' + catBars(dowList(d), 'By day') + '</div><p class="meta">' + esc(whenLine(d)) + '</p>' +
      (yearRows(d).length > 1 ? '<h2>Year by year</h2><table><thead><tr><th>Year</th><th class="r">Incidents</th><th class="r">Violent</th><th class="r">Property</th><th class="r">Yearly pace</th><th class="r">Change</th><th class="r">Houston change</th></tr></thead><tbody>' +
        yearRows(d).map(y => '<tr><td>' + y.y + (y.partial ? '*' : '') + '</td><td class="m r">' + fmtN(y.total) + '</td><td class="m r">' + fmtN(y.v) + '</td><td class="m r">' + fmtN(y.p) + '</td><td class="m r">' + fmtN(y.pace) + '</td><td class="m r">' + (y.change != null ? pct(y.change) : '') + '</td><td class="m r">' + (y.city_change != null ? pct(y.city_change) : '') + '</td></tr>').join('') + '</tbody></table><p class="meta">* Partial year (the data starts or ends mid-year); changes compare the yearly pace.</p>' : '') +
      (last.res ? '<p><b>' + last.res.rate + ' incidents per 1,000 residents a year</b> (' + last.res.v + ' violent), ' + fmtN(last.res.pop) + ' residents in the census tracts here.</p>' : '') +
      '<div class="two"><div><h2>Top offenses</h2><table><thead><tr><th>Offense</th><th>Type</th><th class="r">Count</th></tr></thead><tbody>' + d.offenses.map(o => '<tr><td>' + esc(o.name) + '</td><td>' + esc(CAT_NAME[o.cat] || '') + '</td><td class="m r">' + fmtN(o.n) + '</td></tr>').join('') + '</tbody></table></div>' +
      '<div><h2>Where they happened</h2><table><thead><tr><th>Premise</th><th class="r">Count</th></tr></thead><tbody>' + d.premises.map(p => '<tr><td>' + esc(p.premise) + '</td><td class="m r">' + fmtN(p.n) + '</td></tr>').join('') + '</tbody></table></div></div>' +
      '<div class="full"><h2>Incidents (' + fmtN(list.length) + (list.length >= 2000 ? ', newest' : '') + ')</h2>' + (list.length > 1000 ? '<p class="rnote">The newest 1,000 are listed here; Export CSV has all ' + fmtN(list.length) + '.</p>' : '') + '<table><thead><tr><th>Date</th><th>Offense</th><th>Type</th><th>Premise</th><th class="r">Count</th></tr></thead><tbody>' +
      list.slice(0, 1000).map(x => '<tr><td class="m">' + esc(x.day) + '</td><td>' + esc(x.offense) + '</td><td>' + esc(CAT_NAME[x.cat] || '') + '</td><td>' + esc(x.premise || '') + '</td><td class="m r">' + x.n + '</td></tr>').join('') + '</tbody></table></div>' +
      '';
    const sources = 'Houston Police Department NIBRS public incident data, ' + esc(d.from) + ' to ' + esc(d.latest) + '. ' + esc(d.coverage) + ' Violent = murder, rape, robbery, aggravated assault; property = burglary, theft, vehicle theft, arson, vandalism; other = all remaining offenses. Counts follow activity: busy commercial areas show more incidents than homes nearby. Locations are block-level.';
    await savePdf(ctx, 'crime', label, reportDoc({ kicker: 'Crime report', title: label, meta: '12 months through ' + esc(monthName(d.latest)) + (d.area_sqmi ? ' · ' + d.area_sqmi.toFixed(2) + ' sq mi' : ''), body, sources }), { meta: { filings: list.length, unit: 'incidents' } });
  }

  // property cards: "Crime" pill → incidents within 1 mile (last 12 months vs the year before), with the full report a click away.
  // HPD data covers the City of Houston only, so elsewhere the section says so instead of showing zeros.
  const inHouston = ([lon, lat]) => lon > -95.95 && lon < -95.0 && lat > 29.5 && lat < 30.15;
  const circleMi = ([lon, lat], mi) => { const r = mi / 69, k = Math.cos(lat * Math.PI / 180), ring = []; for (let i = 0; i <= 64; i++) { const a = (i % 64) / 64 * 2 * Math.PI; ring.push([lon + r * Math.cos(a) / k, lat + r * Math.sin(a)]); } return { type: 'Polygon', coordinates: [ring] }; };
  ctx.renderCrimeNear = async (el, center, label = () => 'this property', still = () => true) => {
    if (!el) return;
    const head = '<div class="lt">Crime within 1 mile</div>';
    if (!inHouston(center)) { el.innerHTML = head + '<div class="rnote">Street-level incidents cover the City of Houston only. The yearly figures for the local police department are below.</div>'; return; }
    el.innerHTML = head + '<div class="rnote">Counting reported incidents…</div>';
    let d; try { const r = await fetch('api/crime?lat=' + center[1].toFixed(5) + '&lon=' + center[0].toFixed(5) + '&mi=1&list=8'); d = await r.json(); if (!r.ok) throw new Error(d.error || 'crime data unavailable'); }
    catch (e) { if (still()) el.innerHTML = head + '<div class="rnote">' + esc(e.message) + '</div>'; return; }
    if (!still()) return;
    if (!d.latest) { el.innerHTML = head + '<div class="rnote">No crime data loaded yet.</div>'; return; }
    const L = d.last12;
    el.innerHTML = head + '<div class="kgrid"><div><b>' + fmtN(L.total) + '</b><span>Incidents · ' + pct(d.change.total) + '</span></div><div><b class="cr-v">' + fmtN(L.v) + '</b><span>Violent · ' + pct(d.change.v) + '</span></div>' +
      '<div><b class="cr-p">' + fmtN(L.p) + '</b><span>Property · ' + pct(d.change.p) + '</span></div><div><b>' + (d.per_sqmi && d.city_per_sqmi ? (d.per_sqmi.total / d.city_per_sqmi.total).toFixed(1) + '×' : '—') + '</b><span>vs Houston average</span></div></div>' +
      (d.offenses?.length ? '<dl>' + d.offenses.slice(0, 5).map(o => '<dt>' + esc(o.name) + '</dt><dd>' + fmtN(o.n) + '</dd>').join('') + '</dl>' : '') +
      (d.incidents?.length ? '<div class="rnote"><b>Most recent:</b> ' + d.incidents.slice(0, 4).map(x => esc(x.offense + ' (' + x.day + ')')).join(' · ') + '</div>' : '') +
      '<div class="bacts"><button class="btn" type="button" data-cr="report">Full crime report</button><button class="btn" type="button" data-cr="layer">Crime map layer</button></div>' +
      '<div class="ssrc src">Reported incidents, 12 months through ' + esc(monthName(d.latest)) + ' (change vs the 12 months before). Houston Police (NIBRS); the file runs about three months behind. City of Houston only.</div>';
    el.querySelector('[data-cr="report"]').onclick = () => report({ geometry: circleMi(center, 1), label: '1 mile around ' + label(), center });
    el.querySelector('[data-cr="layer"]').onclick = () => setOn(true);
  };
  // the Reports tab offers the crime report (for the selection or the map view); exports are recorded there
  ctx.crimeReportFor = which => {
    if (which === 'selection') { const s = ctx.sel; if (!s?.feature) return false; report({ geometry: s.feature.geometry || s.feature, label: s.label || 'Selected area' }); return true; }
    const b = map.getBounds(), w = b.getWest(), s = b.getSouth(), e = b.getEast(), n = b.getNorth();
    report({ geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] }, label: 'Map view near ' + (ctx.viewPlace?.() || 'Houston') }); return true;
  };
}
