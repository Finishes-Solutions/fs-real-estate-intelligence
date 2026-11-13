// Self storage from the Jones Road Self Storage site plan (lib/storagesite.mjs): the official plan put down on its own
// parcel (the survey's boundary, the county's rougher outline, the same outline turned, reversed or with the front set on
// another side) with every building where the engineer drew it and the plan's numbers (221 units, 24,275 rentable sf,
// $302,820 a year of rent); and the same arrangement on other lots, with the number of buildings asked for.
import assert from 'node:assert/strict';
import * as S from '../lib/siteplan.mjs';
import * as ST from '../lib/storagesite.mjs';
import * as PF from '../lib/proforma.mjs';
import * as Q from '../lib/quicklayouts.mjs';
import { LOTS } from '../scripts/layout-review.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, msg + ': ' + a + ' vs ' + b);
const origin = [-95.577635, 29.94525], F = S.frame(origin);
// the survey's boundary as the site plan draws it (sheet x toward Woodedge Drive, y toward the east line) laid on the
// ground: Woodedge (south) along the county outline's south line, the west line on the church tract's
const south = F.toFt([-95.57763, 29.94455])[1], west = F.toFt([-95.57795, 29.945])[0], east = F.toFt([-95.57732, 29.945])[0];
const e0 = (west + east) / 2 - 201.55 / 2, toGround = ([X, Y]) => [e0 + Y, south + 523.58 - X];
const SURVEY = ST.JONES_RD.ring.map(toGround); // counter-clockwise; edge 1 is Woodedge Drive
// the county (StratMap / HCAD) outline of APN 0460430000203 as the app reads it: 5 points, ~199 x 513 ft
const COUNTY = [[-95.57795, 29.94596], [-95.57732, 29.94595], [-95.57732, 29.94455], [-95.57795, 29.94455], [-95.57795, 29.9446]].map(F.toFt); // edge 2 is Woodedge
const planOf = (ring, front, o) => ({ ring, origin, front, setbacks: o.setbacks, program: o.program, elements: o.elements.map((e, i) => ({ ...e, id: 'e' + i })) });
const bad = pl => S.check(pl).filter(i => i.level === 'bad').map(i => i.text);
const byName = (els, n) => els.find(e => e.name === n);
const inside = (pl, msg) => { const shrunk = S.offsetRing(pl.ring, 0.01); for (const e of pl.elements) for (const p of S.shapeOf(e)) assert.ok(S.inRing(p, shrunk) || S.inRing(p, pl.ring), msg + ': ' + (e.name || e.kind) + ' stays on the lot'); };

// ---------- the official plan on the survey's boundary: exactly as drawn ----------
{
  const o = ST.storageAsDrawn(SURVEY, 1); assert.ok(o, 'the survey boundary is the plan’s parcel');
  assert.equal(o.fitFt, 0, 'no error on the survey boundary'); near(S.ringArea(SURVEY) / 43560, 2.4163, 0.001, 'Tract 1, 2.4163 acres');
  const pl = planOf(SURVEY, 1, o), els = pl.elements, B = els.filter(e => e.kind === 'building');
  assert.deepEqual(bad(pl), [], 'passes every hard check'); inside(pl, 'survey');
  // the buildings and their sizes as the budget lists them (Bldg 1-7 and the leasing office)
  const want = { 'Bldg 1': 2500, 'Bldg 2': 2500, 'Bldg 3': 2200, 'Bldg 4': 750, 'Bldg 5': 1800, 'Bldg 6': 1950, 'Bldg 7': 15275, 'Leasing office': 750 };
  assert.deepEqual(Object.fromEntries(B.map(e => [e.name, S.gfaOf(e)])), want, 'every building, the budget’s size');
  // drawn sizes: footprints off the sheet (Bldg 7 is 235 x 65 ft less its two 5 x 10 ft notches)
  for (const [n, a] of [['Bldg 1', 2500], ['Bldg 2', 2500], ['Bldg 3', 2200], ['Bldg 4', 750], ['Bldg 5', 1800], ['Bldg 6', 1950], ['Bldg 7', 15175], ['Leasing office', 750]]) near(S.elArea(byName(els, n)), a, 0.5, n + ' footprint');
  // where they sit: distances to the survey's lines as the plan dimensions them
  const W = [SURVEY[0], SURVEY[1]], E = [SURVEY[2], SURVEY[3]], WOOD = [SURVEY[1], SURVEY[2]], dist = (p, [a, b]) => Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
  const minTo = (e, L) => Math.min(...S.shapeOf(e).map(p => dist(p, L)));
  near(minTo(byName(els, 'Bldg 1'), W), 9.95, 0.02, 'the west row 10 ft off the west line'); near(minTo(byName(els, 'Bldg 6'), E), 10, 0.05, 'the east row 10 ft off the east line');
  near(minTo(byName(els, 'Leasing office'), WOOD), 25.41, 0.05, 'the office 25.5 ft from Woodedge (dimensioned at its middle; the nearest corner 25.4: the line is skewed)');
  const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  const pd = (P, Q) => Math.min(...P.flatMap(p => Q.map((a, i) => segD(p, a, Q[(i + 1) % Q.length])))), gapX = (a, b) => { const A = S.shapeOf(byName(els, a)), Bp = S.shapeOf(byName(els, b)); return Math.min(pd(A, Bp), pd(Bp, A)); }; // (the gap between two outlines)
  near(gapX('Bldg 6', 'Bldg 5'), 20, 0.01, '20 ft between Bldgs 6 and 5'); near(gapX('Bldg 5', 'Bldg 4'), 25, 0.01, '25 ft between Bldgs 5 and 4'); near(gapX('Bldg 1', 'Bldg 2'), 20, 0.01, '20 ft between Bldgs 1 and 2');
  near(gapX('Bldg 7', 'Bldg 3'), 25, 0.01, '25 ft between the interior building and Bldg 3'); near(gapX('Bldg 6', 'Bldg 7'), 30, 0.2, 'the 30 ft aisle (Bldg 6 to Bldg 7)');
  // pond, parking, fence and gate, entrance
  const pond = els.find(e => e.kind === 'pond'); near(S.elArea(pond), 17600, 0.5, 'the 17,600 sf pond'); assert.equal(pond.wall, 2, 'walled');
  const lots = els.filter(e => e.kind === 'parking'); assert.deepEqual(lots.map(e => S.stalls(e).count), [9, 10, 5, 5], '29 spaces drawn: 9 and 10 at the interior building, 5 and 5 at the office');
  assert.ok(els.some(e => e.name === 'Loading zone'), 'the hatched loading area');
  const gate = els.find(e => e.gate), fence = els.find(e => e.kind === 'fence' && !e.gate); assert.ok(gate && fence, 'fence and gate');
  near(Math.hypot(gate.path[1][0] - gate.path[0][0], gate.path[1][1] - gate.path[0][1]), 21.8, 0.05, 'the gate across the 27.5 ft aisle');
  const ent = byName(els, 'Entrance'); assert.ok(ent, 'the entrance'); near(Math.min(...ent.poly.map(p => dist(p, WOOD))), 0, 0.05, 'the entrance runs to Woodedge');
  near(Math.max(...ent.poly.map(p => dist(p, W))) - Math.min(...ent.poly.map(p => dist(p, W))), 35.9, 0.1, 'a 36 ft entrance (less half an inch each side)');
  // the numbers: the plan's unit table, its rents
  const m = S.metrics(pl); assert.deepEqual([m.storage.units, Math.round(m.storage.nrsf), m.gfa], [221, 24275, 27725], '221 units, 24,275 rentable sf, 27,725 sf built');
  assert.equal(m.buildings, 8); assert.equal(m.pond, 17600);
  assert.equal(B.filter(e => e.storageUnits).reduce((s, e) => s + e.rentMo, 0) * 12, 302820, 'the rent roll: $302,820 a year');
  const R = PF.run(pl); near(R.ops.gpr, 302820, 1, 'the pro forma’s gross rent is the plan’s'); assert.equal(R.area.storageUnits, 221);
  assert.ok(o.notes.some(n => /unit table/.test(n)), 'says the unit counts are the table’s, and where the drawing differs');
  assert.deepEqual([ST.JONES_RD.units, ST.JONES_RD.rentableSf, ST.JONES_RD.rentMo * 12], [221, 24275, 302820]);
}

// ---------- on the county's outline: the plan still goes down, by the best fit, and says so ----------
{
  const o = ST.storageAsDrawn(COUNTY, 2); assert.ok(o, 'the county outline is close enough to the survey');
  assert.ok(o.fitFt > 3 && o.fitFt < 8, 'about 6 ft off at the corners: ' + o.fitFt);
  const pl = planOf(COUNTY, 2, o); assert.deepEqual(bad(pl), [], 'passes on the county outline'); inside(pl, 'county');
  assert.ok(o.notes.some(n => /county’s parcel outline is rougher/.test(n)), 'says the outline isn’t the survey');
  assert.ok(o.setbacks.front < 25, 'setbacks read looser by the fit');
  assert.equal(S.metrics(pl).storage.units, 221);
}

// ---------- turned, reversed, the front set on a long side: the same plan ----------
{
  const ref = ST.storageAsDrawn(SURVEY, 1).elements, rel = els => { const a = byName(els, 'Bldg 1'), b = byName(els, 'Bldg 7'), c = byName(els, 'Leasing office'); return [Math.hypot(a.x - b.x, a.y - b.y), Math.hypot(a.x - c.x, a.y - c.y), Math.hypot(b.x - c.x, b.y - c.y)]; };
  const t = 37 * Math.PI / 180, turn = SURVEY.map(([x, y]) => [x * Math.cos(t) - y * Math.sin(t) + 300, x * Math.sin(t) + y * Math.cos(t) - 120]);
  const o1 = ST.storageAsDrawn(turn, 1); assert.ok(o1 && o1.fitFt < 1e-6, 'turned 37°'); rel(o1.elements).forEach((d, i) => near(d, rel(ref)[i], 0.02, 'turned: the same distances'));
  const rev = SURVEY.slice().reverse(); // clockwise: Woodedge is edge 1 of the reversed ring too ([2]->[1])
  const o2 = ST.storageAsDrawn(rev, 1); assert.ok(o2 && o2.fitFt < 1e-6, 'a clockwise ring'); rel(o2.elements).forEach((d, i) => near(d, rel(ref)[i], 0.02, 'reversed: the same distances'));
  const o3 = ST.storageAsDrawn(SURVEY, 0); assert.ok(o3, 'front set on the west line'); assert.ok(o3.notes.some(n => /front street is set on another side/.test(n)), 'says it put the entrance on Woodedge'); rel(o3.elements).forEach((d, i) => near(d, rel(ref)[i], 0.02, 'front elsewhere: the same plan'));
  const pl3 = planOf(SURVEY, 0, o3); const ent = byName(pl3.elements, 'Entrance'); assert.ok(ent.poly.some(p => Math.abs(p[1] - south) < 2), 'still entering from Woodedge');
}

// ---------- not this parcel: no official plan ----------
for (const k of ['rect5', 'pad1', 'narrow7', 'wedge10']) { const p = LOTS[k].plan(); assert.equal(ST.storageAsDrawn(p.ring, p.front ?? S.longestEdge(p.ring)), null, k + ': not the Jones Road parcel'); }
{ const big = SURVEY.map(([x, y]) => [x * 1.08, y * 1.08]); assert.equal(ST.storageAsDrawn(big, 1), null, '8% bigger: not the parcel'); }

// ---------- the arrangement on other lots ----------
const touches = (a, b, g = 2) => S.rectsOverlap({ poly: S.grow(S.shapeOf(a), g) }, { poly: S.shapeOf(b) }, 0);
function sound(name, plan, o) {
  const pl = { ...plan, setbacks: o.setbacks, program: o.program, elements: o.elements.map((e, i) => ({ ...e, id: 'e' + i })) };
  assert.deepEqual(bad(pl), [], name + ': passes every hard check'); inside(pl, name);
  const drives = pl.elements.filter(e => e.kind === 'drive');
  for (const e of pl.elements.filter(e => e.kind === 'building' && e.storage === 'drive')) assert.ok(drives.some(d => touches(e, d)), name + ': ' + e.name + ' opens onto a drive');
  assert.ok(pl.elements.some(e => e.gate) && pl.elements.some(e => e.name === 'Entrance') && pl.elements.some(e => e.storage === 'office'), name + ': gate, entrance and office');
  return { pl, m: S.metrics(pl), B: pl.elements.filter(e => e.kind === 'building' && e.storage !== 'office') };
}
{ // on the Jones Road lot: the plan's arrangement, close to the plan's numbers
  const o = ST.storagePattern(SURVEY, 1); const { m, B } = sound('Jones Road lot', { ring: SURVEY, origin, front: 1 }, o);
  assert.equal(B.length, 7, 'seven storage buildings, as the plan'); assert.ok(m.storage.units > 200 && m.storage.units < 235, 'units near the plan’s 221: ' + m.storage.units);
  for (const n of [3, 5, 9]) { const r = sound(n + ' buildings', { ring: SURVEY, origin, front: 1 }, ST.storagePattern(SURVEY, 1, { buildings: n })); assert.equal(r.B.length, n, n + ' buildings asked, ' + n + ' drawn'); }
  const two = ST.storagePattern(SURVEY, 1, { buildings: 2 }); assert.equal(two.elements.filter(e => e.kind === 'building' && e.storage !== 'office').length, 3, 'too few asked: one a row and the interior building'); assert.ok(two.notes.some(n => /At least 3 buildings/.test(n)), 'and says so');
}
for (const k of ['rect5', 'narrow7', 'wedge10', 'trap20', 'notch8']) {
  const plan = LOTS[k].plan(), front = plan.front ?? S.longestEdge(plan.ring), o = ST.storagePattern(plan.ring, front);
  assert.ok(o, k + ': a layout'); const { m, B } = sound(k, plan, o);
  assert.ok(B.length >= 3 && m.storage.units > 100, k + ': ' + B.length + ' buildings, ' + m.storage.units + ' units');
  const pond = o.elements.find(e => e.kind === 'pond'); assert.ok(S.elArea(pond) > 0.1 * S.ringArea(plan.ring), k + ': a pond of about a sixth of the site');
}
assert.equal(ST.storagePattern(LOTS.pad1.plan().ring, 0), null, 'a 1.1 acre pad is too small for the arrangement');

// ---------- the Quick layouts type ----------
{
  const t = Q.quickTypes(2.42, 201.5).find(x => x.id === 'storage'); assert.ok(t && t.count >= 3, 'Self storage on the Jones Road lot');
  const set = Q.quickSet('storage', 2.42, 201.5, { buildings: 5 });
  assert.deepEqual(set.slice(0, 2).map(q => [q.template, q.buildings]), [['asdrawn', 0], ['pattern', 5]], 'the official plan first (as drawn), then the arrangement with the buildings asked for');
  assert.ok(!Q.quickSet('storage', 10, 600).some(q => q.template === 'asdrawn'), 'the official plan only on a lot its size');
  assert.equal(ST.storageQuick(SURVEY, 1, set[0]).asDrawn, 'jones-rd'); assert.equal(ST.storageQuick(SURVEY, 1, set[1]).elements.filter(e => e.kind === 'building' && e.storage !== 'office').length, 5);
  assert.ok(!Q.quickSet('industrial', 10, 600).some(q => /storage/i.test(q.ask)), 'self storage moved out of Industrial');
}
console.log('storage site ok');
