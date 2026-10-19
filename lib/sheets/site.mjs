// Site and civil, landscape, and site-wide electrical / fire / telecom sheets of the plan set (lib/planset.mjs RENDERERS):
// C-001 existing conditions, C-102 dimension and paving, C-103 typical lots, C-201 grading and drainage, C-202 detention,
// C-301 utilities, C-401 erosion control, C-501 civil details, L-101 landscape plan, L-501 landscape details, E-101 site
// lighting, FP-101 fire access and hydrants, T-101 site fiber. Every plan sheet is drawn by code from the plan's geometry
// the way C-101 is (street at the bottom, true north shown), the site in grey with the sheet's own layer in colour, and
// a right-hand column of legend, tables and numbered notes. Grades, pipes, hydrants, lights and conduit are SCHEMATIC:
// placed by rules of thumb from the drives and buildings, and labelled as assumptions for the engineer to replace. The
// placements that more than one sheet shows (the drive network, hydrants, the storm sewer) are worked out once here, so
// C-301 and FP-101 show the same hydrants. No DOM, no network.
import * as S from '../siteplan.mjs';
import { streetDown, turned, northArrow, scaleBar } from '../sitesheet.mjs';
import { esc, f0, f1, PT, MAIN, side, engScale, viewTitle, table, notes, at, svg, line, rect, circle, path, poly, pline, dim, sym, LINES, lineAttr, legendSym, legendLine, n, ftIn } from '../sheetkit.mjs';

const RES = ['sfr', 'townhomes', 'duplex'];
const INK = '#1b1e1f', GREY = '#8d9290', PALE = '#c9ccca';
const FT = v => f1(v) + "'"; // a site dimension: decimal feet, as civil plans write them
const IN = v => v + '"';

// ---------- small geometry (plan feet) ----------
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const unit = (a, b) => { const L = dist(a, b) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
const plus = (p, u, s) => [p[0] + u[0] * s, p[1] + u[1] * s];
const left = u => [-u[1], u[0]];
function foot(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)), q = [a[0] + dx * t, a[1] + dy * t]; return { q, t, d: dist(p, q) }; }
// the nearest point on a polyline (closed: a ring) -> { p, d, i (segment), t }
function nearOn(p, pts, closed = false) {
  let best = { p: pts[0] || p, d: Infinity, i: 0, t: 0 }; const m = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < m; i++) { const f = foot(p, pts[i], pts[(i + 1) % pts.length]); if (f.d < best.d) best = { p: f.q, d: f.d, i, t: f.t }; }
  if (!Number.isFinite(best.d)) best.d = pts.length ? dist(p, pts[0]) : 0; return best;
}
const lenOf = (pts, closed = false) => { let s = 0; for (let i = 0; i + 1 < pts.length; i++) s += dist(pts[i], pts[i + 1]); return s + (closed && pts.length > 2 ? dist(pts[pts.length - 1], pts[0]) : 0); };
// points every `step` feet along a polyline, with the direction there and the distance along
function along(pts, step, { closed = false, start = step / 2 } = {}) {
  const P = closed ? pts.concat([pts[0]]) : pts, out = []; let s0 = 0, next = start;
  for (let i = 0; i + 1 < P.length; i++) { const L = dist(P[i], P[i + 1]); if (L < 1e-9) continue; while (next <= s0 + L + 1e-9) { out.push({ p: lerp(P[i], P[i + 1], (next - s0) / L), u: unit(P[i], P[i + 1]), s: next }); next += step; } s0 += L; }
  return out;
}
const pointAt = (pts, s) => { let s0 = 0; for (let i = 0; i + 1 < pts.length; i++) { const L = dist(pts[i], pts[i + 1]); if (s <= s0 + L || i + 2 === pts.length) return { p: lerp(pts[i], pts[i + 1], L ? Math.max(0, Math.min(1, (s - s0) / L)) : 0), u: unit(pts[i], pts[i + 1]) }; s0 += L; } return { p: pts[0], u: [1, 0] }; };
// Douglas-Peucker: a street drawn as a point every 12 ft becomes a few chords, so bends are real bends
function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice(); let k = 0, dm = 0; const a = pts[0], b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) { const d = foot(pts[i], a, b).d; if (d > dm) { dm = d; k = i; } }
  return dm > tol ? simplify(pts.slice(0, k + 1), tol).slice(0, -1).concat(simplify(pts.slice(k), tol)) : [a, b];
}
// a polyline moved d feet to its left (mitred, the mitre capped so a sharp bend can't throw a spike)
function offsetLine(pts, d) {
  if (!d || pts.length < 2) return pts.slice(); const N = i => left(unit(pts[i], pts[i + 1]));
  return pts.map((p, i) => { if (i === 0) return plus(p, N(0), d); if (i === pts.length - 1) return plus(p, N(i - 1), d);
    const a = N(i - 1), b = N(i), m = [a[0] + b[0], a[1] + b[1]], L = Math.hypot(...m) || 1, c = Math.max(0.5, (m[0] * a[0] + m[1] * a[1]) / L); return plus(p, [m[0] / L, m[1] / L], d / c); });
}
// the main axis of a cloud of points (a free-form entrance): its centre and direction
function axisOf(pts) {
  const c = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]; let xx = 0, yy = 0, xy = 0;
  for (const p of pts) { const dx = p[0] - c[0], dy = p[1] - c[1]; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
  const a = 0.5 * Math.atan2(2 * xy, xx - yy); return { c, u: [Math.cos(a), Math.sin(a)] };
}
const segX = (a, b, c, d) => { const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-9) return null; const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den; return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6 ? { t, u, p: [a[0] + r[0] * t, a[1] + r[1] * t] } : null; };
const bboxOf = pts => [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
const inside = (p, o) => o.length >= 3 && S.inRing(p, o);
// a building's wall point nearest p, and the outward direction there
function wallAt(o, p) { const q = nearOn(p, o, true), a = o[q.i], b = o[(q.i + 1) % o.length], u = unit(a, b), nn = S.signedArea(o) >= 0 ? [u[1], -u[0]] : [-u[1], u[0]]; return { p: q.p, out: nn, u }; }

// ---------- the plan, worked out once per plan ----------
// Everything is in the turned frame (street at the bottom), so the sheets draw it directly; bearings use the plan as is.
const memo = new WeakMap();
function geo(ctx) {
  const plan = ctx.plan, sig = (plan.elements || []).length + ':' + JSON.stringify((plan.ring || [])[0]) + ':' + (plan.elements || []).map(e => e.id || '').join('').length;
  let G = memo.get(plan); if (G && G.sig === sig) return G;
  const turn = streetDown(plan), T = turned(plan, turn), ring = T.ring || [], els = T.elements || [], prog = S.normalizeProgram(plan.program);
  const fi = plan.front != null && plan.front < ring.length ? plan.front : S.longestEdge(ring), useOf = e => S.USES[e.use] ? e.use : prog.use;
  const types = Array.isArray(ctx.types) ? ctx.types : [], typeOf = e => types.find(t => (t.elementIds || []).includes(e.id));
  const B = els.filter(e => e.kind === 'building').map(e => { const o = S.outline(e), use = useOf(e), t = typeOf(e); return { e, o, c: S.centroid(o), use, res: RES.includes(use), type: t, area: S.footArea(e), spr: t ? !!t.sprinklered : !RES.includes(use) && S.footArea(e) >= 12000 }; });
  const ponds = els.filter(e => e.kind === 'pond').map(e => ({ e, o: S.outline(e) })).sort((a, b) => S.ringArea(b.o) - S.ringArea(a.o));
  G = { sig, plan, ctx, turn, T, ring, els, fi, B, ponds, prog, lines: drivesOf(els), res: B.length > 0 && B.every(b => b.res), cache: {} };
  G.entry = entryOf(G);
  memo.set(plan, G); return G;
}
const lazy = (G, k, fn) => k in G.cache ? G.cache[k] : (G.cache[k] = fn());
const pavement = G => lazy(G, 'pave', () => S.pavement(G.T));
const details = G => lazy(G, 'det', () => S.details(G.T));
const accessible = G => lazy(G, 'ada', () => S.accessible(G.T));
const frontEdge = G => [G.ring[G.fi], G.ring[(G.fi + 1) % G.ring.length]];
const streetEdges = G => { const r = S.edgeRules(G.ring, G.fi, G.plan.setbacks, G.plan.streets); return G.ring.map((_, i) => i).filter(i => i === G.fi || i === G.entryEdge || r[i]?.street); };

// drive centrelines: a straight drive along its long side, a street along its path, a free-form entrance along its main
// axis, and the aisle between each pair of stall rows in a parking field. w: paved width (the note's when it says one).
function drivesOf(els) {
  const out = [];
  for (const e of els) {
    if (e.kind === 'drive' || e.kind === 'truck') {
      if (e.note === 'Drive-thru lane') continue;
      const wN = +((String(e.note || '').match(/(\d+(?:\.\d+)?)\s*ft/) || [])[1]) || 0;
      if (e.path?.length > 1) { const p = e.closed ? e.path.concat([e.path[0]]) : e.path; out.push({ e, pts: simplify(p, 1.5), w: e.width || wN || 26 }); continue; }
      let c, u, L, W;
      if (e.w > 0 && e.d > 0) { const al = e.w >= e.d; c = [e.x, e.y]; u = S.rotPt(al ? [1, 0] : [0, 1], e.rot || 0); L = Math.max(e.w, e.d); W = Math.min(e.w, e.d); }
      else { const o = S.shapeOf(e); if (o.length < 3) continue; const A = axisOf(o), pr = o.map(p => (p[0] - A.c[0]) * A.u[0] + (p[1] - A.c[1]) * A.u[1]), cr = o.map(p => (p[0] - A.c[0]) * -A.u[1] + (p[1] - A.c[1]) * A.u[0]);
        const a = Math.min(...pr), b = Math.max(...pr); c = plus(A.c, A.u, (a + b) / 2); u = A.u; L = b - a; W = Math.max(...cr) - Math.min(...cr); }
      W = e.kind === 'truck' ? W : wN && wN < W ? wN : W;
      if (L > 8) out.push({ e, pts: [plus(c, u, -L / 2), plus(c, u, L / 2)], w: W, truck: e.kind === 'truck' });
    }
    if (e.kind === 'parking' && !S.isFree(e) && !e.row) {
      const st = S.stalls(e), sw = e.sw || S.STALL.w, ai = e.sa || S.STALL.aisle, half = st.n * sw / 2;
      const put = (u, v) => { const q = S.rotPt(st.swap ? [v, -u] : [u, v], e.rot || 0); return [e.x + q[0], e.y + q[1]]; };
      for (let r = 0; r + 1 < st.rows.length; r += 2) { const v = (st.rows[r][1] + st.rows[r + 1][0]) / 2; if (half > 20) out.push({ e, pts: [put(-half, v), put(half, v)], w: ai, aisle: true }); }
    }
  }
  return out.filter(l => lenOf(l.pts) > 8);
}
// where the site meets the street: the end of an entrance drive nearest the boundary (the main entrance first), and
// the boundary edge it's on (the street the utilities and the construction entrance come from)
function entryOf(G) {
  const [a, b] = frontEdge(G); if (!a) return [0, 0];
  const ent = new Set(S.entrancesOf(G.els)), cand = G.lines.filter(l => ent.has(l.e)).flatMap(l => [l.pts[0], l.pts[l.pts.length - 1]].map(p => ({ p, l, d: nearOn(p, G.ring, true).d, main: l.e.name === 'Main entry' })));
  const best = cand.filter(c => c.d < 60).sort((x, y) => (y.main - x.main) || x.d - y.d)[0];
  G.entryLine = best?.l || null;
  const p = best ? best.p : plus(lerp(a, b, 0.5), S.outwardOf(G.ring, G.fi), -10); G.entryEdge = best ? nearOn(p, G.ring, true).i : G.fi;
  return p;
}
const entryEdge = G => [G.ring[G.entryEdge], G.ring[(G.entryEdge + 1) % G.ring.length]];

// ---------- the drive network: utilities, fire lanes and conduit run along it ----------
// lines offset sideways (each utility its own side of the drive), cut where they cross or where one ends against
// another, and joined into one graph; pieces left on their own are tied to the rest by the shortest straight link.
const OFFSETS = { storm: () => 0, fire: () => 0, water: l => l.w / 2 + 4, sewer: l => -(l.w / 2 - 5), fiber: l => -(l.w / 2 + 5), light: () => 0 };
function net(G, kind) { return lazy(G, 'net:' + kind, () => buildNet(G.lines.filter(l => kind !== 'fire' || l.w >= 20), OFFSETS[kind] || (() => 0), G.entry)); }
function buildNet(lines0, offOf, rootPt) {
  const L = lines0.map(l => ({ ...l, pts: offsetLine(l.pts, offOf(l)) })), cuts = L.map(() => []), extra = [], bb = L.map(l => bboxOf(l.pts));
  const near = (a, b, g) => !(bb[a][2] + g < bb[b][0] || bb[b][2] + g < bb[a][0] || bb[a][3] + g < bb[b][1] || bb[b][3] + g < bb[a][1]);
  L.forEach((A, a) => [A.pts[0], A.pts[A.pts.length - 1]].forEach(p => L.forEach((B, b) => {
    if (a === b || !near(a, b, 60)) return; const q = nearOn(p, B.pts); if (q.d < Math.max(A.w, B.w) / 2 + 12) { cuts[b].push({ i: q.i, t: q.t, p: q.p }); if (q.d > 0.01) extra.push([p, q.p]); }
  })));
  for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++) { if (!near(a, b, 1)) continue;
    for (let i = 0; i + 1 < L[a].pts.length; i++) for (let j = 0; j + 1 < L[b].pts.length; j++) { const x = segX(L[a].pts[i], L[a].pts[i + 1], L[b].pts[j], L[b].pts[j + 1]); if (x) { cuts[a].push({ i, t: x.t, p: x.p }); cuts[b].push({ i: j, t: x.u, p: x.p }); } } }
  const N = new Map(), key = p => p[0].toFixed(2) + ',' + p[1].toFixed(2), node = p => { const k = key(p); let v = N.get(k); if (!v) N.set(k, v = { id: N.size, p, adj: [] }); return v; };
  const link = (a, b) => { if (a === b || a.adj.some(x => x.v === b)) return; const d = dist(a.p, b.p); a.adj.push({ v: b, d }); b.adj.push({ v: a, d }); };
  L.forEach((A, a) => { const st = A.pts.map((p, i) => ({ i, t: 0, p })).concat(cuts[a]).sort((x, y) => x.i + x.t - y.i - y.t); for (let k = 1; k < st.length; k++) link(node(st[k - 1].p), node(st[k].p)); });
  extra.forEach(([p, q]) => link(node(p), node(q)));
  let nodes = [...N.values()];
  if (!nodes.length) { const r = node(rootPt); nodes = [r]; }
  // pieces that don't touch the rest: joined to the main piece (the one at the street) by the shortest link
  const comp = new Map(); let c = 0; for (const v of nodes) if (!comp.has(v)) { const st = [v]; comp.set(v, c); while (st.length) { const x = st.pop(); for (const { v: y } of x.adj) if (!comp.has(y)) { comp.set(y, c); st.push(y); } } c++; }
  const root = nodes.reduce((m, v) => dist(v.p, rootPt) < dist(m.p, rootPt) ? v : m, nodes[0]), main = new Set([comp.get(root)]);
  for (let guard = 0; guard < c; guard++) {
    let best = null; for (const v of nodes) if (!main.has(comp.get(v))) for (const w of nodes) if (main.has(comp.get(w))) { const d = dist(v.p, w.p); if (!best || d < best.d) best = { v, w, d }; }
    if (!best) break; link(best.v, best.w); main.add(comp.get(best.v));
  }
  const edges = []; for (const v of nodes) for (const { v: w } of v.adj) if (v.id < w.id) edges.push([v, w]);
  return { nodes, edges, root, lines: L };
}
// shortest distances from a node (Dijkstra; graphs here have hundreds of nodes)
function dijkstra(N, src) {
  const d = new Map([[src, 0]]), prev = new Map(), done = new Set(), Q = [src];
  while (Q.length) { let bi = 0; for (let i = 1; i < Q.length; i++) if (d.get(Q[i]) < d.get(Q[bi])) bi = i; const v = Q.splice(bi, 1)[0]; if (done.has(v)) continue; done.add(v);
    for (const { v: w, d: e } of v.adj) { const nd = d.get(v) + e; if (!d.has(w) || nd < d.get(w)) { d.set(w, nd); prev.set(w, v); Q.push(w); } } }
  return { d, prev };
}
// the nearest point on the network to p: { q, a, b, d }
function tapOf(N, p) { let best = { q: N.root.p, a: N.root, b: N.root, d: dist(p, N.root.p) }; for (const [a, b] of N.edges) { const f = foot(p, a.p, b.p); if (f.d < best.d) best = { q: f.q, a, b, d: f.d }; } return best; }
// routes from taps back to the root, merged into a tree: its segments, and how much each carries (load per tap)
function treeOf(N, taps, root = N.root) {
  const D = dijkstra(N, root), segs = new Map(), skey = (a, b) => a.id < b.id ? a.id + '-' + b.id : b.id + '-' + a.id, deg = new Map(), bump = v => deg.set(v, (deg.get(v) || 0) + 1);
  const extra = [];
  for (const t of taps) {
    const da = (D.d.get(t.a) ?? Infinity) + dist(t.q, t.a.p), db = (D.d.get(t.b) ?? Infinity) + dist(t.q, t.b.p), s = da <= db ? t.a : t.b;
    if (dist(t.q, s.p) > 0.5) extra.push({ a: t.q, b: s.p, load: t.load || 0 });
    let v = s; for (let guard = 0; v !== root && D.prev.has(v) && guard < 5000; guard++) { const w = D.prev.get(v), k = skey(v, w); const g = segs.get(k) || segs.set(k, { a: v, b: w, load: 0 }).get(k); g.load += t.load || 0; v = w; }
  }
  for (const g of segs.values()) { bump(g.a); bump(g.b); }
  return { segs: [...segs.values()].map(g => ({ a: g.a.p, b: g.b.p, load: g.load, A: g.a, B: g.b })).concat(extra), deg };
}
// structures on a pipe or conduit tree: at junctions, at bends sharper than 30°, and along runs at least every `every` feet
function structuresOn(tree, every = 400) {
  const out = [], adj = new Map(); for (const s of tree.segs) if (s.A && s.B) { (adj.get(s.A) || adj.set(s.A, []).get(s.A)).push(s.B); (adj.get(s.B) || adj.set(s.B, []).get(s.B)).push(s.A); }
  for (const [v, ws] of adj) { if (ws.length >= 3) { out.push(v.p); continue; } if (ws.length === 2) { const a = unit(ws[0].p, v.p), b = unit(v.p, ws[1].p); if (a[0] * b[0] + a[1] * b[1] < Math.cos(Math.PI / 6)) out.push(v.p); } }
  for (const s of tree.segs) { const L = dist(s.a, s.b), k = Math.floor(L / every); for (let i = 1; i <= k; i++) out.push(lerp(s.a, s.b, i / (k + 1))); }
  return out.filter((p, i) => !out.slice(0, i).some(q => dist(p, q) < 30));
}

// ---------- shared placements ----------
// fire department connections: on each sprinklered building's wall nearest a fire lane, with the riser beside it
function fdcs(G) {
  return lazy(G, 'fdc', () => { const F = net(G, 'fire');
    return G.B.filter(b => b.spr).map(b => { const t = tapOf(F, b.c), w = wallAt(b.o, t.q); return { b, p: plus(w.p, w.out, 6), wall: w.p, riser: plus(w.p, w.u, 14), out: w.out, lane: t.q }; }); });
}
// Hydrants (C-301 and FP-101 show the same ones): one within 100 ft of every FDC first, then as few as cover every point
// of every building within 300 ft (400 ft for homes) in a straight line (about a 400 to 500 ft hose lay) and every
// point of the water main within 225 ft, so hydrants along a main are never more than about 500 ft apart.
function hydrants(G) {
  return lazy(G, 'hyd', () => {
    const W = net(G, 'water'), cand = [], tgt = [];
    for (const [a, b] of W.edges) { const L = dist(a.p, b.p); for (let s = 0; s <= L; s += 25) cand.push(lerp(a.p, b.p, L ? s / L : 0)); }
    if (!cand.length) cand.push(W.root.p);
    for (const p of cand) tgt.push({ p, r: 225 });
    for (const b of G.B) { const r = b.res ? 400 : 300; for (const s of along(b.o, 40, { closed: true, start: 0 })) tgt.push({ p: s.p, r }); }
    const H = [], cov = new Array(tgt.length).fill(false), mark = h => tgt.forEach((t, i) => { if (!cov[i] && dist(t.p, h) <= t.r) cov[i] = true; });
    for (const f of fdcs(G)) { if (H.some(h => dist(h, f.p) <= 100)) continue; const h = cand.reduce((m, p) => dist(p, f.p) < dist(m, f.p) ? p : m, cand[0]); H.push(h); mark(h); }
    const lists = cand.map(p => { const l = []; tgt.forEach((t, i) => { if (dist(t.p, p) <= t.r) l.push(i); }); return l; });
    for (let guard = 0; guard < 400; guard++) {
      let bi = -1, bc = 0; lists.forEach((l, i) => { let c = 0; for (const k of l) if (!cov[k]) c++; if (c > bc) { bc = c; bi = i; } });
      if (bi < 0) break; H.push(cand[bi]); for (const k of lists[bi]) cov[k] = true;
    }
    return H;
  });
}
// the grading model: an assumed surface falling about 0.6% toward the pond's bank (or the street) from an assumed datum
function gradeModel(G) {
  return lazy(G, 'grade', () => {
    const pond = G.ponds[0] || null, [a, b] = frontEdge(G), s = 0.006, Z0 = 100, depth = Math.max(2, +G.plan.params?.storm?.depth || S.STORM.depth);
    const dTo = pond ? p => (inside(p, pond.o) ? 0 : nearOn(p, pond.o, true).d) : p => foot(p, a, b).d;
    const wet = !!pond && /wet|lake|amenity|pond\b/i.test((pond.e.note || '') + ' ' + (pond.e.name || '')) && !/dry/i.test(pond.e.note || '');
    return { pond, s, Z0, depth, wet, z: p => Z0 + s * dTo(p), hwl: Z0 - 1, bottom: Z0 - depth };
  });
}
// pipe size from the acres a run drains (Rational method, C 0.8, i 6 in/hr, RCP at 0.30%): schematic only
const PIPES = [[1.25, 18], [2.7, 24], [4.8, 30], [8, 36], [12, 42], [17, 48], [23, 54], [31, 60]];
const pipeSize = ac => (PIPES.find(([a]) => ac <= a) || [0, 66])[1];
// the storm sewer: inlets along every drive at its low point and about every 275 ft from there, piped along the drives
// to the pond (or to the street), sized by the area each run drains, manholes at junctions, bends and every 400 ft
function stormModel(G) {
  return lazy(G, 'storm', () => {
    const M = gradeModel(G), N = net(G, 'storm'), inlets = [];
    for (const l of G.lines) {
      const L = lenOf(l.pts); if (L < 40) continue; const sm = along(l.pts, 5, { start: 0 }); if (!sm.length) continue;
      const lo = sm.reduce((m, q) => M.z(q.p) < M.z(m.p) ? q : m, sm[0]).s, at = []; for (let s = lo; s <= L - 15; s += 275) at.push(s); for (let s = lo - 275; s >= 15; s -= 275) at.push(s);
      for (const s of at) { const q = pointAt(l.pts, s), c = plus(q.p, left(q.u), Math.max(0, l.w / 2 - 1.5)); if (!inlets.some(i => dist(i.p, q.p) < 70)) inlets.push({ p: q.p, curb: c, u: q.u }); }
    }
    const devAc = Math.max(0.1, S.stormOf(G.plan).acres || G.ctx.m?.acres || 1), per = devAc / Math.max(1, inlets.length);
    const taps = inlets.map(i => ({ ...tapOf(N, i.p), load: per })), [fa0, fb0] = frontEdge(G), lowOf = M.pond ? p => nearOn(p, M.pond.o, true).d : p => foot(p, fa0, fb0).d;
    const root = N.nodes.reduce((m, v) => lowOf(v.p) < lowOf(m.p) ? v : m, N.nodes[0]), tree = treeOf(N, taps, root), mh = structuresOn(tree, 400).filter(p => !inlets.some(i => dist(i.p, p) < 25));
    let outfall, outlet = null; const [fa, fb] = frontEdge(G);
    // the pond's outlet discharges at the nearest property line (to a ditch or storm sewer there, to be confirmed), so the
    // pipe never crosses the site
    if (M.pond) { outfall = nearOn(root.p, M.pond.o, true).p; let best = null; for (const p of M.pond.o) { const r = nearOn(p, G.ring, true); if (!best || r.d < best.d) best = { p, r }; }
      outlet = { at: best.p, to: plus(best.r.p, S.outwardOf(G.ring, best.r.i), 12) }; }
    else { const f = foot(root.p, fa, fb); outfall = plus(f.q, S.outwardOf(G.ring, G.fi), 12); }
    return { inlets, tree, mh, outfall, outlet, root: root.p, per, devAc };
  });
}


// textures drawn as plain lines and dots clipped to the shape (screen px): an SVG pattern fill prints to the PDF as a
// large image, so a sheet with a few hatched areas would weigh megabytes
let UID = 0; const uid = p => p + (++UID).toString(36);
const rnd = (x, y) => Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
const dPx = pts => pts.map((p, i) => (i ? 'L' : 'M') + n(p[0]) + ' ' + n(p[1])).join('') + 'Z';
const rectPts = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const ellPts = (cx, cy, rx, ry) => Array.from({ length: 24 }, (_, i) => [cx + rx * Math.cos(i * Math.PI / 12), cy + ry * Math.sin(i * Math.PI / 12)]);
const dot = (x, y, r) => 'M' + n(x - r) + ' ' + n(y) + 'a' + n(r) + ' ' + n(r) + ' 0 1 0 ' + n(2 * r) + ' 0a' + n(r) + ' ' + n(r) + ' 0 1 0 ' + n(-2 * r) + ' 0';
const TEX = { hatch: '#6b7174', hatch2: '#2f6db5', earth: '#8a6d4a', conc: '#7d8280', gravel: '#6b7174', brick: '#8a8f8c', domes: '#8a6d1f', mesh: '#e07b24' };
const TEXBASE = { conc: '#f7f7f5', gravel: '#f1f0ec', brick: '#d9d4ca', domes: '#f2e2a8' };
function texture(kind, pts, col) {
  const [x0, y0, x1, y1] = bboxOf(pts), id = uid('t'), d = [], h = y1 - y0, area = (x1 - x0) * h; let fillDots = false;
  if (kind === 'hatch' || kind === 'hatch2' || kind === 'earth') { const gap = kind === 'hatch2' ? 6 : kind === 'earth' ? 10 : 7; for (let x = x0 - h; x < x1; x += gap) d.push('M' + n(x) + ' ' + n(y1) + 'L' + n(x + h) + ' ' + n(y0)); if (kind === 'earth') for (let x = x0 - h + 5; x < x1; x += 20) d.push('M' + n(x) + ' ' + n(y0) + 'L' + n(x + h) + ' ' + n(y1)); }
  else if (kind === 'mesh') { for (let x = x0 - h; x < x1; x += 8) d.push('M' + n(x) + ' ' + n(y1) + 'L' + n(x + h) + ' ' + n(y0) + 'M' + n(x) + ' ' + n(y0) + 'L' + n(x + h) + ' ' + n(y1)); }
  else if (kind === 'brick') { for (let y = y0, r = 0; y < y1; y += 8, r++) { d.push('M' + n(x0) + ' ' + n(y) + 'H' + n(x1)); for (let x = x0 + (r % 2) * 8; x < x1; x += 16) d.push('M' + n(x) + ' ' + n(y) + 'V' + n(Math.min(y1, y + 8))); } }
  else { const step = kind === 'domes' ? 10 : kind === 'gravel' ? 13 : Math.max(13, Math.sqrt(area / 1500)); fillDots = kind !== 'gravel'; let i = 0;
    for (let y = y0 + step / 2; y < y1; y += step, i++) for (let x = x0 + step / 2 + (kind === 'domes' ? 0 : (i % 2) * step / 2); x < x1; x += step) { const r = rnd(x, y), q = kind === 'domes' ? 0 : 2.5;
      d.push(dot(x + (r - 0.5) * q * 2, y + (0.5 - r) * q, kind === 'domes' ? 2.4 : kind === 'gravel' ? 1.3 + r * 1.3 : 0.55 + r * 0.5)); } }
  return '<clipPath id="' + id + '"><path d="' + dPx(pts) + '"/></clipPath><path clip-path="url(#' + id + ')" d="' + d.join('') + '" ' + (fillDots ? 'fill="' + (col || TEX[kind]) + '" stroke="none"' : 'fill="none" stroke="' + (col || TEX[kind]) + '" stroke-width="' + (kind === 'gravel' ? .7 : .6) + '"') + '/>';
}
// a polygon whose attributes may ask for a pattern (fill="url(#hatch)"): base fill, texture, then its outline
function filled(pts, a = '') {
  const m = a.match(/fill="url\(#(\w+)\)"/); if (!m || !TEX[m[1] === 'gravelS' ? 'gravel' : m[1]]) return poly(pts, a); const k = m[1] === 'gravelS' ? 'gravel' : m[1];
  const sc = (a.match(/stroke="(#[0-9a-fA-F]{3,6})"/) || [])[1], line0 = a.replace(m[0], 'fill="none"').replace(/(fill-)?opacity="[^"]*"/g, '');
  return poly(pts, 'fill="' + (TEXBASE[k] || 'none') + '" stroke="none"') + texture(k, pts, k === 'hatch' && sc && sc !== '#1b1e1f' ? sc : null) + (/stroke="none"/.test(line0) || !/stroke=/.test(line0) ? '' : poly(pts, line0));
}

// ---------- drawing ----------
// the view: the turned site fitted at the largest standard engineering scale into the drawing area (pad: feet round it)
function view(G, pad = 60, wIn = MAIN.w / PT, hIn = (MAIN.h - 64) / PT) {
  const r = G.ring.length >= 3 ? G.ring : [[0, 0], [100, 0], [100, 100]], [x0, y0, x1, y1] = bboxOf(r), sc = engScale(x1 - x0 + 2 * pad, y1 - y0 + 2 * pad, wIn, hIn), k = sc.k;
  const bx = [x0 - pad, y0 - pad, x1 + pad, y1 + pad], X = p => [(p[0] - bx[0]) * k, (bx[3] - p[1]) * k];
  return { k, sc, X, W: (bx[2] - bx[0]) * k, H: (bx[3] - bx[1]) * k, turn: G.turn, P: pts => pts.map(X) };
}
const dOf = (V, pts, close = true) => pts.map((p, i) => { const q = V.X(p); return (i ? 'L' : 'M') + n(q[0]) + ' ' + n(q[1]); }).join('') + (close ? 'Z' : '');
const segsPath = (V, segs, a) => segs.length ? path(segs.map(s => { const p = V.X(s.a), q = V.X(s.b); return 'M' + n(p[0]) + ' ' + n(p[1]) + 'L' + n(q[0]) + ' ' + n(q[1]); }).join(''), a) : '';
const lineFt = (V, pts, a) => pline(V.P(pts), a);
const angOf = u => { let a = Math.atan2(-u[1], u[0]) * 180 / Math.PI; if (a > 90.5) a -= 180; if (a < -89.5) a += 180; return a; };
// text with a white halo; o: { rot, anchor, bold, fill, italic }
function T(x, y, s, size = 8, o = {}) {
  return '<text x="' + n(x) + '" y="' + n(y) + '" font-size="' + n(size) + '" font-family="Arial, Helvetica, sans-serif" text-anchor="' + (o.anchor || 'middle') + '" dominant-baseline="central" fill="' + (o.fill || INK) + '"' + (o.bold ? ' font-weight="700"' : '') + (o.italic ? ' font-style="italic"' : '') +
    (o.halo === false ? '' : ' paint-order="stroke" stroke="#fff" stroke-width="' + n(o.haloW || 2.6) + '" stroke-linejoin="round"') + (o.rot ? ' transform="rotate(' + n(o.rot) + ' ' + n(x) + ' ' + n(y) + ')"' : '') + (o.ls ? ' letter-spacing="' + o.ls + '"' : '') + '>' + esc(s) + '</text>';
}
const tw = (s, size) => String(s).length * size * 0.56;
// a label placer: a label is drawn only where it overlaps no label already placed (biggest and most important first)
function placer() {
  const B = [], hit = b => B.some(q => b[0] < q[2] && q[0] < b[2] && b[1] < q[3] && q[1] < b[3]);
  const boxOf = (x, y, s, size, rot = 0, anchor = 'middle') => { const w = tw(s, size) + 4, h = size * 1.3, x0 = anchor === 'start' ? 0 : anchor === 'end' ? -w : -w / 2, a = rot * Math.PI / 180, c = Math.cos(a), si = Math.sin(a);
    const P = [[x0, -h / 2], [x0 + w, -h / 2], [x0 + w, h / 2], [x0, h / 2]].map(([u, v]) => [x + u * c - v * si, y + u * si + v * c]); return bboxOf(P); };
  return { hit, add: b => B.push(b), box: boxOf, put(x, y, s, size, o = {}) { const b = boxOf(x, y, s, size, o.rot, o.anchor); if (!o.force && hit(b)) return ''; B.push(b); return T(x, y, s, size, o); } };
}
// an arrow of len px centred on screen point c pointing along plan direction u
const arrow = (c, u, len, a = 'stroke="#2f6db5" stroke-width="1"') => { const d = [u[0], -u[1]]; return line(c[0] - d[0] * len / 2, c[1] - d[1] * len / 2, c[0] + d[0] * len / 2, c[1] + d[1] * len / 2, a + ' marker-end="url(#arr)"'); };
// the site in grey: lawn, paving with its curb line, walks, lots, ponds, easements, buildings and the property line
function ground(G, V, o = {}) {
  const out = [], P = V.P;
  if (o.lawn) out.push(poly(P(G.ring), 'fill="' + o.lawn + '" stroke="none"'));
  if (o.paving !== false) for (const pv of pavement(G)) out.push(path(dOf(V, pv.outer) + pv.holes.map(h => dOf(V, h)).join(''), 'fill="' + (o.pave || '#f0f0ee') + '" fill-rule="evenodd" stroke="' + (o.curb || '#9fa3a1') + '" stroke-width="' + (o.curbW || 0.8) + '"'));
  if (o.paving !== false) for (const e of G.els) if (e.kind === 'plaza' || e.kind === 'patio') out.push(poly(P(S.shapeOf(e)), 'fill="#f6f6f4" stroke="#b5b8b6" stroke-width=".5"'));
  if (o.walks) for (const w of details(G).walks) out.push(poly(P(w.poly || S.corners(w)), 'fill="#fafaf8" stroke="#c2c5c3" stroke-width=".5"'));
  if (o.lots !== false) for (const e of G.els) if (e.kind === 'lot') out.push(poly(P(S.outline(e)), 'fill="none" stroke="#c4c7c5" stroke-width=".6"')); // (solid: dashes print to PDF as thousands of pieces)
  if (o.ponds !== false) for (const p of G.ponds) out.push(poly(P(p.o), 'fill="' + (o.pondFill || '#eef3f7') + '" stroke="#9db3c4" stroke-width=".9"'));
  for (const e of G.els) if (e.kind === 'keepout') out.push(filled(P(S.outline(e)), 'fill="url(#hatch)" stroke="#9b3b32" stroke-width="1" stroke-dasharray="6 3"'));
  if (o.buildings !== false) for (const b of G.B) out.push(poly(P(b.o), o.bAttr || 'fill="#e6e6e3" stroke="#6b7174" stroke-width="1"'));
  out.push(poly(P(G.ring), lineAttr('property')));
  return out.join('');
}
// building names inside their footprints where they fit
function bLabels(G, V, L, o = {}) {
  return G.B.map(b => { const nm = (b.e.name || '').toUpperCase(), c = V.X(b.c), w = Math.min(b.e.w, b.e.d) * V.k; if (!nm || (G.B.length > 30 && !o.all)) return '';
    const size = Math.max(6, Math.min(10, w / 4)); return L.put(c[0], c[1] - (o.sub ? size * 0.6 : 0), nm, size, { bold: true }) + (o.sub ? L.put(c[0], c[1] + size * 0.7, o.sub(b), size * 0.85) : ''); }).join('');
}
// the sheet: drawing centred in the main area, north arrow, view title with scale bar, the right-hand column
function planPage(sh, V, body, sideHtml, title, sub = '') {
  sh.scale = V.sc.label;
  return at(MAIN.x, MAIN.y, MAIN.w, MAIN.h - 64, svg(V.W, V.H, body), 'display:flex;align-items:center;justify-content:center') +
    at(MAIN.x, MAIN.y, 90, 90, northArrow(V.turn, 72)) +
    at(MAIN.x, MAIN.y + MAIN.h - 52, MAIN.w, 52, '<div style="display:flex;align-items:center;gap:28pt;height:100%">' + viewTitle(1, title, V.sc.label + ' on 24" × 36"' + (sub ? ' · ' + sub : '')) + scaleBar(V.sc.ft) + '</div>') +
    side(sideHtml);
}
const blk = (title, html) => '<div class="blk"><div class="bh">' + esc(title) + '</div>' + html + '</div>';
const tbl = (title, head, rows, right = []) => '<div class="blk">' + table(title, head, rows, right) + '</div>';
const sw = (attrs, label, shape = 'rect') => '<div class="lg2">' + svg(26, 16, shape === 'circle' ? circle(13, 8, 6.5, attrs) : filled(rectPts(2, 2, 22, 12), attrs)) + '<span>' + esc(label) + '</span></div>';
const legendHtml = rows => blk('Legend', '<div style="columns:2;column-gap:12pt">' + rows.join('') + '</div>');
const warn = s => '<div class="blk"><div class="warnbox"><b>SCHEMATIC.</b> ' + esc(s) + '</div></div>';
// the discipline's own notes and criteria (written by Claude for the set, when it was asked)
function discBlocks(ctx, k, label, criteria = false) {
  const d = ctx.disc?.[k] || {}, nn = (Array.isArray(d.notes) ? d.notes : []).filter(x => typeof x === 'string' && x.trim()).slice(0, 12);
  const cr = criteria && Array.isArray(d.criteria) ? d.criteria.filter(c => c && c.item).slice(0, 14).map(c => [String(c.item), String(c.value ?? '')]) : [];
  return (cr.length ? tbl(label + ' design criteria', null, cr) : '') + notes(label + ' notes', nn);
}
const factsLike = (ctx, re) => (ctx.facts || []).filter(f => re.test(f));
const ac = sf => (sf / 43560).toFixed(2);

// ---------- C-001 existing conditions ----------
// a course's bearing from plan feet (x east, y north): quadrant bearing to the second
export function bearing(a, b) {
  const az = ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI) + 360) % 360, [ns, ew, ang] = az <= 90 ? ['N', 'E', az] : az <= 180 ? ['S', 'E', 180 - az] : az <= 270 ? ['S', 'W', az - 180] : ['N', 'W', 360 - az];
  const s = Math.round(ang * 3600), d = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60, pad = v => String(v).padStart(2, '0');
  return ns + ' ' + pad(d) + '°' + pad(m) + "'" + pad(sec) + '" ' + ew;
}
function existing(ctx, sh) {
  const G = geo(ctx), V = view(G, 95), P = V.P, X = V.X, ring = G.ring, ring0 = ctx.plan.ring || [], nR = ring.length, L = placer(), o = [];
  const street = (String(ctx.address || '').replace(/^\s*[\d-]+[A-Z]?\s+/i, '').split(',')[0] || '').trim();
  // adjoining streets: a band beyond each frontage (the right-of-way's real width isn't known)
  for (const i of streetEdges(G)) {
    const a = ring[i], b = ring[(i + 1) % nR], nn = S.outwardOf(ring, i), u = unit(a, b), A = plus(a, u, -40), B = plus(b, u, 40);
    o.push(poly(P([A, B, plus(B, nn, 85), plus(A, nn, 85)]), 'fill="#f4f4f2" stroke="none"'), poly(P([plus(A, nn, 20), plus(B, nn, 20), plus(B, nn, 50), plus(A, nn, 50)]), 'fill="#e0e1df" stroke="#b5b8b6" stroke-width=".6"'));
    o.push(lineFt(V, [plus(A, nn, 35), plus(B, nn, 35)], 'fill="none" stroke="#fff" stroke-width="1.2" stroke-dasharray="14 10"'));
    const m = X(plus(lerp(a, b, 0.5), nn, 68));
    o.push(L.put(m[0], m[1], (i === G.fi && street ? street.toUpperCase() + ' — ' : '') + 'PUBLIC RIGHT-OF-WAY (WIDTH VARIES, NOT VERIFIED)', 10, { rot: angOf(u), bold: true, ls: '.05em', force: true }));
    const m2 = X(plus(lerp(a, b, 0.5), nn, 35)); o.push(T(m2[0], m2[1], 'EXISTING PAVEMENT (APPROX.)', 7, { rot: angOf(u), fill: '#6b7174', halo: false }));
  }
  const c = X(S.centroid(ring)), bw = Math.max(...P(ring).map(p => p[0])) - Math.min(...P(ring).map(p => p[0]));
  o.push(T(c[0], c[1] - 14, 'TOPOGRAPHY NOT SURVEYED', Math.max(12, Math.min(30, bw / 16)), { fill: '#c9ccca', bold: true, halo: false, ls: '.08em' }), T(c[0], c[1] + 16, 'Existing improvements, trees and utilities not located', Math.max(9, Math.min(15, bw / 32)), { fill: '#a7aba9', halo: false }));
  for (const e of G.els) if (e.kind === 'keepout') { const q = S.outline(e), m = X(S.centroid(q)); o.push(filled(P(q), 'fill="url(#hatch)" stroke="#9b3b32" stroke-width="1.2" stroke-dasharray="6 3"'), L.put(m[0], m[1], (e.name || 'EASEMENT / NO-BUILD').toUpperCase() + ' (DRAWN, NOT SURVEYED)', 8, { bold: true, fill: '#9b3b32' })); }
  o.push(poly(P(ring), lineAttr('property', 1.3)));
  // the courses from the point of beginning (the frontage's first corner), each edge labelled outside with its bearing
  // and inside with its length; an edge too short for the words gets its course number
  const courses = [];
  for (let j = 0; j < nR; j++) {
    const i = (G.fi + j) % nR, a0 = ring0[i], b0 = ring0[(i + 1) % nR], br = bearing(a0, b0), Lf = dist(a0, b0), a = X(ring[i]), b = X(ring[(i + 1) % nR]);
    courses.push(['C' + (j + 1), br, Lf.toFixed(2) + "'"]);
    const nn = S.outwardOf(ring, i), sn = [nn[0], -nn[1]], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], rot = angOf(unit(ring[i], ring[(i + 1) % nR])), sl = dist(a, b);
    if (sl > tw(br, 9) + 24) { o.push(L.put(mid[0] + sn[0] * 11, mid[1] + sn[1] * 11, br, 9, { rot, bold: true, force: true }), L.put(mid[0] - sn[0] * 11, mid[1] - sn[1] * 11, Lf.toFixed(2) + "'", 9, { rot, force: true })); }
    else o.push(L.put(mid[0] + sn[0] * 11, mid[1] + sn[1] * 11, 'C' + (j + 1), 8, { bold: true, force: true }));
  }
  for (const p of P(ring)) o.push(circle(p[0], p[1], 3, 'fill="#fff" stroke="' + INK + '" stroke-width="1"'));
  const pob = X(ring[G.fi]), out = S.outwardOf(ring, G.fi), dv = unit([0, 0], [out[0] - 0.6, -out[1] + 0.6]);
  o.push(circle(pob[0], pob[1], 6, 'fill="none" stroke="#c0392b" stroke-width="1.6"'), line(pob[0], pob[1], pob[0] + dv[0] * 46, pob[1] + dv[1] * 46, 'stroke="' + INK + '" stroke-width=".8"'), T(pob[0] + dv[0] * 52, pob[1] + dv[1] * 52, 'P.O.B. (COURSE C1)', 9, { bold: true, anchor: dv[0] < 0 ? 'end' : 'start' }));
  const area = S.ringArea(ring0), flood = factsLike(ctx, /flood|fema|\bfirm\b/i), other = (ctx.facts || []).filter(f => !flood.includes(f)).concat(ctx.notes || []).slice(0, 8);
  const parcels = (ctx.parcels || []).slice(0, 14).map(p => [p.label || '—', p.owner || '—', p.acres ? (+p.acres).toFixed(2) : '—']);
  const sideHtml = legendHtml([legendLine('property'), sw('fill="#e0e1df" stroke="#b5b8b6"', 'Adjoining street (approx.)'), sw('fill="url(#hatch)" stroke="#9b3b32" stroke-dasharray="4 2"', 'Easement / no-build (drawn)'),
      '<div class="lg2">' + svg(26, 16, circle(13, 8, 3, 'fill="#fff" stroke="#1b1e1f"')) + '<span>Property corner (not set or found)</span></div>', '<div class="lg2">' + svg(26, 16, circle(13, 8, 6, 'fill="none" stroke="#c0392b" stroke-width="1.6"')) + '<span>Point of beginning</span></div>']) +
    tbl('Boundary courses (from GIS, not surveyed)', ['Course', 'Bearing', 'Distance'], courses, [2]) +
    tbl('Site area', null, [['Gross area within the boundary', f0(area) + ' sf'], ['', ac(area) + ' acres'], ['Perimeter', f1(lenOf(ring0, true)) + ' ft']], [1]) +
    (parcels.length ? tbl('Parcels', ['Parcel', 'Owner of record', 'Acres'], parcels, [2]) : '') +
    blk('Flood zone', '<p>' + esc(flood.length ? flood.join(' ') : 'FEMA flood zone not determined here: check the effective FIRM panel before design.') + ' Confirm with the FIRM panel and, where the site is near a floodplain, an elevation certificate.</p>') +
    (other.length ? notes('Site facts (due diligence)', other, false) : '') +
    notes('Notes', ['Boundary from ' + (ctx.boundarySource || 'the county appraisal district parcel outline') + '; it is not a survey. Bearings and distances are computed from that outline (grid north) and will change with the survey.',
      'Topography: not surveyed; a boundary and topographic survey by a Texas RPLS is required (1 ft contours, spot elevations, trees 6 in and larger, improvements and visible utilities).',
      'Easements, rights-of-way and encumbrances were not researched; a title commitment is required. Easements shown were drawn on the plan, not surveyed.',
      'Existing utilities were not located. Call Texas 811 before any digging; private utilities need a separate locate.',
      'Right-of-way widths are not verified; dedication or widening may be required by the county or TxDOT.',
      'No proposed improvements are shown on this sheet; see C-101.']) +
    discBlocks(ctx, 'civil', 'Civil') + warn('Drawn by code from the parcel outline; not a survey and not for platting or recording.');
  return planPage(sh, V, o.join(''), sideHtml, 'Existing conditions', 'boundary from GIS');
}

// ---------- C-102 dimension and paving plan ----------
const isPaving = (G, p) => pavement(G).some(pv => inside(p, pv.outer) && !pv.holes.some(h => inside(p, h)));
function dimOut(V, a, b, centre, label, off = 16, size = 8) {
  const A = V.X(a), B = V.X(b), C = V.X(centre), d = unit(A, B), nn = [-d[1], d[0]], m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  return dim(A[0], A[1], B[0], B[1], label, (nn[0] * (m[0] - C[0]) + nn[1] * (m[1] - C[1])) < 0 ? -off : off, size);
}
// a building's nearest point to the property line: { p (on the building), q (on the line), d, edge }
function toLine(G, b) {
  let best = { d: Infinity, p: b.c, q: b.c, edge: 0 };
  for (const v of b.o) { const r = nearOn(v, G.ring, true); if (r.d < best.d) best = { d: r.d, p: v, q: r.p, edge: r.i }; }
  for (let i = 0; i < G.ring.length; i++) { const r = nearOn(G.ring[i], b.o, true); if (r.d < best.d) best = { d: r.d, p: r.p, q: G.ring[i], edge: nearOn(r.p, G.ring, true).i }; }
  return best;
}
function dimsSheet(ctx, sh) {
  const G = geo(ctx), V = view(G), P = V.P, X = V.X, k = V.k, L = placer(), o = [], m = ctx.m, rules = S.edgeRules(G.ring, G.fi, G.plan.setbacks, G.plan.streets);
  o.push(ground(G, V, { paving: false, buildings: false }));
  for (const e of G.els) if (e.kind === 'parking') o.push(poly(P(S.outline(e)), 'fill="#dcdddb" stroke="none"'));
  for (const e of G.els) if (e.kind === 'drive' || e.kind === 'truck') { const q = P(S.outline(e)); o.push(poly(q, 'fill="#ebe9e2" stroke="none"')); }
  for (const e of G.els) if (e.kind === 'plaza' || e.kind === 'patio') o.push(poly(P(S.shapeOf(e)), 'fill="#f5f5f2" stroke="#9fa3a1" stroke-width=".6"'));
  for (const w of details(G).walks) o.push(poly(P(w.poly || S.corners(w)), 'fill="#fbfbf9" stroke="#9fa3a1" stroke-width=".6"'));
  for (const pv of pavement(G)) o.push(path(dOf(V, pv.outer) + pv.holes.map(h => dOf(V, h)).join(''), 'fill="none" stroke="' + INK + '" stroke-width="1.4"'));
  for (const e of G.els) if (e.kind === 'parking') o.push(segsPath(V, S.stallLines(e).map(l => ({ a: l[0], b: l[1] })), 'stroke="#7d8280" stroke-width=".5" fill="none"'));
  const A = accessible(G); for (const s of A.stalls) o.push(poly(P(s.poly), 'fill="#2f6db5" fill-opacity=".75" stroke="#fff" stroke-width=".5"')); for (const a of A.aisles) o.push(poly(P(a.poly), 'fill="none" stroke="#2f6db5" stroke-width=".6"'), segsPath(V, a.lines.map(l => ({ a: l[0], b: l[1] })), 'stroke="#2f6db5" stroke-width=".5"'));
  // fire lanes: the curbs of every drive 20 ft or wider painted red (commercial; homes' streets are shown on FP-101)
  const fl = G.res ? [] : G.lines.filter(l => l.w >= 20 && !l.aisle);
  for (const l of fl) for (const s of [-1, 1]) o.push(lineFt(V, offsetLine(l.pts, s * (l.w / 2 - 1.5)), lineAttr('firelane', 0.45)));
  for (const b of G.B) o.push(poly(P(b.o), 'fill="#d3d4d1" stroke="' + INK + '" stroke-width="1.3"'));
  o.push(poly(P(G.ring), lineAttr('property')));
  // labels and dimensions, most important first: buildings, setbacks, footprints, drive widths, stall rows
  const many = G.B.length > 16, sizes = new Set();
  o.push(bLabels(G, V, L, { sub: b => f0(b.area) + ' SF' }));
  const setb = G.B.map(b => ({ b, t: toLine(G, b) })).sort((x, y) => x.t.d - y.t.d), shown = many ? setb.slice(0, 12) : setb;
  for (const { t } of shown) { const p = X(t.p), q = X(t.q), du = unit(p, q), lab = FT(t.d), r2 = angOf(unit(t.p, t.q)), mid = [(p[0] + q[0]) / 2 - du[1] * 7, (p[1] + q[1]) / 2 + du[0] * 7];
    if (dist(p, q) < 10 || L.hit(L.box(mid[0], mid[1], lab, 8, r2))) continue; o.push(dim(p[0], p[1], q[0], q[1], '', 0, 8).replace(/<text[\s\S]*<\/text>/, ''), L.put(mid[0], mid[1], lab, 8, { rot: r2, bold: true, fill: '#c0392b' })); }
  for (const b of G.B) { const key = Math.round(b.e.w) + 'x' + Math.round(b.e.d); if (many && sizes.has(key)) continue; sizes.add(key); const c = S.corners(b.e), typ = many ? ' TYP.' : '';
    if (b.e.w * k < 26 || b.e.d * k < 26) continue; o.push(dimOut(V, c[0], c[1], b.c, ftIn(b.e.w) + typ, 14), dimOut(V, c[1], c[2], b.c, ftIn(b.e.d) + typ, 14)); }
  for (const l of G.lines.slice().sort((a, b) => a.aisle - b.aisle || lenOf(b.pts) - lenOf(a.pts))) {
    const Ln = lenOf(l.pts); if (Ln < 60 || l.w * k < 14) continue; const q = pointAt(l.pts, Ln / 2), nn = left(q.u), a = X(plus(q.p, nn, -l.w / 2)), b = X(plus(q.p, nn, l.w / 2)), mid = X(q.p), lab = ftIn(l.w), rot = angOf(nn);
    if (L.hit(L.box(mid[0], mid[1], lab, 7.5, rot))) continue; o.push(dim(a[0], a[1], b[0], b[1], '', 0).replace(/<text[\s\S]*<\/text>/, ''), L.put(mid[0], mid[1], lab, 7.5, { rot }));
  }
  for (const e of G.els) if (e.kind === 'parking' && !S.isFree(e)) {
    const st = S.stalls(e), per = st.rows.length ? Math.round(st.count / st.rows.length) : 0, sw = e.sw || 9, sd = e.sd || 18; if (!per) continue;
    const put = (u, v) => { const q = S.rotPt(st.swap ? [v, -u] : [u, v], e.rot || 0); return [e.x + q[0], e.y + q[1]]; };
    for (const [y0, y1] of st.rows) { const v = (y0 + y1) / 2, c = X(put(0, v)), u = unit(put(-1, v), put(1, v)), room = st.n * sw * k, rot = angOf(u);
      const lab = [per + ' STALLS ' + sw + "'×" + sd + "'", per + ' STALLS', String(per)].find(s => tw(s, 7) + 8 < room); if (lab) o.push(L.put(c[0], c[1], lab, 7, { rot, bold: true })); }
  }
  for (const l of fl) { const Ln = lenOf(l.pts); if (Ln < 120) continue; const q = pointAt(l.pts, Ln * 0.3), c = X(plus(q.p, left(q.u), l.w / 2 - 5)); o.push(L.put(c[0], c[1], 'FIRE LANE', 7, { rot: angOf(q.u), bold: true, fill: '#c0392b' })); }
  // the tables: paving by type, parking, and every building's distance to its nearest property line
  const area = kinds => G.els.filter(e => kinds.includes(e.kind)).reduce((s, e) => s + S.elArea(e), 0), walks = details(G).walks.reduce((s, w) => s + S.ringArea(w.poly || S.corners(w)), 0) - G.B.filter(b => !b.e.nowalk).reduce((s, b) => s + b.area, 0);
  const sbRows = setb.slice(0, 14).map(({ b, t }) => { const need = rules[t.edge]?.build ?? 0; return [b.e.name || 'Building', FT(t.d), need ? FT(need) + ' (' + (rules[t.edge]?.role || '') + ')' : '—', t.d + 0.05 >= need ? 'OK' : 'Check']; });
  const sideHtml = legendHtml([sw('fill="#ebe9e2" stroke="#9fa3a1"', 'Heavy-duty concrete: drives, fire lanes'), sw('fill="#dcdddb" stroke="#9fa3a1"', 'Standard-duty paving: stalls'), sw('fill="#fbfbf9" stroke="#9fa3a1"', 'Concrete sidewalk'), sw('fill="#2f6db5" fill-opacity=".75" stroke="none"', 'Accessible stall (ADA)'),
      '<div class="lg2">' + svg(44, 12, line(2, 6, 42, 6, 'stroke="#1b1e1f" stroke-width="1.4"')) + '<span>Curb (6 in, typical)</span></div>', ...(fl.length ? [legendLine('firelane')] : []), legendLine('property'), '<div class="lg2">' + svg(44, 14, dim(4, 9, 40, 9, '', 0)) + '<span>Dimension (feet)</span></div>']) +
    tbl('Paving schedule (typical, per geotechnical report)', ['Type', 'Section', 'Area'], [['Heavy duty — drives, fire lanes' + (area(['truck']) ? ', truck court' : ''), '7" reinf. concrete / 8" stabilized subgrade', f0(area(['drive', 'truck'])) + ' sf'], ['Standard duty — parking stalls', '5" reinf. concrete (or 2" HMAC / 8" base)', f0(area(['parking'])) + ' sf'], ['Sidewalks', '4" concrete, 2% max cross slope', f0(Math.max(0, walks)) + ' sf']], [2]) +
    (m.stalls || m.required ? tbl('Parking', null, [['Required at the ratios used', f0(m.required)], ['Provided (surface stalls' + (m.garages ? ' + garages' : '') + ')', f0(m.spaces)], ['Accessible stalls (in the total)', m.ada + (m.ada ? ' (' + Math.ceil(m.ada / 6) + ' van)' : '')], ['Stall / aisle', "9' × 18' / 24' two-way"]], [1]) : '') +
    tbl('Building setbacks' + (setb.length > 14 ? ' (closest 14)' : ''), ['Building', 'To property line', 'Required (assumed)', ''], sbRows, [1, 2]) +
    notes('Notes', ['Dimensions are to the outside face of the building and to the property line from GIS; confirm against the survey.', 'Curbs are 6 in concrete curb and gutter unless noted; curb returns 25 ft radius at drives, 3 ft at islands (typical).',
      fl.length ? 'Fire lanes: every drive 20 ft or wider, marked with red curbs and "FIRE LANE — NO PARKING" per the fire code official.' : 'Streets and drives 20 ft or wider serve as fire apparatus access; see FP-101.', 'Accessible stalls and routes per the 2012 Texas Accessibility Standards (TDLR); van stalls 11 ft with a 5 ft aisle.',
      many ? 'Repeated buildings: footprint dimensions are shown once for each size (TYP.); setbacks for the closest buildings. See C-103 for typical lots.' : 'Setbacks shown are the plan\'s assumed setbacks; confirm with the governing ordinance, plat and deed restrictions.', 'Paving sections are typical; the geotechnical report governs.']) +
    discBlocks(ctx, 'civil', 'Civil') + warn('Dimensions are measured from the conceptual plan and rounded; a surveyor must stake from the final civil plans.');
  return planPage(sh, V, o.join(''), sideHtml, 'Dimension & paving plan');
}

// ---------- C-103 typical lot plot plans ----------
function lotsSheet(ctx, sh) {
  const G = geo(ctx), lots = G.els.filter(e => e.kind === 'lot'); if (!lots.length) { sh.scale = 'N.T.S.'; return '<p class="muted">This plan has no lots.</p>'; }
  const sizeOf = e => { const m = String(e.note || '').match(/(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)/); return m ? [+m[1], +m[2]] : [Math.round(e.w), Math.round(e.d)]; }, groups = new Map();
  for (const e of lots) { const [w, d] = sizeOf(e), k = w + '×' + d; (groups.get(k) || groups.set(k, { w, d, lots: [] }).get(k)).lots.push(e); }
  const all = [...groups.values()].sort((a, b) => b.lots.length - a.lots.length), list = all.slice(0, 4), SB = { front: 25, side: 5, rear: 10 };
  for (const g of list) { // the home on a typical lot: the most common footprint on lots this size
    const homes = g.lots.map(l => { const o = S.outline(l), b = G.B.find(b => inside(b.c, o)); return b ? { l, b } : null; }).filter(Boolean), cnt = new Map();
    for (const h of homes) { const k = Math.round(h.b.e.w) + 'x' + Math.round(h.b.e.d); cnt.set(k, (cnt.get(k) || 0) + 1); }
    const top = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0], h = homes.find(h => Math.round(h.b.e.w) + 'x' + Math.round(h.b.e.d) === top);
    const turn = h ? Math.abs((((h.b.e.rot || 0) - (h.l.rot || 0)) % 180 + 180) % 180 - 90) < 30 : false;
    g.hw = h ? (turn ? h.b.e.d : h.b.e.w) : Math.min(40, g.w - 10); g.hd = h ? (turn ? h.b.e.w : h.b.e.d) : 45; g.home = h?.b.e.note || ''; g.plans = [...new Set(homes.map(x => (x.b.e.note || '').split(' · ')[0]))].filter(Boolean).slice(0, 3);
    g.dw = Math.round(G.els.find(e => e.kind === 'plaza' && e.note === 'Driveway')?.w || 16);
  }
  const cols = list.length === 1 ? 1 : 2, rows = list.length <= 2 ? 1 : 2, cw = MAIN.w / cols, ch = (MAIN.h - 8) / rows, mx = 30, top = 28, bot = 36; // ft of margin round a lot for dims and the street
  const W = Math.max(...list.map(g => g.w)) + 2 * mx, D = Math.max(...list.map(g => g.d)) + top + bot, sc = engScale(W, D, (cw - 30) / PT, (ch - 80) / PT), k = sc.k;
  const cells = list.map((g, i) => {
    const X = (x, y) => [(x + mx) * k, (g.d + top - y) * k], R = (x0, y0, x1, y1, a) => filled([X(x0, y0), X(x1, y0), X(x1, y1), X(x0, y1)], a), o = [];
    const hx0 = (g.w - g.hw) / 2, hx1 = hx0 + g.hw, hy0 = SB.front, hy1 = hy0 + g.hd, dx1 = Math.min(g.w - 2, hx1 - 1), dx0 = dx1 - g.dw;
    o.push(R(-mx, -bot, g.w + mx, -11, 'fill="#e2e3e1" stroke="none"'), line(...X(-mx, -11), ...X(g.w + mx, -11), 'stroke="' + INK + '" stroke-width="1.3"'), line(...X(-mx, -30), ...X(g.w + mx, -30), 'stroke="#fff" stroke-width="1.2" stroke-dasharray="10 8"'));
    o.push(R(-mx, -6, g.w + mx, -1, 'fill="#f7f7f5" stroke="#9fa3a1" stroke-width=".7"'), R(0, 0, g.w, 10, 'fill="url(#hatch)" stroke="none" opacity=".55"'), line(...X(0, 10), ...X(g.w, 10), lineAttr('easement')));
    o.push(R(SB.side, SB.front, g.w - SB.side, g.d - SB.rear, lineAttr('setback')), R(dx0, -11, dx1, hy0, 'fill="url(#conc)" stroke="#6b7174" stroke-width=".8"'), R(hx0, hy0, hx1, hy1, 'fill="#d3d4d1" stroke="' + INK + '" stroke-width="1.4"'));
    o.push(R(0, 0, g.w, g.d, lineAttr('property', 1.2)));
    const t = (x, y, s, size = 8, opt = {}) => { const p = X(x, y); return T(p[0], p[1], s, size, opt); }, D2 = (x0, y0, x1, y1, lab, off = 14) => { const a = X(x0, y0), b = X(x1, y1); return dim(a[0], a[1], b[0], b[1], lab, off, 9.5); };
    o.push(t(g.w / 2, -21, 'STREET (R.O.W.)', 11, { bold: true }), t(g.w * 0.3, -3.5, "5' SIDEWALK", 8.5), t(g.w * 0.3, 5, "10' U.E.", 8.5, { fill: '#4d5457' }), t((hx0 + hx1) / 2, (hy0 + hy1) / 2 + 4, 'HOUSE', 11, { bold: true }), t((hx0 + hx1) / 2, (hy0 + hy1) / 2 - 5, ftIn(g.hw) + ' × ' + ftIn(g.hd), 9.5));
    o.push(t((dx0 + dx1) / 2, hy0 - 10, 'DRIVE', 8.5, { rot: -90 }), t((dx0 + dx1) / 2, hy0 + 6, 'GARAGE', 8), t(g.w / 2, g.d - SB.rear + 3, 'REAR B.L.', 8, { fill: '#6b7174' }), t(g.w / 2, SB.front - 3, 'FRONT B.L.', 8, { fill: '#6b7174' }));
    o.push(D2(0, g.d, g.w, g.d, ftIn(g.w), 16), D2(0, 0, 0, g.d, ftIn(g.d), 18), D2(g.w, 0, g.w, SB.front, ftIn(SB.front) + ' B.L.', -18), D2(g.w, hy1, g.w, g.d, ftIn(g.d - hy1), -18), D2(0, hy1 + 8, hx0, hy1 + 8, ftIn(hx0), 10), D2(hx1, hy1 + 8, g.w, hy1 + 8, ftIn(g.w - hx1), 10), D2(dx0, hy0 - 22, dx1, hy0 - 22, ftIn(dx1 - dx0), 10));
    const svgW = (g.w + 2 * mx) * k, svgH = (g.d + top + bot) * k;
    return '<div style="position:absolute;left:' + n(MAIN.x + (i % cols) * cw) + 'pt;top:' + n(MAIN.y + Math.floor(i / cols) * ch) + 'pt;width:' + n(cw) + 'pt;height:' + n(ch) + 'pt;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10pt">' +
      svg(svgW, svgH, o.join('')) + viewTitle(i + 1, 'Typical ' + g.w + "' × " + g.d + "' lot — " + g.lots.length + ' lots', sc.label + ' on 24" × 36"') + '</div>';
  });
  sh.scale = sc.label;
  const sideHtml = legendHtml([legendLine('property'), legendLine('setback'), legendLine('easement'), sw('fill="#d3d4d1" stroke="#1b1e1f"', 'House footprint'), sw('fill="url(#conc)" stroke="#6b7174"', 'Concrete driveway'), sw('fill="#f7f7f5" stroke="#9fa3a1"', 'Public sidewalk')]) +
    tbl('Lot summary', ['Lot size', 'Lots', 'Lot area', 'Homes on these lots'], all.map(g => [g.w + "' × " + g.d + "'", String(g.lots.length), f0(g.w * g.d) + ' sf', (g.plans || []).join(', ') || '—']), [1, 2]) +
    tbl('Setbacks (assumed, typical residential)', null, [['Front building line', "25'"], ['Side yard', "5' (10' at a street side)"], ['Rear yard', "10'"], ['Front utility easement', "10'"], ['Driveway width', g16(list) + "'"]], [1]) +
    notes('Notes', ['Lots are drawn as idealised rectangles of each size in the plan; curved fronts and corner lots vary. See C-101 for every lot.', 'Setbacks and easements are assumed typical values; the plat, deed restrictions and county rules govern.',
      'Each home shown is the most common plan on lots that size; final plotting is by the builder on a plot plan for each lot.', 'Driveways and sidewalks: 4 in to 5 in concrete; a 5 ft sidewalk in the right-of-way where the county or the subdivision requires one.',
      'Lot grading: drain away from the house at 5% for 10 ft, then to the street or a rear swale; finished floor at least 1 ft above the street crown (assumed).', 'Mailbox clusters and street lights by the subdivision; meters and cleanouts at the front lot line (see C-301).']) +
    discBlocks(ctx, 'civil', 'Civil') + (all.length > 4 ? '<p class="muted">' + (all.length - 4) + ' less common lot sizes are not drawn.</p>' : '');
  return cells.join('') + side(sideHtml);
}
const g16 = list => [...new Set(list.map(g => g.dw))].join(' / ');

// ---------- C-201 grading and drainage ----------
// contour lines of z over the site (marching squares on a grid); interval in feet -> [{ z, segs: [[a, b]] }]
function contours(G, z, interval) {
  const [x0, y0, x1, y1] = bboxOf(G.ring), cell = Math.max(8, Math.ceil(Math.max(x1 - x0, y1 - y0) / 70)), nx = Math.ceil((x1 - x0) / cell) + 1, ny = Math.ceil((y1 - y0) / cell) + 1, v = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = z([x0 + i * cell, y0 + j * cell]);
  let lo = Infinity, hi = -Infinity; for (const q of v) { if (q < lo) lo = q; if (q > hi) hi = q; }
  const out = [], pt = (i, j) => [x0 + i * cell, y0 + j * cell];
  for (let L = Math.ceil(lo / interval) * interval; L <= hi && out.length < 80; L += interval) {
    const segs = [];
    for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
      const c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]], vals = c.map(([a, b]) => v[b * nx + a]), cr = [];
      for (let e = 0; e < 4; e++) { const a = vals[e], b = vals[(e + 1) % 4]; if ((a - L) * (b - L) < 0) cr.push(lerp(pt(...c[e]), pt(...c[(e + 1) % 4]), (L - a) / (b - a))); }
      if (cr.length >= 2) segs.push([cr[0], cr[1]]); if (cr.length === 4) segs.push([cr[2], cr[3]]);
    }
    if (segs.length) out.push({ z: +L.toFixed(2), segs });
  }
  return out;
}
const z2 = v => (Math.round(v * 100) / 100).toFixed(2), z1 = v => (Math.round(v * 10) / 10).toFixed(1);
const ffOf = (G, b) => Math.round((Math.max(...b.o.map(gradeModel(G).z)) + 1) * 10) / 10;
function gradingSheet(ctx, sh) {
  const G = geo(ctx), V = view(G), M = gradeModel(G), SM = stormModel(G), P = V.P, X = V.X, k = V.k, L = placer(), o = [];
  o.push(ground(G, V, { pave: '#f2f2f0', bAttr: 'fill="#fff" stroke="#4d5457" stroke-width="1.2"', pondFill: '#e9f1f8' }));
  // contours: every 0.5 ft on a flat site (every foot when it falls more than 6 ft), the whole feet heavier and labelled
  const C0 = contours(G, M.z, 1), relief = C0.length, iv = relief > 6 ? 1 : 0.5, C = iv === 1 ? C0 : contours(G, M.z, 0.5), clip = uid('cg');
  const major = z => iv === 1 ? Math.abs(z % 5) < 1e-6 : Math.abs(z - Math.round(z)) < 1e-6;
  o.push('<clipPath id="' + clip + '">' + poly(P(G.ring), '') + '</clipPath><g clip-path="url(#' + clip + ')">' + C.map(c => segsPath(V, c.segs.map(([a, b]) => ({ a, b })), 'fill="none" stroke="#8a6d4a" stroke-width="' + (major(c.z) ? 1.1 : 0.55) + '"')).join('') + '</g>');
  for (const p of G.ponds) o.push(poly(P(p.o), 'fill="none" stroke="#2f6db5" stroke-width="1.2"'));
  for (const c of C) { if (!major(c.z) && C.length > 14) continue; const ok = c.segs.filter(([a, b]) => { const m = lerp(a, b, 0.5); return inside(m, G.ring) && nearOn(m, G.ring, true).d > 25 && !G.B.some(b2 => inside(m, b2.o)) && !isPaving(G, m); });
    for (const f of [0.25, 0.75]) { const sg = ok[Math.floor(ok.length * f)]; if (!sg) continue; const m = X(lerp(sg[0], sg[1], 0.5)); o.push(L.put(m[0], m[1], z1(c.z), 7, { rot: angOf(unit(sg[0], sg[1])), fill: '#6b4a2b', bold: major(c.z) })); } }
  // storm sewer: pipes with their sizes, inlets at the curb, manholes, the outfall and the pond's outlet
  o.push(segsPath(V, SM.tree.segs, lineAttr('storm')), segsPath(V, SM.inlets.map(i => ({ a: i.curb, b: i.p })), lineAttr('storm', 0.7)));
  o.push(lineFt(V, [SM.root, SM.outfall], lineAttr('storm')));
  for (const s of SM.tree.segs) { const Lp = dist(s.a, s.b) * k; if (Lp < 70 || !s.load) continue; const mid = X(lerp(s.a, s.b, 0.5)), u = unit(s.a, s.b), nn = left(u), c = [mid[0] + nn[0] * 8, mid[1] - nn[1] * 8]; o.push(L.put(c[0], c[1], pipeSize(s.load) + '" RCP', 7, { rot: angOf(u), fill: '#1f7a3e', bold: true })); }
  for (const i of SM.inlets) { const p = X(i.curb); o.push(sym('inlet', p[0], p[1], 6)); L.add([p[0] - 6, p[1] - 5, p[0] + 6, p[1] + 5]); }
  for (const q of SM.mh) { const p = X(q); o.push(sym('manhole', p[0], p[1], 6.5)); L.add([p[0] - 6, p[1] - 6, p[0] + 6, p[1] + 6]); }
  const of = X(SM.outfall), ou = unit(SM.root, SM.outfall), hw = [-ou[1], -ou[0]];
  o.push(line(of[0] + hw[0] * 8, of[1] + hw[1] * 8, of[0] - hw[0] * 8, of[1] - hw[1] * 8, 'stroke="' + INK + '" stroke-width="3"'), L.put(of[0] + 10, of[1] + 12, M.pond ? 'OUTFALL / HEADWALL (ASSUMED)' : 'TO STREET STORM SEWER OR DITCH (CONFIRM)', 7.5, { anchor: 'start', bold: true }));
  if (SM.outlet) { const a = X(SM.outlet.at), b = X(SM.outlet.to); o.push(line(a[0], a[1], b[0], b[1], lineAttr('storm')), rect(a[0] - 6, a[1] - 6, 12, 12, 'fill="#fff" stroke="' + INK + '" stroke-width="1.4"'), L.put(a[0] + 10, a[1] - 12, 'OUTLET CONTROL STRUCTURE W/ RESTRICTOR', 7.5, { anchor: 'start', bold: true }), L.put(b[0] + 6, b[1] + 10, 'TO RECEIVING DITCH / STORM SEWER (CONFIRM OUTFALL)', 7, { anchor: 'start', force: true })); }
  if (M.pond) { const c = X(S.centroid(M.pond.o)); ['DETENTION POND', 'TOP OF BANK ' + z1(M.Z0), 'HWL ' + z1(M.hwl) + ' (100-YR, ASSUMED)', (M.wet ? 'NWL ' : 'BOTTOM ') + z1(M.bottom), '4:1 SIDE SLOPES'].forEach((s, i) => o.push(L.put(c[0], c[1] + (i - 2) * 11, s, i ? 8 : 9, { bold: !i, fill: '#173a55', force: true }))); }
  // finished floors and corner spot grades (homes: the floor only)
  for (const b of G.B) { const ff = ffOf(G, b), c = X(b.c); o.push(L.put(c[0], c[1] + (G.B.length > 30 ? 0 : 9), 'FF ' + z1(ff), G.B.length > 30 ? 6.5 : 8.5, { bold: true, force: G.B.length <= 30 }));
    if (G.B.length <= 30) for (const q of S.corners(b.e)) { const p = X(plus(q, unit(b.c, q), 7)); o.push(line(p[0] - 2.5, p[1] - 2.5, p[0] + 2.5, p[1] + 2.5, 'stroke="' + INK + '" stroke-width=".8"'), line(p[0] - 2.5, p[1] + 2.5, p[0] + 2.5, p[1] - 2.5, 'stroke="' + INK + '" stroke-width=".8"'), L.put(p[0] + 4, p[1] - 6, z2(M.z(q)), 6.5, { anchor: 'start' })); } }
  // flow arrows down the assumed fall: on the drives, and on the lawn
  const down = p => { const g = [M.z([p[0] + 1, p[1]]) - M.z([p[0] - 1, p[1]]), M.z([p[0], p[1] + 1]) - M.z([p[0], p[1] - 1])], l = Math.hypot(...g); return l > 1e-6 ? [-g[0] / l, -g[1] / l] : null; };
  let na = 0; for (const l of G.lines) for (const q of along(l.pts, 140, { start: 70 })) { const u = down(q.p); if (!u) continue; const c = X(plus(q.p, left(q.u), l.w / 4)); o.push(arrow(c, u, 24)); if (na++ % 3 === 0) o.push(L.put(c[0] + 10, c[1] - 9, (M.s * 100).toFixed(1) + '%', 6.5, { anchor: 'start', fill: '#2f6db5' })); }
  const [bx0, by0, bx1, by1] = bboxOf(G.ring), blocked = p => !inside(p, G.ring) || isPaving(G, p) || G.B.some(b => inside(p, b.o)) || G.ponds.some(q => inside(p, q.o)) || nearOn(p, G.ring, true).d < 20;
  for (let x = bx0 + 60; x < bx1; x += 170) for (let y = by0 + 60; y < by1; y += 170) { const p = [x, y]; if (blocked(p)) continue; const u = down(p); if (u) o.push(arrow(X(p), u, 20, 'stroke="#2f6db5" stroke-width=".8" opacity=".8"')); }
  // the tables: pipes by size, structures
  const bySize = new Map(); for (const s of SM.tree.segs) { const d = pipeSize(s.load || SM.per); bySize.set(d, (bySize.get(d) || 0) + dist(s.a, s.b)); } bySize.set(pipeSize(SM.devAc), (bySize.get(pipeSize(SM.devAc)) || 0) + dist(SM.root, SM.outfall));
  const ffs = G.B.map(b => ffOf(G, b)), sideHtml = legendHtml(['<div class="lg2">' + svg(44, 12, line(2, 6, 42, 6, 'stroke="#8a6d4a" stroke-width="1.1"')) + '<span>Proposed contour (assumed)</span></div>', legendLine('storm'), legendSym('inlet'), legendSym('manhole'), '<div class="lg2">' + svg(44, 14, arrow([22, 7], [1, 0], 30)) + '<span>Flow direction (assumed fall)</span></div>',
      '<div class="lg2">' + svg(26, 16, line(9, 4, 15, 10, 'stroke="#1b1e1f"') + line(9, 10, 15, 4, 'stroke="#1b1e1f"')) + '<span>Spot grade (assumed)</span></div>', sw('fill="#e9f1f8" stroke="#2f6db5"', 'Detention pond'), legendLine('property')]) +
    tbl('Storm sewer (schematic)', ['Item', 'Quantity'], [['Curb / area inlets', SM.inlets.length + ' ea'], ['Manholes / junction boxes', SM.mh.length + ' ea'], ...[...bySize.entries()].sort((a, b) => a[0] - b[0]).map(([d, l]) => [d + '" RCP storm pipe', f0(l) + ' LF']), ['Outfall', M.pond ? 'Detention pond, outlet structure to the street' : 'Street storm sewer or roadside ditch (confirm)']], [1]) +
    tbl('Grading (assumed)', null, [['Datum', 'Assumed 100.00 at the ' + (M.pond ? 'pond top of bank' : 'street frontage') + ' — not a survey datum'], ['Fall toward ' + (M.pond ? 'the pond' : 'the street'), (M.s * 100).toFixed(1) + '% (paving 0.5% min, 5% max)'], ['Finished floors', G.B.length ? 'FF = highest adjacent grade + 1.0 ft (' + z1(Math.min(...ffs)) + ' to ' + z1(Math.max(...ffs)) + ')' : '—'], ['Contour interval', iv + ' ft (heavier every ' + (iv === 1 ? '5 ft' : '1 ft') + ')'], ['Pipe sizing', 'Rational method, C 0.8, i 6 in/hr, RCP at 0.30%, by drained area']]) +
    notes('Notes', ['SCHEMATIC grading by rule of thumb from an assumed datum; there is no topographic survey yet. The civil engineer will grade from the survey.', 'Storm sewer designed by the civil engineer to NOAA Atlas 14 rainfall and ' + (ctx.county ? ctx.county.replace(/,.*/, '') : 'the county') + ' / drainage district criteria; sizes shown are placeholders.',
      'Detention: ' + (M.pond ? 'the pond on C-101 holds the volume on C-202, released through a restrictor to pre-development peak flow.' : 'see C-202; no pond is drawn, so storage is underground or by others.'), 'Finished floors at least 1 ft above adjacent grade and above the 100-year water surface / base flood elevation plus the county\'s freeboard; check against the FEMA zone on C-001.',
      'Inlets about every 275 ft along drives and at low points; gutter spread and bypass to be checked by the engineer.', 'Accessible routes: 5% max running slope, 2% max cross slope (TAS).']) +
    discBlocks(ctx, 'civil', 'Civil', true) + warn('Contours, grades and pipes are assumed for coordination and pricing; they are not a grading design.');
  return planPage(sh, V, o.join(''), sideHtml, 'Grading & drainage plan', 'assumed datum');
}

// ---------- C-202 detention summary ----------
function detentionSheet(ctx, sh) {
  const G = geo(ctx), m = ctx.m, st = S.stormOf(ctx.plan), M = gradeModel(G), site = m.siteSf, imp = Math.min(site, m.impervious * site), pond = m.pond || 0, perv = Math.max(0, site - imp - pond);
  const Ci = 0.9, Cp = 0.35, Cw = site ? (imp * Ci + perv * Cp + pond) / site : 0, rate = st.acres > 0 && st.volume > 0 ? st.volume / st.acres : (+G.plan.params?.storm?.rate || S.STORM.rate);
  const req = st.volume > 0 ? st.volume : rate * st.acres, pondAF = pond * M.depth / 1.2 / 43560, vault = st.vault || 0, prov = pondAF + vault, ok = prov >= req * 0.98;
  // the drainage area map: the whole site to the pond, impervious cover darker
  const hMap = (MAIN.h - 64) * 0.58, V = view(G, 40, MAIN.w / PT, hMap / PT), P = V.P, X = V.X, o = [];
  o.push(poly(P(G.ring), 'fill="#f3f6ef" stroke="none"'), ground(G, V, { pave: '#a9adab', curb: '#7d8280', bAttr: 'fill="#7d8280" stroke="#4d5457" stroke-width=".8"', pondFill: '#9cc7e8', lots: false }));
  const rb = bboxOf(V.P(G.ring)), c = [rb[2] + 30, (rb[1] + rb[3]) / 2], L = placer(); o.push(line(rb[2] - 30, c[1], c[0] - 4, c[1], 'stroke="' + INK + '" stroke-width=".8"'), circle(rb[2] - 30, c[1], 2.5, 'fill="' + INK + '"'), L.put(c[0], c[1] - 10, 'DA-1: ' + st.acres.toFixed(2) + ' AC DEVELOPED → ' + (M.pond ? 'DETENTION POND' : 'UNDERGROUND STORAGE'), 11, { bold: true, force: true, anchor: 'start' }), L.put(c[0], c[1] + 8, 'C = ' + Cw.toFixed(2) + ' (weighted, assumed) · impervious shown dark', 9, { force: true, anchor: 'start' }));
  if (M.pond) { const q = X(S.centroid(M.pond.o)); o.push(L.put(q[0], q[1], 'POND ' + ac(pond) + ' AC', 9, { bold: true, fill: '#173a55' })); }
  sh.scale = 'As noted';
  // a typical pond section, not to scale: 6 px a foot across, 30 px a foot up (5x vertical)
  const d = M.depth, vy = 30, hx = 6, SW = 1500, SH = 120 + d * vy + 90, cx = SW / 2, Y0 = 90, Yb = Y0 + d * vy, bw = 230, run = 4 * d * hx, s = [], Y = z => Y0 + (M.Z0 - z) * vy, bot = (M.wet ? 'NWL ' : 'BOTTOM ') + z1(M.bottom);
  const top = [cx - bw - run, cx + bw + run], hy = Y(M.hwl), hw = bw + 4 * (d - 1) * hx, gl = [[20, Y0 - 10], [top[0] - 160, Y0 - 4], [top[0] - 120, Y0], [top[0], Y0], [cx - bw, Yb], [cx + bw, Yb], [top[1], Y0], [top[1] + 120, Y0], [top[1] + 160, Y0 - 4], [SW - 20, Y0 - 10]];
  s.push(filled(gl.concat([[SW - 20, Yb + 60], [20, Yb + 60]]), 'fill="url(#earth)" stroke="none"'), poly([[cx - hw, hy], [cx - bw, Yb], [cx + bw, Yb], [cx + hw, hy]], 'fill="#9cc7e8" fill-opacity=".5" stroke="none"'), pline(gl, 'fill="none" stroke="' + INK + '" stroke-width="2.2"'), line(cx - hw - 30, hy, cx + hw + 30, hy, 'stroke="#2f6db5" stroke-width="1.4" stroke-dasharray="10 5"'));
  if (!M.wet) s.push(rect(cx - 30, Yb - 6, 60, 6, 'fill="#d9d9d6" stroke="' + INK + '" stroke-width="1"'));
  const ld = (x1, y1, x2, y2, t, a = 'start') => line(x1, y1, x2, y2, 'stroke="' + INK + '" stroke-width=".8"') + T(x2 + (a === 'start' ? 4 : -4), y2, t, 11, { anchor: a, halo: false });
  s.push(ld(top[0] - 60, Y0, top[0] - 140, Y0 - 50, 'TOP OF BANK ' + z1(M.Z0) + ' (ASSUMED)', 'end'), ld(cx + hw + 30, hy, cx + hw + 120, hy - 40, 'HWL ' + z1(M.hwl) + ' — 100-YR WATER SURFACE (ASSUMED)'), ld(cx, Yb, cx + 60, Yb + 44, bot + (M.wet ? ' (PERMANENT POOL)' : ' — CONCRETE PILOT CHANNEL, 1% MIN.')));
  s.push(ld(cx - bw - run / 2, (Y0 + Yb) / 2, cx - bw - run / 2 - 150, (Y0 + Yb) / 2 + 30, '4:1 SIDE SLOPE (MAX.), SODDED', 'end'), ld(top[1] + 60, Y0, top[1] + 120, Y0 - 50, "20' MAINTENANCE BERM (TYP.)"));
  s.push(dim(top[1] - 20, Y0, top[1] - 20, hy, "1'-0\\\"", -14, 10), dim(cx + bw + 40, hy, cx + bw + 40, Yb, ftIn(d - 1) + ' LIVE STORAGE', -14, 10), rect(cx + bw - 50, Yb - 70, 26, 70, 'fill="#fff" stroke="' + INK + '" stroke-width="1.6"'), ld(cx + bw - 37, Yb - 40, cx + bw + 150, Yb + 10, 'OUTLET STRUCTURE WITH RESTRICTOR ORIFICE (SIZED BY ENGINEER)'), line(top[0] + 10, Y0 + 6, top[0] + 70, Y0 + 6 + 60 * vy / hx / 4 / 5, lineAttr('storm', 1.4)), ld(top[0] + 40, Y0 + 10, top[0] + 80, Y0 + 80, 'INFLOW PIPE'));
  const section = svg(SW, SH, s.join(''));
  const body = at(MAIN.x, MAIN.y, MAIN.w, hMap, svg(V.W, V.H, o.join('')), 'display:flex;align-items:center;justify-content:center') + at(MAIN.x, MAIN.y, 90, 90, northArrow(V.turn, 64)) +
    at(MAIN.x, MAIN.y + hMap + 4, MAIN.w, 44, '<div style="display:flex;align-items:center;gap:24pt">' + viewTitle(1, 'Drainage area map', V.sc.label + ' on 24" × 36"') + scaleBar(V.sc.ft) + '</div>') +
    at(MAIN.x, MAIN.y + hMap + 70, MAIN.w, MAIN.h - hMap - 130, section, 'display:flex;align-items:center;justify-content:center') + at(MAIN.x, MAIN.y + MAIN.h - 52, MAIN.w, 52, viewTitle(2, 'Typical detention pond section', 'N.T.S. (vertical exaggerated)'));
  const sideHtml = tbl('Drainage areas', ['Cover', 'Area', 'C (assumed)'], [['Impervious (roofs, paving)', ac(imp) + ' ac', Ci.toFixed(2)], ['Pervious (landscape)', ac(perv) + ' ac', Cp.toFixed(2)], ['Pond surface', ac(pond) + ' ac', '1.00'], ['Whole site', ac(site) + ' ac', Cw.toFixed(2) + ' weighted']], [1, 2]) +
    tbl('Storage required', null, [['Method', 'Rule of thumb: ' + rate.toFixed(2) + ' ac-ft per developed acre (Harris County-style; not universal)'], ['Developed area', st.acres.toFixed(2) + ' ac'], ['Required storage', req.toFixed(2) + ' ac-ft (' + f0(req * 43560) + ' cf)']], [1]) +
    tbl('Storage provided', null, [['Pond', M.pond ? ac(pond) + ' ac × ' + M.depth + ' ft deep ÷ 1.2 (slopes, freeboard) = ' + pondAF.toFixed(2) + ' ac-ft' : 'No pond on the plan'], ['Underground storage', vault > 0 ? vault.toFixed(2) + ' ac-ft (vault / oversized pipes, location by engineer)' : 'None'], ['Total provided', prov.toFixed(2) + ' ac-ft']], [1]) +
    '<div class="blk"><div class="warnbox" style="border-color:' + (ok ? '#1f9249' : '#c0392b') + '"><b style="color:' + (ok ? '#1f9249' : '#c0392b') + '">' + (ok ? 'PROVIDED ≥ REQUIRED' : 'SHORTFALL ' + (req - prov).toFixed(2) + ' AC-FT') + '</b> — required ' + req.toFixed(2) + ' ac-ft, provided ' + prov.toFixed(2) + ' ac-ft' + (st.mode === 'none' ? '. Sites under 1 acre often need no detention; confirm.' : '.') + '</div></div>' +
    notes('Notes', ['The method and rate are placeholders; confirm with the drainage authority (county engineer, drainage or flood control district) before design.', 'Final design by a Texas PE: NOAA Atlas 14 rainfall, pre- and post-development hydrographs, outlet sized to release no more than the pre-development peak for the 2-, 10- and 100-year storms.',
      'Pond: 4:1 side slopes (max.), 1 ft freeboard above the 100-year water surface, 20 ft maintenance berm, sodded and stabilized; a dry pond has a concrete pilot channel at 1% minimum.', 'Grades are from the assumed datum on C-201 and will change with the topographic survey and the receiving system\'s tailwater.', ...factsLike(ctx, /flood|drain|detention|fema/i)]) +
    discBlocks(ctx, 'civil', 'Civil') + warn('Storage numbers are planning estimates from the plan; the engineer\'s drainage report governs.');
  return body + side(sideHtml);
}

// ---------- C-301 utility plan ----------
// pad-mounted transformers: one beside each commercial building of any size (at the back corner away from the street),
// and for homes one for about every eight, at the street
function transformers(G) {
  return lazy(G, 'xf', () => {
    const out = [], [fa, fb] = frontEdge(G), W = net(G, 'water');
    for (const b of G.B.filter(b => !b.res && b.area >= 3000)) { const v = b.o.reduce((m, p) => foot(p, fa, fb).d > foot(m, fa, fb).d ? p : m, b.o[0]); out.push({ p: plus(v, unit(b.c, v), 12), b: [b] }); }
    for (const b of G.B.filter(b => b.res).sort((a, c) => a.c[1] - c.c[1] || a.c[0] - c.c[0])) { const t = out.find(t => t.res && t.b.length < 8 && dist(t.p, b.c) < 220); if (t) t.b.push(b); else out.push({ p: tapOf(W, b.c).q, b: [b], res: true }); }
    return out;
  });
}
// where a building's services leave it: the water service and meter, the sewer service and cleanout, the fire line
function services(G) {
  return lazy(G, 'svc', () => { const W = net(G, 'water'), SW = net(G, 'sewer');
    return G.B.map(b => { const wt = tapOf(W, b.c), ww = wallAt(b.o, wt.q), st = tapOf(SW, b.c); let sw0 = wallAt(b.o, st.q); if (dist(sw0.p, ww.p) < 8) sw0 = { ...sw0, p: plus(sw0.p, sw0.u, Math.min(10, Math.max(b.e.w, b.e.d) / 4)) };
      return { b, water: { tap: wt.q, wall: ww.p, meter: plus(wt.q, unit(wt.q, ww.p), Math.min(10, dist(wt.q, ww.p) * 0.4)) }, sewer: { tap: st, wall: sw0.p, co: plus(sw0.p, unit(sw0.p, st.q), Math.min(5, dist(sw0.p, st.q) * 0.4)) } }; }); });
}
function sewerTree(G) { return lazy(G, 'sst', () => { const SW = net(G, 'sewer'), t = treeOf(SW, services(G).map(s => ({ ...s.sewer.tap, load: 1 }))); return { tree: t, mh: structuresOn(t, 400), root: SW.root.p }; }); }
// the public mains assumed along the frontage, in the right-of-way: water 14 ft out, sewer 26 ft out
const publicMain = (G, off) => { const [a, b] = entryEdge(G), nn = S.outwardOf(G.ring, G.entryEdge), u = unit(a, b); return [plus(plus(a, u, -30), nn, off), plus(plus(b, u, 30), nn, off)]; };
const hydSvg = (G, V) => hydrants(G).map(h => { const p = V.X(h); return '<g class="hyd" data-x="' + n(h[0]) + '" data-y="' + n(h[1]) + '">' + sym('hydrant', p[0], p[1], 7.5) + '</g>'; }).join('');
const fdcSvg = (G, V) => fdcs(G).map(f => { const p = V.X(f.p); return sym('fdc', p[0], p[1], 8); }).join('');
function utilitySheet(ctx, sh) {
  const G = geo(ctx), V = view(G, 70), X = V.X, k = V.k, L = placer(), o = [], W = net(G, 'water'), SM = stormModel(G), SV = services(G), ST = sewerTree(G), many = G.B.length > 30;
  o.push(ground(G, V, { pave: '#f3f3f1', bAttr: 'fill="#fff" stroke="#4d5457" stroke-width="1.1"' }));
  o.push('<g opacity=".35">' + segsPath(V, SM.tree.segs, lineAttr('storm')) + SM.inlets.map(i => { const p = X(i.curb); return sym('inlet', p[0], p[1], 5); }).join('') + '</g>');
  // public mains (assumed) and the connections to them
  const pw = publicMain(G, 14), ps = publicMain(G, 26), cw = foot(W.root.p, ...pw).q, cs = foot(ST.root, ...ps).q;
  o.push(lineFt(V, pw, lineAttr('water', 1.3)), lineFt(V, ps, lineAttr('sanitary', 1.3)), lineFt(V, [W.root.p, cw], lineAttr('water')), lineFt(V, [ST.root, cs], lineAttr('sanitary')));
  const pm = X(lerp(pw[0], pw[1], 0.72)), pu = unit(pw[0], pw[1]), sm = X(lerp(ps[0], ps[1], 0.72));
  o.push(L.put(pm[0], pm[1] - 9, 'EXIST. WATER MAIN (ASSUMED, SIZE AND PROVIDER TBD)', 7.5, { rot: angOf(pu), bold: true, fill: '#2f6db5', force: true }), L.put(sm[0], sm[1] + 9, 'EXIST. SANITARY SEWER (ASSUMED, DEPTH AND PROVIDER TBD)', 7.5, { rot: angOf(pu), bold: true, fill: '#6b4a2b', force: true }));
  const cwp = X(cw), csp = X(cs); o.push(sym('gatevalve', cwp[0], cwp[1], 6), sym('manhole', csp[0], csp[1], 6.5), L.put(cwp[0] + 8, cwp[1] - 22, G.res ? 'WATER CONNECTION' : 'TAP, METER VAULT & BACKFLOW (IF REQ\'D)', 7, { anchor: 'start', bold: true }));
  // the site's water main (looped along the drives), the sewer (a tree to the street), services, fire lines
  o.push(segsPath(V, W.edges.map(([a, b]) => ({ a: a.p, b: b.p })), lineAttr('water')), segsPath(V, ST.tree.segs, lineAttr('sanitary')));
  for (const q of ST.mh) { const p = X(q); o.push(sym('manhole', p[0], p[1], 6)); L.add([p[0] - 6, p[1] - 6, p[0] + 6, p[1] + 6]); }
  for (const s of SV) {
    const w = s.water, m = X(w.meter), co = X(s.sewer.co);
    o.push('<g class="wsvc" data-b="' + esc(s.b.e.id || '') + '">' + lineFt(V, [w.tap, w.wall], lineAttr('water', 0.6)) + sym('watermeter', m[0], m[1], many ? 4.5 : 6) + '</g>');
    o.push(lineFt(V, [s.sewer.wall, s.sewer.tap.q], lineAttr('sanitary', 0.6)), sym('cleanout', co[0], co[1], many ? 4 : 5.5));
    if (s.b.use === 'restaurant') { const g = X(lerp(s.sewer.wall, s.sewer.tap.q, 0.5)); o.push(rect(g[0] - 9, g[1] - 5, 18, 10, 'fill="#fff" stroke="#6b4a2b" stroke-width="1.2"'), T(g[0], g[1], 'GI', 6.5, { bold: true }), L.put(g[0] + 12, g[1], 'GREASE INTERCEPTOR (SIZE BY PLUMBING)', 6.5, { anchor: 'start' })); }
    if (!many && !s.b.res) { const p = X(lerp(w.tap, w.wall, 0.55)), q = X(lerp(s.sewer.tap.q, s.sewer.wall, 0.55)); o.push(L.put(p[0] + 6, p[1], '2" DOM.', 6.5, { anchor: 'start', fill: '#2f6db5' }), L.put(q[0] + 6, q[1], '6" SS', 6.5, { anchor: 'start', fill: '#6b4a2b' })); }
  }
  for (const f of fdcs(G)) { const t = tapOf(W, f.riser), piv = plus(f.riser, unit(f.riser, t.q), Math.min(40, dist(f.riser, t.q) * 0.6)), pp = X(piv), r = X(f.riser);
    o.push(lineFt(V, [t.q, f.riser], lineAttr('fireline')), sym('piv', pp[0], pp[1], 6), sym('riser', r[0], r[1], 6), L.put(pp[0] + 9, pp[1] - 9, '6" FIRE LINE', 7, { anchor: 'start', bold: true, fill: '#c0392b' })); }
  o.push(hydSvg(G, V), fdcSvg(G, V));
  for (const t of transformers(G)) { const p = X(t.p); o.push(sym('transformer', p[0], p[1], many ? 5 : 7)); }
  // main labels on the longest runs
  for (const [a, b] of W.edges.slice().sort((x, y) => dist(y[0].p, y[1].p) - dist(x[0].p, x[1].p)).slice(0, 8)) { if (dist(a.p, b.p) * k < 90) continue; const u = unit(a.p, b.p), c = X(lerp(a.p, b.p, 0.35)), nn = left(u); o.push(L.put(c[0] + nn[0] * 8, c[1] - nn[1] * 8, '8" W', 7, { rot: angOf(u), fill: '#2f6db5', bold: true })); }
  for (const s of ST.tree.segs.slice().sort((x, y) => dist(y.a, y.b) - dist(x.a, x.b)).slice(0, 8)) { if (dist(s.a, s.b) * k < 90) continue; const u = unit(s.a, s.b), c = X(lerp(s.a, s.b, 0.65)), nn = left(u); o.push(L.put(c[0] - nn[0] * 8, c[1] + nn[1] * 8, '8" SS', 7, { rot: angOf(u), fill: '#6b4a2b', bold: true })); }
  o.push(bLabels(G, V, L));
  const lenW = W.edges.reduce((s, [a, b]) => s + dist(a.p, b.p), 0), lenS = ST.tree.segs.reduce((s, q) => s + dist(q.a, q.b), 0), H = hydrants(G), prov = factsLike(ctx, /water|sewer|mud|utility|district|well|septic/i);
  const sideHtml = legendHtml([legendLine('water'), legendLine('fireline'), legendLine('sanitary'), legendLine('storm'), legendSym('hydrant'), legendSym('fdc'), legendSym('piv'), legendSym('gatevalve'), legendSym('watermeter'), legendSym('cleanout'), legendSym('manhole'), legendSym('transformer')]) +
    tbl('Utility summary (schematic)', ['Item', 'Quantity'], [['Water main, 8" (looped along drives)', f0(lenW) + ' LF'], ['Domestic water services / meters', SV.length + ' ea'], ['Fire lines with PIV and FDC', fdcs(G).length + ' ea'], ['Fire hydrants', H.length + ' ea'], ['Sanitary sewer main, 8"', f0(lenS) + ' LF'],
      ['Sanitary services with cleanouts', SV.length + ' ea'], ['Sanitary manholes', ST.mh.length + 1 + ' ea'], ['Storm inlets (see C-201)', SM.inlets.length + ' ea'], ['Transformers (by electric utility)', transformers(G).length + ' ea']], [1]) +
    blk('Service providers', '<p>' + esc(prov.length ? prov.join(' ') : 'Water, sewer, electric and gas providers have not been confirmed.') + ' Main locations, sizes, depths and capacity must be confirmed with each provider (will-serve letters).</p>') +
    notes('Notes', ['SCHEMATIC utility layout by rule of thumb from the drives; the civil engineer designs and sizes every line.', 'Public mains along the frontage are assumed; their size, depth and location are unknown until the survey and provider records are in hand.',
      'Water and sanitary lines kept 9 ft apart, or per 30 TAC 290.44 / 217.53 crossing rules (TCEQ).', 'Fire hydrants about every 500 ft along mains and so every building is within the fire marshal\'s hose lay (300 to 400 ft, assumed); a hydrant within 100 ft of every FDC. A fire flow test is required.',
      'Sprinklered buildings get a separate fire line with a PIV (or wall valve) and an FDC on the fire lane side.', 'Backflow prevention per the provider: RPZ or double check on domestic and fire services.', 'Sanitary sewer: 8 in mains at 0.33% minimum, manholes at junctions, bends and about every 400 ft; service cleanouts at the building and the property or easement line.',
      'Electric, gas and telecom by the providers; transformer locations are placeholders.']) +
    discBlocks(ctx, 'civil', 'Civil') + warn('Utility routes and sizes are placeholders for coordination and pricing only.');
  return planPage(sh, V, o.join(''), sideHtml, 'Utility plan');
}

// ---------- C-401 erosion and sediment control ----------
// an open spot for a w x d rectangle (sheet-aligned) near `near`: inside the site, clear of buildings, paving and ponds
function openSpot(G, near, w, d, avoid = []) {
  const obs = G.els.filter(e => !['lot', 'green', 'trail', 'fence'].includes(e.kind)).map(e => S.shapeOf(e)).filter(o => o.length >= 3).concat(avoid), ob = obs.map(bboxOf), [x0, y0, x1, y1] = bboxOf(G.ring), C = [];
  for (let x = x0 + w / 2; x < x1; x += 15) for (let y = y0 + d / 2; y < y1; y += 15) C.push([x, y]);
  C.sort((a, b) => dist(a, near) - dist(b, near));
  for (const c of C.slice(0, 1500)) {
    const r = [[c[0] - w / 2, c[1] - d / 2], [c[0] + w / 2, c[1] - d / 2], [c[0] + w / 2, c[1] + d / 2], [c[0] - w / 2, c[1] + d / 2]], pts = r.concat([c, lerp(r[0], r[1], 0.5), lerp(r[1], r[2], 0.5), lerp(r[2], r[3], 0.5), lerp(r[3], r[0], 0.5)]);
    if (!pts.every(p => inside(p, G.ring) && nearOn(p, G.ring, true).d > 10)) continue;
    if (obs.some((o, i) => !(ob[i][2] < r[0][0] - 6 || ob[i][0] > r[1][0] + 6 || ob[i][3] < r[0][1] - 6 || ob[i][1] > r[2][1] + 6) && (pts.some(p => inside(p, o)) || o.some(p => p[0] > r[0][0] - 6 && p[0] < r[1][0] + 6 && p[1] > r[0][1] - 6 && p[1] < r[2][1] + 6)))) continue;
    return r;
  }
  return null;
}
function erosionSheet(ctx, sh) {
  const G = geo(ctx), V = view(G), M = gradeModel(G), SM = stormModel(G), P = V.P, X = V.X, L = placer(), o = [], ring = G.ring, nR = ring.length, st = S.stormOf(ctx.plan);
  o.push(ground(G, V, { pave: '#f3f3f1', bAttr: 'fill="#fff" stroke="#6b7174" stroke-width="1"', pondFill: '#e9f1f8' }));
  // limits of construction (the site), silt fence on the low sides and the street side, a gap at the entrance
  o.push(poly(P(S.insetRing(ring, ring.map(() => 2))), 'fill="none" stroke="#4d5457" stroke-width="1.4" stroke-dasharray="18 6 4 6"'));
  const zs = ring.map((a, i) => M.z(lerp(a, ring[(i + 1) % nR], 0.5))), med = zs.slice().sort((a, b) => a - b)[Math.floor((nR - 1) / 2)], ent = G.entry, ei = nearOn(ent, ring, true).i, ew = Math.max(24, G.entryLine?.w || 26);
  let silt = 0;
  for (let i = 0; i < nR; i++) { if (!(zs[i] <= med + 1e-6 || i === G.fi || i === ei)) continue; const a = ring[i], b = ring[(i + 1) % nR], pieces = [];
    if (i === ei) { const f = foot(ent, a, b), Lb = dist(a, b), s0 = f.t * Lb - ew / 2 - 15, s1 = f.t * Lb + ew / 2 + 15; if (s0 > 5) pieces.push([a, lerp(a, b, s0 / Lb)]); if (s1 < Lb - 5) pieces.push([lerp(a, b, s1 / Lb), b]); } else pieces.push([a, b]);
    for (const q of pieces) { const off = offsetLine(q, 6); silt += dist(...off); o.push(lineFt(V, off, lineAttr('silt', 1.2))); } }
  // stabilized construction entrance: 50 ft of crushed stone from the street at the main entrance
  const f = foot(ent, ring[ei], ring[(ei + 1) % nR]), u = unit(ring[ei], ring[(ei + 1) % nR]), inw = S.outwardOf(ring, ei).map(v => -v), A = plus(f.q, u, -ew / 2), B = plus(f.q, u, ew / 2), ce = [A, B, plus(B, inw, 50), plus(A, inw, 50)];
  o.push(filled(P(ce), 'fill="url(#gravelS)" stroke="' + INK + '" stroke-width="1.3"'));
  const cc = X(plus(f.q, inw, 25)); o.push(L.put(cc[0], cc[1] - 10, 'STABILIZED CONSTRUCTION', 7.5, { bold: true, force: true }), L.put(cc[0], cc[1] + 1, 'ENTRANCE (50\' × ' + Math.round(ew) + '\')', 7.5, { bold: true, force: true }));
  for (const i of SM.inlets) { const p = X(i.curb); o.push(circle(p[0], p[1], 9, 'fill="none" stroke="#c0392b" stroke-width="1" stroke-dasharray="3 2"'), sym('inlet', p[0], p[1], 5)); L.add([p[0] - 9, p[1] - 9, p[0] + 9, p[1] + 9]); }
  const wash = openSpot(G, plus(f.q, inw, 90), 15, 15, [ce]), stage = openSpot(G, plus(f.q, inw, 140), 80, 50, [ce].concat(wash ? [wash] : []));
  if (stage) { const c = X(lerp(stage[0], stage[2], 0.5)); o.push(filled(P(stage), 'fill="url(#hatch)" stroke="#6b4a2b" stroke-width="1.2" stroke-dasharray="6 3"'), L.put(c[0], c[1] - 6, 'STAGING / STOCKPILE', 7.5, { bold: true, force: true }), L.put(c[0], c[1] + 5, '(ASSUMED; SILT FENCE AROUND PILES)', 6.5, { force: true })); }
  if (wash) { const c = X(lerp(wash[0], wash[2], 0.5)); o.push(poly(P(wash), 'fill="#d9d9d6" stroke="' + INK + '" stroke-width="1.2"'), T(c[0], c[1], 'CW', 7, { bold: true }), L.put(c[0] + 14, c[1], 'CONCRETE WASHOUT', 7, { anchor: 'start', bold: true })); }
  if (M.pond) { const c = X(S.centroid(M.pond.o)); o.push(filled(P(M.pond.o), 'fill="url(#hatch2)" stroke="#2f6db5" stroke-width="1.2"'), L.put(c[0], c[1] - 6, 'TEMPORARY SEDIMENT BASIN', 8, { bold: true, fill: '#173a55', force: true }), L.put(c[0], c[1] + 6, '(DETENTION POND; CLEAN OUT BEFORE ACCEPTANCE)', 7, { fill: '#173a55', force: true })); }
  const down = p => { const g = [M.z([p[0] + 1, p[1]]) - M.z([p[0] - 1, p[1]]), M.z([p[0], p[1] + 1]) - M.z([p[0], p[1] - 1])], l = Math.hypot(...g); return l > 1e-6 ? [-g[0] / l, -g[1] / l] : null; }, [bx0, by0, bx1, by1] = bboxOf(ring);
  for (let x = bx0 + 70; x < bx1; x += 190) for (let y = by0 + 70; y < by1; y += 190) { const p = [x, y]; if (!inside(p, ring) || G.B.some(b => inside(p, b.o)) || G.ponds.some(q => inside(p, q.o))) continue; const d = down(p); if (d) o.push(arrow(X(p), d, 22)); }
  const dev = st.acres || ctx.m.acres, big = dev >= 5, sideHtml = legendHtml([legendLine('silt'), sw('fill="url(#gravelS)" stroke="#1b1e1f"', 'Stabilized construction entrance'), '<div class="lg2">' + svg(26, 18, circle(13, 9, 8, 'fill="none" stroke="#c0392b" stroke-dasharray="3 2"') + sym('inlet', 13, 9, 5)) + '<span>Inlet protection</span></div>',
      sw('fill="#d9d9d6" stroke="#1b1e1f"', 'Concrete washout'), sw('fill="url(#hatch)" stroke="#6b4a2b" stroke-dasharray="4 2"', 'Staging / stockpile'), sw('fill="url(#hatch2)" fill-opacity=".25" stroke="#2f6db5"', 'Sediment basin (pond)'), '<div class="lg2">' + svg(44, 12, line(2, 6, 42, 6, 'stroke="#4d5457" stroke-width="1.4" stroke-dasharray="18 6 4 6"')) + '<span>Limits of construction</span></div>', '<div class="lg2">' + svg(44, 14, arrow([22, 7], [1, 0], 30)) + '<span>Drainage (assumed)</span></div>']) +
    tbl('Erosion control quantities (schematic)', ['Item', 'Quantity'], [['Disturbed area (assumed: the developed area)', dev.toFixed(2) + ' ac'], ['Silt fence', f0(silt) + ' LF'], ['Stabilized construction entrance', '1 ea'], ['Inlet protection', SM.inlets.length + ' ea'], ['Concrete washout', '1 ea'], ['Sediment basin', M.pond ? '1 (the detention pond)' : dev >= 10 ? 'Required (10 ac or more to one outfall); location by engineer' : 'Not required under 10 ac']], [1]) +
    notes('Notes (TPDES Construction General Permit TXR150000)', ['A Stormwater Pollution Prevention Plan (SWPPP) is required: one acre or more is disturbed. ' + (big ? 'Five acres or more: the operators file a Notice of Intent (NOI) with TCEQ and post the site notice.' : 'Under five acres: post the small construction site notice; no NOI.'),
      'Install perimeter controls, the construction entrance and inlet protection before clearing; inspect every 7 days (or every 14 days and within 24 hours after 0.5 in of rain) and repair as needed.', 'Stabilize disturbed areas where work stops for 14 days or more; final stabilization is 70% uniform vegetative cover, then remove temporary controls and file the Notice of Termination.',
      'Keep sediment off public streets; sweep daily as needed. Wash out concrete trucks only in the washout.', 'The detention pond doubles as the sediment basin during construction; clean it out and restore its grades before acceptance.', 'Silt fence follows the low sides of the site shown on C-201 (assumed fall); adjust to the actual topography.']) +
    discBlocks(ctx, 'civil', 'Civil') + warn('BMP locations are placeholders; the SWPPP preparer sets them from the final grading plan.');
  return planPage(sh, V, o.join(''), sideHtml, 'Erosion & sediment control plan');
}

// ---------- L-101 landscape plan ----------
// the plant palette: native and adapted Texas plants (code, common name, botanical name, size)
const PLANTS = {
  LO: ['Live oak', 'Quercus virginiana', '3" cal., 12\' ht.'], CE: ['Cedar elm', 'Ulmus crassifolia', '3" cal., 12\' ht.'], SO: ['Shumard red oak', 'Quercus shumardii', '2" cal. (1 per lot)'], BC: ['Bald cypress', 'Taxodium distichum', '3" cal.'],
  TR: ['Texas redbud', 'Cercis canadensis var. texensis', '30 gal., 6\' ht.'], YH: ['Yaupon holly (tree form)', 'Ilex vomitoria', '30 gal., 6\' ht.'],
  DY: ['Dwarf yaupon holly', "Ilex vomitoria 'Nana'", '5 gal., 3\' o.c.'], TS: ['Texas sage', 'Leucophyllum frutescens', '5 gal., 4\' o.c.'], GM: ['Gulf muhly', 'Muhlenbergia capillaris', '1 gal., 2\' o.c.']
};
const TREE_FILL = { LO: '#cfe3bf', CE: '#d9e9c9', SO: '#e3d9b8', BC: '#c9e2d6', TR: '#ead2e2', YH: '#d7e6c4' };
function planting(G) {
  return lazy(G, 'plant', () => {
    const D = details(G), trees = [], shrubs = [], beds = [], park = G.els.filter(e => e.kind === 'parking'), parkO = park.map(e => S.outline(e));
    for (const [x, y, r] of D.trees) { const p = [x, y], code = parkO.some(o => inside(p, o) || nearOn(p, o, true).d < 12) ? 'CE' : G.ponds.some(q => nearOn(p, q.o, true).d < 40) ? 'BC' : r <= 10 && G.B.some(b => b.res && dist(b.c, p) < 60) ? 'SO' : 'LO'; trees.push({ p, r, code }); }
    const clearOf = p => inside(p, G.ring) && !isPaving(G, p) && !G.B.some(b => inside(p, b.o)) && !G.ponds.some(q => inside(p, q.o)) && !G.els.some(e => (e.kind === 'plaza' || e.kind === 'patio') && inside(p, S.shapeOf(e)));
    const F = net(G, 'storm');
    for (const b of G.B) {
      const walk = b.e.nowalk || b.res ? 0 : 8, ccw = S.signedArea(b.o) >= 0;
      if (b.res) { const t = tapOf(F, b.c), w = wallAt(b.o, t.q), seg = b.o.map((a, i) => [a, b.o[(i + 1) % b.o.length]]).sort((x, y) => foot(t.q, ...x).d - foot(t.q, ...y).d)[0], L = dist(...seg);
        for (const q of along(seg, 3, { start: L * 0.15 })) if (q.s < L * 0.55) { const p = plus(q.p, w.out, 3); if (clearOf(p)) shrubs.push({ p, code: 'DY' }); } continue; }
      b.o.forEach((a, i) => { const c = b.o[(i + 1) % b.o.length], L = dist(a, c); if (L < 16) return; const u = unit(a, c), out = ccw ? [u[1], -u[0]] : [-u[1], u[0]], mid = lerp(a, c, 0.5);
        if (!clearOf(plus(mid, out, walk + 3.5))) return; beds.push([plus(a, out, walk + 1), plus(c, out, walk + 1), plus(c, out, walk + 6), plus(a, out, walk + 6)]);
        for (const q of along([a, c], 3, { start: 3 })) if (q.s < L - 2) { const p = plus(q.p, out, walk + 3.5); if (clearOf(p)) shrubs.push({ p, code: 'DY' }); } });
      for (const v of b.o) { const p = plus(v, unit(b.c, v), walk + 14); if (clearOf(p) && !trees.some(t => dist(t.p, p) < 20)) trees.push({ p, r: 9, code: 'TR' }); }
    }
    // parking screened from the street and the property lines: a shrub row past the curb of a row near the boundary
    for (const e of park) { const o = S.outline(e), ccw = S.signedArea(o) >= 0;
      o.forEach((a, i) => { const c = o[(i + 1) % o.length], L = dist(a, c); if (L < 40) return; const u = unit(a, c), out = ccw ? [u[1], -u[0]] : [-u[1], u[0]], mid = plus(lerp(a, c, 0.5), out, 6);
        if (!clearOf(mid) || nearOn(mid, G.ring, true).d > 70) return; for (const q of along([a, c], 4, { start: 4 })) if (q.s < L - 3) { const p = plus(q.p, out, 5); if (clearOf(p)) shrubs.push({ p, code: 'TS' }); } }); }
    // the entrance: grass masses either side of the main drive
    if (G.entryLine) { const l = G.entryLine, e0 = dist(l.pts[0], G.entry) < dist(l.pts[l.pts.length - 1], G.entry) ? 0 : 1, a = e0 ? l.pts[l.pts.length - 1] : l.pts[0], u = unit(a, e0 ? l.pts[l.pts.length - 2] : l.pts[1]);
      for (const sgn of [-1, 1]) { const c = plus(plus(a, u, 25), left(u), sgn * (l.w / 2 + 14)); for (let i = 0; i < 14; i++) { const p = plus(c, [Math.cos(i * 2.4), Math.sin(i * 2.4)], 2 + Math.sqrt(i) * 2.6); if (clearOf(p)) shrubs.push({ p, code: 'GM' }); } } }
    return { trees, shrubs, beds };
  });
}
function landscapeSheet(ctx, sh) {
  const G = geo(ctx), V = view(G), P = V.P, X = V.X, k = V.k, L = placer(), o = [], Pl = planting(G), m = ctx.m;
  o.push(ground(G, V, { lawn: '#e8f1df', pave: '#f6f6f4', curb: '#a3a8a5', bAttr: 'fill="#fff" stroke="#4d5457" stroke-width="1.1"', walks: true, pondFill: '#e3eef7' }));
  for (const b of Pl.beds) o.push(poly(P(b), 'fill="#ead9bd" stroke="#b39b72" stroke-width=".6"'));
  for (const s of Pl.shrubs) { const p = X(s.p), r = Math.max(1.8, (s.code === 'GM' ? 1.2 : 1.6) * k); o.push(circle(p[0], p[1], r, 'fill="' + (s.code === 'TS' ? '#b7c4b0' : s.code === 'GM' ? '#e4c7d6' : '#8fbf74') + '" stroke="#4f7a3a" stroke-width=".5"')); }
  for (const t of Pl.trees) { const p = X(t.p), r = Math.max(4, t.r * k); o.push(circle(p[0], p[1], r, 'fill="' + (TREE_FILL[t.code] || '#cfe3bf') + '" fill-opacity=".85" stroke="#4f7a3a" stroke-width=".8"'), circle(p[0], p[1], Math.max(0.8, r * 0.12), 'fill="#4f7a3a"'));
    if (r >= 8) o.push(T(p[0], p[1] + r * 0.45, t.code, Math.min(8, r * 0.7), { halo: false, fill: '#2f4a22', bold: true })); }
  o.push(bLabels(G, V, L));
  for (const p of G.ponds) { const c = X(S.centroid(p.o)); o.push(L.put(c[0], c[1], 'DETENTION — BERMUDA SOD ON SLOPES', 8, { bold: true, fill: '#173a55' })); }
  const cnt = c => Pl.trees.filter(t => t.code === c).length + Pl.shrubs.filter(s => s.code === c).length, codes = Object.keys(PLANTS).filter(c => cnt(c) > 0);
  const bedSf = Pl.beds.reduce((s, b) => s + S.ringArea(b), 0), sod = Math.max(0, m.green * m.siteSf - bedSf), pondBank = G.ponds.reduce((s, p) => s + lenOf(p.o, true) * 20, 0);
  const parkTrees = Pl.trees.filter(t => G.els.some(e => e.kind === 'parking' && nearOn(t.p, S.outline(e), true).d < 25)).length, needPark = Math.ceil((m.stalls || 0) / 10), [fa, fb] = frontEdge(G), front = dist(fa, fb), needSt = Math.ceil(front / 40), stTrees = Pl.trees.filter(t => foot(t.p, fa, fb).d < 40).length;
  const lots = G.els.filter(e => e.kind === 'lot').length, sched = codes.map(c => [c, PLANTS[c][0] + ' — ' + PLANTS[c][1], PLANTS[c][2], f0(cnt(c))]);
  const sideHtml = legendHtml([sw('fill="#cfe3bf" stroke="#4f7a3a"', 'Canopy tree (code inside)', 'circle'), sw('fill="#ead2e2" stroke="#4f7a3a"', 'Ornamental tree', 'circle'), sw('fill="#8fbf74" stroke="#4f7a3a"', 'Shrub', 'circle'), sw('fill="#ead9bd" stroke="#b39b72"', 'Planting bed, 3" hardwood mulch'), sw('fill="#e8f1df" stroke="#a9c79a"', 'Sod: St. Augustine \'Raleigh\''), sw('fill="#e3eef7" stroke="#9db3c4"', 'Detention: Bermuda sod / seed'), legendLine('property')]) +
    tbl('Plant schedule', ['Code', 'Plant', 'Size', 'Qty'], sched.concat([['—', 'St. Augustine sod (lawns)', 'solid sod', f0(sod) + ' sf'], ...(pondBank ? [['—', 'Bermuda (Tifway 419) on pond slopes', 'sod or hydromulch', f0(pondBank) + ' sf']] : []), ['—', 'Shredded hardwood mulch', '3" deep', f0(bedSf) + ' sf']]), [3]) +
    tbl('Landscape requirements (typical; confirm)', ['Requirement', 'Required', 'Shown'], [...(m.stalls ? [['Parking: 1 tree per 10 spaces, within 25 ft of the stalls', f0(needPark), f0(parkTrees)]] : []), ['Street frontage: 1 canopy tree per 40 LF', f0(needSt), f0(stTrees)], ...(lots ? [['Homes: 1 tree per lot', f0(lots), f0(cnt('SO'))]] : []), ['Parking screened from the street (3 ft shrubs)', m.stalls ? 'Yes' : '—', cnt('TS') ? 'Shrub rows' : '—']], [1, 2]) +
    notes('Notes', ['Tree and screening requirements shown are common local rules of thumb (one tree per 10 parking spaces, one per 40 ft of frontage): confirm with the city or county ordinance and any deed restrictions.', 'Plants are native or adapted to the Texas Gulf Coast; substitutions of equal size and character with the landscape architect\'s approval.',
      'Trees at least 3 in caliper (canopy) unless noted; stake only where needed and remove stakes after one year.', 'Automatic irrigation (drip in beds, spray or rotor in sod) with a rain sensor and backflow preventer, designed by a licensed irrigator (TCEQ).',
      'Keep trees 10 ft from utility lines and structures, 5 ft from hydrants and FDCs, and clear of sight triangles at drives.', 'Existing trees to remain are not known (no tree survey); protect any kept with fencing at the drip line (L-501).']) +
    discBlocks(ctx, 'landscape', 'Landscape', true) + warn('Plant locations are placed by rule from the plan; the landscape architect lays out the final plan.');
  return planPage(sh, V, o.join(''), sideHtml, 'Landscape plan');
}

// ---------- E-101 site lighting ----------
// pole lights along drives and parking about every 110 ft, alternating sides (homes' streets: utility street lights
// about every 250 ft), pushed out of stalls to the head of the row; wall packs on walls that face paving
function lights(G) {
  return lazy(G, 'lights', () => {
    const poles = [], packs = [], park = G.els.filter(e => e.kind === 'parking'), res = G.res;
    for (const l of G.lines) { const sp = res ? 250 : 110, pts = along(l.pts, sp, { start: res ? 60 : Math.min(30, lenOf(l.pts) / 2) });
      pts.forEach((q, i) => { const s = res ? 1 : i % 2 ? 1 : -1, nn = left(q.u); let p = plus(q.p, nn, s * (l.w / 2 + 3)), type = res ? 'SL' : 'SA';
        for (let g = 0; g < 9 && park.some(e => S.hitRect(e, p)); g++) p = plus(p, nn, s * 3);
        if (park.some(e => S.hitRect(e, p))) return; if (!res && park.some(e => nearOn(p, S.outline(e), true).d < 4)) type = l.aisle ? 'SB' : 'SA';
        if (!inside(p, G.ring) || nearOn(p, G.ring, true).d < 3 || G.B.some(b => inside(p, b.o) || nearOn(p, b.o, true).d < 6) || G.ponds.some(q2 => inside(p, q2.o))) return;
        if (poles.some(o => dist(o.p, p) < (res ? 120 : 45))) return; poles.push({ p, type }); }); }
    for (const b of G.B.filter(b => !b.res)) { const ccw = S.signedArea(b.o) >= 0;
      b.o.forEach((a, i) => { const c = b.o[(i + 1) % b.o.length], L = dist(a, c); if (L < 24) return; const u = unit(a, c), out = ccw ? [u[1], -u[0]] : [-u[1], u[0]];
        if (![20, 35, 50].some(d => isPaving(G, plus(lerp(a, c, 0.5), out, d)))) return; for (const q of along([a, c], 50, { start: Math.min(25, L / 2) })) packs.push({ p: plus(q.p, out, 1.5), out }); }); }
    return { poles, packs };
  });
}
const FIXTURES = { SA: ['Pole light, single head', '30\' pole on 3\' base (25\' + base)', 'LED ~150 W, 4000 K, Type III/IV, full cutoff'], SB: ['Pole light, twin head (back to back)', '30\' pole on 3\' base', '2 × LED ~150 W, 4000 K, Type V/IV, full cutoff'],
  SL: ['Street light (by electric utility)', '25–30\' utility pole', 'LED cobra head, utility standard'], WP: ['Wall pack', '14\' above finished floor', 'LED ~40 W, 4000 K, full cutoff']};
function lightingSheet(ctx, sh) {
  const G = geo(ctx), V = view(G), X = V.X, k = V.k, L = placer(), o = [], Lt = lights(G);
  o.push(ground(G, V, { pave: '#f2f2f0', bAttr: 'fill="#fff" stroke="#4d5457" stroke-width="1.1"' }));
  for (const p of Lt.poles) { const c = X(p.p); o.push(circle(c[0], c[1], (p.type === 'SL' ? 70 : 55) * k, 'fill="#f4d35e" fill-opacity=".14" stroke="#e0b93a" stroke-width=".5" stroke-dasharray="3 3"')); }
  for (const p of Lt.poles) { const c = X(p.p); o.push(sym('pole', c[0], c[1], 7)); if (p.type === 'SB') o.push(circle(c[0] - 7, c[1] + 4.9, 1.75, 'fill="none" stroke="' + INK + '" stroke-width="1"')); o.push(L.put(c[0] - 9, c[1] + 2, p.type, 6.5, { anchor: 'end', bold: true })); }
  for (const w of Lt.packs) { const c = X(w.p); o.push('<g transform="rotate(' + n(-Math.atan2(w.out[1], w.out[0]) * 180 / Math.PI + 90) + ' ' + n(c[0]) + ' ' + n(c[1]) + ')">' + sym('wallpack', c[0], c[1], 5) + '</g>'); }
  o.push(bLabels(G, V, L));
  const count = t => t === 'WP' ? Lt.packs.length : Lt.poles.filter(p => p.type === t).length, types = Object.keys(FIXTURES).filter(t => count(t));
  const sideHtml = legendHtml([legendSym('pole'), legendSym('wallpack'), sw('fill="#f4d35e" fill-opacity=".14" stroke="#e0b93a" stroke-dasharray="3 2"', 'Approx. light pool (illustrative, not photometric)', 'circle'), legendLine('property')]) +
    tbl('Fixture schedule', ['Type', 'Description', 'Mounting', 'Lamp', 'Qty'], types.map(t => [t, ...FIXTURES[t], String(count(t))]), [4]) +
    notes('Notes', ['Site lighting is placed by rule (poles about every 110 ft along drives and parking, alternating sides); the electrical engineer lays out the final plan from a photometric study by the fixture supplier.', 'Exterior lighting power within the energy code\'s limits (IECC as adopted; ASHRAE 90.1 alternative).',
      'Dark sky: full cutoff fixtures only, no uplight; light at the property line limited per the local ordinance (typically 0.5 fc or less next to homes).', 'Target levels (typical): parking 1 fc average, 0.2 fc minimum; entrances and building fronts 2–5 fc; uniformity 15:1 max to min or better.',
      'Controls: photocell on, time clock off after hours with security lighting left on; poles fed underground from the building\'s house panel in Schedule 40 PVC.', 'Concrete pole bases 24 in dia. × 8 ft (typical, per the geotechnical report and wind load); bases in parking raised 30 in or protected.', ...(G.res ? ['Streets: street lights by the electric utility\'s standard, about every 250 ft and at every intersection and curve.'] : [])]) +
    discBlocks(ctx, 'electrical', 'Electrical', true) + warn('Fixture locations and counts are a schematic layout for pricing; photometrics by others.');
  return planPage(sh, V, o.join(''), sideHtml, 'Site lighting plan');
}

// ---------- FP-101 fire access and hydrants ----------
function fireSheet(ctx, sh) {
  const G = geo(ctx), V = view(G), P = V.P, X = V.X, k = V.k, L = placer(), o = [], FL = G.lines.filter(l => l.w >= 20), F = net(G, 'fire'), H = hydrants(G), m = ctx.m;
  o.push(ground(G, V, { pave: '#f2f2f0', bAttr: 'fill="#fff" stroke="#4d5457" stroke-width="1.1"' }));
  for (const l of FL) o.push(poly(P(S.band(l.pts, l.w)), 'fill="#c0392b" fill-opacity=".14" stroke="none"'), lineFt(V, l.pts, lineAttr('firelane', 0.6)));
  for (const l of FL) { const Ln = lenOf(l.pts); if (Ln < 100) continue; const q = pointAt(l.pts, Ln / 2), c = X(plus(q.p, left(q.u), l.w / 4)); o.push(L.put(c[0], c[1], 'FIRE LANE ' + Math.round(l.w) + "'", 7, { rot: angOf(q.u), bold: true, fill: '#c0392b' })); }
  // the 150 ft check (IFC 503.1.1): every point of each building's outside walls within 150 ft of a fire lane; a straight-
  // line measure to the lane's edge, so it is generous where a wall sits behind another building
  const reach = p => Math.min(Infinity, ...FL.map(l => nearOn(p, l.pts).d - l.w / 2)), rows = [];
  for (const b of G.B) { const sm = along(b.o, 8, { closed: true, start: 0 }), far = sm.map(q => reach(q.p) > 150); let run = [];
    sm.forEach((q, i) => { if (far[i]) run.push(q.p); if ((!far[i] || i === sm.length - 1) && run.length) { if (run.length > 1) o.push(lineFt(V, run, 'fill="none" stroke="#c0392b" stroke-width="5" stroke-linecap="round" opacity=".85"')); run = []; } });
    const pct = sm.length ? 100 * (1 - far.filter(Boolean).length / sm.length) : 100; b.reach = pct; if (pct < 100) { const c = X(b.c); o.push(L.put(c[0], c[1] - 12, 'PART > 150\' FROM FIRE LANE', 7, { bold: true, fill: '#c0392b', force: true })); }
    if (!G.res || rows.length < 14) rows.push([b.e.name || 'Building', b.spr ? 'Yes' : 'No', Math.round((b.e.floors || 1) * (S.USES[b.use]?.floorH || 12)) + "'", Math.round(pct) + '%']); }
  // dead ends: a fire lane end not at the street, more than 150 ft past the last junction, needs a turnaround (D103.4)
  const deg = v => v.adj.length, dead = [];
  for (const v of F.nodes) { if (deg(v) !== 1 || nearOn(v.p, G.ring, true).d < 45 || F.nodes.length < 2) continue; let prev = null, cur = v, len = 0, guard = 0;
    while (deg(cur) <= 2 && guard++ < 500) { const nx = cur.adj.find(a => a.v !== prev); if (!nx) break; len += nx.d; prev = cur; cur = nx.v; if (deg(cur) === 1) { len = nearOn(cur.p, G.ring, true).d < 45 ? -1 : len; break; } }
    if (len > 150) dead.push({ p: v.p, len }); }
  for (const d of dead) { const c = X(d.p); o.push(circle(c[0], c[1], 11, 'fill="#fff" stroke="#c0392b" stroke-width="2"'), T(c[0], c[1], '!', 11, { bold: true, fill: '#c0392b', halo: false }), L.put(c[0] + 14, c[1] - 10, 'DEAD END ±' + f0(d.len) + "' > 150' — TURNAROUND REQ'D (IFC D103.4)", 7, { anchor: 'start', bold: true, fill: '#c0392b', force: true })); }
  // hydrants and FDCs, each FDC tied to its nearest hydrant
  for (const f of fdcs(G)) { const h = H.reduce((m2, p) => dist(p, f.p) < dist(m2, f.p) ? p : m2, H[0]); if (!h) continue; const a = X(f.p), b = X(h); o.push(line(a[0], a[1], b[0], b[1], 'stroke="#c0392b" stroke-width=".8" stroke-dasharray="4 3"'), L.put((a[0] + b[0]) / 2 + 6, (a[1] + b[1]) / 2 - 6, f0(dist(f.p, h)) + "'", 7, { anchor: 'start', fill: '#c0392b', bold: true })); }
  o.push(hydSvg(G, V), fdcSvg(G, V), bLabels(G, V, L));
  const ents = S.entrancesOf(G.els).length, units = m.units || 0, gfaMax = Math.max(0, ...G.B.map(b => S.gfaOf(b.e))), tall = m.heightFt > 30;
  const need2 = G.res ? units > 30 : G.B.some(b => b.use === 'multifamily') ? units > 100 : gfaMax > 124000 || tall, nn = H.map(h => Math.min(Infinity, ...H.filter(q => q !== h).map(q => dist(q, h)))).filter(Number.isFinite), maxNN = nn.length ? Math.max(...nn) : 0;
  const fdcOk = fdcs(G).filter(f => H.some(h => dist(h, f.p) <= 100)).length;
  const sideHtml = legendHtml([sw('fill="#c0392b" fill-opacity=".14" stroke="#c0392b"', 'Fire apparatus access road (≥ 20 ft)'), legendLine('firelane'), legendSym('hydrant'), legendSym('fdc'), '<div class="lg2">' + svg(44, 12, line(4, 6, 40, 6, 'stroke="#c0392b" stroke-width="5" stroke-linecap="round" opacity=".85"')) + '<span>Wall more than 150 ft from a fire lane</span></div>',
      '<div class="lg2">' + svg(26, 26, circle(13, 13, 10, 'fill="#fff" stroke="#c0392b" stroke-width="2"') + T(13, 13, '!', 10, { bold: true, fill: '#c0392b', halo: false })) + '<span>Dead end needing a turnaround</span></div>']) +
    tbl('Fire access check (schematic)', ['Item', 'Plan', 'Rule'], [['Fire lanes 20 ft or wider', f0(FL.reduce((s, l) => s + lenOf(l.pts), 0)) + ' LF', 'IFC 503.2.1'], ['Access points from the street', String(ents), need2 ? '2 required (IFC D104 / D106 / D107)' : '1 allowed'], ['Dead ends over 150 ft', String(dead.length), 'Turnaround (D103.4)'],
      ['Fire hydrants', String(H.length), 'Spacing ≤ 500 ft'], ['Largest gap to the nearest hydrant', maxNN ? f0(maxNN) + ' ft' : '—', '≤ 500 ft'], ['FDCs with a hydrant within 100 ft', fdcs(G).length ? fdcOk + ' of ' + fdcs(G).length : '—', 'IFC 912 / local'], ['Tallest building', f0(m.heightFt) + ' ft', tall ? 'Aerial access road (D105)' : 'Under 30 ft']], [1]) +
    tbl('Buildings', ['Building', 'Sprinklered', 'Height (est.)', 'Walls within 150\''], rows, [2, 3]) +
    notes('Notes (IFC Appendix D and Chapter 5, as adopted)', ['Fire apparatus access roads: 20 ft clear width minimum (26 ft beside a hydrant, D103.1), 13 ft 6 in clear height, all-weather surface for 75,000 lb (D102.1), grade 10% max.', 'Every part of each building\'s first-floor exterior walls within 150 ft of an access road by an approved route (503.1.1); 150 ft is checked here in a straight line, so confirm the hose path.',
      'Dead ends over 150 ft need an approved turnaround (96 ft cul-de-sac or hammerhead, D103.4); inside turning radius per the fire code official (commonly 25 to 30 ft).', 'Mark fire lanes "FIRE LANE — NO PARKING" with red curbs or signs (D103.6).',
      tall ? 'Buildings over 30 ft: an aerial apparatus access road 26 ft wide, 15 to 30 ft from one long side (D105).' : 'No building is over 30 ft, so no aerial access road is needed (D105).', 'Hydrants and FDCs per the water provider and fire marshal; FDCs on the fire lane side, within 100 ft of a hydrant (typical local rule).', ...(G.res ? ['One- and two-family subdivisions over 30 homes need two separate access roads (D107.1).'] : [])]) +
    discBlocks(ctx, 'fire', 'Fire protection', true) + warn('Access, reach and hydrant checks are drawn by code from the plan; the fire marshal\'s review governs.');
  return planPage(sh, V, o.join(''), sideHtml, 'Fire access & hydrant plan');
}

// ---------- T-101 site fiber backbone ----------
function fiberSheet(ctx, sh) {
  const G = geo(ctx), V = view(G, 70), X = V.X, L = placer(), o = [], F = net(G, 'fiber'), [fa, fb] = entryEdge(G), nn = S.outwardOf(G.ring, G.entryEdge), many = G.B.length > 30;
  o.push(ground(G, V, { pave: '#f2f2f0', bAttr: 'fill="#fff" stroke="#4d5457" stroke-width="1.1"' }));
  const f = foot(G.entry, fa, fb), wE = G.entryLine?.w || 26, mpoe = plus(plus(f.q, nn, -12), unit(fa, fb), -(wE / 2 + 14)), taps = G.B.map(b => ({ ...tapOf(F, b.c), bl: b, load: 1 })), tree = treeOf(F, taps), hh = structuresOn(tree, 450);
  const prov = publicMain(G, 20), cp = foot(mpoe, ...prov).q;
  o.push(lineFt(V, prov, 'fill="none" stroke="#7b3fa0" stroke-width="1.2" stroke-dasharray="2 4" opacity=".7"'), lineFt(V, [cp, mpoe], lineAttr('fiber')), lineFt(V, [mpoe, F.root.p], lineAttr('fiber')), segsPath(V, tree.segs, lineAttr('fiber')));
  const pm = X(lerp(prov[0], prov[1], 0.7)); o.push(L.put(pm[0], pm[1] + 9, 'PROVIDER FIBER IN R.O.W. (ASSUMED; PROVIDER TBD)', 7.5, { rot: angOf(unit(fa, fb)), bold: true, fill: '#7b3fa0', force: true }));
  for (const t of taps) { const w = wallAt(t.bl.o, t.q), p = X(w.p); o.push(lineFt(V, [t.q, w.p], lineAttr('fiber', 0.6))); if (!t.bl.res) o.push(sym('ont', p[0], p[1], 6)); }
  for (const q of hh) { const p = X(q); o.push(sym('handhole', p[0], p[1], 7)); L.add([p[0] - 6, p[1] - 5, p[0] + 6, p[1] + 5]); }
  const mp = X(mpoe); o.push(rect(mp[0] - 12, mp[1] - 8, 24, 16, 'fill="#fff" stroke="#7b3fa0" stroke-width="1.6"'), T(mp[0], mp[1], 'MPOE', 6.5, { bold: true, fill: '#7b3fa0', halo: false }), L.put(mp[0] - 16, mp[1] - 16, 'MPOE / DEMARC PEDESTAL & HANDHOLE', 7.5, { anchor: 'end', bold: true, force: true }));
  o.push(bLabels(G, V, L));
  const len = tree.segs.reduce((s, q) => s + dist(q.a, q.b), 0) + dist(mpoe, F.root.p) + dist(cp, mpoe), drops = taps.reduce((s, t) => s + dist(t.q, wallAt(t.bl.o, t.q).p), 0);
  const sideHtml = legendHtml([legendLine('fiber'), legendSym('handhole'), legendSym('ont'), sw('fill="#fff" stroke="#7b3fa0"', 'MPOE (main point of entry)'), legendLine('property')]) +
    tbl('Fiber backbone (schematic)', ['Item', 'Quantity'], [['Backbone duct bank: 2 × 2" HDPE with pull tape', f0(len) + ' LF'], ['Building / lot drops: 1 × 1.25" HDPE', f0(drops) + ' LF'], ['Handholes (17" × 30" Tier 22, typical)', hh.length + ' ea'], [many ? 'Homes / lots served' : 'Buildings served', String(G.B.length)], ['MPOE pedestal', '1 ea']], [1]) +
    notes('Notes', ['Fiber provider not selected; the provider confirms where its fiber meets the site, the MPOE and the duct sizes.', 'Backbone: two 2 in HDPE ducts (one spare) with pull tape and tracer wire, 36 in cover (24 in minimum under landscape), along the drives as shown.',
      'Handholes at junctions, at bends over 30° and about every 450 ft; no more than 360° of bends between pull points.', many ? 'Each home gets a 1.25 in drop from the nearest handhole to the side of the house (a flush-mount NID by the provider).' : 'Each building gets a duct from the backbone to its telecom room (ONT / demarc); a 4 in sleeve under paving.',
      'Keep 12 in from power and 5 ft from other utilities where crossing; joint trench with power only if the electric utility allows.', 'Locations are schematic; the telecom designer and the provider finalise routes.']) +
    discBlocks(ctx, 'telecom', 'Telecom', true) + warn('Conduit routes and handholes are a schematic layout for pricing and coordination.');
  return planPage(sh, V, o.join(''), sideHtml, 'Site fiber backbone plan');
}

// ---------- details (C-501, L-501): standard drawings, not to scale ----------
// a label with a leader from the thing (x, y) to the text (tx, ty); lines split on \n
let DW = 600, DH = 500; // the detail being drawn: labels are kept inside it
function lead(x, y, tx, ty, s, size = 10.5) {
  const right = tx >= x, a = right ? 'start' : 'end', lines = String(s).split('\n'), wm = Math.max(...lines.map(t => String(t).length * size * 0.66)) + 10;
  if (right && tx + wm > DW - 4) tx = Math.max(x + 8, DW - 4 - wm); if (!right && tx - wm < 4) tx = Math.min(x - 8, 4 + wm);
  ty = Math.max(size * lines.length * 0.6 + 4, Math.min(DH - size * lines.length * 0.6 - 4, ty)); const sx = tx + (right ? 4 : -4);
  return circle(x, y, 2, 'fill="' + INK + '"') + line(x, y, tx, ty, 'stroke="' + INK + '" stroke-width=".8"') + line(tx, ty, sx, ty, 'stroke="' + INK + '" stroke-width=".8"') + lines.map((t, i) => T(sx + (right ? 3 : -3), ty + (i - (lines.length - 1) / 2) * size * 1.2, t, size, { anchor: a, halo: false })).join('');
}
const lab = (x, y, s, size = 10.5, o = {}) => String(s).split('\n').map((t, i, a) => { const w = tw(t, size) / 2 + 4; return T(o.rot ? x : Math.max(w, Math.min(DW - w, x)), y + (i - (a.length - 1) / 2) * size * 1.2, t, size, { halo: false, ...o }); }).join('');
const zig = (x, y0, y1) => { let d = 'M' + n(x) + ' ' + n(y0); const k = 6; for (let i = 1; i <= k; i++) d += 'L' + n(x + (i % 2 ? 6 : -6)) + ' ' + n(y0 + (y1 - y0) * i / k); return path(d, 'fill="none" stroke="' + INK + '" stroke-width=".8"'); };
const box = (x, y, w, h, a) => filled(rectPts(x, y, w, h), a);
const D = {
  pavement(W, H) { const x0 = 70, x1 = W - 70, y0 = 230, t1 = 63, t2 = 72, o = [];
    o.push(box(x0, y0 + t1 + t2, x1 - x0, 110, 'fill="url(#earth)" stroke="none" opacity=".6"'), box(x0, y0 + t1, x1 - x0, t2, 'fill="#e9e3d6" stroke="' + INK + '" stroke-width="1"'), box(x0, y0 + t1, x1 - x0, t2, 'fill="url(#earth)" stroke="none" opacity=".5"'), box(x0, y0, x1 - x0, t1, 'fill="#fff" stroke="' + INK + '" stroke-width="1.8"'), box(x0, y0, x1 - x0, t1, 'fill="url(#conc)" stroke="none"'));
    for (let x = x0 + 24; x < x1; x += 34) o.push(circle(x, y0 + t1 / 2 + 6, 3.2, 'fill="' + INK + '"'));
    o.push(path('M' + n(W / 2 - 6) + ' ' + n(y0) + 'L' + n(W / 2) + ' ' + n(y0 + 18) + 'L' + n(W / 2 + 6) + ' ' + n(y0), 'fill="#fff" stroke="' + INK + '" stroke-width="1"'), zig(x0, y0, y0 + t1 + t2 + 110), zig(x1, y0, y0 + t1 + t2 + 110));
    o.push(dim(x0 - 26, y0, x0 - 26, y0 + t1, '7"', 0, 10), dim(x0 - 26, y0 + t1, x0 - 26, y0 + t1 + t2, '8"', 0, 10));
    o.push(lead(x0 + 90, y0 + 14, x0 + 20, 110, '7" REINFORCED CONCRETE — HEAVY DUTY (DRIVES, FIRE LANES)\n5" — STANDARD DUTY (PARKING STALLS)\nTYPICAL; THE GEOTECHNICAL REPORT GOVERNS'), lead(W / 2, y0 + 4, W / 2 + 40, 40, 'SAWCUT CONTRACTION JOINT, 1/4 SLAB DEPTH,\n15\' MAX. EACH WAY; SEAL'), lead(x1 - 110, y0 + t1 / 2 + 6, x1 - 150, 175, '#4 BARS @ 18" O.C.E.W. ON CHAIRS (TYP.)'),
      lead(x0 + 160, y0 + t1 + t2 / 2, x0 + 60, H - 50, '8" LIME- OR CEMENT-STABILIZED SUBGRADE,\n95% STD. PROCTOR, PER GEOTECHNICAL REPORT'), lead(x1 - 140, y0 + t1 + t2 + 60, x1 - 260, H - 30, 'COMPACTED SUBGRADE, PROOF-ROLLED'));
    return o.join(''); },
  curb(W, H) { const u = 11, gx = 90, cx = W * 0.55, py = 250, sd = 7 * u, o = [];
    o.push(box(gx - 30, py + sd, cx + 8 * u - gx + 90, 8 * u, 'fill="url(#earth)" stroke="none" opacity=".55"'), box(cx + 7 * u, py - 5 * u, W - 40 - cx - 7 * u, sd + 5 * u, 'fill="url(#earth)" stroke="none"'), line(cx + 7 * u, py - 5 * u, W - 40, py - 6 * u, 'stroke="' + INK + '" stroke-width="1.2"'));
    const pr = [[gx - 30, py], [cx, py], [cx + u, py - 6 * u], [cx + 7 * u, py - 6 * u], [cx + 7 * u, py + sd], [gx - 30, py + sd]];
    o.push(filled(pr, 'fill="url(#conc)" stroke="' + INK + '" stroke-width="1.8"'), circle(cx + 4 * u, py - u, 3.2, 'fill="' + INK + '"'), circle(cx + 4 * u, py + 3 * u, 3.2, 'fill="' + INK + '"'), zig(gx - 30, py, py + sd + 8 * u));
    o.push(dim(cx + 7 * u + 26, py - 6 * u, cx + 7 * u + 26, py, '6"', 0, 10), dim(cx + u, py - 6 * u - 22, cx + 7 * u, py - 6 * u - 22, '6"', 0, 10), dim(gx + 40, py + sd + 30, gx + 40, py, '7"', 0, 10));
    o.push(lead(cx + 0.5 * u, py - 3 * u, cx - 150, py - 120, '1" BATTER, 1" RADII (TYP.)'), lead(cx + 4 * u, py - u, cx + 120, py - 150, 'MONOLITHIC 6" CURB WITH THE SLAB;\n#4 BAR CONTINUOUS IN CURB (TYP.)'), lead(W - 90, py - 5.5 * u, W - 160, py + 170, 'TOPSOIL BACKFILL TO TOP OF CURB,\nSLOPE 2% TO THE CURB'),
      lead(gx + 110, py + sd / 2, gx + 40, H - 50, 'PAVEMENT PER DETAIL 1; EXPANSION JOINT 3/4" AT 60\' MAX.\nAND AT STRUCTURES; CONTRACTION JOINTS AT 15\' MAX.'), lead(cx + 5 * u, py + sd + 30, cx + 80, H - 120, 'STABILIZED SUBGRADE 12" BEYOND\nBACK OF CURB'));
    return o.join(''); },
  ramp(W, H) { const s = 24, cx = W / 2, yc = H - 120, y1 = yc - 6 * s, y2 = y1 - 5 * s, hw = 2.5 * s, o = [];
    o.push(box(30, yc, W - 60, 90, 'fill="#e2e3e1" stroke="none"'), box(30, y2 - 30, W - 60, y1 - y2 + 30, 'fill="#f6f6f4" stroke="#9fa3a1" stroke-width=".8"'), box(30, y1, W - 60, yc - y1, 'fill="#e8f1df" stroke="none"'));
    for (const sg of [-1, 1]) o.push(poly([[cx + sg * hw, y1], [cx + sg * hw, yc], [cx + sg * (hw + 5 * s), yc]], 'fill="#fff" stroke="' + INK + '" stroke-width="1.2"'));
    o.push(box(cx - hw, y1, 2 * hw, yc - y1, 'fill="#fff" stroke="' + INK + '" stroke-width="1.4"'), box(cx - hw + 3, yc - 2 * s, 2 * hw - 6, 2 * s - 3, 'fill="url(#domes)" stroke="#8a6d1f" stroke-width=".8"'), box(cx - hw, y2, 2 * hw, y1 - y2, 'fill="none" stroke="' + INK + '" stroke-width="1" stroke-dasharray="6 4"'), line(30, yc, W - 30, yc, 'stroke="' + INK + '" stroke-width="2.4"'));
    o.push(arrow([cx, (y1 + yc) / 2 - 20], [0, -1], 50, 'stroke="' + INK + '" stroke-width="1.2"'), lab(cx, (y1 + yc) / 2 + 22, '1:12 MAX.', 10, { bold: true }), lab(cx, (y2 + y1) / 2, '5\'×5\' LANDING\n2% MAX. EACH WAY', 9.5), lab(W / 2, yc + 45, 'STREET / DRIVE', 11, { bold: true }), lab(110, (y2 + y1) / 2 - 10, 'SIDEWALK', 10));
    o.push(dim(cx - hw, y2 - 50, cx + hw, y2 - 50, "5'-0\" (4'-0\" MIN.)", 0, 10), dim(cx + hw + 5 * s + 30, y1, cx + hw + 5 * s + 30, yc, "6'-0\" (6\" CURB)", -14, 10));
    o.push(lead(cx - hw - 2 * s, yc - 1.2 * s, 70, yc - 3 * s, 'FLARED SIDE\n1:10 MAX.'), lead(cx + hw - 10, yc - s, cx + hw + 3 * s, y1 - 60, '24" DETECTABLE WARNING SURFACE\n(TRUNCATED DOMES), FULL RAMP WIDTH'), lead(cx + hw + 4 * s, yc, W - 160, yc + 60, '6" CURB'));
    o.push(lab(W / 2, 30, 'PER 2012 TAS (TDLR); TxDOT PED STANDARDS IN THE R.O.W.', 10));
    return o.join(''); },
  stalls(W, H) { const s = 11, w = 9 * s, vw = 11 * s, aw = 5 * s, tot = 3 * w + vw + aw, x0 = (W - tot) / 2, y0 = 120, d = 18 * s, o = [], bl = '#2f6db5';
    o.push(box(x0 - 20, y0, tot + 40, d + 120, 'fill="#ececea" stroke="none"'), box(x0 - 20, y0 - 30, tot + 40, 30, 'fill="#e8f1df" stroke="none"'), line(x0 - 20, y0, x0 + tot + 20, y0, 'stroke="' + INK + '" stroke-width="2"'));
    for (let i = 0; i <= 3; i++) o.push(line(x0 + i * w, y0, x0 + i * w, y0 + d, 'stroke="' + INK + '" stroke-width="3"'));
    const vx = x0 + 3 * w; o.push(line(vx + vw, y0, vx + vw, y0 + d, 'stroke="' + bl + '" stroke-width="3"'), line(vx + vw + aw, y0, vx + vw + aw, y0 + d, 'stroke="' + bl + '" stroke-width="3"'));
    for (let t = 0; t < d; t += 22) o.push(line(vx + vw, y0 + t, vx + vw + aw, Math.min(y0 + d, y0 + t + aw), 'stroke="' + bl + '" stroke-width="1.5"'));
    o.push(box(vx + vw / 2 - 20, y0 + d / 2 - 20, 40, 40, 'fill="' + bl + '" stroke="none"'), lab(vx + vw / 2, y0 + d / 2, 'ISA', 11, { fill: '#fff', bold: true }), lab(vx + vw + aw / 2, y0 + d / 2, 'NO PARKING', 9, { rot: -90, bold: true, fill: bl }), circle(vx + vw / 2, y0 - 12, 4, 'fill="' + INK + '"'));
    o.push(dim(x0, y0 + d + 24, x0 + w, y0 + d + 24, "9'-0\"", 0, 10), dim(vx, y0 + d + 24, vx + vw, y0 + d + 24, "11'-0\"", 0, 10), dim(vx + vw, y0 + d + 24, vx + vw + aw, y0 + d + 24, "5'-0\"", 0, 10), dim(x0 - 34, y0, x0 - 34, y0 + d, "18'-0\"", 0, 10));
    o.push(lead(x0 + w, y0 + 50, x0 - 10, 50, '4" WHITE STRIPES, 2 COATS TRAFFIC PAINT (TYP.)'), lead(vx + vw / 2, y0 - 12, vx + 40, 30, 'SIGN R7-8 + "VAN ACCESSIBLE", 60" MIN. TO BOTTOM'), lead(vx + vw + aw / 2, y0 + d - 20, x0 + tot - 40, H - 30, 'ACCESS AISLE, BLUE 4" HATCH @ 2\' O.C.; 8\' AISLE\nWITH AN 8\' STALL IS THE ALTERNATIVE VAN LAYOUT'), lead(x0 + w * 1.5, y0 + d + 60, x0 + 30, H - 70, '24\'-0" TWO-WAY DRIVE AISLE'));
    return o.join(''); },
  dumpster(W, H) { const s = 15, iw = 12 * s, t = 10, x0 = W / 2 - iw / 2, y0 = 110, o = [];
    o.push(box(x0 - t, y0 + iw, iw + 2 * t, 10 * s, 'fill="url(#conc)" stroke="#6b7174" stroke-width="1"'), box(x0, y0, iw, iw, 'fill="url(#conc)" stroke="none"'));
    for (const r of [[x0 - t, y0 - t, t, iw + t], [x0 + iw, y0 - t, t, iw + t], [x0 - t, y0 - t, iw + 2 * t, t]]) o.push(box(...r, 'fill="#d9d4ca" stroke="' + INK + '" stroke-width="1.4"'), box(...r, 'fill="url(#brick)" stroke="none"'));
    o.push(box(x0 + 2 * s, y0 + 1.5 * s, 8 * s, 6 * s, 'fill="none" stroke="#6b7174" stroke-width="1" stroke-dasharray="6 4"'), lab(x0 + iw / 2, y0 + 4.5 * s, '8 YD CONTAINER\n(BY HAULER)', 9.5));
    for (const p of [[x0 + 12, y0 + 12], [x0 + iw - 12, y0 + 12], [x0 + 12, y0 + iw - 12], [x0 + iw - 12, y0 + iw - 12]]) o.push(circle(p[0], p[1], 6, 'fill="#fff" stroke="' + INK + '" stroke-width="1.6"'));
    o.push(line(x0, y0 + iw, x0 + iw / 2 - 2, y0 + iw, 'stroke="' + INK + '" stroke-width="3"'), line(x0 + iw / 2 + 2, y0 + iw, x0 + iw, y0 + iw, 'stroke="' + INK + '" stroke-width="3"'), path('M' + n(x0 + iw / 2) + ' ' + n(y0 + iw) + 'A' + n(iw / 2) + ' ' + n(iw / 2) + ' 0 0 0 ' + n(x0) + ' ' + n(y0 + iw * 1.5), 'fill="none" stroke="' + INK + '" stroke-width=".8" stroke-dasharray="5 4"'), path('M' + n(x0 + iw / 2) + ' ' + n(y0 + iw) + 'A' + n(iw / 2) + ' ' + n(iw / 2) + ' 0 0 1 ' + n(x0 + iw) + ' ' + n(y0 + iw * 1.5), 'fill="none" stroke="' + INK + '" stroke-width=".8" stroke-dasharray="5 4"'));
    o.push(dim(x0, y0 - t - 26, x0 + iw, y0 - t - 26, "12'-0\" CLEAR (24'-0\" DOUBLE)", 0, 10), dim(x0 + iw + t + 26, y0, x0 + iw + t + 26, y0 + iw, "12'-0\"", 0, 10), dim(x0 - t - 26, y0 + iw, x0 - t - 26, y0 + iw + 10 * s, "10'-0\" APRON", 0, 10));
    o.push(lead(x0 - t / 2, y0 + iw * 0.4, 40, y0 + 20, '8\'-0" HIGH 8" CMU SCREEN WALL,\nGROUTED, FINISH TO MATCH BUILDING'), lead(x0 + iw * 0.25, y0 + iw, 40, y0 + iw + 3 * s, 'STEEL FRAME GATES WITH METAL PANELS,\nCANE BOLTS AND HOLD-OPENS'), lead(x0 + iw - 12, y0 + 12, W - 30, y0 + 40, '6" CONCRETE-FILLED STEEL\nBOLLARDS (TYP.)'), lead(x0 + iw * 0.7, y0 + iw + 7 * s, W - 30, H - 40, '8" REINFORCED CONCRETE PAD AND APRON\n(#4 @ 12" O.C.E.W.)'));
    return o.join(''); },
  silt(W, H) { const s = 5, gy = 360, px = W / 2 + 40, o = [];
    o.push(box(40, gy, W - 80, 150, 'fill="url(#earth)" stroke="none" opacity=".6"'), line(40, gy, W - 40, gy, 'stroke="' + INK + '" stroke-width="1.6"'), box(px - 36, gy, 32, 32, 'fill="#e9e3d6" stroke="' + INK + '" stroke-width=".8" stroke-dasharray="3 2"'), box(px - 1, gy - 36 * s, 9, 54 * s, 'fill="#8a6d4a" stroke="' + INK + '" stroke-width="1"'));
    o.push(path('M' + n(px - 3) + ' ' + n(gy - 30 * s) + 'V' + n(gy + 30) + 'H' + n(px - 34) + 'V' + n(gy + 8), 'fill="none" stroke="#2f6db5" stroke-width="3"'), path('M' + n(px - 160) + ' ' + n(gy) + 'Q' + n(px - 80) + ' ' + n(gy - 30) + ' ' + n(px - 5) + ' ' + n(gy - 40), 'fill="none" stroke="#8a6d4a" stroke-width="1" stroke-dasharray="4 3"'), arrow([px - 200, gy - 60], [1, 0], 90, 'stroke="' + INK + '" stroke-width="1.4"'), lab(px - 200, gy - 80, 'FLOW', 11, { bold: true }));
    o.push(dim(px + 50, gy - 30 * s, px + 50, gy, '24" MIN.', -14, 10), dim(px + 50, gy, px + 50, gy + 18 * s, '12" MIN.', -14, 10));
    o.push(lead(px - 3, gy - 22 * s, 60, 110, 'WOVEN GEOTEXTILE FABRIC, 24" MIN.\nABOVE GROUND, ON THE UPHILL SIDE'), lead(px + 4, gy - 34 * s, W - 40, 80, 'STEEL T-POST OR 2"×2" WOOD STAKE,\n6\' MAX. SPACING'), lead(px - 30, gy + 20, 60, H - 50, 'TOE FABRIC INTO A 6"×6" TRENCH;\nBACKFILL AND COMPACT'), lead(px - 90, gy - 22, W - 60, H - 40, 'REMOVE SEDIMENT AT 1/3 OF THE\nFABRIC HEIGHT'));
    return o.join(''); },
  inletProt(W, H) { const py = 300, cx = W * 0.52, o = [];
    o.push(box(40, py, cx - 40, 40, 'fill="url(#conc)" stroke="' + INK + '" stroke-width="1.2"'), path('M' + n(cx) + ' ' + n(py - 34) + 'H' + n(cx + 80) + 'V' + n(py - 70) + 'H' + n(W - 40) + 'V' + n(py - 60), 'fill="none" stroke="' + INK + '" stroke-width="1.4"'), box(cx, py - 70, 80, 36, 'fill="url(#conc)" stroke="' + INK + '" stroke-width="1.4"'));
    o.push(path('M' + n(cx) + ' ' + n(py) + 'V' + n(py + 220) + 'H' + n(cx + 200) + 'V' + n(py - 60), 'fill="none" stroke="' + INK + '" stroke-width="5"'), box(cx + 5, py + 150, 190, 65, 'fill="#e9f1f8" stroke="none"'), line(cx + 200, py + 170, W - 40, py + 170, lineAttr('storm', 1.6)));
    for (let i = 0; i < 3; i++) o.push(filled(ellPts(cx - 40 - i * 52, py - 16, 27, 16), 'fill="url(#gravelS)" stroke="' + INK + '" stroke-width="1.2"')); o.push(filled(ellPts(cx - 66, py - 42, 27, 14), 'fill="url(#gravelS)" stroke="' + INK + '" stroke-width="1.2"'));
    o.push(line(cx + 2, py - 30, cx + 2, py - 3, 'stroke="#2f6db5" stroke-width="3" stroke-dasharray="4 2"'), arrow([140, py - 70], [1, 0], 100, 'stroke="' + INK + '" stroke-width="1.4"'), lab(140, py - 92, 'FLOW', 11, { bold: true }));
    o.push(lead(cx - 92, py - 52, 50, 110, 'GRAVEL-FILLED FILTER BAGS, OVERLAPPED,\nACROSS THE THROAT (OR AN APPROVED INSERT)'), lead(cx + 2, py - 20, cx + 60, 120, 'FILTER FABRIC OVER THE THROAT;\nLEAVE A 2" OVERFLOW GAP AT THE TOP'), lead(cx + 100, py + 60, W - 60, py + 70, 'CURB INLET (SEE C-201)'), lead(cx - 120, py + 20, 60, H - 50, 'REMOVE WHEN THE AREA DRAINING TO THE INLET IS\nSTABILIZED; CLEAN WEEKLY AND AFTER 0.5" OF RAIN'));
    return o.join(''); },
  entrance(W, H) { const s = 8, L = 50 * s, w = 24 * s, x0 = (W - L) / 2, y0 = 50, sy = y0 + w + 10, o = [];
    o.push(box(x0, y0, L, w, 'fill="url(#gravelS)" stroke="' + INK + '" stroke-width="1.6"'), box(x0 - 60, sy, L + 120, 50, 'fill="#e2e3e1" stroke="none"'), line(x0 - 60, sy, x0 + L + 60, sy, 'stroke="' + INK + '" stroke-width="2"'), lab(W / 2, sy + 25, 'PUBLIC STREET', 11, { bold: true }), arrow([W / 2, y0 + w / 2], [0, 1], 70, 'stroke="' + INK + '" stroke-width="1.3"'));
    o.push(dim(x0, y0 - 18, x0 + L, y0 - 18, "50'-0\" MIN.", 0, 10), dim(x0 + L + 24, y0, x0 + L + 24, y0 + w, "24'-0\" (DRIVE WIDTH, 20' MIN.)", -14, 10), lab(W / 2 - 120, y0 + w / 2, 'EXIT', 10, { bold: true }));
    const yS = sy + 110; o.push(box(x0, yS + 40, L, 70, 'fill="url(#earth)" stroke="none" opacity=".6"'), box(x0, yS, L, 40, 'fill="url(#gravelS)" stroke="' + INK + '" stroke-width="1.4"'), line(x0, yS + 40, x0 + L, yS + 40, 'stroke="#2f6db5" stroke-width="2.4" stroke-dasharray="8 3"'), lab(x0 + L / 2, yS + 130, 'SECTION', 10.5, { bold: true }));
    o.push(dim(x0 - 22, yS, x0 - 22, yS + 40, '8" MIN.', 0, 10), lead(x0 + L * 0.3, yS + 18, 40, H - 60, '3" TO 5" CRUSHED STONE, 8" MIN. THICK'), lead(x0 + L * 0.7, yS + 40, W - 40, H - 40, 'GEOTEXTILE FABRIC UNDER THE STONE'), lead(x0 + L - 20, y0 + 30, W - 30, y0 + w + 2, 'TOP-DRESS WITH STONE AS NEEDED;\nSWEEP THE STREET DAILY'));
    return o.join(''); },
  tree(W, H) { const gy = H * 0.52, cx = W / 2, bw = 150, bh = 120, o = [];
    o.push(box(40, gy, W - 80, H - gy - 30, 'fill="url(#earth)" stroke="none" opacity=".45"'), path('M' + n(cx - bw * 1.5) + ' ' + n(gy) + 'L' + n(cx - bw * 0.9) + ' ' + n(gy + bh) + 'H' + n(cx + bw * 0.9) + 'L' + n(cx + bw * 1.5) + ' ' + n(gy) + 'Z', 'fill="#efe7d6" stroke="' + INK + '" stroke-width="1" stroke-dasharray="6 4"'));
    o.push(path('M' + n(cx - bw / 2) + ' ' + n(gy - 4) + 'Q' + n(cx - bw / 2 - 10) + ' ' + n(gy + bh * 0.6) + ' ' + n(cx - bw * 0.35) + ' ' + n(gy + bh) + 'H' + n(cx + bw * 0.35) + 'Q' + n(cx + bw / 2 + 10) + ' ' + n(gy + bh * 0.6) + ' ' + n(cx + bw / 2) + ' ' + n(gy - 4) + 'Z', 'fill="#c9a77c" stroke="' + INK + '" stroke-width="1.4"'));
    o.push(box(cx - bw * 1.5, gy - 8, bw * 3, 8, 'fill="#8a6d4a" stroke="none"'), box(cx - 9, gy - 330, 18, 330, 'fill="#8a6d4a" stroke="' + INK + '" stroke-width="1"'), path('M' + n(cx - bw * 1.5) + ' ' + n(gy - 8) + 'q12 -16 24 0', 'fill="#a9c79a" stroke="' + INK + '" stroke-width="1"'), path('M' + n(cx + bw * 1.5 - 24) + ' ' + n(gy - 8) + 'q12 -16 24 0', 'fill="#a9c79a" stroke="' + INK + '" stroke-width="1"'));
    for (const [dx, dy, r] of [[0, -400, 95], [-80, -350, 75], [85, -345, 75], [-40, -455, 60], [50, -450, 60]]) o.push(circle(cx + dx, gy + dy, r, 'fill="#dbe9cf" stroke="#4f7a3a" stroke-width="1"'));
    o.push(line(30, gy, W - 30, gy, 'stroke="' + INK + '" stroke-width="1.4"'), line(cx - bw * 0.75, gy - 200, cx - bw * 0.75, gy + 60, 'stroke="#6b7174" stroke-width="2" stroke-dasharray="8 4"'), line(cx - bw * 0.75, gy - 180, cx - 9, gy - 170, 'stroke="#6b7174" stroke-width="1"'));
    o.push(dim(cx - bw * 1.5, gy + bh + 30, cx + bw * 1.5, gy + bh + 30, '3 × ROOT BALL WIDTH', 0, 11));
    o.push(lead(cx + 9, gy - 14, W - 60, gy - 160, 'ROOT FLARE AT OR 1–2" ABOVE FINISHED GRADE'), lead(cx + bw, gy - 4, W - 60, gy - 90, '3" SHREDDED HARDWOOD MULCH,\nKEPT 3" CLEAR OF THE TRUNK'), lead(cx + bw * 1.45, gy - 10, W - 60, gy - 30, '4" WATERING SAUCER AT THE BALL EDGE'), lead(cx - bw * 0.75, gy - 140, 60, gy - 220, 'STAKE ONLY IF NEEDED: 2 STAKES,\nFLEXIBLE TIES; REMOVE AFTER 1 YEAR'),
      lead(cx - bw * 1.1, gy + 40, 60, gy + 80, 'BACKFILL: EXISTING SOIL, LOOSENED;\nAMEND ONLY PER THE SOIL REPORT'), lead(cx + 30, gy + 40, W - 60, gy + 60, 'REMOVE THE TOP 1/3 OF BURLAP\nAND ALL WIRE AND TWINE'), lead(cx, gy + bh, W - 60, H - 50, 'SET THE BALL ON UNDISTURBED SOIL;\nPIT DEPTH = BALL HEIGHT'));
    return o.join(''); },
  shrub(W, H) { const gy = H * 0.5, cx = W * 0.4, o = [];
    o.push(box(40, gy, W - 80, H - gy - 30, 'fill="url(#earth)" stroke="none" opacity=".45"'), box(cx - 170, gy, 340, 90, 'fill="#efe7d6" stroke="' + INK + '" stroke-width="1" stroke-dasharray="6 4"'), path('M' + n(cx - 60) + ' ' + n(gy - 6) + 'Q' + n(cx - 66) + ' ' + n(gy + 50) + ' ' + n(cx - 40) + ' ' + n(gy + 70) + 'H' + n(cx + 40) + 'Q' + n(cx + 66) + ' ' + n(gy + 50) + ' ' + n(cx + 60) + ' ' + n(gy - 6) + 'Z', 'fill="#c9a77c" stroke="' + INK + '" stroke-width="1.3"'));
    o.push(box(cx - 170, gy - 7, 340, 7, 'fill="#8a6d4a" stroke="none"'), line(30, gy, W - 30, gy, 'stroke="' + INK + '" stroke-width="1.4"'));
    for (const [dx, dy, r] of [[0, -70, 55], [-50, -45, 40], [50, -45, 40], [-25, -100, 35], [30, -100, 35]]) o.push(circle(cx + dx, gy + dy, r, 'fill="#cfe3bf" stroke="#4f7a3a" stroke-width="1"'));
    const px = W * 0.8, py = gy - 160; for (const [dx, dy] of [[-40, 0], [40, 0], [0, -69]]) o.push(circle(px + dx, py + dy, 26, 'fill="#cfe3bf" stroke="#4f7a3a" stroke-width="1"'), circle(px + dx, py + dy, 2, 'fill="' + INK + '"'));
    o.push(poly([[px - 40, py], [px + 40, py], [px, py - 69]], 'fill="none" stroke="' + INK + '" stroke-width=".8" stroke-dasharray="4 3"'), lab(px, py + 46, 'TRIANGULAR SPACING,\nO.C. PER SCHEDULE (PLAN)', 10));
    o.push(dim(cx - 170, gy + 120, cx + 170, gy + 120, '2 × ROOT BALL WIDTH', 0, 11), lead(cx + 60, gy - 4, W - 60, gy - 30, '3" SHREDDED HARDWOOD MULCH'), lead(cx + 30, gy - 4, W - 60, gy + 30, 'TOP OF ROOT BALL 1" ABOVE GRADE'), lead(cx - 120, gy + 40, 60, H - 60, 'BED: 4" COMPOST TILLED 8" DEEP INTO\nTHE WHOLE BED; LOOSEN CIRCLING ROOTS'));
    return o.join(''); },
  protect(W, H) { const gy = H * 0.62, cx = W / 2, R = 230, o = [];
    o.push(box(40, gy, W - 80, H - gy - 30, 'fill="url(#earth)" stroke="none" opacity=".4"'), line(30, gy, W - 30, gy, 'stroke="' + INK + '" stroke-width="1.4"'), box(cx - 12, gy - 280, 24, 280, 'fill="#8a6d4a" stroke="' + INK + '" stroke-width="1"'));
    for (const [dx, dy, r] of [[0, -350, 140], [-130, -300, 100], [130, -300, 100]]) o.push(circle(cx + dx, gy + dy, r, 'fill="#dbe9cf" stroke="#4f7a3a" stroke-width="1"'));
    o.push(path('M' + n(cx - R) + ' ' + n(gy) + 'Q' + n(cx) + ' ' + n(gy + 150) + ' ' + n(cx + R) + ' ' + n(gy), 'fill="none" stroke="#8a6d4a" stroke-width="1" stroke-dasharray="6 4"'), lab(cx, gy + 90, 'ROOT ZONE', 11, { bold: true, fill: '#6b4a2b' }));
    for (const sg of [-1, 1]) { const x = cx + sg * R; o.push(box(x - (sg > 0 ? 0 : 70), gy - 72, 70, 72, 'fill="url(#mesh)" stroke="#e07b24" stroke-width="1.6"'), line(x, gy - 80, x, gy + 30, 'stroke="' + INK + '" stroke-width="3"'), line(x - sg * 70, gy - 80, x - sg * 70, gy + 30, 'stroke="' + INK + '" stroke-width="3"')); }
    o.push(box(cx + R - 160, gy - 140, 110, 44, 'fill="#fff" stroke="' + INK + '" stroke-width="1.2"'), lab(cx + R - 105, gy - 118, 'TREE PROTECTION\nZONE — KEEP OUT', 8.5, { bold: true }), line(cx + R - 105, gy - 96, cx + R - 105, gy - 72, 'stroke="' + INK + '" stroke-width="1.4"'));
    o.push(dim(cx - R, gy + 160, cx + R, gy + 160, 'DRIP LINE, OR 1 FT PER INCH OF TRUNK DIAMETER (GREATER)', 0, 10.5), dim(cx - R - 90, gy - 72, cx - R - 90, gy, "4'-0\"", 0, 10.5));
    o.push(lead(cx - R - 35, gy - 40, 60, gy - 200, '4\' ORANGE SAFETY FENCE ON STEEL T-POSTS\nAT 8\' O.C., INSTALLED BEFORE ANY WORK'), lead(cx + R + 35, gy - 30, W - 50, gy - 220, 'NO STORAGE, PARKING, GRADING OR\nTRENCHING INSIDE THE FENCE'));
    return o.join(''); },
  edge(W, H) { const gy = H * 0.45, ex = W * 0.45, o = [];
    o.push(box(40, gy, W - 80, 160, 'fill="url(#earth)" stroke="none" opacity=".4"'), box(ex, gy - 24, W - 40 - ex, 24, 'fill="#8a6d4a" stroke="' + INK + '" stroke-width="1"'), box(ex, gy, W - 40 - ex, 70, 'fill="#efe7d6" stroke="none"'), box(40, gy - 10, ex - 40, 10, 'fill="#a9c79a" stroke="' + INK + '" stroke-width="1"'));
    for (let x = 46; x < ex - 4; x += 9) o.push(line(x, gy - 10, x + 3, gy - 22, 'stroke="#4f7a3a" stroke-width="1"'));
    o.push(box(ex - 3, gy - 32, 5, 72, 'fill="' + INK + '" stroke="none"'), line(30, gy, W - 30, gy, 'stroke="' + INK + '" stroke-width="1.2" stroke-dasharray="4 3"'), box(ex + 10, gy, 6, 90, 'fill="#6b7174" stroke="none"'));
    o.push(lead(ex - 1, gy - 32, ex - 160, gy - 140, '3/16" × 4" STEEL EDGING, TOP 1/2" ABOVE\nGRADE, STAKES AT 4\' O.C.'), lead(120, gy - 14, 80, gy + 220, 'SOD (ST. AUGUSTINE \'RALEIGH\')'), lead(ex + 160, gy - 12, W - 60, gy - 140, '3" SHREDDED HARDWOOD MULCH'), lead(ex + 200, gy + 40, W - 60, gy + 220, 'PREPARED PLANTING SOIL, 8" DEEP'), lead(ex + 13, gy + 80, ex + 80, gy + 260, 'EDGING STAKE'));
    o.push(dim(W - 70, gy - 24, W - 70, gy, '3"', -12, 10));
    return o.join(''); }
};
function detailSheet(ctx, sh, list, cols, rows, sideHtml) {
  const cw = MAIN.w / cols, ch = MAIN.h / rows, W = cw * 96 / PT - 36, H = ch * 96 / PT - 96;
  sh.scale = 'N.T.S.';
  return list.map(([fn, title], i) => at(MAIN.x + (i % cols) * cw, MAIN.y + Math.floor(i / cols) * ch, cw - 10, ch - 10, '<div style="height:100%;display:flex;flex-direction:column;padding:8pt;border:.6pt solid #c9ccc9"><div style="flex:1;display:flex;align-items:center;justify-content:center;min-height:0">' +
    svg(W, H, (DW = W, DH = H, D[fn](W, H))) + '</div>' + viewTitle(i + 1, title, 'N.T.S.') + '</div>')).join('') + side(sideHtml);
}
function civilDetails(ctx, sh) {
  return detailSheet(ctx, sh, [['pavement', 'Typical concrete pavement section'], ['curb', 'Standard 6" curb'], ['ramp', 'Accessible curb ramp'], ['stalls', 'Parking stall striping'], ['dumpster', 'Dumpster enclosure'], ['silt', 'Silt fence'], ['inletProt', 'Inlet protection'], ['entrance', 'Stabilized construction entrance']], 3, 3,
    notes('Notes', ['Details are typical standards for schematic design; the civil engineer\'s details, the geotechnical report and the local standard details govern.', 'Concrete 3,600 psi at 28 days (paving 4,000 psi where the geotechnical report says), Grade 60 reinforcing.', 'Accessible routes, ramps and stalls per the 2012 Texas Accessibility Standards; register the project with TDLR (TABS) when it costs $50,000 or more.',
      'Erosion control details per the TPDES Construction General Permit TXR150000 and the SWPPP; see C-401 for locations.', 'Dumpster enclosure size and access per the hauler; gates swing clear of the drive aisle.']) + discBlocks(ctx, 'civil', 'Civil') + warn('Typical details, not to scale; not for construction.'));
}
function landscapeDetails(ctx, sh) {
  return detailSheet(ctx, sh, [['tree', 'Tree planting'], ['shrub', 'Shrub planting'], ['protect', 'Tree protection fence'], ['edge', 'Bed edge & mulch']], 2, 2,
    notes('Notes', ['Plant material per ANSI Z60.1, nursery grown, true to name; the landscape architect inspects before planting.', 'Water every plant thoroughly the day it is planted; the irrigation system runs before planting starts.', 'Mulch: 3 in shredded hardwood in all beds and tree rings; no landscape fabric under mulch in beds.',
      'Guarantee: one year from acceptance; replace dead or declining plants at the next planting season.', 'Tree protection fencing goes up before clearing and stays until landscaping starts.']) + discBlocks(ctx, 'landscape', 'Landscape') + warn('Typical details, not to scale; not for construction.'));
}

export const RENDERERS = {
  'c-existing': existing, 'c-dims': dimsSheet, 'c-lots': lotsSheet, 'c-grading': gradingSheet, 'c-detention': detentionSheet, 'c-utility': utilitySheet, 'c-erosion': erosionSheet, 'c-details': civilDetails,
  'l-plan': landscapeSheet, 'l-details': landscapeDetails, 'e-site': lightingSheet, 'fp-access': fireSheet, 't-site': fiberSheet
};
