// Shared pieces for drawing plan set sheets (lib/planset.mjs and the sheet modules in lib/sheets/): units, the drawing
// area inside the title block frame, architectural scales, view titles, tables, note blocks and SVG primitives. Every
// sheet body is an HTML string placed inside the frame (lib/titleblock.mjs FRAME) of a 36 x 24 in page; positions are in
// pt (1/72 in) from the frame's inner top left, drawings are SVG in CSS px (1/96 in). No DOM, no network.
import { FRAME } from './titleblock.mjs';

export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const f0 = v => Math.round(+v || 0).toLocaleString('en-US');
export const f1 = v => (Math.round((+v || 0) * 10) / 10).toLocaleString('en-US');
export const DPI = 96, PT = 72; // CSS px and pt per inch
export const PAD = 24; // pt of margin inside the frame
// the usable drawing area inside the frame, in pt and in inches
export const AREA = { x: PAD, y: PAD, w: FRAME.w - 2 * PAD, h: FRAME.h - 2 * PAD };
export const AREA_IN = { w: AREA.w / PT, h: AREA.h / PT };

// architectural scales, largest first: ft is the feet one inch of paper shows; label as printed
export const ARCH_SCALES = [
  { ft: 2, label: '1/2" = 1\'-0"' }, { ft: 8 / 3, label: '3/8" = 1\'-0"' }, { ft: 4, label: '1/4" = 1\'-0"' }, { ft: 16 / 3, label: '3/16" = 1\'-0"' },
  { ft: 8, label: '1/8" = 1\'-0"' }, { ft: 32 / 3, label: '3/32" = 1\'-0"' }, { ft: 16, label: '1/16" = 1\'-0"' }, { ft: 32, label: '1/32" = 1\'-0"' }, { ft: 64, label: '1/64" = 1\'-0"' }
];
// engineering (site) scales: 1" = n'
export const ENG_SCALES = [10, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500, 600, 800, 1000];
// the largest architectural scale at which wFt x dFt (feet) fits in wIn x hIn (inches) -> { ft, label, k (px per ft) }
export function archScale(wFt, dFt, wIn, hIn) {
  const s = ARCH_SCALES.find(x => wFt / x.ft <= wIn && dFt / x.ft <= hIn) || ARCH_SCALES[ARCH_SCALES.length - 1];
  return { ...s, k: DPI / s.ft };
}
export function engScale(wFt, dFt, wIn, hIn) {
  const s = ENG_SCALES.find(x => wFt / x <= wIn && dFt / x <= hIn) || Math.ceil(Math.max(wFt / wIn, dFt / hIn) / 100) * 100;
  return { ft: s, label: '1" = ' + s + "'-0\"", k: DPI / s };
}

// a view's title under (or over) a drawing: the circled number, the name, the scale
export function viewTitle(n, title, scale, css = '') {
  return '<div class="vt2" style="' + css + '"><i>' + esc(n) + '</i><div><b>' + esc(title) + '</b>' + (scale ? '<small>Scale: ' + esc(scale) + '</small>' : '') + '</div></div>';
}
// a black-band heading and a table; right: column indexes set right-aligned
export function table(title, head, rows, right = []) {
  return (title ? '<div class="bh">' + esc(title) + '</div>' : '') + '<table>' + (head ? '<tr>' + head.map((h, i) => '<th' + (right.includes(i) ? ' class="r"' : '') + '>' + esc(h) + '</th>').join('') + '</tr>' : '') +
    rows.map(r => '<tr>' + r.map((c, i) => '<td' + (right.includes(i) ? ' class="r"' : '') + '>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</table>';
}
export function notes(title, list, ordered = true) {
  const items = (list || []).filter(Boolean); if (!items.length) return '';
  return '<div class="blk"><div class="bh">' + esc(title) + '</div><' + (ordered ? 'ol' : 'ul') + '>' + items.map(n => '<li>' + esc(n) + '</li>').join('') + '</' + (ordered ? 'ol' : 'ul') + '></div>';
}
// an absolutely placed box inside the frame (pt)
export const at = (x, y, w, h, html, css = '') => '<div style="position:absolute;left:' + (+x).toFixed(1) + 'pt;top:' + (+y).toFixed(1) + 'pt;width:' + (+w).toFixed(1) + 'pt;' + (h ? 'height:' + (+h).toFixed(1) + 'pt;' : '') + 'overflow:hidden;' + css + '">' + html + '</div>';
// the standard right-hand column most sheets use for legend, tables and notes: x from the right edge, full height
export const SIDE_W = 520;
export const side = html => at(AREA.x + AREA.w - SIDE_W, AREA.y, SIDE_W, AREA.h, html);
// the drawing area left of the side column, in pt
export const MAIN = { x: AREA.x, y: AREA.y, w: AREA.w - SIDE_W - 24, h: AREA.h };

// ---------- SVG ----------
// svg(wPx, hPx, body): an inline SVG of that size in CSS px; n(v): a number for an attribute
export const n = v => (Math.round((+v || 0) * 100) / 100).toString();
export const svg = (w, h, body, extra = '') => '<svg xmlns="http://www.w3.org/2000/svg" width="' + n(w) + '" height="' + n(h) + '" viewBox="0 0 ' + n(w) + ' ' + n(h) + '"' + extra + ' style="overflow:visible;display:block">' + DEFS + body + '</svg>';
export const line = (x1, y1, x2, y2, a = '') => '<line x1="' + n(x1) + '" y1="' + n(y1) + '" x2="' + n(x2) + '" y2="' + n(y2) + '" ' + (a || 'stroke="#1b1e1f" stroke-width="1"') + '/>';
export const rect = (x, y, w, h, a = '') => '<rect x="' + n(Math.min(x, x + w)) + '" y="' + n(Math.min(y, y + h)) + '" width="' + n(Math.abs(w)) + '" height="' + n(Math.abs(h)) + '" ' + (a || 'fill="none" stroke="#1b1e1f" stroke-width="1"') + '/>';
export const circle = (x, y, r, a = '') => '<circle cx="' + n(x) + '" cy="' + n(y) + '" r="' + n(r) + '" ' + (a || 'fill="none" stroke="#1b1e1f" stroke-width="1"') + '/>';
export const path = (d, a = '') => '<path d="' + d + '" ' + (a || 'fill="none" stroke="#1b1e1f" stroke-width="1"') + '/>';
export const poly = (pts, a = '') => '<polygon points="' + pts.map(p => n(p[0]) + ',' + n(p[1])).join(' ') + '" ' + (a || 'fill="none" stroke="#1b1e1f" stroke-width="1"') + '/>';
export const pline = (pts, a = '') => '<polyline points="' + pts.map(p => n(p[0]) + ',' + n(p[1])).join(' ') + '" ' + (a || 'fill="none" stroke="#1b1e1f" stroke-width="1"') + '/>';
export const text = (x, y, s, size = 9, a = '') => '<text x="' + n(x) + '" y="' + n(y) + '" font-size="' + n(size) + '" font-family="Arial, Helvetica, sans-serif" ' + (a || 'fill="#1b1e1f"') + '>' + esc(s) + '</text>';
// a dimension line from (x1,y1) to (x2,y2) with ticks, its text offset `off` px to the left of the direction of travel
export function dim(x1, y1, x2, y2, label, off = 14, size = 8) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy * off, ny = ux * off, a = Math.atan2(dy, dx) * 180 / Math.PI;
  const X1 = x1 + nx, Y1 = y1 + ny, X2 = x2 + nx, Y2 = y2 + ny, t = (x, y) => line(x - 3 * (ux - uy), y - 3 * (uy + ux), x + 3 * (ux - uy), y + 3 * (uy + ux), 'stroke="#1b1e1f" stroke-width="1"');
  const rot = a > 90 || a < -90 ? a + 180 : a, mx = (X1 + X2) / 2 + nx / Math.abs(off || 1) * 4, my = (Y1 + Y2) / 2 + ny / Math.abs(off || 1) * 4;
  return line(x1, y1, X1 + nx * 0.2, Y1 + ny * 0.2, 'stroke="#6b7174" stroke-width=".6"') + line(x2, y2, X2 + nx * 0.2, Y2 + ny * 0.2, 'stroke="#6b7174" stroke-width=".6"') +
    line(X1, Y1, X2, Y2, 'stroke="#1b1e1f" stroke-width=".7"') + t(X1, Y1) + t(X2, Y2) +
    '<text x="' + n(mx) + '" y="' + n(my) + '" font-size="' + size + '" font-family="Arial, Helvetica, sans-serif" text-anchor="middle" dominant-baseline="middle" transform="rotate(' + n(rot) + ' ' + n(mx) + ' ' + n(my) + ')" fill="#1b1e1f" paint-order="stroke" stroke="#fff" stroke-width="3">' + esc(label) + '</text>';
}
// feet as 12'-6"
export function ftIn(v) { const t = Math.round(Math.abs(+v || 0) * 12), f = Math.floor(t / 12), i = t % 12; return (v < 0 ? '-' : '') + f + "'-" + i + '"'; }
// patterns: hatch (diagonal lines), brick, earth, concrete (dots), insulation-ish; use fill="url(#hatch)"
export const DEFS = '<defs>' +
  '<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#6b7174" stroke-width=".6"/></pattern>' +
  '<pattern id="hatch2" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="#1b1e1f" stroke-width=".7"/></pattern>' +
  '<pattern id="brick" width="16" height="8" patternUnits="userSpaceOnUse"><path d="M0 0H16M0 4H16M0 8H16M4 0V4M12 4V8" stroke="#8a8f8c" stroke-width=".5" fill="none"/></pattern>' +
  '<pattern id="siding" width="10" height="5" patternUnits="userSpaceOnUse"><path d="M0 5H10" stroke="#8a8f8c" stroke-width=".5"/></pattern>' +
  '<pattern id="earth" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 10L10 0M-2 2L2 -2M8 12L12 8" stroke="#8a6d4a" stroke-width=".6"/></pattern>' +
  '<pattern id="conc" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".6" fill="#6b7174"/><circle cx="6" cy="5" r=".5" fill="#6b7174"/><path d="M4 7l1-1.5 1 1.5z" fill="none" stroke="#6b7174" stroke-width=".4"/></pattern>' +
  '<marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#1b1e1f"/></marker>' +
  '</defs>';

// the CSS the sheet modules can rely on (added once to the set's document by lib/planset.mjs)
export const KIT_CSS = '.vt2{display:flex;align-items:center;gap:8pt;font-family:Arial,Helvetica,sans-serif}.vt2 i{display:inline-flex;flex:none;width:22pt;height:22pt;border:1.2pt solid #1b1e1f;border-radius:50%;align-items:center;justify-content:center;font-style:normal;font-weight:800;font-size:10pt}' +
  '.vt2 b{display:block;font-size:11pt;font-weight:800;text-transform:uppercase;border-bottom:1.2pt solid #1b1e1f;padding-bottom:1pt}.vt2 small{display:block;font-size:8pt;margin-top:2pt}' +
  '.sm{font-size:8pt;line-height:1.35}.tag{display:inline-block;border:1pt solid #1b1e1f;padding:1pt 4pt;font-size:7.5pt;font-weight:700}.warnbox{border:1.2pt solid #c0392b;color:#1b1e1f;padding:6pt;font-size:8pt;line-height:1.35}.warnbox b{color:#c0392b}' +
  '.lg2{display:flex;align-items:center;gap:6pt;font-size:8.5pt;margin:2pt 0}.lg2 svg{flex:none}';

// ---------- symbols and line types (G-002's legend draws these; the sheets use the same) ----------
// sym(kind, x, y, r): a symbol centred on (x, y), about 2r across, in px
const K = 'stroke="#1b1e1f" stroke-width="1" fill="none"', KF = 'stroke="#1b1e1f" stroke-width="1" fill="#1b1e1f"', T = (x, y, s, sz) => '<text x="' + n(x) + '" y="' + n(y) + '" font-size="' + n(sz) + '" font-family="Arial" text-anchor="middle" dominant-baseline="central" fill="#1b1e1f">' + s + '</text>';
export const SYMBOLS = {
  receptacle: ['Duplex receptacle', (x, y, r) => circle(x, y, r * 0.6, K) + line(x - r * 0.6, y - r * 0.25, x + r * 0.6, y - r * 0.25, K) + line(x - r * 0.6, y + r * 0.25, x + r * 0.6, y + r * 0.25, K)],
  gfci: ['GFCI receptacle', (x, y, r) => circle(x, y, r * 0.6, K) + line(x - r * 0.6, y - r * 0.25, x + r * 0.6, y - r * 0.25, K) + line(x - r * 0.6, y + r * 0.25, x + r * 0.6, y + r * 0.25, K) + T(x + r * 1.3, y, 'G', r * 0.9)],
  receptacle240: ['240 V receptacle', (x, y, r) => circle(x, y, r * 0.6, KF) + line(x - r, y, x + r, y, K)],
  switch: ['Switch', (x, y, r) => T(x, y, 'S', r * 1.3)],
  light: ['Ceiling light', (x, y, r) => circle(x, y, r * 0.7, K) + line(x - r * 0.5, y - r * 0.5, x + r * 0.5, y + r * 0.5, K) + line(x - r * 0.5, y + r * 0.5, x + r * 0.5, y - r * 0.5, K)],
  recessed: ['Recessed downlight', (x, y, r) => circle(x, y, r * 0.55, K) + circle(x, y, r * 0.2, KF)],
  fixture2x4: ['2x4 LED troffer', (x, y, r) => rect(x - r, y - r * 0.5, 2 * r, r, K) + line(x - r, y - r * 0.5, x + r, y + r * 0.5, K)],
  exitsign: ['Exit sign', (x, y, r) => rect(x - r, y - r * 0.5, 2 * r, r, K) + T(x, y, 'EXIT', r * 0.6)],
  emergency: ['Emergency light', (x, y, r) => rect(x - r * 0.8, y - r * 0.4, 1.6 * r, 0.8 * r, KF) + circle(x - r * 0.4, y, r * 0.2, 'fill="#fff"') + circle(x + r * 0.4, y, r * 0.2, 'fill="#fff"')],
  smoke: ['Smoke alarm', (x, y, r) => circle(x, y, r * 0.7, K) + T(x, y, 'SD', r * 0.65)],
  co: ['CO alarm', (x, y, r) => circle(x, y, r * 0.7, K) + T(x, y, 'CO', r * 0.65)],
  fan: ['Exhaust fan', (x, y, r) => rect(x - r * 0.6, y - r * 0.6, r * 1.2, r * 1.2, K) + line(x - r * 0.6, y - r * 0.6, x + r * 0.6, y + r * 0.6, K) + line(x - r * 0.6, y + r * 0.6, x + r * 0.6, y - r * 0.6, K)],
  panel: ['Panelboard', (x, y, r) => rect(x - r * 0.3, y - r, r * 0.6, 2 * r, KF)],
  meter: ['Electric meter', (x, y, r) => circle(x, y, r * 0.7, K) + T(x, y, 'M', r * 0.8)],
  transformer: ['Pad-mounted transformer', (x, y, r) => rect(x - r, y - r * 0.7, 2 * r, 1.4 * r, K) + T(x, y, 'T', r * 0.9)],
  supply: ['Supply diffuser', (x, y, r) => rect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4, K) + line(x - r * 0.7, y - r * 0.7, x + r * 0.7, y + r * 0.7, K) + line(x - r * 0.7, y + r * 0.7, x + r * 0.7, y - r * 0.7, K)],
  return: ['Return grille', (x, y, r) => rect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4, K) + line(x - r * 0.7, y, x + r * 0.7, y, K) + line(x, y - r * 0.7, x, y + r * 0.7, K)],
  thermostat: ['Thermostat', (x, y, r) => circle(x, y, r * 0.6, K) + T(x, y, 'T', r * 0.7)],
  ahu: ['Air handler / furnace', (x, y, r) => rect(x - r, y - r * 0.7, 2 * r, 1.4 * r, K) + T(x, y, 'AHU', r * 0.55)],
  condenser: ['Condensing unit', (x, y, r) => rect(x - r * 0.8, y - r * 0.8, 1.6 * r, 1.6 * r, K) + circle(x, y, r * 0.55, K)],
  rtu: ['Rooftop unit', (x, y, r) => rect(x - r, y - r * 0.7, 2 * r, 1.4 * r, K) + line(x - r, y - r * 0.7, x + r, y + r * 0.7, K) + T(x, y, 'RTU', r * 0.5)],
  waterheater: ['Water heater', (x, y, r) => circle(x, y, r * 0.75, K) + T(x, y, 'WH', r * 0.6)],
  cleanout: ['Cleanout', (x, y, r) => circle(x, y, r * 0.45, K) + T(x, y + r, 'CO', r * 0.55)],
  floordrain: ['Floor drain', (x, y, r) => circle(x, y, r * 0.5, K) + line(x - r * 0.35, y, x + r * 0.35, y, K)],
  hosebibb: ['Hose bibb', (x, y, r) => circle(x, y, r * 0.4, KF) + line(x, y, x + r, y, K)],
  gatevalve: ['Gate valve', (x, y, r) => path('M' + n(x - r * 0.7) + ' ' + n(y - r * 0.5) + 'L' + n(x + r * 0.7) + ' ' + n(y + r * 0.5) + 'V' + n(y - r * 0.5) + 'L' + n(x - r * 0.7) + ' ' + n(y + r * 0.5) + 'Z', KF)],
  watermeter: ['Water meter', (x, y, r) => rect(x - r * 0.6, y - r * 0.45, 1.2 * r, 0.9 * r, K) + T(x, y, 'W', r * 0.6)],
  manhole: ['Manhole', (x, y, r) => circle(x, y, r * 0.7, K) + T(x, y, 'MH', r * 0.5)],
  inlet: ['Storm inlet', (x, y, r) => rect(x - r * 0.8, y - r * 0.45, 1.6 * r, 0.9 * r, K) + line(x - r * 0.8, y - r * 0.45, x + r * 0.8, y + r * 0.45, K)],
  hydrant: ['Fire hydrant', (x, y, r) => circle(x, y, r * 0.55, 'stroke="#c0392b" stroke-width="1.2" fill="#c0392b"') + line(x - r * 0.9, y, x + r * 0.9, y, 'stroke="#c0392b" stroke-width="1.2"')],
  fdc: ['Fire department connection', (x, y, r) => circle(x, y, r * 0.6, 'stroke="#c0392b" stroke-width="1.2" fill="none"') + T(x, y, 'FDC', r * 0.45)],
  piv: ['Post indicator valve', (x, y, r) => circle(x, y, r * 0.5, 'stroke="#c0392b" stroke-width="1.2" fill="none"') + T(x, y + r, 'PIV', r * 0.5)],
  sprinkler: ['Sprinkler head', (x, y, r) => circle(x, y, r * 0.35, 'stroke="#c0392b" stroke-width=".8" fill="#c0392b"')],
  riser: ['Sprinkler riser', (x, y, r) => circle(x, y, r * 0.7, 'stroke="#c0392b" stroke-width="1.2" fill="none"') + T(x, y, 'R', r * 0.7)],
  pull: ['Manual pull station', (x, y, r) => rect(x - r * 0.6, y - r * 0.6, 1.2 * r, 1.2 * r, KF) + T(x, y, 'F', r * 0.7).replace('fill="#1b1e1f"', 'fill="#fff"')],
  hornstrobe: ['Horn / strobe', (x, y, r) => rect(x - r * 0.6, y - r * 0.6, 1.2 * r, 1.2 * r, K) + path('M' + n(x - r * 0.4) + ' ' + n(y + r * 0.4) + 'L' + n(x) + ' ' + n(y - r * 0.4) + 'L' + n(x + r * 0.4) + ' ' + n(y + r * 0.4) + 'Z', K)],
  facp: ['Fire alarm control panel', (x, y, r) => rect(x - r, y - r * 0.6, 2 * r, 1.2 * r, K) + T(x, y, 'FACP', r * 0.45)],
  extinguisher: ['Fire extinguisher', (x, y, r) => path('M' + n(x) + ' ' + n(y - r * 0.7) + 'L' + n(x + r * 0.7) + ' ' + n(y + r * 0.6) + 'H' + n(x - r * 0.7) + 'Z', KF)],
  data: ['Data outlet (Cat 6)', (x, y, r) => path('M' + n(x) + ' ' + n(y - r * 0.6) + 'L' + n(x + r * 0.6) + ' ' + n(y + r * 0.5) + 'H' + n(x - r * 0.6) + 'Z', K)],
  wap: ['Wireless access point', (x, y, r) => circle(x, y, r * 0.6, K) + T(x, y, 'W', r * 0.65)],
  ont: ['Optical network terminal', (x, y, r) => rect(x - r * 0.8, y - r * 0.5, 1.6 * r, r, K) + T(x, y, 'ONT', r * 0.45)],
  handhole: ['Fiber handhole', (x, y, r) => rect(x - r * 0.7, y - r * 0.5, 1.4 * r, r, 'stroke="#7b3fa0" stroke-width="1.2" fill="none"') + T(x, y, 'HH', r * 0.45)],
  pole: ['Site light pole', (x, y, r) => circle(x, y, r * 0.35, KF) + line(x, y, x + r, y - r * 0.7, K) + circle(x + r, y - r * 0.7, r * 0.25, K)],
  wallpack: ['Wall pack light', (x, y, r) => path('M' + n(x - r * 0.6) + ' ' + n(y) + 'A' + n(r * 0.6) + ' ' + n(r * 0.6) + ' 0 0 1 ' + n(x + r * 0.6) + ' ' + n(y) + 'Z', KF)]
};
export const sym = (kind, x, y, r = 6) => (SYMBOLS[kind]?.[1] || SYMBOLS.receptacle[1])(x, y, r);
// site lines: stroke, dash and the label the legend shows
export const LINES = {
  water: { stroke: '#2f6db5', dash: '', w: 1.6, label: 'Water (W)' }, fireline: { stroke: '#c0392b', dash: '', w: 1.6, label: 'Fire line (FL)' }, sanitary: { stroke: '#6b4a2b', dash: '10 4', w: 1.6, label: 'Sanitary sewer (SS)' },
  storm: { stroke: '#1f9249', dash: '14 4 3 4', w: 1.8, label: 'Storm sewer (SD)' }, gas: { stroke: '#d29a1f', dash: '8 3 2 3', w: 1.2, label: 'Gas (G)' }, electric: { stroke: '#b5443a', dash: '12 3 2 3 2 3', w: 1.2, label: 'Underground electric (UE)' },
  fiber: { stroke: '#7b3fa0', dash: '6 3', w: 1.4, label: 'Fiber / telecom duct (F)' }, property: { stroke: '#c0392b', dash: '16 4 3 4', w: 1.6, label: 'Property line' }, easement: { stroke: '#6b7174', dash: '6 4', w: 1, label: 'Easement' },
  setback: { stroke: '#9aa0a2', dash: '4 4', w: 1, label: 'Building setback' }, firelane: { stroke: '#c0392b', dash: '', w: 3, label: 'Fire lane' }, silt: { stroke: '#1b1e1f', dash: '2 2 8 2', w: 1.4, label: 'Silt fence' },
  contour: { stroke: '#8a6d4a', dash: '3 3', w: .8, label: 'Contour (assumed)' }, flow: { stroke: '#2f6db5', dash: '', w: 1, label: 'Flow arrow' }
};
export const lineAttr = (k, scale = 1) => { const L = LINES[k] || LINES.water; return 'fill="none" stroke="' + L.stroke + '" stroke-width="' + n(L.w * scale) + '"' + (L.dash ? ' stroke-dasharray="' + L.dash + '"' : '') + ' stroke-linecap="round"'; };
// a legend row: the symbol or a line sample, then its label
export const legendSym = k => '<div class="lg2">' + svg(26, 18, sym(k, 13, 9, 7)) + '<span>' + esc(SYMBOLS[k]?.[0] || k) + '</span></div>';
export const legendLine = k => '<div class="lg2">' + svg(44, 12, line(2, 6, 42, 6, lineAttr(k))) + '<span>' + esc(LINES[k]?.label || k) + '</span></div>';
