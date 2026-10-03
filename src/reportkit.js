// Shared pieces for the area reports (drive time, traffic, air traffic, airports, flights): the printable HTML report
// shell, a small SVG map of an area, tables, bar charts, saving (recorded in the Reports tab), and the registry that
// puts every area report on the Site section, the Reports tab and the selection bar.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
export const slug = s => String(s || 'area').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'area';
export const fmt = v => v == null || v === '' || Number.isNaN(+v) ? '—' : (+v).toLocaleString('en-US', { maximumFractionDigits: Math.abs(+v) < 10 ? 1 : 0 });
export const today = () => new Date().toISOString().slice(0, 10);

export const REPORT_CSS = '@page{size:letter;margin:.5in}*{box-sizing:border-box}body{margin:0;font-family:Montserrat,system-ui,sans-serif;color:#23282a;font-size:12px;line-height:1.45}.wrap{max-width:900px;margin:0 auto;padding:28px}' +
  '.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #006527;padding-bottom:12px}.hd img{height:40px}.k{font-family:"IBM Plex Mono",monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#006527}' +
  'h1{font-size:24px;margin:6px 0 2px;font-weight:800}h2{font-size:14px;margin:22px 0 8px}.meta{color:#6b7174}.kp{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #e8ebeb;border-radius:6px;margin-top:16px}.kp div{padding:10px 12px}.kp div+div{border-left:1px solid #e8ebeb}' +
  '.kp b{display:block;font-family:"IBM Plex Mono",monospace;font-size:19px}.kp span{font-family:"IBM Plex Mono",monospace;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#6b7174}.map{margin-top:14px;border:1px solid #e8ebeb;border-radius:6px;overflow:hidden}.map svg,.bars svg,.photo img{display:block;width:100%;height:auto}.bars{max-width:620px}' +
  '.photo{margin-top:14px;border-radius:6px;overflow:hidden;max-height:360px}.photo img{object-fit:cover;max-height:360px}.cap{font-size:10px;color:#6b7174;margin-top:3px}' +
  '.two{display:grid;grid-template-columns:1fr 1fr;gap:22px}table{width:100%;border-collapse:collapse}th{font-family:"IBM Plex Mono",monospace;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#6b7174;text-align:left;border-bottom:1px solid #bcc2c4;padding:5px 6px}' +
  'td{border-bottom:1px solid #e8ebeb;padding:5px 6px}.m{font-family:"IBM Plex Mono",monospace;font-size:11px;white-space:nowrap}.r{text-align:right}tr{break-inside:avoid}.lg{display:flex;flex-wrap:wrap;gap:14px;font-size:11px;color:#4d5457;margin-top:6px}.lg i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px}' +
  '.ft{margin-top:22px;padding-top:10px;border-top:1px solid #e8ebeb;color:#6b7174;font-size:10.5px}.pb{position:fixed;right:18px;top:18px;background:#006527;color:#fff;border:0;border-radius:4px;padding:9px 14px;font:600 12px Montserrat,sans-serif;cursor:pointer}@media print{.pb{display:none}.wrap{padding:0}.full{break-before:page}}';

// the whole printable document: kicker, title, meta line, then the body, then the sources footer
export function reportDoc({ kicker, title, meta = '', body = '', sources = '' }) {
  const logo = document.querySelector('.brandbar .l-light')?.src || '';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(kicker + ' — ' + title) + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Montserrat:wght@400;600;800&display=swap" rel="stylesheet"><style>' + REPORT_CSS + '</style></head><body>' +
    '<button class="pb" onclick="window.print()">Print or Save as PDF</button><div class="wrap"><div class="hd"><div><div class="k">' + esc(kicker) + '</div><h1>' + esc(title) + '</h1><div class="meta">' + meta +
    (meta ? ' · ' : '') + 'Generated ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + '</div></div>' + (logo ? '<img src="' + logo + '" alt="Finishes Solutions">' : '') + '</div>' +
    body + (sources ? '<div class="ft">Sources: ' + sources + '</div>' : '') + '</div></body></html>';
}
// [[value, label, color?], …] -> the KPI strip (report) or the card's kgrid
export const kpiStrip = items => '<div class="kp">' + items.map(([v, l, c]) => '<div><b' + (c ? ' style="color:' + c + '"' : '') + '>' + v + '</b><span>' + esc(l) + '</span></div>').join('') + '</div>';
export const kgrid = items => '<div class="kgrid">' + items.map(([v, l, c]) => '<div><b' + (c ? ' style="color:' + c + '"' : '') + '>' + v + '</b><span>' + esc(l) + '</span></div>').join('') + '</div>';
// headers: ['Road', {t:'Vehicles/day', r:true}]; rows: arrays of already-escaped cells
export function table(headers, rows) {
  const h = headers.map(x => typeof x === 'string' ? { t: x } : x);
  return '<table><thead><tr>' + h.map(x => '<th' + (x.r ? ' class="r"' : '') + '>' + esc(x.t) + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(r => '<tr>' + r.map((c, i) => '<td' + (h[i]?.r ? ' class="m r"' : h[i]?.m ? ' class="m"' : '') + '>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
}
// vertical bars: [{ label, v, color? }]; labels under every nth bar
export function bars(list, { color = '#006527', height = 120, every = 1, unit = '' } = {}) {
  const W = 620, H = height, n = list.length || 1, bw = W / n, mx = Math.max(1, ...list.map(x => +x.v || 0));
  return '<svg viewBox="0 0 ' + W + ' ' + (H + 16) + '" xmlns="http://www.w3.org/2000/svg" role="img">' + list.map((x, i) => {
    const h = Math.max(x.v > 0 ? 1.5 : 0, (+x.v || 0) / mx * (H - 14)), X = i * bw;
    return '<g><title>' + esc(x.label + ': ' + fmt(x.v) + unit) + '</title><rect x="' + (X + bw * .12).toFixed(1) + '" y="' + (H - h).toFixed(1) + '" width="' + (bw * .76).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="1.5" fill="' + (x.color || color) + '"/>' +
      (i % every === 0 ? '<text x="' + (X + bw / 2).toFixed(1) + '" y="' + (H + 12) + '" font-size="9" text-anchor="middle" fill="currentColor" opacity=".6">' + esc(x.label) + '</text>' : '') + '</g>';
  }).join('') + '</svg>';
}
// a small map of one or more areas (outlines, nested bands) and points, for the printed report
export function areaSvg(layers, { W = 1000, H = 440, points = [] } = {}) {
  const geoms = layers.map(l => l.geometry).filter(Boolean), polys = g => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = ([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  geoms.forEach(g => polys(g).flat(2).forEach(grow)); points.forEach(p => grow(p.c));
  if (!Number.isFinite(x0)) return '';
  const k = Math.cos((y0 + y1) / 2 * Math.PI / 180), sx = (x1 - x0) * k || 1e-4, sy = (y1 - y0) || 1e-4, s = Math.min((W - 40) / sx, (H - 40) / sy);
  const pr = ([x, y]) => [(W - sx * s) / 2 + (x - x0) * k * s, (H - sy * s) / 2 + (y1 - y) * s];
  const path = g => polys(g).map(poly => poly.map(r => 'M' + r.map(p => pr(p).map(v => v.toFixed(1)).join(',')).join('L') + 'Z').join('')).join('');
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg"><rect width="' + W + '" height="' + H + '" fill="#f8f9f9"/>' +
    layers.map(l => '<path d="' + path(l.geometry) + '" fill="' + (l.fill || 'rgba(0,101,39,.06)') + '" stroke="' + (l.stroke || '#006527') + '" stroke-width="' + (l.width || 1.6) + '"' + (l.dash ? ' stroke-dasharray="6 4"' : '') + ' fill-rule="evenodd"/>').join('') +
    points.map(p => { const [x, y] = pr(p.c); return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (p.r || 3) + '" fill="' + (p.color || '#c2410c') + '" fill-opacity="' + (p.o ?? .85) + '"/>' + (p.label ? '<text x="' + (x + 6).toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" font-size="12" fill="#23282a">' + esc(p.label) + '</text>' : ''); }).join('') + '</svg>';
}
// save a report (or its CSV); the Reports tab records it under its kind
export async function saveHtml(ctx, kind, label, html) {
  ctx.exportMeta = { report: kind, format: 'html', scope: label };
  try { await ctx.saveFile(kind + '-report-' + slug(label) + '-' + today() + '.html', html, 'text/html'); } finally { ctx.exportMeta = null; }
}
export function saveCsv(ctx, kind, label, rows) {
  if (!rows?.length) { ctx.toast?.('Nothing to export.'); return; }
  ctx.exportMeta = { report: kind, format: 'csv', scope: label, filings: rows.length, unit: 'rows' };
  try { ctx.exportCsv(rows, kind + '-' + slug(label) + '-' + today()); } finally { ctx.exportMeta = null; }
}
// the side card: a header (kicker, title, sub) and a loading note; returns the card element
export function openCard(ctx, { kicker, title, sub = '', loading = 'Loading…' }) {
  const card = ctx.card || document.getElementById('card');
  ctx.closeCard?.();
  card.innerHTML = cardTop(kicker, title, sub) + '<div class="bsec"><div class="rnote">' + esc(loading) + '</div></div>';
  card.classList.add('open'); card.querySelector('.x').onclick = () => ctx.closeCard(); return card;
}
export const cardTop = (kicker, title, sub = '') => '<div class="top"><div><div class="kicker">' + esc(kicker) + '</div><h2>' + esc(title) + '</h2>' + (sub ? '<div class="bsub">' + sub + '</div>' : '') + '</div><button class="x" aria-label="Close">×</button></div>';
export function fillCard(ctx, card, html) { card.innerHTML = html; card.classList.add('open'); card.querySelector('.x')?.addEventListener('click', () => ctx.closeCard()); ctx.wireCites?.(card); }

// a circle (64 points) around [lon, lat]
export const circle = ([lon, lat], mi) => { const r = mi / 69, k = Math.cos(lat * Math.PI / 180), ring = []; for (let i = 0; i <= 64; i++) { const a = (i % 64) / 64 * 2 * Math.PI; ring.push([lon + r * Math.cos(a) / k, lat + r * Math.sin(a)]); } return { type: 'Polygon', coordinates: [ring] }; };
export const viewBox = map => { const b = map.getBounds(), w = b.getWest(), s = b.getSouth(), e = b.getEast(), n = b.getNorth(); return { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] }; };
export const centerOf = g => { const r = (g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0]) || []; let x = 0, y = 0; r.forEach(p => { x += p[0]; y += p[1]; }); return r.length ? [x / r.length, y / r.length] : null; };

// ---------- area report registry ----------
// ctx.addAreaReport({ key, label, desc, note, run({ geometry, label, center }) }): a button in the Site section's "Area
// reports" (a circle of the chosen radius around the building), a card in the Reports tab (selected area, map view or
// draw an area) and a button on the selection bar.
export function initAreaReports(ctx) {
  const list = ctx.areaReports = [];
  const sbRow = document.querySelector('#selbar .btnrow');
  const syncSel = () => list.forEach(r => { if (r.sb) r.sb.style.display = ctx.sel?.feature ? '' : 'none'; });
  ctx.addAreaReport = r => {
    if (list.some(x => x.key === r.key)) return; list.push(r);
    if (sbRow) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = r.label; b.style.display = 'none'; b.onclick = () => ctx.runAreaReport(r.key, 'selection'); sbRow.appendChild(b); r.sb = b; }
    syncSel();
  };
  // which: 'selection' | 'view' | { geometry, label, center }
  ctx.runAreaReport = (key, which) => {
    const r = list.find(x => x.key === key); if (!r) return false;
    if (ctx.view !== 'map') ctx.setView?.('map');
    if (which === 'selection') { const s = ctx.sel; if (!s?.feature) { ctx.toast?.('Select an area first (Area, Shape, Radius or County).'); return false; } const g = s.feature.geometry || s.feature; r.run({ geometry: g, label: s.label || 'Selected area', center: s.center || centerOf(g) }); return true; }
    if (which === 'view') { const g = viewBox(ctx.map); r.run({ geometry: g, label: 'Map view near ' + (ctx.viewPlace?.() || 'Houston'), center: ctx.map.getCenter().toArray() }); return true; }
    r.run(which); return true;
  };
  ctx.onChange?.(syncSel);
}
