// The plain report look shared by the site reports (parcel map, topography, site environmental, area rings): unbranded,
// black on white with a few colour accents, one face, Inter (labels small and grey, numbers tabular), on letter pages. Pure strings,
// no DOM and no network, so the browser and the server (lib/pdf.mjs, rendered with brand: false) build the same pages.
// Every page is a .pg block of 7.5 x 9.9 in (the letter page inside lib/pdf.mjs's margins); maps are inline SVG in feet.
export const C = { ink: '#0b0b0c', sub: '#5f6368', mute: '#9aa0a6', line: '#ececf1', faint: '#f6f7f8', grid: '#f3f3f4',
  accent: '#2f6bff', accentFill: 'rgba(47,107,255,.10)', red: '#d93025', amber: '#c77700', green: '#188038' };
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
const num = v => v != null && v !== '' && Number.isFinite(+v);
export const n0 = v => num(v) ? Math.round(+v).toLocaleString('en-US') : '—';
export const n1 = v => num(v) ? (+v).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—';
export const n2 = v => num(v) ? (+v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
export const usd = v => num(v) ? '$' + Math.round(+v).toLocaleString('en-US') : '—';
export const usdM = v => !num(v) ? '—' : Math.abs(v) >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : Math.abs(v) >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e3 ? '$' + Math.round(v / 1e3) + 'K' : '$' + Math.round(v);
export const pct = (v, d = 1) => num(v) ? (+v).toFixed(d) + '%' : '—';
export const dash = v => v == null || v === '' ? '—' : esc(v);

// ---------- the page ----------
export const CSS = `
@page { size: letter; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: ${C.ink}; font-family: Inter, 'Helvetica Neue', Arial, sans-serif; font-variant-numeric: tabular-nums; font-size: 8.6px; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.pg { width: 7.5in; height: 9.85in; position: relative; overflow: hidden; page-break-after: always; break-after: page; }
.pg:last-child { page-break-after: auto; break-after: auto; }
.mono { font-family: Inter, sans-serif; font-feature-settings: 'tnum'; }
.top { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; padding-bottom: 7px; border-bottom: 1.5px solid ${C.ink}; margin-bottom: 10px; }
.k { font-size: 8.4px; font-weight: 500; color: ${C.sub}; }
.k.acc { color: ${C.accent}; }
h1 { font-size: 18px; font-weight: 600; margin: 2px 0 0; letter-spacing: -.02em; line-height: 1.15; }
h2 { font-size: 11px; font-weight: 700; margin: 0 0 5px; }
.right { text-align: right; }
.right b { font-size: 10.5px; font-weight: 700; }
.sub { color: ${C.sub}; }
.row { display: flex; gap: 10px; }
.col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 9px; }
.card { border: 1px solid ${C.line}; border-radius: 8px; padding: 7px 9px 6px; break-inside: avoid; }
.card > .k { display: block; color: ${C.ink}; font-weight: 600; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid ${C.line}; }
.kv { display: flex; justify-content: space-between; gap: 10px; padding: 2.2px 0; border-bottom: 1px dotted ${C.grid}; }
.kv:last-child { border-bottom: 0; }
.kv span:first-child { color: ${C.sub}; white-space: nowrap; }
.kv span:last-child { font-weight: 600; text-align: right; }
table { width: 100%; border-collapse: collapse; }
th { font-size: 7.8px; color: ${C.sub}; font-weight: 500; text-align: left; padding: 4px 5px; border-bottom: 1px solid ${C.ink}; white-space: nowrap; }
td { padding: 3.6px 5px; border-bottom: 1px solid ${C.grid}; vertical-align: top; }
td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
tr.tot td { border-top: 1px solid ${C.ink}; border-bottom: 0; font-weight: 700; }
.tiles { display: grid; gap: 0; border: 1px solid ${C.line}; border-radius: 8px; }
.tile { padding: 7px 9px; border-right: 1px solid ${C.line}; }
.tile:last-child { border-right: 0; }
.tile b { display: block; font-size: 15px; font-weight: 700; letter-spacing: -.01em; line-height: 1.15; }
.tile .k { display: block; margin-top: 2px; font-size: 7.8px; }
.tag { display: inline-block; font-size: 7.6px; font-weight: 500; padding: 1px 6px; border-radius: 999px; border: 1px solid currentColor; white-space: nowrap; }
.note { font-size: 7.4px; color: ${C.mute}; line-height: 1.55; }
.para { font-size: 8.4px; color: ${C.ink}; margin: 0; }
.foot { position: absolute; left: 0; right: 0; bottom: 0; border-top: 1px solid ${C.line}; padding-top: 5px; display: flex; justify-content: space-between; gap: 12px; }
.map { border: 1px solid ${C.line}; background: #fcfcfc; display: block; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; vertical-align: -1px; margin-right: 5px; }
.num { display: inline-flex; align-items: center; justify-content: center; width: 13px; height: 13px; border-radius: 50%; background: ${C.ink}; color: #fff; font-size: 7px; font-weight: 600; }
`;
// the whole document: pages in order, each a string of .pg content (pageOf wraps it)
export const doc = (title, pages) => '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' + CSS + '</style></head><body>' + pages.join('') + '</body></html>';
// a page: the header (kicker, title, line under it, and the right-hand block), the body and the foot note
export function pageOf({ kicker, title, sub = '', right = '', rightSub = '' }, body, foot = '') {
  return '<section class="pg"><div class="top"><div><div class="k acc">' + esc(kicker) + '</div><h1>' + esc(title) + '</h1>' + (sub ? '<div class="k" style="margin-top:3px">' + esc(sub) + '</div>' : '') + '</div>' +
    '<div class="right">' + (rightSub ? '<div class="k">' + esc(rightSub) + '</div>' : '') + (right ? '<b>' + esc(right) + '</b>' : '') + '</div></div>' + body +
    (foot ? '<div class="foot"><div class="note">' + foot + '</div></div>' : '') + '</section>';
}
// a card of label / value rows ([label, value html, { raw }]); values are escaped unless raw
export const card = (title, rows) => '<div class="card"><span class="k">' + esc(title) + '</span>' + rows.filter(Boolean).map(([l, v, o]) => '<div class="kv"><span>' + esc(l) + '</span><span>' + (o?.raw ? v : dash(v)) + '</span></div>').join('') + '</div>';
// tiles: [[value html, label, colour?]]
export const tiles = list => '<div class="tiles" style="grid-template-columns:repeat(' + list.length + ',1fr)">' + list.map(([v, l, c]) => '<div class="tile"><b' + (c ? ' style="color:' + c + '"' : '') + '>' + v + '</b><span class="k">' + esc(l) + '</span></div>').join('') + '</div>';
// a table: cols [[label, 'n' for numbers]], rows of cell html, foot: a totals row
export const table = (cols, rows, { foot = null, style = '' } = {}) => '<table style="' + style + '"><thead><tr>' + cols.map(([l, a]) => '<th' + (a ? ' class="' + a + '"' : '') + '>' + esc(l) + '</th>').join('') + '</tr></thead><tbody>' +
  rows.map(r => '<tr>' + r.map((v, i) => '<td' + (cols[i]?.[1] ? ' class="' + cols[i][1] + '"' : '') + '>' + v + '</td>').join('') + '</tr>').join('') +
  (foot ? '<tr class="tot">' + foot.map((v, i) => '<td' + (cols[i]?.[1] ? ' class="' + cols[i][1] + '"' : '') + '>' + v + '</td>').join('') + '</tr>' : '') + '</tbody></table>';
export const tag = (text, color = C.sub) => '<span class="tag" style="color:' + color + '">' + esc(text) + '</span>';

// ---------- maps in feet ----------
// fit feet into a W x H box (pad px each side): P([x, y] ft) -> [px, py] (y down), s: px per ft
export function fit(pts, W, H, pad = 40) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const s = Math.min((W - 2 * pad) / Math.max(1, x1 - x0), (H - 2 * pad) / Math.max(1, y1 - y0)), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { s, W, H, P: ([x, y]) => [W / 2 + (x - cx) * s, H / 2 - (y - cy) * s], X: px => cx + (px - W / 2) / s, Y: py => cy - (py - H / 2) / s };
}
const f1 = v => Math.round(v * 10) / 10;
export const pathOf = (V, ring, close = true) => ring.map((p, i) => (i ? 'L' : 'M') + V.P(p).map(f1).join(' ')).join('') + (close ? 'Z' : '');
// a round step for grid lines or a scale bar about `target` ft long
export const niceStep = target => { const e = 10 ** Math.floor(Math.log10(target)), m = target / e; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e; };
// the light grid every `step` ft, and lon/lat labels on the left and bottom edges (toLL: ft -> [lon, lat])
export function gridSvg(V, step, toLL) {
  const o = [], xs = [], ys = [];
  for (let x = Math.ceil(V.X(0) / step) * step; x <= V.X(V.W); x += step) xs.push(x);
  for (let y = Math.ceil(V.Y(V.H) / step) * step; y <= V.Y(0); y += step) ys.push(y);
  for (const x of xs) { const px = f1(V.P([x, 0])[0]); o.push('<line x1="' + px + '" y1="0" x2="' + px + '" y2="' + V.H + '" stroke="' + C.grid + '" stroke-width=".7"/>'); }
  for (const y of ys) { const py = f1(V.P([0, y])[1]); o.push('<line x1="0" y1="' + py + '" x2="' + V.W + '" y2="' + py + '" stroke="' + C.grid + '" stroke-width=".7"/>'); }
  if (toLL) { const lab = (t, x, y, a = 'start') => '<text x="' + f1(x) + '" y="' + f1(y) + '" font-family="Inter" font-size="6.5" fill="' + C.mute + '" text-anchor="' + a + '">' + t + '</text>';
    xs.filter((_, i) => i % 2 === 1).forEach(x => { const px = V.P([x, 0])[0]; if (px > 60 && px < V.W - 60) o.push(lab(Math.abs(toLL([x, V.Y(V.H)])[0]).toFixed(5) + '°W', px, V.H - 4, 'middle')); });
    ys.filter((_, i) => i % 2 === 1).forEach(y => { const py = V.P([0, y])[1]; if (py > 30 && py < V.H - 20) o.push(lab(toLL([V.X(0), y])[1].toFixed(5) + '°N', 4, py - 3)); }); }
  return o.join('');
}
export const northArrow = (x, y) => '<g transform="translate(' + x + ',' + y + ')"><rect x="-14" y="-4" width="28" height="36" rx="3" fill="#fff" stroke="' + C.line + '"/><path d="M0 0 L6 15 L0 11 L-6 15Z" fill="' + C.ink + '"/><text x="0" y="27" font-family="Inter" font-size="7" font-weight="600" text-anchor="middle">N</text></g>';
// a scale bar of a round length about a fifth of the map, bottom right
export function scaleBar(V, { label = 'ft' } = {}) {
  const ft = niceStep(V.W / V.s / 5), w = ft * V.s, x = V.W - w - 18, y = V.H - 22;
  return '<g><rect x="' + f1(x - 8) + '" y="' + (y - 14) + '" width="' + f1(w + 16) + '" height="26" rx="3" fill="#fff" stroke="' + C.line + '"/>' +
    '<rect x="' + f1(x) + '" y="' + y + '" width="' + f1(w / 2) + '" height="4" fill="#fff" stroke="' + C.ink + '" stroke-width=".8"/><rect x="' + f1(x + w / 2) + '" y="' + y + '" width="' + f1(w / 2) + '" height="4" fill="' + C.ink + '"/>' +
    '<text x="' + f1(x) + '" y="' + (y - 4) + '" font-family="Inter" font-size="6.5" fill="' + C.sub + '">0</text><text x="' + f1(x + w) + '" y="' + (y - 4) + '" font-family="Inter" font-size="6.5" fill="' + C.sub + '" text-anchor="end">' + n0(ft) + ' ' + label + '</text></g>';
}
// a small label box (dimension, contour or callout) centred at [x, y] px
export const chip = (x, y, text, { size = 6.8, color = C.ink, bg = '#fff', stroke = C.line, weight = 500 } = {}) => { const w = text.length * size * 0.62 + 6;
  return '<g><rect x="' + f1(x - w / 2) + '" y="' + f1(y - size * 0.75 - 2) + '" width="' + f1(w) + '" height="' + f1(size + 4) + '" rx="2" fill="' + bg + '" stroke="' + stroke + '" stroke-width=".6"/><text x="' + f1(x) + '" y="' + f1(y + size * 0.32) + '" font-family="Inter" font-size="' + size + '" font-weight="' + weight + '" fill="' + color + '" text-anchor="middle">' + esc(text) + '</text></g>'; };

// ---------- charts ----------
// horizontal bars: [[label, value, colour?]], values formatted by fmt
export function bars(list, { W = 340, row = 15, fmt = n0, max = null, color = C.ink, labelW = 110 } = {}) {
  const m = max ?? Math.max(1e-9, ...list.map(r => +r[1] || 0)), H = list.length * row + 2, bw = W - labelW - 46;
  return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' + list.map(([l, v, c], i) => { const y = i * row + 2, w = Math.max(0, (+v || 0) / m * bw);
    return '<text x="0" y="' + (y + 9) + '" font-size="7.2" fill="' + C.sub + '">' + esc(l) + '</text><rect x="' + labelW + '" y="' + (y + 2) + '" width="' + f1(bw) + '" height="9" fill="' + C.faint + '"/><rect x="' + labelW + '" y="' + (y + 2) + '" width="' + f1(w) + '" height="9" fill="' + (c || color) + '"/>' +
      '<text x="' + f1(labelW + w + 4) + '" y="' + (y + 9.5) + '" font-family="Inter" font-size="7" fill="' + C.ink + '">' + fmt(v) + '</text>'; }).join('') + '</svg>';
}

// ---------- geometry ----------
const R_FT = 20925646; // (mean Earth radius in feet)
// a survey bearing between two points in plan feet (y north): "N 45°12'30\" E"
export function bearing(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], az = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  const [ns, ew, ang] = az <= 90 ? ['N', 'E', az] : az <= 180 ? ['S', 'E', 180 - az] : az <= 270 ? ['S', 'W', az - 180] : ['N', 'W', 360 - az];
  let d = Math.floor(ang), m = Math.floor((ang - d) * 60), s = Math.round(((ang - d) * 60 - m) * 60); if (s === 60) { s = 0; m++; } if (m === 60) { m = 0; d++; }
  return ns + ' ' + String(d).padStart(2, '0') + '°' + String(m).padStart(2, '0') + "'" + String(s).padStart(2, '0') + '" ' + ew;
}
export const ringAreaFt = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return Math.abs(s / 2); };
export const perimeterFt = r => r.reduce((s, p, i) => s + Math.hypot(r[(i + 1) % r.length][0] - p[0], r[(i + 1) % r.length][1] - p[1]), 0);
// miles between two [lon, lat] points
export const milesLL = (a, b) => { const r = Math.PI / 180, h = Math.sin((b[1] - a[1]) * r / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin((b[0] - a[0]) * r / 2) ** 2; return 2 * R_FT * Math.asin(Math.sqrt(h)) / 5280; };
// an open ring (the GeoJSON polygon's outer ring without its closing point)
export const openRing = ring => ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
