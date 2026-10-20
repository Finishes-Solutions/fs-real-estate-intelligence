// Engineering sheets (lib/sheets/eng.mjs): every S / M / P / E / FP / FA / T sheet of every realistic fixture renders
// without NaN, undefined or a failure box, stays a sensible size, and the layout rules behind them hold: smoke alarms in
// every bedroom, receptacles every 12 ft, tonnage by area, IPC restroom counts, sprinkler heads by hazard.
import assert from 'node:assert/strict';
import { ctxFor, CASES } from './helpers/setctx.mjs';
import * as P from '../lib/planset.mjs';
import * as E from '../lib/sheets/eng.mjs';
import { occupantLoad, RESIDENTIAL } from '../lib/plandesign.mjs';

const KINDS = Object.keys(E.RENDERERS);
assert.deepEqual(KINDS.sort(), ['e-notes', 'e-oneline', 'e-plan', 'fa-plan', 'fp-sprinkler', 'm-hvac', 'm-notes', 'p-notes', 'p-plan', 'p-riser', 's-details', 's-found', 's-frame', 's-notes', 't-bldg', 't-notes']);

// ---------- every sheet of every fixture ----------
const ctxs = {};
for (const name of Object.keys(CASES)) {
  const ctx = ctxs[name] = ctxFor(name), mine = ctx.sheets.filter(s => KINDS.includes(s.kind));
  assert.ok(mine.length >= 10, name + ': engineering sheets in the set');
  for (const sh of mine) {
    const html = P.sheetPage(ctx, sh), where = name + ' ' + sh.number + ' ' + sh.kind;
    assert.ok(!/NaN|undefined|Infinity/.test(html), where + ': no NaN / undefined / Infinity');
    assert.ok(!/couldn’t be drawn|isn’t drawn yet|couldn’t be laid out|Design not available/.test(html), where + ': drawn');
    assert.ok(html.length < 1.5e6, where + ': under 1.5 MB (' + html.length + ')');
    assert.ok(/Basis of design/.test(html), where + ': says it is a schematic basis of design');
    // printable size: no SVG pattern fills and no stroked text halos (Chromium prints both as megabytes of PDF)
    const body = E.RENDERERS[sh.kind](ctx, { ...sh }); assert.ok(!/fill="url\(#/.test(body) && !/paint-order/.test(body), where + ': no pattern fills or stroked text');
    if (sh === mine.find(x => x.kind === sh.kind)) { const s2 = { ...sh, scale: '' }; E.RENDERERS[sh.kind](ctx, s2); assert.match(s2.scale, sh.typeId ? /^\d+\/\d+" = 1'-0"$/ : /N\.T\.S\.|As noted/, where + ': sets its scale'); }
  }
}
// the per-type sheets are there for each type, sprinkler sheets only for sprinklered types
{
  const c = ctxs.sfr; assert.equal(c.sheets.filter(s => s.kind === 'm-hvac').length, c.types.length);
  assert.equal(ctxs.industrial.sheets.filter(s => s.kind === 'fp-sprinkler').length, 1);
  assert.equal(ctxs.townhomes.sheets.filter(s => s.kind === 'fp-sprinkler').length, 0);
}
// Claude's notes are used when present, and a missing design draws a plain box instead of failing
{
  const c = ctxFor('restaurant', { disc: { mechanical: { notes: ['Custom mechanical note from the brief.'], criteria: [] } } });
  const html = P.sheetPage(c, c.sheets.find(s => s.kind === 'm-notes'));
  assert.ok(html.includes('Custom mechanical note from the brief.'));
  const c2 = ctxFor('retail'); c2.designs = {};
  for (const sh of c2.sheets.filter(s => KINDS.includes(s.kind))) { const html2 = P.sheetPage(c2, sh); assert.ok(!/NaN|undefined|couldn’t be drawn/.test(html2), sh.number); if (sh.typeId) assert.ok(/Design not available/.test(html2), sh.number + ' says the design is missing'); }
}

// a building three times the fixture warehouse (over 1,500 heads): a typical bay of heads, every sheet still small
{
  const c = ctxFor('industrial'), d = c.designs.A, k = 3, sc = o => { for (const key of ['x', 'y', 'w', 'd', 'x1', 'y1', 'x2', 'y2']) if (key in o) o[key] *= k; };
  d.rooms.forEach(r => { sc(r); r.area = r.w * r.d; }); d.doors.forEach(sc); d.windows.forEach(sc); d.W *= k; d.D *= k; c.types[0] = { ...c.types[0], W: d.W, D: d.D, unitGsf: d.W * d.D, buildingGsf: d.W * d.D };
  for (const sh of c.sheets.filter(s => KINDS.includes(s.kind))) {
    const html = P.sheetPage(c, sh); assert.ok(!/NaN|undefined|Infinity|couldn’t be/.test(html) && html.length < 1.5e6, 'huge warehouse ' + sh.number + ' (' + html.length + ')');
    if (sh.kind === 'fp-sprinkler') assert.ok(/TYPICAL BAY/.test(html), 'a typical bay of heads');
  }
}

// buildings that aren't rectangles (an L and a stepped front): the slab edge follows the outline, and nothing inside the
// building lands in a notch or runs through one
{
  const c = ctxs.shaped, shapes = c.types.map(t => c.designs[t.id].shape);
  assert.ok(shapes.includes('L-shape') && shapes.includes('stepped front'), 'shaped fixture: ' + shapes);
  for (const t of c.types) {
    const d = c.designs[t.id], sh = c.sheets.find(s => s.kind === 's-found' && s.typeId === t.id), html = E.RENDERERS['s-found'](c, { ...sh });
    const m = html.match(/<path d="([^"]+)" class="slab-edge"/); assert.ok(m, t.id + ': slab edge drawn');
    assert.equal(m[1].split('L').length, d.footprint.length, t.id + ': slab edge has a corner for every outline corner');
    if (d.shape === 'L-shape') assert.ok(d.footprint.length >= 6, 'the L has six corners');
    assert.ok(E.notchList(d).length >= 1, t.id + ': has notches');
    for (const r of d.rooms) { const G = E.sprinklerGrid(r, E.hazardOf(d.use, r.type)); for (const x of G.xs) for (const y of G.ys) assert.ok(!E.inNotch(d, x, y), t.id + ': sprinkler head in a notch'); }
    for (const sy of E.hvacLayout(t, d).systems) assert.ok(!E.inNotch(d, sy.unit.x, sy.unit.y) && E.onOrIn(d, sy.unit.x, sy.unit.y), t.id + ': ' + sy.tag + ' on the roof');
    // runs between far corners of the building stay inside it
    const pts = d.rooms.map(r => ({ x: r.x + r.w / 2, y: r.y + r.d / 2 })), runs = E.treeRuns(d, pts[0], pts.slice(1));
    for (const [x1, y1, x2, y2] of runs) for (let u = 0; u <= 1; u += 0.1) assert.ok(E.onOrIn(d, x1 + (x2 - x1) * u, y1 + (y2 - y1) * u, 0.3), t.id + ': run through open ground at ' + [x1, y1, x2, y2]);
    for (const side of ['front', 'back']) { const w = E.wallSpot(d, { x: d.W / 2, y: side === 'front' ? 0 : d.D }, [side]); assert.ok(E.edgesOf(d).some(e => e.side === side && Math.abs((e.x2 - e.x1) * (w.y - e.y1) - (e.y2 - e.y1) * (w.x - e.x1)) < 1e-6 && Math.min(e.x1, e.x2) - 1e-6 <= w.x && w.x <= Math.max(e.x1, e.x2) + 1e-6), t.id + ': wall spot on a ' + side + ' edge of the outline'); }
  }
  const L = c.designs[c.types.find(t => c.designs[t.id].shape === 'L-shape').id], cl = E.clipLine(L, 25, true); assert.deepEqual(cl, [[0, 50]], 'a line through the L stops at the notch');
  assert.equal(E.insetOutline(L, 1).length, L.footprint.length);
}

// ---------- the rules ----------
const room = (type, w, d, x = 0, y = 0, o = {}) => ({ id: type + x + '_' + y, name: type, type, floor: 1, x, y, w, d, area: w * d, ext: { front: y === 0, back: false, left: x === 0, right: false }, ...o });

// receptacles: a 30 ft living room wall gets at least three, no point more than 6 ft from one (NEC 210.52)
{
  const r = room('living', 30, 15), pts = E.receptacles(r, { res: true }), back = pts.filter(p => p.side === 'back').map(p => p.x).sort((a, b) => a - b);
  assert.ok(back.length >= 3, 'three or more along a 30 ft wall');
  const gaps = [back[0], ...back.slice(1).map((x, i) => x - back[i]), 30 - back[back.length - 1]];
  assert.ok(back[0] <= 6 && 30 - back[back.length - 1] <= 6 && gaps.slice(1, -1).every(g => g <= 12), 'no point along the wall more than 6 ft from one');
  assert.ok(E.receptacles(room('bath', 8, 10), { res: true }).every(p => p.kind === 'gfci'), 'GFCI in baths');
  assert.ok(E.receptacles(room('kitchen', 14, 12), { res: true }).every(p => p.kind === 'gfci'), 'GFCI in kitchens');
  assert.equal(E.receptacles(room('closet', 4, 6), { res: true }).length, 0, 'none in closets');
  const door = { orient: 'h', x1: 13.5, y1: 15, x2: 16.5, y2: 15, width: 3 };
  assert.ok(E.receptacles(r, { res: true, doors: [door] }).every(p => !(p.side === 'back' && p.x > 13.4 && p.x < 16.6)), 'never in a doorway');
}
// smoke alarms in every bedroom of every home design, and at least one on every floor; CO where there's gas or a garage
for (const name of ['sfr', 'townhomes', 'duplex']) for (const d of Object.values(ctxs[name].designs)) {
  const al = E.alarms(d);
  for (const r of d.rooms.filter(q => ['bedroom', 'primary_bedroom'].includes(q.type))) assert.ok(al.some(a => a.kind === 'smoke' && a.room === r.id), name + ' ' + d.typeId + ': smoke alarm in ' + r.name);
  for (let f = 1; f <= d.floors; f++) assert.ok(al.some(a => a.floor === f && a.kind === 'smoke'), name + ': smoke alarm on floor ' + f);
  if (d.rooms.some(r => r.type === 'garage')) assert.ok(al.some(a => a.kind === 'co'), name + ': CO alarm with an attached garage');
}
assert.equal(E.alarms(ctxs.retail.designs.A).length, 0, 'no dwelling alarms in a shell');
// lights: troffers on a grid in commercial rooms, high-bays in a warehouse, one fixture in a bedroom
assert.equal(E.lights(room('bedroom', 12, 12), true).length, 1);
assert.ok(E.lights(room('tenant', 40, 80), false).length >= 30 && E.lights(room('tenant', 40, 80), false).every(p => p.kind === 'fixture2x4'));
assert.ok(E.lights(room('warehouse', 300, 200), false).length >= 80);
// HVAC: a 2,000 sf house needs about 3.5–4 tons; a home system never tops 5 tons nor serves more than two floors
{
  const t = E.roundTons(E.coolingTons([room('living', 40, 50)], 'sfr')); assert.ok(t >= 3.5 && t <= 4, '2,000 sf house: ' + t + ' tons');
  assert.equal(E.roundTons(E.coolingTons([room('tenant', 50, 70)], 'retail')), 10, 'retail 3,500 sf at 350 sf/ton');
  assert.ok(E.coolingTons([room('dining_room', 50, 40)], 'restaurant') >= 10, 'restaurant dining at 200 sf/ton');
  assert.equal(E.coolingTons([room('warehouse', 300, 200)], 'industrial'), 0, 'warehouse not conditioned');
  for (const name of ['sfr', 'townhomes', 'duplex']) for (const t2 of ctxs[name].types) {
    const H = E.hvacLayout(t2, ctxs[name].designs[t2.id]);
    assert.ok(H.systems.length >= 1 && H.systems.every(s => s.tons <= 5 && s.floors.length <= 2 && s.cfm === s.tons * 400), name + ' ' + t2.id + ': split systems');
  }
  const ind = ctxs.industrial, H = E.hvacLayout(ind.types[0], ind.designs.A);
  assert.ok(H.vents.length >= 6 && H.systems.every(s => s.kind === 'rtu'), 'warehouse: ventilation fans, office on a rooftop unit');
  const rt = ctxs.retail, HR = E.hvacLayout(rt.types[0], rt.designs.A);
  assert.ok(HR.systems.length >= E.tenantsOn(rt.designs.A, 1).length, 'a rooftop unit per tenant at least');
  assert.equal(E.diffusers(room('closet', 4, 6), true).length, 0); assert.equal(E.diffusers(room('bedroom', 12, 13), true).length, 1); assert.equal(E.diffusers(room('living', 20, 20), true).length, 3);
}
// plumbing: IPC Table 2902.1 for a 40,000 sf retail (M) building at 60 sf a person, and what the fixture designs provide
{
  const L = Math.ceil(40000 / 60), r = E.ipcRequired('M', L);
  assert.ok(r.wc >= 2 && r.lav >= 2 && r.df >= 1 && r.ss === 1, '40,000 sf mercantile: ' + JSON.stringify(r));
  assert.deepEqual(E.ipcRequired('M', 80), { load: 80, wc: 1, lav: 1, df: 1, ss: 1 }, 'small mercantile may share one room');
  assert.equal(E.ipcRequired('B', 120).wc, 2 * (2 + 1), 'business: 1 per 25 for the first 50 a side, then 1 per 50');
  assert.ok(E.ipcRequired('A-2', 300).wc >= 4, 'restaurant: 1 per 75');
  for (const name of ['retail', 'restaurant', 'medical', 'office3', 'fuel', 'church', 'industrial']) for (const t of ctxs[name].types) {
    const d = ctxs[name].designs[t.id], need = E.ipcRequired(t.occupancy, occupantLoad(d).total), has = E.fixturesProvided(d);
    assert.ok(has.ss >= need.ss && has.df >= Math.min(1, need.df), name + ' ' + t.id + ': a service sink and a drinking fountain');
    if (name === 'retail') assert.ok(has.wc >= need.wc && has.lav >= need.lav, 'retail ' + t.id + ' meets IPC');
  }
  const ft = E.fixtureTotals({ use: 'sfr', rooms: [room('bath', 8, 10), room('kitchen', 12, 12, 10), room('laundry', 6, 8, 30)] });
  assert.deepEqual([ft.counts.WC, ft.counts.LAV, ft.counts.TUB, ft.counts.KS, ft.counts.DW, ft.counts.WB, ft.counts.HB], [1, 1, 1, 1, 1, 1, 2]);
  assert.ok(Math.abs(ft.dfu - (3 + 1 + 2 + 2 + 2 + 2)) < 1e-9, 'drainage fixture units add up');
  for (const name of ['sfr', 'restaurant', 'retail']) for (const t of ctxs[name].types) assert.ok(E.waterHeaters(t, ctxs[name].designs[t.id]).length >= 1, name + ': a water heater');
  assert.ok(E.fixturesFor({ type: 'living', name: 'Living / kitchen', w: 16, d: 18 }, 'townhomes').includes('KS'), 'a kitchen in a combined room');
}
// sprinklers: 10,000 sf of ordinary hazard needs about 77 heads or more (130 sf a head, 15 ft max)
{
  const g = E.sprinklerGrid({ x: 0, y: 0, w: 100, d: 100 }, 'oh1'); assert.ok(g.count >= 77, 'ordinary hazard: ' + g.count + ' heads');
  assert.ok(g.sx <= 15 && g.sy <= 15 && g.sx * g.sy <= 130);
  const l = E.sprinklerGrid({ x: 0, y: 0, w: 100, d: 100 }, 'light'); assert.ok(l.count >= 45 && l.sx * l.sy <= 225 && l.count < g.count);
  const e = E.sprinklerGrid({ x: 0, y: 0, w: 300, d: 217 }, 'esfr'); assert.ok(e.sx <= 12 && e.sy <= 12 && e.sx * e.sy <= 100);
  assert.equal(E.hazardOf('industrial', 'warehouse'), 'esfr'); assert.equal(E.hazardOf('retail', 'tenant'), 'oh2'); assert.equal(E.hazardOf('office', 'tenant'), 'light'); assert.equal(E.hazardOf('restaurant', 'commercial_kitchen'), 'oh1');
  assert.equal(E.hornStrobes(room('restroom', 8, 10)).length, 1); assert.equal(E.hornStrobes(room('tenant', 100, 100)).length, 4); assert.equal(E.hornStrobes(room('closet', 4, 4)).length, 0);
}
// electrical: panels and loads
{
  for (const name of ['sfr', 'townhomes', 'duplex']) for (const t of ctxs[name].types) {
    const d = ctxs[name].designs[t.id], L = E.loadCalc(t, d), [p] = E.panelSchedule(t, d);
    assert.ok([100, 150, 200, 320, 400].includes(L.service) && L.total > 10000 && L.amps > 0, name + ' ' + t.id + ': service ' + L.service);
    assert.ok(p.circuits.filter(c => /small-appliance/.test(c.desc)).reduce((s, c) => s + c.qty, 0) >= 2, 'two kitchen small-appliance circuits');
    assert.ok(p.circuits.some(c => /condensing/.test(c.desc)) && (!d.rooms.some(r => r.type === 'laundry') || p.circuits.some(c => /Laundry/.test(c.desc))), 'laundry and A/C circuits');
  }
  const big = E.loadCalc(ctxs.church.types[0], ctxs.church.designs.A), rt = E.loadCalc(ctxs.retail.types[0], ctxs.retail.designs.A);
  assert.ok(big.service >= 400 && rt.service >= 400 && /3Φ/.test(rt.volts), 'commercial: 3-phase, 400 A and up');
  assert.equal(E.panelSchedule(ctxs.retail.types[0], ctxs.retail.designs.A).length, E.tenantsOn(ctxs.retail.designs.A).length, 'a panel a tenant');
  assert.equal(E.wireFor(200), '#3/0'); assert.equal(E.wireFor(100), '#3'); assert.match(E.wireFor(800), /^3 sets/);
}
// structure and the placing helpers
{
  const b = E.beamLines([10, 12, 30, 31, 44], 54, 18); let last = 0; for (const x of [...b, 54]) { assert.ok(x - last <= 18 + 1e-9, 'beam spacing ≤ 18 ft'); last = x; }
  assert.ok(b.includes(12) || b.includes(10), 'prefers existing walls');
  const G = E.structGrid(360, 217, 40); assert.ok(G.sx <= 40 && G.sy <= 40 && G.xs.length === 10);
  const F = E.footingSize(1600, 40); assert.ok(F.side >= 6 && F.side <= 7 && F.kips === 64, 'footing ' + JSON.stringify(F));
  assert.ok(E.trunkRuns({ x: 0, y: 0 }, [{ x: 10, y: 5 }, { x: 20, y: -5 }]).every(([x1, y1, x2, y2]) => x1 === x2 || y1 === y2), 'runs are orthogonal');
  for (const name of ['townhomes', 'retail', 'industrial']) { const d = Object.values(ctxs[name].designs)[0], sp = E.wallSpot(d, { x: d.W / 2, y: 0 }); assert.ok(!d.doors.some(o => o.floor === 1 && o.orient === 'h' && Math.abs(o.y1 - sp.y) < 0.1 && sp.x > Math.min(o.x1, o.x2) - 0.5 && sp.x < Math.max(o.x1, o.x2) + 0.5), name + ': wall spot clear of doors'); }
  assert.equal(E.dataOutlets(room('bedroom', 12, 12), true), 1); assert.equal(E.dataOutlets(room('office', 20, 20), false), 4); assert.equal(E.wapCount(3000, true), 2);
}
console.log('eng sheets ok');
