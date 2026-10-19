// Ground elevations over a site (api/terrain.js fetches them; the site facts, the layout engine and the plan set's civil
// sheets read them). Pure functions, no network.
// A terrain is a grid in the plan's own feet (x east, y north of plan.origin):
//   { x0, y0, cell, nx, ny, z: [ft NAVD 88 or null, row by row from y0], source, detail, resM, year, coarse, sig, at }
//   source/detail say where it came from ('USGS 3DEP', '1 m lidar'); coarse: a 90 m model or a handful of points,
//   good for which way the land falls but too rough to draw contours from.
// Elevations are bare ground (lidar with buildings and trees taken out), NAVD 88 feet. Not a survey.
import { frame, inRing, centroid } from './siteplan.mjs';

export const MAX_POINTS = 3600;
// a signature of the site (origin and boundary): a terrain fetched for one boundary isn't reused after the boundary moves
export function terrainSig(origin, ring) {
  let h = 2166136261; const add = t => { for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619) >>> 0; };
  add(origin.map(v => (+v).toFixed(6)).join(',')); for (const p of ring) add(';' + p.map(v => Math.round(+v)).join(',')); // (to the foot)
  return h.toString(36) + '.' + ring.length;
}

// the grid over the site's bounding box plus a margin: a cell of at least `minCell` ft, no more than MAX_POINTS points
export function gridSpec(ring, { margin = 30, maxPts = MAX_POINTS, minCell = 10 } = {}) {
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]), x0 = Math.min(...xs) - margin, y0 = Math.min(...ys) - margin, W = Math.max(...xs) + margin - x0, H = Math.max(...ys) + margin - y0;
  let cell = Math.max(minCell, Math.ceil(Math.sqrt(W * H / maxPts))), nx, ny;
  for (;;) { nx = Math.ceil(W / cell) + 1; ny = Math.ceil(H / cell) + 1; if (nx * ny <= maxPts) break; cell++; }
  return { x0: Math.round(x0), y0: Math.round(y0), cell, nx, ny };
}
// the grid's points in lon/lat, row by row (the order of z)
export function gridLL(spec, origin) {
  const F = frame(origin), out = [];
  for (let j = 0; j < spec.ny; j++) for (let i = 0; i < spec.nx; i++) out.push(F.toLL([spec.x0 + i * spec.cell, spec.y0 + j * spec.cell]));
  return out;
}
// a believable ground elevation in feet, else null (services answer NoData as text or as -3.4e38)
export const cleanZ = v => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) && n > -300 && n < 15000 ? n : null; };

// holes (no data under water or at a tile edge) filled from their neighbours; null when there's too little to go on
export function fillGaps(T) {
  const { nx, ny } = T, z = T.z.slice(), have = z.filter(v => v != null).length;
  if (have < Math.max(4, z.length * 0.25)) return null;
  for (let pass = 0; pass < nx + ny && z.some(v => v == null); pass++) {
    const nz = z.slice();
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (z[k] != null) continue; let s = 0, n = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < nx && b < ny && z[b * nx + a] != null) { s += z[b * nx + a]; n++; } }
      if (n) nz[k] = s / n; }
    z.splice(0, z.length, ...nz);
  }
  return { ...T, z };
}
// a copy with each point averaged with its neighbours (`passes` times): contours drawn from it don't wiggle round every
// ditch edge and wheel rut the lidar picked up
export function smoothed(T, passes = 1) {
  let z = T.z.slice(); const { nx, ny } = T;
  for (let p = 0; p < passes; p++) { const nz = z.slice();
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let s = 0, n = 0; for (let b = Math.max(0, j - 1); b <= Math.min(ny - 1, j + 1); b++) for (let a = Math.max(0, i - 1); a <= Math.min(nx - 1, i + 1); a++) { s += z[b * nx + a]; n++; } nz[j * nx + i] = s / n; }
    z = nz; }
  return { ...T, z };
}
// elevation at a point (bilinear; points off the grid take its nearest edge)
export function zAt(T, [x, y]) {
  const fx = Math.max(0, Math.min(T.nx - 1, (x - T.x0) / T.cell)), fy = Math.max(0, Math.min(T.ny - 1, (y - T.y0) / T.cell)), i = Math.min(T.nx - 2, Math.floor(fx)), j = Math.min(T.ny - 2, Math.floor(fy));
  if (T.nx < 2 || T.ny < 2) return T.z[0];
  const u = fx - i, v = fy - j, z = T.z, a = z[j * T.nx + i], b = z[j * T.nx + i + 1], c = z[(j + 1) * T.nx + i], d = z[(j + 1) * T.nx + i + 1];
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

const COMPASS = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'];
export const compass = ([dx, dy]) => COMPASS[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];

// what the ground does inside the boundary:
//   { min, max, mean, relief, slope (% of the best-fit plane), toward ('south-east', or '' when flat), low: [x, y], high,
//     lowEdge (index of the boundary edge on the lowest ground), flat (under 2 ft of relief), rough (the plane misses by a
//     lot somewhere: a ditch, a ridge or a pond inside) }
export function summary(T, ring) {
  const pts = [];
  for (let j = 0; j < T.ny; j++) for (let i = 0; i < T.nx; i++) { const p = [T.x0 + i * T.cell, T.y0 + j * T.cell], z = T.z[j * T.nx + i]; if (z != null && inRing(p, ring)) pts.push([p[0], p[1], z]); }
  if (pts.length < 4) { const c = centroid(ring); for (const q of ring.concat([c])) { const z = zAt(T, q); if (z != null) pts.push([q[0], q[1], z]); } }
  if (!pts.length) return null;
  let lo = pts[0], hi = pts[0], sum = 0; for (const p of pts) { if (p[2] < lo[2]) lo = p; if (p[2] > hi[2]) hi = p; sum += p[2]; }
  const n = pts.length, mean = sum / n, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  // the best-fit plane z = mean + bx (x - mx) + by (y - my)
  let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0; for (const [x, y, z] of pts) { const dx = x - mx, dy = y - my, dz = z - mean; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; sxz += dx * dz; syz += dy * dz; }
  const det = sxx * syy - sxy * sxy, bx = det ? (sxz * syy - syz * sxy) / det : 0, by = det ? (syz * sxx - sxz * sxy) / det : 0;
  const res = pts.map(([x, y, z]) => Math.abs(z - mean - bx * (x - mx) - by * (y - my))).sort((a, b) => a - b), resid = res[Math.floor(n * 0.95)] || 0, relief = hi[2] - lo[2], slope = Math.hypot(bx, by) * 100;
  const edges = ring.map((a, i) => { const b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(2, Math.ceil(L / Math.max(T.cell, 20))); let s = 0; for (let t = 0; t <= k; t++) s += zAt(T, [a[0] + (b[0] - a[0]) * t / k, a[1] + (b[1] - a[1]) * t / k]); return { i, z: s / (k + 1), L }; }).filter(e => e.L > 30);
  const lowEdge = edges.length ? edges.reduce((m, e) => e.z < m.z ? e : m).i : null, flat = relief < 2;
  return { min: lo[2], max: hi[2], mean, relief, slope, toward: flat || slope < 0.1 ? '' : compass([-bx, -by]), low: [lo[0], lo[1]], high: [hi[0], hi[1]], lowEdge, flat, rough: resid > Math.max(1.5, relief * 0.35), n }; // (one point in twenty off the plane by that much)
}

const f1 = v => (Math.round(v * 10) / 10).toFixed(1), f0 = v => Math.round(v).toLocaleString('en-US');
// where the numbers came from, for a fact line or a sheet note: "USGS 3DEP lidar (1 m, 2018)"
export const sourceLine = T => (T.source || 'USGS 3DEP') + (T.detail || T.year ? ' (' + [T.detail, T.year].filter(Boolean).join(', ') + ')' : '');
// one plain sentence for the site facts (the AI planner and the plan set read these too)
export function factLine(T, ring) {
  const s = summary(T, ring); if (!s) return '';
  const range = 'Ground ' + f0(s.min) + ' to ' + f0(s.max) + ' ft (NAVD 88)';
  const fall = s.flat ? 'nearly flat (' + f1(s.relief) + ' ft of relief): drainage will be graded in' : 'falls about ' + f1(s.relief) + ' ft' + (s.toward ? ' toward the ' + s.toward : '') + ' (' + s.slope.toFixed(1) + '% average): put detention on the low side';
  return range + ', ' + fall + (s.rough && !s.flat ? '; uneven ground (a ditch, ridge or pond on the site?)' : '') + '. From ' + sourceLine(T) + (T.coarse ? ', approximate' : '') + '; not a survey.';
}
// where on the site a point sits between the lowest (0) and highest (1) ground, or null when the terrain can't say
const SUMS = new WeakMap(); // (the layout engine asks for every option it weighs)
export function heightShare(T, ring, p) {
  if (!T || T.coarse || !T.z) return null; let s = SUMS.get(T); if (s === undefined) { s = summary(T, ring); SUMS.set(T, s); } if (!s || s.relief < 1.5) return null;
  return Math.max(0, Math.min(1, (zAt(T, p) - s.min) / s.relief));
}
// the few numbers the project keeps (they sync with the team; the grid itself stays on the device)
export function groundFacts(T, ring) {
  const s = summary(T, ring); if (!s) return null; const r1 = v => Math.round(v * 10) / 10;
  return { min: r1(s.min), max: r1(s.max), relief: r1(s.relief), slope: r1(s.slope), toward: s.toward, flat: s.flat, rough: s.rough && !s.flat, src: sourceLine(T), coarse: !!T.coarse };
}
