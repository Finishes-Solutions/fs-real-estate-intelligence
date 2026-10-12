// Site plans on a parcel: plan geometry in feet, checks and numbers, the layout generator behind "Build with AI",
// map features and DXF export. Shared by the browser (src/siteplan.js), the AI endpoint (api/siteplan.js) and the
// tests (test/siteplan.mjs).
//
// A plan is drawn in feet east (x) and north (y) of its origin [lon, lat]. The boundary is an open ring,
// counter-clockwise. Every element is a rectangle:
//   { id, kind, x, y (centre), w (along its own x axis), d (along its own y axis), rot (degrees, counter-clockwise), floors? }
// kinds: building, parking, drive, truck (truck court / loading), pond (detention), green (landscape)
// This is a planning sketch (test fits, yields, parking counts), not engineering: no grading, utilities or code review.

const FT = 3.280839895, RAD = Math.PI / 180;

export const KINDS = {
  building: { label: 'Building', solid: true },
  parking: { label: 'Parking', paved: true },
  drive: { label: 'Drive', paved: true },
  truck: { label: 'Truck court', paved: true },
  pond: { label: 'Detention', solid: true },
  green: { label: 'Landscape' },
  plaza: { label: 'Plaza', paved: true },
  court: { label: 'Courts', solid: true },
  pool: { label: 'Pool', solid: true },
  play: { label: 'Playground', solid: true },
  trail: { label: 'Trail' },
  lot: { label: 'Lot line' } // a home's lot: drawn as a line, never checked or counted
};

// typical suburban Houston-area numbers, used when the request doesn't say
export const USES = {
  retail: { label: 'Retail', ratio: 4, floors: 1, depth: 100, floorH: 20 },
  restaurant: { label: 'Restaurant', ratio: 10, floors: 1, depth: 70, floorH: 18 },
  office: { label: 'Office', ratio: 3.5, floors: 2, depth: 110, floorH: 13 },
  medical: { label: 'Medical office', ratio: 5, floors: 1, depth: 100, floorH: 14 },
  industrial: { label: 'Industrial / warehouse', ratio: 0.6, floors: 1, depth: 240, floorH: 36, truck: 130 },
  multifamily: { label: 'Multifamily', perUnit: 1.6, floors: 3, depth: 65, floorH: 10, unitSf: 900 },
  townhomes: { label: 'Townhomes', perUnit: 2, floors: 3, depth: 40, floorH: 10, unitW: 24, garage: 2 },
  duplex: { label: 'Duplexes / cottages', perUnit: 2, floors: 2, depth: 40, floorH: 10, unitSf: 1800, garage: 1 },
  sfr: { label: 'Single-family homes', perUnit: 2, floors: 2, depth: 40, floorH: 11, unitSf: 2400, garage: 2 },
  amenity: { label: 'Amenity / commons', ratio: 0, floors: 1, depth: 60, floorH: 18 },
  other: { label: 'Other', ratio: 3, floors: 1, depth: 100, floorH: 16 }
};
export const SETBACKS = { front: 25, side: 10, rear: 20, paving: 10 };
// landscape buffers by side (paveFront, paveSide, paveRear) fall back to `paving`; buildOn / paveOn: false turn a kind off
// a typical garden-style unit mix (beds: studios count as one bed, as TestFit counts them)
export const UNIT_MIX = [{ name: 'Studio', sf: 550, pct: 10, beds: 1 }, { name: '1 BR', sf: 760, pct: 45, beds: 1 }, { name: '2 BR', sf: 1100, pct: 35, beds: 2 }, { name: '3 BR', sf: 1350, pct: 10, beds: 3 }];
// single-family homes by stories: living area, footprint with the garage, and the lot width each takes
export const HOME_TYPES = { 1: { sf: 1900, w: 54, d: 48, lotW: 60 }, 2: { sf: 2600, w: 42, d: 40, lotW: 50 }, 3: { sf: 3000, w: 30, d: 38, lotW: 40 } };
export const HOME_MIX = [{ stories: 1, pct: 30 }, { stories: 2, pct: 60 }, { stories: 3, pct: 10 }];
// the average unit and the beds per unit of a mix
export function mixStats(mix) {
  const m = (Array.isArray(mix) && mix.length ? mix : UNIT_MIX).filter(t => +t.pct > 0 && +t.sf > 0), tot = m.reduce((s, t) => s + +t.pct, 0) || 1;
  return { mix: m, avgSf: m.reduce((s, t) => s + t.sf * t.pct, 0) / tot, bedsPer: m.reduce((s, t) => s + (t.beds ?? 1) * t.pct, 0) / tot };
}
// split n units across a mix (largest remainder): [{ name, sf, beds, n }]
export function splitMix(n, mix) {
  const { mix: m } = mixStats(mix), tot = m.reduce((s, t) => s + +t.pct, 0) || 1, raw = m.map(t => n * t.pct / tot), out = m.map((t, i) => ({ ...t, n: Math.floor(raw[i]) }));
  let left = n - out.reduce((s, t) => s + t.n, 0); raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { out[i].n++; left--; } });
  return out;
}
export const STALL = { w: 9, d: 18, aisle: 24 };
export const DRIVE_W = 26;

// ---------- frame: lon/lat <-> feet around an origin ----------
export function frame(origin) {
  const [lon0, lat0] = origin, p = lat0 * RAD;
  const mx = (111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p)) * FT, my = (111132.954 - 559.822 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p)) * FT;
  return { toFt: ([lon, lat]) => [(lon - lon0) * mx, (lat - lat0) * my], toLL: ([x, y]) => [+(lon0 + x / mx).toFixed(8), +(lat0 + y / my).toFixed(8)] };
}

// ---------- polygon basics (open rings) ----------
export const signedArea = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return s / 2; };
export const ringArea = r => Math.abs(signedArea(r));
export function inRing([x, y], r) {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins; }
  return ins;
}
export function segDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
export function segsCross(a, b, c, d) { const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d); return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)) && d1 && d2 && d3 && d4; }
export const segSeg = (a, b, c, d) => segsCross(a, b, c, d) ? 0 : Math.min(segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b));
export function centroid(r) { // relative to the first point: on raw lon/lat the products cancel and lose ~100 ft
  const [ox, oy] = r[0]; let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0] - ox, yi = r[i][1] - oy, xj = r[j][0] - ox, yj = r[j][1] - oy, f = xj * yi - xi * yj; a += f; cx += (xj + xi) * f; cy += (yj + yi) * f; }
  return a ? [ox + cx / (3 * a), oy + cy / (3 * a)] : r[0];
}
const rot = ([x, y], deg) => { const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD); return [x * c - y * s, x * s + y * c]; };

// tidy a ring: drop the closing point and repeats, Douglas-Peucker at tol feet, counter-clockwise
export function tidyRing(ring, tol = 0.5) {
  let r = ring.filter((p, i) => i === 0 || Math.hypot(p[0] - ring[i - 1][0], p[1] - ring[i - 1][1]) > 0.01);
  if (r.length > 1 && Math.hypot(r[0][0] - r[r.length - 1][0], r[0][1] - r[r.length - 1][1]) < 0.01) r.pop();
  if (r.length < 3) return r;
  // split at the point farthest from the first so the closed ring simplifies as two open chains
  let far = 0, fd = -1; r.forEach((p, i) => { const d = Math.hypot(p[0] - r[0][0], p[1] - r[0][1]); if (d > fd) { fd = d; far = i; } });
  const dp = pts => { if (pts.length < 3) return pts; let k = 0, m = -1; for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i], pts[0], pts[pts.length - 1]); if (d > m) { m = d; k = i; } }
    return m > tol ? dp(pts.slice(0, k + 1)).slice(0, -1).concat(dp(pts.slice(k))) : [pts[0], pts[pts.length - 1]]; };
  r = dp(r.slice(0, far + 1)).slice(0, -1).concat(dp(r.slice(far).concat([r[0]])).slice(0, -1));
  if (signedArea(r) < 0) r.reverse();
  return r;
}

// the plan boundary from a parcel's GeoJSON geometry: the polygon under `at` (else the largest), outer ring only
export function boundaryFrom(geom, at) {
  const polys = geom?.type === 'Polygon' ? [geom.coordinates] : geom?.type === 'MultiPolygon' ? geom.coordinates : [];
  if (!polys.length) return null;
  const llArea = p => ringArea(p[0]);
  const poly = (at && polys.find(p => inRing(at, p[0]))) || polys.slice().sort((a, b) => llArea(b) - llArea(a))[0];
  const c = centroid(poly[0].slice(0, -1).length >= 3 ? poly[0].slice(0, -1) : poly[0]);
  const origin = [+c[0].toFixed(7), +c[1].toFixed(7)], F = frame(origin);
  const ring = tidyRing(poly[0].map(F.toFt), 0.5).map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]);
  return ring.length >= 3 ? { origin, ring } : null;
}

// ---------- several parcels as one site ----------
// Appraisal parcels rarely share their lines exactly (gaps and overlaps of a few feet, slivers), so a plain polygon
// union leaves holes and spikes. Instead: paint every parcel on a fine grid, close gaps narrower than `gapFt` (a road
// right-of-way is far wider and stays open), fill holes, trace the outline of the biggest piece, simplify it and snap
// its corners back onto the parcels' own corners. Returns { origin, ring, pieces, areaParcels } (pieces > 1: some
// parcels don't touch the rest and were left out).
export function unionParcels(geoms, gapFt = 6) {
  const rings = []; for (const g of geoms || []) for (const p of g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : []) if (p[0]?.length >= 4) rings.push(p[0]);
  if (!rings.length) return null;
  if (rings.length === 1) { const b = boundaryFrom({ type: 'Polygon', coordinates: [rings[0]] }); return b && { ...b, pieces: 1, areaParcels: ringArea(b.ring) }; }
  const all = rings.flat(), F00 = frame(centroid(all.map(p => [p[0], p[1]])));
  // parcels far apart can't be one site: group the ones whose boxes come within the gap, keep the biggest group
  const box = rings.map(r => { const q = r.map(F00.toFt), x = q.map(p => p[0]), y = q.map(p => p[1]); return [Math.min(...x) - gapFt, Math.min(...y) - gapFt, Math.max(...x) + gapFt, Math.max(...y) + gapFt, ringArea(q)]; });
  const grp = rings.map((_, i) => i), root = i => grp[i] === i ? i : (grp[i] = root(grp[i]));
  for (let i = 0; i < rings.length; i++) for (let k = i + 1; k < rings.length; k++) if (box[i][0] < box[k][2] && box[k][0] < box[i][2] && box[i][1] < box[k][3] && box[k][1] < box[i][3]) grp[root(i)] = root(k);
  const tot = new Map(); rings.forEach((_, i) => tot.set(root(i), (tot.get(root(i)) || 0) + box[i][4]));
  const keep = [...tot].sort((a, b) => b[1] - a[1])[0][0], groups = tot.size, mine = rings.filter((_, i) => root(i) === keep);
  if (mine.length === 1) { const b = boundaryFrom({ type: 'Polygon', coordinates: [mine[0]] }); return b && { ...b, pieces: groups, areaParcels: ringArea(b.ring) }; }
  const o0 = centroid(mine.flat().map(p => [p[0], p[1]])), F0 = frame(o0);
  const ft = mine.map(r => tidyRing(r.map(F0.toFt), 0.05));
  const areaParcels = ft.reduce((s, r) => s + ringArea(r), 0), xs = ft.flat().map(p => p[0]), ys = ft.flat().map(p => p[1]);
  const span = (Math.max(...xs) - Math.min(...xs) + 2 * gapFt) * (Math.max(...ys) - Math.min(...ys) + 2 * gapFt);
  const c = Math.max(0.5, Math.min(3, Math.sqrt(areaParcels) / 700), Math.sqrt(span / 4e6)), pad = Math.ceil(gapFt / c) + 2; // at most ~4 million cells
  const X0 = Math.min(...xs) - pad * c, Y0 = Math.min(...ys) - pad * c, nx = Math.ceil((Math.max(...xs) - X0) / c) + pad, ny = Math.ceil((Math.max(...ys) - Y0) / c) + pad;
  let M = new Uint8Array(nx * ny);
  for (const r of ft) for (let j = 0; j < ny; j++) { // scanline fill
    const y = Y0 + (j + 0.5) * c, hits = [];
    for (let i = 0, k = r.length - 1; i < r.length; k = i++) { const [x1, y1] = r[k], [x2, y2] = r[i]; if ((y1 > y) !== (y2 > y)) hits.push(x1 + (y - y1) * (x2 - x1) / (y2 - y1)); }
    hits.sort((a, b) => a - b);
    for (let h = 0; h + 1 < hits.length; h += 2) for (let i = Math.max(0, Math.ceil((hits[h] - X0) / c - 0.5)); i < nx && X0 + (i + 0.5) * c <= hits[h + 1]; i++) M[j * nx + i] = 1;
  }
  const k = Math.max(1, Math.round(gapFt / 2 / c)); // close: grow by half the gap, then shrink back
  const grow = (A, val) => { const B = new Uint8Array(A.length), T = new Uint8Array(A.length);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let v = !val; for (let d = -k; d <= k && v !== val; d++) { const x = i + d; if (x >= 0 && x < nx && A[j * nx + x] === +val) v = val; } T[j * nx + i] = +v; }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let v = !val; for (let d = -k; d <= k && v !== val; d++) { const y = j + d; if (y >= 0 && y < ny && T[y * nx + i] === +val) v = val; } B[j * nx + i] = +v; }
    return B; };
  M = grow(grow(M, true), false);
  // pieces (4-connected); keep the biggest, fill its holes
  const lab = new Int32Array(nx * ny), sizes = [0]; let id = 0;
  for (let s0 = 0; s0 < nx * ny; s0++) if (M[s0] && !lab[s0]) { id++; let n = 0; const st = [s0]; lab[s0] = id;
    while (st.length) { const q = st.pop(); n++; const i = q % nx, j = (q - i) / nx; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = i + di, y = j + dj; if (x < 0 || y < 0 || x >= nx || y >= ny) continue; const t = y * nx + x; if (M[t] && !lab[t]) { lab[t] = id; st.push(t); } } }
    sizes.push(n); }
  const big = sizes.indexOf(Math.max(...sizes)), pieces = sizes.filter(n => n * c * c > 2000).length + groups - 1;
  const out = new Uint8Array(nx * ny), st = []; // outside = reachable from the border without crossing the piece
  for (let i = 0; i < nx; i++) st.push(i, (ny - 1) * nx + i); for (let j = 0; j < ny; j++) st.push(j * nx, j * nx + nx - 1);
  while (st.length) { const q = st.pop(); if (out[q] || lab[q] === big) continue; out[q] = 1; const i = q % nx, j = (q - i) / nx; if (i > 0) st.push(q - 1); if (i < nx - 1) st.push(q + 1); if (j > 0) st.push(q - nx); if (j < ny - 1) st.push(q + nx); }
  const inn = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && !out[j * nx + i];
  // trace the outline along cell edges, counter-clockwise (inside on the left)
  const next = new Map(), key = (x, y) => x + ',' + y;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (inn(i, j)) {
    if (!inn(i, j - 1)) next.set(key(i, j), [i + 1, j]); if (!inn(i + 1, j)) next.set(key(i + 1, j), [i + 1, j + 1]);
    if (!inn(i, j + 1)) next.set(key(i + 1, j + 1), [i, j + 1]); if (!inn(i - 1, j)) next.set(key(i, j + 1), [i, j]);
  }
  let best = [];
  const seen = new Set();
  for (const [k0] of next) { if (seen.has(k0)) continue; const loop = []; let kk = k0;
    while (!seen.has(kk) && next.has(kk)) { seen.add(kk); const [x, y] = kk.split(',').map(Number); loop.push([X0 + x * c, Y0 + y * c]); const nn = next.get(kk); kk = key(nn[0], nn[1]); }
    if (loop.length > best.length) best = loop; }
  if (best.length < 4) return null;
  // simplify the staircase, then snap corners onto the parcels' own corners
  let r = tidyRing(best, c * 1.2);
  const corners0 = ft.flat();
  r = r.map(p => { let q = p, d = c * 2.2; for (const v of corners0) { const e = Math.hypot(v[0] - p[0], v[1] - p[1]); if (e < d) { d = e; q = v; } } return q; });
  r = tidyRing(r, 0.3);
  const ll = r.map(F0.toLL), b = boundaryFrom({ type: 'Polygon', coordinates: [ll.concat([ll[0]])] }, null);
  return b && { ...b, pieces, areaParcels };
}

// ---------- edges: front / side / rear ----------
const outward = (r, i) => { const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[1] - a[1]) / L, -(b[0] - a[0]) / L]; };
export const edgeLen = (r, i) => { const a = r[i], b = r[(i + 1) % r.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]); };
export const longestEdge = r => r.reduce((best, _, i) => edgeLen(r, i) > edgeLen(r, best) ? i : best, 0);
export function edgeRoles(ring, front) {
  const f = front != null && front < ring.length ? front : longestEdge(ring), nf = outward(ring, f);
  return ring.map((_, i) => { if (i === f) return 'front'; const n = outward(ring, i), dot = n[0] * nf[0] + n[1] * nf[1]; return dot > 0.8 ? 'front' : dot < -0.5 ? 'rear' : 'side'; });
}
// the edge nearest a point (feet), for "pick the street side"
export function nearestEdge(ring, p) { let best = 0, bd = Infinity; ring.forEach((a, i) => { const d = segDist(p, a, ring[(i + 1) % ring.length]); if (d < bd) { bd = d; best = i; } }); return best; }
// the street side from road centre lines near the lot (lines in feet): the edge that faces the nearest road, weighted to
// long edges. Returns null when no road comes within 250 ft.
export function frontFromRoads(ring, roads) {
  let best = null, bs = Infinity;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length], L = edgeLen(ring, i); if (L < 20) return;
    const n = outward(ring, i), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let d = Infinity;
    for (const line of roads) for (let k = 1; k < line.length; k++) {
      const q = closest(m, line[k - 1], line[k]);
      if ((q[0] - m[0]) * n[0] + (q[1] - m[1]) * n[1] > -5) d = Math.min(d, Math.hypot(q[0] - m[0], q[1] - m[1])); // roads on this edge's outer side only
    }
    const s = d - Math.min(L, 300) * 0.15;
    if (d < 250 && s < bs) { bs = s; best = i; }
  });
  return best;
}
const closest = ([px, py], [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0; return [ax + t * dx, ay + t * dy]; };

// required distances per edge: buildings keep the setback for the edge's role, paving keeps the landscape buffer
export function edgeRules(ring, front, sb = SETBACKS) {
  const S = { ...SETBACKS, ...(sb || {}) };
  const R = { front: 'paveFront', side: 'paveSide', rear: 'paveRear' };
  return edgeRoles(ring, front).map(role => ({ role, build: S.buildOn === false ? 0 : +S[role] || 0, pave: S.paveOn === false ? 0 : +(S[R[role]] ?? S.paving) || 0 }));
}
// the line the setbacks make, for drawing (mitred offset; fine for display, the checks use exact distances)
export function insetRing(ring, dists) {
  const n = ring.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n, a = outward(ring, p), b = outward(ring, i), da = dists[p], db = dists[i], v = ring[i];
    const det = a[0] * b[1] - a[1] * b[0];
    let q;
    if (Math.abs(det) < 1e-6) q = [v[0] - b[0] * db, v[1] - b[1] * db];
    else { // solve n_a·(q - v) = -da, n_b·(q - v) = -db
      const ox = (-da * b[1] + db * a[1]) / det, oy = (-db * a[0] + da * b[0]) / det;
      const L = Math.hypot(ox, oy), cap = 4 * Math.max(da, db, 1);
      q = L > cap ? [v[0] + ox / L * cap, v[1] + oy / L * cap] : [v[0] + ox, v[1] + oy];
    }
    out.push(q);
  }
  // short curve segments with different setbacks either side make mitre spikes: drop points that break a setback
  const ok = out.filter(q => inRing(q, ring) && ring.every((a, k) => segDist(q, a, ring[(k + 1) % n]) >= dists[k] - 0.5));
  return ok.length >= 3 ? ok : out;
}

// ---------- elements ----------
export function corners(e) {
  return [[-e.w / 2, -e.d / 2], [e.w / 2, -e.d / 2], [e.w / 2, e.d / 2], [-e.w / 2, e.d / 2]].map(p => { const q = rot(p, e.rot || 0); return [e.x + q[0], e.y + q[1]]; });
}
// ---------- free-form pieces ----------
// Drives can follow a centre line (path, width, r: corner radius, closed: a loop) and ponds, islands and lawns can be
// any outline (poly). They carry x, y (a point for the label and for dragging) like every other piece.
export const isFree = e => !!(e.poly || e.path);
// round a polyline's corners with arcs of radius r (closed: every corner, the result is a closed ring)
export function fillet(path, r = 30, closed = false) {
  const n = path.length, out = []; if (n < 3) return path.slice();
  for (let i = 0; i < n; i++) {
    const B = path[i]; if (!closed && (i === 0 || i === n - 1)) { out.push(B); continue; }
    const A = path[(i - 1 + n) % n], C = path[(i + 1) % n], la = Math.hypot(A[0] - B[0], A[1] - B[1]), lc = Math.hypot(C[0] - B[0], C[1] - B[1]);
    if (la < 1e-6 || lc < 1e-6) { out.push(B); continue; }
    const u1 = [(A[0] - B[0]) / la, (A[1] - B[1]) / la], u2 = [(C[0] - B[0]) / lc, (C[1] - B[1]) / lc], cos = u1[0] * u2[0] + u1[1] * u2[1], th = Math.acos(Math.max(-1, Math.min(1, cos)));
    if (th > Math.PI - 0.02 || th < 0.02) { out.push(B); continue; }
    let t = r / Math.tan(th / 2); t = Math.min(t, la / 2, lc / 2); const rr = t * Math.tan(th / 2);
    const T1 = [B[0] + u1[0] * t, B[1] + u1[1] * t], T2 = [B[0] + u2[0] * t, B[1] + u2[1] * t], bis = [u1[0] + u2[0], u1[1] + u2[1]], bl = Math.hypot(...bis);
    const O = [B[0] + bis[0] / bl * rr / Math.sin(th / 2), B[1] + bis[1] / bl * rr / Math.sin(th / 2)];
    let a1 = Math.atan2(T1[1] - O[1], T1[0] - O[0]), a2 = Math.atan2(T2[1] - O[1], T2[0] - O[0]), da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const k = Math.max(2, Math.ceil(Math.abs(da) / (Math.PI / 12)));
    for (let j = 0; j <= k; j++) { const a = a1 + da * j / k; out.push([O[0] + rr * Math.cos(a), O[1] + rr * Math.sin(a)]); }
  }
  return out;
}
// a band `width` wide along a polyline; a loop comes back as one keyhole outline (outer ring, then inner ring backwards)
export function band(path, width, closed = false) {
  const p = closed ? path.concat([path[0]]) : path, n = p.length, h = width / 2, L = [], R = [];
  const nrm = i => { const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
  for (let i = 0; i < n; i++) {
    let v = nrm(i); if (closed && (i === 0 || i === n - 1)) { const a = p[n - 2], b = p[1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; v = [-dy / l, dx / l]; }
    L.push([p[i][0] + v[0] * h, p[i][1] + v[1] * h]); R.push([p[i][0] - v[0] * h, p[i][1] - v[1] * h]);
  }
  return L.concat(R.reverse());
}
// an outline pushed out (d > 0) or in by d feet (vertex normals; fine for the smooth shapes it's used on)
export function grow(r, d) {
  const n = r.length, s = signedArea(r) >= 0 ? 1 : -1;
  return r.map((p, i) => { const a = r[(i - 1 + n) % n], b = r[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [p[0] + s * dy / l * d, p[1] - s * dx / l * d]; });
}
// Chaikin smoothing of a closed outline (each pass cuts every corner)
export function smooth(r, passes = 3) { let q = r; for (let k = 0; k < passes; k++) { const o = []; q.forEach((p, i) => { const b = q[(i + 1) % q.length]; o.push([p[0] * .75 + b[0] * .25, p[1] * .75 + b[1] * .25], [p[0] * .25 + b[0] * .75, p[1] * .25 + b[1] * .75]); }); q = o; } return q; }
const freeCache = new WeakMap();
function freeOutline(e) {
  if (e.poly) return e.poly;
  const key = e.width + '|' + e.r + '|' + e.closed + '|' + e.path.length + '|' + e.path[0] + '|' + e.path[e.path.length - 1], c = freeCache.get(e);
  if (c && c.key === key && c.path === e.path) return c.pts;
  const pts = band(fillet(e.path, e.r ?? 30, e.closed), e.width || 26, e.closed); freeCache.set(e, { key, path: e.path, pts }); return pts;
}
// move a piece by dx, dy (free-form pieces move every point)
export function moveBy(e, dx, dy) {
  e.x = +(e.x + dx).toFixed(2); e.y = +(e.y + dy).toFixed(2);
  if (e.path) e.path = e.path.map(([x, y]) => [+(x + dx).toFixed(2), +(y + dy).toFixed(2)]);
  if (e.poly) e.poly = e.poly.map(([x, y]) => [+(x + dx).toFixed(2), +(y + dy).toFixed(2)]);
  return e;
}
// scale a free-form piece by f about point c (default its label point); paths keep their width
export function scaleBy(e, f, c = [e.x, e.y]) {
  const sc = ([x, y]) => [+(c[0] + (x - c[0]) * f).toFixed(2), +(c[1] + (y - c[1]) * f).toFixed(2)];
  if (e.poly) e.poly = e.poly.map(sc); if (e.path) e.path = e.path.map(sc);
  [e.x, e.y] = sc([e.x, e.y]); e.w = +(e.w * f).toFixed(2); e.d = +(e.d * f).toFixed(2); return e;
}
// switch a pond, pool or lawn between a natural outline, a rounded rectangle and a rectangle, keeping its area
export function reshape(e, to) {
  const a = elArea(e), o = outline(e), c = centroid(o);
  if (to === 'organic') { if (e.poly) return e; const q = smooth(corners({ ...e, w: e.w * 1.08, d: e.d * 1.08 }), 4), k = Math.sqrt(a / (ringArea(q) || 1)); e.poly = q.map(([x, y]) => [+(c[0] + (x - c[0]) * k).toFixed(2), +(c[1] + (y - c[1]) * k).toFixed(2)]); delete e.shape; return e; }
  // a rectangle the same area, the same proportions as the piece's box, turned with it
  const rr = e.rot || 0, loc = o.map(p => rot([p[0] - c[0], p[1] - c[1]], -rr)), w0 = Math.max(...loc.map(p => p[0])) - Math.min(...loc.map(p => p[0])), d0 = Math.max(...loc.map(p => p[1])) - Math.min(...loc.map(p => p[1]));
  const r = { ...e, poly: undefined, path: undefined, w: w0, d: d0, shape: to === 'rounded' ? 'round' : undefined }, k = Math.sqrt(a / (elArea(r) || 1));
  delete e.poly; Object.assign(e, { x: +c[0].toFixed(2), y: +c[1].toFixed(2), w: +(w0 * k).toFixed(2), d: +(d0 * k).toFixed(2), rot: rr }); if (to === 'rounded') e.shape = 'round'; else delete e.shape;
  return e;
}
// the points that bound a piece (its corners, or its outline)
export const shapeOf = e => isFree(e) ? freeOutline(e) : corners(e);
const distToPoly = (p, r) => r.reduce((m, a, i) => Math.min(m, segDist(p, a, r[(i + 1) % r.length])), Infinity);
// a point on or within `pad` feet of a piece
export const nearPiece = (e, p, pad = 0) => isFree(e) ? inRing(p, freeOutline(e)) || (pad > 0 && distToPoly(p, freeOutline(e)) < pad) : hitRect({ ...e, w: e.w + 2 * pad, d: e.d + 2 * pad }, p);
function polysOverlap(A, B, slack = 0.5) {
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) if (segsCross(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
  const inner = (P, Q) => P.some(p => inRing(p, Q) && distToPoly(p, Q) > slack); // no edges cross: inside means one holds the other (a centroid can sit outside a curved shape)
  return inner(A, B) || inner(B, A);
}

// a piece's outline for drawing: a rectangle, a rounded rectangle (shape 'round': ponds, lakes), an ellipse ('circle'),
// or a free-form outline (a drive along a path, an organic pond)
export function outline(e) {
  if (isFree(e)) return freeOutline(e);
  if (e.jog && e.kind === 'building' && e.w > 90) { // a staggered front: every other section steps forward (and back behind), same floor area
    const n = e.w > 210 ? 5 : 3, j = e.jog, s = e.w / n, top = [], bot = [];
    for (let i = 0; i < n; i++) { const o = i % 2 ? j : 0, x0 = -e.w / 2 + i * s, x1 = x0 + s; bot.push([x0, -e.d / 2 - o], [x1, -e.d / 2 - o]); top.push([x0, e.d / 2 - o], [x1, e.d / 2 - o]); }
    return bot.concat(top.reverse()).map(p => { const q = rot(p, e.rot || 0); return [e.x + q[0], e.y + q[1]]; });
  }
  if (e.shape !== 'round' && e.shape !== 'circle') return corners(e);
  const pts = [], a = (e.rot || 0) * RAD, put = (u, v) => pts.push([e.x + u * Math.cos(a) - v * Math.sin(a), e.y + u * Math.sin(a) + v * Math.cos(a)]);
  if (e.shape === 'circle') { for (let i = 0; i < 36; i++) { const t = i / 36 * 2 * Math.PI; put(e.w / 2 * Math.cos(t), e.d / 2 * Math.sin(t)); } return pts; }
  const r = Math.min(e.w, e.d) * 0.35, cx = e.w / 2 - r, cy = e.d / 2 - r;
  for (const [sx, sy, t0] of [[1, 1, 0], [-1, 1, 90], [-1, -1, 180], [1, -1, 270]]) for (let i = 0; i <= 6; i++) { const t = (t0 + i * 15) * RAD; put(sx * cx + r * Math.cos(t), sy * cy + r * Math.sin(t)); }
  return pts;
}
export const elArea = e => isFree(e) ? ringArea(freeOutline(e)) : e.shape === 'circle' ? Math.PI * e.w * e.d / 4 : e.shape === 'round' ? e.w * e.d - (4 - Math.PI) * (Math.min(e.w, e.d) * 0.35) ** 2 : e.w * e.d;
export const toLocal = (e, [x, y]) => rot([x - e.x, y - e.y], -(e.rot || 0));
export const hitRect = (e, p) => { if (isFree(e)) return inRing(p, freeOutline(e)); const [u, v] = toLocal(e, p); return Math.abs(u) <= e.w / 2 && Math.abs(v) <= e.d / 2; };
export function rectsOverlap(a, b, slack = 0.5) {
  if (isFree(a) || isFree(b)) return polysOverlap(shapeOf(a), shapeOf(b), slack);
  const A = corners(a), B = corners(b);
  for (const R of [A, B]) for (let i = 0; i < 2; i++) {
    const ax = [R[i + 1][0] - R[i][0], R[i + 1][1] - R[i][1]], L = Math.hypot(...ax) || 1, n = [ax[0] / L, ax[1] / L];
    const pa = A.map(p => p[0] * n[0] + p[1] * n[1]), pb = B.map(p => p[0] * n[0] + p[1] * n[1]);
    if (Math.max(...pa) - slack <= Math.min(...pb) || Math.max(...pb) - slack <= Math.min(...pa)) return false;
  }
  return true;
}
const rectDist = (c, a, b) => c.reduce((m, p, i) => Math.min(m, segSeg(p, c[(i + 1) % c.length], a, b)), Infinity);

// parking stalls in a parking rectangle: 90° stalls in double-loaded modules (stall + aisle + stall), then one
// single-loaded row if there's room. Rows run along whichever side holds more stalls.
export function stalls(e, S0 = STALL) {
  const S = e.sw ? { w: e.sw, d: e.sd || S0.d, aisle: e.sa || S0.aisle } : S0; // a plan's own stall size
  const lay = (W, D) => {
    const n = Math.floor((W + 0.01) / S.w), rows = []; let y = -D / 2;
    if (n < 1) return { count: 0, rows, n, W };
    if (e.row) { if (D >= S.d - 0.01) rows.push(e.row > 0 ? [D / 2 - S.d, D / 2] : [-D / 2, -D / 2 + S.d]); return { count: rows.length * Math.max(0, n - (e.islands ? Math.floor(n / 13) : 0) - (e.caps && n >= 6 ? 2 : 0)), rows, n, W }; }
    while (D / 2 - y >= 2 * S.d + S.aisle - 0.01) { rows.push([y, y + S.d], [y + S.d + S.aisle, y + 2 * S.d + S.aisle]); y += 2 * S.d + S.aisle; }
    if (D / 2 - y >= S.d + S.aisle - 0.01) rows.push([y, y + S.d]);
    return { count: rows.length * Math.max(0, n - (e.islands ? Math.floor(n / 13) : 0) - (e.caps && n >= 6 ? 2 : 0)), rows, n, W };
  };
  if (e.lock) return { ...lay(e.w, e.d), swap: false }; // laid out by the generator: rows run along its length
  // rows turn to the short side only when that holds more and the rows are still 60 ft or longer (no stubby dead-end aisles)
  const a = lay(e.w, e.d), b = lay(e.d, e.w), okA = a.W >= 60 || !b.count, okB = b.W >= 60 || !a.count;
  return okB && (b.count > a.count || !okA) ? { ...b, swap: true } : { ...a, swap: false };
}
// planted islands in a parking rectangle (every 13th space when e.islands): centres in plan feet, 9 x 18 ft
export function islandsOf(e, S0 = STALL) {
  const S = e.sw ? { w: e.sw, d: e.sd || S0.d, aisle: e.sa || S0.aisle } : S0;
  if (!e.islands) return [];
  const st = stalls(e, S), x0 = -st.n * S.w / 2, out = [];
  const put = (u, v) => { const p = st.swap ? [v, -u] : [u, v], q = rot(p, e.rot || 0); return [e.x + q[0], e.y + q[1]]; };
  for (const [y0, y1] of st.rows) for (let k = 12; k < st.n - (e.caps ? 1 : 0); k += 13) out.push(put(x0 + (k + 0.5) * S.w, (y0 + y1) / 2));
  return out;
}
// rounded planted islands at both ends of every stall row (e.caps): a half-disc in the end space, flat against the next
// stall and round toward the end of the row. Outlines in plan feet, and a tree in each.
export function capsOf(e, S0 = STALL) {
  const S = e.sw ? { w: e.sw, d: e.sd || S0.d, aisle: e.sa || S0.aisle } : S0;
  if (!e.caps) return [];
  const st = stalls(e, S); if (st.n < 6) return [];
  const x0 = -st.n * S.w / 2, out = [], put = (u, v) => { const q = rot(st.swap ? [v, -u] : [u, v], e.rot || 0); return [+(e.x + q[0]).toFixed(2), +(e.y + q[1]).toFixed(2)]; };
  for (const [y0, y1] of st.rows) for (const end of [-1, 1]) {
    const cu = end < 0 ? x0 + S.w : -x0 - S.w, cv = (y0 + y1) / 2, r = Math.min(S.w, (y1 - y0) / 2), pts = [];
    for (let k = 0; k <= 12; k++) { const a = (end < 0 ? Math.PI / 2 : -Math.PI / 2) + k * Math.PI / 12; pts.push(put(cu + r * Math.cos(a), cv + (y1 - y0) / 2 * Math.sin(a))); }
    out.push({ poly: pts, tree: put(cu + end * S.w * 0.45, cv) });
  }
  return out;
}
// the stripe lines of a parking rectangle, in plan feet
export function stallLines(e, S0 = STALL) {
  const S = e.sw ? { w: e.sw, d: e.sd || S0.d, aisle: e.sa || S0.aisle } : S0;
  const st = stalls(e, S), W = st.swap ? e.d : e.w, out = [], x0 = -st.n * S.w / 2;
  const put = (u, v) => { const p = st.swap ? [v, -u] : [u, v], q = rot(p, e.rot || 0); return [+(e.x + q[0]).toFixed(2), +(e.y + q[1]).toFixed(2)]; };
  if (W <= 0) return out;
  st.rows.forEach(([y0, y1], k) => { // rows come in pairs facing a shared aisle; a row's head line is the side away from it
    for (let i = 0; i <= st.n; i++) out.push([put(x0 + i * S.w, y0), put(x0 + i * S.w, y1)]);
    const head = e.row ? (e.row > 0 ? y0 : y1) : k % 2 ? y1 : y0; out.push([put(x0, head), put(-x0, head)]);
  });
  return out;
}

// ---------- program ----------
const clamp = (v, lo, hi, dflt) => { const n = +v; return v == null || v === '' || !Number.isFinite(n) ? dflt : Math.max(lo, Math.min(hi, n)); };
export function normalizeProgram(p = {}) {
  const use = USES[p.use] ? p.use : 'other', U = USES[use];
  const out = {
    use, floors: Math.round(clamp(p.floors, 1, 40, U.floors)),
    gfa: p.gfa == null || p.gfa === '' || !(+p.gfa > 0) ? null : clamp(p.gfa, 500, 5e6, null),
    ratio: clamp(p.ratio, 0, 30, U.ratio ?? 3), perUnit: clamp(p.perUnit, 0, 4, U.perUnit ?? 1.5),
    units: p.units == null || p.units === '' || !(+p.units > 0) ? null : Math.round(clamp(p.units, 1, 5000, null)),
    unitSf: clamp(p.unitSf, 300, 3000, U.unitSf || 900), buildings: p.buildings == null || p.buildings === '' ? null : Math.round(clamp(p.buildings, 1, 12, 1)),
    depth: clamp(p.depth, 30, 600, U.depth), detentionPct: p.detentionPct == null || p.detentionPct === '' ? null : clamp(p.detentionPct, 0, 40, null),
    truck: p.truck == null ? !!U.truck : !!p.truck, max: !!p.max, eff: clamp(p.eff, 0.6, 0.98, 0.85),
    mix: use === 'multifamily' && Array.isArray(p.mix) && p.mix.length ? p.mix.map(t => ({ name: String(t.name || '').slice(0, 20), sf: clamp(t.sf, 250, 4000, 800), pct: clamp(t.pct, 0, 100, 0), beds: clamp(t.beds, 0, 6, 1) })) : null,
    homeMix: Array.isArray(p.homeMix) && p.homeMix.length ? p.homeMix.map(t => ({ stories: Math.round(clamp(t.stories, 1, 3, 2)), pct: clamp(t.pct, 0, 100, 0) })) : null, lotD: clamp(p.lotD, 80, 200, 115),
    // mixed use: zones from the street back (lib/sitecompose.mjs lays them out)
    zones: Array.isArray(p.zones) && p.zones.length > 1 ? p.zones.slice(0, 5).map(z => ({ use: USES[z?.use] ? z.use : 'other', gfa: +z.gfa > 0 ? Math.round(clamp(z.gfa, 500, 5e6, null)) : null,
      units: +z.units > 0 ? Math.round(clamp(z.units, 1, 3000, null)) : null, floors: +z.floors > 0 ? Math.round(clamp(z.floors, 1, 40, 1)) : null, buildings: +z.buildings > 0 ? Math.round(clamp(z.buildings, 1, 20, 1)) : null,
      pads: +z.pads > 0 ? Math.round(clamp(z.pads, 0, 4, 0)) : null, items: Array.isArray(z.items) ? z.items.map(String).slice(0, 10) : null, name: z.name ? String(z.name).slice(0, 40) : null })) : null
  };
  if (use === 'multifamily' && out.mix) out.unitSf = Math.round(mixStats(out.mix).avgSf); // the mix sets the average unit
  if (use === 'multifamily' && out.units && !out.gfa) out.gfa = Math.round(out.units * out.unitSf / out.eff);
  return out;
}
export const unitsOf = (prog, gfa) => { const f = prog.eff || 0.85; return prog.units && Math.abs(prog.units * prog.unitSf / f - gfa) < 0.15 * gfa ? prog.units : Math.floor(gfa * f / (prog.unitSf || 900)); };
// (a hundredth of a space of slack, so feet rounded to two decimals don't add a space)
export const required = (prog, gfa) => Math.ceil((prog.use === 'multifamily' ? unitsOf(prog, gfa) * prog.perUnit : gfa / 1000 * prog.ratio) - 0.01);

// a rough program from plain words, used without AI and as the AI's starting point
const KIND_WORDS = [['industrial', /warehouse|industrial|distribution|logistics|flex|manufactur|cross[- ]?dock|storage yard/], ['townhomes', /town ?ho(?:me|use)s?|row ?homes?/],
  ['duplex', /duplex|cottages?|single[- ]family|bungalows?/], ['multifamily', /apartment|multi-?family|senior living|\bmf\b/],
  ['amenity', /commons|amenit|\bpark\b|\blake\b|pickleball|pavilion|playground|dog park|community (?:center|space)|green ?space|open space|event lawn/],
  ['medical', /medical|clinic|dental|urgent care|hospital|surgery/], ['restaurant', /restaurant|qsr|drive[- ]?thru|coffee|fast food|cafe/], ['office', /office/],
  ['retail', /retail|strip|shopping|store|shop\b|shops|center|grocery|c-store|gas station|commercial/]];
const ZONE_ORDER = ['retail', 'restaurant', 'office', 'medical', 'other', 'industrial', 'amenity', 'multifamily', 'townhomes', 'duplex'];
const kindOf = t => (KIND_WORDS.find(([, re]) => re.test(t)) || [null])[0];
// a rough program from plain words, used without AI and as the AI's starting point. Several uses ("retail in front,
// a commons, 120 apartments and 18 townhomes") become zones, street side first.
export function guessProgram(text) {
  const t = String(text || '').toLowerCase().replace(/(\d),(\d{3})/g, '$1$2'), p = {};
  p.use = kindOf(t) || (/\bunits\b|residential/.test(t) ? 'multifamily' : 'other');
  const sfRe = /(\d+(?:\.\d+)?)\s*(k|thousand)?\s*(?:sf|sq\.?\s*ft|square[- ]f(?:ee|oo)t)/, unRe = /(\d+)[- ]?(?:units|apartments|doors|homes|townho(?:me|use)s|duplex(?:es)?|cottages)/;
  const sf = t.match(sfRe); if (sf) p.gfa = +sf[1] * (sf[2] ? 1000 : 1);
  const fl = t.match(/(\d+)[- ]?(?:stor(?:y|ies|ey)|floors?|levels?)/); if (fl) p.floors = +fl[1];
  const un = t.match(unRe); if (un) p.units = +un[1];
  const ra = t.match(/(\d+(?:\.\d+)?)\s*(?:\/|per)\s*1000/); if (ra) p.ratio = +ra[1];
  const pu = t.match(/(\d(?:\.\d+)?)\s*(?:spaces|stalls|parking)?\s*per\s*unit/); if (pu) p.perUnit = +pu[1];
  const bd = t.match(/(\d+)\s*buildings?/); if (bd) p.buildings = +bd[1];
  const de = t.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of the site\s*)?(?:for\s*)?detention/); if (de) p.detentionPct = +de[1]; if (/no detention|without detention/.test(t)) p.detentionPct = 0;
  if (/no truck|without truck/.test(t)) p.truck = false; else if (/truck court|dock|loading/.test(t)) p.truck = true;
  if (/max(imize|imum)?|as (much|big|large)\b|biggest|largest|whatever fits/.test(t) && !sf) p.max = true;
  // several uses: one zone per use, with the numbers said next to it
  const zones = new Map(); let last = null;
  for (const seg of t.split(/[;,\n&+]|\band\b|\bplus\b|\bwith\b|\bthen\b|\bbehind\b|\bin (?:the )?(?:front|back|middle)\b|\balso\b/)) {
    const use = kindOf(seg), pd0 = seg.match(/(\d+)\s*pads?\b/);
    if (!use) { if (last && pd0) last.pads = +pd0[1]; continue; }
    const z = zones.get(use) || { use }, s1 = seg.match(sfRe), u1 = seg.match(unRe), f1 = seg.match(/(\d+)[- ]?(?:stor(?:y|ies|ey)|floors?|levels?)/), pd = seg.match(/(\d+)\s*pads?\b/);
    if (s1) z.gfa = (z.gfa || 0) + +s1[1] * (s1[2] ? 1000 : 1); if (u1) z.units = (z.units || 0) + +u1[1]; if (f1) z.floors = +f1[1]; if (pd) z.pads = +pd[1];
    zones.set(use, z); last = z;
  }
  if (zones.size > 1) { p.zones = [...zones.values()].sort((a, b) => ZONE_ORDER.indexOf(a.use) - ZONE_ORDER.indexOf(b.use)); p.use = p.zones[0].use; delete p.gfa; delete p.units; delete p.floors; }
  return p;
}

// ---------- numbers and checks ----------
export function metrics(plan) {
  const ring = plan.ring || [], els = plan.elements || [], prog = normalizeProgram(plan.program);
  const sum = (k, f = elArea) => els.filter(e => e.kind === k).reduce((s, e) => s + f(e), 0), B = els.filter(e => e.kind === 'building');
  const useOf = e => USES[e.use] ? e.use : prog.use, gfaOf = e => e.sf ?? e.w * e.d * (e.floors || 1); // a home counts its living area, not its garage
  const site = ringArea(ring), footprint = sum('building'), gfa = B.reduce((s, e) => s + gfaOf(e), 0);
  const paved = sum('parking') + sum('drive') + sum('truck') + sum('plaza'), pond = sum('pond'), hard = sum('court') + sum('pool');
  const stallsN = els.filter(e => e.kind === 'parking').reduce((s, e) => s + stalls(e).count, 0);
  // homes: apartments from floor area, townhomes and duplexes as drawn; parking needed per building by its own use
  const single = B.every(e => useOf(e) === prog.use);
  let units = 0, garages = 0, need = 0;
  if (single && prog.use === 'multifamily' && gfa && !B.some(e => e.units != null)) { units = unitsOf(prog, gfa); need = required(prog, gfa); }
  else for (const e of B) {
    const u = useOf(e), U = USES[u], P = u === prog.use ? prog : normalizeProgram({ use: u });
    if (u === 'multifamily') { const n = e.units ?? Math.floor(gfaOf(e) * (P.eff || 0.85) / P.unitSf); units += n; need += n * P.perUnit; }
    else if (U.garage) { const n = e.units ?? 1; units += n; garages += n * U.garage; need += n * P.perUnit; }
    else need += gfaOf(e) / 1000 * P.ratio;
  }
  need = Math.ceil(need - 0.01);
  const heightFt = Math.max(0, ...B.map(e => (e.floors || 1) * USES[useOf(e)].floorH));
  // tabulation: apartments by the unit mix, beds, rentable area
  const mfB = B.filter(e => useOf(e) === 'multifamily'), mfProg = prog.use === 'multifamily' ? prog : normalizeProgram({ use: 'multifamily' });
  const mfUnits = single && prog.use === 'multifamily' && !mfB.some(e => e.units != null) ? units : mfB.reduce((s, e) => s + (e.units ?? Math.floor(gfaOf(e) * mfProg.eff / mfProg.unitSf)), 0);
  const mix = mfUnits ? splitMix(mfUnits, mfProg.mix) : [], HB = { townhomes: 3, duplex: 2 };
  const homeBeds = B.reduce((s, e) => { const u = useOf(e); return s + (u === 'sfr' ? (e.floors >= 2 ? 4 : 3) * (e.units ?? 1) : HB[u] ? HB[u] * (e.units ?? 1) : 0); }, 0);
  const beds = mix.reduce((s, t) => s + t.n * (t.beds ?? 1), 0) + homeBeds, NET = { retail: 0.95, restaurant: 0.95, office: 0.87, medical: 0.87, industrial: 1, other: 0.9 };
  const nrsf = mix.reduce((s, t) => s + t.n * t.sf, 0) + B.reduce((s, e) => { const u = useOf(e); return s + (u === 'multifamily' || u === 'amenity' ? 0 : USES[u].garage ? (e.sf ?? gfaOf(e)) : gfaOf(e) * (NET[u] ?? 0.9)); }, 0);
  return { siteSf: site, acres: site / 43560, footprint, gfa, coverage: site ? footprint / site : 0, far: site ? gfa / site : 0, spaces: stallsN + garages, stalls: stallsN, garages, required: need,
    units: units || null, paved, pond, impervious: site ? Math.min(1, (footprint + paved + hard) / site) : 0,
    green: site ? Math.max(0, 1 - (footprint + paved + hard + pond) / site) : 0, heightFt, buildings: B.length,
    mix, beds: beds || null, nrsf, duAc: site && units ? units / (site / 43560) : 0, perUnit: units ? (stallsN + garages) / units : 0, per1k: gfa ? (stallsN + garages) / gfa * 1000 : 0 };
}

// problems to show on the plan: outside the lot, inside a setback, overlaps, parking short, zoning limits
export function check(plan) {
  const ring = plan.ring || [], rules = edgeRules(ring, plan.front, plan.setbacks), issues = [], els = plan.elements || [];
  const name = e => e.name || (KINDS[e.kind]?.label || e.kind) + (els.filter(x => x.kind === e.kind).length > 1 ? ' ' + (els.filter(x => x.kind === e.kind).indexOf(e) + 1) : '');
  for (const e of els) {
    if (e.kind === 'lot') continue;
    const c = shapeOf(e);
    const meets = k => e.kind === 'drive' && rules[k].role === 'front'; // a drive may cross a front edge to meet the street
    const outside = c.some(p => !inRing(p, ring) && !meets(nearestEdge(ring, p)) && distToPoly(p, ring) > 0.6) || c.some((p, i) => ring.some((a, k) => !meets(k) && segsCross(p, c[(i + 1) % c.length], a, ring[(k + 1) % ring.length])));
    if (outside) { issues.push({ id: e.id, level: 'bad', text: name(e) + ' runs outside the lot' }); continue; }
    if (e.kind === 'green' || e.kind === 'trail' || e.kind === 'lot') continue;
    const short = {};
    ring.forEach((a, k) => {
      const need = e.kind === 'building' ? rules[k].build : e.kind === 'drive' && rules[k].role === 'front' ? 0 : e.kind === 'pond' || e.kind === 'play' ? Math.min(5, rules[k].pave) : rules[k].pave;
      if (need > 0 && rectDist(c, a, ring[(k + 1) % ring.length]) < need - 0.5) short[rules[k].role] = Math.max(short[rules[k].role] || 0, need);
    });
    for (const [role, need] of Object.entries(short)) issues.push({ id: e.id, level: e.kind === 'building' ? 'bad' : 'warn', text: name(e) + (e.kind === 'building' ? ' is inside the ' + need + ' ft ' + role + ' setback' : ' is inside the ' + need + ' ft landscape buffer (' + role + ')') });
  }
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j], ks = [a.kind, b.kind];
    if (ks.includes('green') || ks.includes('trail') || ks.includes('lot') || !(KINDS[a.kind]?.solid || KINDS[b.kind]?.solid)) continue;
    if (ks.includes('building') && ks.includes('pool') || ks.includes('building') && ks.includes('plaza') || ks.includes('pool') && ks.includes('plaza')) continue; // a pool on its deck, against its clubhouse
    if (rectsOverlap(a, b)) issues.push({ id: KINDS[a.kind]?.solid ? a.id : b.id, level: 'bad', text: name(a) + ' overlaps ' + name(b).toLowerCase() });
  }
  const m = metrics(plan), z = plan.zoning || {};
  if (m.gfa && m.spaces < m.required) issues.push({ level: 'warn', text: 'Parking is ' + (m.required - m.spaces).toLocaleString('en-US') + ' spaces short of ' + m.required.toLocaleString('en-US') + ' required' });
  if (+z.max_coverage_pct && m.coverage * 100 > +z.max_coverage_pct) issues.push({ level: 'bad', text: 'Coverage ' + Math.round(m.coverage * 100) + '% is over the zoning limit of ' + z.max_coverage_pct + '%' });
  if (+z.max_far && m.far > +z.max_far) issues.push({ level: 'bad', text: 'FAR ' + m.far.toFixed(2) + ' is over the zoning limit of ' + z.max_far });
  if (+z.max_building_height_ft && m.heightFt > +z.max_building_height_ft) issues.push({ level: 'warn', text: 'About ' + m.heightFt + ' ft tall; zoning allows ' + z.max_building_height_ft + ' ft' });
  return issues;
}

// ---------- layout generator ----------
// Lays out a site the way a suburban site is usually planned: squared up with the lot's main lines, the building near
// the street with its parking in front (variant 0), behind it (1) or beside it (2), one parking field with at most two
// driveways, a truck court behind a warehouse, and detention in a strip along the back. Works on a grid in a frame
// turned so the street is at the bottom: cells are open to buildings only beyond every setback, and to paving beyond
// the landscape buffer. With no size it uses a typical size for the use and the site; program.max fits as much
// building as its parking allows.
export const VARIANTS = ['Parking in front', 'Building at the street', 'Parking beside'];
// the direction most of the lot's edge length runs along (mod 90°): buildings square up with it
export function mainAngle(ring) {
  const bins = new Float64Array(90), ang = [];
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), t = ((Math.atan2(b[1] - a[1], b[0] - a[0]) / RAD) % 90 + 90) % 90;
    ang.push([t, L]); for (let d = -3; d <= 3; d++) bins[(Math.round(t) + d + 90) % 90] += L * (1 - Math.abs(d) / 4);
  });
  const best = bins.indexOf(Math.max(...bins)); let s = 0, w = 0;
  for (const [t, L] of ang) { let d = t - best; if (d > 45) d -= 90; if (d < -45) d += 90; if (Math.abs(d) <= 4) { s += d * L; w += L; } }
  return ((best + (w ? s / w : 0)) % 90 + 90) % 90;
}
// [floor area ratio, smallest, largest] for a typical project of each use when the request gives no size
const TYPICAL = { retail: [0.2, 6000, 120000], restaurant: [0.06, 2500, 7000], office: [0.25, 10000, 150000], medical: [0.2, 8000, 80000], other: [0.2, 5000, 100000] };
export function typicalSize(prog, site) {
  if (prog.use === 'multifamily') return Math.round(Math.min(350, Math.max(8, 22 * site / 43560))) * prog.unitSf / 0.85; // about 22 units an acre
  const [far, lo, hi] = TYPICAL[prog.use] || TYPICAL.other; return Math.round(Math.max(lo, Math.min(hi, far * site)) / 500) * 500;
}

export function autoLayout(plan, programIn, variant = 0) {
  const ring = plan.ring, prog = normalizeProgram(programIn), U = USES[prog.use], site = ringArea(ring), notes = [];
  const front = plan.front != null && plan.front < ring.length ? plan.front : longestEdge(ring), rules = edgeRules(ring, front, plan.setbacks);
  // the frame: the lot's main direction, turned the quarter turn that puts the street side at the bottom
  const n0 = outward(ring, front), a0 = mainAngle(ring); let phi = a0, down = -2;
  for (let k = 0; k < 4; k++) { const s = rot(n0, -(a0 + k * 90)); if (-s[1] > down) { down = -s[1]; phi = a0 + k * 90; } }
  const rr = ring.map(p => rot(p, -phi)), street = rot(n0, -phi);
  const xs = rr.map(p => p[0]), ys = rr.map(p => p[1]), X0 = Math.min(...xs), Y0 = Math.min(...ys);
  const c = Math.max(2, Math.min(12, Math.sqrt(site) / 150)), nx = Math.max(1, Math.ceil((Math.max(...xs) - X0) / c)), ny = Math.max(1, Math.ceil((Math.max(...ys) - Y0) / c));
  const okB = new Uint8Array(nx * ny), okP = new Uint8Array(nx * ny), m = c * Math.SQRT1_2, blocked = (plan.blocked || []).map(b => ({ ...b, w: b.w + 2 * m + 10, d: b.d + 2 * m + 10 }));
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const q = [X0 + (i + .5) * c, Y0 + (j + .5) * c]; if (!inRing(q, rr)) continue;
    if (blocked.length && blocked.some(b => hitRect(b, rot(q, phi)))) continue;
    let b = true, p = true;
    for (let k = 0; k < rr.length && p; k++) { const d = segDist(q, rr[k], rr[(k + 1) % rr.length]); if (d < rules[k].pave + m || d < m) p = false; if (d < rules[k].build + m) b = false; }
    okB[j * nx + i] = b && p; okP[j * nx + i] = p;
  }
  const cellC = (i, j, wi, hj) => [X0 + (i + wi / 2) * c, Y0 + (j + hj / 2) * c];
  const toStreet = p => p[0] * street[0] + p[1] * street[1]; // larger is nearer the street
  const midX = X0 + nx * c / 2, MOD = 2 * STALL.d + STALL.aisle, cells = ft => Math.ceil(ft / c);
  const hitsFront = (o, dir) => { let t = Infinity; for (let k = 0; k < rr.length; k++) { if (rules[k].role !== 'front') continue; const a = rr[k], b = rr[(k + 1) % rr.length], e = [b[0] - a[0], b[1] - a[1]], den = dir[0] * e[1] - dir[1] * e[0]; if (Math.abs(den) < 1e-9) continue;
    const s = ((a[0] - o[0]) * e[1] - (a[1] - o[1]) * e[0]) / den, u = ((a[0] - o[0]) * dir[1] - (a[1] - o[1]) * dir[0]) / den; if (s > -1 && u >= 0 && u <= 1 && s < t) t = s; } return t; };
  const blockedT = (plan.blocked || []).map(b => { const q = rot([b.x, b.y], -phi); return { x: q[0], y: q[1], w: b.w, d: b.d, rot: (b.rot || 0) - phi }; }); // in the turned frame
  const rayRect = (o, dir, r) => { let t0 = -Infinity, t1 = Infinity; for (const [k, lo, hi] of [[0, r.x - r.w / 2, r.x + r.w / 2], [1, r.y - r.d / 2, r.y + r.d / 2]]) {
    if (!dir[k]) { if (o[k] <= lo || o[k] >= hi) return Infinity; continue; } const a = (lo - o[k]) / dir[k], b = (hi - o[k]) / dir[k]; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); } return t1 > t0 && t1 > 0 ? Math.max(t0, 0) : Infinity; };

  function run(F, pondFirst) { // one attempt with a total footprint F (sq ft); elements come back in the turned frame
    const used = new Uint8Array(nx * ny), out = [], warn = [], joins = new Set();
    const sumOf = ok => { const S = new Int32Array((nx + 1) * (ny + 1)); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) S[(j + 1) * (nx + 1) + i + 1] = (ok[j * nx + i] && !used[j * nx + i] ? 0 : 1) + S[j * (nx + 1) + i + 1] + S[(j + 1) * (nx + 1) + i] - S[j * (nx + 1) + i]; return S; };
    const free = (S, i, j, wi, hj) => i >= 0 && j >= 0 && i + wi <= nx && j + hj <= ny && !(S[(j + hj) * (nx + 1) + i + wi] - S[j * (nx + 1) + i + wi] - S[(j + hj) * (nx + 1) + i] + S[j * (nx + 1) + i]);
    const mark = (i, j, wi, hj, pad = 0) => { for (let y = Math.max(0, j - pad); y < Math.min(ny, j + hj + pad); y++) for (let x = Math.max(0, i - pad); x < Math.min(nx, i + wi + pad); x++) used[y * nx + x] = 1; };
    const markRect = e => { const i = Math.floor((e.x - e.w / 2 - X0) / c), j = Math.floor((e.y - e.d / 2 - Y0) / c); mark(i, j, Math.ceil((e.x + e.w / 2 - X0) / c) - i, Math.ceil((e.y + e.d / 2 - Y0) / c) - j); };
    // the best spot for rectangles that move together (a building, its truck court, the parking kept beside it): parts are
    // [ok mask, offset i, offset j, width, height] in cells; the score is taken at the centre of the whole group
    const place = (parts, score, sums) => {
      const S = parts.map(p => sums?.get(p[0]) || sumOf(p[0])), i0 = Math.min(...parts.map(p => p[1])), j0 = Math.min(...parts.map(p => p[2]));
      const gw = Math.max(...parts.map(p => p[1] + p[3])) - i0, gh = Math.max(...parts.map(p => p[2] + p[4])) - j0; let best = null;
      for (let j = -j0; j + j0 + gh <= ny; j++) for (let i = -i0; i + i0 + gw <= nx; i++) {
        if (!parts.every((p, k) => free(S[k], i + p[1], j + p[2], p[3], p[4]))) continue;
        const s = score(cellC(i + i0, j + j0, gw, gh)); if (!best || s < best.s) best = { i, j, s };
      }
      return best;
    };
    const add = (kind, i, j, wi, hj, extra = {}) => { const [x, y] = cellC(i, j, wi, hj); const e = { kind, x, y, w: wi * c, d: hj * c, ...extra, cell: [i, j, wi, hj] }; out.push(e); return e; };
    // a straight 26 ft drive from a lot to the street (or to paving that already reaches it), through the lot's span or alongside it
    const reach = (from, toSt) => {
      let best = null; const X = [from.x - from.w / 2, from.x + from.w / 2], Y = [from.y - from.d / 2, from.y + from.d / 2];
      for (const dir of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const h = dir[0] !== 0, span = h ? Y : X, mid = (span[0] + span[1]) / 2, half = (span[1] - span[0]) / 2, sg = dir[0] || dir[1];
        const face = h ? (sg < 0 ? X[0] : X[1]) : (sg < 0 ? Y[0] : Y[1]), back = h ? (sg < 0 ? X[1] : X[0]) : (sg < 0 ? Y[1] : Y[0]);
        const opts = (half >= DRIVE_W / 2 ? [-1, 0, 1].map(f => [mid + f * (half - DRIVE_W / 2), face, 0]) : []).concat([-1, 1].map(f => [mid + f * (half + DRIVE_W / 2 + 0.5), back, 40]));
        for (const [off, start, pen] of opts) {
          const o = h ? [face, off] : [off, face], ts = toSt ? hitsFront(o, dir) : Infinity, tj = Math.min(...[...joins].filter(j => j !== from).map(j => rayRect(o, dir, j)));
          const t = Math.min(ts, tj); if (!(t < 3000)) continue;
          const end = face + sg * (Math.max(t, 0) + (t === ts ? 1 : 0)), lo = Math.min(start, end), hi = Math.max(start, end);
          const dr = h ? { x: (lo + hi) / 2, y: off, w: hi - lo, d: DRIVE_W } : { x: off, y: (lo + hi) / 2, w: DRIVE_W, d: hi - lo };
          let inside = true; // both long sides stay on the lot, clear of the landscape buffer, until the street edge
          for (let a = start, last = false; inside && !last; a += sg * 12) {
            if ((end - a) * sg <= 12) { a = end - sg * 12; last = true; }
            for (const s of [-1, 1]) { const q = h ? [a, off + s * DRIVE_W / 2] : [off + s * DRIVE_W / 2, a];
              if (!inRing(q, rr) || rr.some((p, k) => rules[k].role !== 'front' && segDist(q, p, rr[(k + 1) % rr.length]) < rules[k].pave - 0.5)) { inside = false; break; } }
          }
          if (!inside || out.some(b => (b.kind === 'building' || b.kind === 'pond') && rectsOverlap(b, dr, 1)) || blockedT.some(b => rectsOverlap(b, dr, 1))) continue;
          // driveways cost more than joining paving already on the lot
          const cost = hi - lo + pen + (t === ts ? 60 : 0);
          if (!best || cost < best.cost) best = { cost, dr, street: t === ts };
        }
      }
      return best;
    };
    const lane = (lot, toSt) => { const r = reach(lot, toSt); if (r) { const e = { kind: 'drive', ...r.dr }; out.push(e); markRect(e); joins.add(e); joins.add(lot); } return r; };
    // detention: a share of the land the project covers (buildings, parking, truck court), not of the whole lot
    const pct = prog.detentionPct ?? (site >= 43560 ? 10 : 0), built0 = F + required(prog, F * prog.floors) * 350 + (prog.truck ? Math.sqrt(F) * (U.truck || 130) : 0);
    const A = site * pct / 100 * Math.min(1, 1.3 * built0 / site), tight = 1.3 * built0 > 0.6 * site;
    let pond = null;
    const placePond = near => { // a strip along the back of the lot, or behind the buildings on a roomy lot
      if (!(pct > 0)) return;
      for (let shrink = 1; shrink >= 0.5 && !pond; shrink -= 0.1) for (const r of [8, 5, 3.5, 2.5, 1.6, 1]) {
        const h = Math.sqrt(A * shrink / r), w = A * shrink / h; if (h < 25 && r > 1) continue;
        const at = place([[okP, 0, 0, cells(w), cells(h)]], near ? p => Math.hypot(p[0] - near[0], p[1] - near[1]) + (toStreet(p) > toStreet(near) ? 300 : 0) : p => toStreet(p) + Math.abs(p[0] - midX) * 0.01);
        if (at) { pond = add('pond', at.i, at.j, cells(w), cells(h)); if (shrink < 1) warn.push('detention is ' + Math.round(shrink * 100) + '% of what was asked'); break; }
      }
      if (pond) mark(...pond.cell, cells(10)); else warn.push('no room left for detention');
    };
    if (pondFirst && tight) placePond();

    // buildings: the first with its truck court and the parking kept next to it, as near the street as that allows
    const n = prog.buildings || (prog.use === 'multifamily' ? Math.min(12, Math.max(1, Math.ceil(F / (prog.depth * 300)))) : 1), each = F / n, bl = [];
    const wantD = Math.min(prog.depth, Math.sqrt(each) * 1.6), need = required(prog, F * prog.floors), lc = cells(DRIVE_W + 2);
    let truck = null, reserve = null;
    for (let b = 0; b < n; b++) {
      let got = null; const sums = new Map([[okB, sumOf(okB)], [okP, sumOf(okP)]]);
      for (const k of [1, 0.85, 1.2, 0.7, 1.45, 0.55, 1.8, 0.45]) {
        const D = wantD * k, W = each / D; if (W < 20 || D < 20) continue;
        const wi = cells(W), hj = cells(D);
        for (const o of b ? [{ parts: [[okB, 0, 0, wi, hj]] }] : blockOptions(wi, hj)) {
          const b0 = bl[0], score = b ? p => Math.hypot(p[0] - b0.x, (p[1] - b0.y) * 1.5) - toStreet(p) * 0.2 : p => -toStreet(p) + Math.abs(p[0] - midX) * 0.35;
          const at = place(o.parts, score, sums); if (!at) continue;
          got = add('building', at.i, at.j, wi, hj, { floors: prog.floors }); got.w = each / got.d; // exact floor area, centred in its cells
          if (o.truck) truck = add('truck', at.i + o.truck[1], at.j + o.truck[2], o.truck[3], o.truck[4]);
          if (o.res) reserve = { i: at.i + o.res[1], j: at.j + o.res[2], wi: o.res[3], hj: o.res[4] };
          if (prog.truck && !b && !o.truck) warn.push('no room for a truck court behind the building');
          break;
        }
        if (got) break;
      }
      if (!got) return null;
      bl.push(got); mark(...got.cell, cells(30)); if (truck && !b) mark(...truck.cell, cells(30));
    }
    function blockOptions(wi, hj) { // richest first: full parking kept beside the building, then half, then none
      const W = wi * c, D = hj * c, opts = [], frontMods = Math.max(1, Math.min(4, Math.ceil(need / (2 * Math.max(1, Math.floor(W / STALL.w))))));
      const beside = Math.min(4 * W, Math.ceil(need / (2 * Math.max(1, Math.floor(D / MOD)))) * STALL.w + 4);
      for (const T of prog.truck ? [U.truck || 130, 110, 90, 60, 0] : [0]) for (const side of [-1, 1]) for (const f of [1, 0.5, 0]) {
        const tc = cells(T), parts = [[okB, 0, 0, wi, hj]], tr = T ? [okP, 0, hj, wi, tc] : null;
        if (tr) parts.push(tr, [okP, side < 0 ? -lc : wi, 0, lc, hj + tc]); // a lane beside the building so trucks get round
        let res = null;
        if (f && variant === 0) { const pj = cells(Math.round(frontMods * f) * MOD || MOD); res = [okP, 0, -pj, wi, pj]; }
        if (f && variant === 1) { const pj = cells(Math.round(frontMods * f) * MOD || MOD); res = [okP, 0, hj + tc, wi, pj]; if (!tr) parts.push([okP, side < 0 ? -lc : wi, 0, lc, hj]); }
        if (f && variant === 2) { const pw = cells(beside * f); res = [okP, side < 0 ? -pw - (tr && side < 0 ? lc : 0) : wi + (tr && side > 0 ? lc : 0), 0, pw, hj]; }
        if (res) parts.push(res);
        if (!f && opts.some(o => !o.res && o.truck === tr && o.parts.length === parts.length)) continue;
        opts.push({ parts, truck: tr, res });
      }
      return opts;
    }
    used.fill(0); for (const b of bl) mark(...b.cell, cells(10)); // then a 10 ft walk around each for the paving
    if (truck) mark(...truck.cell);
    if (pondFirst && !tight) { if (reserve) mark(reserve.i, reserve.j, reserve.wi, reserve.hj); placePond([bl.reduce((s, e) => s + e.x, 0) / bl.length, bl.reduce((s, e) => s + e.y, 0) / bl.length]); used.fill(0); for (const b of bl) mark(...b.cell, cells(10)); if (truck) mark(...truck.cell); }
    if (pond) mark(...pond.cell, cells(10));
    if (truck) { if (!lane(truck, true)) warn.push('the truck court has no straight drive to the street; add one by hand'); }
    const gfa = bl.reduce((s, e) => s + e.w * e.d * prog.floors, 0), needAll = required(prog, gfa);
    const bc = [bl.reduce((s, e) => s + e.x, 0) / bl.length, bl.reduce((s, e) => s + e.y, 0) / bl.length];

    // parking modules: the strip that adds the most stalls, in the space kept for parking and touching the field, until enough
    let have = 0; const lots = [];
    const overlap = (i, j, wi, hj, r) => r ? Math.max(0, Math.min(i + wi, r.i + r.wi) - Math.max(i, r.i)) * Math.max(0, Math.min(j + hj, r.j + r.hj) - Math.max(j, r.j)) / (wi * hj) : 0;
    const touching = (i, j, wi, hj) => lots.concat(bl).some(o => { const [a, b, w, h] = o.cell, pad = o.kind === 'building' ? cells(10) + 1 : 1; return i < a + w + pad && a - pad < i + wi && j < b + h + pad && b - pad < j + hj; });
    for (let guard = 0; guard < 60 && have < needAll; guard++) {
      let best = null; const S = sumOf(okP);
      for (const [D, rows] of [[MOD, 2], [STALL.d + STALL.aisle, 1]]) {
        const hj = cells(D);
        for (let j = 0; j + hj <= ny; j++) {
          let i = 0;
          while (i < nx) {
            if (!free(S, i, j, 1, hj)) { i++; continue; }
            let k = i; while (k < nx && free(S, k, j, 1, hj)) k++;
            let wi = k - i, i0 = i, per = Math.floor(wi * c / STALL.w) * rows;
            if (per >= 4) {
              const left = needAll - have; if (per > left * 1.1 + rows) { // trim to what's still needed, nearest the buildings
                wi = Math.min(wi, cells(Math.ceil(left / rows) * STALL.w)); per = Math.floor(wi * c / STALL.w) * rows;
                const target = reserve ? reserve.i + reserve.wi / 2 : (bc[0] - X0) / c;
                i0 = Math.max(i, Math.min(k - wi, Math.round(target - wi / 2)));
              }
              const p = cellC(i0, j, wi, hj), dist = Math.hypot(p[0] - bc[0], p[1] - bc[1]);
              const s = Math.min(per, needAll - have) * 10 + per * 0.5 - dist / 20 - (rows === 1 ? 8 : 0) + overlap(i0, j, wi, hj, reserve) * 60 + (touching(i0, j, wi, hj) ? 25 : 0);
              if (!best || s > best.s) best = { s, i: i0, j, wi, hj };
            }
            i = k;
          }
        }
      }
      if (!best) break;
      const e = add('parking', best.i, best.j, best.wi, best.hj, { islands: true }); mark(...e.cell); lots.push(e); have += stalls(e).count;
    }
    if (!pondFirst) placePond();
    // drives: the lot nearest the street gets a driveway; the rest join the field, with at most two driveways in all
    const touches = (a, b) => rectsOverlap({ ...a, w: a.w + 2, d: a.d + 2 }, b, 0);
    const spread = l => { if (joins.has(l)) return; joins.add(l); lots.filter(o => touches(o, l)).forEach(spread); };
    let driveways = 0;
    for (const lot of lots.slice().sort((a, b) => toStreet([b.x, b.y]) - toStreet([a.x, a.y]))) {
      if (joins.has(lot) || [...joins].some(d => touches(d, lot))) { spread(lot); continue; }
      const r = lane(lot, driveways < 2); if (r?.street) driveways++;
      if (r) spread(lot); else warn.push('a parking area has no straight drive to the street; add one by hand');
    }
    return { out, gfa, need: needAll, have, warn, truck: !!truck };
  }

  let max = prog.max || (prog.gfa == null && prog.use === 'industrial'), res = null;
  const go = F => run(F, true) || run(F, false);
  if (!max) {
    const want = prog.gfa ?? typicalSize(prog, site);
    res = go(want / prog.floors);
    if (!res) { notes.push(Math.round(want).toLocaleString('en-US') + ' sq ft doesn’t fit inside the setbacks; showing the largest that does.'); max = true; }
    else if (prog.gfa == null) prog.gfa = Math.round(res.gfa);
  }
  if (max) { // as much building as fits with its parking: binary search on the footprint
    let lo = 1000, hi = Math.max(1000, site * 0.7), best = null;
    for (let it = 0; it < 12 && hi - lo > Math.max(300, lo * 0.02); it++) {
      const F = (lo + hi) / 2, r = go(F);
      if (r && r.have >= r.need && (r.truck || !prog.truck)) { best = r; lo = F; } else hi = F; // a warehouse keeps its truck court
    }
    res = best || go(lo);
  }
  if (!res) return { elements: [], notes: ['Nothing fits inside the setbacks on this lot.'], phi };
  if (res.have < res.need) notes.push('Parking is ' + (res.need - res.have) + ' spaces short; consider structured parking, a lower ratio or less building.');
  res.warn.forEach(w => notes.push(w[0].toUpperCase() + w.slice(1) + '.'));
  let k = 0;
  const elements = res.out.map(e => { const [x, y] = rot([e.x, e.y], phi); return { id: 'e' + (++k).toString(36) + Math.random().toString(36).slice(2, 6), kind: e.kind, ...(e.islands ? { islands: true } : {}), x: +x.toFixed(2), y: +y.toFixed(2), d: +e.d.toFixed(2), w: e.kind === 'building' ? +(e.w * e.d / +e.d.toFixed(2)).toFixed(4) : +e.w.toFixed(2), rot: +(((phi % 360) + 360) % 360).toFixed(3), ...(e.floors ? { floors: e.floors } : {}) }; });
  return { elements, notes, phi, program: prog };
}

// ---------- map features ----------
// what a piece is called and how big it is, for labels on the map, the PDF and the DXF
export function labelOf(e, prog) {
  const P = normalizeProgram(prog), use = USES[e.use] ? e.use : P.use, gfa = Math.round(e.sf ?? e.w * e.d * (e.floors || 1));
  if (e.kind === 'building' && use === 'sfr') return { name: e.name || '', what: e.note || '', size: '' }; // a home: its lot number and type are enough
  if (e.kind === 'building') {
    const n = e.units ?? (use === 'multifamily' ? Math.floor(gfa * (P.eff || 0.85) / P.unitSf) : null);
    return { name: e.name || '', what: e.note || (e.name ? USES[use].label : ''), size: (n > 1 && use !== 'amenity' ? n + ' units · ' : '') + gfa.toLocaleString('en-US') + ' sf' + ((e.floors || 1) > 1 ? ' · ' + e.floors + ' fl' : '') };
  }
  if (e.kind === 'parking') return { name: '', what: '', size: stalls(e).count + ' spaces' };
  if (e.kind === 'pond') return { name: e.name || '', what: '', size: (elArea(e) / 43560).toFixed(2) + ' ac' };
  if (['court', 'pool', 'play', 'plaza', 'green'].includes(e.kind) && e.name) return { name: e.name, what: e.note || '', size: '' };
  return { name: e.name || '', what: '', size: '' };
}

// the planting and walks that make a plan read like one, worked out from the pieces (nothing is stored):
// an 8 ft walk around each building, trees every ~40 ft along the landscape buffer and around ponds, and a tree in
// each parking island. Feet; trees are [x, y, canopy radius].
export function details(plan) {
  const ring = plan.ring || [], els = plan.elements || [], trees = [], walks = [], islands = [];
  if (ring.length < 3) return { trees, walks, islands };
  for (const e of els) if (e.kind === 'building' && !e.nowalk) walks.push({ x: e.x, y: e.y, w: e.w + 16, d: e.d + 16, rot: e.rot });
  for (const e of els) if (e.kind === 'parking') {
    for (const c of islandsOf(e)) { islands.push({ x: c[0], y: c[1], w: e.sw || STALL.w, d: e.sd || STALL.d, rot: e.rot }); trees.push([c[0], c[1], 12]); }
    for (const c of capsOf(e)) { islands.push({ poly: c.poly, x: c.tree[0], y: c.tree[1], w: 9, d: 18 }); trees.push([c.tree[0], c.tree[1], 11]); }
  }
  const clear = (p, r, skip) => inRing(p, ring) && !els.some(e => e !== skip && e.kind !== 'green' && e.kind !== 'trail' && nearPiece(e, p, r + (e.kind === 'building' ? 8 : 0))) && !trees.some(t => Math.hypot(t[0] - p[0], t[1] - p[1]) < r + t[2] - 4);
  const buf = Math.max(6, (edgeRules(ring, plan.front, plan.setbacks)[0]?.pave || 10) / 2);
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 30) return;
    const n = outward(ring, i), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], k = Math.max(1, Math.round((L - 30) / 40));
    for (let t = 0; t <= k; t++) { const s = 15 + (L - 30) * t / k, p = [a[0] + u[0] * s - n[0] * buf, a[1] + u[1] * s - n[1] * buf]; if (clear(p, 12)) trees.push([p[0], p[1], 12]); }
  });
  for (const e of els) if (e.kind === 'pond') { // around the bank, 22 ft out
    const o = isFree(e) ? grow(e.poly, 22) : outline({ ...e, w: e.w + 44, d: e.d + 44 }), per = o.reduce((s, p, i) => s + Math.hypot(o[(i + 1) % o.length][0] - p[0], o[(i + 1) % o.length][1] - p[1]), 0), step = Math.max(1, Math.round(o.length * 45 / per));
    for (let i = 0; i < o.length; i += step) if (clear(o[i], 12, e)) trees.push([o[i][0], o[i][1], 12]);
  }
  if (plan.params?.trees === false) trees.length = 0; // trees switched off: none at all
  for (const e of plan.params?.trees === false ? [] : els) if (e.kind === 'green' && e.trees) { // a planted lawn or buffer: trees scattered on a 45 ft grid
    const o = outline(e), xs = o.map(p => p[0]), ys = o.map(p => p[1]);
    for (let x = Math.min(...xs) + 20; x < Math.max(...xs) - 10; x += 45) for (let y = Math.min(...ys) + 20; y < Math.max(...ys) - 10; y += 45) { const p = [x + ((y / 45) % 2) * 20, y]; if (inRing(p, o) && clear(p, 12, e)) trees.push([p[0], p[1], 12]); }
  }
  return { trees, walks, islands };
}

export function planFeatures(plan, selected) {
  const F = frame(plan.origin), ll = r => r.map(F.toLL), poly = r => ({ type: 'Polygon', coordinates: [ll(r.concat([r[0]]))] }), feats = [], prog = normalizeProgram(plan.program);
  const ring = plan.ring || []; if (ring.length < 3) return { type: 'FeatureCollection', features: feats };
  feats.push({ type: 'Feature', properties: { k: 'lot' }, geometry: poly(ring) });
  for (const z of plan.zones || []) if (z.ring?.length >= 3) feats.push({ type: 'Feature', properties: { k: 'zone', t: z.name }, geometry: poly(z.ring) });
  const rules = edgeRules(ring, plan.front, plan.setbacks);
  feats.push({ type: 'Feature', properties: { k: 'setback' }, geometry: poly(insetRing(ring, rules.map(r => r.build))) });
  const f = plan.front ?? longestEdge(ring); feats.push({ type: 'Feature', properties: { k: 'front' }, geometry: { type: 'LineString', coordinates: ll([ring[f], ring[(f + 1) % ring.length]]) } });
  const bad = new Set(check(plan).filter(i => i.id && i.level === 'bad').map(i => i.id)), d = details(plan);
  for (const w of d.walks) feats.push({ type: 'Feature', properties: { k: 'walk' }, geometry: poly(corners(w)) });
  for (const e of plan.elements || []) {
    const use = USES[e.use] ? e.use : prog.use;
    const props = { k: e.kind, use, id: e.id, sel: e.id === selected ? 1 : 0, bad: bad.has(e.id) ? 1 : 0, h: e.kind === 'building' ? +((e.floors || 1) * USES[use].floorH / FT).toFixed(1) : 0 };
    feats.push({ type: 'Feature', properties: props, geometry: poly(outline(e)) });
    if (e.kind === 'parking') for (const l of stallLines(e)) feats.push({ type: 'Feature', properties: { k: 'stall' }, geometry: { type: 'LineString', coordinates: ll(l) } });
    const L = labelOf(e, plan.program), t = [L.name.toUpperCase(), L.what, L.size].filter(Boolean).join('\n');
    if (t) feats.push({ type: 'Feature', properties: { k: 'label', t, kind: e.kind, big: e.kind === 'building' ? 1 : 0 }, geometry: { type: 'Point', coordinates: F.toLL([e.x, e.y]) } });
  }
  for (const i of d.islands) feats.push({ type: 'Feature', properties: { k: 'island' }, geometry: poly(outline(i)) });
  for (const [x, y, r] of d.trees) feats.push({ type: 'Feature', properties: { k: 'tree', r }, geometry: { type: 'Point', coordinates: F.toLL([x, y]) } });
  return { type: 'FeatureCollection', features: feats };
}

// ---------- DXF (AutoCAD R12 ASCII: opens in AutoCAD, CADCraft, LibreCAD, QCAD, BricsCAD) ----------
// Feet, origin at the plan origin (its lon/lat is written as a note on the drawing), north up.
const LAYERS = [['LOT', 7], ['SETBACK', 8], ['ZONES', 8], ['BUILDING', 1], ['PARKING', 3], ['STALLS', 9], ['DRIVE', 8], ['TRUCK', 6], ['POND', 5], ['LANDSCAPE', 82], ['AMENITY', 4], ['PLAZA', 41], ['WALK', 9], ['TREES', 3], ['TEXT', 2]];
export function toDXF(plan, title = '') {
  const o = [], g = (c, v) => o.push(String(c), String(v));
  const num = v => (+v).toFixed(4);
  const pl = (layer, pts, closed = true) => { g(0, 'POLYLINE'); g(8, layer); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, closed ? 1 : 0); for (const [x, y] of pts) { g(0, 'VERTEX'); g(8, layer); g(10, num(x)); g(20, num(y)); g(30, 0); } g(0, 'SEQEND'); g(8, layer); };
  const line = (layer, [a, b]) => { g(0, 'LINE'); g(8, layer); g(10, num(a[0])); g(20, num(a[1])); g(30, 0); g(11, num(b[0])); g(21, num(b[1])); g(31, 0); };
  const text = (layer, [x, y], h, s, center = true) => { g(0, 'TEXT'); g(8, layer); g(10, num(x)); g(20, num(y)); g(30, 0); g(40, num(h)); g(1, String(s).replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7e]/g, '-')); if (center) { g(72, 1); g(73, 2); g(11, num(x)); g(21, num(y)); g(31, 0); } };
  const ring = plan.ring || [], xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
  const box = ring.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : [0, 0, 100, 100];
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 2); g(9, '$EXTMIN'); g(10, num(box[0])); g(20, num(box[1])); g(9, '$EXTMAX'); g(10, num(box[2])); g(20, num(box[3])); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1); g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0); g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, LAYERS.length); for (const [n, col] of LAYERS) { g(0, 'LAYER'); g(2, n); g(70, 0); g(62, col); g(6, 'CONTINUOUS'); } g(0, 'ENDTAB'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  if (ring.length >= 3) {
    pl('LOT', ring);
    pl('SETBACK', insetRing(ring, edgeRules(ring, plan.front, plan.setbacks).map(r => r.build)));
  }
  const layerOf = { building: 'BUILDING', parking: 'PARKING', drive: 'DRIVE', truck: 'TRUCK', pond: 'POND', green: 'LANDSCAPE', plaza: 'PLAZA', court: 'AMENITY', pool: 'AMENITY', play: 'AMENITY' };
  for (const z of (plan.zones || []).length > 1 ? plan.zones : []) if (z.ring?.length >= 3) pl('ZONES', z.ring);
  const D = details(plan); for (const w of D.walks) pl('WALK', corners(w)); for (const i of D.islands) pl('LANDSCAPE', outline(i));
  for (const [x, y, r] of D.trees) { g(0, 'CIRCLE'); g(8, 'TREES'); g(10, num(x)); g(20, num(y)); g(30, 0); g(40, num(r)); }
  const m = metrics(plan), th = Math.max(4, Math.min(20, Math.sqrt(m.siteSf || 1e4) / 40));
  for (const e of plan.elements || []) {
    pl(layerOf[e.kind] || 'LANDSCAPE', outline(e));
    if (e.kind === 'parking') { stallLines(e).forEach(l => line('STALLS', l)); text('TEXT', [e.x, e.y], th * 0.8, stalls(e).count + ' SPACES'); }
    if (e.kind === 'building') { const L = labelOf(e, plan.program); if (L.name) text('TEXT', [e.x, e.y + th * 0.7], th, L.name.toUpperCase()); text('TEXT', [e.x, e.y - (L.name ? th * 0.7 : 0)], th * 0.8, L.size.toUpperCase()); }
    else if (e.name && !['parking', 'pond', 'drive'].includes(e.kind)) text('TEXT', [e.x, e.y], th * 0.8, e.name.toUpperCase());
    if (e.kind === 'pond') text('TEXT', [e.x, e.y], th * 0.8, (e.name || 'Detention').toUpperCase() + ' ' + (elArea(e) / 43560).toFixed(2) + ' AC');
  }
  // notes block under the lot
  const lines = [title, m.acres.toFixed(2) + ' AC (' + Math.round(m.siteSf).toLocaleString('en-US') + ' SF)', 'BUILDING ' + Math.round(m.gfa).toLocaleString('en-US') + ' SF, COVERAGE ' + (m.coverage * 100).toFixed(1) + '%, FAR ' + m.far.toFixed(2),
    'PARKING ' + m.spaces + ' SPACES (' + m.required + ' REQUIRED)', 'UNITS: FEET. ORIGIN 0,0 = LON ' + plan.origin[0] + ', LAT ' + plan.origin[1] + '. NORTH IS UP.', 'PLANNING SKETCH ONLY. NOT A SURVEY OR ENGINEERED PLAN.'].filter(Boolean);
  lines.forEach((s, i) => text('TEXT', [box[0], box[1] - th * 3 - i * th * 1.8], th * 0.8, s.toUpperCase(), false));
  // north arrow
  const na = [box[2] + th * 4, box[3] - th * 6]; pl('TEXT', [[na[0], na[1] + th * 4], [na[0] - th, na[1]], [na[0] + th, na[1]]]); text('TEXT', [na[0], na[1] + th * 5.5], th, 'N');
  g(0, 'ENDSEC'); g(0, 'EOF');
  return o.join('\r\n') + '\r\n';
}

// for lib/sitecompose.mjs
export { rot as rotPt, outward as outwardOf };
