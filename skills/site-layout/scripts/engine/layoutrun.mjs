// A layout run: a validated brief in, ranked and independently checked layouts out, and a record that replays exactly.
//
//   runBrief(brief) -> record { schema, versions, inputHash, brief (canonical), solver (seed, tick, evaluation stats),
//                               outcome, options: [{ rank, id, name, geometryHash, elements, quantities, validation }] }
//   replayRun(record) -> { identical, diffs, record }   (no AI, no network: only the saved brief)
//
// The engine runs inside lib/enginectx.mjs deterministic(): a seeded random generator and a virtual clock, so the
// searches' time budgets become evaluation budgets. Same brief, seed, tick and versions -> same geometry, ids,
// quantities and ranking on any machine (test/layoutrun.mjs repeats representative runs 20 times).
//
// Outcomes (never one dressed as another):
//   feasible            – at least one option passes every hard check it could measure ('best found', not optimal)
//   needs-review        – options exist with no hard failure, but some hard checks are unknown (missing evidence)
//   no-feasible-found   – the search ran its budget; every option fails a hard check (not a proof of infeasibility)
//   proven-infeasible   – an analytic bound shows the program cannot fit (reason given)
//   unsupported         – the brief asks for a form the engine does not draw (lib/layoutcaps.mjs)
//   missing-information – the brief lacks what a run needs (the site, the program)
//   invalid-brief       – the brief is malformed
import * as CX from './enginectx.mjs';
import * as B from './layoutbrief.mjs';
import * as V from './layoutcheck.mjs';
import { CAPS, CAPS_VERSION, FORMLESS_OK } from './layoutcaps.mjs';
import { hashOf } from './sha256.mjs';
import { layoutOptions } from './sitelayout.mjs';
import * as S from './siteplan.mjs';
import polyclip from './vendor/polyclip.mjs';
import * as T from './bldgtemplates.mjs';
import * as TURN from './turning.mjs';
import * as BT from './btypes.mjs';
import * as I from './layoutintent.mjs';
import * as G from './guardrails.mjs';
import * as SITE from './btsite.mjs';
import { restripeAngled } from './siteparking.mjs';

export const RUN_SCHEMA = 'rei.run/1';
export const ENGINE_VERSION = 'rei-layout/2026.11.05.9'; // bump when a change to lib/site*.mjs or lib/streetnet.mjs moves geometry
export const versions = () => ({ engine: ENGINE_VERSION, validator: V.VALIDATOR_VERSION, caps: CAPS_VERSION, templates: T.TEMPLATES_VERSION, brief: B.BRIEF_SCHEMA });

const r2 = v => typeof v === 'number' ? Math.round(v * 100) / 100 : v;
// a piece with its numbers at 0.01 ft and its keys in a fixed order (the stored, hashed form)
function canonEl(e) {
  const out = {};
  for (const k of Object.keys(e).sort()) {
    const v = e[k];
    if (v === undefined || typeof v === 'function') continue;
    out[k] = typeof v === 'number' ? r2(v) : Array.isArray(v) ? JSON.parse(JSON.stringify(v, (_, x) => typeof x === 'number' ? r2(x) : x)) : v && typeof v === 'object' ? JSON.parse(JSON.stringify(v, (_, x) => typeof x === 'number' ? r2(x) : x)) : v;
  }
  return out;
}
export const canonElements = els => (els || []).map(canonEl);
// a shop, office or warehouse box keeps the floor area it was drawn to, at full precision, before its sides are stored at
// 0.01 ft: 250,000 sf drawn 1,041.667 x 240 ft is stored 1,041.67 x 240 (250,000.8 sf) and no pair of sides on that grid
// gives 250,000 without the box growing into the truck court it abuts. The validator takes the stated area only while the
// stored outline agrees with it to that precision (lib/layoutcheck.mjs quantities); homes keep their own counts.
const RESI = ['multifamily', 'townhomes', 'duplex', 'sfr'];
function drawnAreas(els, prog) {
  return (els || []).map(e => e && e.kind === 'building' && !e.poly && e.gfa == null && !RESI.includes(e.use || prog?.use) && +e.w > 0 && +e.d > 0 ? { ...e, gfa: Math.round(e.w * e.d * (+e.floors || 1)) } : e);
}
export const geometryHash = els => hashOf(canonElements(els).map(e => { const { note, name, ...g } = e; return g; }));

// Paving left behind: when trimming to an exact count (or parking fits) took buildings away, their parking rows and the
// dead-end drives to them stay drawn (an empty paved block). Rows with no building within FAR_FT go, farthest first,
// while the parking left still meets what's required; then drives that reach nothing (no row, no building within
// FAR_FT, one paved neighbour) go. Entrances and drives that join other paving never do. The validator judges the result
// and lib/layoutrun.mjs keeps it only when no hard check gets worse.
const FAR_FT = 80, NEAR_FT = 40;
// A second way in the fire code asks for (lib/layoutcheck.mjs access.second) when the layout has only one: the engine's
// own search for one (S.moreEntrances) with the pond and its trail set aside, since a leftover-land pond often takes the
// only free stretch of street (23737 FM 2920, Hockley: along Becker Road). The pond is then cut back from the new drive
// (10 ft) and keeps its largest piece; the trail keeps the stretches that don't cross the drive. Kept only when no hard
// check gets worse (keepIfNoWorse); the detention line reports what the pond now holds.
export function addSecondAccess(plan, o, brief) {
  const r = addSecondAccess1(plan, o, brief);
  if (!o?.elements?.length || !accessShort(plan, r, brief)) return r;
  return homesGiveWay(plan, o, brief) || r;
}
const accessShort = (plan, o, brief) => { const v = V.validateLayout({ ...plan, elements: o.elements, program: o.program || {} }, brief); return ['access.second', 'access.remote'].some(id => v.checks.find(c => c.id === id)?.status === 'fail'); };
// Townhomes packed up to the street can leave no stretch of it for the second way in the fire code wants (or none far
// enough from the main entry), and the run would fall back on a gated emergency lane. Where the count can spare homes
// (as many as fit, or up to), the row nearest a street and farthest from the ways in there are gives way, with its lots
// and driveways, and the second way in is looked for again; up to four rows are tried, one at a time, the first that
// gives a real entrance (and the spacing) kept.
function homesGiveWay(plan, o, brief) {
  const HOME = ['townhomes', 'duplex'], useOf = e => e.use || o.program?.use, els = o.elements;
  const spare = (brief?.program?.uses || []).some(u => HOME.includes(u.use) && u.quantity?.unit === 'units' && (u.quantity.mode === 'maximize' || u.quantity.mode === 'max'));
  if (!spare) return null;
  const ring = plan.ring, n = ring.length, edges = [plan.front, ...(plan.streets || [])].filter(k => k != null && k < n), ents = S.entrancesOf(els).map(e => S.centroid(S.shapeOf(e)));
  if (!edges.length || !ents.length) return null;
  const toStreet = sh => Math.min(...sh.flatMap(p => edges.map(k => S.segDist(p, ring[k], ring[(k + 1) % n]))));
  const rows = els.filter(e => e.kind === 'building' && !e.future && HOME.includes(useOf(e)) && !e.poly).map(e => { const sh = S.shapeOf(e), c = S.centroid(sh); return { e, st: toStreet(sh), far: Math.min(...ents.map(q => Math.hypot(q[0] - c[0], q[1] - c[1]))) }; })
    .filter(r => r.st < 110).sort((a, b) => b.far - a.far || String(a.e.id).localeCompare(String(b.e.id))).slice(0, 4);
  for (const { e } of rows) {
    const lots = els.filter(lt => lt.kind === 'lot' && S.rectsOverlap(lt, e, 1)), drv = els.filter(x => x.kind === 'plaza' && x.note === 'Driveway' && lots.some(lt => S.inRing(S.centroid(S.shapeOf(x)), S.shapeOf(lt))));
    const gone = new Set([e, ...lots, ...drv]), o1 = { ...o, elements: els.filter(x => !gone.has(x)) }, o2 = addSecondAccess1(plan, o1, brief);
    if (o2 === o1 || accessShort(plan, o2, brief)) continue;
    return { ...o2, tplNotes: [...(o2.tplNotes || []), (e.name || 'A row of homes') + ' (' + e.units + ' homes) gave way for the second entrance.'] };
  }
  return null;
}
function addSecondAccess1(plan, o, brief) {
  if (!o?.elements?.length) return o;
  if (o.forceMore) { const { forceMore, ...rest } = o; void forceMore; return addSecondAccess0(plan, rest, brief); }
  const v = V.validateLayout({ ...plan, elements: o.elements, program: o.program || {} }, brief), c = v.checks.find(x => x.id === 'access.second'), rm = v.checks.find(x => x.id === 'access.remote');
  if (c?.status !== 'fail') {
    // two ways in, but closer than half the site's diagonal (a centred main entry on one frontage): a third at the far end
    // makes the outer two far enough apart; kept only when it does
    if (rm?.status !== 'fail') return o;
    const o3 = addSecondAccess1(plan, { ...o, forceMore: true }, brief), v3 = o3 === o ? null : V.validateLayout({ ...plan, elements: o3.elements, program: o3.program || {} }, brief);
    return v3 && v3.checks.find(x => x.id === 'access.remote')?.status === 'pass' ? { ...o3, forceMore: undefined, tplNotes: [...(o.tplNotes || []), 'A third way in at the far end of the street, so two are at least half the site’s diagonal apart (fire code spacing).'] } : o;
  }
  return addSecondAccess1(plan, { ...o, forceMore: true }, brief);
}
function addSecondAccess0(plan, o, brief) {
  const wet = o.elements.filter(e => e.kind === 'pond' || e.kind === 'trail'), rest = o.elements.filter(e => !wet.includes(e));
  const edges = (plan.streets || []).concat(plan.front != null ? [plan.front] : []);
  let m = null;
  // the spot with the pond as it is, and the spot with the pond cut back for the drive: the one farther from the ways in
  // there are (by more than 100 ft) is kept (a pond along the frontage took the far end a second way in needs, and the
  // spot round it was next to the main entry)
  const have = S.entrancesOf(o.elements).map(e => S.centroid(S.shapeOf(e))), farOf = mm => { const d = mm?.added?.length ? mm.elements.filter(e => e.kind === 'drive' && !o.elements.some(x => x.id === e.id) && (e.entry || /^Entrance\b/.test(e.name || ''))) : []; if (!d.length) return -1; const c = S.centroid(S.shapeOf(d[0])); return have.length ? Math.min(...have.map(h => Math.hypot(h[0] - c[0], h[1] - c[1]))) : 0; };
  for (const opts of [{ edges, throughParks: true }, { edges, throughParks: true, W: 24 }]) { let m0 = null, m1 = null; try { m0 = S.moreEntrances({ ...plan, elements: o.elements }, 1, opts); } catch { m0 = null; }
    try { m1 = S.moreEntrances({ ...plan, elements: rest }, 1, opts); } catch { m1 = null; }
    const d0 = farOf(m0), d1 = farOf(m1); m = d1 > d0 + 100 ? m1 : m0?.added?.length ? m0 : m1; if (m?.added?.length) break; }
  if (!m?.added?.length) return o;
  const added = m.elements.filter(e => !o.elements.some(x => x.id === e.id) && e.kind === 'drive'), cuts = added.map(d => S.grow(S.shapeOf(d), 10));
  const cl = r => { const q = S.signedArea(r) >= 0 ? r : r.slice().reverse(); return q.concat([q[0]]); };
  const ponds = []; for (const e of wet.filter(e => e.kind === 'pond')) { let pieces = [S.shapeOf(e)];
    for (const k of cuts) pieces = pieces.flatMap(pc => { try { return polyclip.difference([cl(pc)], [cl(k)]).map(pg => pg[0].slice(0, -1)); } catch { return [pc]; } });
    const big = pieces.filter(r => r.length >= 3).sort((a, b) => S.ringArea(b) - S.ringArea(a))[0]; if (big && S.ringArea(big) > 2000) ponds.push({ ...e, poly: big.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]), x: undefined, y: undefined, w: undefined, d: undefined, rot: undefined }); }
  const trails = []; for (const t of wet.filter(e => e.kind === 'trail' && e.path?.length >= 2)) { let run = [], k = 0; const flush = () => { if (run.length >= 2) { const { closed, ...open } = t; void closed; trails.push({ ...open, id: t.id + (k ? '-' + k : ''), path: run }); } k++; run = []; }; // (a piece of a loop is an open path: closed would join its ends across the site)
    for (const p of t.path) { if (cuts.some(r => S.inRing(p, r))) flush(); else run.push(p); } flush(); }
  const fixed = m.elements.filter(e => e.kind !== 'pond' && e.kind !== 'trail').concat(ponds.map(e => Object.fromEntries(Object.entries(e).filter(([, x]) => x !== undefined))), trails);
  return { ...o, elements: fixed, tplNotes: [...(o.tplNotes || []), 'A second way in added for fire access' + (ponds.length && wet.some(e => e.kind === 'pond') ? ', the pond cut back from it' : '') + ' (' + (m.added[0]?.name || 'Entrance') + ').'] };
}
// Land a piece left (a pond moved, parking taken out) goes back to the open land beside it: each green within `reach` ft
// of where the piece was takes in `was` (the area round it), less whatever else stands there now, held to its own box.
// `out` is changed in place.
function giveBackLand(out, was, at, reach) {
  const cl = r => { const q = S.signedArea(r) >= 0 ? r : r.slice().reverse(); return q.concat([q[0]]); };
  for (const [j, g] of out.entries()) { if (g.kind !== 'green' || !g.poly || g.note === 'Courtyard' || S.gapBetween(g.poly, at) > reach) continue;
    const xs = g.poly.map(p => p[0]), ys = g.poly.map(p => p[1]), box = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]];
    const solidNow = out.filter((x, m) => m !== j && x.kind !== 'green' && x.kind !== 'tree' && x.kind !== 'trail' && !x.future).map(x => cl(S.grow(S.shapeOf(x), x.kind === 'pond' ? 12 : 6)));
    try { const fill = solidNow.length ? polyclip.difference([cl(was)], ...solidNow.map(q => [q])) : [[cl(was)]];
      const u = polyclip.intersection(polyclip.union([cl(g.poly)], ...fill), [cl(box)]).map(pg => pg[0].slice(0, -1)).sort((a, b) => S.ringArea(b) - S.ringArea(a))[0];
      if (u && u.length >= 3 && S.ringArea(u) >= S.ringArea(g.poly)) out[j] = { ...g, poly: u.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]) }; } catch { /* the outline stays as it was */ } }
}
// A pond left out in the land held for later (a compact first phase: the detention drawn in the middle of the future
// development, 300 ft from anything it drains) is moved beside the work it serves: the nearest spot along the built
// area's side or back that's inside the site's inset, clear of every other piece. A rectangular pond only; kept only when
// no check gets worse.
const POND_FAR = 120; // ft from the nearest building or paving
export function pondBesideWork(plan, o) {
  const els = o.elements || [], work = els.filter(e => e.kind === 'building' || e.kind === 'parking' || e.kind === 'drive' || e.kind === 'truck');
  const ponds = els.filter(e => e.kind === 'pond' && !e.poly && e.w > 0 && e.d > 0 && !(e.rot % 180)); if (!work.length || !ponds.length) return o;
  const pts = work.flatMap(e => S.shapeOf(e)), bx0 = Math.min(...pts.map(p => p[0])), bx1 = Math.max(...pts.map(p => p[0])), by0 = Math.min(...pts.map(p => p[1])), by1 = Math.max(...pts.map(p => p[1]));
  const inner = S.insetRing ? S.insetRing(plan.ring, plan.ring.map(() => 12)) : null; if (!inner || inner.length < 3) return o;
  const solid = els.filter(e => !['green', 'lot', 'tree', 'trail', 'fence', 'sign'].includes(e.kind) && !e.future);
  let moved = 0; const out = els.map(e => ({ ...e }));
  for (const [k, e0] of els.entries()) {
    if (!ponds.includes(e0)) continue;
    const gap = Math.min(...work.map(w => S.gapBetween(S.shapeOf(e0), S.shapeOf(w)))); if (gap <= POND_FAR) continue;
    const others = solid.filter(x => x !== e0), cands = [];
    for (const [w, d] of [[e0.w, e0.d], [e0.d, e0.w]]) {
      for (let t = 0; t <= 1.0001; t += 0.05) { // along the right and left sides, then along the back
        const y = by0 + d / 2 + (by1 - by0 - d) * t, x = bx0 + w / 2 + (bx1 - bx0 - w) * t;
        cands.push([bx1 + 25 + w / 2, y, w, d], [bx0 - 25 - w / 2, y, w, d], [x, by1 + 25 + d / 2, w, d]);
      }
    }
    const mid = [(bx0 + bx1) / 2, (by0 + by1) / 2];
    const fits = ([x, y, w, d]) => { const r = S.corners({ x, y, w, d }); return r.every(p => S.inRing(p, inner)) && !others.some(q => S.gapBetween(r, S.shapeOf(q)) < 10); };
    const best = cands.filter(fits).sort((a, b) => Math.hypot(a[0] - mid[0], a[1] - mid[1]) - Math.hypot(b[0] - mid[0], b[1] - mid[1]))[0];
    if (!best) continue;
    out[k] = { ...out[k], x: +best[0].toFixed(2), y: +best[1].toFixed(2), w: best[2], d: best[3] }; moved++;
  }
  if (!moved) return o;
  // the land the pond left goes back to the land round it (a future development area had the pond's outline cut out of it)
  for (const [k, e0] of els.entries()) { if (!ponds.includes(e0) || out[k].x === e0.x && out[k].y === e0.y) continue;
    giveBackLand(out, S.corners({ ...e0, w: e0.w + 240, d: e0.d + 240 }), S.corners(e0), 130); } // (generous: the land kept round the old pond went with it)
  // a walking trail round the pond goes with it: a loop round the new outline (15 ft out, as tidyPonds draws it) where it
  // stays inside the site, else it goes (left behind, it drew an empty outline in the land held for later)
  const lost = new Set();
  for (const [k, e0] of els.entries()) { if (!ponds.includes(e0) || out[k].x === e0.x && out[k].y === e0.y) continue;
    const near = S.grow(S.corners(e0), 40);
    for (let j = 0; j < out.length; j++) { const t = out[j]; if (t.kind !== 'trail' || !(t.path?.length >= 2) || !t.path.every(q => S.inRing(q, near))) continue;
      const loop = S.grow(S.corners(out[k]), 15); if (t.closed && loop?.length >= 3 && loop.every(q => S.inRing(q, plan.ring)) && !els.some(x => (x.kind === 'building' || x.kind === 'parking' || x.kind === 'drive') && loop.some(q => S.inRing(q, S.shapeOf(x))))) out[j] = { ...t, path: loop.map(q => [+q[0].toFixed(2), +q[1].toFixed(2)]) }; else lost.add(j); } }
  return { ...o, elements: out.filter((_, j) => !lost.has(j)), tplNotes: [...(o.tplNotes || []), 'The detention pond moved beside the buildings and parking it drains, out of the land held for later.'] };
}
// An emergency access lane where two ways in are needed and no second street entrance fits far enough from the first
// (a 330 ft frontage on an 800 ft deep lot can't put two half its 866 ft diagonal apart): a 20 ft gated fire lane on an
// all-weather surface, straight in from a lot line to the nearest drive, at a spot at least half the diagonal from one
// of the entrances. A street edge first; else a side or rear line, which needs an access easement across the
// neighbour's land (the notes say so). Never through a building, a lot, a parking row or a pond. IFC D106.3 / D107.2 let
// the fire official accept one; the validator counts it as such (an assumption).
const LANE_W = 20, LANE_MAX = 420;
export function addEmergencyAccess(plan, o, brief) {
  const r = addEmergencyAccess0(plan, o, brief);
  if (r !== o || !o?.elements?.length || o.elements.some(e => e.emergency)) return r;
  return rowGivesWayForLane(plan, o, brief) || r;
}
// Townhomes packed to the side and rear lot lines (or a pond there) can leave no straight way in from a lot line for the
// emergency lane, and the option is left short of its second way in. Where the count can spare homes (as many as fit, or
// up to), one row near a lot line gives way, with its lots and driveways, and the lane is looked for again: the smallest
// rows first, the farthest from the entrances first among equals, six at most; the first that lets a lane in is kept.
function rowGivesWayForLane(plan, o, brief) {
  const HOME = ['townhomes', 'duplex'], useOf = e => e.use || o.program?.use, els = o.elements;
  if (!(brief?.program?.uses || []).some(u => HOME.includes(u.use) && u.quantity?.unit === 'units' && (u.quantity.mode === 'maximize' || u.quantity.mode === 'max'))) return null;
  const v = V.validateLayout({ ...plan, elements: els, program: o.program || {} }, brief); if (!['access.second', 'access.remote'].some(id => v.checks.find(c => c.id === id)?.status === 'fail')) return null;
  const ring = plan.ring, n = ring.length, ents = S.entrancesOf(els).map(e => S.centroid(S.shapeOf(e))); if (!ents.length) return null;
  const toLine = sh => Math.min(...sh.flatMap(p => ring.map((a, k) => S.segDist(p, a, ring[(k + 1) % n]))));
  const rows = els.filter(e => e.kind === 'building' && !e.future && HOME.includes(useOf(e)) && !e.poly).map(e => { const sh = S.shapeOf(e), c = S.centroid(sh); return { e, st: toLine(sh), far: Math.min(...ents.map(q => Math.hypot(q[0] - c[0], q[1] - c[1]))) }; })
    .filter(r => r.st < 60).sort((a, b) => (+a.e.units || 0) - (+b.e.units || 0) || b.far - a.far || String(a.e.id).localeCompare(String(b.e.id))).slice(0, 6);
  for (const { e } of rows) {
    const lots = els.filter(lt => lt.kind === 'lot' && S.rectsOverlap(lt, e, 1)), drv = els.filter(x => x.kind === 'plaza' && x.note === 'Driveway' && lots.some(lt => S.inRing(S.centroid(S.shapeOf(x)), S.shapeOf(lt))));
    const gone = new Set([e, ...lots, ...drv]), o1 = { ...o, elements: els.filter(x => !gone.has(x)) }, o2 = addEmergencyAccess0(plan, o1, brief);
    if (o2 === o1) continue;
    return { ...o2, tplNotes: [...(o2.tplNotes || []), (e.name || 'A row of homes') + ' (' + e.units + ' homes) gave way for the emergency access lane.'] };
  }
  return null;
}
function addEmergencyAccess0(plan, o, brief) {
  if (!o?.elements?.length || o.elements.some(e => e.emergency)) return o;
  const v = V.validateLayout({ ...plan, elements: o.elements, program: o.program || {} }, brief), chk = id => v.checks.find(x => x.id === id)?.status;
  if (chk('access.second') !== 'fail' && chk('access.remote') !== 'fail') return o;
  const ring = plan.ring, n = ring.length, els = o.elements, ccw = S.signedArea(ring) >= 0;
  let diag = 0; for (const a of ring) for (const b of ring) diag = Math.max(diag, Math.hypot(a[0] - b[0], a[1] - b[1]));
  const edgeD = p => { let d = Infinity; for (let k = 0; k < n; k++) d = Math.min(d, S.segDist(p, ring[k], ring[(k + 1) % n])); return d; };
  const mouths = S.entrancesOf(els).map(e => { const pts = S.shapeOf(e).filter(p => edgeD(p) <= 3 || !S.inRing(p, ring)); return pts.length ? [pts.reduce((t, p) => t + p[0], 0) / pts.length, pts.reduce((t, p) => t + p[1], 0) / pts.length] : null; }).filter(Boolean);
  if (!mouths.length) return o;
  const streets = new Set([plan.front ?? 0, ...(plan.streets || [])]);
  const drives = els.filter(e => e.kind === 'drive' && !e.emergency).map(e => S.shapeOf(e));
  const solid = els.filter(e => ['building', 'lot', 'parking', 'pool', 'pond', 'garage', 'trash', 'plaza', 'field', 'truck', 'fuel', 'canopy'].includes(e.kind) && !e.future).map(e => S.shapeOf(e));
  const cands = [];
  for (let k = 0; k < n; k++) {
    const a = ring[k], b = ring[(k + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 80) continue;
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], inw = ccw ? [-u[1], u[0]] : [u[1], -u[0]];
    for (let t = 30; t <= L - 30; t += 15) {
      const p = [a[0] + u[0] * t, a[1] + u[1] * t], ds = mouths.map(m => Math.hypot(m[0] - p[0], m[1] - p[1])), far = Math.max(...ds);
      if (far < diag / 2 + 5 || Math.min(...ds) < 150) continue;
      let hit = null; for (let d = 6; d <= LANE_MAX; d += 4) { const q = [p[0] + inw[0] * d, p[1] + inw[1] * d]; if (!S.inRing(q, ring)) break; if (drives.some(r => S.inRing(q, r))) { hit = d; break; } }
      if (hit == null) continue;
      const h = LANE_W / 2, e0 = hit + 4, at = (s, d) => [p[0] + u[0] * s + inw[0] * d, p[1] + u[1] * s + inw[1] * d];
      const lane = [at(-h, 0), at(h, 0), at(h, e0), at(-h, e0)];
      if (!lane.every(q => S.inRing(q, ring) || edgeD(q) < 0.6)) continue;
      const probe = [at(-h, 1), at(h, 1), at(h, e0 - 8), at(-h, e0 - 8)]; // (the lane short of the drive it meets: clear of everything solid by 3 ft)
      if (solid.some(r => S.gapBetween(probe, r) < 3)) continue;
      cands.push({ k, t, lane, len: e0, street: streets.has(k), far });
    }
  }
  const best = cands.sort((x, y) => (y.street - x.street) || x.len - y.len || y.far - x.far || x.k - y.k || x.t - y.t)[0]; if (!best) return o;
  const poly = best.lane.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]), c = S.centroid(poly);
  const lane = { id: 'emergency-' + best.k + '-' + best.t, kind: 'drive', poly, x: +c[0].toFixed(2), y: +c[1].toFixed(2), name: 'Emergency access', emergency: true,
    note: 'Emergency access · 20 ft gated fire lane, all-weather surface' + (best.street ? '' : ' · needs an access easement across the neighbouring land') };
  return { ...o, elements: els.concat([lane]), tplNotes: [...(o.tplNotes || []), 'No second street entrance fits far enough from the first, so a gated emergency access lane (20 ft) gives the fire code’s second way in' + (best.street ? '' : ' across a side or rear lot line: it needs an access easement from the neighbour') + ', with the fire official’s approval (IFC D106.3 / D107.2).'] };
}
// A playground left out on its own (Hockley, a 400-unit tower: the playground 450 ft from any home, in the land held
// for later) goes beside the clubhouse and pool, the nearest clear spot round them; where there's none it stays. Only
// play areas more than PLAY_FAR from every home building move. Kept only when no check gets worse.
const PLAY_FAR = 200;
export function curbReturns(plan, o, brief) {
  const els = o.elements || [], D = els.filter(e => (e.kind === 'drive' || e.kind === 'truck') && !e.future); if (!D.length) return o;
  const DV = brief?.rules?.values?.designVehicles?.v || {}, VEH = { ...TURN.VEHICLES, ...(DV.defs || {}) }, fire = VEH[DV.fire || 'FIRE'], svc = VEH[DV.service || 'SU-30'], trk = VEH[DV.truck || 'WB-67'];
  const route = new Set(TURN.fireRoute(D, els, e => e)), sites = TURN.turnSites(D, e => e).filter(t => Math.abs(t.theta - Math.PI / 2) < 0.2);
  const shp = new Map(D.map(e => [e, S.outline(e)])), courts = D.filter(p => p.kind === 'truck' || /truck court/i.test((p.name || '') + ' ' + (p.note || ''))), toCourt = new Set(courts.concat(D.filter(p => !courts.includes(p) && courts.some(c => S.gapBetween(shp.get(p), shp.get(c)) <= 1))));
  // (each turn for the largest vehicle that uses it: semitrailers on the truck route, fire apparatus on the fire route,
  // service trucks on a service drive)
  const want = sites.flatMap(t => [t.pieces.some(p => toCourt.has(p)) ? trk : null, t.pieces.every(p => route.has(p)) ? fire : null, t.pieces.some(p => /service|loading/i.test((p.name || '') + ' ' + (p.note || ''))) ? svc : null].filter(Boolean).map(v => ({ t, v })));
  if (!want.length) return o;
  const street = TURN.streetPaving(plan.ring, [plan.front ?? 0, ...(plan.streets || [])]);
  let pv = TURN.pavingOf(els).concat(street); const ring = plan.ring, solid = els.filter(e => !['drive', 'truck', 'green', 'lot', 'tree', 'trail', 'fence', 'sign', 'plaza', 'keepout'].includes(e.kind) || e.kind === 'keepout');
  const added = [], rows = new Map(); // (parking rows shortened for a return: id -> the row as cut)
  const hit = (poly, e) => { try { return S.rectsOverlap({ poly }, e, 0.5); } catch { return false; } };
  // a parking row in a return's way gives up whole stalls at its end nearer the corner (never more than a third of it)
  const trimRow = (row, poly) => { if (row.poly || !(+row.w > 0)) return null; const a = (row.rot || 0) * Math.PI / 180, ax = row.w >= row.d ? [Math.cos(a), Math.sin(a)] : [-Math.sin(a), Math.cos(a)], L = Math.max(row.w, row.d), c = S.centroid(poly), side = (c[0] - row.x) * ax[0] + (c[1] - row.y) * ax[1] >= 0 ? 1 : -1;
    for (let cut = 9; cut <= L / 3; cut += 9) { const L2 = L - cut, cx = row.x - side * ax[0] * cut / 2, cy = row.y - side * ax[1] * cut / 2, r2 = { ...row, x: +cx.toFixed(2), y: +cy.toFixed(2), ...(row.w >= row.d ? { w: +L2.toFixed(2) } : { d: +L2.toFixed(2) }) }; if (!hit(poly, r2)) return r2; }
    return null; };
  // a row of attached homes (townhomes, duplexes) in a return's way gives up its end home nearest the corner, with that
  // home's lot (a subdivision's corner lot gives way for the return); never more than a third of the row, two kept
  const homeRow = e => e.kind === 'building' && ['townhomes', 'duplex'].includes(e.use || o.program?.use) && +e.units >= 3 && !e.poly;
  const goneLots = new Set(); let pend = new Set();
  // homes the count asked for can spare: none under an exact count, those above the floor of at least / a range, any for
  // as many as fit or up to (a corner home given up for a return must not break the count asked: then no return there)
  const have = {}; for (const e of els) if (e.kind === 'building' && !e.future && ['townhomes', 'duplex'].includes(e.use || o.program?.use)) have[e.use || o.program?.use] = (have[e.use || o.program?.use] || 0) + (+e.units || 0);
  const spare = {}; for (const [u, n] of Object.entries(have)) { const qs = (brief?.program?.uses || []).filter(x => x.use === u && x.quantity?.unit === 'units'); spare[u] = !qs.length ? 0 : qs.reduce((t, x) => { const q = x.quantity; return t + (q.mode === 'maximize' || q.mode === 'max' ? Infinity : q.mode === 'exact' ? 0 : q.mode === 'min' ? n - (+q.value || 0) : q.mode === 'range' ? n - (+q.min || 0) : 0); }, 0); }
  const trimHomeRow = (row, poly, extra = 0) => { const n0 = +row.units, a = (row.rot || 0) * Math.PI / 180, along = row.w >= row.d, ax = along ? [Math.cos(a), Math.sin(a)] : [-Math.sin(a), Math.cos(a)], L = Math.max(row.w, row.d), uw = L / n0, c = S.centroid(poly), side = (c[0] - row.x) * ax[0] + (c[1] - row.y) * ax[1] >= 0 ? 1 : -1;
    const u0 = row.use || o.program?.use; for (let k = 1; k <= Math.floor(n0 / 3) && n0 - k >= 2 && k <= (spare[u0] ?? 0) + extra; k++) { const cut = k * uw, cx = row.x - side * ax[0] * cut / 2, cy = row.y - side * ax[1] * cut / 2, r2 = { ...row, x: +cx.toFixed(2), y: +cy.toFixed(2), ...(along ? { w: +(L - cut).toFixed(2) } : { d: +(L - cut).toFixed(2) }), units: n0 - k, ...(row.tplUnits != null ? { tplUnits: n0 - k } : {}), ...(row.modules != null ? { modules: n0 - k } : {}), ...(row.sf != null ? { sf: Math.round(row.sf * (n0 - k) / n0) } : {}) };
      if (hit(poly, r2)) continue;
      // the lots of the homes that went: the lots along the row's cut-off end (their middles within the cut band)
      const end = [row.x + side * ax[0] * L / 2, row.y + side * ax[1] * L / 2];
      for (const lt of els.filter(x => x.kind === 'lot')) { const q = S.centroid(S.shapeOf(lt)), t = (q[0] - end[0]) * ax[0] + (q[1] - end[1]) * ax[1]; if (side * t <= 0 && side * t >= -cut + 0.5 && Math.abs((q[0] - row.x) * -ax[1] + (q[1] - row.y) * ax[0]) < Math.min(row.w, row.d) / 2 + 80) pend.add(lt.id); }
      return r2; }
    return null; };
  // where the count can't spare a home, the row slides away from the corner along its length instead, its lots, driveways
  // and patios with it, as far as the gap past its far end allows (no home lost; the lots stay clear of their neighbours)
  const SEP = +brief?.rules?.values?.buildingSeparation?.v || 10, bldsOf = skip => els.filter(x => x.kind === 'building' && !skip.has(x)).map(x => rows.get(x.id) || x), sepOk = (b, skip) => bldsOf(skip).every(x => { try { return S.gapBetween(S.shapeOf(b), S.shapeOf(x)) >= SEP - 0.5; } catch { return true; } });
  const shifted = new Map(); // id -> the piece moved (lots, driveways: not among the solid pieces)
  const shiftHomeRow = (row, poly) => { const a = (row.rot || 0) * Math.PI / 180, along = row.w >= row.d, ax = along ? [Math.cos(a), Math.sin(a)] : [-Math.sin(a), Math.cos(a)], c = S.centroid(poly), side = (c[0] - row.x) * ax[0] + (c[1] - row.y) * ax[1] >= 0 ? 1 : -1;
    const rs = S.shapeOf(row), att = [...S.attachedTo({ elements: els }, row)], lots = els.filter(lt => lt.kind === 'lot' && S.rectsOverlap(lt, row, 1)), group = new Set([row, ...att, ...lots]);
    const others = els.filter(x => !group.has(x) && !['green', 'tree', 'trail', 'fence', 'sign', 'keepout'].includes(x.kind) && !(x.kind === 'drive' && !lots.length));
    const mv = (e, d) => { const dx = -side * ax[0] * d, dy = -side * ax[1] * d; return e.poly ? { ...e, poly: e.poly.map(p => [+(p[0] + dx).toFixed(2), +(p[1] + dy).toFixed(2)]), ...(e.x != null ? { x: +(e.x + dx).toFixed(2), y: +(e.y + dy).toFixed(2) } : {}) } : { ...e, x: +(e.x + dx).toFixed(2), y: +(e.y + dy).toFixed(2) }; };
    void rs;
    for (let d = 2; d <= 40; d += 2) { const g = [...group].map(e => mv(e, d)), r2 = g[0];
      if (g.some(e => hit(poly, e)) || g.some(e => !S.shapeOf(e).every(p => S.inRing(p, ring))) || !sepOk(r2, new Set([row]))) continue; // (the row and its lots clear of the return; the row its spacing from the others)
      if (g.some(e => others.some(x => { try { return S.rectsOverlap(e, rows.get(x.id) || shifted.get(x.id) || x, 1); } catch { return false; } }))) continue;
      return { row: r2, moved: g.slice(1) }; }
    return null; };
  // or, under an exact count, the corner home goes and a home is added at the open end of another row (its lot and
  // driveway copied from that row's end home), the row kept to TH_ROW_MAX: the count stays as asked
  const TH_ROW_MAX = +brief?.rules?.values?.townhomeRowMax?.v || 6, added2 = [];
  const growRow = (skip, use, polys) => { for (const row of els.filter(e => e.kind === 'building' && e !== skip && (e.use || o.program?.use) === use && !e.poly && +e.units >= 2).map(e => rows.get(e.id) || e)) {
      if (+row.units >= TH_ROW_MAX) continue; const n0 = +row.units, a = (row.rot || 0) * Math.PI / 180, along = row.w >= row.d, ax = along ? [Math.cos(a), Math.sin(a)] : [-Math.sin(a), Math.cos(a)], L = Math.max(row.w, row.d), uw = L / n0;
      const lots = els.filter(lt => lt.kind === 'lot' && !goneLots.has(lt.id) && S.rectsOverlap(shifted.get(lt.id) || lt, row, 1)).map(lt => shifted.get(lt.id) || lt);
      for (const sd of [1, -1]) { const along0 = q => (q[0] - row.x) * ax[0] + (q[1] - row.y) * ax[1], endLot = lots.slice().sort((p, q) => sd * (along0(S.centroid(S.shapeOf(q))) - along0(S.centroid(S.shapeOf(p)))))[0]; if (!endLot) continue;
        const dx = sd * ax[0] * uw, dy = sd * ax[1] * uw, mv = e => e.poly ? { ...e, poly: e.poly.map(p => [+(p[0] + dx).toFixed(2), +(p[1] + dy).toFixed(2)]), ...(e.x != null ? { x: +(e.x + dx).toFixed(2), y: +(e.y + dy).toFixed(2) } : {}) } : { ...e, x: +(e.x + dx).toFixed(2), y: +(e.y + dy).toFixed(2) };
        const ec = S.centroid(S.shapeOf(endLot)), drv = els.filter(x => x.kind === 'plaza' && x.note === 'Driveway' && S.inRing(S.centroid(S.shapeOf(x)), S.shapeOf(endLot)));
        const r2 = { ...row, x: +(row.x + dx / 2).toFixed(2), y: +(row.y + dy / 2).toFixed(2), ...(along ? { w: +(L + uw).toFixed(2) } : { d: +(L + uw).toFixed(2) }), units: n0 + 1, ...(row.tplUnits != null ? { tplUnits: n0 + 1 } : {}), ...(row.modules != null ? { modules: n0 + 1 } : {}), ...(row.sf != null ? { sf: Math.round(row.sf * (n0 + 1) / n0) } : {}) };
        const newLot = { ...mv(endLot), id: endLot.id + '-x' + added2.length }, newDrv = drv.map((d, k) => ({ ...mv(d), id: d.id + '-x' + added2.length + '-' + k })), fresh = [newLot, ...newDrv], ext = [S.shapeOf(newLot), S.shapeOf(r2)];
        if (!ext.every(r => r.every(p => S.inRing(p, ring)))) continue; void ec;
        const others = els.filter(x => x !== row && !lots.includes(x) && !drv.includes(x) && !['green', 'tree', 'trail', 'fence', 'sign'].includes(x.kind)).map(x => rows.get(x.id) || shifted.get(x.id) || x).concat(added.map(c => ({ kind: 'drive', poly: c.poly })), polys.map(q => ({ kind: 'drive', poly: q })));
        if (!sepOk(r2, new Set([row, skip]))) continue;
        if ([r2, ...fresh].some(e => others.some(x => { try { return S.rectsOverlap(e, x, 1); } catch { return false; } }))) continue;
        return { row, r2, fresh }; } }
    return null; };
  for (const { t, v } of want) {
    if (TURN.turnFits(t, v, pv).ok) continue;
    for (const R of [...new Set([Math.max(25, v.Ri), Math.max(25, v.Ri) + 10, 45, 60])]) { // (the vehicle's inside radius, at least 25 ft; more where the lanes are narrow or a trailer cuts in)
      const poly = curbPoly(t, R); if (!poly.every(p => S.inRing(p, ring) || TURN.onPave(p, street))) continue; // (a return may run out to the street it meets)
      const live = solid.map(e => rows.get(e.id) || e), blockers = live.filter(e => hit(poly, e));
      if (blockers.some(e => e.kind !== 'parking' && !homeRow(e))) continue;
      pend = new Set(); const mvd = [], grows = []; const cut = blockers.map(e => { if (e.kind === 'parking') return trimRow(e, poly); const r = trimHomeRow(e, poly); if (r) return r; const sh = shiftHomeRow(e, poly); if (sh) { mvd.push(...sh.moved); return sh.row; }
        const u = e.use || o.program?.use; if ((spare[u] ?? 0) > 0) return null; const r1 = trimHomeRow(e, poly, 1); if (!r1 || +e.units - +r1.units !== 1) return null; const gr = growRow(e, u, [poly]); if (!gr) return null; grows.push(gr); r1.paired = true; return r1; }); if (cut.some(x => !x)) continue;
      const mvIds = new Set(mvd.map(m => m.id));
      if (els.some(lt => lt.kind === 'lot' && !goneLots.has(lt.id) && !pend.has(lt.id) && hit(poly, mvIds.has(lt.id) ? mvd.find(m => m.id === lt.id) : shifted.get(lt.id) || lt))) continue; // (a return crosses only the lots of the homes that gave way: never a lot whose home stays)
      const pv2 = pv.concat([{ r: poly, bb: [Math.min(...poly.map(p => p[0])), Math.min(...poly.map(p => p[1])), Math.max(...poly.map(p => p[0])), Math.max(...poly.map(p => p[1]))] }]);
      if (!TURN.turnFits(t, v, pv2).ok) continue;
      blockers.forEach((e, k) => { if (e.kind === 'building' && !cut[k].paired) { const u = e.use || o.program?.use; spare[u] = (spare[u] ?? 0) - ((+e.units || 0) - (+cut[k].units || 0)); } const { paired, ...c2 } = cut[k]; void paired; rows.set(e.id, c2); }); for (const id of pend) goneLots.add(id); for (const m of mvd) shifted.set(m.id, m); for (const g of grows) { rows.set(g.row.id, g.r2); added2.push(...g.fresh); }
      added.push({ kind: 'drive', poly, name: '', note: 'Curb return · ' + R + ' ft radius (' + v.label.toLowerCase() + ')', curb: true }); pv = pv2; break;
    }
  }
  if (!added.length) return o;
  return { ...o, elements: els.filter(e => !goneLots.has(e.id)).map(e => rows.get(e.id) || shifted.get(e.id) || e).concat(added2, added.map((e, k) => ({ id: 'curb-' + (k + 1) + '-' + Math.round(e.poly[0][0]) + '-' + Math.round(e.poly[0][1]), ...e }))), tplNotes: [...(o.tplNotes || []), added.length + ' curb return' + (added.length > 1 ? 's' : '') + ' rounded so a fire truck (or a service truck) makes the turn (30 ft inside radius).'] };
}
const curbPoly = (t, R) => TURN.curbReturn(t, R);
// each garage says whether it is an open parking garage or needs mechanical ventilation (lib/siteplan.mjs
// garageOpenness, IBC 406.5.2), on the garage and in its note
export function garageVent(o) {
  const els = o?.elements || [], gs = S.garagesOf(els); if (!gs.length) return o;
  const out = els.map(e => { if (!gs.includes(e)) return e; const v = S.garageOpenness(e, els), tag = v.open ? 'open garage' : 'enclosed garage: mechanical ventilation'; return { ...e, openness: { open: v.open, area: v.area, length: v.length, sides: v.sides }, note: String(e.note || '').replace(/ · (open garage|enclosed garage: mechanical ventilation)$/, '') + ' · ' + tag }; });
  return { ...o, elements: out };
}
// A piece of the land held for later that's shut in by the work (a lawn between two drives in a mixed-use community,
// under an acre and nowhere near the lot line) isn't land for a later phase: nothing could be built there. It's open
// space, and it reads as such (it was labelled "Future development" in the middle of the community).
const FUTURE_MIN = 43560; // sf: a piece of held land smaller than an acre that doesn't reach the lot line is open space
export function shutInFuture(plan, o) {
  const els = o.elements || [], ring = plan.ring || []; let n = 0;
  const near = r => r.some(q => ring.some((a, i) => S.segDist(q, a, ring[(i + 1) % ring.length]) <= 20));
  const out = els.map(e => { if (e.kind !== 'green' || !e.future || e.name && !/^future development$/i.test(e.name)) return e; const r = S.shapeOf(e); if (!(r?.length >= 3)) return e; // (a piece held for a purpose, "Future pad site" by the shops, stays as it is)
    if (S.ringArea(r) >= FUTURE_MIN && near(r)) return e; n++; const { future, ...rest } = e; void future; return { ...rest, name: 'Open space', note: 'Lawn', trees: rest.trees ?? true }; });
  return n ? { ...o, elements: out, tplNotes: [...(o.tplNotes || []), (n === 1 ? 'A piece' : n + ' pieces') + ' of held land shut in by the work left as open space (too small or too enclosed for a later phase).'] } : o;
}
// homes on a small lot with no drive at all (the planner's last-resort layout: a row of townhomes facing the street on a
// half-acre lot): each home gets its driveway straight out to the street, as a front-load row is built. Only when the
// row's street face is within reach of the street (15 to 60 ft) and every home's driveway is at least 9 ft wide.
export function homeDriveways(plan, o) {
  const els = o.elements || [], use = o.program?.use; if (els.some(e => e.kind === 'drive') || !['townhomes', 'duplex'].includes(use)) return o;
  const ring = plan.ring, f = plan.front ?? 0, A = ring[f], B = ring[(f + 1) % ring.length], L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], nIn = [-u[1], u[0]];
  const inward = S.inRing([(A[0] + B[0]) / 2 + nIn[0] * 5, (A[1] + B[1]) / 2 + nIn[1] * 5], ring) ? nIn : [u[1], -u[0]];
  const homes = els.filter(e => e.kind === 'building' && (e.use || use) === use && !e.poly && +e.units >= 1); if (!homes.length) return o;
  const add = [], out = els.map(e => ({ ...e }));
  for (const h of homes) {
    const depthOf = p => (p[0] - A[0]) * inward[0] + (p[1] - A[1]) * inward[1], fs = Math.max(20, +(plan.setbacks?.front ?? 25));
    let c = S.shapeOf(h), near = Math.min(...c.map(depthOf));
    if (near > 40) { // a lone row set back: up to the front setback where nothing stands in between (the apron then a car long)
      const dd = near - fs, hh = out.find(e => e.id === h.id), moved = { ...hh, x: +(hh.x - inward[0] * dd).toFixed(2), y: +(hh.y - inward[1] * dd).toFixed(2) }, mc = S.shapeOf(moved);
      if (mc.every(p => S.inRing(p, ring)) && !out.some(e => e !== hh && !['green', 'tree', 'lot', 'trail', 'fence', 'sign'].includes(e.kind) && S.rectsOverlap({ poly: mc }, { poly: S.shapeOf(e) }, 2))) { Object.assign(hh, { x: moved.x, y: moved.y }); c = mc; near = Math.min(...c.map(depthOf)); } }
    if (near > 60 || near < 15) return o;
    const along = p => (p[0] - A[0]) * u[0] + (p[1] - A[1]) * u[1], a0 = Math.min(...c.map(along)), a1 = Math.max(...c.map(along)), n = +h.units, uw = (a1 - a0) / n;
    for (let k = 0; k < n; k++) { const m = a0 + uw * (k + 0.5), w = Math.min(12, uw - 4); if (w < 9) return o;
      const P = (s2, d) => [A[0] + u[0] * s2 + inward[0] * d, A[1] + u[1] * s2 + inward[1] * d];
      add.push({ id: 'dw-' + h.id + '-' + k, kind: 'drive', poly: [P(m - w / 2, -1), P(m + w / 2, -1), P(m + w / 2, near), P(m - w / 2, near)].map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]), name: 'Driveway', note: 'Driveway · ' + Math.round(near) + ' ft apron (front-load)', entry: true, driveway: true }); }
    const hh = out.find(e => e.id === h.id); if (hh) hh.note = /front-load/i.test(hh.note || '') ? hh.note : (hh.note ? hh.note.replace(/rear-load/i, 'front-load') : 'Front-load row');
  }
  return { ...o, elements: out.concat(add), tplNotes: [...(o.tplNotes || []), 'Each home has its own driveway to the street (a small lot: no room for a drive behind the row).'] };
}
// A build-to-rent cottage community's amenity centre and green court (lib/sitecommunity.mjs draws the cottages on their
// lanes, no commons): the cottages nearest the main entry make way, with their lots and pads, for a clubhouse, a pool on
// its deck and a planted green court in their place; the most cottages it takes is COTTAGE_COMMONS.max. Kept only when no
// check gets worse (an exact count asked for keeps every cottage).
export const COTTAGE_COMMONS = { minW: 125, minD: 70, max: 6, club: [50, 40], pool: [40, 20] };
export function cottageCommons(plan, o) {
  const els = o.elements || [], homes = els.filter(e => e.kind === 'building' && e.use === 'sfr' && e.cottage); if (homes.length < 12 || els.some(e => e.kind === 'building' && e.use === 'amenity')) return o;
  const entry = els.find(e => e.kind === 'drive' && e.name === 'Main entry'); if (!entry) return o;
  const at = S.centroid(S.shapeOf(entry)), lots = els.filter(e => e.kind === 'lot'), pads = els.filter(e => e.kind === 'plaza' && /parking pad/i.test(e.note || ''));
  const lotOf = h => { const c = S.centroid(S.shapeOf(h)); return lots.find(l => S.inRing(c, S.shapeOf(l))); };
  const seeds = homes.slice().sort((a, b) => Math.hypot(a.x - at[0], a.y - at[1]) - Math.hypot(b.x - at[0], b.y - at[1]) || String(a.id).localeCompare(String(b.id))).slice(0, 8);
  for (const h0 of seeds) {
    const l0 = lotOf(h0); if (!l0) continue; const c0 = S.centroid(S.shapeOf(l0));
    // the lot's own frame: v along its depth (its w side, turned by rot), u along the row
    const a0 = (l0.rot || 0) * Math.PI / 180, ax = [Math.cos(a0), Math.sin(a0)], ay = [-ax[1], ax[0]], loc = p => [(p[0] - c0[0]) * ay[0] + (p[1] - c0[1]) * ay[1], (p[0] - c0[0]) * ax[0] + (p[1] - c0[1]) * ax[1]], world = (u, v) => [c0[0] + ay[0] * u + ax[0] * v, c0[1] + ay[1] * u + ax[1] * v];
    // the lots in h0's row: the same turn, their middles on its line (a lot up to a few feet deeper where the row meets a slanting line), nearest first
    const row = homes.map(h => ({ h, l: lotOf(h) })).filter(x => { if (!x.l || Math.abs((x.l.rot || 0) - (l0.rot || 0)) > 0.5 || Math.abs((x.l.w ?? 0) - (l0.w ?? 0)) > 12) return false; return Math.abs(loc(S.centroid(S.shapeOf(x.l)))[1]) < 8; })
      .sort((a, b) => Math.abs(loc(S.centroid(S.shapeOf(a.l)))[0]) - Math.abs(loc(S.centroid(S.shapeOf(b.l)))[0]));
    for (let n = 2; n <= Math.min(COTTAGE_COMMONS.max, row.length); n++) {
      const take = row.slice(0, n), q = take.flatMap(x => S.shapeOf(x.l).map(loc)), bx = [Math.min(...q.map(p => p[0])), Math.max(...q.map(p => p[0]))], by = [Math.max(...take.map(x => Math.min(...S.shapeOf(x.l).map(p => loc(p)[1])))), Math.min(...take.map(x => Math.max(...S.shapeOf(x.l).map(p => loc(p)[1]))))];
      const W = bx[1] - bx[0], D = by[1] - by[0]; if (W < COTTAGE_COMMONS.minW || D < COTTAGE_COMMONS.minD) continue;
      const area = take.reduce((t, x) => t + S.ringArea(S.shapeOf(x.l)), 0); if (area < 0.95 * W * D) break; // (the lots must make one block, not two apart)
      const gone = new Set(take.flatMap(x => [x.h, x.l, ...pads.filter(p => S.inRing(S.centroid(S.shapeOf(p)), S.shapeOf(x.l)))]));
      const box = [world(bx[0] + 1, by[0] + 1), world(bx[1] - 1, by[0] + 1), world(bx[1] - 1, by[1] - 1), world(bx[0] + 1, by[1] - 1)];
      if (els.some(e => !gone.has(e) && !['green', 'tree', 'trail', 'fence', 'sign', 'lot'].includes(e.kind) && S.rectsOverlap({ poly: box }, e, 0))) continue; // (nothing else on the block)
      // along the row: the clubhouse at the end nearer the entry, the pool on its deck beside it; the rest a green court
      const [cw, cd] = COTTAGE_COMMONS.club, [pw, pd] = COTTAGE_COMMONS.pool, um = (bx[0] + bx[1]) / 2, vm = (by[0] + by[1]) / 2, near = loc(at)[0] < um ? -1 : 1;
      const u0 = um + near * (W / 2 - 8 - cw / 2), u1 = u0 - near * (cw / 2 + 6 + (pw + 12) / 2), deg = +((l0.rot || 0) + 90).toFixed(2);
      const pc = world(u0, vm), pp = world(u1, vm), r2 = v => +v.toFixed(2);
      const club = { kind: 'building', use: 'amenity', floors: 1, name: 'Clubhouse', note: 'Leasing · fitness · lounge · the cottage community’s amenity centre', x: r2(pc[0]), y: r2(pc[1]), w: cw, d: cd, rot: deg };
      const deck = { kind: 'plaza', name: '', note: 'Pool deck', x: r2(pp[0]), y: r2(pp[1]), w: pw + 12, d: pd + 12, rot: deg };
      const pool = { kind: 'pool', name: 'Pool', note: 'Resort-style', x: deck.x, y: deck.y, w: pw, d: pd, rot: deg };
      const court = { kind: 'green', name: 'Green court', note: 'Lawn and shade trees for the cottages', poly: box.map(p => [r2(p[0]), r2(p[1])]) };
      const id = k => 'commons-' + k + '-' + Math.round(c0[0]) + '-' + Math.round(c0[1]);
      return { ...o, elements: els.filter(e => !gone.has(e)).concat([{ id: id('court'), ...court }, { id: id('club'), ...club }, { id: id('deck'), ...deck }, { id: id('pool'), ...pool }]),
        tplNotes: [...(o.tplNotes || []), 'An amenity centre for the cottages: a clubhouse, a pool and a green court near the entry, in place of ' + n + ' cottages.'] };
    }
  }
  return o;
}
export function playNearHomes(plan, o) {
  const els = o.elements || [], homes = els.filter(e => e.kind === 'building' && e.use !== 'amenity' && !e.future), hub = els.filter(e => e.kind === 'building' && e.use === 'amenity' || e.kind === 'pool');
  const lone = els.filter(e => e.kind === 'play' && e.w > 0 && e.d > 0 && !e.poly && homes.length && Math.min(...homes.map(h => S.gapBetween(S.corners(e), S.shapeOf(h)))) > PLAY_FAR);
  if (!lone.length || !hub.length) return o;
  const inner = S.insetRing(plan.ring, plan.ring.map(() => 12)); if (!inner || inner.length < 3) return o;
  const solid = els.filter(e => !['green', 'lot', 'tree', 'trail', 'fence', 'sign'].includes(e.kind) && !e.future);
  const pts = hub.flatMap(e => S.shapeOf(e)), bx0 = Math.min(...pts.map(p => p[0])), bx1 = Math.max(...pts.map(p => p[0])), by0 = Math.min(...pts.map(p => p[1])), by1 = Math.max(...pts.map(p => p[1])), mid = [(bx0 + bx1) / 2, (by0 + by1) / 2];
  const out = els.slice(); let moved = 0;
  for (const e0 of lone) {
    const others = solid.filter(x => x !== e0), cands = [];
    const rp = plan.ring, rx0 = Math.min(...rp.map(p => p[0])), rx1 = Math.max(...rp.map(p => p[0])), ry0 = Math.min(...rp.map(p => p[1])), ry1 = Math.max(...rp.map(p => p[1]));
    for (let x = rx0; x <= rx1; x += 20) for (let y = ry0; y <= ry1; y += 20) if (Math.hypot(x - mid[0], y - mid[1]) < 400) for (const [w, d] of [[e0.w, e0.d], [e0.d, e0.w]]) cands.push([x, y, w, d]); // (a 20 ft grid within 400 ft of the clubhouse)
    const nearHome = ([x, y, w, d]) => homes.some(h => S.gapBetween(S.corners({ x, y, w, d }), S.shapeOf(h)) <= 120);
    const fits = ([x, y, w, d]) => { const r = S.corners({ x, y, w, d }); return r.every(p => S.inRing(p, inner)) && !others.some(q => S.gapBetween(r, S.shapeOf(q)) < 6); };
    const best = cands.filter(c => Math.hypot(c[0] - mid[0], c[1] - mid[1]) < 400 && fits(c) && nearHome(c)).sort((a, b) => Math.hypot(a[0] - mid[0], a[1] - mid[1]) - Math.hypot(b[0] - mid[0], b[1] - mid[1]))[0]; if (!best) continue;
    out[out.indexOf(e0)] = { ...e0, x: +best[0].toFixed(2), y: +best[1].toFixed(2), w: best[2], d: best[3] }; moved++;
  }
  return moved ? { ...o, elements: out, tplNotes: [...(o.tplNotes || []), 'The playground moved beside the clubhouse and pool, near the homes.'] } : o;
}
// A site with no room for the detention pond it needs (a pad, a small infill lot: no pond drawn at all, though the storm
// rule asks for storage) holds it underground (vaults under the parking), unless the brief said how detention is done.
// Said in the notes as an assumption for the civil engineer; the check then reads the vaults, not a missing pond.
export function vaultWhereNoPond(plan, o, brief) {
  if (!o?.elements?.length || brief?.site?.stormwater || o.program?.storm || plan.params?.storm?.mode) return o;
  if (o.elements.some(e => e.kind === 'pond')) return o;
  let st = null; try { st = S.stormOf({ ...plan, elements: o.elements, program: o.program || {} }); } catch { st = null; }
  if (!st || st.mode !== 'detention' && st.mode !== 'retention' || !(st.volume > 0)) return o;
  return { ...o, program: { ...(o.program || {}), storm: 'underground' }, tplNotes: [...(o.tplNotes || []), 'No room for a detention pond on this site: the storage (about ' + st.volume.toFixed(2) + ' ac-ft) goes underground, in vaults under the parking: an assumption for the civil engineer.'] };
}
// A walking trail that runs through a building, a parking row or a pool (a generated layout's pond trail laid before
// its parking moved) is cut where it does: the pieces clear of them kept (each 40 ft or more, an open path), the rest go.
export function trailsClear(plan, o) {
  const els = o.elements || [], trails = els.filter(e => e.kind === 'trail' && e.path?.length >= 2); if (!trails.length) return o;
  const blocks = els.filter(e => e.kind === 'building' || e.kind === 'parking' || e.kind === 'pool').map(e => { const r = S.grow(S.shapeOf(e), 4); const xs = r.map(p => p[0]), ys = r.map(p => p[1]); return { r, bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }; });
  const inB = q => blocks.some(b => q[0] >= b.bb[0] && q[0] <= b.bb[2] && q[1] >= b.bb[1] && q[1] <= b.bb[3] && S.inRing(q, b.r));
  let changed = false; const out = [];
  for (const e of els) { if (!trails.includes(e)) { out.push(e); continue; }
    const P = e.closed ? e.path.concat([e.path[0]]) : e.path, pts = []; for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 5)); for (let k = i === 1 ? 0 : 1; k <= n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
    const bad = pts.map(inB); if (!bad.some(Boolean)) { out.push(e); continue; } changed = true;
    let run = [], k = 0; const flush = () => { const len = run.reduce((t, q, i) => i ? t + Math.hypot(q[0] - run[i - 1][0], q[1] - run[i - 1][1]) : 0, 0); if (run.length >= 2 && len >= 40) { const { closed, ...open } = e; void closed; out.push({ ...open, id: e.id + (k ? '-' + k : ''), path: run.filter((q, i) => i === 0 || i === run.length - 1 || i % 4 === 0).map(q => [+q[0].toFixed(2), +q[1].toFixed(2)]) }); k++; } run = []; };
    pts.forEach((q, i) => { if (bad[i]) flush(); else run.push(q); }); flush(); }
  return changed ? { ...o, elements: out, tplNotes: [...(o.tplNotes || []), 'The walking trail cut where it ran through parking or a building; the pieces clear of them kept.'] } : o;
}
// Pond outlines without spikes: a pond filling leftover land can run a thin wedge into a corner (Hockley: a 4° spike
// along the street frontage, drawn on the map as a grey triangle, and frontage a second way in could use). Corners
// sharper than SPIKE_DEG are cut off, one at a time, while the pond keeps at least 90% of its area; its trail is run
// round the new outline (15 ft out). Kept only when no hard check gets worse.
const SPIKE_DEG = 35;
const TRIM_SPARE = 0.03, MIN_ROW = 6; // parking trimmed down to 3% over what's required; a row keeps at least 6 stalls
export function tidyPonds(plan, o) {
  if (!o?.elements?.some(e => e.kind === 'pond' && e.poly?.length >= 4)) return o;
  let changed = false;
  const angle = (r, i) => { const n = r.length, a = r[(i - 1 + n) % n], b = r[i], c = r[(i + 1) % n], u = [a[0] - b[0], a[1] - b[1]], v = [c[0] - b[0], c[1] - b[1]], L = Math.hypot(...u) * Math.hypot(...v); return L ? Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / L))) * 180 / Math.PI : 180; };
  const ponds = new Map();
  for (const e of o.elements.filter(e => e.kind === 'pond' && e.poly?.length >= 4)) {
    let r = e.poly.map(p => [p[0], p[1]]); const A0 = S.ringArea(r);
    for (let guard = 0; guard < 20 && r.length > 4; guard++) {
      const sharp = r.map((_, i) => [angle(r, i), i]).filter(([a]) => a < SPIKE_DEG).sort((x, y) => x[0] - y[0])[0]; if (!sharp) break;
      const t = r.filter((_, i) => i !== sharp[1]); if (S.ringArea(t) < 0.9 * A0) break; r = t;
    }
    if (r.length !== e.poly.length) { ponds.set(e.id, r.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)])); changed = true; }
  }
  if (!changed) return o;
  const els = o.elements.map(e => {
    if (e.kind === 'pond' && ponds.has(e.id)) { const poly = ponds.get(e.id), c = S.centroid(poly); return { ...e, poly, x: +c[0].toFixed(2), y: +c[1].toFixed(2) }; }
    if (e.kind === 'trail' && e.closed && ponds.size === 1) { const r = S.grow([...ponds.values()][0], 15); if (r?.length >= 3 && r.every(p => S.inRing(p, plan.ring))) return { ...e, path: r.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]) }; }
    return e;
  });
  return { ...o, elements: els, tplNotes: [...(o.tplNotes || []), 'The pond’s sharp corners rounded off (it keeps at least 90% of its area).'] };
}
// One amenity centre per apartment community (one per AMENITY_PER units): a layout of several courts draws a clubhouse
// and pool in each (4 for 200 units on Hockley). The ones past that go, with their pool and deck within 90 ft; the land
// is left as lawn. The first ones kept are those nearest the main entry.
const AMENITY_PER = 400;
// Land inside a courtyard is the building's garden: the land-finishing pass can mark a court's open lawn "Future
// development" (an exact count holds the rest of the site for later); those pieces inside a court's wings go (the
// court's own planted lawn is under them).
export function courtGardens(plan, o) {
  const courts = o.elements.filter(e => e.kind === 'green' && e.note === 'Courtyard'); if (!courts.length) return o;
  const inCourt = g => { const c = g.labelAt || S.centroid(S.shapeOf(g)); return courts.some(k => S.inRing(c, S.shapeOf(k))); };
  const drop = o.elements.filter(e => e.kind === 'green' && e.note !== 'Courtyard' && (e.future || /future|open land|pad site/i.test(e.name || '')) && inCourt(e));
  return drop.length ? { ...o, elements: o.elements.filter(e => !drop.includes(e)) } : o;
}
export function oneAmenityCentre(plan, o) {
  const els = o.elements, units = els.filter(e => e.kind === 'building' && (e.use || o.program?.use) === 'multifamily').reduce((t, e) => t + (+e.units || 0), 0);
  const clubs = els.filter(e => e.kind === 'building' && e.use === 'amenity' && /clubhouse|amenity|leasing/i.test((e.name || '') + ' ' + (e.note || '')));
  const keepN = Math.max(1, Math.ceil(units / AMENITY_PER)); if (clubs.length <= keepN) return o;
  const ent = S.entrancesOf(els).find(e => e.name === 'Main entry') || S.entrancesOf(els)[0], at = ent ? S.centroid(S.shapeOf(ent)) : [0, 0];
  const order = clubs.slice().sort((a, b) => Math.hypot(a.x - at[0], a.y - at[1]) - Math.hypot(b.x - at[0], b.y - at[1]) || String(a.id).localeCompare(String(b.id)));
  const gone = new Set(); for (const c of order.slice(keepN)) { gone.add(c); for (const e of els) if ((e.kind === 'pool' || e.kind === 'plaza') && (c.amenityOf ? e.amenityOf === c.amenityOf : Math.hypot(e.x - c.x, e.y - c.y) < 90)) gone.add(e); } // (a courtyard's clubhouse, pool and deck share a tag)
  // a court that gave up its clubhouse keeps a garden in its place: a paved seating court with a shade pavilion where the
  // clubhouse stood (its gateway or mouth is not left an empty gap in the building)
  const gardens = order.slice(keepN).filter(c => c.amenityOf).map(c => ({ id: c.id + '-garden', kind: 'plaza', x: c.x, y: c.y, w: c.w, d: c.d, rot: c.rot || 0, name: 'Courtyard garden', note: 'Seating · shade pavilion', amenityOf: c.amenityOf }));
  return { ...o, elements: els.filter(e => !gone.has(e)).concat(gardens), tplNotes: [...(o.tplNotes || []), 'One amenity centre for the community' + (keepN > 1 ? ' (' + keepN + ' for ' + units + ' units)' : '') + ': ' + (clubs.length - keepN) + ' more clubhouse' + (clubs.length - keepN > 1 ? 's' : '') + ' and pool' + (clubs.length - keepN > 1 ? 's' : '') + ' left as lawn.'] };
}
// A courtyard building drawn as wings that meet at their corners (lib/sitegen.mjs courtyard): one building, as built.
// The wings stay rectangles (the 3D facades, plan sets and budgets read rectangles), tagged as one courtyard (court: the
// group's id): where two wings overlap at a corner, the one the overlap runs across is cut back to meet the other, so the
// corner is counted once (its units scaled with its floor area). The validator reads a court group as one building.
const COURT_GAP = 25; // ft: wings this close round one court are one courtyard (~13 ft on a turned site, 20 ft between a small court's wings)
export function joinCourtyard(plan, o, brief) {
  if (!brief.program.uses.some(u => u.form === 'mf-courtyard')) return o;
  const els = o.elements.map(e => ({ ...e })), B = els.filter(e => e.kind === 'building' && (e.use || o.program?.use) === 'multifamily' && !e.future && !e.poly); if (B.length < 2) return o;
  const adj = new Map(B.map(e => [e, []]));
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) if (S.gapBetween(S.shapeOf(B[i]), S.shapeOf(B[j])) <= COURT_GAP) { adj.get(B[i]).push(B[j]); adj.get(B[j]).push(B[i]); } // (wings with a breezeway gap between them still make one court)
  const seen = new Set(), groups = [];
  for (const e of B) { if (seen.has(e)) continue; const g = [], q = [e]; seen.add(e); while (q.length) { const x = q.pop(); g.push(x); for (const y of adj.get(x)) if (!seen.has(y)) { seen.add(y); q.push(y); } } if (g.length > 1) groups.push(g); }
  if (!groups.length) return o;
  let cut = 0;
  for (const [k, g] of groups.entries()) {
    const gid = 'court-' + (k + 1), letter = String.fromCharCode(65 + (k % 26));
    for (const e of g) { e.court = gid; if (e.wing) e.name = 'Bldg ' + letter + ' · ' + e.wing + ' wing'; } // (one building: its wings named as its parts, as seen from the street)
    for (let i = 0; i < g.length; i++) for (let j = 0; j < g.length; j++) {
      const a = g[i], c = g[j]; if (a === c || Math.abs(((a.rot || 0) - (c.rot || 0)) % 90) > 0.5) continue;
      // the overlap in a's own frame; a is cut when the overlap spans a's whole depth (a runs into c's side)
      const along = a.w >= a.d ? 'w' : 'd', L = a[along], D = along === 'w' ? a.d : a.w, pc = S.shapeOf(c).map(p => S.toLocal(a, p));
      const ax = along === 'w' ? 0 : 1, cx0 = Math.min(...pc.map(p => p[ax])), cx1 = Math.max(...pc.map(p => p[ax])), cy0 = Math.min(...pc.map(p => p[1 - ax])), cy1 = Math.max(...pc.map(p => p[1 - ax]));
      const lo = Math.max(-L / 2, cx0), hi = Math.min(L / 2, cx1), olen = hi - lo; if (olen <= 0.5 || cy0 > -D / 2 + 0.5 || cy1 < D / 2 - 0.5) continue;
      const atStart = Math.abs(lo + L / 2) < 0.5, atEnd = Math.abs(hi - L / 2) < 0.5; if (!atStart && !atEnd) continue;
      const newL = L - olen, sh = (atStart ? 1 : -1) * olen / 2, r = (a.rot || 0) * Math.PI / 180, dir = along === 'w' ? [Math.cos(r), Math.sin(r)] : [-Math.sin(r), Math.cos(r)];
      const u0 = a.units; a.x = +(a.x + dir[0] * sh).toFixed(2); a.y = +(a.y + dir[1] * sh).toFixed(2); a[along] = +newL.toFixed(2); if (u0 != null) a.units = Math.max(1, Math.round(u0 * newL / L)); cut++;
      if (a.note && a.units != null) a.note = a.note.replace(/\b\d+ units\b/, a.units + ' units');
    }
  }
  return { ...o, elements: els, tplNotes: [...(o.tplNotes || []), 'The courtyard’s ' + groups.reduce((t, g) => t + g.length, 0) + ' wings are one building' + (cut ? ', their shared corners counted once' : '') + '.'] };
}
// An amenity piece drawn on a building or on paving (Hockley-style courtyard: the pool 20 ft into a wing): moved by the
// smallest shift (4 ft grid, up to 100 ft each way) that clears every building, piece of paving and
// solid amenity and stays inside the site; left where it was when none does (the overlap check then says so).
const NUDGE = ['pool', 'court', 'play', 'trash'];
export function nudgeAmenities(plan, o) {
  const els = o.elements.slice(), hard = e => e.kind === 'building' || ['drive', 'parking', 'truck', 'pond', 'garage', ...NUDGE].includes(e.kind);
  const hits = (e, s, others) => others.some(x => x !== e && x.id !== e.id && hard(x) && !(x.kind === 'plaza') && S.gapBetween(s, S.shapeOf(x)) < 2); // (a real 2 ft gap, not a touch)
  let moved = 0;
  for (const e of els.filter(x => NUDGE.includes(x.kind) && !x.poly)) {
    const s0 = S.shapeOf(e); if (!hits(e, s0, els)) continue;
    let best = null;
    const tries = []; for (let dx = -100; dx <= 100; dx += 4) for (let dy = -100; dy <= 100; dy += 4) tries.push([Math.hypot(dx, dy), dx, dy]);
    tries.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]); // the smallest shift first, a fixed order for ties
    // a pool too big for its court is made smaller (85%, then 75%; never under 50 x 28 ft) before it's left overlapping
    for (const k of e.kind === 'pool' ? [1, 0.85, 0.75] : [1]) { const w = Math.max(e.kind === 'pool' ? 50 : 0, e.w * k), d = Math.max(e.kind === 'pool' ? 28 : 0, e.d * k);
      for (const [dist, dx, dy] of tries) { if (!dist && k === 1) continue; const c = { ...e, w: +w.toFixed(2), d: +d.toFixed(2), x: +(e.x + dx).toFixed(2), y: +(e.y + dy).toFixed(2), ...(k < 1 ? { note: (e.note ? e.note + ' · ' : '') + 'sized to fit the court' } : {}) }, sc = S.shapeOf(c); if (sc.every(p => S.inRing(p, plan.ring)) && !hits(e, sc, els)) { best = c; break; } }
      if (best) break; }
    if (best) { els[els.indexOf(e)] = best; moved++;
      for (const k of els.filter(x => x.kind === 'plaza' && Math.hypot(x.x - e.x, x.y - e.y) < 5)) els[els.indexOf(k)] = { ...k, x: best.x, y: best.y }; } // (its deck goes with it)
  }
  return moved ? { ...o, elements: els, tplNotes: [...(o.tplNotes || []), moved + ' amenity piece' + (moved > 1 ? 's' : '') + ' moved clear of a building or paving.'] } : o;
}
// An exact apartment count on a building with no module template (a courtyard building, a tower): its units are a
// floor-area estimate, so a count within 3% of the ask is met by sizing the homes a little differently in the same floor
// area, as long as each keeps at least MIN_GSF gross sf; the note says the average that gives. Templated buildings keep
// their schedules (never adjusted here).
const MIN_GSF = 750, MAX_GSF = 1400; // gross sf a home either way
export function exactByUnitSize(plan, o, brief) {
  const els = o.elements.map(e => ({ ...e })), notes = [];
  for (const u of brief.program.uses.filter(u => u.use === 'multifamily' && u.quantity.mode === 'exact' && u.quantity.unit === 'units')) {
    const B = els.filter(e => e.kind === 'building' && (e.use || o.program?.use) === 'multifamily' && !e.template && !e.future && e.units != null && (u.zone == null || e.zone == null || e.zone === u.zone));
    const got = B.reduce((t, e) => t + e.units, 0), want = u.quantity.value; if (!B.length || got === want) continue; // (fewer, larger homes in the same floor area when over; a few more when within 3%)
    const gsf = B.reduce((t, e) => t + S.gfaOf(e), 0); if (gsf / want < MIN_GSF || gsf / want > MAX_GSF) continue;
    if (got < want && want - got > 0.03 * want) continue; // (more homes than drawn: only a few, by making them a little smaller)
    // the change spread over the buildings by floor area, the rounding on the largest
    let left = want; B.forEach((e, i) => { const share = i === B.length - 1 ? left : Math.round(want * S.gfaOf(e) / gsf); e.units = Math.max(1, share); left -= e.units; if (e.note) e.note = e.note.replace(/\b\d+ units\b/, e.units + ' units'); });
    notes.push('Exactly ' + want + ' units: the homes sized ' + (want < got ? 'a little larger' : 'a little smaller') + ' in the same floor area (about ' + Math.round(gsf / want).toLocaleString('en-US') + ' gross sf a home).');
  }
  return notes.length ? { ...o, elements: els, tplNotes: [...(o.tplNotes || []), ...notes] } : o;
}
// a tower's parking podium: the levels the engine left to be worked out ('auto') written down as a number, so the
// record, the check and the drawing all read the same podium
export function podiumLevels(o) {
  if (!o.elements.some(e => e.parkLevels === 'auto')) return o;
  const els = o.elements.map(e => e.parkLevels === 'auto' ? { ...e, parkLevels: S.parkLevelsOf(e), note: [e.note, 'Podium: ' + S.parkLevelsOf(e) + ' of ' + e.podium + ' levels parking (' + S.podiumStalls({ ...e, parkLevels: S.parkLevelsOf(e) }) + ' spaces)'].filter(Boolean).join(' · ') } : e);
  return { ...o, elements: els };
}
// A podium that over-parks (its last parking level needed only in part): that level keeps only the spaces the plan
// still needs, the rest of it the residents' amenity space, leasing and storage (parkLast on the building; the garage
// plan's count reads it). Never below the need; whole levels stay as they are. Kept only when no check gets worse.
export function podiumTrim(plan, o, brief) {
  const T = o.elements.filter(e => e.kind === 'building' && e.form === 'tower' && +e.parkLevels > 0 && e.parkLast == null); if (!T.length) return o;
  const q = V.quantities({ ...plan, elements: o.elements, program: o.program || {} }, brief).parking; let over = q.provided - q.required; if (!(over > 0)) return o;
  const els = o.elements.map(e => ({ ...e })), notes = [];
  for (const e of els.filter(x => T.some(t => t.id === x.id && t.x === x.x && t.y === x.y))) { if (over <= 0) break;
    const g = S.garagePlan(e), k = +e.parkLevels, lv = k === 1 ? g.ground : g.typical, cut = Math.min(lv, over); if (cut < 6) continue;
    e.parkLast = lv - cut; over -= cut; notes.push((e.name || 'The podium') + ': ' + cut + ' spaces of its ' + (k === 1 ? 'ground' : 'top parking') + ' level given to amenity, leasing and storage (it would park more than the plan needs)');
    e.note = (e.note || '').replace(/\(\d+ spaces\)/, '(' + S.podiumStalls(e) + ' spaces)'); }
  return notes.length ? { ...o, elements: els, tplNotes: [...(o.tplNotes || []), ...notes] } : o;
}
// A podium garage a car can get into: the lobby on the podium face toward the main entry (the street side), the garage
// entrance on an end or the back (never the lobby's face), at the face nearest a drive, and a 24 ft drive from its
// opening out to that drive where it doesn't meet one already. The drive keeps off buildings, ponds, pools and the
// site's edge; where every face's way out crosses a parking row, the shortest is taken and the stalls it crosses go.
const GARAGE_DRIVE = 24;
// a parking row a drive crosses: the stalls under the drive (and a foot either side) taken out, the two ends kept where
// they still hold 3 stalls; a row that isn't a plain rectangle goes whole
function cutRow(e, rect) {
  if (e.poly || e.path || !(e.w > 0)) return [];
  const us = rect.map(p => S.toLocal(e, p)[0]), lo = Math.min(...us) - 1, hi = Math.max(...us) + 1, out = [];
  for (const [a, b] of [[-e.w / 2, lo], [hi, e.w / 2]]) { const a2 = Math.max(a, -e.w / 2), b2 = Math.min(b, e.w / 2); if (b2 - a2 < 27) continue;
    const c = (a2 + b2) / 2, q = S.rotPt([c, 0], e.rot || 0); out.push({ ...e, id: e.id + (a2 > -e.w / 2 ? '-b' : '-a'), x: +(e.x + q[0]).toFixed(2), y: +(e.y + q[1]).toFixed(2), w: +(b2 - a2).toFixed(2) }); }
  return out;
}
export function garageEntries(plan, o) {
  const T = (o.elements || []).filter(e => e.kind === 'building' && e.form === 'tower' && +e.parkLevels > 0 && !e.future); if (!T.length) return o;
  let els = o.elements.map(e => ({ ...e })); const notes = [];
  const R = plan.ring, fr = plan.front ?? S.longestEdge(R), streets = [fr, ...(plan.streets || [])].filter(k => k != null && k < R.length), toStreet = p => Math.min(...streets.map(k => S.segDist(p, R[k], R[(k + 1) % R.length]))); // (the lobby on the long face nearer a street)
  const hard = e => ['building', 'pond', 'pool', 'garage', 'court', 'play'].includes(e.kind);
  for (const t0 of T) {
    const b = els.find(e => e.id === t0.id) || els[o.elements.indexOf(t0)];
    const mid = f => S.garageToPlan(b, [0, f === '-v' ? -b.d / 2 : b.d / 2]), lobby0 = toStreet(mid('-v')) <= toStreet(mid('+v')) ? '-v' : '+v';
    const drives = () => els.filter(e => e.kind === 'drive');
    let best = null, lobbyFace = lobby0;
    // (first a way out over open ground with the lobby toward the street; then across a parking row, its stalls taken
    // out; then, where the only face a drive reaches is the street side, the lobby turned to the other long face)
    for (const [pass, lf] of [[0, lobby0], [1, lobby0], [0, lobby0 === '-v' ? '+v' : '-v'], [1, lobby0 === '-v' ? '+v' : '-v']]) { lobbyFace = lf;
      for (const face of ['+u', '-u', lobbyFace === '-v' ? '+v' : '-v']) {
        const E = S.garageEntry({ ...b, lobbyFace, garageFace: face });
        if (drives().some(d => { const sh = S.shapeOf(d); return S.inRing(E.at, sh) || S.gapBetween([E.at], sh) <= 3; })) { best = { face, t: 0, rect: null, cut: [] }; break; }
        for (let t = 6; t <= 260; t += 2) {
          const P1 = [E.at[0] + E.out[0] * t, E.at[1] + E.out[1] * t], rect = S.band([[E.at[0] + E.out[0] * 0.05, E.at[1] + E.out[1] * 0.05], P1], GARAGE_DRIVE); // (from the podium's wall out)
          if (!rect.every(p => S.inRing(p, plan.ring))) break;
          if (els.some(e => e !== b && hard(e) && S.rectsOverlap({ poly: rect }, { poly: S.shapeOf(e) }, 0.5))) break;
          const cut = els.filter(e => e.kind === 'parking' && S.rectsOverlap({ poly: rect }, { poly: S.shapeOf(e) }, 0.5)); if (cut.length && !pass) break;
          if (drives().some(d => S.gapBetween(rect, S.shapeOf(d)) <= 0.5)) { if (!best || t < best.t) best = { face, t, rect, cut }; break; }
        }
        if (best?.t === 0) break;
      }
      if (best) break;
    }
    if (!best) { notes.push((b.name || 'The tower') + ': no drive reaches a face of its podium for the garage entrance.'); continue; }
    Object.assign(b, { lobbyFace, garageFace: best.face });
    if (best.rect) { els = els.flatMap(e => best.cut.includes(e) ? cutRow(e, best.rect) : [e]); els.push({ id: 'garage-entry-' + (b.id || T.indexOf(t0)), kind: 'drive', poly: best.rect.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]), name: 'Garage entry', note: GARAGE_DRIVE + ' ft drive into the podium garage' }); }
    notes.push((b.name || 'The tower') + ': garage entrance on the ' + ({ '+u': 'right end', '-u': 'left end', '+v': 'back', '-v': 'back' })[best.face] + (best.rect ? ', a ' + Math.round(best.t) + ' ft drive to it' : '') + (best.cut.length ? ' (across a parking row: its stalls there taken out)' : '') + '; the lobby on the street side.');
  }
  return { ...o, elements: els, tplNotes: [...(o.tplNotes || []), ...notes] };
}
// a changed option kept only when it breaks no hard check the original passed
// ---------- parking quality (docs/LAYOUT-ENGINE.md item 25; measured by scripts/parking-metrics.mjs) ----------
// A long dead-end parking aisle gets a turnaround. Where an aisle's stalls run on more than DEAD_AISLE ft past the last
// place another drive joins it (one aisle with the way in at its middle, on a narrow lot), a driver who finds no space
// backs out the whole way. At its end: a turnaround pad TURN_PAD ft along the aisle and across the aisle and the stall
// rows either side (a T a car turns in; not a fire apparatus turnaround: parking aisles are not taken as fire lanes),
// past the rows' ends where the land inside the paving setback lets it (no stalls lost), else on the last two stalls of
// each row at that end, only while the parking still meets what's required. Lawn under the pad gives way; buildings,
// ponds, parks and other rows never do. The validator warns on the same thing (parking.dead-end-aisle).
export const DEAD_AISLE = S.DEAD_AISLE_FT, TURN_PAD = 20;
// the aisles whose stall rows run on more than DEAD_AISLE ft past the last piece of the network joining them (a drive,
// a truck court, the paving under a lot; a driveway's street end is a way out, so driveways aren't judged). An aisle end
// left clear of stalls is not taken as a turnaround here (lib/siteplan.mjs deadEnds takes an 18 ft hammerhead as one only
// on an aisle shorter than this): a 24 ft aisle is too narrow to turn in. Each: { e, sgn, u, L, W, rowEnd, tc, on: [{ r, a, b, side }] } (along the aisle from its middle)
export function longDeadAisles(els) {
  const cl = r => { const q = S.signedArea(r) >= 0 ? r : r.slice().reverse(); return q.concat([q[0]]); };
  const net = els.filter(e => (e.kind === 'drive' || e.kind === 'truck' || e.kind === 'field') && !e.future && !/drive-?thru/i.test((e.name || '') + ' ' + (e.note || '')));
  const rows = els.filter(e => e.kind === 'parking' && !e.future && !e.rv && !e.vac), out = [];
  for (const e of net) {
    if (e.kind !== 'drive' || e.path || e.poly || e.entry || e.turn || S.isEntrance(e) || !(+e.w > 0 && +e.d > 0)) continue;
    const long = +e.w >= +e.d, L = long ? +e.w : +e.d, W = long ? +e.d : +e.w; if (L < 60 || W > 40) continue;
    const r = (e.rot || 0) * Math.PI / 180, u = long ? [Math.cos(r), Math.sin(r)] : [-Math.sin(r), Math.cos(r)], v = [-u[1], u[0]];
    const at = (t, s) => [e.x + u[0] * t + v[0] * s, e.y + u[1] * t + v[1] * s], tOf = p => (p[0] - e.x) * u[0] + (p[1] - e.y) * u[1], sOf = p => (p[0] - e.x) * v[0] + (p[1] - e.y) * v[1];
    const sh = S.shapeOf(e), g1 = S.grow(sh, 1);
    const on = rows.filter(q => S.rectsOverlap({ poly: S.grow(S.shapeOf(q), 2) }, { poly: sh }, 0)).map(q => { const s = S.shapeOf(q), ts = s.map(tOf), ss = s.map(sOf), qa = (q.rot || 0) * Math.PI / 180, ax = +q.w >= +q.d ? [Math.cos(qa), Math.sin(qa)] : [-Math.sin(qa), Math.cos(qa)];
      const cap = q.caps && !q.poly && !S.stallAng(q) && +q.w >= +q.d && S.stalls(q).n >= 6 ? S.stallPitch(q) : 0; // (planted end caps are no stalls)
      return { r: q, a: Math.min(...ts) + cap, b: Math.max(...ts) - cap, oa: Math.min(...ts), ob: Math.max(...ts), side: Math.min(...ss) > -1 ? 1 : Math.max(...ss) < 1 ? -1 : 0, par: q.poly || Math.abs(ax[0] * u[0] + ax[1] * u[1]) > 0.9 }; }).filter(q => q.side && q.par && q.b - q.a > 8);
    if (!on.length) continue;
    const band = cl([at(-L / 2 - 80, -(W / 2 - 4)), at(L / 2 + 80, -(W / 2 - 4)), at(L / 2 + 80, W / 2 - 4), at(-L / 2 - 80, W / 2 - 4)]);
    const joins = net.filter(o => o !== e && S.rectsOverlap({ poly: S.shapeOf(o) }, { poly: g1 }, 0)).map(o => { const s = S.shapeOf(o); let ps = [];
      try { ps = polyclip.intersection([cl(s)], [band]).flatMap(pg => pg[0]); } catch { ps = []; }
      if (!ps.length) ps = s.filter(p => S.gapBetween([[p[0] - 0.1, p[1] - 0.1], [p[0] + 0.1, p[1] - 0.1], [p[0] + 0.1, p[1] + 0.1], [p[0] - 0.1, p[1] + 0.1]], sh) <= 1.5);
      return ps.length ? [Math.min(...ps.map(tOf)), Math.max(...ps.map(tOf))] : null; }).filter(Boolean);
    if (!joins.length) continue;
    for (const sgn of [-1, 1]) { const rowEnd = sgn > 0 ? Math.max(...on.map(q => q.b)) : Math.min(...on.map(q => q.a)), tc = sgn > 0 ? Math.max(...joins.map(j => j[1])) : Math.min(...joins.map(j => j[0]));
      if ((rowEnd - tc) * sgn > DEAD_AISLE) out.push({ e, sgn, u, L, W, rowEnd, tc, on }); }
  }
  return out;
}
export function aisleTurnarounds(plan, o, brief) {
  const ring = plan.ring || []; if (!o?.elements?.length || ring.length < 3) return o;
  let found; try { found = longDeadAisles(o.elements); } catch { return o; }
  if (!found.length) return o;
  let inner; try { inner = S.insetRing(ring, S.edgeRules(ring, plan.front, { ...S.SETBACKS, ...(plan.setbacks || {}) }, plan.streets).map(r => Math.max(0.5, r.pave) - 0.5)); } catch { return o; }
  if (!inner || inner.length < 3) return o;
  const cl = r => { const q = S.signedArea(r) >= 0 ? r : r.slice().reverse(); return q.concat([q[0]]); };
  const pk = list => V.quantities({ ...plan, elements: list, program: o.program || {} }, brief).parking;
  let els = o.elements.slice(), made = 0, lost = 0;
  const tried = new Set(); // (one end at a time, found again on the plan as it now stands: a row cut at one end is a new piece)
  for (let guard = 0; guard < 12; guard++) {
    const d = guard ? longDeadAisles(els).find(x => !tried.has(x.e.id + ':' + x.sgn)) : found[0]; if (!d) break; tried.add(d.e.id + ':' + d.sgn);
    const e = d.e;
    const { sgn, u, L, W } = d, v = [-u[1], u[0]], at = (t, s) => [+(e.x + u[0] * t + v[0] * s).toFixed(2), +(e.y + u[1] * t + v[1] * s).toFixed(2)];
    const sOf = p => (p[0] - e.x) * v[0] + (p[1] - e.y) * v[1];
    const reachS = s => Math.max(W / 2 + 18, ...d.on.filter(q => q.side === s && els.includes(q.r)).map(q => Math.max(...S.shapeOf(q.r).map(p => s * sOf(p))))); // (across to the rows' far edges, a stall's depth where a side has none)
    const rowEnd = sgn > 0 ? Math.max(...d.on.map(q => q.ob)) : Math.min(...d.on.map(q => q.oa)); // (the rows' outlines, planted end caps and all)
    const sLo = -reachS(-1), sHi = reachS(1), tEnd = sgn * L / 2, T0 = sgn > 0 ? Math.max(tEnd, rowEnd) : Math.min(tEnd, rowEnd);
    const solid = els.filter(x => x !== e && !['drive', 'truck', 'field', 'lot', 'zone', 'sign', 'trail'].includes(x.kind) && !(x.kind === 'green' && !S.isPark(x)) && !x.future).map(x => ({ x, s: x.kind === 'building' ? S.grow(S.shapeOf(x), 6) : S.shapeOf(x) }));
    const fits = (pads, skip) => pads.every(pd => pd.every(p => S.inRing(p, inner)) && !solid.some(q => !skip.has(q.x) && S.rectsOverlap({ poly: S.grow(pd, -0.5) }, { poly: q.s }, 0)));
    const rect = (t0, t1, s0, s1, extra) => { const c = at((t0 + t1) / 2, (s0 + s1) / 2); return { kind: 'drive', x: c[0], y: c[1], w: +Math.abs(t1 - t0).toFixed(2), d: +(s1 - s0).toFixed(2), rot: +(Math.atan2(u[1], u[0]) * 180 / Math.PI).toFixed(4), name: '', ...extra }; };
    const padEl = (t0, t1) => ({ ...rect(t0, t1, sLo, sHi, { id: (e.id || 'a') + (sgn > 0 ? '-turnB' : '-turnA'), note: 'Turnaround · ' + Math.round(sHi - sLo) + ' ft', turn: true }), kind: 'field' }); // (paving of the lot, as the field under a parking lot is: a car's turnaround, not a fire lane)
    // A: past the rows' ends (the aisle run on to them first where they run past it)
    const tA1 = T0 + sgn * TURN_PAD, padA = padEl(T0, tA1), extA = Math.abs(T0 - tEnd) > 0.5 ? rect(tEnd, T0, -W / 2, W / 2, { id: (e.id || 'a') + (sgn > 0 ? '-runB' : '-runA'), note: W + ' ft drive aisle' }) : null;
    let next = null, cost = 0;
    if (fits([S.shapeOf(padA), ...(extA ? [S.shapeOf(extA)] : [])], new Set())) next = els.concat(extA ? [extA, padA] : [padA]);
    else if (Math.abs(T0 - tEnd) <= 1) { // B: on the last two stalls' length at the end (the rows reaching it give them up)
      const live = d.on.filter(q => els.includes(q.r)), pitch = Math.max(...live.map(q => S.stallPitch(q.r)), S.STALL.w), back = T0 - sgn * 2 * pitch, ends = live.filter(q => sgn > 0 ? q.ob > back + 0.5 : q.oa < back - 0.5); // (rows already ending two stalls short of the end: nothing to cut)
      const short = ends.map(q => { const r = q.r, ra = r.w >= r.d ? 'w' : 'd', a = (r.rot || 0) * Math.PI / 180, ax = ra === 'w' ? [Math.cos(a), Math.sin(a)] : [-Math.sin(a), Math.cos(a)], dir = (ax[0] * u[0] + ax[1] * u[1]) * sgn > 0 ? 1 : -1, cut = (sgn > 0 ? q.ob - back : back - q.oa);
        const k = Math.ceil((cut - 0.01) / S.stallPitch(r)) * S.stallPitch(r); if (k <= 0) return [r, r]; if (r[ra] - k < 3 * S.stallPitch(r)) return [r, null];
        return [r, { ...r, [ra]: +(r[ra] - k).toFixed(2), x: +(r.x - ax[0] * dir * k / 2).toFixed(2), y: +(r.y - ax[1] * dir * k / 2).toFixed(2) }]; });
      const padB = padEl(back, T0);
      if (short.every(([, r2]) => r2) && fits([S.shapeOf(padB)], new Set(ends.map(q => q.r)))) {
        const cand = els.map(x => short.find(([r]) => r === x)?.[1] ?? x).concat([padB]), p0 = pk(els), p1 = pk(cand);
        if (p1.required != null && p1.provided >= p1.required) { next = cand; cost = p0.provided - p1.provided; }
      }
    }
    if (!next) continue;
    // the lawn under the pad gives way (a planted strip or the land left; a named park never does)
    const pads = next.filter(x => x.turn && !els.includes(x)).map(x => cl(S.grow(S.shapeOf(x), 1)));
    els = next.flatMap(x => { if (x.kind !== 'green' || S.isPark(x) || !x.poly || !pads.some(pd => S.rectsOverlap({ poly: x.poly }, { poly: pd.slice(0, -1) }, 0))) return [x];
      let left; try { left = polyclip.difference([cl(x.poly)], ...pads.map(pd => [pd])); } catch { return [x]; }
      return left.map(pp => pp[0].slice(0, -1)).filter(r => S.ringArea(r) > 400).map((r, i) => ({ ...x, ...(i ? { id: (x.id || 'g') + 't' + i } : {}), poly: r.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]) })); });
    made++; lost += cost;
  }
  if (!made) return o;
  return { ...o, elements: els, tplNotes: [...(o.tplNotes || []), made + ' long dead-end parking aisle' + (made > 1 ? 's' : '') + ' given a turnaround at the end' + (lost ? ' (' + lost + ' stall' + (lost > 1 ? 's' : '') + ' at the end gave way; the parking still meets what’s required)' : '') + '.'] };
}
// An entrance's throat (docs/LAYOUT-ENGINE.md item 28): the stretch of the entry drive in from the street where no
// stall backs into it and no drive crosses it, so cars turning in off the street don't queue back onto it. The length
// asked grows with the parking the entrance serves; a planning yardstick in the range the access-management guidance
// gives (TRB Access Management Manual, 2nd ed. 2014, on driveway throat length; ITE / Stover & Koepke, "Transportation
// and Land Development", 2nd ed.): 50 ft for a lot of under 200 spaces, 75 ft to 499, 100 ft for 500 or more (local
// access codes set the real number). A townhome or home lane (no lot) is not judged.
export const throatNeed = stalls => stalls >= 500 ? 100 : stalls >= 200 ? 75 : 50;
// every entrance's throat: { e, k (street edge), len (ft in from the street to the first stall centre beside it or drive
// across it, capped at 300; first: to the first stall, cross: to the first drive), zone (the stretch the length asked covers, the entry's width and 34 ft either side: a stall's depth
// and the curb returns), stalls (stall centres in the zone) }
export function entryThroats(plan, els, need) {
  const ring = plan.ring || []; if (ring.length < 3) return [];
  let rules; try { rules = S.edgeRules(ring, plan.front, { ...S.SETBACKS, ...(plan.setbacks || {}) }, plan.streets); } catch { return []; }
  const pts = els.filter(x => x.kind === 'parking' && !x.future && !x.rv && !x.vac).flatMap(x => { try { return S.stallCentres(x); } catch { return []; } });
  const out = [];
  for (const e of els.filter(x => S.isEntrance(x) && !x.emergency && !x.future)) {
    const o = S.shapeOf(e); let k = -1, bd = Infinity;
    for (const any of [false, true]) { if (k >= 0 && bd <= 30) break; // (the street edges first; a frontage drawn as chords may give only some of them the front's role)
      ring.forEach((a, i) => { if (!any && rules[i].role !== 'front' && !rules[i].street) return; const d = Math.min(...o.map(p => S.segDist(p, a, ring[(i + 1) % ring.length]))); if (d < bd) { bd = d; k = i; } }); }
    if (k < 0 || bd > 30) continue;
    const a = ring[k], b = ring[(k + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], ow = S.outwardOf(ring, k), cw = S.signedArea(ring) < 0 ? -1 : 1, nIn = [-ow[0] * cw, -ow[1] * cw]; // (outwardOf takes the ring counter-clockwise)
    const along = p => (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1], inn = p => (p[0] - a[0]) * nIn[0] + (p[1] - a[1]) * nIn[1];
    const core = o.filter(p => inn(p) > 30), cp = core.length ? core : o, lo = Math.min(...cp.map(along)), hi = Math.max(...cp.map(along));
    if (hi - lo > 90) continue; // (a frontage drive along the street, not a way in)
    const others = els.filter(x => (x.kind === 'drive' || x.kind === 'truck' || x.kind === 'field') && x !== e && !x.future && !/drive-?thru/i.test((x.name || '') + ' ' + (x.note || ''))).map(x => S.shapeOf(x));
    let cross = 300; for (let t = 1; t <= 300; t++) { const p = [a[0] + u[0] * (lo + hi) / 2 + nIn[0] * t, a[1] + u[1] * (lo + hi) / 2 + nIn[1] * t]; if (others.some(q => S.inRing(p, q))) { cross = t; break; } }
    const beside = pts.filter(p => along(p) > lo - 34 && along(p) < hi + 34 && inn(p) > -5).map(inn), first = Math.max(0, Math.min(300, ...beside)); // (a stall's centre)
    const len = Math.round(Math.min(cross, first)), zone = [[lo - 34, -5], [hi + 34, -5], [hi + 34, need], [lo - 34, need]].map(([s, t]) => [a[0] + u[0] * s + nIn[0] * t, a[1] + u[1] * s + nIn[1] * t]); // (a stall whose centre is within the length asked)
    const stalls = pts.filter(p => S.inRing(p, zone));
    out.push({ e, k, len, cross: Math.round(cross), first: Math.round(first), zone, stalls });
  }
  return out;
}
// Stalls near the doors (docs/LAYOUT-ENGINE.md item 28). The drives the layout already paves often run with no stalls
// along them (the cross drives at a field's ends, a loop's legs), while rows on their own aisle sit beyond a pond or
// at the far end of the land. New 90° rows go along the free sides of the two-way drives (square to the drive, 18 ft
// deep, a planted island each end, one every 13th) where the land is free: inside the paving setback, clear of
// buildings (6 ft walk), other paving, rows, ponds, pools, courts, parks and every entrance's throat, and no farther
// from a building than the stalls' median walk now (FAR_FT at least); then the run's own surplus pruning
// (pruneSurplus: rows no building uses first, farthest first, then their drives and the lot paving under them) takes the
// parking back down to what's required. Kept only where the stalls end up nearer the buildings (90th percentile walk)
// with no more paving, or as near on less paving, and the parking still meets what's required.
const DRIVE_ROW_MIN = 6; // stalls in a new row along a drive, its islands aside
export function rowsAlongDrives(plan, o, brief) {
  const ring = plan.ring || []; if (!o?.elements?.length || ring.length < 3) return o;
  let inner; try { inner = S.insetRing(ring, S.edgeRules(ring, plan.front, { ...S.SETBACKS, ...(plan.setbacks || {}) }, plan.streets).map(r => Math.max(0.5, r.pave) - 0.5)); } catch { return o; }
  if (!inner || inner.length < 3) return o;
  const els0 = o.elements, pk = list => V.quantities({ ...plan, elements: list, program: o.program || {} }, brief).parking;
  const p0 = pk(els0); if (p0.required == null || !(p0.required > 0) || p0.provided < p0.required) return o;
  const rows0 = els0.filter(e => e.kind === 'parking' && !e.future && !e.rv && !e.vac); if (!rows0.length) return o;
  const isB = e => e.kind === 'building' && !e.future && !e.ghost && e.use !== 'garage', Bs = els0.filter(isB), served = Bs.filter(e => e.use !== 'amenity'), B = (served.length ? served : Bs).map(e => S.outline(e)); if (!B.length) return o;
  const walk = p => Math.min(...B.map(b => b.reduce((m, a, i) => Math.min(m, S.segDist(p, a, b[(i + 1) % b.length])), Infinity)));
  const walks = list => list.filter(e => e.kind === 'parking' && !e.future && !e.rv && !e.vac).flatMap(e => { try { return S.stallCentres(e); } catch { return []; } }).map(walk).sort((a, b) => a - b);
  const q = (a, f) => a.length ? a[Math.min(a.length - 1, Math.floor(f * (a.length - 1) + 0.5))] : 0, w0 = walks(els0), reach = Math.max(FAR_FT, q(w0, 0.75)), far0 = q(w0, 0.9);
  const throats = entryThroats(plan, els0, throatNeed(p0.provided)).map(t => t.zone), inZone = c => throats.some(z => S.inRing(c, z));
  const entry = list => list.filter(e => e.kind === 'parking' && !e.future && !e.rv && !e.vac).flatMap(e => { try { return S.stallCentres(e); } catch { return []; } }).filter(inZone).length, ent0 = entry(els0);
  if (far0 <= FAR_FT && !ent0) return o; // (the stalls are already by the doors and clear of the entrances)
  const cap = (plan.params?.style?.islands ?? 'square') === 'square' ? 'square' : true, sw = S.STALL.w, SD = S.STALL.d;
  const lawn = x => x.kind === 'green' && !S.isPark(x);
  const solids = els0.filter(x => !x.future && !lawn(x) && !['lot', 'zone'].includes(x.kind)).map(x => ({ x, s: x.kind === 'building' ? S.grow(S.shapeOf(x), 6) : S.shapeOf(x) }));
  const add = [];
  for (const d of els0) {
    if (d.kind !== 'drive' || d.future || d.path || d.poly || d.entry || d.turn || d.emergency || d.oneWay || d.garageEntry || S.isEntrance(d) || TURN.oneWayLane(d) || /^Garage entry|drive-?thru/i.test((d.name || '') + ' ' + (d.note || '')) || !(+d.w > 0 && +d.d > 0)) continue;
    const long = +d.w >= +d.d, L = long ? +d.w : +d.d, W = long ? +d.d : +d.w; if (L < (DRIVE_ROW_MIN + 2) * sw || W < 22 || W > 30) continue;
    const rot = (d.rot || 0) + (long ? 0 : 90), r = rot * Math.PI / 180, u = [Math.cos(r), Math.sin(r)], v = [-u[1], u[0]];
    const at = (t, s) => [d.x + u[0] * t + v[0] * s, d.y + u[1] * t + v[1] * s], box = (t0, t1, s0, s1) => [at(t0, s0), at(t1, s0), at(t1, s1), at(t0, s1)];
    for (const sg of [-1, 1]) {
      const s0 = sg > 0 ? W / 2 : -W / 2 - SD, s1 = s0 + SD, nSlots = Math.floor(L / sw), t00 = -nSlots * sw / 2;
      const ok = []; for (let k = 0; k < nSlots; k++) { const b = box(t00 + k * sw, t00 + (k + 1) * sw, s0, s1), c = at(t00 + (k + 0.5) * sw, (s0 + s1) / 2);
        ok.push(b.every(pt => S.inRing(pt, inner)) && !solids.some(z => z.x !== d && S.rectsOverlap({ poly: S.grow(b, -0.3) }, { poly: z.s }, 0)) && !add.some(z => S.rectsOverlap({ poly: S.grow(b, -0.3) }, { poly: S.shapeOf(z) }, 0)) && !throats.some(z => S.rectsOverlap({ poly: b }, { poly: z }, 0)) && walk(c) <= reach); }
      for (let k = 0; k < nSlots;) { if (!ok[k]) { k++; continue; } let j = k; while (j < nSlots && ok[j]) j++;
        const n = j - k, cnt = S.rowStallCount(n, true, cap);
        if (n >= 8 && cnt >= DRIVE_ROW_MIN) { const c = at(t00 + (k + j) / 2 * sw, (s0 + s1) / 2);
          add.push({ id: (d.id || 'd') + (sg > 0 ? '-rowL' : '-rowR') + k, kind: 'parking', x: +c[0].toFixed(2), y: +c[1].toFixed(2), w: +(n * sw).toFixed(2), d: SD, rot: +rot.toFixed(4), row: sg > 0 ? -1 : 1, lock: true, islands: true, caps: cap, note: 'Stalls along the drive' }); }
        k = j; }
    }
  }
  if (!add.length && !ent0) return o;
  // the lawn under the new rows gives way
  const cl = r => { const q2 = S.signedArea(r) >= 0 ? r : r.slice().reverse(); return q2.concat([q2[0]]); }, pads = add.map(a => cl(S.shapeOf(a)));
  const els = els0.flatMap(x => { if (!lawn(x) || !x.poly || !pads.some(pd => S.rectsOverlap({ poly: x.poly }, { poly: pd.slice(0, -1) }, 0))) return [x];
    let left; try { left = polyclip.difference([cl(x.poly)], ...pads.map(pd => [pd])); } catch { return [x]; }
    return left.map(pp => pp[0].slice(0, -1)).filter(rg => S.ringArea(rg) > 400).map((rg, i) => ({ ...x, ...(i ? { id: (x.id || 'g') + 'r' + i } : {}), poly: rg.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]) })); }).concat(add);
  // then stalls out, one at a time off a row's end: first those in an entrance's throat (while the parking still meets
  // what's required), then the farthest from a building, back down to the count the plan had; a row left with fewer
  // than MIN_ROW stalls goes whole
  let p = pk(els), cutWhole = 0; const gone = [], stuck = new Set();
  const trimmable = e => e.kind === 'parking' && !e.future && !e.rv && !e.vac && !e.poly && !e.parallel && !S.stallAng(e) && (e.lock || e.row) && e.stallRot == null && +e.w > 0 && !S.stalls(e).swap && !stuck.has(e);
  for (let guard = 0; guard < 400; guard++) {
    const rowsN = els.filter(trimmable).map(e => { const r = (e.rot || 0) * Math.PI / 180, u = [Math.cos(r), Math.sin(r)], cs = S.stallCentres(e).map(c => ({ c, t: (c[0] - e.x) * u[0] + (c[1] - e.y) * u[1] })).sort((x, y) => x.t - y.t);
      if (!cs.length) return null; const zs = cs.filter(x => inZone(x.c)), lo = cs[0], hi = cs[cs.length - 1];
      const end = zs.length ? (zs.reduce((t, x) => t + x.t, 0) / zs.length > (lo.t + hi.t) / 2 ? 1 : -1) : walk(hi.c) >= walk(lo.c) ? 1 : -1;
      return { e, u, n: cs.length, zone: zs.length, far: Math.max(walk(lo.c), walk(hi.c)), end }; }).filter(Boolean);
    const zr = rowsN.filter(x => x.zone).sort((a, b) => b.zone - a.zone || String(a.e.id).localeCompare(String(b.e.id)))[0];
    const pick = zr && p.provided - 1 >= p.required ? zr : p.provided > p0.provided ? rowsN.sort((a, b) => b.far - a.far || String(a.e.id).localeCompare(String(b.e.id)))[0] : null;
    if (!pick) break;
    const { e, u, n, end } = pick, i = els.indexOf(e), sw2 = S.stallPitch(e), excess = p.provided - (pick === zr ? p.required : p0.provided);
    if (n - 1 < MIN_ROW) { if (n <= excess || pick === zr && n <= p.provided - p.required) { els.splice(i, 1); gone.push(S.shapeOf(e)); cutWhole++; p = pk(els); } else stuck.add(e); continue; }
    const e2 = { ...e, w: +(e.w - sw2).toFixed(2), x: +(e.x - u[0] * end * sw2 / 2).toFixed(2), y: +(e.y - u[1] * end * sw2 / 2).toFixed(2) };
    els[i] = e2; const p2 = pk(els); if (p2.provided < p.required) { els[i] = e; stuck.add(e); continue; }
    const c = [e.x + u[0] * end * (e.w - sw2) / 2, e.y + u[1] * end * (e.w - sw2) / 2]; gone.push(S.shapeOf({ ...e, id: undefined, w: sw2, x: c[0], y: c[1] })); p = p2;
  }
  const { all } = afterCut(els, gone, cutWhole, () => els.filter(isB));
  const p1 = pk(all); if (p1.required == null || p1.provided < p1.required) return o;
  const w1 = walks(all), far1 = q(w1, 0.9), ent1 = entry(all), pave = list => { const sh = list.filter(e => ['parking', 'drive', 'field'].includes(e.kind) && !e.future).map(e => cl(S.shapeOf(e))); try { return polyclip.union(...sh.map(q => [q])).reduce((t, pg) => t + S.ringArea(pg[0].slice(0, -1)) - pg.slice(1).reduce((h, r) => h + S.ringArea(r.slice(0, -1)), 0), 0); } catch { return sh.reduce((t, q) => t + S.ringArea(q.slice(0, -1)), 0); } }, planted = list => list.filter(e => e.kind === 'parking' && !e.future && !e.poly).reduce((t, e) => { try { return t + S.capsOf(e).reduce((h, c) => h + S.ringArea(c.poly), 0) + S.islandsOf(e).length * S.stallPitch(e) * (e.sd || S.STALL.d); } catch { return t; } }, 0), a0 = pave(els0) - planted(els0), a1 = pave(all) - planted(all); // (the paving's union, lot paving under rows counted once; planted end caps and islands are not paving)
  const dead = list => { try { return S.deadEnds(list, 1).length + longDeadAisles(list).length; } catch { return 0; } };
  if (ent1 > ent0 || dead(all) > dead(els0) || !(ent1 < ent0 && far1 <= far0 + 5 && a1 <= a0 * 1.01 || far1 < far0 - 5 && a1 <= a0 * 1.01 || far1 <= far0 + 1 && a1 < a0 * 0.98)) return o;
  const kept = add.filter(a => all.some(x => x.id === a.id));
  return { ...o, elements: all, tplNotes: [...(o.tplNotes || []), ...(kept.length ? [kept.length + ' row' + (kept.length > 1 ? 's' : '') + ' of stalls along drives that had none, nearer the buildings; the farthest stalls taken out for them (90th percentile walk ' + Math.round(far0) + ' → ' + Math.round(far1) + ' ft).'] : []), ...(ent1 < ent0 ? [(ent0 - ent1) + ' stall' + (ent0 - ent1 > 1 ? 's' : '') + ' backing into an entry drive near the street taken out (the entrance’s throat kept clear).'] : []), p1.provided + ' spaces for ' + p1.required + ' required.'] };
}
// Stall rows end in planted islands at no cost in stalls where the land at a row's end is free (docs/LAYOUT-ENGINE.md
// item 28): the row grows by a stall width at each end and both end stalls are planted (the stalls stay where they
// were); where only one end is free, the row grows two stall widths that way and its stalls shift one along (the new
// end stall must still front on the aisle). The land taken must be inside the paving setback and clear of buildings
// (5 ft walk), drives, lot paving, other rows, ponds, pools, courts and parks; lawn (a landscape strip or land left)
// is planted over. Never a stall fewer. Square single rows the engine laid out (lock / row), longest rows first.
export function growEndIslands(plan, o, brief) {
  const ring = plan.ring || []; if (!o?.elements?.length || ring.length < 3) return o;
  let inner; try { inner = S.insetRing(ring, S.edgeRules(ring, plan.front, { ...S.SETBACKS, ...(plan.setbacks || {}) }, plan.streets).map(r => Math.max(0.5, r.pave) - 0.5)); } catch { return o; }
  if (!inner || inner.length < 3) return o;
  const els = o.elements.slice(), pk = () => V.quantities({ ...plan, elements: els, program: o.program || {} }, brief).parking;
  let p = pk(); if (p.required == null) return o;
  const cap = (plan.params?.style?.islands ?? 'square') === 'square' ? 'square' : true, dead = () => { try { return S.deadEnds(els, 1).length; } catch { return 0; } }, d0 = dead();
  const lawn = x => x.kind === 'green' && !S.isPark(x), free = ['lot', 'zone'];
  const Bs = els.filter(e => e.kind === 'building' && !e.future && !e.ghost && e.use !== 'garage'), Bsv = Bs.filter(e => e.use !== 'amenity'), B = (Bsv.length ? Bsv : Bs).map(e => S.outline(e));
  const walk = p0 => Math.min(...B.map(b => b.reduce((m, a, i) => Math.min(m, S.segDist(p0, a, b[(i + 1) % b.length])), Infinity)));
  const cand = els.map((e, i) => ({ e, i })).filter(({ e }) => e.kind === 'parking' && !e.caps && !e.parallel && !e.rv && !e.vac && !e.poly && !e.future && !S.stallAng(e) && (e.lock || e.row) && e.stallRot == null && +e.d <= 19 && +e.w > 0 && !S.stalls(e).swap)
    .map(q => ({ ...q, n: S.stalls(q.e).n })).filter(q => q.n >= 6).sort((a, b) => b.n - a.n || String(a.e.id).localeCompare(String(b.e.id)));
  let done = 0;
  for (const q of cand) {
    const e = els[q.i], sw = S.stallPitch(e), r = (e.rot || 0) * Math.PI / 180, u = [Math.cos(r), Math.sin(r)], v = [-u[1], u[0]], W = +e.w, D = +e.d;
    const at = (t, s) => [e.x + u[0] * t + v[0] * s, e.y + u[1] * t + v[1] * s], box = (t0, t1, s0, s1) => [at(t0, s0), at(t1, s0), at(t1, s1), at(t0, s1)];
    const others = els.filter(x => x !== e && !x.future && !lawn(x) && !free.includes(x.kind)).map(x => ({ x, s: x.kind === 'building' ? S.grow(S.shapeOf(x), 5) : S.shapeOf(x) }));
    const clear = pd => pd.every(pt => S.inRing(pt, inner)) && !others.some(z => S.rectsOverlap({ poly: S.grow(pd, -0.3) }, { poly: z.s }, 0));
    const strip = (sg, k) => sg > 0 ? box(W / 2, W / 2 + k * sw, -D / 2, D / 2) : box(-W / 2 - k * sw, -W / 2, -D / 2, D / 2);
    // the aisle in front of a stall slot (t0..t1 along the row): a drive or lot paving there
    const aisle = e.row ? Math.sign(e.row) : 0, net = els.filter(x => (x.kind === 'drive' || x.kind === 'field') && !x.future).map(x => S.shapeOf(x));
    const fronts = (t0, t1) => aisle && [[t0 + 1, D / 2 + 2], [(t0 + t1) / 2, D / 2 + 3], [t1 - 1, D / 2 + 2]].every(([t, s]) => { const pt = at(t, aisle * s); return net.some(z => S.inRing(pt, z)); });
    let next = null;
    if (clear(strip(1, 1)) && clear(strip(-1, 1))) next = { ...e, w: +(W + 2 * sw).toFixed(2), caps: cap };
    else for (const sg of [1, -1]) { if (!clear(strip(sg, 2))) continue;
      const t0 = sg > 0 ? W / 2 : -W / 2 - sw; if (!fronts(t0, t0 + sw)) continue; // (the stall shifted onto the new land still fronts the aisle)
      const c = at(sg * sw, 0), e2 = { ...e, x: +c[0].toFixed(2), y: +c[1].toFixed(2), w: +(W + 2 * sw).toFixed(2), caps: cap };
      if (B.length && Math.max(...S.stallCentres(e2).map(walk)) > Math.max(...S.stallCentres(e).map(walk)) + 1) continue; // (not where the stalls shift away from the door)
      next = e2; break; }
    if (!next || S.stalls(next).count < S.stalls(e).count || S.stalls(next).count !== S.stallCentres(next).length) continue;
    els[q.i] = next; const p2 = pk(); if (p2.provided >= p.provided && dead() <= d0) { p = p2; done++; } else els[q.i] = e;
  }
  if (!done) return o;
  return { ...o, elements: els, tplNotes: [...(o.tplNotes || []), done + ' parking row' + (done > 1 ? 's' : '') + ' end in planted islands on the free land at their ends (no stall given up).'] };
}
// Stall rows end in planted islands where the parking can spare it. Landscape codes commonly ask for a planted island at
// the end of every row (and one every 10-15 stalls along it: the rows already have one every 13th). The default square
// island style left the rows of the apartment and townhome layouts with bare ends; here, last in the run, the stalls
// still spare above what's required go to end islands (the end stall each end of a row of 8 or more, planted), longest
// rows first, never below what's required. Kept only when no check gets worse.
export function rowEndIslands(plan, o, brief) {
  if (!o?.elements?.length) return o;
  const els = o.elements.slice(), pk = () => V.quantities({ ...plan, elements: els, program: o.program || {} }, brief).parking;
  let p = pk(); if (p.required == null || p.provided - 2 < p.required) return o;
  const cap = (plan.params?.style?.islands ?? 'square') === 'square' ? 'square' : true;
  const cand = els.map((e, i) => ({ e, i })).filter(({ e }) => e.kind === 'parking' && !e.caps && !e.parallel && !e.rv && !e.vac && !e.poly && !e.future && !S.stallAng(e) && (e.lock || e.row) && e.stallRot == null)
    .map(q => ({ ...q, n: S.stalls(q.e).n })).filter(q => q.n >= 8 && (c => S.stalls(c).count === S.stallCentres(c).length)({ ...q.e, caps: cap })) /* (the engine's count and the drawn marks agree: a guard; a row of 13n stalls with caps counts its last island once, lib/siteplan.mjs rowStallCount) */.sort((a, b) => b.n - a.n || String(a.e.id).localeCompare(String(b.e.id)));
  let done = 0;
  for (const q of cand) { if (p.provided - 2 < p.required) break; const was = els[q.i]; els[q.i] = { ...was, caps: cap }; const p2 = pk(); if (p2.provided >= p.required) { p = p2; done++; } else els[q.i] = was; }
  if (!done) return o;
  return { ...o, elements: els, tplNotes: [...(o.tplNotes || []), done + ' parking row' + (done > 1 ? 's' : '') + ' end in planted islands (stalls to spare): ' + p.provided + ' for ' + p.required + ' required.'] };
}
// Bare row ends paid for elsewhere (docs/LAYOUT-ENGINE.md item 36). Where the parking is exactly met, a row that meets a
// cross drive end to end can't grow onto free land (growEndIslands) and there are no stalls to spare (rowEndIslands). But
// another row may have free land past its end: it grows a stall width at a time there (only where the new stall fronts
// the aisle, inside the paving setback, clear as growEndIslands' land is, and no farther from a building than that row's
// farthest stall), and each two stalls gained become the planted ends of a bare row (longest first). Never below what's
// required, never a new dead end; all or nothing for each row planted.
export function fundEndIslands(plan, o, brief) {
  const ring = plan.ring || []; if (!o?.elements?.length || ring.length < 3) return o;
  let inner; try { inner = S.insetRing(ring, S.edgeRules(ring, plan.front, { ...S.SETBACKS, ...(plan.setbacks || {}) }, plan.streets).map(r => Math.max(0.5, r.pave) - 0.5)); } catch { return o; }
  if (!inner || inner.length < 3) return o;
  const els = o.elements.slice(), pk = () => V.quantities({ ...plan, elements: els, program: o.program || {} }, brief).parking;
  let p = pk(); if (p.required == null) return o;
  const cap = (plan.params?.style?.islands ?? 'square') === 'square' ? 'square' : true, dead = () => { try { return S.deadEnds(els, 1).length; } catch { return 0; } }, d0 = dead();
  const inThroat = () => { try { return entryThroats(plan, els, throatNeed(p.provided)).reduce((t, x) => t + x.stalls.length, 0); } catch { return 0; } }, th0 = inThroat(); /* (never a stall more inside an entrance's stacking length) */
  const lawn = x => x.kind === 'green' && !S.isPark(x), free = ['lot', 'zone'];
  const Bs = els.filter(e => e.kind === 'building' && !e.future && !e.ghost && e.use !== 'garage'), Bsv = Bs.filter(e => e.use !== 'amenity'), B = (Bsv.length ? Bsv : Bs).map(e => S.outline(e)); if (!B.length) return o;
  const walk = p0 => Math.min(...B.map(b => b.reduce((m, a, i) => Math.min(m, S.segDist(p0, a, b[(i + 1) % b.length])), Infinity)));
  const sq = e => e.kind === 'parking' && !e.parallel && !e.rv && !e.vac && !e.poly && !e.future && !S.stallAng(e) && (e.lock || e.row) && e.stallRot == null && +e.w > 0;
  const agree = c => S.stalls(c).count === S.stallCentres(c).length;
  const takers = els.filter(e => sq(e) && !e.caps && S.stalls(e).n >= 8 && agree({ ...e, caps: cap })).sort((a, b) => S.stalls(b).n - S.stalls(a).n || String(a.id).localeCompare(String(b.id)));
  if (!takers.length) return o;
  const w90 = walkP90(els);
  // one stall width more on a donor row's free end: the row as it would be, or null
  const grow1 = e => { if (!(+e.d <= 19) || S.stalls(e).swap || !(S.stalls(e).n >= 6)) return null; const sw = S.stallPitch(e), r = (e.rot || 0) * Math.PI / 180, u = [Math.cos(r), Math.sin(r)], v = [-u[1], u[0]], W = +e.w, D = +e.d;
    const at = (t, s) => [e.x + u[0] * t + v[0] * s, e.y + u[1] * t + v[1] * s], box = (t0, t1, s0, s1) => [at(t0, s0), at(t1, s0), at(t1, s1), at(t0, s1)];
    const others = els.filter(x => x !== e && !x.future && !lawn(x) && !free.includes(x.kind)).map(x => x.kind === 'building' ? S.grow(S.shapeOf(x), 5) : S.shapeOf(x));
    const clear = pd => pd.every(pt => S.inRing(pt, inner)) && !others.some(z => S.rectsOverlap({ poly: S.grow(pd, -0.3) }, { poly: z }, 0));
    const aisle = e.row ? Math.sign(e.row) : 0, net = els.filter(x => (x.kind === 'drive' || x.kind === 'field') && !x.future).map(x => S.shapeOf(x));
    const fronts = (t0, t1) => aisle && [[t0 + 1, D / 2 + 2], [(t0 + t1) / 2, D / 2 + 3], [t1 - 1, D / 2 + 2]].every(([t, s]) => { const pt = at(t, aisle * s); return net.some(z => S.inRing(pt, z)); });
    const far = Math.max(...S.stallCentres(e).map(walk));
    for (const sg of [1, -1]) { const t0 = sg > 0 ? W / 2 : -W / 2 - sw; if (!clear(box(t0, t0 + sw, -D / 2, D / 2)) || !fronts(sg > 0 ? t0 - sw : t0, sg > 0 ? t0 + sw : t0 + 2 * sw)) continue;
      const c = at(sg * sw / 2, 0), e2 = { ...e, x: +c[0].toFixed(2), y: +c[1].toFixed(2), w: +(W + sw).toFixed(2) };
      const endC = S.stallCentres(e2).reduce((m, q) => { const t = sg * ((q[0] - e.x) * u[0] + (q[1] - e.y) * u[1]); return !m || t > m.t ? { q, t } : m; }, null)?.q; /* (the stall at the grown end: within the plan's 90th-percentile walk, so the walk doesn't lengthen) */
      if (S.stalls(e2).count !== S.stalls(e).count + 1 || !agree(e2) || Math.max(...S.stallCentres(e2).map(walk)) > far + 1 || !endC || walk(endC) > w90) continue;
      return e2; }
    return null; };
  let done = 0, grown = 0;
  for (const t of takers) {
    const i0 = els.indexOf(t); if (i0 < 0 || els[i0].caps) continue;
    const snap = els.slice(); let g = 0;
    // stalls to spare first, then donors, a stall width at a time, until the planted ends can be paid for
    const capped = { ...t, caps: cap }, cost = S.stalls(t).count - S.stalls(capped).count;
    while (p.provided - g - cost < p.required) { let hit = false;
      for (let k = 0; k < els.length; k++) { const e = els[k]; if (e === t || !sq(e)) continue; const e2 = grow1(e); if (!e2) continue; els[k] = e2; if (dead() > d0 || inThroat() > th0) { els[k] = e; continue; } hit = true; g--; break; } // (g counts down: stalls gained)
      if (!hit) break; }
    els[els.indexOf(t)] = capped; const p2 = pk();
    if (p2.provided >= p2.required && p2.provided >= p.required && dead() <= d0) { p = p2; done++; grown -= g; } else { els.length = 0; els.push(...snap); }
  }
  if (!done) return o;
  return { ...o, elements: els, tplNotes: [...(o.tplNotes || []), done + ' more parking row' + (done > 1 ? 's' : '') + ' end in planted islands' + (grown ? ', paid for by ' + grown + ' stall' + (grown > 1 ? 's' : '') + ' added where other rows had free land at their ends' : ' (the stall to spare)') + '.'] };
}

function keepIfNoWorse(plan, was, now, brief) {
  if (now === was) return was;
  const v0 = V.validateLayout({ ...plan, elements: was.elements, program: was.program || {} }, brief), v1 = V.validateLayout({ ...plan, elements: now.elements, program: now.program || {} }, brief);
  const ok = id => v1.checks.find(c => c.id === id)?.status !== 'fail';
  return v0.checks.filter(c => c.hard && c.status === 'pass').every(c => ok(c.id)) ? now : was;
}
// after rows (or stalls) were taken out: the drives that now reach nothing go (a leaf in the paving, one paved
// neighbour, no row and no building near it; only where whole rows went), the lot paving (field) loses what was taken
// out, and the lawn nearby takes the land back. els is changed; returns { all, dropped }.
function afterCut(els, gone, cut, B) {
  const near = (e, list, d) => { const s = S.shapeOf(e); return list.some(b => S.gapBetween(s, S.shapeOf(b)) <= d); };
  // drives that now reach nothing: a leaf in the paving (one paved neighbour), no row and no building near it
  const paved = () => els.filter(e => ['drive', 'parking', 'truck', 'field'].includes(e.kind)), touch = (a, b) => S.gapBetween(S.shapeOf(a), S.shapeOf(b)) <= 1;
  let dropped = 0;
  for (let pass = 0; pass < 12 && cut; pass++) { // (only where whole rows went: trimmed row ends leave every drive with its rows)
    const P = paved(), leaf = els.filter(e => e.kind === 'drive' && !S.isEntrance(e) && !e.entry && !e.through && P.filter(q => q !== e && touch(e, q)).length <= 1 && !near(e, B(), FAR_FT) && !P.some(q => q.kind === 'parking' && touch(e, q)));
    if (!leaf.length) break; for (const d of leaf) { els.splice(els.indexOf(d), 1); gone.push(S.shapeOf(d)); dropped++; }
  }
  // the paving under a lot (field) is redrawn from what's left
  const kept = els.filter(e => e.kind !== 'field');
  // the paving under the lot (field) loses what was taken out (rebuilt from scratch it closed round the buildings)
  const cl = r => { const q = S.signedArea(r) >= 0 ? r : r.slice().reverse(); return q.concat([q[0]]); };
  const fields = els.filter(e => e.kind === 'field').flatMap(f => { if (!f.poly || !gone.length) return [f];
    try { const parts = polyclip.difference([cl(f.poly)], ...gone.map(g => [cl(S.grow(g, 0.5))])).map(pg => pg[0].slice(0, -1)).filter(r => r.length >= 3 && S.ringArea(r) >= 2000).sort((a, b) => S.ringArea(b) - S.ringArea(a));
      return parts.map((r, k) => S.fieldPiece(r.map(q => [+q[0].toFixed(2), +q[1].toFixed(2)]), k ? f.id + '-' + k : f.id, { name: f.name, note: f.note })); } catch { return [f]; } });
  const all = kept.concat(fields); for (const g of gone) giveBackLand(all, S.grow(g, 30), g, 40);
  return { all, dropped };
}
// Angled parking asked for on a mixed-use plan (docs/LAYOUT-ENGINE.md item 33). The mixed layout (lib/sitelayout.mjs
// zones) draws square rows on two-way aisles and never read the angle, so the plan came back square and said nothing.
// Its aisles that a two-way drive joins at both ends are turned one-way with angled rows (lib/siteparking.mjs
// restripeAngled, the field engine's machinery; the guardrails' 26 ft fire-lane aisles too), neighbouring ones running
// opposite ways: all of them where that still parks the program and breaks no check that passed (fire reach included:
// a one-way aisle is no fire lane), else as many as can be, else none. Whatever is drawn, the notes say how many aisles
// turned and why the rest stay square. Before the surplus is pruned, so the angled rows have the spare stalls to give.
export function angleMixed(plan, o, brief, finish = x => x) {
  const want = brief?.program?.parking?.angle; if (!o?.elements?.length || !B.PARKING_ANGLES.includes(want)) return finish(o);
  const mixed = brief.program.uses.length > 1 || o.program?.zones?.length > 1; // (single-use plans too, docs/LAYOUT-ENGINE.md item 36: the older generator's square rows, apartments' included, under the guardrails' 26 ft fire-lane aisles as well; a field engine plan that already said why it is square is left alone)
  if (o.elements.some(e => e.kind === 'parking' && S.stallAng(e)) || !mixed && [...(o.notes || []), ...(o.tplNotes || [])].some(t => /Angled parking/.test(t))) return finish(o);
  const chk = x => V.validateLayout({ ...plan, elements: x.elements, program: x.program || o.program || {} }, brief), pk = els => V.quantities({ ...plan, elements: els, program: o.program || {} }, brief).parking, p0 = pk(o.elements), passed = new Set(chk(o).checks.filter(c => c.status === 'pass').map(c => c.id));
  const word = want === 'angled' ? 'Angled parking' : 'Angled parking at ' + want + '°', note = (x, t) => ({ ...x, tplNotes: [...(x.tplNotes || []), t] });
  let of = 0, tries = 0, short = false, broke = false, turnable = false; const ok = [];
  for (const ang of want === 'angled' ? [60, 45] : [want]) {
    const all = restripeAngled(o.elements, ang, { wide: true }); of = Math.max(of, all.of); if (!all.n) continue; turnable = true;
    // the aisles it can turn; every subset of them, the most aisles first (at most 40 tried), kept where it still parks the
    // program and fails no check that passes now (hard or not: the fire truck's turns too)
    const cand = o.elements.filter(e => all.els.some(x => x.oneWay && x.id === e.id));
    for (let k = cand.length; k >= 1; k--) {
      const subs = []; const pick = (i, acc) => { if (subs.length >= 40) return; if (acc.length === k) { subs.push(acc); return; } for (let j = i; j < cand.length; j++) pick(j + 1, acc.concat([cand[j]])); }; pick(0, []);
      const here = [];
      for (const sub of subs) { if (tries++ > 40) break; const ids = new Set(sub.map(e => e.id)), r = restripeAngled(o.elements, ang, { wide: true, only: a => ids.has(a.id) }); if (!r.n) continue;
        const p = pk(r.els); if (p.required != null && p.provided < p.required) { short = true; continue; }
        if (chk({ elements: r.els }).checks.some(c => c.status === 'fail' && passed.has(c.id))) { broke = true; continue; }
        here.push({ now: { ...o, elements: r.els }, p: p.provided, n: r.n, ang }); }
      ok.push(...here.sort((x, y) => y.p - x.p));
    }
  }
  // each through the run's last passes (they add curb returns, rows along drives and turnarounds the angle changes), the
  // first that fails nothing the square plan, finished the same way, passes (at most six finished)
  let sq = null; const square = () => sq || (sq = finish(o)), sqPass = () => new Set(chk(square()).checks.filter(c => c.status === 'pass').map(c => c.id));
  let pass0 = null, late = null;
  for (const t of ok.slice(0, 6)) { const f = finish(t.now), lost = chk(f).checks.filter(c => c.status === 'fail' && (pass0 || (pass0 = sqPass())).has(c.id)); if (lost.length) { late = late || lost; continue; }
    const why = short && !broke && !late ? 'as angled stalls there would leave the parking short of the ' + p0.required + ' required.' : short ? 'as angling them too would leave the parking short of the ' + p0.required + ' required or break a check that passes with them square.' : 'as turning them would break a check that passes with them square (a one-way aisle isn’t a fire lane).';
    return note(f, 'Angled parking, as asked: ' + t.ang + '° stalls on ' + t.n + ' of the ' + of + ' parking aisles, made one-way (the arrows), neighbouring aisles running opposite ways' + (t.n < of ? '; the rest stay square on two-way aisles, ' + why : '.')); }
  return note(square(), word + ' was asked for, but this layout keeps square stalls on two-way aisles: ' + (!turnable ? 'its parking rows have no aisle of the field’s width that a two-way drive joins at both ends (a one-way aisle must, so cars never meet a dead end).' : late ? 'with its aisles one-way it fails a check the square layout passes (' + late.map(c => c.title || c.id).slice(0, 2).join('; ') + ').' : short && !broke ? 'angled stalls take more of a row than square ones, and with them the rows here can’t park the ' + p0.required + ' spaces required.' : 'turning its aisles one-way would break a check that passes now (a one-way aisle isn’t a fire lane: a building could be left beyond the fire lane’s reach, or the fire truck without its turns)' + (short ? ', or leave the parking short of the ' + p0.required + ' required.' : '.')));
}
// The parking-lot landscape standard (docs/LAYOUT-ENGINE.md item 38; scripts/parking-metrics.mjs landStd): a lot of
// LAND_MIN stalls or more plants about 5% of its interior and a shade tree every 10 stalls (Redmond, WA RZC 21.32;
// Chardon, OH ch. 1159). The rows' planted end caps and islands (a tree in each) as drawn, against the lot: the rows and
// the drives and lot paving within 26 ft of them (the metrics' lot), their union, the planted part included (lotArea;
// it doesn't change when a stall is planted, so it's measured once). { n, trees, sf, lot, meets }
export const LAND_MIN = 20, LAND_PCT = 5, LAND_PER_TREE = 10;
export function lotArea(els) {
  // the lot's paving on a 2 ft grid as scripts/parking-metrics.mjs measures it: the rows' cells, lot paving (field) cells,
  // and drive cells within 26 ft (13 grid steps, 4-neighbour) of a row; planted caps and islands left out (landStandard
  // adds them back for the whole lot)
  const rows = els.filter(e => e.kind === 'parking' && !e.rv && !e.vac && !e.future); if (!rows.length) return 0;
  const C = 2, R = 13, sh = e => S.outline(e), bb = r => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, y] of r) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } return [a, b, c, d]; };
  const rs = rows.map(sh), box = rs.map(bb).reduce((m, b) => [Math.min(m[0], b[0]), Math.min(m[1], b[1]), Math.max(m[2], b[2]), Math.max(m[3], b[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  const fl = els.filter(e => e.kind === 'field' && !e.future).map(sh), X0 = Math.min(box[0] - 30, ...fl.map(r => bb(r)[0])), Y0 = Math.min(box[1] - 30, ...fl.map(r => bb(r)[1])), X1 = Math.max(box[2] + 30, ...fl.map(r => bb(r)[2])), Y1 = Math.max(box[3] + 30, ...fl.map(r => bb(r)[3]));
  const nx = Math.ceil((X1 - X0) / C) + 1, ny = Math.ceil((Y1 - Y0) / C) + 1; if (nx * ny > 6e6) return 0; const g = new Uint8Array(nx * ny);
  const paint = (poly, bit) => { const [a, b, c, d] = bb(poly); for (let j = Math.max(0, Math.floor((b - Y0) / C)); j <= Math.min(ny - 1, Math.ceil((d - Y0) / C)); j++) for (let i = Math.max(0, Math.floor((a - X0) / C)); i <= Math.min(nx - 1, Math.ceil((c - X0) / C)); i++) if (!(g[j * nx + i] & bit) && S.inRing([X0 + (i + 0.5) * C, Y0 + (j + 0.5) * C], poly)) g[j * nx + i] |= bit; };
  for (const r of rs) paint(r, 1);
  const unpaint = poly => { const [a, b, c, d] = bb(poly); for (let j = Math.max(0, Math.floor((b - Y0) / C)); j <= Math.min(ny - 1, Math.ceil((d - Y0) / C)); j++) for (let i = Math.max(0, Math.floor((a - X0) / C)); i <= Math.min(nx - 1, Math.ceil((c - X0) / C)); i++) if (S.inRing([X0 + (i + 0.5) * C, Y0 + (j + 0.5) * C], poly)) g[j * nx + i] &= ~1; };
  for (const e of rows) { if (e.parallel) continue; let caps = [], isl = []; try { caps = S.capsOf(e); isl = S.islandsOf(e); } catch { caps = []; isl = []; } for (const c of caps) if (c.poly?.length >= 3) unpaint(c.poly); // (planted: not paving, and not where the 26 ft is measured from)
    if (isl.length) { const st = S.stalls(e), deg = (e.rot || 0) + (st.swap ? 90 : 0), u = [Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180)], v = [-u[1], u[0]], hw = S.stallPitch(e) / 2, hd = (e.sd || S.STALL.d) / 2; for (const q of isl) unpaint([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([a, b]) => [q[0] + u[0] * a + v[0] * b, q[1] + u[1] * a + v[1] * b])); } }
  for (const e of els) if (e.kind === 'drive' && !e.future) paint(sh(e), 2); for (const r of fl) paint(r, 4);
  const dist = new Int32Array(nx * ny).fill(1e9), q = []; for (let k = 0; k < g.length; k++) if (g[k] & 1) { dist[k] = 0; q.push(k); }
  for (let h = 0; h < q.length; h++) { const k = q[h], d = dist[k]; if (d >= R) continue; const i = k % nx, j = (k - i) / nx; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue; const m = b * nx + a; if (dist[m] > d + 1) { dist[m] = d + 1; q.push(m); } } }
  let n = 0; for (let k = 0; k < g.length; k++) { const v = g[k]; if (v & 1 || v & 4 || (v & 2 && dist[k] <= R)) n++; }
  return n * C * C;
}
export function landStandard(els, total = null) { // (total: the lot and its planted part, measured once where only plantings change)
  let n = 0, trees = 0, sf = 0;
  for (const e of els) { if (e.kind !== 'parking' || e.rv || e.vac || e.future) continue; let k = 0; try { k = S.stallCentres(e).length; } catch { k = 0; } n += k; if (e.parallel) continue;
    const ang = S.stallAng(e), dep = ang ? S.ANGLED[ang].d : (e.sd || S.STALL.d), pitch = S.stallPitch(e); let caps = [], isl = [];
    try { caps = S.capsOf(e); isl = S.islandsOf(e); } catch { caps = []; isl = []; }
    trees += caps.length + isl.length; sf += caps.reduce((t, c) => t + (c.poly?.length >= 3 ? Math.abs(S.ringArea(c.poly)) : 0), 0) + isl.length * pitch * dep; }
  const all = total ?? lotArea(els) + sf;
  return { n, trees, sf, total: all, meets: n < LAND_MIN || trees * LAND_PER_TREE >= n && sf >= (LAND_PCT + 0.2) / 100 * all };
}
// Stalls to spare spent on the landscape standard where a lot falls short of it: first planted end caps on the rows without them (two stalls a row, a tree each, the bare ends gone), then an
// island every 10th stall instead of every 13th (e.isle), longest rows first, while the lot is short and the parking stays
// at floor (what's required) or more. Square rows the engine laid out (lock / row) only. els changed in place.
function plantSpare(plan, els, p, pk, floor = p.required) {
  let st = landStandard(els); const lot = st.total; if (st.meets || p.provided <= floor) return { p, n: 0 };
  const cap = (plan.params?.style?.islands ?? 'square') === 'square' ? 'square' : true;
  const sq = e => e.kind === 'parking' && !e.parallel && !e.rv && !e.vac && !e.poly && !e.future && !S.stallAng(e) && (e.lock || e.row) && e.stallRot == null && +e.w > 0;
  const agree = c => S.stalls(c).count === S.stallCentres(c).length;
  const rows = () => els.filter(sq).map(e => ({ e, n: S.stalls(e).n })).sort((a, b) => b.n - a.n || String(a.e.id).localeCompare(String(b.e.id)));
  let caps = 0, isles = 0;
  const tryOne = (e, e2) => { if (!agree(e2) || S.stalls(e2).count >= S.stalls(e).count) return false; const i = els.indexOf(e); els[i] = e2; const p2 = pk(); if (p2.provided >= Math.max(floor, p2.required) && p2.required === p.required) { p = p2; st = landStandard(els, lot); return true; } els[i] = e; return false; };
  for (const { e, n } of rows()) { if (st.meets) break; if (e.caps || n < 8 || !e.islands && !e.lock && !e.row) continue; if (tryOne(e, { ...e, caps: cap })) caps++; }
  for (const { e, n } of rows()) { if (st.meets) break; if (!e.islands || S.isleOf(e) <= 10 || n < 10) continue; if (tryOne(e, { ...e, isle: 10 })) isles++; }
  const n = caps + isles; if (!n) return { p, n };
  return { p, n, note: 'Planting to the landscape standard (a tree every ' + LAND_PER_TREE + ' stalls, ' + LAND_PCT + '% of the lot planted): ' + [caps ? caps + ' parking row' + (caps > 1 ? 's' : '') + ' given planted ends' : '', isles ? isles + ' row' + (isles > 1 ? 's' : '') + ' an island every 10th stall' : ''].filter(Boolean).join(', ') + ', from stalls to spare (' + p.provided + ' for ' + p.required + ' required).' };
}
// Last in the run (after the end islands): a lot still short of the landscape standard spends its stalls to spare on it
// (plantSpare), never below what's required. Tried and taken out (item 38): pruneSurplus trimming the far ends only
// down to what planting would cost, or planting before it trims: more lots met the standard (49 -> 56 of 76) but the
// spare the later passes need went (a second way in became a gated lane and the layout lost its rank, MF-garden-max
// 204 -> 168 homes), or kept far stalls lengthened walks and moved rows into an entrance's throat.
export function plantToStandard(plan, o, brief) {
  if (!o?.elements?.length) return o;
  const els = o.elements.slice(), pk = () => V.quantities({ ...plan, elements: els, program: o.program || {} }, brief).parking, p = pk(); if (p.required == null) return o;
  const pl = plantSpare(plan, els, p, pk); if (!pl.n) return o;
  return { ...o, elements: els, tplNotes: [...(o.tplNotes || []), pl.note] };
}
export function pruneSurplus(plan, o, brief) {
  if (!o?.elements?.length) return o;
  const els = o.elements.slice(), isB = e => e.kind === 'building' && !e.future, B = () => els.filter(isB);
  const near = (e, list, d) => { const s = S.shapeOf(e); return list.some(b => S.gapBetween(s, S.shapeOf(b)) <= d); };
  const pk = () => V.quantities({ ...plan, elements: els, program: o.program || {} }, brief).parking;
  let p = pk(); if (p.required == null || p.provided <= p.required) return o;
  const rows = els.filter(e => e.kind === 'parking' && !e.rv && !e.vac && !near(e, B(), FAR_FT))
    .map(e => ({ e, d: Math.min(...B().map(b => S.gapBetween(S.shapeOf(e), S.shapeOf(b)))) })).sort((a, b) => b.d - a.d || String(a.e.id).localeCompare(String(b.e.id)));
  let cut = 0; const gone = []; // (the paving taken out: the lot's paving under it goes too)
  const stallsIn = e => { try { return S.stallCentres(e).length; } catch { return 0; } };
  for (const { e } of rows) { const n = stallsIn(e); if (p.provided - n < p.required) continue; els.splice(els.indexOf(e), 1); gone.push(S.shapeOf(e)); cut++; p = pk(); }
  // then the outer rows of a parking ring (no building within NEAR_FT), farthest first, while 5% to spare remains
  const outer = els.filter(e => e.kind === 'parking' && !e.rv && !e.vac && !near(e, B(), NEAR_FT)).map(e => ({ e, d: Math.min(...B().map(b => S.gapBetween(S.shapeOf(e), S.shapeOf(b)))) })).sort((a, b) => b.d - a.d || String(a.e.id).localeCompare(String(b.e.id)));
  for (const { e } of outer) { const n = stallsIn(e); if (p.provided - n < Math.ceil(p.required * 1.05)) continue; els.splice(els.indexOf(e), 1); gone.push(S.shapeOf(e)); cut++; p = pk(); }
  // then whole stalls off the far end of the rows (farthest from a building first), down to 3% to spare: a row keeps at
  // least MIN_ROW stalls, the land the stalls leave is landscape, the aisle beside it stays (it still runs its length)
  let trimmed = 0;
  { const want = () => Math.max(p.required, Math.ceil(p.required * (1 + TRIM_SPARE)));
    const cand = els.filter(e => e.kind === 'parking' && !e.poly && !e.rv && !e.vac && (e.lock || e.row) && e.stallRot == null && +e.w > 0)
      .map(e => ({ e, d: Math.min(...B().map(b => S.gapBetween(S.shapeOf(e), S.shapeOf(b)))) })).sort((a, b) => b.d - a.d || String(a.e.id).localeCompare(String(b.e.id)));
    for (const { e } of cand) {
      if (p.provided <= want()) break;
      const sw = S.stallPitch(e), n = Math.floor((e.w - (S.stallAng(e) ? S.angledDims(S.stallAng(e)).off : 0) + 0.01) / sw); // (an angled row: its stall's length along the aisle, less its slanted ends)
      { const i0 = els.indexOf(e); els.splice(i0, 1); const p0 = pk(); if (p0.provided >= p.required && p.provided - p0.provided <= p.provided - want() + MIN_ROW) { p = p0; gone.push(S.shapeOf(e)); cut++; continue; } els.splice(i0, 0, e); } // (a short row the surplus nearly covers goes whole, not left a stub)
      if (n <= MIN_ROW) continue;
      const r = (e.rot || 0) * Math.PI / 180, u = [Math.cos(r), Math.sin(r)], ends = [1, -1].map(sg => [e.x + u[0] * sg * e.w / 2, e.y + u[1] * sg * e.w / 2]);
      const dot = q => [[q[0] - 0.5, q[1] - 0.5], [q[0] + 0.5, q[1] - 0.5], [q[0] + 0.5, q[1] + 0.5], [q[0] - 0.5, q[1] + 0.5]], far = ends.map(q => Math.min(...B().map(b => S.gapBetween(dot(q), S.shapeOf(b)))));
      const sg = far[0] >= far[1] ? 1 : -1, i = els.indexOf(e);
      for (let k = Math.min(n - MIN_ROW, p.provided - want()); k >= 1; k--) {
        const w2 = +(e.w - k * sw).toFixed(2), sh = -sg * k * sw / 2, e2 = { ...e, w: w2, x: +(e.x + u[0] * sh).toFixed(2), y: +(e.y + u[1] * sh).toFixed(2) };
        els[i] = e2; const p2 = pk(); if (p2.provided >= p.required) { p = p2; trimmed += k; const L = k * sw, c = [e.x + u[0] * sg * (e.w - L) / 2, e.y + u[1] * sg * (e.w - L) / 2]; gone.push(S.shapeOf({ ...e, id: undefined, w: L, x: c[0], y: c[1] })); break; } els[i] = e;
      }
    } }
  if (!cut && !trimmed) return o;
  const { all, dropped } = afterCut(els, gone, cut, B);
  return { ...o, elements: all, tplNotes: [...(o.tplNotes || []), ...(cut ? [cut + ' parking row' + (cut > 1 ? 's' : '') + (dropped ? ' and ' + dropped + ' drive' + (dropped > 1 ? 's' : '') : '') + ' no building uses taken out (left as landscape): the parking left still meets what’s required.'] : []), ...(trimmed ? [trimmed + ' surplus space' + (trimmed > 1 ? 's' : '') + ' taken off the far ends of parking rows (left as landscape): ' + p.provided + ' for ' + p.required + ' required.'] : [])] };
}
// a lower bound on the land a program needs: the footprint alone at its most floors, against the land inside the
// setbacks. Only a proof when it fails by a margin: buildings need drives and parking besides.
function infeasibleBound(brief) {
  const ring = brief.site.ring, sb = { ...S.SETBACKS, ...(brief.rules?.values?.setbacks?.v || {}) };
  let land; try { const inner = S.insetRing(ring, ring.map(() => Math.min(+sb.side || 0, +sb.front || 0, +sb.rear || 0))); land = inner?.length >= 3 ? S.ringArea(inner) : S.ringArea(ring); } catch { land = S.ringArea(ring); }
  land -= (brief.site.exclusions || []).reduce((s, x) => s + S.ringArea(x.ring), 0) + (brief.site.holes || []).reduce((s, h) => s + S.ringArea(h), 0);
  let need = 0; const why = [];
  for (const u of brief.program.uses) {
    const q = u.quantity, n = q.mode === 'range' ? q.min : q.mode === 'maximize' || q.mode === 'max' ? 0 : q.value; if (!n) continue;
    const floors = Math.max(u.floors || 0, { multifamily: 5, townhomes: 4, duplex: 2, sfr: 3 }[u.use] || 1);
    const sfEach = q.unit === 'units' ? ({ multifamily: 400, townhomes: 600, duplex: 600, sfr: 600 }[u.use] || 400) : 1;
    if (q.unit === 'buildings') continue;
    const foot = n * sfEach / floors; need += foot; why.push(u.use + ': at least ' + Math.round(foot).toLocaleString('en-US') + ' sf of footprint (' + n + ' ' + q.unit + ' at ' + floors + ' floors, ' + sfEach + ' sf each)');
  }
  return need > land ? { need: Math.round(need), land: Math.round(land), why } : null;
}

// rank: feasible first; then the program met; then fewer unknowns; then the yield the brief maximizes; then less paving;
// then the geometry hash (a fixed, arbitrary tie-break)
// The walk from the parking (docs/LAYOUT-ENGINE.md item 36): the 90th-percentile stall's distance to the nearest wall of
// a building it serves (the clubhouse, garages and future pads left out; scripts/parking-metrics.mjs walk90), ft.
export const WALK_FAR = 200;
export function walkP90(els) {
  const B = els.filter(e => e.kind === 'building' && !e.future && !e.ghost && e.use !== 'garage'), served = B.filter(e => e.use !== 'amenity'), bl = (served.length ? served : B).map(e => S.outline(e)); if (!bl.length) return 0;
  const bb = bl.map(r => { const xs = r.map(p => p[0]), ys = r.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }), ds = [];
  for (const e of els) { if (e.kind !== 'parking' || e.rv || e.vac || e.future) continue; let cs = []; try { cs = S.stallCentres(e); } catch { cs = []; }
    for (const p of cs) { let m = Infinity; bl.forEach((r, i) => { const b = bb[i]; if (Math.hypot(Math.max(b[0] - p[0], 0, p[0] - b[2]), Math.max(b[1] - p[1], 0, p[1] - b[3])) >= m) return; for (let k = 0; k < r.length; k++) m = Math.min(m, S.segDist(p, r[k], r[(k + 1) % r.length])); }); ds.push(m); } }
  if (!ds.length) return 0; ds.sort((a, b) => a - b); return ds[Math.min(ds.length - 1, Math.floor(0.9 * (ds.length - 1) + 0.5))];
}
function rankKey(o, brief) {
  const v = o.validation, prog = v.checks.filter(c => c.id.startsWith('program.u')), met = prog.filter(c => c.status === 'pass').length;
  const maxi = brief.program.uses.filter(u => ['maximize', 'min', 'max', 'range'].includes(u.quantity.mode)); // more is better up to any cap (a cap's excess already fails the program check)
  const yieldV = maxi.reduce((s, u) => s + (u.quantity.unit === 'units' ? o.quantities.byUse[u.use]?.units || 0 : o.quantities.byUse[u.use]?.gfa || 0), 0);
  const typeLanes = o.elements.filter(e => e.kind === 'drive' && SITE.QUEUE_TYPES[e.queue] && Array.isArray(e.path)).reduce((s, e) => s + (+e.width || 12) * e.path.slice(1).reduce((t, p, i) => t + Math.hypot(p[0] - e.path[i][0], p[1] - e.path[i][1]), 0), 0); /* (a building type's own lanes, lib/btsite.mjs: what the type needs, not paving that ranks a layout down) */
  const paving0 = (o.quantities.pavedSfGross - typeLanes) / Math.max(1, o.quantities.totals.units || o.quantities.totals.gfa / 1000 || 1);
  const paving = paving0 * (1 + Math.max(0, walkP90(o.elements) - WALK_FAR) / 200); /* (stalls far from the doors: each 2 ft the 90th-percentile walk runs past 200 ft weighs as 1% more paving, so of layouts holding the same, the one with the field by the buildings wins unless it paves much more; item 36) */
  // the form asked for, delivered: a courtyard request ranks its courtyard layouts above plain bars (other forms are
  // drawn by their own engine path and always are what was asked)
  const formMiss = brief.program.uses.filter(u => u.form === 'mf-cottage-btr' && o.elements.filter(e => e.cottage).length >= 12 && !o.elements.some(e => e.kind === 'building' && e.use === 'amenity') || u.form === 'mf-courtyard' && !o.elements.some(e => e.court) || u.form === 'mf-wrap' && !o.elements.some(e => e.wrap && e.kind === 'garage') || u.form === 'mf-tuck-under' && !o.elements.some(e => +e.tuck > 0) || u.form === 'ind-cross-dock' && !o.elements.some(e => e.kind === 'building' && e.crossDock) || u.form === 'mf-podium-courtyard' && !o.elements.some(e => e.upper === 'U') || u.form === 'ret-drive-through' && !o.elements.some(e => e.kind === 'drive' && (e.windowAt || /drive-thru/i.test(e.name || '')))).length; // (the form asked for: a courtyard's wings, a drive-thru's lane)
  // a second way in that's a real entrance beats a gated emergency lane (the lane is the fire official's call, and where
  // it meets a side or rear line, an easement from the neighbour)
  const lane = o.elements.some(e => e.emergency) ? 1 : 0;
  const placeMiss = (o.placements || []).filter(c => c.status === 'fail').length; // (where things were asked to go: a layout meeting more of it first)
  const paired = o.elements.reduce((t, e) => t + (e.kind === 'building' && +e.combined > 0 ? +e.combined : 0), 0); /* (an exact count met in whole stacks before one met by combining homes into larger ones, lib/bldgtemplates.mjs) */
  const off = brief.program.uses.filter(u => u.quantity.mode === 'exact' && u.quantity.unit === 'units' && u.quantity.value > 0).reduce((t, u) => t + Math.round(Math.abs((o.quantities.byUse[u.use]?.units || 0) - u.quantity.value) / u.quantity.value * 1000), 0); /* (an exact count no layout reaches: the nearest first) */
  const qMiss = (v.checks.find(c => c.id === 'queues.stack.types' || c.id === 'queues.stack' && c.measured && typeof c.measured === 'object')?.features || []).length; /* (a building type's queues not drawn or short, lib/btsite.mjs: a layout holding more of them first; 0 on a plan with none) */
  const drawnQ = o.elements.filter(e => e.kind === 'drive' && SITE.QUEUE_TYPES[e.queue]).length; /* (a building type's lanes drawn: at the same yield, the layout with its porte-cochère or drop-off first, item 37) */
  return [v.feasible ? 0 : 1, -met, off, formMiss, placeMiss, v.counts.fail, qMiss, v.counts.unknown, lane, paired, -yieldV, -drawnQ, Math.round(paving), o.geometryHash];
}
export const rankOf = rankKey;
const cmp = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; };

// "As many as fit" apartments: the generator's arrangements (lib/sitegen.mjs generate) are drawn full and parked down,
// at the template's building sizes, so as many as fit sees the same layouts an exact count does. (Before, the generator
// sat out when no count was asked, and its bars ignored the template's sizes, so which counts passed jumped with the
// count asked and an exact-count ladder after the search worked round it, at 2-3 s a request; no longer needed.)
// the reserve run (item 37): does option o lack a lane its type needs (the lanes drawn as the run draws them)?
function lanesMissing(E, o, RES) {
  const prog0 = BT.withType(o.program || E.program, E.program); let f; try { f = SITE.siteFeatures(E.plan, BT.tagElements(o.elements, prog0), prog0); } catch { return false; }
  return RES.some(r => !f.els.some(e => e.kind === 'drive' && e.queue === (/^hotel/.test(r.btype) ? 'porte' : 'daycare')));
}
// the engine's program with the stalls each lane in place of a parking row takes laid out to spare (a single type's
// ratio, a zone's parking factor)
function reserveEngine(E, RES) {
  const E3 = { ...E, program: { ...E.program }, opts: { ...E.opts } }, P = E3.program;
  for (const r of RES) {
    if (r.zone == null) { const cp = P.custom?.parking, ratio = +P.ratio > 0 ? +P.ratio : S.USES[P.use]?.ratio || 3, need = cp && +cp.rate > 0 && +cp.basis > 0 ? cp.rate * cp.basis : (+P.gfa || 0) / 1000 * ratio, f = 1 + r.stalls / Math.max(10, need);
      P.ratio = +(ratio * f).toFixed(4); if (cp && +cp.rate > 0) P.custom = { ...P.custom, parking: { ...cp, rate: +(cp.rate * f).toFixed(4) } }; }
    else { const z = (P.zones || [])[r.zone] || {}, need = (+z.gfa || 0) / 1000 * (S.USES[z.use]?.ratio || 3) * (+E.opts.parkF?.[z.use] || 1), f = 1 + r.stalls / Math.max(10, need); E3.opts.parkF = { ...(E3.opts.parkF || {}), [z.use]: +((+E3.opts.parkF?.[z.use] || 1) * f).toFixed(4) }; }
  }
  return E3;
}
// the reserve run's lanes, drawn before the parking is trimmed to the need (a lane in place of a row where none reaches a
// drive over open ground); the run's own pass after the layout then finds them drawn
function earlyLanes(E, o) {
  const prog0 = BT.withType(o.program || E.program, E.program); let f; try { f = SITE.siteFeatures(E.plan, BT.tagElements(o.elements, prog0), prog0, { rowLane: true }); } catch { return o; }
  return f.els === o.elements ? o : { ...o, elements: f.els, tplNotes: [...(o.tplNotes || []), ...f.notes.filter(n => !/\bno (?:room|open ground)\b/i.test(n))] }; // (what it couldn't draw is said by the run's own pass)
}
export function runBrief(briefIn, { now = null } = {}) {
  const check = B.validateBrief(briefIn), base = { schema: RUN_SCHEMA, versions: versions(), created: now, request: briefIn?.request || null };
  if (!check.ok) return { ...base, outcome: check.missing.length ? 'missing-information' : 'invalid-brief', problems: check.errors, warnings: check.warnings, options: [] };
  const brief = B.canonicalBrief(briefIn), inputHash = B.inputHash(brief);
  const rec = { ...base, inputHash, brief, warnings: check.warnings };
  // forms the engine can't draw: say so, don't draw something else
  const bad = brief.program.uses.filter(u => u.form && (!CAPS[u.form] ? !FORMLESS_OK.includes(u.form) : CAPS[u.form].status === 'unsupported'));
  if (bad.length) return { ...rec, outcome: 'unsupported', problems: bad.map(u => ({ path: 'program.uses.' + u.id + '.form', msg: (CAPS[u.form]?.label || u.form) + ': ' + (CAPS[u.form]?.note || 'not supported') })), options: [] };
  const partial = brief.program.uses.filter(u => CAPS[u.form]?.status === 'partial').map(u => CAPS[u.form].label + ' is partial: ' + (CAPS[u.form].note || ''));
  const bound = infeasibleBound(brief);
  if (bound) return { ...rec, outcome: 'proven-infeasible', problems: [{ path: 'program', msg: 'The program needs at least ' + bound.need.toLocaleString('en-US') + ' sf of building footprint; the land inside the setbacks is ' + bound.land.toLocaleString('en-US') + ' sf.' }], bound, options: [] };
  // an exact (or capped) apartment count: first the engine asked for just that, which leaves no buildings to trim (and no
  // empty parking where they stood); when that comes up short, again asked for a little more, trimmed by whole modules.
  // Both sets are ranked together by the validator.
  const capped = brief.program.uses.some(u => u.use === 'multifamily' && ['exact', 'max', 'range'].includes(u.quantity.mode));
  const E = B.toEngine(brief, { overshoot: !capped });
  const asks = I.asksFor(brief.program.placements, E.plan), steer = new Set((asks?.list || []).map(p => p.id)); /* (where things were asked to go that the generators have no control for: the candidates compared on them, lib/layoutintent.mjs) */
  const lay1 = Ex => { let out; try { out = layoutOptions(Ex.plan, Ex.program, asks ? { ...Ex.opts, asks } : Ex.opts) || []; } catch (e) { out = [{ error: String(e && e.message || e) }]; } return out; };
  const short = list => brief.program.uses.some(u => { if (u.use !== 'multifamily' || !['exact', 'range', 'max'].includes(u.quantity.mode)) return false; const need = u.quantity.mode === 'range' ? u.quantity.min : u.quantity.mode === 'max' ? Math.floor(u.quantity.value * 0.9) : u.quantity.value; // (at most: well under the cap is worth a second try)
    const units = o => T.templatesFor(u.form, u).length ? o.elements.filter(e => e.template && e.tplUse === u.id).reduce((t, e) => t + e.units, 0) : o.elements.filter(e => e.kind === 'building' && (e.use || o.program?.use) === 'multifamily' && (u.zone == null || e.zone == null || e.zone === u.zone)).reduce((t, e) => t + (+e.units || 0), 0);
    return !list.some(o => !o.error && o.elements?.length && units(o) >= need && !o.elements.some(e => +e.combined > 0)); }); /* (met only by combining homes into larger ones: the fuller retry is still looked for, lib/bldgtemplates.mjs) */
  const { value: raw, stats } = CX.deterministic({ seed: brief.solver.seed, tickMs: brief.solver.tickMs }, () => {
    const wrapNote = 'No wrap fits this site: the garage a wrap needs (about 130 ft across and 120 ft deep inside the wings, with its ramp and cores) doesn’t fit with the wings round it, so these are the nearest layouts; on a small lot a courtyard on a parking podium ("courtyard on a podium") holds more.';
    const noWrap = o => brief.program.uses.some(u => u.form === 'mf-wrap') && !o.elements?.some(e => e.wrap && e.kind === 'garage') ? { ...o, tplNotes: [...(o.tplNotes || []), wrapNote] } : o; // (a wrap asked for that the site can't hold: said, not swapped silently)
    const fit = (Ex, out, br = brief, pre = null) => out.map(o => o.error ? o : noWrap(o)).map(o => { if (o.error) return o; o = podiumLevels(o); o = keepIfNoWorse(Ex.plan, o, joinCourtyard(Ex.plan, o, br), br); o = keepIfNoWorse(Ex.plan, o, oneAmenityCentre(Ex.plan, o), br); o = keepIfNoWorse(Ex.plan, o, courtGardens(Ex.plan, o), br); o = keepIfNoWorse(Ex.plan, o, nudgeAmenities(Ex.plan, o), br); o = keepIfNoWorse(Ex.plan, o, I.placeAmenities(Ex.plan, o, br.program.placements, o.program || Ex.program), br); o = exactByUnitSize(Ex.plan, o, br); const t = T.fitParking(T.trimHomes(T.applyTemplates(Ex.plan, o, br), br), els => V.quantities({ ...Ex.plan, elements: els, program: o.program || Ex.program }, br).parking); const tc = keepIfNoWorse(Ex.plan, t, cottageCommons(Ex.plan, t), br), tdw = keepIfNoWorse(Ex.plan, tc, homeDriveways(Ex.plan, tc), br), tf = keepIfNoWorse(Ex.plan, tdw, shutInFuture(Ex.plan, tdw), br), tp = keepIfNoWorse(Ex.plan, tf, playNearHomes(Ex.plan, tf), br), t0 = keepIfNoWorse(Ex.plan, tp, pondBesideWork(Ex.plan, tp), br), t1 = keepIfNoWorse(Ex.plan, t0, tidyPonds(Ex.plan, t0), br); const last = t1x => { const t2 = keepIfNoWorse(Ex.plan, t1x, pruneSurplus(Ex.plan, t1x, br), br); const t2g = garageEntries(Ex.plan, t2), t3 = keepIfNoWorse(Ex.plan, t2g, addSecondAccess(Ex.plan, t2g, br), br); const t4 = t3 === t2g ? t3 : keepIfNoWorse(Ex.plan, t3, tidyPonds(Ex.plan, t3), br); const t5 = keepIfNoWorse(Ex.plan, t4, addEmergencyAccess(Ex.plan, t4, br), br), t6 = keepIfNoWorse(Ex.plan, t5, curbReturns(Ex.plan, t5, br), br); const t7 = keepIfNoWorse(Ex.plan, t6, podiumTrim(Ex.plan, t6, br), br); const t8 = keepIfNoWorse(Ex.plan, t7, trailsClear(Ex.plan, t7), br), t8d = keepIfNoWorse(Ex.plan, t8, rowsAlongDrives(Ex.plan, t8, br), br), t9 = keepIfNoWorse(Ex.plan, t8d, aisleTurnarounds(Ex.plan, t8d, br), br), t9g = keepIfNoWorse(Ex.plan, t9, growEndIslands(Ex.plan, t9, br), br), t10 = keepIfNoWorse(Ex.plan, t9g, rowEndIslands(Ex.plan, t9g, br), br), t10f = keepIfNoWorse(Ex.plan, t10, fundEndIslands(Ex.plan, t10, br), br), t10l = keepIfNoWorse(Ex.plan, t10f, plantToStandard(Ex.plan, t10f, br), br); return vaultWhereNoPond(Ex.plan, garageVent(t10l), br); }; return angleMixed(Ex.plan, pre ? pre(t1) : t1, br, last); }); // (angled parking asked on a mixed plan: tried here, each try finished by the passes after) // (a pond cut back for a way in: its new corners tidied too) // building schedules from the templates, then parking met, inside the run
    let got = fit(E, lay1(E));
    if (capped && short(got)) { const E2 = B.toEngine(brief); E2.opts = { ...E2.opts, deeper: false }; got = got.concat(fit(E2, lay1(E2))); } // (the retry looks for a fuller layout: no deeper-pond copies of it)
    // a building type's lanes the layouts left no room for (a hotel's porte-cochère, a daycare's drop-off): laid out again
    // with the stalls a lane in place of a parking row takes to spare, the lanes drawn before the parking is trimmed to the
    // need (docs/LAYOUT-ENGINE.md item 37); kept only where it costs the program nothing (below)
    const RES = SITE.laneReserve(E.program);
    if (RES.length && got.filter(o => !o.error && o.elements?.length).slice(0, 1).some(o => lanesMissing(E, o, RES))) { const E3 = reserveEngine(E, RES); got = got.concat(fit(E3, lay1(E3), brief, o => earlyLanes(E, o)).map(o => o.error ? o : { ...o, reserve: true })); }
    return got;
  });
  const err = raw.find(o => o.error);
  const options = raw.filter(o => o.elements?.length).map((o, i) => {
    const prog0 = BT.withType(o.program || E.program, E.program), feat = SITE.siteFeatures(E.plan, BT.tagElements(o.elements, prog0), prog0), elements = canonElements(drawnAreas(feat.els, prog0)), /* (BT.tagElements: a building type's buildings named and counted; SITE.siteFeatures: the stacking lanes or yard it needs, drawn in its envelope; no type: unchanged) */ sp = E.plan.params?.storm && typeof E.plan.params.storm === 'object' ? E.plan.params.storm : {}, lay = { ...E.plan, ...(o.pondDepth ? { params: { ...(E.plan.params || {}), storm: { ...sp, depth: o.pondDepth } } } : {}), elements, program: o.program || E.program }; // (a deeper-pond option is judged at the depth it assumes)
    const validation = V.validateLayout(lay, brief);
    // where things were asked to go: each ask measured on the drawing and said in the notes, met or not (never dropped)
    const asked = (brief.program.placements || []).map(p => ({ ...I.checkPlacement(lay, elements, o.program || E.program, p), how: p.how || 'checked' }));
    const { elements: _e, notes: _n, tplNotes: _t, error: _x, ...engine } = o; // the engine's own fields (score, recipe, frame…), kept for the editor
    return { ...engine, id: 'opt-' + (i + 1), engineOrder: i, name: o.name || 'Layout ' + (i + 1), geometryHash: geometryHash(elements), elements, program: o.program || E.program, params: o.params || E.plan.params, recipe: o.recipe ?? null, zones: o.zones || [], quantities: validation.quantities, validation, placements: asked,
      notes: [...(brief.request?.assumed || []).map(a => /^(?:No (?:use|count|size)|Mixed use)/.test(a) ? 'Assumed: ' + a : a), ...asked.map(c => c.said + (c.status === 'fail' ? ' ' + (c.how === 'checked' && !steer.has(c.id) ? 'The engine has no control for this yet: it is measured and said here, not placed; move it by hand or say where else it may go.' : c.how === 'checked' ? 'The engine looked for layouts with it there; this one doesn’t have it (another option may say what having it costs).' : 'The engine was told, but this layout couldn’t fit it there; another option may.') : '')), ...BT.presetNotes(o.notes || [], prog0), ...(o.tplNotes || []), ...BT.typeNotes(prog0, elements), ...feat.notes, ...simpleShort(o, validation)] };
  });
  { // (the reserve run's options: only those that drew a lane the type needs and cost the program nothing next to the plain ones)
    const yieldOf = o => o.quantities.totals.units || o.quantities.totals.gfa / 1000, plain = options.filter(o => !o.reserve), pass = plain.filter(o => o.validation.status === 'pass'), top = Math.max(0, ...(pass.length ? pass : plain).map(yieldOf));
    for (let i = options.length - 1; i >= 0; i--) { const o = options[i]; if (!o.reserve) continue; if (!o.elements.some(e => e.kind === 'drive' && /^(?:porte|daycare)$/.test(e.queue || '')) || pass.length && o.validation.status !== 'pass' || yieldOf(o) < top - 1e-6) options.splice(i, 1); } }
  options.sort((a, b) => cmp(rankKey(a, brief), rankKey(b, brief)));
  options.forEach((o, i) => { o.rank = i + 1; });
  // the options handed back differ in substance: one with the same numbers as a kept one (a mirror image, the same
  // buildings shuffled) is left out, and so is a feasible one yielding under 60% of the best feasible one; better fewer
  // options than padding (a capped request's 24-unit layout beside 144-unit ones)
  const sig = o => [o.quantities.totals.units, Math.round(o.quantities.totals.gfa / 100), o.quantities.parking.provided, o.quantities.totals.buildings].join('|');
  const yieldOf = o => o.quantities.totals.units || o.quantities.totals.gfa / 1000, best = Math.max(0, ...options.filter(o => o.validation.feasible).map(yieldOf));
  const keep = [], seen = new Set();
  // and a variety of arrangements: no more than two of one arrangement (the name before its first ' · ') while another
  // arrangement that passes is left out (the upward probe of as many as fit can bring several of the same rows)
  const arr = o => String(o.name || '').split(' · ')[0], ok = o => !(best && o.validation.feasible && yieldOf(o) < 0.6 * best) && !(options.some(x => x.quantities.totals.units > 0) ? !(o.quantities.totals.units > 0) : best > 0 && !(yieldOf(o) > 0)); // (an option with nothing built in it, beside ones that build: left out; homes asked for, an option with none)
  const others = o => options.some(x => x !== o && !keep.includes(x) && arr(x) !== arr(o) && ok(x) && x.validation.status === 'pass' && !seen.has(sig(x)));
  for (const o of options) { if (keep.length >= brief.solver.options) break; const k = sig(o); if (seen.has(k)) continue; if (!ok(o)) continue; if (keep.filter(x => arr(x) === arr(o)).length >= 2 && others(o)) continue; seen.add(k); keep.push(o); }
  keep.forEach((o, i) => { o.rank = i + 1; });
  askTradeNotes(keep, brief);
  const outcome = !keep.length ? 'no-feasible-found' : keep.some(o => o.validation.status === 'pass') ? 'feasible' : keep.some(o => o.validation.feasible) ? 'needs-review' : 'no-feasible-found';
  return { ...rec, outcome, optimality: 'best found (heuristic search; not proven optimal)', engineMapping: E.mapping, partial, engineError: err?.error || null,
    solver: { seed: brief.solver.seed, tickMs: brief.solver.tickMs, evaluation: stats, candidates: options.length },
    rankingHash: hashOf(keep.map(o => [o.rank, o.geometryHash])), options: keep };
}

// a simple layout (lib/sitelayout.mjs fallback: the zone layouts didn't fit) short of the parking the brief requires: said
// plainly, against the rule that governs (the engine's own note counts its use defaults; docs/LAYOUT-ENGINE.md item 33)
function simpleShort(o, v) {
  const q = v.quantities.parking, c = v.checks.find(x => x.id === 'parking.count'); if (!/^Simple layout/.test(o.name || '') || c?.status !== 'fail' || q.required == null) return [];
  return ['A simple layout: the zone layouts don’t fit this site with what it must hold. It parks ' + q.provided + ' of the ' + q.required + ' spaces required (' + S.spacesWord(q.required - q.provided) + ' short' + (q.rule ? '; ' + String(q.rule).replace(/\.$/, '') : '') + '), so it fails the parking check: less floor area, structured parking or a bigger site would park it.'];
}
// where things were asked to go, across the options handed back: an option missing an ask that another option meets
// says which one and what it gives up there (fewer homes or less floor area, a check it fails); an option meeting one
// that a fuller option misses says what meeting it costs. Notes only: the ranking is rankKey's.
function askTradeNotes(keep, brief) {
  const L = brief.program.placements || []; if (!L.length || keep.length < 2) return;
  const size = o => o.quantities.totals.units ? o.quantities.totals.units + ' homes' : Math.round(o.quantities.totals.gfa).toLocaleString('en-US') + ' sf', yieldOf = o => o.quantities.totals.units || o.quantities.totals.gfa || 0;
  const met = (o, p) => (o.placements || []).find(c => c.id === p.id)?.status === 'pass', progMet = o => o.validation.checks.filter(c => c.id.startsWith('program.u')).every(c => c.status === 'pass');
  for (const o of keep) for (const p of L) {
    const name = I.describe(p).replace(/^Asked: /, '');
    if (!met(o, p)) { const q = keep.find(x => x !== o && met(x, p)); if (!q) continue;
      const why = !progMet(q) ? 'it holds ' + size(q) + ', short of the program' : !q.validation.feasible ? 'it fails a hard check' : yieldOf(q) < yieldOf(o) - 0.5 ? 'it holds ' + size(q) + ' to this one’s ' + size(o) : q.rank > o.rank ? 'it ranks lower on the other checks' : '';
      o.notes.push('Option ' + q.rank + ' has ' + name + (why ? ' (' + why + ')' : '') + '.'); }
    else if (o.rank === 1) { const q = keep.find(x => x !== o && !met(x, p) && x.validation.feasible && yieldOf(x) > yieldOf(o) + 0.5); if (q) o.notes.push('Placed as asked (' + name + '): option ' + q.rank + ', without it, holds ' + size(q) + ' to this one’s ' + size(o) + '.'); }
  }
}

// The fields that must match on replay (the record's creation time and notes' wording may differ)
const essence = r => ({ outcome: r.outcome, inputHash: r.inputHash, versions: r.versions, rankingHash: r.rankingHash, options: (r.options || []).map(o => ({ rank: o.rank, geometryHash: o.geometryHash, quantities: hashOf(o.quantities), validation: hashOf(o.validation.checks.map(c => [c.id, c.status, c.measured])) })) });
export function replayRun(saved) {
  const again = runBrief(saved.brief || saved), a = essence(saved), b = essence(again), diffs = [];
  if (a.outcome !== b.outcome) diffs.push('outcome ' + a.outcome + ' → ' + b.outcome);
  if (hashOf(a.versions) !== hashOf(b.versions)) diffs.push('versions changed: ' + JSON.stringify(a.versions) + ' → ' + JSON.stringify(b.versions));
  if (a.inputHash !== b.inputHash) diffs.push('input hash');
  if (a.rankingHash !== b.rankingHash) diffs.push('ranking');
  a.options.forEach((o, i) => { const p = b.options[i]; if (!p) diffs.push('option ' + o.rank + ' missing'); else { if (o.geometryHash !== p.geometryHash) diffs.push('option ' + o.rank + ' geometry'); if (o.quantities !== p.quantities) diffs.push('option ' + o.rank + ' quantities'); if (o.validation !== p.validation) diffs.push('option ' + o.rank + ' checks'); } });
  return { identical: !diffs.length, diffs, record: again };
}

// a compact summary for an API response or a log line
export function summary(rec) {
  return { outcome: rec.outcome, inputHash: rec.inputHash?.slice(0, 16), problems: rec.problems || [], options: (rec.options || []).map(o => ({ rank: o.rank, name: o.name, status: o.validation.status, failed: o.validation.failed, unresolved: o.validation.unresolved, units: o.quantities.totals.units, gfa: o.quantities.totals.gfa, parking: { provided: o.quantities.parking.provided, required: o.quantities.parking.required }, geometryHash: o.geometryHash.slice(0, 16) })) };
}

// The site plan editor's Build (src/siteplan.js, through src/sp-worker.js): the plan, program and search settings it
// hands the engine, made into a brief and run, so the editor's layouts are run records too. What a size means follows
// the plan's Leftover land setting (fill or phase: at least that much; hold: exactly that much). Returns the options in
// the shape lib/sitelayout.mjs layoutOptions gives, each with its independent check (check) and run (run, with the brief
// to replay it).
export const ENGINE_OPT_KEYS = ['count', 'deeper', 'brief', 'parcels', 'perParcel', 'keepout', 'netEvals', 'depth', 'budgetMs', 'pod', 'podBudgetMs', 'netBudgetMs'];
// The jurisdiction's parking rule governs (a plan inside a city or ETJ whose planning guardrails are on, lib/guardrails.mjs:
// Waller's two spaces a home, Ord. 424, with the 5% count reserve): the brief's parking rule is raised to it, so the run
// lays out to that count and the independent validator's parking.count judges against it (before, a run from the app or
// the MCP site_plan path laid apartments out at the engine's 1.6 a home and passed its own check while the city's count
// was short). A rule the brief already sets higher stands. Changes b in place.
// Idempotent (Nov 5, item 33): the app and the MCP hand runPlan the guardrails' effective plan and program already
// (G.forLayout: the program's ratios carry the count reserve), so a plan marked __guard is taken as it is, never factored
// again (it was: 2.205 a home, the 5% twice), and a brief once governed is marked (rules.guarded) and left alone.
// Mixed use is governed use by use (rules.parkingByUse; before, the program's one top-level ratio was laid on every use
// counted by floor area: a 120-key hotel judged at the retail ratio, 362 spaces for 212): apartments at the city's two a
// home, a hotel by its keys at its type's rule (lib/btypes.mjs perKey; one a key), shops, offices and the rest at their
// use's ratio (the city has no verified commercial ratio: the engine's working number), each with the city's reserve.
// Homes with garages (townhomes, duplexes, houses) keep their own rule, as the effective plan does.
export function governingParking(b, plan, program) {
  if (!plan || b.rules?.guarded) return b;
  const pre = !!plan.__guard; // (already the effective plan: its program's numbers include the reserve)
  if (!pre && !G.isOn({ ...plan, program })) return b;
  let e; if (pre) e = { ...plan, program: program || plan.program }; else try { e = G.effective({ ...plan, program, __guard: undefined }); } catch { return b; }
  if (!e?.program || !e.__guard) return b;
  const R = b.rules.values, base = S.normalizeProgram(program || {}), cf = +e.__guard.cf || 1, why = 'Jurisdiction planning guardrails (' + (G.WALLER?.name || 'City of Waller') + ')', res = cf > 1 ? ', with the ' + Math.round((cf - 1) * 100) + '% count reserve' : '';
  b.rules.guarded = { profile: e.__guard.profile || 'waller', cf };
  const kinds = [...new Set(b.program.uses.map(u => u.use).filter(u => u !== 'amenity' && u !== 'garage'))];
  if (kinds.length > 1) { // mixed use: each use by its own rule
    const r4 = x => Math.round(x * 1e4) / 1e4, P = program || {}, zones = Array.isArray(P.zones) ? P.zones : [], by = {}, src = [];
    for (const u of b.program.uses) {
      const z = u.zone != null ? zones[u.zone] : null, bt = (P.btZones || []).find(x => x.zone === u.zone), pre0 = bt ? BT.presetOf(bt.btype) : null, U = S.USES[u.use] || {};
      if (u.use === 'multifamily') { const v = r4(Math.max(S.normalizeProgram({ use: 'multifamily' }).perUnit, G.WALLER.mf.perUnit.value) * cf); if (!(by.multifamily?.perUnit >= v)) by.multifamily = { perUnit: v }; }
      else if (U.garage) continue; // (homes park in their garages and driveways: their own rule, no stall reserve)
      else if (u.use === 'hotel') { const pk = +pre0?.params?.perKey || 1, sk = +pre0?.params?.sfPerKey || (U.ratio > 0 ? 1000 / U.ratio : 550), v = { perKey: r4(pk * cf), sfPerKey: sk, per1000: r4(1000 / sk * pk * cf) }; if (!(by.hotel?.per1000 >= v.per1000)) by.hotel = v; }
      else if (bt?.rule?.key === 'parkingPer1000' && +bt.rule.v >= 0) { const v = r4(+bt.rule.v * cf); if (!(by[u.use]?.per1000 >= v)) by[u.use] = { per1000: v, type: bt.btype }; } // (a zone of a building type at its type's rule with the city's reserve: a bank zone like a bank, not the restaurant pad it is laid out as)
      else { const v = r4((+z?.ratio > 0 ? +z.ratio : U.ratio ?? 3) * cf); if (!(by[u.use]?.per1000 >= v)) by[u.use] = { per1000: v }; }
    }
    for (const [u, r] of Object.entries(by)) src.push((S.USES[u]?.label || u) + ' ' + (r.perUnit != null ? r.perUnit + ' a home' + (u === 'multifamily' ? ' (Ord. No. 424: two a dwelling unit)' : '') : r.perKey != null ? r.perKey + ' a key' : r.per1000 + ' a 1,000 sf'));
    if (Object.keys(by).length) R.parkingByUse = { v: by, cls: Object.keys(by).every(u => u === 'multifamily') ? 'verified' : 'assumption', source: why + ', use by use' + res + ': ' + src.join('; ') + '. The city’s commercial ratios are unverified: each use’s working number.' };
    return b;
  }
  const mf = kinds[0] === 'multifamily', perUnit = +e.program.perUnit, ratio = +e.program.ratio;
  if (mf && perUnit > 0 && perUnit > (R.parkingPerUnit?.v ?? (pre ? 0 : base.perUnit) ?? 0) + 1e-9) R.parkingPerUnit = { v: perUnit, cls: 'verified', source: why + ': City of Waller Ordinance No. 424, two spaces a dwelling unit' + res };
  if (ratio > 0 && b.program.uses.some(u => u.quantity?.unit !== 'units') && ratio > (R.parkingPer1000?.v ?? (pre ? 0 : base.ratio) ?? 0) + 1e-9) R.parkingPer1000 = { v: ratio, cls: 'assumption', source: why + ': the use’s ratio' + res };
  return b;
}
// the brief runPlan runs (the app's plan, program and search settings made a brief; the bench makes guarded runs with it)
export function briefForPlan(plan, program, opts = {}, { ask = '', seed = 'rei-1' } = {}) {
  const b = B.briefFromProgram(program, plan, { text: ask, parser: 'app', seed });
  governingParking(b, plan, program);
  // what a size means: the words' own meaning (a bare number exactly, "at least", "up to", "as many as fit"), unless the
  // plan's Leftover land setting was chosen (Settings: fillBy 'you') or the words asked to hold land (fillBy 'ask'); a
  // default "fill" no longer turns a stated number into fill-the-site
  const fm = S.fillMode(plan.params), chosen = plan.params?.fillBy === 'you' || plan.params?.fillBy === 'ask';
  if (chosen) for (const u of b.program.uses) if (u.quantity.mode !== 'maximize') { const v = u.quantity.mode === 'range' ? u.quantity.max : u.quantity.value; u.quantity = fm === 'hold' ? { mode: 'exact', value: v, unit: u.quantity.unit } : { mode: 'min', value: u.quantity.mode === 'range' ? u.quantity.min : v, unit: u.quantity.unit }; }
  const { fill, ...params } = plan.params || {}; void fill; b.program.params = params;
  if (plan.terrain) b.site.terrain = plan.terrain;
  const eo = Object.fromEntries(ENGINE_OPT_KEYS.filter(k => opts[k] !== undefined).map(k => [k, opts[k]]));
  if (eo.keepout) b.site.exclusions = []; // the app's keep-outs go to the engine as it gave them (with their road strips); the validator reads them as keep-out pieces
  b.solver.engineOpts = JSON.parse(JSON.stringify(eo)); b.solver.options = Math.min(12, Math.max(3, +opts.count || 3));
  return b;
}
export function runPlan(plan, program, opts = {}, { ask = '', seed = 'rei-1' } = {}) {
  const b = briefForPlan(plan, program, opts, { ask, seed }), eo = b.solver.engineOpts || {};
  const rec = runBrief(b);
  if (!rec.options?.length) return { outcome: rec.outcome, problems: rec.problems || [], options: [] };
  const keep = eo.keepout ? eo.keepout.map(e => ({ ...e })) : [];
  return { outcome: rec.outcome, problems: rec.problems || [], partial: rec.partial || [], mapping: rec.engineMapping || [], options: rec.options.map(o => {
    const { validation: v, quantities: q, geometryHash: gh, engineOrder, rank, id, ...rest } = o; void engineOrder; void id;
    const ko = keep.filter(k => !rest.elements.some(e => e.id === k.id));
    return { ...rest, elements: rest.elements.concat(ko), check: { status: v.status, failed: v.failed, unresolved: v.unresolved, counts: v.counts }, run: { inputHash: rec.inputHash, seed: rec.brief.solver.seed, tickMs: rec.brief.solver.tickMs, versions: rec.versions, outcome: rec.outcome, rank, geometryHash: gh, brief: rec.brief } };
  }) };
}
