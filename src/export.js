// Export dialog (green Export button next to the map tools): pick a report, which filings, and a format.
// PDFs (and the summary's web page) use the shared Finishes Solutions report layout (reportkit.js), rendered to PDF on the
// server: portrait, except the full filing list (and a comparison of four or more areas), which need landscape.
// Excel uses SheetJS (already on the page).
import { BY_KEY, DEFAULT_KPIS } from './metrics.js';
import { contains as inArea } from './lib/geomatch.mjs';
import { reportDoc, savePdf, saveHtml } from './reportkit.js';

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
  try { st = { ...st, ...JSON.parse(localStorage.getItem('fs-export') || '{}') }; } catch (e) {}
  const save = () => { try { localStorage.setItem('fs-export', JSON.stringify(st)); } catch (e) {} };

  const inView = () => { const b = ctx.map.getBounds(); return ctx.visible.filter(f => f.lon >= b.getWest() && f.lon <= b.getEast() && f.lat >= b.getSouth() && f.lat <= b.getNorth()); };
  const highlighted = () => ctx.highlighted().map(id => ctx.BY_ID.get(id)).filter(Boolean);
  const scopes = () => [['filters', 'Current Filters & Selection', ctx.visible.length], ['view', 'Only What’s on the Map Now', inView().length], ['highlight', 'Highlighted Filings', highlighted().length]];
  const listFor = s => s === 'view' ? inView() : s === 'highlight' ? highlighted() : ctx.visible;

  function render() {
    const R = REPORTS[st.report], cmp = ctx.compare?.list() || [];
    if (!R.formats.includes(st.format)) st.format = R.formats[0];
    if (st.scope !== 'filters' && !scopes().find(x => x[0] === st.scope)[2]) st.scope = 'filters';
    const n = st.report === 'compare' ? cmp.length : listFor(st.scope).length;
    const blocked = st.report === 'compare' ? (cmp.length ? '' : 'Add areas to Compare first (select an area on the map, then “+ Compare”).') : n ? '' : 'No filings match. Change the filters or pick other filings.';
    dlg.innerHTML = '<div class="xbox"><div class="xh"><div><div class="kicker">Export</div><h2 id="xTitle">Reports &amp; Data</h2></div><button class="x" id="xClose" aria-label="Close">×</button></div>' +
      '<div class="xsec"><div class="lt">Report</div><div class="xreports">' + Object.entries(REPORTS).map(([k, r]) =>
        '<label class="xr' + (st.report === k ? ' on' : '') + '"><input type="radio" name="xrep" value="' + k + '"' + (st.report === k ? ' checked' : '') + '><b>' + r.label + (k === 'compare' ? ' <span class="n">' + cmp.length + ' area' + (cmp.length === 1 ? '' : 's') + '</span>' : '') + '</b><span>' + r.desc + '</span></label>').join('') + '</div></div>' +
      (st.report === 'compare' ? '' : '<div class="xsec"><div class="lt">Filings</div><div class="xscopes">' + scopes().map(([k, l, c]) =>
        '<label class="xs' + (c ? '' : ' dis') + '"><input type="radio" name="xscope" value="' + k + '"' + (st.scope === k ? ' checked' : '') + (c ? '' : ' disabled') + '><span>' + l + '</span><b>' + fmtN(c) + '</b></label>').join('') + '</div>' +
        (ctx.filterText() || ctx.sel.feature ? '<div class="xnote">' + esc([ctx.sel.feature ? ctx.sel.label : '', ctx.filterText()].filter(Boolean).join(' · ')) + '</div>' : '') + '</div>') +
      '<div class="xsec"><div class="lt">Format</div><div class="seg xfmt">' + R.formats.map(f => '<button type="button" data-f="' + f + '" aria-pressed="' + (st.format === f) + '">' + FORMATS[f] + '</button>').join('') + '</div></div>' +
      '<div class="xsec xopts">' + opt('map', 'Include the Map', /^(pdf|html)$/.test(st.format) && st.report === 'summary') + opt('full', 'Add the Full Filing List', /^(pdf|html)$/.test(st.format) && st.report === 'summary') +
        opt('scope_text', 'Include Scope of Work Text', st.report === 'list') + opt('ai', 'Include AI Summaries and Tags', st.report === 'list' && st.format !== 'pdf') + '</div>' +
      '<div class="xf"><span class="xmsg">' + esc(blocked) + '</span><button class="btn" id="xCancel">Cancel</button><button class="btn primary xgo" id="xGo"' + (blocked ? ' disabled' : '') + '>Export ' + FORMATS[st.format] + '</button></div></div>';
    dlg.querySelector('#xClose').onclick = dlg.querySelector('#xCancel').onclick = close;
    dlg.querySelectorAll('[name=xrep]').forEach(i => i.onchange = () => { st.report = i.value; save(); render(); });
    dlg.querySelectorAll('[name=xscope]').forEach(i => i.onchange = () => { st.scope = i.value; save(); render(); });
    dlg.querySelectorAll('.xfmt button').forEach(b => b.onclick = () => { st.format = b.dataset.f; save(); render(); });
    dlg.querySelectorAll('.xopts input').forEach(i => i.onchange = () => { st[i.dataset.k] = i.checked; save(); });
    dlg.querySelector('#xGo').onclick = go;
  }
  const opt = (k, label, show) => show ? '<label class="tg2"><input type="checkbox" data-k="' + k + '"' + (st[k] ? ' checked' : '') + '><span>' + label + '</span></label>' : '';
  let lastFocus = null;
  // open(report, { format, scope }): the Reports tab and the assistant's cards open it preset
  function open(report, o = {}) { if (report && REPORTS[report]) st.report = report; if (o.format && REPORTS[st.report].formats.includes(o.format)) st.format = o.format; if (o.scope) st.scope = o.scope; lastFocus = document.activeElement; render(); dlg.classList.add('on'); setTimeout(() => dlg.querySelector('#xGo:not([disabled])')?.focus(), 30); }
  function close() { dlg.classList.remove('on'); lastFocus?.focus?.(); }
  dlg.addEventListener('pointerdown', e => { if (e.target === dlg) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && dlg.classList.contains('on')) close(); });
  document.getElementById('exportBtn').onclick = () => open();
  ctx.openExport = open;

  async function go() {
    const btn = dlg.querySelector('#xGo'); btn.disabled = true; btn.textContent = 'Preparing…';
    try {
      const list = listFor(st.scope).slice().sort((a, b) => b.cost - a.cost);
      const label = st.scope === 'highlight' ? 'Highlighted Filings' : st.scope === 'view' ? 'Map view' : ctx.scopeLabel();
      const name = ctx.fileBase(st.report, st.report === 'compare' ? 'areas' : label);
      // what the Reports tab records with the file
      ctx.exportMeta = { report: st.report, reportLabel: REPORTS[st.report].label, format: st.format, filings: st.report === 'compare' ? (ctx.compare?.list() || []).length : list.length,
        unit: st.report === 'compare' ? 'areas' : 'filings', scope: label, filters: ctx.filterText(), hash: ctx.hashStr() };
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
        const t = compareTable();
        if (st.format === 'pdf') await pdf('compare', 'areas', compareDoc(t), name, t.areas.length > 3);
        else if (st.format === 'xlsx') ctx.exportXlsx([{ name: 'Comparison', aoa: [t.head, ...t.body] }, ...t.areas.map((a, i) => ({ name: (i + 1) + ' ' + a.label.replace(/[\\/?*[\]:]/g, ' '), rows: ctx.rowsFor(t.lists[i]) })).filter(s => s.rows.length)], name);
        else ctx.exportCsv(t.body.map(r => Object.fromEntries(t.head.map((h, i) => [h, r[i]]))), name);
      } else {
        const groups = activity(list);
        if (st.format === 'pdf') await pdf('activity', label, activityDoc(groups, list, label), name);
        else { const flat = groups.flatMap(g => g.rows.map(r => ({ Role: g.label, Name: r.label, Projects: r.n, 'Est. value (USD)': +r.v.toFixed(2), 'New builds': r.nw, 'Mostly': r.use, 'Counties': r.cos, 'Latest filing': r.last })));
          if (st.format === 'xlsx') ctx.exportXlsx(groups.map(g => ({ name: g.label, rows: g.rows.map(r => ({ Name: r.label, Projects: r.n, 'Est. value (USD)': +r.v.toFixed(2), 'New builds': r.nw, Mostly: r.use, Counties: r.cos, 'Latest filing': r.last })) })).filter(s => s.rows.length), name);
          else ctx.exportCsv(flat, name); }
      }
      close();
    } catch (e) { console.error(e); ctx.toast('Export failed: ' + e.message); }
    finally { ctx.exportMeta = null; if (dlg.classList.contains('on')) render(); }
  }
  const rows = list => ctx.rowsFor(list).map(r => { const o = { ...r }; if (!st.scope_text) delete o.Scope; if (!st.ai) { delete o['AI summary']; delete o.Use; delete o.Subtype; delete o.Tenant; delete o.Developer; } return o; });

  // ---------- data for reports ----------
  function compareTable() {
    const areas = ctx.compare.list(), base = ctx.filtered(), lists = areas.map(a => base.filter(f => inArea(a.geom, [f.lon, f.lat])));
    const keys = ['count', 'value', 'new', 'newValue', 'reno', 'add', 'avg', 'median', 'big', 'active', 'starting', 'last30', 'sqft', 'psf', 'units', 'devs', 'topUse', 'topCity', 'topDev'];
    const sq = a => d3.geoArea(a.geom) * 3958.8 ** 2;
    const body = [['Area (sq mi)', ...areas.map(a => +sq(a).toFixed(1))], ...keys.map(k => { const m = BY_KEY.get(k); return [m.label, ...lists.map(l => m.fmt(m.fn(l)))]; }),
      ['Filings per sq mi', ...areas.map((a, i) => +(lists[i].length / Math.max(sq(a), .01)).toFixed(2))]];
    return { areas, lists, head: ['Metric', ...areas.map(a => a.label)], body };
  }
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
    const keys = (ctx.kpiKeys?.() || DEFAULT_KPIS).filter(k => BY_KEY.has(k)), per = keys.length <= 4 ? keys.length : keys.length <= 6 ? 3 : 4, rows = [];
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
  const LEGEND = '<div class="lg"><span><i style="background:#006527"></i>New construction</span><span><i style="background:#6b7174"></i>Renovation</span><span><i style="border:1.5px solid #1f9249"></i>Addition or approximate location</span><span>Marker size = est. value</span></div>';
  function summaryDoc(list, label) {
    const uses = list.some(f => f.use);
    return doc('Summary report', label, kpis(list) +
      (st.map ? '<div class="map">' + ctx.reportMap(list) + '</div>' + LEGEND : '') +
      '<div class="two"><div><h2>By county</h2>' + breakdown(list, f => f.county, 'County') + '<h2>By type</h2>' + breakdown(list, f => ctx.TYPE_LABEL[f.type], 'Type') + '</div>' +
      '<div><h2>Largest filings</h2>' + tbl(['Project', 'City', 'Est. value'], list.slice(0, 12).map(f => [project(f) + '<div class="sc">' + esc(ctx.TYPE_LABEL[f.type] + (f.use ? ' · ' + f.use : '') + (f.sqft ? ' · ' + fmtN(f.sqft) + ' sq ft' : '')) + '</div>', esc(f.city || f.county), money(f.cost)]), [2]) + '</div></div>' +
      (uses ? '<h2>By use (AI-tagged)</h2>' + breakdown(list, f => f.use, 'Use') : '') +
      (st.full ? '<div class="full"><h2>All filings (' + fmtN(list.length) + ')</h2>' + listTable(list, false) + '</div>' : ''));
  }
  const listDoc = (list, label) => doc('Filing list', label, kpis(list) + '<h2>Filings (' + fmtN(list.length) + ')</h2>' + listTable(list, true, st.scope_text), { landscape: true });
  function compareDoc(t) {
    const n = t.areas.length, cols = Math.min(n, n > 3 ? 4 : 3);
    return doc('Area comparison', t.areas.map(a => a.label).join(' vs. '),
      '<h2>Side by side</h2>' + tbl(t.head, t.body.map(r => r.map((c, i) => i ? '<span class="m">' + esc(String(c)) + '</span>' : esc(String(c)))), t.areas.map((a, i) => i + 1)) +
      '<h2>Largest filings in each area</h2><div style="display:grid;grid-template-columns:repeat(' + cols + ',1fr);gap:16px">' + t.areas.map((a, i) => '<div><h3>' + esc(a.label) + '</h3>' +
        tbl(['Project', 'Est. value'], t.lists[i].slice().sort((x, y) => y.cost - x.cost).slice(0, 12).map(f => [project(f) + '<div class="sc">' + esc(f.city || f.county) + '</div>', money(f.cost)]), [1]) + '</div>').join('') + '</div>',
      { landscape: n > 3 });
  }
  const activityDoc = (groups, list, label) => doc('Activity report', label, kpis(list) + groups.filter(g => g.rows.length).map((g, i) => '<div' + (i ? ' class="full"' : '') + '><h2>' + esc(g.label) + '</h2>' +
    tbl(['#', 'Name', 'Projects', 'Est. value', 'New', 'Mostly', 'Where', 'Latest'], g.rows.slice(0, 40).map((r, j) => ['<span class="m">' + (j + 1) + '</span>', '<b>' + esc(r.label) + '</b>', fmtN(r.n), money(r.v), fmtN(r.nw), esc(r.use), esc(r.cos), '<span class="m">' + esc(r.last) + '</span>']), [2, 3, 4]) + '</div>').join(''),
    { sources: 'Grouped by name as filed (or the developer the AI identified), with LLC and Inc. variants merged. ' + SOURCES });
}
