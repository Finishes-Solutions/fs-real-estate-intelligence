// The four stages of a site plan option, one after the other: Site (the land, its street side and parcels), Layout (the
// buildings, parking and drives), Pro forma (the numbers behind it) and Deliver (renderings, the PDF and CAD files, plan
// sets). Each of the first three is confirmed before the next opens. A confirmation keeps a fingerprint of what was
// confirmed; change it afterwards and the stage reads "changed since", to confirm again. Nothing is locked for good:
// Reopen takes a confirmation back.
// Also: Start as a Parking Lot, the whole paved part of the site as parking rows with a drive round their ends, for
// buildings to be dropped in (a building placed on the rows cuts the stalls under it: lib/siteplan.mjs cutRows).
import * as S from './siteplan.mjs';

export const STAGES = [
  { id: 'site', n: 1, label: 'Site', confirm: 'Confirm Site', about: 'The land: its outline, parcels and street side. Confirm it and the layout starts from it.' },
  { id: 'layout', n: 2, label: 'Layout', confirm: 'Confirm Layout', about: 'Buildings, parking and drives. Start from a blank site or a parking lot and add buildings, or have the AI lay it out.' },
  { id: 'proforma', n: 3, label: 'Pro forma', confirm: 'Confirm Pro Forma', about: 'The base pro forma from the layout. Edit the inputs, then confirm it.' },
  { id: 'deliver', n: 4, label: 'Renderings & plans', about: 'Renderings, the site plan PDF, CAD files and full plan sets from the confirmed option.' }
];
export const stageById = id => STAGES.find(s => s.id === id) || STAGES[0];

// ---------- fingerprints ----------
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const r1 = v => Math.round(+v || 0);
export const siteSig = pl => hash(JSON.stringify([(pl?.ring || []).map(p => p.map(r1)), pl?.front ?? null, pl?.streets || [], pl?.setbacks || {}, (pl?.elements || []).filter(S.isSitePiece).map(e => (e.poly || []).map(p => p.map(r1)))]));
export const layoutSig = pl => hash(JSON.stringify([(pl?.elements || []).filter(e => !S.isSitePiece(e)).map(e => [e.kind, r1(e.x), r1(e.y), r1(e.w), r1(e.d), r1(e.rot), e.floors || 0, e.levels || 0, e.use || '', (e.poly || e.path || []).length]), S.normalizeProgram(pl?.program || {}).use]));
export const pfSig = pl => hash(layoutSig(pl) + JSON.stringify(pl?.pf || {}));
const SIG = { site: siteSig, layout: layoutSig, proforma: pfSig };

// where each stage stands: done (confirmed and unchanged), stale (confirmed, changed since), open (ready to confirm),
// locked (an earlier stage isn't confirmed yet). An option laid out before stages existed counts its site as confirmed.
export function status(pl) {
  const st = pl?.stages || {}, out = {}, drawn = (pl?.ring || []).length >= 3;
  let prevDone = true;
  for (const s of STAGES) {
    const c = st[s.id] || (s.id === 'site' && !pl?.stages && drawn && S.hasDesign(pl) ? { implied: true, sig: siteSig(pl) } : null);
    let state;
    if (!prevDone) state = 'locked';
    else if (s.id === 'deliver') state = 'open';
    else if (c && c.sig === SIG[s.id](pl)) state = 'done';
    else state = c ? 'stale' : 'open';
    out[s.id] = { state, at: c?.at || null, by: c?.by || '', implied: !!c?.implied };
    prevDone = prevDone && (state === 'done' || s.id === 'deliver');
  }
  return out;
}
// the stage to show when the option opens: the first one not confirmed (Deliver once all three are)
export function current(pl) { const s = status(pl); return (STAGES.find(x => x.id !== 'deliver' && s[x.id].state !== 'done') || STAGES[3]).id; }
export const reachable = (pl, id) => status(pl)[id]?.state !== 'locked';

// what stops a stage being confirmed ('' when it can be)
export function blocker(pl, id, { pfOk = true } = {}) {
  if (id === 'site') return (pl?.ring || []).length >= 3 ? '' : 'Draw the site first.';
  if (id === 'layout') return (pl?.elements || []).some(e => e.kind === 'building') ? '' : 'Add at least one building first.';
  if (id === 'proforma') return pfOk ? '' : 'The pro forma needs a layout with buildings.';
  return '';
}
// an option laid out before stages existed: its site written down as confirmed before anything else is
const settle = pl => { if (!pl.stages) pl.stages = status(pl).site.implied ? { site: { at: null, by: '', sig: siteSig(pl), implied: true } } : {}; return pl.stages; };
export function confirm(pl, id, { by = '', now = new Date().toISOString() } = {}) {
  if (!SIG[id]) return pl;
  pl.stages = { ...settle(pl), [id]: { at: now, by, sig: SIG[id](pl) } };
  return pl;
}
// take a confirmation back (the later ones stay, and count again once this one is confirmed unchanged)
export function reopen(pl, id) { const st = { ...settle(pl) }; delete st[id]; pl.stages = st; return pl; }

// ---------- Start as a Parking Lot ----------
const rot = (p, deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
// where a horizontal line at y crosses the ring: the inside stretches, as [x0, x1] pairs
function spans(ring, y) {
  const xs = [];
  for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1])); }
  xs.sort((p, q) => p - q); const out = []; for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]); return out;
}
const meet = (A, B) => { const out = []; for (const a of A) for (const b of B) { const l = Math.max(a[0], b[0]), r = Math.min(a[1], b[1]); if (r > l) out.push([l, r]); } return out; };
// the longest stretch inside the ring for the whole band y0..y1 (sampled every 5 ft)
function bandSpan(ring, y0, y1) {
  let got = spans(ring, y0 + 0.01);
  for (let y = y0 + 5; y < y1; y += 5) got = meet(got, spans(ring, y));
  got = meet(got, spans(ring, y1 - 0.01));
  return got.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0] || null;
}
// The paved part of the site (inside the paving setbacks) as parking: double-loaded bays (stall, aisle, stall) running
// along the street side, a single-loaded row at the back when there's room, and a 24 ft drive along the front and up
// both ends of the rows. Stall and aisle sizes are the plan's (Site parameters). newId names the pieces.
// Returns { elements (the new pieces), spaces } or { error }.
export function parkingLot(plan, { newId = () => 'e' + Math.random().toString(36).slice(2, 9) } = {}) {
  const ring = plan?.ring || []; if (ring.length < 3) return { error: 'Draw the site first.' };
  const pp = plan.params || {}, sw = +pp.stallW || S.STALL.w, sd = +pp.stallD || S.STALL.d, sa = +pp.aisle || S.STALL.aisle, DW = 24;
  const rules = S.edgeRules(ring, plan.front, plan.setbacks, plan.streets), inner = S.insetRing(ring, rules.map(r => Math.max(r.pave, 0)));
  if (S.ringArea(inner) < 4000) return { error: 'The site is too small for a parking lot inside its setbacks.' };
  // a frame with the street side along +x and the site on the +y side of it
  const f = plan.front != null && plan.front < ring.length ? plan.front : S.longestEdge(ring), a = ring[f], b = ring[(f + 1) % ring.length], c = S.centroid(ring);
  let A = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; if (rot([c[0] - a[0], c[1] - a[1]], -A)[1] < 0) A += 180;
  const L = inner.map(p => rot(p, -A)), ys = L.map(p => p[1]), yMin = Math.min(...ys), yMax = Math.max(...ys);
  const mod = 2 * sd + sa, keep = [], STEP = sw;
  let y = yMin + DW; // the front drive first
  for (; y + sd + sa <= yMax + 0.01; ) {
    const D = y + mod <= yMax + 0.01 ? mod : sd + sa, sp = bandSpan(L, y, y + D);
    if (sp) { const x0 = sp[0] + DW, x1 = sp[1] - DW, len = Math.floor((x1 - x0) / STEP + 1e-6) * STEP; if (len >= 6 * sw) keep.push({ x0: (x0 + x1) / 2 - len / 2, len, y0: y, D, single: D < mod }); }
    y += D;
  }
  if (!keep.length) return { error: 'There isn’t room for parking rows inside the setbacks.' };
  const R = +(((A % 360) + 360) % 360).toFixed(2), W = p => { const q = rot(p, A); return [+q[0].toFixed(2), +q[1].toFixed(2)]; }, out = [];
  for (const k of keep) {
    const ctr = W([k.x0 + k.len / 2, k.y0 + k.D / 2]);
    out.push({ id: newId(), kind: 'parking', x: ctr[0], y: ctr[1], w: +k.len.toFixed(2), d: k.D, rot: R, lock: true, ...(k.single ? { row: -1 } : {}), ...(sw !== S.STALL.w || sd !== S.STALL.d || sa !== S.STALL.aisle ? { sw, sd, sa } : {}), pinned: true });
  }
  // the drive: up the left ends of the rows, along the front, back up the right ends (one path, the drive's centre line)
  const yF = keep[0].y0 - DW / 2, left = keep.map(k => [k.x0 - DW / 2, k.y0 + k.D / 2]).reverse(), right = keep.map(k => [k.x0 + k.len + DW / 2, k.y0 + k.D / 2]);
  const lo = Math.min(...keep.map(k => k.x0)) - DW / 2, hi = Math.max(...keep.map(k => k.x0 + k.len)) + DW / 2;
  const path = [...left.slice(0, -1), [left[left.length - 1][0], yF], [lo, yF], [hi, yF], [right[0][0], yF], ...right.slice(1)].map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]);
  if (keep.length === 1) path.splice(0, 0, [keep[0].x0 - DW / 2, keep[0].y0 + keep[0].D]), path.push([keep[0].x0 + keep[0].len + DW / 2, keep[0].y0 + keep[0].D]);
  const clean = path.filter((p, i) => !i || Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) > 1).filter((p, i, P) => { if (!i || i === P.length - 1) return true; const u = P[i - 1], v = P[i + 1]; return Math.abs((p[0] - u[0]) * (v[1] - u[1]) - (p[1] - u[1]) * (v[0] - u[0])) > 1; });
  const wp = clean.map(W), mid = wp[Math.floor(wp.length / 2)], xs = wp.map(p => p[0]), ys2 = wp.map(p => p[1]);
  out.push({ id: newId(), kind: 'drive', path: wp, width: DW, r: 20, x: mid[0], y: mid[1], w: +(Math.max(...xs) - Math.min(...xs) + DW).toFixed(2), d: +(Math.max(...ys2) - Math.min(...ys2) + DW).toFixed(2), name: '', note: DW + ' ft drive', pinned: true });
  const spaces = out.filter(e => e.kind === 'parking').reduce((s, e) => s + S.stalls(e).count, 0);
  return { elements: out, spaces };
}
