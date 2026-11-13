import * as S from './siteplan.mjs';

const EV_CLEARED = new Set(['evcharger', 'evpower', 'evcanopy']);
const UNDER = new Set(['green', 'lot', 'field']); // (what a charger or canopy on its own stalls may sit over: planting, a home's lot line, the parking field's paving)
const overlaps = (a, b) => S.rectsOverlap(a, b, 0.1);
const accessShapes = a => [...a.stalls, ...a.aisles].map(x => ({ poly: x.poly }));
const insideRing = (e, ring) => ring.length >= 3 && S.corners(e).every(p => S.inRing(p, ring));
const boundaryGap = (p, ring) => Math.min(...ring.map((a, i) => S.segDist(p, a, ring[(i + 1) % ring.length])));
const expanded = (e, n) => ({ ...e, w: e.w + 2 * n, d: e.d + 2 * n });

// a parking piece's stalls as drawn, each { poly: [aisle a, aisle b, head b, head a], row, i }: the angled rows' own
// parallelograms (S.angledStallPolys), else the square rows with their islands (every S.isleOf stall) and end caps left
// out, as S.stallCentres and S.stallLines draw them
function stallPolys(park) {
  if (S.stallAng(park)) return S.angledStallPolys(park).map(({ poly, r, i }) => ({ poly, row: r, i }));
  const sw = park.sw || S.STALL.w, st = S.stalls(park), x0 = -st.n * sw / 2, every = S.isleOf(park), skip = new Set(), out = [];
  if (park.islands) for (let k = every - 1; k < st.n - (park.caps ? 1 : 0); k += every) skip.add(k);
  if (park.caps && st.n >= 6) { skip.add(0); skip.add(st.n - 1); }
  const put = (u, v) => { const q = S.rotPt(st.swap ? [v, -u] : [u, v], park.rot || 0); return [park.x + q[0], park.y + q[1]]; };
  st.rows.forEach(([y0, y1], r) => {
    const head = park.row ? (park.row > 0 ? y0 : y1) : r % 2 ? y1 : y0, aisle = head === y0 ? y1 : y0; // (a row's head line is the side away from its aisle)
    const [bx, by] = put(0, (y0 + y1) / 2), band = { kind: 'parking', x: bx, y: by, w: st.n * sw, d: Math.abs(y1 - y0), rot: (park.rot || 0) + (st.swap ? -90 : 0) }; // (the whole row, its planted ends and islands too: a canopy may span them)
    for (let i = 0; i < st.n; i++) if (!skip.has(i)) { const u0 = x0 + i * sw, u1 = u0 + sw; out.push({ poly: [put(u0, aisle), put(u1, aisle), put(u1, head), put(u0, head)], row: r, i, band }); }
  });
  return out;
}
const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
// a row of stalls as one rectangle along its head line (what a canopy over the row has to stay inside)
function rowRect(polys) {
  const [p0, , p2, p3] = polys[0].poly, a = Math.atan2(p2[1] - p3[1], p2[0] - p3[0]), ux = Math.cos(a), uy = Math.sin(a), pts = polys.flatMap(s => s.poly);
  const s = pts.map(p => p[0] * ux + p[1] * uy), t = pts.map(p => -p[0] * uy + p[1] * ux), sm = (Math.min(...s) + Math.max(...s)) / 2, tm = (Math.min(...t) + Math.max(...t)) / 2;
  void p0; return { kind: 'parking', x: sm * ux - tm * uy, y: sm * uy + tm * ux, w: Math.max(...s) - Math.min(...s), d: Math.max(...t) - Math.min(...t), rot: a * 180 / Math.PI };
}

function stallCandidates(plan, elements, access) {
  const out = [], ada = accessShapes(access), walks = S.details(plan).walks; // (a row head-in against a building has its heads on the building's walk)
  for (const [pi, park] of elements.entries()) {
    if (park.kind !== 'parking' || park.rv || park.vac || park.trailer || park.poly || S.isFree(park)) continue;
    const polys = stallPolys(park), rows = new Map();
    for (const sp of polys) (rows.get(sp.row) || rows.set(sp.row, []).get(sp.row)).push(sp);
    for (const [ri, list] of rows) {
      const row = list[0].band || rowRect(list); // (an angled row: the band its stalls cover)
      for (const sp of list) {
        const stall = { poly: sp.poly };
        if (ada.some(a => overlaps(stall, a))) continue;
        // 3 ft in from the middle of its head line (a quarter of the way on a short stall), square to the head line
        const [a0, a1, h1, h0] = sp.poly, H = mid(h0, h1), A = mid(a0, a1), len = Math.hypot(A[0] - H[0], A[1] - H[1]) || 1, k = Math.min(3, len / 4) / len;
        const x = H[0] + (A[0] - H[0]) * k, y = H[1] + (A[1] - H[1]) * k, rot = Math.atan2(h1[1] - h0[1], h1[0] - h0[0]) * 180 / Math.PI;
        const charger = { kind: 'evcharger', x, y, w: 2, d: 2, rot, chargerType: 'level2', parkingId: park.id ?? null, stall: sp.i, ...(rows.size > 1 ? { row: ri } : {}) };
        const guard = expanded(charger, 1.5);
        const blocked = elements.some(e => e !== park && !EV_CLEARED.has(e.kind) && !UNDER.has(e.kind) && overlaps(guard, e));
        if (blocked || ada.some(a => overlaps(guard, a)) || walks.some(w => overlaps(guard, w))) continue;
        out.push({ charger, park, row, rowIndex: ri, stallIndex: sp.i, parkIndex: pi, stallRect: stall });
      }
    }
  }
  return out;
}

function uniqueId(elements, stem) {
  const used = new Set(elements.map(e => e.id).filter(x => x != null));
  for (let i = 1; ; i++) if (!used.has(stem + '-' + i)) return stem + '-' + i;
}

function placeCanopy(plan, elements, selected, access, config) {
  const { w, d } = config.canopy || {};
  if (!(w > 0 && d > 0) || !selected.length) return null;
  const groups = new Map(); let best = null; // (over every charger in its row when it can; else over as many as it can, said in the notes)
  for (const c of selected) {
    const key = c.parkIndex + ':' + c.rowIndex;
    (groups.get(key) || groups.set(key, []).get(key)).push(c);
  }
  for (const group of groups.values()) {
    const seed = group[0], row = seed.row, stations = group.map(c => c.charger);
    // where along its row the canopy's centre may go (it stays inside the row): over the chargers' middle first, then
    // nearest it, every foot of the way
    const a = (seed.charger.rot || 0) * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), half = (row.w - w) / 2;
    if (half < -0.01) continue;
    const along = stations.map(st => (st.x - row.x) * ux + (st.y - row.y) * uy), mid = (Math.min(...along) + Math.max(...along)) / 2, lim = Math.max(0, half);
    const spots = [Math.max(-lim, Math.min(lim, mid))];
    for (let t = -Math.floor(lim); t <= lim; t++) spots.push(t);
    spots.sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid));
    for (const t of spots) {
      const canopy = { kind: 'evcanopy', x: row.x + ux * t, y: row.y + uy * t, w, d, rot: seed.charger.rot || 0, name: 'EV charging canopy' };
      if (!insideRing(canopy, plan.ring) || !S.corners(canopy).every(p => S.hitRect(expanded(row, 0.01), p))) continue; // (a hair of slack: a canopy as deep as the row, turned, is on its edges to within rounding)
      const covered = stations.filter(s => S.hitRect(canopy, [s.x, s.y])).length;
      if (!covered || best && covered <= best.covered) continue;
      const guard = expanded(canopy, 2);
      if (accessShapes(access).some(a0 => overlaps(guard, a0))) continue;
      // (the row's own aisle drive runs flush along it: drives and parking are kept off the canopy itself, already inside the row)
      const blocked = elements.some(e => e !== seed.park && !EV_CLEARED.has(e.kind) && !UNDER.has(e.kind) && overlaps(e.kind === 'drive' || e.kind === 'truck' || e.kind === 'parking' ? canopy : guard, e)); // (other parking beside the row: kept off the canopy itself, which stays over its own row)
      if (blocked) continue;
      best = { canopy, covered, of: stations.length };
      if (covered === stations.length) return best;
    }
  }
  return best;
}

function placePower(plan, elements, selected, access, config) {
  const { w, d } = config.power || {};
  if (!(w > 0 && d > 0) || !selected.length) return null;
  const seeds = selected.map(c => [c.charger.x, c.charger.y]), candidates = new Map();
  for (const [sx, sy] of seeds) for (let dx = -150; dx <= 150; dx += 10) for (let dy = -150; dy <= 150; dy += 10) {
    const x = Math.round((sx + dx) / 5) * 5, y = Math.round((sy + dy) / 5) * 5, key = x + ':' + y;
    if (!candidates.has(key)) candidates.set(key, { x, y, dist: Math.min(...seeds.map(([a, b]) => Math.hypot(x - a, y - b))) });
  }
  const points = [...candidates.values()].sort((a, b) => a.dist - b.dist), routes = [...accessShapes(access), ...S.details(plan).walks]; // (the walks round the buildings are accessible routes too)
  for (const p of points) {
    const pad = { kind: 'evpower', x: p.x, y: p.y, w, d, name: 'EV power equipment' };
    if (!insideRing(pad, plan.ring) || Math.min(...S.corners(pad).map(p => boundaryGap(p, plan.ring))) < 10) continue;
    const guard = expanded(pad, 4);
    if (routes.some(a => overlaps(guard, a))) continue;
    const blocked = elements.some(e => e.kind !== 'green' && e.kind !== 'lot' && overlaps(guard, e));
    if (!blocked) return pad;
  }
  return null;
}

export function withEV(plan, option) {
  const program = S.normalizeProgram(option.program || plan.program), config = program.ev;
  const notes = (option.notes || []).filter(n => !n.startsWith('EV charging:') && !n.startsWith('EV charging canopy:') && !n.startsWith('EV power equipment:'));
  if (!config) {
    const elements = (option.elements || []).filter(e => !EV_CLEARED.has(e.kind));
    return elements.length === (option.elements || []).length && notes.length === (option.notes || []).length ? option : { ...option, elements, notes };
  }
  const elements = (option.elements || []).filter(e => !EV_CLEARED.has(e.kind));
  const base = { ...plan, program, elements };
  const raw = elements.filter(e => e.kind === 'parking' && !e.rv && !e.vac && !e.trailer).reduce((n, e) => n + S.stalls(e).count, 0);
  const requested = config.mode === 'share' ? config.value > 0 ? Math.max(1, Math.ceil(raw * config.value / 100)) : 0 : config.value;
  const access = S.accessible(base), available = stallCandidates(base, elements, access);
  const selected = available.slice(0, requested), additions = [];
  selected.forEach((slot, i) => additions.push({ ...slot.charger, id: uniqueId(elements.concat(additions), 'ev-charger'), chargerType: config.type, name: 'EV charger ' + (i + 1), note: config.type === 'dcfc' ? 'DC fast charger' : 'Level 2 charger' }));
  const cover = placeCanopy(base, elements, selected, access, config), canopy = cover?.canopy || null;
  if (canopy) additions.push({ ...canopy, id: uniqueId(elements.concat(additions), 'ev-canopy') });
  const power = placePower(base, elements.concat(additions), selected, access, config);
  if (power) additions.push({ ...power, id: uniqueId(elements.concat(additions), 'ev-power') });

  if (selected.length < requested) notes.unshift('EV charging: ' + selected.length + ' of ' + requested + ' requested stalls fit outside accessible stalls and routes.');
  const cw = config.canopy?.w > 0, cd = config.canopy?.d > 0, pw = config.power?.w > 0, pd = config.power?.d > 0;
  if (cw !== cd) notes.unshift('EV charging canopy: enter both width and depth to place this footprint.');
  else if (cw && canopy && cover.covered < cover.of) notes.unshift('EV charging canopy: covers ' + cover.covered + ' of the ' + cover.of + ' chargers in its row; a longer canopy would cover them all.');
  else if (cw && !canopy) notes.unshift('EV charging canopy: the requested footprint does not fit over the reserved charger stalls clear of drives and accessible routes.');
  if (pw !== pd) notes.unshift('EV power equipment: enter both width and depth to place this footprint.');
  else if (pw && !power) notes.unshift('EV power equipment: the requested footprint does not fit in clear site area near the chargers.');
  if (selected.length && !notes.some(n => n.startsWith('EV charging:'))) notes.unshift('EV charging: ' + selected.length + ' ' + (config.type === 'dcfc' ? 'DC fast' : 'Level 2') + ' charger stalls reserved.');
  return { ...option, elements: elements.concat(additions), notes };
}

export const isEVKind = kind => EV_CLEARED.has(kind);
