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
    const key = [use, W, D, floors, attached ? units : 1, fp ? JSON.stringify(fp) : ''].join('|');
    let g = groups.get(key);
    if (!g) groups.set(key, g = { key, use, W, D, fp, shape, approx, floors, floorH: U.floorH || 10, attached, unitsPer: attached ? units : 1, count: 0, units: 0, names: [], elementIds: [], garage: U.garage || 0, sf: e.sf || null, note: e.note || '', bw, bd });
    g.count++; g.units += RESIDENTIAL.includes(use) ? units : 0; if (g.names.length < 8) g.names.push(e.name || ''); g.elementIds.push(e.id);
  }
  let list = [...groups.values()].sort((a, b) => b.count - a.count || b.W * b.D - a.W * a.D);
  // more kinds than a set should carry: the rest are drawn as the nearest kept type of the same use (by footprint)
  const keep = list.slice(0, MAX_TYPES), rest = list.slice(MAX_TYPES);
  for (const g of rest) { const near = keep.filter(k => k.use === g.use).sort((a, b) => Math.abs(a.W * a.D - g.W * g.D) - Math.abs(b.W * b.D - g.W * g.D))[0] || keep[0]; near.similar = (near.similar || 0) + g.count; near.count += g.count; near.units += g.units; near.elementIds.push(...g.elementIds); }
  list = keep.sort((a, b) => (SUPPORTED.indexOf(a.use) - SUPPORTED.indexOf(b.use)) || b.W * b.D - a.W * a.D);
  return list.map((g, i) => {
    const foot = g.fp ? polyArea(g.fp) : g.W * g.D, unitGsf = foot * g.floors, buildingGsf = (g.fp ? foot : g.bw * g.bd) * g.floors, sp = sprinklerRule(g.use, buildingGsf, g.floors), supported = SUPPORTED.includes(g.use);
    return { id: String.fromCharCode(65 + i), use: g.use, label: (S.USES[g.use]?.label || g.use) + (g.attached ? ' unit' : ''), W: g.W, D: g.D, fp: g.fp, shape: g.shape, approx: g.approx, footArea: Math.round(foot), floors: g.floors, floorH: g.floorH, attached: g.attached, unitsPer: g.unitsPer,
      count: g.count, units: g.units, unitGsf, buildingGsf, names: g.names, elementIds: g.elementIds, garage: RESIDENTIAL.includes(g.use) ? g.garage : 0, sf: g.sf, note: g.note,
      occupancy: occupancyOf(g.use), construction: constructionOf(g.use, buildingGsf), sprinklered: sp.on, sprinklerWhy: sp.why, supported, why: supported ? '' : (LATER[g.use] || 'This use') + ' come in a later phase', similar: g.similar || 0 };
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

// the brief for one type: what it is, its footprint, its program, where it is
export function designBrief(t, ctx = {}) {
  const res = RESIDENTIAL.includes(t.use), beds = res ? (t.unitGsf < 1500 ? 2 : t.unitGsf < 2200 ? 3 : t.unitGsf < 3200 ? 4 : 5) : 0;
  const lines = ['Building type ' + t.id + ': ' + t.label, 'Footprint: W = ' + t.W + ' ft (along the street) by D = ' + t.D + ' ft (front to back), ' + t.floors + ' floor' + (t.floors > 1 ? 's' : '') + ', floor to floor about ' + t.floorH + ' ft.',
    'Floor area: about ' + Math.round(t.unitGsf).toLocaleString('en-US') + ' gross sf' + (t.attached ? ' per unit (' + t.unitsPer + ' units in a row; party walls on the left and right)' : '') + '.',
    t.fp ? 'Shape: ' + t.shape + '. The building is the outline through these corners (x, y): ' + t.fp.map(q => '(' + q[0] + ', ' + q[1] + ')').join(' ') + '. Open ground, with no rooms, in the notch' + (notchesOf(t).length > 1 ? 'es' : '') + ': ' + notchesOf(t).map(c => 'x ' + c.x + ' to ' + (c.x + c.w) + ', y ' + c.y + ' to ' + (c.y + c.d)).join('; ') + '. Footprint about ' + Math.round(t.footArea).toLocaleString('en-US') + ' sf.' : '',
    res ? 'Program: about ' + beds + ' bedrooms' + (t.garage ? ', a ' + t.garage + '-car garage at the front' : '') + (t.note ? ' (' + t.note + ')' : '') + '.' :
      t.use === 'retail' ? 'Program: a multi-tenant retail shell; about one tenant bay per 25 to 35 ft of frontage, each with its own storefront, restroom and rear service door.' :
      t.use === 'restaurant' ? 'Program: a full-service restaurant: dining, bar or counter, commercial kitchen, walk-in cooler, dry storage, office, two restrooms.' :
      t.use === 'industrial' ? 'Program: a warehouse / distribution building with a front office (about 5 to 10% of the floor), restrooms, and overhead dock doors.' :
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
  return { design, problems: [...new Set(problems)], unreachable: cut.map(r => r.id) };
}

// ---------- rule-based designs (the seed Claude improves, and the fallback when its answers keep failing) ----------
export function fallbackDesign(t) {
  if (t.fp) return fallbackPieces(t);
  const W = t.W, D = t.D, F = t.floors, rooms = [], doors = [], windows = [], room = (id, name, type, floor, x, y, w, d) => { rooms.push({ id, name, type, floor, x: r2(x), y: r2(y), w: r2(w), d: r2(d) }); return id; };
  const door = (a, b, width = 3, kind = 'swing', side = 'any') => doors.push({ a, b, width, kind, side }), win = (r, side, count = 1, width = 3, height = 5) => windows.push({ room: r, side, count, width, height });
  const res = RESIDENTIAL.includes(t.use), lr = !t.attached; // windows on the ends only when not a party wall
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
    return { summary: 'Rule-based ' + (F > 1 ? F + '-story ' : '') + 'plan: ' + (gw ? 'front garage, ' : '') + 'living at the back, bedrooms ' + (F > 1 ? 'upstairs off a hall' : 'beside the living area') + '.', rooms, doors, windows,
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
    return { summary: 'Rule-based restaurant: dining at the front, restrooms and storage on the left, kitchen behind.', rooms, doors, windows, roof: { type: 'flat', pitch: 0, ridge: 'along_front', overhang: 0 },
      exterior: { walls: 'Brick and stucco', accent: 'Metal canopy at the entry', roofing: 'TPO membrane behind parapets', windows: 'Aluminum storefront', doors: 'Aluminum storefront, hollow metal service door' },
      systems: { structure: 'Load-bearing masonry and steel joists', foundation: 'Slab on grade with grade beams', hvac: 'rooftop_units', water_heater: 'tank_gas', sprinklered: t.sprinklered, fire_alarm: t.sprinklered } };
  }
  if (t.use === 'industrial') {
    const ow = r2(clampN(W * 0.25, 30, 60)), od = Math.min(40, D - 20);
    room('office', 'Office', 'office', 1, 0, 0, ow, od - 10); door('office', 'outside', 3, 'storefront', 'front'); win('office', 'front', Math.max(2, Math.floor(ow / 10)), 5, 6);
    room('rr1', 'Restroom', 'restroom', 1, 0, od - 10, ow / 2, 10); room('rr2', 'Restroom', 'restroom', 1, ow / 2, od - 10, ow / 2, 10); door('office', 'rr1', 3); door('office', 'rr2', 3);
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
