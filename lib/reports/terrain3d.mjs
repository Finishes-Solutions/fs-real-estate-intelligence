// A 3D view of the ground for the Topographic report: the lidar grid (lib/terrain.mjs) drawn as a solid block of terrain
// seen from above at an angle, coloured by elevation and shaded by the sun, with contour bands on the surface and the
// site's boundary draped over it. Drawn here pixel by pixel (a small z-buffered rasterizer), so a PDF page needs no
// browser 3D. Pure: returns RGBA pixels for lib/reports/png.mjs, and a projector for labels laid over the image.
//   view3d(T, ring, { W, H, azimuth, elevation, exaggeration, ss }) -> { w, h, rgba, P([x, y, z]) -> [px, py, visible], ex, azimuth }
// azimuth: the compass bearing the viewer stands at, looking back at the site (225 = from the south-west).
// T: { nx, ny, cell, x0, y0, z } in feet (frame of the report), ring: the site boundary [[x, y] ft].
import { inRing } from '../siteplan.mjs';

// elevation colours, low to high (muted: the report is black and white with colour accents)
export const RAMP = [[0, [118, 158, 120]], [0.25, [172, 196, 140]], [0.5, [222, 214, 166]], [0.75, [205, 172, 132]], [1, [238, 232, 224]]];
const ramp = t => { t = Math.max(0, Math.min(1, t)); for (let i = 1; i < RAMP.length; i++) if (t <= RAMP[i][0]) { const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i], u = (t - a) / (b - a); return ca.map((v, k) => v + (cb[k] - v) * u); } return RAMP[RAMP.length - 1][1]; };

// how much to stretch heights so the ground's shape reads: relief about a fifth of the view's width, never flattened,
// at most 5×, in half steps. Steep land is shown true to scale.
export function autoExaggeration(T) {
  let lo = Infinity, hi = -Infinity; for (const v of T.z) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = Math.max((T.nx - 1) * T.cell, (T.ny - 1) * T.cell), relief = Math.max(hi - lo, 0.1);
  return Math.max(1, Math.min(5, Math.round(0.2 * span / relief * 2) / 2));
}

// a coarser copy of the grid when it is bigger than the picture can show (about one cell per 2 pixels)
function thin(T, max) {
  const k = Math.max(1, Math.ceil(Math.max(T.nx, T.ny) / max)); if (k === 1) return T;
  const nx = Math.floor((T.nx - 1) / k) + 1, ny = Math.floor((T.ny - 1) / k) + 1, z = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z[j * nx + i] = T.z[j * k * T.nx + i * k];
  return { nx, ny, cell: T.cell * k, x0: T.x0, y0: T.y0, z };
}

export function view3d(T0, ring, { W = 720, H = 430, azimuth = 225, elevation = 32, exaggeration, ss = 2 } = {}) {
  const T = thin(T0, Math.round(Math.max(W, H) * ss / 2.2)), { nx, ny, cell, x0, y0, z } = T;
  let zlo = Infinity, zhi = -Infinity; for (const v of z) { if (v < zlo) zlo = v; if (v > zhi) zhi = v; }
  const ex = exaggeration || autoExaggeration(T0), relief = Math.max(zhi - zlo, 0.1), cx = x0 + (nx - 1) * cell / 2, cy = y0 + (ny - 1) * cell / 2;
  const base = zlo - Math.max(relief * 0.18, (nx - 1) * cell * 0.025 / ex); // the block's floor, a little under the lowest ground
  // camera: standing at `azimuth`, looking back at the centre, `elevation` degrees down. Bearing 0 = north (+y), 90 = east (+x).
  const a = azimuth * Math.PI / 180, e = elevation * Math.PI / 180, fx = -Math.sin(a), fy = -Math.cos(a), rx = fy, ry = -fx; // forward (into the scene), right (forward east -> right is south)
  const ce = Math.cos(e), se = Math.sin(e);
  const cam = (x, y, h) => { const dx = x - cx, dy = y - cy, dz = (h - zlo) * ex, u = dx * rx + dy * ry, f = dx * fx + dy * fy; return [u, -(dz * ce + f * se), f * ce - dz * se]; }; // screen x, screen y (down), depth (far = bigger)
  // fit the block's eight corners to the picture
  const corners = []; for (const x of [x0, x0 + (nx - 1) * cell]) for (const y of [y0, y0 + (ny - 1) * cell]) for (const h of [base, zhi]) corners.push(cam(x, y, h));
  const mnx = Math.min(...corners.map(c => c[0])), mxx = Math.max(...corners.map(c => c[0])), mny = Math.min(...corners.map(c => c[1])), mxy = Math.max(...corners.map(c => c[1]));
  const w = W * ss, h = H * ss, pad = 14 * ss, s = Math.min((w - 2 * pad) / (mxx - mnx), (h - 2 * pad) / (mxy - mny)), ox = (w - (mxx - mnx) * s) / 2 - mnx * s, oy = (h - (mxy - mny) * s) / 2 - mny * s;
  const toScr = (x, y, hh) => { const [u, v, d] = cam(x, y, hh); return [u * s + ox, v * s + oy, d]; };

  // per-vertex: screen position, colour (elevation ramp × sun) and whether it is on the site
  const n = nx * ny, sx = new Float32Array(n), sy = new Float32Array(n), sd = new Float32Array(n), col = new Float32Array(n * 3), onSite = new Float32Array(n);
  const sun = (() => { const az = 315 * Math.PI / 180, al = 45 * Math.PI / 180; return [Math.sin(az) * Math.cos(al), Math.cos(az) * Math.cos(al), Math.sin(al)]; })(); // from the north-west, 45° up
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = x0 + i * cell, y = y0 + j * cell, [p, q, d] = toScr(x, y, z[k]); sx[k] = p; sy[k] = q; sd[k] = d;
    const a1 = Math.max(0, i - 1), b1 = Math.min(nx - 1, i + 1), c1 = Math.max(0, j - 1), d1 = Math.min(ny - 1, j + 1);
    const gx = (z[j * nx + b1] - z[j * nx + a1]) / ((b1 - a1) * cell) * ex, gy = (z[d1 * nx + i] - z[c1 * nx + i]) / ((d1 - c1) * cell) * ex, L = Math.hypot(gx, gy, 1);
    const lam = Math.max(0, (-gx * sun[0] - gy * sun[1] + sun[2]) / L), shade = 0.52 + 0.58 * lam, c = ramp((z[k] - zlo) / relief);
    col[k * 3] = c[0] * shade; col[k * 3 + 1] = c[1] * shade; col[k * 3 + 2] = c[2] * shade;
    onSite[k] = inRing([x, y], ring) ? 1 : 0;
  }
  const zb = new Float32Array(w * h).fill(Infinity), img = new Float32Array(w * h * 3).fill(255), zpx = new Float32Array(w * h).fill(NaN), site = new Float32Array(w * h);
  // one triangle: barycentric fill, nearest wins; carries the colour, the elevation and the on-site weight to each pixel
  function tri(A, B, Cc, cA, cB, cC, hA, hB, hC, oA, oB, oC) {
    const xmin = Math.max(0, Math.floor(Math.min(A[0], B[0], Cc[0]))), xmax = Math.min(w - 1, Math.ceil(Math.max(A[0], B[0], Cc[0]))), ymin = Math.max(0, Math.floor(Math.min(A[1], B[1], Cc[1]))), ymax = Math.min(h - 1, Math.ceil(Math.max(A[1], B[1], Cc[1])));
    const den = (B[1] - Cc[1]) * (A[0] - Cc[0]) + (Cc[0] - B[0]) * (A[1] - Cc[1]); if (Math.abs(den) < 1e-9) return;
    for (let py = ymin; py <= ymax; py++) for (let px = xmin; px <= xmax; px++) {
      const X = px + 0.5, Y = py + 0.5, l1 = ((B[1] - Cc[1]) * (X - Cc[0]) + (Cc[0] - B[0]) * (Y - Cc[1])) / den, l2 = ((Cc[1] - A[1]) * (X - Cc[0]) + (A[0] - Cc[0]) * (Y - Cc[1])) / den, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const d = l1 * A[2] + l2 * B[2] + l3 * Cc[2], o = py * w + px; if (d >= zb[o]) continue; zb[o] = d;
      for (let c = 0; c < 3; c++) img[o * 3 + c] = l1 * cA[c] + l2 * cB[c] + l3 * cC[c];
      zpx[o] = hA == null ? NaN : l1 * hA + l2 * hB + l3 * hC; site[o] = oA == null ? 0 : l1 * oA + l2 * oB + l3 * oC;
    }
  }
  const V = k => [sx[k], sy[k], sd[k]], Cv = k => [col[k * 3], col[k * 3 + 1], col[k * 3 + 2]];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a1 = j * nx + i, b1 = a1 + 1, c1 = a1 + nx + 1, d1 = a1 + nx;
    tri(V(a1), V(b1), V(c1), Cv(a1), Cv(b1), Cv(c1), z[a1], z[b1], z[c1], onSite[a1], onSite[b1], onSite[c1]);
    tri(V(a1), V(c1), V(d1), Cv(a1), Cv(c1), Cv(d1), z[a1], z[c1], z[d1], onSite[a1], onSite[c1], onSite[d1]);
  }
  // the block's four sides, plain grey, darker on the sides turned from the sun
  const edges = [[...Array(nx).keys()].map(i => i), [...Array(ny).keys()].map(j => j * nx + nx - 1), [...Array(nx).keys()].map(i => (ny - 1) * nx + nx - 1 - i), [...Array(ny).keys()].map(j => (ny - 1 - j) * nx)];
  for (const e1 of edges) {
    const p0 = e1[0], p1 = e1[e1.length - 1], ux = (p1 % nx - p0 % nx), uy = (Math.floor(p1 / nx) - Math.floor(p0 / nx)), nrm = [uy, -ux], ln = Math.hypot(...nrm) || 1, lit = Math.max(0, (nrm[0] * sun[0] + nrm[1] * sun[1]) / ln), g = 178 + 50 * lit, gc = [g, g, g + 2];
    for (let t = 0; t < e1.length - 1; t++) { const k1 = e1[t], k2 = e1[t + 1], b1 = toScr(x0 + (k1 % nx) * cell, y0 + Math.floor(k1 / nx) * cell, base), b2 = toScr(x0 + (k2 % nx) * cell, y0 + Math.floor(k2 / nx) * cell, base);
      tri(V(k1), V(k2), b2, gc, gc, gc); tri(V(k1), b2, b1, gc, gc, gc); }
  }
  // contour bands on the surface (every `step` ft, heavier every 5), and the site tinted with the accent
  const step = (() => { const r = relief / 12, p = 10 ** Math.floor(Math.log10(r)), m = r / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; })();
  const out = new Uint8Array((W * H) * 4);
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const o = py * w + px, hz = zpx[o]; if (Number.isNaN(hz)) continue;
    // a pixel's ground height change to its neighbours: lines a constant width on screen
    const hr = px + 1 < w && !Number.isNaN(zpx[o + 1]) ? Math.abs(zpx[o + 1] - hz) : 0, hd = py + 1 < h && !Number.isNaN(zpx[o + w]) ? Math.abs(zpx[o + w] - hz) : 0, gpx = Math.max(hr, hd, 1e-6);
    const near = v => Math.abs(hz / v - Math.round(hz / v)) * v / gpx; // distance to the nearest contour, in pixels
    let k = 1; if (near(step * 5) < 0.9 * ss) k = 0.62; else if (near(step) < 0.55 * ss) k = 0.84;
    const st = Math.min(1, site[o]) * 0.1;
    for (let c = 0; c < 3; c++) img[o * 3 + c] = img[o * 3 + c] * k * (1 - st) + [47, 107, 255][c] * st;
  }
  // the site boundary draped on the ground, drawn where it can be seen
  const zAtXY = (x, y) => { const fi = Math.max(0, Math.min(nx - 1.001, (x - x0) / cell)), fj = Math.max(0, Math.min(ny - 1.001, (y - y0) / cell)), i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    return z[j * nx + i] * (1 - u) * (1 - v) + z[j * nx + i + 1] * u * (1 - v) + z[(j + 1) * nx + i] * (1 - u) * v + z[(j + 1) * nx + i + 1] * u * v; };
  const lw = 1.3 * ss, tol = cell * 2 + relief * ex * 0.004; // (depth slack, feet: a line on the ground must not hide under its own surface)
  for (let r = 0; r < ring.length; r++) { const p = ring[r], q = ring[(r + 1) % ring.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]), m = Math.max(2, Math.ceil(L * s / 0.6));
    for (let t = 0; t <= m; t++) { const x = p[0] + (q[0] - p[0]) * t / m, y = p[1] + (q[1] - p[1]) * t / m, [X, Y, D] = toScr(x, y, zAtXY(x, y));
      for (let dy = -Math.ceil(lw); dy <= Math.ceil(lw); dy++) for (let dx = -Math.ceil(lw); dx <= Math.ceil(lw); dx++) { if (dx * dx + dy * dy > lw * lw) continue;
        const px = Math.round(X + dx), py = Math.round(Y + dy); if (px < 0 || py < 0 || px >= w || py >= h) continue; const o = py * w + px; if (D > zb[o] + tol) continue;
        img[o * 3] = 47; img[o * 3 + 1] = 107; img[o * 3 + 2] = 255; } } }
  // down to the picture's size (supersampled: smooth edges)
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) { let r = 0, g = 0, b = 0;
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) { const o = ((Y * ss + j) * w + X * ss + i) * 3; r += img[o]; g += img[o + 1]; b += img[o + 2]; }
    const q = ss * ss, o = (Y * W + X) * 4; out[o] = r / q; out[o + 1] = g / q; out[o + 2] = b / q; out[o + 3] = 255; }
  // labels go on top in SVG: where a ground point lands, and whether it is in sight
  const P = ([x, y, hh]) => { const [X, Y, D] = toScr(x, y, hh ?? zAtXY(x, y)), px = Math.round(X), py = Math.round(Y), o = py * w + px; return [X / ss, Y / ss, px >= 0 && py >= 0 && px < w && py < h && D <= zb[o] + tol]; };
  return { w: W, h: H, rgba: out, P, ex, azimuth, step, zlo, zhi, north: (() => { const [a0, b0] = toScr(cx, cy, zlo), [a2, b2] = toScr(cx, cy + 100, zlo); return Math.atan2(a2 - a0, -(b2 - b0)) * 180 / Math.PI; })() };
}
