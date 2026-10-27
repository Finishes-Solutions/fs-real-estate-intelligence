// OP-0046: 0 Old Houston Highway at FM 362, Waller (Waller CAD accounts 10687, 10682 and 10680, 16.16 acres), rebuilt in
// Projects from the three sheets the team drew up: the BD-0046 parcel map, the OP-0046 shopping center site plan (the
// land west of the drainage channel: six stores in a row, 138,145 sq ft, and a 7,000 sq ft restaurant pad at the
// corner) and the OP-0046 5.8-acre retail center site plan (the strip along FM 362: four retail buildings, 28,000 sq ft,
// and two retention ponds). The sheets were read as vectors (build/projects/op-0046.drawing.json: every parking stripe,
// building box and pond outline in sheet points) and are placed on the real parcel outlines here:
//   the shopping center sheet is drawn at 1.3178 pt/ft and its west edge is the parcels' 1,099 ft west line, so it is
//     pinned at the site's north-west corner; the retail center sheet is at 1.717 pt/ft (its 100 ft buildings and 9 ft
//     stalls) with FM 362 and the south line as its east and south edges, so it is pinned at the south-east corner;
//   buildings keep the labelled width and the depth that gives the labelled floor area exactly (the sheets' outlines
//     are a foot or two deeper than their stated areas; the restaurant pad is drawn 64'-6" x 124'-7" but labelled
//     7,000 sq ft, so it is 64.5 x 108.5 ft here);
//   parking rows are where the sheets draw them, at the app's 9 x 18 ft stalls (the shopping center sheet's stripes
//     scale to about 6.5 ft wide, so the app counts fewer spaces there than the sheet's 732; the retail center's 98 come
//     out the same);
//   the two retention ponds and the drainage channel are the sheets' outlines, the channel kept as a no-build area.
// buildProject(parcels) takes the three accounts' records (api/building.js normalizeCad shape: propId, owner, situs,
// marketValue, landValue, geometry) and returns the project document the app syncs (src/siteplan.js, api/projects.js).
import fs from 'node:fs';
import * as SP from '../../lib/siteplan.mjs';

const here = new URL('.', import.meta.url);
export const DRAWING = JSON.parse(fs.readFileSync(new URL('op-0046.drawing.json', here), 'utf8'));
export const FALLBACK_PARCELS = JSON.parse(fs.readFileSync(new URL('op-0046.parcels.json', here), 'utf8'));

export const PROJECT = {
  id: 'op-0046-waller-fm362',
  code: 'OP-0046',
  name: 'OP-0046 · 0 Old Houston Hwy at FM 362, Waller',
  county: 'Waller',
  apns: ['10687', '10682', '10680'], // the biggest parcel first: the plan's main parcel
  optionName: 'Option A · OP-0046 as drawn',
  use: 'Shopping center (138,145 sf), 7,000 sf restaurant pad and a 28,000 sf retail center with retention ponds',
  notes: 'Rebuilt from the OP-0046 sheets (shopping center site plan of Oct 19, 2026, 5.8-acre retail center site plan of Oct 14, 2026) and the BD-0046 parcel map of Sep 4, 2026. '
    + 'Three Waller CAD accounts: 10687 (Priya Capital LLC, 9.36 ac), 10682 (Market Square Commons LLC, 0.93 ac) and 10680 (Waller Heritage Plaza LLC, 5.88 ac); 16.16 acres, assessed $1,648,410 (2026). '
    + 'Sheet totals: shopping center 138,145 sf (Bealls 30,000; clothing 31,579; grocery 32,626; home decor 21,693; dollar store 11,475; pet store 10,772), 732 spaces (33 accessible); restaurant 7,000 sf, 19 spaces (3 accessible); '
    + 'retail center 28,000 sf (5,000 + 5,000 + 6,000 + 12,000), 98 spaces (10 accessible), retention ponds 10,531 and 14,215 sf, 12 ft deep. '
    + 'Buildings are at their labelled widths and stated floor areas; parking rows are where the sheets draw them at 9 x 18 ft stalls, so the app’s space counts are its own. '
    + 'Option B is the 5.8-acre tract on its own (the retail center east of the channel, about 4.35 acres of parcel 10680) with the Oct 2026 project budget on its pro forma: $2,500,000 of land, the budget’s $114.41 a sf hard cost (entered as $105.91 plus the app’s 5% contingency), its $841,120 of site work, $25 a sf tenant improvements and $25.20 a sf rent; '
    + 'the app’s own vacancy, taxes, recoveries, commissions, soft costs, fee and interest stay, which the budget leaves out or runs at 0% vacancy. The budget’s shell carries no building plumbing, HVAC or electrical (only fire sprinklers, site lighting and fire alarm): an allowance of about $22 a sf would take hard cost to about $136. '
    + 'Rent check (Oct 2026 listings): Waller retail asks average about $19.85 a sf (LoopNet), new strip space at 2230 Field Store Rd asks $30 to $40 NNN (Crexi), so $25.20 sits inside the range for new construction on FM 362 but above the town average.'
};

const r2 = v => +(+v).toFixed(2);
const RAD = Math.PI / 180;
const unit = ([x, y]) => { const L = Math.hypot(x, y) || 1; return [x / L, y / L]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

// ---------- the parcels ----------
// the three accounts' records -> the project's parcel list (src/siteplan.js parcelOf) and the site (SP.unionParcels)
export function siteOf(parcels) {
  const recs = PROJECT.apns.map(apn => { const p = parcels.find(x => String(x.propId) === apn); if (!p?.geometry) throw new Error('No outline for Waller CAD account ' + apn); return p; });
  const site = SP.unionParcels(recs.map(r => r.geometry));
  if (!site || site.pieces > 1) throw new Error('The three parcels did not merge into one site');
  const F = SP.frame(site.origin);
  const ftOf = g => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map(p => p[0].slice(0, -1).map(F.toFt));
  const list = recs.map(p => { const rings = ftOf(p.geometry), ring = rings[0], c = SP.centroid(ring), ll = F.toLL(c);
    const acres = rings.reduce((s, r) => s + SP.ringArea(r), 0) / 43560;
    return { key: 'pid:' + p.propId, label: p.situs || p.owner || 'Parcel', owner: p.owner || '', propId: String(p.propId), marketValue: p.marketValue || null, landValue: p.landValue || null,
      acres: +acres.toFixed(3), center: ll.map(v => +v.toFixed(6)), geometry: JSON.parse(JSON.stringify(p.geometry, (k, v) => typeof v === 'number' ? +v.toFixed(7) : v)), ft: ring }; });
  // landmarks the sheets are pinned to: the north-west corner of 10687 (the top of the 1,099 ft west line) and the
  // south-east corner of 10680 (FM 362 at the south line)
  const nw = list[0].ft.reduce((b, p) => p[1] > b[1] ? p : b), se = list[2].ft.reduce((b, p) => p[0] - p[1] > b[0] - b[1] ? p : b);
  return { site, F, parcels: list, nw, se };
}

// ---------- sheet points -> plan feet ----------
export function fits({ nw, se }) {
  const sh = DRAWING.shop, rt = DRAWING.retail;
  return {
    shop: ([x, y]) => [nw[0] + (x - sh.anchor[0]) / sh.scale, nw[1] - (y - sh.anchor[1]) / sh.scale],
    shopLen: pt => pt / sh.scale,
    retail: ([x, y]) => [se[0] - (rt.anchor[0] - x) / rt.scale, se[1] + (rt.anchor[1] - y) / rt.scale],
    retailLen: pt => pt / rt.scale
  };
}

// ---------- the pieces, in sheet points ----------
// buildings: the box the sheet draws (page x0..x1, y0..y1) with the labelled width and the stated floor area
const SHOP_BUILDINGS = [
  { id: 'bealls', name: 'Bealls', sf: 30000, box: [877.62, 1103.07, 297.09, 531.12], w: 170, dim: '170 ft wide' },
  { id: 'clothing', name: 'Clothing store', sf: 31579, box: [890.83, 1101.86, 532, 794.21], w: 160, dim: '160 ft wide' },
  { id: 'grocery', name: 'Grocery store', sf: 32626, box: [915.49, 1074.05, 795.09, 1156.16], d: 274, dim: '274 ft long' },
  { id: 'homedecor', name: 'Home decor', sf: 21693, box: [890.83, 1101.86, 1157.04, 1337.13], w: 160, dim: '160 ft wide' },
  { id: 'dollar', name: 'Dollar store', sf: 11475, box: [877.62, 1103.62, 1338.02, 1427.62], w: 170, dim: '170 ft wide' },
  { id: 'pet', name: 'Pet store', sf: 10772, box: [891.71, 1101.64, 1428.5, 1518.11], w: 160, dim: '160 ft wide' }
];
// the restaurant pad: its outline's corners on the sheet (long sides at 106°, short at 16°), 64'-6" x 124'-7" drawn, 7,000 sf stated
const PAD = { id: 'restaurant', name: 'Restaurant', sf: 7000, centre: [1586.0, 477.0], w: 64.5, rotPage: 16 };
const RETAIL_BUILDINGS = [
  { id: 'retail3', name: 'Retail 3', sf: 6000, box: [971.62, 1143.3, 761.78, 864.8], w: 100 },
  { id: 'retail4', name: 'Retail 4', sf: 12000, box: [950.75, 1053.77, 977.38, 1322.73], w: 60 },
  { id: 'retail1', name: 'Retail 1', sf: 5000, box: [792.21, 963.9, 1458.37, 1544.21], w: 100 },
  { id: 'retail2', name: 'Retail 2', sf: 5000, box: [998.23, 1167.94, 1458.37, 1544.21], w: 100 }
];
// the retail center's rows: the stall band's box on the sheet and which way its aisle lies (page directions: n up, s down)
const RETAIL_ROWS = [
  { id: 'r1', box: [777.48, 1055.62, 1330.33, 1361.23], aisle: 's', note: 'North row of the south module' },
  { id: 'r2', box: [777.48, 1133.16, 1412.73, 1443.64], aisle: 'n', note: 'South row of the south module · 4 accessible at the east end' },
  { id: 'r3', box: [1144.87, 1175.77, 965, 1134.61], aisle: 'e', note: 'Along the FM 362 drive, north of the entrance' },
  { id: 'r4', box: [1144.87, 1175.77, 1211.86, 1401], aisle: 'e', note: 'Along the FM 362 drive, south of the entrance · 3 accessible' },
  { id: 'r5', box: [1068.49, 1099.39, 1000.69, 1330.33], aisle: 'e', note: 'In front of Retail 4' },
  { id: 'r6', box: [952.16, 1145.29, 880.09, 910.9], aisle: 's', note: 'In front of Retail 3 · 3 accessible at the west end' }
];
// drives the rows don't carry themselves
const RETAIL_DRIVES = [
  { id: 'd-fm362', box: [1175.77, 1212, 880.09, 1556.95], name: 'Drive along FM 362', note: 'Drive inside the FM 362 line from the 35 ft entrance (opposite the row break) north to Retail 3 and south past Retail 2' },
  { id: 'd-turn', box: [1133.16, 1175.77, 1401, 1443.64], name: '', note: 'The south module\u2019s east end, where it meets the FM 362 drive' },
  { id: 'd-module', box: [777.48, 1133.16, 1361.23, 1412.73], name: '', note: '30 ft aisle of the south module (66 ft module)' },
  { id: 'd-r3', box: [952.16, 1175.77, 910.9, 962], name: '', note: '30 ft aisle between Retail 3 and Retail 4' },
  { id: 'd-r4', box: [1099.39, 1144.87, 962, 1412.73], name: '', note: '26 ft aisle in front of Retail 4, from the Retail 3 aisle to the south module' }
];
const SHOP_DRIVES = [
  { id: 'd-service', box: [840, 878, 297.09, 1518.11], name: 'Service drive', note: '29 ft service and loading drive behind the stores, along the west line' },
  { id: 'd-main', box: [1135, 1166.7, 289, 1543.5], name: 'Main aisle', note: '24 ft aisle between the stores\u2019 front rows and the parking field, the north drive to the south exit' },
  { id: 'd-cross1', box: [1166.7, 1452, 836, 868], name: '', note: '24 ft cross aisle between the first and second blocks of the field' },
  { id: 'd-cross2', box: [1166.7, 1373, 1094, 1125.6], name: '', note: '24 ft cross aisle between the second and third blocks of the field' },
  { id: 'd-cross3', box: [1135, 1240, 1518, 1543.5], name: '', note: 'The main aisle\u2019s turn east at the south end' }
];
// drives at an angle: centre (page), length and width (ft), the drive's direction on the page (degrees, y down)
const SHOP_TURNED_DRIVES = [
  { id: 'd-north', centre: [1178.2, 280.6], len: 492, w: 22, ang: 17, name: 'North drive', note: '24 ft drive inside the Old Houston Hwy line, the angled rows along it, from the service drive to the restaurant pad' },
  { id: 'd-diag1', centre: [1436.9, 930.7], len: 505, w: 24, ang: 109.4, name: 'East aisle', note: '24 ft aisle along the long row beside the drainage channel' },
  { id: 'd-diag2', centre: [1274.5, 1387.9], len: 195, w: 24, ang: 109.4, name: '', note: '24 ft aisle along the south row beside the drainage channel' },
  { id: 'd-pad1', centre: [1492.8, 465.4], len: 146, w: 24, ang: 106, name: 'Pad drive', note: '24 ft drive down the west side of the restaurant pad, from the north drive to the pad\u2019s south side' },
  { id: 'd-pad2', centre: [1520, 595.8], len: 70, w: 22, ang: 16, name: '', note: '24 ft drive along the south side of the restaurant pad, to the east aisle' }
];
// driveways from Old Houston Hwy: where the sheet's entry arrows are along the north line (page x), 26 ft wide, 60 ft in
const SHOP_DRIVEWAYS = [{ x: 918, w: 26, d: 60 }, { x: 1165, w: 24, d: 56 }, { x: 1512, w: 26, d: 60 }]; // the middle one runs into the main aisle between the stores' front rows and the field
const NORTH_EDGE = { from: [826.48, 130.87], slope: 0.3057 }; // the sheet's north line: y = 130.87 + (x - 826.48) * tan 17°

// ---------- building the option ----------
function rectFromBox(fit, len, box, w, d, extra) {
  const [x0, x1, y0, y1] = box, c = fit([(x0 + x1) / 2, (y0 + y1) / 2]);
  return { x: r2(c[0]), y: r2(c[1]), w: r2(w ?? len(x1 - x0)), d: r2(d ?? len(y1 - y0)), rot: 0, ...extra };
}
const building = (id, name, sf, rect, note, use = 'retail') => ({ id: 'op46-' + id, kind: 'building', ...rect, use, floors: 1, name, note, pinned: true });

export function buildOption(S, { now }) {
  const { shop, shopLen, retail, retailLen } = fits(S), els = [];
  // buildings: labelled width (or length), depth for the stated floor area
  for (const b of SHOP_BUILDINGS) {
    const w = b.w ?? r2(b.sf / b.d), d = b.d ?? r2(b.sf / b.w);
    els.push(building(b.id, b.name, b.sf, rectFromBox(shop, shopLen, b.box, w, d), b.sf.toLocaleString('en-US') + ' sf · ' + b.dim + ' (OP-0046 shopping center sheet)'));
  }
  { const c = shop(PAD.centre); els.push({ id: 'op46-' + PAD.id, kind: 'building', x: r2(c[0]), y: r2(c[1]), w: PAD.w, d: r2(PAD.sf / PAD.w), rot: -PAD.rotPage, use: 'restaurant', floors: 1, name: PAD.name, note: '7,000 sf restaurant pad on the 0.9 acre corner, square to Old Houston Hwy (drawn 64’-6" x 124’-7" on the sheet)', pinned: true }); }
  for (const b of RETAIL_BUILDINGS) els.push(building(b.id, b.name, b.sf, rectFromBox(retail, retailLen, b.box, b.w, r2(b.sf / b.w)), b.sf.toLocaleString('en-US') + ' sf · ' + b.w + ' ft wide (OP-0046 retail center sheet)'));
  const buildings = els.slice();
  // drives
  for (const d of SHOP_DRIVES) els.push({ id: 'op46-' + d.id, kind: 'drive', ...rectFromBox(shop, shopLen, d.box), name: d.name, note: d.note, pinned: true });
  for (const d of SHOP_TURNED_DRIVES) { const c = shop(d.centre); els.push({ id: 'op46-' + d.id, kind: 'drive', x: r2(c[0]), y: r2(c[1]), w: d.len, d: d.w, rot: -d.ang, name: d.name, note: d.note, pinned: true }); }
  SHOP_DRIVEWAYS.forEach(({ x, w, d }, i) => { const E = [x, NORTH_EDGE.from[1] + (x - NORTH_EDGE.from[0]) * NORTH_EDGE.slope], e = shop(E), inward = unit([-Math.sin(17 * RAD), -Math.cos(17 * RAD)]); // page (-sin17, cos17) is down-left; y flips
    els.push({ id: 'op46-dw' + (i + 1), kind: 'drive', x: r2(e[0] + inward[0] * d / 2), y: r2(e[1] + inward[1] * d / 2), w, d, rot: -17, name: 'Driveway ' + (i + 1) + ' from Old Houston Hwy', note: w + ' ft driveway, square to Old Houston Hwy, where the sheet\u2019s entry arrows are', pinned: true }); });
  for (const d of RETAIL_DRIVES) els.push({ id: 'op46-' + d.id, kind: 'drive', ...rectFromBox(retail, retailLen, d.box), name: d.name, note: d.note, pinned: true });
  // parking: the shopping center's rows from the sheet's stripes (each row its 18 ft stall band plus 12 ft of its aisle),
  // the retail center's rows as 18 ft bands beside the drives drawn above
  const rows = [];
  const fieldRows = DRAWING.shop.rows.filter(r => r[5] >= 5).map(([ang, fx, fy, tx, ty, n]) => { const a = shop([fx, fy]), b = shop([tx, ty]); return { c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], L: Math.hypot(b[0] - a[0], b[1] - a[1]), u: unit([Math.cos(ang * RAD), -Math.sin(ang * RAD)]), n }; });
  const mean = fieldRows.reduce((s, r) => [s[0] + r.c[0] / fieldRows.length, s[1] + r.c[1] / fieldRows.length], [0, 0]);
  const touches = p => buildings.some(bd => SP.hitRect({ ...bd, w: bd.w + 28, d: bd.d + 28 }, p)); // within 14 ft of a building
  fieldRows.forEach((r, i) => {
    let a = null; const u = r.u, nrm = [-u[1], u[0]], ep = [r.c[0] + 9 * u[0], r.c[1] + 9 * u[1]], em = [r.c[0] - 9 * u[0], r.c[1] - 9 * u[1]];
    // the rows across from this one along its stalls (same direction, side by side): facing it over an aisle (34 to 52 ft
    // between the stripes' middles) or back to back with it (14 to 22 ft); the nearest of each
    const near = { facing: null, back: null };
    for (const q of fieldRows) { if (q === r || Math.abs(u[0] * q.u[1] - u[1] * q.u[0]) > Math.sin(5 * RAD)) continue; const dd = [q.c[0] - r.c[0], q.c[1] - r.c[1]], along = dot(dd, u), across = dot(dd, nrm);
      if (Math.abs(across) > (r.L + q.L) / 2) continue; const g = Math.abs(along);
      if (g >= 34 && g <= 52 && (!near.facing || g < near.facing.g)) near.facing = { g, s: Math.sign(along) };
      if (g >= 14 && g <= 22 && (!near.back || g < near.back.g)) near.back = { g, s: Math.sign(along) }; }
    if (touches(ep) && !touches(em)) a = [-u[0], -u[1]]; else if (touches(em) && !touches(ep)) a = u; // heads at a building: the aisle is the other way
    else if (near.facing) a = near.facing.s > 0 ? u : [-u[0], -u[1]];
    else if (near.back) a = near.back.s > 0 ? [-u[0], -u[1]] : u;
    else a = dot([mean[0] - r.c[0], mean[1] - r.c[1]], u) >= 0 ? u : [-u[0], -u[1]]; // else toward the middle of the field
    // the band: 18 ft of stalls, its head edge pulled in where a back-to-back row is drawn under 18 ft away
    const headIn = near.back && near.back.g < 18 ? (18 - near.back.g) / 2 : 0, t0 = -9 + headIn, t1 = 9 + headIn, tc = (t0 + t1) / 2, rot = Math.atan2(a[1], a[0]) / RAD - 90; // row: 1 means the aisle is on the row's local +y side (lib/siteparking.mjs), so local +y points at the aisle
    r.a = a; r.nrm = nrm; r.facing = near.facing;
    rows.push({ id: 'op46-row' + (i + 1), kind: 'parking', x: r2(r.c[0] + tc * a[0]), y: r2(r.c[1] + tc * a[1]), w: r2(r.L), d: r2(t1 - t0), rot: r2(((rot % 360) + 360) % 360), row: 1, stallRot: 0, name: '', note: 'Row of ' + (r.n - 1) + ' on the sheet (6.5 ft stripes) · 9 x 18 ft stalls here', pinned: true });
  });
  els.push(...rows);
  // the aisle between two rows that face each other, as paving of its own (the sheet's lots are one connected field):
  // the gap between their bands, over both rows' length; not where one of the drives above already runs
  const drives = () => els.filter(e => e.kind === 'drive'), onDrive = p => drives().some(dv => SP.hitRect(dv, p));
  fieldRows.forEach((r, i) => fieldRows.forEach((q, j) => { if (j <= i || !r.facing) return; const d = [q.c[0] - r.c[0], q.c[1] - r.c[1]], along = dot(d, r.u), across = dot(d, r.nrm);
    if (Math.abs(r.u[0] * q.u[1] - r.u[1] * q.u[0]) > Math.sin(5 * RAD) || Math.abs(across) > (r.L + q.L) / 2 || Math.abs(along) < 34 || Math.abs(along) > 52 || Math.sign(along) !== Math.sign(dot(r.a, r.u))) return;
    const g = Math.abs(along), s0 = Math.min(-r.L / 2, across - q.L / 2), s1 = Math.max(r.L / 2, across + q.L / 2), mid = [(r.c[0] + q.c[0]) / 2, (r.c[1] + q.c[1]) / 2]; // across the aisle, and the union of the two rows' extents along it
    const c = [mid[0] + r.nrm[0] * (s0 + s1) / 2 - r.nrm[0] * across / 2, mid[1] + r.nrm[1] * (s0 + s1) / 2 - r.nrm[1] * across / 2];
    if (onDrive(mid)) return;
    els.push({ id: 'op46-aisle' + (i + 1) + '-' + (j + 1), kind: 'drive', x: r2(c[0]), y: r2(c[1]), w: r2(s1 - s0), d: r2(g - 18), rot: r2(((Math.atan2(r.nrm[1], r.nrm[0]) / RAD) % 360 + 360) % 360), name: '', note: Math.round(g - 18) + ' ft aisle between two rows', pinned: true }); }));
  // a row whose aisle side meets no drive yet gets its own 24 ft strip (12 ft where 24 would run into another row)
  const bands = rows.slice();
  fieldRows.forEach((r, i) => { const probe = [r.c[0] + 15 * r.a[0], r.c[1] + 15 * r.a[1]]; if (onDrive(probe)) return;
    for (const strip of [24, 12]) { const c = [r.c[0] + (9 + strip / 2) * r.a[0], r.c[1] + (9 + strip / 2) * r.a[1]], e = { id: 'op46-strip' + (i + 1), kind: 'drive', x: r2(c[0]), y: r2(c[1]), w: r2(r.L), d: strip, rot: r2(((Math.atan2(r.nrm[1], r.nrm[0]) / RAD) % 360 + 360) % 360), name: '', note: strip + ' ft aisle beside the row', pinned: true };
      if (bands.some(b => SP.rectsOverlap(b, e, 0.5)) || buildings.some(b => SP.rectsOverlap(b, e, 0.5)) || !SP.corners(e).every(q => SP.inRing(q, S.site.ring))) continue; els.push(e); break; } });
  const DIR = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] };
  for (const r of RETAIL_ROWS) { const [x0, x1, y0, y1] = r.box, a = DIR[r.aisle], c = retail([(x0 + x1) / 2, (y0 + y1) / 2]), L = retailLen(a[0] ? y1 - y0 : x1 - x0), rot = Math.atan2(a[1], a[0]) / RAD - 90;
    rows.push({ id: 'op46-' + r.id, kind: 'parking', x: r2(c[0]), y: r2(c[1]), w: r2(L), d: 18, rot: r2(((rot % 360) + 360) % 360), row: 1, stallRot: 0, name: '', note: r.note + ' · 9 x 18 ft stalls, the aisle beside it', pinned: true }); }
  els.push(...rows.filter(e => !els.includes(e)));
  // a row or drive drawn up against the line can poke a foot past it where the sheet and the county differ: nudged in
  for (const e of els) { if (e.kind !== 'parking' && e.kind !== 'drive') continue; const inside = () => SP.corners(e).every(p => SP.inRing(p, S.site.ring)); if (inside()) continue;
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dx, dy]) => SP.rotPt([dx, dy], e.rot || 0)); let done = false;
    for (let step = 0.5; step <= 4 && !done; step += 0.5) for (const dv of dirs) { const t = { ...e, x: r2(e.x + dv[0] * step), y: r2(e.y + dv[1] * step) }; if (SP.corners(t).every(p => SP.inRing(p, S.site.ring))) { e.x = t.x; e.y = t.y; done = true; break; } } }
  const ponds = []; let channel = null;
  for (const [i, p] of DRAWING.retail.ponds.entries()) { const poly = p.poly.map(retail), P = SP.signedArea(poly) < 0 ? poly.reverse() : poly, c = SP.centroid(P), xs = P.map(q => q[0]), ys = P.map(q => q[1]);
    ponds.push({ id: 'op46-' + p.name.toLowerCase().replace(' ', ''), kind: 'pond', poly: P.map(q => q.map(r2)), x: r2(c[0]), y: r2(c[1]), w: r2(Math.max(...xs) - Math.min(...xs)), d: r2(Math.max(...ys) - Math.min(...ys)), rot: 0, labelAt: c.map(r2), name: p.name + ' (retention)', note: 'Retention ' + p.name.toLowerCase() + ' on the sheet: ' + p.sf.toLocaleString('en-US') + ' sf, 12 ft deep (drawn ' + Math.round(SP.ringArea(P)).toLocaleString('en-US') + ' sf here)', pinned: true }); }
  { const poly = DRAWING.retail.channel.map(retail), P = SP.signedArea(poly) < 0 ? poly.reverse() : poly, c = SP.centroid(P), xs = P.map(q => q[0]), ys = P.map(q => q[1]);
    channel = { id: 'op46-channel', kind: 'keepout', poly: P.map(q => q.map(r2)), x: r2(c[0]), y: r2(c[1]), w: r2(Math.max(...xs) - Math.min(...xs)), d: r2(Math.max(...ys) - Math.min(...ys)), rot: 0, name: 'Drainage channel', note: 'The channel both sheets draw between the shopping center and the retail center (not surveyed): nothing is built or paved on it', pinned: true }; }
  // the paving under and between all of it: the sheets' lots are continuous asphalt, so the gaps between rows, at the
  // ends of aisles and where the angled rows meet the straight ones are paved too (lib/siteplan.mjs fieldsOf closes
  // gaps up to about 32 ft), kept off the buildings, the ponds and the channel; counted once in the numbers
  const avoid = buildings.concat(ponds, [channel]);
  SP.fieldsOf(els, S.site.ring, { reach: 16, cell: 2, avoid, minSf: 1500 }).forEach((ring, i) => els.push(SP.fieldPiece(ring, 'op46-field' + (i + 1), { pinned: true, note: (i === 0 ? 'The shopping center\u2019s lot' : 'Paving') + ': the sheet\u2019s asphalt under and between the rows and aisles, counted once' })));
  els.push(...ponds, channel);
  // the site: front on FM 362 (the long east line), Old Houston Hwy along the north
  const ring = S.site.ring, out = ring.map((_, k) => SP.outwardOf(ring, k)), len = ring.map((_, k) => SP.edgeLen(ring, k));
  const east = ring.map((_, k) => k).filter(k => out[k][0] > 0.85 && len[k] > 50), north = ring.map((_, k) => k).filter(k => out[k][1] > 0.85 && len[k] > 50);
  const front = east.sort((a, b) => len[b] - len[a])[0], streets = east.filter(k => k !== front).concat(north).sort((a, b) => a - b), streetNames = {};
  for (const k of east) streetNames[k] = 'FM 362'; for (const k of north) streetNames[k] = 'Old Houston Hwy';
  return { id: 'op46-optA', name: PROJECT.optionName, origin: S.site.origin, ring, src: 'parcels', front, frontGuess: false, streets, streetsSet: true, streetsBy: 2, streetNames,
    setbacks: { ...SP.SETBACKS }, parcel: S.parcels[0].key, parcels: S.parcels.map(p => p.key), zoning: null,
    program: { use: 'retail', storm: 'retention' }, params: { storm: { depth: 12 } }, elements: els, created: now, updated: now };
}

// Option B: the retail center's tract on its own (the land east of the drainage channel the 5.8-acre sheet covers:
// about 4.35 acres of parcel 10680), with the team's budget numbers on its pro forma (the Oct 2026 "Budget For
// Projects 4.0" workbook): the project budget's shell cost, its site work, $25 tenant improvements, $2,500,000 of
// land and $25.20 rent; the app's own vacancy, taxes, recoveries, commissions, soft costs and fee stay, which is what
// the budget leaves out. The pieces are Option A's, as drawn.
export const TRACT_PF = {
  landPrice: 2500000, landClosingPct: 1.5, // the budget's land for the tract ($5,600,000 for all 16.1 acres)
  hard: { retail: 105.91 }, // the budget's hard cost $114.41 a sf less its own $8.50 contingency line (the app adds 5% contingency of its own)
  ti: { retail: 25 }, // the budget's tenant improvement allowance
  sitePrepPsf: 2.73, pavingPsf: 6.82, stallCost: 2500, pondPerAcFt: 27300, // the app's site lines scaled to the budget's $841,120 of infrastructure
  commRent: { retail: 25.2 } // the budget's $2.10 a sf a month (the app's Waller range is $18 to $24 NNN: check comps)
};
export function buildTractOption(S, A, { now }) {
  const { retail } = fits(S), wedge = [[545.31, 1581.87], [990.85, 323.88], [1209.55, 323.88], [1220.92, 1570.57]].map(retail), ring = SP.tidyRing(wedge, 0.1);
  const els = A.elements.filter(e => e.kind !== 'keepout' && SP.inRing([e.x, e.y], ring)).map(e => ({ ...e, id: e.id.replace(/^op46-/, 'op46b-') }));
  const out = ring.map((_, k) => SP.outwardOf(ring, k)), len = ring.map((_, k) => SP.edgeLen(ring, k)), front = ring.map((_, k) => k).filter(k => out[k][0] > 0.85).sort((a, b) => len[b] - len[a])[0] ?? 0;
  return { id: 'op46-optB', name: 'Option B · 5.8-acre tract, budget inputs', origin: A.origin, ring, src: 'drawn', front, frontGuess: false, streets: [], streetsSet: true, streetsBy: 2, streetNames: { [front]: 'FM 362' },
    setbacks: { ...SP.SETBACKS }, parcel: 'pid:10680', parcels: ['pid:10680'], zoning: null, program: { use: 'retail', storm: 'retention' }, params: { storm: { depth: 12 } }, elements: els, pf: { ...TRACT_PF, hard: { ...TRACT_PF.hard }, ti: { ...TRACT_PF.ti }, commRent: { ...TRACT_PF.commRent } }, created: now, updated: now };
}
export function buildProject(parcels, { now = new Date().toISOString() } = {}) {
  const S = siteOf(parcels), plan = buildOption(S, { now }), tract = buildTractOption(S, plan, { now });
  return { id: PROJECT.id, name: PROJECT.name, status: 'prospect', use: PROJECT.use, notes: PROJECT.notes, parcels: S.parcels.map(({ ft, ...p }) => p), plans: [plan, tract], created: now, updated: now, by: 'Claude Code (from the OP-0046 sheets)' };
}

// what was built, in numbers (for the seed script's log and the test)
export function summary(doc) {
  const pl = doc.plans[0], m = SP.metrics(pl), B = pl.elements.filter(e => e.kind === 'building');
  const by = Object.fromEntries(B.map(e => [e.name, Math.round(SP.gfaOf(e))]));
  const overlaps = [];
  for (let i = 0; i < pl.elements.length; i++) for (let j = i + 1; j < pl.elements.length; j++) { const a = pl.elements[i], b = pl.elements[j]; if (a.kind === 'keepout' || b.kind === 'keepout') continue;
    const paved = e => SP.PAVED.includes(e.kind); if (paved(a) && paved(b) && (a.kind !== 'parking' || b.kind !== 'parking')) continue; /* paving on paving is one surface; two rows may not cross */ if (SP.rectsOverlap(a, b, 0.5)) overlaps.push(a.id + ' × ' + b.id); }
  const outside = pl.elements.filter(e => !SP.shapeOf(e).every(p => SP.inRing(p, pl.ring))).map(e => e.id);
  return { acres: +m.acres.toFixed(2), buildings: B.length, gfa: Math.round(m.gfa), byBuilding: by, spaces: m.spaces, stalls: m.stalls, ada: m.ada, required: m.required, pondSf: Math.round(m.pond), coveragePct: +(m.coverage * 100).toFixed(1), imperviousPct: +(m.impervious * 100).toFixed(1), elements: pl.elements.length, overlaps, outside, front: pl.front, streets: pl.streets, streetNames: pl.streetNames };
}
