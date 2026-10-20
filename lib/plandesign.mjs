// Building designs for plan sets (PLANSET-PLAN.md, phase 3): the plan's buildings grouped into types, a floor plan for
// each type as rectangles (rooms), doors and windows, the checks a design must pass, and a rule-based design for every
// supported use so a set can always be finished. Claude designs each type in the same shape (DESIGN_SCHEMA, through
// api/planset.js mode 'design'); the browser checks the answer here and sends the problems back for a fix, at most twice,
// then falls back to the rule-based design. No DOM, no network: shared by the browser, the server and the tests.
//
// A type's own coordinates, in feet: x runs from the left end (0) to the right end (W) as seen from the street, y from
// the front wall (0) to the back wall (D). Every room is an axis-aligned rectangle { x, y, w, d } on a floor (1 = ground).
import * as S from './siteplan.mjs';
import * as BC from './buildcode.mjs';

const r2 = v => Math.round((+v || 0) * 2) / 2; // to the half foot
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- the plan's building types ----------
// uses the set can design now; the rest get site sheets only and a line in the index. Apartments and hotels are laid
// out by rule (corridorDesign), the others by Claude with a rule-based design to fall back on.
export const SUPPORTED = ['sfr', 'townhomes', 'duplex', 'multifamily', 'hotel', 'retail', 'restaurant', 'office', 'medical', 'church', 'industrial', 'fuel', 'amenity', 'foodtrucks', 'other'];
export const LATER = { storage: 'Self storage buildings' };
export const RESIDENTIAL = ['sfr', 'townhomes', 'duplex'];
export const CORRIDOR = ['multifamily', 'hotel']; // double-loaded corridor buildings of dwelling units or guest rooms
export const claudeDesigns = t => t.supported && !CORRIDOR.includes(t.use);
export const MAX_TYPES = 8;
export { occupancyOf } from './buildcode.mjs';
// the code's own sprinkler trigger for a use (IBC 903.2; IRC R313 for homes), before the allowable area is checked
export function sprinklerRule(use, gsf, floors, occupants) { return BC.sprinklerFor(use, { gsf, floors, occupants }); }
// a usual roof, for the heights the code basis needs before a design exists: homes, apartments and clubhouses pitched,
// the rest flat behind a parapet (the rule-based designs and Claude's brief use the same)
export const roofFor = use => [...RESIDENTIAL, ...CORRIDOR, 'amenity', 'church'].includes(use) ? { type: use === 'church' ? 'gable' : 'hip', pitch: 6, overhang: 1.5 } : { type: 'flat', pitch: 0, overhang: 0 };
// how much of a building's perimeter is open (no other building, and the site or a street beyond) at 20 and 30 ft, for
// the frontage increase (IBC 506.3) -> { share, width }
function openFrontage(plan, e, others) {
  const ring = plan.ring || [], o = S.outline(e), n = o.length, fi = plan.front != null && plan.front < ring.length ? plan.front : S.longestEdge(ring);
  let rules = []; try { rules = S.edgeRules(ring, fi, plan.setbacks, plan.streets); } catch (err) { rules = []; }
  const street = p => ring.some((a, i) => (i === fi || rules[i]?.street) && S.segDist(p, a, ring[(i + 1) % ring.length]) < 90);
  const clear = p => !others.some(b => S.inRing(p, S.outline(b))) && (S.inRing(p, ring) || street(p));
  let len = 0, o20 = 0, o30 = 0;
  for (let i = 0; i < n; i++) { const a = o[i], b = o[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue; const nn = S.outwardOf(o, i), k = Math.max(1, Math.round(L / 10));
    for (let j = 0; j < k; j++) { const t = (j + 0.5) / k, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], seg = L / k; len += seg;
      if (clear([p[0] + nn[0] * 20, p[1] + nn[1] * 20]) && clear([p[0] + nn[0] * 10, p[1] + nn[1] * 10])) { o20 += seg; if (clear([p[0] + nn[0] * 30, p[1] + nn[1] * 30])) o30 += seg; } } }
  return len ? (o30 / len > 0.25 ? { share: o30 / len, width: 30 } : { share: o20 / len, width: 20 }) : { share: 0, width: 0 };
}

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
  const groups = new Map(), prog = S.normalizeProgram(plan.program), progUse = prog.use, all = (plan.elements || []).filter(x => x.kind === 'building');
  for (const e of all) {
    const use = S.USES[e.use] ? e.use : progUse, U = S.USES[use], floors = Math.max(1, Math.round(e.floors || U.floors || 1)), units = Math.max(1, Math.round(e.units || 1));
    const attached = (use === 'townhomes' || use === 'duplex') && units > 1;
    let W, D, bw, bd;
    if (attached) { const long = Math.max(e.w, e.d), short = Math.min(e.w, e.d); W = r2(long / units); D = r2(short); bw = long; bd = short; }
    let fp = null, shape = null, approx = false;
    if (!attached) { const f = frontSide(plan, e), along = f === '-y' || f === '+y', o = CORRIDOR.includes(use) ? null : footprintIn(e, f); W = r2(along ? e.w : e.d); D = r2(along ? e.d : e.w); if (o?.fp) { fp = o.fp; W = o.W; D = o.D; shape = o.shape; } approx = !!o?.approx; bw = W; bd = D; }
    const key = [use, W, D, floors, attached ? units : 1, fp ? JSON.stringify(fp) : ''].join('|');
    let g = groups.get(key);
    if (!g) groups.set(key, g = { key, use, W, D, fp, shape, approx, jog: CORRIDOR.includes(use) && e.jog ? +e.jog : 0, floors, floorH: U.floorH || 10, attached, unitsPer: attached ? units : 1, count: 0, units: 0, names: [], elementIds: [], els: [], garage: U.garage || 0, sf: e.sf || null, note: e.note || '', bw, bd });
    // apartments: the units the plan counts in each building (its own, else from its floor area at the program's unit size)
    const mfUnits = CORRIDOR.includes(use) ? (e.units != null ? Math.round(e.units) : Math.floor(S.gfaOf(e) * (prog.eff || 0.85) / (use === 'hotel' ? 400 : prog.unitSf || U.unitSf || 900))) : 0;
    g.count++; g.units += RESIDENTIAL.includes(use) ? units : mfUnits; if (g.names.length < 8) g.names.push(e.name || ''); g.elementIds.push(e.id); g.els.push(e);
  }
  let list = [...groups.values()].sort((a, b) => b.count - a.count || b.W * b.D - a.W * a.D);
  // buildings within a few feet of each other (same use, stories and shape) are one type, drawn at the most common size
  const close = (a, b) => a.use === b.use && a.floors === b.floors && a.attached === b.attached && !a.fp && !b.fp && Math.abs(a.W - b.W) <= Math.max(4, a.W * 0.04) && Math.abs(a.D - b.D) <= Math.max(4, a.D * 0.04);
  const merged = []; for (const g of list) { const k = merged.find(m => close(m, g)); if (k) { k.similar = (k.similar || 0) + g.count; k.count += g.count; k.units += g.units; k.elementIds.push(...g.elementIds); k.els.push(...g.els); } else merged.push(g); }
  list = merged;
  // more kinds than a set should carry: the rest are drawn as the nearest kept type of the same use (by footprint); a use
  // with no kept type keeps its own (a clubhouse is never drawn as an apartment building)
  const keep = list.slice(0, MAX_TYPES), rest = list.slice(MAX_TYPES);
  for (const g of rest) { const near = keep.filter(k => k.use === g.use).sort((a, b) => Math.abs(a.W * a.D - g.W * g.D) - Math.abs(b.W * b.D - g.W * g.D))[0]; if (!near) { keep.push(g); continue; } near.similar = (near.similar || 0) + g.count; near.count += g.count; near.units += g.units; near.elementIds.push(...g.elementIds); near.els.push(...g.els); }
  list = keep.sort((a, b) => (SUPPORTED.indexOf(a.use) - SUPPORTED.indexOf(b.use)) || b.W * b.D - a.W * a.D);
  return list.map((g, i) => {
    const foot = g.fp ? polyArea(g.fp) : g.W * g.D, unitGsf = foot * g.floors, buildingGsf = (g.fp ? foot : g.bw * g.bd) * g.floors, storyArea = g.fp ? foot : g.bw * g.bd, supported = SUPPORTED.includes(g.use);
    // the code basis, decided once: the sprinkler trigger, then the construction type and system that make the area,
    // stories and height legal with the frontage the most closed-in building of the type has (IBC 506.3)
    const rf = roofFor(g.use), plate = g.floors * (g.floorH || 10), heightFt = 1 + (rf.type === 'flat' ? plate : plate + Math.min(g.W, g.D) / 2 * rf.pitch / 12 / 2); // (IBC: to the mean height of a pitched roof)
    const occupants = BC.estOccupants(g.use, buildingGsf), sp0 = BC.sprinklerFor(g.use, { gsf: buildingGsf, floors: g.floors, occupants, heightFt });
    const fr = RESIDENTIAL.includes(g.use) ? null : g.els.map(e => openFrontage(plan, e, all.filter(x => x !== e))).reduce((m, x) => !m || x.share < m.share ? x : m, null), If = fr ? BC.frontageIf(fr.share, fr.width) : 0;
    const code = BC.codeBasis(g.use, { gsf: buildingGsf, storyArea, floors: g.floors, heightFt, If, sprinkler: sp0 }), sp = code.sprinkler;
    const unitsPer = CORRIDOR.includes(g.use) ? Math.round(g.units / g.count) : g.unitsPer;
    return { id: String.fromCharCode(65 + i), use: g.use, label: (S.USES[g.use]?.label || g.use) + (g.attached ? ' unit' : ''), W: g.W, D: g.D, fp: g.fp, shape: g.shape, approx: g.approx, footArea: Math.round(foot), floors: g.floors, floorH: g.floorH, attached: g.attached, unitsPer,
      count: g.count, units: g.units, unitGsf, buildingGsf, names: g.names, elementIds: g.elementIds, garage: RESIDENTIAL.includes(g.use) ? g.garage : 0, sf: g.sf, note: g.note,
      ...(CORRIDOR.includes(g.use) ? { mix: g.use === 'hotel' ? HOTEL_MIX : S.mixStats(prog.mix).mix, jog: g.jog || 0 } : {}), // (jog: a facade step the site plan draws, designed as the base rectangle)
      occupancy: BC.occupancyOf(g.use), construction: code.construction, sprinklered: sp.on, sprinklerSystem: sp.system, sprinklerWhy: sp.why, sprinklerRef: sp.ref, occupantsEst: occupants,
      code: { storyArea: Math.round(storyArea), heightFt: Math.round(heightFt), frontage: fr ? { share: Math.round(fr.share * 100) / 100, width: fr.width, If: Math.round(If * 100) / 100 } : null, allow: code.allow, ok: code.ok, changed: code.changed, fireWalls: code.fireWalls, cons: code.cons || null, roof: rf },
      supported, why: supported ? '' : (LATER[g.use] || 'This use') + ' come in a later phase', similar: g.similar || 0 };
  });
}
export const typeName = t => 'Type ' + t.id + ' — ' + t.label + (t.fp ? ', ' + t.shape : '') + ' (' + t.W + "' × " + t.D + "'" + (t.fp ? ' overall' : '') + ', ' + t.floors + (t.floors > 1 ? ' stories' : ' story') + ')';

// ---------- the design schema Claude answers in ----------
export const ROOM_TYPES = ['living', 'family', 'dining', 'kitchen', 'bedroom', 'primary_bedroom', 'bath', 'half_bath', 'closet', 'walk_in_closet', 'laundry', 'pantry', 'entry', 'hall', 'stair', 'garage', 'office', 'flex',
  'mechanical', 'electrical', 'storage', 'porch', 'unit', 'elevator', 'trash', 'mail', 'leasing', 'fitness', 'lounge', 'locker', 'tenant', 'sales', 'dining_room', 'commercial_kitchen', 'walk_in_cooler', 'restroom', 'janitor', 'break_room', 'conference', 'reception', 'exam', 'corridor', 'lobby',
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
    R.push({ id, name: String(q.name || type).slice(0, 40), type, floor, x, y, w, d, area: Math.round(w * d), ...(q.unit && raw?.unitPlans?.[q.unit.code] ? { unit: { code: q.unit.code, mirror: !!q.unit.mirror, exterior: q.unit.exterior, along: q.unit.along, no: String(q.unit.no || '') } } : {}) });
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
    ...(raw?.unitPlans ? { unitPlans: raw.unitPlans, corridor: raw.corridor } : {}),
    // the structure and the sprinklers are the type's decisions (structureOf, the code basis), whatever an answer says
    systems: { structure: '', foundation: '',
      hvac: HVAC.includes(sy.hvac) ? sy.hvac : RESIDENTIAL.includes(t.use) ? 'split_system' : 'rooftop_units', water_heater: WATER_HEATERS.includes(sy.water_heater) ? sy.water_heater : RESIDENTIAL.includes(t.use) ? 'tankless_gas' : 'tank_electric',
      sprinklered: !!t.sprinklered, fire_alarm: !!t.sprinklered || CORRIDOR.includes(t.use) || (typeof sy.fire_alarm === 'boolean' && sy.fire_alarm) } };
  { const stc = structureOf(t, design); design.systems.structure = [stc.walls.text, stc.floor?.text, stc.roof.text].filter(Boolean).join('; '); design.systems.foundation = stc.foundation.text; }
  return { design, problems: [...new Set(problems)], unreachable: cut.map(r => r.id) };
}

// ---------- rule-based designs (the seed Claude improves, and the fallback when its answers keep failing) ----------
// ---------- apartment and hotel buildings: a double-loaded corridor (rule-based) ----------
// The corridor runs the long way down the middle; an exit stair closes each end of one band (two exits, no dead ends,
// travel to a stair at most half the building); a core at the middle has the lobby on the ground floor and the
// elevator (3 stories and up), trash and electrical rooms above. Units fill both bands, from the program's unit mix,
// stacked floor to floor; each unit type has its own plan (unitPlan) the enlarged plans and the MEP sheets read.
export const HOTEL_MIX = [{ name: 'King', sf: 360, pct: 60, beds: 1 }, { name: 'Double Queen', sf: 420, pct: 40, beds: 1 }];
const UNIT_MIN_W = { 0: 14, 1: 22, 2: 32, 3: 44 }, CORR_W = 6, STAIR_W = 12;
const unitKey = (use, m) => use === 'hotel' ? (/double/i.test(m.name) ? 'Q' : 'K') : /studio/i.test(m.name) ? 'S' : ({ 1: 'A', 2: 'B', 3: 'C' }[m.beds] || 'D');
const bedsOf = (use, m) => use === 'hotel' ? 0 : /studio/i.test(m.name) ? 0 : Math.max(1, Math.round(m.beds || 1));
// a unit's own plan, in its own feet: x across its width (0..w), y from the corridor wall (0) to the outside wall (d)
// -> { code, name, beds, w, d, sf, rooms: [{ id, name, type, x, y, w, d }], doors: [{ a, b, kind, width, x1, y1, x2, y2 }],
//      windows: [{ room, width, height, x1, x2 }], baths, kitchen }
export function unitPlan(code, name, beds, w, d, hotel = false) {
  const ze = clampN(Math.round(d * 0.52), 12, 17), zi = r2(d - ze), rooms = [], doors = [], windows = [];
  const R = (id, nm, type, x, y, ww, dd) => rooms.push({ id, name: nm, type, x: r2(x), y: r2(y), w: r2(ww), d: r2(dd), area: Math.round(ww * dd) });
  const bw = clampN(r2(w * 0.3), 11, 13), bath = Math.min(9, zi - 4);
  if (hotel) { const bx = Math.min(8.5, w - 5); R('bath', 'Bath', 'bath', 0, 0, bx, bath); R('closet', 'Closet', 'closet', 0, bath, bx, zi - bath); R('entry', 'Entry', 'entry', bx, 0, w - bx, zi); R('room', 'Guest room', 'bedroom', 0, zi, w, ze);
    doors.push(['entry', 'corridor'], ['bath', 'entry'], ['closet', 'entry'], ['entry', 'room', 'opening']); windows.push(['room', Math.min(6, w - 4)]); }
  else if (beds === 0) { const bx = Math.min(9, w - 9); R('kitchen', 'Kitchen / entry', 'kitchen', 0, 0, w - bx, zi); R('bath', 'Bath', 'bath', w - bx, 0, bx, bath); R('closet', 'Closet, W/D', 'laundry', w - bx, bath, bx, zi - bath); R('living', 'Living / sleeping', 'living', 0, zi, w, ze);
    doors.push(['kitchen', 'corridor'], ['bath', 'kitchen'], ['closet', 'living'], ['kitchen', 'living', 'opening']); windows.push(['living', Math.min(8, w - 4)]); }
  else if (beds === 1) { R('kitchen', 'Kitchen / dining', 'kitchen', 0, 0, w - bw, zi); R('laundry', 'W/D, coats', 'laundry', w - bw, 0, bw, zi - bath); R('bath', 'Bath', 'bath', w - bw, zi - bath, bw, bath); R('living', 'Living', 'living', 0, zi, w - bw, ze); R('bed1', 'Bedroom', 'bedroom', w - bw, zi, bw, ze);
    doors.push(['kitchen', 'corridor'], ['laundry', 'kitchen'], ['bath', 'bed1'], ['kitchen', 'living', 'opening'], ['bed1', 'living']); windows.push(['living', 6], ['bed1', 4]); }
  else if (beds === 2) { const lw = w - 2 * bw; R('laundry', 'W/D, coats', 'laundry', 0, 0, bw, zi - bath); R('bath1', 'Bath 1', 'bath', 0, zi - bath, bw, bath); R('kitchen', 'Kitchen / dining', 'kitchen', bw, 0, lw, zi); R('linen', 'Linen', 'closet', bw + lw, 0, bw, zi - bath); R('bath2', 'Bath 2', 'bath', bw + lw, zi - bath, bw, bath);
    R('bed1', 'Bedroom 1', 'primary_bedroom', 0, zi, bw, ze); R('living', 'Living', 'living', bw, zi, lw, ze); R('bed2', 'Bedroom 2', 'bedroom', bw + lw, zi, bw, ze);
    doors.push(['kitchen', 'corridor'], ['laundry', 'kitchen'], ['linen', 'kitchen'], ['bath1', 'bed1'], ['bath2', 'bed2'], ['kitchen', 'living', 'opening'], ['bed1', 'living'], ['bed2', 'living']); windows.push(['living', 6], ['bed1', 4], ['bed2', 4]); }
  else { const n = Math.min(beds, 3), lw = w - n * bw, hall = 4; R('laundry', 'W/D, coats', 'laundry', 0, 0, bw, zi - bath); R('bath1', 'Bath 1', 'bath', 0, zi - bath, bw, bath); R('kitchen', 'Kitchen / dining', 'kitchen', bw, 0, lw, zi);
    R('bath2', 'Bath 2', 'bath', bw + lw, 0, bw, zi - hall); R('linen', 'Linen', 'closet', bw + lw + bw, 0, w - bw - lw - bw, zi - hall); R('hall', 'Hall', 'hall', bw + lw, zi - hall, w - bw - lw, hall);
    R('bed1', 'Bedroom 1', 'primary_bedroom', 0, zi, bw, ze); R('living', 'Living', 'living', bw, zi, lw, ze); for (let i = 2; i <= n; i++) R('bed' + i, 'Bedroom ' + i, 'bedroom', bw + lw + (i - 2) * bw, zi, i === n ? w - (bw + lw + (i - 2) * bw) : bw, ze);
    doors.push(['kitchen', 'corridor'], ['laundry', 'kitchen'], ['bath1', 'bed1'], ['kitchen', 'living', 'opening'], ['bed1', 'living'], ['hall', 'kitchen', 'opening'], ['bath2', 'hall'], ['linen', 'hall']); for (let i = 2; i <= n; i++) doors.push(['bed' + i, 'hall']);
    windows.push(['living', 6]); for (let i = 1; i <= n; i++) windows.push(['bed' + i, 4]); }
  // doors centred on the wall two rooms share (the unit's front door on the corridor wall, y = 0)
  const byId = id => rooms.find(r => r.id === id);
  const placed = doors.map(([a, b, kind = 'swing']) => { const A = byId(a), width = kind === 'opening' ? 4 : 3;
    if (b === 'corridor') { const x = A.x + Math.min(A.w - width - 0.5, 1.5); return { a, b, kind: 'swing', width, x1: x, y1: 0, x2: x + width, y2: 0 }; }
    const B = byId(b), ov = (p0, p1, q0, q1) => [Math.max(p0, q0), Math.min(p1, q1)];
    if (Math.abs(A.y + A.d - B.y) < 0.01 || Math.abs(B.y + B.d - A.y) < 0.01) { const y = Math.abs(A.y + A.d - B.y) < 0.01 ? B.y : A.y, [p, q] = ov(A.x, A.x + A.w, B.x, B.x + B.w), wd = kind === 'opening' ? Math.min(q - p - 1, 8) : Math.min(width, q - p - 1), m = (p + q) / 2; return { a, b, kind, width: r2(wd), x1: r2(m - wd / 2), y1: y, x2: r2(m + wd / 2), y2: y }; }
    const x = Math.abs(A.x + A.w - B.x) < 0.01 ? B.x : A.x, [p, q] = ov(A.y, A.y + A.d, B.y, B.y + B.d), wd = Math.min(width, q - p - 1), m = (p + q) / 2; return { a, b, kind, width: r2(wd), x1: x, y1: r2(m - wd / 2), x2: x, y2: r2(m + wd / 2) }; });
  const wins = windows.map(([room, width]) => { const A = byId(room), wd = Math.min(width, A.w - 2), m = A.x + A.w / 2; return { room, width: wd, height: 5, sill: room.startsWith('bed') || room === 'room' ? 2 : 3, x1: r2(m - wd / 2), x2: r2(m + wd / 2) }; });
  return { code, name, beds, w: r2(w), d: r2(d), sf: Math.round(w * d), rooms, doors: placed, windows: wins, baths: rooms.filter(r => r.type === 'bath').length, kitchen: rooms.some(r => r.type === 'kitchen') };
}
// a unit's plan placed in the building (type feet): its rooms, doors and windows turned and mirrored to where it sits
export function unitLayout(design, room) {
  const u = room.unit, P = u && design.unitPlans?.[u.code]; if (!P) return null;
  const ax = u.along === 'x', sgn = u.exterior === 'front' || u.exterior === 'left' ? -1 : 1, d0 = ax ? (sgn < 0 ? room.y + room.d : room.y) : (sgn < 0 ? room.x + room.w : room.x), w0 = ax ? room.x : room.y, W = P.w;
  const pt = (lx, ly) => { const a = w0 + (u.mirror ? W - lx : lx), b = d0 + sgn * ly; return ax ? [a, b] : [b, a]; };
  const rect = q => { const [x1, y1] = pt(q.x, q.y), [x2, y2] = pt(q.x + q.w, q.y + q.d); return { ...q, id: room.id + ':' + q.id, x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), d: Math.abs(y2 - y1), floor: room.floor, unit: room.id }; };
  const seg = q => { const [x1, y1] = pt(q.x1, q.y1 ?? 0), [x2, y2] = pt(q.x2, q.y2 ?? 0); return { x1, y1, x2, y2 }; };
  return { plan: P, rooms: P.rooms.map(rect), doors: P.doors.map(q => ({ ...q, a: room.id + ':' + q.a, b: q.b === 'corridor' ? 'corridor' : room.id + ':' + q.b, ...seg(q), floor: room.floor })),
    windows: P.windows.map(q => ({ ...q, room: room.id + ':' + q.room, ...seg({ x1: q.x1, x2: q.x2, y1: P.d, y2: P.d }), floor: room.floor, side: u.exterior })) };
}
export function corridorDesign(t) {
  const hotel = t.use === 'hotel', ax = t.W >= t.D, L = ax ? t.W : t.D, Dp = ax ? t.D : t.W, F = t.floors, elev = F >= 3, mixIn = (t.mix?.length ? t.mix : hotel ? HOTEL_MIX : S.UNIT_MIX).filter(m => +m.pct > 0);
  const c0 = r2((Dp - CORR_W) / 2), c1 = c0 + CORR_W, dB = Dp - c1, side = { A: ax ? 'front' : 'left', B: ax ? 'back' : 'right', E0: ax ? 'left' : 'front', E1: ax ? 'right' : 'back' };
  const rooms = [], doors = [], windows = [], unitPlans = {};
  // local (u along the corridor, v across) to the type's feet
  const room = (id, name, type, floor, u, v, lu, lv, extra) => { rooms.push({ id, name, type, floor, ...(ax ? { x: r2(u), y: r2(v), w: r2(lu), d: r2(lv) } : { x: r2(v), y: r2(u), w: r2(lv), d: r2(lu) }), ...(extra || {}) }); return id; };
  const door = (a, b, width = 3, kind = 'swing', sd = 'any') => doors.push({ a, b, width, kind, side: sd });
  // the bands' spans: band A has the stairs at its ends and the core at its middle; band B runs the full length
  const coreW = elev ? 26 : 14, uc = r2(L / 2), cA = uc - coreW / 2, cB = uc + coreW / 2;
  const spans = [{ band: 'A', from: STAIR_W, to: cA, depth: c0 }, { band: 'A', from: cB, to: L - STAIR_W, depth: c0 }, { band: 'B', from: 0, to: L, depth: dB }].filter(sp => sp.to - sp.from >= UNIT_MIN_W[1]);
  // how many units a floor gets: the plan's count shared over the floors, kept to unit widths that make sense
  const want = Math.max(1, Math.round((t.unitsPer || 1) / F)), avgW = mixIn.reduce((s, m) => s + Math.max(UNIT_MIN_W[bedsOf(t.use, m)] ?? 20, m.sf / ((c0 + dB) / 2)) * m.pct, 0) / mixIn.reduce((s, m) => s + +m.pct, 0);
  const total = spans.reduce((s, sp) => s + sp.to - sp.from, 0), perFloor = clampN(want, Math.ceil(total / (avgW * 1.3)), Math.floor(total / (avgW * 0.8)));
  const split = S.splitMix(perFloor, mixIn).flatMap(m => Array(m.n).fill(m)).sort((a, b) => (b.beds || 0) - (a.beds || 0) || b.sf - a.sf); // (largest remainder; big units placed first)
  const nomOf = (m, depth) => Math.max(UNIT_MIN_W[bedsOf(t.use, m)] ?? 20, m.sf / depth);
  // each unit to the span with the most room left, so every span stretches its units about the same
  const fill = spans.map(sp => ({ sp, take: [], nom: 0 }));
  for (const m of split) { const f = fill.reduce((b, x) => (x.sp.to - x.sp.from - x.nom - nomOf(m, x.sp.depth)) > (b.sp.to - b.sp.from - b.nom - nomOf(m, b.sp.depth)) ? x : b); f.take.push(m); f.nom += nomOf(m, f.sp.depth); }
  const plans = new Map();
  const laid = fill.filter(f => f.take.length).map(({ sp, take, nom }) => { // the biggest units at the span's two ends (the corners), widths stretched to fill it exactly
    const order = []; take.forEach((m, i) => i % 2 ? order.push(m) : order.unshift(m)); const units = [], k0 = (sp.to - sp.from) / nom; let u = sp.from;
    order.forEach((m, i) => { const w = i === order.length - 1 ? sp.to - u : Math.round(nomOf(m, sp.depth) * k0); units.push({ m, u, w }); u += w; }); return { sp, units }; }); // (widths to the foot, the span's last unit taking up the rest)
  // a unit type per mix type and width (rounded to the foot), each with its plan
  for (const { sp, units } of laid) for (const q of units) { const beds = bedsOf(t.use, q.m), key = unitKey(t.use, q.m) + '|' + r2(q.w) + '|' + sp.depth; q.beds = beds;
    if (!plans.has(key)) { const letter = unitKey(t.use, q.m), nth = [...plans.values()].filter(c => c[0] === letter).length + 1, code = letter + nth; plans.set(key, code); unitPlans[code] = unitPlan(code, q.m.name, beds, r2(q.w), sp.depth, hotel); }
    q.code = plans.get(key); }
  let no = 0;
  for (let f = 1; f <= F; f++) {
    const cor = room('corr' + f, 'Corridor', 'corridor', f, 0, c0, L, CORR_W);
    for (const [k, u0] of [[1, 0], [2, L - STAIR_W]]) { const st = room('st' + k + '_' + f, 'Exit stair ' + k, 'stair', f, u0, 0, STAIR_W, c0); door(st, cor); if (f === 1) door(st, 'outside', 3, 'swing', k === 1 ? side.E0 : side.E1); }
    if (f === 1) { door(cor, 'outside', 3, 'swing', side.E0); door(cor, 'outside', 3, 'swing', side.E1); }
    if (elev) { const ev = room('elev' + f, 'Elevator', 'elevator', f, cB - 8, c0 - 9, 8, 9); door(ev, cor, 3.5, 'sliding');
      if (f === 1) { const lb = room('lobby', hotel ? 'Lobby / front desk' : 'Lobby / mail', 'lobby', 1, cA, 0, coreW - 8, c0); door(lb, cor, 6, 'opening'); door(lb, 'outside', 6, 'double', side.A); const ml = room('mail', hotel ? 'Back office' : 'Package room', hotel ? 'office' : 'mail', 1, cB - 8, 0, 8, c0 - 9); door(ml, lb); }
      else { const el = room('elec' + f, 'Electrical / telecom', 'electrical', f, cA, 0, 10, c0), tr = room('trash' + f, 'Trash chute / storage', 'trash', f, cA + 10, 0, coreW - 18, c0), ctl = room('ctl' + f, 'Elevator controller', 'mechanical', f, cB - 8, 0, 8, c0 - 9); door(el, cor); door(tr, cor); door(ctl, tr); } }
    else if (f === 1) { const lb = room('lobby', 'Breezeway / mail', 'lobby', 1, cA, 0, coreW, c0); door(lb, cor, 6, 'opening'); door(lb, 'outside', 6, 'double', side.A); }
    else { const el = room('elec' + f, 'Electrical / storage', 'electrical', f, cA, 0, coreW, c0); door(el, cor); }
    let k = 0;
    for (const { sp, units } of laid) for (let i = 0; i < units.length; i++) { const q = units[i], v = sp.band === 'A' ? 0 : c1, id = 'u' + f + '_' + (++k), num = f * 100 + k; no++;
      room(id, (hotel ? 'Room ' : 'Unit ') + num + ' (' + q.code + ')', 'unit', f, q.u, v, q.w, sp.depth, { unit: { code: q.code, mirror: i % 2 === 1, exterior: sp.band === 'A' ? side.A : side.B, along: ax ? 'x' : 'y', no: String(num) } });
      door(id, cor); windows.push({ room: id, side: sp.band === 'A' ? side.A : side.B, count: Math.max(1, Math.round(q.w / 13)), width: q.beds >= 1 ? 4 : 6, height: 5 }); }
  }
  const perFl = laid.reduce((s, x) => s + x.units.length, 0), mixOut = Object.values(unitPlans).map(p => ({ code: p.code, name: p.name, beds: p.beds, sf: p.sf, per: laid.reduce((s, x) => s + x.units.filter(q => q.code === p.code).length, 0) * F }));
  return { summary: (hotel ? 'Hotel' : 'Apartment') + ' building: a ' + CORR_W + ' ft double-loaded corridor, an exit stair at each end, ' + (elev ? 'an elevator, ' : '') + perFl + (hotel ? ' rooms' : ' units') + ' a floor, ' + perFl * F + ' in all.',
    rooms, doors, windows, roof: roofFor(t.use), unitPlans, corridor: { along: ax ? 'x' : 'y', c0, c1, stairs: 2, elevator: elev, perFloor: perFl, units: perFl * F, planned: t.unitsPer || null, mix: mixOut },
    exterior: { walls: 'Brick veneer at the ground floor, fiber cement lap siding above', roofing: 'Architectural asphalt shingles', windows: 'Vinyl, low-E', doors: 'Insulated fiberglass at the units, aluminum storefront at the lobby' },
    systems: { hvac: 'split_system', water_heater: hotel ? 'tank_gas' : 'tank_electric' }, source: 'rule-based' };
}

export function fallbackDesign(t) {
  if (CORRIDOR.includes(t.use)) return corridorDesign(t);
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
  const label = { retail: 'Tenant', office: 'Suite', medical: 'Suite', church: 'Sanctuary', fuel: 'Sales', amenity: 'Clubhouse lounge', foodtrucks: 'Pavilion hall', other: 'Suite' }[t.use] || 'Space';
  const ty = { retail: 'tenant', church: 'sanctuary', fuel: 'sales', amenity: 'lounge', foodtrucks: 'lounge' }[t.use] || 'tenant';
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
  // a clubhouse: the lounge, and a fitness room taking the right third of it (its own door out)
  if (t.use === 'amenity' && n === 1 && W >= 40) { const sp = rooms.find(r => r.id === 'sp0'), fw = r2(Math.min(40, W / 3)); sp.w = r2(W - fw); room('fit', 'Fitness', 'fitness', 1, W - fw, 0, fw, sp.d); door('sp0', 'fit', 3); door('fit', 'outside', 3, 'swing', 'right'); win('fit', 'front', Math.max(1, Math.floor(fw / 10)), 5, 6);
    for (const d of doors) if (d.a === 'sp0' && d.b === 'outside' && d.side === 'right') d.side = 'front'; }
  for (let f = 2; f <= F; f++) {
    const st = rooms.find(r => r.id === 'st1'), fl = 'fl' + f; if (!st) break;
    room('st' + f, 'Stair', 'stair', f, st.x, st.y, st.w, st.d); room(fl, label + 's, floor ' + f, ty, f, 0, 0, W, D - rs); door(fl, 'st' + f, 3); win(fl, 'front', Math.max(1, Math.floor(W / 12)), 5, 6); win(fl, 'left', Math.max(1, Math.floor((D - rs) / 15)), 5, 6); win(fl, 'right', Math.max(1, Math.floor((D - rs) / 15)), 5, 6);
    room('rr' + f + 'u', 'Restroom', 'restroom', f, 0, D - rs, st.x, rs); door(fl, 'rr' + f + 'u', 3);
    if (W - st.x - st.w >= 3) { room('mech' + f, 'Storage / mechanical', 'mechanical', f, st.x + st.w, D - rs, W - st.x - st.w, rs); door(fl, 'mech' + f, 3); }
  }
  return { summary: 'Rule-based shell: ' + n + ' ' + label.toLowerCase() + (n > 1 ? 's' : '') + ' across the front, each with a restroom and back of house' + (F > 1 ? '; upper floors open with the stair' : '') + '.', rooms, doors, windows,
    roof: { ...roofFor(t.use), ridge: 'along_front' }, exterior: { walls: t.use === 'fuel' ? 'Brick veneer and metal panel' : 'Brick, stone and EIFS', accent: 'Metal canopies over the storefronts', roofing: 'TPO membrane behind parapets', windows: 'Aluminum storefront', doors: 'Aluminum storefront, hollow metal service doors' },
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
// ---------- occupant load (IBC Table 1004.5, lib/buildcode.mjs) ----------
// net factors apply to the room; gross factors to the room plus its share of the floor's corridors, restrooms, stairs
// and walls (the floor's area spread over the rooms that hold people)
export const LOAD_FACTOR = Object.fromEntries(Object.entries(BC.LOAD).map(([k, v]) => [k, v[0]]));
export function occupantLoad(design, occ) {
  if (RESIDENTIAL.includes(design.use)) return { total: 0, rows: [] };
  const o = occ || BC.occupancyOf(design.use), rows = [];
  for (let f = 1; f <= (design.floors || 1); f++) {
    const fr = design.rooms.filter(r => r.floor === f), floorA = design.footArea || fr.reduce((s, r) => s + r.area, 0), lf = r => BC.loadOf(r.type, o);
    const held = fr.filter(r => lf(r)[0] > 0), netA = held.filter(r => lf(r)[1] === 'net').reduce((s, r) => s + r.area, 0), grossRooms = held.filter(r => lf(r)[1] === 'gross'), grA = grossRooms.reduce((s, r) => s + r.area, 0);
    const up = grA ? Math.max(1, (floorA - netA) / grA) : 1;
    for (const r of fr) { const [factor, basis, label] = lf(r), a = basis === 'gross' ? r.area * up : r.area; rows.push({ room: r, factor, basis, label, area: Math.round(a), load: factor ? Math.ceil(a / factor) : 0 }); }
  }
  return { total: rows.reduce((s, x) => s + x.load, 0), rows };
}
// ---------- one answer per type for every sheet: heights, structure, scope ----------
// the heights and roof every elevation, section, code sheet and the fire access sheet use. Above the first floor slab:
// plate (top of the top floor's walls), ridge, parapet, top; and above grade (the slab sits a foot over it):
// buildingHeight (IBC 202: to the roof deck of a flat roof, to the mean of a pitched one) and fireAccessHeight (IFC
// D105.1: to the eave of a pitched roof, the top of the parapet of a flat one)
export const SLAB_ABOVE_GRADE = 1;
export function heightsOf(t, d) {
  const F = Math.max(1, Math.round(+d.floors) || 1), fh = +d.floorH || +t?.floorH || 10, rf = d.roof || roofFor(d.use || t?.use), flat = rf.type === 'flat' || (!rf.type && !RESIDENTIAL.includes(d.use));
  const type = flat ? 'flat' : ['gable', 'hip', 'shed'].includes(rf.type) ? rf.type : 'gable', p = flat ? 0 : clampN(+rf.pitch || 6, 1, 14), oh = flat ? 0 : clampN(+rf.overhang || 0, 0, 4);
  const n = d.attached && +t?.unitsPer > 1 ? Math.round(t.unitsPer) : 1, RW = d.W * n; // attached units: the whole row
  const ridgeAx = type === 'hip' ? (RW >= d.D ? 'x' : 'y') : rf.ridge === 'front_to_back' ? 'y' : 'x';
  const run = type === 'hip' ? Math.min(RW, d.D) / 2 : ridgeAx === 'x' ? d.D / 2 : d.W / 2, plate = F * fh;
  const ridge = type === 'flat' ? plate : type === 'shed' ? plate + d.D * p / 12 : plate + run * p / 12, parapet = type === 'flat' ? plate + 3 : 0, top = type === 'flat' ? parapet : ridge, g = SLAB_ABOVE_GRADE;
  return { F, fh, type, p, oh, n, RW, ridgeAx, run, plate, ridge, parapet, top, grade: g,
    buildingHeight: g + (type === 'flat' ? plate : (plate + ridge) / 2), fireAccessHeight: g + (type === 'flat' ? parapet : plate), fireAccessTo: type === 'flat' ? 'the top of the parapet' : 'the eave' };
}
// the structural system of a type, chosen once and named the same on the architectural sections, the structural
// sheets and the notes (Oct 20 review: a clubhouse drawn with wood trusses was framed on steel joists on S-201, and a
// foundation described as drilled piers was scheduled as spread footings)
export function structureOf(t, d) {
  const h = heightsOf(t, d), res = RESIDENTIAL.includes(t.use), cor = CORRIDOR.includes(t.use), ind = t.use === 'industrial', cons = t.code?.cons || '', nc = /^II|^III/.test(cons);
  const span = Math.min(d.W, d.D), pitched = h.type !== 'flat', col = !res && !cor && (pitched ? span > 60 : span > 50 || d.W * d.D > 9000);
  const foundation = res || cor ? { kind: 'pt-slab', text: 'Post-tensioned slab on grade with perimeter and interior grade beams, designed for the expansive clay the geotechnical report finds' }
    : { kind: 'slab-gb', text: 'Reinforced slab on grade with perimeter grade beams' + (col ? ' and spread footings at the steel columns' : '') + '; the geotechnical report may call for drilled piers instead, in which case they replace the footings everywhere' };
  const walls = ind ? { kind: 'tilt-up', text: 'Load-bearing concrete tilt-up wall panels' } : nc ? { kind: 'cmu', text: 'Reinforced concrete masonry (CMU) exterior walls' + (col ? ' with steel columns at the interior grid' : '') }
    : { kind: 'wood-stud', text: (res || cor ? '2x wood stud bearing walls' + (cor ? ', 2x6 at the exterior and the unit separation walls (1-hour)' : '') : '2x6 wood stud exterior walls') + ' with wood structural panel sheathing as the shear walls' };
  const roof = pitched ? { kind: 'wood-trusses', text: 'Pre-engineered wood roof trusses at 24" o.c.' + (col ? ' bearing on a steel beam line on steel columns' : ' bearing on the exterior walls') + ', 7/16" OSB roof sheathing' }
    : { kind: 'steel-joists', text: 'Steel roof deck on open-web steel joists' + (col ? ' on joist girders and steel columns' : ' bearing on the walls') };
  const floor = h.F > 1 ? (res || cor ? { kind: 'wood-floor-trusses', text: 'Open-web wood floor trusses at 24" o.c.' + (cor ? ', 1-1/2" gypsum concrete topping over 3/4" subfloor (1-hour floor/ceiling, STC/IIC 50)' : ', 3/4" subfloor') }
    : { kind: 'steel-floor', text: 'Concrete on composite steel deck on steel beams' }) : null;
  return { foundation, walls, roof, floor, columns: col ? { kind: 'steel', text: 'Steel columns at the interior grid' } : null, summary: [foundation.text.split(';')[0], walls.text, floor?.text, roof.text].filter(Boolean).join('; ') };
}
// what the drawings of a type cover: a speculative multi-tenant building is a shell (the landlord's work, with the
// suites shown for reference); everything else is built complete
const SHELL = ['retail', 'office', 'medical'];
export function scopeOf(t) {
  if (SHELL.includes(t.use)) return { kind: 'shell', text: 'Warm shell: the building, demising walls between suites, one accessible restroom and a back room per suite, a rooftop unit and an electrical service per suite are landlord work. Sales floors, offices and finishes inside the suites are by each tenant: the rooms drawn in the suites show a typical layout for pricing, not landlord scope.' };
  if (CORRIDOR.includes(t.use)) return { kind: 'complete', text: 'Complete: the building and every unit, with finishes, appliances and fixtures.' };
  return { kind: 'complete', text: 'Complete: the building, its rooms, finishes, fixtures and equipment as drawn.' };
}
// everything a sheet needs to say about a type, decided once (lib/planset.mjs setContext keeps it as ctx.tf[typeId]):
// the code basis, heights, structure, scope and occupant load, and the problems the design leaves open
export function typeFacts(t, d) {
  const h = heightsOf(t, d), st = structureOf(t, d), sc = scopeOf(t), ol = RESIDENTIAL.includes(t.use) ? null : occupantLoad(d, t.occupancy), issues = [];
  if (t.code && !t.code.ok) issues.push('Type ' + t.id + ' is over the allowable area for every construction type: fire walls (IBC 706) dividing it into ' + t.code.fireWalls + ' areas are needed.');
  if (t.code?.allow && h.buildingHeight > t.code.allow.heightFt + 0.5) issues.push('Type ' + t.id + ' is ' + Math.round(h.buildingHeight) + ' ft tall by the drawn roof, over the ' + t.code.allow.heightFt + ' ft allowed for ' + t.code.cons + ' (IBC 504.3).');
  if (ol && !t.sprinklered && /^A/.test(t.occupancy) && ol.total >= (t.occupancy === 'A-2' ? 100 : 300)) issues.push('Type ' + t.id + ' holds ' + ol.total + ' occupants as drawn, enough to need sprinklers (IBC 903.2.1); the set shows it unsprinklered.');
  return { height: h, structure: st, scope: sc, occupants: ol ? ol.total : null, sprinkler: { on: !!t.sprinklered, system: t.sprinklerSystem || (t.sprinklered ? 'NFPA 13' : 'none'), why: t.sprinklerWhy || '', ref: t.sprinklerRef || '' }, construction: t.construction, issues };
}
export const roomsOn = (design, f) => design.rooms.filter(r => r.floor === f);
export const isWet = r => ['bath', 'half_bath', 'restroom', 'kitchen', 'commercial_kitchen', 'laundry', 'janitor'].includes(r.type);
// ---------- fire apparatus access roads the site needs (IFC Appendix D, as adopted) ----------
// FP-101 and the open issues read this one answer. -> { have, need, ok, reasons: [{ need, text, ref }] }
export function accessNeed(plan, types = buildingTypes(plan), tf = {}) {
  const have = S.entrancesOf(plan.elements || []).length, reasons = [], f = v => Math.round(v).toLocaleString('en-US');
  const mf = types.filter(t => t.use === 'multifamily'), mfU = mf.reduce((s, t) => s + (t.units || 0), 0), homes = types.filter(t => RESIDENTIAL.includes(t.use)), homeU = homes.reduce((s, t) => s + (t.units || 0), 0);
  if (mfU > 200) reasons.push({ need: 2, text: f(mfU) + ' apartments: more than 200 dwelling units need two separate fire apparatus access roads, sprinklered or not', ref: 'IFC D106.2' });
  else if (mfU > 100 && !mf.every(t => t.sprinklered)) reasons.push({ need: 2, text: f(mfU) + ' apartments, not all sprinklered: more than 100 units need two access roads', ref: 'IFC D106.1' });
  if (homeU > 30 && !homes.every(t => t.sprinklered)) reasons.push({ need: 2, text: f(homeU) + ' one- and two-family homes: more than 30 need two access roads unless every home is sprinklered', ref: 'IFC D107.1' });
  for (const t of types) { const h = tf[t.id]?.height?.buildingHeight ?? t.code?.heightFt ?? 0;
    if (t.floors > 3 || h > 30) reasons.push({ need: 2, text: 'Type ' + t.id + ' is ' + (t.floors > 3 ? t.floors + ' stories' : Math.round(h) + ' ft tall') + ': over three stories or 30 ft needs two means of fire apparatus access', ref: 'IFC D104.1' });
    const big = t.sprinklered ? 124000 : 62000; if (t.buildingGsf > big) reasons.push({ need: 2, text: 'Type ' + t.id + ' is ' + f(t.buildingGsf) + ' sf, over ' + f(big) + ' sf' + (t.sprinklered ? ' sprinklered' : '') + ': two access roads', ref: 'IFC D104.2' }); }
  const need = Math.max(1, ...reasons.map(r => r.need));
  return { have, need, ok: have >= need, reasons };
}
