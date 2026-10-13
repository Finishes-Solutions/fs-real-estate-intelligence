// Reports tab: start a report (opens the Export dialog preset) and find past exports again.
// Every file the app saves (ctx.onSave) is recorded here: details in localStorage, the file itself in IndexedDB,
// all in this browser only. The newest 50 files (up to ~150 MB) are kept; older ones stay listed so they can be re-run.
import { decode } from './lib/filter.mjs';
import { pruneReports, fmtBytes } from './lib/reports.mjs';
import { REPORTS, FORMATS } from './export.js';

const KEY = 'fs-reports';
const ICON = { pdf: 'PDF', xlsx: 'XLS', csv: 'CSV', geojson: 'GEO', html: 'WEB', kml: 'KML' };
const KINDS = { ...Object.fromEntries(Object.entries(REPORTS).map(([k, r]) => [k, r.label])), crime: 'Crime Report', crimeus: 'City / County Crime Report', fema: 'FEMA Report', environmental: 'Environmental Report', market: 'Market Report', field: 'Field Notes', other: 'Other' };

export function initReports(ctx) {
  const { esc, fmtN } = ctx, root = document.getElementById('view-reports'); if (!root) return;
  const kindOf = k => KINDS[k] || (ctx.areaReports || []).find(x => x.key === k)?.label;
  let list = []; try { list = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} };
  let q = '', kind = '', showAll = false; const RECENT = 3;

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
    const field = /^field-notes/.test(filename);
    const r = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), file: filename, mime: mime || blob.type, size: blob.size, at: new Date().toISOString(),
      report: m.report || (field ? 'field' : 'other'), format: m.format || ext, filings: m.filings ?? null, unit: m.unit || 'filings', scope: m.scope || '', filters: m.filters || '', hash: m.hash || '', stored: true };
    list.unshift(r);
    putFile(r.id, blob).catch(e => { console.error('report store', e); r.stored = false; save(); render(); });
    const p = pruneReports(list); list = p.keep; p.drop.forEach(delFile); save(); render();
  });

  // ---------- actions ----------
  const apply = hash => { const p = new URLSearchParams(hash || ''); const m = p.get('m'); p.delete('v'); p.delete('f'); p.delete('m');
    ctx.fromSpec(decode(p.toString())); if (m) ctx.setMonth(m); else if (ctx.state.month) ctx.setMonth(null); };
  async function download(r) {
    const blob = await getFile(r.id).catch(() => null);
    if (!blob) { r.stored = false; save(); render(); ctx.toast('That file is no longer stored here. Re-run it to make a new copy.'); return; }
    ctx._noRecord = true; try { await ctx.saveFile(r.file, blob, r.mime); } finally { ctx._noRecord = false; }
  }
  function rerun(r) {
    if (r.report === 'field') { ctx.setView('field'); return; }
    if (!REPORTS[r.report]) return;
    if (r.hash) apply(r.hash);
    ctx.openExport(r.report, { format: r.format });
  }
  function openOnMap(r) { apply(r.hash); ctx.setView('map'); ctx.fitToVisible(); }
  function remove(r) { list = list.filter(x => x !== r); delFile(r.id); save(); render(); }
  function clearAll() { if (!list.length || !confirm('Remove all ' + list.length + ' past exports from this browser?')) return; list.forEach(r => delFile(r.id)); list = []; save(); render(); }

  // ---------- view ----------
  const when = iso => { const d = new Date(iso); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
  // one report card: name, a two-line description (the full text on hover), an optional note, then its buttons
  const cardHtml = (label, desc, note, btns) => '<div class="rp-card"><b>' + esc(label) + '</b><p title="' + esc(desc) + '">' + esc(desc) + '</p>' + (note ? '<em>' + esc(note) + '</em>' : '') + '<div class="rp-fmts">' + btns + '</div></div>';
  // "From your filters": the filing reports. The filing count is in the group heading, not on every card.
  function filterCards() {
    const areas = ctx.compare?.list().length || 0;
    return Object.entries(REPORTS).map(([k, r]) => cardHtml(r.label, r.desc, k === 'compare' ? (areas ? fmtN(areas) + ' area' + (areas === 1 ? '' : 's') + ' in Compare' : 'Add areas to Compare first') : '',
      r.formats.map(f => '<button type="button" class="btn" data-new="' + k + '" data-f="' + f + '">' + esc(FORMATS[f].replace(' (GIS)', '')) + '</button>').join(''))).join('');
  }
  // "For an area": reports about a place (the selected area or the map view, or the Market page's area)
  const areaGroupCards = () => marketCard() + crimeCard() + crimeUSCard() + areaCards();
  // Market Report: the Market view (growth, permits, businesses, jobs, spending, sales tax, crime, traffic, rates) for the
  // area chosen there, as a PDF report or the data as CSV
  function marketCard() {
    if (!ctx.exportMarket) return '';
    return cardHtml('Market Report', 'The Market view for the region or one county: population and jobs, housing permits, new businesses, consumer spending, city sales tax, Houston crime, the busiest roads and rates.',
      'Uses the area chosen on the Market page', '<button type="button" class="btn" data-market="pdf">PDF</button><button type="button" class="btn" data-market="csv">CSV</button>');
  }
  // Crime Report (Houston Police incidents): for the selected area or the map view; opens in the card on the map, and
  // its PDF / CSV exports land in Recent exports
  function crimeCard() {
    if (!ctx.crimeReportFor) return '';
    const sel = ctx.sel?.feature ? ctx.sel.label || 'the selected area' : null;
    return cardHtml('Crime Report', 'Houston Police incidents for an area: the last 12 months against the year before, violent and property crime, a monthly trend, top offenses and where they happened. Export as a PDF report or CSV.',
      'City of Houston only', (sel ? '<button type="button" class="btn" data-crime="selection">Selected area</button>' : '') +
      '<button type="button" class="btn" data-crime="view">Map view</button><button type="button" class="btn" data-crime="pick">Draw an area</button>');
  }
  // City / County Crime Report (FBI, any US city or county): the police department at the map center or the middle of the selection
  function crimeUSCard() {
    if (!ctx.crimeUSReportFor) return '';
    const sel = ctx.sel?.feature ? ctx.sel.label || 'the selected area' : null;
    return cardHtml('City / County Crime Report', 'Yearly FBI figures for the local police department anywhere in the US: violent and property crime per 100,000 residents against the state and the nation, ten years of history and the mix of offenses. Export as a PDF report or CSV.',
      sel ? '' : 'The city or county at the middle of the map', (sel ? '<button type="button" class="btn" data-crimeus="selection">Selected area</button>' : '') +
      '<button type="button" class="btn" data-crimeus="view">Map center</button>');
  }
  // the other area reports (drive time, traffic, air traffic…): same three ways to pick the area as the crime report
  function areaCards() {
    const sel = ctx.sel?.feature ? ctx.sel.label || 'the selected area' : null;
    return (ctx.areaReports || []).filter(r => r.desc).map(r => cardHtml(r.label, r.desc, sel ? '' : r.note || '',
      (sel ? '<button type="button" class="btn" data-ar="' + r.key + '" data-w="selection">Selected area</button>' : '') + '<button type="button" class="btn" data-ar="' + r.key + '" data-w="view">Map view</button><button type="button" class="btn" data-ar="' + r.key + '" data-w="pick">Draw an area</button>')).join('');
  }
  function rows() {
    const t = q.toLowerCase(), all = list.filter(r => (!kind || r.report === kind) && (!t || [r.file, kindOf(r.report), r.scope, r.filters].join(' ').toLowerCase().includes(t)));
    if (!list.length) return '<div class="empty">No exports yet. Reports you export (from here, the Export button or the assistant) show up here so you can download them again or re-run them with today’s data.</div>';
    if (!all.length) return '<div class="empty">No past exports match.</div>';
    const cut = !showAll && !t && !kind && all.length > RECENT, shown = cut ? all.slice(0, RECENT) : all;
    return shown.map(r => '<div class="rp-row" data-id="' + r.id + '"><span class="rp-ic rp-' + esc(r.format) + '">' + esc(ICON[r.format] || r.format.toUpperCase().slice(0, 4)) + '</span>' +
      '<div class="rp-m"><b>' + esc(kindOf(r.report) || 'Export') + (r.scope ? ' · ' + esc(r.scope) : '') + '</b><span>' + esc(when(r.at)) + ' · ' + esc(FORMATS[r.format] || r.format.toUpperCase()) + ' · ' + fmtBytes(r.size) +
        (r.filings != null ? ' · ' + fmtN(r.filings) + ' ' + esc(r.unit) : '') + '</span>' + (r.filters ? '<em>' + esc(r.filters) + '</em>' : '') + '<i>' + esc(r.file) + (r.stored ? '' : ' · file no longer stored, re-run to regenerate') + '</i></div>' +
      '<div class="rp-act">' + (r.stored ? '<button type="button" class="btn" data-a="dl">Download</button>' : '') + (REPORTS[r.report] || r.report === 'field' ? '<button type="button" class="btn" data-a="re" title="Same report and filters, with today’s data">Re-run</button>' : '') +
        (r.hash ? '<button type="button" class="btn" data-a="map">Open on Map</button>' : '') + '<button type="button" class="lnk" data-a="rm" aria-label="Delete this export">Delete</button></div></div>').join('') +
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
    root.innerHTML = '<div class="vhead"><div><div class="kicker">Reports</div><h2>Reports</h2><div class="vsub">Make a report from your filters or for an area, and download past exports again. Past exports stay in this browser only.</div></div>' +
        '<div class="vctl"><button type="button" class="btn primary md" id="rpNew">New report</button></div></div>' +
      (list.length ? '<div class="rp-sec rp-recent">' + past + '</div>' : '') +
      '<div class="rp-sec rp-group"><div class="rp-gh"><div class="lt">From your filters <span class="rp-n">' + fmtN(n) + ' filing' + (n === 1 ? '' : 's') + '</span></div></div><div id="rpScope"></div><div class="rp-grid">' + filterCards() + '</div></div>' +
      '<div class="rp-sec rp-group"><div class="rp-gh"><div class="lt">For an area <span class="rp-n">' + esc(sel || 'the map view') + '</span></div>' +
        (sel ? '' : '<span class="rp-hint">Select an area on the Map with Area, Shape, Radius or County, or use the map view.</span>') + '</div><div class="rp-grid">' + areaGroupCards() + '</div></div>' +
      (list.length ? '' : '<div class="rp-sec rp-recent">' + past + '</div>');
    ctx.scopeBar?.(root.querySelector('#rpScope'), { count: false });
    root.querySelector('#rpNew').onclick = () => ctx.openExport();
    root.querySelectorAll('[data-new]').forEach(b => b.onclick = () => ctx.openExport(b.dataset.new, { format: b.dataset.f }));
    root.querySelectorAll('[data-market]').forEach(b => b.onclick = () => ctx.exportMarket(b.dataset.market));
    root.querySelectorAll('[data-crime]').forEach(b => b.onclick = () => { ctx.setView('map');
      if (b.dataset.crime === 'pick') { ctx.setMode?.('area'); ctx.toast?.('Drag a box on the map, then open Reports → Crime Report → Selected area.'); return; }
      ctx.crimeReportFor(b.dataset.crime); });
    root.querySelectorAll('[data-crimeus]').forEach(b => b.onclick = () => { ctx.setView('map'); ctx.crimeUSReportFor(b.dataset.crimeus); });
    root.querySelectorAll('[data-ar]').forEach(b => b.onclick = () => { ctx.setView('map');
      if (b.dataset.w === 'pick') { ctx.setMode?.('area'); ctx.toast?.('Drag a box on the map, then use the ' + (ctx.areaReports.find(x => x.key === b.dataset.ar)?.label || 'report') + ' button on the selection bar.'); return; }
      ctx.runAreaReport(b.dataset.ar, b.dataset.w); });
    const qi = root.querySelector('#rpQ'); if (qi) qi.oninput = () => { q = qi.value; root.querySelector('#rpList').innerHTML = rows(); wire(); };
    const ks = root.querySelector('#rpKind'); if (ks) ks.onchange = () => { kind = ks.value; root.querySelector('#rpList').innerHTML = rows(); wire(); };
    root.querySelector('#rpClear')?.addEventListener('click', clearAll);
    wire();
  }
  function wire() {
    root.querySelector('#rpMore')?.addEventListener('click', () => { showAll = !showAll; root.querySelector('#rpList').innerHTML = rows(); wire(); });
    root.querySelectorAll('.rp-row').forEach(el => { const r = list.find(x => x.id === el.dataset.id); if (!r) return;
      el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => ({ dl: download, re: rerun, map: openOnMap, rm: remove })[b.dataset.a](r)); });
  }
  ctx.onView('reports', render); ctx.onChange(render);
  ctx.reports = { list: () => list.slice() };
}
