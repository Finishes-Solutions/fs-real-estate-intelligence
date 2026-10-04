// Export dialog (green Export button next to the map tools): pick a report, which filings, and a format.
// PDFs are built in the browser with jsPDF (loaded on first use); Excel uses SheetJS (already on the page).
import { BY_KEY, DEFAULT_KPIS } from './metrics.js';
import { contains as inArea } from './lib/geomatch.mjs';

const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const AUTOTABLE = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
export const REPORTS = {
  summary: { label: 'Summary Report', desc: 'Headline metrics, map, breakdowns by county, type and use, largest projects.', formats: ['pdf', 'xlsx', 'html'] },
  list: { label: 'Filing List', desc: 'Every filing with address, value, owner, developer, schedule and status.', formats: ['pdf', 'xlsx', 'csv', 'geojson'] },
  compare: { label: 'Area Comparison', desc: 'The areas in Compare side by side, with the largest projects in each.', formats: ['pdf', 'xlsx', 'csv'] },
  activity: { label: 'Activity Report', desc: 'Most active developers, architects and general contractors.', formats: ['pdf', 'xlsx', 'csv'] }
};
export const FORMATS = { pdf: 'PDF', xlsx: 'Excel', csv: 'CSV', geojson: 'GeoJSON (GIS)', html: 'Web Page' };
const GREEN = [0, 101, 39], INK = [35, 40, 42], MUTED = [107, 113, 116], LINE = [221, 225, 226];

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
      '<div class="xsec xopts">' + opt('map', 'Include the Map', st.format === 'pdf' && st.report === 'summary') + opt('full', 'Add the Full Filing List', st.format === 'pdf' && st.report === 'summary') +
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
        if (st.format === 'pdf') await pdfSummary(list, label, name);
        else if (st.format === 'xlsx') ctx.exportXlsx([{ name: 'Summary', aoa: ctx.summaryAoa(list, label) }, { name: 'Filings', rows: rows(list) }], name);
        else ctx.exportHtml(list, name);
      } else if (st.report === 'list') {
        if (st.format === 'pdf') await pdfList(list, label, name);
        else if (st.format === 'xlsx') ctx.exportXlsx([{ name: 'Filings', rows: rows(list) }, { name: 'Summary', aoa: ctx.summaryAoa(list, label) }], name);
        else if (st.format === 'csv') ctx.exportCsv(rows(list), name);
        else ctx.exportGeoJSON(list, name);
      } else if (st.report === 'compare') {
        const t = compareTable();
        if (st.format === 'pdf') await pdfCompare(t, name);
        else if (st.format === 'xlsx') ctx.exportXlsx([{ name: 'Comparison', aoa: [t.head, ...t.body] }, ...t.areas.map((a, i) => ({ name: (i + 1) + ' ' + a.label.replace(/[\\/?*[\]:]/g, ' '), rows: ctx.rowsFor(t.lists[i]) })).filter(s => s.rows.length)], name);
        else ctx.exportCsv(t.body.map(r => Object.fromEntries(t.head.map((h, i) => [h, r[i]]))), name);
      } else {
        const groups = activity(list);
        if (st.format === 'pdf') await pdfActivity(groups, list, label, name);
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

  // ---------- PDF ----------
  let libP = null;
  const script = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('couldn’t load the PDF library')); document.head.appendChild(s); });
  const lib = () => libP ||= script(JSPDF).then(() => script(AUTOTABLE)).then(() => window.jspdf.jsPDF);
  let logoP = null;
  const logo = () => logoP ||= fetch(document.querySelector('.brandbar img').src).then(r => r.blob()).then(b => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); })).then(src => new Promise(res => { const im = new Image(); im.onload = () => res({ src, w: im.width, h: im.height }); im.onerror = () => res(null); im.src = src; })).catch(() => null);
  const svgPng = (svg, w, h) => new Promise((res, rej) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; const g = c.getContext('2d'); g.scale(2, 2); g.drawImage(im, 0, 0, w, h); res(c.toDataURL('image/png')); }; im.onerror = () => rej(new Error('map image failed')); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  const money = v => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  async function doc0(title, kicker) {
    const J = await lib(), d = new J({ orientation: 'landscape', unit: 'pt', format: 'letter' }), W = d.internal.pageSize.getWidth(), lg = await logo();
    d.setFont('helvetica', 'bold'); d.setFontSize(8); d.setTextColor(...GREEN); d.text((kicker || 'Real Estate Intelligence Platform').toUpperCase(), 36, 40, { charSpace: 1 });
    d.setFontSize(20); d.setTextColor(...INK); d.text(d.splitTextToSize(title, W - 260)[0], 36, 64);
    d.setFont('helvetica', 'normal'); d.setFontSize(9); d.setTextColor(...MUTED);
    const meta = ['TDLR TABS registrations ' + ctx.PERIOD, 'Generated ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })].join(' · ');
    d.text(meta, 36, 80); const ft = ctx.filterText(); if (ft) d.text(d.splitTextToSize('Filters: ' + ft, W - 260), 36, 92);
    if (lg) { const h = 30, w = lg.w / lg.h * h; d.addImage(lg.src, 'PNG', W - 36 - w, 38, w, h); }
    d.setDrawColor(...GREEN); d.setLineWidth(2); d.line(36, ft ? 102 : 92, W - 36, ft ? 102 : 92);
    return { d, W, H: d.internal.pageSize.getHeight(), y: ft ? 116 : 106 };
  }
  function kpiRow(p, list) {
    // Up to 6 tiles fit on one row; 7–9 wrap onto a second row.
    const keys = ctx.kpiKeys?.() || DEFAULT_KPIS, per = keys.length > 6 ? Math.ceil(keys.length / 2) : keys.length, gap = 8, w = (p.W - 72 - gap * (per - 1)) / per, y0 = p.y;
    keys.forEach((k, i) => { const m = BY_KEY.get(k), x = 36 + (i % per) * (w + gap); p.y = y0 + Math.floor(i / per) * 54;
      p.d.setDrawColor(...LINE); p.d.setLineWidth(.8); p.d.rect(x, p.y, w, 46); p.d.setFillColor(...GREEN); p.d.rect(x, p.y, 2.5, 46, 'F');
      p.d.setFont('helvetica', 'bold'); p.d.setFontSize(m.text ? 10 : 15); p.d.setTextColor(...INK); p.d.text(p.d.splitTextToSize(String(m.fmt(m.fn(list))), w - 16)[0], x + 10, p.y + 22);
      p.d.setFont('helvetica', 'normal'); p.d.setFontSize(7); p.d.setTextColor(...MUTED); p.d.text(m.label.toUpperCase(), x + 10, p.y + 37, { charSpace: .6 }); });
    p.y += 60;
  }
  const tableStyle = { styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, textColor: INK, lineColor: LINE, lineWidth: .5 }, headStyles: { fillColor: [248, 249, 249], textColor: MUTED, fontStyle: 'bold', fontSize: 7 }, alternateRowStyles: { fillColor: [252, 253, 253] }, margin: { left: 36, right: 36, top: 40, bottom: 36 } };
  function footer(d, note) {
    const n = d.getNumberOfPages(), W = d.internal.pageSize.getWidth(), H = d.internal.pageSize.getHeight();
    for (let i = 1; i <= n; i++) { d.setPage(i); d.setFont('helvetica', 'normal'); d.setFontSize(7); d.setTextColor(...MUTED);
      d.text(note || 'Source: Texas Department of Licensing and Regulation, TABS project registrations. Costs and dates are filer estimates; uses and developers are AI-tagged. Prepared for Finishes Solutions.', 36, H - 18, { maxWidth: W - 120 });
      d.text('Page ' + i + ' of ' + n, W - 36, H - 18, { align: 'right' }); }
  }
  const breakdown = (list, key, label) => { const m = new Map(); list.forEach(f => { const k = key(f) || 'Unclassified'; const g = m.get(k) || [k, 0, 0, 0]; g[1]++; g[2] += f.cost; if (f.type === 'New') g[3]++; m.set(k, g); });
    const tot = list.reduce((s, f) => s + f.cost, 0) || 1; return { head: [[label, 'Filings', 'Est. value', 'Share', 'New']], body: [...m.values()].sort((a, b) => b[2] - a[2]).slice(0, 14).map(g => [g[0], fmtN(g[1]), fmtM(g[2]), Math.round(g[2] / tot * 100) + '%', fmtN(g[3])]) }; };
  const listTable = (p, list, withScope) => p.d.autoTable({ ...tableStyle, startY: p.y,
    head: [['#', 'Registered', 'Project', 'County', 'Type / use', 'Est. value', 'Sq ft', 'Owner / developer', 'Status', 'Schedule']],
    body: list.map((f, i) => [i + 1, f.reg || '', f.name + '\n' + (f.addr || f.city || '') + (withScope && f.scope ? '\n' + f.scope.slice(0, 400) : ''), f.county, ctx.TYPE_LABEL[f.type] + (f.use ? '\n' + f.use : ''), money(f.cost), f.sqft ? fmtN(f.sqft) : '', (f.owner || '') + (f.dev && f.dev !== f.owner ? '\n' + f.dev : ''), f.status || '', (f.ts || '') + ' → ' + (f.te || '')]),
    columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 52 }, 2: { cellWidth: 190 }, 5: { halign: 'right', cellWidth: 62 }, 6: { halign: 'right', cellWidth: 44 }, 9: { cellWidth: 90 } } });

  async function pdfSummary(list, label, name) {
    const p = await doc0(label, 'Real Estate Intelligence Platform · Summary report'); kpiRow(p, list);
    const colL = 36, mapW = st.map ? 430 : 0, colR = st.map ? colL + mapW + 18 : colL;
    if (st.map) { const w = 1000, h = 560, png = await svgPng(ctx.reportMap(list), w, h), ih = mapW * h / w; p.d.addImage(png, 'PNG', colL, p.y, mapW, ih); p.d.setDrawColor(...LINE); p.d.rect(colL, p.y, mapW, ih);
      p.d.setFontSize(7); p.d.setTextColor(...MUTED); p.d.text('Green = new construction · grey = renovation · ring = addition or approximate location · size = est. value', colL, p.y + ih + 10); }
    const byC = breakdown(list, f => f.county, 'County');
    p.d.autoTable({ ...tableStyle, startY: p.y, margin: { ...tableStyle.margin, left: colR }, tableWidth: p.W - 36 - colR, head: byC.head, body: byC.body, columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } });
    const byT = breakdown(list, f => ctx.TYPE_LABEL[f.type], 'Type'), byU = breakdown(list, f => f.use, 'Use (AI-tagged)'), right = { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } };
    p.d.autoTable({ ...tableStyle, startY: p.d.lastAutoTable.finalY + 12, margin: { ...tableStyle.margin, left: colR }, tableWidth: p.W - 36 - colR, head: byT.head, body: byT.body, columnStyles: right });
    p.d.addPage(); p.y = 40; const half = (p.W - 72 - 18) / 2;
    p.d.autoTable({ ...tableStyle, startY: p.y, tableWidth: half, head: byU.head, body: byU.body, columnStyles: right });
    p.d.autoTable({ ...tableStyle, startY: p.y, margin: { ...tableStyle.margin, left: 36 + half + 18 }, tableWidth: half, head: [['Largest projects', 'City', 'Type', 'Est. value']],
      body: list.slice(0, 15).map(f => [f.name, f.city || f.county, ctx.TYPE_LABEL[f.type] + (f.use ? ' · ' + f.use : ''), money(f.cost)]), columnStyles: { 3: { halign: 'right' } } });
    if (st.full) { p.d.addPage(); p.y = 40; p.d.setFont('helvetica', 'bold'); p.d.setFontSize(12); p.d.setTextColor(...INK); p.d.text('All filings (' + fmtN(list.length) + ')', 36, p.y); p.y += 10; listTable(p, list, false); }
    footer(p.d); ctx.saveFile(name + '.pdf', p.d.output('blob'), 'application/pdf');
  }
  async function pdfList(list, label, name) {
    const p = await doc0(label, 'Real Estate Intelligence Platform · Filing list'); kpiRow(p, list); listTable(p, list, st.scope_text);
    footer(p.d); ctx.saveFile(name + '.pdf', p.d.output('blob'), 'application/pdf');
  }
  async function pdfCompare(t, name) {
    const p = await doc0(t.areas.map(a => a.label).join(' vs. '), 'Real Estate Intelligence Platform · Area comparison');
    p.d.autoTable({ ...tableStyle, startY: p.y, head: [t.head], body: t.body.map(r => r.map(String)), columnStyles: Object.fromEntries(t.areas.map((a, i) => [i + 1, { halign: 'right' }])) });
    p.d.addPage(); p.y = 40;
    const w = (p.W - 72 - 12 * (t.areas.length - 1)) / t.areas.length;
    t.areas.forEach((a, i) => p.d.autoTable({ ...tableStyle, startY: p.y, margin: { ...tableStyle.margin, left: 36 + i * (w + 12) }, tableWidth: w, head: [['Largest in ' + a.label, 'Est. value']],
      body: t.lists[i].slice().sort((x, y) => y.cost - x.cost).slice(0, 12).map(f => [f.name + '\n' + (f.city || f.county), money(f.cost)]), columnStyles: { 1: { halign: 'right', cellWidth: 58 } } }));
    footer(p.d); ctx.saveFile(name + '.pdf', p.d.output('blob'), 'application/pdf');
  }
  async function pdfActivity(groups, list, label, name) {
    const p = await doc0(label, 'Real Estate Intelligence Platform · Activity report'); kpiRow(p, list);
    groups.forEach((g, i) => { if (!g.rows.length) return; if (i) { p.d.addPage(); p.y = 40; }
      p.d.setFont('helvetica', 'bold'); p.d.setFontSize(12); p.d.setTextColor(...INK); p.d.text(g.label, 36, p.y + 4); p.y += 12;
      p.d.autoTable({ ...tableStyle, startY: p.y, head: [['#', 'Name', 'Projects', 'Est. value', 'New builds', 'Mostly', 'Where', 'Latest']],
        body: g.rows.slice(0, 40).map((r, j) => [j + 1, r.label, fmtN(r.n), money(r.v), fmtN(r.nw), r.use, r.cos, r.last]), columnStyles: { 0: { cellWidth: 22 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } });
      p.y = p.d.lastAutoTable.finalY + 20; });
    footer(p.d, 'Grouped by name as filed (or the developer the AI identified), with LLC/Inc. variants merged. Source: TDLR TABS. Prepared for Finishes Solutions.'); ctx.saveFile(name + '.pdf', p.d.output('blob'), 'application/pdf');
  }
}
