// AI-crafted building types (lib/customtypes.mjs): the recipe made safe (bounds, aliases, library types, nonsense), the
// program and parking rule it becomes, the outdoor pieces packed, every pattern laid out by the engine on realistic lots
// (a 3 acre lot, a corner lot with a side street, a narrow lot and the 8-sided 19730 FM 362 parcel) with no failing
// checks and enough parking, a re-fit, the team library (api/buildingtypes.js) and the AI step (api/siteplan.js) with
// the model stubbed, answering well, answering nonsense and failing.
import assert from 'node:assert/strict';
import * as S from '../lib/siteplan.mjs';
import * as L from '../lib/sitelayout.mjs';
import * as C from '../lib/customtypes.mjs';
import { readAs } from '../lib/planruns.mjs';

// ---------- recipes the AI might write ----------
const DAYCARE = { name: 'Daycare', pattern: 'commons', buildings: [{ label: 'Daycare', type: null, w: 125, d: 85, floors: 1, count: 1 }], outdoor: [{ kind: 'play', label: 'Fenced playground', w: 120, d: 75, count: 1 }], sites: { label: null, w: null, d: null, count: null },
  parking: { per: 'child', rate: 0.25, basis: 120, label: 'children', plus1k: null }, figures: ['120 children', '10,600 sf'] };
const PICKLE = { name: 'Pickleball club', pattern: 'commons', buildings: [{ label: 'Clubhouse', type: null, w: 100, d: 60, floors: 1, count: 1 }], outdoor: [{ kind: 'court', label: 'Pickleball courts', w: 30, d: 60, count: 8 }, { kind: 'pavilion', label: 'Shade pavilion', w: 40, d: 30, count: 1 }], sites: null,
  parking: { per: 'court', rate: 4, basis: null, label: 'courts', plus1k: 3 }, figures: ['8 courts', '6,000 sf clubhouse'] };
const RV = { name: 'RV park', pattern: 'yard', buildings: [{ label: 'Office / clubhouse', w: 60, d: 40, floors: 1, count: 1 }], outdoor: [], sites: { label: 'RV site', w: 24, d: 55, count: 60 }, parking: { per: 'space', rate: 0.1, label: 'sites', plus1k: 4 }, figures: ['60 RV sites'] };
const WASH = { name: 'Express car wash', pattern: 'row', buildings: [{ label: 'Wash tunnel', w: 130, d: 30, floors: 1, count: 1 }], parking: { per: '1000sf', rate: 6 }, figures: ['130 ft tunnel'] };
const SCHOOL = { name: 'Charter school', pattern: 'pads', buildings: [{ label: 'Classroom building', w: 200, d: 80, floors: 2, count: 1 }, { label: 'Gym', w: 120, d: 100, floors: 1, count: 1 }], parking: { per: 'seat', rate: 0.15, basis: 500, label: 'students' }, figures: ['500 students'] };

// ---------- the recipe made safe ----------
{ const r = C.recipeIn(DAYCARE);
  assert.equal(r.name, 'Daycare'); assert.equal(r.pattern, 'commons'); assert.deepEqual(r.buildings[0], { label: 'Daycare', type: null, w: 125, d: 85, floors: 1, count: 1, ai: true });
  assert.deepEqual(r.outdoor.map(o => [o.key, o.kind, o.w, o.d, o.count]), [['play', 'play', 120, 75, 1]]); assert.equal(r.sites, null, 'sites only for a yard'); assert.ok(r.ai); assert.deepEqual(r.fixed, []);
  assert.deepEqual(C.recipeIn(r), r, 'a recipe read again is the same recipe'); }
{ const r = C.recipeIn(PICKLE); assert.deepEqual(C.recipeIn(r).outdoor.map(o => o.key), ['court', 'pavilion'], 'read again it keeps its pavilion (a building kind, keyed by its own key)'); }
// out of bounds: brought in and listed
{ const r = C.recipeIn({ name: 'Mega venue', pattern: 'commons', buildings: [{ label: 'Hall', w: 5000, d: 9, floors: 30, count: 99 }], outdoor: [{ kind: 'court', label: 'Courts', w: 2, d: 900, count: 400 }, { kind: 'spaceship', w: 10, d: 10, count: 1 }], parking: { per: 'seat', rate: 9, basis: 1e7 } });
  const b = r.buildings[0], o = r.outdoor[0];
  assert.ok(b.w <= C.BOUNDS.w[1] && b.d >= C.BOUNDS.d[0] && b.floors === 6 && b.count === 12, 'building kept in bounds: ' + JSON.stringify(b)); assert.ok(b.w * b.d <= C.BOUNDS.foot[1] + 1);
  assert.deepEqual([o.w, o.d, o.count], [10, 400, 24], 'an outdoor piece in bounds'); assert.equal(r.outdoor.length, 1, 'an unknown kind dropped');
  assert.equal(r.parking.rate, 1, 'a seat asks at most a space'); assert.equal(r.parking.basis, 5000);
  assert.ok(r.fixed.includes('Hall width') && r.fixed.includes('Hall floors') && r.fixed.includes('Courts count') && r.fixed.includes('parking rate'), 'what was brought in is listed: ' + r.fixed.join(', ')); }
// aliases, library types, sizes from floor area, defaults
{ const r = C.recipeIn({ name: 'Dog daycare', buildings: [{ label: 'Kennel', sf: 6000 }, { type: 'other-pavilion-4-000-sf', count: 1 }], outdoor: [{ kind: 'Dog run', count: 3 }, { kind: 'playground' }] });
  assert.equal(r.pattern, 'commons', 'outdoor pieces and no pattern: a commons'); assert.ok(Math.abs(r.buildings[0].w * r.buildings[0].d - 6000) < 120, 'size from its floor area');
  assert.deepEqual([r.buildings[1].type, r.buildings[1].w, r.buildings[1].d, r.buildings[1].ai], ['other-pavilion-4-000-sf', 80, 50, false], 'a library type: its own size, not AI-sized');
  assert.deepEqual(r.outdoor.map(o => [o.key, o.w, o.d, o.count]), [['green', 120, 80, 3], ['play', 64, 48, 1]], 'a dog run is a lawn; typical sizes where none given');
  assert.deepEqual([r.parking.per, r.parking.rate], ['1000sf', 3], 'no rule: 3 per 1,000 sf'); }
assert.equal(C.recipeIn({ name: 'Mini golf', buildings: [], outdoor: [] }), null, 'nothing to draw: no recipe');
assert.equal(C.recipeIn({ name: '', buildings: [{ w: 50, d: 50 }] }), null, 'no name: no recipe');
assert.equal(C.recipeIn('a daycare'), null); assert.equal(C.recipeIn([DAYCARE]), null); assert.equal(C.recipeIn({ name: 'X', buildings: [{ label: 'a', w: 'wide', d: null }] }), null, 'no size at all: nothing to draw');
{ const r = C.recipeIn({ name: 'Venue', buildings: [{ w: 100, d: 80 }], parking: { per: 'seat', rate: 0.3 } }); assert.equal(r.parking.per, '1000sf', 'a rule per seat with no seats counted: the generic rule'); assert.ok(r.fixed.some(t => /parking rule/.test(t))); }
{ const r = C.recipeIn({ name: 'Boat storage', pattern: 'yard', buildings: [], sites: { label: 'Boat space', w: 12, d: 40, count: 80 } }); assert.equal(r.pattern, 'yard'); assert.deepEqual(r.buildings.map(b => b.label), ['Office'], 'a yard gets an office');
  assert.equal(C.recipeIn({ name: 'Yard', pattern: 'yard', buildings: [{ w: 40, d: 30 }] }).pattern, 'row', 'a yard with no sites: a plain row'); }

// ---------- the parking rule and the program ----------
{ const r = C.recipeIn(DAYCARE), q = C.parkingNeed(r); assert.equal(q.spaces, 30); assert.equal(q.text, '0.25 a child × 120 children = 30 spaces');
  const p = C.programOf(r, { storm: 'retention', units: 99 }); assert.equal(p.use, 'other'); assert.equal(p.gfa, 10625); assert.equal(p.storm, 'retention', 'the AI’s site choices ride along'); assert.equal(p.units, undefined);
  assert.ok(Math.abs(S.required(S.normalizeProgram(p), p.gfa) - 30) <= 0, 'the building parks its children'); assert.equal(S.normalizeProgram(p).custom.name, 'Daycare', 'the recipe rides on the program'); assert.equal(C.customOf(S.normalizeProgram(p)).name, 'Daycare');
  assert.equal(C.customOf({ ...S.normalizeProgram(p), use: 'retail' }), null, 'another use picked in Settings: no longer the custom type'); }
{ const r = C.recipeIn(PICKLE), p = C.programOf(r); assert.ok(C.onCourts(r)); assert.equal(C.parkingNeed(r).text, '4 a court × 8 courts + 3 per 1,000 sf of building = 50 spaces');
  assert.equal(p.ratio, 3, 'per court: the building keeps only its own ratio; the courts carry theirs'); assert.equal(p.gfa, 6000); }
{ const n = S.normalizeProgram({ use: 'other', ratio: 40, custom: C.recipeIn({ name: 'Mini golf', buildings: [{ w: 40, d: 40 }], parking: { per: 'seat', rate: 1, basis: 64 } }) }); assert.equal(n.ratio, 40, 'a custom rule may ask more than 15 / 1,000');
  assert.equal(S.normalizeProgram({ use: 'other', ratio: 40 }).ratio, 15, 'any other program keeps its cap'); assert.equal(S.normalizeProgram({ use: 'other', custom: { name: '' } }).custom, undefined); }
{ const p = S.normalizeProgram(C.programOf(C.recipeIn(RV))); assert.equal(p.use, 'storage'); assert.deepEqual([p.storage.rvRows, p.storage.rvW, p.storage.rvD, p.storage.rv, p.storage.officeSf, p.storage.climateSf, p.storage.driveSf], [true, 24, 55, 60, 2400, 0, 0]);
  assert.equal(p.gfa, 2400, 'a yard’s floor area is its office'); assert.equal(p.ratio, 4, 'per site: the sites carry their own');
  assert.deepEqual(S.normalizeProgram({ use: 'storage', storage: { rvRows: true, rvW: 99, rvD: 1 } }).storage.rvW, 40); assert.equal(S.normalizeProgram({ use: 'storage' }).storage.rvRows, undefined, 'plain storage unchanged'); }
{ const p = S.normalizeProgram(C.programOf(C.recipeIn(SCHOOL))); assert.deepEqual([p.gfa, p.floors, p.buildings], [44000, 2, 2], 'two buildings, floors from their mix'); assert.equal(Math.ceil(p.gfa / 1000 * p.ratio - 0.01), 75, '0.15 a student × 500'); }
assert.deepEqual(readAs(S.normalizeProgram(C.programOf(C.recipeIn(DAYCARE))), S.USES), ['Daycare · AI-crafted', '120 children', '10,600 sf', '10,625 sf', '1 story', '1 building', '0.25 spaces a child'], 'read as: its name, figures and rule');

// ---------- the outdoor pieces packed ----------
for (const [o, tall] of [[C.recipeIn(PICKLE).outdoor, false], [C.recipeIn(PICKLE).outdoor, true], [C.recipeIn({ name: 'Swim club', buildings: [{ w: 60, d: 40 }], outdoor: [{ kind: 'pool', count: 1 }, { kind: 'patio', count: 2 }, { kind: 'play' }] }).outdoor, false]]) {
  const pk = C.packOutdoor(o, tall), its = pk.items.filter(i => i.part !== 'deck' && !(i.o.key === 'pool' && !i.part));
  for (const [a, i] of its.entries()) for (const b of its.slice(a + 1)) assert.ok(i.x + i.w <= b.x + 0.01 || b.x + b.w <= i.x + 0.01 || i.y + i.d <= b.y + 0.01 || b.y + b.d <= i.y + 0.01, 'packed pieces never overlap');
  for (const i of pk.items) assert.ok(i.x >= 0 && i.y >= 0 && i.x + i.w <= pk.w + 0.01 && i.y + i.d <= pk.h + 0.01, 'inside the packed ground');
  if (o[0].key === 'court') { const c = pk.items.filter(i => i.o.key === 'court'); assert.equal(c.length, 8); assert.equal(c.filter(i => i.first).length, 1, 'one label for the set'); assert.ok(tall ? pk.h > pk.w : pk.w >= pk.h, 'wide or tall as asked'); }
  else assert.ok(pk.items.some(i => i.part === 'house') && pk.items.some(i => i.part === 'deck'), 'a pool comes with its deck and pool house'); }

// ---------- laid out by the engine on realistic lots ----------
const LOTS = { '3 ac': { ring: [[0, 0], [400, 0], [405, 330], [0, 325]], front: 0 }, corner: { ring: [[0, 0], [420, 0], [420, 300], [0, 300]], front: 0, streets: [1] },
  narrow: { ring: [[0, 0], [160, 0], [160, 700], [0, 700]], front: 0 }, 'FM 362': { ring: [[-441.8, -191.92], [475.3, -185.63], [474.61, -55.83], [354.06, -58.81], [353.81, 31.2], [474.04, 34.19], [472.83, 185.77], [-446.13, 190.03]], front: 7 } };
const lay = (recipe, lot) => { const prog = C.programOf(C.recipeIn(recipe)), plan = { origin: [-95.8245, 29.7855], setbacks: { ...S.SETBACKS }, elements: [], ...LOTS[lot], program: prog }; return { plan, opts: L.layoutOptions(plan, prog, {}) }; };
const of = (plan, o) => ({ ...plan, program: o.program, elements: o.elements });
function sound(name, plan, o, { parked = true } = {}) {
  const pl = of(plan, o), bad = S.check(pl).filter(i => i.level === 'bad'), m = S.metrics(pl);
  assert.equal(bad.length, 0, name + ': passes the checks: ' + bad.map(i => i.text).join('; '));
  if (parked) assert.ok(m.spaces >= m.required, name + ': enough parking ' + m.spaces + ' / ' + m.required);
  assert.ok(S.entrancesOf(o.elements).length >= 1, name + ': a way in from the street');
  const B = o.elements.filter(e => e.kind === 'building' && e.custom && e.use !== 'amenity'); assert.ok(B.length >= 1, name + ': the type’s buildings, named for it');
  for (const e of o.elements.filter(e => e.aiSized)) assert.ok(e.custom, name + ': an AI-sized piece says which type it belongs to');
  assert.ok(o.notes.some(n => /AI-crafted type/.test(n)) && o.notes.some(n => /^Spaces needed by the AI’s rule: /.test(n)), name + ': the rule and the AI’s sizing are on the plan');
  assert.ok(C.customStats(pl), name + ': Numbers reads it'); return { pl, m, B };
}
// commons: the daycare, its playground behind it, on the 3 acre lot and FM 362
for (const lot of ['3 ac', 'FM 362']) {
  const t0 = Date.now(), { plan, opts } = lay(DAYCARE, lot); assert.ok(opts.length >= 2, lot + ': several layouts'); assert.ok(Date.now() - t0 < 30000, 'laid out in reasonable time');
  for (const [i, o] of opts.entries()) { const { pl, m, B } = sound('daycare ' + lot + ' #' + i, plan, o);
    assert.equal(B.length, 1); assert.equal(B[0].name, 'Daycare'); assert.ok(B[0].aiSized && /AI-sized/.test(B[0].note)); assert.ok(Math.abs(S.gfaOf(B[0]) - 10625) < 300, 'the size the recipe gives: ' + S.gfaOf(B[0]));
    const play = o.elements.filter(e => e.kind === 'play'); assert.equal(play.length, 1); assert.ok(play[0].pinned && play[0].aiSized && play[0].name === 'Fenced playground');
    assert.ok(S.gapBetween(S.shapeOf(play[0]), S.shapeOf(B[0])) < 160, 'the playground by the building: ' + Math.round(S.gapBetween(S.shapeOf(play[0]), S.shapeOf(B[0]))));
    assert.ok(!o.elements.some(e => e.kind === 'keepout'), 'the ground held for it is gone'); assert.equal(m.required, 30, 'parked for 120 children');
    assert.equal(C.customStats(pl).rule.text, '0.25 a child × 120 children = 30 spaces'); }
}
// commons on the corner lot (a side street): the pickleball club, 8 courts with their own parking
{ const { plan, opts } = lay(PICKLE, 'corner'); assert.ok(opts.length >= 2);
  for (const [i, o] of opts.entries()) { const { pl, m } = sound('pickleball corner #' + i, plan, o), courts = o.elements.filter(e => e.kind === 'court');
    assert.equal(courts.length, 8, 'all 8 courts'); assert.ok(courts.every(c => c.park === 4 && c.pinned), 'each court parks its players and stays put on a re-fit');
    assert.equal(m.required, Math.ceil(32 + S.gfaOf(o.elements.find(e => e.kind === 'building' && e.custom && e.use === 'other')) * 3 / 1000 - 0.01), 'needed: the courts and the clubhouse');
    assert.ok(o.elements.some(e => e.kind === 'building' && e.name === 'Shade pavilion' && e.use === 'amenity'), 'the pavilion');
    for (const a of courts) for (const b of o.elements.filter(e => ['drive', 'parking', 'pond'].includes(e.kind))) assert.ok(!S.rectsOverlap({ poly: S.shapeOf(a) }, { poly: S.shapeOf(b) }, 0.5), 'no drive, parking or pond on a court');
    assert.equal(C.customStats(pl).courts, 8); }
  // a re-fit: the courts are pinned, the rest lays out round them
  const o = opts[0], pl = { ...of(plan, o), recipe: o.recipe }, rf = L.refit(pl, {}), courts = rf.elements.filter(e => e.kind === 'court');
  assert.equal(courts.length, 8, 're-fit keeps the courts'); assert.deepEqual(courts.map(c => [c.x, c.y]), o.elements.filter(e => e.kind === 'court').map(c => [c.x, c.y]), 'where they were');
  assert.equal(S.check({ ...pl, elements: rf.elements }).filter(i => i.level === 'bad').length, 0, 're-fit passes the checks'); }
// commons on a narrow lot: fewer courts when all 8 won't go, and it says so
{ const { plan, opts } = lay(PICKLE, 'narrow'); assert.ok(opts.length >= 1);
  const o = opts[0], { pl } = sound('pickleball narrow', plan, o), n = o.elements.filter(e => e.kind === 'court').length;
  assert.ok(n >= 2 && n < 8, 'fewer courts: ' + n); assert.ok(o.notes.some(t => t === 'Room for ' + n + ' of the 8 pickleball courts asked for.'), o.notes.join(' | '));
  assert.equal(C.customStats(pl).recipe.outdoor[0].count, n, 'the plan’s recipe holds what was drawn'); assert.equal(S.metrics(pl).required, Math.ceil(4 * n + S.gfaOf(o.elements.find(e => e.custom && e.use === 'other')) * 3 / 1000 - 0.01), 'and parks what was drawn'); }
// row: a car wash on the narrow lot, its depth as the recipe gives it
{ const { plan, opts } = lay(WASH, 'narrow'); assert.ok(opts.length >= 2);
  for (const [i, o] of opts.entries()) { const { B } = sound('car wash narrow #' + i, plan, o); assert.equal(B[0].name, 'Express car wash'); assert.ok(Math.abs(Math.min(B[0].w, B[0].d) - 30) < 1, 'the recipe’s depth: ' + B[0].d); } }
// pads: a school's two buildings on FM 362
{ const { plan, opts } = lay(SCHOOL, 'FM 362'); assert.ok(opts.length >= 2);
  for (const [i, o] of opts.entries()) { const { B, m } = sound('school FM 362 #' + i, plan, o); assert.equal(B.length, 2, 'two buildings'); assert.deepEqual(B.map(e => e.name).sort(), ['Classroom building', 'Gym']); assert.equal(m.required, 75); } }
// yard: an RV park on FM 362 (rows of sites both sides of the aisles) and on the 3 acre lot (fewer, said)
{ const { plan, opts } = lay(RV, 'FM 362'); assert.ok(opts.length >= 2);
  for (const [i, o] of opts.entries()) { const { pl, m, B } = sound('RV park FM 362 #' + i, plan, o), rv = o.elements.filter(e => e.rv), n = rv.reduce((t, e) => t + S.stalls(e).count, 0);
    assert.equal(B[0].name, 'Office / clubhouse'); assert.ok(rv.every(e => e.sw === 24 && e.sd === 55 && e.site === 'RV site' && e.aiSized), 'sites the recipe’s size');
    assert.ok(n >= 50, 'the RV sites: ' + n); if (n < 60) assert.ok(o.notes.some(t => t === 'Room for ' + n + ' of the 60 RV sites asked for.')); assert.ok(rv.some(e => e.row === 1) && rv.some(e => e.row === -1), 'rows facing both ways (back to back)');
    assert.equal(m.required, Math.ceil(0.1 * n + 2400 * 4 / 1000 - 0.01), 'visitors by the sites drawn, the office by its size'); assert.equal(C.customStats(pl).sites, n);
    assert.equal(S.labelOf(rv[0], pl.program).size, S.stalls(rv[0]).count + ' RV sites'); } }
{ const { plan, opts } = lay(RV, '3 ac'), o = opts[0]; sound('RV park 3 ac', plan, o); const n = o.elements.filter(e => e.rv).reduce((t, e) => t + S.stalls(e).count, 0); assert.ok(n >= 10 && n < 60); assert.ok(o.notes[0] === 'Room for ' + n + ' of the 60 RV sites asked for.'); }
// a commons with nowhere for its ground: the building alone, saying so
{ const prog = C.programOf(C.recipeIn({ ...PICKLE, outdoor: [{ kind: 'green', label: 'Polo field', w: 400, d: 300, count: 1 }] })), plan = { origin: [-95.8, 29.78], setbacks: { ...S.SETBACKS }, elements: [], ...LOTS['3 ac'], program: prog };
  const o = L.layoutOptions(plan, prog, {})[0]; assert.ok(o.notes[0].startsWith('No room on this site for the polo field'), o.notes[0]); assert.equal(S.check(of(plan, o)).filter(i => i.level === 'bad').length, 0); }

// ---------- the team library ----------
{ const t = C.teamTypeIn({ id: 'bt-1', name: '  Our pickleball club ', recipe: PICKLE, by: 'Matthew', at: '2026-10-19T15:00:00Z', w: 'x' });
  assert.deepEqual([t.name, t.w, t.d, t.floors, t.use, t.source, t.recipe.name, t.by], ['Our pickleball club', 100, 60, 1, 'other', 'ai', 'Our pickleball club', 'Matthew'], 'cleaned, its size from its recipe');
  assert.equal(C.teamTypeIn({ id: '../x', name: 'a' }), null); assert.equal(C.teamTypeIn({ id: 'abc', name: '' }), null);
  const lt = C.libraryTypeOf(t); assert.deepEqual([lt.id, lt.group, lt.custom, lt.aiSized], ['team:bt-1', 'Team', 'Our pickleball club', true]); assert.match(lt.name, /^Our pickleball club · 100 × 60 ft/);
  const ai = C.teamTypesForAI([t, { id: 'nope' }, ...Array(60).fill(0).map((_, i) => ({ ...t, id: 'bt-x' + i }))]); assert.ok(ai.length >= 20 && ai.length <= 30 && JSON.stringify(ai).length <= 12600, 'at most 30, kept short, go to the AI: ' + ai.length); assert.deepEqual(Object.keys(ai[0].recipe), ['pattern', 'buildings', 'outdoor', 'sites', 'parking', 'figures']);
  const e = { id: 'b1', kind: 'building', x: 0, y: 0, w: 90, d: 50, rot: 0, use: 'retail', floors: 1, name: 'Building A', note: '' }, h = C.teamTypeFrom(e, { use: 'retail' }, { id: 'bt-2', by: 'Ana' });
  assert.deepEqual([h.name, h.w, h.d, h.use, h.source, h.recipe], ['Building A', 90, 50, 'retail', 'hand', null], 'a building sized by hand');
  const pr = C.programOf(C.recipeIn(DAYCARE)), d = C.teamTypeFrom({ ...e, use: 'other', custom: 'Daycare', aiSized: true }, pr, { id: 'bt-3' }); assert.deepEqual([d.name, d.source, d.recipe.name], ['Daycare', 'ai', 'Daycare'], 'part of an AI-crafted type: with its recipe'); }
// api/buildingtypes: saved, renamed (last edit wins), deleted, the passcode, and no table yet (this device only)
{ const store = []; let table = true; const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(String(url)), m = opts.method || 'GET'; if (!table) return new Response('{"code":"42P01","message":"relation \\"public.site_building_types\\" does not exist"}', { status: 404 });
    assert.equal(u.pathname, '/rest/v1/site_building_types');
    if (m === 'GET') { const ids = u.searchParams.get('id'); return Response.json(ids ? store.filter(r => ids.slice(4, -1).split(',').map(x => x.replace(/"/g, '')).includes(r.id)) : store.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at))); }
    for (const r of JSON.parse(opts.body)) { const i = store.findIndex(x => x.id === r.id); if (i >= 0) store[i] = r; else store.push(r); }
    return new Response(null, { status: 201 });
  };
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  const { default: handler } = await import('../api/buildingtypes.js');
  const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
  const call = async (method, body, headers = {}) => { const res = mock(); await handler({ method, body, headers: { 'x-forwarded-for': '8.8.9.9', ...headers } }, res); return res; };
  const doc = { id: 'bt-pickle', name: 'Pickleball club', recipe: PICKLE, updated: '2026-10-19T10:00:00Z', at: '2026-10-19T10:00:00Z' };
  let res = await call('POST', { name: 'Matthew', types: [doc, { id: '../x', name: 'bad' }, { id: 'bt-junk', name: 'Junk', recipe: { name: 'x', buildings: [] }, w: 1e9 }] });
  assert.equal(res.code, 200); assert.equal(res.body.saved, 2, 'bad id dropped; a bad recipe dropped, the type kept'); assert.equal(store.find(r => r.id === 'bt-junk').doc.recipe, null); assert.equal(store.find(r => r.id === 'bt-junk').doc.w, 600, 'sizes in bounds');
  res = await call('POST', { types: [{ ...doc, name: 'Old name', updated: '2026-10-18T10:00:00Z' }] }); assert.equal(res.body.skipped, 1, 'an older copy doesn’t overwrite');
  res = await call('GET'); res = await call('POST', { name: 'Ana', types: [{ ...res.body.types.find(t => t.id === 'bt-pickle'), name: 'Katy pickleball club', updated: '2026-10-19T11:00:00Z' }] }); assert.equal(res.body.saved, 1, 'a rename (of the team’s copy, as a device holds it)');
  res = await call('GET'); assert.deepEqual(res.body.types.map(t => t.name).sort(), ['Junk', 'Katy pickleball club']); const k = res.body.types.find(t => t.id === 'bt-pickle');
  assert.equal(k.by, 'Matthew', 'who saved it'); assert.equal(store.find(r => r.id === 'bt-pickle').updated_by, 'Ana', 'who changed it last'); assert.equal(k.recipe.outdoor[0].count, 8, 'the recipe kept'); assert.equal(k.recipe.name, 'Katy pickleball club');
  res = await call('POST', { deletes: ['bt-junk', '../etc'] }); assert.equal(res.body.deleted, 1); res = await call('GET'); assert.deepEqual(res.body.deleted, ['bt-junk'], 'a tombstone for other devices'); assert.equal(res.body.types.length, 1);
  res = await call('PUT', {}); assert.equal(res.code, 405);
  process.env.FIELD_ACCESS_CODE = 'gate'; res = await call('GET'); assert.equal(res.code, 401); assert.equal(res.body.passcode, true); res = await call('GET', null, { 'x-field-code': 'gate' }); assert.equal(res.code, 200); delete process.env.FIELD_ACCESS_CODE;
  table = false; res = await call('GET'); assert.equal(res.code, 503); assert.equal(res.body.local, true, 'no table yet: the browser keeps its types on the device'); res = await call('POST', { types: [doc] }); assert.equal(res.code, 503); assert.equal(res.body.local, true);
  delete process.env.SUPABASE_SECRET_KEY; table = true; res = await call('GET'); assert.equal(res.code, 503); assert.equal(res.body.local, true, 'no secret key: this device only');
  globalThis.fetch = fetch0; }

// ---------- the AI step, with the model stubbed ----------
{ const fetch0 = globalThis.fetch; let reply = null, sent = null, fail = false;
  globalThis.fetch = async (url, opts = {}) => { if (String(url).includes('/models/')) return Response.json({ id: 'm' }); sent = JSON.parse(opts.body); if (fail) return Response.json({ error: { message: 'boom' } }, { status: 400 }); return Response.json({ choices: [{ message: { content: JSON.stringify(reply()) } }] }); };
  const { default: handler, SCHEMA, SYSTEM } = await import('../api/siteplan.js');
  const strict = (sc, at) => { if (sc?.type === 'object' && sc.properties) { assert.deepEqual(sc.required.slice().sort(), Object.keys(sc.properties).sort(), 'strict schema: ' + at); for (const [k, v] of Object.entries(sc.properties)) strict(v, at + '.' + k); } if (sc?.items) strict(sc.items, at + '[]'); };
  strict(SCHEMA, 'program'); assert.deepEqual(SCHEMA.properties.custom.properties.pattern.enum.slice(0, 4), ['row', 'pads', 'commons', 'yard']); assert.match(SYSTEM, /daycare/); assert.match(SYSTEM, /teamTypes/);
  process.env.OPENAI_API_KEY = 'sk-test'; const mock = () => { const r = { code: 200, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader() {} }; return r; };
  const call = async body => { const res = mock(); await handler({ method: 'POST', body, headers: { 'x-forwarded-for': '7.7.9.' + Math.floor(Math.random() * 200) } }, res); return res; };
  const base = { use: 'other', gfa: 10000, floors: 1, units: null, buildings: null, ratio: null, perUnit: null, depth: null, detentionPct: null, storm: null, truck: null, through: null, compare: null, trash: null, entrances: null, product: null, extras: [], storage: { climateSf: null, driveSf: null, rv: null },
    foodtrucks: { trucks: null, pavilionSf: null, bar: null, barSf: null, playground: null, perTruck: null }, fuel: { pumps: null, storeSf: null, wash: null, vac: null, canopy: null, truckStop: null }, setbacks: { front: null, side: null, rear: null, paving: null }, zones: [], summary: 'A daycare for 120 children.', assumptions: ['85 sf a child inside'] };
  // a good recipe: the program is the custom type; the team's saved types went to the model
  reply = () => ({ ...base, custom: DAYCARE });
  const team = [{ id: 'bt-pickle', name: 'Our pickleball club', recipe: PICKLE }];
  let res = await call({ prompt: 'a daycare for 120 children with a playground', site: { acres: 3 }, teamTypes: team });
  assert.equal(res.code, 200); const p = res.body.program; assert.equal(p.use, 'other'); assert.equal(p.custom.name, 'Daycare'); assert.equal(p.gfa, 10625); assert.equal(p.custom.outdoor[0].count, 1);
  const user = JSON.parse(sent.messages[1].content); assert.equal(user.teamTypes[0].name, 'Our pickleball club'); assert.equal(user.teamTypes[0].recipe.outdoor[0].count, 8, 'the saved recipe goes to the model'); assert.ok(user.libraryTypes.includes('retail-daycare-10-000-sf'));
  assert.deepEqual(res.body.assumptions, ['85 sf a child inside']);
  // "another one like our pickleball club": the model reuses the saved recipe
  reply = () => ({ ...base, gfa: 6000, custom: { ...PICKLE, name: 'Our pickleball club' }, summary: 'Another pickleball club like the team’s.' });
  res = await call({ prompt: 'another one like our pickleball club', site: { acres: 3 }, teamTypes: team }); assert.equal(res.body.program.custom.name, 'Our pickleball club'); assert.equal(res.body.program.custom.outdoor[0].count, 8);
  // nonsense: a plain building, with a note
  reply = () => ({ ...base, custom: { name: 'Hoverboard arena', pattern: 'teleport', buildings: [{ label: 'x', type: 'no-such-type', w: null, d: null, floors: null, count: null }], outdoor: [], sites: { label: null, w: null, d: null, count: null }, parking: { per: 'warp', rate: null, basis: null, label: null, plus1k: null }, figures: [] } });
  res = await call({ prompt: 'a hoverboard arena', site: { acres: 3 } }); assert.equal(res.code, 200); assert.equal(res.body.program.use, 'other'); assert.equal(res.body.program.custom, undefined, 'no recipe');
  assert.match(res.body.assumptions[0], /recipe for “Hoverboard arena” didn’t make sense, so it’s laid out as a plain building/);
  // a built-in use: custom left alone
  reply = () => ({ ...base, use: 'retail', gfa: 20000, custom: DAYCARE }); res = await call({ prompt: '20,000 sf retail', site: { acres: 3 } }); assert.equal(res.body.program.use, 'retail'); assert.equal(res.body.program.custom, undefined, 'a recipe only with use other');
  // the review: a revised program keeps the recipe unless the model rewrote it
  reply = () => ({ reviews: [{ option: 0, score: 80, verdict: 'ok', strengths: [], problems: [] }], ranking: [0], revise: true, program: { ...base, gfa: 12000, custom: { name: null, pattern: null, buildings: [], outdoor: [], sites: { label: null, w: null, d: null, count: null }, parking: { per: null, rate: null, basis: null, label: null, plus1k: null }, figures: [] } }, params: { fill: null, streets: null, form: null, storm: null }, why: 'Bigger', summary: 'ok' });
  res = await call({ mode: 'review', prompt: 'a daycare', program: C.programOf(C.recipeIn(DAYCARE)), round: 1, rounds: 2, options: [{ name: 'L1', metrics: {}, issues: [], notes: [] }] });
  assert.equal(res.code, 200); assert.equal(res.body.program.custom.name, 'Daycare', 'the revised program keeps the daycare');
  // the AI fails: an error the browser handles by reading the words (as for any program)
  fail = true; res = await call({ prompt: 'a daycare', site: { acres: 3 } }); assert.equal(res.code, 502); assert.match(res.body.error, /didn’t answer/); fail = false;
  globalThis.fetch = fetch0; delete process.env.OPENAI_API_KEY; }
console.log('custom types ok');
