// The Topographic report for the selected parcel or parcels: bare-ground lidar (lib/terrain.mjs's grid, from the USGS 3DEP
// elevation image, api/terrain.js) drawn as contours over a hillshade, the slope and which way the water runs, two cross-
// sections through the site, the ground's numbers and the earthwork to level it at a few pad heights.
// Plain look (lib/reports/plain.mjs): unbranded. Pure but for the PNG encoder it is handed (lib/reports/png.mjs on the
// server), which turns the hillshade and slope rasters into images.
//   topoReport({ title, area, date, terrain: T, ring: [[x, y] ft], origin: [lon, lat], png: (w, h, rgba) -> url }) -> HTML
// T covers the site and its surroundings (a margin of a few hundred feet reads better than the site alone), in the same
// feet as ring (frame(origin), lib/siteplan.mjs).
import { C, esc, n0, n1, n2, doc, pageOf, card, tiles, table, bars, fit, pathOf, gridSvg, northArrow, scaleBar, chip, niceStep } from './plain.mjs';
import { frame, inRing } from '../siteplan.mjs';
import { smoothed, zAt, summary, compass, sourceLine } from '../terrain.mjs';

export const SLOPES = [[0, 2, 'Flat', '#f1f3f4'], [2, 5, 'Gentle', '#c6d7ff'], [5, 10, 'Moderate', '#7fa3ff'], [10, 15, 'Steep', '#2f6bff'], [15, Infinity, 'Very steep', '#0b2e8a']];
// slope in percent at each grid point (central differences)
export function slopeGrid(T) {
  const { nx, ny, cell, z } = T, s = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = Math.max(0, i - 1), b = Math.min(nx - 1, i + 1), c = Math.max(0, j - 1), d = Math.min(ny - 1, j + 1);
    s[j * nx + i] = Math.hypot((z[j * nx + b] - z[j * nx + a]) / ((b - a) * cell || 1), (z[d * nx + i] - z[c * nx + i]) / ((d - c) * cell || 1)) * 100; }
  return s;
}
// contour lines at `interval` ft: marching squares, segments joined into lines -> [{ z, lines: [[[x, y] ft, …]] }]
export function contourLines(T, interval) {
  const { nx, ny, cell, x0, y0, z } = T; let lo = Infinity, hi = -Infinity; for (const v of z) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const out = [];
  for (let lev = Math.ceil(lo / interval) * interval; lev <= hi; lev += interval) {
    const segs = [], P = (i, j) => [x0 + i * cell, y0 + j * cell], cut = (i1, j1, i2, j2) => { const a = z[j1 * nx + i1], b = z[j2 * nx + i2], t = (lev - a) / (b - a), p = P(i1, j1), q = P(i2, j2); return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; };
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = z[j * nx + i] >= lev, b = z[j * nx + i + 1] >= lev, c = z[(j + 1) * nx + i + 1] >= lev, d = z[(j + 1) * nx + i] >= lev, k = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
      if (k === 0 || k === 15) continue;
      const e = { s: () => cut(i, j, i + 1, j), r: () => cut(i + 1, j, i + 1, j + 1), n: () => cut(i, j + 1, i + 1, j + 1), l: () => cut(i, j, i, j + 1) };
      const pairs = { 1: ['l', 's'], 2: ['s', 'r'], 3: ['l', 'r'], 4: ['r', 'n'], 6: ['s', 'n'], 7: ['l', 'n'], 8: ['n', 'l'], 9: ['n', 's'], 11: ['n', 'r'], 12: ['r', 'l'], 13: ['r', 's'], 14: ['s', 'l'] };
      if (k === 5) { segs.push([e.l(), e.n()], [e.s(), e.r()]); continue; } if (k === 10) { segs.push([e.l(), e.s()], [e.r(), e.n()]); continue; }
      const [u, v] = pairs[k]; segs.push([e[u](), e[v]()]);
    }
    // join the segments end to end (points rounded to a hundredth of a foot to match)
    const key = p => Math.round(p[0] * 100) + ',' + Math.round(p[1] * 100), ends = new Map(), used = new Uint8Array(segs.length);
    segs.forEach((sg, k) => { for (const p of sg) { const kk = key(p); (ends.get(kk) || ends.set(kk, []).get(kk)).push(k); } });
    const lines = [];
    for (let s0 = 0; s0 < segs.length; s0++) { if (used[s0]) continue; used[s0] = 1; const line = [segs[s0][0], segs[s0][1]];
      for (const dir of [1, 0]) { for (;;) { const tip = dir ? line[line.length - 1] : line[0], nxt = (ends.get(key(tip)) || []).find(k => !used[k]); if (nxt == null) break; used[nxt] = 1;
        const sg = segs[nxt], p = key(sg[0]) === key(tip) ? sg[1] : sg[0]; if (dir) line.push(p); else line.unshift(p); } }
      lines.push(line); }
    out.push({ z: lev, lines });
  }
  return out;
}
// a picture of the grid: one pixel per point, row 0 north; colour(k) -> [r, g, b, a]
function raster(T, png, colour) {
  const { nx, ny } = T, px = new Uint8Array(nx * ny * 4);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const c = colour(j * nx + i), o = ((ny - 1 - j) * nx + i) * 4; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = c[3] ?? 255; }
  return png(nx, ny, px);
}
// hillshade (sun from the north-west, 45° up), light: the contours carry the reading
function hillshade(T, png, { exaggerate = 3 } = {}) {
  const { nx, ny, cell, z } = T, az = 315 * Math.PI / 180, alt = 45 * Math.PI / 180;
  return raster(T, png, k => { const i = k % nx, j = (k - i) / nx, a = Math.max(0, i - 1), b = Math.min(nx - 1, i + 1), c = Math.max(0, j - 1), d = Math.min(ny - 1, j + 1);
    const dzdx = (z[j * nx + b] - z[j * nx + a]) / ((b - a) * cell) * exaggerate, dzdy = (z[d * nx + i] - z[c * nx + i]) / ((d - c) * cell) * exaggerate, slope = Math.atan(Math.hypot(dzdx, dzdy)), aspect = Math.atan2(dzdy, -dzdx);
    const h = Math.max(0, Math.cos(alt) * Math.cos(slope) + Math.sin(alt) * Math.sin(slope) * Math.cos(az - Math.PI / 2 - aspect)), g = Math.round(205 + 50 * h); return [g, g, g + 1]; });
}

const mapFrame = (V, W, H, inner, F, step) => '<svg class="map" style="margin:0 auto" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' + inner + gridSvg(V, step, F.toLL).replace(/stroke="#eceef0"/g, 'stroke="rgba(0,0,0,.06)"') + northArrow(W - 26, 12) + scaleBar(V) + '</svg>';
const imageOver = (V, T, url) => { const [x1, y1] = V.P([T.x0 - T.cell / 2, T.y0 + (T.ny - 0.5) * T.cell]), [x2, y2] = V.P([T.x0 + (T.nx - 0.5) * T.cell, T.y0 - T.cell / 2]);
  return '<image href="' + url + '" x="' + x1.toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + (x2 - x1).toFixed(1) + '" height="' + (y2 - y1).toFixed(1) + '" preserveAspectRatio="none" style="image-rendering:auto"/>'; };
const pl = (V, line) => line.map((p, i) => (i ? 'L' : 'M') + V.P(p).map(v => v.toFixed(1)).join(' ')).join('');

// the earthwork to level the site at `pad` ft: cut and fill in cubic yards (grid cells inside the ring)
export function earthwork(T, ring, pad) {
  let cut = 0, fill = 0; const a = T.cell * T.cell;
  for (let j = 0; j < T.ny; j++) for (let i = 0; i < T.nx; i++) { const p = [T.x0 + i * T.cell, T.y0 + j * T.cell]; if (!inRing(p, ring)) continue; const d = T.z[j * T.nx + i] - pad; if (d > 0) cut += d * a; else fill -= d * a; }
  return { cut: cut / 27, fill: fill / 27, net: (fill - cut) / 27 };
}
// a cross-section: elevations every ~3 ft along a line through c at `deg` (from east), ±len ft; inside: on the site
export function section(T, ring, c, deg, len) {
  const u = [Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180)], n = Math.max(20, Math.round(2 * len / Math.max(2, T.cell))), pts = [];
  for (let k = 0; k <= n; k++) { const t = -len + 2 * len * k / n, p = [c[0] + u[0] * t, c[1] + u[1] * t]; if (p[0] < T.x0 || p[1] < T.y0 || p[0] > T.x0 + (T.nx - 1) * T.cell || p[1] > T.y0 + (T.ny - 1) * T.cell) continue; pts.push({ t, p, z: zAt(T, p), inside: inRing(p, ring) }); }
  return pts;
}
function sectionSvg(S, name, { W = 720, H = 150 } = {}) {
  if (S.length < 2) return '';
  const t0 = S[0].t, t1 = S[S.length - 1].t; let z0 = Infinity, z1 = -Infinity; for (const s of S) { z0 = Math.min(z0, s.z); z1 = Math.max(z1, s.z); }
  const zs = niceStep(Math.max(1, (z1 - z0) / 4)), lo = Math.floor(z0 / zs) * zs - zs, hi = Math.ceil(z1 / zs) * zs + zs, L = 44, R = 10, Tp = 16, B = 22, X = t => L + (t - t0) / (t1 - t0) * (W - L - R), Y = z => Tp + (hi - z) / (hi - lo) * (H - Tp - B);
  const ex = ((W - L - R) / (t1 - t0)) / ((H - Tp - B) / (hi - lo)), o = ['<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">'];
  for (let z = lo; z <= hi + 1e-9; z += zs) o.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(z).toFixed(1) + '" y2="' + Y(z).toFixed(1) + '" stroke="' + C.grid + '"/><text x="' + (L - 4) + '" y="' + (Y(z) + 2.5).toFixed(1) + '" font-family="IBM Plex Mono" font-size="6.5" fill="' + C.sub + '" text-anchor="end">' + n0(z) + '</text>');
  const ts = niceStep((t1 - t0) / 6); for (let t = Math.ceil(t0 / ts) * ts; t <= t1; t += ts) o.push('<text x="' + X(t).toFixed(1) + '" y="' + (H - 8) + '" font-family="IBM Plex Mono" font-size="6.5" fill="' + C.sub + '" text-anchor="middle">' + n0(t) + '</text>');
  // the site's stretch shaded, the ground filled grey, the line black
  let a = null; S.forEach((s, k) => { if (s.inside && a == null) a = s.t; if ((!s.inside || k === S.length - 1) && a != null) { o.push('<rect x="' + X(a).toFixed(1) + '" y="' + Tp + '" width="' + (X(s.t) - X(a)).toFixed(1) + '" height="' + (H - Tp - B) + '" fill="' + C.accentFill + '"/>'); a = null; } });
  const line = S.map((s, k) => (k ? 'L' : 'M') + X(s.t).toFixed(1) + ' ' + Y(s.z).toFixed(1)).join('');
  o.push('<path d="' + line + 'L' + X(t1).toFixed(1) + ' ' + Y(lo).toFixed(1) + 'L' + X(t0).toFixed(1) + ' ' + Y(lo).toFixed(1) + 'Z" fill="#eef0f2"/><path d="' + line + '" fill="none" stroke="' + C.ink + '" stroke-width="1.2"/>');
  o.push('<text x="' + L + '" y="10" font-family="IBM Plex Mono" font-size="7" font-weight="600">' + name + '</text><text x="' + (W - R) + '" y="10" font-family="IBM Plex Mono" font-size="6.5" fill="' + C.sub + '" text-anchor="end">FT NAVD 88 · DISTANCE FT FROM SITE CENTRE · VERTICAL ×' + n0(ex) + '</text></svg>');
  return o.join('');
}

export function topoReport({ title, area = '', date = '', terrain: T0, ring, origin, png, source = '' }) {
  const F = frame(origin), passes = Math.max(1, Math.round(10 / T0.cell)), T = smoothed(T0, passes), s = summary(T0, ring), sl = slopeGrid(T);
  const head = { kicker: 'Topography', title, rightSub: area, right: s ? n1(s.min) + '–' + n1(s.max) + ' ft · ' + (s.flat ? 'nearly flat' : 'falls ' + s.toward) : '' };
  const src = source || sourceLine(T0), foot = 'Bare-ground elevations from ' + esc(src) + ', NAVD 88 feet, sampled every ' + n0(T0.cell) + ' ft (' + n0(T0.nx * T0.ny) + ' points) · smoothed over about 10 ft for contours · planning data, not a survey' + (date ? ' · ' + esc(date) : '');
  const box = [[T0.x0, T0.y0], [T0.x0 + (T0.nx - 1) * T0.cell, T0.y0 + (T0.ny - 1) * T0.cell]], asp = (T0.nx - 1) / Math.max(1, T0.ny - 1), H = Math.min(560, 720 / asp), W = Math.round(Math.min(720, H * asp)), V = fit(box, W, H, 0), step = niceStep(110 / V.s);
  // inside the site: elevations and slopes
  const zin = [], sin = []; for (let j = 0; j < T.ny; j++) for (let i = 0; i < T.nx; i++) if (inRing([T.x0 + i * T.cell, T.y0 + j * T.cell], ring)) { zin.push(T0.z[j * T.nx + i]); sin.push(sl[j * T.nx + i]); }
  zin.sort((a, b) => a - b); const q = f => zin[Math.min(zin.length - 1, Math.floor(f * (zin.length - 1)))], mean = zin.reduce((a, b) => a + b, 0) / (zin.length || 1);
  const relief = s ? s.max - s.min : 0, iv = relief > 40 ? 2 : relief > 4 ? 1 : 0.5, major = iv * 5, C1 = contourLines(T, iv);
  // 1. the contour map
  const cont = C1.map(c => { const maj = Math.abs(c.z / major - Math.round(c.z / major)) < 1e-6; return '<path d="' + c.lines.map(l => pl(V, l)).join('') + '" fill="none" stroke="' + (maj ? '#3c4043' : '#a8adb3') + '" stroke-width="' + (maj ? 0.9 : 0.4) + '" stroke-linejoin="round"/>'; }).join('');
  const labels = C1.filter(c => Math.abs(c.z / major - Math.round(c.z / major)) < 1e-6).flatMap(c => c.lines.filter(l => l.length > 40).slice(0, 3).map(l => { const p = V.P(l[Math.floor(l.length / 2)]); return p[0] > 30 && p[0] < W - 60 && p[1] > 30 && p[1] < H - 40 ? chip(p[0], p[1], n0(c.z), { size: 6.2, color: '#3c4043', stroke: 'none', bg: 'rgba(255,255,255,.85)' }) : ''; })).join('');
  const siteP = '<path d="' + pathOf(V, ring) + '" fill="none" stroke="' + C.accent + '" stroke-width="2"/>';
  const lowHigh = s ? ['low', 'high'].map(k => { const p = V.P(s[k]); return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.2" fill="' + (k === 'low' ? C.accent : '#fff') + '" stroke="' + C.accent + '" stroke-width="1.3"/>' + chip(p[0], p[1] - 10, (k === 'low' ? 'LOW ' : 'HIGH ') + n1(s[k === 'low' ? 'min' : 'max']), { size: 6.3, color: C.accent }); }).join('') : '';
  const map1 = mapFrame(V, W, H, imageOver(V, T, hillshade(T, png)) + cont + siteP + labels + lowHigh, F, step);
  const tl = tiles([[n1(s?.min), 'Lowest ft'], [n1(s?.max), 'Highest ft'], [n1(relief), 'Relief ft'], [n2(s?.slope) + '%', 'Average slope'], [s?.flat ? 'Flat' : n1(s?.fall) + ' ft', s?.flat ? 'Overall fall' : 'Falls ' + (s?.toward || '')]]);
  const pages = [pageOf({ ...head, sub: 'Contours every ' + iv + ' ft, heavier every ' + major + ' ft, over a hillshade' }, map1 + '<div style="height:9px"></div>' + tl +
    '<div class="row" style="margin-top:9px"><div class="col"><p class="para">' + esc(describe(s, T0, iv)) + '</p></div><div style="width:190px" class="note">Blue line: the site boundary · filled dot: lowest point on the site · open dot: highest · heavier contours labelled in feet above sea level (NAVD 88).</div></div>', foot)];
  // 2. slope and drainage
  const slopeImg = raster(T, png, k => { const v = sl[k], b = SLOPES.find(([a, c]) => v >= a && v < c) || SLOPES[0], h = b[3]; return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255]; });
  const H2 = Math.min(470, W / asp), V2 = fit(box, W, H2, 0), defs = '<defs>' + ['i', 'o'].map(k => '<marker id="ah' + k + '" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0L5 2.5L0 5Z" fill="' + (k === 'i' ? C.ink : '#80868b') + '"/></marker>').join('') + '</defs>';
  const map2 = mapFrame(V2, W, H2, defs + imageOver(V2, T, slopeImg) + flowArrows(T, ring, V2) + '<path d="' + pathOf(V2, ring) + '" fill="none" stroke="' + C.ink + '" stroke-width="1.8"/>', F, niceStep(110 / V2.s));
  const bandShare = SLOPES.map(([a, b, name, col]) => [name + ' (' + (b === Infinity ? '>' + a : a + '–' + b) + '%)', sin.filter(v => v >= a && v < b).length / (sin.length || 1) * 100, col === '#f1f3f4' ? '#bdc1c6' : col]);
  const hist = (() => { const lo = Math.floor(q(0)), hi = Math.ceil(q(1)), st = Math.max(0.5, niceStep((hi - lo) / 10)), bins = []; for (let z = Math.floor(lo / st) * st; z < hi; z += st) bins.push([n1(z) + '–' + n1(z + st) + ' ft', zin.filter(v => v >= z && v < z + st).length / zin.length * 100]); return bins; })();
  pages.push(pageOf({ ...head, kicker: 'Topography · slope & drainage', sub: 'Slope of the ground and the way surface water runs (arrows point downhill)' }, map2 +
    '<div style="margin-top:8px" class="row"><div class="col">' + '<div class="k" style="margin-bottom:3px">Slope on the site</div>' + bars(bandShare, { W: 350, labelW: 120, fmt: v => n1(v) + '%' }) + '</div><div class="col"><div class="k" style="margin-bottom:3px">How much of the site sits at each elevation</div>' + bars(hist, { W: 350, labelW: 90, fmt: v => n1(v) + '%', color: '#5f6368' }) + '</div></div>' +
    '<div class="row" style="margin-top:6px">' + SLOPES.map(([a, b, n, c]) => '<span class="note"><span class="dot" style="background:' + c + ';border:1px solid #dadce0"></span>' + n + ' ' + (b === Infinity ? '>' + a : a + '–' + b) + '%</span>').join('') + '</div>', foot));
  // 3. cross-sections, numbers and earthwork
  const c = (() => { let x = 0, y = 0; for (const p of ring) { x += p[0]; y += p[1]; } return [x / ring.length, y / ring.length]; })(), long = longAxis(ring), half = Math.min((T0.nx - 1) * T0.cell, (T0.ny - 1) * T0.cell) / 2 - 5;
  const SA = section(T0, ring, c, long, half), SB = section(T0, ring, c, long + 90, half);
  const pads = [['Lowest quarter', q(0.25)], ['Balanced (average)', mean], ['Highest quarter', q(0.75)]].map(([n, z]) => { const e = earthwork(T0, ring, z); return [n, n1(z), n0(e.cut), n0(e.fill), Math.abs(e.net) < 0.02 * Math.max(e.cut, e.fill, 1) ? 'balanced' : (e.net >= 0 ? 'import ' : 'export ') + n0(Math.abs(e.net))]; });
  const ground = card('The ground on the site', [['Lowest / highest', n1(s?.min) + ' / ' + n1(s?.max) + ' ft'], ['Most of the site (5th–95th %)', n1(s?.lo) + ' – ' + n1(s?.hi) + ' ft'], ['Average', n1(mean) + ' ft'], ['Overall slope (best-fit plane)', n2(s?.slope) + '%'],
    ['Falls', s?.flat ? 'Nearly flat' : n1(s?.fall) + ' ft toward the ' + s?.toward], ['Low channel or pond', s?.dip != null ? 'Yes, down to ' + n1(s.dip) + ' ft' : 'None found'], ['Uneven ground', s?.rough ? 'Yes, in places' : 'No'], ['Points on the site', n0(zin.length)]]);
  const data = card('The data', [['Source', src], ['Vertical datum', 'NAVD 88, feet'], ['Grid', 'every ' + n0(T0.cell) + ' ft · ' + n0(T0.nx) + ' × ' + n0(T0.ny)], ['Area covered', n0((T0.nx - 1) * T0.cell) + ' × ' + n0((T0.ny - 1) * T0.cell) + ' ft'], ['Typical accuracy', T0.resM && T0.resM <= 2 ? 'about ±0.3 ft vertical (QL2 lidar)' : 'a few feet (10 m model)'], ['Survey needed', 'Yes, for design']]);
  pages.push(pageOf({ ...head, kicker: 'Topography · sections & earthwork', sub: 'A–A runs along the site\'s long side, B–B across it, both through its centre' }, sectionSvg(SA, 'A–A  (' + compass([-Math.cos(long * Math.PI / 180), -Math.sin(long * Math.PI / 180)]).toUpperCase() + ' → ' + compass([Math.cos(long * Math.PI / 180), Math.sin(long * Math.PI / 180)]).toUpperCase() + ')') + '<div style="height:6px"></div>' +
    sectionSvg(SB, 'B–B  (' + compass([-Math.cos((long + 90) * Math.PI / 180), -Math.sin((long + 90) * Math.PI / 180)]).toUpperCase() + ' → ' + compass([Math.cos((long + 90) * Math.PI / 180), Math.sin((long + 90) * Math.PI / 180)]).toUpperCase() + ')') +
    '<div class="row" style="margin-top:10px"><div class="col">' + ground + data + '</div><div class="col"><div class="card"><span class="k">Earthwork to level the whole site</span>' + table([['Pad at'], ['Elev. ft', 'n'], ['Cut CY', 'n'], ['Fill CY', 'n'], ['Net CY', 'n']], pads) +
    '<p class="note" style="margin-top:5px">Bank cubic yards to grade the whole parcel flat at each height, before shrink and swell, topsoil stripping or a building pad\'s own lift. Real grading keeps slopes for drainage, so treat these as a range for budgeting.</p></div>' +
    card('What it means for a plan', drainageNotes(s, T0)) + '</div></div>', foot));
  return doc('Topography · ' + title, pages);
}
// arrows downhill on a lattice about 40 px apart (none where the ground is flatter than 0.3%), darker on the site
function flowArrows(T, ring, V) {
  const o = [], ga = Math.max(T.cell * 3, niceStep(40 / V.s)), xe = T.x0 + (T.nx - 1) * T.cell, ye = T.y0 + (T.ny - 1) * T.cell;
  for (let y = T.y0 + ga / 2; y < ye; y += ga) for (let x = T.x0 + ga / 2; x < xe; x += ga) {
    const gx = zAt(T, [x + T.cell, y]) - zAt(T, [x - T.cell, y]), gy = zAt(T, [x, y + T.cell]) - zAt(T, [x, y - T.cell]), g = Math.hypot(gx, gy), m = g / (2 * T.cell) * 100; if (m < 0.3) continue;
    const [px, py] = V.P([x, y]), L = Math.min(13, 5 + m * 1.2), ux = -gx / g, uy = gy / g, inside = inRing([x, y], ring); // (screen y runs down: downhill in y is +gy on screen)
    o.push('<path d="M' + (px - ux * L / 2).toFixed(1) + ' ' + (py - uy * L / 2).toFixed(1) + 'L' + (px + ux * L / 2).toFixed(1) + ' ' + (py + uy * L / 2).toFixed(1) + '" stroke="' + (inside ? C.ink : '#80868b') + '" stroke-width="' + (inside ? 0.9 : 0.6) + '" marker-end="url(#ah' + (inside ? 'i' : 'o') + ')"/>'); }
  return o.join('');
}
// the angle (degrees from east) of the ring's longest straight run: the long axis for section A–A
function longAxis(ring) { let best = 0, ang = 0; ring.forEach((a, i) => { const b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > best) { best = L; ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; } }); return ang; }
function describe(s, T, iv) {
  if (!s) return 'Not enough elevation data inside the boundary to describe the ground.';
  return 'The ground on the site runs from ' + n1(s.min) + ' to ' + n1(s.max) + ' ft above sea level' + (s.dip != null ? ', with a low channel or pond down to ' + n1(s.dip) + ' ft' : '') + '. ' +
    (s.flat ? 'Taken as a whole it is nearly flat, so drainage will be made by grading rather than by the land itself. ' : 'Taken as a whole it falls about ' + n1(s.fall) + ' ft toward the ' + s.toward + ' (' + n2(s.slope) + '% on average), so that side is where stormwater collects and detention most naturally goes. ') +
    'Contours are every ' + iv + ' ft from ' + (T.resM && T.resM <= 2 ? '1 m lidar' : 'the USGS elevation model') + ', smoothed so that curbs, ditches and wheel ruts don\'t crowd the drawing.';
}
function drainageNotes(s, T) {
  if (!s) return [];
  return [['Detention', s.flat ? 'Anywhere; size it by volume (flat land drains slowly)' : 'Low side, toward the ' + s.toward],
    ['Drains by gravity', s.flat ? 'Needs grading: under 2 ft of fall' : s.fall >= 2 ? 'Yes, about ' + n1(s.fall) + ' ft across' : 'Barely'],
    ['Building pads', s.slope > 5 ? 'Step them, or expect retaining walls' : 'One level pad works'],
    ['Watch for', s.dip != null ? 'A channel or pond: check for a floodway or drainage easement' : s.rough ? 'Ditches or mounds in places' : 'Nothing unusual in the data']];
}
