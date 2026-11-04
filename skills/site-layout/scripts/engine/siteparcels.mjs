// A site of several parcels laid out parcel by parcel: each parcel its own site (its outline, the street it fronts, the
// side streets along it), its own program (the words say which use goes on which parcel: "retail with 3 pads on the
// 5.88 acre parcel, a flex building on the corner parcel", or one program shared by acreage) and its own layouts
// (lib/sitelayout.mjs layoutOptions; the generator's gallery for the uses it covers), composed into one plan with the
// parcel lines as its zones. Nothing crosses a parcel line, so each parcel can be built, sold or phased on its own.
import * as S from './siteplan.mjs';

const ORD = { first: 0, second: 1, third: 2, fourth: 3, fifth: 4, sixth: 5, '1st': 0, '2nd': 1, '3rd': 2, '4th': 3, '5th': 4, '6th': 5 };
const signed = r => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
// the parcels of a plan as parts: { key, label, acres, ring (plan feet, turned the site's way), front (the parcel edge
// along the site's front street, else along a side street, else the one nearest the front: landlocked), streets (its
// edges along the site's side streets), corner (on two streets), landlocked }
export function partsOf(plan, recs) {
  const F = S.frame(plan.origin), site = plan.ring || [], sf = plan.front ?? S.longestEdge(site), ss = [...new Set((plan.streets || []).filter(k => k !== sf && k < site.length))], out = [];
  const along = (ring, i, k) => { const a = ring[i], b = ring[(i + 1) % ring.length], c = site[k], d = site[(k + 1) % site.length]; if (S.segDist(mid(a, b), c, d) > 30) return false; // (its middle within 30 ft of the site's edge, and nearly parallel to it)
    const u = [b[0] - a[0], b[1] - a[1]], v = [d[0] - c[0], d[1] - c[1]], L = Math.hypot(...u) * Math.hypot(...v); return L > 0 && Math.abs(u[0] * v[0] + u[1] * v[1]) / L > 0.9; };
  for (const r of recs || []) {
    const g = r?.geometry; if (!g) continue; const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; if (!polys.length) continue;
    const rings = polys.map(p => S.tidyRing(p[0].map(ll => F.toFt(ll).map(v => +v.toFixed(2))), 0.5)).filter(q => q.length >= 3).sort((a, b) => S.ringArea(b) - S.ringArea(a)), ring = rings[0]; if (!ring) continue;
    if (site.length >= 3 && signed(ring) * signed(site) < 0) ring.reverse(); // (turned the way the site is: the engine's outward normals)
    const fronts = [], sides = []; ring.forEach((_, i) => { if (along(ring, i, sf)) fronts.push(i); else if (ss.some(k => along(ring, i, k))) sides.push(i); });
    const longest = list => list.slice().sort((a, b) => S.edgeLen(ring, b) - S.edgeLen(ring, a))[0];
    let front = longest(fronts), landlocked = false;
    if (front == null && sides.length) front = longest(sides);
    if (front == null) { landlocked = true; const c = site[sf], d = site[(sf + 1) % site.length]; let bd = Infinity; ring.forEach((a, i) => { const q = S.segDist(mid(a, ring[(i + 1) % ring.length]), c, d); if (q < bd) { bd = q; front = i; } }); }
    out.push({ key: String(r.key ?? r.propId ?? r.label ?? out.length + 1), label: String(r.label || r.situs || 'Parcel ' + (out.length + 1)).slice(0, 60), acres: +(S.ringArea(ring) / 43560).toFixed(2), ring, front, streets: sides.filter(i => i !== front), corner: fronts.length > 0 && sides.length > 0, landlocked });
  }
  return out;
}
// which part the words mean: its key, its acreage ("the 5.88 acre parcel"), "corner", "largest" / "smallest", "back"
// (landlocked), an ordinal ("the second parcel", "parcel 2"), or words of its label (the address); null when none fits
export function partFor(ref, parts, taken = new Set()) {
  const t = String(ref || '').toLowerCase().replace(/[’']/g, '').trim(), free = parts.filter(p => !taken.has(p.key)); if (!t || !parts.length) return null;
  const byKey = parts.find(p => p.key.toLowerCase() === t); if (byKey) return byKey;
  const ac = /(\d+(?:\.\d+)?)\s*-?\s*(?:ac\b|acre)/.exec(t); if (ac) { const want = +ac[1], c = free.slice().sort((a, b) => Math.abs(a.acres - want) - Math.abs(b.acres - want))[0]; if (c && Math.abs(c.acres - want) <= Math.max(0.15, want * 0.12)) return c; }
  if (/\bcorner\b/.test(t)) { const c = free.find(p => p.corner); if (c) return c; }
  if (/\b(largest|biggest|bigger|big|large|main)\b/.test(t)) return free.slice().sort((a, b) => b.acres - a.acres)[0] || null;
  if (/\b(smallest|smaller|small|little|tiny)\b/.test(t)) return free.slice().sort((a, b) => a.acres - b.acres)[0] || null;
  if (/\b(back|rear|landlocked|interior|inside)\b/.test(t)) { const c = free.find(p => p.landlocked); if (c) return c; }
  const o = /\b(first|second|third|fourth|fifth|sixth|1st|2nd|3rd|4th|5th|6th)\b/.exec(t) || /\bparcel\s*#?\s*(\d)\b/.exec(t) || /^#?(\d)$/.exec(t); if (o) { const i = ORD[o[1]] ?? (+o[1] - 1); if (parts[i]) return parts[i]; }
  const words = t.replace(/\b(the|parcel|parcels|lot|tract|on|at|for|acre|acres|ac)\b/g, ' ').split(/\s+/).filter(w => w.length > 2 || /^\d+$/.test(w)); if (!words.length) return null; // (the words of its label: the one matching most of them, an address number counting double)
  const hits = free.map(p => ({ p, n: words.reduce((k, w) => k + (p.label.toLowerCase().includes(w) ? (/^\d+$/.test(w) ? 2 : 1) : 0), 0) })).filter(h => h.n > 0).sort((a, b) => b.n - a.n); return hits.length && (hits.length === 1 || hits[0].n > hits[1].n) ? hits[0].p : hits[0]?.p || null;
}
export const ALL = /\b(both|each|every|all|the parcels)\b/i;
// the program for each part: the ones the words name ("... on the corner parcel"), the unnamed ones taking the parts
// left in order; one program for the whole site shared by acreage (its size split by each parcel's share)
export function assign(prog, parts) {
  const np = S.normalizeProgram(prog), list = Array.isArray(prog?.parcels) && prog.parcels.length ? prog.parcels : null, jobs = parts.map(part => ({ part, program: null, ref: null })), taken = new Set();
  if (list) {
    const later = [];
    for (const x of list) { if (ALL.test(x.parcel || '')) { for (const j of jobs) if (!j.program) { j.program = x.program; j.ref = x.parcel; } continue; } const p = partFor(x.parcel, parts, taken); if (p) { taken.add(p.key); const j = jobs.find(q => q.part === p); j.program = x.program; j.ref = x.parcel; } else later.push(x); }
    for (const x of later) { const j = jobs.find(q => !q.program); if (!j) break; j.program = x.program; j.ref = x.parcel; taken.add(j.part.key); }
    return jobs;
  }
  const total = parts.reduce((s, p) => s + p.acres, 0) || 1, sized = k => np[k] > 0;
  for (const j of jobs) { const sh = j.part.acres / total, q = { ...prog }; for (const k of ['gfa', 'units']) if (sized(k)) q[k] = Math.max(k === 'units' ? 1 : 500, Math.round(np[k] * sh / (k === 'units' ? 1 : 100)) * (k === 'units' ? 1 : 100)); if (np.pads > 0) q.pads = Math.max(0, Math.round(np.pads * sh)); delete q.parcels; j.program = q; }
  return jobs;
}
// the options: each part laid out on its own (its k-th layout in the k-th option), composed; T: { layoutOptions,
// layoutGallery, covers } from lib/sitelayout.mjs. opts.parcels: the parts (partsOf); opts.picks: a re-fit's choices.
export function parcelOptions(plan, prog, opts, T) {
  const parts = opts.parcels || [], jobs = assign(prog, parts), count = Math.max(1, Math.min(+opts.count || 3, 6)), per = [];
  for (const j of jobs) {
    if (!j.program) { per.push({ part: j.part, list: [], np: null }); continue; }
    const np = S.normalizeProgram(j.program), inside = e => { const c = e.poly ? S.centroid(e.poly) : [e.x, e.y]; return S.inRing(c, j.part.ring); };
    const sub = { ...plan, ring: j.part.ring, front: j.part.front, frontGuess: false, streets: j.part.streets, streetsSet: true, zones: [], elements: (plan.elements || []).filter(e => e.kind === 'keepout' && inside(e)), parcels: null, parcel: j.part.key, program: j.program, recipe: null, stages: null };
    let list = []; try { if (T.covers(np)) list = T.layoutGallery(sub, j.program, { budgetMs: opts.budgetMs ?? 6000 }).slice(0, count); if (!list.length) list = T.layoutOptions(sub, j.program, { ...opts, parcels: null, perParcel: false, picks: null, count }); } catch (e) { if (globalThis.SP_DEBUG) console.log('parcel', j.part.label, e.message); } // (the generator's gallery where it covers the use; the engine's search otherwise, or when nothing of the gallery fits a small lot)
    per.push({ part: j.part, list: list.filter(o => o.elements?.length), np });
  }
  const n = Math.max(1, ...per.map(x => x.list.length)), out = [], pick = opts.picks ? Object.fromEntries(opts.picks.map(p => [p.parcel, p])) : null;
  for (let k = 0; k < Math.min(count, n); k++) {
    const els = [], zones = [], names = [], notes = [], picks = [], progs = []; let score = 0;
    per.forEach((x, i) => {
      zones.push({ name: x.part.label, use: x.np?.use || null, zone: i, ring: x.part.ring, acres: x.part.acres, parcel: x.part.key });
      let at = Math.min(k, x.list.length - 1); if (pick?.[x.part.key]) { const q = pick[x.part.key], j = x.list.findIndex(o => q.key && o.key === q.key); at = j >= 0 ? j : Math.min(q.i || 0, x.list.length - 1); }
      const o = x.list[at]; if (!o) { if (x.np) notes.push(x.part.label + ': nothing fit on it.'); return; }
      picks.push({ parcel: x.part.key, key: o.key || null, i: at }); progs.push({ ...x.np, partName: x.part.label, parcel: x.part.key, zones: null, parcels: null });
      for (const e of o.elements) els.push({ ...e, zone: i, parcel: x.part.key }); names.push(x.part.label + ': ' + (o.label || o.name)); score += o.score || 0;
      for (const t of o.notes || []) if (!/^Fits about|^Parking is/.test(t) || true) notes.push(x.part.label + ': ' + t);
    });
    if (!els.some(e => e.kind === 'building')) continue;
    out.push({ name: 'Parcel by parcel' + (k ? ' · ' + (k + 1) : ''), elements: els, zones, program: { ...(progs[0] || S.normalizeProgram(prog)), zones: progs.length > 1 ? progs : null, parcels: jobs.filter(j => j.program).map(j => ({ parcel: j.part.key, program: { ...j.program, parcels: null } })) }, notes: [...names, ...notes], score, bad: [], recipe: { parcels: { picks } }, pondAt: 'none', parcelByParcel: true });
  }
  return out;
}
