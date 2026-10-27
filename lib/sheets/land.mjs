// The landscape sheets of the plan set (lib/planset.mjs RENDERERS): L-001 landscape notes and calculations, L-101
// planting plan, L-102 enlargements (the main entry and the amenity), L-201 irrigation plan, L-501 planting details,
// L-502 irrigation details.
//
// One planting design per plan (design() below), laid out from the plan's geometry the way a landscape architect starts
// one: the site plan's own trees kept (so L-101 matches C-101), then street trees on every frontage, a tree for every
// ten parking spaces, a hedge screening parking from the street, a buffer of trees (and an evergreen screen where paving
// comes close) on the other property lines, a tree in every front yard, trees round the ponds and a wetland edge in the
// wet ones, foundation beds, the entry dressed with ornamental trees, grasses and a groundcover bed at each sign, and
// ornamental trees round the pool deck and play areas. Sight triangles at the drives and the room hydrants and
// transformers need are kept clear. The turf and irrigation zones come from one grid over the landscape (hydro() below):
// St. Augustine on spray heads near buildings, paving and the street, Bermuda on rotors in the open lawns, native grass
// (not irrigated) on the far land and the pond banks, drip in the beds, and the lots left to the home builder.
// Every sheet draws from these, so L-001's counts are L-101's plants and L-201's zones. The rules are typical values
// (RULES), labelled to confirm against the local ordinance. No DOM, no network.
import * as S from '../siteplan.mjs';
import { KIT as K } from './site.mjs';
import { f0, PT, MAIN, engScale, viewTitle, notes, at, svg, line, circle, path, poly, legendLine, n, side } from '../sheetkit.mjs';
import { northArrow, scaleBar } from '../sitesheet.mjs';

const { dist, lerp, unit, plus, left, foot, nearOn, along, inside, lenOf, tbl, sw, legendHtml, warn, T, INK } = K;

// ---------- the rules (typical values; the local landscape ordinance governs) ----------
// ft unless noted: a street tree every `street` ft of frontage `streetIn` inside the line; a tree per `parking` surface
// stalls within `parkReach` ft of them; parking within `screen` ft of a street screened by a hedge; a buffer tree every
// `perimeter` ft of the other property lines, `bufferIn` inside, and an evergreen screen there where paving or a building
// is within `screenIn`; the share of the site kept as landscape (commercial and apartments); no species over `maxSpecies`
// of the trees; a pond tree every `pond` ft round the top of bank; sight triangles `sight` ft each way at a drive
export const RULES = { street: 40, streetIn: 14, parking: 10, parkReach: 25, screen: 60, perimeter: 40, bufferIn: 10, screenIn: 30, landPct: 0.15, maxSpecies: 0.4, pond: 55, sight: 25 };

// the plant palette: native (N) and adapted (A) plants for the Texas Gulf Coast. [common, botanical, size, type, water,
// N/A, mature spread ft]
export const PLANTS = {
  LO: ['Live oak', 'Quercus virginiana', '3" cal., 12\' ht.', 'canopy', 'Low', 'N', 40],
  CE: ['Cedar elm', 'Ulmus crassifolia', '3" cal., 12\' ht.', 'canopy', 'Low', 'N', 30],
  SO: ['Shumard red oak', 'Quercus shumardii', '3" cal., 12\' ht.', 'canopy', 'Low', 'N', 35],
  CP: ['Chinese pistache', 'Pistacia chinensis', '3" cal., 12\' ht.', 'canopy', 'Low', 'A', 30],
  BC: ['Bald cypress', 'Taxodium distichum', '3" cal., 12\' ht.', 'canopy', 'Moderate', 'N', 25],
  CM: ["Crape myrtle 'Natchez'", "Lagerstroemia indica × fauriei 'Natchez'", '30 gal., multi-trunk, 8\' ht.', 'ornamental', 'Low', 'A', 16],
  TR: ['Texas redbud', 'Cercis canadensis var. texensis', '30 gal., 6\' ht.', 'ornamental', 'Low', 'N', 15],
  YH: ['Yaupon holly (tree form)', 'Ilex vomitoria', '30 gal., multi-trunk, 6\' ht.', 'ornamental', 'Low', 'N', 12],
  WM: ['Wax myrtle (evergreen screen)', 'Morella cerifera', '15 gal., 5\' ht., 8\' o.c.', 'screen', 'Low', 'N', 8],
  DY: ['Dwarf yaupon holly', "Ilex vomitoria 'Nana'", '5 gal., 3\' o.c.', 'shrub', 'Low', 'N', 3],
  TS: ['Texas sage', 'Leucophyllum frutescens', '5 gal., 4\' o.c.', 'shrub', 'Low', 'N', 4],
  LN: ["Lantana 'New Gold'", 'Lantana × hybrida', '1 gal., 3\' o.c.', 'shrub', 'Low', 'A', 3],
  GM: ['Gulf muhly', 'Muhlenbergia capillaris', '1 gal., 2\' o.c.', 'grass', 'Low', 'N', 2],
  AJ: ['Asian jasmine (groundcover)', 'Trachelospermum asiaticum', '4" pots, 12" o.c.', 'ground', 'Low', 'A', 1],
  WP: ['Wetland edge plugs: pickerelweed, soft rush', 'Pontederia cordata, Juncus effusus', '4" plugs, 18" o.c.', 'wetland', 'High', 'N', 1]
};
const TREE = c => ['canopy', 'ornamental'].includes(PLANTS[c]?.[3]);
const FILL = { LO: '#cfe3bf', CE: '#d9e9c9', SO: '#e3d9b8', CP: '#e8dcc0', BC: '#c9e2d6', CM: '#ead2e2', TR: '#ead2e2', YH: '#d7e6c4', WM: '#9cc08a', DY: '#8fbf74', TS: '#b7c4b0', LN: '#f1d27a', GM: '#e4c7d6', AJ: '#a8cf96', WP: '#9fc6c9' };
// what the different parts of the site are planted as, and how each is watered (L-201)
export const ZONES = {
  spray: { label: 'St. Augustine sod, spray heads', water: 'Moderate', col: '#cfe6b8', pf: 0.6, ie: 0.65, pr: 1.5 },
  rotor: { label: 'Bermuda sod, rotors', water: 'Moderate', col: '#e3edc2', pf: 0.5, ie: 0.7, pr: 0.5 },
  drip: { label: 'Planting beds, inline drip', water: 'Low', col: '#ead9bd', pf: 0.3, ie: 0.9, pr: 0.9 },
  native: { label: 'Native grass seed, not irrigated (temporary for establishment)', water: 'Very low', col: '#f3efd9' },
  bank: { label: 'Pond slopes: Bermuda / native seed, not irrigated', water: 'Very low', col: '#e2eef0' },
  lot: { label: 'Lots: sod and irrigation by the home builder', water: '—', col: '#f6f6f2' }
};
const GPM = 25, ETO = 57; // gpm a valve is sized for; reference evapotranspiration, in a year (Waller County, TexasET)
const CAP = { spray: GPM * 60 / (ZONES.spray.pr * 0.623), rotor: GPM * 60 / (ZONES.rotor.pr * 0.623), drip: GPM * 60 / (ZONES.drip.pr * 0.623) }; // sf a valve waters

// ---------- a small spatial index for points ----------
function pointGrid(cell = 30) {
  const M = new Map(), key = (i, j) => i + ',' + j, all = [];
  return { all, add(p, v) { const i = Math.floor(p[0] / cell), j = Math.floor(p[1] / cell), k = key(i, j); (M.get(k) || M.set(k, []).get(k)).push(v); all.push(v); return v; },
    near(p, r) { const out = [], i0 = Math.floor((p[0] - r) / cell), i1 = Math.floor((p[0] + r) / cell), j0 = Math.floor((p[1] - r) / cell), j1 = Math.floor((p[1] + r) / cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const v of M.get(key(i, j)) || []) if (dist(v.p, p) < r) out.push(v); return out; },
  };
}
const outlineBox = o => { const b = K.bboxOf(o); return { o, b }; };
const inBox = (p, b, g = 0) => p[0] >= b[0] - g && p[0] <= b[2] + g && p[1] >= b[1] - g && p[1] <= b[3] + g;

// ---------- the planting design ----------
export function design(G) {
  return K.lazy(G, 'land', () => {
    const D = K.details(G), ring = G.ring, els = G.els, trees = pointGrid(30), shrubs = [], hedges = [], beds = [], masses = [], wet = [];
    const park = els.filter(e => e.kind === 'parking').map(e => outlineBox(S.outline(e))), lots = els.filter(e => e.kind === 'lot').map(e => outlineBox(S.outline(e)));
    const hard = els.filter(e => ['plaza', 'patio', 'pool', 'court', 'play', 'keepout', 'canopy', 'tanks', 'trail'].includes(e.kind)).map(e => outlineBox(S.shapeOf(e)));
    const walks = D.walks.map(w => outlineBox(w.poly || S.corners(w))), bldg = G.B.map(b => ({ ...outlineBox(b.o), b })), ponds = G.ponds.map(q => ({ ...outlineBox(q.o), e: q.e }));
    const keep = [...K.hydrants(G).map(p => ({ p, r: 7 })), ...K.transformers(G).map(t => ({ p: t.p, r: 10 }))];
    // sight triangles where a drive meets the street: legs along the property line and the drive's edge
    const sight = [], ents = new Set(S.entrancesOf(els));
    for (const l of G.lines.filter(l => ents.has(l.e))) for (const end of [l.pts[0], l.pts[l.pts.length - 1]]) {
      const q = nearOn(end, ring, true); if (q.d > 40) continue; const a = ring[q.i], b = ring[(q.i + 1) % ring.length], t = unit(a, b), o = S.outwardOf(ring, q.i), u = [-o[0], -o[1]];
      for (const sg of [-1, 1]) { const A = plus(q.p, t, sg * l.w / 2); sight.push([A, plus(A, t, sg * RULES.sight), plus(A, u, RULES.sight)]); }
    }
    const inSight = p => sight.some(t => inside(p, t));
    const inAny = (p, list, g = 0) => list.some(x => inBox(p, x.b, g) && (inside(p, x.o) || (g > 0 && nearOn(p, x.o, true).d < g)));
    const lotOf = p => lots.find(x => inBox(p, x.b) && inside(p, x.o));
    const paved = p => K.isPaving(G, p) || inAny(p, walks) || inAny(p, hard);
    // room for a plant at p, r ft clear of paving and walls (a tree's trunk 4 ft or more off a curb)
    const clearOf = (p, r = 0) => inside(p, ring) && nearOn(p, ring, true).d >= Math.min(3, r) && !paved(p) && !inAny(p, bldg, r) && !inAny(p, ponds, 3) &&
      (r < 3 || [[r, 0], [-r, 0], [0, r], [0, -r]].every(d => !paved([p[0] + d[0], p[1] + d[1]])));
    const treeOk = p => clearOf(p, 4) && !inSight(p) && !keep.some(k => dist(k.p, p) < k.r);
    const roomy = (p, g) => !trees.near(p, g).length;
    const plant = (p, code, why) => trees.add(p, { p, code, why });
    const cycle = (list, i) => list[((i % list.length) + list.length) % list.length];
    const nearPark = p => park.some(x => inBox(p, x.b, RULES.parkReach) && (inside(p, x.o) || nearOn(p, x.o, true).d < RULES.parkReach));
    // the site plan's own trees, each given a species by where it stands (one in a parking island is in the paving's outline)
    const isles = D.islands.map(i => i.poly || S.outline(i));
    D.trees.forEach(([x, y, r], i) => { const p = [x, y]; if (!inside(p, ring) || inSight(p) || keep.some(k => dist(k.p, p) < k.r)) return;
      const inPark = park.some(o => inBox(p, o.b, 12) && (inside(p, o.o) || nearOn(p, o.o, true).d < 12)), lot = lotOf(p);
      const code = inPark ? cycle(['CE', 'CP'], i) : ponds.some(q => nearOn(p, q.o, true).d < 40) ? 'BC' : lot ? cycle(['SO', 'CE'], i) : r <= 10 ? 'YH' : cycle(['LO', 'CE', 'SO'], Math.floor(x / 160) + Math.floor(y / 160));
      plant(p, code, isles.some(o => inside(p, o)) ? 'island' : inPark ? 'parking' : lot ? 'lot' : 'site'); });
    // street trees: every frontage, a tree each 40 ft just inside the line (the drives and their sight triangles left clear)
    const streets = K.streetEdges(G), frontage = [];
    streets.forEach((i, si) => { const a = ring[i], b = ring[(i + 1) % ring.length], L = dist(a, b), u = unit(a, b), o = S.outwardOf(ring, i), inn = [-o[0], -o[1]], code = cycle(['LO', 'SO', 'CE'], si);
      let pavedLf = 0; for (const s of along([a, b], 5)) if (paved(plus(s.p, inn, 3))) pavedLf += 5;
      frontage.push({ i, a, b, L, need: Math.ceil(Math.max(0, L - pavedLf) / RULES.street) });
      for (let s = RULES.street / 2; s < L - 10; s += RULES.street) { const base = plus(a, u, s); if (trees.near(plus(base, inn, RULES.streetIn), RULES.street * 0.55).some(t => foot(t.p, a, b).d < 30)) continue;
        let put = false; for (const sh of [0, 8, -8, 16, -16]) { for (const d of [RULES.streetIn, 9, 20, 6, 26]) { const p = plus(plus(base, u, sh), inn, d); if (treeOk(p) && roomy(p, 22)) { plant(p, code, 'street'); put = true; break; } } if (put) break; } }
    });
    // a tree in every front yard: between the home and the street, to the side away from the driveway
    const homes = G.B.filter(b => b.res), drives = els.filter(e => e.kind === 'plaza' && /driveway/i.test(e.note || '')).map(e => ({ c: [e.x, e.y], e }));
    let lotNeed = 0;
    for (const L0 of lots) {
      const h = homes.find(b => inside(b.c, L0.o)); if (!h) continue; lotNeed++;
      if (trees.all.some(t => t.why === 'lot' && inBox(t.p, L0.b) && inside(t.p, L0.o))) continue;
      const dw = drives.filter(d => inside(d.c, L0.o) || dist(d.c, h.c) < 60).sort((p, q) => dist(p.c, h.c) - dist(q.c, h.c))[0];
      const u = dw ? unit(h.c, dw.c) : unit(h.c, K.tapOf(K.net(G, 'storm'), h.c).q), sd = left(u), half = Math.max(...h.o.map(v => (v[0] - h.c[0]) * u[0] + (v[1] - h.c[1]) * u[1]));
      const away = dw ? -Math.sign(((dw.c[0] - h.c[0]) * sd[0] + (dw.c[1] - h.c[1]) * sd[1]) || 1) : 1, wid = Math.min(...[1, -1].map(g => Math.max(...L0.o.map(v => g * ((v[0] - h.c[0]) * sd[0] + (v[1] - h.c[1]) * sd[1])))));
      let done = false;
      for (const f of [14, 10, 20, 6, 26]) { for (const w of [0.55, 0.4, 0.7, 0.25, -0.4, -0.6]) { const p = plus(plus(h.c, u, half + f), sd, away * w * wid); if (inside(p, L0.o) && clearOf(p, 2) && !inSight(p) && roomy(p, 10)) { plant(p, cycle(['SO', 'CE', 'LO'], lotNeed), 'lot'); done = true; break; } } if (done) break; }
    }
    // parking: a tree for every ten stalls within 25 ft; short of that, trees along the rows' outside edges
    const stalls = els.filter(e => e.kind === 'parking').reduce((t, e) => t + (S.stalls(e).count || 0), 0), parkNeed = Math.ceil(stalls / RULES.parking);
    const parkHave = () => trees.all.filter(t => TREE(t.code) && nearPark(t.p)).length;
    if (parkHave() < parkNeed) { let k = 0;
      for (const x of park) { const ccw = S.signedArea(x.o) >= 0; x.o.forEach((a, i) => { const c = x.o[(i + 1) % x.o.length], L = dist(a, c); if (L < 18) return; const u = unit(a, c), out = ccw ? [u[1], -u[0]] : [-u[1], u[0]];
        for (const q of along([a, c], 30, { start: Math.min(15, L / 2) })) { if (parkHave() >= parkNeed) return; for (const d of [7, 11]) { const p = plus(q.p, out, d); if (treeOk(p) && !lotOf(p) && roomy(p, 22)) { plant(p, cycle(['CE', 'CP'], k++), 'parking'); break; } } } }); } }
    // parking screened from the street: a continuous hedge past the curb of any row within 60 ft of a frontage
    const nearStreet = p => frontage.some(f => foot(p, f.a, f.b).d < RULES.screen);
    let screenNeed = 0;
    for (const x of park) { const ccw = S.signedArea(x.o) >= 0;
      x.o.forEach((a, i) => { const c = x.o[(i + 1) % x.o.length], L = dist(a, c); if (L < 30) return; const u = unit(a, c), out = ccw ? [u[1], -u[0]] : [-u[1], u[0]], mid = plus(lerp(a, c, 0.5), out, 5);
        if (!clearOf(mid) || !nearStreet(mid)) return; screenNeed += L; const pts = along([a, c], 3, { start: 3 }).filter(q => q.s < L - 2).map(q => plus(q.p, out, 4.5)).filter(p => clearOf(p) && !inSight(p));
        if (pts.length >= 4) hedges.push({ pts, code: 'DY', step: 3, why: 'screen' }); }); }
    // the other property lines: a buffer tree every 40 ft (commercial and apartments; on a neighbourhood only on the common
    // land) and an evergreen screen where paving or a building comes within 30 ft
    const sideEdges = ring.map((_, i) => i).filter(i => !streets.includes(i)), allRes = G.res, buffer = [];
    sideEdges.forEach((i, si) => { const a = ring[i], b = ring[(i + 1) % ring.length], L = dist(a, b), u = unit(a, b), o = S.outwardOf(ring, i), inn = [-o[0], -o[1]], code = cycle(['CE', 'LO', 'SO'], si);
      if (L < 30) return; buffer.push({ i, a, b, L, need: allRes ? 0 : Math.ceil(L / RULES.perimeter) });
      for (let s = RULES.perimeter / 2; s < L - 8; s += RULES.perimeter) { const base = plus(a, u, s); if (trees.near(plus(base, inn, RULES.bufferIn), RULES.perimeter * 0.55).some(t => foot(t.p, a, b).d < 25)) continue;
        let put = false; for (const sh of [0, 10, -10]) { for (const d of [RULES.bufferIn, 7, 15, 5]) { const p = plus(plus(base, u, sh), inn, d); if (treeOk(p) && !lotOf(p) && roomy(p, 20)) { plant(p, code, 'buffer'); put = true; break; } } if (put) break; } }
      if (allRes) return; let run = [];
      const flush = () => { if (run.length >= 3) hedges.push({ pts: run, code: 'WM', step: 8, why: 'buffer' }); run = []; };
      for (const q of along([a, b], 8, { start: 6 })) { const p = plus(q.p, inn, 4.5), close = [10, 20, RULES.screenIn].some(d => { const r = plus(q.p, inn, d); return paved(r) || inAny(r, bldg); });
        if (close && clearOf(p) && !inSight(p) && !trees.near(p, 5).length) run.push(p); else flush(); } flush();
    });
    // ponds: trees round the top of bank, a wetland edge planted inside a wet pond's normal pool
    let np = 0;
    for (const q of ponds) { const c = S.centroid(q.o);
      for (const s of along(q.o, RULES.pond, { closed: true })) { const p = plus(s.p, unit(c, s.p), 18); if (treeOk(p) && !lotOf(p) && roomy(p, 25)) plant(p, cycle(['BC', 'SO', 'BC', 'CE'], np++), 'pond'); }
      if (/wet|retention|lake/i.test((q.e.note || '') + (q.e.name || ''))) wet.push({ o: q.o, area: lenOf(q.o, true) * 6 }); }
    // buildings: a foundation bed along every wall that faces landscape, shrubs in it, an ornamental tree off each corner
    for (const b of G.B) {
      const walk = b.e.nowalk || b.res ? 0 : 8, ccw = S.signedArea(b.o) >= 0;
      if (b.res) { const t = K.tapOf(K.net(G, 'storm'), b.c), w = K.wallAt(b.o, t.q), seg = b.o.map((a, i) => [a, b.o[(i + 1) % b.o.length]]).sort((x, y) => foot(t.q, ...x).d - foot(t.q, ...y).d)[0], L = dist(...seg);
        for (const q of along(seg, 3, { start: L * 0.15 })) if (q.s < L * 0.55) { const p = plus(q.p, w.out, 3); if (clearOf(p)) shrubs.push({ p, code: 'DY' }); } continue; }
      b.o.forEach((a, i) => { const c = b.o[(i + 1) % b.o.length], L = dist(a, c); if (L < 16) return; const u = unit(a, c), out = ccw ? [u[1], -u[0]] : [-u[1], u[0]], mid = lerp(a, c, 0.5);
        if (!clearOf(plus(mid, out, walk + 3.5))) return; beds.push([plus(a, out, walk + 1), plus(c, out, walk + 1), plus(c, out, walk + 6), plus(a, out, walk + 6)]);
        const code = i % 2 ? 'TS' : 'DY', step = code === 'TS' ? 4 : 3;
        for (const q of along([a, c], step, { start: 3 })) if (q.s < L - 2) { const p = plus(q.p, out, walk + 3.5); if (clearOf(p)) shrubs.push({ p, code }); } });
      for (const v of b.o) { const p = plus(v, unit(b.c, v), walk + 14); if (treeOk(p) && roomy(p, 18)) plant(p, b.use === 'amenity' ? 'CM' : 'TR', 'accent'); }
    }
    // the entrance: grass masses and an ornamental tree either side of the main drive; a groundcover bed with seasonal
    // colour round each monument sign
    if (G.entryLine) { const l = G.entryLine, e0 = dist(l.pts[0], G.entry) < dist(l.pts[l.pts.length - 1], G.entry) ? 0 : 1, a = e0 ? l.pts[l.pts.length - 1] : l.pts[0], u = unit(a, e0 ? l.pts[l.pts.length - 2] : l.pts[1]);
      for (const sgn of [-1, 1]) { const c = plus(plus(a, u, 30), left(u), sgn * (l.w / 2 + 14)); for (let i = 0; i < 14; i++) { const p = plus(c, [Math.cos(i * 2.4), Math.sin(i * 2.4)], 2 + Math.sqrt(i) * 2.6); if (clearOf(p) && !lotOf(p)) shrubs.push({ p, code: 'GM' }); }
        const t = plus(plus(a, u, 50), left(u), sgn * (l.w / 2 + 12)); if (treeOk(t) && !lotOf(t) && roomy(t, 14)) plant(t, 'CM', 'entry'); } }
    for (const e of els.filter(e => e.kind === 'sign')) { const c = [e.x, e.y], r = Math.max(e.w || 10, e.d || 4) / 2 + 9, pg = Array.from({ length: 16 }, (_, k) => [c[0] + r * Math.cos(k * Math.PI / 8), c[1] + r * 0.6 * Math.sin(k * Math.PI / 8)]).map(p => S.rotPt([p[0] - c[0], p[1] - c[1]], e.rot || 0)).map(p => [p[0] + c[0], p[1] + c[1]]);
      if (pg.filter(p => clearOf(p)).length < 10) continue; masses.push({ poly: pg, code: 'AJ', area: S.ringArea(pg) });
      for (let k = 0; k < 8; k++) { const p = lerp(c, pg[k * 2], 0.72); if (clearOf(p)) shrubs.push({ p, code: 'LN' }); } }
    // the amenity: ornamental trees round the pool deck, the patios and the play areas
    for (const e of els.filter(e => (e.kind === 'plaza' && /pool|deck|patio|plaza/i.test((e.note || '') + (e.name || ''))) || e.kind === 'play' || e.kind === 'patio')) {
      for (const s of along(S.shapeOf(e), 26, { closed: true })) { const p = plus(s.p, unit([e.x, e.y], s.p), 8); if (treeOk(p) && !lotOf(p) && roomy(p, 16)) plant(p, 'CM', 'amenity'); } }
    // no species over the share the rules allow: the commonest one's extra trees (the ones not in a street run, which
    // reads best as one species) change to the least used canopy tree
    const canopyCodes = ['LO', 'CE', 'SO', 'CP'];
    for (let guard = 0; guard < 400; guard++) { const tt = trees.all.filter(t => TREE(t.code)), by = {}; for (const t of tt) by[t.code] = (by[t.code] || 0) + 1;
      const [top, k] = Object.entries(by).sort((x, y) => y[1] - x[1])[0] || []; if (!top || k <= RULES.maxSpecies * 0.95 * tt.length || PLANTS[top][3] !== 'canopy') break;
      const t = tt.filter(q => q.code === top && q.why !== 'street').pop() || tt.filter(q => q.code === top).pop(), to = canopyCodes.filter(c => c !== top).sort((x, y) => (by[x] || 0) - (by[y] || 0))[0]; t.code = to; }
    // what the rules ask for and what the design shows
    const treesOf = f => trees.all.filter(t => TREE(t.code) && f(t)).length;
    const req = {
      frontage: frontage.map(f => ({ ...f, have: treesOf(t => foot(t.p, f.a, f.b).d < 30) })),
      buffer: buffer.map(f => ({ ...f, have: treesOf(t => foot(t.p, f.a, f.b).d < 25) })),
      park: { need: parkNeed, have: parkHave(), stalls }, screenNeed, lots: { need: lotNeed, have: treesOf(t => t.why === 'lot') },
      screenLf: hedges.filter(h => h.why === 'screen').reduce((s, h) => s + h.pts.length * h.step, 0), bufferLf: hedges.filter(h => h.why === 'buffer').reduce((s, h) => s + h.pts.length * h.step, 0)
    };
    return { trees: trees.all, shrubs, hedges, beds, masses, wet, sight, req };
  });
}

// how many of each plant: trees and shrubs by count, hedges by spacing, groundcover and wetland plugs by area
export function plantCounts(Ld) {
  const c = {}; const add = (k, v) => { c[k] = (c[k] || 0) + v; };
  for (const t of Ld.trees) add(t.code, 1); for (const s of Ld.shrubs) add(s.code, 1); for (const h of Ld.hedges) add(h.code, h.pts.length);
  for (const m of Ld.masses) add(m.code, Math.ceil(m.area)); for (const w of Ld.wet) add('WP', Math.ceil(w.area / 2.25));
  return c;
}

// ---------- turf, irrigation zones and valves (one grid over the landscape) ----------
export function hydro(G) {
  return K.lazy(G, 'hydro', () => {
    const ring = G.ring, [x0, y0, x1, y1] = K.bboxOf(ring), area = S.ringArea(ring), c = Math.max(6, Math.min(20, Math.sqrt(area) / 70)), nx = Math.ceil((x1 - x0) / c), ny = Math.ceil((y1 - y0) / c);
    const Ld = design(G), lots = G.els.filter(e => e.kind === 'lot').map(e => outlineBox(S.outline(e)));
    const solid = G.els.filter(e => ['plaza', 'patio', 'pool', 'court', 'play', 'keepout', 'canopy', 'tanks', 'trail'].includes(e.kind)).map(e => outlineBox(S.shapeOf(e))).concat(G.B.map(b => outlineBox(b.o)));
    const ponds = G.ponds.map(q => outlineBox(q.o)), inL = (p, L) => L.some(x => inBox(p, x.b) && inside(p, x.o));
    const kind = new Array(nx * ny).fill(null), D = new Float64Array(nx * ny).fill(1e9), at = (i, j) => [x0 + (i + 0.5) * c, y0 + (j + 0.5) * c];
    // what each cell is: off the site, built (paving, a building, a pond), a lot, or landscape (classified below)
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const p = at(i, j), k = j * nx + i; if (!inside(p, ring)) continue;
      if (inL(p, ponds)) { kind[k] = 'pond'; continue; } if (K.isPaving(G, p) || inL(p, solid)) { kind[k] = 'built'; D[k] = 0; continue; }
      kind[k] = inL(p, lots) ? 'lot' : 'land'; if (kind[k] === 'lot') D[k] = 0; }
    // how far each cell is from anything built (a chamfer distance transform, in ft)
    const a1 = c, a2 = c * Math.SQRT2;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (i) D[k] = Math.min(D[k], D[k - 1] + a1); if (j) { D[k] = Math.min(D[k], D[k - nx] + a1); if (i) D[k] = Math.min(D[k], D[k - nx - 1] + a2); if (i < nx - 1) D[k] = Math.min(D[k], D[k - nx + 1] + a2); } }
    for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; if (i < nx - 1) D[k] = Math.min(D[k], D[k + 1] + a1); if (j < ny - 1) { D[k] = Math.min(D[k], D[k + nx] + a1); if (i < nx - 1) D[k] = Math.min(D[k], D[k + nx + 1] + a2); if (i) D[k] = Math.min(D[k], D[k + nx - 1] + a2); } }
    // (the parkways and side strips next to home lots go with the lots: the builder sods and waters them)
    const fronts = K.streetEdges(G).map(i => [ring[i], ring[(i + 1) % ring.length]]), lotNear = p => lots.some(x => inBox(p, x.b, 16) && nearOn(p, x.o, true).d < 16);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (kind[k] !== 'land') continue; const p = at(i, j);
      kind[k] = ponds.some(q => inBox(p, q.b, 24) && nearOn(p, q.o, true).d < 22) ? 'bank' : lots.length && lotNear(p) ? 'lot' : D[k] <= 35 || fronts.some(([a, b]) => foot(p, a, b).d < 30) ? 'spray' : D[k] <= 100 ? 'rotor' : 'native'; }
    const sf = {}; for (const k of kind) if (k && k !== 'built' && k !== 'pond') sf[k] = (sf[k] || 0) + c * c;
    const bedSf = Ld.beds.reduce((s, b) => s + S.ringArea(b), 0) + Ld.masses.reduce((s, m) => s + m.area, 0) + (Ld.hedges.reduce((s, h) => s + h.pts.length * h.step, 0) * 6);
    sf.drip = bedSf; if (sf.spray) sf.spray = Math.max(0, sf.spray - bedSf);
    // runs of one kind along each row, for drawing
    const runs = []; for (let j = 0; j < ny; j++) { let s = 0; for (let i = 1; i <= nx; i++) { const a = kind[j * nx + s], b = i < nx ? kind[j * nx + i] : '#'; if (a !== b) { if (ZONES[a]) runs.push({ k: a, x: x0 + s * c, y: y0 + j * c, w: (i - s) * c, h: c }); s = i; } } }
    // valves: the land cut into tiles the size one valve waters, a valve in each tile with enough of a kind in it
    const valves = [];
    for (const k of ['spray', 'rotor']) { const T0 = Math.sqrt(CAP[k]), tiles = new Map();
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (kind[j * nx + i] === k) { const p = at(i, j), key = Math.floor((p[0] - x0) / T0) + ',' + Math.floor((p[1] - y0) / T0), t = tiles.get(key) || tiles.set(key, { n: 0, sx: 0, sy: 0 }).get(key); t.n++; t.sx += p[0]; t.sy += p[1]; }
      const all = [...tiles.values()].sort((a, b) => b.n - a.n), big0 = all.filter(t => t.n * c * c >= CAP[k] * 0.2), big = big0.length ? big0 : all.slice(0, 1), want = Math.ceil((sf[k] || 0) / CAP[k]);
      for (let m = 0; m < want && big.length; m++) { const t = big[m % big.length], off = Math.floor(m / big.length) * 8; valves.push({ k, p: [t.sx / t.n + off, t.sy / t.n + off] }); } }
    const bedPts = Ld.beds.map(b => S.centroid(b)).concat(Ld.masses.map(m => S.centroid(m.poly)), Ld.hedges.map(h => h.pts[Math.floor(h.pts.length / 2)])), nd = Math.ceil(bedSf / CAP.drip);
    for (let m = 0; m < nd && bedPts.length; m++) valves.push({ k: 'drip', p: bedPts[Math.floor((m + 0.5) * bedPts.length / nd)] });
    const wateredTrees = Ld.trees.filter(t => { const i = Math.floor((t.p[0] - x0) / c), j = Math.floor((t.p[1] - y0) / c), k = kind[j * nx + i]; return k === 'spray' || k === 'rotor' || k === 'built' || k === 'drip'; });
    const nb = Math.ceil(wateredTrees.length / 25); for (let m = 0; m < nb; m++) valves.push({ k: 'bubbler', p: wateredTrees[Math.floor((m + 0.5) * wateredTrees.length / nb)].p });
    // the point of connection: a meter and backflow preventer at the main entrance; the controller on the nearest
    // building that isn't a home (or at the entrance)
    const o = S.outwardOf(ring, G.entryEdge ?? G.fi), inn = [-o[0], -o[1]], t = unit(...K.entryEdge(G)), poc = plus(plus(G.entry, inn, 12), t, (G.entryLine?.w || 26) / 2 + 14);
    const host = G.B.filter(b => !b.res).sort((a, b) => dist(a.c, poc) - dist(b.c, poc))[0], ctl = host ? (w => plus(w.p, w.out, 2))(K.wallAt(host.o, poc)) : plus(poc, t, 14);
    const gal = k => (sf[k] || 0) * ETO * ZONES[k].pf * 0.623 / ZONES[k].ie;
    return { c, runs, sf, valves, poc, ctl, gal: { spray: gal('spray'), rotor: gal('rotor'), drip: gal('drip') }, trees: wateredTrees.length };
  });
}

// ---------- drawing ----------
const tr = (V, t, o = {}) => { const p = V.X(t.p), sp = PLANTS[t.code]?.[6] || 30, r = Math.max(o.min ?? 3.5, sp / 2 * V.k * (o.scale ?? 0.75)), out = [circle(p[0], p[1], r, 'fill="' + (FILL[t.code] || '#cfe3bf') + '" fill-opacity=".85" stroke="#4f7a3a" stroke-width="' + (r > 10 ? 1 : 0.7) + '"'), circle(p[0], p[1], Math.max(0.8, r * 0.1), 'fill="#4f7a3a"')];
  if (PLANTS[t.code]?.[3] === 'ornamental') out.push(circle(p[0], p[1], r * 0.62, 'fill="none" stroke="#4f7a3a" stroke-width=".5" stroke-dasharray="2 2"'));
  if (r >= 8) out.push(T(p[0], p[1] + r * 0.45, t.code, Math.min(o.label ?? 8, r * 0.7), { halo: false, fill: '#2f4a22', bold: true })); return out.join(''); };
const shrubDot = (V, s, k = 1) => { const p = V.X(s.p), r = Math.max(1.6, (PLANTS[s.code]?.[6] || 3) / 2 * V.k * k); return circle(p[0], p[1], r, 'fill="' + (FILL[s.code] || '#8fbf74') + '" stroke="#4f7a3a" stroke-width=".45"'); };
// the planting drawn over the site: beds, masses, wetland edges, hedges, shrubs, trees, sight triangles
function plantingLayer(G, V, Ld, o = {}) {
  const out = [], P = V.P;
  for (const b of Ld.beds) out.push(poly(P(b), 'fill="#ead9bd" stroke="#b39b72" stroke-width=".6"'));
  for (const m of Ld.masses) out.push(poly(P(m.poly), 'fill="' + FILL[m.code] + '" stroke="#5d8a4a" stroke-width=".6"'), poly(P(m.poly), 'fill="url(#hatch)" stroke="none" opacity=".25"'));
  for (const w of Ld.wet) out.push(K.lineFt(V, w.o.concat([w.o[0]]), 'fill="none" stroke="' + FILL.WP + '" stroke-width="' + n(Math.max(2, 6 * V.k)) + '" stroke-opacity=".9"'));
  for (const h of Ld.hedges) { if (h.code === 'WM') { for (const p of h.pts) out.push(shrubDot(V, { p, code: 'WM' }, 0.9)); continue; }
    out.push(K.lineFt(V, h.pts, 'fill="none" stroke="#6fa356" stroke-width="' + n(Math.max(2.2, 3.4 * V.k)) + '" stroke-linecap="round"'), K.lineFt(V, h.pts, 'fill="none" stroke="#4f7a3a" stroke-width=".5" stroke-dasharray="1.5 ' + n(Math.max(1.5, 3 * V.k - 1.5)) + '"')); }
  for (const s of Ld.shrubs) out.push(shrubDot(V, s));
  for (const t of Ld.trees) out.push(tr(V, t, o));
  if (o.sight !== false) for (const t of Ld.sight) out.push(poly(P(t), 'fill="#fff3d6" fill-opacity=".45" stroke="#c98a16" stroke-width=".7" stroke-dasharray="4 3"'));
  return out.join('');
}
const plantLegend = () => [sw('fill="#cfe3bf" stroke="#4f7a3a"', 'Canopy tree (code inside; drawn at 3/4 of its mature spread)', 'circle'), sw('fill="#ead2e2" stroke="#4f7a3a"', 'Ornamental tree', 'circle'), sw('fill="#9cc08a" stroke="#4f7a3a"', 'Evergreen screen (wax myrtle, 8 ft o.c.)', 'circle'),
  sw('fill="#8fbf74" stroke="#4f7a3a"', 'Shrub / ornamental grass', 'circle'), '<div class="lg2">' + svg(26, 16, line(2, 8, 24, 8, 'stroke="#6fa356" stroke-width="3.4" stroke-linecap="round"')) + '<span>Clipped hedge, 3 ft o.c. (parking screen)</span></div>',
  sw('fill="#ead9bd" stroke="#b39b72"', 'Planting bed, 3" hardwood mulch'), sw('fill="#a8cf96" stroke="#5d8a4a"', 'Groundcover bed with seasonal colour'), sw('fill="none" stroke="#9fc6c9" stroke-width="3"', 'Wetland edge plugs (wet ponds)'),
  sw('fill="#fff3d6" stroke="#c98a16" stroke-dasharray="4 3"', 'Sight triangle (25 ft): nothing over 30" or under 7 ft canopy'), legendLine('property')];

// ---------- L-001 landscape notes and calculations ----------
// the numbers L-001 shows (and the tests read): areas, the requirements with what's shown, the palette
export function calcs(ctx) {
  const G = K.geo(ctx), Ld = design(G), H = hydro(G), site = S.ringArea(G.ring), cnt = plantCounts(Ld);
  const built = G.B.reduce((s, b) => s + S.ringArea(b.o), 0), pave = K.pavement(G).reduce((s, pv) => s + S.ringArea(pv.outer) - pv.holes.reduce((t, h) => t + S.ringArea(h), 0), 0), pond = G.ponds.reduce((s, q) => s + S.ringArea(q.o), 0);
  const lotSf = H.sf.lot || 0, land = Math.max(0, site - built - pave - pond), treesAll = Ld.trees.filter(t => TREE(t.code)), byCode = {}; for (const t of treesAll) byCode[t.code] = (byCode[t.code] || 0) + 1;
  const top = Object.entries(byCode).sort((a, b) => b[1] - a[1])[0] || ['—', 0], share = treesAll.length ? top[1] / treesAll.length : 0, canopy = treesAll.reduce((s, t) => s + Math.PI * (PLANTS[t.code][6] / 2) ** 2, 0);
  const sum = (L, k) => L.reduce((s, f) => s + f[k], 0), fNeed = sum(Ld.req.frontage, 'need'), fHave = Math.min(fNeed, sum(Ld.req.frontage.map(f => ({ h: Math.min(f.have, f.need) })), 'h')), bNeed = sum(Ld.req.buffer, 'need'), bHave = sum(Ld.req.buffer.map(f => ({ h: Math.min(f.have, f.need) })), 'h');
  const ok = (have, need) => have >= need ? 'Meets' : 'Short ' + f0(need - have), commercial = !G.res;
  const rows = [
    ['Street frontage: 1 canopy tree per ' + RULES.street + ' LF (less drive openings)', f0(fNeed), f0(fHave), ok(fHave, fNeed)],
    ...(Ld.req.park.stalls ? [['Parking: 1 tree per ' + RULES.parking + ' spaces within ' + RULES.parkReach + ' ft (' + f0(Ld.req.park.stalls) + ' spaces)', f0(Ld.req.park.need), f0(Ld.req.park.have), ok(Ld.req.park.have, Ld.req.park.need)],
      ['Parking within ' + RULES.screen + ' ft of a street screened by a 3 ft hedge', Ld.req.screenNeed ? f0(Ld.req.screenNeed) + ' LF' : 'None that close', f0(Ld.req.screenLf) + ' LF', Ld.req.screenLf >= Ld.req.screenNeed * 0.85 ? 'Meets' : 'Short']] : []),
    ...(commercial && bNeed ? [['Perimeter buffer: 1 canopy tree per ' + RULES.perimeter + ' LF of other property lines', f0(bNeed), f0(bHave), ok(bHave, bNeed)], ['Evergreen screen where paving or a building is within ' + RULES.screenIn + ' ft of a property line', 'Where it applies', f0(Ld.req.bufferLf) + ' LF', 'Meets']] : []),
    ...(Ld.req.lots.need ? [['Homes: 1 canopy tree in each front yard', f0(Ld.req.lots.need), f0(Ld.req.lots.have), ok(Ld.req.lots.have, Ld.req.lots.need)]] : []),
    ...(commercial ? [['Landscape area: ' + Math.round(RULES.landPct * 100) + '% of the site or more', f0(site * RULES.landPct) + ' sf', f0(land) + ' sf (' + Math.round(land / site * 100) + '%)', land >= site * RULES.landPct ? 'Meets' : 'Short']] : []),
    ['Species diversity: no species over ' + Math.round(RULES.maxSpecies * 100) + '% of the trees', '≤ ' + Math.round(RULES.maxSpecies * 100) + '%', (PLANTS[top[0]]?.[0] || '—') + ' ' + Math.round(share * 100) + '%', share <= RULES.maxSpecies ? 'Meets' : 'Over']
  ];
  return { G, Ld, H, cnt, site, built, pave, pond, land, lotSf, canopy, rows, share };
}
function notesSheet(ctx, sh) {
  const C = calcs(ctx), { site, built, pave, pond, land, lotSf, canopy, cnt } = C, pct = v => (v / site * 100).toFixed(1) + '%';
  const areaRows = [['Site', f0(site) + ' sf', (site / 43560).toFixed(2) + ' ac', '100%'], ['Building footprints', f0(built) + ' sf', K.ac(built) + ' ac', pct(built)], ['Paving (drives, parking, walks)', f0(pave) + ' sf', K.ac(pave) + ' ac', pct(pave)], ['Detention ponds', f0(pond) + ' sf', K.ac(pond) + ' ac', pct(pond)],
    ['Landscape (pervious)', f0(land) + ' sf', K.ac(land) + ' ac', pct(land)], ...(lotSf ? [['… of it on home lots (by the builder)', f0(lotSf) + ' sf', K.ac(lotSf) + ' ac', pct(lotSf)]] : []), ['Tree canopy at maturity (est., overlaps not netted)', f0(canopy) + ' sf', K.ac(canopy) + ' ac', pct(Math.min(canopy, site))]];
  const pal = Object.keys(PLANTS).filter(k => cnt[k]).map(k => [k, PLANTS[k][0] + ' — ' + PLANTS[k][1], PLANTS[k][3], PLANTS[k][2], PLANTS[k][4], PLANTS[k][5] === 'N' ? 'Native' : 'Adapted', f0(cnt[k])]);
  const H = C.H, turf = Object.keys(ZONES).filter(k => (H.sf[k] || 0) > 0).map(k => [ZONES[k].label, f0(H.sf[k]) + ' sf', ZONES[k].water]);
  const col1 = tbl('Site areas', ['Area', 'sf', 'ac', '% of site'], areaRows, [1, 2, 3]) + tbl('Landscape requirements (typical; confirm with the local ordinance)', ['Requirement', 'Required', 'Shown', 'Status'], C.rows, [1, 2]);
  const col2 = tbl('Plant palette and quantities', ['Code', 'Plant', 'Type', 'Size', 'Water', 'Origin', 'Qty'], pal, [6]) + tbl('Ground cover and turf', ['Area', 'Size', 'Water use'], turf, [1]);
  const general = ['Plants are native or adapted to the Texas Gulf Coast and chosen for low water use; substitutions of equal size and character with the landscape architect\'s approval.', 'Tree and screening rules shown are common local rules of thumb (street trees every 40 ft, a tree per 10 parking spaces, a 3 ft hedge screening parking from the street, buffers on other property lines): the city or county ordinance and any deed restrictions govern.',
    'Soil: test the topsoil; till 4 in of compost into all beds 8 in deep; sod on 2 in of topsoil, fine graded, rolled and watered in.', 'Trees 3 in caliper (canopy) and 30 gal. (ornamental) unless noted, ANSI Z60.1; set the root flare at or above grade; stake only where needed and remove stakes after one year.',
    'Keep trees 10 ft from utility lines and structures, 7 ft from hydrants, 10 ft in front of transformers and out of the 25 ft sight triangles at drives (nothing between 30 in and 7 ft there).', 'Automatic irrigation (L-201) with a rain / freeze sensor and a backflow preventer, designed and installed by a licensed irrigator (TCEQ, 30 TAC 344).',
    'Existing trees are not known (no tree survey): a survey and any protected-tree mitigation the ordinance asks for come before final design; protect trees kept with fencing at the drip line (L-501).', 'Maintenance: one-year establishment and warranty period; replace dead or declining plants at the next planting season; mulch renewed yearly.'];
  sh.scale = 'N.T.S.';
  return at(MAIN.x, MAIN.y, MAIN.w, MAIN.h, '<div style="display:grid;grid-template-columns:1fr 1fr;gap:18pt;align-items:start"><div>' + col1 + '</div><div>' + col2 + '</div></div>') +
    side(notes('Landscape notes', general) + K.discBlocks(ctx, 'landscape', 'Landscape', true) + warn('Quantities are counted from the schematic planting on L-101; the landscape architect lays out the final plan and the ordinance calculations.'));
}

// ---------- L-101 planting plan ----------
function plantSheet(ctx, sh) {
  const G = K.geo(ctx), V = K.view(G), L = K.placer(), C = calcs(ctx), o = [];
  o.push(K.ground(G, V, { lawn: '#e8f1df', pave: '#f6f6f4', curb: '#a3a8a5', bAttr: 'fill="#fff" stroke="#4d5457" stroke-width="1.1"', walks: true, pondFill: '#e3eef7' }));
  o.push(plantingLayer(G, V, C.Ld), K.bLabels(G, V, L));
  for (const p of G.ponds) { const c = V.X(S.centroid(p.o)); o.push(L.put(c[0], c[1], 'DETENTION — BERMUDA / NATIVE SEED ON SLOPES', 8, { bold: true, fill: '#173a55' })); }
  const sched = Object.keys(PLANTS).filter(k => C.cnt[k]).map(k => [k, PLANTS[k][0], PLANTS[k][2], f0(C.cnt[k])]);
  const sideHtml = legendHtml(plantLegend()) + tbl('Plant schedule', ['Code', 'Plant', 'Size', 'Qty'], sched, [3]) +
    tbl('Requirements (see L-001)', ['Requirement', 'Req.', 'Shown', ''], C.rows.map(r => [r[0].replace(/ \(.*\)$/, ''), r[1], r[2], r[3]]), [1, 2]) +
    notes('Notes', ['See L-001 for the site areas, the full plant palette and the landscape notes; L-102 for enlargements; L-201 for irrigation; L-501 for planting details.', 'Sod all disturbed areas not paved, planted or seeded: St. Augustine \'Raleigh\' near buildings, walks and the street; Bermuda \'Tifway 419\' in open lawns (L-201).',
      'Locate trees in the field with the landscape architect before digging; call 811 first.']) + warn('Plants are placed by rule from the plan; the landscape architect lays out the final plan.');
  return K.planPage(sh, V, o.join(''), sideHtml, 'Planting plan');
}

// ---------- L-102 enlargements: the main entry and the amenity ----------
// the frames round the spots worth enlarging, each `asp` (height / width) like the panel it's drawn in: { box (plan ft), title }
function spots(G, asp) {
  const out = [], o0 = S.outwardOf(G.ring, G.entryEdge ?? G.fi), inn = [-o0[0], -o0[1]], frame = (c, w) => { const h = w * asp; return [c[0] - w / 2, c[1] - h / 2, c[0] + w / 2, c[1] + h / 2]; };
  out.push({ box: frame(plus(G.entry, inn, 420 * asp / 2 - 30), 420), title: 'Main entry' });
  const am = G.els.filter(e => (e.kind === 'building' && e.use === 'amenity') || e.kind === 'pool' || e.kind === 'play' || e.kind === 'court' || (e.kind === 'plaza' && /pool|deck/i.test(e.note || '')));
  if (am.length) { const b = K.bboxOf(am.flatMap(e => S.shapeOf(e))); out.push({ box: frame([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], Math.max(420, b[2] - b[0] + 120, (b[3] - b[1] + 120) / asp)), title: 'Amenity area' }); return out; }
  const lot = G.els.filter(e => e.kind === 'lot').sort((a, b) => dist([a.x, a.y], S.centroid(G.ring)) - dist([b.x, b.y], S.centroid(G.ring)))[0], bb = lot ? null : G.B.filter(b => !b.res).sort((a, b) => b.area - a.area)[0];
  out.push({ box: frame(lot ? [lot.x, lot.y] : bb ? bb.c : S.centroid(G.ring), 420), title: lot ? 'Typical lots' : 'Building frontage' });
  return out;
}
function enlargeSheet(ctx, sh) {
  const G = K.geo(ctx), C = calcs(ctx), N = 2, hPan = MAIN.h / N, wPt = MAIN.w, hPt = hPan - 60, list = spots(G, hPt / wPt), scales = [];
  const panels = list.map((s, i) => {
    const [bx0, by0, bx1, by1] = s.box, sc = engScale(bx1 - bx0, by1 - by0, wPt / PT, hPt / PT), k = sc.k, X = p => [(p[0] - bx0) * k, (by1 - p[1]) * k], V = { k, sc, X, P: pts => pts.map(X), turn: G.turn, W: (bx1 - bx0) * k, H: (by1 - by0) * k };
    scales.push(sc.label); const L = K.placer(), cid = 'enl' + i, o = [], seen = p => p[0] > 0 && p[1] > 0 && p[0] < V.W && p[1] < V.H;
    o.push(K.ground(G, V, { lawn: '#e8f1df', pave: '#f6f6f4', curb: '#a3a8a5', bAttr: 'fill="#fff" stroke="#4d5457" stroke-width="1.1"', walks: true, pondFill: '#e3eef7' }), plantingLayer(G, V, C.Ld, { min: 4, label: 9 }), K.bLabels(G, V, L));
    // the codes of the hedges and the shrubs (one label a run or a group)
    for (const h of C.Ld.hedges) { const p = X(h.pts[Math.floor(h.pts.length / 2)]); if (seen(p)) o.push(L.put(p[0], p[1] - 9, h.pts.length + ' ' + h.code, 8, { bold: true, fill: '#2f4a22' })); }
    const groups = new Map(); for (const s2 of C.Ld.shrubs) { const g = s2.code + '|' + Math.floor(s2.p[0] / 40) + ',' + Math.floor(s2.p[1] / 40); (groups.get(g) || groups.set(g, []).get(g)).push(s2); }
    for (const [g, l2] of groups) { const c = X([l2.reduce((t, q) => t + q.p[0], 0) / l2.length, l2.reduce((t, q) => t + q.p[1], 0) / l2.length]); if (seen(c)) o.push(L.put(c[0] + 10, c[1] - 8, l2.length + ' ' + g.split('|')[0], 7.5, { anchor: 'start', fill: '#2f4a22' })); }
    const body = '<defs><clipPath id="' + cid + '"><rect x="0" y="0" width="' + n(V.W) + '" height="' + n(V.H) + '"/></clipPath></defs><g clip-path="url(#' + cid + ')">' + o.join('') + '</g><rect x="0" y="0" width="' + n(V.W) + '" height="' + n(V.H) + '" fill="none" stroke="' + INK + '" stroke-width=".8"/>';
    return at(MAIN.x, MAIN.y + i * hPan, MAIN.w, hPan - 10, '<div style="height:100%;display:flex;flex-direction:column;gap:6pt"><div style="flex:1;display:flex;align-items:center;justify-content:center;min-height:0">' + svg(V.W, V.H, body) + '</div><div style="display:flex;align-items:center;gap:18pt">' + viewTitle(i + 1, s.title + ' — planting enlargement', sc.label) + scaleBar(sc.ft) + '</div></div>') +
      at(MAIN.x, MAIN.y + i * hPan, 70, 70, northArrow(G.turn, 54));
  });
  sh.scale = [...new Set(scales)].join(', ');
  return panels.join('') + side(legendHtml(plantLegend()) + notes('Notes', ['Enlargements show every plant with its code and the count in each hedge run or shrub group; quantities are on L-001.', 'Groundcover beds at the monument signs: Asian jasmine 12 in o.c. with a ring of Lantana for colour; grasses either side of the entry drive.', 'Keep the 25 ft sight triangles at the drives clear between 30 in and 7 ft.']) + warn('Enlargements of the schematic planting; not for construction.'));
}

// ---------- L-201 irrigation plan (schematic) ----------
function irrigationSheet(ctx, sh) {
  const G = K.geo(ctx), V = K.view(G), L = K.placer(), C = calcs(ctx), H = C.H, X = V.X, o = [];
  o.push(K.ground(G, V, { pave: '#f6f6f4', curb: '#a3a8a5', bAttr: 'fill="#fff" stroke="#4d5457" stroke-width="1.1"', pondFill: '#e3eef7' }));
  const cid = 'irr' + Math.random().toString(36).slice(2, 7); o.push('<defs><clipPath id="' + cid + '">' + poly(V.P(G.ring), '') + '</clipPath></defs><g clip-path="url(#' + cid + ')" opacity=".85">');
  for (const r of H.runs) { const a = X([r.x, r.y + r.h]); o.push('<rect x="' + n(a[0]) + '" y="' + n(a[1]) + '" width="' + n(r.w * V.k + 0.3) + '" height="' + n(r.h * V.k + 0.3) + '" fill="' + ZONES[r.k].col + '"/>'); }
  o.push('</g>', K.ground(G, V, { paving: false, lots: true, ponds: false, buildings: true, bAttr: 'fill="#fff" stroke="#4d5457" stroke-width="1.1"' }));
  for (const b of C.Ld.beds) o.push(poly(V.P(b), 'fill="' + ZONES.drip.col + '" stroke="#b39b72" stroke-width=".5"'));
  for (const m of C.Ld.masses) o.push(poly(V.P(m.poly), 'fill="' + ZONES.drip.col + '" stroke="#b39b72" stroke-width=".5"'));
  // the mainline along the drives, a lateral from it to each valve, the point of connection and the controller
  const W = K.net(G, 'water'), mains = W.edges.map(([a, b]) => ({ a: plus(a.p, unit(a.p, b.p), 0), b: b.p }));
  o.push(path(mains.map(s => { const p = X(s.a), q = X(s.b); return 'M' + n(p[0]) + ' ' + n(p[1]) + 'L' + n(q[0]) + ' ' + n(q[1]); }).join(''), 'fill="none" stroke="#7b3fa0" stroke-width="1.6"'));
  const tagOf = { spray: 'S', rotor: 'R', drip: 'D', bubbler: 'B' }, num = {};
  for (const v of H.valves) { const q = mains.length ? mains.map(s => foot(v.p, s.a, s.b)).sort((a, b) => a.d - b.d)[0].q : H.poc, a = X(v.p), b = X(q); num[v.k] = (num[v.k] || 0) + 1;
    o.push(dist(v.p, q) < 160 ? line(a[0], a[1], b[0], b[1], 'stroke="#7b3fa0" stroke-width=".6" stroke-dasharray="3 2"') : '', '<rect x="' + n(a[0] - 3.5) + '" y="' + n(a[1] - 3.5) + '" width="7" height="7" fill="#fff" stroke="#7b3fa0" stroke-width="1.1"/>', L.put(a[0] + 6, a[1] - 6, tagOf[v.k] + num[v.k], 7, { anchor: 'start', bold: true, fill: '#5b2d78' })); }
  const pc = X(H.poc), cc = X(H.ctl);
  o.push(circle(pc[0], pc[1], 6, 'fill="#fff" stroke="#7b3fa0" stroke-width="1.6"'), T(pc[0], pc[1], 'M', 7, { bold: true, fill: '#5b2d78', halo: false }), '<rect x="' + n(pc[0] + 9) + '" y="' + n(pc[1] - 5) + '" width="14" height="10" fill="#7b3fa0"/>', L.put(pc[0] + 26, pc[1] + 12, 'POC: METER + RPZ BACKFLOW', 7.5, { anchor: 'start', bold: true, fill: '#5b2d78', force: true }));
  o.push('<rect x="' + n(cc[0] - 6) + '" y="' + n(cc[1] - 6) + '" width="12" height="12" fill="#5b2d78"/>', T(cc[0], cc[1], 'C', 7, { bold: true, fill: '#fff', halo: false }), L.put(cc[0] + 9, cc[1] - 10, 'CONTROLLER + RAIN/FREEZE SENSOR', 7.5, { anchor: 'start', bold: true, fill: '#5b2d78', force: true }));
  if (mains.length && dist(H.poc, H.ctl) > 1) { const a = X(H.poc), b = X(mains.map(s => foot(H.poc, s.a, s.b)).sort((x, y) => x.d - y.d)[0].q); o.push(line(a[0], a[1], b[0], b[1], 'stroke="#7b3fa0" stroke-width="1.6"')); }
  o.push(K.bLabels(G, V, L));
  const zn = ['spray', 'rotor', 'drip', 'bubbler'].map(k => { const c = H.valves.filter(v => v.k === k).length; return c ? [tagOf[k] + '1–' + tagOf[k] + c, k === 'bubbler' ? 'Tree bubblers (2 per tree)' : ZONES[k].label, k === 'bubbler' ? f0(H.trees) + ' trees' : f0(H.sf[k] || 0) + ' sf', String(c), k === 'bubbler' ? '1.0 gpm/tree' : ZONES[k].pr + ' in/hr'] : null; }).filter(Boolean);
  const nV = H.valves.length, gal = H.gal.spray + H.gal.rotor + H.gal.drip;
  const sideHtml = legendHtml([...['spray', 'rotor', 'native', 'bank', 'lot'].filter(k => H.sf[k]).map(k => sw('fill="' + ZONES[k].col + '" stroke="#b5b8b6"', ZONES[k].label)), sw('fill="' + ZONES.drip.col + '" stroke="#b39b72"', ZONES.drip.label),
      '<div class="lg2">' + svg(44, 12, line(2, 6, 42, 6, 'stroke="#7b3fa0" stroke-width="1.6"')) + '<span>Mainline, 2 in Sch. 40 PVC (follows the drives)</span></div>', '<div class="lg2">' + svg(26, 16, '<rect x="9" y="4" width="8" height="8" fill="#fff" stroke="#7b3fa0" stroke-width="1.1"/>') + '<span>Valve (zone): S spray, R rotor, D drip, B bubbler</span></div>', legendLine('property')]) +
    tbl('Zones (schematic)', ['Valves', 'Type', 'Area', 'No.', 'Precip.'], zn, [2, 3]) +
    tbl('System', null, [['Design flow per zone', GPM + ' gpm (one zone at a time)'], ['Meter and backflow', '1-1/2 in meter; 1-1/2 in reduced-pressure (RPZ) backflow preventer'], ['Controllers', Math.max(1, Math.ceil(nV / 48)) + ' × 48-station smart (ET) controller'], ['Stations', String(nV)],
      ['Water use, a typical year (est.)', f0(gal / 1000) + ' thousand gal (before rainfall)'], ['ET₀ used', ETO + ' in/yr (Waller County, TexasET)']]) +
    notes('Notes', ['Schematic: zones, valve counts and the mainline route are sized by rule (about ' + GPM + ' gpm a zone) for pricing; a licensed irrigator (TCEQ, 30 TAC 344) designs the system and confirms the static pressure at the meter.', 'Hydrozones: spray and drip on separate valves from rotors; trees on their own bubbler zones so they can be watered deeply and less often.',
      'Native grass areas and pond slopes are not irrigated: water them by hand or temporary spray until established, then stop.', ...(H.sf.lot ? ['Home lots: sod and irrigation by the home builder to the HOA\'s standards; the common system waters the common areas only.'] : []),
      'Sleeves: 2× the pipe size, Sch. 40 PVC, under all paving, 24 in below the finish grade at drives.']) + warn('Irrigation shown is schematic; not for construction.');
  return K.planPage(sh, V, o.join(''), sideHtml, 'Irrigation plan');
}

// ---------- L-501 and L-502 details ----------
const { lead, lab, box } = K;
const earth = (W, gy, H, op = 0.45) => box(40, gy, W - 80, H - gy - 30, 'fill="url(#earth)" stroke="none" opacity="' + op + '"');
const ground0 = (W, gy) => line(30, gy, W - 30, gy, 'stroke="' + INK + '" stroke-width="1.4"');
const canopyC = (cx, cy, list) => list.map(([dx, dy, r]) => circle(cx + dx, cy + dy, r, 'fill="#dbe9cf" stroke="#4f7a3a" stroke-width="1"')).join('');
const DL = {
  tree(W, H) { const gy = H * 0.52, cx = W / 2, bw = 150, bh = 120, o = [];
    o.push(earth(W, gy, H), path('M' + n(cx - bw * 1.5) + ' ' + n(gy) + 'L' + n(cx - bw * 0.9) + ' ' + n(gy + bh) + 'H' + n(cx + bw * 0.9) + 'L' + n(cx + bw * 1.5) + ' ' + n(gy) + 'Z', 'fill="#efe7d6" stroke="' + INK + '" stroke-width="1" stroke-dasharray="6 4"'));
    o.push(path('M' + n(cx - bw / 2) + ' ' + n(gy - 4) + 'Q' + n(cx - bw / 2 - 10) + ' ' + n(gy + bh * 0.6) + ' ' + n(cx - bw * 0.35) + ' ' + n(gy + bh) + 'H' + n(cx + bw * 0.35) + 'Q' + n(cx + bw / 2 + 10) + ' ' + n(gy + bh * 0.6) + ' ' + n(cx + bw / 2) + ' ' + n(gy - 4) + 'Z', 'fill="#c9a77c" stroke="' + INK + '" stroke-width="1.4"'));
    o.push(box(cx - bw * 1.5, gy - 8, bw * 3, 8, 'fill="#8a6d4a" stroke="none"'), box(cx - 9, gy - 330, 18, 330, 'fill="#8a6d4a" stroke="' + INK + '" stroke-width="1"'), path('M' + n(cx - bw * 1.5) + ' ' + n(gy - 8) + 'q12 -16 24 0', 'fill="#a9c79a" stroke="' + INK + '" stroke-width="1"'), path('M' + n(cx + bw * 1.5 - 24) + ' ' + n(gy - 8) + 'q12 -16 24 0', 'fill="#a9c79a" stroke="' + INK + '" stroke-width="1"'));
    o.push(canopyC(cx, gy, [[0, -400, 95], [-80, -350, 75], [85, -345, 75], [-40, -455, 60], [50, -450, 60]]), ground0(W, gy), line(cx - bw * 0.75, gy - 200, cx - bw * 0.75, gy + 60, 'stroke="#6b7174" stroke-width="2" stroke-dasharray="8 4"'), line(cx - bw * 0.75, gy - 180, cx - 9, gy - 170, 'stroke="#6b7174" stroke-width="1"'));
    o.push(K.lab(cx, gy + bh + 30, '3 × ROOT BALL WIDTH', 11));
    o.push(lead(cx + 9, gy - 14, W - 60, gy - 160, 'ROOT FLARE AT OR 1–2" ABOVE FINISHED GRADE'), lead(cx + bw, gy - 4, W - 60, gy - 90, '3" SHREDDED HARDWOOD MULCH,\nKEPT 3" CLEAR OF THE TRUNK'), lead(cx + bw * 1.45, gy - 10, W - 60, gy - 30, '4" WATERING SAUCER AT THE BALL EDGE'), lead(cx - bw * 0.75, gy - 140, 60, gy - 220, 'STAKE ONLY IF NEEDED: 2 STAKES,\nFLEXIBLE TIES; REMOVE AFTER 1 YEAR'),
      lead(cx - bw * 1.1, gy + 40, 60, gy + 80, 'BACKFILL: EXISTING SOIL, LOOSENED;\nAMEND ONLY PER THE SOIL REPORT'), lead(cx + 30, gy + 40, W - 60, gy + 60, 'REMOVE THE TOP 1/3 OF BURLAP\nAND ALL WIRE AND TWINE'), lead(cx, gy + bh, W - 60, H - 50, 'SET THE BALL ON UNDISTURBED SOIL;\nPIT DEPTH = BALL HEIGHT'));
    return o.join(''); },
  multi(W, H) { const gy = H * 0.6, cx = W / 2, o = [];
    o.push(earth(W, gy, H), box(cx - 120, gy - 6, 240, 6, 'fill="#8a6d4a" stroke="none"'), path('M' + n(cx - 55) + ' ' + n(gy) + 'Q' + n(cx - 60) + ' ' + n(gy + 60) + ' ' + n(cx - 35) + ' ' + n(gy + 80) + 'H' + n(cx + 35) + 'Q' + n(cx + 60) + ' ' + n(gy + 60) + ' ' + n(cx + 55) + ' ' + n(gy) + 'Z', 'fill="#c9a77c" stroke="' + INK + '" stroke-width="1.3"'));
    for (const [x1, x2] of [[-20, -110], [0, 0], [20, 110]]) o.push(path('M' + n(cx + x1) + ' ' + n(gy - 4) + 'Q' + n(cx + x1 + x2 * 0.2) + ' ' + n(gy - 120) + ' ' + n(cx + x2) + ' ' + n(gy - 230), 'fill="none" stroke="#8a6d4a" stroke-width="9" stroke-linecap="round"'));
    o.push(canopyC(cx, gy, [[-110, -260, 60], [0, -290, 70], [110, -260, 60], [-55, -320, 50], [55, -320, 50]]), ground0(W, gy));
    o.push(lead(cx - 15, gy - 60, 60, gy - 120, '3 TO 5 TRUNKS, EVENLY SPACED;\nNO CROSSING OR RUBBING STEMS'), lead(cx + 90, gy - 4, W - 60, gy - 40, '3" MULCH RING, 5 FT DIA. MIN.'), lead(cx + 40, gy + 50, W - 60, gy + 110, 'PIT 2× THE ROOT BALL WIDTH;\nBALL ON UNDISTURBED SOIL'), lead(cx - 140, gy - 250, 60, 50, 'CRAPE MYRTLE, REDBUD, YAUPON: SEE SCHEDULE;\nDO NOT TOP OR "CRAPE MURDER" WHEN PRUNING'));
    return o.join(''); },
  shrub(W, H) { const gy = H * 0.5, cx = W * 0.4, o = [];
    o.push(earth(W, gy, H), box(cx - 170, gy, 340, 90, 'fill="#efe7d6" stroke="' + INK + '" stroke-width="1" stroke-dasharray="6 4"'), path('M' + n(cx - 60) + ' ' + n(gy - 6) + 'Q' + n(cx - 66) + ' ' + n(gy + 50) + ' ' + n(cx - 40) + ' ' + n(gy + 70) + 'H' + n(cx + 40) + 'Q' + n(cx + 66) + ' ' + n(gy + 50) + ' ' + n(cx + 60) + ' ' + n(gy - 6) + 'Z', 'fill="#c9a77c" stroke="' + INK + '" stroke-width="1.3"'));
    o.push(box(cx - 170, gy - 7, 340, 7, 'fill="#8a6d4a" stroke="none"'), ground0(W, gy));
    for (const [dx, dy, r] of [[0, -70, 55], [-50, -45, 40], [50, -45, 40], [-25, -100, 35], [30, -100, 35]]) o.push(circle(cx + dx, gy + dy, r, 'fill="#cfe3bf" stroke="#4f7a3a" stroke-width="1"'));
    const px = W * 0.8, py = gy - 160; for (const [dx, dy] of [[-40, 0], [40, 0], [0, -69]]) o.push(circle(px + dx, py + dy, 26, 'fill="#cfe3bf" stroke="#4f7a3a" stroke-width="1"'), circle(px + dx, py + dy, 2, 'fill="' + INK + '"'));
    o.push(poly([[px - 40, py], [px + 40, py], [px, py - 69]], 'fill="none" stroke="' + INK + '" stroke-width=".8" stroke-dasharray="4 3"'), lab(px, py + 46, 'TRIANGULAR SPACING,\nO.C. PER SCHEDULE (PLAN)', 10));
    o.push(lab(cx, gy + 120, '2 × ROOT BALL WIDTH', 11), lead(cx + 60, gy - 4, W - 60, gy - 30, '3" SHREDDED HARDWOOD MULCH'), lead(cx + 30, gy - 4, W - 60, gy + 30, 'TOP OF ROOT BALL 1" ABOVE GRADE'), lead(cx - 120, gy + 40, 60, H - 60, 'BED: 4" COMPOST TILLED 8" DEEP INTO\nTHE WHOLE BED; LOOSEN CIRCLING ROOTS'));
    return o.join(''); },
  island(W, H) { const gy = H * 0.58, cx = W / 2, iw = 150, o = [];
    o.push(earth(W, gy + 30, H, 0.35), box(40, gy, cx - iw / 2 - 40, 30, 'fill="url(#conc)" stroke="' + INK + '" stroke-width="1"'), box(cx + iw / 2, gy, W - 40 - cx - iw / 2, 30, 'fill="url(#conc)" stroke="' + INK + '" stroke-width="1"'));
    for (const sg of [-1, 1]) o.push(box(sg < 0 ? cx - iw / 2 - 12 : cx + iw / 2, gy - 24, 12, 54, 'fill="url(#conc)" stroke="' + INK + '" stroke-width="1.4"'));
    o.push(box(cx - iw / 2, gy - 18, iw, 18 + 70, 'fill="#efe7d6" stroke="none"'), box(cx - iw / 2, gy - 24, iw, 6, 'fill="#8a6d4a" stroke="none"'), box(cx - 8, gy - 300, 16, 280, 'fill="#8a6d4a" stroke="' + INK + '" stroke-width="1"'), canopyC(cx, gy, [[0, -340, 85], [-70, -300, 65], [70, -300, 65]]));
    o.push(lab(cx, gy + 130, "9'-0\" MIN. INSIDE THE CURBS (ONE STALL WIDE)", 10.5, { bold: true }));
    o.push(lead(cx - iw / 2 - 6, gy - 20, 50, gy + 95, '6" CURB AROUND THE ISLAND;\nWHEEL STOPS OR 2 FT OVERHANG KEPT CLEAR'), lead(cx + 40, gy + 20, W - 50, gy - 170, 'PLANTING SOIL TO 24" DEEP, ROAD BASE AND\nCONSTRUCTION DEBRIS REMOVED'), lead(cx + 20, gy + 40, W - 60, gy + 70, 'TREE PER DETAIL 1; LOWEST LIMBS 7 FT\nABOVE THE PAVING AT MATURITY'), lead(80, gy + 15, 60, H - 40, 'PAVING PER CIVIL'));
    return o.join(''); },
  protect(W, H) { const gy = H * 0.62, cx = W / 2, R = 230, o = [];
    o.push(earth(W, gy, H, 0.4), ground0(W, gy), box(cx - 12, gy - 280, 24, 280, 'fill="#8a6d4a" stroke="' + INK + '" stroke-width="1"'), canopyC(cx, gy, [[0, -350, 140], [-130, -300, 100], [130, -300, 100]]));
    o.push(path('M' + n(cx - R) + ' ' + n(gy) + 'Q' + n(cx) + ' ' + n(gy + 150) + ' ' + n(cx + R) + ' ' + n(gy), 'fill="none" stroke="#8a6d4a" stroke-width="1" stroke-dasharray="6 4"'), lab(cx, gy + 90, 'ROOT ZONE', 11, { bold: true, fill: '#6b4a2b' }));
    for (const sg of [-1, 1]) { const x = cx + sg * R; o.push(box(x - (sg > 0 ? 0 : 70), gy - 72, 70, 72, 'fill="url(#mesh)" stroke="#e07b24" stroke-width="1.6"'), line(x, gy - 80, x, gy + 30, 'stroke="' + INK + '" stroke-width="3"'), line(x - sg * 70, gy - 80, x - sg * 70, gy + 30, 'stroke="' + INK + '" stroke-width="3"')); }
    o.push(lab(cx, gy + 160, 'DRIP LINE, OR 1 FT PER INCH OF TRUNK DIAMETER (GREATER)', 10.5));
    o.push(lead(cx - R - 35, gy - 40, 60, gy - 200, '4\' ORANGE SAFETY FENCE ON STEEL T-POSTS\nAT 8\' O.C., INSTALLED BEFORE ANY WORK'), lead(cx + R + 35, gy - 30, W - 50, gy - 220, 'NO STORAGE, PARKING, GRADING OR\nTRENCHING INSIDE THE FENCE'));
    return o.join(''); },
  edge(W, H) { const gy = H * 0.45, ex = W * 0.45, o = [];
    o.push(box(40, gy, W - 80, 160, 'fill="url(#earth)" stroke="none" opacity=".4"'), box(ex, gy - 24, W - 40 - ex, 24, 'fill="#8a6d4a" stroke="' + INK + '" stroke-width="1"'), box(ex, gy, W - 40 - ex, 70, 'fill="#efe7d6" stroke="none"'), box(40, gy - 10, ex - 40, 10, 'fill="#a9c79a" stroke="' + INK + '" stroke-width="1"'));
    for (let x = 46; x < ex - 4; x += 9) o.push(line(x, gy - 10, x + 3, gy - 22, 'stroke="#4f7a3a" stroke-width="1"'));
    o.push(box(ex - 3, gy - 32, 5, 72, 'fill="' + INK + '" stroke="none"'), line(30, gy, W - 30, gy, 'stroke="' + INK + '" stroke-width="1.2" stroke-dasharray="4 3"'), box(ex + 10, gy, 6, 90, 'fill="#6b7174" stroke="none"'));
    o.push(lead(ex - 1, gy - 32, ex - 160, gy - 140, '3/16" × 4" STEEL EDGING, TOP 1/2" ABOVE\nGRADE, STAKES AT 4\' O.C.'), lead(120, gy - 14, 80, gy + 220, 'SOD (ST. AUGUSTINE \'RALEIGH\')'), lead(ex + 160, gy - 12, W - 60, gy - 140, '3" SHREDDED HARDWOOD MULCH'), lead(ex + 200, gy + 40, W - 60, gy + 220, 'PREPARED PLANTING SOIL, 8" DEEP'), lead(ex + 13, gy + 80, ex + 80, gy + 260, 'EDGING STAKE'));
    return o.join(''); },
  // irrigation (L-502)
  backflow(W, H) { const gy = H * 0.66, cx = W / 2, o = [];
    o.push(box(cx - 190, gy, 380, 26, 'fill="url(#conc)" stroke="' + INK + '" stroke-width="1.2"'), earth(W, gy + 26, H, 0.4), ground0(W, gy));
    o.push(path('M' + n(cx - 150) + ' ' + n(gy + 90) + 'V' + n(gy - 120) + 'H' + n(cx + 150) + 'V' + n(gy + 90), 'fill="none" stroke="#2f6db5" stroke-width="7"'), box(cx - 90, gy - 140, 180, 40, 'fill="#c9d6e8" stroke="' + INK + '" stroke-width="1.4"'), box(cx - 60, gy - 100, 120, 30, 'fill="#c9d6e8" stroke="' + INK + '" stroke-width="1"'));
    for (const x of [cx - 120, cx + 120]) o.push(circle(x, gy - 120, 11, 'fill="#fff" stroke="' + INK + '" stroke-width="1.4"'), line(x, gy - 131, x, gy - 148, 'stroke="' + INK + '" stroke-width="2"'));
    o.push(path('M' + n(cx - 200) + ' ' + n(gy) + 'V' + n(gy - 220) + 'H' + n(cx + 200) + 'V' + n(gy), 'fill="none" stroke="#6b7174" stroke-width="1.4" stroke-dasharray="7 4"'));
    o.push(lead(cx, gy - 140, cx + 40, 40, 'REDUCED-PRESSURE (RPZ) BACKFLOW PREVENTER,\nSIZE PER L-201, TESTED AT INSTALLATION (TCEQ)'), lead(cx - 120, gy - 120, 60, gy - 200, 'BALL VALVE EACH SIDE (TYP.)'), lead(cx + 200, gy - 160, W - 50, gy - 260, 'LOCKING INSULATED ENCLOSURE;\nSCREEN WITH SHRUBS (KEEP 3 FT CLEAR)'),
      lead(cx + 80, gy + 13, W - 60, gy + 70, '4" CONCRETE PAD, 6" BEYOND THE ENCLOSURE'), lead(cx - 150, gy + 60, 60, H - 40, 'FROM THE IRRIGATION METER;\n12" MIN. ABOVE GRADE (RELIEF PORT)'));
    return o.join(''); },
  heads(W, H) { const gy = H * 0.42, o = [];
    o.push(earth(W, gy, H, 0.4), ground0(W, gy), box(40, gy - 10, W - 80, 10, 'fill="#a9c79a" stroke="none"'));
    for (const [x, tall, name] of [[W * 0.3, 70, 'POP-UP SPRAY, 6" (TURF)\nOR 12" (BEDS), MATCHED-\nPRECIPITATION NOZZLES'], [W * 0.7, 95, 'GEAR-DRIVE ROTOR, 4" POP-UP,\nHEAD-TO-HEAD SPACING']]) {
      o.push(box(x - 13, gy - 6, 26, tall, 'fill="#4d5457" stroke="' + INK + '" stroke-width="1"'), path('M' + n(x) + ' ' + n(gy + tall - 6) + 'V' + n(gy + tall + 40) + 'H' + n(x - 90), 'fill="none" stroke="#2f6db5" stroke-width="5"'), box(x - 8, gy + tall + 20, 16, 30, 'fill="#c9d6e8" stroke="' + INK + '" stroke-width="1"'));
      o.push(lead(x + 13, gy - 2, x + 60, gy - 120, name), lead(x - 4, gy + tall + 32, x - 160, H - 50, 'SWING JOINT (TRIPLE ELBOW)\nTO THE LATERAL')); }
    o.push(lab(W / 2, 40, 'TOP OF HEAD FLUSH WITH FINISH GRADE; 4" OFF CURBS AND WALKS', 10.5, { bold: true }));
    return o.join(''); },
  drip(W, H) { const gy = H * 0.5, o = [];
    o.push(earth(W, gy, H, 0.4), box(40, gy - 8, W - 80, 8, 'fill="#8a6d4a" stroke="none"'), ground0(W, gy));
    for (let k = 0; k < 4; k++) o.push(circle(130 + k * ((W - 160) / 4), gy - 50, 34, 'fill="#cfe3bf" stroke="#4f7a3a" stroke-width="1"'));
    o.push(line(60, gy - 2, W - 60, gy - 2, 'stroke="#5b2d78" stroke-width="3"'));
    for (let x = 80; x < W - 70; x += 36) o.push(circle(x, gy - 2, 2.2, 'fill="#fff" stroke="#5b2d78" stroke-width="1"'));
    o.push(lead(140, gy - 2, 80, gy - 150, 'INLINE DRIP TUBING, 0.6 GPH EMITTERS AT 12" O.C.,\nROWS 18" APART, UNDER THE MULCH'), lead(W - 120, gy - 2, W - 60, H - 60, 'STAPLES AT 3 FT O.C.; FLUSH VALVE AND\nAIR RELIEF AT THE ENDS (TYP.)'), lead(W - 200, gy - 5, W - 80, gy - 200, 'DRIP ZONE KIT: VALVE, 120 MESH FILTER,\n30 PSI REGULATOR, IN ONE BOX'));
    return o.join(''); },
  bubbler(W, H) { const gy = H * 0.55, cx = W / 2, o = [];
    o.push(earth(W, gy, H, 0.4), box(cx - 150, gy - 7, 300, 7, 'fill="#8a6d4a" stroke="none"'), ground0(W, gy), box(cx - 9, gy - 260, 18, 260, 'fill="#8a6d4a" stroke="' + INK + '" stroke-width="1"'), canopyC(cx, gy, [[0, -300, 80], [-70, -260, 60], [70, -260, 60]]));
    for (const sg of [-1, 1]) { const x = cx + sg * 60; o.push(box(x - 5, gy - 12, 10, 12, 'fill="#4d5457" stroke="' + INK + '" stroke-width="1"'), path('M' + n(x) + ' ' + n(gy) + 'V' + n(gy + 50) + 'H' + n(cx + sg * 150), 'fill="none" stroke="#2f6db5" stroke-width="3"')); }
    o.push(lead(cx + 60, gy - 12, W - 60, gy - 100, 'TWO 1.0 GPM BUBBLERS PER TREE,\nAT THE EDGE OF THE ROOT BALL'), lead(cx - 60, gy + 30, 60, H - 60, 'ON A SEPARATE TREE ZONE; DEEP, INFREQUENT\nWATERING; MOVE OUT AS THE TREE GROWS'));
    return o.join(''); }
};
function detailsSheet(ctx, sh) {
  return K.detailSheet(ctx, sh, [[DL.tree, 'Tree planting'], [DL.multi, 'Multi-trunk ornamental tree'], [DL.shrub, 'Shrub and groundcover planting'], [DL.island, 'Parking island tree'], [DL.protect, 'Tree protection fence'], [DL.edge, 'Bed edge & mulch']], 3, 2,
    notes('Notes', ['Plant material per ANSI Z60.1, nursery grown, true to name; the landscape architect inspects before planting.', 'Water every plant thoroughly the day it is planted; the irrigation system runs before planting starts.', 'Mulch: 3 in shredded hardwood in all beds and tree rings; no landscape fabric under mulch in beds.',
      'Guarantee: one year from acceptance; replace dead or declining plants at the next planting season.', 'Tree protection fencing goes up before clearing and stays until landscaping starts.']) + K.discBlocks(ctx, 'landscape', 'Landscape') + warn('Typical details, not to scale; not for construction.'));
}
function irrDetailsSheet(ctx, sh) {
  return K.detailSheet(ctx, sh, [[DL.backflow, 'Backflow preventer'], [DL.heads, 'Spray head and rotor'], [DL.drip, 'Inline drip in beds'], [DL.bubbler, 'Tree bubblers']], 2, 2,
    notes('Notes', ['Irrigation by a licensed irrigator (TCEQ, 30 TAC 344): design, installation and the as-built drawings; backflow tested by a licensed tester at installation and yearly.', 'Pipe: mainline Sch. 40 PVC, 18 in cover; laterals Class 200 PVC, 12 in cover; sleeves under paving 2× the pipe size.', 'Controller: smart (ET-based) with a rain and freeze sensor; water between 10 pm and 8 am; seasonal adjustments monthly.',
      'Spray and rotor zones separate; heads spaced head-to-head; no overspray onto paving or buildings.']) + warn('Typical details, not to scale; not for construction.'));
}

export const RENDERERS = { 'l-notes': notesSheet, 'l-plan': plantSheet, 'l-enlarge': enlargeSheet, 'l-irrig': irrigationSheet, 'l-details': detailsSheet, 'l-irr-details': irrDetailsSheet };
