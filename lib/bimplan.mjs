// A detailed BIM model of a site plan option: every building built from its floor-plan design (lib/plandesign.mjs, the
// same design the plan set draws), so the site plan, the plan set and the model are one building. bimPlanScript(plan)
// writes the BIMCraft script (one `command {json}` a line, `bimcraft-cli run --script`; see lib/bim.mjs and BIM-PLAN.md):
// for each building its storeys as levels, exterior walls of its assembly (homes and apartments: brick at the ground
// floor, fiber cement siding above), the interior walls along its rooms' edges, party walls between a row's units, the
// doors and windows where the design puts them, its rooms named, a stair in each stair room, a slab a storey and the
// design's roof (hip, gable, or flat behind a parapet). Materials carry colours and textures for the 3D view.
// A building with no design (a hotel, self storage) is modelled as a shell. Pure: no binary, no DOM. Feet in, mm out.
import * as S from './siteplan.mjs';
import * as PD from './plandesign.mjs';
import { MM, FLOORS, ROOFS, SHELL, bimBuildings } from './bim.mjs';

const mm = ft => Math.round(ft * MM), line = (cmd, p) => `${cmd} ${JSON.stringify(p)}`, r2 = v => Math.round(v * 100) / 100;
const fmt = ft => (Math.round(ft * 10) / 10).toString(), levelName = ft => ft === 0 ? 'Ground' : `+${fmt(ft)} ft`;
const RES = ['sfr', 'townhomes', 'duplex', 'multifamily'];
export const BALCONY = 'Balcony deck', PATIO = 'Patio slab'; // (outdoor: left out of the floor area)

// materials: a colour in the shaded 3D view and a texture drawn on the surfaces
export const MATERIALS = [
  ['Brick', '#9a5640', { kind: 'brick' }], ['Fiber cement siding', '#d9d3c5', { kind: 'boards', size: [1200, 180] }], ['Stucco', '#e4ddcf', { kind: 'plaster' }],
  ['Stone veneer', '#b8ab98', { kind: 'block' }], ['Tilt-up concrete', '#cfcbc2', { kind: 'concrete' }], ['Metal panel', '#8e979b', { kind: 'metal' }],
  ['Siding sage', '#b9c0a8', { kind: 'boards', size: [1200, 180] }], ['Siding tan', '#d6c6a6', { kind: 'boards', size: [1200, 180] }], ['Siding slate', '#a9b1b6', { kind: 'boards', size: [1200, 180] }], ['Siding cream', '#ece4cf', { kind: 'boards', size: [1200, 180] }],
  ['Gypsum board', '#f3f0ea', null], ['Timber', '#c9a77c', null], ['Insulation', '#f1d9a8', { kind: 'insulation' }], ['Concrete', '#b9b5ad', { kind: 'concrete' }],
  ['Roof shingles', '#4a4f53', { kind: 'roof' }], ['TPO membrane', '#e2e4e3', null], ['Metal deck', '#9aa1a4', { kind: 'metal' }], ['Floor finish', '#c8b79a', { kind: 'boards' }]
];
const L = (fn, mat, t) => ({ function: fn, material: mat, thickness: t });
export const WALL_TYPES = {
  brickWood: { name: 'Brick veneer on wood studs', layers: [L('finish', 'Brick', 92), L('substrate', 'Timber', 12), L('structure', 'Timber', 140), L('finish', 'Gypsum board', 16)] },
  sidingWood: { name: 'Fiber cement siding on wood studs', layers: [L('finish', 'Fiber cement siding', 16), L('substrate', 'Timber', 12), L('structure', 'Timber', 140), L('finish', 'Gypsum board', 16)] },
  brickCmu: { name: 'Brick veneer on CMU', layers: [L('finish', 'Brick', 92), L('thermal', 'Insulation', 50), L('structure', 'Concrete', 203)] },
  stoneWood: { name: 'Stone veneer on wood studs', layers: [L('finish', 'Stone veneer', 90), L('substrate', 'Timber', 12), L('structure', 'Timber', 140), L('finish', 'Gypsum board', 16)] },
  eifs: { name: 'EIFS on steel studs', layers: [L('finish', 'Stucco', 25), L('thermal', 'Insulation', 50), L('structure', 'Timber', 152), L('finish', 'Gypsum board', 16)] },
  tilt: { name: 'Tilt-up concrete panel', layers: [L('structure', 'Tilt-up concrete', 184)] },
  metal: { name: 'Metal panel on girts', layers: [L('finish', 'Metal panel', 25), L('thermal', 'Insulation', 75), L('structure', 'Metal deck', 152)] },
  ...Object.fromEntries(['sage', 'tan', 'slate', 'cream'].map(c => ['siding_' + c, { name: 'Fiber cement siding (' + c + ') on wood studs', layers: [L('finish', 'Siding ' + c, 16), L('substrate', 'Timber', 12), L('structure', 'Timber', 140), L('finish', 'Gypsum board', 16)] }])),
  partition: { name: 'Interior partition 4-1/2in', layers: [L('finish', 'Gypsum board', 16), L('structure', 'Timber', 89), L('finish', 'Gypsum board', 16)] },
  party: { name: 'Party wall 2-hour', layers: [L('finish', 'Gypsum board', 32), L('structure', 'Timber', 89), L('thermal', 'Insulation', 25), L('structure', 'Timber', 89), L('finish', 'Gypsum board', 32)] }
};
const ROOF_TYPES = { shingle: { name: 'Asphalt shingles on wood trusses', layers: [L('finish', 'Roof shingles', 10), L('substrate', 'Timber', 16), L('structure', 'Timber', 235)] }, tpo: { name: 'TPO on insulation and metal deck', layers: [L('membrane', 'TPO membrane', 2), L('thermal', 'Insulation', 100), L('structure', 'Metal deck', 38)] } };
// the exterior wall of a use on a floor (k: 0 the ground floor)
export function wallOf(use, k) {
  if (RES.includes(use)) return k === 0 ? WALL_TYPES.brickWood : WALL_TYPES.sidingWood;
  if (use === 'amenity') return k === 0 ? WALL_TYPES.stoneWood : WALL_TYPES.sidingWood;
  if (use === 'industrial') return WALL_TYPES.tilt; if (use === 'storage') return WALL_TYPES.metal;
  if (use === 'office' || use === 'medical' || use === 'hotel') return k === 0 ? WALL_TYPES.brickCmu : WALL_TYPES.eifs;
  return WALL_TYPES.brickCmu;
}

// door and window types, by size: `Door 3x7`, `Window 3x5 @3` (ft), made as the designs ask for them
function opener() {
  const types = new Map();
  const doorT = (d, use = '') => { const h = d.kind === 'overhead' ? (['industrial', 'storage', 'fuel'].includes(use) ? (d.width >= 12 ? 14 : 10) : 7) : d.kind === 'storefront' || d.kind === 'double' ? 8 : 7, w = r2(d.width), name = (d.kind === 'overhead' ? 'Overhead door ' : d.kind === 'storefront' ? 'Storefront door ' : d.kind === 'sliding' ? 'Sliding glass door ' : 'Door ') + fmt(w) + 'x' + fmt(h);
    if (!types.has(name)) types.set(name, { category: 'door', name, width: mm(w), height: mm(h) }); return name; };
  const winT = w => { const name = (w.width >= 8 ? 'Storefront ' : 'Window ') + fmt(w.width) + 'x' + fmt(w.height) + ' @' + fmt(w.sill ?? 3);
    if (!types.has(name)) types.set(name, { category: 'window', name, width: mm(w.width), height: mm(w.height), sill: mm(w.sill ?? 3) }); return name; };
  return { doorT, winT, types };
}

// the walls along a floor's room edges that aren't the outline: horizontal and vertical runs merged, the outline's own
// runs taken out (a room edge on the footprint is the exterior wall). Segments in design feet: [[x1,y1],[x2,y2]]
export function partitionsOf(rooms, outlineSegs, openings = []) {
  const H = new Map(), V = new Map(), put = (M, k, a, b) => { const key = r2(k); (M.get(key) || M.set(key, []).get(key)).push([Math.min(a, b), Math.max(a, b)]); };
  for (const r of rooms) { put(H, r.y, r.x, r.x + r.w); put(H, r.y + r.d, r.x, r.x + r.w); put(V, r.x, r.y, r.y + r.d); put(V, r.x + r.w, r.y, r.y + r.d); }
  const cut = (M, k, a, b) => { const key = r2(k); if (!M.has(key)) return; M.set(key, M.get(key).flatMap(([p, q]) => q <= a + 0.01 || p >= b - 0.01 ? [[p, q]] : [[p, Math.max(p, a)], [Math.min(q, b), q]].filter(([u, v]) => v - u > 0.01))); };
  const merge = list => { const s = list.slice().sort((p, q) => p[0] - q[0]), out = []; for (const iv of s) { const last = out[out.length - 1]; if (last && iv[0] <= last[1] + 0.01) last[1] = Math.max(last[1], iv[1]); else out.push([...iv]); } return out; };
  for (const M of [H, V]) for (const [k, v] of M) M.set(k, merge(v));
  for (const [[x1, y1], [x2, y2]] of outlineSegs.concat(openings)) { if (Math.abs(y1 - y2) < 0.01) cut(H, y1, Math.min(x1, x2), Math.max(x1, x2)); else if (Math.abs(x1 - x2) < 0.01) cut(V, x1, Math.min(y1, y2), Math.max(y1, y2)); } // (a cased opening between two rooms: no wall there)
  const out = [];
  for (const [y, ivs] of H) for (const [a, b] of ivs) if (b - a >= 1) out.push([[a, y], [b, y]]);
  for (const [x, ivs] of V) for (const [a, b] of ivs) if (b - a >= 1) out.push([[x, a], [x, b]]);
  return out;
}
const segsOf = P => P.map((p, i) => [p, P[(i + 1) % P.length]]);

// an apartment's living rooms on floor k (0 the ground floor) that get a balcony (a patio at grade): a living room with a
// window on an outside wall gets one 6 ft deep and up to 10 ft wide, centred on the room, where the whole of it sits on
// one straight run of wall (rowFp: the outline, design feet) clear of the breezeways' ends (gaps) ->
// [{ room, side, box (4 points), door (the sliding door's centre), rail (3 runs: out, along, back) }]
export function balconiesOf(d, k, rowFp, gaps = []) {
  const out0 = [], fl0 = d.rooms.filter(r => r.floor === k + 1);
  for (const r of fl0.filter(r => r.type === 'living')) {
    const w0 = d.windows.find(w => w.floor === k + 1 && w.room === r.id && (w.side === 'front' || w.side === 'back' || w.side === 'left' || w.side === 'right') && !(/bay$/.test(r.name))); if (!w0) continue;
    const sd = w0.side, h = sd === 'front' || sd === 'back', e0 = sd === 'front' ? r.y : sd === 'back' ? r.y + r.d : sd === 'left' ? r.x : r.x + r.w, out = sd === 'front' || sd === 'left' ? -1 : 1;
    const len = h ? r.w : r.d, bw = Math.min(10, len - 2); if (bw < 6) continue; const c0 = (h ? r.x + r.w / 2 : r.y + r.d / 2), a = c0 - bw / 2, b = c0 + bw / 2, dep = 6;
    const onWall = segsOf(rowFp).some(([p0, p1]) => { const hh = Math.abs(p0[1] - p1[1]) < 0.01; if (hh !== h) return false; const k1 = hh ? p0[1] : p0[0], lo = Math.min(hh ? p0[0] : p0[1], hh ? p1[0] : p1[1]), hi = Math.max(hh ? p0[0] : p0[1], hh ? p1[0] : p1[1]); return Math.abs(k1 - e0) < 0.05 && lo <= a - 1.5 && hi >= b + 1.5; });
    if (!onWall || gaps.some(g => (h ? g.x < b + 1.5 && g.x + g.w > a - 1.5 : g.y < b + 1.5 && g.y + g.d > a - 1.5) && (h ? Math.abs(g.y - e0) < 0.05 || Math.abs(g.y + g.d - e0) < 0.05 : Math.abs(g.x - e0) < 0.05 || Math.abs(g.x + g.w - e0) < 0.05))) continue;
    const Q = (u, v) => h ? [u, v] : [v, u], box = [Q(a, e0), Q(b, e0), Q(b, e0 + out * dep), Q(a, e0 + out * dep)];
    out0.push({ room: r.id, side: sd, box, door: Q(c0, e0), rail: [Q(a, e0), Q(a, e0 + out * dep), Q(b, e0 + out * dep), Q(b, e0)] });
  }
  return out0;
}

/**
 * @param {object} plan  a site plan option (elements in feet)
 * @param {object} o     { name, designs ({ typeId: placed design }, from the plan set; rule-based ones are made for the
 *                       rest), rooms (true: rooms named), every (each home its own model; else one of each kind) }
 * @returns {{ text, head, buildings: [{ ...bimBuildings' building, first, n, typeId, designed }], origin }}
 */
export function bimPlanScript(plan, { name = plan.name || 'Site plan option', designs = {}, rooms = 'auto', every = true } = {}) {
  const types = PD.buildingTypes(plan), typeOf = new Map(types.flatMap(t => t.elementIds.map(id => [id, t])));
  const des = {}; for (const t of types) { if (designs[t.id]) des[t.id] = designs[t.id]; else if (t.supported) { try { des[t.id] = PD.placeDesign(PD.fallbackDesign(t), t).design; } catch { /* modelled as a shell */ } } }
  const B = bimBuildings(plan, { every }), byId = new Map((plan.elements || []).map(e => [e.id, e]));
  const all = B.flatMap(b => b.ring), x0 = Math.min(...all.map(p => p[0])), y0 = Math.min(...all.map(p => p[1])), at = ([x, y]) => [mm(x - x0), mm(y - y0)];
  const head = [line('new', { name })];
  for (const [n, c, tex] of MATERIALS) head.push(line('material', { name: n, color: c, ...(tex ? { texture: tex } : {}) }));
  for (const w of Object.values(WALL_TYPES)) head.push(line('type', { category: 'wall', name: w.name, layers: w.layers }));
  for (const f of Object.values(FLOORS)) head.push(line('type', { category: 'floor', name: f.name, layers: f.layers.map(([fn, m, t]) => ({ function: fn, material: m === 'Concrete' ? 'Concrete' : m === 'Timber' ? 'Timber' : 'Metal deck', thickness: t })) }));
  for (const r of Object.values(ROOF_TYPES)) head.push(line('type', { category: 'roof', name: r.name, layers: r.layers }));
  head.push(line('type', { category: 'floor', name: BALCONY, layers: [L('structure', 'Timber', 200)] }), line('type', { category: 'floor', name: PATIO, layers: [L('structure', 'Concrete', 100)] }));
  // rooms: BIMCraft finds each one's walls, which takes about a quarter second a room on a big model; 'auto' names them
  // when the model has 150 or fewer (a building or two), not on a whole site's hundreds
  if (rooms === 'auto') { let nR = 0; for (const b of B) { const t = typeOf.get(b.id), d = t && des[t.id], e = byId.get(b.id); if (d && e) nR += d.rooms.length * (PD.placement(plan, e).units || 1); } rooms = nR <= 150; }
  const O = opener(), body = [], parts = [];
  // levels: every storey's and roof's elevation
  const hOf = b => { const t = typeOf.get(b.id), d = t && des[t.id]; return { F: b.floors, H: d?.floorH || b.floorH }; };
  const elev = [...new Set(B.flatMap(b => { const { F, H } = hOf(b); return Array.from({ length: F + 1 }, (_, k) => +(k * H).toFixed(2)); }))].sort((a, b) => a - b);
  const lv = [line('modify', { id: 100000, name: levelName(0) }), line('modify', { id: 100001, elevation: mm(elev[1] || 10), name: levelName(elev[1] || 10) })];
  for (const z of elev.slice(2)) lv.push(line('level', { elevation: mm(z), name: levelName(z) }));
  for (const b of B) {
    const e = byId.get(b.id), t = typeOf.get(b.id), d = t && des[t.id], first = body.length, cmd = (c, p) => body.push(line(c, p));
    if (!e || !d) { shell(b, at, cmd); parts.push({ ...b, first, n: body.length - first, typeId: t?.id || null, designed: false }); continue; }
    const pl = PD.fitted(PD.placement(plan, e), d), n = pl.units, F = d.floors, H = d.floorH || b.floorH, flat = d.roof?.type === 'flat', parapet = flat ? (RES.includes(t.use) ? 3 : 3) : 0;
    const P = (x, y, i = 0) => at(pl.at(x, y, i)), cwOf = pts => S.signedArea(pts) > 0 ? pts.slice().reverse() : pts;
    const unitFp = d.footprint, rowFp = n > 1 ? [[0, 0], [d.W * n, 0], [d.W * n, d.D], [0, d.D]] : unitFp; // (a row: one outline round its units)
    const outlineSite = cwOf(rowFp.map(([x, y]) => pl.at(x, y))), ccw = S.signedArea(rowFp.map(([x, y]) => pl.at(x, y))) > 0;
    for (let k = 0; k < F; k++) {
      const z = +(k * H).toFixed(2), L0 = levelName(z), top = k === F - 1, W = wallOf(t.use, k);
      // the exterior walls, open where a breezeway runs out to the front or the back (an apartment building's open
      // stair halls): each edge of the outline a wall, less the breezeways' ends on it
      const fl0 = d.rooms.filter(r => r.floor === k + 1), gaps = n > 1 ? [] : fl0.filter(r => /breezeway/i.test(r.name) || r.type === 'corridor');
      if (n > 1 && k > 0) { // a row's upper floors: each unit's front and back its own siding colour, the ends the row's
        const PAL = ['siding_cream', 'siding_sage', 'siding_tan', 'siding_slate'], Wd = d.W, D = d.D, wh = mm(H + (top ? parapet : 0)), dir = pts => ccw ? pts.slice().reverse() : pts;
        for (let i = 0; i < n; i++) { const Wt = WALL_TYPES[PAL[i % PAL.length]].name; cmd('wall', { points: dir([[i * Wd, 0], [(i + 1) * Wd, 0]]).map(([x, y]) => P(x, y)), type: Wt, level: L0, height: wh }); cmd('wall', { points: dir([[(i + 1) * Wd, D], [i * Wd, D]]).map(([x, y]) => P(x, y)), type: Wt, level: L0, height: wh }); }
        cmd('wall', { points: dir([[n * Wd, 0], [n * Wd, D]]).map(([x, y]) => P(x, y)), type: W.name, level: L0, height: wh }); cmd('wall', { points: dir([[0, D], [0, 0]]).map(([x, y]) => P(x, y)), type: W.name, level: L0, height: wh });
      } else if (!gaps.length) cmd('wall', { points: outlineSite.map(at), closed: true, type: W.name, level: L0, height: mm(H + (top ? parapet : 0)) });
      else for (const [a, c] of segsOf(rowFp)) {
        const h = Math.abs(a[1] - c[1]) < 0.01, lo = Math.min(h ? a[0] : a[1], h ? c[0] : c[1]), hi = Math.max(h ? a[0] : a[1], h ? c[0] : c[1]), k0 = h ? a[1] : a[0];
        let ivs = [[lo, hi]];
        for (const g of gaps) { const on = h ? Math.abs(g.y - k0) < 0.05 || Math.abs(g.y + g.d - k0) < 0.05 : Math.abs(g.x - k0) < 0.05 || Math.abs(g.x + g.w - k0) < 0.05; if (!on) continue;
          const ga = h ? g.x : g.y, gb = h ? g.x + g.w : g.y + g.d; ivs = ivs.flatMap(([p, q]) => q <= ga || p >= gb ? [[p, q]] : [[p, ga], [gb, q]].filter(([u, v]) => v - u > 0.5)); }
        for (const [p, q] of ivs) { const A = h ? [p, k0] : [k0, p], C = h ? [q, k0] : [k0, q], fwd = ((h ? c[0] - a[0] : c[1] - a[1]) > 0) !== ccw, ends = fwd ? [A, C] : [C, A]; /* (clockwise round the building in site feet: faces out) */
          cmd('wall', { points: ends.map(([x, y]) => P(x, y)), type: W.name, level: L0, height: mm(H + (top ? parapet : 0)) }); }
      }
      cmd('floor', { boundary: outlineSite.map(at), level: L0, type: (k ? FLOORS[RES.includes(t.use) || t.use === 'amenity' ? 'wood' : 'deck'] : FLOORS.grade).name });
      const fl = d.rooms.filter(r => r.floor === k + 1);
      for (let i = 0; i < n; i++) {
        for (const [a, c] of partitionsOf(fl, segsOf(unitFp), d.doors.filter(q => q.floor === k + 1 && q.kind === 'opening' && !q.exterior).map(q => [[q.x1, q.y1], [q.x2, q.y2]]))) cmd('wall', { points: [P(...a, i), P(...c, i)], type: WALL_TYPES.partition.name, level: L0, height: mm(H) });
        if (i > 0) cmd('wall', { points: [P(0, 0, i), P(0, d.D, i)], type: WALL_TYPES.party.name, level: L0, height: mm(H) });
      }
      // openings on this floor, doors first: one that would overlap another on the same wall line is left out (BIMCraft
      // refuses the whole model for one clash)
      const placed = [], free = q => { const h = Math.abs(q.y1 - q.y2) < 0.01, at0 = h ? q.y1 : q.x1, a = Math.min(h ? q.x1 : q.y1, h ? q.x2 : q.y2), b = Math.max(h ? q.x1 : q.y1, h ? q.x2 : q.y2);
        if (placed.some(o => o.h === h && Math.abs(o.at - at0) < 1 && a < o.b + 0.75 && b > o.a - 0.75)) return false; placed.push({ h, at: at0, a, b }); return true; };
      // an apartment's living room on the front or back: a balcony on the floors above (a slab 6 ft out, a railing round
      // it, a sliding door to it in place of the living room's windows), a patio at grade
      const balc = t.use === 'multifamily' ? balconiesOf(d, k, rowFp, gaps) : [];
      const doors = d.doors.filter(q => q.floor === k + 1 && q.kind !== 'opening' && free(q)), wins = d.windows.filter(w => w.floor === k + 1 && !(k > 0 && balc.some(x => x.room === w.room && x.side === w.side)) && free(w));
      for (let i = 0; i < n; i++) {
        for (const q of doors) cmd('door', { at: P((q.x1 + q.x2) / 2, (q.y1 + q.y2) / 2, i), level: L0, type: O.doorT(q, t.use) });
        for (const w of wins) cmd('window', { at: P((w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2, i), level: L0, type: O.winT(w) });
        for (const x of balc) {
          const bx = cwOf(x.box.map(([u, v]) => pl.at(u, v, i)));
          cmd('floor', { boundary: bx.map(at), level: L0, type: k ? BALCONY : PATIO, ...(k ? {} : { offset: -mm(0.3) }) });
          if (k) { cmd('railing', { path: x.rail.map(([u, v]) => P(u, v, i)), level: L0, base_offset: 0 }); cmd('door', { at: P(...x.door, i), level: L0, type: O.doorT({ kind: 'sliding', width: 6 }) }); }
        }
        if (rooms) { // one room a space: rooms joined by an opening are one (the first one's name); open breezeways none
          const open = fl.filter(r => /breezeway/i.test(r.name) || r.type === 'corridor'), seen = new Set(open.map(r => r.id)), link = new Map(fl.map(r => [r.id, []]));
          for (const q of d.doors) if (q.floor === k + 1 && q.kind === 'opening' && !q.exterior && link.has(q.a) && link.has(q.b)) { link.get(q.a).push(q.b); link.get(q.b).push(q.a); }
          for (const r of fl) { if (seen.has(r.id) || r.w * r.d < 20) continue; const todo = [r.id]; let leaksOut = false; while (todo.length) { const id = todo.pop(); if (seen.has(id)) continue; seen.add(id); for (const o of link.get(id) || []) { if (open.some(x => x.id === o)) leaksOut = true; todo.push(o); } }
            if (!leaksOut) cmd('room', { point: P(r.x + r.w / 2, r.y + r.d / 2, i), level: L0, name: r.name }); }
        }
        if (k < F - 1) for (const r of fl.filter(r => r.type === 'stair')) { // a straight run along the room's long side, up to the next level
          const along = r.d >= r.w, len = along ? r.d : r.w, run = Math.min(len - 1, H * 1.45), w = Math.min(along ? r.w : r.d, 4) - 0.4, cx = r.x + r.w / 2, cy = r.y + r.d / 2;
          if (run < 6 || w < 2.5) continue;
          const s0 = along ? [cx, cy - run / 2] : [cx - run / 2, cy], s1 = along ? [cx, cy + run / 2] : [cx + run / 2, cy];
          cmd('stair', { start: P(...s0, i), end: P(...s1, i), level: L0, width: mm(w), railings: true });
        }
      }
    }
    // the roof over the top storey: the design's kind, its pitch in degrees; gable ends across the ridge
    const R = d.roof || { type: 'flat' }, rf = levelName(+(F * H).toFixed(2)), sloped = R.type !== 'flat' && R.type !== 'shed';
    const bnd = (n > 1 ? rowFp : unitFp).map(([x, y]) => pl.at(x, y)), cwB = S.signedArea(bnd) > 0 ? bnd.slice().reverse() : bnd, flipped = cwB !== bnd;
    const gab = null; // (a gable's end walls would have to climb to the ridge, which a wall of one height can't: rows are hipped for now)
    cmd('roof', { level: rf, boundary: cwB.map(at), slope: sloped ? +(Math.atan((R.pitch || 6) / 12) * 180 / Math.PI).toFixed(2) : 0, overhang: mm(sloped ? R.overhang ?? 1.5 : 0), type: (sloped ? ROOF_TYPES.shingle : ROOF_TYPES.tpo).name, ...(gab ? { gables: gab } : {}) });
    parts.push({ ...b, first, n: body.length - first, typeId: t.id, designed: true, units: n });
  }
  const typeLines = [...O.types.values()].map(p => line('type', p));
  const header = head.concat(typeLines, lv);
  return { text: header.concat(body).join('\n') + '\n', head: header.length, buildings: parts, origin: [x0, y0], rooms };
}

// a building with no design: its walls, a slab a storey, its roof (lib/bim.mjs's shell without the openings)
function shell(b, at, cmd) {
  const S0 = SHELL[b.use] || SHELL.other, home = ['sfr', 'duplex', 'townhomes'].includes(b.use);
  for (let k = 0; k < b.floors; k++) {
    const z = +(k * b.floorH).toFixed(2), L0 = levelName(z), top = k === b.floors - 1, r = b.ring;
    cmd('wall', { points: r.map(at), closed: true, type: wallOf(b.use, k).name, level: L0, height: mm(b.floorH + (top && !home ? S0.parapet : 0)) });
    cmd('floor', { boundary: r.map(at), level: L0, type: (k ? FLOORS[S0.upper] : FLOORS.grade).name });
  }
  cmd('roof', { level: levelName(+(b.floors * b.floorH).toFixed(2)), boundary: b.ring.map(at), slope: S0.roof === 'shingle' ? 22.62 : 0, overhang: S0.roof === 'shingle' ? mm(1.5) : 0, type: (S0.roof === 'shingle' ? ROOF_TYPES.shingle : ROOF_TYPES.tpo).name });
}
