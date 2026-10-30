// Site plans on a parcel: plan geometry in feet, checks and numbers, the layout generator behind "Build with AI",
// map features and DXF export. Shared by the browser (src/siteplan.js), the AI endpoint (api/siteplan.js) and the
// tests (test/siteplan.mjs).
//
// A plan is drawn in feet east (x) and north (y) of its origin [lon, lat]. The boundary is an open ring,
// counter-clockwise. Every element is a rectangle:
//   { id, kind, x, y (centre), w (along its own x axis), d (along its own y axis), rot (degrees, counter-clockwise), floors? }
// kinds: building, parking, drive, truck (truck court / loading), pond (detention), green (landscape)
// This is a planning sketch (test fits, yields, parking counts), not engineering: no grading, utilities or code review.

import polyclip from './vendor/polyclip.mjs';
import { WALLER } from './rulesheet.mjs';
import * as STL from './stalls.mjs';
import { facades } from './massing.mjs';

const FT = 3.280839895, RAD = Math.PI / 180;

export const KINDS = {
  building: { label: 'Building', solid: true },
  parking: { label: 'Parking', paved: true },
  drive: { label: 'Drive', paved: true },
  truck: { label: 'Truck court', paved: true },
  field: { label: 'Parking field', paved: true }, // the paving under and between a lot's rows and aisles (fieldsOf): the gaps paved too, as on a civil sheet
  pond: { label: 'Detention', solid: true },
  green: { label: 'Landscape' },
  plaza: { label: 'Plaza', paved: true },
  court: { label: 'Courts', solid: true },
  pool: { label: 'Pool', solid: true },
  play: { label: 'Playground', solid: true },
  trail: { label: 'Trail' },
  trash: { label: 'Trash enclosure', solid: true },
  garage: { label: 'Parking garage', solid: true },
  patio: { label: 'Outdoor seating', paved: true },
  keepout: { label: 'Easement / no-build area' }, // drawn by hand, not surveyed: nothing built or paved goes on it
  fence: { label: 'Fence / gate' }, // a line (path) round a secured area; gate: true marks where a drive goes through it
  foodtruck: { label: 'Food truck stall', solid: true }, // a concrete pad beside the service lane with a power and water pedestal; local +v is the lane side, the serving window faces −v
  sign: { label: 'Monument sign' }, // a pad for the community's sign (10 × 5 ft, its long side to the street): in an entry's median or at its corners
  canopy: { label: 'Fuel canopy', solid: true }, // a roof on columns over the pump islands: no floor area, counts toward coverage; the paving runs on under it
  tanks: { label: 'Fuel tanks' }, // the underground tanks' pad: paved over, kept clear of parking and buildings so the fuel truck can pull up beside it
  lot: { label: 'Lot line' } // a home's lot: drawn as a line, never checked or counted
};

// typical suburban Houston-area numbers, used when the request doesn't say
export const USES = {
  retail: { label: 'Retail', ratio: 4, floors: 1, depth: 100, floorH: 20 },
  restaurant: { label: 'Restaurant', ratio: 10, floors: 1, depth: 70, floorH: 18 },
  office: { label: 'Office', ratio: 3.5, floors: 2, depth: 110, floorH: 13 },
  medical: { label: 'Medical office', ratio: 5, floors: 1, depth: 100, floorH: 14 },
  hotel: { label: 'Hotel', ratio: 1.82, floors: 4, depth: 65, floorH: 11, roomSf: 550 }, // a space a room, about 550 gross sf a room
  church: { label: 'Church / worship', ratio: 10, floors: 1, depth: 100, floorH: 24 }, // about a space for every 3 seats in the sanctuary
  industrial: { label: 'Industrial / warehouse', ratio: 0.6, floors: 1, depth: 240, floorH: 36, truck: 130 },
  storage: { label: 'Self storage', ratio: 0.1, floors: 3, depth: 110, floorH: 10 }, // floors: the climate-controlled building's; a space per ~10,000 sf (about one per 100 units) at the office
  fuel: { label: 'Gas station / c-store', ratio: 4, floors: 1, depth: 60, floorH: 18 }, // ratio: spaces per 1,000 sf of the store (the pumps and a car wash need none of their own)
  multifamily: { label: 'Multifamily', perUnit: 1.6, floors: 3, depth: 65, floorH: 10, unitSf: 900 },
  townhomes: { label: 'Townhomes', perUnit: 2, floors: 3, depth: 40, floorH: 10, unitW: 24, garage: 2, guest: 0.25 }, // guest: surface spaces a home on top of its garage
  duplex: { label: 'Duplexes / cottages', perUnit: 2, floors: 2, depth: 40, floorH: 10, unitSf: 1800, garage: 1 },
  sfr: { label: 'Single-family homes', perUnit: 2, floors: 2, depth: 40, floorH: 11, unitSf: 2400, garage: 2 },
  foodtrucks: { label: 'Food truck park', ratio: 8, floors: 1, depth: 50, floorH: 16 }, // ratio: spaces per 1,000 sf of the bar; the trucks add FOODTRUCK.perTruck each (the pavilion and restrooms serve the same visitors)
  amenity: { label: 'Amenity / commons', ratio: 0, floors: 1, depth: 60, floorH: 18 },
  other: { label: 'Other', ratio: 3, floors: 1, depth: 100, floorH: 16 }
};
// the uses laid out as a building row facing its parking (shops, offices and the like)
export const COMMERCIAL = ['retail', 'restaurant', 'office', 'medical', 'hotel', 'church', 'other'];
export const SETBACKS = { front: 25, side: 10, rear: 20, paving: 10 };
// landscape buffers by side (paveFront, paveSide, paveRear) fall back to `paving`; buildOn / paveOn: false turn a kind off
// a typical garden-style unit mix (beds: studios count as one bed, as TestFit counts them)
export const UNIT_MIX = [{ name: 'Studio', sf: 550, pct: 10, beds: 1 }, { name: '1 BR', sf: 760, pct: 45, beds: 1 }, { name: '2 BR', sf: 1100, pct: 35, beds: 2 }, { name: '3 BR', sf: 1350, pct: 10, beds: 3 }];
// single-family homes by stories: living area, footprint with the garage, and the lot width each takes
export const HOME_TYPES = { 1: { sf: 1900, w: 54, d: 48, lotW: 60 }, 2: { sf: 2600, w: 42, d: 40, lotW: 50 }, 3: { sf: 3000, w: 30, d: 38, lotW: 40 } };
export const HOME_MIX = [{ stories: 1, pct: 30 }, { stories: 2, pct: 60 }, { stories: 3, pct: 10 }];
// self storage: a climate-controlled building (several floors, inside halls, the leasing office) and drive-up rows (one
// story, doors straight onto a drive aisle), behind a fence with a keypad gate. Rentable share of the gross area, the
// usual unit mixes (by count) and the sizes the layout draws with. Typical starting numbers; everything is editable.
export const STORAGE = { climateEff: 0.72, driveEff: 0.92, rowD: 40, aisle: 26, single: 30, rvW: 12, rvD: 40, office: 1200 };
export const STORAGE_MIX = {
  climate: [{ name: '5×5', sf: 25, pct: 15 }, { name: '5×10', sf: 50, pct: 25 }, { name: '10×10', sf: 100, pct: 30 }, { name: '10×15', sf: 150, pct: 18 }, { name: '10×20', sf: 200, pct: 12 }],
  drive: [{ name: '10×10', sf: 100, pct: 15 }, { name: '10×15', sf: 150, pct: 25 }, { name: '10×20', sf: 200, pct: 30 }, { name: '10×25', sf: 250, pct: 15 }, { name: '10×30', sf: 300, pct: 15 }]
};
// a storage mix's average unit (sq ft): by count, so 5×5s pull it down
export const storageAvg = mix => { const m = (Array.isArray(mix) && mix.length ? mix : []).filter(t => +t.pct > 0 && +t.sf > 0), tot = m.reduce((s, t) => s + +t.pct, 0); return tot ? m.reduce((s, t) => s + t.sf * t.pct, 0) / tot : 0; };
// a storage building's kind: climate-controlled, drive-up or the office (older plans: by its name)
export const storageKind = e => e.storage || (/drive-?up/i.test(e.name || e.note || '') ? 'drive' : /office/i.test(e.name || '') ? 'office' : 'climate');
// a storage building's line under its name
export const storageNote = e => { const k = storageKind(e), g = Math.round(gfaOfEl(e) / 100) * 100;
  return k === 'office' ? 'Leasing office · ' + g.toLocaleString('en-US') + ' sf' : k === 'drive' ? 'Drive-up units · ' + Math.round(Math.min(e.w, e.d)) + ' ft deep · ' + g.toLocaleString('en-US') + ' sf' : (e.floors || 1) + '-story climate-controlled · ' + g.toLocaleString('en-US') + ' sf · office'; };
// what a plan's storage holds: gross and rentable sq ft and units for each kind, and the RV / boat spaces
export function storageOf(els, prog = {}) {
  const st = { ...STORAGE, ...(prog.storage || {}) }, mix = { climate: st.climateMix || STORAGE_MIX.climate, drive: st.driveMix || STORAGE_MIX.drive };
  const out = { climateGsf: 0, climateNrsf: 0, driveGsf: 0, driveNrsf: 0, officeGsf: 0, rv: 0 };
  for (const e of els || []) {
    if (e.kind === 'parking' && e.rv) { out.rv += stalls(e).count; continue; }
    if (e.kind === 'parking' && e.trailer) continue; // (trailer parking in a truck court: not car spaces)
    if (e.kind !== 'building' || e.use !== 'storage') continue;
    const k = storageKind(e), g = gfaOfEl(e);
    if (k === 'office') out.officeGsf += g; else if (k === 'drive') { out.driveGsf += g; out.driveNrsf += g * st.driveEff; } else { out.climateGsf += g; out.climateNrsf += g * st.climateEff; }
  }
  const ac = storageAvg(mix.climate) || 100, ad = storageAvg(mix.drive) || 200;
  out.climateUnits = Math.floor(out.climateNrsf / ac); out.driveUnits = Math.floor(out.driveNrsf / ad);
  out.units = out.climateUnits + out.driveUnits; out.nrsf = out.climateNrsf + out.driveNrsf; out.gsf = out.climateGsf + out.driveGsf + out.officeGsf;
  return out;
}
// a food truck park: truck stalls (a 15 × 35 ft pad each, a utility pedestal for power and water) along a service lane
// behind them, round a covered pavilion with picnic seating and a lawn; restrooms, a bar or beer garden with its patio,
// a playground, a dumpster and grease enclosure. Typical starting numbers; everything is editable. seatSf: covered and
// patio seating, sq ft a seat.
export const FOODTRUCK = { stallL: 35, stallD: 15, gap: 4, lane: 20, perTruck: 5, pavilionSf: 3000, barSf: 2000, restroomSf: 800, seatSf: 15 };
// a food truck park building's part: pavilion, restroom or bar (older plans: by its name)
export const ftKind = e => e.ft || (/bar|beer|tap/i.test(e.name || e.note || '') ? 'bar' : /rest ?room|toilet/i.test(e.name || e.note || '') ? 'restroom' : 'pavilion');
// what a plan's food truck park holds: trucks, seats (covered and patio), the pavilion, restrooms and bar
export function foodTruckOf(els) {
  const out = { trucks: 0, pavilionSf: 0, restroomSf: 0, barSf: 0, patioSf: 0, seats: 0 };
  for (const e of els || []) {
    if (e.kind === 'foodtruck') out.trucks++;
    else if (e.kind === 'patio') out.patioSf += elArea(e);
    else if (e.kind === 'building' && e.use === 'foodtrucks') { const k = ftKind(e); out[k === 'bar' ? 'barSf' : k === 'restroom' ? 'restroomSf' : 'pavilionSf'] += gfaOfEl(e); }
  }
  out.seats = Math.floor((out.pavilionSf + out.patioSf) / FOODTRUCK.seatSf);
  return out;
}
// a truck stall's parts, plan feet: the truck (8.5 × 26 ft, against the lane side), its serving window (the side facing
// the seating) and the pedestal at the far end of the pad
export function truckParts(e) {
  const at = (u, v) => { const q = rot([u, v], e.rot || 0); return [e.x + q[0], e.y + q[1]]; }, r = (u0, v0, u1, v1) => [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
  const W = e.w / 2, D = e.d / 2, L = Math.min(26, e.w - 7), b0 = -W + 1.5, v1 = D - 1, v0 = v1 - Math.min(8.5, e.d - 3);
  return { body: r(b0, v0, b0 + L, v1), window: [at(b0 + L * 0.3, v0 - 0.6), at(b0 + L * 0.8, v0 - 0.6)], pedestal: r(W - 4, -1.25, W - 1.5, 1.25) };
}
// gas stations: a convenience store facing a canopy over the pump islands (MPDs, multi-product dispensers, two fueling
// positions each, in rows along the canopy), drive lanes round the canopy wide enough to queue at the pumps, the
// underground tanks under a pad the fuel truck pulls up beside, parking along the store front, air / vacuum stalls and a
// car wash tunnel with its stacking lane. Sizes (ft) the layout draws with: an MPD every 30 ft along a row, rows 28 ft
// apart, 26 ft lanes in front of the canopy, 28 behind it (where the store's parking backs out) and 30 at its ends.
// The pump islands run along the street (islands 'along': cars pull through parallel to the street, the default) or
// across it ('across': cars pull in toward the store; an MPD every 24 ft along a row, rows 36 ft deep).
export const FUEL = { pumps: 8, storeSf: 4500, pitch: 30, rowW: 28, pitchX: 24, rowX: 36, lane: 26, back: 28, endLane: 30, washW: 22, washLen: 110, stackW: 12, tankW: 40, tankD: 28, vac: 3, canopyH: 18 };
export const PUMPS = [4, 6, 8, 10, 12, 16];
export const ISLANDS = ['along', 'across'];
// a canopy for so many pumps in so many rows: the pumps along each row, and its size with a 3 ft overhang all round
export function canopyOf(pumps, rows, islands = 'along') { const per = Math.ceil(pumps / rows), x = islands === 'across'; return { pumps, rows, per, islands: x ? 'across' : 'along', w: per * (x ? FUEL.pitchX : FUEL.pitch) + 6, d: rows * (x ? FUEL.rowX : FUEL.rowW) + 6 }; }
// a gas station building's kind: the store or the car wash (older plans: by its name)
export const fuelKind = e => e.fuel || (/wash/i.test(e.name || e.note || '') ? 'wash' : 'store');
// what a plan's gas station holds: pumps and fueling positions, the store and car wash, the canopy, air / vacuum stalls
export function fuelOf(els) {
  const out = { mpds: 0, positions: 0, storeSf: 0, washSf: 0, canopySf: 0, vac: 0, tanks: 0 };
  for (const e of els || []) {
    if (e.kind === 'canopy') { out.mpds += e.pumps || 0; out.canopySf += elArea(e); }
    else if (e.kind === 'tanks') out.tanks++;
    else if (e.kind === 'parking' && e.vac) out.vac += stalls(e).count;
    else if (e.kind === 'building' && e.use === 'fuel') out[fuelKind(e) === 'wash' ? 'washSf' : 'storeSf'] += gfaOfEl(e);
  }
  out.positions = out.mpds * 2; return out;
}
// the average unit and the beds per unit of a mix
export function mixStats(mix) {
  const m = (Array.isArray(mix) && mix.length ? mix : UNIT_MIX).filter(t => +t.pct > 0 && +t.sf > 0), tot = m.reduce((s, t) => s + +t.pct, 0) || 1;
  return { mix: m, avgSf: m.reduce((s, t) => s + t.sf * t.pct, 0) / tot, bedsPer: m.reduce((s, t) => s + (t.beds ?? 1) * t.pct, 0) / tot };
}
// split n units across a mix (largest remainder): [{ name, sf, beds, n }]
export function splitMix(n, mix) {
  const { mix: m } = mixStats(mix), tot = m.reduce((s, t) => s + +t.pct, 0) || 1, raw = m.map(t => n * t.pct / tot), out = m.map((t, i) => ({ ...t, n: Math.floor(raw[i]) }));
  let left = n - out.reduce((s, t) => s + t.n, 0); raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { out[i].n++; left--; } });
  return out;
}
// a front-load duplex parks one car in its garage and one on its driveway apron (25 ft in front of the garage)
export const drivewayOf = e => e.kind === 'building' && e.use === 'duplex' && /front-load/i.test(e.note || '') ? (e.units ?? 1) : 0;
export const STALL = { w: 9, d: 18, aisle: 24 };
export const DRIVE_W = 26;

// ---------- frame: lon/lat <-> feet around an origin ----------
export function frame(origin) {
  const [lon0, lat0] = origin, p = lat0 * RAD;
  const mx = (111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p)) * FT, my = (111132.954 - 559.822 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p)) * FT;
  return { toFt: ([lon, lat]) => [(lon - lon0) * mx, (lat - lat0) * my], toLL: ([x, y]) => [+(lon0 + x / mx).toFixed(8), +(lat0 + y / my).toFixed(8)] };
}

// ---------- polygon basics (open rings) ----------
export const signedArea = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return s / 2; };
export const ringArea = r => Math.abs(signedArea(r));
// (points read by index, not destructured: the hottest loops in a layout, and destructuring slows to a crawl for the rest
// of the run once it has seen points of more than a few array shapes)
export function inRing(p, r) {
  const x = p[0], y = p[1]; let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j], xi = a[0], yi = a[1], xj = b[0], yj = b[1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins; }
  return ins;
}
export function segDist(p, a, b) {
  const px = p[0], py = p[1], ax = a[0], ay = a[1], bx = b[0], by = b[1], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
export function segsCross(a, b, c, d) { const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d); return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)) && d1 && d2 && d3 && d4; }
export const segSeg = (a, b, c, d) => segsCross(a, b, c, d) ? 0 : Math.min(segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b));
export function centroid(r) { // relative to the first point: on raw lon/lat the products cancel and lose ~100 ft
  const [ox, oy] = r[0]; let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0] - ox, yi = r[i][1] - oy, xj = r[j][0] - ox, yj = r[j][1] - oy, f = xj * yi - xi * yj; a += f; cx += (xj + xi) * f; cy += (yj + yi) * f; }
  return a ? [ox + cx / (3 * a), oy + cy / (3 * a)] : r[0];
}
const rot = ([x, y], deg) => { const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD); return [x * c - y * s, x * s + y * c]; };

// tidy a ring: drop the closing point and repeats, Douglas-Peucker at tol feet, counter-clockwise
export function tidyRing(ring, tol = 0.5) {
  let r = ring.filter((p, i) => i === 0 || Math.hypot(p[0] - ring[i - 1][0], p[1] - ring[i - 1][1]) > 0.01);
  if (r.length > 1 && Math.hypot(r[0][0] - r[r.length - 1][0], r[0][1] - r[r.length - 1][1]) < 0.01) r.pop();
  if (r.length < 3) return r;
  // split at the point farthest from the first so the closed ring simplifies as two open chains
  let far = 0, fd = -1; r.forEach((p, i) => { const d = Math.hypot(p[0] - r[0][0], p[1] - r[0][1]); if (d > fd) { fd = d; far = i; } });
  const dp = pts => { if (pts.length < 3) return pts; let k = 0, m = -1; for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i], pts[0], pts[pts.length - 1]); if (d > m) { m = d; k = i; } }
    return m > tol ? dp(pts.slice(0, k + 1)).slice(0, -1).concat(dp(pts.slice(k))) : [pts[0], pts[pts.length - 1]]; };
  r = dp(r.slice(0, far + 1)).slice(0, -1).concat(dp(r.slice(far).concat([r[0]])).slice(0, -1));
  if (signedArea(r) < 0) r.reverse();
  return r;
}

// the plan boundary from a parcel's GeoJSON geometry: the polygon under `at` (else the largest), outer ring only
export function boundaryFrom(geom, at) {
  const polys = geom?.type === 'Polygon' ? [geom.coordinates] : geom?.type === 'MultiPolygon' ? geom.coordinates : [];
  if (!polys.length) return null;
  const llArea = p => ringArea(p[0]);
  const poly = (at && polys.find(p => inRing(at, p[0]))) || polys.slice().sort((a, b) => llArea(b) - llArea(a))[0];
  const c = centroid(poly[0].slice(0, -1).length >= 3 ? poly[0].slice(0, -1) : poly[0]);
  const origin = [+c[0].toFixed(7), +c[1].toFixed(7)], F = frame(origin);
  const ring = tidyRing(poly[0].map(F.toFt), 0.5).map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]);
  return ring.length >= 3 ? { origin, ring } : null;
}

// ---------- several parcels as one site ----------
// Parcels picked together that don't touch: county outlines of neighbours often leave a gap between them (slivers,
// lines drawn a few feet apart), or a road, a ditch or a strip of someone else's land runs between them. Each group of
// touching parcels is joined to the nearest other group across the gap (up to maxFt) by the strip between their facing
// sides, so every parcel picked is in the one site, and gaps up to FILL_FT are closed between every pair of parcels (no
// slit left into the site). A strip with a mapped road in it (roads: lon/lat lines, from the map) stays a road: it comes
// back with road: true to be kept as a no-build area; any other strip is filled in as part of the site.
// Groups farther apart than maxFt aren't joined (unionParcels then keeps the biggest group and says some were left out).
// Returns { geoms: the parcels then the strips (for unionParcels), strips: [{ ll: the strip's lon/lat ring (the open ground
// between the two, without the parcels), gapFt, road }] }.
export const BRIDGE_FT = 200; // farthest apart two parcels can be and still be joined (a road with its ditches, an easement)
export const FILL_FT = 40; // a gap this narrow between parcels that are already joined another way is closed too
export function bridgeParcels(geoms, { gapFt = 6, maxFt = BRIDGE_FT, roads = null } = {}) {
  const rings = []; for (const g of geoms || []) for (const p of g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : []) if (p[0]?.length >= 4) rings.push(p[0]);
  if (rings.length < 2) return { geoms: geoms || [], strips: [] };
  const all = rings.flat(), F = frame([all.reduce((s, p) => s + p[0], 0) / all.length, all.reduce((s, p) => s + p[1], 0) / all.length]);
  const ft = rings.map(r => { const q = r.map(F.toFt); return q.length > 3 && Math.hypot(q[0][0] - q[q.length - 1][0], q[0][1] - q[q.length - 1][1]) < 0.01 ? q.slice(0, -1) : q; });
  const box = ft.map(r => [Math.min(...r.map(p => p[0])), Math.min(...r.map(p => p[1])), Math.max(...r.map(p => p[0])), Math.max(...r.map(p => p[1]))]);
  const toPoly = (p, r) => r.reduce((m, a, i) => Math.min(m, segDist(p, a, r[(i + 1) % r.length])), Infinity);
  const ringDist = (a, b) => { let m = Infinity; for (let i = 0; i < a.length; i++) for (let k = 0; k < b.length; k++) m = Math.min(m, segSeg(a[i], a[(i + 1) % a.length], b[k], b[(k + 1) % b.length])); return m; };
  const grp = ft.map((_, i) => i), root = i => grp[i] === i ? i : (grp[i] = root(grp[i])), pairs = [];
  for (let i = 0; i < ft.length; i++) for (let k = i + 1; k < ft.length; k++) {
    const A = box[i], B = box[k]; if (Math.max(A[0] - B[2], B[0] - A[2], A[1] - B[3], B[1] - A[3]) > maxFt) continue;
    const d = ringDist(ft[i], ft[k]); if (d <= gapFt) grp[root(i)] = root(k); else if (d <= maxFt) pairs.push([d, i, k]);
  }
  // the boundary of a, every few feet, where it lies within `tol` of b
  const near = (a, b, tol) => { const out = [], per = a.reduce((s, p, i) => s + Math.hypot(a[(i + 1) % a.length][0] - p[0], a[(i + 1) % a.length][1] - p[1]), 0), step = Math.max(4, per / 3000);
    for (let i = 0; i < a.length; i++) { const p = a[i], q = a[(i + 1) % a.length], n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / step));
      for (let j = 0; j < n; j++) { const s = [p[0] + (q[0] - p[0]) * j / n, p[1] + (q[1] - p[1]) * j / n]; if (toPoly(s, b) <= tol) out.push(s); } }
    return out; };
  const hull = pts => { const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), lo = [], up = [];
    for (const p of P) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of P.reverse()) { while (up.length > 1 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1)); };
  // a road in the strip: 20 ft or more of a mapped road's line inside it
  const roadFt = (roads || []).map(l => l.map(F.toFt)).filter(l => l.length > 1);
  const roadIn = h => { const b = [Math.min(...h.map(p => p[0])), Math.min(...h.map(p => p[1])), Math.max(...h.map(p => p[0])), Math.max(...h.map(p => p[1]))]; let n = 0;
    for (const l of roadFt) for (let i = 1; i < l.length; i++) { const a = l[i - 1], c = l[i]; if (Math.max(a[0], c[0]) < b[0] || Math.min(a[0], c[0]) > b[2] || Math.max(a[1], c[1]) < b[1] || Math.min(a[1], c[1]) > b[3]) continue;
      const m = Math.max(1, Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / 10)); for (let j = 0; j <= m; j++) if (inRing([a[0] + (c[0] - a[0]) * j / m, a[1] + (c[1] - a[1]) * j / m], h) && ++n >= 3) return true; }
    return false; };
  // the strip less the parcels (the hull reaches a few feet into them along their ends)
  const cut = (h, rs) => { const cl = r => r.concat([r[0]]); try { return polyclip.difference([cl(h)], ...rs.map(r => [cl(r)])).map(pg => pg[0].slice(0, -1)).filter(r => r.length >= 3); } catch (e) { return [h]; } };
  const sum = l => l.reduce((t, r) => t + ringArea(r), 0);
  const strips = [];
  for (const [d, i, k] of pairs.sort((a, b) => a[0] - b[0])) { // nearest first: a strip for each pair of groups joined (a spanning tree), and every narrow gap
    const joined = root(i) === root(k); if (joined && d > FILL_FT) continue;
    const h = hull(near(ft[i], ft[k], d + 15).concat(near(ft[k], ft[i], d + 15)));
    if (h.length < 3 || ringArea(h) < 50) continue;
    const gap = cut(h, [ft[i], ft[k]]).sort((a, b) => ringArea(b) - ringArea(a)); if (!gap.length || ringArea(gap[0]) < 50) continue;
    if (joined && sum(cut(h, ft)) < 0.5 * sum(gap)) continue; // the land between is mostly a parcel picked already (two lots with a third between them)
    const road = roadIn(gap[0]); if (joined && road) continue; // already in the site another way: the road stays out of it
    grp[root(i)] = root(k);
    const ll = gap[0].map(F.toLL), hl = h.map(F.toLL); strips.push({ ll: ll.concat([ll[0]]), hull: hl.concat([hl[0]]), gapFt: Math.round(d), road });
  }
  return { geoms: (geoms || []).concat(strips.map(s => ({ type: 'Polygon', coordinates: [s.hull] }))), strips: strips.map(({ hull, ...s }) => s) };
}
// Appraisal parcels rarely share their lines exactly (gaps and overlaps of a few feet, slivers), so a plain polygon
// union leaves holes and spikes. Instead: paint every parcel on a fine grid, close gaps narrower than `gapFt` (a road
// right-of-way is far wider and stays open), fill holes, trace the outline of the biggest piece, simplify it and snap
// its corners back onto the parcels' own corners. Returns { origin, ring, pieces, areaParcels } (pieces > 1: some
// parcels don't touch the rest and were left out).
export function unionParcels(geoms, gapFt = 6) {
  const rings = []; for (const g of geoms || []) for (const p of g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : []) if (p[0]?.length >= 4) rings.push(p[0]);
  if (!rings.length) return null;
  if (rings.length === 1) { const b = boundaryFrom({ type: 'Polygon', coordinates: [rings[0]] }); return b && { ...b, pieces: 1, areaParcels: ringArea(b.ring) }; }
  const all = rings.flat(), F00 = frame(centroid(all.map(p => [p[0], p[1]])));
  // parcels far apart can't be one site: group the ones whose boxes come within the gap, keep the biggest group
  const box = rings.map(r => { const q = r.map(F00.toFt), x = q.map(p => p[0]), y = q.map(p => p[1]); return [Math.min(...x) - gapFt, Math.min(...y) - gapFt, Math.max(...x) + gapFt, Math.max(...y) + gapFt, ringArea(q)]; });
  const grp = rings.map((_, i) => i), root = i => grp[i] === i ? i : (grp[i] = root(grp[i]));
  for (let i = 0; i < rings.length; i++) for (let k = i + 1; k < rings.length; k++) if (box[i][0] < box[k][2] && box[k][0] < box[i][2] && box[i][1] < box[k][3] && box[k][1] < box[i][3]) grp[root(i)] = root(k);
  const tot = new Map(); rings.forEach((_, i) => tot.set(root(i), (tot.get(root(i)) || 0) + box[i][4]));
  const keep = [...tot].sort((a, b) => b[1] - a[1])[0][0], groups = tot.size, mine = rings.filter((_, i) => root(i) === keep);
  if (mine.length === 1) { const b = boundaryFrom({ type: 'Polygon', coordinates: [mine[0]] }); return b && { ...b, pieces: groups, areaParcels: ringArea(b.ring) }; }
  const o0 = centroid(mine.flat().map(p => [p[0], p[1]])), F0 = frame(o0);
  const ft = mine.map(r => tidyRing(r.map(F0.toFt), 0.05));
  const areaParcels = ft.reduce((s, r) => s + ringArea(r), 0), xs = ft.flat().map(p => p[0]), ys = ft.flat().map(p => p[1]);
  const span = (Math.max(...xs) - Math.min(...xs) + 2 * gapFt) * (Math.max(...ys) - Math.min(...ys) + 2 * gapFt);
  const c = Math.max(0.5, Math.min(3, Math.sqrt(areaParcels) / 700), Math.sqrt(span / 4e6)), pad = Math.ceil(gapFt / c) + 2; // at most ~4 million cells
  const X0 = Math.min(...xs) - pad * c, Y0 = Math.min(...ys) - pad * c, nx = Math.ceil((Math.max(...xs) - X0) / c) + pad, ny = Math.ceil((Math.max(...ys) - Y0) / c) + pad;
  let M = new Uint8Array(nx * ny);
  for (const r of ft) for (let j = 0; j < ny; j++) { // scanline fill
    const y = Y0 + (j + 0.5) * c, hits = [];
    for (let i = 0, k = r.length - 1; i < r.length; k = i++) { const [x1, y1] = r[k], [x2, y2] = r[i]; if ((y1 > y) !== (y2 > y)) hits.push(x1 + (y - y1) * (x2 - x1) / (y2 - y1)); }
    hits.sort((a, b) => a - b);
    for (let h = 0; h + 1 < hits.length; h += 2) for (let i = Math.max(0, Math.ceil((hits[h] - X0) / c - 0.5)); i < nx && X0 + (i + 0.5) * c <= hits[h + 1]; i++) M[j * nx + i] = 1;
  }
  const k = Math.max(1, Math.round(gapFt / 2 / c)); // close: grow by half the gap, then shrink back
  const grow = (A, val) => { const B = new Uint8Array(A.length), T = new Uint8Array(A.length);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let v = !val; for (let d = -k; d <= k && v !== val; d++) { const x = i + d; if (x >= 0 && x < nx && A[j * nx + x] === +val) v = val; } T[j * nx + i] = +v; }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let v = !val; for (let d = -k; d <= k && v !== val; d++) { const y = j + d; if (y >= 0 && y < ny && T[y * nx + i] === +val) v = val; } B[j * nx + i] = +v; }
    return B; };
  M = grow(grow(M, true), false);
  // pieces (4-connected); keep the biggest, fill its holes
  const lab = new Int32Array(nx * ny), sizes = [0]; let id = 0;
  for (let s0 = 0; s0 < nx * ny; s0++) if (M[s0] && !lab[s0]) { id++; let n = 0; const st = [s0]; lab[s0] = id;
    while (st.length) { const q = st.pop(); n++; const i = q % nx, j = (q - i) / nx; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = i + di, y = j + dj; if (x < 0 || y < 0 || x >= nx || y >= ny) continue; const t = y * nx + x; if (M[t] && !lab[t]) { lab[t] = id; st.push(t); } } }
    sizes.push(n); }
  const big = sizes.indexOf(Math.max(...sizes)), pieces = sizes.filter(n => n * c * c > 2000).length + groups - 1;
  const out = new Uint8Array(nx * ny), st = []; // outside = reachable from the border without crossing the piece
  for (let i = 0; i < nx; i++) st.push(i, (ny - 1) * nx + i); for (let j = 0; j < ny; j++) st.push(j * nx, j * nx + nx - 1);
  while (st.length) { const q = st.pop(); if (out[q] || lab[q] === big) continue; out[q] = 1; const i = q % nx, j = (q - i) / nx; if (i > 0) st.push(q - 1); if (i < nx - 1) st.push(q + 1); if (j > 0) st.push(q - nx); if (j < ny - 1) st.push(q + nx); }
  const inn = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && !out[j * nx + i];
  // trace the outline along cell edges, counter-clockwise (inside on the left)
  const next = new Map(), key = (x, y) => x + ',' + y;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (inn(i, j)) {
    if (!inn(i, j - 1)) next.set(key(i, j), [i + 1, j]); if (!inn(i + 1, j)) next.set(key(i + 1, j), [i + 1, j + 1]);
    if (!inn(i, j + 1)) next.set(key(i + 1, j + 1), [i, j + 1]); if (!inn(i - 1, j)) next.set(key(i, j + 1), [i, j]);
  }
  let best = [];
  const seen = new Set();
  for (const [k0] of next) { if (seen.has(k0)) continue; const loop = []; let kk = k0;
    while (!seen.has(kk) && next.has(kk)) { seen.add(kk); const [x, y] = kk.split(',').map(Number); loop.push([X0 + x * c, Y0 + y * c]); const nn = next.get(kk); kk = key(nn[0], nn[1]); }
    if (loop.length > best.length) best = loop; }
  if (best.length < 4) return null;
  // simplify the staircase, then snap corners onto the parcels' own corners
  let r = tidyRing(best, c * 1.2);
  const corners0 = ft.flat();
  r = r.map(p => { let q = p, d = c * 2.2; for (const v of corners0) { const e = Math.hypot(v[0] - p[0], v[1] - p[1]); if (e < d) { d = e; q = v; } } return q; });
  r = tidyRing(r, 0.3);
  const ll = r.map(F0.toLL), b = boundaryFrom({ type: 'Polygon', coordinates: [ll.concat([ll[0]])] }, null);
  return b && { ...b, pieces, areaParcels };
}

// ---------- edges: front / side / rear ----------
const outward = (r, i) => { const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[1] - a[1]) / L, -(b[0] - a[0]) / L]; };
export const edgeLen = (r, i) => { const a = r[i], b = r[(i + 1) % r.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]); };
export const longestEdge = r => r.reduce((best, _, i) => edgeLen(r, i) > edgeLen(r, best) ? i : best, 0);
// An edge facing the same way as the front is front too only where it is a jog in the frontage (within FRONT_JOG ft of the
// street line): the shoulder of a flag lot, far back behind its strip to the road, borders a neighbour, not the street.
export const FRONT_JOG = 60;
export function edgeRoles(ring, front) {
  const f = front != null && front < ring.length ? front : longestEdge(ring), nf = outward(ring, f), a0 = ring[f];
  const back = p => (a0[0] - p[0]) * nf[0] + (a0[1] - p[1]) * nf[1]; // how far behind the street line
  return ring.map((_, i) => { if (i === f) return 'front'; const n = outward(ring, i), dot = n[0] * nf[0] + n[1] * nf[1], b = ring[(i + 1) % ring.length];
    return dot > 0.8 ? (Math.max(back(ring[i]), back(b)) <= FRONT_JOG ? 'front' : 'side') : dot < -0.5 ? 'rear' : 'side'; });
}
// the edge nearest a point (feet), for "pick the street side"
export function nearestEdge(ring, p) { let best = 0, bd = Infinity; ring.forEach((a, i) => { const d = segDist(p, a, ring[(i + 1) % ring.length]); if (d < bd) { bd = d; best = i; } }); return best; }
// side streets: the other edges with a road just outside them (within 120 ft), e.g. a corner lot's side street
// a side street: a road running along the lot line (within about 30° of it), close outside it (its centre line within
// 90 ft), for most of the edge's length. A road that only crosses near a corner, runs off at an angle, or is a driveway
// (service roads are left out by the caller) doesn't make one; short jogs in the lot line (under 100 ft) never do.
export function streetsFromRoads(ring, roads, front) {
  const out = [];
  ring.forEach((a, i) => {
    if (i === front) return; const b = ring[(i + 1) % ring.length], L = edgeLen(ring, i); if (L < 100) return;
    const n = outward(ring, i), t = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], pts = [0.2, 0.4, 0.6, 0.8].map(f => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    const near = m => roads.some(line => line.some((_, k) => { if (!k) return false; const p0 = line[k - 1], p1 = line[k], sl = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1, along = Math.abs(((p1[0] - p0[0]) * t[0] + (p1[1] - p0[1]) * t[1]) / sl);
      const q = closest(m, p0, p1), out0 = (q[0] - m[0]) * n[0] + (q[1] - m[1]) * n[1]; return along > 0.86 && out0 > 5 && Math.hypot(q[0] - m[0], q[1] - m[1]) < 90; }));
    if (pts.filter(near).length >= 3) out.push(i); // along most of the edge, not just past a corner
  });
  return out;
}
// how much a road counts toward being the site's front: highways and arterials over local streets (OpenMapTiles classes)
export const roadRank = cls => ({ motorway: 3, trunk: 3, primary: 3, secondary: 2.5, tertiary: 2, minor: 1 }[cls] || 1);
// the street side from road centre lines near the lot (lines in feet): the edge that faces the nearest road, weighted to
// long edges. Returns null when no road comes within 250 ft.
export function frontFromRoads(ring, roads) {
  let best = null, bs = Infinity;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length], L = edgeLen(ring, i); if (L < 20) return;
    const n = outward(ring, i), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let d = Infinity, rk = 1;
    for (const line of roads) for (let k = 1; k < line.length; k++) {
      const q = closest(m, line[k - 1], line[k]);
      if ((q[0] - m[0]) * n[0] + (q[1] - m[1]) * n[1] > -5) { const dd = Math.hypot(q[0] - m[0], q[1] - m[1]); if (dd < d) { d = dd; rk = line.rank || 1; } } // roads on this edge's outer side only
    }
    const s = d - Math.min(L, 300) * 0.15 - (rk - 1) * 45; // a highway or arterial alongside wins over a back street a little nearer
    if (d < 250 && s < bs) { bs = s; best = i; }
  });
  return best;
}
const closest = ([px, py], [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0; return [ax + t * dx, ay + t * dy]; };

// required distances per edge: buildings keep the setback for the edge's role, paving keeps the landscape buffer
// streets: other edges along a street (a corner lot's side street): the street setback (`street`, else the front one),
// the front buffer, and a drive may cross them
export function edgeRules(ring, front, sb = SETBACKS, streets = null) {
  if (Array.isArray(sb?.edges) && sb.edges.length === ring.length) return sb.edges.map(r => ({ ...r })); // a pod's own rules, edge by edge (lib/sitepods.mjs: only a pod's plan carries them)
  const S = { ...SETBACKS, ...(sb || {}) }, st = new Set(streets || []);
  const R = { front: 'paveFront', side: 'paveSide', rear: 'paveRear' };
  return edgeRoles(ring, front).map((role, k) => st.has(k) && role !== 'front' ? { role, street: true, build: S.buildOn === false ? 0 : +(S.street ?? S.front) || 0, pave: S.paveOn === false ? 0 : +(S.paveFront ?? S.paving) || 0 }
    : { role, build: S.buildOn === false ? 0 : +S[role] || 0, pave: S.paveOn === false ? 0 : +(S[R[role]] ?? S.paving) || 0 });
}
// the line the setbacks make, for drawing (mitred offset; fine for display, the checks use exact distances)
export function insetRing(ring, dists) {
  const n = ring.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n, a = outward(ring, p), b = outward(ring, i), da = dists[p], db = dists[i], v = ring[i];
    const det = a[0] * b[1] - a[1] * b[0];
    let q;
    if (Math.abs(det) < 1e-6) q = [v[0] - b[0] * db, v[1] - b[1] * db];
    else { // solve n_a·(q - v) = -da, n_b·(q - v) = -db
      const ox = (-da * b[1] + db * a[1]) / det, oy = (-db * a[0] + da * b[0]) / det;
      const L = Math.hypot(ox, oy), cap = 4 * Math.max(da, db, 1);
      q = L > cap ? [v[0] + ox / L * cap, v[1] + oy / L * cap] : [v[0] + ox, v[1] + oy];
    }
    out.push(q);
  }
  // short curve segments with different setbacks either side make mitre spikes: drop points that break a setback
  const ok = out.filter(q => inRing(q, ring) && ring.every((a, k) => segDist(q, a, ring[(k + 1) % n]) >= dists[k] - 0.5));
  return ok.length >= 3 ? ok : out;
}

// ---------- elements ----------
export function corners(e) {
  return [[-e.w / 2, -e.d / 2], [e.w / 2, -e.d / 2], [e.w / 2, e.d / 2], [-e.w / 2, e.d / 2]].map(p => { const q = rot(p, e.rot || 0); return [e.x + q[0], e.y + q[1]]; });
}
// ---------- local edits: a moved piece makes room for itself, nothing else moves ----------
// cut the stalls a shape covers out of the straight parking rows (each row splits into what's left either side, whole
// stalls only). pad: clearance kept round the shape. lost: rows cut away whole are added to it (to grow back later).
// Returns the new element list.
export function cutRows(els, shape, pad = 0, lost = null) {
  const out = [];
  for (const e of els) {
    if (e.kind !== 'parking' || isFree(e)) { out.push(e); continue; }
    const along = e.w >= e.d, L = along ? e.w : e.d, D = along ? e.d : e.w, r = (e.rot || 0) + (along ? 0 : 90);
    const loc = shape.map(p => rot([p[0] - e.x, p[1] - e.y], -r)), us = [];
    for (let i = 0; i < loc.length; i++) { // the part of the shape's outline within the row's depth (plus pad)
      const a = loc[i], b = loc[(i + 1) % loc.length], h = D / 2 + pad;
      if (Math.abs(a[1]) <= h) us.push(a[0]);
      for (const y of [-h, h]) if ((a[1] - y) * (b[1] - y) < 0) us.push(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]));
    }
    if (inRing([e.x, e.y], shape)) us.push(0);
    if (!us.length) { out.push(e); continue; }
    const lo = Math.min(...us) - pad, hi = Math.max(...us) + pad, sw = e.sw || STALL.w;
    if (hi <= -L / 2 || lo >= L / 2) { out.push(e); continue; }
    const { id, ...rest } = e; let first = true, kept = 0;
    for (const [a, b] of [[-L / 2, lo], [hi, L / 2]]) {
      const len = Math.floor((b - a) / sw + 1e-6) * sw; if (len < sw * 2) continue;
      const mid = a === -L / 2 ? a + len / 2 : b - len / 2, q = rot([mid, 0], r), piece = { ...rest, ext: e.ext || { x: e.x, y: e.y, w: e.w, d: e.d, rot: e.rot || 0 }, x: +(e.x + q[0]).toFixed(2), y: +(e.y + q[1]).toFixed(2), ...(along ? { w: len } : { d: len }) };
      if (first && id != null) piece.id = id; first = false; out.push(piece); kept++; // the first piece keeps the row's id
    }
    if (!kept && lost) lost.push({ ...e, ext: e.ext || { x: e.x, y: e.y, w: e.w, d: e.d, rot: e.rot || 0 } });
  }
  return out;
}
// parking a moved piece cut and has since left: rows grow back to their length before any cut (`ext`), round
// whatever stands on them now. Only rows whose original length meets `area` are redone. spare: rows cut away whole
// (from cutRows' lost); one that grows back leaves the list, and one already back on the plan (an undo) is skipped.
export function regrowRows(els, area, pad = 5, spare = null) {
  const groups = new Map(), key = x => [x.x, x.y, x.w, x.d, x.rot || 0].map(v => Math.round(v * 10)).join();
  for (const e of els) if (e.kind === 'parking' && e.ext && !isFree(e)) { const k = key(e.ext); (groups.get(k) || groups.set(k, []).get(k)).push(e); }
  const seeds = new Map();
  for (const sp of spare || []) { const k = key(sp.ext), xs = corners({ ...sp.ext, kind: 'parking' }); if (groups.has(k) || els.some(e => e.kind === 'parking' && rectsOverlap({ poly: xs }, e, 2))) continue; const seed = { ...sp, w: 0, d: 0 }; groups.set(k, [seed]); seeds.set(seed, sp); }
  if (!groups.size) return els;
  const hard = els.filter(e => ['building', 'garage', 'pool', 'plaza', 'patio', 'court', 'play', 'pond', 'trash'].includes(e.kind) || isPark(e)).map(e => ({ s: outline(e), pad: e.kind === 'building' || e.kind === 'garage' ? pad : 1 })).map(o => ({ ...o, b: boxOfPts(o.s) }));
  const redo = new Map();
  for (const [k, pieces] of groups) {
    const x = pieces[0].ext, xs = corners({ ...x, kind: 'parking' }); if (!rectsOverlap({ poly: xs }, { poly: area }, -pad)) continue;
    const { id, ...rest } = pieces.find(q => q.id != null) || pieces[0]; let got = [{ ...rest, ...x, id, ext: x }]; const bx = boxOfPts(xs);
    for (const o of hard) if (o.b[0] < bx[2] + o.pad && o.b[2] > bx[0] - o.pad && o.b[1] < bx[3] + o.pad && o.b[3] > bx[1] - o.pad) got = cutRows(got, o.s, o.pad);
    redo.set(pieces[0], got); for (const q of pieces.slice(1)) redo.set(q, []);
  }
  const grown = [];
  for (const [seed, sp] of seeds) if (redo.has(seed)) { grown.push(...redo.get(seed)); if (redo.get(seed).length) spare.splice(spare.indexOf(sp), 1); }
  return els.flatMap(e => redo.has(e) ? redo.get(e) : [e]).concat(grown);
}
// what goes with a piece when it's moved: a clubhouse's pool deck and pool, a restaurant's patio and drive-thru lane,
// a home's driveway; a pool deck takes its pool; an entrance its median and signs
export function attachedTo(plan, e) {
  const els = plan.elements || [], me = shapeOf(e), mb = boxOfPts(me), out = new Set(), near = (o, g) => { const b = boxOfPts(shapeOf(o)); return b[0] <= mb[2] + g && b[2] >= mb[0] - g && b[1] <= mb[3] + g && b[3] >= mb[1] - g && gapBetween(shapeOf(o), me) <= g; };
  if (e.kind === 'building' || e.kind === 'garage') for (const o of els) {
    if (o === e || o.id === e.id) continue;
    if (o.kind === 'plaza' && /pool deck/i.test(o.note || '') && near(o, 3) || o.kind === 'patio' && near(o, 3) || o.kind === 'plaza' && o.note === 'Driveway' && near(o, 2) || o.kind === 'drive' && o.note === 'Drive-thru lane' && near(o, 25) || o.kind === 'pool' && near(o, 3)) out.add(o);
  }
  for (const d of [e, ...out].filter(d => d.kind === 'plaza' && /pool deck/i.test(d.note || ''))) { const ds = shapeOf(d); for (const o of els) if (o.kind === 'pool' && o !== e && gapBetween(shapeOf(o), ds) === 0) out.add(o); }
  if (isEntrance(e)) for (const o of entryParts(plan, e)) out.add(o); // an entrance: its median and monument signs
  return [...out];
}
// where a dragged building can sit: the nearest spot to where it was let go that's clear of drives (a walk's width
// off them), other buildings, ponds and amenities, and inside the setbacks. Parking may lie under it (the stalls give
// way). `carry`: the pieces that move with it, which must be clear too. Returns [dx, dy] to add, or null when nothing
// within reach is clear (it then stays where it was let go and the checks flag the overlap).
export function spotObstacles(plan, e, carry = [], kinds = null) {
  const skip = new Set([e, ...carry].map(x => x.id).filter(x => x != null)), gap = { drive: 8, truck: 8, building: 15, garage: 15, pond: 10, pool: 6, plaza: 6, court: 6, play: 6, patio: 4, trash: 4, keepout: 2 };
  return (plan.elements || []).filter(o => o !== e && !carry.includes(o) && !skip.has(o.id) && gap[o.kind] != null && (!kinds || kinds.includes(o.kind))).map(o => { const s = shapeOf(o); return { s, b: boxOfPts(s), g: gap[o.kind], o }; });
}
// what a park or an amenity placed among homes stays clear of: drives (8 ft), buildings other than homes on lots (15),
// ponds, amenities, easements, other parks (4). Homes, their driveways and lots aren't in the way: they make way
// (homesUnder). The clear space is part of each outline (the spot search only tests for overlap): a park flush against
// a street had the re-fit cut or move the street to keep its own margin round the park. was: the outline it has where
// it stands (a park dragged, resized or turned): what stands wholly in it there is its own (a food truck park's pavilion
// on its lawn), and it keeps no more room from the rest than it had (a park against its street slides along it)
export function placeObs(plan, e, carry = [], was = null) {
  const home = o => o.kind === 'building' && HOME_USES.includes(o.use) || o.kind === 'plaza' && o.note === 'Driveway', skip = new Set([e, ...carry].map(x => x.id).filter(x => x != null));
  const parks = (plan.elements || []).filter(o => o !== e && !carry.includes(o) && !skip.has(o.id) && isPark(o)).map(o => ({ s: shapeOf(o), g: 4, o }));
  const wb = was && boxOfPts(was), room = x => { if (!was) return x.g; const b = boxOfPts(x.s); return b[0] > wb[2] + x.g || b[2] < wb[0] - x.g || b[1] > wb[3] + x.g || b[3] < wb[1] - x.g ? x.g : Math.min(x.g, Math.max(0, gapBetween(was, x.s) - 0.5)); };
  return spotObstacles(plan, e, carry).filter(x => !home(x.o)).concat(parks).filter(x => !was || !x.s.every(p => inRing(p, was))).map(x => { const g = room(x), s = g > 0 ? offsetRing(x.s, g) : x.s; return { s, b: boxOfPts(s), g: 0.5, o: x.o }; });
}
// a park that holds the plan's own buildings or food trucks (a food truck park's lawn round its pavilion, bar and
// restrooms): the ground they stand on, laid out again with them, not land a re-fit keeps off
export const isCommons = (els, g) => { if (!isPark(g)) return false; const s = shapeOf(g); return (els || []).some(o => (o.kind === 'building' && !HOME_USES.includes(o.use) || o.kind === 'foodtruck') && inRing(centroid(shapeOf(o)), s)); };
// what makes way for a piece placed among homes: the homes under it (and pad ft round it), their driveways, and their
// lots (and any lot whose middle is under the piece). Returns a Set of pieces. (A park's margin is square off its sides:
// grow() moves a rectangle's sides in only about 0.7 of it, and homes 3 ft off a park stayed; a building keeps the
// margin it always had.)
export function homesUnder(plan, e, pad = 12) {
  const els = plan.elements || [], me = shapeOf(e), zone = isPark(e) ? offsetRing(me, pad) : grow(me, pad), zb = boxOfPts(zone), out = new Set();
  const hit = els.filter(h => h !== e && h.kind === 'building' && HOME_USES.includes(h.use) && (b => b[0] < zb[2] && b[2] > zb[0] && b[1] < zb[3] && b[3] > zb[1])(boxOfPts(shapeOf(h))) && rectsOverlap({ poly: shapeOf(h) }, { poly: zone }, 0));
  for (const h of hit) { out.add(h); for (const a of attachedTo(plan, h)) out.add(a); const c = centroid(shapeOf(h)); for (const l of els) if (l.kind === 'lot' && inRing(c, shapeOf(l))) out.add(l); }
  for (const l of els) if (l.kind === 'lot' && !out.has(l) && inRing(centroid(shapeOf(l)), me)) out.add(l);
  return out;
}
const HOME_USES = ['sfr', 'townhomes', 'duplex'];
// the lots of the homes that stay, cut back off a park laid over their back yards (their lot lines don't run across
// it); a sliver left goes (homesUnder has taken the homes near it, and the lots whose middle it covers)
export function trimLots(els, e) {
  const me = shapeOf(e), mb = boxOfPts(me), cc = r => signedArea(r) >= 0 ? r : r.slice().reverse(), cl = r => r.concat([r[0]]);
  return els.flatMap(l => {
    if (l.kind !== 'lot') return [l]; const s = shapeOf(l), b = boxOfPts(s);
    if (!(b[0] < mb[2] - 0.5 && b[2] > mb[0] + 0.5 && b[1] < mb[3] - 0.5 && b[3] > mb[1] + 0.5)) return [l];
    let left; try { left = polyclip.difference([cl(cc(s))], [cl(cc(me))]).map(pp => pp[0].slice(0, -1)).sort((x, y) => ringArea(y) - ringArea(x)); } catch { return [l]; }
    if (left.reduce((t, r) => t + ringArea(r), 0) > ringArea(s) - 2) return [l]; // (touching, or a sliver)
    const r = left[0]; if (!r || ringArea(r) < 400) return [];
    const c = centroid(r); return [{ ...l, poly: r.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]), x: +c[0].toFixed(2), y: +c[1].toFixed(2) }];
  });
}
export function clearSpot(plan, e, { carry = [], obs, reach } = {}) {
  const ring = plan.ring || []; if (ring.length < 3) return [0, 0];
  const rules = edgeRules(ring, plan.front, plan.setbacks, plan.streets);
  const pieces = [{ s: shapeOf(e), back: k => e.kind === 'green' ? 0 : e.kind === 'pond' ? Math.min(5, rules[k].pave) : rules[k].build }, ...carry.map(c => ({ s: shapeOf(c), back: k => c.kind === 'green' || c.kind === 'lot' ? 0 : c.kind === 'pond' || c.kind === 'play' ? Math.min(5, rules[k].pave) : rules[k].pave }))] /* what it carries keeps out of the landscape buffers */, R = reach ?? Math.max(e.w || 0, e.d || 0) * 0.6 + 30;
  const all = boxOfPts(pieces.flatMap(p => p.s)), O = (obs || spotObstacles(plan, e, carry)).filter(o => o.b[0] < all[2] + R + o.g && o.b[2] > all[0] - R - o.g && o.b[1] < all[3] + R + o.g && o.b[3] > all[1] - R - o.g); // only what's within reach
  const ok = (dx, dy) => pieces.every(({ s, back }) => {
    const q = s.map(([x, y]) => [x + dx, y + dy]), b = boxOfPts(q);
    if (!q.every(p => inRing(p, ring)) || ring.some((a, k) => { const need = back(k); return need > 0 && q.some(p => segDist(p, a, ring[(k + 1) % ring.length]) < need - 0.5); })) return false;
    return !O.some(o => o.b[0] < b[2] + o.g && o.b[2] > b[0] - o.g && o.b[1] < b[3] + o.g && o.b[3] > b[1] - o.g && rectsOverlap({ poly: q }, { poly: o.s }, -o.g + 0.5));
  });
  if (ok(0, 0)) return [0, 0];
  const r0 = (e.rot || 0) * Math.PI / 180, dirs = [];
  for (let k = 0; k < 16; k++) { const t = r0 + k * Math.PI / 8; dirs.push([Math.cos(t), Math.sin(t), k % 4 ? 1.15 : 1]); } // along its own sides first
  const cand = []; for (let r = 2; r <= R; r += 2) for (const [cx, cy, w] of dirs) cand.push([cx * r, cy * r, r * w]);
  cand.sort((a, b) => a[2] - b[2]);
  for (const [dx, dy] of cand) if (ok(dx, dy)) return [+dx.toFixed(2), +dy.toFixed(2)];
  return null;
}
// ---------- entrances ----------
// a driveway in from the street at p (plan feet, on or near a lot line): straight in, square to the lot line, to the
// nearest drive, with curb returns at the street. Slid along the lot line (up to `slide` ft) when a building, pond or
// amenity is in the way; its curb returns kept off the lot's corners. Returns { poly, edge, at, depth } or null. A park,
// lawn or open space is in the way too (a boulevard's median isn't). why: filled with what stood in the way at the spot
// asked ({ hit: the piece }), so the caller can say what it was. Also R, u, n (its curb returns, along the street, in
// from it), and cl (its centre line) when it turns to meet the drive square (below); straight: never turned (blvdAt: a
// boulevard whose median has no room past the turn).
// A driveway meets the street square (90°) and the drive it serves square too. Where the two aren't parallel (a street
// slanting across the layout's grid) it leaves the street square for its curb returns and a few feet more, then curves
// round (radius 40 ft or more on its centre line) to run square into the drive. Drawn straight from the street to the
// drive, it met one of them crooked, its curb returns lopsided or its end sticking out past the drive.
export const ENTRY_TURN = { min: 2, max: 40 }; // degrees: under min it's straight in; over max a turn that sharp isn't drawn
// a driveway's outline from its centre line: path[0] on the street line (u along it, n in from it), its first stretch
// square to the street for more than R ft (curb returns of radius R, tangent to the street and to its sides), then on
// along the path, half-width h, the inner end square to its last stretch; 1 ft over the street line
export function drivewayOutline(path, u, n, h, R) {
  const P0 = path[0], at = (v, s) => [+(P0[0] + n[0] * v + u[0] * s).toFixed(2), +(P0[1] + n[1] * v + u[1] * s).toFixed(2)];
  const sg = n[1] * u[0] - n[0] * u[1] >= 0 ? 1 : -1, rh = d => [sg * d[1], -sg * d[0]]; // (rh: the +u hand of a direction)
  const cl = [[P0[0] + n[0] * R, P0[1] + n[1] * R], ...path.slice(1)], m = cl.length - 1, unit = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
  const side = s => cl.map((p, i) => {
    const d1 = unit(i ? cl[i - 1] : p, i ? p : cl[1]), d2 = i < m ? unit(p, cl[i + 1]) : d1, r1 = rh(d1), r2 = rh(d2), bx = r1[0] + r2[0], by = r1[1] + r2[1], bl = Math.hypot(bx, by) || 1, k = 1 / Math.max(0.5, (bx * r1[0] + by * r1[1]) / bl); // (mitred)
    return [+(p[0] + bx / bl * s * k).toFixed(2), +(p[1] + by / bl * s * k).toFixed(2)];
  });
  const out = [at(-1, -h - R), at(-1, h + R)];
  for (let g = 1; g <= 6; g++) { const th = g / 6 * Math.PI / 2; out.push(at(R - R * Math.cos(th), h + R - R * Math.sin(th))); }
  out.push(...side(h).slice(1), ...side(-h).reverse().slice(0, -1));
  for (let g = 6; g >= 1; g--) { const th = g / 6 * Math.PI / 2; out.push(at(R - R * Math.cos(th), -h - R + R * Math.sin(th))); }
  return out;
}
// the centre line of a driveway in from P0 on the street (n: square in from it) that turns to run along `to` (a unit
// direction) into a drive: straight R + 4 ft, a curve, then along `to` for `len` ft past the curve. null when the turn is
// under ENTRY_TURN.min (straight in is the same) or over ENTRY_TURN.max.
export function turnInPath(P0, n, to, R, h, len) {
  const c = Math.max(-1, Math.min(1, n[0] * to[0] + n[1] * to[1])), turn = Math.acos(c) * 180 / Math.PI; if (turn < ENTRY_TURN.min || turn > ENTRY_TURN.max) return null;
  const rb = Math.max(40, h + 15), tb = rb * Math.tan(turn * Math.PI / 360), Lt = R + 4 + tb, P1 = [P0[0] + n[0] * Lt, P0[1] + n[1] * Lt];
  return fillet([P0, P1, [P1[0] + to[0] * (tb + len), P1[1] + to[1] * (tb + len)]], rb);
}
// the stretch of a turned driveway (its outline P, centre line cl) where no stall may sit beside it: square to the
// street, from 5 ft out to len ft in, across its mouth (curb returns and all) and m ft more each side
export function throatZone(P, cl, len, m) {
  const o = cl[0], L = Math.hypot(cl[1][0] - o[0], cl[1][1] - o[1]) || 1, n = [(cl[1][0] - o[0]) / L, (cl[1][1] - o[1]) / L], u = [n[1], -n[0]];
  const w = Math.max(...P.filter(p => (p[0] - o[0]) * n[0] + (p[1] - o[1]) * n[1] < 2).map(p => Math.abs((p[0] - o[0]) * u[0] + (p[1] - o[1]) * u[1]))) + m;
  return [[-w, -5], [w, -5], [w, len], [-w, len]].map(([a, t]) => [o[0] + u[0] * a + n[0] * t, o[1] + u[1] * a + n[1] * t]);
}
// a centre line (e.cl) still lying down the middle of the driveway's outline: not moved or reshaped since
export const clOf = e => e.cl?.length >= 2 && e.poly && e.cl.every(p => inRing(p, e.poly) || distToPoly(p, e.poly) < 1.5) ? e.cl : null;
// a driveway straight in from P (n: square in from the street) first meets a drive q - 8 ft in. Where that drive's edge
// isn't square to the way in, the centre line that turns to meet it square (turnInPath), on to 8 ft inside the first
// drive it reaches (cut short on the curve when a drive comes sooner) and its end corners in a drive, if it stays in
// the lot and its curb returns' stretch is clear of drives; else null (straight in). drives: [{ s, b }].
export function turnInto(P, n, R, h, q, ring, drives, inside = (c, d) => c[0] >= d.b[0] && c[0] <= d.b[2] && c[1] >= d.b[1] && c[1] <= d.b[3] && inRing(c, d.s)) {
  const hit = [P[0] + n[0] * (q - 8), P[1] + n[1] * (q - 8)], d = drives.find(d => inside(hit, d)); if (!d) return null;
  // the edge of it the way in crosses: a straight one (20 ft or more), not a facet of a curve
  const pre = [P[0] + n[0] * (q - 11), P[1] + n[1] * (q - 11)]; let e = null, bd = Infinity;
  d.s.forEach((a, i) => { const b = d.s[(i + 1) % d.s.length], dd = segsCross(pre, hit, a, b) ? 0 : segDist(hit, a, b); if (dd < bd) { bd = dd; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); e = L >= 20 ? [(b[0] - a[0]) / L, (b[1] - a[1]) / L] : null; } }); if (!e) return null;
  let to = [-e[1], e[0]]; if (to[0] * n[0] + to[1] * n[1] < 0) to = [-to[0], -to[1]];
  const path = turnInPath(P, n, to, R, h, 400); if (!path) return null;
  const any = c => drives.some(o => inside(c, o));
  let s0 = 0; for (let i = 0; i + 1 < path.length; i++) { const A = path[i], B = path[i + 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    for (let t = i ? 0 : 2; t < L; t += 2) { const c = [A[0] + (B[0] - A[0]) * t / L, A[1] + (B[1] - A[1]) * t / L]; if (!inRing(c, ring)) return null; if (any(c)) return s0 + t < R + 2 ? null : buryEnd(cutPath(path, s0 + t + 8), h, any); }
    s0 += L; }
  return null;
}
// a path cut s ft along it
function cutPath(path, s) {
  const out = [path[0]]; for (let i = 0; i + 1 < path.length; i++) { const A = path[i], B = path[i + 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (s <= L) { out.push([A[0] + (B[0] - A[0]) * s / L, A[1] + (B[1] - A[1]) * s / L]); return out; } s -= L; out.push(B); }
  return out;
}
// a driveway's end run on (up to 16 ft) until both its corners are in a drive: cut square, it met the drive's edge at
// an angle and a corner stuck out past it
export function buryEnd(path, h, any) {
  const m = path.length - 1, A = path[m - 1], B = path[m], L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, d = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
  for (let x = 0; x <= 16; x += 2) { const E = [B[0] + d[0] * x, B[1] + d[1] * x]; if ([1, -1].every(k => any([E[0] - d[1] * h * k * 0.97, E[1] + d[0] * h * k * 0.97]))) return x ? path.slice(0, m).concat([E]) : path; }
  return path;
}
const ENTRY_SOLID = ['building', 'garage', 'pond', 'pool', 'court', 'play', 'trash', 'patio', 'foodtruck', 'canopy', 'tanks'];
export function entranceAt(plan, p, { W = 26, slide = 80, els = plan.elements || [], why = null, straight = false, throughParks = false } = {}) {
  const ring = plan.ring || [], n = ring.length; if (n < 3) return null;
  const k = nearestEdge(ring, p), a = ring[k], b = ring[(k + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < W + 40) return null;
  const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], o = outward(ring, k), nn = [-o[0], -o[1]], h = W / 2, R0 = 15;
  const t0 = (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1];
  const drives = els.filter(e => (e.kind === 'drive' || e.kind === 'truck' || e.kind === 'field') && e.note !== 'Drive-thru lane').map(e => { const s = shapeOf(e); return { s, b: boxOfPts(s) }; });
  const solid = els.filter(e => ENTRY_SOLID.includes(e.kind) || !throughParks && isPark(e) || e.kind === 'plaza' && /pool deck/i.test(e.note || '')).map(e => { const s = shapeOf(e); return { s, b: boxOfPts(s), e }; }); // (throughParks: a way in fire access needs may cross a lawn, never a building, pond or amenity)
  const inside = (c, d) => c[0] >= d.b[0] && c[0] <= d.b[2] && c[1] >= d.b[1] && c[1] <= d.b[3] && inRing(c, d.s);
  for (let i = 0; i <= slide / 2; i++) for (const off of i ? [2 * i, -2 * i] : [0]) {
    const t = t0 + off; if (t < h + R0 + 5 || t > L - h - R0 - 5) continue;
    const P = [a[0] + u[0] * t, a[1] + u[1] * t], at = (v, w) => [+(P[0] + nn[0] * v + u[0] * w).toFixed(2), +(P[1] + nn[1] * v + u[1] * w).toFixed(2)];
    let q = null; for (let v = 4; v <= 1200; v += 2) { const c = at(v, 0); if (!inRing(c, ring)) break; if (drives.some(d => inside(c, d))) { q = v + 8; break; } } // in to the first drive it meets
    if (q == null) continue;
    { const any = c => drives.some(d => inside(c, d)), held = x => [h, -h].every(w => any(at(q + x - 1, w * 0.97))); let x = 0; while (x < 16 && !held(x)) x += 2; if (held(x)) q += x; } // (its end's corners in the drive, not sticking out past a slanting edge)
    const R = Math.max(4, Math.min(15, q - 6)); // curb returns: 15 ft, tighter when the drive runs close to the lot line
    const hitOf = (poly, body) => { const bb = boxOfPts(poly.concat(body)); return solid.find(d => d.b[0] < bb[2] && d.b[2] > bb[0] && d.b[1] < bb[3] && d.b[3] > bb[1] && (isPark(d.e) ? rectsOverlap({ poly }, { poly: d.s }, 0.5) : rectsOverlap({ poly: body }, { poly: d.s }, 0))); }; // (a park: its curb returns stay off it too)
    const bent = !straight && turnInto(P, nn, R0, h, q, ring, drives, inside); if (bent) { const bp = drivewayOutline(bent, u, nn, h, R0); if (!hitOf(bp, drivewayOutline(bent, u, nn, h + 2, 0.01))) return { poly: bp, edge: k, at: P, depth: q, R: R0, u, n: nn, cl: bent.map(p => p.map(v => +v.toFixed(2))) }; } // (square to the street, then round to meet the drive square)
    const body = [at(1, -h - 2), at(Math.max(2, q - 10), -h - 2), at(Math.max(2, q - 10), h + 2), at(1, h + 2)]; // its sides keep 2 ft off anything solid
    const poly = [at(-1, h + R)];
    for (let g = 1; g <= 6; g++) { const th = g / 6 * Math.PI / 2; poly.push(at(R - R * Math.cos(th), h + R - R * Math.sin(th))); }
    poly.push(at(q, h), at(q, -h));
    for (let g = 6; g >= 1; g--) { const th = g / 6 * Math.PI / 2; poly.push(at(R - R * Math.cos(th), -h - R + R * Math.sin(th))); }
    poly.push(at(-1, -h - R));
    const hit = hitOf(poly, body); if (hit) { if (why && !off) why.hit = hit.e; continue; }
    return { poly, edge: k, at: P, depth: q, R, u, n: nn };
  }
  return null;
}
// the entrances a plan has: the main entry, a pull-through, and any added ones
export const entrancesOf = els => (els || []).filter(e => e.kind === 'drive' && (e.entry || e.name === 'Main entry' || e.through || /^Entrance\b/.test(e.name || '')));
// ---------- ways in: boulevards, monument signs and where entrances may go ----------
// a monument sign's pad: a 10 ft wall in a 5 ft planting bed, kept 2 ft off the curb; back: ft behind the median's nose
export const SIGN = { w: 10, d: 5, clear: 2, back: 6 };
// where ways in may go and how a boulevard is built (plan.params.entry; typical starting values, the city's or county's
// rules set the real ones). style: auto (a boulevard where it costs no more than 2% of the program), boulevard (always),
// narrow (a 40 ft drive with a 10 ft median), driveway (no median); lane and median ft; sign: median, both, one, none;
// corner: ft from a street intersection; spacing: ft between driveways; cross: ft in to the first drive at a boulevard
export const ENTRY_RULES = { style: 'auto', lane: 18, median: 14, sign: 'median', corner: 100, spacing: 150, cross: 100 };
const given = o => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v != null && v !== '')); // what a setting says outright (left empty: the rule sheet's, else the default)
export const entryRules = plan => { const p = { ...(plan?.params?.code?.entry || {}), ...given(plan?.params?.entry) }; // (a rule sheet's driveway spacing and corner clearance, under the plan's own)
  return { style: ['auto', 'boulevard', 'narrow', 'driveway'].includes(p.style) ? p.style : 'auto', lane: clamp(p.lane, 12, 30, 18), median: clamp(p.median, 4, 40, 14), sign: ['median', 'both', 'one', 'none'].includes(p.sign) ? p.sign : 'median', corner: clamp(p.corner, 0, 1000, 100), spacing: clamp(p.spacing, 0, 2000, 150), cross: clamp(p.cross, 0, 1000, 100) }; };
export const blvdWidth = r => 2 * r.lane + r.median;
export const blvdNote = r => 'Boulevard · ' + blvdWidth(r) + ' ft · two ' + r.lane + ' ft lanes, ' + r.median + ' ft median'; // (the width first: routeOf reads it)
const newId = () => 'e' + Math.random().toString(36).slice(2, 9), xyOf = r => (c => ({ x: +c[0].toFixed(2), y: +c[1].toFixed(2) }))(centroid(r));
const wordOf = o => o.name || 'a ' + (KINDS[o.kind]?.label || o.kind).toLowerCase();
// a rounded planted strip (a median) along a way in: from v0 to v1 ft in from the street, h ft each side of the middle;
// at(v, w) maps local feet to plan feet (the plan-feet twin of the layout's stadium())
export function stripAt(at, v0, v1, h) {
  const out = []; for (let k = 0; k <= 8; k++) { const t = Math.PI + k * Math.PI / 8; out.push(at(v0 + h + h * Math.sin(t), h * Math.cos(t))); }
  for (let k = 0; k <= 8; k++) { const t = k * Math.PI / 8; out.push(at(v1 - h + h * Math.sin(t), h * Math.cos(t))); }
  return out;
}
// a strip's long axis: a (its nose, the end nearer p) along u, its length L and its width w across the axis
function stripOf(poly, p) {
  let a = poly[0], b = poly[0], L = -1; for (const x of poly) for (const y of poly) { const d = Math.hypot(x[0] - y[0], x[1] - y[1]); if (d > L) { L = d; a = x; b = y; } }
  if (Math.hypot(b[0] - p[0], b[1] - p[1]) < Math.hypot(a[0] - p[0], a[1] - p[1])) [a, b] = [b, a];
  const u = [(b[0] - a[0]) / (L || 1), (b[1] - a[1]) / (L || 1)], ws = poly.map(q => -(q[0] - a[0]) * u[1] + (q[1] - a[1]) * u[0]); return { a, u, L, w: Math.max(...ws) - Math.min(...ws) };
}
// what goes with an entrance: the median down its middle (its middle inside the drive) and its own monument signs (a
// sign placed by hand isn't one): a sign in a median is that median's entrance's, else the one it was put up for (of)
// while it's still within 40 ft of it, else the nearest within 40 ft (two ways in side by side each keep their own)
export function entryParts(plan, e) {
  const els = plan.elements || [], me = shapeOf(e), mb = boxOfPts(me), inB = (c, b) => c[0] >= b[0] && c[0] <= b[2] && c[1] >= b[1] && c[1] <= b[3], same = (o, d) => o === d || o.id != null && o.id === d.id;
  const meds = els.filter(o => isMedian(o) && !same(o, e)), signs = els.filter(o => o.kind === 'sign' && o.sign && !same(o, e)); if (!meds.length && !signs.length) return [];
  const ents = entrancesOf(els).filter(d => !same(d, e)).concat([e]).map(d => { const s = shapeOf(d); return { d, s, b: boxOfPts(s) }; }), mine = new Map(ents.map(x => [x.d, []]));
  const medOf = new Map(); for (const m of meds) { const c = centroid(shapeOf(m)), x = ents.slice().reverse().find(x => inB(c, x.b) && inRing(c, x.s)); if (x) { medOf.set(m, x.d); mine.get(x.d).push(m); } } // (e looked at first: it keeps its own median when two overlap)
  for (const g of signs) { const gs = shapeOf(g), c = centroid(gs), m = [...medOf.keys()].find(m => inRing(c, shapeOf(m))), was = g.of != null && ents.find(x => x.d.id === g.of);
    let best = m ? medOf.get(m) : was && gapBetween(gs, was.s) <= 40 ? was.d : null, bd = 40.01; if (!best) for (const x of ents) { if (x.b[0] > c[0] + 45 || x.b[2] < c[0] - 45 || x.b[1] > c[1] + 45 || x.b[3] < c[1] - 45) continue; const d = gapBetween(gs, x.s); if (d < bd || d === bd && x.d === e) { bd = d; best = x.d; } }
    if (best) mine.get(best).push(g); }
  return mine.get(e) || [];
}
// a median down an entrance's way in (a route): along the first straight stretch past its throat, h ft each side of the
// middle, from its nose (the curb returns and 6 ft more in from the street) to 45 ft short of where the route ends (the
// drive it meets) or 2 ft short of a bend's curve, at most max ft long and at least 30; null when there's no room
export function medianOf(e, h, max = 160) {
  if (!e?.path || e.path.length < 2 || !e.mouth || e.closed) return null;
  const p0 = e.path[0], L0 = (e.flare || 0) + 10, d1 = (e.path[1][0] - p0[0]) * e.mouth[0] + (e.path[1][1] - p0[1]) * e.mouth[1], r = Math.max(e.r ?? 30, 0);
  const line = d1 > L0 + 8 ? [p0, [p0[0] + e.mouth[0] * L0, p0[1] + e.mouth[1] * L0], ...e.path.slice(1)] : e.path, runs = []; // (as freeOutline draws it: square to the street for the throat)
  for (let i = 0; i + 1 < line.length; i++) { const a = line[i], b = line[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue; const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], l = runs[runs.length - 1];
    if (l && Math.abs(wrap180(angOf(u) - angOf(l.u))) < 2) l.L += L; else runs.push({ a, u, L }); }
  const tan = (x, y) => x && y ? r * Math.tan(Math.min(150, Math.abs(wrap180(angOf(y.u) - angOf(x.u)))) * RAD / 2) : 0, nose = (e.flare || 15) + 6;
  let s0 = 0;
  for (let i = 0; i < runs.length; i++) {
    const q = runs[i], v0 = Math.max(nose - s0, tan(runs[i - 1], q) + 2), v1 = Math.min(q.L - (i === runs.length - 1 ? 45 : tan(q, runs[i + 1]) + 2), v0 + max); s0 += q.L;
    if (v1 - v0 >= 30) { const n = [-q.u[1], q.u[0]]; return stripAt((v, w) => [+(q.a[0] + q.u[0] * v + n[0] * w).toFixed(2), +(q.a[1] + q.u[1] * v + n[1] * w).toFixed(2)], v0, v1, h); }
  }
  return null;
}
// how far in from the street an entrance's way in meets another drive (ft, straight in square to the street), or null
export function entryDepth(plan, e, els = plan.elements || []) {
  const ring = plan.ring || [], r = routeOf(e, ring); if (!r) return null; const m = r.mouth || lotLineAt(ring, r.path[0]).mouth, p0 = r.path[0];
  const D = els.filter(d => d !== e && (d.id == null || d.id !== e.id) && (d.kind === 'drive' || d.kind === 'truck' || d.kind === 'field') && d.note !== 'Drive-thru lane').map(d => { const s = shapeOf(d); return { s, b: boxOfPts(s) }; });
  for (let v = 4; v < 1500; v += 2) { const c = [p0[0] + m[0] * v, p0[1] + m[1] * v]; if (!inRing(c, ring)) return null; if (D.some(d => c[0] >= d.b[0] && c[0] <= d.b[2] && c[1] >= d.b[1] && c[1] <= d.b[3] && inRing(c, d.s))) return v; }
  return null;
}
// what a monument sign at a corner keeps 2 ft off
const SIGN_HIT = ['drive', 'truck', 'field', 'parking', 'building', 'garage', 'pond', 'pool', 'court', 'play', 'plaza']; // what a monument sign may not stand on
const ISLAND_OFF = ['drive', 'truck', 'field', 'parking', 'building', 'garage', 'pond', 'pool', 'court', 'play', 'plaza', 'patio', 'trash', 'canopy', 'tanks', 'foodtruck', 'sign']; // what may not stand on a roundabout's or a loop's planted island
const SIGN_OFF = ['drive', 'truck', 'field', 'parking', 'building', 'garage', 'pond', 'pool', 'court', 'play', 'plaza', 'lot', 'keepout', 'trash', 'patio', 'canopy', 'tanks', 'foodtruck', 'sign'];
// where an entrance's monument signs go (mode: median, both, one, none): { signs, why }. In the median: one pad on its
// middle line, 6 ft behind its nose, when the median is 14 ft wide (the 10 ft wall and 2 ft each side) and long enough;
// else at both corners, and why says so. At the corners: in the front landscape buffer, its street face 2 ft in from the
// lot line, just past each curb return, slid along the street (up to 30 ft) to a spot inside the lot and 2 ft off every
// drive, row, building, amenity, lot and park; one: the right-hand side driving in, else the left. ids: kept in order.
export function entrySigns(plan, e, mode, { els = plan.elements || [], ids = [] } = {}) {
  const ring = plan.ring || [], r = ring.length >= 3 && routeOf(e, ring); if (!r || !mode || mode === 'none') return { signs: [], why: '' };
  const P = r.path[0], nn = r.mouth || lotLineAt(ring, P).mouth, u = [nn[1], -nn[0]], me = shapeOf(e), deg = v => +(((angOf(v) % 360) + 360) % 360).toFixed(2);
  const pad = (c, ang, i, note, kind) => ({ id: ids[i] || newId(), kind: 'sign', x: +c[0].toFixed(2), y: +c[1].toFixed(2), w: SIGN.w, d: SIGN.d, rot: ang, name: i ? 'Monument sign ' + (i + 1) : 'Monument sign', note, sign: kind, want: mode, ...(e.id != null ? { of: e.id } : {}) }); // (of: the way in it's for)
  let why = '';
  if (mode === 'median') {
    const med = els.find(m => isMedian(m) && inRing(centroid(shapeOf(m)), me)), need = SIGN.w + 2 * SIGN.clear;
    if (med) { const s = stripOf(shapeOf(med), P);
      if (s.w < need - 0.3) why = 'The median is ' + Math.round(s.w) + ' ft wide, too narrow for the sign (it needs ' + need + ' ft), so the signs stand at the corners.';
      else if (s.L < SIGN.back + SIGN.d + 10) why = 'The median is too short for the sign and clear sight lines, so the signs stand at the corners.';
      else return { signs: [pad([s.a[0] + s.u[0] * (SIGN.back + SIGN.d / 2), s.a[1] + s.u[1] * (SIGN.back + SIGN.d / 2)], deg([s.u[1], -s.u[0]]), 0, 'In the median', 'median')], why: '' };
    } else { const d = e.blvd ? entryDepth(plan, e, els) : null; why = d != null ? 'The entry meets the first drive ' + d + ' ft in: no room for a median, so the monument signs stand at the corners.' : 'The entry has no median, so the monument signs stand at the corners.'; }
  }
  const W = r.width || 26, R = r.flare || 15, obs = els.filter(o => o !== e && (o.id == null || o.id !== e.id) && (SIGN_OFF.includes(o.kind) || isPark(o))).map(o => { const s = shapeOf(o); return { s, b: boxOfPts(s), o }; }).concat([{ s: me, b: boxOfPts(me), o: e }]);
  const out = [], miss = [];
  for (const s of [1, -1]) {
    if (mode === 'one' && out.length) break; let got = null, hit = null;
    for (let k = 0; k <= 15 && !got; k++) {
      const w = s * (W / 2 + R + SIGN.clear + 1 + SIGN.w / 2 + 2 * k), v = SIGN.clear + SIGN.d / 2, c = [P[0] + nn[0] * v + u[0] * w, P[1] + nn[1] * v + u[1] * w], cs = corners({ x: c[0], y: c[1], w: SIGN.w, d: SIGN.d, rot: angOf(u) }), qb = boxOfPts(cs);
      if (!cs.every(p => inRing(p, ring))) { hit ||= 'the lot line'; continue; }
      const o = obs.find(o => o.b[0] < qb[2] + SIGN.clear && o.b[2] > qb[0] - SIGN.clear && o.b[1] < qb[3] + SIGN.clear && o.b[3] > qb[1] - SIGN.clear && gapBetween(cs, o.s) < SIGN.clear); if (o) { hit ||= wordOf(o.o); continue; }
      got = c;
    }
    if (got) out.push({ c: got, s }); else miss.push('No room for a sign at the ' + (s > 0 ? 'right' : 'left') + ' corner: ' + hit + '.');
  }
  return { signs: out.map((x, i) => pad(x.c, deg(u), i, (x.s > 0 ? 'Right' : 'Left') + ' corner', 'corner')), why: [why, ...(mode === 'one' && out.length ? [] : miss)].filter(Boolean).join(' ') };
}
// an entrance's median and monument signs drawn again for where it is now (had: what went with it before it moved):
// the median kept while it still lies in the drive, else drawn again along the first straight stretch of its way in
// past the throat (its old width, or the boulevard's); the signs where mode says (median, both, one, none, kept on the
// entrance as e.signs; default: as asked before, none when it had none). Ids are kept. e is one of plan.elements; redraw: the median drawn again even
// where it still lies in the drive. Returns { elements, why }
export function refreshEntry(plan, e, mode = null, had = entryParts(plan, e), redraw = false) {
  const ring = plan.ring || [], gone = new Set(had), els = (plan.elements || []).filter(o => !gone.has(o)), med0 = had.find(isMedian), signs0 = had.filter(o => o.kind === 'sign');
  let med = null; const me = shapeOf(e), inside = m => shapeOf(m).every(p => inRing(p, me) || distToPoly(p, me) <= 2);
  if (med0 && !redraw && inside(med0)) med = med0; // (turned, it's drawn again: a thin median can still lie inside a drive turned back over it)
  else if (med0 || e.blvd) { const r = routeOf(e, ring), h = e.blvd ? e.blvd.median / 2 : stripOf(shapeOf(med0), r.path[0]).w / 2, poly = r && medianOf(r.mouth ? r : { ...r, mouth: lotLineAt(ring, r.path[0]).mouth }, h, e.blvd ? 160 : 140);
    if (poly) med = { ...(med0 ? structuredClone(med0) : { id: newId(), kind: 'green', name: '', trees: false, median: true, island: true }), poly, ...xyOf(poly) }; }
  if (mode) e.signs = mode; // (the choice is the entry's: a re-fit that lays the main entry out again keeps it)
  const want = mode || e.signs || signs0[0]?.want || (signs0.length ? (signs0.length > 1 ? 'both' : signs0[0].sign === 'median' ? 'median' : 'one') : 'none'), all = els.concat(med ? [med] : []);
  const s = entrySigns({ ...plan, elements: all }, e, want, { els: all, ids: signs0.map(x => x.id) });
  if (e.pinned) for (const x of [med, ...s.signs]) if (x) x.pinned = true; // (a re-fit keeps them with the way in placed by hand)
  return { elements: all.concat(s.signs), why: s.why };
}
// where a monument sign's name is written: beside it, not on it (the label hid the sign): a corner sign's toward the
// street, a median sign's back along its median (toward the street it lay across the lanes and the stop bar)
export const signLabelAt = e => (q => [+(e.x + q[0]).toFixed(2), +(e.y + q[1]).toFixed(2)])(rot([0, (e.sign === 'median' ? 1 : -1) * (e.d / 2 + 12)], e.rot || 0));
// a monument sign taken off by hand: its entrance remembers what's left (one corner, or none), so a re-fit that lays the
// main entry out again doesn't put it back. Its entrance (one of plan.elements) is changed; returns the elements without it
export function dropSign(plan, g) {
  const els = plan.elements || [], d = g?.kind === 'sign' && entrancesOf(els).find(d => entryParts(plan, d).includes(g)), rest = els.filter(o => o !== g);
  if (d) { const left = entryParts({ ...plan, elements: rest }, d).filter(o => o.kind === 'sign'); d.signs = !left.length ? 'none' : left.some(o => o.sign === 'median') ? 'median' : left.length > 1 ? 'both' : 'one'; }
  return rest;
}
// a boulevard's median and signs for a way in entranceAt built (e0, W wide): the median from the curb returns' end 6 ft
// in to 45 ft short of the drive it meets (at most 160 ft, at least 30), then the signs. els: the plan with ent on it
// (one that turns to meet its drive square: the median on the straight past the turn, as refreshEntry draws it)
const turnedRoute = e0 => { const c = e0.cl, L = Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]) || 1; return { path: c, mouth: [(c[1][0] - c[0][0]) / L, (c[1][1] - c[0][1]) / L], flare: 25, r: 0 }; };
const medRoom = e0 => e0.cl ? !!medianOf(turnedRoute(e0), 1) : e0.depth - 45 - (e0.R + 6) >= 30, noMedian = (e0, R0) => 'it meets the first drive ' + Math.round(e0.depth) + ' ft in from the street, too soon for a planted median (about ' + Math.max(R0.cross, Math.ceil(e0.R + 81)) + ' ft is usual)'; // (blvdParts' median: at least 30 ft long)
// a boulevard's way in at p (entranceAt's opts, W its width): turned to meet its drive square where its median still has
// room past the turn, else straight in where that has room (a turn costs the median its first 30 ft or so), else as turned
function blvdAt(plan, p, o) { const e0 = entranceAt(plan, p, o); if (!e0?.cl || medRoom(e0)) return e0; const s = entranceAt(plan, p, { ...o, why: null, straight: true }); return s && medRoom(s) ? s : e0; }
function blvdParts(plan, e0, ent, rules, els, sign) {
  const at = (v, w) => [+(e0.at[0] + e0.n[0] * v + e0.u[0] * w).toFixed(2), +(e0.at[1] + e0.n[1] * v + e0.u[1] * w).toFixed(2)], v0 = e0.R + 6, v1 = Math.min(e0.depth - 45, v0 + 160);
  const med = medRoom(e0) ? (poly => ({ id: newId(), kind: 'green', poly, ...xyOf(poly), name: '', trees: false, median: true, island: true, pinned: true }))(e0.cl ? medianOf(turnedRoute(e0), rules.median / 2, 160) : stripAt(at, v0, v1, rules.median / 2)) : null;
  const all = els.concat(med ? [med] : []), s = entrySigns({ ...plan, elements: all }, ent, sign, { els: all }); for (const x of s.signs) x.pinned = true;
  return { added: [...(med ? [med] : []), ...s.signs], why: s.why };
}
// where two streets meet at the lot's corners (plan feet): a corner between two street lot lines turning more than 30°
export function streetCorners(plan) {
  const ring = plan.ring || [], n = ring.length; if (n < 3) return [];
  const rules = edgeRules(ring, plan.front, plan.setbacks, plan.streets), st = k => rules[k].role === 'front' || rules[k].street;
  return ring.filter((p, k) => { const j = (k - 1 + n) % n, a = ring[j], b = ring[(k + 1) % n]; return st(k) && st(j) && Math.abs(wrap180(angOf([b[0] - p[0], b[1] - p[1]]) - angOf([p[0] - a[0], p[1] - a[1]]))) > 30; });
}
const toCorner = (cs, p) => cs.length ? Math.min(...cs.map(c => Math.hypot(c[0] - p[0], c[1] - p[1]))) : Infinity;
// where the ways in break the usual rules (warnings: they never fail a plan): two driveways on the streets closer than
// the spacing, one too near the corner where two streets meet, and a boulevard (or a neighbourhood's main entry) that
// meets its first drive too soon in from the street. [{ id, level: 'warn', text }]
export function entryIssues(plan) {
  const ring = plan.ring || [], els = plan.elements || [], R = entryRules(plan), out = []; if (ring.length < 3) return out;
  const rules = edgeRules(ring, plan.front, plan.setbacks, plan.streets), st = k => rules[k].role === 'front' || rules[k].street, cs = streetCorners(plan), homes = els.some(e => e.kind === 'building' && HOME_USES.includes(e.use));
  const ents = entrancesOf(els).filter(e => !e.through).map(e => { const r = routeOf(e, ring); if (!r) return null; const at = r.mouth ? r.path[0] : [r.path[0], r.path[r.path.length - 1]].sort((p, q) => distToPoly(p, ring) - distToPoly(q, ring))[0], k = nearestEdge(ring, at);
    return st(k) && segDist(at, ring[k], ring[(k + 1) % ring.length]) < 6 ? { e, at, mouth: !!r.mouth } : null; }).filter(Boolean), nm = e => e.name || 'An entrance';
  for (let i = 0; i < ents.length; i++) for (let j = 0; j < i; j++) { const d = Math.hypot(ents[i].at[0] - ents[j].at[0], ents[i].at[1] - ents[j].at[1]);
    if (d < R.spacing) out.push({ id: ents[i].e.id, level: 'warn', text: nm(ents[i].e) + ' is ' + Math.round(d) + ' ft from ' + nm(ents[j].e) + '; driveways usually need about ' + R.spacing + ' ft between them (check the city’s rule)' }); }
  for (const x of ents) { const d = toCorner(cs, x.at); if (d < R.corner) out.push({ id: x.e.id, level: 'warn', text: nm(x.e) + ' is ' + Math.round(d) + ' ft from the corner of the two streets; about ' + R.corner + ' ft is usual' }); }
  // (the main entry of a plan with homes: only when it's the homes' way in, not a shopping center's beside a neighborhood on
  // a tract of its own)
  const servesHomes = e => { const r = routeOf(e, ring), p = r ? r.path[r.path.length - 1] : [e.x, e.y], near = els.filter(h => h.kind === 'building' && h.use !== 'amenity').map(h => ({ h, d: Math.hypot(h.x - p[0], h.y - p[1]) })).sort((a, b) => a.d - b.d)[0]; return !near || HOME_USES.includes(near.h.use); }; // (the nearest building to its inner end is a home)
  for (const x of ents) { if (!x.mouth || !(x.e.blvd || homes && x.e.name === 'Main entry' && servesHomes(x.e))) continue; const d = entryDepth(plan, x.e, els);
    if (d != null && d < R.cross - 10) out.push({ id: x.e.id, level: 'warn', text: nm(x.e) + ' meets the first drive ' + d + ' ft in from the street; about ' + R.cross + ' ft keeps cars turning in off the road' }); } // ("about": within 10 ft is fine)
  return out;
}
// add a driveway at p (see entranceAt): parking rows it crosses are cut; it's named Entrance 2, 3, ... and pinned.
// A lot line that isn't a street yet becomes one (a driveway needs a street). opts.boulevard: two lanes and a planted
// median as the plan's settings say (entryRules), with its monument signs where opts.sign says (else the setting).
// Returns { elements, streets, entrance, note, at (its mouth on the lot line), added (its median and signs), why (where
// the signs went and why, in note too) } or { error, park (when a park was in the way) }.
export function addEntrance(plan, p, opts = {}) {
  const R0 = entryRules(plan), why = {}; let W = opts.boulevard ? blvdWidth(R0) : opts.W || 26, e0 = (opts.boulevard ? blvdAt : entranceAt)(plan, p, { ...opts, W, why }), narrow = '';
  if (e0 && opts.boulevard && !medRoom(e0)) { const e1 = entranceAt(plan, p, { ...opts, W: opts.W || 26 }); if (e1) { narrow = 'Not a boulevard: ' + noMedian(e0, R0) + ', so it’s a ' + (opts.W || 26) + ' ft driveway.'; opts = { ...opts, boulevard: false }; W = opts.W || 26; e0 = e1; } } // (a 50 ft throat with no median gains nothing)
  if (!e0) return why.hit && isPark(why.hit) ? { error: 'No way in there: the driveway would cross ' + why.hit.name + '. Try a spot along the street past it.', park: why.hit } : { error: 'No way in from there: the driveway would cross a building, pond or amenity before it meets a drive, or sit too close to a corner. Try another spot along the street.' };
  const els = plan.elements || [], have = entrancesOf(els), rules = edgeRules(plan.ring, plan.front, plan.setbacks, plan.streets), street = rules[e0.edge].role === 'front' || rules[e0.edge].street;
  let num = have.length + 1; const names = new Set(els.map(e => e.name)); while (names.has('Entrance ' + num)) num++;
  const ent = { id: opts.id || newId(), kind: 'drive', poly: e0.poly, ...xyOf(e0.poly), name: opts.name || 'Entrance ' + num, note: opts.boulevard ? blvdNote(R0) : W + ' ft driveway', ...(opts.boulevard ? { blvd: { lane: R0.lane, median: R0.median } } : {}), ...(opts.sign && (opts.boulevard || narrow) ? { signs: opts.sign } : {}), entry: true, pinned: true, ...(e0.cl ? { cl: e0.cl } : {}) };
  const near = have.map(e => { const c = mouthOf(e, plan.ring); return Math.hypot(c[0] - e0.at[0], c[1] - e0.at[1]); }), gap = near.length ? Math.min(...near) : Infinity, dc = toCorner(streetCorners(plan), e0.at);
  const notes = narrow ? [narrow] : []; if (!street) notes.push('That lot line is now marked as a street (a driveway needs one).'); if (gap < R0.spacing) notes.push('It’s ' + Math.round(gap) + ' ft from the nearest entrance; driveways usually need about ' + R0.spacing + ' ft or more between them (check the city’s spacing rule).');
  if (dc < R0.corner) notes.push('It’s ' + Math.round(dc) + ' ft from the corner of the two streets; about ' + R0.corner + ' ft is usual (check the city’s rule).');
  // the stalls it crosses go, and so do the ones at its mouth (the first 50 ft in from the street, 10 ft either side)
  let kept = cutRows(els, e0.poly, 1); const a = plan.ring[e0.edge], b = plan.ring[(e0.edge + 1) % plan.ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, n0 = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L], c0 = centroid(e0.poly), n = ((c0[0] - a[0]) * n0[0] + (c0[1] - a[1]) * n0[1]) >= 0 ? n0 : [-n0[0], -n0[1]];
  try { const band = [a, b, [b[0] + n[0] * 50, b[1] + n[1] * 50], [a[0] + n[0] * 50, a[1] + n[1] * 50]], cc = r => (signedArea(r) >= 0 ? r : r.slice().reverse()), cl = r => r.concat([r[0]]);
    const mouth = polyclip.intersection([[cl(cc(grow(cc(e0.poly), 10)))]], [[cl(cc(band))]]).map(pg => pg[0].slice(0, -1)).sort((x, y) => ringArea(y) - ringArea(x))[0]; if (mouth?.length >= 3) kept = cutRows(kept, mouth, 1); } catch (err) { /* the crossing cut is enough */ }
  kept = kept.filter(e => !(e.kind === 'parking' && stalls(e).count < 3 && gapBetween(shapeOf(e), e0.poly) < 24)); // (a scrap of a row left beside the driveway: gone)
  const bv = opts.boulevard ? blvdParts({ ...plan, elements: kept.concat(ent) }, e0, ent, R0, kept.concat(ent), opts.sign ?? R0.sign) : narrow && opts.sign && opts.sign !== 'none' ? (s => ({ added: s.signs.map(x => ({ ...x, pinned: true })), why: s.why }))(entrySigns({ ...plan, elements: kept.concat(ent) }, ent, opts.sign, { els: kept.concat(ent) })) : { added: [], why: '' }; if (bv.why) notes.push(bv.why); // (signs asked for on a boulevard with no room for one: at its corners)
  if (opts.throughParks) { // a way in across a lawn: the park is cut round it (its pieces keep the name; a sliver goes)
    const cc = r => (signedArea(r) >= 0 ? r : r.slice().reverse()), cl = r => r.concat([r[0]]), cut = grow(cc(e0.poly), 3);
    kept = kept.flatMap(g => { if (!isPark(g) || !rectsOverlap({ poly: cut }, { poly: shapeOf(g) }, 0)) return [g];
      let parts; try { parts = polyclip.difference([cl(cc(shapeOf(g)))], [cl(cut)]).map(pg => pg[0].slice(0, -1)).filter(r => r.length >= 3 && ringArea(r) >= 400).sort((x, y) => ringArea(y) - ringArea(x)); } catch { return [g]; }
      return parts.map((r, i) => { const { w, d, rot, ...rest } = g; return { ...rest, id: i ? newId() : g.id, poly: r.map(q => q.map(v => +v.toFixed(2))), ...xyOf(r) }; }); });
  }
  let out = kept.concat(ent, bv.added); // another way in's sign under the new drive: that one's signs stand again where there's room
  for (const d of entrancesOf(out)) if (d !== ent && entryParts({ ...plan, elements: out }, d).some(g => g.kind === 'sign' && rectsOverlap(g, { poly: e0.poly }))) { const r = refreshEntry({ ...plan, elements: out }, d); out = r.elements; if (r.why) notes.push(r.why); }
  return { elements: out, streets: street ? plan.streets || [] : [...new Set([...(plan.streets || []), e0.edge])], entrance: ent, note: notes.join(' '), at: e0.at, added: bv.added, why: bv.why };
}
// an entrance made a boulevard ("make the main entry a boulevard", Make It a Boulevard): in from its mouth, square to
// the street, to the first drive (turning to meet it square where the median still fits past the turn, blvdAt; slid
// along the street up to 40 ft past what's in the way), two lanes and a
// planted median as the plan's settings say, its signs where opts.sign says (else the setting). The homes in its way
// (with their lots and driveways) make way; rows under it are cut. e (one of plan.elements) keeps its id and name and is
// changed in place. Returns { elements, entrance, note, why } or { error }.
export function makeBoulevard(plan, e, opts = {}) {
  const ring = plan.ring || [], R0 = entryRules(plan), W = blvdWidth(R0), r = ring.length >= 3 && routeOf(e, ring); if (!r || !isEntrance(e)) return { error: 'Only a way in from the street can be a boulevard.' };
  const had = new Set(entryParts(plan, e)), P0 = { ...plan, elements: (plan.elements || []).filter(o => o !== e && (e.id == null || o.id !== e.id) && !had.has(o)) }, homes = homesUnder(P0, { kind: 'drive', poly: band(r.path, W + 8) }, 4), rest = P0.elements.filter(o => !homes.has(o));
  const why = {}, e0 = blvdAt({ ...plan, elements: rest }, r.path[0], { W, slide: 40, els: rest, why });
  if (!e0) return { error: 'No room for a boulevard there: ' + (why.hit ? wordOf(why.hit) + ' is in the way' : 'it would cross a building, pond or amenity before it meets a drive') + '. Try moving the entrance along the street first.' };
  if (!medRoom(e0)) return { error: 'No room for a boulevard there: ' + noMedian(e0, R0) + ', so it stays as it is. Move the entrance to where the drives sit farther in, or the first drive back.' }; // (a 50 ft throat with no median gains nothing: the layout keeps its narrow entry there too)
  for (const k of ['path', 'width', 'mouth', 'flare', 'r', 'closed', 'rot', 'w', 'd', 'shape', 'cl']) delete e[k];
  Object.assign(e, { poly: e0.poly, ...xyOf(e0.poly), note: blvdNote(R0), blvd: { lane: R0.lane, median: R0.median }, entry: true, pinned: true, ...(opts.sign ? { signs: opts.sign } : {}), ...(e0.cl ? { cl: e0.cl } : {}) });
  const notes = [], slid = Math.hypot(e0.at[0] - r.path[0][0], e0.at[1] - r.path[0][1]), hc = [...homes].filter(h => h.kind === 'building').reduce((t, h) => t + (h.units ?? 1), 0); // (homes, not buildings: a townhome row is six)
  if (r.path.length > 2) notes.push('It was bent by hand; the boulevard runs straight in.'); if (slid > 3) notes.push('It slid ' + Math.round(slid) + ' ft along the street to clear ' + (why.hit ? wordOf(why.hit) : 'what was in the way') + '.'); if (hc) notes.push(hc + (hc === 1 ? ' home' : ' homes') + ' made way for it.');
  const kept = cutRows(rest, e0.poly, 1), bv = blvdParts({ ...plan, elements: kept.concat(e) }, e0, e, R0, kept.concat(e), opts.sign ?? R0.sign);
  return { elements: kept.concat(e, bv.added), entrance: e, note: notes.join(' '), why: bv.why };
}
// more entrances where they help most: on the street lot lines (the front and any side streets), as far from the
// entrances there already are as possible (mouth to mouth), at least the plan's spacing (150 ft) from them, and clear of
// the corners where two streets meet (100 ft) when there's a spot that is. opts: edges (only those lot lines), near (the
// spot nearest it, not the farthest: "off that street"), boulevard and sign (as addEntrance), W, side. Returns
// { elements, added, note (why not), why (where the signs went) }.
export function moreEntrances(plan, count, opts = {}) {
  let els = (plan.elements || []).slice(); const rules = edgeRules(plan.ring, plan.front, plan.setbacks, plan.streets), ring = plan.ring, added = [], whys = [], R0 = entryRules(plan), cs = streetCorners(plan), W = opts.boulevard ? blvdWidth(R0) : opts.W;
  for (let i = 0; i < count; i++) {
    const have = entrancesOf(els).map(e => mouthOf(e, ring)), cand = [], nr = opts.near;
    ring.forEach((a, k) => { if (!(rules[k].role === 'front' || rules[k].street) || opts.edges && !opts.edges.includes(k)) return; const b = ring[(k + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = 40; t <= L - 40; t += 20) { const p = [a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L], d = have.length ? Math.min(...have.map(c => Math.hypot(c[0] - p[0], c[1] - p[1]))) : 1e6; if (d >= R0.spacing) cand.push({ p, d, k, side: rules[k].role === 'front' ? 0 : 1, far: toCorner(cs, p) >= R0.corner ? 0 : 1, nd: nr ? Math.hypot(nr[0] - p[0], nr[1] - p[1]) : 0 }); } });
    cand.sort((x, y) => x.far - y.far || x.nd - y.nd || (opts.side ? (y.side - x.side) : 0) || y.d - x.d); let got = null, any = null, gone = null; // (a corner lot: the side street first)
    // (a driveway near a slanting side lot line runs into the side's landscape buffer as it goes in: not there)
    const inner = insetRing(ring, rules.map(r => r.role === 'front' || r.street ? 0 : Math.max(0.5, r.pave) - 0.5)), clear = e0 => inner.length >= 3 && e0.poly.every(p => inRing(p, inner) || ring.some((a, k) => (rules[k].role === 'front' || rules[k].street) && segDist(p, a, ring[(k + 1) % ring.length]) < 2));
    for (const c of cand.slice(0, 40)) { const e0 = (opts.boulevard ? blvdAt : entranceAt)({ ...plan, elements: els }, c.p, { slide: 0, els, W, throughParks: !!opts.throughParks }); if (!e0 || e0.depth >= 400 || !clear(e0)) continue; any ||= e0; if (!opts.boulevard || medRoom(e0)) { got = e0; break; } } // (a boulevard: where there's room for its median, else a driveway where there's none)
    got ||= any;
    // a neighborhood whose homes back onto the road (a band of lots between it and the first street): no clear line in, so
    // the homes in the way of the best spot make way, with their lots and driveways (a second way in for fire access is
    // worth a lot or two, as a subdivision plan gives them up)
    if (!got && opts.homesMakeWay) for (const c of cand.slice(0, 40)) {
      const o = outward(ring, c.k), dir = [-o[0], -o[1]], probe = band([c.p, [c.p[0] + dir[0] * 260, c.p[1] + dir[1] * 260]], (W || 26) + 8), under = homesUnder({ ...plan, elements: els }, { kind: 'drive', poly: probe }, 4);
      if (!under.size) continue; const rest = els.filter(e => !under.has(e)), e0 = entranceAt({ ...plan, elements: rest }, c.p, { slide: 0, els: rest, W, throughParks: !!opts.throughParks }); if (!e0 || e0.depth >= 400) continue;
      const g2 = homesUnder({ ...plan, elements: els }, { kind: 'drive', poly: grow(e0.poly, 6) }, 4); got = e0; gone = g2; els = els.filter(e => !g2.has(e)); break; }
    if (!got) break;
    const r = addEntrance({ ...plan, elements: els }, got.at, { slide: 0, W: opts.W, throughParks: !!opts.throughParks, ...(opts.boulevard ? { boulevard: true, sign: opts.sign || undefined } : {}) }); if (r.error) break; els = r.elements; added.push(r.entrance); if (r.note) whys.push(r.note); // (where the signs went, and why it isn't a boulevard)
    if (gone) { const hc = [...gone].filter(h => h.kind === 'building').reduce((t, h) => t + (h.units ?? 1), 0); if (hc) whys.push(hc + (hc === 1 ? ' home' : ' homes') + ' made way for it.'); }
  }
  return { elements: els, added, why: whys.join(' '), note: added.length < count ? (added.length ? 'Room for ' + added.length + ' more entrance' + (added.length > 1 ? 's' : '') + ', not ' + count + ': ' : 'No room for another entrance' + (opts.edges ? ' on that street' : '') + ': ') + 'each needs a street, about ' + R0.spacing + ' ft from the others, and a clear line in to a drive.' : '' };
}
// ---------- roundabouts and drop-off loops ----------
// A roundabout: a closed drive whose route is a ring of points on its lane's centre line, a planted island in the middle,
// set where streets meet. The streets that run into it are cut back to the lane's centre line, so the paving pours as one
// (rb.cuts keeps them as they were: taken away or moved, it puts them back). A drop-off loop (a circle drive): a one-way
// drive in front of a building, its ends run into the drive it hangs off, a planted island between. Both are drives;
// their islands are worked out from them (islandOf), never pieces of their own.
export const RING = { R: 50, big: 60, min: 40, max: 90, lane: 20, lanes: [14, 30], pad: 4, snap: 150 }; // ft: outer radius for local streets, at a leg 36 ft or wider (a boulevard, a collector), the smallest that's still a roundabout, the largest; the lane, and the narrowest and widest it's set to; homes kept this far off; how far a click snaps to a junction
export const LOOP = { lane: 20, r: 25, walk: 10, island: 12, into: 3, len: [90, 170], reach: 250, tight: { lane: 16, r: 12, walk: 6, island: 6 } }; // ft: a one-way lane, its corner radius, the walk at the door, the narrowest island, how far its ends run into the drive, its length along the building, how far off the drive may be; tight: a compact loop where a building stands closer to its drive (a drop-off lane, the building's own walk, a curb island)
export const isRing = e => e?.kind === 'drive' && !!e.rb && e.path?.length >= 3, isLoop = e => e?.kind === 'drive' && !!e.loop && e.path?.length >= 3;
// a roundabout's middle c, outer radius R, its lane's centre line Rc, the island's radius Ri and the lane (read from its
// route, so moved, turned or scaled it stays right)
export function ringOf(e) { const P = e.path, n = P.length, c = [P.reduce((t, p) => t + p[0], 0) / n, P.reduce((t, p) => t + p[1], 0) / n], Rc = P.reduce((t, p) => t + Math.hypot(p[0] - c[0], p[1] - c[1]), 0) / n, lane = e.width || RING.lane; return { c, Rc, R: Rc + lane / 2, Ri: Rc - lane / 2, lane }; }
export const ringDisc = (c, R, n = 48) => Array.from({ length: n }, (_, i) => { const t = i / n * 2 * Math.PI; return [c[0] + R * Math.cos(t), c[1] + R * Math.sin(t)]; });
const p2 = p => [+p[0].toFixed(2), +p[1].toFixed(2)], lenOf = P => P.reduce((t, p, i) => i ? t + Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) : 0, 0);
const alongAt = (P, s) => { for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (s <= L || i === P.length - 1) { const t = L ? Math.max(0, Math.min(1, s / L)) : 0; return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], u: L ? [(b[0] - a[0]) / L, (b[1] - a[1]) / L] : [1, 0] }; } s -= L; } return { p: P[0], u: [1, 0] }; };
const ringNote = (R, lane) => 'Roundabout · ' + Math.round(2 * R) + ' ft across · ' + lane + ' ft lane';
// a roundabout's route laid out again: 32 points on its lane's centre line round c (counter-clockwise), its middle, box and note to match
function ringAt(e, c, R, lane = e.width || RING.lane) { return Object.assign(e, { path: ringDisc(c, R - lane / 2, 32).map(p2), width: lane, r: 0, closed: true, x: +c[0].toFixed(2), y: +c[1].toFixed(2), w: +(2 * R).toFixed(2), d: +(2 * R).toFixed(2), note: ringNote(R, lane) }); }
// a roundabout made bigger or smaller (its outer radius, held between RING.min and RING.max), its lane kept, or its
// lane made wider or narrower (held between RING.lanes, the island 10 ft across at the least) inside the same outer
// circle (the island gives); e is changed
export function resizeRing(e, R, lane = null) { const g = ringOf(e), R2 = Math.max(RING.min, Math.min(RING.max, +R || g.R)); return ringAt(e, g.c, R2, Math.min(R2 - 5, Math.max(RING.lanes[0], Math.min(RING.lanes[1], +lane || g.lane)))); }
// a roundabout's or a loop's planted island (an outline, plan feet), or null. A loop's: what it encloses with the drive
// its ends run into, 2 ft off that drive's curb (its ends run LOOP.into ft into it)
const islandCache = new WeakMap();
export function islandOf(e) {
  if (!isRing(e) && !isLoop(e)) return null;
  const key = e.width + '|' + e.r + '|' + e.path.join(';'), c0 = islandCache.get(e); if (c0 && c0.key === key) return c0.pts;
  let pts = null;
  if (isRing(e)) { const g = ringOf(e); pts = g.Ri > 4 ? ringDisc(g.c, g.Ri, 32) : null; }
  else { const P = e.path, ccw = r => signedArea(r) >= 0 ? r : r.slice().reverse(), cl = r => r.concat([r[0]]), line = fillet(P, Math.max(e.r ?? 0, 0));
    try { const q = polyclip.difference([cl(ccw(line))], [cl(ccw(shapeOf(e)))], [cl(ccw(band([P[0], P[P.length - 1]], 2 * ((e.loop.into ?? LOOP.into) + 2))))]).map(pp => pp[0].slice(0, -1)).sort((x, y) => ringArea(y) - ringArea(x))[0]; pts = q && ringArea(q) >= 200 ? q.map(p2) : null; } catch { pts = null; } }
  islandCache.set(e, { key, pts }); return pts;
}
// where streets meet: centre lines that cross, and the end of one inside another, gathered within 30 ft; a junction has
// three or more legs (runs of drive on a circle round it). [{ at, legs, widths (each leg across, ft), wide (the widest
// drive there), ids, names, entry (an entrance that ends there), parking (a row within 20 ft), main, score }], best
// first; main: the best that isn't in a parking field. Drive-thru lanes, turnarounds, loops and roundabouts aren't streets.
function junctionsAt(plan) {
  const ring = plan.ring || [], els = plan.elements || [], X = (a, b, c, d) => { const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-9) return null; const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den; return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null; };
  const L = els.filter(e => e.kind === 'drive' && e.note !== 'Drive-thru lane' && !e.turn && !e.bulb && !e.closed && !isRing(e) && !isLoop(e)).map((e, i) => { const r = routeOf(e, ring), s = shapeOf(e); return { i, e, P: fillet(r.path, Math.max(r.r ?? 30, 0)), W: r.width || 26, s, b: boxOfPts(s) }; }), G = gridIndex(L, l => l.b), cand = [];
  for (const A of L) for (const B of G.near(A.b[0] - 5, A.b[1] - 5, A.b[2] + 5, A.b[3] + 5)) { if (A === B) continue;
    if (A.i < B.i) for (let a = 0; a + 1 < A.P.length; a++) { const p = A.P[a], q = A.P[a + 1]; if (Math.max(p[0], q[0]) < B.b[0] || Math.min(p[0], q[0]) > B.b[2] || Math.max(p[1], q[1]) < B.b[1] || Math.min(p[1], q[1]) > B.b[3]) continue; for (let b = 0; b + 1 < B.P.length; b++) { const x = X(p, q, B.P[b], B.P[b + 1]); if (x) cand.push(x); } }
    for (const p of [A.P[0], A.P[A.P.length - 1]]) if (p[0] >= B.b[0] - 4 && p[0] <= B.b[2] + 4 && p[1] >= B.b[1] - 4 && p[1] <= B.b[3] + 4 && (inRing(p, B.s) || distToPoly(p, B.s) < 4)) { // an end in (or at) another drive: the nearest point on that one's centre line
      let best = null; for (let b = 0; b + 1 < B.P.length; b++) { const q = closest(p, B.P[b], B.P[b + 1]), d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (!best || d < best.d) best = { q, d }; } if (best && best.d < B.W / 2 + A.W) cand.push(best.q); }
  }
  const cl = []; for (const p of cand) { const c = cl.find(c => Math.hypot(c.p[0] - p[0], c.p[1] - p[1]) < 30); if (c) { c.n++; c.p = [c.p[0] + (p[0] - c.p[0]) / c.n, c.p[1] + (p[1] - c.p[1]) / c.n]; } else cl.push({ p: p.slice(), n: 1 }); }
  const ents = entrancesOf(els).map(e => { const r = routeOf(e, ring); return { e, end: r.path[r.path.length - 1] }; }), rows = els.filter(e => e.kind === 'parking').map(e => { const s = shapeOf(e); return { s, b: boxOfPts(s) }; }), RG = gridIndex(rows, r => r.b);
  const me = els.find(e => e.kind === 'drive' && e.name === 'Main entry'), m0 = me && ring.length >= 3 ? mouthOf(me, ring) : null, out = [];
  for (const { p } of cl) {
    const here = [...G.near(p[0] - 90, p[1] - 90, p[0] + 90, p[1] + 90)], wide = Math.max(0, ...here.filter(l => inRing(p, l.s) || distToPoly(p, l.s) < 2).map(l => l.W)), rho = Math.max(45, wide / 2 + 25), N = 144, on = [];
    for (let k = 0; k < N; k++) { const t = k / N * 2 * Math.PI, q = [p[0] + rho * Math.cos(t), p[1] + rho * Math.sin(t)]; on.push(here.some(l => q[0] >= l.b[0] && q[0] <= l.b[2] && q[1] >= l.b[1] && q[1] <= l.b[3] && inRing(q, l.s))); }
    const k0 = on.indexOf(false); if (k0 < 0) continue; // (inside a paved field)
    const runs = []; let cur = 0; for (let k = 1; k <= N; k++) { if (on[(k0 + k) % N]) cur++; else if (cur) { runs.push(cur); cur = 0; } }
    const widths = runs.map(n => Math.round(n / N * 2 * Math.PI * rho)).filter(w => w >= 12); if (widths.length < 3) continue;
    const disc = ringDisc(p, rho), at = here.filter(l => inRing(p, l.s) || polysOverlap(l.s, disc, 0)).map(l => l.e), names = [...new Set(at.map(e => e.name || e.note).filter(Boolean))].slice(0, 4);
    const entry = ents.find(x => Math.hypot(x.end[0] - p[0], x.end[1] - p[1]) <= 40)?.e.id ?? null, parking = [...RG.near(p[0] - 20, p[1] - 20, p[0] + 20, p[1] + 20)].some(r => inRing(p, r.s) || distToPoly(p, r.s) <= 20);
    out.push({ at: p.map(v => +v.toFixed(1)), legs: widths.length, widths, wide, ids: at.map(e => e.id), names, entry, parking, score: widths.reduce((t, w) => t + Math.min(60, w), 0) + (entry ? 15 : 0), m: m0 ? Math.hypot(p[0] - m0[0], p[1] - m0[1]) : 0 });
  }
  out.sort((a, b) => b.score - a.score || a.m - b.m); const main = out.find(j => !j.parking) || out[0];
  return out.map(({ m, ...j }, i) => ({ ...j, main: out[i] === main }));
}
// what a roundabout or a loop may not be laid over (homes, their lots and driveways, parking rows and plain lawn give
// way; streets are cut back to a roundabout)
const RING_HARD = ['building', 'garage', 'pond', 'pool', 'court', 'play', 'plaza', 'patio', 'trash', 'canopy', 'tanks', 'foodtruck', 'sign', 'keepout', 'truck'];
const blocks = o => RING_HARD.includes(o.kind) && !(o.kind === 'building' && HOME_USES.includes(o.use) || o.kind === 'plaza' && o.note === 'Driveway') || isPark(o) || o.kind === 'parking' && isFree(o) || o.kind === 'drive' && (o.note === 'Drive-thru lane' || isRing(o) || isLoop(o) || !!o.turn || !!o.bulb || !!o.closed || !!o.poly && !isEntrance(o));
const sigOf = e => JSON.stringify([e.x, e.y, e.w, e.d, e.rot || 0, e.path || null, e.width || null]); // (a piece's place and shape: one changed by hand since isn't put back)
// spaces in the rows of `before` that aren't in `after` less those in new rows (cutRows' pieces)
const lostStalls = (before, after) => { const b0 = new Set(before), a0 = new Set(after); let n = 0; for (const o of before) if (o.kind === 'parking' && !a0.has(o)) n += stalls(o).count; for (const o of after) if (o.kind === 'parking' && !b0.has(o)) n -= stalls(o).count; return n; };
// plain lawn (not a park or a median) cut back off an outline
function trimGreen(els, cut) {
  const cb = boxOfPts(cut), ccw = r => signedArea(r) >= 0 ? r : r.slice().reverse(), cl = r => r.concat([r[0]]);
  return els.flatMap(o => { if (o.kind !== 'green' || isPark(o) || isMedian(o)) return [o]; const s = shapeOf(o), b = boxOfPts(s); if (b[0] > cb[2] || b[2] < cb[0] || b[1] > cb[3] || b[3] < cb[1] || !polysOverlap(s, cut, 0.5)) return [o];
    let left; try { left = polyclip.difference([cl(ccw(s))], [cl(ccw(cut))]).map(pp => pp[0].slice(0, -1)).filter(r => ringArea(r) > 400).sort((x, y) => ringArea(y) - ringArea(x)); } catch { return [o]; }
    return left.map((r, i) => ({ ...o, ...(i ? { id: (o.id ?? 'g') + 'r' + i } : {}), poly: r.map(p2), ...xyOf(r) })); });
}
// split a centre line at the circle (c, Rc): the runs outside it, in order (the first starts at P[0] when that's outside)
function outsideRuns(P, c, Rc) {
  const inside = p => Math.hypot(p[0] - c[0], p[1] - c[1]) < Rc, runs = []; let cur = inside(P[0]) ? null : [P[0]];
  const cut = (a, b) => { const d = [b[0] - a[0], b[1] - a[1]], f = [a[0] - c[0], a[1] - c[1]], A = d[0] * d[0] + d[1] * d[1], B = 2 * (f[0] * d[0] + f[1] * d[1]), C = f[0] * f[0] + f[1] * f[1] - Rc * Rc, D = B * B - 4 * A * C; if (A < 1e-12 || D <= 1e-9) return []; const s = Math.sqrt(D); return [(-B - s) / (2 * A), (-B + s) / (2 * A)].filter(t => t > 0 && t < 1).map(t => [a[0] + d[0] * t, a[1] + d[1] * t]); };
  for (let i = 0; i + 1 < P.length; i++) { for (const x of cut(P[i], P[i + 1])) { if (cur) { cur.push(x); runs.push(cur); cur = null; } else cur = [x]; } if (cur) cur.push(P[i + 1]); }
  if (cur && cur.length > 1) runs.push(cur);
  return runs;
}
// the drives that run into a roundabout cut back to its lane's centre line: a straight aisle stays a rectangle, a bent
// or curved drive (an entrance made a route first) becomes the run of its centre line outside the ring (r 0: the curve
// already in its points). The run from its start keeps its id, name and an entrance's mouth; the others are new pieces
// with no name. Each is marked cut (the ring's id). A drive that ends on the ring already is left as it is. Returns
// { elements, cuts: [{ was (the drive as it was), ids, sig (each piece's shape as cut) }] }
function joinRing(plan, rb) {
  const { c, R, Rc } = ringOf(rb), disc = ringDisc(c, R), db = boxOfPts(disc), out = [], cuts = [], used = new Set((plan.elements || []).map(o => o.id)), idFor = (b, i) => { let k = i, x; do x = b + 'c' + k++; while (used.has(x)); used.add(x); return x; }; // (a stub's id: new on the plan, so two roundabouts on one street never give two pieces one id)
  for (const e of plan.elements || []) {
    if (e === rb || e.kind !== 'drive' || e.note === 'Drive-thru lane' || isRing(e) || isLoop(e) || e.turn || e.bulb || e.closed || e.poly && !isEntrance(e)) { out.push(e); continue; }
    const s = shapeOf(e), b = boxOfPts(s); if (b[0] > db[2] || b[2] < db[0] || b[1] > db[3] || b[3] < db[1] || !polysOverlap(s, disc, 0) && !inRing(c, s)) { out.push(e); continue; }
    const r = routeOf(e, plan.ring || []), line = fillet(r.path, Math.max(r.r ?? 30, 0));
    if (!line.some((p, i) => i && segDist(c, line[i - 1], p) < Rc - 0.05)) { out.push(e); continue; } // (it runs alongside, or ends on the ring already)
    const runs = outsideRuns(line, c, Rc).filter(q => lenOf(q) >= 8), k0 = Math.max(0, runs.findIndex(q => q[0] === line[0]));
    const stubs = runs.map((q, i) => {
      const P = q.map(p2), L = lenOf(P), mid = alongAt(P, L / 2).p, first = i === k0; let x;
      if (!e.path && !e.poly && P.length === 2 && L >= r.width) x = { ...e, x: +mid[0].toFixed(2), y: +mid[1].toFixed(2), ...(e.w >= e.d ? { w: +L.toFixed(2) } : { d: +L.toFixed(2) }) };
      else { x = { ...r, path: P, r: 0, x: +mid[0].toFixed(2), y: +mid[1].toFixed(2) }; if (!first || q[0] !== line[0]) { delete x.mouth; delete x.flare; } }
      if (!first) { x.id = idFor(e.id ?? 'd', i); for (const k of ['entry', 'blvd', 'signs', 'through', 'mouth', 'flare']) delete x[k]; x.name = ''; }
      x.cut = rb.id; return x; });
    cuts.push({ was: structuredClone(e), ids: stubs.map(x => x.id), sig: stubs.map(sigOf) }); out.push(...stubs);
  }
  return { elements: out, cuts };
}
// one street a roundabout cut back (k: one of its rb.cuts), put back as it was where every piece of it is still as it was
// cut (one changed by hand since stays as it is), and an entrance's median and signs as they were before the ring: what
// the ring drew for it taken off (k.made), what it took away put back, one taken off by hand since left off. Returns
// the elements, or null when it can't be put back
function uncut(els, id, k) {
  const st = k.ids.map(i => els.find(o => o.id === i && o.cut === id)); if (st.some((x, i) => !x || sigOf(x) !== k.sig[i])) return null;
  const at = st.length ? els.indexOf(st[0]) : els.length, gone = new Set(st); let out = els.filter(o => !gone.has(o)); out.splice(Math.min(at, out.length), 0, structuredClone(k.was));
  if (k.parts?.length) { const made = new Set(k.made || k.parts.map(x => x.id)), have = new Set(out.filter(o => made.has(o.id)).map(o => o.id)); out = out.filter(o => !made.has(o.id)).concat(k.parts.filter(x => !made.has(x.id) || have.has(x.id)).map(x => structuredClone(x))); }
  return out;
}
// a parking row a roundabout cut (k: one of its rb.rows), put back whole where every piece of it is still as it was cut
// and nothing built stands on it since (a pool deck the row ran a foot onto before, onto what's left of it too, is no
// reason to keep it short). Returns the elements, or null
function unrow(els, rb, k) {
  const st = k.now.map(g => els.find(o => o.kind === 'parking' && sigOf(o) === g)); if (st.some(x => !x)) return null; const ws = shapeOf(k.was), on = (a, o) => rectsOverlap({ poly: a }, { poly: shapeOf(o) }, 0.5);
  if (els.some(o => o !== rb && !(rb.id != null && o.id === rb.id) && blocks(o) && o.kind !== 'drive' && on(ws, o) && !st.some(x => on(shapeOf(x), o)))) return null;
  const gone = new Set(st), at = st.length ? els.indexOf(st[0]) : els.length, out = els.filter(o => !gone.has(o)); out.splice(Math.min(at, out.length), 0, structuredClone(k.was)); return out;
}
// the streets a roundabout cut back, put back as they were (uncut), and the parking it cut (unrow). Another roundabout
// that cut one of its pieces since (two on one street, or one parking row) lets go of its own first and is joined to the streets again
// after, so the street comes back whole whichever goes first. Returns the elements (rb among them still; such another one a copy, joined again)
export function unjoinRing(plan, rb) {
  let els = (plan.elements || []).slice(); if (!rb?.rb) return els;
  const is = (o, d) => o === d || d.id != null && o.id === d.id, dep = [rb];
  for (let i = 0; i < dep.length; i++) for (const o of els) if (isRing(o) && !dep.some(d => is(o, d)) && ((o.rb?.cuts || []).some(k => k.was?.cut != null && k.was.cut === dep[i].id) || (o.rb?.rows || []).some(k => (dep[i].rb?.rows || []).some(q => q.now.includes(sigOf(k.was)))))) dep.push(o); // (one that cut a street or a parking row this one had cut)
  const todo = dep.map(d => ({ d, ks: (d.rb?.cuts || []).slice().reverse() })); let more = true;
  while (more) { more = false; for (const t of todo.slice().reverse()) t.ks = t.ks.filter(k => { const r = uncut(els, t.d.id, k); if (!r) return true; els = r; more = true; return false; }); } // (the last cut first, in as many passes as it takes)
  for (const t of todo.slice().reverse()) for (const k of (t.d.rb?.rows || []).slice().reverse()) els = unrow(els, t.d, k) || els; // (and the parking it cut)
  for (const t of todo.slice(1)) { const i = els.findIndex(o => is(o, t.d)); if (i < 0) continue; const d2 = { ...els[i], rb: { ...els[i].rb, cuts: t.ks.reverse(), rows: [] } }; els[i] = d2; els = fitRing({ ...plan, elements: els }, d2, { force: true }).elements; }
  return els;
}
// a roundabout (rb, set where it goes) joined to the streets there: inside the lot (off the lot lines that aren't streets
// by the landscape buffer) and clear of buildings, amenities, ponds, parks and the drives that can't be cut back (else
// out, or hit: the piece in the way). The homes under it (and RING.pad round it) make way with their lots and driveways,
// the other lots are cut back off it, the rows under it are cut and plain lawn trimmed; then the streets are cut back to
// it and an entrance cut back gets its median and signs drawn again. force: joined even with something in the way (a
// roundabout moved by hand: the checks show it). Returns { ok, elements (rb last), gone (homes), stalls (spaces lost),
// out, hit, why (where an entrance's signs went) }
export function fitRing(plan, rb, opts = {}) {
  const { c, R, Ri } = ringOf(rb), d2 = ringDisc(c, R + 2), db = boxOfPts(d2), inB = b => b[0] < db[2] && b[2] > db[0] && b[1] < db[3] && b[3] > db[1];
  const els0 = (plan.elements || []).filter(o => o !== rb && (rb.id == null || o.id !== rb.id)), P0 = { ...plan, elements: els0 }, near = o => inB(boxOfPts(shapeOf(o))) && polysOverlap(shapeOf(o), d2, 0.5);
  const had = new Map(entrancesOf(els0).filter(near).map(e => [e, entryParts(P0, e)])), mine = new Set([...had.values()].flat()); // (an entrance cut back: its median and signs are drawn again)
  const b0 = ringBlocked(P0, c, R, mine), out = b0.out; let hit = b0.hit;
  if ((out || hit) && !opts.force) return { ok: false, out, hit, elements: plan.elements || [], gone: 0, stalls: 0, why: '' };
  const gone = homesUnder(P0, { kind: 'drive', poly: ringDisc(c, R + RING.pad) }, 0);
  for (const dw of els0) if (dw.kind === 'plaza' && dw.note === 'Driveway' && !gone.has(dw) && near(dw)) { gone.add(dw); const h = els0.filter(h => h.kind === 'building' && HOME_USES.includes(h.use) && Math.hypot(h.x - dw.x, h.y - dw.y) < 120).map(h => ({ h, g: gapBetween(shapeOf(h), shapeOf(dw)) })).filter(x => x.g <= 15).sort((a, b) => a.g - b.g)[0]?.h; if (h) for (const x of homesUnder(P0, { kind: 'drive', poly: grow(shapeOf(h), -1) }, 0)) gone.add(x); } // (a home whose driveway it takes: its driveway can stand a little off it on a bent street)
  const left = els0.filter(o => !gone.has(o)); let els = trimGreen(cutRows(trimLots(left, { poly: d2 }), d2, 1), d2); const lost = lostStalls(left, els);
  const kept = new Set(els), was = new Set(left), xk = x => [x.x, x.y, x.w, x.d, x.rot || 0].join(), made = els.filter(o => o.kind === 'parking' && !was.has(o)), rows = left.filter(o => o.kind === 'parking' && !kept.has(o)).map(o => ({ was: structuredClone(o), now: made.filter(q => xk(q.ext) === xk(o.ext || o)).map(sigOf) })); // (the rows it cut, as they were: taken away, they come back)
  const J = joinRing({ ...plan, elements: els }, rb); els = J.elements;
  for (const k of J.cuts) { const e0 = [...had.keys()].find(e => e.id === k.was.id); if (e0) k.parts = had.get(e0).map(x => structuredClone(x)); }
  rb.rb = { ...(rb.rb || {}), lane: ringOf(rb).lane, cuts: [...(rb.rb?.cuts || []), ...J.cuts], rows: [...(rb.rb?.rows || []), ...rows] };
  const inner = grow(ringDisc(c, Ri, 32), -1); hit ||= els.find(o => o.kind === 'drive' && o !== rb && inB(boxOfPts(shapeOf(o))) && (polysOverlap(shapeOf(o), inner, 0.5) || acrossRing(plan, o, c, R, R - RING.lane / 2, opts.force ? -1 : 3))) || null; // (a drive that passes by it, too close to be cut back: over its island, or across its lane)
  const whys = []; for (const [e0, h] of had) { const st = els.find(o => o.id === e0.id && isEntrance(o)); if (!st || st === e0) continue; const r = refreshEntry({ ...plan, elements: els.concat([rb]) }, st, null, h, true); els = r.elements.filter(o => o !== rb); if (r.why) whys.push(r.why); } // (with the ring there: its depth in is to the ring)
  for (const k of J.cuts) if (k.parts) { const st = els.find(o => o.id === k.was.id && isEntrance(o)); k.made = st ? entryParts({ ...plan, elements: els }, st).map(x => x.id) : []; } // (what it has now: taken away again with the ring)
  return { ok: !out && !hit, out, hit, elements: els.concat([rb]), gone: [...gone].filter(o => o.kind === 'building').reduce((t, h) => t + (h.units ?? 1), 0), stalls: lost, why: whys.join(' ') };
}
// a drive over a roundabout's lane (c, R) that doesn't run into it: its centre line comes nearest the middle somewhere
// along it, or at an end off the ring, so it runs alongside or past the ring, too far out to be cut back to it, across
// its lane (a street cut back to the ring, one that ends on its lane, or one that runs into its lane's centre line Rc
// and so is cut back to it, meets it). off: how far past the outer circle it counts (-1: over the lane; a new one keeps
// 3 ft off a street it doesn't join, so the paving doesn't run together)
function acrossRing(plan, o, c, R, Rc = R - RING.lane / 2, off = -1) {
  if (o.kind !== 'drive' || isRing(o) || isLoop(o) || o.note === 'Drive-thru lane') return false; const s = shapeOf(o), b = boxOfPts(s);
  if (b[0] > c[0] + R + off || b[2] < c[0] - R - off || b[1] > c[1] + R + off || b[3] < c[1] - R - off || !polysOverlap(s, ringDisc(c, R + off, 32), 0.5)) return false;
  const r = routeOf(o, plan.ring || []); if (!r) return false; const L = fillet(r.path, Math.max(r.r ?? 30, 0)); let best = Infinity, at = null;
  for (let i = 1; i < L.length; i++) { const q = closest(c, L[i - 1], L[i]), d = Math.hypot(q[0] - c[0], q[1] - c[1]); if (d < best - 1e-6) { best = d; at = q; } }
  if (!at || best < Rc - 0.05) return false; const end = [L[0], L[L.length - 1]].find(p => Math.hypot(at[0] - p[0], at[1] - p[1]) <= 0.5); return !end || Math.hypot(end[0] - c[0], end[1] - c[1]) > R + 0.5; // (a street that ends beside it, at another street's corner, doesn't meet it either)
}
// what keeps a roundabout (middle c, outer radius R) off: out, it runs outside the lot or into a landscape buffer (a
// street lot line it may meet); hit, the first piece in the way that can't give way or a street across its lane
// (skip: an entrance's own parts)
function ringBlocked(plan, c, R, skip = new Set()) {
  const ring = plan.ring || [], d2 = ringDisc(c, R + 2), db = boxOfPts(d2); let out = false;
  if (ring.length >= 3) { const rules = edgeRules(ring, plan.front, plan.setbacks, plan.streets); out = !ringDisc(c, R).every(p => inRing(p, ring)) || ring.some((a, k) => segDist(c, a, ring[(k + 1) % ring.length]) - R < (rules[k].role === 'front' || rules[k].street ? 0.5 : Math.max(0.5, rules[k].pave)) - 0.5); }
  const hit = (plan.elements || []).find(o => !skip.has(o) && (blocks(o) && (b => b[0] < db[2] && b[2] > db[0] && b[1] < db[3] && b[3] > db[1])(boxOfPts(shapeOf(o))) && polysOverlap(shapeOf(o), d2, 0.5) || acrossRing(plan, o, c, R, R - RING.lane / 2, 3))) || null; // (and a street alongside, too far out to be cut back to it)
  return { out, hit };
}
// the streets a junction's names say, in words: "Main drive, a 24 ft drive and a 28 ft street"
export const meetsWord = names => { const ws = [...new Set((names || []).map(n => (m => m ? 'a ' + m[1] + ' ft street' : /^\d+ ft /.test(n) ? 'a ' + n : n)(/^Street · (\d+) ft/.exec(n))))]; return ws.length > 1 ? ws.slice(0, -1).join(', ') + ' and ' + ws[ws.length - 1] : ws[0] || 'the streets'; };
const nextName = (els, base) => { const have = new Set(els.map(e => e.name)); if (!have.has(base)) return base; let n = 2; while (have.has(base + ' ' + n)) n++; return base + ' ' + n; };
const homesWord = n => n + (n === 1 ? ' home' : ' homes') + ' made way for it.';
// the outer radii a roundabout at junction j is tried at, biggest first: R0 asked, then 5 ft smaller each to RING.min;
// else 60 ft down to 45 where a leg is 36 ft wide or more (a boulevard, a collector), 50 down to 40 at local streets
const ringSizes = (j, R0) => +R0 > 0 ? (R => Array.from({ length: Math.floor((R - RING.min) / 5) + 1 }, (_, i) => R - 5 * i))(Math.max(RING.min, Math.min(RING.max, +R0))) : j.wide >= 36 ? [RING.big, RING.big - 5, RING.R, RING.R - 5] : [RING.R, RING.R - 5, RING.min];
// a roundabout where streets meet near p (plan feet): the junction nearest p within opts.snap ft (opts.near: when that
// one has no room, the next four nearest that have room at their smallest, and the note says where it went). Its size:
// opts.R (outer radius) and 5 ft smaller until it fits, else 120 ft across where a boulevard or collector meets it and
// 100 ft at local streets, smaller where that won't fit, 80 ft at the least (90 where a boulevard or collector meets it). Named Roundabout (2, 3…) and pinned. Returns { elements, roundabout, note, at, meets }
// or { error }
// homes left where their street doesn't reach (a lot marched past the end of its street on a slanted edge, or a street cut
// back for a roundabout: more than 60 ft from any drive) or on a lot past the property line: taken out with their lots and
// driveways, never handed over (lib/planaudit.mjs fails both). -> { elements, gone: homes taken out }
export function dropStrandedHomes(plan, els) {
  const ring = plan.ring, drives = els.filter(e => e.kind === 'drive').map(e => { const q = shapeOf(e), b = boxOfPts(q); return { q, b: [b[0] - 60, b[1] - 60, b[2] + 60, b[3] + 60] }; }), lots = els.filter(e => e.kind === 'lot');
  const onLine = p => inRing(p, ring) || ring.some((a, i) => segDist(p, a, ring[(i + 1) % ring.length]) < 1), gone = new Set(); let n = 0;
  for (const h of els) {
    if (h.kind !== 'building' || h.use !== 'sfr') continue;
    const hs = shapeOf(h), lot = lots.find(l => inRing([h.x, h.y], shapeOf(l)));
    const r = Math.max(h.w || 0, h.d || 0); // (the box test on the home's middle: a home 40 ft off its street can have its middle 65 ft off)
    if (drives.some(d => h.x > d.b[0] - r && h.x < d.b[2] + r && h.y > d.b[1] - r && h.y < d.b[3] + r && gapBetween(hs, d.q) <= 60) && (!lot || shapeOf(lot).every(onLine))) continue;
    gone.add(h); n++; if (lot) { gone.add(lot); const ls = shapeOf(lot); for (const e of els) if (e.kind === 'plaza' && !isFree(e) && inRing([e.x, e.y], ls)) gone.add(e); }
  }
  for (const l of lots) if (!gone.has(l) && !shapeOf(l).every(onLine)) { const ls = shapeOf(l); if (!els.some(h => h.kind === 'building' && HOME_USES.includes(h.use) && !gone.has(h) && inRing([h.x, h.y], ls))) gone.add(l); } // (a lot with no home that runs past the lot line: gone too)
  return { elements: gone.size ? els.filter(e => !gone.has(e)) : els, gone: n };
}
export function addRoundabout(plan, p, opts = {}) {
  const els = plan.elements || [], snap = opts.snap ?? RING.snap, J = junctionsOf(plan).map(j => ({ ...j, d: Math.hypot(j.at[0] - p[0], j.at[1] - p[1]) })).filter(j => j.d <= snap).sort((a, b) => a.d + (a.parking ? 60 : 0) - b.d - (b.parking ? 60 : 0)); // (a street junction before a parking aisle's a little nearer: the tool marks the streets')
  if (!J.length) return { error: 'No junction of streets near there: a roundabout goes where two or more streets meet. Click nearer a junction.' };
  const rings = els.filter(isRing).map(ringOf); let err = null, miss = null;
  const skip = opts.near ? new Set(entrancesOf(els).flatMap(e => entryParts(plan, e))) : null, room = j => ringSizes(j, opts.R).some(R => (b => !b.out && !b.hit)(ringBlocked(plan, j.at, R, skip)));
  for (const j of opts.near ? [J[0], ...J.slice(1).filter(room)].slice(0, 5) : J.slice(0, 1)) { // (near: the nearest, then the next four with room at their smallest)
    if (rings.some(g => Math.hypot(g.c[0] - j.at[0], g.c[1] - j.at[1]) < 2 * g.R)) { err ||= { error: 'There’s a roundabout at that junction already.' }; continue; }
    const Rs = ringSizes(j, opts.R);
    let hit = null, out = false, got = null;
    for (const R of Rs) { // (the biggest that fits; with no size asked and more than two homes in its way, a smaller one that keeps two or more of them)
      const rb = ringAt({ id: opts.id || newId(), kind: 'drive', rot: 0, name: opts.name || nextName(els, 'Roundabout'), rb: { lane: RING.lane, cuts: [] }, pinned: true }, j.at, R, RING.lane), r = fitRing(plan, rb);
      if (!r.ok) { if (!got) { hit ||= r.hit; out ||= r.out; } continue; }
      if (!got || r.gone <= got.r.gone - 2) got = { R, r, rb, big: got?.big || got }; if (opts.R || got.r.gone <= 2) break;
    }
    if (got) { const { R, r, rb, big } = got, notes = [];
      if (big) notes.push(Math.round(2 * R) + ' ft across: a ' + Math.round(2 * big.R) + ' ft one would take ' + big.r.gone + (big.r.gone === 1 ? ' home' : ' homes') + (r.gone ? ', this one ' + r.gone : '') + '.'); else if (R < Rs[0]) notes.push(Math.round(2 * R) + ' ft across: a ' + Math.round(2 * Rs[0]) + ' ft one didn’t fit (' + (hit ? wordOf(hit) : 'the lot line') + ').');
      if (j !== J[0]) notes.push('The nearest junction had no room (' + (miss || 'something') + ' in the way), so it’s at the next one, ' + Math.round(j.d) + ' ft from where it was asked.');
      const sd = dropStrandedHomes(plan, r.elements), gone = r.gone + sd.gone; // (a home whose street was cut back for the ring)
      if (gone) notes.push(homesWord(gone)); if (r.stalls > 0) notes.push(spacesWord(r.stalls) + ' gave way.'); if (r.why) notes.push(r.why);
      return { elements: sd.elements, roundabout: rb, note: notes.join(' '), at: j.at, meets: j.names };
    }
    miss ||= hit ? wordOf(hit) : 'the lot line';
    err ||= { error: 'No room for a roundabout at that junction: ' + (hit ? wordOf(hit) + ' is in the way' : 'it would run outside the lot or into the landscape buffer') + ' (even at ' + Math.round(2 * Rs[Rs.length - 1]) + ' ft across). Try another junction.', hit };
  }
  return err;
}
// a roundabout or a loop moved, turned, resized or nudged (by hand or by the AI). A roundabout lets go of the streets it
// cut (unjoinRing), settles on the nearest junction within 40 ft (opts.free: where it was put) at its own size (held
// between RING.min and RING.max), and is joined to the streets there (fitRing, forced: something hard in the way leaves
// it red and why says what); a loop's ends run into the drive again (seatLoop). e (one of plan.elements) is changed in
// place. Returns { elements, note, why }
export function reseat(plan, e, opts = {}) {
  if (isLoop(e)) { const r = seatLoop(plan, e); if (r.why) return { note: '', ...r }; const h = placeLoop({ ...plan, elements: r.elements }, e).hit; return { elements: r.elements, note: '', why: h ? (e.name || 'Drop-off loop') + ' runs into ' + h + ' where it is now' + (h === 'too little room for its island' ? '' : ': turn it back or move it clear') + '.' : '' }; } // (what it runs into said, as the checks show it)
  if (!isRing(e)) return { elements: plan.elements || [], note: '', why: '' };
  const els = unjoinRing(plan, e).filter(o => o !== e), g0 = ringOf(e); ringAt(e, g0.c, Math.max(RING.min, Math.min(RING.max, g0.R)), g0.lane); e.rb = { ...e.rb, cuts: [], rows: [] };
  if (!opts.free) { const j = junctionsOf({ ...plan, elements: els }).map(j => ({ j, d: Math.hypot(j.at[0] - e.x, j.at[1] - e.y) })).filter(x => x.d <= 40).sort((a, b) => a.d - b.d)[0]; if (j && j.d > 0.05) ringAt(e, j.j.at, ringOf(e).R); }
  const r = fitRing({ ...plan, elements: els }, e, { force: true }), nm = e.name || 'Roundabout';
  return { elements: r.elements, note: [r.gone ? homesWord(r.gone) : '', r.stalls > 0 ? spacesWord(r.stalls) + ' gave way.' : '', r.why].filter(Boolean).join(' '), why: r.out ? nm + ' runs outside the lot or into the landscape buffer.' : r.hit ? nm + ' runs into ' + wordOf(r.hit) + '.' : '' };
}
// a roundabout taken away: the streets and parking it cut put back (the homes that made way come back only with a re-fit)
export const dropRing = (plan, e) => unjoinRing(plan, e).filter(o => o !== e && (e.id == null || o.id !== e.id));
// a re-fit's plan with its pinned roundabouts joined to the streets just laid out (their cuts made again: the homes and
// rows laid under one make way) and its loops' ends run into the drives again. Returns the elements
export function seatAll(plan) {
  let els = plan.elements || [];
  for (const e of els.filter(isRing)) { const have = new Set(els.map(o => o.id)); e.rb = { ...e.rb, cuts: (e.rb?.cuts || []).filter(k => k.ids.length && k.ids.every(id => have.has(id))), rows: [] }; /* (the rows are laid out again) */ els = fitRing({ ...plan, elements: els }, e, { force: true }).elements; }
  for (const e of els.filter(isLoop)) { els = seatLoop({ ...plan, elements: els }, e, { stretch: 12 }).elements; const b = loopOf({ ...plan, elements: els }, e); if (b && b.id !== e.loop.of) e.loop = { ...e.loop, of: b.id }; } // (its building laid out again under a new id: the loop goes with that one)
  return els;
}
// the building a drop-off loop is in front of: its own (loop.of), else (laid out again since, under a new id) the
// building that isn't a home nearest its run past the door, within 15 ft of it. null when there's none
export function loopOf(plan, e) {
  const els = plan.elements || [], b = isLoop(e) && els.find(o => o.id === e.loop.of && o.kind === 'building'); if (!isLoop(e) || b) return b || null;
  const P = e.path, run = shapeOf({ kind: 'drive', path: P.slice(1, P.length - 1), width: e.width || LOOP.lane, r: 0 }), rb = boxOfPts(run);
  return els.filter(o => o.kind === 'building' && !HOME_USES.includes(o.use) && (b => b[0] < rb[2] + 15 && b[2] > rb[0] - 15 && b[1] < rb[3] + 15 && b[3] > rb[1] - 15)(boxOfPts(outline(o)))).map(o => ({ o, g: gapBetween(outline(o), run) })).filter(x => x.g <= 15).sort((x, y) => x.g - y.g)[0]?.o || null;
}
// the drives a loop's ends may run into (not itself, another loop or a drive-thru lane)
const loopDrives = (els, e) => els.filter(o => o !== e && !(e?.id != null && o.id === e.id) && o.kind === 'drive' && o.note !== 'Drive-thru lane' && !isLoop(o)).map(o => { const s = shapeOf(o); return { o, s, b: boxOfPts(s) }; });
const inAny = (D, q) => D.find(d => q[0] >= d.b[0] && q[0] <= d.b[2] && q[1] >= d.b[1] && q[1] <= d.b[3] && inRing(q, d.s));
// a drop-off loop's ends run out along its legs into the drive they meet, LOOP.into ft past its curb; its label point on
// its island. e (one of plan.elements) is changed in place; why when an end meets no drive within reach (left as it was).
// opts.stretch: a leg made at most that much longer than it is (a re-fit: the drive it hung off laid again where it was,
// or it's left as it was and said, never run on across the site to the next drive)
export function seatLoop(plan, e, opts = {}) {
  const els = plan.elements || []; if (!isLoop(e)) return { elements: els, why: '' };
  const P = e.path, n = P.length, into = e.loop.into ?? LOOP.into, D = loopDrives(els, e), end = (B, A) => { const L = Math.hypot(A[0] - B[0], A[1] - B[1]) || 1, u = [(A[0] - B[0]) / L, (A[1] - B[1]) / L], far = opts.stretch != null ? Math.min(LOOP.reach, L - into + opts.stretch) : LOOP.reach; for (let t = (e.width || LOOP.lane) / 2 + 1; t <= far; t += 0.5) { if (inAny(D, [B[0] + u[0] * t, B[1] + u[1] * t])) return p2([B[0] + u[0] * (t + into), B[1] + u[1] * (t + into)]); } return null; };
  const a = end(P[1], P[0]), d = end(P[n - 2], P[n - 1]); if (!a || !d) return { elements: els, why: (e.name || 'Drop-off loop') + ' doesn’t reach a drive at both ends.' };
  e.path = [a, ...P.slice(1, n - 1), d]; const isl = islandOf(e); if (isl) Object.assign(e, xyOf(isl)); return { elements: els, why: '' };
}
// a loop's ground made ready: inside the lot, clear of buildings, amenities, ponds and the drives other than the one its
// ends run into; the homes under it make way, the rows under it are cut, plain lawn trimmed, and a park beside it gives
// up the strip it needs when it keeps 60% or more. Returns { elements (without e), gone, stalls, parks: [[name, sf]] } or { hit }
function placeLoop(plan, e) {
  const ring = plan.ring || [], els = plan.elements || [], o = shapeOf(e), isl = islandOf(e); if (!isl || ringArea(isl) < 300) return { hit: 'too little room for its island' };
  if (ring.length >= 3) { const rules = edgeRules(ring, plan.front, plan.setbacks, plan.streets); if (!o.every(p => inRing(p, ring)) || ring.some((a, k) => !(rules[k].role === 'front' || rules[k].street) && o.some(p => segDist(p, a, ring[(k + 1) % ring.length]) < rules[k].pave - 0.5))) return { hit: 'the lot line' }; }
  const zone = [grow(o, 2), grow(isl, 2)], zb = boxOfPts(zone.flat()), inB = s => { const b = boxOfPts(s); return b[0] < zb[2] && b[2] > zb[0] && b[1] < zb[3] && b[3] > zb[1]; }, inner = grow(o, -1), P = e.path;
  const ends = new Set(loopDrives(els, e).filter(d => inRing(P[0], d.s) || inRing(P[P.length - 1], d.s)).map(d => d.o));
  for (const x of els) { if (x === e || isPark(x)) continue; const s = shapeOf(x); if (!inB(s)) continue;
    if (x.kind === 'drive') { if (!ends.has(x) && polysOverlap(s, inner, 0.5) || polysOverlap(s, ends.has(x) ? grow(isl, -1) : isl, 0.5)) return { hit: wordOf(x) }; continue; } // (the drive it hangs off may meet its lane, never its island)
    if (blocks(x) && zone.some(z => polysOverlap(s, z, 0.5))) return { hit: wordOf(x) }; }
  const P0 = { ...plan, elements: els }, gone = new Set([...homesUnder(P0, { kind: 'drive', poly: grow(o, RING.pad) }, 0), ...homesUnder(P0, { kind: 'drive', poly: isl }, 0)]), left = els.filter(x => x !== e && !gone.has(x));
  let out = left; for (const z of zone) out = trimGreen(cutRows(trimLots(out, { poly: z }), z, 1), z);
  const parks = [], ccw = r => signedArea(r) >= 0 ? r : r.slice().reverse(), cl = r => r.concat([r[0]]); let hit = null;
  out = out.map(x => { if (hit || !isPark(x) || !inB(shapeOf(x)) || !zone.some(z => polysOverlap(shapeOf(x), z, 0.5))) return x; const s = shapeOf(x);
    let keep = null; try { keep = polyclip.difference([cl(ccw(s))], ...zone.map(z => [cl(ccw(z))])).map(pp => pp[0].slice(0, -1)).sort((a, b) => ringArea(b) - ringArea(a))[0]; } catch { keep = null; }
    if (!keep || ringArea(keep) < 0.6 * ringArea(s)) { hit = wordOf(x); return x; } const y = { ...x, poly: keep.map(p2), ...xyOf(keep) }; parks.push([x.name, ringArea(s) - ringArea(keep), { was: structuredClone(x), sig: sigOf(y) }]); return y; });
  if (hit) return { hit };
  const kept = new Set(out), was = new Set(left), xk = x => [x.x, x.y, x.w, x.d, x.rot || 0].join(), made = out.filter(x => x.kind === 'parking' && !was.has(x)), rows = left.filter(x => x.kind === 'parking' && !kept.has(x)).map(x => ({ was: structuredClone(x), now: made.filter(q => xk(q.ext) === xk(x.ext || x)).map(sigOf) })); // (the rows it cut and the park it trimmed, as they were: taken away, they come back)
  return { elements: out, gone: [...gone].filter(x => x.kind === 'building').reduce((t, h) => t + (h.units ?? 1), 0), stalls: lostStalls(left, out), parks, rows };
}
// a one-way drop-off loop (a circle drive) in front of building b (not a home): between its front (local −v) and the
// drive that runs along it, its lane LOOP.walk ft off the face and its island between the lane and that drive (about
// 44 ft from the face to the drive's curb in all; a compact one, LOOP.tight, from 30 ft: the building's own walk, a 16 ft
// lane and a curb island); when the front is too close or blocked, the side whose drive is nearest that has room. Driven in at one end and out at the other with the building on the right. Its length along the
// face: opts.len, else the face's and 10 ft, 90 to 170 ft; slid up to 30 ft along the face to clear what's in the way.
// Homes, rows, lawn and a park beside it give way (placeLoop). Returns { elements, loop, side (front, back or side), note }
// or { error }
export function addLoop(plan, b, opts = {}) {
  if (b?.kind !== 'building' || HOME_USES.includes(b.use)) return { error: 'A drop-off loop goes in front of a clubhouse, school, shop, hotel or office.' };
  const ring = plan.ring || [], els = plan.elements || [], T = LOOP.tight, needOf = q => q.walk + q.lane + q.island + 2, need = needOf(LOOP), needT = needOf(T), nm = b.name || 'the building', D = loopDrives(els, null);
  const dw = d => d.name || 'the ' + (/^street\b/i.test(d.note || '') ? 'street' : Math.round(routeOf(d, ring)?.width || 26) + ' ft drive');
  const sides = [[0, -1, 'front'], [0, 1, 'back'], [1, 0, 'side'], [-1, 0, 'side']].map(([u, v, word]) => {
    const n = rot([u, v], b.rot || 0), h = u ? b.w / 2 : b.d / 2, len = u ? b.d : b.w, s = rot(n, -90), m = [b.x + n[0] * h, b.y + n[1] * h];
    const probe = k => { const o = [m[0] + s[0] * k * len / 3, m[1] + s[1] * k * len / 3]; for (let t = 1; t <= LOOP.reach; t++) { const x = inAny(D, [o[0] + n[0] * t, o[1] + n[1] * t]); if (x) return { t, d: x.o }; } return null; };
    const g = probe(0), along = !!g && [-1, 1].every(k => { const x = probe(k); return x && Math.abs(x.t - g.t) <= 30; });
    return { n, s, m, len, word, g: g && along ? g.t : null, d: g?.d };
  });
  const order = [sides[0], ...sides.slice(1).sort((x, y) => (x.g ?? 1e9) - (y.g ?? 1e9))], why = new Map();
  for (const sd of order) {
    if (sd.g == null) { why.set(sd, 'no drive runs along its ' + sd.word); continue; }
    if (sd.g < needT) { why.set(sd, 'its ' + sd.word + ' is ' + sd.g + ' ft from ' + dw(sd.d)); continue; }
    const q = sd.g >= need ? LOOP : T, lane = q.lane, tight = q === T; // (closer than a full loop needs: a compact one, a 16 ft lane by the building's own walk)
    const Lw = Math.max(LOOP.len[0], Math.min(LOOP.len[1], +opts.len || sd.len + 10)), a = (Lw - lane) / 2, tB = q.walk + lane / 2; let hit = null;
    for (const sl of [0, 15, -15, 30, -30]) {
      const at = (x, t) => p2([sd.m[0] + sd.s[0] * (x + sl) + sd.n[0] * t, sd.m[1] + sd.s[1] * (x + sl) + sd.n[1] * t]);
      const e = { id: opts.id || newId(), kind: 'drive', path: [at(-a, sd.g + LOOP.into), at(-a, tB), at(a, tB), at(a, sd.g + LOOP.into)], width: lane, r: q.r, x: 0, y: 0, w: Lw, d: +(sd.g + LOOP.into - q.walk).toFixed(2), rot: b.rot || 0, name: opts.name || nextName(els, 'Drop-off loop'), note: 'Drop-off loop · one way · ' + lane + ' ft', loop: { of: b.id, into: LOOP.into }, pinned: true };
      if (seatLoop({ ...plan, elements: els }, e).why) { hit ||= 'the drive it would meet'; continue; }
      const r = placeLoop({ ...plan, elements: els }, e); if (r.hit) { hit ||= r.hit; continue; }
      const front = order[0], notes = [];
      if (sd !== front) notes.push('On the ' + sd.word + ' facing ' + dw(sd.d) + ': ' + why.get(front) + (front.g != null && front.g < needT ? ', too close for a loop and its island (about ' + needT + ' ft at the least)' : '') + '.');
      if (tight) notes.push('A compact loop: its ' + sd.word + ' is ' + sd.g + ' ft from ' + dw(sd.d) + ', so the lane is ' + lane + ' ft, beside the building’s own walk, with a narrow island (a full loop needs about ' + need + ' ft).');
      if (r.stalls > 0) notes.push(spacesWord(r.stalls) + ' gave way.'); if (r.gone) notes.push(homesWord(r.gone)); for (const [pn, sf] of r.parks) notes.push(pn + ' gave up ' + (Math.round(sf / 100) * 100).toLocaleString('en-US') + ' sf.');
      e.loop = { ...e.loop, rows: r.rows, parks: r.parks.map(x => x[2]) };
      return { elements: r.elements.concat([e]), loop: e, side: sd.word, note: notes.join(' ') };
    }
    why.set(sd, 'its ' + sd.word + ' runs into ' + hit);
  }
  const f = order[0], close = f.g != null && f.g < needT, rest = [...new Set(order.slice(1).map(sd => why.get(sd)).filter(Boolean))];
  return { error: 'No room for a drop-off loop at ' + nm + ': ' + why.get(f) + (close ? ' (a loop and its island need about ' + needT + ' ft at the least)' : '') + (rest.length ? ', and ' + rest.join(', ') : '') + '. ' + (close ? 'Move it back about ' + (needT - f.g) + ' ft first, or pick another building.' : 'Make room in front of it first, or pick another building.') };
}
// a drop-off loop taken away: the parking rows it cut and the park strip it took put back where they're still as it
// left them (a park changed since stays as it is)
export function dropLoop(plan, e) {
  let els = (plan.elements || []).filter(o => o !== e && (e.id == null || o.id !== e.id));
  for (const k of (e.loop?.rows || []).slice().reverse()) els = unrow(els, e, k) || els;
  for (const k of e.loop?.parks || []) { const i = els.findIndex(o => o.id === k.was.id && isPark(o) && sigOf(o) === k.sig); if (i >= 0) els[i] = structuredClone(k.was); }
  return els;
}
// what a re-fit keeps off for a pinned loop: its outline and 4 ft round it, and its island, both held 6 ft back from
// the curb of the drive it hangs off (its ends run into ft past it), so that drive is laid again where it was (a
// re-fit's aisle can sit a foot or two off the old one; kept off any nearer, it was dropped and the loop left hanging)
export function loopKeep(e) {
  const P = e.path, n = P.length, into = e.loop?.into ?? LOOP.into, m = 6, k = into + m + 4, cut = (A, B) => { const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, t = Math.min(k, L - 1); return [A[0] + (B[0] - A[0]) / L * t, A[1] + (B[1] - A[1]) / L * t]; };
  const isl = islandOf(e), ccw = r => signedArea(r) >= 0 ? r : r.slice().reverse(), cl = r => r.concat([r[0]]); let held = null;
  if (isl) try { held = polyclip.difference([cl(ccw(isl))], [cl(ccw(band([P[0], P[n - 1]], 2 * (into + m))))]).map(pp => pp[0].slice(0, -1)).sort((x, y) => ringArea(y) - ringArea(x))[0] || null; } catch { held = isl; }
  return [grow(shapeOf({ ...e, path: [cut(P[0], P[1]), ...P.slice(1, n - 1), cut(P[n - 1], P[n - 2])] }), 4), held].filter(Boolean);
}
// one-way arrows on each drop-off loop: a white chevron on its centre line halfway down each straight stretch of it (its
// legs past the drive it hangs off and short of the curves, and its run past the door) 12 ft long or more, pointing the
// way it's driven. Lines in plan feet with their colour (as entryMarks)
export function loopMarks(plan) {
  const out = [];
  for (const e of (plan.elements || []).filter(isLoop)) { const P = e.path, n = P.length, r = Math.max(e.r ?? 0, 0), off = (e.loop.into ?? LOOP.into) + 2, u = i => { const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]) || 1; return [(P[i + 1][0] - P[i][0]) / L, (P[i + 1][1] - P[i][1]) / L]; };
    const tan = i => i <= 0 || i >= n - 1 ? off : r * Math.tan(Math.acos(Math.max(-1, Math.min(1, u(i - 1)[0] * u(i)[0] + u(i - 1)[1] * u(i)[1]))) / 2); // (a curve's start, or the curb at an end)
    for (let i = 0; i + 1 < n; i++) { const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]), s0 = tan(i), s1 = L - tan(i + 1); if (s1 - s0 < 12) continue;
      const d = u(i), m = (s0 + s1) / 2, p = [P[i][0] + d[0] * (m + 2.5), P[i][1] + d[1] * (m + 2.5)], q = [-d[1], d[0]], tail = k => p2([p[0] - d[0] * 5 + q[0] * k * 4, p[1] - d[1] * 5 + q[1] * k * 4]);
      for (const k of [1, -1]) out.push({ line: [tail(k), p2(p)], color: '#ffffff', w: 0.8 }); } }
  return out;
}
// where an entrance meets the street: its route's first point (an outline's is read square from its middle to the lot line)
export const mouthOf = (e, ring) => (r => r ? r.path[0] : centroid(shapeOf(e)))(ring?.length >= 3 && routeOf(e, ring));
// where a dragged piece settles: inside the setbacks (buildings) or landscape buffers (paving), and lined up with the
// edges of the pieces near it when within `tol` feet. Returns the [dx, dy] to add.
export function settleShift(plan, e, tol = 3) {
  const ring = plan.ring || [], els = plan.elements || []; if (ring.length < 3 || isFree(e)) return [0, 0];
  const rules = edgeRules(ring, plan.front, plan.setbacks, plan.streets), need = k => e.kind === 'building' || e.kind === 'canopy' ? rules[k].build : PAVED.includes(e.kind) ? (e.kind === 'drive' && (rules[k].role === 'front' || rules[k].street) ? 0 : rules[k].pave) : e.kind === 'pond' || e.kind === 'play' ? Math.min(5, rules[k].pave) : ['pool', 'court', 'plaza', 'patio', 'garage', 'trash'].includes(e.kind) ? rules[k].pave : 0; // a pond or amenity stays inside the lot too
  let dx = 0, dy = 0;
  const r = e.rot || 0, u = rot([1, 0], r), v = rot([0, 1], r), mine = corners(e), pu = p => p[0] * u[0] + p[1] * u[1], pv = p => p[0] * v[0] + p[1] * v[1];
  let su = null, sv = null; // line up: the nearest matching edge of a piece turned the same way
  for (const o of els) {
    if (o === e || o.id === e.id && e.id != null || isFree(o) || o.kind === 'green' || o.kind === 'lot') continue;
    const dr = (((o.rot || 0) - r) % 90 + 90) % 90; if (dr > 1 && dr < 89) continue;
    const oc = corners(o), ou = oc.map(pu), ov = oc.map(pv), mu = mine.map(pu), mv = mine.map(pv);
    const overlapV = Math.min(...ov) < Math.max(...mv) + 60 && Math.max(...ov) > Math.min(...mv) - 60, overlapU = Math.min(...ou) < Math.max(...mu) + 60 && Math.max(...ou) > Math.min(...mu) - 60;
    if (overlapV) for (const a of [Math.min(...mu), Math.max(...mu)]) for (const b of [Math.min(...ou), Math.max(...ou)]) { const d = b - a; if (Math.abs(d) <= tol && (su == null || Math.abs(d) < Math.abs(su))) su = d; }
    if (overlapU) for (const a of [Math.min(...mv), Math.max(...mv)]) for (const b of [Math.min(...ov), Math.max(...ov)]) { const d = b - a; if (Math.abs(d) <= tol && (sv == null || Math.abs(d) < Math.abs(sv))) sv = d; }
  }
  if (su) { dx += u[0] * su; dy += u[1] * su; } if (sv) { dx += v[0] * sv; dy += v[1] * sv; }
  for (let pass = 0; pass < 3; pass++) ring.forEach((a, k) => { // then back inside the setbacks, edge by edge
    const n = outward(ring, k), b = ring[(k + 1) % ring.length], want = need(k); if (!(want > 0)) return;
    const cs = mine.map(p => [p[0] + dx, p[1] + dy]), L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t = c => ((c[0] - a[0]) * (b[0] - a[0]) + (c[1] - a[1]) * (b[1] - a[1])) / L / L;
    const near = cs.filter(c => t(c) > -0.05 && t(c) < 1.05); if (!near.length) return;
    const inside = Math.min(...near.map(c => -((c[0] - a[0]) * n[0] + (c[1] - a[1]) * n[1]))); // distance in from this lot line
    if (inside < want - 0.01 && inside > -want - 200) { dx -= n[0] * (want - inside); dy -= n[1] * (want - inside); }
  });
  return [+dx.toFixed(2), +dy.toFixed(2)];
}
// ---------- free-form pieces ----------
// Drives can follow a centre line (path, width, r: corner radius, closed: a loop) and ponds, islands and lawns can be
// any outline (poly). They carry x, y (a point for the label and for dragging) like every other piece.
export const isFree = e => !!(e.poly || e.path);
// green that's a place, not leftover land: a park, a lawn, open space (it has a name). Never a boulevard's median (island:
// medians in plans saved before they were marked), nor land kept for a later phase
export const isMedian = e => e.kind === 'green' && !!(e.median || e.island);
export const isPark = e => e.kind === 'green' && !!e.name && !isMedian(e) && !e.future && !e.spare && !/^Landscape \d+$/.test(e.name); // (an area drawn as Landscape N is an island or a strip until it's named)
// round a polyline's corners with arcs of radius r (closed: every corner, the result is a closed ring)
export function fillet(path, r = 30, closed = false) {
  const n = path.length, out = []; if (n < 3 || !(r > 0)) return path.slice(); // r 0: already smooth (a bent street)
  for (let i = 0; i < n; i++) {
    const B = path[i]; if (!closed && (i === 0 || i === n - 1)) { out.push(B); continue; }
    const A = path[(i - 1 + n) % n], C = path[(i + 1) % n], la = Math.hypot(A[0] - B[0], A[1] - B[1]), lc = Math.hypot(C[0] - B[0], C[1] - B[1]);
    if (la < 1e-6 || lc < 1e-6) { out.push(B); continue; }
    const u1 = [(A[0] - B[0]) / la, (A[1] - B[1]) / la], u2 = [(C[0] - B[0]) / lc, (C[1] - B[1]) / lc], cos = u1[0] * u2[0] + u1[1] * u2[1], th = Math.acos(Math.max(-1, Math.min(1, cos)));
    if (th > Math.PI - 0.02 || th < 0.02) { out.push(B); continue; }
    let t = r / Math.tan(th / 2); t = Math.min(t, la / 2, lc / 2); const rr = t * Math.tan(th / 2);
    const T1 = [B[0] + u1[0] * t, B[1] + u1[1] * t], T2 = [B[0] + u2[0] * t, B[1] + u2[1] * t], bis = [u1[0] + u2[0], u1[1] + u2[1]], bl = Math.hypot(...bis);
    const O = [B[0] + bis[0] / bl * rr / Math.sin(th / 2), B[1] + bis[1] / bl * rr / Math.sin(th / 2)];
    let a1 = Math.atan2(T1[1] - O[1], T1[0] - O[0]), a2 = Math.atan2(T2[1] - O[1], T2[0] - O[0]), da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const k = Math.max(2, Math.ceil(Math.abs(da) / (Math.PI / 12)));
    for (let j = 0; j <= k; j++) { const a = a1 + da * j / k; out.push([O[0] + rr * Math.cos(a), O[1] + rr * Math.sin(a)]); }
  }
  return out;
}
// a band `width` wide along a polyline; a loop comes back as one keyhole outline (outer ring, then inner ring backwards)
export function band(path, width, closed = false) {
  const p = closed ? path.concat([path[0]]) : path, n = p.length, h = width / 2, L = [], R = [];
  const nrm = i => { const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
  for (let i = 0; i < n; i++) {
    let v = nrm(i); if (closed && (i === 0 || i === n - 1)) { const a = p[n - 2], b = p[1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; v = [-dy / l, dx / l]; }
    L.push([p[i][0] + v[0] * h, p[i][1] + v[1] * h]); R.push([p[i][0] - v[0] * h, p[i][1] - v[1] * h]);
  }
  return L.concat(R.reverse());
}
// an outline pushed out (d > 0) or in by d feet (vertex normals; fine for the smooth shapes it's used on)
// a polygon moved out (d > 0) or in by d with square (mitred) corners: walls, parapets and floor lines in 3D
export function offsetRing(r, d) {
  const n = r.length, s = signedArea(r) >= 0 ? 1 : -1, nrm = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [s * dy / l, -s * dx / l]; };
  return r.map((p, i) => { const n1 = nrm(r[(i - 1 + n) % n], p), n2 = nrm(p, r[(i + 1) % n]), m = [n1[0] + n2[0], n1[1] + n2[1]], ml = Math.hypot(...m) || 1, c = Math.max(0.3, (m[0] * n1[0] + m[1] * n1[1]) / ml); return [p[0] + m[0] / ml * d / c, p[1] + m[1] / ml * d / c]; });
}
export function grow(r, d) {
  const n = r.length, s = signedArea(r) >= 0 ? 1 : -1;
  return r.map((p, i) => { const a = r[(i - 1 + n) % n], b = r[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [p[0] + s * dy / l * d, p[1] - s * dx / l * d]; });
}
// Chaikin smoothing of a closed outline (each pass cuts every corner)
export function smooth(r, passes = 3) { let q = r; for (let k = 0; k < passes; k++) { const o = []; q.forEach((p, i) => { const b = q[(i + 1) % q.length]; o.push([p[0] * .75 + b[0] * .25, p[1] * .75 + b[1] * .25], [p[0] * .25 + b[0] * .75, p[1] * .25 + b[1] * .75]); }); q = o; } return q; }
const freeCache = new WeakMap(), freeKeyed = new Map(); // (by the piece, and by its shape: a copy of a drive, or one grown a little to test what touches it, is drawn once)
function freeOutline(e) {
  if (e.poly) return e.poly;
  const key = e.width + '|' + e.r + '|' + e.closed + '|' + e.flare + '|' + e.mouth + '|' + e.path.join(';'), c = freeCache.get(e); // every point: a route's middle point is dragged in place
  if (c && c.key === key) return c.pts;
  const k2 = freeKeyed.get(key); if (k2) { freeCache.set(e, { key, pts: k2 }); return k2; }
  const W = e.width || 26; let path = e.path;
  // an entrance comes in square to the street for a short throat (where its flares are), then follows its route
  if (e.mouth && !e.closed && path.length >= 2) { const L0 = (e.flare || 0) + 10, p0 = path[0], d1 = (path[1][0] - p0[0]) * e.mouth[0] + (path[1][1] - p0[1]) * e.mouth[1]; // (only when the route goes on in past the throat: else it would double back)
    if (d1 > L0 + 8) path = [p0, [p0[0] + e.mouth[0] * L0, p0[1] + e.mouth[1] * L0], ...path.slice(1)]; }
  const line = fillet(path, Math.max(e.r ?? 30, 0), e.closed);
  let pts = band(line, W, e.closed); if (!e.closed && line.length > 2 && crosses(pts)) pts = sweep(line, W); // a bend too tight for the width folds the plain outline over itself
  if (e.flare > 0 && !e.closed && path.length >= 2) pts = flared(pts, path, W, e.flare, e.mouth);
  if (e.mouth && !e.closed) pts = streetSide(pts, path[0], e.mouth); // nothing of an entrance past the lot line it comes in from
  freeCache.set(e, { key, pts }); if (freeKeyed.size > 2000) freeKeyed.clear(); freeKeyed.set(key, pts); return pts;
}
const crosses = r => { const n = r.length, B = r.map((p, i) => { const q = r[(i + 1) % n]; return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])]; }); for (let i = 0; i < n; i++) { const a = B[i]; for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; const b = B[j]; if (a[0] > b[2] + 1e-6 || b[0] > a[2] + 1e-6 || a[1] > b[3] + 1e-6 || b[1] > a[3] + 1e-6) continue; if (segSeg(r[i], r[(i + 1) % n], r[j], r[(j + 1) % n]) < 1e-6) return true; } } return false; }; // (segments whose boxes don't meet can't cross: most pairs on a long wavy outline)
// an outline cut off at a line through p0 square to `inward` (the street side of an entrance)
function streetSide(pts, p0, inward) {
  const t = [-inward[1], inward[0]], B = 5000, half = [[p0[0] + t[0] * B, p0[1] + t[1] * B], [p0[0] + t[0] * B + inward[0] * B, p0[1] + t[1] * B + inward[1] * B], [p0[0] - t[0] * B + inward[0] * B, p0[1] - t[1] * B + inward[1] * B], [p0[0] - t[0] * B, p0[1] - t[1] * B]];
  const ccw = r => signedArea(r) >= 0 ? r : r.slice().reverse(), close = r => r.concat([r[0]]);
  try { const mp = polyclip.intersection([[close(ccw(pts))]], [[close(ccw(half))]]), best = mp.map(pg => pg[0]).sort((a, b) => ringArea(b) - ringArea(a))[0]; return best ? best.slice(0, -1) : pts; } catch (err) { return pts; }
}
// a drive of width W along a bent line, as one outline that can't fold over itself on a tight bend: each stretch a
// rectangle, each bend a disc, all poured together (the plain band() is fine for gentle curves and loops)
function sweep(line, W) {
  const h = W / 2, ccw = r => signedArea(r) >= 0 ? r : r.slice().reverse(), close = r => r.concat([r[0]]), parts = [];
  for (let i = 0; i + 1 < line.length; i++) { const a = line[i], b = line[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) continue; const n = [-(b[1] - a[1]) / L * h, (b[0] - a[0]) / L * h]; parts.push([[a[0] + n[0], a[1] + n[1]], [b[0] + n[0], b[1] + n[1]], [b[0] - n[0], b[1] - n[1]], [a[0] - n[0], a[1] - n[1]]]); }
  for (let i = 1; i + 1 < line.length; i++) { const c = line[i], d = []; for (let k = 0; k < 16; k++) d.push([c[0] + h * Math.cos(k * Math.PI / 8), c[1] + h * Math.sin(k * Math.PI / 8)]); parts.push(d); }
  try { const mp = polyclip.union(...parts.map(q => [close(ccw(q))])), best = mp.map(pg => pg[0]).sort((a, b) => ringArea(b) - ringArea(a))[0]; return best ? best.slice(0, -1) : band(line, W); } catch (err) { return band(line, W); }
}
// a driveway's mouth: where it meets the street (its path's first point) the curb turns out each side in a quarter
// circle of radius R, so cars turn in without crossing the curb (the curb return). The drive's own outline plus the two
// flares, as one outline.
function flared(body, path, W, R, mouth) {
  const p0 = path[0], q = path[1], L = Math.hypot(q[0] - p0[0], q[1] - p0[1]) || 1, u = mouth ? mouth.slice() : [(q[0] - p0[0]) / L, (q[1] - p0[1]) / L], n = [-u[1], u[0]], rr = Math.min(R, L * 0.9); // square to the street (mouth: the way in) when it's known
  const fl = s => { const E = [p0[0] + s * n[0] * W / 2, p0[1] + s * n[1] * W / 2], C = [E[0] + s * n[0] * rr + u[0] * rr, E[1] + s * n[1] * rr + u[1] * rr], i = [-s * n[0], -s * n[1]], out = [[E[0] + i[0], E[1] + i[1]]]; // (a foot into the drive, so the two pour as one)
    for (let k = 0; k <= 8; k++) { const a = Math.atan2(-u[1], -u[0]) + s * k / 8 * Math.PI / 2; out.push([C[0] + rr * Math.cos(a), C[1] + rr * Math.sin(a)]); }
    out.push([E[0] + u[0] * rr + i[0], E[1] + u[1] * rr + i[1]]); return out; };
  const ccw = r => signedArea(r) >= 0 ? r : r.slice().reverse(), close = r => r.concat([r[0]]);
  const stub = [[p0[0] + n[0] * W / 2, p0[1] + n[1] * W / 2], [p0[0] - n[0] * W / 2, p0[1] - n[1] * W / 2], [p0[0] - n[0] * W / 2 + u[0] * rr, p0[1] - n[1] * W / 2 + u[1] * rr], [p0[0] + n[0] * W / 2 + u[0] * rr, p0[1] + n[1] * W / 2 + u[1] * rr]]; // the throat, square to the street, holding both flares even when the drive bends away at once
  try { const mp = polyclip.union([[close(ccw(body))]], [[close(ccw(stub))]], [[close(ccw(fl(1)))]], [[close(ccw(fl(-1)))]]); const best = mp.map(pg => pg[0]).sort((a, b) => ringArea(b) - ringArea(a))[0]; return best ? best.slice(0, -1) : body; } catch (err) { return body; }
}
// move a piece by dx, dy (free-form pieces move every point)
export function moveBy(e, dx, dy) {
  e.x = +(e.x + dx).toFixed(2); e.y = +(e.y + dy).toFixed(2);
  if (e.path) e.path = e.path.map(([x, y]) => [+(x + dx).toFixed(2), +(y + dy).toFixed(2)]);
  if (e.poly) e.poly = e.poly.map(([x, y]) => [+(x + dx).toFixed(2), +(y + dy).toFixed(2)]);
  if (e.cl) e.cl = e.cl.map(([x, y]) => [+(x + dx).toFixed(2), +(y + dy).toFixed(2)]); // (a driveway's centre line)
  return e;
}
// scale a free-form piece by f about point c (default its label point); paths keep their width
export function scaleBy(e, f, c = [e.x, e.y]) {
  const sc = ([x, y]) => [+(c[0] + (x - c[0]) * f).toFixed(2), +(c[1] + (y - c[1]) * f).toFixed(2)];
  if (e.poly) e.poly = e.poly.map(sc); if (e.path) e.path = e.path.map(sc); if (e.cl) e.cl = e.cl.map(sc);
  [e.x, e.y] = sc([e.x, e.y]); e.w = +(e.w * f).toFixed(2); e.d = +(e.d * f).toFixed(2); return e;
}
// turn a piece deg degrees (counter-clockwise) about c (its outline's middle): every point of an outline or a route, an
// entrance's way in, its label point and its heading (rot, kept on a free piece too so the Turn box has a value); a
// rectangle about its own middle just turns
export function rotateBy(e, deg, c = isFree(e) ? centroid(shapeOf(e)) : [e.x, e.y]) {
  const tp = p => { const q = rot([p[0] - c[0], p[1] - c[1]], deg); return [+(c[0] + q[0]).toFixed(2), +(c[1] + q[1]).toFixed(2)]; };
  if (e.poly) e.poly = e.poly.map(tp); if (e.path) e.path = e.path.map(tp); if (e.cl) e.cl = e.cl.map(tp); if (e.mouth) e.mouth = rot(e.mouth, deg).map(v => +v.toFixed(4));
  if (e.stallAng != null) e.stallAng = +((((+e.stallAng + deg) % 360) + 360) % 360).toFixed(2); // (a drawn parking outline's rows turn with it)
  [e.x, e.y] = tp([e.x, e.y]); e.rot = +((((e.rot || 0) + deg) % 360 + 360) % 360).toFixed(2); return e;
}
// ---------- drives and entrances as a route of points (Edit Shape on a drive) ----------
// A drive shaped by its centre line: points you drag, its width, and how round its bends are (r, feet). An entrance
// keeps its first point on the street and a flared mouth (the curb returns, flare ft). Any drive can become one: a
// straight aisle (a rectangle) runs end to end along its length; an entrance drawn as an outline is read back as the
// line from the street into the site.
export const isEntrance = e => e?.kind === 'drive' && (e.entry || e.name === 'Main entry' || /^Entrance\b/.test(e.name || ''));
export const routeable = e => e?.kind === 'drive' || e?.kind === 'trail';
export function routeOf(e, ring = []) {
  if (!routeable(e)) return null;
  const r2 = q => q.map(v => +v.toFixed(2)), base = { ...e }; for (const k of ['poly', 'w', 'd', 'rot', 'shape', 'bulb']) delete base[k];
  if (e.path?.length >= 2) return { ...e, path: e.path.map(r2), width: e.width || (e.kind === 'trail' ? 6 : 26), r: e.r ?? 30 };
  const W = +(/(\d+(?:\.\d+)?)\s*ft/.exec(e.note || '')?.[1]) || null;
  if (!e.poly) { // a rectangle: along its long side
    const along = e.w >= e.d, L = along ? e.w : e.d, a = ((e.rot || 0) + (along ? 0 : 90)) * Math.PI / 180, u = [Math.cos(a), Math.sin(a)];
    return { ...base, path: [r2([e.x - u[0] * L / 2, e.y - u[1] * L / 2]), r2([e.x + u[0] * L / 2, e.y + u[1] * L / 2])], width: +(along ? e.d : e.w).toFixed(2), r: 30 };
  }
  // an outline (an entrance with its flares): in from the lot line its mouth is on (the most of its points within 2 ft;
  // else the one nearest its middle: an entrance near a corner is nearer the other lot line), as deep as it reaches;
  // one that turns off the street to meet its drive square, along its own centre line
  const P = e.poly, c = centroid(P); let best = null;
  const cl = clOf(e); if (cl) { const u = [cl[1][0] - cl[0][0], cl[1][1] - cl[0][1]], L = Math.hypot(...u) || 1, xs = P.map(p => Math.abs(((p[0] - cl[0][0]) * -u[1] + (p[1] - cl[0][1]) * u[0]) / L)).filter((v, i) => { const al = ((P[i][0] - cl[0][0]) * u[0] + (P[i][1] - cl[0][1]) * u[1]) / L; return al > 25 && al < 40; });
    const { cl: _c, ...rest } = base; return { ...rest, path: cl.map(r2), width: W || (xs.length ? +(2 * Math.min(...xs)).toFixed(1) : 26), r: 0, flare: 25, mouth: [+(u[0] / L).toFixed(4), +(u[1] / L).toFixed(4)] }; }
  for (let k = 0; k < ring.length; k++) { const a = ring[k], b = ring[(k + 1) % ring.length], d = segDist(c, a, b), on = P.filter(p => segDist(p, a, b) < 2).length; if (!best || on > best.on || on === best.on && d < best.d) best = { k, a, b, d, on }; }
  if (!best) { const xs = P.map(p => p[0]), ys = P.map(p => p[1]); return { ...base, path: [r2([Math.min(...xs), c[1]]), r2([Math.max(...xs), c[1]])], width: W || 26, r: 30 }; }
  const L = Math.hypot(best.b[0] - best.a[0], best.b[1] - best.a[1]) || 1, t = [(best.b[0] - best.a[0]) / L, (best.b[1] - best.a[1]) / L];
  let n = [-t[1], t[0]]; const mid = [(best.a[0] + best.b[0]) / 2, (best.a[1] + best.b[1]) / 2]; if ((c[0] - mid[0]) * n[0] + (c[1] - mid[1]) * n[1] < 0) n = [-n[0], -n[1]]; // into the site
  const s0 = (c[0] - best.a[0]) * t[0] + (c[1] - best.a[1]) * t[1], depth = Math.max(...P.map(p => (p[0] - best.a[0]) * n[0] + (p[1] - best.a[1]) * n[1]));
  const start = [best.a[0] + t[0] * s0, best.a[1] + t[1] * s0], end = [start[0] + n[0] * Math.max(depth, 30), start[1] + n[1] * Math.max(depth, 30)];
  const wide = W || Math.min(40, Math.max(24, Math.min(...[0.25, 0.5, 0.75].map(f => { const q = [start[0] + n[0] * depth * f, start[1] + n[1] * depth * f]; const xs = P.map(p => (p[0] - q[0]) * t[0] + (p[1] - q[1]) * t[1]).filter((v, i) => Math.abs((P[i][0] - q[0]) * n[0] + (P[i][1] - q[1]) * n[1]) < 4); return xs.length > 1 ? Math.max(...xs) - Math.min(...xs) : 40; }))));
  return { ...base, path: [r2(start), r2(end)], width: +wide.toFixed(1), r: 30, flare: 25, mouth: n.map(v => +v.toFixed(4)) };
}
// where an entrance's mouth lands when dragged to p: the nearest point on the lot line, and the way in from there
// (square to that stretch of lot line, into the site): { at, mouth }
export function lotLineAt(ring, p) {
  const at = onLotLine(ring, p); let best = null;
  for (let k = 0; k < ring.length; k++) { const a = ring[k], b = ring[(k + 1) % ring.length], d = segDist(at, a, b); if (!best || d < best.d) best = { d, a, b }; }
  if (!best) return { at, mouth: [0, 1] };
  const L = Math.hypot(best.b[0] - best.a[0], best.b[1] - best.a[1]) || 1; let n = [-(best.b[1] - best.a[1]) / L, (best.b[0] - best.a[0]) / L]; const c = centroid(ring);
  if ((c[0] - at[0]) * n[0] + (c[1] - at[1]) * n[1] < 0) n = [-n[0], -n[1]];
  return { at, mouth: n.map(v => +v.toFixed(4)) };
}
// a point on the lot line nearest p (an entrance's first point stays on the street as it's dragged)
export function onLotLine(ring, p) {
  let best = null; for (let k = 0; k < ring.length; k++) { const a = ring[k], b = ring[(k + 1) % ring.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0.02, Math.min(0.98, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)), q = [a[0] + dx * t, a[1] + dy * t], d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (!best || d < best.d) best = { q, d, k }; }
  return best ? best.q.map(v => +v.toFixed(2)) : p;
}
// a drive or an entrance drawn as an outline or a rectangle made a route in place (its id, name, note and the rest kept)
export function toRoute(e, ring = []) { if (e.path || !routeable(e)) return e; const r = routeOf(e, ring); for (const k of Object.keys(e)) delete e[k]; return Object.assign(e, r); }
const angOf = v => Math.atan2(v[1], v[0]) / RAD, wrap180 = a => ((a % 360) + 540) % 360 - 180;
// turn a piece on the plan by deg. An entrance (an outline from the layout becomes a route first) turns about its middle
// and slides back so its mouth sits on the lot line (the drive swings, the mouth slides along the street), never more
// than 60° off square to the street, and its median and signs are drawn again along it; anything else turns about its
// middle. e (one of plan.elements) is changed in place. Returns { elements, deg (the turn made), why (why not as far as
// asked), note (where its signs went and why: not a turn held back) }
export function turnPiece(plan, e, deg) {
  const ring = plan.ring || []; deg = +deg || 0;
  if (Math.abs(deg) < 0.5) return { elements: plan.elements || [], deg: 0, why: '' }; // (no turn: nothing changes, an outline entrance stays one)
  if (isRing(e) || isLoop(e)) { rotateBy(e, deg); const r = reseat(plan, e); return { elements: r.elements, deg, why: r.why || '', note: r.note || '' }; } // (joined to the streets again where it lands)
  if (!isEntrance(e) || ring.length < 3) { rotateBy(e, deg); return { elements: plan.elements || [], deg, why: '' }; }
  const r0 = routeOf(e, ring), m0 = r0.mouth || lotLineAt(ring, r0.path[0]).mouth, P = r0.path, off = wrap180(angOf([P[P.length - 1][0] - P[0][0], P[P.length - 1][1] - P[0][1]]) - angOf(m0));
  let d = deg, why = ''; if (Math.abs(off + d) > 60.01) { d = +(Math.max(-60, Math.min(60, off + d)) - off).toFixed(2); why = 'An entrance comes in at most 60° off square to the street.'; }
  if (Math.abs(d) < 0.5) return { elements: plan.elements || [], deg: 0, why };
  const had = entryParts(plan, e), was = structuredClone(e), put = (x, t) => { const r = shapeOf(x); rotateBy(x, t, centroid(r)); const m = lotLineAt(ring, x.path[0]); moveBy(x, m.at[0] - x.path[0][0], m.at[1] - x.path[0][1]); x.path[0] = m.at; x.mouth = m.mouth; };
  const ER = edgeRules(ring, plan.front, plan.setbacks, plan.streets), st = k => ER[k].role === 'front' || ER[k].street; // (as the checks see it: a drive may cross a street's lot line, no other)
  const inLot = x => { const c = shapeOf(x); return !c.some(p => !inRing(p, ring) && !st(nearestEdge(ring, p)) && distToPoly(p, ring) > 0.6) && !c.some((p, i) => ring.some((a, k) => !st(k) && segsCross(p, c[(i + 1) % c.length], a, ring[(k + 1) % ring.length]))); };
  toRoute(e, ring); if (!e.mouth) e.mouth = m0;
  let t = d; for (; Math.abs(t) >= 0.5; t = +(t * 0.75).toFixed(2)) { const x = structuredClone(e); put(x, t); if (inLot(x)) break; } // near a corner: as far as it turns inside the lot
  if (Math.abs(t) < 0.5) { for (const k of Object.keys(e)) delete e[k]; Object.assign(e, was); return { elements: plan.elements || [], deg: 0, why: 'Turned any further, its drive would run outside the lot.' }; }
  if (Math.abs(t - d) > 0.01) why = 'Turned ' + Math.round(Math.abs(t)) + '°: any further, its drive would run outside the lot.'; d = t;
  put(e, d); e.pinned = true;
  const r = refreshEntry(plan, e, null, had, true); return { elements: r.elements, deg: d, why, note: r.why };
}
// switch a pond, pool or lawn between a natural outline, a rounded rectangle and a rectangle, keeping its area
export function reshape(e, to) {
  const a = elArea(e), o = outline(e), c = centroid(o);
  if (to === 'organic') { if (e.poly) return e; const q = smooth(corners({ ...e, w: e.w * 1.08, d: e.d * 1.08 }), 4), k = Math.sqrt(a / (ringArea(q) || 1)); e.poly = q.map(([x, y]) => [+(c[0] + (x - c[0]) * k).toFixed(2), +(c[1] + (y - c[1]) * k).toFixed(2)]); delete e.shape; return e; }
  // a rectangle the same area, the same proportions as the piece's box, turned with it
  const rr = e.rot || 0, loc = o.map(p => rot([p[0] - c[0], p[1] - c[1]], -rr)), w0 = Math.max(...loc.map(p => p[0])) - Math.min(...loc.map(p => p[0])), d0 = Math.max(...loc.map(p => p[1])) - Math.min(...loc.map(p => p[1]));
  const r = { ...e, poly: undefined, path: undefined, w: w0, d: d0, shape: to === 'rounded' ? 'round' : undefined }, k = Math.sqrt(a / (elArea(r) || 1));
  delete e.poly; Object.assign(e, { x: +c[0].toFixed(2), y: +c[1].toFixed(2), w: +(w0 * k).toFixed(2), d: +(d0 * k).toFixed(2), rot: rr }); if (to === 'rounded') e.shape = 'round'; else delete e.shape;
  return e;
}
// the points that bound a piece (its corners, or its outline)
export const shapeOf = e => isFree(e) ? freeOutline(e) : corners(e);
const distToPoly = (p, r) => r.reduce((m, a, i) => Math.min(m, segDist(p, a, r[(i + 1) % r.length])), Infinity);
// the clear distance between two outlines (0 when they touch or overlap)
export const gapBetween = (a, b) => rectsOverlap({ poly: a }, { poly: b }) ? 0 : Math.min(...a.map(p => distToPoly(p, b)), ...b.map(p => distToPoly(p, a)));
// a point on or within `pad` feet of a piece
export const nearPiece = (e, p, pad = 0) => isFree(e) ? inRing(p, freeOutline(e)) || (pad > 0 && distToPoly(p, freeOutline(e)) < pad) : hitRect({ ...e, w: e.w + 2 * pad, d: e.d + 2 * pad }, p);
function polysOverlap(A, B, slack = 0.5) {
  { let ax0 = Infinity, ay0 = Infinity, ax1 = -Infinity, ay1 = -Infinity, bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity; for (let i = 0; i < A.length; i++) { const p = A[i]; if (p[0] < ax0) ax0 = p[0]; if (p[0] > ax1) ax1 = p[0]; if (p[1] < ay0) ay0 = p[1]; if (p[1] > ay1) ay1 = p[1]; } for (let i = 0; i < B.length; i++) { const p = B[i]; if (p[0] < bx0) bx0 = p[0]; if (p[0] > bx1) bx1 = p[0]; if (p[1] < by0) by0 = p[1]; if (p[1] > by1) by1 = p[1]; }
    if (ax1 < bx0 || bx1 < ax0 || ay1 < by0 || by1 < ay0) return false; } // (boxes apart: nothing can cross or hold the other; most pairs on a big plan)
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) if (segsCross(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
  const inner = (P, Q) => P.some(p => inRing(p, Q) && distToPoly(p, Q) > slack); // no edges cross: inside means one holds the other (a centroid can sit outside a curved shape)
  return inner(A, B) || inner(B, A);
}

// a piece's outline for drawing: a rectangle, a rounded rectangle (shape 'round': ponds, lakes), an ellipse ('circle'),
// or a free-form outline (a drive along a path, an organic pond)
export function outline(e) {
  if (isFree(e)) return freeOutline(e);
  if (e.kind === 'building' && (e.form === 'L' || e.form === 'U')) { // wings round a courtyard that opens to the front (−v)
    // (bar: the depth of the back bar set outright, wing2 its wings' width, as a small pad draws them (lib/sitepad.mjs);
    // flip: an L with its wing on the right)
    const W = e.w / 2, D = e.d / 2, t = e.bar > 0 ? Math.min(e.d - 10, e.bar) : Math.min(e.d * 0.6, e.wing || Math.max(40, Math.min(70, e.d * 0.5))), k = Math.min(e.w * (e.form === 'U' ? (e.bar > 0 ? 0.4 : 0.3) : 0.45), e.wing2 || t);
    let P = e.form === 'L' ? [[-W, -D], [-W + k, -D], [-W + k, D - t], [W, D - t], [W, D], [-W, D]] : [[-W, -D], [-W + k, -D], [-W + k, D - t], [W - k, D - t], [W - k, -D], [W, -D], [W, D], [-W, D]];
    if (e.flip && e.form === 'L') P = P.map(([x, y]) => [-x, y]).reverse();
    return P.map(p => { const q = rot(p, e.rot || 0); return [e.x + q[0], e.y + q[1]]; });
  }
  if (e.jog && e.kind === 'building' && e.w > 90) { // a staggered front: every other section steps forward (and back behind), same floor area
    const n = e.w > 210 ? 5 : 3, j = e.jog, s = e.w / n, top = [], bot = [];
    for (let i = 0; i < n; i++) { const o = i % 2 ? j : 0, x0 = -e.w / 2 + i * s, x1 = x0 + s; bot.push([x0, -e.d / 2 - o], [x1, -e.d / 2 - o]); top.push([x0, e.d / 2 - o], [x1, e.d / 2 - o]); }
    return bot.concat(top.reverse()).map(p => { const q = rot(p, e.rot || 0); return [e.x + q[0], e.y + q[1]]; });
  }
  if (e.shape !== 'round' && e.shape !== 'circle') return corners(e);
  const pts = [], a = (e.rot || 0) * RAD, put = (u, v) => pts.push([e.x + u * Math.cos(a) - v * Math.sin(a), e.y + u * Math.sin(a) + v * Math.cos(a)]);
  if (e.shape === 'circle') { for (let i = 0; i < 36; i++) { const t = i / 36 * 2 * Math.PI; put(e.w / 2 * Math.cos(t), e.d / 2 * Math.sin(t)); } return pts; }
  const r = Math.min(e.w, e.d) * 0.35, cx = e.w / 2 - r, cy = e.d / 2 - r;
  for (const [sx, sy, t0] of [[1, 1, 0], [-1, 1, 90], [-1, -1, 180], [1, -1, 270]]) for (let i = 0; i <= 6; i++) { const t = (t0 + i * 15) * RAD; put(sx * cx + r * Math.cos(t), sy * cy + r * Math.sin(t)); }
  return pts;
}
// a tower on its podium: the tower's own outline (centred toward the back, about 60% of the podium)
export function towerOutline(e) {
  const tw = Math.min(e.w, e.tw || Math.max(60, e.w * 0.55)), td = Math.min(e.d, e.td || Math.max(60, e.d * 0.6)), v0 = (e.d - td) / 2 * 0.6;
  return [[-tw / 2, v0 - td / 2], [tw / 2, v0 - td / 2], [tw / 2, v0 + td / 2], [-tw / 2, v0 + td / 2]].map(p => { const q = rot(p, e.rot || 0); return [e.x + q[0], e.y + q[1]]; });
}
export const elArea = e => isFree(e) ? ringArea(freeOutline(e)) : e.shape === 'circle' ? Math.PI * e.w * e.d / 4 : e.shape === 'round' ? e.w * e.d - (4 - Math.PI) * (Math.min(e.w, e.d) * 0.35) ** 2 : e.w * e.d;
// a building's footprint (its outline: an L, a U round a courtyard, a bar with a staggered front) and its floor area
// (a tower on a podium counts the podium's floors over the whole footprint and the tower's over its own)
export const garageStalls = e => Math.floor(elArea(e) * (e.levels || 4) / 330);
export const footArea = e => e.kind === 'building' && e.form && e.form !== 'bar' ? ringArea(outline(e)) : elArea(e);
export function gfaOf(e) { return gfaOfEl(e); }
function gfaOfEl(e) {
  if (e.sf != null) return e.sf; const fl = e.floors || 1, A = footArea(e);
  if (e.form === 'tower' && e.podium > 0 && fl > e.podium) return A * e.podium + ringArea(towerOutline(e)) * (fl - e.podium);
  return A * fl;
}
export const toLocal = (e, [x, y]) => rot([x - e.x, y - e.y], -(e.rot || 0));
export const hitRect = (e, p) => { if (isRing(e)) { const g = ringOf(e); return Math.hypot(p[0] - g.c[0], p[1] - g.c[1]) <= g.R; } if (isLoop(e) && (s => s && inRing(p, s))(islandOf(e))) return true; if (isFree(e)) return inRing(p, freeOutline(e)); const [u, v] = toLocal(e, p); return Math.abs(u) <= e.w / 2 && Math.abs(v) <= e.d / 2; };
export function rectsOverlap(a, b, slack = 0.5) {
  if (isFree(a) || isFree(b)) return polysOverlap(shapeOf(a), shapeOf(b), slack);
  const formed = e => e.kind === 'building' && (e.form === 'L' || e.form === 'U'); if (formed(a) || formed(b)) return polysOverlap(formed(a) ? outline(a) : corners(a), formed(b) ? outline(b) : corners(b), slack); // (an L or a U: its own outline, not the box round it)
  const A = corners(a), B = corners(b);
  for (const R of [A, B]) for (let i = 0; i < 2; i++) {
    const ax = [R[i + 1][0] - R[i][0], R[i + 1][1] - R[i][1]], L = Math.hypot(...ax) || 1, n = [ax[0] / L, ax[1] / L];
    const pa = A.map(p => p[0] * n[0] + p[1] * n[1]), pb = B.map(p => p[0] * n[0] + p[1] * n[1]);
    if (Math.max(...pa) - slack <= Math.min(...pb) || Math.max(...pb) - slack <= Math.min(...pa)) return false;
  }
  return true;
}
const rectDist = (c, a, b) => c.reduce((m, p, i) => Math.min(m, segSeg(p, c[(i + 1) % c.length], a, b)), Infinity);

// parking stalls in a parking rectangle: 90° stalls in double-loaded modules (stall + aisle + stall), then one
// single-loaded row if there's room. Rows run along whichever side holds more stalls, or the way Stall direction set
// (stallRot: 0 along its width, 90 along its depth). A piece with a custom outline (poly) is filled by lib/stalls.mjs:
// { count, rows, swap, fill } with fill the stalls themselves (n is 0: it has no single row length).
export function stalls(e, S0 = STALL) {
  const S = e.sw ? { w: e.sw, d: e.sd || S0.d, aisle: e.sa || S0.aisle } : S0; // a plan's own stall size
  if (e.poly) { const f = STL.polyStalls(e, S); return { count: f.count, rows: f.rows.map(r => [r.a, r.b]), n: 0, W: 0, swap: !!f.swap, fill: f }; }
  const lay = (W, D) => {
    const n = Math.floor((W + 0.01) / S.w), rows = []; let y = -D / 2;
    if (n < 1) return { count: 0, rows, n, W };
    if (e.row) { if (D >= S.d - 0.01) rows.push(e.row > 0 ? [D / 2 - S.d, D / 2] : [-D / 2, -D / 2 + S.d]); return { count: rows.length * Math.max(0, n - (e.islands ? Math.floor(n / 13) : 0) - (e.caps && n >= 6 ? 2 : 0)), rows, n, W }; }
    while (D / 2 - y >= 2 * S.d + S.aisle - 0.01) { rows.push([y, y + S.d], [y + S.d + S.aisle, y + 2 * S.d + S.aisle]); y += 2 * S.d + S.aisle; }
    if (D / 2 - y >= S.d + S.aisle - 0.01) rows.push([y, y + S.d]);
    return { count: rows.length * Math.max(0, n - (e.islands ? Math.floor(n / 13) : 0) - (e.caps && n >= 6 ? 2 : 0)), rows, n, W };
  };
  if (e.stallRot != null && Number.isFinite(+e.stallRot)) return Math.round(+e.stallRot / 90) % 2 ? { ...lay(e.d, e.w), swap: true } : { ...lay(e.w, e.d), swap: false }; // turned by hand
  if (e.lock) return { ...lay(e.w, e.d), swap: false }; // laid out by the generator: rows run along its length
  // rows turn to the short side only when that holds more and the rows are still 60 ft or longer (no stubby dead-end aisles)
  const a = lay(e.w, e.d), b = lay(e.d, e.w), okA = a.W >= 60 || !b.count, okB = b.W >= 60 || !a.count;
  return okB && (b.count > a.count || !okA) ? { ...b, swap: true } : { ...a, swap: false };
}
// planted islands in a parking rectangle (every 13th space when e.islands): centres in plan feet, 9 x 18 ft
export function islandsOf(e, S0 = STALL) {
  const S = e.sw ? { w: e.sw, d: e.sd || S0.d, aisle: e.sa || S0.aisle } : S0;
  if (!e.islands || e.poly) return [];
  const st = stalls(e, S), x0 = -st.n * S.w / 2, out = [];
  const put = (u, v) => { const p = st.swap ? [v, -u] : [u, v], q = rot(p, e.rot || 0); return [e.x + q[0], e.y + q[1]]; };
  for (const [y0, y1] of st.rows) for (let k = 12; k < st.n - (e.caps ? 1 : 0); k += 13) out.push(put(x0 + (k + 0.5) * S.w, (y0 + y1) / 2));
  return out;
}
// rounded planted islands at both ends of every stall row (e.caps): a half-disc in the end space, flat against the next
// stall and round toward the end of the row. caps 'square': the end space itself, planted (the square island style).
// Outlines in plan feet, and a tree in each.
export function capsOf(e, S0 = STALL) {
  const S = e.sw ? { w: e.sw, d: e.sd || S0.d, aisle: e.sa || S0.aisle } : S0;
  if (!e.caps || e.poly) return [];
  const st = stalls(e, S); if (st.n < 6) return [];
  const x0 = -st.n * S.w / 2, out = [], put = (u, v) => { const q = rot(st.swap ? [v, -u] : [u, v], e.rot || 0); return [+(e.x + q[0]).toFixed(2), +(e.y + q[1]).toFixed(2)]; };
  if (e.caps === 'square') { for (const [y0, y1] of st.rows) for (const end of [-1, 1]) { const a = end < 0 ? x0 : -x0 - S.w; out.push({ poly: [put(a, y0), put(a + S.w, y0), put(a + S.w, y1), put(a, y1)], tree: put(a + S.w / 2, (y0 + y1) / 2) }); } return out; }
  for (const [y0, y1] of st.rows) for (const end of [-1, 1]) {
    const cu = end < 0 ? x0 + S.w : -x0 - S.w, cv = (y0 + y1) / 2, r = Math.min(S.w, (y1 - y0) / 2), pts = [];
    for (let k = 0; k <= 12; k++) { const a = (end < 0 ? Math.PI / 2 : -Math.PI / 2) + k * Math.PI / 12; pts.push(put(cu + r * Math.cos(a), cv + (y1 - y0) / 2 * Math.sin(a))); }
    out.push({ poly: pts, tree: put(cu + end * S.w * 0.45, cv) });
  }
  return out;
}
// the stripe lines of a parking rectangle, in plan feet
export function stallLines(e, S0 = STALL) {
  const S = e.sw ? { w: e.sw, d: e.sd || S0.d, aisle: e.sa || S0.aisle } : S0;
  if (e.poly) return STL.linesOf(stalls(e, S).fill);
  const st = stalls(e, S), W = st.swap ? e.d : e.w, out = [], x0 = -st.n * S.w / 2;
  const put = (u, v) => { const p = st.swap ? [v, -u] : [u, v], q = rot(p, e.rot || 0); return [+(e.x + q[0]).toFixed(2), +(e.y + q[1]).toFixed(2)]; };
  if (W <= 0) return out;
  st.rows.forEach(([y0, y1], k) => { // rows come in pairs facing a shared aisle; a row's head line is the side away from it
    for (let i = 0; i <= st.n; i++) out.push([put(x0 + i * S.w, y0), put(x0 + i * S.w, y1)]);
    const head = e.row ? (e.row > 0 ? y0 : y1) : k % 2 ? y1 : y0; out.push([put(x0, head), put(-x0, head)]);
  });
  return out;
}

// ---------- program ----------
const clamp = (v, lo, hi, dflt) => { const n = +v; return v == null || v === '' || !Number.isFinite(n) ? dflt : Math.max(lo, Math.min(hi, n)); };
const customIn = p => !!(p.custom && typeof p.custom === 'object' && !Array.isArray(p.custom) && p.custom.name); // an AI-crafted type (lib/customtypes.mjs)
const nameIn = (v, n = 60) => typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, n) : null; // a name given (the community's, a part's): trimmed, at most n characters
export function normalizeProgram(p = {}) {
  const use = USES[p.use] ? p.use : 'other', U = USES[use];
  const out = {
    use, floors: Math.round(clamp(p.floors, 1, 40, U.floors)),
    gfa: p.gfa == null || p.gfa === '' || !(+p.gfa > 0) ? null : clamp(p.gfa, 500, 5e6, null),
    ratio: clamp(p.ratio, 0, customIn(p) ? 100 : 15, U.ratio ?? 3), perUnit: clamp(p.perUnit, 0, 4, U.perUnit ?? 1.5),
    units: p.units == null || p.units === '' || !(+p.units > 0) ? null : Math.round(clamp(p.units, 1, 5000, null)),
    pads: ['retail', 'restaurant', 'office', 'medical', 'other'].includes(use) && +p.pads > 0 ? Math.round(clamp(p.pads, 1, 4, 1)) : null, // pad sites on the frontage, as asked ("a strip with 2 pads")
    unitSf: clamp(p.unitSf, 300, 3000, U.unitSf || 900), buildings: p.buildings == null || p.buildings === '' ? null : Math.round(clamp(p.buildings, 1, 60, 1)),
    depth: clamp(p.depth, 30, 600, U.depth), detentionPct: p.detentionPct == null || p.detentionPct === '' ? null : clamp(p.detentionPct, 0, 40, null), storm: ['detention', 'retention', 'underground', 'none'].includes(p.storm) ? p.storm : null, through: !!p.through, trash: !!p.trash, compare: !!p.compare, entrances: p.entrances == null || p.entrances === '' ? null : Math.round(clamp(p.entrances, 1, 6, 1)), product: ['lots', 'court', 'court6'].includes(p.product) ? p.product : null,
    truck: p.truck == null ? !!U.truck : !!p.truck, max: !!p.max, extras: Array.isArray(p.extras) ? [...new Set(p.extras.filter(x => EXTRAS.includes(x)))] : [], eff: clamp(p.eff, 0.6, 0.98, 0.85), asked: p.asked && typeof p.asked === 'object' ? { gfa: +p.asked.gfa > 0 ? +p.asked.gfa : null, units: +p.asked.units > 0 ? Math.round(+p.asked.units) : null, buildings: +p.asked.buildings > 0 ? Math.round(+p.asked.buildings) : null } : null, // a filled site: what was asked for (phase 1)
    mix: use === 'multifamily' && Array.isArray(p.mix) && p.mix.length ? p.mix.map(t => ({ name: String(t.name || '').slice(0, 20), sf: clamp(t.sf, 250, 4000, 800), pct: clamp(t.pct, 0, 100, 0), beds: clamp(t.beds, 0, 6, 1) })) : null,
    homeMix: Array.isArray(p.homeMix) && p.homeMix.length ? p.homeMix.map(t => ({ stories: Math.round(clamp(t.stories, 1, 3, 2)), pct: clamp(t.pct, 0, 100, 0) })) : null, lotD: clamp(p.lotD, 80, 200, 115),
    // mixed use: zones from the street back (lib/sitecompose.mjs lays them out)
    community: nameIn(p.community), partName: nameIn(p.partName), // names: the development's, and a single-use plan's own ("The Reserve at Beacon Hill")
    zones: Array.isArray(p.zones) && p.zones.length > 1 ? p.zones.slice(0, 6).map((z, k) => z?.use === 'garage' ? { use: 'garage', gfa: null, units: null, floors: Math.round(clamp(z.floors ?? z.levels, 2, 8, 4)), buildings: null, pads: null, items: null, name: 'Parking garage', partName: null } : ({ use: z?.use === 'fuel' && p.zones.findIndex(q => q?.use === 'fuel') !== k ? 'retail' : USES[z?.use] ? z.use : 'other', gfa: +z.gfa > 0 ? Math.round(clamp(z.gfa, 500, 5e6, null)) : null, /* (a gas station beside other uses: its own outparcel, lib/sitefuel.mjs fuelMixOptions; a second one is a shop zone) */
      units: +z.units > 0 ? Math.round(clamp(z.units, 1, 3000, null)) : null, floors: +z.floors > 0 ? Math.round(clamp(z.floors, 1, 40, 1)) : null, buildings: +z.buildings > 0 ? Math.round(clamp(z.buildings, 1, 20, 1)) : null,
      pads: +z.pads > 0 ? Math.round(clamp(z.pads, 0, 4, 0)) : null, items: Array.isArray(z.items) ? z.items.map(String).slice(0, 10) : null, ...(z?.plaza ? { plaza: true, court: Array.isArray(z.court) && z.court.length ? z.court.map(String).slice(0, 6) : ['plaza', 'lawn', 'pavilion'] } : {}), name: z.name ? String(z.name).slice(0, 40) : null, partName: nameIn(z?.partName), ...(pl => pl ? { place: pl } : {})(placeIn(z?.place, k, Math.min(6, p.zones.length))), ...homeSpec(z, HOME_USES.includes(z?.use) ? z.use : null, true) })) : null
  };
  Object.assign(out, homeSpec(p, HOME_USES.includes(use) && !out.zones ? use : null)); // the homes: their size, floor plans and smallest lot, when asked
  out.flex = !!p.flex; // (industrial: flex space)
  out.anchor = +p.anchor || 0; // (retail: the anchor's floor area)
  out.lotDSet = p.lotDSet != null ? !!p.lotDSet : +p.lotD > 0 && +p.lotD !== 115; // (a lot depth asked for: the layouts keep it; else they may use a shallower one)
  if (HOME_USES.includes(use) && !out.zones && +p.clubhouse?.sf > 0) out.clubhouse = { sf: Math.round(clamp(p.clubhouse.sf, 1000, 10000, 4000)) }; // a neighbourhood's own leasing / amenity building (lib/sitelayout.mjs withClubhouse)
  if ((+p.pads > 0 || p.pads === 'auto') && !out.zones) out.pads = p.pads === 'auto' ? 'auto' : Math.round(clamp(p.pads, 0, 4, 0)); // a single commercial use's outparcel pads ('auto': as many as the frontage allows)
  if (out.homeKind) { out.lotD = Math.round(clamp(p.lotD, 40, 200, HOME_KINDS[out.homeKind].lotD)); if (p.lotSet || +p.lotD > 0 && +p.lotD !== HOME_KINDS[out.homeKind].lotD) out.lotSet = true; if (p.perUnit == null || p.perUnit === '' || +p.perUnit === USES.sfr.perUnit) out.perUnit = HOME_KINDS[out.homeKind].perUnit; // (parking: a tiny home's one space on its pad, a manufactured home's two, unless asked) // a home community's lots are shallower; lotSet: a pad depth asked for
    if (+p.buffer >= 0 && p.buffer !== null && p.buffer !== '') out.buffer = Math.round(clamp(p.buffer, 0, 50, 0)); } // (a landscape strip along the property line, ft, when asked)
  for (const z of out.zones || []) if (HOME_USES.includes(z.use) && z.gfa != null && z.gfa < HOME_SF && !z.units) z.gfa = null; // (a home's size given as the zone's floor area: homeSpec took it)
  if (HOME_USES.includes(use) && !out.zones && out.gfa != null && out.gfa < HOME_SF && !out.units) out.gfa = null;
  if (use === 'storage') out.storage = storageProgram(p.storage, p);
  if (p.lot && typeof p.lot === 'object' && !Array.isArray(p.lot)) out.lot = lotRules(p.lot); // single-family lot rules a jurisdiction sets (lib/guardrails.mjs): the lot's least width, the home's front and side setbacks
  if (customIn(p)) out.custom = p.custom; // an AI-crafted type's recipe rides along (lib/customtypes.mjs lays it out)
  if (['bar', 'L', 'U', 'tower'].includes(p.form)) out.form = p.form;
  if (['courtyard', 'loop', 'plaza'].includes(p.arrangement)) out.arrangement = p.arrangement;
  if (p.plaza) { out.plaza = true; out.court = Array.isArray(p.court) && p.court.length ? p.court.map(String).slice(0, 6) : ['plaza', 'lawn', 'pavilion']; } // a retail plaza round a central court (lib/sitegencom.mjs plaza) // the way the words want the buildings laid out (round a courtyard, round a loop drive): the generator's matching layouts lead // the building shape the request names ("L-shaped"); the layout reads it as params.form
  if (p.atLeast === true) out.atLeast = true; // the size is a minimum ("6000+ sf"): max is on and asked.gfa holds it
  if (out.zones && +p.gfa > 0) { // a mix's shops, restaurants, offices with no size of their own share the total asked for (not a default each)
    const com = z => COMMERCIAL.includes(z.use) && z.use !== 'garage', open = out.zones.filter(z => com(z) && !(z.gfa > 0)), left = +p.gfa - out.zones.filter(z => com(z) && z.gfa > 0).reduce((t, z) => t + z.gfa, 0);
    if (open.length && left >= 500 * open.length) for (const z of open) z.gfa = Math.round(left / open.length / 100) * 100; }
  if (use === 'foodtrucks') { out.foodtrucks = foodTruckProgram(p.foodtrucks); out.extras = []; out.gfa = null; out.units = null; out.buildings = null; out.zones = null; } // (its pavilion, patio and playground are its own)
  for (const z of out.zones || []) if (z.use === 'fuel') { const src = p.zones.find(q => q?.use === 'fuel'); z.fuel = fuelProgram(src?.fuel || p.fuel, src?.gfa ? src : { gfa: p.fuel?.storeSf }); z.floors = 1; z.units = null; z.buildings = null; z.pads = null; z.gfa = fuelGfa(z.fuel); }
  if (out.zones && out.use === 'fuel') out.use = out.zones.find(z => z.use !== 'fuel' && z.use !== 'garage')?.use || 'retail'; // (mixed use: the plan's use is its first other one)
  else if (use === 'fuel') { out.fuel = fuelProgram(p.fuel, p); out.floors = 1; out.buildings = null; out.gfa = fuelGfa(out.fuel); }
  if (use === 'storage' && out.storage.climateSf != null && out.storage.driveSf != null) out.gfa = out.storage.climateSf + out.storage.driveSf + (out.storage.climateSf ? 0 : out.storage.officeSf || STORAGE.office);
  if (use === 'multifamily' && out.mix) out.unitSf = Math.round(mixStats(out.mix).avgSf); // the mix sets the average unit
  if (use === 'multifamily' && out.units && !out.gfa) out.gfa = Math.round(out.units * out.unitSf / out.eff);
  // a parking garage: a step in the zones (where it was asked for), else behind the zone that needs the most parking; a
  // single commercial use with a garage becomes that use and its garage
  out.garage = !!p.garage || !!out.zones?.some(z => z.use === 'garage');
  if (out.garage && !out.zones?.some(z => z.use === 'garage')) {
    const G = { use: 'garage', gfa: null, units: null, floors: Math.round(clamp(p.garageLevels, 2, 8, 4)), buildings: null, pads: null, items: null, name: 'Parking garage', partName: null };
    if (out.zones) { const need = z => (z.gfa || 50000) * (USES[z.use]?.ratio || 0) * (COMMERCIAL.includes(z.use) ? 1 : 0), at = out.zones.reduce((b, z, i) => need(z) > need(out.zones[b]) ? i : b, 0); out.zones.splice(at + 1, 0, G);
      for (const z of out.zones) if (z.place?.next) z.place = { ...z.place, next: z.place.next.map(j => j >= at + 1 ? j + 1 : j) }; } // (placement says which zone by its place in the list: the garage put in shifts the ones after it)
    else if (COMMERCIAL.includes(use)) { out.zones = [{ use, gfa: out.gfa, units: null, floors: out.floors, buildings: out.buildings, pads: out.pads || null, items: null, name: null, partName: out.partName }, G]; out.partName = null; }
  }
  { const fi = out.zones ? out.zones.findIndex(z => z.use === 'fuel') : -1, n = out.zones?.length; // a gas station zone goes last: it's laid out on its own outparcel, the rest keep their places in the list
    if (fi >= 0 && fi < n - 1) { const at = j => j === fi ? n - 1 : j > fi ? j - 1 : j; out.zones.push(...out.zones.splice(fi, 1)); for (const z of out.zones) if (z.place?.next) z.place = { ...z.place, next: z.place.next.map(at) }; } }
  if (Array.isArray(p.parcels) && p.parcels.length) out.parcels = p.parcels.slice(0, 20).map(x => ({ parcel: String(x?.parcel || '').slice(0, 80), program: { ...(x?.program || {}), parcels: null } })); // (a site of several parcels: a program each, lib/siteparcels.mjs)
  return out;
}
// the homes of a neighbourhood (a single-family, townhome or duplex program, or one of a mix's home zones), as asked:
// homeSfMin / homeSfMax the home size range (sf of one home, "1,600–2,100 sf homes"), floorPlans how many different
// plans the builder offers ("3 floorplans": never floors), minLotSf the smallest lot (sf, "a minimum of 6,600 sf per
// lot"), lotW the narrowest lot (ft) and, on a zone, lotD its depth. Only the keys asked for (a plan without them
// compares as it always did). A floor area this small on homes with no count (under HOME_SF, 6,000 sf) is one home's
// size, not the zone's total: the AI has put "2,100 sf homes" there (it becomes homeSfMax, and the gfa goes).
const HOME_SF = 6000;
// a home community instead of a subdivision (homeKind on a single-family program or zone): manufactured homes, tiny homes
// or both, on small lots along private lanes (lib/sitelayout.mjs communityPlan): the lot depth they take, the lanes'
// pavement and right-of-way, how far the home sits back from it, and the label it goes by
export const HOME_KINDS = {
  manufactured: { label: 'Manufactured home community', lotD: 100, pave: 24, row: 38, frontBL: 10, perUnit: 2 },
  tiny: { label: 'Tiny home community', lotD: 65, pave: 24, row: 38, frontBL: 8, perUnit: 1 },
  mixed: { label: 'Tiny & manufactured home community', lotD: 80, pave: 24, row: 38, frontBL: 10, perUnit: 1.5 }
};
// a use's name on a plan: a home community's own (a single-family program, or a mix's home zone, with homeKind) for its homes
export const useLabel = (use, prog) => { const K = use === 'sfr' && HOME_KINDS[prog?.homeKind || (prog?.zones || []).find(z => z?.use === 'sfr')?.homeKind]; return K ? K.label : USES[use]?.label || use; };
function homeSpec(q, use, zone = false) {
  if (!q || typeof q !== 'object') return {};
  const sf = v => +v > 0 ? Math.round(clamp(v, 250, 12000, null)) : null, o = {};
  let mn = sf(q.homeSfMin), mx = sf(q.homeSfMax); if (mn && mx && mn > mx) [mn, mx] = [mx, mn];
  if (use && +q.gfa > 0 && +q.gfa < HOME_SF && !(+q.units > 0)) { const g = Math.round(+q.gfa); if (mx == null && (mn == null || g >= mn)) mx = g; else if (mn == null && g < mx) mn = g; }
  if (mn) o.homeSfMin = mn; if (mx) o.homeSfMax = mx;
  if (+q.floorPlans > 0) o.floorPlans = Math.round(clamp(q.floorPlans, 1, 8, 1));
  if (HOME_KINDS[q.homeKind] && (use === 'sfr' || !use && q.use === 'sfr')) o.homeKind = q.homeKind;
  if (o.homeKind && +q.homeW > 0) o.homeW = Math.round(clamp(q.homeW, 8, 40, 14)); if (o.homeKind && +q.homeD > 0) o.homeD = Math.round(clamp(q.homeD, 16, 90, 40)); // a community's home footprint asked for ("16 x 40 homes")
  if (+q.minLotSf > 0) o.minLotSf = Math.round(clamp(q.minLotSf, 1000, 87120, null));
  if (+q.lotW > 0) o.lotW = Math.round(clamp(q.lotW, 20, 200, null));
  if (zone && +q.lotD > 0) o.lotD = Math.round(clamp(q.lotD, o.homeKind ? 40 : 80, 200, 115));
  else if (zone && o.homeKind) o.lotD = HOME_KINDS[o.homeKind].lotD;
  return o;
}
// the program a neighbourhood's homes are laid out with (a home zone of a mix, or the whole program): the zone's own
// numbers where it has them, else the program's (its lot rules: the stricter of the two)
export function homeProgram(prog, z = null) {
  const P = prog || {}, Z = z || {}, k = key => Z[key] ?? P[key] ?? null, lotD = Z.lotD ? Math.max(+Z.lotD, P.lot ? +P.lotD || 0 : 0) : P.lotD;
  return normalizeProgram({ use: Z.use || 'sfr', homeMix: Z.homeMix || P.homeMix, lotD, ...(P.lot || Z.lot ? { lot: { ...(Z.lot || {}), ...(P.lot || {}) } } : {}), homeSfMin: k('homeSfMin'), homeSfMax: k('homeSfMax'), floorPlans: k('floorPlans'), minLotSf: k('minLotSf'), lotW: k('lotW'), homeKind: k('homeKind') });
}
// where a zone goes, in words the layout honours (lib/sitepods.mjs): where (PLACES), the road it's at or along as it was
// said, the zones it's beside, between or round (their indexes in the list, not its own, two at most), the side as seen
// from the street. null when there's no hint, so a program without one is as it always was
export const PLACES = ['front', 'back', 'middle', 'corner', 'along', 'beside', 'between', 'around'];
function placeIn(pl, k, n) {
  if (!pl || typeof pl !== 'object' || !PLACES.includes(pl.where)) return null;
  const next = [...new Set((Array.isArray(pl.next) ? pl.next : []).map(Number).filter(j => Number.isInteger(j) && j >= 0 && j < n && j !== k))].slice(0, 2);
  return { where: pl.where, road: typeof pl.road === 'string' && pl.road.trim() ? pl.road.trim().slice(0, 40) : null, next, side: pl.side === 'left' || pl.side === 'right' ? pl.side : null };
}
// a storage program's own settings: climate-controlled floor area (all floors; 0 = drive-up only, with a small office),
// drive-up floor area (null = as much as fits), row depth, aisle, RV / boat spaces, the fence and the two unit mixes.
// A total size with no split: about two thirds climate-controlled.
function storageProgram(q, p) {
  const s = q && typeof q === 'object' ? q : {}, num = (v, lo, hi) => v == null || v === '' || !Number.isFinite(+v) ? null : clamp(v, lo, hi, null);
  const mixOf = (m, d) => Array.isArray(m) && m.length ? m.slice(0, 12).map(t => ({ name: String(t.name || '').slice(0, 12), sf: clamp(t.sf, 10, 2000, 100), pct: clamp(t.pct, 0, 100, 0) })) : null;
  let climateSf = num(s.climateSf, 0, 1e6), driveSf = num(s.driveSf, 0, 1e6); const tot = +p.gfa > 0 ? +p.gfa : null;
  if (climateSf == null && driveSf == null && tot) { climateSf = Math.round(tot * 0.65 / 100) * 100; driveSf = tot - climateSf; }
  else if (climateSf == null && driveSf != null && tot && tot > driveSf) climateSf = tot - driveSf;
  else if (driveSf == null && climateSf != null && tot && tot > climateSf && !p.max) driveSf = tot - climateSf;
  return { climateSf, driveSf, rowD: Math.round(clamp(s.rowD, 20, 60, STORAGE.rowD)), aisle: Math.round(clamp(s.aisle, 20, 40, STORAGE.aisle)), rv: Math.round(clamp(s.rv, 0, 400, 0)), fence: s.fence !== false,
    climateMix: mixOf(s.climateMix), driveMix: mixOf(s.driveMix),
    ...(s.rvRows ? { rvRows: true, rvW: Math.round(clamp(s.rvW, 10, 40, STORAGE.rvW)), rvD: Math.round(clamp(s.rvD, 20, 80, STORAGE.rvD)) } : {}), ...(+s.officeSf > 0 ? { officeSf: Math.round(clamp(s.officeSf, 400, 20000, STORAGE.office)) } : {}) }; // rvRows: a yard of sites (an RV park) in rows both sides of the aisles, rvW × rvD each
}
// single-family lot rules: the least lot width (ft), the home's front setback from the right-of-way and its side setbacks
const lotRules = q => ({ minW: +q.minW > 0 ? Math.round(clamp(q.minW, 30, 150, 0) * 100) / 100 : 0, front: clamp(q.front, 5, 60, 20), side: clamp(q.side, 0, 25, 0), ...(+q.minSf > 0 ? { minSf: Math.round(clamp(q.minSf, 1000, 87120, 0)) } : {}) }); // (minSf: the jurisdiction's smallest lot, sf)
// a food truck park's own settings: trucks (null = as many as fit), the pavilion's size, the bar (on or off, its size),
// a playground, parking a truck
function foodTruckProgram(q) {
  const s = q && typeof q === 'object' ? q : {}, F = FOODTRUCK;
  return { trucks: +s.trucks > 0 ? Math.round(clamp(s.trucks, 1, 60, null)) : null, pavilionSf: Math.round(clamp(s.pavilionSf, 0, 20000, F.pavilionSf)), bar: s.bar !== false, barSf: Math.round(clamp(s.barSf, 400, 10000, F.barSf)),
    playground: s.playground !== false, perTruck: clamp(s.perTruck, 0, 15, F.perTruck), restroomSf: Math.round(clamp(s.restroomSf, 200, 3000, F.restroomSf)) };
}
// a gas station's own settings: pumps (MPDs: 4 to 16), the store's size, a car wash, air / vacuum stalls, which street
// the canopy runs along (auto: the busier one, the front) and which way its pump islands run (along the street or across
// it). A truck stop is laid out as the car version.
export function fuelProgram(q, p = {}) {
  const s = q && typeof q === 'object' ? q : {}, n = +s.pumps, pumps = n > 0 ? PUMPS.reduce((b, k) => Math.abs(k - n) < Math.abs(b - n) ? k : b, PUMPS[0]) : FUEL.pumps;
  return { pumps, storeSf: Math.round(clamp(s.storeSf ?? (+p.gfa > 0 ? p.gfa : null), 1500, 12000, FUEL.storeSf)), wash: !!s.wash, vac: s.vac !== false, canopy: ['front', 'side'].includes(s.canopy) ? s.canopy : 'auto', islands: s.islands === 'across' ? 'across' : 'along', truckStop: !!s.truckStop };
}
// a gas station's floor area: the store, and the car wash tunnel when it has one
export const fuelGfa = f => f.storeSf + (f.wash ? FUEL.washW * FUEL.washLen : 0);
// ---------- names: the development's (the community) and each part's ----------
// what a part of a plan is called when it has no name of its own
export const PART_WORD = { sfr: 'Neighborhood', townhomes: 'Townhomes', duplex: 'Cottages', multifamily: 'Apartments', retail: 'Retail center', restaurant: 'Restaurants', office: 'Office park', medical: 'Medical offices', hotel: 'Hotel', church: 'Church', industrial: 'Business park', storage: 'Self storage', fuel: 'Gas station', foodtrucks: 'Food truck park', amenity: 'Commons', other: 'Commercial' };
// what each part of a plan is called and holds: a mixed plan's zones (not a garage), else the whole site. [{ i (the
// program zone's index, 0 for a single-use plan), zone (that index, or null), use, word (Retail center,
// Neighbourhood…), name (given, or null), show (the name, else for a mixed plan its word), ring (its drawn zone, the
// largest when it has two), acres, buildings, units, gfa, homes }]. totals false: no counts (the map's labels).
export function partsOf(plan, totals = true) {
  const prog = normalizeProgram(plan.program), els = plan.elements || [], site = plan.ring || [], dz = (plan.zones || []).filter(z => z.ring?.length >= 3);
  const parts = prog.zones ? prog.zones.map((z, i) => ({ i, zone: i, use: z.use, name: z.partName })).filter(x => x.use !== 'garage') : [{ i: 0, zone: null, use: prog.use, name: prog.partName }];
  for (const p of parts) {
    const mine = prog.zones ? dz.filter(z => z.zone === p.i) : [], byUse = prog.zones && !mine.length ? dz.filter(z => z.zone == null && z.use === p.use)[parts.filter(q => q.use === p.use).indexOf(p)] : null, rs = mine.length ? mine : byUse ? [byUse] : [];
    Object.assign(p, { word: PART_WORD[p.use] || 'Commercial', show: p.name || (prog.zones ? PART_WORD[p.use] || 'Commercial' : null), ring: prog.zones ? rs.map(z => z.ring).sort((a, b) => ringArea(b) - ringArea(a))[0] || null : site.length >= 3 ? site : null, acres: +((prog.zones ? rs.reduce((s, z) => s + ringArea(z.ring), 0) : ringArea(site)) / 43560).toFixed(2) });
  }
  if (!totals) return parts;
  const B = els.filter(e => e.kind === 'building'), m = metrics(plan), useOf = e => USES[e.use] ? e.use : prog.use, partOf = partOfPiece(plan, parts);
  for (const p of parts) Object.assign(p, { buildings: 0, units: 0, gfa: 0, homes: 0 });
  for (const e of B) { const p = partOf(e), u = useOf(e), P = u === prog.use && !prog.zones ? prog : normalizeProgram({ use: u }); p.buildings++; p.gfa += gfaOfEl(e); if (HOME_USES.includes(u)) p.homes += e.units ?? 1;
    p.units += u === 'multifamily' ? e.units ?? Math.floor(gfaOfEl(e) * (P.eff || 0.85) / P.unitSf) : USES[u].garage ? e.units ?? 1 : 0; }
  const off = (m.units || 0) - parts.reduce((s, p) => s + p.units, 0); if (off) { const big = parts.reduce((a, p) => p.units > a.units ? p : a, parts[0]); big.units += off; } // (apartments as a whole count from the floor area)
  for (const p of parts) p.gfa = Math.round(p.gfa);
  return parts;
}
// where each part's name sits on a program as it was given (its zones are counted after normalizeProgram, which can put
// a garage zone in, or make zones of a single use with a garage): per normalized zone, that zone's index in the given
// program, -1 for the program's own partName, null for a garage normalizeProgram put in
function nameSlots(program) {
  const n = normalizeProgram(program), raw = Array.isArray(program?.zones) && program.zones.length > 1 ? program.zones.slice(0, 6) : null;
  if (!n.zones) return [-1]; if (!raw) return n.zones.map(z => z.use === 'garage' ? null : -1);
  let j = 0; return n.zones.map(z => z.use === 'garage' && raw[j]?.use !== 'garage' ? null : j++);
}
// a part's name put on a program whose zones are its own copies: k from nameSlots
const putName = (p, k, nm) => { if (k == null) return; if (k < 0) p.partName = nm; else if (p.zones?.[k] && p.zones[k].use !== 'garage') p.zones[k].partName = nm; };
const ownZones = p => { if (Array.isArray(p.zones)) p.zones = p.zones.map(z => ({ ...z })); return p; };
// which part a building belongs to (parts: partsOf's): its zone's, else (placed by hand, a pad) the part of its use whose
// zone holds its middle, else any part there, else the first of its use
export function partOfPiece(plan, parts = partsOf(plan, false)) {
  const prog = normalizeProgram(plan.program), useOf = e => USES[e.use] ? e.use : prog.use, at = new Map(parts.map(p => [p.i, p]));
  return e => { if (!prog.zones) return parts[0]; if (Number.isInteger(e.zone) && at.has(e.zone)) return at.get(e.zone); const c = centroid(shapeOf(e)), u = useOf(e), same = p => p.use === u || u === 'restaurant' && p.use === 'retail'; return parts.find(p => p.ring && same(p) && inRing(c, p.ring)) || parts.find(p => p.ring && inRing(c, p.ring)) || parts.find(same) || parts[0]; }; // (a restaurant pad goes with the shops)
}
// names given ({ community, parts: [{ part (partsOf's i), name }] }; '' or null clears one) put on a program: a new program
export function withNames(program, names = {}) {
  const p = ownZones({ ...(program || {}) }), slots = nameSlots(p);
  if (names.community !== undefined) p.community = nameIn(names.community);
  for (const x of names.parts || []) { const i = +x.part; if (Number.isInteger(i) && i >= 0) putName(p, slots[i], nameIn(x.name)); }
  return p;
}
// a new program (Build with AI, Use This Layout, a use changed) keeps the names the old one had: the community, and on
// each part without a name the name of the old one's part of the same use (two neighbourhoods either side of a commons
// both keep theirs). all: the old names win outright, none included (a layout's copy of the program, laid out before
// the names were changed, takes the plan's names as they are now)
export function keepNames(prog, old, all = false) {
  if (!prog || !old) return prog; const o = normalizeProgram(old), n = normalizeProgram(prog), out = ownZones({ ...prog }), slots = nameSlots(prog);
  if (all || !n.community && o.community) out.community = o.community;
  const list = q => q.zones ? q.zones.map((z, i) => ({ use: z.use, name: z.partName, i })).filter(x => x.use !== 'garage') : [{ use: q.use, name: q.partName, i: 0 }], was = list(o).filter(x => all || x.name);
  for (const x of list(n)) { if (x.name && !all) continue; const w = was.find(w => w.use === x.use && w.i === x.i) || was.find(w => w.use === x.use); if (w && w.name !== x.name) putName(out, slots[x.i], w.name); }
  return out;
}
// a point well inside a ring for a big label: its middle when that's well inside, else the grid point farthest from its
// edges; avoid: the points where the pieces' own labels stand (labelSpots), kept clear of as far as the ring allows;
// half: half the label's width (ft), the room it needs either side (at most 45% of the ring's width)
export function labelPoint(ring, avoid = [], half = 0) {
  const c = centroid(ring), b = boxOfPts(ring), span = Math.max(b[2] - b[0], b[3] - b[1]) || 1, near = avoid.filter(q => q[0] > b[0] - 200 && q[0] < b[2] + 200 && q[1] > b[1] - 200 && q[1] < b[3] + 200), h = Math.min(half, (b[2] - b[0]) * 0.45);
  const D = p => { if (!inRing(p, ring) || h > 0 && !(inRing([p[0] - h, p[1]], ring) && inRing([p[0] + h, p[1]], ring))) return -1; /* (the whole label inside its zone) */ const e = distToPoly(p, ring); if (!near.length) return e; const a = Math.min(...near.map(q => Math.hypot((q[0] - p[0]) * 0.35, q[1] - p[1]))); return Math.min(e, 100) + Math.min(a, 120); }; // (clear of the pieces' labels and of its edges alike; labels run across, so a line above or below is clear sooner than one beside)
  let best = c, bd = D(c); if (!near.length && bd > span * 0.15 || near.length && bd >= Math.min(span * 0.15, 100) + 120) return c.map(v => +v.toFixed(2));
  const sx = (b[2] - b[0]) / 24 || 1, sy = (b[3] - b[1]) / 24 || 1; for (let x = b[0] + sx / 2; x < b[2]; x += sx) for (let y = b[1] + sy / 2; y < b[3]; y += sy) { const d = D([x, y]); if (d > bd) { bd = d; best = [x, y]; } } // (a long thin zone searched along and across alike)
  return best.map(v => +v.toFixed(2));
}
// a part laid out in several pods (lib/sitepods.mjs): each pod of 8 acres or more but the one the part's name is over
// gets a smaller label of its own section ("Section 2"). [{ t, ring }]
export function sectionLabels(plan) {
  const Z = (plan.zones || []).filter(z => z.pod && z.section && z.ring?.length >= 3), by = new Map(); for (const z of Z) { const l = by.get(z.zone) || []; l.push(z); by.set(z.zone, l); }
  return [...by.values()].filter(l => l.length > 1).flatMap(l => { const big = l.slice().sort((a, b) => ringArea(b.ring) - ringArea(a.ring))[0]; return l.filter(z => z !== big && ringArea(z.ring) >= 8 * 43560).map(z => ({ t: 'Section ' + z.section, ring: z.ring })); });
}
// where the pieces' own labels stand (a big zone name keeps off them): buildings (not single homes or cottages), ponds,
// garages, amenities and named lawns
export const labelSpots = plan => (plan.elements || []).filter(e => e.kind === 'building' && !['sfr', 'duplex'].includes(e.use) || ['pond', 'garage', 'court', 'pool', 'play'].includes(e.kind) || e.kind === 'green' && e.name && !isMedian(e)).map(e => [e.x, e.y]);
export const unitsOf = (prog, gfa) => { const f = prog.eff || 0.85; return prog.units && Math.abs(prog.units * prog.unitSf / f - gfa) < 0.15 * gfa ? prog.units : Math.floor(gfa * f / (prog.unitSf || 900)); };
// (a hundredth of a space of slack, so feet rounded to two decimals don't add a space)
export const required = (prog, gfa) => Math.ceil((prog.use === 'multifamily' ? unitsOf(prog, gfa) * prog.perUnit : gfa / 1000 * prog.ratio) - 0.01);

// a rough program from plain words, used without AI and as the AI's starting point
// a home community's words: tiny homes, manufactured / mobile homes, or both (HOME_KINDS)
const TINY_RE = /tiny[- ]?homes?|tiny[- ]house|park[- ]models?|micro[- ]?homes?/, MOBILE_RE = /mobile[- ]?homes?|manufactured[- ]?(?:homes?|housing)|trailer (?:park|homes?)|single[- ]wides?|double[- ]wides?|\bmhc\b|\bmhp\b/;
export const homeKindOf = t => { const a = TINY_RE.test(t), b = MOBILE_RE.test(t); return a && b ? 'mixed' : a ? 'tiny' : b ? 'manufactured' : null; };
const KIND_WORDS = [['sfr', new RegExp(TINY_RE.source + '|' + MOBILE_RE.source)], ['foodtrucks', /food[- ]?trucks?|truck stalls?|mobile (?:food|vendors?)/], ['fuel', /gas station|fuel(?:ing)? (?:station|center|centre|pumps?|positions?|canopy)|filling station|petrol|c-store|convenience store|gas pumps?|\b\d+\s*(?:fuel |gas )?(?:pumps|mpds?|dispensers)\b|quik ?trip|\bqt\b|buc-?ee'?s|racetrac|\bwawa\b|truck stop|travel (?:center|centre|plaza)/], ['storage', /self[- ]?storage|mini[- ]?storage|mini[- ]?warehouse|storage (?:units|facility|center|buildings?)|climate[- ]controlled (?:storage|units|building)|drive[- ]?up (?:storage|units)|(?:rv|boat)(?: (?:and|&|or) (?:rv|boat))? storage/], ['industrial', /warehouse|industrial|distribution|logistics|flex|manufactur|cross[- ]?dock|storage yard/], ['townhomes', /town ?ho(?:me|use)s?|row ?homes?/],
  ['duplex', /duplex|cottages?|bungalows?/], ['multifamily', /apartment|multi-?family|senior living|\bmf\b/],
  ['amenity', /commons|amenit|\bpark\b|\blake\b|pickleball|pavilion|playground|dog park|community (?:center|space)|green ?space|open space|event lawn/],
  ['sfr', /single[- ]family|\bsfr\b|houses\b|subdivision|residential (?:neighbou?rhood|community|lots)|n[ei]{1,2}ghbou?rhood|homes on (?:their own )?lots|for[- ]sale homes|detached (?:[a-z0-9-]+ ){0,3}(?:homes|houses)|build[- ]to[- ]rent (?:[a-z0-9-]+ ){0,2}(?:homes|houses|communit)|\bbtr\b|\b1[- ]stor(?:y|ey) (?:[a-z0-9-]+ ){0,2}homes|rental homes/], // after the commons: "a community center at the back of the neighborhood" is the commons
  ['hotel', /hotel|motel|\binn\b|extended[- ]stay|hospitality/], ['church', /church|chapel|sanctuary|house of worship|worship center|mosque|synagogue|temple\b/],
  ['medical', /medical|clinic|dental|urgent care|hospital|surgery/], ['restaurant', /restaurant|qsr|drive[- ]?thru|coffee|fast food|cafe/], ['office', /office/],
  ['retail', /retail|strip|shopping|store|shop\b|shops|center|grocery|c-store|gas station|commercial/]];
export const EXTRAS = ['patio', 'playground', 'lawn', 'drivethru']; // what a single-use plan can add on its open land
const ZONE_ORDER = ['retail', 'fuel', 'restaurant', 'office', 'medical', 'hotel', 'church', 'other', 'storage', 'industrial', 'amenity', 'multifamily', 'townhomes', 'duplex', 'sfr'];
const kindOf = t => (KIND_WORDS.find(([, re]) => re.test(t)) || [null])[0];
// a rough program from plain words, used without AI and as the AI's starting point. Several uses ("retail in front,
// a commons, 120 apartments and 18 townhomes") become zones, street side first.
// where each use goes, from the words (lib/sitepods.mjs lays it out so): "retail at the corner of FM 362 and Bauer Road",
// "apartments along the highway", "homes round a lake", "townhomes as a buffer between the retail and the homes", "the
// commons in the middle". A phrase belongs to the use named last before it in the same sentence; what it's next to by
// the use it names. Zones get place: { where, road, next, side } (normalizeProgram keeps it)
const REL = /\b(?:beside|between|next to|adjacent to|alongside|backing (?:on ?)?to|a?round|wrapping|surrounding|ringing|encircling)\b/;
const AM_ITEMS = [['pool', /\bpools?\b|swimming/], ['playground', /playground|play ?area|tot lot/], ['pavilion', /pavilion/], ['courts', /pickleball|tennis|\bcourts?\b/], ['center', /clubhouse|club house|community (?:center|centre|building)|amenity (?:center|centre)/], ['lake', /\blake\b/], ['restrooms', /rest ?rooms?/]]; // what a commons holds, as said
const CLUB_RE = /leasing (?:center|centre|office)|club ?house|amenity (?:center|centre|building)|community (?:center|centre|building)|fitness (?:center|centre)|model homes?/;
const amItems = seg => { const it = AM_ITEMS.filter(([, re]) => re.test(seg)).map(([k]) => k); return it.includes('center') ? it.concat(['playground', 'pavilion']) : it; }; // (a community center comes with its playground and pavilion)
const HOMES_ROUND = /(?<!town ?)\b(?:homes|houses)\b[^.;]*?\b(?:a?round|wrapping|surrounding|ringing|encircling)\b/, LAKE_ROUND = /(?:homes|houses|neighbou?rhood|lots)[^.;]*?\b(?:a?round|wrapping|surrounding|ringing|encircling|on) (?:a |an |the )?(?:central |big |small |amenity )?lake\b/;
const PLACE_USE = { retail: /\bretail|\bshops?\b|shopping|\bstrip\b|grocery|\bstores?\b/, restaurant: /restaurants?|\bcafe|coffee/, office: /offices?/, medical: /medical|clinic/, hotel: /hotel/, church: /church/, other: /commercial/, industrial: /warehouse|industrial|flex|distribution|logistics/, storage: /storage/, multifamily: /apartments?|multi-?family/, townhomes: /town ?ho(?:me|use)s?|row ?homes?/, duplex: /duplex(?:es)?|cottages?/, sfr: /(?<!town ?)\bhomes\b|\bhouses\b|single[- ]family|neighbou?rhood|\blots\b/, amenity: /commons|amenit\w*|\bpark\b|\blake\b|community (?:center|centre|space)|clubhouse/ };
const ROAD = String.raw`(?:the )?((?:fm|us|sh|cr|hwy|state highway|highway|county road|farm to market) ?\d+[a-z]?|(?:main |front |side |busy |frontage )?(?:highway|frontage(?: road)?|road|street)|[a-z][a-z']+ (?:road|rd|street|st|highway|hwy|parkway|pkwy|boulevard|blvd|drive|dr|lane|ln|avenue|ave|way))\b`;
function placeWords(t, Z) {
  const at = []; Z.forEach((z, i) => { const re = PLACE_USE[z.use]; if (!re) return; const g = new RegExp(re.source, 'g'); let m; while ((m = g.exec(t))) at.push([m.index, i, m.index + m[0].length]); });
  const owners = pos => { const s = Math.max(t.lastIndexOf('.', pos - 1), t.lastIndexOf(';', pos - 1), t.lastIndexOf('\n', pos - 1)), A = at.filter(([q]) => q < pos && q > s).sort((a, b) => b[0] - a[0]), out = A.slice(0, 1);
    for (let k = 1; k < A.length && !out.some(a => a[1] === A[k][1]) && /^\s*(?:,|and|&|or|,\s*and)\s*(?:the\s+)?$/.test(t.slice(A[k][2], A[k - 1][0])); k++) out.push(A[k]); if (out.length || s < 0 || t.slice(s + 1, pos).trim()) return out.map(a => a[1]);
    const s2 = Math.max(t.lastIndexOf('.', s - 1), t.lastIndexOf(';', s - 1), t.lastIndexOf('\n', s - 1)), B = at.filter(([q]) => q < s && q > s2).sort((a, b) => b[0] - a[0]); return Object.assign(B.slice(0, 1).map(a => a[1]), { borrowed: true }); }; // (borrowed: after the places said in a use's own sentence) // "medical and office in the middle": both ("…and the homes, homes at the back": the homes alone); a sentence that starts with the place ("retail in the front. along the road, …"): the use the one before ended on
  const zoneOf = w => Z.findIndex(z => PLACE_USE[z.use]?.test(w)), put = (i, pl) => { if (i == null || i < 0 || Z[i].place) return; Z[i].place = { where: pl.where, road: pl.road ?? null, next: [...new Set((pl.next || []).filter(j => j >= 0 && j !== i))], side: pl.side ?? null }; };
  const later = [], each = (re, f) => { const g = new RegExp(re.source, 'g'); let m; while ((m = g.exec(t))) { const o = owners(m.index), mm = m; if (o.borrowed) { for (const i of o) later.push(() => f(mm, i)); continue; } if (!o.length) f(m, undefined); for (const i of o) f(m, i); } };
  each(/\b(?:as an? (?:buffer|transition) )?between (?:the )?([a-z-]+(?: [a-z-]+)?) and (?:the )?([a-z-]+(?: [a-z-]+)?)/, (m, i) => { const a = zoneOf(m[1]), b = zoneOf(m[2]); if (a >= 0 && b >= 0) put(i, { where: 'between', next: [a, b] }); });
  each(/\b(?:a?round|wrapping|surrounding|ringing|encircling) (?:a |an |the )?(?:central |big |small |amenity )?(lake|pond|commons|park|amenit\w*|community cent(?:er|re)|clubhouse)/, (m, i) => { const j = Z.findIndex(z => z.use === 'amenity'); if (j >= 0 && Z[i]?.use !== 'amenity') put(i, { where: 'around', next: [j] }); });
  each(/\b(?:beside|next to|adjacent to|alongside|backing (?:on ?)?to) (?:the )?([a-z-]+(?: [a-z-]+)?)/, (m, i) => { const j = zoneOf(m[1]); if (j >= 0) put(i, { where: 'beside', next: [j] }); });
  each(/\b(?:at|on|in) (?:the )?(?:(left|right) (?:hand )?)?(?:street |hard |busy |front |main )?corner\b(?: of ([^,;.]+?)(?=,|;|\.|$| with | plus | then ))?/, (m, i) => put(i, { where: 'corner', road: m[2] ? m[2].split(/ and | & /)[0].trim().slice(0, 40) : null, side: m[1] || null }));
  each(new RegExp(String.raw`\b(?:along|facing|fronting|on|by|backing onto) ` + ROAD), (m, i) => put(i, { where: 'along', road: m[1].trim().slice(0, 40) }));
  each(/\b(?:in|at) the (?:middle|center|centre|heart)\b|\bcentrally\b/, (m, i) => put(i, { where: 'middle' }));
  each(/\b(?:in|at|to(?:ward)?s?) the (?:back|rear)\b/, (m, i) => put(i, { where: 'back' }));
  each(/\b(?:in|at) (?:the )?front\b|\bup front\b/, (m, i) => put(i, { where: 'front' }));
  for (const f of later) f();
  for (const z of Z) if (z.place?.where === 'around') for (const j of z.place.next) if (Z[j]?.use === 'amenity') put(j, { where: 'middle' }); // what homes go round sits in the middle
}
// "twenty four" / "twenty-four" / "one hundred twenty" -> digits
const NUMW = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
export function wordsToDigits(t) {
  return String(t).replace(/\b((?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and)(?:[\s-]+(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and))*)\b/g, m => {
    const ws = m.split(/[\s-]+/).filter(w => w !== 'and'); if (!ws.length || ws.every(w => w === 'hundred' || w === 'thousand')) return m;
    let total = 0, cur = 0; for (const w of ws) { if (w === 'hundred') cur = (cur || 1) * 100; else if (w === 'thousand') { total += (cur || 1) * 1000; cur = 0; } else cur += NUMW[w]; }
    return String(total + cur);
  });
}
// the homes' own numbers in the words, read before the sizes (so "1,600–2,100 sf homes" is no floor area, "3 floorplans"
// no floors and "a minimum of 6,600 sf per lot" no minimum size): { o: { homeSfMin, homeSfMax, floorPlans, minLotSf,
// lotW, lotD } (what was said), t: the words with those numbers blanked out (same length, so places in it still line up) }
const HSF = String.raw`(?:sf|sq\.?\s*ft|sqft|square[- ]f(?:ee|oo)t)\b`, HN = String.raw`(\d{3,5}(?:\.\d+)?)\s*(k|thousand)?`, HOME_N = String.raw`(?:homes?|houses?|residences|dwellings|single[- ]family|townho(?:me|use)s?|duplex(?:es)?(?: units)?|floor ?plans?|house plans?|home plans?|plans|models)\b`, HOME_W = String.raw`(?:homes?|houses?|townho(?:me|use)s?|duplex(?:es)?(?: units)?|floor ?plans?|plans)`;
function homeWords(t) {
  const o = {}; let out = t;
  const v = (n, k) => +n * (k ? 1000 : 1), blank = (m, from = 0, to = m[0].length) => { const i = m.index + from; out = out.slice(0, i) + ' '.repeat(to - from) + out.slice(i + to - from); };
  const hit = (re, f) => { const g = new RegExp(re, 'g'); let m; while ((m = g.exec(t))) f(m); };
  // a home size: a range ("1600-2100 sf homes", "homes of 1,600 to 2,100 sf", "homes between 1600 and 2100 sq ft"), or one size ("2,400 sf homes", "2400+ sf homes")
  const range = (a, b, plus) => { const x = Math.min(a, b), y = Math.max(a, b); if (x < 250 || y > 12000) return false; o.homeSfMin ??= x; o.homeSfMax ??= plus ? null : y; if (o.homeSfMax == null) delete o.homeSfMax; return true; };
  hit(HN + String.raw`\s*(?:` + HSF + String.raw`)?\s*(?:-|–|—|to)\s*` + HN + String.raw`\s*(\+)?\s*` + HSF + String.raw`(?=(?:\s+[a-z-]+){0,2}?\s+` + HOME_N + ')', m => { if (range(v(m[1], m[2]), v(m[3], m[4]), m[5])) blank(m); });
  hit(String.raw`\b` + HOME_W + String.raw`\s*(?:\(|of|from|ranging(?: in size)? from|between|sized|sized from|at)?\s*(?:about\s*|roughly\s*)?` + HN + String.raw`\s*(?:` + HSF + String.raw`)?\s*(?:-|–|—|to|and)\s*` + HN + String.raw`\s*` + HSF, m => { if (range(v(m[1], m[2]), v(m[3], m[4]))) { const i = m[0].search(/\d/); blank(m, i); } });
  if (o.homeSfMin == null) hit(HN + String.raw`\s*(\+)?\s*` + HSF + String.raw`(?=(?:\s+[a-z-]+){0,2}?\s+(?:homes?|houses?|residences|single[- ]family (?:homes?|houses?)|townho(?:me|use)s?|duplex(?:es)?|floor ?plans?)\b)`, m => { if (o.homeSfMin == null && range(v(m[1], m[2]), v(m[1], m[2]), m[3])) blank(m); });
  if (o.homeSfMin == null) hit(String.raw`\b` + HOME_W + String.raw`\s*(?:\(|of|at|averaging|around|about|sized at|of about|of around)\s*(?:about\s*|around\s*|roughly\s*)?` + HN + String.raw`\s*(\+)?\s*` + HSF + String.raw`(?!\s*(?:of\s+)?(?:retail|shops?|office|commercial|lots?|homesites?|warehouse|restaurant))`, m => { if (o.homeSfMin == null && range(v(m[1], m[2]), v(m[1], m[2]), m[3])) blank(m, m[0].search(/\d/)); });
  // how many floor plans ("3 floorplans", "four house plans", "5 different plans"): never floors
  hit(String.raw`\b(\d{1,2})\s*(?:different\s+|distinct\s+|unique\s+|separate\s+|home\s+|house\s+)?(?:floor[- ]?plans?|house plans?|home plans?|plans|models)\b`, m => { if (+m[1] >= 1 && +m[1] <= 12 && o.floorPlans == null) { o.floorPlans = +m[1]; blank(m); } });
  // the smallest lot ("a minimum of 6,600 sf per lot", "lots of at least 7,000 sf", "6,600 sf lots", "7000 sf minimum lot size")
  const lot = (n, k, m, i) => { const x = v(n, k); if (x < 1000 || x > 87120) return; o.minLotSf = Math.max(o.minLotSf || 0, x); blank(m, i); };
  hit(String.raw`\b(?:a\s+)?(?:minimum|min\.?|at least|no less than|no smaller than)\s*(?:lot\s*(?:size|area)?\s*)?(?:of\s*)?(?:a\s*)?` + HN + String.raw`\s*` + HSF + String.raw`(?=\s*(?:\+\s*)?(?:(?:per|a|an|each|for each|for every)\s+)?(?:total\s+|residential\s+|single[- ]family\s+|home\s+)?(?:lots?|homesites?)\b)`, m => lot(m[1], m[2], m, 0));
  hit(String.raw`\b(?:lots?|homesites?)\b[^.;]{0,60}?(?:minimum|min\.?|at least|no less than|no smaller than)\s*(?:lot\s*(?:size|area)?\s*)?(?:of\s*)?(?:a\s*)?` + HN + String.raw`\s*` + HSF, m => lot(m[1], m[2], m, m[0].search(/(?:minimum|min\.?|at least|no less than|no smaller than)/)));
  hit(String.raw`\b(?:minimum|min\.?|smallest)\s+(?:lot|homesite)\s*(?:size|area)?\s*(?:of\s*|is\s*|:\s*|=\s*)?(?:at least\s*)?` + HN + String.raw`\s*` + HSF, m => lot(m[1], m[2], m, 0));
  hit(HN + String.raw`\s*(\+)?\s*` + HSF + String.raw`\s*(?:(?:minimum|min\.?)\s+)?(?:lots?|homesites?)\b`, m => lot(m[1], m[2], m, 0));
  // a lot's width and depth ("60 x 120 lots", "60' lots", "60-foot lots")
  hit(String.raw`\b(\d{2,3})\s*(?:'|ft|foot|feet)?\s*(?:x|×|by)\s*(\d{2,3})\s*(?:'|ft|foot|feet)?\s*(?:lots?|homesites?)\b`, m => { if (+m[1] >= 20 && +m[1] <= 200 && +m[2] >= 80 && +m[2] <= 200) { o.lotW ??= +m[1]; o.lotD ??= +m[2]; blank(m); } });
  hit(String.raw`\b(\d{2,3})\s*(?:'|-?(?:ft|foot|feet))\s*(?:wide\s+)?(?:lots?|homesites?)\b`, m => { if (+m[1] >= 20 && +m[1] <= 200) { o.lotW ??= +m[1]; blank(m); } });
  return { o, t: out };
}
// "45,000 sf of retail with 3 pads on the 5.88 acre parcel, a flex building on the corner parcel and self storage on the
// 9.36 acre parcel": a program for each parcel the words name (lib/siteparcels.mjs partFor reads which parcel is which)
function parcelClauses(text) {
  const t = String(text || ''); if (!/\bparcels?\b/i.test(t)) return null;
  const re = /\b(?:on|for|at|across|over)\s+((?:the|a|an|both|each|every|all)\s+)?((?:[^,;.]|(?<=\d)[.,](?=\d))*?)\bparcels?\b(\s*#?\s*\d)?/gi, out = []; let m, last = 0;
  while ((m = re.exec(t))) { const words = t.slice(last, m.index).replace(/^\s*(?:and|then|plus|with|[,;.])\s*/i, '').replace(/\s*(?:and|then|plus|[,;.])\s*$/i, '').trim(), ref = ((m[1] && /both|each|every|all/i.test(m[1]) ? m[1] : '') + (m[2] || '') + (m[3] ? ' parcel ' + m[3].replace(/\D/g, '') : '')).trim(); last = re.lastIndex; if (words) out.push({ parcel: ref || 'next', words }); }
  if (!out.length) return null;
  const parcels = out.map(x => ({ parcel: x.parcel, program: guessProgram(x.words) })), first = parcels[0].program;
  return { ...first, parcels };
}
// "a retail plaza with a central court holding a hang-out area and a park": the shops on three sides of a court that holds
// the plaza, a lawn and a pavilion (the generator's plaza arrangement, lib/sitegencom.mjs); a commons said to be "in the
// middle" of such a plaza is that court, not a zone of its own
const PLAZA_RE = /\b(?:retail|shopping|commercial|town|village|neighbou?rhood)?\s*(?:plaza|town (?:center|centre|square)|village (?:center|centre|square)|main street)\b/, COURT_RE = /\bcentral (?:court|courtyard|green|plaza|park|square|lawn|commons)\b|\b(?:court|courtyard|park|green|plaza|commons)\b[^.;]*?\b(?:in|at) the (?:middle|center|centre|heart)\b|\bhang[- ]?out\b/;
function applyPlaza(p, text) {
  const t = String(text || '').toLowerCase(); if (!PLAZA_RE.test(t) || !(COURT_RE.test(t) || /\bplaza\b/.test(t))) return p;
  const court = ['plaza', ...(/\bpark\b|\blawn\b|\bgreen\b/.test(t) ? ['lawn'] : []), ...(/hang[- ]?out|pavilion|stage|seating|gather/.test(t) ? ['pavilion'] : []), ...(/playground|play ?area/.test(t) ? ['playground'] : [])];
  const rz = (p.zones || []).find(z => z.use === 'retail');
  if (p.zones && !rz) return p;
  if (rz) { rz.plaza = true; rz.court = court; const i = p.zones.findIndex(z => z.use === 'amenity' && !(z.items || []).some(k => ['lake', 'pool', 'courts', 'center'].includes(k))); if (i >= 0) p.zones.splice(i, 1); if (p.zones.length < 2) { const keep = p.zones[0]; p.zones = undefined; Object.assign(p, { use: keep.use, gfa: keep.gfa ?? p.gfa, pads: keep.pads ?? p.pads }); } }
  if (p.use === 'retail' || !p.zones) { p.plaza = true; p.court = court; } p.arrangement = 'plaza';
  return p;
}
export function guessProgram(text) { return applyPlaza(guessProgram0(text), text); }
function guessProgram0(text) {
  { const pp = parcelClauses(text); if (pp) return pp; }
  const t1 = wordsToDigits(String(text || '').toLowerCase()).replace(/\bsingle[- ]stor(y|ey)\b/g, '1-stor$1').replace(/(\d),(\d{3})/g, '$1$2'), hw = homeWords(t1), t = hw.t, p = {}; // (t: the homes' own numbers taken out)
  // the main use: a drive-thru or a coffee / QSR endcap on a building of another kind doesn't make it a restaurant
  // ("retail building with a drive thru", "8,000 sf strip with an endcap drive-thru"); a coffee shop or a QSR pad still is
  const t0 = t.replace(/\b(?:an?\s+)?(?:coffee|qsr|fast[- ]food|restaurant|food)?\s*(?:drive[- ]?thru|drive[- ]?through)?\s*end ?caps?\b(?:\s+(?:tenant|user|space))?|\b(?:coffee|qsr)\s+(?:drive[- ]?thru|drive[- ]?through)\b|drive[- ]?thru|drive[- ]?through/g, ' ');
  p.use = kindOf(t0) || kindOf(t) || (/(?<!town ?)\b(?:homes|homesites)\b/.test(t1) ? 'sfr' : /\bunits\b|residential/.test(t) ? 'multifamily' : 'other'); // ("50 homes": houses, when nothing more particular is said)
  const sfRe = /(\d+(?:\.\d+)?)\s*(k|thousand)?\s*\+?\s*(?:sf|sq\.?\s*ft|square[- ]f(?:ee|oo)t)/, unRe = /(\d+)[- ]?(?:(?!(?:stor|floor|level|acre|sq|square|foot|feet|ft|mile|minute|year|month|percent)\w*\b)[a-z][a-z-]*\s+){0,2}(?:units?|apartments|doors|homes|houses|homesites|townho(?:me|use)s?|duplex(?:es)?|cottages)/; // (a word or two between: "120 garden apartments", "40 for-rent townhomes"; never a size or a storey count) // ("6000+ sf": the + is a minimum, below)
  const sf = t.match(sfRe); if (sf) p.gfa = +sf[1] * (sf[2] ? 1000 : 1);
  // several floor areas in one request ("a 60,000 sf grocery store, 40,000 sf of shops"): the parts add up; a part named
  // as such ("100,000 sf center with a 60,000 sf grocery anchor") is within the whole, and so is everything after it
  if (sf) { const parts = t.split(/[;,\n]|\.(?!\d)|\band\b|\bplus\b|\bwith\b/).map(seg => ({ m: seg.match(sfRe), part: /anchor|of which|includ|total|of (?:that|it|which)/i.test(seg), anchor: /anchor|grocery|supermarket/i.test(seg) })).filter(x => x.m).map(x => ({ v: +x.m[1] * (x.m[2] ? 1000 : 1), part: x.part, anchor: x.anchor }));
    if (parts.length > 1 && parts[0].v === p.gfa) { let sum = parts[0].v; for (const x of parts.slice(1)) { if (x.part && x.v < parts[0].v) { sum = parts[0].v; break; } sum += x.v; } p.gfa = sum; }
    const an = parts.find(x => x.anchor); if (an && an.v <= p.gfa) p.anchor = an.v; } // (the grocery or anchor named with its floor area: the anchored-center layout, lib/sitecenter.mjs)
  // a size that's a minimum ("6000+ sf", "at least 6,000 sf", "6,000 sf or more"): that much, and more where it fits
  if (sf && (/(\d+(?:\.\d+)?)\s*(?:k|thousand)?\s*\+\s*(?:sf|sq\.?\s*ft|square[- ]f(?:ee|oo)t)/.test(t) || /\b(?:at least|a minimum of|minimum of|minimum|min\.?|no less than|no smaller than|upwards of)\s*(?:a\s*)?\d+(?:\.\d+)?\s*(?:k|thousand)?\s*(?:sf|sq\.?\s*ft|square[- ]f(?:ee|oo)t)/.test(t) || /\d\s*(?:k|thousand)?\s*(?:sf|sq\.?\s*ft|square[- ]f(?:ee|oo)t)(?:\s+[a-z-]+){0,2}?\s*(?:\+|\bor more\b|\bor larger\b|\bor bigger\b|\band up\b|\bminimum\b|\bmin\b|\bat least\b)/.test(t))) { p.atLeast = true; p.max = true; p.asked = { gfa: p.gfa }; }
  // the building's shape, when the words give one ("L-shaped", "U-shaped", "a courtyard building", "a tower on a podium")
  if (/\bcourtyards?\b/.test(t)) p.arrangement = 'courtyard'; else if (/\bloop (?:drive|road)\b|\bresort[- ]style\b|\bresort pool\b|\bround (?:a|the) (?:central )?pool\b|\bpool at the (?:center|heart|middle)\b/.test(t)) p.arrangement = 'loop'; // (how the words want the buildings laid out)
  { const fm = /\bl[- ]?shaped?\b|\bl[- ]shape\b/.test(t) ? 'L' : /\bu[- ]?shaped?\b|\bu[- ]shape\b|\bcourtyard (?:building|scheme|plan)\b/.test(t) ? 'U' : /\btower on a podium\b|\bpodium tower\b|\bhigh[- ]rise tower\b/.test(t) ? 'tower' : /\bbar[- ]shaped?\b|\ba bar building\b/.test(t) ? 'bar' : null; if (fm) p.form = fm; }
  const fl = t.match(/(\d+)[- ]?(?:stor(?:y|ies|ey)|floors?(?![- ]?plans?)|levels?)/); if (fl) p.floors = +fl[1]; // ("3 floor plans" are plans, not floors)
  const un = t.match(unRe); if (un) p.units = +un[1];
  const rm = t.match(/(\d+)[- ]?(?:rooms?|keys)\b/); if (rm && p.use === 'hotel' && !sf) p.gfa = +rm[1] * USES.hotel.roomSf; // a hotel by its rooms
  const se = t.match(/(\d+)[- ]?seats?\b/); if (se && p.use === 'church' && !sf) p.gfa = Math.round(+se[1] * 100 / 3 / 100) * 100; // a church by its seats: a space for every 3, at 10 a 1,000 sf
  const ra = t.match(/(\d+(?:\.\d+)?)\s*(?:\/|per)\s*1000/); if (ra) p.ratio = +ra[1];
  const pu = t.match(/(\d(?:\.\d+)?)\s*(?:spaces|stalls|parking)?\s*per\s*unit/); if (pu) p.perUnit = +pu[1];
  const bd = t.match(/(\d+)\s*buildings?/); if (bd) p.buildings = +bd[1]; else if (/\b(?:a single|one|single)\s+(?:large\s+|big\s+|small\s+)?(?:restaurant|building|store|shop|office|warehouse|space)/.test(t)) p.buildings = 1; // "a single large restaurant": one building
  const each = t.match(/(\d+)\s*(?:separate\s*)?buildings?\s*(?:of|at|@)\s*(\d+(?:\.\d+)?)\s*(k|thousand)?\s*(?:sf|sq\.?\s*ft|square[- ]f(?:ee|oo)t)\s*(?:each|apiece)?/); if (each) p.gfa = +each[1] * +each[2] * (each[3] ? 1000 : 1); // "4 buildings of 7,000 sf"
  const de = t.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of the site\s*)?(?:for\s*)?detention/); if (de) p.detentionPct = +de[1]; if (/no (?:detention )?ponds?\b|without (?:a )?(?:detention )?pond/.test(t)) p.storm = 'underground'; /* storage still needed, just not a pond */ else if (/no detention|without detention/.test(t)) p.detentionPct = 0;
  if (/pull[- ]?through|drive[- ]?through (?:drive|access)|through drive|two (?:entrances|driveways|access)/.test(t)) p.through = true;
  if (/multi-?family|rental (?:housing|homes|community)|build[- ]?to[- ]?rent|\bbtr\b|\bhousing\b|\bresidential rental/.test(t) && !/apartment|townhome|town home|duplex|triplex|fourplex|four-plex|studio|single[- ]family|\bhouses?\b|detached|\b1[- ]stor(?:y|ey)\b|homes? with (?:a |\d[- ]car )?garages?/.test(t) && !(p.zones?.length > 1)) { p.use = 'multifamily'; p.compare = true; } // housing in general: try the products and rank them
  { const g = t.search(/\bparking (?:garage|structure|deck)|structured parking|\bgarage parking|\bparking ramp/); if (g >= 0) { // a garage, where it falls among the uses named (by where each is first mentioned)
    p.garage = true; if (p.zones?.length > 1) { const W = { retail: /retail|shop|strip|grocery/, restaurant: /restaurant|pad/, office: /office/, medical: /medical|clinic|hospital/, hotel: /hotel|motel/, church: /church|chapel|worship/, industrial: /warehouse|industrial|storage|flex/, multifamily: /apartment|multifamily/, townhomes: /townhome/, duplex: /duplex/, sfr: /home|house|neighbo/, amenity: /commons|amenit|park/, other: /other/ };
      const at = p.zones.map(z => { const m = t.search(W[z.use] || /$^/); return m < 0 ? Infinity : m; }), k = at.filter(v => v < g).length; if (k > 0 && k < p.zones.length + 1) p.zones.splice(k, 0, { use: 'garage' }); } } }
  if (/\b(?:dumpsters?|trash (?:enclosures?|corrals?)|refuse)\b/.test(t) && !/\bno (?:dumpsters?|trash)/.test(t)) p.trash = true; // enclosures only when asked for
  { const m = t.match(/\b(two|three|four|2|3|4)\s+(?:separate\s+)?(?:entrances|entries|entry points|driveways|access points|curb cuts|ways in)\b/), W = { two: 2, three: 3, four: 4 }; // how many ways in
    if (m) p.entrances = W[m[1]] || +m[1]; else if (/\b(?:second|another|extra|additional|multiple|more)\s+(?:entrance|entry|driveway|access point|curb cut|way in)/.test(t)) p.entrances = 2; }
  if (p.storm) {} else if (/retention|wet pond|permanent pool/.test(t)) p.storm = 'retention'; else if (/underground (?:detention|storage|vault)|detention vault|storm ?(?:water )?vault|under the parking/.test(t)) p.storm = 'underground'; else if (/regional detention|off-?site detention/.test(t)) p.storm = 'none'; // ("no detention" sets the share to 0 above)
  const ex = [['patio', /outdoor (?:seating|dining)|patio|terrace/], ['playground', /playground|play ?area|tot lot/], ['lawn', /grass|lawn|green ?space|open space/], ['drivethru', /drive[- ]?thru|drive[- ]?through(?! drive)/]].filter(([, re]) => re.test(t)).map(([k]) => k); if (ex.length) p.extras = ex; // small extras laid out with the main use
  if (/no truck|without truck/.test(t)) p.truck = false; else if (/truck court|dock|loading/.test(t)) p.truck = true;
  if (/max(imize|imum)?|as (much|big|large)\b|biggest|largest|whatever fits/.test(t) && !sf) p.max = true;
  if (p.use === 'fuel') { // the pumps, the store and the extras, as said; a truck stop or travel center is laid out as the car version
    const q = {}, pm = t.match(/(\d+)\s*(?:fuel |gas )?(?:pumps?|mpds?|multi-product dispensers?|dispensers?)\b/), fp = t.match(/(\d+)\s*(?:fueling|fuelling|fuel) positions?/);
    if (pm) q.pumps = +pm[1]; else if (fp) q.pumps = Math.ceil(+fp[1] / 2); else if (/buc-?ee'?s|quik ?trip|\bqt\b|racetrac|\bwawa\b|travel (?:center|centre|plaza)|truck stop|\blarge\b|\bbig\b/.test(t)) q.pumps = 12;
    if (sf) q.storeSf = p.gfa;
    if (/car ?wash|tunnel wash|express wash|wash tunnel/.test(t) && !/no (?:car ?)?wash|without (?:a )?(?:car ?)?wash/.test(t)) q.wash = true;
    if (/no air|without air|no vac/.test(t)) q.vac = false;
    if (/canopy (?:runs? )?(?:along|facing|parallel to|on) (?:the )?side street/.test(t)) q.canopy = 'side'; else if (/canopy (?:runs? )?(?:along|facing|parallel to|on) (?:the )?(?:front|main|highway|busier)/.test(t)) q.canopy = 'front';
    if (/truck stop|travel (?:center|centre|plaza)|diesel|\bsemis?\b|18[- ]wheel|big rigs?/.test(t)) q.truckStop = true;
    p.fuel = q; delete p.units; delete p.buildings; delete p.floors; delete p.extras;
  }
  if (p.use === 'storage') { // the climate-controlled building and the drive-up rows, each with the size said beside it
    const q = {}, CL = /climate|indoor|interior|multi-?stor|\b[2-5][- ]?stor/, DU = /drive[- ]?up|non[- ]?climate|outdoor|exterior|single[- ]stor|1[- ]stor|one[- ]stor/;
    let last = null; // "a 3-story climate-controlled building, about 90,000 sf": the size goes with the part just named
    for (const seg of t.split(/[;,\n]|\.(?!\d)|\band\b|\bplus\b|\bwith\b/)) { const k = DU.test(seg) ? 'driveSf' : CL.test(seg) ? 'climateSf' : null, m = seg.match(sfRe);
      if (m && (k || last)) q[k || last] = (q[k || last] || 0) + +m[1] * (m[2] ? 1000 : 1); last = k && !m ? k : null; }
    if (/no climate|without climate|drive[- ]?up only|only drive[- ]?up|all drive[- ]?up/.test(t)) q.climateSf = 0;
    if (/no drive[- ]?up|without drive[- ]?up|climate[- ]controlled only|only climate|all climate/.test(t)) q.driveSf = 0;
    if (q.climateSf != null || q.driveSf != null) delete p.gfa;
    const rv = t.match(/(\d+)\s*(?:rv|boat|rv\/boat|rv and boat|boat and rv)\s*(?:spaces|stalls|spots|parking)?/); if (rv) q.rv = +rv[1]; else if (/\b(?:rv|boat)s?\b/.test(t) && !/no (?:rv|boat)/.test(t)) q.rv = 24;
    if (/no fence|without (?:a )?fence|unfenced/.test(t)) q.fence = false;
    p.storage = q; delete p.units;
  }
  if (p.use === 'foodtrucks') { // the trucks, the pavilion, the bar and the playground, each with the size said beside it
    const q = {}, tr = t.match(/(\d+)\s*(?:food[- ]?)?(?:trucks?|truck stalls?|stalls?|vendors?)\b/); if (tr) q.trucks = +tr[1];
    for (const seg of t.split(/[;,\n]|\.(?!\d)|\band\b|\bplus\b|\bwith\b/)) { const m = seg.match(sfRe); if (!m) continue; const v = +m[1] * (m[2] ? 1000 : 1);
      if (/\bbar\b|beer|tap ?room|brew/.test(seg)) q.barSf = v; else if (/pavilion|covered|shade|canopy/.test(seg)) q.pavilionSf = v; else if (/rest ?rooms?|toilets?/.test(seg)) q.restroomSf = v; }
    if (/\bno (?:bar|beer)|without (?:a )?(?:bar|beer)/.test(t)) q.bar = false; else if (q.barSf == null && /\b(?:small|little) (?:bar|beer garden)/.test(t)) q.barSf = 1500; else if (q.barSf == null && /\b(?:large|big) (?:bar|beer garden)/.test(t)) q.barSf = 3000;
    if (/\bno (?:playground|play area)|without (?:a )?playground/.test(t)) q.playground = false;
    const pk = t.match(/(\d+(?:\.\d+)?)\s*(?:parking )?(?:spaces|stalls)\s*(?:per|a|an|\/)\s*truck/); if (pk) q.perTruck = +pk[1];
    p.foodtrucks = q; delete p.gfa; delete p.units; delete p.extras; delete p.buildings;
    return p; // one use: its pavilion, lawn and playground are part of it, not a commons beside it
  }
  // several uses: one zone per use, with the numbers said next to it
  const zones = new Map(); let last = null, am = false, club = null;
  // a neighbourhood's own leasing office or clubhouse ("160 homes with a 4,000 sf leasing center at the entry") is part of the
  // neighbourhood (lib/sitelayout.mjs withClubhouse), not a retail or commons zone beside it
  const resid = /(?<!town ?)\bhomes\b|houses\b|single[- ]family|subdivision|n[ei]{1,2}ghbou?rhood|detached|townho/.test(t) && !/retail|shopping|\bshops?\b|office (?:building|park|space)|warehouse|industrial|restaurant|hotel|storage|apartments?|multi-?family/.test(t)
    && !/\blake\b|\bpools?\b|swimming|playground|commons|\bpark\b|pavilion|pickleball|\bcourts?\b|amenities\b/.test(t); // (a clubhouse with a lake, a pool or a park is the commons')
  for (const seg0 of t.split(/[;,\n&+]|\band\b|\bplus\b|\bwith\b|\bthen\b|\bbehind\b|\bin (?:the )?(?:front|back|middle)\b|\balso\b/)) {
    if (resid && CLUB_RE.test(seg0)) { const cs = seg0.match(sfRe), v = cs ? +cs[1] * (cs[2] ? 1000 : 1) : 4000; if (v <= 10000) { club = v; continue; } }
    const cut = seg0.search(REL), head = cut > 0 ? seg0.slice(0, cut) : seg0, bare = /^\s*(?:the )?homes\b/.test(head), homes = /(?<!town ?)\bhomes\b/.test(head) && (/\d/.test(head) || cut > 0 || bare), seg = cut > 0 && (kindOf(head) || homes) ? head : seg0; // "apartments beside the retail": the apartments, and the retail is there too
    const tail = seg !== seg0 ? seg0.slice(cut) : '', u2 = tail && kindOf(tail), addItems = (z, s) => { const it = amItems(s); if (it.length) z.items = [...new Set([...(z.items || []), ...it])]; };
    if (u2 && u2 !== 'foodtrucks' && u2 !== 'fuel') { const z2 = zones.get(u2) || { use: u2 }, s2 = tail.match(sfRe), n2 = tail.match(unRe); if (s2 && !z2.gfa) z2.gfa = +s2[1] * (s2[2] ? 1000 : 1); if (n2 && !z2.units) z2.units = +n2[1]; if (u2 === 'amenity') addItems(z2, tail); zones.set(u2, z2); } // (with what's said of it: "next to 20,000 sf of retail", "round 2 pickleball courts")
    const k0 = HOMES_ROUND.test(seg0) ? 'sfr' : kindOf(seg) || (/(?<!town ?)\bhomes\b/.test(seg) && (/\d/.test(seg) || seg !== seg0 || bare) ? 'sfr' : null), use = k0 === 'retail' && p.use === 'fuel' && !/strip|retail|shopping|cent(?:er|re)|mall/.test(seg) ? 'fuel' : k0, pd0 = seg.match(/(\d+)\s*pads?\b/); // ("homes at the back": homes, said as a use of their own)
    // a drive-thru, a coffee or QSR endcap on the building already named is that building's tenant (the drive-thru extra),
    // not a second use: a restaurant zone only when the words make it its own building (a pad, an outparcel, its own size)
    if (use === 'restaurant' && zones.size && /drive[- ]?thru|drive[- ]?through|end ?caps?\b/.test(seg) && !/\brestaurants?\b|\bpads?\b|out-?parcels?|freestanding|free[- ]standing|stand[- ]?alone|separate|\bbuildings?\b/.test(seg) && !sfRe.test(seg)) continue;
    if (!use) { if (last && pd0) last.pads = +pd0[1]; if (am) { const a = zones.get('amenity') || { use: 'amenity' }; addItems(a, seg); if (a.items) zones.set('amenity', a); } continue; } // "a commons with a pool and playground": the commons' items
    am = use === 'amenity' || u2 === 'amenity' || LAKE_ROUND.test(seg0) || /\b(?:a?round|surrounding) (?:a |an |the )?(?:central )?(?:commons|park|clubhouse)/.test(seg0);
    const z = zones.get(use) || { use }, s1 = seg.match(sfRe), u1 = seg.match(unRe), f1 = seg.match(/(\d+)[- ]?(?:stor(?:y|ies|ey)|floors?(?![- ]?plans?)|levels?)/), pd = seg.match(/(\d+)\s*pads?\b/);
    if (use === 'amenity') addItems(z, seg);
    const r1 = use === 'hotel' && !s1 && seg.match(/(\d+)[- ]?(?:rooms?|keys)\b/); if (r1) z.gfa = (z.gfa || 0) + +r1[1] * USES.hotel.roomSf;
    if (s1) z.gfa = (z.gfa || 0) + +s1[1] * (s1[2] ? 1000 : 1); if (u1) z.units = (z.units || 0) + +u1[1]; if (f1) z.floors = +f1[1]; if (pd) z.pads = +pd[1];
    zones.set(use, z); last = z;
  }
  if (/\bflex\b|small[- ]bay/i.test(text) && p.use === 'industrial') p.flex = true; // flex space: shallow bays, front parking, grade-level doors behind
  if (club) { p.clubhouse = { sf: club }; if (!HOME_USES.includes(p.use)) p.use = [...zones.values()].find(z => HOME_USES.includes(z.use))?.use || 'sfr'; delete p.gfa; } // (the homes are the use; a size said is the clubhouse's or the homes')
  if (HOME_USES.includes(p.use) && p.floors && !p.homeMix && /(\d+)[- ]?stor(?:y|ies|ey)/.test(t)) p.homeMix = [{ stories: Math.min(3, p.floors), pct: 100 }]; // ("1-story homes": all of them, not the usual mix)
  { const pw = t.match(/(\d+)?\s*(?:pad[- ]sites?|pads?|out-?parcels?)\b/); if (pw && ['retail', 'restaurant', 'office', 'medical', 'fuel'].includes(p.use) && !p.pads) p.pads = pw[1] ? +pw[1] : (zones.get(p.use)?.pads || 0) || 'auto'; } // "with pad sites": some, as the frontage allows
  if ((zones.size > 1 || zones.has('sfr')) && LAKE_ROUND.test(t)) { const am = zones.get('amenity') || { use: 'amenity' }; am.items = [...new Set([...(am.items || []), 'lake'])]; zones.set('amenity', am); } // "homes round a lake": the commons holds it
  { const a = zones.get('amenity'); if (a?.items?.length === 1 && a.items[0] === 'lake') delete a.items; } // ("a lake" alone: the commons as it comes, its lake among the rest; a lake said with other things is one of them)
  const hs = hw.o; if (Object.keys(hs).length) { // the homes' size, floor plans and smallest lot: the program's, and its home zone's
    const { lotD, ...top } = hs; Object.assign(p, top); if (lotD) p.lotD = lotD;
    if (zones.size > 1 || HOME_USES.includes(p.use) && zones.size === 1) { const hz = [...zones.values()].filter(z => HOME_USES.includes(z.use)); for (const z of hz.length ? hz : []) Object.assign(z, hs); }
    if (zones.size <= 1 && !HOME_USES.includes(p.use) && (p.use === 'other' || p.use === 'multifamily' && !/apartment|multi-?family/.test(t))) p.use = [...zones.values()][0]?.use && HOME_USES.includes([...zones.values()][0].use) ? [...zones.values()][0].use : 'sfr'; } // ("2,000 sf homes on 7,000 sf lots": homes, not some other use)
  if (zones.size === 1 && !p.pads) { const z = [...zones.values()][0]; if (z.pads && z.use === p.use) p.pads = z.pads; } // (one use: "a retail strip with 2 pad sites" keeps its pads)
  if (zones.size > 1) {
    p.zones = [...zones.values()].sort((a, b) => ZONE_ORDER.indexOf(a.use) - ZONE_ORDER.indexOf(b.use)); p.use = p.zones[0].use; delete p.gfa; delete p.units; delete p.floors;
    if (/(?:commons|amenit\w*|community (?:center|space)|clubhouse|park)[^.;]*?\b(?:in|at|to) the (?:back|rear)/.test(t)) { const i = p.zones.findIndex(z => z.use === 'amenity'); if (i >= 0) p.zones.push(...p.zones.splice(i, 1)); } // "a community center at the back"
    placeWords(t, p.zones); // (after the order is settled: placement names zones by their place in the list)
    const fz = p.zones.find(z => z.use === 'fuel'); if (fz && p.fuel) { if (fz.gfa) p.fuel.storeSf = fz.gfa; else delete p.fuel.storeSf; } // (a mix: the store's size is the one said with the store, not the first size in the request)
  }
  { const hk = homeKindOf(t); if (hk) { // a tiny / manufactured home community ("like an RV park", "a mobile home park" are its layout, not a commons; its cottages are its homes)
    if (p.zones && p.zones.every(z => ['sfr', 'amenity', 'duplex'].includes(z.use))) { delete p.zones; p.use = 'sfr'; }
    if (p.zones) { const z = p.zones.find(q => q.use === 'sfr' || q.use === 'duplex'); if (z) { z.use = 'sfr'; z.homeKind = hk; } } else { p.use = 'sfr'; p.homeKind = hk; delete p.compare; delete p.gfa; delete p.floors; const n = t.match(/(?<!(?:[x×]|\bby)\s*'?\s*)\b(\d+)\s*(?:home\s*|rv\s*)?(?:lots|sites|homesites|pads|spaces)\b/); if (n && !p.units) p.units = +n[1]; }
    // a pad size ("25 x 55 pads", "30' x 60' lots", "25x55 typ"): the lot of every home; a landscape strip along the property line when asked
    const z = p.zones?.find(q => q.homeKind) || p; if (z.lotD > 0) z.lotSet = true; const pd = t.match(/\b(\d{2,3})\s*(?:'|ft|foot|feet)?\s*(?:x|×|by)\s*(\d{2,3})\s*(?:'|ft|foot|feet)?\s*(?:typ(?:ical)?\.?|(?:rv\s*|home\s*)?(?:pads?|sites?|lots?|spaces?|homesites?)\b)/), hf = t.match(/\b(\d{1,2})\s*(?:'|ft|foot|feet)?\s*(?:x|×|by)\s*(\d{2})\s*(?:'|ft|foot|feet)?\s*(?:tiny\s*|mobile\s*|manufactured\s*|park[- ]model\s*)?(?:homes?|houses?|units?|cottages?|cabins?|(?:single|double)[- ]wides?)\b/) || t.match(/\b(?:tiny homes?|park models?|cottages?|(?:single|double)[- ]wides?|homes?)\s*(?:of\s*|at\s*|,\s*)?(\d{1,2})\s*(?:'|ft|foot|feet)?\s*(?:x|×|by)\s*(\d{2})\b/);
    if (hf && +hf[1] >= 8 && +hf[1] <= 40 && +hf[2] >= 16 && +hf[2] <= 90) { z.homeW = Math.min(+hf[1], +hf[2]); z.homeD = Math.max(+hf[1], +hf[2]); if (p.units === +hf[2] && !(t.replace(hf[0], ' ').match(new RegExp('\\b' + hf[2] + '\\s*(?:homes|units|lots|sites|pads)')))) delete p.units; } // ("16 x 40 homes" is a size, not 40 homes)
    if (!z.units && !p.units) { const c = t.match(/(?<!(?:[x×]|\bby)\s*'?\s*)\b(\d{1,4})\s*(?:tiny\s*|mobile\s*|manufactured\s*|rental\s*)?(?:homes|houses|cottages|units)\b/); if (c && +c[1] >= 4) z.units = +c[1]; } // ("60 tiny homes")
    if (pd && +pd[1] >= 20 && +pd[1] <= 80 && +pd[2] >= 40 && +pd[2] <= 150) { z.lotW = Math.min(+pd[1], +pd[2]); z.lotD = Math.max(+pd[1], +pd[2]); z.lotSet = true; }
    const bf = t.match(/(\d{1,2})\s*(?:'|ft|foot|feet)?\s*(?:landscape\s*|green\s*)?(?:buffer|landscape strip|setback from the (?:property|lot) line)/); if (bf) z.buffer = +bf[1]; else if (/no (?:landscape )?(?:buffer|strip)|to the property line|to the lot line/.test(t)) z.buffer = 0; } }
  return p;
}

// ---------- numbers and checks ----------
// the owner's objective, in sq ft: leasable floor area plus the homes' sellable living area (metrics: nrsf, split as
// leasable and sellable). The layout engines rank by it beside the hard rules (checks, parking, detention, a size asked
// for), which still come first: LSF_PTS × 100,000 points (1,000) for the most a search found, the others their share of it
// (lib/sitelayout.mjs mixedOptions), or that many for floor area of a fifth of the site's area (lib/sitepods.mjs planScore)
export const LSF_PTS = 0.01;
export const lsfOf = m => m ? (m.nrsf || 0) : 0;
// the land a layout doesn't need for what was asked (params.fill): 'fill' (the default, true or unset) gives it more of
// the program (more homes, longer shop rows, more buildings) as one plan; 'phase' fills it the same way and marks what's
// past the ask Phase 2; 'hold' (false) builds what was asked and keeps the rest as land for later ("Future development")
export const fillMode = params => params?.fill === false ? 'hold' : params?.fill === 'phase' ? 'phase' : 'fill';
export function metrics(plan) {
  const ring = plan.ring || [], els = plan.elements || [], prog = normalizeProgram(plan.program);
  const sum = (k, f = elArea) => els.filter(e => e.kind === k).reduce((s, e) => s + (k === 'building' ? footArea(e) : f(e)), 0), B = els.filter(e => e.kind === 'building');
  const useOf = e => USES[e.use] ? e.use : prog.use, gfaOf = e => gfaOfEl(e); // a home counts its living area, not its garage
  const site = ringArea(ring), footprint = sum('building'), gfa = B.reduce((s, e) => s + gfaOf(e), 0);
  const canopy = sum('canopy'), paved = sum('parking') + sum('drive') + sum('truck') + sum('plaza') + sum('foodtruck') + canopy + sum('tanks') + fieldPaving(els), pond = sum('pond'), hard = sum('court') + sum('pool'), keepout = sum('keepout'); // an easement is neither built on nor open space; a canopy's paving counts once, as paving
  const lots = els.filter(e => e.kind === 'parking' && !e.rv && !e.vac), raw = lots.reduce((s, e) => s + stalls(e).count, 0), stallsN = raw - adaLoss(raw), ada = adaCount(raw); // accessible pairs share an aisle
  const deck = els.filter(e => e.kind === 'garage').reduce((s, e) => s + garageStalls(e), 0); // parking garages: about 330 sq ft a space on each level
  // homes: apartments from floor area, townhomes and duplexes as drawn; parking needed per building by its own use
  const single = B.every(e => useOf(e) === prog.use), wholeMf = single && prog.use === 'multifamily' && gfa && !B.some(e => e.units != null);
  let units = 0, garages = 0, need = 0, driveways = 0; const needOf = new Map();
  if (wholeMf) { units = unitsOf(prog, gfa); need = required(prog, gfa); }
  else for (const e of B) {
    const u = useOf(e), U = USES[u], P = u === prog.use && !prog.zones ? prog : normalizeProgram({ use: u }); let q = 0; // mixed use: each building by its own use's numbers, as the layout counts them
    if (u === 'multifamily') { const n = e.units ?? Math.floor(gfaOf(e) * (P.eff || 0.85) / P.unitSf); units += n; q = n * P.perUnit; }
    else if (u === 'sfr' && (e.padSpaces != null || e.tiny)) { units += e.units ?? 1; driveways += e.padSpaces ?? 1; q = (e.units ?? 1) * (P.homeKind && P.perUnit === HOME_KINDS[P.homeKind].perUnit ? HOME_KINDS[e.tiny ? 'tiny' : 'manufactured'].perUnit : P.perUnit); } // a community's home (lib/sitecommunity.mjs) or a tiny home: no garage, its parking pad; parked as its kind needs (a tiny home one space, a manufactured home two) unless a ratio was asked
    else if (U.garage) { const n = e.units ?? 1; units += n; garages += n * U.garage; driveways += drivewayOf({ ...e, use: u }); q = n * (P.perUnit + (U.guest || 0)); } // townhomes: guest spaces on the surface too
    else q = u === 'foodtrucks' && ftKind(e) !== 'bar' ? 0 : u === 'fuel' && fuelKind(e) === 'wash' ? 0 : gfaOf(e) / 1000 * P.ratio; // a food truck park: the bar by its floor area, the trucks below; a car wash parks in its own lane
    needOf.set(e, q); need += q;
  }
  const ftN = els.filter(e => e.kind === 'foodtruck').length; if (ftN) need += ftN * (prog.use === 'foodtrucks' ? prog.foodtrucks.perTruck : FOODTRUCK.perTruck); // spaces a truck (its customers)
  for (const e of els) if (e.kind !== 'building' && +e.park > 0) need += +e.park; // a piece with spaces of its own: an AI-crafted type's courts (lib/customtypes.mjs)
  const needAll = need; need = Math.ceil(need - 0.01);
  const spaces = stallsN + garages + deck + driveways;
  // Phase 1 alone (a filled site marks the buildings past what was asked for as Phase 2): its buildings' need, and its
  // share of the parking. The site is parked as one field and Phase 2 must be fully parked too, so Phase 1 gets the
  // surface and garage spaces in proportion to its need (the same ratio as the whole site); homes keep their own garages.
  let p1 = { need, stalls: spaces };
  if (B.some(e => e.phase === 2)) {
    const B1 = B.filter(e => e.phase !== 2), n1 = wholeMf ? required(prog, B1.reduce((s, e) => s + gfaOf(e), 0)) : B1.reduce((s, e) => s + needOf.get(e), 0);
    const hg = B1.reduce((s, e) => s + (USES[useOf(e)].garage ? (e.units ?? 1) * USES[useOf(e)].garage : 0), 0), share = (wholeMf ? need : needAll) > 0 ? Math.min(1, n1 / (wholeMf ? need : needAll)) : 0;
    p1 = { need: Math.ceil(n1 - 0.01), stalls: Math.round((stallsN + deck) * share) + hg };
  } else if (prog.zones && !wholeMf && needAll > 0) { // mixed use filled past what was asked (longer shop and office rows): Phase 1 is each zone's ask
    const by = new Map(); for (const e of B) { const u = useOf(e); if (!by.has(u)) by.set(u, []); by.get(u).push(e); }
    let n1 = 0, over = false;
    for (const [u, list] of by) {
      const ask = prog.zones.filter(z => z.use === u && z.gfa).reduce((t, z) => t + z.gfa, 0), q = list.reduce((t, e) => t + needOf.get(e), 0), g = list.reduce((t, e) => t + gfaOf(e), 0);
      if (ask && g > ask * 1.05 && !USES[u].garage && u !== 'multifamily') { n1 += q * ask / g; over = true; } else n1 += q;
    }
    if (over) p1 = { need: Math.ceil(n1 - 0.01), stalls: Math.round((stallsN + deck) * Math.min(1, n1 / needAll)) + garages };
  }
  const heightFt = Math.max(0, ...B.map(e => (e.floors || 1) * USES[useOf(e)].floorH));
  // tabulation: apartments by the unit mix, beds, rentable area
  const mfB = B.filter(e => useOf(e) === 'multifamily'), mfProg = prog.use === 'multifamily' ? prog : normalizeProgram({ use: 'multifamily' });
  const mfUnits = single && prog.use === 'multifamily' && !mfB.some(e => e.units != null) ? units : mfB.reduce((s, e) => s + (e.units ?? Math.floor(gfaOf(e) * mfProg.eff / mfProg.unitSf)), 0);
  const mix = mfUnits ? splitMix(mfUnits, mfProg.mix) : [], HB = { townhomes: 3, duplex: 2 };
  const homeBeds = B.reduce((s, e) => { const u = useOf(e); return s + (u === 'sfr' ? (e.floors >= 2 ? 4 : 3) * (e.units ?? 1) : HB[u] ? HB[u] * (e.units ?? 1) : 0); }, 0);
  const beds = mix.reduce((s, t) => s + t.n * (t.beds ?? 1), 0) + homeBeds, NET = { retail: 0.95, restaurant: 0.95, office: 0.87, medical: 0.87, hotel: 0.9, church: 0.9, industrial: 1, fuel: 0.95, other: 0.9 };
  const sto = B.some(e => useOf(e) === 'storage') || els.some(e => e.rv) ? storageOf(els, prog.use === 'storage' ? prog : normalizeProgram({ use: 'storage' })) : null; // self storage: rentable area and units by kind
  const ft = ftN || B.some(e => useOf(e) === 'foodtrucks') ? foodTruckOf(els) : null; // a food truck park: trucks, seats, the pavilion, restrooms and bar
  // the owner's objective (lib/sitelayout.mjs and lib/sitepods.mjs rank by it): leasable floor area (shops, offices and
  // the like at their net share, apartments' net units, storage's rentable) plus the sellable living area of the homes
  const sellable = B.reduce((s, e) => { const u = useOf(e); return s + (USES[u]?.garage ? (e.sf ?? gfaOf(e)) : 0); }, 0);
  const nrsf = mix.reduce((s, t) => s + t.n * t.sf, 0) + (sto ? sto.nrsf : 0) + B.reduce((s, e) => { const u = useOf(e); return s + (u === 'multifamily' || u === 'amenity' || u === 'storage' || u === 'foodtrucks' && ftKind(e) !== 'bar' ? 0 : USES[u].garage ? (e.sf ?? gfaOf(e)) : gfaOf(e) * (NET[u] ?? 0.9)); }, 0);
  // spaces: everything provided (surface stalls less the accessible aisles' share, home garages, parking garages); need
  // is the same as required. p1: { need, stalls } for Phase 1 alone, stalls counted like spaces (the whole plan when
  // nothing is marked Phase 2 or grown past what was asked).
  const fuel = canopy || B.some(e => useOf(e) === 'fuel') ? fuelOf(els.map(e => e.kind === 'building' ? { ...e, use: useOf(e) } : e)) : null; // a gas station: pumps, the store, the canopy
  return { siteSf: site, acres: site / 43560, footprint, gfa, coverage: site ? (footprint + canopy) / site : 0, far: site ? gfa / site : 0, spaces, stalls: stallsN, deck, ada, garages, driveways, required: need, need, p1, storage: sto, foodtrucks: ft, fuel, canopy, // (a canopy counts toward coverage)
    units: units || null, paved, pond, impervious: site ? Math.min(1, (footprint + paved + hard) / site) : 0,
    green: site ? Math.max(0, 1 - (footprint + paved + hard + pond + keepout) / site) : 0, keepout, heightFt, buildings: B.length,
    mix, beds: beds || null, nrsf, sellable, leasable: nrsf - sellable, duAc: site && units ? units / (site / 43560) : 0, perUnit: units ? spaces / units : 0, per1k: gfa ? spaces / gfa * 1000 : 0 };
}
// the centre of every stall in a parking piece (plan feet), islands and end caps left out
export function stallCentres(e, S0 = STALL) {
  const S = e.sw ? { w: e.sw, d: e.sd || S0.d, aisle: e.sa || S0.aisle } : S0, st = stalls(e, S), x0 = -st.n * S.w / 2, out = [];
  if (e.poly) return STL.centresOf(st.fill);
  const skip = new Set(); if (e.islands) for (let k = 12; k < st.n - (e.caps ? 1 : 0); k += 13) skip.add(k); if (e.caps && st.n >= 6) { skip.add(0); skip.add(st.n - 1); }
  for (const [y0, y1] of st.rows) for (let i = 0; i < st.n; i++) if (!skip.has(i)) { const u = x0 + (i + 0.5) * S.w, v = (y0 + y1) / 2, q = rot(st.swap ? [v, -u] : [u, v], e.rot || 0); out.push([e.x + q[0], e.y + q[1]]); }
  return out;
}

// a grid of things by their bounding boxes (feet): what's near a box without looking at everything. 300-acre plans have
// thousands of pieces, and every redraw asks these questions.
export function gridIndex(items, boxOf, cell = 150) {
  const m = new Map(), key = (i, j) => i * 100003 + j, put = (it, b) => { for (let i = Math.floor(b[0] / cell); i <= Math.floor(b[2] / cell); i++) for (let j = Math.floor(b[1] / cell); j <= Math.floor(b[3] / cell); j++) { const k = key(i, j); const l = m.get(k); if (l) l.push(it); else m.set(k, [it]); } };
  for (const it of items) put(it, boxOf(it));
  return { add: (it, b) => put(it, b || boxOf(it)), near(x0, y0, x1, y1) { const out = new Set(); for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) for (let j = Math.floor(y0 / cell); j <= Math.floor(y1 / cell); j++) for (const it of m.get(key(i, j)) || []) out.add(it); return out; } };
}
const boxOfPts = r => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of r) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
// "1 space", "20 spaces"
export const spacesWord = n => Math.round(n).toLocaleString('en-US') + ' space' + (Math.round(n) === 1 ? '' : 's');
// problems to show on the plan: outside the lot, inside a setback, overlaps, parking short, zoning limits
export const KEEP_OFF = ['building', 'garage', 'parking', 'drive', 'truck', 'field', 'pond', 'pool']; // what can't sit on an easement
// check() and details() run two or three times for each redraw of an unchanged plan (the overview, Numbers, the map's
// flags; about 0.15 s each on an 86-acre plan): the last answer is kept while the plan's JSON (past runs aside) is the
// same, and handed out as a copy so no caller can change it
const lastOf = fn => { let k0 = null, v0 = null; return plan => { let k = null; try { k = JSON.stringify(plan, (key, v) => key === 'lastRun' ? undefined : v); } catch (e) { return fn(plan); }
  if (k === k0) return structuredClone(v0); const v = fn(plan); k0 = k; v0 = structuredClone(v); return v; }; };
export const check = lastOf(checkPlan);
export const junctionsOf = lastOf(junctionsAt); // (asked again for each click and each AI change on an unchanged plan)
// the street junctions where a roundabout could go: nothing that can't give way there even at its smallest, and none
// there already, at one of its sizes (the Add Roundabout tool marks them; the homes there aren't looked at)
export const ringSpots = lastOf(plan => { const rings = (plan.elements || []).filter(isRing).map(ringOf); return junctionsOf(plan).filter(j => !j.parking && !rings.some(g => Math.hypot(g.c[0] - j.at[0], g.c[1] - j.at[1]) < 2 * g.R) && (sk => ringSizes(j).some(R => (b => !b.out && !b.hit)(ringBlocked(plan, j.at, R, sk))))(new Set(entrancesOf(plan.elements || []).flatMap(e => entryParts(plan, e))))).map(j => j.at); });
function checkPlan(plan) {
  const ring = plan.ring || [], rules = edgeRules(ring, plan.front, plan.setbacks, plan.streets), issues = [], els = plan.elements || [];
  const name = e => e.name || (KINDS[e.kind]?.label || e.kind) + (els.filter(x => x.kind === e.kind).length > 1 ? ' ' + (els.filter(x => x.kind === e.kind).indexOf(e) + 1) : '');
  for (const e of els) {
    if (e.kind === 'lot') continue;
    const c = shapeOf(e);
    const meets = k => e.kind === 'drive' && (rules[k].role === 'front' || rules[k].street); // a drive may cross a street edge to meet the street
    const outside = c.some(p => !inRing(p, ring) && !meets(nearestEdge(ring, p)) && distToPoly(p, ring) > (e.kind === 'keepout' ? 2 : 0.6)) || c.some((p, i) => ring.some((a, k) => !meets(k) && segsCross(p, c[(i + 1) % c.length], a, ring[(k + 1) % ring.length])));
    if (outside) { issues.push({ id: e.id, level: 'bad', text: name(e) + ' runs outside the lot' }); continue; }
    if (e.kind === 'green' || e.kind === 'trail' || e.kind === 'lot' || e.kind === 'keepout' || e.kind === 'fence' || e.kind === 'sign') continue; // (a monument sign stands in the landscape buffer)
    const short = {};
    ring.forEach((a, k) => {
      const need = e.kind === 'building' || e.kind === 'canopy' ? rules[k].build : e.kind === 'drive' && (rules[k].role === 'front' || rules[k].street) ? 0 : e.kind === 'pond' || e.kind === 'play' ? Math.min(5, rules[k].pave) : rules[k].pave; // (a canopy keeps the building lines too)
      if (need > 0 && rectDist(c, a, ring[(k + 1) % ring.length]) < need - 0.5) short[rules[k].role] = Math.max(short[rules[k].role] || 0, need);
    });
    for (const [role, need] of Object.entries(short)) issues.push({ id: e.id, level: e.kind === 'building' ? 'bad' : 'warn', text: name(e) + (e.kind === 'building' || e.kind === 'canopy' ? ' is inside the ' + need + ' ft ' + role + ' setback' + (e.kind === 'canopy' ? ' (some cities let a canopy in: check)' : '') : ' is inside the ' + need + ' ft landscape buffer (' + role + ')') });
  }
  const idx = new Map(els.map((e, i) => [e, i])), G = gridIndex(els.filter(e => !['green', 'trail', 'lot', 'keepout', 'fence'].includes(e.kind)), e => boxOfPts(shapeOf(e)));
  for (let i = 0; i < els.length; i++) { const a0 = els[i]; if (['green', 'trail', 'lot', 'keepout', 'fence'].includes(a0.kind)) continue; const bb = boxOfPts(shapeOf(a0)); for (const b0 of G.near(...bb)) { const j = idx.get(b0); if (j <= i) continue;
    const a = a0, b = b0, ks = [a.kind, b.kind];
    if (ks.includes('green') || ks.includes('trail') || ks.includes('lot') || ks.includes('sign') || !(KINDS[a.kind]?.solid || KINDS[b.kind]?.solid)) continue; // (signs below)
    if (ks.includes('building') && ks.includes('pool') || ks.includes('building') && ks.includes('plaza') || ks.includes('pool') && ks.includes('plaza')) continue; // a pool on its deck, against its clubhouse
    if (rectsOverlap(a, b)) issues.push({ id: KINDS[a.kind]?.solid ? a.id : b.id, level: 'bad', text: name(a) + ' overlaps ' + name(b) }); } }
  // a park, lawn or open space under a drive or a building (the park goes red: repair() drops a generated one, never the
  // street). Touching, or a sliver under 2 ft, isn't an overlap; a planted island drawn wholly inside a drive is fine, and
  // so is a building standing wholly in the park (a pavilion on a food truck park's lawn)
  for (const g of els.filter(isPark)) { const gs = shapeOf(g), inner = grow(gs, -2), gb = boxOfPts(gs);
    for (const b of G.near(...gb)) { if (!['drive', 'truck', 'field', 'building', 'garage'].includes(b.kind)) continue; const bs = shapeOf(b);
      if (b.kind === 'drive' || b.kind === 'field' ? gs.every(p => inRing(p, bs)) : b.kind !== 'truck' && bs.every(p => inRing(p, gs))) continue; // (an island drawn wholly on a drive or a parking field is fine)
      if (polysOverlap(inner, bs, 0.5)) issues.push({ id: g.id, level: 'bad', text: name(g) + ' overlaps ' + name(b) }); } }
  // roundabouts and drop-off loops: nothing on a planted island (the other piece goes red: repair() drops a generated
  // home or row laid there, never the pinned ring), no stalls on the lane, no street across a roundabout's lane, a
  // roundabout some street meets, a loop whose ends both reach a drive and whose building is still beside it (a house lot
  // over one is a line drawn across it: a warning)
  { const parks = els.filter(isPark);
    for (const e of els.filter(o => isRing(o) || isLoop(o))) { const isl = islandOf(e), es = shapeOf(e), eb = boxOfPts(isl ? es.concat(isl) : es), inner = isl && grow(isl, -1), by = o => { const b = boxOfPts(shapeOf(o)); return b[0] < eb[2] && b[2] > eb[0] && b[1] < eb[3] && b[3] > eb[1]; };
      for (const o of [...G.near(...eb), ...parks.filter(by)]) { if (o === e) continue; const os = shapeOf(o);
        if (inner && (ISLAND_OFF.includes(o.kind) || isPark(o)) && polysOverlap(inner, os, 0.5)) { issues.push({ id: o.id, level: 'bad', text: name(o) + (o.kind === 'drive' ? ' runs into the island of ' : ' overlaps the island of ') + name(e) }); continue; }
        if (o.kind === 'parking' && polysOverlap(es, os, 0.5)) issues.push({ id: o.id, level: 'bad', text: name(o) + ' is on ' + name(e) }); }
      for (const l of els) if (l.kind === 'lot' && by(l)) { const ls = grow(shapeOf(l), -2); if (polysOverlap(ls, es, 0.5) || inner && polysOverlap(ls, inner, 0.5)) { issues.push({ id: l.id, level: 'warn', text: 'A house lot runs onto ' + name(e) }); break; } }
      const D = [...G.near(eb[0] - 3, eb[1] - 3, eb[2] + 3, eb[3] + 3)].filter(o => o !== e && o.kind === 'drive');
      if (isRing(e)) { const g = ringOf(e); for (const o of D) if (acrossRing(plan, o, g.c, g.R)) issues.push({ id: e.id, level: 'bad', net: true, text: name(o) + ' runs across the lane of ' + name(e) }); } // (the ring's id: a re-fit's repair never drops the street for it; net: a re-fit that lays one there still counts it)
      if (isRing(e) && !D.some(o => gapBetween(shapeOf(o), es) <= 1)) issues.push({ id: e.id, level: 'warn', text: name(e) + ' isn’t on a street: no drive meets it' });
      if (isLoop(e)) { const P = e.path, ends = [P[0], P[P.length - 1]], at = ends.map(p => D.filter(o => inRing(p, shapeOf(o)) || distToPoly(p, shapeOf(o)) <= 2)), lane = grow(es, -1);
        if (!at.every(x => x.length)) issues.push({ id: e.id, level: 'warn', net: true, text: name(e) + ' doesn’t reach a drive at both ends' }); // (net: a re-fit that leaves it hanging counts it, so the one that keeps its drive wins)
        for (const o of D) if (!at.some(x => x.includes(o)) && o.note !== 'Drive-thru lane' && !isLoop(o) && polysOverlap(shapeOf(o), lane, 0.5)) issues.push({ id: e.id, level: 'bad', net: true, text: name(o) + ' runs across the lane of ' + name(e) });
        const b = loopOf(plan, e), mine = els.find(o => o.id === e.loop.of && o.kind === 'building'); if (!b || gapBetween(outline(b), es) > 15) issues.push({ id: e.id, level: 'warn', net: true, text: name(e) + ' isn’t in front of ' + (mine ? name(mine) : 'a building') + ' any more' }); } } } // (its building moved away, or taken off; net: a re-fit that moves it away counts it)
  // easements drawn as no-build areas: nothing built or paved on them ("Bldg 3 is on Easement 1")
  for (const k of els.filter(e => e.kind === 'keepout')) { const kb = boxOfPts(shapeOf(k));
    for (const b of G.near(...kb)) if (KEEP_OFF.includes(b.kind) && rectsOverlap(b, k)) issues.push({ id: b.id, level: 'bad', text: name(b) + ' is on ' + name(k) }); }
  // monument signs: off the paving, the buildings, the amenities and the lots (a sign standing wholly in a median is on
  // its planting, not the drive under it); a median that sticks out of its drive (a bent entrance whose median wasn't
  // drawn again)
  { const meds = els.filter(isMedian).map(m => ({ m, s: shapeOf(m) }));
    for (const g of els.filter(e => e.kind === 'sign')) { const gs = shapeOf(g); if (meds.some(x => gs.every(p => inRing(p, x.s)))) continue;
      for (const b of G.near(...boxOfPts(gs))) if (b !== g && SIGN_HIT.includes(b.kind) && rectsOverlap(g, b)) { issues.push({ id: g.id, level: 'bad', text: name(g) + ' overlaps ' + name(b) }); break; }
      for (const l of els) if (l.kind === 'lot' && rectsOverlap(g, l)) { issues.push({ id: g.id, level: 'bad', text: name(g) + ' overlaps ' + name(l) }); break; } }
    for (const x of meds) { const c = centroid(x.s), d = entrancesOf(els).find(d => inRing(c, shapeOf(d))); if (!d) continue; const ds = shapeOf(d);
      if (!x.s.every(p => inRing(p, ds) || distToPoly(p, ds) <= 2)) issues.push({ id: x.m.id, level: 'warn', text: 'The median sticks out of ' + name(d) }); } }
  issues.push(...entryIssues(plan));
  // the fuel tanks' pad: nothing parked on it, and the fuel truck can get to it from the street
  for (const t of els.filter(e => e.kind === 'tanks')) {
    for (const o of els) if (o.kind === 'parking' && rectsOverlap(o, t)) issues.push({ id: o.id, level: 'bad', text: name(o) + ' is on ' + name(t) + ': the tank pad stays clear for the fuel truck' });
    if (!tankerReach(plan, t)) issues.push({ id: t.id, level: 'warn', text: 'The fuel truck can’t reach ' + name(t) + ': it needs a drive at least 24 ft wide from an entrance, and 60 ft of it straight beside the pad' });
  }
  // where the amenities are: a pool sits beside the clubhouse that runs it, and one pool serves a community of rentals
  const pools = els.filter(e => e.kind === 'pool'), club = els.filter(e => e.kind === 'building' && (e.use === 'amenity' || /club|community|amenity center/i.test(e.name || '')));
  for (const pl of pools) if (!club.some(c => gapBetween(shapeOf(pl), shapeOf(c)) <= 60)) issues.push({ id: pl.id, level: 'warn', text: name(pl) + ' is away from the clubhouse; a pool goes beside the building that runs it (restrooms, equipment, the office)' });
  if (pools.length > 1 && !els.some(e => e.kind === 'building' && ['sfr', 'townhomes', 'duplex'].includes(e.use))) issues.push({ level: 'warn', text: pools.length + ' pools: one clubhouse pool serves a community like this; the others are cost with little use' });
  const m = metrics(plan), z = plan.zoning || {};
  // a drive-thru lane's stacking: the cars that queue behind its order point (a lane the layout drew says; 8 is the usual
  // minimum), and a drive-thru asked for with no lane drawn
  for (const e of els) if (e.kind === 'drive' && e.note === 'Drive-thru lane' && Number.isFinite(e.stack) && e.stack < 8) issues.push({ id: e.id, level: 'warn', text: name(e) + ' stacks ' + e.stack + ' car' + (e.stack === 1 ? '' : 's') + ' behind its order point; 8 is the usual minimum' });
  { const pg = normalizeProgram(plan.program); if ((pg.extras || []).includes('drivethru') && ['retail', 'restaurant'].includes(pg.use) && !pg.zones && els.some(e => e.kind === 'building') && !els.some(e => e.kind === 'drive' && e.note === 'Drive-thru lane')) issues.push({ level: 'warn', text: 'A drive-thru is asked for, but no drive-thru lane is drawn' }); }
  // parking at an entrance's mouth: stalls within 50 ft of the street right beside (or across) a driveway, where cars
  // backing out meet cars turning in from the road
  { const rules0 = edgeRules(ring, plan.front, plan.setbacks, plan.streets), streetEdges = ring.map((a, k) => rules0[k].role === 'front' || rules0[k].street ? [a, ring[(k + 1) % ring.length]] : null).filter(Boolean);
    const toStreet = p => Math.min(...streetEdges.map(([a, b]) => segDist(p, a, b)));
    const mouths = entrancesOf(els).map(d => ({ d, g: grow(shapeOf(d), 10) })).filter(m => streetEdges.length && shapeOf(m.d).some(p => toStreet(p) < 4));
    if (mouths.length) for (const e of els) { if (e.kind !== 'parking' || isFree(e) || !stalls(e).count) continue;
      const c = corners(e), pts = c.concat(c.map((p, i) => [(p[0] + c[(i + 1) % 4][0]) / 2, (p[1] + c[(i + 1) % 4][1]) / 2]), [[e.x, e.y]]);
      const m = mouths.find(m => pts.some(p => toStreet(p) <= 50 && inRing(p, m.g))); if (m) issues.push({ id: e.id, level: 'warn', text: name(e) + ' is at the mouth of ' + (m.d.name || 'an entrance') + ': cars backing out meet cars turning in' }); } }
  // a stall row needs a drive aisle along the side cars pull in from (a row moved away from its aisle, or left facing a
  // lawn): checked a few feet past that side at a quarter, half and three-quarters of its length
  { const pavedEls = els.filter(e => PAVED.includes(e.kind)), shp = new Map(pavedEls.map(e => [e, shapeOf(e)]));
    for (const e of els) { if (e.kind !== 'parking' || !e.row || isFree(e) || e.d > 30) continue;
      const sgn = e.row > 0 ? 1 : -1, probe = f => { const q = rot([(f - 0.5) * e.w, sgn * (e.d / 2 + 8)], e.rot || 0); return [e.x + q[0], e.y + q[1]]; };
      const reached = [0.25, 0.5, 0.75].some(f => { const q = probe(f); return pavedEls.some(o => o !== e && inRing(q, shp.get(o))); });
      if (!reached) issues.push({ id: e.id, level: 'warn', text: name(e) + ' has no aisle to drive in from' }); } }
  for (const d of deadEnds(els)) issues.push({ id: d.e.id, level: 'warn', text: name(d.e) + ' dead-ends with ' + spacesWord(d.stalls) + ' on it: no way through, so cars that find no space back out' });
  if (m.gfa && m.spaces < m.required) issues.push({ level: 'warn', text: 'Parking is ' + spacesWord(m.required - m.spaces) + ' short of ' + m.required.toLocaleString('en-US') + ' required' });
  if (+z.max_coverage_pct && m.coverage * 100 > +z.max_coverage_pct) issues.push({ level: 'bad', text: 'Coverage ' + Math.round(m.coverage * 100) + '% is over the zoning limit of ' + z.max_coverage_pct + '%' });
  if (+z.max_far && m.far > +z.max_far) issues.push({ level: 'bad', text: 'FAR ' + m.far.toFixed(2) + ' is over the zoning limit of ' + z.max_far });
  if (+z.max_building_height_ft && m.heightFt > +z.max_building_height_ft) issues.push({ level: 'warn', text: 'About ' + m.heightFt + ' ft tall; zoning allows ' + z.max_building_height_ft + ' ft' });
  return issues;
}

// can a fuel truck (a tanker about 65 ft long) get to a tank pad: along drives at least 24 ft wide (straight ones, the
// entrances and curved drives) from an entrance, to a straight drive 60 ft or longer within 3 ft of the pad to park on
export function tankerReach(plan, t) {
  const els = plan.elements || [], wide = e => (e.kind === 'drive' || e.kind === 'truck') && e.note !== 'Drive-thru lane' && (isFree(e) ? (e.path ? (e.width || 26) >= 23.5 : true) : Math.min(e.w, e.d) >= 23.5);
  const D = els.filter(wide), G = D.map(e => grow(shapeOf(e), 1.5)), seen = new Set(), st = [];
  D.forEach((e, i) => { if (entrancesOf([e]).length) { seen.add(i); st.push(i); } });
  while (st.length) { const i = st.pop(); D.forEach((f, j) => { if (!seen.has(j) && polysOverlap(G[i], shapeOf(f), 0)) { seen.add(j); st.push(j); } }); }
  const tp = grow(shapeOf(t), 3);
  return D.some((e, i) => seen.has(i) && !isFree(e) && Math.max(e.w, e.d) >= 60 && polysOverlap(tp, shapeOf(e), 0));
}
// a drive-thru lane's pickup window (a bar on the wall beside the lane, its word on the lane's other side) and its order
// point (its word on the lane), from where along the lane the layout put them (windowAt, orderAt: feet along its path)
export function driveThruMarks(els) {
  const out = [];
  for (const e of els) { if (e.kind !== 'drive' || e.note !== 'Drive-thru lane' || !(e.path?.length > 1)) continue;
    const at = t => { let d = 0; for (let i = 0; i + 1 < e.path.length; i++) { const a = e.path[i], b = e.path[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d + L >= t || i + 2 === e.path.length) { const k = L ? Math.min(1, (t - d) / L) : 0, u = L ? [(b[0] - a[0]) / L, (b[1] - a[1]) / L] : [1, 0]; return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], u, n: [-u[1], u[0]] }; } d += L; } return null; };
    if (Number.isFinite(e.windowAt)) { const q = at(e.windowAt); if (q) { const c = [q.p[0] + q.n[0] * 6.5, q.p[1] + q.n[1] * 6.5]; out.push({ line: [[c[0] - q.u[0] * 4, c[1] - q.u[1] * 4], [c[0] + q.u[0] * 4, c[1] + q.u[1] * 4]] }, { t: 'WINDOW', at: [q.p[0] - q.n[0] * 10, q.p[1] - q.n[1] * 10] }); } }
    if (Number.isFinite(e.orderAt)) { const q = at(e.orderAt); if (q) out.push({ line: [[q.p[0] + q.n[0] * 5, q.p[1] + q.n[1] * 5], [q.p[0] + q.n[0] * 7, q.p[1] + q.n[1] * 7]] }, { t: 'ORDER', at: [q.p[0] - q.n[0] * 10, q.p[1] - q.n[1] * 10] }); }
  }
  return out;
}
// drive aisles with an end that goes nowhere: past the last place another drive, entrance or truck court joins it, the
// aisle runs on between stalls and stops at a curb, so a driver who finds no space there backs out or turns in the aisle.
// A few stalls past the last join are ordinary; 10 or more are flagged (min). An end left clear of stalls for 16 ft (a
// hammerhead to turn in) counts as a way out. Stalls in a row that runs on past the aisle's end count too: they have
// no aisle in front of them at all. Each: { e, end, stalls, sgn, u, L, W, tc (last join), rowEnd (where the rows stop) }
export function deadEnds(els, min = 10) {
  const net = els.filter(e => (e.kind === 'drive' && e.note !== 'Drive-thru lane') || e.kind === 'truck' || e.kind === 'field'), shp = new Map(net.map(e => [e, shapeOf(e)])), rows = els.filter(e => e.kind === 'parking' && !isFree(e)), out = []; // (an aisle that runs onto a parking field has a way out there)
  for (const e of net) { if (e.kind !== 'drive' || isFree(e) || e.entry || e.turn || e.bulb || e.through || e.name === 'Main entry') continue;
    const along = e.w >= e.d, L = along ? e.w : e.d, W = along ? e.d : e.w; if (L < 40 || W > 40) continue;
    const u = rot(along ? [1, 0] : [0, 1], e.rot || 0), v = [-u[1], u[0]], at = (t, s) => [e.x + u[0] * t + v[0] * s, e.y + u[1] * t + v[1] * s], tOf = p => (p[0] - e.x) * u[0] + (p[1] - e.y) * u[1], sOf = p => (p[0] - e.x) * v[0] + (p[1] - e.y) * v[1];
    const sh = shapeOf(e), g1 = grow(sh, 1);
    // the rows along it (beside it, parallel): their stretch along the aisle and stall width
    const on = rows.filter(r => rectsOverlap({ poly: grow(shapeOf(r), 2) }, { poly: sh }, 0)).map(r => { const q = shapeOf(r).map(tOf), ss = shapeOf(r).map(sOf); return { r, a: Math.min(...q), b: Math.max(...q), side: Math.min(...ss) > -1 ? 1 : Math.max(...ss) < 1 ? -1 : 0, sw: r.sw || STALL.w }; }).filter(o => o.side && o.b - o.a > 8);
    if (!on.length) continue;
    // where other drives join it (overlap its outline, not just run alongside past its end)
    // (measured along the aisle's line, past its ends too: a connector that curves on out of the aisle carries it on for a while)
    const band = [at(-L / 2 - 80, -(W / 2 - 4)), at(L / 2 + 80, -(W / 2 - 4)), at(L / 2 + 80, W / 2 - 4), at(-L / 2 - 80, W / 2 - 4)];
    const joins = net.filter(o => o !== e && polysOverlap(shp.get(o), g1, 0)).map(o => { const q = clipTo(shp.get(o), band).map(tOf); return q.length ? [Math.min(...q), Math.max(...q)] : null; }).filter(Boolean);
    for (const sgn of [-1, 1]) {
      const end = sgn * L / 2, rowEnd = sgn > 0 ? Math.max(end, ...on.map(o => o.b)) : Math.min(end, ...on.map(o => o.a));
      const tc = joins.length ? (sgn > 0 ? Math.max(...joins.map(j => j[1])) : Math.min(...joins.map(j => j[0]))) : -sgn * L / 2;
      if ((rowEnd - tc) * sgn <= 0) continue; // the network goes on past the last stall
      if ((end - tc) * sgn <= 4 && (rowEnd - end) * sgn <= 1) continue; // joined at its end
      const lo = Math.min(tc, rowEnd), hi = Math.max(tc, rowEnd), past = on.reduce((n, o) => n + Math.max(0, Math.min(o.b, hi) - Math.max(o.a, lo)) / o.sw, 0);
      const hammer = (rowEnd - end) * sgn <= 1 && !on.some(o => Math.min(o.b, Math.max(end, end - sgn * 16)) - Math.max(o.a, Math.min(end, end - sgn * 16)) > 2);
      if (hammer) continue;
      if (Math.floor(past + 0.01) >= min) out.push({ e, end: at(end, 0), stalls: Math.floor(past + 0.01), sgn, u, L, W, tc, rowEnd, on });
    }
  }
  return out;
}
const clipTo = (P, Q) => { try { return polyclip.intersection([P.concat([P[0]])], [Q.concat([Q[0]])]).flatMap(pp => pp[0]); } catch { return P.filter(p => inRing(p, Q)); } };

// an aisle that dead-ends, opened the cheapest way that loses nothing: it runs on (inside the paving setback, clear of
// buildings, stalls, parks and the pond) until it meets a drive within 140 ft, the plain lawn it crosses giving way. Failing that it
// at least reaches the end of its own rows (stalls past an aisle's end can't be got into), and when the plan has the
// spaces to spare the last stalls at the end come out on both sides for a hammerhead to turn in. opts.fixed: ids of
// aisles left as they are (a re-fit's pinned pieces). Returns { elements, opened }.
export function openDeadEnds(plan, els, opts = {}) {
  const ring = plan.ring || []; if (ring.length < 3) return { elements: els, opened: 0 };
  const inner = insetRing(ring, edgeRules(ring, plan.front, plan.setbacks, plan.streets).map(r => Math.max(0.5, r.pave) - 0.5));
  let out = els, opened = 0, spare = opts.spare ?? (() => { const m = metrics({ ...plan, elements: els }); return m.required ? m.spaces - m.required : 0; })();
  for (let pass = 0; pass < 2; pass++) for (const d0 of deadEnds(out, 1)) {
    const e = out.includes(d0.e) ? d0.e : null; if (!e || opts.fixed?.has(e.id)) continue; // (fixed: pieces a re-fit keeps as they are)
    const { sgn, u, L, W } = d0, v = [-u[1], u[0]], at = (t, s2) => [e.x + u[0] * t + v[0] * s2, e.y + u[1] * t + v[1] * s2];
    const quad = (t0, t1, h) => [at(Math.min(t0, t1), -h), at(Math.max(t0, t1), -h), at(Math.max(t0, t1), h), at(Math.min(t0, t1), h)];
    const solid = out.filter(o => o !== e && !['drive', 'truck', 'field', 'lot', 'zone'].includes(o.kind) && !(o.kind === 'green' && !isPark(o))).map(o => ({ s: o.kind === 'building' ? grow(shapeOf(o), 6) : shapeOf(o), row: o.kind === 'parking' })); // (rows beside it may touch; ponds and the rest may not)
    const net = out.filter(o => o !== e && (o.kind === 'drive' && o.note !== 'Drive-thru lane' || o.kind === 'truck')).map(shapeOf);
    const t0 = sgn * L / 2, rowsTo = (d0.rowEnd - t0) * sgn; let got = 0, reach = 0;
    for (let k = 2; k <= 140; k += 2) {
      const t1 = t0 + sgn * k, q = quad(t0, t1, W / 2);
      if (!q.concat([at(t1, 0)]).every(p => inRing(p, inner)) || solid.some(o => polysOverlap(o.row ? quad(t0, t1, W / 2 - 1.5) : q, o.s, o.row ? 0.5 : 0))) break; // (the rows along it: side by side, not over)
      reach = k; if (net.some(o => polysOverlap(quad(t1 - sgn * 4, t1, W / 2 - 3), o, 0))) { got = k; break; }
    }
    let len = got || (rowsTo > 1 ? Math.min(reach, Math.ceil(rowsTo)) : 0), cutRows = [], link = null;
    // 2. a 26 ft drive across the rows' ends to the drive beside it (a loop through both), taking the stalls it crosses
    // off the ends of those rows when the plan can spare them
    if (!got && d0.stalls >= 10) {
      const CW = 26, ts0 = sgn > 0 ? Math.max(t0, d0.rowEnd) : Math.min(t0, d0.rowEnd), ts1 = ts0 + sgn * CW, tA = Math.min(ts0, ts1), tB = Math.max(ts0, ts1);
      const tOf = p => (p[0] - e.x) * u[0] + (p[1] - e.y) * u[1], rowsAll = out.filter(o => o.kind === 'parking' && !isFree(o) && o !== e);
      const hard = out.filter(o => o !== e && !['drive', 'truck', 'field', 'lot', 'zone', 'parking'].includes(o.kind) && !(o.kind === 'green' && !isPark(o))).map(o => o.kind === 'building' ? grow(shapeOf(o), 6) : grow(shapeOf(o), 1)); // (a pond's edge: not even grazed)
      for (const dir of [-1, 1]) {
        let best = null;
        for (let S2 = W / 2 + 20; S2 <= 300; S2 += 4) {
          const q = [at(tA, -dir * (W / 2 - 2)), at(tB, -dir * (W / 2 - 2)), at(tB, dir * S2), at(tA, dir * S2)].map(p => p), qs = grow(q, -1);
          if (!q.every(p => inRing(p, inner)) || hard.some(o => polysOverlap(qs, o, 0.5))) break;
          const hit = out.some(o => o !== e && (o.kind === 'drive' && o.note !== 'Drive-thru lane' || o.kind === 'truck') && polysOverlap([at(tA + 3, dir * (S2 - 4)), at(tB - 3, dir * (S2 - 4)), at(tB - 3, dir * S2), at(tA + 3, dir * S2)], shapeOf(o), 0));
          // rows in the way: cut back from the end facing this end, keeping two stalls or more; a row running on past the drive blocks it
          let lose = 0, cuts = [], ok = true;
          for (const r of rowsAll) { if (!polysOverlap(qs, shapeOf(r), 0.5)) continue; const ts = shapeOf(r).map(tOf), a = Math.min(...ts), b = Math.max(...ts), sw = r.sw || STALL.w;
            const keepTo = sgn > 0 ? tA - 1 : tB + 1, kept = sgn > 0 ? keepTo - a : b - keepTo, past = sgn > 0 ? b - tB : tA - a;
            if (past > 1 || kept < 2 * sw) { ok = false; break; } const n = Math.ceil(((sgn > 0 ? b - keepTo : keepTo - a) - 0.01) / sw); lose += n; cuts.push({ r, n, sw }); }
          if (!ok) break;
          if (hit) { best = { S2, lose, cuts }; break; }
        }
        if (best && best.lose <= spare && (!link || best.lose < link.lose || best.lose === link.lose && best.S2 < link.S2)) link = { ...best, dir, tA, tB };
      }
      if (link) { spare -= link.lose; len = Math.abs((sgn > 0 ? link.tB : link.tA) - t0); }
    }
    if (!got && !link && d0.stalls >= 10) { // boxed in: a hammerhead, if the plan can spare the stalls (2 off each row at the end)
      const tEnd = t0 + sgn * len, ends = d0.on.filter(o => (sgn > 0 ? o.b : -o.a) >= sgn * tEnd - 1), lose = ends.reduce((n, o) => n + 2, 0);
      if (ends.length && spare - lose >= 0) { spare -= lose; cutRows = ends; }
    }
    if (!len && !cutRows.length) continue;
    const grown = len ? { ...e, x: e.x + u[0] * sgn * len / 2, y: e.y + u[1] * sgn * len / 2, ...(e.w >= e.d ? { w: e.w + len } : { d: e.d + len }) } : e;
    let con = null, cut = len ? grow(quad(t0, t0 + sgn * len, W / 2), 3) : null;
    if (link) { const sm = link.dir * (link.S2 - (W / 2 - 2)) / 2 + link.dir * 0, c0 = at((link.tA + link.tB) / 2, link.dir * (link.S2 + (W / 2 - 2)) / 2 - link.dir * (W / 2 - 2)), span = link.S2 + W / 2 - 2;
      con = { kind: 'drive', x: c0[0], y: c0[1], ...(e.w >= e.d ? { w: link.tB - link.tA, d: span } : { w: span, d: link.tB - link.tA }), rot: e.rot || 0, name: '', note: (link.tB - link.tA) + ' ft drive', con: true, id: 'c' + Math.random().toString(36).slice(2, 8) };
      cut = grow([at(link.tA, -link.dir * W / 2), at(link.tB, -link.dir * W / 2), at(link.tB, link.dir * link.S2), at(link.tA, link.dir * link.S2)], 3); }
    const trimEnd = (c) => { const r = c.r, ra = r.w >= r.d ? 'w' : 'd', ax = rot(ra === 'w' ? [1, 0] : [0, 1], r.rot || 0), dir = (ax[0] * u[0] + ax[1] * u[1]) * sgn > 0 ? 1 : -1, k = c.n * c.sw;
      return { ...r, [ra]: r[ra] - k, x: r.x - ax[0] * dir * k / 2, y: r.y - ax[1] * dir * k / 2 }; };
    const shorten = o => { const r = o.r, sw = o.sw, ra = r.w >= r.d ? 'w' : 'd', ax = rot(ra === 'w' ? [1, 0] : [0, 1], r.rot || 0), dir = (ax[0] * u[0] + ax[1] * u[1]) * sgn > 0 ? 1 : -1;
      if (r[ra] - 2 * sw < sw * 2) return []; return [{ ...r, [ra]: r[ra] - 2 * sw, x: r.x - ax[0] * dir * sw, y: r.y - ax[1] * dir * sw }]; };
    out = out.flatMap(o => {
      if (o === e) return con ? [grown, con] : [grown];
      const cr = cutRows.find(c => c.r === o); if (cr) return shorten(cr);
      const lc = link?.cuts.find(c => c.r === o); if (lc) return [trimEnd(lc)];
      if (!cut || o.kind !== 'green' || isPark(o) || !o.poly || !polysOverlap(o.poly, cut, 0)) return [o];
      let left; try { left = polyclip.difference([o.poly.concat([o.poly[0]])], [cut.concat([cut[0]])]); } catch { return [o]; }
      return left.map(pp => pp[0].slice(0, -1)).filter(r => ringArea(r) > 400).map((r, i) => ({ ...o, ...(i ? { id: (o.id || 'g') + 'o' + i } : {}), poly: r }));
    });
    opened++;
  }
  return { elements: out, opened };
}

// ---------- layout generator ----------
// Lays out a site the way a suburban site is usually planned: squared up with the lot's main lines, the building near
// the street with its parking in front (variant 0), behind it (1) or beside it (2), one parking field with at most two
// driveways, a truck court behind a warehouse, and detention in a strip along the back. Works on a grid in a frame
// turned so the street is at the bottom: cells are open to buildings only beyond every setback, and to paving beyond
// the landscape buffer. With no size it uses a typical size for the use and the site; program.max fits as much
// building as its parking allows.
export const VARIANTS = ['Parking in front', 'Building at the street', 'Parking beside'];
// the direction most of the lot's edge length runs along (mod 90°): buildings square up with it
export function mainAngle(ring) {
  const bins = new Float64Array(90), ang = [];
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), t = ((Math.atan2(b[1] - a[1], b[0] - a[0]) / RAD) % 90 + 90) % 90;
    ang.push([t, L]); for (let d = -3; d <= 3; d++) bins[(Math.round(t) + d + 90) % 90] += L * (1 - Math.abs(d) / 4);
  });
  const best = bins.indexOf(Math.max(...bins)); let s = 0, w = 0;
  for (const [t, L] of ang) { let d = t - best; if (d > 45) d -= 90; if (d < -45) d += 90; if (Math.abs(d) <= 4) { s += d * L; w += L; } }
  return ((best + (w ? s / w : 0)) % 90 + 90) % 90;
}
// [floor area ratio, smallest, largest] for a typical project of each use when the request gives no size
const TYPICAL = { retail: [0.2, 6000, 120000], restaurant: [0.06, 2500, 7000], office: [0.25, 10000, 150000], medical: [0.2, 8000, 80000], hotel: [0.3, 40000, 160000], church: [0.12, 8000, 60000], other: [0.2, 5000, 100000] };
export function typicalSize(prog, site) {
  if (prog.use === 'multifamily') return Math.round(Math.min(350, Math.max(8, 22 * site / 43560))) * prog.unitSf / 0.85; // about 22 units an acre
  const [far, lo, hi] = TYPICAL[prog.use] || TYPICAL.other; return Math.round(Math.max(lo, Math.min(hi, far * site)) / 500) * 500;
}

export function autoLayout(plan, programIn, variant = 0) {
  const ring = plan.ring, prog = normalizeProgram(programIn), U = USES[prog.use], site = ringArea(ring), notes = [];
  const front = plan.front != null && plan.front < ring.length ? plan.front : longestEdge(ring), rules = edgeRules(ring, front, plan.setbacks, plan.streets);
  // the frame: the lot's main direction, turned the quarter turn that puts the street side at the bottom
  const n0 = outward(ring, front), a0 = mainAngle(ring); let phi = a0, down = -2;
  for (let k = 0; k < 4; k++) { const s = rot(n0, -(a0 + k * 90)); if (-s[1] > down) { down = -s[1]; phi = a0 + k * 90; } }
  const rr = ring.map(p => rot(p, -phi)), street = rot(n0, -phi);
  const xs = rr.map(p => p[0]), ys = rr.map(p => p[1]), X0 = Math.min(...xs), Y0 = Math.min(...ys);
  const c = Math.max(2, Math.min(12, Math.sqrt(site) / 150)), nx = Math.max(1, Math.ceil((Math.max(...xs) - X0) / c)), ny = Math.max(1, Math.ceil((Math.max(...ys) - Y0) / c));
  const okB = new Uint8Array(nx * ny), okP = new Uint8Array(nx * ny), m = c * Math.SQRT1_2, blocked = (plan.blocked || []).map(b => ({ ...b, w: b.w + 2 * m + 10, d: b.d + 2 * m + 10 }));
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const q = [X0 + (i + .5) * c, Y0 + (j + .5) * c]; if (!inRing(q, rr)) continue;
    if (blocked.length && blocked.some(b => hitRect(b, rot(q, phi)))) continue;
    let b = true, p = true;
    for (let k = 0; k < rr.length && p; k++) { const d = segDist(q, rr[k], rr[(k + 1) % rr.length]); if (d < rules[k].pave + m || d < m) p = false; if (d < rules[k].build + m) b = false; }
    okB[j * nx + i] = b && p; okP[j * nx + i] = p;
  }
  const cellC = (i, j, wi, hj) => [X0 + (i + wi / 2) * c, Y0 + (j + hj / 2) * c];
  const toStreet = p => p[0] * street[0] + p[1] * street[1]; // larger is nearer the street
  const midX = X0 + nx * c / 2, MOD = 2 * STALL.d + STALL.aisle, cells = ft => Math.ceil(ft / c);
  const hitsFront = (o, dir) => { let t = Infinity; for (let k = 0; k < rr.length; k++) { if (rules[k].role !== 'front') continue; const a = rr[k], b = rr[(k + 1) % rr.length], e = [b[0] - a[0], b[1] - a[1]], den = dir[0] * e[1] - dir[1] * e[0]; if (Math.abs(den) < 1e-9) continue;
    const s = ((a[0] - o[0]) * e[1] - (a[1] - o[1]) * e[0]) / den, u = ((a[0] - o[0]) * dir[1] - (a[1] - o[1]) * dir[0]) / den; if (s > -1 && u >= 0 && u <= 1 && s < t) t = s; } return t; };
  const blockedT = (plan.blocked || []).map(b => { const q = rot([b.x, b.y], -phi); return { x: q[0], y: q[1], w: b.w, d: b.d, rot: (b.rot || 0) - phi }; }); // in the turned frame
  const rayRect = (o, dir, r) => { let t0 = -Infinity, t1 = Infinity; for (const [k, lo, hi] of [[0, r.x - r.w / 2, r.x + r.w / 2], [1, r.y - r.d / 2, r.y + r.d / 2]]) {
    if (!dir[k]) { if (o[k] <= lo || o[k] >= hi) return Infinity; continue; } const a = (lo - o[k]) / dir[k], b = (hi - o[k]) / dir[k]; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); } return t1 > t0 && t1 > 0 ? Math.max(t0, 0) : Infinity; };

  function run(F, pondFirst) { // one attempt with a total footprint F (sq ft); elements come back in the turned frame
    const used = new Uint8Array(nx * ny), out = [], warn = [], joins = new Set();
    const sumOf = ok => { const S = new Int32Array((nx + 1) * (ny + 1)); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) S[(j + 1) * (nx + 1) + i + 1] = (ok[j * nx + i] && !used[j * nx + i] ? 0 : 1) + S[j * (nx + 1) + i + 1] + S[(j + 1) * (nx + 1) + i] - S[j * (nx + 1) + i]; return S; };
    const free = (S, i, j, wi, hj) => i >= 0 && j >= 0 && i + wi <= nx && j + hj <= ny && !(S[(j + hj) * (nx + 1) + i + wi] - S[j * (nx + 1) + i + wi] - S[(j + hj) * (nx + 1) + i] + S[j * (nx + 1) + i]);
    const mark = (i, j, wi, hj, pad = 0) => { for (let y = Math.max(0, j - pad); y < Math.min(ny, j + hj + pad); y++) for (let x = Math.max(0, i - pad); x < Math.min(nx, i + wi + pad); x++) used[y * nx + x] = 1; };
    const markRect = e => { const i = Math.floor((e.x - e.w / 2 - X0) / c), j = Math.floor((e.y - e.d / 2 - Y0) / c); mark(i, j, Math.ceil((e.x + e.w / 2 - X0) / c) - i, Math.ceil((e.y + e.d / 2 - Y0) / c) - j); };
    // the best spot for rectangles that move together (a building, its truck court, the parking kept beside it): parts are
    // [ok mask, offset i, offset j, width, height] in cells; the score is taken at the centre of the whole group
    const place = (parts, score, sums) => {
      const S = parts.map(p => sums?.get(p[0]) || sumOf(p[0])), i0 = Math.min(...parts.map(p => p[1])), j0 = Math.min(...parts.map(p => p[2]));
      const gw = Math.max(...parts.map(p => p[1] + p[3])) - i0, gh = Math.max(...parts.map(p => p[2] + p[4])) - j0; let best = null;
      for (let j = -j0; j + j0 + gh <= ny; j++) for (let i = -i0; i + i0 + gw <= nx; i++) {
        if (!parts.every((p, k) => free(S[k], i + p[1], j + p[2], p[3], p[4]))) continue;
        const s = score(cellC(i + i0, j + j0, gw, gh)); if (!best || s < best.s) best = { i, j, s };
      }
      return best;
    };
    const add = (kind, i, j, wi, hj, extra = {}) => { const [x, y] = cellC(i, j, wi, hj); const e = { kind, x, y, w: wi * c, d: hj * c, ...extra, cell: [i, j, wi, hj] }; out.push(e); return e; };
    // a straight 26 ft drive from a lot to the street (or to paving that already reaches it), through the lot's span or alongside it
    const reach = (from, toSt) => {
      let best = null; const X = [from.x - from.w / 2, from.x + from.w / 2], Y = [from.y - from.d / 2, from.y + from.d / 2];
      for (const dir of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const h = dir[0] !== 0, span = h ? Y : X, mid = (span[0] + span[1]) / 2, half = (span[1] - span[0]) / 2, sg = dir[0] || dir[1];
        const face = h ? (sg < 0 ? X[0] : X[1]) : (sg < 0 ? Y[0] : Y[1]), back = h ? (sg < 0 ? X[1] : X[0]) : (sg < 0 ? Y[1] : Y[0]);
        const opts = (half >= DRIVE_W / 2 ? [-1, 0, 1].map(f => [mid + f * (half - DRIVE_W / 2), face, 0]) : []).concat([-1, 1].map(f => [mid + f * (half + DRIVE_W / 2 + 0.5), back, 40]));
        for (const [off, start, pen] of opts) {
          const o = h ? [face, off] : [off, face], ts = toSt ? hitsFront(o, dir) : Infinity, tj = Math.min(...[...joins].filter(j => j !== from).map(j => rayRect(o, dir, j)));
          const t = Math.min(ts, tj); if (!(t < 3000)) continue;
          const end = face + sg * (Math.max(t, 0) + (t === ts ? 1 : 0)), lo = Math.min(start, end), hi = Math.max(start, end);
          const dr = h ? { x: (lo + hi) / 2, y: off, w: hi - lo, d: DRIVE_W } : { x: off, y: (lo + hi) / 2, w: DRIVE_W, d: hi - lo };
          let inside = true; // both long sides stay on the lot, clear of the landscape buffer, until the street edge
          for (let a = start, last = false; inside && !last; a += sg * 12) {
            if ((end - a) * sg <= 12) { a = end - sg * 12; last = true; }
            for (const s of [-1, 1]) { const q = h ? [a, off + s * DRIVE_W / 2] : [off + s * DRIVE_W / 2, a];
              if (!inRing(q, rr) || rr.some((p, k) => rules[k].role !== 'front' && segDist(q, p, rr[(k + 1) % rr.length]) < rules[k].pave - 0.5)) { inside = false; break; } }
          }
          if (!inside || out.some(b => (b.kind === 'building' || b.kind === 'pond') && rectsOverlap(b, dr, 1)) || blockedT.some(b => rectsOverlap(b, dr, 1))) continue;
          // driveways cost more than joining paving already on the lot
          const cost = hi - lo + pen + (t === ts ? 60 : 0);
          if (!best || cost < best.cost) best = { cost, dr, street: t === ts };
        }
      }
      return best;
    };
    const lane = (lot, toSt) => { const from = lot, r = reach(lot, toSt); if (r) { const e = { kind: 'drive', ...r.dr, ...(r.street ? { street: from === truck ? 'truck' : 'car' } : {}) }; out.push(e); markRect(e); joins.add(e); joins.add(lot); } return r; };
    // detention: a share of the land the project covers (buildings, parking, truck court), not of the whole lot
    const pct = prog.detentionPct ?? (site >= 43560 ? 10 : 0), built0 = F + required(prog, F * prog.floors) * 350 + (prog.truck ? Math.sqrt(F) * (U.truck || 130) : 0);
    const A = site * pct / 100 * Math.min(1, 1.3 * built0 / site), tight = 1.3 * built0 > 0.6 * site;
    let pond = null;
    const placePond = near => { // a strip along the back of the lot, or behind the buildings on a roomy lot
      if (!(pct > 0)) return;
      for (let shrink = 1; shrink >= 0.5 && !pond; shrink -= 0.1) for (const r of [8, 5, 3.5, 2.5, 1.6, 1]) {
        const h = Math.sqrt(A * shrink / r), w = A * shrink / h; if (h < 25 && r > 1) continue;
        const at = place([[okP, 0, 0, cells(w), cells(h)]], near ? p => Math.hypot(p[0] - near[0], p[1] - near[1]) + (toStreet(p) > toStreet(near) ? 300 : 0) : p => toStreet(p) + Math.abs(p[0] - midX) * 0.01);
        if (at) { pond = add('pond', at.i, at.j, cells(w), cells(h)); if (shrink < 1) warn.push('detention is ' + Math.round(shrink * 100) + '% of what was asked'); break; }
      }
      if (pond) mark(...pond.cell, cells(10)); else warn.push('no room left for detention');
    };
    if (pondFirst && tight) placePond();

    // buildings: the first with its truck court and the parking kept next to it, as near the street as that allows
    const n = prog.buildings || (prog.use === 'multifamily' ? Math.min(12, Math.max(1, Math.ceil(F / (prog.depth * 300)))) : 1), each = F / n, bl = [];
    const wantD = Math.min(prog.depth, Math.sqrt(each) * 1.6), need = required(prog, F * prog.floors), lc = cells(DRIVE_W + 2);
    let truck = null, reserve = null;
    for (let b = 0; b < n; b++) {
      let got = null; const sums = new Map([[okB, sumOf(okB)], [okP, sumOf(okP)]]);
      for (const k of [1, 0.85, 1.2, 0.7, 1.45, 0.55, 1.8, 0.45]) {
        const D = wantD * k, W = each / D; if (W < 20 || D < 20) continue;
        const wi = cells(W), hj = cells(D);
        for (const o of b ? [{ parts: [[okB, 0, 0, wi, hj]] }] : blockOptions(wi, hj)) {
          const b0 = bl[0], score = b ? p => Math.hypot(p[0] - b0.x, (p[1] - b0.y) * 1.5) - toStreet(p) * 0.2 : p => -toStreet(p) + Math.abs(p[0] - midX) * 0.35;
          const at = place(o.parts, score, sums); if (!at) continue;
          got = add('building', at.i, at.j, wi, hj, { floors: prog.floors }); got.w = each / got.d; // exact floor area, centred in its cells
          if (o.truck) truck = add('truck', at.i + o.truck[1], at.j + o.truck[2], o.truck[3], o.truck[4]);
          if (o.res) reserve = { i: at.i + o.res[1], j: at.j + o.res[2], wi: o.res[3], hj: o.res[4] };
          if (prog.truck && !b && !o.truck) warn.push('no room for a truck court behind the building');
          break;
        }
        if (got) break;
      }
      if (!got) return null;
      bl.push(got); mark(...got.cell, cells(30)); if (truck && !b) mark(...truck.cell, cells(30));
    }
    function blockOptions(wi, hj) { // richest first: full parking kept beside the building, then half, then none
      const W = wi * c, D = hj * c, opts = [], frontMods = Math.max(1, Math.min(4, Math.ceil(need / (2 * Math.max(1, Math.floor(W / STALL.w))))));
      const beside = Math.min(4 * W, Math.ceil(need / (2 * Math.max(1, Math.floor(D / MOD)))) * STALL.w + 4);
      for (const T of prog.truck ? [U.truck || 130, 110, 90, 60, 0] : [0]) for (const side of [-1, 1]) for (const f of [1, 0.5, 0]) {
        const tc = cells(T), parts = [[okB, 0, 0, wi, hj]], tr = T ? [okP, 0, hj, wi, tc] : null;
        if (tr) parts.push(tr, [okP, side < 0 ? -lc : wi, 0, lc, hj + tc]); // a lane beside the building so trucks get round
        let res = null;
        if (f && variant === 0) { const pj = cells(Math.round(frontMods * f) * MOD || MOD); res = [okP, 0, -pj, wi, pj]; }
        if (f && variant === 1) { const pj = cells(Math.round(frontMods * f) * MOD || MOD); res = [okP, 0, hj + tc, wi, pj]; if (!tr) parts.push([okP, side < 0 ? -lc : wi, 0, lc, hj]); }
        if (f && variant === 2) { const pw = cells(beside * f); res = [okP, side < 0 ? -pw - (tr && side < 0 ? lc : 0) : wi + (tr && side > 0 ? lc : 0), 0, pw, hj]; }
        if (res) parts.push(res);
        if (!f && opts.some(o => !o.res && o.truck === tr && o.parts.length === parts.length)) continue;
        opts.push({ parts, truck: tr, res });
      }
      return opts;
    }
    used.fill(0); for (const b of bl) mark(...b.cell, cells(10)); // then a 10 ft walk around each for the paving
    if (truck) mark(...truck.cell);
    if (pondFirst && !tight) { if (reserve) mark(reserve.i, reserve.j, reserve.wi, reserve.hj); placePond([bl.reduce((s, e) => s + e.x, 0) / bl.length, bl.reduce((s, e) => s + e.y, 0) / bl.length]); used.fill(0); for (const b of bl) mark(...b.cell, cells(10)); if (truck) mark(...truck.cell); }
    if (pond) mark(...pond.cell, cells(10));
    if (truck) { if (!lane(truck, true)) warn.push('the truck court has no straight drive to the street; add one by hand'); }
    const gfa = bl.reduce((s, e) => s + e.w * e.d * prog.floors, 0), needAll = required(prog, gfa) + adaLoss(required(prog, gfa) + 8); // striped stalls, with the accessible aisles' share
    const bc = [bl.reduce((s, e) => s + e.x, 0) / bl.length, bl.reduce((s, e) => s + e.y, 0) / bl.length];

    // parking modules: the strip that adds the most stalls, in the space kept for parking and touching the field, until enough
    let have = 0; const lots = [];
    const overlap = (i, j, wi, hj, r) => r ? Math.max(0, Math.min(i + wi, r.i + r.wi) - Math.max(i, r.i)) * Math.max(0, Math.min(j + hj, r.j + r.hj) - Math.max(j, r.j)) / (wi * hj) : 0;
    const touching = (i, j, wi, hj) => lots.concat(bl).some(o => { const [a, b, w, h] = o.cell, pad = o.kind === 'building' ? cells(10) + 1 : 1; return i < a + w + pad && a - pad < i + wi && j < b + h + pad && b - pad < j + hj; });
    for (let guard = 0; guard < 60 && have < needAll; guard++) {
      let best = null; const S = sumOf(okP);
      for (const [D, rows] of [[MOD, 2], [STALL.d + STALL.aisle, 1]]) {
        const hj = cells(D);
        for (let j = 0; j + hj <= ny; j++) {
          let i = 0;
          while (i < nx) {
            if (!free(S, i, j, 1, hj)) { i++; continue; }
            let k = i; while (k < nx && free(S, k, j, 1, hj)) k++;
            let wi = k - i, i0 = i, per = Math.floor(wi * c / STALL.w) * rows;
            if (per >= 4) {
              const left = needAll - have; if (per > left * 1.1 + rows) { // trim to what's still needed, nearest the buildings
                wi = Math.min(wi, cells(Math.ceil(left / rows) * STALL.w)); per = Math.floor(wi * c / STALL.w) * rows;
                const target = reserve ? reserve.i + reserve.wi / 2 : (bc[0] - X0) / c;
                i0 = Math.max(i, Math.min(k - wi, Math.round(target - wi / 2)));
              }
              const p = cellC(i0, j, wi, hj), dist = Math.hypot(p[0] - bc[0], p[1] - bc[1]);
              const s = Math.min(per, needAll - have) * 10 + per * 0.5 - dist / 20 - (rows === 1 ? 8 : 0) + overlap(i0, j, wi, hj, reserve) * 60 + (touching(i0, j, wi, hj) ? 25 : 0);
              if (!best || s > best.s) best = { s, i: i0, j, wi, hj };
            }
            i = k;
          }
        }
      }
      if (!best) break;
      const e = add('parking', best.i, best.j, best.wi, best.hj, { islands: true }); mark(...e.cell); lots.push(e); have += stalls(e).count;
    }
    if (!pondFirst) placePond();
    // drives: the lot nearest the street gets a driveway; the rest join the field, with at most two driveways in all
    const touches = (a, b) => rectsOverlap({ ...a, w: a.w + 2, d: a.d + 2 }, b, 0);
    const spread = l => { if (joins.has(l)) return; joins.add(l); lots.filter(o => touches(o, l)).forEach(spread); };
    let driveways = 0;
    for (const lot of lots.slice().sort((a, b) => toStreet([b.x, b.y]) - toStreet([a.x, a.y]))) {
      if (joins.has(lot) || [...joins].some(d => touches(d, lot))) { spread(lot); continue; }
      const r = lane(lot, driveways < 2); if (r?.street) driveways++;
      if (r) spread(lot); else warn.push('a parking area has no straight drive to the street; add one by hand');
    }
    return { out, gfa, need: needAll, have, warn, truck: !!truck };
  }

  let max = prog.max || (prog.gfa == null && prog.use === 'industrial'), res = null;
  const go = F => run(F, true) || run(F, false);
  if (!max) {
    const want = prog.gfa ?? typicalSize(prog, site);
    res = go(want / prog.floors);
    if (!res) { notes.push(Math.round(want).toLocaleString('en-US') + ' sq ft doesn’t fit inside the setbacks; showing the largest that does.'); max = true; }
    else if (prog.gfa == null) prog.gfa = Math.round(res.gfa);
  }
  if (max) { // as much building as fits with its parking: binary search on the footprint
    let lo = 1000, hi = Math.max(1000, site * 0.7), best = null;
    for (let it = 0; it < 12 && hi - lo > Math.max(300, lo * 0.02); it++) {
      const F = (lo + hi) / 2, r = go(F);
      if (r && r.have >= r.need && (r.truck || !prog.truck)) { best = r; lo = F; } else hi = F; // a warehouse keeps its truck court
    }
    res = best || go(lo);
  }
  if (!res) return { elements: [], notes: ['Nothing fits inside the setbacks on this lot.'], phi };
  res.warn.forEach(w => notes.push(w[0].toUpperCase() + w.slice(1) + '.'));
  let k = 0;
  // the driveways from the street: the first one for cars is the main entry (the network is reached from it), the rest Entrance 2…
  const ways = res.out.filter(e => e.street).sort((a, b) => (a.street === 'truck') - (b.street === 'truck')), wayName = new Map(ways.map((e, i) => [e, i ? 'Entrance ' + (i + 1) : 'Main entry']));
  const elements = res.out.map(e => { const [x, y] = rot([e.x, e.y], phi); return { id: 'e' + (++k).toString(36) + Math.random().toString(36).slice(2, 6), kind: e.kind, ...(wayName.has(e) ? { name: wayName.get(e), note: DRIVE_W + ' ft driveway' } : {}), ...(e.islands ? { islands: true } : {}), x: +x.toFixed(2), y: +y.toFixed(2), d: +e.d.toFixed(2), w: e.kind === 'building' ? +(e.w * e.d / +e.d.toFixed(2)).toFixed(4) : +e.w.toFixed(2), rot: +(((phi % 360) + 360) % 360).toFixed(3), ...(e.floors ? { floors: e.floors } : {}) }; });
  // the shortfall as the plan's header counts it (spaces provided against required, accessible stalls taken out)
  const short = (m => m.gfa ? m.required - m.spaces : 0)(metrics({ ring, elements, program: prog }));
  if (short > 0) notes.unshift('Parking is ' + spacesWord(short) + ' short; consider structured parking, a lower ratio or less building.');
  return { elements, notes, phi, program: prog };
}

// A last resort for a small lot, when no parking could be placed: a surface apron of stalls between the building and
// the street edge, with one 26 ft drive from the street edge up the middle of it. Rows run along the street; modules
// (stall, aisle, stall) stack back from the street on both sides of the drive until the program is parked or the land
// runs out. `els` are the pieces already on the plan (they stay clear). Returns { elements, note } with only the new
// pieces (the drive is named Main entry), or null when not even a few stalls fit.
export function streetApron(plan, els, programIn) {
  const ring = plan.ring, prog = normalizeProgram(programIn || plan.program), id = () => 'a' + Math.random().toString(36).slice(2, 8);
  const f = plan.front != null && plan.front < ring.length ? plan.front : longestEdge(ring), rules = edgeRules(ring, f, plan.setbacks, plan.streets), L = edgeLen(ring, f);
  if (!(L > 40)) return null;
  const a = ring[f], b = ring[(f + 1) % ring.length], t = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], o = outward(ring, f), sg = signedArea(ring) >= 0 ? -1 : 1, u = [o[0] * sg, o[1] * sg]; // u: into the lot
  const W = (x, y) => [a[0] + t[0] * x + u[0] * y, a[1] + t[1] * x + u[1] * y], deg = Math.atan2(t[1], t[0]) / RAD;
  const xs = ring.map(p => (p[0] - a[0]) * t[0] + (p[1] - a[1]) * t[1]), ys = ring.map(p => (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1]), X0 = Math.min(...xs), X1 = Math.max(...xs), Y1 = Math.max(...ys);
  const rect = (kind, x0, x1, y0, y1, extra = {}) => { const c = W((x0 + x1) / 2, (y0 + y1) / 2); return { id: id(), kind, x: +c[0].toFixed(2), y: +c[1].toFixed(2), w: +(x1 - x0).toFixed(2), d: +(y1 - y0).toFixed(2), rot: +(((deg % 360) + 360) % 360).toFixed(3), ...extra }; };
  const solid = (els || []).filter(e => e.kind !== 'lot' && e.kind !== 'green' && e.kind !== 'trail' && e.kind !== 'fence').map(e => ({ e, pad: e.kind === 'building' || e.kind === 'garage' ? 10 : e.kind === 'drive' || e.kind === 'parking' || e.kind === 'truck' || e.kind === 'field' || e.kind === 'patio' ? 1 : 4 }));
  const mine = [], clear = (r, drive) => (drive ? solid : solid.concat(mine.map(e => ({ e, pad: 0 })))).every(({ e, pad }) => !rectsOverlap(pad ? { ...e, w: e.w + 2 * pad, d: e.d + 2 * pad } : e, r, 0.3));
  // does a piece fit: inside the lot, clear of every edge's landscape buffer (a drive may cross the street edges) and of the other pieces
  const fits = (r, drive) => {
    const c = corners(r); if (!c.every((p, i) => inRing(p, ring) || drive && distToPoly(p, ring) < 2.5 && rules[nearestEdge(ring, p)].role === 'front')) return false;
    for (let k = 0; k < ring.length; k++) { if (drive && (rules[k].role === 'front' || rules[k].street)) continue; if (rectDist(c, ring[k], ring[(k + 1) % ring.length]) < rules[k].pave - 0.5) return false; }
    return clear(r, drive);
  };
  const SW = STALL.w, pb = Math.max(0, rules[f].pave), count = r => stalls(r).count;
  const block = (x0, x1, y0, D) => rect('parking', x0, x1, y0, y0 + D, { islands: true, lock: true });
  const driveTo = (xd, y1) => rect('drive', xd - 13, xd + 13, -1.5, Math.max(y1, pb + 1), { name: 'Main entry', note: '26 ft driveway', entry: true });
  // the stalls either side of a drive at xd for a band y0..y0+D: the widest open piece up to the drive on each side
  const sides = (xd, y0, D) => {
    const made = [];
    for (const side of [-1, 1]) {
      let lo = side < 0 ? X0 : xd + 13, hi = side < 0 ? xd - 13 : X1, r = null;
      for (let k = 0; k < 90 && hi - lo >= 2 * SW; k++) { const cand = block(lo, hi, y0, D); if (fits(cand)) { r = cand; break; } if (side < 0) lo += 3; else hi -= 3; }
      if (r && count(r) > 0) made.push(r);
    }
    return made;
  };
  // the first band from the street (one a drive can reach in a straight line) that holds a worthwhile number of stalls, the double module (60 ft) or the single one (42 ft)
  let m1 = null;
  for (let y0 = pb; y0 + 42 <= Y1 && !m1; y0 += 4) for (const D of [60, 42]) for (let xd = X0 + 13 + SW; xd <= X1 - 13 - SW; xd += 6) {
    if (!fits(driveTo(xd, y0 + 1), true)) continue;
    const made = sides(xd, y0, D), n = made.reduce((q, r) => q + count(r), 0);
    if (n >= 6 && (!m1 || n > m1.n)) m1 = { y0, D, xd, n, made };
  }
  if (!m1) return null;
  const mine0 = m1.made, need = () => { const m = metrics({ ...plan, elements: [...els, ...mine], program: prog }); return m.required - m.spaces; };
  mine.push(...mine0); let y0 = m1.y0 + m1.D, last = m1.y0;
  // more modules stacked back from the first on the same drive while stalls are still needed
  for (let k = 0; k < 3 && need() > 0; k++) {
    let got = null;
    for (const D of [60, 42]) { const made = sides(m1.xd, y0, D), n = made.reduce((q, r) => q + count(r), 0); if (n && (!got || n > got.n)) got = { made, n, D }; }
    if (!got) break;
    mine.push(...got.made); last = y0; y0 += got.D;
  }
  const drive = driveTo(m1.xd, last + 4);
  if (!fits(drive, true)) return null;
  if (!mine.length) return null;
  const n = mine.reduce((s, r) => s + count(r), 0);
  return { elements: [drive, ...mine], note: 'Parking is one simple surface apron with a single drive in from the street (' + spacesWord(n) + ').' };
}

// ---------- map features ----------
// what a piece is called and how big it is, for labels on the map, the PDF and the DXF
export function labelOf(e, prog) {
  const P = normalizeProgram(prog), use = USES[e.use] ? e.use : P.use, gfa = Math.round(gfaOfEl(e));
  if (e.kind === 'building' && use === 'sfr') return { name: e.name || '', what: e.note || '', size: '' }; // a home: its lot number and type are enough
  if (e.kind === 'building' && use === 'storage') { const q = storageOf([{ ...e, use }], P); return { name: e.name || '', what: e.note || USES.storage.label, size: (q.units ? '~' + q.units.toLocaleString('en-US') + ' units · ' : '') + gfa.toLocaleString('en-US') + ' sf' + ((e.floors || 1) > 1 ? ' · ' + e.floors + ' fl' : '') }; }
  if (e.kind === 'building' && use === 'foodtrucks') { const k = ftKind(e); return { name: e.name || '', what: e.note || '', size: (k === 'pavilion' && gfa ? '~' + Math.floor(gfa / FOODTRUCK.seatSf) + ' seats · ' : '') + gfa.toLocaleString('en-US') + ' sf' }; }
  if (e.kind === 'building') {
    const n = e.units ?? (use === 'multifamily' ? Math.floor(gfa * (P.eff || 0.85) / P.unitSf) : null);
    return { name: e.name || '', what: e.note || (e.name ? USES[use].label : ''), size: (n > 1 && use !== 'amenity' ? n + ' units · ' : '') + gfa.toLocaleString('en-US') + ' sf' + ((e.floors || 1) > 1 ? ' · ' + e.floors + ' fl' : '') };
  }
  if (isRing(e)) return { name: e.name || 'Roundabout', what: '', size: Math.round(2 * ringOf(e).R) + ' ft across' };
  if (isLoop(e)) return { name: e.name || 'Drop-off loop', what: 'One way', size: '' };
  if (e.kind === 'parking') return { name: '', what: '', size: stalls(e).count + (e.rv ? ' ' + (e.site ? e.site.replace(/^[A-Z](?=[a-z])/, c => c.toLowerCase()) + 's' : 'RV / boat') : e.vac ? ' air / vacuum' : ' spaces') };
  if (e.kind === 'canopy') return { name: e.name || 'Fuel canopy', what: (e.pumps || 0) + ' pumps · ' + 2 * (e.pumps || 0) + ' fueling positions', size: Math.round(elArea(e)).toLocaleString('en-US') + ' sf' };
  if (e.kind === 'tanks') return { name: e.name || 'Fuel tanks', what: 'Underground · keep clear', size: '' };
  if (e.kind === 'pond') return { name: e.name || '', what: '', size: (elArea(e) / 43560).toFixed(2) + ' ac' };
  if (e.kind === 'trash') return { name: e.name || 'Trash', what: '', size: '' };
  if (e.kind === 'foodtruck') return { name: e.name || 'Truck', what: '', size: '' };
  if (e.kind === 'garage') return { name: e.name || 'Parking garage', what: '', size: garageStalls(e) + ' spaces · ' + (e.levels || 4) + ' levels' };
  if (e.kind === 'patio') return { name: e.name || 'Patio', what: '', size: '' };
  if (e.kind === 'play') return { name: e.name || 'Playground', what: '', size: '' };
  if (e.kind === 'sign') return { name: P.community || e.name || 'Monument sign', what: P.community ? 'Monument sign' : '', size: '' }; // (the community's name on it)
  if (['court', 'pool', 'play', 'plaza', 'green'].includes(e.kind) && e.name) return { name: e.name, what: e.note || '', size: '' };
  return { name: e.name || '', what: '', size: '' };
}

// all the paving as one surface: drives, parking and truck courts that touch or overlap merge into one outline (and
// any holes), the way the asphalt is poured, so the curb is drawn once round the outside and there are no seams where
// pieces meet. An exact union (lib/vendor/polyclip.mjs; each piece first pushed out 0.3 ft so pieces that touch, or nearly (a 0.5 ft gap left by
// rounding), fuse), then the curb's corners rounded: a small radius where paving ends (a row's end), a larger one where one piece
// runs into another (an aisle into a drive, the entry into an aisle), so the asphalt reads as one smooth surface.
// Returns [{ outer, holes }] in plan feet, largest first. The last answer is kept: dragging a building doesn't redo it.
export const PAVED = ['drive', 'parking', 'truck', 'field'];
// ---------- parking field paving ----------
// The paving a lot really has between its rows and aisles: the gaps (a row shorter than its neighbour, the end of an
// aisle, the wedge where angled rows meet straight ones) are paved too, as on any civil sheet. fieldsOf closes those
// gaps: everything paved (rows, drives, truck courts), grown `reach` feet and shrunk back (a closing on a `cell` ft
// grid), kept inside the lot and off the `avoid` pieces (buildings, ponds, easements), and returned as the outline ring
// of each paved area of `minSf` or more (holes paved over). A `field` piece on each (lib/siteparking.mjs lays one under
// every parking field it draws) is paving once: metrics() counts a field less the rows and aisles already counted on it.
export function fieldsOf(els, ring, { reach = 16, cell = 2, avoid = [], minSf = 2000 } = {}) {
  const shapes = (els || []).filter(e => PAVED.includes(e.kind) && e.kind !== 'field' && !e.island).map(shapeOf).filter(s => s.length >= 3);
  if (!shapes.length || !(ring?.length >= 3)) return [];
  const pad = reach + 2 * cell, all = shapes.flat(), X0 = Math.min(...all.map(p => p[0])) - pad, Y0 = Math.min(...all.map(p => p[1])) - pad;
  const nx = Math.ceil((Math.max(...all.map(p => p[0])) + pad - X0) / cell), ny = Math.ceil((Math.max(...all.map(p => p[1])) + pad - Y0) / cell);
  if (nx < 2 || ny < 2 || nx * ny > 6e6) return [];
  const at = (i, j) => [X0 + (i + 0.5) * cell, Y0 + (j + 0.5) * cell];
  const stamp = (s, v, g) => { const bx = s.map(p => p[0]), by = s.map(p => p[1]), i0 = Math.max(0, Math.floor((Math.min(...bx) - X0) / cell)), i1 = Math.min(nx - 1, Math.ceil((Math.max(...bx) - X0) / cell)), j0 = Math.max(0, Math.floor((Math.min(...by) - Y0) / cell)), j1 = Math.min(ny - 1, Math.ceil((Math.max(...by) - Y0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (inRing(at(i, j), s)) g[j * nx + i] = v; };
  let g = new Uint8Array(nx * ny); for (const s of shapes) stamp(s, 1, g);
  const r = Math.max(1, Math.round(reach / cell)), disk = []; for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (di * di + dj * dj <= r * r) disk.push([di, dj]);
  const dilate = src => { const out = src.slice(); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (!src[k]) continue;
    if (i > 0 && src[k - 1] && i < nx - 1 && src[k + 1] && j > 0 && src[k - nx] && j < ny - 1 && src[k + nx]) continue; // inside: nothing new to reach
    for (const [di, dj] of disk) { const x = i + di, y = j + dj; if (x >= 0 && x < nx && y >= 0 && y < ny) out[y * nx + x] = 1; } } return out; };
  const flip = src => src.map(v => v ? 0 : 1);
  g = flip(dilate(flip(dilate(g)))); // closing: grow, then shrink back
  const corner = (i, j) => [X0 + i * cell, Y0 + j * cell];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (g[j * nx + i] && !(inRing(corner(i, j), ring) && inRing(corner(i + 1, j), ring) && inRing(corner(i, j + 1), ring) && inRing(corner(i + 1, j + 1), ring))) g[j * nx + i] = 0; // whole cells inside the lot
  for (const e of avoid) { const s = shapeOf(e); if (s.length >= 3) stamp(grow(s, cell), 0, g); } // a cell clear of the piece, so the paving never touches it
  // each paved area (4-connected) of minSf or more: its outside ring, cell edges chained with the paving on the left
  const seen = new Uint8Array(nx * ny), out = [];
  for (let k0 = 0; k0 < nx * ny; k0++) { if (!g[k0] || seen[k0]) continue;
    const comp = [], stack = [k0]; seen[k0] = 1;
    while (stack.length) { const k = stack.pop(); comp.push(k); const i = k % nx, j = (k - i) / nx; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = i + di, y = j + dj; if (x < 0 || x >= nx || y < 0 || y >= ny) continue; const q = y * nx + x; if (g[q] && !seen[q]) { seen[q] = 1; stack.push(q); } } }
    if (comp.length * cell * cell < minSf) continue;
    const inC = new Set(comp), edges = new Map(), key = (x, y) => x + ',' + y;
    for (const k of comp) { const i = k % nx, j = (k - i) / nx, x0 = i, y0 = j, x1 = i + 1, y1 = j + 1;
      if (!inC.has(k - nx) || j === 0) edges.set(key(x0, y0), [x1, y0]); if (!inC.has(k + 1) || i === nx - 1) edges.set(key(x1, y0), [x1, y1]);
      if (!inC.has(k + nx) || j === ny - 1) edges.set(key(x1, y1), [x0, y1]); if (!inC.has(k - 1) || i === 0) edges.set(key(x0, y1), [x0, y0]); }
    let best = null;
    while (edges.size) { const [k1, first] = edges.entries().next().value, start = k1.split(',').map(Number), loop = [start], most = edges.size + 2; let cur = first; edges.delete(k1);
      while (cur && key(cur[0], cur[1]) !== k1 && loop.length < most) { loop.push(cur); const nk = key(cur[0], cur[1]), nxt = edges.get(nk); edges.delete(nk); cur = nxt; }
      const pts = loop.map(([x, y]) => [X0 + x * cell, Y0 + y * cell]), a = signedArea(pts); if (a > 0 && (!best || a > best.a)) best = { a, pts }; }
    if (!best) continue;
    // the ring, simplified, then cut exactly to the lot and off the avoided pieces (the grid's steps can lean a foot over a line)
    let rr = tidyRing(best.pts, cell * 0.8);
    try { const cl = r => r.concat([r[0]]), ccw = r => signedArea(r) >= 0 ? r : r.slice().reverse(), biggest = mp => mp.map(pg => pg[0].slice(0, -1)).filter(r => r.length >= 3).sort((a, b) => ringArea(b) - ringArea(a))[0];
      let mp = polyclip.intersection([cl(ccw(rr))], [cl(ccw(grow(ring, -0.25)))]); // (a quarter foot inside the line, so rounding never puts it over) const av = avoid.map(shapeOf).filter(q => q.length >= 3).map(q => [cl(ccw(grow(q, 0.5)))]); if (av.length && mp.length) mp = polyclip.difference(mp, ...av);
      const b = biggest(mp); if (b) rr = tidyRing(b, 0.05); } catch (e) { /* the grid's ring will do */ }
    rr = rr.map(p => [+p[0].toFixed(1), +p[1].toFixed(1)]); if (rr.length >= 3 && ringArea(rr) >= minSf) out.push(rr); }
  return out;
}
// a field piece from a ring: a free-form paving piece with its label point and box, like areaPiece makes them
export function fieldPiece(ring, id, extra = {}) {
  const P = signedArea(ring) < 0 ? ring.slice().reverse() : ring.slice(), c = centroid(P), xs = P.map(p => p[0]), ys = P.map(p => p[1]);
  return { id, kind: 'field', poly: P.map(p => p.map(v => +v.toFixed(2))), x: +c[0].toFixed(2), y: +c[1].toFixed(2), w: +(Math.max(...xs) - Math.min(...xs)).toFixed(2), d: +(Math.max(...ys) - Math.min(...ys)).toFixed(2), rot: 0, name: '', note: 'Parking field paving: the lot\u2019s paving under and between its rows and aisles', ...extra };
}
// the paving the plan's field pieces add: each field's area less what already stands on it (rows, aisles, truck courts,
// plazas, food truck pads, canopies, tanks, a building, a pond), so paving is never counted twice. metrics() runs this
// for every layout the engine tries, so it is a point test, not a polygon union: a piece wholly on the field counts in
// full, one wholly off it not at all, one across the edge by the share of its outline points that are on it. Pieces that
// overlap each other on the field are each taken off, so the figure runs a few percent low where aisles cross; close enough
// for impervious cover, and a hundred times cheaper than the exact polygon arithmetic.
export function fieldPaving(els) {
  const fields = (els || []).filter(e => e.kind === 'field'); if (!fields.length) return 0;
  const under = els.filter(e => e.kind !== 'field' && !['green', 'trail', 'lot', 'fence', 'sign', 'zone'].includes(e.kind) && !e.island).map(e => { const s = shapeOf(e); return s.length >= 3 ? { s, a: ringArea(s), c: centroid(s), b: boxOfPts(s) } : null; }).filter(Boolean);
  let tot = 0;
  for (const f of fields) { const F = shapeOf(f), fb = boxOfPts(F); let on = 0;
    for (const u of under) { if (u.b[2] < fb[0] || u.b[0] > fb[2] || u.b[3] < fb[1] || u.b[1] > fb[3]) continue;
      // its outline's points and the middles of its sides, pulled a tenth of the way in toward its middle (a row drawn up to
      // the lot line, where the field stops a foot short, still counts in full), and its middle
      const o = u.s.length <= 12 ? u.s : u.s.filter((_, k) => k % Math.ceil(u.s.length / 12) === 0), pts = [u.c]; for (let k = 0; k < o.length; k++) { const p = o[k], q = o[(k + 1) % o.length]; pts.push([u.c[0] + 0.9 * (p[0] - u.c[0]), u.c[1] + 0.9 * (p[1] - u.c[1])], [u.c[0] + 0.9 * ((p[0] + q[0]) / 2 - u.c[0]), u.c[1] + 0.9 * ((p[1] + q[1]) / 2 - u.c[1])]); }
      const k = pts.filter(p => inRing(p, F)).length; on += u.a * k / pts.length; }
    tot += Math.max(0, ringArea(F) - on); }
  return tot;
}
export const CURB_R = { out: 4, in: 14 }; // ft: the curb round a row's end, and where two pieces of paving meet
let paveMemo = { key: '', out: [] };
export function pavement(plan) {
  const els = (plan.elements || []).filter(e => (PAVED.includes(e.kind) || e.kind === 'canopy' || e.kind === 'tanks') && !e.island), key = JSON.stringify(els.map(e => [e.kind, e.x, e.y, e.w, e.d, e.rot, e.path, e.poly, e.width, e.r, e.closed, e.shape]));
  if (key === paveMemo.key) return paveMemo.out;
  const rings = els.map(e => { const r = outline(e); return r.length >= 3 && Math.abs(signedArea(r)) > 1; });
  let out = [];
  if (rings.some(Boolean)) {
    const ccw = r => signedArea(r) >= 0 ? r : r.slice().reverse(), close = r => r.concat([r[0]]);
    // a rectangle (a row, an aisle) grows 0.3 ft; a curved piece goes in as drawn (growing its many short sides could fold
    // it over itself). Added one at a time, so a piece the union can't take (degenerate) stays a piece of its own.
    const parts = els.map((e, k) => isFree(e) ? [ccw(rings[k] ? outline(e) : [])] : [ccw(grow(ccw(outline(e)), 0.3)), ccw(outline(e))]).filter(c => c[0].length >= 3);
    let mp = [];
    for (const cand of parts) { let done = false; for (const r of cand) { try { mp = mp.length ? polyclip.union(mp, [[close(r)]]) : [[close(r)]]; done = true; break; } catch (e) {} } if (!done) mp.push([close(cand[cand.length - 1])]); }
    const open = r => { const q = r.slice(0, -1); return q.filter((p, k) => { const b = q[(k + 1) % q.length]; return Math.hypot(b[0] - p[0], b[1] - p[1]) > 0.02; }); };
    out = mp.map(([o, ...hs]) => {
      const outer = curbRound(ccw(open(o))), holes = hs.map(h => open(h)).filter(h => h.length >= 3 && Math.abs(signedArea(h)) > 4).map(h => { const r = signedArea(h) <= 0 ? h : h.slice().reverse(); return curbRound(r); });
      return { outer, holes };
    }).filter(o => o.outer.length >= 3 && ringArea(o.outer) > 6).sort((a, b) => ringArea(b.outer) - ringArea(a.outer))
      .map(o => ({ outer: o.outer.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]), holes: o.holes.map(h => h.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)])) }));
  }
  paveMemo = { key, out };
  return out;
}
// a curb line's corners rounded (paving kept on the left: an outer ring counter-clockwise, a hole clockwise). A left
// turn is a corner of the paving (a row's end): CURB_R.out; a right turn is where pieces meet: CURB_R.in. A corner whose
// sides are short gets what fits (half of each side at most), so neighbouring curves never overlap; a corner that's
// nearly straight (an arc already drawn as points) is left alone.
export function curbRound(r, R = CURB_R) {
  const n = r.length; if (n < 3) return r.slice(); const out = [];
  for (let i = 0; i < n; i++) {
    const B = r[i], A = r[(i - 1 + n) % n], C = r[(i + 1) % n], la = Math.hypot(A[0] - B[0], A[1] - B[1]), lc = Math.hypot(C[0] - B[0], C[1] - B[1]);
    const u1 = [(A[0] - B[0]) / (la || 1), (A[1] - B[1]) / (la || 1)], u2 = [(C[0] - B[0]) / (lc || 1), (C[1] - B[1]) / (lc || 1)], th = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
    if (la < 0.05 || lc < 0.05 || th > Math.PI * 0.93) { out.push(B); continue; } // a straight run, or an arc's own points
    const left = (B[0] - A[0]) * (C[1] - B[1]) - (B[1] - A[1]) * (C[0] - B[0]) > 0, rad = left ? R.out : R.in;
    const t = Math.min(rad / Math.tan(th / 2), la * 0.45, lc * 0.45), rr = t * Math.tan(th / 2); if (rr < 0.3) { out.push(B); continue; }
    const T1 = [B[0] + u1[0] * t, B[1] + u1[1] * t], T2 = [B[0] + u2[0] * t, B[1] + u2[1] * t], bis = [u1[0] + u2[0], u1[1] + u2[1]], bl = Math.hypot(bis[0], bis[1]) || 1, h = rr / Math.sin(th / 2);
    const O = [B[0] + bis[0] / bl * h, B[1] + bis[1] / bl * h]; let a1 = Math.atan2(T1[1] - O[1], T1[0] - O[0]), da = Math.atan2(T2[1] - O[1], T2[0] - O[0]) - a1;
    while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const k = Math.max(2, Math.ceil(Math.abs(da) / (Math.PI / 18))); for (let j = 0; j <= k; j++) { const a = a1 + da * j / k; out.push([O[0] + rr * Math.cos(a), O[1] + rr * Math.sin(a)]); }
  }
  return out;
}

// stormwater the site needs: detention (a dry basin), retention (a wet pond), underground vaults, or none (a regional
// facility or a small site). Storage in acre-feet per acre of developed land; a pond's footprint is the storage over its
// depth plus a fifth for side slopes and freeboard. Typical Harris County numbers to start with: 0.55 ac-ft/ac, 5 ft deep.
// the acres a fixed program actually develops (building, its parking and drives, and the landscape round them), so
// a 28,000 sq ft centre on 27 acres doesn't dig detention for land nobody touches yet. As much as fits: the whole site.
export function stormAcres(site, prog, foot) {
  if (prog.use === 'fuel' && !prog.zones) return Math.min(site, (prog.fuel?.pumps || FUEL.pumps) * 6000 + 25000 + (prog.fuel?.wash ? 15000 : 0)) / 43560; // a gas station develops its canopy, lanes, store and parking
  if (!foot || prog.zones) return site / 43560;
  const dev = (foot + required(prog, foot * prog.floors) * 350) * (prog.use === 'multifamily' ? 1.7 : 1.45);
  return (dev < site * 0.75 ? dev : site) / 43560;
}
export const STORM = { mode: 'detention', rate: WALLER.values.detention.v, depth: 5 }; // (the fallback rate: Waller County's, lib/rulesheet.mjs; a place's rule sheet over it)
// storm.basin (set by lib/guardrails.mjs for a Waller site): the pond's footprint from its volume as a real basin (side
// slopes, freeboard, a maintenance bench, the outfall structure), not the storage over its depth plus a fifth
export function stormNeed(acres, params = {}, prog = {}, siteAc = acres) {
  const st = { ...STORM, ...(params.code?.storm || {}), ...given(params.storm), ...(prog.storm ? { mode: prog.storm } : {}) }, mode = siteAc < 1 && !params.storm?.mode && !prog.storm ? 'none' : st.mode; // under an acre: usually no on-site detention
  const volume = mode === 'none' ? 0 : st.rate * acres, area = mode === 'detention' || mode === 'retention' ? st.basin ? basinFootprint(volume, { ...st.basin, depth: st.depth }).area : volume * 43560 / Math.max(1, st.depth) * 1.2 : 0;
  if (prog.detentionPct != null) return { mode: prog.detentionPct > 0 ? mode === 'none' ? 'detention' : mode : 'none', volume, area: acres * 43560 * prog.detentionPct / 100 }; // a share of the site asked for outright
  return { mode, volume, area };
}

// the pond's average storage depth a plan's stormwater assumes (ft): the plan's own (or the Waller guardrails', which set
// params.storm.depth), else the rule sheet's, else the default
export const stormDepth = (params = {}) => +{ ...STORM, ...(params.code?.storm || {}), ...given(params.storm) }.depth || STORM.depth;
// a detention basin's footprint from the storage it must hold (acre-feet are volume, not surface area): a flat-bottomed
// basin `ratio` times as long as wide (2), side slopes `slope`:1 (4), `depth` ft of storage (4), `freeboard` ft above the
// design water level (1), a maintenance bench / access strip `bench` ft wide all round the top of bank (15), and an
// allowance for the outfall structure and the emergency overflow (`allowPct` of that, at least `allowMin` sf). The basin's
// volume is exact for straight side slopes: V = L·W·D + z·D²·(L + W) + 4/3·z²·D³, solved for W with L = ratio·W. All sf.
export function basinFootprint(acft, b = {}) {
  const D = Math.max(1, +b.depth || 4), z = Math.max(0, b.slope ?? 4), fb = Math.max(0, b.freeboard ?? 1), bench = Math.max(0, b.bench ?? 15), r = Math.max(1, +b.ratio || 2), V = Math.max(0, +acft || 0) * 43560;
  if (!(V > 0)) return { volume: 0, depth: D, slope: z, freeboard: fb, bench, bottom: [0, 0], water: [0, 0], bank: [0, 0], waterArea: 0, bankArea: 0, benchArea: 0, allowance: 0, area: 0 };
  const qa = r * D, qb = z * D * D * (r + 1), qc = 4 / 3 * z * z * D ** 3 - V, W = qc >= 0 ? 0 : (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa), L = r * W; // (so little that the slopes alone hold it: no flat bottom)
  const wet = [L + 2 * z * D, W + 2 * z * D], bank = [L + 2 * z * (D + fb), W + 2 * z * (D + fb)], top = [bank[0] + 2 * bench, bank[1] + 2 * bench], topA = top[0] * top[1];
  const allowance = Math.max(b.allowMin ?? 2000, topA * (b.allowPct ?? 0.05));
  return { volume: +acft, depth: D, slope: z, freeboard: fb, bench, bottom: [L, W], water: wet, bank, waterArea: wet[0] * wet[1], bankArea: bank[0] * bank[1], benchArea: topA - bank[0] * bank[1], allowance, area: topA + allowance };
}

// what a drawn plan needs and holds: developed acres (the site less land kept for a later phase), the storage, the
// pond area drawn, and the acre-feet left for underground vaults (all of it when underground is chosen)
export function stormOf(plan) {
  const m = metrics(plan), prog = normalizeProgram(plan.program), fut = (plan.elements || []).filter(e => e.kind === 'green' && e.future).reduce((s, e) => s + elArea(e), 0);
  const foot = prog.max || prog.zones || USES[prog.use]?.garage || prog.use === 'sfr' ? null : prog.use === 'multifamily' && prog.units ? prog.units * prog.unitSf / 0.85 / prog.floors : prog.gfa ? prog.gfa / prog.floors : null; // a fixed program, as the layout sizes it (lib/sitelayout.mjs wantFoot)
  const dev = Math.min(Math.max(0, m.siteSf - fut), stormAcres(m.siteSf, prog, foot) * 43560) / 43560, sn = stormNeed(dev, plan.params || {}, prog, m.acres);
  const vault = sn.mode === 'underground' ? sn.volume : sn.area > 0 && m.pond < sn.area * 0.95 ? sn.volume * (1 - m.pond / sn.area) : 0;
  return { ...sn, acres: dev, pond: m.pond, vault };
}

// ---------- trash ----------
// Enclosures by the usual rules of thumb (each city's solid waste rules decide in the end): homes roll carts to the
// curb (none); apartments one double enclosure (trash + recycling) per ~50 units, or a compactor with a recycling
// enclosure from 200 units; shops and offices one double per ~25,000 sq ft and none of them more than ~250 ft from
// one; a restaurant its own; industrial one per building. Off unless asked for; 'commercial' places only the non-residential ones. Sizes are outside the screen walls, gates on the drive.
// which Site parameters a plan's uses (its zones too) read: the building shape (shops, offices, apartments; homes,
// restaurants, warehouses, storage, a gas station and a food truck park are drawn their own way), the apartment bars'
// depth, length and spacing (apartments), curving streets (single-family), trash enclosures (none for homes: carts at
// the curb; one per so many units for apartments; one per so many sq ft for shops, offices and the like)
export const usesOf = p => { const q = normalizeProgram(p); return [...new Set([q.use, ...(q.zones || []).map(z => z.use)])].filter(u => u && u !== 'amenity' && u !== 'garage'); };
export const FORM_USES = ['multifamily', 'retail', 'office', 'medical', 'hotel', 'church', 'other'];
export const CART_USES = ['sfr', 'townhomes', 'duplex'];
export const PER_SF_TRASH = u => !CART_USES.includes(u) && !['multifamily', 'industrial', 'restaurant'].includes(u);
export const TRASH = { single: { w: 12, d: 12, note: 'Single · 8 yd dumpster' }, double: { w: 24, d: 12, note: 'Double · trash + recycling' }, compactor: { w: 40, d: 14, note: 'Compactor · 30 yd' } };
export function trashNeeds(plan) {
  const prog = normalizeProgram(plan.program), mode = plan.params?.trash?.mode || (prog.trash ? 'commercial' : 'none'), /* none unless asked for (in the request, or Site parameters) */ B = (plan.elements || []).filter(e => e.kind === 'building' && e.use !== 'amenity'); if (mode === 'none' || !B.length) return [];
  const useOf = e => USES[e.use] ? e.use : prog.use, out = [], per = +plan.params?.trash?.perUnits || 50, perSf = +plan.params?.trash?.perSf || 25000;
  const by = {}; for (const e of B) (by[useOf(e)] ||= []).push(e);
  // k enclosures for a group of buildings: split the buildings into k neighbourhoods along the group's long direction
  const split = (list, k) => { if (k <= 1 || list.length <= 1) return Array(Math.max(1, k)).fill(list); const xs = list.map(e => e.x), ys = list.map(e => e.y), ax = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 'x' : 'y', srt = list.slice().sort((a, b) => a[ax] - b[ax]);
    return Array.from({ length: k }, (_, i) => srt.slice(Math.floor(i * srt.length / k), Math.max(Math.floor(i * srt.length / k) + 1, Math.floor((i + 1) * srt.length / k)))); };
  for (const [use, list] of Object.entries(by)) {
    if (USES[use]?.garage || use === 'sfr') continue; // homes: carts at the curb
    if (use === 'multifamily') {
      if (mode === 'commercial') continue; // apartments' enclosures only when turned on (they're often valet trash or a compactor the owner places)
      const units = list.reduce((s, e) => s + (e.units ?? Math.floor(gfaOfEl(e) * 0.85 / prog.unitSf)), 0);
      if (units >= 200) { out.push({ type: 'compactor', near: list }); for (const g of split(list, Math.max(1, Math.ceil(units / 150) - 1))) out.push({ type: 'double', near: g }); } // recycling (and overflow) round the site
      else for (const g of split(list, Math.max(1, Math.ceil(units / per)))) out.push({ type: 'double', near: g });
    } else if (use === 'industrial') list.forEach(e => out.push({ type: 'double', near: [e] }));
    else if (use === 'restaurant') list.forEach(e => out.push({ type: 'double', near: [e] }));
    else { const sf = list.reduce((s, e) => s + gfaOfEl(e), 0); for (const g of split(list, Math.max(1, Math.ceil(sf / perSf)))) out.push({ type: 'double', near: g }); }
  }
  return out;
}
// places what trashNeeds asks for (less any enclosures already drawn): a clear spot beside a drive aisle, gate on the
// drive, else the end of a parking row that has stalls to spare. Returns { elements, placed, wanted }.
export function placeTrash(plan) {
  const els = (plan.elements || []).map(e => ({ ...e })), need = trashNeeds({ ...plan, elements: els }), have = els.filter(e => e.kind === 'trash').length, todo = need.slice(have);
  if (!todo.length) return { elements: els, placed: 0, wanted: need.length };
  const ring = plan.ring || [], rules = edgeRules(ring, plan.front, plan.setbacks, plan.streets), inset = ring.length >= 3 ? insetRing(ring, rules.map(r => Math.max(r.pave, 2))) : null;
  const bb = r => { const xs = r.map(p => p[0]), ys = r.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }, hit = (a, b, g) => a[0] - g < b[2] && b[0] - g < a[2] && a[1] - g < b[3] && b[1] - g < a[3];
  let solidB = null; const solid = () => solidB ??= els.filter(e => !['green', 'trail', 'lot', 'fence'].includes(e.kind)).map(e => ({ e, b: bb(outline(e)) })), grown = e => ({ ...e, w: e.w + 2, d: e.d + 2 });
  const fits = c => { const cb = bb(corners(c)); return inset && corners(c).every(p => inRing(p, inset)) && !solid().some(o => hit(cb, o.b, 12) && (o.e.kind === 'building' ? rectsOverlap({ ...c, w: c.w + 20, d: c.d + 20 }, o.e, 0) : rectsOverlap(grown(c), o.e, 0.3))); }; // 10 ft off a building: its walk, and the fire code's 5 ft
  const OL = new Map(), reach = (c, near) => Math.min(...near.map(b => { const o = OL.get(b) || OL.set(b, outline(b)).get(b); return o.reduce((m, p, k) => Math.min(m, segDist([c.x, c.y], p, o[(k + 1) % o.length])), Infinity); }));
  const prog = normalizeProgram(plan.program), m0 = metrics({ ...plan, elements: els }); let spare = m0.spaces - m0.required, placed = 0;
  const at = (e, u, v) => { const q = rot([u, v], e.rot || 0); return [e.x + q[0], e.y + q[1]]; };
  for (const t of todo) {
    const T = TRASH[t.type], cands = [];
    // beside a straight drive, its long side along the drive
    for (const d of els.filter(e => e.kind === 'drive' && !isFree(e) && e.name !== 'Main entry')) {
      const along = d.w >= d.d, L = along ? d.w : d.d, W = along ? d.d : d.w, r = (d.rot || 0) + (along ? 0 : 90);
      for (let u = -L / 2 + T.w / 2 + 8; u <= L / 2 - T.w / 2 - 8; u += 12) for (const sd of [-1, 1]) {
        const off = W / 2 + 1 + T.d / 2, p = along ? at(d, u, sd * off) : at(d, sd * off, u), c = { kind: 'trash', x: p[0], y: p[1], w: T.w, d: T.d, rot: r };
        cands.push({ c, cost: reach(c, t.near) });
      }
      for (const sd of [-1, 1]) { const off = L / 2 + 1 + T.d / 2, p = along ? at(d, sd * off, 0) : at(d, 0, sd * off), c = { kind: 'trash', x: p[0], y: p[1], w: T.w, d: T.d, rot: r + 90 }; cands.push({ c, cost: reach(c, t.near) }); } // past the end of an aisle
    }
    // beside a curved drive: along its centre line, square to it
    for (const d of els.filter(e => e.kind === 'drive' && e.path && e.name !== 'Main entry')) {
      const P = fillet(d.path, d.r ?? 30, d.closed), W = d.width || 26;
      for (let i = 0; i + 1 < P.length; i++) { const [a0, a1] = [P[i], P[i + 1]], L = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]); if (L < T.w * 0.6) continue;
        const u = [(a1[0] - a0[0]) / L, (a1[1] - a0[1]) / L], m = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2], ang = Math.atan2(u[1], u[0]) / RAD;
        for (const sd of [-1, 1]) { const off = W / 2 + 1 + T.d / 2, c = { kind: 'trash', x: m[0] - u[1] * off * sd, y: m[1] + u[0] * off * sd, w: T.w, d: T.d, rot: ang }; cands.push({ c, cost: reach(c, t.near) }); } }
    }
    // just past the end of a parking row, on the aisle side, gate on the aisle (in the landscape at the row's end)
    for (const e of els.filter(e => e.kind === 'parking' && e.row && e.lock)) { const v = e.row > 0 ? e.d / 2 - T.d / 2 - 1.5 : -e.d / 2 + T.d / 2 + 1.5;
      for (const end of [-1, 1]) { const p = at(e, end * (e.w / 2 + 2 + T.w / 2), v), c = { kind: 'trash', x: p[0], y: p[1], w: T.w, d: T.d, rot: e.rot || 0 }; cands.push({ c, cost: reach(c, t.near) + 5 }); } }
    // in place of a few stalls in a generator's parking row (at an end or splitting the row), when there are spaces to
    // spare; the gate on the row's aisle side
    if (spare > 0) for (const e of els.filter(e => e.kind === 'parking' && e.row && e.lock)) {
      const sw = e.sw || STALL.w, n = Math.round(e.w / sw), k = Math.ceil((T.w + 3) / sw), v = e.row > 0 ? e.d / 2 - T.d / 2 - 1.5 : -e.d / 2 + T.d / 2 + 1.5; if (n < k + 3) continue; // clear of the aisle's edge
      for (let a = 0; a + k <= n; a += a === 0 || a + k + 2 >= n ? 1 : 2) { // stalls a .. a+k-1 go; pieces shorter than two stalls go too
        const la = a < 2 ? 0 : a, rb = n - a - k < 2 ? 0 : n - a - k, pieces = [];
        if (la) { const p = at(e, -e.w / 2 + la * sw / 2, 0); pieces.push({ ...e, x: p[0], y: p[1], w: la * sw }); }
        if (rb) { const p = at(e, e.w / 2 - rb * sw / 2, 0); pieces.push({ ...e, id: la ? e.id + 'b' : e.id, x: p[0], y: p[1], w: rb * sw }); }
        const loss = stalls(e).count - pieces.reduce((s2, q) => s2 + stalls(q).count, 0); if (loss > spare) continue;
        const p = at(e, -e.w / 2 + (a + k / 2) * sw, v), c = { kind: 'trash', x: p[0], y: p[1], w: T.w, d: T.d, rot: e.rot || 0 };
        cands.push({ c, cost: reach(c, t.near) + 15 + loss, row: { e, pieces, loss } });
      }
    }
    const mine = els.filter(e => e.kind === 'trash'); for (const q of cands) q.cost += mine.reduce((s, o) => s + Math.max(0, 150 - Math.hypot(o.x - q.c.x, o.y - q.c.y)) * 2, 0); // spread out, not side by side
    cands.sort((a, b) => a.cost - b.cost);
    for (const q of cands) {
      if (reach(q.c, t.near) > 250) continue;
      if (q.row) { const { e, pieces, loss } = q.row, i = els.indexOf(e); if (i < 0) continue; els.splice(i, 1, ...pieces); solidB = null; if (!fits(q.c)) { els.splice(i, pieces.length, e); solidB = null; continue; } spare -= loss; }
      else if (!fits(q.c)) continue;
      solidB = null; els.push({ id: 't' + Math.random().toString(36).slice(2, 9), ...q.c, x: +q.c.x.toFixed(2), y: +q.c.y.toFixed(2), rot: +(((q.c.rot % 360) + 360) % 360).toFixed(3), name: t.type === 'compactor' ? 'Compactor' : 'Trash', note: T.note }); placed++; break;
    }
  }
  return { elements: els, placed, wanted: need.length };
}

// accessible stalls (2010 ADA Standards, table 208.2): how many a lot of n stalls needs; one in six van-accessible.
// Two accessible stalls share an access aisle the width of a stall, so each pair costs one ordinary space.
export function adaCount(n) {
  if (!(n > 0)) return 0; const T = [[25, 1], [50, 2], [75, 3], [100, 4], [150, 5], [200, 6], [300, 7], [400, 8], [500, 9]];
  for (const [m, k] of T) if (n <= m) return k; return n <= 1000 ? Math.ceil(n * 0.02) : 20 + Math.ceil((n - 1000) / 100);
}
export const adaLoss = n => Math.ceil(adaCount(n) / 2);
// where they go: in the stall rows nearest each building (closest first, taking turns between buildings), as
// accessible stall, striped aisle, accessible stall. Never on a planted island or an end cap.
export function accessible(plan) {
  const els = plan.elements || [], P = els.filter(e => e.kind === 'parking'), raw = P.reduce((s, e) => s + stalls(e).count, 0), n = adaCount(raw);
  const out = { stalls: [], aisles: [], count: n, van: Math.ceil(n / 6) }; if (!n) return out;
  const B = els.filter(e => e.kind === 'building' && !USES[e.use]?.garage), ent = els.find(e => e.name === 'Main entry');
  const goals = B.length ? B.map(b => ({ o: outline(b) })) : [{ o: ent ? outline(ent) : plan.ring || [[0, 0]] }];
  const slots = []; // runs of three ordinary stalls side by side
  for (const e of P) {
    if (e.poly) { // a custom outline: runs of neighbouring stalls in its rows (lib/stalls.mjs)
      const f = stalls(e).fill, bx = STL.boxesOf(f);
      f.rows.forEach((r, ri) => { for (const [i0, i1] of STL.runsOf(r, f.S.w)) for (let i = i0; i < i1; i++) {
        const box = bx[ri], c = centroid([box[i][1], box[i][2]].concat([box[i + 1][0], box[i + 1][3]]));
        slots.push({ key: e.id + ':' + ri, i, three: i + 2 <= i1, c, box: k => box[k], d: goals.map(g => g.o.reduce((m, p, k) => Math.min(m, segDist(c, p, g.o[(k + 1) % g.o.length])), Infinity)) });
      } });
      continue;
    }
    const S = e.sw ? { w: e.sw, d: e.sd || STALL.d } : STALL, st = stalls(e, e.sw ? { w: e.sw, d: e.sd || STALL.d, aisle: e.sa || STALL.aisle } : STALL), x0 = -st.n * S.w / 2;
    const put = (u, v) => { const q = rot(st.swap ? [v, -u] : [u, v], e.rot || 0); return [+(e.x + q[0]).toFixed(2), +(e.y + q[1]).toFixed(2)]; };
    const skip = new Set(); if (e.islands) for (let k = 12; k < st.n - (e.caps ? 1 : 0); k += 13) skip.add(k); if (e.caps && st.n >= 6) { skip.add(0); skip.add(st.n - 1); }
    const box = (i, y0, y1) => [put(x0 + i * S.w, y0), put(x0 + (i + 1) * S.w, y0), put(x0 + (i + 1) * S.w, y1), put(x0 + i * S.w, y1)];
    st.rows.forEach(([y0, y1], r) => { for (let i = 0; i + 1 < st.n; i++) if (!skip.has(i) && !skip.has(i + 1) && !skip.has(i - 1)) {
      const c = put(x0 + (i + 1) * S.w, (y0 + y1) / 2), three = i + 2 < st.n && !skip.has(i + 2) && !skip.has(i + 3);
      slots.push({ key: e.id + ':' + r, i, three, c, box: k => box(k, y0, y1), d: goals.map(g => g.o.reduce((m, p, k) => Math.min(m, segDist(c, p, g.o[(k + 1) % g.o.length])), Infinity)) });
    } });
  }
  const used = new Map(), free = (q, k) => { const u = used.get(q.key) || new Set(); for (let j = q.i - 1; j <= q.i + k; j++) if (u.has(j)) return false; return true; }, take = (q, k) => { const u = used.get(q.key) || used.set(q.key, new Set()).get(q.key); for (let j = q.i; j < q.i + k; j++) u.add(j); };
  let left = n, g = 0, guard = 0;
  while (left > 0 && guard++ < 400) {
    const k = left >= 2 ? 3 : 2, best = slots.filter(q => (k === 2 || q.three) && free(q, k)).sort((a, b) => a.d[g] - b.d[g])[0]; g = (g + 1) % goals.length;
    if (!best) { if (k === 3) { left = 1; continue; } break; }
    take(best, k); const ada = k === 3 ? [best.i, best.i + 2] : [best.i], ai = best.i + 1;
    for (const i of ada) { const poly = best.box(i); out.stalls.push({ poly, van: out.stalls.length < out.van, sym: centroid(poly) }); }
    const ap = best.box(ai), [a0, a1, a2, a3] = ap, lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    out.aisles.push({ poly: ap, lines: [0.15, 0.4, 0.65].map(t => [lerp(a0, a3, t), lerp(a1, a2, t + 0.3)]) }); left -= ada.length;
  }
  return out;
}
// pavement markings at each entrance: a stop bar across the outbound lane and, without a median, a double yellow
// centre line. Lines in plan feet with their colour.
export function entryMarks(plan) {
  const ring = plan.ring || []; if (ring.length < 3) return [];
  return entrancesOf(plan.elements).filter(e => !e.through).flatMap(e => marksAt(plan, e));
}
function marksAt(plan, e) {
  const ring = plan.ring; const cl = clOf(e);
  if (cl) return marksAlong(e, cl, entryParts(plan, e).find(isMedian)); // (one that turns to meet its drive square: along its centre line)
  // the lot line its mouth is on (not the one nearest its middle: a driveway in near a corner read as coming from the
  // other street), and the point on it square to its middle
  const o = outline(e), c = [e.x, e.y]; let b = ring[0], bd = Infinity, u, len, lo, hi, mid;
  if (e.path?.length >= 2 && e.mouth && !e.closed) { // a route (turned or bent by hand): its mouth and its throat, square to the street
    const P = e.path, W = e.width || 26, d1 = (P[1][0] - P[0][0]) * e.mouth[0] + (P[1][1] - P[0][1]) * e.mouth[1], run = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]);
    b = P[0]; u = e.mouth; lo = -W / 2; hi = W / 2; mid = 0; len = d1 > run - 0.5 ? d1 : Math.min(d1, (e.flare || 0) + 10); // (straight in: as far as it runs; turned: the throat)
  } else {
    ring.forEach((p, i) => { const q = ring[(i + 1) % ring.length], dx = q[0] - p[0], dy = q[1] - p[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((c[0] - p[0]) * dx + (c[1] - p[1]) * dy) / L2)), f = [p[0] + dx * t, p[1] + dy * t], d = Math.min(...o.map(x => segDist(x, p, q))) * 1e4 + Math.hypot(f[0] - c[0], f[1] - c[1]); if (d < bd) { bd = d; b = f; } });
    const L = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1; u = [(c[0] - b[0]) / L, (c[1] - b[1]) / L];
  }
  const r = [-u[1], u[0]], al = p => (p[0] - b[0]) * u[0] + (p[1] - b[1]) * u[1], ac = p => (p[0] - b[0]) * r[0] + (p[1] - b[1]) * r[1];
  if (len == null) { len = Math.max(...o.map(al)); const core = o.filter(p => al(p) > len * 0.45); lo = Math.min(...core.map(ac)); hi = Math.max(...core.map(ac)); mid = (lo + hi) / 2; }
  const med = entryParts(plan, e).find(isMedian), mh = med ? stripOf(shapeOf(med), b).w / 2 : 0, at = (s, t) => [+(b[0] + u[0] * s + r[0] * t).toFixed(2), +(b[1] + u[1] * s + r[1] * t).toFixed(2)]; // (its width across: a median drawn by hand has an outline only)
  if (!(hi - lo >= 18) || !(len >= 30) && !e.path) return [];
  const out = [{ line: [at(12, mid + mh + 1), at(12, hi - 1)], color: '#ffffff', w: 2 }];
  if (!med && len >= 30) for (const dt of [-0.5, 0.5]) out.push({ line: [at(6, mid + dt), at(len - 6, mid + dt)], color: '#e8c440', w: 0.4 });
  return out;
}

// the same along a driveway that turns (its centre line cl, from the street): the stop bar 12 ft in, square to it, and
// the double yellow following the turn
function marksAlong(e, cl, med) {
  const segs = []; let tot = 0; for (let i = 0; i + 1 < cl.length; i++) { const a = cl[i], b = cl[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) continue; segs.push({ a, u: [(b[0] - a[0]) / L, (b[1] - a[1]) / L], s: tot, L }); tot += L; }
  if (!segs.length || tot < 30) return [];
  const at = (s, t) => { const g = segs.find(g => s <= g.s + g.L) || segs[segs.length - 1], v = s - g.s; return [+(g.a[0] + g.u[0] * v - g.u[1] * t).toFixed(2), +(g.a[1] + g.u[1] * v + g.u[0] * t).toFixed(2)]; };
  const u0 = segs[0].u, half = Math.min(...e.poly.map(p => { const dx = p[0] - cl[0][0], dy = p[1] - cl[0][1], al = dx * u0[0] + dy * u0[1]; return al > 25 && al < 40 ? Math.abs(-dx * u0[1] + dy * u0[0]) : Infinity; })), hw = Number.isFinite(half) ? half : 13;
  if (hw < 9) return [];
  const mh = med ? (med.poly ? stripOf(shapeOf(med), cl[0]).w : Math.min(med.w, med.d)) / 2 : 0, out = [{ line: [at(12, mh + 1), at(12, hw - 1)], color: '#ffffff', w: 2 }]; // (a median drawn as an outline: its width across)
  if (!med) for (const dt of [-0.5, 0.5]) { const pts = [6]; for (const g of segs) if (g.s > 6 && g.s < tot - 6) pts.push(g.s); pts.push(tot - 6); for (let i = 0; i + 1 < pts.length; i++) out.push({ line: [at(pts[i], dt), at(pts[i + 1] - 1e-6, dt)], color: '#e8c440', w: 0.4 }); }
  return out;
}

// the planting and walks that make a plan read like one, worked out from the pieces (nothing is stored):
// an 8 ft walk around each building, trees every ~40 ft along the landscape buffer and around ponds, and a tree in
// each parking island. Feet; trees are [x, y, canopy radius].
// a tree as the plan shows it: a canopy with a scalloped edge (lobes), size and shade varied a little by where it
// stands so a row doesn't look stamped. Plan feet; also the 3D tree (trunk, a wide lower crown, a narrower top).
const TREE_GREENS = [['#6f9f55', '#4f7a3a', '#9cc77f'], ['#7aa95c', '#557f3e', '#a7d08a'], ['#5f9150', '#426e35', '#8fbf74']];
export function treeShape(x, y, r) {
  const h = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1, R = r * (0.88 + h * 0.24), lobes = 7 + Math.floor(h * 4), rot0 = h * Math.PI * 2, pts = [];
  for (let i = 0; i < 48; i++) { const t = i / 48 * 2 * Math.PI, b = 0.87 + 0.13 * Math.abs(Math.cos(lobes * (t + rot0) / 2)); /* round lobes, notched between */ pts.push([x + R * b * Math.cos(t), y + R * b * Math.sin(t)]); }
  return { R, canopy: pts, colors: TREE_GREENS[Math.floor(h * 3)], h };
}
const ngon = (x, y, r, n = 10, a0 = 0) => Array.from({ length: n }, (_, i) => { const t = a0 + i / n * 2 * Math.PI; return [x + r * Math.cos(t), y + r * Math.sin(t)]; });
// 3D pieces for one tree, heights in feet: [ring, base, top, colour]
export function tree3D(x, y, r) {
  const T = treeShape(x, y, r), H = 24 + T.h * 12;
  return [[ngon(x, y, Math.max(0.8, r * 0.09), 6), 0, H * 0.35, '#6b4f36'], [T.canopy, H * 0.3, H * 0.78, T.colors[1]], [ngon(x - T.R * 0.12, y + T.R * 0.12, T.R * 0.62, 12, T.h), H * 0.6, H, T.colors[0]]];
}

export const details = lastOf(detailsOf);
function detailsOf(plan) {
  const ring = plan.ring || [], els = plan.elements || [], trees = [], walks = [], islands = [], patios = [], pumps = [];
  if (ring.length < 3) return { trees, walks, islands, patios, pumps };
  const paved = els.filter(e => e.kind === 'parking' || e.kind === 'drive');
  for (const e of els) if (e.kind === 'building' && e.unitW > 0 && !isFree(e) && !e.form) { // townhome-style units: a fenced patio behind each, on the side away from the parking
    const n = Math.max(1, Math.round(e.w / e.unitW)), uw = e.w / n; let near = Infinity, sg = 1;
    for (const q of paved) { const [u, v] = toLocal(e, q.poly ? centroid(q.poly) : [q.x, q.y]), dd = Math.hypot(Math.max(0, Math.abs(u) - e.w / 2), v); if (dd < near) { near = dd; sg = v > 0 ? 1 : -1; } }
    const v0 = -sg * e.d / 2, at = (u, v) => { const q = rot([u, v], e.rot || 0); return [+(e.x + q[0]).toFixed(2), +(e.y + q[1]).toFixed(2)]; };
    const room = D => [at(-e.w / 2, -sg * (e.d / 2 + D)), at(e.w / 2, -sg * (e.d / 2 + D))].every(p => inRing(p, ring) && distToPoly(p, ring) >= 3), D = [10, 8, 6].find(room); if (!D) continue; // short of the lot line
    const v1 = -sg * (e.d / 2 + D);
    for (let i = 0; i < n; i++) { const a = -e.w / 2 + i * uw, b = a + uw; patios.push({ poly: [at(a, v0), at(b, v0), at(b, v1), at(a, v1)], walls: [[at(a, v0), at(a, v1)], [at(a, v1), at(b, v1)], [at(b, v1), at(b, v0)]] }); }
  }
  for (const e of els) if (e.kind === 'canopy') pumps.push(...pumpsOf(e)); // the pump islands under a canopy
  for (const e of els) if (e.kind === 'building' && !e.nowalk && !(e.use === 'storage' && storageKind(e) === 'drive') && !(e.use === 'fuel' && fuelKind(e) === 'wash')) walks.push({ x: e.x, y: e.y, w: e.w + 16, d: e.d + 16, rot: e.rot, ...(e.form || e.jog || e.poly ? { poly: offsetRing(outline(e), 8) } : {}) }); // the walk follows the building (an L, a U, a stepped front)
  for (const e of els) if (e.kind === 'parking') {
    for (const c of islandsOf(e)) { islands.push({ x: c[0], y: c[1], w: e.sw || STALL.w, d: e.sd || STALL.d, rot: e.rot }); trees.push([c[0], c[1], 12]); }
    for (const c of capsOf(e)) { islands.push({ poly: c.poly, x: c.tree[0], y: c.tree[1], w: 9, d: 18 }); trees.push([c.tree[0], c.tree[1], 11]); }
  }
  for (const e of els) if (isRing(e) || isLoop(e)) { const q = islandOf(e); if (q) islands.push({ poly: q, ...xyOf(q), w: 0, d: 0 }); } // a roundabout's or a drop-off loop's planted island
  const EG = gridIndex(els.filter(e => e.kind !== 'green' && e.kind !== 'trail' && e.kind !== 'fence'), e => boxOfPts(shapeOf(e))), TG = gridIndex(trees, t => [t[0] - t[2], t[1] - t[2], t[0] + t[2], t[1] + t[2]]), PG = gridIndex(patios, q => boxOfPts(q.poly));
  const tPush = trees.push.bind(trees); trees.push = (...ts) => { for (const t of ts) TG.add(t, [t[0] - t[2], t[1] - t[2], t[0] + t[2], t[1] + t[2]]); return tPush(...ts); }; // every tree goes on the grid as it's planted
  const clear = (p, r, skip) => { if (!inRing(p, ring)) return false; const g = r + 24;
    for (const e of EG.near(p[0] - g, p[1] - g, p[0] + g, p[1] + g)) if (e !== skip && nearPiece(e, p, r + (e.kind === 'building' ? 8 : 0))) return false;
    for (const t of TG.near(p[0] - g, p[1] - g, p[0] + g, p[1] + g)) if (Math.hypot(t[0] - p[0], t[1] - p[1]) < r + t[2] - 4) return false;
    for (const q of PG.near(p[0] - r, p[1] - r, p[0] + r, p[1] + r)) if (inRing(p, q.poly) || distToPoly(p, q.poly) < r) return false;
    return true; };
  const buf = Math.max(6, (edgeRules(ring, plan.front, plan.setbacks, plan.streets)[0]?.pave || 10) / 2);
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 30) return;
    const n = outward(ring, i), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], k = Math.max(1, Math.round((L - 30) / 40));
    for (let t = 0; t <= k; t++) { const s = 15 + (L - 30) * t / k, p = [a[0] + u[0] * s - n[0] * buf, a[1] + u[1] * s - n[1] * buf]; if (clear(p, 12)) trees.push([p[0], p[1], 12]); }
  });
  for (const e of els) if (e.kind === 'pond') { // around the bank, 22 ft out
    const o = isFree(e) ? grow(e.poly, 22) : outline({ ...e, w: e.w + 44, d: e.d + 44 }), per = o.reduce((s, p, i) => s + Math.hypot(o[(i + 1) % o.length][0] - p[0], o[(i + 1) % o.length][1] - p[1]), 0), step = Math.max(1, Math.round(o.length * 45 / per));
    for (let i = 0; i < o.length; i += step) if (clear(o[i], 12, e)) trees.push([o[i][0], o[i][1], 12]);
  }
  if (plan.params?.trees === false) trees.length = 0; // trees switched off: none at all
  for (const e of plan.params?.trees === false ? [] : els) { // a tree in a roundabout's island; a row down a loop's when it's 14 ft wide or more
    if (isRing(e)) { const g = ringOf(e), r = Math.min(14, g.Ri - 6); if (g.Ri >= 18 && clear(g.c, r, e)) trees.push([g.c[0], g.c[1], r]); continue; }
    const q = isLoop(e) && islandOf(e); if (!q) continue; const P = e.path, B = P[1], C = P[P.length - 2], L = Math.hypot(C[0] - B[0], C[1] - B[1]) || 1, u = [(C[0] - B[0]) / L, (C[1] - B[1]) / L], A = P[0], v0 = [A[0] - B[0], A[1] - B[1]], vl = Math.hypot(...v0) || 1, v = [v0[0] / vl, v0[1] / vl], deep = ringArea(q) / Math.max(1, L - e.width), k = Math.max(1, Math.round((L - e.width) / 40));
    if (deep >= 14) for (let i = 0; i < k; i++) { const s0 = e.width / 2 + (L - e.width) * (i + 0.5) / k, p = [B[0] + u[0] * s0 + v[0] * (e.width / 2 + deep / 2), B[1] + u[1] * s0 + v[1] * (e.width / 2 + deep / 2)], r = Math.min(12, distToPoly(p, q) - 1); if (r >= 6 && inRing(p, q) && clear(p, r, e)) trees.push([p[0], p[1], r]); } }
  for (const e of plan.params?.trees === false ? [] : els) if (e.kind === 'green' && e.trees) { // a planted lawn: a row of trees just inside its edge, and in a big park a few groups, never a grid of dots
    const o = outline(e), inner = offsetRing(o, -16), per = inner.reduce((t, p, i) => t + Math.hypot(inner[(i + 1) % inner.length][0] - p[0], inner[(i + 1) % inner.length][1] - p[1]), 0);
    if (ringArea(o) < 6000) continue;
    for (let d = 0; d < per; d += 50) { let t = d; for (let i = 0; i < inner.length; i++) { const a = inner[i], b = inner[(i + 1) % inner.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (t <= L) { const p = [a[0] + (b[0] - a[0]) * t / (L || 1), a[1] + (b[1] - a[1]) * t / (L || 1)]; if (inRing(p, o) && clear(p, 12, e)) trees.push([p[0], p[1], 12]); break; } t -= L; } }
    if (ringArea(o) > 80000) { const xs = o.map(p => p[0]), ys = o.map(p => p[1]); // groves of three
      for (let x = Math.min(...xs) + 90; x < Math.max(...xs) - 60; x += 190) for (let y = Math.min(...ys) + 90; y < Math.max(...ys) - 60; y += 190) { const c = [x + ((Math.round(y / 190) % 2) * 95), y];
        for (const [dx, dy] of [[0, 0], [24, 10], [8, 26]]) { const p = [c[0] + dx, c[1] + dy]; if (inRing(p, o) && distToPoly(p, o) > 30 && clear(p, 11, e)) trees.push([p[0], p[1], 11 + ((dx + dy) % 3)]); } }
    }
  }
  // street trees: one in each front yard, on the side away from the driveway
  if (plan.params?.trees !== false) { const dw = els.filter(e => e.kind === 'plaza' && e.note === 'Driveway');
    for (const h of els) if (h.kind === 'building' && h.use === 'sfr') { let best = null; for (const d of dw) { const k = Math.hypot(d.x - h.x, d.y - h.y); if (k < Math.max(h.w, h.d) + 30 && (!best || k < best.k)) best = { k, d }; } if (!best) continue;
      const v = [best.d.x - h.x, best.d.y - h.y], L = Math.hypot(...v) || 1, u = [v[0] / L, v[1] / L], side = [-u[1], u[0]], off = (best.d.x - h.x) * side[0] + (best.d.y - h.y) * side[1] > 0 ? -1 : 1, depth = Math.abs((rot(u, -(h.rot || 0)))[1]) > 0.5 ? h.d : h.w;
      const p = [h.x + u[0] * (depth / 2 + 16) + side[0] * off * 12, h.y + u[1] * (depth / 2 + 16) + side[1] * off * 12]; if (inRing(p, ring) && ![...EG.near(p[0] - 30, p[1] - 30, p[0] + 30, p[1] + 30)].some(e => e !== h && e.kind !== 'lot' && nearPiece(e, p, 3))) trees.push([p[0], p[1], 10]); }
  }
  delete trees.push; // (back to a plain array)
  return { trees, walks, islands, patios, pumps };
}
// the pump islands under a canopy: its rows along its length, an MPD's island (20 × 4 ft) in the middle of each slot,
// running along the canopy (e.islands 'along', the default) or across it ('across'). Each with its dispenser (3 × 2 ft)
// in the middle: { x, y, w, d, rot, mpd: { x, y, w, d } }
export function pumpsOf(e) {
  const n = e.pumps || 0, rows = Math.max(1, e.rows || 1), per = Math.ceil(n / rows), along = e.w >= e.d, L = along ? e.w : e.d, W = along ? e.d : e.w, out = []; if (!n) return out;
  const pitch = L / per, rp = W / rows, x = e.islands === 'across', iu = x ? 4 : Math.min(20, pitch - 6), iv = x ? Math.max(8, Math.min(22, rp - 12)) : 4;
  for (let r = 0; r < rows; r++) for (let i = 0; i < per && r * per + i < n; i++) { const u = -L / 2 + pitch * (i + 0.5), v = -W / 2 + rp * (r + 0.5), q = rot(along ? [u, v] : [v, u], e.rot || 0);
    out.push({ x: +(e.x + q[0]).toFixed(2), y: +(e.y + q[1]).toFixed(2), w: along ? iu : iv, d: along ? iv : iu, rot: e.rot || 0, mpd: { w: along ? (x ? 2 : 3) : (x ? 3 : 2), d: along ? (x ? 3 : 2) : (x ? 2 : 3) } }); }
  return out;
}

// a fuel canopy in 3D (ft; plan rings): on each pump island a 6 in curb, the dispenser (7 ft) in its middle and a column
// (2 ft square) at one end up to the canopy's clearance (FUEL.canopyH, 18 ft); the roof deck over it and a 3½ ft fascia
// band round its edge. [{ part, c (colour), b, h, ring }]
export function canopy3d(e) {
  const H = FUEL.canopyH, out = [], o = outline(e), box = (x, y, w, d, r) => corners({ x, y, w, d, rot: r });
  for (const q of pumpsOf(e)) {
    const along = q.w >= q.d, L = along ? q.w : q.d, u = rot([1, 0], q.rot || 0), ax = along ? u : [-u[1], u[0]], at = t => [q.x + ax[0] * t, q.y + ax[1] * t];
    out.push({ part: 'curb', c: '#c9c6bd', b: 0, h: 0.5, ring: corners(q) });
    out.push({ part: 'mpd', c: '#2b3033', b: 0.5, h: 7, ring: box(q.x, q.y, q.mpd?.w ?? (along ? 3 : 2), q.mpd?.d ?? (along ? 2 : 3), q.rot || 0) });
    const p = at(L / 2 - 2); out.push({ part: 'column', c: '#9aa1a5', b: 0.5, h: H, ring: box(p[0], p[1], 2, 2, q.rot || 0) });
  }
  out.push({ part: 'roof', c: '#f1f2ef', b: H + 2, h: H + 3, ring: o });
  const ins = offsetRing(o, -1.2); out.push({ part: 'fascia', c: '#a83232', b: H, h: H + 3.5, ring: o, hole: ins });
  return out;
}
// keep: the planting and checks from the last call, reused while a piece is being dragged (they're the slow part on a big site)
// a subdivision street drawn in pieces (broken where other streets meet it) is named once, on its longest piece: the ids
// of the other pieces, whose names aren't drawn
// (names: the street names are on, so every street with one is named along it instead: streetLabels)
export function namedOnce(els, names = false) {
  const len = P => P.reduce((t, q, i) => i ? t + Math.hypot(q[0] - P[i - 1][0], q[1] - P[i - 1][1]) : 0, 0), st = els.filter(e => e.kind === 'drive' && e.net && e.path && e.name), best = new Map();
  for (const e of st) { const L = len(e.path), b = best.get(e.name); if (!b || L > b.L) best.set(e.name, { e, L }); }
  return new Set(st.filter(e => best.get(e.name).e !== e).map(e => e.id).concat(names ? els.filter(e => e.kind === 'drive' && e.street).map(e => e.id) : []));
}
// a neighbourhood's street names along its streets (phase 4b, lib/streetnames.mjs; only when plan.params.streetNames is
// on): each name on its longest piece and on any other over 600 ft, each at most 1,200 ft round its middle. [{ t, path }]
export function streetLabels(plan) {
  if (!plan?.params?.streetNames?.on) return []; const by = new Map(), out = [], seg = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (const e of plan.elements || []) if (e.kind === 'drive' && e.path?.length > 1 && e.street) { const c = [0]; for (let i = 1; i < e.path.length; i++) c.push(c[i - 1] + seg(e.path[i - 1], e.path[i])); (by.get(e.street) || by.set(e.street, []).get(e.street)).push({ P: e.path, c, L: c[c.length - 1] }); }
  const at = (x, s) => { let i = 1; while (i < x.c.length - 1 && x.c[i] < s) i++; const a = x.P[i - 1], b = x.P[i], t = (s - x.c[i - 1]) / ((x.c[i] - x.c[i - 1]) || 1); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  for (const [t, list] of by) list.sort((a, b) => b.L - a.L).forEach((x, i) => { if (i && x.L <= 600) return; if (x.L <= 1200) { out.push({ t, path: x.P }); return; } const a = x.L / 2 - 600, b = x.L / 2 + 600; out.push({ t, path: [at(x, a), ...x.P.filter((q, k) => x.c[k] > a && x.c[k] < b), at(x, b)] }); });
  return out;
}
export function planFeatures(plan, selected, keep = null) {
  const F = frame(plan.origin), ll = r => r.map(F.toLL), poly = r => ({ type: 'Polygon', coordinates: [ll(r.concat([r[0]]))] }), feats = [], prog = normalizeProgram(plan.program);
  const ring = plan.ring || []; if (ring.length < 3) return { type: 'FeatureCollection', features: feats }; const quiet = namedOnce(plan.elements || [], !!plan.params?.streetNames?.on);
  feats.push({ type: 'Feature', properties: { k: 'lot', site: 1 }, geometry: poly(ring) }); // the site itself (house lots are k 'lot' too, without `site`)
  for (const x of streetLabels(plan)) feats.push({ type: 'Feature', properties: { k: 'sname', t: x.t }, geometry: { type: 'LineString', coordinates: ll(x.path) } }); // the street names, along their streets
  for (const z of plan.zones || []) if (z.ring?.length >= 3) feats.push({ type: 'Feature', properties: { k: 'zone', t: z.name }, geometry: poly(z.ring) });
  const rules = edgeRules(ring, plan.front, plan.setbacks, plan.streets);
  feats.push({ type: 'Feature', properties: { k: 'setback' }, geometry: poly(insetRing(ring, rules.map(r => r.build))) });
  const f = plan.front ?? longestEdge(ring); feats.push({ type: 'Feature', properties: { k: 'front' }, geometry: { type: 'LineString', coordinates: ll([ring[f], ring[(f + 1) % ring.length]]) } });
  for (const k of plan.streets || []) if (k !== f && k < ring.length) feats.push({ type: 'Feature', properties: { k: 'street' }, geometry: { type: 'LineString', coordinates: ll([ring[k], ring[(k + 1) % ring.length]]) } }); // a side street
  const bad = keep?.bad || new Set(check(plan).filter(i => i.id && i.level === 'bad').map(i => i.id)), d = keep?.d || details(plan);
  for (const w of d.walks) feats.push({ type: 'Feature', properties: { k: 'walk' }, geometry: poly(w.poly || corners(w)) });
  for (const q of d.patios) { feats.push({ type: 'Feature', properties: { k: 'yard' }, geometry: poly(q.poly) }); feats.push({ type: 'Feature', properties: { k: 'fence' }, geometry: { type: 'MultiLineString', coordinates: q.walls.map(ll) } }); }
  const FAC = facades({ ...plan, elements: (plan.elements || []).filter(e => (e.phase || 1) !== 2 || e.kind !== 'building') }, { skip: new Set([selected]) }); // (Phase 2's buildings stay plain, faint massing)
  for (const e of plan.elements || []) {
    const use = USES[e.use] ? e.use : prog.use;
    const props = { k: e.kind, use, id: e.id, ...(e.gate ? { gate: 1 } : {}), sel: e.id === selected ? 1 : 0, bad: bad.has(e.id) ? 1 : 0, nm: e.name ? 1 : 0, ...(isMedian(e) ? { med: 1 } : {}), ph: e.phase || 1, h: e.kind === 'building' ? +((e.floors || 1) * USES[use].floorH / FT).toFixed(1) : 0 };
    const tower = e.kind === 'building' && e.form === 'tower' && e.podium > 0 && (e.floors || 1) > e.podium;
    if (tower) props.h = +(e.podium * USES[use].floorH / FT).toFixed(1); // the podium; the tower goes on top
    if (e.kind === 'garage') props.h = +((e.levels || 4) * 10.5 / FT).toFixed(1);
    if (e.kind === 'sign') props.h = +(6 / FT).toFixed(1); // a 6 ft wall
    feats.push({ type: 'Feature', properties: props, geometry: isRing(e) ? (g => ({ type: 'Polygon', coordinates: [ll(ringDisc(g.c, g.R)), ll(ringDisc(g.c, g.Ri).reverse())].map(r => r.concat([r[0]])) }))(ringOf(e)) : poly(outline(e)) }); // (a roundabout: a ring with a hole, not the outline that doubles back across its lane)
    const fx = e.kind === 'building' && FAC.get(e.id);
    if (fx) { // 3D detail from the building's floor-plan design: its walls' finishes, windows, doors, balconies and roof
      props.h = +(fx.wallH / FT).toFixed(1); props.fac = 1;
      for (const q of fx.parts) feats.push({ type: 'Feature', properties: { k: 'fac', c: q.c, b: +(q.b / FT).toFixed(2), h: +(q.h / FT).toFixed(2) }, geometry: q.hole ? { type: 'Polygon', coordinates: [ll(q.ring.concat([q.ring[0]])), ll(q.hole.slice().reverse().concat([q.hole[q.hole.length - 1]]))] } : poly(q.ring) });
    } else if (e.kind === 'building' || e.kind === 'garage') { // 3D detail: the tower, a parapet round the roof and a line at every floor
      const fh = e.kind === 'garage' ? 10.5 : USES[use].floorH, fl = e.kind === 'garage' ? (e.levels || 4) : e.floors || 1, ring = (o, d1, d2) => ({ type: 'Polygon', coordinates: [ll(offsetRing(o, d1).concat([offsetRing(o, d1)[0]])), ll(offsetRing(o, d2).reverse().concat([offsetRing(o, d2).reverse()[0]]))] });
      const top = tower ? towerOutline(e) : outline(e), base = outline(e), H = fl * fh, x3 = (part, geometry, b, h) => feats.push({ type: 'Feature', properties: { k: 'b3', part, use, ph: e.phase || 1, g: e.kind === 'garage' ? 1 : 0, b: +(b / FT).toFixed(2), h: +(h / FT).toFixed(2) }, geometry });
      if (tower) x3('tower', poly(top), e.podium * fh, H);
      x3('parapet', ring(top, 0, -1.2), H, H + 3);
      if (tower) x3('parapet', ring(base, 0, -1.2), e.podium * fh, e.podium * fh + 3);
      for (let f = 1; f < fl && f < 60; f++) { const o = tower && f > e.podium ? top : base; if (!tower || f !== e.podium) x3('floor', ring(o, 0.35, -0.2), f * fh - 0.8, f * fh); }
    }
    if (e.kind === 'parking') for (const l of stallLines(e)) feats.push({ type: 'Feature', properties: { k: 'stall' }, geometry: { type: 'LineString', coordinates: ll(l) } });
    if (e.kind === 'foodtruck' && e.w >= 20 && e.d >= 10) { const q = truckParts(e); // the truck (3D), its serving window toward the seating, the pedestal
      feats.push({ type: 'Feature', properties: { k: 'ftbody', h: 3.2 }, geometry: poly(q.body) }, { type: 'Feature', properties: { k: 'mark', c: '#e07b24', w: 3 }, geometry: { type: 'LineString', coordinates: ll(q.window) } }, { type: 'Feature', properties: { k: 'pedestal', h: 1.2 }, geometry: poly(q.pedestal) }); }
    const L = labelOf(e, plan.program), t = [L.name.toUpperCase(), L.what, L.size].filter(Boolean).join('\n');
    const lp = e.kind === 'sign' ? signLabelAt(e) : [e.x, e.y];
    if (t && !quiet.has(e.id)) feats.push({ type: 'Feature', properties: { k: 'label', t, kind: e.kind, big: e.kind === 'building' ? 1 : 0 }, geometry: { type: 'Point', coordinates: F.toLL(lp) } });
  }
  // each part's name, big and faint over its zone (a mixed plan's parts always; a single-use plan's when it has a name, else the community's)
  { const av = labelSpots(plan); for (const p of partsOf(plan, false)) { const t = p.show || (!prog.zones ? prog.community : null); if (t && p.ring) feats.push({ type: 'Feature', properties: { k: 'zlabel', t }, geometry: { type: 'Point', coordinates: F.toLL(labelPoint(p.ring, av, t.length * 18)) } }); }
    for (const z of sectionLabels(plan)) feats.push({ type: 'Feature', properties: { k: 'zlabel', t: z.t, small: 1 }, geometry: { type: 'Point', coordinates: F.toLL(labelPoint(z.ring, av, z.t.length * 10)) } }); } // (about 36 ft a letter where the map's big names show)
  for (const i of d.islands) feats.push({ type: 'Feature', properties: { k: 'island' }, geometry: poly(outline(i)) });
  for (const q of d.pumps || []) feats.push({ type: 'Feature', properties: { k: 'pump' }, geometry: poly(corners(q)) }); // pump islands under the canopy
  for (const e of plan.elements || []) if (e.kind === 'canopy') for (const c of canopy3d(e)) feats.push({ type: 'Feature', properties: { k: 'c3', part: c.part, c: c.c, b: +(c.b / FT).toFixed(2), h: +(c.h / FT).toFixed(2), ...(c.part === 'roof' ? { sel: e.id === selected ? 1 : 0 } : {}) }, geometry: c.hole ? { type: 'Polygon', coordinates: [ll(c.ring.concat([c.ring[0]])), ll(c.hole.slice().reverse().concat([c.hole[c.hole.length - 1]]))] } : poly(c.ring) }); // the canopy in 3D
  // the paving as one surface (its curb drawn once round the outside), and its markings
  for (const pv of pavement(plan)) feats.push({ type: 'Feature', properties: { k: 'paved' }, geometry: { type: 'Polygon', coordinates: [pv.outer, ...pv.holes].map(r => ll(r.concat([r[0]]))) } });
  const A = accessible(plan);
  for (const a of A.stalls) feats.push({ type: 'Feature', properties: { k: 'ada', van: a.van ? 1 : 0 }, geometry: poly(a.poly) });
  for (const a of A.aisles) for (const l of [...a.lines, ...a.poly.map((p, i) => [p, a.poly[(i + 1) % a.poly.length]])]) feats.push({ type: 'Feature', properties: { k: 'mark', c: '#2f6db5', w: 1 }, geometry: { type: 'LineString', coordinates: ll(l) } });
  for (const m of [...entryMarks(plan), ...loopMarks(plan)]) feats.push({ type: 'Feature', properties: { k: 'mark', c: m.color, w: m.w > 1 ? 3 : 1 }, geometry: { type: 'LineString', coordinates: ll(m.line) } });
  for (const m of driveThruMarks(plan.elements || [])) feats.push(m.line ? { type: 'Feature', properties: { k: 'mark', c: '#1b1e1f', w: 3 }, geometry: { type: 'LineString', coordinates: ll(m.line) } } : { type: 'Feature', properties: { k: 'label', t: m.t, kind: 'drive', big: 0 }, geometry: { type: 'Point', coordinates: F.toLL(m.at) } }); // a drive-thru's pickup window and order point
  for (const [x, y, r] of d.trees) for (const [ring, b, t, c] of tree3D(x, y, r)) feats.push({ type: 'Feature', properties: { k: 'tree', b: +(b / FT).toFixed(2), h: +(t / FT).toFixed(2), c }, geometry: poly(ring) }); // 3D trees (metres)
  const fc = { type: 'FeatureCollection', features: feats }; Object.defineProperty(fc, 'keep', { value: { bad, d } }); return fc;
}

// ---------- DXF (AutoCAD R12 ASCII: opens in AutoCAD, CADCraft, LibreCAD, QCAD, BricsCAD) ----------
// Feet, origin at the plan origin (its lon/lat is written as a note on the drawing), north up.
const LAYERS = [['LOT', 7], ['SETBACK', 8], ['ZONES', 8], ['BUILDING', 1], ['PARKING', 3], ['STALLS', 9], ['DRIVE', 8], ['TRUCK', 6], ['POND', 5], ['LANDSCAPE', 82], ['AMENITY', 4], ['PLAZA', 41], ['WALK', 9], ['TREES', 3], ['TEXT', 2], ['CURB', 7], ['ADA', 5], ['MARKINGS', 2], ['TRASH', 30], ['EASEMENT', 1], ['CANOPY', 4], ['TANKS', 30]];
export function toDXF(plan, title = '') {
  const o = [], g = (c, v) => o.push(String(c), String(v));
  const num = v => (+v).toFixed(4);
  const pl = (layer, pts, closed = true) => { g(0, 'POLYLINE'); g(8, layer); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, closed ? 1 : 0); for (const [x, y] of pts) { g(0, 'VERTEX'); g(8, layer); g(10, num(x)); g(20, num(y)); g(30, 0); } g(0, 'SEQEND'); g(8, layer); };
  const line = (layer, [a, b]) => { g(0, 'LINE'); g(8, layer); g(10, num(a[0])); g(20, num(a[1])); g(30, 0); g(11, num(b[0])); g(21, num(b[1])); g(31, 0); };
  const text = (layer, [x, y], h, s, center = true, rot = 0) => { g(0, 'TEXT'); g(8, layer); g(10, num(x)); g(20, num(y)); g(30, 0); g(40, num(h)); g(1, String(s).replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7e]/g, '-')); if (rot) g(50, num(rot)); if (center) { g(72, 1); g(73, 2); g(11, num(x)); g(21, num(y)); g(31, 0); } };
  const ring = plan.ring || [], xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
  const box = ring.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : [0, 0, 100, 100];
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 2); g(9, '$EXTMIN'); g(10, num(box[0])); g(20, num(box[1])); g(9, '$EXTMAX'); g(10, num(box[2])); g(20, num(box[3])); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1); g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0); g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, LAYERS.length); for (const [n, col] of LAYERS) { g(0, 'LAYER'); g(2, n); g(70, 0); g(62, col); g(6, 'CONTINUOUS'); } g(0, 'ENDTAB'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  if (ring.length >= 3) {
    pl('LOT', ring);
    pl('SETBACK', insetRing(ring, edgeRules(ring, plan.front, plan.setbacks, plan.streets).map(r => r.build)));
  }
  const layerOf = { sign: 'AMENITY', canopy: 'CANOPY', tanks: 'TANKS', keepout: 'EASEMENT', trash: 'TRASH', garage: 'BUILDING', patio: 'PLAZA', building: 'BUILDING', parking: 'PARKING', drive: 'DRIVE', truck: 'TRUCK', pond: 'POND', green: 'LANDSCAPE', plaza: 'PLAZA', court: 'AMENITY', pool: 'AMENITY', play: 'AMENITY' };
  for (const z of (plan.zones || []).length > 1 ? plan.zones : []) if (z.ring?.length >= 3) pl('ZONES', z.ring);
  const D = details(plan); for (const w of D.walks) pl('WALK', w.poly || corners(w)); for (const i of D.islands) pl('LANDSCAPE', outline(i)); for (const q of D.pumps) pl('CANOPY', corners(q));
  for (const [x, y, r] of D.trees) { g(0, 'CIRCLE'); g(8, 'TREES'); g(10, num(x)); g(20, num(y)); g(30, 0); g(40, num(r)); }
  // the paving's outside edge as one closed curb line (and round any holes), accessible stalls and entry markings
  for (const pv of pavement(plan)) { pl('CURB', pv.outer); pv.holes.forEach(h => pl('CURB', h)); }
  const A = accessible(plan); A.stalls.forEach(a => pl('ADA', a.poly)); A.aisles.forEach(a => { pl('ADA', a.poly); a.lines.forEach(l => line('ADA', l)); });
  [...entryMarks(plan), ...loopMarks(plan)].forEach(mk => line('MARKINGS', mk.line));
  const m = metrics(plan), th = Math.max(4, Math.min(20, Math.sqrt(m.siteSf || 1e4) / 40));
  for (const e of plan.elements || []) {
    if (isRing(e)) { const r = ringOf(e); pl('DRIVE', ringDisc(r.c, r.R, 64)); pl('DRIVE', ringDisc(r.c, r.Ri, 64)); } else pl(layerOf[e.kind] || 'LANDSCAPE', outline(e)); // (a roundabout: its two circles, not its outline's seam across the lane)
    if (e.kind === 'parking') { stallLines(e).forEach(l => line('STALLS', l)); text('TEXT', [e.x, e.y], th * 0.8, stalls(e).count + ' SPACES'); }
    if (e.kind === 'building') { const L = labelOf(e, plan.program); if (L.name) text('TEXT', [e.x, e.y + th * 0.7], th, L.name.toUpperCase()); text('TEXT', [e.x, e.y - (L.name ? th * 0.7 : 0)], th * 0.8, L.size.toUpperCase()); }
    else if (e.kind === 'keepout') text('EASEMENT', [e.x, e.y], th * 0.8, ((e.name || 'Easement') + ' (drawn, not surveyed)').toUpperCase());
    else if (e.kind === 'sign') text('TEXT', [e.x, e.y], th * 0.6, (normalizeProgram(plan.program).community || 'Monument sign').toUpperCase());
    else if (e.name && !['parking', 'pond', 'drive'].includes(e.kind)) text('TEXT', [e.x, e.y], th * 0.8, e.name.toUpperCase());
    if (e.kind === 'pond') text('TEXT', [e.x, e.y], th * 0.8, (e.name || 'Detention').toUpperCase() + ' ' + (elArea(e) / 43560).toFixed(2) + ' AC');
  }
  for (const x of streetLabels(plan)) { const P = x.path, m = Math.floor((P.length - 1) / 2), a = P[m], b = P[m + 1] || P[m], c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; let r = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; if (r > 90) r -= 180; if (r < -90) r += 180; text('TEXT', c, th * 0.7, x.t.toUpperCase(), true, r); } // the street names, along their streets
  // notes block under the lot
  const lines = [title, m.acres.toFixed(2) + ' AC (' + Math.round(m.siteSf).toLocaleString('en-US') + ' SF)', 'BUILDING ' + Math.round(m.gfa).toLocaleString('en-US') + ' SF, COVERAGE ' + (m.coverage * 100).toFixed(1) + '%, FAR ' + m.far.toFixed(2),
    'PARKING ' + m.spaces + ' SPACES (' + m.required + ' REQUIRED)', 'UNITS: FEET. ORIGIN 0,0 = LON ' + plan.origin[0] + ', LAT ' + plan.origin[1] + '. NORTH IS UP.', 'PLANNING SKETCH ONLY. NOT A SURVEY OR ENGINEERED PLAN.'].filter(Boolean);
  lines.forEach((s, i) => text('TEXT', [box[0], box[1] - th * 3 - i * th * 1.8], th * 0.8, s.toUpperCase(), false));
  // north arrow
  const na = [box[2] + th * 4, box[3] - th * 6]; pl('TEXT', [[na[0], na[1] + th * 4], [na[0] - th, na[1]], [na[0] + th, na[1]]]); text('TEXT', [na[0], na[1] + th * 5.5], th, 'N');
  g(0, 'ENDSEC'); g(0, 'EOF');
  return o.join('\r\n') + '\r\n';
}

// ---------- the site and the design: a new option on the same site, and clearing one to start over ----------
// An option (a plan) holds two kinds of thing: the site (the land as it is: what any design on it starts from) and the
// design laid out on it. Every field of a plan is in one of the lists below (test/newoption.mjs checks a realistic plan
// has nothing else), so a new field has to be put in one of them on purpose.
//   site:   the outline and where it came from, the front and the street sides (found or set by hand), the setbacks,
//           the parcels, the zoning; and in the pieces, the easements / no-build areas (they describe the land) and,
//           in the Pro forma, the price of the land
//   design: every other piece, the layout's zones, its recipe and which layout it is, the last build (its request and
//           layouts), the out-of-date flag, the parking rows kept to grow back, the layout settings, the program and
//           the rest of the Pro forma's assumptions
//   own:    what the option itself is (id, name, dates) and what belongs to it whatever is drawn: its renderings (they
//           already say when the plan changed since) and how it's viewed (grid, hidden and locked layers)
export const SITE_KEYS = ['origin', 'ring', 'src', 'front', 'frontGuess', 'streets', 'streetsSet', 'streetsBy', 'setbacks', 'parcel', 'parcels', 'zoning', 'jur'];
export const DESIGN_KEYS = ['elements', 'zones', 'recipe', 'variant', 'lastRun', 'stale', 'spareRows', 'params', 'program', 'pf', 'laidAs'];
export const OWN_KEYS = ['id', 'name', 'created', 'updated', 'renders', 'view'];
export const isSitePiece = e => e?.kind === 'keepout';
export const hasDesign = plan => (plan?.elements || []).some(e => !isSitePiece(e));
const PF_LAND = ['landPrice', 'landClosingPct'];
export const DEFAULT_PROGRAM = { use: 'retail' };
const copyOf = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
// the site's part of the pieces and of the Pro forma (null when there's none)
const sitePieces = plan => copyOf((plan?.elements || []).filter(isSitePiece));
const landPf = pf => { const o = Object.fromEntries(PF_LAND.filter(k => pf?.[k] != null).map(k => [k, pf[k]])); return Object.keys(o).length ? o : null; };
// "Option C" after A and B (a gap left by a deleted option is used again only past the count); past Z, "Option 27"
export function nextOptionName(plans = []) {
  const used = new Set(plans.map(x => x.name)); for (let i = plans.length; i < 26; i++) { const n = 'Option ' + String.fromCharCode(65 + i); if (!used.has(n)) return n; }
  let k = plans.length + 1; while (used.has('Option ' + k)) k++; return 'Option ' + k;
}
// a new option on the same site with nothing laid out: the site copied (never shared), the program back to the default.
// o: { id, name, now } (the caller makes the id and picks the name, as for any new option)
// the Waller guardrails' settings (lib/guardrails.mjs: on/off, outfall, the owner's margin, a right-of-way reserve, the
// basin's depth and slopes) describe the site, not the design: a blank or cleared option keeps them; the scenario
// laid out is the design's own and goes
const siteGuard = plan => { const g = plan?.params?.guard; if (!g || typeof g !== 'object') return null; const o = copyOf(g); delete o.scenario; return Object.keys(o).length ? o : null; };
export function blankOf(plan, { id, name, now = new Date().toISOString() } = {}) {
  const out = { id, name, origin: null, ring: [], src: null, front: null, frontGuess: true, setbacks: { ...SETBACKS } };
  for (const k of SITE_KEYS) if (plan?.[k] !== undefined) out[k] = copyOf(plan[k]);
  if (out.zoning === undefined) out.zoning = null;
  out.program = { ...DEFAULT_PROGRAM }; out.elements = sitePieces(plan); const pf = landPf(plan?.pf); if (pf) out.pf = pf;
  const g = siteGuard(plan); if (g) out.params = { guard: g };
  if (plan?.stages?.site && !plan.stages.site.implied) out.stages = { site: copyOf(plan.stages.site) }; // the same site, still confirmed (lib/planstages.mjs)
  out.created = now; out.updated = now;
  return out;
}
// Clear and start over: the design taken off the option in place; the site, the name, the renderings and the view stay
export function clearDesign(plan, now = new Date().toISOString()) {
  const pf = landPf(plan.pf), keep = sitePieces(plan);
  const g = siteGuard(plan);
  for (const k of DESIGN_KEYS) delete plan[k];
  plan.elements = keep; plan.program = { ...DEFAULT_PROGRAM }; if (pf) plan.pf = pf; if (g) plan.params = { guard: g }; plan.updated = now;
  return plan;
}
// what one undo step needs to put an option back exactly as it was (all but its id, renderings and view, which Clear
// never touches and which may change after it), its fields in their order, and putting it back
const LIVE = ['id', 'renders', 'view'];
export const undoState = plan => ({ keys: Object.keys(plan), data: copyOf(Object.fromEntries(Object.entries(plan).filter(([k]) => !LIVE.includes(k)))) });
export function restoreState(plan, s) {
  const live = Object.fromEntries(LIVE.filter(k => k in plan).map(k => [k, plan[k]]));
  for (const k of Object.keys(plan)) delete plan[k];
  for (const k of s.keys) { if (LIVE.includes(k)) { if (k in live) plan[k] = live[k]; } else if (k in s.data) plan[k] = copyOf(s.data[k]); }
  for (const k of LIVE) if (k in live && !(k in plan)) plan[k] = live[k]; // (renderings made since the step: kept)
  return plan;
}

// for lib/sitecompose.mjs
export { rot as rotPt, outward as outwardOf };
