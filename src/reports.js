// Reports tab: start a report (For an area, then From your filters) and find past exports again.
// Every file the app saves (ctx.onSave) is recorded here: details in localStorage, the file itself in IndexedDB,
// all in this browser only. The newest 50 files (up to ~150 MB) are kept; older ones stay listed so they can be set up again.
import { decode, tidyFilterText } from './lib/filter.mjs';
import { pruneReports, fmtBytes } from './lib/reports.mjs';
import { REPORTS, FORMATS } from './export.js';
import { inHouston, middleOf } from './reportkit.js';

const KEY = 'fs-reports';
const ICON = { pdf: 'PDF', xlsx: 'XLS', csv: 'CSV', geojson: 'GEO', html: 'WEB', kml: 'KML' };
const KINDS = { 'site-parcel': 'Parcel Map', 'site-topo': 'Topography', 'site-environmental': 'Site Environmental', 'site-area': 'Area Report (rings)', ...Object.fromEntries(Object.entries(REPORTS).map(([k, r]) => [k, r.label])), crime: 'Crime Report', crimeus: 'City / County Crime Report', fema: 'FEMA Report', environmental: 'Environmental Report', market: 'Market Report', traffic: 'Traffic Report', airtraffic: 'Air Traffic Report', drivetime: 'Drive-Time Map', field: 'Field Notes', other: 'Other' };
// area reports that keep the area they were made for, so a row can run them again
const AREA_KINDS = new Set(['crime', 'fema', 'environmental', 'traffic', 'airtraffic', 'drivetime', 'market']);

// a small copy of the area an export was about (the outer ring, at most ~160 points, 4 decimals), kept with the record
function compactGeom(g) {
  if (!g?.type) return null;
  const r = v => Math.round(v * 1e4) / 1e4, pt = p => [r(p[0]), r(p[1])];
  const thin = ring => { if (ring.length <= 160) return ring.map(pt); const k = Math.ceil(ring.length / 160), o = ring.filter((p, i) => i % k === 0).map(pt); o.push(o[0]); return o; };
  let out;
  if (g.type === 'Point') out = { type: 'Point', coordinates: pt(g.coordinates) };
  else if (g.type === 'Polygon') out = { type: 'Polygon', coordinates: g.coordinates.slice(0, 1).map(thin) };
  else if (g.type === 'MultiPolygon') out = { type: 'MultiPolygon', coordinates: g.coordinates.slice(0, 6).map(poly => poly.slice(0, 1).map(thin)) };
  else return null;
  return JSON.stringify(out).length < 12000 ? out : null;
}

export function initReports(ctx) {
  const { esc, fmtN } = ctx, root = document.getElementById('view-reports'); if (!root) return;
  const kindOf = k => KINDS[k] || (ctx.areaReports || []).find(x => x.key === k)?.label;
  let list = []; try { list = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} };
  let q = '', kind = '', showAll = false, mkAsked = false; const RECENT = 3;

  // ---------- file store (IndexedDB) ----------
  let dbp = null;
  const idb = () => dbp ||= new Promise((res, rej) => { const r = indexedDB.open('fs-reports', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('files', mode), st = t.objectStore('files'), out = fn(st); t.oncomplete = () => res(out?.result); t.onerror = () => rej(t.error); }); };
  const putFile = (id, blob) => tx('readwrite', s => s.put(blob, id));
  const getFile = id => tx('readonly', s => s.get(id));
  const delFile = id => tx('readwrite', s => s.delete(id)).catch(() => {});

  // ---------- record every export ----------
  ctx.onSave((filename, data, mime) => {
    if (ctx._noRecord || /^image\//.test(mime || '')) return; // downloads-again and site images aren't new reports
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime }), m = ctx.exportMeta || {}, ext = (filename.split('.').pop() || '').toLowerCase();
    const field = /^(fs-)?field-notes/.test(filename);
    const r = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), file: filename, mime: mime || blob.type, size: blob.size, at: new Date().toISOString(),
      report: m.report || (field ? 'field' : 'other'), format: m.format || ext, filings: m.filings ?? null, unit: m.unit || 'filings', scope: m.scope || '', filters: m.filters || '', hash: m.hash || '', stored: true };
    if (m.fallback) r.fallback = true;                   // a PDF that came out as a web page
    if (m.pick) r.pick = m.pick;                         // which filings: 'filters', 'view' (the map view) or 'highlight'
    if (m.view) r.view = m.view; if (m.ids) r.ids = m.ids;
    const geom = compactGeom(m.geom); if (geom) r.geom = geom;
    if (m.mk) r.mk = m.mk;                               // the Market page's area
    list.unshift(r);
    putFile(r.id, blob).catch(e => { console.error('report store', e); r.stored = false; save(); render(); });
    const p = pruneReports(list); list = p.keep; p.drop.forEach(delFile); save(); render();
  });

  // ---------- actions ----------
  const apply = hash => { const p = new URLSearchParams(hash || ''); const m = p.get('m'); p.delete('v'); p.delete('f'); p.delete('m');
    ctx.fromSpec(decode(p.toString())); if (m) ctx.setMonth(m); else if (ctx.state.month) ctx.setMonth(null); };
  async function download(r) {
    const blob = await getFile(r.id).catch(() => null);
    if (!blob) { r.stored = false; save(); render(); ctx.toast('That file is no longer stored here.' + (canRerun(r) ? ' Use ' + (REPORTS[r.report] ? 'Set up again' : 'Run again') + ' to make a new one.' : '')); return; }
    ctx._noRecord = true; try { await ctx.saveFile(r.file, blob, r.mime); } finally { ctx._noRecord = false; }
  }
  const canRerun = r => r.report === 'field' || !!REPORTS[r.report] || (AREA_KINDS.has(r.report) && (!!r.geom || r.report === 'market'));
  // "Set up again" (filing reports): put the filters, the area and the filings (map view / highlighted) back the way they were for this export, then
  // open the Export dialog. What was there before comes back with Undo.
  function setUpAgain(r) {
    if (r.report === 'field') { ctx.setView('field'); return; }
    if (!REPORTS[r.report]) return;
    if (r.report === 'compare') { ctx.openExport('compare', { format: r.format }); return; }
    const wasView = ctx.view, snap = ctx.snapshot(), cam = { center: ctx.map.getCenter().toArray(), zoom: ctx.map.getZoom(), pitch: ctx.map.getPitch(), bearing: ctx.map.getBearing() }, hl = ctx.highlighted();
    let pick = 'filters';
    if (r.hash) apply(r.hash);
    if (r.pick === 'view' && r.view?.length === 4) { ctx.setView('map'); ctx.map.fitBounds([[r.view[0], r.view[1]], [r.view[2], r.view[3]]], { duration: 0, padding: 0 }); pick = 'view'; }
    else if (r.pick === 'highlight' && r.ids?.length) { const fs = r.ids.map(id => ctx.BY_ID.get(id)).filter(Boolean); if (fs.length) { ctx.highlight(fs, r.scope || 'Highlighted Filings'); pick = 'highlight'; } }
    ctx.toast('Filters and area set to match this export ·', { ms: 7000, action: { label: 'Undo', run: () => {
      ctx.closeExport?.(); ctx.restore(snap);
      if (hl.length) ctx.highlight(hl.map(id => ctx.BY_ID.get(id)).filter(Boolean), ''); else ctx.clearHighlight?.();
      ctx.map.jumpTo(cam); if (wasView && ctx.view !== wasView) ctx.setView(wasView); } } });
    ctx.openExport(r.report, { format: r.format, scope: pick });
  }
  // "Run again" (area reports): the same report for the same area, with today's data
  function runAgain(r) {
    if (r.report === 'market') { ctx.toast('Making the Market Report…'); ctx.exportMarket(r.format === 'csv' ? 'csv' : 'pdf', r.mk || 'all', { stay: true }); return; }
    const g = r.geom; if (!g) return;
    const center = g.type === 'Point' ? g.coordinates : middleOf(g), label = r.scope || 'Saved area';
    if (r.report === 'crime') { ctx.setView('map'); ctx.crimeReport({ geometry: g, label, center }); return; }
    ctx.runAreaReport(r.report, { geometry: g, label, center });
  }
  function openOnMap(r) { apply(r.hash); ctx.setView('map'); ctx.fitToVisible(); }
  // Delete: gone from the list at once; the stored file is kept for 6 seconds so Undo can bring the row back with its file
  function remove(r) {
    const at = list.indexOf(r); if (at < 0) return;
    list = list.filter(x => x !== r); save(); render();
    const t = setTimeout(() => delFile(r.id), 6000);
    ctx.toast('Deleted ·', { ms: 6000, action: { label: 'Undo', run: () => { clearTimeout(t); if (!list.includes(r)) list.splice(Math.min(at, list.length), 0, r); save(); render(); } } });
  }
  function clearAll() { if (!list.length || !confirm('Remove all ' + list.length + ' past exports from this browser?')) return; list.forEach(r => delFile(r.id)); list = []; save(); render(); }

  // ---------- view ----------
  const when = iso => { const d = new Date(iso); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
  // one report card: name, a three-line description (the full text on hover), an optional note (HTML), then its buttons
  const cardHtml = (label, desc, note, btns, extra = '') => '<div class="rp-card"><b>' + esc(label) + '</b><p title="' + esc(desc) + '">' + esc(desc) + '</p>' + (note ? '<em>' + note + '</em>' : '') + '<div class="rp-fmts">' + btns + '</div>' + extra + '</div>';
  const mapCenter = () => { const c = ctx.map.getCenter(); return [c.lng, c.lat]; };
  const selCenter = () => { const s = ctx.sel; return s?.feature ? s.center || middleOf(s.feature.geometry || s.feature) : null; };
  // "From your filters": the filing reports. PDF, Excel and CSV make the file now with the current filters; Customize… opens the dialog
  function filterCards() {
    const areas = ctx.compare?.list().length || 0;
    return Object.entries(REPORTS).map(([k, r]) => {
      const none = k === 'compare' && !areas;
      const note = k === 'compare' ? (areas ? esc(fmtN(areas) + ' area' + (areas === 1 ? '' : 's') + ' in Compare') : '') : '';
      return cardHtml(r.label, r.desc, note, r.formats.map(f => '<button type="button" class="btn" data-x="' + k + '" data-f="' + f + '"' + (none ? ' disabled' : '') + ' title="' + (none ? 'Add areas in Market › Compare areas first' : 'Make the ' + esc(FORMATS[f]) + ' file now, with your current filters') + '">' + esc(FORMATS[f].replace(' (GIS)', '')) + '</button>').join(''),
        none ? '<button type="button" class="lnk rp-cust" data-go="compare">Add areas in Market › Compare areas</button>' : '<button type="button" class="lnk rp-cust" data-new="' + k + '" title="Choose the format, which filings and the options">Customize…</button>');
    }).join('');
  }
  // Market Report: the Market page for the region or counties chosen there, as a PDF report or the data as CSV
  function marketCard() {
    if (!ctx.exportMarket) return '';
    const where = ctx.marketAreaLabel?.() || 'the area chosen on Market';
    if (!ctx.marketAreaLabel?.() && !mkAsked) { mkAsked = true; ctx.areaData?.().then(() => render()).catch(() => {}); } // the name of the area appears once the Market data is in
    return cardHtml('Market Report', 'Population and jobs, housing permits, new businesses, spending, sales tax, rates and the construction pipeline for the region or a county.',
      'Uses ' + esc(where) + ' · <button type="button" class="lnk" data-mkchange>Change</button>', '<button type="button" class="btn" data-market="pdf">PDF</button><button type="button" class="btn" data-market="csv">CSV</button>');
  }
  // Draw an area: the next box, shape or radius finished runs the report (a banner on the map says so, with Cancel)
  const drawBtn = '<button type="button" class="btn" data-w="pick">Draw an area</button>';
  // Crime Report (Houston Police incidents)
  function crimeCard() {
    if (!ctx.crimeReportFor) return '';
    const sel = ctx.sel?.feature ? ctx.sel.label || 'the selected area' : null, sc = selCenter();
    const okSel = !sc || inHouston(sc), okView = inHouston(mapCenter()), off = ' disabled title="Street-level crime data covers the City of Houston only"';
    return cardHtml('Crime Report', 'Houston Police incidents for an area: the last 12 months against the year before, violent and property crime, monthly trend and top offenses. PDF or CSV.',
      (!okView || (sel && !okSel)) ? 'Houston only · try City / County Crime Report' : '', (sel ? '<button type="button" class="btn" data-crime="selection"' + (okSel ? '' : off) + '>Selected area</button>' : '') +
      '<button type="button" class="btn" data-crime="view"' + (okView ? '' : off) + '>Map view</button>' + drawBtn.replace('data-w="pick"', 'data-crime="pick"'));
  }
  // City / County Crime Report (FBI, any US city or county): the police department at the map center or the middle of the selection
  function crimeUSCard() {
    if (!ctx.crimeUSReportFor) return '';
    const sel = ctx.sel?.feature ? ctx.sel.label || 'the selected area' : null;
    return cardHtml('City / County Crime Report', 'Yearly FBI figures for the local police department anywhere in the US, per 100,000 residents against the state and the nation, with ten years of history. PDF or CSV.',
      sel ? '' : 'The city or county at the middle of the map', (sel ? '<button type="button" class="btn" data-crimeus="selection">Selected area</button>' : '') +
      '<button type="button" class="btn" data-crimeus="view">Map center</button>');
  }
  // the other area reports (traffic, air traffic, drive time, FEMA, environmental…): the ways to pick the area each one offers
  function areaCards() {
    const sel = ctx.sel?.feature ? ctx.sel.label || 'the selected area' : null, sc = selCenter(), mc = mapCenter();
    return (ctx.areaReports || []).filter(r => r.desc).map(r => {
      const modes = r.modes || ['selection', 'view', 'pick'], ok = c => !r.cover || !c || r.cover.test(c), okSel = ok(sc), okView = ok(mc);
      const off = ' disabled title="' + esc(r.cover?.why || '') + '"', b = (w, t, good) => '<button type="button" class="btn" data-ar="' + r.key + '" data-w="' + w + '"' + (good ? '' : off) + '>' + t + '</button>';
      const out = r.cover && ((modes.includes('view') && !okView) || (sel && modes.includes('selection') && !okSel));
      return cardHtml(r.label, r.desc, out ? esc(r.cover.short) : esc(sel ? '' : r.note || ''),
        (sel && modes.includes('selection') ? b('selection', 'Selected area', okSel) : '') + (modes.includes('view') ? b('view', 'Map view', okView) : '') + (modes.includes('pick') ? b('pick', 'Draw an area', true) : ''));
    }).join('');
  }
  // the open parcel's one-click reports (src/sitereports.js)
  function parcelGroup() {
    if (!ctx.siteReportButtons) return '';
    const t = ctx.siteReportTarget?.();
    return '<div class="rp-sec rp-group"><div class="rp-gh"><div class="lt">For the open parcel <span class="rp-n">' + esc(t ? t.label || 'Parcel' : 'none open') + '</span></div>' +
      (t ? '<span class="rp-hint">One click makes the PDF.</span>' : '<span class="rp-hint">Click a parcel on the Map, then come back here, or use the Reports block on its card.</span>') + '</div>' + ctx.siteReportButtons(t) + '</div>';
  }
  function rows() {
    const t = q.toLowerCase(), all = list.filter(r => (!kind || r.report === kind) && (!t || [r.file, kindOf(r.report), r.scope, tidyFilterText(r.filters)].join(' ').toLowerCase().includes(t)));
    if (!list.length) return '<div class="empty">No exports yet. Reports you export (from here, the Export button or the assistant) show up here so you can download them again.</div>';
    if (!all.length) return '<div class="empty">No past exports match.</div>';
    const cut = !showAll && !t && !kind && all.length > RECENT, shown = cut ? all.slice(0, RECENT) : all;
    return shown.map(r => {
      const again = REPORTS[r.report] ? '<button type="button" class="btn" data-a="re" title="Set the filters and area back to how they were for this export, then open it">Set up again</button>'
        : r.report === 'field' ? '<button type="button" class="btn" data-a="re">Open Field Notes</button>'
        : AREA_KINDS.has(r.report) && (r.geom || r.report === 'market') ? '<button type="button" class="btn" data-a="ra" title="Make this report again for the same area, with today’s data">Run again</button>' : '';
      return '<div class="rp-row" data-id="' + r.id + '"><span class="rp-ic rp-' + esc(r.format) + '">' + esc(ICON[r.format] || r.format.toUpperCase().slice(0, 4)) + '</span>' +
        '<div class="rp-m"><b>' + esc(kindOf(r.report) || 'Export') + (r.scope ? ' · ' + esc(r.scope) : '') + '</b><span>' + esc(when(r.at)) + ' · ' + esc(FORMATS[r.format] || r.format.toUpperCase()) + ' · ' + fmtBytes(r.size) +
          (r.filings != null ? ' · ' + fmtN(r.filings) + ' ' + esc(r.unit) : '') + '</span>' + (r.fallback ? '<em class="rp-warn">PDF unavailable, saved as web page</em>' : '') + (r.filters ? '<em>' + esc(tidyFilterText(r.filters)) + '</em>' : '') +
          '<i>' + esc(r.file) + (r.stored ? '' : ' · file no longer stored' + (again ? ', make a new one' : '')) + '</i></div>' +
        '<div class="rp-act">' + (r.stored ? '<button type="button" class="btn" data-a="dl">Download</button>' : '') + again +
          (r.hash ? '<button type="button" class="btn" data-a="map">Open on Map</button>' : '') + '<button type="button" class="lnk danger" data-a="rm" aria-label="Delete this export">Delete</button></div></div>'; }).join('') +
      (cut ? '<button type="button" class="lnk rp-more" id="rpMore">Show all ' + fmtN(all.length) + ' past exports</button>' : showAll && !t && !kind && all.length > RECENT ? '<button type="button" class="lnk rp-more" id="rpMore">Show only the latest ' + RECENT + '</button>' : '');
  }
  function render() {
    if (ctx.view !== 'reports') return;
    const bytes = list.reduce((s, r) => s + (r.stored ? r.size || 0 : 0), 0), n = ctx.visible.length, sel = ctx.sel?.feature ? ctx.sel.label || 'the selected area' : null;
    const past = '<div class="rp-sh"><div class="lt">' + (list.length ? 'Recent exports · ' + fmtN(list.length) : 'Past exports') + '</div>' +
        (list.length ? '<div class="vctl"><label class="search sm"><input type="search" id="rpQ" placeholder="Search past exports" value="' + esc(q) + '" aria-label="Search past exports"></label>' +
          '<select class="chip" id="rpKind" aria-label="Report type"><option value="">All types</option>' + Object.entries({ ...KINDS, ...Object.fromEntries((ctx.areaReports || []).map(x => [x.key, x.label])) }).filter(([k]) => list.some(r => r.report === k)).map(([k, l]) => '<option value="' + k + '"' + (kind === k ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>' +
          '<span>' + fmtBytes(bytes) + ' stored</span><button type="button" class="lnk" id="rpClear">Clear All</button></div>' : '') + '</div>' +
        '<div class="rp-list" id="rpList">' + rows() + '</div>';
    const mk = marketCard();
    root.innerHTML = '<div class="vhead"><div><div class="kicker">Reports</div><h2>Reports</h2><div class="vsub">Make a report for an area or from your filters, and download past exports again. Past exports stay in this browser only.</div></div>' +
        '<div class="vctl"><button type="button" class="btn primary md" id="rpNew">New report</button></div></div>' +
      parcelGroup() +
      '<div class="rp-sec rp-group"><div class="rp-gh"><div class="lt">For an area <span class="rp-n">' + esc(sel || 'the map view') + '</span></div>' +
        (sel ? '' : '<span class="rp-hint">Select an area on the Map with Box, Shape, Radius or County, use the map view, or draw one here.</span>') + '</div><div class="rp-grid">' + crimeCard() + crimeUSCard() + areaCards() + '</div></div>' +
      (mk ? '<div class="rp-sec rp-group"><div class="rp-gh"><div class="lt">Region &amp; county</div><span class="rp-hint">The Market page, for the area chosen there.</span></div><div class="rp-grid">' + mk + '</div></div>' : '') +
      '<div class="rp-sec rp-group"><div class="rp-gh"><div class="lt">From your filters <span class="rp-n">' + fmtN(n) + ' filing' + (n === 1 ? '' : 's') + '</span></div></div><div id="rpScope"></div><div class="rp-grid">' + filterCards() + '</div></div>' +
      '<div class="rp-sec rp-recent">' + past + '</div>';
    ctx.scopeBar?.(root.querySelector('#rpScope'), { count: false });
    root.querySelector('#rpNew').onclick = () => ctx.openExport();
    ctx.wireSiteReports?.(root.querySelector('.rp-group'));
    root.querySelectorAll('[data-new]').forEach(b => b.onclick = () => ctx.openExport(b.dataset.new));
    root.querySelectorAll('[data-go]').forEach(b => b.onclick = () => ctx.setView(b.dataset.go));
    root.querySelectorAll('[data-x]').forEach(b => b.onclick = async () => { const t = b.textContent; b.disabled = true; b.textContent = 'Preparing…';
      try { await ctx.exportDirect(b.dataset.x, b.dataset.f); } finally { b.disabled = false; b.textContent = t; } });
    root.querySelectorAll('[data-market]').forEach(b => b.onclick = async () => { const t = b.textContent; b.disabled = true; b.textContent = 'Preparing…';
      try { await ctx.exportMarket(b.dataset.market, undefined, { stay: true }); } finally { b.disabled = false; b.textContent = t; } });
    root.querySelector('[data-mkchange]')?.addEventListener('click', () => ctx.marketChangeArea?.());
    root.querySelectorAll('[data-crime]').forEach(b => b.onclick = () => {
      if (b.dataset.crime === 'pick') { ctx.drawAreaFor('Crime Report', () => ctx.crimeReportFor('selection')); return; }
      ctx.setView('map'); ctx.crimeReportFor(b.dataset.crime); });
    root.querySelectorAll('[data-crimeus]').forEach(b => b.onclick = () => { ctx.setView('map'); ctx.crimeUSReportFor(b.dataset.crimeus); });
    root.querySelectorAll('[data-ar]').forEach(b => b.onclick = () => {
      if (b.dataset.w === 'pick') { const rep = ctx.areaReports.find(x => x.key === b.dataset.ar); ctx.drawAreaFor(rep?.label || 'this report', () => ctx.runAreaReport(b.dataset.ar, 'selection')); return; }
      ctx.runAreaReport(b.dataset.ar, b.dataset.w); });
    const qi = root.querySelector('#rpQ'); if (qi) qi.oninput = () => { q = qi.value; root.querySelector('#rpList').innerHTML = rows(); wire(); };
    const ks = root.querySelector('#rpKind'); if (ks) ks.onchange = () => { kind = ks.value; root.querySelector('#rpList').innerHTML = rows(); wire(); };
    root.querySelector('#rpClear')?.addEventListener('click', clearAll);
    wire();
  }
  function wire() {
    root.querySelector('#rpMore')?.addEventListener('click', () => { showAll = !showAll; root.querySelector('#rpList').innerHTML = rows(); wire(); });
    root.querySelectorAll('.rp-row').forEach(el => { const r = list.find(x => x.id === el.dataset.id); if (!r) return;
      el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => ({ dl: download, re: setUpAgain, ra: runAgain, map: openOnMap, rm: remove })[b.dataset.a](r)); });
  }
  ctx.onView('reports', render); ctx.onChange(render);
  ctx.reports = { list: () => list.slice() };
}
