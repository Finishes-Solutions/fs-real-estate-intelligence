// FEMA (via api/fema):
//   Map layer "Flood Zones (FEMA)": the National Flood Hazard Layer drawn in FEMA's colors at street zoom.
//   FEMA report for any area: the current selection (box, polygon, county or radius) or a building (0.25 mile):
//   share of the area in high / moderate / minimal flood risk, NFIP flood insurance claims paid nearby (by year and storm),
//   federal disaster declarations since 2000, and FEMA's National Risk Index (expected annual loss by hazard).
//   The report opens in the card and exports as a PDF report or CSV.
import { reportDoc, savePdf, saveCsv, areaMap, getJSON, errorBox, unavailable } from './reportkit.js';
import { reveal } from './motion.js';
import { femaReport, femaCsvRows } from './lib/reports/fema.mjs';
const SRC = 'fema-nfhl';

export function initFema(ctx) {
  const { map, esc, fmtN, fmtM } = ctx, box = document.getElementById('lyFema'), note = document.getElementById('lyFemaNote');
  let on = false, last = null, cls = 'all'; // cls: 'all' flood zones, or 'high' (the 100-year floodplain only; Filters → Risk)
  try { on = localStorage.getItem('fs-fema') === '1'; } catch (e) {}

  function addLayer() {
    if (!on || !map.getStyle()) return;
    if (!map.getSource(SRC)) map.addSource(SRC, { type: 'raster', tiles: [location.origin + location.pathname.replace(/[^/]*$/, '') + 'api/fema?tile={z}/{x}/{y}' + (cls === 'high' ? '&cls=high' : '')], tileSize: 256, minzoom: 10, maxzoom: 17, attribution: 'Flood zones: FEMA NFHL' });
    if (!map.getLayer(SRC)) map.addLayer({ id: SRC, type: 'raster', source: SRC, minzoom: 10, paint: { 'raster-opacity': .62 } }, map.getLayer('filings') ? 'filings' : undefined);
  }
  const removeLayer = () => { if (map.getLayer(SRC)) map.removeLayer(SRC); if (map.getSource(SRC)) map.removeSource(SRC); };
  // legend (bottom left): FEMA's own swatches for the zones drawn, fetched once per filter
  const legends = {};
  async function legend() {
    if (!on) { ctx.setLegend?.('fema', ''); return; }
    const c = cls, head = '<div class="t">Flood zones (FEMA)</div>';
    ctx.setLegend?.('fema', head + '<div class="lg-note">Loading FEMA’s legend…</div>');
    try { legends[c] ||= getJSON('api/fema?legend=1' + (c === 'high' ? '&cls=high' : ''), { what: 'The flood zone legend' });
      const d = await legends[c]; if (!on || c !== cls) return;
      ctx.setLegend?.('fema', head + d.items.map(x => '<div class="li"><img class="lg-sw" src="' + esc(x.img) + '" alt="" title="' + esc(x.fema) + '"><span>' + esc(x.label) + '</span></div>').join('') +
        '<div class="lg-note">Unshaded: minimal risk or not mapped. Zones show from neighborhood zoom.</div>'); }
    catch (e) { delete legends[c]; if (on && c === cls) ctx.setLegend?.('fema', head + '<div class="lg-note">FEMA’s legend didn’t load. Shaded areas are flood zones; open a FEMA report for the details.</div>'); }
  }
  function setOn(v) {
    on = v; if (box) box.checked = v; if (note) note.hidden = !v; try { localStorage.setItem('fs-fema', v ? '1' : '0'); } catch (e) {}
    legend(); if (!v) { removeLayer(); return; }
    addLayer(); if (map.getZoom() < 12) ctx.toast('Flood zones show from neighborhood zoom: zoom in to see them.');
  }
  if (box) { box.checked = on; box.onchange = () => setOn(box.checked); if (note) note.hidden = !on; }
  ctx.onOverlays(addLayer);
  ctx.femaLayer = v => setOn(v !== false);
  // which zones the layer shows; switching reloads its tiles (and turns the layer on)
  ctx.femaClass = c => { c = c === 'high' ? 'high' : 'all'; if (c === cls && on) return; cls = c; removeLayer(); if (on) { addLayer(); legend(); } else setOn(true); };
  if (on) (map.loaded() ? legend() : map.once('load', legend));
  ctx.femaClassNow = () => cls;

  // ---------- report ----------
  const reportFor = (geometry, label) => getJSON('api/fema', { what: 'Flood and hazard data', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ geometry, label }) });
  ctx.femaReportData = reportFor;
  const { body, reportHtml } = femaReport({ esc, fmtN, fmtM, unavailable, areaMap, reportDoc });
  async function report({ geometry, label }) {
    const card = ctx.card || document.getElementById('card');
    ctx.closeCard?.(); card.innerHTML = '<div class="top"><div><div class="kicker">FEMA report</div><h2>' + esc(label) + '</h2></div><button class="x" aria-label="Close">×</button></div><div class="bsec"><div class="rnote loading">Checking flood zones, insurance claims, disasters and risk…</div></div>';
    card.classList.add('open'); card.querySelector('.x').onclick = () => ctx.closeCard();
    let d; try { d = await reportFor(geometry, label); } catch (e) { card.querySelector('.bsec').replaceChildren(errorBox(e, () => report({ geometry, label }), 'Flood and hazard data')); return; }
    last = { d, label, geometry };
    card.innerHTML = '<div class="top"><div><div class="kicker">FEMA report</div><h2>' + esc(label) + '</h2><div class="bsub">' + (d.area_sqmi < 10 ? d.area_sqmi.toFixed(2) : fmtN(d.area_sqmi)) + ' sq mi</div></div><button class="x" aria-label="Close">×</button></div>' + body(d) +
      '<div class="bacts"><button class="btn" id="fmLayer" type="button">Show Flood Zones on Map</button><button class="btn primary" id="fmPdf" type="button">Export PDF</button><button class="btn" id="fmCsv" type="button">Export CSV</button></div>' +
      '<div class="rnote bsec">Flood maps show regulatory risk, not every flood; Houston floods outside them too. For a single parcel, confirm with an elevation certificate or a FEMA flood zone determination.<span class="src"> ' + esc(d.sources) + '</span></div>';
    card.classList.add('open'); card.querySelector('.x').onclick = () => ctx.closeCard();
    reveal(card, 'card:fema|' + label); // its charts draw in once per report (src/motion.js)
    card.querySelector('#fmLayer').onclick = () => { setOn(true); ctx.fitGeom?.(geometry); };
    card.querySelector('#fmPdf').onclick = exportReport; card.querySelector('#fmCsv').onclick = exportCsv;
  }
  ctx.femaReport = report;

  function exportCsv() {
    if (!last) return;
    saveCsv(ctx, 'fema', last.label, femaCsvRows(last.d), { geom: last.geometry });
  }
  function exportReport() {
    if (!last) return; const { d, label, geometry } = last;
    const html = reportHtml(d, label, geometry);
    return savePdf(ctx, 'fema', label, html, { meta: { geom: geometry } });
  }

  // the Reports tab: the selected area, or draw one (it has its own row in the Map panel and button in the Site section)
  ctx.addAreaReport?.({ key: 'fema', label: 'FEMA Report', noPanel: true, noSite: true, modes: ['selection', 'pick'],
    desc: 'Flood risk for an area: the share in high, moderate and minimal flood zones, flood insurance claims paid nearby, federal disaster declarations since 2000 and FEMA’s National Risk Index. PDF or CSV.',
    note: 'Select an area on the Map, or draw one', run: ({ geometry, label }) => report({ geometry, label }) });
  // entry point: the Map panel's "Reports for this area" row (shown while an area is selected)
  const run = () => { const s = ctx.sel; if (s?.feature) report({ geometry: s.feature.geometry || s.feature, label: s.label || 'Selected area' }); };
  const sb = document.getElementById('selFema'), sync = () => { if (sb) sb.style.display = ctx.sel?.feature ? '' : 'none'; };
  if (sb) sb.onclick = run; ctx.onChange(sync); sync();
}
