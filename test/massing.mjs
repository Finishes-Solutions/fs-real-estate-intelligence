// The site plan's 3D facades (lib/massing.mjs) on real layouts: apartments, townhome rows and a 140-home subdivision
// laid out by the engine on the review sites. Run: node test/massing.mjs
import assert from 'node:assert/strict';
import * as S from '../lib/siteplan.mjs';
import * as L from '../lib/sitelayout.mjs';
import * as PD from '../lib/plandesign.mjs';
import { facades, roofPieces, C } from '../lib/massing.mjs';
import { LOTS } from '../scripts/layout-review.mjs';

const lay = (lot, ask) => { const p0 = LOTS[lot].plan(), prog = S.guessProgram(ask), o = L.layoutOptions(p0, prog)[0]; return { ...p0, elements: o.elements, program: o.program || prog, zones: o.zones }; };
const buildings = plan => plan.elements.filter(e => e.kind === 'building');
const near = (p, ring) => Math.min(...ring.map((a, i) => { const b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }));
const mid = r => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
const glassy = new Set([C.glass, C.store]), skinParts = x => x.parts.filter(q => q.b <= 0.01 && !q.hole && !Object.values(C).includes(q.c));
// the walls cover the building: points just inside its outline, along every edge, sit under a ground-floor skin
function covered(e, x) {
  const o = S.outline(e), ins = S.offsetRing(S.signedArea(o) >= 0 ? o : o.slice().reverse(), -0.6), sk = skinParts(x);
  for (let i = 0; i < ins.length; i++) { const a = ins[i], b = ins[(i + 1) % ins.length]; for (const t of [0.1, 0.5, 0.9]) { const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; if (!sk.some(q => S.inRing(p, q.ring))) return p; } }
  return null;
}

// roof pieces: a stepped front is one main hip and a smaller one per bay; together they are the outline
{ const fp = [[0, 0], [30, 0], [30, -6], [60, -6], [60, 0], [120, 0], [120, 50], [0, 50]], P = roofPieces(fp);
  assert.deepEqual(P[0], { x: 0, y: 0, w: 120, d: 50 }, 'the main body first, under one hip'); assert.equal(P.length, 2);
  assert.equal(P.reduce((s, p) => s + p.w * p.d, 0), S.ringArea(fp), 'the pieces are the outline'); }

// apartments: every building detailed, its walls round it, its windows on its walls, balconies and breezeways
const apt = lay('rect5', 'apartments 120 units'), A = facades(apt);
for (const e of buildings(apt).filter(e => e.use === 'multifamily')) {
  const x = A.get(e.id); assert.ok(x, 'apartment building ' + e.id + ' has facades');
  const o = S.outline(e), miss = covered(e, x); assert.equal(miss, null, e.id + ': the walls cover the building (bare at ' + miss + ')');
  const glass = x.parts.filter(q => glassy.has(q.c)); assert.ok(glass.length >= 20, e.id + ': windows on every floor (' + glass.length + ')');
  for (const g of glass) assert.ok(near(mid(g.ring), o) < 1.5, e.id + ': a window on the outside wall, ' + near(mid(g.ring), o).toFixed(2) + ' ft off');
  assert.ok(x.parts.some(q => q.c === C.rail) && x.parts.some(q => q.c === C.deck), e.id + ': balconies with railings');
  assert.ok(x.sloped && x.parts.some(q => q.c === C.shingle && q.b > x.wallH - 0.01), e.id + ': a hip roof over the walls');
  for (const q of x.parts) for (const p of q.ring) assert.ok(near(p, o) < 9 || S.inRing(p, o), e.id + ': every part within the building, its balconies and eaves');
}
assert.ok([...A.values()].some(x => x.parts.some(q => q.c === C.recess)), 'the breezeways show open');

// a townhome site: each row's units their own siding colour above the brick, a fin at each party wall
const th = lay('rect5', 'townhomes'), T = facades(th), rows = buildings(th).filter(e => e.use === 'townhomes' && (e.units || 1) > 1);
assert.ok(rows.length >= 3, 'townhome rows laid out: ' + rows.length);
for (const e of rows) { const x = T.get(e.id); assert.ok(x, 'row ' + e.id + ' has facades'); assert.equal(covered(e, x), null, e.id + ': the walls cover the row');
  const upper = new Set(x.parts.filter(q => q.b > 1 && q.b < x.wallH && !Object.values(C).includes(q.c)).map(q => q.c)); assert.ok(upper.size >= 2, e.id + ': units in different colours: ' + [...upper]);
  assert.ok(x.parts.filter(q => q.c === C.trim && q.b === 0 && q.h >= x.wallH).length >= (e.units || 1) - 1, e.id + ': a party-wall fin between each pair of units'); }

// the selected building keeps its highlight (no wall finishes over it; its windows and roof stay); Phase 2 stays plain
{ const e = rows[0], fc = S.planFeatures(th, e.id), f = fc.features.find(q => q.properties.id === e.id && q.properties.k === 'building');
  const sel = facades(th, { skip: new Set([e.id]) }).get(e.id); assert.equal(skinParts(sel).length, 0, 'selected: no wall finish over the highlight'); assert.ok(sel.parts.some(q => glassy.has(q.c)), 'selected: its windows still show');
  assert.equal(f.properties.fac, 1, 'the building is drawn with its facade'); assert.equal(f.properties.h, +(T.get(e.id).wallH / 3.280839895).toFixed(1), 'the plain massing stops at the walls’ top, under the roof');
  const p2 = { ...th, elements: th.elements.map(q => q.id === e.id ? { ...q, phase: 2 } : q) }, g = S.planFeatures(p2, null).features.find(q => q.properties.id === e.id && q.properties.k === 'building');
  assert.ok(!g.properties.fac, 'a Phase 2 building stays plain, faint massing'); }

// a 140-home subdivision: homes drawn as a type they only resemble get its design stretched to their size (else the
// plain massing shows past the walls), front doors and garage doors on the house, in a time the map can redraw in
const homes = lay('irreg40', 'single family homes'), H = facades(homes), hs = buildings(homes);
assert.ok(hs.length >= 100, 'a big subdivision: ' + hs.length);
let bare = 0; for (const e of hs) { const x = H.get(e.id); assert.ok(x, 'home ' + e.id + ' has facades'); if (covered(e, x)) bare++; }
assert.equal(bare, 0, 'every home’s walls cover its footprint (' + bare + ' bare)');
{ const types = PD.buildingTypes(homes), off = types.flatMap(t => t.elementIds.map(id => homes.elements.find(q => q.id === id)).filter(e => Math.abs(Math.max(e.w, e.d) - Math.max(t.W, t.D)) > 1 || Math.abs(Math.min(e.w, e.d) - Math.min(t.W, t.D)) > 1));
  assert.ok(off.length > 0, 'some homes are drawn as a type of another size (the case the stretch is for)');
  const doors = [...H.values()].flatMap(x => x.parts.filter(q => q.c === C.door || q.c === C.overhead)); assert.ok(doors.length >= hs.length, 'doors on the homes: ' + doors.length); }
{ facades(homes); const t0 = performance.now(); facades(homes); const ms = performance.now() - t0; assert.ok(ms < 400, 'facades for ' + hs.length + ' homes in ' + ms.toFixed(0) + ' ms'); }

// a retail building: storefront glass, a flat roof behind a parapet with rooftop units
const ret = lay('rect5', 'retail 25000 sf'), R = facades(ret);
for (const e of buildings(ret).filter(e => e.use === 'retail')) { const x = R.get(e.id); assert.ok(x && !x.sloped, 'retail: a flat roof');
  assert.ok(x.parts.some(q => q.hole && q.h > x.wallH + 2), 'retail: a parapet round the roof'); assert.ok(x.parts.some(q => q.c === C.rtu), 'retail: rooftop units'); assert.ok(x.parts.some(q => q.c === C.store), 'retail: storefront glass'); }
console.log('massing ok: apartments', A.size, '· townhome rows', rows.length, '· homes', hs.length, '· retail');
