// Shared pieces for every report (area reports, crime, FEMA, market, filings): the Finishes Solutions report layout and
// its PDF export, a small SVG map of an area, tables, bar charts, saving (recorded in the Reports tab), and the registry that
// puts every area report on the Site section, the Reports tab and the selection bar.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
export const slug = s => String(s || 'area').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'area';
export const fmt = v => v == null || v === '' || Number.isNaN(+v) ? '—' : (+v).toLocaleString('en-US', { maximumFractionDigits: Math.abs(+v) < 10 ? 1 : 0 });
export const today = () => new Date().toISOString().slice(0, 10);

// ---------- the Finishes Solutions report look (every report, on screen and as a PDF) ----------
// Letter, portrait unless a report needs the width (a wide filing list). Montserrat for text, IBM Plex Mono for labels and
// numbers, ink greys with the brand green #006527 as the accent: a dark title band with the white logo and a faint
// blueprint grid, a green rule, KPI tiles with a green left rule, hairline tables and section rules.
export const REPORT_CSS = '*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
  'body{margin:0;background:#fff;font-family:Montserrat,system-ui,sans-serif;color:#23282a;font-size:10.5px;line-height:1.5}.wrap{max-width:1000px;margin:0 auto;padding:28px}' +
  '.hd{position:relative;overflow:hidden;background:#16191a;color:#fff;border-radius:6px;padding:20px 22px 22px;display:flex;justify-content:space-between;align-items:flex-start;gap:24px;' +
    'background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:22px 22px}' +
  '.hd:after{content:"";position:absolute;left:0;right:0;bottom:0;height:4px;background:#006527}.hd img{height:40px;flex:none;margin-top:2px}' +
  '.k{font-family:"IBM Plex Mono",monospace;font-size:9px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:#006527}.hd .k{color:#8acda3}' +
  'h1{font-size:24px;line-height:1.15;letter-spacing:-.02em;font-weight:800;margin:7px 0 6px;color:#0b0d0c}.hd h1{color:#fff}.meta{color:#6b7174}.hd .meta{color:#bcc2c4;font-size:10.5px}' +
  'h2,.lt{position:relative;font-size:13px;font-weight:700;color:#0b0d0c;margin:22px 0 9px;padding-top:9px;border-top:1px solid #e8ebeb;break-after:avoid}h2:before,.lt:before{content:"";position:absolute;left:0;top:-1px;width:28px;height:2px;background:#006527}' +
  'h3{font-size:12px;font-weight:700;color:#0b0d0c;margin:0 0 8px}p{margin:8px 0}a{color:#006527;font-weight:600;text-decoration:none}' +
  '.kp,.kgrid{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #e8ebeb;border-radius:6px;margin-top:16px;break-inside:avoid}.kp>div,.kgrid>div{padding:10px 12px;border-left:1px solid #e8ebeb}' +
  '.kp>div:first-child,.kgrid>div:first-child{border-left:3px solid #006527}.kp b,.kgrid b{display:block;font-family:"IBM Plex Mono",monospace;font-size:17px;font-weight:600;color:#0b0d0c;line-height:1.25}' +
  '.kp span,.kgrid span{display:block;font-family:"IBM Plex Mono",monospace;font-size:8px;letter-spacing:.12em;text-transform:uppercase;color:#6b7174;margin-top:3px}' +
  '.map{margin-top:14px;border:1px solid #e8ebeb;border-radius:6px;overflow:hidden;break-inside:avoid}.rmap{break-inside:avoid}.map svg,.bars svg,.photo img{display:block;width:100%;height:auto}.bars{max-width:620px;break-inside:avoid}' +
  '.photo{margin-top:14px;border-radius:6px;overflow:hidden;max-height:340px}.photo img{object-fit:cover;max-height:340px}.cap{font-size:9px;color:#6b7174;margin-top:3px}' +
  '.two{display:grid;grid-template-columns:1fr 1fr;gap:22px}table{width:100%;border-collapse:collapse;font-size:10px}thead{display:table-header-group}' +
  'th{font-family:"IBM Plex Mono",monospace;font-size:8px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:#6b7174;text-align:left;border-bottom:1px solid #bcc2c4;padding:5px 6px}' +
  'td{border-bottom:1px solid #e8ebeb;padding:5px 6px;vertical-align:top}tbody tr:nth-child(even) td{background:#f8f9f9}.m{font-family:"IBM Plex Mono",monospace;font-size:9.5px;white-space:nowrap}.r{text-align:right}tr{break-inside:avoid}' +
  '.sc{color:#6b7174;font-size:9px}.lg{display:flex;flex-wrap:wrap;gap:14px;font-size:9.5px;color:#4d5457;margin-top:6px}.lg i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:-1px}' +
  '.rnote{color:#6b7174;font-size:9.5px;margin-top:6px}.bsec{break-inside:avoid}.full{break-before:page}' +
  '.ft{margin-top:22px;padding-top:10px;border-top:1px solid #e8ebeb;color:#6b7174;font-size:9px;line-height:1.55}' +
  '.sign{margin-top:16px;display:flex;justify-content:space-between;align-items:center;gap:16px;padding-top:10px;border-top:3px solid #006527;font-family:"IBM Plex Mono",monospace;font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:#6b7174;break-inside:avoid}.sign b{color:#0b0d0c;font-weight:600}' +
  '.pb{position:fixed;right:18px;top:18px;z-index:9;background:#006527;color:#fff;border:0;border-radius:4px;padding:9px 14px;font:600 12px Montserrat,sans-serif;cursor:pointer}' +
  '@media print{.pb{display:none}.wrap{padding:0;max-width:none}}';

// the whole document: the title band (kicker, title, meta, logo), the body, sources and the sign-off. css: the report's
// own extra rules; landscape: letter landscape (the PDF renderer is told the same).
export function reportDoc({ kicker, title, meta = '', body = '', sources = '', css = '', landscape = false }) {
  const logo = typeof location === 'undefined' ? 'logo-white.png' : new URL('logo-white.png', location.href).href, date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(kicker + ' — ' + title) + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet"><style>@page{size:letter' + (landscape ? ' landscape' : '') + ';margin:.5in .5in .6in}' + REPORT_CSS + css + '</style></head><body>' +
    '<button class="pb" onclick="window.print()">Print or Save as PDF</button><div class="wrap"><div class="hd"><div><div class="k">' + esc(kicker) + '</div><h1>' + esc(title) + '</h1><div class="meta">' + meta +
    (meta ? ' · ' : '') + 'Generated ' + date + '</div></div><img src="' + logo + '" alt="Finishes Solutions"></div>' +
    body + (sources ? '<div class="ft">Sources: ' + sources + '</div>' : '') +
    '<div class="sign"><span><b>Finishes Solutions</b> · Real Estate Development &amp; Operations</span><span>Building a Future Together</span></div></div></body></html>';
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
// ---------- report maps: a street map under the area ----------
// Esri World Street Map tiles (keyless https images, so the PDF renderer, which runs no scripts, loads them like any picture)
// with the area drawn on top in the same Web Mercator projection. Pure string building: no DOM, tested in test/reportmap.mjs.
//   layers: [{ geometry (Polygon, MultiPolygon, LineString, MultiLineString), stroke, fill, width, dash }]
//   points: [{ c: [lon, lat], r, color, o, label, hollow }]   lines: [{ coords: [[lon, lat]…], stroke, width }]
//   fit: geometry to frame instead of everything drawn; minSpanM: smallest area shown (a lone point gets this much around it)
//   px: the width it will print at (CSS px), so map labels come out at their normal size
export const BASEMAP = { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', attr: 'Basemap: Esri, HERE, Garmin, © OpenStreetMap contributors and the GIS user community' };
const R2D = 180 / Math.PI;
export const merc = ([lon, lat]) => { const s = Math.sin(Math.max(-85.05, Math.min(85.05, lat)) / R2D); return [(lon + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)]; };
const coordsOf = g => !g ? [] : g.type === 'Point' ? [g.coordinates] : g.type === 'LineString' || g.type === 'MultiPoint' ? g.coordinates : g.type === 'Polygon' || g.type === 'MultiLineString' ? g.coordinates.flat() : g.type === 'MultiPolygon' ? g.coordinates.flat(2) : g.type === 'Feature' ? coordsOf(g.geometry) : [];
const ringsOf = g => !g ? [] : g.type === 'Polygon' ? g.coordinates.map(r => [r, true]) : g.type === 'MultiPolygon' ? g.coordinates.flat().map(r => [r, true]) : g.type === 'LineString' ? [[g.coordinates, false]] : g.type === 'MultiLineString' ? g.coordinates.map(r => [r, false]) : g.type === 'Feature' ? ringsOf(g.geometry) : [];
// the frame: zoom and pixel window that fit the coordinates in a w × h box. The zoom can fall between whole levels: tiles of
// the nearest level are drawn at T = 256·2^(zoom − z) px (between about 180 and 360), so the area fills the frame
export function mapFrame(coords, { w, h, pad = 0.08, minSpanM = 600, maxZoom = 18, minZoom = 3 } = {}) {
  const pts = coords.filter(c => Number.isFinite(c?.[0]) && Number.isFinite(c?.[1])); if (!pts.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, lat = 0;
  for (const c of pts) { const [x, y] = merc(c); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); lat += c[1]; }
  const unitPerM = 1 / (40075016.7 * Math.cos(lat / pts.length / R2D)), min = minSpanM * unitPerM;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, sx = Math.max(x1 - x0, min) * (1 + 2 * pad), sy = Math.max(y1 - y0, min) * (1 + 2 * pad);
  const zf = Math.max(minZoom, Math.min(maxZoom, Math.log2(Math.min(w / (sx * 256), h / (sy * 256)))));
  return frameAt(cx, cy, zf, w, h);
}
const frameAt = (cx, cy, zf, w, h) => { const z = Math.round(zf), T = 256 * 2 ** (zf - z), size = T * 2 ** z; return { z, zf, T, size, left: cx * size - w / 2, top: cy * size - h / 2, w, h }; };
export function areaMap(layers = [], { W = 1000, H = 440, points = [], lines = [], fit = null, px = 700, pad, minSpanM, maxTiles = 48 } = {}) {
  const w = Math.round(px), h = Math.round(px * H / W);
  const all = fit ? coordsOf(fit) : [...layers.flatMap(l => coordsOf(l.geometry)), ...points.map(p => p.c), ...lines.flatMap(l => l.coords || [])];
  let f = mapFrame(all, { w, h, pad, minSpanM }); if (!f) return '';
  // keep the tile count sensible (each tile is one image request in the PDF renderer)
  const count = fr => (Math.floor((fr.left + w) / fr.T) - Math.floor(fr.left / fr.T) + 1) * (Math.floor((fr.top + h) / fr.T) - Math.floor(fr.top / fr.T) + 1);
  while (count(f) > maxTiles && f.zf > 3) f = frameAt((f.left + w / 2) / f.size, (f.top + h / 2) / f.size, f.zf - 0.5, w, h);
  const n = 2 ** f.z, T = f.T, pct = v => (v * 100).toFixed(3) + '%', tiles = [];
  for (let ty = Math.floor(f.top / T); ty <= Math.floor((f.top + h) / T); ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(f.left / T); tx <= Math.floor((f.left + w) / T); tx++) {
      const url = BASEMAP.url.replace('{z}', f.z).replace('{y}', ty).replace('{x}', ((tx % n) + n) % n);
      tiles.push('<img src="' + url + '" alt="" style="position:absolute;display:block;max-width:none;margin:0;left:' + pct((tx * T - f.left) / w) + ';top:' + pct((ty * T - f.top) / h) + ';width:' + pct(T / w) + ';height:' + pct(T / h) + '">');
    }
  }
  const pr = c => { const [x, y] = merc(c); return [x * f.size - f.left, y * f.size - f.top]; };
  const d = (rs) => rs.map(([r, closed]) => 'M' + r.map(c => pr(c).map(v => v.toFixed(1)).join(',')).join('L') + (closed ? 'Z' : '')).join('');
  const halo = 'stroke="#ffffff" stroke-opacity=".85" stroke-linejoin="round" stroke-linecap="round" fill="none"';
  const shapes = layers.map(l => { const rs = ringsOf(l.geometry); if (!rs.length) return ''; const path = d(rs), wd = l.width || 2, open = rs.every(([, c]) => !c);
    return '<path d="' + path + '" ' + halo + ' stroke-width="' + (wd + 3) + '"/><path d="' + path + '" fill="' + (open ? 'none' : l.fill || 'rgba(0,101,39,.10)') + '" fill-rule="evenodd" stroke="' + (l.stroke || '#006527') + '" stroke-width="' + wd + '" stroke-linejoin="round" stroke-linecap="round"' + (l.dash ? ' stroke-dasharray="7 4"' : '') + '/>'; }).join('');
  const segs = lines.map(l => (l.coords || []).length > 1 ? '<path d="' + d([[l.coords, false]]) + '" fill="none" stroke="' + (l.stroke || '#7c3aed') + '" stroke-width="' + (l.width || 2) + '" stroke-linecap="round" stroke-linejoin="round"/>' : '').join('');
  const dots = points.map(p => { const [x, y] = pr(p.c); if (x < -20 || y < -20 || x > w + 20 || y > h + 20) return ''; const r = p.r || 3, col = p.color || '#c2410c';
    return (p.hollow ? '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="1.6"/>'
      : '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r + '" fill="' + col + '" fill-opacity="' + (p.o ?? .9) + '" stroke="#ffffff" stroke-width="' + (r > 4 ? 1.5 : .8) + '"/>') +
      (p.label ? '<text x="' + (x + r + 4).toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" font-family="Montserrat,Arial,sans-serif" font-size="12" font-weight="700" fill="#23282a" stroke="#ffffff" stroke-width="3" paint-order="stroke">' + esc(p.label) + '</text>' : ''); }).join('');
  return '<div class="rmap" style="position:relative;width:100%;aspect-ratio:' + w + '/' + h + ';overflow:hidden;background:#eef0f0">' + tiles.join('') +
    '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:0;top:0;width:100%;height:100%;display:block">' + shapes + segs + dots + '</svg>' +
    '<div style="position:absolute;right:0;bottom:0;background:rgba(255,255,255,.8);font:9px/1.4 Arial,sans-serif;color:#444;padding:1px 5px">' + esc(BASEMAP.attr) + '</div></div>';
}
// the area on a street map (every area report); { plain: true } keeps the old outline-only drawing
export function areaSvg(layers, { W = 1000, H = 440, points = [], plain = false, ...o } = {}) {
  if (!plain) return areaMap(layers, { W, H, points, ...o });
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
// ---------- saving ----------
const blobData = b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(b); });
// the renderer can't reach this site's own files (preview deployments are behind a login): same-site images go inline
async function inlineImages(html) {
  const urls = [...new Set([...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map(m => m[1]))].filter(u => { try { return new URL(u, location.href).origin === location.origin; } catch (e) { return false; } });
  for (const u of urls) { try { const r = await fetch(u); if (r.ok) html = html.split('src="' + u + '"').join('src="' + await blobData(await r.blob()) + '"'); } catch (e) {} }
  return html;
}
// a report as a PDF (rendered on the server in the report's own layout). If the PDF service can't be reached the
// report is saved as a web page instead (it has a Print or Save as PDF button), and the toast says so.
// meta: what the Reports tab records with it (report kind, scope, counts)
export async function savePdf(ctx, kind, label, html, { landscape = false, meta = {}, name = kind + '-report-' + slug(label) + '-' + today() } = {}) {
  const title = (/<title>([^<]*)<\/title>/.exec(html)?.[1] || label).replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  ctx.toast?.('Preparing the PDF…');
  let blob = null, why = '';
  try {
    const r = await fetch('api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html: await inlineImages(html), landscape, title }) });
    if (r.ok && /pdf/.test(r.headers.get('content-type') || '')) blob = await r.blob(); else why = (await r.json().catch(() => ({}))).error || 'HTTP ' + r.status;
  } catch (e) { why = e.message; }
  ctx.exportMeta = { report: kind, scope: label, ...meta, format: blob ? 'pdf' : 'html' };
  try {
    if (blob) await ctx.saveFile(name + '.pdf', blob, 'application/pdf');
    else { await ctx.saveFile(name + '.html', html, 'text/html'); ctx.toast?.('The PDF couldn’t be made (' + why + '). Saved as a web page instead: open it and use Print → Save as PDF.'); }
  } finally { ctx.exportMeta = null; }
}
// the same report as a web page
export async function saveHtml(ctx, kind, label, html, meta = {}) {
  ctx.exportMeta = { report: kind, format: 'html', scope: label, ...meta };
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
