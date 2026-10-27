// A BIM model of a site plan option, built by BIMCraft (github.com/IPedrax/BIMCraft, an open-source modeler driven by
// JSON commands; see BIM-PLAN.md). bimScript(plan) writes the script, one `command {json}` a line, that
// `bimcraft-cli run --script` turns into a model: for every building its storeys as levels, exterior walls of an
// assembly for its use, storefront, window bands, entry, garage and dock doors, a slab a storey, and a flat roof behind
// a parapet or a hipped one for homes; townhome rows get their party walls. takeoff() reads the model's schedules back
// into quantities per building (wall, glass and roof area, slabs, doors), which the budget can price.
// Pure: no binary, no DOM; lib/bimrun.mjs runs the CLI. Plans are in feet, BIMCraft in millimetres.
import * as S from './siteplan.mjs';

export const MM = 304.8; // mm a foot
export const SF_M2 = 10.7639; // sf a square metre
const mm = ft => Math.round(ft * MM);

// assemblies: BIMCraft types (layers from the exterior in, mm), each named for what it is so a schedule prices it
export const WALLS = {
  tilt: { name: 'Tilt-up concrete 7.25in', layers: [['structure', 'Concrete', 184]] },
  brick: { name: 'CMU with brick veneer', layers: [['finish', 'Brick', 92], ['thermal', 'Insulation', 50], ['structure', 'Concrete block', 203]] },
  eifs: { name: 'Steel stud with EIFS', layers: [['finish', 'Plaster', 25], ['thermal', 'Insulation', 50], ['structure', 'Metal', 152], ['finish', 'Gypsum board', 16]] },
  wood: { name: 'Wood frame with brick and siding', layers: [['finish', 'Brick', 92], ['substrate', 'Timber', 12], ['structure', 'Timber', 140], ['finish', 'Gypsum board', 16]] },
  metal: { name: 'Metal panel on girts', layers: [['finish', 'Metal', 25], ['thermal', 'Insulation', 75], ['structure', 'Metal', 152]] },
  party: { name: 'Party wall 2-hour', layers: [['finish', 'Gypsum board', 32], ['structure', 'Timber', 89], ['thermal', 'Insulation', 25], ['structure', 'Timber', 89], ['finish', 'Gypsum board', 32]] }
};
export const FLOORS = {
  grade: { name: 'Slab on grade 5in', layers: [['structure', 'Concrete', 127]] },
  wood: { name: 'Wood floor framing', layers: [['finish', 'Timber', 19], ['structure', 'Timber', 286]] },
  deck: { name: 'Concrete on metal deck', layers: [['structure', 'Concrete', 140], ['structure', 'Metal', 50]] }
};
export const ROOFS = {
  tpo: { name: 'TPO on insulation and metal deck', layers: [['membrane', 'Membrane', 2], ['thermal', 'Insulation', 100], ['structure', 'Metal', 38]] },
  shingle: { name: 'Asphalt shingles on wood framing', layers: [['finish', 'Roof tiles', 10], ['substrate', 'Timber', 16], ['structure', 'Timber', 235]] }
};
// openings, ft: [width, height, sill]
export const OPENINGS = {
  storefront: { cat: 'window', name: 'Storefront 10x9', size: [10, 9, 1] },
  band: { cat: 'window', name: 'Window 6x6', size: [6, 6, 2.5] },
  punched: { cat: 'window', name: 'Window 4x5', size: [4, 5, 3] },
  home: { cat: 'window', name: 'Window 3x5', size: [3, 5, 3] },
  entry: { cat: 'door', name: 'Storefront door 6x8', size: [6, 8, 0] },
  door: { cat: 'door', name: 'Door 3x7', size: [3, 7, 0] },
  garage: { cat: 'door', name: 'Garage door 16x7', size: [16, 7, 0] },
  garage1: { cat: 'door', name: 'Garage door 9x7', size: [9, 7, 0] },
  dock: { cat: 'door', name: 'Dock door 9x10', size: [9, 10, 0] },
  drivein: { cat: 'door', name: 'Drive-in door 12x14', size: [12, 14, 0] }
};
// a use's shell: wall, roof, upper floors, parapet (ft over the roof), what its walls hold
const COMMERCIAL = { wall: 'brick', roof: 'tpo', upper: 'deck', parapet: 3, front: 'storefront', sides: null, upperWin: 'band', doors: 'entry' };
export const SHELL = {
  retail: COMMERCIAL, restaurant: { ...COMMERCIAL, sides: 'band' }, fuel: COMMERCIAL, foodtrucks: { ...COMMERCIAL, sides: 'band' },
  office: { ...COMMERCIAL, wall: 'eifs', front: 'band', sides: 'band', entry: true }, medical: { ...COMMERCIAL, wall: 'eifs', front: 'band', sides: 'band', entry: true },
  hotel: { ...COMMERCIAL, wall: 'eifs', front: 'punched', sides: 'punched', upperWin: 'punched', entry: true },
  multifamily: { wall: 'wood', roof: 'tpo', upper: 'wood', parapet: 3, front: 'punched', sides: 'punched', upperWin: 'punched', entry: true, doors: 'door' },
  townhomes: { wall: 'wood', roof: 'shingle', upper: 'wood', parapet: 0, front: 'home', sides: null, upperWin: 'home', doors: 'door', unitDoors: true },
  duplex: { wall: 'wood', roof: 'shingle', upper: 'wood', parapet: 0, front: 'home', sides: 'home', upperWin: 'home', doors: 'door', unitDoors: true },
  sfr: { wall: 'wood', roof: 'shingle', upper: 'wood', parapet: 0, front: 'home', sides: 'home', upperWin: 'home', doors: 'door', unitDoors: true },
  industrial: { wall: 'tilt', roof: 'tpo', upper: 'deck', parapet: 4, front: null, sides: null, upperWin: null, doors: 'entry', office: true, docks: true },
  storage: { wall: 'metal', roof: 'tpo', upper: 'deck', parapet: 2, front: null, sides: null, upperWin: null, doors: 'entry', entry: true },
  church: { ...COMMERCIAL, front: 'band', sides: 'band', entry: true }, amenity: { ...COMMERCIAL, front: 'storefront', sides: 'band' },
  other: COMMERCIAL
};
export const HIP = 22.62; // degrees: a 5:12 roof
const HOMES = ['sfr', 'duplex', 'townhomes'];

const fmt = ft => (Math.round(ft * 10) / 10).toString();
const levelName = ft => ft === 0 ? 'Ground' : `+${fmt(ft)} ft`;
const line = (cmd, p) => `${cmd} ${JSON.stringify(p)}`;
const cw = r => S.signedArea(r) > 0 ? r.slice().reverse() : r; // walls drawn clockwise face out (y north)
// the edge whose outside faces `p` best (of the edges at least 20 ft long, or 40% of the longest on a small building:
// a tiny home's 16 ft front), else the longest
function faceToward(r, p) {
  const min = Math.min(20, 0.4 * Math.max(...r.map((a, i) => Math.hypot(r[(i + 1) % r.length][0] - a[0], r[(i + 1) % r.length][1] - a[1]))));
  let best = -1, score = -Infinity;
  r.forEach((a, i) => {
    const b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < min) return;
    const n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d = Math.hypot(p[0] - m[0], p[1] - m[1]) || 1;
    const s = ((p[0] - m[0]) * n[0] + (p[1] - m[1]) * n[1]) / d - d / 5000; if (s > score) { score = s; best = i; }
  });
  return best >= 0 ? best : longest(r);
}
const longest = r => r.reduce((k, a, i) => { const b = r[(i + 1) % r.length], c = r[(k + 1) % r.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]) > Math.hypot(c[0] - r[k][0], c[1] - r[k][1]) ? i : k; }, 0);
// the nearest point of any of those pieces' outlines to `c` (a long street's centre can be far from the homes on it)
function nearest(els, kinds, c) {
  let best = null, bd = Infinity;
  for (const e of els) {
    if (!kinds.includes(e.kind)) continue; let r; try { r = S.shapeOf(e); } catch { continue; } if (!r?.length) continue;
    r.forEach((a, i) => { const b = r[(i + 1) % r.length], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))), p = [a[0] + dx * t, a[1] + dy * t], d = Math.hypot(p[0] - c[0], p[1] - c[1]); if (d < bd) { bd = d; best = p; } });
  }
  return best;
}
// centres along an edge, `step` apart, kept `edge` ft from its ends; `n` caps how many
function along(a, b, w, step, edge = 4, n = Infinity) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), room = L - 2 * edge - w; if (room < 0) return [];
  const k = Math.min(n, Math.floor(room / step) + 1), s = (L - (k - 1) * step) / 2;
  return Array.from({ length: k }, (_, i) => { const t = (s + i * step) / L; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; });
}

// the buildings of an option as the model takes them: outline (ft, clockwise), floors, floor height, the face toward the
// parking and the one toward the truck court; homes of one kind and size modelled once and counted (`count`)
export function bimBuildings(plan, { every = false } = {}) {
  const els = plan.elements || [], out = [], seen = new Map();
  for (const e of els) {
    if (e.kind !== 'building' || e.use === 'garage') continue;
    const use = S.USES[e.use] ? e.use : 'other', U = S.USES[use], floors = Math.max(1, e.floors || U.floors || 1), floorH = e.floorH || U.floorH || 12;
    const key = HOMES.includes(use) && !S.isFree(e) && !every ? [use, Math.round(e.w), Math.round(e.d), floors, e.units || 1, e.form || ''].join('|') : null;
    if (key && seen.has(key)) { seen.get(key).count++; continue; }
    // its front faces its parking (within 200 ft), else the nearest street
    const ring = cw(S.outline(e)), c = S.centroid(ring), lot = nearest(els, ['parking'], c), park = lot && Math.hypot(lot[0] - c[0], lot[1] - c[1]) < 200 ? lot : nearest(els, ['drive', 'parking'], c), truck = nearest(els, ['truck'], c);
    const front = park ? faceToward(ring, park) : longest(ring), dock = truck ? faceToward(ring, truck) : null;
    const tower = e.form === 'tower' && e.podium > 0 && floors > e.podium ? { from: e.podium, ring: cw(S.towerOutline(e)) } : null;
    // a home's plan counts living area: its garage (about 220 sf a car) and porch are on the ground floor only, so the
    // floors above are smaller, centred on it, together what's left of the living area
    const garage = HOMES.includes(use) && plan.program?.garage !== false && !/tiny|manufactured/i.test(e.note || '') && (U.garage || 0) > 0, foot = S.ringArea(ring), garageSf = garage ? U.garage * 220 : 0;
    const upperSf = e.sf != null && floors > 1 ? Math.max(0.4 * foot, Math.min(foot, (e.sf - (foot - garageSf)) / (floors - 1))) : null;
    const upper = upperSf && upperSf < foot - 1 ? ring.map(p => [c[0] + (p[0] - c[0]) * Math.sqrt(upperSf / foot), c[1] + (p[1] - c[1]) * Math.sqrt(upperSf / foot)]) : null;
    const b = { id: e.id, name: e.name || U.label, use, floors, floorH, units: e.units || null, note: e.note || '', garage, ring, upper, front, dock, tower, gsf: Math.round(S.gfaOf(e)), garageSf: e.sf != null ? garageSf : 0, count: 1 };
    out.push(b); if (key) seen.set(key, b);
  }
  return out;
}

// the script: the project, its types, one level an elevation, and each building in turn. Returns the text and, for
// each building, the commands it made (`first`, `n`: the lines after the header), which takeoff() maps results back by.
// every: each home its own model, for a picture of the whole community (slower: a few seconds a hundred homes)
export function bimScript(plan, { name = plan.name || 'Site plan option', every = false } = {}) {
  const B = bimBuildings(plan, { every }), all = B.flatMap(b => b.ring.concat(b.tower ? b.tower.ring : []));
  const x0 = Math.min(...all.map(p => p[0])), y0 = Math.min(...all.map(p => p[1])), at = ([x, y]) => [mm(x - x0), mm(y - y0)];
  const head = [line('new', { name })];
  for (const [k, w] of Object.entries(WALLS)) head.push(line('type', { category: 'wall', name: w.name, layers: w.layers.map(([f, m, t]) => ({ function: f, material: m, thickness: t })) }));
  for (const f of Object.values(FLOORS)) head.push(line('type', { category: 'floor', name: f.name, layers: f.layers.map(([fn, m, t]) => ({ function: fn, material: m, thickness: t })) }));
  for (const f of Object.values(ROOFS)) head.push(line('type', { category: 'roof', name: f.name, layers: f.layers.map(([fn, m, t]) => ({ function: fn, material: m, thickness: t })) }));
  for (const o of Object.values(OPENINGS)) head.push(line('type', { category: o.cat, name: o.name, width: mm(o.size[0]), height: mm(o.size[1]), ...(o.cat === 'window' ? { sill: mm(o.size[2]) } : {}) }));
  // levels: every storey's and roof's elevation, once (a new project has Level 1 at 0 and Level 2: renamed and moved)
  const elev = [...new Set(B.flatMap(b => Array.from({ length: b.floors + 1 }, (_, k) => +(k * b.floorH).toFixed(2))))].sort((a, b) => a - b);
  head.push(line('modify', { id: 100000, name: levelName(0) }), line('modify', { id: 100001, elevation: mm(elev[1]), name: levelName(elev[1]) }));
  for (const z of elev.slice(2)) head.push(line('level', { elevation: mm(z), name: levelName(z) }));
  const body = [], parts = [];
  for (const b of B) {
    const S0 = SHELL[b.use] || SHELL.other, first = body.length, cmd = (c, p) => body.push(line(c, p)), home = HOMES.includes(b.use);
    for (let k = 0; k < b.floors; k++) {
      const z = +(k * b.floorH).toFixed(2), lv = levelName(z), r = b.tower && k >= b.tower.from ? b.tower.ring : k && b.upper ? b.upper : b.ring, top = k === b.floors - 1 || (b.tower && k === b.tower.from - 1);
      cmd('wall', { points: r.map(at), closed: true, type: WALLS[S0.wall].name, level: lv, height: mm(b.floorH + (top && !home ? S0.parapet : 0)) });
      cmd('floor', { boundary: r.map(at), level: lv, type: (k ? FLOORS[S0.upper] : FLOORS.grade).name });
      const ow = (key, p) => { const o = OPENINGS[key]; cmd(o.cat, { at: at(p), level: lv, type: o.name }); };
      r.forEach((a, i) => {
        const e2 = r[(i + 1) % r.length], L = Math.hypot(e2[0] - a[0], e2[1] - a[1]), isFront = r === b.ring && i === b.front, isDock = r === b.ring && i === b.dock;
        if (L < 12) return; // (round corners and jogs)
        if (k === 0 && isDock && S0.docks) { // dock doors along the truck court, two drive-ins at its ends
          const docks = along(a, e2, 9, 14, 30), ends = along(a, e2, 12, Math.max(14, L - 30), 6, 2);
          docks.forEach(p => ow('dock', p)); if (L > 120) ends.forEach(p => ow('drivein', p)); return;
        }
        if (k === 0 && isFront) {
          if (S0.office) { along(a, e2, 10, 12, 8, 3).forEach((p, j) => ow(j === 1 ? 'entry' : 'storefront', p)); return; } // the office corner of a warehouse
          if (S0.unitDoors) { unitFront(b, a, e2, L).forEach(([key, p]) => ow(key, p)); return; }
          // storefront bays with a door every fourth (about one a 44 ft bay); a band with one entry in its middle
          const kind = S0.front, spots = kind ? along(a, e2, OPENINGS[kind].size[0], kind === 'storefront' ? 11 : OPENINGS[kind].size[0] + 4) : [], mid = Math.floor(spots.length / 2);
          spots.forEach((p, j) => ow((kind === 'storefront' ? j % 4 === 1 : j === mid) ? (S0.doors || 'entry') : kind, p));
          if (!spots.length && S0.doors) ow(S0.doors, along(a, e2, 6, 1, 2, 1)[0] || [(a[0] + e2[0]) / 2, (a[1] + e2[1]) / 2]); return;
        }
        // a back door 6 ft in from the corner of the side opposite the front, the windows past it
        const kind = k ? S0.upperWin : S0.sides, back = k === 0 && S0.entry && !home && r === b.ring && i === (b.front + Math.floor(r.length / 2)) % r.length && L >= 20, u = back ? 10 / L : 0;
        if (back) ow('door', [a[0] + (e2[0] - a[0]) * 6 / L, a[1] + (e2[1] - a[1]) * 6 / L]);
        if (kind) along([a[0] + (e2[0] - a[0]) * u, a[1] + (e2[1] - a[1]) * u], e2, OPENINGS[kind].size[0], home ? 12 : OPENINGS[kind].size[0] + 4).forEach(p => ow(kind, p));
      });
      if (b.use === 'townhomes' && (b.units || 1) > 1) partyWalls(b, r, at, lv).forEach(p => cmd('wall', { points: p, type: WALLS.party.name, level: lv, height: mm(b.floorH) }));
    }
    const top = b.floors * b.floorH;
    if (b.upper && b.floors > 1) cmd('roof', { level: levelName(+b.floorH.toFixed(2)), boundary: b.ring.map(at), courtyards: [b.upper.map(at)], slope: 0, overhang: mm(1), type: ROOFS[S0.roof].name }); // over the ground floor round the smaller one above
    if (b.tower) cmd('roof', { level: levelName(+(b.tower.from * b.floorH).toFixed(2)), boundary: b.ring.map(at), slope: 0, overhang: 0, type: ROOFS[S0.roof].name });
    cmd('roof', { level: levelName(+top.toFixed(2)), boundary: (b.tower ? b.tower.ring : b.floors > 1 && b.upper ? b.upper : b.ring).map(at), slope: S0.roof === 'shingle' ? HIP : 0, overhang: S0.roof === 'shingle' ? mm(1.5) : 0, type: ROOFS[S0.roof].name });
    parts.push({ ...b, first, n: body.length - first });
  }
  return { text: head.concat(body).join('\n') + '\n', head: head.length, buildings: parts, origin: [x0, y0] };
}
// a home's or a townhome row's front: per unit a door and a garage door (front-load) or two windows (rear-load)
function unitFront(b, a, e2, L) {
  const n = b.units || 1, out = [], rear = /rear-load/.test(b.note || '');
  for (let u = 0; u < n; u++) {
    const s = u / n, t = (u + 1) / n, p = q => [a[0] + (e2[0] - a[0]) * (s + (t - s) * q), a[1] + (e2[1] - a[1]) * (s + (t - s) * q)], w = L / n;
    if (w < 14) { out.push(['door', p(0.5)]); continue; }
    out.push(['door', p(0.2)]); if (b.garage && !rear && w >= 22 && b.use !== 'townhomes') out.push([w >= 30 ? 'garage' : 'garage1', p(0.65)]); else out.push(['home', p(0.65)]);
  }
  return out;
}
// a townhome row's walls between its units, square across the row's long side
function partyWalls(b, r, at, lv) {
  const i = longest(r), a = r[i], c = r[(i + 1) % r.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]), u = [(c[0] - a[0]) / L, (c[1] - a[1]) / L], n = [u[1], -u[0]];
  const depth = Math.min(...r.map(p => (p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1]).filter(d => d > 1)) || 40, out = [];
  for (let k = 1; k < b.units; k++) { const p = [a[0] + u[0] * L * k / b.units, a[1] + u[1] * L * k / b.units]; out.push([at(p), at([p[0] + n[0] * depth, p[1] + n[1] * depth])]); }
  return out;
}

// quantities per building from the CLI's output: `results`, one parsed reply a script line (header first), and the
// schedules of walls, windows, doors, floors and roofs. Walls net of their openings; areas in sf, lengths in ft.
export function takeoff(script, results, sched) {
  const owner = new Map(); // element id → building
  script.buildings.forEach(b => results.slice(script.head + b.first, script.head + b.first + b.n).forEach(r => { for (const id of r?.ids || (r?.id != null ? [r.id] : [])) owner.set(id, b); }));
  const Q = new Map(script.buildings.map(b => [b, { walls: {}, wallGross: 0, glass: 0, openings: {}, floors: {}, roofs: {}, roofArea: 0 }]));
  const rows = s => (s?.rows || []).map(row => Object.fromEntries(s.columns.map((c, i) => [c.replace(/ \(.*\)$/, ''), row[i]])));
  const idOf = (s, k) => s.elements?.[k]?.[0];
  const holes = new Map(); // wall id → sf of its openings
  for (const cat of ['windows', 'doors']) rows(sched[cat]).forEach((r, k) => {
    const b = owner.get(idOf(sched[cat], k)); if (!b) return; const q = Q.get(b), sf = r.Width * r.Height / MM / MM;
    q.openings[r.Type] = (q.openings[r.Type] || 0) + 1; if (cat === 'windows') q.glass += sf; holes.set(r.Wall, (holes.get(r.Wall) || 0) + sf);
  });
  rows(sched.walls).forEach((r, k) => {
    const id = idOf(sched.walls, k), b = owner.get(id); if (!b) return; const q = Q.get(b), gross = r.Length * r.Height / MM / MM;
    q.walls[r.Type] = (q.walls[r.Type] || 0) + gross - (holes.get(id) || 0); if (r.Type !== WALLS.party.name && !/partition|party/i.test(r.Type)) q.wallGross += gross; // (the outside walls only: interior and party walls aren't envelope)
  });
  rows(sched.floors).forEach((r, k) => { const b = owner.get(idOf(sched.floors, k)); if (b) { const q = Q.get(b); q.floors[r.Type] = (q.floors[r.Type] || 0) + r.Area * SF_M2; } });
  rows(sched.roofs).forEach((r, k) => { const b = owner.get(idOf(sched.roofs, k)); if (b) { const q = Q.get(b), a = (r['Plan Area'] || 0) * SF_M2; q.roofs[r.Type] = (q.roofs[r.Type] || 0) + a; q.roofArea += a; } });
  const round = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)]));
  return script.buildings.map(b => {
    const q = Q.get(b), floorSf = Object.entries(q.floors).reduce((s, [t, v]) => s + (/balcony|patio/i.test(t) ? 0 : v), 0); // (balconies and patios aren't floor area)
    return { name: b.name, use: b.use, count: b.count, floors: b.floors, gsf: b.gsf, modelSf: Math.round(floorSf), garageSf: b.garageSf, walls: round(q.walls), floorsByType: round(q.floors), roofs: round(q.roofs), openings: q.openings,
      glassSf: Math.round(q.glass), wallToFloor: floorSf ? +(q.wallGross / floorSf).toFixed(3) : null, glazing: q.wallGross ? +(q.glass / q.wallGross).toFixed(3) : null };
  });
}
// the schedules takeoff() reads, as script lines run after the model
export const SCHEDULES = [
  ['walls', { category: 'walls', fields: ['Type', 'Length', 'Height'] }], ['windows', { category: 'windows', fields: ['Type', 'Width', 'Height', 'Wall'] }],
  ['doors', { category: 'doors', fields: ['Type', 'Width', 'Height', 'Wall'] }], ['floors', { category: 'floors', fields: ['Type', 'Area'] }], ['roofs', { category: 'roofs', fields: ['Type', 'Plan Area'] }]
];
