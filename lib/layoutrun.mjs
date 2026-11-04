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

export const RUN_SCHEMA = 'rei.run/1';
export const ENGINE_VERSION = 'rei-layout/2026.11.04.1'; // bump when a change to lib/site*.mjs or lib/streetnet.mjs moves geometry
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
  if (!o?.elements?.length) return o;
  if (o.forceMore) { const { forceMore, ...rest } = o; void forceMore; return addSecondAccess0(plan, rest, brief); }
  const v = V.validateLayout({ ...plan, elements: o.elements, program: o.program || {} }, brief), c = v.checks.find(x => x.id === 'access.second'), rm = v.checks.find(x => x.id === 'access.remote');
  if (c?.status !== 'fail') {
    // two ways in, but closer than half the site's diagonal (a centred main entry on one frontage): a third at the far end
    // makes the outer two far enough apart; kept only when it does
    if (rm?.status !== 'fail') return o;
    const o3 = addSecondAccess(plan, { ...o, forceMore: true }, brief), v3 = o3 === o ? null : V.validateLayout({ ...plan, elements: o3.elements, program: o3.program || {} }, brief);
    return v3 && v3.checks.find(x => x.id === 'access.remote')?.status === 'pass' ? { ...o3, forceMore: undefined, tplNotes: [...(o.tplNotes || []), 'A third way in at the far end of the street, so two are at least half the site’s diagonal apart (fire code spacing).'] } : o;
  }
  return addSecondAccess(plan, { ...o, forceMore: true }, brief);
}
function addSecondAccess0(plan, o, brief) {
  const wet = o.elements.filter(e => e.kind === 'pond' || e.kind === 'trail'), rest = o.elements.filter(e => !wet.includes(e));
  const edges = (plan.streets || []).concat(plan.front != null ? [plan.front] : []);
  let m = null;
  for (const opts of [{ edges, throughParks: true }, { edges, throughParks: true, W: 24 }]) { try { m = S.moreEntrances({ ...plan, elements: o.elements }, 1, opts); } catch { m = null; } if (m?.added?.length) break;
    try { m = S.moreEntrances({ ...plan, elements: rest }, 1, opts); } catch { m = null; } if (m?.added?.length) break; }
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
  return { ...o, elements: out, tplNotes: [...(o.tplNotes || []), 'The detention pond moved beside the buildings and parking it drains, out of the land held for later.'] };
}
// An emergency access lane where two ways in are needed and no second street entrance fits far enough from the first
// (a 330 ft frontage on an 800 ft deep lot can't put two half its 866 ft diagonal apart): a 20 ft gated fire lane on an
// all-weather surface, straight in from a lot line to the nearest drive, at a spot at least half the diagonal from one
// of the entrances. A street edge first; else a side or rear line, which needs an access easement across the
// neighbour's land (the notes say so). Never through a building, a lot, a parking row or a pond. IFC D106.3 / D107.2 let
// the fire official accept one; the validator counts it as such (an assumption).
const LANE_W = 20, LANE_MAX = 420;
export function addEmergencyAccess(plan, o, brief) {
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
  const trimHomeRow = (row, poly) => { const n0 = +row.units, a = (row.rot || 0) * Math.PI / 180, along = row.w >= row.d, ax = along ? [Math.cos(a), Math.sin(a)] : [-Math.sin(a), Math.cos(a)], L = Math.max(row.w, row.d), uw = L / n0, c = S.centroid(poly), side = (c[0] - row.x) * ax[0] + (c[1] - row.y) * ax[1] >= 0 ? 1 : -1;
    for (let k = 1; k <= Math.floor(n0 / 3) && n0 - k >= 2; k++) { const cut = k * uw, cx = row.x - side * ax[0] * cut / 2, cy = row.y - side * ax[1] * cut / 2, r2 = { ...row, x: +cx.toFixed(2), y: +cy.toFixed(2), ...(along ? { w: +(L - cut).toFixed(2) } : { d: +(L - cut).toFixed(2) }), units: n0 - k, ...(row.tplUnits != null ? { tplUnits: n0 - k } : {}), ...(row.modules != null ? { modules: n0 - k } : {}), ...(row.sf != null ? { sf: Math.round(row.sf * (n0 - k) / n0) } : {}) };
      if (hit(poly, r2)) continue;
      // the lots of the homes that went: the lots along the row's cut-off end (their middles within the cut band)
      const end = [row.x + side * ax[0] * L / 2, row.y + side * ax[1] * L / 2];
      for (const lt of els.filter(x => x.kind === 'lot')) { const q = S.centroid(S.shapeOf(lt)), t = (q[0] - end[0]) * ax[0] + (q[1] - end[1]) * ax[1]; if (side * t <= 0 && side * t >= -cut + 0.5 && Math.abs((q[0] - row.x) * -ax[1] + (q[1] - row.y) * ax[0]) < Math.min(row.w, row.d) / 2 + 80) pend.add(lt.id); }
      return r2; }
    return null; };
  for (const { t, v } of want) {
    if (TURN.turnFits(t, v, pv).ok) continue;
    for (const R of [...new Set([Math.max(25, v.Ri), Math.max(25, v.Ri) + 10, 45, 60])]) { // (the vehicle's inside radius, at least 25 ft; more where the lanes are narrow or a trailer cuts in)
      const poly = curbPoly(t, R); if (!poly.every(p => S.inRing(p, ring) || TURN.onPave(p, street))) continue; // (a return may run out to the street it meets)
      const live = solid.map(e => rows.get(e.id) || e), blockers = live.filter(e => hit(poly, e));
      if (blockers.some(e => e.kind !== 'parking' && !homeRow(e))) continue;
      pend = new Set(); const cut = blockers.map(e => e.kind === 'parking' ? trimRow(e, poly) : trimHomeRow(e, poly)); if (cut.some(x => !x)) continue;
      if (els.some(lt => lt.kind === 'lot' && !goneLots.has(lt.id) && !pend.has(lt.id) && hit(poly, lt))) continue; // (a return crosses only the lots of the homes that gave way: never a lot whose home stays)
      const pv2 = pv.concat([{ r: poly, bb: [Math.min(...poly.map(p => p[0])), Math.min(...poly.map(p => p[1])), Math.max(...poly.map(p => p[0])), Math.max(...poly.map(p => p[1]))] }]);
      if (!TURN.turnFits(t, v, pv2).ok) continue;
      blockers.forEach((e, k) => rows.set(e.id, cut[k])); for (const id of pend) goneLots.add(id);
      added.push({ kind: 'drive', poly, name: '', note: 'Curb return · ' + R + ' ft radius (' + v.label.toLowerCase() + ')', curb: true }); pv = pv2; break;
    }
  }
  if (!added.length) return o;
  return { ...o, elements: els.filter(e => !goneLots.has(e.id)).map(e => rows.get(e.id) || e).concat(added.map((e, k) => ({ id: 'curb-' + (k + 1) + '-' + Math.round(e.poly[0][0]) + '-' + Math.round(e.poly[0][1]), ...e }))), tplNotes: [...(o.tplNotes || []), added.length + ' curb return' + (added.length > 1 ? 's' : '') + ' rounded so a fire truck (or a service truck) makes the turn (30 ft inside radius).'] };
}
const curbPoly = (t, R) => TURN.curbReturn(t, R);
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
function keepIfNoWorse(plan, was, now, brief) {
  if (now === was) return was;
  const v0 = V.validateLayout({ ...plan, elements: was.elements, program: was.program || {} }, brief), v1 = V.validateLayout({ ...plan, elements: now.elements, program: now.program || {} }, brief);
  const ok = id => v1.checks.find(c => c.id === id)?.status !== 'fail';
  return v0.checks.filter(c => c.hard && c.status === 'pass').every(c => ok(c.id)) ? now : was;
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
      const sw = e.sw || S.STALL.w, n = Math.floor((e.w + 0.01) / sw);
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
function rankKey(o, brief) {
  const v = o.validation, prog = v.checks.filter(c => c.id.startsWith('program.u')), met = prog.filter(c => c.status === 'pass').length;
  const maxi = brief.program.uses.filter(u => ['maximize', 'min', 'max', 'range'].includes(u.quantity.mode)); // more is better up to any cap (a cap's excess already fails the program check)
  const yieldV = maxi.reduce((s, u) => s + (u.quantity.unit === 'units' ? o.quantities.byUse[u.use]?.units || 0 : o.quantities.byUse[u.use]?.gfa || 0), 0);
  const paving = o.quantities.pavedSfGross / Math.max(1, o.quantities.totals.units || o.quantities.totals.gfa / 1000 || 1);
  // the form asked for, delivered: a courtyard request ranks its courtyard layouts above plain bars (other forms are
  // drawn by their own engine path and always are what was asked)
  const formMiss = brief.program.uses.filter(u => u.form === 'mf-courtyard' && !o.elements.some(e => e.court) || u.form === 'mf-wrap' && !o.elements.some(e => e.wrap && e.kind === 'garage') || u.form === 'mf-tuck-under' && !o.elements.some(e => +e.tuck > 0) || u.form === 'ind-cross-dock' && !o.elements.some(e => e.kind === 'building' && e.crossDock) || u.form === 'mf-podium-courtyard' && !o.elements.some(e => e.upper === 'U') || u.form === 'ret-drive-through' && !o.elements.some(e => e.kind === 'drive' && (e.windowAt || /drive-thru/i.test(e.name || '')))).length; // (the form asked for: a courtyard's wings, a drive-thru's lane)
  // a second way in that's a real entrance beats a gated emergency lane (the lane is the fire official's call, and where
  // it meets a side or rear line, an easement from the neighbour)
  const lane = o.elements.some(e => e.emergency) ? 1 : 0;
  return [v.feasible ? 0 : 1, -met, formMiss, v.counts.fail, v.counts.unknown, lane, -yieldV, Math.round(paving), o.geometryHash];
}
export const rankOf = rankKey;
const cmp = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; };

// "As many as fit" apartments: the generator's arrangements (lib/sitegen.mjs generate) are drawn full and parked down,
// at the template's building sizes, so as many as fit sees the same layouts an exact count does. (Before, the generator
// sat out when no count was asked, and its bars ignored the template's sizes, so which counts passed jumped with the
// count asked and an exact-count ladder after the search worked round it, at 2-3 s a request; no longer needed.)
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
  const lay1 = Ex => { let out; try { out = layoutOptions(Ex.plan, Ex.program, Ex.opts) || []; } catch (e) { out = [{ error: String(e && e.message || e) }]; } return out; };
  const short = list => brief.program.uses.some(u => { if (u.use !== 'multifamily' || !['exact', 'range', 'max'].includes(u.quantity.mode)) return false; const need = u.quantity.mode === 'range' ? u.quantity.min : u.quantity.mode === 'max' ? Math.floor(u.quantity.value * 0.9) : u.quantity.value; // (at most: well under the cap is worth a second try)
    const units = o => T.templatesFor(u.form).length ? o.elements.filter(e => e.template && e.tplUse === u.id).reduce((t, e) => t + e.units, 0) : o.elements.filter(e => e.kind === 'building' && (e.use || o.program?.use) === 'multifamily' && (u.zone == null || e.zone == null || e.zone === u.zone)).reduce((t, e) => t + (+e.units || 0), 0);
    return !list.some(o => !o.error && o.elements?.length && units(o) >= need); });
  const { value: raw, stats } = CX.deterministic({ seed: brief.solver.seed, tickMs: brief.solver.tickMs }, () => {
    const wrapNote = 'No wrap fits this site: the garage a wrap needs (about 130 ft across and 120 ft deep inside the wings, with its ramp and cores) doesn’t fit with the wings round it, so these are the nearest layouts; on a small lot a courtyard on a parking podium ("courtyard on a podium") holds more.';
    const noWrap = o => brief.program.uses.some(u => u.form === 'mf-wrap') && !o.elements?.some(e => e.wrap && e.kind === 'garage') ? { ...o, tplNotes: [...(o.tplNotes || []), wrapNote] } : o; // (a wrap asked for that the site can't hold: said, not swapped silently)
    const fit = (Ex, out, br = brief) => out.map(o => o.error ? o : noWrap(o)).map(o => { if (o.error) return o; o = podiumLevels(o); o = keepIfNoWorse(Ex.plan, o, joinCourtyard(Ex.plan, o, br), br); o = keepIfNoWorse(Ex.plan, o, oneAmenityCentre(Ex.plan, o), br); o = keepIfNoWorse(Ex.plan, o, courtGardens(Ex.plan, o), br); o = keepIfNoWorse(Ex.plan, o, nudgeAmenities(Ex.plan, o), br); o = exactByUnitSize(Ex.plan, o, br); const t = T.fitParking(T.trimHomes(T.applyTemplates(Ex.plan, o, br), br), els => V.quantities({ ...Ex.plan, elements: els, program: o.program || Ex.program }, br).parking); const tp = keepIfNoWorse(Ex.plan, t, playNearHomes(Ex.plan, t), br), t0 = keepIfNoWorse(Ex.plan, tp, pondBesideWork(Ex.plan, tp), br), t1 = keepIfNoWorse(Ex.plan, t0, tidyPonds(Ex.plan, t0), br), t2 = keepIfNoWorse(Ex.plan, t1, pruneSurplus(Ex.plan, t1, br), br); const t2g = garageEntries(Ex.plan, t2), t3 = keepIfNoWorse(Ex.plan, t2g, addSecondAccess(Ex.plan, t2g, br), br); const t4 = t3 === t2g ? t3 : keepIfNoWorse(Ex.plan, t3, tidyPonds(Ex.plan, t3), br); const t5 = keepIfNoWorse(Ex.plan, t4, addEmergencyAccess(Ex.plan, t4, br), br), t6 = keepIfNoWorse(Ex.plan, t5, curbReturns(Ex.plan, t5, br), br); return keepIfNoWorse(Ex.plan, t6, podiumTrim(Ex.plan, t6, br), br); }); // (a pond cut back for a way in: its new corners tidied too) // building schedules from the templates, then parking met, inside the run
    let got = fit(E, lay1(E));
    if (capped && short(got)) { const E2 = B.toEngine(brief); E2.opts = { ...E2.opts, deeper: false }; got = got.concat(fit(E2, lay1(E2))); } // (the retry looks for a fuller layout: no deeper-pond copies of it)
    return got;
  });
  const err = raw.find(o => o.error);
  const options = raw.filter(o => o.elements?.length).map((o, i) => {
    const elements = canonElements(drawnAreas(o.elements, o.program || E.program)), lay = { ...E.plan, elements, program: o.program || E.program };
    const validation = V.validateLayout(lay, brief);
    const { elements: _e, notes: _n, tplNotes: _t, error: _x, ...engine } = o; // the engine's own fields (score, recipe, frame…), kept for the editor
    return { ...engine, id: 'opt-' + (i + 1), engineOrder: i, name: o.name || 'Layout ' + (i + 1), geometryHash: geometryHash(elements), elements, program: o.program || E.program, params: o.params || E.plan.params, recipe: o.recipe ?? null, zones: o.zones || [], notes: [...(o.notes || []), ...(o.tplNotes || [])], quantities: validation.quantities, validation };
  });
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
  const outcome = !keep.length ? 'no-feasible-found' : keep.some(o => o.validation.status === 'pass') ? 'feasible' : keep.some(o => o.validation.feasible) ? 'needs-review' : 'no-feasible-found';
  return { ...rec, outcome, optimality: 'best found (heuristic search; not proven optimal)', engineMapping: E.mapping, partial, engineError: err?.error || null,
    solver: { seed: brief.solver.seed, tickMs: brief.solver.tickMs, evaluation: stats, candidates: options.length },
    rankingHash: hashOf(keep.map(o => [o.rank, o.geometryHash])), options: keep };
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
export function runPlan(plan, program, opts = {}, { ask = '', seed = 'rei-1' } = {}) {
  const b = B.briefFromProgram(program, plan, { text: ask, parser: 'app', seed });
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
  const rec = runBrief(b);
  if (!rec.options?.length) return { outcome: rec.outcome, problems: rec.problems || [], options: [] };
  const keep = eo.keepout ? eo.keepout.map(e => ({ ...e })) : [];
  return { outcome: rec.outcome, problems: rec.problems || [], partial: rec.partial || [], mapping: rec.engineMapping || [], options: rec.options.map(o => {
    const { validation: v, quantities: q, geometryHash: gh, engineOrder, rank, id, ...rest } = o; void engineOrder; void id;
    const ko = keep.filter(k => !rest.elements.some(e => e.id === k.id));
    return { ...rest, elements: rest.elements.concat(ko), check: { status: v.status, failed: v.failed, unresolved: v.unresolved, counts: v.counts }, run: { inputHash: rec.inputHash, seed: rec.brief.solver.seed, tickMs: rec.brief.solver.tickMs, versions: rec.versions, outcome: rec.outcome, rank, geometryHash: gh, brief: rec.brief } };
  }) };
}
