// Rule-based building designs for plan sets (lib/plandesign.mjs fallbackDesign): the plans an architect would sketch
// first for each use, laid out from the footprint and the program, in the raw shape Claude answers in (rooms as
// rectangles, doors between room ids, windows by side). They are the seed Claude is shown, the fallback when its answers
// keep failing the checks, and what a set made without Claude draws, so they have to pass every check in placeDesign,
// the program checks included: the right number of bedrooms and baths, a closet for every bedroom, no oversized halls or
// entries, restrooms that are really restrooms, a restaurant with a kitchen, walk-in, dry storage and two restrooms.
//
// Coordinates are the type's: x from the left end (0) to W as seen from the street, y from the front wall (0) to D.
// Homes: three archetypes. A `ranch` (one story, 44 ft and wider): garage and primary suite down the left, foyer, dining
// or a fourth bedroom, kitchen and living through the middle, a hall with the other bedrooms and their bath on the right.
// A `wide two-story` (44 ft and wider): the ranch's first floor with the stair off the foyer, bedrooms over the main body
// (the garage and the primary suite stay one story). A `rowhouse` (narrower, townhomes, duplex units, cottages, one to
// three floors): garage and foyer at the front, kitchen and living behind, bedrooms behind (one story) or upstairs.
const r2 = v => Math.round((+v || 0) * 2) / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const RES = ['sfr', 'townhomes', 'duplex'];

// the program of a home from its size: bedrooms, full baths, a powder room
export function homeProgram(t) {
  const sf = t.unitGsf || t.W * t.D * (t.floors || 1), tiny = sf < 900;
  const beds = tiny ? 1 : sf < 1500 ? 2 : sf < 2200 ? 3 : sf < 3200 ? 4 : 5;
  const baths = tiny ? 1 : beds <= 2 ? 2 : beds === 3 ? 2 : beds === 4 ? 3 : 3;
  const half = !tiny && sf >= 1700 ? 1 : 0;
  return { sf, tiny, beds, baths, half, garage: t.garage || 0 };
}

// a small builder: rooms, doors and windows in the raw design shape
function builder() {
  const rooms = [], doors = [], windows = [], ids = new Set();
  const room = (id, name, type, floor, x, y, w, d) => {
    let k = id; while (ids.has(k)) k += '_'; ids.add(k);
    rooms.push({ id: k, name, type, floor, x: r2(x), y: r2(y), w: r2(w), d: r2(d) }); return k;
  };
  const door = (a, b, width = 3, kind = 'swing', side = 'any') => { doors.push({ a, b, width, kind, side }); };
  const win = (room, side, count = 1, width = 3, height = 5) => { windows.push({ room, side, count, width, height }); };
  return { rooms, doors, windows, room, door, win, has: id => ids.has(id), raw: () => ({ rooms, doors, windows }) };
}
const resSkin = (t, two) => ({
  roof: { type: 'gable', pitch: 6, ridge: 'along_front', overhang: 1.5 },
  exterior: { walls: two ? 'Brick veneer at the first floor, fiber cement lap siding above' : 'Brick veneer with fiber cement siding at gables', accent: 'Painted trim, board-and-batten accents', roofing: 'Architectural asphalt shingles, 30-year', windows: 'White vinyl single-hung, low-E, insulated', doors: 'Fiberglass entry door, insulated steel garage door' },
  systems: { structure: 'Wood frame, 2x4 / 2x6 studs at 16", engineered roof trusses at 24"', foundation: 'Post-tensioned slab on grade', hvac: 'split_system', water_heater: 'tankless_gas', sprinklered: !!t.sprinklered, fire_alarm: false }
});

// ---------- the ranch: one story (or the first floor of a wide two-story), 44 ft and wider ----------
// -> raw design, or null when the footprint can't take it (then the rowhouse plan is used)
export function ranchDesign(t, P = homeProgram(t)) {
  const W = t.W, D = t.D, F = t.floors || 1; if (W < 44 || D < 39) return null;
  const B = builder(), { room, door, win } = B, side = !t.attached, two = F >= 2;
  // the garage strip
  let g = P.garage, gw = g >= 3 && W >= 64 ? 31 : g >= 2 ? 21 : g >= 1 ? 12 : 0; if (g >= 3 && gw < 31) g = 2;
  if (gw === 21 && W - 21 < 31) gw = 20; if (gw === 20 && W - 20 < 29) { gw = 12; g = 1; } if (gw === 12 && W - 12 < 29) { gw = 0; g = 0; }
  const gd = D >= 46 ? 22 : 20, mw = gw && W - gw - 6 >= 31 ? 6 : 0, ls = !gw && W >= 48 ? r2(clamp(W - 4 - 13.5 - 22, 13, 18)) : 0, c0 = gw + mw + ls; // ls: a suite strip when there is no garage
  // the wing and the core
  let bw = clamp((W - c0) * 0.4, 11, 13.5), wc = W - c0 - 4 - bw; if (wc < 15) { bw = Math.max(11, W - c0 - 4 - 15); wc = W - c0 - 4 - bw; } if (wc < 14) return null;
  bw = r2(bw); wc = r2(W - c0 - 4 - bw); const x0 = c0 + wc; // the hall is x0..x0+4
  const fd = 12; // the front row: foyer and the dining room or fourth bedroom
  // behind the garage: the primary suite (bath and walk-in closet, then the bedroom) when the house is deep enough;
  // without the mud column the laundry and a mud hall come first
  const primaryBack = (gw > 0 && D - gd >= 20 && c0 >= 12) || ls > 0;
  if (ls) { const pd = Math.min(18, D - 16), top = D - pd - 16; if (top >= 8) { room('study', ls * top > 300 ? 'Sitting room' : 'Study', ls * top > 300 ? 'family' : 'office', 1, 0, 0, ls, top); door('kitchen', 'study', 3); win('study', 'front', 1, 3, 5); if (side) win('study', 'left', 1, 3, 5); }
    room('laundry', 'Laundry', 'laundry', 1, 0, top >= 8 ? top : 0, Math.min(ls, 9), top >= 8 ? 7 : top + 7); if (ls > 9) { room('pantry', 'Pantry / storage', 'pantry', 1, 9, top >= 8 ? top : 0, ls - 9, top >= 8 ? 7 : top + 7); door('kitchen', 'pantry', 2.5); } room('pbath', 'Primary bath', 'bath', 1, 0, D - pd - 9, r2(ls * 0.55), 9); room('wic', 'Walk-in closet', 'walk_in_closet', 1, r2(ls * 0.55), D - pd - 9, ls - r2(ls * 0.55), 9); room('primary', 'Primary bedroom', 'primary_bedroom', 1, 0, D - pd, ls, pd);
    door('kitchen', 'laundry', 2.67); if (top < 8) win('laundry', 'front', 1, 2.5, 4); door('primary', 'pbath', 2.67); door('primary', 'wic', 2.5); door('living', 'primary', 2.67); win('primary', 'back', 2, 3, 5); if (side) win('primary', 'left', 1, 3, 5); if (side) win('pbath', 'left', 1, 2.5, 3); }
  if (gw) { room('garage', 'Garage', 'garage', 1, 0, 0, gw, gd); door('garage', 'outside', g >= 2 ? 16 : 9, 'overhead', 'front'); if (g >= 3) door('garage', 'outside', 9, 'overhead', 'front'); }
  if (mw) { // the mud column between the garage and the foyer: powder room, mud hall, laundry, pantry
    room('pwd', 'Powder', 'half_bath', 1, gw, 0, 6, 5); room('mud', 'Mud hall', 'hall', 1, gw, 5, 6, 8); room('laundry', 'Laundry', 'laundry', 1, gw, 13, 6, gd - 17); room('pantry', 'Pantry', 'pantry', 1, gw, gd - 4, 6, 4);
    door('garage', 'mud', 3); door('mud', 'foyer', 3); door('mud', 'laundry', 2.67); door('foyer', 'pwd', 2.5); door('kitchen', 'pantry', 2.5);
  }
  const y0 = gd; // where the suite or the flex room behind the garage starts
  if (gw && !mw) door('garage', 'kitchen', 3);
  if (gw && primaryBack) {
    const bh = D - y0 >= 24 ? 10 : D - y0 >= 21 ? 9 : 8, pbw = c0 >= 16 ? r2(clamp(c0 * 0.55, 8, 12)) : c0 - 4;
    room('pbath', 'Primary bath', 'bath', 1, 0, y0, pbw, bh); room('wic', 'Walk-in closet', 'walk_in_closet', 1, pbw, y0, c0 - pbw, bh);
    const pdp = D - y0 - bh, sit = c0 * pdp > 500 && pdp >= 24 && side ? r2(pdp * 0.4) : 0; if (sit) { room('sit', 'Sitting room', 'family', 1, 0, D - sit, c0, sit); door('primary', 'sit', 6, 'opening'); win('sit', 'back', 2, 3, 5); if (side) win('sit', 'left', 1, 3, 5); }
    room('primary', 'Primary bedroom', 'primary_bedroom', 1, 0, y0 + bh, c0, pdp - sit);
    door('primary', 'pbath', 2.67); door('primary', 'wic', 2.5); door('living', 'primary', 2.67); if (!sit) win('primary', 'back', c0 >= 16 ? 2 : 1, 3, 5); if (side) win('primary', 'left', sit ? 2 : 1, 3, 5); if (side) win('pbath', 'left', 1, 2.5, 3);
  } else if (gw && D - y0 >= 10) { room('flex', D - y0 >= 14 ? 'Game room' : 'Storage', D - y0 >= 14 ? 'flex' : 'storage', 1, 0, y0, c0, D - y0); door('living', 'flex', 3); win('flex', 'back', 1, 4, 5); if (side) win('flex', 'left', 1, 4, 5); }
  else if (gw && D - y0 > 0) { room('stor', 'Storage', 'storage', 1, 0, y0, c0, D - y0); door(B.has('mud') ? 'mud' : 'garage', 'stor', 2.5); }
  // the core: foyer (the stair beside it on a two-story), the front room, the kitchen, the living room at the back
  const fw = mw ? 7 : 6, kd = r2(clamp((D - fd) * 0.38, 11, 16));
  const sw = two ? 4 : 0;
  room('foyer', 'Foyer', 'entry', 1, c0, 0, fw, mw ? fd : 7); door('foyer', 'outside', 3, 'swing', 'front'); win('foyer', 'front', 1, 2, 5);
  if (!mw) { room('pwd', 'Powder', 'half_bath', 1, c0, 7, Math.min(fw, 6), fd - 7); door('foyer', 'pwd', 2.5); if (fw > 6) { room('coat2', 'Coat', 'closet', 1, c0 + 6, 7, fw - 6, fd - 7); door('foyer', 'coat2', 2.5); } }
  if (two) { room('stair1', 'Stair', 'stair', 1, c0 + fw, 0, 4, fd); door('foyer', 'stair1', 3.5, 'opening'); }
  const frw = wc - fw - sw, fx = c0 + fw + sw, pieces = frw <= 16 || frw - Math.max(11, r2(frw / 2)) < 9 ? [frw] : [Math.max(11, r2(frw / 2)), frw - Math.max(11, r2(frw / 2))];
  let bed4 = false, px = fx;
  if (frw >= 9) for (const [i, pw] of pieces.entries()) {
    const asBed = !two && P.beds >= 4 && pw >= 10 && !bed4 && (pieces.length === 1 || i === 1);
    if (asBed) { bed4 = true; room('bed4', 'Bedroom 4', 'bedroom', 1, px, 0, pw, fd - 2.5); room('cl4', 'Closet', 'closet', 1, px, fd - 2.5, pw, 2.5); door('hall', 'bed4', 2.67); door('bed4', 'cl4', 2.5); win('bed4', 'front', 1, 3, 5); if (side && px + pw >= x0 - 0.01 && x0 >= W - 0.01) win('bed4', 'right', 1, 3, 5); }
    else { const id = room(i ? 'study' : 'dining', pw >= 11 && !i ? 'Dining room' : pw * fd > 300 ? 'Sitting room' : 'Study', pw >= 11 && !i ? 'dining' : pw * fd > 300 ? 'family' : 'office', 1, px, 0, pw, fd); door(i ? 'kitchen' : two ? 'kitchen' : 'foyer', id, 6, 'opening'); if (!i && !two) door(id, 'kitchen', 6, 'opening'); win(id, 'front', pw >= 12 ? 2 : 1, 3, 5); }
    px += pw;
  } else { const fy = B.rooms.find(r => r.id === 'foyer'), fw2 = Math.min(8, wc - sw); fy.w = r2(fw2); if (!mw) B.rooms.find(r => r.id === 'pwd').w = r2(fw2); if (two) B.rooms.find(r => r.id === 'stair1').x = r2(c0 + fw2); const rest = wc - sw - fw2; if (rest >= 2) { room('coat', rest >= 7 ? 'Study' : 'Coat', rest >= 7 ? 'office' : 'closet', 1, c0 + fw2 + sw, 0, rest, fd); door(rest >= 7 ? 'kitchen' : 'foyer', 'coat', rest >= 7 ? 3 : 2.5); if (rest >= 7) win('coat', 'front', 1, 3, 5); } }
  room('kitchen', 'Kitchen / breakfast', 'kitchen', 1, c0, fd, wc, kd); door('foyer', 'kitchen', 6, 'opening');
  const ld = D - fd - kd, dwid = wc >= 30 ? r2(clamp(wc * 0.4, 12, 16)) : 0; // a wide core: the dining room beside the living room at the back
  room('living', dwid ? 'Living room' : 'Living / dining', 'living', 1, c0 + dwid, fd + kd, wc - dwid, ld); door('kitchen', 'living', 10, 'opening'); door('living', 'outside', 8, 'sliding', 'back'); win('living', 'back', wc - dwid >= 20 ? 3 : 2, 4, 6);
  if (dwid) { room('dining2', 'Dining room', 'dining', 1, c0, fd + kd, dwid, ld); door('kitchen', 'dining2', 8, 'opening'); door('dining2', 'living', 8, 'opening'); win('dining2', 'back', 2, 4, 6); }
  if (wc * kd > 450) { const bw2 = r2(clamp(wc * 0.35, 9, 14)); B.rooms.find(r => r.id === 'kitchen').w = r2(wc - bw2); room('brk', 'Breakfast', 'dining', 1, c0 + wc - bw2, fd, bw2, kd); door('kitchen', 'brk', 8, 'opening'); door('brk', 'living', 6, 'opening'); }
  if (!c0) { win('kitchen', 'left', 1, 3, 4); win('living', 'left', 1, 4, 5); }
  const hy0 = B.has('laundry') ? 0 : 6; if (!B.has('laundry')) { room('laundry', 'Laundry', 'laundry', 1, x0, 0, 4, 6); door('hall', 'laundry', 2.67); win('laundry', 'front', 1, 2, 4); }
  // the wing: a hall down its left, bedrooms with closets and their bath on the right; on a two-story a study, a bath
  // and a game room instead (the bedrooms are upstairs); the back room spans the wing
  const wx = x0 + 4, suite = !primaryBack; let y = 0, n = 2; if (B.has('bed4')) n = 2;
  const nb = (nm, ty, dep, idw = 'bed' + n) => { const id = room(idw, nm, ty, 1, wx, y, bw, dep), cl = room('cl' + id, 'Closet', 'closet', 1, wx, y + dep, bw, 2.5); door('hall', id, 2.67); door(id, cl, 2.5); win(id, 'front', 1, 3, 5); if (side) win(id, 'right', 1, 3, 5); y += dep + 2.5; n++; return id; };
  if (two) { nb('Study', 'office', 11.5, 'study'); room('bath2', 'Bath 2', 'bath', 1, wx, y, bw, 6); door('hall', 'bath2', 2.67); if (side) win('bath2', 'right', 1, 2.5, 3); y += 6; }
  else { nb('Bedroom 2', 'bedroom', 11.5); room('bath2', 'Bath 2', 'bath', 1, wx, y, bw, 6); door('hall', 'bath2', 2.67); if (side) win('bath2', 'right', 1, 2.5, 3); y += 6; }
  const deep = D - y;
  if (suite && !two) { room('pbath', 'Primary bath', 'bath', 1, wx, y, bw, 7); room('pcl', 'Walk-in closet', 'walk_in_closet', 1, wx, y + 7, bw, 3); door('primary', 'pbath', 2.67); door('primary', 'pcl', 2.5); y += 10;
    room('primary', 'Primary bedroom', 'primary_bedroom', 1, x0, y, bw + 4, D - y); door('hall', 'primary', 2.67); win('primary', 'back', 2, 3, 5); if (side) win('primary', 'right', 1, 3, 5); }
  else if (two) { const gm = room('game', deep >= 14 ? 'Family room' : 'Storage', deep >= 14 ? 'family' : 'storage', 1, x0, y, bw + 4, deep); door('hall', gm, 3.5, 'opening'); win(gm, 'back', 2, 3, 5); if (side) win(gm, 'right', 1, 3, 5); }
  else if (deep >= 26) { nb('Bedroom 3', 'bedroom', 11.5); const more = P.beds >= 5 || (P.beds >= 4 && !B.has('bed4')), last = room('bedL', more ? 'Bedroom ' + (B.has('bed4') ? 5 : 4) : 'Game room', more ? 'bedroom' : 'flex', 1, more ? x0 + 3 : x0, y, more ? bw + 1 : bw + 4, D - y); door('hall', last, more ? 2.67 : 3.5, more ? 'swing' : 'opening'); win(last, 'back', 2, 3, 5); if (side) win(last, 'right', 1, 3, 5);
    if (more) { const cl = room('clL', 'Closet', 'closet', 1, x0, y, 3, D - y); door(last, cl, 2.5); } }
  else { const cl = room('cl3', 'Closet', 'closet', 1, wx, y, bw, 2.5), b3 = room('bed3', 'Bedroom 3', 'bedroom', 1, x0, y + 2.5, bw + 4, D - y - 2.5); door('hall', b3, 2.67); door(b3, cl, 2.5); win(b3, 'back', 2, 3, 5); if (side) win(b3, 'right', 1, 3, 5); }
  room('hall', 'Hall', 'hall', 1, x0, hy0, 4, y - hy0 + (two || (suite && !two) || B.has('bedL') ? 0 : 2.5));
  if (!two && !suite && !B.has('bedL')) { /* hall ends at the back bedroom's closet row */ }
  door('kitchen', 'hall', 3.5, 'opening'); door('living', 'hall', 3.5, 'opening');
  const raw = { summary: 'One-story plan: ' + (gw ? g + '-car garage and ' : '') + (primaryBack ? 'the primary suite down the left, ' : '') + 'foyer, ' + (bed4 ? 'fourth bedroom' : 'dining room') + ', kitchen and living through the middle, the other bedrooms and their bath off a hall on the right.', ...B.raw(), ...resSkin(t, false) };
  if (two) { for (let f = 2; f <= F; f++) upperFloor(t, P, raw, f, { sx: B.rooms.find(r => r.id === 'stair1').x, side, last: f === F });
    raw.summary = 'Two-story plan: ' + (gw ? g + '-car garage, ' : '') + (primaryBack ? 'the primary suite down, ' : '') + 'foyer with the stair, dining, kitchen and living through the middle, a study, bath and family room on the right; the other bedrooms upstairs off a hall.'; }
  return raw;
}
// an upper floor over the whole footprint: the stair at (sx, 0), a hall band behind it across the house, bedrooms with
// closets along the front, and behind the band either bays across (a shallow house) or rooms off two halls (a deep one).
// It places what the program still needs (bedrooms, baths, a laundry) and gives the rest to a game room.
function upperFloor(t, P, B, f, o) {
  const W = t.W, D = t.D, { sx, side } = o, room = (id, name, type, x, y, w, d) => { let k = id + f; while (B.rooms.some(r => r.id === k)) k += '_'; B.rooms.push({ id: k, name, type, floor: f, x: r2(x), y: r2(y), w: r2(w), d: r2(d) }); return k; };
  const door = (a, b, w = 2.67, kind = 'swing') => B.doors.push({ a, b, width: w, kind, side: 'any' }), win = (r, s, c = 1, w = 3, h = 5) => B.windows.push({ room: r, side: s, count: c, width: w, height: h });
  const beds = () => B.rooms.filter(r => /bedroom/.test(r.type)).length, baths = () => B.rooms.filter(r => r.type === 'bath').length, needBed = () => P.beds - beds() > 0, needBath = () => P.baths - baths() > 0;
  let n = beds() + 1, game = 0;
  const sl = 14, st = room('stair', 'Stair', 'stair', sx, 0, 4, sl), band = room('hallA', 'Hall', 'hall', 0, sl, W, 4); door(st, band, 3.5, 'opening');
  // a bay against the band: a bedroom with its closet on the band side, or a game room when the program has its bedrooms
  const bay = (x, w, y, dep, edge, hall = band) => {
    const front = y === 0, side2 = side && edge;
    if (needBed()) { const cl = room('cl', 'Closet', 'closet', x, front ? y + dep - 2.5 : y, w, 2.5), id = room('bed', 'Bedroom ' + n++, 'bedroom', x, front ? y : y + 2.5, w, dep - 2.5); door(hall, id); door(id, cl, 2.5); win(id, front ? 'front' : 'back', w >= 14 ? 2 : 1); if (side2) win(id, edge); return id; }
    const id = room('game', game++ ? 'Bonus room' : 'Game room', 'flex', x, y, w, dep); door(hall, id, 3.5, 'opening'); win(id, front ? 'front' : 'back', w >= 14 ? 2 : 1); if (side2) win(id, edge); return id;
  };
  // a run of bays between x0 and x1 against the band at y, dep deep; a bath (7 wide, 8 deep, a walk-in closet behind
  // it for the bedroom beside it) and the laundry (5 wide) at the stair end when the program still needs them
  const run = (x0, x1, y, dep, stairEnd) => {
    let x = x0, w = x1 - x0; if (w < 4) return;
    const bathW = w >= 16 && needBath() ? 7 : 0, lau = !B.rooms.some(r => r.type === 'laundry') && w - bathW >= 14 ? 5 : 0, k = Math.max(1, Math.round((w - bathW - lau) / 13)), bwid = (w - bathW - lau) / k;
    const edgeL = x0 <= 0.01 ? 'left' : null, edgeR = x1 >= W - 0.01 ? 'right' : null;
    let wic = null;
    const bath = () => { const b = room('bath', 'Bath ' + (1 + baths()), 'bath', x, y, 7, Math.min(dep, 8)); door(band, b); if (dep - 8 >= 3) wic = room('wic', 'Walk-in closet', 'walk_in_closet', x, y + 8, 7, dep - 8); x += 7; };
    const laundry = () => { const l = room('laundry', 'Laundry', 'laundry', x, y, 5, Math.min(dep, 7)); door(band, l, 2.67); if (dep - 7 >= 2.5) { const lin = room('lin', 'Linen', 'closet', x, y + 7, 5, dep - 7); door(band, lin, 2.5); B.rooms.find(r => r.id === lin).y = r2(y); B.rooms.find(r => r.id === l).y = r2(y + dep - 7); B.rooms.find(r => r.id === lin).d = r2(dep - 7); B.rooms.find(r => r.id === l).d = r2(Math.min(dep, 7)); if (y !== 0) { B.rooms.find(r => r.id === lin).y = r2(y + 7); B.rooms.find(r => r.id === l).y = r2(y); } } x += 5; };
    const left = stairEnd === 'left'; if (left && bathW) bath(); if (left && lau) laundry();
    const ids = []; for (let i = 0; i < k; i++) { const xa = r2(x + i * bwid), xb = i === k - 1 ? r2(x + k * bwid) : r2(x + (i + 1) * bwid); ids.push(bay(xa, xb - xa, y, dep, i === 0 && !(left && (bathW || lau)) ? edgeL : i === k - 1 && (left || !(bathW || lau)) ? edgeR : null)); if (wic && i === 0) { door(ids[0], wic, 2.5); wic = null; } }
    x = r2(x + k * bwid); if (!left && lau) laundry(); if (!left && bathW) bath();
    if (wic) { door(ids[ids.length - 1], wic, 2.5); wic = null; }
  };
  // the front: bays left and right of the stair (a sliver beside the stair becomes a linen closet or widens the stair)
  const fix = (x0, x1, stairEnd) => { const w = x1 - x0; if (w >= 9) run(x0, x1, 0, sl, stairEnd); else if (w >= 2) { const lin = room('lin', 'Linen', 'closet', x0, 0, w, sl); door(band, lin, 2.5); } else if (w > 0) { const s = B.rooms.find(r => r.id === st); s.x = Math.min(s.x, x0); s.w = r2(s.w + w); } };
  fix(0, sx, 'right'); fix(sx + 4, W, 'left');
  const by = sl + 4, bz = D - by; if (bz <= 0) return;
  if (bz <= 24) { run(0, W, by, bz, 'left'); return; }
  // deep: two halls down from the band at thirds; bedrooms in the outer columns (side windows), the middle column a
  // bath and the game room, the bottom room of each column at the back wall
  const hw = 4, h1 = r2(W / 3 - hw / 2), h2 = r2(2 * W / 3 - hw / 2), hall1 = room('hallB', 'Hall', 'hall', h1, by, hw, bz), hall2 = room('hallC', 'Hall', 'hall', h2, by, hw, bz);
  door(band, hall1, 3.5, 'opening'); door(band, hall2, 3.5, 'opening');
  const col = (x, w, hall, edge) => {
    let y = by, last = null;
    const put = (id) => { last = id; };
    if (needBath() && w >= 7 && D - y >= 20) { const bt = room('bath', 'Bath ' + (1 + baths()), 'bath', x, y, w, 8); door(hall, bt); y += 8; put(bt); }
    while (needBed() && D - y >= 22 && side && edge) { const cl = room('cl', 'Closet', 'closet', x, y, w, 2.5), id = room('bed', 'Bedroom ' + n++, 'bedroom', x, y + 2.5, w, 11.5); door(hall, id); door(id, cl, 2.5); win(id, edge, 1); y += 14; put(id); }
    const left = D - y;
    if (needBed() && left >= 10 && (edge || !side)) { const cl = room('cl', 'Closet', 'closet', x, y, w, 2.5), id = room('bed', 'Bedroom ' + n++, 'bedroom', x, y + 2.5, w, left - 2.5); door(hall, id); door(id, cl, 2.5); win(id, 'back', w >= 14 ? 2 : 1); if (side && edge) win(id, edge); put(id); }
    else if (left >= 7) { let yy = y; if (left > 30 && w * left > 700 && side && edge) { const d1 = r2(left / 2), id0 = room('game', game++ ? 'Bonus room' : 'Game room', 'flex', x, yy, w, d1); door(hall, id0, 3.5, 'opening'); if (side && edge) win(id0, edge); else win(id0, 'back', 1); yy += d1; } const id = room('game', game++ ? (edge ? 'Bonus room' : 'Media room') : 'Game room', 'flex', x, yy, w, D - yy); door(hall, id, 3.5, 'opening'); win(id, 'back', w >= 14 ? 2 : 1); if (side && edge) win(id, edge); put(id); }
    else if (last) B.rooms.find(r => r.id === last).d = r2(B.rooms.find(r => r.id === last).d + left);
  };
  col(0, h1, hall1, 'left'); col(h2 + hw, W - h2 - hw, hall2, 'right'); col(h1 + hw, h2 - h1 - hw, hall1, null);
}
// more bedrooms than the program asks for: the smallest extra ones become a game room or a study
function trimBedrooms(raw, P) {
  const beds = () => raw.rooms.filter(r => r.type === 'bedroom');
  while (raw.rooms.filter(r => /bedroom/.test(r.type)).length > P.beds && beds().length) { const r = beds().sort((a, b) => a.w * a.d - b.w * b.d)[0], big = r.w * r.d >= 150; r.type = big ? 'flex' : 'office'; r.name = big ? (raw.rooms.some(q => q.name === 'Game room') ? 'Bonus room' : 'Game room') : raw.rooms.some(q => q.name === 'Study') ? 'Flex room' : 'Study'; }
  let k = 2; for (const r of raw.rooms.filter(q => q.type === 'bedroom').sort((a, b) => a.floor - b.floor || a.y - b.y || a.x - b.x)) r.name = 'Bedroom ' + k++;
  return raw;
}

// ---------- the rowhouse: narrow homes, one to three floors ----------
export function rowhouseDesign(t, P = homeProgram(t)) {
  const W = t.W, D = t.D, F = t.floors || 1, B = builder(), { room, door, win } = B, side = !t.attached;
  if (W < 16 || D < 24 || (F === 1 && (W * D < 700 || D < 26))) return cottage(t, P);
  let gw = P.garage >= 2 && W - 20 >= 8 ? 20 : P.garage >= 1 && W - 11.5 >= 7.5 ? 11.5 : 0, g = gw === 20 ? 2 : gw ? 1 : 0;
  let gd = gw ? clamp(D - 20, 19, 22) : 0; if (gw && F === 1 && D - gd < 29) { gw = 0; g = 0; gd = 0; } // one story and shallow: the bedrooms need the depth, parking is a pad in front
  const ew = gw ? W - gw : Math.min(8, W - 8);
  if (gw) { room('garage', 'Garage', 'garage', 1, 0, 0, gw, gd); door('garage', 'outside', g === 2 ? 16 : 9, 'overhead', 'front'); }
  // the entry column: foyer at the front, a hall behind it (with the powder room when wide enough), the stair at the far wall
  const ex = W - ew, hd = gw ? gd : F > 1 ? Math.max(16, Math.min(19, D - 10)) : 12, stairHere = F > 1, sl = Math.min(12, hd - 7);
  const sw = stairHere ? 4 : 0, dw = ew - sw - 9 >= 2 ? r2(ew - sw - 9) : 0, hw = ew - sw - dw; // dw: a dining room, study or coat closet beside the foyer when the column is wide
  room('foyer', 'Foyer', 'entry', 1, ex, 0, hw, 7); door('foyer', 'outside', 3, 'swing', 'front'); win('foyer', 'front', 1, 2, 5);
  if (dw >= 7) { room('dining', dw >= 11 ? 'Dining room' : 'Study', dw >= 11 ? 'dining' : 'office', 1, ex + hw, 0, dw, hd); door('foyer', 'dining', 6, 'opening'); win('dining', 'front', dw >= 12 ? 2 : 1, 3, 5); }
  else if (dw) { room('coat0', 'Coat', 'closet', 1, ex + hw, 0, dw, 7); door('foyer', 'coat0', 2.5); room('stor0', 'Storage', 'storage', 1, ex + hw, 7, dw, hd - 7); door('hall1', 'stor0', 2.5); }
  if (stairHere) { const bd0 = dw >= 7; room('stair1', 'Stair', 'stair', 1, W - 4, bd0 ? 0 : 7, 4, sl); if (bd0 && hd - sl >= 2.5) { room('lin1', 'Storage', 'storage', 1, W - 4, sl, 4, hd - sl); door('dining', 'lin1', 2.5); } else if (bd0) B.rooms.find(r => r.id === 'stair1').d = r2(hd);  door(dw >= 7 ? 'dining' : 'foyer', 'stair1', 3.5, 'opening'); if (!(dw >= 7) && hd - 7 - sl >= 2.5) { room('lin1', 'Storage', 'storage', 1, W - 4, 7 + sl, 4, hd - 7 - sl); door('hall1', 'lin1', 2.5); } else if (!(dw >= 7) && hd - 7 > sl) B.rooms.find(r => r.id === 'stair1').d = r2(hd - 7); }
  let pw = 0; if (hw >= 8.5) { pw = 5; room('pwd', 'Powder', 'half_bath', 1, ex, 7, 5, 5.5); door('hall1', 'pwd', 2.5); }
  const hwid = !pw && hw >= 6.5 ? 3.5 : hw - pw; room('hall1', 'Hall', 'hall', 1, ex + pw, 7, hwid, hd - 7); door('foyer', 'hall1', 3.5, 'opening'); if (hwid < hw - pw) { room('stor1', 'Storage', 'storage', 1, ex + pw + hwid, 7, hw - pw - hwid, hd - 7); door('hall1', 'stor1', 2.5); } if (pw && hd - 12.5 >= 2) { room('coat', 'Coat', 'closet', 1, ex, 12.5, 5, hd - 12.5); door('hall1', 'coat', 2.5); } else if (pw) B.rooms.find(r => r.id === 'pwd').d = r2(hd - 7);
  B._sl = sl;
  if (gw) door('garage', 'hall1', 3);
  if (!gw) { room('living', 'Living', 'living', 1, 0, 0, ex, hd); door('foyer', 'living', 6, 'opening'); win('living', 'front', ex >= 14 ? 2 : 1, 4, 5); if (side) win('living', 'left', 1, 4, 5); }
  const by = hd, bz = D - by;
  if (F > 1) {
    // behind: a powder room and laundry on the left (when the entry column has no powder room), kitchen, then the family room
    const lw = pw ? 0 : 5, kd = bz >= 22 ? r2(clamp(bz * 0.45, 10, 14)) : 0, main = kd || W - lw >= 28 ? 'kitchen' : 'kitliv';
    let lh = 0; if (lw) { room('pwd', 'Powder', 'half_bath', 1, 0, by, 5, 5.5); door(main, 'pwd', 2.5); lh = 5.5; if ((kd || bz) >= 11.5) { room('laundry', 'Laundry', 'laundry', 1, 0, by + 5.5, 5, 6); door(main, 'laundry', 2.67); lh = 11.5; } }
    if (kd) { const kk = Math.max(kd, lh); room('kitchen', gw ? 'Kitchen / dining' : 'Kitchen', 'kitchen', 1, lw, by, W - lw, kk); if (lw && kk > lh) { room('pan', 'Pantry', 'pantry', 1, 0, by + lh, 5, kk - lh); door('kitchen', 'pan', 2.5); }
      room('family', gw ? 'Family room' : 'Family / dining', 'family', 1, 0, by + kk, W, D - by - kk); door('kitchen', 'family', 10, 'opening'); door('hall1', 'kitchen', 3.5, 'opening'); if (dw >= 7) door('dining', 'kitchen', 6, 'opening'); door('family', 'outside', 6, 'sliding', 'back'); win('family', 'back', W >= 20 ? 2 : 1, 4, 6); if (side && !lw) win('kitchen', 'left', 1, 3, 4); if (side) win('family', 'right', 1, 3, 5); }
    else if (W - lw >= 28 || (W - lw) * bz > 850) { const kw = r2(clamp((W - lw) * 0.42, 12, 16)); room('kitchen', 'Kitchen / dining', 'kitchen', 1, lw, by, kw, bz); room('family', 'Family room', 'family', 1, lw + kw, by, W - lw - kw, bz); if (lw && bz > lh) { room('pan', 'Pantry', 'pantry', 1, 0, by + lh, 5, bz - lh); door('kitchen', 'pan', 2.5); } door('hall1', 'family', 3.5, 'opening'); door('kitchen', 'family', 10, 'opening'); door('family', 'outside', 6, 'sliding', 'back'); win('family', 'back', 2, 4, 6); win('kitchen', 'back', 1, 4, 4); if (side) win('family', 'right', 1, 3, 5); for (const d of B.doors) if (d.a === 'kitliv') d.a = 'kitchen'; }
    else { room('kitliv', 'Kitchen / living', 'living', 1, lw, by, W - lw, bz); if (lw && bz > lh) { room('pan', 'Pantry', 'pantry', 1, 0, by + lh, 5, bz - lh); door('kitliv', 'pan', 2.5); } door('hall1', 'kitliv', 3.5, 'opening'); door('kitliv', 'outside', 6, 'sliding', 'back'); win('kitliv', 'back', 2, 4, 6); if (side) win('kitliv', 'right', 1, 3, 5); }
    for (let f = 2; f <= F; f++) rowUpper(t, P, B, f, side, f === F);
  } else {
    // one story: kitchen / living across the middle, a cross hall, then the bedrooms and their bath along the back
    const beds = Math.max(1, P.beds), bathW = 8, fit = clamp(Math.floor((W - bathW) / 10), 1, beds), bd = r2(clamp(bz * 0.42, 10.5, 14)), hy = D - bd - 3.5, ld = hy - by;
    if (ld < 9) return cottage(t, P);
    room('kitliv', gw ? 'Kitchen / living' : 'Kitchen / dining', gw ? 'living' : 'kitchen', 1, 0, by, W, ld); door('hall1', 'kitliv', 3.5, 'opening'); if (!gw) door('living', 'kitliv', 8, 'opening'); if (side) win('kitliv', 'left', 2, 4, 5); if (side) win('kitliv', 'right', 1, 4, 5);
    if (W * ld > 800) { const kl = B.rooms.find(r => r.id === 'kitliv'), kw = r2(clamp(W * 0.42, 12, 16)); kl.w = r2(W - kw); kl.name = gw ? 'Living / dining' : 'Dining / family'; kl.type = gw ? 'living' : 'family'; room('kit2', 'Kitchen', 'kitchen', 1, W - kw, by, kw, ld); door('kitliv', 'kit2', 10, 'opening'); if (side) { B.windows.pop(); win('kit2', 'right', 1, 4, 4); } }
    room('hall2', 'Hall', 'hall', 1, 0, hy, W, 3.5); door('kitliv', 'hall2', 3.5, 'opening');
    if (!pw) { room('laundry', 'Laundry', 'laundry', 1, 0, by, 5, 6); const kl = B.rooms.find(r => r.id === 'kitliv'); kl.x = 5; kl.w = r2(W - 5); room('pan', 'Pantry', 'pantry', 1, 0, by + 6, 5, ld - 6); door('kitliv', 'laundry', 2.67); door('kitliv', 'pan', 2.5); if (!B.has('pwd') && W - 5 >= 20) { room('pwd', 'Powder', 'half_bath', 1, W - 5, by, 5, 5); kl.w = r2(kl.w - 5); room('pan2', 'Storage', 'storage', 1, W - 5, by + 5, 5, ld - 5); door('kitliv', 'pwd', 2.5); door('kitliv', 'pan2', 2.5); } }
    else { const ct = B.rooms.find(r => r.id === 'coat'); if (ct) { ct.name = 'Laundry'; ct.type = 'laundry'; ct.id = 'laundry'; B.doors.find(d => d.b === 'coat').b = 'laundry'; } else { room('laundry', 'Laundry', 'laundry', 1, 0, by, 5, 6); const kl = B.rooms.find(r => r.id === 'kitliv'); kl.x = 5; kl.w = r2(W - 5); room('pan', 'Pantry', 'pantry', 1, 0, by + 6, 5, ld - 6); door('kitliv', 'laundry', 2.67); door('kitliv', 'pan', 2.5); } }
    let x = 0; const bwv = (W - bathW) / fit;
    for (let i = 0; i < fit; i++) { const xa = r2(x), xb = r2(x + bwv), id = 'bed' + (i + 1), prim = i === 0;
      room(id, prim ? 'Primary bedroom' : 'Bedroom ' + (i + 1), prim ? 'primary_bedroom' : 'bedroom', 1, xa, hy + 6, xb - xa, bd - 2.5); room('cl' + (i + 1), 'Closet', 'closet', 1, xa, hy + 3.5, xb - xa, 2.5); door('hall2', id, 2.67); door(id, 'cl' + (i + 1), 2.5); win(id, 'back', xb - xa >= 13 ? 2 : 1, 3, 5); if (side && i === 0) win(id, 'left', 1, 3, 5); x += bwv; }
    room('bath1', 'Bath', 'bath', 1, r2(x), hy + 3.5, W - r2(x), bd); door('hall2', 'bath1', 2.67); win('bath1', 'back', 1, 2.5, 3);
  }
  return { summary: (F > 1 ? F + '-story' : 'One-story') + ' plan: ' + (gw ? g + '-car garage, ' : '') + 'foyer and hall at the front, kitchen and ' + (F > 1 ? 'family room behind; bedrooms upstairs off a hall' : 'living across the middle, the bedrooms and bath along the back') + '.', ...B.raw(), ...resSkin(t, F > 1) };
}
// a rowhouse upper floor: the stair at the right wall, a cross hall behind it, bedrooms in front, the primary suite (or
// more bedrooms on a middle floor) behind
function rowUpper(t, P, B, f, side, last) {
  const W = t.W, D = t.D, room = (id, name, type, x, y, w, d) => { let k = id + f; while (B.rooms.some(r => r.id === k)) k += '_'; B.rooms.push({ id: k, name, type, floor: f, x: r2(x), y: r2(y), w: r2(w), d: r2(d) }); return k; };
  const door = (a, b, w = 2.67, kind = 'swing') => B.doors.push({ a, b, width: w, kind, side: 'any' }), win = (r, s, c = 1, w = 3, h = 5) => B.windows.push({ room: r, side: s, count: c, width: w, height: h });
  const sl = B._sl || 12, st = room('stair', 'Stair', 'stair', W - 4, 7, 4, sl), hy = 7 + sl, hb = 3.5, hall = room('hall', 'Hall', 'hall', 0, hy, W, hb); door(st, hall, 3.5, 'opening');
  let n = B.rooms.filter(r => /bedroom/.test(r.type)).length + 1;
  const nb = () => B.rooms.filter(r => r.floor === f && r.type === 'bath').length;
  const fw = W - 4, lau = !B.rooms.some(r => r.type === 'laundry');
  const over = room(lau ? 'laundry' : 'lin', lau ? 'Laundry' : 'Linen', lau ? 'laundry' : 'closet', W - 4, 0, 4, 7); // over the foyer, off the room beside it
  const bedBay = (x, w, edge) => { const b = room('bed', 'Bedroom ' + n++, 'bedroom', x, 0, w, hy - 2.5), c = room('cl', 'Closet', 'closet', x, hy - 2.5, w, 2.5); door(hall, b); door(b, c, 2.5); win(b, 'front', w >= 12 ? 2 : 1); if (side && edge) win(b, edge); return b; };
  const needHall = () => nb() + B.rooms.filter(r => r.floor !== f && r.type === 'bath').length < P.baths - (last ? 1 : 0); // a hall bath besides the primary's
  if (fw >= 32 && needHall()) { // a bath and the laundry at the stair end, a walk-in closet over them for the bedroom beside
    const bx = fw - 12, bt = room('bath', 'Bath', 'bath', bx + 5, hy - 9, 7, 9), ln = room('laundry', 'Laundry', 'laundry', bx, hy - 9, 5, 9), wic = room('wic', 'Walk-in closet', 'walk_in_closet', bx, 0, 12, hy - 9); door(hall, bt); door(hall, ln, 2.67);
    const k = Math.max(1, Math.round(bx / 13)), bwid = bx / k; let prev = null; for (let i = 0; i < k; i++) { const xa = r2(i * bwid), xb = i === k - 1 ? bx : r2((i + 1) * bwid); prev = bedBay(xa, xb - xa, i === 0 ? 'left' : null); } door(prev, wic, 2.5); const ov = B.rooms.find(r => r.id === over); ov.name = 'Linen'; ov.type = 'closet'; door(wic, over, 2.5); }
  else if (fw >= 25.5 && needHall()) { const bt = room('bath', 'Bath', 'bath', fw - 5.5, hy - 9, 5.5, 9), lin = room('wic', 'Walk-in closet', 'walk_in_closet', fw - 5.5, 0, 5.5, hy - 9); door(hall, bt); const k = 2, bwid = (fw - 5.5) / k; let prev = null; for (let i = 0; i < k; i++) { const xa = r2(i * bwid), xb = i === k - 1 ? fw - 5.5 : r2((i + 1) * bwid); prev = bedBay(xa, xb - xa, i === 0 ? 'left' : null); } door(prev, lin, 2.5); door(lin, over, 2.5); }
  else if (fw >= 20) { const k = Math.max(2, Math.round(fw / 13)), bwid = fw / k; let prev = null; for (let i = 0; i < k; i++) { const xa = r2(i * bwid), xb = i === k - 1 ? fw : r2((i + 1) * bwid); prev = bedBay(xa, xb - xa, i === 0 ? 'left' : null); } door(prev, over, 2.5); }
  else if (fw >= 15.5) { const b1 = bedBay(0, fw - 5.5, 'left'), bt = room('bath', 'Bath', 'bath', fw - 5.5, 0, 5.5, 9), lin = room('lin', 'Linen', 'closet', fw - 5.5, 9, 5.5, hy - 9); door(hall, bt); door(hall, lin, 2.5); door(bt, over, 2.5); }
  else if (D - hy - hb < 5 && fw - 5 >= 7) { const b1 = room('bed', 'Bedroom ' + n++, 'bedroom', 0, 0, fw - 5, hy - 2.5), c1 = room('cl', 'Closet', 'closet', 0, hy - 2.5, fw - 5, 2.5), bt = room('bath', 'Bath', 'bath', fw - 5, hy - 8, 5, 8), lin = room('lin', 'Linen', 'closet', fw - 5, 0, 5, hy - 8); door(hall, b1); door(b1, c1, 2.5); door(hall, bt); door(b1, lin, 2.5); win(b1, 'front'); if (side) win(b1, 'left'); door(lin, over, 2.5); }
  else { const b1 = bedBay(0, fw, 'left'); door(b1, over, 2.5); }
  const by = hy + hb, bz = D - by;
  if (last) {
    if (bz >= 10 && W >= 34) { // wide: the suite on the left (bedroom, bath and walk-in closet), a bath and a game room on the right
      const pwid = r2(clamp(W * 0.4, 15, 18)), bw2 = 9, pr = room('primary', 'Primary bedroom', 'primary_bedroom', 0, by, pwid, bz), pb = room('pbath', 'Primary bath', 'bath', pwid, by, bw2, Math.min(9, bz)), gx = pwid + bw2;
      door(hall, pr); door(pr, pb); win(pr, 'back', 2, 4, 5); if (side) win(pr, 'left'); if (bz - 9 >= 3) { const wic = room('wic', 'Walk-in closet', 'walk_in_closet', pwid, by + 9, bw2, bz - 9); door(pr, wic, 2.5); }
      const wantBed = B.rooms.filter(r => /bedroom/.test(r.type)).length < P.beds, hb2 = nb() < P.baths && W - gx >= 14 && !(wantBed && W - gx - 7 < 10) ? 7 : 0; if (hb2) { const bt = room('bath', 'Bath', 'bath', gx, by, hb2, Math.min(8, bz)); door(hall, bt); if (bz - 8 >= 2.5) { const lin = room('lin', 'Linen', 'closet', gx, by + 8, hb2, bz - 8); door(hall, lin, 2.5); B.rooms.find(r => r.id === lin).y = r2(by); B.rooms.find(r => r.id === bt).y = r2(by + bz - 8); } }
      const gw2 = W - gx - hb2, needBed = B.rooms.filter(r => /bedroom/.test(r.type)).length < P.beds;
      if (needBed && gw2 >= 10) { const cl = room('cl', 'Closet', 'closet', gx + hb2, by, 3, bz), bd = room('bed', 'Bedroom ' + n++, 'bedroom', gx + hb2 + 3, by, gw2 - 3, bz); door(hall, bd); door(bd, cl, 2.5); win(bd, 'back', 1); if (side) win(bd, 'right'); }
      else { const gm = room('game', 'Game room', 'flex', gx + hb2, by, gw2, bz); door(hall, gm, 3.5, 'opening'); win(gm, 'back', 1, 4, 5); if (side) win(gm, 'right'); } }
    else if (bz >= 20) { const pw = Math.min(10, W - 8), hb2 = needHall() && W - 4 - pw >= 13 ? 7 : 0, pb = room('pbath', 'Primary bath', 'bath', 0, by, pw, 8), wic = room('wic', 'Walk-in closet', 'walk_in_closet', pw, by, W - 4 - pw - hb2, 8), hc = room('hallC', 'Hall', 'hall', W - 4, by, 4, 8), pr = room('primary', 'Primary bedroom', 'primary_bedroom', 0, by + 8, W, bz - 8);
      if (hb2) { const bt = room('bath', 'Bath', 'bath', W - 4 - hb2, by, hb2, 8); door(hc, bt); }
      door(hall, hc, 3.5, 'opening'); door(hc, pr); door(pr, pb); door(pr, wic, 2.5); win(pr, 'back', W >= 20 ? 2 : 1, 4, 5); if (side) win(pr, 'left'); if (side) win(pr, 'right'); }
    else if (bz >= 10) { const hb2 = needHall() && W >= 26 ? 6.5 : 0, bwid = Math.max(9, W - 6 - hb2), pr = room('primary', 'Primary bedroom', 'primary_bedroom', 0, by, bwid, bz), pb = room('pbath', 'Primary bath', 'bath', bwid, by, W - bwid - hb2, Math.min(8, bz)); door(hall, pr); door(pr, pb); win(pr, 'back', bwid >= 14 ? 2 : 1, 4, 5); if (side) win(pr, 'left');
      if (hb2) { const bt = room('bath', 'Bath', 'bath', W - hb2, by, hb2, Math.min(8, bz)); door(hall, bt); if (bz - 8 >= 2) { const ln = room('lin', 'Linen', 'closet', W - hb2, by + 8, hb2, bz - 8); door(pr, ln, 2.5); } else if (bz < 8) B.rooms.find(r => r.id === bt).d = r2(bz); }
      if (bz - 8 >= 2) { const wic = room('wic', 'Closet', 'closet', bwid, by + 8, W - bwid - hb2, bz - 8); door(pr, wic, 2.5); } else if (bz < 8) B.rooms.find(r => r.id === pb).d = r2(bz); }
    else if (bz >= 5) { const bt = room('bath', nb() ? 'Bath' : 'Bath', 'bath', 0, by, W, bz); door(hall, bt); win(bt, 'back', 1, 2.5, 3); }
    else B.rooms.find(r => r.id === hall).d = r2(hb + bz);
  } else {
    if (bz >= 12) { const w1 = r2(Math.max(9, (W - 6) / 2)), c3 = room('cl', 'Closet', 'closet', 0, by, w1, 2.5), b3 = room('bed', 'Bedroom ' + n++, 'bedroom', 0, by + 2.5, w1, bz - 2.5), bt = room('bath', 'Bath', 'bath', w1, by, Math.min(6, W - w1), Math.min(9, bz));
      door(hall, b3); door(b3, c3, 2.5); door(hall, bt); win(b3, 'back'); if (side) win(b3, 'left');
      const rx = w1 + B.rooms.find(r => r.id === bt).w; if (W - rx >= 9) { const c4 = room('cl', 'Closet', 'closet', rx, by, W - rx, 2.5), b4 = room('bed', 'Bedroom ' + n++, 'bedroom', rx, by + 2.5, W - rx, bz - 2.5); door(hall, b4); door(b4, c4, 2.5); win(b4, 'back'); if (side) win(b4, 'right'); } else B.rooms.find(r => r.id === bt).w = r2(W - w1);
      if (bz - 9 >= 2.5) { const btr = B.rooms.find(r => r.id === bt), ld2 = Math.min(4, bz - 9); btr.d = r2(bz - ld2); const lin = room('lin', 'Linen', 'closet', w1, by + bz - ld2, btr.w, ld2); door(b3, lin, 2.5); } else B.rooms.find(r => r.id === bt).d = r2(bz); }
    else if (bz >= 5) { const bt = room('bath', 'Bath', 'bath', 0, by, W, bz); door(hall, bt); }
    else B.rooms.find(r => r.id === hall).d = r2(hb + bz);
  }
}
// a tiny home or cottage: living and kitchen at the front, a bath and the bedroom at the back
function cottage(t, P) {
  const W = t.W, D = t.D, B = builder(), { room, door, win } = B, side = !t.attached, bd = r2(clamp(D * 0.42, 11, 13)), bathW = Math.min(7, Math.max(5, W - 9)), bw = W - bathW;
  room('living', 'Living / kitchen', 'living', 1, 0, 0, W, D - bd); door('living', 'outside', 3, 'swing', 'front'); win('living', 'front', W >= 14 ? 2 : 1, 3, 5); if (side) win('living', 'left', 1, 3, 4);
  if (W * (D - bd) > 700) { const lv = B.rooms.find(r => r.id === 'living'), kw = r2(clamp(W * 0.4, 10, 14)); lv.w = r2(W - kw); lv.name = 'Living / dining'; room('kit', 'Kitchen', 'kitchen', 1, W - kw, 0, kw, D - bd); door('living', 'kit', 8, 'opening'); win('kit', 'front', 1, 3, 4); if (side) win('kit', 'right', 1, 3, 4); }
  room('cl1', 'Closet', 'closet', 1, 0, D - bd, bw, 2.5); room('bed1', 'Bedroom', 'bedroom', 1, 0, D - bd + 2.5, bw, bd - 2.5); room('bath1', 'Bath', 'bath', 1, bw, D - bd, bathW, bd - 3); room('laundry', 'Laundry', 'laundry', 1, bw, D - 3, bathW, 3);
  door('living', 'bed1', 2.67); door('bed1', 'cl1', 2.5); door('living', 'bath1', 2.5); door('bath1', 'laundry', 2.5); win('bed1', 'back', 1, 3, 5); if (side) win('bed1', 'left', 1, 3, 5);
  return { summary: 'Cottage plan: living and kitchen at the front, the bedroom, bath and a laundry closet behind.', ...B.raw(), ...resSkin(t, false), roof: { type: 'gable', pitch: 8, ridge: 'front_to_back', overhang: 1.5 } };
}
export function homeDesign(t) { const P = homeProgram(t); return trimBedrooms((t.W >= 44 && t.D >= 39 && ranchDesign(t, P)) || rowhouseDesign(t, P), P); }

// ---------- commercial ----------
const comSkin = (t, walls, structure) => ({ roof: { type: 'flat', pitch: 0, ridge: 'along_front', overhang: 0 },
  exterior: { walls, accent: 'Metal canopies at the entries, stone or brick accent bands', roofing: 'TPO membrane behind parapets, tapered insulation', windows: 'Aluminum storefront, 1" insulated low-E glass', doors: 'Aluminum storefront entrances, hollow metal service doors' },
  systems: { structure, foundation: 'Slab on grade with grade beams' + (/tilt|steel/i.test(structure) ? ' and spread footings' : ''), hvac: 'rooftop_units', water_heater: t.use === 'restaurant' ? 'tank_gas' : 'tank_electric', sprinklered: !!t.sprinklered, fire_alarm: !!t.sprinklered } });

// a full-service restaurant: vestibule and waiting, dining and a bar at the front, restrooms off a corridor, the kitchen
// with its dish room, office, walk-in cooler and freezer and dry storage behind
export function restaurantDesign(t) {
  const W = t.W, D = t.D, B = builder(), { room, door, win } = B;
  if (W < 40 || D < 36) return smallRestaurant(t);
  const fd = r2(clamp(D * 0.52, 20, D - 24)), bd = D - fd, ls = 8, rw = W >= 64 ? 12 : 10, bar = W >= 60 ? 12 : 0;
  room('vest', 'Vestibule', 'entry', 1, 0, 0, ls, 7); door('vest', 'outside', 6, 'double', 'front'); door('vest', 'dining', 6, 'double'); win('vest', 'front', 1, 4, 7);
  room('wait', 'Waiting / host', 'lobby', 1, 0, 7, ls, 8); door('wait', 'dining', 6, 'opening'); if (!t.attached) win('wait', 'left', 1, 5, 6);
  room('corr', 'Corridor', 'corridor', 1, 0, 15, ls, fd - 15); door('dining', 'corr', 3.5, 'opening');
  room('dining', 'Dining', 'dining_room', 1, ls, 0, W - ls - bar, fd); win('dining', 'front', Math.max(2, Math.floor((W - ls - bar) / 9)), 6, 7);
  if (bar) { room('bar', 'Bar', 'dining_room', 1, W - bar, 0, bar, fd); door('dining', 'bar', 10, 'opening'); win('bar', 'front', 1, 6, 7); win('bar', 'right', Math.max(1, Math.floor(fd / 14)), 5, 6); door('bar', 'outside', 3, 'swing', 'right'); }
  else { win('dining', 'right', Math.max(1, Math.floor(fd / 14)), 5, 6); door('dining', 'outside', 3, 'swing', 'right'); }
  // back zone, left column: two restrooms, the janitor and the electrical room
  const rrd = r2(clamp((bd - 8) / 2, 8, 10));
  room('rr1', "Women's restroom", 'restroom', 1, 0, fd, ls, rrd); room('rr2', "Men's restroom", 'restroom', 1, 0, fd + rrd, ls, rrd); door('corr', 'rr1', 3); door('corr', 'rr2', 3);
  const rest = bd - 2 * rrd; if (rest >= 7) { room('jan', 'Janitor', 'janitor', 1, 0, fd + 2 * rrd, ls, 3.5); room('elec', 'Electrical', 'electrical', 1, 0, fd + 2 * rrd + 3.5, ls, rest - 3.5); door('kitchen', 'jan', 3); door('kitchen', 'elec', 3); }
  else if (rest > 0) { room('jan', 'Janitor', 'janitor', 1, 0, fd + 2 * rrd, ls, rest); door('kitchen', 'jan', 3); }
  // the corridor also reaches the restrooms from the back only through the dining side: the kitchen door joins
  // middle: a service row (dish room, server station, office) then the kitchen
  const sr = 9, kx = ls, kw = W - ls - rw, dw = r2(Math.min(12, kw * 0.35)), ow = kw - dw - 10 >= 7 ? r2(Math.min(9, kw - dw - 10)) : 0;
  room('dish', 'Dish room', 'commercial_kitchen', 1, kx, fd, dw, sr); room('server', 'Server / pass', 'corridor', 1, kx + dw, fd, kw - dw - ow, sr); if (ow) { room('office', 'Office', 'office', 1, kx + kw - ow, fd, ow, sr); door('office', 'kitchen', 3); }
  door('dining', 'server', 6, 'double'); door('server', 'kitchen', 6, 'opening'); door('server', 'dish', 4, 'opening'); door('dish', 'kitchen', 5, 'opening');
  room('kitchen', 'Kitchen', 'commercial_kitchen', 1, kx, fd + sr, kw, bd - sr); door('kitchen', 'outside', 3, 'swing', 'back');
  // right column: walk-in cooler, freezer, dry storage, receiving
  const cd = r2(clamp(bd * 0.36, 8, 12)), fz = r2(clamp(bd * 0.26, 6, 9));
  room('cooler', 'Walk-in cooler', 'walk_in_cooler', 1, W - rw, fd, rw, cd); room('freezer', 'Walk-in freezer', 'walk_in_cooler', 1, W - rw, fd + cd, rw, fz); room('dry', 'Dry storage', 'storage', 1, W - rw, fd + cd + fz, rw, bd - cd - fz);
  door('kitchen', 'cooler', 3); door('kitchen', 'freezer', 3); door('kitchen', 'dry', 3); door('dry', 'outside', 3, 'swing', 'back');
  return { summary: 'Full-service restaurant: vestibule, host stand and dining' + (bar ? ' with a bar' : '') + ' at the front, two restrooms off a side corridor, the kitchen with dish room, office, walk-in cooler and freezer, and dry storage behind.', ...B.raw(),
    ...comSkin(t, 'Brick and stucco with a stone base', 'Load-bearing CMU and steel joists, or wood frame with trusses (V-B)') };
}
function smallRestaurant(t) {
  const W = t.W, D = t.D, B = builder(), { room, door, win } = B, fd = r2(clamp(D * 0.5, 16, D - 18));
  room('dining', 'Dining', 'dining_room', 1, 0, 0, W, fd); door('dining', 'outside', 6, 'double', 'front'); win('dining', 'front', Math.max(2, Math.floor(W / 9)), 6, 7); door('dining', 'outside', 3, 'swing', 'left');
  room('rr1', 'Restroom', 'restroom', 1, 0, fd, 7, 8); room('rr2', 'Restroom', 'restroom', 1, 7, fd, 7, 8); door('dining', 'rr1', 3); door('dining', 'rr2', 3);
  room('dry', 'Dry storage', 'storage', 1, 0, fd + 8, 7, D - fd - 8); room('cooler', 'Walk-in cooler', 'walk_in_cooler', 1, 7, fd + 8, 7, D - fd - 8);
  room('kitchen', 'Kitchen', 'commercial_kitchen', 1, 14, fd, W - 14, D - fd); door('dining', 'kitchen', 5, 'double'); door('kitchen', 'dry', 3); door('kitchen', 'cooler', 3); door('kitchen', 'outside', 3, 'swing', 'back');
  return { summary: 'Small restaurant: dining at the front, two restrooms, the kitchen with its walk-in and dry storage behind.', ...B.raw(), ...comSkin(t, 'Brick and stucco', 'Wood frame with trusses (V-B)') };
}

// a convenience store: the sales floor with the walk-in cooler across its back wall, two restrooms, office,
// electrical / mechanical and storage with the receiving door behind
export function cstoreDesign(t) {
  const W = t.W, D = t.D, B = builder(), { room, door, win } = B, bd = clamp(D * 0.28, 12, 16), sd = D - bd, cw = r2(clamp(W * 0.5, 16, W - 22));
  room('sales', 'Sales floor', 'sales', 1, 0, 0, W, sd); door('sales', 'outside', 6, 'storefront', 'front'); win('sales', 'front', Math.max(2, Math.floor(W / 9)), 6, 8); door('sales', 'outside', 3, 'swing', 'left'); if (!t.attached) win('sales', 'left', 2, 6, 8);
  room('cooler', 'Walk-in cooler', 'walk_in_cooler', 1, 0, sd, cw, bd); door('sales', 'cooler', 3);
  const rrw = 7; room('rr1', 'Restroom', 'restroom', 1, cw, sd, rrw, 7); room('rr2', 'Restroom', 'restroom', 1, cw + rrw, sd, rrw, 7); door('sales', 'rr1', 3); door('sales', 'rr2', 3);
  room('office', 'Office', 'office', 1, cw, sd + 7, rrw, bd - 7); room('elec', 'Electrical / mech.', 'electrical', 1, cw + rrw, sd + 7, rrw, bd - 7);
  room('stor', 'Storage / receiving', 'storage', 1, cw + 2 * rrw, sd, W - cw - 2 * rrw, bd); door('sales', 'stor', 4, 'double'); door('stor', 'office', 3); door('stor', 'elec', 3); door('stor', 'outside', 3, 'swing', 'back'); door('cooler', 'stor', 3);
  return { summary: 'Convenience store: the sales floor with a walk-in cooler across its back, two restrooms, office, electrical and storage with receiving behind.', ...B.raw(), ...comSkin(t, 'Brick veneer and metal panel', 'Steel frame with light-gauge infill, steel joists') };
}

// an office building: lobby and a double-loaded corridor, suites either side, a core of restrooms, janitor, electrical
// and mechanical rooms and the stair (two stairs and an elevator on more than one floor); a small one-story office is
// a lobby, corridor, offices, conference and break rooms
export function officeDesign(t) {
  const W = t.W, D = t.D, F = t.floors || 1, B = builder(), { room, door, win } = B, med = t.use === 'medical', side = !t.attached;
  const floorA = W * D;
  if (floorA < 6000 && F === 1) return smallOffice(t);
  const cw = 6, fz = r2(clamp(D * 0.42, 22, 34)), cy = fz, by = fz + cw, bz = D - by;
  if (bz < 22) return smallOffice(t);
  const lobW = Math.min(24, Math.max(14, W * 0.2)), lx = r2((W - lobW) / 2), suiteN = Math.max(1, Math.round(lx / 30)), sw = lx / suiteN;
  const add = (pref, f, x, y, w, d, nm, ty = 'office') => room(pref, nm, ty, f, x, y, w, d);
  // the core along the back of the corridor: stair, elevator, restrooms, janitor, electrical, mechanical, storage
  let coreW = W >= 100 ? 70 : Math.min(W - 24, 58); const two = F > 1 || floorA > 8000;
  const parts = [['stair', 'Stair', 'stair', 10], ...(F > 1 ? [['elev', 'Elevator', 'other', 8]] : []), ['rrw', "Women's restroom", 'restroom', W >= 70 ? 12 : 9], ['rrm', "Men's restroom", 'restroom', W >= 70 ? 12 : 9], ['jan', 'Janitor', 'janitor', 4], ['elec', 'Electrical', 'electrical', 6], ['mech', 'Mechanical', 'mechanical', 8]];
  const partW = parts.reduce((s, p) => s + p[3], 0), minW = partW * 0.72; if (coreW < minW) { parts.splice(parts.findIndex(p => p[0] === 'jan'), 1); coreW = Math.min(W, Math.max(coreW, (partW - 4) * 0.72)); }
  const scale = coreW / parts.reduce((s, p) => s + p[3], 0), cd = Math.min(20, bz); let cx0 = r2((W - coreW) / 2); if (cx0 < 12) { cx0 = 0; coreW = W; } else if (W - cx0 - coreW < 12) { coreW = r2(W - cx0); }
  const scale2 = coreW / parts.reduce((s, p) => s + p[3], 0);
  for (let f = 1; f <= F; f++) {
    const lob = f === 1 ? add('lobby', 1, lx, 0, lobW, fz, 'Lobby', 'lobby') : add('elob', f, lx, 0, lobW, fz, 'Elevator lobby / open office', 'office');
    if (f === 1) { door(lob, 'outside', 6, 'storefront', 'front'); win(lob, 'front', 2, 6, 8); } else win(lob, 'front', 2, 5, 6);
    const corr = add('corr', f, 0, cy, W, cw, 'Corridor', 'corridor'); door(lob, corr, 8, 'opening');
    // suites across the front either side of the lobby
    for (const [x0, n] of [[0, suiteN], [lx + lobW, suiteN]]) for (let i = 0; i < n; i++) { const x = r2(x0 + i * sw), xe = i === n - 1 ? r2(x0 + n * sw) : r2(x0 + (i + 1) * sw), s = add('suite', f, x, 0, xe - x, fz, (med ? 'Medical suite ' : 'Suite ') + (f * 100 + B.rooms.filter(r => r.floor === f && /suite/i.test(r.name)).length + 1)); door(corr, s, 3); win(s, 'front', Math.max(1, Math.floor(sw / 10)), 5, 6); if (side && x <= 0.01) win(s, 'left', 1, 5, 6); if (side && xe >= W - 0.01) win(s, 'right', 1, 5, 6); }
    // the core and the suites either side of it along the back
    let x = cx0; parts.forEach(([id, nm, ty, w], pi) => { const ww = pi === parts.length - 1 ? r2(cx0 + coreW - x) : r2(w * scale2), rid = add(id, f, x, by, ww, cd, nm, ty); if (id !== 'elev') door(corr, rid, ty === 'stair' ? 3.5 : 3); else door(corr, rid, 3.5, 'opening'); x += ww; });
    if (cd < bz) { const st = add('stor', f, cx0, by + cd, coreW, bz - cd, 'Storage / IT', 'storage'); door(B.rooms.find(r => r.floor === f && r.name === 'Mechanical').id, st, 3); }
    for (const [x0, w, lft] of [[0, cx0, true], [cx0 + coreW, W - cx0 - coreW, false]]) if (w >= 12) { const n = Math.max(1, Math.round(w / 30)), ww = w / n; for (let i = 0; i < n; i++) { const xa = r2(x0 + i * ww), xb = i === n - 1 ? r2(x0 + w) : r2(x0 + (i + 1) * ww), s = add('suite', f, xa, by, xb - xa, bz, (med ? 'Medical suite ' : 'Suite ') + (f * 100 + B.rooms.filter(r => r.floor === f && /suite/i.test(r.name)).length + 1)); door(corr, s, 3); win(s, 'back', Math.max(1, Math.floor(ww / 10)), 5, 6); if (side && lft && i === 0) win(s, 'left', 1, 5, 6); if (side && !lft && i === n - 1) win(s, 'right', 1, 5, 6); } }
    // the second stair at the left end of the corridor; exits
    if (two) { const s2 = add('stair2', f, 0, cy, 10, cw, 'Stair 2', 'stair'); const cr = B.rooms.find(r => r.id === corr); cr.x = 10; cr.w = r2(W - 10); door(corr, s2, 3.5); if (f === 1) door(s2, 'outside', 3, 'swing', 'left'); }
    if (f === 1) { door(corr, 'outside', 3, 'swing', 'right'); door(B.rooms.find(r => r.floor === 1 && r.name === 'Stair').id, 'outside', 3, 'swing', 'back'); }
  }
  return { summary: (F > 1 ? F + '-story' : 'One-story') + (med ? ' medical office' : ' office') + ': lobby and a double-loaded corridor, suites front and back, a core of restrooms, janitor, electrical and mechanical rooms' + (F > 1 ? ', elevator and two stairs' : '') + '.', ...B.raw(),
    ...comSkin(t, 'Brick, stone and EIFS with aluminum storefront', F > 2 || W * D > 25000 ? 'Steel frame, composite deck, steel joists' : 'Wood or light-gauge steel frame, open-web joists') };
}
function smallOffice(t) {
  const W = t.W, D = t.D, B = builder(), { room, door, win } = B, side = !t.attached, med = t.use === 'medical';
  const lw = r2(Math.min(14, Math.max(10, W * 0.3))), lx = r2((W - lw) / 2), ld = 12, cw = 5, cx = r2((W - cw) / 2), bk = 9, hb = 4, hy = D - bk - hb;
  room('lobby', med ? 'Reception / waiting' : 'Lobby / reception', med ? 'reception' : 'lobby', 1, lx, 0, lw, ld); door('lobby', 'outside', 6, 'storefront', 'front'); win('lobby', 'front', 1, 6, 8);
  room('corr', 'Corridor', 'corridor', 1, cx, ld, cw, hy - ld); door('lobby', 'corr', 4, 'opening');
  room('xhall', 'Hall', 'corridor', 1, 0, hy, W, hb); door('corr', 'xhall', 4, 'opening');
  // offices either side of the lobby at the front (off the lobby), and down both sides of the corridor
  for (const [x, w, s] of [[0, lx, 'left'], [lx + lw, W - lx - lw, 'right']]) if (w >= 8) { const id = room('fo', med ? 'Exam' : 'Office', med ? 'exam' : 'office', 1, x, 0, w, ld); door('lobby', id, 3); win(id, 'front', 1, 4, 5); if (side) win(id, s, 1, 4, 5); }
  for (const [x, w, s] of [[0, cx, 'left'], [cx + cw, W - cx - cw, 'right']]) {
    const n = Math.max(1, Math.round((hy - ld) / 12)), dd = (hy - ld) / n;
    for (let i = 0; i < n; i++) { const nm = i === n - 1 && !med ? (x === 0 ? 'Conference' : 'Break room') : med ? 'Exam' : 'Office', ty = nm === 'Conference' ? 'conference' : nm === 'Break room' ? 'break_room' : med ? 'exam' : 'office', ya = r2(ld + i * dd), yb = i === n - 1 ? hy : r2(ld + (i + 1) * dd); const id = room('o', nm, ty, 1, x, ya, w, yb - ya); door('corr', id, 3); if (side) win(id, s, w >= 12 ? 2 : 1, 4, 5); }
  }
  // the back row off the cross hall: two restrooms, janitor, mechanical / electrical, storage with the service door
  const parts = [['rr1', 'Restroom', 'restroom', 7], ['rr2', 'Restroom', 'restroom', 7], ['jan', 'Janitor', 'janitor', 4], ['mech', 'Mechanical / electrical', 'mechanical', 8]];
  let x = 0; for (const [id, nm, ty, w] of parts) { room(id, nm, ty, 1, x, D - bk, w, bk); door('xhall', id, 3); x += w; }
  if (W - x >= 6) { room('stor', 'Storage', 'storage', 1, x, D - bk, W - x, bk); door('xhall', 'stor', 3); door('stor', 'outside', 3, 'swing', 'back'); } else B.rooms.find(r => r.id === 'mech').w = r2(W - x + 8);
  door('xhall', 'outside', 3, 'swing', side ? 'left' : 'back');
  return { summary: 'One-story ' + (med ? 'medical office' : 'office') + ': reception at the front, a central corridor with offices' + (med ? ' and exam rooms' : ', conference and break rooms') + ' either side, restrooms, janitor, mechanical and storage off a cross hall at the back.', ...B.raw(), ...comSkin(t, 'Brick and stone with aluminum storefront', 'Wood frame with engineered trusses (V-B)') };
}
// a church: narthex across the front, the sanctuary behind it, a wing of classrooms, offices, restrooms and the kitchen
export function churchDesign(t) {
  const W = t.W, D = t.D, B = builder(), { room, door, win } = B, side = !t.attached;
  if (W < 50 || D < 50) return hallDesign(t, 'Sanctuary', 'sanctuary');
  const nd = 14, ww = r2(clamp(W * 0.3, 22, 30)), sx = 0, sw = W - ww, sd = D - nd;
  room('narthex', 'Narthex', 'lobby', 1, 0, 0, W, nd); door('narthex', 'outside', 6, 'double', 'front'); door('narthex', 'outside', 6, 'double', 'front'); win('narthex', 'front', Math.max(2, Math.floor(W / 12)), 6, 8);
  room('sanct', 'Sanctuary', 'sanctuary', 1, sx, nd, sw, sd); door('narthex', 'sanct', 6, 'double'); door('narthex', 'sanct', 6, 'double'); door('sanct', 'outside', 3, 'swing', 'left'); door('sanct', 'outside', 3, 'swing', 'back'); if (side) win('sanct', 'left', Math.max(2, Math.floor(sd / 16)), 4, 8);
  // the wing: a corridor down its inside edge, rooms along the outside wall
  const cx = sw, cw = 6, rx = sw + cw, rw = ww - cw;
  room('corr', 'Corridor', 'corridor', 1, cx, nd, cw, sd); door('narthex', 'corr', 6, 'opening'); door('sanct', 'corr', 3.5); door('corr', 'outside', 3, 'swing', 'back');
  const rows = [['rrw', "Women's restroom", 'restroom', 14], ['rrm', "Men's restroom", 'restroom', 14], ['mech', 'Mechanical / electrical', 'mechanical', 8], ['office', 'Church office', 'office', 12], ['class', 'Classroom', 'classroom', 20], ['class', 'Classroom', 'classroom', 20], ['kitchen', 'Kitchen / fellowship', 'commercial_kitchen', 16], ['stor', 'Storage', 'storage', 6]];
  let y = nd, i = 0; for (const [id, nm, ty, d0] of rows) { if (y >= D - 4) break; const d = Math.min(d0, D - y); if (i === rows.length - 1 || D - y - d < 10) { const rid = room(id, nm, ty, 1, rx, y, rw, D - y); door('corr', rid, 3); break; } const rid = room(id, nm, ty, 1, rx, y, rw, d); door('corr', rid, ty === 'classroom' ? 3 : 3); if (ty === 'classroom' && side) win(rid, 'right', 2, 4, 5); if (ty === 'office' && side) win(rid, 'right', 1, 4, 5); y += d; i++; }
  return { summary: 'Church: narthex across the front, the sanctuary behind it, and a wing with restrooms, office, classrooms, a kitchen and the mechanical room off a corridor.', ...B.raw(), ...comSkin(t, 'Brick and stone with a metal roof over the sanctuary', 'Steel frame with long-span joists over the sanctuary, wood or steel frame at the wing') };
}
// an assembly or amenity hall: the hall with restrooms, storage, mechanical and a kitchenette at the back
export function hallDesign(t, name = 'Hall', type = 'other') {
  const W = t.W, D = t.D, B = builder(), { room, door, win } = B, bd = Math.min(12, D * 0.3);
  room('hall', name, type, 1, 0, 0, W, D - bd); door('hall', 'outside', 6, 'double', 'front'); win('hall', 'front', Math.max(2, Math.floor(W / 10)), 6, 7); door('hall', 'outside', 3, 'swing', 'left');
  const parts = [['rr1', 'Restroom', 'restroom', 7], ['rr2', 'Restroom', 'restroom', 7], ['jan', 'Janitor', 'janitor', 4], ['mech', 'Mechanical / electrical', 'mechanical', 7]]; let x = 0;
  for (const [id, nm, ty, w] of parts) { room(id, nm, ty, 1, x, D - bd, w, bd); door('hall', id, 3); x += w; }
  if (W - x >= 8) { room('kit', W - x >= 12 ? 'Kitchenette' : 'Storage', W - x >= 12 ? 'break_room' : 'storage', 1, x, D - bd, W - x, bd); door('hall', 'kit', 3.5, 'opening'); door('kit', 'outside', 3, 'swing', 'back'); }
  else { B.rooms.find(r => r.id === 'mech').w = r2(W - x + 7); }
  return { summary: 'Hall with restrooms, janitor, mechanical and a kitchenette across the back.', ...B.raw(), ...comSkin(t, 'Brick and fiber cement with a standing-seam metal roof', 'Wood frame with trusses (V-B)') };
}

// a warehouse: an office block at the front left (lobby, offices, break room, two restrooms off a hall), the warehouse
// with dock doors across the back, an electrical room and the sprinkler riser room on the warehouse wall
export function warehouseDesign(t) {
  const W = t.W, D = t.D, B = builder(), { room, door, win } = B;
  const ow = r2(clamp(W * 0.25, 30, 56)), od = r2(clamp(D * 0.2, 28, 40)), hw = 5;
  // front row: lobby, offices; second row: hall; third row: restrooms, break room, electrical
  const rd = 12, hy = rd, bd = od - rd - hw;
  room('lobby', 'Lobby', 'lobby', 1, 0, 0, 12, rd); door('lobby', 'outside', 3, 'storefront', 'front'); win('lobby', 'front', 1, 5, 7);
  const offN = Math.max(1, Math.floor((ow - 12) / 12)), offW = (ow - 12) / offN; for (let i = 0; i < offN; i++) { const id = room('off', 'Office', 'office', 1, 12 + i * offW, 0, offW, rd); door('hall', id, 3); win(id, 'front', 1, 4, 6); }
  room('hall', 'Hall', 'corridor', 1, 0, hy, ow, hw); door('lobby', 'hall', 4, 'opening');
  room('rr1', "Women's restroom", 'restroom', 1, 0, hy + hw, 9, bd); room('rr2', "Men's restroom", 'restroom', 1, 9, hy + hw, 9, bd); door('hall', 'rr1', 3); door('hall', 'rr2', 3);
  const bx = 18, bw = ow - bx - 6 >= 8 ? ow - bx - 6 : 0; if (bw) { room('break', 'Break room', 'break_room', 1, bx, hy + hw, bw, bd); door('hall', 'break', 3); }
  room('elec', 'Electrical', 'electrical', 1, bx + bw, hy + hw, ow - bx - bw, bd); door('hall', 'elec', 3);
  room('wh', 'Warehouse', 'warehouse', 1, ow, 0, W - ow, D); room('wh2', 'Warehouse', 'warehouse', 1, 0, od, ow, D - od); door('hall', 'wh', 3); door('wh', 'wh2', Math.min(24, ow - 2), 'opening');
  const docks = Math.max(1, Math.min(16, Math.floor((W - ow) / 36))); for (let i = 0; i < docks; i++) door('wh', 'outside', 10, 'overhead', 'back');
  door('wh', 'outside', 12, 'overhead', 'right'); door('wh', 'outside', 3, 'swing', 'right'); door('wh', 'outside', 3, 'swing', 'back'); door('wh2', 'outside', 3, 'swing', 'left');
  room('riser', 'Riser room', 'mechanical', 1, 0, D - 8, 8, 8); const w2 = B.rooms.find(r => r.id === 'wh2'); w2.d = r2(D - od - 8); room('wh3', 'Warehouse', 'warehouse', 1, 8, D - 8, ow - 8, 8); door('wh2', 'wh3', Math.min(20, ow - 10), 'opening'); door('wh3', 'riser', 3); door('riser', 'outside', 3, 'swing', 'back');
  win('lobby', 'left', 1, 4, 6);
  return { summary: 'Warehouse: an office block at the front left (lobby, offices, break room and restrooms off a hall), the warehouse with dock doors across the back, electrical and riser rooms.', ...B.raw(),
    ...comSkin(t, 'Painted concrete tilt-wall panels with storefront at the office', 'Concrete tilt-wall with steel joists and girders on steel columns') };
}

// a multi-tenant shell (retail): bays across the front, each with an accessible restroom and a back room with the
// service door; an electrical / riser room at one end
export function retailDesign(t) {
  const W = t.W, D = t.D, B = builder(), { room, door, win } = B, n = clamp(Math.round(W / 30), 1, 14), bw = W / n, bd = Math.min(16, Math.max(12, D * 0.14)), er = n > 1 ? 6 : 0;
  for (let i = 0; i < n; i++) {
    const x0 = r2(i * bw), w0 = (i === n - 1 ? W : r2((i + 1) * bw)) - x0, sp = 'sp' + i, rr = 'rr' + i, bh = 'bh' + i, last = i === n - 1;
    room(sp, n > 1 ? 'Tenant ' + (i + 1) : 'Tenant', 'tenant', 1, x0, 0, w0, D - bd); door(sp, 'outside', 6, 'storefront', 'front'); win(sp, 'front', Math.max(1, Math.floor(w0 / 9)), 6, 8);
    room(rr, 'Restroom', 'restroom', 1, x0, D - bd, 7, 8); door(sp, rr, 3);
    const ex = last && er ? er : 0;
    room(bh, 'Back of house', 'storage', 1, x0 + 7, D - bd, w0 - 7 - ex, bd); door(sp, bh, 3); door(bh, 'outside', 3, 'swing', 'back');
    if (bd > 8) { room('st' + i, 'Storage', 'storage', 1, x0, D - bd + 8, 7, bd - 8); door(bh, 'st' + i, 2.5); }
    if (ex) { room('elec', 'Electrical / riser', 'electrical', 1, x0 + w0 - ex, D - bd, ex, bd); door('elec', 'outside', 3, 'swing', 'back'); }
    if (!t.attached && i === 0) win(sp, 'left', 1, 6, 8); if (!t.attached && last) win(sp, 'right', 1, 6, 8);
    if (w0 * (D - bd) > 3000 && (i === 0 || last)) door(sp, 'outside', 3, 'swing', i === 0 ? 'left' : 'right');
  }
  return { summary: 'Retail shell: ' + n + ' tenant bay' + (n > 1 ? 's' : '') + ' across the front, each with an accessible restroom and a back room with its service door' + (er ? '; an electrical and riser room at the end' : '') + '.', ...B.raw(),
    ...comSkin(t, 'Brick, stone and EIFS with aluminum storefront', t.construction && t.construction.startsWith('II') ? 'Masonry and steel, steel joists' : 'Wood or light-gauge steel frame, open-web joists') };
}
export const isRes = use => RES.includes(use);
