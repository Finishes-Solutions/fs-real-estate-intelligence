// Building designs for plan sets (PLANSET-PLAN.md, phase 3): the plan's buildings grouped into types, a floor plan for
// each type as rectangles (rooms), doors and windows, the checks a design must pass, and a rule-based design for every
// supported use so a set can always be finished. Claude designs each type in the same shape (DESIGN_SCHEMA, through
// api/planset.js mode 'design'); the browser checks the answer here and sends the problems back for a fix, at most twice,
// then falls back to the rule-based design. No DOM, no network: shared by the browser, the server and the tests.
//
// A type's own coordinates, in feet: x runs from the left end (0) to the right end (W) as seen from the street, y from
// the front wall (0) to the back wall (D). Every room is an axis-aligned rectangle { x, y, w, d } on a floor (1 = ground).
import * as S from './siteplan.mjs';
import * as DS from './designs.mjs';
export const homeProgram = DS.homeProgram;

const r2 = v => Math.round((+v || 0) * 2) / 2; // to the half foot
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- the plan's building types ----------
// uses the set can design now; the rest get site sheets only and a line in the index
export const SUPPORTED = ['sfr', 'townhomes', 'duplex', 'retail', 'restaurant', 'office', 'medical', 'church', 'industrial', 'fuel', 'amenity', 'foodtrucks', 'other'];
export const LATER = { multifamily: 'Apartment buildings', hotel: 'Hotels', storage: 'Self storage buildings' };
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
  const paved = (plan.elements || []).filter(x => x.kind === 'drive' || x.kind === 'parking');
  let target = null;
  if (paved.length) { let best = Infinity; for (const p of paved) { const dd = Math.hypot(p.x - e.x, p.y - e.y); if (dd < best) { best = dd; target = [p.x, p.y]; } } }
  else if ((plan.ring || []).length >= 3) { const r = plan.ring, i = plan.front != null && plan.front < r.length ? plan.front : S.longestEdge(r), a = r[i], b = r[(i + 1) % r.length]; target = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
  if (!target) return '-y';
  return Object.entries(sides).sort((p, q) => Math.hypot(p[1][0] - target[0], p[1][1] - target[1]) - Math.hypot(q[1][0] - target[0], q[1][1] - target[1]))[0][0];
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
    const wash = use === 'fuel' && S.fuelKind(e) === 'wash', key = [use + (wash ? ':wash' : ''), W, D, floors, attached ? units : 1, fp ? JSON.stringify(fp) : ''].join('|'); // (a gas station's car wash: a building of its own kind)
    let g = groups.get(key);
    if (!g) groups.set(key, g = { key, use, wash, W, D, fp, shape, approx, floors, floorH: U.floorH || 10, attached, unitsPer: attached ? units : 1, count: 0, units: 0, names: [], elementIds: [], garage: U.garage || 0, sf: e.sf || null, note: e.note || '', bw, bd });
    g.count++; g.units += RESIDENTIAL.includes(use) ? units : 0; if (g.names.length < 8) g.names.push(e.name || ''); g.elementIds.push(e.id);
  }
  let list = [...groups.values()].sort((a, b) => b.count - a.count || b.W * b.D - a.W * a.D);
  // more kinds than a set should carry: every kind of building keeps one type (each use, a gas station's car wash apart
  // from its store: a store among apartments is never drawn as an apartment), then the most common of the rest; the
  // others are drawn as the nearest kept type of the same use (by footprint)
  const kindOf = g => g.use + (g.wash ? ':wash' : ''), firsts = list.filter((g, i) => list.findIndex(h => kindOf(h) === kindOf(g)) === i);
  const keep = firsts.concat(list.filter(g => !firsts.includes(g)).slice(0, Math.max(0, MAX_TYPES - firsts.length))), rest = list.filter(g => !keep.includes(g));
  for (const g of rest) { const near = keep.filter(k => kindOf(k) === kindOf(g)).sort((a, b) => Math.abs(a.W * a.D - g.W * g.D) - Math.abs(b.W * b.D - g.W * g.D))[0] || keep[0]; near.similar = (near.similar || 0) + g.count; near.count += g.count; near.units += g.units; near.elementIds.push(...g.elementIds); }
  list = keep.sort((a, b) => (SUPPORTED.indexOf(a.use) - SUPPORTED.indexOf(b.use)) || b.W * b.D - a.W * a.D);
  return list.map((g, i) => {
    const foot = g.fp ? polyArea(g.fp) : g.W * g.D, unitGsf = foot * g.floors, buildingGsf = (g.fp ? foot : g.bw * g.bd) * g.floors, sp = sprinklerRule(g.use, buildingGsf, g.floors), supported = SUPPORTED.includes(g.use);
    return { id: String.fromCharCode(65 + i), use: g.use, ...(g.wash ? { wash: true } : {}), label: g.wash ? 'Car wash' : (S.USES[g.use]?.label || g.use) + (g.attached ? ' unit' : ''), W: g.W, D: g.D, fp: g.fp, shape: g.shape, approx: g.approx, footArea: Math.round(foot), floors: g.floors, floorH: g.floorH, attached: g.attached, unitsPer: g.unitsPer,
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

export const DESIGN_SYSTEM = 'You are an experienced architect drawing schematic floor plans for a schematic design set made by Finishes Solutions, a development consultant in Texas. ' +
  'You lay out one building type at a time as axis-aligned rectangles in feet, in the JSON schema given. The drawings, schedules and engineering sheets are generated from your answer by code, and code checks it against the rules below and the program, so follow them exactly.\n' +
  'Coordinates: x runs from the left end of the footprint (0) to the right end (W) as seen from the street; y runs from the front wall (0) to the back wall (D). Floor 1 is the ground floor. Snap every number to the half foot.\n' +
  'Rules:\n' +
  '1. Every room is a rectangle inside the footprint (0 ≤ x, x + w ≤ W, 0 ≤ y, y + d ≤ D). When the brief gives an outline (an L, a U, a stepped front), the building is that outline, not its bounding box: no room may reach into the open ground of a notch, and every wall on the outline is an exterior wall (a storefront, door or window can go on the inside corner of an L). Rooms on the same floor never overlap.\n' +
  '2. Floor 1 is covered completely: the rooms tile the whole footprint, no gaps (use halls, closets, storage or mechanical rooms for leftovers). Upper floors may leave open-to-below areas but should be mostly covered.\n' +
  '3. A stair is a room of type stair at the same x, y, w, d on every floor it serves (about 4 ft wide by 12 to 14 ft long for a house, 10 by 20 ft for commercial).\n' +
  '4. A door joins two rooms on the same floor that share a wall at least the door\'s width plus one foot long; or joins a floor 1 room to "outside", on a side of the building that room touches (give that side). Every room must be reachable from outside through doors and stairs. Use kind "opening" (a cased opening) between a kitchen and the living room, a foyer and a hall.\n' +
  '5. Windows only on exterior walls: the room must touch that side of the footprint. Attached units (townhomes, duplex units) have party walls on the left and right: no windows or doors there.\n' +
  '6. Homes (IRC): design to the program in the brief: that many bedrooms (within one) and full baths, a kitchen, a living or family room, a laundry, the garage at the front with an overhead door and a door into the house. Every bedroom is at least 70 sf and 7 ft each way, has a window, and has a closet or walk-in closet of its own opening off it (a separate room of type closet or walk_in_closet, 2 to 3 ft deep for a reach-in, 5 to 8 ft for a walk-in). The primary suite has its own bath and walk-in closet. Living, family, dining, study and flex rooms need a window or an opening to a room with one. Baths are at least 5 ft across (a tub), powder rooms 3 ft.\n' +
  '7. No wasted space in a home: an entry or foyer is 40 to 120 sf, halls 3.5 to 4 ft wide (6 ft at most), reach-in closets under 60 sf, walk-in closets under 150 sf, laundry rooms 30 to 100 sf, pantries under 60 sf, powder rooms 15 to 40 sf, the garage 220 to 300 sf a car. Circulation (halls, entry, stairs) under about 15% of each floor. Kitchens 120 to 350 sf, secondary bedrooms 110 to 200 sf, the primary bedroom 180 to 350 sf; big houses get a game room, study, dining room or sitting room, never bigger service rooms. Put the kitchen open to the living room, the primary suite away from the other bedrooms, the laundry near the garage or the bedrooms.\n' +
  '8. Commercial (IBC): an accessible restroom is at least 7 by 6 ft (60 in turning space); two restrooms where the occupant load is over 15 (over 100 for retail); a lobby or corridor people enter through in anything over 2,500 sf; an electrical / mechanical room (and a janitor closet with a mop sink) in anything over 4,000 sf; two exits where a floor is over 3,000 sf or holds 50 people; two stairs on an upper floor over 3,500 sf; corridors 6 ft wide. Restaurants: vestibule, dining at the front, commercial kitchen (40 to 60% of the dining area) with a dish area, walk-in cooler and freezer, dry storage, office, two restrooms off a corridor. Convenience stores: sales floor with the walk-in cooler across the back, two restrooms, office, storage with a receiving door. Offices: lobby, double-loaded corridor, suites, restrooms, janitor, electrical and mechanical rooms, elevator and two stairs when more than one story. Warehouses: office block at a front corner, the warehouse behind with dock doors on the back or a side, electrical and riser rooms. Churches: narthex, sanctuary, classrooms, offices, restrooms, kitchen.\n' +
  '9. Realistic sizes: doors 3 ft (2.5 to 2.67 ft for closets and baths in homes, 6 ft double or storefront for commercial entries, 9 or 16 ft overhead doors for garages, 10 to 12 ft for docks); openings 6 to 10 ft; windows 3 by 5 ft in homes (6 by 7 storefront).\n' +
  'A rule-based plan that already passes the checks is given as a fallback. You may keep its organization or lay the building out differently: design the plan an architect would draw for this program, then check it against the rules. Give materials and systems that suit the use and southeast Texas.';

// the brief for one type: what it is, its footprint, its program, where it is
export function designBrief(t, ctx = {}) {
  const res = RESIDENTIAL.includes(t.use), P = res ? DS.homeProgram(t) : null, beds = P ? P.beds : 0;
  const lines = ['Building type ' + t.id + ': ' + t.label, 'Footprint: W = ' + t.W + ' ft (along the street) by D = ' + t.D + ' ft (front to back), ' + t.floors + ' floor' + (t.floors > 1 ? 's' : '') + ', floor to floor about ' + t.floorH + ' ft.',
    'Floor area: about ' + Math.round(t.unitGsf).toLocaleString('en-US') + ' gross sf' + (t.attached ? ' per unit (' + t.unitsPer + ' units in a row; party walls on the left and right)' : '') + '.',
    t.fp ? 'Shape: ' + t.shape + '. The building is the outline through these corners (x, y): ' + t.fp.map(q => '(' + q[0] + ', ' + q[1] + ')').join(' ') + '. Open ground, with no rooms, in the notch' + (notchesOf(t).length > 1 ? 'es' : '') + ': ' + notchesOf(t).map(c => 'x ' + c.x + ' to ' + (c.x + c.w) + ', y ' + c.y + ' to ' + (c.y + c.d)).join('; ') + '. Footprint about ' + Math.round(t.footArea).toLocaleString('en-US') + ' sf.' : '',
    res ? 'Program: ' + beds + ' bedroom' + (beds > 1 ? 's' : '') + ' (each with its closet), ' + P.baths + ' full bath' + (P.baths > 1 ? 's' : '') + (P.half ? ' and a powder room' : '') + ', kitchen open to the living room, laundry' + (t.garage ? ', a ' + t.garage + '-car garage at the front' : ', no garage (parking pad in front)') + (P.tiny ? '; a tiny home: keep it to the essentials' : '; a primary suite with its own bath and walk-in closet') + (t.note ? ' (' + t.note + ')' : '') + '.' :
      t.use === 'retail' ? 'Program: a multi-tenant retail shell; about one tenant bay per 25 to 35 ft of frontage, each with its own storefront, restroom and rear service door.' :
      t.use === 'restaurant' ? 'Program: a full-service restaurant: vestibule and host stand, dining, bar or counter, commercial kitchen with a dish area, walk-in cooler and freezer, dry storage, office, two accessible restrooms off a corridor, janitor and electrical rooms.' :
      t.use === 'industrial' ? 'Program: a warehouse / distribution building with a front office (about 5 to 10% of the floor), restrooms, and overhead dock doors.' :
      t.use === 'fuel' && t.wash ? 'Program: an express car wash tunnel running the length of the building, overhead doors at the entry and exit ends, an equipment room (pumps, reclaim, chemicals, controls) along one side, no customer rooms.' :
      t.use === 'fuel' ? 'Program: a convenience store: sales floor with the walk-in cooler across its back wall (reach-in doors facing the floor), checkout, food service counter, two accessible restrooms, office, electrical room, storage with a receiving door.' :
      t.use === 'office' || t.use === 'medical' ? 'Program: ' + (t.use === 'medical' ? 'medical office suites with exam rooms' : 'multi-tenant office suites') + ', lobby, a double-loaded corridor, two restrooms, janitor, electrical and mechanical rooms' + (t.floors > 1 ? ', an elevator and two stairs on every floor' : '') + '.' :
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
  for (const r of R.filter(x => BEDS.includes(x.type))) if (!windows.some(w => w.room === r.id)) problems.push('Bedroom "' + r.name + '" has no window (emergency escape, IRC R310).');
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
  problems.push(...programProblems(design, t, doors));
  return { design, problems: [...new Set(problems)], unreachable: cut.map(r => r.id) };
}

// ---------- the program: does the plan make sense as a building of its kind? ----------
// Rooms that waste space (a 700 sf entry, a 170 sf closet, a hall a fifth of the floor), the wrong count of bedrooms or
// baths, bedrooms without closets, habitable rooms without daylight, restrooms too small to be accessible, a restaurant
// without a kitchen or walk-in: the checks a reviewer would make before the geometry ones matter.
const RES_CAPS = { entry: 160, hall: 0, closet: 100, walk_in_closet: 250, laundry: 150, pantry: 100, half_bath: 60, bath: 250, storage: 250, mechanical: 120, kitchen: 500, bedroom: 400, primary_bedroom: 800, dining: 400, office: 300, living: 900, family: 900, flex: 700, porch: 600 };
const COM_MIN = { restroom: [5.5, 40], janitor: [3, 9], electrical: [3, 12], mechanical: [3, 12], stair: [3.5, 30], corridor: [3.67, 0], lobby: [6, 60] };
export function programProblems(d, t, doors = []) {
  const P = [], rooms = d.rooms || [], res = RESIDENTIAL.includes(t.use), floors = Math.max(1, t.floors || 1), by = ty => rooms.filter(r => r.type === ty), area = rooms.reduce((s, r) => s + r.area, 0);
  const beds = rooms.filter(r => BEDS.includes(r.type)), baths = by('bath'), adj = (a, b) => !!shared(a, b), doorBetween = (a, b) => doors.some(x => (x.a === a.id && x.b === b.id) || (x.a === b.id && x.b === a.id));
  if (res) {
    const prog = DS.homeProgram(t);
    if (!prog.tiny && Math.abs(beds.length - prog.beds) > 1) P.push('The program is about ' + prog.beds + ' bedrooms; the design has ' + beds.length + '.');
    if (prog.tiny && beds.length < 1) P.push('A home needs at least one bedroom.');
    if (baths.length < Math.max(1, prog.baths - 1)) P.push('The program is about ' + prog.baths + ' full baths; the design has ' + baths.length + '.');
    for (const b of beds) if (!rooms.some(c => (c.type === 'closet' || c.type === 'walk_in_closet') && c.floor === b.floor && doorBetween(b, c))) P.push('Bedroom "' + b.name + '" has no closet (a closet or walk-in closet opening off it).');
    if (!rooms.some(r => r.type === 'kitchen' || /kitchen/i.test(r.name))) P.push('A home needs a kitchen.');
    if (!rooms.some(r => ['living', 'family'].includes(r.type))) P.push('A home needs a living or family room.');
    if (!prog.tiny && !rooms.some(r => r.type === 'laundry' || /laundry|utility/i.test(r.name))) P.push('A home needs a laundry room or closet.');
    if (t.garage && !by('garage').length && t.W >= 44 && t.D >= 40) P.push('The program has a ' + t.garage + '-car garage; the design has none.');
    for (const g of by('garage')) { const per = g.area / Math.max(1, t.garage || 1); if (g.w < 11 || g.d < 19) P.push('Garage "' + g.name + '" is ' + g.w + ' × ' + g.d + ' ft: at least 11 × 19 ft a car.'); else if (per > 420) P.push('Garage "' + g.name + '" is ' + g.area + ' sf for ' + (t.garage || 1) + ' car' + ((t.garage || 1) > 1 ? 's' : '') + ': too big; about 220 to 300 sf a car.'); }
    const scale = Math.max(1, Math.sqrt(area / 2200));
    for (const r of rooms) { const cap = RES_CAPS[r.type] * (['entry', 'hall', 'closet', 'laundry', 'pantry', 'half_bath', 'storage', 'mechanical'].includes(r.type) ? Math.min(scale, 1.3) : scale); if (cap && r.area > cap) P.push('"' + r.name + '" (' + r.type.replace(/_/g, ' ') + ') is ' + r.area + ' sf: more than a ' + r.type.replace(/_/g, ' ') + ' needs in a home this size (about ' + Math.round(cap) + ' sf at most). Give the space to rooms people use.'); }
    for (const r of rooms) if (['tenant', 'sales', 'warehouse', 'sanctuary', 'commercial_kitchen', 'walk_in_cooler', 'corridor', 'lobby', 'reception', 'exam', 'conference', 'break_room', 'classroom', 'dining_room', 'restroom', 'janitor'].includes(r.type)) P.push('"' + r.name + '" is a ' + r.type.replace(/_/g, ' ') + ': not a room in a home.');
    for (const r of rooms) if (['bath', 'half_bath'].includes(r.type) && Math.min(r.w, r.d) < (r.type === 'bath' ? 5 : 3)) P.push('"' + r.name + '" is ' + Math.min(r.w, r.d) + ' ft across: a ' + (r.type === 'bath' ? 'full bath needs 5 ft (a tub)' : 'powder room needs 3 ft') + '.');
    for (const r of rooms) if (r.type === 'hall' && Math.min(r.w, r.d) > 8 && r.area > 120) P.push('"' + r.name + '" is a ' + r.w + ' × ' + r.d + ' ft hall: too wide; halls are 3.5 to 6 ft.');
    for (let f = 1; f <= floors; f++) { const fl = rooms.filter(r => r.floor === f), fa = fl.reduce((s, r) => s + r.area, 0), circ = fl.filter(r => ['hall', 'entry', 'stair'].includes(r.type)).reduce((s, r) => s + r.area, 0); if (fa > 600 && circ / fa > 0.2) P.push('Floor ' + f + ' spends ' + Math.round(circ / fa * 100) + '% of its area on halls, entry and stairs: keep circulation under about 18%.'); }
    for (const r of rooms) if (['living', 'family', 'dining', 'office', 'flex'].includes(r.type) && !(d.windows || []).some(w => w.room === r.id) && !rooms.some(q => q.floor === r.floor && q !== r && ['living', 'family', 'kitchen', 'dining'].includes(q.type) && doors.some(x => x.kind === 'opening' && ((x.a === r.id && x.b === q.id) || (x.b === r.id && x.a === q.id))) && (d.windows || []).some(w => w.room === q.id))) P.push('"' + r.name + '" has no window and no opening to a room with one: habitable rooms need daylight (IRC R303).');
    return P;
  }
  // commercial
  const load = occupantLoad(d).total, occ = String(t.occupancy || 'B'), rr = by('restroom');
  for (const r of rooms) { const m = COM_MIN[r.type]; if (m && (Math.min(r.w, r.d) < m[0] || r.area < m[1])) P.push('"' + r.name + '" (' + r.type + ') is ' + r.w + ' × ' + r.d + ' ft: ' + (r.type === 'restroom' ? 'an accessible restroom needs about 7 × 6 ft (60 in turning space, TAS 603)' : r.type === 'corridor' ? 'corridors are 44 in wide at least (IBC 1020.3)' : r.type === 'stair' ? 'a commercial stair needs about 4 × 10 ft of run plus landings' : 'too small to be a ' + r.type) + '.'); }
  const single = load <= 15 || (occ.startsWith('M') && load <= 100);
  if (!rr.length && rooms.some(r => r.type !== 'tenant')) P.push('No restroom: every building needs at least one accessible restroom (IPC 403).');
  if (!single && rr.length < 2) P.push('Occupant load ' + load + ': separate facilities for each sex are required, so at least two restrooms (IPC 403.2 / 2902.2).');
  for (let f = 1; f <= floors; f++) { const fa = rooms.filter(r => r.floor === f).reduce((s, r) => s + r.area, 0), rrArea = rr.filter(r => r.floor === f).reduce((s, r) => s + r.area, 0); if (rrArea > Math.max(400, fa * 0.12)) P.push('Restrooms on floor ' + f + ' take ' + rrArea + ' sf, more than the use needs (about ' + Math.round(Math.max(400, fa * 0.12)) + ' sf).'); }
  if (t.use === 'restaurant') { for (const [ty, nm] of [['dining_room', 'a dining room'], ['commercial_kitchen', 'a commercial kitchen'], ['walk_in_cooler', 'a walk-in cooler'], ['storage', 'dry storage']]) if (!by(ty).length) P.push('A restaurant needs ' + nm + '.');
    const kit = by('commercial_kitchen').reduce((s, r) => s + r.area, 0), din = by('dining_room').reduce((s, r) => s + r.area, 0); if (kit && din && (kit < din * 0.35 || kit > din * 1.2)) P.push('Kitchen area ' + kit + ' sf against dining ' + din + ' sf: a full-service kitchen is about 40 to 60% of the dining area.'); }
  if (t.use === 'fuel' && !t.wash) { if (!by('sales').length) P.push('A convenience store needs a sales floor.'); if (!by('walk_in_cooler').length) P.push('A convenience store needs a walk-in cooler.'); if (!by('storage').length) P.push('A convenience store needs a storage / receiving room.'); }
  if (t.use === 'industrial' && !by('warehouse').length) P.push('A warehouse building needs a warehouse.');
  if (t.use === 'church' && !by('sanctuary').length) P.push('A church needs a sanctuary.');
  if (['office', 'medical', 'church', 'restaurant'].includes(t.use) && area > 2500 && !rooms.some(r => ['corridor', 'lobby', 'reception', 'hall'].includes(r.type))) P.push('A building this size needs a lobby or corridor people enter through.');
  if (!res && area > 4000 && !rooms.some(r => ['electrical', 'mechanical'].includes(r.type) || /electrical|mechanical|riser/i.test(r.name))) P.push('A building over 4,000 sf needs an electrical / mechanical room.');
  for (let f = 1; f <= floors; f++) { const fl = rooms.filter(r => r.floor === f), fa = fl.reduce((s, r) => s + r.area, 0), st = fl.filter(r => r.type === 'stair').length; if (f > 1 && (fa > 3500 || occupantLoad({ ...d, rooms: fl }).total > 49) && st < 2) P.push('Floor ' + f + ' (' + Math.round(fa).toLocaleString('en-US') + ' sf) needs two stairs (IBC 1006.3.3).'); }
  for (const r of rooms) if (['bedroom', 'primary_bedroom', 'garage', 'half_bath', 'bath', 'family', 'living', 'pantry', 'porch'].includes(r.type)) P.push('"' + r.name + '" is a ' + r.type.replace(/_/g, ' ') + ': not a room in a ' + (S.USES[t.use]?.label || t.use).toLowerCase() + ' building.');
  return P;
}

// ---------- rule-based designs (the seed Claude improves, and the fallback when its answers keep failing) ----------
export function fallbackDesign(t) {
  if (t.wash) return washDesign(t);
  if (t.fp) return fallbackPieces(t);
  return repairDesign(rawDesign(t), t);
}
// the archetype for a use (lib/designs.mjs), before the repair pass
function rawDesign(t) {
  if (RESIDENTIAL.includes(t.use)) return DS.homeDesign(t);
  switch (t.use) {
    case 'restaurant': return DS.restaurantDesign(t);
    case 'industrial': return DS.warehouseDesign(t);
    case 'fuel': return DS.cstoreDesign(t);
    case 'office': case 'medical': return DS.officeDesign(t);
    case 'church': return DS.churchDesign(t);
    case 'retail': return DS.retailDesign(t);
    case 'amenity': return DS.hallDesign(t, 'Amenity hall', 'other');
    case 'foodtrucks': return DS.hallDesign(t, 'Pavilion hall', 'other');
    default: return t.floors > 1 || t.W * t.D > 6000 ? DS.officeDesign(t) : DS.hallDesign(t, 'Suite', 'tenant');
  }
}
// a raw design made safe: doors to outside from rooms with no exterior wall and windows on inside walls dropped, every
// room left without a way in joined to a reachable neighbour, a few rounds
export function repairDesign(out, t) {
  out.doors = out.doors.filter(d => d.a !== d.b && (d.b === 'outside' ? out.rooms.some(r => r.id === d.a) : out.rooms.some(r => r.id === d.a) && out.rooms.some(r => r.id === d.b)));
  for (let k = 0; k < 6; k++) {
    const r = placeDesign(out, t); if (!r.problems.length) break;
    const byId = new Map(r.design.rooms.map(x => [x.id, x])), ext = rm => SIDES.filter(sd => onSide(rm, sd, t) && !(t.attached && (sd === 'left' || sd === 'right')));
    const room0 = d => byId.get(d.a), fits = d => room0(d) && ext(room0(d)).some(sd => { const e = onSide(room0(d), sd, t); return e && e.to - e.from >= (d.width || 3); });
    out.doors = out.doors.filter(d => !(d.b === 'outside' && !fits(d)));
    out.doors = out.doors.filter(d => d.b === 'outside' || (byId.get(d.a) && byId.get(d.b) && byId.get(d.a).floor === byId.get(d.b).floor && (() => { const s = shared(byId.get(d.a), byId.get(d.b)); return s && s.to - s.from >= (d.width || 3) + 0.5; })()));
    out.windows = out.windows.filter(w => byId.get(w.room) && onSide(byId.get(w.room), w.side, t) && !(t.attached && (w.side === 'left' || w.side === 'right')));
    const reach = new Set(r.design.rooms.map(x => x.id).filter(x => !r.unreachable.includes(x)));
    for (const id of r.unreachable) {
      const a = byId.get(id); let best = null;
      for (const b of r.design.rooms) { if (b.floor !== a.floor || b.id === id || !reach.has(b.id)) continue; const sw = shared(a, b); if (sw && sw.to - sw.from >= 3.5 && (!best || sw.to - sw.from > best.len)) best = { b, len: sw.to - sw.from }; }
      if (best) { out.doors.push({ a: best.b.id, b: id, width: best.len >= 4 ? 3 : 2.5, kind: 'swing', side: 'any' }); reach.add(id); } else if (a.floor === 1 && ext(a).length) out.doors.push({ a: id, b: 'outside', width: 3, kind: 'swing', side: ext(a)[0] });
    }
  }
  return out;
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
  return repairDesign(out, t);
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
