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
  green: { label: 'Landscape' }
};

// typical suburban Houston-area numbers, used when the request doesn't say
export const USES = {
  retail: { label: 'Retail', ratio: 4, floors: 1, depth: 100, floorH: 20 },
  restaurant: { label: 'Restaurant', ratio: 10, floors: 1, depth: 70, floorH: 18 },
  office: { label: 'Office', ratio: 3.5, floors: 2, depth: 110, floorH: 13 },
  medical: { label: 'Medical office', ratio: 5, floors: 1, depth: 100, floorH: 14 },
  industrial: { label: 'Industrial / warehouse', ratio: 0.6, floors: 1, depth: 240, floorH: 36, truck: 130 },
  multifamily: { label: 'Multifamily', perUnit: 1.6, floors: 3, depth: 65, floorH: 10, unitSf: 900 },
  other: { label: 'Other', ratio: 3, floors: 1, depth: 100, floorH: 16 }
};
export const SETBACKS = { front: 25, side: 10, rear: 20, paving: 10 };
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
  return edgeRoles(ring, front).map(role => ({ role, build: +S[role] || 0, pave: +S.paving || 0 }));
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
export const toLocal = (e, [x, y]) => rot([x - e.x, y - e.y], -(e.rot || 0));
export const hitRect = (e, p) => { const [u, v] = toLocal(e, p); return Math.abs(u) <= e.w / 2 && Math.abs(v) <= e.d / 2; };
export function rectsOverlap(a, b, slack = 0.5) {
  const A = corners(a), B = corners(b);
  for (const R of [A, B]) for (let i = 0; i < 2; i++) {
    const ax = [R[i + 1][0] - R[i][0], R[i + 1][1] - R[i][1]], L = Math.hypot(...ax) || 1, n = [ax[0] / L, ax[1] / L];
    const pa = A.map(p => p[0] * n[0] + p[1] * n[1]), pb = B.map(p => p[0] * n[0] + p[1] * n[1]);
    if (Math.max(...pa) - slack <= Math.min(...pb) || Math.max(...pb) - slack <= Math.min(...pa)) return false;
  }
  return true;
}
const rectDist = (c, a, b) => c.reduce((m, p, i) => Math.min(m, segSeg(p, c[(i + 1) % 4], a, b)), Infinity);

// parking stalls in a parking rectangle: 90° stalls in double-loaded modules (stall + aisle + stall), then one
// single-loaded row if there's room. Rows run along whichever side holds more stalls.
export function stalls(e, S = STALL) {
  const lay = (W, D) => {
    const n = Math.floor((W + 0.01) / S.w), rows = []; let y = -D / 2;
    if (n < 1) return { count: 0, rows, n, W };
    while (D / 2 - y >= 2 * S.d + S.aisle - 0.01) { rows.push([y, y + S.d], [y + S.d + S.aisle, y + 2 * S.d + S.aisle]); y += 2 * S.d + S.aisle; }
    if (D / 2 - y >= S.d + S.aisle - 0.01) rows.push([y, y + S.d]);
    return { count: rows.length * n, rows, n, W };
  };
  // rows turn to the short side only when that holds more and the rows are still 60 ft or longer (no stubby dead-end aisles)
  const a = lay(e.w, e.d), b = lay(e.d, e.w), okA = a.W >= 60 || !b.count, okB = b.W >= 60 || !a.count;
  return okB && (b.count > a.count || !okA) ? { ...b, swap: true } : { ...a, swap: false };
}
// the stripe lines of a parking rectangle, in plan feet
export function stallLines(e, S = STALL) {
  const st = stalls(e, S), W = st.swap ? e.d : e.w, out = [], x0 = -st.n * S.w / 2;
  const put = (u, v) => { const p = st.swap ? [v, -u] : [u, v], q = rot(p, e.rot || 0); return [+(e.x + q[0]).toFixed(2), +(e.y + q[1]).toFixed(2)]; };
  if (W <= 0) return out;
  st.rows.forEach(([y0, y1], k) => { // rows come in pairs facing a shared aisle; a row's head line is the side away from it
    for (let i = 0; i <= st.n; i++) out.push([put(x0 + i * S.w, y0), put(x0 + i * S.w, y1)]);
    const head = k % 2 ? y1 : y0; out.push([put(x0, head), put(-x0, head)]);
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
    truck: p.truck == null ? !!U.truck : !!p.truck
  };
  if (use === 'multifamily' && out.units && !out.gfa) out.gfa = Math.round(out.units * out.unitSf / 0.85);
  return out;
}
export const unitsOf = (prog, gfa) => prog.units && Math.abs(prog.units * prog.unitSf / 0.85 - gfa) < 0.15 * gfa ? prog.units : Math.floor(gfa * 0.85 / (prog.unitSf || 900));
// (a hundredth of a space of slack, so feet rounded to two decimals don't add a space)
export const required = (prog, gfa) => Math.ceil((prog.use === 'multifamily' ? unitsOf(prog, gfa) * prog.perUnit : gfa / 1000 * prog.ratio) - 0.01);

// a rough program from plain words, used without AI and as the AI's starting point
export function guessProgram(text) {
  const t = String(text || '').toLowerCase().replace(/(\d),(\d{3})/g, '$1$2'), p = {};
  const kinds = [['industrial', /warehouse|industrial|distribution|logistics|flex|manufactur|cross[- ]?dock|storage yard/], ['multifamily', /apartment|multi-?family|units\b|townhom|senior living|residential/],
    ['medical', /medical|clinic|dental|urgent care|hospital|surgery/], ['restaurant', /restaurant|qsr|drive[- ]?thru|coffee|fast food|cafe/], ['office', /office/], ['retail', /retail|strip|shopping|store|shop\b|shops|center|grocery|c-store|gas station/]];
  p.use = (kinds.find(([, re]) => re.test(t)) || ['other'])[0];
  const sf = t.match(/(\d+(?:\.\d+)?)\s*(k|thousand)?\s*(?:sf|sq\.?\s*ft|square[- ]f(?:ee|oo)t)/); if (sf) p.gfa = +sf[1] * (sf[2] ? 1000 : 1);
  const fl = t.match(/(\d+)[- ]?(?:stor(?:y|ies|ey)|floors?|levels?)/); if (fl) p.floors = +fl[1];
  const un = t.match(/(\d+)[- ]?(?:units|apartments|doors|homes)/); if (un) p.units = +un[1];
  const ra = t.match(/(\d+(?:\.\d+)?)\s*(?:\/|per)\s*1000/); if (ra) p.ratio = +ra[1];
  const pu = t.match(/(\d(?:\.\d+)?)\s*(?:spaces|stalls|parking)?\s*per\s*unit/); if (pu) p.perUnit = +pu[1];
  const bd = t.match(/(\d+)\s*buildings?/); if (bd) p.buildings = +bd[1];
  const de = t.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of the site\s*)?(?:for\s*)?detention/); if (de) p.detentionPct = +de[1]; if (/no detention|without detention/.test(t)) p.detentionPct = 0;
  if (/no truck|without truck/.test(t)) p.truck = false; else if (/truck court|dock|loading/.test(t)) p.truck = true;
  if (/max(imize|imum)?|as (much|big|large) as|biggest|largest/.test(t) && !sf) p.gfa = null;
  return p;
}

// ---------- numbers and checks ----------
export function metrics(plan) {
  const ring = plan.ring || [], els = plan.elements || [], prog = normalizeProgram(plan.program), U = USES[prog.use];
  const area = e => e.w * e.d, sum = (k, f = area) => els.filter(e => e.kind === k).reduce((s, e) => s + f(e), 0);
  const site = ringArea(ring), footprint = sum('building'), gfa = sum('building', e => area(e) * (e.floors || 1));
  const paved = sum('parking') + sum('drive') + sum('truck'), pond = sum('pond'), spaces = els.filter(e => e.kind === 'parking').reduce((s, e) => s + stalls(e).count, 0);
  const need = gfa ? required(prog, gfa) : 0, floors = Math.max(0, ...els.filter(e => e.kind === 'building').map(e => e.floors || 1));
  return { siteSf: site, acres: site / 43560, footprint, gfa, coverage: site ? footprint / site : 0, far: site ? gfa / site : 0, spaces, required: need,
    units: prog.use === 'multifamily' && gfa ? unitsOf(prog, gfa) : null, paved, pond, impervious: site ? Math.min(1, (footprint + paved) / site) : 0,
    green: site ? Math.max(0, 1 - (footprint + paved + pond) / site) : 0, heightFt: floors * U.floorH, buildings: els.filter(e => e.kind === 'building').length };
}

// problems to show on the plan: outside the lot, inside a setback, overlaps, parking short, zoning limits
export function check(plan) {
  const ring = plan.ring || [], rules = edgeRules(ring, plan.front, plan.setbacks), issues = [], els = plan.elements || [];
  const name = e => (KINDS[e.kind]?.label || e.kind) + (els.filter(x => x.kind === e.kind).length > 1 ? ' ' + (els.filter(x => x.kind === e.kind).indexOf(e) + 1) : '');
  for (const e of els) {
    const c = corners(e);
    const meets = k => e.kind === 'drive' && rules[k].role === 'front'; // a drive may cross a front edge to meet the street
    const outside = c.some(p => !inRing(p, ring) && !meets(nearestEdge(ring, p))) || c.some((p, i) => ring.some((a, k) => !meets(k) && segsCross(p, c[(i + 1) % 4], a, ring[(k + 1) % ring.length])));
    if (outside) { issues.push({ id: e.id, level: 'bad', text: name(e) + ' runs outside the lot' }); continue; }
    if (e.kind === 'green') continue;
    const short = {};
    ring.forEach((a, k) => {
      const need = e.kind === 'building' ? rules[k].build : e.kind === 'drive' && rules[k].role === 'front' ? 0 : e.kind === 'pond' ? 0 : rules[k].pave;
      if (need > 0 && rectDist(c, a, ring[(k + 1) % ring.length]) < need - 0.5) short[rules[k].role] = Math.max(short[rules[k].role] || 0, need);
    });
    for (const [role, need] of Object.entries(short)) issues.push({ id: e.id, level: e.kind === 'building' ? 'bad' : 'warn', text: name(e) + (e.kind === 'building' ? ' is inside the ' + need + ' ft ' + role + ' setback' : ' is inside the ' + need + ' ft landscape buffer (' + role + ')') });
  }
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j], ks = [a.kind, b.kind];
    if (ks.includes('green') || !(ks.includes('building') || ks.includes('pond'))) continue;
    if (rectsOverlap(a, b)) issues.push({ id: a.kind === 'building' || a.kind === 'pond' ? a.id : b.id, level: 'bad', text: name(a) + ' overlaps ' + name(b).toLowerCase() });
  }
  const m = metrics(plan), z = plan.zoning || {};
  if (m.gfa && m.spaces < m.required) issues.push({ level: 'warn', text: 'Parking is ' + (m.required - m.spaces).toLocaleString('en-US') + ' spaces short of ' + m.required.toLocaleString('en-US') + ' required' });
  if (+z.max_coverage_pct && m.coverage * 100 > +z.max_coverage_pct) issues.push({ level: 'bad', text: 'Coverage ' + Math.round(m.coverage * 100) + '% is over the zoning limit of ' + z.max_coverage_pct + '%' });
  if (+z.max_far && m.far > +z.max_far) issues.push({ level: 'bad', text: 'FAR ' + m.far.toFixed(2) + ' is over the zoning limit of ' + z.max_far });
  if (+z.max_building_height_ft && m.heightFt > +z.max_building_height_ft) issues.push({ level: 'warn', text: 'About ' + m.heightFt + ' ft tall; zoning allows ' + z.max_building_height_ft + ' ft' });
  return issues;
}

// ---------- layout generator ----------
// Lays out buildings, parking, a truck court, drives and detention on the lot for a program. Works on a grid in a frame
// turned to the street side: cells are open to buildings only beyond every setback, and to paving beyond the buffer.
// variant 0: parking in front of the building; 1: building at the street, parking behind; 2: turned 90°.
// Leave gfa empty to fit as much building as the parking allows.
export function autoLayout(plan, programIn, variant = 0) {
  const ring = plan.ring, prog = normalizeProgram(programIn), U = USES[prog.use], site = ringArea(ring), notes = [];
  const front = plan.front != null && plan.front < ring.length ? plan.front : longestEdge(ring), rules = edgeRules(ring, front, plan.setbacks);
  const fa = ring[front], fb = ring[(front + 1) % ring.length], phi = Math.atan2(fb[1] - fa[1], fb[0] - fa[0]) / RAD + (variant === 2 ? 90 : 0);
  const rr = ring.map(p => rot(p, -phi)), street = rot(outward(ring, front), -phi); // in the turned frame
  const xs = rr.map(p => p[0]), ys = rr.map(p => p[1]), X0 = Math.min(...xs), Y0 = Math.min(...ys);
  const c = Math.max(2, Math.min(12, Math.sqrt(site) / 150)), nx = Math.max(1, Math.ceil((Math.max(...xs) - X0) / c)), ny = Math.max(1, Math.ceil((Math.max(...ys) - Y0) / c));
  const okB = new Uint8Array(nx * ny), okP = new Uint8Array(nx * ny), m = c * Math.SQRT1_2;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const q = [X0 + (i + .5) * c, Y0 + (j + .5) * c]; if (!inRing(q, rr)) continue;
    let b = true, p = true;
    for (let k = 0; k < rr.length && p; k++) { const d = segDist(q, rr[k], rr[(k + 1) % rr.length]); if (d < rules[k].pave + m || d < m) p = false; if (d < rules[k].build + m) b = false; }
    okB[j * nx + i] = b && p; okP[j * nx + i] = p;
  }
  const cellC = (i, j, wi, hj) => [X0 + (i + wi / 2) * c, Y0 + (j + hj / 2) * c];
  const toStreet = p => p[0] * street[0] + p[1] * street[1];

  // the side away from the street, as a grid axis and direction (where a truck court goes)
  const ax = Math.abs(street[1]) >= Math.abs(street[0]) ? 'y' : 'x', far = (ax === 'y' ? street[1] : street[0]) < 0 ? 1 : -1;
  const perp = [-street[1], street[0]], across = p => p[0] * perp[0] + p[1] * perp[1], acr = rr.map(across), midA = (Math.min(...acr) + Math.max(...acr)) / 2;
  const hitsFront = (o, dir) => { let t = Infinity; for (let k = 0; k < rr.length; k++) { if (rules[k].role !== 'front') continue; const a = rr[k], b = rr[(k + 1) % rr.length], e = [b[0] - a[0], b[1] - a[1]], den = dir[0] * e[1] - dir[1] * e[0]; if (Math.abs(den) < 1e-9) continue;
    const s = ((a[0] - o[0]) * e[1] - (a[1] - o[1]) * e[0]) / den, u = ((a[0] - o[0]) * dir[1] - (a[1] - o[1]) * dir[0]) / den; if (s > -1 && u >= 0 && u <= 1 && s < t) t = s; } return t; };

  function run(F) { // one attempt with a total footprint F (sq ft); returns elements in the turned frame
    const used = new Uint8Array(nx * ny), out = [], warn = [];
    const sumOf = ok => { const S = new Int32Array((nx + 1) * (ny + 1)); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) S[(j + 1) * (nx + 1) + i + 1] = (ok[j * nx + i] && !used[j * nx + i] ? 0 : 1) + S[j * (nx + 1) + i + 1] + S[(j + 1) * (nx + 1) + i] - S[j * (nx + 1) + i]; return S; };
    const free = (S, i, j, wi, hj) => i >= 0 && j >= 0 && i + wi <= nx && j + hj <= ny && !(S[(j + hj) * (nx + 1) + i + wi] - S[j * (nx + 1) + i + wi] - S[(j + hj) * (nx + 1) + i] + S[j * (nx + 1) + i]);
    const mark = (i, j, wi, hj, pad = 0) => { for (let y = Math.max(0, j - pad); y < Math.min(ny, j + hj + pad); y++) for (let x = Math.max(0, i - pad); x < Math.min(nx, i + wi + pad); x++) used[y * nx + x] = 1; };
    const markRect = (e, pad = 0) => { const i = Math.floor((e.x - e.w / 2 - X0) / c), j = Math.floor((e.y - e.d / 2 - Y0) / c); mark(i, j, Math.ceil((e.x + e.w / 2 - X0) / c) - i, Math.ceil((e.y + e.d / 2 - Y0) / c) - j, pad); };
    // the best spot for one or more rectangles that move together (a building and its truck court): parts are
    // [ok mask, offset i, offset j, width, height] in cells; the score is taken at the first part's centre
    const place = (parts, score) => {
      const S = parts.map(p => sumOf(p[0])); let best = null;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        if (!parts.every((p, k) => free(S[k], i + p[1], j + p[2], p[3], p[4]))) continue;
        const s = score(cellC(i + parts[0][1], j + parts[0][2], parts[0][3], parts[0][4])); if (!best || s < best.s) best = { i, j, s };
      }
      return best;
    };
    const add = (kind, i, j, wi, hj, extra = {}) => { const [x, y] = cellC(i, j, wi, hj); const e = { kind, x, y, w: wi * c, d: hj * c, ...extra, cell: [i, j, wi, hj] }; out.push(e); return e; };
    // drives: a straight 26 ft drive from a lot (or truck court) to a front edge, through the lot's own span or alongside it
    const joins = new Set(); // paving already connected to the street
    const rayRect = (o, dir, r) => { let t0 = -Infinity, t1 = Infinity; for (const [k, lo, hi] of [[0, r.x - r.w / 2, r.x + r.w / 2], [1, r.y - r.d / 2, r.y + r.d / 2]]) {
      if (!dir[k]) { if (o[k] <= lo || o[k] >= hi) return Infinity; continue; } const a = (lo - o[k]) / dir[k], b = (hi - o[k]) / dir[k]; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); } return t1 > t0 && t1 > 0 ? Math.max(t0, 0) : Infinity; };
    const reach = (from, avoid) => {
      let best = null; const X = [from.x - from.w / 2, from.x + from.w / 2], Y = [from.y - from.d / 2, from.y + from.d / 2];
      for (const dir of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const h = dir[0] !== 0, span = h ? Y : X, mid = (span[0] + span[1]) / 2, half = (span[1] - span[0]) / 2, sg = dir[0] || dir[1];
        const face = h ? (sg < 0 ? X[0] : X[1]) : (sg < 0 ? Y[0] : Y[1]), back = h ? (sg < 0 ? X[1] : X[0]) : (sg < 0 ? Y[1] : Y[0]);
        const opts = (half >= DRIVE_W / 2 ? [-1, 0, 1].map(f => [mid + f * (half - DRIVE_W / 2), face, 0]) : []).concat([-1, 1].map(f => [mid + f * (half + DRIVE_W / 2 + 0.5), back, 40]));
        for (const [off, start, pen] of opts) {
          const o = h ? [face, off] : [off, face], t = Math.min(hitsFront(o, dir), ...[...joins].filter(j => j !== from).map(j => rayRect(o, dir, j))); if (!(t < 3000)) continue;
          const end = face + sg * (Math.max(t, 0) + 1), lo = Math.min(start, end), hi = Math.max(start, end);
          const dr = h ? { x: (lo + hi) / 2, y: off, w: hi - lo, d: DRIVE_W } : { x: off, y: (lo + hi) / 2, w: DRIVE_W, d: hi - lo };
          let inside = true; // both long sides stay on the lot, clear of the landscape buffer, until the street edge
          for (let a = start, last = false; inside && !last; a += sg * 12) {
            if ((end - a) * sg <= 12) { a = end - sg * 12; last = true; } // the last check sits 12 ft short of the street
            for (const s of [-1, 1]) { const q = h ? [a, off + s * DRIVE_W / 2] : [off + s * DRIVE_W / 2, a];
              if (!inRing(q, rr) || rr.some((p, k) => rules[k].role !== 'front' && segDist(q, p, rr[(k + 1) % rr.length]) < rules[k].pave - 0.5)) { inside = false; break; } }
          }
          if (!inside || out.concat(avoid).some(b => (b.kind === 'building' || b.kind === 'pond') && rectsOverlap(b, dr, 1))) continue;
          if (!best || hi - lo + pen < best.cost) best = { cost: hi - lo + pen, dr };
        }
      }
      return best?.dr;
    };
    const lane = (lot, why) => { const dr = reach(lot, []); if (dr) { const e = { kind: 'drive', ...dr }; out.push(e); markRect(e); joins.add(e); joins.add(lot); } else warn.push(why + ' has no straight drive to the street; add one by hand'); return dr; };
    // buildings (the first with its truck court): far from the street (variants 0, 2) or close to it (1), centred across the lot
    // apartments come in bars of up to ~300 ft unless the program says how many buildings
    const n = prog.buildings || (prog.use === 'multifamily' ? Math.min(12, Math.max(1, Math.ceil(F / (prog.depth * 300)))) : 1), each = F / n, bl = [], wantD = Math.min(prog.depth, Math.sqrt(each) * 1.6);
    const bScore = p => (variant === 1 ? -1 : 1) * toStreet(p) + Math.abs(across(p) - midA) * 0.35;
    let truck = null;
    for (let b = 0; b < n; b++) {
      let got = null;
      for (const k of [1, 0.85, 1.2, 0.7, 1.45, 0.55, 1.8, 0.45]) {
        const D = wantD * k, W = each / D; if (W < 20 || D < 20) continue;
        const wi = Math.ceil(W / c), hj = Math.ceil(D / c);
        const lc = Math.ceil((DRIVE_W + 2) / c);
        for (const [T, side] of b === 0 && prog.truck ? [U.truck || 130, 110, 90, 60].flatMap(T => [[T, -1], [T, 1]]).concat([[0, 0]]) : [[0, 0]]) {
          const tc = Math.ceil(T / c), tp = !T ? null : ax === 'y' ? [okP, 0, far > 0 ? hj : -tc, wi, tc] : [okP, far > 0 ? wi : -tc, 0, tc, hj];
          // a lane beside the building and its truck court, so trucks can get round to the street
          const lp = !T ? null : ax === 'y' ? [okP, side < 0 ? -lc : wi, Math.min(0, tp[2]), lc, hj + tc] : [okP, Math.min(0, tp[1]), side < 0 ? -lc : hj, wi + tc, lc];
          const at = place([[okB, 0, 0, wi, hj], ...(tp ? [tp, lp] : [])], bScore); if (!at) continue;
          got = add('building', at.i, at.j, wi, hj, { floors: prog.floors }); got.w = each / got.d; // exact floor area, centred in its cells
          if (tp) truck = add('truck', at.i + tp[1], at.j + tp[2], tp[3], tp[4]); else if (b === 0 && prog.truck) warn.push('no room for a truck court behind the building');
          break;
        }
        if (got) break;
      }
      if (!got) return null;
      bl.push(got); mark(...got.cell, Math.ceil(30 / c)); if (truck && b === 0) mark(...truck.cell, Math.ceil(30 / c));
    }
    used.fill(0); for (const b of bl) mark(...b.cell, Math.ceil(10 / c)); // then a 10 ft walk around each for the paving
    if (truck) { mark(...truck.cell); lane(truck, 'the truck court'); }
    const gfa = bl.reduce((s, e) => s + e.w * e.d * prog.floors, 0), need = required(prog, gfa);
    const bc = [bl.reduce((s, e) => s + e.x, 0) / bl.length, bl.reduce((s, e) => s + e.y, 0) / bl.length];
    // detention: what the program asks for (default 10% of lots over an acre), as far from the street as it fits
    const pct = prog.detentionPct ?? (site >= 43560 ? 10 : 0);
    if (pct > 0) {
      const A = site * pct / 100; let pond = null;
      for (let shrink = 1; shrink >= 0.5 && !pond; shrink -= 0.1) for (const k of [1, 0.75, 1.33, 0.5, 2, 0.35, 3]) {
        const h = Math.sqrt(A * shrink) * k, wi = Math.ceil(A * shrink / h / c), hj = Math.ceil(h / c);
        const at = place([[okP, 0, 0, wi, hj]], p => toStreet(p)); if (at) { pond = add('pond', at.i, at.j, wi, hj); if (shrink < 1) warn.push('detention is ' + Math.round(shrink * 100) + '% of what was asked'); break; }
      }
      if (pond) mark(...pond.cell); else warn.push('no room left for detention');
    }
    // parking modules: the strip that adds the most stalls, near the buildings, until the requirement is met
    let have = 0;
    for (let guard = 0; guard < 60 && have < need; guard++) {
      let best = null; const S = sumOf(okP);
      for (const [D, rows] of [[2 * STALL.d + STALL.aisle, 2], [STALL.d + STALL.aisle, 1]]) {
        const hj = Math.ceil(D / c);
        for (let j = 0; j + hj <= ny; j++) {
          let i = 0;
          while (i < nx) {
            if (!free(S, i, j, 1, hj)) { i++; continue; }
            let k = i; while (k < nx && free(S, k, j, 1, hj)) k++;
            let wi = k - i, i0 = i, per = Math.floor(wi * c / STALL.w) * rows;
            if (per >= 4) {
              const left = need - have; if (per > left * 1.1 + rows) { // trim to what's still needed, nearest the buildings
                wi = Math.min(wi, Math.ceil(Math.ceil(left / rows) * STALL.w / c)); per = Math.floor(wi * c / STALL.w) * rows;
                i0 = Math.max(i, Math.min(k - wi, Math.round((bc[0] - X0) / c - wi / 2)));
              }
              const p = cellC(i0, j, wi, hj), dist = Math.hypot(p[0] - bc[0], p[1] - bc[1]);
              const s = Math.min(per, need - have) * 10 + per * 0.5 - dist / 20 + (variant !== 1 && toStreet([p[0] - bc[0], p[1] - bc[1]]) > 0 ? 15 : 0) - (rows === 1 ? 8 : 0);
              if (!best || s > best.s) best = { s, i: i0, j, wi, hj, per };
            }
            i = k;
          }
        }
      }
      if (!best) break;
      const e = add('parking', best.i, best.j, best.wi, best.hj); mark(...e.cell); have += stalls(e).count;
    }
    // a drive for each group of parking that touches, nearest the street first
    const lots = out.filter(e => e.kind === 'parking'), reached = new Set(), touches = (a, b) => rectsOverlap({ ...a, w: a.w + 2, d: a.d + 2 }, b, 0);
    const spread = l => { if (reached.has(l)) return; reached.add(l); joins.add(l); lots.filter(o => touches(o, l)).forEach(spread); };
    for (const lot of lots.slice().sort((a, b) => toStreet([b.x, b.y]) - toStreet([a.x, a.y]))) {
      if (reached.has(lot)) continue;
      const via = [...joins].find(d => touches(d, lot)); // already on a drive or a connected lot
      if (!via) lane(lot, 'a parking area');
      spread(lot);
    }
    return { out, gfa, need, have, warn };
  }

  let res = null;
  if (prog.gfa) {
    res = run(prog.gfa / prog.floors);
    if (!res) { notes.push(Math.round(prog.gfa).toLocaleString('en-US') + ' sq ft doesn’t fit inside the setbacks; showing the largest that does.'); prog.gfa = null; }
  }
  if (!res) { // as much building as fits with its parking: binary search on the footprint
    let lo = 1000, hi = Math.max(1000, site * 0.7), best = null;
    for (let it = 0; it < 14 && hi - lo > Math.max(300, lo * 0.02); it++) {
      const F = (lo + hi) / 2, r = run(F);
      if (r && r.have >= r.need) { best = r; lo = F; } else hi = F;
    }
    res = best || run(lo);
  }
  if (!res) return { elements: [], notes: ['Nothing fits inside the setbacks on this lot.'], phi };
  if (res.have < res.need) notes.push('Parking is ' + (res.need - res.have) + ' spaces short; consider structured parking, a lower ratio or less building.');
  res.warn.forEach(w => notes.push(w[0].toUpperCase() + w.slice(1) + '.'));
  let k = 0;
  const elements = res.out.map(e => { const [x, y] = rot([e.x, e.y], phi); return { id: 'e' + (++k).toString(36) + Math.random().toString(36).slice(2, 6), kind: e.kind, x: +x.toFixed(2), y: +y.toFixed(2), d: +e.d.toFixed(2), w: e.kind === 'building' ? +(e.w * e.d / +e.d.toFixed(2)).toFixed(4) : +e.w.toFixed(2), rot: +(((phi % 360) + 360) % 360).toFixed(3), ...(e.floors ? { floors: e.floors } : {}) }; });
  return { elements, notes, phi, program: prog };
}
export const VARIANTS = ['Parking in front', 'Building at the street', 'Turned 90°'];

// ---------- map features ----------
export function planFeatures(plan, selected) {
  const F = frame(plan.origin), ll = r => r.map(F.toLL), poly = r => ({ type: 'Polygon', coordinates: [ll(r.concat([r[0]]))] }), feats = [], U = USES[normalizeProgram(plan.program).use];
  const ring = plan.ring || []; if (ring.length < 3) return { type: 'FeatureCollection', features: feats };
  feats.push({ type: 'Feature', properties: { k: 'lot' }, geometry: poly(ring) });
  const rules = edgeRules(ring, plan.front, plan.setbacks);
  feats.push({ type: 'Feature', properties: { k: 'setback' }, geometry: poly(insetRing(ring, rules.map(r => r.build))) });
  const f = plan.front ?? longestEdge(ring); feats.push({ type: 'Feature', properties: { k: 'front' }, geometry: { type: 'LineString', coordinates: ll([ring[f], ring[(f + 1) % ring.length]]) } });
  const bad = new Set(check(plan).filter(i => i.id && i.level === 'bad').map(i => i.id));
  for (const e of plan.elements || []) {
    const props = { k: e.kind, id: e.id, sel: e.id === selected ? 1 : 0, bad: bad.has(e.id) ? 1 : 0, h: e.kind === 'building' ? +((e.floors || 1) * U.floorH / FT).toFixed(1) : 0 };
    feats.push({ type: 'Feature', properties: props, geometry: poly(corners(e)) });
    if (e.kind === 'parking') for (const l of stallLines(e)) feats.push({ type: 'Feature', properties: { k: 'stall' }, geometry: { type: 'LineString', coordinates: ll(l) } });
    const lab = e.kind === 'building' ? Math.round(e.w * e.d * (e.floors || 1)).toLocaleString('en-US') + ' sf' + ((e.floors || 1) > 1 ? ' · ' + e.floors + ' fl' : '') : e.kind === 'parking' ? stalls(e).count + ' spaces' : e.kind === 'pond' ? (e.w * e.d / 43560).toFixed(2) + ' ac' : '';
    if (lab) feats.push({ type: 'Feature', properties: { k: 'label', t: lab, kind: e.kind }, geometry: { type: 'Point', coordinates: F.toLL([e.x, e.y]) } });
  }
  return { type: 'FeatureCollection', features: feats };
}

// ---------- DXF (AutoCAD R12 ASCII: opens in AutoCAD, CADCraft, LibreCAD, QCAD, BricsCAD) ----------
// Feet, origin at the plan origin (its lon/lat is written as a note on the drawing), north up.
const LAYERS = [['LOT', 7], ['SETBACK', 8], ['BUILDING', 1], ['PARKING', 3], ['STALLS', 9], ['DRIVE', 8], ['TRUCK', 6], ['POND', 5], ['LANDSCAPE', 82], ['TEXT', 2]];
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
  const layerOf = { building: 'BUILDING', parking: 'PARKING', drive: 'DRIVE', truck: 'TRUCK', pond: 'POND', green: 'LANDSCAPE' };
  const m = metrics(plan), th = Math.max(4, Math.min(20, Math.sqrt(m.siteSf || 1e4) / 40));
  for (const e of plan.elements || []) {
    pl(layerOf[e.kind] || 'LANDSCAPE', corners(e));
    if (e.kind === 'parking') { stallLines(e).forEach(l => line('STALLS', l)); text('TEXT', [e.x, e.y], th * 0.8, stalls(e).count + ' SPACES'); }
    if (e.kind === 'building') text('TEXT', [e.x, e.y], th, Math.round(e.w * e.d * (e.floors || 1)).toLocaleString('en-US') + ' SF' + ((e.floors || 1) > 1 ? ' (' + e.floors + ' FLOORS)' : ''));
    if (e.kind === 'pond') text('TEXT', [e.x, e.y], th * 0.8, 'DETENTION ' + (e.w * e.d / 43560).toFixed(2) + ' AC');
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
