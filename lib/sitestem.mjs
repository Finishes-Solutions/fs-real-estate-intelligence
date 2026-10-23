// Flag lots: a site whose only street frontage is a narrow strip (a "flag pole") running back to the wide part of the
// land, like 31807 King Ln in Waller (a 60 ft strip, about 250 ft long, from Old Washington Rd to 9 acres behind). The
// engine's entries flare out at the street with curb returns and keep off the side lot lines, so none fits a 60 ft
// strip; and the wide part's shoulder faces the street too but borders the neighbours. Here the wide part (the body) is
// laid out as a site of its own, its front the strip's mouth (its other lot lines keep their own setbacks), and the
// main entry is then a straight drive up the strip from the street to the body's own entry drive.
import * as S from './siteplan.mjs';
import polyclip from './vendor/polyclip.mjs';

// a strip counts when its street frontage is at most maxW ft, it runs back at least minLen ft, and the land behind is at
// least twice as wide; the entry drive up it is w ft (24-28) with `clear` ft each side to the lot lines
export const STEM = { maxW: 160, minLen: 60, widen: 2, w: 26, wMin: 20, clear: 5 };

const ccw = r => S.signedArea(r) >= 0 ? r : r.slice().reverse(), close = r => r.concat([r[0]]);
const ringsOf = mp => mp.filter(pg => pg[0]?.length >= 4).map(pg => ccw(S.tidyRing(pg[0].slice(0, -1), 0.3))).filter(r => r.length >= 3 && S.ringArea(r) > 1);
const clip = (a, b) => { try { return ringsOf(polyclip.intersection([close(ccw(a))], [close(ccw(b))])); } catch { return []; } };

// the strip and the body, or null when the site isn't a flag lot. In the street's frame: u along the street, v back
// from it (v = 0 on the street line).
export function stemOf(plan) {
  const ring = plan?.ring; if (!Array.isArray(ring) || ring.length < 5) return null;
  const n = ring.length, f = plan.front != null && plan.front < n ? plan.front : S.longestEdge(ring), a = ring[f], b = ring[(f + 1) % n];
  const Lf = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!(Lf > 0) || Lf > STEM.maxW) return null;
  const t = [(b[0] - a[0]) / Lf, (b[1] - a[1]) / Lf], o = S.outwardOf(ring, f), nIn = [-o[0], -o[1]];
  const uv = p => [(p[0] - a[0]) * t[0] + (p[1] - a[1]) * t[1], (p[0] - a[0]) * nIn[0] + (p[1] - a[1]) * nIn[1]], xy = ([u, v]) => [a[0] + t[0] * u + nIn[0] * v, a[1] + t[1] * u + nIn[1] * v];
  const R = ring.map(uv), vMax = Math.max(...R.map(p => p[1])); if (vMax < STEM.minLen * 3) return null;
  // the site's width at a depth: the inside of the ring along the line v
  const across = v => { const xs = []; R.forEach((p, i) => { const q = R[(i + 1) % n]; if ((p[1] - v) * (q[1] - v) < 0) xs.push(p[0] + (q[0] - p[0]) * (v - p[1]) / (q[1] - p[1])); }); xs.sort((x, y) => x - y); let w = 0; for (let k = 0; k + 1 < xs.length; k += 2) w += xs[k + 1] - xs[k]; return { w, xs }; };
  const w0 = across(Math.min(5, vMax / 10)).w; if (!(w0 > 0)) return null;
  let vJump = null; for (let v = 5; v < vMax; v += 2) if (across(v).w > Math.max(w0 * 1.5, w0 + 40)) { vJump = v; break; }
  if (vJump == null || vJump < STEM.minLen) return null;
  // cut at the strip's inner corner: the deepest corner of the ring before the land widens (not the street's own corners)
  const corners = R.map(p => p[1]).filter(v => v > 2 && v <= vJump + 0.01), vCut = corners.length ? Math.max(...corners) : vJump - 2; if (vCut < STEM.minLen) return null;
  const mid = across(vCut / 2), wStem = mid.w; if (wStem > STEM.maxW) return null;
  const behind = across(Math.min(vMax - 1, vCut + 40)).w; if (behind < STEM.widen * wStem) return null;
  const big = 1e5, half = (v0, v1) => [xy([-big, v0]), xy([big, v0]), xy([big, v1]), xy([-big, v1])];
  const body = clip(ring, half(vCut, big)).sort((p, q) => S.ringArea(q) - S.ringArea(p))[0], strip = clip(ring, half(-big, vCut)).sort((p, q) => S.ringArea(q) - S.ringArea(p))[0];
  if (!body || !strip || S.ringArea(body) < 3 * S.ringArea(strip)) return null;
  // the strip's centre line, the mouth (where it meets the body) and the drive's width
  const mx = across(vCut - 0.5).xs, m0 = mx[0], m1 = mx[mx.length - 1], mw = m1 - m0;
  const w = Math.min(STEM.w, Math.min(wStem, mw) - 2 * STEM.clear); if (w < STEM.wMin) return { tooNarrow: true, wStem: Math.round(wStem) };
  const c0 = [(across(0.5).xs[0] + across(0.5).xs.at(-1)) / 2, 0], c1 = [(m0 + m1) / 2, vCut];
  // the body's lot lines: the mouth is its front; the rest keep the rules of the site's own lot line they lie on
  const rules = S.edgeRules(ring, f, plan.setbacks, plan.streets), onEdge = (p, q) => { const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; let k = -1, d = 0.75; ring.forEach((r0, i) => { const dd = S.segDist(m, r0, ring[(i + 1) % n]); if (dd < d) { d = dd; k = i; } }); return k; };
  const cutRule = { ...rules[f], role: 'side' };
  let front = -1, best = 0; const edges = body.map((p, i) => { const q = body[(i + 1) % body.length], k = onEdge(p, q); if (k >= 0) return { ...rules[k], role: k === f ? 'side' : rules[k].role === 'front' ? 'side' : rules[k].role };
    const pu = uv(p), qu = uv(q), lo = Math.max(Math.min(pu[0], qu[0]), m0), hi = Math.min(Math.max(pu[0], qu[0]), m1); if (Math.abs(pu[1] - vCut) < 1 && Math.abs(qu[1] - vCut) < 1 && hi - lo > best) { best = hi - lo; front = i; } return { ...cutRule }; });
  if (front < 0) return null; edges[front] = { ...rules[f], role: 'front' };
  return { f, body, strip, front, edges, w, len: vCut, wStem: Math.round(wStem), mouth: xy(c1), street: xy(c0), toXY: xy, toUV: uv, c0, c1 };
}

// the straight entry drive up the strip, from the street line to 2 ft into the body (it meets the body's entry drive)
export function stemDrive(st, name = 'Main entry', street = '') {
  const { c0, c1, w } = st, dv = [c1[0] - c0[0], c1[1] - c0[1]], L = Math.hypot(...dv), d = [dv[0] / L, dv[1] / L], nn = [-d[1], d[0]], e = [c1[0] + d[0] * 2, c1[1] + d[1] * 2];
  const poly = [[c0[0] - nn[0] * w / 2, c0[1] - nn[1] * w / 2], [c0[0] + nn[0] * w / 2, c0[1] + nn[1] * w / 2], [e[0] + nn[0] * w / 2, e[1] + nn[1] * w / 2], [e[0] - nn[0] * w / 2, e[1] - nn[1] * w / 2]].map(st.toXY);
  return { kind: 'drive', poly: ccw(poly), name, note: Math.round(w) + ' ft entry drive up the ' + st.wStem + ' ft strip' + (street ? ' from ' + street : ''), entry: true, stem: true, id: 'stem' + Math.random().toString(36).slice(2, 7) };
}

// a flag lot's options: the body laid out on its own (layout: the engine's layoutOptions, called with noStem), the strip's
// drive added as the main entry and the body's own entry kept as the drive it meets. null: not a flag lot (lay out as
// usual).
export function stemOptions(plan, programIn, opts, layout) {
  const st = stemOf(plan); if (!st) return null;
  const street = plan.streetNames?.[st.f] || 'the street';
  if (st.tooNarrow) return null; // (a strip under 30 ft: no drive fits; the plan lays out as before)
  const body = { ...plan, ring: st.body, front: st.front, streets: [], setbacks: { ...(plan.setbacks || {}), edges: st.edges }, streetNames: { [st.front]: street } };
  const out = layout(body, programIn, { ...opts, noStem: true, stemEntry: { at: st.mouth, w: st.w } });
  const L = Math.round(st.len), say = 'The site reaches ' + street + ' only by its ' + st.wStem + ' ft strip, so the main entry is a ' + Math.round(st.w) + ' ft drive ' + L + ' ft up the strip to the rest of the site; with one way in, fire access for a larger project needs the fire marshal’s sign-off (an emergency-only gate to a neighbouring road, or a turnaround).';
  return out.map(o => {
    if (!o?.elements?.length) return o;
    const drive = stemDrive(st, 'Main entry', street), hit = e => S.rectsOverlap(e, drive, 0);
    const els = o.elements.filter(e => !(e.kind === 'sign' || e.kind === 'green' && e.median && hit(e)) && !(['lot', 'building', 'parking', 'pond', 'plaza', 'garage', 'trash'].includes(e.kind) && hit(e)))
      .map(e => e.kind === 'drive' && (e.entry || e.name === 'Main entry') ? { ...e, entry: false, name: 'Entry drive', blvd: undefined } : e);
    return { ...o, elements: [drive, ...els], stem: { w: st.w, len: L }, notes: [say, ...(o.notes || []).filter(t => !/monument sign|boulevard|median/i.test(t))] };
  });
}
