// The independent layout validator: reads a finished layout (its pieces as drawn, in plan feet) and the brief it was
// made from, and measures each check itself. It never reads the generator's scores, its plan checks
// (lib/siteplan.mjs check) or its metrics; the only thing it shares with the engine is the decoder that turns a piece's
// stored shape into an outline (S.shapeOf) and the drawn stall marks (S.stallCentres), which are the geometry the user
// sees. Each check returns:
//   { id, title, status: 'pass' | 'fail' | 'unknown' | 'n/a', hard, rule, basis, measured, required, units, tolerance,
//     features: [ids], note }
// basis: 'verified' (a rule with a cited requirement), 'assumption' (a planning default), 'brief' (what was asked),
// 'geometry' (a property of the drawing itself), 'none'. Missing evidence is 'unknown', never 'pass'.
//
// Overall: 'fail' when a hard check fails; 'incomplete' when a hard check is unknown; else 'pass'. A pass says the
// layout meets the brief and the stated rules at concept level; checks that rest on assumptions are listed, and the
// engineering checks this validator does not perform (drainage, turning movements, fire route distance, grading,
// utilities) are reported unknown every time.
import * as S from './siteplan.mjs';
import polyclip from './vendor/polyclip.mjs';

export const VALIDATOR_VERSION = 'rei.validate/1';
export const TOL = { len: 0.5, area: 1, touch: 1.0, lock: 0.01 }; // ft, sq ft, ft (pieces meet), ft (a locked piece unmoved)

const PAVED = ['drive', 'parking', 'truck', 'field'];
const SOLID = ['building', 'garage', 'pool', 'pond', 'court', 'play', 'trash', 'canopy', 'foodtruck'];
const IGNORE = ['lot', 'sign', 'fence', 'keepout', 'green', 'trail', 'plaza', 'patio', 'tanks'];
const FLOOR_H = { multifamily: 10, townhomes: 10, duplex: 10, sfr: 11, retail: 20, restaurant: 18, office: 13, medical: 14, hotel: 11, industrial: 36, storage: 10, amenity: 18, other: 16 };

// ---------- geometry (own implementations; polyclip only for intersection areas) ----------
const area = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return Math.abs(s / 2); };
const signed = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return s / 2; };
function inPoly(p, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
function segDist(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
const ptPolyDist = (p, r) => { let d = Infinity; for (let i = 0; i < r.length; i++) d = Math.min(d, segDist(p, r[i], r[(i + 1) % r.length])); return d; };
function segsCross(a, b, c, d) { const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d); return d1 * d2 < 0 && d3 * d4 < 0; }
function polyDist(A, B) {
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) if (segsCross(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return 0;
  if (inPoly(A[0], B) || inPoly(B[0], A)) return 0;
  let d = Infinity; for (const p of A) d = Math.min(d, ptPolyDist(p, B)); for (const p of B) d = Math.min(d, ptPolyDist(p, A)); return d;
}
const box = r => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, y] of r) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; } return [a, b, c, d]; };
const boxGap = (A, B) => Math.max(A[0] - B[2], B[0] - A[2], A[1] - B[3], B[1] - A[3], 0);
const ccw = r => signed(r) >= 0 ? r : r.slice().reverse();
const closed = r => { const q = ccw(r); return q.concat([q[0]]); };
function interArea(A, B) { try { return polyclip.intersection([closed(A)], [closed(B)]).reduce((s, pg) => s + area(pg[0].slice(0, -1)) - pg.slice(1).reduce((t, h) => t + area(h.slice(0, -1)), 0), 0); } catch { return NaN; } }
const finite = r => Array.isArray(r) && r.length >= 3 && r.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));

// a piece's outline(s): a route (path + width) as one rectangle a segment, so a bent drive is measured as drawn
function shapesOf(e) {
  if (e.path?.length >= 2 && !e.poly && +e.width > 0 && e.kind !== 'trail') {
    const w = +e.width / 2, out = [];
    for (let i = 1; i < e.path.length; i++) { const a = e.path[i - 1], b = e.path[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.01) continue; const nx = -(b[1] - a[1]) / L * w, ny = (b[0] - a[0]) / L * w; out.push([[a[0] + nx, a[1] + ny], [a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny]]); }
    return out;
  }
  try { const s = S.shapeOf(e); return finite(s) ? [s] : []; } catch { return []; }
}
const isEntrance = e => e.kind === 'drive' && (e.entry || e.name === 'Main entry' || /^Entrance\b/.test(e.name || '') || e.through);
function levels(e) {
  if (Number.isFinite(+e.z0) || Number.isFinite(+e.z1)) return [+e.z0 || 0, Number.isFinite(+e.z1) ? +e.z1 : (+e.z0 || 0) + 10];
  if (e.kind === 'building') { const z0 = +e.over > 0 ? +e.over : 0; return [z0, z0 + (+e.floors || 1) * (FLOOR_H[e.use] || 10)]; }
  if (e.kind === 'garage') return [0, (+e.levels || 4) * 10];
  if (e.kind === 'canopy') return [14, 18];
  return [0, 1];
}
const vOverlap = (a, b) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > 0.01;

// ---------- edge roles, measured here ----------
function roles(ring, front, streets = []) {
  const n = ring.length, nrm = i => { const a = ring[i], b = ring[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[1] - a[1]) / L, -(b[0] - a[0]) / L]; }; // outward for a CCW ring
  const f = nrm(front), st = new Set(streets);
  return ring.map((_, i) => i === front || st.has(i) ? 'front' : (n2 => n2[0] * f[0] + n2[1] * f[1])(nrm(i)) < -0.5 ? 'rear' : 'side');
}

// ---------- the checks ----------
export function validateLayout(layout, brief = null) {
  const C = [], add = c => { C.push({ hard: true, features: [], units: null, tolerance: null, measured: null, required: null, basis: 'geometry', note: '', ...c }); };
  const ring0 = layout.ring || brief?.site?.ring || [], els = (layout.elements || []).filter(e => e && e.kind);
  const R = brief?.rules?.values || {}, ruleOf = k => R[k] || null, basisOf = r => !r ? 'none' : r.cls === 'verified' ? 'verified' : 'assumption';
  const ring = finite(ring0) ? ccw(ring0) : null, flip = ring && ring !== ring0 && signed(ring0) < 0;
  const n = ring0.length, mapEdge = i => flip ? ((n - 2 - i) % n + n) % n : i;
  const front = mapEdge(layout.front ?? brief?.site?.front ?? 0), streets = (layout.streets || brief?.site?.streets || []).map(mapEdge);
  const sh = new Map(els.map(e => [e, shapesOf(e)]));
  const bx = new Map(els.map(e => [e, sh.get(e).length ? box(sh.get(e).flat()) : null]));
  const id = e => e.id || e.name || e.kind;

  // 1. geometry
  {
    const bad = els.filter(e => !IGNORE.includes(e.kind) && (!sh.get(e).length || sh.get(e).some(s => !finite(s) || area(s) < 0.01)));
    add({ id: 'geometry.valid', title: 'Site and pieces are valid shapes', status: !ring ? 'fail' : bad.length ? 'fail' : 'pass', measured: bad.length, required: 0, units: 'invalid pieces', features: bad.map(id), rule: 'Finite coordinates, non-zero area', note: !ring ? 'The site boundary is missing or not finite.' : '' });
    if (ring) { let crosses = false; for (let i = 0; i < n && !crosses; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (segsCross(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) { crosses = true; break; } } if (crosses) C[C.length - 1].status = 'fail', C[C.length - 1].note = 'The site boundary crosses itself.'; }
  }
  if (!ring) return finish(C, layout, brief);
  { const live = els.filter(e => bx.get(e) && sh.get(e).every(finite)); els.length = 0; els.push(...live); } // the invalid ones are reported above; the rest is checked
  const holes = (brief?.site?.holes || []).filter(finite);

  // 2. containment: every built or paved piece inside the site, none in a hole. A drive may run on past a street edge
  // where access is allowed (its apron meets the street in the right-of-way), up to ROW_FT; nowhere else.
  const access0 = new Set((brief?.site?.access?.edges || [front, ...streets]).map(mapEdge));
  const nearestEdge = p => { let best = -1, bd = Infinity; for (let i = 0; i < n; i++) { const d = segDist(p, ring[i], ring[(i + 1) % n]); if (d < bd) { bd = d; best = i; } } return { edge: best, d: bd }; };
  {
    const out = [], ROW_FT = 40;
    for (const e of els) {
      if (IGNORE.includes(e.kind) && e.kind !== 'plaza') continue;
      for (const s of sh.get(e)) {
        const past = s.filter(p => !inPoly(p, ring) && ptPolyDist(p, ring) > TOL.len);
        const okApron = e.kind === 'drive' && past.every(p => { const q = nearestEdge(p); return access0.has(q.edge) && q.d <= ROW_FT; });
        if (past.length && !okApron || holes.some(h => interArea(s, h) > TOL.area)) { out.push(id(e)); break; }
      }
    }
    add({ id: 'site.containment', title: 'Everything inside the property line', status: out.length ? 'fail' : 'pass', measured: out.length, required: 0, units: 'pieces outside', tolerance: TOL.len + ' ft (drives may meet the street across an access edge)', features: out, rule: 'Nothing built or paved past the boundary or in a hole' });
  }

  // 3. setbacks: buildings from each edge by its role; paving from non-street edges by the paving buffer
  {
    const rv = ruleOf('setbacks'), sb = { ...S.SETBACKS, ...(rv?.v || brief?.site?.setbacks || layout.setbacks || {}) }, rl = roles(ring, front, streets);
    let worst = Infinity; const bad = [], badPave = [];
    for (const e of els.filter(x => x.kind === 'building' && !x.future)) for (const s of sh.get(e)) for (let i = 0; i < n; i++) {
      const need = +sb[rl[i]] || 0, a = ring[i], b = ring[(i + 1) % n]; let d = Infinity; for (const p of s) d = Math.min(d, segDist(p, a, b));
      worst = Math.min(worst, d - need); if (d < need - TOL.len) { bad.push(id(e)); break; }
    }
    for (const e of els.filter(x => PAVED.includes(x.kind) && !isEntrance(x))) for (const s of sh.get(e)) for (let i = 0; i < n; i++) {
      if (rl[i] === 'front') continue; const need = +(sb.paving ?? 0) || 0, a = ring[i], b = ring[(i + 1) % n]; let d = Infinity; for (const p of s) d = Math.min(d, segDist(p, a, b)); if (d < need - TOL.len) { badPave.push(id(e)); break; }
    }
    add({ id: 'site.setbacks.buildings', title: 'Building setbacks', status: bad.length ? 'fail' : 'pass', measured: Number.isFinite(worst) ? +worst.toFixed(2) : null, units: 'ft least margin', required: { front: sb.front, side: sb.side, rear: sb.rear }, tolerance: TOL.len + ' ft', features: [...new Set(bad)], basis: basisOf(rv), rule: rv?.source || 'Engine default setbacks (assumption)' });
    add({ id: 'site.setbacks.paving', title: 'Paving buffer from side and rear lines', status: badPave.length ? 'fail' : 'pass', measured: badPave.length, units: 'pieces inside the buffer', required: sb.paving, tolerance: TOL.len + ' ft', features: [...new Set(badPave)], basis: basisOf(rv), rule: rv?.source || 'Engine default paving buffer (assumption)', hard: false });
  }

  // 4. exclusions (easements, floodplain, keep-outs, the brief's and the plan's own)
  {
    const ex = [...(brief?.site?.exclusions || []).map(x => ({ id: x.id, ring: x.ring })), ...els.filter(e => e.kind === 'keepout').map(e => ({ id: id(e), ring: sh.get(e)[0] }))].filter(x => finite(x.ring));
    const hits = [];
    for (const x of ex) { const xb = box(x.ring); for (const e of els) { if (![...PAVED, ...SOLID].includes(e.kind) || isEntrance(e) && e.through) continue; if (!bx.get(e) || boxGap(xb, bx.get(e)) > 0) continue; for (const s of sh.get(e)) { const a = interArea(s, x.ring); if (a > TOL.area) { hits.push(id(e) + ' on ' + x.id + ' (' + Math.round(a) + ' sf)'); break; } } } }
    add({ id: 'site.exclusions', title: 'Nothing built or paved on excluded land', status: !ex.length ? 'n/a' : hits.length ? 'fail' : 'pass', measured: hits.length, units: 'conflicts', tolerance: TOL.area + ' sf', features: hits, rule: 'Exclusions, easements and keep-outs stay clear' });
  }

  // 5. overlaps, level-aware: solids with solids; buildings with paving at the same level
  {
    const list = els.filter(e => SOLID.includes(e.kind) || PAVED.includes(e.kind)), hits = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j], pa = PAVED.includes(a.kind), pb = PAVED.includes(b.kind);
      if (pa && pb) continue; // paving meets paving by design
      if ((pa || pb) && !(a.kind === 'building' || b.kind === 'building' || a.kind === 'pond' || b.kind === 'pond' || a.kind === 'pool' || b.kind === 'pool')) continue;
      if (a.kind === 'canopy' || b.kind === 'canopy') continue; // a fuel canopy stands over its paving
      if (!bx.get(a) || !bx.get(b) || boxGap(bx.get(a), bx.get(b)) > 0) continue;
      if (!vOverlap(levels(a), levels(b))) continue; // stacked: a podium under apartments, a building over tuck-under parking
      let A = 0; for (const s of sh.get(a)) for (const t of sh.get(b)) A += interArea(s, t) || 0;
      if (A > TOL.area) hits.push(id(a) + ' × ' + id(b) + ' (' + Math.round(A) + ' sf)');
    }
    add({ id: 'overlap.level-aware', title: 'No two things in the same place at the same level', status: hits.length ? 'fail' : 'pass', measured: hits.length, units: 'overlaps', tolerance: TOL.area + ' sf', features: hits.slice(0, 40), rule: 'Pieces overlap only when their levels differ (stacked uses, parking under a building)' });
  }

  // 6. separation between buildings (at the same level)
  {
    const rv = ruleOf('buildingSeparation'), need = +rv?.v || 0, B = els.filter(e => e.kind === 'building' && !e.future), bad = []; let least = Infinity;
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const a = B[i], b = B[j]; if (!bx.get(a) || !bx.get(b) || boxGap(bx.get(a), bx.get(b)) > Math.max(need, 1) + 1) continue; if (!vOverlap(levels(a), levels(b))) continue;
      if ((a.attached || b.attached) && (a.group != null && a.group === b.group)) continue; // attached homes in one row
      if (['townhomes', 'duplex'].includes(a.use) && a.use === b.use && boxGap(bx.get(a), bx.get(b)) < 0.6) continue; // a townhome row's units share party walls
      let d = Infinity; for (const s of sh.get(a)) for (const t of sh.get(b)) d = Math.min(d, polyDist(s, t)); least = Math.min(least, d);
      if (d < need - TOL.len) bad.push(id(a) + ' – ' + id(b) + ' ' + d.toFixed(1) + ' ft');
    }
    add({ id: 'separation.buildings', title: 'Space between buildings', status: !rv ? 'unknown' : bad.length ? 'fail' : 'pass', measured: Number.isFinite(least) ? +least.toFixed(2) : null, note: Number.isFinite(least) ? '' : B.length > 1 ? 'No two buildings within ' + (Math.max(need, 1) + 1) + ' ft of each other.' : '', required: need, units: 'ft', tolerance: TOL.len + ' ft', features: bad.slice(0, 30), basis: basisOf(rv), rule: rv?.source || 'No separation rule given' });
  }

  // 7–9. access: an entrance on an allowed street edge; every paved piece reached from it; every building near reached paving
  const paved = els.filter(e => PAVED.includes(e.kind) || e.kind === 'garage');
  const allowed = new Set((brief?.site?.access?.edges || [front, ...streets]).map(mapEdge));
  const rl = roles(ring, front, streets), edgeOf = s => { let best = -1, bd = Infinity; for (const p of s) for (let i = 0; i < n; i++) { const d = segDist(p, ring[i], ring[(i + 1) % n]); if (d < bd) { bd = d; best = i; } } return { edge: best, d: bd }; };
  const entries = paved.filter(e => e.kind === 'drive' && sh.get(e).some(s => edgeOf(s).d <= 2));
  const legal = entries.filter(e => sh.get(e).some(s => { const q = edgeOf(s); return q.d <= 2 && allowed.has(q.edge); }));
  const illegal = entries.filter(e => !legal.includes(e) && sh.get(e).some(s => { const q = edgeOf(s); return q.d <= 2 && rl[q.edge] !== 'front'; }));
  { // a second way in: IFC Appendix D (D106.1 over 200 apartment units, D107.1 over 30 one- and two-family homes), the two
    // separated by at least half the site's longest diagonal (D104.3 / D106.3). Appendix D applies where the jurisdiction
    // adopts it: an assumption until the rule sheet says so.
    const qq = quantities(layout, brief), apts = qq.byUse.multifamily?.units || 0, homes = ['townhomes', 'duplex', 'sfr'].reduce((t, u) => t + (qq.byUse[u]?.units || 0), 0);
    const need = apts > 200 || homes > 30 ? 2 : 1;
    let diag = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) diag = Math.max(diag, Math.hypot(ring[i][0] - ring[j][0], ring[i][1] - ring[j][1]));
    const mouths = legal.map(e => { const pts = sh.get(e).flat().filter(p => ptPolyDist(p, ring) <= 3 || !inPoly(p, ring)); return pts.length ? [pts.reduce((t, p) => t + p[0], 0) / pts.length, pts.reduce((t, p) => t + p[1], 0) / pts.length] : null; }).filter(Boolean);
    let apart = 0; for (let i = 0; i < mouths.length; i++) for (let j = i + 1; j < mouths.length; j++) apart = Math.max(apart, Math.hypot(mouths[i][0] - mouths[j][0], mouths[i][1] - mouths[j][1]));
    const two = need === 1 || mouths.length >= 2, far = mouths.length >= 2 && apart >= diag / 2 - TOL.len;
    add({ id: 'access.second', title: 'A second way in where the fire code asks for one', status: need === 1 ? 'n/a' : two ? 'pass' : 'fail', measured: mouths.length, required: need, units: 'entrances',
      basis: 'assumption', rule: 'IFC Appendix D: D106 (over 200 apartments), D107 (over 30 homes), where adopted', note: need === 2 ? apts + ' apartments and ' + homes + ' homes on the plan.' : '' });
    add({ id: 'access.remote', title: 'The two ways in far enough apart', hard: false, status: need === 1 || mouths.length < 2 ? 'n/a' : far ? 'pass' : 'fail', measured: mouths.length >= 2 ? Math.round(apart) : null, required: Math.round(diag / 2), units: 'ft between entrances',
      basis: 'assumption', rule: 'IFC D104.3 / D106.3: at least half the site’s longest diagonal apart, where adopted (the fire official may accept an emergency-only access instead)' });
  }
  add({ id: 'access.entrance', title: 'A way in from an allowed street edge', status: legal.length && !illegal.length ? 'pass' : 'fail', measured: legal.length, required: 1, units: 'entrances', features: [...legal.map(id), ...illegal.map(e => id(e) + ' (not on an allowed street edge)')], basis: brief?.site?.access?.edges ? 'brief' : 'assumption', rule: brief?.site?.access?.edges ? 'Access only on the edges the brief allows' : 'Access on the front or a side street (no access rights across neighbours)' });
  {
    const adj = new Map(paved.map(e => [e, []]));
    for (let i = 0; i < paved.length; i++) for (let j = i + 1; j < paved.length; j++) {
      const a = paved[i], b = paved[j]; if (!bx.get(a) || !bx.get(b) || boxGap(bx.get(a), bx.get(b)) > TOL.touch) continue;
      let d = Infinity; for (const s of sh.get(a)) for (const t of sh.get(b)) { d = Math.min(d, polyDist(s, t)); if (d <= TOL.touch) break; }
      if (d <= TOL.touch) { adj.get(a).push(b); adj.get(b).push(a); }
    }
    const seen = new Set(legal), q = [...legal]; while (q.length) { const e = q.pop(); for (const o of adj.get(e) || []) if (!seen.has(o)) { seen.add(o); q.push(o); } }
    const lost = paved.filter(e => !seen.has(e));
    add({ id: 'access.connectivity', title: 'All drives and parking connected to the way in', status: !legal.length ? 'fail' : lost.length ? 'fail' : 'pass', measured: lost.length, required: 0, units: 'unreached paved pieces', tolerance: TOL.touch + ' ft', features: lost.map(id).slice(0, 40), rule: 'Paving forms one network from a legal entrance' });
    const rv = ruleOf('buildingToDrive'), need = +rv?.v || 60, far = [];
    const reached = [...seen].filter(e => e.kind === 'drive' || e.kind === 'parking' || e.kind === 'truck' || e.kind === 'field');
    for (const b of els.filter(e => e.kind === 'building' && !e.future)) {
      let d = Infinity; for (const p of reached) { if (!bx.get(p) || boxGap(bx.get(b), bx.get(p)) > need) continue; for (const s of sh.get(b)) for (const t of sh.get(p)) d = Math.min(d, polyDist(s, t)); if (d <= need) break; }
      if (d > need + TOL.len) far.push(id(b) + (Number.isFinite(d) ? ' ' + Math.round(d) + ' ft' : ' (none near)'));
    }
    add({ id: 'access.buildings', title: 'Every building near connected circulation', status: far.length ? 'fail' : 'pass', measured: far.length, required: 0, units: 'buildings too far', tolerance: need + ' ft', features: far.slice(0, 40), basis: basisOf(rv), rule: rv?.source || 'Planning default 60 ft' });
  }

  // 10. parking: required (from the brief's rules) and provided (counted from the drawing) reported separately
  const q = quantities(layout, brief);
  {
    const short = q.parking.required - q.parking.provided, est = q.parking.garageEstimated > 0;
    add({ id: 'parking.count', title: 'Parking provided against required', status: q.parking.required == null ? 'unknown' : short > 0 ? 'fail' : est ? 'unknown' : 'pass', measured: q.parking.provided, required: q.parking.required, units: 'spaces', tolerance: '0 spaces',
      basis: q.parking.basis, rule: q.parking.rule, note: (q.parking.driveways ? q.parking.driveways + ' are driveway aprons in front of front-load duplex garages (tandem; local code may not count them). ' : '') + (est ? q.parking.garageEstimated + ' spaces are a garage estimate (area ÷ 330 sf a space × levels), not a counted layout. ' : '') + 'Accessible spaces needed: ' + q.parking.accessibleNeeded + ' (2010 ADA Standards 208.2); their placement and routes are not checked.' });
    const bad = q.parking.strayStalls;
    add({ id: 'parking.geometry', title: 'Drawn stalls sit on their parking rows', status: bad.length ? 'fail' : q.parking.surface ? 'pass' : 'n/a', measured: q.parking.surface, units: 'surface stalls counted', features: bad.slice(0, 30), rule: 'Each stall inside its row, inside the site and clear of buildings; stall ' + q.parking.stall.w + ' × ' + q.parking.stall.d + ' ft, aisle ' + q.parking.stall.aisle + ' ft', basis: basisOf(ruleOf('stall')) });
  }

  // 11. the program, by what each quantity means
  for (const u of brief?.program?.uses || []) {
    const same = (brief.program.uses || []).filter(x => x.use === u.use).length, zoned = u.zone != null && (q.byZone[u.zone] || same > 1); // a mixed plan: this use's own zone (by the zone its buildings carry); a use with no zone tags and no twin: its use's total
    const g0 = (zoned ? q.byZone[u.zone] : q.byUse[u.use]) || (els.length ? { units: 0, gfa: 0, buildings: 0 } : null); // a use with no building on the plan has none of it (0), not an unknown
    const got = !g0 ? null : u.quantity.unit === 'units' ? g0.units : u.quantity.unit === 'sf' ? g0.gfa : g0.buildings, Q = u.quantity;
    const est = u.quantity.unit === 'units' && g0?.unitsEstimated;
    const ok = got == null ? null : Q.mode === 'exact' ? (Q.unit === 'sf' ? Math.abs(got - Q.value) <= Q.value * 0.01 : got === Q.value) : Q.mode === 'min' ? got >= Q.value : Q.mode === 'max' ? got <= Q.value : Q.mode === 'range' ? got >= Q.min && got <= Q.max : got > 0; // maximize: as many as fit, and none is not an answer
    add({ id: 'program.' + u.id, title: 'Program: ' + (u.name || u.use) + ' (' + (Q.mode === 'maximize' ? 'as many as fit' : Q.mode) + ')', status: ok == null ? 'unknown' : !ok ? 'fail' : est && Q.mode !== 'maximize' ? 'unknown' : 'pass', measured: got ?? null, required: Q.mode === 'range' ? [Q.min, Q.max] : Q.value ?? 'as many as fit', units: Q.unit, tolerance: Q.mode === 'exact' && Q.unit === 'sf' ? '1%' : Q.mode === 'exact' ? '0' : null, basis: 'brief', rule: 'The quantity asked for, as ' + Q.mode,
      note: est ? 'Units are estimated from floor area (no building schedule): a coarse capacity, not a unit count.' : '' });
  }

  // 12. buildings: units against floor area and their template
  {
    const bad = [], est = [];
    for (const e of els.filter(x => x.kind === 'building' && ['multifamily'].includes(x.use || layout.program?.use))) {
      const fa = sh.get(e).reduce((s, r) => s + area(r), 0), gsf = fa * (+e.floors || 1), u = e.units;
      if (u == null) { est.push(id(e)); continue; }
      if (u * 400 > gsf) bad.push(id(e) + ': ' + u + ' units in ' + Math.round(gsf) + ' gsf');
      if (e.template && e.tplUnits != null && e.tplUnits !== u) bad.push(id(e) + ': ' + u + ' units but its template schedule gives ' + e.tplUnits);
      if (e.template && e.tplL && Math.abs(Math.max(e.w, e.d) - e.tplL) > TOL.len) bad.push(id(e) + ': ' + Math.max(e.w, e.d).toFixed(1) + ' ft long, its template schedule was set for ' + e.tplL + ' ft');
    }
    add({ id: 'program.buildings', title: 'Units reconcile with each building', status: bad.length ? 'fail' : est.length ? 'unknown' : 'pass', measured: bad.length, units: 'buildings that don’t reconcile', features: [...bad, ...est.map(x => x + ' (units estimated from floor area)')].slice(0, 40), rule: 'At least 400 gsf a unit; a templated building keeps its schedule and module length', basis: 'geometry', hard: !est.length || bad.length > 0 });
  }

  // 13. locks: a locked piece unchanged
  if (brief?.locked && Object.keys(brief.locked).length) {
    const by = new Map(els.map(e => [e.id, e])), moved = [];
    for (const [lid, was] of Object.entries(brief.locked)) { const e = by.get(lid); if (!e) { moved.push(lid + ' (missing)'); continue; } const s = sh.get(e)[0] || [], w = was.shape || []; if (s.length !== w.length || s.some((p, i) => Math.hypot(p[0] - w[i][0], p[1] - w[i][1]) > TOL.lock)) moved.push(lid + ' (moved or reshaped)'); }
    add({ id: 'locks', title: 'Locked pieces unchanged', status: moved.length ? 'fail' : 'pass', measured: moved.length, units: 'locked pieces changed', tolerance: TOL.lock + ' ft', features: moved, basis: 'brief', rule: 'What the brief locks stays as it was' });
  } else add({ id: 'locks', title: 'Locked pieces unchanged', status: 'n/a', basis: 'brief', rule: 'Nothing locked' });

  // 14. what this validator does not check (always reported, never passed)
  const pond = els.filter(e => e.kind === 'pond');
  { const pondSf = Math.round(pond.reduce((s, e) => s + sh.get(e).reduce((t, r) => t + area(r), 0), 0)); let need; try { const st = S.stormOf({ ...layout, ring: layout.ring || ring, elements: els }); need = st?.area ? Math.round(st.area) : null; } catch { need = null; }
    const short = need && pondSf < need * 0.97;
    add({ id: 'eng.detention', title: 'Detention / drainage', status: 'unknown', hard: false, measured: pondSf, required: need, units: 'sf of pond', basis: 'assumption', rule: 'Concept reserve sized by a rule of thumb (an acre-feet rate and depth); not a drainage design',
      note: (short ? 'The ponds hold about ' + Math.round(pondSf / need * 100) + '% of the rule-of-thumb area: the rest needs underground storage, a deeper pond or a regional facility. ' : '') + 'Needs topography, outfall, soils and the jurisdiction’s drainage criteria.' }); }
  { // a walking trail through a building or along a parking row (crossing a drive is a crosswalk; along one is not)
    const trails = els.filter(e => e.kind === 'trail' && e.path?.length >= 2), hits = [];
    for (const t of trails) { const w = (+t.width || 6) / 2, segs = []; for (let i = 1; i < t.path.length; i++) { const a = t.path[i - 1], b = t.path[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.01) continue; const nx = -(b[1] - a[1]) / L * w, ny = (b[0] - a[0]) / L * w; segs.push([[a[0] + nx, a[1] + ny], [a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny]]); }
      for (const o of els.filter(e => e.kind === 'building' || e.kind === 'parking' || e.kind === 'pool')) { let A = 0; for (const sg of segs) for (const r of sh.get(o)) A += interArea(sg, r) || 0; if (A > 20) hits.push((t.id || 'trail') + ' × ' + id(o) + ' (' + Math.round(A) + ' sf)'); }
      for (const o of els.filter(e => e.kind === 'drive' && !isEntrance(e))) { let A = 0; for (const sg of segs) for (const r of sh.get(o)) A += interArea(sg, r) || 0; if (A > 40 * w * 2) hits.push((t.id || 'trail') + ' along ' + id(o) + ' (' + Math.round(A) + ' sf)'); } }
    add({ id: 'site.trail', title: 'Walking trail clear of buildings, parking and drives', status: !trails.length ? 'n/a' : hits.length ? 'fail' : 'pass', hard: false, measured: hits.length, units: 'conflicts', features: hits.slice(0, 20), basis: 'geometry', rule: 'A trail may cross a drive (a crosswalk) but not run along it or through a building or parking row' }); }
  add({ id: 'eng.turning', title: 'Vehicle turning movements', status: 'unknown', hard: false, basis: 'none', rule: ruleOf('designVehicle')?.v ? 'Design vehicle ' + ruleOf('designVehicle').v + ': swept paths not modelled' : 'No design vehicle declared; swept paths not modelled' });
  add({ id: 'eng.fire-route', title: 'Fire apparatus route distance', status: 'unknown', hard: false, basis: 'assumption', rule: (ruleOf('fireAccess')?.source) || 'IFC 503.1.1', note: 'Distances along the route are not measured; straight-line distance would not prove compliance.' });
  add({ id: 'eng.grading-utilities', title: 'Grading, utilities and capacity', status: 'unknown', hard: false, basis: 'none', rule: 'Not modelled' });
  return finish(C, layout, brief, q);
}

function finish(C, layout, brief, q = null) {
  const hard = C.filter(c => c.hard), fails = hard.filter(c => c.status === 'fail'), unknown = hard.filter(c => c.status === 'unknown');
  const status = fails.length ? 'fail' : unknown.length ? 'incomplete' : 'pass';
  const assumptions = C.filter(c => c.basis === 'assumption' && c.status === 'pass').map(c => c.id);
  return { version: VALIDATOR_VERSION, status, feasible: !fails.length, counts: { pass: C.filter(c => c.status === 'pass').length, fail: C.filter(c => c.status === 'fail').length, unknown: C.filter(c => c.status === 'unknown').length, na: C.filter(c => c.status === 'n/a').length },
    failed: fails.map(c => c.id), unresolved: unknown.map(c => c.id), restsOnAssumptions: assumptions, checks: C, quantities: q };
}

// ---------- quantities, measured from the drawing ----------
// units: from each building's own count (a schedule) where it has one, else estimated from floor area and flagged
export function quantities(layout, brief = null) {
  const els = (layout.elements || []).filter(e => e && e.kind && shapesOf(e).every(finite)), P = layout.program || {}, base = P.use || 'other', R = brief?.rules?.values || {};
  const byUse = {}, byZone = {}, U = u => (byUse[u] = byUse[u] || { buildings: 0, footprint: 0, gfa: 0, units: 0, unitsEstimated: false }), Z = k => (byZone[k] = byZone[k] || { buildings: 0, footprint: 0, gfa: 0, units: 0, unitsEstimated: false });
  const ring = layout.ring || brief?.site?.ring || [];
  for (const e of els.filter(x => x.kind === 'building' && !x.future)) {
    const u = e.use || base, s = shapesOf(e), fa = s.reduce((t, r) => t + area(r), 0), gz = e.zone != null ? Z(e.zone) : null, g = U(u); g.buildings++; g.footprint += fa;
    const gfa = e.gfa != null ? +e.gfa : (e.sf != null && ['sfr', 'townhomes', 'duplex'].includes(u) ? +e.sf : fa * (+e.floors || 1)); g.gfa += gfa;
    let nU = 0, est = false; if (['multifamily', 'townhomes', 'duplex', 'sfr'].includes(u)) { if (e.units != null) nU = +e.units; else if (u === 'multifamily') { nU = Math.floor(gfa * (P.eff || 0.85) / (P.unitSf || 900)); est = true; } else nU = 1; }
    g.units += nU; g.unitsEstimated = g.unitsEstimated || est; if (gz) { gz.buildings++; gz.footprint += fa; gz.gfa += gfa; gz.units += nU; gz.unitsEstimated = gz.unitsEstimated || est; gz.use = u; }
  }
  for (const g of Object.values(byUse)) { g.footprint = Math.round(g.footprint); g.gfa = Math.round(g.gfa); }
  // stalls drawn: each one inside its row, inside the site and not under a building
  const stall = { ...{ w: 9, d: 18, aisle: 24 }, ...(R.stall?.v || {}) }, B = els.filter(e => e.kind === 'building' && !e.future).map(e => shapesOf(e)).flat(), stray = [];
  let surface = 0;
  for (const e of els.filter(x => x.kind === 'parking' && !x.rv && !x.vac)) {
    let cs; try { cs = S.stallCentres(e); } catch { cs = []; }
    const rows = shapesOf(e);
    for (const c of cs) { const okRow = rows.some(r => inPoly(c, r) || ptPolyDist(c, r) < 0.5), okSite = !ring.length || inPoly(c, ring), clear = !B.some(b => inPoly(c, b)); if (okRow && okSite && clear) surface++; else stray.push((e.id || 'parking') + ' @' + c.map(v => Math.round(v)).join(',')); }
  }
  const garageEstimated = els.filter(e => e.kind === 'garage').reduce((s, e) => s + Math.floor(shapesOf(e).reduce((t, r) => t + area(r), 0) * (+e.levels || 4) / 330), 0);
  const homes = els.filter(e => e.kind === 'building' && ['townhomes', 'duplex', 'sfr'].includes(e.use || base) && !e.future);
  const privateGarages = homes.reduce((s, e) => s + (e.tiny || e.padSpaces != null ? (+e.padSpaces || 1) : (+e.units || 1) * ({ townhomes: 2, duplex: 1, sfr: 2 }[e.use || base] || 0)), 0);
  const driveways = homes.filter(e => (e.use || base) === 'duplex' && /front-load/i.test(e.note || '')).reduce((s, e) => s + (+e.units || 1), 0); // a front-load duplex's driveway apron: one tandem space a home (local code may not count it)
  // required: the brief's ratios, else the engine's use defaults (stated as assumptions)
  const perUnitOf = u => R.parkingPerUnit?.v ?? ({ multifamily: 1.6, townhomes: 2.25, duplex: 2, sfr: 2 }[u]);
  const share = u => (brief?.program?.uses || []).find(x => x.use === u && x.officeShare != null)?.officeShare;
  const per1kOf = u => R.parkingPer1000?.v ?? (share(u) != null ? +(share(u) * 3.5 + (1 - share(u)) * 0.6).toFixed(3) : null) ?? ({ retail: 4, restaurant: 10, office: 3.5, medical: 5, hotel: 1.82, church: 10, industrial: 0.6, storage: 0.1, fuel: 4, foodtrucks: 8, amenity: 0, other: 3 }[u]);
  let required = 0, known = true;
  for (const [u, g] of Object.entries(byUse)) { const pu = perUnitOf(u), pk = per1kOf(u); if (['multifamily', 'townhomes', 'duplex', 'sfr'].includes(u)) { if (pu == null) known = false; else required += g.units * pu; } else if (pk == null) known = false; else required += g.gfa / 1000 * pk; }
  required = known ? Math.ceil(required - 0.01) : null;
  const raw = surface, accessibleNeeded = raw <= 0 ? 0 : raw <= 25 ? 1 : raw <= 50 ? 2 : raw <= 75 ? 3 : raw <= 100 ? 4 : raw <= 150 ? 5 : raw <= 200 ? 6 : raw <= 300 ? 7 : raw <= 400 ? 8 : raw <= 500 ? 9 : raw <= 1000 ? Math.ceil(raw * 0.02) : 20 + Math.ceil((raw - 1000) / 100);
  const ruled = R.parkingPerUnit?.v != null || R.parkingPer1000?.v != null, verified = R.parkingPerUnit?.cls === 'verified' || R.parkingPer1000?.cls === 'verified';
  const parking = { required, provided: surface + garageEstimated + privateGarages + driveways, surface, garageEstimated, privateGarages, driveways, accessibleNeeded, stall, strayStalls: stray,
    basis: verified ? 'verified' : 'assumption', rule: ruled ? (R.parkingPerUnit?.source || R.parkingPer1000?.source) : 'Engine use defaults (1.6 a unit for apartments, 4 per 1,000 sf for retail, …): planning assumptions, not code' };
  const site = ring.length >= 3 ? area(ring) : 0, tot = Object.values(byUse).reduce((t, g) => ({ units: t.units + g.units, gfa: t.gfa + g.gfa, footprint: t.footprint + g.footprint, buildings: t.buildings + g.buildings }), { units: 0, gfa: 0, footprint: 0, buildings: 0 });
  const pavedSf = els.filter(e => PAVED.includes(e.kind)).reduce((s, e) => s + shapesOf(e).reduce((t, r) => t + area(r), 0), 0);
  for (const g of Object.values(byZone)) { g.footprint = Math.round(g.footprint); g.gfa = Math.round(g.gfa); }
  return { siteSf: Math.round(site), acres: +(site / 43560).toFixed(3), byUse, byZone, totals: tot, unitsEstimated: Object.values(byUse).some(g => g.unitsEstimated), parking, pavedSfGross: Math.round(pavedSf), duAc: site ? +(tot.units / (site / 43560)).toFixed(2) : 0, far: site ? +(tot.gfa / site).toFixed(3) : 0 };
}
