// Export dialog (green Export button next to the map tools): pick a report, which filings, and a format.
// PDFs (and the summary's web page) use the shared Finishes Solutions report layout (reportkit.js), rendered to PDF on the
// server: portrait, except the full filing list (and a comparison of four or more areas), which need landscape.
// Excel uses SheetJS (already on the page).
import { BY_KEY, DEFAULT_KPIS } from './metrics.js';
import { contains as inArea } from './lib/geomatch.mjs';
import { reportDoc, savePdf, saveHtml, areaMap } from './reportkit.js';

export const REPORTS = {
  summary: { label: 'Summary Report', desc: 'Headline metrics, map, breakdowns by county, type and use, largest projects.', formats: ['pdf', 'xlsx', 'html'] },
  list: { label: 'Filing List', desc: 'Every filing with address, value, owner, developer, schedule and status.', formats: ['pdf', 'xlsx', 'csv', 'geojson'] },
  compare: { label: 'Area Comparison', desc: 'The areas in Compare side by side, with the largest projects in each.', formats: ['pdf', 'xlsx', 'csv'] },
  activity: { label: 'Activity Report', desc: 'Most active developers, architects and general contractors.', formats: ['pdf', 'xlsx', 'csv'] }
};
export const FORMATS = { pdf: 'PDF', xlsx: 'Excel', csv: 'CSV', geojson: 'GeoJSON (GIS)', html: 'Web Page' };

export function initExport(ctx) {
  const { esc, fmtM, fmtN } = ctx;
  const dlg = document.createElement('div'); dlg.className = 'xdlg'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'xTitle');
  document.body.appendChild(dlg);
  let st = { report: 'summary', scope: 'filters', format: 'pdf', map: true, scope_text: false, ai: true, full: false };
  // only the format is remembered between visits; the report, the filings (always "From your filters" to start) and the options start fresh
  try { const j = JSON.parse(localStorage.getItem('fs-export') || '{}'); if (FORMATS[j.format]) st.format = j.format; } catch (e) {}
  const save = () => { try { localStorage.setItem('fs-export', JSON.stringify({ format: st.format })); } catch (e) {} };

  const inView = () => { const b = ctx.map.getBounds(); return ctx.visible.filter(f => f.lon >= b.getWest() && f.lon <= b.getEast() && f.lat >= b.getSouth() && f.lat <= b.getNorth()); };
  const highlighted = () => ctx.highlighted().map(id => ctx.BY_ID.get(id)).filter(Boolean);
  // "Only what's on the map now" depends on where the map happens to be, so it isn't offered from the Reports page
  const scopes = () => [['filters', 'From your filters', ctx.visible.length], ...(ctx.view === 'reports' ? [] : [['view', 'Only What’s on the Map Now', inView().length]]), ['highlight', 'Highlighted Filings', highlighted().length]];
  const listFor = s => s === 'view' ? inView() : s === 'highlight' ? highlighted() : ctx.visible;

  function render() {
    const R = REPORTS[st.report], cmp = ctx.compare?.list() || [];
    if (!R.formats.includes(st.format)) st.format = R.formats[0];
    if (st.scope !== 'filters' && !scopes().find(x => x[0] === st.scope)?.[2]) st.scope = 'filters';
    const af = document.activeElement, keep = af && dlg.contains(af) ? (af.id ? '#' + af.id : af.name ? '[name="' + af.name + '"][value="' + af.value + '"]' : af.dataset?.f ? '.xfmt [data-f="' + af.dataset.f + '"]' : af.dataset?.k ? '[data-k="' + af.dataset.k + '"]' : '') : '';
    const n = st.report === 'compare' ? cmp.length : listFor(st.scope).length;
    const blocked = st.report === 'compare' ? (cmp.length ? '' : 'Add areas to Compare first (select an area on the map, then “+ Compare”).') : n ? '' : 'No filings match. Change the filters or pick other filings.';
    dlg.innerHTML = '<div class="xbox"><div class="xh"><div><div class="kicker">Reports &amp; data</div><h2 id="xTitle">New report</h2></div><button class="x" id="xClose" aria-label="Close">×</button></div>' +
      '<div class="xsec"><div class="lt">Report</div><div class="xreports">' + Object.entries(REPORTS).map(([k, r]) =>
        '<label class="xr' + (st.report === k ? ' on' : '') + '"><input type="radio" name="xrep" value="' + k + '"' + (st.report === k ? ' checked' : '') + '><b>' + r.label + (k === 'compare' ? ' <span class="n">' + cmp.length + ' area' + (cmp.length === 1 ? '' : 's') + '</span>' : '') + '</b><span>' + r.desc + '</span></label>').join('') + '</div></div>' +
      (st.report === 'compare' ? '' : '<div class="xsec"><div class="lt">Filings</div><div class="xscopes">' + scopes().map(([k, l, c]) =>
        '<label class="xs' + (c ? '' : ' dis') + '"><input type="radio" name="xscope" value="' + k + '"' + (st.scope === k ? ' checked' : '') + (c ? '' : ' disabled') + '><span>' + l + '</span><b>' + fmtN(c) + '</b></label>').join('') + '</div>' +
        (ctx.filterText() || ctx.sel.feature ? '<div class="xnote">' + esc([ctx.sel.feature ? ctx.sel.label : '', ctx.filterText()].filter(Boolean).join(' · ')) + '</div>' : '') + '</div>') +
      '<div class="xsec"><div class="lt">Format</div><div class="seg xfmt">' + R.formats.map(f => '<button type="button" data-f="' + f + '" aria-pressed="' + (st.format === f) + '">' + FORMATS[f] + '</button>').join('') + '</div></div>' +
      '<div class="xsec xopts">' + opt('map', 'Include the Map', /^(pdf|html)$/.test(st.format) && st.report === 'summary') + opt('full', 'Add the Full Filing List', /^(pdf|html)$/.test(st.format) && st.report === 'summary') +
        opt('scope_text', 'Include Scope of Work Text', st.report === 'list') + opt('ai', 'Include AI Summaries and Tags', st.report === 'list' && st.format !== 'pdf') + '</div>' +
      '<div class="xf"><span class="xmsg">' + esc(blocked || (st.format === 'pdf' && ((st.report === 'list' && n > 2000) || (st.report === 'summary' && st.full && n > 1000)) ? 'The PDF lists the ' + (st.report === 'list' ? '2,000' : '1,000') + ' largest of ' + fmtN(n) + ' filings. Excel and CSV have all of them.' : '')) + '</span><button class="btn" id="xCancel">Cancel</button><button class="btn primary xgo" id="xGo"' + (blocked ? ' disabled' : '') + '>Export ' + FORMATS[st.format] + '</button></div>' +
      (ctx.view === 'reports' ? '' : '<div class="xmore"><button type="button" class="lnk" id="xMore">More reports (traffic, flood, drive time, market) and past exports → Reports</button></div>') + '</div>';
    dlg.querySelector('#xClose').onclick = dlg.querySelector('#xCancel').onclick = close;
    dlg.querySelectorAll('[name=xrep]').forEach(i => i.onchange = () => { st.report = i.value; save(); render(); });
    dlg.querySelectorAll('[name=xscope]').forEach(i => i.onchange = () => { st.scope = i.value; save(); render(); });
    dlg.querySelectorAll('.xfmt button').forEach(b => b.onclick = () => { st.format = b.dataset.f; save(); render(); });
    dlg.querySelectorAll('.xopts input').forEach(i => i.onchange = () => { st[i.dataset.k] = i.checked; save(); });
    dlg.querySelector('#xGo').onclick = go;
    dlg.querySelector('#xMore')?.addEventListener('click', () => { dlg.classList.remove('on'); dropToast(); lastFocus = null; ctx.setView('reports'); });
    if (keep) (dlg.querySelector(keep + ':not([disabled])') || dlg.querySelector('#xClose'))?.focus(); // a re-draw must not drop the keyboard out of the dialog (a control that's now disabled: Close)
  }
  const opt = (k, label, show) => show ? '<label class="tg2"><input type="checkbox" data-k="' + k + '"' + (st[k] ? ' checked' : '') + '><span>' + label + '</span></label>' : '';
  let lastFocus = null;
  // open(report, { format, scope }): the Reports tab and the assistant's cards open it preset
  function open(report, o = {}) { if (report && REPORTS[report]) st.report = report; if (o.format && REPORTS[st.report].formats.includes(o.format)) st.format = o.format; st.scope = o.scope || 'filters'; lastFocus = document.activeElement; render(); dlg.classList.add('on'); liftToast();
    // focus lands on Export, or (nothing to export) on the first report choice, so Tab never starts behind the dialog
    setTimeout(() => (dlg.querySelector('#xGo:not([disabled])') || dlg.querySelector('[name=xrep]:checked') || dlg.querySelector('[name=xrep]') || dlg.querySelector('#xClose'))?.focus(), 30); }
  // the note with Undo ("Filters and area set to match this export") lives in the map stage, which sits under the dialog: while the dialog is open it moves to the page body so the button can be clicked
  let toastHome = null; const toastEl = () => document.getElementById('toast');
  const liftToast = () => { const t = toastEl(); if (t && t.parentNode !== document.body) { toastHome = [t.parentNode, t.nextSibling]; document.body.append(t); } };
  const dropToast = () => { const t = toastEl(); if (toastHome?.[0]?.isConnected && t?.parentNode === document.body) toastHome[0].insertBefore(t, toastHome[1]?.parentNode === toastHome[0] ? toastHome[1] : null); toastHome = null; };
  function close() { if (!dlg.classList.contains('on')) return; dlg.classList.remove('on'); dropToast(); if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true }); lastFocus = null; }
  dlg.addEventListener('pointerdown', e => { if (e.target === dlg) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && dlg.classList.contains('on')) { e.preventDefault(); close(); } });
  // Tab stays inside the dialog: from the last control it wraps to the first, and from the first (Shift+Tab) to the last
  dlg.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !dlg.classList.contains('on')) return;
    const f = [...dlg.querySelectorAll('.xbox button, .xbox input, .xbox select, .xbox [href], .xbox [tabindex]')].filter(x => !x.disabled && x.tabIndex >= 0 && x.getClientRects().length && !(x.type === 'radio' && !x.checked && dlg.querySelector('[name="' + x.name + '"]:checked')));
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1], at = document.activeElement;
    if (!dlg.contains(at)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
  });
  document.getElementById('exportBtn').onclick = () => open();
  ctx.openExport = open; ctx.closeExport = close;

  // the Export button: run it, then close the dialog
  async function go() {
    const btn = dlg.querySelector('#xGo'); btn.disabled = true; btn.textContent = 'Preparing…';
    try { await perform(); close(); } catch (e) { console.error(e); ctx.toast('Export failed. Try again in a minute.'); }
    finally { ctx.exportMeta = null; if (dlg.classList.contains('on')) render(); }
  }
  // one export with the current settings (st): what the dialog's button and the Reports page's PDF / Excel / CSV buttons do
  async function perform() {
    const list = listFor(st.scope).slice().sort((a, b) => b.cost - a.cost);
    const label = st.scope === 'highlight' ? 'Highlighted Filings' : st.scope === 'view' ? 'Map view' : ctx.scopeLabel();
    const names = st.report === 'compare' ? compareNames() : '';
    const name = ctx.fileBase(st.report, st.report === 'compare' ? names : label);
    // what the Reports tab records with the file. A comparison is recorded by the areas in it ("Harris vs Waller"), without the filing
    // filters; the others by what was exported, with the filters, selection and (map view / highlighted) so "Set up again" can restore them
    const b = st.scope === 'view' ? ctx.map.getBounds() : null;
    ctx.exportMeta = { report: st.report, reportLabel: REPORTS[st.report].label, format: st.format, filings: st.report === 'compare' ? (ctx.compare?.list() || []).length : list.length,
      unit: st.report === 'compare' ? 'areas' : 'filings', scope: st.report === 'compare' ? names : label, filters: st.report === 'compare' ? '' : ctx.filterText(), hash: st.report === 'compare' ? '' : ctx.hashStr(),
      ...(st.report === 'compare' ? {} : { pick: st.scope, ...(b ? { view: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(v => +v.toFixed(4)) } : {}), ...(st.scope === 'highlight' ? { ids: ctx.highlighted().slice(0, 400) } : {}) }) };
    if (st.report === 'summary') {
      if (st.format === 'pdf') await pdf('summary', label, summaryDoc(list, label), name);
      else if (st.format === 'xlsx') ctx.exportXlsx([{ name: 'Summary', aoa: ctx.summaryAoa(list, label) }, { name: 'Filings', rows: rows(list) }], name);
      else await saveHtml(ctx, 'summary', label, summaryDoc(list, label), meta());
    } else if (st.report === 'list') {
      if (st.format === 'pdf') await pdf('list', label, listDoc(list, label), name, true);
      else if (st.format === 'xlsx') ctx.exportXlsx([{ name: 'Filings', rows: rows(list) }, { name: 'Summary', aoa: ctx.summaryAoa(list, label) }], name);
      else if (st.format === 'csv') ctx.exportCsv(rows(list), name);
      else ctx.exportGeoJSON(list, name);
    } else if (st.report === 'compare') {
      await compareOut(st.format, name);
    } else {
      const groups = activity(list);
      if (st.format === 'pdf') await pdf('activity', label, activityDoc(groups, list, label), name);
      else { const flat = groups.flatMap(g => g.rows.map(r => ({ Role: g.label, Name: r.label, Projects: r.n, 'Est. value (USD)': +r.v.toFixed(2), 'New builds': r.nw, 'Mostly': r.use, 'Counties': r.cos, 'Latest filing': r.last })));
        if (st.format === 'xlsx') ctx.exportXlsx(groups.map(g => ({ name: g.label, rows: g.rows.map(r => ({ Name: r.label, Projects: r.n, 'Est. value (USD)': +r.v.toFixed(2), 'New builds': r.nw, Mostly: r.use, Counties: r.cos, 'Latest filing': r.last })) })).filter(s => s.rows.length), name);
        else ctx.exportCsv(flat, name); }
    }
  }
  // the Reports page's PDF / Excel / CSV buttons: straight to the file with the current filters (Customize… opens the dialog)
  ctx.exportDirect = async (report, format) => {
    if (!REPORTS[report]?.formats.includes(format)) return false;
    if (report === 'compare' ? !(ctx.compare?.list() || []).length : !ctx.visible.length) { ctx.toast(report === 'compare' ? 'Add areas to Compare first.' : 'No filings match. Change the filters first.'); return false; }
    const keep = st; st = { ...st, report, format, scope: 'filters' };
    try { await perform(); return true; } catch (e) { console.error(e); ctx.toast('Export failed. Try again in a minute.'); return false; }
    finally { st = keep; ctx.exportMeta = null; }
  };
  const rows = list => ctx.rowsFor(list).map(r => { const o = { ...r }; if (!st.scope_text) delete o.Scope; if (!st.ai) { delete o['AI summary']; delete o.Use; delete o.Subtype; delete o.Tenant; delete o.Developer; } return o; });

  // ---------- data for reports ----------
  // the Compare page's table (census numbers, then the filings), as rows for each format. Excel and CSV hold raw numbers
  // (units in the row names) under a line saying which filters applied; the PDF shows the page's text.
  async function compareTable() {
    const M = await ctx.compare.model(), head = ['Metric', ...M.areas.map(a => a.label)], flat = [];
    for (const sec of M.sections) { flat.push({ section: sec.title }); for (const r of sec.rows) flat.push({ label: r.label, unit: r.unit, cells: r.cells }); }
    return { areas: M.areas, lists: M.lists, head, flat, note: M.note, filters: ctx.filterText() || 'None' };
  }
  async function compareOut(format, name) {
    const t = await compareTable(), raw = r => r.cells.map(c => c.v == null ? '' : c.v), nm = r => r.label + (r.unit ? ' (' + r.unit + ')' : '');
    const pre = [['Area comparison'], ['Filing filters', t.filters], ['Census numbers are for the tracts centred in each area; filing numbers follow the filters above.']];
    if (format === 'pdf') await pdf('compare', 'areas', compareDoc(t), name, t.areas.length > 3);
    else if (format === 'xlsx') ctx.exportXlsx([{ name: 'Comparison', aoa: [...pre, [], t.head, ...t.flat.map(r => r.section ? [r.section] : [nm(r), ...raw(r)])] }, ...t.areas.map((a, i) => ({ name: (i + 1) + ' ' + a.label.replace(/[\\/?*[\]:]/g, ' '), rows: ctx.rowsFor(t.lists[i]) })).filter(s => s.rows.length)], name);
    else ctx.exportCsv(t.flat.filter(r => !r.section).map(r => Object.fromEntries(t.head.map((h, i) => [h, i ? raw(r)[i - 1] : nm(r)]))), name, pre.slice(1, 2));
  }
  // the Compare page's Export menu: straight to a file in the chosen format
  const compareNames = () => (ctx.compare?.list() || []).map(a => a.label).join(' vs ') || 'areas';
  ctx.exportCompare = async format => {
    const n = (ctx.compare?.list() || []).length; if (!n) { ctx.toast('Add areas to Compare first.'); return; }
    try {
      ctx.exportMeta = { report: 'compare', reportLabel: REPORTS.compare.label, format, filings: n, unit: 'areas', scope: compareNames(), filters: '', hash: '' };
      await compareOut(format, ctx.fileBase('compare', compareNames()));
    } catch (e) { console.error(e); ctx.toast('Export failed. Try again in a minute.'); } finally { ctx.exportMeta = null; }
  };
  function activity(list) {
    const roles = [['dev', 'Developers & owners', f => f.dev || f.owner], ['arch', 'Architects & designers', f => f.arch], ['gc', 'General contractors', f => f.gc]];
    return roles.map(([k, label, get]) => {
      const m = new Map();
      for (const f of list) { const raw = get(f), key = ctx.entityKey(raw); if (!key) continue;
        let g = m.get(key); if (!g) m.set(key, g = { names: {}, n: 0, v: 0, nw: 0, uses: {}, cos: {}, last: '' });
        g.names[raw] = (g.names[raw] || 0) + 1; g.n++; g.v += f.cost; if (f.type === 'New') g.nw++; const u = f.use || ctx.TYPE_LABEL[f.type]; g.uses[u] = (g.uses[u] || 0) + f.cost; g.cos[f.county] = (g.cos[f.county] || 0) + 1; if ((f.reg || '') > g.last) g.last = f.reg; }
      const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
      return { k, label, rows: [...m.values()].map(g => ({ label: top(g.names)[0][0], n: g.n, v: g.v, nw: g.nw, use: top(g.uses)[0]?.[0] || '', cos: top(g.cos).slice(0, 2).map(x => x[0]).join(', '), last: g.last })).sort((a, b) => b.v - a.v).slice(0, 200) };
    });
  }

  // ---------- PDF and web page: the shared report layout ----------
  const meta = () => { const m = { ...(ctx.exportMeta || {}) }; delete m.format; return m; };
  const pdf = (kind, label, html, name, landscape = false) => savePdf(ctx, kind, label, html, { landscape, name, meta: meta() });
  const tabs = id => 'https://www.tdlr.texas.gov/TABS/Projects/' + encodeURIComponent(id);
  const money = v => '$' + Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const metaLine = () => ['TDLR TABS registrations ' + ctx.PERIOD, ctx.filterText() ? 'Filters: ' + ctx.filterText() : ''].filter(Boolean).map(esc).join(' · ');
  const SOURCES = 'Texas Department of Licensing and Regulation (TDLR), TABS project registrations. Costs and dates are the filers’ estimates; uses, tenants and developers are AI-tagged from the filings.';
  const doc = (kicker, title, body, o = {}) => reportDoc({ kicker: 'Construction filings · ' + kicker, title, meta: metaLine(), body, sources: o.sources || SOURCES, landscape: o.landscape, css: o.css || '' });
  // the KPI tiles chosen above the map (up to 4 a row)
  function kpis(list) {
    const keys = (ctx.kpiKeys?.() || DEFAULT_KPIS).filter(k => BY_KEY.has(k)), n = keys.length, per = n <= 4 ? n : (-n % 3 + 3) % 3 < (-n % 4 + 4) % 4 ? 3 : 4, rows = []; // 9 tiles: 3 rows of 3, not 4 + 4 + 1
    for (let i = 0; i < keys.length; i += per) rows.push(keys.slice(i, i + per));
    return rows.map((r, j) => '<div class="kp" style="grid-template-columns:repeat(' + per + ',1fr)' + (j ? ';margin-top:8px' : '') + '">' + r.map(k => { const m = BY_KEY.get(k);
      return '<div><b' + (m.text ? ' style="font-size:11px"' : '') + '>' + esc(String(m.fmt(m.fn(list)))) + '</b><span>' + esc(m.label) + '</span></div>'; }).join('') + '</div>').join('');
  }
  const tbl = (head, body, right = []) => '<table><thead><tr>' + head.map((h, i) => '<th' + (right.includes(i) ? ' class="r"' : '') + '>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
    body.map(r => '<tr>' + r.map((c, i) => '<td' + (right.includes(i) ? ' class="m r"' : '') + '>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  function breakdown(list, key, label, n = 14) {
    const m = new Map(), tot = list.reduce((s, f) => s + f.cost, 0) || 1;
    list.forEach(f => { const k = key(f) || 'Unclassified', g = m.get(k) || [k, 0, 0, 0]; g[1]++; g[2] += f.cost; if (f.type === 'New') g[3]++; m.set(k, g); });
    return tbl([label, 'Filings', 'Est. value', 'Share', 'New'], [...m.values()].sort((a, b) => b[2] - a[2]).slice(0, n).map(g => [esc(g[0]), fmtN(g[1]), fmtM(g[2]), Math.round(g[2] / tot * 100) + '%', fmtN(g[3])]), [1, 2, 3, 4]);
  }
  const project = f => '<a href="' + tabs(f.id) + '">' + esc(f.name) + '</a>';
  const radius = () => ctx.sel?.kind === 'radius';
  // every filing: wide (landscape, every column, scope text optional) or narrow (portrait, folded into fewer columns)
  function listTable(list, wide, withScope) {
    if (wide) return tbl(['#', 'Registered', 'Project', 'County', 'Type / use', 'Est. value', 'Sq ft', 'Owner / developer', 'Status', 'Schedule'], list.map((f, i) => [
      '<span class="m">' + (i + 1) + '</span>', '<span class="m">' + esc(f.reg || '') + '</span>',
      project(f) + '<div class="sc">' + esc(f.addr || f.city || '') + (radius() && f._d != null ? ' · ' + f._d.toFixed(1) + ' mi from center' : '') + (f.approx ? ' · approx. location' : '') + '</div>' + (withScope && f.scope ? '<div class="sc">' + esc(f.scope.slice(0, 600)) + '</div>' : ''),
      esc(f.county), esc(ctx.TYPE_LABEL[f.type]) + (f.use ? '<div class="sc">' + esc(f.use) + '</div>' : ''), money(f.cost), f.sqft ? fmtN(f.sqft) : '–',
      esc(f.owner || '–') + (f.dev && f.dev !== f.owner ? '<div class="sc">' + esc(f.dev) + '</div>' : ''), esc(f.status || '–'), '<span class="m">' + esc((f.start || '?') + ' → ' + (f.end || '?')) + '</span>']), [5, 6]);
    return tbl(['#', 'Project', 'Est. value', 'Owner / developer', 'Status'], list.map((f, i) => [
      '<span class="m">' + (i + 1) + '</span>',
      project(f) + '<div class="sc">' + esc([f.addr || f.city, f.county + ' County', ctx.TYPE_LABEL[f.type] + (f.use ? ' · ' + f.use : ''), f.reg ? 'registered ' + f.reg : ''].filter(Boolean).join(' · ')) + '</div>',
      money(f.cost) + (f.sqft ? '<div class="sc">' + fmtN(f.sqft) + ' sq ft</div>' : ''), esc(f.owner || '–') + (f.dev && f.dev !== f.owner ? '<div class="sc">' + esc(f.dev) + '</div>' : ''),
      esc(f.status || '–') + (f.start || f.end ? '<div class="sc">' + esc((f.start || '?') + ' → ' + (f.end || '?')) + '</div>' : '')]), [2]);
  }
  // a PDF table of every filing gets slow and huge (10,000 filings is ~1,000 pages):
  // the PDF lists the largest LIST_MAX and says so; Excel and CSV always have all of them
  const LIST_MAX = 2000;
  const capped = (list, title, max = LIST_MAX) => '<h2>' + title + ' (' + fmtN(list.length) + ')</h2>' + (list.length > max ? '<p class="rnote">The ' + fmtN(max) + ' largest by estimated value are listed here. Export Excel or CSV for all ' + fmtN(list.length) + '.</p>' : '');
  const LEGEND = '<div class="lg"><span><i style="background:#006527"></i>New construction</span><span><i style="background:#6b7174"></i>Renovation</span><span><i style="border:1.5px solid #1f9249"></i>Addition or approximate location</span><span>Marker size = est. value</span></div>';
  function summaryDoc(list, label) {
    const uses = list.some(f => f.use);
    return doc('Summary report', label, kpis(list) +
      (st.map ? '<div class="map">' + ctx.reportMap(list) + '</div>' + LEGEND : '') +
      '<div class="two"><div><h2>By county</h2>' + breakdown(list, f => f.county, 'County') + '<h2>By type</h2>' + breakdown(list, f => ctx.TYPE_LABEL[f.type], 'Type') + '</div>' +
      '<div><h2>Largest filings</h2>' + tbl(['Project', 'City', 'Est. value'], list.slice(0, 12).map(f => [project(f) + '<div class="sc">' + esc(ctx.TYPE_LABEL[f.type] + (f.use ? ' · ' + f.use : '') + (f.sqft ? ' · ' + fmtN(f.sqft) + ' sq ft' : '')) + '</div>', esc(f.city || f.county), money(f.cost)]), [2]) + '</div></div>' +
      (uses ? '<h2>By use (AI-tagged)</h2>' + breakdown(list, f => f.use, 'Use') : '') +
      (st.full ? '<div class="full">' + capped(list, 'All filings', LIST_MAX / 2) + listTable(list.slice(0, LIST_MAX / 2), false) + '</div>' : ''));
  }
  const listDoc = (list, label) => doc('Filing list', label, kpis(list) + capped(list, 'Filings') + listTable(list.slice(0, LIST_MAX), true, st.scope_text), { landscape: true });
  // every area in Compare on one street map, in its compare colour
  function compareMap() {
    const list = (ctx.compare?.list() || []).filter(a => a.geom); if (!list.length) return '';
    return '<div class="map">' + areaMap(list.map((a, i) => ({ geometry: a.geom, stroke: ctx.compare.colorOf(i), fill: 'rgba(0,0,0,.03)', width: 2.2 })), { W: 1000, H: 420 }) + '</div>' +
      '<div class="lg">' + list.map((a, i) => '<span><i style="background:' + ctx.compare.colorOf(i) + '"></i>' + (i + 1) + '. ' + esc(a.label) + '</span>').join('') + '</div>';
  }
  function compareDoc(t) {
    const n = t.areas.length, cols = Math.min(n, n > 3 ? 4 : 3), blank = t.areas.map(() => '');
    const rows = t.flat.map(r => r.section ? ['<b>' + esc(r.section) + '</b>', ...blank] : [esc(r.label), ...r.cells.map(c => '<span class="m">' + esc(c.t) + '</span>')]);
    return doc('Area comparison', t.areas.map(a => a.label).join(' vs. '),
      compareMap() + '<h2>Side by side</h2>' + tbl(t.head, rows, t.areas.map((a, i) => i + 1)) + (t.note ? '<p class="rnote">' + esc(t.note) + ' Filing numbers follow your filters, so they can differ from the Market page.</p>' : '') +
      '<h2>Largest filings in each area</h2><div style="display:grid;grid-template-columns:repeat(' + cols + ',1fr);gap:16px">' + t.areas.map((a, i) => '<div><h3>' + esc(a.label) + '</h3>' +
        tbl(['Project', 'Est. value'], t.lists[i].slice().sort((x, y) => y.cost - x.cost).slice(0, 12).map(f => [project(f) + '<div class="sc">' + esc(f.city || f.county) + '</div>', money(f.cost)]), [1]) + '</div>').join('') + '</div>',
      { landscape: n > 3, sources: SOURCES + ' Census numbers: US Census ACS 5-year and LEHD LODES.' });
  }
  const activityDoc = (groups, list, label) => doc('Activity report', label, kpis(list) + groups.filter(g => g.rows.length).map((g, i) => '<div' + (i ? ' class="full"' : '') + '><h2>' + esc(g.label) + '</h2>' +
    tbl(['#', 'Name', 'Projects', 'Est. value', 'New', 'Mostly', 'Where', 'Latest'], g.rows.slice(0, 40).map((r, j) => ['<span class="m">' + (j + 1) + '</span>', '<b>' + esc(r.label) + '</b>', fmtN(r.n), money(r.v), fmtN(r.nw), esc(r.use), esc(r.cos), '<span class="m">' + esc(r.last) + '</span>']), [2, 3, 4]) + '</div>').join(''),
    { sources: 'Grouped by name as filed (or the developer the AI identified), with LLC and Inc. variants merged. ' + SOURCES });
}
