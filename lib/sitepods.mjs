// Mixed sites in pods (NEIGHBORHOOD-PLAN.md, phase 3): a collector skeleton first (the entry boulevard, a loop or spine
// road and greenbelts) cuts the site into pods; each pod gets one use, its share of the program and its own street
// direction, and is laid out by the single-use engine as a whole site would be (lib/sitelayout.mjs passes its functions
// in as T, so there's no import cycle); then the pods are joined to the collectors, named, checked and finished as one
// plan. Placement hints on the program's zones (corner, along a road, front, back, middle, beside, between, around)
// say which pod goes where. Straight streets inside each pod for now (curved ones are phase 4). Planning sketch only.
import * as S from './siteplan.mjs';
import polyclip from './vendor/polyclip.mjs';

export const COLLECTOR = { w: 36, r: 150, belt: 30, trail: 8, podMin: 2 * 43560, widthMin: 200, frontMin: 120 }; // ft
const AC = 43560, C = COLLECTOR, BIG = 1e5, HOMES = ['sfr', 'townhomes', 'duplex'], WORD = { retail: 'Retail', restaurant: 'Restaurants', office: 'Office', medical: 'Medical', hotel: 'Hotel', church: 'Church', other: 'Commercial', multifamily: 'Apartments', townhomes: 'Townhomes', duplex: 'Duplexes', sfr: 'Homes', amenity: 'The commons', pond: 'Detention' };
const ENTRY_W = { sfr: 28, townhomes: 24, duplex: 26, multifamily: 30 }; // ft: a pod's own way in off the collector (shops 30)
const ccw = r => S.signedArea(r) >= 0 ? r : r.slice().reverse(), close = r => r.concat([r[0]]);
const ringsOf = mp => mp.filter(pg => pg[0]?.length >= 4).map(pg => ccw(S.tidyRing(pg[0].slice(0, -1), 0.5))).filter(r => r.length >= 3 && S.ringArea(r) > 1);
const clip = (a, b) => { try { return ringsOf(polyclip.intersection([close(ccw(a))], [close(ccw(b))])); } catch { return []; } };
const minus = (a, cuts) => { if (!cuts.length) return [ccw(a)]; try { return ringsOf(polyclip.difference([close(ccw(a))], ...cuts.map(c => [close(ccw(c))]))); } catch { return []; } };
const area = r => S.ringArea(r), fit = v => +v.toFixed(2), uid = p => p + Math.random().toString(36).slice(2, 8), dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const toPoly = (p, r) => r.reduce((m, a, i) => Math.min(m, S.segDist(p, a, r[(i + 1) % r.length])), Infinity);
const bbox = pts => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
const xyOf = pts => { const b = bbox(pts); return { x: fit((b[0] + b[2]) / 2), y: fit((b[1] + b[3]) / 2), w: fit(b[2] - b[0]), d: fit(b[3] - b[1]), rot: 0 }; };
const angOf = (r, k) => { const a = r[k], b = r[(k + 1) % r.length]; return Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; };
const meetBox = (b, e) => { const q = bbox(S.shapeOf(e)); return q[0] < b[2] && b[0] < q[2] && q[1] < b[3] && b[1] < q[3]; };
const near = (a, b, g) => { const A = bbox(a), B = bbox(b); return A[0] < B[2] + g && B[0] < A[2] + g && A[1] < B[3] + g && B[1] < A[3] + g && (a.some(p => toPoly(p, b) < g) || b.some(p => toPoly(p, a) < g)); };
const nearLen = (r, o, g) => r.reduce((t, p, k) => { const q = r[(k + 1) % r.length]; return t + (toPoly([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], o) < g ? dist(p, q) : 0); }, 0); // the length of r's edges within g of o
const pathMid = P => { const L = P.reduce((t, q, k) => k ? t + dist(q, P[k - 1]) : 0, 0); let s = L / 2; for (let k = 1; k < P.length; k++) { const l = dist(P[k], P[k - 1]); if (s <= l) return [fit(P[k - 1][0] + (P[k][0] - P[k - 1][0]) * s / (l || 1)), fit(P[k - 1][1] + (P[k][1] - P[k - 1][1]) * s / (l || 1))]; s -= l; } return P[0]; };
const word = (z, u) => z?.partName || z?.name || WORD[u] || 'Commercial';
const isComm = u => S.COMMERCIAL.includes(u);
export const PLACE_WORDS = { corner: 'at the corner', along: 'along', front: 'at the front', back: 'at the back', middle: 'in the middle', beside: 'beside', between: 'between', around: 'round' };

// ---------- the site's own frame: the front at the bottom, x along it ----------
function siteFrame(plan) {
  const ring = plan.ring, f = plan.front != null && plan.front < ring.length ? plan.front : S.longestEdge(ring), n = S.outwardOf(ring, f), psi = Math.atan2(n[1], n[0]) * 180 / Math.PI + 90;
  const toF = p => S.rotPt(p, -psi), toP = p => S.rotPt(p, psi).map(fit), rr = ring.map(toF), b = bbox(rr);
  return { ring, f, psi, toF, toP, rr, X0: b[0], Y0: b[1], X1: b[2], Y1: b[3] };
}
// the first lot line a ray from p along d meets: { t, j, q } (frame or plan feet alike)
const rayHit = (rr, p, d) => { let best = null; rr.forEach((a, j) => { const b = rr[(j + 1) % rr.length], e = [b[0] - a[0], b[1] - a[1]], den = d[0] * e[1] - d[1] * e[0]; if (Math.abs(den) < 1e-9) return; const w = [a[0] - p[0], a[1] - p[1]], t = (w[0] * e[1] - w[1] * e[0]) / den, s = (w[0] * d[1] - w[1] * d[0]) / den; if (t > 1e-6 && s >= -1e-9 && s <= 1 + 1e-9 && (!best || t < best.t)) best = { t, j, q: [p[0] + d[0] * t, p[1] + d[1] * t] }; }); return best; };
// the lot line under x (frame): where a ray up from below the site first meets it
const frontAt = (F, x) => rayHit(F.rr, [x, F.Y0 - 50], [0, 1]);

// the road a placement names ("FM 362", "the side street", "the highway"): its lot line. A road's own name (as the map
// has it), the side street, else the front; a bare "the road" or "the street" is the front, never a road whose name
// happens to have the word in it
const GENERIC = /^(?:the )?(?:main |front |busy |frontage |major )?(?:highway|frontage(?: road)?|road|street|thoroughfare)$/;
export const roadIs = (road, nm) => { const r = String(road || '').toLowerCase().trim(), n = String(nm || '').toLowerCase().trim(); return !!r && !!n && !GENERIC.test(r) && (r.includes(n) || n.includes(r)); };
export function roadEdge(plan, road, F = siteFrame(plan)) {
  const r = String(road || '').toLowerCase(), rules = S.edgeRules(plan.ring, plan.front, plan.setbacks, plan.streets), byName = Object.entries(plan.streetNames || {}).find(([, nm]) => roadIs(r, nm))?.[0];
  return byName != null ? +byName : /side street|side road|cross street/.test(r) ? (plan.ring.map((_, j) => j).find(j => j !== F.f && rules[j].street) ?? F.f) : F.f;
}

// ---------- what the program asks of the land ----------
export const fillOf = (plan, prog) => { const Z = prog.zones || [], H = ['sfr', 'townhomes', 'duplex', 'multifamily'], un = Z.map((z, i) => [z, i]).filter(([z]) => H.includes(z.use) && !z.units && !z.gfa).sort((a, b) => H.indexOf(a[0].use) - H.indexOf(b[0].use))[0]?.[1];
  return un ?? (plan.params?.fill === false ? -1 : Z.map((z, i) => [z, i]).filter(([z]) => HOMES.includes(z.use) && z.units).sort((a, b) => H.indexOf(a[0].use) - H.indexOf(b[0].use))[0]?.[1] ?? -1); }; // (as mixedOptions' fillAt)
const commonsAc = (z, site) => z?.acres || Math.min(site * 0.14 / AC, Math.max(2, Math.min(5, site / AC * 0.04)));
const lakeIn = z => !!z && (!z.items?.length || z.items.some(t => /lake|pond/i.test(t)));
// a zone's land (sq ft): what mixedOptions' landNeed asks, a little more; apartments at 16 an acre (the clubhouse, pool and
// dog park take land); the commons its acres (and the lake when it holds the detention)
function wantOf(z, site, need) {
  const u = z.use;
  if (isComm(u)) return (z.gfa || Math.max(20000, Math.min(120000, site / AC * 700))) / 0.22 * 1.3;
  if (u === 'multifamily') return (z.units || 200) / 16 * AC;
  if (u === 'townhomes') return (z.units || 60) / 9 * AC; if (u === 'duplex') return (z.units || 40) / 6 * AC;
  if (u === 'sfr') return (z.units || 40) / 4.5 * AC * 1.15;
  if (u === 'amenity') return commonsAc(z, site) * AC + (lakeIn(z) ? need * 1.25 : 0);
  return site * 0.12;
}

// ---------- skeletons ----------
// [{ kind: core | loop | spine, at (the mouth, t along the front), D, els (collectors, the ways in, greenbelts), cuts
// ([{ line, strip }]), core (the commons' ring, plan feet), ways }]
export function skeletons(plan, prog, opts = {}) {
  const F = siteFrame(plan), site = area(plan.ring), ac = site / AC, Z = prog.zones || [], am = Z.find(z => z.use === 'amenity'), need = S.stormNeed(ac, plan.params || {}, prog).area, R = S.entryRules(plan), out = [];
  const cs = S.streetCorners(plan).map(F.toF), fa = F.rr[F.f], fb = F.rr[(F.f + 1) % F.rr.length], xa = Math.min(fa[0], fb[0]), xb = Math.max(fa[0], fb[0]);
  const cz = Z.findIndex(z => z.place?.where === 'corner'), keepX = cz >= 0 ? Math.sqrt(wantOf(Z[cz], site, need)) * 1.5 + 150 : 0; // a corner pod's stretch of the frontage: no main entry there
  const mouths = [0.5, 0.35, 0.65].map(t => ({ t, x: xa + (xb - xa) * t })).filter(m => cs.every(c => Math.abs(c[0] - m.x) >= R.corner + 150 && dist(c, [m.x, frontAt(F, m.x)?.q[1] ?? c[1]]) >= R.corner + 150) && (!keepX || cs.every(c => Math.abs(c[0] - m.x) >= keepX)));
  const kinds = opts.podKinds || ['core', 'loop', 'spine'];
  for (const m of mouths.length ? mouths : [{ t: 0.5, x: (xa + xb) / 2 }]) {
    if (kinds.includes('core') && (am || need >= 5 * AC)) { const sk = coreSkel(plan, F, m, { am, need, site, R, back: am?.place?.where === 'back' }); if (sk) out.push(sk); }
    if (kinds.includes('loop') && ac >= 60) for (const D of [300, 420]) { const sk = loopSkel(plan, F, m, D, { R, site }); if (sk) out.push(sk); }
    if (kinds.includes('spine') && ac >= 15 && ac <= 120) { const sk = spineSkel(plan, F, m, { R, site }); if (sk) out.push(sk); }
  }
  return out;
}
// a collector along a frame path, as a drive in plan feet
const coll = (F, pts, name, extra = {}) => { const path = pts.map(F.toP), mid = pathMid(path); return { id: uid('k'), kind: 'drive', path, ...xyOf(path), x: mid[0], y: mid[1], width: C.w, r: C.r, name, note: 'Collector · ' + C.w + ' ft', coll: true, skel: true, ...extra }; };
// a closed centre line (frame) as open pieces broken at the junctions (each a perimeter point), corners rounded
function loopPieces(F, cl, at, name) {
  const n = cl.length, L = cl.map((p, i) => dist(p, cl[(i + 1) % n])), cum = [0]; for (let i = 0; i < n; i++) cum.push(cum[i] + L[i]); const P = cum[n];
  const posOf = q => { let best = null; for (let i = 0; i < n; i++) { const a = cl[i], b = cl[(i + 1) % n], d = S.segDist(q, a, b); if (!best || d < best.d) { const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / (L[i] * L[i] || 1))); best = { d, s: cum[i] + t * L[i] }; } } return best.s; };
  const ptAt = s => { s = ((s % P) + P) % P; for (let i = 0; i < n; i++) if (s <= cum[i + 1] + 1e-9) { const t = (s - cum[i]) / (L[i] || 1), a = cl[i], b = cl[(i + 1) % n]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; } return cl[0]; };
  let J = [...new Set(at.map(q => +posOf(q).toFixed(1)))].sort((a, b) => a - b); if (J.length === 1) J.push(J[0] + P / 2); if (!J.length) J = [0, P / 2];
  return J.map((s0, k) => { const s1 = k + 1 < J.length ? J[k + 1] : J[0] + P, pts = [ptAt(s0)]; for (let i = 0; i <= 2 * n; i++) { const c = cum[i % n] + Math.floor(i / n) * P; if (c > s0 + 1 && c < s1 - 1) pts.push(cl[i % n]); } pts.push(ptAt(s1)); return coll(F, pts, name); });
}
// cuts from a loop's corners out to the lot lines: each corner's more nearly level side carried on past it (started on
// the centre line before the bend, so the cut begins inside the road), 20 ft past the lot line
function loopCuts(F, cl) {
  const n = cl.length, out = [], s = S.signedArea(cl) >= 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const a = cl[(i - 1 + n) % n], v = cl[i], b = cl[(i + 1) % n], e1 = [v[0] - a[0], v[1] - a[1]], e2 = [b[0] - v[0], b[1] - v[1]], l1 = Math.hypot(...e1), l2 = Math.hypot(...e2); if (l1 < 1 || l2 < 1) continue;
    if ((e1[0] * e2[1] - e1[1] * e2[0]) * s < 0) continue; // a reflex corner: carried on it would run into the loop
    const level1 = Math.abs(e1[0]) / l1, level2 = Math.abs(e2[0]) / l2, d = level1 >= level2 ? [e1[0] / l1, e1[1] / l1] : [-e2[0] / l2, -e2[1] / l2], back = Math.min(C.r, (level1 >= level2 ? l1 : l2) / 2);
    const p0 = [v[0] - d[0] * back, v[1] - d[1] * back], h = rayHit(F.rr, v, d); if (!h || h.t > 3000) continue;
    out.push([p0, [h.q[0] + d[0] * 20, h.q[1] + d[1] * 20]]);
  }
  return out;
}
// the main entry: a boulevard (its median and signs) in from the front at x to the spine; a plain 40 ft one where
// there's no room for the median. Pieces in plan feet, marked as the skeleton's (not pinned: nobody placed them)
function mainEntry(plan, F, x, els, R) {
  const fh = frontAt(F, x); if (!fh) return null; const p = F.toP(fh.q), base = { ...plan, elements: els };
  let r = S.addEntrance(base, p, { boulevard: R.style !== 'driveway', sign: R.sign, name: 'Main entry', slide: 40 }); if (r.error) r = S.addEntrance(base, p, { W: 40, name: 'Main entry', slide: 40 }); if (r.error) return null;
  const ids = new Set(els.map(e => e.id)); return r.elements.filter(e => !ids.has(e.id)).map(e => { const { pinned, ...o } = e; return { ...o, skel: true }; });
}
// a way in off a side street (or the front) at plan point p: a 36 ft driveway in to the connector
function sideEntry(plan, p, els, n) {
  const r = S.addEntrance({ ...plan, elements: els }, p, { W: C.w, name: 'Entrance ' + n, slide: 30 }); if (r.error) return null;
  const ids = new Set(els.map(e => e.id)); return r.elements.filter(e => !ids.has(e.id)).map(e => { const { pinned, ...o } = e; return { ...o, skel: true }; });
}
// connectors from a loop (frame centre line cl) to the side streets: square to the street from the loop's side facing it
function connectors(plan, F, cl, R, inset = 40) {
  const out = [], n = (cl = ccw(cl)).length;
  for (const j of plan.streets || []) {
    if (j === F.f || S.edgeLen(plan.ring, j) < 400) continue; const o = S.outwardOf(plan.ring, j), nj = S.rotPt(o, -F.psi);
    let best = null; for (let i = 0; i < n; i++) { const a = cl[i], b = cl[(i + 1) % n], L = dist(a, b), on = S.outwardOf(cl, i), dot = on[0] * nj[0] + on[1] * nj[1]; if (L < 300 || dot < 0.7) continue; if (!best || L > best.L) best = { a, b, L }; }
    if (!best) continue; const J = [(best.a[0] + best.b[0]) / 2, (best.a[1] + best.b[1]) / 2], h = rayHit(F.rr, J, nj); if (!h || h.j !== j || h.t < 80) continue;
    const ej = [F.rr[j], F.rr[(j + 1) % F.rr.length]]; if (Math.min(dist(h.q, ej[0]), dist(h.q, ej[1])) < R.corner + 60) continue;
    out.push({ J, end: [h.q[0] - nj[0] * inset, h.q[1] - nj[1] * inset], mouth: h.q, j });
  }
  return out;
}
// a second way in from the front when there's no side street for one: a connector at the other third of the frontage, at
// least the driveway spacing from the main entry, clear of the corners, meeting the loop between lo and hi (frame x)
function frontConn(plan, F, m, R, lo, hi) {
  const fa = F.rr[F.f], fb = F.rr[(F.f + 1) % F.rr.length], xa = Math.min(fa[0], fb[0]), xb = Math.max(fa[0], fb[0]), cs = S.streetCorners(plan).map(F.toF);
  return [0.22, 0.78, 0.3, 0.7].map(t => xa + (xb - xa) * t).filter(x => Math.abs(x - m.x) >= Math.max(R.spacing, 400) && x > lo && x < hi && cs.every(c => Math.abs(c[0] - x) >= R.corner + 150) && frontAt(F, x)).sort((a, b) => Math.abs(b - m.x) - Math.abs(a - m.x))[0] ?? null;
}
const beltOf = (plan, line) => { const strip = S.outline({ kind: 'trail', path: line, width: C.belt, r: 0 }); return { line, strip }; };
// the skeleton finished: greenbelt pieces (the strips inside the lot, off the collectors) with a trail down the long ones
function finishSkel(plan, F, sk) { for (const c of sk.cuts) beltEls(plan, sk, c); sk.ways = S.entrancesOf(sk.els).length; return sk; }
// a cut's greenbelt (the strip inside the lot, off the roads) and the trail down it, onto the skeleton
function beltEls(plan, sk, c) {
  const inner = S.insetRing(plan.ring, plan.ring.map(() => 0.5)), roads = sk.els.filter(e => e.kind === 'drive').map(e => S.outline(e));
  for (const g of clip(c.strip, inner).flatMap(r => minus(r, roads)).filter(r => area(r) > 600)) {
    sk.els.push({ id: uid('g'), kind: 'green', poly: g.map(p => p.map(fit)), ...xyOf(g), name: '', note: 'Greenbelt · trail', trees: true, belt: true, skel: true });
    const [p, q] = c.line, L = dist(p, q); if (L < 200) continue;
    const ins = clip(S.outline({ kind: 'trail', path: c.line, width: C.trail, r: 0 }), g).sort((a, b) => area(b) - area(a))[0]; if (!ins || area(ins) < 200 * C.trail * 0.8) continue;
    const xs = ins.map(v => (v[0] - p[0]) * (q[0] - p[0]) / L + (v[1] - p[1]) * (q[1] - p[1]) / L), t0 = Math.min(...xs) + 16, t1 = Math.max(...xs) - 16, path = [t0, t1].map(t => [fit(p[0] + (q[0] - p[0]) * t / L), fit(p[1] + (q[1] - p[1]) * t / L)]);
    sk.els.push({ id: uid('t'), kind: 'trail', path, ...xyOf(path), width: C.trail, r: 0, name: '', note: 'Trail', skel: true });
  }
}
// a loop road round a central commons and lake, the spine in from the main entry, connectors to the side streets
function coreSkel(plan, F, m, { am, need, site, R, back }) {
  const A = commonsAc(am, site) * AC + 1.25 * (lakeIn(am) || !am ? need : 0), w = Math.sqrt(A * 1.3), h = A / w, M = 36 + 260;
  const lp = F.toF(S.labelPoint(plan.ring)), sl = Math.max(0, w / 2 + 18 - C.r - 40), c0 = [Math.max(m.x - sl, Math.min(m.x + sl, lp[0])), back ? F.Y0 + (F.Y1 - F.Y0) * 0.6 : lp[1]]; // (slid across as far as the spine still meets the loop square: a small commons on a site whose middle is off the entry)
  const ok = (cx, cy) => { const B = [cx - w / 2 - M, cy - h / 2 - M, cx + w / 2 + M, cy + h / 2 + M]; return box(...B).every(p => S.inRing(p, F.rr)) && !F.rr.some(p => p[0] > B[0] && p[0] < B[2] && p[1] > B[1] && p[1] < B[3]); };
  let c = null; for (let r = 0; r <= 800 && !c; r += 100) for (const [dx, dy] of r ? [[0, -r], [0, r], [-r, 0], [r, 0], [-r, -r], [r, -r], [-r, r], [r, r]] : [[0, 0]]) if (Math.abs(c0[0] + dx - m.x) <= sl && ok(c0[0] + dx, c0[1] + dy)) { c = [c0[0] + dx, c0[1] + dy]; break; }
  if (!c) return null;
  const x0 = c[0] - w / 2 - 18, x1 = c[0] + w / 2 + 18, y0 = c[1] - h / 2 - 18, y1 = c[1] + h / 2 + 18, cl = box(x0, y0, x1, y1), sx = Math.max(x0 + C.r + 40, Math.min(x1 - C.r - 40, m.x));
  if (Math.abs(sx - m.x) > 1) return null; // the main entry has to meet the loop square, off its corners
  const fh = frontAt(F, sx); if (!fh) return null; const start = fh.q[1] + Math.max(R.cross + 60, 180); if (y0 - start < 40) return null;
  const cons = connectors(plan, F, cl, R), spine = coll(F, [[sx, start], [sx, y0]], 'Spine road'), x2 = cons.length ? null : frontConn(plan, F, m, R, x0 + C.r + 40, x1 - C.r - 40); // (no side street: a second way in off the front)
  if (x2 != null) cons.push({ J: [x2, y0], end: [x2, frontAt(F, x2).q[1] + 40], mouth: frontAt(F, x2).q });
  const els = [spine, ...loopPieces(F, cl, [[sx, y0], ...cons.map(q => q.J)], 'Loop road'), ...cons.map(q => coll(F, [q.J, q.end], 'Connector'))];
  const ent = mainEntry(plan, F, sx, els, R); if (!ent) return null; els.push(...ent);
  let n = 2; for (const q of cons) { const e = sideEntry(plan, F.toP(q.mouth), els, n); if (e) { els.push(...e); n++; } }
  const cuts = loopCuts(F, cl).map(l => beltOf(plan, l.map(F.toP))), core = box(c[0] - w / 2, c[1] - h / 2, c[0] + w / 2, c[1] + h / 2).map(F.toP);
  return finishSkel(plan, F, { kind: 'core', at: m.t, D: 0, els, cuts, core, F });
}
// a loop road D ft in from the lot lines (a block of homes outside it), the spine in from the main entry and on through
// the middle when it's deep, connectors to the side streets, the inner land halved by a greenbelt when it's big
function loopSkel(plan, F, m, D, { R, site }) {
  let cl = S.insetRing(F.rr, F.rr.map(() => D)); if (cl.length < 3 || area(cl) < site * 0.25 || clip(cl, F.rr).length !== 1 || Math.abs(area(clip(cl, F.rr)[0]) - area(cl)) > 1) return null;
  cl = S.tidyRing(cl, 2); const bh = rayHit(cl, [m.x, F.Y0 - 50], [0, 1]); if (!bh) return null; const J0 = bh.q, fh = frontAt(F, m.x); if (!fh) return null;
  const start = fh.q[1] + Math.max(R.cross + 60, 180); if (J0[1] - start < 40) return null;
  const top = rayHit(cl, [m.x, J0[1] + 5], [0, 1]), cons = connectors(plan, F, cl, R), deep = top && top.q[1] - J0[1] > 1000, cb = bbox(cl), x2 = cons.length ? null : frontConn(plan, F, m, R, cb[0] + C.r + 40, cb[2] - C.r - 40);
  if (x2 != null) { const h2 = rayHit(cl, [x2, F.Y0 - 50], [0, 1]); if (h2 && h2.q[1] - frontAt(F, x2).q[1] > 120) cons.push({ J: h2.q, end: [x2, frontAt(F, x2).q[1] + 40], mouth: frontAt(F, x2).q }); }
  const els = [coll(F, [[m.x, start], J0], 'Spine road'), ...loopPieces(F, cl, [J0, ...(deep ? [top.q] : []), ...cons.map(q => q.J)], 'Loop road'), ...cons.map(q => coll(F, [q.J, q.end], 'Connector'))];
  if (deep) els.push(coll(F, [J0, top.q], 'Spine road'));
  const ent = mainEntry(plan, F, m.x, els, R); if (!ent) return null; els.push(...ent);
  let n = 2; for (const q of cons) { const e = sideEntry(plan, F.toP(q.mouth), els, n); if (e) { els.push(...e); n++; } }
  const lines = loopCuts(F, cl); if (!deep && area(cl) > 80 * AC) { const mid = [(J0[0] + (top?.q[0] ?? J0[0])) / 2, (J0[1] + (top?.q[1] ?? J0[1] + 400)) / 2], l = rayHit(cl, mid, [-1, 0]), r = rayHit(cl, mid, [1, 0]); if (l && r) lines.push([[l.q[0] - 10, l.q[1]], [r.q[0] + 10, r.q[1]]]); }
  return finishSkel(plan, F, { kind: 'loop', at: m.t, D, els, cuts: lines.map(l => beltOf(plan, l.map(F.toP))), F });
}
// a spine straight in, a T across its end (cul-de-sac bulbs on its arms), the land behind the T cut off from the sides
function spineSkel(plan, F, m, { R, site }) {
  const fh = frontAt(F, m.x); if (!fh) return null; const y0 = fh.q[1], top = rayHit(F.rr, [m.x, y0 + 5], [0, 1]); if (!top) return null;
  const depth = top.q[1] - y0, start = y0 + Math.max(R.cross + 60, 180);
  if (site < 40 * AC) { // a small site: the spine in to a turnaround a lot's depth short of the back, a greenbelt on from it to the back halving the land
    const yE = top.q[1] - 280; if (yE - start < 300 || frontAt(F, m.x - 300) == null || frontAt(F, m.x + 300) == null) return null;
    const poly = S.ringDisc([m.x, yE], 45, 32).map(F.toP), els = [coll(F, [[m.x, start], [m.x, yE]], 'Spine road'), { id: uid('k'), kind: 'drive', poly, ...xyOf(poly), name: '', note: 'Cul-de-sac · 90 ft', bulb: true, skel: true, coll: true }];
    const ent = mainEntry(plan, F, m.x, els, R); if (!ent) return null; els.push(...ent);
    return finishSkel(plan, F, { kind: 'spine', at: m.t, D: 0, els, cuts: [beltOf(plan, [[m.x, yE], [m.x, top.q[1] + 20]].map(F.toP))], F }); }
  const yT = y0 + depth - Math.max(300, depth * 0.25); if (yT - start < 400) return null;
  const l = rayHit(F.rr, [m.x, yT], [-1, 0]), r = rayHit(F.rr, [m.x, yT], [1, 0]); if (!l || !r) return null;
  const xl = l.q[0] + 120 + 45, xr = r.q[0] - 120 - 45; if (m.x - xl < 300 || xr - m.x < 300) return null;
  const bulb = x => { const poly = S.ringDisc([x, yT], 45, 32).map(F.toP); return { id: uid('k'), kind: 'drive', poly, ...xyOf(poly), name: '', note: 'Cul-de-sac · 90 ft', bulb: true, skel: true, coll: true }; };
  const x2 = frontConn(plan, F, m, R, xl + 60, xr - 60), els = [coll(F, [[m.x, start], [m.x, yT]], 'Spine road'), coll(F, [[xl, yT], [m.x, yT]], 'Spine road', { r: 0 }), coll(F, [[m.x, yT], [xr, yT]], 'Spine road', { r: 0 }), bulb(xl), bulb(xr)];
  if (x2 != null) els.push(coll(F, [[x2, frontAt(F, x2).q[1] + 40], [x2, yT]], 'Connector')); // a second way in: up from the front to the T
  const ent = mainEntry(plan, F, m.x, els, R); if (!ent) return null; els.push(...ent); if (x2 != null) { const e = sideEntry(plan, F.toP(frontAt(F, x2).q), els, 2); if (e) els.push(...e); }
  const cuts = [[[xl, yT], [l.q[0] - 20, yT]], [[xr, yT], [r.q[0] + 20, yT]]];
  return finishSkel(plan, F, { kind: 'spine', at: m.t, D: 0, els, cuts: cuts.map(c => beltOf(plan, c.map(F.toP))), F });
}

// ---------- cells ----------
// what each edge of a piece of land meets: a collector (its id), an entry (the main entry's sides), a lot line (j: street
// or plain), else a greenbelt or another pod
export function edgesOf(plan, sk, ring) {
  const rules = S.edgeRules(plan.ring, plan.front, plan.setbacks, plan.streets), N = plan.ring.length;
  const cs = sk.colls || (sk.colls = sk.els.filter(e => e.coll).map(e => ({ id: e.id, o: S.outline(e) }))), es = sk.ents || (sk.ents = sk.els.filter(e => e.kind === 'drive' && !e.coll).map(e => S.outline(e)));
  return ring.map((p, k) => { const q = ring[(k + 1) % ring.length], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const c = cs.find(x => toPoly(m, x.o) < 1.5); if (c) return { kind: 'coll', coll: c.id }; if (es.some(o => toPoly(m, o) < 1.5)) return { kind: 'entry' };
    const j = plan.ring.findIndex((a, i) => S.segDist(m, a, plan.ring[(i + 1) % N]) < 1.5); if (j >= 0) return { kind: rules[j].role === 'front' || rules[j].street ? 'street' : 'line', j };
    return { kind: 'belt' }; });
}
const cellOf = (plan, sk, ring) => { const edges = edgesOf(plan, sk, ring), run = kind => edges.reduce((t, e, k) => t + (e.kind === kind ? S.edgeLen(ring, k) : 0), 0); return { ring, edges, area: area(ring), c: S.centroid(ring), coll: run('coll'), street: run('street') }; };
// the narrowest a piece is, turned square to its longest collector edge (else its longest edge)
const widthOf = cell => { const r = cell.ring, ks = cell.edges.map((e, k) => k).filter(k => cell.edges[k].kind === 'coll'), k = (ks.length ? ks : r.map((_, i) => i)).sort((a, b) => S.edgeLen(r, b) - S.edgeLen(r, a))[0], b = bbox(r.map(p => S.rotPt(p, -angOf(r, k)))); return Math.min(b[2] - b[0], b[3] - b[1]); };
// the land between the skeleton's roads and greenbelts; a cell bigger than ~45 acres is halved by a greenbelt square to
// its longest collector edge
export function cellsOf(plan, sk) {
  const roads = sk.els.filter(e => e.kind === 'drive').map(e => S.outline(e));
  let cells = minus(plan.ring, roads.concat(sk.cuts.map(c => c.strip))).filter(r => area(r) > 2000).map(r => cellOf(plan, sk, r));
  for (let pass = 0; pass < 2; pass++) cells = cells.flatMap(c => {
    if (c.area < Math.max(45 * AC, area(plan.ring) * 0.22) || !c.coll) return [c];
    const r = c.ring, k = c.edges.map((e, i) => i).filter(i => c.edges[i].kind === 'coll').sort((a, b) => S.edgeLen(r, b) - S.edgeLen(r, a))[0], a = r[k], b = r[(k + 1) % r.length], o = S.outwardOf(r, k), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], h = rayHit(r, [m[0] - o[0] * 5, m[1] - o[1] * 5], [-o[0], -o[1]]); if (!h) return [c];
    const cut = beltOf(plan, [[m[0] + o[0] * 10, m[1] + o[1] * 10], [h.q[0] - o[0] * 20, h.q[1] - o[1] * 20]]), parts = minus(r, [cut.strip]).filter(q => area(q) > 2000); if (parts.length < 2) return [c];
    sk.cuts.push(cut); beltEls(plan, sk, cut); return parts.map(q => cellOf(plan, sk, q)); });
  return cells;
}

// ---------- carving: slices, layers and corner blocks ----------
// a piece's frame on its edge k: x along the edge from its start, y inward
function localOf(r, k) { const P = r[k], Q = r[(k + 1) % r.length], L = dist(P, Q) || 1, u = [(Q[0] - P[0]) / L, (Q[1] - P[1]) / L], o = S.outwardOf(r, k), n = [-o[0], -o[1]]; return { L, to: p => [(p[0] - P[0]) * u[0] + (p[1] - P[1]) * u[1], (p[0] - P[0]) * n[0] + (p[1] - P[1]) * n[1]], from: ([x, y]) => [P[0] + u[0] * x + n[0] * y, P[1] + u[1] * x + n[1] * y] }; }
// the part of r in x0..x1, y below y1 on edge k's frame, the greenbelt round its inner sides and the rest
function carveBox(r, k, x0, x1, y1) {
  const F = localOf(r, k), g = C.belt, R0 = box(x0, -BIG, x1, y1).map(F.from), R1 = box(x0 > -BIG / 2 ? x0 - g : x0, -BIG, x1 < BIG / 2 ? x1 + g : x1, y1 < BIG / 2 ? y1 + g : y1).map(F.from);
  const pod = clip(r, R0).sort((a, b) => area(b) - area(a))[0], belt = clip(r, R1).flatMap(q => minus(q, [R0])).filter(q => area(q) > 300), rest = minus(r, [R1]).filter(q => area(q) > 2000);
  return pod ? { pod, belt, rest } : null;
}
// one dimension of a carve found by halving until the piece holds A
function search(lo, hi, f, A, up = true) { let a = lo, b = hi; for (let i = 0; i < 34; i++) { const m = (a + b) / 2, v = f(m); if ((v < A) === up) a = m; else b = m; } return (a + b) / 2; }
const sizeIn = (r, k) => { const F = localOf(r, k), q = r.map(F.to); return { x0: Math.min(...q.map(p => p[0])), x1: Math.max(...q.map(p => p[0])), y1: Math.max(...q.map(p => p[1])) }; };
export function layer(r, k, A, minDepth = 0) { const s = sizeIn(r, k), y = Math.max(minDepth, search(0, s.y1, v => area(clip(r, box(-BIG, -BIG, BIG, v).map(localOf(r, k).from))[0] || []), A)); return y >= s.y1 - C.belt - 60 ? null : carveBox(r, k, -BIG, BIG, y); }
export function slice(r, k, A, fromEnd = false) { const s = sizeIn(r, k), F = localOf(r, k), f = v => area(clip(r, (fromEnd ? box(v, -BIG, BIG, BIG) : box(-BIG, -BIG, v, BIG)).map(F.from))[0] || []), x = search(s.x0, s.x1, f, A, !fromEnd); return carveBox(r, k, fromEnd ? x : -BIG, fromEnd ? BIG : x, BIG); }
// a block at a corner of the frontage (atEnd: the corner at edge k's end), about 1.25 times as wide as deep
function cornerBlock(r, k, A, atEnd) {
  const s = sizeIn(r, k), F = localOf(r, k), b0 = Math.sqrt(A / 1.25), f = t => { const a = 1.25 * b0 * t, b = b0 * t; return area(clip(r, (atEnd ? box(s.x1 - a, -BIG, BIG, b) : box(-BIG, -BIG, s.x0 + a, b)).map(F.from))[0] || []); };
  const t = search(0.2, 4, f, A), a = 1.25 * b0 * t, b = b0 * t; return carveBox(r, k, atEnd ? s.x1 - a : -BIG, atEnd ? BIG : s.x0 + a, b >= s.y1 - C.belt - 60 ? BIG : b);
}

// ---------- allocation: which pod each zone gets ----------
// v: { corner, along } which of two equal choices (0 or 1); v.scale: { zone: factor } on the land each zone wants, from
// a first lay-out of its pods (podsOptions: what it really took). Returns { pods, greens, notes, pre } or null.
const RANK = ['corner', 'along', 'front', 'back', 'middle', 'around', 'beside', 'between'];
export function allocate(plan, prog, sk, cells, v = {}) {
  const Z = prog.zones || [], site = area(plan.ring), F = sk.F || siteFrame(plan), need = S.stormNeed(site / AC, plan.params || {}, prog).area, fill = fillOf(plan, prog), names = plan.streetNames || {}, wantZ = zi => wantOf(Z[zi], site, need) * (v.scale?.[zi] || 1);
  const rules = S.edgeRules(plan.ring, plan.front, plan.setbacks, plan.streets), streets = plan.ring.map((_, j) => j).filter(j => rules[j].role === 'front' || rules[j].street), mainAt = S.centroid(S.shapeOf(sk.els.find(e => e.name === 'Main entry') || sk.els[0]));
  let pool = cells.filter(c => !(sk.core && S.inRing(c.c, sk.core))), pods = [], greens = [], notes = [], miss = 0, n = 0;
  const am = Z.findIndex(z => z.use === 'amenity'), coreCell = sk.core ? cells.find(c => S.inRing(c.c, sk.core)) : null;
  const add = (zi, ring, extra = {}) => { const c = cellOf(plan, sk, ring); const p = { id: 'p' + (++n), zone: zi, use: zi >= 0 ? Z[zi].use : extra.use, ring, edges: c.edges, area: c.area, c: c.c, ...extra }; pods.push(p); return p; };
  const back = rest => { for (const q of rest) { const c = cellOf(plan, sk, q); if (c.area >= C.podMin && (c.coll >= C.frontMin || c.street >= 200)) pool.push(c); else greens.push(openOf(q)); } };
  const use = (c, res) => { pool = pool.filter(x => x !== c); if (res) { greens.push(...res.belt.map(b => beltGreen(b))); back(res.rest); } };
  const runOn = (c, j) => c.edges.reduce((t, e, k) => t + (e.j === j && (e.kind === 'street' || e.kind === 'line') ? S.edgeLen(c.ring, k) : 0), 0), edgeOn = (c, j) => c.edges.map((e, k) => k).filter(k => c.edges[k].j === j).sort((a, b) => S.edgeLen(c.ring, b) - S.edgeLen(c.ring, a))[0];
  const minD = u => u === 'multifamily' ? 250 : isComm(u) ? 260 : 280; // (shops: a parking bay and the building behind the street setback)
  // a zone's land from one piece: all of it when it's about the size wanted (or the rest would be no use), else a layer along edge k
  const takeAlong = (zi, c, k, A, face) => { if (c.area <= A * 1.3) { use(c); return [add(zi, c.ring, { face })]; }
    if (isComm(Z[zi].use)) { const lc = localOf(c.ring, k), sz = sizeIn(c.ring, k), atEnd = dist(lc.from([sz.x1, 0]), mainAt) > dist(lc.from([sz.x0, 0]), mainAt), res = cornerBlock(c.ring, k, A, atEnd); // shops: a block about as deep as wide at the end away from the main entry, not a thin strip down the whole frontage
      if (res && res.rest.some(q => { const x = cellOf(plan, sk, q); return x.area >= C.podMin && (x.coll >= C.frontMin || x.street >= 200); })) { use(c, res); return [add(zi, res.pod, { face })]; } }
    const res = layer(c.ring, k, A, minD(Z[zi].use)), okRest = res && res.rest.some(q => { const x = cellOf(plan, sk, q); return x.area >= C.podMin && x.coll >= C.frontMin; });
    if (!res || !okRest) { if (c.area <= A * 2.2) { use(c); return [add(zi, c.ring, { face })]; } return null; }
    use(c, res); return [add(zi, res.pod, { face })]; };
  const nearZone = (c, js) => js.reduce((t, j) => t + pods.filter(p => p.zone === j).reduce((s, p) => s + nearLen(c.ring, p.ring, 64), 0), 0);
  const order = Z.map((z, i) => i).filter(i => i !== fill && !(i === am && coreCell)).sort((a, b) => { const r = i => { const w = Z[i].place?.where; return w ? RANK.indexOf(w) : isComm(Z[i].use) || Z[i].use === 'multifamily' ? 2.5 : Z[i].use === 'amenity' ? 4.5 : 6.5; }; return r(a) - r(b); });
  const got = new Map(); // zone → land given (sq ft)
  if (coreCell && am >= 0) { add(am, coreCell.ring, { lake: lakeIn(Z[am]) ? need : 0 }); got.set(am, coreCell.area); }
  else if (coreCell) add(-1, coreCell.ring, { use: 'pond', lake: need });
  for (const zi of order) {
    const z = Z[zi], u = z.use, A = wantZ(zi) - (got.get(zi) || 0), w = z.place?.where || (isComm(u) || u === 'multifamily' ? 'front' : u === 'amenity' ? 'middle' : HOMES.includes(u) && Z.some(q => isComm(q.use) || q.use === 'multifamily') ? 'beside' : null);
    const nx = z.place?.next?.length ? z.place.next : w === 'beside' ? Z.map((q, i) => i).filter(i => (isComm(Z[i].use) || Z[i].use === 'multifamily') && pods.some(p => p.zone === i)).slice(0, 1) : [];
    let made = null;
    if (w === 'corner') { // the street corner the words name (else any; else the front corner on that side)
      const N = plan.ring.length, cn = S.streetCorners(plan), road = (z.place?.road || '').toLowerCase(), named = cn.filter(V => { const k = plan.ring.findIndex(p => dist(p, V) < 0.5), j = (k - 1 + N) % N; return !road || [k, j].some(e => roadIs(road, names[e])); });
      let Vs = named.length ? named : cn; if (!Vs.length) { const a = plan.ring[F.f], b = plan.ring[(F.f + 1) % N]; Vs = z.place?.side === 'right' ? [b] : z.place?.side === 'left' ? [a] : [a, b]; }
      const V = Vs[(v.corner || 0) % Vs.length], c = pool.filter(q => toPoly(V, q.ring) < 60).sort((a, b) => runOn(b, F.f) - runOn(a, F.f))[0];
      if (c) { const k = edgeOn(c, F.f) ?? c.edges.map((e, i) => i).filter(i => c.edges[i].kind === 'street')[0]; if (k != null) { const lc = localOf(c.ring, k), atEnd = Math.abs(lc.to(V)[0] - lc.L) < Math.abs(lc.to(V)[0]);
        if (c.area <= A * 1.35) { use(c); made = [add(zi, c.ring, { face: 'street' })]; } else { const res = cornerBlock(c.ring, k, A, atEnd); if (res) { use(c, res); made = [add(zi, res.pod, { face: 'street' })]; } } } }
    } else if (w === 'along' || w === 'front') { // the lot line it means: a road by name, the side street, else the front
      const j = roadEdge(plan, z.place?.road, F);
      const cand = pool.filter(c => runOn(c, j) >= 150).sort((a, b) => w === 'front' && !z.place ? dist(a.c, mainAt) - dist(b.c, mainAt) : runOn(b, j) - runOn(a, j)); if (w === 'along' && (v.along || 0) % 2 && cand.length > 1) cand.splice(0, 2, cand[1], cand[0]);
      made = []; let left = A; for (const c of cand) { if (left < Math.max(C.podMin * 0.5, A * 0.2)) break; /* (most of it in one pod: one complex, one clubhouse) */ const r = takeAlong(zi, c, edgeOn(c, j), left, isComm(u) ? 'coll' : undefined); if (r) { made.push(...r); left -= r.reduce((t, p) => t + p.area, 0); } }
    } else if (w === 'back') {
      const fy = c => F.toF(c.c)[1], cand = pool.slice().sort((a, b) => fy(b) - fy(a)); made = []; let left = A;
      for (const c of cand) { if (left < C.podMin * 0.5) break; const k = c.edges.map((e, i) => i).filter(i => c.edges[i].kind === 'street' || c.edges[i].kind === 'line').sort((a, b) => S.rotPt(S.outwardOf(c.ring, b), -F.psi)[1] - S.rotPt(S.outwardOf(c.ring, a), -F.psi)[1])[0];
        const r = k != null ? takeAlong(zi, c, k, left) : c.area <= left * 1.35 ? (use(c), [add(zi, c.ring)]) : null; if (r) { made.push(...r); left -= r.reduce((t, p) => t + p.area, 0); } }
    } else if (w === 'middle') {
      const mid = S.labelPoint(plan.ring), c = pool.slice().sort((a, b) => dist(a.c, mid) - dist(b.c, mid))[0];
      if (c) { if (c.area <= A * 1.4) { use(c); made = [add(zi, c.ring)]; } else { const k = c.edges.map((e, i) => i).filter(i => c.edges[i].kind === 'coll').sort((a, b) => toPoly(mid, [c.ring[a], c.ring[(a + 1) % c.ring.length]]) - toPoly(mid, [c.ring[b], c.ring[(b + 1) % c.ring.length]]))[0]; made = k != null ? takeAlong(zi, c, k, A) : null; } }
    } else if ((w === 'beside' || w === 'between' || w === 'around') && nx.length) {
      const cand = pool.map(c => ({ c, s: nearZone(c, nx) })).filter(x => x.s > 0).sort((a, b) => (w === 'between' ? nx.filter(j => nearZone(b.c, [j]) > 0).length - nx.filter(j => nearZone(a.c, [j]) > 0).length : 0) || b.s - a.s);
      made = []; let left = A;
      for (const { c } of cand) { if (left < C.podMin * 0.5) break; if (w === 'around') { use(c); made.push(add(zi, c.ring)); left -= c.area; continue; }
        const k = c.edges.map((e, i) => i).sort((a, b) => nearLen([c.ring[b], c.ring[(b + 1) % c.ring.length]], pods.filter(p => nx.includes(p.zone)).flatMap(p => p.ring), 64) - nearLen([c.ring[a], c.ring[(a + 1) % c.ring.length]], pods.filter(p => nx.includes(p.zone)).flatMap(p => p.ring), 64))[0], r = takeAlong(zi, c, k, left); if (r) { made.push(...r); left -= r.reduce((t, p) => t + p.area, 0); } }
    }
    if (!made?.length) { // no spot as asked (or no hint): the piece nearest what it goes with, else the biggest
      if (z.place?.where) miss++;
      const c = pool.slice().sort((a, b) => (nx.length ? nearZone(b, nx) - nearZone(a, nx) : 0) || Math.abs(a.area - A) - Math.abs(b.area - A))[0];
      if (c) { const k = c.edges.map((e, i) => i).filter(i => c.edges[i].kind === 'coll').sort((a, b) => S.edgeLen(c.ring, b) - S.edgeLen(c.ring, a))[0]; made = k != null ? takeAlong(zi, c, k, A) : (use(c), [add(zi, c.ring)]); }
    }
    for (const p of made || []) got.set(zi, (got.get(zi) || 0) + p.area);
  }
  if (am >= 0 && !coreCell && !pods.some(p => p.zone === am)) miss++;
  if (am >= 0 && !coreCell) for (const p of pods.filter(p => p.zone === am)) p.lake = lakeIn(Z[am]) ? need : 0;
  if (!pods.some(p => p.lake > 0) && need > 3000) { const fy = c => F.toF(c.c)[1], c = pool.slice().sort((a, b) => fy(b) - fy(a))[0]; // no commons lake: the detention gets a pod of its own at the back
    if (c) { const k = c.edges.map((e, i) => i).filter(i => c.edges[i].kind !== 'coll').sort((a, b) => S.edgeLen(c.ring, b) - S.edgeLen(c.ring, a))[0], ok = r => r && r.rest.some(q => { const x = cellOf(plan, sk, q); return x.area >= C.podMin && (x.coll >= C.frontMin || x.street >= 200); }); // (the land the pond doesn't need goes back to the homes)
      let res = k != null && c.area > need * 1.6 ? layer(c.ring, k, need * 1.3, 120) : null; if (!ok(res) && k != null && c.area > need * 1.6) res = slice(c.ring, k, need * 1.3); if (!ok(res)) res = null;
      if (res) { use(c, res); add(-1, res.pod, { use: 'pond', lake: need }); } else if (c.area < need * 2.2) { use(c); add(-1, c.ring, { use: 'pond', lake: need }); } } }
  // what's left: the homes that fill the site take it; else open space beside homes, land for later beside shops
  for (const c of pool.slice()) { if (fill >= 0 && c.area >= C.podMin && (c.coll >= C.frontMin || c.street >= 200)) { use(c); add(fill, c.ring); } else { use(c); greens.push(openOf(c.ring, !Z.some(z => HOMES.includes(z.use) || z.use === 'multifamily'))); } }
  if (fill >= 0 && !pods.some(p => p.zone === fill)) return null;
  for (const p of pods) { const cl = p.edges.some(e => e.kind === 'coll'); if (!cl && !p.edges.some(e => e.kind === 'street')) p.join = true; } // reached by a drive across a greenbelt (mergePods)
  // how well it went before laying anything out: land against what each zone wanted, hints, narrow or ragged pods
  let pre = 0; Z.forEach((z, i) => { if (i === fill || i === am && coreCell) return; const A = wantZ(i), g = got.get(i) || 0; pre += Math.abs(g - A) / A * 100; });
  for (const p of pods) { const b = bbox(p.ring), cmp = p.area / ((b[2] - b[0]) * (b[3] - b[1]) || 1); if (widthOf({ ring: p.ring, edges: p.edges }) < C.widthMin) pre += 40; if (cmp < 0.6) pre += 15; if (p.join) pre += 20; }
  pre += miss * 300 + greens.filter(g => g.name).reduce((t, g) => t + S.elArea(g), 0) / AC * 3;
  return { pods, greens, notes, pre, miss, key: pods.map(p => p.zone + ':' + Math.round(p.area)).join('|') };
}
const openOf = (r, later = false) => { const a = area(r); return { id: uid('o'), kind: 'green', poly: r.map(p => p.map(fit)), ...xyOf(r), name: a >= 1.5 * AC ? later ? 'Future development' : 'Open space' : '', note: a >= 1.5 * AC ? (a / AC).toFixed(1) + ' ac' + (later ? ' · not in this phase' : '') : '', trees: !later, ...(later && a >= 1.5 * AC ? { future: true } : {}) }; };
const beltGreen = r => ({ id: uid('g'), kind: 'green', poly: r.map(p => p.map(fit)), ...xyOf(r), name: '', note: 'Greenbelt · trail', trees: true, belt: true });

// ---------- one pod as a plan of its own ----------
// its ring, its front (its longest collector edge; a street edge when it faces the street) and every edge's own rules
export function podPlan(plan, pod) {
  const site = S.edgeRules(plan.ring, plan.front, plan.setbacks, plan.streets), r = pod.ring, K = pod.edges, len = k => S.edgeLen(r, k), of = kind => K.map((x, i) => x.kind === kind ? i : -1).filter(i => i >= 0).sort((a, b) => len(b) - len(a));
  const coll = of('coll'), str = of('street'), fs = (pod.face === 'street' || !coll.length || len(coll[0]) < C.frontMin) && str.length > 0, /* (a collector stub too short for a way in: the street is its front) */ front = fs ? str[0] : coll[0] ?? str[0] ?? S.longestEdge(r), fa = angOf(r, front);
  const par = k => Math.abs(((angOf(r, k) - fa) % 180 + 270) % 180 - 90) > 86 && S.outwardOf(r, k)[0] * S.outwardOf(r, front)[0] + S.outwardOf(r, k)[1] * S.outwardOf(r, front)[1] > 0.95; // the same street line as the front
  const edges = K.map((x, i) => { const s = x.j != null ? site[x.j] : null;
    if (x.kind === 'coll') return { role: fs ? 'side' : 'front', street: true, build: 20, pave: 10 };
    if (x.kind === 'entry') return { role: 'side', street: true, build: 20, pave: 10 };
    if (x.kind === 'street') return fs && (i === front || par(i)) ? { role: 'front', build: s.build, pave: s.pave } : { role: 'side', street: true, build: s.build, pave: s.pave };
    if (x.kind === 'line') return { role: s.role === 'front' ? 'side' : s.role, build: s.build, pave: s.pave };
    return { role: 'rear', build: 15, pave: 5 }; });
  return { origin: plan.origin, ring: r, front, setbacks: { ...(plan.setbacks || {}), edges }, streets: [], params: { ...(plan.params || {}), entry: { ...(plan.params?.entry || {}), style: 'driveway' }, fill: false }, elements: [] };
}
// a pod's own program: its zone's, its share of the units or floor area
function podProg(plan, prog, pod, share, fill) {
  const z = prog.zones[pod.zone], u = z.use, base = { use: u, storm: 'none', entrances: 1 }, site = area(plan.ring);
  if (isComm(u)) { const g = z.gfa || Math.max(20000, Math.min(120000, site / AC * 700)); return { ...base, gfa: Math.max(2000, Math.round(g * share / 100) * 100), floors: z.floors || undefined, buildings: z.buildings && share > 0.99 ? z.buildings : null, pads: pod.face === 'street' && z.pads ? z.pads : 0 }; }
  if (u === 'multifamily') return { ...base, units: z.units ? Math.max(8, Math.round(z.units * share)) : null, max: !z.units, floors: z.floors || undefined, ...(prog.mix ? { mix: prog.mix } : {}), perUnit: prog.zones.length ? undefined : prog.perUnit };
  if (u === 'sfr') return { ...base, units: pod.zone === fill || !z.units ? null : Math.max(4, Math.round(z.units * share)), max: pod.zone === fill || !z.units, homeMix: z.homeMix || prog.homeMix || undefined, lotD: z.lotD || prog.lotD || undefined };
  return { ...base, units: z.units ? Math.max(4, Math.round(z.units * share)) : null, max: !z.units };
}
// the angles a pod's rows may run at: square to its front, and to the street it touches (when that differs)
const alignsOf = pod => { const pp = pod.plan, r = pp.ring, out = [angOf(r, pp.front)]; for (const [k, e] of pod.edges.entries()) if (e.kind === 'street' && S.edgeLen(r, k) > 200) { const a = angOf(r, k); if (!out.some(b => Math.abs(((a - b) % 90 + 135) % 90 - 45) < 4)) out.push(a); } return out; };
// a pod laid out: the single-use engine on its own plan (the commons and a pond pod their own way); memo: shared by
// every variant of a search, so two that share a pod lay it out once
function layPod(plan, prog, pod, T, memo, pins = []) {
  const pp = pod.plan = podPlan(plan, pod), key = JSON.stringify([pp.ring.map(p => p.map(Math.round)), pp.setbacks.edges, pp.front, pod.use, pod.prog, pod.lake || 0, pins.map(e => [e.id, Math.round(e.x), Math.round(e.y)])]);
  if (memo.has(key)) return memo.get(key);
  let r = null;
  try {
    if (pod.use === 'pond') r = pondPod(pp, pod);
    else if (pod.use === 'amenity') r = T.commonsPod(pp, prog.zones[pod.zone], { pond: pod.lake || 0, aligns: alignsOf(pod), podEntry: { w: 30 } });
    else { const ids = new Set(pins.map(e => e.id)), run = pg => T.layoutCore(pp, pg, { pod: true, count: 1, depth: HOMES.includes(pod.use) ? 1 : 3, budgetMs: 0, pond: 0, aligns: alignsOf(pod), podEntry: { w: ENTRY_W[pod.use] || 30 }, ...(pins.length ? { pinned: pins } : {}) })[0]; // (pins: laid round, as a re-fit does)
      let o = run(pod.prog); if (!o && (pod.prog.units || pod.prog.gfa)) o = run({ ...pod.prog, units: null, gfa: null, buildings: null, max: true }); // more than the pod holds: as much as it does (the notes say how much)
      r = o ? { elements: o.elements.filter(e => !ids.has(e.id)), notes: o.notes, recipe: o.recipe, score: o.score } : null; }
  } catch (e) { if (globalThis.SP_DEBUG) console.log('pod failed', pod.id, pod.use, e.stack); r = null; }
  memo.set(key, r); return r;
}
// a pod that holds the detention: a pond with its trail, the rest lawn
function pondPod(pp, pod) {
  const g = S.tidyRing(S.smooth(S.tidyRing(S.grow(ccw(pp.ring), -14), 4), 3), 0.4), a = area(g); if (a < 3000) return null;
  const els = [{ kind: 'pond', poly: g, ...xyOf(g), name: 'Detention', note: 'Wet detention' }]; if (a > 15000) els.push({ kind: 'trail', path: S.tidyRing(S.grow(g, 8), 1), ...xyOf(g), width: 6, r: 0, closed: true, name: '', note: 'Walking trail' });
  return { elements: els.map(e => ({ ...e, id: uid('e') })), notes: [], recipe: { pond: true }, score: 0 };
}

// ---------- merging the pods into one plan ----------
const grownMeets = (a, b) => S.rectsOverlap({ poly: S.grow(ccw(S.outline(a)), 1.5) }, { poly: S.outline(b) }, 0);
// skeleton + pods → one plan: the pods' ways in on the collectors, a drive across to the nearest collector for a pod that
// has none, names, the checks (what fails or is cut off goes), detention, trash and signs; laid: pod id → its layout
export function mergePods(plan0, prog, sk, al, laid, T) {
  const plan = { ...plan0, program: prog }, skel = sk.els.map(e => ({ ...e })), els = skel.concat(al.greens.map(e => ({ ...e }))), notes = [];
  for (const p of al.pods) { const r = laid.get(p.id); if (r) els.push(...podEls(plan, els, p, r.elements)); else { els.push(openOf(p.ring)); if (p.zone !== fillOf(plan, prog) || p.area > 4 * AC) notes.push(word(prog.zones[p.zone], p.use) + ': one of its pods (' + (p.area / AC).toFixed(1) + ' ac) doesn’t lay out; that land is left as open space.'); } } // (never a blank hole)
  const f = finishPods(plan, prog, els, al.pods.filter(p => laid.get(p.id)), { keep: new Set(skel.map(e => e.id)) }, T); f.notes.unshift(...notes); return f;
}
// a pod's pieces on the whole plan: marked as its own; its way in meets a collector (a drive off it, not a way in from
// the street) or comes in from a street (Entrance N, numbered on from the plan's)
function podEls(plan, have, p, list) {
  const rules = S.edgeRules(plan.ring, plan.front, plan.setbacks, plan.streets), N = plan.ring.length, colls = have.filter(e => e.skel && e.kind === 'drive');
  const onStreet = e => { const s = S.outline(e); return plan.ring.some((a, k) => (rules[k].role === 'front' || rules[k].street) && s.some((q, i) => S.segSeg(q, s[(i + 1) % s.length], a, plan.ring[(k + 1) % N]) <= 2.5)); };
  let n = S.entrancesOf(have).length; const names = new Set(have.map(e => e.name)), ids = new Set(have.map(e => e.id)), was = new Map(), out = [];
  for (const e0 of list) { const e = { ...e0, pod: p.id }; if (ids.has(e.id)) { was.set(e.id, e.id = uid('e')); } ids.add(e.id); // (each pod is laid out on its own, its ids counted from 1: one already on the plan gets a new one)
    if (e.kind === 'drive' && (e.name === 'Main entry' || e.stub && e.entry)) { delete e.entry; delete e.stub; e.name = ''; // (a pod's street that meets the collector round it, lib/streetnet.mjs: its way in too)
      if (colls.some(c => grownMeets(e, c))) e.podIn = true; else if (onStreet(e)) { e.entry = true; do n++; while (names.has('Entrance ' + n)); e.name = 'Entrance ' + n; } }
    out.push(e); }
  if (was.size) for (const e of out) { if (was.has(e.of)) e.of = was.get(e.of); if (was.has(e.loop?.of)) e.loop = { ...e.loop, of: was.get(e.loop.of) }; } // (what points at a piece by its id: a sign at its entry, a drop-off loop at its building)
  return out;
}
// a straight drive (W ft) from the nearest point of a drive in `from` to the nearest of one in `to`, 400 ft at most, that
// crosses no building but homes (they make way), no pond or amenity: { els (the plan's pieces with it), j } or null
function bridge(plan, els, from, to, W, extra) {
  const pairs = [], seen = new Set(), tos = to.map(c => S.outline(c));
  for (const d of from) for (const u of S.outline(d)) for (const co of tos) { let best = null; for (let i = 0; i < co.length; i++) { const a = co[i], b = co[(i + 1) % co.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((u[0] - a[0]) * dx + (u[1] - a[1]) * dy) / L2)), q = [a[0] + dx * t, a[1] + dy * t], dd = dist(q, u); if (!best || dd < best.dd) best = { dd, u, q }; }
    if (best && best.dd <= 400 && best.dd > 1) { const k = Math.round(u[0] / 20) + ',' + Math.round(u[1] / 20); if (!seen.has(k)) { seen.add(k); pairs.push(best); } } }
  pairs.sort((a, b) => a.dd - b.dd);
  for (const x of pairs.slice(0, 12)) { // the nearest pair that can be built
    const dir = [(x.q[0] - x.u[0]) / x.dd, (x.q[1] - x.u[1]) / x.dd], path = [[x.u[0] - dir[0] * 6, x.u[1] - dir[1] * 6], [x.q[0] + dir[0] * 6, x.q[1] + dir[1] * 6]].map(q => q.map(fit)), j = { id: uid('j'), kind: 'drive', path, ...xyOf(path), width: W, r: 0, name: '', note: W + ' ft drive', ...extra }, jo = S.outline(j);
    if (els.some(e => ['building', 'pond', 'pool', 'garage', 'court', 'play'].includes(e.kind) && !(e.kind === 'building' && HOMES.includes(e.use)) && S.rectsOverlap({ poly: jo }, { poly: S.outline(e) }, 0.5))) continue;
    const gone = S.homesUnder({ ...plan, elements: els }, j, 4); return { els: S.cutRows(S.trimLots(els.filter(e => !gone.has(e)), j), jo, 1).concat([j]), j, homes: [...gone].filter(e => e.kind === 'building').length };
  }
  return null;
}
// the pods put together as one plan: a drive across to the nearest collector for a pod whose drives meet none, names
// from the main entry (opts.rename: only these pieces, round opts.taken), the checks (what fails or is cut off goes,
// opts.keep stays), detention (open space in the pods made ponds when the lake falls short), trash and signs, the zones
function finishPods(plan, prog, els, pods, opts, T) {
  const notes = [], colls = net => els.filter(e => e.skel && e.coll && net.has(e.id)), say = (p, t) => notes.push((opts.zones?.find(z => z.pod === p.id)?.name || word(prog.zones[p.zone], p.use)) + t), road = (e, net, not) => e.pod !== not && e.kind === 'drive' && e.note !== 'Drive-thru lane' && !e.bulb && net.has(e.id);
  let net = T.reach(els);
  // a collector the ways in no longer reach (moved by hand off the road it met): a short drive joins it back to the nearest
  // one they do, so the pods on it keep their way in
  for (let c; (c = els.find(e => e.skel && e.coll && e.kind === 'drive' && !e.bulb && !net.has(e.id) && !e.tried));) { c.tried = true;
    const b = bridge(plan, els, [c], els.filter(e => road(e, net)), C.w, { skel: true, coll: true, name: c.name || '', note: 'Collector · ' + C.w + ' ft' }); if (!b) continue;
    els = b.els; opts.keep?.add(b.j.id); net = T.reach(els); notes.push((c.name || 'A collector') + ' no longer met the streets, so a short drive joins it back' + (b.homes ? ' (' + b.homes + (b.homes === 1 ? ' home makes' : ' homes make') + ' way).' : '.')); }
  for (const e of els) delete e.tried;
  for (const p of pods) {
    const mine = els.filter(e => e.pod === p.id && (e.kind === 'drive' || e.kind === 'truck') && e.note !== 'Drive-thru lane'); if (!mine.length || mine.some(d => d.entry || els.some(c => c.skel && c.kind === 'drive' && net.has(c.id) && grownMeets(d, c)))) continue; // (its way in on a road of the skeleton the ways in reach: a deleted or moved collector can leave a pod's own drive meeting nothing, or nothing reached)
    const W = ENTRY_W[p.use] || 26, extra = { pod: p.id, podIn: true }, cs = colls(net);
    const b = bridge(plan, els, mine, cs.length ? cs : els.filter(e => road(e, net, p.id)), W, extra) || (cs.length ? bridge(plan, els, mine, els.filter(e => road(e, net, p.id)), W, extra) : null); // (no collector, or too far: the nearest street the ways in reach)
    if (b) { els = b.els; net = T.reach(els); }
    else { els = els.filter(e => e.pod !== p.id || e.pinned); say(p, ' has no road in' + (opts.gone ? ' since the road to it was removed' : ' from the collector') + ', so it’s left out' + (opts.gone ? '; New Layouts lays the site out again.' : '.')); } // (its pieces go, said: never cut off quietly)
  }
  const main = els.find(e => e.name === 'Main entry'), at = main ? S.centroid(S.shapeOf(main)) : S.centroid(plan.ring);
  T.nameAll(opts.rename ? els.filter(e => opts.rename.has(e)) : els.filter(e => !e.skel), at, { ...prog, unitSf: 900 }, opts.taken || new Set());
  const nH = list => list.filter(e => e.kind === 'building' && HOMES.includes(e.use)).length, hA = nH(els), tm = Date.now(), fx = repairAll(plan, els, opts.keep || new Set(), T), h0 = nH(fx.els); els = orphans(stranded({ ...plan, elements: fx.els }, T, opts.keep)); if (globalThis.SP_DEBUG) console.log('  repair', Date.now() - tm, 'ms');
  const lostH = h0 - nH(els), inWay = hA - h0, hw = n => n + (n === 1 ? ' home was' : ' homes were'), they = n => n === 1 ? 'it’s' : 'they’re';
  if (opts.say && inWay > 0) notes.push(hw(inWay) + ' in the way of what moved, so ' + they(inWay) + ' left out.'); if (opts.say && lostH > 0) notes.push(hw(lostH) + ' left with no street to them, so ' + they(lostH) + ' left out.');
  const need = S.stormNeed(area(plan.ring) / AC, plan.params || {}, prog).area, pondA = () => els.filter(e => e.kind === 'pond').reduce((t, e) => t + S.elArea(e), 0);
  if (need > 0 && pondA() < need * 0.95) { // short: the biggest open space in the pods becomes ponds
    const os = els.filter(e => e.kind === 'green' && e.name === 'Open space' && !e.pinned).sort((a, b) => S.elArea(b) - S.elArea(a));
    for (const g of os) { if (pondA() >= need * 0.95) break; const q = pondIn(g, els); if (!q) continue; const pe = { id: uid('d'), kind: 'pond', poly: q, ...xyOf(q), name: 'Detention', note: 'Wet detention', ...(g.pod ? { pod: g.pod } : {}) }; els = els.map(e => e === g ? { ...g, name: '', note: '' } : e).concat([pe]); if (area(q) > 15000) els.push({ id: uid('t'), kind: 'trail', path: S.tidyRing(S.grow(q, 8), 1), ...xyOf(q), width: 6, r: 0, closed: true, name: '', note: 'Walking trail', ...(g.pod ? { pod: g.pod } : {}) }); }
  }
  els = T.signEntry(plan, T.withTrash(plan, prog, els, notes), notes);
  const zones = zonesOf(plan, prog, pods.filter(p => p.zone >= 0 && els.some(e => e.pod === p.id)), at);
  return { elements: els, zones, notes, cut: fx.cut, bad: fx.bad.length, issues: fx.bad };
}
// a pond in an open space: the biggest simple blob round its deepest point (a rectangle along the space's own grain, cut
// to it, rounded), 12 ft in from its edge and 20 ft clear of every building, drive, parking row and amenity, so it never
// wraps round a building or runs in fingers between lots. null when none of 8,000 sq ft fits
function pondIn(g, els) {
  const s = ccw(S.shapeOf(g)), c = S.labelPoint(s), R = toPoly(c, s), a = S.mainAngle(s) * Math.PI / 180, u = [Math.cos(a), Math.sin(a)], n = [-u[1], u[0]]; if (R < 40) return null;
  const solid = els.filter(e => e !== g && !['green', 'trail', 'lot', 'sign'].includes(e.kind)).map(e => ({ q: S.shapeOf(e) })).map(x => ({ ...x, b: bbox(x.q) })), lots = els.filter(e => e.kind === 'lot').map(e => S.shapeOf(e));
  let best = null;
  for (const [kx, ky] of [[1, 1], [1.6, 1], [2.4, 1.1], [3.2, 1.3], [4.5, 1.5]]) for (const m of [1, 1.4, 2, 2.8, 4]) {
    const hx = R * kx * m, hy = R * ky * m, rect = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([x, y]) => [c[0] + u[0] * x + n[0] * y, c[1] + u[1] * x + n[1] * y]), cut = clip(s, rect).sort((x, y) => area(y) - area(x))[0]; if (!cut) continue;
    if (area(cut) < 8000 / 0.7 || area(cut) / area(hull(cut)) < 0.85 || best && area(cut) * 0.75 <= best.a) continue;
    const q = S.tidyRing(S.smooth(S.tidyRing(S.grow(ccw(cut), -12), 4), 3), 0.4); if (q.length < 4 || area(q) < 8000 || !q.every(p => S.inRing(p, s))) continue;
    const z = S.grow(q, 20), zb = bbox(z); if (solid.some(x => x.b[0] < zb[2] && zb[0] < x.b[2] && x.b[1] < zb[3] && zb[1] < x.b[3] && S.rectsOverlap({ poly: z }, { poly: x.q }, 0)) || lots.some(l => S.rectsOverlap({ poly: q }, { poly: l }, 0.5))) continue;
    best = { q, a: area(q) };
  }
  return best?.q || null;
}
const hull = pts => { const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = []; for (const p of P) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); } for (const p of P.reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); } return lo.slice(0, -1).concat(up.slice(0, -1)); };
// what a home that went leaves behind: a driveway with no building at its end, a lot with no home on it
function orphans(els) {
  const H = els.filter(e => e.kind === 'building').map(e => ({ q: S.shapeOf(e), c: [e.x, e.y] })).map(h => ({ ...h, b: bbox(h.q) }));
  const by = (e, g) => { const q = S.shapeOf(e), b = bbox(q); return H.some(h => h.b[0] < b[2] + g && b[0] < h.b[2] + g && h.b[1] < b[3] + g && b[1] < h.b[3] + g && S.gapBetween(h.q, q) <= g); };
  return els.filter(e => !(e.pod && !e.pinned && (e.kind === 'plaza' && e.note === 'Driveway' && !by(e, 4) || e.kind === 'lot' && !H.some(h => S.inRing(h.c, S.shapeOf(e))))));
}
// homes left with no street (a pod's street that broke a rule went, its homes didn't): they go too, with their lots and
// driveways; a home is on a street when it's within 60 ft of one reached from a way in
function stranded(plan, T, keep = new Set()) {
  const els = plan.elements, ok = T.reach(els), R = els.filter(e => (e.kind === 'drive' || e.kind === 'truck') && ok.has(e.id)).map(d => { const q = S.shapeOf(d); return { q, b: bbox(q) }; });
  const lost = els.filter(h => h.kind === 'building' && HOMES.includes(h.use) && !keep.has(h.id) && !R.some(r => h.x > r.b[0] - 120 && h.x < r.b[2] + 120 && h.y > r.b[1] - 120 && h.y < r.b[3] + 120 && S.gapBetween(S.shapeOf(h), r.q) <= 60)); if (!lost.length) return els;
  const gone = new Set(lost); for (const h of lost) { for (const a of S.attachedTo(plan, h)) gone.add(a); const c = [h.x, h.y]; for (const l of els) if (l.kind === 'lot' && S.inRing(c, S.shapeOf(l))) gone.add(l); }
  if (globalThis.SP_DEBUG) console.log('  stranded homes', lost.length); return els.filter(e => !gone.has(e));
}
// repair() for a whole plan of pods, checking no more often than it must (each check of a 250 acre plan takes seconds):
// what fails goes (the skeleton stays), then what's cut off from the ways in; the problems left
function repairAll(plan, els, keep, T) {
  let out = els, issues = S.check({ ...plan, elements: out });
  for (let pass = 0; pass < 3; pass++) { const ids = new Set(issues.filter(i => i.level === 'bad' && i.id && !keep.has(i.id)).map(i => i.id)); if (!ids.size) break; if (globalThis.SP_DEBUG) console.log('  repair drops', issues.filter(i => i.level === 'bad' && ids.has(i.id)).map(i => i.text).slice(0, 12).join('; ')); out = out.filter(e => !ids.has(e.id) || e.name === 'Main entry'); issues = S.check({ ...plan, elements: out }); }
  const ok = T.reach(out), cut = out.filter(e => (e.kind === 'drive' || e.kind === 'truck' || e.kind === 'parking') && !ok.has(e.id) && e.note !== 'Drive-thru lane' && !keep.has(e.id));
  if (cut.length) { if (globalThis.SP_DEBUG) console.log('  repair cuts', cut.map(e => e.kind + ' ' + (e.note || e.name || '') + ' ' + e.pod + '@' + Math.round(e.x) + ',' + Math.round(e.y)).slice(0, 12).join('; ')); const gone = new Set(cut); out = out.filter(e => !gone.has(e)); issues = S.check({ ...plan, elements: out }); }
  return { els: out, cut: cut.length, bad: issues.filter(i => i.level === 'bad') };
}
// one plan zone a pod, named: the part's word or name, "· Section n" when the part has more than one pod (from the main entry)
function zonesOf(plan, prog, pods, at) {
  return pods.map(p => ({ p, d: dist(p.c || S.centroid(p.ring), at) })).sort((a, b) => a.d - b.d).map(({ p }, i, all) => { const z = prog.zones[p.zone], mine = all.filter(x => x.p.zone === p.zone), k = mine.findIndex(x => x.p === p) + 1;
    return { name: word(z, z.use === 'sfr' ? 'sfr' : z.use) + (mine.length > 1 ? ' · Section ' + k : ''), use: z.use, zone: p.zone, ring: p.ring.map(q => q.map(fit)), acres: +((p.area || area(p.ring)) / AC).toFixed(2), pod: p.id, section: mine.length > 1 ? k : null }; });
}

// ---------- re-fit, re-lay, swap ----------
const podsOf = rc => rc.list.map(p => ({ ...p, edges: p.edges, area: area(p.ring), c: S.centroid(p.ring) }));
const listOf = (pods, laid) => pods.map(p => ({ id: p.id, zone: p.zone, use: p.use, ring: p.ring, edges: p.edges, face: p.face || 'coll', front: p.plan?.front ?? p.front, lake: p.lake || 0, prog: p.prog || null, recipe: laid?.get(p.id)?.recipe || p.recipe || null, mix: JSON.stringify(p.prog?.homeMix || null) }));
// the plan re-fitted round what was moved or added by hand (pinned): the skeleton as it is now; each pod with a pinned
// piece in it (or a new home mix) laid out again round it by its own recipe, every other pod's pieces exactly as they
// were. opts as refit()'s (amount, keep). Returns { elements, notes, zones, recipe }
export function refitPods(plan0, opts = {}, T) {
  const plan = { ...plan0, setbacks: { ...S.SETBACKS, ...(plan0.setbacks || {}) } }, rc = plan.recipe.pods, prog = S.normalizeProgram(plan.recipe.prog || plan.program), els0 = plan.elements || [], pods = podsOf(rc), notes = [];
  const over = (e, p) => { const s = S.shapeOf(e); return S.inRing(S.centroid(s), p.ring) || S.rectsOverlap({ poly: s }, { poly: p.ring }, 0.5); };
  // what was moved or added by hand: a piece belongs to the pod it now stands in (the one it was in is laid out again too,
  // to fill where it was); a collector moved by hand is kept off by the pods it now runs into
  const moved = els0.filter(e => e.pinned && !e.skel).map(e => { const q = podAt(pods, e); return q && q.id !== e.pod ? { ...e, pod: q.id, from: e.pod } : e; }), from = new Set(moved.map(e => e.from).filter(Boolean)), roads = els0.filter(e => e.pinned && e.skel && e.kind === 'drive');
  const nameOf = p => plan.zones?.find(z => z.pod === p.id)?.name || word(prog.zones[p.zone], p.use), pinned = moved.map(e => { const { from, ...q } = e; return q; }), pinIds = new Set(pinned.concat(roads).map(e => e.id)), byId = new Map(pinned.map(e => [e.id, e]));
  let els = els0.filter(e => !e.pod || e.pinned).map(e => ({ ...(byId.get(e.id) || e) })); const rename = new Set(), redo = opts.relay || new Set();
  for (const p of pods) {
    const mine = els0.filter(e => e.pod === p.id && !e.pinned), pins = pinned.filter(e => e.pod === p.id || over(e, p)).concat(roads.filter(e => S.rectsOverlap({ poly: S.shapeOf(e) }, { poly: p.ring }, 2))), mixed = p.use === 'sfr' && p.mix !== JSON.stringify(p.prog?.homeMix || null);
    if (!pins.length && !mixed && !redo.has(p.id) && !from.has(p.id) || p.use === 'pond') { els.push(...mine.map(e => ({ ...e }))); continue; }
    const pp = { ...podPlan(plan, p), program: p.prog, recipe: p.recipe, elements: mine.concat(pins.map(e => ({ ...e }))) }; let r = null;
    try { r = p.use === 'amenity' ? T.commonsPod(pp, prog.zones[p.zone], { pond: p.lake || 0, recipe: p.recipe?.commons ? p.recipe : null, keep: pins.map(e => S.grow(ccw(S.shapeOf(e)), e.kind === 'building' ? 14 : 4)), solid: pins.map(e => S.shapeOf(e)) }) : p.recipe ? T.refitRecipe(pp, { amount: opts.amount, pod: true }) : null; } catch (e) { r = null; }
    if (!r?.elements?.length) { const cut = pins.filter(e => roads.includes(e)).map(e => S.grow(ccw(S.outline(e)), 12)); let lake = false; // (a pond a moved road runs into is cut back from it, not lost: it holds the detention)
      els.push(...mine.map(e => { const q = e.kind === 'pond' && cut.some(c => S.rectsOverlap({ poly: c }, { poly: S.shapeOf(e) }, 0.5)) ? minus(S.shapeOf(e), cut).sort((a, b) => area(b) - area(a))[0] : null; if (!q || area(q) < 3000) return { ...e }; lake = true; return { ...e, poly: q.map(v => v.map(fit)), ...xyOf(q) }; }));
      notes.push(nameOf(p) + ': kept as it was (it doesn’t lay out again round what moved)' + (lake ? '; its pond is cut back from the road.' : '.')); continue; }
    const fresh = podEls(plan, els, p, r.elements.filter(e => !pinIds.has(e.id))); for (const e of fresh) { els.push(e); rename.add(e); }
    if (mixed) p.mix = JSON.stringify(p.prog?.homeMix || null); notes.push(...(r.notes || []).filter(t => !/^Parking is/.test(t)));
    const amt = list => list.filter(e => e.kind === 'building' && e.use === p.use).reduce((t, e) => t + (e.units || S.gfaOf(e)), 0), a0 = amt(mine.concat(pins.filter(e => e.pod === p.id))), a1 = amt(fresh.concat(pins.filter(e => e.pod === p.id)));
    if (a0 > 0 && a1 < a0 * 0.95) { const u = mine.some(e => e.units), f = v => Math.round(v).toLocaleString('en-US'); notes.push(nameOf(p) + ': ' + f(a1) + (u ? ' units' : ' sq ft') + ' round what moved, ' + f(a0) + ' before.'); } // (never a quiet drop)
  }
  const keep = new Set(els.filter(e => e.skel || e.pinned).map(e => e.id)), taken = new Set(els.filter(e => e.kind === 'building' && !rename.has(e)).map(e => e.name).filter(Boolean));
  const gone = (rc.skel || []).some(id => !els0.some(e => e.id === id)); // (a piece of the skeleton deleted: a pod cut off by it says so)
  const f = finishPods(plan, prog, els, pods, { keep, taken, rename, say: true, zones: plan.zones, gone }, T), m = S.metrics({ ...plan, program: prog, elements: f.elements });
  if (m.required > m.spaces) notes.push('Parking is ' + S.spacesWord(m.required - m.spaces) + ' short of ' + m.required + '.');
  notes.push(...f.issues.map(i => i.text + '.')); // (the whole plan's problems left, not a pod's own: its outline isn't a lot line)
  return { elements: S.seatAll({ ...plan, elements: f.elements }), notes: notes.concat(f.notes), zones: f.zones, recipe: { ...plan.recipe, pods: { ...rc, list: rc.list.map(q => ({ ...q, mix: pods.find(p => p.id === q.id)?.mix ?? q.mix })) } } };
}
// the pod a piece stands in now (its middle in the pod's outline), else null
const podAt = (pods, e) => { const c = S.centroid(S.shapeOf(e)); return pods.find(p => S.inRing(c, p.ring)) || null; };
// "re-lay this pod", "swap the apartments and the retail pods": req [{ op: 'relay', pod, use?, units?, gfa?, floors? } | { op:
// 'swap', a, b }] (pod ids, with or without 'pod:'). The pods named are laid out afresh (a new use or size where asked:
// a use the program doesn't have becomes a zone of its own, and the program comes back too); the rest stays as it is.
// Returns { elements, zones, recipe, program?, notes } or { error }
export function relayPods(plan0, req, T) {
  const rc = plan0.recipe?.pods; if (!rc) return { error: 'Only a plan laid out in pods can re-lay a pod: New Layouts with Settings › Mixed sites › Pods.' };
  const plan = { ...plan0, setbacks: { ...S.SETBACKS, ...(plan0.setbacks || {}) } }, pods = podsOf(rc), notes = [], redo = new Set(), byId = id => pods.find(p => p.id === String(id || '').replace(/^pod:/, ''));
  let prog = S.normalizeProgram(plan0.recipe.prog || plan0.program), grew = false; const moved = new Set();
  const nm = p => word(prog.zones[p.zone], p.use).replace(/^The /, 'the '), fixed = p => p.use === 'amenity' || p.use === 'pond';
  for (const q of req || []) {
    if (q.op === 'relay') { const p = byId(q.pod); if (!p) { notes.push('No such pod on the plan.'); continue; } if (fixed(p)) { notes.push('The commons and its lake hold the detention: they stay where they are.'); continue; }
      if (q.use && q.use !== p.use && S.USES[q.use] && q.use !== 'amenity') { moved.add(p.id); let zi = prog.zones.findIndex(z => z.use === q.use); if (zi < 0) { prog = { ...prog, zones: prog.zones.concat([{ use: q.use, gfa: q.gfa || null, units: q.units || null, floors: null, buildings: null, pads: null, items: null, name: null, partName: null }]) }; zi = prog.zones.length - 1; grew = true; } p.zone = zi; p.use = q.use; p.face = undefined; }
      if (q.units || q.gfa || q.floors) p.ask = { units: q.units || null, gfa: q.gfa || null, floors: q.floors > 0 ? Math.max(1, Math.min(40, Math.round(q.floors))) : null }; redo.add(p.id); }
    else if (q.op === 'swap') { const a = byId(q.a), b = byId(q.b); if (!a || !b || a === b) { notes.push('Name two pods to swap.'); continue; } if (fixed(a) || fixed(b)) { notes.push('The commons and its lake hold the detention: they stay where they are.'); continue; }
      const A = nm(a), B = nm(b); [a.zone, b.zone] = [b.zone, a.zone]; [a.use, b.use] = [b.use, a.use]; a.face = b.face = undefined; redo.add(a.id); redo.add(b.id); moved.add(a.id); moved.add(b.id); notes.push('Swapped ' + A + ' and ' + B + '.'); }
  }
  if (!redo.size) return { error: notes.join(' ') || 'Nothing to re-lay.' };
  // a zone whose last pod became another use goes from the program (it asks for nothing now), the zones after it renumbered
  for (let zi = prog.zones.length - 1; zi >= 0; zi--) if (!pods.some(p => p.zone === zi) && (plan0.recipe.pods.list || []).some(p => p.zone === zi)) { prog = { ...prog, zones: prog.zones.filter((_, i) => i !== zi).map(z => z.place?.next ? { ...z, place: { ...z.place, next: z.place.next.filter(j => j !== zi).map(j => j > zi ? j - 1 : j) } } : z) }; for (const p of pods) if (p.zone > zi) p.zone--; grew = true; }
  // pieces moved by hand in a pod laid out again: kept, and the pod laid round them; a pod that changes use (a swap, a new
  // use) starts clean, its own pinned pieces (of the use it had) going, said
  const pinsIn = p => (plan0.elements || []).filter(e => e.pinned && !e.skel && (podAt(pods, e)?.id ?? e.pod) === p.id), drop = new Set(); // (by where it stands now: a shop dragged into the homes is theirs)
  for (const p of pods.filter(p => moved.has(p.id))) { const own = pinsIn(p).filter(e => e.pod === p.id); if (own.length) { own.forEach(e => drop.add(e.id)); notes.push('Where ' + nm(p) + ' now goes, ' + (own.length === 1 ? 'a piece moved by hand went' : own.length + ' pieces moved by hand went') + ' with what was there.'); } }
  const fill = fillOf(plan, prog), zArea = zi => pods.filter(p => p.zone === zi).reduce((t, p) => t + p.area, 0), memo = new Map(), laid = new Map();
  for (const p of pods.filter(p => redo.has(p.id))) {
    const pins = pinsIn(p).filter(e => !drop.has(e.id)), one = q => { q.prog = podProg(plan, prog, q, q.area / zArea(q.zone), fill); if (p.ask) Object.assign(q.prog, p.ask.units ? { units: p.ask.units, max: false } : {}, p.ask.gfa ? { gfa: p.ask.gfa } : {}, p.ask.floors && q.use !== 'sfr' ? { floors: p.ask.floors } : {}); return layPod(plan, prog, q, T, memo, pins); };
    let r = one(p); if (isComm(p.use) && p.edges.some(e => e.kind === 'street') && p.edges.some(e => e.kind === 'coll')) { const q = { ...p, face: 'street' }, r2 = one(q); if (r2 && (!r || (r2.score ?? -1e9) > (r.score ?? -1e9) + 20)) { r = r2; Object.assign(p, { face: 'street', prog: q.prog, plan: q.plan }); } }
    if (!r) { notes.push(nm(p).replace(/^./, c => c.toUpperCase()) + ': nothing lays out there.'); continue; } laid.set(p.id, r); if (!notes.some(t => /^Swapped/.test(t))) notes.push('Re-laid ' + nm(p) + '.');
  }
  let els = (plan0.elements || []).filter(e => !(laid.has(e.pod) && !e.pinned) && !drop.has(e.id)).map(e => ({ ...e })); const rename = new Set();
  for (const p of pods) if (laid.has(p.id)) for (const e of podEls(plan, els, p, laid.get(p.id).elements)) { els.push(e); rename.add(e); }
  const keep = new Set(els.filter(e => e.skel || e.pinned).map(e => e.id)), taken = new Set(els.filter(e => e.kind === 'building' && !rename.has(e)).map(e => e.name).filter(Boolean));
  const f = finishPods({ ...plan, program: prog }, prog, els, pods, { keep, taken, rename, say: true, zones: plan0.zones }, T);
  for (const h of hintsMet(plan, prog, f.elements, f.zones)) if (!h.ok) notes.push(h.text.replace(/\.$/, ' any more.'));
  for (const z of prog.zones) { const i = prog.zones.indexOf(z), mine = pods.filter(p => p.zone === i && laid.has(p.id)); if (!mine.length || !(z.units || z.gfa)) continue; const B = f.elements.filter(e => e.kind === 'building' && e.use === z.use), v = z.units ? B.reduce((t, e) => t + (e.units || 0), 0) : Math.round(B.reduce((t, e) => t + S.gfaOf(e), 0)), t = z.units || z.gfa; if (v < t * 0.97) notes.push(word(z, z.use) + ': fits about ' + v.toLocaleString('en-US') + ' of ' + t.toLocaleString('en-US') + (z.units ? ' units.' : ' sq ft.')); }
  const recipe = { ...plan0.recipe, prog, pods: { ...rc, list: listOf(pods, laid) } };
  return { elements: f.elements, zones: f.zones, recipe, ...(grew ? { program: { ...(plan0.program || {}), zones: prog.zones } } : {}), notes: notes.concat(f.notes) };
}

// ---------- placement: was each hint met ----------
// [{ zone, where, ok, text }] for every zone with a placement, by the zones as drawn (plan.zones / option zones: a band
// layout's too)
export function hintsMet(plan, prog, els, zones) {
  const Z = prog.zones || [], out = [], ring = plan.ring, N = ring.length, names = plan.streetNames || {}, rules = S.edgeRules(ring, plan.front, plan.setbacks, plan.streets), F = siteFrame(plan);
  const ringsOf = i => (zones || []).filter(z => z.zone === i && z.ring?.length >= 3).map(z => z.ring), runOn = (r, j) => r.reduce((t, p, k) => { const q = r[(k + 1) % r.length]; return t + (S.segDist([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], ring[j], ring[(j + 1) % N]) < 3 ? dist(p, q) : 0); }, 0);
  const nm = j => names[j] || (j === F.f ? 'the front street' : rules[j]?.street ? 'the side street' : 'the lot line'), W = i => word(Z[i], Z[i].use), isnt = i => /s$/i.test(W(i)) && !/commons$/i.test(W(i)) ? ' aren’t' : ' isn’t'; // (“Apartments aren’t”, “the commons isn’t”)
  Z.forEach((z, i) => { const pl = z.place; if (!pl?.where) return; const R = ringsOf(i), w = pl.where; let ok = false, text = '';
    if (w === 'corner') { const cn = S.streetCorners(plan), fc = [ring[F.f], ring[(F.f + 1) % N]], Vs = cn.length ? cn : pl.side === 'right' ? [fc[1]] : pl.side === 'left' ? [fc[0]] : fc, V = Vs.find(V => R.some(r => toPoly(V, r) < 60)); ok = !!V; const k = V ? ring.findIndex(p => dist(p, V) < 0.5) : -1; // (no side street: the front corner on the side asked, as allocate puts it)
      text = ok ? cn.length ? W(i) + ' at the corner of ' + nm(k) + ' and ' + nm((k - 1 + N) % N) + '.' : W(i) + ' at the ' + (pl.side ? pl.side + ' ' : '') + 'front corner (no side street is marked).' : W(i) + isnt(i) + ' at the corner' + (cn.length ? '.' : ': no side street is marked (Side Street on the toolbar).'); }
    else if (w === 'along' || w === 'front') { const j = roadEdge(plan, pl.road, F);
      ok = R.some(r => runOn(r, j) >= 150); text = ok ? W(i) + ' along ' + nm(j) + '.' : W(i) + isnt(i) + ' along ' + nm(j) + '.'; }
    else if (w === 'back') { const ys = F.rr.map(p => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys); ok = R.some(r => F.toF(S.centroid(r))[1] > y0 + (y1 - y0) * 0.55); text = ok ? W(i) + ' at the back.' : W(i) + isnt(i) + ' at the back.'; }
    else if (w === 'middle') { const m = S.labelPoint(ring), d = Math.sqrt(area(ring)) * 0.22; ok = R.some(r => S.inRing(m, r) || dist(S.centroid(r), m) < d); text = ok ? W(i) + ' in the middle.' : W(i) + isnt(i) + ' in the middle.'; }
    else if (w === 'around' || w === 'beside' || w === 'between') { const nx = (pl.next || []).filter(j => j !== i && Z[j]); if (!nx.length) return; const g = w === 'around' ? 70 : 64;
      if (w === 'around') { const J = nx.flatMap(ringsOf), per = J.reduce((t, r) => t + r.reduce((s, p, k) => s + dist(p, r[(k + 1) % r.length]), 0), 0), by = J.reduce((t, r) => t + nearLen(r, R.flat().length ? R.flatMap(q => q.concat([q[0]])) : [[1e9, 1e9]], g), 0); ok = per > 0 && R.length > 0 && by >= per * 0.6; }
      else ok = nx.every(j => ringsOf(j).some(r => R.some(q => near(q, r, g))));
      text = ok ? W(i) + ' ' + PLACE_WORDS[w] + ' ' + nx.map(W).join(' and ').replace(/^The /, 'the ') + '.' : W(i) + isnt(i) + ' ' + PLACE_WORDS[w] + ' ' + nx.map(W).join(' and ').replace(/^The /, 'the ') + '.'; }
    out.push({ zone: i, where: w, ok, text }); });
  return out;
}

// ---------- one score for bands and pods ----------
// higher is better (parts on o.scoreParts): the program, parking, checks, pieces cut, detention, street per home,
// storefronts on a street, the walk to the commons, entrance spacing, placement hints, ways in crowded on a collector
export function planScore(plan, prog, o, T, extra = {}) {
  const p = { ...plan, program: o.program || prog, elements: o.elements, zones: o.zones }, m = S.metrics(p), Z = prog.zones || [], els = o.elements, fill = fillOf(plan, prog), parts = {};
  let got = 0, n = 0; Z.forEach((z, i) => { if (z.use === 'amenity' || z.use === 'garage') return; n++; const B = els.filter(e => e.kind === 'building' && e.use === z.use), v = z.units || ['multifamily', ...HOMES].includes(z.use) ? B.reduce((s, e) => s + (e.units || 0), 0) : B.reduce((s, e) => s + S.gfaOf(e), 0), t = z.units || z.gfa; got += t ? Math.min(1, v / t) - (i === fill ? 0 : Math.max(0, v / t - 1.1) * 0.5) : Math.min(1, v / 1e5); });
  parts.program = got / Math.max(1, n) * 1000;
  parts.parking = -Math.max(0, m.required - m.spaces) / Math.max(1, m.required) * 1500;
  parts.checks = -(extra.bad ?? S.check(p).filter(i => i.level === 'bad').length) * 500 - (extra.cut ?? o.cut ?? 0) * 40;
  const need = S.stormNeed(area(plan.ring) / AC, plan.params || {}, prog).area; parts.detention = need > 0 ? -Math.max(0, need * 0.95 - (m.pond || 0)) / need * 400 : 0;
  const homes = els.filter(e => e.kind === 'building' && HOMES.includes(e.use)), nh = homes.reduce((t, e) => t + (e.units || 1), 0);
  if (nh) { const L = els.filter(e => e.kind === 'drive' && !/drive aisle$|Drive-thru/.test(e.note || '') && e.name !== 'Main entry' && !e.bulb && !e.turn).reduce((t, e) => t + (e.path ? e.path.reduce((s, q, k) => k ? s + dist(q, e.path[k - 1]) : 0, 0) : e.poly ? 0 : Math.max(e.w || 0, e.d || 0)), 0); parts.street = -Math.max(0, L / nh - 55) * 4; } else parts.street = 0;
  const shops = els.filter(e => e.kind === 'building' && isComm(e.use)), sa = shops.reduce((t, e) => t + S.gfaOf(e), 0), rules = S.edgeRules(plan.ring, plan.front, plan.setbacks, plan.streets), N = plan.ring.length;
  const onSt = r => r.some((q, k) => { const w = r[(k + 1) % r.length], mm = [(q[0] + w[0]) / 2, (q[1] + w[1]) / 2]; return plan.ring.some((a, j) => (rules[j].role === 'front' || rules[j].street) && S.segDist(mm, a, plan.ring[(j + 1) % N]) < 3); });
  const stZ = (o.zones || []).filter(z => isComm(z.use) && z.ring?.length >= 3 && onSt(z.ring)).map(z => z.ring), inSt = shops.filter(e => stZ.some(r => S.inRing([e.x, e.y], r))).reduce((t, e) => t + S.gfaOf(e), 0);
  parts.frontage = (T?.frontScore ? T.frontScore(plan, els) : 0) + (sa ? 60 * inSt / sa : 0);
  const cc = els.find(e => e.name === 'Community center') || els.find(e => e.kind === 'pond' && e.name === 'Amenity lake');
  parts.walk = cc && homes.length ? -Math.max(0, homes.reduce((t, e) => t + dist([e.x, e.y], [cc.x, cc.y]), 0) / homes.length - 1200) / 10 : 0;
  parts.entries = -80 * S.entryIssues(p).length;
  const hm = hintsMet(plan, prog, els, o.zones); parts.hints = -300 * hm.filter(h => !h.ok).length;
  const ins = els.filter(e => e.podIn), cs = els.filter(e => e.coll); let crowd = 0; for (let i = 0; i < ins.length; i++) for (let j = 0; j < i; j++) if (dist([ins[i].x, ins[i].y], [ins[j].x, ins[j].y]) < 150 && cs.some(c => grownMeets(ins[i], c) && grownMeets(ins[j], c))) crowd++;
  parts.access = -30 * crowd;
  o.scoreParts = parts; return Object.values(parts).reduce((a, b) => a + b, 0);
}

// ---------- the search ----------
const KIND_NAME = { core: 'loop road round the lake', loop: 'loop road', spine: 'spine road' };
// skeletons × pod assignments, ranked cheaply, laid out within the time budget; the best two of different kinds
export function podsOptions(plan0, prog, opts = {}, T) {
  const plan = { ...plan0, setbacks: { ...S.SETBACKS, ...(plan0.setbacks || {}) } }, t0 = Date.now(), ac = area(plan.ring) / AC, budget = opts.podBudgetMs ?? Math.max(6000, Math.min(30000, 3000 + 100 * ac)), memo = opts.podMemo || new Map(), dbg = globalThis.SP_DEBUG, fill = fillOf(plan, prog);
  const Z = prog.zones || [], hasCorner = Z.some(z => z.place?.where === 'corner'), hasAlong = Z.some(z => z.place?.where === 'along');
  const vs = [{}].concat(hasCorner ? [{ corner: 1 }] : [], hasAlong ? [{ along: 1 }] : []), cells = new Map(); // (cellsOf adds the greenbelts it cuts to its skeleton: once each)
  let sks = []; try { sks = skeletons(plan, prog, opts); } catch (e) { if (dbg) console.log('skeletons failed', e.stack); }
  for (const sk of sks) try { cells.set(sk, cellsOf(plan, sk)); } catch (e) { if (dbg) console.log('cells failed', e.stack); }
  // every skeleton's allocations, cheapest first, one of each kind before the second of any
  const variants = scale => { const cand = []; for (const [sk, cs] of cells) for (const v0 of vs) { const v = { ...v0, ...(scale ? { scale } : {}) }; let al = null; try { al = allocate(plan, prog, sk, cs.map(c => ({ ...c })), v); } catch (e) { if (dbg) console.log('allocate failed', e.stack); } if (al && !cand.some(c => c.sk === sk && c.al.key === al.key)) cand.push({ sk, v, al }); }
    cand.sort((a, b) => a.al.pre - b.al.pre); if (dbg) console.log('candidates', cand.map(c => c.sk.kind + (c.sk.D || '') + '@' + c.sk.at + ' ' + c.al.pre.toFixed(0)).join(', ')); const order = [], seen = new Set(); for (const c of cand) if (!seen.has(c.sk.kind)) { seen.add(c.sk.kind); order.push(c); } for (const c of cand) if (!order.includes(c)) order.push(c); return order; };
  const shareOf = al => { const m = new Map(); for (const p of al.pods) if (p.zone >= 0) m.set(p.zone, (m.get(p.zone) || 0) + p.area); return m; };
  // a pod laid out (the program's share for its land), shops that touch a street and a collector both ways round, the better kept
  const lay = (p, share) => { if (p.zone >= 0 && p.use !== 'amenity') p.prog = podProg(plan, prog, p, p.area / share.get(p.zone), fill); let r = layPod(plan, prog, p, T, memo); const st = p.edges.some(e => e.kind === 'street');
    if (p.zone >= 0 && isComm(p.use) && st && (p.edges.some(e => e.kind === 'coll') || !r)) { const q = { ...p, face: p.face === 'street' ? 'coll' : 'street' }; q.prog = podProg(plan, prog, q, p.area / share.get(p.zone), fill); const r2 = layPod(plan, prog, q, T, memo); if (r2 && (!r || (r2.score ?? -1e9) > (r.score ?? -1e9) + 20)) { r = r2; Object.assign(p, { face: q.face, prog: q.prog, plan: q.plan }); } }
    return r; };
  let order = variants(null);
  // a first look at the sized uses (shops and apartments lay out in well under a second): land a pod didn't use (a big
  // lawn) goes back to the homes, and a use that came up short gets more; then the pods are carved again
  const measure = c => { const sh = shareOf(c.al), got = new Map(); // each sized use's land, lawn left over and what it holds, in a variant's pods
    for (const p of c.al.pods) { const z = Z[p.zone]; if (p.zone < 0 || p.zone === fill || p.use === 'amenity' || !(z.units || z.gfa) || Date.now() - t0 > budget * 0.3) continue; const r = lay(p, sh); if (!r) continue;
      const g = got.get(p.zone) || { given: 0, lawn: 0, v: 0 }; g.given += p.area; g.lawn += r.elements.filter(e => e.kind === 'green' && !e.belt && (!e.name || e.name === 'Open space') && S.elArea(e) >= 15000).reduce((t, e) => t + S.elArea(e), 0);
      const B = r.elements.filter(e => e.kind === 'building' && e.use === p.use); g.v += z.units ? B.reduce((t, e) => t + (e.units || 0), 0) : B.reduce((t, e) => t + S.gfaOf(e), 0); got.set(p.zone, g); }
    return got; };
  if (order.length) { const got = measure(order[0]), need = S.stormNeed(ac, plan.params || {}, prog).area, scale = {};
    for (const [zi, g] of got) { const z = Z[zi], f = g.v / (z.units || z.gfa), land = Math.max(g.given * 0.5, Math.min(g.given * 1.6, (g.given - g.lawn * 0.7) * 1.05 / Math.min(1, Math.max(f, 0.3)))); if (Math.abs(land - g.given) > g.given * 0.1) scale[zi] = land / wantOf(z, area(plan.ring), need); } // (the land it used, more where it came up short)
    if (Object.keys(scale).length) { const o2 = variants(scale), chk = o2.length ? measure(o2[0]) : new Map(); // carved again: a use that now holds less than it did (and less than asked) keeps its first share
      for (const zi of Object.keys(scale)) { const g = chk.get(+zi), t = Z[zi].units || Z[zi].gfa; if (!g || g.v < t * 0.97 && g.v < got.get(+zi).v) delete scale[zi]; }
      order = Object.keys(scale).length ? variants(scale) : order; if (dbg) console.log('scale', JSON.stringify(scale), JSON.stringify([...got]), JSON.stringify([...chk])); } }
  const done = []; let last = 0; // (a variant takes about as long as the last one did: none started that would run past the budget)
  for (const c of order) {
    if (done.length >= 4 || done.length && Date.now() - t0 + last * 0.8 > budget) break;
    const laid = new Map(), t1 = Date.now(); let over = false;
    const share = shareOf(c.al);
    for (const p of c.al.pods) { if (done.length && Date.now() - t0 > budget * 1.3) { over = true; break; } const tp = Date.now(), r = lay(p, share);
      if (dbg) console.log('  pod', p.id, p.use, (p.area / AC).toFixed(1) + ' ac', p.face || '', Date.now() - tp + ' ms', r ? r.elements.length + ' pieces' : 'FAILED'); laid.set(p.id, r); }
    if (over) break;
    let m; try { m = mergePods(plan, prog, c.sk, c.al, laid, T); } catch (e) { if (dbg) console.log('merge failed', e.stack); continue; }
    const lost = Z.map((z, i) => i).filter(i => Z[i].use !== 'amenity' && Z[i].use !== 'garage' && !m.elements.some(e => e.kind === 'building' && e.use === Z[i].use)); // a use with nothing laid out: not offered (the notes would hide it)
    if (lost.length) { if (dbg) console.log('  dropped: nothing of', lost.map(i => Z[i].use).join(', ')); last = Date.now() - t1; continue; }
    const o = { elements: m.elements, zones: m.zones, program: prog, cut: m.cut };
    const hm = hintsMet(plan, prog, m.elements, m.zones), mm = S.metrics({ ...plan, program: prog, elements: m.elements }), notes = [...m.notes];
    for (const h of hm) notes.push(h.text);
    for (const [i, z] of Z.entries()) { if (z.use === 'amenity' || z.use === 'garage') continue; const B = m.elements.filter(e => e.kind === 'building' && e.use === z.use), t = z.units || z.gfa; if (!t) continue; const v = z.units ? B.reduce((s, e) => s + (e.units || 0), 0) : Math.round(B.reduce((s, e) => s + S.gfaOf(e), 0)), W0 = { retail: 'Retail', multifamily: 'Apartments', townhomes: 'Townhomes', duplex: 'Duplexes', sfr: 'Single-family', office: 'Office', medical: 'Medical', restaurant: 'Restaurants' }[z.use] || 'Commercial';
      if (v < t * 0.97) notes.push(W0 + ': fits about ' + v.toLocaleString('en-US') + ' of ' + t.toLocaleString('en-US') + (z.units ? ' units.' : ' sq ft.')); else if (v > t * 1.05 && i === fill) notes.push(W0 + ': ' + t.toLocaleString('en-US') + ' homes asked for (phase 1); the land holds ' + v.toLocaleString('en-US') + ' in all, so the rest can be a later phase.'); }
    if (mm.required > mm.spaces) notes.push('Parking is ' + S.spacesWord(mm.required - mm.spaces) + ' short of ' + mm.required + '.');
    const need = S.stormNeed(ac, plan.params || {}, prog).area; if (need > 0 && mm.pond < need * 0.9) notes.push('Ponds hold about ' + Math.round(mm.pond / need * 100) + '% of the detention the site needs (' + (need / AC).toFixed(1) + ' acres); plan on underground storage or a regional facility for the rest.');
    const nPods = c.al.pods.length; notes.push('Laid out in ' + nPods + ' pods round a ' + (c.sk.kind === 'spine' ? 'spine road' : 'loop road') + '; each has its own street direction.');
    o.score = planScore(plan, prog, o, T, { bad: m.bad, cut: m.cut });
    const recipe = { pods: { v: 1, kind: c.sk.kind, at: c.sk.at, D: c.sk.D, skel: c.sk.els.map(e => e.id), ring: plan.ring.map(p => p.slice()), list: listOf(c.al.pods.filter(p => laid.get(p.id)), laid) }, prog };
    const sz = { units: m.elements.filter(e => e.kind === 'building').reduce((t, e) => t + (e.units || 0), 0), gfa: m.elements.filter(e => e.kind === 'building').reduce((t, e) => t + S.gfaOf(e), 0) };
    done.push({ name: 'Pods · ' + KIND_NAME[c.sk.kind] + (c.sk.D ? ' ' + c.sk.D + ' ft in' : '') + (c.sk.at !== 0.5 ? ' · side entry' : ''), elements: m.elements, notes, zones: m.zones, program: prog, phi: c.sk.F.psi - 90, score: o.score, scoreParts: o.scoreParts, recipe, sizes: sz, style: 'pods', ownEntrances: S.entrancesOf(m.elements).length >= 3 });
    last = Date.now() - t1; if (dbg) console.log('pods', c.sk.kind, c.sk.D, c.sk.at, JSON.stringify(c.v), 'pods', nPods, 'ms', Date.now() - t1, 'score', o.score.toFixed(0), JSON.stringify(Object.fromEntries(Object.entries(o.scoreParts).map(([k, v]) => [k, Math.round(v)]))));
  }
  done.sort((a, b) => b.score - a.score); const pick = []; for (const o of done) if (pick.length < 2 && !pick.some(p => p.recipe.pods.kind === o.recipe.pods.kind) && (!pick.length || o.scoreParts.program >= pick[0].scoreParts.program * 0.85)) pick.push(o); // (a second only when it holds near as much of the program: not a weak one for the sake of a choice)
  return pick.length ? pick : done.slice(0, 1);
}
