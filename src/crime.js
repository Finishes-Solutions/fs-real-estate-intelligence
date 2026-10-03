// Crime (Houston Police NIBRS incidents, via api/crime):
//   Map layer "Crime (Houston)": a heat map zoomed out, ~400 m squares zoomed in, for all / violent / property incidents in the last 12 months.
//   Crime report for any area: the current selection (box, polygon, county or radius), a building (½ mile) or a map square.
//   The report opens in the card (totals vs the year before and vs the city, monthly bars, top offenses and places,
//   recent incidents), can put the incidents on the map, and exports as a printable report (HTML → PDF) or CSV.
import { offenseName, CAT_NAME } from './lib/nibrs.mjs';

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
    if (note) note.textContent = 'Houston Police incidents in the 12 months through ' + monthName(grid.latest || last) + ', per ~¼-mile square. City of Houston only. Click a square for its numbers.';
  }
  function removeLayers() { for (const id of [HEAT, CELLS]) if (map.getLayer(id)) map.removeLayer(id); for (const s of [SRC, SRC + '-sq']) if (map.getSource(s)) map.removeSource(s); }
  const monthName = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'the latest month';

  async function setOn(v) {
    on = v; if (box) box.checked = v; if (catSel) catSel.hidden = !v; if (note) note.hidden = !v;
    if (!v) { removeLayers(); return; }
    try { await loadGrid(); addLayers(); if (map.getZoom() < 9) map.easeTo({ center: [-95.37, 29.76], zoom: 10, duration: ctx.reduceMotion ? 0 : 800 }); }
    catch (e) { ctx.toast('Crime layer unavailable: ' + e.message); setOn(false); }
  }
  if (box) box.onchange = () => setOn(box.checked);
  if (catSel) catSel.onchange = () => { cat = catSel.value; try { localStorage.setItem('fs-crime-cat', cat); } catch (e) {} if (on && grid) { removeLayers(); addLayers(); } };
  ctx.onOverlays(addLayers);
  ctx.crimeLayer = v => setOn(v !== false);

  // hover / click a square
  map.on('mousemove', CELLS, e => { const f = e.features?.[0]; if (!f) return; map.getCanvas().style.cursor = 'pointer'; const p = f.properties; tip(e.point, fmtN(p.v + p.p + p.o) + ' incidents in 12 months · ' + fmtN(p.v) + ' violent · ' + fmtN(p.p) + ' property'); });
  map.on('mouseleave', CELLS, () => { map.getCanvas().style.cursor = ''; tip(null); });
  ctx.mapClickHandlers.unshift(e => {
    if (!on || !map.getLayer(CELLS) || map.getZoom() < 12) return false;
    const f = map.queryRenderedFeatures(e.point, { layers: [CELLS] })[0]; if (!f) return false;
    const ring = f.geometry.coordinates[0], c = [(ring[0][0] + ring[2][0]) / 2, (ring[0][1] + ring[2][1]) / 2];
    report({ geometry: f.geometry, label: '¼-mile square near ' + c[1].toFixed(4) + ', ' + c[0].toFixed(4), center: c });
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
      '<div class="bsec"><div class="lt">Top offenses</div><dl>' + d.offenses.slice(0, 10).map(o => '<dt>' + esc(o.name) + '</dt><dd class="mono">' + fmtN(o.n) + ' <span class="sc">' + esc(CAT_NAME[o.cat] || '') + '</span></dd>').join('') + '</dl></div>' +
      '<div class="bsec"><div class="lt">Where they happened</div><dl>' + d.premises.slice(0, 8).map(p => '<dt>' + esc(p.premise) + '</dt><dd class="mono">' + fmtN(p.n) + '</dd>').join('') + '</dl></div>' +
      '<div class="bacts"><button class="btn" id="crPts" type="button">Show Incidents on Map</button><button class="btn primary" id="crPdf" type="button">Export Report</button><button class="btn" id="crCsv" type="button">Export CSV</button></div>' +
      '<div class="bsec"><div class="lt">Most recent incidents</div>' + (d.incidents || []).slice(0, 15).map(x => '<div class="pl"><b>' + esc(x.offense) + '</b><span>' + esc(x.day + (x.premise ? ' · ' + x.premise : '')) + '</span></div>').join('') +
      ((d.incidents || []).length >= 2000 ? '<div class="rnote">The map and export include the newest 2,000 incidents; the totals above count all of them.</div>' : '') + '</div>' +
      '<div class="rnote bsec">Offenses as reported by Houston Police (NIBRS). Counts follow where people are, so busy commercial areas show more than homes nearby; compare with similar places.<span class="src"> ' + esc(d.coverage) + '</span></div>';
    card.classList.add('open'); card.querySelector('.x').onclick = () => ctx.closeCard();
    card.querySelector('#crPts').onclick = () => showPoints(d.incidents || []);
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
  function showPoints(list) { try { drawPoints(list); } catch (e) { ctx.toast?.('The map is still loading; try again in a moment.'); } }
  function drawPoints(list) {
    shown = list; const data = { type: 'FeatureCollection', features: (list || []).map(x => ({ type: 'Feature', properties: { c: x.cat, t: x.offense + ' · ' + x.day + (x.premise ? ' · ' + x.premise : '') }, geometry: { type: 'Point', coordinates: [x.lon, x.lat] } })) };
    const s = map.getSource(PTS); if (s) s.setData(data);
    else if (list) { map.addSource(PTS, { type: 'geojson', data }); map.addLayer({ id: PTS, type: 'circle', source: PTS, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 16, 6], 'circle-color': ['match', ['get', 'c'], 'v', COL.v, 'p', COL.p, COL.o], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1, 'circle-opacity': .9 } });
      map.on('mousemove', PTS, e => { const f = e.features?.[0]; if (f) tip(e.point, f.properties.t); }); map.on('mouseleave', PTS, () => tip(null)); }
    if (list?.length && last?.geometry) ctx.fitGeom?.(last.geometry);
  }
  ctx.onOverlays(() => { if (shown) { const s = shown; shown = null; if (map.getSource(PTS)) { map.removeLayer(PTS); map.removeSource(PTS); } showPoints(s); } if (last && map.getSource('crime-area') == null && document.getElementById('card')?.classList.contains('open')) showArea(last.geometry); });

  const slug = s => String(s || 'area').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'area';
  function exportCsv() {
    if (!last?.d?.incidents) return;
    ctx.exportCsv(last.d.incidents.map(x => ({ Date: x.day, Offense: x.offense, 'NIBRS code': x.code, Category: CAT_NAME[x.cat] || x.cat, Count: x.n, Premise: x.premise || '', Latitude: x.lat, Longitude: x.lon })), 'crime-' + slug(last.label) + '-' + new Date().toISOString().slice(0, 10));
  }
  // a small map of the area and its incidents for the printed report
  function reportMap(g, list) {
    const ring = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flat(2);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const W = 1000, H = 420, k = Math.cos((y0 + y1) / 2 * Math.PI / 180), sx = (x1 - x0) * k || 1e-4, sy = (y1 - y0) || 1e-4, s = Math.min((W - 40) / sx, (H - 40) / sy);
    const pr = ([x, y]) => [(W - sx * s) / 2 + (x - x0) * k * s, (H - sy * s) / 2 + (y1 - y) * s];
    const path = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map(poly => poly.map(r => 'M' + r.map(p => pr(p).map(v => v.toFixed(1)).join(',')).join('L') + 'Z').join('')).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg"><rect width="' + W + '" height="' + H + '" fill="#f8f9f9"/><path d="' + path + '" fill="rgba(194,65,12,.05)" stroke="#c2410c" stroke-width="1.6" stroke-dasharray="6 4"/>' +
      list.slice().reverse().map(x => { const p = pr([x.lon, x.lat]); return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (x.cat === 'v' ? 3.6 : 2.6) + '" fill="' + COL[x.cat] + '" fill-opacity="' + (x.cat === 'o' ? .45 : .85) + '"/>'; }).join('') + '</svg>';
  }
  function exportReport() {
    if (!last?.d) return; const { d, label, geometry } = last, L = d.last12, logo = document.querySelector('.brandbar .l-light')?.src || '', today = new Date();
    const css = '@page{size:letter;margin:.5in}*{box-sizing:border-box}body{margin:0;font-family:Montserrat,system-ui,sans-serif;color:#23282a;font-size:12px;line-height:1.45}.wrap{max-width:900px;margin:0 auto;padding:28px}' +
      '.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #006527;padding-bottom:12px}.hd img{height:40px}.k{font-family:"IBM Plex Mono",monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#006527}' +
      'h1{font-size:24px;margin:6px 0 2px;font-weight:800}h2{font-size:14px;margin:22px 0 8px}.meta{color:#6b7174}.kp{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #e8ebeb;border-radius:6px;margin-top:16px}.kp div{padding:10px 12px}.kp div+div{border-left:1px solid #e8ebeb}' +
      '.kp b{display:block;font-family:"IBM Plex Mono",monospace;font-size:19px}.kp span{font-family:"IBM Plex Mono",monospace;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#6b7174}.map{margin-top:14px;border:1px solid #e8ebeb;border-radius:6px;overflow:hidden}.map svg,.bars svg{display:block;width:100%;height:auto}.bars{max-width:560px}' +
      '.two{display:grid;grid-template-columns:1fr 1fr;gap:22px}table{width:100%;border-collapse:collapse}th{font-family:"IBM Plex Mono",monospace;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#6b7174;text-align:left;border-bottom:1px solid #bcc2c4;padding:5px 6px}' +
      'td{border-bottom:1px solid #e8ebeb;padding:5px 6px}.m{font-family:"IBM Plex Mono",monospace;font-size:11px;white-space:nowrap}.r{text-align:right}tr{break-inside:avoid}.lg{display:flex;gap:14px;font-size:11px;color:#4d5457;margin-top:6px}.lg i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px}' +
      '.ft{margin-top:22px;padding-top:10px;border-top:1px solid #e8ebeb;color:#6b7174;font-size:10.5px}.pb{position:fixed;right:18px;top:18px;background:#006527;color:#fff;border:0;border-radius:4px;padding:9px 14px;font:600 12px Montserrat,sans-serif;cursor:pointer}@media print{.pb{display:none}.wrap{padding:0}.full{break-before:page}}';
    const list = d.incidents || [];
    const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Crime report — ' + esc(label) + '</title><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Montserrat:wght@400;600;800&display=swap" rel="stylesheet"><style>' + css + '</style></head><body>' +
      '<button class="pb" onclick="window.print()">Print or Save as PDF</button><div class="wrap"><div class="hd"><div><div class="k">Crime report</div><h1>' + esc(label) + '</h1><div class="meta">12 months through ' + esc(monthName(d.latest)) + (d.area_sqmi ? ' · ' + d.area_sqmi.toFixed(2) + ' sq mi' : '') + ' · Generated ' + today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + '</div></div>' + (logo ? '<img src="' + logo + '" alt="Finishes Solutions">' : '') + '</div>' +
      '<div class="kp"><div><b>' + fmtN(L.total) + '</b><span>Incidents · ' + pct(d.change.total) + '</span></div><div><b style="color:' + COL.v + '">' + fmtN(L.v) + '</b><span>Violent · ' + pct(d.change.v) + '</span></div><div><b style="color:' + COL.p + '">' + fmtN(L.p) + '</b><span>Property · ' + pct(d.change.p) + '</span></div><div><b>' + fmtN(L.o) + '</b><span>Other · ' + pct(d.change.o) + '</span></div></div>' +
      '<p class="meta">Change is against the 12 months before (' + fmtN(d.prior12.total) + ' incidents). ' + esc(rateLine(d)) + '</p>' +
      '<div class="map">' + reportMap(geometry, list) + '</div><div class="lg"><span><i style="background:' + COL.v + '"></i>Violent</span><span><i style="background:' + COL.p + '"></i>Property</span><span><i style="background:' + COL.o + '"></i>Other</span>' + (list.length >= 2000 ? '<span>Newest 2,000 incidents shown</span>' : '') + '</div>' +
      '<h2>Incidents per month</h2><div class="bars">' + monthBars(d.months) + '</div>' +
      '<div class="two"><div><h2>Top offenses</h2><table><thead><tr><th>Offense</th><th>Type</th><th class="r">Count</th></tr></thead><tbody>' + d.offenses.map(o => '<tr><td>' + esc(o.name) + '</td><td>' + esc(CAT_NAME[o.cat] || '') + '</td><td class="m r">' + fmtN(o.n) + '</td></tr>').join('') + '</tbody></table></div>' +
      '<div><h2>Where they happened</h2><table><thead><tr><th>Premise</th><th class="r">Count</th></tr></thead><tbody>' + d.premises.map(p => '<tr><td>' + esc(p.premise) + '</td><td class="m r">' + fmtN(p.n) + '</td></tr>').join('') + '</tbody></table></div></div>' +
      '<div class="full"><h2>Incidents (' + fmtN(list.length) + (list.length >= 2000 ? ', newest' : '') + ')</h2><table><thead><tr><th>Date</th><th>Offense</th><th>Type</th><th>Premise</th><th class="r">Count</th></tr></thead><tbody>' +
      list.map(x => '<tr><td class="m">' + esc(x.day) + '</td><td>' + esc(x.offense) + '</td><td>' + esc(CAT_NAME[x.cat] || '') + '</td><td>' + esc(x.premise || '') + '</td><td class="m r">' + x.n + '</td></tr>').join('') + '</tbody></table></div>' +
      '<div class="ft">Source: Houston Police Department NIBRS public incident data, ' + esc(d.from) + ' to ' + esc(d.latest) + '. ' + esc(d.coverage) + ' Violent = murder, rape, robbery, aggravated assault; property = burglary, theft, vehicle theft, arson, vandalism; other = all remaining offenses. Counts follow activity: busy commercial areas show more incidents than homes nearby. Locations are block-level.</div></div></body></html>';
    ctx.saveFile('crime-report-' + slug(label) + '-' + today.toISOString().slice(0, 10) + '.html', html, 'text/html');
  }

  // selection bar: "Crime Report" for whatever is selected on the map
  // (the selection bar lives in the Construction Filings section, which starts collapsed, so a strip under Area at a Glance offers it too)
  const btn = document.getElementById('selCrime'), glance = document.getElementById('glance');
  let strip = null;
  if (glance) { strip = document.createElement('div'); strip.className = 'crsel'; strip.hidden = true; strip.innerHTML = '<span><b></b></span><button class="btn" type="button">Crime Report</button>'; glance.after(strip); }
  const run = () => { const s = ctx.sel; if (s?.feature) report({ geometry: s.feature.geometry || s.feature, label: s.label || 'Selected area' }); };
  const sync = () => { const has = !!ctx.sel?.feature; if (btn) btn.style.display = has ? '' : 'none'; if (strip) { strip.hidden = !has; if (has) strip.querySelector('b').textContent = ctx.sel.label || 'Selected area'; } };
  if (btn) btn.onclick = run; if (strip) strip.querySelector('button').onclick = run;
  ctx.onChange(sync); sync();
}
