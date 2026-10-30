// Building designs for plan sets (PLANSET-PLAN.md, phase 3): the plan's buildings grouped into types, a floor plan for
// each type as rectangles (rooms), doors and windows, the checks a design must pass, and a rule-based design for every
// supported use so a set can always be finished. Claude designs each type in the same shape (DESIGN_SCHEMA, through
// api/planset.js mode 'design'); the browser checks the answer here and sends the problems back for a fix, at most twice,
// then falls back to the rule-based design. No DOM, no network: shared by the browser, the server and the tests.
//
// A type's own coordinates, in feet: x runs from the left end (0) to the right end (W) as seen from the street, y from
// the front wall (0) to the back wall (D). Every room is an axis-aligned rectangle { x, y, w, d } on a floor (1 = ground).
import * as S from './siteplan.mjs';

const r2 = v => Math.round((+v || 0) * 2) / 2; // to the half foot
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- the plan's building types ----------
// uses the set can design now; the rest get site sheets only and a line in the index
export const SUPPORTED = ['sfr', 'townhomes', 'duplex', 'multifamily', 'retail', 'restaurant', 'office', 'medical', 'church', 'industrial', 'fuel', 'amenity', 'foodtrucks', 'other'];
export const LATER = { hotel: 'Hotels', storage: 'Self storage buildings' };
export const RESIDENTIAL = ['sfr', 'townhomes', 'duplex'];
export const MAX_TYPES = 8;
// IBC occupancy, a usual construction type and whether a sprinkler system is likely; residential is built to the IRC
const OCC = { sfr: 'R-3 (IRC)', townhomes: 'R-3 townhouse (IRC)', duplex: 'R-3 (IRC)', retail: 'M', restaurant: 'A-2', office: 'B', medical: 'B', church: 'A-3', industrial: 'S-1', fuel: 'M', amenity: 'A-3', foodtrucks: 'A-2', other: 'B' };
export function occupancyOf(use) { return OCC[use] || 'B'; }
export function sprinklerRule(use, gsf, floors) {
  if (RESIDENTIAL.includes(use)) return { on: false, why: use === 'townhomes' ? 'IRC R313 calls for townhouse sprinklers unless the jurisdiction amends it out, as many in Texas do; confirm' : 'Not required for one- and two-family dwellings (NFPA 13D optional)' };
  const o = occupancyOf(use);
  if (/^A/.test(o)) return gsf > 5000 ? { on: true, why: 'A occupancy over 5,000 sf (IBC 903.2.1)' } : { on: false, why: 'A occupancy under 5,000 sf and an occupant load under 100 (IBC 903.2.1)' };
  if (o === 'M' || o === 'S-1') return gsf > 12000 ? { on: true, why: o + ' fire area over 12,000 sf (IBC 903.2.7 / 903.2.9)' } : { on: false, why: o + ' fire area under 12,000 sf' };
  return floors > 3 ? { on: true, why: 'More than three stories' } : { on: false, why: 'B occupancy, three stories or fewer' };
}
const constructionOf = (use, gsf) => RESIDENTIAL.includes(use) ? 'V-B (wood frame, IRC)' : gsf > 25000 || use === 'industrial' ? 'II-B (non-combustible)' : 'V-B (combustible)';

// the side of an element (local 'front' -y, 'back' +y, 'left' -x, 'right' +x as the element is drawn) facing the street
function frontSide(plan, e) {
  const ang = (e.rot || 0) * Math.PI / 180, c = Math.cos(ang), s = Math.sin(ang), at = (lx, ly) => [e.x + lx * c - ly * s, e.y + lx * s + ly * c];
  const sides = { '-y': at(0, -e.d / 2), '+y': at(0, e.d / 2), '-x': at(-e.w / 2, 0), '+x': at(e.w / 2, 0) };
  // the front faces its parking: the parking within 250 ft with the most stalls near it (a service drive or a lane
  // behind the building is paved too, but it's the back); else the nearest paving
  const els = plan.elements || [], d2 = (r, q) => Math.min(...r.map(a => Math.hypot(a[0] - q[0], a[1] - q[1])));
  const shp = x => { try { return S.shapeOf(x); } catch { return null; } };
  let target = null;
  const lots = els.filter(x => x.kind === 'parking').map(x => ({ x, r: shp(x) })).filter(o => o.r && d2(o.r, [e.x, e.y]) < 250 + Math.max(e.w, e.d) / 2);
  if (lots.length && !RESIDENTIAL.includes(e.use)) { const sc = o => { const n = (() => { try { return S.stalls(o.x).count || 1; } catch { return 1; } })(); return n / (1 + d2(o.r, [e.x, e.y]) / 60); }; const o = lots.sort((p, q) => sc(q) - sc(p))[0]; target = [o.x.x, o.x.y]; }
  const paved = els.filter(x => x.kind === 'drive' || x.kind === 'parking');
  if (!target && paved.length) { let best = Infinity; for (const p of paved) { const dd = Math.hypot(p.x - e.x, p.y - e.y); if (dd < best) { best = dd; target = [p.x, p.y]; } } }
  else if ((plan.ring || []).length >= 3) { const r = plan.ring, i = plan.front != null && plan.front < r.length ? plan.front : S.longestEdge(r), a = r[i], b = r[(i + 1) % r.length]; target = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
  if (!target) return '-y';
  return Object.entries(sides).sort((p, q) => Math.hypot(p[1][0] - target[0], p[1][1] - target[1]) - Math.hypot(q[1][0] - target[0], q[1][1] - target[1]))[0][0];
}

// where a type's design sits on one of its buildings: a function from the design's feet (x along the front from its left
// end, y back from the front; an attached row's unit `i` its i-th width along the row) to the site plan's feet. The
// front is the side buildingTypes designed it for (frontSide); a townhome or duplex row's is its long side away from
// its lane when its garages are on the lane behind (rear-load), else toward it. { at(x, y, i), front, units, W, D }
export function placement(plan, e) {
  const units = Math.max(1, Math.round(e.units || 1)), use = S.USES[e.use] ? e.use : null, attached = (use === 'townhomes' || use === 'duplex') && units > 1;
  let f;
  if (attached) {
    const long = e.w >= e.d ? ['-y', '+y'] : ['-x', '+x'], ang = (e.rot || 0) * Math.PI / 180, c = Math.cos(ang), sn = Math.sin(ang), at = (lx, ly) => [e.x + lx * c - ly * sn, e.y + lx * sn + ly * c];
    const paved = (plan.elements || []).filter(x => (x.kind === 'drive' || x.kind === 'parking') && x !== e).map(x => { try { return S.shapeOf(x); } catch { return null; } }).filter(Boolean);
    const near = side => { let n = 0; const L = e.w >= e.d ? e.w : e.d; for (let k = -0.4; k <= 0.41; k += 0.2) { const off = (e.w >= e.d ? e.d : e.w) / 2 + 14, q = side === '-y' ? at(k * L, -off) : side === '+y' ? at(k * L, off) : side === '-x' ? at(-off, k * L) : at(off, k * L); if (paved.some(r => S.inRing(q, r))) n++; } return n; };
    const lane = near(long[0]) >= near(long[1]) ? long[0] : long[1], away = lane === long[0] ? long[1] : long[0];
    f = /rear-load/i.test(e.note || '') ? away : lane;
  } else f = frontSide(plan, e);
  const ang = (e.rot || 0) * Math.PI / 180, c = Math.cos(ang), sn = Math.sin(ang);
  const turn = { '-y': ([u, v]) => [u, v], '+y': ([u, v]) => [-u, -v], '-x': ([u, v]) => [-v, u], '+x': ([u, v]) => [v, -u] }[f], back = { '-y': ([a, b]) => [a, b], '+y': ([a, b]) => [-a, -b], '-x': ([a, b]) => [b, -a], '+x': ([a, b]) => [-b, a] }[f];
  const toFrame = ([x, y]) => { const dx = x - e.x, dy = y - e.y; return [dx * c + dy * sn, -dx * sn + dy * c]; }, P = S.outline(e).map(p => turn(toFrame(p)));
  const mx = Math.min(...P.map(q => q[0])), my = Math.min(...P.map(q => q[1])), W = Math.max(...P.map(q => q[0])) - mx, D = Math.max(...P.map(q => q[1])) - my;
  const uw = attached ? W / units : W;
  return { front: f, units: attached ? units : 1, W, D, uw, at: (x, y, i = 0) => { const q = back([x + i * uw + mx, y + my]); return [e.x + q[0] * c - q[1] * sn, e.y + q[0] * sn + q[1] * c]; } };
}

// a placement fitted to a design: buildings drawn as a type they only resemble (a few feet wider or deeper) get its
// design stretched to their own size, so its walls meet the building's outline
export function fitted(pl, d) {
  const sx = d?.W > 0 ? pl.uw / d.W : 1, sy = d?.D > 0 ? pl.D / d.D : 1;
  return Math.abs(sx - 1) < 1e-3 && Math.abs(sy - 1) < 1e-3 ? pl : { ...pl, sx, sy, at: (x, y, i = 0) => pl.at(x * sx, y * sy, i) };
}
// an L, a U, a staggered front or a drawn outline, in the type's coordinates (front side down, to the half foot):
// { fp, W, D, shape }, or { approx } for an outline that isn't square-cornered (designed on its bounding rectangle), or
// null for a plain rectangle
function footprintIn(e, f) {
  if (!(e.form === 'L' || e.form === 'U' || (e.jog && e.w > 90) || S.isFree(e))) return null;
  const a = -(e.rot || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
  const turn = { '-y': ([u, v]) => [u, v], '+y': ([u, v]) => [-u, -v], '-x': ([u, v]) => [-v, u], '+x': ([u, v]) => [v, -u] }[f] || (q => q);
  let P = S.outline(e).map(([x, y]) => { const dx = x - e.x, dy = y - e.y; return turn([dx * c - dy * sn, dx * sn + dy * c]); });
  const mx = Math.min(...P.map(q => q[0])), my = Math.min(...P.map(q => q[1]));
  P = P.map(([x, y]) => [r2(x - mx), r2(y - my)]).filter((q, i, A) => { const n = A[(i + 1) % A.length]; return q[0] !== n[0] || q[1] !== n[1]; });
  P = P.filter((q, i, A) => { const pr = A[(i - 1 + A.length) % A.length], nx = A[(i + 1) % A.length]; return !((pr[0] === q[0] && q[0] === nx[0]) || (pr[1] === q[1] && q[1] === nx[1])); }); // points along a straight run
  if (P.length < 4 || !P.every((q, i) => { const n = P[(i + 1) % P.length]; return q[0] === n[0] || q[1] === n[1]; })) return { approx: true };
  if (P.length === 4) return null;
  return { fp: P, W: Math.max(...P.map(q => q[0])), D: Math.max(...P.map(q => q[1])), shape: e.form === 'L' ? 'L-shape' : e.form === 'U' ? 'U-shape' : e.jog ? 'stepped front' : 'outline' };
}
// -> [{ id ('A', 'B', …), use, label, W, D (the designed footprint, ft: a whole building, or one unit of an attached row),
//       floors, floorH, attached, unitsPer, count (buildings), units (homes in all), unitGsf, buildingGsf, names, elementIds,
//       garage, sf, note, occupancy, construction, sprinklered, sprinklerWhy, supported, why, similar (buildings drawn as this type) }]
export function buildingTypes(plan) {
  const groups = new Map(), progUse = S.normalizeProgram(plan.program).use;
  for (const e of (plan.elements || []).filter(x => x.kind === 'building')) {
    const use = S.USES[e.use] ? e.use : progUse, U = S.USES[use], floors = Math.max(1, Math.round(e.floors || U.floors || 1)), units = Math.max(1, Math.round(e.units || 1));
    const attached = (use === 'townhomes' || use === 'duplex') && units > 1;
    let W, D, bw, bd;
    if (attached) { const long = Math.max(e.w, e.d), short = Math.min(e.w, e.d); W = r2(long / units); D = r2(short); bw = long; bd = short; }
    let fp = null, shape = null, approx = false;
    if (!attached) { const f = frontSide(plan, e), along = f === '-y' || f === '+y', o = footprintIn(e, f); W = r2(along ? e.w : e.d); D = r2(along ? e.d : e.w); if (o?.fp) { fp = o.fp; W = o.W; D = o.D; shape = o.shape; } approx = !!o?.approx; bw = W; bd = D; }
    const small = smallHome(e); if (small && !attached) { const a = Math.min(W, D), b = Math.max(W, D); W = a; D = b; fp = null; shape = null; bw = W; bd = D; } // (a tiny or manufactured home: its narrow end on the lane, however its lot faces)
    const wash = use === 'fuel' && S.fuelKind(e) === 'wash', key = [use + (wash ? ':wash' : '') + (small ? ':' + small : ''), W, D, floors, fp ? JSON.stringify(fp) : ''].join('|'); // (townhome and duplex rows of different lengths share their unit's design: one type, its usual row) // (a gas station's car wash: a building of its own kind; a tiny or manufactured home too)
    let g = groups.get(key);
    if (!g) groups.set(key, g = { key, use, wash, W, D, fp, shape, approx, floors, floorH: U.floorH || 10, attached, unitsPer: attached || use === 'multifamily' ? units : 1, count: 0, units: 0, names: [], elementIds: [], garage: small ? 0 : U.garage || 0, small, sf: e.sf || null, note: e.note || '', bw, bd });
    g.count++; g.units += RESIDENTIAL.includes(use) || use === 'multifamily' ? units : 0; if (attached) { (g.rows ||= {})[units] = (g.rows[units] || 0) + 1; g.unitsPer = +Object.entries(g.rows).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]; } if (g.names.length < 8) g.names.push(e.name || ''); g.elementIds.push(e.id);
  }
  let list = [...groups.values()].sort((a, b) => b.count - a.count || b.W * b.D - a.W * a.D);
  // more kinds than a set should carry: every kind of building keeps one type (each use, a gas station's car wash apart
  // from its store: a store among apartments is never drawn as an apartment), then the most common of the rest; the
  // others are drawn as the nearest kept type of the same use (by footprint)
  const kindOf = g => g.use + (g.wash ? ':wash' : '') + (g.small ? ':' + g.small : ''), firsts = list.filter((g, i) => list.findIndex(h => kindOf(h) === kindOf(g)) === i);
  const keep = firsts.concat(list.filter(g => !firsts.includes(g)).slice(0, Math.max(0, MAX_TYPES - firsts.length))), rest = list.filter(g => !keep.includes(g));
  for (const g of rest) { const near = keep.filter(k => kindOf(k) === kindOf(g)).sort((a, b) => Math.abs(a.W * a.D - g.W * g.D) - Math.abs(b.W * b.D - g.W * g.D))[0] || keep[0]; near.similar = (near.similar || 0) + g.count; near.count += g.count; near.units += g.units; near.elementIds.push(...g.elementIds); }
  list = keep.sort((a, b) => (SUPPORTED.indexOf(a.use) - SUPPORTED.indexOf(b.use)) || b.W * b.D - a.W * a.D);
  return list.map((g, i) => {
    const foot = g.fp ? polyArea(g.fp) : g.W * g.D, unitGsf = foot * g.floors, buildingGsf = (g.fp ? foot : (g.attached ? g.W * g.unitsPer : g.bw) * g.bd) * g.floors, sp = sprinklerRule(g.use, buildingGsf, g.floors), supported = SUPPORTED.includes(g.use);
    return { id: String.fromCharCode(65 + i), use: g.use, ...(g.wash ? { wash: true } : {}), label: g.wash ? 'Car wash' : g.small ? SMALL[g.small] : (S.USES[g.use]?.label || g.use) + (g.attached ? ' unit' : ''), ...(g.small ? { small: g.small } : {}), W: g.W, D: g.D, fp: g.fp, shape: g.shape, approx: g.approx, footArea: Math.round(foot), floors: g.floors, floorH: g.floorH, attached: g.attached, unitsPer: g.unitsPer,
      count: g.count, units: g.units, unitGsf, buildingGsf, names: g.names, elementIds: g.elementIds, garage: RESIDENTIAL.includes(g.use) ? g.garage : 0, sf: g.sf, note: g.note,
      occupancy: g.wash ? 'B' : occupancyOf(g.use), construction: constructionOf(g.use, buildingGsf), sprinklered: sp.on, sprinklerWhy: sp.why, supported, why: supported ? '' : (LATER[g.use] || 'This use') + ' come in a later phase', similar: g.similar || 0 };
  });
}
export const typeName = t => 'Type ' + t.id + ' — ' + t.label + (t.fp ? ', ' + t.shape : '') + ' (' + t.W + "' × " + t.D + "'" + (t.fp ? ' overall' : '') + ', ' + t.floors + (t.floors > 1 ? ' stories' : ' story') + ')';

// ---------- the design schema Claude answers in ----------
export const ROOM_TYPES = ['living', 'family', 'dining', 'kitchen', 'bedroom', 'primary_bedroom', 'bath', 'half_bath', 'closet', 'walk_in_closet', 'laundry', 'pantry', 'entry', 'hall', 'stair', 'garage', 'office', 'flex',
  'mechanical', 'electrical', 'storage', 'porch', 'tenant', 'sales', 'dining_room', 'commercial_kitchen', 'walk_in_cooler', 'restroom', 'janitor', 'break_room', 'conference', 'reception', 'exam', 'corridor', 'lobby',
  'warehouse', 'sanctuary', 'classroom', 'other'];
export const DOOR_KINDS = ['swing', 'double', 'sliding', 'pocket', 'overhead', 'storefront', 'opening'];
export const SIDES = ['front', 'back', 'left', 'right'];
export const HVAC = ['split_system', 'rooftop_units', 'heat_pump', 'none'];
export const WATER_HEATERS = ['tank_gas', 'tank_electric', 'tankless_gas', 'tankless_electric', 'none'];
const str = { type: 'string' }, num = { type: 'number' }, int = { type: 'integer' }, obj = (props, req = Object.keys(props)) => ({ type: 'object', additionalProperties: false, required: req, properties: props });
export const DESIGN_SCHEMA = obj({
  summary: { type: 'string', description: 'One or two sentences: the layout in plain words.' },
  rooms: { type: 'array', items: obj({ id: str, name: str, type: { type: 'string', enum: ROOM_TYPES }, floor: int, x: num, y: num, w: num, d: num }) },
  doors: { type: 'array', items: obj({ a: { type: 'string', description: 'a room id' }, b: { type: 'string', description: 'another room id, or "outside"' }, width: num, kind: { type: 'string', enum: DOOR_KINDS }, side: { type: 'string', enum: [...SIDES, 'any'], description: 'for a door to outside: the side of the building it is on; otherwise any' } }) },
  windows: { type: 'array', items: obj({ room: str, side: { type: 'string', enum: SIDES }, count: int, width: num, height: num }) },
  roof: obj({ type: { type: 'string', enum: ['gable', 'hip', 'flat', 'shed'] }, pitch: { type: 'number', description: 'rise in 12; 0 for flat' }, ridge: { type: 'string', enum: ['along_front', 'front_to_back'] }, overhang: num }),
  exterior: obj({ walls: str, accent: str, roofing: str, windows: str, doors: str }),
  systems: obj({ structure: str, foundation: str, hvac: { type: 'string', enum: HVAC }, water_heater: { type: 'string', enum: WATER_HEATERS }, sprinklered: { type: 'boolean' }, fire_alarm: { type: 'boolean' } })
});

export const DESIGN_SYSTEM = 'You are an experienced architect drawing schematic floor plans for a schematic design set made with Real Estate Intelligence, a real estate development platform in Texas. ' +
  'You lay out one building type at a time as axis-aligned rectangles in feet, in the JSON schema given. The drawings, schedules and engineering sheets are generated from your answer by code, and code checks it, so follow the rules exactly.\n' +
  'Coordinates: x runs from the left end of the footprint (0) to the right end (W) as seen from the street; y runs from the front wall (0) to the back wall (D). Floor 1 is the ground floor. Snap every number to the half foot.\n' +
  'Rules:\n' +
  '1. Every room is a rectangle inside the footprint (0 ≤ x, x + w ≤ W, 0 ≤ y, y + d ≤ D). When the brief gives an outline (an L, a U, a stepped front), the building is that outline, not its bounding box: no room may reach into the open ground of a notch, and every wall on the outline is an exterior wall (a storefront, door or window can go on the inside corner of an L). Rooms on the same floor never overlap.\n' +
  '2. Floor 1 is covered completely: the rooms tile the whole footprint, no gaps (use halls, closets, storage or mechanical rooms for leftovers). Upper floors may leave open-to-below areas but should be mostly covered.\n' +
  '3. A stair is a room of type stair at the same x, y, w, d on every floor it serves (about 4 ft wide by 11 ft long for a house, 10 by 20 ft for commercial).\n' +
  '4. A door joins two rooms on the same floor that share a wall at least the door\'s width plus one foot long; or joins a floor 1 room to "outside", on a side of the building that room touches (give that side). Every room must be reachable from outside through doors and stairs.\n' +
  '5. Windows only on exterior walls: the room must touch that side of the footprint. Attached units (townhomes, duplex units) have party walls on the left and right: no windows or doors there.\n' +
  '6. Residential (IRC): bedrooms at least 70 sf and 7 ft each way, each with a window; a garage at the front where the program has one, with an overhead door to the front and a door into the house; kitchen, living and dining with windows; a laundry; baths near bedrooms; a primary suite with its own bath and closet when the size allows.\n' +
  '7. Commercial (IBC): restrooms sized for the use and accessible (TAS), storefront or entry at the front, a rear service door, a janitor or storage room, a mechanical/electrical room for larger buildings; two exits where the floor is larger than about 3,000 sf. Restaurants: dining at the front, commercial kitchen, walk-in cooler, dry storage, two restrooms. Warehouses: office and restrooms at a front corner, the warehouse behind with overhead doors on the back or a side.\n' +
  '8. Use realistic sizes: halls 3.5 to 4 ft (commercial corridors 6 ft), closets 2 to 3 ft deep, doors 3 ft (2.5 to 2.67 ft for closets and baths in homes, 6 ft double or storefront for commercial entries, 9 to 16 ft overhead doors for garages, 10 to 12 ft for docks).\n' +
  'A seed arrangement that already passes the checks is given: improve it into a plan an architect would draw, keeping to the rules. Give materials and systems that suit the use and southeast Texas.';

// a tiny home or a manufactured home (a home community's, lib/sitecommunity.mjs, or the library's tiny homes): never a
// garage (the car parks on its pad), its own bedroom count by size, and its own rule-based plan
const SMALL = { tiny: 'Tiny home', manufactured: 'Manufactured home' };
export function smallHome(e) {
  if (!e || e.use !== 'sfr') return null; const t = e.type || '';
  if (e.tiny || /^tiny-|^mhome-fit-tiny|^mhome-(?:tiny|park|cottage)/.test(t)) return 'tiny';
  return e.padSpaces != null || /^mhome-/.test(t) ? 'manufactured' : null;
}
export const smallBeds = (sf, W) => Math.min(W < 24 ? 2 : 3, sf < 400 ? 0 : sf <= 850 ? 1 : sf < 1300 ? 2 : 3); // (0: a studio)
// the brief for one type: what it is, its footprint, its program, where it is
export function designBrief(t, ctx = {}) {
  const res = RESIDENTIAL.includes(t.use), beds = t.small ? smallBeds(t.unitGsf, Math.min(t.W, t.D)) : res ? (t.unitGsf < 1500 ? 2 : t.unitGsf < 2200 ? 3 : t.unitGsf < 3200 ? 4 : 5) : 0;
  const lines = ['Building type ' + t.id + ': ' + t.label, 'Footprint: W = ' + t.W + ' ft (along the street) by D = ' + t.D + ' ft (front to back), ' + t.floors + ' floor' + (t.floors > 1 ? 's' : '') + ', floor to floor about ' + t.floorH + ' ft.',
    'Floor area: about ' + Math.round(t.unitGsf).toLocaleString('en-US') + ' gross sf' + (t.attached ? ' per unit (' + t.unitsPer + ' units in a row; party walls on the left and right)' : '') + '.',
    t.fp ? 'Shape: ' + t.shape + '. The building is the outline through these corners (x, y): ' + t.fp.map(q => '(' + q[0] + ', ' + q[1] + ')').join(' ') + '. Open ground, with no rooms, in the notch' + (notchesOf(t).length > 1 ? 'es' : '') + ': ' + notchesOf(t).map(c => 'x ' + c.x + ' to ' + (c.x + c.w) + ', y ' + c.y + ' to ' + (c.y + c.d)).join('; ') + '. Footprint about ' + Math.round(t.footArea).toLocaleString('en-US') + ' sf.' : '',
    t.small ? 'Program: ' + (beds ? beds + '-bedroom' : 'studio') + ' ' + SMALL[t.small].toLowerCase() + ' of about ' + Math.round(t.unitGsf).toLocaleString('en-US') + ' sf, one story: an open living room and kitchen, ' + (beds ? beds + ' bedroom' + (beds > 1 ? 's' : '') + ', ' : 'a sleeping area, ') + (beds > 1 && Math.min(t.W, t.D) >= 24 ? 'two baths' : 'one full bath') + ', a closet each, a stackable washer and dryer. No garage and no carport: the car parks on the home\'s own pad outside. Entry from the lane side.' + (t.note ? ' (' + t.note + ')' : '') :
    res ? 'Program: about ' + beds + ' bedrooms' + (t.garage ? ', a ' + t.garage + '-car garage at the front' : '') + (t.note ? ' (' + t.note + ')' : '') + '.' :
      t.use === 'retail' ? 'Program: a multi-tenant retail shell; about one tenant bay per 25 to 35 ft of frontage, each with its own storefront, restroom and rear service door.' :
      t.use === 'restaurant' ? 'Program: a full-service restaurant: dining, bar or counter, commercial kitchen, walk-in cooler, dry storage, office, two restrooms.' :
      t.use === 'industrial' ? 'Program: a warehouse / distribution building with a front office (about 5 to 10% of the floor), restrooms, and overhead dock doors.' :
      t.use === 'fuel' && t.wash ? 'Program: an express car wash tunnel running the length of the building, overhead doors at the entry and exit ends, an equipment room (pumps, reclaim, chemicals, controls) along one side, no customer rooms.' :
      t.use === 'fuel' ? 'Program: a convenience store: sales floor with cooler wall, checkout, food service counter, two restrooms, storage, office.' :
      t.use === 'office' || t.use === 'medical' ? 'Program: ' + (t.use === 'medical' ? 'medical office suites with exam rooms' : 'multi-tenant office suites') + ', lobby, restrooms, a core with stair' + (t.floors > 1 ? ' on every floor' : '') + '.' :
      t.use === 'church' ? 'Program: sanctuary, lobby / narthex, classrooms, office, restrooms, kitchen.' : 'Program: as suits a ' + t.label.toLowerCase() + '.',
    'Occupancy ' + t.occupancy + ', construction ' + t.construction + '. Sprinklers: ' + (t.sprinklered ? 'yes' : 'no') + ' (' + t.sprinklerWhy + ').',
    ctx.county ? 'Location: ' + ctx.county + (ctx.address ? ', ' + ctx.address : '') + '.' : ''];
  return lines.filter(Boolean).join('\n');
}

// ---------- checking and placing a design ----------
const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y));
// the wall two rooms share: { orient 'v' (x = const) | 'h' (y = const), at, from, to } or null
function shared(a, b) {
  const e = 0.6;
  for (const [xa, xb] of [[a.x + a.w, b.x], [b.x + b.w, a.x]]) if (Math.abs(xa - xb) <= e) { const from = Math.max(a.y, b.y), to = Math.min(a.y + a.d, b.y + b.d); if (to - from > 0) return { orient: 'v', at: (xa + xb) / 2, from, to }; }
  for (const [ya, yb] of [[a.y + a.d, b.y], [b.y + b.d, a.y]]) if (Math.abs(ya - yb) <= e) { const from = Math.max(a.x, b.x), to = Math.min(a.x + a.w, b.x + b.w); if (to - from > 0) return { orient: 'h', at: (ya + yb) / 2, from, to }; }
  return null;
}
// ---------- footprints that aren't rectangles ----------
// A building drawn as an L, a U round a courtyard or a strip with a staggered front keeps that outline in its type
// (t.fp: an orthogonal polygon in the type's coordinates, or null for a plain W x D rectangle). Rooms must stay inside
// it, and an exterior wall is one with open ground on the other side, the inside corner of an L included.
export const outlineOf = t => t.fp?.length >= 4 ? t.fp : [[0, 0], [t.W, 0], [t.W, t.D], [0, t.D]];
export function inPoly([x, y], poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
export const polyArea = P => Math.abs(P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
// the footprint's grid (every vertex x and y) and which cells are inside: the notches are the cells outside
function cellsOf(t) {
  const P = outlineOf(t), xs = [...new Set([0, t.W, ...P.map(p => p[0])])].sort((a, b) => a - b), ys = [...new Set([0, t.D, ...P.map(p => p[1])])].sort((a, b) => a - b), cells = [];
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) cells.push({ x: xs[i], y: ys[j], w: xs[i + 1] - xs[i], d: ys[j + 1] - ys[j], inside: inPoly([(xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2], P) });
  return { xs, ys, cells };
}
export const notchesOf = t => t.fp ? cellsOf(t).cells.filter(c => !c.inside && c.w > 0 && c.d > 0) : [];
// the footprint as rectangles (row strips merged down where they line up), largest first
export function piecesOf(t) {
  if (!t.fp) return [{ x: 0, y: 0, w: t.W, d: t.D }];
  const { xs, ys, cells } = cellsOf(t), rows = [];
  for (let j = 0; j + 1 < ys.length; j++) { let run = null; const row = [];
    for (let i = 0; i + 1 < xs.length; i++) { const c = cells.find(q => q.x === xs[i] && q.y === ys[j]); if (c?.inside) { if (run) run.w += c.w; else row.push(run = { x: c.x, y: c.y, w: c.w, d: c.d }); } else run = null; }
    rows.push(row); }
  const out = [];
  for (const row of rows) for (const r of row) { const up = out.find(o => o.x === r.x && o.w === r.w && Math.abs(o.y + o.d - r.y) < 0.01); if (up) up.d += r.d; else out.push({ ...r }); }
  return out.sort((a, b) => b.w * b.d - a.w * a.d);
}
// the longest stretch of a room's edge on a side that has open ground beyond it -> { orient, at, from, to } or null
function onSide(r, side, t) {
  const P = outlineOf(t), out = ([x, y]) => x < 0 || y < 0 || x > t.W || y > t.D || !inPoly([x, y], P), e = 0.3;
  const h = side === 'front' || side === 'back', at = side === 'front' ? r.y : side === 'back' ? r.y + r.d : side === 'left' ? r.x : r.x + r.w, from = h ? r.x : r.y, to = h ? r.x + r.w : r.y + r.d;
  const cuts = [...new Set([from, to, ...P.map(p => h ? p[0] : p[1]).filter(v => v > from && v < to)])].sort((a, b) => a - b);
  let best = null, cur = null;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const m = (cuts[i] + cuts[i + 1]) / 2, probe = h ? [m, side === 'front' ? at - e : at + e] : [side === 'left' ? at - e : at + e, m];
    if (out(probe)) { if (cur && Math.abs(cur.to - cuts[i]) < 0.01) cur.to = cuts[i + 1]; else cur = { orient: h ? 'h' : 'v', at, from: cuts[i], to: cuts[i + 1] }; if (!best || cur.to - cur.from > best.to - best.from) best = cur; }
    else cur = null;
  }
  return best && best.to - best.from > 0.5 ? best : null;
}
const HABITABLE = ['living', 'family', 'dining', 'bedroom', 'primary_bedroom', 'office', 'flex'];
const BEDS = ['bedroom', 'primary_bedroom'];

// raw (Claude's answer or a rule-based design) -> { design (placed), problems: [plain sentences] }
// design: { typeId, W, D, floors, floorH, attached, use, summary, rooms: [{ id, name, type, floor, x, y, w, d, area, ext: { front, back, left, right } }],
//   doors: [{ id, floor, a, b, kind, width, exterior, side, orient, x1, y1, x2, y2, into }], windows: [{ id, floor, room, side, orient, x1, y1, x2, y2, width, height, sill }],
//   roof, exterior, systems, source }
export function placeDesign(raw, t) {
  const W = t.W, D = t.D, F = t.floors, problems = [], R = [], ids = new Set(), FP = outlineOf(t), area0 = polyArea(FP), notches = notchesOf(t);
  for (const q of Array.isArray(raw?.rooms) ? raw.rooms : []) {
    let x = r2(q.x), y = r2(q.y), w = r2(q.w), d = r2(q.d); const floor = clampN(Math.round(+q.floor || 1), 1, F);
    if (!(w > 0 && d > 0)) { problems.push('Room "' + (q.name || q.id) + '" has no size.'); continue; }
    if (x < -0.5 || y < -0.5 || x + w > W + 0.5 || y + d > D + 0.5) problems.push('Room "' + (q.name || q.id) + '" (floor ' + floor + ') runs outside the ' + W + ' × ' + D + ' ft footprint.');
    else if (notches.some(c => inter({ x, y, w, d }, c) > 1)) problems.push('Room "' + (q.name || q.id) + '" (floor ' + floor + ') runs into the open ground outside the building\'s ' + (t.shape || 'outline') + ' (the notch at ' + notches.filter(c => inter({ x, y, w, d }, c) > 1).map(c => 'x ' + c.x + '–' + (c.x + c.w) + ', y ' + c.y + '–' + (c.y + c.d)).join('; ') + ').');
    x = clampN(x, 0, W); y = clampN(y, 0, D); w = Math.min(w, W - x); d = Math.min(d, D - y); if (w <= 0 || d <= 0) continue;
    let id = String(q.id || q.name || 'R').slice(0, 24); while (ids.has(id)) id += "'"; ids.add(id);
    const type = ROOM_TYPES.includes(q.type) ? q.type : 'other';
    R.push({ id, name: String(q.name || type).slice(0, 40), type, floor, x, y, w, d, area: Math.round(w * d) });
  }
  if (!R.length) problems.push('The design has no rooms.');
  for (const r of R) r.ext = Object.fromEntries(SIDES.map(s => [s, !!onSide(r, s, t)]));
  // overlaps and coverage, floor by floor
  for (let f = 1; f <= F; f++) {
    const fl = R.filter(r => r.floor === f), area = fl.reduce((s, r) => s + r.w * r.d, 0);
    let over = 0; for (let i = 0; i < fl.length; i++) for (let j = i + 1; j < fl.length; j++) { const a = inter(fl[i], fl[j]); if (a > 1) { over += a; if (problems.length < 30) problems.push('Rooms "' + fl[i].name + '" and "' + fl[j].name + '" overlap on floor ' + f + ' (' + Math.round(a) + ' sf).'); } }
    const inNotch = fl.reduce((s, r) => s + notches.reduce((a, c) => a + inter(r, c), 0), 0), cover = (area - over - inNotch) / area0;
    if (f === 1 && cover < 0.9) problems.push('Floor 1 leaves about ' + Math.round(area0 - (area - over - inNotch)) + ' sf of the footprint without a room: tile the whole footprint.');
    if (f > 1 && cover < 0.4) problems.push('Floor ' + f + ' has rooms over only ' + Math.round(cover * 100) + '% of the footprint.');
    if (F > 1 && !fl.some(r => r.type === 'stair')) problems.push('Floor ' + f + ' has no stair.');
  }
  // sizes
  for (const r of R) {
    if (Math.min(r.w, r.d) < 2) problems.push('Room "' + r.name + '" is under 2 ft wide.');
    if (BEDS.includes(r.type) && (r.area < 70 || Math.min(r.w, r.d) < 7)) problems.push('Bedroom "' + r.name + '" is ' + r.area + ' sf, ' + Math.min(r.w, r.d) + ' ft wide: at least 70 sf and 7 ft each way (IRC R304).');
    if (HABITABLE.includes(r.type) && !BEDS.includes(r.type) && Math.min(r.w, r.d) < 7) problems.push('"' + r.name + '" is under 7 ft wide (IRC R304.2).');
  }
  const byId = new Map(R.map(r => [r.id, r]));
  // doors: placed on the shared wall (or the footprint edge), spread out when several share an edge
  const doors = [], edgeUse = new Map();
  for (const q of Array.isArray(raw?.doors) ? raw.doors : []) {
    const a = byId.get(q.a) || byId.get(q.b), b = byId.get(q.a) ? (q.b === 'outside' ? null : byId.get(q.b)) : (q.a === 'outside' ? null : null);
    const kind = DOOR_KINDS.includes(q.kind) ? q.kind : 'swing', width = clampN(r2(q.width) || 3, 2, kind === 'overhead' ? 20 : 12);
    if (!a) { problems.push('A door names a room that isn\'t in the design (' + q.a + ' / ' + q.b + ').'); continue; }
    const outside = q.a === 'outside' || q.b === 'outside';
    if (!outside && !b) { problems.push('A door from "' + a.name + '" names a room that isn\'t in the design (' + q.b + ').'); continue; }
    let seg = null, side = null;
    if (outside) {
      if (a.floor !== 1) { problems.push('Door to outside from "' + a.name + '" is on floor ' + a.floor + ': exterior doors only on floor 1.'); continue; }
      const want = SIDES.includes(q.side) ? [q.side, ...SIDES.filter(s => s !== q.side)] : SIDES, ok = s => !(t.attached && (s === 'left' || s === 'right'));
      for (const s of want) { if (!ok(s)) continue; const e = onSide(a, s, t); if (e && e.to - e.from >= width) { seg = e; side = s; break; } }
      if (!seg) { problems.push('"' + a.name + '" has a door to outside but no exterior wall long enough' + (t.attached ? ' (not on a party wall)' : '') + '.'); continue; }
    } else {
      if (a.floor !== b.floor) { problems.push('Door between "' + a.name + '" and "' + b.name + '": they are on different floors.'); continue; }
      seg = shared(a, b); if (!seg || seg.to - seg.from < width + 0.5) { problems.push('Door between "' + a.name + '" and "' + b.name + '": they don\'t share a wall ' + (width + 1) + ' ft long.'); continue; }
    }
    const k = a.floor + '|' + seg.orient + '|' + seg.at + '|' + seg.from + '|' + seg.to, list = edgeUse.get(k) || []; list.push({ q, a, b, seg, side, kind, width, outside }); edgeUse.set(k, list);
  }
  for (const list of edgeUse.values()) list.forEach((o, i) => {
    const { seg } = o, len = seg.to - seg.from, mid = seg.from + len * (i + 1) / (list.length + 1), from = clampN(mid - o.width / 2, seg.from + 0.25, seg.to - o.width - 0.25);
    const p = seg.orient === 'h' ? { x1: from, y1: seg.at, x2: from + o.width, y2: seg.at } : { x1: seg.at, y1: from, x2: seg.at, y2: from + o.width };
    doors.push({ id: '', floor: o.a.floor, a: o.a.id, b: o.outside ? 'outside' : o.b.id, kind: o.kind, width: o.width, exterior: o.outside, side: o.side, orient: seg.orient, ...p, into: o.a.id });
  });
  doors.sort((p, q) => p.floor - q.floor || p.y1 - q.y1 || p.x1 - q.x1).forEach((d, i) => { d.id = String(d.floor * 100 + i + 1); });
  // reachable from outside through doors and stairs
  const adj = new Map(R.map(r => [r.id, new Set()])); adj.set('outside', new Set());
  for (const d of doors) { adj.get(d.a).add(d.b); adj.get(d.b)?.add(d.a); }
  const stairs = R.filter(r => r.type === 'stair');
  for (const a of stairs) for (const b of stairs) if (b.floor === a.floor + 1 && inter(a, b) > 4) { adj.get(a.id).add(b.id); adj.get(b.id).add(a.id); }
  const seen = new Set(['outside']), todo = ['outside']; while (todo.length) for (const n of adj.get(todo.pop()) || []) if (!seen.has(n)) { seen.add(n); todo.push(n); }
  const cut = R.filter(r => !seen.has(r.id)); if (cut.length) problems.push('No way in to: ' + cut.slice(0, 10).map(r => '"' + r.name + '" (floor ' + r.floor + ')').join(', ') + '. Add doors.');
  if (!doors.some(d => d.exterior)) problems.push('The building has no door to outside.');
  // windows on exterior walls, spaced along the room's edge
  const windows = [];
  for (const q of Array.isArray(raw?.windows) ? raw.windows : []) {
    const r = byId.get(q.room); if (!r) continue; const side = SIDES.includes(q.side) ? q.side : 'front';
    if (t.attached && (side === 'left' || side === 'right')) { problems.push('Window in "' + r.name + '" is on a party wall (' + side + ').'); continue; }
    const e = onSide(r, side, t); if (!e) { problems.push('Window in "' + r.name + '" is on the ' + side + ', but the room doesn\'t touch that side.'); continue; }
    const width = clampN(r2(q.width) || 3, 1.5, 16), height = clampN(r2(q.height) || 5, 1, 12), len = e.to - e.from, fit = Math.max(0, Math.floor((len - 1) / (width + 1)));
    const nW = Math.min(Math.max(1, Math.round(+q.count || 1)), fit); if (!nW) continue;
    for (let i = 0; i < nW; i++) { const c = e.from + len * (i + 1) / (nW + 1), from = c - width / 2;
      windows.push({ id: '', floor: r.floor, room: r.id, side, orient: e.orient, ...(e.orient === 'h' ? { x1: from, y1: e.at, x2: from + width, y2: e.at } : { x1: e.at, y1: from, x2: e.at, y2: from + width }), width, height, sill: RESIDENTIAL.includes(t.use) ? (BEDS.includes(r.type) ? 2 : 3) : (r.type === 'tenant' || r.type === 'sales' || r.type === 'dining_room' || r.type === 'lobby' ? 1.5 : 3.5) }); }
  }
  windows.forEach((w, i) => { w.id = String.fromCharCode(65 + Math.floor(i / 99)) + String(i % 99 + 1); });
  const bayOf = r => doors.filter(d => d.kind === 'opening' && (d.a === r.id || d.b === r.id)).map(d => d.a === r.id ? d.b : d.a); // (a bay open to the room is part of it: its window counts)
  for (const r of R.filter(x => BEDS.includes(x.type))) if (!windows.some(w => w.room === r.id || bayOf(r).includes(w.room) && R.find(q => q.id === w.room)?.type === 'other')) problems.push('Bedroom "' + r.name + '" has no window (emergency escape, IRC R310).');
  // exits for larger commercial floors
  if (!RESIDENTIAL.includes(t.use) && area0 > 3000 && doors.filter(d => d.exterior && d.kind !== 'overhead').length < 2) problems.push('Floor 1 is over 3,000 sf with fewer than two exit doors (IBC 1006).');
  const rf = raw?.roof || {}, roof = { type: ['gable', 'hip', 'flat', 'shed'].includes(rf.type) ? rf.type : RESIDENTIAL.includes(t.use) ? 'gable' : 'flat', pitch: clampN(+rf.pitch || 0, 0, 14), ridge: rf.ridge === 'front_to_back' ? 'front_to_back' : 'along_front', overhang: clampN(+rf.overhang || 0, 0, 4) };
  if (roof.type === 'flat') roof.pitch = 0; else if (!roof.pitch) roof.pitch = 6;
  const text = (o, k, n = 80) => typeof o?.[k] === 'string' ? o[k].replace(/\s+/g, ' ').trim().slice(0, n) : '';
  const ex = raw?.exterior || {}, sy = raw?.systems || {};
  const design = { typeId: t.id, use: t.use, W, D, floors: F, floorH: t.floorH, attached: t.attached, footprint: FP.map(p => [p[0], p[1]]), shape: t.shape || 'rectangle', footArea: Math.round(area0), notches, summary: text(raw, 'summary', 400), rooms: R, doors, windows, roof,
    exterior: { walls: text(ex, 'walls') || (RESIDENTIAL.includes(t.use) ? 'Brick veneer with fiber cement siding' : 'Painted tilt-wall concrete'), accent: text(ex, 'accent'), roofing: text(ex, 'roofing') || (roof.type === 'flat' ? 'TPO membrane' : 'Architectural asphalt shingles'), windows: text(ex, 'windows') || 'Vinyl, low-E', doors: text(ex, 'doors') },
    systems: { structure: text(sy, 'structure') || (RESIDENTIAL.includes(t.use) ? 'Wood frame, 2x4 / 2x6 studs, engineered roof trusses' : t.construction), foundation: text(sy, 'foundation') || 'Post-tensioned slab on grade',
      hvac: HVAC.includes(sy.hvac) ? sy.hvac : RESIDENTIAL.includes(t.use) ? 'split_system' : 'rooftop_units', water_heater: WATER_HEATERS.includes(sy.water_heater) ? sy.water_heater : RESIDENTIAL.includes(t.use) ? 'tankless_gas' : 'tank_electric',
      sprinklered: typeof sy.sprinklered === 'boolean' ? sy.sprinklered : t.sprinklered, fire_alarm: typeof sy.fire_alarm === 'boolean' ? sy.fire_alarm : t.sprinklered } };
  return { design, problems: [...new Set(problems)], unreachable: cut.map(r => r.id) };
}

// ---------- rule-based designs (the seed Claude improves, and the fallback when its answers keep failing) ----------
// a garden apartment building: walk-up, open breezeways with their stairs running front to back through the building,
// each serving the bay of units on either side; in each bay a unit facing the front and one facing the back, back to
// back on the party wall down the middle. Each floor stacks on the one below (the walls line up for wood framing). The
// units on a floor are the building's units over its floors (the upper floors take the odd ones); a slot a floor
// doesn't need is resident storage (on floor 1, maintenance and storage). In a unit, from the party wall: the kitchen
// (the entry from the breezeway), laundry and bath(s); along the exterior wall the living room and the bedroom(s).
function apartmentDesign(t) {
  const W = t.W, D = t.D, F = t.floors, rooms = [], doors = [], windows = [];
  const room = (id, name, type, floor, x, y, w, d) => { rooms.push({ id, name, type, floor, x: r2(x), y: r2(y), w: r2(w), d: r2(d) }); return id; };
  const door = (a, b, width = 3, kind = 'swing', side = 'any') => doors.push({ a, b, width, kind, side }), win = (r, side, count = 1, width = 3, height = 5) => windows.push({ room: r, side, count, width, height });
  const per = t.unitsPer > 1 ? (t.fp || !t.footArea ? t.unitsPer : t.unitsPer * W * D / t.footArea) : W * D * F * 0.85 / 950; // (a piece of a shaped building laid out on its own: its share)
  const U = Math.max(F * 2, Math.round(per)), base = Math.floor(U / F), odd = U - base * F, nOn = f => base + (f > F - odd ? 1 : 0);
  const BW = 10, N = t.fp ? notchesOf(t) : [];
  // a stepped front or back (lib/sitelayout.mjs staggers garden buildings): the outline's front and back at x, from its notches
  const frontY = x => Math.max(0, ...N.filter(n => n.y < 0.5 && x >= n.x - 1e-6 && x < n.x + n.w - 1e-6).map(n => n.y + n.d)), backY = x => Math.min(D, ...N.filter(n => n.y + n.d > D - 0.5 && x >= n.x - 1e-6 && x < n.x + n.w - 1e-6).map(n => n.y));
  const span = (a, b, fn, pick) => { let v = fn(a + 0.01); for (let q = a; q < b; q += 1) v = pick(v, fn(q + 0.01)); return pick(v, fn(b - 0.01)); };
  let nb = Math.max(1, Math.ceil(nOn(F) / 2)); while (nb > 1 && (W - Math.ceil(nb / 2) * BW) / nb < 22) nb--; // (a bay at least 22 ft wide)
  const nbw = Math.ceil(nb / 2), uw = r2((W - nbw * BW) / nb);
  // across the building: bay, breezeway, bay, bay, breezeway, bay… (an odd last bay on its own breezeway's left)
  const cols = []; let x = 0;
  for (let g = 0; g < nbw; g++) { const two = g * 2 + 1 < nb; cols.push({ kind: 'bay', x, w: uw, bw: 'right', g }); x += uw; cols.push({ kind: 'bw', x, w: BW, g }); x += BW; if (two) { cols.push({ kind: 'bay', x, w: uw, bw: 'left', g }); x += uw; } }
  const last = cols[cols.length - 1]; last.w = r2(W - last.x); // (rounding: the last column takes what's left)
  for (const c of cols) { c.yf = r2(span(c.x, c.x + c.w, frontY, Math.max)); c.yb = r2(span(c.x, c.x + c.w, backY, Math.min)); c.half = r2((c.yf + c.yb) / 2); }
  const beds = uw >= 33 ? 2 : 1, plan1 = beds === 2 ? '2-bedroom' : '1-bedroom';
  let made = 0;
  for (let f = 1; f <= F; f++) {
    const slots = cols.filter(c => c.kind === 'bay').flatMap(c => [{ c, ext: 'front' }, { c, ext: 'back' }]), want = nOn(f);
    cols.filter(c => c.kind === 'bw').forEach(c => { const id = room('bw' + c.g + '_' + f, 'Breezeway & stair', 'stair', f, c.x, c.yf, c.w, c.yb - c.yf); if (f === 1) { door(id, 'outside', 6, 'opening', 'front'); door(id, 'outside', 6, 'opening', 'back'); } });
    slots.forEach((sl, k) => {
      const { c, ext } = sl, y0 = ext === 'front' ? c.yf : c.half, d = ext === 'front' ? c.half - c.yf : c.yb - c.half, bwId = 'bw' + c.g + '_' + f, tag = f + '' + String(k + 1).padStart(2, '0');
      if (k >= want) { const id = room('st' + tag, f === 1 ? 'Maintenance / storage' : 'Resident storage', 'storage', f, c.x, y0, c.w, d); door(bwId, id, 3); return; }
      made++;
      // local coordinates: u from the breezeway side, v from the party wall out to the exterior wall
      const L = (id, name, type, u, v, w, h) => room(id, name, type, f, c.bw === 'left' ? c.x + u : c.x + c.w - u - w, ext === 'front' ? y0 + d - v - h : y0 + v, w, h);
      const di = r2(clampN(d * 0.4, 11, 14)), de = r2(d - di), kw = r2(clampN(c.w * 0.42, 11, 14)), lw = 5;
      const pre = 'u' + tag + '_', K = L(pre + 'k', 'Kitchen / dining', 'kitchen', 0, 0, kw, di); door(bwId, K, 3);
      const ld = L(pre + 'ld', 'Laundry', 'laundry', kw, 0, lw, di); door(K, ld, 2.5);
      const rest = r2(c.w - kw - lw);
      if (beds === 2 && rest >= 15) {
        const b1w = r2(rest / 2); L(pre + 'b1', 'Bath', 'bath', kw + lw, 0, b1w, di); L(pre + 'b2', 'Bath', 'bath', kw + lw + b1w, 0, r2(rest - b1w), di);
        const lv = r2(c.w * 0.42), bdw = r2((c.w - lv) / 2);
        const LV = L(pre + 'lv', 'Living', 'living', 0, di, lv, de), B2 = L(pre + 'bd2', 'Bedroom', 'bedroom', lv, di, bdw, de), B1 = L(pre + 'bd1', 'Primary bedroom', 'primary_bedroom', lv + bdw, di, r2(c.w - lv - bdw), de);
        door(K, LV, 6, 'opening'); door(LV, B2, 2.67); door(LV, B1, 2.67); door(B2, pre + 'b1', 2.5); door(B1, pre + 'b2', 2.5);
        win(LV, ext, 2, 4, 5); win(B2, ext, 1); win(B1, ext, 1); if (f === 1) door(LV, 'outside', 6, 'sliding', ext);
      } else {
        L(pre + 'b1', 'Bath', 'bath', kw + lw, 0, rest, di);
        const lv = r2(c.w * 0.55), LV = L(pre + 'lv', 'Living', 'living', 0, di, lv, de), B1 = L(pre + 'bd1', 'Bedroom', 'primary_bedroom', lv, di, r2(c.w - lv), de);
        door(K, LV, 6, 'opening'); door(LV, B1, 2.67); door(B1, pre + 'b1', 2.5);
        win(LV, ext, 2, 4, 5); win(B1, ext, 1); if (f === 1) door(LV, 'outside', 6, 'sliding', ext);
      }
    });
  }
  // the end walls: the end units' rooms get windows there too (a blank end wall reads as a warehouse)
  for (const r of rooms.slice()) if (['living', 'bedroom', 'primary_bedroom', 'kitchen'].includes(r.type)) for (const [side, on] of [['left', r.x < 0.01], ['right', r.x + r.w > W - 0.01]]) if (on && r.d >= 9) win(r.id, side, r.type === 'living' ? 2 : 1, r.type === 'kitchen' ? 3 : 4, r.type === 'kitchen' ? 4 : 5);
  // where the outline steps out past a column's front or back line: that room's bay, opening off it
  if (N.length) for (const r of rooms.slice()) for (const [edge, out] of [[r.y, frontY], [r.y + r.d, backY]]) {
    const isFront = edge === r.y, col = cols.find(c => r.x >= c.x - 0.01 && r.x + r.w <= c.x + c.w + 0.01); if (!col || r2(edge) !== (isFront ? col.yf : col.yb)) continue;
    const vs = []; for (let x = r.x; x < r.x + r.w - 0.01; x += 0.5) vs.push(out(x + 0.01));
    if (vs.every(v => Math.abs(v - vs[0]) < 0.01) && (isFront ? vs[0] < edge - 0.5 : vs[0] > edge + 0.5)) { if (isFront) { r.d = r2(r.d + r.y - vs[0]); r.y = r2(vs[0]); } else r.d = r2(vs[0] - r.y); continue; } // (the whole room steps out with the outline: it just runs to it)
    let a = null; const flush = (b, v) => { if (a == null) return; const w = r2(b - a.x); if (w >= 4) { const id = r.id + (isFront ? 'f' : 'b') + Math.round(a.x); rooms.push({ id, name: r.type === 'stair' ? 'Breezeway' : r.name + ' bay', type: r.type === 'stair' ? 'corridor' : 'other', floor: r.floor, x: r2(a.x), y: r2(isFront ? a.v : edge), w, d: r2(Math.abs(edge - a.v)) }); doors.push({ a: r.id, b: id, width: Math.min(w - 1, r.type === 'stair' ? 8 : 6), kind: 'opening', side: 'any' }); if (r.type !== 'stair') windows.push({ room: id, side: isFront ? 'front' : 'back', count: 1, width: 3, height: 5 }); if (r.type === 'stair' && r.floor === 1) doors.push({ a: id, b: 'outside', width: 6, kind: 'opening', side: isFront ? 'front' : 'back' }); } a = null; };
    for (let x = r.x; x < r.x + r.w - 0.01; x += 0.5) { const v = out(x + 0.01), step = isFront ? v < edge - 0.5 : v > edge + 0.5; if (step && (a == null || Math.abs(a.v - v) > 0.01)) { flush(x); a = { x, v }; } else if (!step) flush(x); }
    flush(r.x + r.w);
  }
  // a window or patio door on a wall the step covered: moved to the room's bay on that side (the bay is the outside wall there)
  if (N.length) {
    const cov = (id, side, need = 5) => { const r = rooms.find(q => q.id === id), e = r && onSide(r, side, t); return r && (!e || e.to - e.from < need); }, bayOf = (id, side) => rooms.filter(q => q.id.startsWith(id + (side === 'front' ? 'f' : 'b')) && /\d$/.test(q.id)).sort((p, q) => q.w - p.w)[0];
    for (const w of windows) if (cov(w.room, w.side)) { const b = bayOf(w.room, w.side); if (b) w.room = b.id; }
    for (const d of doors) if (d.b === 'outside' && cov(d.a, d.side, d.width + 0.6)) { const b = bayOf(d.a, d.side); if (b && b.w >= d.width + 0.5) d.a = b.id; else d.kind = 'drop'; }
    for (let i = doors.length - 1; i >= 0; i--) if (doors[i].kind === 'drop') doors.splice(i, 1);
    for (const r of rooms.filter(q => BEDS.includes(q.type))) if (!windows.some(w => w.room === r.id || w.room.startsWith(r.id + 'f') || w.room.startsWith(r.id + 'b'))) { const side = ['front', 'back'].find(sd => onSide(r, sd, t)); if (side) windows.push({ room: r.id, side, count: 1, width: 3, height: 5 }); }
  }
  return { summary: 'Rule-based garden apartment building: ' + made + ' ' + plan1 + ' units of about ' + Math.round(uw * (cols[0].half - cols[0].yf) / 10) * 10 + ' sf on ' + F + ' floor' + (F > 1 ? 's' : '') + ', ' + nbw + ' open breezeway' + (nbw > 1 ? 's' : '') + ' with stairs, a unit facing the front and one the back in each bay.',
    rooms, doors, windows, roof: { type: 'hip', pitch: 6, ridge: 'along_front', overhang: 1.5 },
    exterior: { walls: 'Brick veneer at the first floor, fiber cement lap siding and panels above', accent: 'Painted breezeway railings, metal balcony rails', roofing: 'Architectural asphalt shingles', windows: 'White vinyl single-hung, low-E', doors: 'Insulated steel unit entry doors' },
    systems: { structure: 'Wood frame (Type V-A), floor and roof trusses, 1-hour unit separations', foundation: 'Post-tensioned slab on grade', hvac: 'split_system', water_heater: 'tank_electric', sprinklered: true, fire_alarm: true } };
}
// a clubhouse / leasing building: the leasing lobby and offices at the front, the club room with its kitchen, restrooms
// and the mail room behind, the fitness room at the back opening to the pool, maintenance and mechanical beside it.
function clubhouseDesign(t) {
  const W = t.W, D = t.D, rooms = [], doors = [], windows = [];
  const room = (id, name, type, x, y, w, d) => { rooms.push({ id, name, type, floor: 1, x: r2(x), y: r2(y), w: r2(w), d: r2(d) }); return id; };
  const door = (a, b, width = 3, kind = 'swing', side = 'any') => doors.push({ a, b, width, kind, side }), win = (r, side, count = 1, width = 3, height = 5) => windows.push({ room: r, side, count, width, height });
  const fd = r2(clampN(D * 0.24, 14, 22)), bd = r2(clampN(D * 0.28, 14, 26)), md = r2(D - fd - bd), cx = r2(W * 0.62), lx = r2(W * 0.5), ox = r2(W * 0.75);
  room('lobby', 'Leasing lobby', 'lobby', 0, 0, lx, fd); room('off1', 'Leasing office', 'office', lx, 0, ox - lx, fd); room('off2', 'Manager', 'office', ox, 0, W - ox, fd);
  door('lobby', 'outside', 6, 'storefront', 'front'); door('lobby', 'off1', 3); door('off1', 'off2', 3); win('lobby', 'front', 2, 6, 7); win('off1', 'front', 1, 4, 5); win('off2', 'front', 1, 4, 5); win('off2', 'right', 1, 4, 5);
  room('club', 'Club room', 'other', 0, fd, cx, md); door('lobby', 'club', 6, 'opening'); win('club', 'left', Math.max(1, Math.floor(md / 10)), 5, 7);
  const kd = r2(clampN(md * 0.35, 10, 16)), rd = r2(clampN((md - kd) * 0.3, 7, 10)), ml = r2(md - kd - 2 * rd);
  room('kit', 'Catering kitchen', 'kitchen', cx, fd, W - cx, kd); door('club', 'kit', 3); win('kit', 'right', 1, 4, 4);
  room('rr1', 'Restroom', 'restroom', cx, fd + kd, W - cx, rd); room('rr2', 'Restroom', 'restroom', cx, fd + kd + rd, W - cx, rd); door('club', 'rr1', 3); door('club', 'rr2', 3);
  if (ml >= 6) { room('mail', 'Mail room', 'storage', cx, fd + kd + 2 * rd, W - cx, ml); door('club', 'mail', 3); }
  else { const r = rooms.find(q => q.id === 'rr2'); r.d = r2(r.d + ml); }
  const fw = cx, y = fd + md;
  room('fit', 'Fitness', 'flex', 0, y, fw, bd); door('club', 'fit', 3); door('fit', 'outside', 6, 'storefront', 'back'); win('fit', 'back', Math.max(1, Math.floor(fw / 10)), 5, 7); win('fit', 'left', 1, 5, 7);
  const mw = r2((W - cx) / 2);
  const mailBack = !rooms.some(r => r.id === 'mail'); // (no room for it beside the club room: the package room at the back, its door outside)
  room('maint', mailBack ? 'Mail room' : 'Maintenance', 'storage', cx, y, mw, bd); door('maint', 'outside', 3, 'swing', 'back');
  room('mech', 'Mechanical / electrical', 'mechanical', cx + mw, y, W - cx - mw, bd); door('mech', 'outside', 3, 'swing', 'back');
  return { summary: 'Rule-based clubhouse: leasing lobby and offices at the front, the club room with its kitchen, restrooms and mail room in the middle, fitness at the back opening to the pool.', rooms, doors, windows,
    roof: { type: 'hip', pitch: 6, ridge: 'along_front', overhang: 2 }, exterior: { walls: 'Brick and stone veneer with fiber cement accents', accent: 'Covered entry and a covered patio to the pool', roofing: 'Standing-seam metal at the entry, asphalt shingles', windows: 'Aluminum storefront at the lobby and fitness, vinyl elsewhere', doors: 'Aluminum storefront entries' },
    systems: { structure: 'Wood frame on slab, engineered roof trusses', foundation: 'Post-tensioned slab on grade', hvac: 'split_system', water_heater: 'tank_electric', sprinklered: t.sprinklered, fire_alarm: t.sprinklered } };
}

// a tiny home or a single-wide: one story, its narrow end on the street or lane. From the front: a second bedroom (a
// two-bedroom single-wide's), the living room and kitchen, a band of bath, hall and laundry, the bedroom at the back (a
// studio: the bath at the back, no bedroom). No garage.
function smallDesign(t) {
  const W0 = t.W, D0 = t.D, turn = W0 > D0, W = Math.min(W0, D0), D = Math.max(W0, D0), rooms = [], doors = [], windows = [];
  const room = (id, name, type, x, y, w, d) => { rooms.push({ id, name, type, floor: 1, x: r2(x), y: r2(y), w: r2(w), d: r2(d) }); return id; };
  const door = (a, b, width = 3, kind = 'swing', side = 'any') => doors.push({ a, b, width, kind, side }), win = (r, side, count = 1, width = 3, height = 5) => windows.push({ room: r, side, count, width, height });
  const beds = smallBeds(t.unitGsf || W * D, W), wide = W >= 24, band = 8, bedD = r2(clampN(D * 0.24, 9, 13)), frontBeds = beds - 1, bed2D = frontBeds > 0 ? r2(clampN(D * 0.18, 10, 12)) : 0;
  const studio = beds === 0 || D - band - bedD - bed2D < 12, liv0 = bed2D, livD = studio ? D - band - liv0 : D - band - bedD - bed2D;
  const baths = beds > 1 ? 2 : 1, bathW = r2(clampN(W * (wide ? 0.28 : 0.45), 5, 8)), hallW = studio ? 0 : 3.5, bath2W = baths > 1 && W - bathW - hallW - 3 >= 5 ? Math.min(8, r2(W - bathW - hallW - 3)) : 0, ldW = r2(W - bathW - hallW - bath2W);
  // the front end: one or two bedrooms (a two- or three-bedroom home), off the living room
  if (frontBeds === 1 || frontBeds > 1 && !wide) { room('bd2', 'Bedroom', 'bedroom', 0, 0, W, bed2D); win('bd2', 'front', 1); }
  else if (frontBeds > 1) { const hw = r2(W / 2); room('bd2', 'Bedroom', 'bedroom', 0, 0, hw, bed2D); room('bd3', 'Bedroom', 'bedroom', hw, 0, W - hw, bed2D); win('bd2', 'front', 1); win('bd3', 'front', 1); win('bd2', 'left', 1); win('bd3', 'right', 1); }
  room('living', 'Living / kitchen', 'living', 0, liv0, W, livD); win('living', 'left', 2, 4, 5); win('living', 'right', 1, 4, 4);
  door('living', 'outside', 3, 'swing', bed2D ? 'left' : 'front'); if (!bed2D) win('living', 'front', 2, 4, 5);
  for (const id of ['bd2', 'bd3']) if (rooms.some(r => r.id === id)) door('living', id, 2.67);
  const yb = liv0 + livD;
  if (studio) { room('bath', 'Bath', 'bath', 0, yb, bathW, band); door('living', 'bath', 2.5); if (W - bathW >= 2.5) { room('laundry', 'Closet / laundry', 'laundry', bathW, yb, W - bathW, band); door('living', 'laundry', 2.5); } win('bath', 'back', 1, 2, 3); }
  else { room('bath', 'Bath', 'bath', 0, yb, bathW, band); room('hall', 'Hall', 'hall', bathW, yb, hallW, band); door('living', 'hall', 3, 'opening'); door('hall', 'bath', 2.5);
    if (bath2W) { room('bath2', 'Bath', 'bath', bathW + hallW, yb, bath2W, band); door('hall', 'bath2', 2.5); }
    if (ldW >= 2.5) { room('laundry', 'Laundry / closet', 'laundry', bathW + hallW + bath2W, yb, ldW, band); door(bath2W ? 'living' : 'hall', 'laundry', 2.5); }
    room('bd1', beds > 1 ? 'Primary bedroom' : 'Bedroom', 'primary_bedroom', 0, yb + band, W, D - yb - band); door('hall', 'bd1', 2.67); win('bd1', 'back', 1); win('bd1', 'right', 1); }
  const rot = turn ? rooms.map(r => ({ ...r, x: r.y, y: r.x, w: r.d, d: r.w })) : rooms; // (back to the footprint's own axes when it lies the other way)
  return { summary: 'Rule-based ' + SMALL[t.small].toLowerCase() + ' plan: ' + (studio ? 'a studio' : beds + ' bedroom' + (beds > 1 ? 's' : '')) + ', ' + (studio || baths < 2 || !bath2W ? 'one bath' : 'two baths') + ', living and kitchen in one room, no garage.', rooms: rot, doors, windows,
    roof: { type: 'gable', pitch: 5, ridge: 'along_front', overhang: 1 }, exterior: { walls: t.small === 'tiny' ? 'Board-and-batten or lap siding' : 'Vinyl or fiber cement lap siding, skirting to grade', accent: 'Painted trim, a small covered porch or deck at the door', roofing: t.small === 'tiny' ? 'Standing-seam metal or architectural shingles' : 'Architectural asphalt shingles', windows: 'Vinyl single-hung, low-E', doors: 'Fiberglass entry door' },
    systems: { structure: t.small === 'tiny' ? 'Wood frame on a permanent foundation or a park-model chassis' : 'HUD-code steel chassis on piers and tie-downs', foundation: t.small === 'tiny' ? 'Slab on grade or piers' : 'Piers with anchors and skirting', hvac: 'heat_pump', water_heater: 'tank_electric', sprinklered: false, fire_alarm: false } };
}
export function fallbackDesign(t) {
  if (t.wash) return washDesign(t);
  if (t.use === 'multifamily' && t.W >= 60 && t.D >= 40 && notchesOf(t).every(n => n.d <= 12 && (n.y < 0.5 || n.y + n.d > t.D - 0.5))) return apartmentDesign(t); // (a stepped front and back: the units take its jogs)
  if (t.use === 'multifamily' && t.D >= 60 && t.W >= 40 && t.D > t.W && notchesOf(t).every(n => n.w <= 12 && (n.x < 0.5 || n.x + n.w > t.W - 0.5))) { // a building end-on to the street: laid out along its length, then turned
    const T = { ...t, W: t.D, D: t.W, fp: t.fp ? t.fp.map(([x, y]) => [y, x]) : null }, d = apartmentDesign(T), side = { front: 'left', back: 'right', left: 'front', right: 'back', any: 'any' };
    return { ...d, rooms: d.rooms.map(r => ({ ...r, x: r.y, y: r.x, w: r.d, d: r.w })), doors: d.doors.map(q => ({ ...q, side: side[q.side] || q.side })), windows: d.windows.map(q => ({ ...q, side: side[q.side] })), roof: { ...d.roof, ridge: 'front_to_back' } };
  }
  if (t.fp) return fallbackPieces(t);
  const W = t.W, D = t.D, F = t.floors, rooms = [], doors = [], windows = [], room = (id, name, type, floor, x, y, w, d) => { rooms.push({ id, name, type, floor, x: r2(x), y: r2(y), w: r2(w), d: r2(d) }); return id; };
  const door = (a, b, width = 3, kind = 'swing', side = 'any') => doors.push({ a, b, width, kind, side }), win = (r, side, count = 1, width = 3, height = 5) => windows.push({ room: r, side, count, width, height });
  const res = RESIDENTIAL.includes(t.use), lr = !t.attached; // windows on the ends only when not a party wall
  if (t.small && t.floors === 1 && Math.min(W, D) <= 32) return smallDesign(t);
  if (t.use === 'multifamily' && W >= 60 && D >= 40) return apartmentDesign(t);
  if (t.use === 'amenity' && W >= 40 && D >= 40) return clubhouseDesign(t);
  if (res) {
    const g = t.garage || 0, gw0 = g >= 2 ? Math.min(21, W - 6) : g ? Math.min(12, W - 6) : 0, gw = gw0 >= 10 ? r2(gw0) : 0, fb = gw ? 22 : 12, cw = r2(clampN(W * 0.3, 8, 12)), F1 = 1;
    if (gw) { room('garage', 'Garage', 'garage', F1, 0, 0, gw, fb); door('garage', 'outside', g >= 2 ? 16 : 9, 'overhead', 'front'); }
    room('entry', 'Entry', 'entry', F1, gw, 0, W - gw, fb); door('entry', 'outside', 3, 'swing', 'front'); win('entry', 'front', 1, 2);
    // the column on the left behind the front band: laundry, powder room, the stair with storage beside it, a pantry
    const avail = D - fb; let st = F > 1 ? Math.min(11, avail) : 0, left = avail - st;
    const ld = left >= 7 ? 7 : left >= 5 ? left : 0; left -= ld; const pd = left >= 5 + (left - 5 >= 4 || left === 5 ? 0 : 0) ? 5 : 0; left -= pd;
    const pan = left >= 4 ? left : 0; if (!pan && left > 0) { if (st) st += left; } // a sliver: the stair runs longer
    let y = fb, sy = null; const col = [];
    if (ld) { col.push(room('laundry', 'Laundry', 'laundry', F1, 0, y, cw, ld)); y += ld; }
    if (pd) { col.push(room('pwd', 'Powder', 'half_bath', F1, 0, y, cw, pd)); y += pd; }
    if (st) { sy = y; room('stair1', 'Stair', 'stair', F1, cw - 4, sy, 4, st); if (cw - 4 >= 2) room('ustor', 'Storage', 'storage', F1, 0, sy, cw - 4, st); y += st; }
    if (pan) { col.push(room('pantry', 'Pantry', 'pantry', F1, 0, y, cw, pan)); y += pan; }
    if (!st && !pan && y < D && col.length) { const last = rooms.find(r => r.id === col[col.length - 1]); last.d = r2(last.d + D - y); } // one story: the last room takes the rest
    const deep = D - fb >= 26;
    if (deep) { const kd = r2((D - fb) * 0.45); room('kitchen', 'Kitchen / dining', 'kitchen', F1, cw, fb, W - cw, kd); room('living', 'Living', 'living', F1, cw, fb + kd, W - cw, D - fb - kd); door('entry', 'kitchen', 3, 'opening'); door('kitchen', 'living', 6, 'opening'); if (lr) win('kitchen', 'right', 1, 4, 4); }
    else { room('living', 'Living / kitchen', 'living', F1, cw, fb, W - cw, D - fb); door('entry', 'living', 3, 'opening'); }
    const kit = rooms.find(r => r.id === 'kitchen'), hub = (y0, y1) => kit && Math.min(y1, kit.y + kit.d) - Math.max(y0, kit.y) >= 3.5 ? 'kitchen' : 'living';
    for (const id of col) { const r = rooms.find(q => q.id === id); door(hub(r.y, r.y + r.d), id, 2.5); }
    if (st) { door(hub(sy, sy + st), 'stair1', 3); if (rooms.some(r => r.id === 'ustor')) door('stair1', 'ustor', 2); }
    if (gw) door('garage', ld ? 'laundry' : 'entry', 3);
    door('living', 'outside', 6, 'sliding', 'back'); win('living', 'back', 2, 4, 6);
    for (let f = 2; f <= F; f++) {
      const s = 'stair' + f, hall = 'hall' + f; room(s, 'Stair', 'stair', f, cw - 4, sy, 4, st); room(hall, 'Hall', 'hall', f, cw, 0, 4, D); door(hall, s, 3.5);
      if (cw - 4 >= 2) { room('lin' + f, 'Linen', 'closet', f, 0, sy, cw - 4, st); door(s, 'lin' + f, 2); }
      // in front of the stair: a bedroom at the street (its window) with the floor's bath behind it, or just the bath;
      // behind the stair, a second bath when there's room
      const backBath = D - sy - st >= 5, frontBath = !backBath || (F > 2 && f === F) ? Math.min(7, sy) : 0;
      if (sy - frontBath >= 9 && cw >= 9) { room('bd' + f + 'c', 'Bedroom', 'bedroom', f, 0, 0, cw, sy - frontBath); door(hall, 'bd' + f + 'c', 2.67); win('bd' + f + 'c', 'front', 1); }
      else if (sy - frontBath > 2) { room('cl' + f + 'c', 'Closet', 'closet', f, 0, 0, cw, sy - frontBath); door(hall, 'cl' + f + 'c', 2.5); }
      if (frontBath >= 5) { room('bf' + f, 'Bath', 'bath', f, 0, sy - frontBath, cw, frontBath); door(hall, 'bf' + f, 2.5); }
      else if (frontBath > 0) { const c = rooms.find(r => r.id === 'bd' + f + 'c' || r.id === 'cl' + f + 'c'); if (c) c.d = r2(c.d + frontBath); }
      if (D - sy - st > 2) { room('ba' + f, D - sy - st >= 5 ? 'Bath' : 'Linen', D - sy - st >= 5 ? 'bath' : 'closet', f, 0, sy + st, cw, D - sy - st); door(hall, 'ba' + f, 2.5); }
      const rx = cw + 4, rw = W - rx, half = r2(D / 2), top = f === F;
      room('bd' + f + 'a', top ? 'Primary bedroom' : 'Bedroom', top ? 'primary_bedroom' : 'bedroom', f, rx, half, rw, D - half); door(hall, 'bd' + f + 'a', 2.67); win('bd' + f + 'a', 'back', rw >= 14 ? 2 : 1);
      room('bd' + f + 'b', 'Bedroom', 'bedroom', f, rx, 0, rw, half); door(hall, 'bd' + f + 'b', 2.67); win('bd' + f + 'b', 'front', 1);
    }
    if (F === 1) { // a one-story house: the bedrooms behind the garage take the column; a simple wing would need a corridor
      // (the rule-based one-story plan keeps the bedrooms in the living block: the AI design is expected to do better)
      const lv = rooms.find(r => r.id === 'living'); if (lv && lv.w >= 24 && lv.d >= 12) { const bw = r2(lv.w / 2); lv.w = bw; rooms.push({ id: 'bd1', name: 'Bedroom', type: 'primary_bedroom', floor: 1, x: lv.x + bw, y: lv.y, w: W - lv.x - bw, d: lv.d }); door('living', 'bd1', 2.67); win('bd1', 'back', 1); }
    }
    // rear-load (lib/sitelayout.mjs townhome rows: garages on the lane behind, front doors on the green court): the same
    // plan turned front to back, the garage on the lane and the living room on the court
    const rear = gw && /rear-load/i.test(t.note || ''); if (rear) { const flip = { front: 'back', back: 'front' }; for (const r of rooms) r.y = r2(D - r.y - r.d); for (const q of doors) q.side = flip[q.side] || q.side; for (const q of windows) q.side = flip[q.side] || q.side; const fd = doors.find(q => q.a === 'entry' && q.b === 'outside'); if (fd) fd.side = 'back'; const ld = doors.find(q => q.a === 'living' && q.b === 'outside'); if (ld) { ld.side = 'front'; ld.kind = 'swing'; ld.width = 3; } }
    return { summary: 'Rule-based ' + (F > 1 ? F + '-story ' : '') + 'plan: ' + (rear ? 'garage at the back on the lane, the front door and living room on the court in front, ' : gw ? 'front garage, living at the back, ' : 'living at the back, ') + 'bedrooms ' + (F > 1 ? 'upstairs off a hall' : 'beside the living area') + '.', rooms, doors, windows,
      roof: { type: 'gable', pitch: 6, ridge: t.attached ? 'along_front' : 'along_front', overhang: 1.5 }, exterior: { walls: 'Brick veneer at the first floor, fiber cement lap siding above', accent: 'Painted trim', roofing: 'Architectural asphalt shingles', windows: 'White vinyl single-hung, low-E', doors: 'Fiberglass entry door, insulated steel garage door' },
      systems: { structure: 'Wood frame, engineered roof trusses at 24 in', foundation: 'Post-tensioned slab on grade', hvac: 'split_system', water_heater: 'tankless_gas', sprinklered: t.sprinklered, fire_alarm: false } };
  }
  const rs = r2(clampN(D * 0.22, 10, 16));
  if (t.use === 'restaurant') {
    const dd = r2(D * 0.5), mid = Math.min(10, D - dd - 8);
    room('dining', 'Dining', 'dining_room', 1, 0, 0, W, dd); door('dining', 'outside', 6, 'storefront', 'front'); win('dining', 'front', Math.max(2, Math.floor(W / 10)), 6, 7); if (W * D > 3000) door('dining', 'outside', 3, 'swing', 'left');
    room('rr1', 'Restroom', 'restroom', 1, 0, dd, 8, mid); room('rr2', 'Restroom', 'restroom', 1, 8, dd, 8, mid); door('dining', 'rr1', 3); door('dining', 'rr2', 3);
    room('stor', 'Dry storage', 'storage', 1, 0, dd + mid, 16, D - dd - mid);
    room('kitchen', 'Kitchen', 'commercial_kitchen', 1, 16, dd, W - 16, D - dd); door('dining', 'kitchen', 5, 'double'); door('kitchen', 'stor', 3); door('kitchen', 'outside', 3, 'swing', 'back');
    const dt = /drive-?thru/i.test(t.note || ''); if (dt) win('kitchen', 'right', 1, 5, 4); // (a drive-thru pad: the pick-up window on the kitchen's side wall, the lane going round it)
    return { summary: 'Rule-based restaurant: dining at the front, restrooms and storage on the left, kitchen behind' + (dt ? ' with the drive-thru pick-up window on its right side wall' : '') + '.', rooms, doors, windows, roof: { type: 'flat', pitch: 0, ridge: 'along_front', overhang: 0 },
      exterior: { walls: 'Brick and stucco', accent: 'Metal canopy at the entry', roofing: 'TPO membrane behind parapets', windows: 'Aluminum storefront', doors: 'Aluminum storefront, hollow metal service door' },
      systems: { structure: 'Load-bearing masonry and steel joists', foundation: 'Slab on grade with grade beams', hvac: 'rooftop_units', water_heater: 'tank_gas', sprinklered: t.sprinklered, fire_alarm: t.sprinklered } };
  }
  if (t.use === 'industrial') {
    const ow = r2(clampN(W * 0.25, 30, 60)), od = Math.min(40, D - 20);
    room('office', 'Office', 'office', 1, 0, 0, ow, od - 10); door('office', 'outside', 3, 'storefront', 'front'); win('office', 'front', Math.max(2, Math.floor(ow / 10)), 5, 6);
    const hw = r2(ow / 2); room('rr1', 'Restroom', 'restroom', 1, 0, od - 10, hw, 10); room('rr2', 'Restroom', 'restroom', 1, hw, od - 10, ow - hw, 10); door('office', 'rr1', 3); door('office', 'rr2', 3);
    room('wh', 'Warehouse', 'warehouse', 1, ow, 0, W - ow, D); room('wh2', 'Warehouse', 'warehouse', 1, 0, od, ow, D - od); door('office', 'wh', 3); door('wh', 'wh2', Math.min(20, ow - 2), 'opening');
    const docks = Math.max(1, Math.min(12, Math.floor((W - ow) / 40))); for (let i = 0; i < docks; i++) door('wh', 'outside', 10, 'overhead', 'back');
    door('wh', 'outside', 3, 'swing', 'right'); door('wh2', 'outside', 3, 'swing', 'left');
    return { summary: 'Rule-based warehouse: office and restrooms at the front left corner, warehouse with dock doors at the back.', rooms, doors, windows, roof: { type: 'flat', pitch: 0, ridge: 'along_front', overhang: 0 },
      exterior: { walls: 'Painted concrete tilt-wall panels', accent: 'Storefront glazing at the office', roofing: 'TPO membrane on steel deck', windows: 'Aluminum storefront and clerestory', doors: 'Insulated overhead dock doors' },
      systems: { structure: 'Concrete tilt-wall with steel joists and girders on steel columns', foundation: 'Slab on grade with spread footings at the columns', hvac: 'rooftop_units', water_heater: 'tank_electric', sprinklered: t.sprinklered, fire_alarm: t.sprinklered } };
  }
  // shells: bays across the front, each with its restroom and back of house; upper floors open with the stair and a restroom
  const n = t.use === 'retail' ? clampN(Math.round(W / 30), 1, 12) : t.use === 'office' || t.use === 'medical' || t.use === 'other' ? clampN(Math.round(W / 60), 1, 8) : 1, bw = r2(W / n);
  const label = { retail: 'Tenant', office: 'Suite', medical: 'Suite', church: 'Sanctuary', fuel: 'Sales', amenity: 'Hall', foodtrucks: 'Pavilion hall', other: 'Suite' }[t.use] || 'Space';
  const ty = { retail: 'tenant', church: 'sanctuary', fuel: 'sales', amenity: 'other', foodtrucks: 'other' }[t.use] || 'tenant';
  for (let i = 0; i < n; i++) {
    const x0 = r2(i * bw), w0 = i === n - 1 ? W - x0 : bw, sp = 'sp' + i, rr = 'rr' + i, bh = 'bh' + i;
    room(sp, n > 1 ? label + ' ' + (i + 1) : label, ty, 1, x0, 0, w0, D - rs); door(sp, 'outside', t.use === 'retail' || t.use === 'fuel' ? 6 : 3, t.use === 'retail' || t.use === 'fuel' ? 'storefront' : 'double', 'front'); win(sp, 'front', Math.max(1, Math.floor(w0 / 10)), 6, 7);
    const rw = Math.min(8, w0 - 2), stairHere = i === 0 && F > 1, sw = stairHere ? Math.min(12, w0 - rw - 1) : 0;
    room(rr, 'Restroom', 'restroom', 1, x0, D - rs, rw, rs); door(sp, rr, 3);
    if (stairHere && sw >= 4) { room('st1', 'Stair', 'stair', 1, x0 + rw, D - rs, sw, rs); door(sp, 'st1', 3); }
    const bx = x0 + rw + (stairHere && sw >= 4 ? sw : 0); if (x0 + w0 - bx >= 3) { room(bh, 'Back of house', 'storage', 1, bx, D - rs, x0 + w0 - bx, rs); door(sp, bh, 3); door(bh, 'outside', 3, 'swing', 'back'); }
    if (W * D / n > 3000 && !(x0 + w0 - bx >= 3)) door(sp, 'outside', 3, 'swing', i === 0 ? 'left' : 'right');
  }
  if (W * D > 3000 && n === 1 && !doors.some(d => d.b === 'outside' && d.side === 'back')) door('sp0', 'outside', 3, 'swing', 'left');
  for (let f = 2; f <= F; f++) {
    const st = rooms.find(r => r.id === 'st1'), fl = 'fl' + f; if (!st) break;
    room('st' + f, 'Stair', 'stair', f, st.x, st.y, st.w, st.d); room(fl, label + 's, floor ' + f, ty, f, 0, 0, W, D - rs); door(fl, 'st' + f, 3); win(fl, 'front', Math.max(1, Math.floor(W / 12)), 5, 6); win(fl, 'left', Math.max(1, Math.floor((D - rs) / 15)), 5, 6); win(fl, 'right', Math.max(1, Math.floor((D - rs) / 15)), 5, 6);
    room('rr' + f + 'u', 'Restroom', 'restroom', f, 0, D - rs, st.x, rs); door(fl, 'rr' + f + 'u', 3);
    if (W - st.x - st.w >= 3) { room('mech' + f, 'Storage / mechanical', 'mechanical', f, st.x + st.w, D - rs, W - st.x - st.w, rs); door(fl, 'mech' + f, 3); }
  }
  return { summary: 'Rule-based shell: ' + n + ' ' + label.toLowerCase() + (n > 1 ? 's' : '') + ' across the front, each with a restroom and back of house' + (F > 1 ? '; upper floors open with the stair' : '') + '.', rooms, doors, windows,
    roof: { type: 'flat', pitch: 0, ridge: 'along_front', overhang: 0 }, exterior: { walls: t.use === 'fuel' ? 'Brick veneer and metal panel' : 'Brick, stone and EIFS', accent: 'Metal canopies over the storefronts', roofing: 'TPO membrane behind parapets', windows: 'Aluminum storefront', doors: 'Aluminum storefront, hollow metal service doors' },
    systems: { structure: t.construction.startsWith('II') ? 'Masonry and steel, steel joists' : 'Wood or light-gauge steel frame, open-web joists', foundation: 'Slab on grade with grade beams', hvac: 'rooftop_units', water_heater: 'tank_electric', sprinklered: t.sprinklered, fire_alarm: t.sprinklered } };
}

// a car wash: the tunnel down the long side of the building (overhead doors at its two ends, glazed along one side), the
// equipment room and a pump / chemical room in the strip beside it
function washDesign(t) {
  const W = t.W, D = t.D, deep = D >= W, L = deep ? D : W, A = deep ? W : D, tw = r2(clampN(A - 8, 12, A - 6)), ew = r2(A - tw), eq = r2(Math.min(40, L / 2)), rooms = [], doors = [], windows = [];
  const R = (id, name, type, u0, v0, lu, lv) => rooms.push(deep ? { id, name, type, floor: 1, x: u0, y: v0, w: lu, d: lv } : { id, name, type, floor: 1, x: v0, y: u0, w: lv, d: lu });
  R('tunnel', 'Wash tunnel', 'other', 0, 0, tw, L); R('equip', 'Equipment room', 'mechanical', tw, 0, ew, eq); R('chem', 'Pump / chemical room', 'mechanical', tw, eq, ew, r2(L - eq));
  const [entry, exit, sideOut] = deep ? ['front', 'back', 'right'] : ['left', 'right', 'back'];
  doors.push({ a: 'tunnel', b: 'outside', width: 12, kind: 'overhead', side: entry }, { a: 'tunnel', b: 'outside', width: 12, kind: 'overhead', side: exit }, { a: 'tunnel', b: 'equip', width: 3, kind: 'swing', side: 'any' }, { a: 'equip', b: 'chem', width: 3, kind: 'swing', side: 'any' }, { a: 'equip', b: 'outside', width: 3, kind: 'swing', side: sideOut });
  windows.push({ room: 'tunnel', side: deep ? 'left' : 'front', count: Math.max(2, Math.floor(L / 16)), width: 6, height: 4 });
  return { summary: 'Rule-based car wash: the tunnel down the length of the building with an overhead door at each end, the equipment and chemical rooms beside it.', rooms, doors, windows, roof: { type: 'flat', pitch: 0, ridge: 'along_front', overhang: 0 },
    exterior: { walls: 'Split-face CMU with metal panel', accent: 'Glazed tunnel wall and lit entry arch', roofing: 'TPO membrane behind parapets', windows: 'Aluminum, tempered glazing', doors: 'High-speed overhead doors at the tunnel ends, hollow metal service door' },
    systems: { structure: 'Reinforced CMU walls, steel joists', foundation: 'Slab on grade with the conveyor trench and trench drains to the reclaim tanks', hvac: 'none', water_heater: 'tank_gas', sprinklered: false, fire_alarm: false } };
}
// a shaped building: each rectangle of its outline laid out as a building of its own, put together, then the doors and
// windows that landed on inside walls dropped and every room left without a way in joined to a neighbour
function fallbackPieces(t) {
  const pieces = piecesOf(t), out = { rooms: [], doors: [], windows: [] }; let first = null;
  pieces.forEach((pc, i) => {
    const id = x => x === 'outside' ? x : 'p' + i + '_' + x;
    if (i && Math.min(pc.w, pc.d) < 16) { // a sliver (a stepped front's bump, a narrow link): one room, joined to its neighbour below
      for (let f = 1; f <= t.floors; f++) out.rooms.push({ id: id('s' + f), name: RESIDENTIAL.includes(t.use) ? 'Flex' : t.use === 'retail' || t.use === 'fuel' ? 'Display / entry' : 'Storage', type: RESIDENTIAL.includes(t.use) ? 'flex' : t.use === 'retail' || t.use === 'fuel' ? 'sales' : 'storage', floor: f, x: pc.x, y: pc.y, w: pc.w, d: pc.d });
      return;
    }
    const sub = fallbackDesign({ ...t, fp: null, W: pc.w, D: pc.d }); first ||= sub;
    for (const r of sub.rooms) out.rooms.push({ ...r, id: id(r.id), x: r2(r.x + pc.x), y: r2(r.y + pc.y) });
    for (const d of sub.doors) out.doors.push({ ...d, a: id(d.a), b: id(d.b) });
    for (const w of sub.windows) out.windows.push({ ...w, room: id(w.room) });
  });
  Object.assign(out, { summary: 'Rule-based plan for the ' + t.shape + ': each of its ' + pieces.length + ' wings laid out on its own and joined.', roof: first.roof, exterior: first.exterior, systems: first.systems });
  for (let k = 0; k < 5; k++) {
    const r = placeDesign(out, t); if (!r.problems.length) break;
    const byId = new Map(r.design.rooms.map(x => [x.id, x])), ext = rm => SIDES.filter(sd => onSide(rm, sd, t) && !(t.attached && (sd === 'left' || sd === 'right')));
    const room0 = d => byId.get(d.a), fits = d => room0(d) && ext(room0(d)).some(sd => { const e = onSide(room0(d), sd, t); return e && e.to - e.from >= (d.width || 3); });
    out.doors = out.doors.filter(d => !(d.b === 'outside' && !fits(d)));
    out.windows = out.windows.filter(w => byId.get(w.room) && onSide(byId.get(w.room), w.side, t));
    const reach = new Set(r.design.rooms.map(x => x.id).filter(x => !r.unreachable.includes(x)));
    for (const id of r.unreachable) {
      const a = byId.get(id); let best = null;
      for (const b of r.design.rooms) { if (b.floor !== a.floor || b.id === id || !reach.has(b.id)) continue; const sw = shared(a, b); if (sw && sw.to - sw.from >= 4 && (!best || sw.to - sw.from > best.len)) best = { b, len: sw.to - sw.from }; }
      if (best) out.doors.push({ a: best.b.id, b: id, width: 3, kind: 'swing', side: 'any' }); else if (a.floor === 1 && ext(a).length) out.doors.push({ a: id, b: 'outside', width: 3, kind: 'swing', side: ext(a)[0] });
    }
  }
  return out;
}

// ---------- quantities the sheets use ----------
// IBC Table 1004.5 occupant load factors (sf per person; gross unless noted)
export const LOAD_FACTOR = { tenant: 60, sales: 60, dining_room: 15, commercial_kitchen: 200, walk_in_cooler: 300, office: 150, reception: 100, conference: 15, break_room: 15, exam: 150, lobby: 100, warehouse: 500, sanctuary: 15, classroom: 20,
  storage: 300, mechanical: 300, electrical: 300, janitor: 300, corridor: 0, restroom: 0, stair: 0, other: 100 };
export function occupantLoad(design) {
  if (RESIDENTIAL.includes(design.use)) return { total: 0, rows: [] };
  const rows = design.rooms.map(r => ({ room: r, factor: LOAD_FACTOR[r.type] ?? 100 })).map(x => ({ ...x, load: x.factor ? Math.ceil(x.room.area / x.factor) : 0 }));
  return { total: rows.reduce((s, x) => s + x.load, 0), rows };
}
export const roomsOn = (design, f) => design.rooms.filter(r => r.floor === f);
export const isWet = r => ['bath', 'half_bath', 'restroom', 'kitchen', 'commercial_kitchen', 'laundry', 'janitor'].includes(r.type);
