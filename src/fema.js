// FEMA (via api/fema):
//   Map layer "Flood Zones (FEMA)": the National Flood Hazard Layer drawn in FEMA's colors at street zoom.
//   FEMA report for any area: the current selection (box, polygon, county or radius) or a building (0.25 mile):
//   share of the area in high / moderate / minimal flood risk, NFIP flood insurance claims paid nearby (by year and storm),
//   federal disaster declarations since 2000, and FEMA's National Risk Index (expected annual loss by hazard).
//   The report opens in the card and exports as a PDF report or CSV.
import { reportDoc, savePdf, saveCsv, areaMap, getJSON, errorBox, unavailable, fitArea, fmtSqmi, sqmiOf, friendly } from './reportkit.js';
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
  // the four parts come back separately (api/fema `parts`): each shows as soon as it lands, a slow one (claims over a whole
  // county take minutes) doesn't hold up the rest, and one that failed can be asked for again on its own
  const reportFor = (geometry, label, parts, signal) => getJSON('api/fema', { what: 'Flood and hazard data', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ geometry, label, ...(parts ? { parts } : {}) }), signal });
  ctx.femaReportData = (geometry, label) => reportFor(geometry, label);
  const STEPS = [['flood_zones', 'Flood zones'], ['nfip_claims', 'Flood insurance claims'], ['disasters', 'Disaster declarations'], ['risk_index', 'FEMA risk index']];
  const ASKS = [['flood_zones'], ['risk_index'], ['nfip_claims', 'disasters']]; // claims and declarations share one tract lookup
  const { body, reportHtml } = femaReport({ esc, fmtN, fmtM, unavailable, areaMap, reportDoc });
  let seq = 0, ctl = null, tick = 0;
  const stop = () => { ctl?.abort(); ctl = null; clearInterval(tick); };
  ctx.onCardClose?.(stop); // closing the card stops a report still loading
  const head = (label, sub) => '<div class="top"><div><div class="kicker">FEMA report</div><h2>' + esc(label) + '</h2>' + (sub ? '<div class="bsub">' + sub + '</div>' : '') + '</div><button class="x" aria-label="Close">×</button></div>';
  async function report({ geometry, label }) {
    const my = ++seq, card = ctx.card || document.getElementById('card');
    ctx.closeCard?.(); stop(); ctl = new AbortController();
    const signal = ctl.signal, sq = sqmiOf(geometry), t0 = Date.now(), state = {}, d = { label, area_sqmi: sq, counties: [] };
    STEPS.forEach(([k]) => { d[k] = { pending: true }; state[k] = 'run'; });
    // still this run's card (not a newer report, and not another card drawn over it)
    const mine = () => my === seq && !!card.querySelector('.fm-prog[data-run="' + my + '"]');
    const elapsed = () => { const s = Math.round((Date.now() - t0) / 1000); return 'Working for ' + (s < 60 ? s + ' s.' : Math.floor(s / 60) + ' min ' + (s % 60) + ' s.'); };
    // while parts are still out: the step list (each part's state, the time so far, Cancel) above whatever has landed
    const progress = () => '<div class="bsec fm-prog" data-run="' + my + '"><ul class="fm-steps" aria-label="Report parts">' + STEPS.map(([k, l]) => '<li class="' + state[k] + '"><i aria-hidden="true"></i>' + esc(l) + '<span>' + (state[k] === 'ok' ? 'Done' : state[k] === 'err' ? 'Didn’t load' : 'Working…') + '</span></li>').join('') + '</ul>' +
      '<div class="rnote" role="status"><span id="fmEl">' + elapsed() + '</span>' + (sq > 200 ? ' Large areas can take 1–3 minutes; each part appears below as soon as it’s in.' : '') + ' <button class="lnk" type="button" id="fmCancel">Cancel</button></div></div>';
    const paint = (first) => { if (!first && !mine()) return; const y = card.scrollTop;
      card.innerHTML = head(label, fmtSqmi(sq)) + progress() + body(d); card.classList.add('open'); card.scrollTop = y;
      card.querySelector('.x').onclick = () => ctx.closeCard(); card.querySelector('#fmCancel').onclick = cancel; wireRetry(card, d, geometry, label, k => { state[k] = d[k]?.error ? 'err' : 'ok'; paint(); }); };
    const cancel = () => { if (!mine()) return; stop();
      card.querySelector('.fm-prog').replaceChildren(errorBox('Stopped. The parts that had loaded are shown below.', () => report({ geometry, label }))); card.querySelector('.fm-prog .eb-retry').textContent = 'Run it again';
      card.querySelectorAll('.bsec:has(> .rnote.loading)').forEach(b => b.remove()); }; // the parts that hadn't loaded go
    fitArea(ctx, geometry); paint(true);
    tick = setInterval(() => { const e = mine() && card.querySelector('#fmEl'); if (e) e.textContent = elapsed(); else clearInterval(tick); }, 1000);
    const ask = parts => reportFor(geometry, label, parts, signal).then(r => { parts.forEach(k => { d[k] = r[k]; state[k] = r[k]?.error ? 'err' : 'ok'; }); if (r.counties?.length) d.counties = r.counties; d.area_sqmi = r.area_sqmi ?? d.area_sqmi; d.sources = r.sources; d.risk_labels = r.risk_labels; },
      e => { if (e?.name === 'AbortError') throw e; parts.forEach(k => { d[k] = { error: e.message, failed: true }; state[k] = 'err'; }); return e; }).then(x => { paint(); return x; });
    let errs; try { errs = await Promise.all(ASKS.map(ask)); } catch (e) { return; } // cancelled
    if (!mine()) return; stop();
    // nothing came back at all (offline, the service down): one sentence with Retry, as before
    const fails = errs.filter(x => x instanceof Error); if (fails.length === ASKS.length) { card.querySelector('.fm-prog').replaceChildren(errorBox(fails[0], () => report({ geometry, label }), 'Flood and hazard data')); card.querySelectorAll('.bsec:not(.fm-prog)').forEach(b => b.remove()); return; }
    last = { d, label, geometry }; draw(card);
  }
  // the finished card (again after a part is retried)
  function draw(card) {
    const { d, label, geometry } = last;
    card.innerHTML = head(label, fmtSqmi(d.area_sqmi)) + body(d) +
      '<div class="bacts"><button class="btn" id="fmLayer" type="button">Show Flood Zones on Map</button><button class="btn primary" id="fmPdf" type="button">Export PDF</button><button class="btn" id="fmCsv" type="button">Export CSV</button></div>' +
      '<div class="rnote bsec">Flood maps show regulatory risk, not every flood; Houston floods outside them too. For a single parcel, confirm with an elevation certificate or a FEMA flood zone determination.<span class="src"> ' + esc(d.sources || '') + '</span></div>';
    card.classList.add('open'); card.querySelector('.x').onclick = () => ctx.closeCard();
    reveal(card, 'card:fema|' + label); // its charts draw in once per report (src/motion.js)
    card.querySelector('#fmLayer').onclick = () => { setOn(true); ctx.fitGeom?.(geometry); };
    card.querySelector('#fmPdf').onclick = exportReport; card.querySelector('#fmCsv').onclick = exportCsv;
    wireRetry(card, d, geometry, label, () => { if (last?.d === d && card.querySelector('#fmPdf')) draw(card); });
  }
  // Retry on one failed part: ask for that part alone and redraw (the rest of the report stays as it is)
  function wireRetry(card, d, geometry, label, redraw) {
    card.querySelectorAll('[data-fretry]').forEach(b => b.onclick = async () => {
      const k = b.dataset.fretry; b.disabled = true; b.textContent = 'Retrying…';
      try { const r = await reportFor(geometry, label, [k]); d[k] = r[k]; if (r.counties?.length) d.counties = r.counties; redraw(k); }
      catch (e) { b.disabled = false; b.textContent = 'Retry'; ctx.toast?.(friendly(e, 'Flood and hazard data')); }
    });
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
