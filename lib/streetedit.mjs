// Neighbourhood streets edited as a network (NEIGHBORHOOD-PLAN.md "Hand editing", phase 4b): a dead end (or a street that
// T's in at both ends) made a cul-de-sac, a street given a gentle bow, a stretch between two junctions deleted, and the
// streets that T into one carried along when it moves (a bend, a point dragged), so a junction holds. Each works on the
// drawn pieces only and leaves the lots to the re-fit that follows (lib/streetnet.mjs refitNet: one bent, cut or ended
// street re-flows its own lots, the rest stays put). Re-laying a whole block needs the generator (relayBlock, run in the
// layout worker). Each returns { elements, note, touched } or { error }. Pure: shared by the browser, the AI's edits and
// the tests.
import * as S from './siteplan.mjs';
import * as N from './streetnet.mjs';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]), fit = v => +v.toFixed(2), uid = p => p + Math.random().toString(36).slice(2, 8);
const unit = v => { const L = Math.hypot(v[0], v[1]) || 1; return [v[0] / L, v[1] / L]; }, bbox = P => [Math.min(...P.map(p => p[0])), Math.min(...P.map(p => p[1])), Math.max(...P.map(p => p[0])), Math.max(...P.map(p => p[1]))];
const toPoly = (p, r) => r.reduce((m, a, i) => Math.min(m, S.segDist(p, a, r[(i + 1) % r.length])), Infinity);
// a drive with a new centre line: its box and middle as a drawn street's are
const withPath = (e, P) => { const path = P.map(q => q.map(fit)), m = N.measured(path), mid = m.at(m.L / 2).p, b = bbox(path); return { ...e, path, x: fit(mid[0]), y: fit(mid[1]), w: fit(b[2] - b[0]), d: fit(b[3] - b[1]), rot: 0 }; };
// a stretch of a path between two places along it
const sub = (m, a, b) => [m.at(a).p, ...m.P.filter((q, i) => m.c[i] > a + 0.5 && m.c[i] < b - 0.5), m.at(b).p];
export const chainOf = (plan, id, chains = N.chainsOf(plan)) => chains.find(c => c.ids.includes(id) || c.key === id || c.bulbs.includes(id)) || null;
// a street as the messages name it: its street name, its own name, else what it is
export const streetWord = c => c?.name || c?.label || (c?.role === 'collector' ? 'The collector' : 'The street');
const lower = w => /^The /.test(w) ? 'the ' + w.slice(4) : w;
const rowOf = (plan, e, R) => { const s = plan.recipe?.net?.streets?.find(x => x.id === e.net); return s?.row || (e.width || 28) + (e.coll ? R.collector.row - R.collector.pave : R.local.row - R.local.pave); };
const reachedIds = plan => { const n = N.netOfPlan(plan); if (!n.entry) return null; const g = N.graphOf(n.streets, n.discs.filter(d => d.role !== 'ring'), n.entry); return new Set([...g.reached].map(s => s.id)); };
// how far each street is from the ways in, along the streets (the end of a street farther from the main entry is the one cut)
function fromEntry(plan) {
  const n = N.netOfPlan(plan), g = N.graphOf(n.streets, n.discs.filter(d => d.role !== 'ring'), n.entry), D = new Map(), q = (n.entry || []).slice(); for (const s of q) D.set(s.id, 0);
  while (q.length) { q.sort((a, b) => D.get(b.id) - D.get(a.id)); const s = q.pop(); for (const t of g.link.get(s) || []) { const d = D.get(s.id) + g.M.get(t).L; if (d < (D.get(t.id) ?? Infinity)) { D.set(t.id, d); q.push(t); } } }
  return D;
}

// ---------- a cul-de-sac ----------
// the street's end made a cul-de-sac: a dead end gets a bulb there (the street pulled back so the bulb's right-of-way and
// its lots fit); a street T-ing in at both ends is cut back at the end farther from the main entry (or the one asked: end
// 'start' | 'end'), clear of the street it met by a lot band and the bulb, when nothing beyond depends on it
export function culDeSac(plan, driveId, o = {}) {
  const c = chainOf(plan, driveId); if (!c) return { error: 'Couldn’t find that street.' }; const nm = streetWord(c), R = N.streetRules(plan), els = plan.elements || [];
  if (c.role === 'boulevard' || c.role === 'entry') return { error: nm + ' is a way in from the street: it can’t end in a cul-de-sac.' };
  if (c.cyc) return { error: nm + ' is a loop: it has no end to make a cul-de-sac. Delete a stretch of it first.' };
  const ends = c.ends.map((e, i) => e && { ...e, i }).filter(Boolean), want = o.end === 'start' ? 0 : o.end === 'end' ? 1 : null;
  let e = want != null ? ends.find(x => x.i === want) : ends.find(x => x.kind === 'free');
  if (!e) { const tees = ends.filter(x => x.kind === 'tee'); if (!tees.length || ends.some(x => x.kind === 'bulb') && !c.tees) return { error: nm + ' already ends in a cul-de-sac.' }; /* (a court with nothing meeting it along it: its T is its way in) */ const D = fromEntry(plan); e = tees.slice().sort((a, b) => (D.get(b.to) ?? 0) - (D.get(a.to) ?? 0) || dist(b.at, c.mid || b.at) - dist(a.at, c.mid || a.at))[0]; }
  if (e.kind === 'bulb') return { error: nm + ' already ends in a cul-de-sac there.' }; if (e.kind === 'street' || e.kind === 'join') return { error: 'That end of ' + lower(nm) + ' can’t be a cul-de-sac.' };
  const dr = els.find(x => x.id === e.id); if (!dr?.path) return { error: 'Couldn’t find that street’s drive.' };
  const lotD = plan.recipe?.net?.lot?.lotD || 115, row = rowOf(plan, dr, R), back = (e.kind === 'tee' ? 2 * lotD + 30 : 0) + R.bulbRow - row / 2 + 6, P = N.dens(dr.path, 10), m = N.measured(P), k = dist(P[0], e.at) < dist(P[P.length - 1], e.at) ? 0 : 1;
  if (m.L - back < 150) return { error: nm + ' is too short there to end in a cul-de-sac.' };
  const keep = k ? m.L - back : back, cut = k ? sub(m, 0, keep) : sub(m, keep, m.L), c0 = k ? cut[cut.length - 1] : cut[0], poly = S.ringDisc(c0, R.bulbR, 32).map(q => q.map(fit)), b = bbox(poly);
  const bulb = { id: o.id || uid('b'), kind: 'drive', poly, x: fit(c0[0]), y: fit(c0[1]), w: fit(b[2] - b[0]), d: fit(b[3] - b[1]), rot: 0, name: '', note: 'Cul-de-sac · ' + Math.round(2 * R.bulbR) + ' ft', bulb: true, net: uid('b'), pinned: true };
  const out = els.map(x => x.id === dr.id ? { ...withPath(x, cut), pinned: true } : x).concat([bulb]), p1 = { ...plan, elements: out };
  if (e.kind === 'tee') { const r0 = reachedIds(plan), r1 = reachedIds(p1); if (r0 && r1 && [...r0].some(id => !r1.has(id))) return { error: ends.some(x => x.kind === 'bulb') && !c.tees ? nm + ' already ends in a cul-de-sac: its other end is its only way in.' : nm + ' is the only way to the streets beyond it: it can’t end in a cul-de-sac there.' }; } // (a court with nothing meeting it along it: a cul-de-sac already, nothing beyond)
  const was = new Set(N.netRules(plan).filter(i => i.kind === 'cul').map(i => i.text)), long = N.netRules(p1).filter(i => i.kind === 'cul' && !was.has(i.text)).map(i => i.text.match(/runs (\d+) ft \(longest (\d+) ft/)).find(Boolean);
  return { elements: out, touched: [dr.id, bulb.id], bulb: bulb.id, note: nm + ' ends in a cul-de-sac now' + (e.kind === 'tee' ? ' (cut back clear of the street it met)' : '') + (long ? '; it runs ' + long[1] + ' ft, longer than the ' + long[2] + ' ft the rules allow' : '') + '.' };
}

// ---------- the streets that meet one carried with it ----------
// every street (and way in) whose end sat on `before` (within its pavement and 7 ft) has that end moved as the street's
// line moved there (before → after, by the share of the way along it), its last 80 ft on a ramp; a bulb at an end that
// moved goes with it. skip: drives moved already (a bent street's own pieces). The elements, changed
export function carryTees(els, id, before, after, skip = new Set()) {
  const me = els.find(e => e.id === id), w = me?.width || 28, mb = N.measured(before), ma = N.measured(after), moved = [];
  const shift = p => { const q = mb.proj(p); if (!q) return null; const t = mb.L ? q.s / mb.L : 0, a = ma.at(t * ma.L).p; return [a[0] - q.p[0], a[1] - q.p[1]]; };
  // the street's own ends (a point dragged at its end, a cul-de-sac's bulb there)
  for (const k of [0, 1]) { const b0 = k ? before[before.length - 1] : before[0], a0 = k ? after[after.length - 1] : after[0]; if (dist(b0, a0) > 0.5) moved.push({ at: b0, d: [a0[0] - b0[0], a0[1] - b0[1]] }); }
  const out = els.map(e => {
    if (e.id === id || skip.has(e.id) || e.kind !== 'drive' || !e.path || e.closed || S.isRing(e) || S.isLoop(e) || !(e.net || S.isEntrance(e))) return e;
    let P = e.path.map(q => q.slice()), hit = false;
    for (const k of [0, 1]) { const E = k ? P[P.length - 1] : P[0]; if (mb.proj(E).d > w / 2 + 7) continue; const d = shift(E); if (!d || Math.hypot(d[0], d[1]) < 0.05) continue;
      const m = N.measured(P); P = P.map((q, i) => { const s = k ? m.L - m.c[i] : m.c[i], f = Math.max(0, 1 - s / 80); return f ? [q[0] + d[0] * f, q[1] + d[1] * f] : q; }); hit = true; moved.push({ at: E, d }); }
    return hit ? { ...withPath(e, P), pinned: true } : e; });
  return out.map(e => { if (!e.bulb || !e.poly) return e; const c = S.centroid(e.poly), R = Math.max(...e.poly.map(p => dist(p, c))), mv = moved.find(x => dist(x.at, c) <= R + 3); if (!mv) return e; const poly = e.poly.map(p => [fit(p[0] + mv.d[0]), fit(p[1] + mv.d[1])]); return { ...e, poly, x: fit(e.x + mv.d[0]), y: fit(e.y + mv.d[1]) }; });
}
// the ends of a street that T'd into another before and no longer meet it after (a point dragged off the junction): the
// names of the streets they met
export function teesLost(before, after, id) {
  const c0 = chainOf(before, id), c1 = chainOf(after, id); if (!c0 || !c1) return [];
  const all = N.chainsOf(before), word = to => streetWord(all.find(c => c.ids.includes(to)));
  return c0.ends.filter(e => e?.kind === 'tee' && e.id === id).filter(e => !c1.ends.some(f => f?.kind === 'tee' && f.id === id && f.k === e.k)).map(e => word(e.to));
}

// ---------- a gentle bow ----------
// the whole street (its chain, piece by piece) bowed sideways by curve ft at its middle, + to the left of its way (null: 6%
// of its length, 40-120 ft), its ends where they are; refused (or halved, twice) when that runs it off the land, into a
// pond, a park or the commons, or near another street away from where they meet; the streets that meet it carried along
export function bendStreet(plan, driveId, curve = null) {
  const chains = N.chainsOf(plan), c = chainOf(plan, driveId, chains); if (!c) return { error: 'Couldn’t find that street.' }; const nm = streetWord(c), els = plan.elements || [], R = N.streetRules(plan);
  if (c.cyc) return { error: nm + ' is a loop: drag its points to reshape it.' }; if (c.role === 'boulevard' || c.role === 'entry') return { error: 'A way in bends with Edit Shape: drag its points.' };
  if (c.ends.some(e => e?.to && S.isRing(els.find(x => x.id === e.to) || {}))) return { error: nm + ' meets a roundabout: it can’t bow without moving the roundabout. Drag its points instead.' };
  const byId = new Map(els.map(e => [e.id, e])), parts = c.parts.map(p => ({ ...p, e: byId.get(p.id) })).filter(p => p.e?.path), Lc = c.L; if (!parts.length || Lc < 200) return { error: nm + ' is too short to curve.' };
  const cv = curve == null ? NaN : +curve, amt0 = Number.isFinite(cv) && Math.abs(cv) >= 5 ? cv : Math.max(40, Math.min(120, 0.06 * Lc)) * (cv < 0 ? -1 : 1); // (a sign alone: that way, by the usual amount)
  const ring = plan.ring || [], keep = els.filter(e => e.kind === 'pond' || S.isPark(e) && !S.isMedian(e)).map(e => S.shapeOf(e)).concat(plan.recipe?.net?.core ? [plan.recipe.net.core] : []);
  const n = N.netOfPlan(plan), mine = new Set(c.ids), others = n.streets.filter(s => !mine.has(s.id) && !s.ring).map(s => ({ s, path: s.path, h: (s.role === 'entry' ? s.w + 22 : s.w + (s.role === 'coll' ? R.collector.row - R.collector.pave : R.local.row - R.local.pave)) / 2 }));
  const ri = N.rowIndex(others, n.discs.filter(d => !c.bulbs.includes(d.id)).map(d => ({ d, c: d.c, r: R.bulbRow }))), jx = [...c.J, ...(c.ends[0]?.kind === 'tee' ? [0] : []), ...(c.ends[1]?.kind === 'tee' ? [Lc] : [])];
  const bow = amt => parts.map(p => { const P = N.dens(p.e.path, 10), m = N.measured(P); return { p, before: p.e.path, P0: P, after: P.map((q, i) => { const s = m.c[i], sc = p.off + (p.rev ? p.L - s : s), t = m.tan(s).map(v => v * (p.rev ? -1 : 1)), f = amt * Math.sin(Math.PI * Math.max(0, Math.min(Lc, sc)) / Lc); return [q[0] - t[1] * f, q[1] + t[0] * f]; }) }; });
  const why = (bent, amt) => { for (const b of bent) { const w = b.p.e.width || 28, row = rowOf(plan, b.p.e, R), m = N.measured(b.after);
      for (let i = 0; i < b.after.length; i++) { const q = b.after[i], sc = b.p.off + (b.p.rev ? b.p.L - m.c[i] : m.c[i]);
        if ((!S.inRing(q, ring) || toPoly(q, ring) < w / 2 + 2) && S.inRing(b.P0[i], ring) && toPoly(b.P0[i], ring) >= w / 2 + 2) return 'it would run off the land';
        if (keep.some(r => S.inRing(q, r) || toPoly(q, r) < w / 2) && !keep.some(r => S.inRing(b.P0[i], r) || toPoly(b.P0[i], r) < w / 2)) return 'it would run into a pond, a park or the commons';
        if (!jx.some(j => Math.abs(j - sc) < row + 40) && ri.inRow(q, null, row / 2) && !ri.inRow(b.P0[i], null, row / 2)) return 'it would run too near another street'; } } return null; }; // (only where it comes nearer: a bulb that sat by a street already stays)
  const c0 = new Set(N.clashes(els)); let last = null;
  for (const amt of [amt0, amt0 / 2, amt0 / 4]) { const bent = bow(amt), w0 = why(bent, amt); if (w0) { last = w0; continue; }
    let out = els.map(e => { const b = bent.find(x => x.p.id === e.id); return b ? { ...withPath(e, b.after), pinned: true } : e; }), skip = new Set(c.ids);
    for (const b of bent) out = carryTees(out, b.p.id, b.before, b.after, skip);
    const cl = N.clashes(out).filter(t => !c0.has(t)); if (cl.length) { last = 'it would run into another street'; continue; }
    const moved = out.filter((e, i) => e !== els[i]).map(e => e.id);
    return { elements: out, touched: moved, curve: Math.round(amt), note: 'Curved ' + lower(nm) + ' ' + Math.round(Math.abs(amt)) + ' ft at its middle' + (amt !== amt0 ? ' (less than asked: any more and ' + last + ')' : '') + '.' }; }
  return { error: nm + ' can’t curve there: ' + (last || 'there’s no room') + '.' };
}

// ---------- one stretch deleted ----------
// the stretch of a street between the two junctions either side of p (or to its end) taken out; the pieces left keep
// the street's network id (the re-fit makes each a street of its own) and its lots re-flow. Refused when it's the only way
// to the streets beyond it
export function cutStretch(plan, driveId, p) {
  const els = plan.elements || [], e = els.find(x => x.id === driveId), c = chainOf(plan, driveId); if (!e?.path || !c) return { error: 'Couldn’t find that street.' }; const nm = streetWord(c);
  const n = N.netOfPlan(plan), g = N.graphOf(n.streets, n.discs.filter(d => d.role !== 'ring'), n.entry), s = n.streets.find(x => x.id === driveId); if (!s) return { error: 'Couldn’t find that street.' };
  const m = g.M.get(s), sp = m.proj(p).s, js = [...new Set((g.J.get(s) || []).map(j => Math.round(j.at)))].filter(v => v > 20 && v < m.L - 20).sort((a, b) => a - b);
  if (!js.length) return { error: 'No streets meet ' + lower(nm) + ' along it: delete the whole street instead.' };
  const a = js.filter(v => v <= sp).pop() ?? 0, b = js.find(v => v >= sp) ?? m.L, pieces = [];
  if (a > 30) pieces.push(sub(m, 0, a)); if (m.L - b > 30) pieces.push(sub(m, b, m.L));
  const endBulb = k => els.filter(x => x.bulb && x.poly && dist(S.centroid(x.poly), k ? m.P[m.P.length - 1] : m.P[0]) < 5).map(x => x.id), gone = new Set([...(a <= 30 ? endBulb(0) : []), ...(m.L - b <= 30 ? endBulb(1) : [])]);
  const ids = pieces.map((q, i) => i ? uid(e.id + '.') : e.id), out = els.filter(x => x.id !== e.id && !gone.has(x.id)).concat(pieces.map((q, i) => ({ ...withPath(e, q), id: ids[i], pinned: true })));
  const p1 = { ...plan, elements: out }, r0 = reachedIds(plan), r1 = reachedIds(p1); if (r0 && r1 && [...r0].some(id => id !== e.id && !r1.has(id) && out.some(x => x.id === id))) return { error: 'That stretch of ' + lower(nm) + ' is the only way to the streets beyond it: deleting it would cut them off.' }; // (as a cul-de-sac there would)
  const free = N.chainsOf(p1).filter(x => x.ids.some(i => ids.includes(i))).flatMap(x => x.ends).filter(x => x?.kind === 'free' && ids.includes(x.id));
  return { elements: out, touched: ids, note: 'Deleted a ' + Math.round(b - a) + ' ft stretch of ' + lower(nm) + '.' + (free.length ? ' It leaves ' + (free.length === 1 ? 'a dead end' : free.length + ' dead ends') + ': make ' + (free.length === 1 ? 'it' : 'them') + ' a cul-de-sac?' : '') };
}
// the streets of a chain (a street's id or key): its drives and the cul-de-sacs at its ends, for remove
export const streetIds = (plan, id) => { const c = chainOf(plan, id); return c ? c.ids.concat(c.bulbs) : []; };
// the block of land a street or a piece stands in, for "re-lay this block": a point in it (plan feet). A collector or a way
// in runs between blocks: the one on the side of p (where it was clicked), past its right-of-way; with no p, which is
// meant can't be told (null)
export function blockAt(plan, id, p = null) {
  const els = plan.elements || [], c = chainOf(plan, id); if (c && !p && !['local', 'court'].includes(c.role)) return null;
  if (c && p && !['local', 'court'].includes(c.role)) { const ds = els.filter(x => c.ids.includes(x.id) && x.path?.length >= 2).map(e => ({ e, m: N.measured(e.path) })).map(o => ({ ...o, q: o.m.proj(p) })).sort((a, b) => a.q.d - b.q.d), o = ds[0];
    if (o) { const t = o.m.tan(o.q.s), sg = t[0] * (p[1] - o.q.p[1]) - t[1] * (p[0] - o.q.p[0]) >= 0 ? 1 : -1, h = rowOf(plan, o.e, N.streetRules(plan)) / 2 + 60; return [fit(o.q.p[0] - t[1] * sg * h), fit(o.q.p[1] + t[0] * sg * h)]; } }
  if (c?.mid) return c.mid; const e = els.find(x => x.id === id); return e ? S.centroid(S.shapeOf(e)) : null;
}
