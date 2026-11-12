// Self storage laid out as the Jones Road Self Storage site plan draws it (10514 Woodedge Dr, Houston TX 77070; M Lanza
// Engineering, "Final Site Plan", Sept 23 2026, 1" = 30'). Two ways in:
//
// storageAsDrawn(ring, front)      the official plan itself, fitted onto a site that matches its surveyed boundary (the four
//                                  corners best fitted, the Woodedge frontage on the site's front): every building, the pond,
//                                  the parking, drives, walk, fence and gate where the engineer drew them. null if the site
//                                  isn't that parcel.
// storagePattern(ring, front, o)   the same arrangement on any lot wide enough: drive-up rows along both sides, an interior
//                                  building down the middle with its parking, the pond at the back, the office, its parking
//                                  and the entrance at the front, the gate between; o.buildings sets how many storage
//                                  buildings (the office not counted). null if the lot is too small.
//
// Both answer { name, elements, notes, program, setbacks } as a layout run does (src/siteplan.js quick layouts), in the
// site's own feet (x east, y north, as plan.ring). The plan was traced from the sheet rendered at 300 dpi (10 px a foot) and
// checked against every dimension string on it (docs/STORAGE-JONES-RD.md has the measurements); the numbers (unit mix,
// rentable sf, rents) are the plan's unit table and the owner's budget and pro forma.

const SF = 43560, R2D = 180 / Math.PI;
const area2 = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return s / 2; };
const ccw = r => area2(r) >= 0 ? r.slice() : r.slice().reverse();
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], dot = (a, b) => a[0] * b[0] + a[1] * b[1], len = a => Math.hypot(a[0], a[1]);
const r2 = n => Math.round(n * 100) / 100;

// ---------- the official plan, in the sheet's feet ----------
// x along the long sides toward Woodedge Drive (the front, the sheet's right edge), y across toward the east line (the
// sheet's top edge); the west line (shared with the El Shaddai church tract) is y = 0. Corners measured off the sheet:
// lines 520.97 ft (east), 523.59 ft (west), 201.53 ft (Woodedge), 201.54 ft (back) on the survey; 520.99, 523.58, 201.55
// and 201.56 ft measured.
const RING = [[0, 0], [523.58, 0], [522.59, 201.55], [1.6, 201.55]]; // counter-clockwise; edge 1 (523.58,0)-(522.59,201.55) is Woodedge Drive
const FRONT = 1;
const box = (x0, x1, y0, y1, o) => ({ x: r2((x0 + x1) / 2), y: r2((y0 + y1) / 2), w: r2(x1 - x0), d: r2(y1 - y0), rot: 0, ...o });
// the unit mix of each building as labelled on the plan; the interior building's as the plan's unit table counts it
// (the table, the budget and the pro forma agree: 221 units, 24,275 rentable sf; the drawing's labels on that building
// read (25) 10x10 and (18) 10x20 climate-controlled and (4) 5x10 non-climate, 5 units and 350 sf off the table)
const MIX = {
  b1: [['10×20', 12], ['5×5', 4]], b2: [['10×20', 11], ['10×10', 2], ['5×5', 4]], b3: [['10×20', 9], ['5×10', 8]],
  b4: [['10×15', 3], ['10×10', 2], ['5×10', 2]], b5: [['10×15', 11], ['5×5', 6]], b6: [['5×10', 30], ['5×5', 3]],
  b7: [['AC 10×10', 31], ['AC 5×10', 3], ['AC 10×20', 12], ['10×10', 18], ['10×20', 23], ['5×5', 18], ['5×10', 9]]
};
// monthly street rents by unit (the budget's leasing breakdown)
export const RENTS = { '5×5': 75, '5×10': 85, '10×10': 115, '10×15': 120, '10×20': 130, 'AC 5×10': 100, 'AC 10×10': 155, 'AC 10×20': 165 };
const unitSf = n => n.replace(/^AC /, '').split('×').reduce((a, b) => a * +b, 1);
const mixNote = m => m.map(([n, c]) => '(' + c + ') ' + n).join(', ');
const tally = m => m.reduce((s, [n, c]) => ({ units: s.units + c, sf: s.sf + c * unitSf(n), rent: s.rent + c * RENTS[n] }), { units: 0, sf: 0, rent: 0 });
function bldg(key, name, kind, geo, sf, extra = '') {
  const t = tally(MIX[key]), what = kind === 'drive' ? 'Drive-up units' : 'Interior units';
  return { kind: 'building', use: 'storage', storage: kind, floors: 1, name, sf, rentable: t.sf, storageUnits: t.units, rentMo: t.rent, mix: MIX[key].map(([n, c]) => ({ name: n, n: c })),
    note: what + ' · ' + (extra || mixNote(MIX[key])), ...(kind === 'climate' ? { nowalk: true } : {}), ...geo }; // (the interior building's walk is drawn: the plan's 5 ft along its parking)
}
// the interior building: 235 x 65 ft with a 5 ft notch in each end 25 ft from its back (where the side doors are)
const B7 = [[175.55, 81.55], [410.55, 81.55], [410.55, 111.55], [405.55, 111.55], [405.55, 121.55], [410.55, 121.55], [410.55, 146.55], [175.55, 146.55], [175.55, 121.55], [180.55, 121.55], [180.55, 111.55], [175.55, 111.55]];
// Bldg 3: an L, 60 ft along the top aisle's end and a 20 ft leg 70 ft down toward the bottom aisle
const B3 = [[435.55, 76.55], [455.55, 76.55], [455.55, 126.55], [495.55, 126.55], [495.55, 146.55], [435.55, 146.55]];
const center = P => { const n = P.length; return P.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n], [0, 0]); };
const polyEl = (P, o) => { const c = center(P), xs = P.map(p => p[0]), ys = P.map(p => p[1]); return { poly: P, x: r2(c[0]), y: r2(c[1]), w: r2(Math.max(...xs) - Math.min(...xs)), d: r2(Math.max(...ys) - Math.min(...ys)), rot: 0, ...o }; };

const ELEMENTS = [
  // drive-up rows along the east line (15 ft deep, 10 ft off the line) and the west line (20 ft deep, 10 ft off)
  bldg('b6', 'Bldg 6', 'drive', box(150.55, 280.55, 176.55, 191.55), 1950),
  bldg('b5', 'Bldg 5', 'drive', box(300.55, 420.55, 176.55, 191.55), 1800),
  bldg('b4', 'Bldg 4', 'drive', box(445.55, 495.55, 176.55, 191.55), 750),
  bldg('b1', 'Bldg 1', 'drive', box(150.55, 275.55, 9.95, 29.95), 2500),
  bldg('b2', 'Bldg 2', 'drive', box(295.55, 420.55, 9.95, 29.95), 2500),
  bldg('b3', 'Bldg 3', 'drive', polyEl(B3, {}), 2200),
  bldg('b7', 'Bldg 7', 'climate', polyEl(B7, {}), 15275, '235 × 65 ft · 114 units: 46 climate-controlled, 68 not'),
  { kind: 'building', use: 'storage', storage: 'office', floors: 1, name: 'Leasing office', sf: 750, note: 'Leasing office · 750 sf · 25 × 30 ft', ...box(472.61, 497.61, 85, 115) },
  // detention at the back: 100 x 176 ft inside its walls (17,600 sf), 104 x 180 ft outside them
  { kind: 'pond', name: 'Detention pond', note: 'Proposed pond · 17,600 sf · 100 × 176 ft inside a 2 ft wall', wall: 2, ...box(33.51, 133.51, 13.55, 189.55) },
  // parking along the interior building: 9 and 10 spaces (10 x 19 ft) either side of a 35 ft hatched loading area
  { kind: 'parking', name: '', note: '9 spaces · 10 × 19 ft', row: -1, lock: true, islands: false, caps: false, sw: 10, sd: 19, ...box(180.55, 270.55, 57.55, 76.55) },
  { kind: 'plaza', name: 'Loading zone', note: 'Hatched loading area at the interior building’s door · 35 × 19 ft', ...box(270.55, 305.55, 57.55, 76.55) },
  { kind: 'parking', name: '', note: '10 spaces · 10 × 19 ft', row: -1, lock: true, islands: false, caps: false, sw: 10, sd: 19, ...box(305.55, 405.55, 57.55, 76.55) },
  { kind: 'plaza', name: 'Walk', note: '5 ft walk along the interior building', ...box(180.55, 405.55, 76.55, 81.55) },
  // the office's lot outside the gate: two rows of 5 spaces either side of its aisle
  { kind: 'parking', name: '', note: 'Office parking · 5 spaces', row: -1, lock: true, islands: false, caps: false, sw: 9.1, sd: 19, ...box(468.3, 513.8, 61, 80) },
  { kind: 'parking', name: '', note: 'Office parking · 5 spaces', row: 1, lock: true, islands: false, caps: false, sw: 9.1, sd: 19, ...box(468.3, 513.8, 7, 26) },
  // the drives: a 30 ft aisle along the east row, 27.5 ft along the west row, 25 ft at the back and between the interior
  // building and Bldg 3, a 20 ft paved strip past Bldg 4 and the gaps between the east row's buildings
  { kind: 'drive', name: '', note: '30 ft drive aisle', ...box(150.1, 515.5, 146.55, 176.55) },
  { kind: 'drive', name: '', note: '25 ft drive aisle', ...box(150.1, 175.55, 57.55, 146.55) },
  { kind: 'drive', name: '', note: '27.5 ft drive aisle', ...box(150.1, 440.4, 29.95, 57.55) },
  { kind: 'drive', name: '', note: '25 ft drive aisle', ...box(410.55, 435.55, 76.55, 146.55) },
  { kind: 'drive', name: '', note: 'Drive at the interior building’s end', ...box(405.55, 440.4, 57.55, 76.55) },
  { kind: 'drive', name: '', note: 'Paved strip past Bldg 4', ...box(495.55, 515.5, 176.55, 191.55) },
  { kind: 'drive', name: '', note: 'Paved strip past Bldg 4', ...box(495.55, 515.5, 126.55, 146.55) },
  { kind: 'drive', name: '', note: 'Paved gap between buildings', ...box(280.55, 300.55, 176.55, 191.55) },
  { kind: 'drive', name: '', note: 'Paved gap between buildings', ...box(420.55, 445.55, 176.55, 191.55) },
  { kind: 'drive', name: '', note: 'Paved gap between buildings', ...box(275.55, 295.55, 9.95, 29.95) },
  { kind: 'drive', name: '', note: 'Office drive aisle', ...box(440.4, 513.8, 26, 61) }
];
// the 36 ft entrance from Woodedge Drive (its curb returns at y 25.55 and 61.55), to the property line
const ENTRANCE = { lo: 25.55, hi: 61.55, from: 513.8 };
// the security fence: on the property line round the back three sides, across the site 82.7 ft back from Woodedge (the
// keypad gate across the 27.5 ft aisle), round the office's lot and back out to Woodedge past the office
const FENCE = { cross: 440.4, gate: [31.05, 52.85], jog: [[440.4, 70.65], [466.46, 70.65], [466.46, 120.95]] };
// the setbacks the plan keeps (no zoning in unincorporated Harris County): buildings 25 ft from Woodedge, 9.95 ft from
// the side lines; paving to 7 ft of the west line and 7.6 ft of Woodedge
const SETBACKS_DRAWN = { front: 25, side: 9.5, rear: 20, paving: 5, paveFront: 5, paveSide: 5, paveRear: 5 };

// the plan's numbers: totals from the unit table, rents from the budget's leasing breakdown, and the owner's budget and
// pro forma for reference (the feasibility study's own assumptions are set on the project)
const ALL = Object.values(MIX).map(tally), DRIVE = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map(k => tally(MIX[k])), B7T = tally(MIX.b7);
const sumOf = (L, k) => L.reduce((s, t) => s + t[k], 0);
export const JONES_RD = {
  id: 'jones-rd', label: 'Jones Road Self Storage', address: '10514 Woodedge Dr, Houston, TX 77070', apn: '0460430000203', county: 'Harris',
  source: 'M Lanza Engineering, Final Site Plan, Jones Road Self Storage, Sept 23 2026 (1" = 30\')', survey: 'Precision Surveyors, Tract 1: 2.4163 acres (W. H. York Survey, A-943)',
  ring: RING, front: FRONT, acres: 2.4163,
  units: sumOf(ALL, 'units'), rentableSf: sumOf(ALL, 'sf'), rentMo: sumOf(ALL, 'rent'), grossSf: 26975, officeSf: 750, buildingSf: 27725,
  parking: 29, pondSf: 17600,
  budget: { hard: 1898401, soft: 84173, land: 600000, developerFee: 10000, marketing: 5000, closing: 70134, total: 2667708, hardPsf: 68.47 },
  proforma: { pri: 302820, vacancyPct: 10, opexPct: 30, noi1: 190777, exitCap: 7, loan: 1818302, rate: 6.5, amortYears: 25, ltv: 70, equityIrr10: 14.74, propertyIrr10: 10.03 }
};
// the program a storage layout from this plan carries: the plan's unit mixes, rentable shares and rents a sf
const mixPct = keys => { const c = {}; for (const k of keys) for (const [n, m] of MIX[k]) { const nm = n.replace(/^AC /, ''); c[nm] = (c[nm] || 0) + m; } return Object.entries(c).map(([name, n]) => ({ name, sf: unitSf(name), pct: n })); };
export const JONES_STORAGE = {
  climateEff: +(B7T.sf / 15275).toFixed(6), driveEff: +(sumOf(DRIVE, 'sf') / 11700).toFixed(6),
  rent: { climate: +(B7T.rent / B7T.sf).toFixed(6), drive: +(sumOf(DRIVE, 'rent') / sumOf(DRIVE, 'sf')).toFixed(6) },
  climateMix: mixPct(['b7']), driveMix: mixPct(['b1', 'b2', 'b3', 'b4', 'b5', 'b6']), officeSf: 750, rowD: 20, aisle: 30, fence: true
};
const programOf = (climateSf, driveSf) => ({ use: 'storage', floors: 1, storage: { ...JONES_STORAGE, climateSf: Math.round(climateSf), driveSf: Math.round(driveSf) } });

// ---------- placing sheet geometry on a site ----------
// T: sheet feet -> site feet, a rotation by `a` (radians) and a shift
const mk = (a, t) => ({ a, t, p: q => [q[0] * Math.cos(a) - q[1] * Math.sin(a) + t[0], q[0] * Math.sin(a) + q[1] * Math.cos(a) + t[1]] });
// (drives and walks are pulled back 0.05 ft, half an inch, from what they meet: a shared edge turned to the site's angle
// reads as crossing a building's outline by a few thousandths of a foot)
const GAP = 0.05;
function place(e, T) {
  const o = { ...e }, deg = T.a * R2D;
  if ((o.kind === 'drive' || o.kind === 'plaza') && !o.poly && o.w > 1 && o.d > 1) { o.w = r2(o.w - 2 * GAP); o.d = r2(o.d - 2 * GAP); }
  if (o.poly) o.poly = o.poly.map(T.p).map(q => q.map(r2));
  if (o.path) o.path = o.path.map(T.p).map(q => q.map(r2));
  if (o.x != null) { const c = T.p([e.x, e.y]); o.x = r2(c[0]); o.y = r2(c[1]); o.rot = r2(((e.rot || 0) + deg) % 360); }
  return o;
}
// the best rotation and shift putting points A on points B (least squares, no mirror, no scale)
function fit(A, B) {
  const n = A.length, ca = center(A), cb = center(B); let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { const a = sub(A[i], ca), b = sub(B[i], cb); sxx += a[0] * b[0] + a[1] * b[1]; sxy += a[0] * b[1] - a[1] * b[0]; }
  const a = Math.atan2(sxy, sxx), c = Math.cos(a), s = Math.sin(a), T = mk(a, [cb[0] - (ca[0] * c - ca[1] * s), cb[1] - (ca[0] * s + ca[1] * c)]);
  const rms = Math.sqrt(A.reduce((t, p, i) => t + len(sub(T.p(p), B[i])) ** 2, 0) / n);
  return { ...T, rms };
}
// a ring's corners: vertices where it turns by more than `deg` (a county outline's extra points along a straight line dropped)
function cornersOf(r, deg = 4) {
  const n = r.length, keep = [];
  for (let i = 0; i < n; i++) { const a = r[(i - 1 + n) % n], b = r[i], c = r[(i + 1) % n], u = sub(b, a), v = sub(c, b), lu = len(u), lv = len(v); if (lu < 0.5 || lv < 0.5) continue; const t = Math.acos(Math.max(-1, Math.min(1, dot(u, v) / lu / lv))) * R2D; if (t > deg) keep.push(i); }
  return keep;
}
// where the ray from p along d first meets the ring: { pt, edge }
function hit(r, p, d) {
  let best = null;
  for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], e = sub(b, a), den = d[0] * e[1] - d[1] * e[0]; if (Math.abs(den) < 1e-9) continue; const w = sub(a, p), t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * d[1] - w[1] * d[0]) / den; if (t > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9 && (!best || t < best.t)) best = { t, pt: [p[0] + d[0] * t, p[1] + d[1] * t], edge: i }; }
  return best;
}
// the inset ring: each side moved in by d (a convex or near-convex lot)
function inset(r, d) {
  const n = r.length, L = r.map((a, i) => { const b = r[(i + 1) % n], e = sub(b, a), l = len(e) || 1, nn = [-e[1] / l, e[0] / l]; return { a: [a[0] + nn[0] * d, a[1] + nn[1] * d], e }; });
  return L.map((l, i) => { const m = L[(i - 1 + n) % n], den = m.e[0] * l.e[1] - m.e[1] * l.e[0]; if (Math.abs(den) < 1e-9) return l.a; const w = sub(l.a, m.a), t = (w[0] * l.e[1] - w[1] * l.e[0]) / den; return [m.a[0] + m.e[0] * t, m.a[1] + m.e[1] * t]; });
}
// the fence: from the gate's top up the jog to the front line, round the property line (1 ft inside it: the fence's own width stays on the lot) the long way
// past the back to the crossing line, back up to the gate's bottom; and the gate. Points in sheet feet but the ends,
// which meet the site's own lines.
function fenceOf(siteRing, T, F) {
  const r = inset(ccw(siteRing), 1), dirX = sub(T.p([1, 0]), T.p([0, 0])), dirY = sub(T.p([0, 1]), T.p([0, 0]));
  const j = F.jog.map(T.p), A = hit(r, j[j.length - 1], dirX), g0 = T.p([F.cross, F.gate[0]]), B = hit(r, g0, [-dirY[0], -dirY[1]]);
  if (!A || !B) return [];
  const path = [T.p([F.cross, F.gate[1]]), ...j, A.pt], n = r.length;
  for (let k = (A.edge + 1) % n, guard = 0; guard <= n; k = (k + 1) % n, guard++) { path.push(r[k]); if (k === B.edge) break; }
  path.push(B.pt, g0);
  return [
    { kind: 'fence', path: path.map(q => q.map(r2)), width: 1.5, r: 0, name: '', note: 'Security fence' },
    { kind: 'fence', gate: true, path: [g0, T.p([F.cross, F.gate[1]])].map(q => q.map(r2)), width: 3, r: 0, name: 'Entry gate', note: 'Keypad gate across the drive' }
  ];
}
// the entrance: a band from `from` (sheet x) out to the site's front line between y lo and hi
function entranceOf(siteRing, T, E, note) {
  const r = ccw(siteRing), dirX = sub(T.p([1, 0]), T.p([0, 0])), a = T.p([E.from + GAP, E.lo + GAP]), b = T.p([E.from + GAP, E.hi - GAP]), ha = hit(r, a, dirX), hb = hit(r, b, dirX);
  if (!ha || !hb) return null;
  return polyEl([a, ha.pt, hb.pt, b].map(q => q.map(r2)), { kind: 'drive', name: 'Entrance', note });
}

// ---------- the official plan on its site ----------
// The site's corners (four) matched to the plan's, the plan's Woodedge frontage on the site's front edge (or, when the
// front street is set on another side, on whichever side fits); the plan is put down by the best rotation and shift.
// tol: how far (ft, root mean square over the corners) the site may differ from the survey: the county's outline of this
// parcel is about 9 ft shorter and 2 ft narrower than the survey, so 10 ft.
export function storageAsDrawn(ring, front = null, { tol = 10 } = {}) {
  if (!Array.isArray(ring) || ring.length < 4) return null;
  const r = ccw(ring), flip = area2(ring) < 0, n0 = ring.length, ks = cornersOf(r); if (ks.length !== 4) return null;
  const C = ks.map(i => r[i]);
  // the side of the corners' ring that holds the front edge's middle
  const fr = front == null ? null : (() => { const i = flip ? (n0 - 2 - front + n0) % n0 : front, a = r[i], b = r[(i + 1) % n0], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; let best = -1, bd = Infinity; for (let k = 0; k < 4; k++) { const p = C[k], q = C[(k + 1) % 4], e = sub(q, p), t = Math.max(0, Math.min(1, dot(sub(m, p), e) / dot(e, e))), dd = len(sub(m, [p[0] + e[0] * t, p[1] + e[1] * t])); if (dd < bd) { bd = dd; best = k; } } return best; })();
  const tries = (fr == null ? [0, 1, 2, 3] : [fr, ...[0, 1, 2, 3].filter(k => k !== fr)]).map(k => { const B = [0, 1, 2, 3].map(i => C[(k - FRONT + i + 4) % 4]); return { k, T: fit(RING, B) }; });
  const ok = tries.filter(t => t.T.rms <= tol), pick = fr != null && ok.find(t => t.k === fr) || ok.sort((a, b) => a.T.rms - b.T.rms)[0];
  if (!pick) return null;
  const T = pick.T, notes = [], C4 = [0, 1, 2, 3].map(i => C[(pick.k - FRONT + i + 4) % 4]), dev = Math.max(...RING.map((p, i) => len(sub(T.p(p), C4[i])))), cut = dev > 1 ? Math.ceil(dev) : 0;
  const els = ELEMENTS.map(e => place(e, T));
  const ent = entranceOf(ring, T, ENTRANCE, '36 ft entrance from Woodedge Drive'); if (ent) els.push(ent);
  els.push(...fenceOf(ring, T, FENCE));
  notes.push('The official Jones Road Self Storage site plan as drawn (M Lanza Engineering, Sept 23 2026): 7 storage buildings, 26,975 sf, and a 750 sf office; 221 units, 24,275 rentable sf; 29 parking spaces; a 17,600 sf pond.');
  notes.push('Unit counts follow the plan’s unit table (as the budget and pro forma do). The labels drawn on Bldg 7 read (25) 10×10 and (18) 10×20 climate-controlled and (4) 5×10 non-climate, which is 5 units and 350 sf off the table.');
  if (cut) notes.push('The site outline differs from the survey by up to ' + cut + ' ft at the corners (the county’s parcel outline is rougher than the survey): the plan is placed by the best fit of the corners and keeps the survey’s dimensions, and its setbacks are read ' + cut + ' ft looser to allow for it. Set the site boundary to the survey to check them exactly.');
  if (fr != null && pick.k !== fr) notes.push('The site’s front street is set on another side: the plan is placed with its entrance on the side that matches Woodedge Drive.');
  return { name: 'Official site plan (as drawn)', arr: 'Official site plan (as drawn)', elements: els, notes, program: programOf(15275, 11700), setbacks: Object.fromEntries(Object.entries(SETBACKS_DRAWN).map(([k, v]) => [k, Math.max(0, v - cut)])), asDrawn: JONES_RD.id, fitFt: +T.rms.toFixed(2), score: 1 };
}

// ---------- the same arrangement on another lot ----------
// Bands across the lot (from its left side, standing on the street looking in), as the plan's: 10 ft of landscape, a
// 20 ft drive-up row, a 27.5 ft aisle, the interior building's parking (19 ft) and walk (5 ft), the interior building
// (65 ft deep), a 30 ft aisle, then for a wider lot a back-to-back row (40 ft) and a 30 ft aisle as often as they fit,
// and a 15 ft drive-up row and landscape. Along the lot from the street: the office 25.5 ft back, its parking and the
// gate 82.7 ft back, the rows to the pond at the back (a sixth of the site, as the plan's). A lot narrower than the
// interior building's bands gets rows and aisles only.
const SEC = { row1: 20, aisle1: 27.5, park: 19, walk: 5, inner: 65, aisle2: 30, dbl: 40, row2: 15, side: 10, narrowAisle: 30 };
const POND_SHARE = 17600 / (JONES_RD.acres * SF), REAR = 30.7, POND_GAP = 15;
// the lot's frame: x toward the street (out through the front edge), y across; aligned with the sides beside the front
// when they run square to it (within 10°), as the plan's are
function frameOf(r, f) {
  const n = r.length, a = r[f], b = r[(f + 1) % n], e = sub(b, a), l = len(e), u = [e[0] / l, e[1] / l], out = [u[1], -u[0]]; // (ccw ring: outward is the right of the edge)
  const side = (i, j) => { const d = sub(r[j], r[i]), dl = len(d); return [d[0] / dl, d[1] / dl]; };
  const s1 = side((f + 2) % n, (f + 1) % n), s2 = side((f - 1 + n) % n, f), sq = s => Math.acos(Math.max(-1, Math.min(1, dot(s, out)))) * R2D < 10;
  let x = out; if (sq(s1) && sq(s2)) { const m = [s1[0] + s2[0], s1[1] + s2[1]], ml = len(m); x = [m[0] / ml, m[1] / ml]; } else if (sq(s1)) x = s1; else if (sq(s2)) x = s2;
  return { x, y: [-x[1], x[0]] };
}
// the biggest rectangle in the lot (in the frame): scan lines across every half foot, then each side pushed out to where
// the lot's outline really is (to a hundredth of a foot)
function rectIn(r, F) {
  const P = r.map(p => [dot(p, F.x), dot(p, F.y)]), ys = P.map(p => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const at = y => { const xs = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); } xs.sort((p, q) => p - q); let lo = null, hi = null; for (let k = 0; k + 1 < xs.length; k += 2) if (hi == null || xs[k + 1] - xs[k] > hi - lo) { lo = xs[k]; hi = xs[k + 1]; } return { lo, hi }; };
  const lines = []; for (let y = y0 + 0.25; y < y1; y += 0.5) lines.push({ y, ...at(y) });
  let best = null;
  for (let i = 0; i < lines.length; i++) { let lo = -Infinity, hi = Infinity; for (let j = i; j < lines.length; j++) { if (lines[j].lo == null) break; lo = Math.max(lo, lines[j].lo); hi = Math.min(hi, lines[j].hi); const W = lines[j].y - lines[i].y, D = hi - lo; if (D <= 0) break; if (W >= 90 && D >= 200 && (!best || W * D > best.W * best.D)) best = { W, D, x0: lo, ya: lines[i].y, yb: lines[j].y }; } }
  if (!best) return null;
  const holds = y => { const q = at(y); return q.lo != null && q.lo <= best.x0 + 1e-6 && q.hi >= best.x0 + best.D - 1e-6; };
  let ya = best.ya, yb = best.yb; for (let s = 0.25; s > 0.005; s /= 2) { if (holds(ya - s)) ya -= s; if (holds(yb + s)) yb += s; }
  return { W: yb - ya, D: best.D, x0: best.x0, y0: ya };
}
// a row of length L split into n buildings with gaps of about `gap`, lengths whole 5 ft
function split(x0, x1, n, gap) {
  const L = x1 - x0; n = Math.max(1, Math.min(n, Math.floor((L + gap) / (40 + gap)))); if (n < 1 || L < 40) return [];
  const piece = Math.floor((L - (n - 1) * gap) / n / 5) * 5, g = n > 1 ? (L - n * piece) / (n - 1) : 0;
  return Array.from({ length: n }, (_, i) => [x0 + i * (piece + g), x0 + i * (piece + g) + piece]);
}
// counts for the rows by their length (the largest remainders), at least one each
function share(n, lens) {
  const tot = lens.reduce((s, l) => s + l, 0), raw = lens.map(l => Math.max(1, n * l / tot)), out = raw.map(Math.floor);
  let left = n - out.reduce((s, k) => s + k, 0); const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length, left--) out[order[k][1]]++;
  return out;
}
export function storagePattern(ring, front = 0, { buildings = 0 } = {}) {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  const flip = area2(ring) < 0, r = ccw(ring), n0 = ring.length, f = flip ? (n0 - 2 - front + n0) % n0 : front, F = frameOf(r, f), R = rectIn(r, F); if (!R) return null;
  const siteSf = Math.abs(area2(ring)), W = R.W, D = R.D, wide = W >= SEC.side * 2 + 181.5 - 10, notes = [];
  // sheet -> site: sheet x along F.x from the rectangle's back, sheet y along F.y from its left side
  const o = [F.x[0] * R.x0 + F.y[0] * R.y0, F.x[1] * R.x0 + F.y[1] * R.y0], T = mk(Math.atan2(F.x[1], F.x[0]), o);
  const k = wide ? Math.max(0, Math.floor((W - 201.5) / 70)) : Math.max(0, Math.floor((W - 90) / 70));
  const m = wide ? (W - 181.5 - 70 * k) / 2 : (W - 70 - 20 - 70 * k) / 2; if (m < 5) return null;
  // along the lot (sheet x, the street at x = D): the pond at the back, the rows from it to the front zone
  const pondW = W - 2 * m - 5.6, pondIn = Math.max(40, Math.min(D * 0.35, POND_SHARE * siteSf / Math.max(40, pondW))), xPond = REAR + 2, xRows = xPond + pondIn + 2 + POND_GAP;
  const xRowEnd = D - 102.55, xTopEnd = D - 27.55; if (xRowEnd - xRows < 80) return null;
  const els = [], rows = [], drive = (x0, x1, y0, y1, note) => { if (x1 - x0 > 1 && y1 - y0 > 1) els.push({ kind: 'drive', name: '', note, ...box(x0, x1, y0, y1) }); };
  els.push({ kind: 'pond', name: 'Detention pond', wall: 2, note: 'Detention · ' + Math.round(pondIn * pondW).toLocaleString('en-US') + ' sf, a sixth of the site as the Jones Road plan', ...box(xPond, xPond + pondIn, m + 3.6, m + 3.6 + pondW) });
  const yB0 = m, yB1 = m + SEC.row1; let y = yB1, climate = 0, inner = null, L = null;
  if (wide) {
    const yA1 = y + SEC.aisle1, yP1 = yA1 + SEC.park, yW1 = yP1 + SEC.walk, yI1 = yW1 + SEC.inner, yT1 = yI1 + SEC.aisle2;
    const xI0 = xRows + 25, xI1 = D - 112.55;
    inner = { kind: 'building', use: 'storage', storage: 'climate', floors: 1, name: '', nowalk: true, ...box(xI0, xI1, yW1, yI1) }; climate = inner.w * inner.d;
    inner.note = 'Interior units · ' + Math.round(inner.w) + ' × 65 ft';
    els.push(inner);
    const pL = Math.max(0, xI1 - xI0 - 10), pMid = xI0 + 5 + pL / 2, load = pL > 120 ? 35 : 0, pa = [xI0 + 5, pMid - load / 2], pb = [pMid + load / 2, xI1 - 5];
    for (const [a, b] of [pa, pb]) { const n = Math.floor((b - a) / 10); if (n >= 2) els.push({ kind: 'parking', name: '', note: n + ' spaces · 10 × 19 ft', row: -1, lock: true, islands: false, caps: false, sw: 10, sd: 19, ...box(a, a + n * 10, yA1, yP1) }); }
    if (load) els.push({ kind: 'plaza', name: 'Loading zone', note: 'Loading area at the interior building’s door · 35 × 19 ft', ...box(pa[1], pb[0], yA1, yP1) });
    els.push({ kind: 'plaza', name: 'Walk', note: '5 ft walk along the interior building', ...box(xI0 + 5, xI1 - 5, yP1, yW1) });
    drive(xRows - 0.45, xI0, yA1, yI1, '25 ft drive aisle'); drive(xRows - 0.45, D - 82.7, yB1, yA1, '27.5 ft drive aisle'); drive(xI1, D - 82.7, yA1, yP1, 'Drive at the interior building’s end');
    // Bldg 3's L at the interior building's front end, across a 25 ft aisle
    const xL0 = D - 87.55, xL1 = xTopEnd; if (xL0 > xI1 + 20) { L = polyEl([[xL0, yI1 - 70], [xL0 + 20, yI1 - 70], [xL0 + 20, yI1 - 20], [xL1, yI1 - 20], [xL1, yI1], [xL0, yI1]], { kind: 'building', use: 'storage', storage: 'drive', floors: 1, name: '' }); drive(xI1, xL0, yP1, yI1, '25 ft drive aisle'); }
    drive(xRows - 0.45, D - 7.6, yI1, yT1, '30 ft drive aisle');
    y = yT1;
  } else { drive(xRows - 0.45, D - 82.7, y, y + SEC.narrowAisle, '30 ft drive aisle'); y += SEC.narrowAisle; }
  for (let i = 0; i < k; i++) { rows.push({ x0: xRows, x1: xRowEnd, y0: y, y1: y + SEC.dbl, deep: 40 }); drive(xRows - 0.45, D - 7.6, y + SEC.dbl, y + SEC.dbl + 30, '30 ft drive aisle'); y += SEC.dbl + 30; }
  const top = wide ? SEC.row2 : SEC.row1;
  rows.unshift({ x0: xRows, x1: xRowEnd, y0: yB0, y1: yB1, deep: SEC.row1 });
  rows.push({ x0: xRows, x1: wide ? xTopEnd : xRowEnd, y0: y, y1: y + top, deep: top });
  if (wide) drive(xTopEnd, D - 7.6, y, y + top, 'Paved strip past the row');
  // how many buildings: the interior building and the L are one each; the rows share the rest by length
  let want = +buildings > 0 ? Math.round(+buildings) : 0;
  if (want && L && want < (inner ? 1 : 0) + 1 + rows.length) L = null; // (fewer buildings asked than the rows, the interior building and the L: the L's corner stays paved)
  const fixed = (inner ? 1 : 0) + (L ? 1 : 0), lens = rows.map(q => q.x1 - q.x0);
  if (want && want < fixed + rows.length) { notes.push('At least ' + (fixed + rows.length) + ' buildings on this lot (one a row' + (fixed ? ', the interior building' + (L ? ' and the L' : '') : '') + '): laid out with ' + (fixed + rows.length) + '.'); want = fixed + rows.length; }
  const per = want ? share(want - fixed, lens) : rows.map((q, i) => Math.max(1, Math.round(lens[i] / (i === rows.length - 1 && wide ? 115 : 135))));
  let made = 0;
  rows.forEach((q, i) => { const gap = i === 0 ? 20 : 22.5; split(q.x0, q.x1, per[i], gap).forEach(([a, b], j, arr) => { els.push({ kind: 'building', use: 'storage', storage: 'drive', floors: 1, name: '', note: 'Drive-up units · ' + q.deep + ' ft deep', ...box(a, b, q.y0, q.y1) }); made++; if (j < arr.length - 1) drive(b, arr[j + 1][0], q.y0, q.y1, 'Paved gap between buildings'); }); });
  if (want && made + fixed < want) notes.push('Room for ' + (made + fixed) + ' buildings at the plan’s sizes (40 ft or longer): laid out with ' + (made + fixed) + '.');
  if (L) { L.note = 'Drive-up units · 2,200 sf'; els.push(L); }
  // the front: the office 25.5 ft from the street, its parking (two rows of 5) and drive, the entrance and the gate
  const yo = wide ? m + 75.05 : Math.min(W - m - 30, m + 75.05);
  els.push({ kind: 'building', use: 'storage', storage: 'office', floors: 1, name: 'Leasing office', sf: 750, note: 'Leasing office · 750 sf · 25 × 30 ft', ...box(D - 50.5, D - 25.5, yo, yo + 30) });
  els.push({ kind: 'parking', name: '', note: 'Office parking · 5 spaces', row: -1, lock: true, islands: false, caps: false, sw: 9.1, sd: 19, ...box(D - 54.8, D - 9.3, m + 51.05, m + 70.05) });
  els.push({ kind: 'parking', name: '', note: 'Office parking · 5 spaces', row: 1, lock: true, islands: false, caps: false, sw: 9.1, sd: 19, ...box(D - 54.8, D - 9.3, m - 2.95, m + 16.05) });
  drive(D - 82.7, D - 9.3, m + 16.05, m + 51.05, 'Office drive aisle');
  // names as the plan's: Bldg 1, 2 ... along the left row from the back, the L, the other rows from the street back,
  // the interior building last
  const rowEls = els.filter(e => e.kind === 'building' && e.storage === 'drive' && e !== L), leftRow = rowEls.filter(e => Math.abs(e.y - (yB0 + yB1) / 2) < 0.5).sort((a, b) => a.x - b.x), others = rowEls.filter(e => !leftRow.includes(e)).sort((a, b) => a.y - b.y || b.x - a.x);
  let nb = 0; for (const e of [...leftRow, ...(L ? [L] : []), ...others, ...(inner ? [inner] : [])]) e.name = 'Bldg ' + ++nb;
  const placed = els.map(e => place(e, T)), B = els.filter(e => e.kind === 'building' && e.use === 'storage');
  const area = e => e.sf ?? (e.poly ? Math.abs(area2(e.poly)) : e.w * e.d), drv = B.filter(e => e.storage === 'drive').reduce((s, e) => s + area(e), 0);
  const ent = entranceOf(ring, T, { lo: m + 15.6, hi: m + 51.6, from: D - 9.3 }, '36 ft entrance'); if (ent) placed.push(ent); // (these two are worked out in the site's own feet)
  placed.push(...fenceOf(ring, T, { cross: D - 82.7, gate: [m + 21.1, m + 42.9], jog: [[D - 82.7, m + 60.7], [D - 56.64, m + 60.7], [D - 56.64, Math.min(W - m - 1, m + 111)]] }));
  notes.unshift('Laid out as the Jones Road Self Storage plan: ' + nb + ' storage buildings (' + Math.round(drv + climate).toLocaleString('en-US') + ' sf) and a 750 sf office, drive-up rows round ' + (inner ? 'an interior building' : 'the aisles') + ', the pond at the back, the office and gate at the street. Unit mix, rentable shares and rents are the Jones Road plan’s.');
  return { name: 'Jones Road pattern', arr: 'Jones Road pattern' + (+buildings > 0 ? ', ' + nb + ' buildings' : ''), elements: placed, notes, program: programOf(climate, drv), setbacks: { ...SETBACKS_DRAWN }, score: 0.9 };
}

// a quick layout's storage template (lib/quicklayouts.mjs): 'asdrawn' the official plan on its own site, 'pattern' the
// same arrangement on this lot with `buildings` storage buildings (0: as many as the plan's spacing gives)
export const storageQuick = (ring, front, { template, buildings = 0 } = {}) => template === 'asdrawn' ? storageAsDrawn(ring, front) : template === 'pattern' ? storagePattern(ring, front, { buildings }) : null;
