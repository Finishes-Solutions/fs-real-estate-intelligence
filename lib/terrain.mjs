// Ground elevations over a site (api/terrain.js fetches them; the site facts, the layout engine and the plan set's civil
// sheets read them). Pure functions, no network.
// A terrain is a grid in the plan's own feet (x east, y north of plan.origin):
//   { x0, y0, cell, nx, ny, z: [ft NAVD 88 or null, row by row from y0], source, detail, resM, year, coarse, sig, at }
//   source/detail say where it came from ('USGS 3DEP', '1 m lidar'); coarse: a 90 m model or a handful of points,
//   good for which way the land falls but too rough to draw contours from.
// Elevations are bare ground (lidar with buildings and trees taken out), NAVD 88 feet. Not a survey.
import { frame, inRing, centroid, outline } from './siteplan.mjs';

// MAX_POINTS: the grid read from the elevation image (api/terrain.js), every 3 ft on lidar for a site of up to about 50
// acres, wider beyond (about 8 ft on 300 acres); POINT_MAX: the grid asked of the point services when the image isn't there
export const MAX_POINTS = 250000, POINT_MAX = 3600;
// a signature of the site (origin and boundary): a terrain fetched for one boundary isn't reused after the boundary moves
export function terrainSig(origin, ring) {
  let h = 2166136261; const add = t => { for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619) >>> 0; };
  add(origin.map(v => (+v).toFixed(6)).join(',')); for (const p of ring) add(';' + p.map(v => Math.round(+v)).join(',')); // (to the foot)
  return h.toString(36) + '.' + ring.length;
}

// the grid over the site's bounding box plus a margin: a cell of at least `minCell` ft, no more than `maxPts` points
export function gridSpec(ring, { margin = 30, maxPts = POINT_MAX, minCell = 10 } = {}) {
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
  const { nx, ny } = T, have = T.z.filter(v => v != null).length; let z = T.z.slice();
  if (have < Math.max(4, z.length * 0.25)) return null;
  for (let pass = 0; pass < nx + ny && z.some(v => v == null); pass++) {
    const nz = z.slice();
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (z[k] != null) continue; let s = 0, n = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < nx && b < ny && z[b * nx + a] != null) { s += z[b * nx + a]; n++; } }
      if (n) nz[k] = s / n; }
    z = nz; // (not splice(...nz): a quarter-million arguments overflow the stack)
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
//   { min, max, mean, relief (max - min), lo, hi (5th and 95th percentiles: where most of the ground is), slope (% of the
//     best-fit plane), fall (ft, that plane across the site: what the land as a whole does), toward ('south-east', or ''
//     when flat), low: [x, y], high, lowEdge (index of the boundary edge on the lowest ground), flat (under 2 ft of fall
//     and spread), dip (the lowest ground when it sits well under the rest: a creek, a ditch or a pond; else null),
//     rough (the plane misses by a lot somewhere) }
// (A 200 acre tract near Katy reads 76 to 100 ft but slopes 0.1% overall: the 76 is a channel, not the fall.)
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
  const zs = pts.map(p => p[2]).sort((a, b) => a - b), p5 = zs[Math.floor((n - 1) * 0.05)], p95 = zs[Math.ceil((n - 1) * 0.95)], g = slope ? [bx / Math.hypot(bx, by), by / Math.hypot(bx, by)] : [0, 0];
  let t0 = Infinity, t1 = -Infinity; for (const [x, y] of pts) { const t = (x - mx) * g[0] + (y - my) * g[1]; if (t < t0) t0 = t; if (t > t1) t1 = t; } // (no spread: a quarter-million points)
  const fall = slope / 100 * (t1 - t0);
  const lowEdge = edges.length ? edges.reduce((m, e) => e.z < m.z ? e : m).i : null, flat = fall < 2 && p95 - p5 < 2;
  return { min: lo[2], max: hi[2], mean, relief, lo: p5, hi: p95, slope, fall, toward: flat || slope < 0.05 ? '' : compass([-bx, -by]), low: [lo[0], lo[1]], high: [hi[0], hi[1]], lowEdge, flat,
    dip: lo[2] < p5 - 3 ? lo[2] : null, rough: resid > Math.max(1.5, (p95 - p5) * 0.35), n }; // (rough: one point in twenty off the plane by that much)
}

const f1 = v => (Math.round(v * 10) / 10).toFixed(1), f0 = v => Math.round(v).toLocaleString('en-US');
// where the numbers came from, for a fact line or a sheet note: "USGS 3DEP lidar (1 m, 2018)"
export const sourceLine = T => (T.source || 'USGS 3DEP') + (T.detail || T.year ? ' (' + [T.detail, T.year].filter(Boolean).join(', ') + ')' : '');
// one plain sentence for the site facts (the AI planner and the plan set read these too)
export function factLine(T, ring) {
  const s = summary(T, ring); if (!s) return '';
  const range = s.dip != null ? 'Ground mostly ' + f0(s.lo) + ' to ' + f0(s.hi) + ' ft (NAVD 88), down to ' + f0(s.dip) + ' ft in a low channel or pond (a creek, ditch or drainage way? check for a floodway or easement)' : 'Ground ' + f0(s.min) + ' to ' + f0(s.max) + ' ft (NAVD 88)';
  const fall = s.flat ? 'nearly flat overall: drainage will be graded in' : 'the land falls about ' + f1(s.fall) + ' ft' + (s.toward ? ' toward the ' + s.toward : '') + ' across the site (' + s.slope.toFixed(1) + '% average): put detention on the low side';
  return range + '; ' + fall + (s.rough && !s.flat && s.dip == null ? '; uneven in places (a ditch, ridge or pond?)' : '') + '. From ' + sourceLine(T) + (T.coarse ? ', approximate' : '') + '; not a survey.';
}
// where on the site a point sits between the lowest (0) and highest (1) ground, or null when the terrain can't say
const SUMS = new WeakMap(); // (the layout engine asks for every option it weighs)
export function heightShare(T, ring, p) {
  if (!T || T.coarse || !T.z) return null; let s = SUMS.get(T); if (s === undefined) { s = summary(T, ring); SUMS.set(T, s); } if (!s || s.hi - s.lo < 1.5) return null;
  return Math.max(0, Math.min(1, (zAt(T, p) - s.lo) / (s.hi - s.lo))); // (between most of the ground: a channel's bottom doesn't stretch the scale)
}
// the few numbers the project keeps (they sync with the team; the grid itself stays on the device)
export function groundFacts(T, ring) {
  const s = summary(T, ring); if (!s) return null; const r1 = v => Math.round(v * 10) / 10;
  return { min: r1(s.min), max: r1(s.max), lo: r1(s.lo), hi: r1(s.hi), relief: r1(s.relief), fall: r1(s.fall), slope: Math.round(s.slope * 100) / 100, toward: s.toward, flat: s.flat, dip: s.dip == null ? null : r1(s.dip), rough: s.rough && !s.flat && s.dip == null, src: sourceLine(T), coarse: !!T.coarse };
}

// how a piece sits on the ground (a hillside site: Sevier County, Tennessee runs 35-70%): the ground under its outline
// every `step` ft, the best-fit plane, and what building it takes.
//   level pieces (courts, parking, lawns, a venue or any non-home building): a level pad at the elevation that balances
//     cut against fill; cutCy / fillCy (bank cubic yards under the piece only, no side slopes), and the retaining walls
//     at its edges: cutWall (uphill, ground above the pad) and fillWall (downhill, pad above the ground), ft
//   homes of two floors or more on a slope: a walk-out. The main floor at the uphill ground, the lower floor opening at
//     the downhill side; fits when the fall across the house is no more than one floor (plus 2 ft), else the extra is wall
//   { n, min, max, mean, fall, slope (% of the plane), toward, pad, cutCy, fillCy, cutWall, fillWall, wall, walkout,
//     level: 'flat' | 'walkout' | 'minor' | 'walls' | 'major' } or null when the ground isn't known under it
const HOMES = ['sfr', 'townhomes', 'duplex'];
// the ground at a point only where the four cells around it are known (zAt reads a missing cell as 0)
const zKnown = (T, [x, y]) => { const i = Math.floor((x - T.x0) / T.cell), j = Math.floor((y - T.y0) / T.cell); if (i < 0 || j < 0 || i >= T.nx - 1 || j >= T.ny - 1) return null;
  for (const k of [j * T.nx + i, j * T.nx + i + 1, (j + 1) * T.nx + i, (j + 1) * T.nx + i + 1]) if (T.z[k] == null) return null; return zAt(T, [x, y]); };
export function padFit(T, e, { step = 5, floorH = 10 } = {}) {
  if (!T?.z || !e) return null;
  const ring = outline(e), xs = ring.map(p => p[0]), ys = ring.map(p => p[1]), pts = [];
  for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
    if (!inRing([x, y], ring)) continue; const z = zKnown(T, [x, y]); if (Number.isFinite(z)) pts.push([x, y, z]);
  }
  if (pts.length < 3) return null;
  const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n, mean = pts.reduce((s, p) => s + p[2], 0) / n;
  let sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0; for (const [x, y, z] of pts) { const dx = x - mx, dy = y - my, dz = z - mean; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; sxz += dx * dz; syz += dy * dz; }
  const det = sxx * syy - sxy * sxy, a = det ? (sxz * syy - syz * sxy) / det : 0, b = det ? (syz * sxx - sxz * sxy) / det : 0;
  const zs = pts.map(p => p[2]), min = Math.min(...zs), max = Math.max(...zs), A = step * step;
  const home = e.kind === 'building' && HOMES.includes(e.use) && (e.floors || 1) >= 2;
  const pad = home ? max : mean; // a walk-out's main floor at the uphill ground; anything level, balanced
  let cut = 0, fill = 0; for (const z of zs) { if (z > pad) cut += (z - pad) * A; else fill += (pad - z) * A; }
  const edge = []; for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); for (let t = 0; t < L; t += step) { const z = zKnown(T, [p[0] + (q[0] - p[0]) * t / L, p[1] + (q[1] - p[1]) * t / L]); if (Number.isFinite(z)) edge.push(z); } }
  const fall = max - min, cutWall = Math.max(0, ...edge.map(z => z - pad)), fillWall = Math.max(0, ...edge.map(z => pad - z));
  const walkout = home ? Math.max(0, fall - (floorH + 2)) : null; // the fall a walk-out can't take up in its lower floor
  const wall = home ? walkout : Math.max(cutWall, fillWall);
  const level = fall <= 3 ? 'flat' : home ? (walkout <= 0 ? 'walkout' : walkout <= 6 ? 'walls' : 'major') : wall <= 4 ? 'minor' : wall <= 12 ? 'walls' : 'major';
  const r1 = v => Math.round(v * 10) / 10;
  return { n, min: r1(min), max: r1(max), mean: r1(mean), fall: r1(fall), slope: Math.round(Math.hypot(a, b) * 1000) / 10, toward: Math.hypot(a, b) > 0.005 ? compass([-a, -b]) : '',
    pad: r1(pad), cutCy: Math.round(home ? 0 : cut / 27), fillCy: Math.round(home ? 0 : fill / 27), cutWall: r1(home ? 0 : cutWall), fillWall: r1(home ? 0 : fillWall), wall: r1(wall), walkout: home ? walkout <= 0 : null, level };
}
// one line for the Selected panel and the plan's notes
export function fitLine(f) {
  if (!f) return '';
  const g = v => Math.round(v).toLocaleString('en-US'), head = 'Ground ' + g(f.min) + '–' + g(f.max) + ' ft, falls ' + g(f.fall) + ' ft' + (f.toward ? ' to the ' + f.toward : '') + ' (' + Math.round(f.slope) + '%)';
  if (f.level === 'flat') return head + ': flat enough as it is.';
  if (f.walkout != null) return head + (f.walkout ? ': a walk-out, the lower floor opening downhill; main floor at about ' + g(f.pad) + ' ft.' : ': more than a walk-out takes; about ' + g(f.wall) + ' ft of retaining wall or a taller foundation.');
  return head + ': level pad at about ' + g(f.pad) + ' ft, ' + g(f.cutCy) + ' CY cut and ' + g(f.fillCy) + ' CY fill, retaining walls up to ' + g(f.cutWall) + ' ft uphill and ' + g(f.fillWall) + ' ft downhill.';
}
